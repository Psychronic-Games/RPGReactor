/**
 * Escape in a dialog opened from a Database page closes that dialog only.
 *
 * These dialogs left the focus on the button that opened them, inside the
 * Database window, so Escape reached the Database's own Escape (Cancel): the
 * whole Database closed, or asked to discard every unsaved edit. The EXP curve
 * dialog answered Escape not at all. Each now installs the dialog keys on its
 * overlay with its own close, enters (the focus moves into it) and gives the
 * focus back when it closes. The real-input check is the sweep in
 * scratchpad/user-path-sweeps/db-edits/escape-audit.cjs.
 *
 * Also: the Skill Type dropdown offers None, the type of Attack and Guard, so
 * the field shows what is stored instead of the first named type.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const databaseDir = path.resolve(__dirname, '..', 'src', 'database');
const read = file => fs.readFileSync(path.join(databaseDir, file), 'utf8');

/** The source of `name(` up to the next method at the same indentation. */
function method(source, name) {
    const start = source.indexOf(`\n    ${name}(`);
    assert.ok(start >= 0, `${name} is still a method`);
    const next = source.slice(start + 1).search(/\n    (?:static )?[A-Za-z_$][\w$]*\([^)]*\) \{/);
    return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

const DIALOGS = [
    ['DatabaseClassEditor.js', 'showLearningEditorModal', 'overlay', 'close'],
    ['DatabaseClassEditor.js', 'showExpCurveModal', 'overlay', 'closeExpModal'],
    ['DatabaseEnemyEditor.js', 'showActionEditorModal', 'overlay', 'close'],
    ['DatabaseTroopEditor.js', 'showConditionsModal', 'modal', 'close'],
    ['DatabaseSystem1Editor.js', 'showCommandWindowModal', 'overlay', 'close'],
    ['DatabaseSystem1Editor.js', 'showTitleImagePicker', 'overlay', 'close']
];

test('each Database dialog takes the keys: Escape runs its own close, focus enters and returns', () => {
    for (const [file, name, layer, close] of DIALOGS) {
        const body = method(read(file), name);
        const register = new RegExp(`RRKeyboardNavigation\\?\\.modal\\(${layer}, \\{ onEscape: ${close}\\b`);
        assert.match(body, register, `${file} ${name}: Escape closes the dialog itself`);
        assert.match(body, new RegExp(`${layer}\\._rrModalKeys\\?\\.enter\\(\\)`), `${file} ${name}: the focus moves into the dialog`);
        assert.match(body, new RegExp(`${layer}\\._rrModalKeys\\?\\.leave\\(\\)`), `${file} ${name}: the focus goes back to the opener`);
    }
});

test('the Generate Curve dialog inside Parameter Curves owns its Escape', () => {
    const source = read('DatabaseClassEditor.js');
    const start = source.indexOf("modal.className = 'rr-modal param-curve-modal'");
    const end = source.indexOf('recompute();\n    }', start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.match(body, /RRKeyboardNavigation\?\.modal\(overlay, \{ onEscape: close\b/);
    assert.match(body, /overlay\._rrModalKeys\?\.enter\(\)/);
    assert.match(body, /overlay\._rrModalKeys\?\.leave\(\)/);
});

test('Skill Type offers None and keeps a skill whose type has no name', () => {
    global.rrEscapeHtml = require(path.resolve(__dirname, '..', 'src', 'utils', 'HtmlEscape.js'));
    const DatabaseSkillEditor = new Function(`${read('DatabaseSkillEditor.js')}\nreturn DatabaseSkillEditor;`)();
    const options = html => [...html.matchAll(/<option value="(\d+)" (selected)?\s*>([^<]*)<\/option>/g)]
        .map(m => ({ value: Number(m[1]), selected: !!m[2], label: m[3] }));

    const attack = options(DatabaseSkillEditor.skillTypeOptions(['', 'Magic', 'Special'], 0));
    assert.deepEqual(attack.map(o => o.label), ['None', 'Magic', 'Special']);
    assert.deepEqual(attack.filter(o => o.selected).map(o => o.value), [0], 'Attack (type 0) shows None');

    const special = options(DatabaseSkillEditor.skillTypeOptions(['', 'Magic', 'Special'], 2));
    assert.deepEqual(special.filter(o => o.selected).map(o => o.label), ['Special']);

    // A blank-named type in the middle: hidden unless it is the skill's own.
    const names = ['', 'Magic', '', 'Special'];
    assert.deepEqual(options(DatabaseSkillEditor.skillTypeOptions(names, 3)).map(o => o.value), [0, 1, 3]);
    const own = options(DatabaseSkillEditor.skillTypeOptions(names, 2));
    assert.deepEqual(own.map(o => o.value), [0, 1, 2, 3]);
    assert.deepEqual(own.filter(o => o.selected).map(o => o.label), ['#2']);

    const translated = options(DatabaseSkillEditor.skillTypeOptions(['', 'Magic'], 0, text => (text === 'None' ? 'なし' : text)));
    assert.equal(translated[0].label, 'なし');
});
