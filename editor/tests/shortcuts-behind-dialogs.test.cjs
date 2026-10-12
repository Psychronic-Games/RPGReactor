/**
 * A dialog on screen keeps the map's shortcuts from acting behind it: Delete
 * with File › Import Project up deleted the selected event, and Ctrl+Z with
 * the event editor open swapped the map's events for copies, so the editor's
 * OK landed on a detached event. Escape lets go of the map selection again
 * (the always-present, hidden event editor overlay blocked it for good).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function setup({ overlays = [], eventEditorShown = false, active = { tagName: 'BUTTON' } } = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'UIManager.js'), 'utf8');
    let keydown = null;
    const element = (id, shown) => ({ id, style: { display: shown ? 'flex' : 'none' }, getClientRects: () => (shown ? [{}] : []) });
    const editor = element('event-editor-modal', eventEditorShown);
    const all = [editor, ...overlays.map(id => element(id, true))];
    const document = {
        activeElement: active,
        getElementById: id => all.find(el => el.id === id) || null,
        querySelector: () => null,
        querySelectorAll: () => all,
        addEventListener() {}, removeEventListener() {}
    };
    const context = { console, document, window: { addEventListener(type, handler) { if (type === 'keydown') keydown = handler; } } };
    const UIManager = vm.runInNewContext(`${source}\nUIManager;`, context);
    const calls = [];
    const eventManager = {
        eventMode: true, selectedEvent: { id: 1 },
        canUndo: () => true, canRedo: () => true,
        undo: () => calls.push('undo'), redo: () => calls.push('redo'),
        deleteEvent: () => calls.push('delete')
    };
    const mapEditor = { canUndo: () => true, canRedo: () => true, undo: () => calls.push('map undo'), redo: () => calls.push('map redo') };
    const manager = new UIManager({ getEventManager: () => eventManager, getMapEditor: () => mapEditor, getBuildHistory: () => null });
    manager.setupKeyboardShortcuts();
    const press = (key, ctrlKey = false) => keydown({ key, ctrlKey, metaKey: false, altKey: false, shiftKey: false, target: document.activeElement, preventDefault() {}, stopPropagation() {} });
    return { manager, press, calls, eventManager, UIManager };
}

test('no dialog up: Delete and Ctrl+Z reach the map', () => {
    const { manager, press, calls } = setup();
    assert.equal(manager.isEditorModalOpenForGlobalShortcuts(), false, 'the hidden event editor overlay does not count');
    press('Delete'); press('z', true);
    assert.deepEqual(calls, ['delete', 'undo']);
});

test('the Import Project dialog up: nothing happens behind it', () => {
    const { manager, press, calls } = setup({ overlays: ['rr-legacy-import-dialog'] });
    assert.equal(manager.isEditorModalOpenForGlobalShortcuts(), true);
    press('Delete'); press('z', true); press('y', true);
    assert.deepEqual(calls, []);
});

test('the event editor open: Ctrl+Z and Ctrl+Y leave the map\'s events alone', () => {
    const { press, calls } = setup({ eventEditorShown: true });
    press('z', true); press('y', true);
    assert.deepEqual(calls, []);
});

test('Escape to deselect counts only an overlay on screen', () => {
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /Array\.from\(document\.querySelectorAll\('\.modal-overlay, \.rr-modal-overlay, #database-modal'\)\)\s*\.some\(el => el\.getClientRects\(\)\.length > 0\)\) return;/);
    assert.doesNotMatch(main, /if \(document\.querySelector\('\.modal-overlay, \.rr-modal-overlay, #database-modal'\)\) return;/);
});

test('event mode with nothing to undo there leaves the tiles alone', () => {
    const { press, calls, eventManager } = setup();
    eventManager.canUndo = () => false; eventManager.canRedo = () => false;
    press('z', true); press('y', true);
    assert.deepEqual(calls, [], 'the map editor\'s stroke is not undone from event mode');
    eventManager.eventMode = false;
    press('z', true);
    assert.deepEqual(calls, ['map undo']);
});

test('Ctrl+Z and Ctrl+Y reach the map from a focused slider or tick, and stay with a field that takes text', () => {
    // A slider keeps the focus after a drag: the undo that follows is the map's.
    for (const type of ['range', 'checkbox', 'radio', 'color', 'button']) {
        const { press, calls } = setup({ active: { tagName: 'INPUT', type } });
        press('z', true); press('y', true);
        assert.deepEqual(calls, ['undo', 'redo'], type);
    }
    // Text being typed has its own undo.
    for (const active of [{ tagName: 'INPUT', type: 'text' }, { tagName: 'INPUT', type: 'number' }, { tagName: 'INPUT', type: 'search' }, { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
        const { press, calls } = setup({ active });
        press('z', true); press('y', true);
        assert.deepEqual(calls, [], JSON.stringify(active));
    }
    const { UIManager } = setup();
    assert.equal(UIManager.isTextEntry(null), false);
    assert.equal(UIManager.isTextEntry({ tagName: 'SELECT' }), false);
});

test('a command dialog over the Event Editor keeps the command list\'s keys from acting behind it', () => {
    const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
    const list = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    const row = { id: 'row' }, dialogField = { id: 'field' };
    const editor = { contains: element => element === row };
    const own = { document: globalThis.document, window: globalThis.window };
    let under = row;
    globalThis.document = { elementFromPoint: () => under };
    globalThis.window = { innerWidth: 1366, innerHeight: 768 };
    try {
        assert.equal(EventCommandList.coveredByDialog(editor), false, 'the editor itself is on top');
        under = dialogField;
        assert.equal(EventCommandList.coveredByDialog(editor), true, 'Delete with Change Items up deleted the command behind it');
        under = null;
        assert.equal(EventCommandList.coveredByDialog(editor), false);
    } finally { globalThis.document = own.document; globalThis.window = own.window; }
    // The shortcut handler asks before any key acts.
    const handler = list.slice(list.indexOf('setupKeyboardShortcuts() {'), list.indexOf('EventCommandList.historyKey(e'));
    assert.match(handler, /if \(EventCommandList\.coveredByDialog\(eventEditorModal\)\) return;/);
});
