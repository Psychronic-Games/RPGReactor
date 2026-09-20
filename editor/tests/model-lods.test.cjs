/**
 * Distance levels.
 *
 * A heavy model far from the camera covers a few pixels and still costs
 * every triangle. The import optimizer writes geometry-only copies at
 * coarser weld grids beside the source, the sidecar lists them, and each
 * placed instance swaps its meshes' geometry by distance.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const Optimizer = require(path.join(editorRoot, 'src', 'utils', 'GlbOptimizer.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** A GLB of one textured mesh: a dense grid of quads, with a material and an embedded image. */
function gridGlb(size) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            positions.push(x / size, 0, y / size);
            normals.push(0, 1, 0);
            uvs.push(x / size, y / size);
        }
    }
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const a = y * (size + 1) + x, b = a + 1, c = a + size + 1, d = c + 1;
            indices.push(a, b, c, b, d, c);
        }
    }
    const image = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0]);
    const chunks = [
        new Uint8Array(Float32Array.from(positions).buffer),
        new Uint8Array(Float32Array.from(normals).buffer),
        new Uint8Array(Float32Array.from(uvs).buffer),
        new Uint8Array(Uint32Array.from(indices).buffer),
        image
    ];
    const bufferViews = [];
    let offset = 0;
    const parts = [];
    for (const chunk of chunks) {
        const pad = (4 - (offset % 4)) % 4;
        if (pad) { parts.push(new Uint8Array(pad)); offset += pad; }
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: chunk.length });
        parts.push(chunk);
        offset += chunk.length;
    }
    const vertexCount = (size + 1) * (size + 1);
    const json = {
        asset: { version: '2.0' },
        scene: 0, scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0, name: 'grid' }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        textures: [{ source: 0 }],
        images: [{ mimeType: 'image/png', bufferView: 4 }],
        accessors: [
            { bufferView: 0, componentType: 5126, count: vertexCount, type: 'VEC3', min: [0, 0, 0], max: [1, 0, 1] },
            { bufferView: 1, componentType: 5126, count: vertexCount, type: 'VEC3' },
            { bufferView: 2, componentType: 5126, count: vertexCount, type: 'VEC2' },
            { bufferView: 3, componentType: 5125, count: indices.length, type: 'SCALAR' }
        ],
        bufferViews,
        buffers: [{ byteLength: offset }]
    };
    let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    if (jsonPad) { const padded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20); padded.set(jsonBytes); jsonBytes = padded; }
    const binPad = (4 - (offset % 4)) % 4;
    if (binPad) { parts.push(new Uint8Array(binPad)); offset += binPad; }
    const total = 28 + jsonBytes.length + offset;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x46546C67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
    view.setUint32(12, jsonBytes.length, true); view.setUint32(16, 0x4E4F534A, true);
    out.set(jsonBytes, 20);
    view.setUint32(20 + jsonBytes.length, offset, true); view.setUint32(24 + jsonBytes.length, 0x004E4942, true);
    let cursor = 28 + jsonBytes.length;
    for (const part of parts) { out.set(part, cursor); cursor += part.length; }
    return { bytes: out, triangles: indices.length / 3 };
}

test('lods() writes geometry-only levels with the same structure and far fewer triangles', async () => {
    const { bytes, triangles } = gridGlb(120);
    assert.equal(triangles, 28800);
    const levels = await Optimizer.lods(bytes, { levels: [{ suffix: 'lod1', meshCells: 40 }, { suffix: 'lod2', meshCells: 12 }] });
    assert.equal(levels.length, 2);
    let previous = triangles;
    for (const level of levels) {
        const parsed = Optimizer.parseGlb(level.bytes);
        assert.ok(parsed, level.suffix + ' is a GLB');
        assert.equal(parsed.json.meshes.length, 1);
        assert.equal(parsed.json.nodes.length, 1, 'the node hierarchy is kept');
        assert.equal(parsed.json.meshes[0].primitives.length, 1);
        assert.equal(parsed.json.meshes[0].primitives[0].material, undefined, 'no material of its own');
        assert.equal(parsed.json.images, undefined, 'no images');
        assert.equal(parsed.json.materials, undefined);
        assert.ok(level.triangles < previous * 0.7, `${level.suffix} is well under the level above (${level.triangles} vs ${previous})`);
        assert.ok(level.bytes.length < bytes.length / 2, 'and much smaller on disk');
        assert.equal(parsed.json.accessors[parsed.json.meshes[0].primitives[0].indices].count / 3, level.triangles);
        previous = level.triangles;
    }
    // Under the floor: nothing.
    assert.deepEqual(await Optimizer.lods(gridGlb(20).bytes), []);
    assert.deepEqual(await Optimizer.lods(new Uint8Array([1, 2, 3])), []);
});

test('optimize reorders triangle lists for the vertex cache in every preset', async () => {
    assert.equal(Optimizer.PRESETS.optimize.cacheOrder, true);
    assert.equal(Optimizer.PRESETS.aggressive.cacheOrder, true);
    // A grid emitted in row order already has a fine miss ratio; shuffle it.
    const { bytes } = gridGlb(60);
    const parsed = Optimizer.parseGlb(bytes);
    const prim = parsed.json.meshes[0].primitives[0];
    const idxAccessor = parsed.json.accessors[prim.indices];
    const view = parsed.json.bufferViews[idxAccessor.bufferView];
    const idx = new Uint32Array(parsed.bin.buffer, parsed.bin.byteOffset + view.byteOffset, idxAccessor.count);
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let t = idx.length / 3 - 1; t > 0; t--) {
        const j = Math.floor(random() * (t + 1));
        for (let k = 0; k < 3; k++) { const tmp = idx[t * 3 + k]; idx[t * 3 + k] = idx[j * 3 + k]; idx[j * 3 + k] = tmp; }
    }
    const VCO = require(path.join(editorRoot, 'src', 'utils', 'VertexCacheOrder.js'));
    assert.ok(VCO.acmr(idx) > 1.5, 'shuffled input is cache-hostile');
    const result = await Optimizer.optimize(bytes, { cacheOrder: true });
    assert.ok(result.notes.some(note => /reordered 1 triangle list/.test(note)), result.notes.join('; '));
    const out = Optimizer.parseGlb(result.bytes);
    const outPrim = out.json.meshes[0].primitives[0];
    const outAccessor = out.json.accessors[outPrim.indices];
    const outView = out.json.bufferViews[outAccessor.bufferView];
    const outIdx = new Uint32Array(out.bin.buffer, out.bin.byteOffset + outView.byteOffset, outAccessor.count);
    assert.ok(VCO.acmr(outIdx) < 0.9, 'output is cache-friendly (' + VCO.acmr(outIdx).toFixed(2) + ')');
    assert.equal(outIdx.length, idx.length);
});

test('pickLod swaps geometry by distance with hysteresis, per instance, sharing levels', () => {
    const g0 = { id: 'full' }, g1 = { id: 'quarter' }, g2 = { id: 'twentieth' };
    Reactor3D._lodCache = { 'test-model': { levels: [[g0], [g1], [g2]] } };
    try {
        const mesh = { isMesh: true, geometry: g0, userData: { lodIndex: 0 } };
        const object = {
            position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            userData: { lodKey: 'test-model', glbSize: { x: 2, y: 1, z: 1 } },
            traverse(fn) { fn(this); fn(mesh); }
        };
        const span = Reactor3D.instanceSpan(object);
        assert.equal(span, 2);
        const eyeAt = distance => ({ x: distance, y: 0, z: 0 });
        Reactor3D.pickLod(object, span, eyeAt(1));
        assert.equal(mesh.geometry, g0);
        assert.equal(object.userData.lodLevel, 0);
        Reactor3D.pickLod(object, span, eyeAt(2 * 4 + 0.1));
        assert.equal(mesh.geometry, g1, 'past four spans: a quarter');
        Reactor3D.pickLod(object, span, eyeAt(2 * 10 + 0.1));
        assert.equal(mesh.geometry, g2, 'past ten spans: a twentieth');
        Reactor3D.pickLod(object, span, eyeAt(2 * 10 - 0.5));
        assert.equal(mesh.geometry, g2, 'a hair inside the switch stays coarse (hysteresis)');
        Reactor3D.pickLod(object, span, eyeAt(2 * 10 * 0.85 - 0.5));
        assert.equal(mesh.geometry, g1, 'well inside: back a level');
        Reactor3D.pickLod(object, span, eyeAt(1));
        assert.equal(mesh.geometry, g0);
        // A caller may pass the cache key for an instance cloned before the levels arrived.
        const late = { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, userData: {}, traverse(fn) { fn(this); fn(lateMesh); } };
        const lateMesh = { isMesh: true, geometry: g0, userData: { lodIndex: 0 } };
        Reactor3D.pickLod(late, 2, eyeAt(30), 'test-model');
        assert.equal(lateMesh.geometry, g2);
        // Nothing to do without levels.
        const bare = { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, userData: {}, traverse() {} };
        assert.doesNotThrow(() => Reactor3D.pickLod(bare, 2, eyeAt(30)));
    } finally {
        Reactor3D._lodCache = null;
    }
});

test('the import writes the levels beside the source, lists them in model.json, and rolls them back', () => {
    const manager = read('editor/src/ResourceManager.js');
    assert.match(manager, /const levels = await \(window\.RRGlbOptimizer\.lodsAsync \|\| window\.RRGlbOptimizer\.lods\)\(importBytes\);/, 'off the main thread when it can be');
    assert.match(manager, /sidecar = \{ lods: extraSourceFiles\.map\(extra => extra\.name\) \};/);
    assert.match(manager, /extraSourceFiles,\n\s*sidecar,\n\s*reactor3D: window\.Reactor3D,/);
    assert.match(manager, /for \(const extra of options\.extraSourceFiles \|\| \[\]\) \{/);
    assert.match(manager, /if \(!extraName \|\| extraName !== path\.basename\(extraName\) \|\| extraName === sourceName\) \{/);
    assert.match(manager, /stagedSidecar = path\.join\(stagingDirectory, 'model\.json'\);/);
    assert.match(manager, /for \(const staged of \[stagedMesh, stagedSidecar\]\.concat\(stagedExtras\)\) \{/);
    // Import as-is writes no levels: the dialog promised every byte unchanged and nothing else.
    const keep = manager.indexOf("if (mode !== 'keep') {");
    const lodsCall = manager.indexOf('RRGlbOptimizer.lods)(importBytes)');
    assert.ok(keep > 0 && lodsCall > keep, 'levels are generated inside the optimize branch');
});

test('the runtime and the editor load the listed levels and pick per frame', () => {
    const three = read('runtime/reactor_3d.js');
    assert.match(three, /root\.children\.forEach\(\(child, index\) => \{ if \(child\.isMesh\) child\.userData\.lodIndex = index; \}\);/);
    assert.match(three, /Reactor3D\.LOD_DISTANCES = \[4, 10\];/);
    assert.match(three, /Reactor3D\.loadLodLevels = function\(template, key, name, baseUrl\) \{/);
    assert.match(three, /const files = sidecar && Array\.isArray\(sidecar\.lods\) \? sidecar\.lods : null;/, 'only listed files are fetched');
    assert.match(three, /if \(entry\.template && !entry\.template\.userData\.animated\) \{\n\s*this\.loadLodLevels\(entry\.template, key, name, baseUrl\);/);
    assert.match(three, /if \(lodEye\) Reactor3D\.pickLod\(object, Reactor3D\.instanceSpan\(object\), lodEye, holder\.spec\);/);
    assert.match(three, /if \(meshes\.length !== base\.length\) \{/, 'a level with a different mesh count is refused');
    const preview = read('editor/src/utils/EventPreviewModels.js');
    assert.match(preview, /if \(Array\.isArray\(sidecar\.lods\) && Reactor3D\.attachLodLevels && !loaded\.userData\.animated\) \{/);
    assert.match(preview, /if \(!fs\.existsSync\(lodPath\)\) continue;/);
    const editor = read('editor/src/MapEditor3D.js');
    assert.match(editor, /this\.animateEventPreviews\(now\);\n(?:\s*\/\/[^\n]*\n|\s*this\.mapScene\.update(?:Sky|Water)\?\.\([^\n]*\n)*\s*this\.pickPropLods\(\);/);
    assert.match(editor, /Reactor3D\.pickLod\(object, Reactor3D\.instanceSpan\(object\), eye, undefined, screen\);/, 'the editor hands pickLod its own screen pair');
});

test('a weak GPU is read once at boot, keeps the 3D passes sharp under a capped ratio and gives up multisampling', () => {
    const core = read('runtime/reactor_core.js');
    assert.match(core, /this\._sampleGpuTier\(app\.renderer\);/);
    const start = core.indexOf('Graphics._sampleGpuTier = function(renderer) {');
    const end = core.indexOf('\n};', start) + 3;
    const context = { Graphics: { maxCanvasPixelRatio: 4, weakMaxCanvasPixelRatio: 1, gpuTierOverride: null, weakGpuPattern: null, weakAmdPattern: null, _applyUpscaleFilter() {} }, Reactor3D: { renderTargetSamples: 4 } };
    vm.createContext(context);
    vm.runInContext(core.slice(start, end), context);
    const patternLine = core.match(/Graphics\.weakGpuPattern = (\/.*\/i);/);
    assert.ok(patternLine, 'the pattern is a literal');
    context.Graphics.weakGpuPattern = vm.runInContext(patternLine[1], context);
    const amdLine = core.match(/Graphics\.weakAmdPattern = (\/.*\/i);/);
    assert.ok(amdLine, 'the AMD APU pattern is a literal');
    context.Graphics.weakAmdPattern = vm.runInContext(amdLine[1], context);
    const fakeGl = name => ({ getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }), getParameter: () => name, RENDERER: 2 });

    assert.equal(context.Graphics._sampleGpuTier({ gl: fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)') }), 'full');
    assert.equal(context.Graphics.maxCanvasPixelRatio, 4, 'a capable GPU keeps sharp-first');
    assert.equal(context.Reactor3D.renderTargetSamples, 4);

    assert.equal(context.Graphics._sampleGpuTier({ gl: fakeGl('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)') }), 'weak');
    assert.equal(context.Graphics.maxCanvasPixelRatio, 1, 'the frame is rendered at game size and enlarged pixel for pixel');
    assert.equal(context.Reactor3D.renderTargetSamples, 0, 'edge smoothing is what a weak GPU gives up');

    context.Graphics.maxCanvasPixelRatio = 4; context.Reactor3D.renderTargetSamples = 4;
    assert.equal(context.Graphics._sampleGpuTier({ gl: fakeGl('Mali-G52') }), 'weak');
    assert.equal(context.Graphics._sampleGpuTier({ gl: fakeGl('Apple M2') }), 'full');
    assert.equal(context.Graphics._sampleGpuTier({}), 'unknown', 'no context, no guess');
    context.Graphics.gpuTierOverride = 'full';
    context.Graphics.maxCanvasPixelRatio = 4;
    assert.equal(context.Graphics._sampleGpuTier({ gl: fakeGl('SwiftShader') }), 'full', 'a plugin can pin it');
    assert.equal(context.Graphics.maxCanvasPixelRatio, 4);
});

test('a window larger than the backing store is enlarged pixel for pixel on a weak GPU, and smoothly elsewhere', () => {
    const core = read('runtime/reactor_core.js');
    const slice = name => { const at = core.indexOf(`Graphics.${name} = function`); return core.slice(at, core.indexOf('\n};', at) + 3); };
    const context = { Graphics: { _realScale: 1, maxCanvasPixelRatio: 4, gpuTier: 'full', upscaleFilter: 'auto' }, window: { devicePixelRatio: 1 } };
    vm.createContext(context);
    vm.runInContext([slice('canvasPixelRatio'), slice('displayPixelRatio'), slice('isUpscaled'), slice('upscaleFilterInUse'), slice('_applyUpscaleFilter')].join('\n'), context);
    assert.match(core, /Graphics\.weakMaxCanvasPixelRatio = 1;/, 'a weak GPU renders at game size');
    assert.match(core, /Graphics\.maxCanvasPixelRatio = 4;/, 'a capable GPU keeps the canvas at the screen\'s resolution, so the 2D layer enlarges smoothly');
    assert.match(core, /Graphics\.upscaleFilter = "auto";/);
    assert.match(core, /Math\.min\(scale, this\.maxCanvasPixelRatio \|\| 4\)/);
    const G = context.Graphics;
    const canvas = { style: {} };
    // A capable GPU at 1.5x: the store follows the screen, nothing is enlarged.
    G._realScale = 1.5;
    assert.equal(G.canvasPixelRatio(), 1.5);
    assert.equal(G.isUpscaled(), false);
    G._applyUpscaleFilter(canvas);
    assert.equal(canvas.style.imageRendering, 'auto');
    // A weak GPU at the same window: store at 1x, enlarged 1.5x, nearest.
    G.gpuTier = 'weak'; G.maxCanvasPixelRatio = 1;
    assert.equal(G.canvasPixelRatio(), 1);
    assert.equal(G.isUpscaled(), true);
    assert.equal(G.upscaleFilterInUse(), 'nearest');
    G._applyUpscaleFilter(canvas);
    assert.equal(canvas.style.imageRendering, 'pixelated');
    // Windowed at 1x nothing is enlarged, so nothing is pixelated.
    G._realScale = 1;
    G._applyUpscaleFilter(canvas);
    assert.equal(canvas.style.imageRendering, 'auto');
    // A project can choose either way regardless of the tier.
    G._realScale = 2; G.upscaleFilter = 'linear';
    G._applyUpscaleFilter(canvas);
    assert.equal(canvas.style.imageRendering, 'auto');
    G.gpuTier = 'full'; G.maxCanvasPixelRatio = 1; G.upscaleFilter = 'nearest';
    G._applyUpscaleFilter(canvas);
    assert.equal(canvas.style.imageRendering, 'pixelated');
    // A scaled desktop: a CSS pixel is 1.5 screen pixels. The store follows
    // the screen pixels on a capable GPU (a 1280x720 window is 1920x1080 of
    // them), and a weak GPU's 1x store is enlarged even in that window.
    context.window.devicePixelRatio = 1.5;
    G.gpuTier = 'full'; G.maxCanvasPixelRatio = 4; G.upscaleFilter = 'auto'; G._realScale = 1;
    assert.equal(G.canvasPixelRatio(), 1.5, 'windowed on a scaled desktop renders at screen pixels');
    assert.equal(G.isUpscaled(), false);
    G._realScale = 4 / 3;
    assert.equal(+G.canvasPixelRatio().toFixed(3), 2, 'fullscreen 1440p from a 720p game on a 1.5x desktop');
    G.gpuTier = 'weak'; G.maxCanvasPixelRatio = 1; G._realScale = 1;
    assert.equal(G.isUpscaled(), true, 'a 1x store on a 1.5x desktop is enlarged even windowed');
    G._applyUpscaleFilter(canvas);
    assert.equal(canvas.style.imageRendering, 'pixelated');
    context.window.devicePixelRatio = 1;
    // The frame beneath and the effects over it take the same filter.
    assert.match(core, /this\._canvas\.style\.height = this\._height \* this\._realScale \+ "px";\n\s*this\._applyUpscaleFilter\(this\._canvas\);/);
    assert.match(core, /this\._centerElement\(this\._effekseerCanvas\);\n[\s\S]{0,200}?this\._applyUpscaleFilter\(this\._effekseerCanvas\);/);
    assert.match(read('runtime/reactor_3d.js'), /Graphics\._centerElement\(this\._canvas\);\n\s*if \(Graphics\._applyUpscaleFilter\) Graphics\._applyUpscaleFilter\(this\._canvas\);/);
});

test('the 3D passes draw at game size on every screen and are enlarged into the frame pixel for pixel', () => {
    const three = read('runtime/reactor_3d.js');
    assert.match(three, /Reactor3D\.maxPassPixelRatio = 1;/);
    assert.match(three, /scaleMode: "nearest",/, 'the pass texture is sampled nearest');
    // PIXI never applies its style to a GL texture it did not create, so the
    // filter that reaches the GPU is the one three sets when the target is made.
    // Nearest from birth, not decided from the canvas ratio of the moment:
    // a target made in a window and kept through an enlargement must not
    // go on sampling linear.
    assert.match(three, /this\.createTarget\(size\.width, size\.height, this\._scale\);/);
    assert.match(three, /const filter = THREE\.NearestFilter;\n[\s\S]{0,400}?minFilter: filter,\n\s*magFilter: filter,/);
    assert.doesNotMatch(three, /options && options\.nearest/);
    const proto = Reactor3D.Viewport.prototype;
    const viewport = Object.assign(Object.create(proto), { _width: 1280, _height: 720, _scale: 1 });
    const saved = { Graphics: global.Graphics, cap: Reactor3D.maxPassPixelRatio };
    try {
        // A 1440p screen: the canvas draws at 2x, the passes at 1x, enlarged.
        global.Graphics = { canvasPixelRatio: () => 2 };
        assert.deepEqual(proto.targetSize.call(viewport), { width: 1280, height: 720 });
        assert.equal(proto.passEnlarged.call(viewport), true);
        // A window at 1x: nothing to enlarge, linear sampling does nothing either way.
        global.Graphics = { canvasPixelRatio: () => 1 };
        assert.deepEqual(proto.targetSize.call(viewport), { width: 1280, height: 720 });
        assert.equal(proto.passEnlarged.call(viewport), false);
        // A 1080p screen from a 720p game is 1.5x: still game size, still
        // nearest - the owner prefers the hard edges to any smoothing.
        global.Graphics = { canvasPixelRatio: () => 1.5 };
        assert.deepEqual(proto.targetSize.call(viewport), { width: 1280, height: 720 });
        assert.equal(proto.passEnlarged.call(viewport), true);
        // A project that wants the native pass back.
        Reactor3D.maxPassPixelRatio = 0;
        global.Graphics = { canvasPixelRatio: () => 2 };
        assert.deepEqual(proto.targetSize.call(viewport), { width: 2560, height: 1440 });
        assert.equal(proto.passEnlarged.call(viewport), false);
        // renderScale still applies underneath the cap.
        Reactor3D.maxPassPixelRatio = 1;
        viewport._scale = 0.5;
        assert.deepEqual(proto.targetSize.call(viewport), { width: 640, height: 360 });
    } finally {
        if (saved.Graphics === undefined) delete global.Graphics; else global.Graphics = saved.Graphics;
        Reactor3D.maxPassPixelRatio = saved.cap;
    }
});
