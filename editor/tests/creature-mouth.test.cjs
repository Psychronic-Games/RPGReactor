'use strict';
// A creature can talk: a cut mouth, a Jaw bone everything on the lower jaw follows, an inside, and a builder control.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs');
const dir = path.join(__dirname, '..', 'src', 'forge', 'Character3D');
const Creature = require(path.join(dir, 'CreatureBody.js')), Mouth = require(path.join(dir, 'CreatureMouth.js'));
const build = (kind, extra) => Creature.build({ ...Creature.kindRecipe(kind), ...extra }, { quality: 'preview', hairBudget: 0 });

test('four-legged kinds get a jaw, a lining, a tongue and teeth, with sound skinning and geometry', () => {
    for (const kind of ['cat', 'dog', 'horse', 'bull', 'rabbit', 'drake']) {
        const built = build(kind), jaw = built.bones.findIndex(b => b.name === 'Jaw');
        assert.ok(jaw > 0, kind + ' has a jaw');
        assert.equal(built.bones[built.bones[jaw].parent].name, 'Head');
        for (const name of ['Mouth interior', 'Tongue', 'Teeth']) assert.ok(built.parts.some(p => p.name === name), kind + ' ' + name);
        for (const p of built.parts) {
            const n = p.positions.length / 3;
            assert.ok(p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite), kind + ' finite ' + p.name);
            assert.ok(p.index.every(i => i < n), kind + ' index ' + p.name);
            for (let v = 0; v < n; v++) assert.ok(Math.abs(p.weights[v * 4] + p.weights[v * 4 + 1] + p.weights[v * 4 + 2] + p.weights[v * 4 + 3] - 1) < 0.02, kind + ' weights ' + p.name);
        }
        const body = built.parts.find(p => p.name === 'Body');
        let held = 0; for (let i = 0; i < body.joints.length; i++) if (body.joints[i] === jaw && body.weights[i] > 0.5) held++;
        assert.ok(held > 40, kind + ' skin follows the jaw: ' + held);
    }
});

test('the lip is a real seam: the two lips are separate vertices at the same place, so the mouth can open', () => {
    const body = build('cat').parts.find(p => p.name === 'Body'), seen = new Map(), P = body.positions;
    let pairs = 0;
    for (let v = 0; v < P.length / 3; v++) {
        const key = [0, 1, 2].map(k => Math.round(P[v * 3 + k] * 1e5)).join();
        if (seen.has(key)) pairs++; else seen.set(key, v);
    }
    assert.ok(pairs > 20, 'seam vertices: ' + pairs);
});

test('Mouth opening moves the chin and only below the lip; closed is the default', () => {
    const shut = build('dog'), open = build('dog', { mouthOpen: 0.7 });
    assert.equal(Creature.normalizeRecipe(Creature.kindRecipe('dog')).mouthOpen, 0);
    const a = shut.parts.find(p => p.name === 'Teeth'), b = open.parts.find(p => p.name === 'Teeth');
    let lowest = 0;
    for (let v = 0; v < a.positions.length / 3; v++) lowest = Math.max(lowest, a.positions[v * 3 + 1] - b.positions[v * 3 + 1]);
    assert.ok(lowest > 0.005, 'the lower teeth drop ' + lowest);
    const eyes = [shut, open].map(r => r.parts.find(p => p.name === 'Eyes').positions);
    assert.deepEqual(Array.from(eyes[0]), Array.from(eyes[1]), 'the eyes stay put');
});

test('heads grafted on people and other body plans are left as they are', () => {
    assert.ok(!Creature.build(Creature.kindRecipe('cat'), { quality: 'preview', hairBudget: 0, headOnly: true }).bones.some(b => b.name === 'Jaw'));
});

test('letters open the jaw the way a mouth does, and the game turns a jaw by the same amount', () => {
    assert.ok(Mouth.letterOpen('a') > Mouth.letterOpen('t') && Mouth.letterOpen('t') > Mouth.letterOpen('m') && Mouth.letterOpen(' ') === 0);
    const speech = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d_speech.js'), 'utf8');
    assert.match(speech, /Math\.min\(1, open\) \* 0\.28/);
    assert.equal(Mouth.TALK_RADIANS, 0.28);
    assert.match(speech, /node\.isBone && \/\^\(\.\*\[:_\]\)\?\(jaw\|lowerjaw\)\$\/i/, 'a jaw alone is enough for a Show Text');
});
