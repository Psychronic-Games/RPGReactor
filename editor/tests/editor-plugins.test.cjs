'use strict';
// Editor plugins (src/EditorPlugins.js, Plugin Manager › Editor Plugins) and the two example plugins in the Demo:
// RR_MapStats (an editor plugin) and RR_DayNight (a game plugin only RPG Reactor can run).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const demo = path.join(repoRoot, 'template', 'Demo');
const read = rel => fs.readFileSync(path.join(editorRoot, rel), 'utf8');

/** A document just big enough for the Plugins menu: elements that hold children and can be found again. */
function fakeDocument() {
    const make = tag => {
        const el = {
            tagName: tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attributes: {},
            setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return this.attributes[k]; },
            appendChild(child) { child.parent = this; this.children.push(child); return child; },
            append(...kids) { kids.forEach(k => this.appendChild(k)); },
            remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; },
            querySelector(sel) {
                const cls = sel.replace(/^.*\./, '');
                const walk = node => { for (const c of node.children) { if (String(c.className).split(' ').includes(cls)) return c; const f = walk(c); if (f) return f; } return null; };
                return walk(this);
            }
        };
        return el;
    };
    const submenu = make('div');
    return { submenu, document: { createElement: make, getElementById: id => (id === 'submenu-plugins' ? submenu : null), querySelector: () => null, head: make('head') } };
}

function load() {
    const { submenu, document } = fakeDocument();
    const context = { console, document, require, setTimeout, Promise, window: null };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(read('src/EditorPlugins.js'), context);
    return { context, submenu, api: context.RREditorPlugins, editor: context.ReactorEditor };
}

test('an editor plugin adds a Plugins entry, hears the editor\'s moments, and all it added goes when the project closes', async () => {
    const { api, editor, submenu } = load();
    const plugin = editor.plugin('Example');
    let ran = 0, saved = 0, disposed = 0;
    plugin.addMenuItem({ label: 'Do It', action: () => ran++ });
    plugin.on('saved', () => saved++);
    plugin.on('nonsense', () => { throw new Error('never'); });
    plugin.onDispose(() => disposed++);
    const item = submenu.children.find(c => c.className.includes('rr-editor-plugin-item'));
    assert.ok(item, 'under Plugins');
    assert.equal(api.runMenuAction(item.getAttribute('data-action')), true);
    assert.equal(ran, 1);
    api.emit('saved', {});
    assert.equal(saved, 1);
    // A plugin's error is reported and does not stop the others or the editor.
    plugin.on('mapLoaded', () => { throw new Error('a broken plugin'); });
    assert.doesNotThrow(() => api.emit('mapLoaded', {}));
    await api.unloadAll();
    assert.equal(disposed, 1);
    assert.equal(submenu.children.filter(c => c.className.includes('rr-editor-plugin-item')).length, 0, 'its entry is gone');
    assert.deepEqual([...api.loaded()], []);
    assert.deepEqual([...editor.events], ['projectOpened', 'mapLoaded', 'beforeSave', 'saved', 'playtest', 'projectClosing']);
});

test('the Demo carries the example editor plugin in a list the loader reads (on or off: the owner\'s setting)', () => {
    const { api } = load();
    const list = api.readList(demo);
    const stats = list.find(entry => entry.name === 'RR_MapStats');
    assert.ok(stats && typeof stats.status === 'boolean');
    const source = fs.readFileSync(path.join(demo, 'js', 'editor-plugins', 'RR_MapStats.js'), 'utf8');
    assert.match(source, /@target ReactorEditor/);
    assert.match(source, /ReactorEditor\.plugin\('RR_MapStats'\)/);
    assert.match(source, /plugin\.addMenuItem\(/);
    assert.match(source, /plugin\.addToolbarButton\(\{ title: 'Map Statistics', icon,/, 'a toolbar button with its own icon');
    assert.ok(fs.existsSync(path.join(demo, 'js', 'editor-plugins', 'RR_MapStats', 'icon.svg')), 'its icon in a folder of its own');
    const apiSource = read('src/EditorPlugins.js');
    assert.match(apiSource, /addToolbarButton\(\{ title, icon, action \} = \{\}\)/);
    assert.match(apiSource, /element\.classList\.add\('rr-build-floating-dock'\); canvas\.appendChild\(element\);/, 'its panel floats: the map is not narrowed and drawn again');
});

test('the editor hooks the plugins in: project open and close, map, save, playtest, the Plugins menu; game builds and the Workshop leave them out', () => {
    assert.match(read('src/ProjectController.js'), /RREditorPlugins\?\.loadForProject\?\.\(this\.currentProject\.path\)/);
    assert.match(read('src/ProjectController.js'), /await window\.RREditorPlugins\?\.unloadAll\?\.\(\)/);
    assert.match(read('src/ProjectController.js'), /emit\?\.\('beforeSave'/);
    assert.match(read('src/ProjectController.js'), /emit\?\.\('saved'/);
    assert.match(read('src/main.js'), /emit\?\.\('mapLoaded'/);
    assert.match(read('src/PlaytestManager.js'), /emit\?\.\('playtest'/);
    assert.match(read('src/UIManager.js'), /action\.startsWith\('editor-plugin:'\)/);
    assert.ok(read('index.html').includes('<script src="src/EditorPlugins.js"></script>'));
    for (const file of ['build-scripts/build-worker.js', 'build-scripts/build.js']) assert.match(read(file), /parts\[0\] === 'js' && \(parts\[1\] === 'editor-plugins' \|\| parts\[1\] === 'reactor_editor_plugins\.js'\)\) return true;/, file);
    // A reactor_*.js the project owns, not the runtime's: the runtime sync and the editor's packaging keep it.
    assert.match(read('build-scripts/sync-runtime.cjs'), /const PER_PROJECT = new Set\(\['reactor_plugins\.js', 'reactor_editor_plugins\.js'\]\);/);
    assert.match(read('build-scripts/dist-editor-worker.js'), /const STARTER_OWN_LISTS = \['reactor_plugins\.js', 'reactor_editor_plugins\.js'\];/);
    // And the staging rule itself, run: the editor's plugins out of js/, the game's own in.
    const src = read('build-scripts/build-worker.js');
    const fnText = src.slice(src.indexOf('function isStagingExcluded('), src.indexOf('\n}\n', src.indexOf('function isStagingExcluded(')) + 2);
    const sandbox = { path, EXCLUDED: new Set(), NEVER_SHIPPED: new Set() };
    vm.runInNewContext(fnText + '\nthis.isStagingExcluded = isStagingExcluded;', sandbox);
    assert.equal(sandbox.isStagingExcluded(path.join('js', 'editor-plugins', 'RR_MapStats.js')), true);
    assert.equal(sandbox.isStagingExcluded(path.join('js', 'editor-plugins', 'RR_MapStats', 'icon.svg')), true);
    assert.equal(sandbox.isStagingExcluded(path.join('js', 'reactor_editor_plugins.js')), true);
    assert.equal(sandbox.isStagingExcluded(path.join('js', 'plugins', 'RR_DayNight.js')), false);
    assert.equal(sandbox.isStagingExcluded(path.join('js', 'reactor_plugins.js')), false);
    const Projects = require('../src/steam/WorkshopProjects.js');
    assert.notEqual(Projects.excluded('js/editor-plugins/RR_MapStats.js'), '', 'a shared project carries no editor plugin');
    assert.notEqual(Projects.excluded('js/reactor_editor_plugins.js'), '', 'nor their list');
});

test('the Plugin Manager has two tabs: the game\'s plugins and the editor\'s own, each in its own folder and list', () => {
    const source = read('src/PluginManager.js');
    assert.match(source, /\[\['game', 'Game Plugins'\], \['editor', 'Editor Plugins'\]\]/);
    assert.match(source, /async switchScope\(scope\)/);
    global.window = {};
    const PluginManager = require('../src/PluginManager.js');
    delete global.window;
    const manager = Object.create(PluginManager.prototype);
    manager.path = path;
    manager.fs = fs;
    manager.scope = 'game';
    assert.equal(manager.pluginDir('/p'), path.join('/p', 'js', 'plugins'));
    manager.scope = 'editor';
    assert.equal(manager.pluginDir('/p'), path.join('/p', 'js', 'editor-plugins'));
    assert.equal(manager.resolvePluginsPath(demo), path.join(demo, 'js', 'reactor_editor_plugins.js'));
});

test('RR_DayNight runs only in RPG Reactor: under MZ it says so and does nothing; under Reactor it drives the 3D light', () => {
    const source = fs.readFileSync(path.join(demo, 'js', 'plugins', 'RR_DayNight.js'), 'utf8');
    const run = withReactor => {
        const commands = {}, ambient = [], switched = [], warnings = [];
        function Scene_Map() {}
        Scene_Map.prototype.start = function() {};
        Scene_Map.prototype.update = function() {};
        Scene_Map.prototype.isActive = () => true;
        const ctx = {
            console: { warn: m => warnings.push(m), log() {} },
            PluginManager: { parameters: () => ({ hourVariable: '5', secondsPerHour: '1', startHour: '20', lampTag: 'village', nightStart: '19', nightEnd: '6' }), registerCommand: (p, n, f) => { commands[n] = f; } },
            Scene_Map, $gameSystem: {}, $gameVariables: { data: {}, value(id) { return this.data[id] || 0; }, setValue(id, v) { this.data[id] = v; } }
        };
        if (withReactor) ctx.Reactor3D = { setMapAmbient: (v, d) => ambient.push([v, d]), switchLight: (t, s) => switched.push([t, s]) };
        vm.createContext(ctx);
        vm.runInContext(source, ctx);
        return { ctx, commands, ambient, switched, warnings };
    };
    const mz = run(false);
    assert.deepEqual(Object.keys(mz.commands), []);
    assert.match(mz.warnings[0], /needs RPG Reactor/);
    const rr = run(true);
    assert.deepEqual(Object.keys(rr.commands).sort(), ['PauseClock', 'ResumeClock', 'SetHour']);
    new rr.ctx.Scene_Map().start();
    assert.equal(rr.ctx.$gameVariables.value(5), 20, 'the hour in its variable');
    assert.deepEqual(rr.switched[0], ['#village', 'on'], 'lamps on at 20:00');
    assert.ok(rr.ambient[0][0].intensity < 0.6, 'evening light');
    rr.commands.SetHour({ hour: 12 });
    assert.deepEqual(rr.switched[1], ['#village', 'off'], 'and off by day');
    assert.equal(rr.ambient.at(-1)[0].intensity, 1);
    const list = fs.readFileSync(path.join(demo, 'js', 'reactor_plugins.js'), 'utf8');
    assert.match(list, /"name": "RR_DayNight",\s*"status": false/, 'in the Demo, off: the owner\'s game is unchanged');
});

test('the guide is there and names both kinds', () => {
    const guide = fs.readFileSync(path.join(repoRoot, 'docs', 'PLUGIN-DEVELOPMENT.md'), 'utf8');
    for (const words of ['Game plugins', 'Editor plugins', 'ReactorEditor.plugin', 'RR_DayNight', 'RR_MapStats', '@target Reactor', '`MZ Reactor`', '`ReactorEditor`']) assert.ok(guide.includes(words), words);
});

test('@target: RPG Reactor\'s own game plugins, RPG Maker\'s, the editor\'s; the Plugin Manager tells a plugin in the wrong tab', () => {
    global.window = {};
    const PluginManager = require('../src/PluginManager.js');
    delete global.window;
    const head = target => `/*:\n * ${target}\n * @plugindesc x\n */`;
    assert.deepEqual(PluginManager.targetsFrom(head('@target Reactor')), ['Reactor']);
    assert.deepEqual(PluginManager.targetsFrom(head('@target RPGReactor')), ['Reactor'], 'the same');
    assert.deepEqual(PluginManager.targetsFrom(head('@target MZ Reactor')), ['Reactor', 'MZ']);
    assert.deepEqual(PluginManager.targetsFrom(head('@target MZ')), ['MZ']);
    assert.deepEqual(PluginManager.targetsFrom(head('@target ReactorEditor')), ['ReactorEditor']);
    assert.deepEqual(PluginManager.targetsFrom('/*:\n * @plugindesc none\n */'), []);
    assert.deepEqual(PluginManager.targetsFrom(fs.readFileSync(path.join(demo, 'js', 'plugins', 'RR_DayNight.js'), 'utf8')), ['Reactor'], 'the Demo\'s example is written for RPG Reactor');
    const manager = Object.create(PluginManager.prototype);
    manager._tt = s => s;
    manager.scope = 'game';
    assert.equal(manager.targetNote(['Reactor']), null);
    assert.equal(manager.targetNote(['ReactorEditor']).level, 'warn', 'an editor plugin among the game\'s');
    assert.equal(manager.targetNote([]).level, 'note');
    manager.scope = 'editor';
    assert.equal(manager.targetNote(['ReactorEditor']), null);
    assert.equal(manager.targetNote(['Reactor']).level, 'warn', 'a game plugin among the editor\'s');
});
