'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const DatabaseWindow = require('../src/database/DatabaseWindow.js');
const ForgeWindow = require('../src/forge/ForgeWindow.js');

test('Database and Forge use the monitor for their initial size and remember a later resize', () => {
    const saved = { nw: globalThis.nw, localStorage: globalThis.localStorage };
    const store = new Map();
    globalThis.localStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) };
    globalThis.nw = { Screen: { Init() {}, screens: [{ work_area: { x: 0, y: 0, width: 1920, height: 1040 } }] } };
    try {
        const main = { x: 100, y: 100, width: 1280, height: 720 };
        for (const win of [DatabaseWindow, ForgeWindow]) {
            const first = win.windowRect(main);
            assert.ok(first.width >= 1700, 'a 1280px editor does not squeeze the tool window on a 1920px monitor');
            assert.ok(first.height > 720);
            assert.ok(first.left >= 0 && first.top >= 0 && first.left + first.width <= 1920 && first.top + first.height <= 1040);
            const resized = { left: 80, top: 100, width: 1100, height: 650 };
            store.set(win.POPOUT_KEY, JSON.stringify(resized));
            assert.deepEqual(win.windowRect(main), resized, 'the user can still choose a smaller window');
            store.delete(win.POPOUT_KEY);
        }
        globalThis.nw.Screen.screens = [{ work_area: { x: 0, y: 0, width: 2560, height: 1400 } }];
        store.set('rr-forge-popout', JSON.stringify({ left: 100, top: 100, width: 1100, height: 650 }));
        const largerForge = ForgeWindow.windowRect(main);
        assert.equal(largerForge.width, 1920, 'the new Forge default resets the previous smaller placement once');
        assert.equal(largerForge.height, 1080);
        globalThis.nw.Screen.screens = [{ work_area: { x: -1366, y: 0, width: 1366, height: 728 } }];
        const second = DatabaseWindow.windowRect({ x: -1300, y: 0, width: 1024, height: 600 });
        assert.ok(second.left >= -1366 && second.left + second.width <= 0, 'a monitor to the left is respected');
        assert.ok(second.height <= 728 && second.width <= 1366, 'small work areas keep every edge reachable');
    } finally {
        for (const key of ['nw', 'localStorage']) {
            if (saved[key] === undefined) delete globalThis[key]; else globalThis[key] = saved[key];
        }
    }
});

function forge() {
    const events = new Map(), opened = [];
    const win = { addEventListener: (name, handler) => events.set(name, handler), I18n: { t: key => key } };
    let hidden = 0;
    const floating = { open: (overlay, options) => opened.push(options.shownBefore), hidePopout: () => hidden++ };
    const Manager = vm.runInNewContext(read('src/forge/ForgeManager.js') + '\nForgeManager;', {
        window: win, document: {}, RRForgeWindow: floating, console
    });
    const title = {}, close = { setAttribute() {} }, body = {}, content = {};
    const nodes = { '.rr-modal-title': title, '.rr-forge-close': close, '.rr-forge-workspace-body': body, '.rr-forge-content': content };
    const shell = { style: { display: 'none' }, querySelector: selector => nodes[selector], querySelectorAll: () => [] };
    const manager = new Manager({});
    manager.workspaceModal = shell;
    const calls = [];
    for (const name of ['animationGenerator', 'soundEffectGenerator']) manager[name] = {
        renderInto: target => { assert.equal(target, content); calls.push('mount:' + name); },
        detach: () => calls.push('detach:' + name)
    };
    return { manager, shell, body, calls, opened, hidden: () => hidden };
}

test('raising an open Forge preserves its active tool, and closing cleans it up once', () => {
    const f = forge();
    f.manager.openTool('animation-generator');
    const markup = f.body.innerHTML;
    f.manager.showLauncher();
    f.manager.openTool('animation-generator');
    assert.deepEqual(f.calls, ['mount:animationGenerator'], 'raising the window does not discard the tool page');
    assert.equal(f.body.innerHTML, markup);
    assert.deepEqual(f.opened, [false, true, true]);
    f.manager.close();
    f.manager.close();
    assert.deepEqual(f.calls, ['mount:animationGenerator', 'detach:animationGenerator']);
    assert.equal(f.shell.style.display, 'none');
    assert.equal(f.hidden(), 2);
    f.manager.showLauncher();
    assert.deepEqual(f.calls, ['mount:animationGenerator', 'detach:animationGenerator', 'mount:animationGenerator']);
    assert.equal(f.manager.workspaceModal, f.shell, 'the resizable frame itself survives close and reopen');
});

test('switching Forge tools cleans up the old tool while retaining the floating frame', () => {
    const f = forge();
    f.manager.openTool('animation-generator');
    f.manager.openTool('sound-effect-generator');
    f.manager._activateTool('sound-effect-generator');
    assert.deepEqual(f.calls, ['mount:animationGenerator', 'detach:animationGenerator', 'mount:soundEffectGenerator']);
    assert.equal(f.manager.workspaceModal, f.shell);
    f.manager.close();
    assert.equal(f.calls.at(-1), 'detach:soundEffectGenerator');
});

test('the Forge takes map shortcuts only while it is being worked in; its dialogs still block them', () => {
    let owns = false;
    const document = { getElementById: () => null, querySelectorAll: () => layers };
    const overlay = { id: 'forge-workspace', ownerDocument: document, getClientRects: () => [{}] };
    const layers = [overlay];
    const UI = vm.runInNewContext(read('src/UIManager.js') + '\nUIManager;', {
        document, RRForgeWindow: { ownsKeys: () => owns }, console
    });
    const ui = Object.create(UI.prototype);
    assert.equal(ui.isEditorModalOpenForGlobalShortcuts(), false, 'a click back on the map gives it its shortcuts');
    owns = true;
    assert.equal(ui.isEditorModalOpenForGlobalShortcuts(), true, 'a click into Forge keeps Delete and Undo out of the map');
    owns = false;
    layers.push({ id: 'confirm', ownerDocument: document, getClientRects: () => [{}] });
    assert.equal(ui.isEditorModalOpenForGlobalShortcuts(), true, 'an actual modal still takes the keys');
});

test('the distributed editor includes the Forge window page', () => {
    assert.ok(fs.existsSync(path.join(root, 'forge-panel.html')));
    assert.match(read('build-scripts/dist-editor-worker.js'), /'forge-panel\.html'/);
});

test('a motion opens below the complete model workspace and closing returns that space', () => {
    const children = [];
    const workspace = { appendChild: node => children.push(node) };
    const canvas = { style: { height: '100%' } };
    const panel = { querySelector: () => null, remove() { children.splice(children.indexOf(this), 1); } };
    const Motion = vm.runInNewContext(read('src/database/MotionEditor.js') + '\nRRMotionEditor;', {
        document: { createElement: () => panel }, rrEscapeHtml: value => String(value), console
    });
    const host = {
        rawAnimations: [], partNames: [], _sim: {}, _t: value => value, renderRuleList() {},
        _detail: { querySelector: selector => selector === '.r3d-model-workspace' ? workspace : selector === '.r3d-db-canvas' ? canvas : null }
    };
    const editor = new Motion(host);
    editor.bind = () => {};
    editor.bindPoses = () => {};
    editor.open('New motion');
    assert.deepEqual(children, [panel], 'the panel is alongside the model columns, outside the preview overlays');
    assert.equal(canvas.style.height, '100%', 'the canvas fills its own row instead of being manually cropped');
    editor.close();
    assert.deepEqual(children, []);
});
