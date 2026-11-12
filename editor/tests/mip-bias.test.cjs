'use strict';
// A picture drawn smaller than the screen reads its textures at the level the full-size picture would
// (runtime/reactor_3d.js, Reactor3D.MipBias, runtime 20261110.3): a bias on the colour lookups while the view
// draws, none at full size and none for any other renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
const T = global.THREE, M = R.MipBias;
const read = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');

test('no bias at full size; below it, the scale\'s log times the strength', () => {
    assert.equal(M.forScale(1), 0);
    assert.equal(M.forScale(1.5), 0);
    assert.ok(Math.abs(M.forScale(0.5) - (-1 * M.STRENGTH)) < 1e-9);
    assert.ok(M.forScale(0.375) < M.forScale(0.5) && M.forScale(0.5) < M.forScale(0.75) && M.forScale(0.75) < 0);
    M.enabled = false;
    try { assert.equal(M.forScale(0.5), 0); } finally { M.enabled = true; }
});

test('the bias stands only while the view draws, whatever the draw does', () => {
    let seen = null;
    M.during(0.5, () => { seen = M.uniform.value; });
    assert.ok(seen < 0);
    assert.equal(M.uniform.value, 0);
    assert.throws(() => M.during(0.5, () => { throw new Error('draw failed'); }), /draw failed/);
    assert.equal(M.uniform.value, 0, 'none left behind for the editor\'s previews');
});

test('three\'s own picture lookup takes it, declared once, and installing twice changes nothing more', () => {
    M.install();
    const chunk = T.ShaderChunk;
    assert.equal(M.failed, false);
    assert.match(chunk.map_fragment, /texture2D\( map, vMapUv, rrMipBias \)/);
    assert.equal(chunk.map_pars_fragment.split('uniform float rrMipBias;').length, 2);
    assert.match(chunk.map_pars_fragment, /#ifndef RR_MIP_BIAS\n#define RR_MIP_BIAS/);
    const before = chunk.map_pars_fragment;
    M.install();
    assert.equal(chunk.map_pars_fragment, before);
});

test('a lit material carries the shared value; the engine\'s own lookups read it', () => {
    const material = R.litMaterial(new T.MeshBasicMaterial({ map: new T.Texture() }));
    const shader = { uniforms: {}, vertexShader: T.ShaderLib.basic.vertexShader, fragmentShader: T.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(shader, { getContext() { return null; }, capabilities: {} });
    assert.equal(shader.uniforms.rrMipBias, M.uniform);
    const core = read('reactor_3d.js');
    assert.match(core, /texture2D\( map, clamp\( vMapUv, vUvBounds\.xy, vUvBounds\.zw \), rrMipBias \)/, 'tiles from an atlas');
    assert.match(core, /texture2D\(map, vMapUv, rrMipBias\)/, 'the ground');
    assert.match(core, /rrGB = rrGS \* exp2\(rrMipBias\)/, 'the ground\'s sides, by their gradients');
    assert.match(read('reactor_3d_world.js'), /texture2D\(map, vRRTriPos\.zy \* rrTriScale, rrMipBias\)/, 'triplanar pieces');
    const models = read('reactor_3d_models.js');
    assert.match(models, /float bias = exp2\(rrMipBias\);/, 'a built character\'s layered pictures');
    assert.match(models, /"#ifndef RR_MIP_BIAS",\s*"#define RR_MIP_BIAS",\s*"uniform float rrMipBias;",\s*"#endif",/);
});

test('the view draws with its scale\'s bias', () => {
    // `MipBias.during` written out in the view's render (no function made per pass): the same bias, and none after.
    assert.match(read('reactor_3d.js'), /bias\.uniform\.value = bias\.forScale\(this\._scale\);\s*try \{\s*return this\.upscaled\(\)[\s\S]{0,200}?\} finally \{ bias\.uniform\.value = 0; \}/);
    const seen = [];
    const view = scale => ({
        _scene: {}, _camera: {}, _shared: true, _scale: scale, _trackFrame() {}, _target: slot => slot,
        upscaled: () => false,
        renderInto() { seen.push(M.uniform.value); if (this.fails) throw new Error('draw failed'); return false; }
    });
    R.Viewport.prototype.render.call(view(0.5));
    assert.equal(seen[0], M.forScale(0.5));
    assert.ok(seen[0] < 0);
    assert.equal(M.uniform.value, 0);
    R.Viewport.prototype.render.call(view(1));
    assert.equal(seen[1], 0, 'none at full size');
    assert.throws(() => R.Viewport.prototype.render.call(Object.assign(view(0.5), { fails: true })), /draw failed/);
    assert.equal(M.uniform.value, 0, 'none left behind when the draw throws');
});
