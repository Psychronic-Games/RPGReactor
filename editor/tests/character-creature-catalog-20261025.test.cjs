'use strict';
// Creature catalog (2026-10-25): a "Flying animals" group (birds, bats, the drake), farm birds and a pig among
// the land animals, pig snouts with a flat disc, a lobster's matched claws.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Q = require('./helpers/character-quality-matrix.cjs');
const C = Q.Creature;
const groupOf = id => C.KINDS.find(k => k.kind === id).group || 'Land animals';
const extentOf = (part, axis) => { let lo = Infinity, hi = -Infinity; for (let i = axis; i < part.positions.length; i += 3) { lo = Math.min(lo, part.positions[i]); hi = Math.max(hi, part.positions[i]); } return hi - lo; };

test('catalog groups: flying birds, bats and the drake fly together; farm birds and the pig walk with the land animals', () => {
    for (const id of ['avian', 'bat', 'drake']) assert.equal(groupOf(id), 'Flying animals', id);
    for (const id of ['chicken', 'duck', 'turkey', 'pig', 'boar', 'cat', 'horse']) assert.equal(groupOf(id), 'Land animals', id);
    assert.ok(!C.KINDS.some(k => k.group === 'Birds and bats'), 'the old group name is gone');
    // Saved characters keep opening: every earlier kind id is still listed.
    for (const id of ['cat', 'lion', 'tiger', 'dog', 'wolf', 'fox', 'deer', 'horse', 'bear', 'boar', 'rabbit', 'bull', 'ram', 'drake', 'shark', 'fish', 'dolphin', 'whale', 'octopus', 'squid', 'lobster', 'crab', 'avian', 'bat', 'worm'])
        assert.ok(C.KINDS.some(k => k.kind === id), id);
    assert.equal(C.kindRecipe('avian').birdType, 'eagle');
});

test('farm birds are built by the avian form with their own bird type; the turkey has snood and wattle', () => {
    for (const id of ['chicken', 'duck', 'turkey']) {
        const r = C.kindRecipe(id);
        assert.equal(r.kind, id); assert.equal(r.morphology, 'avian'); assert.equal(r.birdType, id);
        const b = C.build(r, { quality: 'preview' }), q = Q.inspect(b, { recipe: r });
        assert.deepEqual(q.issues, [], id);
        assert.ok(q.summary.triangles < 65000, id + ' triangles');
        if (id === 'turkey') assert.ok(b.parts.some(p => p.name === 'Snood and wattle'), 'turkey ornaments');
        if (id === 'chicken') assert.ok(b.parts.some(p => p.name === 'Comb and wattles'), 'chicken comb');
    }
    const saved = C.normalizeRecipe(JSON.parse(JSON.stringify(C.kindRecipe('turkey'))));
    assert.equal(saved.birdType, 'turkey', 'a saved turkey reopens as a turkey');
});

test('pig and boar: a flat snout disc on both, tusks on the boar only, the pig pink with a curly tail', () => {
    const pig = C.kindRecipe('pig'), boar = C.kindRecipe('boar');
    assert.equal(pig.tail, 'curly'); assert.equal(pig.tuskSize, 0); assert.ok(boar.tuskSize > 0);
    for (const [id, r] of [['pig', pig], ['boar', boar]]) {
        const b = C.build(r, { quality: 'preview' }), q = Q.inspect(b, { recipe: r });
        assert.deepEqual(q.issues, [], id);
        assert.ok(b.parts.some(p => p.name === 'Horns'), id + ' snout disc lofted with the hard pieces');
    }
});

test("a lobster's two claws are the same size", () => {
    const b = C.build(C.kindRecipe('lobster'), { quality: 'preview' });
    for (const name of ['Claw palm', 'Pincer']) {
        const [l, r] = [-1, 1].map(s => b.parts.find(p => p.name === name + ' ' + s || p.name === name + ' ' + s + '/1'));
        assert.ok(l && r, name);
        for (const axis of [0, 1, 2]) assert.ok(Math.abs(extentOf(l, axis) - extentOf(r, axis)) < 1e-3 * (1 + extentOf(l, axis)), name + ' axis ' + axis);
    }
});

test('the armadillo: a land animal under a banded shell and head cap, a ringed tail, digging claws, a waddling walk', () => {
    assert.equal(groupOf('armadillo'), 'Land animals');
    const r = C.kindRecipe('armadillo'), b = C.build(r, { quality: 'preview' }), q = Q.inspect(b, { recipe: r });
    assert.deepEqual(q.issues, [], 'armadillo');
    assert.ok(q.summary.triangles < 65000, 'triangles ' + q.summary.triangles);
    assert.equal(r.feet, 'claw'); assert.equal(r.tail, 'long');
    const horns = b.parts.find(p => p.name === 'Horns');
    assert.ok(horns && horns.index.length / 3 > 4000, 'carapace and head shield');
    const roll = kind => { const rr = C.kindRecipe(kind), bb = C.build(rr, { quality: 'preview' }), clip = C.poseClip(bb.bones, 'walk', rr), hips = bb.bones.findIndex(x => x.name === 'Hips');
        const tr = clip.tracks.find(t => t.bone === hips && /rot|quat/i.test(t.path || t.property || 'rotation')) || clip.tracks.find(t => t.bone === hips);
        let m = 0; for (let i = 0; i < tr.values.length; i += 4) m = Math.max(m, Math.abs(tr.values[i + 2])); return m; };
    assert.ok(roll('armadillo') > roll('dog') * 1.5, 'the armadillo waddles');
});

test('the new catalog labels have reviewed translations for every builder locale', () => {
    const vm = require('node:vm'), scope = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/I18nReviewedTranslations.js'), 'utf8'), scope);
    const text = scope.RR_REVIEWED_TRANSLATIONS.text;
    assert.equal(Object.keys(text).length, 17);
    for (const [locale, catalog] of Object.entries(text)) for (const label of ['Flying animals', 'Chicken', 'Duck', 'Turkey', 'Pig', 'Armadillo'])
        assert.ok(typeof catalog[label] === 'string' && catalog[label].length > 0, locale + '/' + label);
});
