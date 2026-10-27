/**
 * RRStaffProp - Weapons › Staffs & Wands: a wizard's caged orb, a druid's
 * living crown, a fighting quarterstaff, a cleric's sun and crescent, a
 * bone staff under a horned skull, an energy staff's floating ring, and
 * wands of wood, bone and crystal. Saved holdable.
 *
 * Built in weapon space (RRWeaponKit): the shaft along +x from its foot
 * (x = 0) to the top of its head (x = length), the head's face toward -y,
 * flats facing +-z. Shafts are swept rings: twisted and lobed for gnarled
 * wood, beaded for bone, turned and banded for the rest. Crystals and orbs
 * may glow (emissive) and, when asked, cast a light (a model.json light
 * effect at the head). The saved model lies flat, centered, with the blade
 * rig: a staff is held a little above its middle, a wand by its handle.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const CM = need('RRContainerMesh', './ContainerMesh.js');
    const Paint = need('RRPropPaint', './PropPaint.js');
    const K = need('RRWeaponKit', './WeaponKit.js');
    const { clamp, color, pick } = K;
    const { add, mul, norm } = K.vec;

    const PRESETS = [
        ['wizard', 'Wizard staff', 'staffs', { length: 1.8, size: 1, shape: 0.55, wood: 'walnut', metal: 'gold', gem: '#58c8ff', glow: true }],
        ['druid', 'Druid staff', 'staffs', { length: 1.75, size: 1, shape: 0.6, wood: 'oak', metal: 'bronze', gem: '#7aff6a', glow: true }],
        ['quarterstaff', 'Quarterstaff', 'staffs', { length: 1.85, size: 1, shape: 0.35, wood: 'ash', metal: 'black', gem: '#d4ad48', glow: false }],
        ['cleric', 'Cleric staff', 'staffs', { length: 1.7, size: 1, shape: 0.5, wood: 'pale', metal: 'gold', gem: '#ff4a3a', glow: false }],
        ['necro', 'Bone staff', 'staffs', { length: 1.7, size: 1, shape: 0.55, wood: 'pale', metal: 'black', gem: '#7aff6a', glow: true }],
        ['energy', 'Energy staff', 'scifi', { length: 1.8, size: 1, shape: 0.5, wood: 'ebony', metal: 'steel', gem: '#38f0d8', glow: true }],
        ['wandwood', 'Wooden wand', 'staffs', { length: 0.36, size: 1, shape: 0.5, wood: 'walnut', metal: 'gold', gem: '#ffd24a', glow: false }],
        ['wandbone', 'Bone wand', 'staffs', { length: 0.34, size: 1, shape: 0.6, wood: 'pale', metal: 'silver', gem: '#c86aff', glow: true }],
        ['wandcrystal', 'Crystal wand', 'staffs', { length: 0.33, size: 1, shape: 0.5, wood: 'ebony', metal: 'silver', gem: '#58c8ff', glow: true }]
    ];
    const FAMILY = {
        wizard: { range: [1.3, 2.2], grip: 0.6, shape: 'Twist', icon: 'staff' }, druid: { range: [1.3, 2.2], grip: 0.6, shape: 'Gnarl', icon: 'staff' },
        quarterstaff: { range: [1.4, 2.4], grip: 0.38, shape: 'Taper', icon: 'staff', size: 'Cap size' }, cleric: { range: [1.3, 2.2], grip: 0.6, shape: 'Rays', icon: 'staff' },
        necro: { range: [1.3, 2.2], grip: 0.6, shape: 'Horns', icon: 'staff' }, energy: { range: [1.3, 2.2], grip: 0.58, shape: 'Ring size', icon: 'staff' },
        wandwood: { range: [0.22, 0.5], grip: 0, shape: 'Taper', icon: 'wand' }, wandbone: { range: [0.22, 0.5], grip: 0, shape: 'Twist', icon: 'wand' },
        wandcrystal: { range: [0.22, 0.5], grip: 0, shape: 'Crystal length', icon: 'wand' }
    };
    const BONE = new Set(['necro', 'wandbone']);
    const PRESET_BY_ID = new Map(PRESETS.map(p => [p[0], p[3]]));
    const IDS = PRESETS.map(p => p[0]);

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, IDS, 'wizard'), base = PRESET_BY_ID.get(preset), fam = FAMILY[preset];
        const v = key => (r[key] !== undefined ? r[key] : base[key]);
        return {
            kind: 'staff', preset,
            length: clamp(v('length'), fam.range[0], fam.range[1], base.length), size: clamp(v('size'), 0.6, 1.6, 1), shape: clamp(v('shape'), 0, 1, base.shape),
            wood: pick(v('wood'), K.WOODS.map(w => w[0]), 'walnut'), metal: pick(v('metal'), K.TRIMS.map(m => m[0]), 'gold'),
            gem: color(v('gem'), '#58c8ff'), glow: !!v('glow'), light: !!r.light
        };
    }

    // ── shafts ─────────────────────────────────────────────────────────────
    /**
     * A wooden or bony shaft from x0 to x1 along a gently wandering line:
     * `r(t)` its radius, `lobes` how far its section swells in three ridges
     * that twist `twist` turns along it, `wander` how far its line strays.
     */
    function gnarled(x0, x1, r, o) {
        const opt = o || {}, steps = opt.steps || 40, sides = opt.sides || 12, pts = [];
        const wobble = (t, k) => Math.sin(t * Math.PI * (2.3 + k) + k * 1.7) * Math.sin(t * Math.PI) * (opt.wander || 0);
        for (let k = 0; k <= steps; k++) { const t = k / steps; pts.push([x0 + (x1 - x0) * t, wobble(t, 0), wobble(t, 1.3)]); }
        const lobes = opt.lobes || 0, twist = opt.twist || 0;
        return { pts, mesh: K.sweep(pts, k => { const t = k / steps; return K.roundSection(a => r(t) * (1 + lobes * Math.sin(3 * a + twist * t * Math.PI * 2) + (opt.knots ? opt.knots(t, a) : 0)), sides); }, { up: [0, 0, 1], v: 2, cos: Math.cos(70 * Math.PI / 180) }) };
    }
    /** A tube along points whose radius goes from r0 to r1, its knuckles swelling `knuckle` at each of `joints`. */
    function limb(pts, r0, r1, sides, knuckle, joints) {
        const n = pts.length - 1;
        return K.tube(pts, k => { const t = k / n; let r = r0 + (r1 - r0) * t; if (knuckle) for (const j of joints) r *= 1 + knuckle * Math.exp(-Math.pow((t - j) / 0.06, 2)); return Math.max(0.0006, r); }, sides || 8);
    }
    /** Points of a curve given by f(t) -> [x, y, z], t from 0 to 1. */
    const curve = (f, n) => Array.from({ length: (n || 16) + 1 }, (_, k) => f(k / (n || 16)));
    /** A leaf: a pointed blade with a midrib, from `at` along `dir`, its face toward `face`. */
    function leaf(at, dir, face, len, wide) {
        const outline = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; outline.push([t * len, Math.sin(Math.PI * Math.pow(t, 0.8)) * wide * (1 - 0.2 * t)]); }
        for (let k = 9; k >= 1; k--) { const t = k / 10; outline.push([t * len, -Math.sin(Math.PI * Math.pow(t, 0.8)) * wide * (1 - 0.2 * t)]); }
        const p = K.plate(outline, { t: (x) => 0.0009 * (1 - 0.5 * x / len), chamfer: 0.0004, edge: 0.0002 });
        const u = norm(dir), w = norm(K.vec.cross(face, u)), n = K.vec.cross(u, w);
        // Bend it a little along its length, its tip falling toward the back.
        const m = K.apply(p.body, q => add(at, add(add(mul(u, q[0]), mul(w, q[1])), mul(n, q[2] - 0.25 * len * Math.pow(q[0] / len, 2)))));
        return Mesh.merge([m, K.bar(add(at, mul(n, 0.0006)), add(at, add(mul(u, len * 0.85), mul(n, 0.0006 - 0.25 * len * 0.72))), n, wide * 0.08, 0.0012)]);
    }

    // ── heads ──────────────────────────────────────────────────────────────
    // Each fills `H` (Shaft, Wood, Metal, Gem, Glow, Dark, Leaves, Wrap lists) and returns where its top is,
    // where its gem shines from, and its face (the edge marker).
    const HEADS = {
        wizard(r, H, c) {
            const s = r.size, L = r.length, orbR = 0.042 * s, top = L - orbR * 2 - 0.035 * s, R0 = 0.0145;
            const shaft = gnarled(0, top, t => R0 * (0.82 + 0.25 * t + 0.08 * Math.exp(-Math.pow((t - 0.58) / 0.05, 2))), { wander: 0.004, lobes: 0.05 + 0.06 * r.shape, twist: 1.5 + 3 * r.shape });
            H.Wood.push(shaft.mesh);
            // Four prongs out of the shaft's top, twisting round the orb and curling in over it.
            const oc = top + orbR + 0.022 * s, cage = orbR + 0.01 * s;
            for (let k = 0; k < 4; k++) {
                const a0 = k * Math.PI / 2 + 0.4;
                const pts = curve(t => {
                    const a = a0 + r.shape * 1.6 * t, x = top - 0.01 + (oc + orbR * 0.95 - top + 0.01) * t;
                    const rad = t < 0.75 ? R0 * 0.55 + (cage - R0 * 0.55) * Math.sin(Math.min(1, t / 0.75) * Math.PI / 2) : cage - (cage - orbR * 0.35) * Math.pow((t - 0.75) / 0.25, 1.4);
                    return [x, Math.cos(a) * rad, Math.sin(a) * rad];
                }, 22);
                H.Wood.push(limb(pts, 0.0078 * s, 0.0024 * s, 8, 0.25, [0.45]));
                const tip = pts[pts.length - 1];
                H.Gem.push(K.gem(tip, norm([1, tip[1], tip[2]]), 0.0035 * s, 0.012 * s, 5));
            }
            H.Metal.push(K.band([top - 0.04, 0, 0], [1, 0, 0], R0 * 1.02, 0.012, 0.003), K.band([top - 0.022, 0, 0], [1, 0, 0], R0 * 1.05, 0.006, 0.0025));
            H.Metal.push(K.strap([top - 0.25 * s, 0, 0], [top - 0.06, 0, 0], R0 * 0.98, 5, 0.0011));
            H.Gem.push(Mesh.sphere([oc, 0, 0], orbR, 32));
            return { tip: [oc + orbR + 0.01, 0, 0], light: [oc, 0, 0], face: [oc, -orbR, 0] };
        },
        druid(r, H, c) {
            const s = r.size, L = r.length, g = r.shape, crown = 0.15 * s, top = L - crown, R0 = 0.016;
            const shaft = gnarled(0, top, t => R0 * (0.78 + 0.32 * t), { wander: 0.006 + 0.012 * g, lobes: 0.06 + 0.12 * g, twist: 0.8 + 1.4 * g, sides: 12, knots: (t, a) => 0.25 * g * Math.exp(-Math.pow((t - 0.33) / 0.03, 2)) * Math.max(0, Math.cos(a - 1)) + 0.2 * g * Math.exp(-Math.pow((t - 0.71) / 0.025, 2)) * Math.max(0, Math.cos(a + 2)) });
            H.Wood.push(shaft.mesh);
            // Roots out of the top: five branches, splayed and curling in round a cluster of raw crystal.
            const end = shaft.pts[shaft.pts.length - 1], cx = top + crown * 0.42;
            for (let k = 0; k < 5; k++) {
                const a0 = k * 2 * Math.PI / 5, spread = 0.035 * s * (0.85 + 0.3 * Math.sin(k * 2.1));
                const pts = curve(t => {
                    const a = a0 + (0.6 + 0.8 * g) * t, x = end[0] - 0.012 + crown * 0.98 * t;
                    const rad = R0 * 0.5 + spread * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (t < 0.85 ? 1 : 1 - (t - 0.85) * 2.6) + 0.004 * Math.sin(t * 9 + k);
                    return [x, end[1] + Math.cos(a) * rad, end[2] + Math.sin(a) * rad];
                }, 20);
                H.Wood.push(limb(pts, 0.0085 * s, 0.0016 * s, 8, 0.3 * g, [0.3, 0.62]));
                // A leaf off each branch.
                const at = pts[9], out = norm([0.4, at[1] - end[1], at[2] - end[2]]);
                H.Leaves.push(leaf(at, out, norm([0, -out[2], out[1]]), 0.05 * s, 0.014 * s));
            }
            const gems = [[0, 0, 0, 0.016, 0.07], [0.006, 0.012, 0.6, 0.009, 0.04], [0.004, -0.012, -0.5, 0.008, 0.038], [-0.004, 0.004, 2.2, 0.007, 0.032]];
            for (const [dx, dy, tilt, rr, len] of gems) H.Gem.push(K.gem([cx - 0.03 * s + dx * s, dy * s, -dy * s * 0.5], norm([1, Math.sin(tilt) * 0.5, Math.cos(tilt) * 0.3 * Math.sign(dy || 1)]), rr * s, len * s, 6, { low: 0.12, prism: 0.55 }));
            // A vine winding down the upper shaft, leafing as it goes.
            const vine = curve(t => { const x = top - 0.02 - 0.42 * t, a = t * Math.PI * 2 * 2.2, rr = R0 * 1.05 + 0.002; return [x, Math.cos(a) * rr, Math.sin(a) * rr]; }, 60);
            H.Leaves.push(K.tube(vine, 0.0018, 6));
            for (let k = 1; k <= 6; k++) {
                const at = vine[k * 9], out = norm([-0.2, at[1], at[2]]);
                H.Leaves.push(leaf(at, norm(add(out, [0.5, 0, 0])), norm([0, -at[2], at[1]]), 0.04 * s, 0.012 * s));
            }
            H.Metal.push(K.band([top - 0.065, 0, 0], [1, 0, 0], R0 * 1.04, 0.01, 0.0025));
            return { tip: [L, 0, 0], light: [cx, 0, 0], face: [cx, -0.03 * s, 0] };
        },
        quarterstaff(r, H, c) {
            const L = r.length, s = r.size, R0 = 0.016, cap = 0.07 * s;
            H.Wood.push(K.shaft([0, 0, 0], [L, 0, 0], t => R0 * (1 - r.shape * 0.28 * Math.pow(Math.abs(2 * t - 1), 1.6)), 16, { steps: 30, v: 0.5 }));
            for (const [x, d] of [[0, 1], [L, -1]]) {
                const rr = R0 * (1 - r.shape * 0.28) + 0.0025;
                H.Metal.push(Mesh.lathe([[rr * 0.7, 0], [rr, 0.004], [rr, cap * 0.75], [rr + 0.0025, cap * 0.8], [rr + 0.0025, cap * 0.92], [rr - 0.001, cap], [R0 * 0.9, cap + 0.002]].map(([a, h]) => [a, h]), 16, { base: [x + (d > 0 ? -0.004 : 0.004), 0, 0], dir: [d, 0, 0], sharp: 0.8 }));
                for (const z of [1, -1]) H.Metal.push(K.rivet([x + d * cap * 0.4, 0, z * (rr + 0.0004)], [0, 0, z], 0.0028));
                for (const y of [1, -1]) H.Metal.push(K.rivet([x + d * cap * 0.4, y * (rr + 0.0004), 0], [0, y, 0], 0.0028));
            }
            for (const f of [0.3, 0.7]) {
                const x0 = L * f - 0.11, x1 = L * f + 0.11, rr = R0 * (1 - r.shape * 0.28 * Math.pow(Math.abs(2 * f - 1), 1.6)) + 0.0016;
                H.Wrap.push(K.shaft([x0, 0, 0], [x1, 0, 0], t => rr * (t < 0.03 ? 0.95 + 1.6 * t : t > 0.97 ? 0.95 + 1.6 * (1 - t) : 1), 16, { steps: 8, v: 0.22 }));
                H.Wrap.push(K.strap([x0 + 0.005, 0, 0], [x1 - 0.005, 0, 0], rr + 0.0003, 9, 0.001));
                for (const x of [x0, x1 - 0.007]) H.Metal.push(K.band([x, 0, 0], [1, 0, 0], rr - 0.0008, 0.007, 0.0016));
            }
            return { tip: [L, 0, 0], light: null, face: [L * 0.5, -R0, 0] };
        },
        cleric(r, H, c) {
            const s = r.size, L = r.length, R0 = 0.0145, Ro = 0.085 * s, Ri = 0.07 * s, d = 0.045 * s, head = Ro * 2 + 0.02 * s, top = L - head;
            H.Wood.push(K.shaft([0, 0, 0], [top + 0.005, 0, 0], t => R0 * (0.85 + 0.2 * t), 14, { steps: 20, v: 0.5 }));
            // Turned knops and a collar under the head; gilded bands down the shaft.
            H.Metal.push(Mesh.lathe([[R0 * 1.0, 0], [R0 * 1.35, 0.008], [R0 * 1.9, 0.022], [R0 * 1.9, 0.03], [R0 * 1.2, 0.04], [R0 * 1.15, 0.05], [R0 * 1.6, 0.058], [R0 * 1.25, 0.068], [R0 * 0.9, 0.072]], 18, { base: [top - 0.05, 0, 0], dir: [1, 0, 0], sharp: 0.7 }));
            for (const f of [0.3, 0.5, 0.75]) H.Metal.push(K.band([top * f, 0, 0], [1, 0, 0], R0 * (0.85 + 0.2 * f), 0.01, 0.0022));
            // The crescent, horns up, cupping the sun.
            const c0 = top + Ro + 0.01, xA = (Ro * Ro - Ri * Ri + d * d) / (2 * d), yA = Math.sqrt(Math.max(1e-8, Ro * Ro - xA * xA));
            const tA = Math.atan2(yA, xA), pA = Math.atan2(yA, xA - d), outline = [];
            for (let k = 0; k <= 28; k++) { const a = tA + (2 * Math.PI - 2 * tA) * k / 28; outline.push([c0 + Math.cos(a) * Ro, Math.sin(a) * Ro]); }
            for (let k = 1; k < 24; k++) { const a = (2 * Math.PI - pA) - (2 * Math.PI - 2 * pA) * k / 24; outline.push([c0 + d + Math.cos(a) * Ri, Math.sin(a) * Ri]); }
            const cres = K.plate(outline, { t: () => 0.005 * s, chamfer: 0.0022 * s });
            H.Metal.push(cres.body);
            for (const y of [yA, -yA]) H.Metal.push(Mesh.sphere([c0 + xA + 0.004 * s, y, 0], 0.007 * s, 12));
            // The sun: rays round a raised boss with the gem.
            const n = Math.round(8 + 10 * r.shape), sc = c0 + d * 0.9, rIn = Ri * 0.42, rOut = Ri * 0.86, rays = [];
            for (let k = 0; k < n * 2; k++) { const a = k * Math.PI / n, rr = k % 2 ? rIn : (k % 4 === 0 ? rOut : rOut * 0.82); rays.push([sc + Math.cos(a) * rr, Math.sin(a) * rr]); }
            H.Metal.push(K.plate(rays, { t: () => 0.0032 * s, chamfer: 0.0014 * s }).body);
            H.Metal.push(Mesh.lathe([[0, -0.009 * s], [rIn * 0.95, -0.009 * s], [rIn, -0.006 * s], [rIn * 0.85, 0.006 * s], [rIn * 0.95, 0.009 * s], [0, 0.009 * s]], 24, { base: [sc, 0, 0], dir: [0, 0, 1], sharp: 0.7 }));
            for (const z of [1, -1]) H.Gem.push(K.gem([sc, 0, z * 0.006 * s], [0, 0, z], rIn * 0.55, 0.014 * s, 8, { low: 0.05, prism: 0.25 }));
            return { tip: [c0 + xA + 0.012 * s, 0, 0], light: [sc, 0, 0.02], face: [sc, -rOut, 0] };
        },
        necro(r, H, c) {
            const s = r.size, L = r.length, R0 = 0.0135, sk = 0.052 * s, cx = L - sk * 1.9, top = cx - sk * 0.9;
            // A spine of bone: beaded segments, a knuckle every few hands.
            const N = Math.round(top / 0.09);
            H.Bone.push(gnarled(0, top, t => { const f = (t * N) % 1; return R0 * (0.78 + 0.18 * t) * (1 + 0.28 * Math.exp(-Math.pow((f - 0.5) / 0.12, 2)) + 0.12 * Math.exp(-Math.pow(f / 0.05, 2))); }, { steps: N * 6, wander: 0.003, sides: 12 }).mesh);
            // The skull: a long cranium, a brow, cheekbones and a jaw; its sockets dark or burning.
            H.Bone.push(K.apply(Mesh.sphere([0, 0, 0], sk, 28), p => [cx + p[0] * 0.86, p[1] * 1.16 + sk * 0.14, p[2] * 0.86]));
            H.Bone.push(K.apply(Mesh.sphere([0, 0, 0], sk * 0.62, 20), p => [cx - sk * 0.42 + p[0] * 0.9, -sk * 0.62 + p[1] * 0.75, p[2] * 1.05]));
            H.Bone.push(CM.chamferBox([cx - sk * 0.9, -sk * 0.55, 0], [sk * 0.42, sk * 0.62, sk * 1.15], sk * 0.12));
            for (const z of [1, -1]) {
                H.Glow.push(K.apply(Mesh.sphere([0, 0, 0], sk * 0.25, 16), p => [cx - sk * 0.1 + p[0] * 0.8, -sk * 0.97 + p[1] * 0.45, z * sk * 0.38 + p[2] * 0.95]));
                // The brow over each socket and the temple's ridge behind it.
                H.Bone.push(K.tube(curve(t => [cx + sk * 0.16 + 0.012 * s * Math.sin(t * Math.PI), -sk * 0.98 + sk * 0.12 * Math.pow(Math.abs(t - 0.3), 2) * 3, z * (sk * 0.08 + sk * 0.62 * t)], 10), k => sk * (0.07 - 0.02 * k / 10), 8));
                H.Bone.push(K.tube(curve(t => [cx - sk * 0.02 + 0.006 * Math.sin(t * Math.PI), -sk * 1.0 + sk * 0.3 * t, z * (sk * 0.62 - sk * 0.2 * t)], 6), sk * 0.06, 8));
            }
            H.Dark.push(K.spike([cx - sk * 0.48, -sk * 1.17, 0], [-0.3, -1, 0], sk * 0.1, sk * 0.12, 3, { phase: Math.PI / 2 }));
            for (let k = -3; k <= 3; k++) H.Bone.push(CM.chamferBox([cx - sk * 0.78, -sk * 1.12, k * sk * 0.13], [sk * 0.16, sk * 0.06, sk * 0.1], sk * 0.02));
            // Ram's horns curling back from the temples.
            const hl = 0.6 + 1.2 * r.shape;
            for (const z of [1, -1]) {
                const pts = curve(t => { const a = t * Math.PI * 1.25 * hl, rr = sk * (0.55 - 0.22 * t) * hl; return [cx + sk * 0.35 + Math.sin(a) * rr, sk * 0.1 + (1 - Math.cos(a)) * rr * 0.9 - sk * 0.1 * t, z * (sk * 0.78 + sk * 0.55 * t * hl)]; }, 24);
                H.Horn.push(K.tube(pts, k => sk * (0.2 - 0.17 * k / 24) * (1 + 0.1 * Math.max(0, Math.sin(k * 2.2))), 10));
            }
            // Bony fingers out of the shaft's top, clutching the skull from below.
            for (let k = 0; k < 4; k++) {
                const a = k * Math.PI / 2 + Math.PI / 4;
                const pts = curve(t => { const rad = R0 + (sk * 0.95 - R0) * Math.sin(Math.min(1, t * 1.3) * Math.PI / 2) - sk * 0.25 * Math.max(0, t - 0.7); return [top - 0.02 + (sk * 1.25) * t, Math.cos(a) * rad + sk * 0.1 * t, Math.sin(a) * rad]; }, 16);
                H.Bone.push(limb(pts, 0.0062 * s, 0.003 * s, 8, 0.35, [0.35, 0.68]));
            }
            H.Metal.push(K.band([top - 0.05, 0, 0], [1, 0, 0], R0 * 1.05, 0.012, 0.0028), K.band([top - 0.03, 0, 0], [1, 0, 0], R0 * 1.0, 0.006, 0.0022));
            return { tip: [cx + sk * 0.95, 0, 0], light: [cx, -sk, 0], face: [cx, -sk * 1.1, 0] };
        },
        energy(r, H, c) {
            const s = r.size, L = r.length, R0 = 0.0135, ring = (0.065 + 0.05 * r.shape) * s, head = ring * 2 + 0.06 * s, top = L - head;
            // A machined shaft: sleeves and grooves, a glowing seam in each groove.
            H.Body.push(K.shaft([0, 0, 0], [top + 0.02, 0, 0], () => R0, 16, { steps: 4, v: 0.5 }));
            const seg = 8;
            for (let k = 0; k < seg; k++) {
                const x = 0.05 + (top - 0.1) * k / (seg - 1);
                H.Metal.push(K.band([x - 0.02, 0, 0], [1, 0, 0], R0, 0.04, 0.0028, { sides: 8 }));
                H.Glow.push(K.band([x + 0.026, 0, 0], [1, 0, 0], R0, 0.004, 0.0009));
            }
            H.Wrap.push(K.shaft([top * 0.52, 0, 0], [top * 0.66, 0, 0], t => R0 + 0.0022 * (t < 0.05 || t > 0.95 ? 0.6 : 1), 16, { steps: 6, v: 0.15 }));
            // The fork: two chamfered emitter prongs up round a floating ring, a crystal core inside.
            const rc = top + 0.035 * s + ring;
            // Two arms out of the shaft's head, sweeping wide and closing on the ring's sides; a glowing seam down each.
            for (const sy of [1, -1]) {
                const at = Math.PI - 1.15, grip = [rc + Math.cos(at) * (ring + 0.01 * s), sy * Math.sin(at) * (ring + 0.01 * s), 0];
                const arm = K.cubic([top + 0.012, sy * 0.008], [top + 0.03 * s, sy * ring * 0.55], [grip[0] - ring * 0.5, sy * ring * 1.15], [grip[0], grip[1]], 16).map(([x, y]) => [x, y, 0]);
                H.Metal.push(K.sweep(arm, k => K.roundRect(0.016 * s * (1 - 0.3 * k / 16), 0.011 * s, 0.003 * s, 2), { up: [0, 0, 1], cos: K.COS.crisp }));
                for (const z of [1, -1]) H.Glow.push(K.sweep(arm.slice(2, -2).map(p => [p[0], p[1], z * 0.0082 * s * (1 - 0.15)]), K.roundRect(0.0012, 0.0035 * s, 0.0005, 1), { up: [0, 0, 1] }));
                H.Metal.push(K.apply(CM.chamferBox([0, 0, 0], [0.024 * s, 0.014 * s, 0.022 * s], 0.003 * s), q => [grip[0] + q[0], grip[1] + q[1], q[2]]));
            }
            const hoop = curve(t => { const a = t * Math.PI * 2; return [rc + Math.cos(a) * ring, Math.sin(a) * ring, 0]; }, 48).slice(0, 48);
            H.Metal.push(K.sweep(hoop, K.roundRect(0.011 * s, 0.016 * s, 0.003 * s, 2), { up: [0, 0, 1], cos: K.COS.crisp, closed: true }));
            H.Glow.push(K.sweep(hoop.map(p => [rc + (p[0] - rc) * 0.93, p[1] * 0.93, 0]), K.roundRect(0.002 * s, 0.006 * s, 0.0008, 1), { up: [0, 0, 1], closed: true }));
            H.Gem.push(K.gem([rc - ring * 0.55, 0, 0], [1, 0, 0], 0.017 * s, ring * 1.1, 6, { low: 0.3, prism: 0.35 }));
            if (r.glow) {
                // The charge it emits: a white-hot core round the crystal, a halo, a thin field filling the hoop, and
                // arcs jumping in from the hoop to the core. All still: built once, nothing redrawn per frame.
                const blob = (sx, sy, sz, n) => K.apply(Mesh.sphere([0, 0, 0], sx, n, Math.round(n / 2)), p => [rc + p[0], p[1] * sy / sx, p[2] * sz / sx]);
                H.Core.push(blob(ring * 0.4, ring * 0.24, ring * 0.24, 20));
                H.Aura.push(blob(ring * 0.6, ring * 0.44, ring * 0.36, 24));
                H.Haze.push(blob(ring * 0.9, ring * 0.9, ring * 0.16, 32));
                for (let k = 0; k < 6; k++) {
                    const a = k * Math.PI / 3 + 0.35, ca = Math.cos(a), sa = Math.sin(a), pts = [];
                    for (let j = 0; j <= 6; j++) {
                        const t = j / 6, rr = ring * (0.9 - 0.62 * t), kink = j && j < 6 ? (((k * 7 + j * 3) % 5) / 4 - 0.5) * ring * 0.09 : 0;
                        pts.push([rc + ca * rr - sa * kink, sa * rr * (1 - 0.3 * t) + ca * kink, (((k + j) % 3) - 1) * ring * 0.02 * (j && j < 6 ? 1 : 0)]);
                    }
                    H.Arc.push(K.tube(pts, j => 0.0018 * s * (1 - 0.5 * j / 6), 5));
                }
            }
            return { tip: [rc + ring + 0.006 * s, 0, 0], light: [rc, 0, 0], face: [rc, -ring, 0] };
        },
        wandwood(r, H, c) {
            const L = r.length, s = r.size, tipR = 0.0045 * (1.25 - r.shape * 0.6);
            const prof = [[0, -0.002], [0.0085, 0], [0.0105, 0.006], [0.0098, 0.012], [0.0088, 0.016], [0.009, 0.06], [0.0098, 0.085], [0.0102, 0.09], [0.0085, 0.096], [0.0092, 0.1], [0.0078, 0.106]];
            for (let k = 1; k <= 14; k++) { const t = k / 14; prof.push([0.0072 + (tipR - 0.0072) * t + 0.0006 * Math.sin(t * 9), 0.106 + (L - 0.12 - 0.106) * t]); }
            prof.push([tipR * 1.6, L - 0.01], [tipR * 1.8, L - 0.006], [tipR, L - 0.001], [0, L]);
            H.Wood.push(Mesh.lathe(prof, 14, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.7 }));
            H.Metal.push(K.band([0.096, 0, 0], [1, 0, 0], 0.0086, 0.006, 0.0018), K.band([0.004, 0, 0], [1, 0, 0], 0.0094, 0.005, 0.0016));
            H.Wrap.push(K.strap([0.02, 0, 0], [0.085, 0, 0], 0.0094, 6, 0.0009));
            H.Gem.push(K.gem([L - 0.004, 0, 0], [1, 0, 0], tipR * 1.1 * s, 0.012 * s, 6));
            return { tip: [L + 0.008 * s, 0, 0], light: [L, 0, 0], face: [L * 0.6, -0.012, 0], grip: [0.012, 0.09] };
        },
        wandbone(r, H, c) {
            const L = r.length, s = r.size;
            H.Bone.push(gnarled(0.02, L - 0.03, t => 0.0085 * (1 - 0.5 * t), { steps: 40, sides: 12, lobes: 0.16, twist: 2 + 4 * r.shape, wander: 0.002 }).mesh);
            H.Bone.push(K.apply(Mesh.sphere([0, 0, 0], 0.012, 16), p => [0.016 + p[0] * 1.2, p[1], p[2]]));
            H.Metal.push(K.band([0.03, 0, 0], [1, 0, 0], 0.0082, 0.006, 0.0016), K.band([0.1, 0, 0], [1, 0, 0], 0.0072, 0.005, 0.0014));
            // A little claw at the tip, holding its gem.
            const gx = L - 0.012;
            for (let k = 0; k < 3; k++) {
                const a = k * Math.PI * 2 / 3;
                H.Bone.push(limb(curve(t => [L - 0.034 + 0.03 * t, Math.cos(a) * (0.0045 + 0.007 * Math.sin(t * Math.PI * 0.85)), Math.sin(a) * (0.0045 + 0.007 * Math.sin(t * Math.PI * 0.85))], 10), 0.0026, 0.0011, 6, 0.3, [0.5]));
            }
            H.Gem.push(K.gem([gx - 0.008, 0, 0], [1, 0, 0], 0.006 * s, 0.018 * s, 6));
            return { tip: [L, 0, 0], light: [gx, 0, 0], face: [gx, -0.012, 0], grip: [0.012, 0.09] };
        },
        wandcrystal(r, H, c) {
            const L = r.length, s = r.size, cl = (0.07 + 0.08 * r.shape) * s, hl = Math.max(0.1, L - cl * 0.85);
            H.Metal.push(Mesh.lathe([[0, 0], [0.0085, 0.001], [0.01, 0.006], [0.009, 0.012], [0.0078, 0.016], [0.0078, hl - 0.03], [0.0098, hl - 0.02], [0.012, hl - 0.006], [0.0105, hl], [0.006, hl + 0.002]], 16, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.7 }));
            H.Wrap.push(K.shaft([0.02, 0, 0], [hl - 0.034, 0, 0], () => 0.0088, 14, { steps: 4, v: 0.08 }));
            for (const x of [0.02, hl - 0.04]) H.Metal.push(K.band([x, 0, 0], [1, 0, 0], 0.0088, 0.006, 0.0015));
            // Prongs holding the shard, and the shard itself with two small ones at its foot.
            for (let k = 0; k < 4; k++) {
                const a = k * Math.PI / 2 + Math.PI / 4;
                H.Metal.push(limb(curve(t => [hl - 0.004 + 0.022 * t, Math.cos(a) * (0.009 + 0.004 * Math.sin(t * Math.PI)), Math.sin(a) * (0.009 + 0.004 * Math.sin(t * Math.PI))], 8), 0.0022, 0.001, 6));
            }
            H.Gem.push(K.gem([hl - 0.006, 0, 0], [1, 0, 0], 0.0105 * s, cl, 6, { low: 0.08, prism: 0.62 }));
            for (const [a, rr] of [[0.6, 0.004], [-1.9, 0.0035]]) H.Gem.push(K.gem([hl + 0.004, Math.cos(a) * 0.008, Math.sin(a) * 0.008], norm([1, Math.cos(a) * 0.5, Math.sin(a) * 0.5]), rr * s, 0.022 * s, 5));
            return { tip: [hl - 0.006 + cl, 0, 0], light: [hl + cl * 0.4, 0, 0], face: [hl + cl * 0.3, -0.01, 0], grip: [0.012, Math.min(0.1, hl - 0.04)] };
        }
    };

    // ── the build ──────────────────────────────────────────────────────────
    function build(recipe, cache) {
        const r = normalize(recipe), c = cache || {}, fam = FAMILY[r.preset], L = r.length;
        const H = { Wood: [], Bone: [], Horn: [], Body: [], Metal: [], Wrap: [], Gem: [], Glow: [], Dark: [], Leaves: [], Core: [], Arc: [], Aura: [], Haze: [] };
        const head = HEADS[r.preset](r, H, c);
        const textures = {}, trim = K.look(r.metal), glow = r.glow;
        if (H.Wood.length) {
            const key = r.wood;
            if (c.woodKey !== key) { c.wood = K.woodPicture(K.WOOD[r.wood], 21 + K.WOODS.findIndex(w => w[0] === r.wood), 'staff-wood.png'); c.woodKey = key; }
            textures['staff-wood.png'] = c.wood;
        }
        if (H.Wrap.length) {
            if (!c.wrap) c.wrap = K.wrapPicture('leather', '#3a2418', 'staff-wrap.png');
            textures['staff-wrap.png'] = c.wrap;
        }
        // The charge's heart: the crystal's color most of the way to white.
        const hot = '#' + Paint.hex(r.gem).map(v => Math.round(v + (255 - v) * 0.6).toString(16).padStart(2, '0')).join('');
        const arc = '#' + Paint.hex(r.gem).map(v => Math.round(v + (255 - v) * 0.3).toString(16).padStart(2, '0')).join('');
        const gemLook = glow ? { kind: 'prop', color: K.shadeHex(r.gem, 0.55), emissive: r.gem, emissiveIntensity: 0.85, roughness: 0.1, metalness: 0.1 } : { kind: 'metal', color: r.gem, roughness: 0.08, metalness: 0.35 };
        const P = {
            Wood: { meshes: H.Wood, look: { kind: 'prop', texture: 'staff-wood.png', roughness: 0.66, metalness: 0, mat: 'wood' } },
            Bone: { meshes: H.Bone, look: { kind: 'prop', color: '#d6c9a8', roughness: 0.55, metalness: 0, mat: 'leather', tint: { at: p => 0.35 * Math.max(0, Math.sin(p[0] * 61) * Math.sin(p[1] * 47 + p[2] * 53)), color: '#9c8a64' } } },
            Horn: { meshes: H.Horn, look: { kind: 'prop', color: '#3a2e26', roughness: 0.45, metalness: 0.05, mat: 'leather' } },
            Body: { meshes: H.Body, look: { kind: 'metal', color: '#2e3036', roughness: 0.4, metalness: 0.8, mat: 'metal' } },
            Metal: { meshes: H.Metal, look: { kind: 'metal', color: trim.color, roughness: trim.roughness, metalness: trim.metalness, mat: 'metal' } },
            Wrap: { meshes: H.Wrap, look: { kind: 'prop', texture: 'staff-wrap.png', roughness: 0.75, metalness: 0, mat: 'leather' } },
            Leaves: { meshes: H.Leaves, look: { kind: 'prop', color: '#4f7a34', roughness: 0.6, metalness: 0, doubleSided: false } },
            Dark: { meshes: H.Dark, look: { kind: 'prop', color: '#141210', roughness: 0.8, metalness: 0 } },
            Gem: { meshes: H.Gem, look: gemLook },
            Glow: { meshes: H.Glow, look: glow ? { kind: 'prop', color: K.shadeHex(r.gem, 0.5), emissive: r.gem, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0 } : { kind: 'prop', color: '#0e0e10', roughness: 0.5, metalness: 0.2 } },
            // An emitter's charge (the energy staff's): bright and unlit-looking at its heart, softer and see-through outward;
            // all a touch see-through so none of it throws a shadow on the rest.
            Core: { meshes: H.Core, look: { kind: 'prop', color: hot, emissive: hot, emissiveIntensity: 2.2, opacity: 0.94, roughness: 0.4, metalness: 0 } },
            Arc: { meshes: H.Arc, look: { kind: 'prop', color: arc, emissive: arc, emissiveIntensity: 2.6, opacity: 0.94, roughness: 0.4, metalness: 0 } },
            Aura: { meshes: H.Aura, look: { kind: 'prop', color: r.gem, emissive: r.gem, emissiveIntensity: 1.9, opacity: 0.38, roughness: 0.3, metalness: 0 } },
            Haze: { meshes: H.Haze, look: { kind: 'prop', color: r.gem, emissive: r.gem, emissiveIntensity: 1.5, opacity: 0.22, roughness: 0.3, metalness: 0 } }
        };
        const g = head.grip ? head.grip : [L * fam.grip - 0.05, L * fam.grip + 0.05];
        const marks = { gripBottom: [g[0], 0, 0], gripTop: [g[1], 0, 0], tip: head.tip, edge: head.face };
        return K.finish('staff', r, P, marks, textures, { template: 'blade', light: glow && r.light && head.light ? { at: head.light, color: r.gem, radius: L > 1 ? 3 : 1.8 } : null });
    }

    /** A random staff or wand: a style of its own (another when Everything rolls); shape its size and twist; colors its wood, metal and crystal. */
    function random(seed, recipe, scope, keep) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur));
        const all = !scope || scope === 'all', has = part => all || scope === part;
        const family = all && !keep ? R.pick(PRESETS) : PRESETS.find(p => p[0] === cur.preset);
        const base = family[3], fam = FAMILY[family[0]];
        out.preset = family[0];
        if (has('shape')) { out.length = Math.max(fam.range[0], Math.min(fam.range[1], R.jitter(base.length, 0.1))); out.size = R.jitter(1, 0.18, 0.6, 1.6); out.shape = R.range(0.1, 0.95); }
        else if (out.preset !== cur.preset) Object.assign(out, { length: base.length, size: 1, shape: base.shape });
        if (has('details')) { out.glow = family[0] === 'quarterstaff' ? false : R.chance(0.75); out.light = out.glow && R.chance(0.3); }
        if (has('colors')) { out.wood = R.pick(K.WOODS)[0]; out.metal = R.pick(K.TRIMS)[0]; out.gem = R.pick(Rand.PALETTES.glow.concat(Rand.PALETTES.jewel.slice(0, 5))); }
        return normalize(out);
    }

    const api = { PRESETS, FAMILY, normalize, build, random };
    root.RRStaffProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel || (typeof require === 'function' ? require('./PropModel.js') : null);
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'staff', label: 'Staff or wand', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        K.icons(Catalog);
        Catalog.category({ id: 'staffs', label: 'Staffs & Wands', order: 48, parent: 'weapons' });
        for (const [id, label, category] of PRESETS) Catalog.add({ id: 'staff-' + id, category, label, icon: FAMILY[id].icon, kind: 'staff', keywords: 'weapon magic staff wand stave rod ' + id, start: () => normalize({ preset: id }), matches: r => r.preset === id });
        Catalog.ui('staff', K.page({
            placeholder: 'Staff', PRESETS, normalize, random, keep: ['wood', 'metal', 'gem', 'glow', 'light'],
            shape(r) {
                const fam = FAMILY[r.preset];
                return this._slider({ path: 'length', label: 'Length', range: fam.range, step: 0.01, format: 'm' })
                    + this._slider({ path: 'size', label: fam.size || 'Head size', range: [0.6, 1.6], step: 0.01, format: 'x' })
                    + this._slider({ path: 'shape', label: fam.shape, range: [0, 1] });
            },
            look(r) {
                const bone = BONE.has(r.preset), energy = r.preset === 'energy', gem = r.preset !== 'quarterstaff';
                return this._section('Materials') + (bone || energy ? '' : this._select('wood', 'Wood', K.WOODS)) + this._select('metal', 'Metal', K.TRIMS)
                    + (gem ? this._section('Crystal') + this._color('gem', 'Color', ['#58c8ff', '#7aff6a', '#ff4a3a', '#c86aff', '#ffd24a', '#f2f2f6']) + this._check('glow', 'Glows') + (r.glow ? this._check('light', 'Casts light') : '') : '');
            }
        }));
    }
})(typeof window !== 'undefined' ? window : globalThis);
