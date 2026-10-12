// The rock engine: a low gap under a rock is rock, buried faces are not drawn, and a map's
// rocks are meshed a few chunks a frame, nearest the player first.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function load() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
}
const mapWith = (pieces, size = 20) => ({ width: size, height: size, reactor3d: { version: 1, elevation: new Array(size * size).fill(0), pieces } });

test('a rock whose foot stands lower than a character is solid down to the ground: nobody steps onto its top from beside it', () => {
    const R = load();
    const near = 0.27;
    for (const z of [0.5, 1, 1.5, 2, 2.5, 3]) {
        const map = mapWith([{ id: 1, kind: 'rock', x: 8, y: 8, z, rot: 0, material: 'Rock', size: [3, 8, 3], rough: 0.4 }]);
        const columns = R.rockColumns(map, R.piecesOf(map));
        const at = new Map(columns.map(c => [c.y * 65536 + c.x, c]));
        for (const c of columns) {
            assert.ok(c.z === 0 || c.z >= R.ROCK_HEADROOM, `z ${z}: a column starts at the ground or a character's height over it (${c.z})`);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = c.x + dx, ny = c.y + dy;
                if (at.has(ny * 65536 + nx)) continue;
                const ground = R.groundHeightAt(map, c.x + 0.5, c.y + 0.5, near);
                if (ground > near + 1 + R.TERRAIN_SLOPE_LIMIT) {
                    assert.equal(R.terrainBlocks(map, nx, ny, c.x, c.y, near), true, `z ${z}: (${c.x},${c.y}) reads ${ground.toFixed(2)} from beside it and must block`);
                }
            }
        }
    }
});

test('an arch high enough to walk under is walked under from below and stood on from its top', () => {
    const R = load();
    const map = mapWith([{ id: 1, kind: 'rock', x: 8, y: 8, z: 6, rot: 0, material: 'Rock', size: [3, 2, 3], rough: 0 }]);
    const c = R.rockColumns(map, R.piecesOf(map)).find(col => col.x === 9 && col.y === 9);
    assert.ok(c && c.z >= R.ROCK_HEADROOM, 'the arch starts above a character');
    assert.ok(R.groundHeightAt(map, 9.5, 9.5, 0) < 0.01, 'from the ground: under it');
    assert.ok(R.groundHeightAt(map, 9.5, 9.5, c.z - 1.5) < 0.01, 'from just under its foot: still under it, not lifted onto its top');
    assert.ok(R.groundHeightAt(map, 9.5, 9.5, c.top) > c.top - 0.01, 'from its top: on it');
});

const sunkRock = () => ({ id: 1, kind: 'rock', x: 8, y: 8, z: 0, rot: 0, material: 'Rock', size: [4, 5, 4], rough: 0.6, cap: 'Moss' });
const meshCount = (R, frames, box, floor) => {
    const out = { positions: [], uvs: [], colors: [], normals: [] };
    R.rockMesh(frames, box, () => out, floor);
    return out;
};

test('faces wholly under the ground are left out, and none that reaches above it', () => {
    const R = load();
    const map = mapWith([sunkRock()]);
    const frames = R.piecesOf(map).map(p => R.rockFrame(p, R.pieceBaseAt(map, p.x, p.y)));
    const box = { x0: 0, z0: 0, x1: 16, z1: 16 };
    const all = meshCount(R, frames, box, null), kept = meshCount(R, frames, box, R.rockGroundFloor(map));
    const tris = out => out.positions.length / 9;
    assert.ok(tris(kept) < tris(all) * 0.9, `buried faces dropped (${tris(kept)} of ${tris(all)})`);
    // Every face with a corner at or above the ground is still there: count them in both.
    const above = out => { let n = 0; for (let i = 0; i < out.positions.length; i += 9) if (Math.max(out.positions[i + 1], out.positions[i + 4], out.positions[i + 7]) >= -0.05) n++; return n; };
    assert.equal(above(kept), above(all), 'no face that shows is lost');
    for (let i = 0; i < kept.positions.length; i += 9) {
        assert.ok(Math.max(kept.positions[i + 1], kept.positions[i + 4], kept.positions[i + 7]) > -1.2, 'nothing kept deep in the ground');
    }
    // Off the map there is no ground to hide a face.
    assert.equal(R.rockGroundFloor(map)(-1, 8), -Infinity);
    assert.equal(R.rockGroundFloor(map)(0, 8), 0);
    // A cell's ground is its lowest corner: a pit keeps the faces over it.
    const pit = mapWith([sunkRock()]);
    pit.reactor3d.terrain = new Array(21 * 21).fill(0); pit.reactor3d.terrainWidth = 20;
    pit.reactor3d.terrain[10 * 21 + 12] = -3;
    assert.ok(R.rockGroundFloor(pit)(11, 9) <= -3 && R.rockGroundFloor(pit)(9, 9) === 0);
    assert.notEqual(R.rockGroundSignature(R.rockGroundFloor(pit), box), R.rockGroundSignature(R.rockGroundFloor(map), box), 'a terrain edit meshes the chunk again');
});

test('the background mesher is the same program: a chunk meshed there matches one meshed here', () => {
    const R = load();
    const vm = require('node:vm');
    const map = mapWith([sunkRock(), Object.assign(sunkRock(), { id: 2, x: 11, size: [3, 7, 3], cap: undefined, tint: '#c8b49a' })]);
    const frames = R.piecesOf(map).map(p => R.rockFrame(p, R.pieceBaseAt(map, p.x, p.y)));
    const box = { x0: 0, z0: 0, x1: 16, z1: 16 }, floor = R.rockGroundFloor(map);
    const here = R.rockChunkBuckets(frames, box, floor);
    let reply = null;
    const context = { self: { postMessage(data) { reply = data; } }, Math, Map, Float32Array, Float64Array, Array, Infinity, JSON };
    vm.runInNewContext(R.rockWorkerSource(), context);
    const g = { x0: -2, z0: -2, w: 20, h: 20, values: new Float64Array(400) };
    for (let z = 0; z < 20; z++) for (let x = 0; x < 20; x++) g.values[z * 20 + x] = floor(g.x0 + x, g.z0 + z);
    const sent = frames.map(f => { const pair = [R.rockLook(f, false), R.rockLook(f, true)]; return { piece: { cap: f.piece.cap || '' }, c: f.c, axes: f.axes, half: f.half, round: f.round, rough: f.rough, amp: f.amp, tint: f.tint, warp: f.warp, top: f.top, min: f.min, max: f.max, lookKeys: [pair[0].look, pair[1].look] }; });
    context.self.onmessage({ data: { id: 7, frames: sent, box, ground: g } });
    assert.equal(reply.id, 7);
    const byLook = new Map(reply.buckets.map(b => [b.look, b]));
    assert.equal(byLook.size, here.length, 'the same buckets');
    for (const b of here) {
        const look = b.cap ? '\u0003' + b.name : b.name;
        const there = byLook.get(look);
        assert.ok(there, 'bucket ' + look);
        assert.deepEqual(Array.from(there.positions), Array.from(b.positions), 'same faces in ' + look);
        assert.deepEqual(Array.from(there.colors), Array.from(b.colors));
    }
});

test('a map build lays the chunks round the player at once and the far ones as they come back, never into a later build', async () => {
    const R = load();
    const vm = require('node:vm');
    // A worker that runs the real program on the next turn.
    const made = [];
    global.Worker = class { constructor() { this.context = { self: { postMessage: data => setTimeout(() => this.onmessage({ data }), 0) }, Math, Map, Float32Array, Float64Array, Array, Infinity, JSON }; vm.runInNewContext(R.rockWorkerSource(), this.context); made.push(this); }
        postMessage(data) { setTimeout(() => this.context.self.onmessage({ data }), 0); } };
    global.Blob = class { constructor(parts) { this.parts = parts; } };
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:rocks';
    delete R._rockPool;
    try {
        const pieces = [];
        for (let i = 0; i < 6; i++) pieces.push(Object.assign(sunkRock(), { id: i + 1, x: 4 + i * 16, y: 4 }));
        const map = mapWith(pieces, 112);
        const scene = Object.create(R.MapScene.prototype);
        scene._scene = {}; scene._meshes = []; scene._pieceMeshes = []; scene._materials = [];
        const laid = [], byBuild = [];
        scene.addPieceChunkMesh = function(key) { laid.push(key); byBuild.push([this._rockGeneration, key]); return { userData: {} }; };
        scene.groundLoader = () => null;
        scene._rockWorkers = true;
        global.$gamePlayer = { _realX: 4, _realY: 4 };
        scene.addPieces(map, () => null);
        const near = new Set(laid);
        assert.ok(near.has(0) && !near.has(5 * 65536), 'the chunk round the player is laid before the map shows, the far one is not');
        assert.ok(made.length >= 1, 'workers made');
        for (let i = 0; i < 50 && scene._rockPending.size; i++) await new Promise(r => setTimeout(r, 5));
        assert.equal(scene._rockPending.size, 0, 'every far chunk came back');
        assert.ok(laid.includes(5 * 65536), 'and was laid');
        const farKeys = [2, 3, 4, 5].map(i => i * 65536);
        const oneBuild = new Map(farKeys.map(k => [k, laid.filter(x => x === k).length]));
        const idle = async () => { for (let i = 0; i < 100 && (R._rockPool.queue.length || R._rockPool.jobs.size); i++) await new Promise(r => setTimeout(r, 5)); await new Promise(r => setTimeout(r, 20)); };
        // A late chunk from a build that was replaced is not laid into the new one.
        laid.length = 0;
        scene._rockChunkCache = new Map();
        scene.addPieces(map, () => null);
        const firstGen = scene._rockGeneration;
        scene.addPieces(map, () => null);
        await idle();
        assert.ok(scene._rockGeneration === firstGen + 1);
        for (const k of farKeys) assert.equal(laid.filter(x => x === k).length, oneBuild.get(k), `far chunk ${k} is laid once, for the build that is showing; the replaced build's late one is dropped`);
    } finally {
        delete global.Worker; delete global.Blob; delete global.$gamePlayer; URL.createObjectURL = createObjectURL; delete R._rockPool;
    }
});
