/**
 * RRCableProp - Wires and cables: one wire or a bundle of up to 24, its gauge,
 * its colors (one, color-coded or mixed), loose or in a jacket, ties or wraps
 * along a loose bundle, laid along a path (straight, sagging between two ends,
 * coiled, or lying on the ground with a few bends), and what ends it (nothing,
 * a plug, stripped copper, ring terminals, or a sci-fi coupling).
 *
 * Built in weapon space (RRWeaponKit) with +z up, laid out by its finish (on
 * the floor, centered). A bundle's wires lie packed round its middle (a
 * sunflower packing), twisted along it when loose; a jacketed one shows its
 * wires only where they fan out of the jacket at each end. Made once per
 * recipe; nothing changes per frame.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const CM = need('RRContainerMesh', './ContainerMesh.js');
    const K = need('RRWeaponKit', './WeaponKit.js');
    const { clamp, color, pick } = K;
    const { add, sub, mul, norm, dot, cross } = K.vec;

    const PATHS = [['straight', 'Laid straight'], ['sag', 'Sagging between two ends'], ['coil', 'Coiled'], ['ground', 'Lying on the ground']];
    const ENDS = [['none', 'Plain ends'], ['plug', 'Plugs'], ['bare', 'Stripped ends'], ['ring', 'Ring terminals'], ['scifi', 'Sci-fi couplings']];
    const COLORINGS = [['one', 'All one color'], ['coded', 'Color-coded'], ['random', 'Mixed colors']];
    /** Wire insulation in the standard code order: brown, red, orange, yellow, green, blue, violet, grey, white, black (then it repeats). */
    const CODED = ['#7a4e2a', '#b8282a', '#e0761c', '#e2c230', '#2f8a3c', '#2456b0', '#7a42a8', '#8c8f94', '#ecebe4', '#1c1c1f'];
    /** More to add to a palette after those, and the pool a rolled palette draws from. */
    const EXTRA = ['#e86aa0', '#30b8c0', '#9ac83a', '#c8a050', '#5a5f68', '#d84a8a'];
    const MAX_COLORS = 12;

    // [id, label, defaults]
    const PRESETS = [
        ['cord', 'Extension cord', { wires: 3, gauge: 0.45, coloring: 'one', color: '#b8282a', jacketColor: '#e8761e', accent: '#2a2a2e', jacket: true, ties: 0, path: 'ground', length: 2.5, sag: 0.4, ends: 'plug', glow: false }],
        ['bundle', 'Cable bundle', { wires: 12, gauge: 0.35, coloring: 'coded', color: '#1c1c1f', jacketColor: '#1d1e21', accent: '#1d1e22', jacket: false, ties: 5, path: 'ground', length: 1.6, sag: 0.4, ends: 'bare', glow: false }],
        ['powerline', 'Hanging power line', { wires: 1, gauge: 0.8, coloring: 'one', color: '#26272b', jacketColor: '#1d1e21', accent: '#7a7c80', jacket: false, ties: 0, path: 'sag', length: 4, sag: 0.45, ends: 'ring', glow: false }],
        ['coiled', 'Coiled cable', { wires: 2, gauge: 0.5, coloring: 'one', color: '#1c1c1f', jacketColor: '#1d1e21', accent: '#3a3c40', jacket: true, ties: 0, path: 'coil', length: 3, sag: 0.4, ends: 'plug', glow: false }],
        ['loose', 'Loose wires', { wires: 6, gauge: 0.3, coloring: 'random', color: '#b8282a', jacketColor: '#1d1e21', wireColors: ['#b8282a', '#1c1c1f', '#2456b0', '#e2c230', '#2f8a3c', '#e0761c'], accent: '#c8a050', jacket: false, ties: 0, path: 'straight', length: 0.8, sag: 0.4, ends: 'bare', glow: false }],
        ['conduit', 'Sci-fi conduit', { wires: 7, gauge: 0.55, coloring: 'one', color: '#8c8f94', jacketColor: '#2c3038', accent: '#38d8ff', jacket: true, ties: 9, path: 'sag', length: 2.4, sag: 0.35, ends: 'scifi', glow: true }]
    ];
    const IDS = PRESETS.map(p => p[0]), BY_ID = new Map(PRESETS.map(p => [p[0], p[2]]));

    /** A palette: the valid colors of `list` (1 to 12), else `fallback`. */
    function palette(list, fallback) {
        const out = Array.isArray(list) ? list.map(c => color(c, '')).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, MAX_COLORS) : [];
        return out.length ? out : fallback.slice();
    }

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, IDS, 'cord'), base = BY_ID.get(preset);
        const v = key => (r[key] !== undefined ? r[key] : base[key]);
        return {
            kind: 'cable', preset,
            wires: Math.round(clamp(v('wires'), 1, 24, base.wires)), gauge: clamp(v('gauge'), 0, 1, base.gauge),
            coloring: pick(v('coloring'), COLORINGS.map(c => c[0]), 'one'), color: color(v('color'), base.color), jacketColor: color(v('jacketColor'), base.jacketColor), accent: color(v('accent'), base.accent),
            // The palette a color-coded bundle cycles through (or mixed wires draw from): 1 to 12 colors, saved with it.
            wireColors: palette(v('wireColors'), base.wireColors || CODED),
            jacket: !!v('jacket'), ties: Math.round(clamp(v('ties'), 0, 24, base.ties)),
            path: pick(v('path'), PATHS.map(p => p[0]), 'ground'), length: clamp(v('length'), 0.3, 6, base.length), sag: clamp(v('sag'), 0, 1, base.sag),
            ends: pick(v('ends'), ENDS.map(e => e[0]), 'none'), glow: !!v('glow'), seed: Math.round(clamp(r.seed, 0, 99999, 7))
        };
    }

    // ── the path ───────────────────────────────────────────────────────────
    /** A wire's radius (insulation) for a gauge 0..1: from thin hookup wire to a thick power cable. */
    const wireR = g => 0.0011 + 0.0065 * g * g + 0.0012 * g;
    /** Where each of n wires sits across the bundle (offsets in its section), and the bundle's radius. */
    function packing(n, rw) {
        // Rings of wires round the middle (as a real bundle lays up), each ring wide enough for its wires to touch.
        const RINGS = [null, [1], [2], [3], [4], [5], [6], [1, 6], [1, 7], [2, 7], [3, 7], [3, 8], [3, 9], [4, 9], [4, 10], [5, 10], [5, 11], [6, 11], [6, 12], [1, 6, 12], [1, 7, 12], [1, 7, 13], [2, 7, 13], [2, 8, 13], [3, 8, 13]];
        const at = [];
        let last = -rw * 2;
        for (const [k, m] of RINGS[n].entries()) {
            const rr = Math.max(m === 1 ? 0 : rw / Math.sin(Math.PI / m), last + rw * 2);
            for (let i = 0; i < m; i++) { const a = (i + k * 0.5) * Math.PI * 2 / m; at.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
            last = rr;
        }
        return { at, R: last + rw };
    }
    /** The bundle's middle line: `n` + 1 points along it, its ends' directions after. */
    function centerline(r, Rb, n) {
        const L = r.length, pts = [];
        if (r.path === 'straight') for (let k = 0; k <= n; k++) pts.push([L * k / n, 0, Rb]);
        else if (r.path === 'sag') {
            // A catenary between two ends at the same height, its lowest point `drop` under them.
            const drop = L * (0.02 + 0.3 * r.sag), a = 2.2, top = drop + Rb + 0.02;
            for (let k = 0; k <= n; k++) { const t = k / n, c = (Math.cosh(a * (2 * t - 1)) - 1) / (Math.cosh(a) - 1); pts.push([L * t, 0, top - drop * (1 - c)]); }
        } else if (r.path === 'coil') {
            // Turns laid flat on the floor in a spiral, each its own width out from the last; the inner end's lead
            // rides out over them, the outer end's runs off along its last turn.
            const lead = Math.min(0.3, L * 0.14), body = L - lead * 2, Rc = Math.max(Rb * 3, clamp(0.07 + body * 0.015, 0.06, 0.16, 0.1)), pitch = Rb * 2.15;
            let turns = 1;
            for (let i = 0; i < 6; i++) turns = Math.max(0.8, body / (Math.PI * 2 * (Rc + pitch * turns / 2)));
            const out = Rc + pitch * (turns + 0.5) + Rb * 2, m = n - 18, over = Rb * 3.3;
            const spiral = t => { const a = Math.PI + t * turns * Math.PI * 2, rr = Rc + pitch * t * turns; return [Math.cos(a) * rr, Math.sin(a) * rr, Rb]; };
            // The inner lead runs straight off the first turn's start along its tangent, rising gently over the turns
            // outside it and settling back onto the floor beyond them, so both ends lead into the coil.
            const y1 = 0.6 * Math.sqrt((Rc + pitch) ** 2 - Rc * Rc), y2 = Math.sqrt(out * out - Rc * Rc), Y = y2 + lead * 0.7;
            for (let q = 0; q < 16; q++) {
                const y = Y * (1 - q / 16), z = y < y1 ? Rb + (over - Rb) * smooth(y / y1) : y < y2 ? over : Rb + (over - Rb) * (1 - smooth((y - y2) / (Y - y2)));
                pts.push([-Rc, y, z]);
            }
            for (let k = 0; k <= m; k++) pts.push(spiral(k / m));
            const e = pts[pts.length - 1], d = norm(sub(e, pts[pts.length - 2]));
            pts.push(add(e, mul([d[0], d[1], 0], lead * 0.5)), add(e, mul([d[0], d[1], 0], lead)));
        } else {
            // On the ground: a heading that wanders by a few slow bends (the seed), integrated along its length.
            const rnd = Rand.roll(r.seed * 31 + 5), f = [rnd.range(1, 2.2), rnd.range(2.4, 3.6), rnd.range(0, 6)], amp = [rnd.range(0.4, 0.8), rnd.range(0.15, 0.35)];
            let p = [0, 0, Rb], h = 0;
            pts.push(p);
            for (let k = 1; k <= n; k++) {
                const t = k / n; h = amp[0] * Math.sin(Math.PI * 2 * f[0] * t * 0.5 + f[2]) + amp[1] * Math.sin(Math.PI * 2 * f[1] * t + f[2] * 0.7);
                p = add(p, [Math.cos(h) * L / n, Math.sin(h) * L / n, 0]); pts.push(p);
            }
        }
        return pts;
    }
    /** A frame at each point: tangent, and a normal and binormal carried along without twisting. */
    function frames(pts) {
        const n = pts.length, out = [];
        let N = null;
        for (let k = 0; k < n; k++) {
            const T = norm(sub(pts[Math.min(n - 1, k + 1)], pts[Math.max(0, k - 1)]));
            if (!N) { const ref = Math.abs(T[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; N = norm(sub(ref, mul(T, dot(ref, T)))); }
            else N = norm(sub(N, mul(T, dot(N, T))));
            out.push({ T, N, B: cross(T, N) });
        }
        return out;
    }
    /** Points `s` meters along a polyline (from its start, or from its end when `back`). */
    function along(pts, s) {
        let left = s;
        for (let k = 0; k + 1 < pts.length; k++) { const l = Math.hypot(...sub(pts[k + 1], pts[k])); if (left <= l) return { k, t: left / (l || 1) }; left -= l; }
        return { k: pts.length - 2, t: 1 };
    }
    const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const lengthOf = pts => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(...sub(pts[k], pts[k - 1])); return L; };

    // ── the build ──────────────────────────────────────────────────────────
    function build(recipe, cache) {
        const r = normalize(recipe), H = { Wire: [], Jacket: [], Tie: [], Copper: [], Plug: [], Metal: [], Glow: [], Slot: [] }, wireLists = [];
        // A bundle stays under 8 cm across: thick wires in a big bundle come out a little thinner.
        const rw0 = wireR(r.gauge), rw = rw0 * Math.min(1, 0.04 / packing(r.wires, rw0).R), pack = packing(r.wires, rw), Rb = r.jacket ? pack.R + Math.max(0.0012, rw * 0.35) : pack.R;
        // Points along it: enough for the bends (and the twist of a loose bundle), within the triangle budget.
        const sides = r.wires > 8 ? 6 : 8, perWire = r.jacket ? 0 : r.wires * sides * 2;
        const want = r.path === 'coil' ? 150 : r.path === 'straight' ? (r.wires > 1 && !r.jacket ? Math.round(r.length / 0.03) : 4) : 72;
        const n = Math.max(r.path === 'coil' ? 40 : 4, Math.min(want, perWire ? Math.floor(24000 / perWire) : 160));
        const mid = centerline(r, Rb, n), F = frames(mid), total = lengthOf(mid);
        // One color for every wire; the palette in order (coded); or the palette dealt out by the seed, each color once before any repeats (mixed).
        const pal = r.wireColors, rnd = Rand.roll(r.seed * 7 + 1), deck = [];
        const hueOf = i => {
            if (r.coloring === 'one') return r.color;
            if (r.coloring === 'coded') return pal[i % pal.length];
            if (!deck.length) { deck.push(...pal); for (let q = deck.length - 1; q > 0; q--) { const w = Math.floor(rnd.range(0, q + 1)) % (q + 1); [deck[q], deck[w]] = [deck[w], deck[q]]; } }
            return deck.pop();
        };
        const colors = Array.from({ length: r.wires }, (_, i) => hueOf(i));
        const lay = 0.08 + rw * 30, twist = r.wires > 1 && !r.jacket;
        // Where along it each point sits (meters), for the twist and the ends.
        const sAt = [0];
        for (let k = 1; k < mid.length; k++) sAt.push(sAt[k - 1] + Math.hypot(...sub(mid[k], mid[k - 1])));
        const wirePt = (k, j, spread) => {
            const [a, b] = pack.at[j], tw = twist ? sAt[k] / lay * Math.PI * 2 : 0, c = Math.cos(tw), s = Math.sin(tw), f = F[k], m = spread || 1;
            return add(mid[k], add(mul(f.N, (a * c - b * s) * m), mul(f.B, (a * s + b * c) * m)));
        };
        const ends = [{ k: 0, dir: mul(F[0].T, -1) }, { k: mid.length - 1, dir: F[mid.length - 1].T }];
        const tube = (pts, rad, sd) => K.tube(pts, rad, sd || sides);
        const listFor = j => { const c = colors[j], i = wireLists.indexOf(c); if (i >= 0) return i; wireLists.push(c); return wireLists.length - 1; };
        const byColor = [];
        const push = (j, m) => { const i = listFor(j); (byColor[i] = byColor[i] || []).push(m); };
        const bare = r.ends === 'bare', ring = r.ends === 'ring';
        if (r.jacket) {
            // The jacket the whole way; at each end its wires fan a little out of it (stripped or into terminals).
            const sleeve = r.ends === 'plug' || r.ends === 'scifi' ? 0 : Math.min(0.06, total * 0.08);
            const k0 = sleeve > 0 ? along(mid, sleeve).k + 1 : 0, k1 = sleeve > 0 ? mid.length - 1 - (along(mid.slice().reverse(), sleeve).k + 1) : mid.length - 1;
            const jacketPts = mid.slice(k0, k1 + 1);
            if (jacketPts.length >= 2) H.Jacket.push(tube(jacketPts, Rb, r.wires > 8 ? 10 : 12));
            if (sleeve > 0) for (const [from, to] of [[0, k0], [k1, mid.length - 1]]) for (let j = 0; j < r.wires; j++) {
                const seg = [];
                for (let k = from; k <= to; k++) { const u = from === 0 ? (to - k) / Math.max(1, to - from) : (k - from) / Math.max(1, to - from); seg.push(wirePt(k, j, 1 + 0.9 * u)); }
                if (seg.length >= 2) push(j, tube(seg, rw));
            }
        } else for (let j = 0; j < r.wires; j++) push(j, tube(mid.map((_, k) => wirePt(k, j)), rw));
        // Ties (or a sci-fi conduit's ribs) spaced along it.
        if (r.ties) for (let i = 0; i < r.ties; i++) {
            const s = total * (i + 1) / (r.ties + 1), a = along(mid, s - 0.005), b = along(mid, s + 0.005), seg = [];
            for (let k = a.k; k <= b.k + 1 && k < mid.length; k++) seg.push(mid[k]);
            if (seg.length < 2) continue;
            const p0 = add(mid[a.k], mul(sub(mid[a.k + 1], mid[a.k]), a.t)), p1 = add(mid[b.k], mul(sub(mid[b.k + 1], mid[b.k]), b.t));
            const tie = tube([p0, add(p0, mul(sub(p1, p0), 0.5)), p1], Rb + (r.preset === 'conduit' || r.jacket ? 0.0018 : 0.0011), 14);
            (r.glow && r.jacket ? H.Glow : H.Tie).push(tie);
            if (!r.jacket) { const f = F[a.k]; H.Tie.push(K.bar(add(p0, mul(f.N, Rb + 0.001)), add(p0, mul(f.N, Rb + 0.0045)), f.T, 0.0035, 0.004)); }
        }
        // What ends it.
        for (const e of ends) {
            const p = mid[e.k], d = e.dir, f = F[e.k], N = f.N, B = f.B;
            if (r.ends === 'plug') {
                // A molded plug: a strain relief tapering into a rounded body, the prongs out of its face.
                const L1 = Math.max(0.025, Rb * 5), w = Math.max(Rb * 2.6, 0.016), body = Math.max(0.03, w * 1.3);
                H.Plug.push(Mesh.lathe([[Rb * 1.05, 0], [Rb * 1.25, L1 * 0.5], [Rb * 1.7, L1], [0, L1]], 14, { base: sub(p, mul(d, 0.002)), dir: d, sharp: 0.5 }));
                // The far end a plug with its prongs, the near end a socket (larger, its slots in its face).
                const socket = e.k === 0, sw = socket ? w * 1.3 : w, sb = socket ? body * 1.25 : body, c = add(p, mul(d, L1 + sb / 2 - 0.002));
                H.Plug.push(K.sweep([sub(c, mul(d, sb / 2)), add(c, mul(d, sb / 2))], K.roundRect(sw * 0.75, sw, sw * 0.22, 3), { up: [0, 0, 1] }));
                const side = Math.hypot(...cross(d, [0, 0, 1])) > 0.2 ? norm(cross(d, [0, 0, 1])) : N;
                for (const sgn of [-1, 1]) {
                    const q = add(add(c, mul(d, sb / 2 - 0.002)), mul(side, sgn * w * 0.22));
                    if (socket) H.Slot.push(K.bar(sub(q, mul(d, 0.001)), add(q, mul(d, 0.0026)), [0, 0, 1], w * 0.09, w * 0.3));
                    else H.Metal.push(K.bar(q, add(q, mul(d, Math.max(0.012, w * 0.9))), [0, 0, 1], w * 0.08, w * 0.28));
                }
            } else if (r.ends === 'scifi') {
                // A turned coupling: a collar, a lit ring, a knurled sleeve and a pinned face.
                const R0 = Rb * 1.35, prof = [[Rb * 0.9, 0], [R0, Rb * 0.6], [R0, Rb * 1.6], [R0 * 1.12, Rb * 1.8], [R0 * 1.12, Rb * 3.2], [R0 * 0.9, Rb * 3.5], [R0 * 0.9, Rb * 4.2], [R0 * 0.6, Rb * 4.4], [0, Rb * 4.4]];
                H.Metal.push(Mesh.lathe(prof, 20, { base: sub(p, mul(d, 0.002)), dir: d, sharp: 0.5 }));
                H.Glow.push(Mesh.lathe([[R0 * 0.98, 0], [R0 * 1.06, 0], [R0 * 1.06, Rb * 0.5], [R0 * 0.98, Rb * 0.5], [R0 * 0.98, 0]], 20, { base: add(p, mul(d, Rb * 3.45)), dir: d, caps: false }));
                for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, q = add(add(p, mul(d, Rb * 4.4)), add(mul(N, Math.cos(a) * R0 * 0.4), mul(B, Math.sin(a) * R0 * 0.4))); H.Copper.push(tube([q, add(q, mul(d, Rb * 0.6))], Rb * 0.12, 6)); }
            } else if (bare || ring) for (let j = 0; j < r.wires; j++) {
                // Each wire's own end: its copper bared past the insulation, and on a ring terminal a crimped barrel and lug.
                const spread = r.jacket ? 1.9 : 1, q = wirePt(e.k, j, spread), tip = add(q, mul(d, Math.max(0.006, rw * 4)));
                H.Copper.push(tube([sub(q, mul(d, 0.001)), tip], rw * 0.55, 6));
                if (ring) {
                    const bl = Math.max(0.008, rw * 6), b0 = sub(q, mul(d, bl * 0.4)), lr = rw * 1.9 + 0.002, lc = add(tip, mul(d, lr * 0.9));
                    H.Metal.push(tube([b0, add(b0, mul(d, bl))], rw * 1.25, 10));
                    H.Metal.push(Mesh.lathe([[lr * 0.45, 0], [lr, 0], [lr, Math.max(0.0008, rw * 0.35)], [lr * 0.45, Math.max(0.0008, rw * 0.35)], [lr * 0.45, 0]], 16, { base: lc, dir: N, caps: false }));
                    H.Metal.push(K.bar(add(b0, mul(d, bl * 0.8)), sub(lc, mul(d, lr * 0.5)), N, lr * 0.9, Math.max(0.0008, rw * 0.35)));
                    void B;
                }
            } else if (!r.jacket && r.wires === 1) H.Wire.push(Mesh.lathe([[0, 0], [rw * 0.6, 0], [rw * 0.6, 0.001], [0, 0.001]], 8, { base: p, dir: d }));
        }
        const P = {};
        byColor.forEach((list, i) => { P['Wire' + (i + 1)] = { meshes: list, look: { kind: 'prop', color: wireLists[i], roughness: 0.42, metalness: 0 } }; });
        if (H.Wire.length) P.WireEnd = { meshes: H.Wire, look: { kind: 'metal', color: '#b87333', roughness: 0.35, metalness: 0.9 } };
        const jacketLook = r.preset === 'conduit' || r.glow ? { kind: 'metal', color: r.jacketColor, roughness: 0.38, metalness: 0.55 } : { kind: 'prop', color: r.jacketColor, roughness: 0.55, metalness: 0 };
        if (H.Jacket.length) P.Jacket = { meshes: H.Jacket, look: jacketLook };
        if (H.Tie.length) P.Tie = { meshes: H.Tie, look: { kind: 'prop', color: r.accent, roughness: 0.5, metalness: 0 } };
        if (H.Plug.length) P.Plug = { meshes: H.Plug, look: { kind: 'prop', color: r.jacket ? r.jacketColor : r.accent, roughness: 0.5, metalness: 0 } };
        if (H.Copper.length) P.Copper = { meshes: H.Copper, look: { kind: 'metal', color: '#c27a44', roughness: 0.3, metalness: 0.95 } };
        if (H.Metal.length) P.Metal = { meshes: H.Metal, look: { kind: 'metal', color: r.ends === 'plug' ? '#d4b060' : '#b8bcc2', roughness: 0.3, metalness: 0.9 } };
        if (H.Slot.length) P.Slot = { meshes: H.Slot, look: { kind: 'prop', color: '#0e0e10', roughness: 0.6, metalness: 0 } };
        if (H.Glow.length) P.Glow = r.glow ? { meshes: H.Glow, look: { kind: 'prop', color: r.accent, emissive: r.accent, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0 } } : { meshes: H.Glow, look: { kind: 'prop', color: r.accent, roughness: 0.4, metalness: 0.2 } };
        void cache; void CM;
        const out = K.finish('cable', r, P, { start: mid[0], end: mid[mid.length - 1] }, {}, { template: null, pitch: r.path === 'sag' ? 0.2 : 0.55 });
        delete out.holdable;
        return out;
    }

    /** A random cable: another style when Everything rolls; shape its length, sag, path and count; details its ends, jacket and ties; colors its wires. */
    function random(seed, recipe, scope, keep) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur));
        const all = !scope || scope === 'all', has = part => all || scope === part;
        if (all && !keep) Object.assign(out, BY_ID.get(out.preset = R.pick(PRESETS)[0]));
        if (has('shape')) { out.length = +R.range(0.5, 4).toFixed(2); out.sag = +R.range(0.1, 0.9).toFixed(2); out.path = R.pick(PATHS)[0]; out.wires = R.pick([1, 2, 3, 4, 6, 8, 12, 16, 24]); out.gauge = +R.range(0.15, 0.8).toFixed(2); out.seed = Math.floor(R.range(0, 99999)); }
        if (has('details')) { out.ends = R.pick(ENDS)[0]; out.jacket = R.chance(0.5); out.ties = out.jacket ? 0 : R.pick([0, 2, 4, 6]); }
        if (has('colors')) {
            out.coloring = R.pick(COLORINGS)[0]; out.color = R.pick(CODED.concat(Rand.PALETTES.dark)); out.jacketColor = R.pick(Rand.PALETTES.dark.concat(['#e8761e', '#2456b0', '#e2c230', '#ecebe4']));
            out.accent = R.pick(Rand.PALETTES.glow.concat(['#1d1e22', '#c8a050'])); out.seed = Math.floor(R.range(0, 99999));
            // A rolled palette: the standard code's first few, or a handful drawn from all of them.
            const pool = CODED.concat(EXTRA);
            out.wireColors = R.chance(0.4) ? CODED.slice(0, R.int(3, 10)) : Array.from({ length: R.int(3, 8) }, () => pool.splice(Math.floor(R.range(0, pool.length)) % pool.length, 1)[0]);
        }
        return normalize(out);
    }

    const api = { PRESETS, PATHS, ENDS, COLORINGS, CODED, EXTRA, MAX_COLORS, normalize, build, random, packing, centerline, wireR };
    root.RRCableProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel || (typeof require === 'function' ? require('./PropModel.js') : null);
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'cable', label: 'Cable', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        if (!Catalog.ICONS.cable) Catalog.ICONS.cable = '<path d="M3 7h4c4 0 4 10 8 10h6"/><path d="M3 10h3c4 0 4 10 8 10h7"/><path d="M19 15v4"/>';
        Catalog.category({ id: 'cables', label: 'Wires & Cables', order: 72, parent: 'gear' });
        for (const [id, label] of PRESETS) Catalog.add({ id: 'cable-' + id, category: 'cables', label, icon: 'cable', kind: 'cable', keywords: 'cable wire wires cord bundle power line conduit ' + label.toLowerCase(), start: () => normalize({ preset: id }), matches: r => r.preset === id });
        const page = K.page({
            placeholder: 'Cable', PRESETS: PRESETS.map(p => [p[0], p[1]]), normalize, random, keep: ['coloring', 'color', 'jacketColor', 'wireColors', 'accent'],
            shape(r) {
                let html = this._select('path', 'Path shape', PATHS)
                    + this._slider({ path: 'length', label: 'Cable length', range: [0.3, 6], step: 0.05, format: 'm' });
                if (r.path === 'sag') html += this._slider({ path: 'sag', label: 'Sag', range: [0, 1] });
                html += this._slider({ path: 'wires', label: 'Wires in it', range: [1, 24], step: 1, format: 'int' })
                    + this._slider({ path: 'gauge', label: 'Wire gauge', range: [0, 1] });
                if (r.wires > 1 && !r.jacket) html += this._slider({ path: 'ties', label: 'Cable ties', range: [0, 12], step: 1, format: 'int' });
                return html;
            },
            look(r) {
                let html = this._section('Materials') + this._select('coloring', 'Wire colors', COLORINGS);
                if (r.coloring === 'one') html += this._color('color', 'Wire color');
                else {
                    // The palette: a swatch per color (each opens the color picker), and + / - to change how many cycle.
                    const esc = typeof rrEscapeHtml === 'function' ? rrEscapeHtml : x => x;
                    const sw = r.wireColors.map((c, i) => `<span class="rr-c3d-colorpick"><button type="button" class="rr-c3d-color" data-act="color" data-path="wireColors.${i}" style="--rr-c3d-swatch:${c}" title="${c}"></button></span>`).join('');
                    const add = r.wireColors.length < MAX_COLORS ? `<button type="button" class="rr-btn-chip" data-act="cable-color-add" title="${esc(this._t('Add a wire color'))}">+</button>` : '';
                    const del = r.wireColors.length > 1 ? `<button type="button" class="rr-btn-chip" data-act="cable-color-remove" title="${esc(this._t('Remove the last wire color'))}">−</button>` : '';
                    html += `<div class="rr-c3d-row rr-c3d-colorrow rr-cable-palette"><span class="rr-c3d-label">${this._t('Wire palette')}</span><div class="rr-c3d-swatches" style="flex-wrap:wrap;gap:3px">${sw}${add}${del}</div></div>`;
                }
                html += this._check('jacket', 'In a jacket');
                if (r.jacket) html += this._color('jacketColor', 'Jacket color');
                html += this._select('ends', 'Cable ends', ENDS);
                html += this._color('accent', r.glow ? 'Glow' : 'Ties and plugs');
                if (r.jacket) html += this._slider({ path: 'ties', label: 'Wraps along it', range: [0, 24], step: 1, format: 'int' });
                html += this._check('glow', 'Glows');
                return html;
            }
        });
        // The palette's + and -: the next color of the standard code (then the extras) not yet in it, or the last one off.
        const styleAct = page.act;
        page.act = function(act, b) {
            if (act === 'cable-color-add' || act === 'cable-color-remove') {
                const list = this.recipe.wireColors.slice();
                if (act === 'cable-color-add' && list.length < MAX_COLORS) list.push(CODED.concat(EXTRA).find(c => !list.includes(c)) || CODED[list.length % CODED.length]);
                if (act === 'cable-color-remove' && list.length > 1) list.pop();
                this._set('wireColors', list); this._commit(); this._renderPanel(); this._queueRebuild();
                return;
            }
            return styleAct.call(this, act, b);
        };
        Catalog.ui('cable', page);
    }
})(typeof window !== 'undefined' ? window : globalThis);
