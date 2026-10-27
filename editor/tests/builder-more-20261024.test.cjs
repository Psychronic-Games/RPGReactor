'use strict';
// The rest of the builder audit (2026-10-24): models scattered by a drag; a pond's level set below its rim; a map's
// look saved as a biome of the project's own and laid again; a pillar's thickness and a roof's pitch; the room
// floor's tint and scale; slot names that wrap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

function terrainOn(map, projectPath = null) {
    const context = { console: quiet, setTimeout, clearTimeout, Reactor3D: R, Uint8Array, require,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, getElementById: () => null },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['MapElevation.js', 'MapFoliage.js', 'MapGround.js']) vm.runInNewContext(read('editor/src/utils/' + file), context);
    vm.runInNewContext(read('editor/src/TerrainManager.js') + '\nwindow.TerrainManager = TerrainManager;', context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }), getCurrentProject: () => (projectPath ? { path: projectPath } : null) });
    return { terrain, E: context.RRMapElevation, G: context.RRMapGround };
}
const freshMap = (w = 20, h = 20) => ({ id: 1, width: w, height: h, data: new Array(w * h * 6).fill(0), events: [], reactor3d: { version: 1, mode: '3d', room: { floor: 'Grass' } } });

test('a drag scatters the model in hand every few tiles, each turned and sized its own way, as one undo step', () => {
    const context = { console: quiet, Promise, setTimeout, clearTimeout, JSON, Math, Number, String, Array, Object, RegExp, Map, Set };
    context.window = context; context.document = { addEventListener() {}, removeEventListener() {} };
    context.ModelPropsPreview2D = class {};
    vm.createContext(context);
    vm.runInContext(read('editor/src/ModelPropsManager.js') + '\nwindow.ModelPropsManager = ModelPropsManager;', context);
    const props = new context.ModelPropsManager(null);
    const laid = []; let undos = 0;
    props.elevation = () => ({ addProp: (map, prop) => { laid.push(prop); return laid.length; } });
    props.currentMap = {}; props.model = { name: 'Map-Objects/Tree-02', ext: '.glb' }; props.tool = 'place';
    props.pushUndo = () => { undos++; }; props._changed = () => {};
    props.scatter = { on: true, spacing: 3, turn: true, size: 30 };
    props.fields.size = 2;
    props.scatterAt({ x: 1, y: 1 }, true);
    for (let x = 1.5; x <= 13; x += 0.5) props.scatterAt({ x, y: 1 }, false);
    assert.ok(laid.length >= 4 && laid.length <= 6, 'one every three tiles: ' + laid.length);
    assert.equal(undos, 1, 'one undo step for the drag');
    assert.ok(laid.every(p => p.size >= 1.4 - 1e-6 && p.size <= 2.6 + 1e-6), 'sizes within 30%');
    assert.ok(new Set(laid.map(p => p.yaw)).size > 1, 'each turned its own way');
    props.scatter.turn = false; props.fields.yaw = 45; laid.length = 0;
    props.scatterAt({ x: 1, y: 5 }, true);
    assert.equal(laid[0].yaw, 45, 'turned as the panel says when Turn each one is off');
});

test('a pond is set to a level below its rim and kept there, its look kept; no lower than its ground; one undo', () => {
    const map = freshMap(20, 20); const { terrain, E } = terrainOn(map);
    const grid = E.ensureTerrain(map), stride = 21;
    for (let z = 0; z <= 20; z++) for (let x = 0; x <= 20; x++) grid[z * stride + x] = Math.min(3, Math.hypot(x - 10, z - 10) * 0.5);
    assert.ok(E.fillWaterAt(map, 10, 10, 'Water'));
    const full = plain(E.water(map)[0]);
    E.styleWaterRegion(map, full, Object.assign(terrain.lookOf(full), { colour: '#ff0000' }));
    const range = E.waterRange(map, E.water(map)[0]);
    assert.ok(range.rim >= full.level - 1e-6 && range.low < 0.5, JSON.stringify(range));
    terrain.selectedWater = { x0: full.x0, y0: full.y0, x1: full.x1, y1: full.y1, level: full.level };
    assert.ok(terrain.setWaterLevel(1.2));
    const lower = plain(E.water(map)[0]);
    assert.equal(lower.level, 1.2);
    assert.ok(lower.x1 - lower.x0 < full.x1 - full.x0, 'a smaller pond');
    assert.equal(lower.colour, '#ff0000', 'its colour kept');
    assert.equal(terrain.selectedWater.level, 1.2, 'still selected');
    assert.ok(!terrain.setWaterLevel(-5), 'not under its ground');
    terrain.undo();
    assert.equal(plain(E.water(map)[0]).level, full.level);
});

test('a map\'s look saved as a biome of the project\'s own is listed, laid on another map, and removed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-biome-'));
    fs.mkdirSync(path.join(dir, 'data'));
    try {
        const map = freshMap(10, 10); const { terrain, G } = terrainOn(map, dir);
        terrain.setMode('ground'); terrain.addGroundType({ material: 'Marble', tint: '#aabbcc', name: 'Courtyard' });
        map.reactor3d.room.cliffTint = '#334455';
        map.reactor3d.foliage = { layers: [{ kind: 'grass', colour: '#123123', tip: '#456456', density: '9x10' }] };
        const key = terrain.saveBiome('My Valley');
        assert.equal(key, 'custom:My Valley');
        const saved = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'Biomes.json'), 'utf8'));
        assert.equal(saved.biomes[0].name, 'My Valley');
        assert.equal(saved.biomes[0].grounds[0].material, 'Marble');
        assert.deepEqual(saved.biomes[0].palette.grass, ['#123123', '#456456']);
        // Another map takes it.
        const other = freshMap(10, 10); const second = terrainOn(other, dir);
        assert.equal(second.terrain.customBiomes().length, 1);
        assert.ok(second.terrain.applyBiome('custom:My Valley'));
        assert.equal(plain(second.G.types(other)).find(t => t.material === 'Marble').tint, '#aabbcc');
        assert.equal(other.reactor3d.room.cliffTint, '#334455');
        assert.equal(second.terrain.foliageLook.grass.colour, '#123123');
        // Saved again under the same name, it is replaced; removed, it is gone.
        terrain.saveBiome('My Valley');
        assert.equal(terrain.customBiomes().length, 1);
        assert.ok(terrain.removeBiome('custom:My Valley'));
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'Biomes.json'), 'utf8')).biomes.length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a pillar takes a thickness and a roof a pitch: drawn, stood on and kept', () => {
    const map = freshMap();
    const thin = R.normalizePiece({ kind: 'pillar', x: 1, y: 1, z: 0, thick: 0.15 }, map), wide = R.normalizePiece({ kind: 'pillar', x: 1, y: 1, z: 0, thick: 1 }, map);
    assert.deepEqual([thin.thick, wide.thick, R.normalizePiece({ kind: 'pillar', x: 1, y: 1, z: 0 }, map).thick], [0.15, 1, undefined]);
    const radius = piece => R.pieceShapes('pillar', piece).find(s => s.column).column[2];
    assert.ok(radius(thin) < 0.1 && radius(wide) === 0.5);
    const steep = R.normalizePiece({ kind: 'roof', x: 1, y: 1, z: 5, rise: 3 }, map), flat = R.normalizePiece({ kind: 'roof', x: 1, y: 1, z: 5, rise: 0.25 }, map);
    assert.deepEqual([steep.rise, flat.rise], [3, 0.25]);
    assert.equal(R.pieceHeight('roof', steep), 3);
    assert.equal(R.pieceShapes('roof', steep)[0].rise, 3);
    const out = { positions: [], uvs: [], colors: [] };
    R.emitPiece(steep, 0, out, {});
    let top = -Infinity; for (let i = 1; i < out.positions.length; i += 3) top = Math.max(top, out.positions[i]);
    assert.ok(Math.abs(top - 8) < 1e-6, 'its ridge 3 over its eaves at 5: ' + top);
    // The editor keeps them, and lays them from the panel's values.
    const { E } = terrainOn(map);
    E.setPiece(map, { kind: 'roof', x: 2, y: 2, z: 5, rot: 0, rise: 2.5 });
    E.setPiece(map, { kind: 'pillar', x: 3, y: 3, z: 0, rot: 0, thick: 0.7 });
    assert.deepEqual(plain(E.pieces(map).map(p => [p.kind, p.rise ?? null, p.thick ?? null])), [['roof', 2.5, null], ['pillar', null, 0.7]]);
});

test('the room floor takes a tint and a scale, kept by both readers, and left out when plain', () => {
    const map = freshMap(); const { E } = terrainOn(map);
    E.setRoom(map, Object.assign({}, E.room(map), { floorTint: '#AA8866', floorScale: 2.5 }));
    assert.deepEqual([map.reactor3d.room.floorTint, map.reactor3d.room.floorScale], ['#aa8866', 2.5]);
    const room = R.roomFor(map);
    assert.deepEqual([room.floorTint, room.floorScale], ['#aa8866', 2.5]);
    E.setRoom(map, Object.assign({}, E.room(map), { floorTint: '', floorScale: 1 }));
    assert.ok(!('floorTint' in map.reactor3d.room) && !('floorScale' in map.reactor3d.room), 'plain is left out');
    assert.match(read('runtime/reactor_3d.js'), /const imageWidth = \(bitmap\.width \|\| 0\) \/ size \* grow;/, 'the floor\'s picture laid at its scale');
});

test('every slot\'s name wraps onto two lines rather than being cut', () => {
    const css = read('editor/css/styles.css');
    assert.match(css, /\.rr-build-slot \.rr-build-slot-label, [^{]+\{\s*white-space: normal;[^}]*-webkit-line-clamp: 2;/);
    assert.match(css, /\.rr-build-hotbar\.is-compact \.rr-build-slot \{ font-size: 10px; height: 52px; \}/);
});

test('the room floor\'s tint and scale are one undo step from the panel, and undo puts them back', () => {
    const map = freshMap(); const { terrain } = terrainOn(map);
    map.reactor3d.room = { floor: '!Grass-01' }; map.note = '<3D>';
    assert.ok(terrain.setRoomLook({ floorTint: '#c08060', floorScale: 3 }, 'commit'));
    assert.deepEqual([terrain.roomLook().floorTint, terrain.roomLook().floorScale], ['#c08060', 3]);
    terrain.undo();
    assert.deepEqual([terrain.roomLook().floorTint, terrain.roomLook().floorScale], ['', 1]);
});
