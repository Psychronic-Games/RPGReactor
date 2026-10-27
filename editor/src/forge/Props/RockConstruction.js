/**
 * RRRockConstruction - rocks for the Nature props: boulders, clusters,
 * cliffs and pillars, standing stones, natural arches and crystal
 * formations. Each is a distance field (convex cut planes for angular
 * stone, ellipsoids for worn stone, strata ledges, wedge cracks, arch
 * curves), drawn by surface nets and brought down by quadric decimation,
 * which leaves natural chipped facets; flat-shaded where the stone is
 * angular, smooth where it is worn. Crevices darken from the field itself;
 * moss, snow or sand rise out of the upper faces as cover shells; lichen
 * speckles the stone's picture. Crystals are faceted prisms; rune stones
 * carry glowing carved strokes.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Kit = need('RRNatureKit', './NatureKit.js');
    const Tex = need('RRNatureTexture', './NatureTexture.js');
    const { add, sub, scale, dot, cross, len, norm, mix, clamp, smooth, rotate, basis } = Kit.vec;

    /** [id, label, category, icon, family, sliders, size range, presets, keywords] as NatureProp's FORMS. */
    const FORMS = [
        ['boulder', 'Boulder', 'rocks', 'rock', 'rock', ['Width', 'Weathering'], [0.3, 10], [
            ['rounded', 'Worn boulder', { size: 1.8, character: 0.4 }], ['angular', 'Angular boulder', { size: 1.6, character: 0.3 }], ['layered', 'Layered boulder', { size: 2.2, stone: 'sandstone', cover: 'sand' }], ['split', 'Split boulder', { size: 2.4, character: 0.5 }]], 'stone rock boulder'],
        ['cluster', 'Rock cluster', 'rocks', 'rock', 'rock', ['Spread', 'Count'], [0.6, 12], [
            ['outcrop', 'Outcrop', { size: 3, character: 0.5 }], ['scree', 'Scree pile', { size: 2.2, character: 0.7, cover: 'none', stone: 'granite' }]], 'stones scree rubble'],
        ['cliff', 'Cliff & pillar', 'rocks', 'cliff', 'rock', ['Width', 'Erosion'], [1.5, 24], [
            ['cliff', 'Cliff chunk', { size: 7, character: 0.5 }], ['basalt', 'Basalt columns', { size: 5, stone: 'basalt', cover: 'none' }], ['hoodoo', 'Hoodoo', { size: 8, stone: 'redrock', cover: 'none', character: 0.6 }]], 'cliff pillar basalt columns hoodoo mesa'],
        ['standing', 'Standing stone', 'rocks', 'stone', 'rock', ['Width', 'Weathering'], [1, 8], [
            ['menhir', 'Menhir', { size: 3.2, character: 0.5 }], ['runestone', 'Rune stone', { size: 2.6, character: 0.3, cover: 'lichen', glow: 0.8 }], ['trilithon', 'Trilithon', { size: 4.2, character: 0.45 }]], 'menhir megalith monolith rune stonehenge circle'],
        ['arch', 'Natural arch', 'rocks', 'arch', 'rock', ['Span', 'Thickness'], [2, 25], [
            ['desert', 'Desert arch', { size: 7, stone: 'redrock', cover: 'sand', spread: 0.55 }], ['mossy', 'Mossy arch', { size: 5, stone: 'granite', cover: 'moss', spread: 0.4 }]], 'arch bridge rock'],
        ['crystal', 'Crystal formation', 'rocks', 'crystal', 'rock', ['Spread', 'Crystals'], [0.5, 10], [
            ['cluster', 'Crystal cluster', { size: 1.6, palette: 'violet', cover: 'none' }], ['geode', 'Geode', { size: 1.4, palette: 'teal', cover: 'none', character: 0.7 }], ['spire', 'Crystal spires', { size: 4.5, palette: 'ice', cover: 'snow', character: 0.4 }]], 'crystal geode gem amethyst quartz magic']
    ];

    /** The stones: picture style, its colors, and a broad tint for strata bands. */
    const STONES = {
        granite: ['granite', ['#4a4844', '#8a867e', '#c8c2b6'], 0.08],
        sandstone: ['sandstone', ['#8a5a3a', '#c08a5a', '#e8c08a', '#b0603a'], 0.16],
        basalt: ['basalt', ['#2e333a', '#58616c', '#8a939e'], 0.05],
        slate: ['slate', ['#2a2e34', '#4a525a', '#7a828a', '#5a4a3a'], 0.08],
        limestone: ['sandstone', ['#8a8478', '#bab4a6', '#e0dccf', '#a49a88'], 0.1],
        redrock: ['sandstone', ['#6a2a1a', '#a8482a', '#d8885a', '#8a3a20'], 0.18],
        volcanic: ['volcanic', ['#141012', '#2a2224', '#4a3a3a', '#c8501a'], 0.05],
        alien: ['alien', ['#1a1030', '#4a2a6a', '#8a6ab0', '#40e0d0'], 0.12]
    };
    /** Crystal and glow colors by palette: [deep, body, tip, glow]. */
    const GEMS = {
        teal: ['#0a4a52', '#24b4b8', '#c8fff4', '#40f0e0'], magenta: ['#4a0a3a', '#d03aa0', '#ffd0f0', '#ff4ad0'], violet: ['#2a0a52', '#7a4ad8', '#e8d8ff', '#a070ff'],
        amber: ['#5a2a06', '#e08a1a', '#fff0c0', '#ffb030'], toxic: ['#1a4a0a', '#6ad02a', '#eaffc0', '#9aff40'], crimson: ['#4a0610', '#c8202a', '#ffc8c0', '#ff3a3a'], ice: ['#1a3a5a', '#7ac0e8', '#f4fcff', '#9ae0ff']
    };

    // ── distance-field pieces ─────────────────────────────────────────────
    const sdEllipsoid = (p, c, r) => { const q = [(p[0] - c[0]) / r[0], (p[1] - c[1]) / r[1], (p[2] - c[2]) / r[2]], k = len(q); return (k - 1) * Math.min(r[0], r[1], r[2]); };
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return b * (1 - h) + a * h - k * h * (1 - h); };
    /** A convex stone: random cut planes round `c` within radii `r`. */
    function polytope(R, c, r, cuts, upright) {
        const planes = [];
        for (let i = 0; i < cuts; i++) {
            const z = (R.next() * 2 - 1) * (upright ? 0.3 : 1), a = R.next() * Math.PI * 2, s = Math.sqrt(1 - z * z), n = [s * Math.cos(a), z * 0.9, s * Math.sin(a)];
            // The plane's distance follows the ellipsoid's reach along its normal.
            const reach = Math.hypot(n[0] * r[0], n[1] * r[1], n[2] * r[2]) * (0.82 + R.next() * 0.16);
            planes.push([norm(n), reach]);
        }
        planes.push([[0, 1, 0], r[1] * (0.85 + R.next() * 0.1)]);
        return p => { const q = sub(p, c); let d = -Infinity; for (const [n, h] of planes) d = Math.max(d, dot(q, n) - h); return d; };
    }

    /**
     * A field solid as geometry: surface nets over its box, decimated to
     * `target`, laid with box uvs; `facet` how flat its faces shade. Crevice
     * darkening and strata tint go into the colors.
     */
    function solid(g, sdf, lo, hi, o) {
        const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), step = span / (o.res || 44);
        const nets = Kit.surfaceNets(sdf, lo, hi, step);
        const red = Kit.reduce(nets, o.target, sdf, step);
        const a = Math.max(0.04, span * 0.05), N = o.N, strata = o.strata || 0;
        return Kit.solidInto(g, red, {
            tile: o.tile, facet: o.facet,
            color: (p, n) => {
                const open = clamp(sdf(p[0] + n[0] * a, p[1] + n[1] * a, p[2] + n[2] * a) / a, 0, 1), ao = 0.5 + 0.5 * open;
                // Strata in broad, uneven bands by height, streaks of weathering down the faces, a tint per stone where given.
                const band = strata ? 1 - strata * 1.6 * smooth(-0.35, 0.55, N.n3(p[0] * 0.12, p[1] * 1.9, p[2] * 0.12) + 0.3 * N.n3(p[0] * 0.5, p[1] * 5, p[2] * 0.5)) : 1;
                const streak = 1 - 0.12 * smooth(0.1, 0.6, N.n3(p[0] * 2.5, p[1] * 0.25, p[2] * 2.5)) * (1 - Math.abs(n[1]));
                const v = ao * band * streak * (0.9 + 0.1 * N.n3(p[0] * 1.3, p[1] * 1.3, p[2] * 1.3)), t = o.tint ? o.tint(p) : [1, 1, 1];
                return Kit.linear([v * t[0], v * 0.99 * t[1], v * 0.97 * t[2]]);
            },
            sway: o.sway
        });
    }

    /** Hexagonal crystals: from `base` along `dir`, `L` long, `r` wide, with a pointed tip. Flat facets, colored deep to tip. */
    function prism(g, base, dir, L, r, gem, R, sides = 6) {
        const [u, v] = basis(dir), turn = R.next() * Math.PI, tipLen = r * (1.2 + R.next() * 0.8), body = Math.max(L - tipLen, L * 0.4);
        const ring = (h, rr) => Array.from({ length: sides }, (_, i) => { const a = turn + i / sides * Math.PI * 2; return add(add(base, scale(dir, h)), add(scale(u, Math.cos(a) * rr), scale(v, Math.sin(a) * rr))); });
        const low = ring(0, r * 0.92), high = ring(body, r), tip = add(base, scale(dir, L));
        const deep = Kit.linear(Kit.rgb(gem[1]).map(c => c * 0.55)), mid = Kit.linear(Kit.rgb(gem[1])), light = Kit.linear(Kit.rgb(gem[2]));
        const tri = (a, b, c, ca, cb, cc) => {
            const n = norm(cross(sub(b, a), sub(c, a))), s = g.P.length / 3;
            Kit.vert(g, a, n, 0, 0, ca); Kit.vert(g, b, n, 1, 0, cb); Kit.vert(g, c, n, 0.5, 1, cc);
            g.I.push(s, s + 1, s + 2);
        };
        for (let i = 0; i < sides; i++) {
            const j = (i + 1) % sides;
            tri(low[i], low[j], high[i], deep, deep, mid); tri(low[j], high[j], high[i], deep, mid, mid);
            tri(high[i], high[j], tip, mid, mid, light);
        }
        return g;
    }

    /** Rune strokes: short glowing grooves laid on the stone's face (+z), found by marching onto the field. */
    function runes(g, sdf, H, W, R) {
        const strokes = [], cols = 3, rows = 3, cw = W * 0.2, ch = H * 0.11, x0 = -cw * (cols - 1) / 2, y0 = H * 0.5;
        // A ring with a cross at the top: the stone's mark.
        const ringY = H * 0.74, ringR = W * 0.2, ring = [];
        for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; ring.push([Math.cos(a) * ringR, ringY + Math.sin(a) * ringR]); }
        strokes.push(ring);
        strokes.push([[0, ringY - ringR * 1.25], [0, ringY + ringR * 1.25]], [[-ringR * 1.25, ringY], [ringR * 1.25, ringY]]);
        for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
            // An invented glyph: a stem and two or three branches on a 3 x 4 grid.
            const cx = x0 + c * cw, cy = y0 - row * ch * 1.3, gx = k => cx + (k - 1) * cw * 0.3, gy = k => cy + (k - 1.5) * ch * 0.3;
            const stemX = Math.floor(R.next() * 3);
            strokes.push([[gx(stemX), gy(0)], [gx(stemX), gy(3)]]);
            for (let b = 0; b < 2 + Math.floor(R.next() * 2); b++) { const y = Math.floor(R.next() * 4), x = Math.floor(R.next() * 3); if (x !== stemX) strokes.push([[gx(stemX), gy(y)], [gx(x), gy(Math.min(3, Math.max(0, y + (R.next() < 0.5 ? -1 : 1))))]]); }
        }
        const surface = (x, y) => { let z = W; for (let i = 0; i < 80 && z > -W; i++) { const d = sdf(x, y, z); if (d < 0.002) break; z -= Math.max(0.003, d * 0.9); } return z; };
        for (const line of strokes) {
            const pts = [];
            for (let k = 0; k < line.length - 1; k++) for (let s = 0; s < (line.length > 2 ? 1 : 4); s++) { const t = s / (line.length > 2 ? 1 : 4), x = line[k][0] + (line[k + 1][0] - line[k][0]) * t, y = line[k][1] + (line[k + 1][1] - line[k][1]) * t; pts.push([x, y, surface(x, y) + 0.006]); }
            const e = line[line.length - 1]; pts.push([e[0], e[1], surface(e[0], e[1]) + 0.006]);
            Kit.ribbon(g, pts, () => Math.max(0.016, W * 0.022), k => { const t = norm(sub(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)])); return norm(cross(t, [0, 0, 1])); }, [0, 0, 1, 1], { fold: 0, normal: () => [0, 0, 1], color: () => [1, 1, 1] });
        }
        return g;
    }

    function build(r, cache, env, helpers) {
        const R = Kit.roll(r.seed * 31 + 17), N = Kit.noise(r.seed + 9), S = r.size, ch = r.character, sp = r.spread;
        const stone = STONES[r.stone] || STONES.granite, quick = env.quick, res = quick ? 30 : 46;
        const g = Kit.geo(), glow = Kit.geo(), gems = Kit.geo();
        const gem = GEMS[r.palette] || GEMS.violet;
        let sdf, lo, hi, target = 2600, facet = 0.25, strata = stone[2] * 0.5, tintFn = null;
        const disp = (p, f, a) => a * N.fbm3(p[0] * f, p[1] * f, p[2] * f, 4);
        // Ledges of uneven thickness: the layer coordinate wanders with height.
        const ledges = (y, L, depth) => { const f = (((y + L * 0.9 * N.n3(y / (L * 2.3), 1.7, 4.2)) / L) % 1 + 1) % 1; return depth * (1 - Math.pow(Math.sin(Math.PI * f), 0.35)); };
        const cut = (d, y) => Math.max(d, -y);
        if (r.form === 'boulder') {
            const W = S * (0.85 + sp * 0.6), D = S * (0.7 + sp * 0.3), H = S * 0.72;
            if (r.preset === 'angular' || r.preset === 'layered') {
                const poly = polytope(R, [0, H * 0.42, 0], [W / 2, H * 0.6, D / 2], 13 + Math.round(ch * 6));
                const L = S * 0.16;
                sdf = (x, y, z) => cut(poly([x, y, z]) + disp([x, y, z], 2.2 / S, S * (0.012 + ch * 0.02)) + (r.preset === 'layered' ? ledges(y + N.n3(x * 0.6, 0, z * 0.6) * L * 0.3, L, S * (0.02 + ch * 0.035)) : 0), y);
                facet = r.preset === 'angular' ? 1 : 0.6; target = r.preset === 'angular' ? 1300 : 2800; strata = r.preset === 'layered' ? stone[2] : strata;
            } else {
                const c = [0, H * 0.4, 0], rad = [W / 2, H * 0.6, D / 2];
                const crack = r.preset === 'split' ? norm([1, 0.05, (R.next() - 0.5) * 0.6]) : null;
                sdf = (x, y, z) => {
                    let d = sdEllipsoid([x, y, z], c, rad) + disp([x, y, z], 1.6 / S, S * (0.05 + ch * 0.07)) + Math.abs(N.n3(x * 4 / S, y * 4 / S, z * 4 / S)) * S * 0.025 * ch;
                    if (crack) d = Math.max(d, -(Math.abs(dot([x, y - H * 0.1, z], crack) + N.n3(y * 1.5 / S, z * 1.5 / S, 3) * S * 0.04) - S * (0.008 + 0.03 * smooth(0, H, y))));
                    return cut(d, y);
                };
                facet = 0.3 + ch * 0.2; target = 2800;
            }
            lo = [-S * 1.1, -0.05, -S * 1.1]; hi = [S * 1.1, S * 1.0, S * 1.1];
        } else if (r.form === 'cluster') {
            const count = (r.preset === 'scree' ? 9 : 4) + Math.round(ch * (r.preset === 'scree' ? 14 : 8)), stones = [], reach = S * (0.6 + sp * 0.8);
            for (let i = 0; i < count; i++) {
                const a = R.next() * Math.PI * 2, d = i === 0 ? 0 : reach * Math.sqrt(R.next()) * 0.8, s = (i === 0 ? 1 : 0.35 + R.next() * 0.55) * S * (r.preset === 'scree' ? 0.42 : 0.6);
                // Scree piles up: stones near the middle sit higher, on the ones below.
                const lift = r.preset === 'scree' ? S * 0.35 * Math.max(0, 1 - d / reach) * (0.5 + R.next()) : s * 0.3;
                stones.push(polytope(R, [Math.cos(a) * d, lift, Math.sin(a) * d], [s * (0.6 + R.next() * 0.4), s * (0.45 + R.next() * 0.3), s * (0.6 + R.next() * 0.4)], 11));
            }
            const k = r.preset === 'outcrop' ? S * 0.08 : 0.001;
            sdf = (x, y, z) => { let d = stones[0]([x, y, z]); for (let i = 1; i < stones.length; i++) d = r.preset === 'outcrop' ? smin(d, stones[i]([x, y, z]), k) : Math.min(d, stones[i]([x, y, z])); return cut(d + disp([x, y, z], 2.5 / S, S * 0.012), y); };
            lo = [-reach - S, -0.05, -reach - S]; hi = [reach + S, S * 0.9, reach + S];
            facet = r.preset === 'scree' ? 1 : 0.6; target = r.preset === 'scree' ? 3600 : 3600;
            // Each stone its own shade: warmer, cooler, lighter, darker.
            const tones = stones.map(() => { const l = 0.72 + R.next() * 0.45, w = (R.next() - 0.5) * 0.16; return [l * (1 + w), l, l * (1 - w)]; });
            tintFn = p => { let bi = 0, bd = Infinity; for (let i = 0; i < stones.length; i++) { const d = stones[i](p); if (d < bd) { bd = d; bi = i; } } return tones[bi]; };
        } else if (r.form === 'cliff' && r.preset !== 'basalt') {
            const H = S, W = S * (0.45 + sp * 0.6), D = W * 0.7;
            if (r.preset === 'hoodoo') {
                const L = H * 0.09;
                sdf = (x, y, z) => {
                    const t = y / H, rr = W * 0.32 * (1.15 - 0.45 * t) * (1 - ch * 0.35 * Math.pow(Math.sin(Math.PI * clamp((t - 0.55) / 0.35, 0, 1)), 2));
                    let d = Math.hypot(x, z * 1.15) - rr + ledges(y + N.n3(x, 0, z) * L * 0.2, L, W * 0.04 * (0.5 + ch)) + disp([x, y, z], 3 / H, W * 0.06);
                    const cap = sdEllipsoid([x, y, z], [W * 0.05, H * 0.93, 0], [W * 0.42, H * 0.07, W * 0.36]) + disp([x, y, z], 4 / H, W * 0.03);
                    d = Math.min(Math.max(d, y - H * 0.88), cap);
                    return cut(d, y);
                };
                lo = [-W, -0.05, -W]; hi = [W, H * 1.05, W]; facet = 0.35; target = 3800; strata = stone[2] * 1.2;
            } else {
                const poly = polytope(R, [0, H * 0.48, 0], [W / 2, H * 0.55, D / 2], 12, true), L = H * 0.12;
                sdf = (x, y, z) => {
                    const c = N.cells(((x / (W * 0.9)) % 1 + 1) % 1, ((z / (W * 0.9)) % 1 + 1) % 1, 3, 3, 0.8), joint = smooth(0.12, 0, c.d2 - c.d1) * W * 0.05;
                    return cut(poly([x, y, z]) + joint + ledges(y, L, W * (0.01 + ch * 0.03)) + disp([x, y, z], 2 / H, W * 0.04) + smooth(H * 0.8, H, y) * W * 0.04 * ch, y);
                };
                lo = [-W, -0.05, -W]; hi = [W, H * 1.1, W]; facet = 0.55; target = 3800; strata = stone[2];
            }
        } else if (r.form === 'standing') {
            const H = S, W = S * (r.preset === 'runestone' ? 0.38 : 0.24) * (0.8 + sp * 0.6), D = W * (r.preset === 'runestone' ? 0.4 : 0.55), lean = (R.next() - 0.5) * 0.08;
            const slab = (cx, w, h, d, tilt) => (x, y, z) => {
                const t = clamp(y / h, 0, 1), xx = (x - cx - y * tilt), k = 1 - 0.28 * t;
                const q = [xx / (w / 2 * k), (y - h * 0.47) / (h * 0.5), z / (d / 2 * (1 - 0.15 * t))], m = Math.max(Math.abs(q[0]), Math.abs(q[2]));
                return (Math.max(Math.pow(Math.pow(Math.abs(q[0]), 4) + Math.pow(Math.abs(q[2]), 4), 0.25), Math.abs(q[1]) * 0.98) - 1) * Math.min(w / 2, d / 2) + 0 * m;
            };
            let parts;
            if (r.preset === 'trilithon') {
                const gap = W * 1.15, ph = H * 0.78;
                const a = slab(-gap / 2 - W * 0.35, W * 0.7, ph, D, 0), b = slab(gap / 2 + W * 0.35, W * 0.7, ph, D, 0);
                const lintel = (x, y, z) => (Math.max(Math.abs(x) / (gap / 2 + W * 0.85), Math.abs(y - (ph + H * 0.09)) / (H * 0.09), Math.abs(z) / (D * 0.5)) - 1) * Math.min(H * 0.09, D * 0.5);
                parts = (x, y, z) => Math.min(a(x, y, z), b(x, y, z), lintel(x, y, z));
                lo = [-gap - W * 1.4, -0.05, -D]; hi = [gap + W * 1.4, H * 1.0, D];
            } else {
                parts = slab(0, W, H, D, lean);
                lo = [-W, -0.05, -D * 1.2]; hi = [W, H * 1.05, D * 1.2];
            }
            sdf = (x, y, z) => cut(parts(x, y, z) + disp([x, y, z], 2.5 / H, W * (0.03 + ch * 0.06)) + Math.abs(N.n3(x * 7 / H, y * 7 / H, z * 7 / H)) * W * 0.02 * ch, y);
            facet = 0.3; target = r.preset === 'trilithon' ? 3800 : 2400;
            if (r.preset === 'runestone') runes(glow, sdf, H, W, R);
        } else if (r.form === 'arch') {
            const H = S, span = S * (0.9 + sp * 1.0), th = S * (0.12 + ch * 0.1), depth = th * 1.6, curve = [];
            for (let k = 0; k <= 28; k++) { const a = Math.PI * k / 28; curve.push([-Math.cos(a) * span / 2, Math.sin(a) * (H - th * 0.9) + th * 0.1 * Math.sin(a * 3)]); }
            const L = H * 0.08;
            sdf = (x, y, z) => {
                let best = Infinity, bt = 0;
                for (let k = 0; k < curve.length - 1; k++) {
                    const a = curve[k], b = curve[k + 1], ab = [b[0] - a[0], b[1] - a[1]], t = clamp(((x - a[0]) * ab[0] + (y - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1]), 0, 1);
                    const d = Math.hypot(x - a[0] - ab[0] * t, y - a[1] - ab[1] * t);
                    if (d < best) { best = d; bt = (k + t) / (curve.length - 1); }
                }
                const thick = th * (1 + 1.3 * Math.pow(Math.abs(bt - 0.5) * 2, 3)), zk = depth / th;
                let d = Math.hypot(best, z / zk) - thick;
                d = smin(d, sdEllipsoid([x, y, z], [-span / 2, 0, 0], [th * 2, th * 2.4, depth * 1.4]), th * 0.6);
                d = smin(d, sdEllipsoid([x, y, z], [span / 2, 0, 0], [th * 2, th * 2.4, depth * 1.4]), th * 0.6);
                return cut(d + ledges(y + N.n3(x * 0.3, 0, z * 0.3) * L * 0.3, L, th * 0.1) + disp([x, y, z], 1.6 / H, th * 0.3) + Math.abs(N.n3(x * 5 / H, y * 5 / H, z * 5 / H)) * th * 0.12, y);
            };
            lo = [-span / 2 - th * 3, -0.05, -depth * 2]; hi = [span / 2 + th * 3, H + th * 0.5, depth * 2];
            facet = 0.4; target = 3800; strata = stone[2];
        } else if (r.form === 'crystal') {
            const geode = r.preset === 'geode', B = geode ? S / 2 : S * (r.preset === 'spire' ? 0.28 : 0.4) * (0.8 + sp * 0.5);
            if (geode) {
                const Rr = B, open = norm([0.15, 0.55, 1]);
                sdf = (x, y, z) => { const p = [x, y - Rr * 0.85, z], outer = len(p) - Rr + disp([x, y, z], 3 / S, Rr * 0.08), inner = Rr * 0.74 - len(p) + disp([x + 5, y, z], 4 / S, Rr * 0.04); return cut(Math.max(outer, inner, dot(p, open) - Rr * 0.05), y); };
                lo = [-Rr * 1.3, -0.05, -Rr * 1.3]; hi = [Rr * 1.3, Rr * 2.1, Rr * 1.3]; target = 1800; facet = 0.3;
                // Crystals lining the hollow, pointing to its middle.
                const c = [0, Rr * 0.85, 0], n = Math.round(60 + ch * 90);
                for (let i = 0; i < n; i++) {
                    let d = norm([R.next() - 0.5, R.next() - 0.5, R.next() - 0.5]);
                    if (dot(d, open) > -0.05) d = norm(sub(d, scale(open, dot(d, open) + 0.25)));
                    const base = add(c, scale(d, Rr * 0.76)), L = Rr * (0.12 + R.next() * 0.16);
                    prism(gems, base, norm(add(scale(d, -1), scale([R.next() - 0.5, R.next() - 0.5, R.next() - 0.5], 0.5))), L, L * 0.22, gem, R);
                }
            } else {
                const poly = polytope(R, [0, B * 0.25, 0], [B, B * 0.45, B * 0.9], 12);
                sdf = (x, y, z) => cut(poly([x, y, z]) + disp([x, y, z], 3 / S, B * 0.06), y);
                lo = [-B * 1.3, -0.05, -B * 1.3]; hi = [B * 1.3, B * 1.0, B * 1.3]; target = 1200; facet = 0.7;
                const spire = r.preset === 'spire', n = Math.round((spire ? 5 : 9) + ch * (spire ? 8 : 16));
                for (let i = 0; i < n; i++) {
                    const big = i < (spire ? 3 : 2), a = R.next() * Math.PI * 2, tilt = big ? R.next() * 0.25 : 0.25 + R.next() * 0.7 * (0.5 + sp * 0.6);
                    const dir = norm([Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)]);
                    const L = (spire ? S : S * 0.75) * (big ? 0.75 + R.next() * 0.25 : 0.25 + R.next() * 0.4), rr = L * (spire ? 0.09 : 0.14) * (0.8 + R.next() * 0.4);
                    const base = [Math.cos(a) * B * 0.3 * R.next(), B * 0.2, Math.sin(a) * B * 0.3 * R.next()];
                    prism(gems, base, dir, L, rr, gem, R);
                }
            }
        }
        if (r.form === 'cliff' && r.preset === 'basalt') {
            // Hexagonal columns standing in a tight honeycomb: tops stepped and tilted with chamfered rims, cross-joints
            // cut round the taller ones, each column its own grey-blue, darker and stained toward the ground.
            const rr = S * 0.08, W = S * (0.35 + sp * 0.45), rows = Math.ceil(W / (rr * 1.5)), cols = [];
            for (let q = -rows; q <= rows; q++) for (let k = -rows; k <= rows; k++) {
                const x = rr * 1.732 * (q + k / 2), z = rr * 1.5 * k;
                if (Math.hypot(x, z * 1.3) > W) continue;
                const fall = 1 - Math.hypot(x, z) / W;
                const h = S * clamp(0.2 + 0.8 * fall * (0.65 + 0.55 * N.n3(x * 1.3 / S + 3, 0, z * 1.3 / S)) + (R.next() - 0.5) * 0.16, 0.06, 1);
                cols.push([x, z, h]);
            }
            const joint = Math.max(0.25, S * 0.12);
            for (const [x, z, h] of cols) {
                const tilt = [(R.next() - 0.5) * 0.3, 1, (R.next() - 0.5) * 0.3], top = norm(tilt), tone = 0.78 + R.next() * 0.32, warm = (R.next() - 0.5) * 0.08, lichen = R.next() < 0.25 ? 0.12 + R.next() * 0.15 : 0;
                const col = (c, y) => { const ground = 0.62 + 0.38 * smooth(0, S * 0.25, y); const v = tone * c * ground; return Kit.linear([v * (1 + warm + lichen * 0.6), v * (1 + lichen * 0.5), v * (1 - warm - lichen * 0.4)]); };
                const ring = (k, y) => Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2 + Math.PI / 6; return [x + Math.cos(a) * rr * k, y, z + Math.sin(a) * rr * k]; });
                const topY = (px, pz) => h - ((px - x) * top[0] + (pz - z) * top[2]) / top[1];
                const face = (a, b, c, d, cl, u0) => { const n = norm(cross(sub(b, a), sub(d, a))), s0 = g.P.length / 3; Kit.vert(g, a, n, u0, -a[1] / 1.2, cl(a[1])); Kit.vert(g, b, n, u0 + rr / 1.2, -b[1] / 1.2, cl(b[1])); Kit.vert(g, c, n, u0 + rr / 1.2, -c[1] / 1.2, cl(c[1])); Kit.vert(g, d, n, u0, -d[1] / 1.2, cl(d[1])); g.I.push(s0, s0 + 1, s0 + 2, s0, s0 + 2, s0 + 3); };
                // Sides in drums, a shallow groove at each cross-joint.
                const levels = [0];
                for (let y = joint * (0.6 + R.next() * 0.8); y < h - rr * 0.6; y += joint * (0.7 + R.next() * 0.7)) levels.push(y);
                let lower = ring(0.97, 0);
                for (let j = 1; j <= levels.length; j++) {
                    const last = j === levels.length;
                    const upper = last ? ring(0.97, 0).map(p => [p[0], topY(p[0], p[2]), p[2]]) : ring(0.97, levels[j] - rr * 0.06);
                    for (let i = 0; i < 6; i++) { const n = (i + 1) % 6; face(lower[n], lower[i], upper[i], upper[n], y => col(0.85, y), i * rr / 1.2); }
                    if (!last) {
                        const groove = ring(0.9, levels[j]), next = ring(0.97, levels[j] + rr * 0.06);
                        for (let i = 0; i < 6; i++) { const n = (i + 1) % 6; face(upper[n], upper[i], groove[i], groove[n], y => col(0.6, y), i * rr / 1.2); face(groove[n], groove[i], next[i], next[n], y => col(0.7, y), i * rr / 1.2); }
                        lower = next;
                    }
                }
                const cap = ring(0.97, 0).map(p => [p[0], topY(p[0], p[2]), p[2]]), cc = [x, h, z];
                const inner = cap.map(p => add(mix(p, cc, 0.2), scale(top, rr * 0.07)));
                for (let i = 0; i < 6; i++) { const n = (i + 1) % 6; face(cap[n], cap[i], inner[i], inner[n], () => col(1.0, h), i * rr / 1.2); }
                const s0 = g.P.length / 3;
                for (const p of inner) Kit.vert(g, p, top, p[0] / 1.2, p[2] / 1.2, col(1.12, h));
                for (let i = 1; i < 5; i++) g.I.push(s0, s0 + i + 1, s0 + i);
            }
        } else if (sdf) {
            solid(g, sdf, lo, hi, { res, target: quick ? target * 0.6 : target, facet, tile: Math.max(0.8, Math.min(3, S * 0.45)), N, strata, tint: tintFn });
        }
        // Cover: moss, snow or sand out of the upper faces; lichen is painted into the stone.
        const covers = {}, kind = r.cover;
        if (['moss', 'snow', 'sand'].includes(kind) && Kit.count(g)) {
            const top = Math.max(...g.P.filter((_, i) => i % 3 === 1));
            const mask = kind === 'snow' ? (p, n) => smooth(0.3, 0.65, n[1]) * (0.8 + 0.35 * N.n3(p[0] * 2, p[1] * 2, p[2] * 2))
                : kind === 'sand' ? (p, n) => Math.max(smooth(0.55, 0.85, n[1]) * (0.55 + 0.6 * N.n3(p[0] * 1.5, 0, p[2] * 1.5)), smooth(top * 0.18, 0, p[1]) * smooth(-0.2, 0.4, n[1]))
                : (p, n) => smooth(0.05, 0.6, n[1] + 0.25 * N.n3(p[0], p[1], p[2])) * (0.5 + 0.7 * N.n3(p[0] * 1.2 + 4, p[1] * 1.2, p[2] * 1.2)) + smooth(top * 0.3, 0, p[1]) * 0.35;
            covers[kind] = Kit.cover(g, 0, g.P.length / 3, mask, clamp(S * 0.012, 0.01, 0.06), { tile: kind === 'moss' ? 0.5 : 0.9 });
        }
        // Pictures.
        const out = { parts: [], textures: {}, swayDegrees: 0 }, size = quick ? 256 : 512;
        const lichen = kind === 'lichen' ? 0.85 : kind === 'moss' ? 0.3 : 0;
        const pic = helpers.picture(cache, ['rock', r.stone, lichen, size].join('|'), () => Tex.rock(stone[0], stone[1], size, 11, lichen));
        // Each stone's own names, so two stones in one project never share a picture by accident.
        out.textures[pic.albedo.name] = pic.albedo; out.textures[pic.normal.name] = pic.normal;
        out.parts.push([g, { name: 'Stone', texture: pic.albedo.name, normalTexture: pic.normal.name, normalScale: 1, roughness: r.stone === 'volcanic' ? 0.7 : 0.9 }]);
        if (Kit.count(gems)) out.parts.push([gems, { name: 'Crystal', roughness: 0.12, metalness: 0.05, emissive: gem[3], emissiveIntensity: 0.15 + r.glow * 0.6 }]);
        if (Kit.count(glow)) out.parts.push([glow, { name: 'Runes', color: gem[3], vertexColors: false, roughness: 0.4, emissive: gem[3], emissiveIntensity: 0.25 + r.glow * 0.75 }]);
        helpers.coverParts(out, covers, cache, env);
        return out;
    }

    const api = { FORMS, STONES, GEMS, build, prism, polytope, smin };
    root.RRRockConstruction = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
