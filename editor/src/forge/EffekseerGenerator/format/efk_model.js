// ─────────────────────────────────────────────────────────────────────────
// efk_model.js — reader/writer for Effekseer .efkmodel meshes, plus the
// procedural geometry the Geometric recipes are built from.
//
// Format v3 (single frame — what every stock MZ model uses, verified
// byte-exact against Ball/Skull/Shield/NightHand*.efkmodel):
//   int32 version = 3
//   int32 modelCount = 1
//   int32 vertexCount
//   vertexCount × 60 bytes:
//     vec3 position, vec3 normal, vec3 binormal, vec3 tangent,
//     vec2 uv, rgba8 color
//   int32 faceCount
//   faceCount × { int32 i0, i1, i2 }
//   float scale                (trailing; ignored by the 1.7 loader)
//
// Format v5 (multi-frame vertex animation):
//   int32 version = 5
//   float scale                (skipped by the loader)
//   int32 modelCount = 1
//   int32 frameCount
//   frameCount × { int32 vertexCount, vertices…, int32 faceCount, faces… }
//
// The renderer picks frame = instance living time % frameCount
// (ModelRendererBase.h: times_[i] % GetFrameCount()) — so multi-frame
// models auto-play at 60fps and loop. This is how the 4D shapes
// (hypercube, pentachoron) get their genuine 4D rotation: the rotation is
// baked as one model frame per game frame over a seamless loop.
//
// Geometry kinds:
//   • polytope3 — static 3D edge frames (cube, pyramid, …)
//   • polytope4 — 4D vertices rotated in two planes per frame, then
//     perspective-projected to 3D (w-divide) — the AG hypercube math
//   • surface  — parametric grid (sphere, torus, …): 'wire' style builds
//     struts from grid lines, 'solid' builds the textured quad mesh
//   • curve    — polyline struts (double helix)
//
// Every buildGeometry() result also carries spawnVertices — the shape's
// "true" corners/sample points — so spark emitters can spawn exactly on
// the structure via a spawn-only companion model (VERTEX_RANDOM), not on
// strut-quad corners (which looked like random floating specks).
//
// Runs in BOTH Node (tests) and the browser. No Node-only APIs.
// ─────────────────────────────────────────────────────────────────────────

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) module.exports = factory();
    else root.RR_EfkModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const VERTEX_BYTES = 60;

// ── Binary I/O ───────────────────────────────────────────────────────────

function frameBytes(frame) {
    return 4 + frame.vertices.length * VERTEX_BYTES + 4 + frame.faces.length * 12;
}

function writeFrame(view, buf, o, frame) {
    const i32 = (v) => { view.setInt32(o, v, true); o += 4; };
    const f32 = (v) => { view.setFloat32(o, v, true); o += 4; };
    i32(frame.vertices.length);
    for (const v of frame.vertices) {
        const n = v.n || [0, 1, 0];
        const bin = v.bin || [n[1], n[2], n[0]];
        const tan = v.tan || [n[2], n[0], n[1]];
        f32(v.p[0]); f32(v.p[1]); f32(v.p[2]);
        f32(n[0]); f32(n[1]); f32(n[2]);
        f32(bin[0]); f32(bin[1]); f32(bin[2]);
        f32(tan[0]); f32(tan[1]); f32(tan[2]);
        f32(v.uv ? v.uv[0] : 0); f32(v.uv ? v.uv[1] : 0);
        const c = v.c || [255, 255, 255, 255];   // optional per-vertex tint
        buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = c[3];
        o += 4;
    }
    i32(frame.faces.length);
    for (const f of frame.faces) { i32(f[0]); i32(f[1]); i32(f[2]); }
    return o;
}

/**
 * @param {object} mesh single-frame: { vertices, faces, scale? } or
 *                      multi-frame:  { frames: [{vertices, faces}...], scale? }
 * @returns {Uint8Array} .efkmodel bytes (v3 single frame, v5 multi-frame)
 */
function writeEfkmodel(mesh) {
    const frames = mesh.frames || [{ vertices: mesh.vertices, faces: mesh.faces }];
    const multi = frames.length > 1;
    // v3 header: version+modelCount (8) … + trailing scale (4)
    // v5 header: version+scale+modelCount+frameCount (16)
    const size = (multi ? 16 : 8) + frames.reduce((s, f) => s + frameBytes(f), 0) + (multi ? 0 : 4);
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let o = 0;
    const i32 = (v) => { view.setInt32(o, v, true); o += 4; };
    const f32 = (v) => { view.setFloat32(o, v, true); o += 4; };

    if (multi) {
        i32(5);                     // version
        f32(mesh.scale ?? 1);       // scale (loader skips it)
        i32(1);                     // modelCount
        i32(frames.length);         // frameCount
        for (const f of frames) o = writeFrame(view, buf, o, f);
    } else {
        i32(3);
        i32(1);
        o = writeFrame(view, buf, o, frames[0]);
        f32(mesh.scale ?? 1);       // trailing scale, stock v3 convention
    }
    return buf;
}

/** Strict parser (v3 and v5) for validation/tests. */
function parseEfkmodel(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const i32 = () => { const v = view.getInt32(o, true); o += 4; return v; };
    const f32 = () => { const v = view.getFloat32(o, true); o += 4; return v; };
    const version = i32();
    if (version !== 3 && version !== 5) throw new Error(`efk_model: unsupported version ${version}`);
    let scale = 1;
    if (version === 5) scale = f32();
    const modelCount = i32();
    const frameCount = version >= 5 ? i32() : 1;
    const frames = [];
    for (let f = 0; f < frameCount; f++) {
        const vertexCount = i32();
        const vertices = [];
        for (let i = 0; i < vertexCount; i++) {
            vertices.push({
                p: [f32(), f32(), f32()],
                n: [f32(), f32(), f32()],
                bin: [f32(), f32(), f32()],
                tan: [f32(), f32(), f32()],
                uv: [f32(), f32()],
                color: [bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]],
            });
            o += 4;
        }
        const faceCount = i32();
        const faces = [];
        for (let i = 0; i < faceCount; i++) faces.push([i32(), i32(), i32()]);
        frames.push({ vertices, faces });
    }
    if (version === 3 && o + 4 <= bytes.byteLength) scale = f32();
    if (o !== bytes.byteLength) throw new Error(`efk_model: ${bytes.byteLength - o} unparsed bytes`);
    return { version, modelCount, frames, vertices: frames[0].vertices, faces: frames[0].faces, scale };
}

// ── Vector helpers ───────────────────────────────────────────────────────

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
};

const PHI = (1 + Math.sqrt(5)) / 2;

// ── Edge list → crossed-quad strut frame ─────────────────────────────────
// Each edge becomes 2 crossed quads (X cross-section). UV.v runs 0→1
// along the edge so streak/scroll textures flow along struts.

function strutFrame(pts, edges, thickness) {
    const vertices = [];
    const faces = [];
    for (const [ai, bi] of edges) {
        const a = pts[ai], b = pts[bi];
        const d = norm(sub(b, a));
        const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u = norm(cross(d, ref));
        const w = norm(cross(d, u));
        for (const axis of [u, w]) {
            const off = mul(axis, thickness);
            const base = vertices.length;
            vertices.push(
                { p: sub(a, off), n: axis, uv: [0, 0] },
                { p: add(a, off), n: axis, uv: [1, 0] },
                { p: add(b, off), n: axis, uv: [1, 1] },
                { p: sub(b, off), n: axis, uv: [0, 1] },
            );
            faces.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
        }
    }
    return { vertices, faces };
}

// ── 3D polytopes ─────────────────────────────────────────────────────────

function cubeVerts(s) {
    const v = [];
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) v.push([x, y, z]);
    return v;
}
const CUBE_EDGES = (() => {
    const e = [];
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
        const d = a ^ b;
        if (d === 1 || d === 2 || d === 4) e.push([a, b]);
    }
    return e;
})();

// Edges of a convex vertex set = all pairs at the minimal pair distance.
function minDistEdges(pts) {
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    let min = Infinity;
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) min = Math.min(min, d2(pts[a], pts[b]));
    const edges = [];
    for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
        if (d2(pts[a], pts[b]) < min * 1.02) edges.push([a, b]);
    }
    return edges;
}

function icosahedronVerts() {
    const v = [];
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        v.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
    }
    return v.map(p => p.map(c => c / PHI));
}

function dodecahedronVerts() {
    const v = [...cubeVerts(1)];
    for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        v.push([0, s1 / PHI, s2 * PHI], [s1 / PHI, s2 * PHI, 0], [s2 * PHI, 0, s1 / PHI]);
    }
    return v.map(p => p.map(c => c / Math.sqrt(3)));
}

// facePolys: polygon vertex loops (used by the Solid style; triangulated
// by fan with spherical UVs). Computed where the polytope's structure
// makes it cheap: for octahedron/icosahedron/merkaba every mutually-
// adjacent vertex triple IS a face; dodecahedron pentagons are recovered
// from its dual (each icosahedron vertex direction owns one pentagon).
function adjacentTriples(verts, edges) {
    const adj = new Set(edges.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
    const has = (a, b) => adj.has(`${Math.min(a, b)},${Math.max(a, b)}`);
    const faces = [];
    for (let a = 0; a < verts.length; a++)
        for (let b = a + 1; b < verts.length; b++)
            for (let c = b + 1; c < verts.length; c++)
                if (has(a, b) && has(b, c) && has(a, c)) faces.push([a, b, c]);
    return faces;
}

function dodecaPentagons(verts) {
    const dirs = icosahedronVerts().map(norm);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return dirs.map(d => {
        // The 5 vertices closest to this face direction form the pentagon.
        const ring = verts.map((p, i) => ({ i, d: dot(norm(p), d) }))
            .sort((x, y) => y.d - x.d).slice(0, 5).map(x => x.i);
        // Order them around the face center.
        const ref = norm(sub(verts[ring[0]], mul(d, dot(verts[ring[0]], d))));
        const up = cross(d, ref);
        ring.sort((a, b) => {
            const ang = (i) => {
                const q = sub(verts[i], mul(d, dot(verts[i], d)));
                return Math.atan2(dot(q, up), dot(q, ref));
            };
            return ang(a) - ang(b);
        });
        return ring;
    });
}

const POLYTOPES_3D = {
    cube: () => ({
        verts: cubeVerts(1),
        edges: CUBE_EDGES,
        // bit order: index = x*4 + y*2 + z
        facePolys: [
            [0, 1, 3, 2], [4, 6, 7, 5],   // x-, x+
            [0, 4, 5, 1], [2, 3, 7, 6],   // y-, y+
            [0, 2, 6, 4], [1, 5, 7, 3],   // z-, z+
        ],
    }),
    pyramid: () => ({
        verts: [[-1, -0.7, -1], [1, -0.7, -1], [1, -0.7, 1], [-1, -0.7, 1], [0, 1.1, 0]],
        edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]],
        facePolys: [[3, 2, 1, 0], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
    }),
    octahedron: () => {
        const verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        const edges = minDistEdges(verts);
        return { verts, edges, facePolys: adjacentTriples(verts, edges) };
    },
    merkaba: () => {
        const t1 = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(p => mul(p, 1 / Math.sqrt(3)));
        const t2 = t1.map(p => mul(p, -1));
        const tetraEdges = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
        const tetraFaces = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
        return {
            verts: [...t1, ...t2],
            edges: [...tetraEdges, ...tetraEdges.map(([a, b]) => [a + 4, b + 4])],
            facePolys: [...tetraFaces, ...tetraFaces.map(f => f.map(i => i + 4))],
        };
    },
    icosahedron: () => {
        const verts = icosahedronVerts();
        const edges = minDistEdges(verts);
        return { verts, edges, facePolys: adjacentTriples(verts, edges) };
    },
    dodecahedron: () => {
        const verts = dodecahedronVerts();
        return { verts, edges: minDistEdges(verts), facePolys: dodecaPentagons(verts) };
    },
};

// Solid polytope mesh: fan-triangulated faces, per-face vertices (flat
// shading), spherical UVs (texture wraps the shape like a globe — same
// visual convention as the AG's textured shapes). Seam-crossing faces get
// their low-u vertices shifted +1 so the texture doesn't smear.
function solidPolytopeFrame(verts, facePolys, orientOutward = false) {
    const vertices = [];
    const faces = [];
    const sphericalUV = (p) => {
        const n = norm(p);
        // Calibrated against the earth-textured sphere under the default
        // category Y-flip: V reads unmirrored, U keeps the mirrored sense
        // (user-verified on the icosahedron — the flat-shaded face path
        // reads longitude opposite to the smooth surface grid).
        return [0.5 - Math.atan2(n[2], n[0]) / (Math.PI * 2), Math.acos(Math.max(-1, Math.min(1, n[1]))) / Math.PI];
    };
    for (const poly of facePolys) {
        let pts = poly.map(i => verts[i]);
        let n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
        // Convex origin-centered polytopes: faces listed in arbitrary
        // order (adjacentTriples etc.) wind half inward — culling then
        // eats them as the shape spins. Flip any face whose normal
        // points at the centroid.
        if (orientOutward) {
            const c = pts.reduce((a, q) => [a[0] + q[0], a[1] + q[1], a[2] + q[2]], [0, 0, 0]).map((x) => x / pts.length);
            if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) {
                pts = pts.slice().reverse();
                n = [-n[0], -n[1], -n[2]];
            }
        }
        const uvs = pts.map(sphericalUV);
        const us = uvs.map(u => u[0]);
        if (Math.max(...us) - Math.min(...us) > 0.5) {
            for (const uv of uvs) if (uv[0] < 0.5) uv[0] += 1;   // unwrap seam
        }
        const base = vertices.length;
        pts.forEach((p, i) => vertices.push({ p, n, uv: uvs[i] }));
        for (let i = 2; i < poly.length; i++) faces.push([base, base + i - 1, base + i]);
    }
    return { vertices, faces };
}

// ── 4D polytopes (animated: rotate in two planes, project w→3D) ─────────

function project4(p4, dist) {
    const w = dist / (dist - p4[3]);
    return [p4[0] * w, p4[1] * w, p4[2] * w];
}

// Rotation in two independent planes (the classic double rotation).
function rotate4(p, a1, a2) {
    let [x, y, z, w] = p;
    // plane XW
    let c = Math.cos(a1), s = Math.sin(a1);
    [x, w] = [x * c - w * s, x * s + w * c];
    // plane YZ
    c = Math.cos(a2); s = Math.sin(a2);
    [y, z] = [y * c - z * s, y * s + z * c];
    return [x, y, z, w];
}

const POLYTOPES_4D = {
    hypercube: () => {
        const verts = [];
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) for (const w of [-1, 1]) verts.push([x, y, z, w]);
        const edges = [];
        for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) {
            const d = a ^ b;
            if (d === 1 || d === 2 || d === 4 || d === 8) edges.push([a, b]);
        }
        // The 24 square 2-faces: two axes vary, the other two sit at ±1.
        // (Solid style textures these; wire style keeps using the edges.)
        const facePolys = [];
        const bit = [8, 4, 2, 1];
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
            const [k, l] = [0, 1, 2, 3].filter((a) => a !== i && a !== j);
            for (const sk of [0, bit[k]]) for (const sl of [0, bit[l]]) {
                const base = sk + sl;
                facePolys.push([base, base + bit[i], base + bit[i] + bit[j], base + bit[j]]);
            }
        }
        return { verts, edges, facePolys, projDist: 3, scale: 0.62 };
    },
    pentachoron: () => {
        // Regular 5-cell: 5 vertices, all pairs are edges.
        const r5 = Math.sqrt(5);
        const verts = [
            [1, 1, 1, -1 / r5], [1, -1, -1, -1 / r5], [-1, 1, -1, -1 / r5], [-1, -1, 1, -1 / r5],
            [0, 0, 0, r5 - 1 / r5],
        ].map(p => mul4(p, 0.72));
        const edges = [];
        for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) edges.push([a, b]);
        const facePolys = [];
        for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) for (let c2 = b + 1; c2 < 5; c2++) facePolys.push([a, b, c2]);
        return { verts, edges, facePolys, projDist: 3.4, scale: 0.9 };
    },
    // 3-sphere: nested 2-sphere shells at constant-w slices. Under the 4D
    // double rotation the shells morph through each other (the AG's
    // hypersphere). opts: shells / lat / lon control the wire density.
    hypersphere: (opts = {}) => {
        const shells = Math.max(1, opts.shells ?? 3);
        const lat = Math.max(2, opts.lat ?? 5);
        const lon = Math.max(3, opts.lon ?? 8);
        const verts = [];
        const edges = [];
        for (let s = 0; s < shells; s++) {
            const chi = ((s + 1) / (shells + 1)) * Math.PI;
            const w = Math.cos(chi), R = Math.sin(chi);
            const base = verts.length;
            for (let i = 0; i < lat; i++) {
                const th = ((i + 0.5) / lat) * Math.PI;
                for (let j = 0; j < lon; j++) {
                    const ph = (j / lon) * Math.PI * 2;
                    verts.push([R * Math.sin(th) * Math.cos(ph), R * Math.cos(th), R * Math.sin(th) * Math.sin(ph), w]);
                }
            }
            for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
                const a = base + i * lon + j;
                edges.push([a, base + i * lon + ((j + 1) % lon)]);
                if (i + 1 < lat) edges.push([a, base + (i + 1) * lon + j]);
            }
        }
        return { verts, edges, projDist: 2.6, scale: 0.8 };
    },
};
const mul4 = (p, s) => [p[0] * s, p[1] * s, p[2] * s, p[3] * s];

// ── Parametric surfaces ──────────────────────────────────────────────────
// fn(u, v) → [x,y,z] with u,v ∈ [0,1]. closedU/closedV control wrapping.

const SURFACES = {
    sphere: {
        segU: 24, segV: 14, closedU: true, closedV: false,
        fn: (u, v) => {
            const th = u * Math.PI * 2, ph = v * Math.PI;
            return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
        },
    },
    torus: {
        segU: 28, segV: 12, closedU: true, closedV: true,
        fn: (u, v) => {
            const th = u * Math.PI * 2, ph = v * Math.PI * 2;
            const R = 0.85, r = 0.35;
            return [(R + r * Math.cos(ph)) * Math.cos(th), r * Math.sin(ph), (R + r * Math.cos(ph)) * Math.sin(th)];
        },
    },
    cylinder: {
        segU: 20, segV: 6, closedU: true, closedV: false,
        // v runs top→bottom like the sphere: same texture orientation and
        // the same outward winding (bottom-up v shows the INSIDE surface).
        fn: (u, v) => {
            const th = u * Math.PI * 2;
            return [Math.cos(th) * 0.75, (0.5 - v) * 2.2, Math.sin(th) * 0.75];
        },
    },
    // Tornado funnel: concave trumpet profile — wide flared crown easing
    // into a narrow throat that ends in an OPEN ring mouth (r stays > 0),
    // not a sharp apex.
    funnel: {
        segU: 20, segV: 9, closedU: true, closedV: false,
        fn: (u, v) => {
            const th = u * Math.PI * 2;
            const r = 0.16 + 0.92 * Math.pow(v, 2.3);
            return [Math.cos(th) * r, (0.5 - v) * 2.2, Math.sin(th) * r];
        },
    },
    cone: {
        segU: 20, segV: 6, closedU: true, closedV: false,
        // v=0 at the apex (top), like the sphere's pole — texture upright,
        // faces wound outward.
        fn: (u, v) => {
            const th = u * Math.PI * 2, r = v * 1.05;
            return [Math.cos(th) * r, 1.3 - v * 2.2, Math.sin(th) * r];
        },
    },
    // closedU false: the half-twist means the u seam only lines up with a
    // v-flip, so we leave the strip open — the u=0 and u=1 columns land on
    // coincident points, closing the loop visually.
    mobius: {
        segU: 32, segV: 4, closedU: false, closedV: false,
        fn: (u, v) => {
            const th = u * Math.PI * 2, t = (v - 0.5) * 0.6;
            const r = 1 + t * Math.cos(th / 2);
            return [r * Math.cos(th), t * Math.sin(th / 2) * 1.4, r * Math.sin(th)];
        },
    },
};

function surfaceGrid(def) {
    const nu = def.segU + (def.closedU ? 0 : 1);
    const nv = def.segV + (def.closedV ? 0 : 1);
    const pts = [];
    for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
            pts.push(def.fn(i / def.segU, j / def.segV));
        }
    }
    const idx = (i, j) => (j % nv === j ? j : j % nv) * nu + (i % nu);
    return { pts, nu, nv, idx };
}

function surfaceWire(def, thickness) {
    const { pts, nu, nv, idx } = surfaceGrid(def);
    const edges = [];
    for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
            if (def.closedU || i < nu - 1) edges.push([idx(i, j), idx((i + 1) % nu, j)]);
            if (j < nv - 1) edges.push([idx(i, j), idx(i, j + 1)]);
            else if (def.closedV) edges.push([idx(i, j), idx(i, 0)]);
        }
    }
    return { frame: strutFrame(pts, edges, thickness), spawnPts: pts };
}

// Solid surfaces use an OPEN grid with duplicated seam columns/rows
// (u and v run a full 0..1 inclusive): sharing seam vertices would make
// the closing quad interpolate u from ~0.96 back to 0, squeezing a
// mirrored copy of the whole texture into one segment — the classic
// UV-sphere seam smear. The parametric fns are periodic, so the
// duplicated positions coincide exactly; only the UVs differ.
function surfaceSolid(def) {
    const nu = def.segU + 1, nv = def.segV + 1;
    const vertices = [];
    for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
            const p = def.fn(i / def.segU, j / def.segV);
            // Orientation set from live observation (earth texture on the
            // sphere, EXTERIOR view after the winding fix): u flipped,
            // v flipped. The pre-winding calibration ("u as-is") was made
            // while unknowingly looking at the shell's INSIDE, which
            // mirrors the map horizontally — hence the u flip now.
            // UVs compensate the default category Y-flip (a pi X-rotation
            // baked by _composeStack): it turns the model upside down AND
            // swaps the visible hemisphere, so both axes re-invert here for
            // custom textures to read upright in the editor and in-game.
            vertices.push({ p, n: norm(p), uv: [i / def.segU, j / def.segV] });
        }
    }
    const faces = [];
    for (let j = 0; j < nv - 1; j++) {
        for (let i = 0; i < nu - 1; i++) {
            const a = j * nu + i, b = j * nu + i + 1;
            const c = (j + 1) * nu + i + 1, d = (j + 1) * nu + i;
            // Winding: OUTWARD faces must survive culling=1 (cull the
            // inside). The a,b,c order showed the INTERIOR (both pole
            // pinches at once, "hourglass", mirrored map — user-observed
            // on the earth-textured sphere); reversed order faces out.
            faces.push([a, c, b], [a, d, c]);
        }
    }
    return { frame: { vertices, faces }, spawnPts: vertices.map(v => v.p) };
}

// ── Curves (double helix) ────────────────────────────────────────────────

function helixGeometry() {
    const pts = [];
    const edges = [];
    const N = 26;
    for (let phase = 0; phase < 2; phase++) {
        const base = pts.length;
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const th = t * Math.PI * 4 + phase * Math.PI;
            pts.push([Math.cos(th) * 0.55, (t - 0.5) * 2.4, Math.sin(th) * 0.55]);
            if (i > 0) edges.push([base + i - 1, base + i]);
        }
    }
    // rungs
    for (let i = 2; i <= N - 2; i += 4) edges.push([i, N + 1 + i]);
    return { verts: pts, edges };
}

// ── Object mesh kit ──────────────────────────────────────────────────────
// Weapons/items for the Object recipes. Each builder returns
// { verts, edges, facePolys } like the polytopes: wire style struts the
// edges, solid style fills the facePolys (convex polys / triangles only).

function mulberry32(seed) {
    let t0 = seed >>> 0;
    return function () {
        let t = (t0 += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Merge parts, offsetting indices. */
function mergeParts(parts) {
    const verts = [], edges = [], facePolys = [];
    for (const part of parts) {
        const off = verts.length;
        verts.push(...part.verts);
        for (const e of part.edges) edges.push([e[0] + off, e[1] + off]);
        for (const f of part.facePolys) facePolys.push(f.map(i => i + off));
    }
    return { verts, edges, facePolys };
}

const mapPart = (part, fn) => ({ ...part, verts: part.verts.map(fn) });

/** Surface of revolution around Y. profile = [[radius, y], …]; r≈0 rows collapse to a point. */
function lathePart(profile, seg = 12) {
    const verts = [], rows = [];
    for (const [r, y] of profile) {
        if (Math.abs(r) < 1e-6) {
            rows.push([verts.length]);
            verts.push([0, y, 0]);
        } else {
            const row = [];
            for (let j = 0; j < seg; j++) {
                const a = (j / seg) * Math.PI * 2;
                row.push(verts.length);
                verts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
            }
            rows.push(row);
        }
    }
    const edges = [], facePolys = [];
    for (const row of rows) {
        if (row.length > 1) for (let j = 0; j < row.length; j++) edges.push([row[j], row[(j + 1) % row.length]]);
    }
    for (let i = 0; i + 1 < rows.length; i++) {
        const a = rows[i], b = rows[i + 1];
        if (a.length === 1 && b.length === 1) continue;
        if (a.length === 1) {
            for (let j = 0; j < b.length; j++) facePolys.push([a[0], b[(j + 1) % b.length], b[j]]);
            edges.push([a[0], b[0]], [a[0], b[Math.floor(b.length / 2)]]);
        } else if (b.length === 1) {
            for (let j = 0; j < a.length; j++) facePolys.push([a[j], a[(j + 1) % a.length], b[0]]);
            edges.push([a[0], b[0]], [a[Math.floor(a.length / 2)], b[0]]);
        } else {
            for (let j = 0; j < seg; j++) {
                facePolys.push([a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j]]);
                edges.push([a[j], b[j]]);
            }
        }
    }
    return { verts, edges, facePolys };
}

/** Axis-aligned box from center + half extents. */
function boxPart(cx, cy, cz, hx, hy, hz) {
    const verts = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        verts.push([cx + sx * hx, cy + sy * hy, cz + sz * hz]);
    }
    const edges = [];
    for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) {
        const d = a ^ b;
        if (d === 1 || d === 2 || d === 4) edges.push([a, b]);
    }
    const facePolys = [
        [0, 1, 3, 2], [4, 6, 7, 5],   // -x, +x
        [0, 4, 5, 1], [2, 3, 7, 6],   // -y, +y
        [0, 2, 6, 4], [1, 5, 7, 3],   // -z, +z
    ];
    return { verts, edges, facePolys };
}

/** Tiny ear-clip for prism caps (simple polygons, CCW or CW). */
function earClip2D(poly) {
    const idx = poly.map((_, i) => i);
    const area = poly.reduce((s, p, i) => {
        const q = poly[(i + 1) % poly.length];
        return s + p[0] * q[1] - q[0] * p[1];
    }, 0);
    const sign = area >= 0 ? 1 : -1;
    const tris = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < 1000) {
        let clipped = false;
        for (let i = 0; i < idx.length; i++) {
            const a = poly[idx[(i + idx.length - 1) % idx.length]];
            const b = poly[idx[i]];
            const c = poly[idx[(i + 1) % idx.length]];
            const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            if (cr * sign <= 1e-12) continue;   // reflex
            let inside = false;
            for (const j of idx) {
                const p = poly[j];
                if (p === a || p === b || p === c) continue;
                const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
                const d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
                const d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
                if (d1 * sign >= 0 && d2 * sign >= 0 && d3 * sign >= 0) { inside = true; break; }
            }
            if (inside) continue;
            tris.push([idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]]);
            idx.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) break;   // degenerate — fan whatever is left
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    else for (let i = 1; i + 1 < idx.length; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    return tris;
}

/** Extrude a 2D polygon [[x, y], …] from z0 to z1 (blades, fins, teeth). */
function prismPart(poly, z0, z1) {
    const n = poly.length;
    const verts = [];
    for (const [x, y] of poly) verts.push([x, y, z0]);
    for (const [x, y] of poly) verts.push([x, y, z1]);
    const edges = [];
    for (let i = 0; i < n; i++) {
        edges.push([i, (i + 1) % n], [n + i, n + ((i + 1) % n)], [i, n + i]);
    }
    const facePolys = [];
    for (let i = 0; i < n; i++) facePolys.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
    for (const t of earClip2D(poly)) {
        facePolys.push([t[0], t[1], t[2]]);                    // back cap
        facePolys.push([n + t[2], n + t[1], n + t[0]]);        // front cap
    }
    return { verts, edges, facePolys };
}

/** Rotate a part around Y and push it out to radius R (crown spikes, teeth). */
function radialPlace(part, angle, R) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return mapPart(part, ([x, y, z]) => [
        x * -s + z * c + R * c,
        y,
        x * c + z * s + R * s,
    ]);
}

const OBJECTS = {
    sword: () => mergeParts([
        prismPart([[0, 1.15], [0.1, 0.96], [0.07, 0.02], [-0.07, 0.02], [-0.1, 0.96]], -0.022, 0.022),
        boxPart(0, -0.04, 0, 0.24, 0.038, 0.05),
        lathePart([[0.05, -0.08], [0.055, -0.44]], 8),
        lathePart([[0, -0.46], [0.085, -0.55], [0, -0.64]], 6),   // pommel
    ]),
    knife: () => mergeParts([
        prismPart([[0, 0.78], [0.12, 0.6], [0.09, 0.05], [-0.05, 0.05], [-0.05, 0.6]], -0.016, 0.016),
        boxPart(0, -0.22, 0, 0.07, 0.28, 0.04),
    ]),
    hammer: () => mergeParts([
        boxPart(0, 0.52, 0, 0.34, 0.13, 0.13),
        lathePart([[0.05, 0.39], [0.05, -0.62]], 8),
    ]),
    arrow: () => mergeParts([
        lathePart([[0, 0.9], [0.08, 0.58], [0, 0.58]], 8),                    // head
        lathePart([[0.024, 0.58], [0.024, -0.72]], 6),                        // shaft
        ...[0, 1, 2, 3].map(k => {
            const fin = prismPart([[0.03, -0.42], [0.16, -0.6], [0.16, -0.74], [0.03, -0.68]], -0.007, 0.007);
            const a = (k / 4) * Math.PI * 2;
            const c = Math.cos(a), s = Math.sin(a);
            return mapPart(fin, ([x, y, z]) => [x * c - z * s, y, x * s + z * c]);
        }),
    ]),
    bullet: () => lathePart([
        [0, 0.6], [0.06, 0.42], [0.1, 0.18], [0.115, -0.1], [0.115, -0.52], [0, -0.52],
    ], 12),
    rock: (opts = {}) => {
        const base = icosahedronVerts().map(v => norm(v));
        const edges = minDistEdges(base.map(v => mul(v, 1)));
        const facePolys = adjacentTriples(base.map(v => mul(v, 1)), edges);
        const rnd = mulberry32((opts.seed ?? 7) * 2654435761 + 1);
        const verts = base.map(v => mul(v, 0.62 + rnd() * 0.34));
        return { verts, edges, facePolys };
    },
    egg: () => {
        const profile = [];
        const ROWS = 9;
        for (let i = 0; i <= ROWS; i++) {
            const t = (i / ROWS) * Math.PI;           // 0 = top (narrow end)
            profile.push([0.62 * Math.sin(t) * (1 - 0.16 * Math.cos(t)), 0.78 * Math.cos(t)]);
        }
        return lathePart(profile, 12);
    },
    coin: () => lathePart([[0, 0.07], [0.56, 0.07], [0.56, -0.07], [0, -0.07]], 18),
    crown: () => mergeParts([
        lathePart([[0.5, -0.28], [0.5, 0.06]], 16),
        ...Array.from({ length: 8 }, (_, k) =>
            radialPlace(prismPart([[-0.09, 0.05], [0, 0.46], [0.09, 0.05]], -0.02, 0.02),
                        (k / 8) * Math.PI * 2, 0.5)),
    ]),
    scythe: () => mergeParts([
        lathePart([[0.032, 0.95], [0.032, -0.95]], 6),
        prismPart([
            [0.04, 0.95], [0.3, 0.92], [0.55, 0.84], [0.74, 0.68], [0.84, 0.46],
            [0.74, 0.52], [0.62, 0.66], [0.44, 0.77], [0.24, 0.84], [0.04, 0.87],
        ], -0.013, 0.013),
    ]),
    sawblade: (opts = {}) => {
        const teeth = 16;
        const disc = [];
        const SEG = 32;
        for (let i = 0; i < SEG; i++) {
            const a = (i / SEG) * Math.PI * 2;
            disc.push([Math.cos(a) * 0.42, Math.sin(a) * 0.42]);
        }
        const parts = [prismPart(disc, -0.03, 0.03)];
        for (let k = 0; k < teeth; k++) {
            const a = (k / teeth) * Math.PI * 2;
            const w = (Math.PI / teeth) * 0.9;
            parts.push(prismPart([
                [Math.cos(a) * 0.41, Math.sin(a) * 0.41],
                [Math.cos(a + w * 0.5) * 0.56, Math.sin(a + w * 0.5) * 0.56],
                [Math.cos(a + w) * 0.41, Math.sin(a + w) * 0.41],
            ], -0.03, 0.03));
        }
        return mergeParts(parts);
    },
    gem: (opts = {}) => {
        const N = Math.max(4, Math.min(9, opts.facets ?? 6));
        const verts = [];
        for (let i = 0; i < N; i++) {
            const a = (i / N) * Math.PI * 2;
            verts.push([Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5]);          // girdle
        }
        for (let i = 0; i < N; i++) {
            const a = ((i + 0.5) / N) * Math.PI * 2;
            verts.push([Math.cos(a) * 0.27, 0.38, Math.sin(a) * 0.27]);        // table ring
        }
        verts.push([0, -0.62, 0]);                                             // culet
        const apex = 2 * N;
        const edges = [], facePolys = [];
        for (let i = 0; i < N; i++) {
            const g0 = i, g1 = (i + 1) % N, t0 = N + i, tPrev = N + ((i + N - 1) % N);
            edges.push([g0, g1], [t0, N + ((i + 1) % N)], [g0, t0], [g1, t0], [g0, apex]);
            facePolys.push([g0, g1, t0]);                                      // crown kite
            facePolys.push([g0, t0, tPrev]);
            facePolys.push([g1, g0, apex]);                                    // pavilion
        }
        facePolys.push(Array.from({ length: N }, (_, i) => N + i));            // table
        return { verts, edges, facePolys };
    },
};

// ── buildGeometry: one entry point for the recipes ───────────────────────

const SHAPE_DEFS = {
    // 4D (always animated wireframe)
    hypercube:    { kind: '4d' },
    pentachoron:  { kind: '4d' },
    hypersphere:  { kind: '4d' },
    // 3D polytopes (static wireframe)
    cube:         { kind: '3d' },
    pyramid:      { kind: '3d' },
    octahedron:   { kind: '3d' },
    merkaba:      { kind: '3d' },
    icosahedron:  { kind: '3d' },
    dodecahedron: { kind: '3d' },
    // surfaces (wire or solid)
    sphere:       { kind: 'surface' },
    torus:        { kind: 'surface' },
    cylinder:     { kind: 'surface' },
    cone:         { kind: 'surface' },
    funnel:       { kind: 'surface' },
    mobius:       { kind: 'surface' },
    // curves
    helix:        { kind: 'curve' },
    // objects (wire or solid; opts.seed for rock, opts.facets for gem)
    sword:        { kind: 'object' },
    knife:        { kind: 'object' },
    hammer:       { kind: 'object' },
    arrow:        { kind: 'object' },
    bullet:       { kind: 'object' },
    rock:         { kind: 'object' },
    egg:          { kind: 'object' },
    coin:         { kind: 'object' },
    crown:        { kind: 'object' },
    scythe:       { kind: 'object' },
    sawblade:     { kind: 'object' },
    gem:          { kind: 'object' },
};

/**
 * @param {string} shape SHAPE_DEFS key
 * @param {object} opts { thickness, style: 'wire'|'solid', frames, morphTurns }
 *   frames/morphTurns apply to 4D shapes: `frames` model frames covering
 *   `morphTurns` full double-rotations (baked; plays at 60fps, loops
 *   seamlessly because rotation is a whole number of turns).
 * @returns {{ mesh: object /* writeEfkmodel input *\/, spawnVertices: number[][] }}
 */
function buildGeometry(shape, opts = {}) {
    const def = SHAPE_DEFS[shape];
    if (!def) throw new Error(`efk_model: unknown shape "${shape}"`);
    const thickness = opts.thickness ?? 0.05;

    if (def.kind === '4d') {
        const { verts, edges, facePolys, projDist, scale } = POLYTOPES_4D[shape](opts);
        const frames = [];
        const F = Math.max(2, opts.frames ?? 96);
        const turns = Math.max(1, Math.round(opts.morphTurns ?? 1));
        const solid = opts.style === 'solid' && facePolys;
        for (let f = 0; f < F; f++) {
            const t = (f / F) * Math.PI * 2 * turns;
            const projected = verts.map(v => mul(project4(rotate4(v, t, t * 0.5), projDist), scale));
            // Solid: real textured faces every morph frame — the texture
            // folds through itself with the 4D rotation instead of
            // smearing along edge struts like a glow accent.
            frames.push(solid ? solidPolytopeFrame(projected, facePolys, true) : strutFrame(projected, edges, thickness));
        }
        // Sparks spawn on the frame-0 corners; they ride the container spin,
        // and the 4D morph keeps them near the structure.
        const spawnVertices = verts.map(v => mul(project4(rotate4(v, 0, 0), projDist), scale));
        return { mesh: { frames, scale: 1 }, spawnVertices };
    }

    if (def.kind === '3d') {
        const { verts, edges, facePolys } = POLYTOPES_3D[shape]();
        const frame = (opts.style === 'solid' && facePolys)
            ? solidPolytopeFrame(verts, facePolys, true)
            : strutFrame(verts, edges, thickness);
        return { mesh: { ...frame, scale: 1 }, spawnVertices: verts };
    }

    if (def.kind === 'surface') {
        const surf = SURFACES[shape];
        const built = (opts.style === 'solid') ? surfaceSolid(surf) : surfaceWire(surf, thickness);
        return { mesh: { ...built.frame, scale: 1 }, spawnVertices: built.spawnPts };
    }

    if (def.kind === 'object') {
        const obj = OBJECTS[shape](opts);
        const frame = (opts.style === 'solid')
            ? solidPolytopeFrame(obj.verts, obj.facePolys)
            : strutFrame(obj.verts, obj.edges, thickness);
        return { mesh: { ...frame, scale: 1 }, spawnVertices: obj.verts };
    }

    // curve
    const { verts, edges } = helixGeometry();
    return { mesh: { ...strutFrame(verts, edges, thickness), scale: 1 }, spawnVertices: verts };
}

/** Spawn-only companion model: shape corners as vertices (never rendered). */
function spawnModel(spawnVertices) {
    return {
        vertices: spawnVertices.map(p => ({ p, n: [0, 1, 0], uv: [0, 0] })),
        faces: [],
        scale: 1,
    };
}

return {
    writeEfkmodel,
    parseEfkmodel,
    buildGeometry,
    spawnModel,
    strutFrame,   // reused by efk_symbols.js
    SHAPES: Object.keys(SHAPE_DEFS),
    SHAPE_KINDS: Object.fromEntries(Object.entries(SHAPE_DEFS).map(([k, v]) => [k, v.kind])),
    // Bump on ANY mesh-content change (winding, UVs, geometry): model
    // caches — the editor's _modelCache AND the WASM core's resource
    // cache — are keyed by PATH, so a changed mesh under an unchanged
    // path silently shows the stale one. Recipes fold this into their
    // model paths.
    MESH_REV: 3,
};
});
