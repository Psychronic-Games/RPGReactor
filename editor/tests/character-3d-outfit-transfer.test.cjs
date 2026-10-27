'use strict';
// Forge › 3D Character Builder, outfits taken from 3D models (RRCharacterOutfitTransfer): the Star Shift outfits build
// on any body, extremes included, outside the skin and without NaNs; they keep to their picture and triangle budgets;
// taking an outfit gives the same outfit every time; a project's own outfits are listed, kept and worn.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
global.RRHumanBody = Body;
const Outfit = load('CharacterOutfit');
const Transfer = load('CharacterOutfitTransfer');
const Wardrobe = load('CharacterWardrobe');
const Model = load('CharacterModel');
const DATA = path.join(dir, 'data', 'outfits');
const ACTORS = path.join(root, '..', 'template', 'Demo', '3d', 'Actors');

const BODIES = [
    {}, { gender: 0 }, { gender: 1, muscle: 0.7 },
    { gender: 1, extreme: true, weight: 4 }, { gender: 0, extreme: true, height: -0.6 },
    { gender: 1, extreme: true, muscle: 2.5, weight: 0.3 }, { gender: 0.5, extreme: true, height: 1.8 }
];
const TAKEN = Wardrobe.GARMENTS.filter(g => g.transfer);
const STAR_SHIFT = Wardrobe.PRESETS.filter(p => p.id.startsWith('ss_'));

let pack;
test.before(async () => { pack = await Body.loadPack(); });

test('heavy Captain rear panels retain layer separation without the former large crossing cluster', () => {
    const outfit = Transfer.load('carol'), map = outfit.render.point, index = outfit.parts[0].index;
    const triangles = [];
    for (let t = 0; t < index.length; t += 3) {
        const ids = [0, 1, 2].map(k => map[index[t + k]]);
        const center = [0, 1, 2].map(k => ids.reduce((sum, v) => sum + outfit.rest[v * 3 + k], 0) / 3);
        if (center[1] < 0.92 && center[2] < -0.1) triangles.push(ids);
    }
    assert.ok(triangles.length > 3500, 'inspect the complete authored rear region');
    const body = Body.build(pack, Body.normalizeRecipe({ gender: 1, weight: 4 }));
    const positions = Transfer.fit(pack, body, outfit, {});
    const pairs = require('./helpers/mesh-intersections.cjs').intersections(positions, triangles);
    assert.ok(pairs.length <= 20, `${pairs.length} strict crossings; previous fit had 85 (residual source folds remain)`);
});

/** A JPEG's width and height from its frame header. */
function jpegSize(bytes) {
    for (let i = 2; i < bytes.length - 9;) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1], size = bytes.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
        i += 2 + size;
    }
    return null;
}

test('the catalog lists the four Star Shift outfits, each garment a part of a shipped outfit', () => {
    assert.deepEqual(STAR_SHIFT.map(p => p.label), ["Captain's Uniform (Carol Everson)", 'Power Armor (Jolt Eagle)', 'Power Armor (Max Triton)', 'Royal Robes (Vay Drokan)']);
    for (const g of TAKEN) {
        const outfit = Transfer.load(g.transfer);
        assert.ok(outfit, g.id + ' has its outfit data');
        assert.ok(outfit.parts.some(p => p.id === g.part && p.index.length > 0), g.id + ' names a part of ' + g.transfer);
    }
    for (const p of STAR_SHIFT) for (const item of p.items) assert.ok(Wardrobe.BY_ID.has(item.id), p.id + ': ' + item.id);
});

test('every Star Shift outfit builds on average and extreme bodies, finite, standing on the floor', () => {
    for (const preset of STAR_SHIFT) for (const body of BODIES) {
        const result = Model.build(pack, Object.assign({}, body, { outfit: preset.items, hair: { style: 'bald' } }), {}, { quality: 'preview', skinSize: 256 });
        const label = preset.id + ' on ' + JSON.stringify(body);
        const taken = result.parts.filter(p => TAKEN.some(g => g.label === p.name));
        assert.ok(taken.length >= 1, label + ': its taken garments are worn');
        let low = Infinity;
        for (const p of result.parts) {
            for (const x of p.positions) assert.ok(Number.isFinite(x), label + ': ' + p.name + ' positions are finite');
            if (p.normals) for (const x of p.normals) assert.ok(Number.isFinite(x), label + ': ' + p.name + ' normals are finite');
            for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]);
        }
        assert.ok(Math.abs(low) < 1e-4, label + ': on the floor (' + low + ')');
        for (const p of taken) {
            assert.equal(p.uvs.length / 2, p.positions.length / 3, label + ': a picture coordinate per vertex');
            assert.ok(result.textures[p.texture], label + ': ' + p.name + ' has its picture');
            for (let i = 0; i < p.weights.length; i += 4) {
                const w = p.weights[i] + p.weights[i + 1] + p.weights[i + 2] + p.weights[i + 3];
                assert.ok(Math.abs(w - 1) < 1e-3, label + ': ' + p.name + ' skin weights sum to one');
            }
        }
    }
});

test('garments stay outside the skin they are worn on', () => {
    for (const key of Transfer.BUILT_IN) {
        const outfit = Transfer.load(key);
        for (const body of BODIES) {
            const built = Body.build(pack, Body.normalizeRecipe(body));
            const frame = {}, P = Transfer.fit(pack, built, outfit, frame);
            const N = frame.bodyNormals, S = built.shaped, grid = frame.bodyGrid;
            let inside = 0, worst = 0, counted = 0;
            for (let i = 0; i < outfit.count; i++) {
                // Cloth hanging from the skirt is kept off the body by the cloth itself.
                if (outfit.surface[i] === 2) continue;
                counted++;
                const q = grid.nearest(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], 2);
                if (q < 0) continue;
                const d = (P[i * 3] - S[q * 3]) * N[q * 3] + (P[i * 3 + 1] - S[q * 3 + 1]) * N[q * 3 + 1] + (P[i * 3 + 2] - S[q * 3 + 2]) * N[q * 3 + 2];
                if (d < 0) inside++;
                worst = Math.min(worst, d);
            }
            const label = key + ' on ' + JSON.stringify(body);
            assert.ok(worst > -0.004, label + ': deepest point ' + worst.toFixed(4) + ' m under the skin');
            assert.ok(inside <= counted * 0.002, label + ': ' + inside + ' of ' + counted + ' points under the skin');
        }
    }
});

test('the skin under a garment is left out, and none between its parts', () => {
    const preset = STAR_SHIFT.find(p => p.id === 'ss_max');
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
    const out = Wardrobe.build(pack, built, preset.items, {});
    const an = Outfit.anatomy(pack);
    const ids = [...new Set(pack.body.source)];
    // Chest, thighs and shins are all under armor.
    for (const [fam, lo, hi] of [[3, 0.3, 0.8], [3, 1.2, 1.7], [4, 1.2, 1.7]]) {
        const zone = ids.filter(v => an.member[v * 5 + fam] > 0.8 && an.s[v * 5 + fam] > lo && an.s[v * 5 + fam] < hi);
        const bare = zone.filter(v => !out.hidden.has(v));
        assert.ok(bare.length <= zone.length * 0.03, `leg ${lo}..${hi}: ${bare.length} of ${zone.length} skin vertices drawn`);
    }
});

test('pictures and triangles keep to their budgets', () => {
    for (const key of Transfer.BUILT_IN) {
        const json = JSON.parse(fs.readFileSync(path.join(DATA, key + '.json'), 'utf8'));
        const jpg = fs.readFileSync(path.join(DATA, json.picture));
        const size = jpegSize(jpg);
        assert.ok(size && size[0] <= 2048 && size[1] <= 2048, key + ' picture ' + size);
        assert.deepEqual(size, json.size, key + ': the layout names the picture\'s size');
        assert.ok(jpg.length < 1.5e6, key + ' picture ' + jpg.length + ' bytes');
        assert.ok(fs.statSync(path.join(DATA, key + '.bin')).size < 1e6, key + ' binary under 1 MB');
        const tris = json.parts.reduce((s, p) => s + p.triangles, 0);
        assert.ok(tris <= 32000, key + ': ' + tris + ' triangles');
        assert.ok(json.count < 65536 && json.render < 65536, key + ': points and vertices fit 16-bit indices');
    }
    // A whole Star Shift character stays a game character, not a film asset.
    for (const preset of STAR_SHIFT) {
        const result = Model.build(pack, { outfit: preset.items, hair: { style: 'bald' } }, {}, { quality: 'preview', skinSize: 256 });
        const tris = result.parts.reduce((s, p) => s + p.index.length / 3, 0);
        assert.ok(tris < 70000, preset.id + ': ' + tris + ' triangles');
    }
});

test('an outfit reads back as it was written', () => {
    const outfit = Transfer.load('carol');
    const { json, bytes } = Transfer.encode(outfit, { id: 'carol', label: 'x', picture: 'carol.jpg', size: [2048, 2048] });
    const again = Transfer.decode(JSON.parse(JSON.stringify(json)), bytes);
    assert.equal(again.count, outfit.count);
    assert.deepEqual(Array.from(again.tri), Array.from(outfit.tri));
    assert.deepEqual(Array.from(again.render.point), Array.from(outfit.render.point));
    for (let i = 0; i < outfit.offset.length; i++) assert.ok(Math.abs(again.offset[i] - outfit.offset[i]) < 1e-4);
    for (let i = 0; i < outfit.bary.length; i++) assert.ok(Math.abs(again.bary[i] - outfit.bary[i]) < 1e-4);
    assert.deepEqual(again.parts.map(p => [p.id, p.index.length, p.hidden.length]), outfit.parts.map(p => [p.id, p.index.length, p.hidden.length]));
});

test('taking an outfit gives the same outfit every time', () => {
    const model = Transfer.readModel(fs.readFileSync(path.join(ACTORS, 'Max Triton', 'source', 'Max-Triton.glb')));
    const options = () => ({ recipe: { gender: 1 }, gap: 0.004, reach: 0.003, swell: 0, triangles: 12000, headClear: 1, hang: false, parts: [{ id: null, test: i => i.arm > 2.95 }, { id: 'armor' }] });
    const a = Transfer.transfer(pack, model, options());
    const b = Transfer.transfer(pack, Transfer.readModel(fs.readFileSync(path.join(ACTORS, 'Max Triton', 'source', 'Max-Triton.glb'))), options());
    const ea = Transfer.encode(a, {}), eb = Transfer.encode(b, {});
    assert.equal(Buffer.compare(Buffer.from(ea.bytes), Buffer.from(eb.bytes)), 0, 'the same bytes');
    assert.deepEqual(ea.json, eb.json);
    assert.ok(a.parts[0].index.length / 3 <= 12000 * 1.05, 'the simplifier keeps to its target');
    // Bound to the builder's own surfaces: every point rides a body, tights or skirt triangle.
    const S = Transfer.bindSurfaces(pack);
    assert.ok(S.tights.length && S.skin.length && S.skirt.length);
    for (let i = 0; i < a.count; i++) assert.ok(a.tri[i * 3] < pack.vertexCount && a.tri[i * 3 + 2] < pack.vertexCount);
});

test('a model reads in meters, standing on the floor, facing +z, its parts named', () => {
    const model = Transfer.readModel(fs.readFileSync(path.join(ACTORS, 'Vay Drokan', 'source', 'Vay Drokan.glb')));
    let lo = Infinity, hi = -Infinity;
    for (let i = 1; i < model.positions.length; i += 3) { lo = Math.min(lo, model.positions[i]); hi = Math.max(hi, model.positions[i]); }
    assert.ok(Math.abs(lo) < 1e-6 && hi > 1.4 && hi < 2.2, 'height ' + hi);
    const at = role => model.bones[model.roles.indexOf(role)].head;
    assert.ok(at('LeftArm')[0] > 0 && at('RightArm')[0] < 0, 'left at +x');
    assert.ok(at('LeftToeBase')[2] > at('LeftFoot')[2], 'facing +z');
    assert.equal(model.image.mime, 'image/jpeg');
    assert.equal(Transfer.isHumanoid(fs.readFileSync(path.join(ACTORS, 'Vay Drokan', 'source', 'Vay Drokan.glb'))), true);
});

test('colors move the outfit\'s own colors and keep their shading', () => {
    const keys = { color: '#203080', color2: '#101010', trim: '#c0c0c0' };
    const W = 4, data = new Uint8Array(W * 4);
    [[32, 48, 128], [16, 24, 64], [192, 192, 192], [16, 16, 16]].forEach((c, i) => data.set([...c, 255], i * 4));
    const out = Transfer.recolor({ width: W, height: 1, data }, keys, { color: '#802020' });
    assert.ok(out.data[0] > out.data[2], 'the main color turned red');
    assert.ok(out.data[4] < out.data[0], 'its shadow stays darker');
    assert.deepEqual(Array.from(out.data.subarray(8, 16)), Array.from(data.subarray(8, 16)), 'the trim and the second color are kept');
    assert.equal(Transfer.recolor({ width: W, height: 1, data }, keys, {}).data, data, 'no color chosen: the picture itself');
});

test('a project lists its humanoid models and keeps the outfits it takes', () => {
    const models = Transfer.listModels(path.join(root, '..', 'template', 'Demo'));
    for (const name of ['Captain_Carol_Everson_Reduced', 'Jolt Eagle', 'Max Triton', 'Vay Drokan']) assert.ok(models.some(m => m.name === name), name + ' is listed');
    // An outfit kept in a project's 3d/Outfits is in the catalog when the project opens, worn like any other.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-taken-'));
    try {
        const at = path.join(project, '3d', 'Outfits', 'Test Outfit');
        fs.mkdirSync(at, { recursive: true });
        const outfit = Transfer.load('vay');
        const robes = Object.assign({}, outfit, { parts: [Object.assign({}, outfit.parts.find(p => p.id === 'robes'), { id: 'outfit' })] });
        const { json, bytes } = Transfer.encode(robes, { id: 'Test Outfit', label: 'Test Outfit', picture: 'outfit.jpg', size: [2048, 2048] });
        fs.writeFileSync(path.join(at, 'outfit.json'), JSON.stringify(json));
        fs.writeFileSync(path.join(at, 'outfit.bin'), bytes);
        fs.copyFileSync(path.join(DATA, 'vay.jpg'), path.join(at, 'outfit.jpg'));
        const ids = Transfer.registerProject(Wardrobe, project);
        assert.equal(ids.length, 1);
        assert.ok(Wardrobe.PRESETS.some(p => p.id === ids[0] && p.group === 'From 3D models'));
        const built = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
        const out = Wardrobe.build(pack, built, [{ id: ids[0] }], {});
        assert.ok(out.parts.some(p => p.name === 'Test Outfit' && p.index.length > 0), 'worn');
        assert.ok(out.hidden.size > 1000, 'hides the skin under it');
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('power gauntlets alone are the armor\'s hands: a glove and a plate on each hand, nothing on the arms', () => {
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1 }));
    const out = Wardrobe.build(pack, built, [{ id: 'powergauntlets' }], {});
    const an = Outfit.anatomy(pack);
    assert.ok(out.parts.some(p => p.name === 'Power armor plating' && p.index.length > 0), 'plates on the hands');
    for (const v of out.hidden) {
        const hand = (an.member[v * 5 + 1] > 0.5 && an.s[v * 5 + 1] > 2.6) || (an.member[v * 5 + 2] > 0.5 && an.s[v * 5 + 2] > 2.6);
        assert.ok(hand, 'only hand skin is hidden (vertex ' + v + ')');
    }
});

test('sparse bindings keep every clearance, panel, and collar through an encode/decode cycle', () => {
    for (const key of Transfer.BUILT_IN) {
        const source = Transfer.load(key), encoded = Transfer.encode(source, {});
        const again = Transfer.decode(encoded.json, encoded.bytes);
        assert.deepEqual(again.recipe, source.recipe);
        for (const [name, a, b, tolerance] of [
            ['world', source.world, again.world, 0.0001], ['panel', source.rest, again.rest, 0.0001],
            ['clearance', source.skin.height, again.skin.height, 0.00002],
            ['skin triangles', source.skin.tri, again.skin.tri, 0]
        ]) {
            assert.equal(a.length, b.length, key + ': ' + name + ' size');
            for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= tolerance, key + ': ' + name + ' at ' + i);
        }
        if (source.rigid) {
            assert.deepEqual(again.rigid.w, source.rigid.w);
            for (let i = 0; i < source.rigid.offset.length; i++) if (source.rigid.w[(i / 3) | 0]) assert.ok(Math.abs(source.rigid.offset[i] - again.rigid.offset[i]) < 0.0001);
        }
    }
});

test('user outfit deletion is reversible, refuses built-ins and paths, and unregisters the deleted preset', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-outfit-delete-'));
    const wardrobe = { GARMENTS: [], PRESETS: [], BY_ID: new Map() };
    try {
        const at = path.join(project, '3d', 'Outfits', 'Test Outfit');
        fs.mkdirSync(at, { recursive: true });
        fs.writeFileSync(path.join(at, 'outfit.json'), JSON.stringify({ label: 'Test Outfit' }));
        fs.writeFileSync(path.join(at, 'outfit.bin'), 'kept binary');
        const [id] = Transfer.registerProject(wardrobe, project);
        assert.ok(wardrobe.BY_ID.has(id));
        assert.throws(() => Transfer.removeProject(wardrobe, project, 'carol'), /Only project/);
        for (const key of ['project:..', 'project:../Actors', 'project:a/b', 'project:a\\b']) assert.throws(() => Transfer.removeProject(wardrobe, project, key), /Invalid outfit/);
        const removal = Transfer.removeProject(wardrobe, project, 'project:Test Outfit');
        assert.equal(fs.existsSync(at), false);
        assert.equal(wardrobe.BY_ID.has(id), false);
        assert.equal(wardrobe.PRESETS.length, 0);
        assert.equal(removal.undo(), id);
        assert.equal(fs.readFileSync(path.join(at, 'outfit.bin'), 'utf8'), 'kept binary');
        assert.ok(wardrobe.BY_ID.has(id));
        assert.equal(removal.undo(), null, 'undo happens once');
    } finally { Transfer.unregister(wardrobe, 'project:Test Outfit'); fs.rmSync(project, { recursive: true, force: true }); }
});

test('project outfit names that share a slug keep separate catalog entries', () => {
    const wardrobe = { GARMENTS: [], PRESETS: [], BY_ID: new Map() };
    const a = Transfer.register(wardrobe, 'project:Blue Suit', 'Blue Suit');
    const b = Transfer.register(wardrobe, 'project:Blue-Suit', 'Blue-Suit');
    assert.notEqual(a, b);
    assert.equal(Transfer.register(wardrobe, 'project:Blue-Suit', 'Blue-Suit'), b);
    assert.equal(wardrobe.BY_ID.get(a).transfer, 'project:Blue Suit');
    assert.equal(wardrobe.BY_ID.get(b).transfer, 'project:Blue-Suit');
});

test('import repairs a small interior hole with consistently wound faces and preserves the garment edge', () => {
    const positions = [], render = [], uvs = [], index = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { positions.push([x * 0.01, y * 0.01, 0]); render.push(render.length); uvs.push(x * 0.05, y * 0.05); }
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
        if (x === 1 && y === 1) continue;
        const a = y * 4 + x; index.push(a, a + 1, a + 5, a, a + 5, a + 4);
    }
    const parts = [{ index: Uint32Array.from(index) }], picture = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(128) };
    Transfer.fillHoles(parts, render, uvs, positions, picture, 0.06, new Array(16).fill(false), () => true);
    assert.equal(parts[0].index.length, index.length + 6, 'the square hole gains two faces');
    const edges = new Map();
    for (let t = 0; t < parts[0].index.length; t += 3) {
        const ids = Array.from(parts[0].index.subarray(t, t + 3), r => render[r]);
        const [a, b, c] = ids.map(i => positions[i]);
        assert.ok((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0, 'every patch faces the same way as the cloth');
        for (let k = 0; k < 3; k++) { const a = ids[k], b = ids[(k + 1) % 3], key = a < b ? a + ':' + b : b + ':' + a; edges.set(key, (edges.get(key) || 0) + 1); }
    }
    assert.equal([...edges.values()].filter(n => n === 1).length, 12, 'only the original outer edge stays open');
});

test('a cuff encloses the limb axis while a nearby pinhole is repaired', () => {
    const L = { chest: [0, 0, 0], Head: [0, 1, 0], LeftForeArm: [1, 0, 0], LeftHand: [1, 1, 0] };
    const ring = [[0.9, 0.8, -0.1], [1.1, 0.8, -0.1], [1.1, 0.8, 0.1], [0.9, 0.8, 0.1]];
    assert.equal(Transfer.isGarmentOpening(ring, L), true);
    assert.equal(Transfer.isGarmentOpening(ring.map(p => [p[0] + 0.3, p[1], p[2]]), L), false);
    const concave = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [1, 1, 0], [0, 2, 0]];
    const tri = Transfer.triangulateLoop(concave);
    assert.equal(tri.length, 9);
    let area = 0;
    for (let t = 0; t < tri.length; t += 3) { const [a, b, c] = tri.slice(t, t + 3).map(i => concave[i]); area += ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; }
    assert.equal(area, 3, 'concave repair neither crosses nor fills the missing corner');
});

test('Captain panels have real fabric backing with body skinning, confined to their authored coverage', () => {
    const preset = STAR_SHIFT.find(p => p.id === 'ss_carol');
    const built = Body.build(pack, Body.normalizeRecipe({ gender: 1, extreme: true, weight: 4 }));
    const out = Wardrobe.build(pack, built, preset.items, {});
    // The panel backing only: 'Garment linings' (RRCharacterWardrobe.garmentLinings, the dark inner face along open
    // edges) is also rrLining but follows the cloth it lines, not the body's skin, and has no body source vertices.
    const lining = out.parts.filter(p => p.rrLining && p.name !== 'Garment linings');
    assert.ok(lining.length, 'backing is a garment mesh');
    const authored = new Set(Transfer.load('carol').parts.find(p => p.id === 'uniform').hidden);
    const overlap = new Set(authored);
    for (let t = 0; t < pack.body.index.length; t += 3) {
        const ids = [0, 1, 2].map(k => pack.body.source[pack.body.index[t + k]]);
        if (ids.some(v => authored.has(v))) for (const v of ids) overlap.add(v);
    }
    const body = built.parts[0];
    for (const part of lining) for (const v of new Set(part.index)) {
        assert.ok(overlap.has(part.source[v]), 'lining stays within one ring of the source panels');
        let clearance = 0;
        for (let c = 0; c < 3; c++) clearance += (part.positions[v * 3 + c] - body.positions[v * 3 + c]) * body.normals[v * 3 + c];
        assert.ok(clearance > 0.001 && clearance < 0.002, 'backing stands above skin and below the outer shell');
        for (let k = 0; k < 4; k++) {
            assert.equal(part.joints[v * 4 + k], body.joints[v * 4 + k]);
            assert.equal(part.weights[v * 4 + k], body.weights[v * 4 + k]);
        }
    }
});
