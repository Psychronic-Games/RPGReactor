// Terrain: a fractional height at every tile corner on top of the whole-tile
// elevation. The editor paints it with soft brushes and keeps it in the
// sidecar; the runtime bends every built vertex, the room floor and the
// parallax grounds through it, stands characters on it, and refuses a step
// steeper than the slope limit.
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

function loadElevation() {
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    return context.RRMapElevation;
}
function loadRuntime() {
    // The rules alone, without three.js: the world file's rules half and the
    // core's elevationAt, evaluated against a bare namespace.
    const world = read('runtime/reactor_3d_world.js');
    const core = read('runtime/reactor_3d.js');
    const body = world.slice(world.indexOf('Reactor3D.TERRAIN_MAX = 60;'), world.indexOf('// World meshes'))
        + core.slice(core.indexOf('Reactor3D.elevationAt = function(mapData, x, y) {'), core.indexOf('/**\n * The 3D object a cell\'s tile has been painted into'));
    const Reactor3D = { DEFAULT_ELEVATION: 0 };
    vm.runInNewContext(body, { Reactor3D });
    return Reactor3D;
}
const hillMap = (w, h) => {
    const grid = new Array((w + 1) * (h + 1)).fill(0);
    grid[3 * (w + 1) + 3] = 2; // one corner two tiles up
    return { width: w, height: h, reactor3d: { version: 1, elevation: new Array(w * h).fill(0), terrain: grid, terrainWidth: w } };
};

test('the elevation cap is 100, and a brush shapes corners with a soft falloff', () => {
    const E = loadElevation();
    assert.equal(E.MAX, 100);
    const map = { width: 8, height: 8, reactor3d: { version: 1 } };
    assert.equal(E.hasTerrain(map), false);
    assert.ok(E.paintTerrain(map, 4, 4, { mode: 'raise', radius: 2, strength: 1 }));
    assert.equal(E.terrainAt(map, 4, 4), 1, 'the centre takes the full strength');
    assert.ok(E.terrainAt(map, 5, 4) > 0 && E.terrainAt(map, 5, 4) < 1, 'a corner one tile out takes a fraction');
    assert.equal(E.terrainAt(map, 7, 4), 0, 'outside the radius nothing moves');
    assert.equal(E.hasTerrain(map), true);
    assert.equal(E.isFlat(map), false, 'a shaped map is not flat, so its sidecar is written');
    // Lower undoes raise; flatten pulls towards the reference; smooth pulls towards neighbours.
    E.paintTerrain(map, 4, 4, { mode: 'lower', radius: 2, strength: 1 });
    assert.equal(E.terrainAt(map, 4, 4), 0);
    E.paintTerrain(map, 4, 4, { mode: 'raise', radius: 2, strength: 1 });
    E.paintTerrain(map, 4, 4, { mode: 'flatten', radius: 3, strength: 1, reference: 0 });
    assert.equal(E.terrainAt(map, 4, 4), 0, 'flatten at full strength levels the centre to the reference');
    E.paintTerrain(map, 4, 4, { mode: 'raise', radius: 1, strength: 1 });
    const before = E.terrainAt(map, 4, 4);
    E.paintTerrain(map, 4, 4, { mode: 'smooth', radius: 1, strength: 0.5 });
    assert.ok(E.terrainAt(map, 4, 4) < before, 'smooth pulls a spike down towards its neighbours');
    // Snapshot, restore, clear.
    const saved = E.terrainSnapshot(map);
    E.clearTerrain(map); assert.equal(E.hasTerrain(map), false);
    E.restoreTerrain(map, saved); assert.equal(E.hasTerrain(map), true);
    // Bilinear sampling agrees between editor and runtime.
    const R = loadRuntime();
    const hill = hillMap(6, 6);
    assert.equal(E.terrainHeightAt(hill, 3, 3), 2);
    assert.equal(E.terrainHeightAt(hill, 3.5, 3), 1);
    assert.equal(R.terrainHeightAt(hill, 3.5, 3), E.terrainHeightAt(hill, 3.5, 3));
    assert.equal(R.terrainHeightAt(hill, 3.5, 3.5), 0.5);
});

test('the runtime stands things on the terrain and blocks a step that is too steep', () => {
    const R = loadRuntime();
    const hill = hillMap(6, 6);
    hill.reactor3d.elevation[2 * 6 + 2] = 1; // cell (2,2) is a terrace one tile up
    assert.equal(R.groundHeightAt(hill, 2.5, 2.5), 1 + R.terrainHeightAt(hill, 2.5, 2.5), 'elevation plus terrain');
    assert.equal(R.characterGround(hill, { _realX: 3, _realY: 3 }), R.groundHeightAt(hill, 3.5, 3.5));
    // From (3,2) to (3,3): the corner at (3,3) is two tiles up, so the middles differ by 0.5 → passable; a taller spike is not.
    assert.equal(R.terrainBlocks(hill, 3, 2, 3, 3), false);
    hill.reactor3d.terrain[3 * 7 + 3] = 8;
    assert.equal(R.terrainBlocks(hill, 3, 2, 3, 3), true);
    assert.equal(R.terrainBlocks({ width: 6, height: 6, reactor3d: { elevation: [] } }, 0, 0, 1, 0), false, 'no terrain, no rule');
    // Displacement lifts every vertex by the field at its own x/z.
    const built = { groups: [{ positions: new Float32Array([3, 0, 3, 3.5, 0, 3, 0, 0, 0]) }] };
    R.displaceByTerrain(built, hill);
    assert.deepEqual([...built.groups[0].positions], [3, 8, 3, 3.5, 4, 3, 0, 0, 0]);
});

test('every ground surface and every stander goes through the terrain', () => {
    const runtime = source3D();
    assert.match(runtime, /Reactor3D\.displaceByTerrain\(built, mapData\);/);
    assert.match(runtime, /this\._terrainMap = Reactor3D\.terrainOf\(mapData\) \? mapData : null;/);
    assert.match(runtime, /const geometry = this\.groundPlane\(width, height, lift\);/);
    assert.match(runtime, /const geometry = this\.groundPlane\(width, height, y\);/);
    assert.equal((runtime.match(/Reactor3D\.characterGround\(/g) || []).length, 4, 'both model placements and the cutaway, for the player and for each of the company');
    assert.match(runtime, /return Reactor3D\.groundHeightAt\(\$dataMap, x \+ 0\.5, y \+ 0\.5, near\) \|\| 0;/, 'the camera module');
    assert.match(read('runtime/reactor_sprites.js'), /Reactor3D\.groundHeightAt\(\$dataMap, focus\.x \+ 0\.5, focus\.y \+ 0\.5,/);
    const objects = read('runtime/reactor_objects.js');
    assert.match(objects, /const ground = Reactor3D\.characterGround\(\$dataMap, this\);/);
    assert.match(objects, /Reactor3D\.terrainBlocks\(\$dataMap, x, y, x2, y2, this\._reactorGround\)\) return false;/);
    const editor3d = read('editor/src/MapEditor3D.js');
    assert.match(editor3d, /Reactor3D\.groundHeightAt\(mapData, prop\.x \+ 0\.5, prop\.y \+ 0\.5\)/);
    assert.match(editor3d, /this\.terrainManager\(\)\.beginStroke\(point\);/);
    assert.match(editor3d, /if \(point\) \{ this\.terrainManager\(\)\?\.paintAt\(point\); this\.updateTerrainRing\(point\); \}/);
    assert.match(editor3d, /updateTerrainRing\(point\) \{/);
    assert.match(read('editor/src/main.js'), /owner==='terrain'&&tab\.dataset\.layer==='T'/);
    assert.match(read('editor/src/TilesetPaletteViewer.js'), /layerName === 'T' \? 'terrain' : layerName === 'P' \? 'pieces' : 'paint'/);
    assert.match(editor3d, /this\.terrainManager\(\)\?\.endStroke\(\);/);
    // The drifting sky keeps the editor rendering, at fractional frames.
    assert.match(editor3d, /if \(sky && \(sky\.driftX \|\| sky\.driftY\)\) return true;/);
    assert.match(editor3d, /this\.mapScene\.updateSky\?\.\(this\.camera, now \/ \(1000 \/ 60\)\);/);
    // The tab, the panel and its words.
    assert.match(read('editor/src/TilesetPaletteViewer.js'), /createLayerTab\('T', TilesetPaletteViewer\.tabIcon\('terrain'\), '3D-T'\)/);
    assert.match(read('editor/src/main.js'), /onTerrainTabSelected = \(\) => \{/);
    assert.match(read('editor/index.html'), /src\/TerrainManager\.js/);
    const manager = read('editor/src/I18nManager.js');
    for (const key of ['terrain.hint', 'terrain.raise', 'terrain.flatten', 'terrain.clear', 'terrain.needs3D', 'terrain.undo']) {
        assert.equal((manager.match(new RegExp(`'${key.replace('.', '\\.')}': `, 'g')) || []).length, 18, key);
    }
});

test('a map made larger keeps every hill; the runtime refits a grid saved at the old size', () => {
    const E = loadElevation();
    const map = { width: 6, height: 4, reactor3d: { version: 1 } };
    E.paintTerrain(map, 5, 3, { mode: 'raise', radius: 1, strength: 1 });
    const peakBefore = E.terrainAt(map, 5, 3);
    assert.equal(peakBefore, 1);
    // Resize the map: the elevation's own resize path runs at save and carries the terrain.
    map.width = 12; map.height = 9;
    E.ensure(map);
    assert.equal(E.terrain(map).length, 13 * 10);
    assert.equal(E.terrainAt(map, 5, 3), 1, 'the hill is where it was');
    assert.equal(E.hasTerrain(map), true);
    // A file from before the fix: the old grid with only the elevation's recorded width to go on.
    const stale = { width: 100, height: 100, reactor3d: { version: 1, width: 100, height: 100, terrainWidth: 50, terrain: new Array(51 * 51).fill(0) } };
    stale.reactor3d.terrain[10 * 51 + 7] = 3;
    assert.equal(E.terrainAt(stale, 7, 10), 3, 'read regrows it in place');
    assert.equal(stale.reactor3d.terrain.length, 101 * 101);
    const R = loadRuntime();
    const game = { width: 100, height: 100, reactor3d: { width: 100, height: 100, terrainWidth: 50, terrain: new Array(51 * 51).fill(0) } };
    game.reactor3d.terrain[10 * 51 + 7] = 3;
    assert.equal(R.terrainHeightAt(game, 7, 10), 3, 'the game refits the same file');
    // Made smaller: the hills that fit stay, the rest go.
    map.width = 4; map.height = 4; E.ensure(map);
    assert.equal(E.terrain(map).length, 25);
    assert.equal(E.hasTerrain(map), false, 'the hill at x=5 no longer fits');
});

// --- A brush stroke moves vertices in place; the scene is not rebuilt. ---
function loadThree() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return global.THREE;
}

test('a dab returns the vertex region it touched, and the announcement carries it', () => {
    const E = loadElevation();
    const map = { width: 10, height: 8, reactor3d: { version: 1 } };
    const region = E.paintTerrain(map, 5, 4, { mode: 'raise', radius: 2, strength: 1 });
    assert.deepEqual({ ...region }, { x0: 2, x1: 8, z0: 1, z1: 7 }, 'corners 3..7 moved, so tiles 2..8 either side follow');
    assert.equal(E.paintTerrain(map, 5, 4, { mode: 'flatten', radius: 1, strength: 1, reference: E.terrainAt(map, 5, 4) }), false, 'nothing moved, nothing announced');
    assert.deepEqual({ ...E.paintTerrain(map, 0, 0, { mode: 'raise', radius: 3, strength: 1 }) }, { x0: 0, x1: 4, z0: 0, z1: 4 }, 'clamped to the map');

    const events = [];
    const context = { console, Math, Number, Object, Array, String, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
        document: { dispatchEvent: e => events.push(e), addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] }) } };
    context.window = context; context.reactor = { mapEditor: { notifyElevationChanged() { throw new Error('the generic path rebuilds the scene'); } } };
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const manager = Object.create(context.TerrainManager.prototype);
    manager.currentMap = () => ({ id: 7 });
    manager.announce({ x0: 1, x1: 3, z0: 1, z1: 3 });
    manager.announce();
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'rr-map-edited');
    assert.deepEqual({ ...events[0].detail }, { mapId: 7, terrain: true, region: { x0: 1, x1: 3, z0: 1, z1: 3 } });
    assert.equal(events[1].detail.region, null, 'undo, redo and flatten re-lift the whole map');
    const listener = read('editor/src/MapEditor3D.js');
    assert.match(listener, /event\?\.detail\?\.terrain && this\.updateTerrainInPlace\(event\.detail\.region\)\) return;/, 'the 3D view lifts in place before it considers a rebuild');
    assert.match(listener, /const skyOffset = this\.mapScene\?\.skyOffset\?\.\(\)/, 'a real rebuild carries the sky drift on');
});

test('the scene re-lifts its own vertices through a changed grid, and the pick tree follows', () => {
    const THREE = loadThree();
    const Reactor3D = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const Bvh = require(path.resolve(__dirname, '..', '..', 'editor/src/utils/MeshBvh.js'));
    const map = { width: 6, height: 6, reactor3d: { version: 1, elevation: new Array(36).fill(0), terrain: new Array(49).fill(0), terrainWidth: 6 } };
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene._meshes = []; scene._terrainMap = map;
    const plane = new THREE.Mesh(scene.groundPlane(6, 6, 0.25), new THREE.MeshBasicMaterial());
    // A tile group: two triangles standing at x 2..3, z 2..3, lifted as `build` lifts them.
    const positions = new Float32Array([2, 0, 2, 3, 0, 2, 3, 1, 2, 2, 0, 3, 3, 0, 3, 3, 1, 3]);
    const group = { positions };
    group.baseY = Reactor3D.terrainBaseY(positions);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.userData.terrainBaseY = group.baseY;
    const tiles = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    scene._meshes.push(plane, tiles, new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    for (const mesh of scene._meshes) mesh.updateMatrixWorld();
    const down = new THREE.Ray(new THREE.Vector3(2.5, 50, 2.5), new THREE.Vector3(0, -1, 0));
    assert.ok(Math.abs(Bvh.raycastMeshes(down, [plane], THREE).point.y - 0.25) < 1e-6, 'flat: the floor is at its own height');

    // Raise corner (3,3) two tiles; only the tiles around it move.
    map.reactor3d.terrain[3 * 7 + 3] = 2;
    const uploads = plane.geometry.attributes.position.version;
    const changed = scene.updateTerrain(map, { x0: 2, x1: 4, z0: 2, z1: 4 });
    assert.deepEqual(changed.map(g => g.userData.terrainPlane ? 'plane' : 'tiles').sort(), ['plane', 'tiles'], 'each shared geometry once');
    const planeY = (x, z) => { const a = plane.geometry.attributes.position; for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - x) < 1e-6 && Math.abs(a.getZ(i) - z) < 1e-6) return a.getY(i); return null; };
    assert.ok(Math.abs(planeY(3, 3) - 2.25) < 1e-6, 'the plane corner rises with the grid on top of its base height');
    assert.ok(Math.abs(planeY(0, 0) - 0.25) < 1e-6, 'a corner outside the region keeps its height');
    assert.ok(Math.abs(positions[1]) < 1e-6 && Math.abs(positions[13] - 2) < 1e-6, 'tile vertices lift from their built height: the far corner rises, the near one stays');
    assert.ok(Math.abs(positions[16] - 3) < 1e-6, 'a vertex standing a tile up keeps that tile under the terrain');
    assert.equal(plane.geometry.attributes.position.version, uploads + 1, 'the moved buffer is marked for upload');
    assert.ok(plane.geometry.boundingSphere.radius > 0);
    // The pick tree was built flat; refit, and a ray finds the new slope.
    for (const g of changed) Bvh.refit(g);
    const slope = new THREE.Ray(new THREE.Vector3(2.9, 50, 2.9), new THREE.Vector3(0, -1, 0));
    const hit = Bvh.raycastMeshes(slope, [plane], THREE);
    const oracle = new THREE.Raycaster(slope.origin, slope.direction).intersectObject(plane)[0];
    assert.ok(oracle.point.y > 1, 'three.js sees the slope');
    assert.ok(Math.abs(hit.point.y - oracle.point.y) < 1e-6, 'the refitted tree lands where three.js lands');
    assert.equal(Bvh.refit(new THREE.BufferGeometry()), false, 'no tree yet: nothing to refit');
    // Nothing to re-lift in a scene built without a grid: the caller rebuilds.
    const flat = Object.create(Reactor3D.MapScene.prototype); flat._meshes = []; flat._terrainMap = null;
    assert.equal(flat.updateTerrain(map, null), null);
    // Lowering the corner again puts every moved vertex back.
    map.reactor3d.terrain[3 * 7 + 3] = 0;
    scene.updateTerrain(map, null);
    assert.ok(Math.abs(planeY(3, 3) - 0.25) < 1e-6 && Math.abs(positions[16] - 1) < 1e-6);
});

test('the sky keeps its drift across a rebuild', () => {
    const THREE = loadThree();
    const Reactor3D = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const scene = Object.create(Reactor3D.MapScene.prototype);
    assert.equal(scene.skyOffset(), null);
    const texture = new THREE.Texture();
    scene._sky = { material: { map: texture } };
    texture.offset.set(0.4, 0.1);
    assert.deepEqual({ ...scene.skyOffset() }, { x: 0.4, y: 0.1 });
    const next = Object.create(Reactor3D.MapScene.prototype);
    next._sky = { material: { map: new THREE.Texture() } };
    next.setSkyOffset({ x: 0.4, y: 0.1 });
    assert.equal(next._sky.material.map.offset.x, 0.4);
    next.setSkyOffset(null);
    assert.equal(next._sky.material.map.offset.y, 0.1);
});

test('water fills a hollow: it rises from the low point until it would spill, and a refill replaces the sheet', () => {
    const E = loadElevation ? loadElevation() : null;
    const ME = E || (() => { const ctx = { module: { exports: {} }, window: {}, console }; ctx.globalThis = ctx; vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'MapElevation.js'), 'utf8'), ctx); return ctx.module.exports; })();
    const W = 20, H = 20;
    const map = { width: W, height: H, reactor3d: { version: 1, elevation: new Array(W * H).fill(0) } };
    ME.ensureTerrain(map);
    const grid = ME.terrain(map);
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) grid[y * (W + 1) + x] = Math.hypot(x - 10, y - 10) < 4 ? -2 : 0;
    const basin = ME.waterBasin(map, 10, 10);
    assert.ok(basin, 'a hollow');
    assert.equal(basin.level, 0, 'the water stands at the rim');
    assert.ok(basin.x0 >= 5 && basin.x1 <= 14 && basin.cells > 20, 'over the hollow, not the map');
    assert.equal(ME.waterBasin(map, 0, 0), null, 'flat ground at the edge holds no water');
    assert.ok(ME.fillWaterAt(map, 10, 10, 'Water'));
    assert.equal(ME.water(map).length, 1);
    ME.fillWaterAt(map, 11, 10, 'Water');
    assert.equal(ME.water(map).length, 1, 'filling the same hollow again replaces its sheet rather than stacking one on top');
    const pond = ME.water(map)[0];
    assert.ok(pond.mask && pond.mask.length === (pond.x1 - pond.x0 + 1) * (pond.y1 - pond.y0 + 1), 'a round pond in a square box carries a mask');
    assert.equal(ME.waterCovers(pond, 10, 10), true); assert.equal(ME.waterCovers(pond, pond.x0, pond.y0), false, 'the box corner is dry');
    assert.equal(JSON.stringify(ME.waterAt(map, 10, 10)), JSON.stringify(pond)); assert.equal(ME.waterAt(map, pond.x0, pond.y0), null);
    assert.equal(ME.removeWaterAt(map, pond.x0, pond.y0), false, 'a click on the dry corner of the box removes nothing');
    // Two hollows whose boxes overlap fill separately: an L of one and a pit in its elbow.
    const map2 = { width: 30, height: 30, reactor3d: { version: 1, elevation: new Array(900).fill(0) } };
    ME.ensureTerrain(map2);
    const g2 = ME.terrain(map2);
    const set = (x, y, v) => { g2[y * 31 + x] = v; };
    for (let y = 5; y <= 20; y++) for (let x = 5; x <= 8; x++) set(x, y, -2);
    for (let y = 17; y <= 20; y++) for (let x = 5; x <= 20; x++) set(x, y, -2);
    for (let y = 8; y <= 11; y++) for (let x = 12; x <= 15; x++) set(x, y, -3);
    const L = ME.waterBasin(map2, 6, 6), pit = ME.waterBasin(map2, 13, 9);
    assert.ok(L && pit);
    assert.ok(L.x0 <= 5 && L.x1 >= 20 && L.y1 >= 20, 'the L is one hollow');
    assert.ok(pit.x0 >= 11 && pit.x1 <= 16 && pit.y0 >= 7 && pit.y1 <= 12, 'the pit is its own');
    assert.ok(ME.fillWaterAt(map2, 6, 6, 'Water') && ME.fillWaterAt(map2, 13, 9, 'Water'));
    assert.equal(ME.water(map2).length, 2, 'the pit is inside the L\'s box, but pouring one does not take the other');
    assert.equal(ME.waterAt(map2, 13, 9).level, pit.level); assert.equal(ME.waterAt(map2, 6, 6).level, L.level);
    assert.equal(ME.waterAt(map2, 13, 14), null, 'the ridge between them is dry');
    assert.equal(ME.removeWaterRegion(map2, ME.waterAt(map2, 13, 9)), true); assert.equal(ME.water(map2).length, 1, 'one sheet removed by itself');
    // A pond in a valley floor stays a pond: the water stops at the pond's rim instead of flooding the valley up to the hills.
    const map3 = { width: 40, height: 40, reactor3d: { version: 1, elevation: new Array(1600).fill(0) } };
    ME.ensureTerrain(map3);
    const g3 = ME.terrain(map3);
    for (let y = 0; y <= 40; y++) for (let x = 0; x <= 40; x++) g3[y * 41 + x] = (x < 3 || y < 3 || x > 37 || y > 37) ? 6 : 0;
    for (let y = 18; y <= 21; y++) for (let x = 18; x <= 21; x++) g3[y * 41 + x] = -2;
    const pond3 = ME.waterBasin(map3, 19, 19);
    assert.ok(pond3 && pond3.level <= 0.25 && pond3.cells < 60, 'the pond fills to the valley floor, not to the hills: ' + JSON.stringify(pond3 && [pond3.level, pond3.cells]));
    // A sheet from before masks: no mask, the whole box.
    assert.equal(ME.waterCovers(ME.normalizeWater({ x0: 0, y0: 0, x1: 3, y1: 3, level: 1 }, map3), 3, 3), true);
    assert.equal(ME.normalizeWater({ x0: 0, y0: 0, x1: 1, y1: 1, level: 1, mask: '1111' }, map3).mask, undefined, 'a full mask is dropped');
    assert.equal(ME.normalizeWater({ x0: -1, y0: 0, x1: 1, y1: 0, level: 1, mask: '110' }, map3).mask, '10', 'a mask is cut with its box at the map edge');
});
