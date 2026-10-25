// A map opened in the game is laid over the frames of its loading wait (Reactor3D.Arrival): its rocks
// measured and the near ones meshed on the background meshers, its pieces a few chunks a frame, the
// water and what follows it a part a frame, its models waited for and the world drawn unseen, all
// before the map shows. What is laid is what one frame used to lay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

function load() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
}
const mapWith = (pieces, size = 64) => ({ width: size, height: size, reactor3d: { version: 1, elevation: new Array(size * size).fill(0), pieces } });
const rock = (id, x, y, extra) => Object.assign({ id, kind: 'rock', x, y, z: 0, rot: 0, material: 'Rock', size: [4, 5, 4], rough: 0.6, cap: 'Moss' }, extra);
const plain = value => JSON.parse(JSON.stringify(value));

/** Background meshers that run the real worker program, each job on a later turn. */
async function withWorkers(R, run) {
    const saved = { Worker: global.Worker, Blob: global.Blob, create: URL.createObjectURL };
    const posted = [];
    global.Worker = class {
        constructor() {
            this.context = { self: { postMessage: data => setTimeout(() => this.onmessage({ data }), 0) }, Math, Map, Float32Array, Float64Array, Array, Infinity, JSON };
            vm.runInNewContext(R.rockWorkerSource(), this.context);
        }
        postMessage(data) { posted.push(data); setTimeout(() => this.context.self.onmessage({ data }), 0); }
        terminate() {}
    };
    global.Blob = class {};
    URL.createObjectURL = () => 'blob:arrival-test';
    delete R._rockPool;
    try { await run(posted); } finally {
        global.Worker = saved.Worker; global.Blob = saved.Blob; URL.createObjectURL = saved.create; delete R._rockPool;
    }
}

/** Every rock column a map's cells hold, in a fixed order. */
const columnsOf = (R, map) => {
    const out = [];
    for (const [key, stack] of R.pieceIndex(map).cells) for (const p of stack) if (p.kind === 'rock') out.push([key, p.x, p.y, p.z, p.rockTop, p.anchor.join(',')]);
    return out.sort((a, b) => a[0] - b[0] || a[3] - b[3]);
};

test('a map\'s rocks are measured on the background meshers before it is laid: the cells find the same columns, and nothing is measured on the game\'s thread', async () => {
    const R = load();
    const pieces = [rock(1, 8, 8), rock(2, 10, 9, { size: [3, 8, 3], rough: 0.2 }), rock(3, 40, 30, { z: 5, size: [3, 2, 3] })];
    // What the game's thread measures on its own, from a cleared cache.
    R._rockColumnCache = new Map();
    const expected = columnsOf(R, mapWith(plain(pieces)));
    await withWorkers(R, async posted => {
        R._rockColumnCache = new Map();
        const map = mapWith(plain(pieces));
        const measuring = R.prepareRockColumns(map);
        assert.ok(measuring && typeof measuring.then === 'function', 'a map with rocks is measured in the background');
        assert.equal(R._rockColumnCache.size, 0, 'nothing measured here meanwhile');
        await measuring;
        assert.ok(posted.length > 0 && posted.every(job => job.kind === 'columns'), 'each chunk went to a mesher');
        const field = R.rockField;
        let here = 0;
        R.rockField = function() { here++; return field.apply(this, arguments); };
        try {
            assert.deepEqual(columnsOf(R, map), expected, 'the columns the cells stand on are the ones measured here');
        } finally { R.rockField = field; }
        assert.equal(here, 0, 'the index measures nothing itself');
        assert.equal(R.prepareRockColumns(map), null, 'measured already: nothing to wait for');
    });
    assert.equal(R.prepareRockColumns(mapWith([{ id: 1, kind: 'block', x: 1, y: 1, z: 0, rot: 0, material: 'Stone' }])), null, 'no rock: nothing to wait for');
    R._rockColumnCache = new Map();
    assert.equal(R.prepareRockColumns(mapWith(plain(pieces))), null, 'no workers: measured where it is asked, as before');
});

test('the rock chunks round the arrival point are meshed on the background meshers, and a scene given them meshes none of them itself', async () => {
    const R = load();
    const pieces = [rock(1, 8, 8), rock(2, 56, 56)];
    await withWorkers(R, async () => {
        const map = mapWith(plain(pieces));
        const cache = await R.prepareNearRockChunks(map, { x: 8.5, z: 8.5 });
        const { chunks } = R.rockChunkPlan(map, R.rockPiecesOf(map), null);
        const near = chunks.filter(({ box }) => Math.hypot(Math.max(box.x0 - 8.5, 0, 8.5 - box.x1), Math.max(box.z0 - 8.5, 0, 8.5 - box.z1)) <= R.ROCK_NEAR);
        assert.ok(near.length && near.length < chunks.length, 'some chunks are near, some far');
        assert.deepEqual([...cache.keys()].sort(), near.map(c => c.key).sort(), 'exactly the near chunks');
        for (const chunk of near) {
            const expected = R.rockChunkBuckets(chunk.reaching, chunk.box, R.rockGroundFloor(map));
            assert.equal(cache.get(chunk.key).sig, chunk.sig);
            // (Spread: what a worker hands back is of its own realm.)
            assert.deepEqual([...cache.get(chunk.key)].map(b => [b.name, b.cap, Array.from(b.positions)]), expected.map(b => [b.name, b.cap, Array.from(b.positions)]), 'the same faces');
        }
        // A scene laid from that cache meshes no near chunk on the game's thread.
        const scene = Object.create(R.MapScene.prototype);
        scene._scene = {}; scene._meshes = []; scene._pieceMeshes = []; scene._materials = [];
        scene._rockChunkCache = cache; scene._rockWorkers = true;
        const laid = [];
        scene.addPieceChunkMesh = function(key) { laid.push(key); return { userData: {} }; };
        scene.groundLoader = () => null;
        global.$gamePlayer = { _realX: 8, _realY: 8 };
        const buckets = R.rockChunkBuckets;
        let meshedHere = 0;
        R.rockChunkBuckets = function() { meshedHere++; return buckets.apply(this, arguments); };
        try { scene.addPieces(map, () => null); } finally { R.rockChunkBuckets = buckets; delete global.$gamePlayer; }
        assert.equal(meshedHere, 0, 'nothing meshed here');
        for (const chunk of near) if (cache.get(chunk.key).length) assert.ok(laid.includes(chunk.key), 'each near chunk with faces is laid at once');
    });
    assert.equal((await R.prepareNearRockChunks(mapWith(plain(pieces)), { x: 8, z: 8 })).size, 0, 'no workers: an empty cache, meshed when laid');
});

test('pieces laid later are laid a chunk at a time, in the order and to the meshes one call lays', () => {
    const R = load();
    const pieces = [];
    let id = 1;
    for (const [x, y] of [[1, 1], [2, 1], [20, 3], [40, 40], [41, 40], [5, 50]]) {
        pieces.push({ id: id++, kind: 'block', x, y, z: 0, rot: 0, material: 'Stone' });
        pieces.push({ id: id++, kind: 'floor', x, y: y + 1, z: 0, rot: 0, material: 'Wood' });
    }
    const map = mapWith(pieces);
    const make = () => { const s = Object.create(R.MapScene.prototype); s._scene = new THREE.Scene(); s._meshes = []; s._materials = []; s._textures = []; return s; };
    const loader = () => null;
    const whole = make();
    whole.addPieces(map, loader);
    const staged = make();
    staged.addPieces(map, loader, true);
    assert.equal(staged._pieceMeshes.length, 0, 'only listed');
    const chunks = new Set(whole._pieceMeshes.map(m => m.userData.pieceChunk)).size;
    let calls = 0;
    while (!staged.layQueuedPieces(0)) {
        calls++;
        assert.equal(new Set(staged._pieceMeshes.map(m => m.userData.pieceChunk)).size, calls, 'a chunk a call with no time to spare');
    }
    assert.equal(calls + 1, chunks, 'the last chunk is laid by the call that says it is done');
    const shape = scene => scene._pieceMeshes.map(m => [m.userData.pieceChunk, m.userData.pieceMaterial, Array.from(m.geometry.attributes.position.array)]);
    assert.deepEqual(shape(staged), shape(whole));
    assert.deepEqual(staged._pieceMeshes.map(m => m.material.name || m.material.uuid && 'm').length, whole._pieceMeshes.length);
    assert.equal(staged.layQueuedPieces(5), true, 'nothing left');
    const quick = make();
    quick.addPieces(map, loader, true);
    assert.equal(quick.layQueuedPieces(1000), true, 'with time enough, all of it in one call');
    assert.deepEqual(shape(quick), shape(whole));
});

test('the arrival lays pieces, then the water, then what follows the water a part a frame, then waits for the models it asked for', () => {
    const R = load();
    const A = R.Arrival;
    const calls = [];
    let piecesLeft = 2;
    const scene = Object.create(R.MapScene.prototype);
    Object.assign(scene, {
        _scene: {},
        addPieces(map, loader, later) { calls.push(['pieces', later]); },
        layQueuedPieces(budget) { calls.push(['lay', budget]); return --piecesLeft === 0; },
        addWater() { calls.push(['water']); this.followUp(() => calls.push(['land'])); this.followUp(() => calls.push(['plants'])); }
    });
    const holder = { object: null };
    const job = { map: {}, load: () => null, stage: 0, models() { calls.push(['models']); scene._modelInstances = new Map([['p', holder]]); } };
    const steps = [];
    for (let i = 0; i < 9; i++) steps.push(A.step(scene, job, 7));
    assert.deepEqual(calls, [['pieces', true], ['lay', 7], ['lay', 7], ['water'], ['land'], ['plants'], ['models']], 'one part a frame, in order');
    assert.deepEqual(steps, [false, false, false, false, false, false, false, false, false], 'not done while a model it asked for is still coming');
    assert.equal(A.pacing, true, 'new models are built a few a frame meanwhile');
    holder.object = {};
    assert.equal(A.step(scene, job, 7), true, 'done once it stands');
    assert.equal(A.pacing, false);
    assert.equal(scene._followUps, null, 'nothing is kept for later after the arrival');
    // A model that could not be made (no file, no template) is not waited for: its load has settled.
    scene._modelInstances = new Map([['e2', { object: null, settled: true }]]);
    assert.equal(A.step(scene, job, 7), true);
    assert.match(fs.readFileSync(path.join(runtimeRoot, 'reactor_3d_models.js'), 'utf8'), /\}\)\)\.finally\(\(\) => \{ holder\.settled = true; \}\);/, 'an instance\'s load says when it has settled, built or not');
    // A model whose files never come does not hold the map for ever.
    const late = { map: {}, load: () => null, stage: 5, since: -1e9 };
    scene._modelInstances = new Map([['e1', { object: null }]]);
    assert.equal(A.step(scene, late, 7), true);
    // Outside an arrival what follows the water is done with it.
    const now = [];
    const other = Object.create(R.MapScene.prototype);
    other.followUp(() => now.push(1));
    assert.deepEqual(now, [1]);
    // A laying that fails part way does what it kept and keeps nothing more.
    const broken = Object.create(R.MapScene.prototype);
    broken._followUps = [() => now.push(2)];
    A.abandon(broken);
    assert.deepEqual([now, broken._followUps, A.pacing], [[1, 2], null, false]);
});

test('models joining while a map is laid are built a few a frame, as in a battle', () => {
    const R = load();
    const J = R.ModelJoins;
    J.queue.length = 0;
    R.Arrival.pacing = true;
    const built = [];
    try {
        J.spent = 0;
        J.add(() => { built.push(1); J.spent += 100; });
        J.add(() => built.push(2));
        assert.deepEqual(built, [1], 'the first of a frame, the next waits');
        J.drain();
        assert.deepEqual(built, [1, 2]);
    } finally { R.Arrival.pacing = false; J.queue.length = 0; }
    J.add(() => built.push(3));
    J.add(() => built.push(4));
    assert.deepEqual(built, [1, 2, 3, 4], 'otherwise each the moment its files are in');
});

test('a neighbor\'s pieces are laid a few chunks a part, then its water', () => {
    const R = load();
    const N = R.Neighbors;
    const calls = [];
    let left = 3;
    const scene = { _scene: {}, _neighborGlobals: null,
        addPieces(map, loader, later) { calls.push(['pieces', later]); },
        layQueuedPieces(budget) { calls.push(['lay', budget]); return --left === 0; },
        addWater() { calls.push(['water']); } };
    const body = { stage: 1, scene, record: { map: { width: 4, height: 4 } }, at: { x: 0, z: 0 }, mapId: 2 };
    const stages = [];
    while (body.stage) { N.stage(body); stages.push(body.stage); }
    assert.deepEqual(calls, [['pieces', true], ['lay', N.BUDGET_MS], ['lay', N.BUDGET_MS], ['lay', N.BUDGET_MS], ['water']]);
    assert.deepEqual(stages, [2, 2, 2, 3, 0]);
    // A part that throws is not tried again.
    const failing = { stage: 2, scene: { _scene: {}, layQueuedPieces() { throw new Error('no'); }, addWater() { calls.push(['water 2']); } }, record: { map: {} }, at: { x: 0, z: 0 } };
    const warn = console.warn; console.warn = () => {};
    try { N.stage(failing); N.stage(failing); } finally { console.warn = warn; }
    assert.deepEqual([failing.stage, calls.at(-1)], [0, ['water 2']]);
    // Its rocks are measured before its world is built: at once when there is nothing to measure.
    const record = { map: mapWith([]) };
    assert.equal(N.measured(record), true);
});

/** One `Name.prototype.method = function...` block of a runtime file, as written. */
const block = (file, head) => {
    const source = fs.readFileSync(path.join(runtimeRoot, file), 'utf8');
    const at = source.indexOf(head);
    assert.ok(at >= 0, head);
    return source.slice(at, source.indexOf('\n};\n', at) + 3);
};

function spritesetWorld(R) {
    const ctx = { Reactor3D: R, Graphics: { frameCount: 1 }, SceneManager: { final: true, isFinalUpdateOfFrame() { return this.final; } }, performance, console };
    ctx.Spriteset_Map = function() {};
    vm.createContext(ctx);
    for (const head of ['Spriteset_Map.prototype.updateReactor3DArrival = ', 'Spriteset_Map.prototype.updateReactor3DWarm = ', 'Spriteset_Map.prototype.finishReactor3DArrival = ']) vm.runInContext(block('reactor_sprites.js', head), ctx);
    return ctx;
}

test('the loading wait lays the world a part a frame, then draws it unseen until nothing waits to be drawn', () => {
    const R = load();
    const ctx = spritesetWorld(R);
    const set = new ctx.Spriteset_Map();
    const parts = [], draws = [];
    let partsLeft = 3;
    const A = R.Arrival, step = A.step, warmup = R.ShaderWarmup.lastHidden;
    A.step = () => { parts.push(ctx.Graphics.frameCount); return --partsLeft <= 0; };
    try {
        const job = { stage: 0, frame: -1, drawn: -1 };
        set._reactor3d = { scene: {}, arrival: job };
        set.updateReactor3D = function() { draws.push(this._reactor3d.warming); };
        const frame = () => { const r = set.updateReactor3DArrival(); return r; };
        assert.equal(frame(), false);
        assert.equal(frame(), false, 'asked again in the same frame: nothing more is done');
        ctx.SceneManager.final = false; ctx.Graphics.frameCount++;
        assert.equal(frame(), false, 'a catch-up update lays nothing');
        ctx.SceneManager.final = true;
        assert.equal(frame(), false); ctx.Graphics.frameCount++;
        R.ShaderWarmup.lastHidden = 5;
        assert.equal(frame(), false, 'laid: the first unseen draw');
        assert.deepEqual(parts, [1, 2, 3]);
        assert.deepEqual(draws, [true], 'drawn as a draw of the wait, not a frame of play');
        ctx.Graphics.frameCount++;
        assert.equal(frame(), false, 'meshes still sit out');
        R.ShaderWarmup.lastHidden = 0;
        ctx.Graphics.frameCount++;
        assert.equal(frame(), true, 'nothing left out: the map starts');
        assert.equal(set._reactor3d.arrival, null);
        assert.equal(draws.length, 3);
        assert.equal(frame(), true, 'and is not held again');
        // The wait for programs is spent: the map starts with what is ready.
        set._reactor3d = { scene: {}, arrival: { stage: 9, frame: -1, drawn: 0 } };
        R.ShaderWarmup.lastHidden = 50;
        partsLeft = 0;
        ctx.Graphics.frameCount++; frame();
        set._reactor3d.arrival.warmFrom -= A.WARM_MS + 1;
        ctx.Graphics.frameCount++;
        assert.equal(frame(), true);
        // A failure part way lets the map start.
        A.step = () => { throw new Error('broken'); };
        set._reactor3d = { scene: { _followUps: [] }, arrival: { stage: 1, frame: -1, drawn: -1 } };
        const error = console.error; console.error = () => {};
        try { ctx.Graphics.frameCount++; assert.equal(frame(), true); } finally { console.error = error; }
        assert.equal(set._reactor3d.scene._followUps, null);
    } finally { A.step = step; R.ShaderWarmup.lastHidden = warmup; }
    // No 3D world, or one built in one go: nothing to wait for.
    set._reactor3d = null;
    assert.equal(set.updateReactor3DArrival(), true);
    // Sheets still loading when the spriteset was made: the world is built (staged) once they are in.
    let made = 0;
    set._reactor3dPending = true;
    set.isReactor3DTilesetReady = () => made < 0;
    set.createReactor3D = () => { made++; set._reactor3dPending = false; set._reactor3d = null; };
    assert.equal(set.updateReactor3DArrival(), true, 'no sheets yet: the scene\'s own wait for its pictures holds it');
    made = -1;
    set.updateReactor3DArrival();
    assert.equal(made, 0, 'built once they are in');
});

test('the map starts only once its world stands, and the world is laid on every frame of the wait', () => {
    const scenes = fs.readFileSync(path.join(runtimeRoot, 'reactor_scenes.js'), 'utf8');
    const at = scenes.indexOf('const _reactorSceneMapIsReady = Scene_Map.prototype.isReady;');
    const source = scenes.slice(at, scenes.indexOf('\n};\n', at) + 3);
    const ctx = { Scene_Map: function() {} };
    let baseReady = false;
    ctx.Scene_Map.prototype.isReady = () => baseReady;
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    let asked = 0, laid = false;
    const scene = Object.assign(new ctx.Scene_Map(), { _mapLoaded: true, _spriteset: { updateReactor3DArrival() { asked++; return laid; } } });
    assert.equal(scene.isReady(), false);
    assert.equal(asked, 1, 'laid while the pictures are still loading');
    baseReady = true;
    assert.equal(scene.isReady(), false, 'the pictures are in, the world is not');
    laid = true;
    assert.equal(scene.isReady(), true);
    baseReady = false;
    assert.equal(scene.isReady(), false);
    scene._reactorPreloadDone = false; baseReady = true;
    assert.equal(scene.isReady(), false, 'the models it preloads are still waited for');
    assert.equal(Object.assign(new ctx.Scene_Map(), { _mapLoaded: false }).isReady(), true, 'no spriteset yet: nothing of its own to wait for');
});

test('the game builds a map opened while loading without its pieces and water, and a draw of the wait is not counted as play', () => {
    const sprites = fs.readFileSync(path.join(runtimeRoot, 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /new Reactor3D\.MapScene\(\$dataMap, this\._tilemap\.bitmaps, arrival \? Reactor3D\.Arrival\.options\(\$dataMap\) : undefined\)/);
    assert.match(sprites, /if \(!state\.warming\) \{\n\s+quality\.mapOpened\(\$gameMap\.mapId\(\)\);\n\s+if \(!quality\.worldTick\(performance\.now\(\)\)\) return;\n\s+\}/);
    const R = load();
    const map = mapWith([]);
    R.Arrival._rocks = { map, cache: new Map([[1, []]]) };
    const options = R.Arrival.options(map);
    assert.equal(options.staged, true);
    assert.equal(options.rockChunkCache.size, 1, 'with the rocks meshed for it');
    assert.equal(R.Arrival._rocks, null, 'once');
    assert.deepEqual(plain(R.Arrival.options(mapWith([]))), { staged: true }, 'another map\'s rocks are not handed over');
});

test('the loading wait holds for the background measuring, then builds the cell index on a frame of its own', async () => {
    const R = load();
    const A = R.Arrival;
    const saved = { prepare: R.prepareRockColumns, near: R.prepareNearRockChunks, index: R.pieceIndex };
    let release;
    R.prepareRockColumns = () => new Promise(resolve => { release = resolve; });
    R.prepareNearRockChunks = () => Promise.resolve(new Map());
    const indexed = [];
    R.pieceIndex = map => { indexed.push(map); };
    global.$gamePlayer = { isTransferring: () => true, _newX: 3, _newY: 4 };
    try {
        assert.deepEqual(plain(A.focus()), { x: 3.5, z: 4.5 }, 'where the transfer puts the player');
        const map = mapWith([]);
        A.prepare(map);
        assert.equal(A.ready(), false);
        release();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(A.ready(), false, 'measured: the index, this frame');
        assert.deepEqual(indexed, [map]);
        assert.equal(A.ready(), true);
    } finally {
        Object.assign(R, { prepareRockColumns: saved.prepare, prepareNearRockChunks: saved.near, pieceIndex: saved.index });
        delete global.$gamePlayer;
        A._token = null; A._ready = true; A._index = null;
    }
});

test('a map that starts before its world is all laid has the rest laid at once on its first frame', () => {
    const R = load();
    const ctx = spritesetWorld(R);
    const set = new ctx.Spriteset_Map();
    const calls = [];
    let left = 1;
    const scene = Object.create(R.MapScene.prototype);
    Object.assign(scene, { _scene: {},
        addPieces(map, loader, later) { calls.push(['pieces', later]); },
        layQueuedPieces(budget) { calls.push(['lay', budget]); return --left <= 0; },
        addWater() { calls.push(['water']); this.followUp(() => calls.push(['land'])); } });
    set._reactor3d = { scene, arrival: { map: {}, load: () => null, stage: 0, models: () => calls.push(['models']) } };
    set.finishReactor3DArrival();
    assert.deepEqual(calls, [['pieces', true], ['lay', Infinity], ['water'], ['land'], ['models']], 'everything, in order, the models only asked for');
    assert.equal(set._reactor3d.arrival, null);
    assert.equal(R.Arrival.pacing, false);
    assert.equal(scene._followUps, null);
    assert.match(fs.readFileSync(path.join(runtimeRoot, 'reactor_sprites.js'), 'utf8'), /if \(state\.arrival && !state\.warming && !this\.isReactor3DArrivalTime\(\)\) this\.finishReactor3DArrival\(\);/, 'asked for by the first update of the map, not by one while it loads');
});
