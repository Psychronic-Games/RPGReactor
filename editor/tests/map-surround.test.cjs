'use strict';
// The land past a map's border (`surround` in the 3D sidecar): reactor_3d_surround.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const R = require(path.join(root, 'runtime/reactor_3d.js'));

function hillMap(W = 40, H = 30, surround = { style: 'continue' }) {
    const terrain = [];
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) terrain.push(Math.round((Math.sin(x * 0.4) * 3 + Math.cos(y * 0.3) * 4 + 6) * 100) / 100);
    return { width: W, height: H, note: '', reactor3d: { terrain, terrainWidth: W, surround } };
}
const build = (map, options = {}) => R.surroundGeometry(map, R.surroundOf(map), Object.assign({ floorY: -0.012 }, options));

test('the surround extension is registered wherever the runtime files are listed', () => {
    assert.ok(read('runtime/reactor_main.js').includes('"js/reactor_3d_surround.js"'));
    assert.ok(R.EXTENSIONS.some(e => e.file === 'reactor_3d_surround.js' && e.namespace === 'Surround'));
    assert.ok(R.Surround);
    for (const file of ['editor/build-scripts/build.js', 'editor/build-scripts/build-worker.js', 'editor/build-scripts/dist-editor-worker.js']) {
        assert.ok(read(file).includes("'reactor_3d_surround.js'"), file);
    }
});

test('a map without surroundings has none, and a stored one is read back as written', () => {
    assert.equal(R.surroundOf({ width: 4, height: 4, reactor3d: {} }), null);
    assert.equal(R.surroundOf({ width: 4, height: 4 }), null);
    assert.equal(R.normalizeSurround({ style: 'none' }), null);
    assert.equal(R.normalizeSurround({ style: 'nonsense' }), null);
    const s = R.normalizeSurround({ style: 'ocean', distance: 120, rough: 0.8, seed: 7, level: -2.5, edges: { north: 'mountains', south: 'ocean', west: 'void', east: 'bogus' } });
    assert.equal(s.style, 'ocean');
    assert.deepEqual(s.edges, { north: 'mountains' }, 'a side that says the map\'s own style, a void or nonsense is dropped');
    assert.equal(s.distance, 120); assert.equal(s.rough, 0.8); assert.equal(s.seed, 7); assert.equal(s.level, -2.5);
    assert.deepEqual(R.normalizeSurround(JSON.parse(JSON.stringify(s))), s, 'round trip');
    const none = R.normalizeSurround({ style: 'none', edges: { south: 'ocean' } });
    assert.equal(none.style, 'none'); assert.deepEqual(none.edges, { south: 'ocean' });
    assert.equal(R.normalizeSurround({ style: 'continue', distance: 5 }).distance, R.SURROUND_DISTANCE.min);
    assert.deepEqual(R.normalizeSurround({ style: 'void', edges: { north: 'ocean' } }).edges, {}, 'a floating island has no sides');
});

test('at the border the surroundings stand exactly where the floor does', () => {
    for (const style of ['continue', 'ocean', 'mountains', 'plateau']) {
        const map = hillMap(40, 30, { style });
        const { ground, info } = build(map);
        assert.ok(info.triangles > 500, style);
        let onBorder = 0;
        for (let i = 0; i < ground.positions.length; i += 3) {
            const x = ground.positions[i], y = ground.positions[i + 1], z = ground.positions[i + 2];
            assert.ok(Number.isFinite(x + y + z));
            const inside = x > 1e-6 && x < 40 - 1e-6 && z > 1e-6 && z < 30 - 1e-6;
            assert.ok(!inside, 'nothing is laid over the map');
            if (x >= 0 && x <= 40 && z >= 0 && z <= 30) {
                onBorder++;
                assert.ok(Math.abs(y - (-0.012 + R.terrainHeightAt(map, x, z))) < 1e-4, `${style}: border vertex at ${x},${z} is at the floor's height`);
                assert.ok(Math.abs(ground.positions[i] / 40 - ground.uvs[(i / 3) * 2]) < 1e-6, 'the floor image carries on at its own scale');
            }
        }
        // Every tile corner of the border, and the fans standing on the four corners.
        assert.equal(onBorder, 2 * (41 + 31) + 4 * (R.SURROUND_FAN - 1), style);
        for (let i = 0; i < ground.normals.length; i += 3) assert.ok(ground.normals[i + 1] > 0, 'the land faces up');
        assert.ok(ground.index.every(v => v < ground.positions.length / 3));
    }
});

test('the land reaches the asked distance, less on weak graphics, in cells that grow', () => {
    const far = (map, options) => { const g = build(map, options).ground.positions; let r = 0; for (let i = 0; i < g.length; i += 3) r = Math.max(r, -g[i + 2]); return r; };
    assert.equal(Math.round(far(hillMap())), R.SURROUND_DISTANCE.full);
    assert.equal(Math.round(far(hillMap(), { weak: true })), R.SURROUND_DISTANCE.weak);
    assert.equal(Math.round(far(hillMap(40, 30, { style: 'continue', distance: 60 }))), 60);
    const big = build(hillMap(200, 200));
    assert.ok(big.info.triangles < 12000, `a 200 x 200 map's surroundings are ${big.info.triangles} triangles`);
    const rings = R.surroundRings(160);
    assert.equal(rings[0].d, 0); assert.equal(rings[rings.length - 1].d, 160);
    for (let k = 1; k < rings.length; k++) assert.ok(rings[k].step >= rings[k - 1].step && rings[k].d > rings[k - 1].d);
});

test('the far land fades and the near land does not', () => {
    const { ground, info } = build(hillMap());
    assert.ok(ground.hazeIndex.length > 0 && ground.hazeIndex.length < ground.index.length);
    for (let i = 0; i < ground.fade.length; i++) {
        const x = ground.positions[i * 3], z = ground.positions[i * 3 + 2];
        const out = Math.hypot(Math.max(-x, x - 40, 0), Math.max(-z, z - 30, 0));
        if (out < info.distance * 0.4) assert.equal(ground.fade[i], 0);
    }
    assert.ok(Math.max(...ground.fade) > 0.9);
    assert.equal(build(hillMap(40, 30, { style: 'continue', haze: 0 })).ground.hazeIndex.length, 0);
});

test('an ocean lies under the lowest border ground unless a level is given, and its water runs to the rim', () => {
    const map = hillMap(40, 30, { style: 'ocean' });
    const { ground, water, info } = build(map);
    let low = Infinity;
    for (let x = 0; x <= 40; x++) low = Math.min(low, R.terrainHeightAt(map, x, 0), R.terrainHeightAt(map, x, 30));
    for (let y = 0; y <= 30; y++) low = Math.min(low, R.terrainHeightAt(map, 0, y), R.terrainHeightAt(map, 40, y));
    assert.ok(Math.abs(info.sea - (low - 0.012 - 1)) < 1e-3);
    assert.ok(water && water.index.length > 0);
    for (let i = 1; i < water.positions.length; i += 3) assert.ok(Math.abs(water.positions[i] - info.sea) < 1e-4);
    assert.ok(water.depth.some(d => d > 2), 'the bed falls away under it');
    // Far out the land is under the sea.
    let farAbove = 0;
    for (let i = 0; i < ground.positions.length; i += 3) if (-ground.positions[i + 2] > 120 && ground.positions[i + 1] > info.sea) farAbove++;
    assert.equal(farAbove, 0);
    assert.equal(build(hillMap(40, 30, { style: 'ocean', level: -9 })).info.sea, -9);
    assert.equal(build(hillMap(40, 30, { style: 'continue' })).water, null, 'dry land has no water');
});

test('a side can differ, and a side with nothing past it is left open', () => {
    const map = hillMap(40, 30, { style: 'continue', edges: { south: 'ocean', west: 'none' } });
    const { ground, water } = build(map);
    assert.ok(water, 'the south is sea');
    for (let i = 0; i < water.positions.length; i += 3) assert.ok(water.positions[i + 2] >= 0, 'no water north of the map');
    let west = 0;
    for (let i = 0; i < ground.positions.length; i += 3) if (ground.positions[i] < -1 && ground.positions[i + 2] > 4 && ground.positions[i + 2] < 26) west++;
    assert.equal(west, 0, 'nothing is laid straight out from the west side');
    // No triangle bridges the gap.
    for (let t = 0; t < ground.index.length; t += 3) {
        const zs = [0, 1, 2].map(k => ground.positions[ground.index[t + k] * 3 + 2]), xs = [0, 1, 2].map(k => ground.positions[ground.index[t + k] * 3]);
        if (Math.max(...xs) <= 0.001) assert.ok(Math.max(...zs) - Math.min(...zs) < 26 || Math.min(...xs) < -1, 'no span across the open side');
    }
    const only = build(hillMap(40, 30, { style: 'none', edges: { north: 'mountains' } }));
    assert.ok(only.ground.index.length > 0);
    for (let i = 0; i < only.ground.positions.length; i += 3) assert.ok(only.ground.positions[i + 2] <= 0.001 || Math.abs(only.ground.positions[i + 2]) < 1e-3 || only.ground.positions[i + 2] <= 30, 'only the north');
});

test('a lake at the border is banked and its water carried to the bank', () => {
    const W = 20, H = 12, terrain = new Array((W + 1) * (H + 1)).fill(0);
    // A hollow against the north border, three tiles deep.
    for (let y = 0; y <= 3; y++) for (let x = 6; x <= 12; x++) terrain[y * (W + 1) + x] = -3;
    const map = { width: W, height: H, note: '', reactor3d: { terrain, terrainWidth: W, surround: { style: 'continue', rough: 0 },
        water: [{ x0: 6, y0: 0, x1: 11, y1: 2, level: -1, material: 'Water' }] } };
    assert.equal(R.waterLevelAt(map, 8, 0), -1);
    const { ground, water } = build(map);
    assert.ok(water, 'the lake goes on past the border');
    for (let i = 0; i < water.positions.length; i += 3) assert.equal(water.positions[i + 1], -1);
    // Past the lake the land is over its level by six tiles out.
    let checked = 0;
    for (let i = 0; i < ground.positions.length; i += 3) {
        const x = ground.positions[i], y = ground.positions[i + 1], z = ground.positions[i + 2];
        if (x > 7 && x < 11 && z < -5 && z > -9) { checked++; assert.ok(y > -1 + 0.5, `the bank at ${x},${z} stands at ${y}`); }
    }
    assert.ok(checked > 0);
});

test('a floating island gets an underside that closes under the map', () => {
    const map = hillMap(40, 30, { style: 'void', drop: 30 });
    const { ground, water, info } = build(map);
    assert.equal(water, null); assert.equal(info.style, 'void');
    let low = Infinity, lowX = 0, lowZ = 0, top = -Infinity;
    for (let i = 0; i < ground.positions.length; i += 3) {
        assert.ok(ground.positions[i] >= -1e-3 && ground.positions[i] <= 40.001 && ground.positions[i + 2] >= -1e-3 && ground.positions[i + 2] <= 30.001, 'it stays under the map');
        top = Math.max(top, ground.positions[i + 1]);
        if (ground.positions[i + 1] < low) { low = ground.positions[i + 1]; lowX = ground.positions[i]; lowZ = ground.positions[i + 2]; }
    }
    assert.ok(top - low >= 30);
    assert.ok(Math.abs(lowX - 20) < 1 && Math.abs(lowZ - 15) < 1, 'its lowest point is under the middle');
    assert.ok(ground.index.length > 300);
    assert.equal(ground.hazeIndex.length, 0);
});

test('the same seed gives the same land; another seed gives other hills', () => {
    const a = build(hillMap(40, 30, { style: 'continue', seed: 3 })).ground.positions;
    const b = build(hillMap(40, 30, { style: 'continue', seed: 3 })).ground.positions;
    const c = build(hillMap(40, 30, { style: 'continue', seed: 4 })).ground.positions;
    assert.deepEqual(Array.from(a), Array.from(b));
    assert.notDeepEqual(Array.from(a), Array.from(c));
});
