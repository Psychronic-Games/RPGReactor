'use strict';
// Roads painted on the ground (2026-10-24): the Path tool lays a road as wide as asked along a drag, with no gaps
// however fast the pointer went, or straight from end to end; the road is a ground type made once by its name.
// The Ground brush lays its dabs all the way along a stroke too. And a floor in hand lays a square of tiles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const editorRoot = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(editorRoot, p), 'utf8');
const quiet = { log() {}, warn() {}, error() {}, debug() {} };

function terrainOn(map) {
    const context = { console: quiet, setTimeout, clearTimeout,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, getElementById: () => null },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['MapElevation.js', 'MapFoliage.js', 'MapGround.js']) vm.runInNewContext(read('src/utils/' + file), context);
    vm.runInNewContext(read('src/TerrainManager.js') + '\nwindow.TerrainManager = TerrainManager;', context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    return { terrain, G: context.RRMapGround };
}
const mapOf = (w, h) => ({ id: 1, width: w, height: h, data: new Array(w * h * 6).fill(0), events: [], reactor3d: { version: 1, mode: '3d', room: { floor: 'Grass' } } });

test('a road dragged fast is one road, as wide as asked, with nothing missing between the pointer\'s steps', () => {
    const map = mapOf(40, 20); const { terrain, G } = terrainOn(map);
    terrain.setMode('path'); terrain.pathWidth = 3; terrain.setPathLook(terrain.constructor.PATH_SURFACES[1]);
    // The pointer seen only three times across thirty tiles.
    terrain.beginStroke({ x: 2, y: 9 }); terrain.paintAt({ x: 18, y: 9 }); terrain.paintAt({ x: 34, y: 9 }); terrain.endStroke();
    const types = G.types(map);
    assert.equal(types.length, 1);
    assert.equal(types[0].name, 'Cobblestone', 'the road made as a ground of its own name');
    assert.equal(types[0].bare, true, 'nothing grows on it');
    const levels = G.levelsOf(map, 0);
    for (let x = 3; x <= 34; x++) assert.ok(levels[9 * 40 + x] >= 8, 'painted at ' + x);
    assert.ok(levels[8 * 40 + 20] >= 8 && levels[10 * 40 + 20] >= 8, 'three tiles wide');
    assert.equal(levels[5 * 40 + 20], 0, 'and no wider');
    assert.equal(terrain.undoStack.length, 2, 'the new ground, then the stroke: each an undo step');
    // The same road again: no second ground of that name.
    terrain.beginStroke({ x: 2, y: 15 }); terrain.paintAt({ x: 10, y: 15 }); terrain.endStroke();
    assert.equal(G.types(map).length, 1);
});

test('a Line road runs straight from where the drag began to where it ended, whatever the pointer did between', () => {
    const map = mapOf(30, 30); const { terrain, G } = terrainOn(map);
    terrain.setMode('path'); terrain.pathShape = 'line'; terrain.pathWidth = 2;
    terrain.beginStroke({ x: 2, y: 2 }); terrain.paintAt({ x: 25, y: 5 }); terrain.paintAt({ x: 20, y: 20 }); terrain.endStroke();
    const levels = G.levelsOf(map, 0);
    for (let t = 0; t <= 18; t++) assert.ok(levels[(2 + t) * 30 + (2 + t)] >= 8, 'on the diagonal at ' + (2 + t));
    assert.equal(levels[5 * 30 + 25], 0, 'nothing where the pointer only passed');
});

test('the Ground brush lays its dabs all along a fast stroke too', () => {
    const map = mapOf(40, 10); const { terrain, G } = terrainOn(map);
    terrain.setMode('ground'); terrain.addGroundType({ name: 'Sand', material: 'Sand' }); terrain.radius = 1; terrain.strength = 1;
    terrain.beginStroke({ x: 2, y: 4 }); terrain.paintAt({ x: 36, y: 4 }); terrain.endStroke();
    const levels = G.levelsOf(map, 0);
    for (let x = 3; x <= 36; x++) assert.ok(levels[4 * 40 + x] > 0, 'painted at ' + x);
});

test('a road levels the ground under it: flat across, still climbing the hill, smooth, and one undo takes road and levelling back', () => {
    const map = mapOf(40, 20); const { terrain, G } = terrainOn(map);
    // A hill rising west to east, with a bump across the middle of the way.
    const stride = 41;
    map.reactor3d.terrain = new Array(41 * 21).fill(0).map((_, i) => { const x = i % stride, z = Math.floor(i / stride); return x * 0.2 + (x === 20 ? 1.5 : 0) + (z - 10) * 0.3; });
    map.reactor3d.terrainWidth = 40;
    const before = map.reactor3d.terrain.slice();
    terrain.setMode('path'); terrain.pathWidth = 3; terrain.pathShape = 'line'; terrain.pathLevel = true;
    terrain.beginStroke({ x: 4, y: 9.5 }); terrain.paintAt({ x: 34, y: 9.5 }); terrain.endStroke();
    const h = (x, z) => map.reactor3d.terrain[z * stride + x];
    assert.ok(Math.abs(h(15, 9) - h(15, 11)) < 0.05, 'flat across the road');
    assert.ok(h(30, 10) > h(8, 10) + 3, 'still climbing the hill along it');
    assert.ok(Math.abs(h(20, 10) - (h(19, 10) + h(21, 10)) / 2) < 0.3, 'the bump smoothed away');
    assert.equal(h(15, 2), before[2 * stride + 15], 'the land well off the road untouched');
    // One step: road and levelling go together, and come back together.
    const steps = terrain.undoStack.filter(entry => Array.isArray(entry.steps));
    assert.equal(steps.length, 1);
    terrain.undo();
    assert.deepEqual(map.reactor3d.terrain.slice(), before, 'the ground as it was');
    assert.equal(G.levelsOf(map, 0)[10 * 40 + 20], 0, 'and no road');
    terrain.redo();
    assert.ok(Math.abs(h(15, 9) - h(15, 11)) < 0.05, 'redo levels it again');
    assert.ok(G.levelsOf(map, 0)[10 * 40 + 20] >= 8, 'and paints it again');
});

test('a curved road is clicked out point by point, drawn through them, laid with a second click on the last (or Enter), dropped with Escape', () => {
    const map = mapOf(40, 40); const { terrain, G } = terrainOn(map);
    terrain.setMode('path'); terrain.pathShape = 'curve'; terrain.pathWidth = 2; terrain.pathLevel = false;
    for (const p of [{ x: 5, y: 30 }, { x: 15, y: 10 }, { x: 30, y: 25 }]) { terrain.beginStroke(p); terrain.endStroke(); }
    assert.equal(terrain.pathPending(), true);
    assert.ok(G.levelsOf(map, 0)[10 * 40 + 15] >= 8, 'drawn through the points as they are clicked');
    terrain.hoverAt({ x: 36, y: 36 });
    assert.ok(G.levelsOf(map, 0)[36 * 40 + 36] >= 8, 'and on to the pointer');
    // Backspace takes the hover's and the last point's part away.
    assert.equal(terrain.handlePathKey({ key: 'Backspace' }), true);
    assert.equal(G.levelsOf(map, 0)[25 * 40 + 30], 0);
    // Twice on the last point: laid, one undo step.
    // (The last point was just clicked: a click on it again within the double-click time lays the road.)
    terrain._pathCurve.clickedAt = Date.now();
    terrain.beginStroke({ x: 15, y: 10 }); terrain.endStroke();
    assert.equal(terrain.pathPending(), false);
    assert.ok(G.levelsOf(map, 0)[10 * 40 + 15] >= 8);
    const painted = G.types(map)[0].paint;
    // Another, dropped with Escape: nothing of it stays.
    terrain.beginStroke({ x: 2, y: 2 }); terrain.endStroke(); terrain.beginStroke({ x: 30, y: 2 }); terrain.endStroke();
    assert.equal(terrain.handlePathKey({ key: 'Escape' }), true);
    assert.equal(G.types(map)[0].paint, painted, 'the dropped one left nothing');
});

test('a road may be any material, tint and scale; another look is another ground, and roads already laid keep theirs', () => {
    const map = mapOf(30, 20); const { terrain, G } = terrainOn(map);
    terrain.setMode('path'); terrain.pathWidth = 2; terrain.pathLevel = false;
    terrain.setPathLook({ material: 'Marble', tint: '#AA3344', scale: 2 });
    terrain.beginStroke({ x: 2, y: 4 }); terrain.paintAt({ x: 20, y: 4 }); terrain.endStroke();
    let types = G.types(map);
    assert.deepEqual(JSON.parse(JSON.stringify(types.map(t => [t.name, t.material, t.tint, t.scale, t.bare]))), [['Marble road', 'Marble', '#aa3344', 2, true]]);
    // Another tint: a ground of its own, painted from now on; the first road is as it was.
    terrain.setPathLook({ tint: '#336699' });
    terrain.beginStroke({ x: 2, y: 12 }); terrain.paintAt({ x: 20, y: 12 }); terrain.endStroke();
    types = G.types(map);
    assert.equal(types.length, 2);
    assert.equal(types[0].tint, '#aa3344', 'the first road keeps its tint');
    assert.equal(types[1].tint, '#336699');
    assert.notEqual(types[0].name, types[1].name, 'each its own name');
    assert.ok(G.levelsOf(map, 0)[4 * 30 + 10] >= 8 && G.levelsOf(map, 1)[12 * 30 + 10] >= 8);
    // One of the map's grounds taken into hand paints as that ground: no third type.
    terrain.setPathLook({ material: types[0].material, tint: types[0].tint, scale: types[0].scale, name: types[0].name });
    terrain.beginStroke({ x: 2, y: 16 }); terrain.paintAt({ x: 8, y: 16 }); terrain.endStroke();
    assert.equal(G.types(map).length, 2);
    assert.ok(G.levelsOf(map, 0)[16 * 30 + 5] >= 8);
});
