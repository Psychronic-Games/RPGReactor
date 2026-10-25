#!/usr/bin/env node
/**
 * Builds the Character Builder's modeled clothes from MakeHuman CC0 garments.
 *
 *   node editor/build-scripts/build-clothes-pack.cjs <garments folder>
 *
 * The folder holds one subfolder per garment, named by its id in GARMENTS
 * below, with the asset's files as downloaded (.mhclo, .obj, .mhmat, the
 * diffuse picture). Writes src/forge/Character3D/data/clothes.json (layout,
 * credits), clothes.bin (meshes and bindings) and clothes/<id>.png (each
 * garment's picture), plus clothes/LICENSE.md.
 *
 * Kept per garment: its mesh (quads split into triangles, vertices split at
 * UV seams), every vertex's binding to three base-mesh vertices (weights and
 * offset, as MakeHuman fits it), the base vertex nearest each vertex on the
 * average body, the body vertices it hides (its delete_verts and the skin
 * it covers), which color region each vertex is in, and its
 * diffuse picture scaled down. The pack (human.json/.bin) must be built first.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
    console.error('usage: build-clothes-pack.cjs <garments folder>');
    process.exit(1);
}
const OUT = path.join(__dirname, '..', 'src', 'forge', 'Character3D', 'data');
const UNIT = 0.1; // MakeHuman works in decimeters.

const SYSTEM = {
    author: 'MakeHuman team (Data Collection AB, Joel Palmius, Jonas Hauquier)', license: 'CC0 1.0',
    url: 'https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip'
};
const community = (author, page) => ({ author, license: 'CC0 1.0', url: 'http://www.makehumancommunity.org/clothes/' + page + '.html' });

/**
 * Each garment: its source and credit, its picture's size, and how its parts
 * split into the two color regions (0 takes the item's color, 1 its second
 * color): 'height' puts the parts lying mostly below `split` meters on the
 * base mesh (its origin at the hips) in region 1, 'none' keeps one region.
 */
const GARMENTS = {
    mh_tee_jeans: { title: 'male_casualsuit06', ...SYSTEM, size: 1024, regions: 'height', split: 0 },
    mh_fitted_jeans: { title: 'female_casualsuit01', ...SYSTEM, size: 1024, regions: 'height', split: 0 },
    mh_tee_shorts: { title: 'female_casualsuit02', ...SYSTEM, size: 1024, regions: 'height', split: 0.2 },
    mh_jacket_jeans: { title: 'male_casualsuit05', ...SYSTEM, size: 1024, regions: 'height', split: 0 },
    mh_sport: { title: 'female_sportsuit01', ...SYSTEM, size: 1024, regions: 'height', split: 0 },
    mh_overalls: { title: 'male_worksuit01', ...SYSTEM, size: 1024, regions: 'none' },
    mh_suit: { title: 'male_elegantsuit01', ...SYSTEM, size: 1024, regions: 'none' },
    mh_skirtsuit: { title: 'female_elegantsuit01', ...SYSTEM, size: 1024, regions: 'height', split: 0 },
    mh_loafers: { title: 'shoes01', ...SYSTEM, size: 512, regions: 'height', split: -0.74, low: 0 },
    mh_sneakers: { title: 'shoes05', ...SYSTEM, size: 512, regions: 'height', split: -0.74, low: 0 },
    mh_boots: { title: 'shoes03', ...SYSTEM, size: 512, regions: 'none' },
    mh_sweater: { title: 'Fisherman Sweater', ...community('MargaretToigo (MRT)', 'fisherman_sweater'), size: 512, regions: 'none' },
    mh_sundress: { title: 'Camisole Dress with Full Skirt', ...community('MargaretToigo (MRT)', 'camisole_dress_with_full_skirt'), size: 512, regions: 'none' },
    mh_viking_tunic: { title: 'Tunic Viking', ...community('Rehman Polanski', 'tunic_viking'), size: 1024, regions: 'none' },
    mh_viking_trousers: { title: 'Pants Viking', ...community('Rehman Polanski', 'pants_viking'), size: 512, regions: 'none' },
    mh_viking_boots: { title: 'Boots Viking', ...community('Rehman Polanski', 'boots_viking'), size: 512, regions: 'none' },
    mh_uniform: { title: 'Galactic Warrior Uniform', ...community('TheGreatEngineer', 'galactic_warrior_uniform'), size: 1024, regions: 'none' }
};

// ── the body pack ──────────────────────────────────────────────────────────
const Body = require('../src/forge/Character3D/HumanBody.js');
const packJson = JSON.parse(fs.readFileSync(path.join(OUT, 'human.json'), 'utf8'));
const pack = Body.openPack(packJson, fs.readFileSync(path.join(OUT, 'human.bin')));
const R = pack.positions;
const bodyIds = [...new Set(pack.body.source)];
const isBody = new Uint8Array(pack.vertexCount);
for (const v of bodyIds) isBody[v] = 1;
const restNormals = Body.vertexNormals(pack, R);

function grid(cell) {
    const map = new Map();
    const key = (x, y, z) => x + ',' + y + ',' + z;
    return {
        add(x, y, z, item) { const k = key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)); let l = map.get(k); if (!l) map.set(k, l = []); l.push(item); },
        near(x, y, z, r = 1) {
            const out = [];
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
            for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) { const l = map.get(key(cx + i, cy + j, cz + k)); if (l) out.push(...l); }
            return out;
        },
        cell: (x, y, z) => map.get(key(Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell))) || []
    };
}
const bodyGrid = grid(0.03);
for (const v of bodyIds) bodyGrid.add(R[v * 3], R[v * 3 + 1], R[v * 3 + 2], v);
function nearestBody(x, y, z) {
    for (let r = 1; r < 12; r++) {
        let best = -1, bd = Infinity;
        for (const v of bodyGrid.near(x, y, z, r)) {
            const d = (R[v * 3] - x) ** 2 + (R[v * 3 + 1] - y) ** 2 + (R[v * 3 + 2] - z) ** 2;
            if (d < bd) { bd = d; best = v; }
        }
        if (best >= 0) return best;
    }
    return bodyIds[0];
}
// Each body vertex's neighbors over the body faces.
const bodyNeighbors = new Map();
{
    const s = pack.body.source, I = pack.body.index;
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
        const a = s[I[t + k]], b = s[I[t + (k + 1) % 3]];
        if (!bodyNeighbors.has(a)) bodyNeighbors.set(a, new Set());
        if (!bodyNeighbors.has(b)) bodyNeighbors.set(b, new Set());
        bodyNeighbors.get(a).add(b); bodyNeighbors.get(b).add(a);
    }
}

// ── MakeHuman files ────────────────────────────────────────────────────────
function readMhclo(file) {
    const meta = { scale: {}, zDepth: 50 }, refs = [], weights = [], offsets = [], deleted = [];
    let mode = '';
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
        const line = raw.trim();
        if (!line || line[0] === '#') continue;
        const p = line.split(/\s+/);
        if (p[0] === 'verts') { mode = 'verts'; continue; }
        if (p[0] === 'delete_verts') { mode = 'delete'; continue; }
        if (mode === 'verts' && /^-?\d/.test(p[0])) {
            if (p.length === 1) { refs.push(+p[0], +p[0], +p[0]); weights.push(1, 0, 0); offsets.push(0, 0, 0); continue; }
            if (p.length >= 9) { refs.push(+p[0], +p[1], +p[2]); weights.push(+p[3], +p[4], +p[5]); offsets.push(+p[6], +p[7], +p[8]); continue; }
        }
        if (mode === 'delete' && /^\d/.test(p[0])) {
            for (let i = 0; i < p.length; i++) {
                if (p[i + 1] === '-') { for (let v = +p[i]; v <= +p[i + 2]; v++) deleted.push(v); i += 2; }
                else deleted.push(+p[i]);
            }
            continue;
        }
        if (/^[xyz]_scale$/.test(p[0])) meta.scale[p[0][0]] = [+p[1], +p[2], +p[3] * UNIT];
        else if (p[0] === 'obj_file') meta.obj = p[1];
        else if (p[0] === 'material') meta.material = p[1];
        else if (p[0] === 'z_depth') meta.zDepth = +p[1];
    }
    return { meta, refs, weights, offsets, deleted };
}

function readObj(file) {
    const positions = [], uvs = [], faces = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (line.startsWith('v ')) { const p = line.trim().split(/\s+/); positions.push(+p[1], +p[2], +p[3]); }
        else if (line.startsWith('vt ')) { const p = line.trim().split(/\s+/); uvs.push(+p[1], +p[2]); }
        else if (line.startsWith('f ')) faces.push(line.trim().split(/\s+/).slice(1).map(c => { const [v, t] = c.split('/'); return [+v - 1, t ? +t - 1 : -1]; }));
    }
    return { positions, uvs, faces };
}

function readMhmat(file) {
    const out = {};
    for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
        const p = raw.trim().split(/\s+/);
        if (p[0] === 'diffuseTexture') out.diffuse = p.slice(1).join(' ');
        if (p[0] === 'backfaceCull') out.backfaceCull = p[1] === 'True';
    }
    return out;
}

/** Vertices split at UV seams; faces as triangles. */
function renderMesh(obj) {
    const key = new Map(), src = [], uv = [], index = [];
    const at = ([v, t]) => {
        const k = v * 1048576 + (t + 1);
        let i = key.get(k);
        if (i === undefined) { i = src.length; key.set(k, i); src.push(v); uv.push(t >= 0 ? obj.uvs[t * 2] : 0, t >= 0 ? 1 - obj.uvs[t * 2 + 1] : 0); }
        return i;
    };
    for (const face of obj.faces) {
        const ids = face.map(at);
        for (let k = 1; k + 1 < ids.length; k++) index.push(ids[0], ids[k], ids[k + 1]);
    }
    return { src, uv, index };
}

// ── pictures ───────────────────────────────────────────────────────────────
function readPicture(file) {
    const png = PNG.sync.read(fs.readFileSync(file));
    return { width: png.width, height: png.height, data: png.data };
}
/** Box-filtered down to `size` (a power of two no larger than the picture). */
function shrink(pic, size) {
    let { width, height, data } = pic;
    while (width > size || height > size) {
        const w = Math.max(1, width >> 1), h = Math.max(1, height >> 1), out = Buffer.alloc(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
            let s = 0;
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += data[((Math.min(height - 1, y * 2 + dy)) * width + Math.min(width - 1, x * 2 + dx)) * 4 + c];
            out[(y * w + x) * 4 + c] = (s + 2) >> 2;
        }
        width = w; height = h; data = out;
    }
    return { width, height, data };
}
const toLinear = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

/** Every texel a triangle covers (with a texel of margin), as region + 1 in `mask`. */
function rasterUV(uv, index, region, size) {
    const mask = new Uint8Array(size * size);
    for (let t = 0; t < index.length; t += 3) {
        const px = [], py = [];
        for (let k = 0; k < 3; k++) { px.push(uv[index[t + k] * 2] * size); py.push(uv[index[t + k] * 2 + 1] * size); }
        const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
        const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(...px)) + 1);
        const y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(...py)) + 1);
        const r = region[index[t]] + 1;
        if (Math.abs(area) < 1e-9) continue;
        const tol = -1.5 / Math.sqrt(Math.abs(area));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const cx = x + 0.5, cy = y + 0.5;
            const w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area;
            const w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
            if (w0 < tol || w1 < tol || 1 - w0 - w1 < tol) continue;
            mask[y * size + x] = r;
        }
    }
    return mask;
}

/** A mask grown by `r` texels. */
function dilate(mask, size, r) {
    let a = Uint8Array.from(mask, x => (x ? 1 : 0));
    for (let k = 0; k < r; k++) {
        const b = Uint8Array.from(a);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            if (a[y * size + x]) continue;
            if ((x > 0 && a[y * size + x - 1]) || (x < size - 1 && a[y * size + x + 1]) || (y > 0 && a[(y - 1) * size + x]) || (y < size - 1 && a[(y + 1) * size + x])) b[y * size + x] = 1;
        }
        a = b;
    }
    return a;
}

// ── fitting on the average body ────────────────────────────────────────────
function fitRest(fitting) {
    const scale = axis => {
        const [a, b, dist] = fitting.meta.scale[axis] || [0, 0, 0];
        const k = 'xyz'.indexOf(axis);
        return dist ? Math.abs(R[a * 3 + k] - R[b * 3 + k]) / dist : 1;
    };
    const s = [scale('x'), scale('y'), scale('z')];
    const n = fitting.refs.length / 3, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) {
            const v = fitting.refs[i * 3 + k], w = fitting.weights[i * 3 + k];
            for (let c = 0; c < 3; c++) out[i * 3 + c] += R[v * 3 + c] * w;
        }
        for (let c = 0; c < 3; c++) out[i * 3 + c] += fitting.offsets[i * 3 + c] * UNIT * s[c];
    }
    return out;
}

/** The body vertices a garment covers: skin whose outward normal meets the garment within a few centimeters. */
function coveredSkin(G, index, src) {
    const tris = grid(0.02);
    for (let t = 0; t < index.length; t += 3) {
        const a = src[index[t]] * 3, b = src[index[t + 1]] * 3, c = src[index[t + 2]] * 3;
        const cx = (G[a] + G[b] + G[c]) / 3, cy = (G[a + 1] + G[b + 1] + G[c + 1]) / 3, cz = (G[a + 2] + G[b + 2] + G[c + 2]) / 3;
        tris.add(cx, cy, cz, t);
    }
    const hit = (o, d, t) => {
        const A = src[index[t]] * 3, B = src[index[t + 1]] * 3, C = src[index[t + 2]] * 3;
        const e1 = [G[B] - G[A], G[B + 1] - G[A + 1], G[B + 2] - G[A + 2]], e2 = [G[C] - G[A], G[C + 1] - G[A + 1], G[C + 2] - G[A + 2]];
        const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
        const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
        if (Math.abs(det) < 1e-12) return Infinity;
        const s = [o[0] - G[A], o[1] - G[A + 1], o[2] - G[A + 2]];
        const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
        if (u < 0 || u > 1) return Infinity;
        const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
        const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
        if (v < 0 || u + v > 1) return Infinity;
        return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    };
    const covered = new Set();
    for (const v of bodyIds) {
        const n = [restNormals[v * 3], restNormals[v * 3 + 1], restNormals[v * 3 + 2]];
        const o = [R[v * 3] - n[0] * 0.002, R[v * 3 + 1] - n[1] * 0.002, R[v * 3 + 2] - n[2] * 0.002];
        const seen = new Set();
        for (let s = 0; s <= 0.06 && !covered.has(v); s += 0.01) {
            for (const t of tris.near(o[0] + n[0] * s, o[1] + n[1] * s, o[2] + n[2] * s, 1)) {
                if (seen.has(t)) continue;
                seen.add(t);
                const d = hit(o, n, t);
                if (d >= 0 && d < 0.06) { covered.add(v); break; }
            }
        }
    }
    // One ring in from the garment's edges stays drawn.
    return [...covered].filter(v => [...(bodyNeighbors.get(v) || [])].every(u => covered.has(u)));
}

/** Connected parts of a mesh (by shared source vertices): each render vertex's part. */
function parts(src, index, count) {
    const parent = Int32Array.from({ length: count }, (_, i) => i);
    const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let t = 0; t < index.length; t += 3) for (let k = 1; k < 3; k++) {
        const a = find(src[index[t]]), b = find(src[index[t + k]]);
        if (a !== b) parent[a] = b;
    }
    return src.map(v => find(v));
}

// ── build ──────────────────────────────────────────────────────────────────
const chunks = [];
let offset = 0;
const put = (typed) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    const at = offset;
    chunks.push(bytes); offset += bytes.length;
    return [at, typed.length];
};

fs.mkdirSync(path.join(OUT, 'clothes'), { recursive: true });
const garments = {};
const credits = [];
for (const [id, cfg] of Object.entries(GARMENTS)) {
    const dir = path.join(SRC, id);
    const mhclo = fs.readdirSync(dir).find(f => f.endsWith('.mhclo'));
    if (!mhclo) { console.warn('missing', id); continue; }
    const fitting = readMhclo(path.join(dir, mhclo));
    const obj = readObj(path.join(dir, fitting.meta.obj));
    const mat = readMhmat(path.join(dir, fitting.meta.material));
    const count = obj.positions.length / 3;
    if (fitting.refs.length / 3 !== count) throw new Error(`${id}: ${fitting.refs.length / 3} bindings for ${count} vertices`);
    const mesh = renderMesh(obj);
    // Picture coordinates wrapped into the picture, per triangle so none is torn across the wrap.
    let wrapped = 0;
    for (let i = 0; i < mesh.uv.length; i++) if (mesh.uv[i] < -1e-4 || mesh.uv[i] > 1 + 1e-4) wrapped++;
    if (wrapped) console.warn(`${id}: ${wrapped} picture coordinates outside the picture, clamped`);
    const G = fitRest(fitting);
    const anchor = new Uint16Array(count);
    for (let i = 0; i < count; i++) anchor[i] = nearestBody(G[i * 3], G[i * 3 + 1], G[i * 3 + 2]);

    // Regions: whole connected parts, by where they hang on the body.
    const part = parts(mesh.src, mesh.index, count);
    const stats = new Map();
    mesh.src.forEach((v, i) => { const s = stats.get(part[i]) || { n: 0, y: 0 }; s.n++; s.y += G[v * 3 + 1]; stats.set(part[i], s); });
    const region = new Uint8Array(mesh.src.length);
    if (cfg.regions === 'height') {
        const lower = new Set([...stats].filter(([, s]) => s.y / s.n < cfg.split).map(([k]) => k));
        // `low: 0`: the parts low on the body take the main color (a shoe below its sock).
        mesh.src.forEach((v, i) => { const low = lower.has(part[i]); region[i] = cfg.low === 0 ? (low ? 0 : 1) : (low ? 1 : 0); });
    }
    console.log(id, 'parts', [...stats.values()].map(s => `${s.n}@${(s.y / s.n).toFixed(2)}`).join(' '));

    // Hidden skin: the author's delete_verts and the skin the garment covers (a body far from the average one
    // swells into places the author left drawn).
    const authored = fitting.deleted.filter(v => v < pack.vertexCount && isBody[v]);
    const hidden = [...new Set(authored.concat(coveredSkin(G, mesh.index, mesh.src)))];

    // The picture.
    const pic = shrink(readPicture(path.join(dir, mat.diffuse)), cfg.size);
    const size = pic.width;
    const mask = rasterUV(mesh.uv.map(x => Math.max(0, Math.min(1, x))), mesh.index, region, size);
    let transparent = 0, used = 0;
    const lum = [0, 0], lumN = [0, 0];
    for (let i = 0; i < size * size; i++) {
        if (!mask[i]) continue;
        used++;
        if (pic.data[i * 4 + 3] < 128) transparent++;
        const r = mask[i] - 1;
        lum[r] += 0.2126 * toLinear(pic.data[i * 4]) + 0.7152 * toLinear(pic.data[i * 4 + 1]) + 0.0722 * toLinear(pic.data[i * 4 + 2]);
        lumN[r]++;
    }
    const cutout = transparent / Math.max(1, used) > 0.01;
    if (!cutout) for (let i = 0; i < size * size; i++) pic.data[i * 4 + 3] = 255;
    // Texels no triangle samples (a few past each edge kept, for the smaller mip levels) are one flat color.
    const keep = dilate(mask, size, Math.max(2, size >> 7));
    const mean = [0, 0, 0];
    for (let i = 0; i < size * size; i++) if (mask[i]) for (let c = 0; c < 3; c++) mean[c] += pic.data[i * 4 + c];
    for (let i = 0; i < size * size; i++) if (!keep[i]) for (let c = 0; c < 3; c++) pic.data[i * 4 + c] = Math.round(mean[c] / Math.max(1, used));
    const png = PNG.sync.write({ width: size, height: size, data: pic.data }, { colorType: cutout ? 6 : 2, deflateLevel: 9 });
    const texture = `clothes/${id}.png`;
    fs.writeFileSync(path.join(OUT, texture), png);

    // Weights and offsets in fixed point, each scaled to its largest (weights may run past 0..1).
    let maxOffset = 0, maxWeight = 0;
    for (const x of fitting.offsets) maxOffset = Math.max(maxOffset, Math.abs(x * UNIT));
    for (const w of fitting.weights) maxWeight = Math.max(maxWeight, Math.abs(w));
    const offsetScale = (maxOffset || 1) / 32767, weightScale = (maxWeight || 1) / 32767;
    garments[id] = {
        vertexCount: count, triangles: mesh.index.length / 3, zDepth: fitting.meta.zDepth, cutout, size,
        scale: fitting.meta.scale, offsetScale, weightScale,
        luminance: [0, 1].map(r => (lumN[r] ? lum[r] / lumN[r] : null)),
        regions: lumN[1] ? 2 : 1, texture, hidesAuthored: authored.length,
        layout: {
            refs: put(Uint16Array.from(fitting.refs)),
            weights: put(Int16Array.from(fitting.weights, w => Math.round(w / weightScale))),
            offsets: put(Int16Array.from(fitting.offsets, x => Math.round(x * UNIT / offsetScale))),
            anchor: put(anchor),
            source: put(Uint16Array.from(mesh.src)),
            uv: put(Uint16Array.from(mesh.uv, x => Math.round(Math.max(0, Math.min(1, x)) * 65535))),
            index: put(Uint16Array.from(mesh.index)),
            region: put(region),
            hidden: put(Uint16Array.from(hidden.sort((a, b) => a - b)))
        },
        credit: { title: cfg.title, author: cfg.author, license: cfg.license, url: cfg.url }
    };
    credits.push(`- **${id}**: "${cfg.title}" by ${cfg.author}, ${cfg.license}. ${cfg.url}`);
    console.log(`${id}: ${count} vertices, ${mesh.index.length / 3} triangles, ${hidden.length} hidden (${authored.length} by the author), picture ${size}${cutout ? ' cut out' : ''} ${(png.length / 1024).toFixed(0)} KB, regions ${garments[id].regions}`);
}

fs.writeFileSync(path.join(OUT, 'clothes.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'clothes.json'), JSON.stringify({
    format: 1,
    source: 'MakeHuman CC0 garments (makehumancommunity.org), fitted to the hm08 base mesh',
    garments
}));
fs.writeFileSync(path.join(OUT, 'clothes', 'LICENSE.md'), `# Modeled clothes

Every garment here is a MakeHuman asset released under CC0 1.0 (public domain,
https://creativecommons.org/publicdomain/zero/1.0/), converted for the
Character Builder by editor/build-scripts/build-clothes-pack.cjs: its mesh,
its fitting to the base mesh and its diffuse picture, scaled down.

${credits.join('\n')}
`);
console.log(`garments ${Object.keys(garments).length}, bin ${(offset / 1048576).toFixed(2)} MB`);
