/**
 * RRTreeConstruction - trees grown branch by branch: a trunk with its root
 * flare (and, when old, roots lifting out of the ground), limbs set round it
 * by the golden angle, each bending under gravity and toward the light and
 * wandering a little, thinning by the pipe rule; leaf cards gathered where
 * twigs end, shaded as one round canopy; fronds, hanging strands and
 * tufts for the trees that grow those.
 *
 * `grow(spec, ctx)` is shared with shrubs and alien plants: it returns the
 * bark geometry, the leaf cards (to be laid once the canopy is known) and
 * the branch tips. `build(r, look)` makes a whole tree from its recipe.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Kit = need('RRNatureKit', './NatureKit.js');
    const { add, sub, scale, dot, cross, len, norm, lerp, mix, clamp, smooth, rotate, basis } = Kit.vec;
    const UP = [0, 1, 0];

    /** A point and tangent along a polyline at share `t` of its length. */
    function along(pts, t) {
        const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
        return { p: mix(pts[i], pts[i + 1], k), d: norm(sub(pts[i + 1], pts[i])), i: f };
    }

    /**
     * The branching engine. `spec`:
     *   levels: [{ count, start, end, down, downVar, len, lenVar, radius, gravity, photo, wobble, segs, sides, tip, spread? }]
     *     for each level after the trunk (1 limbs, 2 branches, ...).
     *   trunk: { height, radius, segs, sides, lean, wobble, split (share where the trunk gives way to limbs), flare, lobes, twist, stems, stemSpread }
     *   envelope(h): length factor for level-1 limbs at height share h (0 crown base, 1 top).
     *   leaves: { level, start, every (m between cards), size, cells, orient, droop }.
     * `ctx`: { R (roll), N (noise), bark (geo), sway(p), color(p), tile (bark meters), detail }.
     * Returns { tips: [{ p, d, r, level }], cards: [{ base, up, side, w, h, cell, fold }], skeleton: [{ pts, r }] }.
     */
    function grow(spec, ctx) {
        const R = ctx.R, N = ctx.N, out = { tips: [], cards: [], skeleton: [] }, T = spec.trunk, tile = ctx.tile || 0.6;
        const levels = spec.levels || [], leaves = spec.leaves || null;
        const crownBase = T.height * (spec.crownBase ?? 0.3);
        const wander = (p, s) => [N.n3(p[0] * s + 11.3, p[1] * s, p[2] * s), N.n3(p[0] * s, p[1] * s + 37.1, p[2] * s) * 0.5, N.n3(p[0] * s, p[1] * s, p[2] * s + 71.7)];

        /** A branch's path: `segs` steps from `p` along `d`, bent by its level's tropisms. */
        function path(p, d, length, L, level) {
            const pts = [p], segs = Math.max(2, L.segs | 0), step = length / segs;
            let q = p.slice(), dir = d.slice();
            for (let i = 1; i <= segs; i++) {
                const w = wander(q, L.wobbleScale || 0.6);
                let nd = add(dir, scale(w, (L.wobble || 0) * step / Math.max(0.3, length) * 4));
                nd = add(nd, [0, ((L.photo || 0) - (L.gravity || 0) - (L.arch || 0) * i / segs) * step / Math.max(0.5, length) * 2.5, 0]);
                if (L.spread) { const h = norm([q[0], 0, q[2]]); if (Math.hypot(q[0], q[2]) > 1e-3) nd = add(nd, scale(h, L.spread * step / length)); }
                dir = norm(nd);
                // Nothing grows down into the ground: a limb near it turns level.
                if (q[1] + dir[1] * step < (L.floor ?? 0.15) && dir[1] < 0) dir = norm([dir[0], Math.abs(dir[1]) * 0.2, dir[2]]);
                q = add(q, scale(dir, step));
                pts.push(q);
            }
            return pts;
        }

        /** Lays a branch's bark, then its children and leaves. */
        function branch(pts, r0, r1, level, length, L, opts = {}) {
            const n = pts.length, rAt = opts.profile ? t => r0 * opts.profile(t) : t => lerp(r0, r1, Math.pow(t, L.taper || 0.85));
            const sides = Math.max(3, Math.round((L.sides || 6) * (ctx.detail || 1)));
            const flare = opts.flare || 0, lobes = opts.lobes || 0, phase = R.next() * 6.28;
            const radius = (k, a) => {
                const t = k / (n - 1);
                let r = rAt(t);
                // A child swells where it leaves its parent: the joint reads as grown, not stuck on.
                if (level > 0 && t < 0.2) r *= 1 + 0.35 * (1 - t / 0.2) * (1 - t / 0.2);
                if (flare) {
                    const f = flare * Math.exp(-t * length / (opts.flareHeight || 1));
                    const lobe = lobes ? Math.pow(0.5 + 0.5 * Math.cos(lobes * a + phase + N.n3(Math.cos(a) * 2, t * 3, Math.sin(a) * 2) * 1.5), 2.2) : 0.5;
                    r *= 1 + f * (0.35 + 1.3 * lobe);
                }
                if (opts.gnarl) r *= 1 + opts.gnarl * 0.18 * N.n3(Math.cos(a) * 1.7 + k * 0.4, t * 5, Math.sin(a) * 1.7);
                return r;
            };
            const circ = 2 * Math.PI * r0, uRep = Math.max(1, Math.round(circ / tile));
            Kit.tube(level >= 2 && ctx.twig ? ctx.twig : ctx.bark, pts, radius, { sides, uRepeat: uRep, vScale: tile * (uRep * tile / Math.max(circ, 1e-3)) ** 0.5, v0: R.next() * 10, color: ctx.color ? (k, p) => ctx.color(p, level, k / (n - 1)) : null, sway: ctx.sway, capEnd: true, twist: opts.twist || 0 });
            out.skeleton.push({ pts, r0, r1, level });
            const next = levels[level];
            // Children.
            if (next && level < (spec.maxLevel ?? levels.length)) {
                const count = Math.max(0, Math.round(next.count * (opts.childScale || 1) * (0.85 + R.next() * 0.3)));
                let phyllo = R.next() * Math.PI * 2;
                for (let c = 0; c < count; c++) {
                    const t = lerp(next.start, next.end, count === 1 ? 0.5 + R.next() * 0.5 : (c + 0.25 + R.next() * 0.5) / count);
                    const at = along(pts, t), pr = rAt(t);
                    phyllo += (next.rotate ?? 2.39996) + (R.next() - 0.5) * 0.5;
                    const [u, v] = basis(at.d), around = add(scale(u, Math.cos(phyllo)), scale(v, Math.sin(phyllo)));
                    let downAngle = (next.down + (R.next() - 0.5) * 2 * (next.downVar || 0)) * Math.PI / 180;
                    // Limbs set high on a trunk point more upward when the crown is narrow.
                    const axis = norm(cross(at.d, around));
                    let dir = rotate(at.d, axis, downAngle);
                    if (next.flat) dir = norm([dir[0], dir[1] * (1 - next.flat), dir[2]]);
                    let clen = length * next.len * (1 + (R.next() - 0.5) * 2 * (next.lenVar || 0));
                    if (level === 0 && spec.envelope) {
                        const h = clamp((at.p[1] - crownBase) / Math.max(0.1, T.height - crownBase), 0, 1);
                        clen = T.height * next.len * spec.envelope(h) * (1 + (R.next() - 0.5) * 2 * (next.lenVar || 0));
                    } else clen *= 1 - (next.shorten ?? 0.5) * t;
                    if (clen < 0.04) continue;
                    const cr = Math.min(pr * 0.9, Math.max(0.004, pr * (next.radius || 0.5) * Math.pow(clen / Math.max(0.05, length), 0.35)));
                    const cp = path(at.p, dir, clen, next, level + 1);
                    branch(cp, cr, cr * (next.tip ?? 0.18), level + 1, clen, next, { gnarl: next.gnarl });
                }
            }
            if (!next || level >= (spec.maxLevel ?? levels.length)) out.tips.push({ p: pts[n - 1], d: norm(sub(pts[n - 1], pts[n - 2])), r: r1, level, pts });
            // Leaf cards along the leafy levels.
            if (leaves && level >= (leaves.level ?? levels.length) && !opts.bare) {
                const from = leaves.start ?? 0.3, span = length * (1 - from), every = leaves.every || 0.3;
                const k = Math.max(1, Math.round(span / every));
                for (let i = 0; i < k; i++) {
                    const t = from + (1 - from) * (i + R.next() * 0.8) / k, at = along(pts, t);
                    out.cards.push({ at: at.p, d: at.d, r: rAt(t), t, level });
                }
                // The tip carries a card or two of its own.
                for (let i = 0; i < (leaves.tipCards ?? 1); i++) out.cards.push({ at: pts[n - 1], d: norm(sub(pts[n - 1], pts[n - 2])), r: r1, t: 1, level });
            }
        }

        // Trunks (one, or a clump of stems), each with its limbs.
        const stems = Math.max(1, T.stems || 1);
        for (let s = 0; s < stems; s++) {
            const a = (s / stems) * Math.PI * 2 + R.next() * 0.8, off = stems > 1 ? T.radius * 1.4 : 0;
            const base = [Math.cos(a) * off, 0, Math.sin(a) * off];
            let dir = norm([Math.cos(a) * (T.stemSpread || 0) + (T.lean || 0) * Math.cos(T.leanDir || 0), 1, Math.sin(a) * (T.stemSpread || 0) + (T.lean || 0) * Math.sin(T.leanDir || 0)]);
            const h = T.height * (stems > 1 ? 0.8 + R.next() * 0.25 : 1) * (T.split || 1);
            const L0 = { segs: T.segs || 12, wobble: T.wobble || 0.1, wobbleScale: T.wobbleScale || 0.35, gravity: T.gravity || 0, photo: T.photo ?? 0.25, sides: T.sides || 14, taper: T.taper || 1, floor: -1 };
            const pts = path(base, dir, h, L0, 0);
            const r = T.radius * (stems > 1 ? 0.7 : 1);
            branch(pts, r, r * (T.tip ?? (T.split && T.split < 1 ? 0.55 : 0.08)), 0, h, L0, { flare: T.flare || 0, lobes: T.lobes || 0, flareHeight: T.flareHeight || r * 3, twist: T.twist || 0, gnarl: T.gnarl || 0, childScale: Math.pow(stems, -0.25), profile: T.profile });
        }
        return out;
    }

    /** Roots lifting out of the ground around a trunk foot: they arch away and dive back into the soil. */
    function roots(ctx, count, trunkR, reach, lift) {
        const R = ctx.R;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + (R.next() - 0.5) * 0.6, out = [Math.cos(a), 0, Math.sin(a)];
            const far = reach * (0.7 + R.next() * 0.6), rise = lift * (0.6 + R.next() * 0.6);
            const ctrl = [];
            for (let k = 0; k <= 6; k++) {
                const t = k / 6, d = trunkR * 0.3 + far * t, y = rise * Math.sin(Math.PI * (0.25 + 0.75 * t)) * (1 - t * 0.6) + trunkR * 0.25 * (1 - t);
                const side = rotate(out, UP, (R.next() - 0.5) * 0.5 * t);
                ctrl.push([side[0] * d, y * (1 - Math.pow(t, 2.2)) - trunkR * 0.5 * Math.pow(t, 3), side[2] * d]);
            }
            const pts = Kit.spline(ctrl, 3), r0 = trunkR * (0.32 + R.next() * 0.14), from = ctx.bark.P.length;
            Kit.tube(ctx.bark, pts, (k, ang) => r0 * Math.pow(1 - k / (pts.length - 1) * 0.92, 1.1) * (1 + 0.12 * Math.cos(ang * 2)), { sides: 8, uRepeat: 2, vScale: ctx.tile || 0.6, color: ctx.color ? (k, p) => ctx.color(p, 1, k / (pts.length - 1)) : null, capEnd: true });
            // Where a root goes under, it is cut flat at the ground: it reads as entering the soil.
            for (let i = from + 1; i < ctx.bark.P.length; i += 3) if (ctx.bark.P[i] < 0) { ctx.bark.P[i] = 0; if (ctx.bark.N[i] < 0) ctx.bark.N[i] *= 0.3; }
        }
    }

    /**
     * The canopy's round from where its cards are: a center and the radii of
     * the ellipsoid that holds them, so a card's normal can lean out from it.
     */
    function canopyOf(cards) {
        if (!cards.length) return { c: [0, 1, 0], r: [1, 1, 1] };
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const k of cards) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], k.at[d]); hi[d] = Math.max(hi[d], k.at[d]); }
        return { c: mix(lo, hi, 0.5), r: [0, 1, 2].map(d => Math.max(0.2, (hi[d] - lo[d]) / 2)) };
    }

    /**
     * The leaf cards laid as geometry: `cards` from `grow`, each grown into a
     * card facing out of the canopy, sized `size` (m), its picture one of
     * `cells`. Orient: 'out' (clusters radiating), 'flat' (sprays lying
     * level along a branch: conifers), 'up' (tufts at tips), 'hang'.
     * Colors: a tint per card, darker deep in the canopy and underneath.
     */
    function layCards(g, cards, o) {
        const R = o.R, cv = o.canopy || canopyOf(cards), cells = o.cells, outward = o.outward ?? 0.72, tint = o.tint || (() => [1, 1, 1]);
        for (let k of cards) {
            const size = o.size * (0.8 + R.next() * 0.4) * (k.scale || 1), w = size * (o.aspect || 1), h = size;
            let up, side;
            const rel = sub(k.at, cv.c), outN = norm([rel[0] / (cv.r[0] * cv.r[0]), rel[1] / (cv.r[1] * cv.r[1]), rel[2] / (cv.r[2] * cv.r[2])]);
            if (o.orient === 'shell') {
                // Lying on the surface (a clipped hedge, a ball): up along it, the face out.
                const out = k.out || outN, t0 = sub(UP, scale(out, dot(UP, out)));
                const tan = len(t0) > 0.2 ? norm(t0) : basis(out)[0];
                up = norm(add(rotate(tan, out, (R.next() - 0.5) * 2.4), scale(out, 0.25 + R.next() * 0.3)));
                side = norm(cross(up, out));
                k = Object.assign({}, k, { at: add(k.at, scale(up, -size * 0.45)) });
            } else if (o.orient === 'flat') {
                // Along the branch, laid nearly level, a little splayed to either side.
                const sway = (R.next() - 0.5) * 1.6, fl = norm([k.d[0], k.d[1] * 0.25 - 0.05, k.d[2]]);
                up = rotate(fl, UP, sway);
                side = norm(cross(UP, up));
                up = norm(add(up, scale(UP, (o.lift ?? 0.12) + (R.next() - 0.5) * 0.25)));
                side = rotate(side, up, (R.next() - 0.5) * 0.6);
            } else if (o.orient === 'up') {
                up = norm(add(add(k.d, scale(UP, 0.8)), [(R.next() - 0.5) * 1.2, 0, (R.next() - 0.5) * 1.2]));
                side = norm(cross(up, [R.next() - 0.5, R.next() - 0.5, R.next() - 0.5]));
            } else {
                // Out of the twig, toward the light and away from the canopy's middle.
                up = norm(add(add(scale(k.d, 0.9), scale(outN, 0.7)), [(R.next() - 0.5) * 1.3, (R.next() - 0.2) * 0.9 - (o.droop || 0), (R.next() - 0.5) * 1.3]));
                const face = norm(add(outN, [(R.next() - 0.5) * 0.9, (R.next() - 0.5) * 0.6, (R.next() - 0.5) * 0.9]));
                side = norm(cross(up, face));
                if (!Number.isFinite(side[0]) || len(side) < 0.5) side = basis(up)[0];
            }
            const cell = cells[Math.floor(R.next() * cells.length)];
            // The card's foot sits at the twig, just inside the bark, so nothing floats.
            const base = add(k.at, scale(up, -Math.min(h * 0.12, (k.r || 0) + 0.02)));
            const depth = clamp(len([rel[0] / cv.r[0], rel[1] / cv.r[1], rel[2] / cv.r[2]]), 0, 1.3);
            const card = tint(k, R);
            Kit.card(g, base, up, side, w, h, cell, {
                fold: o.fold ?? 0, bend: o.bend || 0, twoSided: true,
                normal: (p, face) => {
                    const rp = sub(p, cv.c), on = norm([rp[0] / (cv.r[0] * cv.r[0]), rp[1] / (cv.r[1] * cv.r[1]), rp[2] / (cv.r[2] * cv.r[2])]);
                    return norm(mix(face, on, outward));
                },
                color: p => {
                    const rp = sub(p, cv.c), dd = clamp(len([rp[0] / cv.r[0], rp[1] / cv.r[1], rp[2] / cv.r[2]]), 0, 1.2);
                    const ao = o.shade ? o.shade(k, p) : (o.aoFloor ?? 0.42) + (1 - (o.aoFloor ?? 0.42)) * smooth(0.15, 1.0, dd) * (0.82 + 0.18 * clamp(rp[1] / cv.r[1] + 0.5, 0, 1));
                    return Kit.linear(card).map((c, i) => c * (Array.isArray(ao) ? ao[i] : ao));
                },
                sway: o.sway
            });
            void depth;
        }
        return g;
    }

    // ── the trees ─────────────────────────────────────────────────────────
    const Tex = need('RRNatureTexture', './NatureTexture.js');
    const grid = list => list.map((c, i) => Object.assign({ rect: [(i % 2) * 0.5, Math.floor(i / 2) * 0.5, 0.5, 0.5] }, c));
    const strips = list => list.map((c, i) => Object.assign({ rect: [i * 0.25, 0, 0.25, 1] }, c));
    /** The uv rect of atlas cell `i` ([u0, v0 (the card's foot), u1, v1]). */
    const cellUv = (cells, i) => { const [x, y, w, h] = cells[i].rect; return [x + 0.004, y + 0.002, x + w - 0.004, y + h - 0.004]; };

    /** Leaf colors by season for a leaf family. */
    const LEAF = {
        broad: { spring: ['#86b442', '#9ac452', '#74a43a', '#a8c860'], summer: ['#3f6a22', '#4c7a2a', '#365e1e', '#5a8630'], autumn: ['#b8702a', '#8e5a24', '#c8923a', '#7a4a1e', '#a8a03a'] },
        maple: { spring: ['#8cba48', '#a0c858', '#7aa83c'], summer: ['#3e6e26', '#4a7e2c', '#5a8a32'], autumn: ['#d8401a', '#e87a1a', '#b8281a', '#f0a828', '#c85a20'] },
        sacred: { spring: ['#a4c050', '#b8cc60', '#94b444'], summer: ['#5a7a2a', '#6a8a30', '#4e6e24', '#7a9234'], autumn: ['#e0b030', '#d8962a', '#e8c848', '#c87a24'] },
        birch: { spring: ['#9cc450', '#b0d060', '#8ab844'], summer: ['#5a8a2c', '#6a9a34', '#4e7e26'], autumn: ['#f0c830', '#e0b020', '#f8dc58', '#d89a20'] },
        willow: { spring: ['#a0c050', '#b0cc60', '#90b444'], summer: ['#5e7e2e', '#6e8e36', '#4e6e28'], autumn: ['#d0b840', '#c0a830', '#e0c850'] },
        needle: { spring: ['#5a8a46', '#6a9a4e', '#78a856'], summer: ['#3e7044', '#4c7e4c', '#386640', '#5c8e54', '#46784a'], autumn: ['#3e6a40', '#4a7444', '#5a7a42'] },
        pine: { spring: ['#5e8a44', '#6a9a4a'], summer: ['#4a7038', '#56803e', '#426634'], autumn: ['#4a6e36', '#5a7636'] },
        palm: { spring: ['#5a8a2c', '#6a9a34', '#4e7e26'], summer: ['#4a7a2a', '#5a8a30', '#3e6a24'], autumn: ['#7a8a2c', '#8a8a34', '#6a7a26'] },
        tropic: { spring: ['#6a9a30', '#7aaa3a'], summer: ['#4a7a28', '#3e6a22', '#5a8a2e'], autumn: ['#8a8a2a', '#a07a2a'] },
        dragon: { spring: ['#4e7a3a', '#5a8a42'], summer: ['#3e6a3a', '#4a7a42', '#365e32'], autumn: ['#4e6a3a', '#5a7a3a'] }
    };
    const leafSet = (family, season) => (LEAF[family] || LEAF.broad)[season === 'snow' || season === 'bare' ? 'summer' : season] || LEAF.broad.summer;

    /**
     * Each species: { bark: [style, colors], leaf family, spec(r, R, H) -> the
     * grow spec, cells(season, r) -> leaf picture cells, card: { size, ... },
     * evergreen?, special? }. `r.spread` and `r.character` are 0..1.
     */
    const SPECIES = {
        oak: {
            bark: ['furrowed', ['#2a231d', '#5b4d40', '#8b7d6b']], family: 'broad', tile: 0.55,
            spec: (r, R, H) => {
                const age = r.character, sp = 0.75 + r.spread * 0.6;
                return {
                    crownBase: 0.25, trunk: { height: H, split: 0.4 + 0.08 * (1 - age), radius: H * (0.028 + 0.028 * age), segs: 10, sides: 18, wobble: 0.25 + age * 0.4, flare: 0.5 + age * 0.9, lobes: 5, tip: 0.3, gnarl: age * 0.8 },
                    envelope: h => 1 - 0.3 * h,
                    levels: [
                        { count: 5 + Math.round(age * 2), start: 0.55, end: 1, down: 48 * sp, downVar: 12, len: 0.62 * sp, lenVar: 0.15, radius: 0.72, tip: 0.12, gravity: 0.08 + age * 0.06, photo: 0.26, wobble: 0.45 + age * 0.4, segs: 9, sides: 10, spread: 0.45 * sp, gnarl: age },
                        { count: 9, start: 0.15, end: 0.98, down: 52, downVar: 14, len: 0.52, lenVar: 0.2, radius: 0.55, tip: 0.12, gravity: 0.14, photo: 0.12, wobble: 0.6, segs: 5, sides: 5, shorten: 0.4 },
                        { count: 6, start: 0.2, end: 1, down: 50, downVar: 18, len: 0.5, lenVar: 0.25, radius: 0.5, tip: 0.25, gravity: 0.15, photo: 0.15, wobble: 0.7, segs: 2, sides: 3, shorten: 0.45 }
                    ],
                    leaves: { level: 2, start: 0.45, every: 0.24, tipCards: 2 }
                };
            },
            cells: (season, r) => grid([{ painter: 'cluster', shape: 'oak', palette: leafSet('broad', season), count: 22, len: 0.24, wid: 0.62 }, { painter: 'cluster', shape: 'oak', palette: leafSet('broad', season), count: 20, len: 0.26, wid: 0.6 }, { painter: 'cluster', shape: 'oak', palette: leafSet('broad', season), count: 18, len: 0.25, wid: 0.62 }, { painter: 'cluster', shape: 'oak', palette: leafSet('broad', season), count: 24, len: 0.23, wid: 0.6 }]),
            card: { size: 1.25, outward: 0.75 }, roots: r => r.character > 0.45, moss: r => r.character > 0.55
        },
        maple: {
            bark: ['furrowed', ['#3a332c', '#6f655a', '#a09688']], family: 'maple', tile: 0.5,
            spec: (r, R, H) => {
                const sp = 0.7 + r.spread * 0.6, age = r.character;
                return {
                    crownBase: 0.25, trunk: { height: H, split: 0.48, radius: H * (0.024 + 0.016 * age), segs: 10, sides: 14, wobble: 0.15, flare: 0.4 + age * 0.4, lobes: 4, tip: 0.25 },
                    envelope: h => Math.sin(Math.PI * (0.3 + 0.65 * h)) * (1 - 0.2 * h),
                    levels: [
                        { count: 6, start: 0.5, end: 1, down: 36 * sp, downVar: 10, len: 0.5 * sp, lenVar: 0.12, radius: 0.7, tip: 0.12, gravity: 0.04, photo: 0.32, wobble: 0.3, segs: 8, sides: 9, spread: 0.3 },
                        { count: 9, start: 0.15, end: 0.98, down: 45, downVar: 12, len: 0.5, lenVar: 0.2, radius: 0.55, tip: 0.12, gravity: 0.08, photo: 0.15, wobble: 0.4, segs: 5, sides: 5 },
                        { count: 6, start: 0.2, end: 1, down: 45, downVar: 15, len: 0.48, lenVar: 0.2, radius: 0.5, tip: 0.25, gravity: 0.1, photo: 0.12, wobble: 0.5, segs: 3, sides: 3 }
                    ],
                    leaves: { level: 2, start: 0.45, every: 0.24, tipCards: 2 }
                };
            },
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'palmate', palette: leafSet('maple', season), count: 10 + i, len: 0.22, wid: 1, lobes: 5 }))),
            card: { size: 1.2, outward: 0.78 }
        },
        sacred: {
            bark: ['furrowed', ['#2e2a24', '#6a6052', '#a29680']], family: 'sacred', tile: 0.55,
            spec: (r, R, H) => {
                const age = r.character, sp = 0.85 + r.spread * 0.5;
                return {
                    crownBase: 0.4, trunk: { height: H, split: 0.52, radius: H * (0.045 + 0.03 * age), segs: 12, sides: 20, wobble: 0.6 + age * 0.4, flare: 0.9 + age * 0.8, lobes: 6, tip: 0.3, twist: 0.35 + age * 0.4, gnarl: 0.6 + age, lean: 0.1, leanDir: R.next() * 6.3 },
                    envelope: h => 1 - 0.45 * h,
                    levels: [
                        { count: 5 + Math.round(age * 2), start: 0.5, end: 1, down: 46 * sp, downVar: 10, len: 0.6 * sp, lenVar: 0.2, radius: 0.7, tip: 0.12, gravity: 0.03, photo: 0.3, wobble: 0.8, segs: 9, sides: 10, spread: 0.3, gnarl: 0.7 },
                        { count: 9, start: 0.2, end: 0.98, down: 55, downVar: 15, len: 0.48, lenVar: 0.2, radius: 0.55, tip: 0.12, gravity: 0.05, photo: 0.22, wobble: 0.8, segs: 5, sides: 5, flat: 0.45 },
                        { count: 6, start: 0.2, end: 1, down: 55, downVar: 20, len: 0.45, lenVar: 0.25, radius: 0.5, tip: 0.25, gravity: 0.02, photo: 0.3, wobble: 0.8, segs: 3, sides: 3, flat: 0.3 }
                    ],
                    leaves: { level: 2, start: 0.55, every: 0.2, tipCards: 2 }
                };
            },
            cells: season => grid([{ painter: 'cluster', shape: 'round', palette: leafSet('sacred', season), count: 26, len: 0.2, wid: 0.75 }, { painter: 'cluster', shape: 'heart', palette: leafSet('sacred', season), count: 22, len: 0.22, wid: 0.85 }, { painter: 'cluster', shape: 'round', palette: leafSet('sacred', season), count: 24, len: 0.21, wid: 0.8 }, { painter: 'cluster', shape: 'round', palette: leafSet('sacred', season), count: 24, len: 0.22, wid: 0.75 }]),
            card: { size: 1.15, outward: 0.8, flatten: 0.4 }, roots: () => true, moss: r => r.character > 0.3, rope: () => true
        },
        spruce: { conifer: 'spruce', bark: ['plated', ['#2a1d16', '#5e4232', '#8a6a50']], family: 'needle', tile: 0.9, evergreen: true,
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'spray', palette: leafSet('needle', season), stem: '#5a4430', branches: 7 + (i % 2), needle: 0.08, splay: 0.85 }))), card: { size: 1.35 } },
        fir: { conifer: 'fir', bark: ['smooth', ['#36383a', '#666a68', '#8e928c']], family: 'needle', tile: 0.5, evergreen: true,
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'spray', palette: leafSet('needle', season).map(c => c), stem: '#4a3a2a', branches: 8, needle: 0.065, splay: 1.15 }))), card: { size: 1.35 } },
        pine: {
            bark: ['plated', ['#3a2216', '#9a5430', '#c88a58']], family: 'pine', tile: 1.2, evergreen: true,
            spec: (r, R, H) => {
                const sp = 0.7 + r.spread * 0.6;
                return {
                    crownBase: 0.55, trunk: { height: H, split: 0.92, radius: H * 0.022, segs: 12, sides: 12, wobble: 0.18, flare: 0.3, lobes: 4, tip: 0.2, lean: 0.06, leanDir: R.next() * 6.3 },
                    envelope: h => 0.25 + 0.75 * Math.sin(Math.PI * (0.15 + 0.85 * (1 - h)) * 0.6),
                    levels: [
                        { count: 13 + Math.round(r.character * 6), start: 0.5, end: 1, down: 70, downVar: 15, len: 0.32 * sp, lenVar: 0.25, radius: 0.5, tip: 0.3, gravity: 0.05, photo: 0.35, wobble: 0.6, segs: 6, sides: 7 },
                        { count: 6 + Math.round(r.character * 3), start: 0.25, end: 1, down: 45, downVar: 15, len: 0.5, lenVar: 0.25, radius: 0.55, tip: 0.3, gravity: 0.0, photo: 0.4, wobble: 0.5, segs: 4, sides: 5 }
                    ],
                    leaves: { level: 2, start: 0.45, every: 0.22, tipCards: 4 }
                };
            },
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'tuft', palette: leafSet('pine', season), tufts: 2 + (i % 2), count: 70, needle: 0.36 }))),
            card: { size: 1.05, orient: 'up', outward: 0.6 }
        },
        cedar: { conifer: 'cedar', bark: ['furrowed', ['#2e2620', '#5f5246', '#8e8072']], family: 'needle', tile: 0.55, evergreen: true,
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'spray', palette: leafSet('needle', season).map(c => Kit.vec ? c : c), stem: '#5a4430', branches: 9, needle: 0.05, splay: 1.3 }))), card: { size: 1.4 } },
        coconut: { palm: 'coconut', bark: ['ringed', ['#3a3226', '#7a6a52', '#b8a888']], family: 'palm', tile: 1.2,
            cells: season => strips([{ painter: 'frond', palette: leafSet('palm', season), stem: '#8a8a48', count: 40, reach: 0.98, leaflet: 0.075, angle: 1.05, ragged: 0.06 }, { painter: 'frond', palette: leafSet('palm', season), stem: '#8a8a48', count: 38, reach: 0.95, leaflet: 0.08, angle: 0.95, ragged: 0.12 }, { painter: 'frond', palette: ['#8a6a3a', '#9a7a4a', '#7a5a30'], stem: '#7a6040', count: 34, reach: 0.8, leaflet: 0.06, angle: 0.6, ragged: 0.3 }, { painter: 'frond', palette: leafSet('palm', season), stem: '#8a8a48', count: 42, reach: 1, leaflet: 0.07, angle: 1.1 }]) },
        date: { palm: 'date', bark: ['plated', ['#3a2a1a', '#7a5a38', '#a8875a']], family: 'palm', tile: 0.7,
            cells: season => strips([{ painter: 'frond', palette: ['#5a7a5a', '#6a8a62', '#4e6e52'], stem: '#8a8a58', count: 46, reach: 0.9, leaflet: 0.05, angle: 0.75, peak: 0.5 }, { painter: 'frond', palette: ['#5a7a5a', '#64845e', '#4e6e52'], stem: '#8a8a58', count: 44, reach: 0.85, leaflet: 0.05, angle: 0.7, peak: 0.5 }, { painter: 'frond', palette: ['#8a6a3a', '#9a7a4a'], stem: '#7a6040', count: 34, reach: 0.7, leaflet: 0.045, angle: 0.5, ragged: 0.3 }, { painter: 'frond', palette: ['#587858', '#6a8a62'], stem: '#8a8a58', count: 46, reach: 0.9, leaflet: 0.05, angle: 0.8, peak: 0.5 }]) },
        fanpalm: { palm: 'fan', bark: ['ringed', ['#4a4238', '#8a7e6c', '#b8ae9a']], family: 'palm', tile: 1.0,
            cells: season => grid([{ painter: 'fan', palette: leafSet('palm', season), stem: '#7a7a40', count: 40 }, { painter: 'fan', palette: leafSet('palm', season), stem: '#7a7a40', count: 36 }, { painter: 'fan', palette: ['#8a7048', '#a08458', '#6e5838', '#b4986a'], stem: '#6a5030', count: 38 }, { painter: 'fan', palette: leafSet('palm', season), stem: '#7a7a40', count: 44 }]) },
        birch: {
            bark: ['papery', ['#161616', '#c9c5bd', '#f3f1eb']], family: 'birch', tile: 0.6,
            spec: (r, R, H, stems) => {
                const sp = 0.7 + r.spread * 0.5, droop = r.character;
                return {
                    crownBase: 0.3, trunk: { height: H, split: 0.96, radius: H * 0.016, segs: 12, sides: 12, wobble: 0.2, flare: 0.3, lobes: 3, tip: 0.1, stems: stems || 1, stemSpread: 0.28, lean: 0.04, leanDir: R.next() * 6.3 },
                    envelope: h => Math.sin(Math.PI * (0.15 + 0.85 * (1 - h) * 0.85)) * (0.55 + 0.45 * (1 - h)),
                    levels: [
                        { count: 16, start: 0.28, end: 0.98, down: 45 * sp, downVar: 10, len: 0.32 * sp, lenVar: 0.2, radius: 0.45, tip: 0.12, gravity: 0.08 + droop * 0.25, photo: 0.22, wobble: 0.35, segs: 6, sides: 5, arch: droop * 0.5 },
                        { count: 7, start: 0.2, end: 1, down: 45, downVar: 15, len: 0.6, lenVar: 0.2, radius: 0.5, tip: 0.25, gravity: 0.25 + droop * 0.7, photo: 0.0, wobble: 0.4, segs: 3, sides: 3 }
                    ],
                    leaves: { level: 1, start: 0.5, every: 0.2, tipCards: 1 }
                };
            },
            stems: () => 1,
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'ovate', teeth: 16, palette: leafSet('birch', season), count: 18 + i, len: 0.2, wid: 0.7, stem: '#5a3a2a' }))),
            card: { size: 0.95, outward: 0.65, droop: 0.3 }
        },
        aspen: {
            bark: ['papery', ['#3a3a30', '#c8c8b4', '#e8e6d8']], family: 'birch', tile: 0.6,
            spec: (r, R, H) => SPECIES.birch.spec(Object.assign({}, r, { character: r.character * 0.3 }), R, H, 1),
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'sprig', shape: 'round', teeth: 10, palette: leafSet('birch', season), count: 10, len: 0.22, wid: 0.95, stem: '#6a5a3a' }))),
            card: { size: 0.75, outward: 0.7 }
        },
        willow: {
            bark: ['furrowed', ['#2a2620', '#5a5246', '#857b6c']], family: 'willow', tile: 0.5,
            spec: (r, R, H) => {
                const sp = 0.8 + r.spread * 0.6;
                return {
                    crownBase: 0.3, trunk: { height: H, split: 0.34, radius: H * 0.05, segs: 8, sides: 16, wobble: 0.35, flare: 0.7, lobes: 5, tip: 0.3, gnarl: 0.6 },
                    envelope: () => 1,
                    levels: [
                        { count: 6, start: 0.55, end: 1, down: 28 * sp, downVar: 10, len: 0.62 * sp, lenVar: 0.15, radius: 0.7, tip: 0.12, gravity: 0.0, photo: 0.55, arch: 1.3, wobble: 0.45, segs: 9, sides: 9, spread: 0.35 },
                        { count: 8, start: 0.3, end: 1, down: 50, downVar: 15, len: 0.42, lenVar: 0.2, radius: 0.5, tip: 0.2, gravity: 0.35, photo: 0.1, wobble: 0.5, segs: 4, sides: 4 }
                    ],
                    leaves: null
                };
            },
            cells: season => strips([0, 1, 2, 3].map(i => ({ painter: 'strand', palette: leafSet('willow', season), strands: 2 + (i % 2), count: 32, len: 0.065, wid: 0.08, stem: '#6a7a3a' }))),
            strands: true
        },
        dead: {
            bark: ['weathered', ['#3a3836', '#8a8680', '#cfcac0']], family: 'broad', tile: 0.6, bare: true,
            spec: (r, R, H) => {
                const g = r.character, sp = 0.7 + r.spread * 0.6;
                return {
                    crownBase: 0.3, trunk: { height: H, split: 0.55, radius: H * 0.035, segs: 12, sides: 14, wobble: 0.5 + g * 0.8, flare: 0.7, lobes: 5, tip: 0.35, twist: g * 0.6, gnarl: 0.5 + g, lean: 0.1 * g, leanDir: R.next() * 6.3 },
                    envelope: h => 1 - 0.4 * h,
                    levels: [
                        { count: 4, start: 0.4, end: 1, down: 40 * sp, downVar: 18, len: 0.5 * sp, lenVar: 0.35, radius: 0.65, tip: 0.18, gravity: 0.1, photo: 0.25, wobble: 0.9 + g, segs: 8, sides: 8, gnarl: g },
                        { count: 4, start: 0.3, end: 0.9, down: 45, downVar: 20, len: 0.5, lenVar: 0.35, radius: 0.5, tip: 0.15, gravity: 0.1, photo: 0.2, wobble: 1.0 + g, segs: 5, sides: 5 },
                        { count: 3, start: 0.3, end: 0.9, down: 45, downVar: 20, len: 0.45, lenVar: 0.3, radius: 0.5, tip: 0.2, gravity: 0.05, photo: 0.2, wobble: 1.0 + g, segs: 3, sides: 4 }
                    ],
                    leaves: null
                };
            },
            cells: season => grid([0, 1, 2, 3].map(() => ({ painter: 'litter', palette: ['#6a4a2a', '#8a6a3a', '#5a3a1e'] }))),
            card: { size: 0.5 }
        },
        spooky: {
            bark: ['weathered', ['#121010', '#3a3432', '#6a605a']], family: 'broad', tile: 0.6, bare: true,
            spec: (r, R, H) => {
                const s = SPECIES.dead.spec(Object.assign({}, r, { character: 0.6 + r.character * 0.4 }), R, H);
                s.levels[0].count = 6; s.levels[1].count = 6; s.levels[2].count = 5; s.levels[0].gravity = 0.3; s.levels[1].gravity = 0.25; s.trunk.split = 0.5;
                s.levels.push({ count: 3, start: 0.3, end: 1, down: 40, downVar: 25, len: 0.5, lenVar: 0.3, radius: 0.5, tip: 0.25, gravity: 0.2, photo: 0.1, wobble: 1.6, segs: 3, sides: 3 });
                return s;
            },
            cells: () => grid([0, 1, 2, 3].map(() => ({ painter: 'litter', palette: ['#3a2a1a'] }))), card: { size: 0.5 }
        },
        snag: {
            bark: ['weathered', ['#3a3430', '#7a726a', '#b4aca0']], family: 'broad', tile: 0.6, bare: true,
            spec: (r, R, H) => {
                const s = SPECIES.dead.spec(r, R, H);
                s.trunk.split = 0.85; s.trunk.tip = 0.55; s.levels[0].count = 3; s.levels[0].len = 0.22; s.levels[0].start = 0.35; s.levels[1].count = 2; s.levels.pop();
                return s;
            },
            cells: () => grid([0, 1, 2, 3].map(() => ({ painter: 'litter', palette: ['#5a3a1e'] }))), card: { size: 0.5 }, broken: true
        },
        baobab: {
            bark: ['fluted', ['#5a4a44', '#9a8070', '#c4ae9a']], family: 'tropic', tile: 1.4,
            spec: (r, R, H) => ({
                crownBase: 0.7, trunk: { height: H, split: 0.66, radius: H * (0.085 + 0.05 * r.spread), segs: 14, sides: 24, wobble: 0.06, flare: 0.18, lobes: 7, tip: 0.5,
                    profile: t => 1.05 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.5)) - 0.55 * Math.pow(t, 2.2) },
                envelope: () => 1,
                levels: [
                    { count: 7 + Math.round(r.character * 3), start: 0.86, end: 1, down: 62, downVar: 15, len: 0.3, lenVar: 0.2, radius: 0.3, tip: 0.3, gravity: 0.0, photo: 0.3, wobble: 0.9, segs: 6, sides: 9 },
                    { count: 4, start: 0.35, end: 1, down: 42, downVar: 15, len: 0.55, lenVar: 0.2, radius: 0.5, tip: 0.25, gravity: 0.0, photo: 0.3, wobble: 0.9, segs: 4, sides: 5 },
                    { count: 3, start: 0.4, end: 1, down: 40, downVar: 15, len: 0.5, lenVar: 0.2, radius: 0.5, tip: 0.3, gravity: 0.05, photo: 0.25, wobble: 0.8, segs: 2, sides: 3 }
                ],
                leaves: { level: 2, start: 0.5, every: 0.35, tipCards: 2 }
            }),
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'palmate', lobes: 5, palette: leafSet('tropic', season), count: 9 + i, len: 0.22, wid: 1 }))),
            card: { size: 1.0, outward: 0.6, sparse: 0.55 }, bottle: true
        },
        bottle: {
            bark: ['smooth', ['#4a4a3a', '#7a7a5a', '#a4a07a']], family: 'tropic', tile: 0.9,
            spec: (r, R, H) => ({
                crownBase: 0.45, trunk: { height: H, split: 0.62, radius: H * (0.06 + 0.035 * r.spread), segs: 14, sides: 18, wobble: 0.08, flare: 0.2, lobes: 5, tip: 0.35,
                    profile: t => 0.8 + 0.45 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.25)), 1.4) - 0.5 * Math.pow(t, 2.5) },
                envelope: h => Math.sin(Math.PI * (0.3 + 0.7 * h)),
                levels: [
                    { count: 8, start: 0.8, end: 1, down: 42, downVar: 12, len: 0.36, lenVar: 0.2, radius: 0.35, tip: 0.15, gravity: 0.05, photo: 0.3, wobble: 0.4, segs: 6, sides: 7 },
                    { count: 7 + Math.round(r.character * 3), start: 0.2, end: 1, down: 45, downVar: 15, len: 0.55, lenVar: 0.2, radius: 0.5, tip: 0.3, gravity: 0.15, photo: 0.15, wobble: 0.5, segs: 3, sides: 3 }
                ],
                leaves: { level: 1, start: 0.5, every: 0.22, tipCards: 2 }
            }),
            cells: season => grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'lance', palette: leafSet('tropic', season), count: 20, len: 0.3, wid: 0.25 }))),
            card: { size: 1.0, outward: 0.7 }, bottle: true
        },
        dragon: {
            bark: ['smooth', ['#5a5650', '#9a948a', '#c8c0b2']], family: 'dragon', tile: 0.7,
            spec: (r, R, H) => ({
                crownBase: 0.45, trunk: { height: H, split: 0.42, radius: H * 0.05, segs: 8, sides: 14, wobble: 0.06, flare: 0.3, lobes: 4, tip: 0.85 },
                envelope: () => 1,
                levels: [
                    { count: 4, start: 0.97, end: 1, down: 38 + r.spread * 10, downVar: 6, len: 0.2, lenVar: 0.1, radius: 0.72, tip: 0.85, gravity: 0, photo: 0.4, wobble: 0.15, segs: 4, sides: 9, rotate: 1.57 },
                    { count: 3, start: 0.97, end: 1, down: 34 + r.spread * 10, downVar: 6, len: 0.85, lenVar: 0.1, radius: 0.75, tip: 0.85, gravity: 0, photo: 0.35, wobble: 0.15, segs: 3, sides: 7, rotate: 2.1, shorten: 0 },
                    { count: 2 + Math.round(r.character), start: 0.97, end: 1, down: 30, downVar: 6, len: 0.85, lenVar: 0.1, radius: 0.75, tip: 0.85, gravity: 0, photo: 0.3, wobble: 0.1, segs: 3, sides: 6, rotate: 3.14, shorten: 0 },
                    { count: 2, start: 0.97, end: 1, down: 28, downVar: 6, len: 0.8, lenVar: 0.1, radius: 0.75, tip: 0.8, gravity: 0, photo: 0.3, wobble: 0.1, segs: 3, sides: 5, rotate: 3.14, shorten: 0 }
                ],
                leaves: null
            }),
            cells: season => strips([0, 1, 2, 3].map(() => ({ painter: 'blades', palette: leafSet('dragon', season), count: 3, wid: 0.5 }))),
            rosettes: true
        },
        cherry: {
            bark: ['cherry', ['#2a1414', '#5a2a24', '#a07a6a']], family: 'broad', tile: 0.5, blossom: { petals: ['#f6b8c8', '#f9d2dc', '#ec9ab2', '#fde6ec'], center: '#e8b85a' },
            spec: (r, R, H) => {
                const sp = 0.85 + r.spread * 0.6, age = r.character;
                return {
                    crownBase: 0.3, trunk: { height: H, split: 0.36, radius: H * (0.03 + 0.02 * age), segs: 10, sides: 14, wobble: 0.35 + age * 0.3, flare: 0.5, lobes: 4, tip: 0.3, gnarl: 0.3 + age * 0.5 },
                    envelope: h => 1 - 0.35 * h,
                    levels: [
                        { count: 5, start: 0.55, end: 1, down: 52 * sp, downVar: 12, len: 0.6 * sp, lenVar: 0.15, radius: 0.7, tip: 0.12, gravity: 0.1, photo: 0.2, wobble: 0.6, segs: 8, sides: 9, spread: 0.4 },
                        { count: 9, start: 0.15, end: 0.98, down: 48, downVar: 15, len: 0.5, lenVar: 0.2, radius: 0.55, tip: 0.12, gravity: 0.1, photo: 0.14, wobble: 0.6, segs: 5, sides: 5, flat: 0.25 },
                        { count: 6, start: 0.2, end: 1, down: 45, downVar: 18, len: 0.45, lenVar: 0.25, radius: 0.5, tip: 0.25, gravity: 0.08, photo: 0.15, wobble: 0.7, segs: 3, sides: 3 }
                    ],
                    leaves: { level: 2, start: 0.35, every: 0.2, tipCards: 2 }
                };
            },
            cells: (season, r, sp) => season === 'spring' ? grid([0, 1, 2, 3].map(i => ({ painter: 'blossom', petals: sp.blossom.petals, center: sp.blossom.center, palette: leafSet('broad', 'spring'), count: 30 + i * 3, leaves: i === 3 ? 4 : 1, stem: '#3a2620', size: 0.08 })))
                : grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'ovate', teeth: 18, palette: leafSet('broad', season), count: 16, len: 0.26, wid: 0.45, stem: '#4a2a22' }))),
            card: { size: 1.05, outward: 0.75 }
        },
        jacaranda: {
            bark: ['smooth', ['#3a3430', '#6a625a', '#958a7e']], family: 'broad', tile: 0.5, blossom: { petals: ['#9a7ae0', '#b08ef0', '#8466d0', '#c4a8f4'], center: '#f0e0f8' },
            spec: (r, R, H) => SPECIES.cherry.spec(r, R, H),
            cells: (season, r, sp) => season === 'spring' ? grid([0, 1, 2, 3].map(i => ({ painter: 'blossom', petals: sp.blossom.petals, center: sp.blossom.center, palette: leafSet('broad', 'spring'), count: 26 + i * 3, leaves: 2, stem: '#3a3026', size: 0.075, petalCount: 5 })))
                : grid([0, 1, 2, 3].map(() => ({ painter: 'frond', bipinnate: true, palette: leafSet('broad', season), count: 12, stem: '#5a6a30' }))),
            card: { size: 0.85, outward: 0.75 }
        },
        magnolia: {
            bark: ['smooth', ['#3e3a36', '#7a746c', '#a8a096']], family: 'broad', tile: 0.5, blossom: { petals: ['#fbe8ee', '#f4c6d6', '#ffffff', '#e8a8c0'], center: '#d8b080' },
            spec: (r, R, H) => { const s = SPECIES.cherry.spec(r, R, H); s.levels[0].down *= 0.8; s.levels[0].photo = 0.35; return s; },
            cells: (season, r, sp) => season === 'spring' ? grid([0, 1, 2, 3].map(i => ({ painter: 'blossom', petals: sp.blossom.petals, center: sp.blossom.center, palette: leafSet('broad', 'spring'), count: 9 + i, leaves: 0, stem: '#3a3026', size: 0.16, petalCount: 6 })))
                : grid([0, 1, 2, 3].map(() => ({ painter: 'sprig', shape: 'ovate', palette: leafSet('broad', season), count: 8, len: 0.34, wid: 0.5 }))),
            card: { size: 0.8, outward: 0.75 }
        }
    };


    /** Subsample `list` to at most `max`, keeping its order (seeded). */
    function thin(list, max, R) {
        if (list.length <= max) return list;
        const keep = list.map((x, i) => [R.next(), i]).sort((a, b) => a[0] - b[0]).slice(0, Math.max(0, max)).map(x => x[1]).sort((a, b) => a - b);
        return keep.map(i => list[i]);
    }

    /** A conifer: a straight leader with whorls of branches, each carrying flat needle sprays. */
    function conifer(kind, r, H, ctx, cards) {
        const R = ctx.R, N = ctx.N, sp = 0.75 + r.spread * 0.55, dens = 0.75 + r.character * 0.6;
        const cfg = {
            spruce: { base: 0.07, reach: 0.27, droop: 0.32, curl: 0.25, perWhorl: 6, spacing: 0.42, radius: 0.022, shape: h => Math.pow(1 - h, 1.05) },
            fir: { base: 0.12, reach: 0.22, droop: 0.05, curl: 0.4, perWhorl: 5, spacing: 0.5, radius: 0.02, shape: h => Math.pow(1 - h, 0.9) * (h < 0.08 ? 0.85 : 1) },
            cedar: { base: 0.28, reach: 0.42, droop: -0.02, curl: 0.15, perWhorl: 4, spacing: 1.25, radius: 0.04, shape: h => (1 - h * 0.75), tiers: true }
        }[kind];
        const trunkR = H * cfg.radius * (kind === 'cedar' ? 1 + r.character * 0.6 : 1);
        const lean = [N.n3(1, 2, 3) * 0.08, 1, N.n3(4, 5, 6) * 0.08];
        const ctrl = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6; ctrl.push([lean[0] * H * t * t + N.n3(t * 3, 1, 0) * 0.08 * H * 0.05, H * t, lean[2] * H * t * t + N.n3(0, 1, t * 3) * 0.08 * H * 0.05]); }
        const trunk = Kit.spline(ctrl, 3);
        const tr = (k, a) => {
            const t = k / (trunk.length - 1);
            let rr = trunkR * Math.pow(1 - t, 0.9) + 0.01;
            rr *= 1 + 0.8 * Math.exp(-t * H / (trunkR * 4)) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.cos(4 * a + 1.3), 2));
            return rr;
        };
        Kit.tube(ctx.bark, trunk, tr, { sides: 12, uRepeat: Math.max(1, Math.round(2 * Math.PI * trunkR / ctx.tile)), vScale: ctx.tile, color: ctx.color ? (k, p) => ctx.color(p, 0, k / (trunk.length - 1)) : null, sway: ctx.sway, capEnd: true });
        const trunkAt = y => { const t = clamp(y / H, 0, 1); return along(trunk, t).p; };
        // Whorls from the crown's foot to the top, closer toward the top.
        const start = H * cfg.base, spacing = cfg.spacing * 1.12 * (H / 14) ** 0.5 / dens;
        let y = start, w = 0, phase = R.next() * 6.28;
        while (y < H * 0.97) {
            const h = (y - start) / Math.max(0.1, H - start), count = Math.max(3, Math.round(cfg.perWhorl * (cfg.tiers ? 1.2 : 1) * (1 - h * 0.25)));
            phase += 0.5 + R.next() * 0.4;
            for (let b = 0; b < count; b++) {
                const az = phase + b / count * Math.PI * 2 + (R.next() - 0.5) * 0.5, out = [Math.cos(az), 0, Math.sin(az)];
                const L = Math.max(0.25, H * cfg.reach * sp * cfg.shape(h) * (0.8 + R.next() * 0.35));
                const p0 = trunkAt(y + (R.next() - 0.5) * spacing * 0.3), segs = 5, pts = [p0];
                let d = norm([out[0], -cfg.droop * (1 - h * 0.6) + (R.next() - 0.5) * 0.1, out[2]]), q = p0.slice();
                for (let i = 1; i <= segs; i++) {
                    const t = i / segs;
                    d = norm(add(d, [0, (cfg.curl * t - cfg.droop * 0.4 * (1 - t)) * 0.25, 0]));
                    q = add(q, scale(d, L / segs));
                    pts.push(q.slice());
                }
                const br = Math.max(0.008, trunkR * 0.28 * Math.sqrt(L / (H * cfg.reach)));
                Kit.tube(ctx.twig || ctx.bark, pts, (k) => br * (1 - 0.8 * k / segs) + 0.004, { sides: 4, uRepeat: 1, vScale: ctx.tile, color: ctx.color ? (k, p) => ctx.color(p, 1, k / segs) : null, sway: ctx.sway, capEnd: true });
                // Side shoots on tiered trees, sprays along every branch.
                const shoots = [pts];
                if (cfg.tiers) for (let s = 0; s < 4; s++) {
                    const t = 0.25 + s * 0.18, a = along(pts, t), side = norm(cross(UP, a.d)), sd = s % 2 ? 1 : -1, sl = L * 0.45 * (1 - t * 0.5);
                    const e = add(a.p, scale(norm(add(scale(a.d, 0.6), scale(side, sd * 0.8))), sl));
                    const sp2 = [a.p, mix(a.p, e, 0.5), e];
                    Kit.tube(ctx.twig || ctx.bark, sp2, k => br * 0.5 * (1 - 0.6 * k / 2) + 0.003, { sides: 3, uRepeat: 1, vScale: ctx.tile, color: ctx.color ? (k, p) => ctx.color(p, 2, 0.5) : null, sway: ctx.sway, capEnd: true });
                    shoots.push(sp2);
                }
                for (const s of shoots) {
                    const sl = len(sub(s[s.length - 1], s[0])), n = Math.max(1, Math.round(sl / 0.26 * dens));
                    for (let i = 0; i < n; i++) {
                        const t = 0.28 + 0.72 * (i + R.next() * 0.7) / n, a = along(s, t), reach = clamp(Math.hypot(a.p[0] - p0[0], a.p[2] - p0[2]) / Math.max(0.3, L), 0, 1);
                        cards.push({ at: a.p, d: a.d, r: 0.01, t, level: 2, scale: 0.75 + 0.35 * (1 - h), reach, tier: w });
                        if (R.next() < 0.45) cards.push({ at: a.p, d: a.d, r: 0.01, t, level: 2, scale: 0.65 + 0.3 * (1 - h), reach, tier: w });
                    }
                }
            }
            y += spacing * (1 - h * 0.45) * (0.85 + R.next() * 0.3);
            w++;
        }
        // The leader's tip carries its own sprays, pointing up.
        for (let i = 0; i < 4; i++) cards.push({ at: trunkAt(H * (0.93 + i * 0.015)), d: norm([R.next() - 0.5, 2.5, R.next() - 0.5]), r: 0.01, t: 1, level: 2, scale: 0.6, tip: true, reach: 1, tier: 99 });
        return { trunk, trunkR };
    }

    /** A palm: a ringed, leaning trunk, a crown of fronds (or fans), and its fruit. */
    function palm(kind, r, H, ctx, fronds, extras) {
        const R = ctx.R, N = ctx.N, lean = (kind === 'coconut' ? 0.12 : 0.02) + r.spread * 0.45, az = R.next() * 6.28;
        const trunkR = H * (kind === 'date' ? 0.032 : kind === 'fan' ? 0.026 : 0.022);
        const ctrl = [];
        for (let k = 0; k <= 5; k++) {
            const t = k / 5, bend = lean * H * (t - 0.45 * t * t) * (kind === 'coconut' ? 1 : 0.6);
            ctrl.push([Math.cos(az) * bend + N.n3(t * 2, 0.5, 0) * 0.1, H * t * (1 - lean * 0.18), Math.sin(az) * bend + N.n3(0.5, t * 2, 0) * 0.1]);
        }
        const trunk = Kit.spline(ctrl, 4);
        const top = trunk[trunk.length - 1], n = trunk.length - 1;
        Kit.tube(ctx.bark, trunk, (k, a) => {
            const t = k / n;
            return trunkR * (1 + 0.55 * Math.exp(-t * H / 0.7) + (kind === 'date' ? 0.15 : 0) - 0.12 * t + 0.25 * smooth(0.9, 1, t)) * (1 + 0.04 * Math.cos(3 * a));
        }, { sides: 14, uRepeat: Math.max(1, Math.round(2 * Math.PI * trunkR / ctx.tile)), vScale: ctx.tile, color: ctx.color ? (k, p) => ctx.color(p, 0, k / n) : null, sway: ctx.sway, capEnd: true });
        const count = Math.round((kind === 'date' ? 22 : kind === 'fan' ? 26 : 14) * (0.7 + r.character * 0.7));
        let phi = R.next() * 6.28;
        for (let i = 0; i < count; i++) {
            phi += 2.39996;
            const age = (i + 0.5) / count, elev = (kind === 'date' ? 1.1 : 0.95) - age * (kind === 'date' ? 1.35 : 1.7) + (R.next() - 0.5) * 0.25;
            const dir = norm([Math.cos(phi) * Math.cos(elev), Math.sin(elev), Math.sin(phi) * Math.cos(elev)]);
            const Lf = H * (kind === 'fan' ? 0.11 : kind === 'date' ? 0.4 : 0.42) * (0.85 + R.next() * 0.25) * (1 - age * 0.15);
            const base = add(top, scale(dir, trunkR * 0.6)), segs = kind === 'fan' ? 3 : 9, pts = [base];
            let d = dir.slice(), q = base.slice();
            const grav = kind === 'date' ? 0.12 : kind === 'fan' ? 0.05 : 0.32;
            for (let k = 1; k <= segs; k++) { d = norm(add(d, [0, -grav * (0.4 + k / segs), 0])); q = add(q, scale(d, Lf / segs)); pts.push(q.slice()); }
            fronds.push({ pts, phi, age, dead: false });
        }
        // A few old fronds hang dead against the trunk; a fan palm wears a whole skirt of them.
        const deadCount = kind === 'fan' ? 0 : 3;
        for (let i = 0; i < deadCount; i++) {
            const a = R.next() * 6.28, base = add(top, [Math.cos(a) * trunkR * 1.1, -0.15 - (kind === 'fan' ? R.next() * H * 0.06 : 0), Math.sin(a) * trunkR * 1.1]);
            const Lf = H * (kind === 'fan' ? 0.16 : 0.32) * (0.8 + R.next() * 0.3), pts = [base];
            let d = norm([Math.cos(a) * 0.6, -1, Math.sin(a) * 0.6]), q = base.slice();
            for (let k = 1; k <= 5; k++) { d = norm(add(d, [Math.cos(a) * -0.12, -0.2, Math.sin(a) * -0.12])); q = add(q, scale(d, Lf / 5)); pts.push(q.slice()); }
            fronds.push({ pts, phi: a, age: 1, dead: true });
        }
        if (kind === 'coconut') for (let i = 0; i < 4 + Math.round(R.next() * 4); i++) {
            const a = R.next() * 6.28, c = add(top, [Math.cos(a) * trunkR * 1.6, -0.12 - R.next() * 0.25, Math.sin(a) * trunkR * 1.6]);
            Kit.blob(extras.fruit, c, [0.13, 0.15, 0.13], { sides: 10, rings: 6, color: () => Kit.linear(R.next() < 0.6 ? [0.42, 0.5, 0.2] : [0.45, 0.3, 0.16]), sway: ctx.sway });
        }
        if (kind === 'date') for (let i = 0; i < 4; i++) {
            const a = R.next() * 6.28, c0 = add(top, [Math.cos(a) * trunkR * 1.4, -0.3, Math.sin(a) * trunkR * 1.4]);
            for (let k = 0; k < 14; k++) Kit.blob(extras.fruit, add(c0, [(R.next() - 0.5) * 0.25, -R.next() * 0.45, (R.next() - 0.5) * 0.25]), [0.035, 0.05, 0.035], { sides: 6, rings: 4, color: () => Kit.linear([0.85, 0.45 + R.next() * 0.2, 0.12]), sway: ctx.sway });
        }
        return { top, trunkR };
    }

    /** A thick straw rope tied round the trunk at `y` with paper streamers (a shrine tree's shimenawa). */
    function rope(bark, center, y, extras, R) {
        const bins = new Array(36).fill(0);
        for (let i = 0; i < bark.P.length; i += 3) {
            if (Math.abs(bark.P[i + 1] - y) > 0.12) continue;
            const dx = bark.P[i] - center[0], dz = bark.P[i + 2] - center[2], d = Math.hypot(dx, dz);
            if (d > 3) continue;
            const b = Math.floor(((Math.atan2(dz, dx) + Math.PI) / (Math.PI * 2)) * 36) % 36;
            bins[b] = Math.max(bins[b], d);
        }
        const loop = [], maxR = Math.max(...bins) || 0.6;
        for (let k = 0; k <= 72; k++) {
            const b = k % 72, a = -Math.PI + (b + 0.5) / 72 * Math.PI * 2, rr = Math.max(bins[Math.floor(b / 2)], bins[(Math.floor(b / 2) + 1) % 36], maxR * 0.6) + 0.07;
            loop.push([center[0] + Math.cos(a) * rr, y + Math.sin(a * 2) * 0.02, center[2] + Math.sin(a) * rr]);
        }
        loop[72] = loop[0].slice();
        Kit.tube(extras.rope, loop, (k, a) => 0.075 * (1 + 0.18 * Math.cos(a * 2 + k * 1.3)), { sides: 10, uRepeat: 1, vScale: 0.4, color: () => Kit.linear([0.84, 0.74, 0.5]) });
        // Zigzag paper streamers (shide).
        for (let s = 0; s < 4; s++) {
            const k = Math.floor(s * 18 + 6), p = loop[k], out = norm([p[0] - center[0], 0, p[2] - center[2]]), side = [-out[2], 0, out[0]], pts = [];
            for (let j = 0; j <= 4; j++) pts.push(add(p, add(scale(out, 0.09), add([0, -0.12 - j * 0.11, 0], scale(side, (j % 2 ? 0.05 : -0.05))))));
            Kit.ribbon(extras.paper, pts, () => 0.045, () => side, [0, 0, 1, 1], { fold: 0, color: () => [0.95, 0.95, 0.92] });
        }
    }

    /**
     * A tree from its recipe: { geos: { bark, leaves, fruit?, rope?, paper? },
     * pictures wanted, materials }. `env`: { detail (0.6 while dragging, 1),
     * leafSize (the leaf picture's width) }.
     */
    function build(r, env = {}) {
        const sp = SPECIES[r.preset] || SPECIES.oak, H = r.size, R = Kit.roll(r.seed * 7 + 3), N = Kit.noise(r.seed);
        const season = r.season, evergreen = !!(sp.evergreen || sp.palm || sp.rosettes);
        const leafless = !!sp.bare || (!evergreen && (season === 'bare' || season === 'snow'));
        const geos = { bark: Kit.geo(), twig: Kit.geo(), leaves: Kit.geo(), fruit: Kit.geo(), rope: Kit.geo(), paper: Kit.geo() };
        const sway = p => clamp(Math.pow(Math.max(0, p[1]) / H, 1.7) + 0.12 * Math.hypot(p[0], p[2]) / H, 0, 1);
        const mossy = sp.moss ? sp.moss(r) : false;
        const barkColor = (p, level, t) => {
            const ground = 0.62 + 0.38 * smooth(0, Math.min(1.2, H * 0.12), p[1]);
            let c = [ground, ground, ground];
            if (mossy) { const m = smooth(H * 0.3, 0, p[1]) * (0.45 + 0.55 * N.n3(p[0] * 0.7, p[1] * 0.7, p[2] * 0.7)); c = mix(c, [0.66, 0.76, 0.5], clamp(m, 0, 0.55)); }
            return Kit.linear(c);
        };
        const ctx = { R, N, bark: geos.bark, twig: geos.twig, sway, color: barkColor, tile: sp.tile || 0.6, detail: env.detail || 1 };
        const cards = [], fronds = [];
        let trunkInfo = null, res = null;
        if (sp.conifer) trunkInfo = conifer(sp.conifer, r, H, ctx, cards);
        else if (sp.palm) trunkInfo = palm(sp.palm, r, H, ctx, fronds, geos);
        else {
            // A crown should carry its mass over its foot: of up to three takes on this seed, the best balanced is kept.
            let best = null;
            for (let attempt = 0; attempt < (sp.bare ? 2 : 3); attempt++) {
                const RA = attempt ? Kit.roll(r.seed * 7 + 3 + attempt * 7919) : R, take = Object.assign({}, ctx, { R: RA, bark: Kit.geo(), twig: Kit.geo() });
                const sp2 = sp.spec(r, RA, H, sp.stems ? sp.stems(r, RA) : 1), rs = grow(sp2, take);
                const pts = rs.cards.length ? rs.cards.map(c => c.at) : rs.tips.map(t => t.p);
                let cx = 0, cz = 0, reach = 0.1;
                for (const p of pts) { cx += p[0]; cz += p[2]; reach = Math.max(reach, Math.hypot(p[0], p[2])); }
                const imbalance = Math.hypot(cx, cz) / Math.max(1, pts.length) / reach;
                if (!best || imbalance < best.imbalance) best = { rs, spec: sp2, take, imbalance };
                if (imbalance < 0.1) break;
            }
            geos.bark = ctx.bark = best.take.bark; geos.twig = ctx.twig = best.take.twig;
            const spec = best.spec;
            res = best.rs;
            for (const c of res.cards) cards.push(c);
            if (sp.roots && sp.roots(r)) roots(ctx, 6 + Math.round(R.next() * 3), spec.trunk.radius, spec.trunk.radius * (3 + r.character * 2.5), spec.trunk.radius * (0.6 + r.character * 0.9));
            if (sp.broken) {
                // A snapped top: splinters standing round the break, pale where the wood is fresh.
                const t0 = res.skeleton[0], top = t0.pts[t0.pts.length - 1], d = norm(sub(top, t0.pts[t0.pts.length - 2])), rr = t0.r1, [u, v] = basis(d);
                for (let i = 0; i < 9; i++) {
                    const a = i / 9 * Math.PI * 2 + R.next() * 0.4, ring = add(top, add(scale(u, Math.cos(a) * rr * 0.75), scale(v, Math.sin(a) * rr * 0.75)));
                    const tip = add(ring, add(scale(d, rr * (0.6 + R.next() * 2.4)), scale(add(scale(u, Math.cos(a)), scale(v, Math.sin(a))), rr * (R.next() - 0.3) * 0.5)));
                    Kit.tube(geos.bark, [add(ring, scale(d, -rr * 0.6)), mix(ring, tip, 0.4), tip], k => rr * 0.32 * (1 - k * 0.48), { sides: 3, uRepeat: 1, vScale: 0.6, color: k => Kit.linear(k > 0 ? [1.25, 1.15, 1.0] : [1, 1, 1]), capEnd: true });
                }
            }
            if (sp.rope && sp.rope(r)) { const t0 = res.skeleton[0], y = Math.min(H * 0.28, 1.9); rope(geos.bark, along(t0.pts, y / (t0.pts[t0.pts.length - 1][1] || 1)).p, y, geos, R); }
        }
        const cellsSpec = sp.cells ? sp.cells(season, r, sp) : [];
        const leafUv = cellsSpec.map((_, i) => cellUv(cellsSpec, i));
        const sizeK = clamp(Math.pow(H / 11, 0.55), 0.45, 1.5);
        const tint = (k, RR) => {
            const vary = season === 'autumn' ? 0.16 : 0.08;
            return Kit.shift([1, 1, 1], 0, 0, 0).map((v, i) => clamp(v * (1 - vary + RR.next() * vary * 2) * (i === 2 ? 0.96 + RR.next() * 0.08 : 1), 0.5, 1.1));
        };
        // Leaves: as many cards as the budget leaves room for.
        const budget = (env.budget || 26000) * (env.detail || 1);
        const barkTris = Kit.count(geos.bark) + Kit.count(geos.twig);
        if (!leafless && cells(cellsSpec)) {
            if (sp.palm) {
                for (const f of fronds) {
                    const segs = f.pts.length, side = [-Math.sin(f.phi), 0, Math.cos(f.phi)], fan = sp.palm === 'fan';
                    const cell = f.dead ? leafUv[2] : leafUv[R.next() < 0.5 ? 0 : 1];
                    Kit.tube(geos.twig, f.pts, k => (fan ? 0.03 : 0.035) * (1 - 0.7 * k / (segs - 1)) + 0.006, { sides: 4, uRepeat: 1, vScale: 1, color: () => Kit.linear(f.dead ? [0.55, 0.45, 0.3] : [0.55, 0.6, 0.35]), sway, capEnd: true });
                    if (fan) {
                        const tip = f.pts[f.pts.length - 1], d = norm(sub(tip, f.pts[f.pts.length - 2])), fsize = H * 0.21 * (0.85 + R.next() * 0.3);
                        const up = f.dead ? norm(add(d, [0, -1.5, 0])) : norm(add(d, [0, 0.25, 0])), sd = norm(cross(up, f.dead ? side : norm(add(UP, scale(d, -0.6)))));
                        Kit.card(geos.leaves, add(tip, scale(up, -fsize * 0.2)), up, len(sd) > 0.5 ? sd : side, fsize * 1.1, fsize, f.dead ? leafUv[2] : leafUv[R.next() < 0.5 ? 0 : 1], { fold: 0.12, rows: 2, twoSided: true, bend: f.dead ? 0 : 0.15, normal: (p, face) => norm(mix(face, norm(sub(p, add(tip, [0, -fsize, 0]))), 0.4)), color: () => Kit.linear(f.dead ? [1, 1, 1] : [1, 1, 1].map(v => v * (0.85 + R.next() * 0.2))), sway });
                    } else {
                        const width = k => { const t = k / (segs - 1); return H * (sp.palm === 'date' ? 0.055 : 0.055) * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.6) * (0.4 + 0.6 * smooth(0, 0.3, t)) * (f.dead ? 0.6 : 1); };
                        const tone = 0.85 + R.next() * 0.2;
                        Kit.ribbon(geos.leaves, f.pts, width, () => side, cell, { twoSided: true, fold: f.dead ? -0.1 : (sp.palm === 'date' ? 0.35 : 0.28), color: (p, t) => Kit.linear([tone, tone, tone * 0.95].map(v => v * (0.75 + 0.25 * smooth(0, 0.3, t)))), sway });
                    }
                }
                if (sp.palm === 'fan' && trunkInfo) {
                    // A Washingtonia's skirt: dead fans hanging in overlapping rows down from the crown.
                    const { top, trunkR } = trunkInfo, rows = 2 + Math.round(r.character * 3), fs = H * 0.13;
                    for (let row = 0; row < rows; row++) for (let i = 0; i < 11; i++) {
                        const a = (i + (row % 2) * 0.5) / 11 * Math.PI * 2 + (R.next() - 0.5) * 0.3, out = [Math.cos(a), 0, Math.sin(a)];
                        const y = top[1] - 0.25 - row * fs * 0.42 - R.next() * fs * 0.25, at = [top[0] + out[0] * trunkR * (1.2 + row * 0.08 + R.next() * 0.3), y, top[2] + out[2] * trunkR * (1.2 + row * 0.08 + R.next() * 0.3)];
                        const down = norm([out[0] * (0.1 + R.next() * 0.35), -1, out[2] * (0.1 + R.next() * 0.35)]), side = rotate([-out[2], 0, out[0]], out, (R.next() - 0.5) * 0.7);
                        Kit.card(geos.leaves, at, down, side, fs * (0.8 + R.next() * 0.4), fs * (0.8 + R.next() * 0.4), leafUv[2], { fold: 0, twoSided: true, rows: 2, bend: -0.12, normal: (p, face) => norm([p[0] - top[0], 0.2, p[2] - top[2]]), color: () => Kit.linear([1, 1, 1].map(v => v * (0.7 + R.next() * 0.25))), sway });
                    }
                }
            } else if (sp.strands && res) {
                // Willow: strands fall from every branch, as long as the height allows.
                const droop = r.character, strands = [];
                for (const b of res.skeleton) if (b.level >= 1) {
                    const L = len(sub(b.pts[b.pts.length - 1], b.pts[0])), n = Math.max(1, Math.round(L / 0.2));
                    for (let i = 0; i < n; i++) strands.push(along(b.pts, 0.35 + 0.65 * (i + R.next()) / n));
                }
                const maxStrands = Math.floor((budget - barkTris) / 48);
                for (const a of thin(strands, maxStrands, R)) {
                    const out = norm([a.p[0], 0, a.p[2]]), fall = Math.max(0.6, (a.p[1] - H * 0.04) * (0.45 + droop * 0.5) * (0.75 + R.next() * 0.3));
                    const pts = [];
                    for (let k = 0; k <= 6; k++) { const t = k / 6, arc = Math.sin(t * Math.PI * 0.5) * 0.35 * (1 - t * 0.5); pts.push(add(a.p, [out[0] * arc + Math.sin(t * 3 + a.p[0]) * 0.05, -fall * Math.pow(t, 1.15), out[2] * arc + Math.cos(t * 3 + a.p[2]) * 0.05])); }
                    const side = norm([-out[2] + (R.next() - 0.5) * 0.6, 0, out[0] + (R.next() - 0.5) * 0.6]), cell = leafUv[Math.floor(R.next() * 4)], tone = 0.8 + R.next() * 0.25;
                    Kit.ribbon(geos.leaves, pts, k => 0.17 + 0.06 * Math.sin(k / 6 * Math.PI), () => side, cell, { twoSided: true, fold: 0.15, color: (p, t) => Kit.linear([tone, tone, tone].map(v => v * (0.7 + 0.3 * t))), normal: (p, face) => norm(mix(face, norm([p[0], 0.25, p[2]]), 0.65)), sway: p => clamp(sway(p) + 0.25, 0, 1) });
                }
            } else if (sp.rosettes && res) {
                // Dragon tree: a dense ball of stiff sword leaves on every tip.
                const tips = res.tips, per = Math.max(6, Math.min(14, Math.floor((budget - barkTris) / 4 / Math.max(1, tips.length))));
                for (const tip of tips) for (let i = 0; i < per; i++) {
                    const a = i / per * Math.PI * 2 + R.next(), el = 0.1 + R.next() * 1.3, up = norm([Math.cos(a) * Math.cos(el), Math.sin(el) + 0.2, Math.sin(a) * Math.cos(el)]);
                    const sd = norm(cross(up, [Math.cos(a + 1.6), 0.3, Math.sin(a + 1.6)])), size = 0.55 * sizeK * (0.8 + R.next() * 0.4);
                    Kit.card(geos.leaves, add(tip.p, scale(up, -0.05)), up, sd, size * 0.5, size, leafUv[Math.floor(R.next() * 4)], { fold: 0, twoSided: true, normal: (p, face) => norm(mix(face, norm(sub(p, add(tip.p, [0, -0.2, 0]))), 0.7)), color: p => Kit.linear([1, 1, 1].map(v => v * (0.65 + 0.35 * smooth(tip.p[1] - 0.3, tip.p[1] + 0.4, p[1])))), sway });
                }
            } else {
                const maxCards = Math.max(0, Math.floor((budget - barkTris) / 4));
                const chosen = thin(cards, Math.floor(maxCards * (sp.card && sp.card.sparse ? sp.card.sparse : 1)), R);
                const cv = canopyOf(chosen);
                if (sp.card && sp.card.flatten) cv.r[1] *= 1 - sp.card.flatten;
                layCards(geos.leaves, chosen, { R, cells: leafUv, size: ((sp.card && sp.card.size) || 0.9) * sizeK, canopy: cv, orient: sp.conifer ? 'flat' : sp.card && sp.card.orient, outward: sp.conifer ? 0.6 : sp.card && sp.card.outward, droop: sp.card && sp.card.droop, tint, sway, aoFloor: sp.conifer ? 0.5 : 0.42, lift: sp.conifer === 'cedar' ? 0.02 : 0.1,
                    // Conifers: each tier dark against the trunk and light toward its tips (new growth a touch yellower), so the layers read.
                    shade: sp.conifer ? (k, p) => { const v = 0.42 + 0.68 * smooth(0.05, 0.95, k.reach ?? 0.6), tip = smooth(0.7, 1, k.reach ?? 0.6) * 0.12; return [v * (1 + tip * 0.6), v * (1 + tip * 0.35), v * (1 - tip * 0.4)]; } : null });
            }
        }
        // Snow on the bark's upper faces, moss on an old tree's foot and roots.
        const covers = {};
        if (season === 'snow') covers.snow = Kit.cover(geos.bark, 0, geos.bark.P.length / 3, (p, n) => smooth(0.15, 0.6, n[1]) * (0.75 + 0.25 * N.n3(p[0] * 3, p[1] * 3, p[2] * 3)) * smooth(0.2, 0.8, p[1]) , Math.min(0.03, H * 0.003), { tile: 0.7 });
        if (mossy) {
            // Moss in soft clumps: big patches on the upper and shaded sides of the foot, roots and low limbs, thick enough to read as a cushion.
            const clump = p => smooth(0.02, 0.32, N.n3(p[0] * 0.55 + 7, p[1] * 0.55, p[2] * 0.55) + 0.18 * N.n3(p[0] * 1.6, p[1] * 1.6, p[2] * 1.6));
            covers.moss = Kit.cover(geos.bark, 0, geos.bark.P.length / 3, (p, n) => smooth(H * 0.32, H * 0.04, p[1]) * smooth(-0.35, 0.35, n[1] * 0.8 - n[2] * 0.35) * clump(p) * 1.25, Math.min(0.045, H * 0.003), { tile: 0.9 });
        }
        Kit.append(geos.bark, geos.twig);
        geos.twig = Kit.geo();
        return { geos, covers, season, leafless, cells: cellsSpec, species: sp, height: H, trunk: trunkInfo };
    }
    const cells = list => list && list.length;

    SPECIES.ancient = Object.assign({}, SPECIES.oak, { bark: ['furrowed', ['#211d18', '#4c4336', '#7a6e5a']], tile: 0.6, roots: () => true, moss: () => true,
        spec: (r, R, H) => {
            // An old giant shows its trunk: the crown sits higher, its limbs heavy and reaching.
            const s = SPECIES.oak.spec(r, R, H);
            s.trunk.split = 0.5; s.levels[0].start = 0.62; s.levels[0].down = 40 + r.spread * 20; s.levels[0].photo = 0.3; s.levels[0].len *= 0.9; s.leaves.start = 0.55;
            return s;
        } });
    SPECIES.clump = Object.assign({}, SPECIES.birch, { stems: (r, R) => 3 + (r.character > 0.6 ? 1 : 0) });

    const api = { grow, roots, canopyOf, layCards, along, thin, build, conifer, palm, SPECIES, LEAF, leafSet, grid, strips, cellUv };
    root.RRTreeConstruction = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
