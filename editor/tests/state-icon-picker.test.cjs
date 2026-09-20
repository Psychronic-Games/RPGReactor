'use strict';
/**
 * The State editor's icon opens ONE picker, and it writes back to States.
 *
 * The icon preview built by addDatabasePreview carries its own click handler,
 * and the `type` it is handed decides which table selectIcon saves to. The
 * State editor used to ask for a 'skills' preview - because 'states' was not
 * in the accepted list - and then bolt a second, 'states'-typed handler onto
 * the container around it. One click on the icon therefore ran both: two
 * stacked overlays (a visibly doubled backdrop), a Cancel that only closed the
 * top one, and a second picker left behind whose OK wrote the state record
 * over the skill of the same id.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createContext } = require('./helpers/mini-dom.cjs');

const repoRoot = path.resolve(__dirname, '..');
const uiSource = fs.readFileSync(path.join(repoRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
const stateEditorSource = fs.readFileSync(
    path.join(repoRoot, 'src', 'database', 'DatabaseStateEditor.js'), 'utf8');

/** The real class, run against a DOM small enough to render one preview in. */
function loadEditorUI() {
    const context = createContext({
        require: name => (name === 'path' ? path : {}),
        RRAssetFiles: { toUrl: p => 'file:///' + String(p).replace(/\\/g, '/') },
        Image: class { set src(_value) { /* never loads under the test DOM */ } },
        alert: () => {},
        nw: {}
    });
    context.console = { log() {}, debug() {}, warn() {}, error() {} };
    // mini-dom has no canvas; the preview only needs a 2D context to draw into.
    const createElement = context.document.createElement;
    context.document.createElement = tagName => {
        const element = createElement(tagName);
        if (element.tagName === 'CANVAS') element.getContext = () => ({ drawImage() {}, clearRect() {} });
        return element;
    };
    const DatabaseEditorUI = vm.runInNewContext(`${uiSource}\nDatabaseEditorUI;`, context);
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.currentProject = { path: 'D:\\Projects\\Demo' };
    ui.databaseManager = {};
    return { ui, document: context.document };
}

test('addDatabasePreview accepts a state and wires exactly one handler, typed states', () => {
    const { ui, document } = loadEditorUI();
    const calls = [];
    ui.selectIcon = (entry, type) => calls.push({ id: entry.id, type });

    const container = document.createElement('div');
    ui.addDatabasePreview(container, { id: 4, name: 'Poison', iconIndex: 2 }, 'states');

    const preview = container.querySelector('.database-preview');
    assert.ok(preview, 'a preview is appended');
    assert.ok(preview.querySelector('canvas'),
        "a state renders the icon branch, not the 'No preview available' fallback");

    const wrapper = preview.children[0];
    assert.strictEqual(typeof wrapper.onclick, 'function', 'the wrapper is the clickable element');
    wrapper.onclick();
    assert.deepStrictEqual(calls, [{ id: 4, type: 'states' }],
        'one handler, and it saves through the States table');
});

test('selectIcon with type states writes the state and leaves the skill of that id alone', () => {
    const { ui } = loadEditorUI();
    const written = [];
    ui.databaseManager = {
        updateState: (id, entry) => written.push(['state', id, entry.iconIndex]),
        updateSkill: (id, entry) => written.push(['skill', id, entry.iconIndex]),
        updateItem: () => written.push(['item']),
        updateWeapon: () => written.push(['weapon']),
        updateArmor: () => written.push(['armor'])
    };
    ui.showDatabaseDetail = () => {};
    ui.refreshListIcon = () => {};
    ui.updateStatus = () => {};

    let chosen = null;
    ui.showIconPicker = (current, onSelect) => { chosen = onSelect; };

    const state = { id: 4, name: 'Poison', iconIndex: 2 };
    ui.selectIcon(state, 'states');
    assert.strictEqual(typeof chosen, 'function', 'the picker opened');
    chosen(37);

    assert.strictEqual(state.iconIndex, 37);
    assert.deepStrictEqual(written, [['state', 4, 37]],
        'nothing is written to Skills, which is what the duplicate picker did');
});

test('the State editor asks for a states preview and adds no handler of its own', () => {
    assert.match(stateEditorSource, /addDatabasePreview\(iconContainer, state, 'states'\)/,
        "the preview must be typed 'states' so its own handler saves to the right table");
    assert.doesNotMatch(stateEditorSource, /iconContainer\.onclick/,
        'a second handler on the container is the doubled-overlay bug');
});
