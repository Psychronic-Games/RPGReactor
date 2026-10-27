/**
 * RRInstrumentProp - Instruments, a section of its own: guitars (acoustic,
 * electric, bass), bowed strings (violin and cello, a bow beside them), a
 * lute, a harp, winds (flute, recorder, ocarina), brass (trumpet, saxophone),
 * drums (snare, hand drum), keys (keytar, a glowing synth) and a crystal lyre.
 * Saved holdable: held like a sword by the part a hand takes (a guitar's
 * neck, a flute's body, a drum's rim).
 *
 * Built in weapon space (RRWeaponKit): the instrument's length along +x
 * from its foot (a guitar's tail, a flute's foot joint) to its head, its
 * face (soundboard, keys, valve tops, a drum's head) toward +z, its width
 * along y. Bodies with bouts are lofted "pillows" (rows across the length,
 * an arched top and back joined by the ribs); necks are swept D sections;
 * pipes, bells and shells are turned. Wood is flat-sawn grain run along each
 * part's length (PropPaint.grainWood, PropMesh.grainUv). Everything is made
 * once per recipe; nothing changes per frame.
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
    const { add, sub, mul, norm, lerp } = K.vec;

    const WOODS = [['spruce', 'Spruce'], ['maple', 'Maple'], ['mahogany', 'Mahogany'], ['rosewood', 'Rosewood'], ['walnut', 'Walnut'], ['cedar', 'Cedar'], ['ebony', 'Ebony']];
    const WOOD = { spruce: '#d2ae74', maple: '#d6b484', mahogany: '#7a3e22', rosewood: '#4e2a1c', walnut: '#5a3a22', cedar: '#a8643a', ebony: '#2a2220' };
    const METALS = K.TRIMS;

    // [id, label, group, defaults]
    const PRESETS = [
        ['acoustic', 'Acoustic guitar', 'inst-strings', { wood: 'rosewood', color: '#c8873e', metal: 'gold', accent: '#e8dcc0' }],
        ['electric', 'Electric guitar', 'inst-strings', { wood: 'maple', color: '#b3262e', metal: 'silver', accent: '#ece8de' }],
        ['bass', 'Bass guitar', 'inst-strings', { wood: 'maple', color: '#1f2a44', metal: 'silver', accent: '#ece8de' }],
        ['violin', 'Violin', 'inst-strings', { wood: 'maple', color: '#9a4a1c', metal: 'black', accent: '#e8dcc0', bow: true }],
        ['cello', 'Cello', 'inst-strings', { wood: 'maple', color: '#86401c', metal: 'black', accent: '#e8dcc0', bow: true }],
        ['lute', 'Lute', 'inst-strings', { wood: 'maple', color: '#c8873e', metal: 'bronze', accent: '#e8dcc0' }],
        ['harp', 'Harp', 'inst-strings', { wood: 'walnut', color: '#c8873e', metal: 'gold', accent: '#e8dcc0' }],
        ['flute', 'Flute', 'inst-winds', { wood: 'ebony', color: '#c8873e', metal: 'silver', accent: '#e8dcc0' }],
        ['recorder', 'Recorder', 'inst-winds', { wood: 'maple', color: '#c8873e', metal: 'gold', accent: '#e8dcc0' }],
        ['ocarina', 'Ocarina', 'inst-winds', { wood: 'walnut', color: '#b4643c', metal: 'gold', accent: '#2c5a8a' }],
        ['trumpet', 'Trumpet', 'inst-winds', { wood: 'walnut', color: '#c8873e', metal: 'gold', accent: '#f2ece0' }],
        ['sax', 'Saxophone', 'inst-winds', { wood: 'walnut', color: '#c8873e', metal: 'gold', accent: '#f2ece0' }],
        ['snare', 'Snare drum', 'inst-drums', { wood: 'maple', color: '#7a1e22', metal: 'silver', accent: '#efe8d8' }],
        ['handdrum', 'Hand drum', 'inst-drums', { wood: 'mahogany', color: '#c8873e', metal: 'black', accent: '#c8b48a' }],
        ['keytar', 'Keytar', 'inst-drums', { wood: 'walnut', color: '#e8e4dc', metal: 'silver', accent: '#38c8ff', glow: true }],
        ['lyre', 'Crystal lyre', 'inst-fantasy', { wood: 'walnut', color: '#9fe8ff', metal: 'gold', accent: '#7ae0ff', glow: true }],
        ['synth', 'Synth', 'inst-fantasy', { wood: 'walnut', color: '#22252c', metal: 'steel', accent: '#ff4ab8', glow: true }]
    ];
    /** What each style's sliders mean and which looks it shows; `icon` for the list. */
    const FAMILY = {
        acoustic: { shape: 'Body width', length: 'Neck length', wood: 'Back and sides', color: null, icon: 'guitar' },
        electric: { shape: 'Horn length', length: 'Neck length', wood: 'Wood', color: 'Instrument color', icon: 'guitar' },
        bass: { shape: 'Horn length', length: 'Neck length', wood: 'Wood', color: 'Instrument color', icon: 'guitar' },
        violin: { shape: 'Body width', length: 'Neck length', wood: null, color: 'Varnish', icon: 'violin', bow: true },
        cello: { shape: 'Body width', length: 'Neck length', wood: null, color: 'Varnish', icon: 'violin', bow: true },
        lute: { shape: 'Bowl depth', length: 'Neck length', wood: 'Bowl', color: null, icon: 'guitar' },
        harp: { shape: 'Neck curve', length: 'Height', wood: 'Harp frame', color: null, icon: 'harp' },
        flute: { shape: 'Bore', length: 'Length', wood: null, color: null, icon: 'flute' },
        recorder: { shape: 'Bore', length: 'Length', wood: 'Wood', color: null, icon: 'flute' },
        ocarina: { shape: 'Plumpness', length: 'Length', wood: null, color: 'Glaze', accent: 'Painted band', icon: 'ocarina' },
        trumpet: { shape: 'Bell size', length: 'Length', wood: null, color: null, icon: 'trumpet' },
        sax: { shape: 'Bell size', length: 'Length', wood: null, color: null, icon: 'sax' },
        snare: { shape: 'Depth', length: 'Width', wood: null, color: 'Shell color', icon: 'drum' },
        handdrum: { shape: 'Waist', length: 'Height', wood: 'Wood', color: null, accent: 'Rope', icon: 'drum' },
        keytar: { shape: 'Body depth', length: 'Neck length', wood: null, color: 'Instrument color', accent: 'Glow', glow: true, icon: 'keys' },
        lyre: { shape: 'Arm spread', length: 'Height', wood: 'Soundbox', color: 'Crystal', accent: 'Strings of light', glow: true, icon: 'lyre' },
        synth: { shape: 'Depth', length: 'Width', wood: 'Side cheeks', color: 'Instrument color', accent: 'Glow', glow: true, icon: 'keys' }
    };
    const IDS = PRESETS.map(p => p[0]), BY_ID = new Map(PRESETS.map(p => [p[0], p[3]]));

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, IDS, 'acoustic'), base = BY_ID.get(preset);
        const v = key => (r[key] !== undefined ? r[key] : base[key]);
        return {
            kind: 'instrument', preset,
            size: clamp(r.size, 0.7, 1.4, 1), shape: clamp(r.shape, 0, 1, 0.5), length: clamp(r.length, 0.8, 1.25, 1),
            wood: pick(v('wood'), WOODS.map(w => w[0]), 'walnut'), color: color(v('color'), '#c8873e'), metal: pick(v('metal'), METALS.map(m => m[0]), 'gold'),
            accent: color(v('accent'), '#e8dcc0'), glow: !!v('glow'), bow: !!v('bow')
        };
    }

    // ── shapes ─────────────────────────────────────────────────────────────
    const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const lobe = (t, c, r) => Math.sqrt(Math.max(0, 1 - ((t - c) / r) ** 2));
    const smax = (a, b, p) => Math.pow(a ** p + b ** p, 1 / p);
    /** A body's half width along it (0..1): a lower bout, an upper bout `w2` as wide, a waist between them. */
    const bouts = (c1, r1, c2, r2, w2, p) => t => smax(lobe(t, c1, r1), w2 * lobe(t, c2, r2), p);
    /**
     * A lofted body from x0 to x1: rows across it (denser toward its ends), each from -w(t) to w(t);
     * `top(t, s)` and `bot(t, s)` the heights of its face and back at s in -1..1 across; ribs join them
     * round its edge. Closed, outward.
     */
    function pillow(x0, x1, w, top, bot, o) {
        const opt = o || {}, ts = opt.ts || null, N = ts ? ts.length - 1 : opt.rows || 40, M = opt.cols || 12, g = new CM.Geo(), rows = [];
        for (let k = 0; k <= N; k++) {
            const t = ts ? ts[k] : (1 - Math.cos(Math.PI * k / N)) / 2, x = x0 + (x1 - x0) * t, ww = Math.max(opt.min || 0.0015, w(t)), T = [], B = [];
            for (let j = 0; j <= M; j++) { const s = -1 + 2 * j / M, sy = Math.sign(s) * Math.pow(Math.abs(s), opt.edge || 0.8); T.push([x, sy * ww, top(t, sy)]); B.push([x, sy * ww, bot(t, sy)]); }
            rows.push({ T, B });
        }
        for (let k = 0; k < N; k++) {
            const a = rows[k], b = rows[k + 1];
            for (let j = 0; j < M; j++) {
                g.poly([a.T[j], b.T[j], b.T[j + 1], a.T[j + 1]], null, [0, 0, 1]);
                g.poly([a.B[j], b.B[j], b.B[j + 1], a.B[j + 1]], null, [0, 0, -1]);
            }
            g.poly([a.T[0], a.B[0], b.B[0], b.T[0]], null, [0, -1, 0]);
            g.poly([a.T[M], a.B[M], b.B[M], b.T[M]], null, [0, 1, 0]);
        }
        for (const [row, f] of [[rows[0], -1], [rows[N], 1]]) for (let j = 0; j < M; j++) g.poly([row.T[j], row.T[j + 1], row.B[j + 1], row.B[j]], null, [f, 0, 0]);
        return CM.smoothNormals(g.done(), opt.crease ?? 0.55);
    }
    /** A closed polar outline round (cx, cy): `keys` [[degrees, radius]], smoothly between them (Catmull-Rom). */
    function polar(keys, cx, cy, n) {
        const k = keys.map(([d, r]) => [d * Math.PI / 180, r]), m = k.length, out = [];
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2;
            let j = m - 1;
            for (let q = 0; q < m; q++) if (k[q][0] <= a) j = q;
            const a0 = k[j][0], a1 = j + 1 < m ? k[j + 1][0] : k[0][0] + Math.PI * 2, t = (a - a0) / (a1 - a0);
            const p0 = k[(j - 1 + m) % m][1], p1 = k[j][1], p2 = k[(j + 1) % m][1], p3 = k[(j + 2) % m][1];
            const r = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
            out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return out;
    }
    const slab = (outline, z0, z1, ch, o) => HS.plate(outline, z1 - z0, ch, Object.assign({ center: (z0 + z1) / 2, smooth: 45 }, o || {}));
    const box = (c, s, ch) => HS.chamferedBox(c, s, ch ?? Math.min(...s) * 0.2);
    const disc = (at, dir, r, h, n) => Mesh.lathe([[0, 0], [r, 0], [r, h], [0, h]], n || 16, { base: at, dir });
    /** A ring (an annulus `h` thick, open through its middle). */
    const ring = (at, dir, ri, ro, h, n) => Mesh.lathe([[ri, 0], [ro, 0], [ro, h], [ri, h], [ri, 0]], n || 32, { base: at, dir, caps: false });
    const blob = (c, rx, ry, rz, n) => K.apply(Mesh.sphere([0, 0, 0], rx, n || 16, Math.round((n || 16) / 2)), p => [c[0] + p[0], c[1] + p[1] * ry / rx, c[2] + p[2] * rz / rx]);
    /** A string (or a thin rod) from a to b, `d` across. */
    const string = (a, b, d) => { const dir = norm(sub(b, a)); return K.bar(a, b, Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], d, d); };
    const route = (list, pts, d) => { for (let i = 0; i + 1 < pts.length; i++) list.push(string(pts[i], pts[i + 1], d)); };
    /** Turns points about the y axis through (px, pz) by `a` (positive tips +x down toward -z). */
    const tilt = (px, pz, a) => p => { const dx = p[0] - px, dz = p[2] - pz, c = Math.cos(a), s = Math.sin(a); return [px + dx * c + dz * s, p[1], pz - dx * s + dz * c]; };
    const curve = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k / n));
    /** A neck from x0 to x1 under the plane z = zt: a D section `w` half wide and `d` deep, a heel swelling at its root. */
    function neck(x0, x1, zt, w0, w1, d0, d1, heel) {
        const n = 12, pts = curve(t => [x0 + (x1 - x0) * t, 0, zt], n);
        return K.sweep(pts, k => {
            const t = k / n, w = w0 + (w1 - w0) * t, d = d0 + (d1 - d0) * t + (heel || 0) * Math.max(0, 1 - t / 0.16) ** 2, sec = [];
            for (let j = 0; j <= 12; j++) { const th = Math.PI * j / 12; sec.push([-d * Math.sin(th), w * Math.cos(th)]); }
            return sec;
        }, { up: [0, 0, 1] });
    }
    /** Fret positions (x) for a scale from the nut at xn toward -x. */
    const fretAt = (xn, scale, i) => xn - scale * (1 - Math.pow(2, -i / 12));
    /** A fingerboard from x0 to xn (half widths w0 -> wn), frets and dots on it; returns its top height. */
    function fingerboard(H, x0, xn, w0, wn, z0, z1, o) {
        const opt = o || {}, wAt = x => w0 + (wn - w0) * (x - x0) / (xn - x0);
        H.Board.push(slab([[x0, -w0], [xn, -wn], [xn, wn], [x0, w0]], z0, z1, 0.0012));
        if (opt.frets) for (let i = 1; i <= opt.frets; i++) {
            const x = fretAt(xn, opt.scale, i);
            if (x < x0 + 0.004) break;
            const w = wAt(x) - 0.0006;
            H.Metal.push(K.bar([x, -w, z1 + 0.0005], [x, w, z1 + 0.0005], [0, 0, 1], 0.0018, 0.0014));
            if ([3, 5, 7, 9, 15, 17, 19, 21].includes(i) || i === 12) {
                const xm = (x + fretAt(xn, opt.scale, i - 1)) / 2;
                for (const y of i === 12 ? [-w * 0.45, w * 0.45] : [0]) H.Ivory.push(disc([xm, y, z1 - 0.0002], [0, 0, 1], opt.dot || 0.0028, 0.0004, 12));
            }
        }
        return z1;
    }
    /**
     * A headstock past the nut at xn (its face at zf), tilted back `tilt` radians: `pairs` tuners a side
     * (or all on one side when `inline`), posts on its face and buttons out its sides. Returns the posts'
     * tops (in order bass to treble) for the strings.
     */
    function headstock(H, xn, zf, o) {
        const len = o.len, w0 = o.w0, w1 = o.w1, n = o.pairs, f = tilt(xn, zf, o.tilt || 0), parts = [];
        const outline = o.inline
            ? HS.round([[xn - 0.002, -w0], [xn + len * 0.35, -w0 * 1.05], [xn + len, -w0 * 0.7], [xn + len * 1.02, w1 * 0.4], [xn + len * 0.78, w1], [xn + len * 0.3, w1 * 0.75], [xn - 0.002, w0]], 0.012, 3, [1, 2, 3, 4, 5])
            : HS.round([[xn - 0.002, -w0], [xn + len * 0.9, -w1], [xn + len, -w1 * 0.5], [xn + len * 0.96, 0], [xn + len, w1 * 0.5], [xn + len * 0.9, w1], [xn - 0.002, w0]], 0.01, 3, [1, 2, 3, 4, 5]);
        parts.push([H.Wood, slab(outline, zf - 0.014, zf, 0.0018)]);
        parts.push([H.Board, slab(HS.offset(outline, 0.0012), zf - 0.0002, zf + 0.0009, 0.0004)]);
        const posts = [], post = (x, y, side) => {
            parts.push([H.Metal, Mesh.lathe([[0, 0], [0.0048, 0], [0.0048, 0.0025], [0.003, 0.0032], [0.003, 0.012], [0.0024, 0.0135], [0, 0.0135]], 16, { base: [x, y, zf + 0.0009], dir: [0, 0, 1], sharp: 0.5 })]);
            parts.push([H.Metal, box([x, y + side * 0.001, zf - 0.02], [0.016, 0.016, 0.011], 0.002)]);
            const yb = y + side * (0.008 + o.button * 0.7);
            parts.push([H.Metal, Mesh.lathe([[0.0022, 0], [0.0022, 0.012]], 10, { base: [x, y + side * 0.006, zf - 0.02], dir: [0, side, 0] })]);
            parts.push([H.Ivory, blob([x, yb + side * 0.008, zf - 0.02], o.button, 0.0035, o.button * 1.25, 14)]);
            posts.push(f([x, y, zf + 0.009]));
        };
        if (o.inline) for (let i = 0; i < n * 2; i++) { const x = xn + len * (0.22 + 0.68 * i / (n * 2 - 1)); post(x, w1 * 0.55 - (x - xn) / len * 0.004, 1); }
        else for (const side of [-1, 1]) for (let i = 0; i < n; i++) { const x = xn + len * (0.26 + 0.6 * i / Math.max(1, n - 1)); post(x, side * (w0 + (w1 - w0) * (x - xn) / len - 0.012), side); }
        for (const [list, m] of parts) list.push(K.apply(m, f));
        // Bass side first: the -y posts from the nut out, then the +y posts from the far end in (or inline in order).
        if (o.inline) return posts.slice().reverse();
        return posts.slice(0, n).concat(posts.slice(n).reverse());
    }

    /**
     * A pipe with a real bore along +x from x0 to x1: its wall from radius `Ri` to `Ro` (numbers or functions of
     * x), both ends open, `holes` cut through the wall ([{ x, rx, rs, at, p }]: half sizes along it and round it
     * in meters, `at` the angle round from +z (to the nearest column), `p` 2 round, 4 a rounded slot). The wall
     * is a grid of rows and columns; each hole sits in a window of whole cells, rings of faces blending its
     * outline out to the window's edge. Returns { outer, inner }: the outside, the ends and the holes' walls,
     * and the bore's own surface (a dark part, seen through the openings); together one closed shell.
     */
    const V3 = K.vec;
    const mid4 = q => mul(q.reduce((m, p) => add(m, p), [0, 0, 0]), 1 / q.length);
    function boredPipe(x0, x1, Ro, Ri, holes, o) {
        const opt = o || {}, N = opt.sides || 32, da = Math.PI * 2 / N, gO = new CM.Geo(), gI = new CM.Geo();
        const RO = typeof Ro === 'function' ? Ro : () => Ro, RI = typeof Ri === 'function' ? Ri : () => Ri;
        // `o.surface(x, th, inner)` another body of the same grid (a vessel round its middle `o.center`).
        const at = opt.surface || ((x, th, inner) => { const r = inner ? RI(x) : RO(x); return [x, r * Math.sin(th), r * Math.cos(th)]; });
        const radial = opt.center ? (pt, s) => mul(sub(pt, opt.center), s) : (pt, s) => mul([0, pt[1], pt[2]], s);
        const e = 1e-4, arcAt = (x, th) => Math.hypot(...sub(at(x, th + e), at(x, th - e))) / (2 * e), alongAt = (x, th) => Math.hypot(...sub(at(x + e, th), at(x - e, th))) / (2 * e);
        const mc = opt.minCells || 2;
        const W = (holes || []).map(h => {
            const col = Math.round((h.at || 0) / da), th = col * da, R0 = arcAt(h.x, th), sx = alongAt(h.x, th), c = Math.max(mc, Math.ceil(h.rs * 1.45 / (R0 * da)));
            const wx = Math.max(h.rx * 1.45, h.rx + 0.0012) / sx, nr = 2 * Math.max(mc, Math.ceil(wx * sx / (R0 * da)));
            const n = norm(V3.cross(sub(at(h.x + e, th), at(h.x - e, th)), sub(at(h.x, th + e), at(h.x, th - e))));
            return Object.assign({}, h, { col, c, wx, nr, th, p: h.p || 2, ax: h.rx / sx, as: h.rs / R0, c3: at(h.x, th), n3: n });
        });
        // Two windows may share rows or columns but never cells.
        for (let i = 0; i < W.length; i++) for (let j = 0; j < i; j++) {
            const a = W[i], b = W[j], dc = Math.abs(((a.col - b.col) % N + N + N / 2) % N - N / 2);
            if (Math.abs(a.x - b.x) < a.wx + b.wx - 1e-9 && dc < a.c + b.c) throw new Error('boredPipe: holes ' + i + ' and ' + j + ' overlap');
        }
        const xs = [x0, x1];
        const step = opt.step || (x1 - x0) / 6;
        for (let x = x0 + step; x < x1 - step * 0.3; x += step) if (!W.some(w => Math.abs(x - w.x) < w.wx + step * 0.3)) xs.push(x);
        for (const x of opt.breaks || []) if (x > x0 && x < x1 && !W.some(w => Math.abs(x - w.x) < w.wx + 0.001)) xs.push(x);
        for (const w of W) for (let i = 0; i <= w.nr; i++) xs.push(w.x - w.wx + 2 * w.wx * i / w.nr);
        xs.sort((a, b) => a - b);
        const rows = xs.filter((x, i) => !i || x - xs[i - 1] > 1e-6);
        const colIn = (w, j) => { const d = ((j - w.col) % N + N) % N; return d < w.c || d >= N - w.c; };
        for (let i = 0; i + 1 < rows.length; i++) {
            const xa = rows[i], xb = rows[i + 1], xm = (xa + xb) / 2;
            for (let j = 0; j < N; j++) {
                if (W.some(w => xm > w.x - w.wx && xm < w.x + w.wx && colIn(w, j))) continue;
                const t0 = j * da, t1 = (j + 1) * da, tm = (t0 + t1) / 2, uv = [[xa * 20, j / N], [xb * 20, j / N], [xb * 20, (j + 1) / N], [xa * 20, (j + 1) / N]];
                const qo = [at(xa, t0), at(xb, t0), at(xb, t1), at(xa, t1)], qi = [at(xa, t0, 1), at(xb, t0, 1), at(xb, t1, 1), at(xa, t1, 1)];
                gO.poly(qo, uv, radial(mid4(qo), 1));
                gI.poly(qi, uv, radial(mid4(qi), -1));
            }
        }
        if (!opt.surface) for (const [x, s] of [[x0, -1], [x1, 1]]) for (let j = 0; j < N; j++) gO.poly([at(x, j * da), at(x, (j + 1) * da), at(x, (j + 1) * da, 1), at(x, j * da, 1)], null, [s, 0, 0]);
        for (const w of W) {
            // The window's edge as (x, angle) points round it, and the hole's outline at each one's bearing.
            const snap = v => rows.reduce((m, x) => (Math.abs(x - v) < Math.abs(m - v) ? x : m), rows[0]);
            const edge = [], a0 = w.th - w.c * da, a1 = w.th + w.c * da, xa = snap(w.x - w.wx), xb = snap(w.x + w.wx);
            for (let k = 0; k < 2 * w.c; k++) edge.push([xa, a0 + k * da]);
            // Its sides take every row between its ends (another window beside it may add rows).
            const side = rows.filter(x => x > xa - 1e-7 && x < xb - 1e-7);
            for (const x of side) edge.push([x, a1]);
            for (let k = 0; k < 2 * w.c; k++) edge.push([xb, a1 - k * da]);
            const back = rows.filter(x => x > xa + 1e-7 && x < xb + 1e-7).reverse();
            for (const x of back) edge.push([x, a0]);
            const sp = v => Math.sign(v) * Math.pow(Math.abs(v), 2 / w.p);
            const hole = edge.map(([x, th]) => { const f = Math.atan2((th - w.th) / (w.c * da), (x - w.x) / w.wx); return [w.x + w.ax * sp(Math.cos(f)), w.th + w.as * sp(Math.sin(f))]; });
            const K = 3, loops = [];
            for (let k = 0; k <= K; k++) { const t = Math.pow(k / K, 1.3); loops.push(edge.map((e, m) => [hole[m][0] + (e[0] - hole[m][0]) * t, hole[m][1] + (e[1] - hole[m][1]) * t])); }
            const n = edge.length;
            for (let k = 0; k < K; k++) for (let m = 0; m < n; m++) {
                const a = loops[k][m], b = loops[k][(m + 1) % n], c = loops[k + 1][(m + 1) % n], d = loops[k + 1][m];
                const qo = [a, b, c, d].map(q => at(q[0], q[1])), qi = [a, b, c, d].map(q => at(q[0], q[1], 1));
                gO.poly(qo, null, radial(mid4(qo), 1));
                gI.poly(qi, null, radial(mid4(qi), -1));
            }
            for (let m = 0; m < n; m++) {
                const a = hole[m], b = hole[(m + 1) % n], q = [at(a[0], a[1]), at(b[0], b[1]), at(b[0], b[1], 1), at(a[0], a[1], 1)];
                const rel = sub(mid4(q), w.c3), toAxis = sub(mul(w.n3, V3.dot(rel, w.n3)), rel);
                gO.poly(q, null, toAxis);
            }
        }
        const outer = CM.smoothNormals(gO.done(), opt.crease ?? 0.7);
        if (opt.grain || opt.uv) {
            // Wood grain along it: u round it (in the grain's across scale), v along; a face over the seam unwrapped.
            const P = outer.positions, I = outer.index, uv = new Float32Array(P.length / 3 * 2), Rm = RO((x0 + x1) / 2), per = opt.uv ? opt.uv[0] / (Math.PI * 2) : Rm / 0.11, turn = Math.PI * 2 * per, cz = opt.center ? opt.center[2] : 0;
            for (let i = 0; i < P.length / 3; i++) { uv[i * 2] = Math.atan2(P[i * 3 + 1], P[i * 3 + 2] - cz) * per; uv[i * 2 + 1] = P[i * 3] / (opt.uv ? opt.uv[1] : 0.42); }
            for (let t = 0; t < I.length; t += 3) for (let j = 1; j < 3; j++) { const a = I[t], b = I[t + j], d = uv[b * 2] - uv[a * 2]; if (Math.abs(d) > turn / 2) uv[b * 2] -= Math.sign(d) * turn; }
            outer.uvs = uv; outer.keepUv = true;
        }
        return { outer, inner: CM.smoothNormals(gI.done(), 0.7) };
    }
    /**
     * A collar standing on a pipe of radius R along x: an elliptical ring round (xc, top), its hole `hole` and
     * outline `outer` [half along, half across], its top `lift` above the pipe and gently curved, its foot
     * shaped down onto the pipe (a flute's lip plate, a tone hole's chimney).
     */
    function collar(xc, R, hole, outer, lift, o) {
        const opt = o || {}, ri = 1, ro = 2, prof = opt.flat
            ? [[ri, 0], [ro, 0], [ro, 1], [ri, 1], [ri, 0]]
            : [[ri, 0], [ro, 0], [ro, 0.5], [ro - 0.07, 0.88], [ro - 0.25, 1], [ri + 0.15, 1], [ri + 0.03, 0.88], [ri, 0.55], [ri, 0]];
        const m = Mesh.lathe(prof, opt.n || 32, { base: [0, 0, 0], dir: [0, 0, 1], sharp: 0.5, caps: false });
        const sink = opt.sink ?? 0.0004, flat = opt.curve ?? 0.5;
        return CM.smoothNormals(K.apply(m, p => {
            const r = Math.hypot(p[0], p[1]), ph = Math.atan2(p[1], p[0]), f = Math.max(0, Math.min(1, (r - ri) / (ro - ri)));
            const X = xc + Math.cos(ph) * (hole[0] + (outer[0] - hole[0]) * f), Y = Math.sin(ph) * (hole[1] + (outer[1] - hole[1]) * f);
            const zb = Math.sqrt(Math.max(0, (R - sink) ** 2 - Y * Y)), zt = Math.sqrt(Math.max(0, (R + lift) ** 2 - Y * Y * flat));
            return [X, Y, zb + (zt - zb) * p[2]];
        }), 0.5);
    }

    // ── the instruments ───────────────────────────────────────────────────
    // Each fills the part lists in `H` and returns its hand markers (gripBottom, gripTop, tip, edge).
    const BUILD = {
        acoustic(r, H) {
            const g = 0.85 + r.shape * 0.3, B = 0.5, W = 0.195 * g, D = 0.1, wf = bouts(0.34, 0.34, 0.765, 0.235, 0.74, 3.5), w = t => W * wf(t);
            const scale = 0.645 * r.length, xn = B + scale * (1 - Math.pow(2, -14 / 12)), xs = xn - scale;
            const roll = s => 0.0045 * (1 - Math.sqrt(Math.max(0, 1 - Math.max(0, (Math.abs(s) - 0.9) / 0.1) ** 2)));
            H.Top.push(pillow(0, B, w, (t, s) => -0.6 * roll(s), () => -0.0035, { rows: 44, cols: 14 }));
            H.Wood.push(pillow(0, B, w, () => -0.0034, (t, s) => -D + 0.012 * t + 0.004 * (1 - s * s) + roll(s), { rows: 44, cols: 14 }));
            for (const z of [-0.0045, -D + 0.012 * 0.5 + 0.002]) H.Ivory.push(pillow(0.0, B, t => w(t) + 0.0009, () => z + 0.0013, () => z - 0.0013, { rows: 44, cols: 4 }));
            // The sound hole and its rosette, the bridge with its saddle and pins, a pickguard below the hole.
            const xh = B * 0.635, rh = 0.043;
            H.Dark.push(disc([xh, 0, -0.003], [0, 0, 1], rh, 0.0034, 40));
            H.Ivory.push(ring([xh, 0, -0.0005], [0, 0, 1], rh + 0.004, rh + 0.006, 0.0008, 40), ring([xh, 0, -0.0005], [0, 0, 1], rh + 0.0095, rh + 0.0105, 0.0008, 40));
            H.Board.push(ring([xh, 0, -0.0005], [0, 0, 1], rh + 0.006, rh + 0.0095, 0.0006, 40));
            const guard = [];
            for (let k = 0; k <= 10; k++) { const a = -Math.PI * (0.12 + 0.75 * k / 10); guard.push([xh + Math.cos(a) * (rh + 0.004), Math.sin(a) * (rh + 0.004)]); }
            guard.push([xh - 0.07, -rh - 0.03], [xh - 0.035, -rh - 0.055], [xh + 0.01, -rh - 0.05], [xh + 0.035, -rh - 0.025]);
            H.Board.push(slab(guard, -0.0003, 0.0004, 0.0002));
            const bw = 0.08 * g;
            H.Board.push(slab(HS.round([[xs - 0.012, -bw], [xs + 0.016, -bw * 0.8], [xs + 0.016, bw * 0.8], [xs - 0.012, bw], [xs - 0.02, bw * 0.7], [xs - 0.02, -bw * 0.7]], 0.006, 2), -0.0004, 0.009, 0.002));
            H.Ivory.push(box([xs + 0.002, 0, 0.0115], [0.003, 0.074, 0.006], 0.0008));
            const nut = [], sad = [];
            for (let i = 0; i < 6; i++) { const f = (i - 2.5) / 2.5; sad.push([xs + 0.002, f * 0.027, 0.0145]); nut.push([xn + 0.002, f * 0.0185, 0.0155]); H.Ivory.push(disc([xs - 0.009, f * 0.027, 0.0088], [0, 0, 1], 0.0024, 0.0016, 10)); }
            // The neck and its board, frets to the nineteenth, the headstock tilted back.
            H.Wood.push(neck(B - 0.03, xn + 0.004, 0.006, 0.027, 0.0215, 0.022, 0.019, 0.05));
            const x0 = xh + rh + 0.008;
            fingerboard(H, x0, xn, 0.0285, 0.0215, 0, 0.012, { frets: 20, scale });
            H.Ivory.push(box([xn + 0.002, 0, 0.0125], [0.005, 0.045, 0.006], 0.0008));
            const posts = headstock(H, xn + 0.004, 0.0055, { len: 0.18, w0: 0.026, w1: 0.04, pairs: 3, tilt: 0.24, button: 0.008 });
            for (let i = 0; i < 6; i++) route(H.String, [sad[i], nut[i], posts[i]], 0.0013 - i * 0.00017);
            H.Metal.push(disc([-0.004, 0, -D * 0.48], [1, 0, 0], 0.004, 0.006, 12));
            return { gripBottom: [fretAt(xn, scale, 7), 0, -0.004], gripTop: [fretAt(xn, scale, 2), 0, -0.004], tip: [0, 0, 0], edge: [B * 0.5, -W, 0] };
        },
        electric(r, H) { return solid(r, H, false); },
        bass(r, H) { return solid(r, H, true); },
        violin(r, H) { return bowed(r, H, false); },
        cello(r, H) { return bowed(r, H, true); },
        lute(r, H) {
            const B = 0.47, W = 0.165, depth = (0.12 + 0.08 * r.shape), wf = t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.75), w = t => W * wf(t);
            const scale = 0.6 * r.length, xn = B + scale * 0.52, xs = xn - scale;
            H.Top.push(pillow(0, B, w, () => 0, () => -0.003, { rows: 44, cols: 14 }));
            const bowl = (t, s) => -0.0028 - depth * Math.sqrt(Math.max(0, 1 - s * s)) * Math.pow(wf(t), 0.9);
            H.Wood.push(pillow(0, B, w, () => -0.0028, bowl, { rows: 44, cols: 18, edge: 1 }));
            // The bowl's ribs: dark seams down it, a cap at its tail.
            for (let j = 1; j < 11; j++) { const s = -1 + 2 * j / 11, pts = curve(t => { const tt = 0.03 + 0.94 * t; return [B * tt, s * w(tt), bowl(tt, s) - 0.0004]; }, 24); H.Dark.push(K.tube(pts, 0.0009, 4)); }
            H.Board.push(blob([0.006, 0, -depth * 0.4], 0.012, 0.03, depth * 0.35, 12));
            // A carved rose: a dark hole under an ivory lattice ring.
            const xh = B * 0.6, rh = 0.036;
            H.Dark.push(disc([xh, 0, -0.0026], [0, 0, 1], rh, 0.0028, 40));
            H.Ivory.push(ring([xh, 0, -0.0004], [0, 0, 1], rh, rh + 0.004, 0.0009, 40));
            for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; H.Ivory.push(string([xh + Math.cos(a) * rh * 0.25, Math.sin(a) * rh * 0.25, 0.0002], [xh + Math.cos(a) * rh, Math.sin(a) * rh, 0.0002], 0.0012)); }
            H.Ivory.push(ring([xh, 0, -0.0004], [0, 0, 1], rh * 0.2, rh * 0.3, 0.0009, 16));
            H.Board.push(slab(HS.round([[xs - 0.008, -0.07], [xs + 0.01, -0.06], [xs + 0.01, 0.06], [xs - 0.008, 0.07]], 0.004, 2), -0.0002, 0.006, 0.0015));
            // A broad neck with tied gut frets, and the pegbox bent sharply back.
            H.Wood.push(neck(B - 0.03, xn + 0.004, 0.004, 0.034, 0.03, 0.02, 0.017, 0.03));
            const x0 = B - 0.005;
            H.Board.push(slab([[x0, -0.034], [xn, -0.03], [xn, 0.03], [x0, 0.034]], 0, 0.009, 0.001));
            for (let i = 1; i <= 8; i++) { const x = fretAt(xn, scale, i); if (x > x0) H.Dark.push(K.bar([x, -0.033, 0.0095], [x, 0.033, 0.0095], [0, 0, 1], 0.0016, 0.0012)); }
            H.Ivory.push(box([xn + 0.002, 0, 0.0105], [0.005, 0.058, 0.004], 0.0008));
            const f = tilt(xn + 0.004, 0.004, 1.15), pegs = [];
            const pegbox = [H.Wood, slab(HS.round([[xn, -0.03], [xn + 0.2, -0.02], [xn + 0.2, 0.02], [xn, 0.03]], 0.006, 2, [1, 2]), -0.014, 0.004, 0.002)];
            H.Wood.push(K.apply(pegbox[1], f));
            for (let i = 0; i < 11; i++) {
                const side = i % 2 ? 1 : -1, x = xn + 0.03 + 0.15 * i / 10, y = side * 0.028;
                H.Board.push(K.apply(Mesh.lathe([[0, 0], [0.003, 0], [0.004, 0.02], [0.0028, 0.032], [0.0055, 0.036], [0.0062, 0.046], [0.004, 0.05], [0, 0.05]], 10, { base: [x, -side * 0.018, -0.005], dir: [0, side, 0] }), f));
                pegs.push(f([x, 0, -0.004]));
            }
            pegs.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
            for (let i = 0; i < 11; i++) { const y = (i - 5) / 5; route(H.String, [[xs + 0.002, y * 0.048, 0.0068], [xn + 0.002, y * 0.026, 0.0125], pegs[i]], 0.0007); }
            return { gripBottom: [fretAt(xn, scale, 6), 0, -0.004], gripTop: [fretAt(xn, scale, 1), 0, -0.004], tip: [0, 0, 0], edge: [B * 0.5, -W, 0] };
        },
        harp(r, H) {
            // A lap harp in its plane (x up it, y across): a front pillar, a soundbox rising back from its foot, a curved neck over both.
            const hgt = 0.9 * r.length, u = (a, b) => [a * hgt, b - 0.25, 0], bend = 0.06 + 0.1 * r.shape;
            const pf = u(0.02, 0), pt = u(0.97, 0);
            H.Wood.push(Mesh.lathe([[0.018, 0], [0.024, 0.01], [0.02, 0.03], [0.016, 0.06], [0.017, hgt * 0.5], [0.021, hgt * 0.53], [0.016, hgt * 0.56], [0.015, hgt * 0.88], [0.02, hgt * 0.9], [0.022, hgt * 0.93], [0.014, hgt * 0.95]], 16, { base: pf, dir: [1, 0, 0], sharp: 0.6 }));
            H.Wood.push(box(add(u(0.025, 0.06), [0, 0, 0]), [0.06, 0.16, 0.07], 0.012));
            const s0 = u(0.05, 0.08), s1 = u(0.78, 0.52), sl = Math.hypot(...sub(s1, s0)), sd = norm(sub(s1, s0)), sn = [sd[1], -sd[0], 0];
            const sbPts = curve(t => add(s0, mul(sub(s1, s0), t)), 10);
            H.Wood.push(K.sweep(sbPts, k => K.roundRect(0.11 - 0.06 * k / 10, 0.13 - 0.07 * k / 10, 0.02 - 0.008 * k / 10, 3), { up: [0, 0, 1] }));
            // The soundboard face toward the strings, and the string rib down it.
            H.Top.push(K.sweep(curve(t => add(add(s0, mul(sub(s1, s0), t)), mul(sn, -(0.065 - 0.035 * t))), 10), k => K.roundRect(0.08 - 0.045 * k / 10, 0.004, 0.0015, 1), { up: [0, 0, 1] }));
            // The neck: a harmonic curve from the soundbox's top to the pillar's, thick where the pins sit.
            const n0 = s1, n1 = pt, neckPts = [];
            for (let k = 0; k <= 24; k++) { const t = k / 24; neckPts.push([n0[0] + (n1[0] - n0[0]) * t + Math.sin(Math.PI * t) * hgt * 0.02 + Math.sin(Math.PI * 2 * t) * hgt * bend, n0[1] + (n1[1] - n0[1]) * t, 0]); }
            H.Wood.push(K.sweep(neckPts, k => K.roundRect(0.04, 0.05 - 0.01 * Math.sin(Math.PI * k / 24), 0.01, 2), { up: [0, 0, 1] }));
            const neckAt = y => { for (let k = 0; k < 24; k++) { const a = neckPts[k], b = neckPts[k + 1]; if ((a[1] - y) * (b[1] - y) <= 0) { const t = (y - a[1]) / ((b[1] - a[1]) || 1); return a[0] + (b[0] - a[0]) * t; } } return neckPts[24][0]; };
            const count = 22;
            for (let i = 0; i < count; i++) {
                const t = (i + 0.5) / count, y = lerp(s0[1], s1[1], 0.04 + 0.9 * t) - 0.02 * (1 - t), xb = s0[0] + (s1[0] - s0[0]) * ((y - s0[1]) / (s1[1] - s0[1]));
                const xt = neckAt(y) - 0.024, bottom = [xb + 0.035 * (1 - t), y, 0], top = [xt, y, 0];
                if (top[0] - bottom[0] < 0.03) continue;
                const list = i % 7 === 2 ? H.StringC : i % 7 === 5 ? H.StringF : H.String;
                list.push(string(bottom, top, 0.0016 - 0.0008 * t));
                H.Metal.push(disc([xt + 0.008, y, 0.02], [0, 0, 1], 0.0025, 0.008, 8));
                H.Ivory.push(disc(add(bottom, [-0.004, 0, 0]), [0, 0, 1], 0.003, 0.004, 8));
            }
            return { gripBottom: [hgt * 0.35, -0.25, 0], gripTop: [hgt * 0.55, -0.25, 0], tip: [hgt, -0.25, 0], edge: [hgt * 0.5, 0.25, 0] };
        },
        flute(r, H) {
            // A silver tube with a real bore: open at its foot, stopped at its head by the cork under the crown;
            // the embouchure hole cut through under the lip plate, and the open-hole keys' rings over holes cut
            // through too, so air (and a look) goes in at the lips and out at the foot and the open holes.
            const L = 0.67 * r.length, R = 0.0095 * (0.9 + r.shape * 0.2), Ri = R * 0.88, xl = L - 0.075, xe = L - 0.014;
            const cups = [0.17, 0.2, 0.235, 0.27, 0.31, 0.35, 0.385, 0.45, 0.49, 0.53, 0.57].map(t => t * L).filter(x => x < xl - 0.09);
            const open = new Set([3, 4, 5, 6, 7].filter(i => i < cups.length)), pr = R * 0.24;
            const holes = [{ x: xl, rx: 0.0052, rs: 0.0058 }, ...[...open].map(i => ({ x: cups[i], rx: pr * 1.08, rs: pr * 1.08 }))];
            const pipe = boredPipe(0.004, xe, R, Ri, holes, { sides: 32, step: 0.06 });
            H.Metal.push(pipe.outer); H.Dark.push(pipe.inner);
            // The joints' tenon rings (a bored ring at the foot's mouth), the crown and the cork behind the lips.
            H.Metal.push(ring([0, 0, 0], [1, 0, 0], Ri, R * 1.13, 0.012, 32));
            for (const x of [0.11, 0.42]) H.Metal.push(ring([x * L - 0.005, 0, 0], [1, 0, 0], R * 0.97, R * 1.11, 0.01, 32));
            H.Metal.push(ring([L - 0.032, 0, 0], [1, 0, 0], R * 0.97, R * 1.1, 0.02, 32));
            H.Dark.push(disc([xl + 0.017, 0, 0], [1, 0, 0], Ri * 1.01, xe - xl - 0.012, 20));
            H.Metal.push(Mesh.lathe([[0, 0], [R * 1.02, 0], [R * 1.05, 0.004], [R * 0.95, 0.01], [R * 0.6, 0.0135], [0, 0.0145]], 24, { base: [xe - 0.001, 0, 0], dir: [1, 0, 0], sharp: 0.5 }));
            // The lip plate: a curved oval plate on its riser, its hole over the one in the tube.
            H.Metal.push(collar(xl, R, [0.0047, 0.0051], [0.016, 0.0118], 0.0042));
            // Keys over the tone holes: a chimney under each, a pad in a cup (a ring over the hole on the open
            // ones), each on its arm from the rod down the side.
            for (const [i, x] of cups.entries()) {
                const cr = i < 3 ? 0.0068 : 0.0072, z = R + 0.0016, ring2 = open.has(i);
                H.Metal.push(collar(x, R, [cr * 0.62, cr * 0.62], [cr * 0.8, cr * 0.8], 0.0012, { flat: true, sink: 0.0006, curve: 1, n: 20 }));
                H.Ivory.push(Mesh.lathe(ring2 ? [[pr, 0], [cr * 0.88, 0], [cr * 0.88, 0.0012], [pr, 0.0012], [pr, 0]] : [[0, 0], [cr * 0.88, 0], [cr * 0.88, 0.0012], [0, 0.0012]], 20, { base: [x, 0, z - 0.0006], dir: [0, 0, 1], sharp: 0.5, caps: !ring2 }));
                H.Metal.push(Mesh.lathe(ring2
                    ? [[pr + 0.0012, 0.0004], [cr * 0.86, 0.0004], [cr, 0], [cr, 0.0018], [cr * 0.92, 0.0028], [pr + 0.0016, 0.0028], [pr + 0.0012, 0.0022], [pr + 0.0012, 0.0004]]
                    : [[0, 0.0004], [cr * 0.86, 0.0004], [cr, 0], [cr, 0.0018], [cr * 0.92, 0.0028], [0, 0.0029]], 20, { base: [x, 0, z], dir: [0, 0, 1], sharp: 0.5, caps: !ring2 }));
                H.Metal.push(string([x + cr * 0.8, R * 0.2, z + 0.0012], [x + cr * 1.05, R * 1.05, R * 0.6], 0.0014));
            }
            if (cups.length) H.Metal.push(Mesh.lathe([[0.0013, 0], [0.0013, cups[cups.length - 1] - cups[0] + 0.03]], 8, { base: [cups[0] - 0.01, R * 1.05, R * 0.6], dir: [1, 0, 0] }));
            // The foot's roller keys on their own short rod.
            for (const x of [0.03, 0.055, 0.08]) H.Metal.push(Mesh.lathe([[0, 0], [0.0062, 0], [0.0062, 0.002], [0, 0.0024]], 14, { base: [x * L / 0.67, -R * 0.4, R + 0.0008], dir: norm([0, -0.4, 1]) }));
            return { gripBottom: [L * 0.25, 0, 0], gripTop: [L * 0.42, 0, 0], tip: [L, 0, 0], edge: [L * 0.5, 0, R] };
        },
        recorder(r, H) {
            const L = 0.32 * r.length, R = 0.0115 * (0.9 + r.shape * 0.2);
            const prof = [[0, 0], [R * 1.35, 0], [R * 1.4, 0.006], [R * 1.25, 0.014], [R * 0.95, 0.04], [R * 0.92, 0.07], [R * 1.12, 0.074], [R * 1.12, 0.08], [R * 0.95, 0.084], [R, L * 0.68], [R * 1.25, L * 0.69], [R * 1.28, L * 0.71], [R * 1.12, L * 0.725], [R * 1.12, L * 0.84], [R * 1.05, L * 0.9], [R * 0.75, L * 0.97], [R * 0.55, L], [0, L]];
            // A bored body from the open foot to past the window: finger holes and the thumb hole cut through,
            // the window cut through with its labium ramp sloping down to a sharp edge; the block stops the bore
            // at the window's head side, the windway a slit over it out to the beak.
            const xp = L * 0.81, at = x => { for (let k = 1; k < prof.length - 1; k++) if (prof[k + 1][1] >= x) { const [r0, h0] = prof[k], [r1, h1] = prof[k + 1]; return r0 + (r1 - r0) * Math.max(0, Math.min(1, (x - h0) / ((h1 - h0) || 1))); } return R; };
            const RO = x => (x <= 0 ? R * 1.35 : at(x)), RI = x => R * (0.52 + 0.14 * x / L);
            const xw = L * 0.785, xe = xw - 0.003, xh = xw + 0.003, xf = xe - 0.0075, ws = R * 0.4;
            const holes = [0.14, 0.24, 0.31, 0.4, 0.49, 0.56, 0.63].map((t, i) => ({ x: t * L + 0.02, rx: R * (i < 2 ? 0.25 : 0.33), rs: R * (i < 2 ? 0.25 : 0.33) }));
            holes.push({ x: L * 0.655, rx: R * 0.31, rs: R * 0.31, at: Math.PI }, { x: (xf + xh) / 2, rx: (xh - xf) / 2, rs: ws, p: 5 });
            const pipe = boredPipe(0, xp, RO, RI, holes, { sides: 32, step: 0.012, breaks: prof.slice(1, -1).map(p => p[1]), crease: 0.6, grain: true });
            H.Wood.push(pipe.outer); H.Dark.push(pipe.inner);
            // The head and beak, flattening toward the lips; the windway's mouth at its tip.
            const head = Mesh.lathe([[0, xp - 0.001], [at(xp), xp - 0.001], ...prof.filter(p => p[1] > xp)], 32, { base: [0, 0, 0], dir: [1, 0, 0], sharp: 0.6 });
            H.Wood.push(CM.smoothNormals(K.apply(head, p => [p[0], p[1], p[2] * (1 - 0.38 * smooth((p[0] - L * 0.86) / (L * 0.12)))]), 0.6));
            H.Dark.push(box([L * 0.995, 0, R * 0.32], [0.0024, R * 0.9, 0.0014], 0.0003));
            H.Ivory.push(disc([xh, 0, 0], [1, 0, 0], RI(xh) * 1.004, xp - xh + 0.002, 24));
            H.Dark.push(box([xh + 0.0003, 0, RI(xh) - 0.0006], [0.0012, ws * 1.5, 0.0012], 0.0002));
            // The labium ramp: a wedge filling the window's foot side, its top from the outside down to the edge.
            const g = new CM.Geo(), S = 6, wy = ws * 1.25, zo = y => Math.sqrt(Math.max(0, RO(xf) ** 2 - y * y)) - 0.0002, zi = y => Math.sqrt(Math.max(0, RI(xe) ** 2 - y * y)) + 0.0003;
            const T = [], E = [], B = [];
            for (let k = 0; k <= S; k++) { const y = -wy + 2 * wy * k / S; T.push([xf - 0.0012, y, zo(y)]); E.push([xe, y, zi(y)]); B.push([xf - 0.0012, y, zi(y) - 0.0002]); }
            const up = [(zo(0) - zi(0)), 0, xe - xf];
            for (let k = 0; k < S; k++) { g.poly([T[k], T[k + 1], E[k + 1], E[k]], null, up); g.poly([B[k], B[k + 1], E[k + 1], E[k]], null, [0, 0, -1]); g.poly([T[k], T[k + 1], B[k + 1], B[k]], null, [-1, 0, 0]); }
            g.poly([T[0], E[0], B[0]], null, [0, -1, 0]); g.poly([T[S], E[S], B[S]], null, [0, 1, 0]);
            H.Ivory.push(CM.smoothNormals(g.done(), 0.8));
            return { gripBottom: [L * 0.2, 0, 0], gripTop: [L * 0.6, 0, 0], tip: [L, 0, 0], edge: [L * 0.5, 0, R] };
        },
        ocarina(r, H) {
            // A sweet-potato ocarina: a hollow glazed vessel (its wall a real thickness, its inside dark), a
            // mouthpiece out of its blunt end with the windway's slit at its tip, the voicing hole on top behind it
            // (a window cut through, its labium ramp sloping down to a sharp edge), and finger holes of their own
            // sizes cut through: two arcs on top, two small sub holes, two thumb holes under it.
            const sc = r.length, L = 0.16 * sc, W = 0.04 * sc * (0.82 + r.shape * 0.36), t = 0.0045 * sc;
            const wf = u => { u = Math.max(0, Math.min(1, u)); return W * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.18)), 0.56) * (0.88 + 0.12 * u); };
            const zc = u => 0.007 * sc * Math.sin(Math.PI * u), yc = u => -0.006 * sc * Math.sin(Math.PI * u);
            const Cb = [L * 0.52, 0, zc(0.52)];
            const outerAt = (x, th) => { const u = x / L, w = wf(u), c = Math.cos(th); return [x, yc(u) + w * Math.sin(th), zc(u) + w * (c > 0 ? 0.66 : 0.8) * c]; };
            const normalAt = (x, th) => {
                const e = 1e-4, n = V3.cross(sub(outerAt(x + e, th), outerAt(x - e, th)), sub(outerAt(x, th + e), outerAt(x, th - e)));
                return Math.hypot(...n) > 1e-14 ? norm(n) : norm(sub(outerAt(x, th), Cb));
            };
            const surface = (x, th, inner) => { const p = outerAt(x, th); return inner ? sub(p, mul(normalAt(Math.min(L, Math.max(0, x)), th), t)) : p; };
            const xw = 0.855 * L, ww = 0.0064 * sc, ws = 0.0046 * sc;
            const holes = [[0.15, 0.5, 3.0], [0.235, 0.36, 4.0], [0.32, 0.3, 4.6], [0.405, 0.38, 4.2], [0.49, -0.46, 3.3], [0.575, -0.36, 4.2], [0.66, -0.3, 4.7], [0.745, -0.38, 4.1], [0.56, -1.3, 2.3], [0.255, 1.3, 2.2], [0.62, Math.PI - 0.4, 4.2], [0.36, Math.PI + 0.4, 4.0]]
                .map(([u, at, rr]) => ({ x: u * L, at, rx: rr * 0.001 * sc, rs: rr * 0.001 * sc }));
            holes.push({ x: xw, at: 0, rx: ww, rs: ws, p: 5 });
            const body = boredPipe(0, L, 0, 0, holes, { sides: 44, step: L / 14, surface, center: Cb, uv: [2, 0.08], crease: 0.6, minCells: 3 });
            H.Paint.push(body.outer); H.Dark.push(body.inner);
            // The labium: a ramp filling the window's tail side, from the outside down to the edge mid-window.
            const g = new CM.Geo(), S = 6, xf = xw - ww - 0.0012 * sc, xe = xw - ww * 0.05, T = [], E = [], B = [];
            for (let k = 0; k <= S; k++) {
                const th = (-1 + 2 * k / S) * ws * 1.3 / W;
                const pf = outerAt(xf, th), nf = normalAt(xf, th), pe = outerAt(xe, th), ne = normalAt(xe, th);
                T.push(sub(pf, mul(nf, 0.0003))); E.push(sub(pe, mul(ne, t * 0.55))); B.push(sub(pf, mul(nf, t * 0.7)));
            }
            const nw = normalAt(xw, 0), up = norm(add(nw, mul(norm(sub(outerAt(xe, 0), outerAt(xf, 0))), 0.6)));
            for (let k = 0; k < S; k++) {
                g.poly([T[k], T[k + 1], E[k + 1], E[k]], null, up); g.poly([B[k], B[k + 1], E[k + 1], E[k]], null, mul(nw, -1));
                g.poly([T[k], T[k + 1], B[k + 1], B[k]], null, sub(outerAt(xf, 0), outerAt(xe, 0)));
            }
            g.poly([T[0], E[0], B[0]], null, [0, -1, 0]); g.poly([T[S], E[S], B[S]], null, [0, 1, 0]);
            H.Paint.push(CM.smoothNormals(g.done(), 0.8));
            // The windway's mouth on the window's head side, under its edge.
            const ph = outerAt(xw + ww * 0.92, 0), across = norm(V3.cross(nw, sub(outerAt(xw + 0.001, 0), outerAt(xw - 0.001, 0))));
            H.Dark.push(K.bar(sub(sub(ph, mul(across, ws * 0.8)), mul(nw, 0.0016 * sc)), sub(add(ph, mul(across, ws * 0.8)), mul(nw, 0.0016 * sc)), nw, 0.0014 * sc, 0.0011 * sc));
            // The mouthpiece out of the blunt end, a little up and toward the player, flattening to the lips.
            // The mouthpiece grows out of the blunt end: a broad rounded root buried in the body flowing smoothly down
            // into a flattened oval that lifts a little toward the lips; the windway's slit in its tip.
            const md = norm([1, -0.12, 0.16]), m0 = [L - 0.03 * sc, 0, zc(1) + 0.002 * sc], ml = 0.05 * sc, NS = 14;
            const mpts = curve(f => add(add(m0, mul(md, ml * f)), [0, 0, 0.005 * sc * f * f]), NS);
            const oval = (h, w, n) => Array.from({ length: 28 }, (_, q) => { const a = q / 28 * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a); return [h / 2 * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), w / 2 * Math.sign(s2) * Math.pow(Math.abs(s2), 2 / n)]; });
            H.Paint.push(K.sweep(mpts, q => { const f = q / NS, e = Math.pow(1 - smooth(f / 0.85), 2); return oval((0.0115 + 0.028 * e - 0.0015 * f) * sc, (0.021 + 0.024 * e - 0.001 * f) * sc, 2); }, { up: [0, 0, 1], cos: K.COS.soft }));
            const mt = mpts[NS], mdt = norm(sub(mpts[NS], mpts[NS - 1]));
            H.Dark.push(K.bar(sub(mt, mul(mdt, 0.004 * sc)), add(mt, mul(mdt, 0.0006 * sc)), [0, 0, 1], 0.011 * sc, 0.0016 * sc));
            // A painted band round its tail, and the mouthpiece's lip ring.
            const band = curve(k => { const th = k * Math.PI * 2; return add(outerAt(0.085 * L, th), mul(normalAt(0.085 * L, th), 0.0003)); }, 48).slice(0, 48);
            H.Accent.push(K.sweep(band, K.roundRect(0.0006 * sc, 0.0026 * sc, 0.0003, 1), { closed: true }));
            return { gripBottom: [L * 0.3, 0, zc(0.3)], gripTop: [L * 0.62, 0, zc(0.62)], tip: mt, edge: [L * 0.5, -W, 0] };
        },
        trumpet(r, H) {
            const k = r.length, bellR = 0.056 * (0.85 + r.shape * 0.3), tr = 0.0055, M = H.Metal;
            const tube = (pts, rad) => M.push(K.tube(pts, rad, 12));
            const bend = (a, b, c, n) => curve(t => { const u = 1 - t; return [0, 1, 2].map(i => u * u * a[i] + 2 * u * t * b[i] + t * t * c[i]); }, n || 8);
            /** A U bend from a to b (its open side back toward the pipe), bulging `out` beyond them: a half circle. */
            const uturn = (a, b, out, n) => { const c = mul(add(a, b), 0.5), half = sub(a, c), R = Math.hypot(...half), o = norm(out); return curve(t => { const th = Math.PI * t; return add(c, add(mul(half, Math.cos(th)), mul(o, R * Math.sin(th)))); }, n || 10); };
            const vx = [0.225, 0.252, 0.279].map(x => x * k), yb = 0.03, zb = 0.016;
            // The mouthpiece and leadpipe, out to the main tuning slide and back into the third valve.
            M.push(Mesh.lathe([[0, 0], [0.0125, 0], [0.0135, 0.002], [0.012, 0.004], [0.0085, 0.012], [0.004, 0.03], [0.0045, 0.075], [0.0052, 0.085], [0.003, 0.088]], 20, { base: [-0.085, -0.02, 0], dir: [1, 0, 0], sharp: 0.5 }));
            H.Dark.push(disc([-0.0855, -0.02, 0], [1, 0, 0], 0.0085, 0.001, 16));
            tube([[0, -0.02, 0], [0.37 * k, -0.02, 0]], tr);
            tube([[0.36 * k, -0.02, 0], ...uturn([0.4 * k, -0.02, 0], [0.4 * k, -0.06, 0], [1, 0, 0], 12), [0.33 * k, -0.06, 0], ...bend([vx[2] + 0.03, -0.06, 0], [vx[2] + 0.01, -0.06, 0], [vx[2] + 0.006, -0.03, 0], 6).slice(1), [vx[2] + 0.005, -0.012, 0]], tr * 1.05);
            M.push(Mesh.lathe([[0, 0], [0.004, 0], [0.004, 0.012], [0, 0.012]], 10, { base: [0.43 * k, -0.04, 0], dir: [1, 0, 0] }));
            // Three valves: casings with caps, stems and pearl buttons; their slides out the sides.
            for (const [i, x] of vx.entries()) {
                M.push(Mesh.lathe([[0, 0], [0.0098, 0], [0.0098, 0.006], [0.0086, 0.008], [0.0086, 0.064], [0.0098, 0.066], [0.0098, 0.072], [0, 0.072]], 20, { base: [x, 0, -0.04], dir: [0, 0, 1], sharp: 0.5 }));
                M.push(Mesh.lathe([[0, 0], [0.0028, 0], [0.0028, 0.016], [0.0045, 0.017], [0, 0.018]], 10, { base: [x, 0, 0.032], dir: [0, 0, 1] }));
                H.Ivory.push(Mesh.lathe([[0, 0], [0.0072, 0], [0.0075, 0.003], [0.006, 0.0045], [0, 0.005]], 16, { base: [x, 0, 0.05], dir: [0, 0, 1], sharp: 0.5 }));
                const side = i === 1 ? -1 : i === 0 ? 1 : -1, reach = i === 1 ? 0.03 : i === 0 ? 0.05 : 0.07, zz = 0.012;
                if (i !== 2) tube([[x, side * 0.006, zz], ...uturn([x, side * reach, zz], [x, side * reach, -zz], [0, side, 0], 10), [x, side * 0.006, -zz]], tr * 0.85);
                else tube([[x - 0.004, -0.006, -0.012], ...uturn([x - 0.004, -0.04, -0.012], [x - 0.004, -0.04, -0.034], [0, -1, 0], 10), [x - 0.004, -0.006, -0.034]], tr * 0.8);
            }
            // The bell branch: out of the first valve back to the bell bow, then forward over the valves into the bell.
            tube([[vx[0] - 0.004, 0.004, -0.018], [vx[0] - 0.024, yb, -0.018], [0.08 * k, yb, -0.018], ...uturn([0.07 * k, yb, -0.018], [0.07 * k, yb, zb], [-1, 0, 0], 12), [0.36 * k, yb, zb]], tr * 1.08);
            const bl = 0.2 * k, bx = 0.35 * k, prof = [];
            for (let j = 0; j <= 14; j++) { const t = j / 14; prof.push([tr * 1.1 + (bellR - tr * 1.1) * Math.pow(t, 3.2), bl * t]); }
            prof.push([bellR + 0.003, bl + 0.001], [bellR + 0.002, bl + 0.004], [bellR - 0.002, bl + 0.002]);
            for (let j = 14; j >= 0; j--) { const t = j / 14; prof.push([Math.max(0.0005, tr * 0.9 + (bellR - 0.003 - tr * 0.9) * Math.pow(t, 3.2)), bl * t + 0.001]); }
            M.push(Mesh.lathe(prof, 32, { base: [bx, yb, zb], dir: [1, 0, 0], sharp: 0.9 }));
                        // Braces between the branches, a finger hook on the leadpipe, a water key on the slide.
            for (const x of [0.12, 0.32]) M.push(string([x * k, -0.02, 0.003], [x * k, yb, zb - 0.003], 0.003));
            M.push(K.tube(bend([0.2 * k, -0.02, tr], [0.205 * k, -0.02, tr + 0.012], [0.215 * k, -0.02, tr + 0.008], 6), 0.0016, 6));
            M.push(box([0.4 * k, -0.064, -0.005], [0.016, 0.004, 0.003], 0.0008));
            return { gripBottom: [vx[0], 0, -0.03], gripTop: [vx[2], 0, -0.03], tip: [bx + bl, yb, zb], edge: [vx[1], 0, 0.05] };
        },
        sax(r, H) {
            // An alto standing on its bow (x up, the bell's side +y, its keys toward +z): a clearly conical body from
            // a narrow top down to a wide bottom, a deep U bow, the bell branch rising beside it and turning out into a
            // flared bell level with its lower part; a short curved neck off the top with the mouthpiece angled down.
            const k = r.length, M = H.Metal, bellR = 0.058 * (0.88 + r.shape * 0.24);
            const xb = 0.12, top = xb + 0.43 * k, G0 = 0.088, D = 0.095, xs = xb - D + G0 / 2, rb = x => 0.0128 + 0.0215 * Math.pow(Math.max(0, Math.min(1.15, (top - x) / (top - xb))), 1.1);
            const pts = [], rads = [];
            for (let j = 0; j <= 18; j++) { const x = top - (top - xs) * j / 18; pts.push([x, 0, 0]); rads.push(rb(x)); }
            for (let j = 1; j <= 14; j++) { const a = Math.PI * j / 14; pts.push([xs - G0 / 2 * Math.sin(a), G0 / 2 - G0 / 2 * Math.cos(a), 0]); rads.push(rb(xs) + (0.037 - rb(xs)) * j / 14); }
            const P0 = [xb, G0, 0], P1 = [xb + 0.035, G0, 0], P2 = [xb + 0.068, G0 + 0.009, 0];
            for (let j = 1; j <= 4; j++) { pts.push([xs + (xb - xs) * j / 4, G0, 0]); rads.push(0.037); }
            for (let j = 1; j <= 8; j++) { const t = j / 8, u = 1 - t; pts.push([0, 1, 2].map(i => u * u * P0[i] + 2 * u * t * P1[i] + t * t * P2[i])); rads.push(0.037 + 0.003 * t); }
            // The bell flares on out of the same tube (one surface, its rings and normals shared, no seam where the
            // flare begins), open at its mouth; a rolled rim and the inside wall turn back in from there, dark down the throat.
            const dir = norm(sub(P2, P1)), bl = 0.088, rOut = t => 0.04 + (bellR - 0.04) * Math.pow(t, 2.4), rIn = t => 0.037 + (bellR - 0.006 - 0.037) * Math.pow(t, 2.4);
            for (let j = 1; j <= 16; j++) { const t = j / 16; pts.push(add(P2, mul(dir, bl * t))); rads.push(rOut(t)); }
            M.push(K.tube(pts, j => rads[j], 28, { caps: false }));
            const prof = [[rOut(0.96) - 0.0012, bl * 0.96], [bellR + 0.0035, bl + 0.0015], [bellR + 0.003, bl + 0.0045], [bellR - 0.003, bl + 0.002]];
            for (let j = 14; j >= 0; j--) { const t = j / 14; prof.push([rIn(t), bl * t + 0.002]); }
            for (let j = 1; j <= 12; j++) { const t = j / 12 * 0.96; prof.push([rOut(t) - 0.0012, bl * t + 0.002 * (1 - t / 0.96)]); }
            const bell = Mesh.lathe(prof, 40, { base: P2, dir, sharp: 0.9, caps: false });
            M.push(bell);
            H.Dark.push(disc(add(P2, mul(dir, 0.012)), dir, 0.036, 0.002, 24));
            H._sax = { top, bottom: xs, rb, bell };
            // The neck: up off the top and curving over away from the bell, the mouthpiece angled down on its end.
            const N0 = [top, 0, 0], N1 = [top + 0.06, 0, 0], N2 = [top + 0.1, -0.032, 0], N3 = [top + 0.094, -0.098, 0];
            const neckPts = curve(t => { const u = 1 - t; return [0, 1, 2].map(i => u * u * u * N0[i] + 3 * u * u * t * N1[i] + 3 * u * t * t * N2[i] + t * t * t * N3[i]); }, 14);
            M.push(K.tube(neckPts, j => rb(top) - 0.0005 - 0.0038 * j / 14, 18));
            M.push(K.tube([add(N0, [0.004, 0, 0]), add(N0, [-0.012, 0, 0])], rb(top) + 0.0018, 20));
            const md = norm(sub(N3, N2)), mp = sub(N3, mul(md, 0.012));
            H.Dark.push(Mesh.lathe([[0.0086, 0], [0.0094, 0.025], [0.009, 0.05], [0.007, 0.062], [0, 0.066]], 18, { base: mp, dir: md, sharp: 0.6 }));
            M.push(ring(add(mp, mul(md, 0.016)), md, 0.0094, 0.0108, 0.011, 18));
            H.Ivory.push(K.bar(add(add(mp, mul(md, 0.014)), [-0.009, 0, 0]), add(add(mp, mul(md, 0.064)), [-0.0072, 0, 0]), [1, 0, 0], 0.011, 0.0016));
            M.push(K.tube([add(neckPts[4], [0, 0, 0.011]), add(neckPts[9], [0.006, 0, 0.009])], 0.0016, 6));
            // Keys: large pad cups on chimneys down the front with pearls on the main six, the low cups turned toward
            // the bell under wire guards, cups on the bell branch; a rod down the player's side with an arm to each.
            const cup = (c, n, cr, pearl) => {
                M.push(Mesh.lathe([[cr * 0.78, -0.007], [cr * 0.88, -0.007], [cr * 0.88, 0], [cr * 0.78, 0], [cr * 0.78, -0.007]], 20, { base: c, dir: n, caps: false }));
                M.push(Mesh.lathe([[0, 0], [cr, 0], [cr, 0.0035], [cr * 0.93, 0.0052], [0, 0.0058]], 22, { base: c, dir: n, sharp: 0.5 }));
                if (pearl) H.Ivory.push(Mesh.lathe([[0, 0], [0.0062, 0], [0.0062, 0.0014], [0.0044, 0.0031], [0, 0.0035]], 16, { base: add(c, mul(n, 0.0056)), dir: n, sharp: 0.5 }));
            };
            const on = (x, n, lift) => add([x, 0, 0], mul(n, rb(x) + (lift || 0.003)));
            const front = [0, 0, 1], main = [[0.075, 0.0098, 1], [0.105, 0.0104, 1], [0.135, 0.011, 1], [0.165, 0.0092, 0], [0.215, 0.0124, 1], [0.25, 0.0131, 1], [0.285, 0.0138, 1]];
            const rodPts = [];
            for (const [d, cr, pearl] of main) {
                const x = top - d * k, c = on(x, front);
                cup(c, front, cr, pearl);
                const rp = [x, -(rb(x) + 0.006), rb(x) * 0.45];
                rodPts.push(rp); M.push(string(add(c, [0, -cr * 0.7, 0.003]), rp, 0.0018));
            }
            M.push(K.tube([add(rodPts[0], [0.02, 0, 0]), ...rodPts, add(rodPts[rodPts.length - 1], [-0.02, 0, 0])], 0.0017, 6));
            const low = norm([0, 0.75, 1]);
            for (const [d, cr] of [[0.33, 0.0165], [0.37, 0.0175]]) {
                const x = top - d * k, c = on(x, low);
                cup(c, low, cr, false);
                // A wire guard arching over the cup, its feet on the body.
                const along = [1, 0, 0], side = norm(V3.cross(low, along)), g = curve(t => { const a = Math.PI * t; return add(add([x, 0, 0], mul(low, rb(x) + 0.004 + 0.011 * Math.sin(a))), mul(along, (cr + 0.007) * Math.cos(a))); }, 10);
                for (const off of [-0.6, 0.6]) M.push(K.tube(g.map(p => add(p, mul(side, off * cr))), 0.0014, 6));
            }
            for (const [x, cr] of [[xb - 0.012, 0.016], [xb + 0.022, 0.017]]) { const c = [x, G0, 0.037 + 0.003]; cup(c, front, cr, false); M.push(string(add(c, [0, cr * 0.8, 0]), [x + 0.01, G0 + 0.038, 0.012], 0.0018)); }
            // Thumb rest and strap ring on its back.
            M.push(box([top - 0.19 * k, 0, -(rb(top - 0.19 * k) + 0.004)], [0.024, 0.016, 0.006], 0.002));
            M.push(ring([top - 0.07 * k, 0, -(rb(top - 0.07 * k) + 0.002)], [0, 0, -1], 0.003, 0.0055, 0.004, 14));
            return { gripBottom: [top - 0.29 * k, 0, 0], gripTop: [top - 0.09 * k, 0, 0], tip: add(mp, mul(md, 0.066)), edge: [top - 0.2 * k, -0.05, 0] };
        },
        snare(r, H) {
            // A drum stands on its bottom head, its batter head up (the face): shell, hoops, lugs and rods, snares under it.
            const R = 0.18 * r.length, D = 0.1 + 0.08 * r.shape, c = [R + 0.012, 0, 0];
            H.Paint.push(Mesh.lathe([[R - 0.004, 0.004], [R, 0.006], [R, D - 0.006], [R - 0.004, D - 0.004], [R - 0.004, 0.004]], 64, { base: c, dir: [0, 0, 1], sharp: 0.6 }));
            for (const z of [0, D]) {
                const s = z ? 1 : -1;
                H.Head.push(Mesh.lathe([[0, -0.0005], [R - 0.004, -0.009], [R + 0.001, -0.009], [R + 0.001, -0.004], [R - 0.002, 0], [0, 0]], 64, { base: add(c, [0, 0, z]), dir: [0, 0, s], sharp: 0.7 }));
                M(H).push(Mesh.lathe([[R + 0.0005, -0.012], [R + 0.005, -0.012], [R + 0.006, 0.003], [R + 0.0045, 0.006], [R + 0.0025, 0.006], [R + 0.0005, -0.012]], 64, { base: add(c, [0, 0, z]), dir: [0, 0, s], sharp: 0.6 }));
            }
            for (let i = 0; i < 10; i++) {
                const a = i / 10 * Math.PI * 2 + Math.PI / 10, p = add(c, [Math.cos(a) * R, Math.sin(a) * R, 0]), o = [Math.cos(a), Math.sin(a), 0];
                for (const [z0, z1] of [[0.016, D * 0.38], [D * 0.62, D - 0.016]]) {
                    M(H).push(K.apply(blob([0, 0, 0], 0.006, 0.008, (z1 - z0) * 0.5, 12), q => add(add(p, mul(o, 0.004)), [q[0] * o[0] - q[1] * o[1], q[0] * o[1] + q[1] * o[0], (z0 + z1) / 2 + q[2]])));
                    const zr = z0 < D / 2 ? -0.006 : D + 0.006, rodEnd = add(add(p, mul(o, 0.009)), [0, 0, (z0 + z1) / 2]);
                    M(H).push(string(add(add(p, mul(o, 0.009)), [0, 0, zr]), rodEnd, 0.0032));
                    M(H).push(Mesh.lathe([[0, 0], [0.0048, 0], [0.0048, 0.006], [0, 0.007]], 6, { base: add(add(p, mul(o, 0.009)), [0, 0, zr]), dir: [0, 0, zr > 0 ? 1 : -1] }));
                }
            }
            // The snare's throw-off on its side, the wires under the bottom head, a vent badge.
            H.Metal.push(box(add(c, [R + 0.012, 0, D * 0.5]), [0.014, 0.04, 0.05], 0.004));
            H.Dark.push(box(add(c, [R + 0.021, 0, D * 0.62]), [0.008, 0.012, 0.022], 0.002));
            for (let j = 0; j < 14; j++) { const y = (j - 6.5) * 0.0045; H.String.push(string(add(c, [-R * 0.72, y, -0.0035]), add(c, [R * 0.72, y, -0.0035]), 0.0012)); }
            H.Metal.push(ring(add(c, [-R - 0.0005, 0, D * 0.5]), [-1, 0, 0], 0.004, 0.009, 0.0018, 16));
            return { gripBottom: add(c, [-R - 0.006, -0.04, D * 0.5]), gripTop: add(c, [-R - 0.006, 0.04, D * 0.5]), tip: add(c, [R, 0, D * 0.5]), edge: add(c, [0, 0, D]) };
        },
        handdrum(r, H) {
            // A goblet drum standing up: a carved wooden goblet, a skin head, rope tuning down to a ring at its waist.
            const Hh = 0.6 * r.length, R = 0.16, waist = 0.06 + 0.04 * (1 - r.shape), c = [R + 0.01, 0, 0];
            const prof = [[0, 0.004], [0.115, 0], [0.12, 0.006], [0.118, 0.03], [0.1, 0.07], [waist + 0.012, Hh * 0.33], [waist, Hh * 0.42], [waist + 0.02, Hh * 0.5], [R * 0.78, Hh * 0.62], [R * 0.95, Hh * 0.75], [R, Hh * 0.88], [R, Hh - 0.006], [R - 0.012, Hh - 0.004], [0, Hh - 0.006]];
            H.Wood.push(Mesh.lathe(prof, 48, { base: c, dir: [0, 0, 1], sharp: 0.7 }));
            for (const [z, rr] of [[0.045, 0.106], [0.06, 0.1]]) H.Dark.push(ring(add(c, [0, 0, z]), [0, 0, 1], rr - 0.002, rr + 0.0012, 0.004, 48));
            H.Head.push(Mesh.lathe([[0, -0.004], [R - 0.004, -0.004], [R + 0.001, -0.032], [R + 0.004, -0.03], [R + 0.004, -0.008], [R + 0.002, -0.0005], [0, 0.0015]], 48, { base: add(c, [0, 0, Hh]), dir: [0, 0, 1], sharp: 0.8 }));
            const zt = Hh - 0.038, zl = Hh * 0.6, rl = R * 0.8, n = 16;
            H.Metal.push(ring(add(c, [0, 0, zt - 0.003]), [0, 0, 1], R + 0.003, R + 0.008, 0.006, 48));
            H.Metal.push(ring(add(c, [0, 0, zl - 0.003]), [0, 0, 1], rl + 0.002, rl + 0.007, 0.006, 48));
            const radAt = z => { for (let k = 0; k + 1 < prof.length; k++) { const [r0, z0] = prof[k], [r1, z1] = prof[k + 1]; if (z >= z0 && z <= z1) return r0 + (r1 - r0) * (z - z0) / ((z1 - z0) || 1); } return R; };
            for (let i = 0; i < n * 2; i++) {
                const a0 = i / (n * 2) * Math.PI * 2, a1 = (i + 1) / (n * 2) * Math.PI * 2, up = i % 2 === 0;
                const p = (a, z, out) => add(c, [Math.cos(a) * (radAt(z) + out), Math.sin(a) * (radAt(z) + out), z]);
                const pts = curve(t => p(a0 + (a1 - a0) * t, up ? zt + (zl - zt) * t : zl + (zt - zl) * t, 0.007), 6);
                H.Accent.push(K.tube(pts, 0.0019, 5));
            }
            return { gripBottom: add(c, [-waist - 0.01, 0, Hh * 0.38]), gripTop: add(c, [-waist - 0.01, 0, Hh * 0.46]), tip: add(c, [0, 0, Hh]), edge: add(c, [R, 0, Hh * 0.8]) };
        },
        keytar(r, H) {
            const keys = 37, kw = 0.0225, kx0 = 0.06, kx1 = kx0 + 22 * kw, nl = 0.3 * r.length, depth = 0.17 + 0.05 * r.shape;
            // A body round the keys, sweeping into a neck with a grip and a ribbon on it.
            const outline = HS.round([[0, -depth * 0.5], [kx1 + 0.03, -depth * 0.5], [kx1 + 0.08, -depth * 0.32], [kx1 + nl, -0.028], [kx1 + nl + 0.05, -0.04], [kx1 + nl + 0.07, 0.01], [kx1 + nl, 0.03], [kx1 + 0.1, 0.03], [kx1 + 0.04, depth * 0.5], [0, depth * 0.5]], 0.02, 3, [1, 2, 3, 4, 5, 6, 7, 8]);
            H.Paint.push(slab(outline, -0.045, 0, 0.008, { smooth: 50 }));
            H.Dark.push(slab(HS.round([[kx0 - 0.008, -depth * 0.5 + 0.012], [kx1 + 0.008, -depth * 0.5 + 0.012], [kx1 + 0.008, -depth * 0.5 + 0.112], [kx0 - 0.008, -depth * 0.5 + 0.112]], 0.004, 2), -0.012, 0.001, 0.001));
            const y0 = -depth * 0.5 + 0.014, pattern = [1, 1, 0, 1, 1, 1, 0];
            for (let i = 0; i < 22; i++) {
                const x = kx0 + i * kw + kw / 2;
                H.Ivory.push(box([x, y0 + 0.048, 0.004], [kw - 0.0012, 0.096, 0.012], 0.0012));
                if (i < 21 && pattern[i % 7]) H.Dark.push(box([x + kw / 2, y0 + 0.068, 0.012], [0.012, 0.056, 0.012], 0.0016));
            }
            void keys;
            // The panel: a screen, knobs and buttons above the keys; the neck's grip, ribbon and buttons.
            const py = y0 + 0.11;
            H.Glow.push(slab(HS.round([[kx0 + 0.02, py + 0.004], [kx0 + 0.1, py + 0.004], [kx0 + 0.1, py + 0.03], [kx0 + 0.02, py + 0.03]], 0.003, 2), -0.002, 0.0012, 0.0006));
            for (let i = 0; i < 5; i++) H.Dark.push(Mesh.lathe([[0, 0], [0.0075, 0], [0.0072, 0.01], [0.006, 0.012], [0, 0.0125]], 16, { base: [kx0 + 0.15 + i * 0.03, py + 0.017, 0], dir: [0, 0, 1], sharp: 0.5 }));
            for (let i = 0; i < 6; i++) H.Glow.push(box([kx0 + 0.32 + i * 0.022, py + 0.017, 0.002], [0.014, 0.01, 0.006], 0.0015));
            H.Rubber.push(slab([[kx1 + nl * 0.35, -0.027], [kx1 + nl * 0.95, -0.03], [kx1 + nl * 0.95, 0.026], [kx1 + nl * 0.35, 0.027]], -0.05, 0.004, 0.006));
            H.Glow.push(slab(HS.round([[kx1 + 0.09, -0.008], [kx1 + nl * 0.3, -0.008], [kx1 + nl * 0.3, 0.008], [kx1 + 0.09, 0.008]], 0.004, 2), -0.002, 0.0015, 0.0006));
            for (let i = 0; i < 3; i++) H.Metal.push(Mesh.lathe([[0, 0], [0.005, 0], [0.005, 0.004], [0, 0.005]], 12, { base: [kx1 + nl + 0.015 + i * 0.014, -0.012 + i * 0.012, 0], dir: [0, 0, 1], sharp: 0.5 }));
            for (const x of [0.005, kx1 + nl + 0.05]) H.Metal.push(disc([x, 0, -0.022], [x < 0.1 ? -1 : 1, 0, 0], 0.006, 0.008, 12));
            return { gripBottom: [kx1 + nl * 0.4, 0, -0.02], gripTop: [kx1 + nl * 0.9, 0, -0.02], tip: [0, 0, -0.02], edge: [kx1 * 0.5, -depth * 0.5, 0] };
        },
        lyre(r, H) {
            // A crystal lyre in its plane: a soundbox at its foot, two crystal arms curving up and out to horn tips,
            // a gilded yoke across them with its pegs, strings of light from the tailpiece to the yoke.
            const hgt = 0.48 * r.length, spread = 0.9 + r.shape * 0.3;
            H.Wood.push(pillow(0, 0.13, t => 0.11 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)), 0.35), (t, s) => 0.012 * (1 - s * s), (t, s) => -0.035 - 0.01 * (1 - s * s), { rows: 24, cols: 12 }));
            H.Gem.push(K.gem([0.065, 0, 0.008], [0, 0, 1], 0.016, 0.022, 8, { low: 0.2, prism: 0.3 }));
            H.Metal.push(ring([0.065, 0, 0.004], [0, 0, 1], 0.018, 0.024, 0.006, 32));
            const yoke = hgt * 0.83;
            for (const side of [-1, 1]) {
                const arm = curve(t => [0.1 + (hgt - 0.1) * t, side * (0.07 + spread * 0.08 * Math.sin(Math.PI * t * 0.8) - 0.03 * t + 0.05 * Math.pow(Math.max(0, t - 0.85) / 0.15, 2)), 0], 24);
                H.Crystal.push(K.sweep(arm, k => K.roundSection(0.014 * (1 - 0.45 * k / 24), 6, Math.PI / 6), { up: [0, 0, 1], cos: K.COS.crisp }));
                const tip = arm[24], dir = norm(sub(arm[24], arm[22]));
                H.Gem.push(K.gem(tip, dir, 0.008, 0.035, 6, { low: 0.15, prism: 0.4 }));
                for (const [t, a] of [[0.35, 0.9], [0.6, -0.8]]) { const p = arm[Math.round(t * 24)]; H.Gem.push(K.gem(p, norm([0.3, side * Math.cos(a), Math.sin(a)]), 0.005, 0.022, 5)); }
            }
            const yy = 0.07 + spread * 0.08 * Math.sin(Math.PI * 0.83 * 0.8) - 0.03 * 0.83 + 0.012;
            H.Metal.push(Mesh.lathe([[0.007, 0], [0.009, 0.006], [0.0075, 0.012], [0.0075, yy * 2 - 0.012], [0.009, yy * 2 - 0.006], [0.007, yy * 2]], 16, { base: [yoke, -yy, 0], dir: [0, 1, 0], sharp: 0.6 }));
            H.Metal.push(box([0.02, 0, 0.016], [0.02, 0.09, 0.008], 0.002));
            const n = 7;
            for (let i = 0; i < n; i++) {
                const y = (i - (n - 1) / 2) / ((n - 1) / 2), a = [0.02, y * 0.035, 0.02], b = [yoke - 0.004, y * (yy - 0.02), 0.0];
                H.Glow.push(string(a, b, 0.0014));
                H.Metal.push(Mesh.lathe([[0, 0], [0.0035, 0], [0.0035, 0.01], [0.006, 0.012], [0.006, 0.018], [0, 0.019]], 10, { base: [yoke + 0.006, y * (yy - 0.02), 0.004], dir: [0, 0, 1], sharp: 0.5 }));
            }
            return { gripBottom: [0.05, 0, 0], gripTop: [0.12, 0, 0], tip: [hgt, 0, 0], edge: [hgt * 0.5, 0.12, 0] };
        },
        synth(r, H) {
            // A compact synth: a chamfered case between wooden cheeks, two octaves of keys, glowing pads, knobs and a screen.
            const W = 0.48 * r.length, Dp = 0.26 + 0.06 * r.shape, kw = 0.0225, nk = 15, kx0 = (W - nk * kw) / 2;
            H.Paint.push(slab(HS.cut([[0, -Dp / 2], [W, -Dp / 2], [W, Dp / 2], [0, Dp / 2]], [0.004, 0.004, 0.02, 0.02]), 0, 0.05, 0.004, { smooth: 30 }));
            for (const x of [-0.012, W]) { H.Wood.push(slab(HS.round([[x, -Dp / 2 - 0.004], [x + 0.012, -Dp / 2 - 0.004], [x + 0.012, Dp / 2 + 0.004], [x, Dp / 2 + 0.004]], 0.004, 2), -0.002, 0.07, 0.003)); }
            const y0 = -Dp / 2 + 0.012, pattern = [1, 1, 0, 1, 1, 1, 0];
            H.Dark.push(box([W / 2, y0 + 0.05, 0.046], [nk * kw + 0.012, 0.11, 0.012], 0.002));
            for (let i = 0; i < nk; i++) {
                const x = kx0 + i * kw + kw / 2;
                H.Ivory.push(box([x, y0 + 0.048, 0.052], [kw - 0.0012, 0.094, 0.012], 0.0012));
                if (i < nk - 1 && pattern[i % 7]) H.Dark.push(box([x + kw / 2, y0 + 0.068, 0.06], [0.012, 0.054, 0.012], 0.0016));
            }
            const py = y0 + 0.12;
            for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { H.Glow.push(box([0.04 + i * 0.03, py + 0.012 + j * 0.03, 0.052], [0.024, 0.024, 0.006], 0.003)); }
            H.Glow.push(slab(HS.round([[W * 0.38, py + 0.005], [W * 0.62, py + 0.005], [W * 0.62, py + 0.05], [W * 0.38, py + 0.05]], 0.004, 2), 0.048, 0.0512, 0.0006));
            for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) H.Metal.push(Mesh.lathe([[0, 0], [0.0085, 0], [0.008, 0.012], [0.0065, 0.014], [0, 0.0145]], 16, { base: [W * 0.68 + i * 0.03, py + 0.012 + j * 0.032, 0.05], dir: [0, 0, 1], sharp: 0.5 }));
            for (const y of [y0 + 0.02, y0 + 0.07]) H.Rubber.push(box([kx0 - 0.02, y, 0.052], [0.012, 0.04, 0.014], 0.004));
            return { gripBottom: [-0.012, -Dp * 0.3, 0.03], gripTop: [-0.012, Dp * 0.3, 0.03], tip: [W, 0, 0.03], edge: [W * 0.5, -Dp / 2, 0.05] };
        }
    };
    const M = H => H.Metal;

    /** Electric and bass guitars: a solid body with horns, pickups, bridge and knobs; a bolted maple neck. */
    function solid(r, H, bass) {
        const horn = 0.85 + r.shape * 0.3, sc = bass ? 1.14 : 1;
        const keys = [[0, 0.205], [14, 0.2], [26, 0.3 * horn], [40, 0.215], [65, 0.162], [90, 0.155], [125, 0.172], [155, 0.19], [180, 0.196], [205, 0.19], [235, 0.175], [270, 0.152], [300, 0.156], [322, 0.198], [336, 0.255 * horn * (bass ? 1.06 : 1)], [348, 0.205]].map(([d, rr]) => [d, rr * sc]);
        const cx = 0.2 * sc, outline = polar(keys, cx, 0, 120), Dz = 0.044;
        H.Paint.push(slab(outline, -Dz, 0, 0.0075, { smooth: 60 }));
        const pocket = cx + 0.205 * sc, scale = (bass ? 0.864 : 0.648) * r.length, xn = pocket + scale * (1 - Math.pow(2, -(bass ? 18 : 16) / 12)), xs = xn - scale;
        const n = bass ? 4 : 6, wn = bass ? 0.021 : 0.021, wb = bass ? 0.031 : 0.028;
        // The neck in its pocket, its board and frets, the headstock.
        H.Wood.push(neck(pocket - 0.06, xn + 0.004, 0.0, wb, wn, 0.022, 0.02, 0));
        fingerboard(H, pocket - 0.02, xn, wb, wn, -0.0002, 0.0065, { frets: bass ? 20 : 22, scale });
        H.Ivory.push(box([xn + 0.002, 0, 0.0075], [0.005, wn * 2, 0.005], 0.0008));
        const posts = headstock(H, xn + 0.004, 0.0, bass ? { len: 0.2, w0: wn + 0.002, w1: 0.034, pairs: 2, tilt: 0.0, button: 0.011, inline: false } : { len: 0.19, w0: wn + 0.002, w1: 0.036, pairs: 3, tilt: 0.0, button: 0.0075, inline: true });
        // Pickups in cream rings, the bridge with its saddles, a stop bar; knobs, a switch, the jack.
        const pick = (x, wide) => {
            if (bass) { H.Dark.push(box([x, 0, 0.002], [0.022, 0.09, 0.01], 0.004)); for (let i = 0; i < 4; i++) H.Metal.push(disc([x, (i - 1.5) * 0.019, 0.007], [0, 0, 1], 0.0028, 0.0006, 8)); return; }
            H.Ivory.push(slab(HS.round([[x - 0.026, -0.046], [x + 0.026, -0.046], [x + 0.026, 0.046], [x - 0.026, 0.046]], 0.006, 2), -0.001, 0.003, 0.001, { holes: [HS.round([[x - 0.02, -0.036], [x + 0.02, -0.036], [x + 0.02, 0.036], [x - 0.02, 0.036]], 0.003, 1)] }));
            H.Dark.push(box([x, 0, 0.0], [0.039, 0.071, 0.012], 0.0025));
            for (const dx of [-0.0095, 0.0095]) for (let i = 0; i < 6; i++) H.Metal.push(disc([x + dx, (i - 2.5) * 0.0104, 0.006], [0, 0, 1], 0.0023, 0.0007, 8));
            void wide;
        };
        pick(xs + (bass ? 0.06 : 0.04), 1); pick(xs + (bass ? 0.2 : 0.155), 1);
        if (bass) { H.Metal.push(box([xs - 0.01, 0, 0.002], [0.05, 0.085, 0.006], 0.0015)); for (let i = 0; i < 4; i++) H.Metal.push(box([xs + 0.004, (i - 1.5) * 0.019, 0.007], [0.018, 0.012, 0.007], 0.0015)); }
        else {
            H.Metal.push(box([xs, 0, 0.005], [0.011, 0.078, 0.008], 0.002), box([xs - 0.038, 0, 0.006], [0.012, 0.084, 0.01], 0.004));
            for (let i = 0; i < 6; i++) H.Metal.push(box([xs + 0.0015, (i - 2.5) * 0.0104, 0.0098], [0.006, 0.0085, 0.004], 0.001));
        }
        const knob = (x, y) => { H.Dark.push(Mesh.lathe([[0, 0], [0.0095, 0], [0.0095, 0.0025], [0.0085, 0.014], [0.0065, 0.0165], [0, 0.017]], 18, { base: [x, y, 0], dir: [0, 0, 1], sharp: 0.5 })); H.Metal.push(disc([x, y, 0.0165], [0, 0, 1], 0.0052, 0.0006, 14)); };
        knob(xs - 0.02, -0.088 * sc); knob(xs + 0.012, -0.112 * sc); knob(xs - 0.052, -0.112 * sc);
        if (!bass) knob(xs - 0.02, -0.136 * sc);
        H.Metal.push(Mesh.lathe([[0, 0], [0.006, 0], [0.006, 0.003], [0.0018, 0.004], [0.0018, 0.016], [0, 0.017]], 12, { base: [cx + 0.2 * sc, 0.105 * sc, 0], dir: [0, 0, 1] }));
        H.Ivory.push(blob([cx + 0.2 * sc, 0.105 * sc, 0.018], 0.004, 0.004, 0.005, 10));
        H.Metal.push(ring([xs - 0.085, -0.13 * sc, -0.002], [0, 0, 1], 0.004, 0.011, 0.004, 20));
        for (const [x, y] of [[cx - 0.196 * sc - 0.004, 0], [outline.reduce((m, p) => (p[0] > m[0] && p[1] > 0.05 ? p : m), [0, 0])[0] - 0.006, outline.reduce((m, p) => (p[0] > m[0] && p[1] > 0.05 ? p : m), [0, 0])[1]]]) H.Metal.push(disc([x, y, -Dz * 0.5], [x < 0.1 ? -1 : 1, 0, 0], 0.0045, 0.008, 12));
        // Strings from the bridge saddles over the nut to the tuner posts.
        for (let i = 0; i < n; i++) {
            const f = (i - (n - 1) / 2) / ((n - 1) / 2), y = bass ? f * 0.0285 : f * 0.026;
            route(H.String, [[bass ? xs - 0.03 : xs - 0.038, y * 1.05, bass ? 0.006 : 0.008], [xs + 0.002, y, bass ? 0.0115 : 0.012], [xn + 0.002, f * (wn - 0.0035), 0.0095], posts[i]], bass ? 0.0026 - i * 0.0004 : 0.0012 - i * 0.00015);
        }
        return { gripBottom: [fretAt(xn, scale, 7), 0, -0.01], gripTop: [fretAt(xn, scale, 2), 0, -0.01], tip: [0, 0, 0], edge: [cx, -0.16 * sc, 0] };
    }

    /** Violin and cello: an arched body with purfling and f-holes, a standing bridge, a scroll, and the bow beside it. */
    function bowed(r, H, cello) {
        const k = cello ? 2.12 : 1, g = 0.9 + r.shape * 0.2, B = 0.356 * k, W = 0.1025 * k * g, ribs = cello ? 0.12 : 0.031, arch = cello ? 0.028 : 0.0155;
        // The outline: a lower bout, a C-bout waist between two pointed corners, an upper bout. Each corner is a
        // step in the half width (the bout's edge running on past the waist's curve), its tip pointing along the body.
        // The cello's waist runs longer and its shoulders slope more (a lower upper bout).
        const c1 = cello ? 0.36 : 0.375, c2 = cello ? 0.625 : 0.605, up = cello ? 0.775 : 0.805, waist = cello ? 0.52 : 0.535, lc = cello ? 0.75 : 0.74, uc = cello ? 0.68 : 0.7, wm = (c1 + c2) / 2, wr = (c2 - c1) / 2;
        const wf = t => {
            if (t <= 0.235) return Math.sqrt(Math.max(0, 1 - ((0.235 - t) / 0.235) ** 2));
            if (t <= c1) return 1 - (1 - lc) * Math.pow((t - 0.235) / (c1 - 0.235), 1.6);
            if (t < c2) return waist + (0.64 - waist) * ((t - wm) / wr) ** 2;
            if (t <= 0.78) return up - (up - uc) * Math.pow((0.78 - t) / (0.78 - c2), 1.6);
            return up * Math.sqrt(Math.max(0, 1 - ((t - 0.78) / 0.22) ** 2));
        }, w = t => W * wf(t);
        const span = (a, b, n, ease) => Array.from({ length: n + 1 }, (_, k) => { const u = k / n; return a + (b - a) * (ease ? ease(u) : u); });
        const e = 0.004, ts = [...span(0, c1 - e, 20, u => (1 - Math.cos(Math.PI * u / 2 * 1.0)) ), ...span(c1 + e, c2 - e, 12), ...span(c2 + e, 1, 20, u => Math.sin(Math.PI * u / 2))];
        const dome = (t, s) => Math.pow(Math.max(0, 1 - s * s), 0.8) * Math.pow(Math.sin(Math.PI * t), 0.45);
        const topZ = (t, s) => arch * dome(t, s), botZ = (t, s) => -ribs - arch * 0.85 * dome(t, s);
        H.Varnish.push(pillow(0, B, w, topZ, botZ, { ts, cols: 16 }));
        // Purfling just in from the edge, and the f-holes either side of the bridge.
        const purf = [];
        for (let j = 0; j < 64; j++) { const a = j / 64, t = a < 0.5 ? 0.025 + 0.95 * (a * 2) : 0.975 - 0.95 * ((a - 0.5) * 2), s = a < 0.5 ? 0.9 : -0.9; purf.push([B * t, s * w(t), topZ(t, s) + 0.0004 * k]); }
        H.Dark.push(K.sweep(purf, K.roundRect(0.0006 * k, 0.0012 * k, 0.0002, 1), { up: [0, 0, 1], closed: true }));
        // The f-holes either side of the bridge: an S stem from a small upper eye near the middle to a larger lower eye
        // further out, the notches across its waist marking where the bridge stands.
        const xb = B * 0.49, onTop = (x, y) => { const t = x / B, s = y / w(t); return [x, y, topZ(t, s) + 0.0003 * k]; };
        for (const side of [-1, 1]) {
            const f = curve(u => { const x = B * (0.6 - 0.235 * u), y = side * k * (0.0175 + 0.0115 * u + 0.0038 * Math.sin(Math.PI * 2 * u)); return onTop(x, y); }, 16);
            H.Dark.push(K.tube(f, j => 0.0011 * k * (0.7 + 0.7 * Math.sin(Math.PI * j / 16)), 6));
            const eye = (u, r, curl) => { const p = f[Math.round(u * 16)]; H.Dark.push(blob(onTop(p[0] + curl[0] * k, p[1] + side * curl[1] * k), r * k, r * k, 0.0007 * k, 10)); };
            eye(0, 0.0034, [0.0022, -0.0024]); eye(1, 0.0044, [-0.0024, 0.0028]);
            const m = f[8], n = f[9], d = norm(sub(n, m)), q = [-d[1], d[0], 0];
            for (const sgn of [-1, 1]) H.Dark.push(string(add(m, mul(q, sgn * 0.0008 * k)), add(m, mul(q, sgn * 0.0042 * k)), 0.0008 * k));
        }
        // The neck with a long ebony fingerboard, the bridge standing on the arch, a tailpiece and chinrest or endpin.
        const xn = B + (cello ? 0.28 : 0.13), zt = arch * 0.95, fb0 = B * 0.64;
        H.Varnish.push(neck(B - 0.02 * k, xn + 0.004, zt, 0.017 * k, 0.012 * k, 0.017 * k, 0.014 * k, 0.012 * k));
        H.Board.push(slab([[fb0, -0.021 * k], [xn, -0.012 * k], [xn, 0.012 * k], [fb0, 0.021 * k]], zt + 0.0, zt + 0.006 * k, 0.0012 * k, { smooth: 60 }));
        const zbr = topZ(xb / B, 0), bh = cello ? 0.085 : 0.033, bw = cello ? 0.045 : 0.021;
        const bridge = [[-bw, 0], [-bw * 0.55, 0], [-bw * 0.4, bh * 0.22], [bw * 0.4, bh * 0.22], [bw * 0.55, 0], [bw, 0], [bw * 0.9, bh * 0.45], [bw * 0.78, bh * 0.85], [bw * 0.4, bh * 0.98], [0, bh], [-bw * 0.4, bh * 0.98], [-bw * 0.78, bh * 0.85], [-bw * 0.9, bh * 0.45]];
        H.Ivory.push(HS.plate(bridge, 0.0035 * Math.sqrt(k), 0.0008, { holes: [HS.circle(0, bh * 0.6, bw * 0.16, 10), HS.circle(-bw * 0.55, bh * 0.52, bw * 0.08, 8), HS.circle(bw * 0.55, bh * 0.52, bw * 0.08, 8)], frame: { o: [xb, 0, zbr - 0.002], u: [0, 1, 0], v: [0, 0, 1], n: [1, 0, 0] } }));
        const zTail = topZ(0.15, 0) + 0.008 * k;
        H.Board.push(slab(HS.round([[0.02 * k, -0.012 * k], [0.12 * k, -0.021 * k], [0.125 * k, 0], [0.12 * k, 0.021 * k], [0.02 * k, 0.012 * k]], 0.005 * k, 2, [1, 3]), zTail - 0.004 * k, zTail, 0.0012 * k, { smooth: 60 }));
        H.Board.push(string([-0.002, 0, -ribs * 0.4], [0.02 * k, 0, zTail - 0.002 * k], 0.0035 * k));
        if (cello) H.Metal.push(Mesh.lathe([[0, 0], [0.01, 0], [0.012, 0.03], [0.004, 0.04], [0.004, 0.22], [0.0015, 0.24], [0, 0.245]], 12, { base: [0.004, 0, -ribs * 0.5], dir: [-1, 0, 0], sharp: 0.5 }));
        else {
            // The chinrest: a shallow ebony cup to the left of the tailpiece, on a cork-footed bracket.
            const cr = [0.032, 0.042, topZ(0.09, 0.45) + 0.006];
            H.Board.push(K.apply(Mesh.lathe([[0, 0.004], [0.026, 0], [0.03, 0.004], [0.028, 0.008], [0.022, 0.0075], [0, 0.0045]], 24, { base: [0, 0, 0], dir: [0, 0, 1], sharp: 0.6 }), q => [cr[0] + q[0], cr[1] + q[1] * 0.82, cr[2] + q[2]]));
            H.Metal.push(string([cr[0], cr[1] - 0.02, cr[2]], [cr[0], cr[1] - 0.02, topZ(0.05, 0.3) - 0.004], 0.003));
        }
        // The pegbox, its pegs, and the scroll curling at its end.
        const xp = xn + 0.004, pegLen = (cello ? 0.12 : 0.065), zp = zt + 0.002;
        for (const side of [-1, 1]) H.Varnish.push(slab(HS.round([[xp - 0.002, 0], [xp + pegLen, 0], [xp + pegLen, 0.016 * k], [xp - 0.002, 0.018 * k]].map(([x, y]) => [x, y - 0.009 * k]), 0.003 * k, 2, [1, 2]), 0, 0.003 * k, 0.0008, { frame: { o: [0, side * 0.0095 * k, zp - 0.018 * k], u: [1, 0, 0], v: [0, 0, 1], n: [0, side, 0] } }));
        H.Varnish.push(box([xp + pegLen * 0.5, 0, zp - 0.0175 * k], [pegLen, 0.022 * k, 0.004 * k], 0.001));
        const sc = [xp + pegLen + 0.018 * k, 0, zp - 0.006 * k], spiral = [];
        for (let j = 0; j <= 36; j++) { const a = j / 36 * Math.PI * 2.6, rr = 0.019 * k * Math.exp(-0.2 * a); spiral.push([sc[0] + Math.sin(a) * rr - 0.002 * k, 0, sc[2] - Math.cos(a) * rr]); }
        H.Varnish.push(K.sweep(spiral, j => K.roundRect(0.018 * k * (1 - 0.35 * j / 36), 0.005 * k * (1 - 0.3 * j / 36) + 0.001, 0.0015 * k, 2), { up: [0, 1, 0] }));
        const pegs = [];
        for (let i = 0; i < 4; i++) {
            const side = i % 2 ? 1 : -1, x = xp + pegLen * (0.2 + 0.2 * i);
            H.Board.push(Mesh.lathe([[0, 0], [0.003 * k, 0], [0.0036 * k, 0.03 * k], [0.0025 * k, 0.034 * k], [0.009 * k, 0.04 * k], [0.009 * k, 0.05 * k], [0.005 * k, 0.054 * k], [0, 0.054 * k]], 10, { base: [x, -side * 0.012 * k, zp - 0.01 * k], dir: [0, side, 0], sharp: 0.6 }));
            pegs.push([x, 0, zp - 0.01 * k]);
        }
        const nutZ = zt + 0.0075 * k;
        H.Ivory.push(box([xn + 0.001, 0, nutZ - 0.0012 * k], [0.003 * k, 0.024 * k, 0.003 * k], 0.0005));
        for (let i = 0; i < 4; i++) { const f = (i - 1.5) / 1.5; route(H.String, [[0.12 * k, f * 0.012 * k, zTail], [xb, f * bw * 0.55, zbr + bh * (0.98 - 0.08 * f * f)], [xn + 0.002, f * 0.008 * k, nutZ], pegs[[0, 2, 3, 1][i]]], (0.0009 - i * 0.0001) * Math.sqrt(k)); }
        // The bow beside it: a cambered stick, its hair, frog and tip.
        if (r.bow) {
            const bl = cello ? 0.72 : 0.75, by = -W - 0.04 * k, bz = -ribs * 0.6, stick = curve(t => [-0.02 + bl * t, by, bz + 0.014 * Math.sin(Math.PI * t) * (cello ? 1.3 : 1)], 20);
            H.Bow.push(K.tube(stick, j => (cello ? 0.0052 : 0.0042) * (1 - 0.35 * j / 20), 8));
            H.Hair.push(K.bar([0.04, by, bz - 0.014], [bl - 0.03, by, bz - 0.006], [0, 0, 1], 0.006, 0.0012));
            H.Board.push(box([0.03, by, bz - 0.009], [0.045, 0.011, 0.017], 0.002));
            H.Metal.push(Mesh.lathe([[0.006, 0], [0.006, 0.03]], 12, { base: [-0.016, by, bz + 0.001], dir: [1, 0, 0] }), box([0.052, by, bz - 0.012], [0.004, 0.012, 0.01], 0.001));
            H.Ivory.push(box([bl - 0.022, by, bz - 0.002], [0.016, 0.009, 0.016], 0.003));
        }
        return { gripBottom: [xn - 0.08 * k, 0, zt - 0.01 * k], gripTop: [xn - 0.01 * k, 0, zt - 0.01 * k], tip: [0, 0, 0], edge: [B * 0.5, -W, 0] };
    }

    // ── the build ──────────────────────────────────────────────────────────
    const LISTS = ['Wood', 'Top', 'Varnish', 'Bow', 'Paint', 'Board', 'Dark', 'Ivory', 'Metal', 'String', 'StringC', 'StringF', 'Hair', 'Head', 'Accent', 'Rubber', 'Glow', 'Crystal', 'Gem'];
    const hexMix = (a, b, t) => '#' + Paint.hex(a).map((v, i) => Math.round(v + (Paint.hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

    function build(recipe, cache) {
        const r = normalize(recipe), c = cache || {}, s = r.size, H = {};
        for (const k of LISTS) H[k] = [];
        const marks = BUILD[r.preset](r, H);
        // The size: every point (and marker) scaled about the foot; wood gets its grain after.
        const scale = m => { const P = m.positions; for (let i = 0; i < P.length; i++) P[i] *= s; return m; };
        for (const k of LISTS) H[k] = H[k].filter(m => m && m.index && m.index.length).map(scale);
        for (const k of Object.keys(marks)) marks[k] = marks[k].map(v => v * s);
        const textures = {}, woodPic = (key, base, seed, rings) => {
            const id = 'inst-' + key + '.png', want = base + '/' + (rings || 0);
            if (!c[id] || c[id + 'key'] !== want) { c[id] = Paint.grainWood(base, seed, id, { rings }); c[id + 'key'] = want; }
            textures[id] = c[id];
            return id;
        };
        for (const k of ['Wood', 'Top', 'Varnish', 'Bow']) for (const m of H[k]) if (!m.keepUv) Mesh.grainUv(m);
        // A glaze over fired clay: its color pooling a little deeper and paler in broad soft patches, a few iron specks.
        const glazePic = () => {
            const id = 'inst-glaze.png';
            if (!c[id] || c[id + 'key'] !== r.color) {
                const base = Paint.hex(r.color), pool = Paint.fractal(5, 4, 3), fleck = Paint.noise(11, 160);
                const pic = Paint.paint(256, 256, (u, v, out) => {
                    const m = pool(u, v), f = fleck(u, v), k = 0.94 + 0.16 * (m - 0.5) - (f > 0.95 ? 0.22 * (f - 0.95) / 0.05 : 0);
                    for (let i = 0; i < 3; i++) out[i] = Math.max(0, Math.min(255, base[i] * k + 14 * (m - 0.5)));
                    out[3] = 255;
                }, 1);
                pic.name = id; pic.repeat = true; c[id] = pic; c[id + 'key'] = r.color;
            }
            textures[id] = c[id];
            return id;
        };
        const trim = K.look(r.metal), glow = r.glow, flute = r.preset === 'flute';
        const woodColor = WOOD[r.wood], board = r.preset === 'electric' && r.wood === 'maple' ? '#3a2418' : '#1c1614';
        const look = {
            Wood: H.Wood.length && { kind: 'prop', texture: woodPic('wood', woodColor, 31 + WOODS.findIndex(w => w[0] === r.wood)), roughness: 0.38, metalness: 0, mat: 'wood' },
            Top: H.Top.length && { kind: 'prop', texture: woodPic('top', WOOD.spruce, 17, 30), roughness: 0.32, metalness: 0, mat: 'wood' },
            Varnish: H.Varnish.length && { kind: 'prop', texture: woodPic('varnish', hexMix(r.color, '#d8a060', 0.15), 23, 24), roughness: 0.28, metalness: 0, mat: 'wood' },
            Bow: H.Bow.length && { kind: 'prop', texture: woodPic('bow', '#4a2416', 41), roughness: 0.35, metalness: 0, mat: 'wood' },
            Paint: r.preset === 'ocarina' ? { kind: 'prop', texture: glazePic(), roughness: 0.14, metalness: 0 } : { kind: 'prop', color: r.color, roughness: 0.2, metalness: 0.08 },
            Board: { kind: 'prop', color: board, roughness: 0.42, metalness: 0 },
            Dark: { kind: 'prop', color: '#141214', roughness: 0.5, metalness: 0.1 },
            Ivory: { kind: 'prop', color: r.preset === 'keytar' || r.preset === 'synth' ? '#f3f1ec' : '#ece2cc', roughness: 0.32, metalness: 0 },
            Metal: { kind: 'metal', color: flute ? '#d8dce2' : trim.color, roughness: trim.roughness, metalness: trim.metalness, mat: 'metal' },
            String: { kind: 'metal', color: '#cfc8b8', roughness: 0.3, metalness: 0.85 },
            StringC: { kind: 'prop', color: '#b8322a', roughness: 0.45, metalness: 0 },
            StringF: { kind: 'prop', color: '#2a4a9a', roughness: 0.45, metalness: 0 },
            Hair: { kind: 'prop', color: '#ece6d4', roughness: 0.7, metalness: 0 },
            Head: { kind: 'prop', color: r.preset === 'handdrum' ? '#d4b88e' : '#eee8da', roughness: 0.72, metalness: 0 },
            Accent: { kind: 'prop', color: r.accent, roughness: 0.6, metalness: 0 },
            Rubber: { kind: 'prop', color: '#1d1e21', roughness: 0.85, metalness: 0 },
            Glow: glow ? { kind: 'prop', color: r.accent, emissive: r.accent, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0 } : { kind: 'prop', color: '#1a1c20', roughness: 0.3, metalness: 0.2 },
            Crystal: glow ? { kind: 'prop', color: r.color, emissive: hexMix(r.color, r.accent, 0.5), emissiveIntensity: 0.55, opacity: 0.82, roughness: 0.06, metalness: 0.1 } : { kind: 'metal', color: r.color, opacity: 0.85, roughness: 0.05, metalness: 0.3 },
            Gem: glow ? { kind: 'prop', color: hexMix(r.accent, '#ffffff', 0.4), emissive: r.accent, emissiveIntensity: 1.2, roughness: 0.1, metalness: 0 } : { kind: 'metal', color: r.accent, roughness: 0.08, metalness: 0.35 }
        };
        const P = {};
        for (const k of LISTS) if (H[k].length && look[k]) P[k] = { meshes: H[k], look: look[k] };
        // The saxophone stands up on its bow as on a stand (its length up, its keys toward the viewer); the rest lie flat.
        const upright = r.preset === 'sax' ? { toWorld: ([x, y, z]) => [-y, x, z] } : {};
        return K.finish('instrument', r, P, marks, textures, Object.assign({ template: 'blade' }, upright));
    }

    /** A random instrument: another style when Everything rolls; shape its size and proportions; details its proportion, glow and bow; colors its wood, finish and metal. */
    function random(seed, recipe, scope, keep) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur));
        const all = !scope || scope === 'all', has = part => all || scope === part;
        if (all && !keep) out.preset = R.pick(PRESETS)[0];
        if (has('shape')) { out.size = R.jitter(1, 0.08, 0.7, 1.4); out.shape = R.range(0.15, 0.85); out.length = R.jitter(1, 0.06, 0.8, 1.25); }
        if (has('colors')) {
            out.wood = R.pick(WOODS)[0]; out.metal = R.pick(METALS)[0];
            const fam = FAMILY[out.preset];
            out.color = fam.color === 'Varnish' ? R.pick(['#9a4a1c', '#7a3416', '#b0602a', '#5e2a14']) : fam.color ? R.pick(Rand.PALETTES.paint.concat(Rand.PALETTES.dark)) : out.color;
            out.accent = fam.glow ? R.pick(Rand.PALETTES.glow) : fam.accent ? R.pick(Rand.PALETTES.cloth) : out.accent;
        }
        if (has('details')) { const fam = FAMILY[out.preset]; out.shape = R.range(0.1, 0.9); if (fam.glow) out.glow = R.chance(0.8); if (fam.bow) out.bow = R.chance(0.7); }
        return normalize(out);
    }

    const api = { PRESETS, FAMILY, WOODS, normalize, build, random, BUILD };
    root.RRInstrumentProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel || (typeof require === 'function' ? require('./PropModel.js') : null);
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'instrument', label: 'Instrument', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        K.icons(Catalog);
        const ICONS = {
            guitar: '<path d="M14 10l6-6m-2-1l3 3"/><path d="M13 9c-2-1-4 0-4 2-2 0-4 1-4 4 0 3 3 6 6 6 3 0 4-2 4-4 2 0 3-2 2-4z"/><circle cx="11" cy="15" r="1.5"/>',
            violin: '<path d="M15 9l6-6"/><path d="M12 8c-1-1-3 0-3 1 0 2-3 1-3 4s3 3 2 5c1 1 3 0 3-1 2 0 2 3 5 2s1-3 3-4c1-1 0-3-1-3 0-1-2-1-2-2z"/><path d="M3 21l7-7"/>',
            flute: '<path d="M3 17L19 5l2 2L5 19z"/><path d="M9 13h.1m3-2h.1m3-2h.1"/>',
            trumpet: '<path d="M2 12h12l7-5v10l-7-5"/><path d="M7 12V8m3 4V8m-6 0h8"/>',
            sax: '<path d="M16 3l-4 2v11c0 3-2 5-5 5-2 0-3-2-2-3h6"/><path d="M12 8h2m-2 3h2m-2 3h2"/>',
            drum: '<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 2 4 3 8 3s8-1 8-3V8M7 10.5l2 7m8-7l-2 7"/>',
            harp: '<path d="M5 21V4c5 0 9 3 14 1L8 20H5"/><path d="M8 6v12m3-11v9m3-8v6"/>',
            keys: '<rect x="2" y="6" width="20" height="12" rx="1"/><path d="M6 6v7m4-7v7m4-7v7m4-7v7M4 18h16"/>',
            ocarina: '<path d="M4 13c0-4 4-7 9-7 4 0 7 2 7 5s-3 6-8 6c-1 0-2 0-3 1l-4 2 1-3c-1-1-2-2-2-4z"/><circle cx="11" cy="11" r=".6"/><circle cx="14" cy="11" r=".6"/>',
            lyre: '<path d="M7 21h10M8 21C4 14 5 7 9 3m7 18c4-7 3-14-1-18"/><path d="M7 7h10M10 7v12m2-12v12m2-12v12"/>'
        };
        for (const [k, v] of Object.entries(ICONS)) if (!Catalog.ICONS[k]) Catalog.ICONS[k] = v;
        Catalog.category({ id: 'instruments', label: 'Instruments', order: 75 });
        for (const [id, label, order] of [['inst-strings', 'Strings', 76], ['inst-winds', 'Winds & Brass', 77], ['inst-drums', 'Drums & Keys', 78], ['inst-fantasy', 'Fantasy & Sci-fi', 79]]) Catalog.category({ id, label, order, parent: 'instruments' });
        for (const [id, label, category] of PRESETS) Catalog.add({ id: 'instrument-' + id, category, label, icon: FAMILY[id].icon, kind: 'instrument', keywords: 'instrument music musical band ' + id + ' ' + label.toLowerCase(), start: () => normalize({ preset: id }), matches: r => r.preset === id });
        // The equipment list's stage gear (the microphone) moves in beside them; its old guitar is the
        // acoustic guitar's to make now, so it is unlisted (its saved recipes still open).
        Catalog.category({ id: 'acc-instruments', label: 'Stage gear', order: 80, parent: 'instruments' });
        const oldGuitar = Catalog.TYPES.find(t => t.id === 'accessory-guitar');
        if (oldGuitar) oldGuitar.hidden = true;
        Catalog.ui('instrument', K.page({
            placeholder: 'Instrument', PRESETS, normalize, random, keep: ['wood', 'metal'],
            shape(r) {
                const fam = FAMILY[r.preset];
                return this._slider({ path: 'size', label: 'Overall size', range: [0.7, 1.4], step: 0.01, format: 'x' })
                    + this._slider({ path: 'length', label: fam.length, range: [0.8, 1.25], step: 0.01, format: 'x' })
                    + this._slider({ path: 'shape', label: fam.shape, range: [0, 1] });
            },
            look(r) {
                const fam = FAMILY[r.preset];
                let html = this._section('Materials');
                if (fam.wood) html += this._select('wood', fam.wood, WOODS);
                if (fam.color) html += this._color('color', fam.color);
                html += this._select('metal', 'Metal', METALS);
                if (fam.accent) html += this._color('accent', fam.accent);
                if (fam.glow) html += this._check('glow', 'Glows');
                if (fam.bow) html += this._check('bow', 'Bow beside it');
                return html;
            }
        }));
    }
})(typeof window !== 'undefined' ? window : globalThis);
