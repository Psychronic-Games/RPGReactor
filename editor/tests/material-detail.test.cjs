'use strict';
// A material's companions under img/materials: `<Name>_normal.png`, `<Name>_rough.png` and
// `<Name>.json`. They give pieces, rocks and terrain cliffs relief and a modest sheen per pixel,
// and a repeat in tiles; the material pickers do not list them as materials of their own.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(root, 'editor', 'src', 'utils', 'AssetFiles.js'));
const Assets = global.RRAssetFiles;

const basic = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader });
const bitmap = (w = 4, h = 4) => ({ image: { width: w, height: h, tag: 'img' }, width: w, height: h });

/** A scene with the parts materialDetail and pieceMaterial use, loading through `load`. */
function sceneWith(settings) {
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene._scene = new THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    scene._build = 1;
    scene._materialProbe = null;
    scene._materialSettingsLoad = name => (settings && settings[name]) || null;
    return scene;
}

test('settings are kept in range and default to no gloss and no repeat of their own', () => {
    assert.deepEqual(Reactor3D.normalizeMaterialSettings(null), { scale: null, gloss: 0, reflect: 0.5, normalStrength: 1 });
    assert.deepEqual(Reactor3D.normalizeMaterialSettings({ scale: 4.5, gloss: 0.35, reflect: 0.2, normalStrength: 1.2 }), { scale: 4.5, gloss: 0.35, reflect: 0.2, normalStrength: 1.2 });
    assert.deepEqual(Reactor3D.normalizeMaterialSettings({ scale: 100, gloss: 3, reflect: -1, normalStrength: 9 }), { scale: 32, gloss: 1, reflect: 0, normalStrength: 3 });
    assert.deepEqual(Reactor3D.normalizeMaterialSettings({ scale: 0, gloss: 'x', reflect: '', normalStrength: null }), { scale: null, gloss: 0, reflect: 0.5, normalStrength: 1 });
    assert.equal(Reactor3D.normalizeMaterialSettings({ scale: 0.01 }).scale, 0.25);
});

test('a material without companions draws as before; one with them gets maps, settings and repeats', () => {
    const scene = sceneWith({ Rock: { scale: 4.5, gloss: 0.35, normalStrength: 1.2 } });
    const asked = [];
    const load = name => { asked.push(name); return name === 'Plain' || name === 'Rock' ? bitmap() : name === 'Rock_normal' ? null : null; };
    assert.equal(scene.materialDetail('Plain', load), null, 'no maps, no settings');
    assert.equal(scene.materialDetail('Plain', load), null, 'and asked once');
    assert.deepEqual(asked.sort(), ['Plain_normal', 'Plain_rough']);
    assert.equal(scene.materialDetail('Plain_normal', load), null, 'a map is never a material of its own');
    assert.equal(scene.materialDetail(Reactor3D.ROCK_GROUND, load), null);
    const rock = scene.materialDetail('Rock', load);
    assert.equal(rock.maps, false, 'settings alone: a repeat, no maps');
    assert.equal(rock.uvScale.value, 1 / 4.5);
    assert.equal(rock.triScale.value, 1 / 4.5);
    assert.deepEqual(rock.params.value.toArray(), [1.2, 0.35, 0.5, 0]);
    const other = sceneWith({});
    const withMaps = other.materialDetail('Stone', name => (name === 'Stone_normal' ? bitmap() : null));
    assert.equal(withMaps.maps, true);
    assert.equal(withMaps.uvScale.value, 1, 'a box piece repeats once a tile without a scale');
    assert.equal(withMaps.triScale.value, 1 / Reactor3D.ROCK_UV, 'a rock at ROCK_UV');
});

test('the game asks the disk which companions exist, so a missing map never reaches the loader', () => {
    const scene = sceneWith({});
    scene._materialSettingsLoad = null;
    scene._materialProbe = name => name === 'Stone_rough';
    const asked = [];
    scene.materialDetail('Stone', name => { asked.push(name); return null; });
    assert.deepEqual(asked, ['Stone_rough']);
});

test('the maps pack into one texture: normal in rgb, roughness in alpha, rows bottom up', () => {
    // A 1×2 normal map (top pixel red-ish, bottom blue-ish) and a matching roughness map.
    const pixels = { normal: [200, 100, 250, 255, 50, 60, 240, 255], rough: [30, 30, 30, 255, 220, 220, 220, 255] };
    const saved = global.document;
    global.document = {
        createElement: () => {
            let drawn = null;
            return {
                width: 0, height: 0,
                getContext: () => ({
                    clearRect() {},
                    drawImage(image) { drawn = image; },
                    getImageData: () => ({ data: Uint8ClampedArray.from(pixels[drawn.kind]) })
                })
            };
        }
    };
    try {
        const texture = Reactor3D.packMaterialDetail({ kind: 'normal', width: 1, height: 2 }, { kind: 'rough', width: 1, height: 2 }, 1024);
        assert.ok(texture.isDataTexture);
        assert.deepEqual([texture.image.width, texture.image.height], [1, 2]);
        assert.deepEqual(Array.from(texture.image.data), [50, 60, 240, 220, 200, 100, 250, 30], 'the image\'s bottom row first, its roughness in alpha');
        assert.equal(texture.wrapS, THREE.RepeatWrapping);
        assert.equal(texture.generateMipmaps, true);
        const flat = Reactor3D.packMaterialDetail(null, { kind: 'rough', width: 1, height: 2 }, 1024);
        assert.deepEqual(Array.from(flat.image.data.slice(0, 4)), [128, 128, 255, 220], 'no normal map: no relief');
        const smooth = Reactor3D.packMaterialDetail({ kind: 'normal', width: 1, height: 2 }, null, 1024);
        assert.equal(smooth.image.data[3], 0, 'no roughness map: the gloss holds everywhere');
    } finally {
        global.document = saved;
    }
});

test('a box piece takes its repeat and its relief after its colour, before the light', () => {
    const scene = sceneWith({ Stone: { scale: 3.3, gloss: 0.2 } });
    const material = scene.pieceMaterial('Stone', name => (name === 'Stone' || name === 'Stone_normal' ? bitmap() : null));
    const shader = basic();
    material.onBeforeCompile(shader, {});
    assert.match(shader.vertexShader, /vMapUv \*= rrUvScale;/);
    assert.equal(shader.uniforms.rrUvScale.value, 1 / 3.3);
    assert.ok(shader.uniforms.rrDetailMap && shader.uniforms.rrDetailParams, 'its maps and settings are uniforms');
    const fragment = shader.fragmentShader;
    assert.ok(fragment.indexOf('uniform vec4 rrKeyLight;') < fragment.indexOf('vec3 rrDetailShade('), 'the functions come after the light\'s declarations they read');
    assert.ok(fragment.indexOf('rrDetailShade(diffuseColor.rgb') > fragment.indexOf('#include <color_fragment>'), 'after the colour is set');
    assert.ok(fragment.indexOf('rrDetailShade(diffuseColor.rgb') < fragment.indexOf('rrLight(vRRWorldPos)'), 'and before the light multiplies it');
    assert.match(fragment, /texture2D\(rrDetailMap, vMapUv\)/, 'laid as the image is');
    assert.match(material.customProgramCacheKey(), /\|detailmb/);
    // A piece of another material keeps its program.
    const plain = sceneWith({}).pieceMaterial('Wood', name => (name === 'Wood' ? bitmap() : null));
    assert.ok(!/\|detail/.test(plain.customProgramCacheKey()));
    const plainShader = basic();
    plain.onBeforeCompile(plainShader, {});
    assert.ok(!plainShader.fragmentShader.includes('rrDetail') && !plainShader.vertexShader.includes('rrUvScale'));
});

test('a rock lays its relief from three sides at its own repeat; a cap keeps its own repeat', () => {
    const scene = sceneWith({ Rock: { scale: 4.5 } });
    const load = name => (name === 'Rock' || name === 'Rock_normal' || name === 'Rock_rough' ? bitmap() : null);
    const rock = scene.pieceMaterial('Rock', load, null, 'rock');
    const shader = basic();
    rock.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.rrTriScale.value, 1 / 4.5, 'the triplanar repeat follows the settings');
    assert.match(shader.fragmentShader, /rrDetailTriplanar\(rrDetailMap, rrDP, dFdx\(rrDP\), dFdy\(rrDP\)/);
    assert.match(rock.customProgramCacheKey(), /\|detailmt/);
    const cap = scene.pieceMaterial('Rock', load, null, 'both');
    const capShader = basic();
    cap.onBeforeCompile(capShader, {});
    assert.ok(!capShader.vertexShader.includes('rrUvScale'), 'a cap is mapped at ROCK_CAP_UV as before');
    assert.match(capShader.fragmentShader, /rrDetailShade/, 'but still takes the relief');
});

test('the terrain cliff wears its material\'s maps at the rocks\' repeat', () => {
    const scene = sceneWith({ Rock: { scale: 4.5 } });
    const detail = scene.materialDetail('Rock', name => (name === 'Rock_normal' ? bitmap() : null));
    const material = Reactor3D.litMaterial(new THREE.MeshBasicMaterial({ map: new THREE.Texture() }));
    Reactor3D.groundSlopeMaterial(material, 50, 50, new THREE.Texture(), 40, '', detail);
    const shader = basic();
    material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.rrCliffScale, detail.triScale);
    assert.equal(shader.uniforms.rrCliffDetail, detail.map);
    assert.match(shader.fragmentShader, /#define RR_CLIFF_DETAIL/);
    assert.match(shader.fragmentShader, /rrDetailTriplanar\(rrCliffDetail, rrCP, rrCdx, rrCdy/);
    assert.match(material.customProgramCacheKey(), /\|groundslope\|cliffdetail$/);
});

test('the key light is the map\'s sun where there is one, else a light from above', () => {
    const uniforms = Reactor3D.lightUniforms();
    const pos = uniforms.rrLightPos.value, col = uniforms.rrLightColor.value;
    pos.set([5, 2, 5, 4, 80, 150, 40, 150], 0);
    col[3] = 0; col[7] = 3;
    Reactor3D.setKeyLight(uniforms, 2);
    assert.deepEqual(Array.from(uniforms.rrKeyLight.value), [80, 150, 40, 1]);
    Reactor3D.setKeyLight(uniforms, 1);
    assert.deepEqual(Array.from(uniforms.rrKeyLight.value).map(v => Math.round(v * 100) / 100), Reactor3D.KEY_LIGHT_DEFAULT);
    assert.match(Reactor3D.LIGHT_GLSL, /uniform vec4 rrKeyLight;/);
});

test('material pickers list materials, not their normal and roughness maps', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-materials-'));
    for (const name of ['Rock.png', 'Rock_normal.png', 'Rock_rough.png', 'Stone.png', 'Rock.json']) fs.writeFileSync(path.join(dir, name), 'x');
    assert.deepEqual(Assets.listMaterials(dir).map(record => record.imageReference).sort(), ['Rock', 'Stone']);
    assert.equal(Assets.isMaterialCompanion('Rock_normal.png'), true);
    assert.equal(Assets.isMaterialCompanion('Normal'), false);
    const read = rel => fs.readFileSync(path.join(root, 'editor', 'src', rel), 'utf8');
    assert.match(read('PieceBuilderManager.js'), /RRAssetFiles\.listMaterials\(directory\)/);
    assert.match(read('database/DatabaseStructureEditor.js'), /RRAssetFiles\.listMaterials\(/);
    // The steep ground's material is picked from the builder's own list (Build bar › Terrain › Ground).
    assert.match(read('BuildHotbar.js'), /materials: manager\.materials\?\.\(\) \|\| \[\], current: tile\.dataset\.value, blank: this\._tt\('None'\)/);
    assert.doesNotMatch(read('ProjectController.js'), /img', 'materials'/);
    assert.match(read('MapEditor3D.js'), /loadMaterialSettings: name => this\.materialSettings\?\.\[name\] \|\| null/, 'the editor\'s view hands the settings to the scene');
});
