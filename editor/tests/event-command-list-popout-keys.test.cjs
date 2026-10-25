'use strict';
// The event editor in a window of its own (owner report, 2026-10-17): Delete, the clipboard keys,
// Ctrl+Z and Enter on the command list act there again. Whether a dialog covers the editor is
// read from the window the editor is in; the editor window's middle (the map) said "covered" and
// every key was dropped. All floating panels now request transparent rounded corners.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
const FightCommandEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'FightCommandEditor.js'));
const EventEditorWindow = require(path.join(editorRoot, 'src', 'event', 'EventEditorWindow.js'));
const DatabaseWindow = require(path.join(editorRoot, 'src', 'database', 'DatabaseWindow.js'));

/** A document with one thing under the middle of its window. */
function makeWindow(width, height) {
    const view = { innerWidth: width, innerHeight: height };
    const doc = { defaultView: view, under: null, elementFromPoint() { return this.under; } };
    view.document = doc;
    return { view, doc };
}

/** The editor window (the map under its middle) and the event editor's own window. */
function twoWindows() {
    const main = makeWindow(1600, 1000);
    const own = makeWindow(1100, 800);
    const row = { ownerDocument: own.doc, tagName: 'DIV', isContentEditable: false };
    const editor = { ownerDocument: own.doc, style: { display: 'flex' }, contains: element => element === row };
    main.doc.under = { id: 'map-canvas', ownerDocument: main.doc };
    own.doc.under = row;
    return { main, own, row, editor };
}

function withGlobals(main, run) {
    const saved = { document: globalThis.document, window: globalThis.window };
    globalThis.document = main.doc;
    globalThis.window = main.view;
    try { return run(); } finally { globalThis.document = saved.document; globalThis.window = saved.window; }
}

test('a dialog covers the editor only in the window the editor is in', () => {
    const { main, own, editor } = twoWindows();
    withGlobals(main, () => {
        assert.equal(EventCommandList.coveredByDialog(editor), false, 'the map under the editor window\'s middle does not cover the event window');
        own.doc.under = { id: 'message-command-editor-modal' };
        assert.equal(EventCommandList.coveredByDialog(editor), true, 'a command dialog in the event window covers it');
    });
});

test('Delete, the clipboard keys and Enter on the command list act in the event window', () => {
    const { main, row, editor } = twoWindows();
    let keydown = null;
    main.doc.addEventListener = (type, handler) => { if (type === 'keydown') keydown = handler; };
    main.doc.getElementById = id => (id === 'event-editor-modal' ? editor : null);
    const calls = [];
    const list = {
        currentPage: { list: [{ code: 101 }, { code: 401 }, { code: 230 }, { code: 0 }] },
        currentPageIndex: 0,
        selectedIndices: [2],
        _commandListRoot: { isConnected: true, contains: element => element === row },
        copyCommands: () => calls.push('copy'),
        cutCommands: () => calls.push('cut'),
        pasteCommands: () => calls.push('paste'),
        deleteCommands: () => calls.push('delete'),
        editCommand: index => calls.push('edit ' + index),
        newCommand: () => calls.push('new'),
        refreshCommandList: () => calls.push('refresh'),
        updateSelectionStyles() {}
    };
    const press = (key, ctrlKey = false) => keydown({ key, ctrlKey, metaKey: false, shiftKey: false, altKey: false, target: row, defaultPrevented: false, preventDefault() {} });
    withGlobals(main, () => {
        EventCommandList.prototype.setupKeyboardShortcuts.call(list);
        assert.ok(keydown, 'the list listens for keys');
        press('Delete');
        press('c', true);
        press('x', true);
        press('v', true);
        press('Enter');
        assert.deepEqual(calls, ['delete', 'copy', 'cut', 'paste', 'edit 2']);
        // A command dialog open in the event window keeps them from the list behind it.
        calls.length = 0;
        editor.ownerDocument.under = { id: 'message-command-editor-modal' };
        press('Delete');
        press('Enter');
        assert.deepEqual(calls, []);
    });
});

test('Enter on a Fight command dialog\'s page reads the dialog\'s own window', () => {
    const { main, own } = twoWindows();
    const field = own.doc.under;
    const overlay = { ownerDocument: own.doc, contains: element => element === field };
    withGlobals(main, () => {
        assert.equal(FightCommandEditor.onTop(overlay), true, 'the map in the editor window is not over it');
        own.doc.under = { id: 'picker' };
        assert.equal(FightCommandEditor.onTop(overlay), false);
    });
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'FightCommandEditor.js'), 'utf8');
    assert.match(source, /event\.target === \(modal\.ownerDocument \|\| document\)\.body/, 'the page is the dialog\'s own window\'s body');
});

test('floating panels request clear rounded corners on every platform without an opaque frame', () => {
    const ForgeWindow = require('../src/forge/ForgeWindow.js');
    const PluginWindow = require('../src/PluginManagerWindow.js');
    for (const win of [EventEditorWindow, DatabaseWindow, ForgeWindow, PluginWindow]) assert.equal(win.seeThrough(), true);
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'DetachedWindow.js'), 'utf8');
    assert.match(source, /frame: false, transparent: true/);
    assert.match(source, /doc\.documentElement\.style\.cssText = 'background:transparent !important;'/);
    assert.doesNotMatch(source, /rr-window-square|var\(--color-bg-deep\)/);
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    assert.doesNotMatch(css, /rr-window-square/);
    for (const selector of ['#event-editor-modal.rr-event-editor-popped > .rr-modal {', '#database-viewer.rr-database-popped > .database-window {', '#forge-workspace.rr-forge-popped > .rr-forge-window {', '#plugin-manager-modal.rr-plugin-popped > .rr-plugin-window {']) {
        const start = css.indexOf(selector);
        assert.ok(start >= 0, selector);
        assert.match(css.slice(start, css.indexOf('}',start)), /box-shadow: none;/);
    }
    const args = JSON.parse(fs.readFileSync(path.join(editorRoot, 'package.json'), 'utf8'))['chromium-args'];
    assert.ok(args.includes('--enable-transparent-visuals'));
    assert.ok(!args.includes('--disable-gpu'), '3D rendering stays accelerated');
});
