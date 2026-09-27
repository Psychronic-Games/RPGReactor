/**
 * Reflections: a model's surface and a water sheet's look, read, saved and
 * drawn: the world captured into a cube beside the camera, mirrored by
 * shiny materials only, and never read by a renderer that did not draw it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;

test('a model\'s surface is read, clamped, and saved only while it reflects', () => {
    assert.equal(Reactor3D.readModelSurface({}), null, 'no surface: the file\'s own metal stands');
    assert.deepEqual({ ...Reactor3D.readModelSurface({ surface: { reflect: 3, gloss: -1, metal: 0.5, tint: '#FFCC55' } }) },
        { reflect: 1, gloss: 0, metal: 0.5, tint: '#FFCC55' });
    assert.ok('surface' in Reactor3D.readModelTransform({}), 'the transform carries it to every placement');
    const Database3DEditor = require(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'));
    const chrome = { reflect: 1, gloss: 0.95, metal: 1, tint: '#ffffff' };
    const saved = JSON.parse(Database3DEditor.mergeSidecar('{"rig":{"template":"humanoid"}}', [], [], {}, [], undefined, undefined, chrome));
    assert.deepEqual(saved.surface, chrome);
    assert.deepEqual(saved.rig, { template: 'humanoid' }, 'the rest of the file is kept');
    const cleared = JSON.parse(Database3DEditor.mergeSidecar(JSON.stringify(saved), [], [], {}, [], undefined, undefined, { reflect: 0 }));
    assert.equal('surface' in cleared, false, 'a surface that reflects nothing is dropped');
    const kept = JSON.parse(Database3DEditor.mergeSidecar(JSON.stringify(saved), [], [], {}, []));
    assert.deepEqual(kept.surface, chrome, 'a save that does not touch the surface keeps it');
});

test('a shiny material carries the reflection; a plain one compiles as before; a cloned one keeps working', () => {
    const plain = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    const shiny = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    Reactor3D.setMaterialShine(shiny, { reflect: 1, gloss: 0.9, metal: 1, tint: '#ffcc55' });
    assert.ok(Reactor3D.shineOf(shiny) && !Reactor3D.shineOf(plain));
    assert.match(shiny.customProgramCacheKey(), /\|shine/);
    assert.doesNotMatch(plain.customProgramCacheKey(), /\|shine/);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    Reactor3D.injectShine(shiny, shader);
    assert.match(shader.fragmentShader, /textureLod\(rrEnvMap, rrR, rrShine\.y \* rrEnvMaxLod\)/, 'rougher reads a blurrier level');
    assert.ok(shader.uniforms.rrShine.value.isVector4);
    const clone = shiny.clone();
    clone.userData = JSON.parse(JSON.stringify(shiny.userData));
    assert.ok(Reactor3D.shineOf(clone).vector.isVector4, 'userData copied through JSON is made whole again');
    Reactor3D.setMaterialShine(shiny, null);
    assert.equal(Reactor3D.shineOf(shiny), null);
});

test('a renderer that did not draw the capture reflects the studio gradient instead', () => {
    const R = Reactor3D.Reflections;
    R.reset();
    const map = {}, preview = {};
    R._targets = [{ texture: 'cubeA' }, { texture: 'cubeB' }];
    R._front = 1; R._ready = true; R._renderer = map;
    R.bind(map);
    assert.equal(R.uniforms().rrEnvMap.value, 'cubeB');
    assert.equal(R.uniforms().rrEnvFlip.value, 1);
    R.bind(preview);
    assert.notEqual(R.uniforms().rrEnvMap.value, 'cubeB', 'a preview gets the fallback');
    assert.equal(R.uniforms().rrEnvFlip.value, -1);
    R._targets = null; R.reset();
});

test('a water sheet\'s look survives both the runtime\'s and the editor\'s reading of it', () => {
    const sheet = { x0: 0, y0: 0, x1: 3, y1: 3, level: 1, material: 'Water', reflect: 1, gloss: 0.92, tint: '#D8DDE3' };
    const runtime = Reactor3D.normalizeWater(sheet, { width: 10, height: 10 });
    assert.deepEqual([runtime.reflect, runtime.gloss, runtime.tint], [1, 0.92, '#d8dde3']);
    const E = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));
    const map = { width: 10, height: 10, reactor3d: { version: 1, water: [{ x0: 0, y0: 0, x1: 3, y1: 3, level: 1, material: 'Water' }] } };
    assert.ok(E.styleWaterRegion(map, E.water(map)[0], { reflect: 1, gloss: 0.92, tint: '#d8dde3' }));
    assert.deepEqual([E.water(map)[0].reflect, E.water(map)[0].tint], [1, '#d8dde3']);
    assert.ok(E.styleWaterRegion(map, E.water(map)[0], { reflect: 0 }));
    assert.equal('reflect' in E.water(map)[0], false, 'Plain clears the look');
    const material = Reactor3D.waterMaterial(null, runtime);
    assert.equal(material.userData.rrWaterLook.x, 1);
    assert.ok(Math.abs(material.userData.rrWaterLook.y - 0.08) < 1e-6, 'roughness is one less gloss');
});

test('the capture is taken after the shadow maps, in the game and in the editor', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(core, /renderShadows\(this\._renderer, null\);\n\s*\/\/ A face of the reflection capture, from where the camera stands\.\n\s*if \(Reactor3D\.Reflections && this\._camera\) Reactor3D\.Reflections\.update\(this\._renderer, scene, this\._camera\.position, mapScene\.reflectionHidden \? mapScene\.reflectionHidden\(\) : null\);/);
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor, /Reactor3D\.Reflections\.update\(this\.renderer, scene, this\.camera\.position, this\.mapScene\.reflectionHidden\?\.\(\)\)/);
});

test('nothing reflects until its model says so; the capture leaves out the shadow sentinel and the characters', () => {
    const models = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.doesNotMatch(models, /setMaterialShine\(mat, mat\.userData\.glbShine\)/, 'a file\'s metal is a starting point, not on by itself');
    const material = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    material.userData.glbShine = { reflect: 0.7, gloss: 0.6, metal: 1, tint: '#ffffff' };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    Reactor3D.applyModelSurface(mesh, null);
    assert.equal(Reactor3D.shineOf(material), null);
    // The capture: the sentinel and the listed objects are hidden for the face and shown again after.
    const R = Reactor3D.Reflections;
    const sentinel = { visible: true }, hero = { visible: true };
    const seen = [];
    const saved = Reactor3D.Shadows._sentinel;
    Reactor3D.Shadows._sentinel = sentinel;
    R.reset(); R.wanted = true;
    const weak = Reactor3D.isWeakGpu; Reactor3D.isWeakGpu = () => false;
    R._targets = [{ texture: {} }, { texture: {} }];
    R._cameras = [{ position: { set() {} }, updateMatrixWorld() {}, children: [{}, {}, {}, {}, {}, {}] }, { position: { set() {} }, updateMatrixWorld() {}, children: [{}, {}, {}, {}, {}, {}] }];
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, autoClear: false, render: () => seen.push([sentinel.visible, hero.visible]) };
    try {
        R.update(renderer, {}, { x: 0, y: 0, z: 0 }, [hero]);
    } finally {
        Reactor3D.Shadows._sentinel = saved; Reactor3D.isWeakGpu = weak; R._targets = null; R._cameras = null; R.reset();
    }
    assert.deepEqual(seen, [[false, false]], 'both left out of the face');
    assert.deepEqual([sentinel.visible, hero.visible], [true, true], 'and back afterwards');
});
