// Walls hold water back: Pour and the refit after an edit read the pieces on
// each cell as ground up to the top of what holds water there.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');
function loadElevation(extra = {}) { const context = Object.assign({}, extra); context.window = context; vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context); return context.RRMapElevation; }
const flat = (W, H) => ({ id: 1, width: W, height: H, events: [null], reactor3d: { version: 1 } });
const ring = (E, map, kind, x0, y0, x1, y1, z = 0) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || y === y0 || y === y1) E.setPiece(map, { kind, x, y, z, rot: 0, material: '' });
};
const wet = (sheet, x, y) => x >= sheet.x0 && x <= sheet.x1 && y >= sheet.y0 && y <= sheet.y1 && (!sheet.mask || sheet.mask[(y - sheet.y0) * (sheet.x1 - sheet.x0 + 1) + (x - sheet.x0)] === '1');

test('what each piece holds back: walls and panes a storey, blocks a tile, windows to the sill; slabs, doorways, fences and raised pieces nothing', () => {
    const E = loadElevation();
    const map = flat(10, 4);
    const put = (kind, x, z = 0) => E.setPiece(map, { kind, x, y: 1, z, rot: 0, material: '' });
    put('wall', 0); put('glass', 1); put('block', 2); put('window', 3); put('doorway', 4); put('fence', 5); put('pillar', 6); put('ladder', 7);
    put('wall', 8); put('wall', 8, 5);          // stacked: one wall two storeys high
    put('doorway', 9); put('wall', 9, 5);       // a storey over a doorway: the water passes under it
    const walls = E.waterWalls(map), at = x => walls.get(1 * map.width + x) || 0;
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(at), [5, 5, 1, 1.5, 0, 0, 0, 0, 10, 0]);
    E.setPiece(map, { kind: 'block', x: 1, y: 2, z: 1, rot: 0, material: '' });
    assert.equal(E.waterWalls(map).get(2 * map.width + 1) || 0, 0, 'a block a tile up, with nothing under it, holds nothing');
    E.setPiece(map, { kind: 'floor', x: 2, y: 2, z: 0, rot: 0, material: '' }); E.setPiece(map, { kind: 'wall', x: 2, y: 2, z: 0, rot: 0, material: '' });
    assert.equal(E.waterWalls(map).get(2 * map.width + 2), 5, 'a slab under a wall on its cell');
    E.setPiece(map, { kind: 'floor', x: 3, y: 2, z: 0, rot: 0, material: '' });
    assert.equal(E.waterWalls(map).get(2 * map.width + 3) || 0, 0, 'water stands over a floor slab');
    assert.equal(E.waterWalls(flat(4, 4)), null);
});

test('a pond poured inside a walled room stays inside it, on flat ground with no terrain', () => {
    const E = loadElevation();
    const map = flat(12, 12);
    ring(E, map, 'wall', 3, 3, 7, 7);
    const sheet = E.fillWaterAt(map, 5, 5, 'Water');
    assert.ok(sheet, 'the room is a basin');
    assert.deepEqual([sheet.x0, sheet.y0, sheet.x1, sheet.y1], [4, 4, 6, 6], 'inside the walls only');
    assert.ok(sheet.level > 4.5 && sheet.level <= 5, `up to the walls' top (${sheet.level})`);
    assert.equal(E.waterBasin(map, 1, 1), null, 'outside, open ground is no basin');
});

test('a low wall holds water up to its top; water higher than it covers it', () => {
    const E = loadElevation();
    const map = flat(12, 12);
    ring(E, map, 'block', 3, 3, 7, 7);
    const pool = E.waterBasin(map, 5, 5);
    assert.ok(pool && Math.abs(pool.level - 1) < 1e-9 && pool.cells === 9, 'a block kerb holds a pool a tile deep');
    // A sheet standing higher than the kerb (poured before it was built) covers it and the ground around.
    map.reactor3d.water = [{ x0: 2, y0: 2, x1: 8, y1: 8, level: 1.5, material: '' }];
    assert.equal(E.refitWater(map), false, 'over the kerb nothing changes');
    map.reactor3d.water = [{ x0: 2, y0: 2, x1: 8, y1: 8, level: 0.8, material: '' }];
    assert.equal(E.refitWater(map), true);
    const sheet = E.water(map)[0];
    assert.equal(wet(sheet, 3, 5), false, 'under the kerb\'s top, the kerb is dry');
    assert.ok(wet(sheet, 5, 5) && wet(sheet, 2, 2), 'water on both sides of it');
});

test('a doorway in the wall lets the water out, so a room with one is no basin', () => {
    const E = loadElevation();
    const map = flat(12, 12);
    ring(E, map, 'wall', 3, 3, 7, 7);
    E.removePiece(map, 5, 7, 0);
    E.setPiece(map, { kind: 'doorway', x: 5, y: 7, z: 0, rot: 0, material: '' });
    assert.equal(E.waterBasin(map, 5, 5), null);
    // In a hollow, the water leaves through the door into the rest of it.
    const W = 16, H = 16, stride = W + 1;
    const dug = flat(W, H);
    const grid = E.ensureTerrain(dug);
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) grid[y * stride + x] = Math.hypot(x - 8, y - 8) < 6 ? -2 : 0;
    ring(E, dug, 'wall', 6, 6, 10, 10);
    const closed = E.waterBasin(dug, 8, 8);
    assert.ok(closed && closed.x0 >= 7 && closed.x1 <= 9, 'walled in the hollow: only the room fills');
    E.removePiece(dug, 8, 10, 0);
    E.setPiece(dug, { kind: 'doorway', x: 8, y: 10, z: 0, rot: 0, material: '' });
    const open = E.waterBasin(dug, 8, 8);
    assert.ok(open && open.cells > closed.cells && open.x0 < 6, 'through the door it fills the hollow around the room');
    assert.equal(wet(open, 6, 8), false, 'the walls stay dry');
});

test('a wall built across a pond leaves its cells dry, and its undo gives them back', () => {
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const E = context.RRMapElevation;
    const W = 20, H = 20, stride = W + 1;
    const map = flat(W, H);
    const grid = E.ensureTerrain(map);
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) grid[y * stride + x] = Math.hypot(x - 10, y - 10) < 4 ? -3 : 0;
    assert.ok(E.fillWaterAt(map, 10, 10, 'Water'));
    const pond = JSON.stringify(E.water(map));
    const owner = { getTilemapManager: () => ({ currentMap: map }) };
    const builder = new context.PieceBuilderManager(owner), terrain = new context.TerrainManager(owner);
    context.reactor = { terrainManager: terrain, pieceBuilderManager: builder };
    builder.kind = 'wall'; builder.mode = 'place';
    builder.beginStroke({ x: 10, y: 10, z: 0 });
    builder.endStroke();
    assert.equal(E.pieces(map).length, 1, 'the wall is laid');
    assert.equal(wet(E.water(map)[0], 10, 10), false, 'its cell is dry');
    assert.ok(wet(E.water(map)[0], 9, 10), 'the pond around it stays');
    builder.undo();
    assert.equal(JSON.stringify(E.water(map)), pond, 'the undo gives the cell back');
    builder.redo();
    assert.equal(wet(E.water(map)[0], 10, 10), false);
});

test('a solid shape holds water over its whole footprint when the 3D runtime is loaded; a tube does not', () => {
    global.self = global; global.window = global;
    require(path.resolve(repoRoot, 'runtime/libs/three.js'));
    const R = require(path.resolve(repoRoot, 'runtime/reactor_3d.js'));
    const E = loadElevation({ Reactor3D: R });
    const map = flat(12, 12);
    map.reactor3d.pieces = [{ id: 1, kind: 'box', x: 5, y: 5, z: 0, rot: 0, material: '', size: [3, 2, 3] }];
    const walls = E.waterWalls(map);
    for (const [x, y] of [[4, 4], [5, 5], [6, 6], [4, 6]]) assert.equal(walls.get(y * 12 + x), 2, `the box holds water at ${x},${y}`);
    map.reactor3d.pieces = [{ id: 1, kind: 'tube', x: 5, y: 5, z: 0, rot: 0, material: '', size: [3, 2, 3] }];
    assert.equal(E.waterWalls(map), null);
    assert.equal(loadElevation().waterWalls(Object.assign(flat(12, 12), { reactor3d: { version: 1, pieces: [{ id: 1, kind: 'box', x: 5, y: 5, z: 0, rot: 0, material: '', size: [3, 2, 3] }] } })), null,
        'without the runtime a shape\'s footprint is unknown, and it holds nothing');
});

test('the hold heights follow the runtime\'s piece heights', () => {
    const R = require(path.resolve(repoRoot, 'runtime/reactor_3d.js'));
    const E = loadElevation();
    const map = flat(4, 2);
    E.setPiece(map, { kind: 'wall', x: 0, y: 0, z: 0, rot: 0, material: '' });
    E.setPiece(map, { kind: 'block', x: 1, y: 0, z: 0, rot: 0, material: '' });
    E.setPiece(map, { kind: 'glass', x: 2, y: 0, z: 0, rot: 0, material: '' });
    const walls = E.waterWalls(map);
    assert.deepEqual([walls.get(0), walls.get(1), walls.get(2)], [R.pieceHeight('wall'), R.pieceHeight('block'), R.pieceHeight('glass')]);
    const sill = R.pieceShapes('window', { kind: 'window' })[0].box[4];
    E.setPiece(map, { kind: 'window', x: 3, y: 0, z: 0, rot: 0, material: '' });
    assert.equal(E.waterWalls(map).get(3), sill, 'a window holds to its sill');
});

test('an edit away from every pond leaves the ponds alone; one inside a pond\'s box refits it', () => {
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const E = context.RRMapElevation;
    const map = flat(20, 20);
    E.ensureTerrain(map);
    map.reactor3d.water = [{ x0: 2, y0: 2, x1: 5, y1: 5, level: 0.5, material: '' }];
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    let refits = 0;
    const refit = terrain.refitWater.bind(terrain);
    terrain.refitWater = () => { refits++; return refit(); };
    terrain._basins = new Map([['x', 1]]);
    terrain.piecesChanged({ x0: 12, y0: 12, x1: 14, y1: 14 });
    assert.equal(refits, 0, 'far from the pond: no refit');
    assert.equal(terrain._basins, null, 'but the hollows are read again');
    E.setPiece(map, { kind: 'wall', x: 3, y: 3, z: 0, rot: 0, material: '' });
    terrain.piecesChanged({ x0: 2, y0: 2, x1: 4, y1: 4 });
    assert.equal(refits, 1);
    assert.equal(wet(E.water(map)[0], 3, 3), false, 'the wall\'s cell is dry');
    terrain.piecesChanged(null);
    assert.equal(refits, 2, 'a whole-map edit always refits');
});
