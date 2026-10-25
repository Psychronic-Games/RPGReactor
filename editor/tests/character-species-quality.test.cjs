'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { PNG } = require('pngjs');
const Q = require('./helpers/character-quality-matrix.cjs');
const fixtures = Q.inventory();
let pack, eyeSource;
test.before(async () => {
    pack = await Q.Body.loadPack();
    const eye = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/data/eye-brown.png')));
    eyeSource = { width: eye.width, height: eye.height, data: new Uint8Array(eye.data) };
});
const options = () => ({ quality: 'preview', skinSize: 32, atlasSize: 64, hairBudget: 0.2, eyeSource });

test('quality inventory includes every species, selectable head, creature kind, fin, palette and slime form', () => {
    for (const species of Q.Species.SPECIES) assert.ok(fixtures.some(f => f.entity === species.id), species.id);
    for (const [head] of Q.Species.heads()) assert.ok(fixtures.some(f => f.group === 'heads' && f.entity === head), head);
    for (const kind of Q.Creature.KINDS) for (const profile of Q.CREATURE_STRATA) assert.ok(fixtures.some(f => f.group === 'creatures' && f.entity === kind.kind && f.stratum === profile.id), kind.kind + '/' + profile.id);
    for (const [fin] of Q.Merfolk.FINS) for (const [color] of Q.Merfolk.COLORS) for (const length of [1, 2]) assert.ok(fixtures.some(f => f.group === 'merfolk' && f.recipe.merfolk.fin === fin && f.recipe.merfolk.colors === color && f.recipe.merfolk.length === length), [fin, color, length].join('/'));
    for (const form of [0, 0.5, 1]) for (const size of [0.4, 2.5]) for (const [feelers] of Q.Slime.FEELERS) assert.ok(fixtures.some(f => f.group === 'slime' && f.recipe.form === form && f.recipe.size === size && f.recipe.feelers === feelers));
    for (const slider of Q.Creature.SLIDERS) {
        assert.equal(Q.CREATURE_STRATA.find(s => s.id === 'all-min').patch[slider.key], slider.min);
        assert.equal(Q.CREATURE_STRATA.find(s => s.id === 'all-max').patch[slider.key], slider.max);
    }
});
for (const [group, label] of [['species', 'all humanoid species at eight stratified body/face extremes'], ['heads', 'all selectable heads at average, short, tall and heavy extremes'], ['creatures', 'all quadruped kinds across all slider endpoints and mixed extremes'], ['merfolk', 'all merfolk fins/palettes at shortest and longest tails on extreme hips'], ['slime', 'all slime forms, size endpoints and feelers']]) {
    const cases = fixtures.filter(f => f.group === group);
    test(label + ' retain finite geometry, unit normals, valid skins and continuous attachments (' + cases.length + ' builds)', () => {
        const caches = new Map();
        for (const fixture of cases) {
            if (!caches.has(fixture.entity)) caches.set(fixture.entity, {});
            const result = Q.Model.build(pack, fixture.recipe, caches.get(fixture.entity), options());
            const report = Q.inspect(result, fixture, pack);
            assert.deepEqual(report.issues, [], group + '/' + fixture.id + ': ' + JSON.stringify(report.issues));
        }
    });
}

test('creature eyeballs use closed pole fans without zero-area faces or zero normals', () => {
    for (const kind of ['bull', 'rabbit', 'bird', 'crow']) {
        const built = Q.Creature.build(Q.Creature.kindRecipe(kind), { quality: 'preview', headOnly: true, hairBudget: 0 });
        const eyes = built.parts.find(p => p.name === 'Eyes'), edges = new Map();
        const P = eyes.positions;
        for (let t = 0; t < eyes.index.length; t += 3) {
            const a = eyes.index[t], b = eyes.index[t + 1], c = eyes.index[t + 2];
            const u = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), v = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
            assert.ok(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > built.height * built.height * 1e-12, kind + ' eye face area');
            for (const [i, j] of [[a, b], [b, c], [c, a]]) { const key = i < j ? i + ':' + j : j + ':' + i; edges.set(key, (edges.get(key) || 0) + 1); }
        }
        assert.ok([...edges.values()].every(count => count === 2), kind + ' closed eyes');
        for (let i = 0; i < eyes.normals.length; i += 3) assert.ok(Math.abs(Math.hypot(...eyes.normals.subarray(i, i + 3)) - 1) < 1e-5, kind + ' lit pole');
    }
});
