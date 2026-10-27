'use strict';
// The 3D builder's audit (2026-10-24): the Eraser draws as its own panel says and can take one kind only; a plan
// stamps at a size; every piece takes a tint; a fence a height; Flatten draws a Line or a Rectangle to a height of
// the author's; Lower digs sheer sides when asked; ground fills by rule; a biome changes only what it is let; water
// takes any material and a river a flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
global.Reactor3D = R;
const quiet = { log() {}, warn() {}, error() {}, debug() {} };
const plain = value => JSON.parse(JSON.stringify(value));

function builderOn(map) {
    const context = { console: quiet, JSON, Math, Object, Array, Number, String, Set, Map, Reactor3D: R,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    context.reactor = { buildHotbar: { visible: true, flash() {}, hide() {} } };
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    manager.announce = () => {};
    return { manager, E: context.RRMapElevation, P: context.PieceBuilderManager };
}
function terrainOn(map) {
    const context = { console: quiet, setTimeout, clearTimeout, Reactor3D: R, Uint8Array,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, getElementById: () => null },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['MapElevation.js', 'MapFoliage.js', 'MapGround.js']) vm.runInNewContext(read('editor/src/utils/' + file), context);
    vm.runInNewContext(read('editor/src/TerrainManager.js') + '\nwindow.TerrainManager = TerrainManager;', context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    return { terrain, E: context.RRMapElevation, G: context.RRMapGround, TM: context.TerrainManager };
}
const freshMap = (w = 20, h = 20) => ({ id: 1, width: w, height: h, data: new Array(w * h * 6).fill(0), events: [], reactor3d: { version: 1, mode: '3d', room: { floor: 'Grass' } } });
const kinds = (E, map) => Array.from(E.pieces(map), p => p.kind + '@' + p.x + ',' + p.y).sort();

test('the Eraser draws as its own panel says, whatever the slot before it was set to', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('wall'); manager.setDrawShape('rect');
    for (let x = 2; x <= 8; x++) E.setPiece(map, { kind: 'floor', x, y: 5, z: 0, rot: 0 });
    manager.setMode('erase'); manager.setEraseShape('line');
    manager.beginStroke({ x: 2, y: 5, z: 0 }); manager.paintAt({ x: 6, y: 5, z: 0 }); manager.endStroke();
    assert.deepEqual(kinds(E, map), ['floor@7,5', 'floor@8,5'], 'a line, not the Build slots\' rectangle');
});

test('Erase only roofs: a house keeps its walls and floor', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    for (const kind of ['floor', 'wall', 'roof']) E.setPiece(map, { kind, x: 4, y: 4, z: kind === 'roof' ? 5 : 0, rot: 0 });
    E.setPiece(map, { kind: 'wall', x: 5, y: 4, z: 0, rot: 0 });
    manager.setMode('erase'); manager.setEraseOnly('roofs'); manager.setEraseShape('rect');
    manager.beginStroke({ x: 3, y: 3, z: 0 }); manager.paintAt({ x: 6, y: 6, z: 0 }); manager.endStroke();
    assert.deepEqual(kinds(E, map), ['floor@4,4', 'wall@4,4', 'wall@5,4']);
    manager.setEraseOnly('walls');
    manager.beginStroke({ x: 3, y: 3, z: 0 }); manager.paintAt({ x: 6, y: 6, z: 0 }); manager.endStroke();
    assert.deepEqual(kinds(E, map), ['floor@4,4']);
    manager.setEraseOnly('nonsense');
    assert.equal(manager.eraseOnly, '', 'anything else is everything');
});

test('any piece takes a tint over its material, written for new pieces in hand, kept by both normalizers and drawn', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('wall'); manager.tints = { wall: '#C04030' };
    assert.equal(manager.pieceFor({ x: 1, y: 1, z: 0 }).tint, '#C04030');
    E.setPiece(map, Object.assign(manager.pieceFor({ x: 1, y: 1, z: 0 })));
    assert.equal(E.pieces(map)[0].tint, '#c04030');
    assert.equal(R.normalizePiece({ kind: 'floor', x: 0, y: 0, z: 0, tint: '#00FF00' }, map).tint, '#00ff00');
    assert.equal(R.normalizePiece({ kind: 'floor', x: 0, y: 0, z: 0, tint: '#ffffff' }, map).tint, undefined, 'white is none');
    const out = { positions: [], uvs: [], colors: [] };
    R.emitPiece(R.normalizePiece({ kind: 'block', x: 0, y: 0, z: 0, tint: '#ff0000' }, map), 0, out, {});
    const reds = [];
    for (let i = 0; i < out.colors.length; i += 3) reds.push(out.colors[i + 1] === 0 && out.colors[i + 2] === 0 && out.colors[i] > 0);
    assert.ok(reds.length && reds.every(Boolean), 'its faces red, shaded');
    // The rock's own tint is the same thing.
    manager.rockTint = '#123456';
    assert.equal(manager.tints.rock, '#123456');
});

test('a fence takes a height: posts as tall, rails spread up them; none is the 1.5 it always was', () => {
    const map = freshMap();
    const tall = R.normalizePiece({ kind: 'fence', x: 1, y: 1, z: 0, rot: 0, height: 3 }, map), low = R.normalizePiece({ kind: 'fence', x: 1, y: 1, z: 0, rot: 0 }, map);
    assert.equal(tall.height, 3);
    const top = shapes => Math.max(...shapes.filter(s => s.box).map(s => s.box[4]));
    assert.equal(top(R.pieceShapes('fence', low)), 1.5);
    assert.equal(top(R.pieceShapes('fence', tall)), 3);
    const { manager, P } = builderOn(map);
    manager.setKind('fence');
    assert.equal(manager.heightFor('fence'), 1.5);
    assert.equal(manager.pieceFor({ x: 0, y: 0, z: 0 }).height, undefined, 'the default is left unwritten');
    manager.setHeight('fence', 2.5);
    assert.equal(manager.pieceFor({ x: 0, y: 0, z: 0 }).height, 2.5);
    assert.ok(!P.SIZED_KINDS.includes('fence') && P.HEIGHT_KINDS.includes('fence'), 'a building\'s storeys still go by its walls');
});

test('a plan stamps at the size chosen', () => {
    const map = freshMap(40, 40); const { manager, E } = builderOn(map);
    const plan = { name: 'Hut', size: [3, 3], pieces: [{ kind: 'floor', x: 0, y: 0, z: 0 }, { kind: 'floor', x: 2, y: 2, z: 0 }] };
    manager.structures = () => [{ file: 'Hut.json', name: 'Hut', plan }];
    manager.structure = 'Hut.json';
    manager.stampScale = 2;
    assert.ok(manager.stampAt(5, 5));
    const xs = E.pieces(map).map(p => p.x);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 4, 'twice as wide: ' + xs.join(','));
});

test('Flatten draws a level pad over a Rectangle at a height typed, easing into the land round it; one undo puts it back', () => {
    const map = freshMap(30, 30); const { terrain, E } = terrainOn(map);
    const grid = E.ensureTerrain(map), stride = 31;
    for (let z = 0; z <= 30; z++) for (let x = 0; x <= 30; x++) grid[z * stride + x] = Math.sin(x * 0.5) + z * 0.2;
    const before = Array.from(grid);
    terrain.setMode('flatten'); terrain.flattenShape = 'rect'; terrain.flattenFrom = 'height'; terrain.flattenHeight = 2; terrain.radius = 2;
    terrain.beginStroke({ x: 8, y: 8 }); terrain.paintAt({ x: 20, y: 3 }); terrain.paintAt({ x: 14, y: 14 }); terrain.endStroke();
    const g = E.ensureTerrain(map);
    for (let z = 9; z <= 14; z++) for (let x = 9; x <= 14; x++) assert.equal(g[z * stride + x], 2, `level at ${x},${z}`);
    assert.equal(g[3 * stride + 20], before[3 * stride + 20], 'where the pointer passed and left, as it was');
    assert.equal(g[0], before[0]);
    terrain.undo();
    assert.deepEqual(Array.from(E.ensureTerrain(map)), before);
});

test('Flatten\'s Pick takes the height under a click and changes nothing', () => {
    const map = freshMap(10, 10); const { terrain, E } = terrainOn(map);
    const grid = E.ensureTerrain(map); grid.fill(3.25);
    terrain.setMode('flatten'); terrain._pickHeight = true;
    assert.equal(terrain.beginStroke({ x: 4, y: 4 }), false);
    assert.deepEqual([terrain.flattenHeight, terrain.flattenFrom, terrain._pickHeight, terrain.undoStack.length], [3.25, 'height', false, 0]);
});

test('Lower keeps its banks walkable unless told to dig sheer sides', () => {
    const run = steep => {
        const map = freshMap(20, 20); const { terrain, E } = terrainOn(map);
        E.ensureTerrain(map);
        terrain.setMode('lower'); terrain.radius = 1.5; terrain.strength = 2; terrain.lowerSteep = steep;
        for (let i = 0; i < 6; i++) { terrain.beginStroke({ x: 9.5, y: 9.5 }); terrain.endStroke(); }
        return E.ensureTerrain(map)[10 * 21 + 10];
    };
    assert.ok(run(true) < run(false) - 1, `steep digs deeper: ${run(true)} against ${run(false)}`);
});

test('a ground fills by rule: near water, within a height band', () => {
    const map = freshMap(30, 30); const { terrain, E, G } = terrainOn(map);
    const grid = E.ensureTerrain(map), stride = 31;
    for (let z = 0; z <= 30; z++) for (let x = 0; x <= 30; x++) grid[z * stride + x] = x < 15 ? 0 : 4;
    terrain.setMode('ground'); terrain.addGroundType({ material: 'Snow' });
    terrain.groundRules = { minHeight: 3 };
    assert.ok(terrain.fillGroundWhere());
    const levels = G.levelsOf(map, 0);
    assert.ok(levels[10 * 30 + 25] > 0 && levels[10 * 30 + 5] === 0, 'snow up high only');
    assert.equal(terrain.undoStack[terrain.undoStack.length - 1].groundSet, true, 'one undo step');
    terrain.groundRules = { minHeight: 99 };
    assert.equal(terrain.fillGroundWhere(), null, 'nothing matches, nothing changes');
});

test('a biome changes only what it is let: planted colors and water kept when unticked', () => {
    const map = freshMap(20, 20); const { terrain, E } = terrainOn(map);
    map.reactor3d.foliage = { layers: [{ kind: 'grass', colour: '#010101', density: '9x20' }] };
    terrain.biomeAlso = { plants: false, water: false, cliff: false };
    assert.ok(terrain.applyBiome('snow'));
    assert.equal(map.reactor3d.foliage.layers[0].colour, '#010101', 'the grass planted keeps its color');
    assert.equal(terrain.foliageLook.grass.colour, TMsnow(terrain), 'what is painted next takes the biome\'s');
    function TMsnow(t) { return t.constructor.FOLIAGE_PALETTES.snow.grass[0]; }
    terrain.biomeAlso = {};
    assert.ok(terrain.applyBiome('desert'));
    assert.equal(map.reactor3d.foliage.layers[0].colour, terrain.constructor.FOLIAGE_PALETTES.dry.grass[0], 'ticked (the default), it recolors them');
});

test('water takes any material; a river runs at the flow set', () => {
    const map = freshMap(30, 30); const { terrain, E } = terrainOn(map);
    terrain.waterLook = Object.assign(terrain.lookOf({}), { material: 'Lava-Rock' });
    assert.equal(terrain.liquidMaterial(), 'Lava-Rock');
    E.ensureTerrain(map);
    terrain.setMode('river'); terrain.riverFlow = 2.5; terrain.riverWidth = 2;
    terrain._river = { points: [[3, 15], [26, 15]], clickedAt: 0 };
    assert.ok(terrain.finishRiver());
    const sheet = plain(map.reactor3d.water || map.reactor3d.waters || []).find(w => w.path);
    assert.ok(sheet, 'a river laid');
    assert.equal(sheet.material, 'Lava-Rock');
    assert.equal(sheet.flow, 2.5);
    // A course clicked out loses its last point to Backspace.
    terrain._river = { points: [[1, 1], [5, 5], [9, 9]], clickedAt: 0 };
    terrain.undoRiverPoint();
    assert.equal(terrain._river.points.length, 2);
});
