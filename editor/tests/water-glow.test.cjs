// A water sheet's look: Glow is light (the sheet shines in its own colour and lights what stands round it through
// the light volume), every look value moves the picture smoothly, the editor and the game read a look through one
// function, a dive is the colour of the liquid, and the Build bar's Select finds water.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
const E = require(path.join(repoRoot, 'editor/src/utils/MapElevation.js'));

const steps = Array.from({ length: 101 }, (_, i) => i / 100);
/** Every value of a curve is no lower than the one before, it starts at `from`, and no step is larger than `most`. */
function smooth(values, name, most, from = 0) {
    assert.ok(Math.abs(values[0] - from) < 1e-9, `${name} starts at ${from} (got ${values[0]})`);
    let top = 0;
    for (let i = 1; i < values.length; i++) {
        assert.ok(values[i] >= values[i - 1] - 1e-12, `${name} never falls (at ${i / 100}: ${values[i - 1]} -> ${values[i]})`);
        top = Math.max(top, values[i] - values[i - 1]);
    }
    assert.ok(values[values.length - 1] > values[0], `${name} rises over the slider`);
    assert.ok(top <= most, `${name} has no jump (largest step for a hundredth of the slider: ${top.toFixed(4)}, allowed ${most})`);
}

/** A flat map with ground at 0 and one hollow sheet. */
function pondMap(sheets, W = 40, H = 30) {
    return { width: W, height: H, data: [], reactor3d: { version: 1, mode: '3d', water: sheets } };
}
const pond = (extra = {}) => Object.assign({ x0: 10, y0: 10, x1: 19, y1: 17, level: -0.2, material: 'Water' }, extra);

test('Glow moves everything it drives smoothly from nothing to full: no flat stretch, no threshold, no jump', () => {
    const at = glow => R.waterShade({ glow, colour: '#6c0ec7', clear: 0.8 });
    smooth(steps.map(g => at(g).emit), 'what the sheet shines', 0.016);
    smooth(steps.map(g => at(g).cover), 'how opaque the shine makes it', 0.021);
    smooth(steps.map(g => at(g).light), 'the light it gives the map', 0.03);
    smooth(steps.map(g => at(g).haze), 'the haze over it', 0.003);
    smooth(steps.map(g => Math.max(...at(g).fog.slice(0, 3))), 'the glow seen from inside', 0.01, Math.max(...at(0).fog.slice(0, 3)));
    // As drawn (through the screen's curve) the shine rises at every twentieth of the slider, the first included.
    const drawn = g => Math.round(255 * (at(g).emit <= 0.0031308 ? at(g).emit * 12.92 : 1.055 * Math.pow(at(g).emit, 1 / 2.4) - 0.055));
    for (let i = 1; i <= 20; i++) assert.ok(drawn(i / 20) >= drawn((i - 1) / 20) + 4, `a twentieth of the slider shows (${(i - 1) / 20} -> ${i / 20}: ${drawn((i - 1) / 20)} -> ${drawn(i / 20)})`);
    assert.equal(at(1).emit, R.WATER_SHINE, 'full, with room over it for the crests');
    // The shader takes the glow as it is: the old half-way switch is gone from the sheet and from its colour.
    assert.doesNotMatch(R.RIVER_SHADE_GLSL, />= 0\.5|rrSelf/);
    const world = read('runtime/reactor_3d_world.js');
    assert.doesNotMatch(world, /glow >= 0\.5/, 'no material flag flips half way up the slider');
});

test('a sheet shines in its own colour, kept saturated, over whatever light falls on it; its waves and foam still read', () => {
    for (const [colour, lead] of [['#6c0ec7', 2], ['#ff4a10', 0], ['#46c22c', 1], ['#18c8e8', 2]]) {
        const neon = R.waterShade({ glow: 1, colour }).neon;
        assert.equal(Math.max(...neon), 1, colour + ': its strongest channel at full');
        assert.equal(neon.indexOf(1), lead, colour + ': the hue it was given');
        assert.ok(Math.min(...neon) < 0.2, colour + ': not washed toward white');
    }
    const plain = R.waterShade({ glow: 1 }).neon;
    assert.ok(plain[2] === 1 && plain[1] < 0.5 && plain[0] < 0.2, 'plain water glows its own blue');
    const material = R.waterMaterial(null, { glow: 0.4, colour: '#6c0ec7' });
    assert.equal(material.__reactorSelfLit, undefined, 'the sheet is never switched out of the map\'s light');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(shader, null);
    assert.equal(shader.uniforms.rrSelfLit.value, 0, 'its colour and its reflections take the map\'s light (a night sky stays dark in it)');
    assert.equal(shader.uniforms.rrWaterGlow.value, material.userData.rrWaterGlow);
    assert.equal(material.userData.rrWaterGlow.w, R.WATER_SHINE * 0.4 * 0.4);
    const fragment = shader.fragmentShader;
    assert.match(fragment, /mix\(rrLight\(vRRWorldPos\), vec3\(1\.0\), rrSelfLit\)/);
    assert.ok(fragment.includes(R.WATER_SHINE_GLSL + '\n#include <opaque_fragment>') && R.WATER_SHINE_GLSL.startsWith('outgoingLight += rrWaterEmit;'), 'the shine is added after the map\'s light, so the night does not dim it');
    const emit = fragment.indexOf('rrWaterEmit = rrHeated * (rrWaterGlow.w');
    assert.ok(emit > 0 && emit < fragment.indexOf('outgoingLight += rrWaterEmit'), 'worked out with the sheet\'s colour');
    assert.ok(fragment.includes(R.WATER_GLOW_GLSL), 'by the glow\'s own rule (editor/tests/water-neon.test.cjs holds it to numbers)');
    assert.match(fragment, /rrShine \* rrByDay \* \(1\.0 - 0\.6 \* rrWhite\)/, 'paler where it foams: the foam reads');
    assert.match(fragment, /diffuseColor\.a = max\(diffuseColor\.a, rrWaterForm\.w \* smoothstep\(0\.0, 0\.3, vRRDepth\) \* vRREdge\)/, 'seen over the shallows, gone at the shore');
});

test('the editor and the game read a look through one function: a slider writes what a freshly laid sheet holds', () => {
    const looks = [{}, { glow: 0.07 }, { glow: 0.5, colour: '#6c0ec7', clear: 0.8, reflect: 0.71, gloss: 0.85, tint: '#ffffff' },
        { glow: 1, colour: '#ff4a10', clear: 0, waves: 0.3 }, { glow: 0.33, colour: '#46c22c', clear: 0.2, waves: 0.5, reflect: 0.25, tint: '#d6ffc4' }];
    const values = material => { const d = material.userData; return JSON.stringify([d.rrWaterLook.toArray(), d.rrWaterTint.toArray(), d.rrWaterColour.toArray(), d.rrWaterForm.toArray(), d.rrWaterGlow.toArray(), d.rrWaterFog.toArray(), d.rrWaterHaze.colour.value.toArray(), d.rrWaterHaze.strength.value]); };
    const standing = R.waterMaterial(null, { glow: 0.9, colour: '#112233', clear: 0.1, reflect: 1 });
    for (const look of looks) {
        R.applyWaterLook(standing, look);
        assert.equal(values(standing), values(R.waterMaterial(null, look)), 'the same uniforms for ' + JSON.stringify(look));
    }
    const view = read('editor/src/MapEditor3D.js');
    const restyle = view.slice(view.indexOf('    restyleWater(key, look) {'), view.indexOf('    /** A translucent ghost of a sheet'));
    assert.match(restyle, /Reactor3D\.applyWaterLook\(mesh\.material, look\)/, 'a moving slider goes through the runtime\'s reading');
    assert.match(restyle, /this\.requestRender\?\.\(\)/, 'and asks the view to draw (it does not draw from the input handler)');
    assert.doesNotMatch(restyle, /this\.render\(/);
    // What is stored is what was set: a small glow is kept, and nothing rounds it on the way to the game.
    const map = pondMap([pond()]);
    for (const glow of [0.01, 0.05, 0.37, 0.5, 1]) {
        assert.ok(E.styleWaterRegion(map, E.water(map)[0], { reflect: 0, clear: 0.6, waves: 1, glow }));
        assert.equal(map.reactor3d.water[0].glow, glow);
        assert.equal(R.normalizeWater(map.reactor3d.water[0], map).glow, glow);
    }
    assert.ok(E.styleWaterRegion(map, E.water(map)[0], { reflect: 0, clear: 0.6, waves: 1, glow: 0 }));
    assert.equal('glow' in map.reactor3d.water[0], false, 'no glow is water\'s own, left unwritten');
});

test('Clarity thins the surface with no corner and no dead stretch: every tenth of the slider shows over the shallows', () => {
    const rule = [
        "\tfloat rrClearX = rrWaterForm.x / 0.6, rrClearOver = max(rrClearX - 1.0, 0.0) * 1.5;",
        "\tfloat rrThrough = (1.0 - rrOpacity) * rrClearX;",
        "\trrThrough += (1.0 - rrThrough) * 0.25 * rrClearOver * rrClearOver;",
        "\trrOpacity = 1.0 - clamp(rrThrough, 0.0, 1.0);"
    ].join('\n');
    assert.ok(R.RIVER_SHADE_GLSL.includes("\tfloat rrOpacity = mix(0.32, 0.95, rrDeepness);\n" + rule + "\n\trrOpacity = max(rrOpacity, max(min(rrFresnel, 0.85), max(rrWhite, min(rrGlint, 1.0))));"), 'the rule the numbers below are worked from');
    assert.doesNotMatch(R.RIVER_SHADE_GLSL, /rrClear > 1\.0|pow\(0\.6 \/ max\(rrWaterForm\.x/, 'no two-part rule meeting at water\'s own clarity, no power that leaves the low end dead');
    // The same rule in numbers: `own` is how opaque water of water's own clarity is there (0.32 at the shore, 0.95 over the deep).
    const opacity = (own, clear) => {
        const x = clear / 0.6, over = Math.max(x - 1, 0) * 1.5;
        let through = (1 - own) * x;
        through += (1 - through) * 0.25 * over * over;
        return 1 - Math.max(0, Math.min(1, through));
    };
    for (const own of [0.32, 0.5, 0.7, 0.95]) {
        assert.ok(Math.abs(opacity(own, 0.6) - own) < 1e-12, 'water\'s own clarity leaves water as it was');
        assert.equal(opacity(own, 0), 1, 'no clarity is opaque (tar, lava)');
        const curve = steps.map(c => -opacity(own, c));
        for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1] - 1e-12, 'clearer is never more opaque');
        // The slope either side of 0.6 is the same slope: no corner there.
        const before = opacity(own, 0.599) - opacity(own, 0.6), after = opacity(own, 0.6) - opacity(own, 0.601);
        assert.ok(Math.abs(before - after) < 0.05 * Math.max(before, after), `no corner at water's own clarity (${before.toFixed(6)} against ${after.toFixed(6)})`);
    }
    // Over the shallows (a pond, a fountain two thirds of a tile deep) each tenth of the slider is seen, the lowest
    // included, until the surface is clear through.
    for (const own of [0.32, 0.5, 0.7]) for (let i = 0; i < 10; i++) {
        const step = opacity(own, i / 10) - opacity(own, (i + 1) / 10);
        assert.ok(step >= 0.045 || opacity(own, (i + 1) / 10) === 0, `clarity ${i / 10} -> ${(i + 1) / 10} shows where water is ${own} opaque (${step.toFixed(3)})`);
    }
    // Below water's own clarity the steps are equal: a straight line from opaque.
    for (const own of [0.5, 0.7]) for (let i = 1; i <= 6; i++) assert.ok(Math.abs(opacity(own, i / 10) - (1 - (1 - own) * (i / 10) / 0.6)) < 1e-9);
    // Deep water lets little through at any clarity up to water's own, and opens past it.
    assert.ok(opacity(0.95, 0.6) - opacity(0.95, 1) > 0.2, 'the deep opens toward full clarity: ' + opacity(0.95, 1).toFixed(3));
    // And the water seen through thins the same way.
    const density = steps.map(c => -R.waterShade({ clear: c }).fog[3]);
    for (let i = 1; i < density.length; i++) assert.ok(density[i] > density[i - 1], 'clearer water fades things more slowly');
    assert.equal(R.waterShade({ clear: 0.6 }).fog[3], 0.22);
});

test('a dive is the colour of the liquid: each sheet carries its own colour and thickness into the water volume', () => {
    assert.deepEqual(R.waterShade({}).fog, [0.02, 0.13, 0.2, 0.22], 'plain water keeps the blue-green it had');
    const purple = R.waterShade({ colour: '#6c0ec7' }).fog, lava = R.waterShade({ colour: '#ff4a10', glow: 1, clear: 0 }).fog, slime = R.waterShade({ colour: '#46c22c', clear: 0.2 }).fog;
    assert.ok(purple[2] > purple[0] && purple[0] > purple[1] * 4, 'a purple lake is purple inside, not blue-green: ' + purple);
    assert.ok(lava[0] > 0.8 && lava[0] > lava[1] * 5 && lava[1] > lava[2], 'lava is bright orange inside, lit by its own glow: ' + lava);
    assert.ok(slime[1] > slime[0] * 3 && slime[1] > slime[2] * 3, 'slime is green inside: ' + slime);
    assert.ok(lava[3] > slime[3] && slime[3] > 0.22, 'the less clear, the sooner things are lost in it');
    // The scene's volumes carry each sheet's fog, live from the sheet's material, into one flat array.
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    const map = pondMap([pond({ colour: '#6c0ec7' }), pond({ x0: 22, x1: 30, level: -0.4 })]);
    scene.addWater(map, () => null);
    scene.noteWaterVolume(null);
    const volumes = scene._scene.userData.rrWater;
    assert.equal(volumes.length, 2);
    assert.equal(volumes[0].fog, scene._waterMeshes[0].material.userData.rrWaterFog);
    R.useSceneWater(scene._scene);
    const sent = R.waterVolumeUniforms().rrWaterFog.value;
    assert.ok(sent instanceof Float32Array && sent.length === 16, 'one flat array (a frame that changes nothing sends nothing)');
    assert.ok(sent[2] > sent[0] && sent[0] > sent[1], 'the first sheet is purple');
    assert.deepEqual(Array.from(sent.slice(4, 8)), Array.from(new Float32Array([0.02, 0.13, 0.2, 0.22])), 'the second is plain water');
    // A look changed while the sheet stands shows inside it at once.
    R.applyWaterLook(scene._waterMeshes[0].material, { colour: '#46c22c' });
    R.useSceneWater(scene._scene);
    assert.ok(sent[1] > sent[0] && sent[1] > sent[2], 'now green');
    const glsl = R.WATER_VOLUME_GLSL;
    assert.match(glsl, /uniform vec4 rrWaterFog\[4\];/);
    assert.doesNotMatch(glsl, /rrWaterColor|rrWaterDensity/, 'no one colour for every sheet');
    assert.match(glsl, /color = mix\(color, rrFog\.rgb, 1\.0 - exp\(-length\(B - A\) \* span \* rrFog\.a\)\);/, 'each sheet fades by its own thickness');
});

/** The shader's rule for the water seen through, as WATER_VOLUME_GLSL states it (the test below holds the two to each other). */
const WATER_TINT_RULE = [
    "vec3 rrWaterTint(vec3 color) {",
    "	if (rrWaterCount == 0) return color;",
    "	vec3 P = vRRWaterPos, C = cameraPosition;",
    "	for (int i = 0; i < 4; i++) {",
    "		if (i >= rrWaterCount) break;",
    "		float yc = C.y - rrWaterLevel[i], yp = P.y - rrWaterLevel[i];",
    "		if (yc >= 0.0 && yp >= 0.0) continue;",
    "		vec3 A = C, B = P;",
    "		if (yc >= 0.0) A = mix(C, P, yc / (yc - yp));",
    "		else if (yp >= 0.0) B = mix(C, P, yc / (yc - yp));",
    "		vec4 b = rrWaterBox[i];",
    "		vec2 d = B.xz - A.xz;",
    "		d = mix(d, vec2(1e-5), step(abs(d), vec2(1e-5)));",
    "		vec2 lo = (b.xy - A.xz) / d, hi = (b.zw - A.xz) / d;",
    "		vec2 rrIn = min(lo, hi), rrOut = max(lo, hi);",
    "		float span = min(min(rrOut.x, rrOut.y), 1.0) - max(max(rrIn.x, rrIn.y), 0.0);",
    "		if (span <= 0.0) continue;",
    "		vec4 rrFog = rrWaterFog[i];",
    "		color = mix(color, rrFog.rgb, 1.0 - exp(-length(B - A) * span * rrFog.a));",
    "	}",
    "	return color;",
    "}"
].join("\n");

/** That rule in numbers, on the uniforms useSceneWater loaded: `C` the eye, `P` the point seen, `color` what is drawn there. */
function waterTint(color, P, C) {
    const u = R.waterVolumeUniforms(), count = u.rrWaterCount.value;
    let out = color.slice();
    const along = s => C.map((c, k) => c + (P[k] - c) * s);
    for (let i = 0; i < 4; i++) {
        if (i >= count) break;
        const yc = C[1] - u.rrWaterLevel.value[i], yp = P[1] - u.rrWaterLevel.value[i];
        if (yc >= 0 && yp >= 0) continue;
        let A = C, B = P;
        if (yc >= 0) A = along(yc / (yc - yp));
        else if (yp >= 0) B = along(yc / (yc - yp));
        const b = u.rrWaterBox.value[i].toArray();
        const d = [B[0] - A[0], B[2] - A[2]].map(v => (Math.abs(v) <= 1e-5 ? 1e-5 : v));
        const lo = [(b[0] - A[0]) / d[0], (b[1] - A[2]) / d[1]], hi = [(b[2] - A[0]) / d[0], (b[3] - A[2]) / d[1]];
        const span = Math.min(Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), 1) - Math.max(Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), 0);
        if (span <= 0) continue;
        const fog = Array.from(u.rrWaterFog.value.slice(i * 4, i * 4 + 4));
        const t = 1 - Math.exp(-Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * span * fog[3]);
        out = out.map((v, k) => v + (fog[k] - v) * t);
    }
    return out;
}

/** What a diver at `eye` sees of a grey thing at `point` on a map of `sheets`: linear r, g, b. */
function diveView(sheets, eye, point, size = 48) {
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    scene.addWater(pondMap(sheets, size, size), () => null);
    scene.noteWaterVolume(null);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(eye[0], eye[1], eye[2]);
    R.useSceneWater(scene._scene, camera);
    return waterTint([0.2, 0.2, 0.2], point, eye);
}

test('where two sheets meet, a dive is the colour of the sheet the eye is in, whatever order the map lists them in', () => {
    // The lines between `vec3 rrWaterTint` and the end are the rule the numbers below are worked from.
    const glsl = R.WATER_VOLUME_GLSL.split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
    assert.equal(glsl.slice(glsl.indexOf('vec3 rrWaterTint(vec3 color) {')), WATER_TINT_RULE);
    // (The uniforms hold single-precision numbers.)
    const near = (a, b, text) => a.forEach((v, k) => assert.ok(Math.abs(v - b[k]) < 1e-6, `${text}: ${a.map(n => n.toFixed(4))} against ${b.map(n => n.toFixed(4))}`));
    const green = c => c[1] > c[0] * 1.5 && c[1] > c[2] * 1.5, purple = c => c[2] > c[1] * 1.5 && c[2] > c[0];

    // A purple lake shaped like an L (its mask leaves the south-east of its box dry) and a green pond in that dry
    // corner, at the same level: the lake's box holds the pond.
    let mask = '';
    for (let y = 5; y <= 30; y++) for (let x = 5; x <= 30; x++) mask += (x <= 15 || y <= 15) ? '1' : '0';
    const lake = { x0: 5, y0: 5, x1: 30, y1: 30, level: -0.2, material: 'Water', mask, colour: '#6c0ec7' };
    const small = { x0: 22, y0: 22, x1: 27, y1: 27, level: -0.2, material: 'Water', colour: '#46c22c' };
    const inPond = [[24.5, -1.5, 24.5], [26.5, -1.5, 26.5]], inLake = [[10.5, -1.5, 10.5], [10.5, -1.5, 20.5]];
    const pondAlone = diveView([small], ...inPond), lakeAlone = diveView([lake], ...inLake);
    assert.ok(green(pondAlone) && purple(lakeAlone));
    for (const [order, sheets] of [['the lake listed first', [lake, small]], ['the pond listed first', [small, lake]]]) {
        near(diveView(sheets, ...inPond), pondAlone, 'a dive in the pond is the pond\'s green, none of the lake\'s whose box holds it (' + order + ')');
        near(diveView(sheets, ...inLake), lakeAlone, 'a dive in the lake is the lake\'s purple (' + order + ')');
    }
    // Seen from above no sheet holds the eye and none is left out: where the lake's box and the pond both claim
    // the water over the pond's bed, the smaller box is laid over the larger, in either order of the list.
    const bedOf = sheets => diveView(sheets, [24.5, 6, 24.5], [24.5, -3, 24.6]);
    near(bedOf([lake, small]), bedOf([small, lake]), 'the pond\'s bed from above is one colour in either order');
    assert.ok(bedOf([lake, small])[1] > bedOf([lake, small])[2] * 1.2, 'and the pond\'s green leads it: ' + bedOf([lake, small]).map(v => v.toFixed(3)));
    for (const sheets of [[lake, small], [small, lake]]) near(diveView(sheets, [10.5, 6, 10.5], [10.5, -3, 10.6]), diveView([lake], [10.5, 6, 10.5], [10.5, -3, 10.6]), 'the lake\'s bed from above is the lake\'s alone');

    // Two sheets over the same cells (a pool set in a lake): the higher surface is the one the eye went through.
    const low = pond({ x0: 15, x1: 25, level: -0.5, colour: '#46c22c' }), high = pond({ colour: '#6c0ec7' });
    for (const sheets of [[low, high], [high, low]]) {
        const scene = Object.create(R.MapScene.prototype);
        scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
        scene.addWater(pondMap(sheets), () => null);
        scene.noteWaterVolume(null);
        const camera = new THREE.PerspectiveCamera();
        const fogs = R.waterVolumeUniforms().rrWaterFog.value;
        const last = () => { const n = R.waterVolumeUniforms().rrWaterCount.value; return Array.from(fogs.slice((n - 1) * 4, n * 4 - 1)); };
        camera.position.set(17.5, -1.5, 13.5);
        R.useSceneWater(scene._scene, camera);
        assert.ok(purple(last()), 'under both, the eye is in the higher sheet');
        assert.equal(R.waterVolumeUniforms().rrWaterCount.value, 1, 'and in that one alone: what is round the eye is one colour');
        camera.position.set(22.5, -1.5, 13.5);
        R.useSceneWater(scene._scene, camera);
        assert.ok(green(last()), 'under the lower one alone, that one');
        assert.equal(R.waterVolumeUniforms().rrWaterCount.value, 2, 'the other, beside it, is still seen through');
        camera.position.set(17.5, -0.3, 13.5);
        R.useSceneWater(scene._scene, camera);
        assert.ok(purple(last()), 'between the two surfaces the eye is in the higher sheet only');
        assert.equal(R.waterVolumeUniforms().rrWaterCount.value, 2, 'with the lower sheet under it');
    }

    // A green river running into a purple lake. Its last stretch's box reaches past its water into the lake.
    const river = { x0: 2, y0: 13, x1: 24, y1: 15, material: 'Water', colour: '#46c22c', path: [[2, 14.5, 1], [14, 14.5, 0], [24, 14.5, -1.05]] };
    const basin = { x0: 20, y0: 5, x1: 39, y1: 24, level: -1, material: 'Water', colour: '#6c0ec7' };
    const map = pondMap([river, basin], 48, 48), regions = R.waterOf(map);
    assert.equal(R.waterCovers(regions[0], 25, 14), false, 'a lake cell the river does not cover');
    const besideMouth = [[25.5, -2.5, 14.5], [36.5, -2.5, 20.5]], upstream = [[8.5, -0.4, 14.5], [3.5, 0.2, 14.5]];
    const basinAlone = diveView([basin], ...besideMouth), riverAlone = diveView([river], ...upstream);
    for (const [order, sheets] of [['the river listed first', [river, basin]], ['the lake listed first', [basin, river]]]) {
        near(diveView(sheets, ...besideMouth), basinAlone, 'in the lake beside the river\'s mouth the water is the lake\'s, with no green in it (' + order + ')');
        near(diveView(sheets, ...upstream), riverAlone, 'in the river the water is the river\'s (' + order + ')');
        // In the mouth itself, where both sheets cover the cell, the eye is in the one whose surface is higher there,
        // and what is near (the swimmer, the bed) is that one colour, not a second colour laid under it.
        for (const x of [22, 24]) {
            const riverHigher = R.riverCellLevel(regions[0], x, 14) > basin.level;
            assert.ok(R.waterCovers(regions[0], x, 14) && R.waterCovers(regions[1], x, 14), 'both cover ' + x + ',14');
            const eye = [x + 0.5, -2.5, 14.5], near2 = [x + 0.5, -2.5, 15.9];
            near(diveView(sheets, eye, near2), diveView([riverHigher ? river : basin], eye, near2), 'in the mouth at ' + x + ' the water round the eye is the ' + (riverHigher ? 'river' : 'lake') + '\'s alone (' + order + ')');
        }
        // Looking from the lake up the river's mouth: the river's water is seen through the lake's, which stays the colour nearest the eye.
        const intoMouth = diveView(sheets, [30.5, -2.5, 14.5], [21.5, -2.5, 14.5]);
        assert.ok(intoMouth[2] > intoMouth[1], 'purple over green looking into the mouth (' + order + '): ' + intoMouth.map(v => v.toFixed(3)));
        near(intoMouth, diveView(sheets.slice().reverse(), [30.5, -2.5, 14.5], [21.5, -2.5, 14.5]), 'the same in either order');
    }
    // The draw of a scene hands its own camera over: each pass (the view, a mirror's eye) orders the water for its own eye.
    {
        const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), seen = [];
        const load = R.useSceneWater, draw = R.DepthFirst.draw;
        R.useSceneWater = function(given, eye) { seen.push(given === scene && eye === camera); };
        R.DepthFirst.draw = () => null;
        try { R._renderScene({ info: { programs: [] }, getRenderTarget: () => null, domElement: { height: 720 } }, scene, camera); } finally { R.useSceneWater = load; R.DepthFirst.draw = draw; }
        assert.deepEqual(seen, [true]);
    }
    // One sheet, as ever: the whole stretch under water fades, from inside and from above.
    const plain = diveView([pond()], [14.5, -1.5, 13.5], [18.5, -1.5, 13.5]);
    const t = 1 - Math.exp(-4 * 0.22);
    near(plain, [0.2 + (0.02 - 0.2) * t, 0.2 + (0.13 - 0.2) * t, 0.2 + (0.2 - 0.2) * t], 'plain water over four tiles');
    // Past the sheet's box nothing of it lies on the line of sight: land lower than a lake, beyond its bank, is not tinted.
    // (The line goes under the level at x = 25.5; the box ends at 20.)
    near(diveView([pond()], [14.5, 6, 13.5], [30.5, -3, 13.5]), [0.2, 0.2, 0.2], 'dry low ground beyond the water');
});

test('glowing water is light in the map\'s light volume: one picture of the map, coloured, falling off with distance', () => {
    const W = R.WaterLight;
    assert.equal(W.describe(pondMap([pond()])), null, 'water that does not glow gives no light');
    const map = pondMap([pond({ glow: 1, colour: '#6c0ec7' })]);
    const info = W.describe(map);
    assert.equal(info.sheets.length, 1);
    const field = W.build(map, info);
    const at = (x, y) => Array.from(field.slice((y * map.width + x) * 4, (y * map.width + x) * 4 + 4));
    const inside = at(14, 13), shore = at(9, 13), near = at(7, 13), far = at(4, 13), beyond = at(0, 0);
    assert.ok(inside[2] > 0.9, 'strongest over the water: ' + inside);
    assert.ok(inside[2] > inside[0] * 3 && inside[0] > inside[1] * 10, 'in the sheet\'s colour');
    assert.ok(shore[2] > 0.4 && shore[2] < inside[2], 'strong on the bank at the water\'s edge: ' + shore[2]);
    // A lake gives more light than a pond: well inside a wide sheet the light is whole, and its shore takes half the water round it.
    const lake = pondMap([pond({ glow: 1, x0: 20, y0: 20, x1: 79, y1: 79 })], 100, 100), wide = W.build(lake, W.describe(lake));
    assert.ok(Math.abs(wide[(50 * 100 + 50) * 4 + 2] - R.WATER_LIGHT) < 1e-3, 'whole in the middle of a lake');
    assert.ok(wide[(50 * 100 + 19) * 4 + 2] > shore[2], 'a lake\'s bank is brighter than a pond\'s');
    assert.ok(near[2] < shore[2] && far[2] < near[2] && far[2] > 0, 'less with distance: ' + [shore[2], near[2], far[2]]);
    assert.deepEqual(beyond.slice(0, 3), [0, 0, 0], 'nothing past its reach');
    assert.ok(Math.abs(shore[3] - -0.2) < 1e-4 && Math.abs(far[3] - -0.2) < 1e-4, 'with the water\'s height beside it');
    // Along a line out from the shore the light only ever falls.
    for (let x = 14; x > 0; x--) assert.ok(at(x - 1, 13)[2] <= at(x, 13)[2] + 1e-9, 'falling at ' + x);
    // The light on the bank follows the slider smoothly, from nothing.
    const bank = steps.map(glow => { const m = pondMap([pond({ glow, colour: '#6c0ec7' })]), i = W.describe(m); return i ? W.build(m, i)[(13 * m.width + 8) * 4 + 2] : 0; });
    smooth(bank, 'the light on the bank', 0.02);
    assert.ok(bank[100] > 0.4, 'strong at full: ' + bank[100]);
    // In step with the slider: about a fifth of the full light at a third (a faint tint), under half at a half,
    // and no part of the slider holding most of it.
    const share = at => bank[at] / bank[100];
    assert.ok(share(30) > 0.15 && share(30) < 0.3, 'a faint tint at a third: ' + share(30).toFixed(3));
    assert.ok(share(50) > 0.3 && share(50) < 0.5, 'at a half: ' + share(50).toFixed(3));
    assert.ok(share(10) > 0.04, 'seen from the first tenth: ' + share(10).toFixed(3));
    for (let i = 0; i < 10; i++) assert.ok(share(i * 10 + 10) - share(i * 10) < 0.16, 'no tenth of the slider has more than a sixth of the light: ' + i / 10);
    // A faint glow stays closer to its water than a strong one.
    const reach = glow => { const m = pondMap([pond({ glow })]), f = W.build(m, W.describe(m)); const edge = f[(13 * m.width + 9) * 4 + 2]; let d = 0; while (9 - d > 0 && f[(13 * m.width + 9 - d) * 4 + 2] > edge * 0.1) d++; return d; };
    assert.ok(reach(1) > reach(0.2), 'the reach grows with the glow: ' + reach(0.2) + ' -> ' + reach(1));
    // A thin sheet lights its rim about as a lake lights its bank, but only a few tiles out: a well, a crack
    // of lava and a stream are not lost under the lake's wide spread.
    const beside = (box, dx) => { const m = pondMap([Object.assign({ level: 0, material: 'Water', glow: 1, colour: '#0000ff' }, box)], 80, 60), f = W.build(m, W.describe(m)); return f[(Math.floor((box.y0 + box.y1) / 2) * m.width + box.x0 - dx) * 4 + 2]; };
    const well = { x0: 30, y0: 30, x1: 30, y1: 30 }, crack = { x0: 30, y0: 30, x1: 31, y1: 31 }, stream = { x0: 30, y0: 2, x1: 30, y1: 57 }, fountain = { x0: 30, y0: 30, x1: 35, y1: 35 };
    for (const [name, box] of [['a one-tile well', well], ['a two-tile pool', crack], ['a stream one tile wide', stream], ['a fountain', fountain]]) {
        assert.ok(beside(box, 1) > 0.5 && beside(box, 1) < 0.84, name + ' lights the cell beside it: ' + beside(box, 1).toFixed(3));
        assert.ok(beside(box, 2) < beside(box, 1) && beside(box, 3) < beside(box, 2), name + ': less with distance');
    }
    assert.equal(beside(well, 4), 0, 'a well\'s light ends a few tiles out');
    assert.ok(beside(fountain, 6) > 0.05 && beside(stream, 9) === 0, 'the reach goes with the size');
    assert.deepEqual([W.spread(R.waterOf(pondMap([Object.assign({ level: 0 }, well)], 80, 60))[0], { width: 80, height: 60 }).reach, W.spread(R.waterOf(pondMap([Object.assign({ level: 0 }, stream)], 80, 60))[0], { width: 80, height: 60 }).reach,
        W.spread(R.waterOf(pondMap([Object.assign({ level: 0 }, fountain)], 80, 60))[0], { width: 80, height: 60 }).reach], [1, 2, 3]);
    // Two sheets of two colours each give their own, and add where they meet.
    const two = pondMap([pond({ glow: 1, colour: '#ff0000', x0: 4, x1: 9 }), pond({ glow: 1, colour: '#0000ff', x0: 16, x1: 21 })]);
    const both = W.build(two, W.describe(two)), mid = Array.from(both.slice((13 * two.width + 12) * 4, (13 * two.width + 12) * 4 + 3));
    assert.ok(mid[0] > 0.05 && mid[2] > 0.05 && mid[1] === 0, 'red from one side, blue from the other: ' + mid);
    // A river's light lies at the river's own height where it runs.
    const river = pondMap([{ x0: 2, y0: 2, x1: 30, y1: 6, material: 'Water', glow: 1, path: [[2, 4.5, 6], [16, 4.5, 3], [30, 4.5, 0]] }]);
    const run = W.build(river, W.describe(river));
    assert.ok(run[(4 * river.width + 4) * 4 + 3] > run[(4 * river.width + 27) * 4 + 3] + 3, 'high upstream, low downstream');
    // Never more sheets than the cap, the brightest first.
    const many = pondMap(Array.from({ length: 40 }, (_, i) => pond({ x0: i, x1: i, y0: 1, y1: 1, glow: 0.2 + (i % 5) * 0.2 })));
    const capped = W.describe(many);
    assert.equal(capped.sheets.length, W.MAX_SHEETS);
    assert.equal(capped.sheets[0].region.glow, 1);
});

test('the water\'s light is baked with the still lights, again only when a look, a shape or a level changes', () => {
    const W = R.WaterLight, V = R.LightVolume;
    const map = pondMap([pond({ glow: 0.5, colour: '#6c0ec7' })]);
    const first = W.describe(map);
    assert.equal(W.describe(map), first, 'one reading per stored list: a frame asks for nothing');
    // The list written again with the same light (another sheet's waves changed): the same signature, no bake.
    map.reactor3d.water = [Object.assign({}, map.reactor3d.water[0], { waves: 0.4 })];
    assert.equal(W.describe(map).signature, first.signature);
    for (const change of [{ glow: 0.6 }, { colour: '#00ff00' }, { level: -0.5 }, { x1: 20 }]) {
        const before = W.describe(map).signature;
        map.reactor3d.water = [Object.assign({}, map.reactor3d.water[0], change)];
        assert.notEqual(W.describe(map).signature, before, 'a change of ' + Object.keys(change)[0] + ' is a new light');
    }
    // The bake reads the picture in the still lights' pass only.
    for (const shadows of [true, false]) {
        const fragment = V.bakeMaterial(shadows).material.fragmentShader;
        assert.match(fragment, /vec3 rrBakeWaterLight\(vec3 p\)/);
        assert.match(fragment, /if \(rrBakeMode == 0 && rrBakeWaterEdge > 0\.0\) s \+= rrBakeWaterLight\(p\);/);
        assert.match(fragment, /texture2D\(rrBakeWater, p\.xz \* rrBakeWaterMap\.xy\)/, 'one texel a voxel, however many sheets glow');
    }
    // The volume holds water's light on a map with no lamp at all, and a slider dragged does not start the bake again every frame.
    const u = V.uniforms(), renders = [];
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render: scene => renders.push(scene), autoClear: true, compileAsync: null, extensions: { has: () => false }, resetState() {} };
    const saved = { supported: V._supported, scene: V._scene, generation: V._generation, front: V._front, back: V._back, dynamic: V.dynamicEnabled, focus: R.Shadows.focus };
    V._records.clear(); V._front = V._back = null; V._supported = true; V._scene = 'map'; V._generation = R.contextGeneration; V.dynamicEnabled = false; R.Shadows.focus = null;
    try {
        const glowing = pondMap([pond({ glow: 0.5, colour: '#6c0ec7' })]);
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        const back = V._back;
        assert.ok(back && back.water, 'a bake begins for the water alone');
        assert.equal(V.baking(), true, 'the editor keeps drawing until it is done');
        // Until the volume shows, and wherever it will not reach, the lit shader reads the water's picture (loadFar, each frame).
        assert.equal(u.rrWaterFarEdge.value, W.EDGE);
        assert.ok(u.rrWaterFarBox.value[0] > u.rrWaterFarBox.value[2], 'no volume shown yet: the picture has it all');
        const bake = V.bakeMaterial(false).uniforms;
        assert.equal(bake.rrBakeWaterEdge.value, W.EDGE);
        assert.ok(bake.rrBakeWater.value && bake.rrBakeWater.value.isDataTexture);
        assert.deepEqual(Array.from(bake.rrBakeWaterMap.value), [1 / 40, 1 / 30, W.ABOVE, W.BELOW].map(Math.fround));
        assert.ok(W.ABOVE >= 12, 'the slopes of a basin and the roof of a cave are in its reach');
        assert.ok(bake.rrBakeWaterBox.value[0] < -1e5 && bake.rrBakeWaterBox.value[2] > 1e5, 'the volume holds the whole map: no fade at its edge');
        // The slider moves on the next frames: the bake under way is let finish.
        glowing.reactor3d.water = [pond({ glow: 0.55, colour: '#6c0ec7' })];
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        glowing.reactor3d.water = [pond({ glow: 0.6, colour: '#6c0ec7' })];
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        assert.equal(V._back, back, 'not started again while the look keeps changing');
        for (let i = 0; i < 20 && V._front !== back; i++) V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        assert.equal(V._front, back, 'it finishes and shows');
        assert.equal(u.rrVolumeOn.value, 1);
        assert.ok(u.rrWaterFarBox.value[0] < -1e5 && u.rrWaterFarBox.value[2] > 1e5, 'the volume shown holds the whole map: nothing is left for the picture');
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        assert.ok(V._back && V._back !== back && V._back.water.sheets[0].region.glow === 0.6, 'then the newest look is baked');
        for (let i = 0; i < 20 && V._back; i++) V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        const settled = V._front, count = renders.length;
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        assert.equal(V._front, settled);
        assert.equal(V._back, null);
        assert.equal(renders.length, count, 'nothing is baked while nothing changes');
        // The glow turned off on a map with no lamps: the volume goes with it.
        glowing.reactor3d.water = [pond()];
        V.frame(renderer, 'map', glowing, { x: 14, y: 13 });
        assert.equal(u.rrVolumeOn.value, 0);
        assert.equal(u.rrWaterFarEdge.value, 0, 'and the picture is read no more');
        // A volume taken down (another scene) leaves no water light behind it.
        u.rrWaterFarEdge.value = W.EDGE;
        V.reset();
        assert.equal(u.rrWaterFarEdge.value, 0);
    } finally {
        V.dispose(V._front); V.dispose(V._back);
        V._supported = saved.supported; V._scene = saved.scene; V._generation = saved.generation; V._front = saved.front; V._back = saved.back; V.dynamicEnabled = saved.dynamic; R.Shadows.focus = saved.focus;
        u.rrVolumeOn.value = 0;
    }
});

test('the far banks of a glowing lake are lit: where the volume does not hold the water\'s light the lit shader reads the water\'s own picture', () => {
    const W = R.WaterLight, V = R.LightVolume, u = V.uniforms();
    // The lit shader: one more lookup, only where the volume's share is not whole, with the bake's own falloff.
    const glsl = R.LightGrid.glsl(R.lightGlsl(false));
    assert.match(glsl, /uniform highp sampler2D rrWaterFar;\nuniform vec4 rrWaterFarMap;\nuniform vec4 rrWaterFarBox;\nuniform float rrWaterFarEdge;/);
    assert.match(glsl, /if \(rrWaterFarEdge > 0\.0\) \{\n\t\tfloat rrWB = 0\.0;\n\t\tif \(rrVolumeOn != 0\) \{/);
    assert.match(glsl, /rrWB = clamp\(1\.0 \+ min\(min\(rrVP0\.x - rrWaterFarBox\.x, rrWaterFarBox\.z - rrVP0\.x\), min\(rrVP0\.z - rrWaterFarBox\.y, rrWaterFarBox\.w - rrVP0\.z\)\) \/ rrWaterFarEdge, 0\.0, 1\.0\);/, 'the volume\'s share, as its bake faded it');
    assert.match(W.BAKE_GLSL, /float edge = min\(min\(p\.x - rrBakeWaterBox\.x, rrBakeWaterBox\.z - p\.x\), min\(p\.z - rrBakeWaterBox\.y, rrBakeWaterBox\.w - p\.z\)\);\n\treturn e\.rgb \* \(f \* clamp\(1\.0 \+ edge \/ rrBakeWaterEdge, 0\.0, 1\.0\)\);/, 'the same measure in the bake');
    assert.match(glsl, /if \(all\(greaterThanEqual\(rrWU, vec2\(0\.0\)\)\) && all\(lessThanEqual\(rrWU, vec2\(1\.0\)\)\)\) \{\n\t\t\tvec4 rrWL = textureLod\(rrWaterFar, rrWU, 0\.0\);/, 'read wherever water glows on the map (the sheen takes all of it), never past the map');
    assert.match(glsl, /rrWaterShone = rrWL\.rgb \* pow\(max\(0\.0, 1\.0 - \(rrWY >= 0\.0 \? rrWY \/ rrWaterFarMap\.z : -rrWY \/ rrWaterFarMap\.w\)\), 1\.5\);\n\t\t\tsum \+= rrWaterShone \* \(1\.0 - rrWB\);/, 'the share the volume does not hold joins the light, with the bake\'s falloff over and under the water');
    assert.match(W.BAKE_GLSL, /float f = pow\(max\(0\.0, 1\.0 - \(dy >= 0\.0 \? dy \/ rrBakeWaterMap\.z : -dy \/ rrBakeWaterMap\.w\)\), 1\.5\);/);
    assert.ok(glsl.indexOf('rrWaterFarEdge > 0.0') > glsl.indexOf('texture(rrVolumeStatic, rrQ)') && glsl.indexOf('rrWaterFarEdge > 0.0') < glsl.indexOf('rrDynOn != 0'), 'after the volume is read');

    const lakeMap = pondMap([pond({ glow: 1, colour: '#6c0ec7', x0: 20, y0: 20, x1: 109, y1: 80 })], 200, 200), info = W.describe(lakeMap);
    const region = { origin: [68, -4, 68], dims: [128, 64, 128] };
    const saved = { texture: W._texture, on: u.rrVolumeOn.value, edge: u.rrWaterFarEdge.value };
    // Each time the picture is made (not each time it is asked for).
    const built = [], build = W.build;
    W.build = function(map, given, out) { built.push(given.signature); return build.call(this, map, given, out); };
    try {
        W._texture = null;
        // No glow: off.
        u.rrVolumeOn.value = 0;
        W.loadFar(u, pondMap([pond()]), { _front: null, _back: null });
        assert.equal(u.rrWaterFarEdge.value, 0);
        assert.deepEqual(built, []);
        // The water glows and no volume is there to make the picture (none can be made on this renderer): it is made
        // here, and the light is read everywhere.
        W.loadFar(u, lakeMap, { _front: null, _back: null });
        assert.deepEqual(built, [info.signature]);
        assert.equal(u.rrWaterFarEdge.value, W.EDGE);
        assert.ok(u.rrWaterFar.value && u.rrWaterFar.value.isDataTexture && u.rrWaterFar.value === W._texture.texture);
        assert.deepEqual(Array.from(u.rrWaterFarMap.value), [1 / 200, 1 / 200, W.ABOVE, W.BELOW].map(Math.fround));
        assert.ok(u.rrWaterFarBox.value[0] > u.rrWaterFarBox.value[2], 'no box holds it: read everywhere');
        W.loadFar(u, lakeMap, { _front: null, _back: null });
        assert.equal(built.length, 1, 'made once: a frame that changes nothing makes nothing');
        // The volume shown holds the light: the far light begins where the bake faded it out.
        u.rrVolumeOn.value = 1;
        W.loadFar(u, lakeMap, { _front: { region, water: info }, _back: null });
        const bake = W.bakeUniforms();
        W.loadBake(bake, { water: info, waterMap: lakeMap, region });
        assert.deepEqual(Array.from(u.rrWaterFarBox.value), Array.from(bake.rrBakeWaterBox.value), 'the same box the bake fades from');
        assert.deepEqual(Array.from(u.rrWaterFarBox.value), [74, 74, 126, 126]);
        assert.equal(u.rrWaterFarEdge.value, bake.rrBakeWaterEdge.value);
        // The two shares along a line out through the volume's edge (the expressions above, in numbers): always one light.
        const share = (x, box, edge) => Math.max(0, Math.min(1, 1 + Math.min(x - box[0], box[2] - x, 100 - box[1], box[3] - 100) / edge));
        for (let x = 100; x <= 150; x += 0.5) {
            const inVolume = x <= 68 + 64, baked = inVolume ? share(x, bake.rrBakeWaterBox.value, bake.rrBakeWaterEdge.value) : 0;
            const far = 1 - (inVolume ? share(x, u.rrWaterFarBox.value, u.rrWaterFarEdge.value) : 0);
            assert.ok(Math.abs(baked + far - 1) < 1e-9, 'whole at ' + x);
            if (x <= 126) assert.equal(far, 0, 'inside, the volume has it all');
            if (x >= 132) assert.equal(far, 1, 'past the volume, the picture has it all');
        }
        // A volume shown that was baked before the water glowed, or set aside this frame: the picture has it all.
        W.loadFar(u, lakeMap, { _front: { region, water: null }, _back: null });
        assert.ok(u.rrWaterFarBox.value[0] > u.rrWaterFarBox.value[2]);
        u.rrVolumeOn.value = 0;
        W.loadFar(u, lakeMap, { _front: { region, water: info }, _back: null });
        assert.ok(u.rrWaterFarBox.value[0] > u.rrWaterFarBox.value[2]);
        // The look changes while a bake is under way: the bake keeps the picture it began with (it reads it over many frames).
        lakeMap.reactor3d.water = [Object.assign({}, lakeMap.reactor3d.water[0], { glow: 0.5 })];
        W.loadFar(u, lakeMap, { _front: null, _back: { water: info } });
        assert.equal(built.length, 1, 'not made again under a bake');
        assert.equal(u.rrWaterFarEdge.value, W.EDGE, 'and still read');
        W.loadFar(u, lakeMap, { _front: null, _back: null });
        assert.equal(built.length, 2, 'with no bake to make it, made here for the new look');
        // A preview lit by its own lights (the Database's model view) takes none of the map's water.
        R.packLightUniforms([], { intensity: 1 });
        assert.equal(u.rrWaterFarEdge.value, 0);
    } finally {
        W.build = build;
        if (W._texture && W._texture !== saved.texture) W._texture.texture.dispose();
        W._texture = saved.texture; u.rrVolumeOn.value = saved.on; u.rrWaterFarEdge.value = saved.edge;
    }
});

test('the volume stands where the glowing water can be in it: a lake in a basin, and the editor\'s view', () => {
    const W = R.WaterLight, V = R.LightVolume;
    const basin = pondMap([pond({ glow: 1, level: -11.19 })], 200, 200);
    const info = W.describe(basin);
    const region = V.region(basin, { x: 14, y: 13, groundY: 0 });
    assert.equal(region.origin[1], -4, 'hung from the ground, the volume ends above the lake');
    W.fit(region, info, { groundY: 0 });
    assert.equal(region.origin[1], -16, 'lowered to hold it');
    assert.ok(region.origin[1] + region.dims[1] * V.VOXEL >= 12, 'the focus\'s own ground and a storey over it still inside');
    const high = V.region(basin, { x: 14, y: 13, groundY: 40 });
    W.fit(high, info, { groundY: 40 });
    assert.ok(high.origin[1] + high.dims[1] * V.VOXEL >= 52, 'never lowered so far that the focus leaves the top');
    const away = V.region(basin, { x: 150, y: 150, groundY: 0 });
    W.fit(away, info, { groundY: 0 });
    assert.equal(away.origin[1], -4, 'water outside the volume\'s box does not move it');
    const saved = R.Shadows.focus;
    try {
        R.Shadows.focus = null;
        const player = W.focus({ x: 30, y: 40 }, { width: 200, height: 200 });
        assert.deepEqual([player.x, player.y, player.groundY, player.standY], [30, 40, 0, 0], 'in the game: the player, at the ground under them');
        R.Shadows.focus = () => ({ x: 151.3, y: -9.5, z: 142.9 });
        const view = W.focus({ x: 100, y: 100 }, basin);
        assert.deepEqual([view.x, view.y, view.groundY, view.standY], [152, 144, 0, -9.5], 'in the editor: the orbit target, in steps of eight tiles');
        // The volume hangs where it does on a map with no glowing water (its lamps are cached the same) until the
        // focus stands so high that the water's light, which exists only in the volume, would be out of the top of it.
        R.Shadows.focus = null;
        for (const ground of [0, 5, 9, 12]) {
            const focus = W.focus({ x: 30, y: 40, groundY: ground }, basin);
            assert.equal(V.region(basin, focus).origin[1], V.region(basin, { x: 30, y: 40 }).origin[1], 'standing ' + ground + ' up: the volume is where every map\'s is');
        }
        const hill = W.focus({ x: 30, y: 40, groundY: 30 }, basin), raised = V.region(basin, hill);
        assert.ok(raised.origin[1] > -4 && raised.origin[1] + raised.dims[1] * V.VOXEL >= 30 + 12, 'on high ground it rises to hold the ground and a storey over it: ' + raised.origin[1]);
        // A lake in a basin under the focus is still held: the floor is lowered by where the focus stands, not by where the volume hangs.
        const shore = W.focus({ x: 14, y: 13, groundY: -10 }, basin), held = V.region(basin, shore);
        W.fit(held, info, shore);
        assert.equal(held.origin[1], -16);
        // And from a height over the basin the volume keeps the focus's own ground and a storey over it.
        const rim = W.focus({ x: 14, y: 13, groundY: 30 }, basin), kept = V.region(basin, rim);
        W.fit(kept, info, rim);
        assert.ok(kept.origin[1] + kept.dims[1] * V.VOXEL >= 30 + 12, 'not lowered out from over the focus: ' + kept.origin[1]);
    } finally { R.Shadows.focus = saved; }
    // A volume that does not hold the whole map fades the light out toward its edge.
    const uniforms = W.bakeUniforms();
    W.loadBake(uniforms, { water: info, waterMap: basin, region: { origin: [68, -16, 68], dims: [128, 64, 128] } });
    assert.deepEqual(Array.from(uniforms.rrBakeWaterBox.value), [74, 74, 126, 126]);
    assert.match(W.BAKE_GLSL, /clamp\(1\.0 \+ edge \/ rrBakeWaterEdge, 0\.0, 1\.0\)/);
    W.loadBake(uniforms, { water: null, region: { origin: [0, 0, 0], dims: [2, 2, 2] } });
    assert.equal(uniforms.rrBakeWaterEdge.value, 0, 'no water: the bake skips it');
});

test('a glow hangs over a shining sheet as haze, with the lights\' haze, and goes when the water is laid again', () => {
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    const map = pondMap([pond({ glow: 0.8, colour: '#ff4a10' }), pond({ x0: 22, x1: 30 })]);
    scene.addWater(map, () => null);
    const group = scene._scene.userData.rrLightBodies;
    const layers = R.WATER_HAZE_LAYERS.length;
    assert.equal(scene._waterHaze.length, 2 * layers);
    assert.equal(scene._waterFalls.length, 0, 'the falls\' list is the falls\'');
    const lava = scene._waterHaze.slice(0, layers), plain = scene._waterHaze.slice(layers);
    for (const haze of lava) {
        assert.equal(haze.parent, group, 'with the lights\' glowing bodies');
        assert.equal(haze.material.userData.rrHaze, true, 'drawn by the haze pass');
        assert.equal(haze.geometry, scene._waterMeshes[0].geometry, 'the sheet\'s own surface');
        assert.equal(haze.visible, true);
        assert.equal(haze.material.depthWrite, false);
    }
    assert.ok(plain.every(haze => !haze.visible), 'none over water that does not glow');
    const shared = scene._waterMeshes[0].material.userData.rrWaterHaze;
    assert.ok(shared.colour.value.r === 1 && shared.colour.value.g < 0.1, 'in the sheet\'s colour');
    assert.equal(lava[0].material.uniforms.strength, shared.strength, 'one strength for its layers');
    // A slider from nothing: the haze appears without the sheet being laid again.
    R.applyWaterLook(scene._waterMeshes[1].material, { glow: 0.5 });
    assert.ok(plain.every(haze => haze.visible));
    R.applyWaterLook(scene._waterMeshes[1].material, { glow: 0 });
    assert.ok(plain.every(haze => !haze.visible));
    const before = scene._waterHaze.slice(), materials = before.map(haze => haze.material);
    scene.updateWaterSheets(map, () => null);
    assert.ok(before.every(haze => !haze.parent), 'the old haze left the scene');
    assert.ok(materials.every(material => !scene._materials.includes(material)));
    assert.equal(scene._waterHaze.length, 2 * layers);
});

test('a glowing river\'s falls glow with it: the curtain, the foam and the spray read the river\'s own colour and glow, live', () => {
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    // A river that runs level, drops four tiles over a cliff and runs on.
    const river = { x0: 2, y0: 2, x1: 22, y1: 6, material: 'Water', glow: 0.5, colour: '#18c8e8', path: [[2, 4, 5], [10, 4, 5], [10, 4, 1], [20, 4, 0.8]] };
    scene.addWater(pondMap([river]), () => null);
    assert.equal(scene._waterFalls.length, 3, 'a curtain, its foam and its spray');
    const sheet = scene._waterMeshes[0].material, [curtain, foam, spray] = scene._waterFalls.map(mesh => mesh.material);
    const compiled = material => {
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
        material.onBeforeCompile(shader, null);
        return shader;
    };
    for (const [name, material] of [['the curtain', curtain], ['the foam', foam]]) {
        const shader = compiled(material);
        assert.equal(shader.uniforms.rrWaterGlow.value, sheet.userData.rrWaterGlow, name + ' reads the very values the sheet holds');
        assert.ok(shader.fragmentShader.includes(R.WATER_SHINE_GLSL + '\n#include <opaque_fragment>'), name + ' shines after the map\'s light: the night does not dim it');
        assert.ok(shader.fragmentShader.indexOf('rrWaterEmit = rrWaterGlow.rgb') > 0 && shader.fragmentShader.indexOf('rrWaterEmit = rrWaterGlow.rgb') < shader.fragmentShader.indexOf('outgoingLight += rrWaterEmit'), name + ' works its shine out in its own colours');
    }
    const fall = compiled(curtain);
    assert.equal(fall.uniforms.rrFallTint.value, sheet.userData.rrFallTint);
    assert.equal(fall.uniforms.rrWaterForm.value, sheet.userData.rrWaterForm);
    assert.match(fall.fragmentShader, /rrWaterEmit = rrWaterGlow\.rgb \* \(rrWaterGlow\.w \* \(0\.55 \+ 0\.9 \* rrDensity\) \* \(1\.0 - 0\.6 \* rrWhite\)\);/, 'brightest in its ropes, paler where it is white: the falling water still reads');
    assert.match(fall.fragmentShader, /diffuseColor\.a = max\(diffuseColor\.a, rrWaterForm\.w \* 0\.9 \* rrSide \* smoothstep\(1\.0, 0\.86, rrDown\)\);/, 'and the shine fills the film between the ropes');
    assert.equal(spray.uniforms.rrWaterGlow.value, sheet.userData.rrWaterGlow, 'the spray too');
    assert.match(spray.fragmentShader, /mix\(white, rrWaterGlow\.rgb, 0\.65 \* min\(rrWaterGlow\.w \/ 0\.75, 1\.0\)\)/);
    // What they hold is the river's look, and a slider on the sheet moves them with it.
    assert.equal(fall.uniforms.rrWaterGlow.value.w, R.WATER_SHINE * 0.25);
    assert.ok(fall.uniforms.rrWaterGlow.value.z === 1 && fall.uniforms.rrWaterGlow.value.x < 0.05, 'cyan');
    R.applyWaterLook(sheet, { glow: 1, colour: '#ff4a10' });
    assert.equal(fall.uniforms.rrWaterGlow.value.w, R.WATER_SHINE, 'full glow on the sheet is full glow on its falls');
    assert.ok(fall.uniforms.rrWaterGlow.value.x === 1 && fall.uniforms.rrWaterGlow.value.z < 0.05, 'in the new colour');
    assert.ok(fall.uniforms.rrFallTint.value.r > fall.uniforms.rrFallTint.value.b * 5, 'its dark water too');
    assert.equal(fall.uniforms.rrWaterForm.value.w, 1);
    R.applyWaterLook(sheet, {});
    assert.equal(fall.uniforms.rrWaterGlow.value.w, 0, 'no glow: the falls are lit by the map alone, as they were');
    assert.deepEqual(fall.uniforms.rrFallTint.value.toArray().map(v => +v.toFixed(3)), [0.05, 0.1, 0.11], 'in plain water\'s dark');
    // A fall made by itself (no sheet given) works the same values out of the look.
    const lone = R.fallMaterial(null, { glow: 1, colour: '#6c0ec7' }, 4);
    assert.equal(lone.userData.rrWaterGlow.w, R.WATER_SHINE);
    assert.ok(lone.userData.rrWaterGlow.z === 1);
    assert.equal(R.foamMaterial(null).userData.rrWaterGlow.w, 0);
});

test('Select finds water: the nearest thing under the pointer wins, and the bar turns to Terrain with the Look panel on that sheet', () => {
    const MapEditor3D = require(path.join(repoRoot, 'editor/src/MapEditor3D.js'));
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    const region = { x0: 10, y0: 10, x1: 19, y1: 17, level: -0.2 };
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 10, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    // The pointer is at the middle of the view: its ray runs from the camera through the origin, so a thing
    // set at `along` of the way stands under it, 14.14 * along from the eye.
    const on = along => new THREE.Vector3(0, 10 - 10 * along, 10 - 10 * along);
    const model = along => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4)); mesh.position.copy(on(along)); mesh.updateMatrixWorld(); mesh.userData.propId = 7; return mesh; };
    const marker = along => { const object = new THREE.Object3D(); object.position.copy(on(along)); object.updateMatrixWorld(); return object; };
    const view = ({ ground = null, water = null, prop = null, event = null, map = null } = {}) => ({
        mapScene: {}, camera, canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
        raycastMapMeshes: () => ground, waterHitAt: () => water, propAt: () => (prop ? 7 : null),
        propGroup: { children: prop ? [prop] : [] }, eventGroup: { visible: !!event }, eventAt: () => event, currentMap: () => map
    });
    const hit = given => MapEditor3D.prototype.selectHitAt.call(view(given), 50, 50);
    const lake = { region, distance: 8 }, bed = { distance: 9, object: { userData: {} } };
    assert.deepEqual(hit({ ground: bed, water: lake }), { kind: 'water', water: region, distance: 8 }, 'the bed seen through the water is the water');
    assert.equal(hit({ ground: { distance: 6, object: { userData: { pieces: true } } }, water: lake }).kind, 'piece', 'a building in front of the water is the building');
    assert.equal(hit({ ground: { distance: 6, object: { userData: {} } }, water: lake }).kind, 'ground', 'a bank in front of the water is the bank');
    assert.equal(hit({ ground: { distance: 6, object: { userData: {} } } }).kind, 'ground');
    assert.equal(hit({}), null, 'nothing under the pointer');
    // A model, an event and a light each win when they stand before the water, and lose behind it.
    const before = hit({ ground: bed, water: lake, prop: model(0.4) });
    assert.equal(before.kind, 'model', 'a model before the water is the model');
    assert.equal(before.propId, 7);
    assert.ok(before.distance > 5 && before.distance < 6, 'at its own surface: ' + before.distance);
    assert.equal(hit({ ground: bed, water: lake, prop: model(0.7) }).kind, 'water', 'a model under the water is the water');
    assert.equal(hit({ ground: bed, water: lake, event: marker(0.4) }).kind, 'event', 'an event before the water is the event');
    assert.equal(hit({ ground: bed, water: lake, event: marker(0.7) }).kind, 'water');
    const lit = (height, y) => ({ width: 20, height: 20, data: [], reactor3d: { version: 1, mode: '3d', lights: [{ x: -0.5, y, height }] } });
    const world = global.Reactor3D;
    global.Reactor3D = R;
    try {
        // A light is taken where it stands when it lies within a few pixels of the pointer.
        assert.equal(hit({ ground: bed, water: lake, map: lit(6, 5) }).kind, 'light', 'a light before the water is the light');
        assert.equal(hit({ ground: bed, water: lake, map: lit(3, 2) }).kind, 'water', 'a light under the water is the water');
        assert.equal(hit({ ground: bed, water: lake, map: lit(9, 5) }).kind, 'water', 'a light away from the pointer is not under it');
    } finally { global.Reactor3D = world; }
    // The bar: water turns it to Terrain in Look with the sheet selected; a building to Build in Select.
    const calls = [];
    const terrain = { active: false, activate() { this.active = true; calls.push('activate'); }, setMode(mode) { this.mode = mode; calls.push('mode ' + mode); }, selectWater(sheet) { this.selected = sheet; calls.push('select'); } };
    const bar = { terrain: () => terrain };
    assert.equal(BuildHotbar.prototype.selectWater.call(bar, region), true);
    assert.deepEqual(calls, ['activate', 'mode look', 'select']);
    assert.equal(terrain.selected, region);
    assert.equal(bar._lastTerrain, 'look');
    assert.equal(BuildHotbar.prototype.selectWater.call(bar, null), false);
    const saved = global.window.reactor;
    try {
        const turned = [];
        global.window.reactor = { buildHotbar: { selectWater: sheet => { turned.push(['water', sheet]); return true; }, selectPiece: (x, y) => { turned.push(['piece', x, y]); return true; }, selectModel: id => turned.push(['model', id]) } };
        const self = { propsManager: () => ({}) };
        assert.equal(MapEditor3D.prototype.selectAcrossGroups.call(self, { kind: 'water', water: region }, 5, 6), true);
        assert.equal(MapEditor3D.prototype.selectAcrossGroups.call(self, { kind: 'piece' }, 5, 6), true);
        assert.equal(MapEditor3D.prototype.selectAcrossGroups.call(self, { kind: 'model', propId: 7 }, 5, 6), true);
        assert.equal(MapEditor3D.prototype.selectAcrossGroups.call(self, { kind: 'ground' }, 5, 6), false);
        assert.equal(MapEditor3D.prototype.selectAcrossGroups.call(self, null, 5, 6), false);
        assert.deepEqual(turned, [['water', region], ['piece', 5, 6], ['model', 7]], 'a model is picked up by its id: the release runs no tool of its own');
    } finally { global.window.reactor = saved; }
    const hotbar = read('editor/src/BuildHotbar.js');
    assert.match(hotbar, /if \(event\.key === 'Escape' && this\.group\(\) === 'terrain' && this\.terrain\(\)\?\.mode === 'look' && this\.terrain\(\)\.selectedWater\) \{[\s\S]{0,160}this\.terrain\(\)\.selectWater\(null\);/, 'Escape lets the sheet go');
});

/**
 * The 3D view's own pointer handlers on a stand-in view: `group` is the Build bar group whose tool holds the map
 * ('build' in Select, 'terrain' in Look, 'models' in Select), `hit` what lies nearest under the pointer. Returns
 * a click, a drag and a log of everything the gesture did.
 */
function pointerRig(group, { hit = null, pick = null, selected = null, prop = null } = {}) {
    const MapEditor3D = require(path.join(repoRoot, 'editor/src/MapEditor3D.js'));
    const log = [], handlers = {};
    const input = { addEventListener: (type, fn) => { if (!handlers[type]) handlers[type] = fn; }, setPointerCapture() {}, releasePointerCapture() {} };
    const terrain = { active: group === 'terrain', mode: 'look', selectedWater: selected, selectWater(sheet) { this.selectedWater = sheet; log.push(['look', sheet]); }, beginStroke() { log.push(['stroke']); }, endStroke() {}, paintAt() {}, drainRegion() { log.push(['drain']); } };
    const pieces = { active: group === 'build', mode: 'select', selectionIds: () => [], pieceAtTarget: target => (target && target.piece) || null, selectAt(target) { log.push(['piece', target ? target.piece.id : 0]); return target ? target.piece : null; },
        clearSelection() {}, selectInBox(x0, y0, x1, y1) { log.push(['box', x0, y0, x1, y1]); }, _snapshot: () => ({}) };
    const props = { active: group === 'models', tool: 'select', select(id) { log.push(['model', id]); }, placing: () => false, prop: () => null };
    const view = Object.create(MapEditor3D.prototype);
    Object.assign(view, {
        inputSurface: input, canvas: null, seatPivot() {}, installFlyKeys() {}, requestRender() {}, canPaint: () => false,
        pieceManager: () => pieces, terrainManager: () => terrain, propsManager: () => props, eventManager: () => null,
        grabShapeGizmo: () => null, pieceTargetAt: () => pick, propAt: () => prop, groundPointAt: () => ({ x: 1, y: 1 }),
        selectHitAt(x, y) { log.push(['cast', x, y]); return hit; },
        planePointAt: (x, y) => ({ x: x / 10, y: y / 10 }),
        showSelectionBand: (a, b) => ({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }), hideSelectionBand() {},
        orbit(dx, dy) { log.push(['orbit', dx, dy]); }, pan() { log.push(['pan']); }, look() { log.push(['freelook']); },
        pickPropSize: () => null, pickPropRing: () => null, selectProp() {}, finishPropDrag() {}, handleClick() { log.push(['click']); }
    });
    const savedReactor = global.window.reactor, savedListen = global.window.addEventListener;
    global.window.addEventListener = () => {};
    global.window.reactor = { buildHotbar: {
        selectWater(sheet) { log.push(['bar', 'terrain', sheet]); return true; },
        selectPiece(x, y) { log.push(['bar', 'build', x, y]); return true; },
        selectModel(id) { log.push(['bar', 'models', id]); }
    } };
    view.attachInput();
    const at = (x, y, type) => ({ type, clientX: x, clientY: y, button: 0, pointerId: 1 });
    return {
        log, terrain, pieces,
        click(x, y) { handlers.pointerdown(at(x, y, 'pointerdown')); handlers.pointerup(at(x + 1, y, 'pointerup')); return log; },
        drag(x0, y0, x1, y1, end = 'pointerup') {
            handlers.pointerdown(at(x0, y0, 'pointerdown'));
            for (let i = 1; i <= 4; i++) handlers.pointermove(at(x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * i / 4, 'pointermove'));
            handlers[end](at(x1, y1, end));
            return log;
        },
        // Pressed at the first point, moved through the rest, let go at the last.
        path(points) {
            handlers.pointerdown(at(points[0][0], points[0][1], 'pointerdown'));
            for (const [x, y] of points.slice(1)) handlers.pointermove(at(x, y, 'pointermove'));
            handlers.pointerup(at(points[points.length - 1][0], points[points.length - 1][1], 'pointerup'));
            return log;
        },
        done() { global.window.reactor = savedReactor; global.window.addEventListener = savedListen; }
    };
}
const did = (log, what) => log.filter(entry => entry[0] === what);

test('a Select or Look press that travels turns the view or draws its box, and changes neither the selection nor the group', () => {
    const region = { x0: 10, y0: 10, x1: 19, y1: 17, level: -0.2 };
    const piece = { kind: 'piece', distance: 5 }, ground = { kind: 'ground', distance: 5 }, water = { kind: 'water', water: region, distance: 5 };
    // Terrain's Look with a sheet in hand: a drag begun on the ground, on a building or on other water turns the view.
    for (const [name, hit] of [['the ground', ground], ['a building', piece], ['nothing', null], ['water', water]]) {
        const rig = pointerRig('terrain', { hit, selected: region });
        try {
            const log = rig.drag(200, 200, 340, 200);
            assert.equal(did(log, 'orbit').length, 4, 'a drag begun on ' + name + ' turns the view');
            assert.equal(rig.terrain.selectedWater, region, 'the sheet stays in hand');
            assert.deepEqual(did(log, 'bar'), [], 'the bar stays in Terrain');
            assert.deepEqual(did(log, 'look'), []);
            assert.deepEqual(did(log, 'cast'), [], 'and nothing is looked for under the pointer: a drag costs no ray');
            assert.deepEqual(did(log, 'stroke'), [], 'Look shapes no ground');
        } finally { rig.done(); }
    }
    // Models' Select: a drag begun on a building or on water turns the view.
    for (const hit of [piece, water]) {
        const rig = pointerRig('models', { hit });
        try {
            const log = rig.drag(200, 200, 340, 200);
            assert.equal(did(log, 'orbit').length, 4);
            assert.deepEqual(did(log, 'bar'), [], 'the bar stays in Models');
        } finally { rig.done(); }
    }
    // Build's Select: a drag begun over water draws the selection box as it does from anywhere else.
    {
        const rig = pointerRig('build', { hit: water, pick: { top: 0, piece: { id: 31 } } });
        try {
            const log = rig.drag(200, 200, 340, 260);
            assert.deepEqual(did(log, 'box'), [['box', 20, 20, 34, 26]], 'the box is drawn and selects what is in it');
            assert.deepEqual(did(log, 'bar'), [], 'the bar stays in Build');
            assert.deepEqual(did(log, 'piece'), [['piece', 0]], 'the piece seen through the water is not picked up by the press');
        } finally { rig.done(); }
    }
    // A box drawn out and brought back to where it began is still a box, not a click on the water.
    {
        const rig = pointerRig('build', { hit: water, pick: { top: 0, piece: { id: 31 } } });
        try {
            const log = rig.path([[200, 200], [340, 260], [202, 201]]);
            assert.deepEqual(did(log, 'bar'), [], 'the bar stays in Build');
            assert.equal(did(log, 'box').length, 1);
        } finally { rig.done(); }
    }
    // A press the system took away (pointercancel) is not a click.
    {
        const rig = pointerRig('terrain', { hit: ground, selected: region });
        try {
            rig.drag(200, 200, 200, 200, 'pointercancel');
            assert.equal(rig.terrain.selectedWater, region);
        } finally { rig.done(); }
    }
});

test('a Select or Look click is settled on release: water is selected, a building or a model turns the bar, bare ground lets the sheet go', () => {
    const region = { x0: 10, y0: 10, x1: 19, y1: 17, level: -0.2 }, other = { x0: 30, y0: 10, x1: 35, y1: 17, level: 0 };
    const run = (group, options, check) => { const rig = pointerRig(group, options); try { check(rig.click(200, 200), rig); } finally { rig.done(); } };
    // Terrain's Look.
    run('terrain', { hit: { kind: 'water', water: other, distance: 5 }, selected: region }, (log, rig) => {
        assert.equal(rig.terrain.selectedWater, other, 'a click on a sheet takes that sheet');
        assert.deepEqual(did(log, 'bar'), []);
    });
    run('terrain', { hit: { kind: 'ground', distance: 5 }, selected: region }, (log, rig) => assert.equal(rig.terrain.selectedWater, null, 'bare ground lets the sheet go'));
    run('terrain', { hit: null, selected: region }, (log, rig) => assert.equal(rig.terrain.selectedWater, null, 'so does a click on nothing'));
    run('terrain', { hit: { kind: 'piece', distance: 5 }, selected: region }, log => assert.deepEqual(did(log, 'bar'), [['bar', 'build', 201, 200]], 'a building turns the bar to Build'));
    run('terrain', { hit: { kind: 'model', propId: 7, distance: 5 }, selected: region }, log => assert.deepEqual(did(log, 'bar'), [['bar', 'models', 7]], 'a model turns the bar to Models with it picked up'));
    for (const kind of ['event', 'light']) run('terrain', { hit: { kind, distance: 5 }, selected: region }, (log, rig) => {
        assert.equal(rig.terrain.selectedWater, region, 'an ' + kind + ' before the water is not the water, and the sheet stays');
        assert.deepEqual(did(log, 'bar'), []);
    });
    // Models' Select.
    run('models', { hit: { kind: 'water', water: region, distance: 5 } }, log => assert.deepEqual(did(log, 'bar'), [['bar', 'terrain', region]]));
    run('models', { hit: { kind: 'piece', distance: 5 } }, log => assert.deepEqual(did(log, 'bar'), [['bar', 'build', 201, 200]]));
    run('models', { hit: { kind: 'ground', distance: 5 } }, log => assert.deepEqual(did(log, 'bar'), []));
    // Build's Select: water turns the bar to Terrain; a piece is picked up by the press as ever, with no turn.
    run('build', { hit: { kind: 'water', water: region, distance: 5 }, pick: { top: 0, piece: { id: 31 } } }, log => {
        assert.deepEqual(did(log, 'bar'), [['bar', 'terrain', region]]);
        assert.deepEqual(did(log, 'piece'), [['piece', 0]], 'the bed under the water was not selected on the way');
        assert.equal(did(log, 'cast').length, 1, 'looked for once, at the press');
    });
    run('build', { hit: { kind: 'piece', distance: 5 }, pick: { top: 0, piece: { id: 31 } } }, log => {
        assert.deepEqual(did(log, 'piece'), [['piece', 31]]);
        assert.deepEqual(did(log, 'bar'), []);
    });
});
