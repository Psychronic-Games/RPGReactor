/**
 * RRHaftedProp - Weapons › Axes & Hammers and Spears & Polearms: a forged
 * head on a wooden haft, from a few choices, saved holdable.
 *
 * Built in weapon space (RRWeaponKit): the haft along +x from its butt
 * (x = 0) to the top of the head (x = length); the cutting edge, hammer
 * face or blade toward -y; flats facing +-z. Heads are forged plates with
 * flat cheeks, a ground bevel to a honed edge and chamfers everywhere
 * else (axes, halberds, flanges), ridged blades (spears, glaives, tines,
 * scythes) or chamfered blocks (hammers, mauls). The eye sits in a
 * socket with langets and rivets down the haft; the grip is wrapped. The
 * saved model lies flat, centered, and carries the blade rig (gripBottom,
 * gripTop, tip, edge) where a hand holds it: one-handed weapons near the
 * butt, polearms a third of the way up.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const CM = need('RRContainerMesh', './ContainerMesh.js');
    const K = need('RRWeaponKit', './WeaponKit.js');
    const { clamp, color, pick } = K;

    const WRAPS = [['leather', 'Leather'], ['cord', 'Cord'], ['none', 'None']];
    const RUNES = [['none', 'None'], ['inlaid', 'Inlaid'], ['glowing', 'Glowing']];
    // id, label, category, the head's defaults, and what the Shape slider means for it.
    const PRESETS = [
        ['handaxe', 'Hand axe', 'axes', { length: 0.62, size: 1, shape: 0.5, metal: 'steel', trim: 'black', wood: 'ash', wrap: 'leather', wrapColor: '#4a2c1c' }],
        ['battleaxe', 'Battle axe', 'axes', { length: 1.15, size: 1, shape: 0.5, metal: 'steel', trim: 'steel', wood: 'walnut', wrap: 'leather', wrapColor: '#2a1d15' }],
        ['warhammer', 'War hammer', 'axes', { length: 0.78, size: 1, shape: 0.55, metal: 'steel', trim: 'bronze', wood: 'oak', wrap: 'cord', wrapColor: '#5a2a1a' }],
        ['maul', 'Maul', 'axes', { length: 1.25, size: 1, shape: 0.45, metal: 'iron', trim: 'black', wood: 'oak', wrap: 'leather', wrapColor: '#3a2a1a' }],
        ['mace', 'Flanged mace', 'axes', { length: 0.66, size: 1, shape: 0.5, metal: 'steel', trim: 'gold', wood: 'ebony', wrap: 'leather', wrapColor: '#5a2a1a' }],
        ['morningstar', 'Morning star', 'axes', { length: 0.78, size: 1, shape: 0.5, metal: 'iron', trim: 'black', wood: 'walnut', wrap: 'cord', wrapColor: '#2a1d15' }],
        ['spear', 'Spear', 'polearms', { length: 2.1, size: 1, shape: 0.5, metal: 'steel', trim: 'bronze', wood: 'ash', wrap: 'cord', wrapColor: '#6e4426' }],
        ['halberd', 'Halberd', 'polearms', { length: 2.2, size: 1, shape: 0.5, metal: 'steel', trim: 'black', wood: 'oak', wrap: 'leather', wrapColor: '#2a1d15' }],
        ['glaive', 'Glaive', 'polearms', { length: 2.05, size: 1, shape: 0.45, metal: 'steel', trim: 'gold', wood: 'walnut', wrap: 'leather', wrapColor: '#5a2a1a' }],
        ['trident', 'Trident', 'polearms', { length: 1.9, size: 1, shape: 0.5, metal: 'bronze', trim: 'gold', wood: 'pale', wrap: 'cord', wrapColor: '#2a4a6a' }],
        ['scythe', 'War scythe', 'polearms', { length: 1.8, size: 1, shape: 0.55, metal: 'dark', trim: 'silver', wood: 'ebony', wrap: 'leather', wrapColor: '#1b1b22' }]
    ];
    const FAMILY = {
        handaxe: { range: [0.35, 0.95], R: 0.0155, grip: [0.035, 0.14], shape: 'Beard', icon: 'axe' },
        battleaxe: { range: [0.8, 1.6], R: 0.017, grip: [0.05, 0.17], shape: 'Bit width', icon: 'axe' },
        warhammer: { range: [0.45, 1.2], R: 0.0155, grip: [0.035, 0.14], shape: 'Spike length', icon: 'hammer' },
        maul: { range: [0.9, 1.6], R: 0.019, grip: [0.05, 0.17], shape: 'Head length', icon: 'hammer' },
        mace: { range: [0.45, 0.95], R: 0.0155, grip: [0.035, 0.14], shape: 'Flange reach', icon: 'mace' },
        morningstar: { range: [0.5, 1.05], R: 0.016, grip: [0.035, 0.14], shape: 'Spike length', icon: 'mace' },
        spear: { range: [1.4, 3], R: 0.0145, grip: [0.3, 0.36], shape: 'Blade width', icon: 'spear' },
        halberd: { range: [1.6, 2.6], R: 0.016, grip: [0.24, 0.3], shape: 'Blade height', icon: 'polearm' },
        glaive: { range: [1.5, 2.6], R: 0.016, grip: [0.24, 0.3], shape: 'Curve', icon: 'polearm' },
        trident: { range: [1.4, 2.4], R: 0.0155, grip: [0.3, 0.36], shape: 'Tine spread', icon: 'trident' },
        scythe: { range: [1.3, 2.2], R: 0.016, grip: [0.08, 0.15], shape: 'Curve', icon: 'scythe' }
    };
    const PRESET_BY_ID = new Map(PRESETS.map(p => [p[0], p[3]]));
    const IDS = PRESETS.map(p => p[0]);

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, IDS, 'handaxe'), base = PRESET_BY_ID.get(preset), fam = FAMILY[preset];
        const v = (key) => (r[key] !== undefined ? r[key] : base[key]);
        return {
            kind: 'hafted', preset,
            length: clamp(v('length'), fam.range[0], fam.range[1], base.length), size: clamp(v('size'), 0.6, 1.6, 1), shape: clamp(v('shape'), 0, 1, base.shape),
            metal: pick(v('metal'), K.METALS.map(m => m[0]), 'steel'), trim: pick(v('trim'), K.TRIMS.map(m => m[0]), 'steel'),
            wood: pick(v('wood'), K.WOODS.map(m => m[0]), 'ash'), wrap: pick(v('wrap'), WRAPS.map(m => m[0]), 'leather'), wrapColor: color(v('wrapColor'), '#4a2c1c'),
            runes: pick(r.runes, RUNES.map(m => m[0]), 'none'), glow: color(r.glow, '#58c8ff')
        };
    }

    // ── heads ───────────────────────────────────────────────────────────────
    // Each builds round its eye at x = 0 on the haft's axis (moved up the haft by the caller) into `H`
    // (Head, Edge, Fittings, Runes lists), and says how far above the eye it reaches (`above`), where its
    // edge is and where runes go.
    const T = (m, dx, dy, dz) => K.apply(m, p => [p[0] + dx, p[1] + (dy || 0), p[2] + (dz || 0)]);

    /** An axe's bit toward -y from the eye: outline points tagged 'edge' along the cutting edge. */
    function bit(outline, D, tIn, tOut, holes, s) {
        // Half thickness falls from tIn at the haft's line to tOut at the edge's depth: each cheek a flat plane.
        const t = (x, y) => tOut + (tIn - tOut) * (y + D) / D;
        const bevel = 0.011 * Math.min(1, s || 1), out = K.plate(outline, { t, bevel, chamfer: 0.0016, edge: 0.0004, holes });
        // An etched line just inside the bevel, along the cutting edge, on both cheeks.
        const O = K.wind(outline, true), n = O.length, inner = K.offsetLeft(O, i => (O[i].tag === 'edge' ? bevel + 0.0075 * (s || 1) : 0));
        let start = 0; while (start < n && !(O[start].tag === 'edge' && O[(start + n - 1) % n].tag !== 'edge')) start++;
        const run = [];
        for (let k = 0; k < n && O[(start + k) % n].tag === 'edge'; k++) run.push(inner[(start + k) % n]);
        const ty = (tIn - tOut) / D, lines = [];
        for (let k = 1; k + 2 < run.length; k++) for (const sz of [1, -1]) {
            const a = run[k], b = run[k + 1], za = t(a[0], a[1]) + 0.0001, zb = t(b[0], b[1]) + 0.0001;
            lines.push(K.bar([a[0], a[1], sz * za], [b[0], b[1], sz * zb], K.vec.norm([0, -ty, sz]), 0.0009, 0.0004));
        }
        out.etch = lines.length ? Mesh.merge(lines) : null;
        return out;
    }
    /** A socket block round the eye, chamfered, `x0..x1` along the haft, `y0..y1` across, `R` the haft. */
    function socket(x0, x1, y0, y1, R, wall) {
        return CM.chamferBox([(x0 + x1) / 2, (y0 + y1) / 2, 0], [x1 - x0, y1 - y0, 2 * (R + (wall ?? 0.0055))], 0.0028);
    }
    /** Langets down the haft from `x0`, `len` long, on both flats, riveted; returns where runes may run. */
    function langets(H, x0, len, R, n) {
        const w = 0.011, h = 0.0026;
        for (const s of [1, -1]) {
            H.Fittings.push(K.bar([x0 + 0.004, 0, s * (R + h / 2)], [x0 - len, 0, s * (R + h / 2)], [0, 0, s], w, h));
            H.Fittings.push(K.spike([x0 - len, 0, s * (R + h / 2)], [-1, 0, 0], w * 0.5, 0.012, 4, { phase: Math.PI / 4 }));
            for (let k = 0; k < (n || 2); k++) H.Fittings.push(K.rivet([x0 - len * (0.2 + 0.65 * k / Math.max(1, (n || 2) - 1)), 0, s * (R + h)], [0, 0, s], 0.0032));
        }
        return { x0: x0 - len * 0.32, x1: x0 - len * 0.8, z: R + h };
    }

    const HEADS = {
        handaxe(r, H, R) {
            const s = r.size, sh = r.shape, D = 0.125 * s, toe = 0.068 * s, beard = (0.025 + 0.095 * sh) * s, ex = 0.03;
            const out = K.path(
                K.quad([ex * 0.95, -0.02], [ex + 0.18 * (toe - ex), -D * 0.62], [toe, -D], 8),
                { tag: 'edge', pts: K.cubic([toe, -D], [toe * 0.4, -D - 0.02 * s], [-beard * 0.35, -D - 0.02 * s], [-beard, -D + 0.006 * s], 16) },
                K.quad([-beard, -D + 0.006 * s], [-beard * 0.2, -D * 0.55], [-ex * 0.95, -0.021], 8), [[-ex * 0.95, -0.006], [ex * 0.95, -0.006]]);
            const b = bit(out, D, 0.0125, 0.0032, [{ pts: K.circle(0.004, -D * 0.42, 0.0065 * s, 10), chamfer: 0.0012 }], s);
            H.Head.push(b.body); H.Edge.push(b.edge); H.Etch.push(b.etch);
            H.Head.push(socket(-ex, ex, -0.024, 0.03, R));
            // The poll: a short hammer face behind the eye.
            H.Head.push(CM.chamferBox([0, 0.036, 0], [ex * 1.6, 0.014, 2 * (R + 0.004)], 0.0022));
            for (const z of [1, -1]) for (const x of [-ex * 0.5, ex * 0.5]) H.Fittings.push(K.rivet([x, 0.014, z * (R + 0.0055)], [0, 0, z], 0.003));
            return { forge: q => 0.85 * (1 - (Math.abs(q[1]) - 0.03) / 0.06), eyeTop: ex, above: Math.max(toe + 0.004, ex + 0.008), edge: [(toe - beard) / 2, -D - 0.012 * s, 0], runes: { from: [-0.004, -0.04 * s], dir: [0, -1], count: 3, size: 0.012 * s, t: [0.0125, 0.0032, D] }, collar: -ex };
        },
        battleaxe(r, H, R) {
            const s = r.size, sh = r.shape, D = (0.15 + 0.05 * sh) * s, horn = (0.08 + 0.06 * sh) * s, wx = 0.038;
            const out = K.path(
                K.quad([wx, -0.02], [wx * 1.15, -D * 0.55], [horn, -D], 10),
                { tag: 'edge', pts: K.cubic([horn, -D], [horn * 0.5, -D - 0.045 * s], [-horn * 0.5, -D - 0.045 * s], [-horn, -D], 20) },
                K.quad([-horn, -D], [-wx * 1.15, -D * 0.55], [-wx, -0.02], 10), [[-wx, -0.006], [wx, -0.006]]);
            const b = bit(out, D, 0.012, 0.003, [{ pts: K.circle(0, -D * 0.6, 0.016 * s, 14) }, { pts: K.circle(0, -D * 0.6, 0.006 * s, 8).map(p => [p[0] + 0.03 * s, p[1] + 0.01 * s]) }, { pts: K.circle(0, -D * 0.6, 0.006 * s, 8).map(p => [p[0] - 0.03 * s, p[1] + 0.01 * s]) }], s);
            H.Head.push(b.body, K.mirror(b.body, 1)); H.Edge.push(b.edge, K.mirror(b.edge, 1)); H.Etch.push(b.etch, b.etch && K.mirror(b.etch, 1));
            H.Head.push(socket(-wx - 0.004, wx + 0.004, -0.026, 0.026, R, 0.007));
            // A crowning spike and a ring under it.
            H.Fittings.push(K.band([wx + 0.003, 0, 0], [1, 0, 0], 0.011, 0.01, 0.003));
            H.Head.push(K.spike([wx + 0.012, 0, 0], [1, 0, 0], 0.012, 0.05 * s, 4, { phase: Math.PI / 4 }));
            for (const z of [1, -1]) for (const y of [-0.014, 0.014]) for (const x of [-wx * 0.5, wx * 0.5]) H.Fittings.push(K.rivet([x, y, z * (R + 0.007)], [0, 0, z], 0.0028));
            return { forge: q => 0.85 * (1 - (Math.abs(q[1]) - 0.032) / 0.07), above: wx + 0.012 + 0.05 * s, edge: [0, -D - 0.035 * s, 0], runes: { from: [-0.03 * s, -D * 0.3], dir: [1, 0], count: 4, size: 0.014 * s, t: [0.012, 0.003, D] }, collar: -wx - 0.004 };
        },
        warhammer(r, H, R) {
            const s = r.size, sh = r.shape, f = 0.034 * s, depth = 0.06 * s, ex = 0.035;
            H.Head.push(socket(-ex, ex, -0.024, 0.024, R));
            // The hammer: a six-sided neck flaring to a crowned face cut in a waffle of little pyramids, a collar round its waist.
            const L0 = 0.024, face = -L0 - depth - 0.02;
            H.Head.push(K.facet(Mesh.lathe([[0, 0], [f * 0.34, 0], [f * 0.34, 0.006], [f * 0.3, 0.012], [f * 0.32, depth * 0.45], [f * 0.46, depth + 0.012], [f * 0.52, depth + 0.016], [f * 0.52, depth + 0.019], [f * 0.47, depth + 0.02], [0, depth + 0.02]], 6, { base: [0, -L0 + 0.002, 0], dir: [0, -1, 0], phase: Math.PI / 6, sharp: 2 })));
            H.Fittings.push(K.facet(Mesh.lathe([[0, 0], [f * 0.38, 0], [f * 0.4, 0.002], [f * 0.4, 0.007], [f * 0.38, 0.009], [0, 0.009]], 6, { base: [0, -L0 - 0.008, 0], dir: [0, -1, 0], phase: Math.PI / 6, sharp: 2 })));
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) H.Edge.push(K.spike([i * f * 0.25, face + 0.0005, j * f * 0.25], [0, -1, 0], f * 0.14, 0.006, 4, { phase: Math.PI / 4 }));
            // The beak behind: a diamond spike curving down toward the hand.
            const len = (0.07 + 0.11 * sh) * s;
            const beak = K.ridge({ length: len, steps: 14, top: q => 0.011 * s * (1 - q / len * 0.85), bot: q => -0.011 * s * (1 - q / len * 0.85), h: q => 0.009 * s * (1 - q / len * 0.9), bevel: 0.2, mid: q => 0.35 * len * Math.pow(q / len, 2) });
            for (const m of [beak.body, beak.edge]) if (m) (m === beak.body ? H.Head : H.Edge).push(K.apply(m, K.rotZ(Math.PI / 2, [0, 0.02, 0])));
            H.Head.push(K.spike([ex, 0, 0], [1, 0, 0], 0.011, 0.045 * s, 4, { phase: Math.PI / 4 }));
            for (const z of [1, -1]) for (const x of [-ex * 0.5, ex * 0.5]) H.Fittings.push(K.rivet([x, 0.006, z * (R + 0.0055)], [0, 0, z], 0.003));
            const lg = langets(H, -ex, 0.17, R, 3);
            return { forge: q => q[1] < -0.024 ? 0.55 * (1 - (-q[1] - 0.024) / 0.05) : 0, above: ex + 0.045 * s, edge: [0, face - 0.006, 0], runes: { flat: true, from: [0.024, -0.05 - depth * 0.15, f / 2], dir: [0, -1, 0], n: [0, 0, 1], count: 2, size: f * 0.55 }, langet: lg, collar: null };
        },
        maul(r, H, R) {
            const s = r.size, sh = r.shape, a = 0.095 * s, Y = (0.19 + 0.12 * sh) * s;
            H.Head.push(CM.chamferBox([0, 0, 0], [a, Y, a], 0.008 * s));
            for (const sy of [1, -1]) {
                const yb = sy * (Y / 2 - 0.028 * s);
                H.Fittings.push(CM.chamferBox([0, yb, 0], [a + 0.007, 0.02 * s, a + 0.007], 0.0025));
                H.Edge.push(CM.chamferBox([0, sy * (Y / 2 + 0.003), 0], [a * 0.78, 0.008, a * 0.78], 0.003));
                for (const [ax, sg] of [[0, 1], [0, -1], [2, 1], [2, -1]]) for (const o of [-0.022 * s, 0.022 * s]) {
                    const at = [0, yb, 0], n = [0, 0, 0]; at[ax] = sg * (a / 2 + 0.0035); at[ax === 0 ? 2 : 0] = o; n[ax] = sg;
                    H.Fittings.push(K.rivet(at, n, 0.0042 * s));
                }
            }
            // A riveted diamond on each cheek.
            const dia = K.plate([[0, -a * 0.36], [a * 0.36, 0], [0, a * 0.36], [-a * 0.36, 0]], { t: () => 0.0025, chamfer: 0.0012 });
            for (const z of [1, -1]) { H.Fittings.push(K.apply(K.copy(dia.body), p => [p[0], p[1], z * (a / 2 + 0.0012) + p[2]])); H.Fittings.push(K.rivet([0, 0, z * (a / 2 + 0.0036)], [0, 0, z], 0.007 * s)); }
            const lg = langets(H, -a / 2, 0.2, R, 3);
            return { above: a / 2, edge: [0, -Y / 2 - 0.007, 0], runes: { flat: true, from: [-a * 0.14, -Y / 2 + 0.048 * s, a / 2], dir: [1, 0, 0], n: [0, 0, 1], count: 2, size: a * 0.24 }, langet: lg, collar: null };
        },
        mace(r, H, R) {
            const s = r.size, sh = r.shape, F = (0.034 + 0.03 * sh) * s, lo = -0.05 * s, hi = 0.06 * s;
            H.Head.push(Mesh.lathe([[R + 0.003, lo - 0.02], [R + 0.006, lo - 0.004], [0.021 * s, lo + 0.01 * s], [0.023 * s, 0.01 * s], [0.02 * s, hi - 0.008 * s], [0.012 * s, hi + 0.004 * s], [0, hi + 0.006 * s]].map(([a, b]) => [a, b]), 20, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.75 }));
            const N = 7;
            // A gothic flange: a low lobe, a notch, then a tall point swept back toward the top.
            const fa = lo, f1 = [fa + 0.03 * s, F * 0.8], notch = [fa + 0.052 * s, F * 0.6], peak = [fa + 0.09 * s, F];
            const flange = K.path([[fa + 0.004, F * 0.3]], { tag: 'edge', pts: K.cubic([fa + 0.004, F * 0.3], [fa + 0.002, F * 0.55], [fa + 0.014 * s, F * 0.82], f1, 8) },
                { tag: 'edge', pts: K.cubic(f1, [fa + 0.042 * s, F * 0.78], [fa + 0.046 * s, F * 0.62], notch, 6) }, { tag: 'edge', pts: K.cubic(notch, [fa + 0.06 * s, F * 0.74], [fa + 0.07 * s, F * 1.02], peak, 10) },
                K.cubic(peak, [fa + 0.1 * s, F * 0.95], [hi - 0.004, F * 0.5], [hi - 0.006, F * 0.42], 10), [[hi - 0.01, F * 0.15], [fa + 0.004, F * 0.15]]);
            const fl = K.plate(flange, { t: () => 0.0042 * s, bevel: 0.004 * s, chamfer: 0.0012, edge: 0.0007 });
            for (let k = 0; k < N; k++) {
                const a = Math.PI + k * 2 * Math.PI / N;
                H.Head.push(K.apply(K.copy(fl.body), K.rotX(a))); H.Edge.push(K.apply(K.copy(fl.edge), K.rotX(a)));
            }
            H.Fittings.push(K.band([lo - 0.022, 0, 0], [1, 0, 0], R + 0.002, 0.012, 0.003));
            H.Fittings.push(Mesh.lathe([[0.011 * s, 0], [0.014 * s, 0.006 * s], [0.012 * s, 0.014 * s], [0.004 * s, 0.024 * s], [0, 0.026 * s]], 12, { base: [hi + 0.002 * s, 0, 0], dir: [1, 0, 0], sharp: 0.7 }));
            const lg = langets(H, lo - 0.022, 0.13, R, 2);
            return { above: hi + 0.028 * s, edge: [0.012 * s, -F, 0], runes: null, langet: lg, collar: null };
        },
        morningstar(r, H, R) {
            const s = r.size, sh = r.shape, rad = 0.046 * s, len = (0.022 + 0.04 * sh) * s;
            H.Head.push(Mesh.sphere([0, 0, 0], rad, 28));
            // Straps over the ball, riveted where they cross; spikes between them.
            H.Fittings.push(K.band([-0.006 * s, 0, 0], [1, 0, 0], rad * 0.985, 0.012 * s, 0.0025));
            H.Fittings.push(K.band([0, 0, -0.006 * s], [0, 0, 1], rad * 0.985, 0.012 * s, 0.0025));
            for (const [x, z] of [[rad, 0], [0, rad], [0, -rad]]) H.Fittings.push(K.rivet([x + (x ? 0.002 : 0), 0, z + Math.sign(z) * 0.002], x ? [1, 0, 0] : [0, 0, Math.sign(z)], 0.005 * s));
            const n = 18, gold = Math.PI * (3 - Math.sqrt(5));
            let best = null;
            for (let k = 0; k < n; k++) {
                const y = 1 - (k + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = k * gold;
                const d = [y, rr * Math.cos(a), rr * Math.sin(a)];
                if (d[0] < -0.55) continue;
                // Keep clear of the straps.
                if (Math.abs(d[0]) < 0.12 || Math.abs(d[2]) < 0.12) continue;
                const base = d.map(v => v * rad * 0.9);
                H.Edge.push(K.spike(base, d, 0.0085 * s, len + rad * 0.1, 4, { collar: true }));
                if (!best || d[1] < best[1]) best = d;
            }
            H.Head.push(K.spike([rad * 0.95, 0, 0], [1, 0, 0], 0.009 * s, len + rad * 0.12, 4, { collar: true }));
            H.Head.push(Mesh.lathe([[R + 0.004, -rad - 0.03], [R + 0.006, -rad - 0.012], [0.02 * s, -rad * 0.75]], 16, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.7 }));
            H.Fittings.push(K.band([-rad - 0.034, 0, 0], [1, 0, 0], R + 0.002, 0.012, 0.003));
            const lg = langets(H, -rad - 0.034, 0.12, R, 2);
            return { above: rad + len + rad * 0.1, edge: best ? best.map(v => v * (rad + len)) : [0, -rad - len, 0], runes: null, langet: lg, collar: null };
        },
        spear(r, H, R) {
            const s = r.size, sh = r.shape, Lb = 0.27 * s, w = (0.02 + 0.024 * sh) * s, x0 = 0.0;
            const leaf = u => (u < 0.32 ? 0.5 + 0.5 * Math.sin(u / 0.32 * Math.PI / 2) : Math.pow(Math.cos((u - 0.32) / 0.68 * Math.PI / 2), 0.85));
            const blade = K.ridge({ length: Lb, steps: 22, top: q => w * leaf(q / Lb), bot: q => -w * leaf(q / Lb), h: q => 0.0065 * s * (1 - 0.8 * q / Lb), bevel: 0.24 });
            H.Head.push(T(blade.body, x0)); H.Edge.push(T(blade.edge, x0));
            // The socket: a cone with two molded rings, pinned through.
            const sl = 0.11 * s;
            H.Head.push(Mesh.lathe([[R + 0.0025, -sl], [R + 0.0035, -sl + 0.008], [R + 0.0012, -sl + 0.014], [0.0105, -0.012], [0.0075, 0.012]], 20, { base: [x0, 0, 0], dir: [1, 0, 0], sharp: 0.8 }));
            H.Fittings.push(K.band([x0 - sl * 0.55, 0, 0], [1, 0, 0], R + 0.0006, 0.007, 0.0022));
            H.Fittings.push(K.band([x0 - sl + 0.016, 0, 0], [1, 0, 0], R + 0.0012, 0.006, 0.0022));
            for (const z of [1, -1]) H.Fittings.push(K.rivet([x0 - sl * 0.75, 0, z * (R + 0.002)], [0, 0, z], 0.0028));
            // Wings at the socket's foot, square to the blade.
            const wing = K.plate([[0, 0], [0.026 * s, 0.0], [0.004 * s, 0.03 * s], [-0.006 * s, 0.026 * s]], { t: () => 0.0028, chamfer: 0.001 });
            for (const sz of [1, -1]) H.Head.push(K.apply(K.copy(wing.body), p => [x0 - sl * 0.5 + p[0], p[2], sz * (R + 0.001 + p[1])], sz > 0));
            const lg = langets(H, x0 - sl + 0.004, 0.16, R, 2);
            return { forge: q => 0.8 * (1 - (q[0] + 0.01) / 0.09), above: Lb, edge: [Lb * 0.35, -w, 0], tip: [Lb, 0, 0], runes: null, langet: lg, collar: null };
        },
        halberd(r, H, R) {
            const s = r.size, sh = r.shape, D = 0.17 * s, top = (0.08 + 0.05 * sh) * s, low = (0.11 + 0.07 * sh) * s, ex = 0.06;
            const out = K.path([[ex * 0.9, -0.02], [top * 0.75, -D * 0.55]], { tag: 'edge', pts: K.quad([top, -D], [(top - low) / 2, -D - 0.012 * s], [-low, -D + 0.004 * s], 14) }, K.quad([-low, -D + 0.004 * s], [-ex, -D * 0.4], [-ex * 0.9, -0.02], 8), [[-ex * 0.9, -0.006], [ex * 0.9, -0.006]]);
            const cx = -0.008 * s, cy = -D * 0.48, holes = [0, 1, 2].map(k => { const a = Math.PI / 2 + k * 2 * Math.PI / 3; return { pts: K.circle(cx + Math.cos(a) * 0.012 * s, cy + Math.sin(a) * 0.012 * s, 0.0068 * s, 10), chamfer: 0.0011 }; });
            const b = bit(out, D, 0.011, 0.003, holes, s);
            H.Head.push(b.body); H.Edge.push(b.edge); H.Etch.push(b.etch);
            H.Head.push(socket(-ex, ex, -0.022, 0.022, R, 0.005));
            // The back hook and the long top spike.
            const len = 0.1 * s;
            const hook = K.ridge({ length: len, steps: 12, top: q => 0.012 * s * (1 - q / len * 0.85), bot: q => -0.01 * s * (1 - q / len * 0.85), h: q => 0.0065 * s * (1 - q / len * 0.8), mid: q => 0.4 * len * Math.pow(q / len, 2) });
            for (const m of [hook.body, hook.edge]) (m === hook.body ? H.Head : H.Edge).push(K.apply(m, K.rotZ(Math.PI / 2, [-0.01, 0.02, 0])));
            const sp = 0.34 * s;
            const spike = K.ridge({ length: sp, steps: 16, top: q => 0.016 * s * (1 - q / sp), bot: q => -0.016 * s * (1 - q / sp), h: q => 0.0075 * s * (1 - q / sp * 0.9), bevel: 0.25 });
            H.Head.push(T(spike.body, ex - 0.004)); H.Edge.push(T(spike.edge, ex - 0.004));
            H.Fittings.push(K.band([ex - 0.012, 0, 0], [1, 0, 0], 0.0115, 0.012, 0.003));
            for (const z of [1, -1]) for (const x of [-ex * 0.6, 0, ex * 0.6]) H.Fittings.push(K.rivet([x, 0.01, z * (R + 0.005)], [0, 0, z], 0.003));
            const lg = langets(H, -ex, 0.34, R, 4);
            return { forge: q => q[0] > ex ? 0.7 * (1 - (q[0] - ex) / 0.08) : 0.85 * (1 - (Math.abs(q[1]) - 0.026) / 0.06), above: ex - 0.004 + sp, edge: [(top - low) / 2, -D - 0.008 * s, 0], runes: { from: [-0.05 * s, -D * 0.82], dir: [1, 0], count: 4, size: 0.011 * s, t: [0.011, 0.003, D] }, langet: lg, collar: null };
        },
        glaive(r, H, R) {
            const s = r.size, sh = r.shape, Lb = 0.5 * s, w = 0.06 * s;
            const blade = K.ridge({
                length: Lb, steps: 26, single: true, ridgeAt: 0.3,
                top: q => 0.012 * s * (1 - 0.6 * q / Lb), bot: q => { const u = q / Lb; return -(0.016 * s + (w - 0.016 * s) * Math.pow(Math.sin(Math.min(1, u * 1.15) * Math.PI), 0.7) * (u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15 * 0.2)); },
                h: q => 0.0055 * s * (1 - 0.6 * q / Lb), mid: q => sh * 0.16 * Lb * Math.pow(q / Lb, 2.2), bevel: 0.3
            });
            H.Head.push(blade.body); H.Edge.push(blade.edge);
            // A spur off the spine, and the socket.
            const spur = K.plate([[0.02 * s, 0.006], [0.06 * s, 0.006], [0.05 * s, 0.03 * s], [0.07 * s, 0.05 * s], [0.035 * s, 0.028 * s]], { t: () => 0.0035 * s, chamfer: 0.0012 });
            H.Head.push(spur.body);
            const sl = 0.12;
            H.Head.push(Mesh.lathe([[R + 0.0028, -sl], [R + 0.004, -sl + 0.008], [R + 0.0015, -sl + 0.014], [0.0135 * Math.max(1, s), -0.008], [0.011, 0.012]], 20, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.8 }));
            H.Fittings.push(K.band([-0.006, 0, 0], [1, 0, 0], 0.012 * Math.max(1, s), 0.009, 0.003));
            H.Fittings.push(K.band([-sl * 0.55, 0, 0], [1, 0, 0], R + 0.0012, 0.008, 0.0024));
            const lg = langets(H, -sl + 0.004, 0.18, R, 3);
            return { forge: q => 0.8 * (1 - (q[0] + 0.01) / 0.1), above: Lb + 0.004, edge: [Lb * 0.45, -w, 0], tip: [Lb, sh * 0.16 * Lb, 0], runes: null, langet: lg, collar: null };
        },
        trident(r, H, R) {
            const s = r.size, sh = r.shape, Wd = (0.055 + 0.045 * sh) * s, tl = 0.2 * s;
            const bar = K.cubic([0.05 * s, -Wd], [-0.01, -Wd * 0.7], [-0.01, Wd * 0.7], [0.05 * s, Wd], 16).map(([x, y]) => [x, y, 0]);
            H.Head.push(K.sweep(bar, K.roundRect(0.014 * s, 0.016 * s, 0.004 * s, 2), { up: [0, 0, 1] }));
            // Outer tines: square in section, tapering to a point, with a barb on their outer side.
            for (const sy of [1, -1]) {
                const pts = [];
                for (let k = 0; k <= 14; k++) { const u = k / 14; pts.push([0.05 * s + u * tl, sy * (Wd + 0.008 * s * Math.sin(u * Math.PI)), 0]); }
                H.Head.push(K.sweep(pts, k => { const q = 0.0075 * s * (1 - Math.pow(k / 14, 1.3)) + 0.0002; return [[q, 0], [0, q], [-q, 0], [0, -q]]; }, { up: [0, 0, 1], cos: K.COS.crisp }));
                const barb = K.plate([[0, 0], [0.012 * s, 0], [-0.02 * s, 0.016 * s]], { t: () => 0.0025 * s, chamfer: 0.0008 });
                H.Edge.push(K.apply(barb.body, p => [0.05 * s + tl * 0.62 + p[0], sy * (Wd + 0.004 * s + p[1]), p[2]], sy < 0));
            }
            const cl = 0.27 * s;
            const mid = K.ridge({ length: cl, steps: 18, top: q => 0.012 * s * (1 - q / cl) + 0.004 * s * Math.sin(q / cl * Math.PI), bot: q => -(0.012 * s * (1 - q / cl) + 0.004 * s * Math.sin(q / cl * Math.PI)), h: q => 0.0065 * s * (1 - 0.85 * q / cl), bevel: 0.25 });
            H.Head.push(T(mid.body, -0.004)); H.Edge.push(T(mid.edge, -0.004));
            for (const sy of [1, -1]) { const barb = K.plate([[0, 0], [0.012 * s, 0], [-0.022 * s, 0.014 * s]], { t: () => 0.0025 * s, chamfer: 0.0008 }); H.Edge.push(K.apply(barb.body, p => [cl * 0.68 + p[0], sy * (0.008 * s + p[1]), p[2]], sy < 0)); }
            const sl = 0.1;
            H.Head.push(Mesh.lathe([[R + 0.0025, -sl], [R + 0.0035, -sl + 0.008], [R + 0.0012, -sl + 0.014], [0.012 * s, -0.01], [0.009 * s, 0.006]], 20, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.8 }));
            H.Fittings.push(K.band([-sl * 0.5, 0, 0], [1, 0, 0], R + 0.0008, 0.008, 0.0024));
            const lg = langets(H, -sl + 0.004, 0.15, R, 2);
            return { above: cl - 0.004, edge: [0.05 * s + tl, -Wd, 0], tip: [cl - 0.004, 0, 0], runes: null, langet: lg, collar: null };
        },
        scythe(r, H, R) {
            const s = r.size, sh = r.shape, Lb = 0.6 * s, w = 0.075 * s;
            const blade = K.ridge({
                length: Lb, steps: 28, single: true, ridgeAt: 0.25,
                top: q => 0.01 * s * (1 - 0.7 * q / Lb), bot: q => { const u = q / Lb; return -(w * (u < 0.1 ? 0.75 + 2.5 * u : Math.pow(1 - (u - 0.1) / 0.9, 0.75))); },
                h: q => 0.0055 * s * (1 - 0.7 * q / Lb), mid: q => -(0.1 + 0.22 * sh) * Lb * Math.pow(q / Lb, 2), bevel: 0.32
            });
            // Out from the top of the haft, square to it, the edge facing down the haft.
            const turn = K.rotZ(-Math.PI / 2, [0, -0.012, 0]);
            H.Head.push(K.apply(blade.body, turn)); H.Edge.push(K.apply(blade.edge, turn));
            H.Head.push(CM.chamferBox([-0.02, -0.004, 0], [0.07, 0.05, 2 * (R + 0.006)], 0.003));
            H.Fittings.push(CM.chamferBox([0.019, -0.004, 0], [0.008, 0.056, 2 * (R + 0.008)], 0.002));
            // A brace from the blade's heel to the haft.
            for (const z of [1, -1]) H.Fittings.push(K.bar([-0.03, -0.05 * s, z * 0.005], [-0.14, -0.004, z * (R + 0.001)], [0, 0, z], 0.008, 0.003));
            for (const z of [1, -1]) for (const x of [-0.04, -0.005]) H.Fittings.push(K.rivet([x, 0.01, z * (R + 0.006)], [0, 0, z], 0.003));
            const tipY = -(0.012 + Lb), tipX = -(0.1 + 0.22 * sh) * Lb;
            return { forge: q => 0.8 * (1 - (-q[1] - 0.04) / 0.12), above: 0.02, edge: [tipX * 0.3 - w * 0.6, -0.012 - Lb * 0.45, 0], tip: [0.016, 0, 0], runes: { flat: true, from: [-0.008, -0.02 - 0.12 * s, 0.0055 * s * 0.85], dir: [0, -1, 0], n: [0, 0, 1], count: 4, size: 0.012 * s }, nib: true, tipY, collar: null };
        }
    };

    // ── the build ──────────────────────────────────────────────────────────
    function build(recipe, cache) {
        const r = normalize(recipe), c = cache || {}, fam = FAMILY[r.preset], L = r.length, R = fam.R;
        const H = { Head: [], Edge: [], Etch: [], Fittings: [], Haft: [], Grip: [], Runes: [] };
        const head = HEADS[r.preset](r, H, R);
        const xH = L - head.above;
        for (const k of ['Head', 'Edge', 'Etch', 'Fittings']) H[k] = H[k].filter(Boolean).map(m => T(m, xH));
        // The haft: a little swell at the butt of a one-handed weapon, an even pole otherwise, oval toward the edge.
        const pole = L > 1.3, top = r.preset === 'scythe' ? L - 0.002 : head.eyeTop ? xH + head.eyeTop + 0.006 : xH + Math.min(0.03, head.above * 0.5);
        const radius = t => R * (pole ? 1.03 - 0.07 * t : 1.04 - 0.1 * t + 0.22 * Math.exp(-Math.pow(t * L / 0.03, 2)));
        const haft = K.shaft([0, 0, 0], [top, 0, 0], t => radius(t), 14, { steps: pole ? 16 : 22, v: 0.5 });
        K.apply(haft, p => [p[0], p[1] * 1.1, p[2]]);
        H.Haft.push(haft);
        // The haft's end grain shows above an axe's eye, split by an iron wedge.
        if (head.eyeTop) H.Fittings.push(K.bar([top + 0.0004, -R * 1.02, 0], [top + 0.0004, R * 1.02, 0], [1, 0, 0], 0.0032, 0.0016));
        // A wedge across the haft's top end (seen above an axe's eye) and a ring under the head.
        if (head.collar !== undefined && head.collar !== null) H.Fittings.push(K.band([xH + head.collar - 0.012, 0, 0], [1, 0, 0], R * 1.02, 0.01, 0.0026));
        // The butt: a pommel cap for one hand, a spiked ferrule for a pole.
        if (pole) {
            H.Fittings.push(Mesh.lathe([[R * 0.9, 0.006], [R * 1.22, 0.014], [R * 1.22, 0.024], [R * 1.14, 0.03], [R * 1.14, 0.068], [R * 1.08, 0.075]], 18, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.8 }));
            H.Fittings.push(K.spike([0.008, 0, 0], [-1, 0, 0], R * 0.9, 0.045, 4, { phase: Math.PI / 4 }));
        } else {
            H.Fittings.push(Mesh.lathe([[0, -0.003], [R * 1.1, 0.0], [R * 1.38, 0.008], [R * 1.42, 0.02], [R * 1.2, 0.034], [R * 1.02, 0.04]], 16, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.7 }));
        }
        // The grip: wrapped between two bindings.
        // Where the hand closes: a fixed way up a one-handed haft, a share of a pole's length.
        const gA = pole ? fam.grip[0] * L : fam.grip[0], gB = pole ? fam.grip[1] * L : fam.grip[1];
        const gripLo = Math.max(0.03, gA - 0.04), gripHi = gB + 0.05;
        if (r.wrap !== 'none') {
            const rr = t => radius((gripLo + (gripHi - gripLo) * t) / top) + 0.0016;
            const sleeve = K.shaft([gripLo, 0, 0], [gripHi, 0, 0], t => rr(t) * (t < 0.04 ? 0.94 + 1.5 * t : t > 0.96 ? 0.94 + 1.5 * (1 - t) : 1), 16, { steps: 12, v: gripHi - gripLo });
            K.apply(sleeve, p => [p[0], p[1] * 1.1, p[2]]);
            H.Grip.push(sleeve);
            if (r.wrap === 'leather') H.Grip.push(K.apply(K.strap([gripLo + 0.006, 0, 0], [gripHi - 0.006, 0, 0], rr(0.5) + 0.0004, (gripHi - gripLo) / 0.024, 0.0011, { sides: 6 }), p => [p[0], p[1] * 1.1, p[2]]));
            for (const x of [gripLo, gripHi - 0.008]) H.Fittings.push(K.apply(K.band([x, 0, 0], [1, 0, 0], rr(0.5) - 0.0008, 0.008, 0.0016), p => [p[0], p[1] * 1.1, p[2]]));
        }
        // The nib of a scythe: a short handle out from the haft, halfway up.
        if (head.nib) {
            const nx = L * 0.56;
            H.Haft.push(Mesh.lathe([[0.012, 0], [0.0125, 0.06], [0.0135, 0.1], [0.011, 0.118], [0, 0.12]], 14, { base: [nx, -R * 0.6, 0], dir: [0.25, -1, 0], sharp: 0.6 }));
            H.Fittings.push(CM.chamferBox([nx, 0, 0], [0.03, 2 * R + 0.008, 2 * R + 0.008], 0.002));
        }
        // Runes: on the head's cheek, or along a langet.
        if (r.runes !== 'none') {
            const rn = head.runes, seed = IDS.indexOf(r.preset) * 7 + 3;
            if (rn && rn.t) {
                const [tIn, tOut, D] = rn.t, ty = (tIn - tOut) / D, n = K.vec.norm([0, -ty, 1]), at = (x, y) => [x + xH, y, tOut + (tIn - tOut) * (y + D) / D + 0.0002];
                const dir = K.vec.norm([rn.dir[0], rn.dir[1], ty * rn.dir[1]]);
                for (const sz of [1, -1]) {
                    const m = K.runes(at(rn.from[0], rn.from[1]), dir, n, rn.count, rn.size, seed, { w: rn.size * 0.13, h: 0.0006 });
                    H.Runes.push(sz > 0 ? m : K.mirror(m, 2));
                }
            } else if (rn && rn.flat) {
                for (const sz of [1, -1]) { const m = K.runes([rn.from[0] + xH, rn.from[1], rn.from[2] + 0.0002], rn.dir, rn.n, rn.count, rn.size, seed, { w: rn.size * 0.13, h: 0.0006 }); H.Runes.push(sz > 0 ? m : K.mirror(m, 2)); }
            } else if (head.langet) {
                const lg = head.langet;
                for (const sz of [1, -1]) { const m = K.runes([lg.x0 + xH, 0, lg.z + 0.0002], [-1, 0, 0], [0, 0, 1], 4, 0.0085, seed, { w: 0.0011, h: 0.0005 }); H.Runes.push(sz > 0 ? m : K.mirror(m, 2)); }
            }
        }
        // Materials.
        const metal = K.look(r.metal), trim = K.look(r.trim), textures = {};
        const woodKey = r.wood, wrapKey = r.wrap + r.wrapColor;
        if (c.woodKey !== woodKey) { c.wood = K.woodPicture(K.WOOD[r.wood], 11 + K.WOODS.findIndex(w => w[0] === r.wood), 'haft-wood.png'); c.woodKey = woodKey; }
        textures['haft-wood.png'] = c.wood;
        if (r.wrap !== 'none') { if (c.wrapKey !== wrapKey) { c.wrap = K.wrapPicture(r.wrap, r.wrapColor, 'grip-wrap.png'); c.wrapKey = wrapKey; } textures['grip-wrap.png'] = c.wrap; }
        const glowing = r.runes === 'glowing';
        const P = {
            // Fire-darkened near the eye or socket, ground bright toward the edge.
            Head: { meshes: H.Head, look: { kind: 'metal', color: metal.color, roughness: metal.roughness, metalness: metal.metalness, mat: 'metal', tint: head.forge ? { at: p => 0.75 * Math.min(1, head.forge([p[0] - xH, p[1], p[2]])), color: K.shadeHex(metal.color, 0.42) } : null } },
            Etch: { meshes: H.Etch, look: { kind: 'metal', color: K.shadeHex(metal.color, 0.5), roughness: 0.55, metalness: 0.7, mat: 'metal' } },
            Edge: { meshes: H.Edge, look: { kind: 'metal', color: metal.edge, roughness: Math.max(0.12, metal.roughness - 0.14), metalness: metal.metalness, mat: 'metal' } },
            Fittings: { meshes: H.Fittings, look: { kind: 'metal', color: trim.color, roughness: trim.roughness, metalness: trim.metalness, mat: 'metal' } },
            Haft: { meshes: H.Haft, look: { kind: 'prop', texture: 'haft-wood.png', roughness: 0.62, metalness: 0, mat: 'wood' } },
            Grip: { meshes: H.Grip, look: { kind: 'prop', texture: 'grip-wrap.png', roughness: r.wrap === 'cord' ? 0.85 : 0.72, metalness: 0, mat: 'leather' } },
            Runes: { meshes: H.Runes, look: glowing ? { kind: 'prop', color: r.glow, emissive: r.glow, roughness: 0.4, metalness: 0 } : { kind: 'metal', color: r.trim === 'gold' || r.metal === 'gold' ? '#2a2a2e' : '#d4ad48', roughness: 0.3, metalness: 0.9, mat: 'metal' } }
        };
        const marks = {
            gripBottom: [gA, 0, 0], gripTop: [gB, 0, 0],
            tip: head.tip ? [head.tip[0] + xH, head.tip[1], head.tip[2]] : [L, 0, 0],
            edge: [head.edge[0] + xH, head.edge[1], head.edge[2]]
        };
        return K.finish('hafted', r, P, marks, textures, { template: 'blade' });
    }

    /**
     * A random hafted weapon: a family of its own (another when Everything
     * rolls), sized and shaped a little off its preset; details swap the
     * grip's wrap and the runes; colors the metal, trim, wood and wrap.
     * `keep` holds the family (Shuffle on the page).
     */
    function random(seed, recipe, scope, keep) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur));
        const all = !scope || scope === 'all', has = part => all || scope === part;
        const family = all && !keep ? R.pick(PRESETS) : PRESETS.find(p => p[0] === cur.preset);
        const base = family[3], fam = FAMILY[family[0]];
        out.preset = family[0];
        if (has('shape')) {
            out.length = Math.max(fam.range[0], Math.min(fam.range[1], R.jitter(base.length, 0.12)));
            out.size = R.jitter(1, 0.18, 0.6, 1.6); out.shape = R.range(0.1, 0.95);
        } else if (out.preset !== cur.preset) Object.assign(out, { length: base.length, size: 1, shape: base.shape });
        if (has('details')) {
            out.wrap = R.weighted([['leather', 3], ['cord', 2], ['none', 1]]);
            out.runes = R.weighted([['none', 3], ['inlaid', 1.2], ['glowing', 1]]);
        }
        if (has('colors')) {
            out.metal = R.weighted([['steel', 4], ['dark', 2], ['iron', 2], ['bronze', 1], ['gold', 0.3], ['silver', 0.6]]);
            out.trim = R.weighted([['steel', 2], ['gold', 1.2], ['bronze', 1.2], ['black', 2], ['silver', 0.6]]);
            out.wood = R.pick(K.WOODS)[0];
            out.wrapColor = R.pick(Rand.PALETTES.leather.concat(['#2a4a6a', '#5a1a1a', '#1d3a2a']));
            out.glow = R.pick(Rand.PALETTES.glow);
        }
        return normalize(out);
    }

    const api = { PRESETS, FAMILY, WRAPS, RUNES, normalize, build, random };
    root.RRHaftedProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel || (typeof require === 'function' ? require('./PropModel.js') : null);
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'hafted', label: 'Hafted weapon', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        K.icons(Catalog);
        Catalog.category({ id: 'axes', label: 'Axes & Hammers', order: 45, parent: 'weapons' });
        Catalog.category({ id: 'polearms', label: 'Spears & Polearms', order: 46, parent: 'weapons' });
        for (const [id, label, category] of PRESETS) Catalog.add({ id: 'hafted-' + id, category, label, icon: FAMILY[id].icon, kind: 'hafted', keywords: 'weapon melee ' + (category === 'axes' ? 'axe hammer mace club ' : 'polearm pole spear lance ') + id, start: () => normalize({ preset: id }), matches: r => r.preset === id });
        Catalog.ui('hafted', K.page({
            placeholder: 'Weapon', PRESETS, normalize, random,
            shape(r) {
                const fam = FAMILY[r.preset];
                return this._slider({ path: 'length', label: 'Length', range: fam.range, step: 0.01, format: 'm' })
                    + this._slider({ path: 'size', label: 'Head size', range: [0.6, 1.6], step: 0.01, format: 'x' })
                    + this._slider({ path: 'shape', label: fam.shape, range: [0, 1] });
            },
            look(r) {
                return this._section('Materials') + this._select('metal', 'Head', K.METALS) + this._select('trim', 'Fittings', K.TRIMS) + this._select('wood', 'Haft', K.WOODS)
                    + this._select('wrap', 'Grip wrap', WRAPS) + (r.wrap !== 'none' ? this._color('wrapColor', 'Wrap color', ['#4a2c1c', '#2a1d15', '#5a2a1a', '#1b1b22', '#2a4a6a']) : '')
                    + this._section('Runes') + this._select('runes', 'Runes', RUNES) + (r.runes === 'glowing' ? this._color('glow', 'Glow color', ['#58c8ff', '#ff4a3a', '#7aff6a', '#c86aff', '#ffd24a']) : '');
            }
        }));
    }
})(typeof window !== 'undefined' ? window : globalThis);
