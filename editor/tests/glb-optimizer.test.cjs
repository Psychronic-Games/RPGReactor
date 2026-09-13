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
        assert.ok(preset.meshRatio > 0 && preset.meshRatio < 1, 'edge collapse is the primary reducer');
    }
    assert.ok(Optimizer.PRESETS.aggressive.meshCells < Optimizer.PRESETS.optimize.meshCells,
        'aggressive uses the coarser grid');
    assert.ok(Optimizer.PRESETS.aggressive.meshRatio < Optimizer.PRESETS.optimize.meshRatio,
        'aggressive keeps fewer triangles');
    // Level files are a second and third copy of the geometry on disk, which
    // grows a project faster than the reduction shrinks it. Reducing the model
    // itself costs nothing extra and applies at every distance.
    for (const name of ['optimize', 'aggressive']) {
        assert.equal(Optimizer.PRESETS[name].buildLods, false, `${name} writes no level files`);
    }
    const resourceManager = fs.readFileSync(path.join(srcRoot, 'ResourceManager.js'), 'utf8');
    assert.match(resourceManager, /\(window\.RRGlbOptimizer\.PRESETS\[mode\] \|\| \{\}\)\.buildLods/,
        'the import path honours the flag rather than always building levels');
});

// ---------------------------------------------------------------------------
// optimize: edge collapse, UV seams and skinning
// ---------------------------------------------------------------------------

/**
 * A skinned grid split down the middle into two UV islands, so the vertices
 * along the split are stored twice - the shape a real export takes, and the
 * one that used to tear open when the mesh was reduced.
 */
function seamGrid() {
    const positions = [], normals = [], uvs = [], joints = [], weights = [], indices = [];
    const island = (columns, uStart) => {
        const base = positions.length / 3;
        for (let c = 0; c < columns.length; c++) {
            for (let r = 0; r < 4; r++) {
                positions.push(columns[c], r, 0);
                normals.push(0, 0, 1);
                uvs.push(uStart + c * 0.1, r * 0.1);
                joints.push(0, 0, 0, 0);
                weights.push(1, 0, 0, 0);
            }
        }
        for (let c = 0; c < columns.length - 1; c++) {
            for (let r = 0; r < 3; r++) {
                const a = base + c * 4 + r, b = a + 4;
                indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
    };
    island([0, 1, 2], 0);          // left island, its right edge at x = 2
    island([2, 3], 0.5);           // right island, its left edge at x = 2 as well
    return buildGlb({
        accessors: [
            { type: 'VEC3', componentType: 5126, data: new Float32Array(positions),
                extra: { min: [0, 0, 0], max: [3, 3, 0] } },
            { type: 'VEC3', componentType: 5126, data: new Float32Array(normals) },
            { type: 'VEC2', componentType: 5126, data: new Float32Array(uvs) },
            { type: 'VEC4', componentType: 5121, data: new Uint8Array(joints) },
            { type: 'VEC4', componentType: 5126, data: new Float32Array(weights) },
            { type: 'SCALAR', componentType: 5123, data: new Uint16Array(indices) }
        ],
        rest: {
            meshes: [{ primitives: [{
                attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
                indices: 5
            }] }],
            nodes: [{ name: 'root' }],
            skins: [{ joints: [0] }]
        }
    });
}

/** Edges used by exactly one triangle, after welding by exact position. */
function openEdges(bytes) {
    const { json, bin } = Optimizer.parseGlb(bytes);
    const prim = json.meshes[0].primitives[0];
    const pos = readAccessor(json, bin, prim.attributes.POSITION);
    const idx = readAccessor(json, bin, prim.indices);
    const key = new Map();
    const remap = [];
    for (let i = 0; i < pos.length / 3; i++) {
        const k = `${pos[i * 3].toFixed(5)},${pos[i * 3 + 1].toFixed(5)},${pos[i * 3 + 2].toFixed(5)}`;
        if (!key.has(k)) key.set(k, key.size);
        remap[i] = key.get(k);
    }
    const use = new Map();
    for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [remap[idx[t]], remap[idx[t + 1]], remap[idx[t + 2]]];
        if (a === b || b === c || a === c) continue;
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            const e = u < v ? `${u}_${v}` : `${v}_${u}`;
            use.set(e, (use.get(e) || 0) + 1);
        }
    }
    let open = 0;
    for (const count of use.values()) if (count === 1) open++;
    return open;
}

test('reducing a seamed mesh does not tear it open', async () => {
    // The bug this guards: the two copies of a seam vertex are distinct
    // indices, so a reducer treats the seam as a mesh boundary and lets each
    // side collapse its own way. The surface separates and the model fills
    // with pinholes. Seam vertices are pinned, so it cannot.
    const bytes = seamGrid();
    const before = openEdges(bytes);
    const result = await Optimizer.optimize(bytes, { meshRatio: 0.5, meshCells: 0 });
    const after = openEdges(result.bytes);
    const out = Optimizer.parseGlb(result.bytes);
    const prim = out.json.meshes[0].primitives[0];

    assert.ok(out.json.accessors[prim.indices].count / 3 < 18, 'the mesh actually reduced');
    assert.ok(after <= before, `no new open edges (${before} -> ${after})`);

    // Both copies of every seam position survive, so the two islands keep
    // their own texture coordinates. (Pinning holds a vertex against being
    // collapsed away; it cannot save one whose surrounding triangles have all
    // gone, which is why this asks for a real reduction rather than the
    // deepest one the grid will take.)
    const pos = readAccessor(out.json, out.bin, prim.attributes.POSITION);
    let atSeam = 0;
    for (let i = 0; i < pos.length / 3; i++) if (Math.abs(pos[i * 3] - 2) < 1e-6) atSeam++;
    assert.equal(atSeam, 8, 'the seam column is held, both copies of it');
});

test('edge collapse carries skinning, and never blends bone indices', async () => {
    const bytes = seamGrid();
    const result = await Optimizer.optimize(bytes, { meshRatio: 0.5, meshCells: 0 });
    const { json, bin } = Optimizer.parseGlb(result.bytes);
    const prim = json.meshes[0].primitives[0];

    assert.ok(prim.attributes.JOINTS_0 != null, 'joints kept');
    assert.ok(prim.attributes.WEIGHTS_0 != null, 'weights kept');
    const vertices = json.accessors[prim.attributes.POSITION].count;
    assert.equal(json.accessors[prim.attributes.JOINTS_0].count, vertices, 'joints in step with positions');
    assert.equal(json.accessors[prim.attributes.WEIGHTS_0].count, vertices, 'weights in step with positions');
    // Joint channels are bone indices: an averaged one would point at a bone
    // that has nothing to do with either endpoint.
    assert.equal(json.accessors[prim.attributes.JOINTS_0].componentType, 5121, 'still integer bone indices');
    const jointCount = json.skins[0].joints.length;
    for (const index of readAccessor(json, bin, prim.attributes.JOINTS_0)) {
        assert.ok(Number.isInteger(index) && index < jointCount, `bone index ${index} in range`);
    }
});

// ---------------------------------------------------------------------------
// optimize: carved parts across a reduction
// ---------------------------------------------------------------------------

/**
 * A flat plane, its triangles emitted column by column, so the first half of
 * the triangle list is exactly the left half of the surface. That makes a
 * part defined by index also a part defined by geometry, which is what lets
 * the remap be checked.
 */
function partPlane(n) {
    const positions = [], normals = [], uvs = [], indices = [];
    for (let x = 0; x <= n; x++) {
        for (let y = 0; y <= n; y++) { positions.push(x, y, 0); normals.push(0, 0, 1); uvs.push(x / n, y / n); }
    }
    const at = (x, y) => x * (n + 1) + y;
    for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
            indices.push(at(x, y), at(x + 1, y), at(x, y + 1));
            indices.push(at(x + 1, y), at(x + 1, y + 1), at(x, y + 1));
        }
    }
    return buildGlb({
        accessors: [
            { type: 'VEC3', componentType: 5126, data: new Float32Array(positions), extra: { min: [0, 0, 0], max: [n, n, 0] } },
            { type: 'VEC3', componentType: 5126, data: new Float32Array(normals) },
            { type: 'VEC2', componentType: 5126, data: new Float32Array(uvs) },
            { type: 'SCALAR', componentType: 5125, data: new Uint32Array(indices) }
        ],
        rest: {
            meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3 }] }],
            nodes: [{ name: 'root' }]
        }
    });
}

/** Triangle centres of a part's runs, in the given model. */
function partCentres(bytes, part) {
    const { json, bin } = Optimizer.parseGlb(bytes);
    const prim = json.meshes[0].primitives[0];
    const pos = readAccessor(json, bin, prim.attributes.POSITION);
    const idx = readAccessor(json, bin, prim.indices);
    const total = idx.length / 3;
    const centres = [];
    for (const [start, count] of (part.meshes || {})['0'] || []) {
        for (let t = start; t < start + count && t < total; t++) {
            const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
            centres.push([
                (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3,
                (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
            ]);
        }
    }
    return { centres, total };
}

test('a carved part is re-derived across a reduction, not lost', async () => {
    // The bug this guards: a part is stored as runs of triangle indices, and
    // reducing (or merely reordering) the mesh repoints them at other
    // geometry — the piece that should animate becomes a scattered wrong set
    // and swings through the model. The part is a region of the surface, so
    // it has to come back as that same region.
    const n = 40;
    const bytes = partPlane(n);
    const half = (n * n * 2) / 2;                  // triangles of the left half
    const parts = [{ name: 'left', pivot: [0, 0, 0], meshes: { 0: [[0, half]] } }];

    const before = partCentres(bytes, parts[0]);
    assert.equal(before.centres.length, half, 'the fixture selects half the mesh');
    assert.ok(before.centres.every(([x]) => x < n / 2), 'and it is the left half');

    const result = await Optimizer.optimize(bytes, { meshRatio: 0.3, meshCells: 0 });
    const remapped = Optimizer.remapParts(bytes, result.bytes, parts);
    assert.ok(remapped, 'the part was re-derived');

    const after = partCentres(result.bytes, remapped[0]);
    assert.ok(after.total < before.total, 'the mesh really was reduced');
    assert.ok(after.centres.length > 0, 'the part is not empty');

    // Same region: every triangle still on the left, give or take the one-cell
    // boundary shift a reduction is entitled to.
    const strays = after.centres.filter(([x]) => x > n / 2 + 1.5);
    assert.equal(strays.length, 0, `part stayed on its own half (${strays.length} strayed)`);
    // And it still covers about half the surface, rather than collapsing to a
    // sliver that would read as "the part stopped working".
    const share = after.centres.length / after.total;
    assert.ok(share > 0.3 && share < 0.7, `part keeps its share of the mesh (got ${share.toFixed(2)})`);
});

test('remapping refuses rather than guessing when the models cannot be paired', () => {
    const parts = [{ name: 'left', pivot: [0, 0, 0], meshes: { 0: [[0, 10]] } }];
    // A different model entirely: one primitive against none of the same
    // geometry is still pairable, but a part naming a primitive that does not
    // exist is not.
    const missing = [{ name: 'left', pivot: [0, 0, 0], meshes: { 7: [[0, 10]] } }];
    const plane = partPlane(8);
    assert.equal(Optimizer.remapParts(plane, plane, missing), null,
        'a part naming a primitive that is not there is refused');
    // Same model in and out: the part must survive unchanged in substance.
    const same = Optimizer.remapParts(plane, plane, parts);
    assert.ok(same && same[0].meshes[0].length, 'an unchanged model keeps its part');
    assert.deepEqual(Optimizer.remapParts(plane, plane, []), [], 'no parts, nothing to do');
});

test('a primitive the collapse refuses still gets the weld grid', async () => {
    // Two triangles are already under any sane budget, so the collapse
    // declines and the weld grid has to be what actually runs.
    const bytes = flatMesh(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, /* dup */ 1, 0, 0, /* dup */ 0, 1, 0, 1, 1, 0],
        [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        [0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1],
        [0, 1, 2, 3, 4, 5]);
    const result = await Optimizer.optimize(bytes, { meshRatio: 0.5, meshCells: 1600 });
    const out = Optimizer.parseGlb(result.bytes);
    assert.equal(out.json.accessors[out.json.meshes[0].primitives[0].attributes.POSITION].count, 4,
        'duplicates welded by the fallback');
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

test('the 3D database can optimize a model already in the project', () => {
    // Importing offers the optimizer once. A model that arrived any other way
    // - copied in by hand, out of an asset pack - needs its own way in.
    const editor = fs.readFileSync(path.join(srcRoot, 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(editor, /class="rr-btn-secondary r3d-optimize"/, 'the action is on screen');
    assert.match(editor, /\.r3d-optimize'\)[\s\S]{0,120}optimizeSelectedModel\(\)/, 'the button is wired');
    assert.match(editor, /async optimizeSelectedModel\(\)/);
    assert.match(editor, /showModelOptimizeDialog\(\{/, 'the same choices the import offers');
    assert.match(editor, /PRESETS\[mode\]/);
    assert.match(editor, /if \(mode === null \|\| mode === 'keep'\) return;/, 'declining changes nothing');
    // Reversible, and never clobbering an older backup.
    assert.match(editor, /filePath \+ '\.orig'/);
    assert.match(editor, /if \(!fs\.existsSync\(backup\)\) fs\.copyFileSync\(filePath, backup\);/);
    // Stale geometry must not survive the swap.
    assert.match(editor, /delete this\._templates\[entry\.name\];/);
    // Proves the result loads before it replaces the only copy of a model.
    assert.match(editor, /ResourceManager\.validateModelBytes\(bytes, '\.glb', window\.Reactor3D\)/);
    // Carved parts are re-derived, and a failure falls back rather than
    // writing a model whose parts point at the wrong triangles.
    assert.match(editor, /window\.RRGlbOptimizer\.remapParts\(original, optimized\.bytes, previous\.parts\)/);
    assert.match(editor, /settings\.cacheOrder = false;/, 'the fallback stops touching the triangle list');
    assert.match(editor, /previous\.parts = remappedParts;/);

    const uiManager = fs.readFileSync(path.join(srcRoot, 'UIManager.js'), 'utf8');
    assert.match(uiManager, /title = 'Import 3D Model'/, 'the dialog still defaults to the import wording');
    assert.match(uiManager, /titleEl\.textContent = tt\(title\);/);
});

test('analyze reports what makes a model expensive, not just its triangles', () => {
    // The cost panel is only as good as this: a model can be slow for its draw
    // calls or its rig with a modest triangle count, and the panel has to be
    // able to say so.
    const analysis = Optimizer.analyze(skinnedTriangle());
    assert.equal(analysis.primitives, 1, 'draw calls counted');
    assert.equal(analysis.meshes, 1);
    assert.equal(analysis.materials, 1);
    assert.equal(analysis.skinned, true);
    assert.equal(analysis.bones, 1);
    assert.equal(analysis.animations, 1);
    assert.equal(analysis.animated, true);

    const editor = fs.readFileSync(path.join(srcRoot, 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(editor, /class="r3d-stats"/, 'the panel is on screen');
    assert.match(editor, /renderModelStats\(\)/);
    assert.match(editor, /modelStats\(entry\)/);
    // Cached on the file's identity, so re-selecting a model costs nothing and
    // a model changed on disk is re-read.
    assert.match(editor, /\$\{filePath\}\|\$\{stat\.size\}\|\$\{stat\.mtimeMs\}/);
    assert.match(editor, /stats: \['\.r3d-stats'\]/, 'the section folds like the others');
});

test('fromMesh builds a self-contained GLB: welded parts per material, pictures embedded, UVs flipped for glTF', () => {
    // Two triangles sharing an edge, one per material; the second material names a picture.
    const mesh = {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]),
        uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
        groups: [{ name: 'Wing', material: 0, start: 0, count: 3 }, { name: 'Wing', material: 1, start: 3, count: 3 }],
        materials: [{ name: 'Plain', color: [1, 0, 0], opacity: 0.5, texture: '', alpha: '', embedded: null }, { name: 'Wood', color: [1, 1, 1], opacity: 1, texture: 'wood.png', alpha: '', embedded: null }]
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0]);
    const bytes = Optimizer.fromMesh(mesh, { 'wood.png': { bytes: png, mimeType: 'image/png' } }, { name: 'bird' });
    const parsed = Optimizer.parseGlb(bytes);
    assert.ok(parsed, 'the result parses as a GLB');
    const { json } = parsed;
    assert.deepEqual(json.nodes.map(n => n.name), ['Wing'], 'one node per part');
    assert.equal(json.meshes[0].primitives.length, 2, 'one primitive per material run');
    assert.deepEqual(json.meshes[0].primitives.map(p => p.material), [0, 1]);
    assert.equal(json.materials[0].alphaMode, 'BLEND');
    assert.deepEqual(json.materials[0].pbrMetallicRoughness.baseColorFactor, [1, 0, 0, 0.5]);
    assert.equal(json.materials[1].pbrMetallicRoughness.baseColorTexture.index, 0);
    assert.equal(json.images.length, 1, 'the picture is embedded once');
    const analysis = Optimizer.analyze(bytes);
    assert.equal(analysis.triangles, 2);
    assert.equal(analysis.images[0].width, 2);
    assert.equal(analysis.images[0].height, 3);
    const uv = json.accessors[json.meshes[0].primitives[0].attributes.TEXCOORD_0];
    const view = json.bufferViews[uv.bufferView];
    const values = new Float32Array(parsed.bin.buffer, parsed.bin.byteOffset + (view.byteOffset || 0), uv.count * 2);
    assert.deepEqual(Array.from(values), [0, 1, 1, 1, 1, 0], 'V runs top-down in glTF');
});
