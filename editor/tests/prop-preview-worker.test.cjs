'use strict';
// Prop Builder previews off the page: arrays cross once, the worker's build is byte for byte the page's,
// only the newest request behind a running build is ever built, and without a worker everything still
// builds on the page.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
global.THREE = require(path.join(root, 'node_modules', 'three'));
global.rrEscapeHtml = s => String(s);
const { PropPreviewClient, createPacker, unpack, scriptFiles } = require(path.join(root, 'src', 'forge', 'Props', 'PropPreviewWorker.cjs'));
for (const file of scriptFiles()) require(file);
const Model = require(path.join(root, 'src', 'forge', 'Props', 'PropModel.js'));

const cross = message => structuredClone(message, { transfer: message.fresh.map(f => f.data.buffer) });

test('a build the page already holds crosses as references, keeping array identity', () => {
    const pack = createPacker(), store = new Map(), picture = new Uint8Array(16).fill(7), positions = [1, 2, 3];
    const build = extra => ({ parts: [{ name: 'a', positions, _hidden: 1, tracks() {} }], textures: { 'a.png': { width: 2, height: 2, data: picture } }, ...extra });
    const first = pack(build());
    assert.equal(first.fresh.length, 2);
    const shown = unpack(cross(first), store, globalThis);
    assert.ok(shown.parts[0].positions instanceof Float32Array);
    assert.equal(shown.parts[0]._hidden, undefined);
    assert.equal(shown.parts[0].tracks, undefined);
    const second = pack(build());
    assert.equal(second.fresh.length, 0, 'nothing changed, nothing crosses');
    const again = unpack(cross(second), store, globalThis);
    assert.equal(again.textures['a.png'].data, shown.textures['a.png'].data, 'the view can skip its upload');
    positions[0] = 9;
    const third = pack(build());
    assert.equal(third.fresh.length, 1, 'geometry changed in place still crosses');
    assert.equal(unpack(cross(third), store, globalThis).parts[0].positions[0], 9);
});

test('the module list is the page\'s, without page-only files', () => {
    const files = scriptFiles().map(f => path.basename(f));
    for (const name of ['PropModel.js', 'VehicleProp.js', 'FurnitureProp.js', 'NatureProp.js', 'SalvageProp.js']) assert.ok(files.includes(name), name);
    for (const name of ['PropBuilder.js', 'Character3DBuilder.js', 'PropSpriteSheet.js']) assert.ok(!files.includes(name), name);
});

const same = (a, b, label) => assert.ok(a === b || (a && b && a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0), label);
const typed = (value, Type) => (value ? (value instanceof Type ? value : Type.from(value)) : value);

test('the worker builds exactly what the page builds, at both sizes', async () => {
    const recipes = [Model.normalize({ kind: 'vehicle', form: 'rover' }), Model.normalize({ kind: 'furniture' }), Model.normalize({ kind: 'container' })];
    const replies = [];
    let next;
    const client = new PropPreviewClient({ onDone: (job, reply) => { replies.push({ job, reply }); next(); }, onFatal: error => { throw error; } });
    const run = job => new Promise(resolve => { next = resolve; client.build(job); });
    try {
        client.syncImages({}, 'project');
        for (const recipe of recipes) for (const textureSize of [512, 1024]) {
            await run({ recipe, textureSize });
            const { reply } = replies.at(-1);
            assert.ok(reply.result, reply.error);
            const page = Model.build(recipe, {}, { textureSize, images: {} });
            assert.equal(reply.result.parts.length, page.parts.length);
            page.parts.forEach((part, k) => {
                const shown = reply.result.parts[k];
                assert.equal(shown.name, part.name);
                for (const key of ['positions', 'normals', 'uvs', 'uvs1', 'colors', 'weights']) same(shown[key], typed(part[key], Float32Array), part.name + ' ' + key);
                same(shown.index, typed(part.index, Uint32Array), part.name + ' index');
            });
            assert.deepEqual(Object.keys(reply.result.textures).sort(), Object.keys(page.textures).sort());
            for (const [name, texture] of Object.entries(page.textures)) if (texture) same(reply.result.textures[name].data, texture.data, name);
            assert.deepEqual(reply.result.bones, JSON.parse(JSON.stringify(page.bones)));
        }
        await run({ recipe: Model.normalize({ kind: 'flag' }), textureSize: 512 });
        assert.equal(replies.at(-1).reply.stayOnPage, true, 'what moves needs its functions, so it stays on the page');
    } finally { client.dispose(); }
});

function builder() {
    const ctx = { window: {}, require, console, THREE, RRPropModel: Model, RRPropCatalog: { ui() {} }, requestAnimationFrame: f => { ctx.frames.push(f); return ctx.frames.length; }, cancelAnimationFrame() {}, frames: [] };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'src', 'forge', 'Props', 'PropBuilder.js'), 'utf8') + ';this.PropBuilder=PropBuilder;', ctx);
    const b = new ctx.PropBuilder({});
    b._view = { group: {} };
    b.shown = [];
    b._showResult = result => b.shown.push(result);
    return { b, ctx };
}

function fakeClient(b) {
    const sent = [];
    b._previewClient = { sent, syncImages() {}, build: job => sent.push(job), dispose() {} };
    return sent;
}

test('only the running build and the newest request are ever built, and a stale step still shows', () => {
    const { b } = builder(), sent = fakeClient(b);
    const recipe = v => ({ kind: 'vehicle', v });
    assert.equal(b._buildOffPage(recipe(1), 512), true);
    b._buildOffPage(recipe(2), 512);
    b._buildOffPage(recipe(3), 512);
    b._buildOffPage(recipe(4), 1024);
    assert.equal(sent.length, 1);
    assert.equal(b._pending, -1, 'the view is known to be waiting');
    b._offPageDone(sent[0], { result: { kind: 'vehicle', v: 1 } });
    assert.deepEqual(sent.map(j => j.recipe.v), [1, 4]);
    assert.equal(b.shown.length, 1);
    assert.equal(b._pending, -1);
    b._offPageDone(sent[1], { result: { kind: 'vehicle', v: 4 } });
    assert.equal(b._pending, 0);
    assert.deepEqual(b.shown.map(r => r.v), [1, 4]);
});

test('a warm-up build never lands on the view, and a page build outranks what is still running', () => {
    const { b } = builder(), sent = fakeClient(b);
    b._buildOffPage({ kind: 'vehicle' }, 1024, true);
    assert.equal(b._pending, 0);
    b._offPageDone(sent[0], { result: { kind: 'vehicle' } });
    assert.equal(b.shown.length, 0);
    b._buildOffPage({ kind: 'flag' }, 1024);
    b.recipe = Model.normalize({ kind: 'flag' });
    b._applyMaterials = () => {};
    b._rebuild();
    assert.equal(b._pending, 0);
    assert.equal(b.shown.length, 1, 'the page build');
    b._offPageDone(sent[1], { result: { kind: 'flag', stale: true } });
    assert.equal(b.shown.length, 1, 'the older worker build is dropped');
});

test('with no worker a slow prop builds on the page; what the worker can\'t make falls back too', () => {
    const { b, ctx } = builder();
    assert.equal(b._offPage(), null, 'outside NW there is no worker');
    b._slowKinds.add('flag');
    b.recipe = Model.normalize({ kind: 'flag' });
    b._queueRebuild();
    ctx.frames.shift()();
    assert.equal(b.shown.length, 1);
    const { b: c } = builder(), sent = fakeClient(c);
    c.recipe = Model.normalize({ kind: 'flag' });
    c._buildOffPage(c.recipe, 1024);
    c._offPageDone(sent[0], { stayOnPage: true });
    assert.ok(c._pageKinds.has('flag'));
    assert.equal(c.shown.length, 1);
    assert.equal(c._pending, 0);
});

test('a color drag previews without touching the recipe', () => {
    const { b, ctx } = builder(), sent = fakeClient(b);
    b.recipe = Model.normalize({ kind: 'flag' });
    b._slowKinds.add('flag');
    const kept = b.recipe, path = 'pole.color';
    b._previewColor(path, '#123456');
    assert.equal(b.recipe, kept);
    assert.equal(sent[0].recipe.pole.color, '#123456');
    assert.equal(sent[0].textureSize, 512);
    assert.equal(b._colorShown, true);
    assert.equal(ctx.frames.length, 0);
});
