/**
 * RRSpeakerProp - Speakers for the Stage gear beside the microphone: a
 * bookshelf speaker, a floor monitor wedge, a guitar amp combo, a tall tower
 * and a sci-fi pod of our own. Each driver is turned: a basket rim, a rubber
 * surround, a cone recessed into the baffle through a real hole cut in it, a
 * dust cap; tweeters are domes in faceplates, ports are flared and dark
 * inside. A grille (woven cloth, or a metal mesh on the wedge) goes over the
 * front, or comes off to show the drivers.
 *
 * Built in weapon space (RRWeaponKit) with +z up and its front toward -y,
 * laid out by its finish (on the floor, centered). Made once per recipe;
 * nothing changes per frame.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const CM = need('RRContainerMesh', './ContainerMesh.js');
    const Paint = need('RRPropPaint', './PropPaint.js');
    const HS = need('RRHardSurface', './HardSurface.js');
    const K = need('RRWeaponKit', './WeaponKit.js');
    const { clamp, color, pick } = K;
    const { add, sub, mul, norm, cross } = K.vec;

    // [id, label, defaults]
    const PRESETS = [
        ['bookshelf', 'Bookshelf speaker', { cones: 1, tweeter: true, grille: false, color: '#2a211c', grilleColor: '#2b2c30', accent: '#b8bcc2', glow: false }],
        ['wedge', 'Floor monitor wedge', { cones: 1, tweeter: true, grille: true, color: '#1c1d20', grilleColor: '#2e3034', accent: '#9a9ea4', glow: false }],
        ['amp', 'Guitar amp', { cones: 1, tweeter: false, grille: true, color: '#1b1b1d', grilleColor: '#c8b89a', accent: '#d8d2c4', glow: false }],
        ['tower', 'Tower speaker', { cones: 3, tweeter: true, grille: false, color: '#ece8e0', grilleColor: '#3a3b40', accent: '#8a8e94', glow: false }],
        ['pod', 'Sci-fi speaker pod', { cones: 1, tweeter: true, grille: false, color: '#d8dde4', grilleColor: '#22262e', accent: '#38d8ff', glow: true }]
    ];
    /** What each style shows: how many woofers it takes. */
    const CONES = { bookshelf: [1, 2], wedge: [1, 2], amp: [1, 4], tower: [2, 4], pod: [1, 1] };
    const IDS = PRESETS.map(p => p[0]), BY_ID = new Map(PRESETS.map(p => [p[0], p[2]]));

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, IDS, 'bookshelf'), base = BY_ID.get(preset), [lo, hi] = CONES[preset];
        const v = key => (r[key] !== undefined ? r[key] : base[key]);
        return {
            kind: 'speaker', preset, size: clamp(r.size, 0.6, 1.6, 1), cones: Math.round(clamp(v('cones'), lo, hi, base.cones)),
            tweeter: !!v('tweeter'), grille: preset !== 'pod' && !!v('grille'), color: color(v('color'), base.color), grilleColor: color(v('grilleColor'), base.grilleColor), accent: color(v('accent'), base.accent), glow: !!v('glow')
        };
    }

    // ── parts ──────────────────────────────────────────────────────────────
    const lathe = (prof, at, dir, n, o) => Mesh.lathe(prof, n || 32, Object.assign({ base: at, dir, sharp: 0.55 }, o || {}));
    /** A woofer at `c` on a face (its outward normal `n`): rim, surround, cone sunk into the cabinet, dust cap. */
    function woofer(H, c, n, Rw, coax) {
        const d = Rw * 0.4;
        H.Trim.push(lathe([[Rw * 0.98, -0.002], [Rw * 1.12, -0.002], [Rw * 1.12, 0.002], [Rw * 1.08, 0.0042], [Rw * 0.98, 0.0042], [Rw * 0.98, -0.002]], c, n, 40, { caps: false }));
        H.Rubber.push(lathe([[Rw * 0.84, 0], [Rw * 0.99, 0], [Rw * 0.99, 0.003], [Rw * 0.96, 0.0068], [Rw * 0.915, 0.0082], [Rw * 0.87, 0.0068], [Rw * 0.84, 0.003], [Rw * 0.84, 0]], c, n, 40, { caps: false }));
        H.Cone.push(lathe([[0, -d], [Rw * 0.86, -d], [Rw * 0.86, 0.0008], [Rw * 0.62, -d * 0.42], [Rw * 0.32, -d * 0.78], [0, -d * 0.78]], c, n, 40));
        if (!coax) H.Cap.push(lathe([[0, -d * 0.82], [Rw * 0.31, -d * 0.82], [Rw * 0.29, -d * 0.7], [Rw * 0.2, -d * 0.6], [0, -d * 0.56]], c, n, 24));
        return d;
    }
    /** A dome tweeter in its faceplate. */
    function tweeter(H, c, n, rt) {
        H.Trim.push(lathe([[rt * 1.04, -0.002], [rt * 1.9, -0.002], [rt * 1.9, 0.0015], [rt * 1.7, 0.0035], [rt * 1.04, 0.0035], [rt * 1.04, -0.002]], c, n, 32, { caps: false }));
        H.Cap.push(lathe([[0, -0.004], [rt * 1.05, -0.004], [rt * 1.05, 0.001], [rt * 0.85, 0.0045], [rt * 0.5, 0.0068], [0, 0.0074]], c, n, 24));
    }
    /** A bass port: a flared lip round a hole, dark inside. */
    function port(H, c, n, rp, depth) {
        H.Rubber.push(lathe([[rp, -depth], [rp * 1.04, -depth], [rp * 1.04, -0.004], [rp * 1.35, 0.001], [rp * 1.3, 0.003], [rp, 0.0015], [rp, -depth]], c, n, 28, { caps: false }));
        H.Dark.push(lathe([[0, -depth], [rp * 1.02, -depth], [rp * 1.02, -depth + 0.002], [0, -depth + 0.002]], c, n, 20));
    }
    /** A flat panel in the plane through `o` spanned by u (across) and v (up), its outward normal u x v: `outline` in (u, v), `holes` cut through. */
    const panel = (outline, t, ch, o, u, v, holes) => HS.plate(outline, t, ch, { holes, frame: { o, u, v, n: cross(u, v) }, smooth: 40 });
    /** Uvs for woven cloth facing along `n`: its own across and up, in tiles of `s` meters. */
    function clothUv(m, u, v, s) {
        const P = m.positions, uv = new Float32Array(P.length / 3 * 2);
        for (let i = 0; i < P.length / 3; i++) { const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; uv[i * 2] = (p[0] * u[0] + p[1] * u[1] + p[2] * u[2]) / s; uv[i * 2 + 1] = (p[0] * v[0] + p[1] * v[1] + p[2] * v[2]) / s; }
        m.uvs = uv;
        return m;
    }
    /** A metal mesh grille over a face: a frame and a fine grid of bars `gap` apart, `lift` out from it. */
    function mesh(H, o, u, v, w, h, gap, lift) {
        const n = cross(u, v), at = (a, b) => add(add(o, mul(u, a)), add(mul(v, b), mul(n, lift)));
        for (let a = -w / 2 + gap; a < w / 2 - gap * 0.5; a += gap) H.Grille.push(K.bar(at(a, -h / 2), at(a, h / 2), n, 0.0016, 0.0016));
        for (let b = -h / 2 + gap; b < h / 2 - gap * 0.5; b += gap) H.Grille.push(K.bar(at(-w / 2, b), at(w / 2, b), n, 0.0016, 0.0016));
        for (const [p, q] of [[at(-w / 2, -h / 2), at(w / 2, -h / 2)], [at(-w / 2, h / 2), at(w / 2, h / 2)], [at(-w / 2, -h / 2), at(-w / 2, h / 2)], [at(w / 2, -h / 2), at(w / 2, h / 2)]]) H.Grille.push(K.bar(p, q, n, 0.008, 0.005));
    }

    // ── the speakers ───────────────────────────────────────────────────────
    const X = [1, 0, 0], Z = [0, 0, 1], FRONT = [0, -1, 0];
    /** A box cabinet W x D x Hh standing on the floor, its baffle (bt thick) cut for `holes` [[x, z, r]]; returns the baffle's face y. */
    function cabinet(H, W, D, Hh, bt, holes, ch) {
        H.Cab.push(HS.chamferedBox([0, bt / 2, Hh / 2], [W, D - bt, Hh], ch));
        const y = -D / 2, outline = HS.round([[-W / 2, 0], [W / 2, 0], [W / 2, Hh], [-W / 2, Hh]], ch * 1.2, 3);
        // The baffle in the x-z plane facing -y (u = x, v = z: u x v = -y).
        H.Cab.push(panel(outline, bt, ch * 0.7, [0, y + bt / 2, 0], X, Z, holes.map(([x, z, rr]) => HS.circle(x, z, rr, 40))));
        return y;
    }
    function cloth(H, W, Hh, y, z0, o) {
        const opt = o || {}, out = HS.round([[-W / 2, z0], [W / 2, z0], [W / 2, z0 + Hh], [-W / 2, z0 + Hh]], opt.r ?? 0.008, 3);
        H.Cloth.push(clothUv(panel(out, opt.t || 0.008, 0.0025, [0, y - (opt.t || 0.008) / 2 - 0.0008, 0], X, Z), X, Z, 0.05));
    }
    const BUILD = {
        bookshelf(r, H) {
            const two = r.cones > 1, W = 0.2, D = 0.25, Hh = two ? 0.42 : 0.33, Rw = two ? 0.058 : 0.068, bt = 0.018;
            const zt = Hh - 0.05, zw = two ? [Hh * 0.56, Hh * 0.27] : [Hh * 0.47], zp = 0.04, holes = [[0, zp, 0.018]];
            if (r.tweeter) holes.push([0, zt, 0.014]);
            for (const z of zw) holes.push([0, z, Rw * 0.99]);
            const y = cabinet(H, W, D, Hh, bt, holes, 0.006), face = [0, y, 0];
            for (const z of zw) woofer(H, add(face, [0, 0, z]), FRONT, Rw);
            if (r.tweeter) tweeter(H, add(face, [0, 0, zt]), FRONT, 0.0135);
            port(H, add(face, [0, 0, zp]), FRONT, 0.018, bt - 0.001);
            H.Dark.push(lathe([[0, 0], [0.0185, 0], [0.0185, 0.001], [0, 0.001]], [0, y + bt + 0.0002, zp], FRONT, 20));
            if (r.grille) cloth(H, W - 0.008, Hh - 0.008, y, 0.004);
            for (const [x, yy] of [[-W * 0.38, -D * 0.36], [W * 0.38, -D * 0.36], [-W * 0.38, D * 0.36], [W * 0.38, D * 0.36]]) H.Rubber.push(lathe([[0, 0], [0.008, 0], [0.008, 0.004], [0, 0.004]], [x, yy, -0.004], Z, 12));
        },
        tower(r, H) {
            const n = r.cones, W = 0.22, D = 0.3, Rw = 0.066, bt = 0.02, top = 0.08 + n * 0.17 + 0.2, Hh = Math.max(0.9, top), zt = Hh - 0.07, zp = 0.14;
            const zw = Array.from({ length: n }, (_, i) => zt - 0.13 - i * 0.165), holes = [[0, zp, 0.022], ...zw.map(z => [0, z, Rw * 0.99])];
            if (r.tweeter) holes.push([0, zt, 0.014]);
            const lift = 0.03;
            const y = cabinet(H, W, D, Hh, bt, holes.map(([x, z, rr]) => [x, z - lift, rr]), 0.008);
            for (const m of [H.Cab[H.Cab.length - 2], H.Cab[H.Cab.length - 1]]) K.apply(m, p => [p[0], p[1], p[2] + lift]);
            const face = [0, y, 0];
            for (const z of zw) woofer(H, add(face, [0, 0, z]), FRONT, Rw);
            if (r.tweeter) tweeter(H, add(face, [0, 0, zt]), FRONT, 0.014);
            port(H, add(face, [0, 0, zp]), FRONT, 0.022, bt - 0.001);
            H.Dark.push(lathe([[0, 0], [0.0225, 0], [0.0225, 0.001], [0, 0.001]], [0, y + bt + 0.0002, zp], FRONT, 20));
            if (r.grille) cloth(H, W - 0.01, Hh - 0.02, y, lift + 0.006);
            // A plinth under it on four spikes.
            H.Trim.push(HS.chamferedBox([0, 0, lift - 0.006], [W + 0.06, D + 0.06, 0.012], 0.003));
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) H.Trim.push(lathe([[0, 0], [0.009, 0.012], [0.009, 0.02], [0, 0.02]], [sx * (W / 2 + 0.015), sy * (D / 2 + 0.015), 0], Z, 12));
        },
        amp(r, H) {
            const n = r.cones, W = n > 2 ? 0.74 : n > 1 ? 0.68 : 0.5, Hh = n > 2 ? 0.72 : 0.46, D = 0.26, panelH = 0.09, bt = 0.015;
            const Rw = n > 2 ? 0.14 : n > 1 ? 0.13 : 0.15, area = Hh - panelH - 0.03, cols = n > 1 ? 2 : 1, rows = n > 2 ? 2 : 1, pos = [];
            for (let i = 0; i < n; i++) { const cx = cols > 1 ? (i % 2 ? 1 : -1) * W * 0.22 : 0, cz = 0.015 + area * (rows > 1 ? (Math.floor(i / 2) ? 0.27 : 0.73) : 0.5); pos.push([cx, cz]); }
            const y = cabinet(H, W, D, Hh, bt, pos.map(([x, z]) => [x, z, Rw * 0.99]), 0.012);
            const face = [0, y, 0];
            for (const [x, z] of pos) woofer(H, add(face, [x, 0, z]), FRONT, Rw);
            if (r.grille) {
                cloth(H, W - 0.05, area - 0.01, y, 0.022, { r: 0.012 });
                // Piping round the cloth, and a badge on it.
                const pip = HS.round([[-W / 2 + 0.022, 0.02], [W / 2 - 0.022, 0.02], [W / 2 - 0.022, area + 0.014], [-W / 2 + 0.022, area + 0.014]], 0.012, 3);
                H.Trim.push(panel(pip, 0.004, 0.0012, [0, y - 0.001, 0], X, Z, [HS.offset(pip, 0.005)]));
                H.Trim.push(HS.chamferedBox([-W * 0.3, y - 0.011, area - 0.045], [0.09, 0.006, 0.026], 0.0025));
            }
            // The control panel along its top: a plate, a row of knobs, a jack and a light.
            const zp = Hh - panelH / 2 - 0.012;
            H.Panel.push(HS.chamferedBox([0, y - 0.003, zp], [W - 0.04, 0.008, panelH - 0.02], 0.002));
            const k = n > 1 ? 8 : 6;
            for (let i = 0; i < k; i++) {
                const x = -W * 0.32 + i * (W * 0.62) / (k - 1);
                H.Knob.push(lathe([[0, 0], [0.012, 0], [0.012, 0.004], [0.0105, 0.016], [0.008, 0.019], [0, 0.0195]], [x, y - 0.007, zp], FRONT, 18));
                H.Trim.push(lathe([[0, 0], [0.003, 0], [0.003, 0.0004], [0, 0.0004]], [x, y - 0.0265, zp + 0.004], FRONT, 8));
            }
            H.Trim.push(lathe([[0.004, 0], [0.008, 0], [0.008, 0.006], [0.004, 0.006], [0.004, 0]], [-W * 0.42, y - 0.007, zp], FRONT, 16, { caps: false }));
            H.Dark.push(lathe([[0, 0], [0.0042, 0], [0.0042, 0.003], [0, 0.003]], [-W * 0.42, y - 0.005, zp], FRONT, 12));
            H.Glow.push(lathe([[0, 0], [0.0045, 0], [0.004, 0.006], [0, 0.007]], [W * 0.43, y - 0.007, zp], FRONT, 12));
            // Corner caps, feet, and a strap handle on top.
            for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [0, 1]) H.Trim.push(HS.chamferedBox([sx * (W / 2 - 0.012), sy * (D / 2 - 0.012) + (sy < 0 ? bt / 2 : 0), sz ? Hh - 0.012 : 0.012], [0.032, 0.032, 0.032], 0.006));
            const strap = K.curve ? null : null; void strap;
            const hp = Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [-0.09 + 0.18 * t, 0, Hh + 0.004 + 0.03 * Math.sin(Math.PI * t)]; });
            H.Rubber.push(K.sweep(hp, K.roundRect(0.008, 0.028, 0.003, 2), { up: [0, 0, 1] }));
            for (const x of [-0.1, 0.1]) H.Trim.push(HS.chamferedBox([x, 0, Hh + 0.004], [0.03, 0.036, 0.01], 0.003));
        },
        wedge(r, H) {
            // A side profile (y back, z up) pushed across its width: a low front lip, a sloped face up to a short top, a tall back.
            const two = r.cones > 1, W = two ? 0.66 : 0.52, D = 0.44, Hb = 0.34, Hf = 0.07, topD = 0.08, bt = 0.016;
            const f0 = [-D / 2, Hf], f1 = [D / 2 - topD, Hb], vdir = norm([0, f1[0] - f0[0], f1[1] - f0[1]]), nrm = cross(X, vdir), len = Math.hypot(f1[0] - f0[0], f1[1] - f0[1]);
            const inset = ([a, b]) => [a - nrm[1] * bt, b - nrm[2] * bt];
            const side = [[-D / 2, 0], [D / 2, 0], [D / 2, Hb], f1, f0].map(([a, b]) => [a, b]);
            const body = [[-D / 2 + 0.004, 0], [D / 2, 0], [D / 2, Hb], inset(f1), inset(f0)];
            H.Cab.push(panel(HS.round(body, 0.01, 2, [1, 2]), W, 0.008, [0, 0, 0], [0, 1, 0], Z));
            void side;
            // The sloped baffle, cut for the woofer(s) and the horn.
            const mid = [0, (f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2], at = (a, b) => add(add(mid, mul(X, a)), mul(vdir, b));
            const Rw = two ? 0.115 : 0.13, wpos = two ? [[-W * 0.24, -len * 0.06], [W * 0.24, -len * 0.06]] : [[-W * 0.14, 0]], hornAt = two ? [0, len * 0.22] : [W * 0.28, 0];
            const hw = 0.075, hh = 0.042, hornHole = HS.round([[hornAt[0] - hw, hornAt[1] - hh], [hornAt[0] + hw, hornAt[1] - hh], [hornAt[0] + hw, hornAt[1] + hh], [hornAt[0] - hw, hornAt[1] + hh]], 0.008, 2);
            const holes = wpos.map(([a, b]) => HS.circle(a, b, Rw * 0.99, 40));
            if (r.tweeter) holes.push(hornHole);
            const face = HS.round([[-W / 2, -len / 2], [W / 2, -len / 2], [W / 2, len / 2], [-W / 2, len / 2]], 0.01, 2);
            H.Cab.push(HS.plate(face, bt, 0.004, { holes, frame: { o: sub(mid, mul(nrm, bt / 2)), u: X, v: vdir, n: nrm }, smooth: 40 }));
            for (const [a, b] of wpos) woofer(H, at(a, b), nrm, Rw);
            if (r.tweeter) {
                // A horn: dark down in its opening, in a trim frame.
                H.Dark.push(HS.plate(HS.offset(hornHole, -0.001), 0.003, 0.0005, { frame: { o: add(mid, mul(nrm, -bt + 0.0012)), u: X, v: vdir, n: nrm } }));
                H.Trim.push(HS.plate(HS.offset(hornHole, -0.008), 0.005, 0.0016, { holes: [hornHole], frame: { o: add(mid, mul(nrm, 0.0015)), u: X, v: vdir, n: nrm } }));
            }
            if (r.grille) mesh(H, mid, X, vdir, W - 0.012, len - 0.012, 0.011, 0.012);
            // Hand holds in its sides.
            for (const s of [-1, 1]) H.Dark.push(HS.chamferedBox([s * (W / 2 + 0.001), D * 0.18, Hb * 0.62], [0.006, 0.1, 0.035], 0.0015));
        },
        pod(r, H) {
            // Our own: a turned pod on three legs, its face a dish with the driver(s) sunk in it and lit rings round them.
            const R = 0.17, Lp = 0.28, zc = 0.34, Rw = 0.1, dr = Rw * 0.4 + 0.012;
            const fr = R * 0.84, back = [0, Lp * 0.45 + 0.001, zc];
            // The shell turned in one piece: its back, its sides, a lip, the dish inside it and the driver's well.
            const prof = [[0, 0], [0.05, 0.004], [0.11, 0.03], [0.15, 0.08], [R, 0.15], [R * 0.98, Lp - 0.04], [R * 0.93, Lp - 0.012], [R * 0.88, Lp], [fr, Lp], [fr * 0.98, Lp - 0.03], [Rw * 1.0, Lp - 0.03], [Rw * 1.0, Lp - 0.03 - dr], [0, Lp - 0.03 - dr]];
            H.Cab.push(lathe(prof, back, FRONT, 48, { sharp: 0.7 }));
            const face = add(back, mul(FRONT, Lp - 0.03));
            H.Panel.push(lathe([[Rw * 1.0, 0], [fr * 0.985, 0], [fr * 0.985, 0.002], [Rw * 1.0, 0.002], [Rw * 1.0, 0]], face, FRONT, 48, { caps: false }));
            const q = add(face, mul(FRONT, 0.002)), d = woofer(H, q, FRONT, Rw, r.tweeter);
            H.Glow.push(lathe([[Rw * 1.14, 0], [Rw * 1.24, 0], [Rw * 1.24, 0.003], [Rw * 1.14, 0.003], [Rw * 1.14, 0]], q, FRONT, 40, { caps: false }));
            // A coaxial tweeter in the cone's middle (or the dust cap).
            if (r.tweeter) tweeter(H, add(q, mul(FRONT, -d * 0.78)), FRONT, Rw * 0.16);
            H.Glow.push(lathe([[R * 0.885, 0], [R * 0.93, 0], [R * 0.93, 0.004], [R * 0.885, 0.004], [R * 0.885, 0]], add(back, mul(FRONT, Lp - 0.016)), FRONT, 48, { caps: false }));
            // Two dark bands round its shell, three legs to the floor.
            for (const h of [0.15, 0.21]) H.Panel.push(lathe([[R * 0.95, 0], [R * 1.012, 0], [R * 1.012, 0.012], [R * 0.95, 0.012], [R * 0.95, 0]], add(back, mul(FRONT, h)), FRONT, 48, { caps: false }));
            for (let i = 0; i < 3; i++) {
                const a = -Math.PI / 2 + (i - 1) * 0.95, o = [Math.cos(a), 0, Math.sin(a)], y = [Lp * 0.3, Lp * 0.1, Lp * 0.3][i] * (i === 1 ? -1 : 1);
                const top = add(back, add(mul(o, R * 0.7), mul(FRONT, i === 1 ? Lp * 0.3 : Lp * 0.75))), foot = [o[0] * 0.26, top[1] + y * 0.6, 0.012];
                H.Panel.push(K.tube([top, foot], 0.011, 10));
                H.Rubber.push(lathe([[0, 0], [0.022, 0], [0.02, 0.012], [0, 0.014]], [foot[0], foot[1], 0], Z, 16));
            }
        }
    };

    const LISTS = ['Cab', 'Trim', 'Rubber', 'Cone', 'Cap', 'Dark', 'Cloth', 'Grille', 'Panel', 'Knob', 'Glow'];
    function build(recipe, cache) {
        const r = normalize(recipe), c = cache || {}, H = {}, textures = {};
        for (const k of LISTS) H[k] = [];
        BUILD[r.preset](r, H);
        const s = r.size;
        for (const k of LISTS) H[k] = H[k].filter(m => m && m.index && m.index.length).map(m => { const P = m.positions; for (let i = 0; i < P.length; i++) P[i] *= s; return m; });
        // Woven grille cloth: warp and weft crossing, a little slub.
        const clothId = 'spk-cloth.png';
        if (H.Cloth.length && (!c[clothId] || c[clothId + 'key'] !== r.grilleColor)) {
            const base = Paint.hex(r.grilleColor), slub = Paint.noise(4, 32);
            const pic = Paint.paint(128, 128, (u, v, out) => {
                const a = Math.sin(u * Math.PI * 2 * 32), b = Math.sin(v * Math.PI * 2 * 32), over = (Math.floor(u * 32) + Math.floor(v * 32)) % 2 ? a : b;
                const k = 0.82 + 0.16 * Math.abs(over) - 0.12 * Math.max(0, -a * b) + 0.08 * (slub(u, v) - 0.5);
                for (let i = 0; i < 3; i++) out[i] = Math.max(0, Math.min(255, base[i] * k + 6));
                out[3] = 255;
            }, 1);
            pic.name = clothId; pic.repeat = true; c[clothId] = pic; c[clothId + 'key'] = r.grilleColor;
        }
        if (H.Cloth.length) textures[clothId] = c[clothId];
        const pod = r.preset === 'pod', tolex = r.preset === 'amp' || r.preset === 'wedge';
        const look = {
            Cab: { kind: pod ? 'metal' : 'prop', color: r.color, roughness: pod ? 0.32 : tolex ? 0.78 : 0.4, metalness: pod ? 0.45 : 0 },
            Trim: { kind: 'metal', color: r.accent, roughness: 0.3, metalness: 0.85 },
            Rubber: { kind: 'prop', color: '#18191b', roughness: 0.8, metalness: 0 },
            Cone: { kind: 'prop', color: '#26272a', roughness: 0.75, metalness: 0 },
            Cap: { kind: 'prop', color: pod && r.glow ? r.accent : '#3a3b3f', roughness: 0.45, metalness: 0.1, emissive: pod && r.glow ? r.accent : undefined, emissiveIntensity: pod && r.glow ? 0.8 : undefined },
            Dark: { kind: 'prop', color: '#0c0c0e', roughness: 0.7, metalness: 0 },
            Cloth: { kind: 'prop', texture: clothId, roughness: 0.95, metalness: 0 },
            Grille: { kind: 'metal', color: '#2a2c30', roughness: 0.45, metalness: 0.7 },
            Panel: { kind: 'metal', color: pod ? '#1a1d22' : r.accent, roughness: 0.3, metalness: pod ? 0.3 : 0.8 },
            Knob: { kind: 'prop', color: '#151517', roughness: 0.4, metalness: 0 },
            Glow: r.glow || r.preset === 'amp' ? { kind: 'prop', color: pod ? r.accent : '#ff3a2a', emissive: pod ? r.accent : '#ff3a2a', emissiveIntensity: 1.5, roughness: 0.3, metalness: 0 } : { kind: 'prop', color: '#2a2c30', roughness: 0.4, metalness: 0.3 }
        };
        for (const k of Object.keys(look)) for (const q of Object.keys(look[k])) if (look[k][q] === undefined) delete look[k][q];
        const P = {};
        for (const k of LISTS) if (H[k].length) P[k] = { meshes: H[k], look: look[k] };
        const out = K.finish('speaker', r, P, {}, textures, { template: null, pitch: 0.3 });
        delete out.holdable;
        return out;
    }

    /** A random speaker: another style when Everything rolls; shape its size and woofers; details its tweeter, grille and glow; colors its cabinet, cloth and trim. */
    function random(seed, recipe, scope, keep) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur));
        const all = !scope || scope === 'all', has = part => all || scope === part;
        if (all && !keep) Object.assign(out, BY_ID.get(out.preset = R.pick(PRESETS)[0]));
        if (has('shape')) { const [lo, hi] = CONES[out.preset]; out.size = +R.jitter(1, 0.15, 0.6, 1.6).toFixed(2); out.cones = R.int(lo, hi); }
        if (has('details')) { out.tweeter = R.chance(0.7); out.grille = R.chance(0.5); out.glow = out.preset === 'pod' ? R.chance(0.85) : false; }
        if (has('colors')) { out.color = R.pick(Rand.PALETTES.dark.concat(['#ece8e0', '#8a2a22', '#2a4a6a', '#6a4a2a'])); out.grilleColor = R.pick(['#2b2c30', '#c8b89a', '#3a3b40', '#5a4a3a', '#1c2a3a']); out.accent = R.pick(Rand.PALETTES.glow.concat(['#b8bcc2', '#d8b060', '#1d1e22'])); }
        return normalize(out);
    }

    const api = { PRESETS, CONES, normalize, build, random, BUILD };
    root.RRSpeakerProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel || (typeof require === 'function' ? require('./PropModel.js') : null);
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'speaker', label: 'Speaker', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        if (!Catalog.ICONS.speaker) Catalog.ICONS.speaker = '<rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="15" r="4"/><circle cx="12" cy="7" r="1.6"/>';
        // Beside the microphone in the Instruments section's Stage gear.
        if (!Catalog.CATEGORIES.some(g => g.id === 'acc-instruments')) Catalog.category({ id: 'acc-instruments', label: 'Stage gear', order: 80, parent: 'instruments' });
        for (const [id, label] of PRESETS) Catalog.add({ id: 'speaker-' + id, category: 'acc-instruments', label, icon: 'speaker', kind: 'speaker', keywords: 'speaker speakers audio sound stage music amp amplifier monitor ' + label.toLowerCase(), start: () => normalize({ preset: id }), matches: r => r.preset === id });
        Catalog.ui('speaker', K.page({
            placeholder: 'Speaker', PRESETS: PRESETS.map(p => [p[0], p[1]]), normalize, random, keep: ['color', 'grilleColor', 'accent'],
            shape(r) {
                const [lo, hi] = CONES[r.preset];
                return this._slider({ path: 'size', label: 'Overall size', range: [0.6, 1.6], step: 0.01, format: 'x' })
                    + (hi > lo ? this._slider({ path: 'cones', label: 'Woofers', range: [lo, hi], step: 1, format: 'int' }) : '');
            },
            look(r) {
                let html = this._section('Materials') + this._color('color', 'Cabinet color');
                if (r.preset !== 'pod') html += this._check('grille', r.preset === 'wedge' ? 'Metal grille' : 'Grille cloth on');
                if (r.grille && r.preset !== 'wedge') html += this._color('grilleColor', 'Grille cloth color');
                html += this._check('tweeter', r.preset === 'wedge' ? 'Horn tweeter' : 'Tweeter');
                html += this._color('accent', r.glow ? 'Glow' : 'Trim color');
                if (r.preset === 'pod') html += this._check('glow', 'Glows');
                return html;
            }
        }));
    }
})(typeof window !== 'undefined' ? window : globalThis);
