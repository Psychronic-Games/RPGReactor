'use strict';
// What a model costs to load and keep: textures at the weak tier's size, only the bytes of its file it
// reads, its finger skin worked out off the main thread, and big pictures sent in bands of rows.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const O = require(path.join(repoRoot, 'editor', 'src', 'utils', 'GlbOptimizer.js'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A worker that runs a Blob's source in this process, its messages structured-cloned both ways. */
function installFakeWorkers() {
    const sources = new Map(), made = [];
    const RealBlob = global.Blob, realCreate = URL.createObjectURL, realRevoke = URL.revokeObjectURL;
    global.Blob = class extends RealBlob { constructor(parts, options) { super(parts, options); this.__source = parts.map(p => (typeof p === 'string' ? p : '')).join(''); } };
    URL.createObjectURL = blob => { const url = 'blob:fake/' + sources.size; sources.set(url, blob.__source); return url; };
    URL.revokeObjectURL = () => {};
    global.Worker = class {
        constructor(url) {
            made.push(this);
            this.scope = { postMessage: (data, transfer) => setTimeout(() => this.onmessage && this.onmessage({ data: structuredClone(data, { transfer }) }), 0) };
            new Function('self', sources.get(url))(this.scope);
        }
        postMessage(data, transfer) { const copy = structuredClone(data, { transfer }); setTimeout(() => this.scope.onmessage({ data: copy }), 0); }
        terminate() { this.terminated = true; }
    };
    return { made, restore() { global.Blob = RealBlob; URL.createObjectURL = realCreate; URL.revokeObjectURL = realRevoke; delete global.Worker; } };
}

/** A GLB: one triangle (positions, indices), a base color picture, a normal map, a picture nothing names. */
function glbWithPictures(textured = true, normalCoord = 0) {
    const parts = [], views = [];
    let offset = 0;
    const add = (bytes, pad) => {
        // `pad` bytes first, so views do not all start on a 16-byte line.
        if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
        views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength });
        parts.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); offset += bytes.byteLength;
        return views.length - 1;
    };
    const positions = add(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 0);
    const normalMap = add(new Uint8Array(4000).fill(7), 4);
    const indices = add(new Uint16Array([0, 1, 2, 0]), 8);
    const base = add(new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6, 7, 8]), 2);
    const unused = add(new Uint8Array(3000).fill(9), 2);
    const json = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
        accessors: [
            { bufferView: positions, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: indices, componentType: 5123, count: 3, type: 'SCALAR' }
        ],
        materials: [textured ? { pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 1 } }, normalTexture: normalCoord ? { index: 1, texCoord: normalCoord } : { index: 1 }, emissiveTexture: { index: 0 }, emissiveFactor: [1, 1, 1] } : {}],
        textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 1 }],
        samplers: [{ magFilter: 9729 }, { magFilter: 9728 }],
        images: [{ bufferView: base, mimeType: 'image/png' }, { bufferView: normalMap, mimeType: 'image/png' }, { bufferView: unused, mimeType: 'image/png' }],
        buffers: [{ byteLength: offset }], bufferViews: views
    };
    let bin = Buffer.concat(parts);
    bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
    let text = Buffer.from(JSON.stringify(json));
    text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
    const head = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
    jsonHead.writeUInt32LE(text.length, 0); jsonHead.writeUInt32LE(0x4E4F534A, 4);
    binHead.writeUInt32LE(bin.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
    const whole = Buffer.concat([head, jsonHead, text, binHead, bin]);
    whole.writeUInt32LE(whole.length, 8);
    const buffer = new ArrayBuffer(whole.length);
    new Uint8Array(buffer).set(whole);
    return buffer;
}

test('a weak GPU keeps model textures at 1024, decoded at that size; a full one keeps 2048, and the switch keeps the usual cap', async () => {
    const override = R.gpuTierOverride, tier = R.memoryTier, weak = R.weakTextureSize;
    try {
        R.memoryTier = 'normal';
        R.gpuTierOverride = 'full'; assert.equal(R.textureCap(), 2048);
        R.gpuTierOverride = 'weak'; assert.equal(R.textureCap(), 1024);
        R.weakTextureSize = 0; assert.equal(R.textureCap(), 2048, 'off: the usual cap');
        R.weakTextureSize = 4096; assert.equal(R.textureCap(), 2048, 'never above the usual cap');
        R.weakTextureSize = 1024; R.memoryTier = 'low'; R.lowMemoryTextureSize = 512;
        assert.equal(R.textureCap(), 512, 'the smaller of the two caps');
        R.lowMemoryTextureSize = 1024; R.memoryTier = 'normal';
        // The decode asks for the smaller bitmap, off the main thread.
        const W = R.ShaderWarmup, asked = [];
        global.createImageBitmap = (source, options) => { asked.push(options); return Promise.resolve({ width: options.resizeWidth || source.naturalWidth, height: options.resizeHeight || source.naturalHeight, close() {} }); };
        const enabled = R.ImageWorker.enabled; R.ImageWorker.enabled = false; delete R.ImageWorker._worker;
        const renderer = { properties: { get: () => ({}) }, initTexture() {} };
        const sheet = new THREE.Texture({ tagName: 'IMG', complete: true, naturalWidth: 2048, naturalHeight: 2048, src: 'a.png' });
        sheet.userData.rrModelTexture = true; sheet.needsUpdate = true;
        W.request(renderer, sheet); await sleep(5);
        assert.deepEqual([asked[0].resizeWidth, asked[0].resizeHeight], [1024, 1024]);
        R.ImageWorker.enabled = enabled;
    } finally {
        R.gpuTierOverride = override; R.memoryTier = tier; R.weakTextureSize = weak; R.lowMemoryTextureSize = 1024;
        delete global.createImageBitmap; delete R.ImageWorker._worker;
    }
});

test('a model keeps only the bytes it reads: its accessors packed and aligned, its base color picture, nothing else', () => {
    const buffer = glbWithPictures();
    const split = R._workerParts.splitGlb(buffer);
    const before = JSON.parse(JSON.stringify(split.json));
    const packed = R._workerParts.compactGlb(split.json, buffer, split.bin.offset, split.bin.length);
    const source = new Uint8Array(buffer, split.bin.offset, split.bin.length), out = new Uint8Array(packed);
    for (const accessor of split.json.accessors) {
        const was = before.bufferViews[accessor.bufferView], now = split.json.bufferViews[accessor.bufferView];
        assert.equal(now.byteOffset % 16, was.byteOffset % 16, 'each view keeps its alignment');
        assert.deepEqual(Array.from(out.subarray(now.byteOffset, now.byteOffset + now.byteLength)), Array.from(source.subarray(was.byteOffset, was.byteOffset + was.byteLength)));
    }
    assert.ok(packed.byteLength < 64, 'the pictures are not in the packed bytes (' + packed.byteLength + ')');
    assert.ok(split.json.images[0].rrBlob instanceof Blob, 'the base color picture is a Blob of its own');
    assert.equal(split.json.images[0].rrBlob.size, 12);
    assert.equal(split.json.images[1].rrBlob, undefined, 'a normal map is left behind');
    assert.equal(split.json.images[2].rrBlob, undefined, 'and a picture nothing names');
});

test('every material that names a packed picture gets its bytes, not only the first', async () => {
    const buffer = glbWithPictures();
    const split = R._workerParts.splitGlb(buffer);
    const picture = Array.from(new Uint8Array(buffer, split.bin.offset + split.json.bufferViews[split.json.images[0].bufferView].byteOffset, 12));
    // Hair and brows drawn from one sheet, as the 3D Character Builder writes them.
    split.json.materials.push({ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } });
    const packed = new Uint8Array(R._workerParts.compactGlb(split.json, buffer, split.bin.offset, split.bin.length));
    for (const use of ['first', 'second']) {
        const blob = R._glbImageBlob(split.json, packed, split.json.images[0]);
        assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer())), picture, `the ${use} texture reads the picture`);
    }
});

test('the GLB worker sends back the packed bytes when asked, and the model built from them matches one built from the file', async () => {
    const source = R._glbWorkerSource();
    const posted = [];
    const scope = { postMessage: (message, transfers) => posted.push({ message, transfers }) };
    new Function('self', source)(scope);
    const buffer = glbWithPictures(), copy = buffer.slice(0);
    scope.onmessage({ data: { id: 1, buffer, compact: true } });
    await sleep(5);
    const { message, transfers } = posted[0];
    assert.equal(message.binOffset, 0);
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0], message.buffer);
    assert.ok(message.buffer.byteLength < 64);
    // Built both ways (no pictures loaded here): the same geometry, and its arrays over the packed bytes only.
    for (const m of message.json.materials) delete m.pbrMetallicRoughness.baseColorTexture;
    const packed = R.buildGlbTemplate(message.json, new Uint8Array(message.buffer), '');
    const enabled = R.GlbCompact.enabled;
    R.GlbCompact.enabled = false;
    const parsed = R.readGlb(copy);
    for (const m of parsed.json.materials) delete m.pbrMetallicRoughness.baseColorTexture;
    const whole = R.buildGlbTemplate(parsed.json, parsed.bin, '');
    R.GlbCompact.enabled = enabled;
    const geometryOf = root => { let g = null; root.traverse(o => { if (o.isMesh) g = o.geometry; }); return g; };
    const a = geometryOf(packed), b = geometryOf(whole);
    assert.deepEqual(Array.from(a.getAttribute('position').array), Array.from(b.getAttribute('position').array));
    assert.deepEqual(Array.from(a.index.array), Array.from(b.index.array));
    // What a model keeps of its file is what its accessors view (an animated model keeps them as they are).
    assert.equal(R._glbAccessor(message.json, new Uint8Array(message.buffer), 0).buffer, message.buffer, 'the packed bytes, not the file');
    assert.equal(R._glbAccessor(parsed.json, parsed.bin, 0).buffer, copy, 'off: the whole file');
    // The synchronous reader packs too.
    let packedBin = null;
    const build = R.buildGlbTemplate;
    R.buildGlbTemplate = function(json, bin) { packedBin = bin; return build.apply(this, arguments); };
    try { R.readModel(glbWithPictures(false), '.glb', ''); } finally { R.buildGlbTemplate = build; }
    assert.ok(packedBin.buffer.byteLength < 64);
});

test('an embedded picture is decoded by the image worker from its own bytes once its object URL is given back', async () => {
    const IW = R.ImageWorker, posted = [];
    const worker = { postMessage: data => posted.push(data) };
    const saved = IW._worker;
    IW._worker = worker;
    try {
        const image = { tagName: 'IMG', src: 'blob:gone' }, blob = new Blob([new Uint8Array([1, 2, 3])]);
        IW.blobs.set(image, blob);
        IW.request('bitmap', image, { resizeWidth: 4 });
        assert.equal(posted[0].blob, blob, 'the bytes go to the worker');
        assert.equal(posted[0].url, null, 'not the revoked URL');
        assert.equal(IW.blobs.has(image), false, 'and are let go with the request');
        // A picture with no remembered bytes is fetched by its URL as before.
        global.document = { baseURI: 'file:///game/' };
        IW.request('bitmap', { tagName: 'IMG', src: 'img/a.png' }, null);
        assert.equal(posted[1].url, 'file:///game/img/a.png');
        assert.equal(posted[1].blob, undefined);
    } finally { IW._worker = saved; IW._jobs.clear(); delete global.document; }
});

/** A renderer with a GL context that records texture uploads, enough of three's texture path for the warmup. */
function bandRenderer() {
    const props = new Map(), calls = [];
    const get = t => { let p = props.get(t); if (!p) props.set(t, p = {}); return p; };
    const gl = {
        TEXTURE_2D: 3553, UNPACK_SKIP_ROWS: 3315, RGBA: 6408, UNSIGNED_BYTE: 5121,
        pixelStorei: (name, value) => calls.push(['pixelStorei', name, value]),
        texSubImage2D: (target, level, x, y, w, h) => calls.push(['texSubImage2D', y, h]),
        generateMipmap: () => calls.push(['generateMipmap'])
    };
    let serial = 0;
    return {
        calls, gl,
        capabilities: { isWebGL2: true, maxTextureSize: 16384 },
        properties: { get },
        getContext: () => gl,
        state: { bindTexture: (type, texture) => calls.push(['bind', texture]) },
        initTexture(texture) {
            const p = get(texture), s = get(texture.source);
            if (!p.__webglInit) { p.__webglInit = true; p.__webglTexture = s.__webglTexture || (s.__webglTexture = { id: ++serial }); }
            if (s.__version !== texture.source.version) { calls.push([texture.source.dataReady ? 'upload' : 'allocate', texture.image.width]); s.__version = texture.source.version; }
            p.__version = texture.version;
        }
    };
}

test('a picture over the frame\'s budget goes up in bands of rows, and is not drawn until the last has gone', () => {
    const W = R.ShaderWarmup;
    global.ImageBitmap = class { constructor(w, h) { this.width = w; this.height = h; } close() {} };
    const budget = W.UPLOAD_BYTES_PER_FRAME;
    try {
        W.UPLOAD_BYTES_PER_FRAME = 1024 * 1024;
        const renderer = bandRenderer(), queue = W.queueOf(renderer);
        const texture = new THREE.Texture(new ImageBitmap(1024, 1024)); texture.needsUpdate = true;
        const wall = new THREE.Texture(); wall.source = texture.source; wall.needsUpdate = true;
        queue.list.push(texture);
        W.pump(renderer);
        assert.deepEqual(renderer.calls[0], ['allocate', 1024], 'storage first, nothing sent with it');
        assert.equal(texture.source.dataReady, true, 'three sends whole again from then on');
        const bands = () => renderer.calls.filter(c => c[0] === 'texSubImage2D');
        assert.deepEqual(bands(), [['texSubImage2D', 0, 256]], 'a megabyte of rows this frame');
        assert.equal(W.uploaded(renderer, texture), false);
        // A texture of the same picture waits with it.
        queue.list.push(wall); W.pump(renderer);
        assert.equal(W.uploaded(renderer, wall), false);
        W.pump(renderer); W.pump(renderer);
        assert.deepEqual(bands().map(c => c[1]), [0, 256, 512, 768]);
        assert.equal(W.uploaded(renderer, texture), true, 'all its rows gone: drawn');
        assert.equal(renderer.calls.filter(c => c[0] === 'generateMipmap').length, 1, 'its mip levels made once, after the last band');
        assert.ok(renderer.calls.filter(c => c[0] === 'pixelStorei').every((c, i, all) => i % 2 === 1 ? c[2] === 0 : true), 'the skip is set back after each band');
        assert.equal(renderer.calls.filter(c => c[0] === 'upload').length, 0, 'never sent whole');
        // Off: one picture a frame, whole.
        W.bands = false;
        const other = new THREE.Texture(new ImageBitmap(1024, 1024)); other.needsUpdate = true;
        queue.list.push(other); W.pump(renderer);
        assert.deepEqual(renderer.calls[renderer.calls.length - 1], ['upload', 1024]);
        W.bands = true;
        // A picture under the budget goes whole, and pictures that are not decoded bitmaps always do.
        const small = new THREE.Texture(new ImageBitmap(256, 256)); small.needsUpdate = true;
        const canvas = new THREE.Texture({ width: 2048, height: 2048 }); canvas.needsUpdate = true;
        queue.list.push(small, canvas); W.pump(renderer);
        assert.deepEqual(renderer.calls.slice(-2), [['upload', 256], ['upload', 2048]]);
    } finally { W.UPLOAD_BYTES_PER_FRAME = budget; W.bands = true; delete global.ImageBitmap; }
});

test('a picture changed while it goes up in bands is sent whole instead; a weak GPU takes a smaller budget', () => {
    const W = R.ShaderWarmup, override = R.gpuTierOverride;
    global.ImageBitmap = class { constructor(w, h) { this.width = w; this.height = h; } close() {} };
    try {
        R.gpuTierOverride = 'weak';
        assert.equal(W.uploadBudget(), W.WEAK_UPLOAD_BYTES_PER_FRAME);
        const weakBudget = W.WEAK_UPLOAD_BYTES_PER_FRAME; W.WEAK_UPLOAD_BYTES_PER_FRAME = 0;
        assert.equal(W.uploadBudget(), W.UPLOAD_BYTES_PER_FRAME, '0: the usual budget');
        W.WEAK_UPLOAD_BYTES_PER_FRAME = weakBudget;
        R.gpuTierOverride = 'full';
        assert.equal(W.uploadBudget(), W.UPLOAD_BYTES_PER_FRAME);
        const renderer = bandRenderer(), queue = W.queueOf(renderer);
        const texture = new THREE.Texture(new ImageBitmap(4096, 4096)); texture.needsUpdate = true;
        queue.list.push(texture); W.pump(renderer);
        assert.equal(W.uploaded(renderer, texture), false);
        texture.image = new ImageBitmap(4096, 4096); texture.needsUpdate = true;
        W.pump(renderer);
        assert.equal(queue.bands.length, 0, 'the bands stop');
        assert.equal(W.uploaded(renderer, texture), false, 'and three sends the new picture when it is next drawn');
    } finally { R.gpuTierOverride = override; delete global.ImageBitmap; }
});

/** A rig with two right-hand finger markers over a strip mesh that hangs from the wrist. */
function fingerModel() {
    const positions = [], index = [];
    for (let r = 0; r <= 12; r++) for (const x of [-0.005, 0.005]) for (const z of [-0.03, 0.03]) positions.push(-0.4 + x, 1 - r * 0.015, z);
    for (let r = 0; r < 12; r++) { const a = r * 4; index.push(a, a + 1, a + 4, a + 1, a + 5, a + 4, a + 2, a + 3, a + 6, a + 3, a + 7, a + 6); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(index);
    const root = new THREE.Group(), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    root.add(mesh);
    const count = positions.length / 3, indices = new Uint8Array(count * 4), weights = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = 1; weights[i * 4] = 255; }
    const rig = { template: 'humanoid', markers: { wristR: [-0.4, 1, 0], palmR: [-0.4, 0.95, 0], indexBaseR: [-0.4, 0.9, 0.03], indexTipR: [-0.4, 0.82, 0.03], middleBaseR: [-0.4, 0.9, -0.03], middleTipR: [-0.4, 0.82, -0.03] },
        bones: [{ name: 'RightLowerArm', parent: -1, head: [-0.4, 1.3, 0], tail: [-0.4, 1, 0] }, { name: 'RightHand', parent: 0, head: [-0.4, 1, 0], tail: [-0.4, 0.84, 0] }],
        weights: { 0: { count, indices, weights } } };
    return { root, rig };
}
const skinOf = root => { let out = null; root.traverse(o => { if (o.isSkinnedMesh) out = [Array.from(o.geometry.getAttribute('skinIndex').array), Array.from(o.geometry.getAttribute('skinWeight').array)]; }); return out; };

test('the finger skin is worked out in a worker, the same skin the main thread makes; the mesh wears its own until then', async () => {
    const F = R.FingerSkin;
    F.worker = false; delete F._worker;
    const here = fingerModel();
    R.applyModelRig(here.root, here.rig);
    const expected = skinOf(here.root);
    assert.ok(expected[0].some(v => v > 1), 'the fingers took a share of the hand\'s skin');
    const fake = installFakeWorkers();
    try {
        F.worker = true; delete F._worker;
        const model = fingerModel();
        R.applyModelRig(model.root, model.rig);
        assert.ok(skinOf(model.root)[0].every(v => v <= 1), 'until the worker answers: the hand\'s own skin');
        assert.equal(fake.made.length, 1);
        await sleep(20);
        assert.deepEqual(skinOf(model.root), expected, 'then the skin the main thread would have made');
        // A second copy of the same rig takes the worked-out skin with no new job.
        const twin = fingerModel(); twin.rig.weights[0] = model.rig.weights[0];
        const jobs = F._serial;
        R.applyModelRig(twin.root, twin.rig);
        assert.equal(F._serial, jobs, 'no new job');
        assert.deepEqual(skinOf(twin.root), expected);
        // The worker's source names nothing it cannot reach.
        assert.doesNotMatch(F.source(), /Reactor3D|THREE/);
        // A worker that fails hands its work back to the main thread.
        delete F._worker;
        const third = fingerModel();
        R.applyModelRig(third.root, third.rig);
        fake.made[fake.made.length - 1].onerror({});
        assert.deepEqual(skinOf(third.root), expected, 'worked out here at once');
        assert.equal(F.worker, false, 'and later skins too');
    } finally { fake.restore(); F.worker = true; delete F._worker; }
});

test('the import optimizer drops the pictures the game never samples and keeps the base color byte for byte', async () => {
    const bytes = new Uint8Array(glbWithPictures());
    const out = await O.optimize(bytes, { dropUnsampledImages: true });
    const { json, bin } = O.parseGlb(out.bytes);
    // The normal map beside the base color is drawn (Reactor3D.MODEL_FACING): it stays.
    assert.equal(json.images.length, 2);
    assert.equal(json.textures.length, 2);
    assert.deepEqual(json.samplers[0], { magFilter: 9729 }, 'the base color keeps its own sampler');
    const material = json.materials[0];
    assert.deepEqual(material.normalTexture, { index: 1 });
    assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
    assert.deepEqual(material.emissiveTexture, { index: 0 }, 'a glow map beside the picture is drawn too (Reactor3D.injectSurfaceGlow)');
    assert.deepEqual(material.emissiveFactor, [1, 1, 1]);
    assert.equal(json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source, 0);
    const view = json.bufferViews[json.images[0].bufferView];
    assert.deepEqual(Array.from(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)), [137, 80, 78, 71, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(out.bytes.length < bytes.length - 2900, 'the unnamed picture is gone');
    // A normal map on other coordinates than the picture's is not drawn, and goes.
    const second = await O.optimize(new Uint8Array(glbWithPictures(true, 1)), { dropUnsampledImages: true });
    assert.equal(O.parseGlb(second.bytes).json.materials[0].normalTexture, undefined);
    assert.equal(O.parseGlb(second.bytes).json.images.length, 1);
});

test('the editor resamples a model sheet over the cap in the image worker, not on its main thread; its other pictures stay as they are', async () => {
    const W = R.ShaderWarmup, override = R.gpuTierOverride, asked = [];
    global.window.reactor = { projectController: {} };
    global.document = { createElement() { throw new Error('no canvas resample on the main thread'); } };
    global.createImageBitmap = (source, options) => { asked.push(options); return Promise.resolve({ width: options.resizeWidth || source.naturalWidth, height: options.resizeHeight || source.naturalHeight, close() {} }); };
    const enabled = R.ImageWorker.enabled; R.ImageWorker.enabled = false; delete R.ImageWorker._worker;
    try {
        R.gpuTierOverride = 'weak';
        assert.equal(W.inEditor(), true);
        const img = () => ({ tagName: 'IMG', complete: true, naturalWidth: 2048, naturalHeight: 2048, src: 'a.png', decode: () => Promise.resolve() });
        const sheet = img();
        assert.equal(R.capImage(sheet), sheet, 'capImage leaves it to the decode');
        const renderer = { properties: { get: () => ({}) }, initTexture() {} };
        const model = new THREE.Texture(sheet); model.userData.rrModelTexture = true; model.needsUpdate = true;
        W.request(renderer, model); await sleep(5);
        assert.deepEqual([asked[0].resizeWidth, asked[0].resizeHeight], [1024, 1024]);
        assert.equal(model.image.width, 1024);
        const painted = new THREE.Texture(img()); painted.needsUpdate = true;
        W.request(renderer, painted); await sleep(5);
        assert.equal(asked.length, 1, 'a picture that is not a model sheet is not decoded here');
        // Off: the editor draws the sheet smaller on a canvas, as before.
        W.editorResample = false;
        assert.equal(W.resamplesModelSheets(), false);
        W.editorResample = true;
    } finally {
        R.gpuTierOverride = override; delete global.window.reactor; delete global.document; delete global.createImageBitmap;
        R.ImageWorker.enabled = enabled; delete R.ImageWorker._worker;
    }
});

test('the Demo clean-up script drops only the pictures nothing samples, and checks every other byte', () => {
    const D = require(path.join(repoRoot, 'editor', 'build-scripts', 'drop-unsampled-images.cjs'));
    const before = new Uint8Array(glbWithPictures());
    const result = D.dropUnsampled(before);
    assert.equal(result.images, 2, 'the normal map and the picture nothing names');
    assert.deepEqual(D.verify(before, result.bytes), []);
    const { json } = D.readGlb(result.bytes);
    assert.equal(json.images.length, 1);
    const material = json.materials[0];
    assert.equal(material.normalTexture, undefined);
    assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
    assert.deepEqual(material.emissiveTexture, { index: 0 }, 'a slot whose picture stays is left alone');
    assert.deepEqual(material.emissiveFactor, [1, 1, 1]);
    assert.ok(result.bytes.length < before.length - 6900);
    assert.equal(D.dropUnsampled(result.bytes), null, 'nothing left to drop');
    // A changed accessor or base color picture fails the check.
    const broken = new Uint8Array(result.bytes); broken[broken.length - 40] ^= 0xff;
    assert.notDeepEqual(D.verify(before, broken), []);
});
