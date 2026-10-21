/**
 * Several elements on a skill or item (GitHub #17).
 *
 * The data keeps its shape: `damage.elementId` is always written and holds
 * the first element, `damage.elementIds` exists only for two or more. The
 * runtime's `elements()` is a no-op for every entry that has no list, and
 * an element plugin's list reader is taught about the list at boot.
 */
const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const objectsSource = runtimeSource('reactor_objects.js');

/** The shipped ActionElements class, with I18n and RRIconCodes absent (English, plain names). */
function loadActionElements() {
    const context = { window: {}, globalThis: undefined, module: undefined, console };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/ActionElements.js') + '\n;globalThis.__ActionElements = ActionElements;', context);
    return context.__ActionElements;
}

/** One shipped `Game_Action.prototype.<name> = function ... };` verbatim. */
function methodSource(name) {
    const head = `Game_Action.${name} = function(`;
    const start = objectsSource.indexOf(head);
    assert.ok(start >= 0, `runtime defines Game_Action.${name}`);
    const end = objectsSource.indexOf('\n};\n', start);
    return objectsSource.slice(start, end + 4);
}

/** A Game_Action with the shipped element methods over a fake item and subject. */
function actionFor(item, attackElements, DataManager) {
    const context = { Game_Action: function() {}, DataManager, console };
    vm.runInNewContext([methodSource('prototype.elements'), methodSource('prototype.calcElementRate'), methodSource('prototype.elementsMaxRate'), methodSource('installMultiElementShim')].join('\n'), context);
    const action = new context.Game_Action();
    action.item = () => item;
    action.subject = () => ({ attackElements: () => attackElements });
    return { action, Game_Action: context.Game_Action };
}

const rates = { 1: 1, 2: 2, 3: 0.5, 4: 1.5, 5: 0, 6: 1.2, 7: 0.8, 8: 3, 9: 0.25 };
const target = { elementRate: id => (id in rates ? rates[id] : 1) };

/** What calcElementRate did before lists existed, line for line. */
function legacyRate(item, attackElements) {
    if (item.damage.elementId < 0) {
        const list = attackElements;
        return list.length ? Math.max(...list.map(id => target.elementRate(id))) : 1;
    }
    return target.elementRate(item.damage.elementId);
}

test('elements() and calcElementRate are a no-op for every skill and item in the bundled Demo', () => {
    const skills = JSON.parse(read('template/Demo/data/Skills.json'));
    const items = JSON.parse(read('template/Demo/data/Items.json'));
    let checked = 0;
    for (const entry of skills.concat(items)) {
        if (!entry || !entry.damage) continue;
        assert.equal(entry.damage.elementIds, undefined, `${entry.name}: the Demo has no lists yet`);
        for (const attack of [[], [1], [2, 8]]) {
            const { action } = actionFor(entry, attack);
            const expected = entry.damage.elementId < 0 ? attack : [entry.damage.elementId];
            assert.deepEqual([...action.elements()], expected, `${entry.name} elements`);
            assert.equal(action.calcElementRate(target), legacyRate(entry, attack), `${entry.name} rate`);
            checked++;
        }
    }
    assert.ok(checked > 600, `checked ${checked} entries`);
});

test('a list takes the highest rate among its elements, and never a 0 or -1 inside it', () => {
    const item = { damage: { elementId: 3, elementIds: [3, 8, 9] } };
    const { action } = actionFor(item, [2]);
    assert.deepEqual([...action.elements()], [3, 8, 9]);
    assert.equal(action.calcElementRate(target), 3, 'Maximum, as stock MZ rules Normal Attack');
    item.damage.elementIds = [0, -1, 4];
    assert.deepEqual([...action.elements()], [4], 'stray zeros and Normal Attack markers are dropped');
    item.damage.elementIds = [];
    assert.deepEqual([...action.elements()], [3], 'an empty list falls back to elementId');
    const { action: none } = actionFor({ damage: null }, [2]);
    assert.deepEqual([...none.elements()], []);
});

test('the element plugin shim feeds the list to its reader once, and is inert without one', () => {
    const { Game_Action } = actionFor({ damage: { elementId: 1 } }, [], {});
    assert.equal(Game_Action.installMultiElementShim(), false, 'nothing to wrap');
    const DataManager = { getActionObjectElements: object => (object.note === 'tagged' ? [7] : []) };
    const { Game_Action: withPlugin } = actionFor({ damage: { elementId: 1 } }, [], DataManager);
    assert.equal(withPlugin.installMultiElementShim(), true);
    assert.equal(withPlugin.installMultiElementShim(), false, 'a second boot does not wrap twice');
    assert.deepEqual([...DataManager.getActionObjectElements({ note: 'tagged', damage: { elementId: 2, elementIds: [2, 11] } })], [7, 2, 11],
        'the plugin\'s own note elements first, then the list; the plugin de-duplicates after');
    assert.deepEqual([...DataManager.getActionObjectElements({ note: '', damage: { elementId: 2 } })], [], 'no list, nothing added');
    assert.deepEqual([...DataManager.getActionObjectElements({ damage: { elementIds: [0, 5] } })], [5]);
    assert.match(read('runtime/reactor_scenes.js'), /Scene_Base\.prototype\.start\.call\(this\);\n[\s\S]{0,200}?Game_Action\.installMultiElementShim\(\);/, 'installed once the plugins have loaded');
});

test('every boot that replaces the stock Scene_Boot start installs the shim itself', () => {
    // A wrapper that calls Scene_Base's start directly has a path that never
    // reaches the stock start: the start-at-position playtest, the interface
    // preview and UI capture. Each must install the shim on its own.
    const replacing = [];
    for (const name of fs.readdirSync(path.join(repoRoot, 'runtime')).filter(file => /^reactor_.*\.js$/.test(file))) {
        const source = read(`runtime/${name}`);
        for (const match of source.matchAll(/^([ \t]*)Scene_Boot\.prototype\.start = function\(\) \{\n/gm)) {
            const body = source.slice(match.index, source.indexOf(`\n${match[1]}};`, match.index));
            if (!body.includes('Scene_Base.prototype.start.call(this)')) continue;
            replacing.push(name);
            assert.match(body, /Game_Action\.installMultiElementShim\(\)/, `${name}: a Scene_Boot start that skips the stock one installs the shim`);
        }
    }
    assert.deepEqual(replacing.sort(), ['reactor_fight_flow.js', 'reactor_scenes.js', 'reactor_ui.js'], 'the scan found every boot path');
});

test('writing a list keeps elementId first, and the list only for two or more', () => {
    const ActionElements = loadActionElements();
    const damage = { type: 1, elementId: 2, formula: 'a.atk', variance: 20, critical: false };
    ActionElements.write(damage, [2]);
    assert.deepEqual(Object.keys(damage).sort(), ['critical', 'elementId', 'formula', 'type', 'variance'], 'one element leaves exactly the five keys');
    assert.equal(damage.elementId, 2);
    ActionElements.write(damage, [11, 2, 11, 0, -1]);
    assert.deepEqual([...damage.elementIds], [11, 2], 'selection order, no repeats, no zero or -1');
    assert.equal(damage.elementId, 11, 'the first element is what an element-unaware plugin sees');
    ActionElements.write(damage, [11]);
    assert.equal('elementIds' in damage, false, 'back to one element, the list goes');
    ActionElements.write(damage, []);
    assert.equal(damage.elementId, -1, 'nothing chosen is Normal Attack');
    assert.deepEqual([...ActionElements.ids({ elementId: -1 })], []);
    assert.deepEqual([...ActionElements.ids({ elementId: 3, elementIds: [3, 5] })], [3, 5]);
    assert.equal(ActionElements.isNormalAttack({ elementId: -1 }), true);
});

test('the note tag is read the way the element plugin reads it: ids, names, icon codes stripped, repeated tags', () => {
    const ActionElements = loadActionElements();
    const names = ['', '\\I[77]Rending', '\\I[64]Fire', 'Ice', 'Impact'];
    assert.deepEqual([...ActionElements.fromNote('<Multi-Element: 2>', names)], [2]);
    assert.deepEqual([...ActionElements.fromNote('<Multi-Element: 2, 4>\n<multi-element: Ice>', names)], [2, 4, 3]);
    assert.deepEqual([...ActionElements.fromNote('<Multi-Element: fire, Rending, Rending>', names)], [2, 1], 'names match with their icon codes stripped, once each');
    assert.deepEqual([...ActionElements.fromNote('<Multi-Element: 99>', names)], [], 'an id past the list is not an element');
    assert.deepEqual([...ActionElements.fromNote('', names)], []);
    assert.deepEqual([...ActionElements.fromNote(null, names)], []);
});

test('the field names the selection, counts past three, and shows note elements as part of the action', () => {
    const ActionElements = loadActionElements();
    const names = ['', 'Physical', '\\I[64]Fire', 'Ice', 'Thunder', 'Water'];
    assert.equal(ActionElements.summary(names, { elementId: -1 }, ''), 'Normal Attack');
    assert.equal(ActionElements.summary(names, { elementId: 2 }, ''), 'Fire');
    assert.equal(ActionElements.summary(names, { elementId: 2, elementIds: [2, 4] }, ''), 'Fire, Thunder');
    assert.equal(ActionElements.summary(names, { elementId: 2, elementIds: [2, 4] }, '<Multi-Element: Ice>'), 'Fire, Thunder, Ice', 'a note element is part of what the action does');
    assert.equal(ActionElements.summary(names, { elementId: 1, elementIds: [1, 2, 3, 4] }, ''), '4 elements');
    const html = ActionElements.fieldHtml('skill', 7, names, { elementId: 2 }, '');
    assert.match(html, /class="rr-shim-wrapper rr-elements-field" role="button" tabindex="0" data-elements-kind="skill" data-elements-id="7"/, 'dressed and sized as the select shim\'s trigger');
    assert.match(html, /class="rr-shim-trigger"[^>]*><span class="rr-shim-label rr-elements-label">Fire<\/span>/);
    assert.match(html, /▼<\/span><\/div><\/div>$/);
});

test('both editors use the shared field, save the list before the numeric arm, and the page loads the module', () => {
    for (const [file, kind, updater] of [['editor/src/database/DatabaseSkillEditor.js', 'skill', 'updateSkillField'], ['editor/src/database/DatabaseItemEditor.js', 'item', 'updateItemField']]) {
        const source = read(file);
        assert.match(source, new RegExp(`ActionElements\\.fieldHtml\\('${kind}', ${kind}\\.id, `), `${kind}: the field replaces the dropdown`);
        assert.doesNotMatch(source, /data-field="damage\.elementId"/, `${kind}: no element dropdown left`);
        assert.match(source, new RegExp(`ActionElements\\.bindTriggers\\(container, \\{[\\s\\S]{0,400}?this\\.${updater}\\(parseInt\\(id\\), 'damage\\.elementIds', ids\\)`), `${kind}: the checklist writes through the field updater`);
        const arm = source.indexOf("subField === 'elementIds'");
        const fallback = source.indexOf('parseInt(value) || 0;', source.indexOf("fieldName.startsWith('damage.')"));
        assert.ok(arm > 0 && arm < fallback, `${kind}: the list arm comes before parseInt, which would flatten [2, 11] to 2`);
        assert.match(source, /ActionElements\.write\((skill|item)\.damage, value\);/);
        assert.match(source, /elementIds\[0\] !== (skill|item)\.damage\.elementId\) delete (skill|item)\.damage\.elementIds;/, `${kind}: a direct elementId write retires a list that disagrees`);
    }
    const index = read('editor/index.html');
    assert.ok(index.indexOf('src/database/ActionElements.js') > index.indexOf('src/database/ActionScopes.js'), 'loaded beside ActionScopes');
    assert.ok(index.indexOf('src/database/ActionElements.js') < index.indexOf('src/database/DatabaseSkillEditor.js'), 'and before the editors that use it');
    const templates = read('editor/src/DatabaseEditorUI.js');
    assert.doesNotMatch(templates, /elementIds/, 'a new skill or item gains no list key');
});
