'use strict';
// A character made in the game draws its parts that draw alike as one mesh (runtime/reactor_3d_models.js,
// Reactor3D.LayeredParts): the same vertices in the file's order, each with its part's row of what it had, and
// the light's code reading every map and value from that row.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const THREE = global.THREE;
const L = Reactor3D.LayeredParts;

const picture = (width, height, source) => {
    const t = new THREE.Texture({ width, height });
    if (source != null) t.userData.rrGlbImage = source;
    return t;
};

/** A built character's template: parts on one skeleton, each in its node as the GLB loader leaves them. */
function character(specs) {
    const root = new THREE.Group(), content = new THREE.Group(), bone = new THREE.Bone();
    content.add(bone); root.add(content);
    const skeleton = new THREE.Skeleton([bone]);
    const parts = specs.map((spec, k) => {
        const g = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        g.clearGroups();
        const n = g.attributes.position.count;
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
        if (spec.colors) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(0.5), 3));
        if (spec.uv1) g.setAttribute('uv1', g.attributes.uv.clone());
        if (spec.shapes) {
            g.morphAttributes.position = spec.shapes.map(name => { const a = new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(k + 1), 3); a.name = name; return a; });
            g.morphTargetsRelative = true;
        }
        const m = new THREE.MeshBasicMaterial({ side: spec.side ?? THREE.DoubleSide, alphaTest: spec.cut || 0, transparent: !!spec.blend, vertexColors: !!spec.colors });
        if (spec.color) m.color.set(spec.color);
        if (spec.map) m.map = spec.map;
        m.__reactorModel = true;
        if (spec.normal) { m.userData.rrNormalMap = spec.normal; m.userData.rrNormalUv1 = true; m.userData.rrNormalScale = new THREE.Vector2(0.5, -0.5); }
        if (spec.shine) { m.userData.glbShine = { reflect: 0.7, gloss: 0.6, metal: 0.85, tint: '#ffffff' }; m.userData.glbShineOwn = true; }
        if (spec.glow) m.userData.rrEmissive = new THREE.Color(spec.glow);
        Reactor3D.litMaterial(m);
        const mesh = new THREE.SkinnedMesh(g, m);
        if (spec.shapes) mesh.updateMorphTargets();
        mesh.bind(skeleton, new THREE.Matrix4());
        const node = new THREE.Group();
        node.name = spec.name;
        node.add(mesh);
        content.add(node);
        return mesh;
    });
    root.userData.glbTextures = [];
    return { root, parts, skeleton };
}

function stubPictures(t) {
    const pixels = L.pixels, had = global.createImageBitmap;
    L.pixels = async (images, w, h) => new Uint8Array(w * h * 4 * images.length).fill(128);
    global.createImageBitmap = async () => ({});
    t.after(() => { L.pixels = pixels; if (had) global.createImageBitmap = had; else delete global.createImageBitmap; });
}

const meshes = root => { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; };

test('parts that draw alike become one mesh, in the file\'s order, and the parts others find by name stay', async t => {
    stubPictures(t);
    const sheet = picture(1024, 1024, 0), weave = picture(256, 256, 1);
    const { root } = character([
        { name: 'Body' }, { name: 'Trousers', map: sheet, normal: weave, uv1: true }, { name: 'Shirt', map: sheet },
        { name: 'Seams', map: picture(32, 64, 2), cut: 0.5, colors: true }, { name: 'Linings', side: THREE.FrontSide, color: '#336699' },
        { name: 'Hair', map: picture(512, 512, 3), cut: 0.3 }, { name: 'Hair soft', blend: true }
    ]);
    const report = await L.apply(root);
    assert.equal(report.before, 7);
    assert.equal(report.groups, 1);
    const left = meshes(root).map(m => (m.material.userData.rrLayers ? 'merged' : m.parent.name));
    assert.deepEqual(left, ['Body', 'merged', 'Hair', 'Hair soft'], 'the body, hair and blended parts stay; the merged mesh takes its first part\'s place');
    const merged = meshes(root).find(m => m.material.userData.rrLayers);
    assert.deepEqual(merged.userData.rrLayeredParts, ['Trousers', 'Shirt', 'Seams', 'Linings'], 'in the file\'s order: what lies on a garment still draws after it');
    assert.equal(merged.material.side, THREE.DoubleSide, 'both sides when any part is; the single-sided one discards its back');
    assert.equal(merged.material.userData.rrLayers.sided, true);
    assert.equal(merged.material.userData.rrLayers.cut, true);
    assert.equal(merged.renderOrder, 1, 'after the parts that stay apart: a tight garment lies on the body\'s skin');
});

test('each vertex carries its part\'s row, color and skin; one picture is one layer however many textures show it', async t => {
    stubPictures(t);
    const sheetA = picture(1024, 1024, 0), sheetB = picture(1024, 1024, 0);
    const { root, parts } = character([{ name: 'Trousers', map: sheetA }, { name: 'Shirt', map: sheetB }, { name: 'Belt', color: '#ff0000', colors: true }]);
    const counts = parts.map(p => p.geometry.attributes.position.count);
    await L.apply(root);
    const merged = meshes(root)[0], g = merged.geometry, layers = merged.material.userData.rrLayers;
    assert.equal(g.attributes.position.count, counts.reduce((a, b) => a + b));
    assert.deepEqual([g.attributes.rrLayer.getX(0), g.attributes.rrLayer.getX(counts[0]), g.attributes.rrLayer.getX(counts[0] + counts[1])], [0, 1, 2]);
    const red = new THREE.Color('#ff0000');
    const i = counts[0] + counts[1];
    assert.ok(Math.abs(g.attributes.color.getX(i) - 0.5 * red.r) < 1e-6 && g.attributes.color.getY(i) === 0, 'the part\'s color times its vertex colors');
    assert.equal(g.attributes.color.getX(0), 1, 'white where a picture gives the color');
    assert.equal(layers.classes, 1);
    assert.equal(layers.base[0].image.depth, 1, 'the same file image once, though two textures show it');
    const table = layers.table.image.data;
    assert.deepEqual([table[0], table[20], table[40]], [0, 0, -1], 'both garments on layer 0; the belt has no picture');
    assert.equal(merged.skeleton, parts[0].skeleton);
    assert.deepEqual([...merged.bindMatrix.elements], [...new THREE.Matrix4().elements]);
});

test('parts with shapes make their own group, the union of their shapes by name', async t => {
    stubPictures(t);
    const { root } = character([
        { name: 'Eyes', shapes: ['blink', 'viseme_aa'] }, { name: 'Teeth', shapes: ['viseme_aa', 'viseme_O'] },
        { name: 'Shirt' }, { name: 'Trousers' }
    ]);
    await L.apply(root);
    const shaped = meshes(root).find(m => m.morphTargetDictionary && m.morphTargetDictionary.blink != null);
    assert.ok(shaped && shaped.material.userData.rrLayers);
    assert.deepEqual(Object.keys(shaped.morphTargetDictionary), ['blink', 'viseme_aa', 'viseme_O']);
    const aa = shaped.geometry.morphAttributes.position[shaped.morphTargetDictionary.viseme_aa], n = aa.count / 2;
    assert.equal(aa.getX(0), 1, 'the eyes\' own move');
    assert.equal(aa.getX(n), 2, 'the teeth\'s own move');
    const blink = shaped.geometry.morphAttributes.position[shaped.morphTargetDictionary.blink];
    assert.equal(blink.getX(n), 0, 'zero where a part has no such shape');
    assert.equal(meshes(root).filter(m => m.material.userData.rrLayers).length, 2, 'the garments in a group of their own');
});

test('the Builder\'s metal draws in its own group, after the cloth', async t => {
    stubPictures(t);
    const { root } = character([{ name: 'Shirt' }, { name: 'Buckle', shine: true }, { name: 'Belt' }, { name: 'Rivets', shine: true }]);
    await L.apply(root);
    const groups = meshes(root).filter(m => m.material.userData.rrLayers);
    assert.equal(groups.length, 2);
    const metal = groups.find(m => m.material.userData.glbShineOwn), cloth = groups.find(m => !m.material.userData.glbShineOwn);
    assert.deepEqual(metal.userData.rrLayeredParts, ['Buckle', 'Rivets']);
    assert.ok(metal.renderOrder > cloth.renderOrder);
});

test('an instance carries the layers by reference and its program reads each map from the part\'s row', async t => {
    stubPictures(t);
    const { root } = character([
        { name: 'Trousers', map: picture(1024, 1024, 0), normal: picture(256, 256, 1), uv1: true },
        { name: 'Seams', map: picture(32, 64, 2), cut: 0.5 }, { name: 'Lamp', glow: '#ffaa00' }
    ]);
    await L.apply(root);
    const instance = Reactor3D.cloneModelTemplate(root), material = meshes(instance)[0].material;
    assert.equal(material.userData.rrLayers, meshes(root)[0].material.userData.rrLayers, 'shared, not copied through JSON');
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(shader, null);
    const fs = shader.fragmentShader, vs = shader.vertexShader;
    assert.match(vs, /attribute float rrLayer;/);
    assert.match(vs, /vRRLayerRow = rrLayer;/);
    assert.match(fs, /vRRLayerA = texelFetch\(rrLayerTable, ivec2\(0, rrRow\), 0\);/);
    assert.match(fs, /diffuseColor \*= rrLayerBase\(vMapUv\);/);
    assert.doesNotMatch(fs, /#include <map_fragment>/);
    assert.match(fs, /if \(diffuseColor\.a < vRRLayerD\.z\) discard;/, 'cut out per part');
    assert.match(fs, /#define rrEmissive vRRLayerE\.rgb/, 'each part\'s glow');
    assert.equal((fs.match(/uniform highp sampler2DArray rrBase\d;/g) || []).length, 2, 'a sampler for each picture size the group has, no more');
    assert.doesNotMatch(fs, /uniform sampler2D rrNormalMap;/);
    if (/rrPerturbNormal/.test(fs)) assert.match(fs, /rrLayerTexel\(rrDetailArray, vRRLayerA\.y/, 'relief from the part\'s layer');
    assert.equal(shader.uniforms.rrBase0.value, material.userData.rrLayers.base[0]);
    assert.match(material.customProgramCacheKey(), /\|layers2-cut/);
});

test('without decoded pictures or texture arrays nothing is merged', async () => {
    const { root } = character([{ name: 'Shirt' }, { name: 'Trousers' }]);
    const had = global.createImageBitmap;
    delete global.createImageBitmap;
    try { assert.equal(await L.apply(root), null); } finally { if (had) global.createImageBitmap = had; }
    assert.equal(meshes(root).length, 2);
});

test('pictures leave memory once the arrays hold them; a picture a part that stays still shows is kept', async t => {
    stubPictures(t);
    const shared = { width: 1024, height: 1024, close() { this.closed = true; } }, own = { width: 512, height: 512, close() { this.closed = true; } };
    const skin = new THREE.Texture(shared), bodySkin = new THREE.Texture(shared), weave = new THREE.Texture(own);
    skin.userData.rrGlbImage = 0; bodySkin.userData.rrGlbImage = 0; weave.userData.rrGlbImage = 1;
    const { root } = character([{ name: 'Body', map: bodySkin }, { name: 'Eyelids', map: skin }, { name: 'Shirt', map: weave }]);
    await L.apply(root);
    assert.equal(weave.image, null, 'only merged parts drew the weave: let go');
    assert.equal(own.closed, true);
    assert.equal(skin.image, shared, 'the body still draws the same picture');
    assert.ok(!shared.closed);
    const layers = meshes(root).find(m => m.material.userData.rrLayers).material.userData.rrLayers;
    const array = layers.base[0];
    assert.ok(array.image.data, 'pixels until the upload');
    array.onUpdate(array);
    assert.equal(array.image.data, null, 'and none after it');
});

/** A view whose renderer records what is asked of it (runtime 20261105.6: a remote sign-in that never loaded). */
function fakeView({ parallel, compile }) {
    const calls = [];
    const gl = { UNPACK_FLIP_Y_WEBGL: 1, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 2, pixelStorei: (k, v) => calls.push(['pixelStorei', k, v]) };
    const renderer = {
        extensions: { has: name => name === 'KHR_parallel_shader_compile' && parallel },
        compileAsync: () => { calls.push(['compileAsync']); return compile(); },
        getContext: () => gl,
        resetState: () => calls.push(['resetState']),
        initTexture: () => calls.push(['initTexture']),
        getRenderTarget: () => null,
        setRenderTarget: () => {},
        render: () => calls.push(['render']),
    };
    const viewport = { _renderer: renderer, camera: () => new THREE.PerspectiveCamera(), scene: () => null, _resetPixi: () => calls.push(['resetPixi']) };
    return { calls, viewport };
}

test('a character is never held waiting for programs: given up on after a while, and not drawn on programs not ready', async () => {
    const was = { viewport: Reactor3D.viewport, wait: L.WARM_WAIT_MS };
    try {
        L.WARM_WAIT_MS = 30;
        const view = fakeView({ parallel: true, compile: () => new Promise(() => {}) });
        Reactor3D.viewport = () => view.viewport;
        const started = Date.now();
        await L.warmNow(new THREE.Group());
        assert.ok(Date.now() - started < 1000, 'gave up on the wait');
        assert.equal(view.calls.some(c => c[0] === 'render'), false, 'not drawn on programs that are not ready');
    } finally { Reactor3D.viewport = was.viewport; L.WARM_WAIT_MS = was.wait; }
});

test('a staged layer is sent with the 2D layer\'s unpack flags cleared, and PIXI\'s record put right after', async () => {
    const was = { viewport: Reactor3D.viewport, next: L.nextFrame };
    try {
        const view = fakeView({ parallel: true, compile: () => Promise.resolve() });
        Reactor3D.viewport = () => view.viewport;
        L.nextFrame = () => Promise.resolve();
        const array = new THREE.DataArrayTexture(new Uint8Array(4 * 4 * 4 * 2), 4, 4, 2);
        await L.preloadNow([[array]]);
        const sends = view.calls.map((c, i) => [c, i]).filter(([c]) => c[0] === 'initTexture').map(([, i]) => i);
        assert.equal(sends.length, 2);
        for (const i of sends) {
            const before = view.calls.slice(Math.max(0, i - 3), i).map(c => c.join(':'));
            assert.deepEqual(before, ['resetState', 'pixelStorei:1:false', 'pixelStorei:2:false']);
            assert.equal(view.calls[i + 1][0], 'resetPixi');
        }
    } finally { Reactor3D.viewport = was.viewport; L.nextFrame = was.next; }
});
