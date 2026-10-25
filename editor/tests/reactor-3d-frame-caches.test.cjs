/**
 * Per-frame caches in the 3D runtime, and what invalidates them.
 *
 * Each one replaces work repeated inside a frame (a string built per sample
 * of a light's march, a key per collision query, a vector per light) with a
 * kept value. The value must be dropped the moment what it was made from
 * changes, or a light marches another map's walls and a model collides as
 * its old size.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;

function withGameMap(map, fn) {
    const saved = { gameMap: global.$gameMap, dataMap: global.$dataMap, solid: Reactor3D._lightSolid, roomFor: Reactor3D.roomFor };
    global.$gameMap = map;
    global.$dataMap = { width: map.width(), height: map.height(), data: [] };
    Reactor3D._lightSolid = null;
    try { return fn(); } finally {
        global.$gameMap = saved.gameMap; global.$dataMap = saved.dataMap;
        Reactor3D._lightSolid = saved.solid; Reactor3D.roomFor = saved.roomFor;
    }
}

test('the light-block grid is kept for its map and rebuilt when the map or its size changes', () => {
    let builds = 0;
    const map = { _mapId: 3, w: 7, h: 5, width() { return this.w; }, height() { return this.h; }, allTiles: () => { builds++; return [0]; } };
    withGameMap(map, () => {
        Reactor3D.roomFor = () => ({ height: 9 });
        const first = Reactor3D.lightSolidGrid();
        assert.equal(first.key, '3:7x5', 'the readable key is still there');
        assert.equal(builds, 35, 'one look at every cell');
        for (let i = 0; i < 50; i++) Reactor3D.lightBlockHeightAt(i % 7, i % 5);
        assert.equal(Reactor3D.lightSolidGrid(), first, 'every sample of a march reads the same grid');
        assert.equal(builds, 35, 'and nothing is rebuilt for it');
        assert.equal(Reactor3D.lightBlockHeightAt(2, 2), 9, 'an unpainted room cell is wall to its ceiling');

        map._mapId = 4;
        const other = Reactor3D.lightSolidGrid();
        assert.notEqual(other, first, 'another map: another grid');
        assert.equal(other.key, '4:7x5');
        map.w = 8;
        assert.equal(Reactor3D.lightSolidGrid().width, 8, 'a resized map: rebuilt at its new size');
        map.h = 6;
        assert.equal(Reactor3D.lightSolidGrid().height, 6);

        // A grid put in place by hand (the occlusion tests do) names no map.
        Reactor3D._lightSolid = { key: 'test', width: 8, height: 6, grid: new Uint8Array(48), room: true, roomHeight: 25 };
        assert.equal(Reactor3D.lightSolidGrid().key, '4:8x6', 'is replaced once a game map is there to ask');
    });
});

test('a model spec keeps its collision keys until a field they are made from changes', () => {
    const spec = { name: 'Tank', ext: '.glb', file: '', size: 4, scale: 1, stretch: [1, 1.5, 1], pitch: 0, roll: 0 };
    const legacy = s => `${Reactor3D.modelCacheKey(s.name, s.ext, s.file)}|${s.size}|${s.scale}|${(s.stretch || []).join(',')}|${s.pitch}|${s.roll}`;
    const keys = Reactor3D.collisionKeysFor(spec);
    assert.equal(keys.model, Reactor3D.modelCacheKey('Tank', '.glb', ''));
    assert.equal(keys.pose, legacy(spec), 'the same key the mask cache has always used');
    assert.equal(Reactor3D.collisionKeysFor(spec), keys, 'asked again: nothing is built');

    spec.size = 6;
    assert.equal(Reactor3D.collisionKeysFor(spec).pose, legacy(spec), 'a new size is a new pose');
    spec.stretch[1] = 2;
    assert.equal(Reactor3D.collisionKeysFor(spec).pose, legacy(spec), 'a stretch edited in place is seen');
    spec.stretch = [1, 2];
    assert.equal(Reactor3D.collisionKeysFor(spec).pose, legacy(spec), 'and one of another length');
    delete spec.stretch;
    assert.equal(Reactor3D.collisionKeysFor(spec).pose, legacy(spec), 'and none at all');
    spec.pitch = 0.5; spec.roll = -0.25;
    assert.equal(Reactor3D.collisionKeysFor(spec).pose, legacy(spec), 'pitch and roll');
    spec.name = 'Car';
    const renamed = Reactor3D.collisionKeysFor(spec);
    assert.equal(renamed.model, Reactor3D.modelCacheKey('Car', '.glb', ''), 'another model');
    assert.equal(renamed.pose, legacy(spec));

    // The mask cache itself: one build per pose, read back after.
    const saved = { glb: Reactor3D._glbCache, masks: Reactor3D._collisionMasks, build: Reactor3D.buildModelCollisionMask };
    let built = 0;
    Reactor3D._glbCache = { [renamed.model]: { template: { userData: {} } } };
    Reactor3D._collisionMasks = {};
    Reactor3D.buildModelCollisionMask = () => ({ n: ++built });
    try {
        const mask = Reactor3D.modelCollisionMask(spec);
        assert.equal(Reactor3D.modelCollisionMask(spec), mask);
        assert.equal(built, 1);
        spec.scale = 2;
        assert.notEqual(Reactor3D.modelCollisionMask(spec), mask, 'a rescaled model gets its own mask');
        assert.equal(built, 2);
    } finally {
        Reactor3D._glbCache = saved.glb; Reactor3D._collisionMasks = saved.masks; Reactor3D.buildModelCollisionMask = saved.build;
    }
});

test('a mirror candidate that moves is measured each frame into scratch; a still one is measured once', () => {
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(0, 2, 0); camera.lookAt(0, 2, -10); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const panel = (x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4)); m.position.set(x, 2, z); m.updateMatrixWorld(); return m; };
    const chunk = panel(0, -20); chunk.userData.pieceChunk = 0;
    const model = panel(0, -10);
    const parent = new THREE.Group(); parent.add(chunk, model);
    scene._mirrorList = { frame: Infinity, list: [chunk, model] };
    const savedGraphics = global.Graphics;
    global.Graphics = { frameCount: Infinity };
    try {
        assert.deepEqual(scene.mirrorCandidates(camera).map(o => o.id), [model.id, chunk.id], 'nearest first');
        const kept = chunk.userData.__rrMirrorSphere;
        assert.ok(kept && kept !== scene._mirrorBounds.sphere, 'the still chunk keeps a sphere of its own');
        assert.equal(model.userData.__rrMirrorSphere, undefined, 'a moving model keeps none');
        model.position.set(0, 2, -40); model.updateMatrixWorld();
        assert.deepEqual(scene.mirrorCandidates(camera).map(o => o.id), [chunk.id, model.id], 'the model is measured where it now is');
        assert.equal(chunk.userData.__rrMirrorSphere, kept, 'the chunk is not measured again');
        assert.ok(Math.abs(kept.center.z + 20) < 1e-6, 'and the scratch never overwrote it');
    } finally {
        global.Graphics = savedGraphics;
    }
});

test('flat light quads read fixed ground axes that a spotlight never bends', () => {
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const saved = { lights: Reactor3D._lights, mode: Reactor3D.LIGHT_MODE, occlusion: Reactor3D.LIGHT_OCCLUSION, viewport: Reactor3D.viewport, dataMap: global.$dataMap,
        round: Reactor3D.roundLightTexture, cone: Reactor3D.coneLightTexture };
    Reactor3D.roundLightTexture = Reactor3D.coneLightTexture = () => new THREE.Texture();
    scene._scene = new THREE.Scene();
    scene._materials = [];
    Reactor3D.LIGHT_MODE = 'flat';
    Reactor3D.LIGHT_OCCLUSION = false;
    Reactor3D.viewport = () => null;
    global.$dataMap = { width: 20, height: 20, data: [] };
    const beam = { x: 5, y: 5, radius: 4, type: Reactor3D.LIGHT_BEAM, yaw: 90, width: 1 };
    const spot = { x: 8, y: 5, radius: 3, type: Reactor3D.LIGHT_SPOT, yaw: 30, angle: 50 };
    const round = { x: 2, y: 9, radius: 2 };
    try {
        Reactor3D.setLights([beam, spot, round]);
        scene.syncLights({ x: 5, y: 5 });
        const cone = scene.lightPool('cone').geometry.attributes.position.array.slice(0, 24);
        const pool = scene.lightPool('round').geometry.attributes.position.array.slice(0, 12);
        const axes = Reactor3D._flatLightAxes;
        assert.deepEqual(axes.right.toArray(), [1, 0, 0]);
        assert.deepEqual(axes.up.toArray(), [0, 0, -1]);
        scene.syncLights({ x: 5, y: 5 });
        assert.deepEqual(Array.from(scene.lightPool('cone').geometry.attributes.position.array.slice(0, 24)), Array.from(cone), 'the next frame lays the same quads');
        assert.deepEqual(Array.from(scene.lightPool('round').geometry.attributes.position.array.slice(0, 12)), Array.from(pool));
        // The beam aims east along +x: its tip corners stand four tiles east of the lamp.
        assert.ok(Math.abs(cone[0] - (5.5 + 4)) < 1e-5 && Math.abs(cone[3] - (5.5 + 4)) < 1e-5, 'a beam aimed east reaches east');
    } finally {
        Reactor3D.setLights(saved.lights || []);
        Reactor3D.LIGHT_MODE = saved.mode; Reactor3D.LIGHT_OCCLUSION = saved.occlusion; Reactor3D.viewport = saved.viewport;
        Reactor3D.roundLightTexture = saved.round; Reactor3D.coneLightTexture = saved.cone;
        global.$dataMap = saved.dataMap;
    }
});

test('number-array uniforms are sent once per program until their values change; samplers always', () => {
    global.self = global; global.window = global;
    require(require('node:path').resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    const R = require(require('node:path').resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const sent = [];
    const uniform = (id, type, size) => ({ id, type, size, cache: [], setValue(gl, v) { sent.push([id, Array.from(v)]); } });
    const lights = uniform('rrLightPos', 0x8B52, 2), shadow = uniform('rrLightShadow', 0x1406, 2), samplers = uniform('rrMaps', 0x8B5E, 2);
    let reads = 0;
    const program = { getUniforms: () => { reads++; return { seq: [lights, shadow, { seq: [samplers] }] }; } };
    const renderer = { info: { programs: [program] } };
    R.cacheUniformArrays(renderer);
    // Not read here (a wait on the GPU process per new program): taken in at three's own first read.
    assert.equal(reads, 0, 'the uniforms are not read for the cache');
    program.getUniforms();
    assert.equal(reads, 1);
    R.cacheUniformArrays(renderer);
    program.getUniforms();
    assert.equal(reads, 2, 'and the program reads as three\'s own afterwards');
    const pos = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    lights.setValue(null, pos); lights.setValue(null, pos);
    assert.equal(sent.length, 1, 'the same values again are not sent');
    pos[6] = 9; lights.setValue(null, pos);
    assert.equal(sent.length, 2, 'a changed element is');
    assert.deepEqual(sent[1][1].slice(6), [9, 8]);
    shadow.setValue(null, [-1, 2]); shadow.setValue(null, [-1, 2]); shadow.setValue(null, [-1, 3]);
    assert.equal(sent.filter(([id]) => id === 'rrLightShadow').length, 2, 'plain number arrays alike');
    samplers.setValue(null, [0, 1]); samplers.setValue(null, [0, 1]);
    assert.equal(sent.filter(([id]) => id === 'rrMaps').length, 2, 'sampler arrays are never held back');
    // Another program holds its own values: its first bind is always sent.
    const other = uniform('rrLightPos', 0x8B52, 2);
    const second = { getUniforms: () => ({ seq: [other] }) };
    renderer.info.programs.push(second);
    R.cacheUniformArrays(renderer);
    second.getUniforms();
    other.setValue(null, pos);
    assert.equal(sent.filter(([id]) => id === 'rrLightPos').length, 3);
    // The kill switch sends every time.
    R.uniformArrayCache = false;
    lights.setValue(null, pos); lights.setValue(null, pos);
    assert.equal(sent.filter(([id]) => id === 'rrLightPos').length, 5);
    R.uniformArrayCache = true;
    const source = require('./helpers/runtime-3d-source.cjs').source3D();
    assert.match(source, /Reactor3D\._renderScene = function\(renderer, scene, camera\) \{\n\s+if \(this\.cacheUniformArrays\) this\.cacheUniformArrays\(renderer\);/, 'every colour draw takes new programs in');
    assert.match(require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', '..', 'runtime/reactor_battle_room.js'), 'utf8'), /R\.cacheUniformArrays\?\.\(this\.renderer\);\n\s+this\.renderer\.render\(this\.scene,this\.camera\);/, 'and the battle room\'s');
});
