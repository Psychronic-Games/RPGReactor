'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('./helpers/character-quality-matrix.cjs');
const Detail = require('../src/forge/Character3D/CharacterDetail.js');
const Props = require('../src/forge/Character3D/CharacterProps.js');
let pack, eyeSource;
test.before(async () => { pack = await Q.Body.loadPack(); const image = require('pngjs').PNG.sync.read(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/data/eye-brown.png'))); eyeSource = { width: image.width, height: image.height, data: new Uint8Array(image.data) }; options.eyeSource = eyeSource; });
const adult = (gender, anatomy = {}) => Q.Model.normalize({ age: 32, gender, outfit: [], hair: { style: 'bald' }, anatomy: { detail: true, ...anatomy } });
const options = { quality: 'preview', skinSize: 32 };
const maxDifference = (a, b) => { assert.equal(a.length, b.length); let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };

test('fine chest skin replaces the coarse faces, keeps both pigment discs complete, and stays within a local budget', () => {
    for (const gender of [0, 1]) for (const areola of [0.4, 1, 2.5]) {
        const recipe = adult(gender, { areola }), built = Q.Model.build(pack, recipe, {}, options);
        const base = built.parts.find(p => p.name === 'Chest detail'), pigment = built.parts.find(p => p.name === 'Areolas');
        assert.ok(base && pigment && base.index.length === pigment.index.length);
        assert.ok(base.index.length / 3 < 24000, 'local chest budget');
        assert.equal(base.texture, 'skin.png');
        assert.ok(built.parts[0].index.length < pack.body.index.length, 'no old coarse surface underneath');
        assert.ok(maxDifference(base.positions, pigment.positions) < 0.00013, 'pigment follows the exact refined skin');
        const edges = new Map();
        for (let t = 0; t < base.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const pair = [base.index[t + k], base.index[t + (k + 1) % 3]].sort((a, b) => a - b), key = pair.join(':');
            if (!edges.has(key)) edges.set(key, { pair, count: 0 }); edges.get(key).count++;
        }
        for (const edge of edges.values()) if (edge.count === 1) for (const i of edge.pair) for (let k = 0; k < 3; k++) {
            let expected = 0; const bind = base.interpolation;
            for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) expected += built.built.shaped[bind.vertices[j] * 3 + k] * bind.weights[j];
            assert.ok(Math.abs(base.positions[i * 3 + k] - expected) < 2e-7, 'chest boundary remains welded to the body');
        }
        for (const p of [base, pigment]) {
            const bind = p.interpolation;
            for (let i = 0; i < p.positions.length / 3; i++) {
                let total = 0;
                for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) total += bind.weights[j];
                assert.ok(Math.abs(total - 1) < 1e-6);
            }
        }
        for (const side of [-1, 1]) for (let i = 0; i < 48; i++) {
            const angle = i / 48 * 2 * Math.PI, u = 0.5 + Math.cos(angle) * 0.38, v = 0.5 + Math.sin(angle) * 0.38;
            let covered = false;
            for (let t = 0; t < pigment.index.length; t += 3) {
                const ids = Array.from(pigment.index.subarray(t, t + 3));
                if (Math.sign(pigment.positions[ids[0] * 3]) !== side) continue;
                const a = ids.map(i => [pigment.uvs[i * 2], pigment.uvs[i * 2 + 1]]), [A, B, C] = a;
                const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
                if (Math.abs(den) < 1e-12) continue;
                const x = ((B[1] - C[1]) * (u - C[0]) + (C[0] - B[0]) * (v - C[1])) / den;
                const y = ((C[1] - A[1]) * (u - C[0]) + (A[0] - C[0]) * (v - C[1])) / den;
                if (x >= -1e-6 && y >= -1e-6 && x + y <= 1 + 1e-6) { covered = true; break; }
            }
            assert.ok(covered, `complete pigment circle ${gender}/${areola}/${side}/${i}`);
        }
        assert.equal(Q.inspect(built, { recipe }, pack).issues.length, 0, JSON.stringify(Q.inspect(built, { recipe }, pack).issues.slice(0, 3)));
    }
});

test('live chest and genital slider updates agree with fresh geometry, including paired male anatomy', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, scope = { window: {}, THREE, RRHumanBody: Q.Body, RRCharacterDetail: Detail, RRCharacterProps: Props, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    for (const gender of [0, 1]) for (const paired of [false, true]) {
        const start = adult(gender, { paired }), end = Q.Model.normalize({ ...start, anatomy: { ...start.anatomy, nipple: 2, nippleProjection: 3, girth: 0.4 } });
        const built = Q.Model.build(pack, start, {}, options), expected = Q.Model.build(pack, end, {}, options);
        built.parts = built.parts.filter(p => p.name === 'Body' || p.chestDetail || p.anatomicalDetail);
        const meshes = built.parts.map(p => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p.positions), 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(p.normals), 3));
            if (p.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(p.uvs), 2));
            geometry.setIndex(Array.from(p.index)); return { geometry };
        });
        const b = Object.create(scope.window.Character3DBuilder.prototype);
        Object.assign(b, { pack, recipe: end, _result: built, _view: { meshes, bones: built.bones.map(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })),
            group: { position: { y: 0 }, updateMatrixWorld() {} }, skeleton: { calculateInverses() {} } }, _resumePose() {}, _draw() {} });
        b._fast = b._fastStart(built);
        const shaped = Q.Body.shape(pack, end), normals = Q.Body.normals(shaped, pack.body.source, pack.body.index, pack.vertexCount);
        b._fastApply(shaped, normals, Q.Body.joints(pack, shaped).map(j => j.head));
        for (let k = 1; k < built.parts.length; k++) {
            const target = expected.parts.find(p => p.name === built.parts[k].name);
            if (target.chestDetail) assert.ok(maxDifference(meshes[k].geometry.getAttribute('uv').array, target.uvs) < 0.0001, 'projected pigment follows dragging');
            assert.ok(maxDifference(meshes[k].geometry.getAttribute('position').array, target.positions) < 2e-6, built.parts[k].name);
            assert.ok(maxDifference(meshes[k].geometry.getAttribute('normal').array, target.normals) < 0.002, built.parts[k].name + ' normals ' + maxDifference(meshes[k].geometry.getAttribute('normal').array, target.normals));
        }
        meshes.forEach(m => m.geometry.dispose());
    }
});

test('Klingon paired anatomy has two shafts and one shared sac, survives recipes and exported skin bindings', async () => {
    for (const gender of [0, 1]) {
        const r = Q.Model.withSpecies(adult(gender), 'klingon');
        assert.equal(r.anatomy.paired, true); assert.equal(r.anatomy.detail, true);
        assert.equal(Q.Model.normalize(JSON.parse(JSON.stringify(r))).anatomy.paired, true);
        assert.equal(Q.Model.withSpecies(r, 'human').anatomy.paired, false);
        const built = Q.Model.build(pack, r, {}, options), part = built.parts.find(p => p.anatomicalDetail);
        assert.equal(!!part.pairedAnatomy, gender === 1);
        assert.equal(Q.inspect(built, { recipe: r }, pack).issues.length, 0);
        if (!gender) continue;
        const single = Q.Model.build(pack, { ...r, anatomy: { ...r.anatomy, paired: false } }, {}, options).parts.find(p => p.anatomicalDetail);
        assert.ok(part.index.length > single.index.length && part.index.length < single.index.length * 1.8, 'the sac is not duplicated');
        let left = 0, right = 0;
        for (let i = 0; i < part.positions.length / 3; i++) {
            const bind = part.interpolation; let z = 0;
            for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) z += pack.positions[bind.vertices[j] * 3 + 2] * bind.weights[j];
            if (z > 0.13) { if (part.positions[i * 3] < -0.005) left++; if (part.positions[i * 3] > 0.005) right++; }
        }
        assert.ok(left > 80 && right > 80, 'two distinct carried shafts');
        const glb = await Q.Model.toGlb(built, 'Paired anatomy', () => Uint8Array.of(137, 80, 78, 71));
        const json = JSON.parse(Buffer.from(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true))).toString());
        const mesh = json.meshes.find(m => m.name === 'Genitals'), primitive = mesh.primitives[0];
        assert.equal(json.accessors[primitive.attributes.POSITION].count, part.positions.length / 3);
        assert.ok(primitive.attributes.JOINTS_0 != null && primitive.attributes.WEIGHTS_0 != null);
    }
});

test('Andorians have editable white hair, blue palettes and paired scalp-rooted antennae across adult bodies', () => {
    for (const seed of [7, 19, 83]) { const r = Q.Model.random(seed, { species: 'andorian' }); assert.equal(r.hair.color, '#f3f2ec'); assert.equal(r.features.antennae.type, 'andorian'); }
    for (const gender of [0, 1]) for (const headSize of [0.7, 1.6]) {
        const r = Q.Model.withSpecies({ gender, age: 35 }, 'andorian'); r.headSize = headSize;
        assert.equal(r.features.antennae.type, 'andorian'); assert.equal(r.hair.color, '#f3f2ec');
        assert.ok(Q.Species.skinTones('andorian').includes(r.skin));
        const built = Q.Model.build(pack, r, {}, { ...options, static: true });
        assert.equal(Q.inspect(built, { recipe: r }, pack).issues.length, 0);
        const body = Q.Body.build(pack, r), L = Props.landmarks(pack, body);
        const part = Q.Species.build(pack, body, { antennae: r.features.antennae }, L).parts[0];
        for (const side of [-1, 1]) {
            const above = [];
            for (let i = 0; i < part.positions.length; i += 3) if (Math.sign(part.positions[i]) === side) above.push(part.positions[i + 1]);
            assert.ok(Math.max(...above) > L.crown + 0.025, 'antennae clear the scalp');
        }
        assert.equal(Q.Model.withSpecies(r, 'human').features.antennae.type, 'none');
    }
});

test('cat and catfolk retain fine iris textures, fitted lids and valid head geometry in preview and save', () => {
    for (const quality of ['preview', 'save']) {
        const cat = Q.Creature.build(Q.Creature.kindRecipe('cat'), { quality, hairBudget: 0, static: true, headOnly: true });
        const eyes = cat.parts.find(p => p.name === 'Eyes');
        assert.equal(eyes.texture, 'creature-eyes.png');
        assert.equal(eyes.uvs.length, eyes.positions.length / 3 * 2);
        assert.equal(cat.textures[eyes.texture].width, 256);
        assert.equal(Q.inspect(cat, { recipe: cat.recipe }, null).issues.length, 0);
        const r = Q.Model.withSpecies({ age: 32, gender: 0 }, 'catfolk');
        const model = Q.Model.build(pack, r, {}, { ...options, quality, static: true });
        assert.ok(model.parts.some(p => p.texture === 'creature-eyes.png'), 'head graft retains eye texture');
        assert.equal(Q.inspect(model, { recipe: r }, pack).issues.length, 0);
    }
});


test('ogre, orc and troll tusk roots begin inside the lower gum instead of beyond the lips', () => {
    for (const species of ['ogre', 'orc', 'troll']) for (const gender of [0, 1]) {
        const recipe = Q.Model.withSpecies({ gender, age: 32 }, species), built = Q.Body.build(pack, recipe), L = Props.landmarks(pack, built);
        const part = Q.Species.build(pack, built, { tusks: recipe.features.tusks }, L).parts[0];
        // Each tusk is a 13-ring tube with two cap centers; its ring size follows the radius-based rounding of worn pieces.
        const perTusk = part.positions.length / 3 / 2, sides = (perTusk - 2) / 13;
        assert.ok(Number.isInteger(sides) && sides >= 10, 'whole root rings');
        for (const [offset, side] of [[0, 1], [perTusk, -1]]) {
            const root = [0, 0, 0];
            for (let i = 0; i < sides; i++) for (let k = 0; k < 3; k++) root[k] += part.positions[(offset + i) * 3 + k] / sides;
            const front = Math.max(...Array.from(pack.helpers.lowerTeeth.source).filter(v => Math.sign(built.shaped[v * 3]) === side).map(v => built.shaped[v * 3 + 2]));
            assert.ok(root[2] < front - 0.002, species + ' root remains inside the tooth arch');
            assert.ok(root[1] < L.mouth[1] + 0.005, species + ' grows from the lower jaw');
        }
    }
});


test('changing areola sizes retains only a bounded set of local surface layouts', () => {
    for (let i = 0; i < 9; i++) Detail.areolaPatches(pack, 0.02 + i * 0.001);
    assert.ok(pack._areolaPatches.size <= 4);
});

test('saved fine chest surfaces retain projected UVs, skinning and 1024-pixel pigment and relief maps', async () => {
    const built = Q.Model.build(pack, adult(0), {}, { ...options, quality: 'save' });
    assert.equal(built.textures['areola.png'].width, 1024);
    assert.equal(built.textures['areola_n.png'].width, 1024);
    const skin = built.parts.find(p => p.name === 'Chest detail'), pigment = built.parts.find(p => p.name === 'Areolas');
    assert.ok(skin.shaded && pigment.shaded, 'both surfaces retain ambient shading');
    assert.equal(maxDifference(skin.colors, pigment.colors), 0, 'pigment inherits the underlying skin shading');
    const { PNG } = require('pngjs');
    const glb = await Q.Model.toGlb(built, 'Fine chest export', texture => new Uint8Array(PNG.sync.write({ width: texture.width, height: texture.height, data: Buffer.from(texture.data) })));
    const { json } = require('../src/utils/GlbOptimizer.js').parseGlb(glb);
    for (const name of ['Chest detail', 'Areolas']) {
        const mesh = json.meshes.find(m => m.name === name), part = built.parts.find(p => p.name === name), primitive = mesh.primitives[0];
        assert.equal(json.accessors[primitive.attributes.POSITION].count, part.positions.length / 3);
        assert.equal(json.accessors[primitive.attributes.TEXCOORD_0].count, part.uvs.length / 2);
        assert.ok(primitive.attributes.JOINTS_0 != null && primitive.attributes.WEIGHTS_0 != null);
    }
    const areola = json.meshes.find(m => m.name === 'Areolas').primitives[0];
    assert.ok(json.materials[areola.material].normalTexture, 'local relief survives the GLB material');
});

test('extreme bust growth does not inflate the independent areola diameter', () => {
    const pointAt = (part, u, v) => {
        for (let t = 0; t < part.index.length; t += 3) {
            const ids = Array.from(part.index.subarray(t, t + 3));
            if (part.positions[ids[0] * 3] < 0) continue;
            const [A, B, C] = ids.map(i => [part.uvs[i * 2], part.uvs[i * 2 + 1]]);
            const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
            if (Math.abs(den) < 1e-12) continue;
            const x = ((B[1] - C[1]) * (u - C[0]) + (C[0] - B[0]) * (v - C[1])) / den;
            const y = ((C[1] - A[1]) * (u - C[0]) + (A[0] - C[0]) * (v - C[1])) / den;
            if (x >= 0 && y >= 0 && x + y <= 1) return [0, 1, 2].map(k => part.positions[ids[0] * 3 + k] * x + part.positions[ids[1] * 3 + k] * y + part.positions[ids[2] * 3 + k] * (1 - x - y));
        }
        return null;
    };
    for (const profile of [{}, { weight: 2, cup: 2 }, { weight: 3, cup: 3 }]) {
        const recipe = Q.Model.normalize({ ...adult(0), ...profile }), built = Q.Model.build(pack, recipe, {}, options);
        const patch = built.parts.find(p => p.name === 'Areolas'), a = pointAt(patch, 0.14, 0.5), b = pointAt(patch, 0.86, 0.5);
        assert.ok(a && b, 'the whole pigment disc remains on the mesh');
        const diameter = Math.hypot(...a.map((q, k) => q - b[k]));
        assert.ok(diameter > 0.015 && diameter < 0.07, `independent default diameter stays local: ${diameter} m`);
        const skin = built.parts.find(p => p.name === 'Chest detail'), bind = skin.interpolation;
        for (let i = 0; i < skin.positions.length / 3; i++) {
            const expected = [0, 0, 0];
            for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) for (let k = 0; k < 3; k++) expected[k] += built.built.shaped[bind.vertices[j] * 3 + k] * bind.weights[j];
            const moved = Math.hypot(...expected.map((q, k) => q - skin.positions[i * 3 + k]));
            assert.ok(moved < 0.00301, 'fine refinement follows the existing breast rather than replacing its shape');
        }
    }
});
