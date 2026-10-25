/**
 * RRContainerPaint - the pictures barrels, drums, canisters, crates, chests
 * and cargo crates are painted with: wood by the board, painted and bare
 * metal, rust, grime, rope, straw and coins, stenciled or printed words,
 * hazard symbols and stripes, and the glow sheet (lamp colors, halos and a
 * display's frames). Plain JavaScript over RGBA bytes (row 0 at the top),
 * so the editor and node tests paint alike.
 *
 * Surfaces are painted in meters: a painter gets (x, y) on the surface and
 * writes an RGB color; an atlas places each surface in its own rectangle.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Paint = need('RRPropPaint', './PropPaint.js');

    const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
    const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const frac = v => v - Math.floor(v);

    // ── atlas ──────────────────────────────────────────────────────────────
    /** A picture with rectangles handed out in rows (shelves), each kept a few pixels apart. */
    function atlas(width, height, fill) {
        const data = new Uint8Array(width * height * 4);
        const f = fill || [128, 128, 128, 255];
        for (let i = 0; i < data.length; i += 4) { data[i] = f[0]; data[i + 1] = f[1]; data[i + 2] = f[2]; data[i + 3] = f[3]; }
        return { width, height, data, shelfY: 0, shelfH: 0, cursorX: 0, pad: 3 };
    }

    /** Reserve a complete region. Silently clipping late regions discarded
     * hardware colors and fine markings on more elaborate containers. */
    function region(a, w, h) {
        w = Math.max(4, Math.min(a.width - a.pad * 2, Math.round(w))); h = Math.max(4, Math.round(h));
        if (a.cursorX + w + a.pad * 2 > a.width) { a.shelfY += a.shelfH; a.shelfH = 0; a.cursorX = 0; }
        const required=a.shelfY+h+a.pad*2;
        if(required>a.height){
            const height=2**Math.ceil(Math.log2(required));
            if(height>8192)throw Error('Container surface atlas exceeds its construction budget');
            const data=new Uint8Array(a.width*height*4);data.set(a.data);a.data=data;a.height=height;
        }
        const r = { x: a.cursorX + a.pad, y: a.shelfY + a.pad, w, h };
        a.cursorX += w + a.pad * 2;
        a.shelfH = Math.max(a.shelfH, h + a.pad * 2);
        return r;
    }

    /**
     * Paints `rect` by `fn(s, t, out)` (s, t from 0 to 1 across it; out RGB 0..1,
     * out[3] alpha), the pad around it as well so filtering never reaches a neighbor.
     */
    function fill(a, rect, fn) {
        const out = [0, 0, 0, 1], p = a.pad;
        for (let y = rect.y - p; y < rect.y + rect.h + p; y++) {
            if (y < 0 || y >= a.height) continue;
            const t = clamp01((y + 0.5 - rect.y) / rect.h);
            for (let x = rect.x - p; x < rect.x + rect.w + p; x++) {
                if (x < 0 || x >= a.width) continue;
                out[3] = 1;
                fn(clamp01((x + 0.5 - rect.x) / rect.w), t, out);
                const o = (y * a.width + x) * 4;
                a.data[o] = clamp01(out[0]) * 255 + 0.5; a.data[o + 1] = clamp01(out[1]) * 255 + 0.5; a.data[o + 2] = clamp01(out[2]) * 255 + 0.5; a.data[o + 3] = clamp01(out[3]) * 255 + 0.5;
            }
        }
    }

    /** Uv of a point (s, t from 0 to 1) in `rect`. */
    function uvIn(a, rect, s, t) { return [(rect.x + s * rect.w) / a.width, (rect.y + t * rect.h) / a.height]; }

    const rgb = h => Paint.hex(h).map(c => c / 255);

    // ── wood ───────────────────────────────────────────────────────────────
    /**
     * Sawn wood: growth rings cut lengthwise (bands that wander), fine fibers,
     * pores and the tone of each board its own. `x` across the grain and `y`
     * along it, in meters; `board` a number per board. Weathering (`wear`)
     * grays and dries it, darkens its lower end and opens a few cracks.
     */
    function wood(tone, seed, wear) {
        const c = rgb(tone), s = seed >>> 0;
        const warp = Paint.fractal(s + 1, 4, 3), fibers = Paint.noise(s + 2, 128), blot = Paint.fractal(s + 3, 8, 2), pores = Paint.noise(s + 4, 256), gray = Paint.fractal(s + 5, 8, 3);
        const knots = Paint.noise(s + 6, 16), cracks = Paint.noise(s + 7, 64);
        return (x, y, out, board, low) => {
            const b = board || 0, ob = frac(b * 0.618034) * 7.3;
            const X = x + ob, Y = y + ob * 2.1;
            const w = warp(X * 0.35, Y * 0.06);
            const ringPos = X * 26 + w * 7 + Math.sin(Y * 1.7 + ob) * 0.6;
            const ring = frac(ringPos);
            // Late wood: a narrow dark band at the end of each year.
            const late = smooth(0.62, 0.88, ring) * (1 - smooth(0.9, 1, ring));
            const fib = fibers(X * 2.6, Y * 0.045) - 0.5;
            const pore = pores(X * 5.1, Y * 0.12) > 0.82 ? 1 : 0;
            const bl = blot(X * 0.4, Y * 0.12) - 0.5;
            let k = 0.92 - 0.2 * late + 0.13 * fib - 0.1 * pore * (0.5 + late) + 0.14 * bl + (frac(b * 0.381966) - 0.5) * 0.16;
            // A knot now and then: a dark eye the rings bend around.
            const kn = knots(X * 0.9, Y * 0.18);
            if (kn > 0.86) k -= smooth(0.86, 0.95, kn) * 0.35;
            let r = c[0] * k * (1 + 0.04 * late), g = c[1] * k, bb = c[2] * k * (1 - 0.06 * late);
            if (wear > 0) {
                // Silvered by the weather where it is driest, darker and greener where water sits.
                const gr = smooth(0.35, 0.75, gray(X * 0.3, Y * 0.1)) * wear * 0.75;
                const lum = (r * 0.3 + g * 0.55 + bb * 0.15) * 1.08;
                r = mix(r, lum * 0.98, gr); g = mix(g, lum, gr); bb = mix(bb, lum * 1.02, gr);
                const damp = (low || 0) * wear * 0.5;
                r *= 1 - damp * 0.55; g *= 1 - damp * 0.5; bb *= 1 - damp * 0.55;
                // Checks along the grain: thin dark lines a hand long.
                const cr = cracks(X * 3.4, Y * 0.06);
                if (cr > 1 - wear * 0.09) { const d = Math.abs(frac(X * 140) - 0.5); if (d < 0.12) { r *= 0.35; g *= 0.33; bb *= 0.32; } }
            }
            out[0] = r; out[1] = g; out[2] = bb;
        };
    }

    // ── metal ──────────────────────────────────────────────────────────────
    /**
     * Painted steel: the paint's faint mottle and orange peel, and with wear
     * chips to the primer and bare steel (most at edges), rust blooming from
     * them and running down, and grime at the foot. `ctx` per point: `edge`
     * (0..1, near a rim or corner), `low` (0..1, near the ground).
     */
    function paintedMetal(color, seed, wear, bare) {
        const c = rgb(color), s = seed >>> 0;
        const mott = Paint.fractal(s + 11, 16, 2), chip = Paint.fractal(s + 12, 32, 3), rust = Paint.fractal(s + 13, 16, 3), streak = Paint.noise(s + 14, 128), grain = Paint.noise(s + 15, 256);
        const metal = bare ? rgb(bare) : [0.46, 0.46, 0.47];
        return (x, y, out, edge, low) => {
            const e = edge || 0, lo = low || 0;
            const m = mott(x * 0.35, y * 0.35) - 0.5, gr = grain(x * 3, y * 3) - 0.5;
            let r = c[0] * (0.97 + 0.12 * m + 0.03 * gr), g = c[1] * (0.97 + 0.12 * m + 0.03 * gr), b = c[2] * (0.97 + 0.12 * m + 0.03 * gr);
            if (wear > 0) {
                // Small chips with ragged edges, most where it is knocked: rims, ribs, corners.
                const ch = chip(x * 1.6, y * 1.6) * 0.75 + chip(x * 5.3 + 7, y * 5.3) * 0.25 + e * 0.42 * wear;
                const t = 1 - wear * 0.36 + (1 - e) * 0.06;
                if (ch > t) {
                    // Chipped: a dark rim of lifted paint, then primer, then bare steel, rusting.
                    const deep = smooth(t, t + 0.06, ch);
                    const steel = metal[0] * (0.85 + 0.3 * gr);
                    const rr = rust(x * 0.9, y * 0.9);
                    const rusty = smooth(0.4, 0.8, rr) * wear;
                    const sr = mix(steel, 0.42, rusty), sg = mix(steel, 0.21, rusty), sb = mix(steel * 1.02, 0.1, rusty);
                    const pr = 0.55, pg = 0.5, pb = 0.44;
                    const k = smooth(0.25, 0.6, deep);
                    r = mix(mix(r * 0.55, pr, deep), sr, k); g = mix(mix(g * 0.55, pg, deep), sg, k); b = mix(mix(b * 0.55, pb, deep), sb, k);
                }
                // Rust blooms through the paint and runs down from the rims.
                const bloom = smooth(1 - wear * 0.5, 1.05, rust(x * 0.5 + 3.1, y * 0.5) + e * 0.25 * wear);
                const run = smooth(0.55, 0.9, streak(x * 2.2, y * 0.1)) * smooth(0.2, 0.9, e + lo * 0.5) * wear * 0.7;
                const ra = clamp01(bloom * 0.85 + run);
                const rc = 0.5 + 0.3 * (rust(x * 2, y * 2) - 0.5);
                r = mix(r, 0.46 * rc + 0.16, ra); g = mix(g, 0.24 * rc + 0.06, ra); b = mix(b, 0.1 * rc + 0.03, ra);
                const dirt = lo * wear * 0.5;
                r *= 1 - dirt * 0.6; g *= 1 - dirt * 0.62; b *= 1 - dirt * 0.66;
            }
            out[0] = r; out[1] = g; out[2] = b;
        };
    }

    /** Forged iron straps and hoops: near black, blotched, rusting with wear. */
    function iron(color, seed, wear) {
        const c = rgb(color || '#2b2a28'), n = Paint.fractal((seed >>> 0) + 21, 16, 3), f = Paint.noise((seed >>> 0) + 22, 128);
        return (x, y, out) => {
            const m = n(x * 0.8, y * 0.8), k = 0.85 + 0.3 * (m - 0.5) + 0.1 * (f(x * 4, y * 4) - 0.5);
            let r = c[0] * k, g = c[1] * k, b = c[2] * k;
            const rust = smooth(0.62 - wear * 0.45, 0.95 - wear * 0.3, m) * (0.25 + wear * 0.75);
            // Rust: a dark brown scale, redder where it is fresh.
            r = mix(r, 0.27 + 0.1 * m, rust); g = mix(g, 0.14 + 0.04 * m, rust); b = mix(b, 0.08, rust);
            out[0] = r; out[1] = g; out[2] = b;
        };
    }

    /** Twisted rope: strands winding along it (`x` along, `y` around, both 0..1 of a turn). */
    function rope(color, seed) {
        const c = rgb(color || '#b39a6c'), n = Paint.noise((seed >>> 0) + 31, 64);
        return (x, y, out) => {
            const strand = frac(x * 3 + y * 3);
            const k = 0.62 + 0.4 * Math.sin(strand * Math.PI) + 0.12 * (n(x * 0.5, y) - 0.5);
            out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
        };
    }

    /** Packing straw seen from above: crossing pale strands over shadow. */
    function straw(seed) {
        const n1 = Paint.noise((seed >>> 0) + 41, 96), n2 = Paint.noise((seed >>> 0) + 42, 96), n3 = Paint.fractal((seed >>> 0) + 43, 8, 2);
        return (x, y, out) => {
            const a = Math.abs(Math.sin((x * 70 + n1(x, y) * 6) * Math.PI)), b = Math.abs(Math.sin((y * 64 + n2(x, y) * 6) * Math.PI));
            const s = Math.max(Math.pow(1 - a, 6), Math.pow(1 - b, 6) * 0.9);
            const k = 0.25 + 0.75 * s * (0.7 + 0.5 * n3(x, y));
            out[0] = 0.78 * k; out[1] = 0.66 * k; out[2] = 0.38 * k;
        };
    }

    /** Gold coins heaped: overlapping discs at every tilt, each with its raised rim and stamped face, more gold between. */
    function coins(seed) {
        const rand = Paint.random((seed >>> 0) + 51), list = [];
        for (let i = 0; i < 300; i++) { const tilt = 0.45 + rand() * 0.55; list.push([rand(), rand(), 0.03 + rand() * 0.02, rand(), tilt, rand() * Math.PI]); }
        // Coins on a grid of cells, for a quick look-up.
        const cells = 12, grid = Array.from({ length: cells * cells }, () => []);
        for (const cn of list) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const gx = ((Math.floor(cn[0] * cells) + dx) % cells + cells) % cells, gy = ((Math.floor(cn[1] * cells) + dy) % cells + cells) % cells; grid[gy * cells + gx].push(cn); }
        const glint = Paint.noise((seed >>> 0) + 52, 64);
        return (x, y, out) => {
            let best = null;
            for (const cn of grid[Math.min(cells - 1, Math.floor(y * cells)) * cells + Math.min(cells - 1, Math.floor(x * cells))]) {
                let dx = x - cn[0], dy = y - cn[1];
                dx -= Math.round(dx); dy -= Math.round(dy);
                // A tilted coin is an ellipse.
                const c = Math.cos(cn[5]), sn = Math.sin(cn[5]), u = (dx * c + dy * sn) / cn[2], v = (-dx * sn + dy * c) / (cn[2] * cn[4]);
                const d = Math.hypot(u, v);
                if (d < 1 && (!best || cn[3] > best.z)) best = { d, z: cn[3], u, v, tilt: cn[4] };
            }
            if (!best) { const g = 0.7 + 0.25 * glint(x * 8, y * 8); out[0] = 0.85 * g; out[1] = 0.62 * g; out[2] = 0.18 * g; return; }
            const { d, u, v } = best;
            const rim = d > 0.84 ? (d > 0.93 ? 0.7 : 1.15) : 1;
            const face = 0.82 + 0.28 * (-u * 0.45 - v * 0.55) + (d < 0.55 && Math.abs(Math.sin(u * 9)) < 0.18 ? -0.12 : 0);
            const k = Math.max(0.35, face * rim) * (0.85 + 0.25 * best.tilt);
            out[0] = Math.min(1, 0.98 * k + 0.05); out[1] = Math.min(1, 0.74 * k); out[2] = Math.min(1, 0.26 * k);
        };
    }

    // ── words ──────────────────────────────────────────────────────────────
    /**
     * A stroke font: each glyph a few polylines on a 4 x 6 grid (y down).
     * A round letter's loop is two strokes, so stenciling leaves its bridges.
     */
    const GLYPHS = {
        A: [[[0, 6], [0, 1.6], [1.2, 0], [2, 0]], [[2, 0], [2.8, 0], [4, 1.6], [4, 6]], [[0, 3.6], [4, 3.6]]],
        B: [[[0, 0], [0, 6]], [[0, 0], [2.9, 0], [3.8, 0.8], [3.8, 2.1], [2.9, 2.9], [0, 2.9]], [[0, 2.9], [3, 2.9], [4, 3.8], [4, 5.1], [3.1, 6], [0, 6]]],
        C: [[[4, 1.2], [3, 0], [1.1, 0], [0, 1.2], [0, 4.8], [1.1, 6], [3, 6], [4, 4.8]]],
        D: [[[0, 0], [0, 6]], [[0, 0], [2.4, 0], [4, 1.6], [4, 4.4], [2.4, 6], [0, 6]]],
        E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3.2, 3]]],
        F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3.2, 3]]],
        G: [[[4, 1.2], [3, 0], [1.1, 0], [0, 1.2], [0, 4.8], [1.1, 6], [3, 6], [4, 4.8], [4, 3.3], [2.3, 3.3]]],
        H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
        I: [[[2, 0], [2, 6]], [[0.9, 0], [3.1, 0]], [[0.9, 6], [3.1, 6]]],
        J: [[[4, 0], [4, 4.8], [2.9, 6], [1.1, 6], [0, 4.8], [0, 4]]],
        K: [[[0, 0], [0, 6]], [[4, 0], [0.4, 3.4]], [[1.5, 2.5], [4, 6]]],
        L: [[[0, 0], [0, 6], [4, 6]]],
        M: [[[0, 6], [0, 0], [2, 3.4]], [[2, 3.4], [4, 0], [4, 6]]],
        N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
        O: [[[2, 0], [1.1, 0], [0, 1.2], [0, 4.8], [1.1, 6], [2, 6]], [[2, 0], [2.9, 0], [4, 1.2], [4, 4.8], [2.9, 6], [2, 6]]],
        P: [[[0, 6], [0, 0]], [[0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
        Q: [[[2, 0], [1.1, 0], [0, 1.2], [0, 4.8], [1.1, 6], [2, 6]], [[2, 0], [2.9, 0], [4, 1.2], [4, 4.8], [2.9, 6], [2, 6]], [[2.6, 4.4], [4.2, 6.3]]],
        R: [[[0, 6], [0, 0]], [[0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]], [[2.1, 3.5], [4, 6]]],
        S: [[[4, 1.1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 2.9], [3, 3.1], [4, 4], [4, 5], [3, 6], [1, 6], [0, 4.9]]],
        T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
        U: [[[0, 0], [0, 4.8], [1.1, 6], [2, 6]], [[2, 6], [2.9, 6], [4, 4.8], [4, 0]]],
        V: [[[0, 0], [2, 6]], [[2, 6], [4, 0]]],
        W: [[[0, 0], [1, 6], [2, 2.4]], [[2, 2.4], [3, 6], [4, 0]]],
        X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
        Y: [[[0, 0], [2, 3.1]], [[4, 0], [2, 3.1]], [[2, 3.1], [2, 6]]],
        Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
        0: [[[2, 0], [1.1, 0], [0, 1.2], [0, 4.8], [1.1, 6], [2, 6]], [[2, 0], [2.9, 0], [4, 1.2], [4, 4.8], [2.9, 6], [2, 6]]],
        1: [[[0.7, 1.3], [2, 0], [2, 6]], [[0.8, 6], [3.2, 6]]],
        2: [[[0, 1.1], [1, 0], [3, 0], [4, 1], [4, 2.2], [0, 6], [4, 6]]],
        3: [[[0, 0.8], [1, 0], [3, 0], [4, 1], [4, 2], [3, 2.9], [1.4, 2.9]], [[3, 2.9], [4, 3.9], [4, 5], [3, 6], [1, 6], [0, 5.2]]],
        4: [[[3, 6], [3, 0], [0, 4.1], [4, 4.1]]],
        5: [[[4, 0], [0.2, 0], [0, 2.8], [3, 2.8], [4, 3.8], [4, 5], [3, 6], [1, 6], [0, 5.1]]],
        6: [[[3.7, 0.4], [2.7, 0], [1.1, 0], [0, 1.2], [0, 4.8], [1.1, 6], [3, 6], [4, 4.9], [4, 3.9], [3, 2.9], [0, 2.9]]],
        7: [[[0, 0], [4, 0], [1.6, 6]]],
        8: [[[2, 2.9], [1, 2.9], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 2.9], [2, 2.9]], [[2, 2.9], [1, 2.9], [0, 3.9], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.9], [3, 2.9]]],
        9: [[[4, 3.1], [1, 3.1], [0, 2.1], [0, 1], [1, 0], [3, 0], [4, 1.2], [4, 4.8], [2.9, 6], [1.1, 6], [0.3, 5.6]]],
        '-': [[[0.8, 3], [3.2, 3]]],
        '.': [[[2, 5.7], [2, 6]]],
        ',': [[[2.2, 5.6], [1.5, 6.8]]],
        ':': [[[2, 1.6], [2, 1.9]], [[2, 5.1], [2, 5.4]]],
        '/': [[[3.8, 0], [0.2, 6]]],
        '!': [[[2, 0], [2, 4.1]], [[2, 5.7], [2, 6]]],
        '+': [[[2, 1.4], [2, 4.6]], [[0.4, 3], [3.6, 3]]],
        '#': [[[1.4, 0.3], [0.9, 5.7]], [[3.1, 0.3], [2.6, 5.7]], [[0.1, 2], [3.9, 2]], [[0.1, 4], [3.9, 4]]],
        '%': [[[3.8, 0], [0.2, 6]], [[0.2, 0.3], [1.2, 0.3], [1.2, 1.5], [0.2, 1.5], [0.2, 0.3]], [[2.8, 4.5], [3.8, 4.5], [3.8, 5.7], [2.8, 5.7], [2.8, 4.5]]],
        '>': [[[0.6, 0.8], [3.4, 3], [0.6, 5.2]]],
        '<': [[[3.4, 0.8], [0.6, 3], [3.4, 5.2]]],
        '=': [[[0.5, 2.1], [3.5, 2.1]], [[0.5, 3.9], [3.5, 3.9]]],
        '|': [[[2, -0.2], [2, 6.2]]],
        '_': [[[0, 6.4], [4, 6.4]]]
    };
    const ADVANCE = 5.4, SPACE = 3.6;

    /** What of `text` the font can write: upper case, the characters it has, spaces between. */
    function cleanText(text, max) {
        return String(text || '').toUpperCase().replace(/[^A-Z0-9\-.,:/!+#%<>=|_ ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 40);
    }

    /**
     * Text laid out as segments on the font's grid: { width, height: 6,
     * segs: [[ax, ay, bx, by, stroke], ...], at: glyph lookup by x }.
     */
    function layout(text) {
        const segs = [], cells = [];
        let x = 0, stroke = 0;
        for (const ch of String(text)) {
            if (ch === ' ') { x += SPACE; continue; }
            const g = GLYPHS[ch];
            if (!g) { x += SPACE; continue; }
            const first = segs.length;
            for (const line of g) {
                for (let i = 0; i + 1 < line.length; i++) segs.push([line[i][0] + x, line[i][1], line[i + 1][0] + x, line[i + 1][1], stroke]);
                if (line.length === 1) segs.push([line[0][0] + x, line[0][1], line[0][0] + x, line[0][1], stroke]);
                stroke++;
            }
            cells.push([x - 1, x + 5, first, segs.length]);
            x += ADVANCE;
        }
        return { width: Math.max(0, x - (ADVANCE - 4)), height: 6, segs, cells };
    }

    function segDist(s, x, y) {
        const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
        const t = l2 > 0 ? clamp01(((x - s[0]) * dx + (y - s[1]) * dy) / l2) : 0;
        return Math.hypot(x - s[0] - dx * t, y - s[1] - dy * t);
    }

    /**
     * How much of the point (x, y), in grid units, the text covers (0..1):
     * strokes `weight` wide; stenciled, strokes that meet keep a gap
     * `bridge` wide between them; `aa` the size of a pixel, for the edge.
     */
    function coverage(L, x, y, weight, stencil, bridge, aa) {
        let d1 = Infinity, s1 = -1;
        const near = [];
        for (const c of L.cells) {
            if (x < c[0] - weight || x > c[1] + weight) continue;
            for (let i = c[2]; i < c[3]; i++) { const d = segDist(L.segs[i], x, y); near.push(d, L.segs[i][4]); if (d < d1) { d1 = d; s1 = L.segs[i][4]; } }
        }
        if (s1 < 0) return 0;
        const half = weight / 2;
        let cov = clamp01((half - d1) / aa + 0.5);
        if (stencil && cov > 0) {
            let d2 = Infinity;
            for (let i = 0; i < near.length; i += 2) if (near[i + 1] !== s1 && near[i] < d2) d2 = near[i];
            cov *= clamp01((d2 - half - bridge) / aa + 0.5);
        }
        return cov;
    }

    // ── symbols ────────────────────────────────────────────────────────────
    const FLAME = [0, -1, 0.22, -0.62, 0.47, -0.32, 0.6, 0.02, 0.58, 0.32, 0.42, 0.56, 0.2, 0.68, 0.32, 0.38, 0.22, 0.12, 0.08, 0.36, -0.06, 0.1, -0.14, 0.4, -0.06, 0.68, -0.34, 0.6, -0.55, 0.36, -0.6, 0.02, -0.48, -0.26, -0.3, -0.06, -0.26, -0.4, -0.1, -0.62];
    const BURST = (() => { const out = []; for (let k = 0; k < 24; k++) { const r = k % 2 ? 0.42 : 1 - (k % 4 === 0 ? 0 : 0.18), a = -Math.PI / 2 + k * Math.PI / 12; out.push(Math.cos(a) * r, Math.sin(a) * r); } return out; })();
    const SYMBOLS = [['none', 'None'], ['flammable', 'Flammable'], ['explosive', 'Explosive'], ['radiation', 'Radiation'], ['warning', 'Warning'], ['arrows', 'This side up']];

    /**
     * A symbol at (x, y) in its own box ([-1, 1], y down): the color it shows
     * there (RGB 0..1) and how much (alpha), into `out`; false outside it.
     */
    function symbolAt(kind, x, y, out, aa) {
        const ink = (c, a) => { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = a; return true; };
        const edge = (d) => clamp01(0.5 - d / (aa || 0.02));
        if (kind === 'flammable' || kind === 'explosive') {
            const d = Math.abs(x) + Math.abs(y) - 1;
            if (d > 0.02) return false;
            const fillC = kind === 'flammable' ? [0.78, 0.1, 0.08] : [0.95, 0.45, 0.06];
            const a = edge(d);
            const line = Math.abs(Math.abs(x) + Math.abs(y) - 0.86) < 0.035;
            if (line) return ink(kind === 'flammable' ? [0.96, 0.95, 0.92] : [0.08, 0.08, 0.08], a);
            const shape = kind === 'flammable' ? FLAME : BURST;
            const sx = x / 0.42, sy = (y + 0.3) / 0.42;
            if (Paint.pointInPolygon(shape, sx, sy)) return ink(kind === 'flammable' ? [0.97, 0.96, 0.93] : [0.08, 0.08, 0.08], a);
            if (sy > 0.95 && sy < 1.25 && Math.abs(sx) < 0.9 && kind === 'flammable') return ink([0.97, 0.96, 0.93], a);
            // The class number at the foot: 0.3 tall, centered.
            const L = kind === 'flammable' ? DIGIT3 : DIGIT1;
            const c = coverage(L, (x + 0.1) / 0.05, (y - 0.38) / 0.05, 1.3, false, 0, 0.6);
            if (c > 0.5) return ink(kind === 'flammable' ? [0.97, 0.96, 0.93] : [0.08, 0.08, 0.08], a);
            return ink(fillC, a);
        }
        if (kind === 'radiation') {
            const r = Math.hypot(x, y);
            if (r > 1.02) return false;
            const a = edge(r - 1);
            if (r > 0.92) return ink([0.06, 0.06, 0.06], a);
            const ang = Math.atan2(y, x) + Math.PI / 2, blade = Math.cos(ang * 3) > 0.5;
            if (r < 0.15 || (r > 0.24 && r < 0.78 && blade)) return ink([0.06, 0.06, 0.06], a);
            return ink([0.98, 0.8, 0.08], a);
        }
        if (kind === 'warning') {
            // An upright triangle: its edges, a black border, a yellow field, an exclamation.
            const yy = (y + 1) / 2, half = yy * 1.0;
            if (yy < 0 || yy > 1 || Math.abs(x) > half + 0.02) return false;
            const din = Math.min(half - Math.abs(x), (1 - yy) * 1.2, yy * 1.2);
            const a = edge(-din);
            if (din < 0.12) return ink([0.06, 0.06, 0.06], a);
            if ((Math.abs(x) < 0.07 && yy > 0.3 && yy < 0.72) || Math.hypot(x, yy - 0.82) < 0.075) return ink([0.06, 0.06, 0.06], a);
            return ink([0.98, 0.78, 0.08], a);
        }
        if (kind === 'arrows') {
            for (const cx of [-0.48, 0.48]) {
                const lx = x - cx;
                const head = y < -0.15 && Math.abs(lx) < (y + 1) * 0.42;
                const stem = y >= -0.15 && y < 0.9 && Math.abs(lx) < 0.12;
                const bar = y > 0.92 && y < 1 && Math.abs(x) < 0.85;
                if (head || stem || bar) return ink([0.08, 0.08, 0.08], 1);
            }
            return false;
        }
        return false;
    }
    const DIGIT3 = layout('3'), DIGIT1 = layout('1');

    // ── markings on a surface ──────────────────────────────────────────────
    /**
     * The markings one surface carries, painted over its own colors by
     * `apply(x, y, out)` in the surface's meters. `marks`: the recipe's
     * markings; `box` where on the surface they go ({ x, y, w, h } meters,
     * the middle of the face); `look`: 'stencil' (sprayed, wearing off with
     * the paint), 'label' (a printed paper label) or 'burned' (wood).
     */
    function markings(marks, box, opts) {
        const o = opts || {}, wear = o.wear || 0;
        const text = cleanText(marks.text, 24), L = text ? layout(text) : null;
        const sym = marks.symbol && marks.symbol !== 'none' ? marks.symbol : null;
        const img = o.image || null;
        const ink = rgb(marks.color || '#f2efe6');
        const hazard = !!marks.hazard;
        const style = marks.style || 'stencil';
        const worn = Paint.fractal((o.seed >>> 0) + 61, 16, 3), spray = Paint.noise((o.seed >>> 0) + 62, 256);
        // Laid out: the symbol to the left of the words, both as tall as the box allows.
        const parts = [];
        const H = box.h;
        let total = 0;
        const symW = sym ? H * 0.95 : 0, gap = sym && L ? H * 0.18 : 0;
        let textH = L ? H * (sym ? 0.42 : 0.5) : 0, textW = L ? L.width / 6 * textH : 0;
        const room = box.w * 0.92;
        if (symW + gap + textW > room && L) { textW = Math.max(0.01, room - symW - gap); textH = textW / L.width * 6; }
        total = symW + gap + textW;
        let x0 = box.x + (box.w - total) / 2;
        if (sym) { parts.push({ kind: 'symbol', x: x0 + symW / 2, y: box.y + box.h / 2, r: symW / 2 }); x0 += symW + gap; }
        if (L) parts.push({ kind: 'text', x: x0, y: box.y + box.h / 2 - textH / 2, h: textH, w: textW });
        if(o.stacked&&sym&&L){
            const h=Math.min(H*.28,box.w*.92/L.width*6),w=h/6*L.width,rad=Math.min(H*.27,box.w*.18);
            parts.length=0;
            parts.push({kind:'symbol',x:box.x+box.w/2,y:box.y+H*.29,r:rad});
            parts.push({kind:'text',x:box.x+(box.w-w)/2,y:box.y+H*.67,h,w});
        }
        const pictureBox = img ? fitBox(img, box) : null;
        const labelPad = 0.25;
        const tmp = [0, 0, 0, 1];
        const pixel = o.pixel || 0.002;
        return {
            hazard, text, symbol: sym,
            apply(x, y, out) {
                // Hazard stripes: a band across the face, black and yellow on the diagonal.
                if (hazard && o.band && y > o.band[0] && y < o.band[1]) {
                    const k = frac((x + y) / (o.stripe || 0.09));
                    const yellow = k < 0.5;
                    const a = 0.94 * scuff(x, y);
                    const c = yellow ? [0.95, 0.72, 0.06] : [0.05, 0.05, 0.05];
                    out[0] = mix(out[0], c[0], a); out[1] = mix(out[1], c[1], a); out[2] = mix(out[2], c[2], a);
                }
                if (pictureBox && x >= pictureBox.x && x <= pictureBox.x + pictureBox.w && y >= pictureBox.y && y <= pictureBox.y + pictureBox.h) {
                    Paint.sampleImage(img, (x - pictureBox.x) / pictureBox.w, (y - pictureBox.y) / pictureBox.h, tmp);
                    const a = tmp[3] / 255 * scuff(x, y);
                    out[0] = mix(out[0], tmp[0] / 255, a); out[1] = mix(out[1], tmp[1] / 255, a); out[2] = mix(out[2], tmp[2] / 255, a);
                    return;
                }
                if (style === 'label' && (L || sym)) {
                    const lx0 = box.x + (box.w - total) / 2 - box.h * labelPad, lx1 = box.x + (box.w + total) / 2 + box.h * labelPad;
                    const ly0 = box.y - box.h * 0.12, ly1 = box.y + box.h * 1.12;
                    if (x > lx0 && x < lx1 && y > ly0 && y < ly1) {
                        const a = scuff(x, y);
                        const paper = 0.93 - 0.12 * (worn(x * 2, y * 2) - 0.5) - wear * 0.25;
                        const border = Math.min(x - lx0, lx1 - x, y - ly0, ly1 - y) < box.h * 0.06 && Math.min(x - lx0, lx1 - x, y - ly0, ly1 - y) > box.h * 0.03;
                        const pc = border ? [ink[0] * 0.9, ink[1] * 0.9, ink[2] * 0.9] : [paper, paper * 0.97, paper * 0.88];
                        out[0] = mix(out[0], pc[0], a); out[1] = mix(out[1], pc[1], a); out[2] = mix(out[2], pc[2], a);
                    }
                }
                for (const p of parts) {
                    if (p.kind === 'symbol') {
                        const sx = (x - p.x) / p.r, sy = (y - p.y) / p.r;
                        if (Math.abs(sx) > 1.05 || Math.abs(sy) > 1.05) continue;
                        tmp[3] = 0;
                        if (symbolAt(sym, sx, sy, tmp, pixel / p.r * 1.5)) {
                            const a = tmp[3] * scuff(x, y);
                            out[0] = mix(out[0], tmp[0], a); out[1] = mix(out[1], tmp[1], a); out[2] = mix(out[2], tmp[2], a);
                        }
                    } else {
                        if (x < p.x - p.h * 0.2 || x > p.x + p.w + p.h * 0.2 || y < p.y - p.h * 0.2 || y > p.y + p.h * 1.2) continue;
                        const gx = (x - p.x) / p.h * 6, gy = (y - p.y) / p.h * 6;
                        const label = style === 'label';
                        const c = coverage(L, gx, gy, label ? 1.05 : 1.25, style === 'stencil', 0.12, pixel / p.h * 6 * 1.0);
                        if (c <= 0) continue;
                        // Sprayed paint: a soft speckled edge; with wear, worn through in patches.
                        const s = style === 'stencil' ? 0.82 + 0.18 * spray(x * 3, y * 3) : 1;
                        const a = clamp01(c * s * scuff(x, y));
                        const inkC = label ? [0.08, 0.08, 0.08] : style === 'burned' ? [0.16, 0.08, 0.03] : ink;
                        if (style === 'burned') { out[0] = mix(out[0], out[0] * 0.28, a); out[1] = mix(out[1], out[1] * 0.22, a); out[2] = mix(out[2], out[2] * 0.18, a); }
                        else { out[0] = mix(out[0], inkC[0], a); out[1] = mix(out[1], inkC[1], a); out[2] = mix(out[2], inkC[2], a); }
                    }
                }
            }
        };
        function scuff(x, y) { return wear > 0 ? clamp01(1 - smooth(0.85 - wear * 0.45, 1, worn(x * 1.4, y * 1.4)) ) : 1; }
    }

    /** A picture fitted inside a box (meters), its proportions kept. */
    function fitBox(img, box) {
        const a = img.height / img.width;
        let w = box.w, h = w * a;
        if (h > box.h * 1.8) { h = box.h * 1.8; w = h / a; }
        return { x: box.x + (box.w - w) / 2, y: box.y + box.h / 2 - h / 2, w, h };
    }

    // ── the glow sheet ─────────────────────────────────────────────────────
    /** Display content: what the screen shows, frame by frame. */
    const LOOP_FALLBACK = 8;
    const DISPLAY_MODES = [['none', 'Nothing'], ['text', 'Scrolling text'], ['numbers', 'Numbers'], ['progress', 'Progress bar'], ['picture', 'Picture']];
    const DISPLAY_STYLES = [['led', 'LED dots'], ['screen', 'Screen']];
    /** The display's dots across and down; a frame is painted this many pixels a dot. */
    const DOTS = [48, 10], DOT_PX = 3;

    /** A 5 x 7 dot font for LED displays: each glyph its rows, '#' lit; narrow marks are narrower. */
    const DOT_FONT = {
        A: [' ### ', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'], B: ['#### ', '#   #', '#   #', '#### ', '#   #', '#   #', '#### '],
        C: [' ### ', '#   #', '#    ', '#    ', '#    ', '#   #', ' ### '], D: ['#### ', '#   #', '#   #', '#   #', '#   #', '#   #', '#### '],
        E: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#####'], F: ['#####', '#    ', '#    ', '#### ', '#    ', '#    ', '#    '],
        G: [' ### ', '#   #', '#    ', '# ###', '#   #', '#   #', ' ####'], H: ['#   #', '#   #', '#   #', '#####', '#   #', '#   #', '#   #'],
        I: [' ### ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '], J: ['  ###', '   # ', '   # ', '   # ', '   # ', '#  # ', ' ##  '],
        K: ['#   #', '#  # ', '# #  ', '##   ', '# #  ', '#  # ', '#   #'], L: ['#    ', '#    ', '#    ', '#    ', '#    ', '#    ', '#####'],
        M: ['#   #', '## ##', '# # #', '# # #', '#   #', '#   #', '#   #'], N: ['#   #', '#   #', '##  #', '# # #', '#  ##', '#   #', '#   #'],
        O: [' ### ', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '], P: ['#### ', '#   #', '#   #', '#### ', '#    ', '#    ', '#    '],
        Q: [' ### ', '#   #', '#   #', '#   #', '# # #', '#  # ', ' ## #'], R: ['#### ', '#   #', '#   #', '#### ', '# #  ', '#  # ', '#   #'],
        S: [' ####', '#    ', '#    ', ' ### ', '    #', '    #', '#### '], T: ['#####', '  #  ', '  #  ', '  #  ', '  #  ', '  #  ', '  #  '],
        U: ['#   #', '#   #', '#   #', '#   #', '#   #', '#   #', ' ### '], V: ['#   #', '#   #', '#   #', '#   #', '#   #', ' # # ', '  #  '],
        W: ['#   #', '#   #', '#   #', '# # #', '# # #', '# # #', ' # # '], X: ['#   #', '#   #', ' # # ', '  #  ', ' # # ', '#   #', '#   #'],
        Y: ['#   #', '#   #', ' # # ', '  #  ', '  #  ', '  #  ', '  #  '], Z: ['#####', '    #', '   # ', '  #  ', ' #   ', '#    ', '#####'],
        0: [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '], 1: ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
        2: [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'], 3: ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
        4: ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '], 5: ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
        6: ['  ## ', ' #   ', '#    ', '#### ', '#   #', '#   #', ' ### '], 7: ['#####', '    #', '   # ', '  #  ', ' #   ', ' #   ', ' #   '],
        8: [' ### ', '#   #', '#   #', ' ### ', '#   #', '#   #', ' ### '], 9: [' ### ', '#   #', '#   #', ' ####', '    #', '   # ', ' ##  '],
        '-': ['    ', '    ', '    ', '####', '    ', '    ', '    '], '.': ['  ', '  ', '  ', '  ', '  ', '##', '##'], ':': ['  ', '##', '##', '  ', '##', '##', '  '],
        ',': ['  ', '  ', '  ', '  ', ' #', ' #', '# '], '/': ['    #', '    #', '   # ', '  #  ', ' #   ', '#    ', '#    '], '!': ['#', '#', '#', '#', '#', ' ', '#'],
        '%': ['##   ', '##  #', '   # ', '  #  ', ' #   ', '#  ##', '   ##'], '+': ['     ', '  #  ', '  #  ', '#####', '  #  ', '  #  ', '     '],
        '#': [' # # ', ' # # ', '#####', ' # # ', '#####', ' # # ', ' # # '], '>': ['#   ', ' #  ', '  # ', '   #', '  # ', ' #  ', '#   '],
        '<': ['   #', '  # ', ' #  ', '#   ', ' #  ', '  # ', '   #'], '=': ['    ', '    ', '####', '    ', '####', '    ', '    '],
        '_': ['     ', '     ', '     ', '     ', '     ', '     ', '#####'], '|': ['#', '#', '#', '#', '#', '#', '#']
    };

    /** Text in the dot font: { width (dots), at(x, y) lit or not, x and y whole dots from its top left }. */
    function dotLayout(text) {
        const cols = [];
        for (const ch of String(text)) {
            if (ch === ' ') { for (let i = 0; i < 3; i++) cols.push(0); continue; }
            const g = DOT_FONT[ch];
            if (!g) { for (let i = 0; i < 3; i++) cols.push(0); continue; }
            for (let x = 0; x < g[0].length; x++) { let bits = 0; for (let y = 0; y < 7; y++) if (g[y][x] === '#') bits |= 1 << y; cols.push(bits); }
            cols.push(0);
        }
        if (cols.length) cols.pop();
        return { width: cols.length, at: (x, y) => (x >= 0 && x < cols.length && y >= 0 && y < 7 ? (cols[x] >> y) & 1 : 0) };
    }

    /**
     * What each frame of a display shows, frame by frame: `draw(f)` gives
     * { texts: [{ text, x, y }] (dots from the top left, 7 dots tall), bars:
     * [[x0, y0, x1, y1, strength]] }; frames step every `period` seconds and
     * a whole number of them fill the loop (`loop` seconds).
     */
    function displayScript(display, loop, seed) {
        const [cols, rows] = DOTS, top = (rows - 7) / 2;
        const mode = display.mode;
        if (mode === 'text') {
            const text = cleanText(display.text, 32) || 'CARGO';
            const width = Math.max(dotLayout(text).width, Math.ceil(layout(text).width * 7 / 6));
            if (width <= cols - 3) {
                // It fits: shown still, a block cursor blinking after it.
                const left = Math.floor((cols - width - 3) / 2);
                return { frames: 2, period: 0.5, draw: f => ({ texts: [{ text, x: left, y: top }], bars: f === 0 ? [[left + width + 1, top, left + width + 3, top + 7, 1]] : [] }) };
            }
            // Wider than the screen: it scrolls past, a dot or two a frame.
            const span = width + cols, frames = Math.min(64, Math.max(16, Math.round(loop * 8))), step = span / frames;
            return { frames, period: loop / frames, draw: f => ({ texts: [{ text, x: cols - Math.round(f * step), y: top }], bars: [] }) };
        }
        if (mode === 'numbers') {
            // A reading that wanders: a label, then a value moving a little twice a second, back where it began by the loop's end.
            const label = cleanText(display.text, 4).replace(/[^A-Z ]/g, '').trim();
            const rand = Paint.random((seed >>> 0) + 71), frames = Math.max(8, Math.round(loop * 2));
            let v = 40 + rand() * 50;
            const values = [];
            for (let f = 0; f < frames; f++) { v += (rand() - 0.5) * 4; values.push(v); }
            const drift = values[frames - 1] - values[0];
            const texts = values.map((x, f) => (label ? label + ' ' : '') + (x - drift * f / frames).toFixed(1));
            return { frames, period: loop / frames, draw: f => { const w = dotLayout(texts[f]).width; return { texts: [{ text: texts[f], x: Math.floor((cols - w) / 2), y: top }], bars: [] }; } };
        }
        if (mode === 'progress') {
            // Filling over three quarters of the loop, then full, blinking.
            const frames = 32;
            return {
                frames, period: loop / frames, draw: f => {
                    const p = Math.min(1, f / (frames * 0.75)), full = p >= 1;
                    const text = full ? 'FULL' : Math.round(p * 100) + '%', w = dotLayout(text).width;
                    const bars = [[1, 8, cols - 1, 10, 0.12], [1, 8, 1 + Math.round((cols - 2) * p), 10, 1]];
                    return { texts: full && f % 2 ? [] : [{ text, x: Math.floor((cols - w) / 2), y: 0 }], bars };
                }
            };
        }
        return { frames: 1, period: loop, draw: () => ({ texts: [], bars: [] }) };
    }

    /**
     * The glow sheet (512 x 512, or 1024 wide for a display's frames): a
     * swatch for every glow color at full, three-quarter, half and a quarter
     * strength (four across), a soft halo for each (its alpha a falloff), and
     * the display's frames side by side. Returns { picture, swatch(color,
     * level) -> uv, halo(color) -> rect uvs, frame(f) -> rect uvs, picture
     * rect }.
     */
    function glowSheet(colors, display, loop, seed, image) {
        const script = display && display.mode !== 'none' && display.mode !== 'picture' ? displayScript(display, loop, seed) : null;
        const pictureMode = display && display.mode === 'picture';
        const W = script || pictureMode ? 1024 : 256, H = script && script.frames > 32 ? 512 : script || pictureMode ? 512 : 256;
        const a = atlas(W, H, [8, 8, 10, 255]);
        a.pad = 2;
        const list = [...new Set(colors.filter(Boolean))];
        const swatches = new Map(), halos = new Map();
        const levels = [1, 0.72, 0.46, 0.24];
        for (const hexc of list) {
            const c = rgb(hexc);
            const row = [];
            for (const lv of levels) {
                const rect = region(a, 12, 12);
                // Hot at full strength: the middle runs toward white.
                fill(a, rect, (s, t, out) => { const k = lv, hot = lv >= 1 ? 0.12 : 0; out[0] = mix(c[0] * k, 1, hot); out[1] = mix(c[1] * k, 1, hot); out[2] = mix(c[2] * k, 1, hot); out[3] = 1; });
                row.push(rect);
            }
            swatches.set(hexc, row);
            const hr = region(a, 48, 48);
            fill(a, hr, (s, t, out) => {
                const d = Math.hypot(s - 0.5, t - 0.5) * 2;
                const f = Math.pow(clamp01(1 - d), 2.6);
                out[0] = mix(c[0], 1, f * 0.12); out[1] = mix(c[1], 1, f * 0.12); out[2] = mix(c[2], 1, f * 0.12); out[3] = f * 0.6;
            });
            halos.set(hexc, hr);
        }
        let frames = [], pictureRect = null;
        if (script) {
            const [cols, rows] = DOTS;
            const fw = cols * DOT_PX, fh = rows * DOT_PX;
            const c = rgb(display.color || '#ffb340');
            const led = display.style !== 'screen';
            // New shelf for the frames.
            a.shelfY += a.shelfH; a.shelfH = 0; a.cursorX = 0;
            const layouts = new Map(), strokes = new Map();
            const dotsOf = t => layouts.get(t) || layouts.set(t, dotLayout(t)).get(t);
            const strokesOf = t => strokes.get(t) || strokes.set(t, layout(t)).get(t);
            for (let f = 0; f < script.frames; f++) {
                const rect = region(a, fw, fh), d = script.draw(f);
                // LED: each dot lit by the dot font or a bar. Screen: smooth letters and bars at the pixel.
                const lit = new Float32Array(cols * rows);
                if (led) {
                    for (const t of d.texts) { const L = dotsOf(t.text); for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) if (L.at(col - t.x, r - Math.round(t.y))) lit[r * cols + col] = 1; }
                    for (const [x0, y0, x1, y1, k] of d.bars) for (let r = Math.max(0, y0); r < Math.min(rows, y1); r++) for (let col = Math.max(0, x0); col < Math.min(cols, x1); col++) lit[r * cols + col] = Math.max(lit[r * cols + col], k);
                }
                fill(a, rect, (s, t, out) => {
                    const px = s * cols, py = t * rows;
                    if (led) {
                        // Round dots on black; an unlit dot still faintly there.
                        const col = Math.min(cols - 1, Math.floor(px)), r = Math.min(rows - 1, Math.floor(py)), v = lit[r * cols + col];
                        const dd = Math.hypot(frac(px) - 0.5, frac(py) - 0.5), disc = clamp01((0.42 - dd) * 8);
                        const k = Math.max(0.07, v) * disc, hot = v > 0.5 ? 0.25 * disc * disc : 0;
                        out[0] = mix(0.02, c[0], k) + hot; out[1] = mix(0.02, c[1], k) + hot; out[2] = mix(0.025, c[2], k) + hot;
                    } else {
                        let v = 0;
                        for (const tx of d.texts) { const L = strokesOf(tx.text); v = Math.max(v, coverage(L, (px - tx.x) * 6 / 7, (py - tx.y) * 6 / 7, 0.95, false, 0, 6 / 7 / DOT_PX)); }
                        for (const [x0, y0, x1, y1, k] of d.bars) if (px >= x0 && px < x1 && py >= y0 && py < y1) v = Math.max(v, k);
                        // A screen: glowing glyphs, faint scan lines, a dark tint of the color behind.
                        const scan = 0.84 + 0.16 * Math.sin(t * fh * Math.PI);
                        out[0] = mix(c[0] * 0.07, mix(c[0], 1, 0.3), v) * scan; out[1] = mix(c[1] * 0.07, mix(c[1], 1, 0.3), v) * scan; out[2] = mix(c[2] * 0.09, mix(c[2], 1, 0.3), v) * scan;
                    }
                    out[3] = 1;
                });
                frames.push(rect);
            }
        } else if (pictureMode) {
            a.shelfY += a.shelfH; a.shelfH = 0; a.cursorX = 0;
            pictureRect = region(a, 320, 80);
            const tmp = [0, 0, 0, 255];
            const led = display.style !== 'screen';
            const [cols, rows] = [DOTS[0] * 2, DOTS[1] * 2];
            fill(a, pictureRect, (s, t, out) => {
                if (image) {
                    // The picture fitted to the screen's shape, letterboxed in black.
                    const ia = image.width / image.height, sa = DOTS[0] / DOTS[1];
                    let u = s, v = t;
                    if (ia > sa) v = (t - 0.5) * ia / sa + 0.5; else u = (s - 0.5) * sa / ia + 0.5;
                    if (led) { u = (Math.floor(u * cols) + 0.5) / cols; v = (Math.floor(v * rows) + 0.5) / rows; }
                    if (u < 0 || u > 1 || v < 0 || v > 1) { out[0] = out[1] = out[2] = 0.02; out[3] = 1; return; }
                    Paint.sampleImage(image, u, v, tmp);
                    const k = led ? clamp01((0.44 - Math.hypot(frac(s * cols) - 0.5, frac(t * rows) - 0.5)) * 8) : 0.88 + 0.12 * Math.sin(t * 80 * Math.PI);
                    out[0] = tmp[0] / 255 * k; out[1] = tmp[1] / 255 * k; out[2] = tmp[2] / 255 * k;
                } else { out[0] = out[1] = out[2] = 0.03; }
                out[3] = 1;
            });
        }
        const uvRect = rect => ({ u0: rect.x / W, v0: rect.y / H, u1: (rect.x + rect.w) / W, v1: (rect.y + rect.h) / H });
        return {
            picture: { width: W, height: H, data: a.data, name: 'glow.png' },
            swatch: (hexc, level) => { const row = swatches.get(hexc); const r = row ? row[Math.max(0, Math.min(3, level || 0))] : null; return r ? [(r.x + r.w / 2) / W, (r.y + r.h / 2) / H] : [0, 0]; },
            halo: hexc => (halos.has(hexc) ? uvRect(halos.get(hexc)) : null),
            frames: frames.map(uvRect), period: script ? script.period : LOOP_FALLBACK,
            pictureRect: pictureRect ? uvRect(pictureRect) : null,
            levels
        };
    }

    const api = { DOT_FONT, dotLayout, atlas, region, fill, uvIn, rgb, wood, paintedMetal, iron, rope, straw, coins, GLYPHS, cleanText, layout, coverage, SYMBOLS, symbolAt, markings, DISPLAY_MODES, DISPLAY_STYLES, DOTS, displayScript, glowSheet, smooth, mix, clamp01, frac };
    root.RRContainerPaint = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
