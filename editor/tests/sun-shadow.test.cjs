/**
 * The sun's shadow: an orthographic map down the sun's direction that
 * follows the focus, in two cascades laid in a band under the rows of both
 * shadow atlases (static casters in one, moving ones in the other). A sun
 * hanging 150 tiles up drew through a cube face spread over 300 tiles of
 * ground, one texel a tile or more on the weak tier, and its perspective
 * depth spent the compare offset on ninety tiles, so every caster shaded its
 * own lit side and nothing under it kept a shape.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** A sun state planned against a stand-in atlas, with the frame and the lists `render` keeps. */
function planner(quality = Reactor3D.SHADOW_QUALITY.weak) {
    const shadows = Reactor3D.Shadows;
    const saved = { atlas: shadows._atlas, sun: shadows._sun, frame: shadows._frame };
    shadows._atlas = { band: quality.sunSize, size: quality.size, rows: quality.slots, height: quality.size * quality.slots + quality.sunSize, width: quality.size * 6 };
    shadows._sun = null;
    shadows._frame = 100;
    const none = { all: false, points: [] };
    const plan = (sun, focus, changes = {}) => shadows._planSun(sun, focus, 'scene', changes.statics || none, changes.dynamics || none, quality);
    // What the flush does once a cascade's two halves are drawn.
    const land = jobs => {
        for (const cascade of jobs.statics) {
            cascade.pose = cascade.want; cascade.want = null; cascade.valid = true; cascade.dirty = false; cascade.stamp = shadows._frame;
        }
        for (const cascade of jobs.dynamics) { cascade.dynValid = cascade.valid; cascade.dynDirty = false; cascade.dynStamp = shadows._frame; }
    };
    const restore = () => { shadows._atlas = saved.atlas; shadows._sun = saved.sun; shadows._frame = saved.frame; };
    return { shadows, plan, land, restore, quality };
}

const sunAt = (x, y, z) => ({ id: 'sun', index: 0, sun: true, x, y, z, lightY: y, strength: 1 });

test('each tier gives the sun two cascades that fit across the six faces, sharper near the focus', () => {
    for (const tier of ['full', 'weak']) {
        const q = Reactor3D.SHADOW_QUALITY[tier];
        assert.equal(q.sunSpans.length, 2);
        assert.ok(q.sunSpans[0] < q.sunSpans[1], 'nearest first');
        assert.ok(q.sunSize * 2 <= q.size * 6, 'two cascades side by side within the atlas width');
        assert.ok(q.sunSize <= q.size * 3, 'the band keeps its full size');
        // A texel of the near cascade is a small fraction of a tile.
        assert.ok(q.sunSpans[0] / q.sunSize <= 1 / 30, tier + ': near texel ' + q.sunSpans[0] / q.sunSize);
    }
    const full = Reactor3D.SHADOW_QUALITY.full, weak = Reactor3D.SHADOW_QUALITY.weak;
    assert.ok(weak.sunSize < full.sunSize && weak.sunSpans[1] <= full.sunSpans[1]);
    assert.equal(Reactor3D.SUN_SHADOW_MAP, true);
    assert.ok(Reactor3D.SUN_SHADOW_ROW > Reactor3D.SHADOW_SLOTS, 'the sun reads above every cube row');
});

test('the light loop reads the sun from the same two samplers as the rows, and the sun shadow also takes part of the sky', () => {
    for (const taps of [1, 5]) {
        const glsl = Reactor3D.lightGlsl(true, taps);
        assert.equal((glsl.match(/uniform sampler2DShadow /g) || []).length, 2, 'no sampler beyond the two atlases');
        assert.match(glsl, /float rrSunShadowAt\(vec3 p\) \{/);
        assert.match(glsl, /uniform mat4 rrSunShadowMatrix\[2\];/);
        assert.match(glsl, /texture\(rrShadowAtlas, vec3\(u, rrSunShadowBand\.x \+ /);
        assert.match(glsl, /texture\(rrShadowDynAtlas, vec3\(u, rrSunShadowBand\.z \+ /);
        assert.match(glsl, /if \(sh > 63\.5\) \{ float sv = rrSunShadowAt\(p\); rrSunShaded = fall \* \(1\.0 - sv\); fall \*= sv; \}\n\t\telse if \(sh >= 0\.0\) fall \*= rrShadowAt\(int\(sh \+ 0\.5\), p\);/);
        assert.match(glsl, /\tsum -= rrAmbient \* \(rrSunShade \* rrSunShaded\);\n\tif \(rrFace > 0\.0\) sum -= rrAmbient \* \(rrFace \* [0-9.]+ \* \(1\.0 - rrFaceN\.y\)\);\n\treturn sum;\n\}/);
        assert.match(glsl, /\tvec3 sum = rrAmbient;\n\trrSunShaded = 0\.0;\n\trrSunNormal = cross\(dFdx\(p\), dFdy\(p\)\);\n\tfor \(int i = 0; i < 32; i\+\+\) \{\n\t\tif \(i >= rrLightCount\) break;/,
            'the anchors the light grid and the volume rewrite are still there');
        // Orthographic depth: a fixed offset in depth units, toward the sun.
        assert.match(glsl, /float ref = s\.z - \(c == 0 \? rrSunShadowBias\.x : rrSunShadowBias\.y\);/);
        // The receiver steps off its own surface, turned toward the sun, by its cascade's texels.
        assert.match(glsl, /if \(dot\(n, rrSunShadowDir\.xyz\) < 0\.0\) n = -n;/);
        assert.match(glsl, /vec3 q = p \+ n \* \(\(c == 0 \? rrSunShadowTexel\.x : rrSunShadowTexel\.y\) \* 1\.50\);/);
        // The near cascade hands over to the far one across its edge band.
        assert.match(glsl, /float w = c == 0 \? clamp\(inside \/ rrSunShadowTexel\.z, 0\.0, 1\.0\) : 1\.0;\n\t\tsum \+= left \* w \* v;\n\t\tleft \*= 1\.0 - w;/);
        assert.match(glsl, /\treturn sum \+ left;\n\}/, 'past every cascade, lit');
    }
    // One tap shows each texel's step: the weak tier filters the sun with four.
    assert.match(Reactor3D.lightGlsl(true, 1), /for \(int i = 0; i < 4; i\+\+\) \{\n\t\tvec2 q = s\.xy \+ vec2\(i == 0 \|\| i == 2 \? -h : h, i < 2 \? -h : h\);/);
    // The half-size light pass hands its own normal in, as it does for the volume.
    assert.match(source3D(), /\.replace\("rrSunNormal = cross\(dFdx\(p\), dFdy\(p\)\);", "rrSunNormal = rrPassNormal;"\)/);
    assert.ok(Reactor3D.SUN_SHADOW_NORMAL_OFFSET >= 1 && Reactor3D.SUN_SHADOW_BIAS_TEXELS <= 1, 'a small depth offset, the rest off the surface');
    assert.doesNotMatch(Reactor3D.LIGHT_GLSL, /rrSunShadow|rrSunShade/, 'the plain light term is untouched');
    // The grid and the volume still take the shadow variant apart.
    const lit = Reactor3D.LightGrid.glsl(Reactor3D.lightGlsl(true, 1));
    assert.match(lit, /int i = j;/);
    assert.match(lit, /rrLitBy = sum;\n\treturn sum;/);
    const u = Reactor3D.lightUniforms();
    for (const key of ['rrSunShadowMatrix', 'rrSunShadowInfo', 'rrSunShadowBand', 'rrSunShadowBias', 'rrSunShade', 'rrSunShadowDir', 'rrSunShadowTexel']) assert.ok(key in u, key);
    assert.equal(u.rrSunShadowMatrix.value.length, 32);
    const source = source3D();
    assert.match(source, /"rrSunShadowMatrix", "rrSunShadowInfo", "rrSunShadowBand", "rrSunShadowBias", "rrSunShade",\n\s*"rrSunShadowDir", "rrSunShadowTexel"\]\) uniforms\[key\] = shared\[key\];/,
        'the volume bake, whose light code is the loop\'s, has the sun uniforms too');
});

test('a cascade is centred on whole texels round the focus and laid again only past its step, a turn of the sun, or a change in it', () => {
    const p = planner();
    try {
        const sun = sunAt(40, 150, 30), focus = { x: 46.3, y: 2.5, z: 58.7 };
        let jobs = p.plan(sun, focus);
        assert.ok(jobs, 'a sun above the focus casts through the cascades');
        assert.equal(jobs.statics.length, 1, 'one cascade a frame');
        assert.equal(jobs.statics[0], p.shadows._sun.cascades[0], 'the near cascade first');
        assert.ok(jobs.dynamics.includes(jobs.statics[0]), 'its moving half with it, under the same pose');
        const texel = p.quality.sunSpans[0] / p.quality.sunSize;
        const want = jobs.statics[0].want;
        assert.ok(Math.abs(want.a / texel - Math.round(want.a / texel)) < 1e-9 && Math.abs(want.b / texel - Math.round(want.b / texel)) < 1e-9, 'on the texel grid');
        // The camera's right and up and the sun's direction are square to each other.
        const { dir: D, right: R, up: U } = want;
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        assert.ok(Math.abs(dot(D, R)) < 1e-9 && Math.abs(dot(D, U)) < 1e-9 && Math.abs(dot(R, U)) < 1e-9);
        assert.ok(Math.abs(Math.hypot(...D) - 1) < 1e-9 && D[1] > 0.9, 'toward a sun high overhead');
        p.land(jobs); p.shadows._frame++;
        jobs = p.plan(sun, focus);
        assert.equal(jobs.statics[0], p.shadows._sun.cascades[1], 'then the far one');
        p.land(jobs);
        for (let i = 0; i < 20; i++) {
            p.shadows._frame++;
            jobs = p.plan(sun, focus);
            assert.equal(jobs.statics.length + jobs.dynamics.length, 0, 'a still view draws nothing');
        }
        // A step inside the recentre band: nothing. Past it: the near cascade only.
        const step = p.quality.sunSpans[0] * Reactor3D.SUN_SHADOW_RECENTER;
        p.shadows._frame++;
        jobs = p.plan(sun, { ...focus, x: focus.x + step * 0.5 });
        assert.equal(jobs.statics.length, 0);
        p.shadows._frame++;
        jobs = p.plan(sun, { ...focus, x: focus.x + step * 1.5 });
        assert.deepEqual(jobs.statics, [p.shadows._sun.cascades[0]]);
        p.land(jobs);
        // A sun that turns past SUN_SHADOW_TURN lays both cascades again, over two frames.
        p.shadows._frame++;
        jobs = p.plan(sunAt(40 + 150 * Math.tan(Reactor3D.SUN_SHADOW_TURN * 3), 150, 30), { ...focus, x: focus.x + step * 1.5 });
        assert.ok(p.shadows._sun.cascades.every(c => c.dirty), 'both cascades wait for the new direction');
        assert.equal(jobs.statics.length, 1);
    } finally {
        p.restore();
    }
});

test('a cascade follows the casters over it: a prop that changes redraws both halves, a character that moves redraws only the moving half', () => {
    const p = planner();
    try {
        const sun = sunAt(40, 150, 30), focus = { x: 46, y: 0, z: 58 };
        for (let i = 0; i < 2; i++) { p.land(p.plan(sun, focus)); p.shadows._frame += 20; }
        const near = p.shadows._sun.cascades[0], far = p.shadows._sun.cascades[1];
        // A character a tile from the focus moved: both cascades' moving halves, the far one at half rate.
        let jobs = p.plan(sun, focus, { dynamics: { points: [{ x: 47, y: 0, z: 58, r: 1 }] } });
        assert.equal(jobs.statics.length, 0);
        assert.deepEqual(jobs.dynamics, [near, far]);
        p.land(jobs); p.shadows._frame += p.quality.dynamicInterval;
        jobs = p.plan(sun, focus, { dynamics: { points: [{ x: 47.5, y: 0, z: 58, r: 1 }] } });
        assert.deepEqual(jobs.dynamics, [near], 'the far cascade waits out its interval');
        // The far cascade's owed redraw lands once its interval is out.
        p.land(jobs); p.shadows._frame += 10;
        jobs = p.plan(sun, focus);
        assert.deepEqual(jobs.dynamics, [far]);
        // Far off, past the far cascade: nothing at all.
        p.land(jobs); p.shadows._frame += 10;
        jobs = p.plan(sun, focus, { dynamics: { points: [{ x: 46 + 200, y: 0, z: 58, r: 1 }] } });
        assert.equal(jobs.dynamics.length, 0);
        // A prop that changed in the near cascade: its static half, with the moving half alongside.
        p.shadows._frame += 20;
        jobs = p.plan(sun, focus, { statics: { all: false, points: [{ x: 45, y: 0, z: 57, r: 1 }] } });
        assert.deepEqual(jobs.statics, [near]);
        assert.ok(jobs.dynamics.includes(near));
    } finally {
        p.restore();
    }
});

test('no sun, no focus, or a sun at or under the focus casts no cascade', () => {
    const p = planner();
    try {
        assert.equal(p.plan(null, { x: 0, y: 0, z: 0 }), null);
        assert.equal(p.plan(sunAt(0, 10, 0), null), null);
        assert.equal(p.plan(sunAt(10, 0, 0), { x: 0, y: 0, z: 0 }), null);
        assert.equal(p.shadows._sun, null, 'and holds no state the volume would wait on');
        assert.equal(p.shadows.sunPending(), false);
        p.plan(sunAt(0, 50, 0), { x: 0, y: 0, z: 0 });
        assert.equal(p.shadows.sunPending(), true, 'cascades not yet drawn keep the editor drawing');
    } finally {
        p.restore();
    }
});

test('a drawn cascade is offered to the sun alone, with its pose, and the brightest sun casts', () => {
    const shadows = Reactor3D.Shadows;
    const u = Reactor3D.lightUniforms();
    const saved = { sun: shadows._sun, tiles: shadows._tiles, dyn: shadows._dynTiles, set: shadows._lightSet, candidates: shadows._candidates };
    try {
        shadows._tiles = []; shadows._dynTiles = []; shadows._lightSet = null;
        const dim = { id: 'moon', index: 1, sun: true, strength: 0.1 }, bright = { id: 'day', index: 2, sun: true, strength: 0.8 };
        shadows._candidates = [{ id: 'lamp', index: 0 }, dim, bright];
        assert.equal(shadows._pickSun(), bright);
        const matrix = Float32Array.from({ length: 16 }, (_, i) => i + 1);
        shadows._sun = { id: 'day', candidate: bright, cascades: [
            { valid: true, dynValid: true, hasDyn: true, matrix, bias: 0.001 },
            { valid: false, dynValid: false, hasDyn: false, matrix: new Float32Array(16), bias: 0 }
        ] };
        const col = u.rrLightColor.value, amb = u.rrAmbient.value;
        col.fill(0); col.set([0.8, 0.8, 0.8, 3], 8);
        amb.set([1, 1, 1]);
        shadows._publish(u);
        assert.equal(u.rrLightShadow.value[2], Reactor3D.SUN_SHADOW_ROW);
        assert.equal(u.rrLightShadow.value[0], -1);
        assert.equal(u.rrSunShadowInfo.value[3], 1, 'only the drawn cascade is read');
        assert.equal(u.rrSunShadowInfo.value[2], 1, 'its moving half too');
        assert.deepEqual(Array.from(u.rrSunShadowMatrix.value.subarray(0, 16)), Array.from(matrix));
        assert.equal(u.rrSunShadowBias.value[0], Math.fround(0.001));
        assert.ok(Math.abs(u.rrSunShade.value - Reactor3D.SUN_SHADE) < 1e-6, 'a sun two thirds as bright as the ambient or more takes all of SUN_SHADE');
        assert.ok(Reactor3D.SUN_SHADE <= 0.6, 'shade keeps at least two fifths of the ambient');
        amb.set([4, 4, 4]);
        shadows._publish(u);
        assert.ok(Math.abs(u.rrSunShade.value - Reactor3D.SUN_SHADE * 0.3) < 1e-6, 'a dim sun takes its share');
        // None drawn takes none.
        shadows._sun.cascades[0].valid = false;
        shadows._publish(u);
        assert.equal(u.rrLightShadow.value[2], -1);
        assert.equal(u.rrSunShade.value, 0);
        // The volume never bakes the sun the cascades hold: they follow the focus.
        assert.equal(Reactor3D.LightVolume.shadowKey('day'), null);
    } finally {
        Object.assign(shadows, { _sun: saved.sun, _tiles: saved.tiles, _dynTiles: saved.dyn, _lightSet: saved.set, _candidates: saved.candidates });
        u.rrLightShadow.value.fill(-1);
        u.rrSunShadowInfo.value[2] = u.rrSunShadowInfo.value[3] = 0;
        u.rrSunShade.value = 0;
        u.rrAmbient.value.set([1, 1, 1]);
    }
});

test('both light packers mark a sun, the map, the editor and the battle room all draw it through the same step', () => {
    const shadows = { candidates: [], focus: { x: 0, y: 0, z: 0 } };
    const set = {
        rrLightCount: { value: 0 }, rrAmbient: { value: new Float32Array(3) }, rrLightPos: { value: new Float32Array(128) },
        rrLightColor: { value: new Float32Array(128) }, rrLightAim: { value: new Float32Array(128) }, rrLightShadow: { value: new Float32Array(32) }
    };
    Reactor3D.packLightUniforms([{ id: 's', type: 'sun', x: 1, y: 1, height: 40, radius: 150 }, { id: 'p', type: 'point', x: 2, y: 2, radius: 5 }], null, set, shadows);
    assert.deepEqual(shadows.candidates.map(c => c.sun), [true, false]);
    const source = source3D();
    assert.match(source, /lightY: y, spot, beam, sun, dir: sunDir, ax, ay, az, cosHalf, width,/, 'syncVolumeLights marks it too, with its direction');
    // The sun takes no cube row while its cascades cast; the rows go to the lamps.
    assert.match(source, /const sunJobs = this\._planSun\(sun, focus, scene, staticChange, dynamicChange, quality, rush\);\n\s*const wanted = \[\];\n\s*for \(const candidate of this\._candidates\) \{\n\s*if \(sunJobs && candidate === sun\) continue;/);
    // Drawn from the sentinel's flush with the casters swapped, inside the passes that already draw the rows.
    assert.match(source, /for \(const cascade of sunStatics\) \{\n\s*const camera = this\._renderSunCascade\(renderer, scene, this\._sun\.cascades\.indexOf\(cascade\), cascade,\n\s*cascade\.want \|\| cascade\.pose, Reactor3D\.SHADOW_LAYER_STATIC, this\._static, false\);/);
    assert.match(source, /Reactor3D\.SHADOW_LAYER_DYNAMIC, roots, true\);/);
    // The band is made with the atlases, and the kill switch makes none.
    assert.match(source, /const band = Reactor3D\.SUN_SHADOW_MAP \? Math\.min\(quality\.sunSize \|\| size \* 2, size \* 3, max\) : 0;/);
    // A shadows-off frame (the engine switch, a map's flag, a quality level) drops the cascades.
    assert.match(source, /if \(!want\) \{\n\s*this\._sun = null;/);
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor, /if \(typeof Reactor3D !== 'undefined' && Reactor3D\.Shadows\?\.sunPending\?\.\(\)\) return true;/, 'the editor draws until the cascades land');
});

test('a sun is directional: its yaw and pitch aim it, a level one stands at the default angle, and it sinks at twilight', () => {
    const deg = v => (Math.asin(v[1]) * 180) / Math.PI;
    const level = Reactor3D.sunDirection(0, 0, null, true);
    assert.ok(Math.abs(Math.hypot(...level) - 1) < 1e-9);
    assert.ok(Math.abs(deg(level) - Reactor3D.SUN_ELEVATION) < 1e-6, 'pitch 0 (the Sun preset) stands at SUN_ELEVATION');
    assert.ok(Reactor3D.SUN_ELEVATION >= 45 && Reactor3D.SUN_ELEVATION <= 60, 'a natural daytime angle');
    // Its light travels toward the viewer (+z) and a little east, so shadows show beside what casts them.
    assert.ok(level[2] < 0 && level[0] < 0, 'the sun stands north-west, light travelling south-east');
    // Aimed like a spot: yaw 0 shines south, pitch below level shines down at that angle.
    const aimed = Reactor3D.sunDirection(0, -30, null, true);
    assert.ok(Math.abs(deg(aimed) - 30) < 1e-6);
    assert.ok(Math.abs(aimed[0]) < 1e-9 && aimed[2] < 0, 'yaw 0 shines south: the sun stands north');
    const east = Reactor3D.sunDirection(90, -40, null, true);
    assert.ok(east[0] > 0.7, 'yaw 90 shines west, as a spot at yaw 90 aims: the sun stands east');
    // A following sun sinks toward twilight; a fixed one keeps its angle; the moon stands as high as the sun.
    const twilight = { day: 0, twilight: 1, night: 0 }, night = { day: 0, twilight: 0, night: 1 };
    assert.ok(Math.abs(deg(Reactor3D.sunDirection(0, 0, twilight, false)) - Reactor3D.SUN_TWILIGHT_ELEVATION) < 1e-6);
    assert.ok(Math.abs(deg(Reactor3D.sunDirection(0, 0, night, false)) - Reactor3D.SUN_ELEVATION) < 1e-6);
    assert.ok(Math.abs(deg(Reactor3D.sunDirection(0, 0, twilight, true)) - Reactor3D.SUN_ELEVATION) < 1e-6);
    // The cascades take the sun's own direction, not the way from the focus to where it is placed.
    const p = planner();
    try {
        const sun = { ...sunAt(46, 150, 58), dir: level };
        p.plan(sun, { x: 46, y: 0, z: 58 });
        assert.deepEqual(p.shadows._sun.dir.map(v => +v.toFixed(9)), level.map(v => +v.toFixed(9)), 'a sun straight over the focus still casts at its angle');
    } finally {
        p.restore();
    }
    // The key light that shades relief follows it, as a direction.
    const u = { rrLightPos: { value: new Float32Array(8) }, rrLightColor: { value: new Float32Array([1, 1, 1, 3, 0, 0, 0, 0]) }, rrLightAim: { value: new Float32Array([...level, -1, 0, 0, 0, 0]) }, rrKeyLight: { value: new Float32Array(4) } };
    Reactor3D.setKeyLight(u, 1);
    assert.deepEqual(Array.from(u.rrKeyLight.value).map(v => +v.toFixed(5)), [...level, 0].map(v => +v.toFixed(5)));
    const source = source3D();
    assert.match(source, /sunDir = this\.sunDirection\(yaw, pitch, day, fixed\);/, 'the map\'s lights carry it, at the time of day and after event commands');
    assert.match(source, /own\.sunDir = \[x \/ l, y \/ l, z \/ l\];/, 'across a border it turns toward the neighbor\'s');
});

test('plan lights cast, and North Haven\'s lamps cast', () => {
    const plan = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'), 'utf8');
    assert.match(plan, /occlude: true, shadow: true, on: true, body: false, tag, attach: null,/);
    assert.doesNotMatch(plan, /shadow: false/);
    const sidecar = path.join(repoRoot, 'template', 'Demo', 'data', 'Map005.r3d.json');
    if (fs.existsSync(sidecar)) {
        const lights = JSON.parse(fs.readFileSync(sidecar, 'utf8')).lights || [];
        const lamps = lights.filter(l => l.type === 'point');
        assert.ok(lamps.length >= 20 && lamps.every(l => l.shadow !== false), 'every lamp in the village casts');
    }
});

test('on the weak tier a casting sun carries the characters, and the lamps\' rows hold only what stands still', () => {
    assert.equal(Reactor3D.SHADOW_QUALITY.weak.dynamicRowsWithSun, false);
    assert.equal(Reactor3D.SHADOW_QUALITY.full.dynamicRowsWithSun, true);
    assert.match(source3D(), /if \(\(!sunJobs \|\| quality\.dynamicRowsWithSun !== false\) && this\._dynamicWithin\(candidate, far\)\) dynWanted\.push\(/);
});

test('shiny surfaces read the capture at a mip matched to their roughness, and take the sun as a highlight', () => {
    const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    const material = { userData: { rrShine: { vector: { x: 1, y: 0.15, z: 1, w: 0.2, isVector4: false }, tint: { r: 1, g: 0.8, b: 0.33 } } } };
    if (typeof THREE !== 'undefined') Reactor3D.injectShine(material, shader);
    const source = source3D();
    // The lobe's width in the box-filtered mips: sigma = pi r^2 / (1 + r) of a face, never sharper than REFLECTION_MIN_LOD.
    assert.match(source, /float rrLod = rrEnvMaxLod > 0\.0 \? clamp\(rrEnvMaxLod \+ log2\(max\(3\.14159265 \* rrShine\.y \* rrShine\.y \/ \(1\.0 \+ rrShine\.y\), 1e-6\)\), "/);
    assert.match(source, /"\\tvec3 rrEnv = textureLod\(rrEnvMap, rrR, rrLod\)\.rgb;"/);
    assert.ok(Reactor3D.REFLECTION_MIN_LOD >= 1 && Reactor3D.REFLECTION_MIN_LOD <= 3);
    const lod = (r, max = 9) => Math.min(max, Math.max(Reactor3D.REFLECTION_MIN_LOD, max + Math.log2(Math.max(Math.PI * r * r / (1 + r), 1e-6))));
    assert.equal(lod(0), Reactor3D.REFLECTION_MIN_LOD, 'a mirror reads the sharpest level allowed');
    assert.ok(lod(0.15) > 4 && lod(0.15) < 6, 'the Gold preset reads a soft level');
    assert.ok(lod(0.5) >= 8, 'a rough metal reads close to the coarsest');
    // The sun's highlight: a GGX lobe, in the reflection's tint, shadowed with the sun.
    assert.match(source, /if \(rrKeyLight\.w < 0\.5 && dot\(rrKeyColor, rrKeyColor\) > 0\.0\) \{/);
    assert.match(source, /float rrKA = max\(rrShine\.y \* rrShine\.y, 0\.002\), rrKA2 = rrKA \* rrKA, rrKD = rrKNH \* rrKNH \* \(rrKA2 - 1\.0\) \+ 1\.0;/);
    assert.match(source, /"#ifdef RR_SHADOW_TAPS",\n\s*"\\t\\trrKGGX \*= 1\.0 - clamp\(rrSunShaded, 0\.0, 1\.0\);",/);
    // The key color is the packed sun's, and black with no sun (indoors: no highlight).
    const u = { rrLightPos: { value: new Float32Array(8) }, rrLightColor: { value: new Float32Array([0.8, 0.7, 0.6, 3, 0, 0, 0, 0]) }, rrLightAim: { value: new Float32Array([0, 1, 0, -1, 0, 0, 0, 0]) }, rrKeyLight: { value: new Float32Array(4) }, rrKeyColor: { value: new Float32Array(3) } };
    Reactor3D.setKeyLight(u, 1);
    assert.deepEqual(Array.from(u.rrKeyColor.value).map(v => +v.toFixed(3)), [0.8, 0.7, 0.6]);
    u.rrLightColor.value[3] = 0;
    Reactor3D.setKeyLight(u, 1);
    assert.deepEqual(Array.from(u.rrKeyColor.value), [0, 0, 0]);
    assert.match(Reactor3D.lightGlsl(true, 1), /float rrSunShaded = 0\.0;/, 'zero where the light term is skipped (a self-lit or half-size twin)');
});
