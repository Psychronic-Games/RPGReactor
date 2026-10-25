// A liquid at full Glow reads as neon: a halo bleeds from it into the picture (only from what shines, only while
// something does), what stands near takes a sheen of its colour whatever colour it is, a lake lights further than a
// pond, the sheet's surface is read in its shine and keeps its hue under a noon sun, and Glow 0 is water as it was.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

const steps = Array.from({ length: 101 }, (_, i) => i / 100);
const OWNER = { colour: '#6c0ec7', clear: 0.8, reflect: 0.71, gloss: 0.85 };
function pondMap(sheets, W = 40, H = 30) {
    return { width: W, height: H, data: [], reactor3d: { version: 1, mode: '3d', water: sheets } };
}
const pond = (extra = {}) => Object.assign({ x0: 10, y0: 10, x1: 19, y1: 17, level: -0.2, material: 'Water' }, extra);
function sceneWith(sheets, W, H) {
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    scene.addWater(pondMap(sheets, W, H), () => null);
    return scene;
}
/** The very same thing (never printed: a scene object is a graph a failed comparison would try to draw). */
const same = (a, b, text) => assert.ok(a === b, text);
const toScreen = v => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

test('the halo follows Glow: nothing under a fifth, a faint rim at a third, neon at full, with no step anywhere', () => {
    const halo = glow => R.waterShade(Object.assign({ glow }, OWNER)).halo;
    const curve = steps.map(halo);
    assert.equal(curve[0], 0, 'no glow, no halo');
    for (let i = 1; i < curve.length; i++) {
        assert.ok(curve[i] >= curve[i - 1], 'never falls (' + i / 100 + ')');
        assert.ok(curve[i] - curve[i - 1] < 0.021, 'no jump at ' + i / 100 + ': ' + (curve[i] - curve[i - 1]).toFixed(4));
    }
    assert.equal(curve[100], 1, 'whole at full glow');
    // Only what is brighter than the threshold bleeds: the shine at the glow where the halo begins is WATER_HALO_FROM.
    const from = curve.findIndex(v => v > 0) / 100;
    assert.ok(from > 0.15 && from <= 0.21, 'begins at about a fifth: ' + from);
    assert.ok(R.waterShade({ glow: from - 0.01 }).emit <= R.WATER_HALO_FROM && R.waterShade({ glow: from }).emit > R.WATER_HALO_FROM, 'where the shine passes the threshold');
    assert.ok(halo(0.3) > 0.03 && halo(0.3) < 0.08, 'a faint shimmer at 0.3: ' + halo(0.3).toFixed(3));
    assert.ok(halo(0.6) > 0.25 && halo(0.6) < 0.4, 'a third of it at 0.6: ' + halo(0.6).toFixed(3));
    // Whatever the liquid: lava and slime take the same halo for the same glow, in their own colour.
    assert.equal(R.waterShade({ glow: 0.6, colour: '#ff4a10', clear: 0 }).halo, halo(0.6));
    const sheet = R.waterMaterial(null, { glow: 1, colour: '#ff4a10', clear: 0, waves: 0.3 }), fed = sheet.userData.rrWaterHalo;
    assert.ok(fed.colour.value.r === 1 && fed.colour.value.g < 0.1 && fed.strength.value === 1, 'lava feeds it orange at full');
    // A slider writes it into the standing sheet, down to nothing.
    R.applyWaterLook(sheet, { glow: 0.3, colour: '#6c0ec7' });
    assert.ok(Math.abs(fed.strength.value - halo(0.3)) < 1e-12 && fed.colour.value.b === 1);
    R.applyWaterLook(sheet, { colour: '#6c0ec7' });
    assert.equal(fed.strength.value, 0);
    // The shares of the halo's sizes come to the whole, the widest the largest: a wide soft bleed, not a hard rim.
    const H = R.Halo;
    assert.equal(H.SHARES.length, H.LEVELS);
    assert.ok(Math.abs(H.SHARES.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    for (let i = 1; i < H.SHARES.length; i++) assert.ok(H.SHARES[i] >= H.SHARES[i - 1]);
    assert.ok(H.STRENGTH > 0.5 && H.STRENGTH <= 1);
});

/** A renderer that only notes what it is asked to draw into what. */
function noteRenderer() {
    const calls = [];
    let target = null;
    return {
        calls, autoClear: true,
        getClearColor: colour => colour, getClearAlpha: () => 1, setClearColor() {}, clear() { calls.push({ clear: target }); },
        setRenderTarget(next) { target = next; }, getRenderTarget: () => target,
        render(scene, camera) { calls.push({ target, scene, camera, material: scene.children && scene.children[0] && scene.children[0].material }); }
    };
}

test('nothing glows, nothing is drawn or kept: the halo is fed by shining sheets alone and goes with the last of them', () => {
    const H = R.Halo, saved = { targets: H._targets, idle: H._idle, enabled: H.enabled };
    H._targets = null; H._idle = 0; H.enabled = true;
    try {
        const scene = sceneWith([pond(), pond({ x0: 22, x1: 30, glow: 0.1 })]);
        const bodies = scene._scene.userData.rrLightBodies, feeders = bodies.userData.rrHalo;
        assert.equal(scene._waterHalo.length, 2, 'each sheet has its surface ready for the halo');
        same(feeders.parent, bodies, 'the feeders stand with the light bodies');
        assert.equal(feeders.visible, false, 'no draw of the scene shows them: a mirror or a capture never sees the sheet twice');
        assert.ok(scene._waterHalo.every(mesh => !mesh.visible), 'a sheet that does not glow, and one under the threshold, feed nothing');
        same(scene._waterHalo[0].geometry, scene._waterMeshes[0].geometry, 'the sheet\'s own surface, none made for it');
        const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
        const target = { width: 1440, height: 810, depthTexture: {} };
        // A glow under the halo's threshold has its haze (the lights' quarter-size pass draws that) and no halo.
        same(H.sources(bodies), null, 'nothing feeds');
        const faint = R.HalfHaze.take(scene._scene, target, camera);
        assert.ok(faint && faint.length === R.WATER_HAZE_LAYERS.length && faint.halo === undefined, 'the haze alone');
        R.HalfHaze.restore(faint);
        // No glow at all: the haze pass has nothing to take, the halo nothing to draw.
        R.applyWaterLook(scene._waterMeshes[1].material, {});
        same(H.sources(bodies), null, 'nothing feeds');
        same(R.HalfHaze.take(scene._scene, target, camera), null, 'no pass at all');
        same(H._targets, null, 'and no target');
        assert.equal(H.state().targets, 0);
        // A map with no water has no feeders' group to ask.
        const dry = new THREE.Scene(), lamps = new THREE.Group();
        dry.add(lamps); dry.userData.rrLightBodies = lamps;
        same(H.sources(lamps), null, 'a dry map feeds nothing');
        same(R.HalfHaze.take(dry, target, camera), null, 'and has no pass');
        // The second sheet's glow raised past the threshold (a slider, no sheet laid again): it feeds.
        R.applyWaterLook(scene._waterMeshes[1].material, { glow: 1, colour: '#6c0ec7' });
        assert.equal(scene._waterHalo[1].visible, true);
        same(H.sources(bodies), feeders, 'the feeders\' group');
        const taken = R.HalfHaze.take(scene._scene, target, camera);
        assert.ok(taken && taken.halo === feeders, 'taken with the haze, to be drawn against the same small depth');
        R.HalfHaze.restore(taken);
        // Drawn: the feeders alone into the quarter-size picture, halved LEVELS times, gathered up, screened onto the pass.
        const renderer = noteRenderer();
        H.draw(renderer, target, camera, feeders, 360, 203);
        const sizes = H._targets.map(t => [t.width, t.height]);
        assert.deepEqual(sizes, [[360, 203], [180, 102], [90, 51], [45, 26], [23, 13]], 'a quarter of the pass each way and its halvings');
        assert.ok(sizes.slice(1).reduce((n, s) => n + s[0] * s[1], 0) < 360 * 203 / 2.9, 'the halvings together are a third of the quarter-size picture');
        const draws = renderer.calls.filter(c => c.scene);
        same(draws[0].scene, feeders, 'first what shines, and nothing else of the scene');
        same(draws[0].target, H._targets[0], 'into the quarter-size picture');
        assert.equal(feeders.visible, false, 'hidden again once drawn');
        assert.deepEqual(draws.slice(1, 5).map(c => H._targets.indexOf(c.target)), [1, 2, 3, 4], 'halved four times');
        assert.deepEqual(draws.slice(5, 8).map(c => H._targets.indexOf(c.target)), [3, 2, 1], 'gathered back up, each size taking the wider ones');
        assert.equal(H._targets.indexOf(draws[8].target), 0, 'the sum, at the quarter size');
        const last = draws[draws.length - 1];
        same(last.target, target, 'then onto the pass');
        assert.equal(draws.length, 10);
        assert.equal(H.state().passes, 9, 'nine small full-screen draws and the feeders');
        // Onto the pass as a screen: what is there plus the halo's share of what is left to white; a pixel the halo
        // does not reach is not written, so the rest of the picture is exactly what it was.
        const screen = last.material;
        assert.equal(screen.blending, THREE.CustomBlending);
        assert.deepEqual([screen.blendSrc, screen.blendDst, screen.blendSrcAlpha, screen.blendDstAlpha], [THREE.OneMinusDstColorFactor, THREE.OneFactor, THREE.ZeroFactor, THREE.OneFactor]);
        assert.match(screen.fragmentShader, /if \(max\(h\.r, max\(h\.g, h\.b\)\) < 0\.002\) discard;/);
        assert.equal(screen.uniforms.strength.value, H.STRENGTH);
        // The same sizes asked again make nothing new: a frame allocates nothing.
        const held = H._targets.slice();
        H.draw(renderer, target, camera, feeders, 360, 203);
        assert.ok(H._targets.length === held.length && H._targets.every((t, i) => t === held[i]), 'the same targets');
        // A feeder is drawn as the haze is, behind whatever the pass's depth has in front of it, in the sheet's colour and strength.
        const feeder = scene._waterHalo[1].material;
        assert.match(feeder.fragmentShader, /if \(rrHazeDepthOn != 0 && 1\.0 \/ gl_FragCoord\.w > dot\(texture2D\(rrHazeDepth/);
        same(feeder.uniforms.strength, scene._waterMeshes[1].material.userData.rrWaterHalo.strength, 'the sheet\'s live value');
        assert.match(feeder.fragmentShader, /colour \* \(strength \* smoothstep\(0\.0, 0\.3, vRRDepth\)\)/, 'gone at the shore, as the sheet\'s shine is');
        // The quality switches: the halo's own, and the haze's quarter-size pass it is drawn with.
        H.enabled = false;
        same(H.sources(bodies), null, 'Reactor3D.Halo.enabled = false: no halo');
        H.enabled = true;
        const hazeOn = R.HalfHaze.enabled;
        R.HalfHaze.enabled = false;
        try { same(R.HalfHaze.take(scene._scene, target, camera), null, 'no quarter-size pass, no halo'); } finally { R.HalfHaze.enabled = hazeOn; }
        // The glow taken away again: no pass from the next frame, and the targets are let go soon after.
        R.applyWaterLook(scene._waterMeshes[1].material, { colour: '#6c0ec7' });
        same(H.sources(bodies), null, 'nothing feeds again');
        assert.ok(H._targets, 'kept for a moment (a slider passing through nothing)');
        for (let i = 0; i < H.IDLE_FRAMES; i++) H.sources(bodies);
        same(H._targets, null, 'then gone');
        // The water laid again takes the old feeders down with the haze.
        const before = scene._waterHalo.slice();
        scene.updateWaterSheets(pondMap([pond({ glow: 1 })]), () => null);
        assert.ok(before.every(mesh => !mesh.parent) && before.every(mesh => !scene._materials.includes(mesh.material)));
        assert.equal(scene._waterHalo.length, 1);
        assert.equal(scene._waterHalo[0].visible, true);
        same(scene._waterHalo[0].parent, feeders, 'in the same group');
    } finally { H.dispose(); H._targets = saved.targets; H._idle = saved.idle; H.enabled = saved.enabled; }
});

test('beside the quarter-size light the halo still tests the farthest of each texel\'s pixels: it runs over what stands in front of its feeders', () => {
    const H = R.Halo, HH = R.HalfHaze, saved = { draw: H.draw, depth: HH._depth };
    const scene = sceneWith([pond({ glow: 1, colour: '#6c0ec7' })]);
    const feeders = scene._scene.userData.rrLightBodies.userData.rrHalo;
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
    const target = { width: 1440, height: 810, depthTexture: {} };
    // The light keeps one pixel's distance a texel in its alpha, at the haze's own size.
    const split = { light: new THREE.WebGLRenderTarget(360, 203) };
    const list = []; list.halo = feeders;
    let seen = null;
    H.draw = function() { const u = HH.uniforms(); seen = { depth: u.rrHazeDepth.value, pick: u.rrHazeDepthPick.value.toArray() }; };
    try {
        HH._depth = null;
        const renderer = noteRenderer();
        HH.draw(renderer, target, camera, list, split);
        assert.ok(seen, 'the halo is drawn');
        same(seen.depth, HH._depth.texture, 'against the shrunk depth');
        assert.deepEqual(seen.pick, [1, 0, 0, 0], 'its red channel');
        assert.ok(renderer.calls.some(c => c.scene && c.target === HH._depth), 'shrunk this frame');
        assert.equal(HH.uniforms().rrHazeDepthOn.value, 0, 'and the test off again after');
    } finally { H.draw = saved.draw; HH._depth = saved.depth; }
});

test('a lake lights its banks further than a pond, less with distance, and at a low glow only the shore', () => {
    const W = R.WaterLight;
    // The owner's lake in small: a sheet 90 by 60 on a map of 200, its west bank a straight shore.
    const lake = glow => pondMap([Object.assign({ x0: 60, y0: 60, x1: 149, y1: 119, level: -11.19, material: 'Water', glow }, OWNER)], 200, 200);
    const picture = map => { const info = W.describe(map); return info ? W.build(map, info) : null; };
    const blue = (field, x, y, w = 200) => (field ? field[(y * w + x) * 4 + 2] : 0);
    const full = picture(lake(1)), third = picture(lake(0.3));
    const away = (field, d) => blue(field, 60 - d, 90);
    assert.equal(W.spread(R.waterOf(lake(1))[0], { width: 200, height: 200 }).reach, W.WIDE, 'a lake is spread with the widest box');
    assert.equal(W.spread(R.waterOf(pondMap([pond({ glow: 1 })]))[0], { width: 40, height: 30 }).reach, W.SPREAD, 'a pond with the usual one');
    assert.ok(W.WIDE > W.SPREAD);
    // At Glow 1: strong at the waterline, still there ten tiles up the bank, gone past its reach, always falling.
    assert.ok(away(full, 1) > 0.6 && away(full, 1) < R.WATER_LIGHT, 'the waterline: ' + away(full, 1).toFixed(3));
    assert.ok(away(full, 5) > 0.3, 'five tiles off: ' + away(full, 5).toFixed(3));
    assert.ok(away(full, 10) > 0.05, 'ten tiles off, where a pond\'s light has ended: ' + away(full, 10).toFixed(3));
    assert.equal(away(full, 17), 0, 'nothing past sixteen');
    for (let d = 1; d < 18; d++) assert.ok(away(full, d + 1) <= away(full, d), 'falling at ' + d);
    assert.ok(Math.abs(blue(full, 105, 90) - R.WATER_LIGHT) < 1e-3, 'whole over the middle of the lake, far from every bank: a swimmer there is lit as well as one at the shore');
    // The same bank beside a pond of the same water: nearer the water it is as bright, further off it is dark.
    const small = pondMap([Object.assign(pond({ x0: 60, y0: 86, x1: 69, y1: 95, level: -11.19, glow: 1 }), OWNER)], 200, 200), smallField = picture(small);
    assert.ok(blue(smallField, 50, 90) === 0 && away(full, 10) > 0, 'ten tiles from a pond is dark, ten from the lake is not');
    // At Glow 0.3: a hint on the shore, a quarter or less of the full light, and it stays nearer the water.
    assert.ok(away(third, 1) > 0.1 && away(third, 1) < away(full, 1) * 0.3, 'the waterline at 0.3: ' + away(third, 1).toFixed(3));
    assert.ok(away(third, 8) < away(full, 8) * 0.25, 'eight tiles off at 0.3: ' + away(third, 8).toFixed(3));
    assert.ok(away(third, 8) / away(third, 1) < away(full, 8) / away(full, 1), 'a faint glow falls off sooner than a strong one');
    // Up the bank's slope the light thins with height as the bake and the lit shader have it: (1 - dy / ABOVE)^1.5.
    const lift = dy => Math.pow(Math.max(0, 1 - dy / W.ABOVE), 1.5);
    assert.ok(lift(5) > 0.45 && lift(11) > 0.08 && lift(W.ABOVE) === 0);
});

test('what stands near glowing water takes a sheen of the water\'s colour, whatever its own colour is', () => {
    const W = R.WaterLight, V = R.LightVolume;
    // The rule, as the lit programs carry it.
    assert.equal(W.SHEEN_GLSL, [
        '{',
        '\tvec3 rrOwn = outgoingLight / max(rrLitBy, vec3(0.001));',
        '\toutgoingLight += rrWaterShone * (rrWaterSheen * (0.25 + 0.75 * clamp(max(rrOwn.r, max(rrOwn.g, rrOwn.b)), 0.0, 1.0)));',
        '}'
    ].join('\n'));
    /** That rule in numbers: `albedo` under `light` (ambient and all), of which `shone` is the glowing water's. */
    const lit = (albedo, light, shone, sheen = W.SHEEN) => {
        const out = albedo.map((a, k) => a * light[k]);
        const own = out.map((v, k) => v / Math.max(light[k], 0.001));
        const take = sheen * (0.25 + 0.75 * Math.max(0, Math.min(1, Math.max(...own))));
        return out.map((v, k) => v + shone[k] * take);
    };
    const neon = R.waterShade(Object.assign({ glow: 1 }, OWNER)).neon;
    const night = [0.136, 0.155, 0.22], shone = neon.map(v => v * 0.9), light = night.map((v, k) => v + shone[k]);
    const grass = [0.15, 0.3, 0.08], stone = [0.55, 0.52, 0.5], hair = [0.02, 0.02, 0.02];
    // Green grass under a purple lake's light, through its own colour alone: brighter, but grey, not purple.
    const plain = grass.map((a, k) => a * light[k]);
    assert.ok(plain[2] < plain[0] * 1.9 && plain[1] > plain[2] * 0.5, 'the light alone leaves grass a dull grey: ' + plain.map(v => v.toFixed(3)));
    // With the sheen it is the lake's colour: blue leads red, red leads green.
    const washed = lit(grass, light, shone);
    assert.ok(washed[2] > washed[0] * 2 && washed[0] > washed[1], 'washed purple: ' + washed.map(v => v.toFixed(3)));
    assert.ok(toScreen(washed[2]) - toScreen(plain[2]) > 0.15, 'a clear step on the screen');
    // A light surface takes more of it than a dark one, and a black one still a little.
    const pale = lit(stone, light, shone), dark = lit(hair, light, shone);
    assert.ok(pale[2] - stone[2] * light[2] > washed[2] - plain[2] && washed[2] - plain[2] > dark[2] - hair[2] * light[2] && dark[2] - hair[2] * light[2] > 0);
    // It is the water's light times a share: no glowing water near, no sheen; half the light, half the sheen.
    assert.deepEqual(lit(grass, night, [0, 0, 0]), grass.map((a, k) => a * night[k]));
    const halfShone = shone.map(v => v / 2), halfLight = night.map((v, k) => v + halfShone[k]);
    assert.ok(Math.abs((lit(grass, halfLight, halfShone)[2] - grass[2] * halfLight[2]) - (washed[2] - plain[2]) / 2) < 1e-9);
    // At noon, under a sun three times the ambient, the bank is still tinted.
    const noon = [3, 3, 3].map((v, k) => v + shone[k]), day = lit(grass, noon, shone), dayPlain = grass.map((a, k) => a * noon[k]);
    assert.ok(toScreen(Math.min(1, day[2])) - toScreen(Math.min(1, dayPlain[2])) > 0.04, 'seen by day: ' + (toScreen(day[2]) - toScreen(dayPlain[2])).toFixed(3));
    // The lit shader keeps what the light came to and the water's part of it, wherever water glows on the map.
    const glsl = R.LightGrid.glsl(R.lightGlsl(false));
    assert.match(glsl, /uniform float rrWaterSheen;\nvec3 rrLitBy = vec3\(1\.0\);\nvec3 rrWaterShone = vec3\(0\.0\);/);
    assert.match(glsl, /\trrLitBy = sum;\n\treturn sum;\n\}/);
    assert.match(glsl, /rrWaterShone = rrWL\.rgb \* pow\(/, 'all of the water\'s light at the point, inside the baked volume\'s box and outside it');
    // A lit material adds the sheen once its light is laid on, before the water it is seen through tints it.
    const material = R.litMaterial(new THREE.MeshBasicMaterial());
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(shader, null);
    const at = shader.fragmentShader.indexOf(W.SHEEN_GLSL);
    assert.ok(at > 0 && at < shader.fragmentShader.indexOf('outgoingLight = rrWaterTint(outgoingLight);'));
    assert.ok(at > shader.fragmentShader.indexOf('rrLight(vRRWorldPos)'), 'after the light');
    same(shader.uniforms.rrWaterSheen, V.uniforms().rrWaterSheen, 'the shared uniform');
    // What is not lit (the sky, seen through water) has no light to take a sheen of.
    const sky = R.waterVolumeMaterial(new THREE.MeshBasicMaterial());
    const skyShader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    sky.onBeforeCompile(skyShader, null);
    assert.ok(!skyShader.fragmentShader.includes('rrWaterShone') && skyShader.fragmentShader.includes('rrWaterTint(outgoingLight)'));
    // The share is set each frame water glows, and the water's light is zero in the shader when none does.
    const u = V.uniforms(), saved = { texture: W._texture, sheen: u.rrWaterSheen.value, edge: u.rrWaterFarEdge.value };
    try {
        u.rrWaterSheen.value = 0;
        W.loadFar(u, pondMap([pond({ glow: 1 })]), { _front: null, _back: null });
        assert.equal(u.rrWaterSheen.value, W.SHEEN);
        assert.ok(W.SHEEN > 0.15 && W.SHEEN < 0.5);
        W.loadFar(u, pondMap([pond()]), { _front: null, _back: null });
        assert.equal(u.rrWaterFarEdge.value, 0, 'no glow: the picture is not read, rrWaterShone stays nothing');
    } finally {
        if (W._texture && W._texture !== saved.texture) W._texture.texture.dispose();
        W._texture = saved.texture; u.rrWaterSheen.value = saved.sheen; u.rrWaterFarEdge.value = saved.edge;
    }
});

test('a glowing sheet\'s surface is read in its shine: troughs dimmer, crests and veins brighter and paler, and Glow 0 is water as it was', () => {
    const G = R.WATER_GLOW, glsl = R.WATER_GLOW_GLSL;
    // The numbers the shader is written from.
    assert.ok(glsl.includes('float rrShine = (' + G.base.toFixed(2) + ' + ' + G.swell.toFixed(2) + ' * vRRSwell + ' + G.vein.toFixed(2) + ' * rrVein) * (' + (1 - G.ripple / 2).toFixed(2) + ' + ' + G.ripple.toFixed(2) + ' * rrFacet) * (1.0 + ' + G.drift.toFixed(2) + ' * rrDrift);'));
    assert.ok(glsl.includes('float rrHot = rrWaterForm.z * min(' + G.hotMost.toFixed(2) + ', ' + G.hot.toFixed(2) + ' * rrVein);'));
    assert.ok(glsl.includes('vec3 rrHeated = mix(pow(max(rrWaterGlow.rgb, vec3(0.0001)), vec3(1.0 - ' + G.heat.toFixed(2) + ' * rrHot)), vec3(1.0), ' + G.pale.toFixed(2) + ' * rrHot);'));
    assert.ok(glsl.includes('rrWaterEmit = rrHeated * (rrWaterGlow.w * rrShine * rrByDay * (1.0 - 0.6 * rrWhite));'));
    // Under a noon sky it shines a third harder than at night (beside sunlit ground the night's shine looks dull); at night not at all.
    assert.ok(glsl.includes('float rrByDay = 1.0 + ' + G.day.toFixed(2) + ' * smoothstep(0.2, 1.0, dot(rrAmbient, vec3(0.3, 0.59, 0.11)));'));
    const byDay = (level, hex) => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255 * level), l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], t = Math.max(0, Math.min(1, (l - 0.2) / 0.8)); return 1 + G.day * t * t * (3 - 2 * t); };
    assert.equal(byDay(0.22, '#9db4ff'), 1, 'night: as set');
    assert.ok(byDay(0.55, '#ffc9a0') > 1.03 && byDay(0.55, '#ffc9a0') < 1.2, 'dusk: a little, ' + byDay(0.55, '#ffc9a0').toFixed(3));
    assert.ok(Math.abs(byDay(1, '#ffffff') - (1 + G.day)) < 1e-9 && G.day > 0.2 && G.day < 0.5, 'noon: a third');
    const at = (swell, vein, drift = 0, facet = 0.5) => R.waterGlowShine(swell, vein, drift, facet);
    const trough = at(-1, 0), rest = at(0, G.veinFar), crest = at(1, 0), vein = at(0, 1), core = at(1, 1.4, 1, 1);
    assert.ok(trough.shine < rest.shine && rest.shine < crest.shine && crest.shine < vein.shine, 'trough, rest, crest, vein: ' + [trough, rest, crest, vein].map(p => p.shine.toFixed(2)));
    assert.ok(crest.shine / trough.shine > 1.7, 'a crest is well brighter than a trough: the waves read');
    assert.ok(vein.shine / rest.shine > 1.8, 'a vein stands out of the liquid round it');
    assert.ok(at(0, 0, 1).shine > at(0, 0, -1).shine * 1.3, 'the slow bands show');
    assert.ok(at(0, 0, 0, 1).shine > at(0, 0, 0, 0).shine * 1.1, 'so do the ripples near the eye');
    assert.ok(trough.hot === 0 && vein.hot > 0.3 && core.hot === G.hotMost && G.hotMost < 0.7, 'only the veins burn pale, never white through');
    // As drawn at full glow, the owner's purple: no part of the surface is one flat fill.
    const shade = R.waterShade(Object.assign({ glow: 1 }, OWNER));
    const drawn = (point, neon = shade.neon) => R.waterGlowHeated(neon, point.hot).map(v => Math.round(255 * toScreen(Math.min(1, v * shade.emit * point.shine))));
    assert.ok(drawn(vein)[2] - drawn(trough)[2] > 90 && drawn(rest)[2] - drawn(trough)[2] > 25, 'on the screen: trough ' + drawn(trough) + ', rest ' + drawn(rest) + ', vein ' + drawn(vein));
    assert.ok(drawn(rest)[2] < 250, 'at rest the strongest channel is short of full: the crests have room to be brighter');
    assert.ok(drawn(vein)[1] > drawn(rest)[1] + 60, 'a vein is paler, not only brighter');
    // Heat lifts each channel by its own strength, the next strongest first: lava's veins are orange, not pink.
    assert.deepEqual(R.waterGlowHeated(shade.neon, 0), shade.neon, 'no heat: the liquid\'s own colour');
    const lava = R.waterShade({ glow: 1, colour: '#ff4a10', clear: 0 }).neon, lavaVein = R.waterGlowHeated(lava, vein.hot);
    assert.ok(lavaVein[0] === 1 && lavaVein[1] > lava[1] + 0.2 && lavaVein[1] > lavaVein[2] * 1.8, 'lava\'s vein: red full, green well up, blue behind: ' + lavaVein.map(v => v.toFixed(2)));
    const lilac = R.waterGlowHeated(shade.neon, vein.hot);
    assert.ok(lilac[2] === 1 && lilac[0] > shade.neon[0] + 0.15 && lilac[0] > lilac[1] * 1.5, 'purple\'s vein: lilac: ' + lilac.map(v => v.toFixed(2)));
    // The veins' arithmetic is skipped for a sheet that does not glow, and where they would be finer than a pixel.
    assert.match(glsl, /\tif \(rrWaterGlow\.w > 0\.0\) \{\n/);
    assert.match(glsl, /float rrFine = 1\.0 - smoothstep\(0\.1, 0\.4, length\(fwidth\(rrU\)\)\);\n\t\tfloat rrVein = 0\.125;\n\t\tif \(rrFine > 0\.0\) \{/);
    assert.ok(Math.abs(G.veinFar - 0.125) < 1e-9);
    // They stir with the liquid's waves: lava's crawl.
    assert.ok(glsl.includes('float rrStir = (rrWaveTime + 40.0) * ' + G.stir.toFixed(2) + ' * mix(0.25, 1.0, clamp(rrWaterForm.y, 0.0, 1.0));'));
    // A slow shimmer: the quickest part of the pattern turns once in a quarter of a minute or more, lava's four times slower.
    assert.ok(2 * Math.PI / (2.5 * G.stir) > 15 && 2 * Math.PI / (2.5 * G.stir) < 40, 'seconds a turn: ' + (2 * Math.PI / (2.5 * G.stir)).toFixed(1));
    // The lit liquid stands back as the glow rises, in the glow's colour: by day the sheet stays saturated.
    assert.ok(glsl.startsWith('\tvec3 rrGlowTint = mix(vec3(1.0), rrWaterGlow.rgb, 0.85 * rrWaterForm.w);\n\tdiffuseColor.rgb *= rrGlowTint * (1.0 - 0.60 * rrWaterForm.w);'));
    const neon = shade.neon, sun = 3;
    // Noon, glancing: the liquid's own sky-lit colour under the sun, and the shine. Without the rule the sum is washed pale.
    const skyLit = [0.2, 0.22, 0.26].map(v => v * sun), emit = neon.map(v => v * shade.emit * rest.shine);
    const washed = skyLit.map((v, k) => Math.min(1, v + emit[k]));
    const tint = neon.map(v => 1 + (v - 1) * G.tint * shade.cover), kept = skyLit.map((v, k) => v * tint[k] * (1 - G.body * shade.cover) + emit[k]);
    assert.ok(washed[1] > 0.6, 'as it was: green up with the rest, a pale pink-white');
    assert.ok(kept[1] < 0.15 && kept[2] > 0.6 && kept[2] > kept[0] * 1.5, 'now: the glow\'s own colour, ' + kept.map(v => v.toFixed(2)));
    // Past full brightness it goes pale and keeps its hue (each channel cut at full by itself turned purple magenta).
    assert.equal(R.WATER_SHINE_GLSL, [
        'outgoingLight += rrWaterEmit;',
        '{',
        '\tfloat rrOver = max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b));',
        '\tif (rrOver > 1.0 && rrWaterEmit.r + rrWaterEmit.g + rrWaterEmit.b > 0.0) outgoingLight = mix(outgoingLight / rrOver, vec3(1.0), min(0.6 * (rrOver - 1.0), 0.7));',
        '}'
    ].join('\n'));
    const keepHue = c => { const over = Math.max(...c); if (!(over > 1)) return c; const k = Math.min(0.6 * (over - 1), 0.7); return c.map(v => v / over + (1 - v / over) * k); };
    /** A colour's hue in degrees. */
    const hue = ([r, g, b]) => { const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo || 1; const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const bright = [0.6, 0.1, 1.6], cut = bright.map(v => Math.min(1, v)), held = keepHue(bright);
    assert.ok(hue(cut) - hue(bright) > 10, 'cut channel by channel the red catches up and the hue turns toward magenta: ' + hue(bright).toFixed(0) + ' -> ' + hue(cut).toFixed(0));
    assert.ok(Math.abs(hue(held) - hue(bright)) < 0.5 && held[2] === 1 && held[1] > 0.2, 'held: the hue it had, paler: ' + held.map(v => v.toFixed(2)) + ' at ' + hue(held).toFixed(0));
    // The further past full, the paler: a vein still stands out of a liquid that is itself at full brightness by day.
    assert.ok(keepHue([0.5, 0.05, 1.5])[1] > keepHue([0.4, 0.04, 1.15])[1] + 0.15);
    assert.deepEqual(keepHue([0.4, 0.2, 0.9]), [0.4, 0.2, 0.9], 'under full brightness nothing is touched');
    // Where the surface mirrors the world, that much less of the shine comes through it: the reflection is still seen.
    const sheet = R.waterMaterial(null, Object.assign({ glow: 1 }, OWNER));
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    sheet.onBeforeCompile(shader, null);
    const fragment = shader.fragmentShader;
    assert.ok(fragment.includes(glsl));
    assert.match(fragment, /rrEnvC \*= rrWaterTint \* rrGlowTint;/, 'what it mirrors takes the glow\'s colour');
    assert.match(fragment, /rrMirrorShare = rrMirror;/);
    assert.ok(fragment.includes('rrWaterEmit *= 1.0 - ' + R.WATER_GLOW_MIRROR.toFixed(2) + ' * rrMirrorShare;'));
    assert.ok(R.WATER_GLOW_MIRROR > 0.2 && R.WATER_GLOW_MIRROR < 0.5, 'a full mirror holds some of the shine back, never most of it');
    assert.match(shader.vertexShader, /vRRSwell = rrLift \/ max\(rrA1 \+ rrA2, 0\.0001\) \* rrCalm;/, 'where the vertex rides on the swell');
    // Glow 0: every factor is one, nothing shines, no halo, no light, no haze: the sheet's uniforms are water's.
    const still = R.waterMaterial(null, OWNER), d = still.userData;
    assert.deepEqual([d.rrWaterForm.z, d.rrWaterForm.w, d.rrWaterGlow.w, d.rrWaterHalo.strength.value, d.rrWaterHaze.strength.value], [0, 0, 0, 0, 0]);
    const none = R.waterShade(OWNER);
    assert.deepEqual([none.emit, none.cover, none.light, none.haze, none.halo], [0, 0, 0, 0, 0]);
    assert.deepEqual(neon.map(v => 1 + (v - 1) * G.tint * none.cover), [1, 1, 1], 'the tint is one');
    assert.equal(1 - G.body * none.cover, 1, 'the lit liquid is whole');
});

test('first person in the water: treading, stroking, diving or looking round, the swimmer\'s own head is never in front of the eye while its body is drawn', t => {
    const Motions = require(path.join(repoRoot, 'runtime/reactor_rig_motions.js'));
    // The crawl as the rig preset poses the body: pitched forward from the feet, lifted and drawn back.
    const crawl = Motions.byId('swim').rules.find(rule => rule.part === '').keys[0];
    assert.deepEqual([crawl.rotate, crawl.move], [[75, 0, 0], [0, 1.6, -1.45]]);
    assert.equal(Motions.byId('tread').rules.some(rule => rule.part === '' && rule.keys.some(key => key.rotate[0] !== 0)), false, 'treading water the body is upright');
    // A three-tile character: its eyes 2.76 up and 0.32 ahead of its upright axis (its front is its +z).
    const upright = [0, 2.76, 0.32], lean = crawl.rotate[0] * Math.PI / 180;
    const posed = share => {
        const a = lean * share, y = upright[1] * Math.cos(a) - upright[2] * Math.sin(a), z = upright[1] * Math.sin(a) + upright[2] * Math.cos(a);
        return [0, y + crawl.move[1] * share, z + crawl.move[2] * share];
    };
    assert.ok(posed(1)[2] > 1.2 && posed(1)[1] < 2.2, 'in the crawl the head is over a tile ahead of the swimmer and lower: ' + posed(1).map(v => v.toFixed(2)));
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 3, z: 0.6 };
    const character = { _realX: 20, _realY: 30, _reactorSwim: true };
    const holder = { object, cameraBaseX: 20, cameraBaseZ: 30, cameraBaseY: 0 };
    t.mock.method(R, 'modelHolderFor', () => holder);
    // As on a first-person map: the player's model is out of the picture while the eye says it is held inside it.
    t.mock.method(R, 'characterHiddenByCamera', who => who === character && R.Camera.playerEyes.inside === true);
    const look = R.Camera.look, yawWas = look.yaw, E = R.Camera.EYE, mapWas = global.$dataMap, DEG = Math.PI / 180;
    object.position.set(20.5, 0, 30.5);
    try {
        global.$dataMap = { width: 48, height: 48, reactor3d: { version: 1, elevation: new Array(48 * 48).fill(0), pieces: [] } };
        /** One frame: the body posed `share` of the way into the crawl, facing `facing`, the look at `yaw`. How far the model's own eyes stand ahead of the eye along the look, and whether the body is drawn. */
        const frame = (share, yaw, facing = yaw, elevation = 0) => {
            R.bindModelLandmarks(object, { eyes: { part: '', offset: posed(share) } });
            object.rotation.y = Math.PI - facing * DEG;
            look.yaw = yaw;
            object.updateMatrixWorld(true);
            const eye = R.Camera.playerEyes(character, elevation).clone(), own = R.modelLandmarkWorld(object, 'eyes', new THREE.Vector3());
            const ahead = (own.x - eye.x) * Math.sin(yaw * DEG) - (own.z - eye.z) * Math.cos(yaw * DEG);
            return { ahead, drawn: !R.Camera.playerEyes.inside, out: Math.hypot(eye.x - 20.5, eye.z - 30.5), y: eye.y };
        };
        const safe = (f, text) => assert.ok(!f.drawn || f.ahead < 0, text + ': the head ' + f.ahead.toFixed(3) + ' ahead of the eye with the body drawn');
        // Treading water: the body is drawn and the eye is just in front of its face, as on land.
        const treading = frame(0, 0);
        assert.equal(treading.drawn, true);
        assert.ok(Math.abs(treading.ahead + E.lead) < 1e-9 && Math.abs(treading.out - (0.32 + E.lead)) < 1e-9, 'in front of the face by the lead: ' + treading.ahead.toFixed(3));
        // The stroke begins: the pose runs from upright into the crawl. Never a frame with the head in front of the eye.
        let hiddenAt = null;
        for (let i = 1; i <= 20; i++) { const f = frame(i / 20, 0); safe(f, 'into the crawl at ' + i / 20); if (!f.drawn && hiddenAt === null) hiddenAt = i / 20; }
        // In the crawl the head is past where any pose may carry the eye: the body is out of the picture, the eye stays close.
        const crawling = frame(1, 0);
        assert.equal(crawling.drawn, false, 'the crawl carries the head past the eye: the swimmer\'s own body is not drawn');
        assert.ok(Math.abs(crawling.out - E.most) < 1e-9 && hiddenAt !== null && hiddenAt < 1, 'from ' + hiddenAt + ' of the way into the pose');
        assert.ok(Math.abs(crawling.y - posed(1)[1]) < 1e-9, 'at the swimmer\'s own head height, down at the water');
        for (let i = 0; i < 30; i++) safe(frame(1, 0), 'crawling on');
        // Under the surface it is the same body in the same poses: a dive changes the height, not the rule.
        for (const share of [0, 0.5, 1]) { const f = frame(share, 0, 0, -6); safe(f, 'under water at ' + share); assert.ok(Math.abs(f.y - (posed(share)[1] - 6)) < 1e-9); }
        // The stroke ends: back upright. The body comes back only once the eye is in front of its face again.
        for (let i = 19; i >= 0; i--) safe(frame(i / 20, 0), 'out of the crawl at ' + i / 20);
        for (let i = 0; i < 60; i++) safe(frame(0, 0), 'settling');
        assert.equal(frame(0, 0).drawn, true, 'treading again: drawn');
        // Looking round while the body still faces the way it swam (the look turns faster than a swimmer does).
        for (const share of [0, 0.4, 1]) for (let turn = 0; turn < 360; turn += 30) {
            for (let i = 0; i < 4; i++) safe(frame(share, turn, 0), 'looking ' + turn + ' off the body at ' + share + ' of the crawl');
        }
    } finally { look.yaw = yawWas; global.$dataMap = mapWas; R.Camera.playerEyes.inside = false; }
});

test('a First Person battle in the water: the swimmer\'s own body is never drawn, treading, in the crawl or under the surface, and the map\'s own rule is back when the battle ends', () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const { fightWorld, event } = require('./helpers/fight-world.cjs');
    const { runtimeRoot } = require('./helpers/runtime-source.cjs');
    const w = fightWorld({ events: [event(1, 14, 9, { note: '<unit: enemy 1>' }), event(2, 10, 10, { note: '<unit: ally 2>' })] });
    w.THREE = THREE;
    w.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
    // A stand-in 3D world on a first-person map. Its own answer for a body is the map's: the player's model is in
    // the picture unless the eye is held inside it (`inside`), and nobody else is taken out.
    vm.runInContext(`
        $gameMap._reactorCamera3d = { mode: "firstPerson", pitch: null };
        Reactor3D = {
            isMap3D: () => true, shouldRender3D: () => true, groundHeightAt: () => 0, characterGround: () => 0, characterHeightTiles: () => 3,
            hasCharacterModel: () => false, viewport: () => ({ camera: () => camera }), cameraArmHit: false,
            inside: false, eyeOut: 0,
            characterHiddenByCamera(character, model) { return character === $gamePlayer && (!model || this.inside); },
            cameraArm(map, from, to, least) { this.cameraArmHit = false; return Math.max(least || 0, Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)); },
            Camera: {
                look: { yaw: 90, pitch: 0, locked: false },
                MODES: { thirdPerson: { pitch: 25, fov: 45, distance: 8 }, firstPerson: { pitch: 0, fov: 70 } },
                currentState: () => $gameMap._reactorCamera3d,
                normalizeState: state => Object.assign({ pitch: null }, state),
                requestLook() {}, releaseLook() {},
                update(spriteset) {
                    const live = spriteset._reactor3d, look = this.look, state = this.currentState(), yaw = look.yaw * Math.PI / 180;
                    const x = $gamePlayer._realX + 0.5 + Math.sin(yaw) * Reactor3D.eyeOut, z = $gamePlayer._realY + 0.5 - Math.cos(yaw) * Reactor3D.eyeOut, y = 1 - ($gamePlayer._reactorDive || 0);
                    live.cameraCurrent = { mode: state.mode, x: x - 0.5, y, z: z - 0.5, fov: this.MODES[state.mode].fov, pitch: 0, yaw: look.yaw };
                    live.camera.position.set(x, y, z);
                    live.camera.lookAt(x + Math.sin(yaw), y, z - Math.cos(yaw));
                    live.camera.updateMatrixWorld();
                    return true;
                }
            }
        };
    `, w);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_fight_action.js'), 'utf8'), w, { filename: 'reactor_fight_action.js' });
    w.spriteset = { _reactor3d: { camera: w.camera, cameraCurrent: null, scene: null } };
    const frame = (n = 1) => { for (let i = 0; i < n; i++) { w.run(1); w.Graphics.frameCount++; w.Reactor3D.Camera.update(w.spriteset); } };
    const player = w.$gamePlayer, hidden = (who, model = true) => w.Reactor3D.characterHiddenByCamera(who, model);
    player.locate(10, 9);
    frame(2);
    // On the map, in first person, the swimmer's body is drawn (the eye stands in front of its face: the test above).
    player._reactorSwim = true;
    assert.equal(hidden(player), false, 'on the map the model is in the picture');
    assert.ok(w.$gameFight.start({ mode: 'firstPerson' }) > 0);
    frame(3);
    const fight = w.$gameFight, A = w.ReactorFight.Action;
    for (const u of fight._units) if (u !== fight.playerUnit()) fight.act().ai[u.id] = Object.assign(A.aiOf(fight, fight.act(), u, fight.character(u)), { state: 'stagger', timer: 100000 });
    assert.ok(fight.isAction() && fight.isHere() && A.cameraMode() === 'firstPerson', 'a First Person battle on this map');
    // Treading water, in the crawl (the pose pitches the body forward: the head a tile ahead of the eye), going under and deep under.
    for (const [name, dive, pitch] of [['treading', 0, 0], ['in the crawl', 0, 75], ['going under', 0.4, 75], ['deep under', 6, 75], ['deep under, upright', 6, 0]]) {
        player._reactorSwim = true; player._reactorDive = dive; player._reactorPosePitch = pitch;
        frame(2);
        assert.equal(hidden(player), true, name + ': the player\'s own model is out of the picture');
        assert.equal(hidden(player, false), true, name + ': and its sprite');
    }
    // Wherever the eye is carried (a stroke's reach, a blow that throws the view): the body it looks out of is never in the picture.
    w.Reactor3D.eyeOut = 2.5;
    frame(2);
    assert.equal(hidden(player), true, 'the eye well out ahead of the swimmer: still not drawn');
    w.Reactor3D.eyeOut = 0;
    frame(2);
    // A friend swimming at the swimmer's shoulder would fill the view: out too. An opponent as near is still seen.
    const friend = fight.character(fight.unitOfEvent(2)), foe = fight.character(fight.unitOfEvent(1));
    friend._reactorSwim = true; friend.locate(10, 10);
    frame(1);
    assert.equal(hidden(friend), true, 'a friend inside the eye\'s room');
    foe.locate(11, 9);
    frame(1);
    assert.equal(hidden(foe), false, 'an opponent is never hidden for the eye\'s sake');
    friend.locate(10, 13);
    frame(1);
    assert.equal(hidden(friend), false, 'a friend three tiles off is seen');
    // The battle over, still in the water: the map's own rule answers again (the body back only in front of the eye).
    fight.end(w.ReactorFight.ESCAPE, true);
    frame(80);
    assert.equal(fight.isActive(), false);
    assert.equal(hidden(player), false, 'after the battle the map\'s rule decides: drawn');
    w.Reactor3D.inside = true;
    assert.equal(hidden(player), true, 'and out while the eye is held inside the head, as on land');
});
