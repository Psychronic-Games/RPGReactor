/**
 * Shadows from the map's lights.
 *
 * A casting light renders six faces of depth from where it stands into a row
 * of a shared atlas, and every lit material samples it with hardware depth
 * comparison inside the light loop. Props and placed models sit in a static
 * atlas whose rows are rendered only when one of them moves; the characters
 * go in a smaller dynamic atlas whose rows are rendered when one in reach
 * moved. Two samplers however many lights cast.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a light casts by default; the sidecar, the editor and the frame all carry the flag', () => {
    Reactor3D._nativeNorm = null;
    const map = { reactor3d: { lights: [
        { id: 'a', type: 'point', x: 1, y: 2 },
        { id: 'b', type: 'spot', shadow: false }
    ] } };
    const lights = Reactor3D.readMapLights(map);
    assert.equal(lights[0].shadow, true, 'casts unless told not to');
    assert.equal(lights[1].shadow, false);
    const resolved = Reactor3D.nativeLights(map);
    assert.equal(resolved[0].id, 'a', 'the id rides along so a slot can follow its light');
    assert.equal(resolved[0].shadow, true);
    assert.equal(resolved[1].shadow, false);

    const editor = read('editor/src/utils/MapLights.js');
    assert.match(editor, /shadow: raw\.shadow !== false,/);
    const manager = read('editor/src/LightingManager.js');
    assert.match(manager, /shadow: light\.shadow,\n\s*animated:/, 'resolvedLights carries it');
    assert.match(manager, /id: light\.id, type: light\.type,[\s\S]*?shadow: light\.shadow\n\s*\}\)\)(?:\.concat\(modelLights\))?\);/, 'feed3D hands id and flag to the compositor');
    assert.match(manager, /\['shadow', 'lit\.shadow'\]/, 'the panel offers the flag beside On and Blocked by walls');
    const i18n = read('editor/src/I18nManager.js');
    assert.equal((i18n.match(/"lit\.shadow": "/g) || []).length, 18, 'named in every locale');
});

test('the engine switch, the flat mode and the sidecar can each turn shadows off', () => {
    assert.equal(Reactor3D.SHADOWS, 'auto');
    assert.equal(Reactor3D.shadowsWanted({}), true);
    assert.equal(Reactor3D.shadowsWanted({ reactor3d: { lighting: { shadows: false } } }), false);
    assert.equal(Reactor3D.shadowsWanted({ reactor3d: { lighting: { mode: 'flat' } } }), false, 'the quads carry no depth');
    const was = Reactor3D.SHADOWS;
    try {
        Reactor3D.SHADOWS = 'off';
        assert.equal(Reactor3D.shadowsWanted({}), false);
    } finally {
        Reactor3D.SHADOWS = was;
    }
});

test('the quality follows the GPU tier: fewer rows, smaller faces and one tap on a weak one', () => {
    const shadows = Reactor3D.Shadows;
    shadows._quality = null;
    assert.deepEqual({ ...shadows.quality() }, Reactor3D.SHADOW_QUALITY.full, 'no Graphics at all reads as capable');
    shadows._quality = null;
    global.Graphics = { gpuTier: 'weak' };
    try {
        assert.deepEqual({ ...shadows.quality() }, Reactor3D.SHADOW_QUALITY.weak);
        assert.ok(Reactor3D.SHADOW_QUALITY.weak.slots < Reactor3D.SHADOW_QUALITY.full.slots);
        assert.ok(Reactor3D.SHADOW_QUALITY.weak.size < Reactor3D.SHADOW_QUALITY.full.size);
        assert.equal(Reactor3D.SHADOW_QUALITY.weak.taps, 1);
    } finally {
        delete global.Graphics;
        shadows._quality = null;
    }
    assert.ok(Reactor3D.SHADOW_QUALITY.full.slots <= Reactor3D.SHADOW_SLOTS, 'never more than the shader declares');
});

test('the shadow variant of the light shader reads two atlases, however many lights cast', () => {
    const plain = Reactor3D.lightGlsl(false);
    assert.equal(plain, Reactor3D.LIGHT_GLSL);
    assert.doesNotMatch(plain, /rrShadowAt|sampler2DShadow/);

    const soft = Reactor3D.lightGlsl(true, 5);
    const slots = Reactor3D.SHADOW_SLOTS;
    assert.equal(slots, 8);
    // One sampler per atlas, not two per slot: the sampler limit no longer caps the casting lights.
    assert.equal((soft.match(/sampler2DShadow rr/g) || []).length, 2);
    assert.match(soft, /uniform sampler2DShadow rrShadowAtlas;/);
    assert.match(soft, /uniform sampler2DShadow rrShadowDynAtlas;/);
    assert.doesNotMatch(soft, /samplerCubeShadow/);
    assert.match(soft, /#define RR_SHADOW_TAPS 5/);
    assert.match(soft, /uniform float rrLightShadow\[32\];/);
    assert.match(soft, new RegExp('uniform vec4 rrShadowInfo\\[' + slots + '\\];'));
    assert.match(soft, new RegExp('uniform vec4 rrShadowPos\\[' + slots + '\\];'));
    // The compare depth is the face camera's projected depth, from the major axis.
    assert.match(soft, /float z = max\(max\(a\.x, a\.y\), a\.z\);/);
    assert.match(soft, /float dp = \(info\.y \* \(z - info\.x\)\) \/ \(z \* \(info\.y - info\.x\)\) \+ rrShadowBias;/);
    // The face and its projection agree with the cameras in SHADOW_FACES (right = dir × up).
    assert.match(soft, /if \(a\.x >= a\.y && a\.x >= a\.z\) \{ face = d\.x > 0\.0 \? 0\.0 : 1\.0; uv = vec2\(d\.z \* sign\(d\.x\), d\.y\); \}/);
    assert.match(soft, /else if \(a\.y >= a\.z\) \{ face = d\.y > 0\.0 \? 2\.0 : 3\.0; uv = vec2\(d\.x, d\.z \* sign\(d\.y\)\); \}/);
    assert.match(soft, /else \{ face = d\.z > 0\.0 \? 4\.0 : 5\.0; uv = vec2\(-d\.x \* sign\(d\.z\), d\.y\); \}/);
    assert.deepEqual(Reactor3D.SHADOW_FACES.map(f => f.dir), [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);
    for (const face of Reactor3D.SHADOW_FACES) {
        const [dx, dy, dz] = face.dir, [ux, uy, uz] = face.up;
        assert.equal(dx * ux + dy * uy + dz * uz, 0, 'up is square to the look direction');
    }
    // A tap never leaves its face, and the row is picked by the slot.
    assert.match(soft, /clamp\(uv \+ rrShadowTap\(i, phi\) \* info\.w, pad, 1\.0 - pad\)/);
    assert.match(soft, /vec2 base = vec2\(face \* rrShadowGrid\.x, row \* rowScale\);/);
    // The darker of the static and the dynamic row wins.
    assert.match(soft, /float s = rrAtlasShadow\(rrShadowAtlas, rrShadowGrid\.y, float\(slot\), d, info\);\n\tif \(info\.z >= 0\.0\) s = min\(s, rrAtlasShadow\(rrShadowDynAtlas, rrShadowGrid\.z, info\.z, d, info\)\);/);
    // Sampled inside the light loop, before the light adds in.
    assert.match(soft, /float sh = rrLightShadow\[i\];\n\t\tif \(sh >= 0\.0\) fall \*= rrShadowAt\(int\(sh \+ 0\.5\), p\);\n\t\tsum \+= lc\.rgb \* fall;/);
    // Each row measures from where it was rendered, not from the light.
    assert.match(soft, /vec3 d = p - rrShadowPos\[slot\]\.xyz;/);

    const hard = Reactor3D.lightGlsl(true, 1);
    assert.match(hard, /#define RR_SHADOW_TAPS 1/);
    for (const shader of [plain, soft, hard]) {
        assert.match(shader, /fall \*= smoothstep\(aim\.w, mix\(aim\.w, 1\.0, 0\.35\), c\);\n\t\t\tif \(fall <= 0\.0\) continue;\n\t\t}/,
            'zero spotlight contribution exits before any shadow fetch or light accumulation');
    }
});

test('a lit material takes the shadow variant only while shadows are active, and keys its program apart', () => {
    const shadows = Reactor3D.Shadows;
    const material = {};
    Reactor3D.litMaterial(material);
    const compile = () => {
        const shader = {
            uniforms: {},
            vertexShader: 'void main() {\n#include <project_vertex>\n}',
            fragmentShader: 'void main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n}'
        };
        material.onBeforeCompile(shader, null);
        return shader;
    };
    assert.equal(material.customProgramCacheKey(), '|reactor3d-lit');
    assert.doesNotMatch(compile().fragmentShader, /samplerCubeShadow/);
    const uniforms = Reactor3D.lightUniforms();
    assert.equal(uniforms.rrLightShadow.value.length, Reactor3D.SHADER_LIGHTS);
    assert.ok(Array.from(uniforms.rrLightShadow.value).every(v => v === -1), 'no light samples a slot until one is assigned');
    assert.equal(uniforms.rrShadowInfo.value.length, Reactor3D.SHADOW_SLOTS * 4);
    assert.equal(uniforms.rrShadowBias.value, Reactor3D.SHADOW_BIAS);
    assert.ok('rrShadowAtlas' in uniforms && 'rrShadowDynAtlas' in uniforms && 'rrShadowGrid' in uniforms);
    assert.equal(uniforms.rrShadowGrid.value.length, 4);
    shadows._active = true;
    shadows._quality = null;
    try {
        assert.equal(material.customProgramCacheKey(), '|reactor3d-lit|shadows5');
        const shader = compile();
        assert.match(shader.fragmentShader, /sampler2DShadow rrShadowAtlas/);
        assert.equal(shader.uniforms.rrShadowAtlas, uniforms.rrShadowAtlas, 'the shared value object, not a copy');
        assert.equal(shader.uniforms.rrLightShadow, uniforms.rrLightShadow);
        // Only the renderer whose context holds the maps declares the
        // samplers. The editor draws the same materials from the 3D
        // database preview and the model pickers, each with its own
        // renderer; a depth atlas from another context would be re-uploaded
        // there as an empty colour texture and every draw refused.
        const owner = {};
        const other = {};
        shadows._renderer = owner;
        const compileFor = renderer => {
            const shader = {
                uniforms: {},
                vertexShader: 'void main() {\n#include <project_vertex>\n}',
                fragmentShader: 'void main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n}'
            };
            material.onBeforeCompile(shader, renderer);
            return shader.fragmentShader;
        };
        assert.match(compileFor(owner), /sampler2DShadow rrShadowAtlas/);
        assert.doesNotMatch(compileFor(other), /sampler2DShadow/, 'a second renderer compiles the plain light term');
        assert.match(compileFor(other), /rrLight\(vRRWorldPos\)/, 'and still takes the lights');
        assert.equal(shadows.appliesTo(other), false);
        assert.equal(shadows.appliesTo(owner), true);
    } finally {
        shadows._active = false;
        shadows._renderer = null;
        shadows._quality = null;
    }
});

test('slots go to the nearest casters and stay put while their light stays chosen', () => {
    const shadows = Reactor3D.Shadows;
    const a = { id: 'a', gap: 3 };
    const b = { id: 'b', gap: 1 };
    const c = { id: 'c', gap: 2 };
    const d = { id: 'd', gap: 9 };
    const first = shadows.assign([a, b, c, d], 2, null);
    assert.deepEqual(first.map(s => s.id), ['b', 'c']);
    // c walks off; a moves in. b keeps slot 0, a takes the freed slot 1.
    const second = shadows.assign([a, b, d], 2, first);
    assert.deepEqual(second.map(s => s.id), ['b', 'a']);
    // Order of arrival never shuffles a kept slot.
    const third = shadows.assign([b, a], 2, [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual(third.map(s => s.id), ['a', 'b']);
    assert.deepEqual(shadows.assign([], 2, first), [null, null]);
    // A rank outranks the gap.
    const torch = { id: 'torch', gap: -3, rank: -0.2 };
    const glow = { id: 'glow', gap: -38, rank: -0.8 };
    assert.deepEqual(shadows.assign([torch, glow], 1, null).map(s => s.id), ['glow']);
    // The rank is the light landing on the player: the screen shining down on them from ten tiles
    // (spot, reach 50) outranks the torch in their hand lighting the floor (reach 6, the focus on its edge).
    const focus = { x: 25, y: 0, z: 50 };
    const screen = { x: 30, y: 10, lightY: 10, z: 42, radius: 50, gap: -40, spot: true, ax: -0.44, ay: -0.8, az: 0.4, cosHalf: Math.cos(Math.PI / 5), strength: 1.25 };
    const hand = { x: 25, y: 3, lightY: 3, z: 50, radius: 6, gap: -6, spot: true, ax: 0, ay: -1, az: 0, cosHalf: Math.cos(Math.PI / 6), strength: 1 };
    const away = { x: 25, y: 10, lightY: 10, z: 60, radius: 50, gap: -40, spot: true, ax: 0, ay: 0, az: 1, cosHalf: Math.cos(Math.PI / 8), strength: 1.25 };
    const far = { x: 5, y: 1, lightY: 1, z: 5, radius: 3, gap: 40, spot: false, strength: 1 };
    assert.ok(shadows._incident(screen, focus) > shadows._incident(hand, focus), 'the screen lands more light on the body than the torch aimed at the floor');
    // Where a light stands decides; where it points only tips the balance (SHADOW_AIM_FLOOR).
    assert.ok(shadows._incident(away, focus) < shadows._incident(screen, focus), 'a screen aimed away counts for less');
    assert.ok(shadows._incident(away, focus) > shadows._incident(screen, focus) * 0.4, 'but not so little that a sweep of its arm trades rows');
    assert.equal(shadows._incident(far, focus), 0, 'out of reach lands nothing');
    assert.ok(shadows._rankFor(screen, focus) < shadows._rankFor(hand, focus));
    assert.ok(shadows._rankFor(screen, focus) < shadows._rankFor(away, focus));
    assert.ok(shadows._rankFor(far, focus) > 2e4);
    assert.equal(shadows._incident(screen, null), 0, 'no focus, no ranking');
    assert.deepEqual(shadows.assign([a], 3, null).map(s => s && s.id), ['a', null, null]);
});

test('syncVolumeLights hands the shadow module every light that may cast, ranked by its gap to the focus', () => {
    const saved = { facadeAt: Reactor3D.facadeAt, surfaceHeightAt: Reactor3D.surfaceHeightAt, set: Reactor3D.Shadows.setCandidates };
    Reactor3D.facadeAt = () => null;
    Reactor3D.surfaceHeightAt = () => 0;
    let handed = null;
    Reactor3D.Shadows.setCandidates = list => { handed = list; };
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene.lightBodies = () => ({ place() {}, trim() {} });
    try {
        scene.syncVolumeLights([
            { id: 'near', type: 'point', x: 1, y: 1, height: 1, radius: 3 },
            { id: 'dark', type: 'point', x: 2, y: 1, height: 1, radius: 3, shadow: false },
            { type: 'spot', x: 9, y: 9, height: 2, radius: 4, yaw: 0, pitch: -45 }
        ], { x: 1, y: 1 });
        assert.equal(handed.length, 2, 'the light that opted out is not a candidate');
        assert.equal(handed[0].id, 'near');
        assert.equal(handed[0].index, 0, 'the slot is written back at the light\'s loop index');
        assert.equal(handed[0].gap, -3, 'distance to the focus minus reach');
        assert.equal(handed[0].lightY, 1, 'the row ranking sees where the light really is');
        assert.equal(handed[0].strength, 1, 'and how bright it is');
        assert.equal(handed[1].spot, true);
        assert.ok(Math.abs(handed[1].cosHalf - Math.cos(Math.PI / 8)) < 1e-6 || handed[1].cosHalf > 0, 'and its cone');
        assert.equal(handed[0].x, 1.5);
        assert.equal(handed[0].y, 1, 'a light a tile up is its own shadow source');
        assert.equal(handed[0].z, 2);
        assert.equal(handed[1].id, '#2', 'a plugin light without an id is named by its index');
        assert.equal(handed[1].index, 2);
        scene.syncVolumeLights([{ id: 'floor', type: 'point', x: 1, y: 1, height: 0, radius: 3 }], { x: 1, y: 1 });
        assert.equal(handed[0].y, Reactor3D.SHADOW_LIFT, 'a light on the floor casts from a little above it');
        assert.equal(Reactor3D.lightUniforms().rrLightPos.value[1], 0, 'while the light itself stays on the floor');
    } finally {
        Reactor3D.facadeAt = saved.facadeAt;
        Reactor3D.surfaceHeightAt = saved.surfaceHeightAt;
        Reactor3D.Shadows.setCandidates = saved.set;
    }
});

test('marking a caster puts its meshes on the static or the dynamic layer, and either set forgets a detached root', () => {
    const shadows = Reactor3D.Shadows;
    const mesh = layers => ({ isMesh: true, castShadow: false, layers });
    const layersOf = () => {
        const on = new Set([0]);
        return { enable: l => on.add(l), disable: l => on.delete(l), has: l => on.has(l) };
    };
    const root = { userData: {}, parent: {}, children: [], _meshes: [mesh(layersOf()), mesh(layersOf())] };
    const savedCaster = shadows.casterMaterialFor;
    shadows.casterMaterialFor = () => 'caster';
    root.traverse = fn => { fn(root); root._meshes.forEach(fn); };
    const savedThree = global.THREE;
    global.THREE = { FrontSide: 0, BackSide: 1, DoubleSide: 2 };
    try {
        shadows.markCaster(root, false);
        assert.equal(root.userData.reactorShadowCaster, 'static');
        assert.ok(root._meshes.every(m => m.castShadow && m.layers.has(Reactor3D.SHADOW_LAYER_STATIC) && !m.layers.has(Reactor3D.SHADOW_LAYER_DYNAMIC)));
        assert.ok(root._meshes.every(m => m.layers.has(0)), 'still drawn by the main camera');
        assert.ok(root._meshes.every(m => m.customDepthMaterial === 'caster'), 'drawn into the rows with the slope offset');
        assert.ok(shadows._static.has(root));
        shadows.markCaster(root, true);
        assert.equal(root.userData.reactorShadowCaster, 'dynamic');
        assert.ok(root._meshes.every(m => m.layers.has(Reactor3D.SHADOW_LAYER_DYNAMIC) && !m.layers.has(Reactor3D.SHADOW_LAYER_STATIC)));
        assert.ok(shadows._dynamic.has(root) && !shadows._static.has(root));
        // A root removed from the scene drops out on the next look.
        root.parent = null;
        root.matrixWorld = { elements: new Array(16).fill(0) };
        assert.equal(shadows._dynamicWithin({ x: 0, y: 0, z: 0, radius: 100 }), false);
        assert.ok(!shadows._dynamic.has(root));
    } finally {
        if (savedThree === undefined) delete global.THREE; else global.THREE = savedThree;
        shadows.casterMaterialFor = savedCaster;
        shadows._static.clear();
        shadows._dynamic.clear();
    }
});

test('the static rows re-render when a prop moves, hides, arrives, or swaps its level, and not otherwise', () => {
    const shadows = Reactor3D.Shadows;
    const prop = at => ({ parent: {}, visible: true, userData: {}, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, at, 0, 0, 1] } });
    const a = prop(1);
    shadows._static.clear();
    shadows._static.add(a);
    shadows._staticHash = NaN;
    assert.equal(shadows._staticChanged(), true, 'the first look is a change');
    assert.equal(shadows._staticChanged(), false, 'nothing moved');
    a.matrixWorld.elements[12] = 2;
    assert.equal(shadows._staticChanged(), true, 'moved');
    assert.equal(shadows._staticChanged(), false);
    a.visible = false;
    assert.equal(shadows._staticChanged(), true, 'hidden');
    shadows._static.add(prop(5));
    assert.equal(shadows._staticChanged(), true, 'arrived');
    assert.equal(shadows._staticChanged(), false);
    Reactor3D._lodSwaps++;
    assert.equal(shadows._staticChanged(), true, 'a level swap changes the silhouette');
    shadows.invalidate();
    assert.equal(shadows._staticChanged(), true, 'asked outright');
    shadows._static.clear();
    shadows._staticHash = NaN;
});

test('a slot keeps its far plane while the reach breathes inside the band', () => {
    const shadows = Reactor3D.Shadows;
    const far = shadows.farFor(6, 0);
    assert.equal(far, 7, 'a little past the reach, on a half-tile step');
    assert.equal(shadows.farFor(5.7, far), far, 'flicker leaves it');
    assert.equal(shadows.farFor(6.9, far), far, 'a pulse up to the plane leaves it');
    assert.equal(shadows.farFor(7.2, far), 8.5, 'past it, a new plane');
    assert.equal(shadows.farFor(3, far), 3.5, 'well under it, a tighter one');
});

test('a character in reach of a light is what makes its dynamic row render', () => {
    const shadows = Reactor3D.Shadows;
    const walker = (x, z) => ({ parent: {}, visible: true, userData: { glbSize: { x: 1, y: 2, z: 1 } }, scale: { x: 1, y: 1, z: 1 },
        matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1] } });
    shadows._dynamic.clear();
    shadows._dynamic.add(walker(10, 10));
    const lamp = { x: 0, y: 1, z: 0, radius: 3 };
    assert.equal(shadows._dynamicWithin(lamp), false, 'ten tiles off, out of a three-tile reach');
    shadows._dynamic.add(walker(4, 0));
    assert.equal(shadows._dynamicWithin(lamp), true, 'four tiles off, but two tall: its span counts');
    shadows._dynamic.clear();
});

test('both atlases are real depth textures in compare mode from the moment they exist, cleared to fully lit', () => {
    // A lit program declares a sampler2DShadow per atlas. three's fallback
    // for a null one is its empty RGBA texture, which the driver rejects at
    // draw time as a texture/sampler mismatch and drops the draw: every
    // lit surface would vanish. The atlas is made, cleared and bound before
    // the first program can name it.
    const three = source3D();
    const at = three.indexOf('_makeAtlas(renderer, size, rows) {');
    const body = three.slice(at, three.indexOf('\n    },', at));
    assert.match(body, /new THREE\.WebGLRenderTarget\(width, height, \{\s*format: THREE\.RedFormat,\s*type: THREE\.UnsignedByteType,/, 'a one-byte colour attachment nothing writes to');
    assert.match(body, /new THREE\.DepthTexture\(width, height, THREE\.UnsignedIntType\)/);
    assert.match(body, /depth\.compareFunction = THREE\.LessEqualCompare;/);
    assert.match(body, /depth\.minFilter = THREE\.LinearFilter;\s*depth\.magFilter = THREE\.LinearFilter;/, 'hardware 2x2 comparison');
    assert.match(body, /renderer\.setRenderTarget\(target\);\s*renderer\.clear\(true, true, false\);\s*renderer\.setRenderTarget\(was\);/, 'cleared at birth, so an unrendered row reads as lit');
    const ensure = three.slice(three.indexOf('_ensureAtlas(renderer) {'), three.indexOf('\n    },', three.indexOf('_ensureAtlas(renderer) {')));
    assert.match(ensure, /this\._atlas = this\._makeAtlas\(renderer, size, rows\);\s*this\._dynAtlas = this\._makeAtlas\(renderer, size, dynRows\);/);
    assert.match(ensure, /this\._bindMaps\(Reactor3D\.lightUniforms\(\)\);/, 'bound as soon as they exist');
    assert.match(ensure, /while \(size \* 6 > max && size > 64\) size >>= 1;/, 'six faces across must fit the context');
    // The tier says how many rows each atlas holds; a weak GPU gets fewer lights, not blurrier faces.
    const full = Reactor3D.SHADOW_QUALITY.full, weak = Reactor3D.SHADOW_QUALITY.weak;
    assert.ok(full.slots > 4 && full.slots <= Reactor3D.SHADOW_SLOTS, 'more than the four cube slots the samplers used to cap');
    assert.ok(weak.slots < full.slots && weak.dynamicSlots < full.dynamicSlots);
    assert.ok(full.staticPerFrame >= 1 && full.dynamicPerFrame >= 1 && weak.staticPerFrame >= 1 && weak.dynamicPerFrame >= 1);
    // Before PIXI draws through the shared context, the atlases leave every 2D unit: its batch
    // shader names sixteen plain samplers and a compare texture on any of them fails the draw.
    assert.match(three, /textures\._boundTextures\.fill\(null\);\n[\s\S]{0,600}?Reactor3D\.Shadows\.unbindFrom\(this\._renderer\);\n\};/);
    const unbind = three.slice(three.indexOf('    unbindFrom(renderer) {'), three.indexOf('\n    },', three.indexOf('    unbindFrom(renderer) {')));
    assert.match(unbind, /gl\.activeTexture\(gl\.TEXTURE0 \+ unit\);\s*gl\.bindTexture\(gl\.TEXTURE_2D, null\);/);
    // The bind, and the grid the shader maps a face into.
    const bind = three.slice(three.indexOf('_bindMaps(uniforms) {'), three.indexOf('\n    }', three.indexOf('_bindMaps(uniforms) {')));
    assert.match(bind, /uniforms\.rrShadowAtlas\.value = atlas \? atlas\.target\.depthTexture : null;/);
    assert.match(bind, /grid\[1\] = atlas \? 1 \/ atlas\.rows : 1;\s*grid\[2\] = dyn \? 1 \/ dyn\.rows : 1;\s*grid\[3\] = atlas \? 1 \/ atlas\.size : 1 \/ 512;/);
});

test('a light with nothing in reach takes no row; rows wait their turn and keep their last rendering; a moved light casts nothing until redrawn', () => {
    const shadows = Reactor3D.Shadows;
    const three = source3D();
    const render = three.slice(three.indexOf('    render(renderer, scene, mapData) {'), three.indexOf('\n    _publish(uniforms) {'));
    assert.match(render, /if \(this\._castersWithin\(candidate, candidate\.far\)\) wanted\.push\(candidate\);/, 'only lights with a caster in reach compete for a row');
    assert.match(render, /const assigned = this\.assign\(wanted, tiles\.length,/);
    assert.match(render, /\.slice\(0, quality\.staticPerFrame \|\| 1\);/, 'a few static rows a frame');
    assert.match(render, /\.slice\(0, quality\.dynamicPerFrame \|\| 1\);/, 'a few dynamic rows a frame');
    assert.match(render, /\.sort\(\(a, b\) => \(a\.valid - b\.valid\) \|\| \(a\.gap - b\.gap\)\)/, 'rows with nothing to show yet first, then the nearest');
    assert.match(render, /\.sort\(\(a, b\) => \(a\.valid - b\.valid\) \|\| \(a\.stamp - b\.stamp\)\)/, 'dynamic rows the longest unrefreshed first');
    assert.match(render, /if \(tile\.id !== candidate\.id \|\| fresh\) \{[\s\S]*?tile\.valid = false;\s*tile\.dirty = true;/, "another light's rendering is not read as this one's");
    assert.match(render, /tile\.want = \{ origin, far, key: keyFor\(origin, far\) \};\s*tile\.dirty = true;/, 'a drifted light asks for a new rendering and keeps reading the old one');
    assert.match(render, /if \(staticChange\.all \|\| this\._touches\(staticChange\.points, tile\.origin, tile\.far\)\) tile\.dirty = true;/, 'a prop change dirties only the rows it stands in');
    assert.match(render, /t\.dirty && \(!t\.valid \|\| this\._frame - t\.stamp >= interval\)/, 'a row that shows something is redrawn no more often than the interval');
    assert.equal(Reactor3D.SHADOW_STATIC_INTERVAL, 10);
    // A rendered-to request is adopted only once its rendering exists.
    const flush = three.slice(three.indexOf('    _flush() {'), three.indexOf('\n    unbindFrom('));
    assert.match(flush, /const to = tile\.want \|\| tile;\s*this\._renderTile\(renderer, scene, this\._atlas, this\._tiles\.indexOf\(tile\), to\.origin, to\.far,/);
    assert.match(flush, /if \(tile\.want\) \{\s*tile\.origin = tile\.want\.origin;\s*tile\.far = tile\.want\.far;\s*tile\.key = tile\.want\.key;\s*tile\.want = null;\s*\}/);
    // A character's rows redraw only once it has really moved.
    assert.equal(Reactor3D.SHADOW_DYNAMIC_MOVE, 0.03);
    const walker = { visible: true, userData: {}, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1] }, traverse(fn) { fn(this); } };
    assert.equal(shadows._dynamicMoved(walker), true, 'the first look is a move');
    assert.equal(shadows._dynamicMoved(walker), false);
    walker.matrixWorld.elements[12] += 0.01;
    assert.equal(shadows._dynamicMoved(walker), false, 'a breath is not a move');
    walker.matrixWorld.elements[12] += 0.025;
    assert.equal(shadows._dynamicMoved(walker), true, 'but it adds up from where it was last reported');
    walker.visible = false;
    assert.equal(shadows._dynamicMoved(walker), true, 'hiding is a move');
    const publish = three.slice(three.indexOf('    _publish(uniforms) {'), three.indexOf('\n    _faceMask('));
    assert.match(publish, /if \(tile\.valid\) shadowOf\[tile\.candidate\.index\] = k;/, 'a light reads its row only once the row is its own');
    assert.match(publish, /if \(!tile \|\| !tile\.valid \|\| tile\.id !== row\.id \|\| tile\.key !== row\.key\) continue;\s*info\[row\.tile \* 4 \+ 2\] = j;/, 'and its dynamic row only with the static one');

    // _touches: a change inside a row's reach, allowing for the caster's own span.
    assert.equal(shadows._touches([{ x: 5, y: 0, z: 0, r: 1 }], { x: 0, y: 0, z: 0 }, 3), false);
    assert.equal(shadows._touches([{ x: 3.5, y: 0, z: 0, r: 1 }], { x: 0, y: 0, z: 0 }, 3), true, 'three tiles of reach plus a one-tile span');
    // _faceMask: a caster above the lamp fills the up face and nothing else; one inside it, every face.
    const prop = (x, y, z, span) => ({ parent: {}, visible: true, userData: { glbSize: { x: span, y: span, z: span } }, scale: { x: 1, y: 1, z: 1 },
        matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1] } });
    const origin = { x: 0, y: 0, z: 0 };
    assert.equal(shadows._faceMask(origin, 6, [prop(0, 4, 0, 1)]), 1 << 2, '+Y only');
    assert.equal(shadows._faceMask(origin, 6, [prop(-4, 0, 0, 1)]), 1 << 1, '-X only');
    assert.equal(shadows._faceMask(origin, 6, [prop(4, 0, 3.5, 1)]), (1 << 0) | (1 << 4), 'on the seam of +X and +Z');
    assert.equal(shadows._faceMask(origin, 6, [prop(0, 0, 0, 1)]), 63, 'the light stands inside it');
    assert.equal(shadows._faceMask(origin, 2, [prop(0, 4, 0, 1)]), 0, 'out of reach');
    const hidden = prop(0, 4, 0, 1); hidden.visible = false;
    assert.equal(shadows._faceMask(origin, 6, [hidden]), 0, 'hidden casts nothing');
    const refused = prop(0, 4, 0, 1); refused.userData.rrShadowCasts = false;
    assert.equal(shadows._faceMask(origin, 6, [refused]), 0, 'refused by the budget casts nothing');
});

test('the dynamic budget is measured from the player, and a party of two reduced characters both cast on the full tier', () => {
    const shadows = Reactor3D.Shadows;
    const layersOf = () => {
        const on = new Set([0]);
        return { enable: l => on.add(l), disable: l => on.delete(l), has: l => on.has(l) };
    };
    const walker = (x, z, triangles, extra) => {
        const mesh = { isMesh: true, layers: layersOf(), geometry: { index: { count: triangles * 3 } } };
        return Object.assign({ parent: {}, visible: true, userData: {}, mesh,
            matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1] },
            traverse(fn) { fn(this); fn(mesh); } }, extra || {});
    };
    // The camera stands behind the party, so the follower is nearer to it.
    const player = walker(10, 10, 149000, { userData: { reactorPlayer: true } });
    const follower = walker(10, 12, 149000);
    shadows._dynamic.clear();
    shadows._casting = new Set();
    shadows._dynamic.add(follower);
    shadows._dynamic.add(player);
    try {
        const focus = shadows._focusPoint(null);
        assert.deepEqual(focus, { x: 10, y: 0, z: 10 }, 'the focus is the player model, not the eye');

        const saved = shadows._quality;
        shadows._quality = { dynamicTriangles: 200000 };
        let result = shadows._budgetDynamic(focus);
        assert.equal(result.casters, 1, "one character fits the weak tier's budget");
        assert.ok(shadows._casting.has(player), 'and it is the player, however near the follower stands to the camera');
        assert.ok(!shadows._casting.has(follower));

        shadows._quality = null;
        delete global.Graphics;
        result = shadows._budgetDynamic(focus);
        assert.equal(result.casters, 2, 'the full tier fits both reduced characters');
        assert.equal(Reactor3D.SHADOW_QUALITY.weak.dynamicTriangles, 200000, 'a reduced character casts on the weak tier too');
        assert.equal(Reactor3D.SHADOW_QUALITY.weak.dynamicInterval, 2, 'at half rate');
        assert.ok(shadows._casting.has(follower) && shadows._casting.has(player));
        shadows._quality = saved;
    } finally {
        shadows._dynamic.clear();
        shadows._casting = new Set();
        shadows._quality = null;
    }
});

test('both viewports render the maps once a frame before the first pass, and the game marks its casters', () => {
    const three = source3D();
    assert.match(three, /scene\.updateMatrixWorld\(\);\n\s*\/\/ The shadow maps, while every group is still visible\.\n\s*if \(mapScene\.renderShadows\) mapScene\.renderShadows\(this\._renderer, null\);/);
    assert.match(three, /group\.add\(object\);\n\s*\/\/ A prop never moves; its map is cached\. An event walks\.\n\s*Reactor3D\.Shadows\.markCaster\(object, !\(typeof character\.eventId === "function"\n\s*&& character\.eventId\(\) >= Reactor3D\.PROP_EVENT_BASE\)\);/);
    // The depth passes run from the sentinel's hook, inside the pass.
    assert.match(three, /mesh\.onBeforeRender = \(\) => this\._flush\(\);/);
    assert.match(three, /this\._pending = \{ renderer, scene, statics: staticJobs, dynamics: dynJobs, activate: !this\._active \};/);
    assert.match(three, /const object = new THREE\.Mesh\(geometry, material\);\n\s*group\.add\(object\);\n[\s\S]{0,300}?Reactor3D\.Shadows\.markCaster\(object, true\);/);
    assert.match(three, /if \(level !== current\) this\._lodSwaps\+\+;/);
    assert.match(three, /Reactor3D\.Shadows\._renderer === this\._renderer\) Reactor3D\.Shadows\.dispose\(\);/);
    // The picture a map stands on (a pinned parallax as ground) is lit like
    // the tiles over it: it is the whole floor of a parallax room.
    assert.match(three, /const geometry = this\.groundPlane\(width, height, lift\);[\s\S]{0,2600}?material\.__reactorShaded = true;\n\s*Reactor3D\.litMaterial\(material\);\n\s*this\._materials\.push\(material\);\n\n\s*const mesh = new THREE\.Mesh\(geometry, material\);\n\s*\/\/ Beneath the tile geometry/);
    // The static rows draw models at their coarsest level, through three's ordinary render with the casters swapped to depth materials.
    assert.match(three, /const swapped = this\._swapCasters\(this\._static\);\s*try \{\s*this\._atCoarsestLod\(\(\) => \{/);
    assert.match(three, /Reactor3D\.SHADOW_LAYER_STATIC, this\._static, tile\.candidate && tile\.candidate\.carrier\);/, 'a light never shadows from the model it rides');
    assert.match(three, /Reactor3D\.SHADOW_LAYER_DYNAMIC, roots, tile\.candidate && tile\.candidate\.carrier\);/);
    assert.match(three, /const hide = exclude && exclude\.parent && exclude\.visible \? exclude : null;\s*if \(hide\) hide\.visible = false;/);
    assert.match(three, /body: spec\.body,\n[\s\S]{0,300}?carrier: object\n\s*\};/, 'a model effect light names its carrier');
    assert.match(three, /carrier: light\.carrier \|\| null\n\s*\}\);/, 'and the candidate carries it to the rows');
    // A nested render must not walk the scene's matrices six times a row, nor paint a background into the atlas.
    assert.match(three, /renderer\.autoClear = false;\s*scene\.matrixWorldAutoUpdate = false;\s*scene\.background = null;/);
    assert.match(three, /renderer\.setRenderTarget\(target\);\s*renderer\.autoClear = autoClear;\s*scene\.matrixWorldAutoUpdate = autoUpdate;\s*scene\.background = background;/);
    // Each face is scissored, cleared and, only when a caster stands in it, drawn.
    const face = three.slice(three.indexOf('_renderFaces(renderer, scene, target, size, row, origin, camera, mask) {'), three.indexOf('\n    },', three.indexOf('_renderFaces(renderer, scene, target, size, row, origin, camera, mask) {')));
    assert.ok(face.indexOf('renderer.clear(false, true, false);') < face.indexOf('for (let face = 0;'), 'all faces are cleared before selective drawing');
    assert.match(face, /camera\.up\.set\(spec\.up\[0\], spec\.up\[1\], spec\.up\[2\]\);\s*camera\.lookAt\(origin\.x \+ spec\.dir\[0\], origin\.y \+ spec\.dir\[1\], origin\.z \+ spec\.dir\[2\]\);/);
    assert.match(face, /renderer\.render\(scene, camera\);/);

    const editor = read('editor/src/MapEditor3D.js');
    assert.match(editor, /lightingManager\?\.feed3D\?\.\(\);\n[\s\S]{0,400}?this\.mapScene\.renderShadows\?\.\(this\.renderer, this\.currentMap\(\)\);\n\s*const scene = this\.mapScene\.scene\(\);/);
    assert.match(editor, /if \(sprite && Reactor3D\.Shadows\) Reactor3D\.Shadows\.markCaster\(mesh, false\);/);
    // Marked once the animation is prepared (a rig can replace the meshes),
    // and a model that moves by its rules alone is a moving caster too.
    const marks = editor.match(/const driver = this\.animateModel\([^\n]*\);\n[\s\S]{0,400}?Reactor3D\.Shadows\.markCaster\(object, this\.movesOnItsOwn\(template, driver\)\);/g) || [];
    assert.equal(marks.length, 2, 'event models and props');

    assert.match(read('runtime/reactor_main.js'), /runtime revision: \d{8}\.\d+/);
});

test("a casting light's maps hold their origin until the light has drifted a quarter tile", () => {
    // A screen glow riding a monitor arm that keeps extending moved a hair
    // every frame, and a row keyed on the exact position redrew the
    // reactor and three consoles six faces each, every frame.
    const three = source3D();
    assert.match(three, /Reactor3D\.SHADOW_STATIC_MOVE = 0\.25;/);
    assert.match(three, /const held = tile\.far === far\s*&& Math\.hypot\(candidate\.x - tile\.origin\.x, candidate\.y - tile\.origin\.y, candidate\.z - tile\.origin\.z\) <= Reactor3D\.SHADOW_STATIC_MOVE;/);
    assert.match(three, /if \(held\) \{\s*tile\.want = null;\s*\} else \{\s*const origin = \{ x: candidate\.x, y: candidate\.y, z: candidate\.z \};/);
    // Rendered from and read from the same origin, or the depth compare is against the wrong place.
    assert.match(three, /camera\.position\.set\(origin\.x, origin\.y, origin\.z\);/);
    assert.match(three, /pos\[at\] = tile\.origin\.x;\s*pos\[at \+ 1\] = tile\.origin\.y;\s*pos\[at \+ 2\] = tile\.origin\.z;/);
    // The tier, slots and budget are said once, so a shadow report carries them.
    assert.match(three, /console\.info\("RPG Reactor shadows: " \+ Reactor3D\.tier\(\) \+ " tier, " \+ tiles\.length \+ " casting light row\(s\), "/);
});

test('moving-caster rows are spent around the eye: the owner focus, then the drawing camera, then a light', () => {
    const shadows = Reactor3D.Shadows;
    const saved = { focus: shadows.focus, cull: Reactor3D.cullCamera, candidates: shadows._candidates, dynamic: shadows._dynamic };
    try {
        shadows._dynamic = new Set();
        shadows._candidates = [{ x: 24.5, y: 2.5, z: 44.5, radius: 7 }];
        shadows.focus = null;
        Reactor3D.cullCamera = null;
        assert.deepEqual(shadows._focusPoint(null), { x: 24.5, y: 2.5, z: 44.5 }, 'nothing better known: the first light');
        // The editor draws with its own camera and hangs it above the map;
        // with a viewport that never answers, the rows used to go to that
        // first light, wherever it stood.
        Reactor3D.cullCamera = { position: { x: 30, y: 13, z: 20 } };
        assert.deepEqual(shadows._focusPoint(null), { x: 30, y: 13, z: 20 }, 'the camera actually drawing');
        shadows.focus = () => ({ x: 37.5, y: 1, z: 7.5 });
        assert.deepEqual(shadows._focusPoint(null), { x: 37.5, y: 1, z: 7.5 }, 'an owner\'s point of interest wins');
        shadows.focus = () => { throw new Error('no view'); };
        assert.deepEqual(shadows._focusPoint(null), { x: 30, y: 13, z: 20 }, 'a failing focus falls through');
    } finally {
        shadows.focus = saved.focus;
        Reactor3D.cullCamera = saved.cull;
        shadows._candidates = saved.candidates;
        shadows._dynamic = saved.dynamic;
    }
});

test('a held row is only traded away after the challenger has outranked it for the dwell', () => {
    const shadows = Reactor3D.Shadows;
    const saved = { frame: shadows._frame, losing: shadows._losing };
    try {
        shadows._frame = 1000;
        shadows._losing = {};
        const a = { id: 'a', rank: -0.5 };
        const b = { id: 'b', rank: -0.4 };
        const swing = { id: 'swing', rank: -0.7 };
        const held = [{ id: 'a' }, { id: 'b' }];
        assert.deepEqual(shadows.assign([a, b, swing], 2, held, 't').map(s => s.id), ['a', 'b'], 'a fresh challenge changes nothing yet');
        shadows._frame += Reactor3D.SHADOW_ROW_DWELL - 1;
        assert.deepEqual(shadows.assign([a, b, swing], 2, held, 't').map(s => s.id), ['a', 'b'], 'still held just short of the dwell');
        shadows._frame += 1;
        assert.deepEqual(shadows.assign([a, b, swing], 2, held, 't').map(s => s.id), ['a', 'swing'], 'the weaker incumbent yields once the challenge has lasted');
        // A sweep that stops before the dwell is forgotten: the count starts over.
        shadows._frame += 10;
        assert.deepEqual(shadows.assign([a, b], 2, held, 't').map(s => s.id), ['a', 'b']);
        shadows._frame += Reactor3D.SHADOW_ROW_DWELL - 5;
        assert.deepEqual(shadows.assign([a, b, swing], 2, held, 't').map(s => s.id), ['a', 'b'], 'a new challenge counts from its own start');
        // A light with nothing in reach leaves at once, dwell or not.
        assert.deepEqual(shadows.assign([a, swing], 2, held, 't').map(s => s.id), ['a', 'swing']);
        // Scopes keep their own counts.
        assert.deepEqual(shadows.assign([a, b, swing], 2, held, 'other').map(s => s.id), ['a', 'b']);
        // A challenger twice as strong as the incumbent is no sweep: it takes the row at once.
        const beam = { id: 'beam', rank: -0.85 };
        assert.deepEqual(shadows.assign([a, b, beam], 2, held, 'fresh').map(s => s.id), ['a', 'beam']);
    } finally {
        shadows._frame = saved.frame;
        shadows._losing = saved.losing;
    }
});

test('rows are ranked on smoothed incident light, so a sweeping cone does not carry them off', () => {
    const shadows = Reactor3D.Shadows;
    const saved = { smooth: shadows._smooth, frame: shadows._frame, candidates: shadows._candidates };
    try {
        shadows._smooth = null;
        shadows._frame = 1;
        shadows._candidates = [];
        const focus = { x: 0, y: 0, z: 0 };
        // A screen five tiles up, reach 50, either aimed at the focus or swung away.
        const at = aim => ({ id: 'screen', x: 0, y: 5, z: 0, lightY: 5, radius: 50, priorityRadius: 50, strength: 1,
            spot: true, ax: 0, ay: -aim, az: Math.sqrt(Math.max(0, 1 - aim * aim)), cosHalf: 0.9 });
        const facing = shadows._incident(at(1), focus);
        const away = shadows._incident(at(0), focus);
        assert.ok(facing > away * 1.1 && facing <= away * (1 + Reactor3D.SHADOW_PRIORITY_HYSTERESIS) + 1e-9, 'aim tips the instantaneous value by no more than a held row\'s margin');
        let smoothed = shadows._smoothedIncident(at(0), focus);
        assert.equal(smoothed, away, 'the first look is taken as it is');
        for (let frame = 0; frame < 30; frame++) { shadows._frame++; smoothed = shadows._smoothedIncident(at(1), focus); }
        assert.ok(smoothed < away + (facing - away) * 0.3, 'half a second of facing moves the ranked value only part of the way: ' + smoothed.toFixed(3));
        for (let frame = 0; frame < 600; frame++) { shadows._frame++; smoothed = shadows._smoothedIncident(at(1), focus); }
        assert.ok(smoothed > facing * 0.95, 'ten seconds of facing and the ranked value has arrived');
    } finally {
        shadows._smooth = saved.smooth;
        shadows._frame = saved.frame;
        shadows._candidates = saved.candidates;
    }
});

