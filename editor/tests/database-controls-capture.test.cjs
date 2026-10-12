/**
 * Database › Controls: "+" listens for the next key. Changing your mind must
 * not cost a key: Escape or a click elsewhere stops listening.
 */
const assert = require('node:assert/strict');
const test = require('node:test');

const listeners = {};
global.document = {
    addEventListener(type, fn) { (listeners[type] ||= new Set()).add(fn); },
    removeEventListener(type, fn) { listeners[type]?.delete(fn); }
};
global.window = {};
const DatabaseControlsEditor = require('../src/database/DatabaseControlsEditor.js');

const editorWith = system => {
    const editor = new DatabaseControlsEditor({ data: { system }, getSystem: () => system }, null, null, null);
    editor.render = () => {};
    return editor;
};
const key = (keyCode, code) => ({ keyCode, code, preventDefault() {}, stopImmediatePropagation() {} });

test('Escape stops listening instead of taking the key from Cancel / Menu', () => {
    const system = {};
    const editor = editorWith(system);
    editor.startCapture('key', 'shift');
    editor.captureKey(key(27, 'Escape'));
    assert.equal(editor._capture, null);
    assert.equal(system.reactorControls, undefined, 'the keys are still the stock ones');
    assert.equal(listeners.keydown?.size || 0, 0);
    // Cancel / Menu is where Esc belongs, so there it is the key.
    editor.startCapture('key', 'escape');
    editor.captureKey(key(27, 'Escape'));
    assert.equal(editor.controls().keys[27], 'escape');
    editor.startCapture('key', 'shift');
    editor.captureKey(key(70, 'KeyF'));
    assert.equal(system.reactorControls.keys[70], 'shift');
});

test('a click away from the "+" stops listening; the "+" itself does not', () => {
    const editor = editorWith({});
    editor.startCapture('key', 'ok');
    const press = inside => [...listeners.pointerdown].forEach(fn => fn({ target: { closest: () => inside ? {} : null } }));
    press(true);
    assert.deepEqual(editor._capture, { kind: 'key', action: 'ok' });
    press(false);
    assert.equal(editor._capture, null);
    assert.equal(listeners.pointerdown.size, 0);
});
