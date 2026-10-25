'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function builder(extra = {}) {
    const scope = { window: { innerWidth: 1000, innerHeight: 800 }, console, setTimeout, clearTimeout,
        CSS: { escape: s => s }, ...extra };
    vm.runInNewContext(source, scope);
    const b = Object.create(scope.window.Character3DBuilder.prototype);
    Object.assign(b, { recipe: {}, cache: {}, _thumbs: new Map(), _thumbQueue: [], _thumbEpoch: 0,
        _lastChange: 0, _view: {}, _result: {}, pack: {}, _project: () => ({ path: '/project' }) });
    return b;
}
function tile(key, top = 20) {
    return { dataset: { thumb: key }, innerHTML: '', getBoundingClientRect: () => ({ left: 20, right: 100, top, bottom: top + 80, width: 80, height: 80 }) };
}
function mount(b, tiles) {
    const panel = { getBoundingClientRect: () => ({ top: 0, bottom: 200, left: 0, right: 200 }), querySelectorAll: () => tiles };
    b.root = { isConnected: true, querySelector: () => panel,
        querySelectorAll: selector => selector.includes('="') ? tiles.filter(t => selector.includes('="' + t.dataset.thumb + '"')) : tiles };
    return panel;
}

test('animated previews draw every requested frame but re-aim only when camera inputs change', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE;
    const preview = builder({ THREE });
    let aims = 0, draws = 0;
    const track = camera => {
        const lookAt = camera.lookAt;
        camera.lookAt = function(...args) { aims++; return lookAt.apply(this, args); };
        return camera;
    };
    const view = preview._view = { camera: track(new THREE.PerspectiveCamera()), target: new THREE.Vector3(0, 1, 0),
        yaw: 0.3, pitch: 0.2, distance: 4, scene: new THREE.Scene(), renderer: { render() { draws++; } } };
    for (let frame = 0; frame < 60; frame++) preview._render();
    assert.equal(draws, 60);
    assert.equal(aims, 1);
    const edits = [() => view.yaw += 0.1, () => view.pitch += 0.1, () => view.distance++, () => view.target.x++,
        () => view.target.y++, () => view.target.z++, () => view.camera.position.x++, () => view.camera.quaternion.identity(),
        () => view.camera.up.set(0, 0.9, 0.1), () => view.camera = track(new THREE.PerspectiveCamera())];
    for (const edit of edits) {
        const initial = aims;
        edit(); preview._render(); preview._render();
        assert.equal(aims, initial + 1);
        const expected = new THREE.PerspectiveCamera();
        expected.up.copy(view.camera.up);
        expected.position.set(view.target.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance,
            view.target.y + Math.sin(view.pitch) * view.distance, view.target.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance);
        expected.lookAt(view.target);
        assert.deepEqual(view.camera.position.toArray(), expected.position.toArray());
        assert.deepEqual(view.camera.quaternion.toArray(), expected.quaternion.toArray());
    }
});
test('the scheduler excludes clipped tiles and does no hidden background work', async () => {
    const b = builder(), visible = tile('species:human'), hidden = tile('species:minotaur', 220);
    mount(b, [visible, hidden]);
    const built = [];
    b._storedThumb = async () => null;
    b._makeThumb = async item => { built.push(item.key); return 'data:image/webp;base64,AAA'; };
    b._storeThumb = () => {};
    b._wantThumb('species', 'minotaur'); b._wantThumb('species', 'human');
    await pause(65);
    assert.deepEqual(built, ['species:human']);
    assert.match(visible.innerHTML, /<img/);
    assert.equal(hidden.innerHTML, '');
    assert.equal(b._thumbTimer, 0, 'offscreen work does not keep polling');
    b._stopThumbs();
});
test('visible builds run serially and a cached picture bypasses geometry generation', async () => {
    const b = builder(), a = tile('dress:a'), cached = tile('dress:b'), c = tile('dress:c');
    mount(b, [a, cached, c]);
    let finish, active = 0, max = 0;
    const built = [];
    b._storedThumb = async key => key === 'dress:b' ? 'data:image/webp;base64,CACHE' : null;
    b._makeThumb = item => { built.push(item.key); active++; max = Math.max(max, active); return new Promise(resolve => { finish = () => { active--; resolve('data:image/webp;base64,NEW'); }; }); };
    b._storeThumb = () => {};
    for (const id of ['a', 'b', 'c']) b._wantThumb('dress', id);
    await pause(35);
    assert.deepEqual(built, ['dress:a']);
    finish(); await pause(55);
    assert.deepEqual(built, ['dress:a', 'dress:c']);
    assert.match(cached.innerHTML, /CACHE/);
    assert.equal(max, 1);
    finish(); await pause(25); b._stopThumbs();
});
test('scrolling away cancels obsolete work while reusing one worker and ignores its late result', async () => {
    const b = builder(), old = tile('species:human');
    const tiles = [old]; mount(b, tiles);
    const pending = new Map(); let disposed = 0, canceled = 0;
    const pool = b._previewWorker = { dispose() { disposed++; }, cancelAll() { canceled++; } };
    b._storedThumb = async () => null;
    b._storeThumb = () => {};
    b._makeThumb = item => new Promise(resolve => pending.set(item.key, resolve));
    b._wantThumb('species', 'human'); await pause(30);
    const current = tile('dress:knight'); tiles.splice(0, tiles.length, current);
    b._refreshThumbs(); await pause(30);
    assert.equal(disposed, 0, 'switching choices does not churn native worker allocations');
    assert.equal(canceled, 1);
    assert.equal(b._previewWorker, pool);
    assert.equal(b._thumbJob.key, 'dress:knight');
    pending.get('species:human')('data:image/webp;base64,OLD'); await pause(5);
    assert.equal(current.innerHTML, '');
    pending.get('dress:knight')('data:image/webp;base64,CURRENT'); await pause(25);
    assert.match(current.innerHTML, /CURRENT/);
    assert.equal(b._thumbs.has('species:human'), false);
    b._stopThumbs();
    assert.equal(disposed, 1, 'teardown still releases the worker');
});
test('teardown cancels worker/cache work before a view exists', () => {
    const b = builder(); let disposed = 0;
    b._view = null; b._closeOutfitImport = () => {};
    b._previewWorker = { dispose() { disposed++; } };
    b._thumbJob = { key: 'dress:a' };
    b._thumbQueue = [{ key: 'dress:b' }];
    b.detach();
    assert.equal(disposed, 1);
    assert.equal(b._thumbJob, null);
    assert.equal(b._thumbQueue.length, 0);
});
test('preview signatures track head, eyes and body hair but exclude an outfit not shown in a garment picture', () => {
    const b = builder();
    b.recipe = { head: { kind: 'rabbit' }, eyes: { color: '#ffffff' }, bodyHair: { density: 0 }, outfit: [{ id: 'robe' }] };
    const initial = b._thumbSig('garment');
    b.recipe = { ...b.recipe, outfit: [{ id: 'jeans' }] };
    assert.equal(b._thumbSig('garment'), initial);
    for (const patch of [{ head: { kind: 'cat' } }, { eyes: { color: '#000000' } }, { bodyHair: { density: 1 } }]) {
        b.recipe = { ...b.recipe, ...patch };
        assert.notEqual(b._thumbSig('garment'), initial);
    }
});

test('recipe edits retain the previous picture while queuing its replacement, without borrowing another project', () => {
    const b = builder({ rrEscapeHtml: value => value });
    mount(b, [tile('hair:long')]);
    b._t = value => value; b._pumpThumbs = () => {};
    b.recipe = { hair: { style: 'long' }, skin: '#c69c7f' };
    const sig = b._thumbSig('hair');
    b._showThumb({ key: 'hair:long', sig }, 'data:image/webp;base64,PREVIOUS');
    b.recipe = { ...b.recipe, skin: '#603521' };
    assert.match(b._tile('pick', 'long', 'Long', 'hair', true), /PREVIOUS/);
    assert.match(b._picker('hair.style', 'Hair', [{ id: 'long', label: 'Long' }], 'hair'), /PREVIOUS/);
    assert.equal(b._thumbs.get('hair:long').sig, sig, 'a previous picture is not marked current');
    assert.equal(b._thumbQueue.length, 1);
    assert.equal(b._thumbQueue[0].sig, b._thumbSig('hair'));
    b._project = () => ({ path: '/another-project' });
    assert.doesNotMatch(b._tile('pick', 'long', 'Long', 'hair', true), /PREVIOUS/);
    assert.doesNotMatch(b._picker('hair.style', 'Hair', [{ id: 'long', label: 'Long' }], 'hair'), /PREVIOUS/);
});
test('thumbnail build requests use the worker and never call the main-thread character generator', async () => {
    const b = builder({ RRCharacterModel: { build() { assert.fail('main-thread build'); } } });
    mount(b, []);
    const result = { parts: [], textures: {}, height: 1 }, requests = [];
    const pool = { build: async request => { requests.push(request); return result; } };
    b._previewWorker = pool; b._previewPool = () => pool;
    b._configurePreview = async () => {};
    b._thumbRecipe = () => ({ recipe: { species: 'human' }, frame: 'body' });
    const made = await b._thumbParts({ key: 'species:human', sig: 'shape', kind: 'species' });
    assert.equal(made.result, result);
    assert.equal(requests[0].key, 'species:human|shape');
    assert.equal(requests[0].options.static, true);
    assert.equal(requests[0].options.skinSize, 128);
    assert.equal(requests[0].options.hairBudget, 0.5);
    b._thumbRecipe = () => ({ recipe: { species: 'human' }, frame: 'head' });
    await b._thumbParts({ key: 'hair:long', sig: 'head', kind: 'hair' });
    assert.equal(requests[1].options.skinSize, 256, 'close-up pictures keep their face detail');
});

test('first startup preloads only the selected transferred outfits and ignores unrelated picture arrivals', async () => {
    const requests = [];
    let arrival, rebuilt = 0;
    const transfer = { BUILT_IN: ['selected', 'unused'], registerProject() {}, onPicture(callback) { arrival = callback; return () => {}; },
        async preload(keys) { requests.push(Array.from(keys)); } };
    const b = builder({ window: { THREE: {}, RRCharacterOutfitTransfer: transfer }, RRCharacterOutfitTransfer: transfer,
        RRCharacterWardrobe: { BY_ID: new Map([['uniform', { transfer: 'selected' }]]) } });
    mount(b, []);
    b.recipe = { outfit: [{ id: 'uniform' }, { id: 'uniform' }] };
    b.eyeSource = {}; b._queueRebuild = () => { rebuilt++; };
    b._status = () => {}; b._t = text => text;
    b._makeView = b._rebuild = b._refreshThumbs = () => {};
    b.root.querySelector = () => ({});
    await b._start();
    assert.deepEqual(requests, [['selected']]);
    arrival('unused'); assert.equal(rebuilt, 0);
    arrival('selected'); assert.equal(rebuilt, 1);
});

test('Node worker render arrays become zero-copy page-realm views for WebGL', () => {
    const b = builder();
    for (const name of ['Float32Array', 'Uint32Array', 'Uint16Array', 'Uint8Array']) {
        const remote = vm.runInNewContext('new ' + name + '([1,2,3])');
        const local = b._previewArray(remote);
        assert.equal(local.constructor.name, name);
        assert.equal(local.buffer, remote.buffer, 'no geometry copy on the page');
        assert.deepEqual(Array.from(local), [1,2,3]);
        assert.equal(b._previewArray(local), local, 'already local views are reused');
    }
});

test('a changed recipe discards a late direct/import thumbnail before GPU work', async () => {
    const b = builder({ requestAnimationFrame: callback => setTimeout(callback, 0) });
    mount(b, []); let finish;
    b._thumbParts = () => new Promise(resolve => { finish = resolve; });
    b._renderThumb = () => assert.fail('a stale direct preview reached the GPU');
    const pending = b._makeThumb({ key: 'dress:imported', kind: 'dress', sig: b._thumbSig('dress') });
    b.recipe = { gender: 1 };
    finish({ result: { parts: [] }, frame: 'body' });
    await assert.rejects(pending, { name: 'AbortError' });
});

test('hidden windows suspend visible-tile work and remove the visibility listener on teardown', async () => {
    const b = builder(), shown = tile('species:human'); mount(b, [shown]);
    b._draw = () => {};
    const listeners = new Set();
    b.root.ownerDocument = { hidden: true, defaultView: { innerWidth: 1000, innerHeight: 800 },
        addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
    let built = 0, disposed = 0;
    b._previewWorker = { dispose() { disposed++; } };
    b._storedThumb = async () => null; b._storeThumb = () => {};
    b._makeThumb = async () => { built++; return 'data:image/webp;base64,READY'; };
    b._wantThumb('species', 'human'); b._refreshThumbs();
    await pause(30);
    assert.equal(built, 0);
    assert.equal(b._thumbTimer, 0);
    assert.equal(listeners.size, 1);
    assert.equal(disposed, 1, 'a hidden window releases even an idle worker and its model caches');
    assert.equal(b._previewWorker, null);
    b.root.ownerDocument.hidden = false;
    for (const fn of listeners) fn();
    await pause(35);
    assert.equal(built, 1);
    b._stopThumbs(); assert.equal(listeners.size, 0);
});

test('cached visible pictures load together before the character view is ready', async t => {
    const b = builder(), tiles = ['a', 'b', 'c'].map(id => tile('dress:' + id));
    mount(b, tiles);
    t.after(() => b._stopThumbs());
    b._view = null; b._result = null; b.pack = null;
    const reads = new Map();
    b._storedThumb = key => new Promise(resolve => reads.set(key, resolve));
    b._makeThumb = () => assert.fail('cached thumbnails must not build');
    for (const id of ['a', 'b', 'c']) b._wantThumb('dress', id);
    await pause(35);
    assert.deepEqual([...reads.keys()], ['dress:a', 'dress:b', 'dress:c']);
    reads.get('dress:c')('data:image/webp;base64,CACHE');
    await pause(0);
    assert.match(tiles[2].innerHTML, /CACHE/);
    assert.equal(tiles[0].innerHTML, '');
    reads.get('dress:a')('data:image/webp;base64,CACHE');
    reads.get('dress:b')('data:image/webp;base64,CACHE');
    await pause(25);
    assert.ok(tiles.every(el => el.innerHTML.includes('CACHE')));
    assert.equal(b._thumbQueue.length, 0);
    assert.equal(b._thumbTimer, 0);
});

test('a cached visible picture is not held behind an uncached build', async t => {
    const b = builder(), tiles = [tile('dress:a')]; mount(b, tiles);
    t.after(() => b._stopThumbs());
    let finish, builds = 0;
    b._storedThumb = async key => key === 'dress:b' ? 'data:image/webp;base64,CACHE' : null;
    b._makeThumb = () => { builds++; return new Promise(resolve => { finish = resolve; }); };
    b._storeThumb = () => {};
    b._wantThumb('dress', 'a'); await pause(35);
    assert.equal(builds, 1);
    tiles.push(tile('dress:b'));
    b._refreshThumbs(); await pause(35);
    assert.match(tiles[1].innerHTML, /CACHE/);
    assert.equal(builds, 1);
    finish('data:image/webp;base64,NEW'); await pause(35);
    assert.equal(builds, 1, 'refreshing the active tile does not queue another build');
});

test('a late disk read cannot overwrite a changed recipe or a detached tool', async t => {
    const b = builder(), shown = tile('dress:a'); mount(b, [shown]);
    t.after(() => b._stopThumbs());
    let finish;
    b._storedThumb = () => new Promise(resolve => { finish = resolve; });
    b._wantThumb('dress', 'a'); await pause(35);
    b.recipe = { gender: 1 };
    finish('data:image/webp;base64,OLD'); await pause(25);
    assert.equal(shown.innerHTML, '');
    assert.equal(b._thumbs.size, 0);
    b._wantThumb('dress', 'a'); await pause(35);
    b._stopThumbs();
    finish('data:image/webp;base64,LATE'); await pause(25);
    assert.equal(shown.innerHTML, '');
    assert.equal(b._thumbTimer, 0);
});

test('a recipe changed during a disk read checks the new cache entry before building', async t => {
    const b = builder(), shown = tile('dress:a'); mount(b, [shown]);
    t.after(() => b._stopThumbs());
    const reads = [];
    b._storedThumb = (key, sig) => new Promise(resolve => reads.push({ sig, resolve }));
    b._makeThumb = () => assert.fail('a new cached recipe must not build');
    b._wantThumb('dress', 'a'); await pause(35);
    b.recipe = { gender: 1 };
    b._refreshThumbs();
    reads[0].resolve('data:image/webp;base64,OLD'); await pause(35);
    assert.equal(shown.innerHTML, '');
    assert.equal(reads.length, 2);
    assert.notEqual(reads[0].sig, reads[1].sig);
    reads[1].resolve('data:image/webp;base64,NEW'); await pause(25);
    assert.match(shown.innerHTML, /NEW/);
});

test('thumbnail shaders stay alive until the next render and geometry and textures are released', async () => {
    global.self = global; global.window = global;
    require('../../runtime/libs/three.js');
    const THREE = global.THREE;
    const b = builder({ THREE, cancelAnimationFrame() {} });
    const materials = [], geometries = [], textures = [];
    const view = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(28, 1, 0.02, 60), materials: [],
        canvas: { toDataURL: () => 'data:image/webp;base64,NEW' }, renderer: { render() {
            for (const material of materials) assert.equal(material.disposed, undefined, 'previous programs remain referenced during the next render');
            const mesh = view.scene.children[0].children[0];
            geometries.push(mesh.geometry); mesh.geometry.addEventListener('dispose', () => { mesh.geometry.disposed = true; });
        } } };
    b._ensureThumbView = () => view;
    b._thumbnailMaterial = (part, result, textureFor) => {
        const texture = textureFor('skin.png', result.textures['skin.png']);
        texture.addEventListener('dispose', () => { texture.disposed = true; }); textures.push(texture);
        const material = new THREE.MeshBasicMaterial({ map: texture });
        material.addEventListener('dispose', () => { material.disposed = true; }); materials.push(material);
        return material;
    };
    const prepared = { frame: 'body', result: { height: 1,
        textures: { 'skin.png': { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) } },
        parts: [{ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), index: new Uint16Array([0, 1, 2]) }] } };
    await b._renderThumb(prepared);
    assert.equal(materials[0].disposed, undefined);
    await b._renderThumb(prepared);
    assert.equal(materials[0].disposed, true);
    assert.equal(materials[1].disposed, undefined);
    assert.equal(view.materials.length, 1);
    assert.ok(geometries.every(geometry => geometry.disposed));
    assert.ok(textures.every(texture => texture.disposed));
    assert.equal(view.scene.children.length, 0);
    view.renderer.render = () => { throw new Error('render failed'); };
    await assert.rejects(b._renderThumb(prepared), /render failed/);
    assert.equal(materials[1].disposed, undefined, 'failed renders keep the previous programs');
    assert.equal(materials[2].disposed, true);
    assert.equal(textures[2].disposed, true);
    assert.equal(view.scene.children.length, 0);
    view.renderer.dispose = () => {};
    b._thumbView = view;
    b._view = { textures: new Map(), renderer: { dispose() {} } };
    b._dropHeldPreview = b._clearModel = () => {};
    b.detach();
    assert.equal(materials[1].disposed, true, 'teardown releases the last retained programs');
    assert.equal(b._thumbView, null);
});

test('thumbnail materials retain explicit relief with lightweight lighting and no generated skin microdetail', () => {
    const THREE = global.THREE;
    const b = builder({ THREE });
    const used = [];
    const texture = new THREE.Texture(), relief = new THREE.Texture(), reflections = new THREE.CubeTexture();
    const result = { textures: { skin: {}, relief: {}, glow: {} } };
    const textureFor = name => { used.push(name); return name === 'relief' ? relief : texture; };
    for (const kind of ['skin', 'cloth', 'metal', 'hair', 'eye', 'goo', 'glass']) {
        const material = b._thumbnailMaterial({ kind, texture: 'skin', normalTexture: 'relief', cutout: kind === 'hair',
            doubleSided: true, opacity: kind === 'glass' ? 0.4 : 1 }, result, textureFor, reflections);
        assert.equal(material.isMeshPhongMaterial, true);
        assert.equal(material.normalMap, relief);
        assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace);
        assert.equal(material.side, THREE.DoubleSide);
        assert.equal(material.envMap, ['metal', 'eye', 'goo', 'glass'].includes(kind) ? reflections : null);
        if (kind === 'goo') { assert.equal(material.transparent, true); assert.equal(material.depthWrite, false); }
        if (kind === 'hair') assert.equal(material.alphaToCoverage, true);
        if (kind === 'glass') { assert.equal(material.transparent, true); assert.equal(material.depthWrite, false); }
    }
    const glow = b._thumbnailMaterial({ kind: 'goo', emissiveTexture: 'glow' }, result, textureFor, reflections);
    assert.equal(glow.emissiveMap, texture);
    for (const intensity of [0,.35,1]) {
        const indicator = b._thumbnailMaterial({ emissive: '#ffffff', emissiveIntensity: intensity }, result, textureFor, reflections);
        assert.equal(indicator.emissiveIntensity,intensity);
        indicator.dispose();
    }
    assert.ok(used.includes('relief'));
    const plain=b._thumbnailMaterial({kind:'skin'},{textures:{}},textureFor,reflections);assert.equal(plain.normalMap,null);plain.dispose();
    const fabric=b._thumbnailMaterial({kind:'cloth',roughness:.94,metalness:0,metallicRoughnessTexture:'finish'},result,textureFor,reflections);
    assert.equal(fabric.envMap,null,'a roughness map does not make woven fabric glossy');
    assert.equal(fabric.shininess,12);fabric.dispose();
    const cube = b._thumbnailReflections();
    assert.equal(cube.image.length, 6);
    assert.ok(cube.image.every(face => face.image.width === 16 && face.image.height === 16));
});

test('async shader preparation yields, serializes pictures and rejects obsolete draws before rendering', async () => {
    const THREE = global.THREE, b = builder({ THREE });
    let compiled, renders = 0, current = true;
    const view = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), materials: [],
        canvas: { toDataURL: () => 'data:image/webp;base64,NEW' },
        renderer: { compileAsync() { return new Promise(resolve => { compiled = resolve; }); }, render() { renders++; } } };
    b._thumbView = view; b._ensureThumbView = () => view;
    const prepared = { result: { height: 1, textures: {}, parts: [] }, frame: 'body' };
    const first = b._renderThumb(prepared, () => current);
    const canceled = assert.rejects(first, { name: 'AbortError' });
    await pause(0);
    assert.equal(renders, 0);
    const second = b._renderThumb(prepared);
    const firstCompile = compiled;
    await pause(0);
    assert.equal(compiled, firstCompile, 'the second picture does not enter the shared scene during compilation');
    current = false; firstCompile(); await canceled; await pause(0);
    assert.equal(renders, 0);
    assert.notEqual(compiled, firstCompile);
    compiled(); assert.match(await second, /NEW/);
    assert.equal(renders, 1);
    assert.equal(view.scene.children.length, 0);
    assert.equal(view.pending, null);
});

test('closing during shader preparation waits for compiler polling before disposing its renderer', async () => {
    const THREE = global.THREE, b = builder({ THREE, cancelAnimationFrame() {} });
    let compiled, disposed = 0;
    const view = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), materials: [],
        renderer: { compileAsync() { return new Promise(resolve => { compiled = resolve; }); },
            render() { assert.fail('closed preview rendered'); }, dispose() { disposed++; } } };
    b._thumbView = view; b._ensureThumbView = () => view;
    b._view = { textures: new Map(), renderer: { dispose() {} } };
    b._dropHeldPreview = b._clearModel = () => {};
    const pending = b._renderThumb({ result: { height: 1, parts: [], textures: {} }, frame: 'body' });
    const canceled = assert.rejects(pending, { name: 'AbortError' });
    await pause(0);
    b.detach();
    assert.equal(b._thumbView, null);
    assert.equal(disposed, 0, 'Three must not lose material properties while its compiler polls them');
    compiled(); await canceled; await pause(0);
    assert.equal(disposed, 1);
    assert.equal(view.scene.children.length, 0);
});

test('import-gallery pictures resume after an inactive compilation and stop after the gallery closes', async () => {
    const pictures = new Map(), listeners = new Set(), calls = [];
    const box = { classList: { add() {}, remove() {} }, querySelector(selector) {
        if (selector === '.rr-c3d-import-search') return { focus() {} };
        const index = selector.match(/data-model="(\d+)"/)[1];
        return pictures.has(index) ? null : { replaceWith(image) { pictures.set(index, image.src); } };
    } };
    const b = builder({ require, requestAnimationFrame: callback => setTimeout(callback, 0), rrEscapeHtml: value => value,
        document: { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener), createElement: () => ({}) },
        RRCharacterWardrobe: {}, RRCharacterOutfitTransfer: { IMPORT_PARTS: [], listModels: () => [{ file: 'one', name: 'One' }, { file: 'two', name: 'Two' }] } });
    b.root = { querySelector: () => box }; b._t = value => value;
    let finish;
    b._importModelThumbnail = file => { calls.push(file); return new Promise((resolve, reject) => { finish = { resolve, reject }; }); };
    b._showModels(); await pause(10);
    assert.deepEqual(calls, ['one']);
    b._previewPaused = true;
    const error = new Error('paused'); error.name = 'AbortError'; finish.reject(error);
    await pause(10);
    assert.equal(pictures.size, 0);
    b._resumeImportThumbnails(); await pause(10);
    assert.deepEqual(calls, ['one'], 'an inactive gallery queues no further work');
    b._previewPaused = false;
    b._resumeImportThumbnails(); await pause(10);
    assert.deepEqual(calls, ['one', 'one']);
    finish.resolve('first'); await pause(10);
    assert.equal(pictures.get('0'), 'first');
    assert.equal(calls.at(-1), 'two');
    b._closeOutfitImport(); finish.resolve('late'); await pause(10);
    assert.equal(pictures.has('1'), false);
    assert.equal(b._resumeImportThumbnails, null);
    assert.equal(listeners.size, 0);
});

test('species pictures match the selected gender and survive unrelated body and outfit edits',()=>{
    const Model=require('../src/forge/Character3D/CharacterModel.js'),b=builder({RRCharacterModel:Model});
    b.recipe=Model.normalize({gender:0,weight:1.3,outfit:[{id:'robe'}]});const before=b._thumbSig('species');
    const a=b._thumbRecipe({kind:'species',id:'andorian'}).recipe;assert.equal(a.gender,0);
    b.recipe=Model.normalize({...b.recipe,weight:-.5,outfit:[{id:'shirt'}],skin:'#ffffff'});assert.equal(b._thumbSig('species'),before);
    const same=b._thumbRecipe({kind:'species',id:'andorian'}).recipe;assert.equal(JSON.stringify(same),JSON.stringify(a));
    b.recipe=Model.normalize({...b.recipe,gender:1});assert.notEqual(b._thumbSig('species'),before);assert.equal(b._thumbRecipe({kind:'species',id:'andorian'}).recipe.gender,1);
});
