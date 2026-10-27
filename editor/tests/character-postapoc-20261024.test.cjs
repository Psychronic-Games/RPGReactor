'use strict';
// Post-apocalyptic clothing (2026-10-24): the Wasteland garments and presets, the wear and
// damage system (RRCharacterWear) and the scavenged gear (RRCharacterWasteland).
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Wear = require('../src/forge/Character3D/CharacterWear.js');
const Waste = require('../src/forge/Character3D/CharacterWasteland.js');
const Fabric = require('../src/forge/Character3D/CharacterFabric.js');
const Outfit = require('../src/forge/Character3D/CharacterOutfit.js');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

const WASTE = Wardrobe.PRESETS.filter(p => p.group === 'Wasteland');
const bodies = new Map();
const bodyOf = gender => { if (!bodies.has(gender)) bodies.set(gender, Body.build(pack, Body.normalizeRecipe({ gender }))); return bodies.get(gender); };
const dress = (outfit, gender = 1) => Wardrobe.build(pack, bodyOf(gender), outfit, { atlasSize: 64, pictureSize: 64, quality: 'save' });
const tris = (parts, test) => parts.filter(test).reduce((n, p) => n + p.index.length / 3, 0);
const GEAR = /^(Scrap |Pauldron |Bandolier|Chest harness|Harness |Utility belt|Belt |Gas mask|Goggle|Boot wraps|Head wrap|Face scarf|Poncho|Shoulder cape|Rag wrap|Bandaged forearms|Shin wraps)/;
const WORN = /^(Frayed edges|Sewn patches|Tape repairs)$/;

test('the Wasteland group: eight one-click presets of catalog garments, each with gear of its own', () => {
    assert.deepEqual(WASTE.map(p => p.id), ['scavenger', 'drifter', 'raider', 'roadWarrior', 'nomad', 'settler', 'wasteMechanic', 'wasteMedic']);
    for (const p of WASTE) {
        for (const item of p.items) assert.ok(Wardrobe.BY_ID.get(item.id), p.id + ': ' + item.id + ' is a garment');
        const outfit = Wardrobe.normalizeOutfit(p.items);
        assert.equal(outfit.length, p.items.length, p.id + ': one garment per slot');
        assert.ok(outfit.some(i => Wardrobe.BY_ID.get(i.id).group === 'Wasteland'), p.id + ' wears wasteland pieces');
        assert.ok(outfit.some(i => i.wear > 0.3), p.id + ' is worn');
    }
    const ids = Wardrobe.GARMENTS.filter(g => g.group === 'Wasteland').map(g => g.id);
    for (const id of ['duster', 'fieldJacket', 'ragWraps', 'shawl', 'shemagh', 'headWrap', 'poncho', 'bandages', 'legWraps', 'workBoots', 'harness', 'toolBelt', 'gasMask', 'dustGoggles', 'scrapArmor', 'scrapPauldrons']) assert.ok(ids.includes(id), id + ' in the catalog');
    for (const g of Wardrobe.GARMENTS.filter(g => g.group === 'Wasteland')) {
        assert.ok(g.defaults.wear > 0, g.id + ' starts worn');
        for (const [value, label] of g.styles || []) assert.ok(value && label, g.id + ' style ' + value);
    }
});

test('every Wasteland preset builds on a man and a woman, with its gear, wear parts and budgets', () => {
    for (const p of WASTE) for (const gender of [1, 0]) {
        const w = dress(Wardrobe.dressFor(p.items, gender === 0), gender);
        const outfit = tris(w.parts, () => true), gear = tris(w.parts, q => GEAR.test(q.name)), worn = tris(w.parts, q => WORN.test(q.name));
        assert.ok(gear > 500, `${p.id}/${gender}: gear ${gear}`);
        // What this effort adds stays small beside the clothes under it.
        assert.ok(gear <= 16000, `${p.id}/${gender}: gear ${gear} within 16k`);
        assert.ok(worn <= 5000, `${p.id}/${gender}: frays, patches and tape ${worn} within 5k`);
        assert.ok(outfit <= 62000, `${p.id}/${gender}: whole outfit ${outfit}`);
        for (const part of w.parts) {
            assert.ok(part.positions.length && part.index.length, part.name + ' has geometry');
            for (let k = 0; k < part.positions.length; k++) if (!Number.isFinite(part.positions[k])) throw new Error(part.name + ' has a NaN position');
            assert.equal(part.joints.length / 4, part.positions.length / 3, part.name + ' is skinned');
        }
    }
});

test('gear parts: rigid head gear, scrap on its sheet, a hooded poncho, belt tools, canisters', () => {
    const head = Body.build(pack, Body.normalizeRecipe({ gender: 1 })).bones.findIndex(b => b.name === 'Head');
    const mask = dress([{ id: 'gasMask', style: 'twin' }, { id: 'dustGoggles' }]);
    for (const name of ['Gas mask', 'Gas mask filters', 'Gas mask lenses', 'Goggles', 'Goggle lenses']) {
        const part = mask.parts.find(q => q.name === name);
        assert.ok(part, name);
        for (let v = 0; v < part.joints.length / 4; v++) assert.equal(part.joints[v * 4], head, name + ' rides the head');
    }
    assert.ok(mask.parts.find(q => q.name === 'Gas mask lenses').opacity < 1, 'lenses are see-through');
    const scrap = dress([{ id: 'tshirt' }, { id: 'scrapArmor', style: 'tire' }, { id: 'scrapPauldrons', style: 'mixed' }]);
    for (const name of ['Scrap armor plates', 'Scrap pauldrons']) {
        const part = scrap.parts.find(q => q.name === name);
        assert.equal(part.texture, 'scrap-sheet.png', name + ' takes the scrap sheet');
        assert.equal(part.normalTexCoord, 1, name + ' relief on its second coordinates');
        assert.equal(part.uvs1.length, part.uvs.length);
    }
    assert.ok(scrap.textures.some(t => t.name === 'scrap-sheet.png') && scrap.textures.some(t => t.name === 'scrap-sheet-n.png'), 'the sheet ships with the outfit');
    assert.ok(scrap.parts.some(q => q.name === 'Scrap chain'), 'the mixed pair has its chain');
    const nomad = dress(WASTE.find(p => p.id === 'nomad').items);
    assert.ok(nomad.parts.some(q => q.name === 'Poncho') && nomad.parts.some(q => q.name === 'Poncho hood'), 'a poncho and its hood');
    assert.ok(nomad.parts.some(q => q.name === 'Face scarf'), 'the scarf pulled over the face');
    const belt = dress([{ id: 'jeans' }, { id: 'toolBelt' }, { id: 'harness', style: 'bandolier' }]);
    for (const name of ['Utility belt', 'Belt tools', 'Belt hardware', 'Bandolier webbing', 'Harness canisters']) assert.ok(belt.parts.some(q => q.name === name), name);
    // Cloth gear's color is in its vertices: no white sheen over it.
    for (const q of belt.parts.filter(q => GEAR.test(q.name) && q.fabric && !q.texture)) assert.equal(q.sheen, undefined, q.name);
});

test('the wear system is deterministic per seed and grows with the slider', () => {
    const g = Wardrobe.BY_ID.get('jeans');
    const a = Wear.lookFor(Wardrobe.normalizeItem({ id: 'jeans', wear: 0.9 }), g), b = Wear.lookFor(Wardrobe.normalizeItem({ id: 'jeans', wear: 0.9 }), g);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'same recipe, same wear');
    const c = Wear.lookFor(Wardrobe.normalizeItem({ id: 'jeans', wear: 0.9, wearSeed: 7 }), g);
    assert.notDeepEqual(JSON.parse(JSON.stringify(a.holes)), JSON.parse(JSON.stringify(c.holes)), 'another seed tears elsewhere');
    assert.equal(Wear.lookFor(Wardrobe.normalizeItem({ id: 'jeans' }), g), null, 'ordinary clothes start unworn');
    const counts = [0.2, 0.4, 0.6, 0.8, 1].map(w => { const i = Wear.lookFor(Wardrobe.normalizeItem({ id: 'shirt', wear: w }), Wardrobe.BY_ID.get('shirt')); return i.holes.length + i.patches.length + i.tape.length; });
    for (let k = 1; k < counts.length; k++) assert.ok(counts[k] >= counts[k - 1], 'more damage with more wear: ' + counts);
    assert.equal(Wear.lookFor(Wardrobe.normalizeItem({ id: 'shirt', wear: 0.3 }), Wardrobe.BY_ID.get('shirt')).holes.length, 0, 'no holes below 0.45');
    // The picture's texels: the same in, the same out.
    const p = { fam: 3, s: 1.0, ang: 0.1, cu: 0.01, cv: 0.4, vm: 0.08, val: 0, rest: [0.14, 0.49, 0.08], rad: 0.055, su: 0.42, px: 0.001 };
    assert.deepEqual(Wear.paint([0.2, 0.2, 0.3], { wearInfo: a, material: 'denim' }, p), Wear.paint([0.2, 0.2, 0.3], { wearInfo: b, material: 'denim' }, p));
    // Laid twice, the same fringes, patches and tape.
    const one = dress([{ id: 'shirt', wear: 0.9 }, { id: 'jeans', wear: 0.9 }]), two = dress([{ id: 'shirt', wear: 0.9 }, { id: 'jeans', wear: 0.9 }]);
    for (const name of ['Frayed edges', 'Sewn patches', 'Tape repairs']) {
        const x = one.parts.find(q => q.name === name), y = two.parts.find(q => q.name === name);
        assert.ok(x && y, name);
        assert.deepEqual(Array.from(x.positions), Array.from(y.positions), name + ' repeats exactly');
    }
});

test('holes only where a garment covers, and only skin right behind them is drawn again', () => {
    for (const id of ['tshirt', 'jeans', 'trenchcoat', 'cargoTrousers', 'coveralls']) {
        const g = Wardrobe.BY_ID.get(id), item = Wardrobe.normalizeItem({ id, wear: 1 }), info = Wear.lookFor(item, g), cov = Wear.coverageOf(g, item);
        for (const h of info.holes.concat(info.patches)) {
            if (h.fam[0] === 0) assert.ok(cov.trunk && h.y > cov.trunk[0] && h.y < cov.trunk[1], `${id}: trunk spot at ${h.y.toFixed(2)} on the cloth`);
            else if (h.fam[0] <= 2) assert.ok(cov.arm && h.s < cov.arm[1], `${id}: arm spot on the sleeve`);
            else assert.ok(cov.leg && h.s < cov.leg[1], `${id}: leg spot on the leg`);
        }
    }
    const an = Outfit.anatomy(pack);
    for (const gender of [1, 0]) {
        const outfit = [{ id: 'tshirt', color: '#777766' }, { id: 'jeans' }];
        const clean = dress(outfit, gender), torn = dress(outfit.map(i => Object.assign({}, i, { wear: 1 })), gender);
        // Wear never hides more skin; what it shows lies behind one of its holes.
        for (const v of torn.hidden) assert.ok(clean.hidden.has(v), 'no new hidden skin');
        const shown = [...clean.hidden].filter(v => !torn.hidden.has(v));
        const holes = torn.items.flatMap(item => (Wear.lookFor(item, Wardrobe.BY_ID.get(item.id)) || { holes: [] }).holes);
        assert.ok(holes.length > 0, 'the worn pair has holes');
        for (const v of shown) {
            const R = [an.rest[v * 3], an.rest[v * 3 + 1], an.rest[v * 3 + 2]];
            const near = holes.some(h => {
                if (h.fam[0] === 0) return Math.abs(R[1] - h.y) < h.r * 1.8 + 0.03;
                return an.member[v * 5 + h.fam[0]] > 0.4 && Math.abs((an.s[v * 5 + h.fam[0]] - h.s) * an.unit[h.fam[0]]) < h.r * 1.8 + 0.03;
            });
            assert.ok(near, 'shown skin vertex ' + v + ' lies behind a hole');
        }
        assert.ok(shown.length < 400, 'only a little skin shows: ' + shown.length);
        // The torn pieces are cut out; the picture has transparent holes.
        assert.ok(torn.parts.some(q => q.cutout && q.texture === 'outfit.png'), 'a torn piece is drawn cut out');
    }
});

test('fringes ride their hems; patches and tape follow the cloth (sewn references for the cloth rig)', () => {
    const w = dress([{ id: 'tshirt', wear: 0.9 }, { id: 'jeans', wear: 0.9 }, { id: 'duster' }]);
    for (const name of ['Frayed edges', 'Sewn patches', 'Tape repairs']) {
        const part = w.parts.find(q => q.name === name);
        assert.ok(part, name);
        assert.equal(part.sewnRefs.length / 2, part.positions.length / 3, name + ': a fabric vertex for each of its vertices');
        assert.equal(part.sewnRoots.length, part.positions.length, name + ': its roots');
        assert.ok(part.cutout, name + ' is cut out');
        // Within a few centimeters of the cloth it rides on.
        for (let v = 0; v < part.positions.length / 3; v += 7) {
            const d = Math.hypot(part.positions[v * 3] - part.sewnRoots[v * 3], part.positions[v * 3 + 1] - part.sewnRoots[v * 3 + 1], part.positions[v * 3 + 2] - part.sewnRoots[v * 3 + 2]);
            assert.ok(d < 0.2, name + ' stays on its cloth: ' + d.toFixed(3));
        }
    }
    // A ragged duster grows long tatters; an ordinary worn shirt only a short fray.
    const fr = w.parts.find(q => q.name === 'Frayed edges');
    let longest = 0;
    for (let v = 0; v < fr.positions.length / 3; v++) longest = Math.max(longest, Math.hypot(fr.positions[v * 3] - fr.sewnRoots[v * 3], fr.positions[v * 3 + 1] - fr.sewnRoots[v * 3 + 1], fr.positions[v * 3 + 2] - fr.sewnRoots[v * 3 + 2]));
    assert.ok(longest > 0.04, 'tatters on the duster: ' + longest.toFixed(3));
    // The repairs toggle leaves the patches and tape off (the duster's pockets stay).
    const verts = w => w.parts.filter(q => /^(Sewn patches|Tape repairs)$/.test(q.name)).reduce((n, q) => n + q.positions.length / 3, 0);
    const mended = dress([{ id: 'duster', wear: 0.95 }]), plain = dress([{ id: 'duster', wear: 0.95, repairs: false }]);
    assert.ok(verts(plain) > 0 && verts(plain) < verts(mended), 'pockets only when unticked: ' + verts(plain) + ' < ' + verts(mended));
    assert.ok(!plain.parts.some(q => q.name === 'Tape repairs'), 'no tape when unticked');
});

test('worn cloth tiles and the scrap sheet', () => {
    for (const kind of ['canvasWorn', 'denimWorn', 'leatherWorn', 'jerseyWorn', 'homespun', 'burlap', 'gauze']) {
        const t = Fabric.tile(kind);
        assert.ok(t && t.normal.data.length === t.size * t.size * 4, kind);
    }
    const info = Wear.lookFor(Wardrobe.normalizeItem({ id: 'jeans', wear: 0.8 }), Wardrobe.BY_ID.get('jeans'));
    assert.equal(Wear.fabricKind('denim', { wearInfo: info, material: 'denim' }, 'jeans'), 'denimWorn');
    assert.equal(Wear.fabricKind('denim', { material: 'denim' }, 'jeans'), 'denim', 'unworn cloth keeps its tile');
    const sheet = Waste.pictures();
    assert.equal(sheet.albedo.width, 1024); assert.equal(sheet.albedo.height, 512);
    // Mostly dull: painted and rusted, not mirror chrome.
    let bright = 0;
    for (let i = 0; i < sheet.albedo.data.length; i += 4) if (sheet.albedo.data[i] > 230 && sheet.albedo.data[i + 1] > 230) bright++;
    assert.ok(bright / (sheet.albedo.data.length / 4) < 0.02, 'few blown-out texels: ' + bright);
});

test('recipes round-trip: wear, seeds, styles and details stay as chosen; bad values fall back', () => {
    const outfit = Wardrobe.normalizeOutfit([{ id: 'duster', style: 'plain', wear: 0.4, wearSeed: 12, repairs: false }, { id: 'gasMask', style: 'twin' }, { id: 'shemagh', style: 'face' }, { id: 'jeans', wear: 0.7 }]);
    assert.deepEqual(Wardrobe.normalizeOutfit(JSON.parse(JSON.stringify(outfit))), outfit);
    const duster = outfit.find(i => i.id === 'duster');
    assert.equal(duster.style, 'plain'); assert.equal(duster.wear, 0.4); assert.equal(duster.wearSeed, 12); assert.equal(duster.repairs, false);
    assert.equal(Wardrobe.normalizeItem({ id: 'jeans', wear: 3 }).wear, 1);
    assert.equal(Wardrobe.normalizeItem({ id: 'jeans', wear: -2 }).wear, 0);
    assert.equal(Wardrobe.normalizeItem({ id: 'jeans' }).wear, 0, 'every cut garment carries a wear for its slider');
    assert.equal(Wardrobe.normalizeItem({ id: 'scrapArmor', style: 'nonsense' }).style, 'plates');
    assert.equal(Wardrobe.normalizeItem({ id: 'gasMask' }).style, 'single');
    // A style that changes the cut changes the cut (the scarf round the neck or over the face).
    const neck = dress([{ id: 'shemagh', style: 'neck' }]), face = dress([{ id: 'shemagh', style: 'face' }]);
    assert.ok(!neck.parts.some(q => q.name === 'Face scarf') && face.parts.some(q => q.name === 'Face scarf'));
});

test('random dress: the Wasteland theme draws its own presets in its own colors', () => {
    let seed = 5;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 12; k++) {
        const out = Wardrobe.dressRandom(rand, 'Wasteland', k % 2 === 0);
        assert.ok(WASTE.some(p => p.id === out.preset), 'a wasteland preset: ' + out.preset);
        assert.ok(Wardrobe.normalizeOutfit(out.outfit).length >= 4);
    }
});
