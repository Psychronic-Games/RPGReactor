// Foliage: grass, flowers, ferns and reeds painted as a density per cell, bushes stood one by one,
// grown by the runtime (reactor_3d_foliage.js), painted by the Build bar's Foliage group and
// paint-foliage.cjs, and checked by validate-map.cjs.
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

function editorContext(extra = {}) {
    const events = [];
    const context = Object.assign({ console, JSON, Math, Object, Array, Number, String, Set, Map, Date, Uint8Array, Reactor3D: R,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } }, extra);
    context.window = context;
    context.events = events;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/MapFoliage.js'), context);
    return context;
}

/** A flat W x H map with a 3D sidecar. */
const flatMap = (W = 40, H = 30, extra = {}) => ({ id: 3, width: W, height: H, data: [], reactor3d: Object.assign({ version: 1, mode: '3d' }, extra) });
/** Out of the vm's realm, so strict deepEqual compares values (memory: vm-realm deepEqual). */
const plain = value => JSON.parse(JSON.stringify(value));
const levelsOf = (W, H, at) => { const levels = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) levels[y * W + x] = at(x, y); return levels; };

test('density reads and writes as runs, the trailing none left off, nonsense read as none', () => {
    const levels = Uint8Array.from([0, 0, 0, 5, 5, 7, 0, 9, 0, 0]);
    const text = R.encodeFoliageDensity(levels);
    assert.equal(text, '0x3 5x2 7 0 9');
    assert.deepEqual(Array.from(R.decodeFoliageDensity(text, 10)), Array.from(levels));
    assert.deepEqual(Array.from(R.decodeFoliageDensity('3x2 banana 4x99', 5)), [3, 3, 4, 4, 4], 'a bad token is skipped, a long run stops at the map');
    assert.equal(R.decodeFoliageDensity(null, 4).length, 4);
    const F = editorContext().RRMapFoliage;
    assert.equal(F.encode(levels), text, 'the editor writes what the runtime reads');
});

test('a foliage block normalizes: unknown kinds and stray bushes dropped, looks defaulted, wind clamped', () => {
    const map = flatMap(20, 10);
    const foliage = R.normalizeFoliage({
        wind: { dir: -30, strength: 9 },
        layers: [{ kind: 'grass', density: '9x5' }, { kind: 'trees', density: '9' }, { kind: 'flowers', density: '4', colours: ['#FF0000', 'nope'] }],
        bushes: [{ x: 3, y: 4 }, { x: -1, y: 4 }, { x: 'a', y: 1 }, { x: 5, y: 5, size: 99, tall: 1 }]
    }, map);
    assert.deepEqual(foliage.layers.map(l => l.kind), ['grass', 'flowers']);
    assert.equal(foliage.layers[0].height, R.FOLIAGE_LOOKS.grass.height);
    assert.deepEqual(foliage.layers[1].colours, ['#ff0000']);
    assert.equal(foliage.bushes.length, 2);
    assert.equal(foliage.bushes[1].size, 8, 'a bush is at most 8 tiles');
    assert.equal(foliage.bushes[1].tall, undefined, 'a round bush says nothing of its height');
    assert.deepEqual(foliage.wind, { dir: 330, strength: 2, gust: 1 });
});

test('grass keeps off pieces, rocks, deep water and cliffs; reeds stand in the shallows', () => {
    const W = 20, H = 10;
    const map = flatMap(W, H, {
        pieces: [{ id: 1, kind: 'floor', x: 2, y: 2, z: 0, material: 'Wood' }, { id: 2, kind: 'floor', x: 3, y: 2, z: 6, material: 'Wood' }],
        water: [{ x0: 10, y0: 0, x1: 12, y1: 9, level: 0.5, material: 'Water' }]
    });
    // A deep hollow under the right-hand half of the pond, a steep slope at the far right.
    const terrain = new Array((W + 1) * (H + 1)).fill(0);
    for (let y = 0; y <= H; y++) { terrain[y * (W + 1) + 12] = -2; terrain[y * (W + 1) + 13] = -2; for (let x = 17; x <= W; x++) terrain[y * (W + 1) + x] = (x - 17) * 3; }
    map.reactor3d.terrain = terrain; map.reactor3d.terrainWidth = W;
    assert.equal(R.foliageCellOpen(map, 2, 2, 'grass'), -1, 'a floor on the ground');
    assert.equal(R.foliageCellOpen(map, 3, 2, 'grass'), 0, 'a floor six levels up (a bridge) leaves the ground under it');
    assert.equal(R.foliageCellOpen(map, 5, 5, 'grass'), 0, 'open ground');
    assert.equal(R.foliageCellOpen(map, 10, 5, 'grass'), -1, 'shallow water is no place for grass');
    assert.ok(R.foliageCellOpen(map, 10, 5, 'reeds') > 0, 'reeds stand in the shallows');
    assert.equal(R.foliageCellOpen(map, 12, 5, 'reeds'), -1, 'but not where it is deep');
    assert.equal(R.foliageCellOpen(map, 18, 5, 'grass'), -1, 'a slope the room draws as rock');
    // A rock's columns keep the field off its footprint.
    const rocky = flatMap(W, H, { pieces: [{ id: 1, kind: 'rock', x: 6, y: 5, z: 0, size: [3, 2, 3], material: 'Rock' }] });
    assert.equal(R.foliageCellOpen(rocky, 6, 5, 'grass'), -1, 'under a rock');
    assert.equal(R.foliageCellOpen(rocky, 1, 1, 'grass'), 0);
});

test('the same map grows the same field, clumps sorted by rank for even thinning', () => {
    const W = 16, H = 16;
    const map = flatMap(W, H);
    const layer = R.normalizeFoliageLayer({ kind: 'grass', density: R.encodeFoliageDensity(levelsOf(W, H, (x, y) => (x + y) % 9)), seed: 4 }, map);
    const a = R.foliageClumps(map, layer, 0, 0, W, H), b = R.foliageClumps(map, layer, 0, 0, W, H);
    assert.ok(a.count > 200);
    assert.deepEqual(Array.from(a.base), Array.from(b.base), 'seeded: the same blades each time');
    for (let i = 1; i < a.count; i++) assert.ok(a.shape[i * 4 + 3] >= a.shape[(i - 1) * 4 + 3], 'ranks rise along the list');
    for (let i = 0; i < a.count; i++) {
        const x = a.base[i * 4], z = a.base[i * 4 + 2];
        assert.ok(x >= 0 && x < W && z >= 0 && z < H);
    }
    const other = R.foliageClumps(map, Object.assign({}, layer, { seed: 5 }), 0, 0, W, H);
    assert.notDeepEqual(Array.from(other.base.slice(0, 8)), Array.from(a.base.slice(0, 8)), 'another seed, another field');
});

test('a big bush blocks a step into it, a small one is walked through', () => {
    const map = flatMap(20, 10, { foliage: { bushes: [{ x: 5.5, y: 5.5, size: 2 }, { x: 12.5, y: 5.5, size: 0.9 }] } });
    assert.equal(R.terrainBlocks(map, 4, 5, 5, 5, 0), true, 'into the big one');
    assert.equal(R.terrainBlocks(map, 11, 5, 12, 5, 0), false, 'through the small one');
    assert.equal(R.terrainBlocks(map, 8, 5, 9, 5, 0), false, 'open ground');
    const out = { position: [], uv: [], color: [], foot: [], index: [] };
    R.bushMesh(map, R.foliageOf(map).bushes[0], out);
    assert.ok(out.index.length / 3 > 100, 'a bush is a mass of leaves');
    assert.ok(out.position.every(Number.isFinite) && out.color.every(Number.isFinite));
    const again = { position: [], uv: [], color: [], foot: [], index: [] };
    R.bushMesh(map, R.foliageOf(map).bushes[0], again);
    assert.deepEqual(again.position, out.position, 'the same bush each load');
});

test('the brush paints a layer per look, erases across them, and bushes stand and go', () => {
    const { RRMapFoliage: F } = editorContext();
    const map = flatMap(30, 20);
    const region = F.paint(map, 'grass', 10.5, 10.5, { radius: 3, strength: 1, level: 7 });
    assert.ok(region && region.x0 <= 10 && region.x1 >= 10);
    const layer = map.reactor3d.foliage.layers[0];
    assert.equal(R.decodeFoliageDensity(layer.density, 600)[10 * 30 + 10], 7);
    F.paint(map, 'grass', 20.5, 10.5, { radius: 2, strength: 1, level: 5, settings: { colour: '#335522' } });
    assert.equal(map.reactor3d.foliage.layers.length, 2, 'another colour is another layer');
    F.paint(map, 'grass', 10.5, 10.5, { radius: 4, strength: 1, erase: true });
    F.paint(map, 'grass', 20.5, 10.5, { radius: 4, strength: 1, erase: true });
    assert.equal(map.reactor3d.foliage, undefined, 'erased to nothing, the block goes');
    const bush = F.addBush(map, { x: 4, y: 5, size: 2, seed: 9 });
    assert.deepEqual(plain(bush), { x: 4, y: 5, size: 2, seed: 9 });
    assert.equal(F.removeBushes(map, 4.2, 5.1, 0.5), 1);
    assert.equal(map.reactor3d.foliage, undefined);
});

test('a map with only foliage keeps its file, written a layer and a bush a line', () => {
    const context = editorContext();
    const E = context.RRMapElevation, F = context.RRMapFoliage;
    const map = flatMap(10, 8);
    F.paint(map, 'flowers', 4.5, 4.5, { radius: 2, strength: 1, level: 4 });
    F.addBush(map, { x: 2, y: 2, size: 1.5, seed: 1 });
    const written = {};
    const fakeFs = { existsSync: () => true, unlinkSync: file => { written[file] = null; }, writeFileSync: (file, text) => { written[file] = text; } };
    assert.ok(E.save(fakeFs, path, '/project', map));
    const text = Object.values(written)[0];
    assert.ok(text, 'written, not removed as a flat map');
    assert.match(text, /"foliage": \{\n {4}"layers": \[\n {6}\{"kind":"flowers"/);
    assert.match(text, /\n {6}\{"x":2,"y":2,"size":1\.5,"seed":1\}\n {4}\]/);
    assert.deepEqual(JSON.parse(text).foliage, plain(map.reactor3d.foliage));
});

test('the wind is kept only where it differs from the default, and moves with a map resize', () => {
    const { RRMapFoliage: F, RRMapElevation: E } = editorContext();
    const map = flatMap(10, 8);
    F.paint(map, 'grass', 2.5, 2.5, { radius: 1, strength: 1, level: 9 });
    F.addBush(map, { x: 3, y: 3, size: 1, seed: 1 });
    F.setWind(map, { dir: 30, strength: 1.2 });
    assert.deepEqual(plain(map.reactor3d.foliage.wind), { strength: 1.2 });
    // Grow the map to 14 x 10 about its middle: everything moves 2 right, 1 down.
    map.width = 14; map.height = 10;
    E.resizeSidecar(map, 10, 8, 2, 1);
    const levels = R.decodeFoliageDensity(map.reactor3d.foliage.layers[0].density, 140);
    assert.equal(levels[3 * 14 + 4], 9, 'the painted cell moved with the tiles');
    assert.deepEqual([map.reactor3d.foliage.bushes[0].x, map.reactor3d.foliage.bushes[0].y], [5, 4]);
});

test('a foliage stroke is one undo step, and redo puts it back', () => {
    const context = editorContext();
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const map = flatMap(30, 20);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    terrain.setMode('grass');
    assert.equal(terrain.mode, 'grass');
    terrain.radius = 2; terrain.strength = 1; terrain.foliageLevel = 6;
    terrain.beginStroke({ x: 5, y: 5 });
    terrain.paintAt({ x: 9, y: 5 });
    terrain.paintAt({ x: 13, y: 5 });
    terrain.endStroke();
    assert.equal(terrain.undoStack.length, 1, 'one step for the whole drag');
    const painted = JSON.stringify(map.reactor3d.foliage);
    assert.ok(context.events.some(e => e.detail && e.detail.foliage && e.detail.region), 'the 3D view is told where');
    terrain.undo();
    assert.equal(map.reactor3d.foliage, undefined);
    terrain.redo();
    assert.equal(JSON.stringify(map.reactor3d.foliage), painted);
    // Bushes: a click stands one, Erase takes them again.
    terrain.setMode('bush');
    terrain.bushVary = false; terrain.bushSize = 2;
    terrain.beginStroke({ x: 20, y: 10 }); terrain.endStroke();
    assert.equal(map.reactor3d.foliage.bushes.length, 1);
    terrain.foliageErase = true;
    terrain.beginStroke({ x: 20, y: 10 }); terrain.endStroke();
    assert.equal(map.reactor3d.foliage.bushes, undefined);
    assert.equal(terrain.undoStack.length, 3);
});

test('paint-foliage fills by rule: inside its area, near or away from water and pieces', () => {
    const { paint, inside } = require(path.join(repoRoot, 'editor/build-scripts/paint-foliage.cjs'));
    const { RRMapFoliage: F } = editorContext();
    const W = 30, H = 20;
    const map = flatMap(W, H, { water: [{ x0: 0, y0: 0, x1: 4, y1: 19, level: 0.3, material: 'Water' }], pieces: [{ id: 1, kind: 'block', x: 20, y: 10, z: 0, material: 'Stone' }] });
    assert.equal(inside({ polygon: [[0, 0], [10, 0], [0, 10]] }, 2, 2), true);
    assert.equal(inside({ polygon: [[0, 0], [10, 0], [0, 10]] }, 8, 8), false);
    const run = paint(map, {
        fill: [{ kind: 'grass', level: 6, where: { rect: [0, 0, 29, 19] }, rules: { awayFromPieces: 2, awayFromWater: 1 } },
            { kind: 'reeds', level: 7, where: { all: true }, rules: { nearWater: 1 } }],
        bushes: [{ where: { rect: [10, 0, 15, 19] }, count: 5, size: [1, 1.5], spacing: 2, seed: 3 }],
        wind: { strength: 0.9 }
    }, { Reactor3D: R, F });
    assert.ok(run.report.some(line => /grass: \d+ cell/.test(line)));
    const foliage = R.foliageOf(map);
    const grass = foliage.layers.find(l => l.kind === 'grass').density, reeds = foliage.layers.find(l => l.kind === 'reeds').density;
    assert.equal(grass[10 * W + 20], 0, 'not on the block');
    assert.equal(grass[10 * W + 21], 0, 'nor beside it');
    assert.equal(grass[10 * W + 5], 0, 'nor at the water');
    assert.equal(grass[10 * W + 12], 6, 'open ground grows');
    assert.ok(reeds[10 * W + 5] > 0 && reeds[10 * W + 12] === 0, 'reeds only at the water');
    assert.equal(foliage.bushes.length, 5);
    assert.ok(foliage.bushes.every(b => b.x >= 10 && b.x < 16));
    assert.equal(foliage.wind.strength, 0.9);
});

test('the blades are built in the shader from their clump, lit like everything else, and drawn before the ground', () => {
    const layer = R.normalizeFoliageLayer({ kind: 'grass', density: '5' }, flatMap(4, 4));
    const material = R.foliageMaterial(layer);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile.call(material, shader, null);
    assert.match(shader.vertexShader, /attribute vec4 aFolBase;/);
    assert.match(shader.vertexShader, /vec3 transformed = rrP;/, 'the clump replaces the plain vertex');
    assert.match(shader.vertexShader, /vRRWorldPos = /, 'the light reads where the blade is');
    assert.match(shader.fragmentShader, /rrLight\(vRRWorldPos\)/);
    assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= vRRFoliage/);
    assert.equal(shader.uniforms.rrFolWind, R.foliageUniforms().rrFolWind, 'one wind for the whole map');
    assert.match(material.customProgramCacheKey(), /reactor3d-foliage-grass/);
    for (const kind of R.FOLIAGE_KINDS) {
        const t = R.foliageTemplate(kind);
        assert.ok(t.index.length % 3 === 0 && Math.max(...t.index) < t.position.length / 3, kind);
    }
});

test('a frame of the game reuses its vectors: who walks through, which chunks are near', () => {
    const scene = Object.create(R.MapScene.prototype);
    const group = new THREE.Group();
    const near = new THREE.Mesh(new THREE.BufferGeometry()), far = new THREE.Mesh(new THREE.BufferGeometry());
    near.userData.rrFoliageChunk = { x0: 0, z0: 0, x1: 16, z1: 16, y0: 0, y1: 1 };
    far.userData.rrFoliageChunk = { x0: 400, z0: 400, x1: 416, z1: 416, y0: 0, y1: 1 };
    group.add(near, far);
    group.updateMatrixWorld();
    scene._foliageGroup = group;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(8, 10, 8); camera.updateMatrixWorld();
    const saved = R._viewport;
    R._viewport = { camera: () => camera };
    try {
        const walker = { _realX: 3, _realY: 4, isMoving: () => false };
        const pushers = R.foliageUniforms().rrFolPush.value;
        scene.updateFoliageFrame([walker]);
        assert.equal(near.visible, true);
        assert.equal(far.visible, false, 'a chunk past the fade is not drawn at all');
        assert.deepEqual([pushers[0].x, pushers[0].y, pushers[0].w], [3.5, 4.5, 1], 'the player bends the grass');
        assert.equal(pushers[1].w, 0);
        const first = pushers[0];
        scene.updateFoliageFrame([walker]);
        assert.equal(R.foliageUniforms().rrFolPush.value[0], first, 'the same vector next frame');
    } finally { R._viewport = saved; }
});

test('foliage is an extension the game, the editor and the builds all load', () => {
    assert.ok(R.EXTENSIONS.some(e => e.file === 'reactor_3d_foliage.js' && e.namespace === 'Foliage'));
    assert.ok(R.Foliage);
    const main = read('runtime/reactor_main.js');
    assert.ok(main.indexOf('"js/reactor_3d_foliage.js"') > main.indexOf('"js/reactor_3d_speech.js"'));
    for (const file of ['editor/build-scripts/build.js', 'editor/build-scripts/build-worker.js', 'editor/build-scripts/dist-editor-worker.js']) {
        assert.match(read(file), /'reactor_3d_foliage\.js'/, file);
    }
    assert.match(read('editor/index.html'), /src\/utils\/MapFoliage\.js/);
    assert.equal(R.MapScene.prototype.addWater.__rrFoliage, true, 'grown with the map, after its water');
    assert.equal(R.terrainBlocks.__rrFoliage, true);
});

test('the Build bar has a Foliage group whose slots are the terrain tool\'s foliage modes', () => {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    // Earth's four, then the alien three (ground-types.test.cjs), then bushes.
    // (The kinds, then the group's Eraser, which takes every kind away.)
    assert.deepEqual(BuildHotbar.FOLIAGE, ['grass', 'flowers', 'fern', 'reeds', 'bulbs', 'tendrils', 'crystals', 'bush', 'ferase']);
    assert.ok(BuildHotbar.GROUPS.includes('foliage'));
    const bar = Object.create(BuildHotbar.prototype);
    const terrain = { mode: 'fern' };
    bar.terrain = () => terrain;
    bar.manager = () => ({});
    global.window.reactor = { mapTool: 'terrain' };
    try {
        assert.equal(bar.group(), 'foliage');
        assert.deepEqual(bar.slots(), BuildHotbar.FOLIAGE);
        assert.equal(bar.activeSlot(), 'fern');
        terrain.mode = 'raise';
        assert.equal(bar.group(), 'terrain');
    } finally { delete global.window.reactor; }
    const i18n = read('editor/src/I18nManager.js');
    for (const key of ['build.group.foliage', 'foliage.grass', 'foliage.hint.paint', 'foliage.windNeedsFoliage']) assert.ok(i18n.includes(`"${key}"`), key);
});

test('each group of the Build bar has an eraser: Terrain\'s takes painted ground away, Foliage\'s every plant', () => {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    assert.deepEqual(BuildHotbar.ERASERS, ['hammer', 'terase', 'ferase', 'mremove']);
    assert.ok(BuildHotbar.TERRAIN.indexOf('terase') === BuildHotbar.TERRAIN.indexOf('ground') + 1, 'beside Ground');
    assert.equal(BuildHotbar.FOLIAGE[BuildHotbar.FOLIAGE.length - 1], 'ferase');
    const bar = Object.create(BuildHotbar.prototype);
    const modes = [];
    const terrain = { mode: 'raise', groundErase: false, active: true, setMode(mode) { modes.push(mode); this.mode = mode; }, editGroundType() {} };
    bar.terrain = () => terrain;
    bar.manager = () => ({});
    bar.render = () => {};
    global.window.reactor = { mapTool: 'terrain' };
    try {
        // Ground and the Eraser are the ground's brush, painting and taking away.
        bar.pick('terase');
        assert.deepEqual([terrain.mode, terrain.groundErase, bar.activeSlot()], ['ground', true, 'terase']);
        bar.pick('ground');
        assert.deepEqual([terrain.mode, terrain.groundErase, bar.activeSlot()], ['ground', false, 'ground']);
        bar.pick('raise');
        assert.equal(bar.activeSlot(), 'raise');
        // The Foliage group's is a mode of its own.
        bar.pick('ferase');
        assert.deepEqual([terrain.mode, bar.group(), bar.activeSlot()], ['ferase', 'foliage', 'ferase']);
        // One name and one picture for all four.
        bar._t = key => key;
        bar._tt = text => text;
        assert.deepEqual(BuildHotbar.ERASERS.map(slot => bar.label(slot)), ['build.hammer', 'build.hammer', 'build.hammer', 'build.hammer']);
        const pictures = new Set(BuildHotbar.ERASERS.map(slot => bar.icon(slot)));
        assert.equal(pictures.size, 1);
    } finally {
        delete global.window.reactor;
    }
});

test('the foliage eraser takes every kind under the brush, and the bushes in it', () => {
    // (The tool is a browser script: it leaves its class on the window.)
    require(path.join(repoRoot, 'editor/src/TerrainManager.js'));
    const TerrainManager = global.window.TerrainManager;
    const tool = Object.create(TerrainManager.prototype);
    const calls = [];
    const foliage = {
        paint(map, kind, x, y, options) { calls.push([kind, options.erase, options.radius]); return kind === 'grass' ? { x0: 1, y0: 1, x1: 4, y1: 4 } : null; },
        removeBushes(map, x, y, radius) { calls.push(['bushes', radius]); return true; }
    };
    Object.assign(tool, { mode: 'ferase', radius: 3, strength: 0.5, foliageLevel: 5, foliageLook: {}, _foliageStroke: { saved: null, region: null, last: null, travelled: 0 } });
    tool.currentMap = () => ({});
    tool.foliage = () => foliage;
    let announced = null;
    tool.announceFoliage = region => { announced = region; };
    assert.equal(tool.isFoliageMode('ferase'), true);
    assert.equal(tool.foliageDab({ x: 10, y: 10 }, true), true);
    assert.deepEqual(calls.filter(call => call[0] !== 'bushes').map(call => call[0]), TerrainManager.FOLIAGE_MODES.filter(kind => kind !== 'bush'));
    assert.ok(calls.every(call => call[0] === 'bushes' || call[1] === true), 'every kind is erased');
    assert.deepEqual(calls[calls.length - 1], ['bushes', 3]);
    assert.ok(announced && announced.x0 <= 1 && announced.x1 >= 13, 'the map is told of all of it');
});
