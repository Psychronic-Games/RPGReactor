'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function setup() {
    const events = new Map(), keys = new Map(), opens = [];
    let owns = true, loads = 0, hides = 0, deleted = 0;
    const overlay = {
        style: { display: 'none' }, children: [],
        hasChildNodes() { return this.children.length > 0; },
        appendChild(node) { this.children.push(node); }, contains: () => false
    };
    const document = {
        getElementById: id => id === 'plugin-manager-modal' ? overlay : null,
        querySelector: () => null, createElement: () => ({ style: {} }),
        addEventListener: (type, listener) => keys.set(type, listener), removeEventListener() {}
    };
    const floating = { install() {}, open: (node, options) => opens.push(options.shownBefore), hidePopout: () => hides++, ownsKeys: () => owns };
    const window = { addEventListener: (type, listener) => events.set(type, listener) };
    const alerts = [];
    const PluginManager = vm.runInNewContext(fs.readFileSync(path.join(root, 'src/PluginManager.js'), 'utf8') + '\nPluginManager;', {
        window, document, RRPluginManagerWindow: floating,
        RRDialog: { alert: async message => alerts.push(message) },
        console: { log() {}, warn() {}, error() {} }
    });
    const manager = new PluginManager({ getCurrentProject: () => ({ path: '/project' }) });
    manager.loadPlugins = () => loads++;
    manager.init = function(container) { this.container = container; this.loadPlugins(); };
    manager._removeSelectedPlugins = () => deleted++;
    return { manager, overlay, events, opens, keys, alerts, setOwns: value => { owns = value; }, loads: () => loads, hides: () => hides, deleted: () => deleted };
}

test('Plugin settings opens and raises the shared floating window without reloading work in hand', () => {
    const f = setup();
    f.manager.show();
    const panel = f.manager.container;
    f.manager.plugins = [{ name: 'Edited', status: false, parameters: { speed: '7' } }];
    f.manager.show();
    assert.equal(f.loads(), 1);
    assert.equal(f.manager.container, panel);
    assert.equal(f.manager.plugins[0].parameters.speed, '7');
    assert.deepEqual(f.opens, [false, true]);
    f.manager.hide(); assert.equal(f.hides(), 1); assert.equal(f.overlay.style.display, 'none');
    f.manager.show(); assert.equal(f.loads(), 2, 'a closed manager reloads from disk as before');
});

test('Delete and Escape in the map do not act on Plugin settings in another window', () => {
    const f = setup(); f.manager.show();
    f.manager.plugins = [{ name: 'Keep' }]; f.manager.selectedPluginIndices.add(0);
    const press = key => f.keys.get('keydown')({ key, target: { tagName: 'DIV' }, preventDefault() {} });
    f.setOwns(false); press('Delete'); press('Escape');
    assert.equal(f.deleted(), 0); assert.equal(f.hides(), 0);
    f.setOwns(true); press('Delete');
    assert.equal(f.deleted(), 1);
});

test('recovering a destroyed Plugin settings window rebuilds handlers while retaining plugin edits', () => {
    const f = setup(); f.manager.show();
    const plugins = [{ name: 'Unsaved', status: false }]; f.manager.plugins = plugins;
    let built = 0, listed = 0;
    f.manager.createUI = () => built++;
    f.manager.renderPluginList = () => listed++;
    f.events.get('rr-plugin-manager-docked')();
    assert.equal(built, 1); assert.equal(listed, 1);
    assert.equal(f.manager.plugins, plugins); assert.equal(f.loads(), 1);
});

test('changing project hides Plugin settings and drops its old save destination', () => {
    const f = setup(); f.manager.show();
    f.manager._pluginsFilePath = '/old-project/js/reactor_plugins.js';
    f.manager._pluginProjectPath = '/old-project';
    f.manager.plugins = [{ name: 'Old' }];
    f.manager.onProjectChanged();
    assert.equal(f.hides(), 1); assert.equal(f.manager._pluginsFilePath, null);
    assert.equal(f.manager.plugins.length, 0);
});

test('Plugin settings ships its pop-out page and shares the remembered monitor-aware geometry', () => {
    const floating = require('../src/PluginManagerWindow.js');
    assert.ok(fs.existsSync(path.join(root, 'plugin-manager-panel.html')));
    assert.match(fs.readFileSync(path.join(root, 'build-scripts/dist-editor-worker.js'), 'utf8'), /'plugin-manager-panel\.html'/);
    assert.ok(floating.defaultRect({ width: 1920, height: 1080 }).width >= 1400);
    assert.deepEqual(floating.clamp({ left: -50, top: -10, width: 1, height: 1 }, { width: 1920, height: 1080 }), { left: 0, top: 0, width: 800, height: 480 });
});

test('a stale Plugin settings session cannot save to its previous project', async () => {
    const f = setup();
    let writes = 0;
    f.manager.fs = { writeFileSync: () => writes++ };
    f.manager.path = path;
    f.manager._pluginProjectPath = '/old-project';
    f.manager._pluginsFilePath = '/old-project/js/reactor_plugins.js';
    await f.manager.savePlugins();
    assert.equal(writes, 0);
    assert.equal(f.alerts.length, 1);
    assert.match(f.alerts[0], /different project/);
});
