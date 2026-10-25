'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Body = require('../src/forge/Character3D/HumanBody.js'), Model = require('../src/forge/Character3D/CharacterModel.js');
const Detail = require('../src/forge/Character3D/CharacterDetail.js'), Creature = require('../src/forge/Character3D/CreatureBody.js');
const { inspectAttachments } = require('./quality/character-anatomy-quality.cjs');
const sameBytes=(a,b)=>a.byteLength===b.byteLength&&Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength));
let pack;
test.before(async () => { pack = await Body.loadPack(); });
const recipe = (gender, anatomy = {}) => Model.normalize({ age: 30, gender, outfit: [], hair: { style: 'bald' }, anatomy: { detail: true, ...anatomy } });
function builder(extra = {}) {
    const window = {}, scope = { window, console, setTimeout, clearTimeout, RRHumanBody: Body, RRCharacterDetail: Detail, RRCreatureBody: Creature, RRCharacterSpecies: require('../src/forge/Character3D/CharacterSpecies.js'), ...extra };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    return Object.create(window.Character3DBuilder.prototype);
}

test('nipple projection is independent of diameter, permits a flat tip, and migrates old size-only recipes', () => {
    assert.equal(Body.normalizeRecipe({ anatomy: { nipple: 2 } }).anatomy.nippleProjection, 2);
    assert.equal(Body.normalizeRecipe({ anatomy: { nippleProjection: 9 } }).anatomy.nippleProjection, 9);
    assert.equal(Body.normalizeRecipe({ anatomy: { nippleProjection: 99 } }).anatomy.nippleProjection, 10);
    assert.equal(Body.normalizeRecipe({ anatomy: { nippleProjection: -1 } }).anatomy.nippleProjection, 0);
    for (const gender of [0, 1]) {
        const flat = recipe(gender, { nipple: 1.5, nippleProjection: 0 }), raised = recipe(gender, { nipple: 1.5, nippleProjection: 10 });
        assert.equal(flat.anatomy.nipple, raised.anatomy.nipple);
        const A = Body.shape(pack, flat), B = Body.shape(pack, raised);
        for (const nipple of Body.anatomyFields(pack).nipples) {
            const i = nipple.v * 3, height = Math.hypot(B[i] - A[i], B[i + 1] - A[i + 1], B[i + 2] - A[i + 2]);
            assert.ok(height > (gender ? 0.0089 : 0.0189) && height < (gender ? 0.0091 : 0.0191));
        }
        const normalized = Model.normalize(JSON.parse(JSON.stringify(raised)));
        assert.equal(normalized.anatomy.nippleProjection, 10);
        const cache = {}, options = { quality: 'preview', static: true, skinSize: 32 };
        const a = Model.build(pack, flat, cache, options), b = Model.build(pack, raised, cache, options);
        assert.ok(a.textures['areola.png']===b.textures['areola.png'], 'projection does not repaint the pigment');
    }
});

test('body controls expose flat/raised projection and the animal controls appropriate to each sex/species', () => {
    const b = builder(), controls = [];
    Object.assign(b, { recipe: recipe(0), _slider: s => { controls.push(s); return ''; }, _section: () => '', _color: () => '', _select: () => '', _extremeToggle: () => '', _shapeSliders: () => '', _bodyHairSection: () => '' });
    b._bodyTab();
    const projection = controls.find(s => s.path === 'anatomy.nippleProjection');
    assert.ok(projection && projection.natural[0] === 0 && projection.ends.join('/') === 'Flat/Raised');
    assert.equal(projection.natural[1], 2);
    assert.equal(projection.extreme[1], 10);
    for (const [kind, sex, expected] of [['horse', 'male', ['sheath', 'length', 'girth', 'testicles']], ['horse', 'female', ['vulva', 'udder', 'teats']], ['lion', 'female', ['vulva', 'teats']], ['drake', 'male', []]]) {
        b.recipe = Creature.normalizeRecipe({ ...Creature.kindRecipe(kind), anatomy: { detail: true, sex } }); controls.length = 0; b._bodyTab();
        assert.deepEqual(controls.filter(s => s.path.startsWith('anatomy.')).map(s => s.path.slice(8)).sort(), expected.sort());
    }
});

test('animal controls survive serialization, kind changes and randomization, and reject non-finite values', () => {
    const r = Creature.normalizeRecipe({ kind: 'horse', anatomy: { detail: true, sex: 'male', sheath: 1.6, length: 0.7, girth: 1.3, testicles: 0 } });
    assert.deepEqual(Creature.normalizeRecipe(JSON.parse(JSON.stringify(r))).anatomy, r.anatomy);
    assert.deepEqual(Creature.normalizeRecipe({ ...r, ...Creature.randomRecipe(21, 'lion') }).anatomy, r.anatomy);
    const bad = Creature.normalizeAnatomy({ length: Infinity, girth: NaN, testicles: -7, sheath: 100 });
    assert.equal(bad.length, 0); assert.equal(bad.girth, 1); assert.equal(bad.testicles, 0); assert.equal(bad.sheath, 2.5);
});

test('humanoid genital detail has dedicated UV space, a sharp local picture and bounded geometry', () => {
    for (const gender of [0, 1]) {
        const built = Model.build(pack, recipe(gender), {}, { quality: 'preview', skinSize: 32 });
        const part = built.parts.find(p => p.name === (gender ? 'Genitals' : 'Genital detail'));
        assert.ok(part && part.texture === 'genital.png');
        assert.equal(built.textures['genital.png'].width, 512);
        assert.equal(built.textures['genital_n.png'].width, 512);
        assert.equal(part.normalTexture, 'genital_n.png');
        assert.ok(part.index.length / 3 <= 6000, 'detail stays local');
        const u = Array.from(part.uvs).filter((_, i) => !(i % 2)), v = Array.from(part.uvs).filter((_, i) => i % 2);
        assert.ok(Math.max(...u) - Math.min(...u) > 0.5 && Math.max(...v) - Math.min(...v) > 0.5, 'the surface uses the atlas instead of neighboring body texels');
        assert.ok(part.normals.every(Number.isFinite));
        for (let i = 0; i < part.weights.length; i += 4) assert.ok(Math.abs(part.weights.subarray(i, i + 4).reduce((s, x) => s + x, 0) - 1) < 1e-5);
        assert.ok(!Model.build(pack, { ...recipe(gender), anatomy: { detail: false } }, {}, { quality: 'preview', static: true, skinSize: 32 }).textures['genital.png']);
    }
});

test('refined genital geometry welds UV seams and carries normalized source bindings', () => {
    const a = Body.build(pack, recipe(1));
    const first = Detail.genitalPart(pack, a, { roughness: 0.62 }, false);
    assert.equal(first.index.length / 3, pack.helpers.genital.index.length / 3 * 16);
    const bind = first.interpolation;
    for (let i = 0; i < first.positions.length / 3; i++) {
        let sum = 0;
        for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) {
            assert.ok(bind.vertices[j] >= 0 && bind.vertices[j] < pack.vertexCount);
            sum += bind.weights[j];
        }
        assert.ok(Math.abs(sum - 1) < 1e-6);
    }
    const groups = new Map();
    for (let i = 0; i < first.positions.length / 3; i++) {
        const key = Array.from(first.positions.subarray(i * 3, i * 3 + 3), x => x.toFixed(6)).join();
        if (groups.has(key)) assert.deepEqual(first.normals.subarray(i * 3, i * 3 + 3), first.normals.subarray(groups.get(key) * 3, groups.get(key) * 3 + 3));
        else groups.set(key, i);
    }
});

test('foreskin styles and female fold controls change local geometry and pigment without rebuilding unrelated skin', () => {
    const options = { quality: 'preview', skinSize: 32 };
    for (const gender of [0, 1]) {
        const cache = {}, a = Model.build(pack, recipe(gender), cache, options);
        const change = gender ? { foreskin: 'uncircumcised' } : { innerLabia: 3, clitoris: 3, fold: 2 };
        const b = Model.build(pack, recipe(gender, change), cache, options);
        const part = result => result.parts.find(p => p.anatomicalDetail);
        assert.ok(!sameBytes(part(a).positions, part(b).positions),'local shape changes');
        assert.ok(!sameBytes(a.textures['genital.png'].data, b.textures['genital.png'].data),'local pigment changes');
        if (gender) assert.ok(a.textures['skin.png']===b.textures['skin.png'],'unrelated skin cache is retained');
        assert.ok(a.textures['areola.png']===b.textures['areola.png'],'unrelated pigment cache is retained');
        const shaped = Model.build(pack, recipe(gender, { ...change, length: 2, girth: 2, testicles: 2, nippleProjection: 10 }), cache, options);
        assert.ok(shaped.textures['genital.png']===b.textures['genital.png'], 'shape-only changes retain the local atlas');
        const coarse = Model.build(pack, recipe(gender, change), cache, { ...options, static: true });
        assert.ok(!coarse.textures['genital_n.png'] && !coarse.textures['areola_n.png']);
        assert.ok(part(b).index.length > coarse.parts.find(p => /^(Genitals|Genital detail)$/.test(p.name)).index.length);
    }
    assert.equal(Body.normalizeRecipe({ anatomy: { foreskin: 'unknown' } }).anatomy.foreskin, 'circumcised');
    const controls = [], choices = [], b = builder();
    b.extreme = true; b._slider = s => { controls.push(s); return ''; }; b._select = (path, label, options) => { choices.push({ path, options }); return ''; };
    b._section = b._extremeToggle = b._shapeSliders = b._toggle = b._color = b._bodyHairSection = () => '';
    b.recipe = recipe(1); b._bodyTab();
    assert.deepEqual(Array.from(choices.find(c => c.path === 'anatomy.foreskin').options, q => q[0]), ['circumcised', 'uncircumcised']);
    b.recipe = recipe(0); b._bodyTab();
    for (const field of ['innerLabia', 'clitoris']) assert.deepEqual(Array.from(controls.find(c => c.path === 'anatomy.' + field).extreme), [0, 3]);
});

test('actual creature meshes attach anatomy and tails across kinds, sexes and contrasting proportions', () => {
    for (const kind of Creature.KINDS.filter(k => !k.form)) for (const sex of ['male', 'female']) {
        const r = Creature.normalizeRecipe({ ...Creature.kindRecipe(kind.kind), anatomy: { detail: true, sex } });
        const built = Creature.build(r, { quality: 'preview', hairBudget: 0, static: true, diagnostics: true });
        assert.deepEqual(inspectAttachments(built), [], kind.kind + '/' + sex);
        const anatomy = built.parts.find(p => p.name === 'Anatomy');
        if (kind.kind === 'drake') assert.ok(!anatomy); else assert.ok(anatomy && anatomy.index.length / 3 <= 3200);
    }
    for (const kind of ['lion', 'horse']) for (const sex of ['male', 'female']) {
        const r = Creature.normalizeRecipe({ ...Creature.kindRecipe(kind), girth: 2.2, legLength: 0.4, hipHeight: 0.6, anatomy: { detail: true, sex } });
        assert.deepEqual(inspectAttachments(Creature.build(r, { quality: 'preview', hairBudget: 0, static: true, diagnostics: true })), [], kind + '/compact/' + sex);
    }
    for (const kind of ['cat', 'horse']) {
        const r = Creature.normalizeRecipe({ ...Creature.kindRecipe(kind), anatomy: { detail: true, sex: 'female', vulva: 0.3, udder: 0, teats: 0 } });
        assert.deepEqual(inspectAttachments(Creature.build(r, { quality: 'preview', hairBudget: 0, static: true, diagnostics: true })), [], kind + '/minimum female detail');
    }
});

test('visible length adds a connected free portion while a zero value keeps resting anatomy', () => {
    for (const kind of ['horse', 'lion']) {
        const r = Creature.kindRecipe(kind), build = length => Creature.build({ ...r, anatomy: { detail: true, sex: 'male', length } }, { quality: 'preview', hairBudget: 0, static: true, diagnostics: true });
        const a = build(0), b = build(0.8);
        assert.deepEqual(inspectAttachments(b), []);
        const low = model => { const p = model.parts.find(p => p.name === 'Anatomy').positions; let y = Infinity; for (let i = 1; i < p.length; i += 3) y = Math.min(y, p[i]); return y; };
        assert.ok(low(b) < low(a) - 0.015 * r.size, kind + ' has a free portion rather than only a larger attached lump');
    }
});

test('reused meshes refresh changed UVs, indices, skins and vertex tint without allocating new buffers', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, b = builder({ THREE }), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(12), 4));
    geometry.setIndex([0, 1, 2]);
    const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial()); group.add(mesh);
    b._view = { group, bones: [], skeleton: { calculateInverses() {} }, meshes: [mesh], blob: { scale: { set() {} }, position: {} } }; // the ground shadow is now centered under the body too
    for (const name of ['_restHeights', '_faceFrame', '_resumePose', '_aim', '_draw']) b[name] = () => {};
    const part = { positions: Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0), normals: new Float32Array(9).fill(1), uvs: new Float32Array(6).fill(0.5), colors: new Float32Array(9).fill(0.7),
        joints: new Uint8Array(12).fill(2), weights: new Float32Array(12).fill(0.25), index: Uint32Array.of(0, 2, 1), texture: 'coat.png', keepColors: true,
        emissive: '#ffffff', emissiveIntensity: .35 };
    const uv = geometry.getAttribute('uv');
    b._update({ plan: 'quadruped', parts: [part], bones: [], height: 1 });
    assert.equal(geometry.getAttribute('uv'), uv);
    assert.deepEqual(uv.array, part.uvs); assert.deepEqual(geometry.index.array, Uint16Array.from(part.index));
    assert.deepEqual(geometry.getAttribute('skinIndex').array, Uint16Array.from(part.joints));
    assert.deepEqual(geometry.getAttribute('skinWeight').array, part.weights);
    assert.deepEqual(geometry.getAttribute('color').array, part.colors);
    assert.equal(mesh.material.emissiveIntensity,.35);
    part.emissive = '#ff0000'; part.emissiveIntensity = 0;
    b._update({ plan: 'quadruped', parts: [part], bones: [], height: 1 });
    assert.equal(mesh.material.emissiveIntensity,0);
    assert.ok(mesh.material.emissive.equals(new THREE.Color('#ff0000')), 'reused material takes the new indicator color');
    part.positions = Float32Array.of(0, 0, 0, 4, 0, 0, 0, 1, 0);
    b.recipe = { plan: 'quadruped' };
    let refreshed = 0, uncached = 0;
    const oldClip = {}, newClip = { name: 'Idle' }, boneDefs = [];
    b._view.actions = new Map([['swim', { action: { getClip: () => oldClip } }]]);
    b._view.mixer = { uncacheClip: clip => { assert.equal(clip === oldClip, true); uncached++; } };
    b._syncPose = () => { assert.equal(b._view.boneDefs === boneDefs, true); refreshed++; };
    b._update({ plan: 'quadruped', parts: [part], bones: boneDefs, clips: [newClip], height: 1 });
    assert.equal(b._view.idleClip === newClip, true, 'compatible body changes refresh native clips');
    assert.equal(refreshed, 1); assert.equal(uncached, 1);
    assert.equal(b._view.extent, 4, 'cached bounds refresh when a compatible topology changes size');
    assert.ok(b._view.distance > 9, 'a much larger reused creature is framed again');
    geometry.dispose(); group.children[0].material.dispose();
});

test('live shape dragging regenerates anatomical relief to match a full build', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE;
    for (const gender of [0, 1]) {
    const b = builder({ THREE }), start = recipe(gender), end = recipe(gender, { length: 0.8, girth: 0.7, innerLabia: 2, clitoris: 2 });
    const options = { quality: 'preview', skinSize: 32 };
    const result = Model.build(pack, start, {}, options), expected = Model.build(pack, end, {}, options);
    result.parts = result.parts.filter(p => p.name === 'Body' || p.anatomicalDetail);
    const meshes = result.parts.map(part => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(part.normals), 3));
        geometry.setIndex(Array.from(part.index));
        return { geometry };
    });
    Object.assign(b, { pack, recipe: end, _result: result, _view: { meshes, bones: result.bones.map(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })),
        group: { position: { y: 0 }, updateMatrixWorld() {} }, skeleton: { calculateInverses() {} } }, _resumePose() {}, _draw() {} });
    b._fast = b._fastStart(result);
    const shaped = Body.shape(pack, end), normals = Body.normals(shaped, pack.body.source, pack.body.index, pack.vertexCount);
    b._fastApply(shaped, normals, Body.joints(pack, shaped).map(j => j.head));
    const actual = meshes[1].geometry.getAttribute('position').array, target = expected.parts.find(p => p.anatomicalDetail).positions;
    for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - target[i]) < 4e-6, 'drag matches a full rebuild at coordinate ' + i + ': ' + actual[i] + ' vs ' + target[i]);
    meshes.forEach(m => m.geometry.dispose());
    }
});

test('saved anatomy meshes retain local pictures, skinning and detail budgets', async () => {
    const { PNG } = require('pngjs'), { parseGlb } = require('../src/utils/GlbOptimizer.js');
    for (const r of [recipe(0, { nippleProjection: 0 }), recipe(1, { nippleProjection: 10 }), Creature.normalizeRecipe({ ...Creature.kindRecipe('horse'), anatomy: { detail: true, sex: 'male', length: 0.7, sheath: 1.2 } })]) {
        const built = Model.build(pack, r, {}, { quality: 'save', skinSize: 32 });
        const bytes = await Model.toGlb(built, 'Anatomy', tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); });
        const { json } = parseGlb(bytes), name = r.plan === 'quadruped' ? 'Anatomy' : r.gender === 1 ? 'Genitals' : 'Genital detail';
        const mesh = json.meshes.find(m => m.name === name);
        assert.ok(mesh && json.nodes.some(n => n.mesh === json.meshes.indexOf(mesh) && n.skin != null));
        assert.ok(mesh.primitives[0].attributes.JOINTS_0 != null && mesh.primitives[0].attributes.WEIGHTS_0 != null);
        const part = built.parts.find(p => p.name === name);
        assert.equal(json.accessors[mesh.primitives[0].indices].count, part.index.length);
        if (r.plan !== 'quadruped') {
            assert.equal(built.textures['genital.png'].width, 1024);
            assert.ok(json.images.some(i => i.name === 'genital.png'));
            assert.ok(json.images.some(i => i.name === 'genital_n.png'));
            assert.ok(json.materials[mesh.primitives[0].material].normalTexture);
        } else assert.ok(part.index.length / 3 <= 3200);
        assert.deepEqual(Model.normalize(JSON.parse(JSON.stringify(r))).anatomy, r.anatomy);
    }
});
