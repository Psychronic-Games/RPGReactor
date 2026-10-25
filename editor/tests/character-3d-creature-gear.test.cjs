'use strict';
// Forge › 3D Character Builder, four-legged gear (RRCreatureGear): a catalog of collars, tack, barding, packs and regalia,
// presets, a normalized `gear` list in the creature recipe, and parts fitted and skinned to the creature they are built on.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const Gear = require(path.join(root, 'src', 'forge', 'Character3D', 'CreatureGear.js'));
const Creature = require(path.join(root, 'src', 'forge', 'Character3D', 'CreatureBody.js'));

test('the catalog: every piece has a slot, group, materials and defaults; presets name real pieces', () => {
    const ids = new Set();
    for (const item of Gear.ITEMS) {
        assert.ok(!ids.has(item.id)); ids.add(item.id);
        assert.ok(item.label && item.group && item.slot);
        assert.ok(item.materials.includes(item.defaults.material));
        for (const m of item.materials) assert.ok(Gear.MATERIALS.some(x => x.id === m), m);
        assert.match(item.defaults.color, /^#[0-9a-f]{6}$/);
    }
    assert.deepEqual(Gear.PRESETS.map(p => p.id), ['pet', 'companion', 'mount', 'war', 'royal', 'pack']);
    for (const p of Gear.PRESETS) for (const i of p.items) assert.ok(ids.has(i.id), p.id + ' ' + i.id);
});

test('normalizeGear: known pieces, one a slot, colors and material checked', () => {
    const g = Gear.normalizeGear([{ id: 'collar' }, { id: 'spikedCollar', color: '#ABCDEF', material: 'gold' }, { id: 'nope' }, { id: 'saddle', color: 'red' }]);
    assert.deepEqual(g.map(x => x.id), ['spikedCollar', 'saddle']);
    assert.equal(g[0].color, '#abcdef');
    assert.equal(g[0].material, 'leather', 'gold is not a spiked collar\'s material');
    assert.equal(g[1].color, Gear.ITEMS.find(i => i.id === 'saddle').defaults.color);
    assert.deepEqual(Gear.normalizeGear('x'), []);
    assert.deepEqual(Creature.normalizeRecipe({ gear: [{ id: 'crown' }] }).gear.map(x => x.id), ['crown']);
    assert.deepEqual(Creature.kindRecipe('horse').gear, []);
    assert.ok(Gear.fits('bridle', Creature.kindRecipe('horse')) && !Gear.fits('bridle', Creature.kindRecipe('cat')) && Gear.fits('collar', Creature.kindRecipe('cat')));
});

test('every piece builds on every kind, skinned to real bones, as cloth or metal, near the body', () => {
    for (const kind of ['horse', 'dog', 'lion', 'cat', 'bull']) {
        const base = Creature.kindRecipe(kind);
        const bare = Creature.build(base, { quality: 'preview', hairBudget: 0 });
        const height = bare.height;
        for (const item of Gear.ITEMS) {
            const built = Creature.build(Object.assign({}, base, { gear: [{ id: item.id }] }), { quality: 'preview', hairBudget: 0 });
            const parts = built.parts.filter(p => p.name.startsWith('Gear '));
            assert.ok(parts.length, kind + ' ' + item.id + ' builds');
            for (const p of parts) {
                assert.ok(p.kind === 'cloth' || p.kind === 'metal', p.kind);
                assert.equal(p.colors.length, p.positions.length);
                for (let v = 0; v < p.positions.length / 3; v++) {
                    let sum = 0;
                    for (let k = 0; k < 4; k++) { sum += p.weights[v * 4 + k]; assert.ok(p.joints[v * 4 + k] < built.bones.length); }
                    assert.ok(Math.abs(sum - 1) < 1e-4, kind + ' ' + item.id + ' weights ' + sum);
                    const y = p.positions[v * 3 + 1];
                    assert.ok(Number.isFinite(y) && y > -0.02 * height && y < height * 1.6, kind + ' ' + item.id + ' at ' + y);
                }
            }
        }
    }
});

test('a preset dresses a creature in one build, and the saved file keeps the gear', () => {
    const Glb = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterGlb.js'));
    const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
    const built = Creature.build(Object.assign(Creature.kindRecipe('horse'), { gear: Gear.presetGear('war') }), { quality: 'save' });
    const names = built.parts.map(p => p.name);
    assert.ok(names.includes('Gear metal') && names.includes('Gear leather'), names.join(','));
    const { json } = Optimizer.parseGlb(Glb.toGlb(built, { name: 'Warhorse', clips: built.clips }));
    assert.ok(json.meshes.some(m => m.name === 'Gear metal'));
});
