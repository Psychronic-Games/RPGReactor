/**
 * RRNatureKit - the shared tools the Nature props (trees, plants, rocks and
 * alien flora) are grown with: seeded noise, a geometry accumulator with
 * per-vertex color and a wind weight, tubes that follow a path (bark, stems,
 * roots), folded leaf cards, ribbons, lathed bodies, distance-field solids
 * (surface nets, then quadric decimation for natural facets) and cover
 * shells (moss, snow, sand) that rise out of a surface where a mask says so.
 *
 * A geometry is { P, N, T, C, S, I }: positions, normals, uvs, linear vertex
 * colors, a sway weight per point (0 holds still, 1 moves with the wind
 * bone) and triangle indices, all plain arrays until `part()` packs them.
 * Units are meters; y is up.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Random = need('RRPropRandom', './PropRandom.js');
    const Decimator = need('RRQuadricDecimator', '../../utils/QuadricDecimator.js');

    // ── vectors ────────────────────────────────────────────────────────────
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => a + (b - a) * t;
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    /** `v` turned about the unit axis `k` by `a` radians (Rodrigues). */
    function rotate(v, k, a) {
        const c = Math.cos(a), s = Math.sin(a), d = dot(k, v), x = cross(k, v);
        return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
    }
    /** Two unit axes square to unit `d`. */
    function basis(d) {
        const up = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
        const u = norm(cross(up, d));
        return [u, cross(d, u)];
    }
    const vec = { add, sub, scale, dot, cross, len, norm, lerp, mix, clamp, smooth, rotate, basis };

    // ── color ──────────────────────────────────────────────────────────────
    const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    /** '#rrggbb' as sRGB 0..1. */
    function rgb(hex) {
        const n = parseInt(String(hex || '#808080').replace('#', '').slice(0, 6), 16) || 0;
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }
    const linear = c => [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];
    /** A color's hue turned and its lightness/saturation moved (sRGB in, sRGB out). */
    function shift(c, dh, ds, dl) {
        const max = Math.max(...c), min = Math.min(...c), l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = max === c[0] ? (c[1] - c[2]) / d + (c[1] < c[2] ? 6 : 0) : max === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
            h /= 6;
        }
        h = ((h + (dh || 0)) % 1 + 1) % 1; s = clamp(s * (1 + (ds || 0)), 0, 1); const L = clamp(l + (dl || 0), 0, 1);
        if (!s) return [L, L, L];
        const q = L < 0.5 ? L * (1 + s) : L + s - L * s, p = 2 * L - q;
        const f = t => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
    }

    // ── noise ──────────────────────────────────────────────────────────────
    /** Seeded gradient noise in 2D and 3D, about -1..1; `period` wraps the 2D lattice (tiling pictures). */
    function noise(seed) {
        const R = Random.roll((seed >>> 0) * 2654435761 + 1013904223), perm = new Uint8Array(512), p = [...Array(256).keys()];
        for (let i = 255; i > 0; i--) { const j = Math.floor(R.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
        for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
        const G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
        const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
        function n3(x, y, z) {
            const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
            x -= X; y -= Y; z -= Z;
            const xi = X & 255, yi = Y & 255, zi = Z & 255, u = fade(x), v = fade(y), w = fade(z);
            const g = (i, j, k, dx, dy, dz) => { const h = G3[perm[i + perm[j + perm[k]]] % 12]; return h[0] * dx + h[1] * dy + h[2] * dz; };
            const a = lerp(g(xi, yi, zi, x, y, z), g(xi + 1, yi, zi, x - 1, y, z), u), b = lerp(g(xi, yi + 1, zi, x, y - 1, z), g(xi + 1, yi + 1, zi, x - 1, y - 1, z), u);
            const c = lerp(g(xi, yi, zi + 1, x, y, z - 1), g(xi + 1, yi, zi + 1, x - 1, y, z - 1), u), d = lerp(g(xi, yi + 1, zi + 1, x, y - 1, z - 1), g(xi + 1, yi + 1, zi + 1, x - 1, y - 1, z - 1), u);
            return lerp(lerp(a, b, v), lerp(c, d, v), w);
        }
        function n2(x, y, px, py) {
            const X = Math.floor(x), Y = Math.floor(y);
            x -= X; y -= Y;
            const wrap = (i, P) => (P ? ((i % P) + P) % P : i) & 255;
            const x0 = wrap(X, px), x1 = wrap(X + 1, px), y0 = wrap(Y, py), y1 = wrap(Y + 1, py), u = fade(x), v = fade(y);
            const g = (i, j, dx, dy) => { const h = perm[i + perm[j]] & 7, a = h * Math.PI / 4 + 0.39; return Math.cos(a) * dx + Math.sin(a) * dy; };
            return lerp(lerp(g(x0, y0, x, y), g(x1, y0, x - 1, y), u), lerp(g(x0, y1, x, y - 1), g(x1, y1, x - 1, y - 1), u), v) * 1.41;
        }
        /** Fractal sum, `oct` octaves. */
        const fbm3 = (x, y, z, oct = 4) => { let s = 0, a = 1, f = 1, t = 0; for (let o = 0; o < oct; o++) { s += a * n3(x * f + o * 17.3, y * f, z * f); t += a; a *= 0.5; f *= 2.03; } return s / t; };
        /** Tiling fractal sum over a picture: (u, v) in 0..1, `fx`, `fy` whole lattice cells across. */
        const fbm2 = (u, v, fx, fy, oct = 4) => { let s = 0, a = 1, t = 0; for (let o = 0; o < oct; o++) { const k = 1 << o; s += a * n2(u * fx * k + o * 31, v * fy * k, fx * k, fy * k); t += a; a *= 0.5; } return s / t; };
        /** Tiling cells: distance to the nearest and second-nearest seed of a jittered grid (`cx` by `cy`), and the nearest cell's id. */
        function cells(u, v, cx, cy, jitter = 0.9) {
            const x = u * cx, y = v * cy, X = Math.floor(x), Y = Math.floor(y);
            let d1 = 9, d2 = 9, id = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const gx = X + i, gy = Y + j, wx = ((gx % cx) + cx) % cx, wy = ((gy % cy) + cy) % cy, h = perm[(wx & 255) + perm[wy & 255]];
                const sx = gx + 0.5 + (perm[h] / 255 - 0.5) * jitter, sy = gy + 0.5 + (perm[(h + 77) & 255] / 255 - 0.5) * jitter;
                const d = Math.hypot(x - sx, y - sy);
                if (d < d1) { d2 = d1; d1 = d; id = h; } else if (d < d2) d2 = d;
            }
            return { d1, d2, id };
        }
        return { n3, n2, fbm3, fbm2, cells };
    }

    // ── the geometry accumulator ───────────────────────────────────────────
    const geo = () => ({ P: [], N: [], T: [], C: [], S: [], I: [] });
    /** A point with its normal, uv, color (linear) and sway weight; its index. */
    function vert(g, p, n, u, v, c, s) {
        g.P.push(p[0], p[1], p[2]); g.N.push(n[0], n[1], n[2]); g.T.push(u, v);
        g.C.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1); g.S.push(s || 0);
        return g.P.length / 3 - 1;
    }
    /** `b` appended to `a`. */
    function append(a, b) {
        const o = a.P.length / 3;
        for (const k of ['P', 'N', 'T', 'C', 'S']) for (let i = 0; i < b[k].length; i++) a[k].push(b[k][i]);
        for (let i = 0; i < b.I.length; i++) a.I.push(b.I[i] + o);
        return a;
    }
    const count = g => g.I.length / 3;

    /**
     * A tube along `pts` (at least two). `radius(k, a)` its radius at point k
     * and angle a (radians), or a number. Options: sides, uRepeat (bark tiles
     * round it), v0 and vScale (meters a bark tile covers along it), color(k, p)
     * and sway(p) per point, capStart/capEnd (closed with a short cone), up
     * (a first ring direction, kept by parallel transport), twist (radians
     * per meter of the ring's start, for spiral grain).
     * Normals come from the ring grid itself, so lobes and ribs shade.
     */
    function tube(g, pts, radius, o = {}) {
        const n = pts.length, sides = Math.max(3, o.sides | 0 || 8), R = typeof radius === 'function' ? radius : () => radius;
        if (n < 2) return g;
        const tangent = k => norm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]));
        let t0 = tangent(0), [u, w] = o.up ? (() => { const a = norm(sub(o.up, scale(t0, dot(o.up, t0)))); return [a, cross(t0, a)]; })() : basis(t0);
        const ring = [], along = [0];
        for (let k = 1; k < n; k++) along.push(along[k - 1] + len(sub(pts[k], pts[k - 1])));
        for (let k = 0; k < n; k++) {
            const t = tangent(k), d = dot(u, t);
            u = norm(sub(u, scale(t, d))); w = cross(t, u);
            const row = [], spin = (o.twist || 0) * along[k];
            for (let s = 0; s <= sides; s++) {
                const a = (s / sides) * Math.PI * 2, c = Math.cos(a + spin), si = Math.sin(a + spin), r = R(k, a);
                const dir = [u[0] * c + w[0] * si, u[1] * c + w[1] * si, u[2] * c + w[2] * si];
                row.push({ p: add(pts[k], scale(dir, r)), dir });
            }
            ring.push(row);
        }
        const base = g.P.length / 3, uRep = o.uRepeat || 1, vScale = o.vScale || 1, v0 = o.v0 || 0;
        for (let k = 0; k < n; k++) {
            const col = o.color ? o.color(k, pts[k]) : null, sw = o.sway ? o.sway(pts[k]) : 0;
            for (let s = 0; s <= sides; s++) {
                const ss = s % sides, prev = ring[k][(ss + sides - 1) % sides].p, next = ring[k][(ss + 1) % sides].p;
                const back = ring[Math.max(0, k - 1)][ss].p, fwd = ring[Math.min(n - 1, k + 1)][ss].p;
                let nn = cross(sub(next, prev), sub(fwd, back));
                if (len(nn) < 1e-12) nn = ring[k][ss].dir;
                nn = norm(nn);
                if (dot(nn, ring[k][ss].dir) < 0) nn = scale(nn, -1);
                vert(g, ring[k][s].p, nn, (s / sides) * uRep, v0 + along[k] / vScale, col, sw);
            }
        }
        for (let k = 0; k < n - 1; k++) for (let s = 0; s < sides; s++) {
            const a = base + k * (sides + 1) + s, b = a + sides + 1;
            g.I.push(a, a + 1, b, a + 1, b + 1, b);
        }
        const cap = (k, dirSign) => {
            const t = scale(tangent(k), dirSign), r = Math.max(...ring[k].map((q, s) => (s < sides ? len(sub(q.p, pts[k])) : 0)));
            const tip = add(pts[k], scale(t, Math.min(r * 0.6, 0.5 * (o.capLength || r)))), col = o.color ? o.color(k, pts[k]) : null, sw = o.sway ? o.sway(pts[k]) : 0;
            const start = g.P.length / 3;
            for (let s = 0; s <= sides; s++) vert(g, ring[k][s].p, norm(add(ring[k][s % sides].dir, scale(t, 0.8))), (s / sides) * uRep, v0 + along[k] / vScale, col, sw);
            const c = vert(g, tip, t, 0.5 * uRep, v0 + (along[k] + r * 0.5) / vScale, col, sw);
            for (let s = 0; s < sides; s++) { if (dirSign > 0) g.I.push(start + s, start + s + 1, c); else g.I.push(start + s, c, start + s + 1); }
        };
        if (o.capEnd) cap(n - 1, 1);
        if (o.capStart) cap(0, -1);
        return g;
    }

    /** Points of a smooth curve through `ctrl` (Catmull-Rom), `per` points per span. */
    function spline(ctrl, per) {
        const out = [], n = ctrl.length;
        for (let i = 0; i < n - 1; i++) {
            const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
            for (let s = 0; s < per; s++) {
                const t = s / per, t2 = t * t, t3 = t2 * t;
                out.push([0, 1, 2].map(d => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
            }
        }
        out.push(ctrl[n - 1].slice());
        return out;
    }

    /**
     * A leaf card: a picture on a quad folded along its middle, its foot at
     * `base`, rising along `up` and as wide as `w` along `side` (both unit),
     * `h` tall. `cell` [u0, v0, u1, v1] its piece of the leaf picture (v0 at
     * the foot). `fold` lifts the middle line toward the card's face by that
     * share of its width. `normal(p)` bends the shading normals (a canopy's
     * round), `color` and `sway` as for tubes. `rows` across its height (1: four triangles).
     */
    function card(g, base, up, side, w, h, cell, o = {}) {
        const face = norm(cross(side, up)), fold = o.fold ?? 0.18, lift = scale(face, fold * w), bend = o.bend || 0, rows = o.rows || 1, cols = fold ? 2 : 1;
        const at = (x, y) => { const droop = scale(face, -bend * y * y * h); return add(add(base, add(scale(side, x * w / 2), scale(up, y * h))), add(droop, x === 0 && cols === 2 ? lift : [0, 0, 0])); };
        const start = g.P.length / 3, i0 = g.I.length;
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
            const x = (i / cols) * 2 - 1, y = j / rows, p = at(x, y), n = o.normal ? o.normal(p, face) : face;
            vert(g, p, n, lerp(cell[0], cell[2], i / cols), lerp(cell[1], cell[3], y), o.color ? o.color(p, [i / cols, y]) : null, o.sway ? o.sway(p) : 0);
        }
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const a = start + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
            g.I.push(a, b, c, c, b, d);
        }
        if (o.twoSided) backFaces(g, i0);
        return g;
    }

    /**
     * The triangles from index `i0` on, laid again the other way round on
     * the same points: a sheet seen from both sides that keeps one set of
     * shading normals (a canopy's outward round), where a two-sided material
     * would turn the normal over on its back and darken it.
     */
    function backFaces(g, i0) {
        const end = g.I.length;
        for (let t = i0; t < end; t += 3) g.I.push(g.I[t], g.I[t + 2], g.I[t + 1]);
        return g;
    }

    /**
     * A ribbon along `pts`: half-width `width(k)` along `side(k)` (unit),
     * folded by `fold` toward `face`; uvs across `cell` with v along the ribbon.
     */
    function ribbon(g, pts, width, side, cell, o = {}) {
        const n = pts.length, along = [0];
        for (let k = 1; k < n; k++) along.push(along[k - 1] + len(sub(pts[k], pts[k - 1])));
        const total = along[n - 1] || 1, start = g.P.length / 3;
        for (let k = 0; k < n; k++) {
            const t = norm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)])), sd = side(k), face = norm(cross(sd, t)), wd = width(k), f = (o.fold ?? 0.2) * wd;
            const v = lerp(cell[1], cell[3], along[k] / total);
            for (const [x, u] of [[-1, cell[0]], [0, (cell[0] + cell[2]) / 2], [1, cell[2]]]) {
                const p = add(add(pts[k], scale(sd, x * wd)), x === 0 ? scale(face, f) : [0, 0, 0]);
                const nn = o.normal ? o.normal(p, face) : norm(add(face, scale(sd, -x * (o.fold ?? 0.2) * 1.5)));
                vert(g, p, nn, u, v, o.color ? o.color(p, along[k] / total) : null, o.sway ? o.sway(p) : 0);
            }
        }
        const i0 = g.I.length;
        for (let k = 0; k < n - 1; k++) for (let x = 0; x < 2; x++) {
            const a = start + k * 3 + x, b = a + 3;
            g.I.push(a, a + 1, b, b, a + 1, b + 1);
        }
        if (o.twoSided) backFaces(g, i0);
        return g;
    }

    /** A ball, or an ellipsoid (`r` [x, y, z]), its surface pushed by `bump(dir)` (radius share). */
    function blob(g, c, r, o = {}) {
        const rr = Array.isArray(r) ? r : [r, r, r], seg = o.sides || 12, rings = o.rings || Math.max(4, seg >> 1), start = g.P.length / 3;
        for (let j = 0; j <= rings; j++) {
            const b = -Math.PI / 2 + Math.PI * j / rings;
            for (let s = 0; s <= seg; s++) {
                const a = (s / seg) * Math.PI * 2, dir = [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)], k = 1 + (o.bump ? o.bump(dir) : 0);
                const p = [c[0] + dir[0] * rr[0] * k, c[1] + dir[1] * rr[1] * k, c[2] + dir[2] * rr[2] * k];
                vert(g, p, norm([dir[0] / rr[0], dir[1] / rr[1], dir[2] / rr[2]]), (s / seg) * (o.uRepeat || 1), j / rings * (o.vRepeat || 1), o.color ? o.color(p, dir) : null, o.sway ? o.sway(p) : 0);
            }
        }
        for (let j = 0; j < rings; j++) for (let s = 0; s < seg; s++) {
            const a = start + j * (seg + 1) + s, b = a + seg + 1;
            g.I.push(a, b, a + 1, a + 1, b, b + 1);
        }
        if (o.bump) smoothNormals(g, start);
        return g;
    }

    /** Normals of the points from `from` on, from their triangles (points sharing a place share a normal). */
    function smoothNormals(g, from = 0) {
        const P = g.P, I = g.I, n0 = from, N = new Float64Array(P.length - n0 * 3), key = new Map(), id = [];
        for (let i = n0; i < P.length / 3; i++) { const k = Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4); if (!key.has(k)) key.set(k, i - n0); id.push(key.get(k)); }
        for (let t = 0; t < I.length; t += 3) {
            if (I[t] < n0 || I[t + 1] < n0 || I[t + 2] < n0) continue;
            const a = I[t], b = I[t + 1], c = I[t + 2];
            const f = cross([P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]]);
            for (const v of [a, b, c]) { const q = id[v - n0] * 3; N[q] += f[0]; N[q + 1] += f[1]; N[q + 2] += f[2]; }
        }
        for (let i = n0; i < P.length / 3; i++) { const q = id[i - n0] * 3, nn = norm([N[q], N[q + 1], N[q + 2]]); g.N[i * 3] = nn[0]; g.N[i * 3 + 1] = nn[1]; g.N[i * 3 + 2] = nn[2]; }
        return g;
    }

    // ── distance-field solids ──────────────────────────────────────────────
    /**
     * The surface where `sdf(x, y, z)` crosses zero inside `lo`..`hi`, by
     * naive surface nets on a grid of `step`; normals from the field's
     * gradient. Outward faces wind counterclockwise.
     */
    function surfaceNets(sdf, lo, hi, step) {
        const nx = Math.max(2, Math.ceil((hi[0] - lo[0]) / step)), ny = Math.max(2, Math.ceil((hi[1] - lo[1]) / step)), nz = Math.max(2, Math.ceil((hi[2] - lo[2]) / step));
        const sx = nx + 1, sy = ny + 1, F = new Float32Array(sx * sy * (nz + 1));
        const at = (i, j, k) => (k * sy + j) * sx + i;
        for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
            // The box's own walls are outside, so the solid always closes.
            const edge = i === 0 || j === 0 || k === 0 || i === nx || j === ny || k === nz;
            F[at(i, j, k)] = edge ? Math.max(step, sdf(lo[0] + i * step, lo[1] + j * step, lo[2] + k * step)) : sdf(lo[0] + i * step, lo[1] + j * step, lo[2] + k * step);
        }
        const cellIndex = new Int32Array(nx * ny * nz).fill(-1), P = [], N = [], I = [];
        const cid = (i, j, k) => (k * ny + j) * nx + i;
        const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
        const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
        const e = step * 0.5;
        for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const v = corners.map(c => F[at(i + c[0], j + c[1], k + c[2])]);
            let inside = 0;
            for (const x of v) if (x < 0) inside++;
            if (!inside || inside === 8) continue;
            let px = 0, py = 0, pz = 0, cnt = 0;
            for (const [a, b] of edges) {
                if ((v[a] < 0) === (v[b] < 0)) continue;
                const t = v[a] / (v[a] - v[b]), A = corners[a], B = corners[b];
                px += A[0] + (B[0] - A[0]) * t; py += A[1] + (B[1] - A[1]) * t; pz += A[2] + (B[2] - A[2]) * t; cnt++;
            }
            const x = lo[0] + (i + px / cnt) * step, y = lo[1] + (j + py / cnt) * step, z = lo[2] + (k + pz / cnt) * step;
            cellIndex[cid(i, j, k)] = P.length / 3;
            P.push(x, y, z);
            N.push(...norm([sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)]));
        }
        // A quad across every grid edge the surface crosses, from the four cells around it.
        const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) I.push(a, b, c, a, c, d); else I.push(a, c, b, a, d, c); };
        for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
            const a = F[at(i, j, k)], b = F[at(i + 1, j, k)];
            if ((a < 0) === (b < 0)) continue;
            quad(cellIndex[cid(i, j - 1, k - 1)], cellIndex[cid(i, j, k - 1)], cellIndex[cid(i, j, k)], cellIndex[cid(i, j - 1, k)], a < 0);
        }
        for (let k = 1; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
            const a = F[at(i, j, k)], b = F[at(i, j + 1, k)];
            if ((a < 0) === (b < 0)) continue;
            quad(cellIndex[cid(i - 1, j, k - 1)], cellIndex[cid(i - 1, j, k)], cellIndex[cid(i, j, k)], cellIndex[cid(i, j, k - 1)], a < 0);
        }
        for (let k = 0; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
            const a = F[at(i, j, k)], b = F[at(i, j, k + 1)];
            if ((a < 0) === (b < 0)) continue;
            quad(cellIndex[cid(i - 1, j - 1, k)], cellIndex[cid(i, j - 1, k)], cellIndex[cid(i, j, k)], cellIndex[cid(i - 1, j, k)], a < 0);
        }
        return { positions: Float32Array.from(P), normals: Float32Array.from(N), indices: Uint32Array.from(I) };
    }

    /** A welded solid brought down to about `target` triangles (QuadricDecimator), normals from the field when given. */
    function reduce(solid, target, sdf, stepHint) {
        let out = solid;
        if (Decimator && solid.indices.length / 3 > target) {
            const d = Decimator.decimate({ positions: solid.positions, normals: solid.normals, indices: solid.indices }, target, { boundaryWeight: 100 });
            out = { positions: Float32Array.from(d.positions), normals: Float32Array.from(d.normals), indices: Uint32Array.from(d.indices) };
        }
        if (sdf) {
            const e = (stepHint || 0.02) * 0.5, P = out.positions, N = out.normals;
            for (let i = 0; i < P.length; i += 3) {
                const x = P[i], y = P[i + 1], z = P[i + 2], n = norm([sdf(x + e, y, z) - sdf(x - e, y, z), sdf(x, y + e, z) - sdf(x, y - e, z), sdf(x, y, z + e) - sdf(x, y, z - e)]);
                N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2];
            }
        }
        return out;
    }

    /**
     * A welded solid laid into a geometry with box-projected uvs (each face
     * takes the axis it faces most, `tile` meters a picture), faceted (each
     * face its own flat normal, `facet` 1) or smooth (0), or between.
     * `color(p, n)` and `sway(p)` per point.
     */
    function solidInto(g, solid, o = {}) {
        const P = solid.positions, N = solid.normals, I = solid.indices, tile = o.tile || 1, facet = o.facet || 0;
        const keep = new Map(), start = g.P.length / 3;
        for (let t = 0; t < I.length; t += 3) {
            const ids = [I[t], I[t + 1], I[t + 2]], pts = ids.map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
            const fn = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
            if (!Number.isFinite(fn[0])) continue;
            const ax = Math.abs(fn[0]) > Math.abs(fn[1]) && Math.abs(fn[0]) > Math.abs(fn[2]) ? 0 : Math.abs(fn[1]) > Math.abs(fn[2]) ? 1 : 2;
            const out = ids.map((i, q) => {
                const key = facet > 0 ? null : i * 3 + ax;
                if (key !== null && keep.has(key)) return keep.get(key);
                const p = pts[q], sn = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], n = facet > 0 ? norm(mix(sn, fn, facet)) : sn;
                const uv = ax === 0 ? [p[2] * Math.sign(fn[0] || 1), p[1]] : ax === 1 ? [p[0], p[2] * Math.sign(fn[1] || 1)] : [-p[0] * Math.sign(fn[2] || 1), p[1]];
                const v = vert(g, p, n, uv[0] / tile + (o.u0 || 0), -uv[1] / tile, o.color ? o.color(p, n) : null, o.sway ? o.sway(p) : 0);
                if (key !== null) keep.set(key, v);
                return v;
            });
            g.I.push(out[0], out[1], out[2]);
        }
        return { start, end: g.P.length / 3 };
    }

    /**
     * A cover (moss, snow, sand) over the points `from`..`to` of `src`: each
     * point raised along its normal by `thick` times (2 mask - 1), so it rises
     * out of the surface where `mask(p, n)` passes one half and sinks under it
     * elsewhere; the meeting line follows the mask smoothly. Faces wholly under
     * are left out. Uvs repeat over `tile` meters.
     */
    function cover(src, from, to, mask, thick, o = {}) {
        const g = geo(), map = new Map(), m = [], tile = o.tile || 0.8;
        for (let i = from; i < to; i++) m[i - from] = mask([src.P[i * 3], src.P[i * 3 + 1], src.P[i * 3 + 2]], [src.N[i * 3], src.N[i * 3 + 1], src.N[i * 3 + 2]]);
        const take = i => {
            if (map.has(i)) return map.get(i);
            const p = [src.P[i * 3], src.P[i * 3 + 1], src.P[i * 3 + 2]], n = [src.N[i * 3], src.N[i * 3 + 1], src.N[i * 3 + 2]], k = m[i - from];
            const q = add(p, scale(n, thick * (2 * k - 1)));
            const ax = Math.abs(n[1]) > 0.55 ? 1 : Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2;
            const uv = ax === 1 ? [q[0], q[2]] : ax === 0 ? [q[2], q[1]] : [q[0], q[1]];
            const v = vert(g, q, n, uv[0] / tile, uv[1] / tile, o.color ? o.color(q, k) : null, src.S[i]);
            map.set(i, v);
            return v;
        };
        for (let t = 0; t < src.I.length; t += 3) {
            const a = src.I[t], b = src.I[t + 1], c = src.I[t + 2];
            if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
            if (Math.max(m[a - from], m[b - from], m[c - from]) < 0.45) continue;
            g.I.push(take(a), take(b), take(c));
        }
        return g;
    }

    /** The geometry's points moved so its lowest stands on y = 0; the drop. */
    function ground(list) {
        let low = Infinity;
        for (const g of list) for (let i = 1; i < g.P.length; i += 3) low = Math.min(low, g.P[i]);
        if (!Number.isFinite(low)) return 0;
        for (const g of list) for (let i = 1; i < g.P.length; i += 3) g.P[i] -= low;
        return low;
    }

    /** A material part from a geometry: typed arrays, the colors, and skin weights on the root (0) and the wind bone (1). */
    function part(g, material, sway) {
        const n = g.P.length / 3, joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
            const s = sway ? clamp(g.S[i], 0, 1) : 0;
            joints[i * 4] = 0; joints[i * 4 + 1] = 1; weights[i * 4] = 1 - s; weights[i * 4 + 1] = s;
            if (!sway) joints[i * 4 + 1] = 0;
        }
        const out = Object.assign({ positions: Float32Array.from(g.P), normals: Float32Array.from(g.N), uvs: Float32Array.from(g.T), index: Uint32Array.from(g.I), joints, weights }, material);
        if (material.vertexColors !== false) out.colors = Float32Array.from(g.C);
        delete out.vertexColors;
        return out;
    }

    const api = { vec, rgb, linear, shift, noise, geo, vert, append, count, tube, spline, card, backFaces, ribbon, blob, smoothNormals, surfaceNets, reduce, solidInto, cover, ground, part, roll: s => Random.roll(s) };
    root.RRNatureKit = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
