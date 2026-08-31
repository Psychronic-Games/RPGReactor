const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(editorRoot, 'src');
const Optimizer = require(path.join(srcRoot, 'utils', 'GlbOptimizer.js'));

// ---------------------------------------------------------------------------
// Synthetic GLB builder: enough of the format to exercise every pass.
// ---------------------------------------------------------------------------

const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Minimal PNG header: signature + IHDR carrying width/height/colorType. */
function pngStub(width, height, colorType) {
    const data = Buffer.alloc(48);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data, 0);
    data.writeUInt32BE(13, 8);
    data.write('IHDR', 12);
    data.writeUInt32BE(width, 16);
    data.writeUInt32BE(height, 20);
    data[24] = 8;
    data[25] = colorType;
    return data;
}

/** Assemble a GLB from { accessors: [{type, componentType, data, extra}], images, rest }. */
function buildGlb({ accessors, images = [], rest = {} }) {
    const bufferViews = [];
    const parts = [];
    let offset = 0;
    const push = data => {
        const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        const pad = (4 - (offset % 4)) % 4;
        if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
        parts.push(bytes);
        offset += bytes.length;
        return bufferViews.length - 1;
    };
    const jsonAccessors = accessors.map(spec => Object.assign({
        bufferView: push(spec.data),
        componentType: spec.componentType,
        count: spec.data.length / TYPE_COMPONENTS[spec.type],
        type: spec.type
    }, spec.extra || {}));
    const jsonImages = images.map(image => ({ bufferView: push(image.data), mimeType: image.mimeType }));
    const json = Object.assign({
        asset: { version: '2.0' },
        buffers: [{ byteLength: offset }],
        bufferViews,
        accessors: jsonAccessors,
        images: jsonImages
    }, rest);
    let jsonBytes = Buffer.from(JSON.stringify(json));
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    if (jsonPad) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
    let bin = Buffer.concat(parts);
    const binPad = (4 - (bin.length % 4)) % 4;
    if (binPad) bin = Buffer.concat([bin, Buffer.alloc(binPad)]);
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546C67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + bin.length, 8);
    const jsonHead = Buffer.alloc(8);
    jsonHead.writeUInt32LE(jsonBytes.length, 0);
    jsonHead.writeUInt32LE(0x4E4F534A, 4);
    const binHead = Buffer.alloc(8);
    binHead.writeUInt32LE(bin.length, 0);
    binHead.writeUInt32LE(0x004E4942, 4);
    return Buffer.concat([header, jsonHead, jsonBytes, binHead, bin]);
}

function readAccessor(json, bin, index) {
    const CTORS = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const Ctor = CTORS[accessor.componentType];
    const comps = TYPE_COMPONENTS[accessor.type];
    const slice = bin.subarray((view.byteOffset || 0) + (accessor.byteOffset || 0));
    return new Ctor(slice.buffer, slice.byteOffset, accessor.count * comps);
}

/** A skinned, animated, textured single triangle with a tangent stream. */
function skinnedTriangle() {
    return buildGlb({
        accessors: [
            { type: 'VEC3', componentType: 5126, data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
                extra: { min: [0, 0, 0], max: [1, 1, 0] } },                                    // 0 POSITION
            { type: 'VEC3', componentType: 5126, data: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]) }, // 1 NORMAL
            { type: 'VEC2', componentType: 5126, data: new Float32Array([0, 0, 1, 0, 0, 1]) },  // 2 TEXCOORD_0
            { type: 'VEC4', componentType: 5126, data: new Float32Array(12) },                  // 3 TANGENT
            { type: 'VEC4', componentType: 5121, data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }, // 4 JOINTS_0
            { type: 'VEC4', componentType: 5126,
                data: new Float32Array([0.25, 0.25, 0.25, 0.25, 0.7, 0.3, 0, 0, 1, 0, 0, 0]) }, // 5 WEIGHTS_0
            { type: 'SCALAR', componentType: 5123, data: new Uint16Array([0, 1, 2]) },          // 6 indices
            { type: 'SCALAR', componentType: 5126, data: new Float32Array([0, 1]) },            // 7 anim times
            { type: 'VEC4', componentType: 5126, data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]) }, // 8 anim rotations
            { type: 'MAT4', componentType: 5126, data: new Float32Array([
                1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) }                              // 9 inverse bind matrices
        ],
        images: [{ mimeType: 'image/png', data: pngStub(4, 4, 2) }],
        rest: {
            meshes: [{ primitives: [{
                attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, TANGENT: 3, JOINTS_0: 4, WEIGHTS_0: 5 },
                indices: 6, material: 0
            }] }],
            materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
            textures: [{ source: 0 }],
            nodes: [{ name: 'root' }],
            animations: [{ channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }],
                samplers: [{ input: 7, output: 8, interpolation: 'LINEAR' }] }],
            skins: [{ joints: [0], inverseBindMatrices: 9 }]
        }
    });
}

function flatMesh(positions, normals, uvs, indices) {
    return buildGlb({
        accessors: [
            { type: 'VEC3', componentType: 5126, data: new Float32Array(positions) },
            { type: 'VEC3', componentType: 5126, data: new Float32Array(normals) },
            { type: 'VEC2', componentType: 5126, data: new Float32Array(uvs) },
            { type: 'SCALAR', componentType: 5123, data: new Uint16Array(indices) }
        ],
        rest: { meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3 }] }] }
    });
}

// ---------------------------------------------------------------------------
// analyze
// ---------------------------------------------------------------------------

test('analyze reports what is on the table', () => {
    const analysis = Optimizer.analyze(skinnedTriangle());
    assert.ok(analysis);
    assert.equal(analysis.triangles, 1);
    assert.equal(analysis.vertices, 3);
    assert.equal(analysis.tangentBytes, 48);
    assert.equal(analysis.floatWeightBytes, 48);
    assert.equal(analysis.animated, true);
    assert.equal(analysis.images.length, 1);
    assert.equal(analysis.images[0].width, 4);
    assert.equal(analysis.images[0].height, 4);
    assert.equal(analysis.images[0].hasAlpha, false);
});

test('analyze declines non-GLB bytes and required extensions', () => {
    assert.equal(Optimizer.analyze(Buffer.from('not a glb at all, nope')), null);
    const exotic = buildGlb({
        accessors: [{ type: 'SCALAR', componentType: 5126, data: new Float32Array([0]) }],
        rest: { extensionsRequired: ['KHR_draco_mesh_compression'] }
    });
    assert.equal(Optimizer.analyze(exotic), null);
});

// ---------------------------------------------------------------------------
// optimize: the standard preset on a skinned, animated model
// ---------------------------------------------------------------------------

test('standard preset drops tangents, packs weights, re-encodes textures, keeps animation intact', async () => {
    const original = skinnedTriangle();
    const stub = async () => ({ data: new Uint8Array([9, 9, 9, 9]), mimeType: 'image/jpeg' });
    const result = await Optimizer.optimize(original, Object.assign(
        { encodeImage: stub }, Optimizer.PRESETS.optimize));
    assert.notEqual(result.bytes, original);

    const out = Optimizer.parseGlb(result.bytes);
    const prim = out.json.meshes[0].primitives[0];
    assert.equal(prim.attributes.TANGENT, undefined);
    assert.equal(out.json.accessors.length, 9, 'exactly the tangent accessor is gone');

    // Geometry unchanged: the triangle spans the whole grid, nothing welds.
    assert.deepEqual(Array.from(readAccessor(out.json, out.bin, prim.attributes.POSITION)),
        [0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assert.deepEqual(Array.from(readAccessor(out.json, out.bin, prim.indices)), [0, 1, 2]);

    // Weights are 16-bit normalized and each vertex still sums to exactly one.
    const weightsAccessor = out.json.accessors[prim.attributes.WEIGHTS_0];
    assert.equal(weightsAccessor.componentType, 5123);
    assert.equal(weightsAccessor.normalized, true);
    const weights = readAccessor(out.json, out.bin, prim.attributes.WEIGHTS_0);
    for (let vertex = 0; vertex < 3; vertex++) {
        const sum = weights[vertex * 4] + weights[vertex * 4 + 1]
            + weights[vertex * 4 + 2] + weights[vertex * 4 + 3];
        assert.equal(sum, 65535, `vertex ${vertex} weight sum`);
    }

    // The animation still points at the same keyframe data after the remap.
    const sampler = out.json.animations[0].samplers[0];
    assert.deepEqual(Array.from(readAccessor(out.json, out.bin, sampler.input)), [0, 1]);
    assert.deepEqual(Array.from(readAccessor(out.json, out.bin, sampler.output)),
        [0, 0, 0, 1, 0, 0, 0, 1]);
    const bind = readAccessor(out.json, out.bin, out.json.skins[0].inverseBindMatrices);
    assert.equal(bind.length, 16);
    assert.equal(bind[0], 1);
    assert.equal(bind[15], 1);

    // The texture was swapped for the stub's JPEG bytes.
    assert.equal(out.json.images[0].mimeType, 'image/jpeg');
    const imageView = out.json.bufferViews[out.json.images[0].bufferView];
    assert.deepEqual(Array.from(out.bin.subarray(imageView.byteOffset,
        imageView.byteOffset + imageView.byteLength)), [9, 9, 9, 9]);

    // Nothing reducible is left behind.
    const after = Optimizer.analyze(result.bytes);
    assert.equal(after.tangentBytes, 0);
    assert.equal(after.floatWeightBytes, 0);
});

// ---------------------------------------------------------------------------
// optimize: vertex welding
// ---------------------------------------------------------------------------

test('welding merges exact duplicate vertices and reindexes', async () => {
    // Two triangles sharing an edge, exported with the shared verts duplicated.
    const bytes = flatMesh(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, /* dup of 1 */ 1, 0, 0, /* dup of 2 */ 0, 1, 0, 1, 1, 0],
        [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        [0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1],
        [0, 1, 2, 3, 4, 5]);
    const result = await Optimizer.optimize(bytes, { meshCells: 1600 });
    const out = Optimizer.parseGlb(result.bytes);
    const prim = out.json.meshes[0].primitives[0];
    const position = out.json.accessors[prim.attributes.POSITION];
    assert.equal(position.count, 4, 'duplicates welded');
    assert.deepEqual(position.min, [0, 0, 0]);
    assert.deepEqual(position.max, [1, 1, 0]);
    const indices = Array.from(readAccessor(out.json, out.bin, prim.indices));
    assert.equal(indices.length, 6, 'both triangles survive');
    for (const index of indices) assert.ok(index < 4);
    for (let tri = 0; tri < indices.length; tri += 3) {
        const [a, b, c] = indices.slice(tri, tri + 3);
        assert.ok(a !== b && b !== c && a !== c, 'no degenerate triangles');
    }
});

test('a coarse grid collapses near-coincident vertices and drops the degenerate triangle', async () => {
    const bytes = flatMesh(
        [0, 0, 0, 0.5, 0.5, 0, 0.51, 0.5, 0],
        [0, 0, 1, 0, 0, 1, 0, 0, 1],
        [0, 0, 0.5, 0.5, 0.5, 0.5],
        [0, 1, 2]);
    const result = await Optimizer.optimize(bytes, { meshCells: 10 });
    const out = Optimizer.parseGlb(result.bytes);
    const prim = out.json.meshes[0].primitives[0];
    assert.equal(out.json.accessors[prim.attributes.POSITION].count, 2);
    assert.equal(out.json.accessors[prim.indices].count, 0, 'degenerate triangle removed');
});

test('extra vertex attributes leave the geometry alone', async () => {
    const bytes = buildGlb({
        accessors: [
            { type: 'VEC3', componentType: 5126, data: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0]) },
            { type: 'VEC3', componentType: 5126, data: new Float32Array(12) },
            { type: 'VEC2', componentType: 5126, data: new Float32Array(8) },
            { type: 'VEC4', componentType: 5126, data: new Float32Array(16) },
            { type: 'SCALAR', componentType: 5123, data: new Uint16Array([0, 1, 2]) }
        ],
        rest: { meshes: [{ primitives: [{
            attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4 } ] }] }
    });
    const result = await Optimizer.optimize(bytes, { meshCells: 1600 });
    const out = Optimizer.parseGlb(result.bytes);
    assert.equal(out.json.accessors[0].count, 4, 'vertex data untouched');
    assert.ok(result.notes.some(note => note.indexOf('extra vertex attributes') >= 0));
});

test('nothing requested means the original bytes come back', async () => {
    const original = skinnedTriangle();
    const result = await Optimizer.optimize(original, {});
    assert.equal(result.bytes, original);
    assert.deepEqual(result.notes, ['nothing to reduce']);
});

test('presets carry the import dialog contract', () => {
    for (const name of ['optimize', 'aggressive']) {
        const preset = Optimizer.PRESETS[name];
        assert.ok(preset);
        assert.equal(preset.textureSize, 2048);
        assert.equal(preset.dropTangents, true);
        assert.equal(preset.quantizeWeights, true);
        assert.ok(preset.meshCells > 0);
    }
    assert.ok(Optimizer.PRESETS.aggressive.meshCells < Optimizer.PRESETS.optimize.meshCells,
        'aggressive uses the coarser grid');
});

// ---------------------------------------------------------------------------
// wiring
// ---------------------------------------------------------------------------

test('the import flow offers the optimizer and imports the chosen bytes', () => {
    const resourceManager = fs.readFileSync(path.join(srcRoot, 'ResourceManager.js'), 'utf8');
    assert.match(resourceManager, /showModelOptimizeDialog\(/);
    assert.match(resourceManager, /sourceBytes: importBytes/);
    assert.match(resourceManager, /RRGlbOptimizer\.analyze\(bytes\)/);
    assert.match(resourceManager, /PRESETS\[mode\]/);
    // Cancel aborts the import before anything is written.
    assert.match(resourceManager, /if \(mode === null \|\| generation !== this\.operationGeneration\) return;/);

    const uiManager = fs.readFileSync(path.join(srcRoot, 'UIManager.js'), 'utf8');
    assert.match(uiManager, /showModelOptimizeDialog\(\{ fileName = ''/);
    for (const value of ['optimize', 'aggressive', 'keep']) {
        assert.ok(uiManager.indexOf(`addChoice('${value}'`) >= 0, `dialog offers ${value}`);
    }

    const indexHtml = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(indexHtml, /src\/utils\/GlbOptimizer\.js/);
});
