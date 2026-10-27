/**
 * RRPlantConstruction - bushes and plants for the Nature props: shrubs (and
 * a topiary ball in its pot), hedges, ferns and the tree fern, grasses,
 * reeds and pampas, flowers (sunflowers, tulips, lavender), cacti, succulent
 * rosettes, mushroom clusters, and ivy climbing a wall or hanging as a
 * curtain. Leaves are alpha-cut cards laid twice over (front and back on one
 * set of outward normals); stems, pads and fleshy leaves are real geometry.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Kit = need('RRNatureKit', './NatureKit.js');
    const Tex = need('RRNatureTexture', './NatureTexture.js');
    const Trees = need('RRTreeConstruction', './TreeConstruction.js');
    const { add, sub, scale, dot, cross, len, norm, mix, clamp, smooth, rotate, basis, lerp } = Kit.vec;
    const UP = [0, 1, 0];

    const FORMS = [
        ['shrub', 'Shrub', 'plants', 'bush', 'plant', ['Spread', 'Density'], [0.3, 5], [
            ['leafy', 'Leafy shrub', { size: 1.4 }], ['flowering', 'Flowering shrub', { size: 1.3, season: 'spring' }], ['berry', 'Berry bush', { size: 1.2 }], ['topiary', 'Topiary ball', { size: 1.6, character: 0.7 }]], 'bush shrub azalea berry topiary'],
        ['hedge', 'Hedge', 'plants', 'bush', 'plant', ['Length', 'Wildness'], [0.4, 4], [
            ['trimmed', 'Trimmed hedge', { size: 1.3, character: 0.15 }], ['wild', 'Wild hedge', { size: 1.5, character: 0.85 }], ['flowering', 'Flowering hedge', { size: 1.3, character: 0.4, season: 'spring' }]], 'hedge hedgerow wall garden'],
        ['fern', 'Fern', 'plants', 'fern', 'plant', ['Spread', 'Fronds'], [0.3, 8], [
            ['fern', 'Fern', { size: 0.9 }], ['treefern', 'Tree fern', { size: 4 }]], 'fern bracken jungle forest'],
        ['grass', 'Tall grass', 'plants', 'grass', 'plant', ['Spread', 'Density'], [0.3, 4], [
            ['meadow', 'Grass tuft', { size: 0.8 }], ['pampas', 'Pampas grass', { size: 2.2 }], ['reeds', 'Reeds & cattails', { size: 1.8 }]], 'grass reeds cattail pampas tuft'],
        ['flowers', 'Flowering plant', 'plants', 'flower', 'plant', ['Spread', 'Blooms'], [0.2, 4], [
            ['sunflower', 'Sunflowers', { size: 1.9 }], ['tulips', 'Tulips', { size: 0.5, season: 'spring' }], ['lavender', 'Lavender', { size: 0.7 }]], 'flowers sunflower tulip lavender garden'],
        ['cactus', 'Cactus', 'plants', 'cactus', 'plant', ['Girth', 'Arms'], [0.3, 12], [
            ['saguaro', 'Saguaro', { size: 5, character: 0.5 }], ['barrel', 'Barrel cactus', { size: 0.8 }], ['pricklypear', 'Prickly pear', { size: 1.5, character: 0.6 }]], 'cactus desert saguaro prickly pear'],
        ['succulent', 'Succulent', 'plants', 'succulent', 'plant', ['Spread', 'Leaves'], [0.1, 3], [
            ['echeveria', 'Echeveria', { size: 0.3 }], ['agave', 'Agave', { size: 1.4 }], ['aloe', 'Aloe', { size: 0.9 }]], 'succulent agave aloe rosette desert'],
        ['mushroom', 'Mushrooms', 'plants', 'mushroom', 'plant', ['Spread', 'Count'], [0.1, 3], [
            ['toadstool', 'Fly agaric', { size: 0.35 }], ['porcini', 'Porcini', { size: 0.3 }], ['chanterelle', 'Chanterelles', { size: 0.16, character: 0.6 }], ['morel', 'Morels', { size: 0.2 }],
            ['shiitake', 'Shiitake', { size: 0.16, character: 0.6 }], ['oyster', 'Oyster shelf', { size: 0.35 }], ['puffball', 'Puffballs', { size: 0.12 }], ['glowcap', 'Glowcaps', { size: 0.3, character: 0.7 }]], 'mushroom toadstool fungi fly agaric porcini bolete chanterelle morel shiitake oyster puffball glowing forest'],
        ['ivy', 'Ivy & vines', 'plants', 'vine', 'plant', ['Width', 'Coverage'], [0.5, 8], [
            ['ivy', 'Climbing ivy', { size: 2.5, spread: 0.4 }], ['hanging', 'Hanging vines', { size: 2.5, spread: 0.4 }]], 'ivy vines creeper wall curtain jungle']
    ];

    const L = (family, season) => Trees.leafSet(family, season);

    /** A tiling picture of densely packed leaves, deep shade between them: the inside of a clipped hedge. */
    function foliage(palette, size, snow) {
        const N = Kit.noise(71), cols = palette.map(h => Kit.rgb(h)), shade = [0.05, 0.09, 0.04];
        return Tex.paint('hedge-mass-' + palette.join('').replace(/#/g, '') + (snow ? '-snow' : ''), size, (u, v) => {
            // Two layers of leaf cells; the nearer one covers the far one, dark hollows only where both are at their edges.
            const a = N.cells(u, v, 14, 14, 0.95), b = N.cells(u + 0.37, v + 0.21, 22, 22, 0.95), f = N.fbm2(u, v, 6, 6, 3);
            const la = 1 - smooth(0.25, 0.5, a.d1), lb = 1 - smooth(0.2, 0.45, b.d1);
            const ca = cols[Math.abs(a.id) % cols.length], cb = cols[Math.abs(b.id * 7 + 3) % cols.length];
            const top = la > lb * 0.85 ? 0 : 1, leaf = top ? lb : la, col = top ? cb : ca, vein = top ? b : a;
            const lit = 0.55 + 0.45 * leaf + 0.12 * f - (Math.abs(vein.d2 - vein.d1) < 0.04 ? 0.15 : 0);
            let c = [0, 1, 2].map(k => shade[k] + (col[k] * lit - shade[k]) * smooth(0, 0.35, leaf));
            if (snow) { const w = smooth(0.1, 0.5, f + leaf * 0.4); c = c.map(x => x + (0.92 - x) * w * 0.8); }
            return { c, h: Math.max(la, lb * 0.8) * 0.8 + f * 0.2 };
        }, 4);
    }

    // ── mushrooms ──────────────────────────────────────────────────────────
    /**
     * Each kind: cap shape and size against the stem's height, stem radius
     * (against the cap's), its stem profile, the underside (gills, pores or
     * ridges), ring and volva, colors, and spots.
     */
    const MUSHROOMS = {
        toadstool: { cap: 'convex', capR: 0.42, h: 1, stemR: 0.2, stem: [1.3, 1.0, 0.92, 0.9], under: 'gills', ring: true, volva: true, colors: { cap: ['#b0140c', '#e8401c'], under: '#f2eee0', stem: '#f2efe6', spot: '#fbf8ee' }, spots: { count: 52, size: 0.1, lift: 0.42 } },
        porcini: { cap: 'bun', capR: 0.5, h: 0.72, stemR: 0.46, stem: [1.25, 1.45, 1.15, 0.85], under: 'pores', colors: { cap: ['#5a3016', '#b07a44'], under: '#d8c46a', stem: '#e6dcbe' } },
        chanterelle: { cap: 'funnel', capR: 0.38, h: 0.8, stemR: 0.18, stem: [0.6, 0.7, 0.95, 1.5], under: 'ridges', wavy: 0.14, colors: { cap: ['#e07a08', '#ffc23a'], under: '#f6a824', stem: '#f2b23a' } },
        morel: { cap: 'cone', capR: 0.28, h: 0.5, stemR: 0.62, stem: [1.2, 1.02, 0.96, 1.0], smoothStem: true, under: 'none', honeycomb: true, colors: { cap: ['#3a2614', '#b08a56'], under: '#e8dcc0', stem: '#f0e6cc' } },
        shiitake: { cap: 'umbrella', capR: 0.48, h: 0.5, stemR: 0.14, stem: [0.9, 1.0, 1.0, 1.1], under: 'gills', colors: { cap: ['#3e2010', '#8a5430'], under: '#f0e6d0', stem: '#dccaa8', spot: '#f2eadc' }, spots: { count: 34, size: 0.06, lift: 0.08, flat: true, rim: true } },
        oyster: { cap: 'shelf', capR: 0.34, h: 0.15, stemR: 0.14, stem: [1, 1, 1, 1.2], under: 'gills', shelf: true, wavy: 0.1, colors: { cap: ['#6a665c', '#beb6a4'], under: '#efe9dc', stem: '#e4dccb' } },
        puffball: { cap: 'ball', capR: 0.32, h: 0.06, stemR: 0.5, stem: [1, 1, 1, 1], under: 'none', colors: { cap: ['#e4dccb', '#fbf8f1'], under: '#d8d0c0', stem: '#e8e2d4', spot: '#fffdf8' }, spots: { count: 70, size: 0.05, lift: 0.9, pointy: true } },
        glowcap: { cap: 'bell', capR: 0.28, h: 1, stemR: 0.17, stem: [1.3, 1.0, 0.95, 0.9], under: 'gills', glow: true, colors: { cap: ['#123a78', '#3a8ad8'], under: '#8ae8ff', stem: '#c4d6e0', spot: '#b8ffff' }, spots: { count: 26, size: 0.09, lift: 0.5 } }
    };
    /** Season: open (0 closed button, 1 flat and upturned), size, count, decay, how many spots stay, the ground. */
    const MUSH_SEASONS = {
        spring: { open: 0.08, size: 0.68, count: 0.85, decay: 0, fresh: 0.18, spots: 1.3, buttons: 0.45, ground: 'moss' },
        summer: { open: 0.5, size: 1, count: 1, decay: 0, fresh: 0, spots: 1, buttons: 0.12 },
        autumn: { open: 0.78, size: 1.12, count: 1.3, decay: 0.12, fresh: -0.04, spots: 0.85, buttons: 0.1, ground: 'leaves' },
        bare: { open: 1, size: 1, count: 1, decay: 0.75, fresh: -0.15, spots: 0.3, buttons: 0, ground: 'rot', droop: 1 },
        snow: { open: 0.6, size: 0.95, count: 0.8, decay: 0.25, fresh: 0, spots: 0.7, buttons: 0, ground: 'snow', frost: true }
    };
    const hexl = h => Kit.linear(Kit.rgb(h));
    const cmix = (a, b, t) => [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * t);

    /** A surface of revolution round `axis` at `o`: `prof` [[r, y]...] from the rim up and in faces out (`inside` turns it). */
    function lathe(g, o, axis, prof, sides, opt = {}) {
        const u = basis(axis)[0], w = cross(u, axis), start = g.P.length / 3, n = prof.length;
        for (let j = 0; j < n; j++) {
            const [r, y] = prof[j], pr = prof[Math.max(0, j - 1)], nx = prof[Math.min(n - 1, j + 1)];
            let nr = nx[1] - pr[1], ny = -(nx[0] - pr[0]); if (opt.inside) { nr = -nr; ny = -ny; }
            const nl = Math.hypot(nr, ny) || 1; nr /= nl; ny /= nl;
            for (let i = 0; i < sides; i++) {
                const a = i / sides * Math.PI * 2, t = n > 1 ? j / (n - 1) : 0, m = opt.mod ? opt.mod(a, t) : 1;
                const radial = add(scale(u, Math.cos(a)), scale(w, Math.sin(a))), p = add(o, add(scale(radial, r * m), scale(axis, y)));
                Kit.vert(g, p, norm(add(scale(radial, nr), scale(axis, ny))), i / sides, t, opt.color ? opt.color(p, t, a) : [1, 1, 1], 0);
            }
        }
        for (let j = 0; j + 1 < n; j++) for (let i = 0; i < sides; i++) {
            const a = start + j * sides + i, b = start + j * sides + (i + 1) % sides, c = a + sides, d = b + sides;
            if (opt.inside) g.I.push(a, b, c, b, d, c); else g.I.push(a, c, b, b, c, d);
        }
        if (opt.smooth) Kit.smoothNormals(g, start);
        return g;
    }
    /** A cap's profile [[r, y]] from the rim to the crown, in cap radii: `open` 0 a closed button, 1 flat or turned up. */
    function capProfile(shape, open, steps) {
        const out = [];
        for (let s = 0; s <= steps; s++) {
            const t = s / steps, ang = t * Math.PI / 2, c = Math.cos(ang), sn = Math.sin(ang);
            let r, y;
            if (shape === 'convex') { r = Math.pow(c, lerp(0.75, 1.2, open)); y = lerp(1.05, 0.3, open) * Math.pow(sn, 0.8) - lerp(0.3, -0.06, open) * Math.pow(1 - t, 3); }
            else if (shape === 'bun') { r = Math.pow(c, 0.5); y = lerp(0.9, 0.55, open) * Math.pow(sn, 0.75) - 0.2 * Math.pow(1 - t, 3); }
            else if (shape === 'funnel') { r = 1 - t; y = lerp(0.12, 0.32, open) * Math.pow(1 - t, 1.3) - lerp(0, 0.12, open) * Math.sin(Math.PI * t) * 0.5 + 0.04 * t; }
            else if (shape === 'cone') { r = Math.pow(Math.max(0, 1 - Math.pow(t, 1.4)), 0.7) * (1 + 0.12 * Math.sin(Math.PI * t)); y = t * lerp(2.1, 2.5, 1 - open) + 0.05; }
            else if (shape === 'umbrella') { r = Math.pow(c, 0.9); y = lerp(0.62, 0.26, open) * Math.pow(sn, 0.85) - lerp(0.26, 0.1, open) * Math.pow(1 - t, 3); }
            else if (shape === 'bell') { r = Math.pow(c, 0.42) * (1 + 0.1 * Math.pow(1 - t, 4) * open); y = lerp(1.1, 0.7, open) * Math.pow(sn, 0.9) - 0.08 * Math.pow(1 - t, 2); }
            else if (shape === 'shelf') { r = Math.pow(c, 1.1); y = lerp(0.3, 0.14, open) * sn - 0.08 * Math.pow(1 - t, 3) * (1 - open); }
            else { /* ball */ const b = -Math.PI / 2 + Math.PI * Math.min(1, 0.18 + t * 0.82); r = Math.cos(b) * (1 + 0.05 * Math.sin(b * 2)); y = (Math.sin(b) + 1) * lerp(0.95, 0.8, open); }
            out.push([r, y]);
        }
        return out;
    }

    function growMushrooms(c) {
        const { R, N, S, sp, ch, season, preset, flesh, extra, glowing, stems, litter, tone } = c;
        const M = MUSHROOMS[preset] || MUSHROOMS.toadstool, SE = MUSH_SEASONS[season] || MUSH_SEASONS.summer, col = M.colors;
        const rot = hexl('#3a2a1c'), tint = (h, k = 1) => { const v = hexl(h); return cmix(v.map(x => x * (1 + SE.fresh)), rot, SE.decay * 0.55 * k); };
        const capC = [tint(col.cap[0]), tint(col.cap[1])], underC = tint(col.under, 0.8), stemC = tint(col.stem, 0.6), spotC = col.spot ? tint(col.spot, 0.7) : null;
        const glow = !!M.glow, capGeo = extra, spotGeo = glow ? glowing : extra, underGeo = glow ? glowing : extra;
        let n = Math.min(11, Math.max(2, Math.round((3 + ch * 8) * SE.count)));
        const shelf = M.shelf, stump = { r: S * 0.55, h: S * 1.15 };
        if (shelf) {
            // Oysters grow in overlapping shelves from a stump.
            const pts = []; for (let k = 0; k <= 4; k++) pts.push([N.n3(k * 0.7, 0, 0) * S * 0.03, stump.h * k / 4, N.n3(0, k * 0.7, 0) * S * 0.03]);
            Kit.tube(stems, pts, k => stump.r * (1.18 - 0.18 * k / 4 + (k === 0 ? 0.12 : 0)), { sides: 14, uRepeat: 2, vScale: 0.6, color: () => tone(0.9), capEnd: true });
            n = Math.max(3, Math.round((4 + ch * 7) * SE.count));
        }
        const placed = [];
        for (let i = 0; i < n; i++) {
            const button = i > 0 && R.next() < SE.buttons, open = button ? 0 : clamp(SE.open + (R.next() - 0.5) * 0.25, 0, 1);
            let k = (i === 0 ? 1 : 0.45 + R.next() * 0.5) * SE.size * (button ? 0.45 : 1);
            let base, axis, h, cr = S * k * M.capR, sr = cr * M.stemR;
            if (shelf) {
                const a = -1.2 + (i / Math.max(1, n - 1)) * 2.4 + (R.next() - 0.5) * 0.4 + (i % 2) * 0.2, out = [Math.sin(a), 0, Math.cos(a)], y = stump.h * (0.25 + 0.65 * (1 - i / n)) + (R.next() - 0.5) * S * 0.1;
                cr = S * (0.65 + R.next() * 0.4) * M.capR * 1.6 * SE.size; sr = cr * M.stemR;
                const surface = add([0, y, 0], scale(out, stump.r * 0.98));
                axis = norm(add(scale(out, 0.55 - (SE.droop || 0) * 0.3), [0, 0.85, 0]));
                base = add(surface, scale(out, -cr * 0.08));
                h = cr * 0.35;
                const top = add(base, add(scale(out, cr * 0.55), scale(axis, h * 0.4)));
                Kit.tube(flesh, [base, mix(base, top, 0.5), top], kk => sr * [1.4, 1.1, 1][kk], { sides: 8, color: () => stemC, capStart: true });
                placed.push({ top, axis, cr, sr, h, open, out });
            } else {
                let at = null;
                for (let tries = 0; tries < 8 && !at; tries++) {
                    const a = R.next() * Math.PI * 2, d = i === 0 ? 0 : S * 1.6 * (0.35 + sp) * (0.35 + 0.65 * Math.sqrt(R.next())), p = [Math.cos(a) * d, 0, Math.sin(a) * d];
                    if (placed.every(q => Math.hypot(q.base[0] - p[0], q.base[2] - p[2]) > (q.cr + cr) * 0.55)) at = p;
                }
                base = at || [(R.next() - 0.5) * S, 0, (R.next() - 0.5) * S];
                h = S * k * M.h * (button ? 0.5 : 1);
                const leanK = 0.25 + (SE.droop || 0) * 0.35;
                axis = norm([(R.next() - 0.5) * leanK, 1, (R.next() - 0.5) * leanK]);
                const top = add(base, scale(axis, h)), sp4 = M.stem;
                // A morel's stem is smooth, pale and hollow-looking: no ribbed stalk texture, a soft creamy sheen.
                if (M.smoothStem) lathe(extra, base, axis, [[sr * sp4[0], 0], [sr * (sp4[0] + sp4[1]) / 2, h * 0.2], [sr * sp4[1], h * 0.45], [sr * sp4[2], h * 0.75], [sr * sp4[3], h * 1.02]], 16, { smooth: true, color: (p, t) => stemC.map(x => x * (0.86 + 0.14 * t + 0.04 * N.n3(p[0] * 50, p[1] * 20, p[2] * 50))) });
                else Kit.tube(flesh, [base, add(base, scale(axis, h * 0.33)), add(base, scale(axis, h * 0.66)), top], kk => sr * sp4[kk], { sides: 12, color: (kk, p) => cmix(stemC, stemC.map(x => x * 0.82), (p ? 1 - clamp((p[1] - base[1]) / h, 0, 1) : 0) * 0.5), capStart: true });
                if (M.ring && !button) {
                    const rp = add(base, scale(axis, h * 0.72));
                    const skirt = [[sr * 1.75, -h * 0.11], [sr * 1.45, -h * 0.06], [sr * 1.02, 0]];
                    lathe(extra, rp, axis, skirt, 12, { color: () => stemC, mod: (a) => 1 + 0.06 * Math.sin(a * 7) });
                    lathe(extra, rp, axis, skirt.map(([r, y]) => [r * 0.97, y]), 12, { inside: true, color: () => stemC.map(x => x * 0.85) });
                }
                if (M.volva) {
                    lathe(extra, base, axis, [[sr * 1.55, 0], [sr * 1.75, h * 0.05], [sr * 1.5, h * 0.11], [sr * 1.05, h * 0.15]], 12, { color: () => stemC });
                    for (let q = 0; q < (k > 0.75 ? 7 : 0); q++) { const a = q / 7 * Math.PI * 2 + R.next(), u0 = basis(axis)[0], w0 = cross(u0, axis), rad = add(scale(u0, Math.cos(a)), scale(w0, Math.sin(a))); wart(spotGeo, add(add(base, scale(axis, h * (0.08 + 0.05 * (q % 2)))), scale(rad, sr * 1.62)), rad, sr * 0.22, sr * 0.14, spotC || stemC, false); }
                }
                placed.push({ base, top, axis, cr, sr, h, open });
            }
        }
        // Detail shared out so a big cluster keeps within the budget: the spots by cap area.
        const sumA = placed.reduce((s2, m) => s2 + m.cr * m.cr, 0), fine = clamp(Math.sqrt(7 / placed.length), 0.6, 1), capSides = Math.round(24 * fine), gillScale = fine * fine;
        for (const m of placed) {
            const { top, axis, cr, sr, open } = m, steps = M.cap === 'cone' ? 12 : 8, prof = capProfile(M.cap, open, steps).map(([r, y]) => [r * cr, y * cr]);
            // The crown droops in decay, and the cap sits a little down over the stem's top.
            const capAxis = SE.droop ? norm(add(axis, [(R.next() - 0.5) * 0.5, 0, (R.next() - 0.5) * 0.5])) : axis;
            const o = M.cap === 'ball' ? m.base || top : add(top, scale(capAxis, -cr * 0.08));
            const ph = R.next() * 6.28, outA = m.out ? (() => { const u0 = basis(capAxis)[0], w0 = cross(u0, capAxis); return Math.atan2(dot(m.out, w0), dot(m.out, u0)); })() : 0;
            const mod = (a, t) => {
                let v = 1;
                if (M.wavy) v *= 1 + M.wavy * Math.sin(a * 5 + ph) * Math.pow(1 - t, 1.5) * (0.4 + open);
                if (M.shelf) v *= 0.72 + 0.4 * Math.cos(a - outA);
                if (M.honeycomb) { const cc = N.cells(a / (Math.PI * 2), t * 0.999, 7, 5, 0.85); v *= 0.86 + 0.14 * (1 - smooth(0, 0.16, cc.d2 - cc.d1)); }
                if (M.cap === 'ball' && SE.droop) v *= 1 + 0.08 * N.n3(Math.cos(a) * 3, t * 4, Math.sin(a) * 3);
                return v;
            };
            const capColor = (p, t, a) => {
                let cc = cmix(capC[1], capC[0], Math.pow(t, 1.2));
                const nz = N.n3(p[0] * 60, p[1] * 60, p[2] * 60);
                cc = cc.map(x => x * (0.92 + 0.12 * nz));
                if (M.honeycomb) { const q = N.cells(a / (Math.PI * 2), t * 0.999, 7, 5, 0.85), ridge = 1 - smooth(0, 0.16, q.d2 - q.d1); cc = cmix(capC[0], capC[1], ridge); }
                if (M.cap === 'ball' && SE.decay > 0.1 || M.cap === 'ball' && season === 'autumn') cc = cmix(cc, hexl('#8a6a3a'), season === 'autumn' ? 0.55 : 0.75);
                if (M.cap === 'ball' && (season === 'autumn' || season === 'bare') && t > 0.93) cc = hexl('#2a1e14');
                return cc;
            };
            const prof2 = M.cap === 'ball' && SE.droop ? prof.map(([r, y]) => [r * 1.12, y * 0.62]) : prof;
            lathe(capGeo, o, capAxis, prof2, M.honeycomb ? 24 : capSides, { mod, color: capColor, smooth: !!M.honeycomb || M.cap === 'ball' && !!SE.droop });
            // The underside: gills, pores or ridges running down the stem.
            if (M.under !== 'none') {
                const rim = prof2[0], depth = M.under === 'ridges' ? m.h * 0.38 : cr * 0.12, gillN = Math.round((M.under === 'ridges' ? 22 : 36) * gillScale);
                const under = [[rim[0] * 0.99, rim[1]], [lerp(rim[0], sr, 0.5), rim[1] + (M.under === 'ridges' ? -depth * 0.35 : cr * 0.03)], [sr * 1.02, rim[1] - depth + cr * 0.02]];
                lathe(underGeo, o, capAxis, under, gillN * 2, { inside: true, mod: (a, t) => mod(a, 0) * (t === 0 ? 1 : 1), color: (p, t, a) => {
                    if (M.under === 'pores') return underC.map(x => x * (0.88 + 0.16 * N.n3(p[0] * 90, p[1] * 90, p[2] * 90)));
                    const stripe = (Math.round(a / (Math.PI * 2) * gillN * 2) % 2) ? 1 : 0.55;
                    return underC.map(x => x * lerp(1, stripe, t < 0.99 ? 1 : 0.4));
                } });
            }
            // Spots: raised warts and patches of every size over the cap (or flecks near the rim).
            if (M.spots && spotC) {
                const sp0 = M.spots, area = cr / (S * M.capR), count = Math.round(Math.min(sp0.count * SE.spots * clamp(area, 0.35, 1.4), Math.max(6, (M.cap === 'ball' ? 260 : M.ring ? 135 : 200) * fine * fine * SE.spots * cr * cr / sumA)));
                const weights = prof2.map(([r], j) => (j === prof2.length - 1 ? 0.2 : r) * (sp0.rim ? (j < prof2.length * 0.55 ? 1 : 0.15) : 1)), total = weights.reduce((s, v) => s + v, 0);
                for (let q = 0; q < count; q++) {
                    let pick = R.next() * total, j = 0; while (j < prof2.length - 2 && pick > weights[j]) { pick -= weights[j]; j++; }
                    const f = R.next(), r = lerp(prof2[j][0], prof2[j + 1][0], f), y = lerp(prof2[j][1], prof2[j + 1][1], f), t = (j + f) / (prof2.length - 1);
                    if (!sp0.rim && t < 0.08) continue;
                    const a = R.next() * Math.PI * 2, u0 = basis(capAxis)[0], w0 = cross(u0, capAxis), radial = add(scale(u0, Math.cos(a)), scale(w0, Math.sin(a)));
                    const dr = prof2[j + 1][0] - prof2[j][0], dy = prof2[j + 1][1] - prof2[j][1], nl = Math.hypot(dr, dy) || 1, nn = norm(add(scale(radial, dy / nl), scale(capAxis, -dr / nl)));
                    const big = R.next() < 0.22, rw = cr * sp0.size * (big ? 1.35 + R.next() * 0.6 : 0.4 + R.next() * 0.7), rh = rw * (sp0.pointy ? 0.85 : sp0.flat ? 0.12 : big ? 0.28 : sp0.lift);
                    const p = add(o, add(scale(radial, r * mod(a, t)), scale(capAxis, y)));
                    wart(spotGeo, add(p, scale(nn, -rh * 0.15)), nn, rw, rh, spotC.map(x => x * (0.93 + R.next() * 0.1)), sp0.pointy);
                }
            }
            // Frost on what faces up.
            if (SE.frost) {
                const from = Math.floor(prof2.length * 0.45), shell = prof2.slice(from).map(([r, y], jj, arr) => { const tt = jj / (arr.length - 1); return [r * (1 + 0.02) , y + cr * (0.01 + 0.05 * tt)]; });
                lathe(capGeo, o, capAxis, shell, capSides, { mod: (a, t) => mod(a, 0.3 + t * 0.7) * (1 + 0.05 * N.n3(Math.cos(a) * 4, t * 3, Math.sin(a) * 4)), color: () => hexl('#eef3fa') });
            }
        }
        // The ground round the foot: fresh moss, fallen leaves, rot, or snow.
        const spreadR = S * (shelf ? 1.1 : 1.6 * (0.35 + sp) + 0.3);
        if (SE.ground) {
            const gc = { moss: '#3e6a1e', leaves: '#34501c', rot: '#33281c', snow: '#e8eef6' }[SE.ground];
            // Patches round each foot (round the stump for a shelf), uneven at the edge.
            const spots = shelf ? [{ base: [0, 0, 0], r: stump.r * 1.7 }] : placed.map(m => ({ base: m.base, r: m.cr * (1.3 + R.next() * 0.6) + S * 0.06 }));
            for (const g0 of spots) {
                // A soft, irregular patch: a lobed outline from two scales of noise, thinning to nothing at the rim,
                // its color sinking toward the floor's grey there so it blends rather than ending on a hard edge.
                const ph2 = R.next() * 9, lift = SE.ground === 'snow' ? 0.05 : 0.03, edgeC = hexl(SE.ground === 'snow' ? '#7a8490' : '#2a2a28');
                const lobes = a => 0.62 + 0.3 * (0.5 + 0.5 * N.n3(Math.cos(a) * 1.4 + ph2, 0, Math.sin(a) * 1.4)) + 0.12 * N.n3(Math.cos(a) * 4 + ph2, 1, Math.sin(a) * 4);
                lathe(litter, [g0.base[0], 0, g0.base[2]], UP, [[g0.r, 0], [g0.r * 0.86, S * lift * 0.25], [g0.r * 0.6, S * lift * 0.75], [g0.r * 0.25, S * lift], [0, S * lift * 1.05]], spots.length > 8 ? 12 : 18,
                    { smooth: true, mod: (a, t) => lobes(a) * (1 + 0.05 * N.n3(Math.cos(a) * 9, t * 3, Math.sin(a) * 9)), color: (p, t) => cmix(edgeC, hexl(gc).map(x => x * (0.85 + 0.3 * N.n3(p[0] * 40, 0, p[2] * 40))), smooth(0, 0.45, t)) });
            }
            if (SE.ground === 'leaves' || SE.ground === 'rot') {
                const leafCols = SE.ground === 'leaves' ? ['#c8501a', '#e0901e', '#a83018', '#d8b030', '#8a4a1e'] : ['#4a3420', '#5a4028', '#3a2a1a', '#6a5032'];
                const nl = Math.round((14 + sp * 14) * (placed.length > 8 ? 0.7 : 1));
                for (let q = 0; q < nl; q++) {
                    const a = R.next() * Math.PI * 2, d = spreadR * (0.3 + 0.75 * Math.sqrt(R.next())), c0 = [Math.cos(a) * d, 0, Math.sin(a) * d], th = R.next() * Math.PI * 2, Ll = S * (0.22 + R.next() * 0.16);
                    const along = [Math.cos(th), 0, Math.sin(th)], side = [-along[2], 0, along[0]], cc = hexl(leafCols[Math.floor(R.next() * leafCols.length)]), lift = S * 0.05 + R.next() * S * 0.02, curl = (R.next() - 0.3) * 0.5;
                    const start = litter.P.length / 3, pts = 7;
                    Kit.vert(litter, add(c0, [0, lift + Ll * 0.05, 0]), UP, 0.5, 0.5, cc, 0);
                    for (let e = 0; e < pts * 2; e++) {
                        const sgn = e < pts ? 1 : -1, tt = e < pts ? e / (pts - 1) : 1 - (e - pts) / (pts - 1), wd = Math.pow(Math.sin(Math.PI * tt), 0.8) * Ll * 0.24 * sgn;
                        const p = add(add(c0, scale(along, (tt - 0.5) * Ll)), scale(side, wd));
                        Kit.vert(litter, [p[0], lift + curl * Math.abs(wd) * 1.2, p[2]], UP, 0, 0, cc.map(x => x * (0.75 + 0.25 * tt)), 0);
                    }
                    for (let e = 0; e < pts * 2; e++) { const a1 = start + 1 + e, b1 = start + 1 + (e + 1) % (pts * 2); litter.I.push(start, a1, b1); }
                    // Wound so the face looks up.
                    for (let t3 = litter.I.length - pts * 6; t3 < litter.I.length; t3 += 3) { const A = litter.I[t3], B = litter.I[t3 + 1], C = litter.I[t3 + 2], pa = litter.P.slice(A * 3, A * 3 + 3), pb = litter.P.slice(B * 3, B * 3 + 3), pc = litter.P.slice(C * 3, C * 3 + 3); if (cross(sub(pb, pa), sub(pc, pa))[1] < 0) { litter.I[t3 + 1] = C; litter.I[t3 + 2] = B; } }
                }
            }
        }
    }
    /** A raised wart or patch on a surface: a low dome along `n`. */
    function wart(g, at, n, rw, rh, color, pointy) {
        lathe(g, at, n, pointy ? [[rw, -rh * 0.2], [rw * 0.5, rh * 0.5], [0, rh]] : [[rw, -rh * 0.3], [rw * 0.78, rh * 0.6], [0, rh]], 5, { color: () => color });
    }

    function build(r, cache, env, helpers) {
        const R = Kit.roll(r.seed * 97 + 13), N = Kit.noise(r.seed + 33), S = r.size, sp = r.spread, ch = r.character, season = r.season, form = r.form, preset = r.preset;
        const stems = Kit.geo(), leaves = Kit.geo(), flesh = Kit.geo(), extra = Kit.geo(), glowing = Kit.geo(), litter = Kit.geo();
        const sway = p => clamp(Math.pow(Math.max(0, p[1]) / S, 1.3), 0, 1);
        const bare = season === 'bare' || season === 'snow';
        let cells = null, barkStyle = ['shaggy', ['#2a2018', '#5a4632', '#8a7050']], fleshStyle = null, swayDeg = 3, leafRough = 0.9;
        const cardList = [];
        let hedgeMass = null, hedgePalette = null, hedgeArea = 0;
        const lin = c => Kit.linear(c);
        const tone = (v) => lin([v, v, v]);

        if (form === 'shrub' && preset !== 'topiary') {
            // Woody stems fan out from the foot to leafy clumps round a dome; the clumps' cards lie on it.
            const W = S * (0.8 + sp * 0.7), c = [0, S * 0.52, 0], rad = [W / 2, S * 0.5, W / 2 * (0.85 + R.next() * 0.2)];
            const clumps = Math.round(14 + ch * 14);
            for (let i = 0; i < clumps; i++) {
                const y = 1 - 1.6 * (i + 0.5) / clumps, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996, d = norm([Math.cos(a) * rr, y, Math.sin(a) * rr]);
                const center = add(c, [d[0] * rad[0] * 0.78, d[1] * rad[1] * 0.78, d[2] * rad[2] * 0.78]);
                const foot = [d[0] * S * 0.08, 0, d[2] * S * 0.08];
                Kit.tube(stems, [foot, mix(foot, center, 0.45).map((v, k) => k === 1 ? v + S * 0.05 : v), center], (k) => S * 0.016 * (1 - k * 0.3), { sides: 4, color: () => tone(0.8), sway, capEnd: true });
                const per = Math.round(10 + ch * 8);
                for (let k = 0; k < per; k++) {
                    const off = norm([R.next() - 0.5, R.next() - 0.5, R.next() - 0.5]), at = add(center, scale(off, S * 0.16 * R.next()));
                    const out = norm([(at[0] - c[0]) / rad[0], (at[1] - c[1]) / rad[1], (at[2] - c[2]) / rad[2]]);
                    cardList.push({ at: add(at, scale(out, S * 0.06)), d: out, r: 0.01, t: 1, level: 2, out });
                }
            }
            const palette = L('broad', season);
            cells = preset === 'flowering' && season === 'spring' ? Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'ovate', palette, count: 14, len: 0.2, wid: 0.5, flowers: 10 + i * 2, petals: ['#e8508a', '#f070a0', '#d83a78', '#f8a0c0'], center: '#f8e080' })))
                : preset === 'berry' ? Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'ovate', teeth: 12, palette, count: 14, len: 0.22, wid: 0.5, flowers: 0 }))).map((c, i) => Object.assign(c, { painter: 'sprig', count: 11, berries: bare ? 0 : 8 + i, berryColors: season === 'autumn' ? ['#7a1a3a', '#4a1a4a'] : ['#c8202a', '#a01020', '#e03a2a'] }))
                    : Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: i % 2 ? 'ovate' : 'round', palette, count: 20, len: 0.2, wid: 0.6 })));
            swayDeg = 2;
        } else if (form === 'shrub') {
            // Topiary: a clipped ball on a clear stem, in a terracotta pot.
            const potH = S * 0.22, potR = S * 0.17, ball = S * 0.3 * (0.8 + sp * 0.3), cy = S - ball;
            const pot = [[potR * 0.75, 0], [potR * 0.8, potH * 0.05], [potR, potH * 0.85], [potR * 1.1, potH * 0.88], [potR * 1.1, potH], [potR * 0.92, potH], [potR * 0.9, potH * 0.93]];
            Kit.tube(extra, pot.map(p => [0, p[1], 0]), k => pot[k][0], { sides: 24, color: () => lin([0.75, 0.38, 0.22]), capEnd: true, capStart: true, up: [1, 0, 0] });
            Kit.tube(stems, [[0, potH * 0.9, 0], [0, cy - ball * 0.5, 0], [0, cy, 0]], S * 0.018, { sides: 6, color: () => tone(0.8), sway, capEnd: true });
            Kit.blob(extra, [0, potH * 0.9, 0], [potR * 0.88, potH * 0.06, potR * 0.88], { sides: 16, rings: 4, color: () => lin([0.25, 0.18, 0.12]) });
            const n = Math.round(260 + ch * 260), c = [0, cy, 0];
            for (let i = 0; i < n; i++) {
                const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996, d = [Math.cos(a) * rr, y, Math.sin(a) * rr];
                cardList.push({ at: add(c, scale(d, ball * (0.72 + R.next() * 0.12))), d, r: 0.01, t: 1, level: 2, out: d });
            }
            cells = Trees.grid([0, 1, 2, 3].map(() => ({ painter: 'cluster', shape: 'round', palette: L('broad', season === 'autumn' ? 'summer' : season), count: 26, len: 0.16, wid: 0.65 })));
        } else if (form === 'hedge') {
            const H = S, Lg = S * (1.2 + sp * 4), D = S * 0.6, wild = ch, half = [Lg / 2, H / 2, D / 2], c = [0, H / 2, 0], k = 0.12 * H;
            // The clipped surface: a rounded box, lumpier where it grows wild.
            const lump = p => wild * H * 0.34 * Math.max(0, N.n3(p[0] * 1.3, p[1] * 1.3, p[2] * 1.3) + 0.2) + H * 0.025 * N.n3(p[0] * 5, p[1] * 5, p[2] * 5);
            const onBox = p => { const q = p.map((v, d) => clamp(v, -half[d] + k, half[d] - k)), dn = norm(sub(p, q)); return { q, dn }; };
            // A solid leafy mass inside the cards, so no sky shows between them; the cards overlap round it.
            hedgeMass = Kit.geo();
            const coords = (h, step) => { const m = Math.max(1, Math.round((2 * (h - k)) / step)), e = [-h, -h + k * 0.25, -h + k * 0.6]; const mid = Array.from({ length: m + 1 }, (_, i) => -h + k + (2 * (h - k)) * i / m); return e.concat(mid, e.map(v => -v).reverse()); };
            // A grid fine enough to carry the lumps, coarse enough on a big hedge to leave the leaves their share.
            const massStep = Math.max(0.22, Math.sqrt((Lg * H * 2 + Lg * D + H * D * 2) * 2 / 1800));
            for (let ax = 0; ax < 3; ax++) for (const sgn of [-1, 1]) {
                if (ax === 1 && sgn < 0) continue;
                const u = (ax + 1) % 3, v = (ax + 2) % 3, A = coords(half[u], massStep), B = coords(half[v], massStep), base = hedgeMass.P.length / 3;
                for (const b of B) for (const a of A) {
                    const p = [0, 0, 0]; p[ax] = sgn * half[ax]; p[u] = a; p[v] = b;
                    const { q, dn } = onBox(p), at = add(add(c, q), scale(dn, k * 0.82 + lump(p) * 0.85)), wp = add(c, p);
                    // Planar mapping per face, a leaf tile about 0.4 m across.
                    const uv = ax === 1 ? [wp[0], wp[2]] : ax === 0 ? [wp[2], wp[1]] : [wp[0], wp[1]];
                    Kit.vert(hedgeMass, at, dn, uv[0] / 0.4, uv[1] / 0.4, tone(0.55 + 0.45 * smooth(0, H, at[1])), sway(at) * 0.5);
                }
                for (let j = 0; j + 1 < B.length; j++) for (let i = 0; i + 1 < A.length; i++) {
                    const a = base + j * A.length + i, b2 = a + 1, c2 = a + A.length, d2 = c2 + 1;
                    const pa = hedgeMass.P.slice(a * 3, a * 3 + 3), pb = hedgeMass.P.slice(b2 * 3, b2 * 3 + 3), pc = hedgeMass.P.slice(c2 * 3, c2 * 3 + 3), nn = hedgeMass.N.slice(a * 3, a * 3 + 3);
                    if (dot(cross(sub(pb, pa), sub(pc, pa)), nn) >= 0) hedgeMass.I.push(a, b2, c2, b2, d2, c2); else hedgeMass.I.push(a, c2, b2, b2, c2, d2);
                }
            }
            Kit.smoothNormals(hedgeMass);
            // Leaf clusters close and overlapping over the whole surface, a few loose at the edges.
            const area = Lg * H * 2 + Lg * D + H * D * 2, n = Math.round(Math.min(3200, area * 120 * (0.85 + wild * 0.3)));
            hedgeArea = area;
            for (let i = 0; i < n; i++) {
                let p = [(R.next() * 2 - 1) * half[0], (R.next() * 2 - 1) * half[1], (R.next() * 2 - 1) * half[2]];
                const pick = R.next() * area, ax = pick < Lg * H * 2 ? 2 : pick < Lg * H * 2 + Lg * D ? 1 : 0, sgn = ax === 1 ? 1 : R.next() < 0.5 ? 1 : -1;
                p[ax] = sgn * half[ax];
                const { q, dn } = onBox(p), edge = Math.max(...p.map((v, d) => d === ax ? 0 : smooth(half[d] - k * 1.2, half[d], Math.abs(v))));
                const at = add(add(c, q), scale(dn, k + lump(p) - 0.05 + edge * 0.04 * R.next()));
                cardList.push({ at, d: dn, r: 0.01, t: 1, level: 2, out: dn, scale: 0.85 + edge * 0.3 + wild * 0.25 * R.next() });
            }
            // A few woody stems show at the foot.
            for (let i = 0; i < Math.round(Lg * 3); i++) { const x = (R.next() - 0.5) * Lg * 0.9, z = (R.next() - 0.5) * D * 0.6; Kit.tube(stems, [[x, 0, z], [x + (R.next() - 0.5) * 0.1, H * 0.3, z], [x, H * 0.6, z]], S * 0.02, { sides: 4, color: () => tone(0.7), capEnd: true }); }
            const palette = L('broad', season);
            cells = preset === 'flowering' && !bare ? Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: 'ovate', palette, count: 16, len: 0.18, wid: 0.55, flowers: season === 'spring' || season === 'summer' ? 8 + i * 2 : 0, petals: ['#f8f4f0', '#f0e0f0', '#fff8e0'], center: '#f0d060' })))
                : Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'cluster', shape: i % 2 ? 'round' : 'ovate', palette, count: 26, len: 0.16, wid: 0.6 })));
            hedgePalette = season === 'bare' ? ['#4a4230', '#6a5a40', '#857258'] : palette;
            swayDeg = 1;
        } else if (form === 'fern') {
            const tree = preset === 'treefern', crownY = tree ? S * 0.82 : 0.02, fr = tree ? S * 0.45 : S * 1.1, n = Math.round((tree ? 14 : 12) + ch * 10);
            if (tree) {
                const pts = [];
                for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([N.n3(t * 2, 0, 0) * S * 0.04, crownY * t, N.n3(0, t * 2, 0) * S * 0.04]); }
                Kit.tube(stems, pts, k => S * 0.055 * (1.25 - 0.3 * k / 8 + 0.6 * Math.exp(-k)), { sides: 12, uRepeat: 2, vScale: 0.6, color: () => tone(0.85), sway, capEnd: true });
                barkStyle = ['shaggy', ['#1e140c', '#4a3220', '#7a5a38']];
            }
            const top = tree ? [0, crownY, 0] : [0, 0.02, 0];
            for (let i = 0; i < n; i++) {
                const a = i * 2.39996 + R.next() * 0.3, age = (i + 0.5) / n, el = (tree ? 0.75 : 1.05) - age * (tree ? 0.9 : 0.8) + (R.next() - 0.5) * 0.2;
                let d = norm([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
                const Lf = fr * (0.75 + R.next() * 0.35) * (0.8 + sp * 0.4), pts = [add(top, scale(d, 0.02))];
                let q = pts[0];
                for (let k = 1; k <= 8; k++) { d = norm(add(d, [0, -0.13 * (k / 8 + 0.3), 0])); q = add(q, scale(d, Lf / 8)); pts.push(q); }
                (leaves.fronds = leaves.fronds || []).push({ pts, side: [-Math.sin(a), 0, Math.cos(a)], w: Lf * 0.17 });
                Kit.tube(flesh, pts, k => S * (tree ? 0.012 : 0.012) * (1 - k / 9) + 0.002, { sides: 3, color: () => lin([0.4, 0.45, 0.25]), sway, capEnd: true });
            }
            // Fiddleheads unrolling at the heart.
            for (let i = 0; i < 3 + Math.round(ch * 3); i++) {
                const a = R.next() * Math.PI * 2, out = [Math.cos(a), 0, Math.sin(a)], side = [-out[2], 0, out[0]], h = fr * 0.35 * (0.6 + R.next() * 0.5), pts = [];
                for (let k = 0; k <= 16; k++) { const t = k / 16; if (t < 0.6) pts.push(add(top, add(scale(UP, h * t / 0.6), scale(out, h * 0.2 * t)))); else { const u = (t - 0.6) / 0.4, ang = u * Math.PI * 1.7, rr = h * 0.14 * (1 - u * 0.6); pts.push(add(add(top, add(scale(UP, h), scale(out, h * 0.12))), add(scale(UP, Math.sin(ang) * rr), scale(out, (1 - Math.cos(ang)) * rr)))); } }
                void side;
                Kit.tube(flesh, pts, k => S * (tree ? 0.012 : 0.01) * (1 - k / 20), { sides: 5, color: () => lin([0.42, 0.55, 0.22]), sway, capEnd: true });
            }
            cells = Trees.strips([0, 1, 2, 3].map(i => ({ painter: 'frond', bipinnate: true, palette: L(season === 'autumn' ? 'willow' : 'birch', season === 'autumn' ? 'autumn' : season), stem: '#5a6a30', count: 22 + i * 2, peak: 0.5 })));
            swayDeg = tree ? 1.5 : 3;
        } else if (form === 'grass') {
            const tufts = Math.round(1 + sp * 4), dens = 8 + Math.round(ch * 10);
            for (let t = 0; t < tufts; t++) {
                const a = R.next() * Math.PI * 2, d = t === 0 ? 0 : S * 0.35 * Math.sqrt(R.next()), base = [Math.cos(a) * d, 0, Math.sin(a) * d];
                for (let i = 0; i < dens; i++) {
                    const yaw = i / dens * Math.PI + R.next() * 0.4, side = [Math.cos(yaw), 0, Math.sin(yaw)], tilt = (R.next() - 0.5) * 0.35;
                    const up = norm(add(UP, scale(cross(side, UP), tilt))), h = S * (0.75 + R.next() * 0.35);
                    (leaves.crossed = leaves.crossed || []).push([add(base, scale(side, (R.next() - 0.5) * 0.05)), up, side, h * (preset === 'meadow' ? 0.5 : 0.42), h]);
                }
                if (preset === 'reeds') for (let k = 0; k < 2 + Math.round(ch * 3); k++) {
                    // Cattails: a brown velvet head on a straight stalk.
                    const bx = add(base, [(R.next() - 0.5) * 0.15, 0, (R.next() - 0.5) * 0.15]), h = S * (0.95 + R.next() * 0.25), lean = [(R.next() - 0.5) * 0.08, 1, (R.next() - 0.5) * 0.08];
                    const top = add(bx, scale(norm(lean), h));
                    Kit.tube(flesh, [bx, mix(bx, top, 0.5), top], S * 0.008, { sides: 4, color: () => lin([0.4, 0.45, 0.2]), sway, capEnd: true });
                    const hb = add(bx, scale(norm(lean), h * 0.78));
                    Kit.tube(extra, [hb, add(hb, scale(norm(lean), h * 0.06)), add(hb, scale(norm(lean), h * 0.12))], S * 0.022, { sides: 8, color: () => lin([0.28, 0.16, 0.08]), sway, capEnd: true, capStart: true });
                }
            }
            const greens = season === 'autumn' ? ['#b8a050', '#a08a40', '#c8b468'] : season === 'bare' || season === 'snow' ? ['#a89870', '#b8a880', '#988a60'] : preset === 'pampas' ? ['#7a8a5a', '#8a9a62', '#6a7a4e'] : L('willow', season);
            cells = Trees.strips([0, 1, 2, 3].map(i => ({ painter: 'blades', palette: greens, count: preset === 'meadow' ? 30 : 22, wid: preset === 'reeds' ? 0.07 : 0.045, plumes: preset === 'pampas' && i < 3 ? 3 : 0, plumeColors: ['#efe6d0', '#e4d8bc', '#f6f0e2'], plumeStem: '#b0a070' })));
            swayDeg = 4;
        } else if (form === 'flowers') {
            if (preset === 'sunflower') {
                const n = 1 + Math.round(ch * 4);
                for (let i = 0; i < n; i++) {
                    const a = R.next() * Math.PI * 2, d = i === 0 ? 0 : S * 0.15 * (0.5 + sp) * (0.6 + R.next() * 0.4), base = [Math.cos(a) * d, 0, Math.sin(a) * d], h = S * (0.75 + R.next() * 0.25);
                    const face = norm([Math.cos(0.6) + (R.next() - 0.5) * 0.6, 0.15, Math.sin(0.6) + (R.next() - 0.5) * 0.6]), top = add(base, [face[0] * 0.08, h, face[2] * 0.08]);
                    Kit.tube(flesh, [base, add(base, [0, h * 0.5, 0]), add(top, scale(face, -0.05)), top], S * 0.012, { sides: 6, color: () => lin([0.35, 0.5, 0.2]), sway, capEnd: true });
                    const hr = S * 0.09;
                    // The head: a domed disc of seeds facing out, its petals round it.
                    const [u, v] = basis(face), ring = (rr, off) => Array.from({ length: 17 }, (_, k) => { const ang = k / 16 * Math.PI * 2; return add(add(top, scale(face, off)), add(scale(u, Math.cos(ang) * rr), scale(v, Math.sin(ang) * rr))); });
                    Kit.tube(extra, [add(top, scale(face, -hr * 0.25)), add(top, scale(face, -hr * 0.1)), add(top, scale(face, hr * 0.05)), add(top, scale(face, hr * 0.12))], k => [hr * 0.5, hr * 1.0, hr * 0.98, hr * 0.6][k], { sides: 18, color: k => lin(k < 2 ? [0.3, 0.4, 0.15] : [0.24, 0.13, 0.05]), sway, capEnd: true, capStart: true });
                    void ring;
                    for (let k = 0; k < 22; k++) { const ang = k / 22 * Math.PI * 2, dir = norm(add(scale(u, Math.cos(ang)), scale(v, Math.sin(ang)))); (leaves.petals = leaves.petals || []).push([add(top, add(scale(dir, hr * 0.85), scale(face, 0.01))), norm(add(dir, scale(face, 0.15))), norm(cross(face, dir)), hr * 0.42, hr * 0.85]); }
                    for (let k = 0; k < 4; k++) { const y = h * (0.3 + k * 0.15), at = add(base, [0, y, 0]), ang = R.next() * Math.PI * 2, dir = norm([Math.cos(ang), 0.3, Math.sin(ang)]); (leaves.big = leaves.big || []).push([at, dir, norm(cross(dir, UP)), S * 0.18, S * 0.22]); }
                }
                cells = Trees.grid([{ painter: 'single', shape: 'petal', palette: ['#f8c820', '#f0b018', '#ffd840'], wid: 0.55 }, { painter: 'single', shape: 'petal', palette: ['#f8c020', '#f8d030'], wid: 0.5 }, { painter: 'single', shape: 'heart', palette: ['#4a7a2a', '#5a8a30'], wid: 0.85, teeth: 18 }, { painter: 'single', shape: 'heart', palette: ['#4e7e2c'], wid: 0.8, teeth: 16 }]);
            } else if (preset === 'tulips') {
                const n = 5 + Math.round(ch * 10), colors = [['#e0202a', '#f03a3a'], ['#f8d020', '#ffe040'], ['#f070a8', '#f890c0'], ['#f8f4f0', '#ffffff'], ['#8a2a8a', '#a040a0']];
                const pick = Math.floor(R.next() * colors.length);
                for (let i = 0; i < n; i++) {
                    const a = R.next() * Math.PI * 2, d = S * 0.35 * (0.3 + sp) * Math.sqrt(R.next()), base = [Math.cos(a) * d, 0, Math.sin(a) * d], h = S * (0.75 + R.next() * 0.25);
                    const top = add(base, [(R.next() - 0.5) * S * 0.08, h, (R.next() - 0.5) * S * 0.08]);
                    Kit.tube(flesh, [base, mix(base, top, 0.5), top], S * 0.012, { sides: 5, color: () => lin([0.35, 0.55, 0.25]), sway, capEnd: true });
                    const cell = (i % 2) ? 0 : 1, cupR = S * 0.05, cupH = S * 0.13;
                    for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2 + (k % 2) * 0.3, dir = [Math.cos(ang), 0, Math.sin(ang)], side = [-dir[2], 0, dir[0]], pts = []; for (let s = 0; s <= 4; s++) { const t = s / 4; pts.push(add(top, add(scale(dir, cupR * Math.sin(Math.PI * (0.15 + 0.7 * t)) * (k % 2 ? 1 : 0.92)), [0, cupH * t, 0]))); } (leaves.cups = leaves.cups || []).push({ pts, side, w: cupR * 0.75, cell }); }
                    for (let k = 0; k < 2; k++) { const ang = R.next() * Math.PI * 2, dir = norm([Math.cos(ang) * 0.4, 1, Math.sin(ang) * 0.4]); (leaves.blades = leaves.blades || []).push([base, dir, norm(cross(dir, UP)), S * 0.12, h * 0.6]); }
                }
                const col = colors[(pick + Math.floor(R.next() * 2)) % colors.length];
                cells = Trees.grid([{ painter: 'single', shape: 'petal', palette: col, wid: 0.95 }, { painter: 'single', shape: 'petal', palette: colors[pick], wid: 0.95 }, { painter: 'single', shape: 'lance', palette: ['#4a7a3a', '#5a8a44'], wid: 0.6 }, { painter: 'single', shape: 'lance', palette: ['#4e7e3e'], wid: 0.5 }]);
            } else {
                const clumps = 1 + Math.round(sp * 3);
                for (let c = 0; c < clumps; c++) {
                    const a = R.next() * Math.PI * 2, d = c === 0 ? 0 : S * 0.6 * Math.sqrt(R.next()), base = [Math.cos(a) * d, 0, Math.sin(a) * d], n = 8 + Math.round(ch * 10);
                    for (let i = 0; i < n; i++) {
                        const yaw = i / n * Math.PI + R.next(), side = [Math.cos(yaw), 0, Math.sin(yaw)], tilt = (R.next() - 0.5) * 0.7, up = norm(add(UP, scale(cross(side, UP), tilt)));
                        (leaves.crossed = leaves.crossed || []).push([base, up, side, S * 0.5, S * (0.8 + R.next() * 0.3)]);
                    }
                    for (let i = 0; i < 8; i++) { const yaw = i / 8 * Math.PI + R.next(), side = [Math.cos(yaw), 0, Math.sin(yaw)], up = norm(add(UP, scale(cross(side, UP), (R.next() - 0.5) * 1.2))); (leaves.basal = leaves.basal || []).push([base, up, side, S * 0.45, S * 0.35]); }
                }
                cells = Trees.strips([0, 1, 2, 3].map(i => i === 3 ? { painter: 'blades', palette: ['#7a8a6a', '#8a9a78', '#6a7a5a'], count: 30, wid: 0.03 } : { painter: 'spike', palette: season === 'autumn' ? ['#7a6a8a', '#6a5a7a'] : ['#8a6ad0', '#9a7ae0', '#7a5ac0', '#a888e8'], stem: '#6a8a5a', spikes: 3, count: 50, reach: 0.35 }));
            }
            swayDeg = 3.5;
        } else if (form === 'cactus') {
            fleshStyle = ['cactus', ['#1e3a1a', '#4a7a3a', '#f2ecd0']];
            const ribTex = 1;
            if (preset === 'pricklypear') {
                // Pads: flattened ellipsoids, each on the top edge of the one below.
                const pads = [];
                const pad = (c, up, size, depth) => {
                    const side = norm(cross(up, [R.next() - 0.5, 0, R.next() - 0.5])), face = norm(cross(side, up));
                    const g = Kit.geo(); Kit.blob(g, [0, 0, 0], [size * 0.7, size * 0.85, size * 0.13], { sides: 14, rings: 8, uRepeat: 6, vRepeat: 4, bump: d => 0.03 * N.n3(d[0] * 4, d[1] * 4, d[2] * 4) });
                    const M = (p) => add(c, add(add(scale(side, p[0]), scale(up, p[1])), scale(face, p[2])));
                    for (let k = 0; k < g.P.length; k += 3) { const p = M([g.P[k], g.P[k + 1], g.P[k + 2]]), n = norm(add(add(scale(side, g.N[k]), scale(up, g.N[k + 1])), scale(face, g.N[k + 2]))); g.P[k] = p[0]; g.P[k + 1] = p[1]; g.P[k + 2] = p[2]; g.N[k] = n[0]; g.N[k + 1] = n[1]; g.N[k + 2] = n[2]; g.S[k / 3] = sway(p); }
                    Kit.append(flesh, g); pads.push(c);
                    if (depth <= 0) { for (let f = 0; f < 3; f++) { const t = add(c, add(scale(up, size * 0.95), scale(side, (f - 1) * size * 0.3))); Kit.blob(extra, t, [size * 0.07, size * 0.1, size * 0.07], { sides: 8, rings: 5, color: () => lin([0.6, 0.12, 0.3]) }); } return; }
                    const kids = 1 + (R.next() < 0.55 + ch * 0.4 ? 1 : 0) + (R.next() < ch * 0.4 ? 1 : 0);
                    for (let k = 0; k < kids; k++) { const off = (k - (kids - 1) / 2) * 0.9 + (R.next() - 0.5) * 0.6, nu = norm(add(add(up, scale(side, off * 1.4)), scale(face, (R.next() - 0.5) * 0.8))); pad(add(c, add(scale(up, size * 0.85), scale(side, off * size * 0.6))), nu, size * (0.78 + R.next() * 0.15), depth - 1); }
                };
                const s0 = S * 0.2;
                pad([0, s0, 0], UP, s0, 2 + Math.round(ch * 2));
                if (sp > 0.3) pad([s0 * 1.2, s0 * 0.8, 0], norm([0.5, 1, 0.2]), s0 * 0.8, 1);
            } else {
                const barrel = preset === 'barrel', ribs = barrel ? 16 + Math.floor(R.next() * 9) : 12 + Math.floor(R.next() * 5), H = S * (0.9 + R.next() * 0.2), rr = (barrel ? S * 0.42 * (0.8 + sp * 0.4) : S * 0.055 * (0.8 + sp * 0.5)) * (0.9 + R.next() * 0.2);
                const column = (base, dir, h, r0, arm) => {
                    const pts = [], n = barrel ? 10 : 12;
                    for (let k = 0; k <= n; k++) { const t = k / n; pts.push(add(base, scale(dir, h * t))); }
                    const prof = t => barrel ? Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)))) * (1 - 0.1 * t) : (t > 0.85 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.85) / 0.15, 2))) : 1) * (1 + 0.08 * (1 - t));
                    Kit.tube(flesh, pts, (k, a) => r0 * Math.max(0.02, prof(k / n)) * (1 + 0.08 * Math.cos(ribs * a + Math.PI)), { sides: ribs * 3, uRepeat: ribs * ribTex, vScale: barrel ? h * 0.6 : 0.35, color: (k, p) => lin([1, 1, 1].map(v => v * (0.75 + 0.25 * k / n))), sway, capEnd: true });
                    return pts;
                };
                column([0, 0, 0], UP, barrel ? H : H, rr, false);
                if (!barrel) {
                    const arms = 1 + Math.round(ch * 3);
                    for (let i = 0; i < arms; i++) {
                        const a = i / Math.max(1, arms) * Math.PI * 2 + R.next() * 0.8, out = [Math.cos(a), 0, Math.sin(a)], y = H * (0.35 + R.next() * 0.25), ar = rr * 0.72;
                        const elbow = add([0, y, 0], scale(out, rr * 2.2)), pts = [];
                        for (let k = 0; k <= 6; k++) { const t = k / 6, ang = t * Math.PI / 2; pts.push(add([0, y, 0], add(scale(out, rr * 0.3 + (rr * 1.9) * Math.sin(ang)), [0, rr * 1.9 * (1 - Math.cos(ang)), 0]))); }
                        Kit.tube(flesh, pts, (k, ang) => ar * (1 + 0.08 * Math.cos(ribs * ang + Math.PI)), { sides: ribs * 3, uRepeat: ribs, vScale: 0.35, sway, color: () => tone(0.85) });
                        column(add(pts[6], [0, -0.01, 0]), UP, H * (0.3 + R.next() * 0.25), ar, true);
                        void elbow;
                    }
                }
                // Flowers on top.
                const topY = barrel ? H * 0.98 : H * 0.995, fr = barrel ? rr * 0.8 : rr * 0.9, nf = barrel ? 9 : 4;
                for (let i = 0; i < nf; i++) { const a = i / nf * Math.PI * 2, at = [Math.cos(a) * fr * 0.45, topY - (barrel ? 0.02 : 0), Math.sin(a) * fr * 0.45]; Kit.blob(extra, at, [fr * 0.12, fr * 0.1, fr * 0.12], { sides: 8, rings: 4, color: () => lin(barrel ? [0.95, 0.75, 0.15] : [0.96, 0.94, 0.85]) }); }
            }
            swayDeg = 0;
        } else if (form === 'succulent') {
            const agave = preset === 'agave', aloe = preset === 'aloe', n = Math.round((agave ? 22 : aloe ? 18 : 34) * (0.7 + ch * 0.6));
            const tint = agave ? [[0.42, 0.55, 0.52], [0.62, 0.7, 0.6]] : aloe ? [[0.35, 0.5, 0.3], [0.5, 0.62, 0.38]] : [[0.5, 0.62, 0.62], [0.85, 0.55, 0.6]];
            for (let i = 0; i < n; i++) {
                const t = i / n, a = i * 2.39996, out = [Math.cos(a), 0, Math.sin(a)], side = [-out[2], 0, out[0]];
                const Lf = S * (agave ? 0.75 : aloe ? 0.65 : 0.5) * (0.45 + 0.6 * (1 - t)) * (0.9 + R.next() * 0.2), el = (agave ? 0.25 : aloe ? 0.55 : 0.1) + t * (agave ? 1.0 : 0.9) + (R.next() - 0.5) * 0.15;
                const base = add([0, S * 0.04 + t * S * 0.05, 0], scale(out, S * 0.02 * (1 - t))), pts = [];
                let d = norm(add(scale(out, Math.cos(el)), scale(UP, Math.sin(el))));
                for (let k = 0; k <= 6; k++) { pts.push(add(base, scale(d, Lf * k / 6))); d = norm(add(d, [0, (agave ? -0.06 : aloe ? -0.08 : 0.05) * (k / 6), 0])); }
                const w = Lf * (agave ? 0.13 : aloe ? 0.11 : 0.28), th = Lf * (agave ? 0.05 : aloe ? 0.07 : 0.12);
                const g = Kit.geo();
                Kit.tube(g, pts, (k, ang) => {
                    const tt = k / 6, wk = w * (agave || aloe ? (1 - tt * 0.92) : Math.sin(Math.PI * Math.min(1, 0.25 + tt * 0.8))) + 0.002, tk = th * (1 - tt * 0.8) + 0.002;
                    const c = Math.cos(ang), s = Math.sin(ang); return 1 / Math.sqrt((c / wk) * (c / wk) + (s / tk) * (s / tk));
                }, { sides: 8, up: side, color: (k) => lin(mix(tint[0], tint[1], Math.pow(k / 6, 2) * (agave ? 0.5 : 1))), capEnd: true });
                Kit.append(flesh, g);
                if (agave) Kit.tube(extra, [pts[6], add(pts[6], scale(norm(sub(pts[6], pts[5])), Lf * 0.06))], Lf * 0.012, { sides: 4, color: () => lin([0.25, 0.15, 0.1]), capEnd: true });
            }
            if (aloe && ch > 0.3) { const pts = [[0, S * 0.1, 0], [S * 0.05, S * 0.8, 0], [S * 0.08, S * 1.5, 0]]; Kit.tube(flesh, pts, S * 0.012, { sides: 5, color: () => lin([0.4, 0.45, 0.3]), sway, capEnd: true }); for (let k = 0; k < 20; k++) { const p = Trees.along(pts, 0.6 + k / 50).p; Kit.blob(extra, add(p, [(R.next() - 0.5) * 0.06, 0, (R.next() - 0.5) * 0.06]), [S * 0.012, S * 0.03, S * 0.012], { sides: 5, rings: 3, color: () => lin([0.95, 0.45, 0.15]), sway }); } }
            fleshStyle = ['stalk', ['#a8a8a8', '#d4d4d4', '#f4f4f4']];
            swayDeg = 0;
        } else if (form === 'mushroom') {
            growMushrooms({ R, N, S, sp, ch, season, preset, flesh, extra, glowing, stems, litter, tone });
            swayDeg = 0;
        } else if (form === 'ivy') {
            const W = S * (0.5 + sp * 1.5), H = S, hanging = preset === 'hanging', cover = 0.4 + ch * 0.6;
            const vines = Math.min(48, Math.round(W * 4 * (0.6 + cover * 0.6)));
            for (let i = 0; i < vines; i++) {
                const x0 = (i / Math.max(1, vines - 1) - 0.5) * W + (R.next() - 0.5) * 0.15, reach = H * (hanging ? 0.35 + R.next() * 0.65 : 0.3 + R.next() * 0.7 * cover), pts = [];
                for (let k = 0; k <= 12; k++) { const t = k / 12, y = hanging ? H - reach * t : reach * t; pts.push([x0 + N.n3(i * 1.7, t * 3, 0) * 0.25 * t + Math.sin(t * 9 + i) * 0.03, Math.max(0.01, y), 0.025 + (hanging ? 0.04 * Math.sin(t * Math.PI) : 0.01)]); }
                Kit.tube(stems, pts, k => 0.009 * (1 - k / 14) + 0.003, { sides: 3, color: () => lin([0.4, 0.3, 0.2]), sway, capEnd: true });
                const per = Math.round(reach / 0.045 * (0.6 + cover * 0.5));
                for (let k = 0; k < per; k++) {
                    const a = Trees.along(pts, (k + R.next()) / per), side = norm([R.next() - 0.5, (R.next() - 0.5) * 0.6, 0]), up = norm([side[1], -side[0], 0.35 + R.next() * 0.3]);
                    (leaves.ivy = leaves.ivy || []).push([add(a.p, [0, 0, 0.01]), norm(add(up, [(R.next() - 0.5), hanging ? -0.3 : 0.4, 0])), side, S * 0.09 * (0.8 + R.next() * 0.5)]);
                }
            }
            // A thin lintel the hanging curtain falls from.
            if (hanging) Kit.tube(extra, [[-W / 2 - 0.05, H, 0.02], [W / 2 + 0.05, H, 0.02]], 0.03, { sides: 6, color: () => lin([0.35, 0.25, 0.15]), capEnd: true, capStart: true });
            cells = Trees.grid([0, 1, 2, 3].map(i => ({ painter: 'sprig', shape: 'heart', palette: season === 'autumn' ? ['#b8401a', '#8a2a1a', '#d8702a'] : ['#2e5a22', '#3a6a28', '#24481a', '#4a7a30'], count: 6 + i, len: 0.3, wid: 0.95, stem: '#4a3a24', petiole: 0.25 })));
            swayDeg = 1.2;
        }

        // Leaf cards, laid round each plant's own canopy.
        const out = { parts: [], textures: {}, swayDegrees: swayDeg }, quick = env.quick;
        if (cells && !(bare && ['shrub', 'hedge'].includes(form) && preset !== 'topiary' && form !== 'hedge')) {
            const size = quick ? 512 : 1024, key = ['plantleaf', form, preset, season, size].join('|');
            const pic = helpers.picture(cache, key, () => Tex.leaves(form + '-' + preset + '-' + season, cells, size, 17, { snow: season === 'snow' ? 0.8 : 0 }));
            out.textures[pic.name] = pic;
            const uv = cells.map((_, i) => Trees.cellUv(cells, i)), pickUv = (list) => uv[list[Math.floor(R.next() * list.length)]];
            const budget = (env.detail || 1) * 11000 - Kit.count(stems) - Kit.count(flesh) - Kit.count(extra) - (hedgeMass ? Kit.count(hedgeMass) : 0);
            if (cardList.length) {
                const chosen = Trees.thin(cardList, Math.floor(budget / 4), R);
                const cv = Trees.canopyOf(chosen);
                                Trees.layCards(leaves, chosen, { R, cells: uv, size: form === 'hedge' ? clamp(Math.sqrt(hedgeArea / Math.max(1, chosen.length)) * 5.2, 0.12, Math.min(1.6, S * 0.45)) : preset === 'topiary' ? S * 0.18 : clamp(S * 0.3, 0.16, 0.8), canopy: cv, outward: 0.75, orient: 'shell', tint: (k, RR) => [1, 1, 1].map(v => v * (0.88 + RR.next() * 0.24)), sway, aoFloor: 0.38 });
            }
            const cardsFrom = (list, cellIdx, o = {}) => { for (const [base, up, side, w, h] of list || []) Kit.card(leaves, base, up, len(side) > 0.1 ? norm(side) : [1, 0, 0], w, h, pickUv(cellIdx), Object.assign({ fold: 0, twoSided: true, rows: 2, color: p => tone(0.65 + 0.35 * smooth(0, S * 0.5, p[1])), sway }, o)); };
            cardsFrom(leaves.basal, [3], { rows: 2, normal: (p, face) => norm(mix(face, norm([p[0], 0.6, p[2]]), 0.5)) });
            if (form === 'grass' || (form === 'flowers' && preset === 'lavender')) cardsFrom(leaves.crossed, form === 'grass' ? [0, 1, 2, 3] : [0, 1, 2], { rows: 3, normal: (p, face) => norm(mix(face, norm([p[0], 0.6, p[2]]), 0.5)) });
            cardsFrom(leaves.petals, [0, 1], { rows: 1, color: () => tone(1) });
            cardsFrom(leaves.big, [2, 3], { rows: 2, bend: 0.25 });
            cardsFrom(leaves.blades, [2, 3], { rows: 3, bend: 0.2 });
            for (const [base, up, side, sz] of Trees.thin(leaves.ivy || [], Math.floor(Math.max(0, budget - Kit.count(leaves)) / 4), R)) Kit.card(leaves, base, up, side, sz, sz, pickUv([0, 1, 2, 3]), { fold: 0, twoSided: true, normal: (p, face) => norm(mix(face, [0, 0.2, 1], 0.6)), color: () => tone(0.7 + R.next() * 0.35), sway });
            for (const f of leaves.fronds || []) Kit.ribbon(leaves, f.pts, k => f.w * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + k / (f.pts.length - 1) * 0.92)), 0.7), () => f.side, pickUv([0, 1, 2, 3]), { fold: 0.22, twoSided: true, color: (p, t) => tone(0.7 + 0.3 * t), sway });
            for (const c of leaves.cups || []) Kit.ribbon(leaves, c.pts, k => c.w * Math.sin(Math.PI * Math.min(1, 0.3 + k / 4 * 0.7)), () => c.side, uv[c.cell], { fold: 0.3, twoSided: true, color: () => tone(1), sway, normal: (p, face) => face });
            if (Kit.count(leaves)) out.parts.push([leaves, { name: 'Leaves', texture: pic.name, cutout: true, alphaCutoff: 0.42, roughness: leafRough }]);
        }
        if (hedgeMass && Kit.count(hedgeMass)) {
            const fs = quick ? 256 : 512, pic = helpers.picture(cache, ['hedgemass', hedgePalette.join(), season === 'snow', fs].join('|'), () => foliage(hedgePalette, fs, season === 'snow'));
            out.textures[pic.albedo.name] = pic.albedo; out.textures[pic.normal.name] = pic.normal;
            out.parts.push([hedgeMass, { name: 'Inner leaves', texture: pic.albedo.name, normalTexture: pic.normal.name, normalScale: 1, roughness: 0.92 }]);
        }
        if (Kit.count(stems)) {
            const bs = quick ? 256 : 512, bark = helpers.picture(cache, ['bark', barkStyle[0], barkStyle[1].join(), bs].join('|'), () => Tex.bark(barkStyle[0], barkStyle[1], bs, 7));
            out.textures[bark.albedo.name] = bark.albedo; out.textures[bark.normal.name] = bark.normal;
            out.parts.push([stems, { name: 'Stems', texture: bark.albedo.name, normalTexture: bark.normal.name, roughness: 0.9 }]);
        }
        if (Kit.count(flesh)) {
            const st = fleshStyle || ['stalk', ['#9a9a9a', '#cccccc', '#eeeeee']], bs = quick ? 256 : 512, pic = helpers.picture(cache, ['flesh', st[0], st[1].join(), bs].join('|'), () => Tex.bark(st[0], st[1], bs, 7));
            out.textures[pic.albedo.name] = pic.albedo; out.textures[pic.normal.name] = pic.normal;
            out.parts.push([flesh, { name: form === 'cactus' ? 'Cactus' : form === 'mushroom' ? 'Stalks' : 'Flesh', texture: pic.albedo.name, normalTexture: pic.normal.name, normalScale: 0.8, roughness: form === 'cactus' ? 0.7 : 0.5 }]);
        }
        if (Kit.count(extra)) out.parts.push([extra, { name: 'Detail', roughness: 0.6 }]);
        if (Kit.count(litter)) out.parts.push([litter, { name: 'Ground', roughness: 0.92 }]);
        if (Kit.count(glowing)) out.parts.push([glowing, { name: 'Glow', roughness: 0.4, emissive: '#60c8ff', emissiveIntensity: 0.8 }]);
        if (leaves.mound) out.parts.push([leaves.mound, { name: 'Mound', color: '#3a4a2a', vertexColors: false, roughness: 0.95 }]);
        // Snow on what faces up, in the snow season.
        if (season === 'snow' && !['cactus', 'succulent', 'mushroom'].includes(form)) {
            const src = Kit.count(stems) ? stems : null;
            if (src) helpers.coverParts(out, { snow: Kit.cover(src, 0, src.P.length / 3, (p, n) => smooth(0.2, 0.6, n[1]), 0.012, { tile: 0.6 }) }, cache, env);
        }
        return out;
    }

    const api = { FORMS, MUSHROOMS, MUSH_SEASONS, build };
    root.RRPlantConstruction = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
