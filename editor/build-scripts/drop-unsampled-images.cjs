#!/usr/bin/env node
/**
 * Remove the pictures a GLB carries that the game never samples, and nothing else.
 *
 * The runtime draws a material's base color map only (a specular-glossiness
 * material's diffuse map). Every other picture (normal, metal-roughness,
 * occlusion maps, pictures no texture names) is dropped with the texture
 * slots that name it; textures, images and buffer views are renumbered. Every
 * other byte of the file is kept: accessors, geometry, animation and skin data
 * are copied as they are, and each kept buffer view keeps its alignment.
 *
 * Before a file is written it is checked: the base color pictures and every
 * accessor's bytes must match the original, and meshes, nodes, skins and
 * animations must be unchanged. A file that fails is left alone.
 *
 *   node editor/build-scripts/drop-unsampled-images.cjs <file.glb | dir>... [--write | --out=<dir>]
 *
 * Without --write or --out it reports what it would remove.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function readGlb(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB');
    let offset = 12, json = null, bin = new Uint8Array(0);
    while (offset + 8 <= bytes.length) {
        const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
        const chunk = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === 0x4E4F534A) json = JSON.parse(Buffer.from(chunk).toString('utf8'));
        else if (type === 0x004E4942) bin = chunk;
        else throw new Error('an unknown chunk');
        offset += 8 + length;
    }
    if (!json) throw new Error('no JSON chunk');
    return { json, bin };
}

function writeGlb(json, bin) {
    let text = Buffer.from(JSON.stringify(json), 'utf8');
    text = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
    const body = Buffer.concat([Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength), Buffer.alloc((4 - bin.length % 4) % 4)]);
    const head = Buffer.alloc(12), jsonHead = Buffer.alloc(8), binHead = Buffer.alloc(8);
    head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
    jsonHead.writeUInt32LE(text.length, 0); jsonHead.writeUInt32LE(0x4E4F534A, 4);
    binHead.writeUInt32LE(body.length, 0); binHead.writeUInt32LE(0x004E4942, 4);
    return new Uint8Array(Buffer.concat([head, jsonHead, text, binHead, body]));
}

/** The image indices a material draws with, as the runtime picks them. */
function sampledImages(json) {
    const out = new Set();
    for (const material of json.materials || []) {
        const pbr = material.pbrMetallicRoughness || {}, specgloss = material.extensions && material.extensions.KHR_materials_pbrSpecularGlossiness;
        const info = pbr.baseColorTexture || (specgloss && specgloss.diffuseTexture);
        const texture = info && json.textures && json.textures[info.index];
        if (!texture) continue;
        if (texture.source != null) out.add(texture.source);
        const basisu = texture.extensions && texture.extensions.KHR_texture_basisu;
        if (basisu && basisu.source != null) out.add(basisu.source);
    }
    return out;
}

/** Every texture reference inside the materials (`{ index }` under a key ending in "Texture"). */
function eachTextureInfo(json, visit) {
    const walk = (object, owner) => {
        for (const key of Object.keys(object)) {
            const value = object[key];
            if (!value || typeof value !== 'object') continue;
            if (/Texture$/.test(key) && typeof value.index === 'number') visit(value, object, key, owner);
            else walk(value, owner);
        }
    };
    for (const material of json.materials || []) walk(material, material);
}

/** The same file without the pictures nothing samples, or null when there is none to drop. */
function dropUnsampled(bytes) {
    const { json, bin } = readGlb(bytes);
    const used = (json.extensionsUsed || []).filter(name => /draco|meshopt/i.test(name));
    if (used.length) throw new Error('compressed geometry (' + used.join(', ') + ') is not rewritten');
    const keep = sampledImages(json);
    const drop = new Set((json.images || []).map((image, index) => index).filter(index => !keep.has(index)));
    if (!drop.size) return null;
    const removed = [];
    // A texture whose every picture goes, goes; the slots naming it go with it.
    const textureDropped = (json.textures || []).map(texture => {
        const sources = [texture.source, texture.extensions && texture.extensions.KHR_texture_basisu && texture.extensions.KHR_texture_basisu.source].filter(s => s != null);
        return sources.length > 0 && sources.every(s => drop.has(s));
    });
    eachTextureInfo(json, (info, parent, key, material) => {
        if (!textureDropped[info.index]) return;
        delete parent[key];
        removed.push((material.name || 'material') + '.' + key);
        // An emissive map goes with its factor: without the map the factor would light the whole surface.
        if (key === 'emissiveTexture' && parent.emissiveFactor) { delete parent.emissiveFactor; removed.push((material.name || 'material') + '.emissiveFactor'); }
    });
    const textureMap = new Map();
    json.textures = (json.textures || []).filter((texture, index) => { if (textureDropped[index]) return false; textureMap.set(index, textureMap.size); return true; });
    eachTextureInfo(json, info => { info.index = textureMap.get(info.index); });
    const imageMap = new Map(), droppedViews = new Set();
    json.images = (json.images || []).filter((image, index) => {
        if (drop.has(index)) { if (image.bufferView != null) droppedViews.add(image.bufferView); return false; }
        imageMap.set(index, imageMap.size);
        return true;
    });
    for (const texture of json.textures) {
        if (texture.source != null) texture.source = imageMap.get(texture.source);
        const basisu = texture.extensions && texture.extensions.KHR_texture_basisu;
        if (basisu && basisu.source != null) basisu.source = imageMap.get(basisu.source);
    }
    for (const key of ['textures', 'images']) if (!json[key].length) delete json[key];
    // A view another reader still names stays.
    for (const accessor of json.accessors || []) droppedViews.delete(accessor.bufferView);
    for (const image of json.images || []) droppedViews.delete(image.bufferView);
    const viewMap = new Map(), parts = [];
    let size = 0;
    json.bufferViews = (json.bufferViews || []).filter((view, index) => {
        if (droppedViews.has(index)) return false;
        viewMap.set(index, viewMap.size);
        const from = view.byteOffset || 0, at = size + ((from % 16) - (size % 16) + 16) % 16;
        parts.push([at, bin.subarray(from, from + view.byteLength)]);
        if (at !== 0 || view.byteOffset !== undefined) view.byteOffset = at;
        size = at + view.byteLength;
        return true;
    });
    const packed = new Uint8Array(size);
    for (const [at, data] of parts) packed.set(data, at);
    for (const accessor of json.accessors || []) if (accessor.bufferView != null) accessor.bufferView = viewMap.get(accessor.bufferView);
    for (const image of json.images || []) if (image.bufferView != null) image.bufferView = viewMap.get(image.bufferView);
    if (json.buffers && json.buffers[0]) json.buffers[0].byteLength = size;
    return { bytes: writeGlb(json, packed), removed, images: drop.size };
}

/** An accessor's own bytes (its elements, by its view's stride). */
function accessorBytes(json, bin, index) {
    const accessor = json.accessors[index];
    if (accessor.bufferView == null) return Buffer.alloc(0);
    const view = json.bufferViews[accessor.bufferView];
    const element = (COMPONENTS[accessor.type] || 1) * (BYTES[accessor.componentType] || 1);
    const stride = view.byteStride || element, start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const out = Buffer.alloc(accessor.count * element);
    for (let i = 0; i < accessor.count; i++) out.set(bin.subarray(start + i * stride, start + i * stride + element), i * element);
    return out;
}

function baseColorBytes(json, bin) {
    return (json.materials || []).map(material => {
        const pbr = material.pbrMetallicRoughness || {}, specgloss = material.extensions && material.extensions.KHR_materials_pbrSpecularGlossiness;
        const info = pbr.baseColorTexture || (specgloss && specgloss.diffuseTexture);
        const texture = info && json.textures[info.index];
        if (!texture) return null;
        const image = json.images[texture.source];
        if (!image) return null;
        if (image.uri) return 'uri:' + image.uri;
        const view = json.bufferViews[image.bufferView];
        return Buffer.from(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)).toString('base64') + '|' + (image.mimeType || '');
    });
}

/** Problems found comparing the rewritten file with its original; empty when only the dropped pictures differ. */
function verify(before, after) {
    const a = readGlb(before), b = readGlb(after), problems = [];
    const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    if (!same(baseColorBytes(a.json, a.bin), baseColorBytes(b.json, b.bin))) problems.push('a base color picture differs');
    if ((a.json.accessors || []).length !== (b.json.accessors || []).length) problems.push('accessor count differs');
    else (a.json.accessors || []).forEach((accessor, i) => {
        const { bufferView: v1, ...rest1 } = accessor, { bufferView: v2, ...rest2 } = b.json.accessors[i];
        if (!same(rest1, rest2)) problems.push('accessor ' + i + ' definition differs');
        if (!accessorBytes(a.json, a.bin, i).equals(accessorBytes(b.json, b.bin, i))) problems.push('accessor ' + i + ' bytes differ');
    });
    for (const key of ['meshes', 'nodes', 'skins', 'animations', 'scenes', 'scene', 'samplers', 'asset', 'extensionsUsed', 'extensionsRequired']) {
        if (!same(a.json[key], b.json[key])) problems.push(key + ' differ');
    }
    // Materials: only texture slots (and an emissive map's factor) may have gone.
    const strip = material => JSON.parse(JSON.stringify(material, (key, value) => (/Texture$/.test(key) || key === 'emissiveFactor' ? undefined : value)));
    if (!same((a.json.materials || []).map(strip), (b.json.materials || []).map(strip))) problems.push('materials differ beyond their texture slots');
    for (const view of b.json.bufferViews || []) if ((view.byteOffset || 0) + view.byteLength > b.bin.length) problems.push('a view runs past the binary chunk');
    return problems;
}

function main() {
    const args = process.argv.slice(2);
    const write = args.includes('--write'), outArg = args.find(a => a.startsWith('--out='));
    const out = outArg ? path.resolve(outArg.slice(6)) : null;
    const files = [];
    const collect = p => {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) for (const name of fs.readdirSync(p).sort()) collect(path.join(p, name));
        else if (/\.glb$/i.test(p) && !/\.lod\d+\.glb$/i.test(p)) files.push(p);
    };
    for (const arg of args.filter(a => !a.startsWith('--'))) collect(path.resolve(arg));
    let before = 0, after = 0, failed = 0;
    for (const file of files) {
        const bytes = new Uint8Array(fs.readFileSync(file));
        let result;
        try { result = dropUnsampled(bytes); } catch (error) { console.log(`skip  ${file}: ${error.message}`); continue; }
        if (!result) continue;
        const problems = verify(bytes, result.bytes);
        if (problems.length) { failed++; console.log(`FAIL  ${file}: ${problems.join('; ')}`); continue; }
        before += bytes.length; after += result.bytes.length;
        console.log(`${(bytes.length / 1048576).toFixed(2).padStart(7)} MB -> ${(result.bytes.length / 1048576).toFixed(2).padStart(7)} MB  ${result.images} picture(s), slots: ${result.removed.join(', ') || 'none'}  ${file}`);
        if (out) { const target = path.join(out, path.basename(file)); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(target, result.bytes); }
        else if (write) fs.writeFileSync(file, result.bytes);
    }
    console.log(`${files.length} file(s) read; ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB${failed ? `; ${failed} failed the check and were left alone` : ''}${write || out ? '' : ' (nothing written: pass --write or --out=<dir>)'}`);
    if (failed) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { dropUnsampled, verify, readGlb };
