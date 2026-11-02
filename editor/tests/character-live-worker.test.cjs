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

test('the browser drag shaper uses the same human head data as the complete model', async () => {
    const fs = require('node:fs'), vm = require('node:vm');
    class BrowserWorker {
        constructor(blob) {
            this.scope = vm.createContext({ console, postMessage: data => { this.output = data; } });
            vm.runInContext('self = globalThis;', this.scope);
            vm.runInContext(blob.code, this.scope);
        }
        postMessage(data) { this.scope.onmessage({ data }); }
    }
    const scope = { window: { RRCharacterExpressions: require(path.join(dir, 'CharacterExpressions.js')) }, console, process, require, RRHumanBody: Body,
        Blob: class { constructor(parts) { this.code = parts.join(''); } },
        URL: { createObjectURL: blob => blob }, Worker: BrowserWorker };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), scope);
    const pack = await Body.loadPack(), builder = Object.create(scope.window.Character3DBuilder.prototype);
    builder.pack = pack;
    const worker = builder._shapeWorker();
    assert.ok(worker, 'the real browser-worker source starts');
    for (const input of [{ gender: 0 }, { gender: 1 }, { gender: 0.5, shapes: { headWidth: 0.6 } }, { gender: 0, shapes: { abs: 2 } }, { gender: 1, shapes: { abs: 2 } }, Model.withSpecies({ gender: 0, cup: 0.8 }, 'alien')]) {
        const recipe = Model.normalize(input), expected = Body.shape(pack, recipe);
        worker.postMessage({ recipe, result: 1 });
        const actual = new Float32Array(worker.output.shaped);
        assert.equal(actual.length, expected.length);
        const mismatch = expected.findIndex((value, i) => value !== actual[i]);
        assert.equal(mismatch, -1, 'drag/complete body coordinates differ at ' + mismatch);
        const expectedNormals = Body.gather(Body.skinNormals(pack, expected, recipe), pack.body.source, 3), actualNormals = new Float32Array(worker.output.normals);
        assert.equal(actualNormals.length, expectedNormals.length);
        const normalMismatch = expectedNormals.findIndex((value, i) => value !== actualNormals[i]);
        assert.equal(normalMismatch, -1, 'drag/complete body shading differs at ' + normalMismatch);
    }
});

test('shared human heads use complete builds during input instead of deforming an older face', () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const scope = { window: { RRHeadMesh: require(path.join(dir, 'CharacterHeadMesh.js')) }, console };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), scope);
    const builder = Object.create(scope.window.Character3DBuilder.prototype);
    Object.assign(builder, { recipe: Model.normalize({ gender: 0.6 }), pack: {},
        _view: { meshes: [{}] }, _result: { plan: 'human', built: {}, parts: [{}] },
        _fastStart() { throw Error('an old face must not be stretched'); } });
    assert.equal(builder._fastShape(), false);
});

test('a completed live build cannot replace a more recent recipe', async () => {
    const fs = require('node:fs'), vm = require('node:vm'), context = { window: {}, console, process, require };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), context);
    const builder = Object.create(context.window.Character3DBuilder.prototype);
    let finish, applied = 0, queued = 0;
    Object.assign(builder, {
        _view: {}, pack: {}, recipe: { gender: 0 }, cache: {},
        _livePool: () => ({ build: () => new Promise(resolve => { finish = resolve; }) }),
        _loadOutfitEmblems() {}, async _configurePreview() {}, _buildOptions: () => ({}),
        _applyBuild() { applied++; }, _queueRebuild() { queued++; }
    });
    builder._rebuildOffPage();
    await new Promise(resolve => setImmediate(resolve));
    builder.recipe = { gender: 1 };
    finish({ skinKey: 'old' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(applied, 0, 'the earlier face never reaches the view');
    assert.equal(queued, 1, 'the current recipe is scheduled');
    assert.equal(builder._liveJob.busy, false);
});

test('a completed live build keeps the page skin cache paired with its new key', async () => {
    const fs = require('node:fs'), vm = require('node:vm'), context = { window: {}, console, process, require };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), context);
    const builder = Object.create(context.window.Character3DBuilder.prototype), skin = { data: Uint8Array.of(90, 60, 40, 255) };
    Object.assign(builder, {
        _view: {}, pack: {}, recipe: { skin: '#744b35' }, cache: { skinKey: 'old', skin: { data: Uint8Array.of(220, 180, 150, 255) } },
        _livePool: () => ({ build: async () => ({ skinKey: 'new', textures: { 'skin.png': skin } }) }),
        _loadOutfitEmblems() {}, async _configurePreview() {}, _buildOptions: () => ({}), _applyBuild() {}
    });
    builder._rebuildOffPage();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(builder.cache.skinKey, 'new');
    assert.ok(builder.cache.skin === skin, 'the next page build cannot reuse old pixels under the new key');
});

test('completed slider samples display during a drag, but cannot cross release or another edit', async () => {
    const fs = require('node:fs'), vm = require('node:vm'), context = { window: {}, console, process, require };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), context);
    for (const scenario of ['moving', 'released', 'another edit', 'new gesture']) {
        const builder = Object.create(context.window.Character3DBuilder.prototype);
        let finish, applied = 0, queued = 0;
        Object.assign(builder, {
            _view: {}, pack: {}, recipe: { shapes: { headWidth: 0 }, gender: 0 }, cache: {},
            _rangeDrag: { path: 'shapes.headWidth' },
            _livePool: () => ({ build: () => new Promise(resolve => { finish = resolve; }) }),
            _loadOutfitEmblems() {}, async _configurePreview() {}, _buildOptions: () => ({}),
            _applyBuild() { applied++; }, _queueRebuild() { queued++; }
        });
        builder._rebuildOffPage();
        await new Promise(resolve => setImmediate(resolve));
        builder.recipe.shapes.headWidth = 0.4;
        if (scenario === 'released') builder._rangeDrag = null;
        if (scenario === 'another edit') builder.recipe.gender = 1;
        if (scenario === 'new gesture') builder._rangeDrag = { path: 'shapes.headWidth' };
        finish({ skinKey: 'sample', textures: {} });
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(applied, scenario === 'moving' ? 1 : 0, scenario);
        assert.equal(queued, 1, scenario + ' schedules the newest value');
        assert.equal(builder._liveJob.busy, false);
    }
});

test('the live worker builds what the page builds, and keeps what did not change', async t => {
    const pool = new PreviewWorker({ timeoutMs: 120000 });
    t.after(() => pool.dispose());
    const pack = await Body.loadPack(), page = Model.build(pack, recipe, {}, { quality: 'preview' });
    const first = await pool.build({ key: 'a', cacheKey: 'live', recipe, options });
    assert.equal(first.plan, page.plan);
    assert.deepEqual(first.parts.map(p => p.name), page.parts.map(p => p.name));
    for (const [i, part] of page.parts.entries()) for (const key of ['positions', 'normals', 'uvs', 'uvs1', 'index', 'joints', 'weights']) {
        if (part[key]) {
            const actual = first.parts[i][key], expected = part[key];
            assert.equal(actual?.length, expected.length, part.name + ' ' + key + ' length');
            const different = expected.findIndex((value, at) => actual[at] !== value);
            assert.equal(different, -1, part.name + ' ' + key + ' differs at ' + different);
        }
    }
    assert.deepEqual(Object.keys(first.textures).sort(), Object.keys(page.textures).sort());
    assert.ok(first.built.shaped instanceof Float32Array, 'the drag path has its body');
    assert.ok(first.bones.length > 10 && first.skinKey);
    const second = await pool.build({ key: 'b', cacheKey: 'live', recipe: { ...recipe, outfit: [{ id: 'jeans' }, { id: 'tshirt', color: '#334455' }] }, options });
    assert.equal(second.textures['skin.png'].data, first.textures['skin.png'].data, 'the skin picture is the same array, so the view uploads nothing');
});
