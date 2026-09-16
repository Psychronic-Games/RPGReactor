const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const srcDir = path.resolve(__dirname, '..', 'src');
const source = (...parts) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8');

// The editor reads window.I18n and globalThis in the same breath; in a browser
// they are one object, so the test makes them one here too.
globalThis.window = globalThis;
globalThis.rrEscapeHtml = require(path.join(srcDir, 'utils', 'HtmlEscape.js'));
const TraitHelp = require(path.join(srcDir, 'database', 'TraitHelp.js'));

const TraitEditor = new Function(
    `${source('database', 'DatabaseTraitEditor.js')}\nreturn DatabaseTraitEditor;`
)();

// Every trait code the dialog offers, by the tab that draws it.
const TABS = {
    rates: [11, 12, 13, 14],
    param: [21, 22, 23],
    attack: [31, 32, 33, 34, 35],
    skill: [41, 42, 43, 44],
    equip: [51, 52, 53, 54, 55],
    other: [61, 62, 63, 64]
};
const ALL_CODES = Object.values(TABS).flat();

/**
 * The dialog only ever touches `container.innerHTML` and, in setupRadioInputs,
 * `querySelectorAll` - so a plain object stands in for the DOM and the test can
 * read the markup the editor would have rendered.
 */
function renderTab(tab, trait) {
    const editor = Object.create(TraitEditor.prototype);
    editor.databaseManager = {
        getSystem: () => ({
            elements: ['', 'Physical', 'Fire'],
            skillTypes: ['', 'Magic'],
            weaponTypes: ['', 'Sword'],
            armorTypes: ['', 'Plate'],
            equipTypes: ['', 'Weapon', 'Shield']
        }),
        getStates: () => [null, { id: 1, name: 'Knockout' }],
        getSkills: () => [null, { id: 1, name: 'Attack' }],
        getState: id => ({ id, name: 'Knockout' }),
        getSkill: id => ({ id, name: 'Attack' })
    };
    const container = { innerHTML: '', querySelectorAll: () => [] };
    const method = { rates: 'createRatesTab', param: 'createParamTab', attack: 'createAttackTab',
        skill: 'createSkillTab', equip: 'createEquipTab', other: 'createOtherTab' }[tab];
    editor[method](container, trait || { code: null, dataId: 0, value: 0 });
    return container.innerHTML;
}

test('every trait the dialog offers carries a hover explanation', () => {
    const rows = TraitHelp.rows();
    for (const code of ALL_CODES) {
        assert.ok(rows[code], `trait code ${code} has no help sentence`);
        assert.match(rows[code], /\.$/, `trait code ${code} help is not a sentence`);
    }
    // And nothing extra: a stray key would be help for a trait that cannot be picked.
    assert.deepEqual(Object.keys(rows).map(Number).sort((a, b) => a - b),
        [...ALL_CODES].sort((a, b) => a - b));
});

test('option explanations match the length of the list they annotate', () => {
    assert.equal(TraitHelp.exParams().length, 10);
    assert.equal(TraitHelp.spParams().length, 10);
    assert.equal(TraitHelp.specialFlags().length, 4);
    assert.equal(TraitHelp.collapseEffects().length, 6);
    assert.equal(TraitHelp.partyAbilities().length, 6);
    assert.equal(TraitHelp.slotTypes().length, 2);
    for (const list of [TraitHelp.exParams(), TraitHelp.spParams(), TraitHelp.specialFlags(),
        TraitHelp.collapseEffects(), TraitHelp.partyAbilities(), TraitHelp.slotTypes()]) {
        for (const hint of list) assert.ok(hint.trim().length > 0);
    }
});

test('every rendered trait row carries data-rr-help', () => {
    for (const [tab, codes] of Object.entries(TABS)) {
        const html = renderTab(tab);
        const rows = html.match(/<div class="trait-option rr-trait-row"[^>]*>/g) || [];
        assert.equal(rows.length, codes.length, `${tab} tab rendered ${rows.length} rows`);
        for (const row of rows) {
            assert.match(row, /data-rr-help="[^"]+"/, `${tab} tab has a row with no help`);
        }
    }
});

test('the dropdowns that have per-choice help render it as an option title', () => {
    const expected = {
        param: [['exparam-select', 10], ['spparam-select', 10]],
        equip: [['slottype-select', 2]],
        other: [['specialflag-select', 4], ['collapse-select', 6], ['party-select', 6]]
    };
    for (const [tab, selects] of Object.entries(expected)) {
        const html = renderTab(tab);
        for (const [cssClass, count] of selects) {
            const select = html.match(new RegExp(`<select class="${cssClass}[^>]*>([\\s\\S]*?)</select>`));
            assert.ok(select, `${cssClass} not rendered`);
            const titled = select[1].match(/<option [^>]*title="[^"]+"/g) || [];
            assert.equal(titled.length, count, `${cssClass} annotated ${titled.length} of ${count}`);
        }
    }
});

test('help text is escaped into the attribute it rides on', () => {
    // A sentence carrying a quote must not close the attribute early.
    const html = renderTab('rates');
    assert.doesNotMatch(html, /data-rr-help="[^"]*"[^>]*"/);
    for (const list of [TraitHelp.exParams(), TraitHelp.spParams()]) {
        for (const hint of list) assert.doesNotMatch(hint, /[<>]/);
    }
});

test('a trait names the runtime methods that decide it, and only real ones', () => {
    const runtime = fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'runtime', 'reactor_objects.js'), 'utf8');
    const named = new Set();
    for (const code of ALL_CODES) {
        const methods = TraitHelp.rowMethods(code);
        assert.ok(methods.length > 0, `trait code ${code} names no runtime method`);
        for (const method of methods) named.add(method);
    }
    for (let dataId = 0; dataId < 10; dataId++) {
        for (const code of [22, 23]) {
            for (const method of TraitHelp.optionMethods(code, dataId)) named.add(method);
        }
    }
    // The whole point of the override note is that these names are real: a typo
    // would quietly match no plugin and report "nothing changed this" forever.
    for (const method of named) {
        assert.ok(runtime.includes(`.prototype.${method} = function`),
            `${method} is not defined in runtime/reactor_objects.js`);
    }
});

test('the override scan names the enabled plugins that replace a method', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-overrides-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'js', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'js', 'reactor_main.js'), '// runtime marker\n');
    fs.writeFileSync(path.join(dir, 'js', 'reactor_plugins.js'), `var $plugins =\n${JSON.stringify([
        { name: 'On_A', status: true },
        { name: 'On_B', status: true },
        { name: 'Off_C', status: false },
        { name: 'Missing_D', status: true }
    ], null, 2)};\n`);
    fs.writeFileSync(path.join(dir, 'js', 'plugins', 'On_A.js'),
        'Game_BattlerBase.prototype.elementRate = function (id) { return 1; };\n');
    fs.writeFileSync(path.join(dir, 'js', 'plugins', 'On_B.js'),
        'Game_BattlerBase.prototype.elementRate = function (id) { return 2; };\n' +
        'Game_Action.prototype.itemHit = function () { return 1; };\n');
    fs.writeFileSync(path.join(dir, 'js', 'plugins', 'Off_C.js'),
        'Game_BattlerBase.prototype.elementRate = function () { return 3; };\n');

    globalThis.reactor = { projectController: { getCurrentProject: () => ({ path: dir }) } };
    const overrides = require(path.join(srcDir, 'utils', 'PluginOverrides.js'));
    overrides.reset();

    assert.deepEqual(overrides.owners(['elementRate']), ['On_A', 'On_B'],
        'a disabled plugin must not be named, and load order is kept');
    assert.deepEqual(overrides.owners(['itemHit']), ['On_B']);
    assert.deepEqual(overrides.owners(['nothingTouchesThis']), []);
    assert.equal(overrides.note(['nothingTouchesThis']), '',
        'no note at all when nothing overrides the method');
    assert.match(overrides.note(['elementRate']), /^Changed by plugins: On_A, On_B$/);

    delete globalThis.reactor;
    overrides.reset();
});

test('a long list of overriders is cut to a count rather than a paragraph', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-overrides-many-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'js', 'plugins'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'js', 'reactor_main.js'), '// runtime marker\n');
    const names = ['P1', 'P2', 'P3', 'P4', 'P5'];
    fs.writeFileSync(path.join(dir, 'js', 'reactor_plugins.js'),
        `var $plugins =\n${JSON.stringify(names.map(name => ({ name, status: true })))};\n`);
    for (const name of names) {
        fs.writeFileSync(path.join(dir, 'js', 'plugins', `${name}.js`),
            'Game_Action.prototype.itemCri = function () { return 0; };\n');
    }

    globalThis.reactor = { projectController: { getCurrentProject: () => ({ path: dir }) } };
    const overrides = require(path.join(srcDir, 'utils', 'PluginOverrides.js'));
    overrides.reset();

    const note = overrides.note(['itemCri']);
    assert.equal(note, 'Changed by plugins: P1, P2, P3 and 2 more');
    assert.equal(note.includes('\n'), false, 'the note has to stay one line');

    delete globalThis.reactor;
    overrides.reset();
});

test('with no project open the scan stays quiet instead of throwing', () => {
    const overrides = require(path.join(srcDir, 'utils', 'PluginOverrides.js'));
    delete globalThis.reactor;
    overrides.reset();
    assert.deepEqual(overrides.owners(['elementRate']), []);
    assert.equal(overrides.note(['elementRate']), '');
    assert.equal(TraitHelp.rowTip(11), TraitHelp.rows()[11],
        'the sentence is shown on its own when nothing is known to override it');
});

test('a dropdown hint puts its plugin note on its own dimmer line', () => {
    const vm = require('node:vm');
    const dom = require('./helpers/mini-dom.cjs');
    const context = dom.createContext();
    const select = dom.createSelect([
        { value: '0', text: 'Hit Rate' },
        { value: '1', text: 'Evasion Rate' }
    ], '0');
    // What TraitHelp.optionTip produces: the sentence, then the override note.
    select.children[0].title = 'Chance to land a Physical Attack.\nChanged by plugins: A, B';
    select.children[1].title = 'Chance to dodge a Physical Attack.';
    context.document.body.appendChild(select);
    vm.runInNewContext(fs.readFileSync(
        path.resolve(__dirname, '..', 'src', 'utils', 'SelectThemingShim.js'), 'utf8'), context);

    context.document.body.querySelector('.rr-shim-trigger').fire('click');
    const rows = context.document.body.querySelector('.rr-shim-popup')
        .querySelectorAll('div').filter(row => row.dataset.optText !== undefined);

    // Label, sentence, note - three lines, not one paragraph. Rendering the
    // whole hint as one text node folds the newline into a space, which is what
    // this is here to catch.
    assert.deepEqual(rows[0].children.map(line => line.textContent), [
        'Hit Rate',
        'Chance to land a Physical Attack.',
        'Changed by plugins: A, B'
    ]);
    assert.match(rows[0].children[2].style.cssText, /color:\s*var\(--color-text-dim\)/);
    // An option with a one-line hint keeps exactly the two lines it had.
    assert.deepEqual(rows[1].children.map(line => line.textContent), [
        'Evasion Rate',
        'Chance to dodge a Physical Attack.'
    ]);
});

test('hover help is delegated and never left stranded on screen', () => {
    const hoverHelp = source('utils', 'HoverHelp.js');
    // Delegation, so rows rendered after load are covered without re-attaching.
    assert.match(hoverHelp, /document\.addEventListener\('mouseover'/);
    // Every way the pointer can move on has to hide it.
    for (const event of ['mousedown', 'wheel', 'keydown', 'scroll']) {
        assert.ok(hoverHelp.includes(`'${event}'`), `${event} does not hide the help`);
    }
    // The box is painted from theme.css, and must not swallow the click that
    // dismisses it. The rule is pulled out first so a failure reports the rule
    // rather than the whole stylesheet.
    const theme = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'theme.css'), 'utf8');
    const rule = theme.match(/\.rr-hover-help\s*\{[^}]*\}/);
    assert.ok(rule, '.rr-hover-help has no rule in theme.css');
    assert.match(rule[0], /pointer-events:\s*none/, 'the box must not swallow clicks');
    assert.match(rule[0], /position:\s*fixed/);
    assert.ok(theme.includes('.rr-hover-help-note'), 'the plugin line has no dimmed style');
});
