'use strict';
// Block-compressed model textures: a KTX2 copy written beside each base color picture at import,
// transcoded in a worker for the GPU, capped by dropping mip levels, counted at its own size.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const O = require(path.join(repoRoot, 'editor', 'src', 'utils', 'GlbOptimizer.js'));
const C = require(path.join(repoRoot, 'editor', 'src', 'utils', 'TextureCompressor.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A GLB with one triangle and one material whose base color is a PNG of `size` (sampler: linear, or nearest). */
function glb(size = 64, nearest = false) {
    const png = Buffer.alloc(33);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
    png.writeUInt32BE(13, 8); png.write('IHDR', 12); png.writeUInt32BE(size, 16); png.writeUInt32BE(size, 20); png[24] = 8; png[25] = 6;
    const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
    const bin = Buffer.concat([positions, png, Buffer.alloc((4 - (positions.length + png.length) % 4) % 4)]);
    const json = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length }, { buffer: 0, byteOffset: positions.length, byteLength: png.length }],
        buffers: [{ byteLength: bin.length }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        textures: [{ source: 0, sampler: 0 }], samplers: [nearest ? { magFilter: 9728, minFilter: 9728 } : { magFilter: 9729 }],
        images: [{ bufferView: 1, mimeType: 'image/png' }]
    };
    let text = Buffer.from(JSON.stringify(json));
    text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
    const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
    jh.writeUInt32LE(text.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
    bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004E4942, 4);
    const whole = Buffer.concat([head, jh, text, bh, bin]);
    whole.writeUInt32LE(whole.length, 8);
    return new Uint8Array(whole);
}

/** Real KTX2 bytes: a 64x64 gradient, encoded in process. */
let ktx2Cache = null;
async function ktx2() {
    if (ktx2Cache) return ktx2Cache;
    const w = 64, h = 64, rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = (i % w) * 4; rgba[i * 4 + 1] = Math.floor(i / w) * 4; rgba[i * 4 + 2] = 90; rgba[i * 4 + 3] = 255; }
    const log = console.log; console.log = () => {};
    try { ktx2Cache = await C.encodeRgbaInProcess(rgba, w, h, 0); } finally { console.log = log; }
    return ktx2Cache;
}

/** The runtime's transcoder loop, run in this process against the shipped transcoder, as a worker would. */
function transcoderWorker() {
    global.BASIS = require(path.join(repoRoot, 'runtime', 'libs', 'basis', 'basis_transcoder.js'));
    const worker = { posted: 0 };
    const scope = { postMessage: data => setTimeout(() => worker.onmessage && worker.onmessage({ data }), 0) };
    R._workerParts.ktx2Worker(scope);
    worker.postMessage = data => { worker.posted++; scope.onmessage({ data }); };
    worker.postMessage({ init: true, wasm: fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'basis', 'basis_transcoder.wasm')) });
    return worker;
}

test('import adds a KTX2 copy beside each base color picture; pixel art and odd sizes are left alone', async () => {
    const encoded = [], progress = [];
    const out = await O.compressTextures(glb(64), { encodeImage: async (data, mimeType) => { encoded.push(mimeType); return new Uint8Array([0xAB, 0x4B, 0x54, 0x58, 1, 2, 3, 4]); }, onProgress: (done, total) => progress.push([done, total]) });
    assert.equal(out.compressed, 1);
    assert.deepEqual(encoded, ['image/png']);
    assert.deepEqual(progress, [[0, 1], [1, 1]]);
    const { json, bin } = O.parseGlb(out.bytes);
    assert.deepEqual(json.extensionsUsed, ['KHR_texture_basisu']);
    assert.equal(json.extensionsRequired, undefined, 'another viewer still draws the picture');
    const copy = json.images[json.textures[0].extensions.KHR_texture_basisu.source];
    assert.equal(copy.mimeType, 'image/ktx2');
    const view = json.bufferViews[copy.bufferView];
    assert.deepEqual(Array.from(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)), [0xAB, 0x4B, 0x54, 0x58, 1, 2, 3, 4]);
    assert.equal(json.textures[0].source, 0, 'the picture itself stays as the fallback');
    // Compressing again finds nothing to do; dropping unsampled pictures keeps the copy.
    assert.equal((await O.compressTextures(out.bytes, { encodeImage: async () => new Uint8Array(4) })).compressed, 0);
    const dropped = O.parseGlb(out.bytes).json;
    O.dropUnsampledImages(dropped, new Map(), []);
    assert.equal(dropped.images.length, 2);
    // Kept for the runtime by the GLB worker's packing.
    const parsed = O.parseGlb(out.bytes), buffer = parsed.bin.buffer.slice(parsed.bin.byteOffset, parsed.bin.byteOffset + parsed.bin.byteLength);
    R._workerParts.compactGlb(parsed.json, buffer, 0, buffer.byteLength);
    assert.ok(parsed.json.images[1].rrBlob instanceof Blob);
    // Nearest-sampled (pixel art) and sides not a multiple of four: no copy.
    assert.equal((await O.compressTextures(glb(64, true), { encodeImage: async () => new Uint8Array(8) })).compressed, 0);
    assert.equal((await O.compressTextures(glb(66), { encodeImage: async () => new Uint8Array(8) })).compressed, 0);
});

test('the transcoder worker makes BC7 levels from a real KTX2 file, starting at the level under the cap', async () => {
    const bytes = await ktx2();
    assert.equal(String.fromCharCode(...bytes.subarray(1, 7)), 'KTX 20');
    const worker = transcoderWorker(), answers = [];
    worker.onmessage = event => answers.push(event.data);
    worker.postMessage({ id: 1, bytes, cap: 0, basis: [7, 7] });
    worker.postMessage({ id: 2, bytes: new Blob([bytes]), cap: 16, basis: [7, 7] });
    worker.postMessage({ id: 3, bytes: new Uint8Array([1, 2, 3]), cap: 0, basis: [7, 7] });
    for (let i = 0; i < 100 && answers.length < 3; i++) await sleep(10);
    const [full, capped, bad] = answers.sort((a, b) => a.id - b.id);
    assert.deepEqual(full.mipmaps.map(m => m.width), [64, 32, 16, 8, 4, 2, 1]);
    assert.equal(full.mipmaps[0].data.length, 64 * 64, 'BC7: a byte a texel');
    assert.deepEqual(capped.mipmaps.map(m => m.width), [16, 8, 4, 2, 1], 'the levels over the cap are never transcoded');
    assert.ok(bad.error);
});

test('a model texture waits for its compressed copy, then is a CompressedTexture counted at its own size', async () => {
    const K = R.KTX2, saved = { target: K._target, worker: K.worker, ready: K._ready };
    const worker = transcoderWorker();
    const jobs = new Map();
    worker.onmessage = event => { const job = jobs.get(event.data.id); jobs.delete(event.data.id); event.data.error ? job.reject(new Error(event.data.error)) : job.resolve(event.data); };
    try {
        K._target = 'bc7';
        global.Worker = function() {}; global.fetch = async () => ({});
        K.worker = () => Promise.resolve({ postMessage: data => { jobs.set(data.id, K._jobs.get(data.id)); K._jobs.delete(data.id); worker.postMessage(data); } });
        const compressed = await O.compressTextures(glb(64), { encodeImage: async () => ktx2() });
        const { json, bin } = O.parseGlb(compressed.bytes), textures = [];
        const texture = R._loadGlbTexture(json, bin, { index: 0 }, '', textures);
        assert.equal(texture.userData.rrPending, true);
        const W = R.ShaderWarmup, renderer = { properties: { get: () => ({}) }, initTexture() {} };
        assert.equal(W.picturesReady(renderer, { map: texture }), false, 'what wears it is held until it is made');
        for (let i = 0; i < 100 && texture.userData.rrPending; i++) await sleep(10);
        assert.equal(texture.isCompressedTexture, true);
        assert.ok(texture instanceof THREE.CompressedTexture);
        assert.equal(texture.format, THREE.RGBA_BPTC_Format);
        assert.equal(texture.generateMipmaps, false);
        assert.equal(texture.image.width, 64);
        assert.equal(R.KTX2.bytes(texture), 64 * 64 + 32 * 32 + 16 * 16 + 8 * 8 + 16 * 3, 'its levels, not four bytes a texel');
        // The upload budget counts the same bytes.
        const props = new Map(), uploads = [];
        const counting = { properties: { get: t => props.get(t) || (props.set(t, {}), props.get(t)) }, initTexture(t) { uploads.push(t); const p = this.properties.get(t); p.__webglInit = true; p.__version = t.version; } };
        const queue = W.queueOf(counting), budget = W.UPLOAD_BYTES_PER_FRAME;
        W.UPLOAD_BYTES_PER_FRAME = 6000;
        const other = texture.clone(); other.needsUpdate = true;
        queue.list.push(texture, other); W.pump(counting);
        assert.equal(uploads.length, 2, 'two compressed sheets of 5.5 KB fit 6 KB with a texture over');
        W.UPLOAD_BYTES_PER_FRAME = budget;
        // A model cache entry counts compressed bytes.
        const template = new THREE.Group(); template.userData.glbTextures = [texture];
        assert.equal(R.ModelUse.bytesOf('k', { template }), R.KTX2.bytes(texture));
        // Nearest-sampled pictures and a switched-off loader take the file's picture.
        assert.equal(K.allowed({ samplers: [{ magFilter: 9728 }] }, { sampler: 0 }), false);
        K.enabled = false;
        assert.equal(K.fromGlb(json, bin, json.textures[0], json.images[0], []), null);
        K.enabled = true;
    } finally {
        K._target = saved.target; K.worker = saved.worker; K._ready = saved.ready; delete global.Worker; delete global.fetch;
    }
});

test('the editor encoder runs as a classic worker script made from the shipped encoder module', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'editor', 'libs', 'basis', 'basis_encoder.js'), 'utf8');
    const classic = C.classicSource(source);
    assert.doesNotMatch(classic, /export\s+default|import\.meta/);
    assert.match(classic, /self\.BASIS = BASIS;/);
    assert.ok(fs.existsSync(path.join(repoRoot, 'runtime', 'libs', 'basis', 'basis_transcoder.wasm')));
    // Import and the 3D database's Optimize offer it as one option of the same dialog (off unless ticked).
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    assert.doesNotMatch(editor, /r3d-compress|compressSelectedModelTextures/, 'no second way in beside Optimize');
    assert.match(editor, /\? \{ compress: false \} : null;/);
    const ui = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'UIManager.js'), 'utf8');
    assert.match(ui, /compressBox\.checked = !!compression\.compress;/);
    const resources = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'ResourceManager.js'), 'utf8');
    assert.match(resources, /const compression = \{ compress: false \};/);
});

/** The 3D database's Optimize on a model file in a temp folder, the dialog answered with `mode` and the box `ticked`. */
async function optimizeInDatabase(t, mode, ticked) {
    const vm = require('node:vm'), os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-optimize-compress-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const model = path.join(dir, 'model.glb');
    fs.writeFileSync(model, Buffer.from('original'));
    const calls = { optimize: [], compress: [], released: 0, offered: null };
    const window = {
        RRGlbOptimizer: {
            analyze: () => ({ bytes: 8 }), PRESETS: { optimize: {} }, canvasEncoder: () => null,
            optimize: async bytes => { calls.optimize.push(Buffer.from(bytes).toString()); return { bytes: new Uint8Array(Buffer.from('reduced')) }; },
            compressTextures: async (bytes, options) => {
                calls.compress.push(Buffer.from(bytes).toString());
                options.onProgress(0, 1);
                return { bytes: new Uint8Array(Buffer.from(Buffer.from(bytes).toString() + '+ktx2')), compressed: 1 };
            }
        },
        RRTextureCompressor: { encode: async () => new Uint8Array(4), release: () => { calls.released++; } }
    };
    const source = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    const Editor = vm.runInNewContext(`${source}\nDatabase3DEditor;`, { window, require, console, process, Buffer, Uint8Array });
    const editor = Object.create(Editor.prototype);
    const status = { textContent: '' };
    Object.assign(editor, {
        selectedName: 'model', listModels: () => [{ name: 'model', ext: '.glb' }], sourcePath: () => model,
        rulesPath: () => path.join(dir, 'model.json'),
        _t: (text, params = {}) => Object.entries(params).reduce((value, [key, to]) => value.split(`{${key}}`).join(String(to)), text),
        _detail: { querySelector: selector => selector === '.r3d-status' ? status : null }, _templates: {},
        _releaseTemplate() {}, selectModel: async () => {},
        projectController: { uiManager: { showModelOptimizeDialog: async options => {
            calls.offered = !!options.compression && options.compression.compress === false;
            if (options.compression) options.compression.compress = ticked;
            return mode;
        } } }
    });
    await editor.optimizeSelectedModel();
    return { calls, status: status.textContent, file: fs.readFileSync(model, 'utf8'), backup: fs.existsSync(model + '.orig') ? fs.readFileSync(model + '.orig', 'utf8') : null };
}

test('Optimize in the 3D database offers texture compression, unticked, and runs it on what the reduction left', async t => {
    const both = await optimizeInDatabase(t, 'optimize', true);
    assert.equal(both.calls.offered, true, 'offered, off by default');
    assert.deepEqual(both.calls.optimize, ['original']);
    assert.deepEqual(both.calls.compress, ['reduced'], 'compressed after the reduction');
    assert.equal(both.calls.released, 1, 'the encoder is let go');
    assert.equal(both.file, 'reduced+ktx2');
    assert.equal(both.backup, 'original');
    assert.match(both.status, /\+ 1 compressed texture/);

    const alone = await optimizeInDatabase(t, 'keep', true);
    assert.deepEqual(alone.calls.optimize, [], 'Do not reduce leaves the mesh alone');
    assert.deepEqual(alone.calls.compress, ['original']);
    assert.equal(alone.file, 'original+ktx2');
    assert.match(alone.status, /Compressed 1 texture\(s\) of model/);

    const reduceOnly = await optimizeInDatabase(t, 'optimize', false);
    assert.deepEqual(reduceOnly.calls.compress, [], 'unticked, as before');
    assert.equal(reduceOnly.file, 'reduced');

    const nothing = await optimizeInDatabase(t, 'keep', false);
    assert.deepEqual([nothing.calls.optimize, nothing.calls.compress, nothing.file, nothing.backup], [[], [], 'original', null], 'declining changes nothing');
});
