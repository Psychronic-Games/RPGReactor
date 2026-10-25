'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const dir = path.resolve(__dirname, '../src/forge/Character3D');
const Body = require(path.join(dir, 'HumanBody.js'));
const Transfer = require(path.join(dir, 'CharacterOutfitTransfer.js'));
const Outfit = require(path.join(dir, 'CharacterOutfit.js'));
const Model = require(path.join(dir, 'CharacterModel.js'));
const Wardrobe = require(path.join(dir, 'CharacterWardrobe.js'));
const Cloth = require(path.join(dir, 'CharacterCloth.js'));
const Poses = require(path.join(dir, 'CharacterPoses.js'));
const Software = require('./helpers/character-software-renderer.cjs');
const { PNG } = require('pngjs');
const actors = path.resolve(__dirname, '../../template/Demo/3d/Actors');
const sources = [
    ['jolt', 'Jolt Eagle/source/Jolt Eagle.glb'],
    ['max', 'Max Triton/source/Max-Triton.glb'],
    ['vay', 'Vay Drokan/source/Vay Drokan.glb']
];
let pack;
test.before(async () => { pack = await Body.loadPack(); });
const share = (joints, weights, bones, v, match) => {
    let sum = 0;
    for (let k = 0; k < 4; k++) if (match(bones[joints[v * 4 + k]])) sum += weights[v * 4 + k];
    return sum;
};
const isFoot = b => /(?:Foot|ToeBase)$/.test(b.name);
test('import repose preserves actual source sole pitch instead of inheriting shin pitch, including toe-less rigs', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1, muscle: 0.5 }));
    const ours = Transfer.landmarks(built.bones.map(b => b.head), built.bones.map(b => /^Spine/.test(b.name) ? 'Spine' : b.name),
        built.shaped, pack.skinJoints, pack.skinWeights, pack.vertexCount);
    for (const [id, file] of sources) {
        const model = Transfer.readModel(fs.readFileSync(path.join(actors, file)));
        for (const toeLess of [false, true]) {
            const input = toeLess ? Object.assign({}, model, { roles: model.roles.map(r => r && r.replace(/ToeBase$/, 'Foot')) }) : model;
            const posed = Transfer.repose(input, ours);
            for (const side of ['Left', 'Right']) {
                const foot = [];
                for (let v = 0; v < model.positions.length / 3; v++) {
                    let weight = 0;
                    for (let k = 0; k < 4; k++) if ([side + 'Foot', side + 'ToeBase'].includes(model.roles[model.joints[v * 4 + k]])) weight += model.weights[v * 4 + k];
                    if (weight > 0.999) foot.push(v);
                }
                const bottom = Math.min(...foot.map(v => model.positions[v * 3 + 1]));
                const sole = foot.filter(v => model.positions[v * 3 + 1] < bottom + 0.004);
                assert.ok(sole.length > 70, id + ': inspect the real sole, not a single joint');
                const deltaY = sole.map(v => posed.positions[v * 3 + 1] - model.positions[v * 3 + 1]);
                assert.ok(Math.max(...deltaY) - Math.min(...deltaY) < 0.00002,
                    `${id} ${side} toe-less=${toeLess}: import pitched the source sole`);
                const z = sole.map(v => posed.positions[v * 3 + 2]);
                assert.ok(Math.max(...z) - Math.min(...z) > 0.1, 'check both heel and forefoot');
            }
        }
    }
});

test('shipped boots occlude actual foot skin in rest and walking on contrasting bodies', () => {
    for (const [id] of sources) for (const body of [{ gender: 0 }, { gender: 1 }, { gender: 1, extreme: true, weight: 4, muscle: 2 }]) {
        const preset = Wardrobe.PRESETS.find(p => p.id === 'ss_' + id);
        const result = Model.build(pack, Object.assign({}, body, { outfit: preset.items, hair: { style: 'bald' } }), {}, { quality: 'preview', skinSize: 64 });
        const skin = result.parts.find(p => p.name === 'Body');
        const foot = Uint8Array.from({ length: skin.positions.length / 3 }, (_, v) => share(skin.joints, skin.weights, result.bones, v, isFoot) > 0.9 ? 1 : 0);
        const footIndex = [];
        for (let k = 0; k < skin.index.length; k += 3) {
            const a = skin.index[k], b = skin.index[k + 1], c = skin.index[k + 2];
            if (foot[a] && foot[b] && foot[c]) footIndex.push(a, b, c);
        }
        assert.ok(result.parts.some(p => /boots/i.test(p.name) && !p.rrLining && p.index.length > 2000), 'the actual source boots are present');
        if (id === 'jolt' && body.gender === 0) {
            // Positive control: the same camera/depth test must detect the unclipped feet without boots.
            const full = result.built.parts[0].index, bare = [];
            for (let k = 0; k < full.length; k += 3) if (foot[full[k]] && foot[full[k + 1]] && foot[full[k + 2]]) bare.push(full[k], full[k + 1], full[k + 2]);
            const png = PNG.sync.read(Software.render([{ positions: skin.positions, index: Uint32Array.from(bare), color: [255, 0, 255], doubleSided: true }],
                { w: 320, h: 260, yaw: 0.3, pitch: 0.1, dist: 1.25, target: [0, 0.12, 0.02], fov: 0.6 }));
            let pixels = 0;
            for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 70 && png.data[i + 2] > 70 && png.data[i + 1] < 30) pixels++;
            assert.ok(pixels > 500, 'the visibility test detects real exposed foot geometry');
        }
        const clip = Poses.clip(result.bones, 'walk', skin), duration = clip.times[clip.times.length - 1];
        for (const t of [null, 0.25, 0.5, 0.75]) {
            const pose = t == null ? null : Cloth.pose(result.bones, clip, duration * t);
            // Mark actual retained foot triangles magenta and every garment gray. The depth buffer
            // distinguishes exposed skin from tiny mask-ray misses that the outer boot still occludes.
            const meshes = result.parts.map(p => ({
                positions: pose ? Cloth.skin(p, result.bones, pose) : p.positions,
                index: p === skin ? Uint32Array.from(footIndex) : p.index,
                color: p === skin ? [255, 0, 255] : [160, 160, 160], doubleSided: p.doubleSided
            }));
            for (const yaw of [0.3, 1.57, 3.14]) {
                const png = PNG.sync.read(Software.render(meshes, { w: 320, h: 260, yaw, pitch: 0.1, dist: 1.25, target: [0, 0.12, 0.02], fov: 0.6 }));
                let exposed = 0;
                for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 70 && png.data[i + 2] > 70 && png.data[i + 1] < 30) exposed++;
                assert.equal(exposed, 0, `${id} ${JSON.stringify(body)} walk=${t} yaw=${yaw}: ${exposed} exposed foot pixels`);
            }
        }
    }
});

test('fresh footwear imports and encoded outfits retain geometric foot coverage without preset-specific hiding', () => {
    const footIds = [...new Set(pack.body.source)].filter(v => share(pack.skinJoints, pack.skinWeights, pack.bones, v, isFoot) > 0.9);
    assert.ok(footIds.length > 2000, 'both actual body feet are inspected');
    for (const [id, file] of sources) {
        const model = Transfer.readModel(fs.readFileSync(path.join(actors, file)));
        const imported = Transfer.importModel(pack, model, null, { gender: 1 }, ['feet']);
        const encoded = Transfer.encode(imported, { id: 'footwear-regression-' + id });
        const outfit = Transfer.decode(encoded.json, encoded.bytes);
        outfit.key = 'footwear-regression-' + id;
        Transfer.store.outfits.set(outfit.key, outfit);
        try {
            const built = Body.build(pack, Body.normalizeRecipe({ gender: 1 })), frame = {};
            const made = Transfer.buildAll(pack, built, [{}], frame, () => ({ transfer: outfit.key, part: 'outfit', label: 'Imported footwear' }));
            const hidden = new Set(made.flatMap(p => Array.from(p.hidden)));
            for (const v of Outfit.uncovered(pack, built, made.map(p => p.part), hidden, frame)) hidden.delete(v);
            const exposed = footIds.filter(v => !hidden.has(v));
            assert.ok(exposed.length < footIds.length * 0.01, `${id}: ${exposed.length} of ${footIds.length} foot vertices exposed after a new import`);
        } finally {
            Transfer.store.outfits.delete(outfit.key);
            Transfer.store.pending.delete(outfit.key);
            Transfer.store.pictures.delete(outfit.key);
        }
    }
});
