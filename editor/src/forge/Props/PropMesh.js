/**
 * RRPropMesh - simple solids for props: tubes, lathed profiles, spheres,
 * boxes and extruded outlines, as plain arrays ({ positions, normals, uvs,
 * index }), merged into parts.
 *
 * Outlines are triangulated by three's ShapeUtils (holes stay holes), so
 * extrusion needs THREE on the global object (the editor's page, or
 * a caller-supplied THREE in Node).
 */
(function(root) {
    'use strict';

    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const Patterns = root.RRConstructionPatterns || (typeof require === 'function' ? require('../Character3D/ConstructionPatterns.js') : null);

    function make(positions, normals, uvs, index) {
        return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), uvs: Float32Array.from(uvs), index: Uint32Array.from(index) };
    }

    /** Two axes square to `d` (unit), for laying a ring around it. */
    function basis(d) {
        const up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        const u = norm(cross(up, d)), v = cross(d, u);
        return [u, v];
    }

    /**
     * A profile turned about an axis: `profile` is [[radius, height], ...]
     * from the bottom up, `segments` around. The axis runs from `base` along
     * `dir` (default straight up). Ends with a radius close with a cap.
     * `phase` turns the ring (a quarter turn on 4 sides makes a diamond).
     * Round work (8 sides or more) gets at least the sides its widest radius needs.
     */
    function lathe(profile, segments, options) {
        const o = options || {};
        const base = o.base || [0, 0, 0], d = norm(o.dir || [0, 1, 0]);
        const [U, V] = basis(d), seg = segments >= 8 ? Math.max(segments | 0, Patterns.roundSides(Math.max(...profile.map(p => Math.abs(p[0]))))) : Math.max(3, segments | 0), phase = o.phase || 0;
        const P = [], N = [], T = [], I = [];
        // Profile normals: square to each span, averaged at a joint unless the joint is sharp.
        const spans = profile.slice(1).map((p, k) => { const dr = p[0] - profile[k][0], dh = p[1] - profile[k][1], l = Math.hypot(dr, dh) || 1; return [dh / l, -dr / l]; });
        let length = 0;
        const along = profile.map((p, k) => (k ? (length += Math.hypot(p[0] - profile[k - 1][0], p[1] - profile[k - 1][1])) : 0));
        const ring = (r, h, nr, nh, vcoord) => {
            const start = P.length / 3;
            for (let s = 0; s <= seg; s++) {
                const a = phase + (s / seg) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
                const dirx = U[0] * c + V[0] * si, diry = U[1] * c + V[1] * si, dirz = U[2] * c + V[2] * si;
                P.push(base[0] + d[0] * h + dirx * r, base[1] + d[1] * h + diry * r, base[2] + d[2] * h + dirz * r);
                N.push(dirx * nr + d[0] * nh, diry * nr + d[1] * nh, dirz * nr + d[2] * nh);
                T.push(s / seg, vcoord);
            }
            return start;
        };
        const sharp = o.sharp ?? 0.6;
        for (let k = 0; k < profile.length - 1; k++) {
            const [r0, h0] = profile[k], [r1, h1] = profile[k + 1];
            const own = spans[k];
            const blend = (other) => (other && own[0] * other[0] + own[1] * other[1] > sharp ? norm([own[0] + other[0], own[1] + other[1], 0]) : [own[0], own[1]]);
            const n0 = blend(spans[k - 1]), n1 = blend(spans[k + 1]);
            const a = ring(r0, h0, n0[0], n0[1], 1 - along[k] / (length || 1)), b = ring(r1, h1, n1[0], n1[1], 1 - along[k + 1] / (length || 1));
            for (let s = 0; s < seg; s++) I.push(a + s, a + s + 1, b + s, b + s, a + s + 1, b + s + 1);
        }
        const cap = (r, h, down) => {
            if (r <= 1e-6) return;
            const nh = down ? -1 : 1, center = P.length / 3;
            P.push(base[0] + d[0] * h, base[1] + d[1] * h, base[2] + d[2] * h); N.push(d[0] * nh, d[1] * nh, d[2] * nh); T.push(0.5, 0.5);
            const start = ring(r, h, 0, nh, 0);
            for (let s = 0; s < seg; s++) { if (down) I.push(center, start + s + 1, start + s); else I.push(center, start + s, start + s + 1); }
        };
        if (o.caps !== false) { cap(profile[0][0], profile[0][1], true); cap(profile[profile.length - 1][0], profile[profile.length - 1][1], false); }
        // Normals point out of the solid: the ring order above winds outward faces counterclockwise.
        return make(P, N, T, I);
    }

    /** A round bar from `a` to `b`, radius `r0` at `a` and `r1` at `b`. */
    function tube(a, b, r0, r1, segments, options) {
        const d = sub(b, a), h = Math.hypot(d[0], d[1], d[2]);
        return lathe([[r0, 0], [r1 ?? r0, h]], segments, Object.assign({ base: a, dir: d, sharp: 2 }, options || {}));
    }

    /** A ball: at least the sides its radius needs, half as many rings (at least 6), and normals straight out from the center. */
    function sphere(center, r, segments, rings) {
        segments = Math.max(segments | 0, Patterns.roundSides(r));
        const n = rings || Math.max(6, Math.round(segments / 2)), profile = [];
        for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + Math.PI * k / n; profile.push([Math.cos(a) * r, Math.sin(a) * r]); }
        profile[0][0] = profile[n][0] = 0;
        const mesh = lathe(profile, segments, { base: center, sharp: -2, caps: false }), P = mesh.positions, N = mesh.normals;
        for (let v = 0; v < P.length; v += 3) {
            const d = norm([P[v] - center[0], P[v + 1] - center[1], P[v + 2] - center[2]]);
            N[v] = d[0]; N[v + 1] = d[1]; N[v + 2] = d[2];
        }
        return mesh;
    }

    /** An axis-aligned box: `center`, `size` [x, y, z]. */
    function box(center, size) {
        const P = [], N = [], T = [], I = [];
        const h = size.map(v => v / 2);
        for (let ax = 0; ax < 3; ax++) for (const s of [1, -1]) {
            const n = [0, 0, 0]; n[ax] = s;
            const u = (ax + 1) % 3, v = (ax + 2) % 3;
            const start = P.length / 3;
            for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                const p = center.slice(); p[ax] += s * h[ax]; p[u] += cu * h[u]; p[v] += cv * h[v];
                P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); T.push((cu + 1) / 2, (cv + 1) / 2);
            }
            if (s > 0) I.push(start, start + 1, start + 2, start, start + 2, start + 3);
            else I.push(start, start + 2, start + 1, start, start + 3, start + 2);
        }
        return make(P, N, T, I);
    }

    /**
     * Outlines (each [x0, y0, x1, y1, ...]; the first the outside, the rest
     * holes) made solid, `depth` thick along z, centered on z = 0. Faces
     * front (+z) and back carry uvs from `uvOf(x, y)`; the rim runs around.
     * `bevel` rounds the rim's edges inward by that much (0 for square).
     * With `split`, { front, back, rim } apart.
     */
    function extrude(outlines, depth, options) {
        const o = options || {};
        const THREE = root.THREE;
        if (!THREE || !THREE.ShapeUtils) throw new Error('three.js ShapeUtils is needed to triangulate outlines');
        const toVecs = flat => { const out = []; for (let i = 0; i < flat.length; i += 2) out.push(new THREE.Vector2(flat[i], flat[i + 1])); return out; };
        let outer = toVecs(outlines[0]);
        if (THREE.ShapeUtils.isClockWise(outer)) outer = outer.reverse();
        const holes = outlines.slice(1).map(h => { let v = toVecs(h); if (!THREE.ShapeUtils.isClockWise(v)) v = v.reverse(); return v; });
        const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
        const all = outer.concat(...holes);
        const uvOf = o.uvOf || ((x, y) => [x, y]);
        const bevel = Math.min(o.bevel || 0, depth * 0.45);
        const zf = depth / 2, zIn = zf - bevel;
        const P = [], N = [], T = [], I = [];
        // Faces, inset by the bevel where there is one.
        const insetLoops = [outer].concat(holes).map(loop => inset(loop, bevel));
        const flatInset = [].concat(...insetLoops);
        const marks = [];
        for (const [z, nz, back] of [[zf, 1, false], [-zf, -1, true]]) {
            marks.push([P.length / 3, I.length]);
            const start = P.length / 3;
            for (let k = 0; k < all.length; k++) {
                const p = flatInset[k];
                P.push(p.x, p.y, z); N.push(0, 0, nz);
                const uv = uvOf(p.x, p.y, back); T.push(uv[0], uv[1]);
            }
            for (const t of tris) { if (back) I.push(start + t[0], start + t[2], start + t[1]); else I.push(start + t[0], start + t[1], start + t[2]); }
        }
        // The rim: around each loop, from the front face's edge to the back's, through the bevel.
        const steps = bevel > 0 ? (o.round ? bevel>=.002?5:bevel>=.0008?3:1 : 1) : 0;
        const rimProfile = [];
        if (steps) for (let s = 0; s <= steps; s++) { const a = (s / steps) * Math.PI / 2; rimProfile.push([bevel * (1 - (o.round ? Math.sin(a) : s / steps)) , zIn + bevel * (o.round ? Math.cos(a) : 1 - s / steps)]); }
        else rimProfile.push([0, zf]);
        const fullProfile = rimProfile.slice().concat(rimProfile.slice().reverse().map(([i, z]) => [i, -z]));
        marks.push([P.length / 3, I.length]);
        [outer].concat(holes).forEach(loop => {
            const n = loop.length;
            // Outward normals in the plane at each corner.
            const outN = loop.map((p, k) => {
                const a = loop[(k + n - 1) % n], b = loop[(k + 1) % n];
                const e1 = norm([p.x - a.x, p.y - a.y, 0]), e2 = norm([b.x - p.x, b.y - p.y, 0]);
                // Outer loops run counterclockwise, holes clockwise: outward is to the right of travel either way.
                return norm([e1[1] + e2[1], -(e1[0] + e2[0]), 0]);
            });
            const perim = []; let L = 0;
            for (let k = 0; k <= n; k++) { perim.push(L); const a = loop[k % n], b = loop[(k + 1) % n]; L += Math.hypot(b.x - a.x, b.y - a.y); }
            const rows = fullProfile.length;
            const start = P.length / 3;
            for (let k = 0; k <= n; k++) {
                const p = loop[k % n], on = outN[k % n];
                for (let r = 0; r < rows; r++) {
                    const [inn, z] = fullProfile[r];
                    P.push(p.x - on[0] * inn, p.y - on[1] * inn, z);
                    const tilt = bevel > 0 ? (Math.abs(z) > zIn + 1e-6 ? (z > 0 ? 1 : -1) * Math.min(1, (Math.abs(z) - zIn) / bevel) : 0) : 0;
                    const nn = norm([on[0] * (1 - Math.abs(tilt)), on[1] * (1 - Math.abs(tilt)), tilt]);
                    N.push(nn[0], nn[1], nn[2]);
                    T.push(perim[k] / (L || 1), r / (rows - 1));
                }
            }
            for (let k = 0; k < n; k++) for (let r = 0; r < rows - 1; r++) {
                const a = start + k * rows + r, b = a + rows;
                I.push(a, a + 1, b, b, a + 1, b + 1);
            }
        });
        if (!o.split) return make(P, N, T, I);
        // Front, back and rim apart, for a material each.
        marks.push([P.length / 3, I.length]);
        const piece = k => {
            const [v0, i0] = marks[k], [v1, i1] = marks[k + 1];
            return make(P.slice(v0 * 3, v1 * 3), N.slice(v0 * 3, v1 * 3), T.slice(v0 * 2, v1 * 2), I.slice(i0, i1).map(i => i - v0));
        };
        return { front: piece(0), back: piece(1), rim: piece(2) };
    }

    /** A loop moved inward (toward the solid's inside) by `d`. */
    function inset(loop, d) {
        if (!d) return loop.map(p => ({ x: p.x, y: p.y }));
        const n = loop.length;
        return loop.map((p, k) => {
            const a = loop[(k + n - 1) % n], b = loop[(k + 1) % n];
            const e1 = norm([p.x - a.x, p.y - a.y, 0]), e2 = norm([b.x - p.x, b.y - p.y, 0]);
            const on = norm([e1[1] + e2[1], -(e1[0] + e2[0]), 0]);
            return { x: p.x - on[0] * d, y: p.y - on[1] * d };
        });
    }

    /** Moves (and turns) a mesh: `fn([x, y, z]) -> [x, y, z]` for points, `nfn` for normals. */
    function transform(mesh, fn, nfn) {
        const P = mesh.positions, N = mesh.normals;
        for (let i = 0; i < P.length; i += 3) {
            const p = fn([P[i], P[i + 1], P[i + 2]]); P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2];
            if (N && nfn) { const n = norm(nfn([N[i], N[i + 1], N[i + 2]])); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2]; }
        }
        return mesh;
    }

    /** Several meshes as one. */
    function merge(list) {
        const meshes = list.filter(Boolean);
        let v = 0, t = 0;
        for (const m of meshes) { v += m.positions.length / 3; t += m.index.length; }
        const out = { positions: new Float32Array(v * 3), normals: new Float32Array(v * 3), uvs: new Float32Array(v * 2), index: new Uint32Array(t) };
        let vo = 0, io = 0;
        for (const m of meshes) {
            out.positions.set(m.positions, vo * 3); out.normals.set(m.normals, vo * 3);
            if (m.uvs) out.uvs.set(m.uvs, vo * 2);
            for (let k = 0; k < m.index.length; k++) out.index[io + k] = m.index[k] + vo;
            vo += m.positions.length / 3; io += m.index.length;
        }
        return out;
    }

    /** Smooth normals from the triangles. */
    function computeNormals(mesh) {
        const P = mesh.positions, I = mesh.index, N = new Float32Array(P.length);
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
            for (const k of [a, b, c]) { N[k] += n[0]; N[k + 1] += n[1]; N[k + 2] += n[2]; }
        }
        for (let i = 0; i < N.length; i += 3) { const n = norm([N[i], N[i + 1], N[i + 2]]); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2]; }
        mesh.normals = N;
        return mesh;
    }

    const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    /**
     * Keep the authored albedo in vertex colors. Directional lighting is
     * evaluated by the preview and game against the current surface normal;
     * baking a second light here would leave a dark side fixed to the prop
     * as it turns, and multiply that shadow by the real light.
     */
    function shade(part) {
        const n = part.positions.length / 3, out = new Float32Array(n * 3);
        const base = part.texture ? [1, 1, 1] : hexLinear(part.color || '#9a9a9a');
        for (let v = 0; v < n; v++) {
            out.set(base, v * 3);
        }
        part.colors = out;
        part.shaded = true;
        return part;
    }

    function hexLinear(hex) {
        const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => toLinear(c / 255));
    }

    /** Planar wood grain uvs (meters / `scale`), the grain running along the longer side of each face. */
    function planarUv(mesh, scale) {
        const P = mesh.positions, N = mesh.normals, uv = new Float32Array(P.length / 3 * 2);
        for (let i = 0; i < P.length / 3; i++) {
            const nx = Math.abs(N[i * 3]), ny = Math.abs(N[i * 3 + 1]), nz = Math.abs(N[i * 3 + 2]);
            const x = P[i * 3] / scale, y = P[i * 3 + 1] / scale, z = P[i * 3 + 2] / scale;
            if (nz >= nx && nz >= ny) { uv[i * 2] = x; uv[i * 2 + 1] = y * 0.25; }
            else if (nx >= ny) { uv[i * 2] = z; uv[i * 2 + 1] = y * 0.25; }
            else { uv[i * 2] = x; uv[i * 2 + 1] = z * 0.25; }
        }
        mesh.uvs = uv;
        return mesh;
    }

    /**
     * A round bar along a path of points (a bent crossguard, a basket's bow,
     * a coil): `radius` a number or a function of the point's index; rings
     * turned along the path without twisting; ends closed when `caps`.
     */
    function polyTube(points, radius, segments, options) {
        const o = options || {}, n = points.length, P = [], N = [], T = [], I = [];
        const rOf = typeof radius === 'function' ? radius : () => radius;
        const seg = Math.max(segments | 0, Patterns.roundSides(Math.max(...points.map((_, k) => rOf(k)))));
        const tangent = k => norm(sub(points[Math.min(n - 1, k + 1)], points[Math.max(0, k - 1)]));
        let [u, v] = basis(tangent(0));
        for (let k = 0; k < n; k++) {
            const t = tangent(k);
            // Carry the frame along: take out of u what now points along the path.
            const d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
            u = norm([u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d]); v = cross(t, u);
            const r = rOf(k);
            for (let s = 0; s <= seg; s++) {
                const a = s / seg * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
                const dir = [u[0] * c + v[0] * si, u[1] * c + v[1] * si, u[2] * c + v[2] * si];
                P.push(points[k][0] + dir[0] * r, points[k][1] + dir[1] * r, points[k][2] + dir[2] * r); N.push(dir[0], dir[1], dir[2]); T.push(s / seg, k / (n - 1));
            }
        }
        for (let k = 0; k < n - 1; k++) for (let s = 0; s < seg; s++) { const a = k * (seg + 1) + s, b = a + seg + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
        const mesh = make(P, N, T, I);
        if (!o.caps) return mesh;
        const caps = [0, n - 1].map(k => Mesh_disc(points[k], k ? tangent(k) : tangent(k).map(x => -x), rOf(k), seg));
        return merge([mesh].concat(caps));
    }
    function Mesh_disc(center, normal, r, seg) {
        const [u, v] = basis(normal), P = [center[0], center[1], center[2]], N = [normal[0], normal[1], normal[2]], T = [0.5, 0.5], I = [];
        for (let s = 0; s <= seg; s++) { const a = s / seg * Math.PI * 2; P.push(center[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r, center[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r, center[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r); N.push(normal[0], normal[1], normal[2]); T.push(0.5, 0.5); }
        for (let s = 1; s <= seg; s++) I.push(0, s, s + 1);
        return make(P, N, T, I);
    }

    const api = { planarUv, polyTube, lathe, tube, sphere, box, extrude, inset, transform, merge, computeNormals, basis, shade };
    root.RRPropMesh = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
