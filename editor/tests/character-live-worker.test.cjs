'use strict';
// The builder's view builds off the page: the worker's build is the page's build, and an unchanged picture is not sent twice.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const dir = path.join(__dirname, '..', 'src', 'forge', 'Character3D');
const { PreviewWorker } = require(path.join(dir, 'CharacterPreviewWorker.cjs'));
const Body = require(path.join(dir, 'HumanBody.js'));
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair']) require(path.join(dir, name + '.js'));
const Model = require(path.join(dir, 'CharacterModel.js'));

const recipe = { gender: 1, hair: { style: 'crew', color: '#3b2a1e' }, outfit: [{ id: 'jeans' }, { id: 'tshirt' }] };
const options = { live: true, quality: 'preview', hairBudget: 1 };

test('the live worker builds what the page builds, and keeps what did not change', async t => {
    const pool = new PreviewWorker({ timeoutMs: 120000 });
    t.after(() => pool.dispose());
    const pack = await Body.loadPack(), page = Model.build(pack, recipe, {}, { quality: 'preview' });
    const first = await pool.build({ key: 'a', cacheKey: 'live', recipe, options });
    assert.equal(first.plan, page.plan);
    assert.deepEqual(first.parts.map(p => p.name), page.parts.map(p => p.name));
    for (const [i, part] of page.parts.entries()) for (const key of ['positions', 'normals', 'uvs', 'index', 'joints', 'weights']) {
        if (part[key]) assert.deepEqual(Array.from(first.parts[i][key]), Array.from(part[key]), part.name + ' ' + key);
    }
    assert.deepEqual(Object.keys(first.textures).sort(), Object.keys(page.textures).sort());
    assert.ok(first.built.shaped instanceof Float32Array, 'the drag path has its body');
    assert.ok(first.bones.length > 10 && first.skinKey);
    const second = await pool.build({ key: 'b', cacheKey: 'live', recipe: { ...recipe, outfit: [{ id: 'jeans' }, { id: 'tshirt', color: '#334455' }] }, options });
    assert.equal(second.textures['skin.png'].data, first.textures['skin.png'].data, 'the skin picture is the same array, so the view uploads nothing');
});
