// Rivers and waterfalls: a water sheet with a `path` runs downhill, falls where it drops steeply,
// carries swimmers, and is laid by the Build bar's River tool or carve-river.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

function loadElevation(extra = {}) {
    const context = Object.assign({ Reactor3D: R }, extra);
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    return context.RRMapElevation;
}

/** A W x H map: a plateau at 6 for x <= 14, a cliff, then flat ground at 0. */
function cliffMap(W = 40, H = 30) {
    const terrain = new Array((W + 1) * (H + 1)).fill(0);
    for (let z = 0; z <= H; z++) for (let x = 0; x <= W; x++) terrain[z * (W + 1) + x] = x <= 14 ? 6 : x >= 16 ? 0 : 3;
    return { width: W, height: H, data: [], reactor3d: { version: 1, mode: '3d', terrain, terrainWidth: W } };
}

const river = (extra = {}) => Object.assign({ x0: 2, y0: 2, x1: 20, y1: 6, material: 'Water',
    path: [[2, 4.5, 5], [10, 4.5, 4.5], [12, 4.5, 0], [20, 4.5, -0.2]] }, extra);

test('a sheet with a path keeps it and its flow, and a level pond is unchanged', () => {
    const map = { width: 30, height: 30 };
    const E = loadElevation();
    for (const normalize of [raw => R.normalizeWater(raw, map), raw => E.normalizeWater(raw, map)]) {
        const sheet = normalize(river({ flow: 2.5, level: 99 }));
        assert.deepEqual(Array.from(sheet.path, p => Array.from(p)), [[2, 4.5, 5], [10, 4.5, 4.5], [12, 4.5, 0], [20, 4.5, -0.2]]);
        assert.equal(sheet.flow, 2.5);
        assert.equal(sheet.level, 5, 'the level old readers see is the river\'s top');
        const pond = normalize({ x0: 1, y0: 1, x1: 3, y1: 3, level: 0.5 });
        assert.equal(pond.path, undefined);
        assert.equal(pond.level, 0.5);
        assert.equal(normalize(river({ path: [[2, 4, 1]] })).path, undefined, 'one point is no river');
        assert.equal(normalize(river({ path: [[2, 4, 1], [99, 4, 0]] })).path[1][0], 30, 'points stay on the map');
    }
    // The editor writes the default flow as nothing; a still river keeps its 0.
    assert.equal(E.normalizeWater(river(), map).flow, undefined);
    assert.equal(E.normalizeWater(river({ flow: 0 }), map).flow, 0);
    assert.equal(R.normalizeWater(river({ flow: 0 }), map).flow, 0);
});

test('the surface follows the path with no crease, round a bend and where the slope changes', () => {
    const map = { width: 40, height: 40 };
    // A bend: east, then south, dropping all the way.
    const sheet = R.normalizeWater({ x0: 0, y0: 0, x1: 39, y1: 39, path: [[2, 10, 4], [20, 10, 3], [20, 30, 1]] }, map);
    // Across the inside of the bend, and along the river through the joint, in small steps.
    // No step: ten times finer steps make ten times smaller changes.
    const steepest = steps => {
        let worst = 0, last = null;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, level = R.riverSample(sheet, 14 + t * 5, 12 + t * 5, {}).level;
            if (last !== null) worst = Math.max(worst, Math.abs(level - last));
            last = level;
        }
        return worst;
    };
    const coarse = steepest(100), fine = steepest(1000);
    assert.ok(fine < coarse / 5 && fine < 0.01, `no step across the bend (${coarse} then ${fine})`);
    // Along the line the slope eases: second differences stay small at the joint.
    const at = s => s <= 18 ? R.riverSample(sheet, 2 + s, 10, {}).level : R.riverSample(sheet, 20, 10 + (s - 18), {}).level;
    let bend = 0;
    for (let s = 15; s <= 21; s += 0.25) bend = Math.max(bend, Math.abs(at(s + 0.25) - 2 * at(s) + at(s - 0.25)));
    assert.ok(bend < 0.01, `the slope changes smoothly (${bend})`);
    // It never rises downstream, and runs the way the path goes.
    let previous = Infinity;
    for (let s = 0; s <= 38; s += 0.5) { const level = at(s); assert.ok(level <= previous + 1e-9); previous = level; }
    const east = R.riverSample(sheet, 8, 10, {}), south = R.riverSample(sheet, 20, 25, {});
    assert.ok(east.dx > 0.99 && south.dz > 0.99);
});

test('a steep drop is a waterfall: no sheet there, a curtain from lip to foot, foam where it lands', () => {
    const map = cliffMap();
    map.reactor3d.water = [river()];
    const sheet = R.waterOf(map)[0];
    const falls = R.riverFalls(sheet);
    assert.equal(falls.length, 1);
    assert.deepEqual([falls[0].x0, falls[0].top, falls[0].x1, falls[0].bottom], [10, 4.5, 12, 0]);
    assert.equal(R.riverSample(sheet, 11, 4.5, {}).fall, true);
    assert.equal(R.riverSample(sheet, 9, 4.5, {}).fall, false);
    assert.equal(R.riverSample(sheet, 12, 4.5, {}).fall, false, 'the foot itself is the river below');
    // Beside the line, just past the lip: on the fall, not the river above it held out over the drop.
    assert.equal(R.riverSample(sheet, 10.4, 6.2, {}).fall, true);
    assert.equal(R.riverSample(sheet, 9.6, 6.2, {}).fall, false, 'and just before it, the river above');
    // A gentle stretch is no fall however long; a sheer drop with no run is one.
    assert.equal(R.riverFalls(R.normalizeWater(river({ path: [[2, 4, 5], [20, 4, 0]] }), map)).length, 0);
    assert.equal(R.riverFalls(R.normalizeWater(river({ path: [[2, 4, 5], [10, 4, 5], [10, 4, 1], [20, 4, 0.8]] }), map)).length, 1);
    // The sheet has no quad on the fall, and the curtain spans it.
    const geometry = R.waterGeometry(sheet, map, true, R.waterOf(map));
    const positions = geometry.attributes.position.array, index = geometry.index.array;
    // No quad stands on the fall: every one lies flat (within half a tile), the river above it or the pool at its foot.
    for (let i = 0; i < index.length; i += 6) {
        const ys = [index[i], index[i + 1], index[i + 2], index[i + 5]].map(k => positions[k * 3 + 1]);
        assert.ok(Math.max(...ys) - Math.min(...ys) <= 0.5, `a flat quad (${ys})`);
    }
    assert.ok(geometry.attributes.rrFlow && geometry.attributes.rrRapid, 'the river carries its flow to the shader');
    // Each cell is laid finer than a tile, so the shore fade follows a bank rising inside a cell (no straight seams).
    const xs = new Set(); for (let i = 0; i < positions.length; i += 3) xs.add(Math.round(positions[i] * 1000) / 1000);
    assert.ok([...xs].some(x => Math.abs(x - Math.round(x)) > 0.2), 'vertices between the tile corners');
    const curtain = R.fallGeometry(falls[0]), ys = [];
    for (let i = 1; i < curtain.attributes.position.array.length; i += 3) ys.push(curtain.attributes.position.array[i]);
    assert.ok(Math.max(...ys) > 4.5 && Math.min(...ys) < 0, 'from the lip down past the foot\'s surface');
    // It starts half a tile upstream of the lip, over the end of the river's sheet.
    const xsC = []; for (let i = 0; i < curtain.attributes.position.array.length; i += 3) xsC.push(curtain.attributes.position.array[i]);
    assert.ok(Math.min(...xsC) <= 10 - R.FALL_LEAD + 1e-6, 'its first row reaches back over the river');
    const foot = R.fallFoot(falls[0]);
    assert.ok(foot.x > 12 && foot.radius > 1);
});

test('where a river runs into a lake the lake draws the water past its first cell, and fades where the river comes in', () => {
    const map = cliffMap();
    map.reactor3d.water = [river(), { x0: 16, y0: 2, x1: 24, y1: 7, level: -0.2, material: 'Water' }];
    const [sheet] = R.waterOf(map);
    const geometry = R.waterGeometry(sheet, map, true, R.waterOf(map));
    const positions = geometry.attributes.position.array, index = geometry.index.array;
    for (let i = 0; i < index.length; i += 6) {
        const cx = (positions[index[i] * 3] + positions[index[i + 5] * 3]) / 2;
        assert.ok(cx < 17.5, `no river quad past the lake's first cell (${cx})`);
    }
    // The lake fades at its edge where the river comes in, so the overlap is a blend, not a pane's edge.
    const lake = R.waterGeometry(R.waterOf(map)[1], map, true, R.waterOf(map));
    const lp = lake.attributes.position.array, le = lake.attributes.rrEdge.array;
    let faded = false;
    for (let i = 0; i < le.length; i++) if (lp[i * 3] === 16 && lp[i * 3 + 2] === 4 && le[i] === 0) faded = true;
    assert.ok(faded, 'the lake fades where the river enters it');
});

test('the water level, its surface and its flow are the river\'s where you are', () => {
    const map = cliffMap();
    map.reactor3d.water = [river()];
    assert.ok(Math.abs(R.waterLevelAt(map, 5, 4) - 4.78) < 0.01, 'a cell reads the river at its middle');
    assert.ok(Math.abs(R.waterSurfaceAt(map, 15.5, 4.5) - R.riverSample(R.waterOf(map)[0], 15.5, 4.5, {}).level) < 1e-9);
    const flow = R.waterFlowAt(map, 5, 4);
    assert.ok(flow.dx > 0.99 && flow.speed > 0.3 && flow.speed < 1.2, `${flow.speed}`);
    assert.equal(R.waterFlowAt(map, 11, 4), null, 'no current on the fall itself');
    assert.equal(R.waterFlowAt(map, 30, 20), null);
    map.reactor3d.water = [river({ flow: 0 })];
    assert.equal(R.waterFlowAt(map, 5, 4), null, 'a still river carries no one');
    // Faster where it drops.
    assert.ok(R.riverSpeed(0.25) > R.riverSpeed(0.02) * 2);
});

test('a swimmer is carried downstream, and cannot swim up a waterfall', () => {
    const context = { console, Math, JSON, Number, Object, Array, $dataSystem: {}, $dataMap: null, Input: { keyMapper: {}, gamepadMapper: {} } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_controls.js'), context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    const map = cliffMap();
    map.reactor3d.water = [river()];
    context.$dataMap = map;
    context.Reactor3D = R;
    let moves = [];
    const swimmer = { x: 4, y: 4, _reactorSwim: true, _reactorGround: 3, isMoving: () => false, canPass: () => true, direction: () => 8,
        moveStraight(d) { moves.push(d); this.x += d === 6 ? 1 : d === 4 ? -1 : 0; }, setDirection(d) { this.facing = d; }, isMovementSucceeded: () => true };
    for (let frame = 0; frame < 240; frame++) context.ReactorPhysics.drift(swimmer, false);
    assert.ok(moves.length >= 2 && moves.every(d => d === 6), `carried east, downstream (${moves})`);
    assert.equal(swimmer.facing, 8, 'facing as it was');
    moves = [];
    swimmer._reactorDriftX = swimmer._reactorDriftY = 0;
    for (let frame = 0; frame < 240; frame++) context.ReactorPhysics.drift(swimmer, true);
    assert.deepEqual(moves, [], 'a step of its own is not fought');
    // A river running aslant carries a swimmer aslant: both ways, step by step.
    map.reactor3d.water = [{ x0: 0, y0: 0, x1: 30, y1: 29, material: 'Water', path: [[1, 1, 0], [28, 28, -1]] }];
    const aslant = Object.assign({}, swimmer, { x: 5, y: 5, _reactorDriftX: 0, _reactorDriftY: 0, moveStraight(d) { moves.push(d); this.x += d === 6 ? 1 : d === 4 ? -1 : 0; this.y += d === 2 ? 1 : d === 8 ? -1 : 0; } });
    moves = [];
    for (let frame = 0; frame < 600; frame++) context.ReactorPhysics.drift(aslant, false);
    assert.ok(moves.includes(6) && moves.includes(2) && Math.abs(moves.filter(d => d === 6).length - moves.filter(d => d === 2).length) <= 1, `east and south in turn (${moves})`);
    // A step under way pauses the count, it does not lose it.
    let moving = true;
    const stepping = Object.assign({}, aslant, { _reactorDriftX: 0.9, _reactorDriftY: 0.9, isMoving: () => moving });
    moves = [];
    for (let frame = 0; frame < 30; frame++) context.ReactorPhysics.drift(stepping, false);
    assert.deepEqual([moves.length, stepping._reactorDriftX, stepping._reactorDriftY], [0, 0.9, 0.9]);
    moving = false;
    for (let frame = 0; frame < 30; frame++) context.ReactorPhysics.drift(stepping, false);
    assert.equal(moves.length, 2, 'both ways go once the step is over');
    map.reactor3d.water = [river()];
    const walker = Object.assign({}, swimmer, { _reactorSwim: false, _reactorGround: 4.6 });
    moves = [];
    for (let frame = 0; frame < 240; frame++) context.ReactorPhysics.drift(walker, false);
    assert.deepEqual(moves, [], 'a gentle stream does not sweep a wader off its feet');
    // The swim float rides the river's surface where the swimmer is.
    const float = context.ReactorPhysics.floatHeight(map, 5.5, 4.5, -10, { swim: true, swimDepth: 2.2 });
    assert.ok(Math.abs(float - (R.waterSurfaceAt(map, 5.5, 4.5) - 2.2)) < 1e-9);
    // Deep water to deep water: across and down are swum, up a fall is not.
    const saved = {};
    const stub = { terrainOf: () => null, hasPieces: () => false, stairPieceAt: () => null, groundHeightAt: () => -10, waterLevelAt: (m, x) => (x <= 10 ? 4.5 : 0) };
    for (const key of Object.keys(stub)) { saved[key] = R[key]; R[key] = stub[key]; }
    global.ReactorPhysics = { settings: () => ({ swim: true, swimDepth: 2.2 }) };
    try {
        assert.equal(R.terrainBlocks(map, 9, 4, 10, 4), false, 'along the pool above');
        assert.equal(R.terrainBlocks(map, 10, 4, 11, 4), false, 'over the lip and down');
        assert.equal(R.terrainBlocks(map, 11, 4, 10, 4), true, 'not swum up the fall');
    } finally {
        delete global.ReactorPhysics;
        for (const key of Object.keys(saved)) R[key] = saved[key];
    }
});

test('a river is water to the eye in its channel, never on the dry banks downstream of its source', () => {
    const map = cliffMap();
    map.reactor3d.water = [river()];
    const mapScene = Object.create(R.MapScene.prototype);
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group);
    mapScene.scene = () => scene;
    mapScene.piecesGroup = () => group;
    mapScene._materials = [];
    mapScene._waterMeshes = R.waterOf(map).map(region => { const mesh = new THREE.Mesh(new THREE.BufferGeometry()); mesh.userData.water = region; group.add(mesh); return mesh; });
    mapScene.noteWaterVolume();
    const boxes = scene.userData.rrWater;
    assert.equal(boxes.length, 2, 'a box for each stretch that does not fall');
    // Downstream of the fall the banks stand at 0: below the river's source (5), above the river there (-0.1).
    assert.equal(R.underWaterAt(scene, 16, 0.2, 9), null, 'a dry bank is not under water');
    assert.ok(R.underWaterAt(scene, 16, -0.6, 4.5), 'the river\'s own channel is');
    assert.ok(R.underWaterAt(scene, 5, 4, 4.5), 'and upstream, under its higher surface');
});

test('only the four water volumes nearest the player or the camera go to the shader', () => {
    const map = { width: 200, height: 40, reactor3d: { mode: '3d' } };
    const course = [];
    for (let x = 2; x <= 190; x += 8) course.push([x, 20, -(x / 40)]);
    map.reactor3d.water = [{ x0: 0, y0: 15, x1: 199, y1: 25, material: 'Water', path: course }];
    const mapScene = Object.create(R.MapScene.prototype);
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group);
    mapScene.scene = () => scene;
    mapScene.piecesGroup = () => group;
    mapScene._waterMeshes = R.waterOf(map).map(region => { const mesh = new THREE.Mesh(new THREE.BufferGeometry()); mesh.userData.water = region; group.add(mesh); return mesh; });
    mapScene.noteWaterVolume({ x: 150, z: 20 });
    const picked = scene.userData.rrWater;
    assert.equal(picked.length, R.WATER_VOLUME_MAX);
    assert.ok(picked.every(box => box.x1 > 120 && box.x0 < 180), 'the stretches round x 150');
    const first = picked;
    mapScene.noteWaterVolume({ x: 150.5, z: 20 });
    assert.equal(scene.userData.rrWater, first, 'a small move keeps the choice (no new list)');
});

test('the River tool carves a channel down the ground, falls off the cliff, and is one undo step', () => {
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, Date, Reactor3D: R,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const E = context.RRMapElevation;
    const map = cliffMap();
    const before = map.reactor3d.terrain.slice();
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    terrain.setMode('river');
    // Points come in as the 3D view gives them: half a tile short of the cell's middle.
    terrain.beginStroke({ x: 2, y: 15 });
    terrain.beginStroke({ x: 33, y: 15 });
    assert.equal(terrain.riverPending(), true);
    assert.equal(E.water(map).length, 0, 'nothing laid until the course is finished');
    assert.equal(terrain.handleRiverKey({ key: 'Enter' }), true);
    const [sheet] = E.water(map);
    assert.ok(sheet && sheet.path, 'a river');
    assert.equal(terrain.riverPending(), false);
    const levels = sheet.path.map(p => p[2]);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1], 'never uphill');
    assert.ok(levels[0] < 6 && levels[0] > 5, `starts under the plateau (${levels[0]})`);
    assert.ok(R.riverFalls(R.normalizeWater(sheet, map)).length === 1, 'falls off the cliff');
    const grid = map.reactor3d.terrain, corner = (x, z) => grid[z * 41 + x];
    assert.ok(corner(5, 15) < 6 - 0.5, 'the channel is carved');
    assert.equal(corner(5, 5), 6, 'and nothing far from it');
    assert.ok(grid.every((v, i) => v <= before[i] + 1e-9), 'the ground is only ever lowered');
    terrain.undo();
    assert.equal(E.water(map).length, 0, 'undo takes the river');
    assert.deepEqual(map.reactor3d.terrain, before, 'and its channel');
    terrain.redo();
    assert.equal(E.water(map).length, 1);
    assert.ok(map.reactor3d.terrain[15 * 41 + 5] < 5.5);
    // Too short a course, Escape, and another tool all drop the course.
    terrain.beginStroke({ x: 2, y: 20 });
    assert.equal(terrain.finishRiver(), false);
    assert.equal(terrain.handleRiverKey({ key: 'Escape' }), true);
    assert.equal(terrain.riverPending(), false);
    terrain.beginStroke({ x: 2, y: 20 });
    terrain.setMode('raise');
    assert.equal(terrain.riverPending(), false);
});

test('Pour beside a river keeps it, refits read the river\'s own height, and a resize moves its course', () => {
    const E = loadElevation();
    const map = cliffMap();
    const laid = E.carveRiver(map, [[2.5, 15.5], [33.5, 15.5]], { width: 3, depth: 1 });
    assert.ok(laid);
    const cells = laid.sheet.mask.split('').filter(c => c === '1').length;
    // Refit after nothing changed leaves the river as it is (its downstream banks are below its source).
    assert.equal(E.refitWater(map), false);
    assert.equal(E.water(map)[0].mask.split('').filter(c => c === '1').length, cells);
    // A hollow dug beside the river and poured: the river stays.
    for (let z = 22; z <= 26; z++) for (let x = 22; x <= 26; x++) map.reactor3d.terrain[z * 41 + x] = -2;
    E.fillWaterAt(map, 24, 24, 'Water');
    assert.equal(E.water(map).filter(sheet => sheet.path).length, 1);
    // Resized by two columns on the left: the course moves with the tiles.
    const old = E.water(map).find(sheet => sheet.path).path[0][0];
    map.width = 42;
    E.resizeSidecar(map, 40, 30, 2, 0);
    assert.equal(E.water(map).find(sheet => sheet.path).path[0][0], old + 2);
});

test('carve-river.cjs lays a river from a course file, and --check writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-river-'));
    fs.mkdirSync(path.join(dir, 'data'));
    const map = cliffMap();
    const sidecar = map.reactor3d;
    delete map.reactor3d;
    fs.writeFileSync(path.join(dir, 'data', 'Map001.json'), JSON.stringify(map));
    fs.writeFileSync(path.join(dir, 'data', 'Map001.r3d.json'), JSON.stringify(sidecar));
    fs.writeFileSync(path.join(dir, 'course.json'), JSON.stringify([[2.5, 15.5], [33.5, 15.5]]));
    const script = path.join(repoRoot, 'editor/build-scripts/carve-river.cjs');
    const checked = execFileSync(process.execPath, [script, dir, '1', path.join(dir, 'course.json'), '--check'], { encoding: 'utf8' });
    assert.match(checked, /waterfall at/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'Map001.r3d.json'), 'utf8')).water, undefined, '--check wrote nothing');
    execFileSync(process.execPath, [script, dir, '1', path.join(dir, 'course.json'), '--width', '4', '--flow', '1.5'], { encoding: 'utf8' });
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'Map001.r3d.json'), 'utf8'));
    assert.equal(written.water.length, 1);
    assert.ok(Array.isArray(written.water[0].path) && written.water[0].flow === 1.5);
    assert.ok(written.terrain[15 * 41 + 5] < 6, 'the channel is in the file');
    // validate-map reads it back, and says so when a course runs uphill.
    const validate = () => { try { return execFileSync(process.execPath, [path.join(repoRoot, 'editor/build-scripts/validate-map.cjs'), dir, '1'], { encoding: 'utf8' }); } catch (error) { return String(error.stdout); } };
    const report = validate();
    assert.match(report, /river 1: \d+ points, .* 1 waterfall/);
    written.water[0].path = [[2, 15, 1], [20, 15, 3]];
    fs.writeFileSync(path.join(dir, 'data', 'Map001.r3d.json'), JSON.stringify(written));
    assert.match(validate(), /FIX {2}river 1: runs uphill/);
});

test('a fall lays a curtain, foam and a bounded, fixed scatter of spray and mist; all of it goes with a rebuild', () => {
    const map = cliffMap();
    map.reactor3d.water = [river()];
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    scene.addWater(map, name => (name === 'Water' ? { image: { width: 4, height: 4 }, width: 4, height: 4 } : null));
    const kinds = scene._waterFalls.map(m => (m.isPoints ? 'spray' : m.geometry.attributes.rrFoamUv ? 'foam' : 'curtain'));
    assert.deepEqual(kinds, ['curtain', 'foam', 'spray']);
    const spray = scene._waterFalls[2];
    const count = spray.geometry.attributes.rrSeed.count;
    assert.ok(count >= 10 && count <= R.FALL_SPRAY_MAX + R.FALL_MIST_MAX, `a few dozen points (${count})`);
    assert.ok(spray.geometry.boundingSphere && spray.geometry.boundingSphere.radius > 1, 'culled by a sphere round the foot');
    assert.equal(spray.material.depthWrite, false);
    // The same fall scatters the same way every time it is built.
    const again = R.fallSprayGeometry(R.riverFalls(R.waterOf(map)[0])[0], R.fallFoot(R.riverFalls(R.waterOf(map)[0])[0]));
    assert.deepEqual(Array.from(again.attributes.rrSeed.array), Array.from(spray.geometry.attributes.rrSeed.array));
    // The point size follows whatever the pass draws into, with no new object per draw.
    const target = { height: 540 };
    const renderer = { getRenderTarget: () => target, getDrawingBufferSize: v => v.set(1600, 900) };
    R.fallSprayBeforeRender(renderer, null, null, spray.geometry, spray.material);
    assert.equal(spray.material.uniforms.rrViewH.value, 540);
    renderer.getRenderTarget = () => null;
    R.fallSprayBeforeRender(renderer, null, null, spray.geometry, spray.material);
    const scratch = R._fallSpraySize;
    R.fallSprayBeforeRender(renderer, null, null, spray.geometry, spray.material);
    assert.equal(spray.material.uniforms.rrViewH.value, 900);
    assert.equal(R._fallSpraySize, scratch, 'one scratch vector');
    // A water edit takes every fall part down before laying them again.
    const before = scene._waterFalls.slice();
    scene.updateWaterSheets(map, () => null);
    assert.ok(before.every(m => !m.parent), 'the old parts left the scene');
    assert.equal(scene._waterFalls.length, 3);
});

test('a river is coloured by its depth before the light, mirrors by its Fresnel term, and glints off moving ripples', () => {
    const world = read('runtime/reactor_3d_world.js');
    assert.match(R.RIVER_SHADE_GLSL, /mix\(rrShallow, rrDeep, rrDeepness\)/, 'clear shallows, dark deep water');
    assert.match(R.RIVER_SHADE_GLSL, /mix\(0\.32, 0\.95, rrDeepness\)/, 'see-through over the shallows, near opaque over the deep');
    assert.match(R.RIVER_SHADE_GLSL, /rrLace = rrShore/, 'lace along the bank');
    assert.match(R.RIVER_MAP_GLSL, /rrRipple = mix\(rrSlopeA, rrSlopeB, rrFade\)/, 'ripples carried downstream with the image');
    assert.doesNotMatch(R.RIVER_MAP_GLSL, /dFdx/, 'no pixel-scale normals (they sparkled as frost)');
    assert.match(world, /\n {16}Reactor3D\.RIVER_SHADE_GLSL,\n/, 'ponds and rivers shade alike');
    assert.match(world, /const vec2 vRRFlow = vec2\(0\.16, 0\.07\);/, 'a pond with a breath of wind across it');
    assert.match(world, /min\(rrWaterLook\.x \/ 0\.45, 1\.0\) \* rrFresnel/, 'water mirrors by its Fresnel term');
    assert.match(world, /pow\(smoothstep\(0\.45, 1\.0, rrWaterLook\.x\), 1\.5\)/, 'a reflect past water\'s raises a floor toward a mirror (mercury)');
    assert.doesNotMatch(R.RIVER_SHADE_GLSL, /rrSelf|>= 0\.5/, 'no half-way switch for a glowing liquid: what it shines is added after the light');
    assert.match(R.RIVER_SHADE_GLSL, /\* \(1\.0 - rrWaterColour\.w\)/, 'only water laces white at the bank');
});

test('a pond a river leaves fades out where the river runs on, and stays whole elsewhere', () => {
    const map = cliffMap();
    // A pool on the plateau at 5.9 (x 4-8), a river leaving it east at 5.85.
    map.reactor3d.water = [{ x0: 4, y0: 3, x1: 8, y1: 6, level: 5.9, material: 'Water' },
        { x0: 8, y0: 3, x1: 20, y1: 6, material: 'Water', path: [[7.5, 4.5, 5.85], [12, 4.5, 5.8], [20, 4.5, 5.7]] }];
    const [pool] = R.waterOf(map);
    const geometry = R.waterGeometry(pool, map, true, R.waterOf(map));
    const positions = geometry.attributes.position.array, edge = geometry.attributes.rrEdge.array;
    const at = (x, z) => { for (let i = 0; i < edge.length; i++) if (positions[i * 3] === x && positions[i * 3 + 2] === z) return edge[i]; return null; };
    assert.equal(at(9, 4), 0, 'faded where the river runs on');
    assert.equal(at(4, 4), 1, 'whole on its far side');
    // A pond with no river by it is whole everywhere.
    const alone = R.waterGeometry(pool, map, true, [pool]);
    assert.ok(Array.from(alone.attributes.rrEdge.array).every(v => v === 1));
});

test('river water hanging over a drop beside a lip is neither drawn nor laid', () => {
    const map = cliffMap();
    // The river above the lip reaches out over the cliff at its side: from x 12 the ground is far below.
    map.reactor3d.water = [{ x0: 2, y0: 2, x1: 20, y1: 6, material: 'Water', path: [[2, 4.5, 5], [12.5, 4.5, 5], [13, 4.5, 0.5], [20, 4.5, 0.3]] }];
    for (let z = 0; z <= 30; z++) for (let x = 13; x <= 16; x++) map.reactor3d.terrain[z * 41 + x] = 0;
    const [sheet] = R.waterOf(map);
    const geometry = R.waterGeometry(sheet, map, true, [sheet]);
    const p = geometry.attributes.position.array, d = geometry.attributes.rrDepth.array, ix = geometry.index.array;
    for (let i = 0; i < ix.length; i += 3) assert.ok(Math.max(d[ix[i]], d[ix[i + 1]], d[ix[i + 2]]) <= R.RIVER_DEEP_MAX + 1e-6, `no quad hanging high over the ground (${p[ix[i] * 3]}, ${p[ix[i] * 3 + 1]})`);
    // carveRiver leaves such cells dry.
    const E = loadElevation();
    const cliff = cliffMap();
    for (let z = 0; z <= 30; z++) for (let x = 15; x <= 18; x++) cliff.reactor3d.terrain[z * 41 + x] = -10;
    const laid = E.carveRiver(cliff, [[2.5, 15.5, 5.6], [14.5, 15.5, 5.6], [15, 15.5, -9.7], [25, 15.5, -9.9]], { width: 4, depth: 1 });
    const s = laid.sheet, w = s.x1 - s.x0 + 1;
    for (let z = s.y0; z <= s.y1; z++) for (let x = s.x0; x <= s.x1; x++) {
        if (!s.mask || s.mask[(z - s.y0) * w + (x - s.x0)] !== '1') continue;
        assert.ok(E.riverLevelAt(s, x + 0.5, z + 0.5) - E.terrainHeightAt(cliff, x + 0.5, z + 0.5) <= 1 + 2 + 1e-6, `cell ${x},${z} is not out over the drop`);
    }
});
