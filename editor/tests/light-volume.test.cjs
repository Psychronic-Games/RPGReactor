'use strict';
// Still lights are baked into a 3D volume and read back; moving ones stay live.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
const V = Reactor3D.LightVolume;

const light = (id, extra = {}) => ({ id, type: Reactor3D.LIGHT_POINT, x: 3, y: 4, height: 2, radius: 5, intensity: 1, colour: 0xffffff, ...extra });
function fresh() { V._records.clear(); V._frame = 0; V._front = V._back = null; }
function run(frames, lights, seen = lights) {
    const u = Reactor3D.lightUniforms();
    for (let f = 0; f < frames; f++) {
        const pairs = []; seen.forEach((l, i) => { pairs.push(l, i); u.rrLightColor.value.set([1, 1, 1, 0], i * 4); });
        V.observe(lights, pairs, { x: 0, y: 0, groundY: 0 });
    }
}

test('a light is cached once it and its shadow row have held for STABLE_FRAMES; flicker is not a change', () => {
    fresh();
    const saved = Reactor3D.Shadows._tiles; Reactor3D.Shadows._tiles = []; Reactor3D.Shadows._dynTiles = [];
    try {
        const still = light('still'), flame = light('flame', { intensity: 0.8, priorityIntensity: 1 }), carried = light('carried', { carrier: {}, x: 9 });
        run(V.STABLE_FRAMES - 1, [still, flame, carried]);
        V.desired(); // shadow state is first seen here
        run(V.STABLE_FRAMES + 1, [still, flame, carried]);
        const want = V.desired();
        assert.deepEqual(want.statics.map(r => r.id), ['carried', 'still'], 'a carried light that holds still is cached');
        assert.deepEqual(want.flickers.map(r => r.id), ['flame'], 'a flickering light goes to a channel, its brightness applied live');
        assert.equal(V._records.get('flame').flicker, 0.8);
        assert.ok(V._records.has('carried'), 'a carried light is watched like any other');
        still.x = 4; run(1, [still, flame]);
        assert.deepEqual(V.desired().statics.map(r => r.id), [], 'a moved light starts over');
        assert.equal(V._records.has('carried'), false, 'lights gone from the map are forgotten');
    } finally { Reactor3D.Shadows._tiles = saved; }
});

test('a light with a moving-caster shadow row stays live; a static row that re-renders resets it', () => {
    fresh();
    const S = Reactor3D.Shadows, tiles = S._tiles, dyn = S._dynTiles;
    try {
        S._tiles = [{ id: 'lamp', valid: true, stamp: 1, key: 'k' }]; S._dynTiles = [];
        assert.equal(V.shadowKey('lamp'), 'row0:1:k');
        S._dynTiles = [{ id: 'lamp', valid: true }];
        assert.equal(V.shadowKey('lamp'), null, 'the party\'s shadows stay sharp and live');
        S._dynTiles = [];
        assert.equal(V.shadowKey('other'), 'none');
    } finally { S._tiles = tiles; S._dynTiles = dyn; }
});

test('the light loop reads the volume, drops the cached lights, and turns its lookup toward the eye', () => {
    const glsl = Reactor3D.LightGrid.glsl(Reactor3D.lightGlsl(true, 1));
    assert.match(glsl, /uniform highp sampler3D rrVolumeStatic;/);
    assert.match(glsl, /vec3 rrVN = cross\(dFdx\(p\), dFdy\(p\)\);/, 'derivatives before any branch');
    assert.match(glsl, /if \(dot\(rrVNn, cameraPosition - p\) < 0\.0\) rrVNn = -rrVNn;/);
    assert.match(glsl, /if \(grid\) mask &= ~rrLightCached; else \{ grid = true; mask = rrLightAll & ~rrLightCached; \}/);
    assert.ok(glsl.indexOf('rrVolumeOn != 0') < glsl.indexOf('for (int j = 0'), 'before the loop');
});

test('the bake evaluates each cached light with the light loop\'s own code, shadowed or not', () => {
    for (const shadows of [true, false]) {
        const bake = V.bakeMaterial(shadows);
        assert.ok(bake, 'shadows ' + shadows);
        const fs = bake.material.fragmentShader;
        assert.match(fs, /float rrBakeScalar\(int i, vec3 p\)/);
        assert.match(fs, /vec4 lp = rrBakePos\[i\];/);
        assert.equal(/rrShadowAt/.test(fs), shadows);
        assert.equal(/rrLightPos\[/.test(fs), false, 'only its own arrays: cached lights need not be in view');
    }
});

test('a volume whose lights have changed sits out; battle and preview packing switch it off', () => {
    fresh();
    const u = V.uniforms();
    V._supported = true; V._scene = 'map'; V._generation = Reactor3D.contextGeneration; u.rrLightCount.value = 1;
    V._records.set('a', { id: 'a', key: 'k2', shadow: 'none', present: V._frame, index: 0, flicker: 1 });
    V._front = { signature: 'x', want: { statics: [{ id: 'a', key: 'k1', shadow: 'none', packed: { col: [1, 1, 1, 0] } }], flickers: [] }, region: { origin: [0, 0, 0], dims: [2, 2, 2] }, static: { texture: {} }, flicker: { texture: {} } };
    const realDesired = V.desired; V.desired = () => ({ statics: [], flickers: [], signature: '' }); V.dynamicEnabled = false;
    try {
        V.frame({}, 'map', { width: 4, height: 4 });
        assert.equal(u.rrVolumeOn.value, 0, 'changed since baked: every light live');
        V._records.get('a').key = 'k1';
        V.frame({}, 'map', { width: 4, height: 4 });
        assert.equal(u.rrVolumeOn.value, 1);
        assert.equal(u.rrLightCached.value, 1);
        Reactor3D.packLightUniforms([], null);
        assert.equal(u.rrVolumeOn.value, 0, 'a battle room or preview packs its own lights');
    } finally { V.desired = realDesired; V.dynamicEnabled = true; V._supported = undefined; V._front = null; V._scene = null; }
});

test('a pulsing point light is baked as its distance; its breathing radius is applied per pixel, the loop\'s own falloff', () => {
    fresh();
    const saved = Reactor3D.Shadows._tiles; Reactor3D.Shadows._tiles = []; Reactor3D.Shadows._dynTiles = [];
    try {
        const alarm = light('alarm', { baseRadius: 5, radius: 4.2 });
        run(V.STABLE_FRAMES + 2, [alarm]);
        V.desired(); run(V.STABLE_FRAMES + 2, [alarm]);
        alarm.radius = 5.6; run(1, [alarm]);
        const want = V.desired();
        assert.deepEqual(want.pulses.map(r => r.id), ['alarm'], 'the radius breathing is not a change');
        assert.equal(V._records.get('alarm').radius, 5.6, 'this frame\'s radius goes to the pixel');
        const glsl = Reactor3D.LightGrid.glsl(Reactor3D.lightGlsl(true, 1));
        assert.match(glsl, /float rrPF = max\(0\.0, 1\.0 - rrVP\[0\] \/ max\(rrVolumePulseRadius\[0\], 0\.001\)\); sum \+= rrVolumePulseColor\[0\] \* rrPF \* rrPF;/);
        assert.match(V.bakeMaterial(false).material.fragmentShader, /d\[0\] = length\(p - rrBakePos\[rrBakePulse\[0\]\]\.xyz\);/);
    } finally { Reactor3D.Shadows._tiles = saved; }
});

test('moving lights are baked into one atlas in one draw, on a coarser grid, only when they moved; beams, shadow-row and small lights stay in the loop', () => {
    fresh();
    const u = V.uniforms(), renders = [];
    V._supported = true; V._scene = 'map';
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render: (scene) => renders.push(scene), autoClear: true,
        compileAsync: null, extensions: { has: () => false } };
    const saved = { count: u.rrLightCount.value, pos: Float32Array.from(u.rrLightPos.value), shadow: Float32Array.from(u.rrLightShadow.value), info: Float32Array.from(u.rrShadowInfo.value) };
    try {
        u.rrLightCount.value = 6; u.rrLightCached.value = 1;           // light 0 cached
        // 1 spot, 2 beam, 3 point, 4 spot, 5 point
        u.rrLightColor.value.set([1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0], 4);
        for (let i = 0; i < 6; i++) u.rrLightPos.value.set([5, 2, 5, 12], i * 4);
        u.rrLightPos.value[5 * 4 + 3] = 1.5;                           // light 5: a few voxels across
        u.rrLightShadow.value.fill(-1);
        u.rrLightShadow.value[3] = 0; u.rrShadowInfo.value[2] = 0;     // light 3 holds a moving-caster row
        u.rrLightShadow.value[4] = 1; u.rrShadowInfo.value[6] = -1;    // light 4 a still shadow row
        V.frameDynamic(renderer, { width: 10, height: 10 }, { x: 5, y: 5, groundY: 0 });
        assert.equal(renders.length, 1, 'one draw for the whole volume');
        assert.equal(u.rrDynOn.value, 1);
        assert.equal(u.rrLightDynamic.value, 0b000010, 'only the plain spot; the beam, both shadow rows and the small point stay per pixel');
        assert.equal(u.rrDynVoxel.value, V.DYNAMIC_VOXEL, 'on its own grid');
        V.frameDynamic(renderer, { width: 10, height: 10 }, { x: 5, y: 5, groundY: 0 });
        assert.equal(renders.length, 1, 'nothing moved: the atlas holds it');
        assert.equal(u.rrDynOn.value, 1);
        u.rrLightPos.value[1 * 4] = 6;
        V.frameDynamic(renderer, { width: 10, height: 10 }, { x: 5, y: 5, groundY: 0 });
        assert.equal(renders.length, 2, 'a light moved: baked again');
        V.dynamicShadowRows = true;
        V.frameDynamic(renderer, { width: 10, height: 10 }, { x: 5, y: 5, groundY: 0 });
        assert.equal(u.rrLightDynamic.value, 0b010010, 'a still shadow row may be baked when asked');
        V.dynamicShadowRows = false;
        V.dynamicEnabled = false; V.frameDynamic(renderer, { width: 10, height: 10 }, {});
        assert.equal(u.rrDynOn.value, 0, 'the kill switch');
    } finally {
        V.dynamicEnabled = true; V.dynamicShadowRows = false; u.rrLightCount.value = saved.count; u.rrLightPos.value.set(saved.pos);
        u.rrLightShadow.value.set(saved.shadow); u.rrShadowInfo.value.set(saved.info);
        u.rrLightCached.value = 0; V._supported = undefined; V._scene = null; V._dynSig = null; if (V._dynAtlas) { V._dynAtlas.dispose(); V._dynAtlas = null; }
    }
});
