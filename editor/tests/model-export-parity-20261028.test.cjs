'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Editor = require('../src/database/Database3DEditor.js');
const Glb = require('../src/forge/Character3D/CharacterGlb.js');
const R = require('../../runtime/reactor_3d.js');
const { parseGlb } = require('../src/utils/GlbOptimizer.js');
const os = require('node:os');
// The Builder is a browser class; expose it without constructing a UI.
const oldWindow = global.window;
global.window = {};
require('../src/forge/Character3D/Character3DBuilder.js');
const Builder = global.window.Character3DBuilder;
if (oldWindow === undefined) delete global.window; else global.window = oldWindow;

function inspection(t) {
    const previous = global.window;
    global.window = { addEventListener() {} };
    t.after(() => { if (previous === undefined) delete global.window; else global.window = previous; });
    const listeners = {};
    const canvas = { parentElement: { querySelector: () => null }, addEventListener: (name, fn) => { listeners[name] = fn; } };
    const editor = new Editor();
    editor._bindPreviewInput(canvas);
    return { editor, wheel(deltaY, x = 150, y = 60) {
        listeners.wheel({ deltaY, deltaMode: 0, clientX: x, clientY: y, preventDefault() {} });
    } };
}

test('ordinary model zoom keeps the model pivot through zoom reversals and pointer movement', t => {
    const { editor, wheel } = inspection(t);
    editor._viewGoal.pan = { x: 0.2, y: 0.1, z: -0.3 };
    const pivot = editor._orbitCenter(editor._viewGoal.pan);
    editor._pointUnderPointer = () => { throw Error('an ordinary zoom must not move its pivot to a surface'); };
    for (let n = 0; n < 8; n++) wheel(-100);
    for (let n = 0; n < 8; n++) wheel(100, 310, 240);
    assert.deepEqual(editor._orbitCenter(editor._viewGoal.pan), pivot);
    assert.ok(Math.abs(editor._viewGoal.distance - 4) < 1e-10);
    for (let n = 0; n < 100; n++) wheel(-300);
    assert.equal(editor._viewGoal.distance, 0.12);
    for (let n = 0; n < 100; n++) wheel(300);
    assert.equal(editor._viewGoal.distance, 20);
    assert.deepEqual(editor._orbitCenter(editor._viewGoal.pan), pivot);
});

test('rig editing still zooms toward the pointed landmark', t => {
    const { editor, wheel } = inspection(t);
    editor._rigMode = true;
    editor._orbitCenterWorld = () => ({ x: 0, y: 1, z: 0 });
    editor._pointUnderPointer = () => ({ x: 0.5, y: 1.5, z: 0 });
    editor._camera = { position: { distanceTo: () => 4 } };
    wheel(-100);
    assert.ok(editor._viewGoal.distance < 4);
    assert.ok(editor._viewGoal.pan.x > 0 && editor._viewGoal.pan.y > 0);
});

test('compaction preserves every embedded texture named by a material, with original bytes', async () => {
    const bytes = Uint8Array.from({ length: 80 }, (_, i) => i);
    const json = {
        accessors: [{ bufferView: 0 }],
        bufferViews: Array.from({ length: 10 }, (_, i) => ({ byteOffset: i * 8, byteLength: 8 })),
        images: Array.from({ length: 9 }, (_, i) => ({ mimeType: 'image/png', bufferView: i + 1 })),
        textures: Array.from({ length: 8 }, (_, i) => ({ source: i })),
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } },
            normalTexture: { index: 2, texCoord: 1 }, emissiveTexture: { index: 3 }, occlusionTexture: { index: 4 },
            extensions: { KHR_materials_sheen: { sheenColorTexture: { index: 5 } }, KHR_materials_clearcoat: { clearcoatTexture: { index: 6 } } } }]
    };
    json.textures[6].extensions = { KHR_texture_basisu: { source: 7 } };
    const compact = R._workerParts.compactGlb(json, bytes.buffer, 0, bytes.length);
    assert.equal(compact.byteLength, 8, 'geometry remains packed; images are held as shared Blobs');
    for (let i = 0; i < 8; i++) {
        const blob = json.images[i].rrBlob;
        assert.ok(blob instanceof Blob, `material image ${i} survives`);
        assert.ok(Buffer.from(await blob.arrayBuffer()).equals(Buffer.from(bytes.subarray((i + 1) * 8, (i + 2) * 8))), `image ${i} bytes`);
    }
    assert.equal(json.images[8].rrBlob, undefined, 'unreferenced images still release their storage');
});

test('Rhea Voss keeps her actual normal and glow images through the game loader compaction', async () => {
    const file = path.resolve(__dirname, '../../template/Demo/3d/Actors/Rhea Voss/source/Rhea Voss.glb');
    const { json, bin } = parseGlb(fs.readFileSync(file));
    const wanted = new Map();
    for (const mat of json.materials) for (const field of ['normalTexture', 'emissiveTexture']) {
        const info = mat[field];
        if (!info) continue;
        const image = json.images[json.textures[info.index].source], view = json.bufferViews[image.bufferView];
        wanted.set(image, Buffer.from(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)));
    }
    assert.ok(wanted.size >= 2, 'the fixture includes distinct detail and glow images');
    R._workerParts.compactGlb(json, bin.buffer, bin.byteOffset, bin.byteLength);
    for (const [image, expected] of wanted) {
        assert.ok(image.rrBlob instanceof Blob, `${image.name} retained`);
        assert.ok(Buffer.from(await image.rrBlob.arrayBuffer()).equals(expected), `${image.name} byte identity`);
    }
});

const triangle = (name, kind, more = {}) => Object.assign({ name, kind,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]), index: new Uint32Array([0, 1, 2]),
    joints: new Uint16Array(12), weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]) }, more);

test('character GLBs carry the studio metal, skin, eye, cloth and hair material choices', () => {
    const parts = [triangle('Body', 'skin'), triangle('Armor', 'metal', { metalness: 0.5, roughness: 0.6 }),
        triangle('Eyes', 'eye'), triangle('Shirt', 'cloth'), triangle('Hair', 'hair', { cutout: true })];
    const { json } = parseGlb(Glb.toGlb({ parts, bones: [{ name: 'Root', parent: -1, head: [0, 0, 0] }] }, { characterMaterials: true }));
    for (let i = 0; i < parts.length; i++) {
        const look = Glb.materialLook(parts[i]), mat = json.materials[i];
        assert.equal(mat.pbrMetallicRoughness.metallicFactor, look.metalness, parts[i].name);
        assert.equal(mat.pbrMetallicRoughness.roughnessFactor, look.roughness, parts[i].name);
        if (look.sheen) assert.deepEqual(mat.extensions.KHR_materials_sheen.sheenColorFactor, look.sheenColor.map(c => c * look.sheen));
        if (look.clearcoat) assert.equal(mat.extensions.KHR_materials_clearcoat.clearcoatFactor, look.clearcoat);
        if (look.specularIntensity != null) assert.equal(mat.extensions.KHR_materials_specular.specularFactor, look.specularIntensity);
        if (parts[i].cutout) assert.equal(mat.alphaCutoff, look.alphaTest);
    }
});

test('GLB emission above one keeps its intensity instead of clipping it at export', () => {
    const part = triangle('Glow', 'prop', { emissive: '#ffffff', emissiveIntensity: 4 });
    const { json } = parseGlb(Glb.toGlb({ parts: [part], bones: [{ name: 'Root', parent: -1, head: [0, 0, 0] }] }));
    assert.deepEqual(json.materials[0].emissiveFactor, [1, 1, 1]);
    assert.equal(json.materials[0].extensions.KHR_materials_emissive_strength.emissiveStrength, 4);
});

function saveFixture(t) {
    const before = { window: global.window, model: global.RRCharacterModel, event: global.CustomEvent };
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-export-snapshot-'));
    t.after(() => {
        for (const [key, value] of [['window', before.window], ['RRCharacterModel', before.model], ['CustomEvent', before.event]]) {
            if (value === undefined) delete global[key]; else global[key] = value;
        }
        fs.rmSync(folder, { recursive: true, force: true });
    });
    global.window = { dispatchEvent() {} };
    global.CustomEvent = class {};
    const b = Object.create(Builder.prototype), built = [], encoded = [];
    b.recipe = { skin: '#8a5a3c' }; b.pack = {}; b.root = {}; b.name = 'Snapshot';
    b._artPictures = new Map([['tattoo', { width: 1, height: 1, data: new Uint8Array(4) }]]);
    b.cache = { wardrobe: { emblemPictures: new Map([['badge', { width: 1, height: 1, data: new Uint8Array(4) }]]) } };
    b.project = { path: folder }; b._project = () => b.project;
    b._charactersDir = () => path.join(b.project.path, '3d/Characters');
    b._status = () => {}; b._thumbnail = () => null; b._t = value => value;
    b._paintSkinNow = async () => { b.recipe.skin = '#ffffff'; return {}; };
    global.RRCharacterModel = {
        build(pack, recipe, cache, options) {
            assert.ok(options.bodyArtPictures instanceof Map && options.bodyArtPictures.has('tattoo'), 'custom body art survives the snapshot');
            assert.ok(cache.wardrobe.emblemPictures.has('badge'), 'decoded project emblems reach the isolated export atlas');
            assert.notEqual(cache.wardrobe.emblemPictures, b.cache.wardrobe.emblemPictures, 'later preview edits cannot change its picture list');
            built.push(recipe.skin); options.paintSkin?.('skin', {});
            return { recipe, parts: [], clips: [] };
        },
        async toGlb(result) { encoded.push(result.recipe.skin); return Buffer.from('GLB'); }
    };
    return { b, built, encoded, saved: path.join(folder, '3d/Characters/Snapshot') };
}

test('editing while the skin is painted cannot mix design states in a model export', async t => {
    const { b, built, encoded, saved } = saveFixture(t);
    await b.save();
    assert.deepEqual(built, ['#8a5a3c', '#8a5a3c']);
    assert.deepEqual(encoded, ['#8a5a3c']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(saved, 'character.json'))).recipe.skin, '#8a5a3c');
    assert.equal(b.recipe.skin, '#ffffff', 'the later UI edit is retained for the next export');
    assert.equal(b._savingModel, false);
});

test('changing projects during encoding publishes no model into either project', async t => {
    const { b, saved } = saveFixture(t);
    const model = global.RRCharacterModel, encode = model.toGlb;
    model.toGlb = async result => { b.project = { path: b.project.path + '-other' }; return encode(result); };
    await b.save();
    assert.equal(fs.existsSync(saved), false);
    assert.equal(fs.existsSync(b.project.path), false);
    assert.equal(b._savingModel, false);
});

test('the export design is captured before asynchronous project pictures are prepared', async t => {
    const { b, built, saved } = saveFixture(t);
    b._loadOutfitEmblems = async recipe => { assert.equal(recipe.skin, '#8a5a3c'); b.recipe.skin = '#102030'; };
    await b.save();
    assert.deepEqual(built, ['#8a5a3c', '#8a5a3c']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(saved, 'character.json'))).recipe.skin, '#8a5a3c');
});

test('closing the Builder during encoding publishes no model even when its root element is retained', async t => {
    const { b, saved } = saveFixture(t);
    b._view = {};
    const model = global.RRCharacterModel, encode = model.toGlb;
    model.toGlb = async result => { b._view = null; return encode(result); };
    await b.save();
    assert.equal(fs.existsSync(saved), false);
    assert.equal(b._savingModel, false);
});

test('background rebuilds wait until the temporary chibi export model is released', () => {
    const b = Object.create(Builder.prototype), copy = {};
    b._result = copy; b._sheetExporting = { drawing: true }; b._pending = 0;
    b._queueRebuild(); b._rebuild();
    assert.equal(b._rebuildOwed, true);
    assert.equal(b._pending, 0, 'no animation-frame callback can replace the export model');
    assert.equal(b._result, copy);
});

test('inspection keeps the exported physical maps; game materials keep surface maps through cloning', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, loadTexture = R._loadGlbTexture;
    const part = triangle('Armor', 'metal', { texture: 'color', normalTexture: 'normal', normalTexCoord: 1,
        metallicRoughnessTexture: 'orm', metallicRoughnessTexCoord: 1, occlusionTexture: 'orm', occlusionTexCoord: 1,
        uvs1: new Float32Array([0, 0, 4, 0, 0, 4]), emissive: '#ff0000', emissiveTexture: 'color' });
    const bytes = Glb.toGlb({ parts: [part], bones: [{ name: 'Root', parent: -1, head: [0, 0, 0] }] },
        { characterMaterials: true, images: { color: new Uint8Array(4), normal: new Uint8Array(4), orm: new Uint8Array(4) } });
    R._loadGlbTexture = () => new THREE.Texture();
    let studio, game;
    try {
        const read = options => R.readModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '.glb', '', '', options);
        studio = read({ studio: true }); game = read();
    } finally { R._loadGlbTexture = loadTexture; }
    const materials = object => { const out = []; object.traverse(n => { if (n.isMesh) out.push(n.material); }); return out; };
    const physical = materials(studio)[0], basic = materials(game)[0];
    assert.equal(physical.isMeshPhysicalMaterial, true);
    assert.equal(basic.isMeshBasicMaterial, true);
    assert.equal(physical.normalMap.channel, 1);
    assert.equal(physical.roughnessMap.channel, 1);
    assert.ok(physical.aoMap === physical.roughnessMap, 'one packed map, no second texture allocation');
    assert.equal(physical.clearcoat, 0.3);
    assert.ok(physical.emissive.r > 0);
    assert.equal(physical.userData.rrEmissive, undefined, 'physical emission is not injected a second time');
    assert.equal(R.facesLight(physical), false, 'studio materials are lit by the studio once');
    assert.ok(R.surfaceMapsKey(basic).includes('surface1'));
    assert.ok(R.surfaceMapsKey(basic).includes('occlusion1'));
    const clone = R.cloneModelTemplate(game), copied = materials(clone)[0];
    assert.ok(copied.userData.rrSurfaceMap === basic.userData.rrSurfaceMap, 'clones share actual textures');
    assert.ok(copied.userData.rrOcclusionMap === basic.userData.rrOcclusionMap);
    assert.notEqual(copied, basic);
    const shader = { uniforms: {}, vertexShader: 'void main() {\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    R.injectSurfaceOcclusion(basic, shader);
    assert.ok(shader.uniforms.rrOcclusionMap.value === basic.userData.rrOcclusionMap);
    assert.match(shader.fragmentShader, /texture2D\(rrOcclusionMap, vRRUv1\)/);
    for (const object of [clone, game, studio]) object.traverse(n => { n.geometry?.dispose(); n.material?.dispose(); });
});
