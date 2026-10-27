/**
 * RRCharacterFabric - the cloth under the print.
 *
 * A garment's picture (RRCharacterAtlas) is about a millimeter a texel: fine
 * for its colors, prints and trims, far too coarse for the weave itself (a
 * weave painted into it shimmers as moiré up close and is gone far off). The
 * weave, the stitches, a leather's grain or a hammered plate's dents live
 * here instead: small repeating relief and finish tiles, laid on a second
 * set of coordinates in meters (TEXCOORD_1), so they are as fine as the real
 * thing close up and filter down to their average far off.
 *
 *   KINDS                   every tile: denim, jersey, rib, canvas, poplin,
 *                           felt, suiting, satin, suede, leather, brushed,
 *                           hammered, ripstop, padded, neoprene, plastic,
 *                           quilted, mail; and the Cyberpunk cloths techShell,
 *                           cordura, baffled, hexKnit, coated, ventMesh
 *   kindFor(material, garmentId, pattern)   the tile a garment's cloth takes:
 *                           its material, and for plain 'cloth' what the
 *                           garment is (jeans are denim, a T-shirt jersey, a
 *                           sweater rib, a suit worsted)
 *   tile(kind)              { kind, span: [u, v] meters, normal, orm,
 *                           normalScale, roughness, mean, metal, occlusion,
 *                           sheen } - `normal` and `orm` are repeating RGBA
 *                           pictures ({ name, width, height, data, repeat });
 *                           orm is R occlusion, G roughness (times
 *                           `roughness`), B metal
 *   applyTo(part, kind, textures, options)   a part made to show a tile: its
 *                           second coordinates (`uvs1`, box-projected from its
 *                           positions when it has none), its relief, finish and
 *                           occlusion on them, its roughness. For other
 *                           builders too (armor: applyTo(part, 'hammered',
 *                           textures, { roughness: 0.32 })).
 *   boxUvs(positions, normals, span)   second coordinates for a rigid part
 *
 * A part showing a tile carries `uvs1`, `normalTexture` + `normalTexCoord: 1`,
 * `metallicRoughnessTexture` + `metallicRoughnessTexCoord: 1`,
 * `occlusionTexture` + `occlusionTexCoord: 1` + `occlusionStrength`, `fabric`
 * (the kind) and maybe `sheen` ({ color, roughness, texture }), which
 * RRCharacterGlb writes as TEXCOORD_1 and KHR_materials_sheen.
 */
(function(root) {
    'use strict';

    const fract = x => x - Math.floor(x);
    const mod = (a, n) => ((a % n) + n) % n;
    const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
    const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const tri = t => Math.abs(fract(t) - 0.5) * 2;

    /** A fixed random 0..1 for integer coordinates and a seed. */
    function ihash(x, y, s) {
        let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    /** Value noise repeating over the tile: `nx` by `ny` cells across u, v in 0..1. */
    function pnoise(u, v, nx, ny, seed) {
        const x = u * nx, y = v * ny, ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const x0 = mod(ix, nx), x1 = mod(ix + 1, nx), y0 = mod(iy, ny), y1 = mod(iy + 1, ny);
        const a = ihash(x0, y0, seed), b = ihash(x1, y0, seed), c = ihash(x0, y1, seed), d = ihash(x1, y1, seed);
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
    function fbm(u, v, n, octaves, seed) {
        let sum = 0, amp = 1, total = 0;
        for (let o = 0; o < octaves; o++) { sum += amp * pnoise(u, v, n << o, n << o, seed + o * 31); total += amp; amp *= 0.5; }
        return sum / total;
    }
    /** Cells repeating over the tile (n by n jittered points): the nearest's and the second's distance, in cells. */
    function pcells(u, v, n, seed, jitter) {
        const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y), j = jitter ?? 0.8;
        let f1 = 9, f2 = 9, id = 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
            const cx = ix + a, cy = iy + b, wx = mod(cx, n), wy = mod(cy, n);
            const px = cx + 0.5 + (ihash(wx, wy, seed) - 0.5) * j, py = cy + 0.5 + (ihash(wx, wy, seed + 7) - 0.5) * j;
            const d = Math.hypot(x - px, y - py);
            if (d < f1) { f2 = f1; f1 = d; id = wy * n + wx; } else if (d < f2) f2 = d;
        }
        return { f1, f2, id };
    }
    /** A round yarn's height across its width (0 at its sides, 1 on top); `d` from its middle, `w` half its width. */
    const yarn = (d, w) => { const q = Math.abs(d) / w; return q >= 1 ? 0 : Math.sqrt(1 - q * q); };

    /** A plain weave of `n` threads each way: warp over weft over warp, each yarn a little thicker or thinner than the next. */
    function plainWeave(u, v, n, seed, slub) {
        const x = u * n, y = v * n, col = Math.floor(x), row = Math.floor(y), fx = x - col, fy = y - row;
        const tw = 1 + (slub || 0) * (ihash(mod(col, n), 0, seed) - 0.5), tf = 1 + (slub || 0) * (ihash(mod(row, n), 1, seed) - 0.5);
        // A thick yarn still ends at its cell's side, so neighboring cells meet without a step.
        const warp = 0.32 * Math.cos(Math.PI * (y - 0.5 - col)) + 0.5 * tw * yarn(fx - 0.5, Math.min(0.5, 0.47 * tw));
        const weft = -0.32 * Math.cos(Math.PI * (x - 0.5 - row)) + 0.5 * tf * yarn(fy - 0.5, Math.min(0.5, 0.47 * tf));
        return Math.max(warp, weft, -0.35);
    }
    /** A twill: ridges at 45 degrees, `n` across the tile each way, rounded and steeper on one side. */
    function twill(u, v, n) {
        const t = fract((u + v) * n);
        return Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 1.3);
    }
    /** A knit stitch: two legs leaning together into a V, round in section; fx across the wale, fy down the course. */
    function knitV(fx, fy) {
        const lean = 0.07 + 0.22 * (1 - fy);
        const swell = 0.75 + 0.25 * Math.sin(Math.PI * fy);
        return Math.max(yarn(fx - (0.5 - lean), 0.19), yarn(fx - (0.5 + lean), 0.19)) * swell;
    }

    /**
     * The tiles. `span` meters each way, `size` texels; `sample(u, v, s)` sets
     * s.h (height, mm), s.r (roughness), s.m (metal 0..1), s.ao (occlusion
     * beyond the relief's own). `cavity`: how dark a millimeter-deep hollow
     * goes (per mm). `sheen`: [strength, roughness] where the cloth takes one.
     */
    const KINDS = {
        // Indigo twill: diagonal wales a millimeter apart, each warp yarn's slubs running along it.
        denim: { span: 0.0256, size: 512, normalScale: 1, cavity: 4, occlusion: 0.8, sheen: [0.25, 0.85],
            sample(u, v, s) {
                const wale = twill(u, v, 18), warp = yarn(fract(u * 72) - 0.5, 0.5), slub = pnoise(u, v, 72, 6, 11);
                s.h = 0.07 * wale + 0.018 * warp + 0.03 * (slub - 0.5);
                s.r = 0.9 + 0.06 * (slub - 0.5) - 0.03 * wale;
            } },
        // Single jersey: columns of small V stitches.
        jersey: { span: 0.0128, size: 256, normalScale: 0.9, cavity: 5, occlusion: 0.6, sheen: [0.35, 0.75],
            sample(u, v, s) {
                const x = u * 12, y = v * 16;
                s.h = 0.05 * knitV(fract(x), fract(y)) + 0.008 * pnoise(u, v, 64, 64, 3);
                s.r = 0.88 + 0.05 * (pnoise(u, v, 24, 24, 5) - 0.5);
            } },
        // Two by two rib: two raised knit wales, two sunken purl wales.
        rib: { span: 0.0256, size: 256, normalScale: 1, cavity: 2.2, occlusion: 0.75, sheen: [0.35, 0.8],
            sample(u, v, s) {
                const q = fract(u * 4), rib = smoothstep(0.15, 0.85, 0.5 + 0.5 * Math.sin(2 * Math.PI * q));
                const x = u * 16, y = v * 20, knit = knitV(fract(x), fract(y)), purl = 0.5 + 0.5 * Math.cos(4 * Math.PI * y);
                s.h = 0.45 * rib + (0.08 * knit) * rib + 0.05 * purl * (1 - rib) + 0.01 * pnoise(u, v, 48, 48, 9);
                s.r = 0.92;
            } },
        // Cotton duck: a coarse, tight plain weave, its yarns uneven.
        canvas: { span: 0.0256, size: 256, normalScale: 1, cavity: 5, occlusion: 0.65, sheen: [0.2, 0.85],
            sample(u, v, s) {
                const w = plainWeave(u, v, 32, 21, 0.35);
                s.h = 0.12 * w + 0.02 * (pnoise(u, v, 8, 8, 4) - 0.5);
                s.r = 0.86 + 0.06 * (pnoise(u, v, 32, 4, 6) - 0.5);
            } },
        // Shirting: a fine, even plain weave.
        poplin: { span: 0.0128, size: 256, normalScale: 0.8, cavity: 6, occlusion: 0.5, sheen: [0.3, 0.7],
            sample(u, v, s) {
                s.h = 0.04 * plainWeave(u, v, 32, 23, 0.15);
                s.r = 0.78 + 0.04 * (pnoise(u, v, 16, 4, 8) - 0.5);
            } },
        // Wool felt and boiled wool: no weave to see, a soft matted fuzz.
        felt: { span: 0.0256, size: 256, normalScale: 0.8, cavity: 3, occlusion: 0.5, sheen: [0.45, 0.9],
            sample(u, v, s) {
                const f = fbm(u, v, 16, 4, 13), fine = pnoise(u, v, 128, 128, 14);
                s.h = 0.06 * f + 0.02 * fine;
                s.r = 0.95 - 0.03 * f;
            } },
        // Worsted suiting: a fine twill under a faint heather.
        suiting: { span: 0.0128, size: 256, normalScale: 0.8, cavity: 6, occlusion: 0.55, sheen: [0.4, 0.75],
            sample(u, v, s) {
                const wale = twill(u, v, 16), heather = pnoise(u, v, 64, 64, 15);
                s.h = 0.03 * wale + 0.01 * heather;
                s.r = 0.8 + 0.05 * (heather - 0.5);
            } },
        // Satin: long smooth floats along the warp; its shine breaks into soft streaks along them.
        satin: { span: 0.0256, size: 256, normalScale: 0.7, cavity: 2, occlusion: 0.2, sheen: [0.6, 0.35],
            sample(u, v, s) {
                // Sixty threads each way, a whole number of five-thread satin repeats.
                const col = Math.floor(u * 60), row = Math.floor(v * 60), fx = fract(u * 60), fy = fract(v * 60);
                const tie = mod(row - 2 * col, 5) === 0 ? Math.sin(Math.PI * fy) * yarn(fx - 0.5, 0.5) : 0;
                const streak = 0.65 * ihash(mod(col, 60), 3, 17) + 0.35 * pnoise(u, v, 60, 3, 18), wave = fbm(u, v, 2, 2, 19);
                s.h = 0.01 * yarn(fx - 0.5, 0.5) - 0.02 * tie + 0.01 * (wave - 0.5);
                s.r = 0.5 + 0.2 * streak + 0.06 * (wave - 0.5);
            } },
        // Suede: a fine nap, brushed into patches that catch the light differently.
        suede: { span: 0.0256, size: 256, normalScale: 0.7, cavity: 4, occlusion: 0.4, sheen: [0.5, 0.95],
            sample(u, v, s) {
                const nap = pnoise(u, v, 128, 128, 25), patch = fbm(u, v, 3, 3, 26);
                s.h = 0.025 * nap + 0.02 * pnoise(u, v, 48, 48, 27);
                s.r = 0.92 + 0.08 * (patch - 0.5);
            } },
        // Leather: a pebbled grain, its hollows duller, crossed by a few long creases and finer wrinkles.
        leather: { span: 0.0512, size: 512, normalScale: 1, cavity: 6, occlusion: 0.6,
            sample(u, v, s) {
                const c = pcells(u, v, 36, 31, 0.85), dome = smoothstep(0, 0.32, c.f2 - c.f1);
                const crease = (1 - smoothstep(0.004, 0.03, Math.abs(pnoise(u, v, 4, 4, 32) - 0.5))) * smoothstep(0.35, 0.65, pnoise(u, v, 3, 3, 33));
                const wrinkle = (1 - smoothstep(0.003, 0.02, Math.abs(pnoise(u, v, 11, 11, 34) - 0.5))) * smoothstep(0.45, 0.75, pnoise(u, v, 5, 5, 35));
                s.h = 0.06 * dome - 0.1 * crease - 0.035 * wrinkle;
                s.r = 0.48 + 0.12 * (1 - dome) + 0.12 * crease + 0.05 * wrinkle;
            } },
        // Brushed steel: fine streaks along one way, its shine in streaks with them.
        brushed: { span: 0.0256, size: 256, normalScale: 0.6, cavity: 0, occlusion: 0, metal: true,
            sample(u, v, s) {
                const streak = 0.6 * pnoise(u, v, 3, 128, 41) + 0.4 * pnoise(u, v, 7, 256, 42);
                s.h = 0.004 * streak;
                s.r = 0.3 + 0.12 * streak;
                s.m = 1;
            } },
        // Hammered steel: overlapping round dents from a peen, each a little more polished in its hollow.
        hammered: { span: 0.064, size: 512, normalScale: 0.9, cavity: 0.6, occlusion: 0.3, metal: true,
            sample(u, v, s) {
                const c = pcells(u, v, 10, 43, 0.9), d = Math.min(1, c.f1 / 0.66);
                const ridge = 1 - smoothstep(0, 0.12, c.f2 - c.f1), streak = pnoise(u, v, 4, 256, 44);
                s.h = -0.16 * (1 - d * d) + 0.03 * ridge + 0.003 * streak;
                s.r = 0.27 + 0.09 * d + 0.05 * streak + 0.04 * (ihash(c.id, 0, 45) - 0.5);
                s.m = 1;
            } },
        // Ripstop nylon: a fine weave locked into a grid of heavier threads.
        ripstop: { span: 0.0256, size: 256, normalScale: 0.9, cavity: 5, occlusion: 0.5, sheen: [0.25, 0.55],
            sample(u, v, s) {
                const w = plainWeave(u, v, 64, 47, 0.1);
                // A heavier thread every 6.4 mm each way: a smooth rounded ridge along each grid line.
                const line = t => Math.exp(-((Math.min(fract(t), 1 - fract(t)) / 0.035) ** 2));
                const grid = Math.max(line(u * 4), line(v * 4));
                s.h = 0.025 * w + 0.04 * grid;
                s.r = 0.74 + 0.08 * grid;
            } },
        // Padded flex rib: puffed channels quilted in a shallow chevron, stitched in their grooves, a fine knit face.
        padded: { span: 0.048, size: 256, normalScale: 0.75, cavity: 1.6, occlusion: 0.6, sheen: [0.25, 0.55],
            sample(u, v, s) {
                const y = v * 8 + 0.35 * tri(u * 2), q = fract(y);
                const puff = Math.pow(Math.sin(Math.PI * q), 0.7);
                const groove = 1 - smoothstep(0.02, 0.08, Math.min(q, 1 - q));
                const stitch = groove * (fract(u * 40) < 0.55 ? 1 : 0);
                s.h = 0.4 * puff - 0.08 * stitch + 0.01 * knitV(fract(u * 48), fract(v * 64));
                s.r = 0.52 + 0.18 * (1 - puff);
            } },
        // Neoprene: a smooth rubber face under a fine knit skin.
        neoprene: { span: 0.0128, size: 256, normalScale: 0.7, cavity: 4, occlusion: 0.4, sheen: [0.2, 0.6],
            sample(u, v, s) {
                s.h = 0.02 * knitV(fract(u * 16), fract(v * 22)) + 0.006 * pnoise(u, v, 64, 64, 51);
                s.r = 0.64 + 0.05 * (pnoise(u, v, 16, 16, 52) - 0.5);
            } },
        // Cyberpunk technical cloths (RRCharacterCyberwear's garments), their relief broad enough to read from across a room.
        // Bonded technical shell: a fine twill face under a raised ripstop grid every 8 mm, its coating's shine mottled.
        techShell: { span: 0.032, size: 256, normalScale: 1.5, cavity: 8, occlusion: 0.9, sheen: [0.2, 0.45],
            sample(u, v, s) {
                const line = t => Math.exp(-((Math.min(fract(t), 1 - fract(t)) / 0.045) ** 2));
                const grid = Math.max(line(u * 4), line(v * 4));
                s.h = 0.04 * twill(u, v, 48) + 0.1 * grid + 0.012 * pnoise(u, v, 8, 8, 71);
                s.r = 0.62 + 0.1 * grid + 0.1 * (pnoise(u, v, 4, 4, 72) - 0.5);
            } },
        // Heavy-duty nylon: a coarse two-over-two basket weave with a dull sheen.
        cordura: { span: 0.024, size: 256, normalScale: 1.8, cavity: 8, occlusion: 0.9, sheen: [0.3, 0.7],
            sample(u, v, s) {
                // Paired yarns (two over two), 1.2 mm each, a little slubbed, in a 12 mm ripstop box.
                const w = plainWeave(u, v, 10, 73, 0.25), fine = plainWeave(u, v, 20, 78, 0.1);
                const line = t => Math.exp(-((Math.min(fract(t), 1 - fract(t)) / 0.06) ** 2)), grid = Math.max(line(u * 2), line(v * 2));
                s.h = 0.07 * w + 0.03 * fine + 0.12 * grid;
                s.r = 0.76 + 0.06 * w - 0.04 * grid;
            } },
        // Channel quilting: puffed horizontal baffles 2.5 cm apart, stitched in their grooves, a ripstop face.
        baffled: { span: 0.05, size: 256, normalScale: 1.2, cavity: 2.2, occlusion: 0.9, sheen: [0.3, 0.45],
            sample(u, v, s) {
                const q = fract(v * 2), puff = Math.pow(Math.sin(Math.PI * q), 0.6);
                const groove = 1 - smoothstep(0.015, 0.06, Math.min(q, 1 - q)), stitch = groove * (fract(u * 30) < 0.6 ? 1 : 0);
                s.h = 0.5 * puff - 0.06 * stitch + 0.015 * plainWeave(u, v, 80, 74, 0.1);
                s.r = 0.5 + 0.2 * groove;
            } },
        // Compression knit: small raised hexagons in rows, a smooth knit between them.
        hexKnit: { span: 0.016, size: 256, normalScale: 1.3, cavity: 6, occlusion: 0.8, sheen: [0.3, 0.5],
            sample(u, v, s) {
                const X = u * 7, Y = v * 8, row = Math.floor(Y), x = X + (row & 1) * 0.5;
                const fx = fract(x) - 0.5, fy = fract(Y) - 0.5;
                const hex = Math.max(Math.abs(fx) * 0.866 + Math.abs(fy) * 0.5, Math.abs(fy)) * 1.15;
                const cell = 1 - smoothstep(0.34, 0.44, hex);
                s.h = 0.16 * cell + 0.015 * knitV(fract(u * 40), fract(v * 54));
                s.r = 0.66 - 0.14 * cell;
            } },
        // Waxed, coated canvas: a firm weave under crinkled creases, shinier where the coating is rubbed.
        coated: { span: 0.064, size: 512, normalScale: 1.2, cavity: 6, occlusion: 0.75, sheen: [0.15, 0.5],
            sample(u, v, s) {
                const crease = Math.abs(fbm(u, v, 6, 3, 75) - 0.5);
                s.h = 0.03 * plainWeave(u, v, 96, 76, 0.2) - 0.18 * Math.exp(-((crease / 0.035) ** 2)) + 0.05 * fbm(u, v, 12, 2, 77);
                s.r = 0.48 + 0.18 * smoothstep(0.02, 0.2, crease);
            } },
        // Vent mesh: a knit face perforated in a fine grid of holes.
        ventMesh: { span: 0.0128, size: 256, normalScale: 1.2, cavity: 8, occlusion: 0.85, sheen: [0.35, 0.6],
            sample(u, v, s) {
                const x = fract(u * 12) - 0.5, y = fract(v * 12 + (Math.floor(u * 12) & 1) * 0.5) - 0.5, hole = 1 - smoothstep(0.16, 0.24, Math.hypot(x, y));
                s.h = 0.04 * knitV(fract(u * 36), fract(v * 48)) - 0.12 * hole;
                s.r = 0.7 + 0.1 * hole;
                if (hole > 0.5) s.ao = 0.55;
            } },
        // Moulded plastic: a faint orange peel, its shine a little mottled.
        plastic: { span: 0.0256, size: 256, normalScale: 0.6, cavity: 0, occlusion: 0,
            sample(u, v, s) {
                s.h = 0.008 * fbm(u, v, 16, 3, 55);
                s.r = 0.36 + 0.06 * (fbm(u, v, 8, 2, 56) - 0.5);
            } },
        // A gambeson: canvas puffed between diagonal quilting lines four centimeters apart (the print's own seams).
        quilted: { span: 0.08, size: 512, normalScale: 1, cavity: 0.5, occlusion: 0.85, sheen: [0.2, 0.85],
            sample(u, v, s) {
                const a = fract((u + v) * 2 + 0.5), b = fract((u - v) * 2 + 0.5);
                const puff = Math.sqrt(Math.max(0, Math.sin(Math.PI * a) * Math.sin(Math.PI * b)));
                const seam = Math.max(1 - smoothstep(0, 0.025, Math.min(a, 1 - a)), 1 - smoothstep(0, 0.025, Math.min(b, 1 - b)));
                s.h = 1.6 * puff - 0.25 * seam + 0.1 * plainWeave(u, v, 100, 61, 0.35);
                s.r = 0.88 + 0.05 * seam;
            } },
        // Riveted mail: rows of rings, every other row offset by half a ring, each ring over the row below it.
        mail: { span: [0.056, 0.044], size: 512, normalScale: 1, cavity: 0.35, occlusion: 0.9, metal: true,
            sample(u, v, s) {
                const X = u * 56, Y = v * 44, row = Math.floor(Y / 11);
                let best = -1.4, ring = false;
                for (let r = row - 1; r <= row + 1; r++) {
                    const cy = (r + 0.5) * 11, shift = (mod(r, 4) & 1) * 7;
                    for (let c = Math.floor((X - shift) / 14) - 1; c <= Math.floor((X - shift) / 14) + 1; c++) {
                        const cx = c * 14 + 7 + shift, d = Math.hypot(X - cx, (Y - cy) * 1.1), wire = Math.abs(d - 5.6);
                        if (wire > 1.05) continue;
                        // Each ring leans back, its top under the row above.
                        const z = 0.9 * yarn(wire, 1.05) - 0.08 * (Y - cy);
                        if (z > best) { best = z; ring = true; }
                    }
                }
                s.h = best;
                s.r = ring ? 0.34 : 0.9;
                s.m = ring ? 1 : 0;
                if (!ring) s.ao = 0.35;
            } }
    };

    /** The cloth a plain 'cloth' garment is woven of, by what it is. */
    const GARMENT_CLOTH = {
        denim: ['jeans', 'shorts', 'capri', 'flaredTrousers'],
        jersey: ['tshirt', 'tanktop', 'cropTop', 'offShoulder', 'polo', 'hoodie', 'leggings', 'sportsBra', 'briefs', 'boxers', 'tights', 'tennisDress', 'scrubs', 'smartShirt'],
        rib: ['sweater', 'beanie', 'cardigan', 'socks'],
        suiting: ['suitjacket', 'tailcoat', 'pencilSkirt', 'pleatedSkirt', 'skirt'],
        felt: ['robe', 'hood', 'kilt', 'gown'],
        poplin: ['shirt'],
        ripstop: ['starshipUniform', 'officerJacket', 'explorerSuit', 'tacvest', 'swimTrunks', 'techJacket', 'techSmock', 'cyberJoggers', 'cyberBomber'],
        padded: ['evaSuit', 'spacesuit']
    };
    /** The Cyberpunk garments' own technical cloths, for their soft materials. */
    const CYBER_CLOTH = new Map([['techJacket', 'techShell'], ['techSmock', 'techShell'], ['cyberJoggers', 'cordura'], ['cyberBomber', 'baffled'],
        ['compressionSuit', 'hexKnit'], ['cyberTrench', 'coated'], ['smartShirt', 'ventMesh'], ['utilityRig', 'cordura']]);
    const CYBER_SOFT = new Set(['cloth', 'canvas', 'rubber', 'knit', 'denim', undefined]);
    const CLOTH_OF = new Map(Object.entries(GARMENT_CLOTH).flatMap(([kind, ids]) => ids.map(id => [id, kind])));
    const SUEDE = new Set(['vest', 'sash', 'loincloth']);
    const RIBBED_KNIT = new Set(['sweater', 'beanie', 'cardigan', 'socks']);
    const WORSTED = new Set(['suitjacket', 'tailcoat', 'pencilSkirt', 'pleatedSkirt', 'officerJacket', 'uniform']);
    const ARMOR = new Set(['breastplate', 'pauldrons', 'vambraces', 'gauntlets', 'tassets', 'greaves', 'sabatons', 'helm', 'greathelm', 'powerarmor', 'powergauntlets', 'powerhelm']);

    /**
     * The tile for a garment: chain mail and quilting by their pattern; then by
     * material ('cloth' by what the garment is: jeans denim, a T-shirt jersey).
     */
    function kindFor(material, garmentId, pattern) {
        if (pattern === 'mail') return 'mail';
        if (pattern === 'quilted') return 'quilted';
        const id = garmentId || '';
        if (CYBER_CLOTH.has(id) && CYBER_SOFT.has(material)) return CYBER_CLOTH.get(id);
        switch (material) {
            case 'silk': return 'satin';
            case 'leather': return SUEDE.has(id) ? 'suede' : 'leather';
            case 'suede': return 'suede';
            case 'metal': case 'gold': return ARMOR.has(id) ? 'hammered' : 'brushed';
            case 'plastic': return 'plastic';
            case 'rubber': return id === 'evaSuit' || id === 'spacesuit' ? 'padded' : 'neoprene';
            case 'denim': return 'denim';
            case 'knit': return RIBBED_KNIT.has(id) ? 'rib' : 'jersey';
            case 'wool': return WORSTED.has(id) ? 'suiting' : 'felt';
            case 'canvas': return 'canvas';
            default: return CLOTH_OF.get(id) || 'canvas';
        }
    }

    const cache = new Map();
    /** A tile's pictures and settings, made once. */
    function tile(kind) {
        if (cache.has(kind)) return cache.get(kind);
        const def = KINDS[kind];
        if (!def) return null;
        const W = def.size, H = def.size, n = W * H;
        const span = Array.isArray(def.span) ? def.span : [def.span, def.span];
        const height = new Float32Array(n), rough = new Float32Array(n), metal = new Float32Array(n), extra = new Float32Array(n);
        const s = { h: 0, r: 0.8, m: 0, ao: 1 };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            s.h = 0; s.r = 0.8; s.m = def.metal ? 1 : 0; s.ao = 1;
            def.sample((x + 0.5) / W, (y + 0.5) / H, s);
            const i = y * W + x;
            height[i] = s.h; rough[i] = s.r; metal[i] = s.m; extra[i] = s.ao;
        }
        // The relief's normals, from the heights a texel to either side (the tile wraps round).
        const tu = span[0] * 1000 / W, tv = span[1] * 1000 / H;
        const normal = new Uint8Array(n * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            const dx = (height[y * W + (x + 1) % W] - height[y * W + (x + W - 1) % W]) / (2 * tu);
            const dy = (height[((y + 1) % H) * W + x] - height[((y + H - 1) % H) * W + x]) / (2 * tv);
            const l = Math.hypot(dx, dy, 1);
            // glTF's convention: red along +u, green "up" the picture (against +v), blue out of the surface.
            normal[i * 4] = Math.round(127.5 - 127.5 * dx / l);
            normal[i * 4 + 1] = Math.round(127.5 + 127.5 * dy / l);
            normal[i * 4 + 2] = Math.round(127.5 + 127.5 / l);
            normal[i * 4 + 3] = 255;
        }
        // Occlusion: how far each texel lies below the relief around it (a box about two thirds of a millimeter).
        const r = Math.max(2, Math.min(12, Math.round(0.6 / Math.min(tu, tv))));
        const blur = boxBlur(boxBlur(height, W, H, r, true), W, H, r, false);
        let top = 0, sum = 0;
        for (let i = 0; i < n; i++) { top = Math.max(top, rough[i]); sum += rough[i]; }
        top = Math.min(1, Math.max(top, 0.05));
        const orm = new Uint8Array(n * 4);
        for (let i = 0; i < n; i++) {
            const ao = clamp01(1 - (def.cavity || 0) * Math.max(0, blur[i] - height[i])) * extra[i];
            orm[i * 4] = Math.round(255 * ao);
            orm[i * 4 + 1] = Math.round(255 * clamp01(rough[i] / top));
            orm[i * 4 + 2] = Math.round(255 * clamp01(metal[i]));
            orm[i * 4 + 3] = 255;
        }
        const out = {
            kind, span, size: W,
            normal: { name: 'fabric-' + kind + '-normal.png', width: W, height: H, data: normal, repeat: true },
            orm: { name: 'fabric-' + kind + '-orm.png', width: W, height: H, data: orm, repeat: true },
            normalScale: def.normalScale ?? 1, roughness: top, mean: sum / n, metal: !!def.metal,
            occlusion: def.occlusion ?? 0.5, sheen: def.sheen ? { strength: def.sheen[0], roughness: def.sheen[1] } : null
        };
        cache.set(kind, out);
        return out;
    }

    /** A wrapping box average along rows (`across`) or columns. */
    function boxBlur(src, W, H, r, across) {
        const out = new Float32Array(src.length), k = 1 / (2 * r + 1);
        if (across) for (let y = 0; y < H; y++) {
            let acc = 0;
            for (let d = -r; d <= r; d++) acc += src[y * W + mod(d, W)];
            for (let x = 0; x < W; x++) { out[y * W + x] = acc * k; acc += src[y * W + mod(x + r + 1, W)] - src[y * W + mod(x - r, W)]; }
        } else for (let x = 0; x < W; x++) {
            let acc = 0;
            for (let d = -r; d <= r; d++) acc += src[mod(d, H) * W + x];
            for (let y = 0; y < H; y++) { out[y * W + x] = acc * k; acc += src[mod(y + r + 1, H) * W + x] - src[mod(y - r, H) * W + x]; }
        }
        return out;
    }

    /**
     * Second coordinates for a rigid part, in tiles: each vertex projected
     * along the axis its normal faces most, `span` meters a tile.
     */
    function boxUvs(positions, normals, span) {
        const su = Array.isArray(span) ? span[0] : span, sv = Array.isArray(span) ? span[1] : span;
        const count = positions.length / 3, out = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
            const ax = Math.abs(normals ? normals[i * 3] : 0), ay = Math.abs(normals ? normals[i * 3 + 1] : 1), az = Math.abs(normals ? normals[i * 3 + 2] : 0);
            const [a, b] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
            out[i * 2] = a / su; out[i * 2 + 1] = -b / sv;
        }
        return out;
    }

    /**
     * A part made to show `kind`'s tile. `textures`: a name-keyed object or an
     * array the tile's pictures are added to. `options`: { uvs1 (already in
     * tiles), roughness (the part's own level: the tile's variation is kept
     * round it), normalScale, sheenTexture (the base picture the sheen takes
     * its color from) }.
     */
    function applyTo(part, kind, textures, options) {
        const t = tile(kind);
        if (!t || !part) return part;
        const o = options || {};
        part.uvs1 = o.uvs1 || part.uvs1 || boxUvs(part.positions, part.normals, t.span);
        part.fabric = kind;
        part.normalTexture = t.normal.name; part.normalTexCoord = 1; part.normalScale = o.normalScale ?? t.normalScale;
        part.metallicRoughnessTexture = t.orm.name; part.metallicRoughnessTexCoord = 1;
        if (t.occlusion > 0) { part.occlusionTexture = t.orm.name; part.occlusionTexCoord = 1; part.occlusionStrength = t.occlusion; }
        // The picture's G channel is roughness over the tile's roughest: the part's factor brings it back
        // (to the tile's own level, or round the level asked for).
        part.roughness = Math.min(1, o.roughness != null ? t.roughness * o.roughness / Math.max(0.05, t.mean) : t.roughness);
        if (t.sheen) part.sheen = Object.assign({ strength: t.sheen.strength, roughness: t.sheen.roughness }, o.sheenTexture ? { texture: o.sheenTexture } : {});
        for (const pic of [t.normal, t.orm]) {
            if (Array.isArray(textures)) { if (!textures.some(x => x.name === pic.name)) textures.push(pic); }
            else if (textures) textures[pic.name] = pic;
        }
        return part;
    }

    /** The tile's maps for another builder (armor plates): { normal, orm, span, roughness, metal }. */
    function maps(kind) {
        const t = tile(kind);
        return t ? { normal: t.normal, orm: t.orm, span: t.span, roughness: t.roughness, mean: t.mean, metal: t.metal, normalScale: t.normalScale } : null;
    }

    const api = { KINDS, GARMENT_CLOTH, kindFor, tile, maps, applyTo, boxUvs, pnoise, pcells };
    root.RRCharacterFabric = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
