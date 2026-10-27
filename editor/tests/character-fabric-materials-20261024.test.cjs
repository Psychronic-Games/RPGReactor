'use strict';
// Clothing material uplift (2026-10-24): each cut garment's cloth is a fine repeating tile on its own
// coordinates (TEXCOORD_1) instead of a weave baked into the millimeter-a-texel outfit picture; trims,
// hems and prints are painted per texel from the finished cloth; hair's blended twin shares its geometry
// in the file; and the humanoid presets' triangles are held to a budget (a ratchet until it is met).
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const root = path.join(__dirname, '..', '..'), C3 = path.join(__dirname, '../src/forge/Character3D/');
const Body = require(C3 + 'HumanBody.js'), Model = require(C3 + 'CharacterModel.js'), Wardrobe = require(C3 + 'CharacterWardrobe.js');
const Glb = require(C3 + 'CharacterGlb.js'), Fabric = require(C3 + 'CharacterFabric.js'), Atlas = require(C3 + 'CharacterAtlas.js');
const Optimizer = require('../src/utils/GlbOptimizer.js');

let pack;
test.before(async () => { pack = await Body.loadPack(); });
const glbJson = glb => { const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true); return JSON.parse(Buffer.from(glb.subarray(20, 20 + len)).toString()); };
const stubPng = t => new Uint8Array([137, 80, 78, 71, t.width & 255, t.height & 255]);
const small = { quality: 'save', skinSize: 64, atlasSize: 64 };

test('cut garments carry their cloth tile on TEXCOORD_1, and the saved file says so', async () => {
    const built = Model.build(pack, { gender: 1, outfit: [{ id: 'jeans' }, { id: 'tshirt' }], hair: { style: 'bald' } }, {}, { quality: 'save', skinSize: 64 });
    const cut = built.parts.filter(p => p.texture === 'outfit.png');
    assert.deepEqual(cut.map(p => p.fabric).sort(), ['denim', 'jersey']);
    for (const p of cut) {
        assert.equal(p.uvs1.length, p.positions.length / 3 * 2, p.name + ' has second coordinates for every vertex');
        assert.equal(p.normalTexCoord, 1); assert.equal(p.metallicRoughnessTexCoord, 1); assert.equal(p.occlusionTexCoord, 1);
        assert.ok(built.textures[p.normalTexture].repeat && built.textures[p.metallicRoughnessTexture].repeat, 'the tiles repeat');
        // In tiles of a few centimeters: a trouser leg runs over dozens of them.
        let lo = Infinity, hi = -Infinity;
        for (let i = 1; i < p.uvs1.length; i += 2) { lo = Math.min(lo, p.uvs1[i]); hi = Math.max(hi, p.uvs1[i]); }
        assert.ok(hi - lo > 15, p.name + ' spans ' + (hi - lo).toFixed(1) + ' tiles');
    }
    assert.ok(!built.textures['outfit-normal.png'], 'no relief is baked into the outfit picture any more');
    const json = glbJson(await Model.toGlb(built, 'Denim', stubPng));
    assert.ok(json.extensionsUsed.includes('KHR_materials_sheen'));
    for (const name of ['Trousers', 'T-shirt']) {
        const mesh = json.meshes.find(m => m.name === name), prim = mesh.primitives[0], material = json.materials[prim.material];
        assert.ok(prim.attributes.TEXCOORD_1 != null, name + ' exports TEXCOORD_1');
        assert.equal(json.accessors[prim.attributes.TEXCOORD_1].count, json.accessors[prim.attributes.POSITION].count);
        assert.equal(material.normalTexture.texCoord, 1);
        assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture.texCoord, 1);
        assert.equal(material.occlusionTexture.texCoord, 1);
        assert.equal(material.occlusionTexture.index, material.pbrMetallicRoughness.metallicRoughnessTexture.index, 'occlusion packed with roughness and metal');
        assert.ok(!material.pbrMetallicRoughness.baseColorTexture.texCoord, 'the picture stays on the first coordinates');
        const sheen = material.extensions.KHR_materials_sheen;
        assert.ok(sheen.sheenColorFactor[0] > 0 && sheen.sheenColorTexture.index === material.pbrMetallicRoughness.baseColorTexture.index);
        const image = json.images[json.textures[material.normalTexture.index].source].name;
        assert.equal(image, name === 'Trousers' ? 'fabric-denim-normal.png' : 'fabric-jersey-normal.png');
    }
    // An optimized import keeps the tile: the game draws it on its own coordinates.
    const material = { pbrMetallicRoughness: { baseColorTexture: { index: 0 } }, normalTexture: { index: 1, texCoord: 1 } };
    Optimizer.dropUnsampledImages({ materials: [material], textures: [{ source: 0 }, { source: 1 }], images: [{}, {}] }, new Map(), []);
    assert.deepEqual(material.normalTexture, { index: 1, texCoord: 1 });
});

test('the game reads a tile on TEXCOORD_1 and lights it through its own coordinates', async () => {
    require(path.join(root, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE, R = require(path.join(root, 'runtime', 'reactor_3d.js'));
    require(path.join(root, 'runtime', 'reactor_3d_models.js'));
    const built = Model.build(pack, { gender: 1, outfit: [{ id: 'jeans' }], hair: { style: 'bald' } }, {}, { quality: 'save', skinSize: 64 });
    built.clips = null; built.cloth = null;
    const bytes = await Model.toGlb(built, 'Jeans', stubPng), { json, bin } = R.readGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const load = R._loadGlbTexture;
    R._loadGlbTexture = () => new THREE.Texture();
    let root3;
    try { root3 = R.buildGlbTemplate(json, bin, '', null); } finally { R._loadGlbTexture = load; }
    const tiled = [];
    root3.traverse(o => { if (o.isMesh && o.material.userData.rrNormalUv1) tiled.push(o); });
    assert.ok(tiled.length >= 1, 'the trousers take their weave');
    for (const mesh of tiled) {
        assert.ok(mesh.geometry.attributes.uv1, 'with their second coordinates');
        assert.equal(mesh.material.userData.rrNormalMap.wrapS, THREE.RepeatWrapping);
        assert.ok(R.normalOnUv1(mesh.material));
    }
    assert.match(R.faceGlsl(true, true), /texture2D\(rrNormalMap, vRRUv1\)/);
    const shader = { vertexShader: 'void main() {\n}', fragmentShader: 'void main() {}' };
    R.injectUv1(shader);
    assert.match(shader.vertexShader, /vRRUv1 = uv1;\n}$/); assert.match(shader.fragmentShader, /^varying vec2 vRRUv1;/);
});

test('every material, and plain cloth by what the garment is, takes a repeating tile', () => {
    for (const material of Object.keys(Wardrobe.MATERIAL)) assert.ok(Fabric.KINDS[Fabric.kindFor(material, 'tshirt', 'solid')], material);
    const expect = [['cloth', 'jeans', 'denim'], ['cloth', 'tshirt', 'jersey'], ['cloth', 'sweater', 'rib'], ['cloth', 'suitjacket', 'suiting'], ['cloth', 'robe', 'felt'],
        ['cloth', 'cargoTrousers', 'canvas'], ['cloth', 'starshipUniform', 'ripstop'], ['cloth', 'evaSuit', 'padded'], ['silk', 'dress', 'satin'], ['leather', 'trenchcoat', 'leather'],
        ['leather', 'vest', 'suede'], ['suede', 'boots', 'suede'], ['metal', 'breastplate', 'hammered'], ['metal', 'vambraces', 'hammered'], ['gold', 'tunic', 'brushed'],
        ['rubber', 'wetsuit', 'neoprene'], ['plastic', 'reconArmor', 'plastic'], ['denim', 'skirt', 'denim'], ['knit', 'beanie', 'rib'], ['knit', 'tshirt', 'jersey'], ['wool', 'tailcoat', 'suiting'], ['wool', 'hood', 'felt'], ['canvas', 'apron', 'canvas']];
    for (const [material, id, kind] of expect) assert.equal(Fabric.kindFor(material, id, 'solid'), kind, material + ' ' + id);
    assert.equal(Fabric.kindFor('metal', 'chainmail', 'mail'), 'mail'); assert.equal(Fabric.kindFor('cloth', 'gambeson', 'quilted'), 'quilted');
    for (const kind of Object.keys(Fabric.KINDS)) {
        const t = Fabric.tile(kind), W = t.normal.width;
        assert.ok(W >= 256 && W <= 512 && t.orm.width === W, kind + ' is 256-512 texels');
        assert.ok(t.normal.repeat && t.orm.repeat);
        assert.ok(t.span[0] * 1000 / W <= 0.2, kind + ' is finer than a fifth of a millimeter a texel');
        // It repeats seamlessly: one tile over, across and down, the cloth is the same.
        const at = (u, v) => { const s = { h: 0, r: 0, m: 0, ao: 1 }; Fabric.KINDS[kind].sample(u, v, s); return s; };
        for (let i = 0; i < 48; i++) {
            const u = (i * 0.618) % 1, v = (i * 0.414) % 1, here = at(u, v);
            for (const there of [at(u + 1, v), at(u, v + 1)]) assert.ok(Math.abs(here.h - there.h) < 1e-6 && Math.abs(here.r - there.r) < 1e-6, kind + ' repeats at ' + u.toFixed(2) + ', ' + v.toFixed(2));
        }
        const n = t.normal.data;
        assert.ok(n.every((v, i) => i % 4 !== 2 || v > 127), kind + ' faces outward');
        const maps = Fabric.maps(kind);
        assert.ok(maps.normal === t.normal && maps.orm === t.orm && maps.span.length === 2);
    }
    // Another builder (armor) puts a tile on a rigid part by box projection.
    const plate = { positions: Float32Array.of(0, 0, 0, 0.1, 0, 0, 0, 0.1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1), index: Uint32Array.of(0, 1, 2) }, textures = {};
    Fabric.applyTo(plate, 'hammered', textures, { roughness: 0.32 });
    assert.equal(plate.uvs1.length, 6); assert.ok(Math.abs(plate.uvs1[2] - 0.1 / Fabric.tile('hammered').span[0]) < 1e-6);
    assert.ok(textures['fabric-hammered-normal.png'] && textures['fabric-hammered-orm.png'] && plate.normalTexCoord === 1);
});

test('no weave is baked into the outfit picture: it is smooth texel to texel, its prints filtered at their edges', () => {
    const body = Body.build(pack, Body.DEFAULT_RECIPE);
    const solid = Wardrobe.build(pack, body, [{ id: 'tshirt', color: '#5a7fa0' }], { atlasSize: 1024 });
    assert.ok(!solid.textures.some(t => t.name === 'outfit-normal.png'));
    for (const p of solid.parts.filter(p => p.texture === 'outfit.png')) assert.ok(p.normalTexCoord === 1 || !p.normalTexture, p.name + ' has no relief on the picture\'s coordinates');
    const d = solid.texture.data, W = solid.texture.width, base = [0x5a, 0x7f, 0xa0];
    let sum = 0, count = 0;
    for (let y = 0; y < W; y++) for (let x = 0; x + 1 < W; x++) {
        const o = (y * W + x) * 4;
        // Inside the cloth, away from hems and trims.
        if (Math.abs(d[o + 2] - base[2]) > 20 || Math.abs(d[o + 6] - base[2]) > 20) continue;
        sum += Math.abs(d[o] - d[o + 4]) + Math.abs(d[o + 1] - d[o + 5]) + Math.abs(d[o + 2] - d[o + 6]); count += 3;
    }
    assert.ok(count > 10000 && sum / count < 1.5, 'mean step between texels ' + (sum / count).toFixed(2));
    // Stripes run level round the trunk and their edges are blended over a texel, not stepped.
    const striped = Wardrobe.build(pack, body, [{ id: 'sweater', color: '#c03030', color2: '#f0e0d0', pattern: 'stripes' }], { atlasSize: 1024 });
    const s = striped.texture.data;
    let between = 0, pure = 0;
    for (let i = 0; i < s.length; i += 4) { if (!s[i + 3]) continue; const g = s[i + 1]; if (g > 70 && g < 190) between++; else pure++; }
    assert.ok(between > 0.01 * pure && between < 0.5 * pure, 'blended stripe edges: ' + between + ' of ' + (between + pure));
    assert.equal(typeof Atlas.shade, 'function');
    const at = { fam: 0, s: 2, ang: 0, cu: 0.1, cv: 0.2, y: 1.2, val: 1, u: 0, rest: [0, 1.2, 0.1], su: 0.13, rad: 0.13, px: 0.001 };
    const look = { pattern: 'solid', trimWidth: 0.2, material: 'cloth' }, colors = [[0, 0, 0], [0, 0, 0], [1, 1, 1]];
    const trim = vm => Atlas.shade(look, colors, Object.assign({}, at, { vm }), null)[0];
    assert.ok(trim(0.02) > 0.8 && trim(0.04) < 0.05 && trim(0.03) > 0.05 && trim(0.03) < 0.95, 'a trim\'s inner edge is blended over a texel');
});

test('silk is satin: a soft sheen and streaky shine near 0.6, not wet latex', () => {
    assert.ok(Wardrobe.MATERIAL.silk[0] >= 0.55);
    const built = Model.build(pack, { gender: 0, outfit: [{ id: 'dress' }], hair: { style: 'bald' } }, {}, { quality: 'save', skinSize: 64 });
    const dress = built.parts.filter(p => p.fabric === 'satin');
    assert.ok(dress.length);
    for (const p of dress) {
        const orm = built.textures[p.metallicRoughnessTexture].data;
        let mean = 0, lo = 1, hi = 0;
        for (let i = 1; i < orm.length; i += 4) { const r = p.roughness * orm[i] / 255; mean += r; lo = Math.min(lo, r); hi = Math.max(hi, r); }
        mean /= orm.length / 4;
        assert.ok(mean > 0.52 && mean < 0.7, 'satin roughness ' + mean.toFixed(2));
        assert.ok(hi - lo > 0.1, 'its shine breaks into streaks');
        assert.ok(p.sheen && p.sheen.strength > 0.3 && p.sheen.roughness < 0.6);
    }
});

test('hair\'s blended twin shares its core\'s geometry in the file, and is counted once', async () => {
    const built = Model.build(pack, { gender: 0, hair: { style: 'long' } }, {}, small);
    const core = built.parts.find(p => p.name === 'Hair'), twin = built.parts.find(p => p.name === 'Hair soft');
    assert.ok(core && twin && twin.soft);
    built.clips = null;
    const json = glbJson(await Model.toGlb(built, 'Hair', stubPng));
    const mesh = name => json.meshes.find(m => m.name === name).primitives[0];
    assert.deepEqual(mesh('Hair soft').attributes, mesh('Hair').attributes);
    assert.equal(mesh('Hair soft').indices, mesh('Hair').indices);
    assert.notEqual(mesh('Hair soft').material, mesh('Hair').material, 'drawn twice, blended the second time');
    const count = Glb.triangles(built.parts);
    assert.equal(count.drawn - count.total, twin.index.length / 3);
    assert.equal(count.hair, built.parts.filter(p => p.kind === 'hair' && !p.soft).reduce((s, p) => s + p.index.length / 3, 0));
});

// The humanoid presets at saved quality. The budget is whole character 60k triangles, outfit 24k; the presets do
// not all meet it yet (hems, folds and armor rebuilds are in progress elsewhere), so the thresholds below hold them
// where they stand on 2026-10-24 and are lowered as the work lands, until they reach the budget. Measured that day
// (hair's blended twin counted once; work in progress elsewhere moved them): largest whole character 75,942-80,822,
// largest outfit 45,574-50,022, 23-25 presets over 60k, 26-28 outfits over 24k.
const BUDGET = { total: 60000, outfit: 24000 };
// Hair at about half its triangles (CharacterHair cards keep rows only where a lock bends, short coils and dense long
// layers lighter) took whole characters down by 5-6k: largest 73,148, 14 presets over 60k, measured later that day.
// Cloth drape and construction detail (lapels, pockets, plackets, seams, linings; 2026-10-24) cost outfits a few
// thousand triangles each: 33 presets' outfits over 24k. The owner prefers clearly better clothes slightly over budget.
// Dark linings inside open cuffs, hems and collars (2026-10-25) add 1.4-5k an outfit: the layered Wasteland scavenger
// reaches 77.2k (73.1k without), so the ceiling on a whole character rises to 77,500, and 20 presets are over 60k.
// Cargo pockets laid flat on the thigh in finer rows so no chord cuts into the leg (2026-10-25): +0.9k, 78,500.
const RATCHET = { maxTotal: 78500, maxOutfit: 50500, overTotal: 20, overOutfit: 33 };
const FEMININE = /dress|skirt|gown|bra|bikini|stocking|corset|qipao|ballet|tennis|cropTop|offShoulder|operaGloves|swimsuit|peasant|sundress|carol|vay|tights|leggings/i;
test('humanoid presets stay within the triangle budget (ratchet)', () => {
    const rows = [];
    for (const preset of Wardrobe.PRESETS) {
        if (!preset.items.length) continue;
        const female = preset.items.some(i => FEMININE.test(i.id)) || /noble|peasantf|gala|evening|bikini|beach|swimmer|summer|undergarments/.test(preset.id);
        const recipe = { gender: female ? 0 : 1, age: female ? 28 : 30, hair: { style: female ? 'bunLow' : 'crew', color: '#3b2a1e' }, outfit: preset.items };
        rows.push({ id: preset.id, wasteland: preset.group === 'Wasteland' || preset.group === 'Cyberpunk', ...Glb.triangles(Model.build(pack, Model.normalize(recipe), {}, small).parts) });
    }
    // The Wasteland presets (2026-10-24) layer gear over full outfits: they are held by the ceilings above
    // and by their own budget (character-postapoc-20261024), not counted against the ratchet's tally. So are the
    // Cyberpunk presets (character-cyberwear-20261024), techwear and armor layered over undersuits.
    const over = key => rows.filter(r => r[key] > BUDGET[key] && !r.wasteland).map(r => r.id + ' ' + r[key]);
    for (const r of rows) {
        assert.ok(r.total <= Math.max(BUDGET.total, RATCHET.maxTotal), r.id + ' has ' + r.total + ' triangles');
        assert.ok(r.outfit <= Math.max(BUDGET.outfit, RATCHET.maxOutfit), r.id + '\'s outfit has ' + r.outfit + ' triangles');
    }
    assert.ok(over('total').length <= RATCHET.overTotal, 'over 60k: ' + over('total').join(', '));
    assert.ok(over('outfit').length <= RATCHET.overOutfit, 'outfit over 24k: ' + over('outfit').join(', '));
});
