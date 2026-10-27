'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('./helpers/character-quality-matrix.cjs');
const fs = require('node:fs'), path = require('node:path'), { PNG } = require('pngjs');
let pack, eyeSource;
test.before(async () => {
    pack = await Q.Body.loadPack();
    const eye = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/data/eye-brown.png')));
    eyeSource = { width: eye.width, height: eye.height, data: new Uint8Array(eye.data) };
});
const ids = ['klingon', 'vulcan', 'ferengi', 'cardassian', 'andorian'];
const X = require('../src/forge/Character3D/CharacterExpressions.js');

test('named alien presets support both sexes and retain editable bodies across contrasting proportions', () => {
    for (const id of ids) for (const gender of [0, 1]) for (const patch of [{}, { weight: 2, cup: 2 }, { height: -0.6, headSize: 0.6 }, { height: 1.8, muscle: 2.5, headSize: 2.2 }]) {
        const r = Q.Model.withSpecies({ age: 35, gender }, id);
        Object.assign(r, patch, { outfit: [], hair: { style: 'bald' } });
        assert.equal(r.gender, gender);
        assert.equal(r.age, 35);
        const result = Q.Model.build(pack, r, {}, { quality: 'preview', static: true, skinSize: 32, eyeSource });
        assert.deepEqual(Q.inspect(result, { id, group: 'species', recipe: r }, pack).issues, [], id + '/' + gender + '/' + JSON.stringify(patch));
        assert.equal(result.parts[0].positions.length, pack.body.source.length * 3, 'presets use the shared editable mesh');
        assert.equal(result.recipe.species, id);
    }
});

test('Klingon ridges deform connected forehead skin symmetrically, leave the eyes and neck in place, and add no triangles', () => {
    for (const gender of [0, 1]) {
        const r = Q.Model.withSpecies({ age: 35, gender }, 'klingon');
        const P = Q.Body.shape(pack, r), flat = Q.Body.shape(pack, { ...r, morph: { ...r.morph, cranialRidges: 0 } });
        const F = Q.Body.headFields(pack);
        let changed = 0, peak = 0;
        for (let v = 0; v < pack.vertexCount; v++) {
            assert.equal(P[v * 3], flat[v * 3]); assert.equal(P[v * 3 + 1], flat[v * 3 + 1]);
            const dz = P[v * 3 + 2] - flat[v * 3 + 2];
            assert.ok(dz >= -1e-7 && dz < 0.04);
            if (dz > 0.0001) { changed++; assert.ok(F.w[v] >= 0.5); }
            peak = Math.max(peak, dz);
        }
        assert.ok(changed > 80 && peak > 0.006, changed + ' ridge vertices; ' + peak + ' m peak');
        for (const v of F.eyeIds) assert.deepEqual(P.subarray(v * 3, v * 3 + 3), flat.subarray(v * 3, v * 3 + 3));
    }
});

test('alien ear and brow settings remain distinct and species changes clear inherited features', () => {
    const K = Q.Model.withSpecies({ gender: 0 }, 'klingon');
    assert.equal(K.hair.brows.style, 'bushy');
    assert.equal(K.hair.brows.thickness, 1);
    assert.ok(K.hair.brows.height < -0.3, 'brows sit below the cranial ridges');
    const V = Q.Model.withSpecies(K, 'vulcan'), F = Q.Model.withSpecies(V, 'ferengi');
    assert.equal(V.morph.cranialRidges, 0);
    assert.ok(V.shapes.earsPointed > 1 && V.shapes.browAngle > 0);
    assert.equal(V.hair.style, 'pixie'); assert.equal(V.hair.brows.style, 'angry');
    assert.equal(F.hair.style, 'bald'); assert.ok(F.morph.earBowls > 0 && F.shapes.earsRound > 1);
    const human = Q.Model.withSpecies(F, 'human');
    assert.equal(human.gender, 0); assert.equal(human.shapes.earsRound, 0); assert.equal(human.morph.cranialRidges, 0);
    assert.equal(Q.Body.normalizeRecipe({ morph: { cranialRidges: 99 } }).morph.cranialRidges, 3);
});

test('Ferengi ear bowls widen the actual pinnae, preserve eyes, and keep their original surface topology', () => {
    const mask = Q.Body.earMask(pack), F = Q.Body.headFields(pack);
    for (const gender of [0, 1]) {
        const r = Q.Model.withSpecies({ gender }, 'ferengi'), P = Q.Body.shape(pack, r);
        const flat = Q.Body.shape(pack, { ...r, morph: { ...r.morph, earBowls: 0 } });
        const own = [...new Set(pack.body.source)].filter(v => mask[v] > 0.65);
        const width = A => Math.max(...own.map(v => A[v * 3])) - Math.min(...own.map(v => A[v * 3]));
        assert.ok(width(P) > width(flat) * 1.55, 'broad forward-facing ear bowls');
        for (const v of F.eyeIds) assert.deepEqual(P.subarray(v * 3, v * 3 + 3), flat.subarray(v * 3, v * 3 + 3));
        assert.equal(P.length, flat.length);
    }
});

test('species tone ranges drive defaults and seeded colors while ancestry and custom colors remain editable', () => {
    for (const id of ids) {
        const r = Q.Model.withSpecies({ gender: 0, ancestry: { african: 1, asian: 0, caucasian: 0 } }, id);
        assert.ok(Q.Species.skinTones(id).includes(r.skin));
        assert.equal(r.ancestry.african, 1);
        assert.equal(Q.Model.normalize({ ...r, skin: '#123456' }).skin, '#123456');
        assert.equal(Q.Body.withPeople(r, 'european', true).skin, r.skin);
        for (const seed of [1, 19, 581]) {
            const a = Q.Model.random(seed, { species: id });
            assert.ok(Q.Species.skinTones(id).includes(a.skin));
            assert.deepEqual(a, Q.Model.random(seed, { species: id }));
        }
    }
    const V = Q.Model.withSpecies({}, 'vulcan');
    assert.ok(parseInt(V.skin.slice(3, 5), 16) > parseInt(V.skin.slice(5), 16), 'subtle olive cast');
    assert.ok(V.hair.fringe > 0 && Q.Model.withSpecies({}, 'klingon').hair.fringe === 0);
});

test('all alien face controls serialize independently on custom species and reset when changing species', () => {
    const controls = ['cranialRidges', 'cranialLobes', 'earBowls', 'foreheadSpoon', 'facialRidges', 'neckWebbing', 'noseFolds'];
    const r = Q.Model.normalize({ species: 'human', morph: Object.fromEntries(controls.map(k => [k, 0.7])) });
    assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))), r);
    for (const key of controls) {
        assert.equal(r.morph[key], 0.7);
        assert.equal(Q.Model.withSpecies(r, 'human').morph[key], 0);
        assert.equal(Q.Body.normalizeRecipe({ morph: { [key]: -1 } }).morph[key], 0);
    }
    const C = Q.Model.withSpecies({}, 'cardassian');
    assert.ok(C.morph.foreheadSpoon > 0 && C.morph.neckWebbing > 0 && C.morph.facialRidges > 0);
    const H = Q.Model.withSpecies(C, 'human');
    assert.equal(H.skin, Q.Body.DEFAULT_RECIPE.skin);
    for (const key of controls) assert.equal(H.morph[key], 0);
});

test('mixed custom face features and full neck webbing retain valid geometry on both sexes', () => {
    const controls = ['cranialRidges', 'cranialLobes', 'earBowls', 'foreheadSpoon', 'facialRidges', 'neckWebbing', 'noseFolds'];
    for (const gender of [0, 1]) for (const value of [0.7, 2]) {
        const recipe = Q.Model.normalize({ gender, outfit: [], hair: { style: 'bald' }, morph: Object.fromEntries(controls.map(k => [k, value])) });
        const result = Q.Model.build(pack, recipe, {}, { quality: 'preview', skinSize: 32, eyeSource });
        assert.deepEqual(Q.inspect(result, { recipe }, pack).issues, []);
        const r = Q.Model.withSpecies({ gender }, 'cardassian');
        const P = Q.Body.shape(pack, { ...r, morph: { ...r.morph, neckWebbing: 3 } });
        const flat = Q.Body.shape(pack, { ...r, morph: { ...r.morph, neckWebbing: 0 } });
        for (const v of Q.Body.headFields(pack).eyeIds) assert.deepEqual(P.subarray(v * 3, v * 3 + 3), flat.subarray(v * 3, v * 3 + 3));
        assert.ok(P.some((x, i) => i % 3 === 0 && Math.abs(x - flat[i]) > 0.01), 'webbing changes the neck silhouette');
    }
});

test('refined forehead skin replaces coarse faces with bounded detail and exact boundary joins', () => {
    for (const id of ['klingon', 'cardassian']) for (const gender of [0, 1]) for (const patch of [{}, { height: -0.6, headSize: 0.6 }, { height: 1.8, headSize: 2.2 }]) {
        const r = Object.assign(Q.Model.withSpecies({ gender }, id), patch, { outfit: [], hair: { style: 'bald' } });
        const b = Q.Model.build(pack, r, {}, { quality: 'preview', skinSize: 32, eyeSource });
        assert.deepEqual(Q.inspect(b, { recipe: r }, pack).issues, []);
        const detail = b.parts.find(p => p.name === 'Forehead detail'), body = b.parts[0], bind = detail.interpolation;
        assert.ok(detail.index.length / 3 > 1000 && detail.index.length / 3 <= 6500);
        assert.equal(detail.texture, body.texture);
        const logical = Array.from({ length: detail.positions.length / 3 }, (_, i) => {
            const terms = [];
            for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) terms.push([bind.vertices[j], bind.weights[j]]);
            return JSON.stringify(terms.sort((a, c) => a[0] - c[0]));
        });
        const edges = new Map(), key = (a, c) => logical[a] < logical[c] ? logical[a] + ':' + logical[c] : logical[c] + ':' + logical[a];
        for (let t = 0; t < detail.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = detail.index[t + k], c = detail.index[t + (k + 1) % 3], edge = key(a, c);
            if (edges.has(edge)) edges.get(edge).count++; else edges.set(edge, { a, c, count: 1 });
        }
        let joins = 0;
        for (const e of edges.values()) if (e.count === 1) for (const i of [e.a, e.c]) {
            const expected = [0, 0, 0];
            for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) for (let k = 0; k < 3; k++) expected[k] += b.built.shaped[bind.vertices[j] * 3 + k] * bind.weights[j];
            for (let k = 0; k < 3; k++) assert.ok(Math.abs(expected[k] - detail.positions[i * 3 + k]) < 1e-6, 'joined boundary');
            joins++;
        }
        assert.ok(joins > 40);
        const coarse = Q.Model.build(pack, r, {}, { quality: 'preview', static: true, skinSize: 32, eyeSource });
        assert.ok(!coarse.parts.some(p => p.name === 'Forehead detail'));
        assert.ok(body.index.length < coarse.parts[0].index.length, 'replaces coarse skin instead of overlapping it');
    }
});

test('forehead detail follows facial expressions through its source bindings and exports skin and morph targets', async () => {
    for (const id of ['klingon', 'cardassian']) {
        const r = Q.Model.withSpecies({ gender: 1 }, id);
        r.hair = { style: 'bald' }; r.outfit = [];
        const b = Q.Model.build(pack, r, {}, { quality: 'preview', skinSize: 32, eyeSource });
        const at = b.parts.findIndex(p => p.name === 'Forehead detail'), part = b.parts[at], bind = part.interpolation;
        const field = X.field(pack, b, 'surprised').delta, posed = X.posedParts(pack, b, 'surprised')[at];
        let changed = 0;
        for (let i = 0; i < part.positions.length / 3; i++) for (let k = 0; k < 3; k++) {
            let expected = part.positions[i * 3 + k];
            for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) expected += field[bind.vertices[j] * 3 + k] * bind.weights[j];
            assert.ok(Math.abs(expected - posed.positions[i * 3 + k]) < 1e-6);
            if (Math.abs(expected - part.positions[i * 3 + k]) > 1e-5) changed++;
        }
        assert.ok(changed > 40);
        b.morphs = X.morphTargets(pack, b, ['surprised', 'viseme_aa']);
        const glb = await Q.Model.toGlb(b, id, () => new Uint8Array([137, 80, 78, 71]));
        const jsonLength = new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true);
        const json = JSON.parse(Buffer.from(glb.subarray(20, 20 + jsonLength)).toString());
        const mesh = json.meshes.find(m => m.name === 'Forehead detail');
        assert.ok(mesh && mesh.primitives[0].attributes.JOINTS_0 != null && mesh.extras.targetNames.includes('surprised'));
    }
});

test('live forehead slider dragging matches a fresh model without retaining the old fine ridges', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, vm = require('node:vm'), Detail = require('../src/forge/Character3D/CharacterDetail.js');
    const scope = { window: {}, console, setTimeout, clearTimeout, THREE, RRHumanBody: Q.Body, RRCharacterDetail: Detail };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    for (const [id, key] of [['klingon', 'cranialRidges'], ['cardassian', 'foreheadSpoon']]) {
        const start = Q.Model.withSpecies({ gender: 1 }, id);
        start.hair = { style: 'bald' }; start.outfit = [];
        const end = Q.Model.normalize({ ...start, morph: { ...start.morph, [key]: 0.5 } });
        const options = { quality: 'preview', skinSize: 32, eyeSource }, result = Q.Model.build(pack, start, {}, options), expected = Q.Model.build(pack, end, {}, options);
        result.parts = result.parts.filter(p => p.name === 'Body' || p.name === 'Forehead detail');
        const meshes = result.parts.map(p => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p.positions), 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(p.normals), 3));
            geometry.setIndex(Array.from(p.index)); return { geometry };
        });
        const b = Object.create(scope.window.Character3DBuilder.prototype);
        Object.assign(b, { pack, recipe: end, _result: result, _view: { meshes, bones: result.bones.map(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })),
            group: { position: { y: 0 }, updateMatrixWorld() {} }, skeleton: { calculateInverses() {} } }, _resumePose() {}, _draw() {} });
        b._fast = b._fastStart(result);
        const shaped = Q.Body.shape(pack, end), normals = Q.Body.normals(shaped, pack.body.source, pack.body.index, pack.vertexCount);
        b._fastApply(shaped, normals, Q.Body.joints(pack, shaped).map(j => j.head));
        const actual = meshes[1].geometry.getAttribute('position').array, target = expected.parts.find(p => p.name === 'Forehead detail').positions;
        assert.equal(actual.length, target.length);
        for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - target[i]) < 4e-6, id + ' live coordinate ' + i);
        meshes.forEach(m => m.geometry.dispose());
    }
});

test('Cardassian neck cords stand out along the sides of the neck, behind the jaw down to the shoulders, on every build', () => {
    const F = Q.Body.headFields(pack), ear = Q.Body.earMask(pack), verts = [...new Set(pack.body.source)];
    const mean = (P, ids) => [0, 1, 2].map(k => ids.reduce((s, v) => s + P[v * 3 + k], 0) / ids.length);
    for (const [gender, patch] of [[0, {}], [1, {}], [1, { weight: 1.6, muscle: 1.5, height: 0.8 }], [0, { weight: -0.6, height: -0.6 }]]) {
        const r = Object.assign(Q.Model.withSpecies({ gender }, 'cardassian'), patch);
        const label = gender + JSON.stringify(patch);
        // The shape with its webbing but without the cords, then the cords laid on it.
        const plain = Q.Body.shape(pack, { ...r, morph: { ...r.morph, neckWebbing: 0 } }), P = Float32Array.from(plain);
        Q.Body.neckCords(pack, P, r.morph.neckWebbing);
        const N = Q.Body.vertexNormals(pack, plain), neck = mean(plain, pack.bones.find(b => b.name === 'Neck').head), head = mean(plain, pack.bones[F.head].head);
        const lift = v => [0, 1, 2].reduce((s, k) => s + (P[v * 3 + k] - plain[v * 3 + k]) * N[v * 3 + k], 0);
        // On each side, at the top, the middle and the foot of the neck, the cord raises the skin by half a centimeter or more.
        for (const side of [-1, 1]) for (const t of [0.15, 0.45, 0.7]) {
            const y = neck[1] + (head[1] - neck[1]) * t;
            const band = verts.filter(v => Math.abs(plain[v * 3 + 1] - y) < 0.012 && plain[v * 3] * side > 0.03);
            const peak = Math.max(...band.map(lift));
            assert.ok(peak > 0.005, label + ' side ' + side + ' at ' + t + ': ' + peak);
        }
        // Mirrored, outward only where it rises, and the throat's middle, the face, the eyes and the ears stay put.
        let worst = 0;
        for (const v of verts) {
            const d = Math.hypot(P[v * 3] - plain[v * 3], P[v * 3 + 1] - plain[v * 3 + 1], P[v * 3 + 2] - plain[v * 3 + 2]);
            if (Math.abs(plain[v * 3]) < 0.012 || ear[v] > 0.65 || (F.w[v] > 0.9 && plain[v * 3 + 2] > head[2])) worst = Math.max(worst, d);
            assert.ok(d < 0.03, 'bounded');
        }
        assert.ok(worst < 0.0015, label + ' throat and face unmoved: ' + worst);
        for (const v of F.eyeIds) assert.deepEqual(P.subarray(v * 3, v * 3 + 3), plain.subarray(v * 3, v * 3 + 3));
    }
});
