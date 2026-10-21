'use strict';
// The maps past a map's border in the editor's 3D view (editor/src/utils/MapNeighborView.js, on
// Reactor3D.Neighbors): a neighbor is read and built once, after the map being edited is drawn,
// with the view's own loaders; its shift moves the same world; another map, None or a file
// written replaces or removes it; it stands through a rebuild of the map being edited; the
// Surroundings tick hides it; nothing here needs a game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const root = path.resolve(__dirname, '..', '..');
const plain = value => JSON.parse(JSON.stringify(value === undefined ? null : value));
const tick = () => new Promise(resolve => setImmediate(resolve));

/** The 3D runtime and the view's module with no game behind them, as the editor holds them; a project of files in memory. */
function world() {
    const read = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');
    const frames = [];
    const ctx = { console: { log() {}, warn() {}, error: console.error, debug() {} }, performance, setTimeout, clearTimeout, TextDecoder,
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; } };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis; self = globalThis;', ctx);
    vm.runInContext(read('libs/three.js'), ctx, { filename: 'three.js' });
    const core = read('reactor_3d.js');
    const listed = Array.from(core.match(/Reactor3D\.EXTENSIONS = \[([\s\S]*?)\];/)[1].matchAll(/file: "([^"]+)"/g), m => m[1]);
    for (const file of ['reactor_3d.js', ...listed]) vm.runInContext(read(file), ctx, { filename: file });
    const R = ctx.Reactor3D, T = ctx.THREE, N = R.Neighbors;
    const view = { shown: true };
    ctx.RRMapEdges = { visible: () => view.shown };
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapNeighborView.js'), 'utf8'), ctx, { filename: 'MapNeighborView.js' });

    // A scene that keeps what it was asked: the world of a map, without drawing one.
    const made = [];
    R.MapScene = function(map, bitmaps, options) {
        made.push(this);
        Object.assign(this, { map, bitmaps, options, lays: [], laid: [], _scene: new T.Scene(), _surroundMap: map,
            _surroundNone: options.surroundNone || null, _surroundOrigin: options.surroundOrigin || null, _groundFrame: { shift: new T.Vector3(), place: new T.Vector3() } });
    };
    R.MapScene.prototype.addSurround = function() { this.lays.push(plain(this._surroundNone)); };
    R.MapScene.prototype.addPieces = function(map, load) { this.laid.push(['pieces', load('Stone')]); };
    R.MapScene.prototype.addWater = function(map, load) { this.laid.push(['water', load('Water')]); };
    R.MapScene.prototype.destroy = function() { this.destroyed = true; this._scene = null; };

    const files = new Map();
    const write = (id, map, sidecar) => {
        const stem = path.join('/project', 'data', 'Map' + String(id).padStart(3, '0'));
        const put = (file, value) => files.set(file, { text: JSON.stringify(value), mtimeMs: (files.get(file)?.mtimeMs || 1000) + 1 });
        put(stem + '.json', map);
        if (sidecar) put(stem + '.r3d.json', sidecar);
    };
    const reads = [];
    const disk = {
        statSync(file) { const f = files.get(file); if (!f) throw new Error('ENOENT'); return { mtimeMs: f.mtimeMs, size: f.text.length }; },
        existsSync: file => files.has(file),
        promises: { readFile: async file => { reads.push(path.basename(file)); return files.get(file).text; } },
        writeFileSync() { throw new Error('the view writes nothing'); }
    };
    const map = { id: 5, width: 200, height: 200, data: [], reactor3d: { surround: { style: 'mountains', neighbors: { east: { map: 8 } } } } };
    const mainScene = none => ({ _scene: new T.Scene(), _surroundNone: none || null, lays: [], addSurround(m) { this.lays.push(plain(this._surroundNone)); this.from = m; } });
    const editor = {
        enabled: true, fs: disk, path, renders: 0, loads: [],
        projectPath: () => '/project', currentMap: () => editor.map, map, mapScene: null,
        projectController: { databaseManager: { getTileset: id => ({ id, flags: [id, 16] }) } },
        loadSheets: async tileset => { editor.loads.push('sheets:' + tileset.id); return { 0: 'sheet' }; },
        loadParallaxes: async () => ({ Sky: 'sky image' }),
        loadMaterials: async () => ({ Stone: 'stone image' }),
        materialSettings: { Stone: { rough: 1 } },
        tilePixels: () => 48,
        requestRender() { this.renders++; },
        disposeModelCopy() {}
    };
    /** The view's own rebuild (MapEditor3D.rebuild / clearScene), in its order. */
    editor.rebuild = () => {
        if (editor.mapScene) { ctx.RRMapNeighborView.hold(editor); editor.mapScene._scene = null; }
        editor.mapScene = mainScene(ctx.RRMapNeighborView.noneFor(editor, editor.map));
        ctx.RRMapNeighborView.sync(editor);
        return editor.mapScene;
    };
    const frame = () => { for (const fn of frames.splice(0)) fn(); };
    /** Files read and every frame the view asked for run, until it asks for no more. */
    const settle = async () => { for (let i = 0; i < 40; i++) { await tick(); frame(); } assert.equal(frames.length, 0, 'the view stops asking for frames'); };
    write(8, { width: 120, height: 120, tilesetId: 3, data: [] }, { surround: { style: 'continue' } });
    write(1, { width: 50, height: 50, tilesetId: 2, data: [] }, null);
    return { ctx, R, T, N, view, V: ctx.RRMapNeighborView, editor, map, made, files, write, reads, frame, settle, frames };
}

test('what is done about a side: nothing, wait, build, move, keep or remove', () => {
    const { V } = world();
    const at = (map, stamp, x, z) => ({ map, stamp, x, z });
    assert.equal(V.step(null, null), 'none');
    assert.equal(V.step(at(8, 'a', 200, 0), null), 'remove', 'the side names no map any more');
    assert.equal(V.step(null, at(8, null, 0, 0)), 'wait', 'its files are still being read');
    assert.equal(V.step(at(8, 'a', 200, 0), at(8, null, 0, 0)), 'wait', 'what stands stays until they are');
    assert.equal(V.step(at(1, 'a', 200, 0), at(8, null, 0, 0)), 'remove', 'another map\'s world does not');
    assert.equal(V.step(null, at(8, 'a', 200, 0)), 'build');
    assert.equal(V.step(at(1, 'a', 200, 0), at(8, 'a', 200, 0)), 'build', 'another map was chosen');
    assert.equal(V.step(at(8, 'a', 200, 0), at(8, 'b', 200, 0)), 'build', 'its files were written');
    assert.equal(V.step(at(8, 'a', 200, 0), at(8, 'a', 200, -20)), 'move', 'its shift changed: nothing is built');
    assert.equal(V.step(at(8, 'a', 200, 0), at(8, 'a', 200, 0)), 'keep');
});

test('a map\'s files are known by when they were written; a map without a file has none', () => {
    const { V } = world();
    const stat = (mtimeMs, size) => ({ mtimeMs, size });
    assert.equal(V.stamp(null, stat(1, 2)), '');
    assert.equal(V.stamp(stat(10, 300), null), '10:300|-');
    assert.notEqual(V.stamp(stat(10, 300), stat(20, 40)), V.stamp(stat(10, 300), stat(21, 40)), 'the 3D notes were written');
    assert.notEqual(V.stamp(stat(10, 300), stat(20, 40)), V.stamp(stat(11, 300), stat(20, 40)), 'the map was written');
    assert.equal(V.stamp(stat(10, 300), stat(20, 40)), V.stamp(stat(10, 300), stat(20, 40)));
});

test('this map lays no land where a neighbor stands: all of a side, or the part beside it', () => {
    const { V, N } = world();
    const map = { width: 200, height: 200 };
    assert.equal(V.noneOf(map, {}), null);
    assert.deepEqual(plain(V.noneOf(map, { east: { width: 120, height: 120, x: 200, z: 0 } })), { east: { from: 0, to: 120 } });
    assert.deepEqual(plain(V.noneOf(map, { east: { width: 120, height: 120, x: 200, z: -20 } })), { east: { from: 0, to: 100 } });
    assert.deepEqual(plain(V.noneOf(map, { north: { width: 300, height: 40, x: -50, z: -40 }, east: { width: 10, height: 10, x: 200, z: 400 } })), { north: true }, 'one beside none of the side leaves it its land');
    // Both maps' parts of the shared side, as the game cuts them.
    assert.deepEqual(plain(N.shared(map, { width: 120, height: 120 }, 'east', { x: 200, z: -20 })), { mine: { from: 0, to: 100 }, theirs: { from: 20, to: 120 } });
    assert.deepEqual(plain(N.shared(map, { width: 120, height: 120 }, 'south', { x: 80, z: 200 })), { mine: { from: 80, to: 200 }, theirs: true });
});

test('a neighbor is read and built once, after the map is drawn, with the view\'s own loaders and no game', async () => {
    const w = world(), { editor, V, N } = w;
    const main = editor.rebuild();
    assert.equal(w.made.length, 0, 'nothing built with the map itself');
    assert.equal(main._neighborBodies.east, undefined);
    await w.settle();
    assert.equal(w.made.length, 1);
    const body = main._neighborBodies.east, scene = body.scene;
    assert.deepEqual([body.mapId, plain(body.offset), body.group.parent === main._scene, scene._scene.parent === body.group], [8, { x: 200, z: 0 }, true, true]);
    assert.deepEqual([body.group.position.x, body.group.position.z, scene._groundFrame.shift.x], [200, 0, 200]);
    // Its own files, read once; its tileset from the editor's database; the view's loaders and tile size.
    assert.deepEqual(w.reads, ['Map008.json', 'Map008.r3d.json']);
    assert.equal(scene.map.reactor3d.surround.style, 'continue');
    assert.deepEqual(editor.loads, ['sheets:3']);
    assert.deepEqual([scene.options.body, scene.options.staged, scene.options.tilesetId, plain(scene.options.flags), scene.options.tileSize, scene.options.rockWorkers], [true, true, 3, [3, 16], 48, false]);
    assert.deepEqual([scene.options.loadParallax('Sky'), scene.options.loadMaterial('Stone'), plain(scene.options.loadMaterialSettings('Stone')), scene.options.loadMaterial('Missing')], ['sky image', 'stone image', { rough: 1 }, null]);
    // Its place in the world, and each map's land along the shared side.
    assert.deepEqual([plain(scene.options.surroundOrigin), plain(scene.options.surroundNone), plain(main._surroundNone)], [{ x: 200, z: 0 }, { west: true }, { east: { from: 0, to: 120 } }]);
    assert.deepEqual(plain(main.lays.at(-1)), { east: { from: 0, to: 120 } });
    assert.equal(main.from, editor.map, 'laid from the map as it stands');
    // Its pieces and its water on the frames after, with the view's material loader.
    assert.deepEqual(plain(scene.laid), [['pieces', 'stone image'], ['water', null]]);
    assert.equal(body.stage, 0);
    // No game was made up for it.
    assert.equal('$dataMap' in w.ctx, false);
    assert.ok(editor.renders > 0);
    // Nothing more is read or built while nothing changes.
    V.sync(editor); V.sync(editor);
    await w.settle();
    assert.deepEqual([w.made.length, w.reads.length, main._neighborBodies.east === body], [1, 2, true]);
});

test('a shift moves the world that stands: nothing is read or built, both lands are laid again', async () => {
    const w = world(), { editor, V } = w;
    const main = editor.rebuild();
    await w.settle();
    const body = main._neighborBodies.east, scene = body.scene, lays = [main.lays.length, scene.lays.length];
    editor.map.reactor3d.surround.neighbors.east = { map: 8, shift: -20 };
    assert.equal(V.sync(editor), true, 'this map\'s land was laid by the move');
    assert.equal(main._neighborBodies.east, body);
    assert.deepEqual([plain(body.offset), body.group.position.z, scene._groundFrame.shift.z, scene._groundFrame.place.z, plain(scene._surroundOrigin)], [{ x: 200, z: -20 }, -20, -20, -20, { x: 200, z: -20 }]);
    assert.deepEqual([plain(main._surroundNone), plain(scene._surroundNone)], [{ east: { from: 0, to: 100 } }, { west: { from: 20, to: 120 } }]);
    assert.deepEqual([main.lays.length - lays[0], scene.lays.length - lays[1]], [1, 1], 'each land once');
    assert.deepEqual([w.made.length, w.reads.length], [1, 2]);
    // A change that is not the neighbor's (the hills) leaves the land to whoever asked.
    editor.map.reactor3d.surround.rough = 1;
    assert.equal(V.sync(editor), false);
    assert.equal(main.lays.length - lays[0], 1);
    // Back (an undo): the same world again.
    editor.map.reactor3d.surround.neighbors.east = { map: 8 };
    V.sync(editor);
    assert.deepEqual([plain(body.offset), plain(main._surroundNone), main._neighborBodies.east === body, w.made.length], [{ x: 200, z: 0 }, { east: { from: 0, to: 120 } }, true, 1]);
});

test('another map or None replaces or removes it; a file written builds it again', async () => {
    const w = world(), { editor, V } = w;
    const main = editor.rebuild();
    await w.settle();
    const first = main._neighborBodies.east.scene;
    editor.map.reactor3d.surround.neighbors.east = { map: 1 };
    V.sync(editor);
    assert.deepEqual([first.destroyed, main._neighborBodies.east, plain(main._surroundNone)], [true, undefined, null], 'the old world goes at once, and the land comes back');
    await w.settle();
    const room = main._neighborBodies.east;
    assert.deepEqual([room.mapId, room.scene.options.tilesetId, room.scene.map.reactor3d, plain(main._surroundNone)], [1, 2, undefined, { east: { from: 0, to: 50 } }]);
    delete editor.map.reactor3d.surround.neighbors;
    V.sync(editor);
    assert.deepEqual([room.scene.destroyed, Object.keys(main._neighborBodies), plain(main._surroundNone), plain(main.lays.at(-1))], [true, [], null, null]);
    // Back to the road: built again from what was read, its files being as they were.
    editor.map.reactor3d.surround.neighbors = { east: { map: 8 } };
    V.sync(editor);
    await w.settle();
    const again = main._neighborBodies.east;
    assert.deepEqual([again.mapId, w.reads.filter(name => name === 'Map008.json').length], [8, 1], 'a map read stays read while its files do');
    // The neighbor is saved from its own editor: the world that stands is replaced once the files are read.
    w.write(8, { width: 100, height: 120, tilesetId: 3, data: [] }, { surround: { style: 'ocean' } });
    V.sync(editor);
    assert.equal(main._neighborBodies.east, again, 'what stands stays until then');
    await w.settle();
    const fresh = main._neighborBodies.east;
    assert.deepEqual([again.scene.destroyed, fresh.scene.map.width, fresh.scene.map.reactor3d.surround.style, w.reads.filter(name => name === 'Map008.json').length], [true, 100, 'ocean', 2]);
    // A map with no file is no neighbor.
    editor.map.reactor3d.surround.neighbors = { east: { map: 77 } };
    V.sync(editor);
    await w.settle();
    assert.deepEqual(Object.keys(main._neighborBodies), []);
});

test('it stands through a rebuild of the map being edited, and goes with the map or the view', async () => {
    const w = world(), { editor, V } = w;
    const main = editor.rebuild();
    await w.settle();
    const body = main._neighborBodies.east, scene = body.scene;
    const next = editor.rebuild();
    assert.notEqual(next, main);
    assert.deepEqual(plain(next._surroundNone), { east: { from: 0, to: 120 } }, 'the new scene is built without land there');
    assert.equal(next.lays.length, 0, 'and lays nothing a second time');
    const stood = next._neighborBodies.east;
    assert.deepEqual([stood.scene === scene, scene.destroyed, stood.group.parent === next._scene, scene._scene.parent === stood.group, scene._groundFrame.shift.x, stood.stage], [true, undefined, true, true, 200, 0]);
    await w.settle();
    assert.deepEqual([w.made.length, w.reads.length], [1, 2]);
    // A rebuild while it is still being laid: the rest is laid in the next scene.
    editor.map.reactor3d.surround.neighbors.east = { map: 1 };
    V.sync(editor);
    for (let i = 0; i < 6 && !next._neighborBodies.east; i++) { await tick(); w.frame(); }
    const half = next._neighborBodies.east;
    assert.equal(half.stage, 1, 'its floor only');
    const third = editor.rebuild();
    await w.settle();
    assert.deepEqual([third._neighborBodies.east.scene === half.scene, third._neighborBodies.east.stage, plain(half.scene.laid.map(part => part[0]))], [true, 0, ['pieces', 'water']]);
    // Another map comes up: nothing of this one's is kept.
    editor.map = { id: 9, width: 30, height: 30, data: [], reactor3d: {} };
    const other = editor.rebuild();
    await w.settle();
    assert.deepEqual([half.scene.destroyed, Object.keys(other._neighborBodies), other._surroundNone, V.state(editor).records.size], [true, [], null, 0]);
    // The view closes.
    editor.map = w.map;
    editor.map.reactor3d.surround.neighbors = { east: { map: 8 } };
    const last = editor.rebuild();
    await w.settle();
    const standing = last._neighborBodies.east.scene;
    V.hold(editor);
    V.dispose(editor);
    assert.deepEqual([standing.destroyed, Object.keys(V.state(editor).held), V.state(editor).records.size], [true, [], 0]);
});

test('the Surroundings tick hides it with the land; hidden, a neighbor is not built until it is shown', async () => {
    const w = world(), { editor, V, view } = w;
    view.shown = false;
    const main = editor.rebuild();
    await w.settle();
    assert.equal(w.made.length, 0);
    view.shown = true;
    V.setVisible(editor, true);
    await w.settle();
    const body = main._neighborBodies.east;
    assert.deepEqual([w.made.length, body.group.visible], [1, true]);
    view.shown = false;
    V.setVisible(editor, false);
    assert.equal(body.group.visible, false);
    // Moved while hidden, it is where it belongs when shown.
    editor.map.reactor3d.surround.neighbors.east = { map: 8, shift: 7 };
    V.sync(editor);
    assert.deepEqual([body.group.visible, body.group.position.z], [false, 7]);
    // A pass that draws over the frame leaves it out, and puts it back only when it is shown.
    V.pass(editor, true);
    assert.equal(body.group.visible, false);
    view.shown = true;
    V.setVisible(editor, true);
    assert.deepEqual([body.group.visible, w.made.length], [true, 1]);
    V.pass(editor, false);
    assert.equal(body.group.visible, false);
    V.pass(editor, true);
    assert.equal(body.group.visible, true);
});

test('a neighbor\'s map is the map everything reads only where a game holds one', () => {
    const { ctx, N } = world();
    const theirs = { id: 8 };
    assert.equal(N.within(theirs, null, () => '$dataMap' in ctx), false, 'no game: nothing is made up');
    assert.equal('$dataMap' in ctx, false);
    ctx.$dataMap = { id: 5 };
    assert.equal(N.within(theirs, null, () => ctx.$dataMap), theirs);
    assert.equal(ctx.$dataMap.id, 5);
});
