/**
 * RRCharacterBodyArtMotifs - the vector library behind body art: tattoo
 * motifs, war paint, scars and implant lines, all drawn here from code
 * (original designs, nothing traced), and the evaluator that answers
 * "how much ink, of which tone, is at this point" for the skin painter.
 *
 * A motif is built as primitives in its own units (about -1..1 across):
 * strokes (polylines with a half width per point), fills (closed rings,
 * even-odd), dots. Each primitive carries a tone: 'line' (the main ink),
 * 'fillA' and 'fillB' (the motif's two fill colors), 'shade' (shading at a
 * density, stippled or soft by style), 'hi' (white highlight) or 'knock'
 * (clears what lies under it: negative space). Later primitives cover
 * earlier ones. The compiled motif bins its pieces in a grid, so a texel
 * looks at a handful of segments; a band motif repeats with a period.
 *
 * Layouts: 'emblem' (one design), 'band' (a strip that repeats round a
 * limb: x is periodic with `P`), 'sleeve' (a band repeated or a helix over
 * a region `H` tall).
 */
(function(root) {
    'use strict';

    // ── small math ────────────────────────────────────────────────────────
    const TAU = Math.PI * 2;
    const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
    function rng(seed) {
        let s = (seed >>> 0) || 1;
        return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    }
    const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    function bez(a, b, c, d, n = 16) {
        const out = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, u = 1 - t;
            out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
        }
        return out;
    }
    /** A smooth curve through points (Catmull-Rom), `n` samples per span; `closed` joins the ends. */
    function spline(points, n = 8, closed = false) {
        const P = points, m = P.length, out = [];
        if (m < 3) return P.map(p => p.slice());
        const at = i => (closed ? P[(i % m + m) % m] : P[Math.max(0, Math.min(m - 1, i))]);
        const spans = closed ? m : m - 1;
        for (let i = 0; i < spans; i++) {
            const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
            for (let k = 0; k < n; k++) {
                const t = k / n, t2 = t * t, t3 = t2 * t;
                out.push([0, 1].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
            }
        }
        out.push(closed ? out[0].slice() : P[m - 1].slice());
        return out;
    }
    function circlePts(cx, cy, rx, ry = rx, n = 36, a0 = 0, a1 = TAU) {
        const out = [], full = Math.abs(a1 - a0 - TAU) < 1e-9;
        const steps = full ? n : Math.max(2, Math.round(n * Math.abs(a1 - a0) / TAU));
        for (let i = 0; i <= steps; i++) { if (full && i === steps) break; const a = a0 + (a1 - a0) * i / steps; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
        return out;
    }
    const xf = (pts, { x = 0, y = 0, r = 0, s = 1, sx = s, sy = s } = {}) => {
        const c = Math.cos(r), n = Math.sin(r);
        return pts.map(p => [x + (p[0] * sx) * c - (p[1] * sy) * n, y + (p[0] * sx) * n + (p[1] * sy) * c]);
    };
    /** Tangents and normals along a polyline. */
    function frames(pts) {
        return pts.map((p, i) => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            let dx = b[0] - a[0], dy = b[1] - a[1];
            const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
            return { t: [dx, dy], n: [-dy, dx] };
        });
    }
    /** An outline round a spine with a half width per point `w(t)`, offset to one side by `bias(t)` (share of the width). */
    function outline(spine, w, bias) {
        const F = frames(spine), left = [], right = [], n = spine.length;
        spine.forEach((p, i) => {
            const t = n > 1 ? i / (n - 1) : 0, hw = w(t), b = bias ? bias(t) : 0;
            left.push([p[0] + F[i].n[0] * hw * (1 + b), p[1] + F[i].n[1] * hw * (1 + b)]);
            right.push([p[0] - F[i].n[0] * hw * (1 - b), p[1] - F[i].n[1] * hw * (1 - b)]);
        });
        return left.concat(right.reverse());
    }
    /** A point along a polyline at a share of its length, with its frame. */
    function along(pts, t) {
        const L = [0];
        for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const want = clamp01(t) * L[L.length - 1];
        let i = 1;
        while (i < L.length - 1 && L[i] < want) i++;
        const u = (want - L[i - 1]) / ((L[i] - L[i - 1]) || 1), p = lerp2(pts[i - 1], pts[i], u);
        let dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        return { p, t: [dx, dy], n: [-dy, dx], length: L[L.length - 1] };
    }

    // ── shapes ────────────────────────────────────────────────────────────
    class Shape {
        constructor() { this.prims = []; }
        /** A stroke: points, a half width (number, per-point array or fn(t)), a tone; `soft` fades from its middle (airbrushed shading). */
        stroke(pts, w, tone = 'line', o = {}) {
            if (pts.length < 2) return this;
            const n = pts.length, hw = new Float32Array(n), flat = new Float32Array(n * 2);
            for (let i = 0; i < n; i++) { flat[i * 2] = pts[i][0]; flat[i * 2 + 1] = pts[i][1]; hw[i] = typeof w === 'function' ? w(n > 1 ? i / (n - 1) : 0, i) : Array.isArray(w) ? w[i] : w; }
            this.prims.push({ type: 's', tone, density: o.density ?? 1, soft: !!o.soft, pts: flat, hw, relief: o.relief ?? 1 });
            return this;
        }
        /** A filled area: one ring or several (even-odd, so a ring inside another is a hole). */
        fill(rings, tone = 'line', o = {}) {
            if (!rings.length) return this;
            if (typeof rings[0][0] === 'number') rings = [rings];
            const flat = rings.filter(r => r.length > 2).map(r => { const a = new Float32Array(r.length * 2); r.forEach((p, i) => { a[i * 2] = p[0]; a[i * 2 + 1] = p[1]; }); return a; });
            if (flat.length) this.prims.push({ type: 'f', tone, density: o.density ?? 1, rings: flat, relief: o.relief ?? 1 });
            return this;
        }
        dot(x, y, r, tone = 'line', o = {}) { this.prims.push({ type: 'd', tone, density: o.density ?? 1, x, y, r, relief: o.relief ?? 1 }); return this; }
        ring(x, y, r, w, tone = 'line', o = {}) { const c = circlePts(x, y, r, r, Math.max(24, Math.round(r * 120))); c.push(c[0]); return this.stroke(c, w, tone, o); }
        add(other, t) {
            for (const p of other.prims) this.prims.push(t ? transformPrim(p, t) : p);
            return this;
        }
        mirrored() { const s = new Shape(); for (const p of this.prims) s.prims.push(transformPrim(p, { sx: -1 })); return s; }
        /** The shape and its mirror across x = 0. */
        symmetric() { return new Shape().add(this).add(this.mirrored()); }
    }
    function transformPrim(p, t) {
        const { x = 0, y = 0, r = 0, s = 1, sx = s, sy = s } = t, c = Math.cos(r), n = Math.sin(r);
        const move = a => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i += 2) { const px = a[i] * sx, py = a[i + 1] * sy; o[i] = x + px * c - py * n; o[i + 1] = y + px * n + py * c; } return o; };
        const k = Math.sqrt(Math.abs(sx * sy));
        if (p.type === 's') return Object.assign({}, p, { pts: move(p.pts), hw: p.hw.map(v => v * k) });
        if (p.type === 'f') return Object.assign({}, p, { rings: p.rings.map(move) });
        const q = move(new Float32Array([p.x, p.y]));
        return Object.assign({}, p, { x: q[0], y: q[1], r: p.r * k });
    }

    // ── evaluation ────────────────────────────────────────────────────────
    const TONES = ['line', 'fillA', 'fillB', 'shade', 'hi'];
    const TONE_INDEX = { line: 0, fillA: 1, fillB: 2, shade: 3, hi: 4 };

    /**
     * Bins a shape for quick lookups. `period` > 0 repeats it along x
     * (pieces crossing 0 or the period are copied across). `margin` is the
     * widest soft edge it will be asked for, in its own units.
     */
    function compile(shape, opts = {}) {
        const period = opts.period || 0, margin = opts.margin ?? 0.05;
        let prims = shape.prims;
        if (period > 0) {
            const extra = [];
            for (const p of prims) {
                const b = primBox(p);
                if (b[0] - margin < 0) extra.push(transformPrim(p, { x: period }));
                if (b[2] + margin > period) extra.push(transformPrim(p, { x: -period }));
            }
            // Keep the order: a copy draws where its original would.
            prims = prims.concat(extra.map((p, i) => Object.assign({}, p, { order: prims.indexOf(extra[i]) })));
        }
        prims = prims.map((p, i) => Object.assign({ order: i }, p, { box: primBox(p) }));
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of prims) { x0 = Math.min(x0, p.box[0]); y0 = Math.min(y0, p.box[1]); x1 = Math.max(x1, p.box[2]); y1 = Math.max(y1, p.box[3]); }
        if (period > 0) { x0 = Math.min(x0, 0); x1 = Math.max(x1, period); }
        if (!isFinite(x0)) return { empty: true, box: [0, 0, 0, 0], period };
        x0 -= margin; y0 -= margin; x1 += margin; y1 += margin;
        const G = Math.max(16, Math.min(96, Math.round(Math.sqrt(prims.length * 40))));
        const cw = (x1 - x0) / G, ch = (y1 - y0) / G;
        const cells = Array.from({ length: G * G }, () => null), rows = Array.from({ length: G }, () => []);
        const put = (bx0, by0, bx1, by1, item) => {
            const i0 = Math.max(0, Math.floor((bx0 - x0) / cw)), i1 = Math.min(G - 1, Math.floor((bx1 - x0) / cw));
            const j0 = Math.max(0, Math.floor((by0 - y0) / ch)), j1 = Math.min(G - 1, Math.floor((by1 - y0) / ch));
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * G + i] || (cells[j * G + i] = [])).push(item);
        };
        prims.forEach((p, k) => {
            if (p.type === 's') {
                for (let i = 0; i + 2 < p.pts.length; i += 2) {
                    const w = Math.max(p.hw[i / 2], p.hw[i / 2 + 1]) + margin;
                    put(Math.min(p.pts[i], p.pts[i + 2]) - w, Math.min(p.pts[i + 1], p.pts[i + 3]) - w, Math.max(p.pts[i], p.pts[i + 2]) + w, Math.max(p.pts[i + 1], p.pts[i + 3]) + w, { k, i });
                }
            } else if (p.type === 'd') {
                put(p.x - p.r - margin, p.y - p.r - margin, p.x + p.r + margin, p.y + p.r + margin, { k, i: -1 });
            } else {
                // A fill: its edges near each cell (for the soft edge) and its whole box (it may cover a cell with no edge).
                p.rings.forEach((ring, r) => {
                    for (let i = 0; i < ring.length; i += 2) {
                        const j = (i + 2) % ring.length;
                        const ax = ring[i], ay = ring[i + 1], bx = ring[j], by = ring[j + 1];
                        put(Math.min(ax, bx) - margin, Math.min(ay, by) - margin, Math.max(ax, bx) + margin, Math.max(ay, by) + margin, { k, r, i });
                        const r0 = Math.max(0, Math.floor((Math.min(ay, by) - y0) / ch)), r1 = Math.min(G - 1, Math.floor((Math.max(ay, by) - y0) / ch));
                        for (let q = r0; q <= r1; q++) rows[q].push({ k, ax, ay, bx, by });
                    }
                });
                put(p.box[0], p.box[1], p.box[2], p.box[3], { k, i: -2 });
            }
        });
        // Each cell's pieces by primitive, in drawing order.
        const lists = cells.map(list => {
            if (!list) return null;
            const by = new Map();
            for (const it of list) { if (!by.has(it.k)) by.set(it.k, []); by.get(it.k).push(it); }
            return [...by.entries()].sort((a, b) => prims[a[0]].order - prims[b[0]].order || a[0] - b[0]);
        });
        return { prims, lists, rows, G, x0, y0, cw, ch, period, box: [x0 + margin, y0 + margin, x1 - margin, y1 - margin] };
    }

    function primBox(p) {
        if (p.type === 'd') return [p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, w = 0;
        const arrays = p.type === 's' ? [p.pts] : p.rings;
        for (const a of arrays) for (let i = 0; i < a.length; i += 2) { x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]); y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]); }
        if (p.type === 's') for (const v of p.hw) w = Math.max(w, v);
        return [x0 - w, y0 - w, x1 + w, y1 + w];
    }

    function segDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + dx * t - px, ey = ay + dy * t - py;
        segDist.t = t;
        return Math.sqrt(ex * ex + ey * ey);
    }

    /**
     * What a compiled motif puts at (x, y): `out.w` the tones' weights
     * (line, fillA, fillB, shade, hi; their sum is the ink's cover), `out.alpha`
     * the cover, `out.ridge` how near the middle of a stroke the point is
     * (0..1, for raised or sunken scars), `out.density` the shade's density.
     * `aa` is the soft edge's width in motif units.
     */
    function evaluate(M, x, y, aa, out) {
        const w = out.w;
        w[0] = w[1] = w[2] = w[3] = w[4] = 0;
        out.alpha = 0; out.ridge = 0; out.relief = 0;
        if (M.empty) return out;
        if (M.period > 0) { x = x % M.period; if (x < 0) x += M.period; }
        const i = Math.floor((x - M.x0) / M.cw), j = Math.floor((y - M.y0) / M.ch);
        if (i < 0 || j < 0 || i >= M.G || j >= M.G) return out;
        const list = M.lists[j * M.G + i];
        if (!list) return out;
        const half = aa * 0.5;
        for (const [k, items] of list) {
            const p = M.prims[k];
            let cov = 0, ridge = 0;
            if (p.type === 's') {
                let best = -Infinity;
                for (const it of items) {
                    const a = it.i;
                    const d = segDist(x, y, p.pts[a], p.pts[a + 1], p.pts[a + 2], p.pts[a + 3]);
                    const hw = p.hw[a / 2] + (p.hw[a / 2 + 1] - p.hw[a / 2]) * segDist.t;
                    if (p.soft) { const v = hw > 0 ? 1 - d / hw : 0; if (v > best) best = v; }
                    else { const v = (hw - d) / aa + 0.5; if (v > best) { best = v; ridge = hw > 0 ? clamp01(1 - d / hw) : 0; } }
                }
                cov = p.soft ? (best > 0 ? best * best * (3 - 2 * best) : 0) : clamp01(best);
                if (p.soft) ridge = cov;
            } else if (p.type === 'd') {
                const d = Math.hypot(x - p.x, y - p.y);
                cov = clamp01((p.r - d) / aa + 0.5);
                ridge = p.r > 0 ? clamp01(1 - d / p.r) : 0;
            } else {
                const b = p.box;
                if (x < b[0] - half || x > b[2] + half || y < b[1] - half || y > b[3] + half) continue;
                // Inside: crossings of a ray to +x, over this fill's edges in the row.
                const row = M.rows[Math.max(0, Math.min(M.G - 1, j))];
                let inside = false;
                for (const e of row) {
                    if (e.k !== k) continue;
                    if ((e.ay > y) !== (e.by > y) && x < e.ax + (y - e.ay) * (e.bx - e.ax) / (e.by - e.ay)) inside = !inside;
                }
                let d = Infinity;
                for (const it of items) {
                    if (it.i < 0) continue;
                    const ring = p.rings[it.r], a = it.i, c = (a + 2) % ring.length;
                    const dd = segDist(x, y, ring[a], ring[a + 1], ring[c], ring[c + 1]);
                    if (dd < d) d = dd;
                }
                cov = inside ? clamp01(0.5 + d / aa) : clamp01(0.5 - d / aa);
                ridge = inside ? clamp01(d / 0.06) : 0;
            }
            if (cov <= 0) continue;
            const amount = cov * (p.tone === 'knock' ? 1 : p.density);
            if (p.tone === 'knock') {
                for (let t = 0; t < 5; t++) w[t] *= 1 - cov;
                out.ridge *= 1 - cov; out.relief *= 1 - cov;
                continue;
            }
            const t = TONE_INDEX[p.tone];
            if (t === 3) {
                // Shading sits under what follows and adds to what lies under it.
                w[3] = Math.min(1 - w[0] - w[1] - w[2] - w[4], w[3] + amount * (1 - w[3]));
            } else {
                for (let q = 0; q < 5; q++) w[q] *= 1 - amount;
                w[t] += amount;
            }
            if (ridge * cov > out.ridge) out.ridge = ridge * cov;
            out.relief = Math.max(out.relief * (1 - cov), cov * ridge * p.relief);
        }
        out.alpha = Math.min(1, w[0] + w[1] + w[2] + w[3] + w[4]);
        return out;
    }

    // ── shared motif pieces ───────────────────────────────────────────────
    /** A blade (tribal): a pointed, curving shape along a spine, hooked at its end; a gap of skin round it first. */
    function blade(S, spine, maxW, o = {}) {
        const pts = spine.length > 4 ? spine : spline(spine, 10);
        const a = o.a ?? 0.75, b = o.b ?? 1.15;
        const w = t => maxW * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(t), a)), b) + 0.002;
        const body = outline(pts, w, o.bias ? t => o.bias * Math.sin(Math.PI * t) : null);
        if (o.gap !== false) S.fill(outline(pts, t => w(t) + (o.gap ?? 0.028), o.bias ? t => o.bias * Math.sin(Math.PI * t) : null), 'knock');
        S.fill(body, o.tone || 'line');
        return S;
    }
    /** A leaf: an outline (two arcs to a point), filled, with a midrib and a few veins. */
    function leaf(S, base, angle, len, wid, o = {}) {
        const tone = o.tone || 'fillB', line = o.line ?? 0.012;
        const half = t => wid * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) * (1 + (o.curl || 0) * t);
        const spine = Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [t * len, (o.bend || 0) * len * t * t]; });
        const shape = xf(outline(spine, half), { x: base[0], y: base[1], r: angle });
        if (!o.outlineOnly) S.fill(shape, tone);
        if (o.shade !== false && !o.outlineOnly) S.stroke(xf(spine.slice(0, 9).map(p => [p[0], p[1] - wid * 0.25]), { x: base[0], y: base[1], r: angle }), wid * 0.35, 'shade', { soft: true, density: 0.35 });
        S.stroke(shape.concat([shape[0]]), line, 'line');
        S.stroke(xf(spine.slice(0, 11), { x: base[0], y: base[1], r: angle }), t => line * (0.9 - 0.5 * t), 'line');
        if (o.veins !== false) for (let k = 1; k <= 4; k++) {
            const t = k / 5.2;
            for (const side of [1, -1]) {
                const s0 = [t * len, (o.bend || 0) * len * t * t], s1 = [Math.min(len * 0.98, (t + 0.13) * len), s0[1] + side * half(t + 0.08) * 0.78];
                S.stroke(xf([s0, s1], { x: base[0], y: base[1], r: angle }), line * 0.45, 'line');
            }
        }
        return S;
    }
    /** Dots along a path (dotwork lines). */
    function dotted(S, pts, step, r, tone = 'line') {
        const L = along(pts, 1).length, n = Math.max(1, Math.round(L / step));
        for (let k = 0; k <= n; k++) { const a = along(pts, k / n); S.dot(a.p[0], a.p[1], typeof r === 'function' ? r(k / n) : r, tone); }
        return S;
    }

    // ── tattoo motifs ─────────────────────────────────────────────────────
    function tribalEmblem(seed) {
        const R = rng(seed), S = new Shape(), j = () => (R() - 0.5) * 0.05;
        // Flames rising from one root: a tall spike in the middle, long S-curved blades either side,
        // each swelling near its root and drawn out to a fine curled point.
        const flame = { a: 0.55, b: 1.0 };
        blade(S, spline([[0, -0.92], [0.02, -0.4], [-0.02, 0.3], [0, 0.98]], 10), 0.075, { a: 0.8, b: 0.9 });
        const side = new Shape();
        blade(side, spline([[0.04, -0.78], [0.34, -0.52 + j()], [0.6, -0.05], [0.7, 0.42], [0.6, 0.8], [0.44, 0.92], [0.36, 0.84]], 12), 0.135, flame);
        blade(side, spline([[0.07, -0.42], [0.27, -0.12], [0.38, 0.3 + j()], [0.32, 0.64], [0.2, 0.76], [0.16, 0.68]], 12), 0.09, flame);
        blade(side, spline([[0.1, -0.98], [0.5, -0.9], [0.84, -0.62 + j()], [0.98, -0.18], [0.92, 0.18], [0.82, 0.26]], 12), 0.11, flame);
        // Thorns off the great blade's back, pointing up and out.
        blade(side, spline([[0.62, -0.2], [0.8, -0.02], [0.88, 0.16]], 8), 0.04, { a: 0.4, gap: false });
        blade(side, spline([[0.66, 0.3], [0.82, 0.5], [0.84, 0.66]], 8), 0.032, { a: 0.4, gap: false });
        blade(side, spline([[0.36, -0.64], [0.52, -0.66], [0.62, -0.56]], 8), 0.035, { a: 0.4, gap: false });
        S.add(side).add(side.mirrored());
        return S;
    }
    function tribalBand(seed, P) {
        const R = rng(seed + 7), S = new Shape(), k = P / 2;
        const j = () => (R() - 0.5) * 0.08;
        // Interlocking sweeps rising and falling along the band, each heavy at its root.
        blade(S, spline([[0.0, -0.9], [0.45 * k, -0.62 + j()], [0.95 * k, -0.05], [1.4 * k, 0.6], [1.8 * k, 0.78], [1.95 * k, 0.55], [1.82 * k, 0.38]], 10), 0.24, { a: 0.4, b: 0.85 });
        blade(S, spline([[1.0 * k, 0.95], [1.25 * k, 0.55 + j()], [1.45 * k, 0.0], [1.7 * k, -0.55], [1.98 * k, -0.78]], 10), 0.15, { a: 0.5, b: 0.85 });
        blade(S, spline([[0.1 * k, 0.92], [0.42 * k, 0.75], [0.62 * k, 0.42], [0.55 * k, 0.22]], 8), 0.1, { a: 0.45 });
        blade(S, spline([[1.12 * k, -0.95], [1.35 * k, -0.7], [1.3 * k, -0.45]], 8), 0.08, { a: 0.5 });
        return S;
    }

    function mandalaEmblem(seed) {
        const R = rng(seed), S = new Shape();
        const n1 = [8, 10, 12][Math.floor(R() * 3)], n2 = n1 * 2, n3 = n1 * 4;
        // Outer crown of small spikes, solid.
        for (let k = 0; k < n3; k++) {
            const a = k / n3 * TAU, b = (k + 0.5) / n3 * TAU, c = (k + 1) / n3 * TAU;
            S.fill([[Math.cos(a) * 0.86, Math.sin(a) * 0.86], [Math.cos(b) * 0.99, Math.sin(b) * 0.99], [Math.cos(c) * 0.86, Math.sin(c) * 0.86]], 'line');
        }
        S.ring(0, 0, 0.845, 0.012);
        // Scallops with a dot in each.
        for (let k = 0; k < n2; k++) {
            const a = k / n2 * TAU, h = Math.PI / n2;
            S.stroke((spline([[Math.cos(a - h) * 0.72, Math.sin(a - h) * 0.72], [Math.cos(a) * 0.82, Math.sin(a) * 0.82], [Math.cos(a + h) * 0.72, Math.sin(a + h) * 0.72]], 8)), 0.01);
            S.dot(Math.cos(a) * 0.765, Math.sin(a) * 0.765, 0.016);
        }
        S.ring(0, 0, 0.715, 0.008);
        // Pointed petals, outlined, their tips shaded.
        for (let k = 0; k < n2; k++) {
            const a = (k + 0.5) / n2 * TAU, h = Math.PI / n2 * 0.92;
            const petal = spline([[Math.cos(a - h) * 0.46, Math.sin(a - h) * 0.46], [Math.cos(a - h * 0.55) * 0.6, Math.sin(a - h * 0.55) * 0.6], [Math.cos(a) * 0.7, Math.sin(a) * 0.7], [Math.cos(a + h * 0.55) * 0.6, Math.sin(a + h * 0.55) * 0.6], [Math.cos(a + h) * 0.46, Math.sin(a + h) * 0.46]], 6);
            S.fill(petal, 'shade', { density: 0.18 });
            S.stroke([[Math.cos(a) * 0.62, Math.sin(a) * 0.62], [Math.cos(a) * 0.69, Math.sin(a) * 0.69]], 0.02, 'shade', { soft: true, density: 0.8 });
            S.stroke(petal, 0.011);
            S.stroke([[Math.cos(a) * 0.5, Math.sin(a) * 0.5], [Math.cos(a) * 0.63, Math.sin(a) * 0.63]], 0.006);
        }
        S.ring(0, 0, 0.455, 0.01);
        // A ring of dots.
        for (let k = 0; k < n3; k++) { const a = k / n3 * TAU; S.dot(Math.cos(a) * 0.415, Math.sin(a) * 0.415, 0.013); }
        // Inner petals: wide, doubled outline, filled.
        for (let k = 0; k < n1; k++) {
            const a = k / n1 * TAU, h = Math.PI / n1 * 0.95;
            const petal = spline([[0, 0], [Math.cos(a - h) * 0.22, Math.sin(a - h) * 0.22], [Math.cos(a - h * 0.4) * 0.34, Math.sin(a - h * 0.4) * 0.34], [Math.cos(a) * 0.38, Math.sin(a) * 0.38], [Math.cos(a + h * 0.4) * 0.34, Math.sin(a + h * 0.4) * 0.34], [Math.cos(a + h) * 0.22, Math.sin(a + h) * 0.22]], 6, true);
            S.fill(petal, 'fillA', { density: 0.9 });
            S.stroke(petal, 0.011);
            S.stroke(xf(petal, { s: 0.62 }), 0.007);
        }
        S.ring(0, 0, 0.11, 0.014);
        S.dot(0, 0, 0.05);
        return S;
    }
    function mandalaBand(seed, P) {
        // Lace: scallops along the lower edge, pointed arches and dots above, a fine line top and bottom.
        const S = new Shape(), n = 3, u = P / n;
        S.stroke([[-0.1, 0.92], [P + 0.1, 0.92]], 0.012).stroke([[-0.1, -0.82], [P + 0.1, -0.82]], 0.02);
        for (let k = 0; k < n; k++) {
            const c = (k + 0.5) * u;
            S.stroke(spline([[c - u / 2, -0.82], [c, -0.98], [c + u / 2, -0.82]], 8), 0.012);
            S.dot(c, -0.9, 0.025);
            const arch = spline([[c - u * 0.42, -0.82], [c - u * 0.3, -0.1], [c, 0.6], [c + u * 0.3, -0.1], [c + u * 0.42, -0.82]], 8);
            S.fill(arch, 'shade', { density: 0.16 }).stroke(arch, 0.012);
            const inner = xf(arch.map(p => [p[0] - c, p[1] + 0.82]), { x: c, y: -0.82, s: 0.62 });
            S.fill(inner, 'fillA', { density: 0.85 }).stroke(inner, 0.009);
            S.dot(c, 0.75, 0.03);
            S.dot(c + u / 2, 0.15, 0.02).dot(c + u / 2, 0.4, 0.014).dot(c + u / 2, 0.6, 0.01);
        }
        return S;
    }

    function rose(S, cx, cy, R, seed) {
        const r = rng(seed);
        // Back petals: wide cupped shapes round the head, filled and shaded toward their base.
        const n = 5, a0 = r() * TAU;
        for (let k = 0; k < n; k++) {
            const a = a0 + k / n * TAU, h = TAU / n * 0.62;
            const pts = spline([[Math.cos(a - h) * 0.45, Math.sin(a - h) * 0.4], [Math.cos(a - h * 0.6) * 0.95, Math.sin(a - h * 0.6) * 0.85], [Math.cos(a) * 1.02, Math.sin(a) * 0.9], [Math.cos(a + h * 0.6) * 0.95, Math.sin(a + h * 0.6) * 0.85], [Math.cos(a + h) * 0.45, Math.sin(a + h) * 0.4]], 6).map(p => [cx + p[0] * R, cy + p[1] * R]);
            const shape = pts.concat([[cx, cy]]);
            S.fill(shape, 'fillA');
            S.stroke([[cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.4], [cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.7]], R * 0.22, 'shade', { soft: true, density: 0.55 });
            S.stroke(pts, R * 0.035);
            // The rolled lip of the petal.
            S.stroke(pts.slice(4, pts.length - 4).map(p => [cx + (p[0] - cx) * 0.9, cy + (p[1] - cy) * 0.9]), R * 0.016);
        }
        // The cup: overlapping inner petals.
        for (let k = 0; k < 3; k++) {
            const a = a0 + 0.6 + k / 3 * TAU;
            const arc = circlePts(cx, cy + R * 0.05, R * 0.5, R * 0.42, 24, a, a + Math.PI * 1.1);
            S.fill(arc.concat([[cx, cy]]), 'fillA');
            S.stroke(arc, R * 0.03);
            S.stroke(circlePts(cx, cy + R * 0.05, R * 0.4, R * 0.33, 18, a + 0.3, a + 1.6), R * 0.14, 'shade', { soft: true, density: 0.45 });
        }
        // The bud: a spiral.
        const spiral = [];
        for (let i = 0; i <= 40; i++) { const t = i / 40, a = a0 + t * Math.PI * 3.4, rr = R * (0.05 + 0.27 * t); spiral.push([cx + Math.cos(a) * rr, cy + R * 0.08 + Math.sin(a) * rr * 0.85]); }
        S.fill(circlePts(cx, cy + R * 0.08, R * 0.3, R * 0.26, 24), 'fillA');
        S.stroke(spiral.slice(0, 26), R * 0.12, 'shade', { soft: true, density: 0.7 });
        S.stroke(spiral, t => R * (0.018 + 0.016 * t));
    }
    function floralEmblem(seed) {
        const S = new Shape(), R = rng(seed);
        // The stem with thorns, under everything.
        const stem = spline([[0.05, -0.05], [-0.05, -0.45], [0.08, -0.75], [-0.02, -0.98]], 8);
        S.fill(outline(stem, t => 0.028 - 0.01 * t), 'fillB');
        S.stroke(outline(stem, t => 0.028 - 0.01 * t).concat([outline(stem, t => 0.028 - 0.01 * t)[0]]), 0.009);
        for (const t of [0.3, 0.62, 0.85]) { const a = along(stem, t), s = t > 0.5 ? 1 : -1; S.fill([[a.p[0] + a.n[0] * 0.02 * s, a.p[1] + a.n[1] * 0.02 * s], [a.p[0] + a.n[0] * 0.07 * s - a.t[0] * 0.03, a.p[1] + a.n[1] * 0.07 * s - a.t[1] * 0.03], [a.p[0] + a.t[0] * 0.04, a.p[1] + a.t[1] * 0.04]], 'line'); }
        leaf(S, [-0.02, -0.38], Math.PI * 1.08 + (R() - 0.5) * 0.2, 0.52, 0.15, { bend: 0.25 });
        leaf(S, [0.04, -0.6], -0.35 + (R() - 0.5) * 0.2, 0.46, 0.13, { bend: -0.25 });
        leaf(S, [0.25, 0.35], 0.55, 0.42, 0.12, { bend: -0.2 });
        // A bud to one side.
        const bud = spline([[-0.55, 0.42], [-0.66, 0.6], [-0.58, 0.82], [-0.48, 0.62], [-0.55, 0.42]], 6);
        S.stroke(spline([[-0.2, 0.05], [-0.42, 0.22], [-0.55, 0.42]], 6), 0.016, 'fillB').stroke(spline([[-0.2, 0.05], [-0.42, 0.22], [-0.55, 0.42]], 6), 0.006);
        S.fill(bud, 'fillA').stroke(bud, 0.012);
        leaf(S, [-0.55, 0.42], Math.PI * 0.62, 0.15, 0.05, { veins: false, shade: false });
        leaf(S, [-0.55, 0.42], Math.PI * 0.4, 0.14, 0.045, { veins: false, shade: false });
        rose(S, 0.05, 0.12, 0.44, seed);
        return S;
    }
    function vine(S, P, seed, y0 = 0, amp = 0.45, roses = true) {
        // A stem waving along the band (one wave per period), leaves alternating, a rosebud each period.
        const pts = Array.from({ length: 41 }, (_, i) => { const x = i / 40 * P; return [x, y0 + Math.sin(x / P * TAU) * amp]; });
        S.stroke(pts, 0.03, 'fillB').stroke(outline(pts, () => 0.03).slice(0, 41), 0.008).stroke(outline(pts, () => 0.03).slice(41), 0.008);
        for (const [t, s] of [[0.12, 1], [0.38, -1], [0.62, 1], [0.88, -1]]) {
            const x = t * P, y = y0 + Math.sin(t * TAU) * amp, slope = Math.atan2(Math.cos(t * TAU) * amp * TAU / P, 1);
            leaf(S, [x, y], slope + s * 0.9, 0.36, 0.11, { bend: s * 0.2 });
        }
        if (roses) rose(S, 0.5 * P, y0, 0.3, seed); else S.dot(0.5 * P, y0 + 0.08, 0.05, 'fillA');
    }

    function botanicalEmblem(seed) {
        const S = new Shape(), R = rng(seed);
        // A fine-line sprig: a curving stem, paired leaves in outline, a few berries.
        const stem = spline([[-0.1, -0.98], [0.02, -0.5], [-0.05, 0.1], [0.12, 0.6], [0.05, 0.95]], 10);
        S.stroke(stem, t => 0.012 - 0.005 * t);
        for (let k = 0; k < 9; k++) {
            const t = 0.1 + k * 0.095, a = along(stem, t), ang = Math.atan2(a.t[1], a.t[0]);
            const len = 0.3 * (1 - t * 0.55) * (0.85 + R() * 0.3);
            for (const s of [1, -1]) if (k < 8 || s > 0) leaf(S, a.p, ang + s * (0.75 - t * 0.25), len, len * 0.28, { outlineOnly: true, line: 0.007, veins: k % 2 === 0, bend: s * 0.12 });
        }
        for (let k = 0; k < 4; k++) {
            const a = along(stem, 0.25 + k * 0.17), s = k % 2 ? 1 : -1;
            const end = [a.p[0] + a.n[0] * 0.2 * s, a.p[1] + a.n[1] * 0.2 * s + 0.05];
            S.stroke([a.p, end], 0.005);
            S.ring(end[0], end[1], 0.03, 0.006).dot(end[0] - 0.008, end[1] + 0.01, 0.007);
        }
        return S;
    }
    function botanicalBand(seed, P) { const S = new Shape(); vine(S, P, seed, 0, 0.35, false); return S; }

    function skullEmblem() {
        const S = new Shape();
        const cran = spline([[-0.6, 0.02], [-0.66, 0.42], [-0.45, 0.8], [0, 0.95], [0.45, 0.8], [0.66, 0.42], [0.6, 0.02], [0.5, -0.18], [0.4, -0.3], [0.33, -0.48], [0.2, -0.52], [-0.2, -0.52], [-0.33, -0.48], [-0.4, -0.3], [-0.5, -0.18]], 8, true);
        // Shading round the edge of the cranium and in the temples.
        S.stroke(cran, 0.09, 'shade', { soft: true, density: 0.45 });
        for (const s of [1, -1]) S.stroke(spline([[0.62 * s, 0.35], [0.5 * s, 0.1], [0.55 * s, -0.12]], 6), 0.08, 'shade', { soft: true, density: 0.6 });
        S.stroke(cran, 0.024);
        // Sockets: solid, a lighter rim at their top edge.
        for (const s of [1, -1]) {
            const eye = spline([[0.1 * s, 0.05], [0.18 * s, 0.24], [0.38 * s, 0.26], [0.47 * s, 0.1], [0.4 * s, -0.08], [0.2 * s, -0.08]], 6, true);
            S.fill(eye, 'line');
            S.stroke(spline([[0.14 * s, 0.25], [0.3 * s, 0.33], [0.48 * s, 0.22]], 6), 0.05, 'shade', { soft: true, density: 0.5 });
            // The cheekbone.
            S.stroke(spline([[0.47 * s, -0.08], [0.48 * s, -0.22], [0.35 * s, -0.27]], 6), 0.012);
            S.stroke(spline([[0.42 * s, -0.12], [0.38 * s, -0.24], [0.26 * s, -0.24]], 6), 0.05, 'shade', { soft: true, density: 0.45 });
        }
        // The nose: an inverted heart.
        S.fill(spline([[0, -0.08], [0.06, -0.14], [0.09, -0.25], [0.04, -0.3], [0, -0.26], [-0.04, -0.3], [-0.09, -0.25], [-0.06, -0.14]], 5, true), 'line');
        // Teeth: two rows, the gap between dark.
        S.fill([[-0.3, -0.37], [0.3, -0.37], [0.28, -0.44], [-0.28, -0.44]], 'line', { density: 0.9 });
        for (let k = 0; k < 8; k++) {
            const x0 = -0.28 + k * 0.07, top = spline([[x0 + 0.005, -0.36], [x0 + 0.01, -0.31], [x0 + 0.035, -0.3], [x0 + 0.06, -0.31], [x0 + 0.065, -0.36]], 4);
            S.stroke(top, 0.009);
            const low = spline([[x0 + 0.005, -0.45], [x0 + 0.012, -0.5], [x0 + 0.035, -0.51], [x0 + 0.058, -0.5], [x0 + 0.065, -0.45]], 4);
            S.stroke(low, 0.009);
        }
        // The jaw below, hinged under the cheekbones.
        const jaw = spline([[-0.4, -0.3], [-0.38, -0.55], [-0.28, -0.8], [0, -0.88], [0.28, -0.8], [0.38, -0.55], [0.4, -0.3]], 8);
        S.stroke(jaw, 0.1, 'shade', { soft: true, density: 0.3 }).stroke(jaw, 0.022);
        S.stroke([[-0.3, -0.52], [-0.25, -0.62]], 0.006).stroke([[0.3, -0.52], [0.25, -0.62]], 0.006);
        // A hairline crack over the brow.
        S.stroke([[0.15, 0.93], [0.2, 0.78], [0.14, 0.7], [0.22, 0.56], [0.19, 0.45]], t => 0.008 * (1 - t) + 0.002);
        return S;
    }

    /** A serpent's body along a path: its fill, belly plates, scales, outline and dorsal spines. `head` draws a dragon's head at the start. */
    function serpentBody(S, path, w0, o = {}) {
        const n = path.length, F = frames(path);
        const w = t => w0 * (o.taper === false ? 1 : (0.55 + 0.45 * Math.sin(Math.min(1, t * 1.1 + 0.15) * Math.PI * 0.85)) * (1 - Math.pow(t, 3) * 0.85)) + 0.01;
        const body = outline(path, w);
        S.fill(outline(path, t => w(t) + 0.03), 'knock');
        S.fill(body, 'fillA');
        // The belly: a pale band down one side with plates across it.
        const belly = outline(path, t => w(t) * 0.42, () => -1.15);
        S.fill(belly, 'fillB');
        for (let i = 2; i < n - 2; i += 2) {
            const t = i / (n - 1), hw = w(t), p = path[i], N = F[i].n;
            S.stroke([[p[0] - N[0] * hw * 0.98, p[1] - N[1] * hw * 0.98], [p[0] - N[0] * hw * 0.2, p[1] - N[1] * hw * 0.2]], hw * 0.06);
        }
        // Scales on the back: little arcs in rows.
        for (let i = 1; i < n - 1; i++) {
            const t = i / (n - 1), hw = w(t), p = path[i], N = F[i].n, T = F[i].t;
            for (const off of i % 2 ? [0.35, 0.75] : [0.55]) {
                const c = [p[0] + N[0] * hw * off, p[1] + N[1] * hw * off], r = hw * 0.22;
                const arc = [-1, -0.5, 0, 0.5, 1].map(k => [c[0] + N[0] * r * k + T[0] * r * (1 - k * k) * -0.9, c[1] + N[1] * r * k + T[1] * r * (1 - k * k) * -0.9]);
                S.stroke(arc, hw * 0.045);
            }
        }
        S.stroke(outline(path, t => w(t) * 0.75, () => 0.35).slice(0, n), t => w0 * 0.25, 'shade', { soft: true, density: 0.5 });
        S.stroke(body.slice(0, n), t => 0.012 + w0 * 0.08 * (1 - t));
        S.stroke(body.slice(n), t => 0.012 + w0 * 0.08 * t);
        // Spines along the back edge.
        for (let i = 3; i < n - 3; i += 3) {
            const t = i / (n - 1), hw = w(t), p = path[i], N = F[i].n, T = F[i].t;
            const b0 = [p[0] + N[0] * hw * 0.95 - T[0] * hw * 0.35, p[1] + N[1] * hw * 0.95 - T[1] * hw * 0.35], b1 = [p[0] + N[0] * hw * 0.95 + T[0] * hw * 0.35, p[1] + N[1] * hw * 0.95 + T[1] * hw * 0.35];
            const tip = [p[0] + N[0] * hw * 1.55 + T[0] * hw * 0.6, p[1] + N[1] * hw * 1.55 + T[1] * hw * 0.6];
            S.fill([b0, tip, b1], 'line');
        }
        if (o.head) dragonHead(S, path[0], [-F[0].t[0], -F[0].t[1]], w0 * 1.15);
    }
    function dragonHead(S, at, dir, size) {
        const r = Math.atan2(dir[1], dir[0]), k = size / 0.12;
        const head = xf(spline([[-0.05, 0.1], [0.08, 0.15], [0.2, 0.12], [0.3, 0.06], [0.34, 0.0], [0.24, -0.01], [0.3, -0.06], [0.22, -0.11], [0.08, -0.08], [-0.05, -0.1]], 5, true), { x: at[0], y: at[1], r, s: k });
        S.fill(xf(spline([[-0.08, 0.12], [0.1, 0.19], [0.36, 0.06], [0.36, -0.12], [0.06, -0.13], [-0.08, -0.13]], 5, true), { x: at[0], y: at[1], r, s: k }), 'knock');
        S.fill(head, 'fillA').stroke(head.concat([head[0]]), 0.012);
        // Mouth line, teeth, eye, brow horn, flowing whiskers.
        S.stroke(xf([[0.31, -0.02], [0.18, -0.02], [0.1, -0.05]], { x: at[0], y: at[1], r, s: k }), 0.008);
        for (const tx of [0.2, 0.25]) S.fill(xf([[tx, -0.02], [tx + 0.015, -0.05], [tx + 0.03, -0.02]], { x: at[0], y: at[1], r, s: k }), 'hi');
        S.fill(xf(circlePts(0.12, 0.06, 0.035, 0.022, 16), { x: at[0], y: at[1], r, s: k }), 'line');
        S.dot(...xf([[0.13, 0.065]], { x: at[0], y: at[1], r, s: k })[0], 0.006 * k, 'hi');
        S.fill(xf([[0.02, 0.12], [-0.22, 0.3], [-0.12, 0.25], [0.08, 0.14]], { x: at[0], y: at[1], r, s: k }), 'line');
        S.fill(xf([[0.0, 0.08], [-0.18, 0.18], [-0.1, 0.1]], { x: at[0], y: at[1], r, s: k }), 'line');
        for (const [a, b] of [[[0.3, -0.05], [[0.38, -0.2], [0.3, -0.38], [0.42, -0.5]]], [[0.32, 0.04], [[0.45, 0.12], [0.5, 0.3], [0.62, 0.36]]]]) S.stroke(xf(spline([a, ...b], 6), { x: at[0], y: at[1], r, s: k }), t => 0.009 * (1 - t) + 0.002);
    }
    function serpentEmblem(seed) {
        const S = new Shape(), R = rng(seed);
        const path = spline([[-0.55, 0.72], [0.35, 0.82], [0.62, 0.38], [0.1, 0.1], [-0.55, -0.12], [-0.5, -0.58], [0.2, -0.62], [0.62, -0.88]].map(p => [p[0] + (R() - 0.5) * 0.04, p[1]]), 8);
        serpentBody(S, path, 0.13, { head: true });
        return S;
    }
    /** A serpent coiling round a limb: in the unrolled band a diagonal that runs out one side and in at the other. */
    function serpentCoil(seed, P, H) {
        const S = new Shape(), turns = Math.max(1, Math.round(H / P * 1.2)), n = Math.max(40, turns * 36);
        const path = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            path.push([t * turns * P + Math.sin(t * turns * TAU * 2) * P * 0.04, H * 0.42 - t * H * 0.84]);
        }
        // Wind bars behind it.
        const R = rng(seed + 3);
        for (let k = 0; k < turns * 4; k++) {
            const x = R() * P, y = (R() - 0.5) * H * 0.85, l = P * (0.18 + R() * 0.2), c = 0.12 + R() * 0.08;
            // A wind bar: a long stroke ending in a curl, shaded under.
            const bar = spline([[x, y], [x + l * 0.5, y + 0.06], [x + l, y], [x + l + c, y + c * 0.8], [x + l, y + c * 1.4], [x + l - c * 0.6, y + c * 0.7]], 6);
            S.stroke(bar.map(p => [p[0], p[1] - 0.06]), 0.16, 'shade', { soft: true, density: 0.45 }).stroke(bar, t => 0.035 * (1 - t * 0.5));
        }
        serpentBody(S, path, Math.min(0.5, P * 0.09), { head: true });
        return S;
    }

    function koiEmblem(seed) {
        const S = new Shape(), R = rng(seed);
        const spine = spline([[0.0, 0.85], [0.1, 0.45], [0.02, 0.0], [-0.12, -0.35], [-0.02, -0.62]], 8);
        const w = t => 0.27 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.75) * (1 - 0.35 * t) + 0.01;
        const body = outline(spine, w);
        // The body first: pale, patched with color, the patches kept inside it.
        S.fill(body, 'fillB', { density: 0.35 });
        for (let k = 0; k < 4; k++) {
            const t = 0.15 + k * 0.2 + (R() - 0.5) * 0.08, a = along(spine, t), rr = w(t) * (0.7 + R() * 0.5);
            S.fill(spline(circlePts(0, 0, 1, 1, 7).map((p, i) => [a.p[0] + p[0] * rr * (0.8 + 0.4 * ((i * 37 + k * 11) % 7) / 7) + (R() - 0.5) * 0.08, a.p[1] + p[1] * rr * 0.8]), 4, true), 'fillA');
        }
        S.fill([[[-3, -3], [3, -3], [3, 3], [-3, 3]], body], 'knock');
        // Water swirls round it.
        for (const [x, y, s] of [[-0.62, 0.55, 1], [0.6, -0.15, -1], [-0.55, -0.6, 1]]) {
            const swirl = [];
            for (let i = 0; i <= 30; i++) { const t = i / 30, a = s * t * Math.PI * 2.2, rr = 0.22 * (1 - t * 0.7); swirl.push([x + Math.cos(a) * rr - 0.1 * s, y + Math.sin(a) * rr]); }
            S.stroke(swirl, 0.07, 'shade', { soft: true, density: 0.3 }).stroke(swirl, t => 0.016 * (1 - t * 0.7));
        }
        // Tail: two long lobes with fin rays.
        const end = along(spine, 1);
        for (const s of [1, -1]) {
            const lobe = spline([[end.p[0], end.p[1] + 0.02], [end.p[0] + s * 0.18, end.p[1] - 0.12], [end.p[0] + s * 0.4, end.p[1] - 0.3], [end.p[0] + s * 0.18, end.p[1] - 0.22], [end.p[0] + s * 0.05, end.p[1] - 0.12]], 8, true);
            S.fill(lobe, 'fillA', { density: 0.75 }).stroke(lobe, 0.012);
            for (let k = 1; k < 5; k++) S.stroke([[end.p[0] + s * 0.02, end.p[1] - 0.02], [end.p[0] + s * (0.08 + k * 0.07), end.p[1] - 0.12 - k * 0.04]], 0.004);
        }
        // Pectoral fins from the body's edge.
        for (const s of [1, -1]) {
            const a = along(spine, 0.3), e = w(0.3) * 1.02, fin = spline([[a.p[0] + s * e, a.p[1]], [a.p[0] + s * 0.42, a.p[1] - 0.05], [a.p[0] + s * 0.5, a.p[1] - 0.22], [a.p[0] + s * 0.3, a.p[1] - 0.14], [a.p[0] + s * e, a.p[1] - 0.1]], 6, true);
            S.fill(fin, 'fillA', { density: 0.6 }).stroke(fin, 0.01);
            for (let k = 1; k < 4; k++) S.stroke([[a.p[0] + s * e, a.p[1] - 0.03 * k], [a.p[0] + s * (0.32 + k * 0.05), a.p[1] - 0.06 - k * 0.04]], 0.0035);
        }
        // Scales: arcs in rows over the back.
        for (let i = 1; i < 14; i++) {
            const t = 0.12 + i * 0.055, a = along(spine, t), hw = w(t);
            for (let q = -2; q <= 2; q++) {
                const off = (q + (i % 2) * 0.5) * hw * 0.32;
                if (Math.abs(off) > hw * 0.82) continue;
                const c = [a.p[0] + a.n[0] * off, a.p[1] + a.n[1] * off], rr = hw * 0.17;
                S.stroke([-1, -0.5, 0, 0.5, 1].map(k => [c[0] + a.n[0] * rr * k - a.t[0] * rr * (1 - k * k) * 0.8, c[1] + a.n[1] * rr * k - a.t[1] * rr * (1 - k * k) * 0.8]), 0.006);
            }
        }
        S.stroke(outline(spine, t => w(t) * 0.6, () => 0.6).slice(0, spine.length), w(0.4) * 0.35, 'shade', { soft: true, density: 0.4 });
        S.stroke(body.concat([body[0]]), 0.016);
        // Head: gill line, eyes, barbels.
        const head = along(spine, 0.08);
        S.stroke(spline([[head.p[0] - w(0.15) * 0.8, head.p[1] - 0.12], [head.p[0], head.p[1] - 0.17], [head.p[0] + w(0.15) * 0.8, head.p[1] - 0.12]], 6), 0.01);
        for (const s of [1, -1]) {
            S.fill(circlePts(head.p[0] + s * 0.1, head.p[1] + 0.02, 0.03, 0.025, 14), 'line');
            S.stroke(spline([[head.p[0] + s * 0.05, head.p[1] + 0.12], [head.p[0] + s * 0.15, head.p[1] + 0.2], [head.p[0] + s * 0.22, head.p[1] + 0.16]], 5), t => 0.006 * (1 - t) + 0.002);
        }
        return S;
    }

    function feather(S, base, ang, len, wid, o = {}) {
        const spine = Array.from({ length: 11 }, (_, i) => { const t = i / 10; return [t * len, (o.bend || 0) * len * t * t]; });
        const shape = xf(outline(spine, t => wid * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)), 0.6) * (t > 0.85 ? 1 - (t - 0.85) * 3 : 1) + 0.004), { x: base[0], y: base[1], r: ang });
        S.fill(shape, 'knock');
        S.fill(shape, o.tone || 'fillA', { density: o.density ?? 1 });
        S.stroke(xf(spine.slice(0, 5), { x: base[0], y: base[1], r: ang }), wid * 0.9, 'shade', { soft: true, density: 0.45 });
        S.stroke(shape.concat([shape[0]]), 0.009);
        S.stroke(xf(spine.slice(1, 10), { x: base[0], y: base[1], r: ang }), t => 0.006 * (1 - t) + 0.002);
    }
    function wingsEmblem() {
        const S = new Shape(), side = new Shape();
        // The wing's arm rises from the middle and reaches out; flight feathers hang from it, fanning out toward the tip.
        const arm = t => [0.12 + t * 1.3, 0.22 + Math.sin(t * Math.PI * 0.85) * 0.36 - t * 0.05];
        for (let k = 0; k < 13; k++) { const t = k / 12; feather(side, arm(t), -1.72 + 1.5 * Math.pow(t, 1.15), 0.42 + 0.45 * t, 0.075, { bend: 0.06 }); }
        for (let k = 0; k < 13; k++) { const t = k / 12, p = arm(t * 0.92); feather(side, [p[0], p[1] + 0.04], -1.62 + 1.25 * t, 0.28 + 0.2 * t, 0.068, { bend: 0.05, density: 0.85 }); }
        for (let k = 0; k < 15; k++) { const t = k / 14, p = arm(t * 0.85); feather(side, [p[0], p[1] + 0.08], -1.5 + 0.95 * t, 0.15 + 0.08 * t, 0.052, { density: 0.7 }); }
        side.stroke(Array.from({ length: 20 }, (_, i) => { const p = arm(i / 19 * 0.88); return [p[0], p[1] + 0.12]; }), t => 0.022 * (1 - t * 0.6));
        S.add(side).add(side.mirrored());
        // A small sun disk where the wings meet.
        S.ring(0, 0.3, 0.1, 0.014).dot(0, 0.3, 0.05, 'fillB');
        for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; S.stroke([[Math.cos(a) * 0.13, 0.3 + Math.sin(a) * 0.13], [Math.cos(a) * 0.18, 0.3 + Math.sin(a) * 0.18]], 0.006); }
        return S;
    }
    function birdEmblem() {
        const S = new Shape();
        // A swift little bird mid-turn: body, two swept wings, a forked tail.
        const body = spline([[0.5, 0.22], [0.36, 0.3], [0.1, 0.22], [-0.25, 0.05], [-0.45, -0.05], [-0.25, -0.1], [0.12, -0.08], [0.4, 0.05], [0.56, 0.16]], 8, true);
        const wingUp = spline([[0.12, 0.2], [-0.05, 0.55], [-0.38, 0.88], [-0.25, 0.6], [-0.08, 0.3]], 8);
        const wingDn = spline([[0.08, -0.06], [0.05, -0.42], [-0.15, -0.85], [-0.08, -0.5], [-0.04, -0.12]], 8);
        const tail = [[-0.4, -0.03], [-0.85, 0.2], [-0.62, -0.04], [-0.95, -0.25], [-0.42, -0.08]];
        for (const wing of [wingUp, wingDn]) {
            S.fill(wing.concat([[0.0, 0.08]]), 'fillA');
            for (let k = 1; k < 5; k++) { const a = along(wing, 0.25 + k * 0.15); S.stroke([a.p, [a.p[0] + 0.08, a.p[1] + (wing === wingUp ? -0.1 : 0.1)]], 0.006, 'hi'); }
            S.stroke(wing.concat([[0.0, 0.08], wing[0]]), 0.012);
        }
        S.fill(tail, 'fillA').stroke(tail.concat([tail[0]]), 0.012);
        S.fill(body, 'fillA');
        // A pale belly and a bright throat.
        S.fill(spline([[0.42, 0.06], [0.1, -0.06], [-0.3, -0.07], [0.05, 0.02], [0.35, 0.12]], 6, true), 'hi', { density: 0.9 });
        S.fill(spline([[0.52, 0.14], [0.42, 0.04], [0.32, 0.08], [0.38, 0.18]], 5, true), 'fillB');
        S.stroke(body, 0.012);
        S.fill([[0.55, 0.2], [0.68, 0.18], [0.55, 0.14]], 'line');
        S.dot(0.42, 0.2, 0.022).dot(0.425, 0.205, 0.006, 'hi');
        return S;
    }

    function geometricEmblem(seed) {
        const R = rng(seed), S = new Shape();
        const tri = (r, a0) => [0, 1, 2].map(k => [Math.cos(a0 + k * TAU / 3) * r, Math.sin(a0 + k * TAU / 3) * r]);
        S.ring(0, 0, 0.78, 0.01).ring(0, 0, 0.72, 0.004);
        const up = tri(0.72, Math.PI / 2), dn = tri(0.72, -Math.PI / 2);
        S.stroke(up.concat([up[0]]), 0.009).stroke(dn.concat([dn[0]]), 0.009);
        const inner = tri(0.36, -Math.PI / 2);
        S.fill(inner, 'shade', { density: 0.35 }).stroke(inner.concat([inner[0]]), 0.007);
        S.ring(0, 0, 0.36, 0.006).dot(0, 0, 0.06);
        for (const p of up.concat(dn)) S.ring(p[0], p[1], 0.045, 0.006).dot(p[0], p[1], 0.016);
        // Dotted lines out of the top and bottom, the moon's phases beside them.
        dotted(S, [[0, 0.82], [0, 1.4]], 0.06, t => 0.016 * (1 - t * 0.6));
        dotted(S, [[0, -0.82], [0, -1.4]], 0.06, t => 0.016 * (1 - t * 0.6));
        for (const s of [1, -1]) {
            S.fill([circlePts(s * 1.0, 0, 0.09, 0.09, 24), circlePts(s * 1.0 + s * 0.05, 0.0, 0.08, 0.08, 24)], 'line');
            S.dot(s * 1.25, 0, 0.03);
        }
        if (R() > 0.5) S.ring(0, 0, 0.55, 0.004);
        return S;
    }
    function geometricBand(seed, P) {
        const S = new Shape(), n = Math.max(2, Math.round(P / 0.5)), u = P / n;
        S.stroke([[-0.1, 0.8], [P + 0.1, 0.8]], 0.03).stroke([[-0.1, 0.66], [P + 0.1, 0.66]], 0.008);
        S.stroke([[-0.1, -0.8], [P + 0.1, -0.8]], 0.03).stroke([[-0.1, -0.66], [P + 0.1, -0.66]], 0.008);
        for (let k = 0; k < n; k++) {
            const c = (k + 0.5) * u, d = [[c, 0.5], [c + u * 0.45, 0], [c, -0.5], [c - u * 0.45, 0]];
            S.fill(d, 'shade', { density: 0.25 }).stroke(d.concat([d[0]]), 0.01);
            const d2 = d.map(p => [c + (p[0] - c) * 0.45, p[1] * 0.45]);
            S.fill(d2, 'line');
            S.dot(c + u / 2, 0.42, 0.018).dot(c + u / 2, -0.42, 0.018).dot(c + u / 2, 0, 0.03);
        }
        return S;
    }
    function geometricSleeve(seed, P, H) {
        // Triangles in a grid, their dotwork fading from the shoulder down.
        const S = new Shape(), n = Math.max(3, Math.round(P / 0.42)), u = P / n, h = u * 0.866, rows = Math.ceil(H / h) + 1;
        for (let j = 0; j < rows; j++) for (let i = 0; i < n * 2; i++) {
            const y = H / 2 - j * h, x = i * u / 2 + (j % 2) * u / 2, up = i % 2 === 0;
            const t = [[x, up ? y - h : y], [x + u / 2, up ? y : y - h], [x + u, up ? y - h : y]];
            const fade = clamp01(1 - j / rows * 1.1), dens = ((i * 7 + j * 3) % 5) / 5;
            if (dens * fade > 0.15) S.fill(t, 'shade', { density: 0.2 + 0.6 * dens * fade });
            S.stroke(t.concat([t[0]]), 0.006);
        }
        return S;
    }

    // Runes of our own: strokes in a cell 0.6 wide, 1 tall (centered), built from a stave and its branches.
    const RUNES = [
        [[[0, -0.5], [0, 0.5]], [[0, 0.3], [0.28, 0.5]], [[0, 0.05], [0.28, 0.25]]],
        [[[0, -0.5], [0, 0.5]], [[0, 0.5], [0.26, 0.25], [0, 0.0]], [[0, 0.0], [0.26, -0.25]]],
        [[[-0.22, -0.5], [-0.22, 0.5]], [[0.22, -0.5], [0.22, 0.5]], [[-0.22, 0.3], [0.22, -0.3]]],
        [[[0, -0.5], [0, 0.5]], [[-0.25, 0.5], [0, 0.22], [0.25, 0.5]]],
        [[[0, -0.5], [0, 0.5]], [[-0.25, -0.5], [0, -0.22], [0.25, -0.5]], [[-0.15, 0.1], [0.15, 0.1]]],
        [[[0, 0.5], [0.26, 0.0], [0, -0.5], [-0.26, 0.0], [0, 0.5]], [[0, -0.5], [0, -0.75]]],
        [[[-0.24, 0.5], [0.24, -0.5]], [[0.24, 0.5], [-0.24, -0.5]], [[0, 0.5], [0, 0.25]]],
        [[[0, -0.5], [0, 0.5]], [[0, 0.15], [0.26, 0.4]], [[0, 0.15], [-0.26, 0.4]], [[0, -0.2], [0.2, -0.4]]],
        [[[-0.22, 0.5], [-0.22, -0.5], [0.24, -0.2]], [[-0.22, 0.1], [0.2, 0.42]]],
        [[[0, -0.5], [0, 0.5]], [[-0.24, 0.25], [0.24, -0.05]], [[-0.24, -0.05], [0.24, 0.25]]],
        [[[0.24, 0.5], [-0.2, 0.5], [-0.2, -0.5]], [[-0.2, 0.0], [0.18, 0.0]], [[0.18, 0.0], [0.24, -0.5]]],
        [[[0, -0.5], [0, 0.5]], [[0, -0.1], [0.24, 0.1], [0, 0.3]], [[-0.22, -0.4], [0, -0.25]]],
        [[[-0.22, -0.5], [0, 0.5], [0.22, -0.5]], [[-0.1, -0.05], [0.1, -0.05]]],
        [[[0, 0.5], [0, -0.5]], [[-0.25, 0.0], [0, -0.25], [0.25, 0.0]], [[-0.25, 0.25], [0, 0.0], [0.25, 0.25]]],
        [[[-0.22, 0.5], [0.22, 0.5]], [[0, 0.5], [0, -0.5]], [[-0.22, -0.5], [0.22, -0.5]], [[-0.2, 0.0], [0.2, 0.0]]],
        [[[0.2, 0.45], [-0.2, 0.2], [0.2, -0.05], [-0.2, -0.3], [0.05, -0.5]]]
    ];
    function rune(S, k, x, y, s, w) {
        for (const stroke of RUNES[((k % RUNES.length) + RUNES.length) % RUNES.length]) S.stroke(stroke.map(p => [x + p[0] * s, y + p[1] * s]), w);
    }
    function runesEmblem(seed) {
        const R = rng(seed), S = new Shape(), n = 8;
        S.ring(0, 0, 0.94, 0.016).ring(0, 0, 0.88, 0.006).ring(0, 0, 0.5, 0.014).ring(0, 0, 0.45, 0.005);
        for (let k = 0; k < n; k++) {
            const a = Math.PI / 2 - k / n * TAU, x = Math.cos(a) * 0.69, y = Math.sin(a) * 0.69;
            const g = new Shape();
            rune(g, Math.floor(R() * RUNES.length), 0, 0, 0.26, 0.022);
            S.add(g, { x, y, r: a - Math.PI / 2 });
            const b = a - Math.PI / n;
            S.dot(Math.cos(b) * 0.69, Math.sin(b) * 0.69, 0.018);
        }
        // A bind rune in the middle: three runes on one stave.
        for (let k = 0; k < 3; k++) rune(S, Math.floor(R() * RUNES.length), 0, 0, 0.62, 0.028);
        return S;
    }
    function runesBand(seed, P) {
        const R = rng(seed), S = new Shape(), n = Math.max(3, Math.round(P / 0.62)), u = P / n;
        S.stroke([[-0.1, 0.78], [P + 0.1, 0.78]], 0.022).stroke([[-0.1, -0.78], [P + 0.1, -0.78]], 0.022);
        for (let k = 0; k < n; k++) { rune(S, Math.floor(R() * RUNES.length), (k + 0.5) * u, 0, 0.95, 0.04); S.dot(k * u, 0, 0.03); }
        return S;
    }

    // ── a script hand: broad-nib italic, our own skeletons ─────────────────
    // Lowercase: x-height 1, ascender 1.6, descender -0.6; capitals and figures 1.5. [advance, ...strokes]; a stroke is "x,y x,y ..."; "." a dot.
    const GLYPHS = {
        a: [0.82, '0.62,0.82 0.42,1 0.15,0.85 0.05,0.45 0.18,0.05 0.42,0.05 0.6,0.35', '0.62,1 0.58,0.2 0.66,0 0.8,0.1'],
        b: [0.74, '0.14,1.62 0.08,0.1 0.1,0', '0.1,0.55 0.3,0.95 0.55,0.9 0.65,0.5 0.5,0.08 0.25,0.02 0.1,0.15'],
        c: [0.68, '0.6,0.85 0.42,1 0.15,0.85 0.05,0.45 0.18,0.05 0.45,0.02 0.62,0.18'],
        d: [0.82, '0.62,0.82 0.42,1 0.15,0.85 0.05,0.45 0.18,0.05 0.42,0.05 0.6,0.35', '0.68,1.62 0.58,0.2 0.66,0 0.8,0.1'],
        e: [0.68, '0.1,0.45 0.5,0.6 0.58,0.85 0.4,1 0.15,0.85 0.05,0.45 0.18,0.05 0.45,0.02 0.62,0.18'],
        f: [0.56, '0.7,1.5 0.55,1.62 0.38,1.5 0.3,1 0.22,-0.2 0.1,-0.55 -0.05,-0.6', '0.08,0.98 0.55,1'],
        g: [0.78, '0.62,0.82 0.42,1 0.15,0.85 0.05,0.45 0.18,0.05 0.42,0.05 0.6,0.35', '0.62,1 0.55,-0.3 0.4,-0.58 0.15,-0.6 0.02,-0.45'],
        h: [0.78, '0.14,1.62 0.06,0', '0.09,0.5 0.28,0.92 0.5,1 0.6,0.8 0.55,0.2 0.62,0 0.75,0.1'],
        i: [0.42, '0.2,1 0.14,0.15 0.22,0 0.35,0.1', '.0.24,1.35'],
        j: [0.42, '0.32,1 0.25,-0.3 0.12,-0.58 -0.05,-0.55', '.0.36,1.35'],
        k: [0.74, '0.14,1.62 0.06,0', '0.55,0.95 0.3,0.6 0.1,0.45', '0.25,0.55 0.45,0.15 0.62,0 0.72,0.08'],
        l: [0.42, '0.27,1.62 0.16,0.15 0.24,0 0.38,0.1'],
        m: [1.08, '0.1,1 0.06,0', '0.08,0.6 0.25,0.95 0.42,0.95 0.48,0.6 0.45,0', '0.47,0.6 0.65,0.95 0.82,0.95 0.88,0.6 0.85,0.15 0.92,0 1.02,0.1'],
        n: [0.78, '0.1,1 0.06,0', '0.08,0.6 0.28,0.95 0.5,0.95 0.58,0.6 0.54,0.15 0.62,0 0.74,0.1'],
        o: [0.72, '0.4,1 0.12,0.85 0.04,0.45 0.18,0.04 0.42,0 0.62,0.2 0.66,0.6 0.55,0.92 0.4,1'],
        p: [0.74, '0.15,1 0.04,-0.6', '0.1,0.6 0.3,0.95 0.55,0.92 0.65,0.5 0.5,0.08 0.28,0.02 0.1,0.15'],
        q: [0.78, '0.62,0.82 0.42,1 0.15,0.85 0.05,0.45 0.18,0.05 0.42,0.05 0.6,0.35', '0.62,1 0.52,-0.6 0.68,-0.45'],
        r: [0.6, '0.1,1 0.06,0', '0.08,0.6 0.3,0.95 0.5,1 0.62,0.9'],
        s: [0.62, '0.55,0.9 0.4,1 0.18,0.92 0.15,0.68 0.45,0.42 0.5,0.15 0.3,0 0.08,0.06'],
        t: [0.54, '0.3,1.4 0.2,0.15 0.3,0 0.45,0.1', '0.05,0.98 0.5,1'],
        u: [0.8, '0.1,1 0.06,0.3 0.2,0 0.42,0.08 0.6,0.5', '0.62,1 0.56,0.15 0.64,0 0.76,0.1'],
        v: [0.7, '0.06,1 0.3,0 0.55,0.75 0.68,1'],
        w: [1.0, '0.05,1 0.25,0 0.48,0.75 0.68,0 0.92,1'],
        x: [0.68, '0.05,1 0.6,0', '0.6,1 0.05,0'],
        y: [0.76, '0.1,1 0.06,0.3 0.2,0 0.42,0.08 0.6,0.5', '0.62,1 0.55,-0.3 0.4,-0.58 0.15,-0.6 0.02,-0.45'],
        z: [0.68, '0.08,1 0.6,1 0.05,0 0.62,0'],
        A: [0.92, '0,0 0.42,1.5 0.85,0', '0.18,0.6 0.68,0.6'],
        B: [0.82, '0.1,1.5 0.1,0', '0.1,1.5 0.5,1.48 0.66,1.2 0.5,0.8 0.1,0.78', '0.1,0.78 0.58,0.76 0.74,0.4 0.56,0.04 0.1,0'],
        C: [0.9, '0.8,1.25 0.55,1.5 0.2,1.35 0.04,0.75 0.2,0.12 0.52,0 0.82,0.22'],
        D: [0.92, '0.1,1.5 0.1,0', '0.1,1.5 0.5,1.45 0.8,1 0.82,0.5 0.55,0.05 0.1,0'],
        E: [0.8, '0.7,1.5 0.1,1.5 0.1,0 0.72,0', '0.1,0.78 0.55,0.78'],
        F: [0.76, '0.72,1.5 0.1,1.5 0.1,0', '0.1,0.8 0.55,0.8'],
        G: [0.92, '0.8,1.25 0.55,1.5 0.2,1.35 0.04,0.75 0.2,0.12 0.52,0 0.82,0.22 0.82,0.65 0.5,0.65'],
        H: [0.92, '0.1,1.5 0.1,0', '0.78,1.5 0.78,0', '0.1,0.78 0.78,0.78'],
        I: [0.52, '0.25,1.5 0.25,0', '0.05,1.5 0.45,1.5', '0.05,0 0.45,0'],
        J: [0.7, '0.55,1.5 0.55,0.35 0.38,0 0.12,0.08 0.02,0.3'],
        K: [0.86, '0.1,1.5 0.1,0', '0.75,1.5 0.1,0.65', '0.32,0.85 0.8,0'],
        L: [0.76, '0.1,1.5 0.1,0 0.7,0'],
        M: [1.1, '0.05,0 0.15,1.5 0.52,0.3 0.9,1.5 1,0'],
        N: [0.92, '0.1,0 0.1,1.5 0.78,0 0.78,1.5'],
        O: [0.94, '0.45,1.5 0.12,1.3 0.03,0.75 0.12,0.2 0.45,0 0.78,0.2 0.87,0.75 0.78,1.3 0.45,1.5'],
        P: [0.82, '0.1,0 0.1,1.5 0.55,1.48 0.74,1.15 0.55,0.78 0.1,0.76'],
        Q: [0.96, '0.45,1.5 0.12,1.3 0.03,0.75 0.12,0.2 0.45,0 0.78,0.2 0.87,0.75 0.78,1.3 0.45,1.5', '0.5,0.25 0.92,-0.15'],
        R: [0.86, '0.1,0 0.1,1.5 0.55,1.48 0.74,1.15 0.55,0.78 0.1,0.76', '0.4,0.78 0.8,0'],
        S: [0.82, '0.72,1.3 0.5,1.5 0.2,1.42 0.12,1.1 0.35,0.85 0.62,0.62 0.7,0.3 0.5,0.02 0.18,0.05 0.05,0.25'],
        T: [0.82, '0,1.5 0.8,1.5', '0.4,1.5 0.4,0'],
        U: [0.88, '0.08,1.5 0.08,0.45 0.25,0.03 0.5,0 0.72,0.25 0.76,1.5'],
        V: [0.88, '0,1.5 0.42,0 0.85,1.5'],
        W: [1.14, '0,1.5 0.28,0 0.55,1.1 0.82,0 1.1,1.5'],
        X: [0.86, '0.05,1.5 0.78,0', '0.78,1.5 0.05,0'],
        Y: [0.82, '0,1.5 0.4,0.75 0.8,1.5', '0.4,0.75 0.4,0'],
        Z: [0.86, '0.08,1.5 0.76,1.5 0.05,0 0.78,0'],
        0: [0.78, '0.38,1.5 0.1,1.3 0.04,0.75 0.1,0.2 0.38,0 0.66,0.2 0.72,0.75 0.66,1.3 0.38,1.5'],
        1: [0.62, '0.15,1.2 0.42,1.5 0.42,0'],
        2: [0.78, '0.08,1.2 0.3,1.5 0.6,1.4 0.65,1.05 0.05,0 0.7,0'],
        3: [0.76, '0.1,1.35 0.35,1.5 0.62,1.3 0.55,0.95 0.3,0.8', '0.3,0.8 0.62,0.62 0.65,0.25 0.38,0 0.05,0.15'],
        4: [0.8, '0.55,0 0.55,1.5 0.02,0.45 0.75,0.45'],
        5: [0.76, '0.68,1.5 0.15,1.5 0.1,0.85 0.4,0.92 0.66,0.65 0.62,0.2 0.35,0 0.05,0.12'],
        6: [0.76, '0.62,1.42 0.38,1.5 0.12,1.2 0.05,0.5 0.25,0.02 0.55,0.05 0.66,0.45 0.45,0.82 0.1,0.6'],
        7: [0.76, '0.05,1.5 0.72,1.5 0.25,0'],
        8: [0.78, '0.38,0.8 0.12,1 0.15,1.38 0.38,1.5 0.6,1.38 0.62,1 0.38,0.8 0.08,0.5 0.15,0.08 0.38,0 0.62,0.08 0.68,0.5 0.38,0.8'],
        9: [0.76, '0.62,1 0.3,0.75 0.08,1 0.15,1.4 0.4,1.5 0.62,1.3 0.62,0.6 0.45,0.08 0.15,0'],
        ' ': [0.42],
        '.': [0.3, '.0.12,0.04'], ',': [0.3, '0.14,0.06 0.06,-0.2'], '!': [0.34, '0.2,1.5 0.15,0.35', '.0.12,0.04'], '?': [0.7, '0.1,1.25 0.3,1.5 0.58,1.38 0.55,1.0 0.32,0.75 0.3,0.38', '.0.28,0.04'],
        '-': [0.5, '0.08,0.5 0.42,0.5'], "'": [0.26, '0.16,1.6 0.1,1.25'], '&': [0.92, '0.85,0 0.3,0.85 0.25,1.3 0.42,1.5 0.6,1.3 0.45,0.95 0.1,0.55 0.12,0.12 0.4,0 0.65,0.2 0.82,0.55'],
        '+': [0.7, '0.35,0.25 0.35,0.95', '0.05,0.6 0.65,0.6'], '#': [0.8, '0.25,0.1 0.35,1.3', '0.5,0.1 0.6,1.3', '0.05,0.45 0.75,0.45', '0.1,0.95 0.8,0.95'], '/': [0.6, '0.05,-0.1 0.55,1.5'], ':': [0.3, '.0.12,0.04', '.0.14,0.8']
    };
    /** Text in the script hand: strokes laid with a broad nib at 35 degrees, slanted. Returns { shape, width } in units of x-height. */
    function scriptText(text, o = {}) {
        const S = new Shape(), slant = o.slant ?? 0.2, nib = 35 * Math.PI / 180, thick = o.thick ?? 0.23, thin = thick * 0.3;
        let x = 0;
        for (const ch of String(text || '').slice(0, 24)) {
            const g = GLYPHS[ch] || GLYPHS[ch.toLowerCase()] || GLYPHS[ch.toUpperCase()];
            if (!g) { x += 0.4; continue; }
            for (const st of g.slice(1)) {
                if (st[0] === '.') { const [px, py] = st.slice(1).split(',').map(Number); S.dot(x + px + py * slant, py, thick * 0.62); continue; }
                const raw = st.split(' ').map(q => q.split(',').map(Number));
                const pts = (raw.length > 2 ? spline(raw, 6) : raw.length === 2 ? Array.from({ length: 7 }, (_, i) => lerp2(raw[0], raw[1], i / 6)) : raw).map(p => [x + p[0] + p[1] * slant, p[1]]);
                // The nib: wide across its angle, thin along it.
                const w = pts.map((p, i) => {
                    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
                    const d = Math.atan2(b[1] - a[1], b[0] - a[0]);
                    return (thin + (thick - thin) * Math.abs(Math.sin(d - nib))) * 0.5;
                });
                S.stroke(pts, w);
            }
            x += g[0];
        }
        return { shape: S, width: Math.max(0.4, x) };
    }
    function scriptEmblem(text) {
        const t = scriptText(text || 'Fortune');
        // Fit within the box, a swash under it.
        const k = Math.min(2 / t.width, 1.1), out = new Shape();
        out.add(t.shape, { x: -t.width * k / 2, y: -0.45 * k, s: k });
        const W = t.width * k;
        out.stroke(spline([[-W * 0.5, -0.62 * k], [-W * 0.1, -0.72 * k], [W * 0.3, -0.66 * k], [W * 0.52, -0.55 * k]], 10), t2 => 0.02 * k * Math.sin(Math.PI * Math.min(1, t2 * 1.1)) + 0.003);
        return out;
    }

    function circuitTile(seed, P, H, glowing) {
        // Traces on a 45-degree grid, ending in pads; a chip or two.
        const R = rng(seed), S = new Shape(), g = 0.12, n = Math.max(5, Math.round(P * H * 4));
        for (let k = 0; k < n; k++) {
            let x = Math.round(R() * P / g) * g, y = Math.round((R() - 0.5) * H / g) * g, dir = Math.floor(R() * 8);
            const pts = [[x, y]];
            S.ring(x, y, 0.035, 0.012).dot(x, y, 0.012);
            const steps = 3 + Math.floor(R() * 6);
            for (let s = 0; s < steps; s++) {
                if (R() < 0.35) dir = (dir + (R() < 0.5 ? 1 : 7)) % 8;
                if (dir % 4 === 2) dir = (dir + 1) % 8;
                const a = dir * Math.PI / 4, len = g * (1 + Math.floor(R() * 3));
                x += Math.round(Math.cos(a)) * len; y += Math.round(Math.sin(a)) * len;
                if (Math.abs(y) > H / 2 - 0.08) break;
                pts.push([x, y]);
            }
            if (pts.length > 1) { S.stroke(pts, 0.016); S.dot(x, y, 0.03); }
        }
        const chips = Math.max(1, Math.round(P * H * 0.35));
        for (let k = 0; k < chips; k++) {
            const cx = R() * P, cy = (R() - 0.5) * H * 0.7, w = 0.14 + R() * 0.08, h = 0.1 + R() * 0.06;
            const box = [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h]];
            S.fill(box.map(p => [cx + (p[0] - cx) * 1.25, cy + (p[1] - cy) * 1.6]), 'knock');
            S.fill(box, 'shade', { density: 0.55 }).stroke(box.concat([box[0]]), 0.012);
            S.dot(cx - w * 0.7, cy + h * 0.55, 0.014);
            for (let q = -2; q <= 2; q++) { S.stroke([[cx + q * w * 0.38, cy + h], [cx + q * w * 0.38, cy + h + 0.06]], 0.01).stroke([[cx + q * w * 0.38, cy - h], [cx + q * w * 0.38, cy - h - 0.06]], 0.01); }
        }
        return S;
    }
    function circuitEmblem(seed) {
        const R = rng(seed), S = new Shape();
        // A round core with traces fanning out from it.
        for (let k = 0; k < 14; k++) {
            const a = k / 14 * TAU + (R() - 0.5) * 0.15;
            let x = Math.cos(a) * 0.3, y = Math.sin(a) * 0.3;
            const pts = [[x, y]], d = Math.round(a / (Math.PI / 4)) * Math.PI / 4;
            const l1 = 0.15 + R() * 0.25;
            x += Math.cos(d) * l1; y += Math.sin(d) * l1; pts.push([x, y]);
            const d2 = d + (R() < 0.5 ? 1 : -1) * Math.PI / 4, l2 = 0.1 + R() * 0.25;
            x += Math.cos(d2) * l2; y += Math.sin(d2) * l2; pts.push([x, y]);
            S.stroke(pts, 0.016).ring(x, y, 0.035, 0.012);
        }
        S.ring(0, 0, 0.3, 0.025).ring(0, 0, 0.22, 0.008);
        const core = [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]];
        S.fill(core, 'line');
        S.fill(core.map(p => [p[0] * 0.55, p[1] * 0.55]), 'knock');
        S.dot(0, 0, 0.03);
        return S;
    }
    function barcodeEmblem(seed, text) {
        const R = rng(seed), S = new Shape();
        let x = -0.9;
        S.fill([[-0.92, 0.5], [-0.88, 0.5], [-0.88, -0.4], [-0.92, -0.4]], 'line');
        while (x < 0.86) {
            const w = [0.012, 0.024, 0.036, 0.05][Math.floor(R() * 4)], gap = [0.016, 0.026, 0.04][Math.floor(R() * 3)];
            if (x + w > 0.88) break;
            S.fill([[x, 0.5], [x + w, 0.5], [x + w, -0.25], [x, -0.25]], 'line');
            x += w + gap;
        }
        S.fill([[0.88, 0.5], [0.92, 0.5], [0.92, -0.4], [0.88, -0.4]], 'line');
        // Figures under the bars, in the script hand's capitals, small and upright.
        const digits = String(text || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 12) || String(Math.floor(R() * 1e9)).padStart(9, '0');
        const t = scriptText(digits, { slant: 0, thick: 0.13 });
        const k = Math.min(1.6 / t.width, 0.2);
        S.add(t.shape, { x: -t.width * k / 2, y: -0.58, s: k });
        return S;
    }

    // ── paint ─────────────────────────────────────────────────────────────
    /** A brush stroke: a ragged band along a path, its ends dragged thin. */
    function brush(S, path, w, seed, tone = 'fillA') {
        const R = rng(seed), pts = path.length > 4 ? path : spline(path, 10), n = pts.length;
        const jag = Array.from({ length: n }, () => 1 + (R() - 0.5) * 0.18);
        S.fill(outline(pts, t => w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.95)), 0.35) * jag[Math.round(t * (n - 1))]), tone);
    }
    function stripesPaint(seed) {
        const S = new Shape();
        // Three streaks dragged across, the middle one longest.
        brush(S, [[-1, 0.42], [-0.3, 0.45], [0.4, 0.4], [0.95, 0.46]], 0.13, seed);
        brush(S, [[-1, 0.0], [-0.2, 0.04], [0.6, -0.02], [1.0, 0.02]], 0.15, seed + 1);
        brush(S, [[-0.9, -0.42], [-0.2, -0.4], [0.5, -0.46], [0.85, -0.42]], 0.12, seed + 2);
        return S;
    }
    function handprint(seed) {
        const S = new Shape(), R = rng(seed);
        const palm = spline([[-0.36, -0.15], [-0.4, 0.2], [-0.3, 0.38], [0.0, 0.42], [0.3, 0.38], [0.38, 0.15], [0.32, -0.3], [0.1, -0.55], [-0.2, -0.55]], 6, true);
        S.fill(palm, 'fillA');
        const fingers = [[-0.3, 0.36, 1.85, 0.5, 0.085], [-0.1, 0.42, 1.65, 0.6, 0.09], [0.1, 0.42, 1.5, 0.62, 0.09], [0.28, 0.36, 1.32, 0.52, 0.08], [0.36, -0.08, 0.35, 0.48, 0.09]];
        for (const [x, y, a, l, w] of fingers) {
            const tip = [x + Math.cos(a) * l, y + Math.sin(a) * l];
            const f = outline(spline([[x, y], lerp2([x, y], tip, 0.5), tip], 6), t => w * (t > 0.85 ? Math.sqrt(Math.max(0, 1 - ((t - 0.85) / 0.15) ** 2)) : 1) + 0.005);
            S.fill(f, 'fillA');
            // The creases at the knuckles show as gaps in the print.
            for (const t of [0.45, 0.72]) { const p = lerp2([x, y], tip, t); S.stroke([[p[0] - Math.sin(a) * w * 0.7, p[1] + Math.cos(a) * w * 0.7], [p[0] + Math.sin(a) * w * 0.7, p[1] - Math.cos(a) * w * 0.7]], 0.012 + R() * 0.006, 'knock'); }
        }
        S.stroke(spline([[-0.3, 0.05], [0, 0.1], [0.3, 0.2]], 6), 0.014, 'knock');
        S.stroke(spline([[-0.15, -0.45], [-0.1, -0.1], [0.05, 0.15]], 6), 0.012, 'knock');
        return S;
    }
    function maskPaint() {
        // A band across the eyes from temple to temple, its ends drawn to points, a notch over the nose.
        const S = new Shape();
        S.fill(spline([[-1, 0.08], [-0.75, 0.32], [-0.35, 0.38], [0, 0.3], [0.35, 0.38], [0.75, 0.32], [1, 0.08], [0.75, -0.22], [0.35, -0.22], [0.12, -0.12], [0, -0.02], [-0.12, -0.12], [-0.35, -0.22], [-0.75, -0.22]], 6, true), 'fillA');
        for (const s of [1, -1]) S.fill([[s * 0.55, -0.22], [s * 0.6, -0.62], [s * 0.66, -0.22]], 'fillA');
        return S;
    }
    function clanPaint(seed) {
        const S = new Shape();
        // Chin lines, a mark on the brow, chevrons on the cheeks, a row of dots under each eye.
        for (const x of [-0.12, 0, 0.12]) brush(S, [[x, -0.55], [x * 1.1, -0.75], [x * 1.2, -0.98]], 0.035, seed + x * 100);
        S.fill(spline([[0, 0.98], [0.07, 0.86], [0, 0.72], [-0.07, 0.86]], 6, true), 'fillA');
        for (const s of [1, -1]) {
            brush(S, [[s * 0.38, 0.0], [s * 0.55, -0.12], [s * 0.72, 0.0]], 0.04, seed + s);
            brush(S, [[s * 0.4, -0.16], [s * 0.56, -0.28], [s * 0.7, -0.16]], 0.035, seed + 3 * s);
            for (let k = 0; k < 4; k++) S.dot(s * (0.28 + k * 0.1), 0.18 - k * 0.015, 0.025, 'fillA');
        }
        return S;
    }
    function dotsPaint() {
        const S = new Shape();
        for (let r = 0; r < 3; r++) for (let k = 0; k < 7 - r; k++) S.dot(-0.75 + k * 0.25 + r * 0.125, 0.3 - r * 0.3, 0.07 - r * 0.012, 'fillA');
        return S;
    }
    function skullPaint() {
        // A skull painted over a face: dark sockets and nose, the teeth drawn across the lips.
        const S = new Shape();
        for (const s of [1, -1]) S.fill(spline([[s * 0.08, 0.32], [s * 0.3, 0.52], [s * 0.6, 0.4], [s * 0.62, 0.15], [s * 0.4, 0.02], [s * 0.12, 0.1]], 6, true), 'fillA');
        S.fill(spline([[0, 0.02], [0.1, -0.12], [0.06, -0.22], [0, -0.18], [-0.06, -0.22], [-0.1, -0.12]], 5, true), 'fillA');
        S.stroke([[-0.4, -0.48], [0.4, -0.48]], 0.012, 'fillA');
        for (let k = -4; k <= 4; k++) S.stroke([[k * 0.09, -0.36], [k * 0.09, -0.6]], 0.01, 'fillA');
        for (const s of [1, -1]) S.stroke(spline([[s * 0.45, -0.2], [s * 0.55, -0.4], [s * 0.42, -0.55]], 6), 0.015, 'fillA');
        return S;
    }

    // ── scars ─────────────────────────────────────────────────────────────
    const scarW = (w, R) => t => w * (0.35 + 0.65 * Math.pow(Math.sin(Math.PI * t), 0.6)) * (0.85 + 0.3 * Math.sin(t * 17 + R * 5));
    function cutScar(seed) { const R = rng(seed)(); return new Shape().stroke(spline([[-0.9, -0.3], [-0.3, -0.05 + R * 0.1], [0.3, 0.12], [0.9, 0.35]], 12), scarW(0.05, R)); }
    function slashScar(seed) {
        const R = rng(seed), S = new Shape();
        for (let k = 0; k < 3; k++) { const o = (k - 1) * 0.3, l = 0.7 + R() * 0.3; S.stroke(spline([[-l + o * 0.5, -l * 0.7 + o], [0, o + (R() - 0.5) * 0.1], [l + o * 0.3, l * 0.7 + o]], 10), scarW(0.04 - k * 0.006, R())); }
        return S;
    }
    function clawScar(seed) {
        const R = rng(seed), S = new Shape();
        for (let k = 0; k < 4; k++) { const x = -0.45 + k * 0.3; S.stroke(spline([[x - 0.15, 0.9 - Math.abs(k - 1.5) * 0.1], [x + 0.02, 0.1], [x + 0.18, -0.85 + Math.abs(k - 1.5) * 0.12]], 10), t => 0.055 * Math.pow(Math.sin(Math.PI * t), 0.7) * (0.85 + 0.25 * R())); }
        return S;
    }
    function burnScar(seed) {
        const R = rng(seed), pts = [];
        for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, r = 0.65 + R() * 0.35; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]); }
        const S = new Shape().fill(spline(pts, 5, true), 'fillA');
        // Islands of less scarred skin inside it.
        for (let k = 0; k < 4; k++) S.fill(circlePts((R() - 0.5) * 0.8, (R() - 0.5) * 0.6, 0.06 + R() * 0.1, 0.05 + R() * 0.08, 10), 'knock', { relief: 0 });
        return S;
    }
    function brandScar(seed) {
        const S = new Shape(), R = rng(seed);
        S.ring(0, 0, 0.8, 0.07);
        rune(S, Math.floor(R() * RUNES.length), 0, 0, 1.0, 0.08);
        return S;
    }
    function stitchScar(seed) {
        const R = rng(seed)(), S = new Shape(), path = spline([[-0.9, -0.15], [-0.3, 0.05], [0.3, -0.05], [0.9, 0.15]], 12);
        S.stroke(path, scarW(0.04, R));
        for (let k = 1; k < 12; k++) {
            const a = along(path, k / 12);
            S.stroke([[a.p[0] - a.n[0] * 0.14, a.p[1] - a.n[1] * 0.14], [a.p[0] + a.n[0] * 0.14, a.p[1] + a.n[1] * 0.14]], 0.018, 'fillB');
            S.dot(a.p[0] - a.n[0] * 0.17, a.p[1] - a.n[1] * 0.17, 0.02, 'fillB').dot(a.p[0] + a.n[0] * 0.17, a.p[1] + a.n[1] * 0.17, 0.02, 'fillB');
        }
        return S;
    }

    /** Scar tissue round a cyber limb's stump: a puckered seam with stitch marks either side. */
    function socketScar(seed, P) {
        const R = rng(seed), S = new Shape(), w = P || 2, n = 40;
        const line = Array.from({ length: n + 1 }, (_, i) => [i / n * w, Math.sin(i / n * TAU * Math.max(1, Math.round(w / 1.2))) * 0.08]);
        S.stroke(line, t => 0.13 + 0.05 * Math.sin(t * 37 + R() * 0.1), 'line');
        S.stroke(line.map(p => [p[0], p[1] + 0.32]), 0.05, 'fillA', { density: 0.5 });
        const marks = Math.max(4, Math.round(w / 0.28));
        for (let k = 0; k < marks; k++) {
            const x = (k + 0.5) / marks * w;
            S.stroke([[x - 0.03, -0.38], [x + 0.03, 0.38]], 0.028, 'fillB');
            S.dot(x - 0.035, -0.46, 0.035, 'fillB').dot(x + 0.035, 0.46, 0.035, 'fillB');
        }
        return S;
    }

    // ── implants ──────────────────────────────────────────────────────────
    function implantLines(seed, P, H) {
        // Smooth light lines branching and rejoining, like conduits under the skin.
        const R = rng(seed), S = new Shape(), w = P || 2, h = H || 2, n = P ? Math.max(2, Math.round(P * 1.5)) : 4;
        for (let k = 0; k < n; k++) {
            const x0 = P ? (k + 0.5) * w / n : -0.8 + k * 0.5;
            const pts = [];
            for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([x0 + Math.sin(t * 5 + k) * 0.12 + (R() - 0.5) * 0.05, h / 2 - t * h]); }
            const line = spline(pts, 6);
            S.stroke(line, 0.022);
            for (let q = 0; q < 3; q++) { const a = along(line, 0.2 + q * 0.28); S.dot(a.p[0], a.p[1], 0.04); }
            if (k < n - 1 && R() > 0.3) { const a = along(line, 0.3 + R() * 0.4); S.stroke(spline([a.p, [a.p[0] + w / n * 0.5, a.p[1] - 0.15], [a.p[0] + w / n, a.p[1] - 0.25]], 6), 0.016); }
        }
        return S;
    }
    function implantBumps(seed) {
        const S = new Shape(), R = rng(seed), layout = Math.floor(R() * 3);
        if (layout === 0) for (let k = 0; k < 5; k++) S.dot(-0.8 + k * 0.4, 0, 0.13);
        else if (layout === 1) for (let r = 0; r < 3; r++) for (let k = 0; k <= r; k++) S.dot((k - r / 2) * 0.38, 0.5 - r * 0.38, 0.13);
        else for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; S.dot(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.12); }
        return S;
    }
    function implantPorts(seed) {
        const S = new Shape(), R = rng(seed), n = 1 + Math.floor(R() * 3);
        for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * 0.62; S.dot(x, 0, 0.26, 'fillB', { relief: 1 }); S.dot(x, 0, 0.17, 'line', { relief: 0 }); S.dot(x, 0, 0.07, 'hi', { relief: 0 }); }
        return S;
    }

    // ── the library ───────────────────────────────────────────────────────
    // band: has a repeating strip; sleeve: fills a whole limb; aspect: [half width, half height] of its box.
    const MOTIFS = [
        { id: 'tribal', kind: 'tattoo', label: 'Tribal', band: true, sleeve: true, aspect: [1, 1], palette: ['#141414', '#141414'], emblem: tribalEmblem, strip: tribalBand },
        { id: 'mandala', kind: 'tattoo', label: 'Mandala', band: true, aspect: [1, 1], palette: ['#7b2230', '#2b5f73'], emblem: mandalaEmblem, strip: mandalaBand },
        { id: 'floral', kind: 'tattoo', label: 'Rose and vine', band: true, sleeve: true, aspect: [0.85, 1], palette: ['#b3202c', '#2f6a3a'], emblem: floralEmblem, strip: (s, P) => { const S = new Shape(); vine(S, P, s); return S; } },
        { id: 'botanical', kind: 'tattoo', label: 'Fine-line sprig', band: true, aspect: [0.6, 1], palette: ['#3e6b45', '#7c4d8e'], emblem: botanicalEmblem, strip: botanicalBand },
        { id: 'skull', kind: 'tattoo', label: 'Skull', aspect: [0.8, 1], palette: ['#6a6a6a', '#8a2020'], emblem: skullEmblem },
        { id: 'serpent', kind: 'tattoo', label: 'Dragon serpent', band: true, sleeve: true, aspect: [0.85, 1], palette: ['#2f7a4a', '#d8b443'], emblem: serpentEmblem, coil: serpentCoil },
        { id: 'koi', kind: 'tattoo', label: 'Koi', aspect: [0.75, 1], palette: ['#d9531e', '#efe7da'], emblem: koiEmblem },
        { id: 'wings', kind: 'tattoo', label: 'Spread wings', aspect: [1.6, 0.8], palette: ['#3c3c46', '#d0a530'], emblem: wingsEmblem },
        { id: 'bird', kind: 'tattoo', label: 'Swift', aspect: [1, 0.9], palette: ['#20406e', '#c02a2a'], emblem: birdEmblem },
        { id: 'geometric', kind: 'tattoo', label: 'Sacred geometry', band: true, sleeve: true, aspect: [0.9, 1.3], palette: ['#141414', '#141414'], emblem: geometricEmblem, strip: geometricBand, fillSleeve: geometricSleeve },
        { id: 'runes', kind: 'tattoo', label: 'Runes', band: true, sleeve: true, aspect: [1, 1], palette: ['#141414', '#141414'], emblem: runesEmblem, strip: runesBand },
        { id: 'script', kind: 'tattoo', label: 'Script', text: true, aspect: [1.6, 0.5], palette: ['#141414', '#141414'], emblem: (s, text) => scriptEmblem(text) },
        { id: 'circuit', kind: 'tattoo', label: 'Circuitry', band: true, sleeve: true, aspect: [1, 1], palette: ['#1a2a30', '#1a2a30'], emblem: circuitEmblem, strip: (s, P) => circuitTile(s, P, 2), fillSleeve: (s, P, H) => circuitTile(s, P, H) },
        { id: 'barcode', kind: 'tattoo', label: 'Barcode', text: true, aspect: [1, 0.6], palette: ['#141414', '#141414'], emblem: (s, text) => barcodeEmblem(s, text) },
        { id: 'stripes', kind: 'paint', label: 'Streaks', aspect: [1, 0.6], palette: ['#1b1b1b', '#1b1b1b'], emblem: stripesPaint },
        { id: 'handprint', kind: 'paint', label: 'Handprint', aspect: [0.7, 1], palette: ['#9e1b1b', '#9e1b1b'], emblem: handprint },
        { id: 'mask', kind: 'paint', label: 'Eye band', aspect: [1, 0.5], palette: ['#141414', '#141414'], emblem: maskPaint, face: true },
        { id: 'clan', kind: 'paint', label: 'Clan marks', aspect: [0.8, 1], palette: ['#e8e2d4', '#e8e2d4'], emblem: clanPaint, face: true },
        { id: 'dots', kind: 'paint', label: 'Dot rows', aspect: [1, 0.5], palette: ['#e8e2d4', '#e8e2d4'], emblem: dotsPaint },
        { id: 'skullface', kind: 'paint', label: 'Skull face', aspect: [0.8, 1], palette: ['#101010', '#101010'], emblem: skullPaint, face: true },
        { id: 'cut', kind: 'scar', label: 'Cut', aspect: [1, 0.5], emblem: cutScar },
        { id: 'slash', kind: 'scar', label: 'Slashes', aspect: [1, 1], emblem: slashScar },
        { id: 'claws', kind: 'scar', label: 'Claw marks', aspect: [0.8, 1], emblem: clawScar },
        { id: 'burn', kind: 'scar', label: 'Burn', aspect: [1, 0.9], emblem: burnScar },
        { id: 'brand', kind: 'scar', label: 'Brand', aspect: [1, 1], emblem: brandScar },
        { id: 'stitches', kind: 'scar', label: 'Stitched cut', aspect: [1, 0.45], emblem: stitchScar },
        { id: 'socket', kind: 'scar', label: 'Stump seam', hidden: true, band: true, aspect: [1, 0.5], emblem: s => socketScar(s, 2), strip: socketScar },
        { id: 'lines', kind: 'implant', label: 'Light lines', band: true, aspect: [0.6, 1], palette: ['#38e1ff', '#38e1ff'], emblem: s => implantLines(s), strip: (s, P) => implantLines(s, P, 2), fillSleeve: (s, P, H) => implantLines(s, P, H) },
        { id: 'bumps', kind: 'implant', label: 'Subdermal studs', aspect: [1, 1], palette: ['#38e1ff', '#38e1ff'], emblem: implantBumps },
        { id: 'ports', kind: 'implant', label: 'Ports', aspect: [1, 0.4], palette: ['#38e1ff', '#9aa3ad'], emblem: implantPorts }
    ];
    const BY_ID = new Map(MOTIFS.map(m => [m.id, m]));

    /**
     * A motif drawn and compiled for a layout. `layout`: { mode: 'emblem' |
     * 'band' | 'sleeve', P (the band's period in units), H (a sleeve's
     * height) }. Kept by key: the same motif is compiled once per picture.
     */
    const compiled = new Map();
    function motif(id, layout, seed, text, margin) {
        const m = BY_ID.get(id);
        if (!m) return null;
        const mode = layout && layout.mode || 'emblem';
        const P = layout && layout.P || 2, H = layout && layout.H || 2;
        const key = [id, mode, mode === 'emblem' ? 0 : P.toFixed(3), mode === 'sleeve' ? H.toFixed(3) : 0, seed | 0, m.text ? String(text || '') : '', (margin || 0).toFixed(3)].join('|');
        if (compiled.has(key)) return compiled.get(key);
        let shape, period = 0;
        if (mode === 'sleeve' && m.coil) { shape = m.coil(seed, P, H); period = P; }
        else if (mode === 'sleeve' && m.fillSleeve) { shape = m.fillSleeve(seed, P, H); period = P; }
        else if (mode === 'sleeve' && m.strip) {
            // Rows of the band, staggered, the length of the limb.
            shape = new Shape();
            const rows = Math.max(1, Math.round(H / 2.1));
            for (let r = 0; r < rows; r++) shape.add(m.strip(seed + r * 13, P), { x: (r % 2) * P / 2, y: H / 2 - (r + 0.5) * H / rows, sy: (H / rows) / 2.1 });
            period = P;
        } else if (mode !== 'emblem' && m.coil) { shape = m.coil(seed, P, 2); period = P; }
        else if (mode !== 'emblem' && m.strip) { shape = m.strip(seed, P); period = P; }
        else shape = m.emblem(seed, text);
        const out = Object.assign(compile(shape, { period, margin: margin ?? 0.05 }), { id, mode, text: !!m.text });
        if (compiled.size > 48) compiled.delete(compiled.keys().next().value);
        compiled.set(key, out);
        return out;
    }

    /**
     * A small picture of a motif: RGBA bytes `size` square, the ink in its
     * own colors on a pale skin (the builder's tiles draw these).
     */
    function preview(id, o = {}) {
        const size = o.size || 64, m = BY_ID.get(id), out = new Uint8Array(size * size * 4);
        const M = motif(id, o.band ? { mode: 'band', P: 2 } : { mode: 'emblem' }, o.seed || 1, o.text, 0.05);
        const bg = o.background || [232, 208, 188], hex = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16));
        const pal = m ? (m.palette || ['#141414', '#141414']) : ['#141414', '#141414'];
        const line = hex(o.color || (m && m.kind === 'scar' ? '#c98e86' : m && m.kind === 'implant' ? '#38e1ff' : '#1a1a1e'));
        const A = hex(o.color2 || pal[0]), B = hex(o.color3 || pal[1]);
        const tones = [line, A, B, line, [250, 250, 245]];
        const aspect = m ? m.aspect : [1, 1], span = Math.max(aspect[0], aspect[1]) * 1.08;
        const ev = { w: new Float32Array(5) };
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = ((x + 0.5) / size * 2 - 1) * span + (o.band ? 1 : 0), v = (1 - (y + 0.5) / size * 2) * span;
            if (M) evaluate(M, u, v, span * 2.2 / size, ev);
            const o4 = (y * size + x) * 4;
            let c = bg.slice();
            if (M && ev.alpha > 0) {
                const w = ev.w;
                // Shading as a soft tone of the line color.
                for (let q = 0; q < 5; q++) if (w[q] > 0) c = c.map((ch, i) => ch + (tones[q][i] - ch) * w[q] * (q === 3 ? 0.6 : 1));
            }
            out[o4] = c[0]; out[o4 + 1] = c[1]; out[o4 + 2] = c[2]; out[o4 + 3] = 255;
        }
        return out;
    }

    const api = { Shape, compile, evaluate, motif, preview, scriptText, MOTIFS, BY_ID, TONES, RUNES, GLYPHS, _internal: { spline, outline, along, rng, bez, circlePts } };
    root.RRCharacterBodyArtMotifs = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
