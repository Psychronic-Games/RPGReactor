/**
 * RRCreatureReptiles - snakes, lizards, geckos and frogs for the Character
 * Builder's non-humanoid bodies (the 'reptile' form of RRCreatureForms).
 *
 * Each body is one lofted skin swept along its spine: at every station a
 * cross-section whose top and bottom halves are superellipses of their own
 * (a snake's flat belly, a frog's rounded back), so head, neck, trunk and
 * tail are one closed surface with no seams to hide. Limbs are lofted tubes
 * from inside the trunk; toes and toe pads are their own small lofts. Every
 * skin carries two sets of coordinates: the first runs once around and once
 * along the animal and holds its painted pattern (blotches, diamonds, bands,
 * spots); the second repeats a tile of scales (or warts, or smooth moist skin)
 * whose rows follow the local girth, so scales grow smaller toward the head
 * and the tail tip as a real snake's do. The tile's normal map and its
 * occlusion and roughness map ride that second set.
 *
 * Motions are the animals' own: a snake's travelling wave (serpentine
 * slither), a lizard's sprawling walk (the spine bends side to side while
 * diagonal legs swing together), a frog's hop (hind legs unfold, the body
 * leaves the ground and lands folded again).
 *
 * Frame: y up, facing +z, the creature's left at +x, meters. No DOM, no three.js.
 */
(function(root) {
    'use strict';
    const Props = root.RRCharacterProps || (typeof require === 'function' ? require('./CharacterProps.js') : null);
    const { add, sub, mul, dot, cross, norm, lerp } = Props.vec;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const rgb = hex => { const n = parseInt(String(hex).slice(1), 16); return [16, 8, 0].map(k => { const c = (n >> k & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); };
    const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    const fract = x => x - Math.floor(x);
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    const vnoise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, s = u * u * (3 - 2 * u), t = v * v * (3 - 2 * v);
        return (hash(i, j) * (1 - s) + hash(i + 1, j) * s) * (1 - t) + (hash(i, j + 1) * (1 - s) + hash(i + 1, j + 1) * s) * t; };
    const fbm = (x, y) => vnoise(x, y) * .5 + vnoise(x * 2.03 + 5, y * 2.03) * .3 + vnoise(x * 4.1 + 9, y * 4.1) * .2;
    const se = (c, n) => Math.sign(c) * Math.abs(c) ** (2 / n);

    // ── kinds, types and palettes ─────────────────────────────────────────
    const GROUP = 'Reptiles and amphibians';
    const kind = (id, label, over, colors) => ({ kind: id, label, group: GROUP, form: 'reptile',
        over: { morphology: 'reptile', bodyLength: 1, girth: 1, chestDepth: 1, headSize: 1, eyeSize: 1, snoutLength: 1, tailLength: 1, tailThickness: 1, legLength: 1,
            ears: 'none', mane: 'none', wings: 'none', horns: 'none', fluff: 0, spines: 0, pattern: 'countershade', eyeCount: 2, ...over },
        colors: { nose: '#1a1612', ...colors } });
    const KINDS = [
        kind('snake', 'Snake', { size: 0.62, snakeType: 'python' }, { coat: '#8a6d45', light: '#e3d6b0', marking: '#3d2c1c', eye: '#a8823e' }),
        kind('lizard', 'Lizard', { size: 0.13, lizardType: 'greenLizard' }, { coat: '#5f8a3a', light: '#d8dca0', marking: '#2d4520', eye: '#a8742c' }),
        kind('gecko', 'Gecko', { size: 0.14, geckoType: 'tokay' }, { coat: '#8aa0b4', light: '#e8e0d4', marking: '#e07a3a', eye: '#d8a838' }),
        kind('frog', 'Frog', { size: 0.07, frogType: 'treeFrog' }, { coat: '#4fae3c', light: '#f0ead0', marking: '#23402a', eye: '#d84a1c' })
    ];
    const TYPES = {
        snakeType: { form: 'reptile', label: 'Snake type', kind: 'snake', choices: [['python', 'Python'], ['viper', 'Viper'], ['coral', 'Coral snake'], ['treeSnake', 'Green tree snake'], ['cobra', 'Cobra']] },
        lizardType: { form: 'reptile', label: 'Lizard type', kind: 'lizard', choices: [['greenLizard', 'Green lizard'], ['monitor', 'Monitor'], ['desert', 'Desert lizard']] },
        geckoType: { form: 'reptile', label: 'Gecko type', kind: 'gecko', choices: [['tokay', 'Tokay gecko'], ['leopard', 'Leopard gecko'], ['dayGecko', 'Day gecko']] },
        frogType: { form: 'reptile', label: 'Frog type', kind: 'frog', choices: [['treeFrog', 'Tree frog'], ['poisonDart', 'Poison dart frog'], ['toad', 'Toad']] }
    };
    /** [coat, light (belly), marking]. */
    const PALETTES = {
        python: ['#8a6d45', '#e3d6b0', '#3d2c1c'], viper: ['#9c8a68', '#ddd4bc', '#2e2620'], coral: ['#c8321e', '#f0d040', '#141210'],
        treeSnake: ['#3f9a3a', '#cfe08a', '#2a6a2a'], cobra: ['#6a5634', '#d8c8a0', '#2a2218'],
        greenLizard: ['#5f8a3a', '#d8dca0', '#2d4520'], monitor: ['#5a5440', '#c8bc94', '#262218'], desert: ['#c8a878', '#efe4cc', '#7a5636'],
        leopard: ['#e3c25c', '#f3ead2', '#3b2c24'], tokay: ['#8aa0b4', '#e8e0d4', '#e07a3a'], dayGecko: ['#3fbf4a', '#eaf0c0', '#d83a22'],
        treeFrog: ['#4fae3c', '#f0ead0', '#23402a'], poisonDart: ['#2a6ad8', '#1a2a5a', '#0e1018'], toad: ['#8a7048', '#d8c8a0', '#4a3824']
    };
    /** What a type is beyond its colors: eye color, pupil, sizes. */
    const TYPE_EYE = { python: '#a8823e', viper: '#c09038', coral: '#1a1614', treeSnake: '#c8b030', cobra: '#2a1e14', greenLizard: '#a8742c', monitor: '#6a4a24', desert: '#8a5a2a',
        leopard: '#c2b8a0', tokay: '#d8a838', dayGecko: '#c8a030', treeFrog: '#d84a1c', poisonDart: '#101012', toad: '#c89a3a' };
    const TYPE_SIZE = { python: 0.62, viper: 0.34, coral: 0.28, treeSnake: 0.42, cobra: 0.6, greenLizard: 0.13, monitor: 0.55, desert: 0.1, leopard: 0.12, tokay: 0.14, dayGecko: 0.1, treeFrog: 0.07, poisonDart: 0.045, toad: 0.1 };
    const typeOf = r => r.kind === 'snake' ? r.snakeType : r.kind === 'lizard' ? r.lizardType : r.kind === 'gecko' ? r.geckoType : r.frogType;
    const handles = k => KINDS.some(x => x.kind === k);
    /** A type brings its colors, eye and grown size. */
    function withVariant(r, key, value) {
        const def = TYPES[key];
        if (!def || def.kind !== r.kind || !def.choices.some(([id]) => id === value)) return r;
        const p = PALETTES[value];
        return { ...r, [key]: value, size: TYPE_SIZE[value] || r.size, colors: { ...r.colors, coat: p[0], light: p[1], marking: p[2], eye: TYPE_EYE[value] || r.colors.eye } };
    }

    // ── the lofted skin ───────────────────────────────────────────────────
    /**
     * A closed skin through `stations` (snout to tail): each { p center, f forward, w half-width,
     * top, bot heights, nt, nb superellipse exponents, s meters along, crease?(a) inward pull }.
     * `sides` around; returns the mesh rows so callers can find vertices. UV0: once around and along;
     * UV1: the tile of scales, rows following the girth.
     */
    function skinLoft(stations, sides, skinOf, opts = {}) {
        const m = new Props.ExactMesh(), uv0 = [], uv1 = [], rows = [];
        const total = stations.at(-1).s - stations[0].s || 1, around = opts.scalesAround || 1;
        let v1 = 0, prevRing = null, prevR = 0;
        for (let r = 0; r < stations.length; r++) {
            const S = stations[r];
            const X = norm(cross([0, 1, 0], S.f)), Y = cross(S.f, X), row = [], ring = [];
            // The ring starts and ends under the belly (the seam where few will look), and its tile coordinate
            // runs by arc length: a ring smaller than `minCirc` (a snout, a tail tip) shows fewer scales of the same
            // size instead of the whole ring's scales shrunk into concentric bands.
            for (let k = 0; k <= sides; k++) {
                const a = Math.PI * 1.5 + k / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
                const n = s >= 0 ? S.nt : S.nb, pull = S.crease ? S.crease(a) : 0;
                const x = se(c, n) * S.w * (1 - pull) * (s < 0 && S.lowerInset ? 1 - S.lowerInset : 1), y = se(s, n) * (s >= 0 ? S.top : S.bot) * (1 - pull * .6);
                const p = add(add(S.p, mul(X, x)), mul(Y, y));
                row.push(m.vertex(p, norm(add(mul(X, c), mul(Y, s))), [1, 1, 1], skinOf(S, a, p))); ring.push(p);
                uv0.push(.75 + k / sides, (S.s - stations[0].s) / total);
            }
            const arc = [0]; for (let k = 1; k <= sides; k++) arc.push(arc[k - 1] + Math.hypot(...sub(ring[k], ring[k - 1])));
            const R = Math.max(arc[sides], opts.minCirc || 0);
            // Rows advance by the distance over the surface (at a snout tip the surface turns across the axis, and
            // the distance along the axis alone would stretch the scales into radial streaks).
            if (prevRing) { let d = 0; for (let k = 0; k < sides; k++) d += Math.hypot(...sub(ring[k], prevRing[k])); d /= sides; v1 += d / Math.max(1e-6, (R + prevR) / 2 / around * (opts.rowAspect || 1)); }
            prevRing = ring; prevR = R;
            for (let k = 0; k <= sides; k++) uv1.push(.25 + (arc[k] - arc[sides] / 2) / R, v1 / (opts.rowsPerTile || 8));
            rows.push(row);
        }
        for (let r = 0; r + 1 < rows.length; r++) for (let k = 0; k < sides; k++) {
            const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k], d = rows[r + 1][k + 1];
            m.tri(a, b, c); m.tri(b, d, c);
        }
        // Tips: one vertex ahead of the first ring and one behind the last.
        for (const [row, S, sign, uvv] of [[rows[0], stations[0], 1, 0], [rows.at(-1), stations.at(-1), -1, 1]]) {
            const tipAt = add(S.p, mul(S.f, sign * (sign > 0 ? S.s : opts.tip ? opts.tip(sign) : Math.min(S.w, S.top) * .5)));
            const t = m.vertex(tipAt, mul(S.f, sign), [1, 1, 1], skinOf(S, 0, tipAt));
            uv0.push(1.25, uvv); uv1.push(.25, sign > 0 ? 0 : v1 / (opts.rowsPerTile || 8));
            for (let k = 0; k < sides; k++) sign > 0 ? m.tri(t, row[k + 1], row[k]) : m.tri(t, row[k], row[k + 1]);
        }
        orient(m);
        m.computeNormals();
        // The seam column shares its normal with the first.
        for (const row of rows) { const a = row[0] * 3, b = row[sides] * 3; for (let k = 0; k < 3; k++) { const v = (m.n[a + k] + m.n[b + k]) / 2; m.n[a + k] = m.n[b + k] = v; } const l = Math.hypot(m.n[a], m.n[a + 1], m.n[a + 2]) || 1; for (let k = 0; k < 3; k++) m.n[a + k] = m.n[b + k] = m.n[a + k] / l; }
        m.uv0 = uv0; m.uv1 = uv1; m.rows = rows;
        return m;
    }
    /** Wind the whole mesh outward (positive enclosed volume). */
    function orient(m) {
        const P = m.p, at = v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
        let vol = 0; for (let t = 0; t < m.i.length; t += 3) vol += dot(at(m.i[t]), cross(at(m.i[t + 1]), at(m.i[t + 2])));
        if (vol < 0) for (let t = 0; t < m.i.length; t += 3) { const v = m.i[t + 1]; m.i[t + 1] = m.i[t + 2]; m.i[t + 2] = v; }
    }
    /** A limb or toe: tube through points with per-point radii, its own UVs (around, along). */
    function limbTube(m, points, radii, sides, skin) {
        const first = m.p.length / 3;
        const rows = m.tube(points, radii, sides, [1, 1, 1], skin, true);
        // Loft order: every row of `sides` vertices, then two cap centers.
        const n = points.length, uv0 = m.uv0 || (m.uv0 = []), uv1 = m.uv1 || (m.uv1 = []);
        while (uv0.length / 2 < first) { uv0.push(0, 0); uv1.push(0, 0); }
        let along = 0; const lens = [0];
        for (let i = 1; i < n; i++) { along += Math.hypot(...sub(points[i], points[i - 1])); lens.push(along); }
        for (let i = 0; i < n; i++) for (let k = 0; k < sides; k++) { uv0.push(k / sides, .98); const circ = 2 * Math.PI * (Array.isArray(radii) ? radii[i] : radii); uv1.push(k / sides * 6, lens[i] / Math.max(1e-5, circ / 6)); }
        uv0.push(.5, .98, .5, .98); uv1.push(0, 0, 3, lens[n - 1]);
        return rows;
    }

    // ── skin pictures ─────────────────────────────────────────────────────
    const tileCache = new Map();
    /**
     * The repeating tile: `kind` 'snake' (overlapping keeled dorsal scales, broad belly scutes at u 0.75),
     * 'lizard' (small granular and keeled scales), 'gecko' (granules with raised tubercles), 'frog'
     * (smooth with faint pores), 'toad' (warts). Returns { normal, material } pictures; material is
     * occlusion (red), roughness (green), metal (blue).
     */
    function tilePictures(kind, size, around) {
        const key = kind + size + ':' + around;
        if (tileCache.has(key)) return tileCache.get(key);
        const H = new Float32Array(size * size), R = new Float32Array(size * size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = x / size, v = y / size;
            let h = 0, rough = .55;
            if (kind === 'snake' || kind === 'lizard') {
                // Rows along v; scales across u (`around` per tile), alternate rows offset half a scale.
                const rowsPer = kind === 'snake' ? 8 : 12, cols = kind === 'snake' ? around : around * 1.4;
                const ry = v * rowsPer, row = Math.floor(ry), fy = ry - row, fx = fract(u * cols + (row % 2) * .5);
                const belly = kind === 'snake' ? ease(.115, .075, Math.abs(u - .75)) : 0;
                // Overlapping scales: each a rounded kite larger than its cell, the one further back (later row)
                // lying over the one in front, so every scale shows a free rounded rear edge and a dark crevice.
                let scale = 0, keel = 0;
                for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 1; dc++) {
                    const rr = row + dr, cx = Math.floor(u * cols + (((rr % 2) + 2) % 2) * .5) + dc + .5 - (((rr % 2) + 2) % 2) * .5;
                    const ex = (u * cols - cx) / .62, ey = (ry - rr - .62) / .78;
                    const d = ex * ex + ey * ey + Math.abs(ex) * Math.max(0, ey) * .5;
                    if (d < 1) { const hh = (1 - d) ** .45 * (.7 + .3 * clamp(.5 - ey * .5, 0, 1)); if (hh > scale) { scale = hh; keel = kind === 'snake' ? Math.exp(-((ex / .12) ** 2)) * .06 * (1 - d) : Math.exp(-((ex / .16) ** 2)) * .15 * (1 - d); } }
                }
                const scute = Math.min(1, fract(v * rowsPer / 2) * 6) * (1 - fract(v * rowsPer / 2) ** 4) * .9;
                h = scale + keel;
                h = Math.max(h * (1 - belly), scute * belly * .95) * (1 - .25 * belly * (1 - belly) * 4);
                rough = .5 + .18 * (1 - h);
            } else if (kind === 'gecko') {
                const g = 30, gx = fract(u * g + Math.floor(v * g) % 2 * .5), gy = fract(v * g);
                h = Math.max(0, 1 - ((gx - .5) ** 2 + (gy - .5) ** 2) * 4.4) ** .7 * .6;
                const t = 7, tx = fract(u * t + Math.floor(v * t) % 2 * .5) - .5, ty = fract(v * t) - .5, d = Math.hypot(tx, ty);
                h = Math.max(h, Math.max(0, 1 - (d / .2) ** 2) * 1.1);
                rough = .62;
            } else if (kind === 'toad') {
                const w = 9, wx = u * w, wy = v * w; let best = 9;
                for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const cx = Math.floor(wx) + i, cy = Math.floor(wy) + j, px = cx + .2 + .6 * hash(cx % w, cy % w), py = cy + .2 + .6 * hash(cy % w + 7, cx % w); best = Math.min(best, Math.hypot(wx - px, wy - py) / (.22 + .2 * hash(cx % w + 3, cy % w))); }
                h = Math.max(0, 1 - best * best) ** .8 + fbm(u * 24, v * 24) * .15;
                rough = .62 - h * .1;
            } else {
                // Smooth moist skin: faint pores and a soft undulation.
                h = fbm(u * 16, v * 16) * .25 - Math.max(0, .12 - Math.hypot(fract(u * 40) - .5, fract(v * 40) - .5)) * 2;
                rough = .22;
            }
            H[y * size + x] = h; R[y * size + x] = rough;
        }
        const normal = new Uint8Array(size * size * 4), material = new Uint8Array(size * size * 4);
        const strength = kind === 'frog' ? 1.2 : kind === 'toad' ? 3 : 4;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const at = (i, j) => H[((j + size) % size) * size + ((i + size) % size)];
            const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
            const n = norm([-dx, -dy, 1]), o = (y * size + x) * 4, h = at(x, y);
            normal.set([Math.round(127.5 + n[0] * 127.5), Math.round(127.5 + n[1] * 127.5), Math.round(127.5 + n[2] * 127.5), 255], o);
            material.set([Math.round(255 * clamp(.55 + h * .45, 0, 1)), Math.round(255 * R[y * size + x]), 0, 255], o);
        }
        const out = { normal: { width: size, height: size, data: normal, repeat: true }, material: { width: size, height: size, data: material, repeat: true } };
        if (tileCache.size > 8) tileCache.delete(tileCache.keys().next().value);
        tileCache.set(key, out); return out;
    }
    /** The pattern picture over UV0 (u once around from the left flank, top at 0.25, belly at 0.75; v snout to tail). */
    function patternPicture(size, paint) {
        const data = new Uint8Array(size * size * 4);
        const enc = c => Math.round(255 * clamp(c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055, 0, 1));
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const c = paint((x + .5) / size, (y + .5) / size), o = (y * size + x) * 4;
            data[o] = enc(c[0]); data[o + 1] = enc(c[1]); data[o + 2] = enc(c[2]); data[o + 3] = 255;
        }
        return { width: size, height: size, data, repeat: true };
    }

    // ── eyes ──────────────────────────────────────────────────────────────
    /** A wet globe, painted by direction: iris, pupil ('slit' upright, 'round', 'bar' across), a dark rim. */
    function eyeball(C, name, center, radius, facing, pupil, iris, bone, opts = {}) {
        const m = new Props.ExactMesh(), f = norm(facing), up0 = sub([0, 1, 0], mul(f, f[1])), up = norm(up0), right = cross(up, f);
        const dark = [.008, .008, .01], rim = mix(iris, dark, .55);
        m.sphere(center, radius, (t, a, q) => {
            const d = sub(q, center), front = dot(d, f) / radius, x = dot(d, right) / radius, y = dot(d, up) / radius;
            if (front < .05) return opts.back || dark;
            const rr = Math.hypot(x, y);
            const inPupil = pupil === 'slit' ? Math.abs(x) < .11 * Math.sqrt(Math.max(0, 1 - (y / .62) ** 2)) && front > .5
                : pupil === 'bar' ? Math.abs(y) < .16 * Math.sqrt(Math.max(0, 1 - (x / .62) ** 2)) && front > .5 : rr < (opts.pupilSize || .36) && front > .5;
            if (inPupil) return dark;
            const streak = .85 + .15 * Math.sin(Math.atan2(y, x) * 23 + rr * 9) + (opts.flecks ? .25 * (hash(Math.round(x * 30), Math.round(y * 30)) - .5) : 0);
            return mix(iris.map(v => v * streak), rim, ease(.62, .95, rr) * .85);
        }, Props.rigid(bone), C.save ? 22 : 14, C.save ? 40 : 26);
        const p = m.part(name, { kind: 'eye', roughness: .06, noSurfaceDetail: true });
        C.parts.push(p); return p;
    }

    // ── bones ─────────────────────────────────────────────────────────────
    function rig(C) {
        C.bones.length = 0;
        const L = C.L;
        return (name, parent, head, tail, role, extra = {}) => { const i = C.bones.length; C.bones.push({ name, parent, head, tail, role, phase: 0, creatureForm: 'reptile', creatureSize: L, ...extra }); return i; };
    }
    /** Weights between consecutive chain bones by distance along (`at` the chain's centers in meters along). */
    function chainSkin(chain) {
        return s => {
            if (s <= chain[0].c) return Props.rigid(chain[0].b);
            for (let i = 0; i + 1 < chain.length; i++) if (s <= chain[i + 1].c) { const t = ease(0, 1, (s - chain[i].c) / (chain[i + 1].c - chain[i].c)); return { joints: [chain[i].b, chain[i + 1].b, 0, 0], weights: [1 - t, t, 0, 0] }; }
            return Props.rigid(chain.at(-1).b);
        };
    }
    /** Points along a heading curve: φ(s) yaw, e(s) pitch (up), from the snout backward. */
    function spinePath(length, n, yaw, pitch, start = [0, 0, 0]) {
        const pts = [], fwd = [], ds = length / n;
        let p = start.slice();
        for (let i = 0; i <= n; i++) {
            const s = i * ds, a = yaw(s), e = pitch(s), f = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
            pts.push(p); fwd.push(f); p = sub(p, mul(f, ds));
        }
        return { pts, fwd, ds };
    }

    /**
     * Distances along for the stations: dense and growing toward a snout tip (`refine` meters of it, `nTip`
     * rings, so the rounded tip is resolved instead of fanned from one ring), then every `ds` to the end.
     */
    function stationsAlong(total, ds, refine, nTip) {
        const out = [];
        for (let j = 1; j <= nTip; j++) out.push(refine * (j / nTip) ** 1.8);
        for (let s = Math.ceil((refine + ds * .5) / ds) * ds; s < total - ds * .25; s += ds) out.push(s);
        return out;
    }
    const nearestStation = (stations, s) => { let lo = 0, hi = stations.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (stations[m].s < s) lo = m; else hi = m; } return Math.abs(stations[lo].s - s) < Math.abs(stations[hi].s - s) ? stations[lo] : stations[hi]; };
    const pathAt = (path, s) => { const x = clamp(s / path.ds, 0, path.pts.length - 1), i = Math.min(path.pts.length - 2, Math.floor(x)), t = x - i; return { p: lerp(path.pts[i], path.pts[i + 1], t), f: norm(lerp(path.fwd[i], path.fwd[i + 1], t)) }; };

    // ── snake ─────────────────────────────────────────────────────────────
    const SNAKES = {
        // `long`: the body's length over its size's base length, for its real build (length over thickest
        // diameter: a python about 24, a viper 15, a cobra 32, a coral snake 45, a green tree snake 55); girth and
        // head stay sized by the base length. `snout`: how far back the rounded tip runs (of the head's length).
        python: { girth: .036, head: .08, headWide: 1.4, neck: .62, tail: .12, eye: .2, pupil: 'slit', nt: 2.2, nb: 3.2, pits: 'labial', taper: 1.4, long: 1.72, snout: .46 },
        viper: { girth: .045, head: .092, headWide: 1.9, neck: .48, tail: .1, eye: .24, pupil: 'slit', nt: 2.1, nb: 3, pits: 'loreal', brow: 1, taper: 1.8, long: 1.3, snout: .4 },
        coral: { girth: .0125, head: .034, headWide: 1.05, neck: .92, tail: .09, eye: .2, pupil: 'round', nt: 2, nb: 2.6, taper: 1, long: 1.12, snout: .38 },
        treeSnake: { girth: .0115, head: .04, headWide: 1.4, neck: .7, tail: .3, eye: .33, pupil: 'round', nt: 2.1, nb: 2.8, taper: 1.2, long: 1.28, snout: .45 },
        cobra: { girth: .022, head: .056, headWide: 1.15, neck: .85, tail: .16, eye: .24, pupil: 'round', nt: 2.1, nb: 2.9, hood: 1, taper: 1.2, long: 1.4, snout: .42 }
    };
    function snake(C) {
        // Body length scales the spine itself (not a stretch of the whole coil, which would squash the head).
        const r = C.r, type = SNAKES[r.snakeType] || SNAKES.python, S0 = C.L * 1.7, S = S0 * (type.long || 1) * (r.bodyLength || 1), save = C.save;
        const Rb = S0 * type.girth * r.girth, Lh = S0 * type.head * r.headSize * (.75 + .25 * r.snoutLength), Wh = Rb * type.neck * type.headWide * (.8 + .2 * r.headSize);
        const tailStart = S * (1 - type.tail * r.tailLength / (r.tailLength > 0 ? 1 : 1));
        const hoodTop = type.hood ? S0 * .3 : 0;
        // Rest: a loose S on the ground, more waves in a longer body; a cobra rears its front with the hood spread.
        // The body lies in deep S-bends (heading swinging well past side-on, so the snake sits compact, about
        // a third of its length across), straighter at the neck and the tail's tip; the neck lifts the head a little.
        const waves = 1.5 + .25 * Math.min(1, S / S0 - 1), bend = 1.75 * (type.hood ? .7 : 1);
        const yaw = s => bend * Math.sin(s / S * Math.PI * 2 * waves + .6) * ease(Lh, Lh + S0 * .12, s) * (1 - .45 * ease(S * .8, S, s)) - (type.hood ? .25 : 0);
        const pitch = s => type.hood ? 1.2 * (ease(Lh * 1.1, Lh * 1.1 + S0 * .06, s) - ease(S0 * .2, S0 * .3, s)) : .32 * (ease(Lh * .9, Lh * 1.4, s) - ease(Lh * 2, Lh * 4.5, s));
        const N = save ? 300 : 170, sides = save ? 44 : 30;
        const path = spinePath(S, N, yaw, pitch);
        // Half-width, top and bottom along the body (meters along from the snout).
        const bodyR = s => {
            const neck = Rb * type.neck, x = s / S;
            const grow = neck + (Rb - neck) * ease(Lh / S + .02, .32, x);
            const vent = 1 - (1 - .58) * ease(.62, tailStart / S, x);
            const tail = x > tailStart / S ? Math.max(0, 1 - (x - tailStart / S) / (1 - tailStart / S)) ** (1 / type.taper) : 1;
            return grow * vent * tail;
        };
        const stations = [];
        const hood = s => type.hood ? Math.exp(-(((s - Lh - S0 * .065) / (S0 * .05)) ** 4)) * ease(Lh, Lh + S0 * .02, s) : 0;
        for (const s of stationsAlong(S, path.ds, Lh * .35, save ? 18 : 12)) {
            const u = s / Lh, here = pathAt(path, s);
            let w, top, bot, nt = type.nt, nb = type.nb, crease = null, lowerInset = 0;
            const R = Math.max(Rb * .015, bodyR(s));
            if (u < 1.25) {
                // The head: a rounded snout, the widest point over the jaw joints, then the neck.
                // Snout: a rounded, slightly tapered tip (the rostral plate), the head widening behind the eyes to
                // the jaw joints, clearly wider than the neck, then narrowing quickly into the neck. In profile the
                // snout slopes down to the tip and the chin rises to meet it.
                // The snout tapers over its front part to a narrow rounded tip (never a flat, blunt front).
                const sn = type.snout || .3, tip = Math.sqrt(1 - (1 - Math.min(1, u / sn)) ** 2) * (.64 + .36 * ease(0, sn * 1.6, u)), back = ease(.9, 1.18, u);
                const shape = type.brow ? .4 + .6 * ease(0, .84, u) ** .9 : .46 + .54 * ease(0, .85, u) ** .9;
                const jaw = 1 + (type.brow ? .1 : .06) * Math.exp(-(((u - .84) / .1) ** 2));
                const hw = Wh * tip * shape * jaw, ht = Wh * (type.brow ? .5 : .56) * tip * (.6 + .4 * ease(0, .5, u)), hb = Wh * .4 * tip * (.5 + .5 * ease(0, .75, u));
                w = hw + (R - hw) * back; top = ht + (R * .95 - ht) * back; bot = hb + (R * .82 - hb) * back;
                nt = 2.25 + (type.nt - 2.25) * back; nb = 2.3 + (type.nb - 2.3) * back;
                // The lip line along the side, from the snout back under the eye to the jaw joint, and the
                // supraocular plates: a shelf over each eye (heavy on a viper), the crown flat between them.
                const lip = (1 - ease(.82, 1.0, u)) * ease(.0, .06, u), eyeU = type.brow ? .4 : .34;
                const brow = Math.exp(-(((u - eyeU) / .16) ** 2)) * (type.brow ? .11 : .06);
                // The mouth line curves up toward the front of the snout.
                const lipAt = -.04 + .32 * (1 - ease(0, .35, u));
                crease = a => { const sn = Math.sin(a), d = Math.min(Math.abs(sn - lipAt), 1), ca = Math.abs(Math.cos(a));
                    return lip * .07 * Math.exp(-((d / .09) ** 2)) - (sn > 0 ? brow * Math.exp(-(((Math.asin(Math.min(1, sn)) - .95) / .32) ** 2)) * (ca > .05 ? 1 : 0) : 0); };
                // The upper lip overhangs the lower jaw a little.
                lowerInset = .09 * (1 - back);
            } else {
                w = R * (1 + hood(s) * 1.7); top = R * .95 * (1 - hood(s) * .5); bot = R * .82 * (1 - hood(s) * .45);
            }
            // The belly rests on the ground all along (a thin neck does not float over it).
            stations.push({ p: add(here.p, [0, bot, 0]), f: here.f, s, w, top, bot, nt, nb, crease, lowerInset, R, yl: bot });
        }
        // Lay the belly on the ground (the snake lies on y = 0; a rearing cobra's front stands on its coils).
        // Bones: Hips mid-body; a chain forward to the head and back to the tail tip.
        const bone = rig(C);
        const at = s => { const st = stations.reduce((b, x) => Math.abs(x.s - s) < Math.abs(b.s - s) ? x : b); return add(pathAt(path, s).p, [0, st.yl, 0]); };
        const rootS = S * .5, nF = save ? 11 : 9, nB = save ? 12 : 9;
        const chain = [];
        const hips = bone('Hips', -1, at(rootS), at(rootS - S * .04), 'root'); chain.push({ b: hips, c: rootS });
        let parent = hips;
        const front = [Lh * .55, Lh * 1.25]; // the head bone covers the head, the first neck bone behind it
        const fwdJoints = Array.from({ length: nF }, (_, k) => rootS - (rootS - Lh * 1.05) * (k + 1) / nF);
        fwdJoints.forEach((s, k) => {
            const last = k === nF - 1, nextS = last ? 0 : fwdJoints[k + 1];
            const b = bone(last ? 'Head' : k === nF - 2 ? 'Neck' : 'Spine' + (k + 1), parent, at(s + (rootS - fwdJoints[0]) * 0), at(Math.max(0, nextS)), last ? 'head' : 'spine', { along: s });
            chain.push({ b, c: last ? Lh * .5 : (s + nextS) / 2 }); parent = b;
        });
        parent = hips;
        for (let k = 0; k < nB; k++) {
            const s0 = rootS + (S - rootS) * (k / nB) ** .9, s1 = rootS + (S - rootS) * ((k + 1) / nB) ** .9;
            const b = bone('Tail' + (k + 1), parent, at(s0), at(s1), 'tail', { along: s0 }); chain.push({ b, c: (s0 + s1) / 2 }); parent = b;
        }
        C.bones[hips].along = rootS;
        chain.sort((a, b) => a.c - b.c);
        const skinAt = chainSkin(chain), headBone = C.bones.findIndex(b => b.name === 'Head');
        const mesh = skinLoft(stations, sides, St => skinAt(St.s), { scalesAround: 16, rowAspect: .8, rowsPerTile: 8, minCirc: Math.PI * Wh * 1.1, tip: sign => sign > 0 ? Wh * .12 : Rb * .03 });
        // The pattern, painted along the snake in meters.
        const col = { main: C.colors.main, light: C.colors.light, mark: C.colors.mark };
        const t = r.snakeType, sc = 1 / (r.patternScale || 1), amt = r.patternAmount;
        const circAt = v => { const st = stations[clamp(Math.round(v * (stations.length - 1)), 0, stations.length - 1)]; return Math.PI * (st.w + (st.top + st.bot) / 2); };
        const paint = (u, v) => {
            const s = v * S, around = (u - .25), x = around * circAt(v), belly = ease(.16, .3, Math.abs(fract(u - .25 + .5) - .5)), n = fbm(s / Rb * .8, u * 9);
            const head = s < Lh * 1.05;
            let c = col.main;
            if (t === 'coral') {
                // Red, yellow, black: wide red and black bands parted by narrow yellow rings; a black snout, a yellow band over the head.
                const ph = fract(s / (Rb * 7.5 * sc)), band = ph < .38 ? col.main : ph < .47 || ph > .91 ? col.light : col.mark;
                c = head ? (s < Lh * .55 ? col.mark : s < Lh * 1.0 ? col.light : col.mark) : band;
                c = mix(c, mix(c, col.light, .25), belly * .5);
                return mix(col.main, c, amt).map(k => k * (.92 + .16 * n));
            }
            if (t === 'treeSnake') {
                c = mix(col.main, col.light, belly * .9);
                c = mix(c, col.light, ease(-.05, -.12, around) * .6 * (1 - ease(Lh * .7, Lh * 1.15, s)));
                return c.map(k => k * (.9 + .2 * n));
            }
            if (t === 'viper') {
                // A dark zigzag of diamonds down the back, each edged pale, with spots low on the flanks.
                const ph = fract(s / (Rb * 3.2 * sc)), dz = Math.abs(ph - .5) * 2, dd = Math.abs(x) / (Rb * 1.5 * sc) + dz + (n - .5) * .22;
                const diamond = s > Lh * 1.3 ? ease(1.0, .86, dd) : 0, edge = s > Lh * 1.3 ? ease(1.15, 1.0, dd) * (1 - diamond) : 0;
                const spot = ease(.3, .18, Math.hypot(fract(s / (Rb * 3.2 * sc) + .5) - .5, (Math.abs(x) - Rb * 2.1 * sc) / (Rb * 2.8 * sc))) * (s > Lh * 1.3 ? 1 : 0);
                c = mix(col.main, col.light, edge * .7 * amt);
                c = mix(c, col.mark, Math.max(diamond, spot * .8) * amt);
                if (head) c = mix(c, col.mark, ease(.18, .08, Math.abs(around - .1)) * ease(Lh * .45, Lh * .7, s) * .8 * amt);
                c = mix(c, col.light, belly * .85);
                return c.map(k => k * (.88 + .24 * n));
            }
            if (t === 'cobra') {
                c = mix(col.main, col.mark, ease(.45, .8, n) * .35 * amt);
                // The spectacle on the back of the hood.
                const hs = s - Lh - S0 * .06, sp = Math.abs(Math.hypot(Math.abs(x) - Rb * 1.5, hs * 1.4) - Rb * .9);
                if (Math.abs(hs) < S0 * .05) c = mix(c, col.light, ease(Rb * .35, Rb * .15, sp) * amt * .9);
                c = mix(c, col.light, belly * .85);
                if (Math.abs(hs) < S0 * .06) c = mix(c, col.mark, belly * ease(.6, .4, fract(hs / (Rb * 2.4))) * .7 * amt);
                return c.map(k => k * (.9 + .2 * n));
            }
            // Python: big rounded saddles dark-edged on a tan ground, lighter-centred blotches low on the flanks, an arrow on the crown.
            const ph = s / (Rb * 4.2 * sc), cell = Math.floor(ph), wob = (hash(cell, 3) - .5) * .5;
            const saddle = Math.hypot((fract(ph) - .5) * 1.6, x / (Rb * (1.6 + wob) * sc));
            const side = Math.hypot((fract(ph + .5) - .5) * 1.7, (Math.abs(x) - Rb * 2.4 * sc) / (Rb * 1.1 * sc));
            let mark = ease(.9, .75, saddle) * (1 - ease(.55, .3, saddle) * .55) + ease(.9, .72, side) * (1 - ease(.4, .2, side) * .7);
            if (head) mark = ease(.16, .08, Math.abs(around - .02 * 0) * (1 + (Lh - s) / Lh)) * ease(Lh * .25, Lh * .6, s);
            c = mix(col.main, col.mark, clamp(mark, 0, 1) * amt);
            c = mix(c, col.light, belly * .9);
            return c.map(k => k * (.88 + .24 * n));
        };
        // Belly scute lines, the lip line and the heat pits read in the pattern too.
        const lipDark = (u, v) => { const s = v * S; if (s > Lh) return 0; const lift = Math.asin(clamp(-.04 + .32 * (1 - ease(0, .35, s / Lh)), -1, 1)) / (Math.PI * 2); const d = Math.min(Math.abs(fract(u) - lift), Math.abs(fract(u) - 1 - lift), Math.abs(u - (.5 - lift))); return ease(.015, .004, d) * ease(Lh * .01, Lh * .06, s) * (1 - ease(Lh * .82, Lh, s)); };
        const size = save ? 1024 : 512;
        const rostral = (u, v) => { const s = v * S, around = fract(u - .25 + .5) - .5, edge = Lh * (.075 + .05 * Math.abs(Math.sin(around * Math.PI * 2))); return Math.abs(around) < .3 ? ease(Lh * .012, Lh * .004, Math.abs(s - edge)) : 0; };
        const picture = patternPicture(size, (u, v) => { const c = paint(u, v); return mix(c, [.03, .025, .02], Math.max(lipDark(u, v) * .7, rostral(u, v) * .35)); });
        const tile = tilePictures('snake', save ? 512 : 256, 16);
        // Eyes, set into the head at the side just above the lip line, under a brow plate.
        const eyes = [], iris = C.colors.eye, eyeR = Wh * type.eye * .78 * r.eyeSize, eyeS = Lh * (type.brow ? .4 : .34);
        const st = stations.reduce((b, x) => Math.abs(x.s - eyeS) < Math.abs(b.s - eyeS) ? x : b), X = norm(cross([0, 1, 0], st.f)), Y = cross(st.f, X);
        for (const sign of [1, -1]) {
            const a = .42, cx = se(Math.cos(a), st.nt) * st.w, cy = se(Math.sin(a), st.nt) * st.top;
            const outward = norm(add(mul(X, sign * Math.cos(a) * 1.3), mul(Y, Math.sin(a) * .8)));
            const surface = add(add(st.p, mul(X, sign * cx)), mul(Y, cy));
            const center = add(surface, mul(outward, -eyeR * .62));
            const facing = norm(add(outward, mul(st.f, .35)));
            seatEye(mesh, center, eyeR, facing, type.eye > .3 ? .3 : .45);
            eyes.push(() => eyeball(C, 'Eye ' + (sign > 0 ? 'L' : 'R'), center, eyeR, facing, type.pupil, iris, headBone, { pupilSize: .32 }));
        }
        reseat(mesh);
        const part = finishSkin(C, mesh, 'Body', 'snake-pattern.png', picture, 'snake', tile, { roughness: .5 });
        for (const e of eyes) e();
        part.normalScale = .6;
        // Nostrils and heat pits: small dark disks on the snout.
        const details = new Props.ExactMesh(), dark = [.02, .016, .014];
        const surfaceAt = (s, a, side) => { const q = stations.reduce((b, x) => Math.abs(x.s - s) < Math.abs(b.s - s) ? x : b), X = norm(cross([0, 1, 0], q.f)), Y = cross(q.f, X); const cx = se(Math.cos(a), q.nt) * q.w, cy = se(Math.sin(a), Math.sin(a) >= 0 ? q.nt : q.nb) * (Math.sin(a) >= 0 ? q.top : q.bot); return { p: add(add(q.p, mul(X, side * cx)), mul(Y, cy)), n: norm(add(mul(X, side * Math.cos(a)), mul(Y, Math.sin(a)))), f: q.f }; };
        for (const side of [1, -1]) {
            const n = surfaceAt(Lh * .05, .38, side);
            details.disk(add(n.p, mul(n.n, Wh * .003)), norm(add(n.n, mul(n.f, .8))), Wh * .045, dark, Props.rigid(headBone), 10, Wh * .03);
            if (type.pits === 'loreal') { const p = surfaceAt(Lh * .24, .25, side); details.disk(add(p.p, mul(p.n, Wh * .003)), p.n, Wh * .04, dark, Props.rigid(headBone), 10); }
            if (type.pits === 'labial') for (let k = 0; k < 4; k++) { const p = surfaceAt(Lh * (.1 + k * .09), -.12, side); details.disk(add(p.p, mul(p.n, Wh * .003)), p.n, Wh * .025, dark, Props.rigid(headBone), 8, Wh * .016); }
        }
        if (!details.empty) C.parts.push(details.part('Nostrils', { kind: 'skin', roughness: .7, noSurfaceDetail: true }));
        part.reptile = { length: S, Rb };
        C.bones[0].reptileFrame = { kind: 'snake', length: S, waves, reared: type.hood ? Lh + S0 * .3 : 0, type: r.snakeType, restYaw: chain.map(x => ({ b: x.b, c: x.c })), yawAt: yaw, pitchAt: pitch, headLength: Lh };
    }

    /**
     * Seat an eye in a socket: skin that lies inside the globe outside the eye's visible front is pushed out to
     * just over the globe, so the skin closes round the eye like a lid and no part of the globe shows behind or
     * around it; the front cap (within `aperture`, the cosine from the eye's facing) stays bare.
     */
    function seatEye(mesh, center, radius, facing, aperture) {
        const P = mesh.p;
        for (let v = 0; v < P.length / 3; v++) {
            const d = [P[v * 3] - center[0], P[v * 3 + 1] - center[1], P[v * 3 + 2] - center[2]], l = Math.hypot(...d), rim = radius * 1.07;
            if (l >= rim || l < 1e-9) continue;
            const dir = mul(d, 1 / l), front = dot(dir, facing), cover = ease(aperture + .1, aperture - .08, front);
            if (cover <= 0) continue;
            const to = l + (rim - l) * cover;
            for (let k = 0; k < 3; k++) P[v * 3 + k] = center[k] + dir[k] * to;
        }
        mesh.seated = true;
    }
    /** Normals again after the skin was moved, the seam column sharing one normal. */
    function reseat(mesh) {
        if (!mesh.seated) return;
        mesh.computeNormals();
        for (const row of mesh.rows) { const a = row[0] * 3, b = row.at(-1) * 3, n = norm([0, 1, 2].map(k => mesh.n[a + k] + mesh.n[b + k])); for (let k = 0; k < 3; k++) mesh.n[a + k] = mesh.n[b + k] = n[k]; }
    }
    /**
     * Blend a limb into the body it grows from: near each root the limb's normals turn to the body's nearest
     * normal and its color to the body's painted pattern there, so the join shades and reads as one skin.
     */
    function rootBlend(limb, body, roots, paint, colorAmount = 1) {
        const BP = body.p, BN = body.n, n = BP.length / 3;
        for (let v = 0; v < limb.p.length / 3; v++) {
            const p = [limb.p[v * 3], limb.p[v * 3 + 1], limb.p[v * 3 + 2]];
            let w = 0; for (const r of roots) w = Math.max(w, 1 - ease(r.r * .55, r.r * 2.2, Math.hypot(...sub(p, r.p))));
            if (w <= 0) continue;
            let best = 0, bd = Infinity;
            for (let i = 0; i < n; i++) { const d = (BP[i * 3] - p[0]) ** 2 + (BP[i * 3 + 1] - p[1]) ** 2 + (BP[i * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = i; } }
            const nn = norm([0, 1, 2].map(k => limb.n[v * 3 + k] * (1 - w * .9) + BN[best * 3 + k] * w * .9));
            for (let k = 0; k < 3; k++) limb.n[v * 3 + k] = nn[k];
            const c = mix([limb.c[v * 3], limb.c[v * 3 + 1], limb.c[v * 3 + 2]], paint(body.uv0[best * 2], body.uv0[best * 2 + 1]), w * w * colorAmount);
            for (let k = 0; k < 3; k++) limb.c[v * 3 + k] = c[k];
        }
    }
    /** A lofted skin's part with its pattern and tile, both sets of coordinates and the pictures it carries. */
    function finishSkin(C, mesh, name, patternName, picture, tileKind, tile, extra = {}) {
        const p = mesh.part(name, { kind: 'skin', roughness: .45, ...extra });
        p.uvs = Float32Array.from(mesh.uv0); p.uvs1 = Float32Array.from(mesh.uv1);
        p.texture = patternName; p.keepColors = true; p.noSurfaceDetail = true;
        p.normalTexture = 'reptile-' + tileKind + '-normal.png'; p.normalTexCoord = 1; p.normalScale = tileKind === 'frog' ? .5 : .75;
        p.metallicRoughnessTexture = 'reptile-' + tileKind + '-material.png'; p.metallicRoughnessTexCoord = 1;
        p.occlusionTexture = p.metallicRoughnessTexture; p.occlusionTexCoord = 1; p.occlusionStrength = .8;
        p.pictures = { [patternName]: picture, [p.normalTexture]: tile.normal, [p.metallicRoughnessTexture]: tile.material };
        if (tileKind === 'frog') p.wet = true;
        C.parts.push(p); return p;
    }

    function build(C) {
        if (C.r.kind === 'snake') snake(C);
        else if (C.r.kind === 'frog') frog(C);
        else lizard(C);
    }
    // ── lizards and geckos ────────────────────────────────────────────────
    const LIZARDS = {
        greenLizard: { girth: .1, head: .25, headWide: .82, headDeep: .6, snout: 1, tail: 1.9, eye: .2, pupil: 'round', lid: true, toes: 'claw', leg: 1, tile: 'lizard', tailFat: 0 },
        monitor: { girth: .11, head: .23, headWide: .72, headDeep: .5, snoutW: .72, snoutDeep: .24, snout: 1.25, tail: 1.5, eye: .16, pupil: 'round', lid: true, toes: 'claw', leg: 1.05, tile: 'lizard', tailFat: 0, neck: 1.6 },
        desert: { girth: .1, head: .24, headWide: .86, headDeep: .62, snout: .85, tail: 1.5, eye: .21, pupil: 'round', lid: true, toes: 'claw', leg: 1.15, tile: 'lizard', tailFat: 0 },
        leopard: { girth: .14, head: .3, headWide: .98, headDeep: .66, snoutW: .6, snoutDeep: .36, snout: .8, tail: .95, eye: .3, pupil: 'slit', toes: 'thin', leg: .92, tile: 'gecko', tailFat: .55 },
        tokay: { girth: .13, head: .3, headWide: 1.02, headDeep: .64, snoutW: .62, snoutDeep: .36, snout: .85, tail: 1.05, eye: .31, pupil: 'slit', toes: 'pad', leg: .95, tile: 'gecko', tailFat: .15 },
        dayGecko: { girth: .12, head: .28, headWide: .9, headDeep: .6, snoutW: .58, snoutDeep: .34, snout: .9, tail: 1.15, eye: .3, pupil: 'round', toes: 'pad', leg: .95, tile: 'lizard', tailFat: 0, smooth: true }
    };
    function lizard(C) {
        const r = C.r, typeId = r.kind === 'gecko' ? r.geckoType : r.lizardType, type = LIZARDS[typeId] || LIZARDS.greenLizard, save = C.save, gecko = r.kind === 'gecko';
        const SVL = C.L * .42, Wb = SVL * type.girth * .95 * r.girth;
        const Lh = SVL * type.head * r.headSize * (.8 + .2 * r.snoutLength) * (type.snout > 1 ? 1.08 : 1), Whd = SVL * .085 * type.headWide * (.85 + .15 * r.headSize);
        const T = SVL * type.tail * r.tailLength, total = SVL + T, neckEnd = Lh * 1.2 + SVL * .07 * (type.neck || 1);
        const shoulder = neckEnd + SVL * .04, hip = SVL - SVL * .07;
        const legK = type.leg * r.legLength, Lu = SVL * .15 * legK, Ll = SVL * .13 * legK, Lf = SVL * .18 * legK, Ls = SVL * .15 * legK;
        const Hc = Ll * .78 + Wb * .1;
        const N = save ? 240 : 150, sides = save ? 40 : 28;
        // Half-width, top and bottom along the animal; the crown flat, the snout a blunt wedge.
        const neckW = Whd * .72;
        const prof = s => {
            const u = s / Lh;
            if (u < 1.2) {
                // Skull: a rounded snout tip, the snout widening (a monitor's long and flat, not a cone) to the
                // cheeks and jaw muscles behind the eye, the widest point; then the head narrows into the neck.
                // Side: the snout rises to the brow, a flat crown to the back of the skull, then drops to the neck;
                // the chin line runs straight back and deepens at the jowls.
                const tip = Math.sqrt(1 - (1 - Math.min(1, u / .1)) ** 2), sw = type.snoutW ?? .6, back = ease(.86, 1.2, u);
                const hw = Whd * tip * (sw + (1 - sw) * ease(.08, .78, u) ** .8) * (1 + .12 * Math.exp(-(((u - .76) / .11) ** 2)));
                const ht = Whd * tip * ((type.snoutDeep ?? .3) + (type.headDeep - (type.snoutDeep ?? .3)) * ease(.06, .5, u)) * (1 - .05 * ease(.6, .85, u));
                const hb = Whd * tip * (.2 + .32 * ease(.05, .82, u));
                return { w: hw + (neckW - hw) * back, top: ht + (neckW * .86 - ht) * back, bot: hb + (neckW * .8 - hb) * back, nt: 2.5 - .3 * back, nb: 2.2, u };
            }
            const x = s / SVL, trunk = ease(Lh * 1.2 / SVL, .42, x) * (1 - .25 * ease(.62, hip / SVL + .04, x)), neckHold = 1 - ease(Lh * 1.2, neckEnd + SVL * .03, s);
            if (s <= SVL) { const w = neckW + (Wb - neckW) * trunk * (1 - neckHold * .7), t = trunk; return { w, top: w * (.86 - .14 * t + .05 * t), bot: w * (.8 - .14 * t), nt: 2.3, nb: 2.8 - .4 * (1 - t), u }; }
            const k = (s - SVL) / T, fat = type.tailFat * Math.exp(-(((k - .2) / .3) ** 2)) * ease(0, .12, k) * .8;
            const w = Wb * .75 * (1 + fat) * Math.max(.02, (1 - k) ** (gecko ? 1.15 : 1.5)) * (r.tailThickness || 1);
            const blend = ease(0, .22, k); return { w, top: w * (.77 + (.23 + .1 * (1 - k)) * blend), bot: w * (.66 + .26 * blend), nt: 2.1 + .2 * (1 - blend), nb: 2.2 + .6 * (1 - blend), u };
        };
        const ds = total / N, stations = [];
        for (const s of stationsAlong(total, ds, Lh * .3, save ? 16 : 11)) {
            const P = prof(s), u = P.u;
            let crease = null, lowerInset = 0;
            if (u < 1.05) {
                // The mouth: a lip line from the snout tip back below the eye to the jaw corner, the upper jaw a little over the lower.
                const lip = (1 - ease(.78, .95, u)) * ease(0, .05, u), eyeU = .55;
                const brow = Math.exp(-(((u - eyeU) / .14) ** 2)) * (gecko ? .04 : .1);
                crease = a => { const sn = Math.sin(a), d = Math.abs(sn + .08), ca = Math.abs(Math.cos(a));
                    return lip * .09 * Math.exp(-((d / .08) ** 2)) - (sn > 0 ? brow * Math.exp(-(((Math.asin(Math.min(1, sn)) - .85) / .3) ** 2)) * (ca > .05 ? 1 : 0) : 0); };
                lowerInset = .06 * (1 - ease(.8, 1, u));
            }
            // The head and neck rise a little; the tail sinks to the ground behind the hips.
            const y = Hc + Wb * .25 * (1 - ease(0, neckEnd + SVL * .1, s)) - (s > SVL ? Math.min(Hc - P.bot, (Hc - Wb * .3) * ease(SVL, SVL + T * .35, s)) : 0);
            stations.push({ p: [0, y, -s], f: [0, 0, 1], s, ...P, crease, lowerInset });
        }
        // Bones: Hips at the pelvis; Spine, Chest, Neck, Head forward; a tail chain; three bones a leg.
        const bone = rig(C), at = s => nearestStation(stations, s).p.slice();
        const hips = bone('Hips', -1, at(hip), at(hip - SVL * .2), 'root', { along: hip });
        const spine = bone('Spine', hips, at(hip - SVL * .2), at(shoulder + SVL * .12), 'spine', { along: hip - SVL * .2 });
        const chest = bone('Chest', spine, at(shoulder + SVL * .12), at(neckEnd), 'chest', { along: shoulder + SVL * .12 });
        const neck = bone('Neck', chest, at(neckEnd), at(Lh * .9), 'neck', { along: neckEnd });
        const head = bone('Head', neck, at(Lh * .9), at(0), 'head', { along: Lh * .9 });
        const chain = [{ b: head, c: Lh * .45 }, { b: neck, c: (neckEnd + Lh) / 2 }, { b: chest, c: shoulder + SVL * .02 }, { b: spine, c: (hip + shoulder) / 2 }, { b: hips, c: hip }];
        let parent = hips; const nT = save ? 8 : 6;
        for (let k = 0; k < nT; k++) { const s0 = SVL + T * ((k / nT) ** 1.2) - (k ? 0 : SVL * .03), s1 = SVL + T * (((k + 1) / nT) ** 1.2); const b = bone('Tail' + (k ? k + 1 : ''), parent, at(s0), at(s1), 'tail', { along: s0, index: k }); chain.push({ b, c: (s0 + s1) / 2 + (k ? 0 : SVL * .02) }); parent = b; }
        chain.sort((a, b) => a.c - b.c);
        const skinAt = chainSkin(chain);
        const mesh = skinLoft(stations, sides, St => skinAt(St.s), { scalesAround: gecko ? 18 : 30, rowAspect: .8, rowsPerTile: gecko ? 22 : 12, minCirc: Math.PI * Whd * .9, tip: sign => sign > 0 ? Whd * .1 : Wb * .02 });
        // Legs: sprawled, the upper bone out to the side and level, the lower one down to the foot, toes fanned.
        const legs = new Props.ExactMesh(), skinCol = C.colors, roots = [];
        const toeBits = new Props.ExactMesh();
        const legBones = {};
        for (const [front, s0] of [[true, shoulder], [false, hip]]) for (const sign of [1, -1]) {
            const side = sign > 0 ? 'Left' : 'Right', pre = side + (front ? 'Front' : 'Rear');
            const st = nearestStation(stations, s0), up = front ? Lu : Lf, low = front ? Ll : Ls;
            // Sprawled: the upper arm (thigh) out sideways and nearly level, a rounded right-angle bend at the elbow
            // (knee), the forearm (shin) down to the ground; one tube from inside the body to the wrist, thick and
            // muscled at the body, tapering to a slender wrist, so the bend has no joint seam.
            const inside = [sign * st.w * .15, st.p[1] + st.top * .05, st.p[2]];
            const root = [sign * st.w * .8, st.p[1] - st.bot * .2, st.p[2]];
            const knee = [sign * (st.w * .8 + up), st.p[1] - up * .18, st.p[2] + (front ? -up * .22 : up * .25)];
            const ankle = [knee[0] + sign * low * .08, Wb * .2, knee[2] + (front ? low * .18 : -low * .05)];
            const pB = front ? chest : hips;
            const ub = bone(pre + 'UpperLeg', pB, root, knee, 'legUpper', { side: sign, front });
            const lb = bone(pre + 'LowerLeg', ub, knee, ankle, 'legLower', { side: sign, front });
            const fb = bone(pre + 'Foot', lb, ankle, add(ankle, [sign * low * .2, 0, front ? low * .35 : low * .1]), 'foot', { side: sign, front });
            legBones[pre] = [ub, lb, fb];
            const rU = Wb * (front ? .3 : .38) * (r.legThickness || 1), rL = rU * .62;
            const down = [0, -1, 0], outw = [sign, 0, 0];
            const ctrl = [inside, root, lerp(root, knee, .5), add(knee, add(mul(outw, -up * .16), [0, up * .04, 0])), add(knee, add(mul(outw, low * .06), mul(down, low * .2))), lerp(knee, ankle, .65), ankle];
            const rad = [rU * 1.9, rU * 1.5, rU * 1.12, rU * .82, rU * .74, rU * .58, rU * .44];
            const curve = [], radii = [], along = [];
            for (let i = 0; i + 1 < ctrl.length; i++) for (let k = 0; k < 4; k++) {
                const t = k / 4, A = ctrl[Math.max(0, i - 1)], B = ctrl[i], Cc = ctrl[i + 1], D = ctrl[Math.min(ctrl.length - 1, i + 2)];
                curve.push([0, 1, 2].map(j => .5 * (2 * B[j] + (-A[j] + Cc[j]) * t + (2 * A[j] - 5 * B[j] + 4 * Cc[j] - D[j]) * t * t + (-A[j] + 3 * B[j] - 3 * Cc[j] + D[j]) * t * t * t)));
                radii.push(rad[i] + (rad[i + 1] - rad[i]) * (t * t * (3 - 2 * t))); along.push(i + t);
            }
            curve.push(ankle); radii.push(rad.at(-1)); along.push(ctrl.length - 1);
            const legSkin = p => {
                let best = 0, bd = Infinity; for (let i = 0; i < curve.length; i++) { const d = Math.hypot(...sub(p, curve[i])); if (d < bd) { bd = d; best = i; } }
                const t = along[best];
                if (t < 2) { const w = ease(.7, 1.9, t); return { joints: [ub, pB, 0, 0], weights: [w, 1 - w, 0, 0] }; }
                if (t < 4.4) { const w = ease(2.9, 3.9, t); return { joints: [lb, ub, 0, 0], weights: [w, 1 - w, 0, 0] }; }
                const w = ease(5.6, 6, t); return { joints: [fb, lb, 0, 0], weights: [w, 1 - w, 0, 0] };
            };
            limbTube(legs, curve, radii, save ? 16 : 11, legSkin);
            roots.push({ p: root, r: rU * 1.5 });
            // Toes: five, the fourth longest; front ones fan forward, hind ones outward and back.
            const fanBase = front ? .15 : .1, spread = front ? 1.6 : 1.5, toeLen = (front ? low * .42 : low * .58) * (gecko ? .8 : 1);
            const footDir = norm([sign * Math.sin(front ? .5 : 1.0), 0, Math.cos(front ? .5 : 1.0)]), palm = add(add(ankle, mul(footDir, rL * .7)), [0, -Wb * .12, 0]);
            limbTube(legs, [add(ankle, [0, rL * .2, 0]), lerp(ankle, palm, .5), palm], [rL * .72, rL * .8, rL * .85], save ? 10 : 8, Props.rigid(fb));
            for (let k = 0; k < 5; k++) {
                const a = fanBase + (k / 4 - .5) * spread, dir = norm([sign * Math.sin(a + (front ? .35 : .85)), 0, Math.cos(a + (front ? .35 : .85))]);
                const len = toeLen * [.45, .7, .88, 1, .68][k], tipP = add(palm, mul(dir, len)), mid = add(lerp(palm, tipP, .55), [0, Wb * .03, 0]);
                const rT = rL * (gecko ? .2 : .17);
                limbTube(legs, [palm, mid, tipP], [rT * 1.3, rT, rT * .75], save ? 7 : 6, Props.rigid(fb));
                if (type.toes === 'pad') toeBits.sphere(add(tipP, mul(dir, rT * .4)), rT * 2.1, mix(skinCol.light, skinCol.main, .5), Props.rigid(fb), 5, 9, [1, .38, 1]);
                else toeBits.tube([add(tipP, mul(dir, -rT * .2)), add(add(tipP, mul(dir, rT * (type.toes === 'thin' ? 1.4 : 2.4))), [0, -rT * .6, 0])], [rT * .55, rT * .08], 5, [.07, .06, .05], Props.rigid(fb));
            }
        }
        // Colors: the pattern over the body, the coat on the legs (paler beneath), the tile of scales on both.
        const col = { main: C.colors.main, light: C.colors.light, mark: C.colors.mark }, sc = 1 / (r.patternScale || 1), amt = r.patternAmount;
        const circAt = v => { const st = stations[clamp(Math.round(v * (stations.length - 1)), 0, stations.length - 1)]; return Math.PI * (st.w + (st.top + st.bot) / 2); };
        const paint = (u, v) => {
            const s = v * total, around = fract(u - .25 + .5) - .5, x = around * circAt(v), belly = ease(.17, .3, Math.abs(around)), n = fbm(s / Wb * 1.3, u * 11);
            let c = col.main;
            const head = s < Lh, tail = s > SVL, tk = tail ? (s - SVL) / T : 0;
            if (typeId === 'greenLizard') {
                c = mix(col.main, col.mark, ease(.62, .78, fbm(s / Wb * 5, u * 40)) * .75 * amt);
                if (head) c = mix(c, mix(col.main, col.light, .25), .4);
            } else if (typeId === 'monitor') {
                const ph = s / (Wb * 1.3 * sc), cell = Math.hypot(fract(ph) - .5, fract(u * 14 + Math.floor(ph) * .5) - .5);
                c = mix(col.main, col.light, ease(.32, .22, cell) * (1 - ease(.18, .1, cell) * .6) * amt * (head ? .3 : 1));
                if (tail) c = mix(c, col.mark, ease(.55, .75, fract(s / (Wb * 2.6 * sc))) * .6 * amt);
            } else if (typeId === 'desert') {
                const band = ease(.55, .7, fract(s / (Wb * 1.8 * sc) + n * .3)) * (head ? 0 : 1);
                c = mix(col.main, col.mark, band * .7 * amt);
                c = mix(c, col.light, ease(.03, .0, Math.abs(Math.abs(x) - Wb * 1.1)) * .5 * amt);
            } else if (typeId === 'leopard') {
                const fine = clamp(Math.PI * 2 * Wb / circAt(v), 1, 2.2), sx = s * fine / (Wb * .55 * sc), sy = x * fine / (Wb * .55 * sc), cx = Math.floor(sx), cy = Math.floor(sy), jx = hash(cx, cy) * .6 + .2, jy = hash(cy, cx + 9) * .6 + .2;
                const spot = ease(.32, .2, Math.hypot(fract(sx) - jx, fract(sy) - jy)) * (hash(cx + 3, cy) > .25 ? 1 : 0);
                c = mix(col.main, col.mark, spot * amt * (1 - belly));
                if (tail) c = mix(c, mix(col.light, [.55, .5, .6], .4), ease(.6, .75, fract(tk * 5)) * .5 * amt);
            } else if (typeId === 'tokay') {
                const sx = s / (Wb * .9 * sc), sy = x / (Wb * .9 * sc), cx = Math.floor(sx), cy = Math.floor(sy);
                const spot = ease(.3, .18, Math.hypot(fract(sx) - .5, fract(sy + (cx % 2) * .5) - .5)) * (hash(cx, cy) > .35 ? 1 : 0);
                c = mix(col.main, col.mark, spot * amt * (1 - belly * .9));
                c = mix(c, mix(col.light, col.main, .4), ease(.55, .8, fbm(s / (Wb * 1.4 * sc), u * 7)) * (1 - belly) * .3 * amt);
            } else if (typeId === 'dayGecko') {
                const sx = s / (Wb * .7 * sc), sy = x / (Wb * .7 * sc), cx = Math.floor(sx), cy = Math.floor(sy);
                const dorsal = ease(.12, .06, Math.abs(around)) * ease(Lh * 1.4, Lh * 2, s) * (tail ? 1 - tk : 1);
                const spot = ease(.28, .16, Math.hypot(fract(sx) - .5, fract(sy) - .5)) * (hash(cx, cy) > .45 ? 1 : 0) * ease(.2, .05, Math.abs(around));
                c = mix(col.main, col.mark, Math.max(spot, dorsal * .0) * amt);
            }
            c = mix(c, col.light, belly * .88);
            return c.map(k => k * (.9 + .2 * n));
        };
        const lipDark = (u, v) => { const s = v * total; if (s > Lh) return 0; const d = Math.min(Math.abs(fract(u + .03) - .0), Math.abs(fract(u + .03) - 1), Math.abs(u - .53)); return ease(.014, .004, d) * ease(Lh * .02, Lh * .08, s) * (1 - ease(Lh * .78, Lh * .92, s)); };
        const picture = patternPicture(save ? 1024 : 512, (u, v) => mix(paint(u, v), [.04, .03, .02], lipDark(u, v) * .65));
        const tile = tilePictures(type.tile, save ? 512 : 256, gecko ? 18 : 30);
        finishSkin(C, mesh, 'Body', r.kind + '-pattern.png', picture, type.tile, tile, { roughness: type.smooth ? .35 : .5 });
        if (type.smooth) { const p = C.parts.at(-1); p.normalScale = .35; }
        // Legs carry vertex colors: the coat on top, the belly color beneath, a few spots.
        for (let v = 0; v < legs.p.length / 3; v++) {
            const ny = legs.n[v * 3 + 1], y = legs.p[v * 3 + 1], z = legs.p[v * 3 + 2], x = legs.p[v * 3];
            let c = mix(col.main, col.light, clamp(-ny * .8 + .1, 0, .85));
            if (['leopard', 'tokay'].includes(typeId)) c = mix(c, col.mark, ease(.75, .82, fbm(x / Wb * 6, z / Wb * 6 + y / Wb * 3)) * amt * .9);
            if (typeId === 'greenLizard') c = mix(c, col.mark, ease(.65, .8, fbm(x / Wb * 9, z / Wb * 9)) * .5 * amt);
            legs.c[v * 3] = c[0]; legs.c[v * 3 + 1] = c[1]; legs.c[v * 3 + 2] = c[2];
        }
        rootBlend(legs, mesh, roots, (u, v) => mix(paint(fract(u), v), [.04, .03, .02], 0));
        const lp = legs.part('Legs', { kind: 'skin', roughness: .5, noSurfaceDetail: true });
        lp.uvs1 = Float32Array.from(legs.uv1); lp.uvs = Float32Array.from(legs.uv1);
        lp.normalTexture = 'reptile-' + type.tile + '-normal.png'; lp.normalTexCoord = 1; lp.normalScale = .45;
        C.parts.push(lp);
        if (!toeBits.empty) C.parts.push(toeBits.part(type.toes === 'pad' ? 'Toe pads' : 'Claws', { kind: 'skin', roughness: type.toes === 'pad' ? .6 : .35, noSurfaceDetail: true }));
        // Eyes high on the sides behind the snout; a lizard's in a ring of eyelid, a gecko's big and lidless.
        const iris = C.colors.eye, eyeU = .55, st = stations.reduce((b, x) => Math.abs(x.s - Lh * eyeU) < Math.abs(b.s - Lh * eyeU) ? x : b);
        const eyeR = Whd * type.eye * .9 * r.eyeSize, lids = new Props.ExactMesh();
        for (const sign of [1, -1]) {
            const a = .55, surface = [sign * se(Math.cos(a), st.nt) * st.w, st.p[1] + se(Math.sin(a), st.nt) * st.top, st.p[2]];
            const outward = norm([sign * Math.cos(a) * 1.25, Math.sin(a) * .9, .12]);
            const center = add(surface, mul(outward, -eyeR * (gecko ? .5 : .62)));
            eyeball(C, 'Eye ' + (sign > 0 ? 'L' : 'R'), center, eyeR, add(outward, [0, 0, .25]), type.pupil, iris, head, { pupilSize: .3, flecks: gecko });
            {
                // A rim of lid around the visible eye (a gecko's a low scaly ring round its spectacle).
                const f = norm(add(outward, [0, 0, .25])), ex = norm(cross([0, 1, 0], f)), ey = cross(f, ex), ring = [];
                for (let k = 0; k <= 24; k++) { const t = k / 24 * Math.PI * 2; ring.push(add(add(center, mul(f, eyeR * .55)), add(mul(ex, Math.cos(t) * eyeR * .86), mul(ey, Math.sin(t) * eyeR * .78)))); }
                lids.tube(ring, eyeR * (type.lid ? .16 : .1), 7, type.lid ? mix(col.main, col.mark, .25) : mix(col.main, col.light, .3), Props.rigid(head), false);
            }
        }
        if (!lids.empty) C.parts.push(lids.part('Eyelids', { kind: 'skin', roughness: .5, noSurfaceDetail: true }));
        // Nostrils near the snout tip; a gecko's ear opening behind the jaw.
        const det = new Props.ExactMesh(), dark = [.02, .016, .014], ringAt = (s, a, sign) => { const q = stations.reduce((b, x) => Math.abs(x.s - s) < Math.abs(b.s - s) ? x : b), n = Math.sin(a) >= 0 ? q.nt : q.nb; return { p: [sign * se(Math.cos(a), n) * q.w, q.p[1] + se(Math.sin(a), n) * (Math.sin(a) >= 0 ? q.top : q.bot), q.p[2]], n: norm([sign * Math.cos(a), Math.sin(a), 0]) }; };
        for (const sign of [1, -1]) {
            const nn = ringAt(Lh * .08, .7, sign); det.disk(add(nn.p, mul(nn.n, Whd * .004)), norm(add(nn.n, [0, 0, .6])), Whd * .045, dark, Props.rigid(head), 10);
            const ear = ringAt(Lh * 1.0, .15, sign); det.disk(add(ear.p, mul(ear.n, Whd * .004)), ear.n, Whd * .07, mix(col.main, dark, .7), Props.rigid(neck), 12, Whd * .09);
        }
        C.parts.push(det.part('Nostrils', { kind: 'skin', roughness: .7, noSurfaceDetail: true }));
        C.bones[0].reptileFrame = { kind: 'lizard', length: total, SVL, headLength: Lh, legs: legBones, gecko };
    }
    // ── frogs and toads ───────────────────────────────────────────────────
    const FROGS = {
        treeFrog: { wide: 1, deep: 1, eye: .4, pupil: 'slit', pads: true, web: .45, leg: 1.05, tile: 'frog', thigh: .42, rough: .22 },
        poisonDart: { wide: .92, deep: 1.02, eye: .34, pupil: 'round', pads: true, web: .15, leg: 1, tile: 'frog', thigh: .4, rough: .25 },
        toad: { wide: 1.12, deep: 1.08, eye: .32, pupil: 'bar', pads: false, web: .5, leg: .85, tile: 'toad', thigh: .44, rough: .6, glands: true }
    };
    function frog(C) {
        const r = C.r, type = FROGS[r.frogType] || FROGS.treeFrog, save = C.save, SVL = C.L * .42;
        const Wb = SVL * .2 * type.wide * r.girth, Whd = SVL * .2 * type.wide * (.85 + .15 * r.headSize), Lh = SVL * .34 * (.85 + .15 * r.headSize) * (.9 + .1 * r.snoutLength);
        const N = save ? 120 : 80, sides = save ? 48 : 32;
        // The spine sits sloped: the head held nearly level, the back falling to the rump.
        const path = spinePath(SVL, N, () => 0, s => s < Lh * .8 ? .1 : .1 + .42 * ease(Lh * .8, Lh * 1.5, s));
        const stations = [];
        for (const s of stationsAlong(SVL, path.ds, SVL * .12, save ? 12 : 8)) {
            const u = s / SVL, here = pathAt(path, s);
            const tip = Math.sqrt(1 - (1 - Math.min(1, u / .17)) ** 2);
            const rump = u > .6 ? Math.sqrt(Math.max(0, 1 - ((u - .6) / .4) ** 2.2)) : 1;
            const toHead = 1 - ease(.26, .44, u);
            const w = (Whd * tip * (.66 + .34 * ease(0, .3, u)) * toHead + Wb * (1 + .07 * Math.exp(-(((u - .58) / .18) ** 2))) * (1 - toHead)) * rump;
            const top = (Whd * .4 * tip * (.72 + .28 * ease(.02, .3, u)) * toHead + Wb * .8 * type.deep * (1 + .12 * Math.exp(-(((u - .74) / .1) ** 2))) * (1 - toHead)) * rump;
            const bot = (Whd * .34 * tip * (.7 + .3 * ease(0, .35, u)) * toHead + Wb * .74 * type.deep * (1 - toHead)) * rump;
            let crease = null;
            // The mouth runs from the snout round to the jaw corner behind the eye; a toad's parotoid glands swell behind it.
            const lip = (1 - ease(.27, .34, u)) * ease(0, .03, u), gland = type.glands ? Math.exp(-(((u - .4) / .07) ** 2)) * .16 : 0;
            const lid = Math.exp(-(((u - .22) / .07) ** 2)) * .0;
            crease = a => { const sn = Math.sin(a), d = Math.abs(sn + .05), ca = Math.cos(a);
                return lip * .08 * Math.exp(-((d / .07) ** 2)) - gland * Math.exp(-(((Math.atan2(sn, Math.abs(ca)) - .95) / .3) ** 2)) - lid; };
            stations.push({ p: here.p, f: here.f, s, w: Math.max(w, SVL * .004), top: Math.max(top, SVL * .004), bot: Math.max(bot, SVL * .004), nt: u < .3 ? 2.5 : 2.2, nb: 2, crease, lowerInset: lip > 0 ? .04 : 0 });
        }
        const G = Math.min(...stations.map(st => st.p[1] - st.bot)) - SVL * .01;
        const stAt = s => nearestStation(stations, s);
        // Bones: Hips at the rump, Chest under the shoulders, Head; three bones a front leg, four a hind leg.
        const bone = rig(C), mid = s => stAt(s).p.slice();
        const hips = bone('Hips', -1, mid(SVL * .82), mid(SVL * .55), 'root', { along: SVL * .82 });
        const chest = bone('Chest', hips, mid(SVL * .55), mid(SVL * .32), 'chest', { along: SVL * .55 });
        const head = bone('Head', chest, mid(SVL * .32), mid(0), 'head', { along: SVL * .32 });
        const skinAt = chainSkin([{ b: head, c: SVL * .2 }, { b: chest, c: SVL * .45 }, { b: hips, c: SVL * .78 }]);
        const mesh = skinLoft(stations, sides, St => skinAt(St.s), { scalesAround: 1, rowAspect: 1, rowsPerTile: 1, minCirc: Math.PI * Whd, tip: sign => sign > 0 ? Whd * .05 : Wb * .1 });
        // Re-map the frog's tile: a few repeats around and along (it is skin, not rows of scales).
        for (let i = 0; i < mesh.uv1.length; i += 2) { mesh.uv1[i] *= type.tile === 'toad' ? 3 : 4; mesh.uv1[i + 1] = mesh.uv0[i + 1] * (type.tile === 'toad' ? 3 : 4); }
        const legs = new Props.ExactMesh(), webs = new Props.ExactMesh(), pads = new Props.ExactMesh(), legBones = {}, frogRoots = [];
        const legK = type.leg * r.legLength, thick = r.legThickness || 1;
        for (const sign of [1, -1]) {
            const side = sign > 0 ? 'Left' : 'Right';
            // Front: upper arm down and back, forearm down and forward, the hand flat with four fingers.
            const sh = stAt(SVL * .38), shoulder = [sign * sh.w * .55, sh.p[1] - sh.bot * .45, sh.p[2]];
            const wrist = [sign * (sh.w * .78), G + SVL * .025, sh.p[2] + SVL * .1 * legK];
            const elbow = [sign * (sh.w * .82), (shoulder[1] + wrist[1]) / 2 + SVL * .01, shoulder[2] - SVL * .08 * legK];
            const fu = bone(side + 'FrontUpperLeg', chest, shoulder, elbow, 'legUpper', { side: sign, front: true });
            const fl = bone(side + 'FrontLowerLeg', fu, elbow, wrist, 'legLower', { side: sign, front: true });
            const fh = bone(side + 'FrontFoot', fl, wrist, add(wrist, [0, 0, SVL * .08]), 'foot', { side: sign, front: true });
            const rA = Wb * .25 * thick;
            frogRoots.push({ p: shoulder, r: rA * 1.6 });
            limbTube(legs, [add(shoulder, [-sign * rA, rA * .5, 0]), shoulder, lerp(shoulder, elbow, .5), elbow], [rA * 1.5, rA * 1.3, rA * 1.05, rA * .9], save ? 12 : 9, p => { const w = ease(rA * .5, rA * 2.5, Math.hypot(...sub(p, shoulder))); return { joints: [fu, chest, 0, 0], weights: [w, 1 - w, 0, 0] }; });
            limbTube(legs, [elbow, lerp(elbow, wrist, .5), wrist], [rA * .9, rA * .75, rA * .62], save ? 12 : 9, p => { const t = clamp(Math.hypot(...sub(p, elbow)) / (rA * 1.5), 0, 1); return { joints: [fl, fu, 0, 0], weights: [.5 + .5 * t, .5 - .5 * t, 0, 0] }; });
            // The hand: a low palm under the wrist, the forearm running on into it, the fingers growing out of it.
            const palm = add(wrist, [0, -SVL * .01, SVL * .006]);
            limbTube(legs, [lerp(elbow, wrist, .7), wrist, palm], [rA * .68, rA * .62, rA * .58], save ? 12 : 9, p => { const t = clamp(Math.hypot(...sub(p, wrist)) / (rA * 1.2), 0, 1); return { joints: [fh, fl, 0, 0], weights: [.5 + .5 * t, .5 - .5 * t, 0, 0] }; });
            legs.sphere(palm, rA * .66, [1, 1, 1], Props.rigid(fh), 8, 12, [1.2, .62, 1.15]);
            for (let k = 0; k < 4; k++) {
                const a = (-.9 + k * .55) * sign + sign * .25, dir = norm([Math.sin(a), 0, Math.cos(a)]), len = SVL * [.07, .1, .12, .09][k] * legK;
                const base = add(palm, mul(dir, rA * .25)), tipP = add(add(base, mul(dir, len)), [0, -SVL * .008, 0]), rf = rA * .3;
                limbTube(legs, [base, add(lerp(base, tipP, .45), [0, SVL * .004, 0]), tipP], [rf * 1.5, rf * 1.05, rf * .9], save ? 7 : 6, Props.rigid(fh));
                if (type.pads) pads.sphere(add(tipP, mul(dir, rf * .5)), rf * 1.9, [1, 1, 1], Props.rigid(fh), 6, 10, [1, .55, 1]);
            }
            // Hind: the thigh forward along the flank, the shin folded back beside it, the long foot forward again on the ground.
            const hp = stAt(SVL * .84), hip = [sign * hp.w * .5, hp.p[1] - hp.bot * .1, hp.p[2]];
            const knee = [sign * (Wb * 1.08), G + Wb * .62, stAt(SVL * .42).p[2]];
            const ankle = [sign * (Wb * .98), G + Wb * .32, stAt(SVL * .96).p[2] - SVL * .02];
            const sole = [sign * (Wb * 1.22), G + SVL * .02, stAt(SVL * .58).p[2]];
            const tu = bone(side + 'RearUpperLeg', hips, hip, knee, 'legUpper', { side: sign, front: false });
            const tl = bone(side + 'RearLowerLeg', tu, knee, ankle, 'legLower', { side: sign, front: false });
            const tf = bone(side + 'RearFoot', tl, ankle, sole, 'foot', { side: sign, front: false });
            const tt = bone(side + 'RearToes', tf, sole, add(sole, [sign * SVL * .05, 0, SVL * .2]), 'toes', { side: sign, front: false });
            legBones[side] = { thigh: tu, shin: tl, foot: tf, toes: tt, arm: fu, forearm: fl, hand: fh };
            const rT = Wb * type.thigh * thick;
            frogRoots.push({ p: hip, r: rT * 1.3 });
            limbTube(legs, [add(hip, [-sign * rT * .5, rT * .2, -rT * .3]), hip, lerp(hip, knee, .45), knee], [rT * 1.15, rT * 1.2, rT * 1.0, rT * .6], save ? 16 : 11, p => { const w = ease(rT * .4, rT * 2.2, Math.hypot(...sub(p, hip))); return { joints: [tu, hips, 0, 0], weights: [w, 1 - w, 0, 0] }; });
            limbTube(legs, [add(knee, mul(norm(sub(knee, ankle)), rT * .25)), knee, lerp(knee, ankle, .45), ankle], [rT * .55, rT * .62, rT * .55, rT * .36], save ? 14 : 10, p => { const t = clamp(Math.hypot(...sub(p, knee)) / (rT * 1.1), 0, 1); return { joints: [tl, tu, 0, 0], weights: [.5 + .5 * t, .5 - .5 * t, 0, 0] }; });
            limbTube(legs, [add(ankle, mul(norm(sub(ankle, sole)), rT * .15)), ankle, lerp(ankle, sole, .5), sole], [rT * .34, rT * .34, rT * .3, rT * .26], save ? 12 : 9, p => { const t = clamp(Math.hypot(...sub(p, ankle)) / (rT * .8), 0, 1); return { joints: [tf, tl, 0, 0], weights: [.5 + .5 * t, .5 - .5 * t, 0, 0] }; });
            // The sole: a flat pad the shin's tube runs into and the toes grow out of.
            legs.sphere(sole, rT * .3, [1, 1, 1], Props.rigid(tf), 8, 12, [1.25, .6, 1.3]);
            // Five long toes fanned forward and out, the fourth longest, webbed between.
            const toes = [];
            for (let k = 0; k < 5; k++) {
                const a = sign * (-.35 + k * .3), dir = norm([Math.sin(a), 0, Math.cos(a)]), len = SVL * [.12, .16, .21, .27, .2][k] * legK, rt = rT * .13;
                const pts = [0, .35, .7, 1].map(f => add(add(sole, mul(dir, len * f)), [0, -SVL * .012 * f + SVL * .006 * Math.sin(f * Math.PI), 0]));
                limbTube(legs, pts, [rt * 1.7, rt * 1.2, rt * 1.0, rt * .9], save ? 7 : 6, Props.rigid(tt));
                if (type.pads) pads.sphere(add(pts[3], mul(dir, rt * .5)), rt * 1.9, [1, 1, 1], Props.rigid(tt), 6, 10, [1, .55, 1]);
                toes.push(pts);
            }
            // Webbing: a thin two-sided membrane between neighbouring toes, its free edge curving in between the tips.
            const at = (pts, f) => { const x = f * 3, i = Math.min(2, Math.floor(x)); return lerp(pts[i], pts[i + 1], x - i); };
            for (let k = 0; k < 4; k++) {
                const reach = type.web * (k === 3 ? 1 : .85), rows = 4, cols = 5, grid = [];
                for (let j = 0; j <= rows; j++) {
                    const fj = j / rows, row = [];
                    for (let c = 0; c <= cols; c++) {
                        const fc = c / cols, edge = reach * (1 - .45 * Math.sin(fc * Math.PI)), f = Math.min(edge, fj * Math.max(reach, .05));
                        const p = lerp(at(toes[k], Math.min(f, edge)), at(toes[k + 1], Math.min(f, edge)), fc);
                        row.push(add(p, [0, -SVL * .003 * Math.sin(fc * Math.PI), 0]));
                    }
                    grid.push(row);
                }
                for (const up of [1, -1]) {
                    const ids = grid.map(row => row.map(p => webs.vertex(add(p, [0, up * SVL * .0012, 0]), [0, up, 0], mix(C.colors.light, C.colors.main, .55), Props.rigid(tt))));
                    for (let j = 0; j < rows; j++) for (let c = 0; c < cols; c++) {
                        const a = ids[j][c], b = ids[j][c + 1], d = ids[j + 1][c], e = ids[j + 1][c + 1];
                        if ((up > 0) === (sign > 0)) { webs.tri(a, d, b); webs.tri(b, d, e); } else { webs.tri(a, b, d); webs.tri(b, e, d); }
                    }
                }
            }
        }
        // Colors and pattern.
        const col = { main: C.colors.main, light: C.colors.light, mark: C.colors.mark }, sc = 1 / (r.patternScale || 1), amt = r.patternAmount, t = r.frogType;
        const circAt = v => { const st = stations[clamp(Math.round(v * (stations.length - 1)), 0, stations.length - 1)]; return Math.PI * (st.w + (st.top + st.bot) / 2); };
        const paint = (u, v) => {
            const around = fract(u - .25 + .5) - .5, x = around * circAt(v), s = v * SVL, n = fbm(s / SVL * 9, u * 12);
            const belly = ease(.27, .31, Math.abs(around)), lipBand = Math.abs(Math.abs(around) - .25) < .02 && v < .3;
            let c = col.main;
            if (t === 'treeFrog') {
                const stripe = ease(.012, .004, Math.abs(Math.abs(around) - .26)) * ease(.18, .26, v) * (1 - ease(.78, .88, v));
                c = mix(c, col.mark, stripe * amt); c = mix(c, col.light, ease(.01, .003, Math.abs(Math.abs(around) - .275)) * ease(.18, .26, v) * (1 - ease(.78, .88, v)) * .9 * amt);
                c = mix(c, col.light, belly * .95);
                if (lipBand) c = mix(c, [1, 1, .95], .8 * amt);
            } else if (t === 'poisonDart') {
                const sx = s / (SVL * .09 * sc), sy = x / (SVL * .09 * sc), cx = Math.floor(sx), cy = Math.floor(sy), rad = .18 + .2 * hash(cx, cy + 5);
                const spot = ease(rad, rad - .08, Math.hypot(fract(sx) - .3 - .4 * hash(cx, cy), fract(sy) - .3 - .4 * hash(cy, cx))) * (hash(cx + 1, cy) > .3 ? 1 : 0);
                c = mix(mix(col.main, col.light, belly * .7), col.mark, spot * amt);
            } else {
                const blotch = ease(.55, .68, fbm(s / SVL * 7 + 3, u * 9)) * (1 - belly);
                c = mix(col.main, col.mark, blotch * .75 * amt);
                c = mix(c, mix(col.main, col.light, .5), ease(.02, .008, Math.abs(around)) * ease(.3, .4, v) * .5 * amt);
                c = mix(c, mix(col.light, col.mark, ease(.6, .75, fbm(s / SVL * 14, u * 20)) * .35), belly * .9);
            }
            return c.map(k => k * (.92 + .16 * n));
        };
        const lipDark = (u, v) => v > .33 ? 0 : ease(.012, .003, Math.min(Math.abs(fract(u + .015) - 0), Math.abs(fract(u + .015) - 1), Math.abs(u - .515))) * ease(.01, .04, v) * (1 - ease(.28, .33, v));
        const picture = patternPicture(save ? 1024 : 512, (u, v) => mix(paint(u, v), [.05, .04, .03], lipDark(u, v) * .7));
        const tile = tilePictures(type.tile, save ? 512 : 256, 1);
        const body = finishSkin(C, mesh, 'Body', 'frog-pattern.png', picture, type.tile, tile, { roughness: type.rough });
        body.normalScale = type.tile === 'toad' ? .9 : .35;
        // Legs: the coat above, paler beneath; a dart frog's spots and a toad's blotches carry onto them.
        const legColor = (p, ny) => {
            let c = mix(col.main, col.light, clamp(-ny * .9, 0, .9));
            if (t === 'poisonDart') c = mix(c, col.mark, ease(.68, .74, fbm(p[0] / SVL * 30 + 4, p[2] / SVL * 30 + p[1] / SVL * 20)) * amt);
            if (t === 'toad') c = mix(c, col.mark, ease(.58, .72, fbm(p[0] / SVL * 14, p[2] / SVL * 14)) * .6 * amt);
            if (t === 'treeFrog') c = mix(c, mix(col.main, [.9, .45, .1], .7), clamp(-ny, 0, 1) * .25);
            return c;
        };
        for (const m of [legs, pads]) for (let v = 0; v < m.p.length / 3; v++) { const c = m === pads ? mix(legColor([m.p[v * 3], m.p[v * 3 + 1], m.p[v * 3 + 2]], -1), col.light, .3) : legColor([m.p[v * 3], m.p[v * 3 + 1], m.p[v * 3 + 2]], m.n[v * 3 + 1]); m.c.set ? m.c.set(c, v * 3) : (m.c[v * 3] = c[0], m.c[v * 3 + 1] = c[1], m.c[v * 3 + 2] = c[2]); }
        rootBlend(legs, mesh, frogRoots, (u, v) => paint(fract(u), v), .35);
        const lp = legs.part('Legs', { kind: 'skin', roughness: type.rough, noSurfaceDetail: true });
        lp.uvs = Float32Array.from(legs.uv1); lp.uvs1 = Float32Array.from(legs.uv1);
        lp.normalTexture = body.normalTexture; lp.normalTexCoord = 1; lp.normalScale = body.normalScale * .7; lp.metallicRoughnessTexture = body.metallicRoughnessTexture; lp.metallicRoughnessTexCoord = 1;
        if (type.tile === 'frog') lp.wet = true;
        C.parts.push(lp);
        if (!webs.empty) C.parts.push(webs.part('Webbing', { kind: 'skin', roughness: .35, noSurfaceDetail: true, doubleSided: true }));
        if (!pads.empty) C.parts.push(pads.part('Toe pads', { kind: 'skin', roughness: .4, noSurfaceDetail: true }));
        // Eyes on top of the head at the sides, bulging, under a fold of upper lid; the eardrum behind.
        const iris = C.colors.eye, st = stAt(Lh * .62), eyeR = Whd * type.eye * .62 * r.eyeSize, lids = new Props.ExactMesh(), det = new Props.ExactMesh();
        const X = norm(cross([0, 1, 0], st.f)), Yv = cross(st.f, X);
        for (const sign of [1, -1]) {
            const a = 1.0, surface = add(add(st.p, mul(X, sign * se(Math.cos(a), st.nt) * st.w)), mul(Yv, se(Math.sin(a), st.nt) * st.top));
            const outward = norm(add(mul(X, sign * Math.cos(a)), mul(Yv, Math.sin(a) * 1.1)));
            const center = add(surface, mul(outward, eyeR * .05));
            const lidSkin = mix(col.main, col.mark, t === 'toad' ? .2 : 0);
            eyeball(C, 'Eye ' + (sign > 0 ? 'L' : 'R'), center, eyeR, add(mul(outward, .7), add(mul(X, sign * .5), mul(st.f, .45))), type.pupil, iris, head, { pupilSize: .42, flecks: true, back: lidSkin });
            // The upper lid: a hood of skin over the back and top of the eyeball, its edge a soft rounded fold a
            // third of the way down the eye (never the eyeball's dark back showing above the head).
            const f = norm(add(mul(outward, .7), add(mul(X, sign * .5), mul(st.f, .45)))), ex = norm(cross(Yv, f)), ey = cross(f, ex);
            const hA = norm(add(mul(f, -.6), mul(ey, .8))), hX = norm(cross(hA, ex)), hY = cross(hA, hX), capA = 1.5, hr = eyeR * 1.05, nT = 7, nP = 28, ring = [];
            for (let i = 0; i <= nT; i++) {
                const th = capA * i / nT, row = [];
                for (let j = 0; j < nP; j++) {
                    const ph = 2 * Math.PI * j / nP, d = norm(add(mul(hA, Math.cos(th)), add(mul(hX, Math.sin(th) * Math.cos(ph)), mul(hY, Math.sin(th) * Math.sin(ph)))));
                    const q = add(center, mul(d, hr)), n = fbm(q[0] / SVL * 60 + sign * 3, (q[1] + q[2]) / SVL * 60);
                    row.push(lids.vertex(q, d, lidSkin.map(k => k * (.9 + .18 * n)), Props.rigid(head)));
                }
                ring.push(row);
            }
            const P = lids.p, wind = (a, b, c) => { const pa = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], n = cross(sub([P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], pa), sub([P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], pa)); if (dot(n, sub(pa, center)) >= 0) lids.tri(a, b, c); else lids.tri(a, c, b); };
            for (let i = 0; i < nT; i++) for (let j = 0; j < nP; j++) { const a = ring[i][j], b = ring[i][(j + 1) % nP], c = ring[i + 1][j], d = ring[i + 1][(j + 1) % nP]; wind(a, c, b); wind(b, c, d); }
            const edge = [];
            for (let j = 0; j <= nP; j++) { const ph = 2 * Math.PI * j / nP; edge.push(add(center, mul(norm(add(mul(hA, Math.cos(capA)), add(mul(hX, Math.sin(capA) * Math.cos(ph)), mul(hY, Math.sin(capA) * Math.sin(ph))))), hr))); }
            lids.tube(edge, edge.map(() => eyeR * .075), 8, lidSkin, Props.rigid(head), false);
            // Eardrum and nostril.
            const ts = stAt(Lh * .98), tX = norm(cross([0, 1, 0], ts.f)), tY = cross(ts.f, tX), ta = .25;
            const tp = add(add(ts.p, mul(tX, sign * se(Math.cos(ta), ts.nt) * ts.w)), mul(tY, se(Math.sin(ta), ts.nt) * ts.top));
            // The eardrum: a disc of skin lying on the head's own surface (each point cast onto the skin, then
            // a hair proud of it, its rim a little raised), never a flat circle cutting through the curve.
            {
                const tn = norm(add(mul(tX, sign), mul(tY, .25))), rad = Whd * (t === 'toad' ? .13 : .16), tc = mix(t === 'treeFrog' ? mix(col.main, col.light, .3) : col.main, [.03, .025, .02], .3);
                const ux = norm(cross(tn, Math.abs(tn[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), uy = cross(tn, ux), P = mesh.p, I = mesh.i, tris = [];
                for (let k = 0; k < I.length; k += 3) { const a = [P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]]; if (Math.hypot(...sub(a, tp)) < rad * 3) tris.push(k); }
                const onSkin = q => { let best = null, bd = Infinity; const o = add(q, mul(tn, rad)), d = mul(tn, -1);
                    for (const k of tris) { const A = [P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]], B = [P[I[k + 1] * 3], P[I[k + 1] * 3 + 1], P[I[k + 1] * 3 + 2]], Cc = [P[I[k + 2] * 3], P[I[k + 2] * 3 + 1], P[I[k + 2] * 3 + 2]];
                        const e1 = sub(B, A), e2 = sub(Cc, A), h = cross(d, e2), det = dot(e1, h); if (Math.abs(det) < 1e-14) continue;
                        const sv = sub(o, A), u = dot(sv, h) / det; if (u < 0 || u > 1) continue; const qv = cross(sv, e1), v = dot(d, qv) / det; if (v < 0 || u + v > 1) continue;
                        const dist = dot(e2, qv) / det; if (dist > 0 && dist < bd) { bd = dist; best = add(o, mul(d, dist)); } }
                    return best || q; };
                const rings = 5, segs = 20, ids = [];
                for (let ri = 0; ri <= rings; ri++) { const f = ri / rings, row = [];
                    for (let k = 0; k < (ri ? segs : 1); k++) { const a = k / segs * Math.PI * 2, q = add(tp, add(mul(ux, Math.cos(a) * rad * f), mul(uy, Math.sin(a) * rad * f)));
                        const lift = SVL * (.0007 + .0006 * Math.exp(-(((f - .92) / .08) ** 2)));
                        row.push(det.vertex(add(onSkin(q), mul(tn, lift)), tn, mix(tc, col.main, .25 * ease(.75, 1, f)), Props.rigid(head))); }
                    ids.push(row); }
                const tri = (a, b, c) => { const pa = det.p.slice(a * 3, a * 3 + 3), nrm = cross(sub(det.p.slice(b * 3, b * 3 + 3), pa), sub(det.p.slice(c * 3, c * 3 + 3), pa)); if (dot(nrm, tn) >= 0) det.tri(a, b, c); else det.tri(a, c, b); };
                for (let k = 0; k < segs; k++) tri(ids[0][0], ids[1][k], ids[1][(k + 1) % segs]);
                for (let ri = 1; ri < rings; ri++) for (let k = 0; k < segs; k++) { const a = ids[ri][k], b = ids[ri][(k + 1) % segs], c = ids[ri + 1][k], d2 = ids[ri + 1][(k + 1) % segs]; tri(a, c, b); tri(b, c, d2); }
            }
            const ns = stAt(Lh * .1), nX = norm(cross([0, 1, 0], ns.f)), nY = cross(ns.f, nX), np = add(add(ns.p, mul(nX, sign * ns.w * .45)), mul(nY, ns.top * .92));
            det.disk(add(np, mul(nY, SVL * .002)), norm(add(nY, mul(ns.f, .4))), Whd * .03, [.03, .025, .02], Props.rigid(head), 8);
        }
        C.parts.push(lids.part('Eyelids', { kind: 'skin', roughness: type.rough, noSurfaceDetail: true }));
        C.parts.push(det.part('Eardrums and nostrils', { kind: 'skin', roughness: Math.max(.35, type.rough), noSurfaceDetail: true }));
        C.bones[0].reptileFrame = { kind: 'frog', length: SVL, SVL, legs: legBones };
    }

    // ── motions ───────────────────────────────────────────────────────────
    const qa = (axis, a) => { const s = Math.sin(a / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)]; };
    const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    const qinv = q => [-q[0], -q[1], -q[2], q[3]];
    /** The shortest turn taking direction a onto direction b. */
    const qFromTo = (a, b) => { const u = norm(a), v = norm(b), c = cross(u, v), w = 1 + dot(u, v); if (w < 1e-6) { const ax = norm(Math.abs(u[0]) < .9 ? cross(u, [1, 0, 0]) : cross(u, [0, 1, 0])); return [ax[0], ax[1], ax[2], 0]; } const l = Math.hypot(c[0], c[1], c[2], w); return [c[0] / l, c[1] / l, c[2] / l, w / l]; };
    const rotate = (q, p) => { const t = mul(cross(q, p), 2); return add(p, add(mul(t, q[3]), cross(q, t))); };
    const POSE_IDS = ['idle', 'crawl', 'walk', 'run', 'turn', 'attack'];
    /**
     * A clip in the creature forms' format: { name, times, tracks, heights, lift, saved }. World rotations
     * per bone are composed here and turned into locals (each bone's rest frame is the world's).
     */
    function poseClip(bones, id, recipe) {
        const F = bones[0]?.reptileFrame;
        if (!F || !POSE_IDS.includes(id)) return null;
        const frames = 33, period = id === 'idle' ? 4 : id === 'attack' ? 1.1 : id === 'run' ? .8 : id === 'turn' ? 2 : F.kind === 'frog' ? 1.1 : F.kind === 'lizard' ? 1.2 : 1.6;
        const times = Float32Array.from({ length: frames }, (_, i) => i / (frames - 1) * period);
        const world = [], lifts = new Float32Array(frames);
        for (let i = 0; i < frames; i++) {
            const t = i / (frames - 1);
            world.push(F.kind === 'snake' ? snakeFrame(bones, F, id, t) : F.kind === 'lizard' ? lizardFrame(bones, F, id, t) : F.kind === 'frog' ? frogFrame(bones, F, id, t) : bones.map(() => [0, 0, 0, 1]));
        }
        const tracks = bones.map((b, index) => {
            const values = new Float32Array(frames * 4);
            for (let i = 0; i < frames; i++) { const W = world[i], local = b.parent < 0 ? W[index] : qmul(qinv(W[b.parent]), W[index]); values.set(local, i * 4); }
            return { bone: index, values };
        });
        // Floor: lift the body so its lowest sample stays on the ground.
        const samples = bones[0].floorSamples;
        for (let frame = 0; frame < frames; frame++) {
            if (!samples) break;
            const W = world[frame], pos = [];
            bones.forEach((b, i) => { pos[i] = b.parent < 0 ? b.head : add(pos[b.parent], rotate(W[b.parent], sub(b.head, bones[b.parent].head))); });
            let low = Infinity;
            for (const smp of samples) { let y = 0; for (let k = 0; k < 4; k++) if (smp.w[k]) { const j = smp.j[k]; y += (rotate(W[j], sub(smp.p, bones[j].head))[1] + pos[j][1]) * smp.w[k]; } low = Math.min(low, y); }
            lifts[frame] = -low + (F.kind === 'frog' ? hopCurve(id, frame / (frames - 1)).air * F.SVL * (id === 'run' ? .35 : .2) : 0);
        }
        const name = ({ idle: 'Idle', crawl: 'Walk', walk: 'Walk', run: 'Run', turn: 'Turn', attack: 'Attack' })[id];
        const heights = lifts;
        const lift = time => { const tt = (id === 'attack' ? clamp(time, 0, period) : ((time % period) + period) % period) / period * (frames - 1), i = Math.min(frames - 1, Math.floor(tt)); return heights[i] + (heights[Math.min(frames - 1, i + 1)] - heights[i]) * (tt - i); };
        const translation = Float32Array.from({ length: frames * 3 }, (_, i) => bones[0].head[i % 3] + (i % 3 === 1 ? heights[Math.floor(i / 3)] : 0));
        const saved = { name, times, tracks: tracks.concat([{ bone: 0, path: 'translation', values: translation }]), loop: id !== 'attack' };
        return { name, times, tracks, heights, lift, loop: id !== 'attack', once: id === 'attack', skin: false, saved };
    }
    /** World rotation per bone for a snake at phase t (0..1 of the clip). */
    function snakeFrame(bones, F, id, t) {
        const S = F.length, ph = t * Math.PI * 2;
        const W = bones.map(() => [0, 0, 0, 1]);
        bones.forEach((b, i) => {
            const s = b.along ?? 0;
            const center = b.role === 'tail' ? s + (S * .02) : b.role === 'head' ? F.headLength * .5 : s;
            const rest = F.yawAt(center);
            let yaw = rest, pitch = 0;
            if (id === 'crawl' || id === 'walk' || id === 'run') {
                // Serpentine: a wave runs from the neck to the tail; the head swings least.
                // The travelling wave as deep as the rest's S-bends and as many along the body, so a slithering snake
                // stays about as compact as a resting one (and in the view framed on it).
                // The body's mean heading holds still (the snake undulates along its line, never swinging round the
                // whole frame); a cobra's reared front stays up out of the wave.
                const lam = S / (F.waves || 2.6) * (id === 'run' ? 1.15 : 1), amp = x => (id === 'run' ? 1.05 : .95) * (.35 + .65 * ease(0, S * .14, x)) * (1 - .4 * ease(S * .85, S, x)) * ease(F.reared || 0, (F.reared || 0) + S * .08, x);
                const wave = x => amp(x) * Math.sin(x / lam * Math.PI * 2 - ph);
                let mean = 0; for (let k = 0; k < 24; k++) mean += wave(S * (k + .5) / 24) / 24;
                yaw = (F.reared ? rest * (1 - ease(0, S * .08, center - F.reared)) : 0) + wave(center) - mean;
                if (b.role === 'head') yaw = .12 * Math.sin(-ph) ;
            } else if (id === 'idle') {
                yaw = rest + .035 * Math.sin(ph + center / S * 6);
                if (b.role === 'head' || b.name === 'Neck') pitch = .1 + .04 * Math.sin(ph * 2);
            } else if (id === 'turn') {
                yaw = rest + Math.sin(ph) * .6 * (1 - center / S);
            } else if (id === 'attack') {
                // Draw the neck back into an S, then strike forward with the head low.
                const coil = ease(0, .35, t) * (1 - ease(.45, .6, t)), strike = ease(.45, .6, t) * (1 - ease(.75, 1, t));
                const front = 1 - ease(S * .05, S * .3, center);
                yaw = rest * (1 - front * .8) + front * coil * .9 * Math.sin(center / (S * .12) * Math.PI);
                if (center < S * .3) pitch = front * (coil * .35 - strike * .15) + (b.role === 'head' ? strike * .25 - coil * .2 : 0);
            }
            const yq = qa([0, 1, 0], yaw - rest);
            const side = norm(cross([0, 1, 0], [Math.sin(rest), 0, Math.cos(rest)]));
            W[i] = qmul(yq, qa(side, -pitch));
        });
        return W;
    }
    /**
     * World rotation per bone for a lizard: the sprawling walk. The spine bends side to side as a standing
     * wave (shoulders one way, hips the other), the tail follows as a travelling wave, the head is held
     * steady; diagonal legs (left fore with right hind) swing together, each upper leg swinging forward
     * and back about the vertical while its elbow or knee lifts during the swing.
     */
    function lizardFrame(bones, F, id, t) {
        const ph = t * Math.PI * 2, W = new Array(bones.length), P = new Array(bones.length), Y = [0, 1, 0], Z = [0, 0, 1], X = [1, 0, 0];
        const gait = id === 'crawl' || id === 'walk' || id === 'run', A = id === 'run' ? .3 : gait ? .22 : 0;
        const bump = id === 'attack' ? Math.sin(Math.PI * clamp(t / .7, 0, 1)) : 0;
        bones.forEach((b, i) => {
            let q = [0, 0, 0, 1];
            if (b.role === 'root') q = qa(Y, -A * Math.sin(ph) + (id === 'turn' ? .55 * Math.sin(ph) : 0));
            else if (b.role === 'spine') q = qmul(W[b.parent], qa(Y, A * .35 * Math.sin(ph) / 1));
            else if (b.role === 'chest') q = qmul(qa(Y, A * Math.sin(ph) + (id === 'turn' ? .55 * Math.sin(ph) : 0)), qa(X, -bump * .12));
            else if (b.role === 'neck') q = qmul(qa(Y, A * .45 * Math.sin(ph) + (id === 'idle' ? .12 * Math.sin(ph) : 0) + (id === 'turn' ? .7 * Math.sin(ph) : 0)), qa(X, id === 'idle' ? -.06 - .1 * Math.max(0, Math.sin(ph * 2)) ** 4 : bump * .1));
            else if (b.role === 'head') q = qmul(qa(Y, A * .1 * Math.sin(ph) + (id === 'idle' ? .2 * Math.sin(ph) : 0) + (id === 'turn' ? .8 * Math.sin(ph) : 0)), qa(X, id === 'attack' ? bump * .25 : 0));
            else if (b.role === 'tail') { const k = b.index + 1, amp = gait ? -A * (1 + .3 * k) : id === 'idle' ? .04 * k : 0; q = qmul(qa(Y, clamp(amp * Math.sin(ph - .65 * k), -1.2, 1.2) + (id === 'turn' ? -.35 * Math.sin(ph) * k / 4 : 0)), qa(X, id === 'run' ? -.04 : 0)); }
            else if (b.role === 'legUpper') {
                // Planted feet: each foot holds its place on the ground through the stance while the body moves
                // over it (in place, the ground slides back under the body), then lifts and swings forward; the
                // upper and lower leg are solved to reach it with the elbow (knee) kept out and up to the side.
                const lb = i + 1, fb = i + 2, sg = b.side, R0 = b.head, K0 = bones[lb].head, A0 = bones[fb].head;
                const l1 = Math.hypot(...sub(K0, R0)), l2 = Math.hypot(...sub(A0, K0)), Rw = P[b.parent] ? add(P[b.parent], rotate(W[b.parent], sub(R0, bones[b.parent].head))) : R0;
                const pair = (b.front === (sg > 0)) ? 0 : .5, stance = id === 'run' ? .5 : .62, stride = gait ? (l1 + l2) * (id === 'run' ? .75 : .55) : 0;
                const f = ((t + pair) % 1 + 1) % 1;
                let dz = 0, up = 0;
                if (gait) { if (f < stance) dz = stride * (.5 - f / stance); else { const w = (f - stance) / (1 - stance); dz = stride * (-.5 + ease(0, 1, w)); up = Math.sin(Math.PI * w) * l2 * .45; } }
                if (id === 'attack' && b.front) up = bump * l2 * .5;
                const T = add(A0, [0, up, dz]);
                let d = sub(T, Rw), dl = Math.hypot(...d); const reach = (l1 + l2) * .985;
                if (dl > reach) { d = mul(d, reach / dl); dl = reach; }
                const dir = mul(d, 1 / dl), pole = norm(add([sg, 0, 0], [0, .55, 0])), perp0 = sub(pole, mul(dir, dot(pole, dir))), perp = norm(perp0);
                const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
                const K = add(add(Rw, mul(dir, a)), mul(perp, h)), Tt = add(Rw, d);
                W[i] = qFromTo(sub(K0, R0), sub(K, Rw)); P[i] = Rw;
                W[lb] = qFromTo(sub(A0, K0), sub(Tt, K)); P[lb] = K;
                W[fb] = qa(Y, -sg * (gait ? dz / Math.max(1e-6, stride) * .3 : 0)); P[fb] = Tt;
                return;
            }
            else if (b.role === 'legLower' || b.role === 'foot') return;
            W[i] = q;
            P[i] = b.parent < 0 ? b.head : add(P[b.parent], rotate(W[b.parent], sub(b.head, bones[b.parent].head)));
        });
        return W;
    }
    /**
     * World rotation per bone for a frog. The walk is a hop: a short crouch, the hind legs unfold straight
     * back (thigh, shin and foot opening in turn) while the sloped sitting body levels out and leaves the ground, the
     * arms reach forward to land, then everything folds back into the sitting pose.
     */
    const hopCurve = (id, t) => {
        if (!['crawl', 'walk', 'run', 'turn'].includes(id)) return { ext: 0, air: 0, crouch: 0, reach: 0 };
        const ext = ease(.1, .25, t) * (1 - ease(.48, .62, t)), air = Math.sin(Math.PI * clamp((t - .16) / .44, 0, 1)), crouch = Math.sin(Math.PI * clamp(t / .18, 0, 1)) + Math.sin(Math.PI * clamp((t - .58) / .16, 0, 1)) * .7;
        return { ext, air, crouch, reach: ease(.25, .45, t) * (1 - ease(.6, .78, t)) };
    };
    function frogFrame(bones, F, id, t) {
        const ph = t * Math.PI * 2, W = new Array(bones.length), X = [1, 0, 0], Y = [0, 1, 0];
        const h = hopCurve(id, t), big = id === 'run' ? 1.2 : 1, strike = id === 'attack' ? Math.sin(Math.PI * clamp(t / .5, 0, 1)) : 0;
        bones.forEach((b, i) => {
            let q = [0, 0, 0, 1];
            const sg = b.side || 1;
            if (b.role === 'root') q = qmul(qa(Y, id === 'turn' ? .7 * ease(.2, .6, t) - .7 * ease(.7, 1, t) : 0), qa(X, .3 * h.ext * big + .08 * h.crouch - .12 * strike + (id === 'idle' ? .015 * Math.sin(ph * 2) : 0)));
            else if (b.role === 'chest') q = qmul(W[b.parent], qa(X, -.06 * h.ext - .1 * strike));
            else if (b.role === 'head') q = qmul(W[b.parent], qa(Y, id === 'idle' ? .06 * Math.sin(ph) : 0));
            else if (b.front) {
                const body = W[bones.findIndex(x => x.role === 'chest')];
                if (b.role === 'legUpper') q = qmul(body, qa(X, -.9 * h.reach - .5 * strike));
                else if (b.role === 'legLower') q = qmul(W[b.parent], qa(X, -.5 * h.reach - .3 * strike));
                else q = qmul(W[b.parent], qa(X, .4 * h.reach));
            } else {
                // Hind leg: unfold from the sitting Z into one line back and down.
                const e = h.ext * big;
                if (b.role === 'legUpper') q = qmul(W[0], qmul(qa(X, 2.75 * e), qa([0, 0, 1], -sg * .2 * e)));
                else if (b.role === 'legLower') q = qmul(W[0], qa(X, -.4 * e));
                else if (b.role === 'foot') q = qmul(W[0], qa(X, 2.75 * e));
                else q = qmul(W[b.parent], qa(X, -.4 * e));
            }
            W[i] = q;
        });
        return W;
    }
    const clipIds = () => ['idle', 'crawl', 'run', 'turn', 'attack'];

    const api = { GROUP, KINDS, TYPES, PALETTES, TYPE_EYE, TYPE_SIZE, handles, typeOf, withVariant, build, poseClip, clipIds, tilePictures };
    root.RRCreatureReptiles = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
