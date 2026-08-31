/**
 * An enemy carries its own max TP.
 *
 * Game_BattlerBase.prototype.maxTp returns a flat 100 for everything, and
 * nothing in the data could say otherwise. The Enemies page now edits a Max TP
 * value beside the eight parameters and Game_Enemy reads it.
 *
 * Three things can drift, and each is pinned here. The value must not migrate
 * into `params`, which is the eight-entry array the engine indexes by paramId
 * and which a ninth entry would corrupt. An enemy with no maxTp of its own must
 * keep getting the base implementation's answer rather than a hardcoded 100, so
 * that a plugin replacing maxTp still governs it. And the two sides have to
 * agree on what counts as authored: the editor writes only numbers, but data on
 * disk can hold anything, and a null read as zero would silently leave an enemy
 * with no TP at all.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const enemyEditorSource = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseEnemyEditor.js'), 'utf8');

// ---------------------------------------------------------------------------
// The runtime's own maxTp, lifted out of Game_Enemy
// ---------------------------------------------------------------------------

/**
 * Runs the shipped Game_Enemy.prototype.maxTp against a stub base class, so the
 * assertions below are about the real source rather than a copy of it.
 * `baseMaxTp` stands in for whatever Game_BattlerBase.prototype.maxTp is at the
 * time, which a plugin is free to have replaced.
 */
function loadRuntimeMaxTp(baseMaxTp = () => 100) {
    const start = objectsSource.indexOf('Game_Enemy.prototype.maxTp = function() {');
    assert.ok(start >= 0, 'Game_Enemy.prototype.maxTp is where it was');
    const end = objectsSource.indexOf('\n};', start) + '\n};'.length;

    const context = {
        Game_Enemy: { prototype: {} },
        Game_BattlerBase: { prototype: { maxTp: baseMaxTp } }
    };
    vm.runInNewContext(objectsSource.slice(start, end), context);
    return data => context.Game_Enemy.prototype.maxTp.call({ enemy: () => data });
}

function loadEnemyEditor() {
    // The constructor builds a trait editor; max TP has nothing to do with
    // traits, so a stub is enough to get an instance.
    const context = { window: {}, console, require, DatabaseTraitEditor: class {} };
    vm.runInNewContext(`${enemyEditorSource}\n;__Editor = DatabaseEnemyEditor;`, context);
    return new context.__Editor(
        { getStates: () => [], getSkills: () => [], getSystem: () => ({ switches: [] }) },
        null, null, null
    );
}

// ---------------------------------------------------------------------------
// What the runtime reads
// ---------------------------------------------------------------------------

test('an enemy with no max TP of its own is left to the base implementation', () => {
    const maxTp = loadRuntimeMaxTp();
    assert.equal(maxTp({}), 100, 'the key is absent in every project authored before this');
    assert.equal(maxTp({ maxTp: undefined }), 100);
});

test('the fallback is looked up rather than inlined, so a plugin still governs it', () => {
    // A plugin replacing Game_BattlerBase.prototype.maxTp - reading a notetag,
    // say - must keep deciding for every enemy the database has not spoken for.
    const maxTp = loadRuntimeMaxTp(() => 42);
    assert.equal(maxTp({}), 42, 'unauthored enemies follow the replacement');
    assert.equal(maxTp({ maxTp: 7 }), 7, 'an authored value still wins');
});

test('an authored max TP is used, and zero is a value rather than an absence', () => {
    const maxTp = loadRuntimeMaxTp();
    assert.equal(maxTp({ maxTp: 250 }), 250);
    assert.equal(maxTp({ maxTp: 0 }), 0, 'an enemy that cannot build TP is a legitimate design');
    assert.equal(maxTp({ maxTp: '80' }), 80, 'a numeric string is what a hand-edited file holds');
});

test('malformed data falls back instead of resolving to zero TP', () => {
    // Number(null), Number('') and Number([]) are all 0, which is finite - so a
    // plain Number() check would answer "this enemy has no TP" to data that
    // merely says nothing.
    const maxTp = loadRuntimeMaxTp();
    for (const raw of [null, '', '   ', [], {}, 'abc', NaN]) {
        assert.equal(maxTp({ maxTp: raw }), 100, `${JSON.stringify(raw)} is not an authored value`);
    }
});

test('a negative max TP is clamped rather than passed through', () => {
    const maxTp = loadRuntimeMaxTp();
    assert.equal(maxTp({ maxTp: -5 }), 0);
});

// ---------------------------------------------------------------------------
// What the editor writes
// ---------------------------------------------------------------------------

test('the editor shows the same default the runtime falls back to', () => {
    const editor = loadEnemyEditor();
    assert.equal(editor.enemyMaxTp({}), 100, 'an untouched enemy reads 100, not a blank');
    assert.equal(editor.enemyMaxTp({ maxTp: 250 }), 250);
    assert.equal(editor.enemyMaxTp({ maxTp: 0 }), 0);
    assert.equal(editor.enemyMaxTp({ maxTp: -5 }), 0, 'the box agrees with the runtime clamp');
});

test('max TP is written beside params, never into it', () => {
    const editor = loadEnemyEditor();
    const enemy = { id: 1, params: [1, 2, 3, 4, 5, 6, 7, 8] };
    editor.databaseManager = { getEnemy: () => enemy, updateEnemy() {} };

    editor.updateEnemyField(1, 'maxTp', '250');
    assert.equal(enemy.maxTp, 250);
    assert.equal(enemy.params.length, 8, 'params stays the array the engine indexes by paramId');
    assert.deepEqual([...enemy.params], [1, 2, 3, 4, 5, 6, 7, 8], 'no parameter was touched');

    editor.updateEnemyField(1, 'maxTp', '-5');
    assert.equal(enemy.maxTp, 0, 'negative input is clamped on the way in');
});

test('nothing is written to an enemy whose max TP was never changed', () => {
    // The editor renders 100 into the box from the default, and that must not
    // become a maxTp key on every enemy in every project the moment it is saved.
    const editor = loadEnemyEditor();
    const enemy = { id: 1, params: [0, 0, 0, 0, 0, 0, 0, 0] };
    editor.enemyMaxTp(enemy);
    assert.equal('maxTp' in enemy, false);
});

// ---------------------------------------------------------------------------
// Where the row sits
// ---------------------------------------------------------------------------

test('Max TP reads under Max MP, with the eight parameters still in engine order', () => {
    const editor = loadEnemyEditor();
    const rows = editor.parameterRows({ params: [10, 20, 30, 40, 50, 60, 70, 80] });

    // Arrays built inside the VM carry that realm's prototypes, which deepEqual
    // compares; spreading rebuilds them here. Only the values matter.
    assert.deepEqual([...rows.map(r => r.label)], [
        'Max HP', 'Max MP', 'Max TP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck'
    ], 'the third resource pool belongs with the other two, not after Luck');

    // Inserting a row into the middle must not shift what the param rows point
    // at: index is the paramId the engine reads, not the row's position.
    const params = rows.filter(r => r.field === 'params');
    assert.deepEqual([...params.map(r => r.index)], [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([...params.map(r => r.value)], [10, 20, 30, 40, 50, 60, 70, 80]);

    const maxTp = rows.find(r => r.field === 'maxTp');
    assert.equal(maxTp.index, null, 'Max TP has no paramId, because it is not a parameter');
    assert.equal(rows.indexOf(maxTp), 2);
});

test('an enemy with no params still yields the full row list', () => {
    const rows = loadEnemyEditor().parameterRows({});
    assert.equal(rows.length, 9);
    assert.deepEqual([...rows.map(r => r.value)], [0, 0, 100, 0, 0, 0, 0, 0, 0]);
});

// ---------------------------------------------------------------------------
// The value boxes size to what they hold
// ---------------------------------------------------------------------------

test('a parameter box is sized from its digits, with a floor and a ceiling', () => {
    const editor = loadEnemyEditor();
    const chOf = value => Number(/calc\((\d+)ch/.exec(editor.paramInputWidth(value))[1]);

    assert.equal(chOf(7), 2, 'a single digit still gets a box wide enough to click');
    assert.equal(chOf(25), 2);
    assert.equal(chOf(200), 3);
    assert.equal(chOf(123456), 6, 'a six-digit Max HP gets the room it needs');
    assert.equal(chOf('1234567890123'), 13, 'a thirteen-digit value is still shown whole');
    assert.equal(chOf('123456789012345678'), 15,
        'and past the length a Number holds exactly, the box stops growing');
    assert.equal(chOf(''), 2, 'an empty box does not collapse');
    assert.equal(chOf('-40'), 2, 'the sign is not a digit');
});

test('the width allowance leaves the digits clear of the arrows', () => {
    // What sits beside the digits is no longer Chromium's spinner: theme.css
    // suppresses that on every number field and NumberSteppers puts its own
    // 22px button column there, on top of 12px of input padding and the
    // wrapper's 2px of border. Measured in the running editor, so anything at
    // or under 36px is a box whose value runs straight into the arrows.
    const editor = loadEnemyEditor();
    const allowance = Number(/\+\s*(\d+)px/.exec(editor.paramInputWidth(1))[1]);
    assert.ok(allowance >= 44,
        `width allowance ${allowance}px leaves only ${allowance - 36}px between the digits and the arrows`);
});

test('the Parameter column is pinned to its labels, so a growing box cannot move it', () => {
    // The table was two columns sized from their content, so the width a box
    // took to fit another digit came out of the Parameter column: measured in
    // the running editor, typing nine digits walked every box 83px to the
    // left, towards its own label, and shrank the label column by the same
    // 83px. Pinning the Parameter column to its own longest label leaves that
    // slack in the Value column instead, for a box to grow into.
    assert.match(enemyEditorSource,
        /<th style="width: 1px; white-space: nowrap;">\$\{tt\('Parameter'\)\}<\/th>/,
        'the Parameter column collapses to its own content');
    assert.match(enemyEditorSource,
        /<td style="white-space: nowrap;">\$\{row\.label\}<\/td>/,
        'and the labels stay on one line, so that content is the longest of them');
    assert.doesNotMatch(enemyEditorSource, /table-layout: fixed/,
        'the Value column takes the rest rather than being pinned itself');
});
