'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { PNG } = require('pngjs');
const Q = require('./helpers/character-quality-matrix.cjs');
const W = require('../src/forge/Character3D/CharacterWardrobe.js');
const Optimizer = require('../src/utils/GlbOptimizer.js');
const ids = ['starshipCrew', 'commandOfficer', 'surveyTeam', 'reconTeam', 'evaCrew', 'flightCrew'];
let pack, eyeSource;
test.before(async () => {
    pack = await Q.Body.loadPack();
    const eye = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/data/eye-brown.png')));
    eyeSource = { width: eye.width, height: eye.height, data: new Uint8Array(eye.data) };
});
const options = { quality: 'preview', static: true, skinSize: 32, atlasSize: 256, hairBudget: 0.25 };
const outfit = id => W.PRESETS.find(p => p.id === id).items;

test('six sci-fi ensembles retain valid fitted geometry and emissive UV maps across sexes and extreme bodies', () => {
    for (const id of ids) for (const gender of [0, 1]) for (const shape of [{}, { weight: 2, cup: 2 }, { height: -0.6, headSize: 0.6 }, { height: 1.8, muscle: 2.5, headSize: 1.8, shapes: { shoulders: 2, hips: 2 } }]) {
        const recipe = Q.Model.normalize({ age: 30, gender, ...shape, hair: { style: 'bald' }, outfit: outfit(id) });
        const result = Q.Model.build(pack, recipe, {}, { ...options, eyeSource });
        assert.deepEqual(Q.inspect(result, { id, group: 'outfits', recipe }, pack).issues, [], id + '/' + gender + '/' + JSON.stringify(shape));
        const glow = result.textures['outfit-glow.png'];
        assert.ok(glow && glow.width === 256);
        assert.ok(result.parts.some(p => p.emissiveTexture === glow.name));
        assert.ok(glow.data.some((v, i) => i % 4 < 3 && v > 30), 'resolved luminous details');
        assert.ok(result.parts.reduce((sum, p) => sum + p.index.length / 3, 0) < 65000, 'bounded whole-character triangle count');
    }
});

test('light colors and brightness are independent and both maps follow the fitting topology cache', () => {
    const cache = {}, base = { age: 30, gender: 0, hair: { style: 'bald' }, outfit: [{ id: 'techSuit', lightColor: '#ff2020', lightIntensity: 0.8 }] };
    const make = recipe => Q.Model.build(pack, recipe, cache, { ...options, eyeSource });
    const a = make(base), sameFit = make({ ...base, age: 31 });
    // Check identity as a boolean: rendering two full pixel arrays in an
    // assertion diff can exhaust RAM and kill the entire development session.
    for (const name of ['outfit.png', 'outfit-glow.png']) {
        assert.ok(a.textures[name] === sameFit.textures[name], name + ': reuse maps within the same fitting topology');
    }
    const b = make({ ...base, weight: 2 }), sameDetailedFit = make({ ...base, weight: 2 });
    for (const name of ['outfit.png', 'outfit-glow.png']) {
        assert.ok(a.textures[name] !== b.textures[name], name + ': rebuild maps when detailed fitting changes the atlas layout');
        assert.ok(b.textures[name] === sameDetailedFit.textures[name], name + ': reuse the detailed fitting maps');
    }
    const c = make({ ...base, outfit: [{ ...base.outfit[0], lightColor: '#2080ff', lightIntensity: 0.2, lightWidth: 2 }] });
    assert.ok(!Buffer.from(c.textures['outfit-glow.png'].data).equals(Buffer.from(a.textures['outfit-glow.png'].data)), 'light settings change emissive pixels');
    const off = make({ ...base, outfit: [{ ...base.outfit[0], lightIntensity: 0 }] });
    assert.ok(!off.textures['outfit-glow.png']);
    assert.ok(off.parts.every(p => !p.emissiveTexture));
    const invalid = W.normalizeItem({ id: 'evaSuit', lightColor: 'invalid', lightIntensity: Infinity, lightWidth: -4, lightStyle: 'invalid' });
    assert.equal(invalid.lightColor, '#82e5ff'); assert.equal(invalid.lightIntensity, 0.35); assert.equal(invalid.lightWidth, 0.4); assert.equal(invalid.lightStyle, 'badge');
    assert.deepEqual(W.normalizeOutfit(JSON.parse(JSON.stringify(outfit('evaCrew')))), W.normalizeOutfit(outfit('evaCrew')));
    for (const id of ['evaSuit', 'visorhelm', 'gloves', 'magboots']) assert.ok(outfit('evaCrew').some(item => item.id === id), 'complete EVA ensemble: ' + id);
});

test('saved sci-fi outfits embed an emissive map with the same UVs and skin as the fabric', async () => {
    const result = Q.Model.build(pack, { age: 30, gender: 1, outfit: outfit('evaCrew'), hair: { style: 'bald' } }, {}, { ...options, eyeSource });
    const buffer = await Q.Model.toGlb(result, 'EVA', texture => {
        const png = new PNG({ width: texture.width, height: texture.height }); png.data = Buffer.from(texture.data); return new Uint8Array(PNG.sync.write(png));
    });
    const { json } = Optimizer.parseGlb(buffer), image = json.images.findIndex(i => i.name === 'outfit-glow.png');
    assert.ok(image >= 0);
    const material = json.materials.find(m => m.emissiveTexture && json.textures[m.emissiveTexture.index].source === image);
    assert.deepEqual(material.emissiveFactor, [1, 1, 1]);
    const mesh = json.meshes.find(m => m.primitives[0].material === json.materials.indexOf(material));
    assert.ok(mesh.primitives[0].attributes.JOINTS_0 != null && mesh.primitives[0].attributes.TEXCOORD_0 != null);
});

test('hardware indicator brightness survives export, including lights switched off', async () => {
    for (const intensity of [0,.35,1]) {
        const result = Q.Model.build(pack, { gender: 1, hair: { style: 'bald' }, outfit: [{ id: 'techSuit', lightColor: '#ffffff', lightIntensity: intensity }] }, {}, { ...options, eyeSource });
        const buffer = await Q.Model.toGlb(result, 'Indicators', () => new Uint8Array(0));
        const { json } = Optimizer.parseGlb(buffer);
        const material = json.materials.find(m => m.name === 'Field status indicators');
        assert.deepEqual(material.emissiveFactor,[intensity,intensity,intensity]);
    }
    const none = Q.Model.build(pack,{gender:1,hair:{style:'bald'},outfit:[{id:'techSuit',lightStyle:'none',lightIntensity:1}]},{},{...options,eyeSource});
    assert.equal(none.parts.find(p=>p.name==='Field status indicators').emissiveIntensity,0,'None disables hardware emission too');
});

test('recon torso plate interiors clear the fitted fabric on normal and heavy bodies', () => {
    for (const patch of [{ gender: 1 }, { gender: 0, weight: 3.2, cup: 3.5, firmness: .15, shapes: { hips: 1.8, butt: 1.4 } }]) {
        const result = Q.Model.build(pack, { age: 35, ...patch, hair: { style: 'bald' }, outfit: outfit('reconTeam') }, {}, { ...options, eyeSource });
        const cloth = [];
        for (const p of result.parts.filter(p => p.texture === 'outfit.png')) for (let i = 0; i < p.index.length; i += 3) {
            const tri = [0,1,2].map(k => Array.from(p.positions.subarray(p.index[i+k]*3,p.index[i+k]*3+3)));
            cloth.push({ tri, lo: [0,1].map(k => Math.min(...tri.map(v => v[k]))), hi: [0,1].map(k => Math.max(...tri.map(v => v[k]))) });
        }
        const plate = result.parts.find(p => p.name === 'Recon formed plating'), chest = result.bones.findIndex(b => b.name === 'Spine2');
        const torsoJoints = new Set(['Spine','Spine1','Spine2'].map(name => result.bones.findIndex(b => b.name === name)));
        let tested = 0, buried = 0, deepest = 0, furthest = 0;
        for (let i = 0; i < plate.index.length; i += 3) {
            const vertices = [0,1,2].map(k => plate.index[i+k]);
            if (!vertices.every(v => torsoJoints.has(plate.joints[v*4]) && plate.normals[v*3+2] > .25)) continue;
            const [x,y,z] = [0,1,2].map(k => vertices.reduce((sum,v) => sum+plate.positions[v*3+k],0)/3);
            // The closed back plate also has an inward-facing +Z surface.
            if (z <= result.bones[chest].head[2]) continue;
            let front = -Infinity;
            for (const { tri: [a,b,c], lo, hi } of cloth) {
                if (x < lo[0] || x > hi[0] || y < lo[1] || y > hi[1]) continue;
                const d = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
                if (Math.abs(d) < 1e-12) continue;
                const u = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
                const v = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d, w=1-u-v;
                if (Math.min(u,v,w) >= -1e-6) front = Math.max(front,a[2]*u+b[2]*v+c[2]*w);
            }
            if (!Number.isFinite(front)) continue;
            tested++;
            furthest = Math.max(furthest,z-front);
            if (z < front-.003) { buried++; deepest = Math.max(deepest,front-z); }
        }
        assert.ok(tested > 100, 'sampled plate interiors');
        assert.equal(buried, 0, 'fabric crossings: '+buried+'/'+tested+'; worst '+deepest.toFixed(4)+' m on '+JSON.stringify(patch));
        assert.ok(furthest < result.bodyHeight * (patch.gender === 1 ? .065 : .15), 'plate stands '+furthest.toFixed(4)+' m off the fabric on '+JSON.stringify(patch));
    }
});
