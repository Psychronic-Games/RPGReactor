/**
 * RRSpanProp - Banners & Flags › Hanging banners: banners hung from a
 * pole, rod, rope or wire across a gap (an alley, a street), or a string of
 * bunting.
 *
 * In tiles, one unit to a tile: the span runs along x, centered on the
 * origin, at its height above the floor; the banners hang down from it in
 * the x-y plane, their faces to +z. A rope or wire sags as a catenary and
 * swings a little, carrying its banners; a pole or rod stays straight. Each
 * banner is a cloth of its own (RRPropCloth), pinned along its top, baked
 * into the same loop, with its own share of the bones.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Cloth = need('RRPropCloth', './PropCloth.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const Design = need('RRFlagDesign', './FlagDesign.js');
    const Flag = need('RRFlagProp', './FlagProp.js');
    const Rand = need('RRPropRandom', './PropRandom.js');

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);

    const SPANS = [['pole', 'Pole'], ['rod', 'Iron rod'], ['rope', 'Rope'], ['wire', 'Wire']];
    const MOUNTS = [['brackets', 'Wall brackets'], ['posts', 'Posts'], ['none', 'Wall to wall']];
    const SHAPES = [['rectangle', 'Rectangle'], ['swallowtail', 'Swallowtail'], ['pointed', 'Pointed'], ['bunting', 'Bunting']];
    const SPAN_LOOK = { pole: { r: 0.035, color: '#6e4a2c', roughness: 0.75, metalness: 0 }, rod: { r: 0.016, color: '#2a2a2e', roughness: 0.45, metalness: 0.7 }, rope: { r: 0.013, color: '#b39a6a', roughness: 0.95, metalness: 0 }, wire: { r: 0.005, color: '#3a3a3e', roughness: 0.5, metalness: 0.6 } };
    const MAX = 8, MAX_BUNTING = 30;

    const DEFAULT = {
        kind: 'span',
        span: { type: 'rope', length: 4, height: 3, mounts: 'brackets', sag: 0.35, color: '' },
        banners: { shape: 'swallowtail', count: 3, spacing: 'even', positions: [], shared: true, length: 1.3, lengths: [], width: 0.55, alternate: true },
        design: { field: { layout: 'bands', count: 3, orient: 'v', colors: ['#8c1c1c', '#d9b23c', '#8c1c1c'] }, layers: [{ shape: 'sun', color: '#d9b23c', size: 0.5, place: 'free', x: 0.5, y: 0.3 }] },
        design2: { field: { layout: 'solid', colors: ['#1f3c78'] }, layers: [{ shape: 'star', color: '#f2efe6', size: 0.45, place: 'free', x: 0.5, y: 0.3 }] },
        wind: { strength: 0.25, gust: 0.4 }, fabric: 'cotton', seed: 11
    };

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {}, d = DEFAULT;
        const s = Object.assign({}, d.span, r.span || {}), b = Object.assign({}, d.banners, r.banners || {}), w = Object.assign({}, d.wind, r.wind || {});
        const shape = pick(b.shape, SHAPES.map(x => x[0]), d.banners.shape), bunting = shape === 'bunting';
        const count = Math.round(clamp(b.count, bunting ? 4 : 1, bunting ? MAX_BUNTING : MAX, bunting ? 12 : d.banners.count));
        const length = clamp(s.length, 1, 8, d.span.length), type = pick(s.type, SPANS.map(x => x[0]), d.span.type);
        const width = clamp(b.width, 0.1, 2, bunting ? 0.28 : d.banners.width);
        const bLength = clamp(b.length, 0.15, 4, bunting ? 0.35 : d.banners.length);
        const height = clamp(s.height, 1, 6, d.span.height);
        return {
            kind: 'span',
            span: { type, length, height, mounts: pick(s.mounts, MOUNTS.map(x => x[0]), d.span.mounts), sag: type === 'rope' || type === 'wire' ? clamp(s.sag, 0.02, 1, d.span.sag) : 0, color: color(s.color, SPAN_LOOK[type].color) },
            banners: {
                shape, count, spacing: pick(b.spacing, ['even', 'custom'], 'even'),
                positions: Array.from({ length: count }, (_, k) => clamp((b.positions || [])[k], 0.02, 0.98, (k + 0.5) / count)),
                shared: b.shared !== false, length: bLength,
                lengths: Array.from({ length: count }, (_, k) => clamp((b.lengths || [])[k], 0.15, 4, bLength)),
                width, alternate: b.alternate !== false
            },
            design: Design.normalize(r.design || d.design), design2: Design.normalize(r.design2 || d.design2),
            wind: { strength: clamp(w.strength, 0, 0.6, d.wind.strength), gust: clamp(w.gust, 0, 1, d.wind.gust) },
            fabric: pick(r.fabric, ['cotton', 'silk', 'wool'], 'cotton'),
            seed: (Number(r.seed) >>> 0) || 1
        };
    }

    // ── the span ───────────────────────────────────────────────────────────
    /**
     * The span's height along its length: a rope or wire hangs as a catenary
     * through both ends at `height`, `sag` lower in the middle; a pole is
     * straight. Returns y(x) for x from -length/2 to length/2.
     */
    function curve(span) {
        const L = span.length, H = span.height, d = span.sag;
        if (!(d > 0)) return () => H;
        // a · (cosh(L / 2a) - 1) = d: a found by halving (the sag falls as a grows).
        let lo = L / 2000, hi = L * 1000;
        for (let k = 0; k < 200; k++) { const a = (lo + hi) / 2; if (a * (Math.cosh(L / (2 * a)) - 1) > d) lo = a; else hi = a; }
        const a = (lo + hi) / 2;
        return x => H - d + a * (Math.cosh(x / a) - 1);
    }

    /** Where along the span each banner hangs (its middle), in tiles from the span's middle. */
    function centers(r) {
        const L = r.span.length, b = r.banners;
        if (b.shape === 'bunting' || b.spacing === 'even') return Array.from({ length: b.count }, (_, k) => (k + 0.5) / b.count * L - L / 2);
        return b.positions.map(p => p * L - L / 2);
    }

    /** How far a rope swings at x: most in its middle, nothing at its ends; a pole not at all. */
    function swing(r, x) {
        const s = r.span;
        if (s.type !== 'rope' && s.type !== 'wire') return 0;
        const most = s.sag * (0.12 + 0.6 * r.wind.strength) * (s.type === 'wire' ? 0.5 : 1);
        const t = 2 * x / s.length;
        return most * Math.max(0, 1 - t * t);
    }

    // ── the build ──────────────────────────────────────────────────────────
    const rigid = mesh => {
        const n = mesh.positions.length / 3, w = new Float32Array(n * 4);
        for (let i = 0; i < w.length; i += 4) w[i] = 1;
        return Object.assign(mesh, { joints: new Uint16Array(n * 4), weights: w });
    };
    const odd = (v, lo, hi) => { let n = Math.max(lo, Math.min(hi, Math.round(v))); if (n % 2 === 0) n++; return n; };

    function build(recipe, cache, options) {
        const r = normalize(recipe), o = options || {}, c = cache || {}, images = o.images || {};
        const L = r.span.length, H = r.span.height, y = curve(r.span), look = SPAN_LOOK[r.span.type];
        const bunting = r.banners.shape === 'bunting', moving = r.span.type === 'rope' || r.span.type === 'wire';
        const parts = [], bones = [{ name: 'Prop', head: [0, 0, 0], parent: -1 }], restBones = [];
        // The rope's own bones: nine points along it, its ends held.
        const ropeK = moving ? 9 : 0, ropeX = Array.from({ length: ropeK }, (_, k) => -L / 2 + k * L / (ropeK - 1));
        for (let k = 0; k < ropeK; k++) { const head = [ropeX[k], y(ropeX[k]), 0]; bones.push({ name: 'Span_' + k, head, parent: 0 }); restBones.push(...head); }

        // The span itself, along its curve.
        const N = moving ? 32 : 2, P = [], N3 = [], T = [], I = [], J = [], W = [], seg = r.span.type === 'wire' ? 4 : 8;
        for (let k = 0; k <= N; k++) {
            const x = -L / 2 + k * L / N, yy = y(x), dx = 1e-3, slope = (y(x + dx) - y(x - dx)) / (2 * dx), tl = Math.hypot(1, slope);
            const t = [1 / tl, slope / tl, 0], n1 = [-slope / tl, 1 / tl, 0], n2 = [0, 0, 1];
            // Its weights: between the two rope bones either side (the ends on the root).
            let j0 = 0, j1 = 0, f = 0;
            if (moving) { const at = (x + L / 2) / L * (ropeK - 1); j0 = Math.min(ropeK - 2, Math.floor(at)); f = at - j0; j1 = j0 + 1; }
            for (let s = 0; s <= seg; s++) {
                const a = s / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                const nx = n1[0] * ca + n2[0] * sa, ny = n1[1] * ca + n2[1] * sa, nz = n1[2] * ca + n2[2] * sa;
                P.push(x + nx * look.r, yy + ny * look.r, nz * look.r); N3.push(nx, ny, nz); T.push(k / N * L * 2, s / seg);
                if (moving) { J.push(1 + j0, 1 + j1, 0, 0); W.push(1 - f, f, 0, 0); } else { J.push(0, 0, 0, 0); W.push(1, 0, 0, 0); }
            }
            void t;
        }
        for (let k = 0; k < N; k++) for (let s = 0; s < seg; s++) { const a = k * (seg + 1) + s, b = a + seg + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
        const spanPart = { name: 'Span', kind: r.span.type === 'rope' ? 'prop' : 'metal', positions: Float32Array.from(P), normals: Float32Array.from(N3), uvs: Float32Array.from(T), index: Uint32Array.from(I), joints: Uint16Array.from(J), weights: Float32Array.from(W), color: r.span.color, roughness: look.roughness, metalness: look.metalness, moves: moving };
        parts.push(spanPart);

        // The ends: wall brackets, posts on the floor, or a ring set in each wall.
        const ends = [];
        for (const side of [-1, 1]) {
            const x = side * L / 2;
            if (r.span.mounts === 'posts') {
                ends.push(Mesh.lathe([[0.075, 0], [0.075, 0.06], [0.055, 0.08], [0.05, H + 0.12], [0.06, H + 0.14], [0.04, H + 0.2], [0, H + 0.22]], 10, { base: [x, 0, 0], sharp: 0.6 }));
            } else if (r.span.mounts === 'brackets') {
                ends.push(Mesh.box([x + side * 0.01, H, 0], [0.02, 0.26, 0.12]), Mesh.tube([x + side * 0.01, H - 0.08, 0], [x - side * 0.1, H, 0], 0.012, 0.012, 6), Mesh.sphere([x - side * 0.1, H, 0], 0.02, 8));
            } else ends.push(Mesh.lathe([[0.03, 0], [0.03, 0.01], [0.012, 0.01], [0.012, 0.03], [0, 0.03]], 8, { base: [x, H, 0], dir: [-side, 0, 0] }));
        }
        parts.push(rigid(Object.assign(Mesh.merge(ends), { name: 'Mounts', kind: r.span.mounts === 'posts' ? 'prop' : 'metal', color: r.span.mounts === 'posts' ? '#5a3d24' : '#2a2a2e', roughness: r.span.mounts === 'posts' ? 0.8 : 0.45, metalness: r.span.mounts === 'posts' ? 0 : 0.7 })));

        // The banners: a cloth each, pinned along its top to the span, with its share of the bones.
        const xs = centers(r), count = xs.length, perBones = Math.max(4, Math.floor(96 / count)), particles = Math.max(25, Math.min(300, Math.round(900 / count)));
        const fabric = Cloth.FABRICS[r.fabric], cloths = [], groups = new Map();
        const palette = r.design.field.colors.slice(0, Math.max(2, Math.min(5, (Design.LAYOUT_BY_ID.get(r.design.field.layout).regions || []).length || 2)));
        let offset = ropeK;
        xs.forEach((cx, i) => {
            const w = r.banners.width, len = r.banners.shared || bunting ? r.banners.length : r.banners.lengths[i];
            const s = Math.sqrt(w * len / particles), nx = odd(w / s + 1, bunting ? 5 : 5, 31), ny = odd(len / s + 1, 5, 41);
            const rest = new Float32Array(nx * ny * 3), pinned = new Uint8Array(nx * ny);
            const pointed = bunting || r.banners.shape === 'pointed';
            for (let j = 0; j < ny; j++) for (let k = 0; k < nx; k++) {
                const v = j / (ny - 1);
                let x = cx + (k / (nx - 1) - 0.5) * w;
                const top = y(x) - look.r - 0.005;
                // Pointed: a pennant narrows from its top to its point; a banner from two thirds down.
                if (bunting) x = cx + (x - cx) * (1 - 0.95 * v);
                else if (pointed && v > 0.7) x = cx + (x - cx) * (1 - 0.94 * (v - 0.7) / 0.3);
                const p = (j * nx + k) * 3;
                rest[p] = x; rest[p + 1] = top - v * len; rest[p + 2] = 0;
                if (j === 0) pinned[j * nx + k] = 1;
            }
            const holes = new Uint8Array((nx - 1) * (ny - 1));
            if (r.banners.shape === 'swallowtail') {
                const d = Math.min(0.3 * len, w) / len;
                for (let j = 0; j + 1 < ny; j++) for (let k = 0; k + 1 < nx; k++) { const u = (k + 0.5) / (nx - 1), v = (j + 0.5) / (ny - 1); if (v > 1 - d * (1 - Math.abs(u - 0.5) * 2)) holes[j * (nx - 1) + k] = 1; }
            }
            const grid = Cloth.boneGrid(nx, ny, perBones, 'across');
            const amp = swing(r, cx);
            const setup = {
                nx, ny, rest, pinned, area: w * len * (pointed && bunting ? 0.5 : 1), fabric, holes, colliders: [],
                wind: { speed: Flag.windSpeed(r.wind.strength), gust: r.wind.gust, angle: Math.PI / 2, loop: Flag.LOOP, seed: r.seed + i * 7, length: len },
                sway: amp ? { amp: [0, amp * 0.12, amp], phase: 0 } : null
            };
            cloths.push({ setup, grid, offset });
            let b = 0;
            for (const jj of grid.bj) for (const ii of grid.bi) {
                const p = (jj * nx + ii) * 3, head = [rest[p], rest[p + 1], rest[p + 2]];
                bones.push({ name: `Banner${i}_${ii}_${jj}`, head, parent: 0 }); restBones.push(...head); b++;
            }
            // Banners sharing a picture are one mesh.
            const which = bunting ? 'bunting' : r.banners.alternate && i % 2 ? 'b' : 'a';
            if (!groups.has(which)) groups.set(which, []);
            groups.get(which).push({ i, nx, ny, rest, grid, offset, w, len, tint: bunting && r.banners.alternate ? palette[i % palette.length] : null });
            offset += grid.count;
        });

        // Their pictures: each design painted as a hung banner's (its foot cut as it is), one weave for all.
        const size = o.textureSize ? Math.min(512, o.textureSize) : 512, first = groups.values().next().value[0];
        const banner = (design, w, len) => ({ cloth: { width: w, height: len, fabric: r.fabric, wear: 0, cut: r.banners.shape === 'swallowtail' ? 'swallowtail' : 'straight' }, pole: { type: 'crossbar' }, design, seed: r.seed });
        const textures = {};
        const paint = (name, design) => {
            const key = JSON.stringify([design, r.fabric, r.banners.shape, first.w, first.len, size, Design.pictures(design).map(n => images[n] ? [n, images[n].width, images[n].version || 0] : n)]);
            if (!c.pictures) c.pictures = {};
            if (!c.pictures[name] || c.pictures[name].key !== key) c.pictures[name] = { key, tex: Flag.paintCloth(banner(design, first.w, first.len), size, images) };
            const tex = Object.assign({}, c.pictures[name].tex, { name });
            textures[name] = tex;
        };
        if (!c.normal || c.normalKey !== r.fabric + first.w + first.len) { c.normal = Flag.paintNormal(banner(r.design, first.w, first.len), 256); c.normalKey = r.fabric + first.w + first.len; }
        textures['banner_normal.png'] = Object.assign({}, c.normal, { name: 'banner_normal.png' });
        const white = Design.normalize({ field: { layout: 'solid', colors: ['#f4f1ea'] }, layers: [] });
        for (const [which, list] of groups) {
            const tex = which === 'b' ? 'banner_b.png' : 'banner_a.png';
            paint(tex, which === 'b' ? r.design2 : bunting && r.banners.alternate ? white : r.design);
            const P = [], NN = [], UV = [], I2 = [], J2 = [], W2 = [], C2 = [];
            for (const g of list) {
                const base = P.length / 3;
                for (let j = 0; j < g.ny; j++) for (let k = 0; k < g.nx; k++) {
                    const p = (j * g.nx + k) * 3, v = j * g.nx + k;
                    P.push(g.rest[p], g.rest[p + 1], g.rest[p + 2]); NN.push(0, 0, 1); UV.push(k / (g.nx - 1), j / (g.ny - 1));
                    for (let q = 0; q < 4; q++) { J2.push(g.grid.joints[v * 4 + q] + 1 + g.offset); W2.push(g.grid.weights[v * 4 + q]); }
                    if (g.tint) { const t = g.tint, n = parseInt(t.slice(1), 16), lin = cc => Math.pow(cc / 255, 2.2); C2.push(lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)); }
                }
                for (let j = 0; j + 1 < g.ny; j++) for (let k = 0; k + 1 < g.nx; k++) { const a = base + j * g.nx + k, b = a + 1, cc = a + g.nx, d = cc + 1; I2.push(a, cc, b, b, cc, d); }
            }
            const part = {
                name: list.length > 1 ? 'Banners' : 'Banner', kind: 'cloth', positions: Float32Array.from(P), normals: Float32Array.from(NN), uvs: Float32Array.from(UV), index: Uint32Array.from(I2),
                joints: Uint16Array.from(J2), weights: Float32Array.from(W2), texture: tex, normalTexture: 'banner_normal.png', normalScale: 0.35, roughness: r.fabric === 'silk' ? 0.42 : 0.9, metalness: 0, doubleSided: true, moves: true
            };
            if (C2.length) { part.colors = Float32Array.from(C2); part.keepColors = true; }
            if (r.banners.shape === 'swallowtail') { part.cutout = true; part.alphaCutoff = 0.5; }
            parts.push(part);
        }
        // The pole, mounts and posts keep their form in their colors (still parts); a moving rope does not.
        for (const p of parts) if (!p.moves) Mesh.shade(p);

        const rope = moving ? {
            offset: 0,
            /** The rope's bones at time t (world places), as the banners' pinned tops move. */
            at(t) {
                const out = new Float32Array(ropeK * 3), w = Math.sin(2 * Math.PI * t / Flag.LOOP);
                for (let k = 0; k < ropeK; k++) { const a = swing(r, ropeX[k]); out[k * 3] = ropeX[k]; out[k * 3 + 1] = y(ropeX[k]) + a * 0.12 * Math.abs(w); out[k * 3 + 2] = a * w; }
                return out;
            },
            tracks(times) {
                const T = Array.from({ length: ropeK }, () => new Float32Array(times.length * 3));
                for (let f = 0; f < times.length; f++) { const at = this.at(times[f]); for (let k = 0; k < ropeK; k++) T[k].set(at.subarray(k * 3, k * 3 + 3), f * 3); }
                // The closing key is the opening one exactly.
                for (const t of T) t.set(t.subarray(0, 3), (times.length - 1) * 3);
                return { T };
            }
        } : null;
        const clips = o.loop ? [Flag.waveClip(o.loop)] : [];
        let tall = 0, missing = '';
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) tall = Math.max(tall, p.positions[i]);
        for (const n of Design.pictures(r.design).concat(r.banners.alternate ? Design.pictures(r.design2) : [])) if (!images[n]) { missing = n; break; }
        const placeSize = Math.round(Math.max(L + 0.2, tall) * 100) / 100;
        return {
            kind: 'span', recipe: r, parts, bones, clips, loop: o.loop || null, textures, cloths, rope, restBones: Float32Array.from(restBones),
            height: tall, placeSize, walls: r.span.mounts === 'posts' ? null : [{ normal: [1, 0, 0], at: -L / 2 }, { normal: [-1, 0, 0], at: L / 2 }],
            sidecarExtra: { span: { tiles: L, axis: 'x', origin: 'center', placeSize } },
            imageName: missing, imageMissing: !!missing
        };
    }

    /**
     * Random hanging banners: 'shape' the line (what it hangs from, how long,
     * how high, its sag and ends) and the banners' shape, count and size;
     * 'details' (Design) two new designs; 'colors' the designs recolored and the line's color.
     */
    function random(seed, recipe, scope) {
        const R = Rand.roll(seed), r = normalize(recipe), has = part => Rand.covers(scope, part);
        if (has('shape')) {
            const type = R.weighted([['rope', 3], ['wire', 1], ['rod', 1], ['pole', 1]]), shape = R.weighted([['swallowtail', 2], ['rectangle', 2], ['pointed', 1.5], ['bunting', 1.5]]);
            const length = Math.round(R.range(2, 6) * 2) / 2, bunting = shape === 'bunting';
            r.span = Object.assign(r.span, { type, length, height: R.range(2.2, 4), mounts: R.weighted([['brackets', 3], ['posts', 1.5], ['none', 1]]), sag: type === 'rope' || type === 'wire' ? R.range(0.15, 0.6) : r.span.sag });
            const width = bunting ? R.range(0.2, 0.35) : R.range(0.35, 0.8);
            r.banners = Object.assign(r.banners, {
                shape, width, shared: true, spacing: 'even', positions: [], lengths: [],
                count: bunting ? Math.min(MAX_BUNTING, Math.round(length / (width * 1.15))) : Math.max(1, Math.min(MAX, Math.floor(length / (width * 1.6)), R.int(2, 5))),
                length: bunting ? width * R.range(1, 1.4) : Math.min(r.span.height - 0.6, R.range(0.8, 1.8))
            });
        }
        if (has('details')) {
            r.design = Flag.randomDesign(R.int(1, 1e9), { kind: 'flag' }).design;
            r.design2 = Flag.randomDesign(R.int(1, 1e9), { kind: 'flag', design: { field: { layout: 'solid', colors: r.design.field.colors.slice().reverse() } } }).design;
            r.design2.field.colors = r.design.field.colors.slice().reverse();
            r.banners.alternate = R.chance(0.5);
        }
        if (has('colors')) {
            if (!has('details')) {
                const palette = R.pick(Flag.PALETTE_SETS), map = new Map(), swap = c => { if (!map.has(c)) map.set(c, palette[map.size % palette.length]); return map.get(c); };
                for (const key of ['design', 'design2']) { r[key].field.colors = r[key].field.colors.map(swap); r[key].layers = r[key].layers.map(l => Object.assign({}, l, { color: swap(l.color) })); }
            }
            r.span.color = r.span.type === 'pole' ? R.pick(['#6e4a2c', '#5a3a22', '#8a5a32']) : r.span.type === 'rope' ? R.pick(['#b39a6a', '#c8b48a', '#8a7a5a']) : R.pick(['#2a2a2e', '#3a3a3e', '#c3c7cc']);
        }
        r.seed = seed >>> 0 || 1;
        return normalize(r);
    }

    const api = { SPANS, MOUNTS, SHAPES, DEFAULT, MAX, MAX_BUNTING, normalize, curve, centers, swing, build, random };
    root.RRSpanProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel, Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'span', label: 'Hanging banners', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.design, Rand.SCOPES.colors] });
    // The page: the span, its banners, their designs (the second for every other banner), the breeze.
    if (Catalog) Catalog.ui('span', {
        placeholder: 'Hanging banners',
        tabs: [['span', 'Span'], ['banners', 'Banners'], ['design', 'Design'], ['wind', 'Wind']],
        reset: () => normalize({}),
        moves: () => true,
        panel(tab) {
            const r = this.recipe, rope = r.span.type === 'rope' || r.span.type === 'wire';
            if (tab === 'span') {
                return this._section('Span') + this._select('span.type', 'Hung from', SPANS)
                    + this._slider({ path: 'span.length', label: 'Length', range: [1, 8], step: 0.1, format: 'tiles' })
                    + this._slider({ path: 'span.height', label: 'Height', range: [1, 6], step: 0.05, format: 'tiles' })
                    + (rope ? this._slider({ path: 'span.sag', label: 'Sag', range: [0.02, 1], step: 0.01, format: 'tiles' }) : '')
                    + this._select('span.mounts', 'Ends on', MOUNTS) + this._color('span.color', 'Color', ['#6e4a2c', '#2a2a2e', '#b39a6a', '#c3c7cc']);
            }
            if (tab === 'banners') {
                const b = r.banners, bunting = b.shape === 'bunting';
                let html = this._section('Banners') + this._tiles('span-shape', SHAPES.map(([id, label]) => ({ id, label })), b.shape, 2)
                    + this._slider({ path: 'banners.count', label: bunting ? 'Pennants' : 'Banners', range: bunting ? [4, MAX_BUNTING] : [1, MAX], step: 1, format: 'int' })
                    + this._slider({ path: 'banners.width', label: 'Width', range: [0.1, 2], step: 0.01, format: 'tiles' });
                if (!bunting) {
                    html += this._select('banners.spacing', 'Spacing', [['even', 'Evenly'], ['custom', 'Custom']]);
                    if (b.spacing === 'custom') for (let k = 0; k < b.count; k++) html += this._slider({ path: `banners.positions.${k}`, label: this._t('Banner {n} place', { n: k + 1 }), range: [0.02, 0.98] });
                    html += this._check('banners.shared', 'Same length');
                }
                if (b.shared || bunting) html += this._slider({ path: 'banners.length', label: 'Length', range: [0.15, 4], step: 0.05, format: 'tiles' });
                else for (let k = 0; k < b.count; k++) html += this._slider({ path: `banners.lengths.${k}`, label: this._t('Banner {n} length', { n: k + 1 }), range: [0.15, 4], step: 0.05, format: 'tiles' });
                html += this._check('banners.alternate', bunting ? 'Colors in turn' : 'Every other banner its own design')
                    + this._select('fabric', 'Fabric', [['cotton', 'Cotton bunting'], ['silk', 'Silk'], ['wool', 'Heavy wool']]);
                return html;
            }
            if (tab === 'design') {
                const second = r.banners.alternate && r.banners.shape !== 'bunting';
                const path = second && this.spanDesign === 'design2' ? 'design2' : 'design';
                const pickWhich = second ? `<div class="rr-prop-which"><button class="rr-btn-chip${path === 'design' ? ' is-active' : ''}" data-act="span-design" data-id="design">${this._t('First design')}</button><button class="rr-btn-chip${path === 'design2' ? ' is-active' : ''}" data-act="span-design" data-id="design2">${this._t('Second design')}</button></div>` : '';
                return pickWhich + this._designPanel(path);
            }
            return this._section('Wind') + this._slider({ path: 'wind.strength', label: 'Strength', range: [0, 0.6], format: 'wind', ends: ['Still', 'Breezy'] })
                + this._slider({ path: 'wind.gust', label: 'Gusts', range: [0, 1], ends: ['Steady', 'Gusty'] });
        },
        act(act, b) {
            if (this._designAct(act, b)) return;
            const r = JSON.parse(JSON.stringify(this.recipe));
            if (act === 'span-shape') {
                const was = r.banners.shape === 'bunting', now = b.dataset.id === 'bunting';
                r.banners.shape = b.dataset.id;
                // Bunting starts as a string of small pennants; banners as a few long ones.
                if (was !== now) Object.assign(r.banners, now ? { count: 12, width: 0.28, length: 0.35 } : { count: 3, width: 0.55, length: 1.3 });
                this._replace(r); return;
            }
            if (act === 'span-design') { this.spanDesign = b.dataset.id; this.layer = 0; this._renderPanel(); }
        }
    });
    if (Catalog) Catalog.add({ id: 'span', category: 'banners', label: 'Hanging banners', icon: 'hanging', kind: 'span', keywords: 'alley street rope bunting festival across', start: () => normalize({}), matches: () => true });
})(typeof window !== 'undefined' ? window : globalThis);
