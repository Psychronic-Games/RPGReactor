'use strict';
// Randomize with Gender unticked keeps the character's gender, roll after roll: a crowd of women, or of men.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('./helpers/character-quality-matrix.cjs');

test('a held gender is kept by every roll, and the body is dressed for it', () => {
    for (const gender of [0, 1]) for (let seed = 1; seed <= 40; seed++) {
        const r = Q.Model.random(seed * 7919, { species: 'human', gender });
        assert.equal(r.gender, gender, 'seed ' + seed);
        assert.equal(Q.Body.sexOf(r), gender > 0.5 ? 'male' : 'female');
    }
    // Without one, both come up.
    const seen = new Set(); for (let seed = 1; seed <= 40; seed++) seen.add(Q.Model.random(seed * 7919, { species: 'human' }).gender > 0.5);
    assert.equal(seen.size, 2);
});

test('the builder lists Gender first among the parts Randomize rolls, and holds it while unticked', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');
    assert.match(src, /\? \[\['gender', 'Gender'\], \['body', 'Body'\]/);
    assert.match(src, /this\._heldGender = this\.human && !this\.slime && !chosen\.has\('gender'\) \? r\.gender : undefined;/);
    assert.match(src, /RRCharacterModel\.random\(seed, \{ species: r\.species, gender: this\._heldGender \}\)/);
});
