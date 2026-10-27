/**
 * RRAlienFlora - plants of other worlds for the Nature props, each its own
 * design: a lantern tree whose arching arms each hang a ribbed glowing pod,
 * glow stalks, fungus towers stacked with shelf caps over glowing gill
 * rings, a parasol fungus, tentacle plants curling at their tips, whip
 * fronds, faceted crystal trees, pod plants and bulb clusters, sea-fan and
 * antler corals, spore puffballs holding their spores up on threads, and
 * spiral horns ringed with light. Palettes go beyond Earth's (teal,
 * magenta, violet, amber, toxic green, crimson, ice) and Glow sets how
 * brightly the lit parts shine.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Kit = need('RRNatureKit', './NatureKit.js');
    const Tex = need('RRNatureTexture', './NatureTexture.js');
    const Trees = need('RRTreeConstruction', './TreeConstruction.js');
    const Rocks = need('RRRockConstruction', './RockConstruction.js');
    const { add, sub, scale, dot, cross, len, norm, mix, clamp, smooth, rotate, basis, lerp } = Kit.vec;
    const UP = [0, 1, 0];

    const FORMS = [
        ['lantern', 'Lantern tree', 'alien-flora', 'lantern', 'alien', ['Spread', 'Lanterns'], [1, 14], [
            ['lantern', 'Lantern tree', { size: 5, palette: 'amber' }], ['glowstalk', 'Glow stalks', { size: 2.2, palette: 'teal', character: 0.6 }]], 'bioluminescent glowing lamp alien'],
        ['fungus', 'Fungus tower', 'alien-flora', 'fungus', 'alien', ['Spread', 'Tiers'], [1, 20], [
            ['tower', 'Fungus tower', { size: 6, palette: 'violet' }], ['parasol', 'Parasol fungus', { size: 4.5, palette: 'teal', spread: 0.6 }]], 'mushroom giant fungal gills alien'],
        ['tentacle', 'Tentacle plant', 'alien-flora', 'tentacle', 'alien', ['Spread', 'Curl'], [0.5, 8], [
            ['tentacle', 'Tentacle plant', { size: 2.4, palette: 'magenta', character: 0.6 }], ['whip', 'Whip fronds', { size: 2.2, palette: 'toxic', character: 0.5 }]], 'tentacles fronds curling alien'],
        ['crystaltree', 'Crystal tree', 'alien-flora', 'crystal', 'alien', ['Spread', 'Branches'], [1, 14], [
            ['crystaltree', 'Crystal tree', { size: 4.5, palette: 'ice' }]], 'crystal glass shard tree alien'],
        ['pod', 'Pod plant', 'alien-flora', 'alien', 'alien', ['Spread', 'Pods'], [0.5, 8], [
            ['pod', 'Pod plant', { size: 2.2, palette: 'toxic' }], ['bulb', 'Bulb cluster', { size: 1.4, palette: 'magenta', character: 0.6 }]], 'pod bulb seed alien'],
        ['coral', 'Coral', 'alien-flora', 'coral', 'alien', ['Spread', 'Branches'], [0.4, 8], [
            ['fan', 'Sea fan', { size: 2.2, palette: 'crimson' }], ['antler', 'Antler coral', { size: 1.6, palette: 'amber' }]], 'coral reef sea fan underwater alien'],
        ['puffball', 'Spore puffballs', 'alien-flora', 'mushroom', 'alien', ['Spread', 'Spores'], [0.4, 8], [
            ['puffball', 'Spore puffballs', { size: 1.6, palette: 'violet' }]], 'puffball spores fungus alien'],
        ['horn', 'Spiral horns', 'alien-flora', 'horn', 'alien', ['Spread', 'Twist'], [0.5, 10], [
            ['horn', 'Spiral horns', { size: 3, palette: 'teal', character: 0.55 }]], 'horn spiral shell alien']
    ];

    /** Palettes: [deep, body, light, glow]. */
    const PAL = {
        teal: ['#0e2a30', '#1f6a6a', '#8af0e0', '#40ffe8'], magenta: ['#2a0a24', '#8a2470', '#ff9ae0', '#ff40c8'], violet: ['#1a0e30', '#4a2a8a', '#c8a8ff', '#a060ff'],
        amber: ['#2a1606', '#8a4a14', '#ffd08a', '#ffb030'], toxic: ['#0e2a0a', '#3a7a1a', '#d0ff8a', '#a0ff30'], crimson: ['#2a0608', '#7a1418', '#ff9a8a', '#ff3a2a'], ice: ['#0e1e30', '#3a6a9a', '#d8f0ff', '#80d8ff']
    };

    /** A lathed body round a vertical axis: `profile` [[radius, y]...], `ribs` lobes round it. */
    function lathe(g, base, profile, o = {}) {
        const pts = profile.map(p => add(base, [0, p[1], 0]));
        return Kit.tube(g, pts, (k, a) => Math.max(0.001, profile[k][0] * (1 + (o.ribs ? (o.ribDepth || 0.08) * Math.cos(o.ribs * a) : 0))), { sides: o.sides || 16, uRepeat: o.uRepeat || 1, vScale: o.vScale || 1, color: o.color, sway: o.sway, capEnd: o.capEnd !== false, capStart: !!o.capStart, up: [1, 0, 0] });
    }

    /** A cap: a dome over glowing gills (radial fins) with its dark underside. */
    function cap(body, glow, at, R, h, stalkR, o) {
        const n = 7, prof = [];
        for (let k = 0; k <= n; k++) { const t = k / n, a = t * Math.PI / 2; prof.push([R * Math.cos(a) * (1 - 0.06 * Math.sin(t * Math.PI)) + 0.001, h * Math.sin(a) - (o.droop || 0) * h * (1 - t) * (1 - t)]); }
        lathe(body, at, prof, { sides: o.sides || 24, color: o.top, sway: o.sway, capEnd: true, ribs: o.ribs, ribDepth: 0.03 });
        // The underside: an annulus facing down from the stalk to the rim.
        const under = [], y0 = at[1] - (o.droop || 0) * h + 0.002;
        for (let k = 0; k <= 4; k++) { const t = k / 4; under.push([lerp(R * 0.995, stalkR, t), y0 + h * 0.18 * t]); }
        const ring = Kit.geo();
        lathe(ring, [at[0], 0, at[2]], under.map(([r, y]) => [r, y]), { sides: o.sides || 24, color: o.under, capEnd: false, sway: o.sway });
        // Its faces turn down: wind them the other way.
        for (let t = 0; t < ring.I.length; t += 3) { const x = ring.I[t + 1]; ring.I[t + 1] = ring.I[t + 2]; ring.I[t + 2] = x; }
        for (let i = 0; i < ring.N.length; i += 3) { ring.N[i] = 0; ring.N[i + 1] = -1; ring.N[i + 2] = 0; }
        Kit.append(body, ring);
        // Gills: thin fins from the stalk out to the rim, lit.
        const fins = o.gills || 40;
        for (let i = 0; i < fins; i++) {
            const a = i / fins * Math.PI * 2, d = [Math.cos(a), 0, Math.sin(a)], side = [-d[2], 0, d[0]];
            const inner = add([at[0], y0 + h * 0.16, at[2]], scale(d, stalkR * 1.05)), outer = add([at[0], y0 + 0.004, at[2]], scale(d, R * 0.97));
            const pts = [inner, mix(inner, outer, 0.5), outer], gh = k => h * 0.17 * (1 - k / 2 * 0.85);
            // A fin is a vertical ribbon hanging under the cap.
            const s0 = glow.P.length / 3;
            for (let k = 0; k < 3; k++) for (const dy of [0, -1]) Kit.vert(glow, add(pts[k], [0, dy * gh(k), 0]), side, k / 2, -dy, o.gill, o.sway ? o.sway(pts[k]) : 0);
            for (let k = 0; k < 2; k++) { const a0 = s0 + k * 2; glow.I.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
            Kit.backFaces(glow, glow.I.length - 12);
        }
    }

    /** A tapering tube along a path, darker at its foot, `glowTip` lit at the end. */
    function limb(g, pts, r0, r1, o = {}) {
        const n = pts.length;
        Kit.tube(g, pts, (k, a) => lerp(r0, r1, Math.pow(k / (n - 1), o.taper || 0.8)) * (1 + (o.ridges ? 0.14 * Math.pow(Math.max(0, Math.sin(k / (n - 1) * Math.PI * o.ridges)), 6) : 0)), { sides: o.sides || 8, uRepeat: o.uRepeat || 1, vScale: o.vScale || 0.5, color: o.color ? (k, p) => o.color(k / (n - 1), p) : null, sway: o.sway, capEnd: true, capStart: !!o.capStart });
    }

    function build(r, cache, env, helpers) {
        const R = Kit.roll(r.seed * 53 + 7), N = Kit.noise(r.seed + 21), S = r.size, sp = r.spread, ch = r.character, P = PAL[r.palette] || PAL.teal;
        const body = Kit.geo(), glow = Kit.geo(), leaves = Kit.geo(), crystal = Kit.geo();
        const skinGeo = Kit.geo();
        /** Points of `g` turned from up onto `dir` and moved to `at`, their wind weights set. */
        const place = (g, at, dir) => {
            const ax = cross(UP, dir), l = len(ax), ang = Math.acos(clamp(dot(UP, dir), -1, 1)), k = l > 1e-4 ? scale(ax, 1 / l) : null;
            for (let i = 0; i < g.P.length; i += 3) {
                const p = k ? rotate([g.P[i], g.P[i + 1], g.P[i + 2]], k, ang) : [g.P[i], g.P[i + 1], g.P[i + 2]], n = k ? rotate([g.N[i], g.N[i + 1], g.N[i + 2]], k, ang) : [g.N[i], g.N[i + 1], g.N[i + 2]];
                g.P[i] = p[0] + at[0]; g.P[i + 1] = p[1] + at[1]; g.P[i + 2] = p[2] + at[2]; g.N[i] = n[0]; g.N[i + 1] = n[1]; g.N[i + 2] = n[2]; g.S[i / 3] = sway([g.P[i], g.P[i + 1], g.P[i + 2]]);
            }
            return g;
        };
        /** A pod: a ribbed translucent skin with lit veins over a glowing core and its seeds, dark sepals cupping its foot. */
        const pod = (at, dir, L, w, o = {}) => {
            const gs = Kit.geo(), gg = Kit.geo(), gb = Kit.geo(), prof = [];
            for (let k = 0; k <= 12; k++) { const t = k / 12; prof.push([w * Math.pow(Math.sin(Math.PI * Math.pow(t, o.round ? 1 : 0.85)), o.round ? 0.6 : 0.75) + 0.002, L * t]); }
            lathe(gs, [0, 0, 0], prof, { sides: 18, ribs: o.ribs || 6, ribDepth: 0.1, vScale: L, color: k => lin(mix(C[2], C[3], 0.35 + 0.3 * Math.sin(Math.PI * k / 12))) });
            Kit.blob(gg, [0, L * 0.5, 0], [w * 0.42, L * 0.3, w * 0.42], { sides: 10, rings: 6, color: () => lin(C[3]) });
            for (let i = 0; i < 7; i++) { const a = i * 2.39996, t = 0.22 + 0.56 * i / 6, rr = w * 0.62 * Math.sin(Math.PI * t); Kit.blob(gg, [Math.cos(a) * rr, L * t, Math.sin(a) * rr], w * 0.11, { sides: 6, rings: 4, color: () => lin(mix(C[3], [1, 1, 1], 0.45)) }); }
            lathe(gb, [0, -L * 0.03, 0], [[w * 0.18, 0], [w * 0.55, L * 0.05], [w * 0.78, L * 0.14], [w * 0.7, L * 0.22]], { sides: 15, ribs: 5, ribDepth: 0.45, capEnd: false, color: () => grad(0.25) });
            Kit.append(skinGeo, place(gs, at, dir)); Kit.append(glow, place(gg, at, dir)); Kit.append(body, place(gb, at, dir));
        };
        const C = P.map(Kit.rgb), lin = c => Kit.linear(c);
        const sway = p => clamp(Math.pow(Math.max(0, p[1]) / S, 1.4) * 1.1 + 0.1 * Math.hypot(p[0], p[2]) / S, 0, 1);
        const grad = (t, lift = 0) => lin(mix(mix(C[0], C[1], smooth(0, 0.5, t)).map(v => v * 1.6), C[2], smooth(0.55, 1, t) * 0.6 + lift));
        let skin = 'stalk', glowPattern = null, leafCells = null, swayDeg = 2;
        const form = r.form, preset = r.preset;

        if (form === 'lantern' && preset === 'lantern') {
            skin = 'hide';
            const spec = {
                crownBase: 0.4, trunk: { height: S, split: 0.5, radius: S * 0.055, segs: 10, sides: 14, wobble: 0.5, flare: 1.0, lobes: 5, tip: 0.3, twist: 0.8, gnarl: 0.7 },
                envelope: () => 1,
                levels: [
                    { count: 4 + Math.round(ch * 3), start: 0.5, end: 1, down: 38 + sp * 22, downVar: 8, len: 0.62 + sp * 0.2, lenVar: 0.15, radius: 0.62, tip: 0.2, gravity: 0, photo: 0.75, arch: 1.9, wobble: 0.3, segs: 10, sides: 7, spread: 0.35 },
                    { count: 1 + Math.round(ch * 2), start: 0.35, end: 0.75, down: 50, downVar: 10, len: 0.45, lenVar: 0.15, radius: 0.55, tip: 0.25, gravity: 0, photo: 0.5, arch: 1.6, wobble: 0.3, segs: 6, sides: 5 }
                ],
                leaves: null
            };
            const res = Trees.grow(spec, { R, N, bark: body, sway, color: (p, level, t) => grad(level ? 0.3 + t * 0.4 : t * 0.3), tile: 0.5 });
            for (const tip of res.skeleton.filter(b => b.level >= 1).map(b => ({ p: b.pts[b.pts.length - 1], level: b.level }))) {
                // A stalk drops from the tip and the lantern hangs from it.
                const drop = S * (0.08 + R.next() * 0.06), top = tip.p, bottom = add(top, [0, -drop, 0]);
                limb(body, [top, mix(top, bottom, 0.5), bottom], 0.018 * S / 5, 0.012 * S / 5, { sides: 5, color: () => grad(0.6), sway });
                const L = S * 0.13 * (0.85 + R.next() * 0.3) * (tip.level > 1 ? 0.75 : 1), w = L * 0.44, prof = [];
                for (let k = 0; k <= 9; k++) { const t = k / 9; prof.push([w * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) + 0.002, -L * (1 - t)]); }
                lathe(glow, add(bottom, [0, 0, 0]), prof, { sides: 16, ribs: 8, ribDepth: 0.1, color: (k, p) => lin(mix(C[3], C[2], 0.3)), sway, capEnd: true });
                // The calyx over it: dark sepals.
                lathe(body, add(bottom, [0, -L * 0.06, 0]), [[w * 0.55, 0], [w * 0.35, L * 0.05], [0.004, L * 0.09]], { sides: 10, ribs: 5, ribDepth: 0.3, color: () => grad(0.15), sway });
            }
            // Small lights along the arms.
            for (const b of res.skeleton) if (b.level >= 1) for (let i = 0; i < 4; i++) { const a = Trees.along(b.pts, 0.25 + i * 0.18); Kit.blob(glow, add(a.p, [0, b.r0 * 0.6, 0]), S * 0.012, { sides: 6, rings: 4, color: () => lin(C[3]), sway }); }
            glowPattern = 'ribs'; swayDeg = 1.6;
        } else if (form === 'lantern') {
            // Glow stalks: a tuft of thin stalks, each lifting a lit bulb and its whiskers.
            skin = 'stalk';
            const n = 6 + Math.round(ch * 12);
            for (let i = 0; i < n; i++) {
                const a = R.next() * Math.PI * 2, d = S * 0.12 * (0.2 + sp) * Math.sqrt(R.next()), base = [Math.cos(a) * d, 0, Math.sin(a) * d];
                const h = S * (0.45 + R.next() * 0.55), lean = [Math.cos(a) * h * 0.15 * sp, 0, Math.sin(a) * h * 0.15 * sp], pts = [];
                for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(add(base, [lean[0] * t * t + N.n3(i, t * 2, 0) * 0.05 * S, h * t, lean[2] * t * t + N.n3(0, t * 2, i) * 0.05 * S])); }
                limb(body, pts, S * 0.014, S * 0.006, { sides: 6, color: t => grad(t * 0.8), sway, vScale: 0.3 });
                const top = pts[8], br = S * (0.035 + R.next() * 0.025);
                Kit.blob(glow, add(top, [0, br * 0.8, 0]), [br, br * 1.25, br], { sides: 12, rings: 8, color: () => lin(C[3]), sway });
                for (let k = 0; k < 5; k++) { const ang = k / 5 * Math.PI * 2, w = add(top, [Math.cos(ang) * br * 1.6, br * 1.8 + R.next() * br, Math.sin(ang) * br * 1.6]); limb(body, [add(top, [0, br * 1.2, 0]), mix(add(top, [0, br * 1.6, 0]), w, 0.6), w], S * 0.002, S * 0.001, { sides: 3, color: () => lin(C[2]), sway }); }
            }
            // A low mound of fleshy leaves at the foot.
            leafCells = 'paddle';
            for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + R.next() * 0.3, up = norm([Math.cos(a), 0.6 + R.next() * 0.5, Math.sin(a)]); leaves.cards = (leaves.cards || []).concat([[[Math.cos(a) * S * 0.04, 0.01, Math.sin(a) * S * 0.04], up, norm(cross(up, UP)), S * 0.22, S * 0.32]]); }
            swayDeg = 3;
        } else if (form === 'fungus') {
            skin = 'shaggy';
            const parasol = preset === 'parasol', H = S, stalkR = S * (parasol ? 0.035 : 0.06) * (0.8 + sp * 0.4);
            const path = [];
            for (let k = 0; k <= 12; k++) { const t = k / 12; path.push([N.n3(t * 2, 0, 1) * S * 0.06, H * (parasol ? 0.94 : 0.97) * t, N.n3(1, t * 2, 0) * S * 0.06]); }
            Kit.tube(body, path, (k, a) => { const t = k / 12; return stalkR * (1 + 1.1 * Math.exp(-t * 9) * (0.7 + 0.3 * Math.cos(5 * a)) - 0.25 * t + 0.08 * Math.sin(t * 40) * (parasol ? 0 : 1)); }, { sides: 16, uRepeat: 2, vScale: S * 0.25, color: (k, p) => grad(0.15 + k / 12 * 0.5), sway, capEnd: true });
            const top = path[12], capOpts = { top: (k, p) => grad(0.55 + 0.1 * N.n3(p[0] * 3, p[1] * 3, p[2] * 3)), under: () => grad(0.05), gill: lin(C[3]), sway };
            if (parasol) {
                const Rc = S * (0.28 + sp * 0.2);
                cap(body, glow, add(top, [0, -S * 0.02, 0]), Rc, S * 0.1, stalkR, Object.assign({}, capOpts, { gills: 56, droop: 0.35, sides: 32 }));
                // The ring (annulus) round the stalk, a skirt hanging from it.
                const ry = H * 0.68, ringPts = [[stalkR * 1.05, 0], [stalkR * 2.6, -S * 0.03], [stalkR * 2.8, -S * 0.07]];
                lathe(body, [path[8][0], ry, path[8][2]], ringPts.map(([r0, y]) => [r0, y]), { sides: 18, capEnd: false, color: () => grad(0.55) });
                // Scales on the cap.
                for (let i = 0; i < 26; i++) { const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()) * Rc * 0.8, hh = S * 0.1 * Math.cos(d / Rc * Math.PI / 2) - S * 0.02 - 0.35 * S * 0.1 * Math.pow(d / Rc, 2) * 0; Kit.blob(body, add(top, [Math.cos(a) * d, hh, Math.sin(a) * d]), [S * 0.018, S * 0.008, S * 0.018], { sides: 6, rings: 3, color: () => lin(C[2]) }); }
            } else {
                const tiers = 2 + Math.round(ch * 4);
                for (let i = 0; i < tiers; i++) {
                    const t = 0.35 + 0.55 * i / Math.max(1, tiers - 1), at = Trees.along(path, t).p, Rc = S * (0.22 - 0.1 * t) * (0.8 + sp * 0.5) * (0.85 + R.next() * 0.3);
                    cap(body, glow, at, Rc, S * 0.05, stalkR * (1 - 0.25 * t), Object.assign({}, capOpts, { gills: 36, droop: 0.2, sides: 24 }));
                }
                cap(body, glow, add(top, [0, -S * 0.01, 0]), S * 0.14 * (0.8 + sp * 0.4), S * 0.09, stalkR * 0.7, Object.assign({}, capOpts, { gills: 30, droop: 0.4 }));
                // Glowing spots on the crown.
                for (let i = 0; i < 12; i++) { const a = R.next() * Math.PI * 2, d = Math.sqrt(R.next()) * S * 0.1; Kit.blob(glow, add(top, [Math.cos(a) * d, S * 0.08 * Math.cos(d / (S * 0.14) * 1.3), Math.sin(a) * d]), [S * 0.012, S * 0.006, S * 0.012], { sides: 6, rings: 3, color: () => lin(C[3]) }); }
            }
            // Little ones at the foot.
            for (let i = 0; i < 3 + Math.round(ch * 3); i++) {
                const a = R.next() * Math.PI * 2, d = stalkR * (2.5 + R.next() * 3), h = S * (0.05 + R.next() * 0.07), base = [Math.cos(a) * d, 0, Math.sin(a) * d];
                limb(body, [base, add(base, [0, h * 0.5, 0]), add(base, [0, h, 0])], S * 0.008, S * 0.006, { sides: 6, color: t => grad(0.3 + t * 0.3) });
                cap(body, glow, add(base, [0, h, 0]), h * 0.5, h * 0.3, S * 0.006, Object.assign({}, capOpts, { gills: 14, droop: 0.3, sides: 12, sway: null }));
            }
            glowPattern = null; swayDeg = parasol ? 1.2 : 0.8;
        } else if (form === 'tentacle') {
            skin = 'stalk';
            const baseR = S * 0.13 * (0.8 + sp * 0.4);
            Kit.blob(body, [0, baseR * 0.45, 0], [baseR, baseR * 0.75, baseR], { sides: 18, rings: 10, bump: d => 0.12 * N.n3(d[0] * 3, d[1] * 3, d[2] * 3) + (d[1] < -0.2 ? -0.3 * (-0.2 - d[1]) : 0), color: (p, d) => grad(0.15 + 0.2 * (d[1] + 1) / 2) });
            const n = preset === 'whip' ? 9 + Math.round(sp * 6) : 6 + Math.round(sp * 6);
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2 + R.next() * 0.4, out = [Math.cos(a), 0, Math.sin(a)], side = [-out[2], 0, out[0]], L = S * (0.6 + R.next() * 0.45);
                const start = [out[0] * baseR * 0.5, baseR * 0.8, out[2] * baseR * 0.5], pts = [start];
                let d = norm(add(scale(out, 0.45 + sp * 0.5), UP)), q = start.slice(), curl = 0;
                const segs = 22;
                for (let k = 1; k <= segs; k++) {
                    const t = k / segs;
                    // The last part coils: the turn per step grows toward the tip.
                    curl = t > 0.5 ? (t - 0.5) * 2 : 0;
                    d = norm(rotate(d, side, (0.04 + curl * (0.25 + ch * 0.45)) * (preset === 'whip' ? -1 : 1)));
                    q = add(q, scale(d, L / segs * (1 - curl * 0.5)));
                    pts.push(q.slice());
                }
                if (preset === 'whip') {
                    leafCells = 'frond';
                    (leaves.ribbons = leaves.ribbons || []).push({ pts, side, w: S * 0.06 });
                    limb(body, pts, S * 0.012, S * 0.003, { sides: 4, color: t => grad(0.3 + t * 0.4), sway });
                } else {
                    limb(body, pts, S * 0.05 * (0.8 + R.next() * 0.4), S * 0.004, { sides: 10, color: t => grad(0.2 + t * 0.75), sway, vScale: S * 0.15, uRepeat: 2 });
                    // Lit suckers along the inner side.
                    for (let k = 3; k < segs - 2; k += 2) { const p = pts[k], t = k / segs, dd = norm(sub(pts[k + 1], pts[k - 1])), inner = norm(cross(side, dd)), rr = S * 0.05 * (1 - t * 0.85); Kit.blob(glow, add(p, scale(inner, -rr * 0.9)), rr * 0.32, { sides: 6, rings: 3, color: () => lin(C[3]), sway }); }
                }
            }
            swayDeg = 3;
        } else if (form === 'crystaltree') {
            skin = 'crystal';
            const spec = {
                crownBase: 0.35, trunk: { height: S, split: 0.45, radius: S * 0.045, segs: 6, sides: 6, wobble: 0.15, flare: 0.5, lobes: 3, tip: 0.3 },
                envelope: h => 1 - 0.4 * h,
                levels: [
                    { count: 4 + Math.round(ch * 3), start: 0.55, end: 1, down: 38 + sp * 20, downVar: 8, len: 0.42 + sp * 0.15, lenVar: 0.15, radius: 0.65, tip: 0.25, gravity: 0, photo: 0.25, wobble: 0.1, segs: 3, sides: 5 },
                    { count: 3 + Math.round(ch * 2), start: 0.35, end: 1, down: 40, downVar: 10, len: 0.5, lenVar: 0.2, radius: 0.55, tip: 0.3, gravity: 0, photo: 0.3, wobble: 0.1, segs: 2, sides: 4 }
                ],
                leaves: null
            };
            const res = Trees.grow(spec, { R, N, bark: crystal, sway, color: (p, level, t) => grad(0.15 + p[1] / S * 0.6), tile: 0.5 });
            const gem = [P[0], P[1], P[2], P[3]];
            for (const tip of res.tips) for (let i = 0; i < 3; i++) { const dir = norm(add(tip.d, [(R.next() - 0.5) * 1.2, R.next() * 0.6, (R.next() - 0.5) * 1.2])), L = S * (0.08 + R.next() * 0.08); Rocks.prism(glow, tip.p, dir, L, L * 0.18, gem, R); }
            for (let i = 0; i < 7; i++) { const a = R.next() * Math.PI * 2, base = [Math.cos(a) * S * 0.08, 0, Math.sin(a) * S * 0.08], L = S * (0.06 + R.next() * 0.1); Rocks.prism(crystal, base, norm([Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5]), L, L * 0.2, gem, R); }
            facet(crystal);
            swayDeg = 0.5;
        } else if (form === 'pod') {
            skin = 'stalk';
            if (preset === 'bulb') {
                // Bulbs: translucent ribbed skins round a lit core and seeds, cupped by sepals, rooted by pale tendrils.
                const n = 4 + Math.round(ch * 8);
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2 + R.next() * 0.6, d = i === 0 ? 0 : S * 0.45 * (0.5 + sp) * (0.65 + 0.35 * R.next()), br = S * (i === 0 ? 0.19 : 0.06 + R.next() * 0.08);
                    const base = [Math.cos(a) * d, 0, Math.sin(a) * d], tiltDir = norm([Math.cos(a) * 0.15 * (i ? 1 : 0) + (R.next() - 0.5) * 0.1, 1, Math.sin(a) * 0.15 * (i ? 1 : 0) + (R.next() - 0.5) * 0.1]);
                    pod(add(base, [0, br * 0.05, 0]), tiltDir, br * 2.1, br, { ribs: 7 + (i % 3), round: true });
                    const t0 = add(base, scale(tiltDir, br * 2.1));
                    limb(body, [t0, add(t0, [br * 0.15, br * 0.3, 0]), add(t0, [br * 0.1, br * 0.55, br * 0.12])], br * 0.06, br * 0.02, { sides: 5, color: t => grad(0.4 + t * 0.4), sway });
                    for (let k = 0; k < 3; k++) { const ra = a + k * 2.1 + R.next(), e = add(base, [Math.cos(ra) * br * 1.6, 0.004, Math.sin(ra) * br * 1.6]); limb(body, [add(base, [0, br * 0.25, 0]), add(mix(base, e, 0.5), [0, br * 0.1, 0]), e], br * 0.07, br * 0.02, { sides: 4, color: () => lin(mix(C[2], [1, 1, 1], 0.3)), sway }); }
                }
                swayDeg = 0.6;
            } else {
                const n = 3 + Math.round(ch * 5);
                for (let i = 0; i < n; i++) {
                    const a = i / n * Math.PI * 2 + R.next() * 0.5, out = [Math.cos(a), 0, Math.sin(a)], h = S * (0.55 + R.next() * 0.4), reach = S * (0.15 + sp * 0.3) * (0.6 + R.next() * 0.5), pts = [];
                    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([out[0] * reach * Math.sin(t * Math.PI * 0.6) + out[0] * S * 0.03, h * Math.sin(t * Math.PI * 0.55) / Math.sin(Math.PI * 0.55), out[2] * reach * Math.sin(t * Math.PI * 0.6) + out[2] * S * 0.03]); }
                    limb(body, pts, S * 0.035, S * 0.018, { sides: 8, color: t => grad(0.2 + t * 0.5), sway });
                    const tip = pts[10], dir = norm(sub(pts[10], pts[9])), L = S * (0.15 + R.next() * 0.08);
                    pod(add(tip, scale(dir, -L * 0.04)), dir, L, L * 0.36, { ribs: 5 });
                }
                leafCells = 'paddle';
                for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + R.next() * 0.4, up = norm([Math.cos(a), 0.45 + R.next() * 0.4, Math.sin(a)]); (leaves.cards = leaves.cards || []).push([[Math.cos(a) * S * 0.03, 0.01, Math.sin(a) * S * 0.03], up, norm(cross(up, UP)), S * 0.28, S * 0.4]); }
                swayDeg = 2.5;
            }
        } else if (form === 'coral') {
            skin = 'stalk';
            const tipGlow = [];
            if (preset === 'fan') {
                const fans = 1 + Math.round(sp * 2);
                for (let f = 0; f < fans; f++) {
                    const yaw = f * 0.9 - (fans - 1) * 0.45 + (R.next() - 0.5) * 0.3, plane = [Math.cos(yaw), 0, Math.sin(yaw)], H = S * (f === 0 ? 1 : 0.7 + R.next() * 0.2);
                    const grow = (p, ang, L, r, depth) => {
                        const d = norm([plane[0] * Math.sin(ang), Math.cos(ang), plane[2] * Math.sin(ang)]), e = add(p, scale(d, L)), mid = add(mix(p, e, 0.5), scale([plane[2], 0, -plane[0]], (R.next() - 0.5) * L * 0.08));
                        limb(body, [p, mid, e], r, r * 0.75, { sides: depth < 2 ? 6 : 4, color: t => grad(0.3 + 0.12 * (5 - depth) + t * 0.05), sway });
                        if (depth <= 0) { tipGlow.push(e); return; }
                        const kids = depth > 3 ? 2 : 2 + (R.next() < 0.3 + ch * 0.4 ? 1 : 0);
                        for (let k = 0; k < kids; k++) grow(e, ang + (k - (kids - 1) / 2) * (0.5 + R.next() * 0.25) + (R.next() - 0.5) * 0.2, L * (0.72 + R.next() * 0.12), r * 0.72, depth - 1);
                    };
                    grow([plane[2] * f * S * 0.1, 0, -plane[0] * f * S * 0.1], (R.next() - 0.5) * 0.2, H * 0.22, S * 0.03, 4 + Math.round(ch));
                }
            } else {
                const grow = (p, d, L, r, depth) => {
                    const e = add(p, scale(d, L)), mid = add(mix(p, e, 0.5), scale(norm([R.next() - 0.5, 0, R.next() - 0.5]), L * 0.12));
                    limb(body, [p, mid, e], r, r * 0.8, { sides: 8, color: t => grad(0.3 + 0.1 * (4 - depth)), sway, capEnd: true });
                    if (depth <= 0) { tipGlow.push(e); return; }
                    const kids = 2 + (R.next() < ch ? 1 : 0);
                    for (let k = 0; k < kids; k++) { const a = R.next() * Math.PI * 2, nd = norm(add(d, [Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8])); grow(e, nd, L * 0.75, r * 0.78, depth - 1); }
                };
                const trunks = 3 + Math.round(sp * 3);
                for (let i = 0; i < trunks; i++) { const a = i / trunks * Math.PI * 2, d = norm([Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5]); grow([Math.cos(a) * S * 0.05, 0, Math.sin(a) * S * 0.05], d, S * 0.3, S * 0.05, 3); }
            }
            for (const p of tipGlow) Kit.blob(glow, p, S * (preset === 'fan' ? 0.009 : 0.03), { sides: preset === 'fan' ? 4 : 6, rings: preset === 'fan' ? 2 : 4, color: () => lin(C[3]), sway });
            // A rock it grows on.
            Kit.blob(body, [0, 0, 0], [S * 0.16, S * 0.07, S * 0.13], { sides: 10, rings: 6, bump: d => 0.2 * N.n3(d[0] * 2, d[1] * 2, d[2] * 2), color: () => lin([0.35, 0.33, 0.3]) });
            swayDeg = 2;
        } else if (form === 'puffball') {
            // Puffballs of a taut cell-patterned membrane on stalks of many heights; a lit frill of gills under each,
            // a dark pore at the crown, and spores held up on threads above it.
            skin = 'membrane';
            const n = 3 + Math.round(sp * 4), spores = 3 + Math.round(ch * 7);
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2 + R.next() * 0.7, d = i === 0 ? 0 : S * 0.42 * (0.5 + sp) * (0.6 + R.next() * 0.4), br = S * (i === 0 ? 0.17 : 0.06 + R.next() * 0.08);
                const stalk = i === 0 ? br * 0.9 : br * (0.8 + R.next() * 3.2), base = [Math.cos(a) * d, 0, Math.sin(a) * d], c = add(base, [0, stalk + br * 0.82, 0]);
                const bend = [Math.cos(a) * br * 0.25, 0, Math.sin(a) * br * 0.25];
                limb(body, [base, add(add(base, [0, stalk * 0.5, 0]), scale(bend, 0.5)), add(c, [0, -br * 0.6, 0])], br * 0.32, br * 0.22, { sides: 10, color: t => grad(0.25 + t * 0.35), sway, vScale: br * 2 });
                Kit.blob(body, c, [br, br * 0.88, br], { sides: 22, rings: 14, uRepeat: 2, bump: dd => -0.035 * smooth(0.25, 0.05, N.cells(((Math.atan2(dd[2], dd[0]) / (Math.PI * 2)) % 1 + 1) % 1, (dd[1] + 1) / 2, 14, 8, 0.7).d1) + 0.02 * dd[1], color: (p, dd) => grad(0.55 + 0.4 * (dd[1] + 1) / 2), sway });
                // The pore at the crown: a dark mouth with a lit lip.
                Kit.tube(glow, Array.from({ length: 17 }, (_, k) => { const t = k / 16 * Math.PI * 2; return add(c, [Math.cos(t) * br * 0.16, br * 0.87, Math.sin(t) * br * 0.16]); }), br * 0.03, { sides: 5, color: () => lin(C[3]), sway });
                Kit.blob(body, add(c, [0, br * 0.84, 0]), [br * 0.15, br * 0.05, br * 0.15], { sides: 10, rings: 4, color: () => lin([0.03, 0.02, 0.04]), sway });
                // Gills: a lit frill on the underside, from the stalk out.
                const fins = 22, y0 = c[1] - br * 0.55;
                for (let k = 0; k < fins; k++) {
                    const t = k / fins * Math.PI * 2, dd = [Math.cos(t), 0, Math.sin(t)], side = [-dd[2], 0, dd[0]];
                    const inner = add([c[0], y0 - br * 0.1, c[2]], scale(dd, br * 0.25)), outer = add([c[0], y0 + br * 0.12, c[2]], scale(dd, br * 0.8)), gh = br * 0.16;
                    const s0 = glow.P.length / 3;
                    for (const [p, hh] of [[inner, gh], [outer, gh * 0.4]]) for (const dy of [0, -1]) Kit.vert(glow, add(p, [0, dy * hh, 0]), side, 0, 0, lin(mix(C[3], C[1], 0.3)), sway(p));
                    glow.I.push(s0, s0 + 2, s0 + 1, s0 + 1, s0 + 2, s0 + 3);
                    Kit.backFaces(glow, glow.I.length - 6);
                }
                // Spores held up on threads, lit.
                for (let k = 0; k < spores * (i === 0 ? 2 : 1); k++) {
                    const ang = R.next() * Math.PI * 2, el = 0.7 + R.next() * 0.8, dir = norm([Math.cos(ang) * Math.cos(el), Math.sin(el), Math.sin(ang) * Math.cos(el)]);
                    const from = add(c, scale(dir, br * 0.9)), to = add(from, add(scale(dir, br * (0.8 + R.next() * 1.6)), [0, br * 0.8, 0]));
                    limb(body, [from, mix(from, to, 0.5), to], S * 0.003, S * 0.0015, { sides: 3, color: () => lin(C[2]), sway });
                    Kit.blob(glow, to, S * 0.012 * (0.7 + R.next() * 0.6), { sides: 6, rings: 4, color: () => lin(C[3]), sway });
                }
            }
            swayDeg = 2;
        } else if (form === 'horn') {
            skin = 'stalk';
            const baseR = S * 0.12 * (0.7 + sp * 0.5);
            Kit.blob(body, [0, baseR * 0.3, 0], [baseR, baseR * 0.55, baseR], { sides: 16, rings: 8, bump: d => 0.15 * N.n3(d[0] * 2, d[1] * 2, d[2] * 2) + (d[1] < 0 ? d[1] * 0.4 : 0), color: () => grad(0.15) });
            const n = 3 + Math.round(sp * 3);
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2 + R.next() * 0.5, out = [Math.cos(a), 0, Math.sin(a)], side = [-out[2], 0, out[0]];
                const H = S * (i === 0 ? 1 : 0.55 + R.next() * 0.35), turns = 0.6 + ch * 1.4, rad = H * 0.18 * (0.8 + R.next() * 0.4), pts = [];
                const segs = 40;
                for (let k = 0; k <= segs; k++) {
                    const t = k / segs, th = turns * Math.PI * 2 * t, rr = rad * (1 - t * 0.55) * smooth(0, 0.15, t);
                    pts.push(add([out[0] * baseR * 0.4, baseR * 0.4, out[2] * baseR * 0.4], add(scale(UP, H * t), add(scale(out, rr * (Math.cos(th) - 1) * -1 + t * H * 0.12), scale(side, rr * Math.sin(th))))));
                }
                const r0 = H * 0.085, ridges = 9 + Math.round(ch * 6);
                limb(body, pts, r0, r0 * 0.06, { sides: 12, ridges, color: t => grad(0.15 + t * 0.85), sway, vScale: H / ridges, uRepeat: 2 });
                // Lit bands in some of the ridges' grooves, and the tip.
                for (let k = 1; k < ridges; k += 2) {
                    const t = (k + 0.5) / ridges, at = Trees.along(pts, t), [u, v] = basis(at.d), rr = lerp(r0, r0 * 0.06, Math.pow(t, 0.8)) * 1.02, loop = [];
                    for (let s = 0; s <= 14; s++) { const ang = s / 14 * Math.PI * 2; loop.push(add(at.p, add(scale(u, Math.cos(ang) * rr), scale(v, Math.sin(ang) * rr)))); }
                    Kit.tube(glow, loop, rr * 0.08 + 0.002, { sides: 4, color: () => lin(C[3]), sway });
                }
                Kit.blob(glow, pts[segs], r0 * 0.12 + 0.004, { sides: 6, rings: 4, color: () => lin(C[3]), sway });
            }
            swayDeg = 0.6;
        }

        // Leaves (fleshy alien paddles or fronds) on cards and ribbons.
        const out = { parts: [], textures: {}, swayDegrees: swayDeg }, quick = env.quick;
        if (leafCells) {
            const cells = leafCells === 'frond' ? Trees.strips([0, 1, 2, 3].map(() => ({ painter: 'frond', palette: [P[1], P[2]], stem: P[3], count: 30, leaflet: 0.1, angle: 1.2 })))
                : Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'sprig', shape: i % 2 ? 'paddle' : 'heart', palette: [P[1], P[2], P[1]], stem: P[0], count: 3 + i, len: 0.45, wid: 0.6, petiole: 0.2 })));
            const pic = helpers.picture(cache, ['alienleaf', leafCells, r.palette, quick ? 512 : 1024].join('|'), () => Tex.leaves('alien-' + leafCells + '-' + r.palette, cells, quick ? 512 : 1024, 9));
            out.textures[pic.name] = pic;
            const uv = cells.map((_, i) => Trees.cellUv(cells, i));
            for (const [base, up, side, w, h] of leaves.cards || []) Kit.card(leaves, base, up, len(side) > 0.1 ? side : [1, 0, 0], w, h, uv[Math.floor(R.next() * 4)], { fold: 0.15, rows: 2, bend: 0.25, twoSided: true, color: p => lin([1, 1, 1].map(v => v * (0.6 + 0.4 * smooth(0, h, p[1])))), sway });
            for (const rb of leaves.ribbons || []) Kit.ribbon(leaves, rb.pts, k => rb.w * Math.sin(Math.PI * Math.min(1, (k + 1) / rb.pts.length)), () => rb.side, uv[Math.floor(R.next() * 4)], { fold: 0.2, twoSided: true, color: (p, t) => lin([1, 1, 1].map(v => v * (0.6 + 0.4 * t))), sway });
            out.parts.push([leaves, { name: 'Leaves', texture: pic.name, cutout: true, alphaCutoff: 0.45, roughness: 0.6 }]);
        }
        const bodyCols = [P[0], P[1], P[2]];
        const barkSize = quick ? 256 : 512;
        const skinPic = helpers.picture(cache, ['alienskin', skin, bodyCols.join(), barkSize].join('|'), () => Tex.bark(skin, ['#3a3a3a', '#8a8a8a', '#e0e0e0'], barkSize, 13));
        out.textures[skinPic.albedo.name] = skinPic.albedo; out.textures[skinPic.normal.name] = skinPic.normal;
        out.parts.push([body, { name: 'Body', texture: skinPic.albedo.name, normalTexture: skinPic.normal.name, normalScale: 0.8, roughness: skin === 'crystal' ? 0.3 : 0.55 }]);
        if (Kit.count(skinGeo)) {
            const vp = helpers.picture(cache, 'glow|veins', () => Tex.glow('veins', 256, 3));
            out.textures[vp.name] = vp;
            out.parts.push([skinGeo, { name: 'Skin', opacity: 0.58, roughness: 0.18, emissive: P[3], emissiveTexture: vp.name, emissiveIntensity: 0.12 + r.glow * 0.45 }]);
        }
        if (Kit.count(crystal)) out.parts.push([crystal, { name: 'Crystal', roughness: 0.12, emissive: P[3], emissiveIntensity: 0.08 + r.glow * 0.3 }]);
        if (Kit.count(glow)) {
            const mat = { name: 'Glow', roughness: 0.3, emissive: P[3], emissiveIntensity: 0.1 + r.glow * 0.9 };
            if (glowPattern) { const gp = helpers.picture(cache, 'glow|' + glowPattern, () => Tex.glow(glowPattern, 256, 3)); out.textures[gp.name] = gp; mat.emissiveTexture = gp.name; }
            out.parts.push([glow, mat]);
        }
        return out;
    }

    /** Every face its own flat normal (faceted crystal). */
    function facet(g) {
        const P = [], Nn = [], T = [], C = [], S = [], I = [];
        for (let t = 0; t < g.I.length; t += 3) {
            const ids = [g.I[t], g.I[t + 1], g.I[t + 2]], pts = ids.map(i => [g.P[i * 3], g.P[i * 3 + 1], g.P[i * 3 + 2]]), n = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
            ids.forEach((i, q) => { P.push(...pts[q]); Nn.push(...n); T.push(g.T[i * 2], g.T[i * 2 + 1]); C.push(g.C[i * 3], g.C[i * 3 + 1], g.C[i * 3 + 2]); S.push(g.S[i]); I.push(I.length); });
        }
        Object.assign(g, { P, N: Nn, T, C, S, I });
        return g;
    }

    const api = { FORMS, PAL, build };
    root.RRAlienFlora = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
