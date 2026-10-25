/**
 * Models are lit by which way their faces point: a light lands at full
 * strength on a face turned to it, wraps round the edge, and leaves a floor
 * on the side turned away; map tiles, pieces and terrain keep the light they
 * had. A normal map beside the picture bends that facing.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const Reactor3D = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js'));

const compile = (material, fragment = 'void main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n\t#include <alphahash_fragment>\n}') => {
    const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: fragment };
    Reactor3D.injectLightShader(shader, null, material);
    return shader;
};

test('the light loop weighs each light by the facing a model sets, and nothing else changes', () => {
    for (const glsl of [Reactor3D.lightGlsl(false), Reactor3D.lightGlsl(true, 1), Reactor3D.lightGlsl(true, 5)]) {
        assert.match(glsl, /vec3 rrFaceN = vec3\(0\.0, 1\.0, 0\.0\);\nfloat rrFace = 0\.0;\nuniform vec3 rrKeyColor;\n#ifdef RR_VERTEX_FACE\nvarying vec4 vRRFaceLight;\nfloat rrFaceShare\(vec3 n\) \{/);
        assert.match(glsl, /\}\nvec3 rrLight\(vec3 p\) \{/);
        // A sun's direction is its aim; any other light's is from the point toward it.
        assert.match(glsl, /vec3 rrDL = lc\.w > 2\.5 \? rrLightAim\[i\]\.xyz : -d;/);
        assert.match(glsl, /fall \*= mix\(1\.0, 0\.300 \+ 0\.700 \* clamp\(\(rrNL \+ 0\.500\) \/ 1\.500, 0\.0, 1\.0\), rrFace\);\n\t\t\}\n\t\tsum \+= lc\.rgb \* fall;/);
        assert.match(glsl, /if \(rrFace > 0\.0\) sum -= rrAmbient \* \(rrFace \* 0\.120 \* \(1\.0 - rrFaceN\.y\)\);/);
    }
    // After the shadow: the sun's shade on the ambient is about what blocks it, not which way a face points.
    const shadowed = Reactor3D.lightGlsl(true, 1);
    assert.ok(shadowed.indexOf('rrSunShaded = fall') < shadowed.indexOf('if (rrFace > 0.0) {'));
    // The facing term at its ends, as the shader computes it.
    const term = nl => Reactor3D.MODEL_FACING_FLOOR + (1 - Reactor3D.MODEL_FACING_FLOOR) * Math.min(1, Math.max(0, (nl + Reactor3D.MODEL_FACING_WRAP) / (1 + Reactor3D.MODEL_FACING_WRAP)));
    assert.equal(term(1), 1, 'a face turned to the light takes it whole, as before');
    assert.equal(term(-1), Reactor3D.MODEL_FACING_FLOOR, 'a face turned away keeps a floor: form, never a black cut-out');
    assert.ok(term(0) > 0.5, 'the edge is wrapped');
});

test('a model material sets its facing before its light; tiles and pieces do not', () => {
    const model = { __reactorModel: true, userData: {} };
    const shader = compile(model);
    assert.match(shader.vertexShader, /vRRWorldNormal = normalize\(mat3\(modelMatrix\) \* rrObjN\);/);
    assert.match(shader.fragmentShader, /rrFaceN = rrFN;\n\t\trrFace = rrFL > 1e-8 \? 1\.0 : 0\.0;\n\t\}\n\tif \(rrSelfLit < 1\.0\) diffuseColor\.rgb \*= mix\(rrLight\(vRRWorldPos\)/);
    assert.match(shader.fragmentShader, /if \(dot\(rrFN, cameraPosition - vRRWorldPos\) < 0\.0\) rrFN = -rrFN;/, 'a double-sided face lights from the side seen');
    assert.equal((shader.fragmentShader.match(/varying vec3 vRRWorldNormal;/g) || []).length, 1);
    const tile = compile({ userData: {} });
    assert.doesNotMatch(tile.fragmentShader, /rrFace = rrFL/);
    assert.doesNotMatch(tile.vertexShader, /vRRWorldNormal/);
    assert.doesNotMatch(tile.fragmentShader, /#define RR_VERTEX_FACE/);
    assert.match(shader.fragmentShader, /#define RR_VERTEX_FACE/);
    assert.equal(Reactor3D.facesLight({ __reactorModel: true, __reactorSelfLit: true }), false, 'a glow is not lit at all');
    // Its program is keyed apart, and the quarter-size light pass (which cannot see its normals) leaves it.
    const lit = Reactor3D.litMaterial({ __reactorModel: true, userData: {} });
    assert.match(lit.customProgramCacheKey(), /\|face/);
    // Shine shares the one varying.
    if (typeof THREE !== 'undefined') return;
    const was = Reactor3D.MODEL_FACING;
    try { Reactor3D.MODEL_FACING = false; assert.equal(Reactor3D.facesLight(model), false, 'the switch lights models by distance alone'); } finally { Reactor3D.MODEL_FACING = was; }
});

test('a normal map beside the picture bends the facing; without a picture it is left out', () => {
    const normal = { isTexture: true };
    const withMap = compile({ __reactorModel: true, map: {}, userData: { rrNormalMap: normal, rrNormalScale: { x: 1, y: 1 } } });
    assert.match(withMap.fragmentShader, /uniform sampler2D rrNormalMap;/);
    assert.match(withMap.fragmentShader, /rrFN = rrPerturbNormal\(vRRWorldPos, rrFN, texture2D\(rrNormalMap, vMapUv\)\.xyz \* 2\.0 - 1\.0, vMapUv\);/);
    assert.equal(withMap.uniforms.rrNormalMap.value, normal);
    // No branch around it: its derivatives need every pixel of the quad.
    assert.doesNotMatch(Reactor3D.faceGlsl(true), /if \(dot\(vRRWorldNormal/);
    const bare = compile({ __reactorModel: true, userData: { rrNormalMap: normal, rrNormalScale: { x: 1, y: 1 } } });
    assert.doesNotMatch(bare.fragmentShader, /rrNormalMap/);
});

test('on the weak tier models keep quarter-size lighting and local lights shape their facing', () => {
    const source = require('./helpers/runtime-3d-source.cjs').source3D();
    assert.match(source, /Reactor3D\.facesLight\(this\) \? "if \(rrFace > 0\.0 && rrSelfLit < 1\.0\) diffuseColor\.rgb \*= rrFaceShare\(rrFaceN\);" : ""/);
    assert.doesNotMatch(source, /if \(Reactor3D\.facesLight\(material\)\) return false;/, 'models are not taken out of the quarter-size pass (it cost the weak tier 6 ms on North Haven)');
    // The share as the shader has it: all sun at its facing term, all sky at the face's tilt.
    const glsl = Reactor3D.lightGlsl(false);
    assert.match(glsl, /float w = k \/ max\(k \+ a, 1e-4\);/, 'all packed lights contribute alongside ambient');
    const shader = compile({ __reactorModel: true, userData: {} });
    assert.match(shader.vertexShader, /fall \*= smoothstep/);
    assert.match(shader.vertexShader, /sum\.xyz \+= toward/);
    assert.match(shader.vertexShader, /vRRFaceLight = rrVertexFaceLight\(vRRWorldPos\);/);
    assert.match(glsl, /dot\(n, vRRFaceLight\.xyz\) \/ max\(k, 1e-4\)/);
    assert.doesNotMatch(glsl.slice(glsl.indexOf('float rrFaceShare'), glsl.indexOf('float rrLightGuess')), /for \(/, 'no extra pixel light loop');
    assert.match(glsl, /return \(1\.0 - w\) \* \(1\.0 - 0\.120 \* \(1\.0 - n\.y\)\) \+ w \* t;/);
});

test('a glTF glow is added over the light, its picture where it shares the base picture\'s coordinates', () => {
    const glow = { r: 0.2, g: 0.8, b: 1, isColor: true };
    const plain = { __reactorModel: true, userData: { rrEmissive: glow } };
    assert.equal(Reactor3D.glowKey(plain), '|emit');
    const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    Reactor3D.injectSurfaceGlow(plain, shader);
    assert.match(shader.fragmentShader, /uniform vec3 rrEmissive;[\s\S]*outgoingLight \+= rrEmissive;\n#include <opaque_fragment>/);
    assert.equal(shader.uniforms.rrEmissive.value, glow, 'the material\'s own colour, changed in place to animate it');
    const mapped = { __reactorModel: true, map: {}, userData: { rrEmissive: glow, rrEmissiveMap: { isTexture: true } } };
    assert.equal(Reactor3D.glowKey(mapped), '|emit-map');
    assert.equal(Reactor3D.glowKey({ __reactorModel: true, map: {}, userData: { rrEmissive: glow, rrEmissiveMap: { uuid: 'json' } } }), '|emit', 'a picture that lost its texture through a clone is left out');
    assert.equal(Reactor3D.glowKey({ userData: { rrEmissive: { r: 0, g: 0, b: 0 } } }), '', 'black is no glow');
    // In the quarter-size light a glow stays deferred, divided by about the light the combine multiplies it by.
    const source0 = require('./helpers/runtime-3d-source.cjs').source3D();
    assert.match(source0, /\.replace\(\/outgoingLight \\\+= rrEmissive\/g, "outgoingLight \+= \(1\.0 \/ rrLightGuess\(\)\) \* rrEmissive"\)/);
    assert.match(Reactor3D.lightGlsl(false), /float rrLightGuess\(\) \{ return max\(dot\(rrAmbient \+ rrKeyColor, vec3\(0\.333\)\), 0\.25\); \}/);
    const source = require('./helpers/runtime-3d-source.cjs').source3D();
    assert.match(source, /KHR_materials_emissive_strength/);
    assert.match(source, /Reactor3D\.carrySurfaceData\(mat, cloned\);/, 'an instance keeps its glow, its own copy');
});

test('hair takes a two-lobe strand sheen along its picture\'s v, from the key light', () => {
    const hair = { __reactorModel: true, map: {}, userData: { rrHair: true } };
    assert.equal(Reactor3D.glowKey(hair), '|hair');
    assert.equal(Reactor3D.glowKey({ __reactorModel: true, userData: { rrHair: true } }), '', 'no picture, no strand direction');
    const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    Reactor3D.injectSurfaceGlow(hair, shader);
    const f = shader.fragmentShader;
    assert.match(f, /vec3 rrHT = dot\(vRRHairDir, vRRHairDir\) > 1e-8 \? vRRHairDir : \(rrQ1 \* rrS0\.x - rrQ0 \* rrS1\.x\) \* \(rrHD < 0\.0 \? -1\.0 : 1\.0\);/, 'the loader\'s smooth strand direction, else the way v runs on the surface');
    assert.match(shader.vertexShader, /rrHD = \(skinMatrix \* vec4\(rrHD, 0\.0\)\)\.xyz;/, 'skinned with the hair');
    // A card running up v: every vertex's strand points up the card.
    const quad = { attributes: { position: { count: 4, getX: i => [0, 1, 0, 1][i], getY: i => [0, 0, 2, 2][i], getZ: () => 0 }, uv: { getX: i => [0, 1, 0, 1][i], getY: i => [0, 0, 1, 1][i] } }, index: { array: [0, 1, 2, 2, 1, 3] } };
    const dirs = Reactor3D.hairStrandDirections(quad);
    for (let v = 0; v < 4; v++) assert.deepEqual(Array.from(dirs.slice(v * 3, v * 3 + 3)).map(x => +x.toFixed(6)), [0, 1, 0]);
    assert.ok(f.indexOf('dFdx(vMapUv)') < f.indexOf('if (rrHTL > 1e-14)'), 'derivatives before the branch');
    assert.match(f, /rrHC \*= 1\.0 - clamp\(rrSunShaded, 0\.0, 1\.0\);/, 'no sheen where the sun is shadowed');
    assert.match(f, /outgoingLight \+= rrHC \* rrHNL \* \(0\.060 \* rrP \* mix\(vec3\(1\.0\), diffuseColor\.rgb, 0\.5\) \+ 0\.300 \* rrSec \* diffuseColor\.rgb\);/);
    assert.match(shader.vertexShader, /vRRWorldNormal = /);
    const source = require('./helpers/runtime-3d-source.cjs').source3D();
    assert.match(source, /if \(\/\^\(Hair\|Beard\)\\b\/\.test\(String\(def\.name \|\| ""\)\)\) mat\.userData\.rrHair = true;/);
});

test('a clone keeps the normal and glow pictures and its own glow', () => {
    const THREEish = { Color: class { constructor(r, g, b) { Object.assign(this, { r, g, b, isColor: true }); } clone() { return new this.constructor(this.r, this.g, this.b); } } };
    const glow = new THREEish.Color(1, 0.5, 0);
    const from = { userData: { rrNormalMap: { isTexture: true }, rrNormalScale: { x: 1, y: 1 }, rrEmissiveMap: { isTexture: true }, rrEmissive: glow, rrHair: true } };
    const to = Reactor3D.carrySurfaceData(from, { userData: { rrNormalMap: { uuid: 'json' }, rrEmissive: { r: 1, g: 0.5, b: 0 } } });
    assert.equal(to.userData.rrNormalMap, from.userData.rrNormalMap);
    assert.equal(to.userData.rrEmissiveMap, from.userData.rrEmissiveMap);
    assert.notEqual(to.userData.rrEmissive, glow); assert.equal(to.userData.rrEmissive.isColor, true);
    assert.equal(to.userData.rrHair, true);
});

test('on the weak tier no light in the loop is weighed by facing: the whole light takes the share once, whole-size or quarter-size', () => {
    const model = () => ({ __reactorModel: true, userData: {} });
    const saved = Reactor3D.gpuTierOverride;
    try {
        Reactor3D.gpuTierOverride = 'weak';
        assert.equal(Reactor3D.facesPerLight(), false);
        const f = compile(model()).fragmentShader;
        assert.match(f, /float rrFaceKeep = rrFace;\n\trrFace = 0\.0;\n\tif \(rrSelfLit < 1\.0\) diffuseColor\.rgb \*= mix\(rrLight\(vRRWorldPos\), vec3\(1\.0\), rrSelfLit\);\n\tif \(rrFaceKeep > 0\.0 && rrSelfLit < 1\.0\) diffuseColor\.rgb \*= rrFaceShare\(rrFaceN\);/);
        assert.match(Reactor3D.litMaterial(model()).customProgramCacheKey(), /\|face-share/);
        Reactor3D.gpuTierOverride = 'full';
        assert.doesNotMatch(compile(model()).fragmentShader, /rrFaceKeep/, 'every light weighed on a capable GPU');
        assert.doesNotMatch(Reactor3D.litMaterial(model()).customProgramCacheKey(), /-share/);
    } finally { Reactor3D.gpuTierOverride = saved; }
});
