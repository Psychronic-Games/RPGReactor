/**
 * RRSlimeBody - the Character Builder's Slimefolk: a body of shiny,
 * translucent goo with big glossy eyes, from a mound with eyes (a slime) to a
 * goo person whose legs melt into a puddle at its feet. One Form slider runs
 * between the two.
 *
 * The body is an implicit surface: a puddle and a mound, and over them the
 * pieces of a person (legs, hips, waist, chest, neck, head, arms and mitten
 * hands), each moving from where it lies inside the mound to where a
 * person's would be as the form rises, joined by a smooth minimum wide enough
 * to read as goo. Surface nets mesh it over a narrow band; the same samples
 * give the denser core, a level set further in. Bubbles and specks hang in
 * the goo; feelers and drips are lofted tubes rooted inside it.
 *
 * The goo's color and translucency come from one small ramp picture: thin goo
 * light and clear, thick goo deep and dense, the core in its own color. Core
 * and shell are one mesh, the core's triangles first, so they draw in that
 * order in any reader; the eyes and bubbles are opaque parts of their own.
 *
 * Motion is baked into bone keys (no simulation): Idle, Walk (a hop for a
 * blob, an ooze for a person), Attack, Hit, Death (a melt to a puddle) and
 * Talk, on a small skeleton: Root, Base (at the floor: squash and stretch),
 * Body, the legs, Chest, Head, the eyes, the arms and the feelers.
 *
 * Frame: y up, facing +z, the left at +x, meters, standing on y = 0. No DOM
 * and no three.js here: the builder page and the node tests share it.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? (() => { try { return require(file); } catch (e) { return null; } })() : null);
    const Props = need('RRCharacterProps', './CharacterProps.js');
    const Glb = need('RRCharacterGlb', './CharacterGlb.js');
    const Decimator = need('RRQuadricDecimator', '../../utils/QuadricDecimator.js');

    // ── small math ─────────────────────────────────────────────────────────
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => a + (b - a) * t;
    const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const TAU = Math.PI * 2;

    const HEX = /^#[0-9a-f]{6}$/i;
    const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const hexRgb = hex => { const n = parseInt(String(hex || '#888888').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    const linearOf = hex => hexRgb(hex).map(toLinear);
    const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

    // ── the recipe ─────────────────────────────────────────────────────────
    const FEELERS = [['none', 'None'], ['antennae', 'Antennae'], ['tendrils', 'Tendrils']];
    /** Goo colors with the core color that suits each. */
    const PALETTE = [
        ['#46c45a', '#d6ff6e'], ['#38c4d4', '#d2fbff'], ['#3c78e8', '#a6d6ff'], ['#8a4ae0', '#e8b0ff'], ['#ee6aaa', '#ffd6ea'],
        ['#d8383c', '#ffb46a'], ['#e8a030', '#fff2a0'], ['#a6de3c', '#f8ffb4'], ['#1fa888', '#a6ffda'], ['#2c2a3c', '#8a72ff'], ['#d4e6f0', '#ffffff']
    ];
    const DEFAULT_RECIPE = Object.freeze({
        plan: 'slime', species: 'slimefolk', form: 0, size: 1, color: '#46c45a', core: '#d6ff6e',
        translucency: 0.5, glow: 0.35, bubbles: 0.5, bubbleSize: 0.5, feelers: 'none',
        eyes: Object.freeze({ color: '#2e1c10', size: 1 }), props: Object.freeze([])
    });
    const RANGES = { form: [0, 1], size: [0.4, 2.5], translucency: [0, 1], glow: [0, 1], bubbles: [0, 1], bubbleSize: [0, 1] };

    /** Accessories the goo can wear: hats, which sit on top and sink a little into it. */
    const fits = id => { const def = Props && Props.BY_ID.get(id); return !!def && def.group === 'Hats'; };

    function normalizeRecipe(input) {
        const r = input || {};
        const out = { plan: 'slime', species: 'slimefolk' };
        for (const [key, [lo, hi]] of Object.entries(RANGES)) out[key] = r[key] !== '' && r[key] != null && Number.isFinite(+r[key]) ? clamp(+r[key], lo, hi) : DEFAULT_RECIPE[key];
        out.color = HEX.test(r.color || '') ? r.color.toLowerCase() : DEFAULT_RECIPE.color;
        out.core = HEX.test(r.core || '') ? r.core.toLowerCase() : DEFAULT_RECIPE.core;
        out.feelers = FEELERS.some(f => f[0] === r.feelers) ? r.feelers : 'none';
        const e = r.eyes || {};
        out.eyes = { color: HEX.test(e.color || '') ? e.color.toLowerCase() : DEFAULT_RECIPE.eyes.color, size: Number.isFinite(+e.size) && e.size !== '' && e.size != null ? clamp(+e.size, 0.5, 1.8) : 1 };
        out.props = Props ? Props.normalizeProps((Array.isArray(r.props) ? r.props : []).filter(p => p && fits(p.id))) : [];
        if (r.seed != null && Number.isFinite(+r.seed)) out.seed = (+r.seed) >>> 0;
        if (typeof r.name === 'string') out.name = r.name;
        return out;
    }

    /** A seeded Slimefolk: a goo color with its core, a form, and goo of its own. `scope` 'colors' keeps the shape. */
    function randomRecipe(seed, base, scope) {
        const rand = rng(Math.imul((seed >>> 0) ^ 0x2545f491, 0x9e3779b1) >>> 0 || 7);
        for (let i = 0; i < 3; i++) rand();
        const r = normalizeRecipe(base || {});
        const [color, core] = PALETTE[Math.floor(rand() * PALETTE.length)];
        Object.assign(r, { color, core, translucency: 0.25 + rand() * 0.5, glow: rand() * 0.8 });
        r.eyes = Object.assign({}, r.eyes, { color: ['#2e1c10', '#101014', '#1c3a6a', '#3a6a2a', '#6a1a1a', '#5a3a8a'][Math.floor(rand() * 6)] });
        if (scope !== 'colors') {
            // Mostly blobs, some goo people, a few in between.
            const pick = rand();
            r.form = pick < 0.5 ? rand() * 0.15 : pick < 0.8 ? 0.85 + rand() * 0.15 : 0.3 + rand() * 0.4;
            r.size = 0.8 + rand() * 0.45;
            r.bubbles = rand();
            r.bubbleSize = rand();
            r.feelers = rand() < 0.65 ? 'none' : rand() < 0.6 ? 'antennae' : 'tendrils';
            r.eyes.size = 0.8 + rand() * 0.5;
            r.seed = seed >>> 0;
        }
        return normalizeRecipe(r);
    }

    // ── the field ──────────────────────────────────────────────────────────
    function ellipsoid(p, c, r) {
        const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
        const k0 = Math.sqrt(x * x + y * y + z * z);
        const x1 = x / r[0], y1 = y / r[1], z1 = z / r[2];
        const k1 = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);
        return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
    }
    /** A capsule whose radius runs from `ra` at a to `rb` at b. */
    function capsule(p, a, b, ra, rb) {
        const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
        const px = p[0] - a[0], py = p[1] - a[1], pz = p[2] - a[2];
        const t = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz || 1), 0, 1);
        const dx = px - bx * t, dy = py - by * t, dz = pz - bz * t;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
    }
    const smin = (a, b, k) => {
        if (k <= 0) return Math.min(a, b);
        const h = Math.max(k - Math.abs(a - b), 0) / k;
        return Math.min(a, b) - h * h * k * 0.25;
    };

    /**
     * Where everything is for a form: the pieces of the field, the joints and
     * the eyes. Each piece moves from its place inside the mound (form 0) to a
     * person's (form 1).
     */
    function layout(r) {
        const S = r.size, f = r.form;
        // Places move with the form; the person's limbs thin out of the mound a little ahead of it.
        const e = f, thin = Math.pow(f, 0.8);
        const P = (a, b) => mul(lerp3(a, b, e), S);
        const R = (a, b) => lerp(a, b, thin) * S;
        const R3 = (a, b) => mul(lerp3(a, b, thin), S);
        const lay = {
            S, f,
            puddle: { c: P([0, 0.024, 0], [0, 0.02, 0.02]), r: R3([0.47, 0.05, 0.44], [0.42, 0.048, 0.38]) },
            mound: { c: P([0, 0.3, 0], [0, 0.05, 0.02]), r: R3([0.41, 0.31, 0.38], [0.27, 0.1, 0.25]) },
            hips: { c: P([0, 0.2, 0], [0, 0.78, 0]), r: R3([0.35, 0.18, 0.32], [0.18, 0.13, 0.13]) },
            waist: { a: P([0, 0.22, 0], [0, 0.86, 0.004]), b: P([0, 0.32, 0], [0, 0.98, 0.008]), ra: R(0.3, 0.15), rb: R(0.3, 0.155) },
            chest: { c: P([0, 0.32, 0.01], [0, 1.06, 0.006]), r: R3([0.32, 0.24, 0.3], [0.19, 0.17, 0.13]) },
            neck: { a: P([0, 0.36, 0.01], [0, 1.17, -0.004]), b: P([0, 0.44, 0.02], [0, 1.27, 0.004]), ra: R(0.25, 0.078), rb: R(0.24, 0.072) },
            head: { c: P([0, 0.445, 0.03], [0, 1.38, 0.012]), r: R3([0.265, 0.245, 0.255], [0.136, 0.152, 0.136]) },
            // Legs apart down to the knees, the shins melting together into the puddle.
            legs: [1, -1].map(s => ({ side: s, a: P([s * 0.1, 0.2, 0], [s * 0.108, 0.74, 0]), kn: P([s * 0.11, 0.13, 0.005], [s * 0.092, 0.42, 0.012]), b: P([s * 0.12, 0.06, 0.01], [s * 0.06, 0.07, 0.02]),
                ra: R(0.17, 0.088), rk: R(0.17, 0.074), rb: R(0.17, 0.13) })),
            arms: [1, -1].map(s => ({
                side: s, s: P([s * 0.22, 0.34, 0], [s * 0.185, 1.15, -0.01]), e: P([s * 0.27, 0.26, 0], [s * 0.275, 0.92, -0.022]), h: P([s * 0.285, 0.2, 0.01], [s * 0.305, 0.71, 0.018]),
                rs: R(0.085, 0.064), re: R(0.075, 0.055), rh: R(0.065, 0.05),
                // A hand that runs down into a drip, not a mitten.
                hand: { c: P([s * 0.29, 0.19, 0.01], [s * 0.31, 0.68, 0.024]), r: R3([0.06, 0.06, 0.055], [0.044, 0.05, 0.036]) },
                tip: P([s * 0.29, 0.16, 0.01], [s * 0.316, 0.585, 0.03]), rt: R(0.05, 0.018),
                // The goo sags under the elbow.
                sag: { c: P([s * 0.27, 0.24, 0], [s * 0.272, 0.885, -0.032]), r: mul([0.034, 0.046, 0.036], S * smooth(0.45, 1, f)) }
            })),
            // A person's goo sags at the chin and the belly, and the face shows faintly: a brow, the bump of a nose.
            chin: { c: P([0, 0.38, 0.12], [0, 1.255, 0.075]), r: mul([0.06, 0.045, 0.05], S * smooth(0.45, 1, f)) },
            belly: { c: P([0, 0.24, 0.1], [0, 0.88, 0.055]), r: mul([0.15, 0.1, 0.1], S * smooth(0.45, 1, f)) },
            brow: { c: P([0, 0.5, 0.25], [0, 1.415, 0.118]), r: mul([0.088, 0.02, 0.03], S * smooth(0.6, 1, f)) },
            nose: { c: P([0, 0.42, 0.27], [0, 1.36, 0.14]), r: mul([0.016, 0.024, 0.02], S * smooth(0.6, 1, f)) },
            // The blend: a slime's wide and soft, a person's tighter so the limbs stay limbs.
            k: { base: lerp(0.18, 0.1, f) * S, legs: lerp(0.12, 0.1, f) * S, body: lerp(0.12, 0.05, f) * S, head: lerp(0.1, 0.045, f) * S, arms: lerp(0.08, 0.03, f) * S, hand: 0.02 * S }
        };
        lay.cell = 0.021 * S;
        return lay;
    }

    /** A soft unevenness, so the goo is never a perfect machined shape; a person's lumpier. */
    function wobble(p, S, f) {
        const x = Math.abs(p[0]) / S, y = p[1] / S, z = p[2] / S;
        const soft = Math.sin(x * 11.3 + y * 4.1 + 1.3) * Math.sin(y * 9.7 - z * 6.2 + 0.4) + 0.6 * Math.sin(z * 13.1 + x * 7.3 - y * 3.9 + 2.1);
        const lumps = f > 0.3 ? Math.sin(x * 23.7 - y * 6.3 + 0.7) * Math.sin(y * 21.1 + z * 8.9 - 1.2) * Math.sin(z * 19.3 - x * 5.1 + 2.6) : 0;
        return (soft * 0.0035 + lumps * 0.0055 * smooth(0.3, 1, f)) * S;
    }

    /** The body's field in parts: the trunk (puddle to head), each leg, each arm; and all of it blended. */
    function fieldOf(lay) {
        const { puddle, mound, hips, waist, chest, neck, head, legs, arms, chin, belly, brow, nose, k } = lay;
        const S = lay.S, f = lay.f;
        // A sphere round each piece: a point farther from it than the blend reaches cannot change the field.
        const sphere = pts => {
            const c = pts.reduce((a, q) => add(a, q[0]), [0, 0, 0]).map(x => x / pts.length);
            return { c, r: Math.max(...pts.map(([q, rad]) => len(sub(q, c)) + rad)) };
        };
        const far = (b, p, d, kk) => {
            const x = p[0] - b.c[0], y = p[1] - b.c[1], z = p[2] - b.c[2], m = d + kk + b.r;
            return m < 0 || x * x + y * y + z * z > m * m;
        };
        const some = r => r[0] > 1e-4;
        const legB = sphere(legs.flatMap(g => [[g.a, g.ra], [g.kn, g.rk], [g.b, g.rb]]));
        const upperB = sphere([[waist.a, waist.ra], [waist.b, waist.rb], [chest.c, Math.max(...chest.r)], [neck.a, neck.ra], [neck.b, neck.rb], [head.c, Math.max(...head.r)], [chin.c, chin.r[1] + 1e-4], [belly.c, belly.r[0] + 1e-4]]);
        const hipsB = { c: hips.c, r: Math.max(...hips.r) };
        const armB = arms.map(a => sphere([[a.s, a.rs], [a.e, a.re], [a.h, a.rh], [a.hand.c, Math.max(...a.hand.r)], [a.tip, a.rt], [a.sag.c, a.sag.r[1] + 1e-4]]));
        // Thighs apart; the shins melting into one another the lower they reach.
        const legsOf = p => {
            const thighs = smin(capsule(p, legs[0].a, legs[0].kn, legs[0].ra, legs[0].rk), capsule(p, legs[1].a, legs[1].kn, legs[1].ra, legs[1].rk), 0.012 * S);
            const kk = lerp(0.015, 0.11, smooth(legs[0].kn[1], legs[0].b[1], p[1])) * S;
            const shins = smin(capsule(p, legs[0].kn, legs[0].b, legs[0].rk, legs[0].rb), capsule(p, legs[1].kn, legs[1].b, legs[1].rk, legs[1].rb), kk);
            return smin(thighs, shins, 0.03 * S);
        };
        const legOf = (g, p) => smin(capsule(p, g.a, g.kn, g.ra, g.rk), capsule(p, g.kn, g.b, g.rk, g.rb), 0.03 * S);
        const armOf = (a, p) => {
            let d = smin(capsule(p, a.s, a.e, a.rs, a.re), capsule(p, a.e, a.h, a.re, a.rh), 0.015 * S);
            if (some(a.sag.r)) d = smin(d, ellipsoid(p, a.sag.c, a.sag.r), 0.03 * S);
            d = smin(d, ellipsoid(p, a.hand.c, a.hand.r), k.hand);
            return smin(d, capsule(p, a.hand.c, a.tip, Math.min(a.hand.r[0], a.hand.r[2]), a.rt), 0.02 * S);
        };
        const upper = (p, d) => {
            d = smin(d, capsule(p, waist.a, waist.b, waist.ra, waist.rb), k.body);
            if (some(belly.r)) d = smin(d, ellipsoid(p, belly.c, belly.r), 0.06 * S);
            d = smin(d, ellipsoid(p, chest.c, chest.r), k.body);
            d = smin(d, capsule(p, neck.a, neck.b, neck.ra, neck.rb), k.head);
            d = smin(d, ellipsoid(p, head.c, head.r), k.head);
            if (some(chin.r)) d = smin(d, ellipsoid(p, chin.c, chin.r), 0.035 * S);
            if (some(brow.r)) d = smin(d, ellipsoid(p, brow.c, brow.r), 0.02 * S);
            if (some(nose.r)) d = smin(d, ellipsoid(p, nose.c, nose.r), 0.014 * S);
            return d;
        };
        // The puddle's rim wanders in and out round it, as spilled goo does.
        const lobes = p => {
            const plain = ellipsoid(p, puddle.c, puddle.r);
            if (plain > 0.07 * S || plain < -0.03 * S) return plain;
            const x = p[0] - puddle.c[0], z = p[2] - puddle.c[2], a = Math.atan2(z, Math.abs(x));
            const w = 1 + 0.05 * Math.sin(3 * a + 1.1) + 0.035 * Math.sin(5 * a - 0.4) + 0.02 * Math.sin(8 * a + 2.3);
            return ellipsoid([puddle.c[0] + x / w, p[1], puddle.c[2] + z / w], puddle.c, puddle.r) * Math.min(1, w);
        };
        const base = p => smin(lobes(p), ellipsoid(p, mound.c, mound.r), k.base);
        const all = p => {
            let d = base(p);
            if (!far(legB, p, d, k.legs)) d = smin(d, legsOf(p), k.legs);
            if (!far(hipsB, p, d, k.body)) d = smin(d, ellipsoid(p, hips.c, hips.r), k.body);
            if (!far(upperB, p, d, Math.max(k.body, k.head, 0.06 * S))) d = upper(p, d);
            for (let s = 0; s < 2; s++) if (!far(armB[s], p, d, Math.max(k.arms, 0.03 * S))) d = smin(d, armOf(arms[s], p), k.arms);
            // A soft unevenness near the surface; flat on the floor.
            if (Math.abs(d) < 0.03 * S) d += wobble(p, S, f);
            return Math.max(d, -p[1]);
        };
        // The groups the skin weights answer to: the trunk alone, each leg, each arm.
        const groups = p => {
            let d = smin(base(p), ellipsoid(p, hips.c, hips.r), k.body);
            d = upper(p, d);
            return [d, legOf(legs[0], p), legOf(legs[1], p), armOf(arms[0], p), armOf(arms[1], p)];
        };
        return { all, groups };
    }

    // ── meshing ────────────────────────────────────────────────────────────
    /**
     * Surface nets over a narrow band: the field sampled in blocks of 4³,
     * blocks far from every level skipped; one mesh per level in `isos`.
     */
    function surfaceNets(field, lo, hi, cell, isos) {
        const BS = 4;
        const X = Math.ceil((hi[0] - lo[0]) / cell / BS) * BS + 1, Y = Math.ceil((hi[1] - lo[1]) / cell / BS) * BS + 1, Z = Math.ceil((hi[2] - lo[2]) / cell / BS) * BS + 1;
        const BX = Math.ceil(X / BS), BY = Math.ceil(Y / BS), BZ = Math.ceil(Z / BS);
        const blockValue = new Float32Array(BX * BY * BZ), blockAt = new Int32Array(BX * BY * BZ).fill(-1);
        const pool = [], near = [];
        const half = (BS - 1) / 2 * cell * Math.sqrt(3);
        const isoLo = Math.min(...isos), isoHi = Math.max(...isos);
        const p = [0, 0, 0];
        for (let bk = 0; bk < BZ; bk++) for (let bj = 0; bj < BY; bj++) for (let bi = 0; bi < BX; bi++) {
            const b = (bk * BY + bj) * BX + bi;
            const x0 = lo[0] + bi * BS * cell, y0 = lo[1] + bj * BS * cell, z0 = lo[2] + bk * BS * cell;
            p[0] = x0 + 1.5 * cell; p[1] = y0 + 1.5 * cell; p[2] = z0 + 1.5 * cell;
            const d0 = field(p), reach = half * 1.25 + cell;
            if (d0 - isoHi > reach || isoLo - d0 > reach) { blockValue[b] = d0; continue; }
            const vals = new Float32Array(BS * BS * BS);
            for (let k = 0; k < BS; k++) for (let j = 0; j < BS; j++) for (let i = 0; i < BS; i++) {
                p[0] = x0 + i * cell; p[1] = y0 + j * cell; p[2] = z0 + k * cell;
                vals[(k * BS + j) * BS + i] = field(p);
            }
            blockAt[b] = pool.length;
            pool.push(vals);
            near.push(b);
        }
        const val = (i, j, k) => {
            const b = ((k >> 2) * BY + (j >> 2)) * BX + (i >> 2), at = blockAt[b];
            return at < 0 ? blockValue[b] : pool[at][((k & 3) * BS + (j & 3)) * BS + (i & 3)];
        };
        const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
        const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
        const v = new Float64Array(8);
        return isos.map(iso => {
            const cubeVertex = new Map(), verts = [], index = [];
            const vertexOf = (i, j, k) => {
                const key = (k * Y + j) * X + i;
                const known = cubeVertex.get(key);
                if (known !== undefined) return known;
                for (let c = 0; c < 8; c++) v[c] = val(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2)) - iso;
                let sx = 0, sy = 0, sz = 0, n = 0;
                for (const [a, b] of edges) {
                    if ((v[a] < 0) === (v[b] < 0)) continue;
                    const t = v[a] / (v[a] - v[b]), pa = corners[a], pb = corners[b];
                    sx += pa[0] + (pb[0] - pa[0]) * t; sy += pa[1] + (pb[1] - pa[1]) * t; sz += pa[2] + (pb[2] - pa[2]) * t; n++;
                }
                if (!n) { sx = sy = sz = 0.5; n = 1; }
                verts.push(lo[0] + (i + sx / n) * cell, lo[1] + (j + sy / n) * cell, lo[2] + (k + sz / n) * cell);
                const id = verts.length / 3 - 1;
                cubeVertex.set(key, id);
                return id;
            };
            const quad = (a, b, c, d, flip) => {
                const ac = Math.hypot(verts[a * 3] - verts[c * 3], verts[a * 3 + 1] - verts[c * 3 + 1], verts[a * 3 + 2] - verts[c * 3 + 2]);
                const bd = Math.hypot(verts[b * 3] - verts[d * 3], verts[b * 3 + 1] - verts[d * 3 + 1], verts[b * 3 + 2] - verts[d * 3 + 2]);
                const t = ac < bd ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
                if (flip) for (let q = 0; q < 6; q += 3) { const x = t[q + 1]; t[q + 1] = t[q + 2]; t[q + 2] = x; }
                for (let q = 0; q < 6; q++) index.push(t[q]);
            };
            for (const b of near) {
                const bi = b % BX, bj = Math.floor(b / BX) % BY, bk = Math.floor(b / (BX * BY));
                for (let k = bk * BS; k < bk * BS + BS; k++) for (let j = bj * BS; j < bj * BS + BS; j++) for (let i = bi * BS; i < bi * BS + BS; i++) {
                    if (i < 1 || j < 1 || k < 1 || i >= X - 1 || j >= Y - 1 || k >= Z - 1) continue;
                    const inside = val(i, j, k) < iso;
                    if ((val(i + 1, j, k) < iso) !== inside) quad(vertexOf(i, j - 1, k - 1), vertexOf(i, j, k - 1), vertexOf(i, j, k), vertexOf(i, j - 1, k), !inside);
                    if ((val(i, j + 1, k) < iso) !== inside) quad(vertexOf(i - 1, j, k - 1), vertexOf(i - 1, j, k), vertexOf(i, j, k), vertexOf(i, j, k - 1), !inside);
                    if ((val(i, j, k + 1) < iso) !== inside) quad(vertexOf(i - 1, j - 1, k), vertexOf(i, j - 1, k), vertexOf(i, j, k), vertexOf(i - 1, j, k), !inside);
                }
            }
            return { positions: new Float32Array(verts), index };
        });
    }

    /** Taubin smoothing, the floor kept flat. */
    function relax(positions, index, passes) {
        const n = positions.length / 3;
        const count = new Int32Array(n + 1);
        for (let t = 0; t < index.length; t++) count[index[t] + 1] += 2;
        for (let i = 0; i < n; i++) count[i + 1] += count[i];
        const fill = count.slice(0, n), list = new Int32Array(count[n]);
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t], b = index[t + 1], c = index[t + 2];
            list[fill[a]++] = b; list[fill[a]++] = c; list[fill[b]++] = a; list[fill[b]++] = c; list[fill[c]++] = a; list[fill[c]++] = b;
        }
        let p = Float32Array.from(positions);
        const step = (src, f) => {
            const q = new Float32Array(src.length);
            for (let i = 0; i < n; i++) {
                let x = 0, y = 0, z = 0;
                const s0 = count[i], s1 = count[i + 1], c = (s1 - s0) || 1;
                for (let s = s0; s < s1; s++) { const u = list[s]; x += src[u * 3]; y += src[u * 3 + 1]; z += src[u * 3 + 2]; }
                q[i * 3] = src[i * 3] + (x / c - src[i * 3]) * f;
                q[i * 3 + 1] = src[i * 3 + 1] < 1e-4 ? src[i * 3 + 1] : src[i * 3 + 1] + (y / c - src[i * 3 + 1]) * f;
                q[i * 3 + 2] = src[i * 3 + 2] + (z / c - src[i * 3 + 2]) * f;
            }
            return q;
        };
        for (let pass = 0; pass < passes; pass++) p = step(step(p, 0.5), -0.53);
        return p;
    }

    function gradient(field, p, h) {
        const q = [p[0] + h, p[1], p[2]];
        const dx1 = field(q); q[0] = p[0] - h; const dx0 = field(q); q[0] = p[0];
        q[1] = p[1] + h; const dy1 = field(q); q[1] = p[1] - h; const dy0 = field(q); q[1] = p[1];
        q[2] = p[2] + h; const dz1 = field(q); q[2] = p[2] - h; const dz0 = field(q);
        return [(dx1 - dx0) / (2 * h), (dy1 - dy0) / (2 * h), (dz1 - dz0) / (2 * h)];
    }

    /** Each vertex moved onto the level along the field's gradient (two steps); its normal the gradient's direction. */
    function project(field, positions, iso, cell, steps = 2) {
        const n = positions.length / 3, normals = new Float32Array(positions.length), h = cell * 0.3;
        const p = [0, 0, 0], q = [0, 0, 0];
        for (let v = 0; v < n; v++) {
            p[0] = positions[v * 3]; p[1] = positions[v * 3 + 1]; p[2] = positions[v * 3 + 2];
            let gx = 0, gy = 1, gz = 0;
            for (let it = 0; it < steps; it++) {
                const d = field(p);
                q[0] = p[0] + h; q[1] = p[1]; q[2] = p[2]; gx = (field(q) - d) / h;
                q[0] = p[0]; q[1] = p[1] + h; gy = (field(q) - d) / h;
                q[1] = p[1]; q[2] = p[2] + h; gz = (field(q) - d) / h;
                const g2 = gx * gx + gy * gy + gz * gz;
                if (g2 < 1e-10) break;
                const s = clamp((d - iso) / g2, -cell, cell);
                p[0] -= gx * s; p[1] -= gy * s; p[2] -= gz * s;
            }
            positions[v * 3] = p[0]; positions[v * 3 + 1] = Math.max(0, p[1]); positions[v * 3 + 2] = p[2];
            const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
            normals[v * 3] = gx / l; normals[v * 3 + 1] = gy / l; normals[v * 3 + 2] = gz / l;
        }
        return normals;
    }

    /** A level of the field as a mesh: smoothed, laid on the level, its floor (never seen) left out. */
    function levelMesh(field, net, iso, cell, target, steps) {
        let positions = relax(net.positions, net.index, 2);
        let index = net.index;
        if (target && Decimator && index.length / 3 > target * 1.1) {
            const d = Decimator.decimate({ positions, indices: Uint32Array.from(index) }, target, { boundaryWeight: 100 });
            positions = Float32Array.from(d.positions); index = Array.from(d.indices);
        }
        const normals = project(field, positions, iso, cell, steps);
        const keep = [];
        const floor = cell * 0.35;
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t], b = index[t + 1], c = index[t + 2];
            if (positions[a * 3 + 1] < floor && positions[b * 3 + 1] < floor && positions[c * 3 + 1] < floor) continue;
            keep.push(a, b, c);
        }
        return { positions, normals, index: keep };
    }

    // ── skin ───────────────────────────────────────────────────────────────
    const BONE_NAMES = ['Root', 'Base', 'Body', 'LeftLeg', 'RightLeg', 'Chest', 'Head', 'LeftEye', 'RightEye', 'Mouth', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];

    /** The skeleton for a layout: joints where the pieces meet; the eyes' and feelers' from what was placed. */
    function bonesOf(lay, eyes, feelers, mouth) {
        const { S, hips, chest, neck, legs, arms } = lay;
        const at = {
            Root: [0, 0, 0], Base: [0, 0, 0], Body: [0, hips.c[1], 0], Chest: [0, chest.c[1], 0], Head: [0, neck.b[1] - 0.02 * S, neck.b[2]],
            LeftLeg: legs[0].a, RightLeg: legs[1].a, LeftEye: eyes[0].center, RightEye: eyes[1].center, Mouth: mouth.center,
            LeftArm: arms[0].s, LeftForeArm: arms[0].e, LeftHand: arms[0].h, RightArm: arms[1].s, RightForeArm: arms[1].e, RightHand: arms[1].h
        };
        const parent = { Root: -1, Base: 'Root', Body: 'Base', LeftLeg: 'Body', RightLeg: 'Body', Chest: 'Body', Head: 'Chest', LeftEye: 'Head', RightEye: 'Head', Mouth: 'Head',
            LeftArm: 'Chest', LeftForeArm: 'LeftArm', LeftHand: 'LeftForeArm', RightArm: 'Chest', RightForeArm: 'RightArm', RightHand: 'RightForeArm' };
        const bones = BONE_NAMES.map(name => ({ name, parent: parent[name] === -1 ? -1 : BONE_NAMES.indexOf(parent[name]), head: at[name].slice() }));
        for (const fl of feelers) {
            const base = bones.length;
            bones.push({ name: fl.name, parent: BONE_NAMES.indexOf('Head'), head: fl.points[fl.joint].slice() });
            bones.push({ name: fl.name + 'Tip', parent: base, head: fl.points[fl.tipJoint].slice() });
        }
        for (const b of bones) {
            const child = bones.find(c => c.parent === bones.indexOf(b));
            b.tail = child && len(sub(child.head, b.head)) > 1e-4 ? child.head.slice() : add(b.head, [0, 0.05 * S, 0]);
        }
        return bones;
    }

    /** Weights for a point: the trunk by height up its chain, the legs and arms along their bones. */
    function weigher(lay, F, bones) {
        const idx = name => bones.findIndex(b => b.name === name);
        const B = { base: idx('Base'), body: idx('Body'), chest: idx('Chest'), head: idx('Head'), leg: [idx('LeftLeg'), idx('RightLeg')], arm: [[idx('LeftArm'), idx('LeftForeArm'), idx('LeftHand')], [idx('RightArm'), idx('RightForeArm'), idx('RightHand')]] };
        const yBody = bones[B.body].head[1], yChest = bones[B.chest].head[1], yHead = bones[B.head].head[1];
        const S = lay.S, w = 0.022 * S;
        const chain = [[B.base, lay.f > 0.5 ? 0.02 * S : 0.04 * S], [B.body, yBody], [B.chest, yChest], [B.head, yHead]];
        return p => {
            const byBone = new Map();
            const put = (b, x) => { if (x > 1e-4) byBone.set(b, (byBone.get(b) || 0) + x); };
            const g = F.groups(p);
            const dmin = Math.min(...g);
            const share = g.map(d => Math.exp(-(d - dmin) / w));
            const total = share.reduce((a, b) => a + b, 0);
            // The trunk, by height between the joints of its chain.
            const trunk = share[0] / total;
            const y = p[1];
            if (y <= chain[0][1]) put(chain[0][0], trunk);
            else if (y >= chain[3][1]) put(chain[3][0], trunk);
            else for (let k = 0; k < 3; k++) {
                const [b0, y0] = chain[k], [b1, y1] = chain[k + 1];
                if (y >= y0 && y <= y1) { const t = smooth(0, 1, (y - y0) / ((y1 - y0) || 1)); put(b0, trunk * (1 - t)); put(b1, trunk * t); break; }
            }
            // Each leg along its length, the foot of it the base's (it melts into the puddle).
            for (let s = 0; s < 2; s++) {
                const L = lay.legs[s], part = share[1 + s] / total, t = clamp((y - L.b[1]) / ((L.a[1] - L.b[1]) || 1), 0, 1), up = smooth(0.1, 0.45, t);
                put(B.leg[s], part * up); put(B.base, part * (1 - up));
            }
            // Each arm by where it lies along shoulder, elbow and hand.
            for (let s = 0; s < 2; s++) {
                const A = lay.arms[s], part = share[3 + s] / total;
                if (part < 1e-4) continue;
                const along = (a, b) => clamp(dot(sub(p, a), sub(b, a)) / (dot(sub(b, a), sub(b, a)) || 1), 0, 1);
                const du = len(sub(p, add(A.s, mul(sub(A.e, A.s), along(A.s, A.e))))), dl = len(sub(p, add(A.e, mul(sub(A.h, A.e), along(A.e, A.h)))));
                const lower = smooth(-0.015 * S, 0.015 * S, du - dl);
                const hand = lower * smooth(0.6, 0.95, along(A.e, A.h));
                put(B.arm[s][0], part * (1 - lower)); put(B.arm[s][1], part * (lower - hand)); put(B.arm[s][2], part * hand);
            }
            const top = [...byBone.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
            const sum = top.reduce((a, [, x]) => a + x, 0) || 1;
            const joints = [0, 0, 0, 0], weights = [0, 0, 0, 0];
            top.forEach(([b, x], k) => { joints[k] = b; weights[k] = x / sum; });
            if (!top.length) { joints[0] = B.base; weights[0] = 1; }
            return { joints, weights };
        };
    }

    // ── eyes ───────────────────────────────────────────────────────────────
    /** Where the eyes sit: on the front of the head, each pressed a little into the goo. */
    function placeEyes(lay, field, r) {
        const { S, head, f } = lay;
        const radius = lerp(0.088, 0.043, Math.pow(f, 0.7)) * S * r.eyes.size;
        const spread = lerp(0.4, 0.42, f), lift = lerp(0.12, 0.08, f);
        return [1, -1].map(side => {
            const dir = norm([side * spread, lift, 1]);
            // From inside the head outward to the surface.
            let t0 = 0, t1 = Math.max(head.r[0], head.r[1], head.r[2]) * 2.5;
            const at = t => add(head.c, mul(dir, t));
            if (field(at(t0)) > 0) t0 = 0;
            for (let it = 0; it < 30; it++) { const m = (t0 + t1) / 2; if (field(at(m)) < 0) t0 = m; else t1 = m; }
            const surface = at(t0);
            const n = norm(gradient(field, surface, 0.004 * S));
            const facing = norm(add(mul(n, 0.45), mul([side * 0.12, 0.02, 1], 0.55)));
            return { side, radius, center: sub(surface, mul(n, radius * 0.64)), facing, surface };
        });
    }

    /** An eyeball as a sphere whose rings crowd toward the front, so the iris and pupil come out round; colored per vertex. */
    function eyeMesh(eye, r, bone, quality) {
        const rows = quality === 'save' ? 24 : quality === 'draft' ? 14 : 20, cols = quality === 'save' ? 30 : quality === 'draft' ? 18 : 26;
        const f = eye.facing;
        let up = norm(sub([0, 1, 0], mul(f, f[1])));
        const right = norm(cross(up, f));
        const iris = linearOf(r.eyes.color), sclera = linearOf('#f3f5f7'), pupil = [0.003, 0.003, 0.004], white = [1, 1, 1];
        const irisA = 0.8, pupilA = 0.42;
        // The catchlight: up and to the character's right of center, as from a key light over the shoulder.
        const glint = norm(add(f, add(mul(up, 0.42), mul(right, -0.34))));
        const glint2 = norm(add(f, add(mul(up, -0.25), mul(right, 0.3))));
        const positions = [], normals = [], colors = [], index = [];
        for (let i = 0; i <= rows; i++) {
            const th = Math.PI * Math.pow(i / rows, 1.55);
            for (let j = 0; j < cols; j++) {
                const ph = j / cols * TAU;
                const d = add(mul(f, Math.cos(th)), add(mul(right, Math.sin(th) * Math.cos(ph)), mul(up, Math.sin(th) * Math.sin(ph))));
                positions.push(...add(eye.center, mul(d, eye.radius)));
                normals.push(...d);
                let c;
                if (th < pupilA) c = pupil;
                else if (th < irisA) {
                    const t = (th - pupilA) / (irisA - pupilA);
                    // Lighter toward the pupil, a dark ring at the rim, faint streaks round it.
                    const streak = 0.9 + 0.1 * Math.sin(ph * 23 + t * 3);
                    c = mixRgb(mixRgb(iris, white, 0.28 * (1 - t)), mul(iris, 0.35), smooth(0.7, 1, t)).map(x => x * streak);
                } else c = mixRgb(sclera, mul(sclera, 0.82), smooth(irisA, Math.PI, th));
                if (Math.acos(clamp(dot(d, glint), -1, 1)) < 0.13) c = white;
                else if (Math.acos(clamp(dot(d, glint2), -1, 1)) < 0.06) c = mixRgb(c, white, 0.8);
                colors.push(...c);
            }
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const a = i * cols + j, b = i * cols + (j + 1) % cols, c = (i + 1) * cols + j, d = (i + 1) * cols + (j + 1) % cols;
            if (i > 0) index.push(a, b, c);
            index.push(b, d, c);
        }
        const n = positions.length / 3;
        const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) { joints[v * 4] = bone; weights[v * 4] = 1; }
        return { positions, normals, colors, index: orient(positions, normals, index), joints, weights };
    }

    /**
     * Where a goo person's mouth sits: below the eyes on the front of the
     * head, just under the goo. A blob has none (`show` false); the bone is
     * there either way.
     */
    function placeMouth(lay, field) {
        const { S, head, f } = lay;
        const m = smooth(0.45, 0.8, f);
        const dir = norm([0, -0.56, 1]);
        let t0 = 0, t1 = Math.max(...head.r) * 2.5;
        const at = t => add(head.c, mul(dir, t));
        for (let it = 0; it < 30; it++) { const q = (t0 + t1) / 2; if (field(at(q)) < 0) t0 = q; else t1 = q; }
        const surface = at(t0), n = norm(gradient(field, surface, 0.004 * S));
        const facing = norm(add(mul(n, 0.6), [0, 0, 0.4]));
        const right = norm(cross([0, 1, 0], facing)), up = cross(facing, right);
        const w = 0.032 * S * m, h = 0.0042 * S * Math.max(m, 0.3), d = 0.012 * S;
        return { show: m > 0.05, m, center: sub(surface, mul(n, d * 0.9)), facing, right, up, w, h, d };
    }

    /** The mouth: a soft dark lens, nearly shut (a line with a little smile); Talk opens it by its bone's scale. */
    function mouthMesh(M, r, bone) {
        const rows = 8, cols = 24;
        const inner = mixRgb(mul(linearOf(r.core), 0.06), [0.05, 0.008, 0.014], 0.6), lip = mul(linearOf(r.color), 0.35);
        const positions = [], normals = [], colors = [], index = [];
        for (let i = 0; i <= rows; i++) {
            const th = Math.PI * i / rows;
            for (let j = 0; j < cols; j++) {
                const ph = j / cols * TAU, d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
                // The corners turn up a little.
                const smile = 0.9 * M.h * d[0] * d[0];
                positions.push(...add(M.center, add(add(mul(M.right, d[0] * M.w), mul(M.up, d[1] * M.h + smile)), mul(M.facing, d[2] * M.d))));
                normals.push(...norm(add(add(mul(M.right, d[0] / M.w), mul(M.up, d[1] / M.h)), mul(M.facing, d[2] / M.d))));
                colors.push(...mixRgb(inner, lip, smooth(0.86, 1, Math.hypot(d[0], d[1])) * 0.6));
            }
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const a = i * cols + j, b = i * cols + (j + 1) % cols, c = (i + 1) * cols + j, d = (i + 1) * cols + (j + 1) % cols;
            if (i > 0) index.push(a, c, b);
            if (i < rows - 1) index.push(b, c, d);
        }
        const n = positions.length / 3, joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        for (let v = 0; v < n; v++) { joints[v * 4] = bone; weights[v * 4] = 1; }
        return { positions, normals, colors, index: orient(positions, normals, index), joints, weights };
    }

    /** Turns every triangle to face the way its vertices' normals do. */
    function orient(positions, normals, index) {
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
            const u = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
            const v = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
            const n = cross(u, v), m = [normals[a] + normals[b] + normals[c], normals[a + 1] + normals[b + 1] + normals[c + 1], normals[a + 2] + normals[b + 2] + normals[c + 2]];
            if (dot(n, m) < 0) { const x = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = x; }
        }
        return index;
    }

    // ── tubes: feelers and drips ───────────────────────────────────────────
    /** The feelers on the head for an option: their points (root buried in the goo) and radii. */
    function feelersOf(lay, field, r) {
        const { S, head, f } = lay;
        if (r.feelers === 'none') return [];
        const top = (x, z) => {
            // The goo's top at (x, z) over the head: down from above until inside.
            let y0 = head.c[1], y1 = head.c[1] + head.r[1] * 2;
            for (let it = 0; it < 30; it++) { const m = (y0 + y1) / 2; if (field([x, m, z]) < 0) y0 = m; else y1 = m; }
            return [x, y0, z];
        };
        const list = [];
        const make = (name, base, dir, length, r0, r1, curl, bulb) => {
            const pts = [];
            for (let k = 0; k <= 12; k++) {
                const t = k / 12;
                // Up and out, the tip drooping as it curls.
                pts.push(add(add(base, mul(dir, -0.02 * S)), add(mul(dir, t * length), mul([0, -1, 0], curl * t * t * length * 0.6))));
            }
            list.push({ name, points: pts, radius: t => lerp(r0, r1, t), bulb, joint: 2, tipJoint: 7 });
        };
        const R = Math.max(head.r[0], head.r[2]);
        if (r.feelers === 'antennae') {
            for (const s of [1, -1]) {
                const base = top(s * R * 0.32, head.c[2] + R * 0.05);
                make(s > 0 ? 'LeftFeeler' : 'RightFeeler', base, norm([s * 0.38, 1, 0.22]), lerp(0.2, 0.13, f) * S, 0.016 * S, 0.008 * S, 0.5, 0.024 * S);
            }
        } else {
            const count = 5;
            for (let k = 0; k < count; k++) {
                const a = (k / (count - 1) - 0.5) * 1.9;
                const base = top(Math.sin(a) * R * 0.45, head.c[2] - Math.cos(a) * R * 0.12);
                make('Feeler' + (k + 1), base, norm([Math.sin(a) * 0.7, 1, -0.15 - 0.25 * Math.cos(a)]), lerp(0.16, 0.11, f) * S * (0.85 + 0.3 * ((k * 7) % 3) / 2), 0.013 * S, 0.004 * S, 1.2, 0);
            }
        }
        return list;
    }

    /**
     * Drops hanging off a goo person, longer the more of a person it is: two
     * from each hand's tip, one under each elbow's sag, one under the chin.
     * Each rides on the bone of what it hangs from.
     */
    function dripsOf(lay) {
        const { S, f } = lay;
        if (f < 0.35) return [];
        const k = smooth(0.35, 1, f), out = [];
        const drip = (name, top, length, width, bone, lean) => {
            const pts = [];
            for (let q = 0; q <= 8; q++) { const t = q / 8; pts.push(add(top, [lean * 0.006 * S * t, -length * t, 0.002 * S * t])); }
            // Thin at the neck, a drop swelling at the end.
            out.push({ name, points: pts, radius: t => width * S * k * (1 - 0.5 * Math.sin(t * Math.PI * 0.85)), bulb: width * 1.35 * S * k, bone });
        };
        lay.arms.forEach((A, i) => {
            const side = A.side > 0 ? 'Left' : 'Right';
            drip(side + 'Drip', add(A.tip, [0, A.rt * 0.3, 0]), (0.075 + 0.03 * i) * S * k, 0.011, side + 'Hand', A.side);
            drip(side + 'Drip2', add(A.hand.c, [-A.side * A.hand.r[0] * 0.55, -A.hand.r[1] * 0.6, 0.006 * S]), (0.04 + 0.015 * (1 - i)) * S * k, 0.008, side + 'Hand', -A.side);
            if (A.sag.r[1] > 0.005 * S) drip(side + 'ElbowDrip', add(A.sag.c, [0, -A.sag.r[1] * 0.7, 0]), (0.03 + 0.02 * i) * S * k, 0.008, side + 'ForeArm', A.side);
        });
        if (lay.chin.r[1] > 0.005 * S) drip('ChinDrip', add(lay.chin.c, [0.012 * S, -lay.chin.r[1] * 0.7, 0.01 * S]), 0.045 * S * k, 0.009, 'Head', 1);
        return out;
    }

    /** A tube along points, with a rounded tip (a bulb when asked); vertices skinned by `skinAt(t)`. */
    function tubeMesh(tube, sides, skinAt) {
        const pts = tube.points, n = pts.length;
        const positions = [], normals = [], ts = [], index = [], jw = [];
        let prevX = null;
        const ring = (c, d, x, rad, t) => {
            const y = cross(d, x);
            const start = positions.length / 3;
            for (let k = 0; k < sides; k++) {
                const a = k / sides * TAU, o = add(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
                positions.push(...add(c, mul(o, rad))); normals.push(...o); ts.push(t); jw.push(skinAt(t));
            }
            return start;
        };
        const rows = [];
        for (let i = 0; i < n; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], d = norm(sub(b, a));
            const x = prevX ? norm(sub(prevX, mul(d, dot(prevX, d)))) : norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
            prevX = x;
            rows.push(ring(pts[i], d, x, tube.radius(i / (n - 1)), i / (n - 1)));
        }
        for (let r = 0; r + 1 < rows.length; r++) for (let k = 0; k < sides; k++) {
            const a = rows[r] + k, b = rows[r] + (k + 1) % sides, c = rows[r + 1] + k, d = rows[r + 1] + (k + 1) % sides;
            index.push(a, c, b, b, c, d);
        }
        // The tip: a bulb or a rounded end.
        const end = pts[n - 1], dEnd = norm(sub(pts[n - 1], pts[n - 2]));
        const rad = Math.max(tube.bulb || 0, tube.radius(1));
        const center = tube.bulb ? add(end, mul(dEnd, rad * 0.6)) : end;
        const bulbRows = 5;
        let last = rows[rows.length - 1];
        const x0 = prevX;
        for (let q = 1; q <= bulbRows; q++) {
            const th = (q / bulbRows) * Math.PI / 2;
            const start = ring(add(center, mul(dEnd, Math.sin(th) * rad)), dEnd, x0, Math.max(1e-4, Math.cos(th) * rad), 1);
            // Rounded normals over the cap.
            for (let k = 0; k < sides; k++) {
                const o = [normals[(start + k) * 3], normals[(start + k) * 3 + 1], normals[(start + k) * 3 + 2]];
                const nn = norm(add(mul(o, Math.cos(th)), mul(dEnd, Math.sin(th))));
                normals[(start + k) * 3] = nn[0]; normals[(start + k) * 3 + 1] = nn[1]; normals[(start + k) * 3 + 2] = nn[2];
            }
            for (let k = 0; k < sides; k++) {
                const a = last + k, b = last + (k + 1) % sides, c = start + k, d = start + (k + 1) % sides;
                index.push(a, c, b, b, c, d);
            }
            last = start;
        }
        return { positions, normals, ts, index: orient(positions, normals, index), jw };
    }

    // ── bubbles ────────────────────────────────────────────────────────────
    /** Bubbles and specks hung in the goo, kept clear of the eyes and the skin. */
    function bubblesOf(lay, field, r, eyes, lo, hi) {
        const S = lay.S, rand = rng(((r.seed ?? 1) ^ 0x6b43a9b5) >>> 0);
        const list = [];
        if (r.bubbles <= 0.01) return list;
        const vol = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) / (S * S * S);
        const want = Math.round(r.bubbles * 70 * clamp(vol / 0.5, 0.6, 1.4)), specks = Math.round(r.bubbles * 36);
        const big = (0.004 + 0.016 * r.bubbleSize) * S;
        const place = (count, radiusOf, kind) => {
            let tries = 0;
            while (list.filter(b => b.kind === kind).length < count && tries++ < count * 60) {
                const p = [lerp(lo[0], hi[0], rand()), lerp(0, hi[1], rand()), lerp(lo[2], hi[2], rand())];
                const rad = radiusOf();
                if (field(p) > -(rad + 0.012 * S)) continue;
                if (eyes.some(e => len(sub(p, e.center)) < e.radius + rad + 0.01 * S)) continue;
                if (list.some(b => len(sub(p, b.p)) < b.r + rad + 0.002 * S)) continue;
                list.push({ p, r: rad, kind });
            }
        };
        // Many small bubbles and a few big ones.
        place(want, () => big * (0.35 + 0.65 * Math.pow(rand(), 2.2)), 'bubble');
        place(specks, () => 0.0028 * S * (0.6 + 0.8 * rand()), 'speck');
        return list;
    }

    /** The bubbles as one part: light spheres with a bright cap, specks small and dark. */
    function bubbleMesh(list, r, weigh) {
        const goo = linearOf(r.color), core = linearOf(r.core), white = [1, 1, 1];
        const positions = [], normals = [], colors = [], index = [], joints = [], weights = [];
        const up = norm([-0.3, 1, 0.35]);
        for (const b of list) {
            const rows = b.kind === 'speck' ? 2 : b.r > 0.01 ? 5 : 4, cols = b.kind === 'speck' ? 4 : b.r > 0.01 ? 8 : 6;
            const skin = weigh(b.p), start = positions.length / 3;
            const base = b.kind === 'speck' ? mixRgb(mul(core, 0.35), mul(goo, 0.2), 0.5) : mixRgb(goo, white, 0.55 + 0.2 * r.glow);
            for (let i = 0; i <= rows; i++) {
                const th = Math.PI * i / rows;
                for (let j = 0; j < cols; j++) {
                    const ph = j / cols * TAU, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
                    positions.push(...add(b.p, mul(d, b.r))); normals.push(...d);
                    const lit = dot(d, up);
                    colors.push(...(b.kind === 'speck' ? base : mixRgb(mixRgb(base, mul(goo, 0.55), smooth(0.2, -0.9, lit)), white, smooth(0.55, 0.9, lit))));
                    joints.push(...skin.joints); weights.push(...skin.weights);
                }
            }
            for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
                const a = start + i * cols + j, bb = start + i * cols + (j + 1) % cols, c = start + (i + 1) * cols + j, d = start + (i + 1) * cols + (j + 1) % cols;
                if (i > 0) index.push(a, c, bb);
                if (i < rows - 1) index.push(bb, c, d);
            }
        }
        return { positions, normals, colors, index: orient(positions, normals, index), joints, weights };
    }

    // ── the goo picture ────────────────────────────────────────────────────
    /** Where in the ramp: the shell from thin (0) to thick (1), the core after a gap. */
    const SHELL_U = t => (0.5 + clamp(t, 0, 1) * 159) / 256;
    const CORE_U = t => (192.5 + clamp(t, 0, 1) * 62) / 256;

    /**
     * The goo's ramp, 256 by 4: thin goo light and clear, thick goo deep and
     * dense, toward the core's color as it glows; the core in its own color,
     * brighter with glow. Translucency clears all of it.
     */
    function rampTexture(r) {
        const W = 256, H = 4, data = new Uint8Array(W * H * 4);
        const c = hexRgb(r.color), k = hexRgb(r.core), white = [1, 1, 1];
        const tr = r.translucency, g = r.glow;
        const luma = x => 0.3 * x[0] + 0.59 * x[1] + 0.11 * x[2];
        // Deep goo: darker and more saturated than the color.
        const deep = c.map(x => Math.pow(x, 1.25) * 0.9);
        const thinCol = mixRgb(c, white, 0.38);
        for (let x = 0; x < W; x++) {
            let col, a;
            if (x < 176) {
                const t = clamp((x - 0.5) / 159, 0, 1);
                col = mixRgb(thinCol, deep, Math.pow(t, 0.8));
                col = mixRgb(col, mixRgb(k, c, 0.25), g * 0.35 * t * t);
                a = lerp(lerp(0.55, 0.1, tr), lerp(0.93, 0.45, tr), Math.pow(t, 0.6));
            } else {
                const t = clamp((x - 192.5) / 62, 0, 1);
                const dim = mixRgb(mixRgb(k, c, 0.5), deep, 0.45);
                const bright = mixRgb(k, white, 0.25 * g);
                col = mixRgb(dim, bright, clamp(0.25 + 0.75 * g, 0, 1) * (0.75 + 0.25 * t));
                // A dark goo's core shows by contrast, a light goo's by depth.
                if (luma(c) > 0.75) col = mixRgb(col, mul(k, 0.75), 0.4);
                a = lerp(0.95, 0.68, tr);
            }
            for (let y = 0; y < H; y++) {
                const o = (y * W + x) * 4;
                data[o] = Math.round(clamp(col[0], 0, 1) * 255); data[o + 1] = Math.round(clamp(col[1], 0, 1) * 255); data[o + 2] = Math.round(clamp(col[2], 0, 1) * 255);
                data[o + 3] = Math.round(clamp(a, 0, 1) * 255);
            }
        }
        return { width: W, height: H, data, name: 'goo.png' };
    }

    /** The goo's light, as the ramp lays it out: none in thin goo, a soft glow in thick goo, the core brightest; dark when Glow is off. */
    function glowTexture(r) {
        const W = 256, H = 4, data = new Uint8Array(W * H * 4);
        const k = hexRgb(r.core), g = r.glow;
        for (let x = 0; x < W; x++) {
            const t = x < 176 ? clamp((x - 0.5) / 159, 0, 1) : 1;
            const e = x < 176 ? 0.35 * g * Math.pow(t, 1.5) : Math.min(1, 1.25 * g);
            for (let y = 0; y < H; y++) {
                const o = (y * W + x) * 4;
                for (let c = 0; c < 3; c++) data[o + c] = Math.round(clamp(k[c] * e, 0, 1) * 255);
                data[o + 3] = 255;
            }
        }
        return { width: W, height: H, data, name: 'goo-glow.png' };
    }

    // ── hats ───────────────────────────────────────────────────────────────
    /**
     * The landmarks a hat is fitted by, measured on the goo: its top and its
     * cross-section at a height. The hat line is where the goo is as wide as
     * a hat's crown, so a hat sits on top and sinks a little into it.
     */
    function hatLandmarks(lay, field, bones) {
        const { S, head, f } = lay;
        const cz = head.c[2];
        const out = (o, d) => {
            let t0 = 0, t1 = 1.2 * S;
            if (field(o) > 0) return 0;
            for (let it = 0; it < 26; it++) { const m = (t0 + t1) / 2; if (field(add(o, mul(d, m))) < 0) t0 = m; else t1 = m; }
            return t0;
        };
        let crown = head.c[1];
        { let y0 = head.c[1], y1 = head.c[1] + head.r[1] * 2.2; for (let it = 0; it < 30; it++) { const m = (y0 + y1) / 2; if (field([0, m, cz]) < 0) y0 = m; else y1 = m; } crown = y0; }
        const ring = y => {
            const o = [0, y, cz];
            const xr = out(o, [1, 0, 0]), xl = out(o, [-1, 0, 0]), zf = out(o, [0, 0, 1]), zb = out(o, [0, 0, -1]);
            if (!xr || !xl) return null;
            return { center: [(xr - xl) / 2, y, cz + (zf - zb) / 2], rx: (xr + xl) / 2, rz: (zf + zb) / 2, front: cz + zf, back: cz - zb };
        };
        // The hat line a little below the top: a slime's hat perches on its dome, a person's at the brow.
        const brow = crown - lerp(0.1, 0.06, f) * S;
        const want = (ring(brow) || { rx: 0.1 * S }).rx;
        const hb = bones.findIndex(b => b.name === 'Head');
        const eye = side => ({ center: [side * want * 0.4, brow - 0.03 * S, head.c[2] + head.r[2]], radius: 0.02 * S });
        return {
            boneIndex: name => { const i = bones.findIndex(b => b.name === name); return i < 0 ? hb : i; },
            bone: name => bones.find(b => b.name === name) || bones[hb],
            brow: brow - 0.012 * S, crown, ring: y => ring(y), eyeL: eye(1), eyeR: eye(-1), eyeY: brow - 0.03 * S, height: crown
        };
    }

    const HAT_FINISH = { crown: [0.3, 0.85], circlet: [0.3, 0.85], vikinghelm: [0.35, 0.8], halo: [0.3, 0.6] };
    function hatParts(lay, field, bones, r) {
        if (!Props || !r.props.length) return [];
        const L = hatLandmarks(lay, field, bones);
        const parts = [];
        for (const item of r.props) {
            const def = Props.BY_ID.get(item.id);
            if (!def || !fits(item.id)) continue;
            const m = new Props.Mesh();
            def.make(m, L, item);
            if (m.empty) continue;
            const [roughness, metalness] = HAT_FINISH[item.id] || [0.85, 0];
            parts.push(m.part(def.label, { roughness, metalness, kind: metalness > 0.5 ? 'metal' : 'prop' }));
        }
        return parts;
    }

    // ── building ───────────────────────────────────────────────────────────
    /** The goo, eyes, bubbles and feelers for a recipe: the geometry, kept per shape. */
    function shapeOf(r, quality) {
        const t0 = Date.now();
        const lay = layout(r), F = fieldOf(lay), S = lay.S, save = quality === 'save';
        // A draft (while a slider is dragged) is meshed coarse and quick.
        const cell = save ? 0.0105 * S : quality === 'draft' ? 0.042 * S : lay.cell;
        // Bounds: every piece and its blend.
        const lo = [Infinity, 0, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        const grow = (c, rx, ry, rz) => { lo[0] = Math.min(lo[0], c[0] - rx); lo[2] = Math.min(lo[2], c[2] - rz); hi[0] = Math.max(hi[0], c[0] + rx); hi[1] = Math.max(hi[1], c[1] + ry); hi[2] = Math.max(hi[2], c[2] + rz); };
        for (const e of [lay.puddle, lay.mound, lay.hips, lay.chest, lay.head]) grow(e.c, e.r[0], e.r[1], e.r[2]);
        for (const c of [lay.waist, lay.neck, ...lay.legs]) { grow(c.a, c.ra, c.ra, c.ra); grow(c.b, c.rb, c.rb, c.rb); }
        for (const a of lay.arms) grow(a.tip, a.rt, a.rt, a.rt);
        for (const a of lay.arms) { grow(a.s, a.rs, a.rs, a.rs); grow(a.e, a.re, a.re, a.re); grow(a.hand.c, a.hand.r[0], a.hand.r[1], a.hand.r[2]); }
        const pad = lay.k.base * 0.5 + cell * 3;
        for (let i = 0; i < 3; i++) { lo[i] -= i === 1 ? cell * 2 : pad; hi[i] += pad; }
        lo[1] = -cell * 2;
        // The core: a soft nucleus deep in the goo (in a blob's middle, in a person's chest), kept inside it.
        const f = lay.f;
        const nc = mul(lerp3([0, 0.27, 0.0], [0, 1.0, 0.0], f), S), nr = mul(lerp3([0.19, 0.15, 0.17], [0.1, 0.17, 0.07], f), S);
        const coreField = p => Math.max(ellipsoid(p, nc, nr) + 0.6 * wobble([p[0] * 2.3, p[1] * 2.3, p[2] * 2.3], S, 0), F.all(p) + 0.035 * S);
        const [shellNet] = surfaceNets(F.all, lo, hi, cell, [0]);
        const clo = [nc[0] - nr[0] - cell * 4, Math.max(lo[1], nc[1] - nr[1] - cell * 4), nc[2] - nr[2] - cell * 4], chi = [nc[0] + nr[0] + cell * 4, nc[1] + nr[1] + cell * 4, nc[2] + nr[2] + cell * 4];
        const [coreNet] = surfaceNets(coreField, clo, chi, cell * 0.8, [0]);
        const steps = quality === 'draft' ? 1 : 2;
        const shell = levelMesh(F.all, shellNet, 0, cell, save ? 12000 : 0, steps);
        const core = levelMesh(coreField, coreNet, 0, cell * 0.8, save ? 2500 : 0, steps);
        const eyes = placeEyes(lay, F.all, r);
        const feelers = feelersOf(lay, F.all, r);
        const drips = dripsOf(lay);
        const mouth = placeMouth(lay, F.all);
        const bones = bonesOf(lay, eyes, feelers, mouth);
        const weigh = weigher(lay, F, bones);
        // How thick the goo is under each vertex of the shell, inward along its normal: its place in the ramp.
        const thick = (P, N, v) => {
            const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], n = [-N[v * 3], -N[v * 3 + 1], -N[v * 3 + 2]];
            let t = cell * 0.8;
            for (let it = 0; it < (quality === 'draft' ? 8 : 18) && t < 1.2 * S; it++) {
                const d = F.all(add(p, mul(n, t)));
                if (d > 0) break;
                t += Math.max(-d, cell);
            }
            return t;
        };
        const sv = shell.positions.length / 3, cv = core.positions.length / 3;
        const shellU = new Float32Array(sv), coreU = new Float32Array(cv);
        const depth = 0.32 * S;
        for (let v = 0; v < sv; v++) {
            const t = thick(shell.positions, shell.normals, v);
            const x = shell.positions[v * 3] / S, y = shell.positions[v * 3 + 1] / S, z = shell.positions[v * 3 + 2] / S;
            // A little cloudiness, so the density is never perfectly even.
            const cloud = 0.06 * Math.sin(x * 17 + y * 5) * Math.sin(y * 13 - z * 9 + 1.7);
            shellU[v] = clamp(1 - Math.exp(-t / depth) + cloud, 0, 1);
        }
        for (let v = 0; v < cv; v++) {
            const y = core.positions[v * 3 + 1] / S, x = core.positions[v * 3] / S;
            coreU[v] = clamp(0.5 + 0.5 * Math.sin(y * 21 + x * 9), 0, 1);
        }
        // Feelers and drips: thin goo, lofted.
        const tubes = [];
        for (const fl of feelers) {
            const b0 = bones.findIndex(b => b.name === fl.name), b1 = b0 + 1, head = bones.findIndex(b => b.name === 'Head');
            tubes.push(tubeMesh(fl, save ? 12 : 9, t => {
                if (t < 0.12) return { joints: [head, b0, 0, 0], weights: [1 - t / 0.12, t / 0.12, 0, 0] };
                const s = smooth(0.45, 0.75, t);
                return { joints: [b0, b1, 0, 0], weights: [1 - s, s, 0, 0] };
            }));
        }
        for (const dr of drips) {
            const bone = bones.findIndex(b => b.name === dr.bone);
            tubes.push(tubeMesh(dr, save ? 10 : 8, () => ({ joints: [bone, 0, 0, 0], weights: [1, 0, 0, 0] })));
        }
        const list = bubblesOf(lay, F.all, r, eyes, lo, hi);
        return { lay, F, cell, shell, core, shellU, coreU, eyes, mouth, tubes, bones, weigh, bubbles: list, ms: Date.now() - t0 };
    }

    /** One part from flat arrays. */
    function part(name, g, extra) {
        return Object.assign({
            name, positions: Float32Array.from(g.positions), normals: Float32Array.from(g.normals), index: Uint32Array.from(g.index),
            joints: Uint8Array.from(g.joints), weights: Float32Array.from(g.weights)
        }, g.colors ? { colors: Float32Array.from(g.colors) } : {}, g.uvs ? { uvs: Float32Array.from(g.uvs) } : {}, extra);
    }

    /** The goo: the core's triangles first, then the shell's, then the feelers and drips; one picture. */
    function gooPart(shape) {
        const { shell, core, shellU, coreU, tubes, weigh } = shape;
        const positions = [], normals = [], uvs = [], index = [], joints = [], weights = [];
        const addMesh = (m, uOf, skinOf) => {
            const base = positions.length / 3, n = m.positions.length / 3;
            for (let v = 0; v < n; v++) {
                const p = [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];
                positions.push(p[0], p[1], p[2]); normals.push(m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]);
                uvs.push(uOf(v), 0.5);
                const s = skinOf(v, p);
                joints.push(...s.joints); weights.push(...s.weights);
            }
            for (const i of m.index) index.push(base + i);
        };
        addMesh(core, v => CORE_U(coreU[v]), (v, p) => weigh(p));
        addMesh(shell, v => SHELL_U(shellU[v]), (v, p) => weigh(p));
        for (const t of tubes) addMesh(t, v => SHELL_U(0.12 + 0.2 * t.ts[v]), v => t.jw[v]);
        return { positions, normals, uvs, index, joints, weights };
    }

    /** The last few shapes built (the view's, the pictures', a save's), so a recolor or a second build makes no new mesh. */
    const SHAPES = new Map();

    /**
     * A Slimefolk as the builder and Save take it: { recipe, parts, bones,
     * height, textures, clips, sidecar, plan }.
     */
    function build(recipe, cache, options) {
        const r = normalizeRecipe(recipe), o = options || {};
        const keyOf = q => JSON.stringify([r.form, r.size, r.feelers, r.bubbles, r.bubbleSize, r.eyes.size, r.seed ?? 1, q]);
        // While a slider is dragged (`draft`), the shape the view already has is used when there is one, else a coarse one is made.
        let quality = o.quality || 'save';
        if (o.draft && quality === 'preview' && !SHAPES.has(keyOf('preview'))) quality = 'draft';
        const shapeKey = keyOf(quality);
        let shape = SHAPES.get(shapeKey);
        if (!shape) {
            shape = shapeOf(r, quality);
            shape.goo = gooPart(shape);
            SHAPES.set(shapeKey, shape);
            if (SHAPES.size > 6) SHAPES.delete(SHAPES.keys().next().value);
        } else { SHAPES.delete(shapeKey); SHAPES.set(shapeKey, shape); }
        const { bones, eyes } = shape;
        const eyeParts = eyes.map((e, k) => eyeMesh(e, r, bones.findIndex(b => b.name === (k === 0 ? 'LeftEye' : 'RightEye')), quality));
        const eyeGeo = { positions: [], normals: [], colors: [], index: [], joints: [], weights: [] };
        for (const m of eyeParts) {
            const base = eyeGeo.positions.length / 3;
            eyeGeo.positions.push(...m.positions); eyeGeo.normals.push(...m.normals); eyeGeo.colors.push(...m.colors);
            eyeGeo.joints.push(...m.joints); eyeGeo.weights.push(...m.weights);
            for (const i of m.index) eyeGeo.index.push(base + i);
        }
        const parts = [part('Eyes', eyeGeo, { roughness: 0.06, kind: 'eye' })];
        if (shape.mouth.show) parts.push(part('Mouth', mouthMesh(shape.mouth, r, bones.findIndex(b => b.name === 'Mouth')), { roughness: 0.2, kind: 'mouth' }));
        if (shape.bubbles.length) parts.push(part('Bubbles', bubbleMesh(shape.bubbles, r, shape.weigh), { roughness: 0.12, kind: 'bubble' }));
        // The glow is its own picture, the goo's light (`emissiveTexture`): thick goo and the core give it off.
        parts.push(part('Goo', shape.goo, { texture: 'goo.png', emissiveTexture: 'goo-glow.png', emissive: '#ffffff', roughness: 0.08, blend: true, kind: 'goo' }));
        parts.push(...hatParts(shape.lay, shape.F.all, bones, r));
        let height = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) height = Math.max(height, p.positions[i]);
        const result = {
            recipe: r, parts, bones: bones.map(b => ({ name: b.name, parent: b.parent, head: b.head.slice(), tail: b.tail.slice() })),
            // The view's Face frame and the pictures aim at the eyes, as on a person.
            height, bodyHeight: Math.min(height, eyes[0].center[1] / 0.93), textures: { 'goo.png': rampTexture(r), 'goo-glow.png': glowTexture(r) }, clips: o.static ? [] : clipsFor(bones, r), plan: 'slime', shaded: true,
            sidecar: sidecar(r), buildMs: shape.ms
        };
        return result;
    }

    /**
     * The model.json beside the saved file: a wet surface (a clear glaze that
     * catches the light, strongest at the rim), and no rig, so only the file's
     * own clips play.
     */
    function sidecar(r) {
        return { surface: { reflect: 0.45, gloss: 0.9, metal: 0, tint: '#ffffff', texture: 1 } };
    }

    // ── motion ─────────────────────────────────────────────────────────────
    const q = (x, y, z) => Glb.multiply(Glb.axisAngle(0, 0, 1, z || 0), Glb.multiply(Glb.axisAngle(0, 1, 0, y || 0), Glb.axisAngle(1, 0, 0, x || 0)));
    const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    /** Keys [time, value], eased between. */
    const curve = keys => t => {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 0; i + 1 < keys.length; i++) {
            const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
            if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / ((t1 - t0) || 1));
        }
        return keys[keys.length - 1][1];
    };
    /** A wobble that overshoots and settles: from `t0`, `amp` at `freq` Hz, dying at `decay`. */
    const jiggle = (t, t0, amp, freq, decay) => (t < t0 ? 0 : amp * Math.exp(-decay * (t - t0)) * Math.sin(TAU * freq * (t - t0)));
    /** A bump on a loop (u in 0..1), seamless across the end. */
    const bump = (u, c, w) => { let d = Math.abs(u - c) % 1; if (d > 0.5) d = 1 - d; return Math.exp(-0.5 * (d / w) * (d / w)); };
    /** Squash that keeps the volume: [sideways, up, sideways]. */
    const squash = (up, spread = 1) => { const s = 1 / Math.sqrt(Math.max(0.05, up)); return [s * spread, up, s * spread]; };

    /** Bones each clip sets: rotation for all that move, position for the base, scale where goo squashes. */
    const SCALED = new Set(['Base', 'Body', 'Chest', 'Head', 'LeftEye', 'RightEye', 'Mouth']);

    /** Samples `poseAt(t)` ({ bone: { r, p, s } }) over the clip into tracks for every bone that moves. */
    function bake(bones, name, id, T, poseAt, loop) {
        const fps = 30, n = Math.max(2, Math.round(T * fps) + 1);
        const times = new Float32Array(n);
        for (let i = 0; i < n; i++) times[i] = (T * i) / (n - 1);
        const frames = Array.from(times, t => poseAt(t));
        const tracks = [];
        bones.forEach((b, bi) => {
            if (b.name === 'Root') return;
            const rest = b.parent >= 0 ? sub(b.head, bones[b.parent].head) : b.head;
            const rot = new Float32Array(n * 4);
            frames.forEach((F, i) => { const x = F[b.name] && F[b.name].r; rot.set(x ? q(x[0], x[1], x[2]) : [0, 0, 0, 1], i * 4); });
            tracks.push({ bone: bi, values: rot });
            if (b.name === 'Base') {
                const pos = new Float32Array(n * 3);
                frames.forEach((F, i) => { const d = (F.Base && F.Base.p) || [0, 0, 0]; pos.set(add(rest, d), i * 3); });
                tracks.push({ bone: bi, path: 'translation', values: pos });
            }
            if (SCALED.has(b.name)) {
                const sc = new Float32Array(n * 3);
                frames.forEach((F, i) => sc.set((F[b.name] && F[b.name].s) || [1, 1, 1], i * 3));
                tracks.push({ bone: bi, path: 'scale', values: sc });
            }
        });
        return { name, id, times, tracks, loop: !!loop, once: !loop };
    }

    /** The feelers' sway: each follows the head a moment late, its tip later. */
    function feelerSway(bones, out, t, amount, lag) {
        for (const b of bones) {
            if (!/Feeler\d*$/.test(b.name)) continue;
            const side = b.name.startsWith('Right') ? -1 : 1, k = (b.name.match(/\d+/) || [0])[0] * 1;
            const w = (lag + k * 0.4) || 0;
            out[b.name] = { r: [amount * Math.sin(t - w), 0, side * amount * 0.6 * Math.sin(t + w + 1.3)] };
            out[b.name + 'Tip'] = { r: [amount * 1.4 * Math.sin(t - w - 0.9), 0, side * amount * 0.8 * Math.sin(t + w + 0.4)] };
        }
    }

    /** Every clip a Slimefolk has, in order: Idle first. */
    function clipsFor(bones, recipe) {
        const r = normalizeRecipe(recipe), S = r.size, f = r.form, blob = Math.pow(1 - f, 1.5), person = 1 - blob;
        const has = name => bones.some(b => b.name === name);
        const clips = [];

        // Idle: a breath that swells and settles, the top following a moment late, a blink.
        clips.push(bake(bones, 'Idle', 'idle', 3, t => {
            const p = TAU * t / 3, out = {};
            const up = 1 + 0.034 * Math.sin(p) + 0.009 * Math.sin(2 * p + 0.7);
            out.Base = { s: squash(up) };
            out.Chest = { r: [0.022 * Math.sin(p - 0.8), 0, 0.018 * Math.sin(p + 1.1)], s: squash(1 + 0.012 * Math.sin(2 * p - 1.2)) };
            out.Head = { r: [0.03 * Math.sin(p - 1.4), 0.03 * Math.sin(p * 0.5 * 2 + 0.3) * person, 0.024 * Math.sin(p + 0.3)], s: squash(1 + 0.016 * Math.sin(2 * p - 1.8)) };
            // The blink: a quick close and open at 1.9 s.
            const blink = 1 - 0.9 * bump(t / 3, 2.0 / 3, 0.018);
            out.LeftEye = out.RightEye = { s: [1 + 0.04 * (1 - blink), blink, 1] };
            out.LeftArm = { r: [0.04 * Math.sin(p - 0.5), 0, 0.03 * Math.sin(p - 0.9)] };
            out.RightArm = { r: [0.04 * Math.sin(p - 0.7), 0, -0.03 * Math.sin(p - 1.1)] };
            out.LeftForeArm = { r: [-0.05 * Math.sin(p - 1.2), 0, 0] }; out.RightForeArm = { r: [-0.05 * Math.sin(p - 1.4), 0, 0] };
            feelerSway(bones, out, p, 0.12, 0.6);
            return out;
        }, true));

        // Walk: a slime hops (squash, spring up, land, wobble), a goo person oozes along (a gliding sway).
        const T = lerp(0.8, 1.0, f);
        const hopUp = 0.12 * S;
        clips.push(bake(bones, 'Walk', 'walk', T, t => {
            const u = t / T, out = {};
            // The hop: up between 0.24 and 0.66 of the step.
            const u0 = 0.24, u1 = 0.66, s = clamp((u - u0) / (u1 - u0), 0, 1);
            const lift = u > u0 && u < u1 ? 4 * s * (1 - s) : 0;
            let hop = -0.2 * bump(u, 0.15, 0.05) + 0.2 * bump(u, 0.3, 0.05) + 0.03 * bump(u, 0.45, 0.08);
            if (u >= u1) hop += -0.26 * Math.exp(-(u - u1) * 9) * Math.cos(TAU * 3.4 * (u - u1)) * (1 - smooth(0.9, 1, u));
            const lean = 0.14 * bump(u, 0.3, 0.07) - 0.1 * bump(u, 0.72, 0.06);
            // The ooze: the base ripples forward, the body sways side to side, the legs shuffle.
            const w = TAU * u;
            const oozeUp = 0.025 * Math.sin(2 * w), sway = 0.07 * Math.sin(w);
            out.Base = { p: [0, blob * hopUp * lift + person * 0.008 * S * Math.abs(Math.sin(w)), 0], s: squash(1 + blob * hop + person * oozeUp, 1 + person * 0.03 * Math.sin(2 * w + 1)), r: [0, 0, person * 0.03 * Math.sin(w)] };
            out.Body = { r: [blob * lean + person * (0.06 + 0.02 * Math.sin(2 * w)), 0, person * sway] };
            out.Chest = { r: [blob * 0.8 * (0.14 * bump(u, 0.36, 0.07) - 0.1 * bump(u, 0.78, 0.06)) + person * 0.02 * Math.sin(2 * w - 0.6), person * 0.06 * Math.sin(w - 0.4), -person * 0.04 * Math.sin(w - 0.5)], s: squash(1 + blob * 0.5 * hop) };
            out.Head = { r: [blob * (0.1 * bump(u, 0.42, 0.07) - 0.12 * bump(u, 0.84, 0.06)) + person * 0.035 * Math.sin(2 * w - 1.2), 0, -person * 0.04 * Math.sin(w - 1.0)], s: squash(1 + blob * 0.6 * hop) };
            out.LeftLeg = { r: [person * 0.16 * Math.sin(w), 0, 0] };
            out.RightLeg = { r: [-person * 0.16 * Math.sin(w), 0, 0] };
            out.LeftArm = { r: [-person * 0.3 * Math.sin(w - 0.5) - blob * 0.1 * bump(u, 0.3, 0.08), 0, 0.05 + blob * 0.15 * bump(u, 0.35, 0.08)] };
            out.RightArm = { r: [person * 0.3 * Math.sin(w - 0.5) - blob * 0.1 * bump(u, 0.3, 0.08), 0, -0.05 - blob * 0.15 * bump(u, 0.35, 0.08)] };
            out.LeftForeArm = { r: [-person * (0.15 + 0.12 * Math.sin(w - 1.1)), 0, 0] }; out.RightForeArm = { r: [-person * (0.15 - 0.12 * Math.sin(w - 1.1)), 0, 0] };
            const e = 1 - 0.12 * blob * bump(u, 0.72, 0.04);
            out.LeftEye = out.RightEye = { s: [1, e, 1] };
            feelerSway(bones, out, w * 2, 0.22, 0.8);
            return out;
        }, true));

        // Attack: draw back and squash, lunge out stretched, splat, then wobble back to rest.
        const reach = lerp(0.3, 0.2, f) * S;
        clips.push(bake(bones, 'Attack', 'attack', 1.1, t => {
            const out = {}, end = 1 - smooth(0.92, 1.1, t);
            const z = curve([[0, 0], [0.28, -0.05 * S], [0.42, reach], [0.6, reach * 0.85], [1.0, 0]])(t);
            const up = curve([[0, 1], [0.28, 0.8], [0.4, 1.28], [0.48, 0.68], [0.6, 1.0]])(t) + jiggle(t, 0.6, -0.12, 4, 6) * end;
            const lean = curve([[0, 0], [0.28, -0.28], [0.42, 0.42], [0.6, 0.22], [1.0, 0]])(t) + jiggle(t, 0.6, 0.08, 3.5, 6) * end;
            out.Base = { p: [0, blob * 0.05 * S * Math.sin(Math.PI * clamp((t - 0.28) / 0.2, 0, 1)), z], s: squash(up, t > 0.42 && t < 0.62 ? 1 + 0.12 * Math.sin(Math.PI * (t - 0.42) / 0.2) : 1) };
            out.Body = { r: [lean, 0, 0] };
            out.Chest = { r: [lean * 0.6 + jiggle(t, 0.5, 0.1, 3, 5) * end, 0, 0] };
            out.Head = { r: [lean * 0.4 + jiggle(t, 0.52, 0.14, 3, 5) * end, 0, 0], s: squash(1 + jiggle(t, 0.48, -0.1, 4.5, 6) * end) };
            // A person's arms swing forward and slap down.
            const swing = person * curve([[0, 0], [0.28, 0.5], [0.44, -1.5], [0.6, -1.1], [1.05, 0]])(t);
            const splay = person * curve([[0, 0], [0.3, 0.12], [0.6, 0.1], [1.05, 0]])(t);
            out.LeftArm = { r: [swing, 0, splay] }; out.RightArm = { r: [swing, 0, -splay] };
            out.LeftForeArm = out.RightForeArm = { r: [person * curve([[0, 0], [0.28, -0.6], [0.44, 0], [1.05, 0]])(t), 0, 0] };
            const squint = 1 - 0.4 * bump(t / 1.1, 0.42 / 1.1, 0.04);
            out.LeftEye = out.RightEye = { s: [1, squint, 1] };
            const gape = curve([[0, 0], [0.3, 0.3], [0.44, 1], [0.62, 0.5], [0.9, 0]])(t);
            out.Mouth = { s: [1 + 0.25 * gape, 1 + 4.5 * gape, 1] };
            feelerSway(bones, out, TAU * t * 2, 0.25 * smooth(0, 0.2, t) * (1 - smooth(0.6, 1.05, t)), 0.5);
            return out;
        }, false));

        // Hit: knocked back, the whole goo rippling as it settles.
        clips.push(bake(bones, 'Hit', 'hit', 0.8, t => {
            const out = {}, end = 1 - smooth(0.68, 0.8, t);
            const back = -0.06 * S * Math.exp(-t * 7) * Math.sin(Math.PI * clamp(t / 0.12, 0, 1) * 0.5 + (t > 0.12 ? Math.PI * 0.5 : 0)) * end;
            out.Base = { p: [0, 0, back], s: squash(1 + jiggle(t, 0, -0.2, 4.2, 5.5) * end) };
            out.Body = { r: [jiggle(t, 0, -0.3, 3, 5) * end, 0, jiggle(t, 0.02, 0.06, 3.6, 6) * end] };
            out.Chest = { r: [jiggle(t, 0.05, -0.22, 3, 5) * end, 0, 0], s: squash(1 + jiggle(t, 0.04, 0.1, 5, 6) * end) };
            out.Head = { r: [jiggle(t, 0.09, -0.24, 3, 5) * end, 0, jiggle(t, 0.06, 0.08, 3.6, 6) * end], s: squash(1 + jiggle(t, 0.07, -0.14, 5, 6) * end) };
            out.LeftArm = { r: [jiggle(t, 0.06, 0.4, 3, 5) * end * person, 0, jiggle(t, 0.04, 0.2, 3, 5) * end] };
            out.RightArm = { r: [jiggle(t, 0.06, 0.4, 3, 5) * end * person, 0, -jiggle(t, 0.04, 0.2, 3, 5) * end] };
            const wince = 1 - 0.75 * curve([[0, 0], [0.04, 1], [0.22, 1], [0.36, 0]])(t);
            out.LeftEye = out.RightEye = { s: [1 + 0.1 * (1 - wince), wince, 1] };
            // A little 'oh'.
            const oh = curve([[0, 0], [0.05, 1], [0.25, 0.8], [0.5, 0]])(t);
            out.Mouth = { s: [1 - 0.35 * oh, 1 + 3 * oh, 1] };
            feelerSway(bones, out, TAU * t * 3, 0.35 * end * smooth(0, 0.06, t) * Math.exp(-t * 3), 0.4);
            return out;
        }, false));

        // Death: a shiver, then the goo slumps and spreads into a puddle, the eyes sinking into it.
        clips.push(bake(bones, 'Death', 'death', 1.8, t => {
            const out = {}, m = ease((t - 0.18) / 1.1);
            const shiver = jiggle(t, 0, 0.05, 7, 7);
            // A blob spreads wide; a person's arms and shoulders fold in as the goo slumps, so the puddle stays a puddle.
            const spread = 1 + (0.95 - 0.35 * person) * m + shiver * 0.5, fold = 1 - 0.45 * person * m;
            out.Base = { s: [spread, Math.max(0.1, 1 - 0.88 * m + jiggle(t, 1.25, 0.03, 3, 6)), spread] };
            out.Body = { r: [0.12 * m, 0, 0] };
            out.Chest = { r: [0.18 * m + shiver, 0, 0], s: [fold, 1, fold] };
            out.Head = { r: [0.25 * m, 0, 0], s: [1 + 0.15 * m, 1 - 0.3 * m, 1 + 0.15 * m] };
            out.LeftArm = { r: [0.3 * m * person, 0, -0.25 * m * person] }; out.RightArm = { r: [0.3 * m * person, 0, 0.25 * m * person] };
            out.LeftForeArm = out.RightForeArm = { r: [-0.5 * m * person, 0, 0] };
            // The eyes keep their round as the goo flattens under them, shrink and sink into the puddle.
            const sink = lerp(1, 0.04, smooth(0.25, 1.05, t));
            const across = spread * (1 + 0.15 * m) * (out.Chest.s[0]), upward = out.Base.s[1] * out.Head.s[1];
            out.LeftEye = out.RightEye = { s: [sink / across, sink / upward, sink / across] };
            out.Mouth = { s: [sink / across, sink / upward, sink / across] };
            feelerSway(bones, out, 0, 0, 0);
            for (const b of bones) if (/Feeler\d*$/.test(b.name)) { out[b.name] = { r: [0.9 * m, 0, 0] }; out[b.name + 'Tip'] = { r: [0.6 * m, 0, 0] }; }
            return out;
        }, false));

        // Talk: quick little swells as it speaks, the head tilting, the eyes widening on the beats.
        clips.push(bake(bones, 'Talk', 'talk', 1.2, t => {
            const u = t / 1.2, w = TAU * u, out = {};
            // Syllables: the mouth opens on each, and the goo swells with it a moment later.
            const open = Math.pow(Math.max(0, Math.sin(3 * w)), 0.8) * (0.65 + 0.35 * Math.sin(w + 0.4)) + 0.45 * Math.pow(Math.max(0, Math.sin(5 * w + 1)), 2);
            const late = Math.pow(Math.max(0, Math.sin(3 * w - 0.5)), 0.8) * (0.65 + 0.35 * Math.sin(w - 0.1)) + 0.45 * Math.pow(Math.max(0, Math.sin(5 * w + 0.5)), 2);
            const beat = 0.032 * late - 0.012;
            out.Mouth = { s: [1 + 0.18 * open, 1 + 4.2 * open, 1] };
            out.Base = { s: squash(1 + beat) };
            out.Chest = { r: [0.025 * Math.sin(2 * w - 0.5), 0, 0.02 * Math.sin(w)], s: squash(1 + 0.6 * beat) };
            out.Head = { r: [0.04 * Math.sin(2 * w - 0.9), 0.05 * Math.sin(w - 0.3) * person, 0.07 * Math.sin(w + 0.2)], s: squash(1 + 1.2 * beat) };
            const wide = 1 + 0.07 * late;
            out.LeftEye = out.RightEye = { s: [wide, wide, 1] };
            out.LeftArm = { r: [-person * (0.15 + 0.12 * Math.sin(w)), 0, 0.06] }; out.RightArm = { r: [-person * 0.05 * Math.sin(w + 1), 0, -0.04] };
            out.LeftForeArm = { r: [-person * (0.5 + 0.25 * Math.sin(2 * w)), 0, 0] }; out.RightForeArm = { r: [-person * 0.12, 0, 0] };
            feelerSway(bones, out, 2 * w, 0.14, 0.5);
            return out;
        }, true));
        return clips;
    }

    /** Poses and moves the builder plays (Idle comes first, from the build). */
    const POSES = [{ id: 'walk', label: 'Moving' }, { id: 'attack', label: 'Lunge' }, { id: 'hit', label: 'Flinch' }, { id: 'death', label: 'Melt' }, { id: 'talk', label: 'Talking' }];
    function poseClip(bones, id, recipe) { return clipsFor(bones, recipe).find(c => c.id === id) || null; }

    // ── the page ───────────────────────────────────────────────────────────
    /** The Slimefolk's controls in the Body tab, with the builder's own rows. */
    function panel(b) {
        const colors = PALETTE.map(p => p[0]), cores = PALETTE.map(p => p[1]).filter((c, i, a) => a.indexOf(c) === i).slice(0, 8);
        return b._section('Slime')
            + b._slider({ path: 'form', label: 'Shape', natural: [0, 1], ends: ['Blob', 'Humanoid'] })
            + b._slider({ path: 'size', label: 'Size', natural: [0.5, 1.6], extreme: [0.4, 2.5], format: 'x' })
            + b._select('feelers', 'Feelers', FEELERS)
            + b._section('Goo')
            + b._color('color', 'Color', colors.slice(0, 9))
            + b._color('core', 'Core color', cores)
            + b._slider({ path: 'translucency', label: 'Translucency', natural: [0, 1] })
            + b._slider({ path: 'glow', label: 'Glow', natural: [0, 1] })
            + b._slider({ path: 'bubbles', label: 'Bubbles', natural: [0, 1] })
            + b._slider({ path: 'bubbleSize', label: 'Bubble size', natural: [0, 1] })
            + b._section('Eyes')
            + b._color('eyes.color', 'Iris', ['#2e1c10', '#101014', '#1c3a6a', '#3a6a2a', '#6a1a1a', '#5a3a8a', '#c89a20'])
            + b._slider({ path: 'eyes.size', label: 'Eye size', natural: [0.6, 1.5], extreme: [0.5, 1.8], format: 'x' });
    }

    /**
     * The view's material for goo and bubbles, set on the builder's own: the
     * goo blended over what is behind it without writing depth (the eyes and
     * bubbles inside stay seen), wet and glossy, glowing by its glow picture
     * (`texture(name)` gives the view's texture of a picture).
     */
    function viewMaterial(m, part, weak, texture) {
        if (part.kind === 'goo') {
            m.transparent = true; m.depthWrite = false; m.alphaTest = 0;
            // Its glow, as the saved file carries it.
            const glow = part.emissiveTexture && texture && texture(part.emissiveTexture);
            if (glow) { m.emissiveMap = glow; m.emissive.set(1, 1, 1); }
            m.roughness = 0.07; m.metalness = 0; m.envMapIntensity = weak ? 1.25 : 1.45;
            if (m.isMeshPhysicalMaterial) { m.clearcoat = 1; m.clearcoatRoughness = 0.04; m.specularIntensity = 1; m.ior = 1.38; }
        } else if (part.kind === 'bubble') {
            m.roughness = 0.1; m.envMapIntensity = 1.2;
            if (m.isMeshPhysicalMaterial) { m.clearcoat = 1; m.clearcoatRoughness = 0.05; }
        }
        return m;
    }

    const api = {
        DEFAULT_RECIPE, FEELERS, PALETTE, POSES, normalizeRecipe, randomRecipe, fits, layout, build, clipsFor, poseClip, sidecar, rampTexture, panel, viewMaterial,
        SHELL_U, CORE_U
    };
    root.RRSlimeBody = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
