// A runtime wrapper must not keep a method its class only inherits: `const _x = Child.prototype.m` taken while
// Child has no `m` of its own captures the parent's function as it was when the file loaded, so a plugin that
// replaces the parent's method later (a menu background, a list's row backing) never reaches Child. Star Shift
// Rebellion's Save and Load screens crashed that way: a plugin makes the menu background a sprite, and the
// kept stock createBackground treated it as a bitmap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtimeDir = path.resolve(__dirname, '..', '..', 'runtime');
// reactor_3d*.js are scanned by their own owners.
const files = fs.readdirSync(runtimeDir).filter(name => /^reactor_.*\.js$/.test(name) && !/^reactor_3d/.test(name));
const sources = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(runtimeDir, name), 'utf8')]));

test('no wrapper keeps a method its class only inherits', () => {
    const all = Object.values(sources).join('\n');
    const defined = new Map();
    for (const m of all.matchAll(/^\s*([A-Z][A-Za-z_0-9]*)\.prototype\.([A-Za-z_0-9$]+)\s*=\s*function/gm)) {
        const key = m[1] + '.' + m[2]; defined.set(key, (defined.get(key) || 0) + 1);
    }
    const kept = new Map();
    for (const [name, text] of Object.entries(sources)) {
        for (const m of text.matchAll(/(?:const|var|let)\s+_[A-Za-z_0-9$]+\s*=\s*([A-Z][A-Za-z_0-9]*)\.prototype\.([A-Za-z_0-9$]+)\s*;/g)) {
            const key = m[1] + '.' + m[2];
            kept.set(key, (kept.get(key) || []).concat(name + ':' + (text.slice(0, m.index).split('\n').length)));
        }
    }
    // A class that defines the method no more often than wrappers keep it has no definition of its own under them.
    const inherited = Array.from(kept).filter(([key, sites]) => (defined.get(key) || 0) <= sites.length).map(([key, sites]) => key + ' at ' + sites.join(', '));
    assert.deepEqual(inherited, []);
});

test('a plugin that replaces the menu background, the list row backing or the actor row after load reaches the save screens and the actor list', () => {
    const src = sources['reactor_windows.js'];
    const from = src.indexOf('    const parentOf = Class => Object.getPrototypeOf(Class.prototype);');
    const to = src.indexOf('    const _createListWindow = Scene_File.prototype.createListWindow;');
    assert.ok(from > 0 && to > from);
    const calls = [];
    const make = parent => { function C() {} C.prototype = Object.create(parent ? parent.prototype : Object.prototype); C.prototype.constructor = C; return C; };
    const Scene_MenuBase = make(), Scene_File = make(Scene_MenuBase), Window_Selectable = make(), Window_SavefileList = make(Window_Selectable);
    const Window_MenuStatus = make(Window_Selectable), Window_MenuActor = make(Window_MenuStatus);
    Scene_MenuBase.prototype.createBackground = function() { calls.push('stock background'); };
    Scene_MenuBase.prototype.needsCancelButton = function() { return 'stock'; };
    Window_Selectable.prototype.drawItemBackground = function() { calls.push('stock row'); };
    Window_Selectable.prototype.updatePadding = function() { calls.push('stock padding'); };
    Window_Selectable.prototype.refreshCursor = function() { calls.push('stock cursor'); };
    Window_MenuStatus.prototype.drawItem = function() { calls.push('stock actor row'); };
    const sandbox = { Scene_File, Scene_MenuBase, Window_SavefileList, Window_Selectable, Window_MenuStatus, Window_MenuActor, legacy: () => null, Sprite: function() {}, Bitmap: function() {}, Graphics: {} };
    const pick = start => { const a = src.indexOf(start); assert.ok(a > 0, start); return src.slice(a, src.indexOf('\n    };\n', a) + 7); };
    vm.runInNewContext(src.slice(from, to)
        + pick('    Window_SavefileList.prototype.updatePadding = function() {')
        + pick('    Window_SavefileList.prototype.drawItemBackground = function(index) {'), sandbox);
    // The actor list's two wrappers end in their legacy drawing: only their first lines are run here.
    for (const name of ['drawItem', 'refreshCursor']) {
        const a = src.indexOf(`    Window_MenuActor.prototype.${name} = function(`), line = src.slice(a, src.indexOf('\n', src.indexOf('if (!legacy()) return', a)));
        vm.runInNewContext(line + '\n    };', sandbox);
    }
    // The plugin arrives after the runtime.
    Scene_MenuBase.prototype.createBackground = function() { calls.push('plugin background'); };
    Scene_MenuBase.prototype.needsCancelButton = function() { return 'plugin'; };
    Window_Selectable.prototype.drawItemBackground = function() { calls.push('plugin row'); };
    Window_Selectable.prototype.updatePadding = function() { calls.push('plugin padding'); };
    Window_Selectable.prototype.refreshCursor = function() { calls.push('plugin cursor'); };
    Window_MenuStatus.prototype.drawItem = function() { calls.push('plugin actor row'); };
    const scene = new Scene_File(), list = new Window_SavefileList(), actors = new Window_MenuActor();
    scene.createBackground(); list.drawItemBackground(0); list.updatePadding(); actors.drawItem(0); actors.refreshCursor();
    assert.deepEqual(calls, ['plugin background', 'plugin row', 'plugin padding', 'plugin actor row', 'plugin cursor']);
    assert.equal(scene.needsCancelButton(), 'plugin');
});
