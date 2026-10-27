// The Ground tool draws as the other tools do: a brush, a straight Line, a Rectangle filled or outlined, and (when
// asked) levels the ground under what it paints, in the same undo step. Any material can be a ground.
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
    return { terrain, G: context.RRMapGround, E: context.RRMapElevation };
}
const mapOf = (w, h) => ({ id: 1, width: w, height: h, data: new Array(w * h * 6).fill(0), events: [], reactor3d: { version: 1, mode: '3d', room: { floor: 'Grass' } } });
const withGround = (w, h) => { const map = mapOf(w, h); const kit = terrainOn(map); kit.terrain.setMode('ground'); kit.terrain.addGroundType({ material: 'Marble' }); kit.terrain.groundLevel = 9; kit.terrain.strength = 1; return Object.assign(kit, { map }); };

test('any material is a ground of its own', () => {
    const { terrain, G, map } = withGround(10, 10);
    assert.equal(terrain.addGroundType({ material: 'My Picture', name: 'My Picture' }), 1);
    assert.equal(G.types(map)[1].material, 'My Picture');
});

test('a Line paints a straight band from where the drag began, whatever the pointer did between', () => {
    const { terrain, G, map } = withGround(40, 20);
    terrain.groundShape = 'line'; terrain.radius = 1.5;
    terrain.beginStroke({ x: 2, y: 10 }); terrain.paintAt({ x: 20, y: 2 }); terrain.paintAt({ x: 34, y: 10 }); terrain.endStroke();
    const levels = G.levelsOf(map, 0);
    for (let x = 3; x <= 34; x++) assert.ok(levels[10 * 40 + x] >= 8, 'along the line at ' + x);
    assert.equal(levels[3 * 40 + 20], 0, 'nothing left where the pointer wandered');
    assert.equal(terrain.undoStack.length, 2, 'the ground, then one stroke');
});

test('a Rectangle is filled, or only its edge as wide as the brush', () => {
    const { terrain, G, map } = withGround(30, 30);
    terrain.groundShape = 'rect'; terrain.groundRectFill = 'edge'; terrain.radius = 2;
    terrain.beginStroke({ x: 5, y: 5 }); terrain.paintAt({ x: 20, y: 18 }); terrain.endStroke();
    const levels = G.levelsOf(map, 0), at = (x, y) => levels[y * 30 + x];
    assert.ok(at(5, 5) && at(6, 10) && at(20, 18) && at(19, 12) && at(12, 6), 'the edge, two cells wide');
    assert.equal(at(12, 12), 0, 'an empty middle');
    assert.equal(at(7, 12), 0, 'no wider than two');
    terrain.groundRectFill = 'fill';
    terrain.beginStroke({ x: 5, y: 5 }); terrain.paintAt({ x: 20, y: 18 }); terrain.endStroke();
    assert.ok(G.levelsOf(map, 0)[12 * 30 + 12] >= 8, 'filled');
});

test('Level the ground under it: a filled rectangle is made flat at its own height and eases into the land; one undo takes both back', () => {
    const { terrain, G, E, map } = withGround(30, 30);
    const grid = E.ensureTerrain(map), stride = 31;
    for (let z = 0; z <= 30; z++) for (let x = 0; x <= 30; x++) grid[z * stride + x] = Math.sin(x * 0.7) * 1.5 + z * 0.1;
    const before = Array.from(grid);
    terrain.groundShape = 'rect'; terrain.groundRectFill = 'fill'; terrain.groundLevelUnder = true;
    terrain.beginStroke({ x: 8, y: 8 }); terrain.paintAt({ x: 16, y: 14 }); terrain.endStroke();
    const after = E.ensureTerrain(map);
    const inside = []; for (let z = 8; z <= 15; z++) for (let x = 8; x <= 17; x++) inside.push(after[z * stride + x]);
    assert.ok(Math.max(...inside) - Math.min(...inside) < 1e-6, 'flat inside');
    assert.equal(after[0], before[0], 'far away untouched');
    assert.notEqual(after[8 * stride + 7], before[8 * stride + 7], 'the shoulder eased toward it');
    assert.equal(terrain.undoStack[terrain.undoStack.length - 1].steps.length, 2, 'paint and level in one step');
    terrain.undo();
    assert.deepEqual(Array.from(E.ensureTerrain(map)), before, 'the ground back as it was');
    assert.equal(G.levelsOf(map, 0)[10 * 30 + 10], 0, 'and the paint gone');
});

test('Level the ground under a Line: flat across it; levelling is off unless asked, and never when erasing', () => {
    const { terrain, E, map } = withGround(40, 20);
    const grid = E.ensureTerrain(map), stride = 41;
    for (let z = 0; z <= 20; z++) for (let x = 0; x <= 40; x++) grid[z * stride + x] = z * 0.4;
    terrain.groundShape = 'line'; terrain.radius = 2;
    terrain.beginStroke({ x: 4, y: 10 }); terrain.paintAt({ x: 30, y: 10 }); terrain.endStroke();
    assert.equal(terrain.undoStack[terrain.undoStack.length - 1].steps, undefined, 'off by default');
    terrain.groundLevelUnder = true;
    terrain.beginStroke({ x: 4, y: 10 }); terrain.paintAt({ x: 30, y: 10 }); terrain.endStroke();
    const g = E.ensureTerrain(map);
    assert.ok(Math.abs(g[10 * stride + 15] - g[11 * stride + 15]) < 0.05, 'flat across the band');
    terrain.groundErase = true;
    terrain.beginStroke({ x: 4, y: 4 }); terrain.paintAt({ x: 30, y: 4 }); terrain.endStroke();
    const last = terrain.undoStack[terrain.undoStack.length - 1];
    assert.ok(!last || !last.steps, 'erasing levels nothing');
});
