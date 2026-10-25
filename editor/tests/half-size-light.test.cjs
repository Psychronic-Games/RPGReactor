'use strict';
// The light and the lights' haze are worked out smaller than the picture:
// the surfaces whose colour is their picture times the light draw unlit,
// the light is taken from their depth at a quarter size and multiplied in,
// and everything else draws lit as before. Characters cast their outline.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_lighting.js'));
// The split as an integrated GPU draws it (a discrete one lights per pixel: HalfLight.WEAK_ONLY).
Reactor3D.HalfLight.WEAK_ONLY = false;
const HL = Reactor3D.HalfLight, HH = Reactor3D.HalfHaze;

const lit = options => Reactor3D.litMaterial(new THREE.MeshBasicMaterial(options));

test('only a surface whose colour is its picture times the light takes the light afterwards', () => {
    assert.equal(HL.deferrable(lit({})), true, 'a lit, opaque surface');
    assert.equal(HL.deferrable(new THREE.MeshBasicMaterial()), false, 'unlit');
    const glow = lit({}); glow.__reactorSelfLit = true;
    assert.equal(HL.deferrable(glow), false, 'self-lit');
    assert.equal(HL.deferrable(lit({ transparent: true, depthWrite: false })), false, 'translucent without depth');
    assert.equal(HL.deferrable(lit({ transparent: true, depthWrite: true, alphaTest: 0.01 })), true, 'a room picture writes depth');
    const shiny = lit({}); shiny.userData.rrShine = { vector: new THREE.Vector4(0.5, 0, 0, 0), tint: new THREE.Color() };
    assert.equal(HL.deferrable(shiny), false, 'a reflective finish adds after the light');
    const flashing = lit({}); flashing.userData.rrBlend = { value: { x: 1, y: 0, z: 0, w: 0.5 } };
    assert.equal(HL.deferrable(flashing), false, 'a flash is laid over the lit colour');
    assert.equal(HL.deferrable(lit({ blending: THREE.AdditiveBlending })), false, 'added, not laid');
});

test('the unlit twin is the same material without the light: its own program, everything else shared', () => {
    const material = lit({ color: 0x336699 });
    const twin = HL.twin(material);
    assert.equal(HL.twin(material), twin, 'made once');
    assert.notEqual(twin.id, material.id);
    assert.notEqual(twin.uuid, material.uuid);
    assert.equal(twin.color, material.color, 'the colour is the original\'s');
    material.map = new THREE.Texture();
    assert.equal(twin.map, material.map, 'and follows it');
    material.needsUpdate = true;
    assert.equal(twin.version, material.version, 'recompiled with it');
    assert.match(twin.customProgramCacheKey(), /\|unlit$/);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    twin.onBeforeCompile(shader, { });
    assert.doesNotMatch(shader.fragmentShader, /diffuseColor\.rgb \*= mix\(rrLight/, 'no light term');
    const full = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(full, { });
    assert.match(full.fragmentShader, /diffuseColor\.rgb \*= mix\(rrLight/, 'the original keeps it');
});

test('the split draws the lit surfaces unlit and hides the rest, then puts every material back', () => {
    const scene = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(), lit({}));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(), lit({ transparent: true, depthWrite: false }));
    const mixed = new THREE.Mesh(new THREE.PlaneGeometry(), [lit({}), new THREE.MeshBasicMaterial()]);
    scene.add(floor, glass, mixed);
    const target = { depthTexture: new THREE.DepthTexture(4, 4), width: 4, height: 4, samples: 0 };
    const saved = Reactor3D.LightVolume.supported;
    Reactor3D.LightVolume.supported = () => true;
    try {
        const originals = [floor.material, glass.material, mixed.material];
        const split = HL.begin({}, scene, target);
        assert.ok(split);
        assert.equal(floor.material, HL.twin(originals[0]), 'drawn unlit');
        assert.equal(glass.material, originals[1]);
        assert.equal(glass.material.visible, false, 'the rest waits for the second draw');
        assert.equal(mixed.material[0], HL.twin(originals[2][0]));
        assert.equal(mixed.material[1].visible, false);
        assert.equal(split.albedo.depthTexture, target.depthTexture, 'unlit into a target sharing the pass\'s depth');
        HL.restore(split);
        assert.equal(floor.material, originals[0]);
        assert.equal(mixed.material, originals[2]);
        assert.equal(glass.material.visible, true);
        assert.equal(originals[0].visible, true);
        const water = new THREE.Scene(); water.userData.rrWater = [{}]; water.add(new THREE.Mesh(new THREE.PlaneGeometry(), lit({})));
        const wet = HL.begin({}, water, target);
        assert.ok(wet, 'a map with water splits too: the combine lays its tint on');
        HL.restore(wet);
        assert.equal(HL.begin({}, scene, { width: 4, height: 4, samples: 0 }), null, 'no readable depth, no split');
    } finally { Reactor3D.LightVolume.supported = saved; }
});

test('the unlit target is remade with the pass, and never disposes the pass\'s depth', () => {
    const depth = new THREE.DepthTexture(8, 8);
    let disposed = 0;
    depth.addEventListener('dispose', () => disposed++);
    const a = HL.albedoFor({ width: 8, height: 8, depthTexture: depth });
    assert.equal(HL.albedoFor({ width: 8, height: 8, depthTexture: depth }), a);
    const b = HL.albedoFor({ width: 16, height: 8, depthTexture: depth });
    assert.notEqual(a, b);
    assert.equal(disposed, 0);
});

test('the light pass reads the face a point lies on from the full-size depth, not the small grid\'s derivatives', () => {
    const pass = HL.program({ });
    const source = pass.material.fragmentShader;
    assert.match(source, /vec3 rrVN = rrPassNormal;/);
    assert.doesNotMatch(source, /cross\(dFdx\(p\), dFdy\(p\)\)/);
    assert.match(HL.combineQuad().material.fragmentShader, /rrToSrgb\(clamp\(rrToLinear\(s\.rgb\) \* l, 0\.0, 1\.0\)\)/, 'back to linear, lit, encoded again');
});

test('the haze leaves the pass for a smaller target and tests the pass\'s depth there', () => {
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group); scene.userData.rrLightBodies = group;
    const cone = new THREE.Mesh(new THREE.BufferGeometry(), Reactor3D.lightBodyMaterial());
    const core = new THREE.Sprite(new THREE.SpriteMaterial());
    group.add(cone, core);
    const target = { depthTexture: new THREE.DepthTexture(4, 4) };
    const camera = new THREE.PerspectiveCamera();
    const list = HH.take(scene, target, camera);
    assert.deepEqual(list, [cone]);
    assert.equal(cone.visible, false, 'out of the pass');
    assert.equal(core.visible, true, 'the bright core stays sharp');
    HH.restore(list);
    assert.equal(cone.visible, true);
    assert.match(cone.material.fragmentShader, /if \(rrHazeDepthOn != 0 && 1\.0 \/ gl_FragCoord\.w > dot\(texture2D\(rrHazeDepth/, 'its distance against the pass\'s');
    assert.match(HL.program({}).material.fragmentShader, /-\(rrLightView \* vec4\(p, 1\.0\)\)\.z\);/, 'which the light pass keeps in its alpha');
    assert.equal(Reactor3D.beamBodyMaterial().userData.rrHaze, true);
    for (const name of ['rrHazeDepth', 'rrHazeDepthScale', 'rrHazeDepthPick', 'rrHazeDepthOn']) assert.equal(cone.material.uniforms[name], HH.uniforms()[name], 'shares ' + name);
    assert.equal(HH.take(scene, {}, camera), null, 'no readable depth: drawn with the pass');
    assert.equal(HH.take(scene, target, new THREE.OrthographicCamera()), null, 'its distance test needs a perspective camera');
});

test('characters cast their outline: counted at their coarsest level and admitted before props', () => {
    const S = Reactor3D.Shadows, D = Reactor3D.GeometryDetail;
    const makeRoot = (tris, skinned, x) => {
        const root = new THREE.Group();
        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(tris * 3), 1));
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
        const mesh = skinned ? Object.assign(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()), { isSkinnedMesh: true }) : new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        root.add(mesh); root.position.set(x, 0, 0); root.updateMatrixWorld(true);
        const parent = new THREE.Group(); parent.add(root);
        return { root, mesh, geometry };
    };
    const leader = makeRoot(150000, true, 0), follower = makeRoot(150000, true, 3), prop = makeRoot(190000, false, 1);
    const coarse = new THREE.BufferGeometry(); coarse.setIndex(new THREE.BufferAttribute(new Uint32Array(8000 * 3), 1));
    const saved = { states: D._states, dynamic: S._dynamic, casting: S._casting, candidates: S._candidates, quality: S._quality, fresh: D.fresh };
    // Levels only ever exist where the simplifier's worker could run.
    const hadWorker = 'Worker' in global;
    if (!hadWorker) global.Worker = function() {};
    try {
        D._states = new WeakMap();
        for (const c of [leader, follower]) D._states.set(c.geometry, { levels: [{ geometry: coarse, error: 0.01 }] });
        D.fresh = () => true;
        S._quality = { dynamicTriangles: 200000, size: 256 };
        S._dynamic = new Set([prop.root, leader.root, follower.root]);
        S._casting = new Set(); S._candidates = [];
        S._setCasts = function(root, on) { root.userData.rrShadowCasts = on; };
        const decided = S._budgetDynamic({ x: 1, y: 0, z: 0 });
        assert.equal(S._casterTriangles(leader.root), 8000, 'the outline, not the full body');
        assert.ok(S._casting.has(leader.root) && S._casting.has(follower.root), 'the whole party casts');
        assert.ok(!S._casting.has(prop.root), 'the prop, nearer but over the budget after them, waits');
        assert.equal(decided.casters, 2);
    } finally {
        D._states = saved.states; D.fresh = saved.fresh; S._dynamic = saved.dynamic; S._casting = saved.casting; S._candidates = saved.candidates; S._quality = saved.quality;
        delete S._setCasts;
        if (!hadWorker) delete global.Worker;
    }
});

test('a pass drawn below full size is enlarged by a sharpening filter into a full-size target PIXI shows as it is', () => {
    const SU = Reactor3D.SharpUpscale;
    const viewport = Object.create(Reactor3D.Viewport.prototype);
    viewport._width = 800; viewport._height = 600; viewport._scale = 0.75;
    viewport.passPixelRatio = () => 1;
    assert.deepEqual(viewport.targetSize(), { width: 600, height: 450 }, 'drawn at the scale');
    assert.deepEqual(viewport.targetSize(1), { width: 800, height: 600 }, 'shown at full size');
    assert.equal(viewport.upscaled(), true);
    SU.enabled = false;
    try { assert.equal(viewport.upscaled(), false, 'off: PIXI enlarges pixel for pixel as before'); } finally { SU.enabled = true; }
    viewport._scale = 1;
    assert.equal(viewport.upscaled(), false, 'at full size there is nothing to enlarge');
    assert.equal(SU.mode, 'cas', 'cas by default');
    assert.equal(SU.sharpness, 0.5, 'a gentle sharpen');
    for (const mode of ['cas', 'crisp']) {
        SU.mode = mode;
        assert.match(SU.quad().material.fragmentShader, /uniform sampler2D source;/);
    }
    SU.mode = 'cas';
    assert.match(SU.quad().material.fragmentShader, /clamp\(c\.rgb \+ \(c\.rgb \* 4\.0 - n - s - e - w\) \* 0\.5 \* sharpness, lo, hi\)/, 'sharpened within its neighbours\' range');
    assert.equal(Reactor3D.renderScale, 0.75, 'three quarters by default, the owner\'s choice');
    SU.mode = 'crisp';
    assert.match(SU.quad().material.fragmentShader, /\* \(1\.0 \+ sharpness\);/, 'crisp: sharpness hardens the edge blend');
    SU.mode = 'cas';
});

test('water\'s tint and glowing water\'s sheen go over the lit colour: the twin draws without them, the combine lays them on', () => {
    const material = lit({});
    const full = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(full, {});
    assert.match(full.fragmentShader, /outgoingLight = rrWaterTint\(outgoingLight\);/, 'the lit program tints');
    assert.ok(full.fragmentShader.includes(Reactor3D.WaterLight.SHEEN_GLSL), 'and takes the sheen');
    const unlit = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    HL.twin(material).onBeforeCompile(unlit, {});
    assert.doesNotMatch(unlit.fragmentShader, /outgoingLight = rrWaterTint/, 'the twin: no tint');
    assert.ok(!unlit.fragmentShader.includes(Reactor3D.WaterLight.SHEEN_GLSL), 'no sheen');

    // Which of the two this scene needs.
    const scene = new THREE.Scene(), u = Reactor3D.lightUniforms();
    Reactor3D.LightVolume.uniforms();
    const edge = u.rrWaterFarEdge.value, sheen = u.rrWaterSheen.value;
    try {
        u.rrWaterFarEdge.value = 0;
        assert.deepEqual(HL.finishing(scene), { wet: false, sheen: false });
        scene.userData.rrWater = [{}];
        u.rrWaterFarEdge.value = 6; u.rrWaterSheen.value = 0.3;
        assert.deepEqual(HL.finishing(scene), { wet: true, sheen: true });
    } finally { u.rrWaterFarEdge.value = edge; u.rrWaterSheen.value = sheen; }

    // The combine, filtered by surface: dry, it is the program it always was.
    const dry = HL.upsampleProgram({}).material;
    assert.doesNotMatch(dry.fragmentShader, /rrFinish|rrWaterTint|shone/);
    assert.equal(dry.uniforms.rrWaterCount, undefined);
    const wet = HL.upsampleProgram({}, true, true).material;
    assert.notEqual(wet, dry, 'a program of its own');
    assert.match(wet.fragmentShader, /vec3 rrWaterTint\(vec3 color\)/);
    assert.match(wet.fragmentShader, /if \(rrWaterCount > 0 && texelFetch\(rrLightDepth, px, 0\)\.r < 1\.0\) \{\n\t\tvRRWaterPos = rrLightWorld\(px, textureSize\(rrLightDepth, 0\)\);\n\t\tc = rrWaterTint\(c\);/, 'tinted at the world point of the pixel\'s depth, where anything was drawn');
    assert.match(wet.fragmentShader, /vec3 rrOwn = c \/ max\(l, vec3\(0\.001\)\);\n\tc \+= shone \* \(rrWaterSheen \*/, 'the sheen, as the lit program lays it, before the tint');
    assert.ok(wet.fragmentShader.indexOf('c += shone') < wet.fragmentShader.indexOf('c = rrWaterTint(c)'));
    assert.match(wet.fragmentShader, /rrLitFinished\(px, l, rrWaterShone\)/, 'a rim lit at full size takes its own sheen');
    assert.match(wet.fragmentShader, /texelFetch\(shone, i3, 0\)\.rgb \* w\.w\) \/ \(w\.x \+ w\.y \+ w\.z \+ w\.w\)/, 'the sheen filtered up with the light\'s weights');
    assert.equal(wet.uniforms.rrWaterCount, Reactor3D.waterVolumeUniforms().rrWaterCount, 'the scene\'s water, shared');
    assert.ok('shone' in wet.uniforms);
    assert.match(HL.upsampleProgram({}, true, false).material.fragmentShader, /rrLitFinished\(px, l, vec3\(0\.0\)\)/, 'water without a glow: no sheen');

    // The light pass hands the glowing water's share to a second target only when it is wanted.
    assert.doesNotMatch(HL.program({}).material.fragmentShader, /rrShoneOut/);
    const shining = HL.program({}, true).material.fragmentShader;
    assert.match(shining, /layout\(location = 1\) out highp vec4 rrShoneOut;/);
    assert.match(shining, /rrShoneOut = vec4\(rrWaterShone, 0\.0\);/);

    // The plain combine (matchSurfaces off) does the same.
    const plain = HL.combineQuad(true, true).material;
    assert.match(plain.fragmentShader, /rrToSrgb\(clamp\(rrFinish\(rrToLinear\(s\.rgb\) \* l, l, texture2D\(shone/);
    assert.equal(plain.uniforms.rrWaterSheen, Reactor3D.lightUniforms().rrWaterSheen);
    assert.notEqual(HL.combineQuad(), plain);
});

test('an upscaled pass is enlarged as PIXI composites it: the same filter on the small target, no full-size target drawn first', () => {
    const SU = Reactor3D.SharpUpscale;
    const saved = global.PIXI;
    const made = [];
    global.PIXI = {
        GlProgram: { from: options => ({ ...options }) },
        UniformGroup: class { constructor(uniforms) { this.uniforms = Object.fromEntries(Object.entries(uniforms).map(([k, v]) => [k, v.value])); } },
        Shader: class { constructor(options) { Object.assign(this, options); } destroy(programs) { this.destroyed = programs === false ? 'kept program' : 'program too'; } },
        MeshGeometry: class { constructor(options) { Object.assign(this, options); } destroy() { this.destroyed = true; } },
        Mesh: class { constructor(options) { Object.assign(this, options); made.push(this); } destroy() { this.gone = true; } },
        Sprite: class { constructor(texture) { this.texture = texture; } },
        TextureSource: class {}
    };
    try {
        const viewport = Object.create(Reactor3D.Viewport.prototype);
        Object.assign(viewport, { _width: 800, _height: 600, _scale: 0.75, _generation: 3, _pixi: { gl: {} }, _shared: true });
        viewport.passPixelRatio = () => 1;
        const textures = [];
        viewport._pixiTexture = (key, make, flip) => { const t = { key, flip, source: { key } }; textures.push(t); return t; };
        viewport._workTarget = slot => ({ slot });
        viewport._target = slot => ({ slot, full: true });
        const mesh = viewport.passSprite('below');
        assert.equal(made.length, 1, 'a mesh');
        assert.deepEqual(textures.map(t => [t.key, t.flip]), [['work:below', false]], 'over the small target, read upright by its own coordinates');
        assert.equal(mesh.shader.resources.source, mesh.texture.source, 'the filter reads it');
        assert.deepEqual(Array.from(mesh.geometry.uvs), [0, 1, 1, 1, 1, 0, 0, 0], 'the target\'s first row at the bottom of the screen');
        assert.equal(viewport.enlargedInComposite('below'), true);
        assert.equal(viewport.enlargedInComposite('above'), false);
        // The filter as three drew it, in PIXI's names: same arithmetic, tinted as the sprite was.
        const program = mesh.shader.glProgram;
        assert.match(program.fragment, /^#version 300 es\n/);
        assert.match(program.fragment, /finalColor = \(vec4\(clamp\(c\.rgb \+ \(c\.rgb \* 4\.0 - n - s - e - w\) \* 0\.5 \* sharpness, lo, hi\), c\.a\)\) \* uColor;/);
        assert.doesNotMatch(program.fragment, /gl_FragColor|texture2D|varying/);
        assert.equal(program.preferredFragmentPrecision, 'highp', 'at three\'s precision');
        assert.match(program.vertex, /uProjectionMatrix \* uWorldTransformMatrix \* uTransformMatrix/);
        // Sharpness and mode are read as it is drawn.
        SU.sharpness = 0.8; SU.mode = 'crisp';
        try {
            mesh.onRender();
            assert.equal(mesh.shader.resources.upscale.uniforms.sharpness, 0.8);
            assert.match(mesh.shader.glProgram.fragment, /\* \(1\.0 \+ sharpness\);/, 'crisp');
        } finally { SU.sharpness = 0.5; SU.mode = 'cas'; }
        const gone = viewport.passSprite('above');
        gone.destroy({ texture: false });
        assert.ok(gone.gone && gone.geometry.destroyed && gone.shader.destroyed === 'kept program', 'destroyed with its quad, the program kept');
        // The pass's draw stops at the small target.
        let upscales = 0;
        const draw = SU.draw;
        SU.draw = () => { upscales++; };
        viewport.renderInto = () => false;
        viewport._renderer = { resetState() {}, setRenderTarget() {} };
        viewport._resetPixi = () => {};
        try {
            viewport._renderUpscaled('below');
            assert.equal(upscales, 0, 'no full-size target');
            viewport._renderUpscaled('lights');
            assert.equal(upscales, 1, 'a slot shown by a sprite still is');
            viewport._generation = 4;
            viewport._renderUpscaled('below');
            assert.equal(upscales, 2, 'a new generation is shown by what is made for it');
        } finally { SU.draw = draw; }
        SU.inComposite = false;
        try {
            const sprite = viewport.passSprite('below');
            assert.ok(sprite instanceof global.PIXI.Sprite, 'the kill switch: a sprite of the full-size target');
            assert.equal(viewport.enlargedInComposite('below'), false);
        } finally { SU.inComposite = true; }
        viewport.passEnlarged = () => true;
        assert.ok(viewport.passSprite('below') instanceof global.PIXI.Sprite, 'a canvas enlarged past the passes: the filter runs at the full-size target\'s pixels');
        delete viewport.passEnlarged;
        viewport._scale = 1;
        assert.ok(viewport.passSprite('below') instanceof global.PIXI.Sprite, 'at full size there is nothing to enlarge');
    } finally { global.PIXI = saved; }
});

test('the split is drawn on an integrated GPU only: a discrete one lights per pixel in one draw', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), lit({})));
    const target = { depthTexture: new THREE.DepthTexture(4, 4), width: 4, height: 4, samples: 0 };
    const saved = Reactor3D.LightVolume.supported, tier = Reactor3D.gpuTierOverride;
    Reactor3D.LightVolume.supported = () => true;
    try {
        HL.WEAK_ONLY = true;
        Reactor3D.gpuTierOverride = 'full';
        assert.equal(HL.begin({}, scene, target), null, 'a discrete GPU draws the pass whole');
        Reactor3D.gpuTierOverride = 'weak';
        const split = HL.begin({}, scene, target);
        assert.ok(split, 'an integrated GPU splits it');
        HL.restore(split);
        HL.WEAK_ONLY = false;
        Reactor3D.gpuTierOverride = 'full';
        const forced = HL.begin({}, scene, target);
        assert.ok(forced, 'WEAK_ONLY = false splits on every tier');
        HL.restore(forced);
    } finally {
        HL.WEAK_ONLY = false;
        Reactor3D.gpuTierOverride = tier;
        Reactor3D.LightVolume.supported = saved;
    }
});
