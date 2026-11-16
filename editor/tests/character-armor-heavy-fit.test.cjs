'use strict';
// Forge › 3D Character Builder, plate armor on heavy bodies (RRCharacterPowerArmor.medieval): the shoulder cap, the
// elbow and knee cops and the tassets are measured on the joint they sit on, not on the limb's widest flesh, so on a
// body three and six times the natural weight they stay on it. Measured as each plate vertex's distance from the
// body's surface (helpers/garment-fit.cjs); the numbers before the fix are said beside each limit.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const dir = path.join(__dirname, '..', 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody']) load(name);
const Armor = load('CharacterPowerArmor');
const Fit = require('./helpers/garment-fit.cjs');

let pack;
const plate = (kind, body) => {
    const built = Body.build(pack, Body.normalizeRecipe(Object.assign({ gender: 0.8, extreme: true }, body)));
    const made = Armor.medieval(pack, built, { id: kind, style: 'smooth', color: '#b6bcc4', material: 'metal', bulk: 0.5, length: 0.3, flare: 0.3 }, kind);
    return { fit: Fit.fit(built.parts[0], made.parts), parts: made.parts };
};
const box = parts => { const lo = [9, 9, 9], hi = [-9, -9, -9]; for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); } return hi.map((h, k) => h - lo[k]); };

test('the fit measure reads a plate on a natural body as on it', async () => {
    pack = await Body.loadPack();
    for (const kind of ['pauldrons', 'tassets']) { const f = plate(kind, { weight: 1 }).fit; assert.ok(f.vertices > 500, kind); assert.equal(f.off, 0, kind + ' stands off a natural body'); assert.ok(f.p50 > 1 && f.p50 < 5, kind + ' ' + f.p50); }
});

test('pauldrons stay on a heavy shoulder: the cap rises as far as the shoulder does, not as far as the arm sags', () => {
    // Before: 29% of the plate more than 6 cm off at three times the weight, 42% at six.
    const three = plate('pauldrons', { weight: 3 }).fit, six = plate('pauldrons', { weight: 6 }).fit;
    assert.ok(three.off < 0.16, 'at 300%: ' + three.off);
    assert.ok(six.off < 0.30, 'at 600%: ' + six.off);
    assert.ok(three.p95 < 7.5, 'at 300%: ' + three.p95);   // 9.0 cm before
});

test('knee and elbow cops sit on their joints on a heavy limb', () => {
    // The leg armor's furthest point from the body at three times the weight: 15.4 cm before (the knee cop).
    const legs = plate('greaves', { weight: 3 }).fit;
    assert.ok(legs.furthest < 12, String(legs.furthest));
    assert.ok(plate('greaves', { weight: 6 }).fit.furthest < 20, 'at 600%');   // 28.5 cm before
    // The vambraces with their elbow cops grow with the arm, not past it: no wider than a third more than the heaviest forearm needs.
    const [w, h] = box(plate('vambraces', { weight: 6 }).parts.filter(p => /vambraces$/.test(p.name)));
    assert.ok(w < 2.2 && h < 0.75, w + ' x ' + h);
});

test('tassets follow a thigh that narrows under a heavy hip, and never sink into the belly over it', () => {
    for (const weight of [3, 4.5, 6]) {
        const f = plate('tassets', { weight }).fit;
        assert.ok(f.inside < 0.04, weight + ': inside ' + f.inside);
        assert.ok(f.p95 < { 3: 9.4, 4.5: 13.2, 6: 14.5 }[weight], weight + ': p95 ' + f.p95);   // 9.7, 15.8 and 18.1 cm before
    }
});
