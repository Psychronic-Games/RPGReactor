/**
 * RRRangedProp - Weapons › Bows & Crossbows: a longbow, a laminated
 * recurve, a horse bow with stiff ears, a compound bow with cams and
 * cables, a crossbow, an elven bow, an energy bow, and an arrow and a
 * quiver of them. Saved holdable.
 *
 * Bows are built in weapon space (RRWeaponKit) with the bow standing
 * along x (the grip at x = 0, the upper limb toward +x), the string toward
 * +y and the bow's back toward -y, the limbs' width across z. Limbs are
 * swept along a curve bent by the strung shape (and turned back at the
 * tips for a recurve); the string runs from nock to nock along the
 * recurve's belly and across. A bow is held in the fist by its grip with
 * the back toward the target (blade rig: gripBottom, gripTop just under
 * the arrow shelf, tip at the upper nock, edge on the back). The crossbow
 * is a gun: the bolt along +x, y up, and the gun rig (grip, trigger,
 * muzzle, rear, stock, fore grip); it is saved standing on the floor.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const CM = need('RRContainerMesh', './ContainerMesh.js');
    const K = need('RRWeaponKit', './WeaponKit.js');
    const { clamp, color, pick } = K;
    const { add, mul, sub, norm } = K.vec;
    const curve = K.curve;

    const PRESETS = [
        ['longbow', 'Longbow', 'bows', { length: 1.8, size: 1, shape: 0.5, wood: 'yew', metal: 'bronze', wrapColor: '#4a2c1c', string: '#e8dcc0', arrow: false }],
        ['recurve', 'Recurve bow', 'bows', { length: 1.6, size: 1, shape: 0.55, wood: 'walnut', metal: 'black', wrapColor: '#1b1b22', string: '#2a2a2e', arrow: true }],
        ['composite', 'Horse bow', 'bows', { length: 1.25, size: 1, shape: 0.6, wood: 'pale', metal: 'gold', wrapColor: '#8a1a2a', string: '#d8c8a0', arrow: false }],
        ['compound', 'Compound bow', 'bows', { length: 0.95, size: 1, shape: 0.5, wood: 'ebony', metal: 'black', wrapColor: '#2a2a2e', string: '#c8501e', arrow: true }],
        ['crossbow', 'Crossbow', 'bows', { length: 0.7, size: 1, shape: 0.5, wood: 'walnut', metal: 'steel', wrapColor: '#2a1d15', string: '#d8d0b8', arrow: true }],
        ['elven', 'Elven bow', 'bows', { length: 1.7, size: 1, shape: 0.7, wood: 'pale', metal: 'silver', wrapColor: '#2e5a3a', string: '#f2efe6', arrow: false, glow: '#7aff6a' }],
        ['energy', 'Energy bow', 'scifi', { length: 1.45, size: 1, shape: 0.55, wood: 'ebony', metal: 'steel', wrapColor: '#2a2a2e', string: '#38f0d8', arrow: false, glow: '#38f0d8' }],
        ['arrow', 'Arrow', 'bows', { length: 0.78, size: 1, shape: 0.5, wood: 'ash', metal: 'steel', wrapColor: '#8a1a2a', string: '#f2efe6', arrow: false }],
        ['quiver', 'Quiver of arrows', 'bows', { length: 0.6, size: 1, shape: 0.5, wood: 'ash', metal: 'bronze', wrapColor: '#5a3a22', string: '#f2efe6', arrow: false }]
    ];
    const FAMILY = {
        longbow: { range: [1.3, 2.1], shape: 'Bend', icon: 'bow' }, recurve: { range: [1.2, 1.9], shape: 'Recurve', icon: 'bow' }, composite: { range: [1.0, 1.5], shape: 'Recurve', icon: 'bow' },
        compound: { range: [0.75, 1.15], shape: 'Cam size', icon: 'bow' }, crossbow: { range: [0.5, 0.95], shape: 'Prod width', icon: 'crossbow' }, elven: { range: [1.3, 2.0], shape: 'Recurve', icon: 'bow' },
        energy: { range: [1.1, 1.8], shape: 'Recurve', icon: 'bow' }, arrow: { range: [0.5, 1.0], shape: 'Fletching', icon: 'arrow', size: 'Head size' }, quiver: { range: [0.4, 0.8], shape: 'Arrows', icon: 'quiver', size: 'Width' }
    };
    const PRESET_BY_ID = new Map(PRESETS.map(p => [p[0], p[3]]));
    const IDS = PRESETS.map(p => p[0]);
    const WOODLESS = new Set(['compound', 'energy']);

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, IDS, 'longbow'), base = PRESET_BY_ID.get(preset), fam = FAMILY[preset];
        const v = key => (r[key] !== undefined ? r[key] : base[key]);
        return {
            kind: 'bow', preset,
            length: clamp(v('length'), fam.range[0], fam.range[1], base.length), size: clamp(v('size'), 0.6, 1.6, 1), shape: clamp(v('shape'), 0, 1, base.shape),
            wood: pick(v('wood'), K.WOODS.map(w => w[0]), 'yew'), metal: pick(v('metal'), K.TRIMS.map(m => m[0]), 'bronze'),
            wrapColor: color(v('wrapColor'), '#4a2c1c'), string: color(v('string'), '#e8dcc0'), arrow: !!v('arrow'), glow: color(v('glow'), '#38f0d8')
        };
    }

    // ── limbs and strings ──────────────────────────────────────────────────
    /**
     * A limb's line from (x0, y0) leaving at angle a0: bent `bend` radians
     * over its first `at` share, then turned back `back` radians over the
     * rest (a recurve), or kinked back at `at` and straight after (`ear`).
     */
    function limbLine(x0, y0, a0, Ll, bend, back, at, ear, steps) {
        const n = steps || 30, ds = Ll / n, out = [];
        let x = x0, y = y0, a = a0;
        const k1 = bend / (at * Ll), k2 = back / ((1 - at) * Ll);
        for (let k = 0; k <= n; k++) {
            const u = k / n;
            out.push({ x, y, a, u });
            let kappa;
            if (u < at) kappa = k1 * (0.55 + 0.9 * u / at) / 1.0;
            else kappa = ear ? (u - at < 1.5 / n ? -back / ds / 1.5 : 0) : -k2 * Math.sin(Math.PI * Math.min(1, (u - at) / (1 - at)));
            a += kappa * ds;
            x += Math.cos(a) * ds; y += Math.sin(a) * ds;
        }
        return out;
    }
    /** A limb swept along its line: `w(u)` across, `t(u)` deep, `d` how D-shaped (flat back) its section is. */
    function limbMesh(line, w, t, d, off) {
        const pts = line.map(p => [p.x, p.y, 0]);
        return K.sweep(pts, k => {
            const u = line[k].u, ww = w(u), tt = t(u), o = off ? off(u) : 0, sec = [];
            // b > 0 is the bow's back (-y for the upper limb), a across the limb.
            for (let j = 0; j < 14; j++) { const f = j / 14 * Math.PI * 2; let b = Math.sin(f) * tt / 2; if (b > tt * (0.5 - d * 0.32)) b = tt * (0.5 - d * 0.32); sec.push([Math.cos(f) * ww / 2, b + o]); }
            return sec;
        }, { up: [0, 0, 1], cos: Math.cos(50 * Math.PI / 180) });
    }
    /** The belly's line (string side) of a limb, `t(u)` deep, lifted by `lift`. */
    function belly(line, t, lift) { return line.map(p => [p.x - Math.sin(p.a) * (t(p.u) / 2 + lift), p.y + Math.cos(p.a) * (t(p.u) / 2 + lift), 0]); }
    /**
     * The string from the lower nock to the upper: along each recurve's belly
     * to where it leaves the limb (its highest point), straight across between.
     */
    function stringPath(line, t, r) {
        const b = belly(line, t, r);
        let top = 0;
        for (let k = 0; k < b.length; k++) if (b[k][1] >= b[top][1] - 1e-6) top = k;
        const upper = b.slice(top).map(p => [p[0], b[top][1] + (p[1] - b[top][1]), 0]);
        const lower = upper.map(p => [-p[0], p[1], 0]).reverse();
        return lower.concat(upper);
    }
    /** An arrow along +x from its nock (x = 0), `len` long: shaft, head, three vanes and the nock, each a list. */
    function arrow(len, o) {
        const opt = o || {}, s = opt.head || 1, sr = opt.r || 0.0042, out = { shaft: [], head: [], fletch: [], nock: [] };
        out.shaft.push(K.shaft([0.008, 0, 0], [len - 0.012, 0, 0], () => sr, 8, { steps: 2, v: 0.5 }));
        out.nock.push(Mesh.lathe([[sr * 0.6, 0], [sr * 1.05, 0.004], [sr * 1.05, 0.009], [sr * 0.9, 0.011]], 8, { base: [-0.001, 0, 0], dir: [1, 0, 0] }));
        out.nock.push(K.band([0.009, 0, 0], [1, 0, 0], sr * 0.98, 0.004, 0.0005, { sides: 8 }));
        const hl = 0.055 * s, hw = (opt.bolt ? 0.009 : 0.014) * s;
        const head = K.ridge({ length: hl, steps: 10, top: q => hw * (q < hl * 0.2 ? 0.45 + 2.6 * q / hl : 1 - (q - hl * 0.2) / (hl * 0.8)), bot: q => -hw * (q < hl * 0.2 ? 0.45 + 2.6 * q / hl : 1 - (q - hl * 0.2) / (hl * 0.8)), h: q => 0.0028 * s * (1 - 0.8 * q / hl), bevel: 0.3 });
        out.head.push(K.apply(head.body, p => [p[0] + len - 0.014, p[1], p[2]]), K.apply(head.edge, p => [p[0] + len - 0.014, p[1], p[2]]));
        out.head.push(Mesh.lathe([[sr * 1.1, 0], [sr * 1.2, 0.012], [sr * 0.8, 0.02]], 8, { base: [len - 0.03, 0, 0], dir: [1, 0, 0] }));
        const fl = (opt.bolt ? 0.06 : 0.1) * (0.8 + 0.4 * (opt.fletch ?? 0.5)), fh = (opt.bolt ? 0.011 : 0.014) * (0.8 + 0.5 * (opt.fletch ?? 0.5));
        const vane = K.plate(K.path(K.quad([0, 0], [fl * 0.15, fh * 1.1], [fl * 0.55, fh], 6), K.quad([fl * 0.55, fh], [fl * 0.9, fh * 0.8], [fl, 0], 6)), { t: () => 0.0005, chamfer: 0.0002, edge: 0.0002 });
        for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3; out.fletch.push(K.apply(K.copy(vane.body), p => [p[0] + 0.022, Math.cos(a) * (p[1] + sr * 0.9) - Math.sin(a) * p[2], Math.sin(a) * (p[1] + sr * 0.9) + Math.cos(a) * p[2]])); }
        return out;
    }
    /** An arrow's lists moved: x along `dir` from `from`, y along `up`. */
    function place(a, from, dir, up) {
        const d = norm(dir), u = norm(sub(up, mul(d, K.vec.dot(up, d)))), w = K.vec.cross(d, u);
        const f = p => add(from, add(add(mul(d, p[0]), mul(u, p[1])), mul(w, p[2])));
        for (const k of Object.keys(a)) a[k] = a[k].filter(Boolean).map(m => K.apply(m, f));
        return a;
    }

    // ── the bows ───────────────────────────────────────────────────────────
    const BOWS = {
        longbow(r, H) {
            const L = r.length, s = r.size, half = L / 2, grip = 0.06;
            const line = limbLine(0, 0, 0, half, 0.32 + 0.22 * r.shape, 0, 1, false, 34);
            const w = u => (0.032 - 0.019 * Math.pow(u, 1.2)) * s * (u * half < grip ? 0.95 : 1), t = u => (u * half < grip ? 0.034 : 0.028 - 0.015 * u) * Math.sqrt(s);
            return { line, w, t, d: 1, limb: limbMesh(line, w, t, 1), riser: null, half, nocks: 'horn' };
        },
        recurve(r, H) {
            const L = r.length, s = r.size, rr = 0.42 * Math.min(1, L / 1.5), lh = L / 2 - rr / 2 + 0.03;
            const line = limbLine(rr / 2 - 0.035, 0.012, 0.08, lh, 0.42 + 0.1 * r.shape, 0.35 + 0.9 * r.shape, 0.7, false, 36);
            const w = u => (0.04 - 0.024 * Math.pow(u, 1.1)) * s, t = u => (0.012 - 0.004 * u) * Math.sqrt(s);
            H.Laminate.push(limbMesh(line, u => w(u) * 0.86, u => 0.0026, 0, u => t(u) / 2 + 0.0011));
            // The riser: a shaped block with a throat for the hand, limb pockets and bolts, an arrow shelf.
            const out = K.path(K.cubic([-rr / 2, 0.02], [-0.12, 0.034], [-0.07, 0.04], [-0.035, 0.032], 10), K.cubic([-0.035, 0.032], [0.0, 0.026], [0.03, 0.034], [0.055, 0.03], 8), [[0.07, 0.016], [0.1, 0.018]], K.cubic([0.1, 0.018], [0.14, 0.024], [rr / 2 - 0.05, 0.03], [rr / 2, 0.022], 8),
                [[rr / 2, -0.008]], K.cubic([rr / 2, -0.008], [rr / 2 - 0.06, -0.016], [0.07, -0.02], [0.03, -0.034], 8), K.cubic([0.03, -0.034], [0.01, -0.06], [-0.05, -0.062], [-0.07, -0.03], 10), K.cubic([-0.07, -0.03], [-0.1, -0.016], [-rr / 2 + 0.05, -0.014], [-rr / 2, -0.008], 8));
            const riser = K.plate(out, { t: () => 0.0155, chamfer: 0.0035 });
            H.Riser.push(riser.body);
            for (const sx of [1, -1]) for (const z of [1, -1]) H.Metal.push(K.rivet([sx * (rr / 2 - 0.03), 0.008, z * 0.0157], [0, 0, z], 0.0045));
            H.Metal.push(CM.chamferBox([0.062, 0.022, 0.012], [0.012, 0.012, 0.016], 0.002));
            return { line, w, t, d: 0.2, limb: limbMesh(line, w, t, 0.2), riser: true, half: L / 2, nocks: 'tip', grip: [-0.05, 0.05], shelf: 0.065 };
        },
        composite(r, H) {
            const L = r.length, s = r.size, half = L / 2;
            const line = limbLine(0, 0, 0, half, 0.62 + 0.15 * r.shape, 0.5 + 0.7 * r.shape, 0.72, true, 36);
            const w = u => (u < 0.1 ? 0.03 : u < 0.72 ? 0.034 - 0.012 * (u - 0.1) / 0.62 : 0.02 - 0.008 * (u - 0.72) / 0.28) * s, t = u => (u < 0.1 ? 0.03 : u < 0.72 ? 0.02 - 0.006 * u : 0.017) * Math.sqrt(s);
            H.Laminate.push(limbMesh(line.filter(p => p.u <= 0.74), u => w(u) * 0.9, () => 0.003, 0, u => t(u) / 2 + 0.0013));
            // Bone string bridges at the ears' roots, and painted bands.
            const kink = line.find(p => p.u >= 0.72);
            for (const sx of [1, -1]) {
                H.Metal.push(K.band([sx * kink.x, kink.y, 0], [sx * Math.cos(kink.a), Math.sin(kink.a), 0], 0.01, 0.012, 0.0028, { sides: 10 }));
                H.Horn.push(CM.chamferBox([sx * (kink.x - Math.sin(kink.a) * 0.012), kink.y + 0.012, 0], [0.012, 0.01, 0.026], 0.002));
            }
            return { line, w, t, d: 0.5, limb: limbMesh(line, w, t, 0.5), riser: null, half, nocks: 'ear' };
        },
        compound(r, H) {
            const L = r.length, s = r.size, rr = 0.6 * L, cam = (0.026 + 0.022 * r.shape) * s;
            const line = limbLine(rr / 2 - 0.04, 0.03, 0.55, (L - rr) / 2 + 0.07, 0.25, 0, 1, false, 14);
            const w = () => 0.014, t = u => 0.016 - 0.004 * u;
            // A machined riser: a long plate cut through with windows, its grip in a polymer shell.
            const out = K.path([[-rr / 2, 0.03]], K.cubic([-rr / 2 + 0.03, 0.05], [-0.1, 0.0], [-0.05, 0.02], [-0.03, 0.03], 8), [[0.05, 0.03], [0.07, 0.012]], K.cubic([0.12, 0.0], [0.2, 0.045], [rr / 2 - 0.05, 0.05], [rr / 2, 0.03], 8), [[rr / 2, 0.005]], K.cubic([rr / 2 - 0.05, -0.04], [0.15, -0.075], [0.05, -0.05], [0.02, -0.04], 10), [[-0.05, -0.045]], K.cubic([-0.08, -0.06], [-0.18, -0.07], [-rr / 2 + 0.06, -0.03], [-rr / 2, 0.005], 10));
            // Windows through the riser above and below the grip, sized to the riser.
            const hx = q => q * rr / 0.57;
            const holes = [1, -1].map(sx => ({ pts: K.wind(K.path(K.cubic([sx * hx(0.11), -0.012], [sx * hx(0.16), 0.02], [sx * hx(0.2), 0.025], [sx * hx(0.23), 0.02], 6), K.cubic([sx * hx(0.23), 0.02], [sx * hx(0.2), -0.02], [sx * hx(0.16), -0.04], [sx * hx(0.11), -0.03], 6)), false), chamfer: 0.0018 }));
            H.Riser.push(K.plate(out, { t: () => 0.012, chamfer: 0.0025, holes }).body);
            H.Grip.push(K.apply(Mesh.sphere([0, 0, 0], 0.03, 18), p => [p[0] / 0.03 * 0.05 - 0.015, -0.035 + p[1], p[2] / 0.03 * 0.017]));
            // Split limbs, a cam at each end, cables crossing through a guard.
            const limbs = [];
            for (const z of [0.011, -0.011]) limbs.push(K.apply(limbMesh(line, w, t, 0.3), p => [p[0], p[1], p[2] + z]));
            const end = line[line.length - 1], ax = end.x + Math.cos(end.a) * 0.005, ay = end.y + Math.sin(end.a) * 0.005 + cam * 0.2;
            for (const sx of [1, -1]) {
                // An eccentric cam: a disc swollen on its outer side, round its axle.
                H.Metal.push(K.apply(Mesh.lathe([[cam * 0.3, -0.006], [cam, -0.006], [cam * 1.06, -0.003], [cam * 1.06, 0.003], [cam, 0.006], [cam * 0.3, 0.006]], 28, { base: [0, 0, 0], dir: [0, 0, 1], sharp: 0.7 }), p => [sx * ax + p[0] * (p[0] * sx > 0 ? 1.25 : 1), ay + p[1], p[2]]));
                H.Metal.push(Mesh.lathe([[0.0035, -0.016], [0.0035, 0.016]], 8, { base: [sx * ax, ay, 0], dir: [0, 0, 1] }));
                for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; H.Dark.push(Mesh.lathe([[cam * 0.18, -0.0062], [cam * 0.18, 0.0062]], 8, { base: [sx * ax + Math.cos(a) * cam * 0.6, ay + Math.sin(a) * cam * 0.6, 0], dir: [0, 0, 1] })); }
            }
            const camTop = ay + cam * 1.0, sx0 = ax;
            // Cables run nearly with the string, pushed aside by the cable guard where they pass the riser.
            const gy = camTop - 0.012, cables = [[[-sx0, ay - cam * 0.55, 0.004], [-0.05, gy - 0.004, 0.026], [0.05, gy - 0.002, 0.026], [sx0, ay + cam * 0.3, 0.004]], [[sx0, ay - cam * 0.55, -0.004], [0.05, gy - 0.008, 0.03], [-0.05, gy - 0.006, 0.03], [-sx0, ay + cam * 0.3, -0.004]]];
            for (const c of cables) H.String.push(K.tube(c, 0.0012, 5));
            H.Metal.push(Mesh.lathe([[0.004, 0], [0.004, Math.hypot(gy - 0.03, 0.024)]], 10, { base: [-0.06, 0.03, 0.006], dir: [0, gy - 0.03, 0.024] }), CM.chamferBox([-0.06, gy - 0.004, 0.028], [0.014, 0.012, 0.012], 0.002));
            // A pin sight on the riser's side and a stabilizer out the back.
            H.Metal.push(CM.chamferBox([0.09, -0.01, 0.022], [0.012, 0.04, 0.02], 0.002));
            H.Metal.push(Mesh.lathe([[0.016, -0.006], [0.02, -0.006], [0.02, 0.006], [0.016, 0.006]], 20, { base: [0.11, -0.028, 0.034], dir: [0, 1, 0], sharp: 0.6 }));
            for (let k = 0; k < 3; k++) H.Glow.push(K.bar([0.098 + k * 0.012, -0.028, 0.034], [0.11 + k * 0.004, -0.028, 0.034], [0, 1, 0], 0.0018, 0.0018));
            H.Metal.push(K.shaft([-0.06, -0.05, 0], [-0.06, -0.26, 0], () => 0.009, 12, { steps: 2 }), Mesh.lathe([[0.009, 0], [0.016, 0.008], [0.016, 0.03], [0.009, 0.036], [0, 0.037]], 16, { base: [-0.06, -0.26, 0], dir: [0, -1, 0], sharp: 0.6 }));
            H.Limb.push(...limbs);
            const string = [[-sx0, camTop, 0], [sx0, camTop, 0]];
            return { line, w, t, d: 0.3, limb: null, riser: true, half: L / 2, nocks: 'none', string, grip: [-0.05, 0.05], shelf: 0.06, tipAt: [ax, ay + cam, 0] };
        },
        elven(r, H) {
            const L = r.length, s = r.size, half = L / 2;
            const line = limbLine(0, 0, 0.02, half, 0.5 + 0.1 * r.shape, 0.6 + 1.1 * r.shape, 0.66, false, 40);
            const w = u => (u * half < 0.07 ? 0.03 : 0.03 - 0.02 * Math.pow(u, 0.9)) * s, t = u => (u * half < 0.07 ? 0.032 : 0.021 - 0.012 * u) * Math.sqrt(s);
            // A silver vein along the back, leaf blades at the tips, a crystal set in the grip's back.
            H.Metal.push(limbMesh(line.filter(p => p.u > 0.06 && p.u < 0.93), u => w(u) * 0.22, () => 0.0018, 0, u => t(u) / 2 + 0.0008));
            const tip = line[line.length - 1], leafOut = [];
            for (let k = 0; k <= 12; k++) { const q = k / 12; leafOut.push([q * 0.14 * s, Math.sin(Math.PI * Math.pow(q, 0.7)) * 0.024 * s]); }
            for (let k = 11; k >= 1; k--) { const q = k / 12; leafOut.push([q * 0.14 * s, -Math.sin(Math.PI * Math.pow(q, 0.7)) * 0.012 * s]); }
            const leafPlate = K.plate(leafOut, { t: () => 0.0022, chamfer: 0.0008, edge: 0.0004, sharp: () => true, bevel: 0.0035 });
            const at = line[Math.round(line.length * 0.8)];
            const turn = (m, px, py, a) => K.apply(K.copy(m), p => { const c = Math.cos(a), sn = Math.sin(a); return [px + p[0] * c - p[1] * sn, py + p[0] * sn + p[1] * c, p[2]]; });
            H.Metal.push(turn(leafPlate.body, at.x, at.y - t(at.u) * 0.5, at.a - 0.75), turn(leafPlate.edge, at.x, at.y - t(at.u) * 0.5, at.a - 0.75));
            H.Metal.push(K.mirror(turn(leafPlate.body, at.x, at.y - t(at.u) * 0.5, at.a - 0.75), 0), K.mirror(turn(leafPlate.edge, at.x, at.y - t(at.u) * 0.5, at.a - 0.75), 0));
            // A silver curl off each tip, and leaf guards on the grip's sides.
            for (const sx of [1, -1]) {
                const e = line[line.length - 1], c0 = [sx * e.x, e.y, 0];
                const curl = curve(q => { const a = q * Math.PI * 1.6, rad = 0.028 * s * (1 - 0.6 * q); return [c0[0] - sx * (Math.sin(a) * rad), c0[1] - 0.02 * s + Math.cos(a) * rad - rad * 0.2, 0]; }, 18);
                H.Metal.push(K.tube(curl, k => 0.0028 * s * (1 - 0.6 * k / 18), 8));
            }
            const guard = K.plate([[-0.07, 0], [-0.03, 0.012], [0.03, 0.012], [0.07, 0], [0.03, -0.006], [-0.03, -0.006]].map(([x, y]) => [x * s, y * s - 0.004]), { t: () => 0.0018, chamfer: 0.0007 });
            for (const z of [1, -1]) H.Metal.push(K.apply(K.copy(guard.body), p => [p[0], p[1], z * (0.0162 * s + 0.001) + p[2]]));
            H.Gem.push(K.gem([0, -0.014, 0], [0, -1, 0], 0.009 * s, 0.016 * s, 8, { low: 0.1, prism: 0.3 }));
            H.Metal.push(Mesh.lathe([[0.006, 0], [0.012 * s, 0.002], [0.0125 * s, 0.006], [0.0095 * s, 0.009]], 16, { base: [0, -0.012, 0], dir: [0, -1, 0], sharp: 0.6 }));
            void tip;
            return { line, w, t, d: 0.6, limb: limbMesh(line, w, t, 0.6), riser: null, half, nocks: 'tip' };
        },
        energy(r, H) {
            const L = r.length, s = r.size, rr = 0.42, lh = L / 2 - rr / 2 + 0.03;
            const line = limbLine(rr / 2 - 0.03, 0.012, 0.1, lh, 0.4, 0.3 + 0.8 * r.shape, 0.72, false, 30);
            const w = u => (0.034 - 0.02 * u) * s, t = u => 0.011 - 0.003 * u;
            // Limbs of chamfered plates with a glowing seam down their belly, emitters at the tips.
            const segs = 7;
            for (let k = 0; k < segs; k++) {
                const a = Math.floor(k / segs * (line.length - 1)), b = Math.floor((k + 0.86) / segs * (line.length - 1));
                H.Limb.push(limbMesh(line.slice(a, b + 1), w, t, 0.1));
            }
            H.Glow.push(limbMesh(line.slice(1, -1), u => w(u) * 0.25, () => 0.0025, 0, u => -(t(u) / 2 + 0.0005)));
            const out = K.path(K.cubic([-rr / 2, 0.022], [-0.1, 0.04], [-0.05, 0.034], [-0.03, 0.03], 8), [[0.06, 0.03], [0.07, 0.014], [0.1, 0.016]], K.cubic([0.1, 0.016], [0.15, 0.03], [rr / 2 - 0.04, 0.034], [rr / 2, 0.022], 8), [[rr / 2, -0.004], [0.12, -0.03], [0.04, -0.036], [0.0, -0.058], [-0.05, -0.052], [-0.1, -0.026], [-rr / 2, -0.004]]);
            H.Riser.push(K.plate(out, { t: () => 0.014, chamfer: 0.003, holes: [{ pts: K.circle(0.15, 0.0, 0.009, 10) }, { pts: K.circle(-0.15, 0.0, 0.009, 10) }] }).body);
            for (const z of [1, -1]) H.Glow.push(K.bar([-0.14, -0.012, z * 0.0142], [0.14, -0.012, z * 0.0142], [0, 0, z], 0.003, 0.0006));
            const end = line[line.length - 1];
            for (const sx of [1, -1]) H.Gem.push(K.gem([sx * end.x, end.y, 0], [sx * Math.cos(end.a), Math.sin(end.a), 0], 0.008, 0.03, 6));
            return { line, w, t, d: 0.1, limb: null, riser: true, half: L / 2, nocks: 'none', grip: [-0.05, 0.05], shelf: 0.065, glowString: true };
        }
    };

    function bowBuild(r, H) {
        const spec = BOWS[r.preset](r, H);
        const { line, t } = spec;
        if (spec.limb) H.Limb.push(spec.limb);
        // The lower limb is the upper one turned over the grip.
        for (const k of ['Limb', 'Laminate']) H[k] = H[k].concat(H[k].map(m => K.mirror(m, 0)));
        if (r.preset === 'elven') H.Metal = H.Metal.concat(H.Metal.slice(0, 1).map(m => K.mirror(m, 0)));
        // Nocks at the tips.
        const end = line[line.length - 1];
        if (spec.nocks === 'horn' || spec.nocks === 'tip' || spec.nocks === 'ear') {
            for (const sx of [1, -1]) {
                const base = [sx * (end.x - Math.cos(end.a) * 0.03), end.y - Math.sin(end.a) * 0.03, 0], dir = [sx * Math.cos(end.a), Math.sin(end.a), 0];
                const rr = spec.w(1) * 0.5;
                const m = Mesh.lathe([[rr * 1.02, 0], [rr * 1.12, 0.006], [rr * 1.08, 0.02], [rr * 0.6, 0.03], [rr * 0.5, 0.034], [0, 0.04]], 10, { base, dir, sharp: 0.6 });
                (spec.nocks === 'horn' ? H.Horn : spec.nocks === 'ear' ? H.Horn : H.Metal).push(m);
            }
        }
        // The string, its serving at the middle and a brass nocking point.
        const sr = r.preset === 'energy' ? 0.0016 : 0.0013;
        const path = spec.string || stringPath(line, t, sr * 0.9);
        const sy = path[Math.floor(path.length / 2)][1];
        (spec.glowString ? H.Glow : H.String).push(K.tube(path, sr, 6));
        if (!spec.glowString) {
            H.Serving.push(K.shaft([-0.08, sy, 0], [0.08, sy, 0], () => sr * 1.5, 8, { steps: 2, v: 0.1 }));
            H.Metal.push(K.band([0.012, sy, 0], [1, 0, 0], sr * 1.3, 0.004, 0.0012, { sides: 8 }));
        }
        // The grip: wrapped leather, an arrow plate above it.
        const grip = spec.grip || [-0.055, 0.055], shelf = spec.shelf ?? 0.06;
        if (!spec.riser) {
            const gw = spec.w(0) / 2 + 0.0016, gt = spec.t(0) / 2 + 0.0016;
            H.Grip.push(K.apply(K.shaft([grip[0], 0, 0], [grip[1], 0, 0], q => 1 + (q < 0.05 || q > 0.95 ? -0.05 : 0), 16, { steps: 6, v: 0.12 }), p => [p[0], p[1] * gt, p[2] * gw]));
            for (const x of [grip[0] - 0.004, grip[1] - 0.004]) H.Metal.push(K.apply(K.band([x, 0, 0], [1, 0, 0], 1, 0.008, 0.08), p => [p[0], p[1] * gt, p[2] * gw]));
            H.Horn.push(CM.chamferBox([shelf + 0.012, 0, gw - 0.0015], [0.028, spec.t(0) * 0.7, 0.003], 0.001));
        } else {
            H.Grip.push(K.apply(Mesh.sphere([0, 0, 0], 0.024, 18), p => [p[0] / 0.024 * 0.055, -0.026 + p[1], p[2] / 0.024 * 0.0175]));
        }
        // A nocked arrow on the shelf, its point out past the back.
        if (r.arrow) {
            const a = place(arrow(0.76, { r: 0.0038 }), [shelf + 0.006, sy, 0.012], [0, -1, 0], [1, 0, 0]);
            H.Shaft.push(...a.shaft); H.Head.push(...a.head); H.Fletch.push(...a.fletch); H.Nock.push(...a.nock);
        }
        const tipAt = spec.tipAt || [end.x, end.y, 0];
        return { marks: { gripBottom: [grip[0], 0, 0], gripTop: [shelf - 0.006, 0, 0], tip: tipAt, edge: [0, -0.05, 0] }, light: [0, -0.02, 0] };
    }

    // ── the crossbow ───────────────────────────────────────────────────────
    function crossbow(r, H) {
        const s = r.size, L = r.length, back = -L * 0.62, nose = L * 0.38, prod = (0.28 + 0.16 * r.shape) * s;
        // The stock: a side profile with a pistol grip, its edges chamfered.
        const gx = -L * 0.18;
        const out = K.path([[back, 0.022], [nose - 0.02, 0.022], [nose, 0.012], [nose, -0.018], [nose - 0.03, -0.026]], K.cubic([gx + 0.08, -0.03], [gx + 0.05, -0.03], [gx + 0.04, -0.04], [gx + 0.03, -0.06], 6), [[gx + 0.0, -0.13], [gx - 0.045, -0.13]], K.cubic([gx - 0.04, -0.12], [gx - 0.03, -0.07], [gx - 0.05, -0.045], [gx - 0.09, -0.042], 6), K.cubic([gx - 0.12, -0.04], [back + 0.1, -0.05], [back + 0.04, -0.075], [back, -0.085], 8));
        H.Stock.push(K.plate(out, { t: () => 0.019, chamfer: 0.0045 }).body);
        H.Dark.push(CM.chamferBox([(back + nose) / 2 + 0.05, 0.0225, 0], [nose - back - 0.12, 0.002, 0.012], 0.0005));
        H.Metal.push(CM.chamferBox([back + 0.006, -0.03, 0], [0.012, 0.11, 0.042], 0.003));
        // The prod across the nose, a stirrup in front of it.
        const line = limbLine(0, 0, 0, prod, 0.5, 0.4 + 0.4 * r.shape, 0.75, false, 22);
        const w = u => (0.03 - 0.012 * u) * s, t = u => (0.016 - 0.006 * u);
        const turn = p => [nose - 0.045 - p[1], p[2], p[0]];
        const limb = K.apply(limbMesh(line, w, t, 0.2), turn, true), lam = K.apply(limbMesh(line, u => w(u) * 0.85, () => 0.0025, 0, u => t(u) / 2 + 0.001), turn, true);
        H.Prod.push(limb, K.mirror(limb, 2)); H.Laminate.push(lam, K.mirror(lam, 2));
        H.Metal.push(CM.chamferBox([nose - 0.045, 0.0, 0], [0.04, 0.05, 0.062], 0.004));
        for (const z of [1, -1]) H.Metal.push(K.rivet([nose - 0.045, 0.026, z * 0.016], [0, 1, 0], 0.004));
        // (A stirrup: a loop of rod out in front of the nose, for the foot while spanning.)
        const stir = K.arc(0, 0, 0.04 * s, Math.PI * 0.08, Math.PI * 0.92, 16).map(([a, b]) => [nose + 0.004 + b, -0.004, a]);
        H.Metal.push(K.tube([[nose - 0.012, 0.0, stir[0][2]]].concat(stir, [[nose - 0.012, 0.0, stir[stir.length - 1][2]]]), 0.0042, 8));
        // The string drawn back to the nut, a bolt laid in the groove.
        const end = line[line.length - 1], tipA = turn([end.x, end.y, 0]), tipB = [tipA[0], tipA[1], -tipA[2]], nutX = gx + 0.07;
        H.String.push(K.tube([tipA, [nutX, 0.026, 0], tipB], 0.0014, 6));
        H.Metal.push(Mesh.lathe([[0.012, -0.012], [0.012, 0.012]], 16, { base: [nutX - 0.004, 0.022, 0], dir: [0, 0, 1] }));
        for (const z of [1, -1]) {
            H.Metal.push(K.plate([[nutX - 0.06, -0.01], [nutX + 0.03, -0.01], [nutX + 0.04, 0.012], [nutX - 0.07, 0.012]], { t: () => 0.0012, chamfer: 0.0005 }).body);
            H.Metal[H.Metal.length - 1] = K.apply(H.Metal[H.Metal.length - 1], p => [p[0], p[1], p[2] + z * 0.0195]);
            for (const x of [nutX - 0.05, nutX + 0.02]) H.Metal.push(K.rivet([x, 0.0, z * 0.021], [0, 0, z], 0.0028));
        }
        if (r.arrow) {
            const a = place(arrow(0.36, { r: 0.0045, bolt: true, head: 0.85, fletch: r.shape }), [nutX - 0.004, 0.028, 0], [1, 0, 0], [0, 1, 0]);
            H.Shaft.push(...a.shaft); H.Head.push(...a.head); H.Fletch.push(...a.fletch); H.Nock.push(...a.nock);
        }
        // Trigger and guard ahead of the grip.
        const tx = gx + 0.045;
        H.Metal.push(K.plate([[tx, -0.024], [tx + 0.006, -0.024], [tx + 0.002, -0.05], [tx - 0.004, -0.05]], { t: () => 0.003, chamfer: 0.0008 }).body);
        H.Metal.push(K.tube([[gx + 0.035, -0.028, 0], [tx + 0.03, -0.034, 0], [tx + 0.032, -0.06, 0], [tx + 0.01, -0.07, 0], [gx + 0.012, -0.066, 0]], 0.0028, 6));
        return { marks: { gripTop: [gx - 0.01, -0.035, 0], gripBottom: [gx - 0.03, -0.12, 0], trigger: [tx, -0.04, 0], muzzle: [nose + 0.06, 0.028, 0], rear: [back, 0.0, 0], stock: [back, -0.03, 0], foreGrip: [nose - 0.12, -0.022, 0] } };
    }

    // ── the quiver ─────────────────────────────────────────────────────────
    function quiver(r, H) {
        const L = r.length, s = r.size, rad = 0.045 * s;
        // A stitched leather tube, oval, wider at its mouth, a rim and a foot of metal.
        const body = K.shaft([0, 0, 0], [L, 0, 0], q => rad * (0.82 + 0.18 * q), 24, { steps: 10, v: 0.3, caps: true });
        K.apply(body, p => [p[0], p[1] * 0.7, p[2]]);
        H.Grip.push(body);
        for (const [x, ww] of [[L - 0.022, 0.022], [0.0, 0.018]]) H.Metal.push(K.apply(K.band([x - 0.002, 0, 0], [1, 0, 0], rad * (0.82 + 0.18 * x / L), ww, 0.0025, { sides: 24 }), p => [p[0], p[1] * 0.7, p[2]]));
        H.Laminate.push(K.apply(K.band([L * 0.45, 0, 0], [1, 0, 0], rad * 0.9, 0.05, 0.0018, { sides: 24 }), p => [p[0], p[1] * 0.7, p[2]]));
        // A strap down its side with buckles.
        const strap = [[L * 0.08, -rad * 0.7 - 0.001, 0], [L * 0.3, -rad * 0.82, 0.004], [L * 0.6, -rad * 0.9, 0.004], [L * 0.86, -rad * 0.85, 0]];
        H.Strap.push(K.sweep(strap, K.roundRect(0.03, 0.004, 0.0015, 1), { up: [0, 1, 0] }));
        for (const p of [strap[0], strap[3]]) H.Metal.push(CM.chamferBox([p[0], p[1] - 0.003, p[2]], [0.02, 0.006, 0.036], 0.0015));
        // Arrows standing in it.
        const n = Math.round(3 + 9 * r.shape);
        for (let k = 0; k < n; k++) {
            const a = k * 2.4, rr = rad * 0.55 * Math.sqrt((k + 0.5) / n), y = Math.cos(a) * rr * 0.65, z = Math.sin(a) * rr, len = 0.74;
            const ar = place(arrow(len, { r: 0.0036, fletch: 0.5 }), [L + 0.2 + 0.02 * Math.sin(k * 1.7), y, z], [-1, -y * 0.05, -z * 0.05], [0, Math.cos(k), Math.sin(k)]);
            // Only what shows above the rim: fletching and the top of the shaft; the heads are inside.
            H.Shaft.push(...ar.shaft); H.Fletch.push(...ar.fletch); H.Nock.push(...ar.nock);
        }
        return { marks: null };
    }

    // ── the build ──────────────────────────────────────────────────────────
    function build(recipe, cache) {
        const r = normalize(recipe), c = cache || {};
        const H = { Limb: [], Laminate: [], Riser: [], Prod: [], Stock: [], Grip: [], Strap: [], Metal: [], Horn: [], String: [], Serving: [], Shaft: [], Head: [], Fletch: [], Nock: [], Glow: [], Gem: [], Dark: [] };
        let marks = null, opts = { template: 'blade' };
        if (r.preset === 'crossbow') { marks = crossbow(r, H).marks; opts = { template: 'gun', toWorld: p => p.slice() }; }
        else if (r.preset === 'quiver') { quiver(r, H); opts = { template: null }; }
        else if (r.preset === 'arrow') {
            const a = arrow(r.length, { head: r.size, fletch: r.shape });
            Object.assign(H, { Shaft: a.shaft, Head: a.head, Fletch: a.fletch, Nock: a.nock });
            marks = { gripBottom: [r.length * 0.12, 0, 0], gripTop: [r.length * 0.22, 0, 0], tip: [r.length + 0.04 * r.size, 0, 0], edge: [r.length, -0.012, 0] };
        } else marks = bowBuild(r, H).marks;
        const textures = {}, trim = K.look(r.metal), wood = !WOODLESS.has(r.preset);
        const woodKey = r.wood;
        if (c.woodKey !== woodKey) { c.wood = K.woodPicture(K.WOOD[r.wood], 31 + K.WOODS.findIndex(w => w[0] === r.wood), 'bow-wood.png'); c.woodKey = woodKey; }
        textures['bow-wood.png'] = c.wood;
        // A recurve's riser in a wood that stands apart from its limbs: pale against dark, dark against pale.
        if (r.preset === 'recurve') {
            const dark = ['walnut', 'ebony', 'oak', 'yew'].includes(r.wood), riserWood = dark ? '#c9a46c' : '#4a2c1c';
            if (c.riserKey !== riserWood) { c.riser = K.woodPicture(riserWood, 77, 'bow-riser.png'); c.riserKey = riserWood; }
            textures['bow-riser.png'] = c.riser;
        }
        const wrapKey = r.wrapColor + (r.preset === 'quiver' ? 'q' : '');
        if (c.wrapKey !== wrapKey) { c.wrap = K.wrapPicture(r.preset === 'quiver' ? 'cord' : 'leather', r.wrapColor, 'bow-wrap.png'); c.wrapKey = wrapKey; }
        textures['bow-wrap.png'] = c.wrap;
        const lam = { longbow: '#2a201c', recurve: '#d8c49a', composite: '#c84a2a', elven: '#e2e4ea', crossbow: '#2a2a2e', quiver: '#c8a040' }[r.preset] || '#1b1b1f';
        const glowLook = { kind: 'prop', color: K.shadeHex(r.glow, 0.55), emissive: r.glow, emissiveIntensity: 0.85, roughness: 0.3, metalness: 0 };
        const P = {
            Limb: { meshes: H.Limb, look: wood ? { kind: 'prop', texture: 'bow-wood.png', roughness: 0.5, metalness: 0, mat: 'wood' } : { kind: 'metal', color: r.preset === 'energy' ? '#d8dce4' : '#26272a', roughness: 0.35, metalness: r.preset === 'energy' ? 0.6 : 0.2, mat: 'metal' } },
            Prod: { meshes: H.Prod, look: { kind: 'metal', color: trim.color, roughness: trim.roughness, metalness: trim.metalness, mat: 'metal' } },
            Laminate: { meshes: H.Laminate, look: { kind: 'prop', color: lam, roughness: 0.4, metalness: r.preset === 'elven' ? 0.9 : 0.05 } },
            Riser: { meshes: H.Riser, look: r.preset === 'recurve' ? { kind: 'prop', texture: 'bow-riser.png', roughness: 0.42, metalness: 0, mat: 'wood' } : { kind: 'metal', color: r.preset === 'energy' ? '#2e3036' : trim.color, roughness: 0.38, metalness: 0.8, mat: 'metal' } },
            Stock: { meshes: H.Stock, look: { kind: 'prop', texture: 'bow-wood.png', roughness: 0.5, metalness: 0, mat: 'wood' } },
            Grip: { meshes: H.Grip, look: { kind: 'prop', texture: 'bow-wrap.png', roughness: 0.75, metalness: 0, mat: 'leather' } },
            Strap: { meshes: H.Strap, look: { kind: 'prop', color: '#2a1d15', roughness: 0.7, metalness: 0, mat: 'leather' } },
            Metal: { meshes: H.Metal, look: { kind: 'metal', color: trim.color, roughness: trim.roughness, metalness: trim.metalness, mat: 'metal' } },
            Horn: { meshes: H.Horn, look: { kind: 'prop', color: '#e6dcc4', roughness: 0.35, metalness: 0, mat: 'leather' } },
            String: { meshes: H.String, look: { kind: 'prop', color: r.string, roughness: 0.7, metalness: 0 } },
            Serving: { meshes: H.Serving, look: { kind: 'prop', color: '#1b1b1f', roughness: 0.6, metalness: 0 } },
            Shaft: { meshes: H.Shaft, look: { kind: 'prop', color: '#b89668', roughness: 0.6, metalness: 0 } },
            Head: { meshes: H.Head, look: { kind: 'metal', color: '#9ea4ac', roughness: 0.35, metalness: 0.9, mat: 'metal' } },
            Fletch: { meshes: H.Fletch, look: { kind: 'prop', color: r.preset === 'arrow' || r.preset === 'quiver' ? r.wrapColor : '#8a1a2a', roughness: 0.85, metalness: 0 } },
            Nock: { meshes: H.Nock, look: { kind: 'prop', color: '#f2efe6', roughness: 0.4, metalness: 0 } },
            Dark: { meshes: H.Dark, look: { kind: 'prop', color: '#141416', roughness: 0.6, metalness: 0.3 } },
            Gem: { meshes: H.Gem, look: glowLook },
            Glow: { meshes: H.Glow, look: glowLook }
        };
        if (!marks) opts.template = null;
        return K.finish('bow', r, P, marks || {}, textures, opts);
    }

    /** A random bow: a style of its own (another when Everything rolls); shape its length and curve; details the nocked arrow; colors wood, metal, wrap and string. */
    function random(seed, recipe, scope, keep) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur));
        const all = !scope || scope === 'all', has = part => all || scope === part;
        const family = all && !keep ? R.pick(PRESETS) : PRESETS.find(p => p[0] === cur.preset);
        const base = family[3], fam = FAMILY[family[0]];
        out.preset = family[0];
        if (has('shape')) { out.length = Math.max(fam.range[0], Math.min(fam.range[1], R.jitter(base.length, 0.1))); out.size = R.jitter(1, 0.15, 0.6, 1.6); out.shape = R.range(0.1, 0.95); }
        else if (out.preset !== cur.preset) Object.assign(out, { length: base.length, size: 1, shape: base.shape });
        if (has('details')) out.arrow = R.chance(0.5);
        if (has('colors')) { out.wood = R.pick(K.WOODS)[0]; out.metal = R.pick(K.TRIMS)[0]; out.wrapColor = R.pick(Rand.PALETTES.leather.concat(Rand.PALETTES.cloth.slice(0, 5))); out.string = R.pick(['#e8dcc0', '#2a2a2e', '#f2efe6', '#c8501e', '#8a1a2a']); out.glow = R.pick(Rand.PALETTES.glow); }
        return normalize(out);
    }

    const api = { PRESETS, FAMILY, normalize, build, random, limbLine, arrow };
    root.RRRangedProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel || (typeof require === 'function' ? require('./PropModel.js') : null);
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'bow', label: 'Bow', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        K.icons(Catalog);
        Catalog.category({ id: 'bows', label: 'Bows & Crossbows', order: 47, parent: 'weapons' });
        for (const [id, label, category] of PRESETS) Catalog.add({ id: 'bow-' + id, category, label, icon: FAMILY[id].icon, kind: 'bow', keywords: 'weapon ranged bow archery ' + id, start: () => normalize({ preset: id }), matches: r => r.preset === id });
        Catalog.ui('bow', K.page({
            placeholder: 'Bow', PRESETS, normalize, random, keep: ['wood', 'metal', 'wrapColor', 'string', 'glow'],
            shape(r) {
                const fam = FAMILY[r.preset], bowish = !['arrow', 'quiver'].includes(r.preset);
                return this._slider({ path: 'length', label: 'Length', range: fam.range, step: 0.01, format: 'm' })
                    + this._slider({ path: 'size', label: fam.size || 'Limb width', range: [0.6, 1.6], step: 0.01, format: 'x' })
                    + this._slider({ path: 'shape', label: fam.shape, range: [0, 1] }) + (bowish ? this._check('arrow', r.preset === 'crossbow' ? 'Bolt loaded' : 'Arrow nocked') : '');
            },
            look(r) {
                const glows = r.preset === 'energy' || r.preset === 'elven';
                return this._section('Materials') + (WOODLESS.has(r.preset) ? '' : this._select('wood', 'Wood', K.WOODS)) + this._select('metal', 'Metal', K.TRIMS)
                    + this._color('wrapColor', r.preset === 'arrow' || r.preset === 'quiver' ? (r.preset === 'arrow' ? 'Fletching' : 'Leather') : 'Grip wrap', ['#4a2c1c', '#1b1b22', '#8a1a2a', '#2e5a3a', '#c8a040'])
                    + (['arrow', 'quiver'].includes(r.preset) ? '' : this._color('string', 'String', ['#e8dcc0', '#2a2a2e', '#f2efe6', '#c8501e']))
                    + (glows ? this._section('Glow') + this._color('glow', 'Glow color', ['#58c8ff', '#7aff6a', '#38f0d8', '#c86aff', '#ffd24a']) : '');
            }
        }));
    }
})(typeof window !== 'undefined' ? window : globalThis);
