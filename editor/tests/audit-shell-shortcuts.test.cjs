/**
 * Ctrl+N, Ctrl+O and Ctrl+R act on the project, so a dialog on screen (or the
 * event editor) holds them back; Ctrl+S saves from anywhere.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function setup({ overlays = [], eventEditorShown = false } = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    let keydown = null;
    const element = (id, shown) => ({ id, style: { display: shown ? 'flex' : 'none' }, getClientRects: () => (shown ? [{}] : []) });
    const all = [element('event-editor-modal', eventEditorShown), ...overlays.map(id => element(id, true))];
    const document = {
        activeElement: { tagName: 'BUTTON' },
        getElementById: id => all.find(el => el.id === id) || null,
        querySelector: () => null,
        querySelectorAll: () => all,
        addEventListener() {}, removeEventListener() {}
    };
    const context = { console, document, window: { addEventListener(type, handler) { if (type === 'keydown') keydown = handler; } } };
    const UIManager = vm.runInNewContext(`${source}\nUIManager;`, context);
    const calls = [];
    const manager = new UIManager({
        newProject: () => calls.push('new'), openProject: () => calls.push('open'),
        saveProject: () => calls.push('save'), playtest: () => calls.push('playtest')
    });
    manager.setupKeyboardShortcuts();
    const prevented = [];
    const press = key => keydown({ key, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false,
        target: document.activeElement, preventDefault() { prevented.push(key); }, stopPropagation() {} });
    return { press, calls, prevented };
}

test('no dialog: New, Open, Save and Playtest run', () => {
    const { press, calls } = setup();
    for (const key of ['n', 'o', 's', 'r']) press(key);
    assert.deepEqual(calls, ['new', 'open', 'save', 'playtest']);
});

test('a dialog up: only Save runs, and Chromium never gets the keys', () => {
    const { press, calls, prevented } = setup({ overlays: ['rr-legacy-import-dialog'] });
    for (const key of ['n', 'o', 's', 'r']) press(key);
    assert.deepEqual(calls, ['save']);
    assert.deepEqual(prevented, ['n', 'o', 's', 'r'], 'Ctrl+R never reloads the editor');
});

test('the event editor open: New, Open and Playtest wait for it', () => {
    const { press, calls } = setup({ eventEditorShown: true });
    for (const key of ['n', 'o', 'r', 's']) press(key);
    assert.deepEqual(calls, ['save']);
});
