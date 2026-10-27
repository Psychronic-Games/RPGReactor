/**
 * RRNatureTexture - the pictures Nature props are painted with, all made
 * here from seeded noise: tiling bark (furrowed, plated, papery, ringed,
 * fluted, weathered...) and rock (granite, sandstone, basalt, slate,
 * marble, volcanic glass) with their relief as normal maps; moss, snow
 * and sand for cover shells; and leaf pictures: sprigs of leaves of many
 * shapes, needle sprays, blossoms, palm and fern fronds, willow strands and
 * grass blades on a transparent ground, for alpha-cut cards.
 *
 * A picture is { name, width, height, data (RGBA bytes), repeat? }. Row 0
 * is uv v = 0. Leaf pictures keep their color under the transparent ground
 * (the mean leaf color) so cut edges never show a dark fringe.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Kit = need('RRNatureKit', './NatureKit.js');
    const { clamp, smooth, lerp } = Kit.vec;
    const C = hex => Kit.rgb(hex);
    const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

    /** A picture from `fn(u, v) -> { c: [r, g, b] 0..1, h: height 0..1, a? }`: albedo, and its normal map when `strength`. */
    function paint(name, size, fn, strength, opts = {}) {
        const W = size, H = opts.height || size, data = new Uint8Array(W * H * 4), height = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const s = fn((x + 0.5) / W, (y + 0.5) / H), o = (y * W + x) * 4;
            data[o] = clamp(Math.round(s.c[0] * 255), 0, 255); data[o + 1] = clamp(Math.round(s.c[1] * 255), 0, 255); data[o + 2] = clamp(Math.round(s.c[2] * 255), 0, 255);
            data[o + 3] = s.a === undefined ? 255 : clamp(Math.round(s.a * 255), 0, 255);
            height[y * W + x] = s.h || 0;
        }
        const out = { albedo: { name: name + '.png', width: W, height: H, data, repeat: true } };
        if (strength) out.normal = normalMap(name + '-normal.png', height, W, H, strength * W / 512);
        return out;
    }

    /** A tiling normal map from heights (0..1 over a tile), `strength` the slope scale. */
    function normalMap(name, h, W, H, strength) {
        const data = new Uint8Array(W * H * 4), at = (x, y) => h[((y + H) % H) * W + ((x + W) % W)];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
            const l = Math.hypot(dx, dy, 1), o = (y * W + x) * 4;
            data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); data[o + 3] = 255;
        }
        return { name, width: W, height: H, data, repeat: true };
    }

    // ── bark ───────────────────────────────────────────────────────────────
    /**
     * Tiling bark: `style` one of BARKS, `col` [dark, mid, light] hex. u runs
     * round the branch, v along it.
     */
    const BARKS = ['furrowed', 'plated', 'papery', 'smooth', 'ringed', 'cherry', 'weathered', 'fluted', 'shaggy', 'cactus', 'stalk', 'hide', 'membrane', 'crystal'];
    function bark(style, col, size, seed) {
        const N = Kit.noise(seed || 7), dark = C(col[0]), mid = C(col[1]), light = C(col[2]);
        const grain = (u, v) => N.fbm2(u, v, 16, 4, 3);
        const fn = {
            furrowed(u, v) {
                // Deep vertical furrows between corky ridges, the ridges broken into blocks across.
                const w = N.fbm2(u, v, 3, 2, 3) * 0.55, x = u * 6 + w + N.fbm2(u, v, 8, 2, 2) * 0.35;
                const ridge = Math.abs(Math.sin(Math.PI * x)), cell = N.cells(u, v, 6, 3, 0.8), crack = smooth(0.0, 0.10, cell.d2 - cell.d1);
                const h = Math.pow(ridge, 0.6) * (0.55 + 0.45 * crack) * (0.85 + 0.15 * grain(u, v));
                const c = mixc(dark, mid, smooth(0.15, 0.55, h));
                return { c: mixc(c, light, smooth(0.75, 1, h) * 0.55 * (0.6 + 0.4 * N.fbm2(u, v, 5, 2, 2))), h };
            },
            plated(u, v) {
                // Pine: broad flaking plates outlined by dark fissures, flakes lighter at their edges.
                const cell = N.cells(u, v, 5, 4, 0.95), f = cell.d2 - cell.d1, fis = smooth(0.02, 0.16, f);
                const flake = N.fbm2(u, v, 12, 12, 3), tone = (cell.id % 7) / 7;
                const h = fis * (0.7 + 0.3 * flake);
                const c = mixc(dark, mixc(mid, light, tone * 0.6 + 0.2 * flake), fis);
                return { c, h };
            },
            papery(u, v) {
                // Birch: white papery bark, dark horizontal lenticels, peeling rings and black scars.
                const band = N.fbm2(u, v, 2, 6, 2), lent = Math.abs(Math.sin(Math.PI * (v * 26 + N.fbm2(u, v, 3, 3, 2) * 1.8)));
                const dash = smooth(0.94, 0.99, lent) * smooth(0.1, 0.35, N.fbm2(u, v, 10, 1, 2) + 0.15);
                const scar = smooth(0.32, 0.45, N.fbm2(u + 0.3, v, 3, 3, 4));
                const peel = smooth(0.55, 0.75, Math.abs(Math.sin(Math.PI * (v * 9 + band))));
                const h = 0.6 - dash * 0.35 - scar * 0.25 + peel * 0.08 + 0.05 * grain(u, v);
                let c = mixc(light, mixc(light, mid, 0.5), 0.3 + 0.3 * band);
                c = mixc(c, dark, Math.max(dash * 0.9, scar * 0.95));
                return { c, h };
            },
            smooth(u, v) {
                // Beech-like: smooth grey, faint mottling and fine horizontal creases.
                const m = N.fbm2(u, v, 4, 4, 4), crease = smooth(0.92, 1, Math.abs(Math.sin(Math.PI * (v * 14 + m * 2)))) * smooth(0.0, 0.3, N.fbm2(u, v, 6, 2, 2) + 0.1);
                const h = 0.5 + 0.12 * m - crease * 0.2;
                return { c: mixc(mixc(mid, light, 0.5 + m * 0.6), dark, crease * 0.6), h };
            },
            ringed(u, v) {
                // Palm: stacked leaf-base rings with fibrous vertical grain and scarred bands.
                const ring = (v * 8 + N.fbm2(u, v, 4, 1, 2) * 0.15) % 1, lip = smooth(0.0, 0.12, ring) * (1 - smooth(0.75, 1, ring));
                const fib = Math.abs(Math.sin(Math.PI * (u * 48 + N.fbm2(u, v, 6, 8, 2))));
                const h = lip * 0.75 + fib * 0.12 + 0.13 * N.fbm2(u, v, 8, 8, 3);
                let c = mixc(dark, mid, lip);
                c = mixc(c, light, smooth(0.45, 0.75, ring) * 0.5 * (0.5 + 0.5 * fib));
                return { c, h };
            },
            cherry(u, v) {
                // Cherry: glossy red-brown with long horizontal lenticel dashes and peeling bands.
                const m = N.fbm2(u, v, 3, 6, 3), lent = Math.abs(Math.sin(Math.PI * (v * 34 + m * 1.5))), dash = smooth(0.9, 0.98, lent) * smooth(-0.05, 0.25, N.fbm2(u, v, 8, 2, 2));
                const band = smooth(0.4, 0.7, Math.abs(Math.sin(Math.PI * (v * 5 + m))));
                const h = 0.55 + 0.1 * m + dash * 0.25 - band * 0.06;
                return { c: mixc(mixc(mid, dark, band * 0.5), light, dash * 0.7), h };
            },
            weathered(u, v) {
                // Dead wood: silver-grey, long twisting fibres and dry checks.
                const twist = u * 10 + v * 2.5 + N.fbm2(u, v, 3, 2, 3) * 1.2, fib = Math.abs(Math.sin(Math.PI * twist));
                const check = 1 - smooth(0.0, 0.05, N.cells(u, v, 4, 2, 0.9).d2 - N.cells(u, v, 4, 2, 0.9).d1);
                const h = Math.pow(fib, 0.4) * 0.8 - check * 0.35 + 0.1 * grain(u, v);
                return { c: mixc(mixc(dark, mid, smooth(0.2, 0.8, h)), light, smooth(0.6, 1, h) * 0.6), h };
            },
            fluted(u, v) {
                // Baobab: smooth, swollen folds running up the trunk, pink-grey and mottled.
                const fold = Math.sin(Math.PI * 2 * (u * 5 + N.fbm2(u, v, 2, 2, 2) * 0.4)), m = N.fbm2(u, v, 6, 6, 4);
                const crease = smooth(0.85, 1, Math.abs(Math.sin(Math.PI * (v * 10 + m * 2)))) * 0.5;
                const h = 0.5 + 0.35 * fold + 0.08 * m - crease * 0.2;
                return { c: mixc(mixc(mixc(dark, mid, 0.6), mid, smooth(-0.6, 0.6, fold)), light, smooth(0.2, 0.6, m) * 0.4), h };
            },
            shaggy(u, v) {
                // Fibrous strips peeling down (eucalyptus, tree fern, giant fungus): long strands.
                const strip = Math.abs(Math.sin(Math.PI * (u * 14 + N.fbm2(u, v, 4, 1, 3) * 2))), tear = N.fbm2(u, v, 6, 3, 3);
                const h = Math.pow(strip, 0.5) * (0.6 + 0.4 * tear);
                return { c: mixc(mixc(dark, mid, h), light, smooth(0.3, 0.7, tear) * 0.5 * h), h };
            },
            cactus(u, v) {
                // A rib per tile: the crest at the middle carries areoles with white spines; grooves darker.
                const x = Math.abs(u - 0.5) * 2, crest = 1 - x * x, ar = (v * 7) % 1, dot = Math.hypot((u - 0.5) * 3.2, (ar - 0.5) * 1.0);
                const spine = smooth(0.32, 0.18, dot), hairs = Math.max(0, 1 - Math.abs((u - 0.5) * 3.2 - (ar - 0.5) * 2.2 * Math.sign(u - 0.5)) * 18) * smooth(0.45, 0.1, dot);
                const m = N.fbm2(u, v, 2, 8, 3);
                const h = crest * 0.8 + spine * 0.3 + 0.05 * m;
                let c = mixc(dark, mid, crest * (0.8 + 0.2 * m));
                c = mixc(c, light, Math.max(spine * 0.9, hairs * 0.8));
                return { c, h };
            },
            stalk(u, v) {
                // Fleshy stalk: soft vertical striations, pale flecks.
                const s = Math.abs(Math.sin(Math.PI * (u * 20 + N.fbm2(u, v, 3, 2, 2)))), m = N.fbm2(u, v, 5, 10, 3), fleck = smooth(0.45, 0.6, N.fbm2(u + 0.7, v, 12, 24, 2));
                const h = 0.5 + 0.2 * s + 0.1 * m;
                return { c: mixc(mixc(dark, mid, 0.4 + 0.6 * s), light, fleck * 0.7), h };
            },
            hide(u, v) {
                // Alien hide: overlapping scales in staggered rows, edged darker.
                const cell = N.cells(u, v, 10, 14, 0.5), edge = smooth(0.0, 0.25, cell.d2 - cell.d1), m = N.fbm2(u, v, 3, 3, 3);
                const h = edge * (0.7 + 0.3 * (1 - cell.d1));
                return { c: mixc(dark, mixc(mid, light, smooth(0, 0.8, m + 0.4) * (1 - cell.d1)), edge), h };
            },
            membrane(u, v) {
                // A taut skin of cells: raised pale rims, mottled insides, fine veins running between.
                const cell = N.cells(u, v, 12, 8, 0.85), rim = smooth(0.12, 0.0, cell.d2 - cell.d1), m = N.fbm2(u, v, 6, 6, 3), vein = smooth(0.94, 1, Math.abs(Math.sin(Math.PI * (u * 5 + N.fbm2(u, v, 3, 3, 3) * 2.2))));
                const h = 0.45 + rim * 0.35 - 0.12 * cell.d1 + 0.06 * m;
                return { c: mixc(mixc(mixc(dark, mid, 0.55 + 0.35 * m), light, rim * 0.7), light, vein * 0.4), h };
            },
            crystal(u, v) {
                // Crystal: inner growth bands and fracture planes, little relief.
                const band = Math.abs(Math.sin(Math.PI * (v * 6 + N.fbm2(u, v, 2, 2, 2) * 0.8))), cell = N.cells(u, v, 3, 3, 0.9);
                const f = smooth(0.0, 0.06, cell.d2 - cell.d1);
                const h = 0.5 + 0.1 * f;
                return { c: mixc(mixc(dark, mid, 0.5 + 0.5 * band), light, (1 - f) * 0.6 + smooth(0.85, 1, band) * 0.3), h };
            }
        }[style] || null;
        const draw = fn || ((u, v) => ({ c: mid, h: 0.5 }));
        const strength = { furrowed: 7, plated: 6, papery: 2.5, smooth: 2.5, ringed: 5, cherry: 3, weathered: 6, fluted: 4, shaggy: 5, cactus: 4, stalk: 2.5, hide: 4, membrane: 3.5, crystal: 1.5 }[style] || 3;
        return paint('nature-bark-' + style, size, draw, strength);
    }

    // ── rock ───────────────────────────────────────────────────────────────
    /** Tiling rock: `style` one of ROCKS, `col` [dark, mid, light, accent] hex, `lichen` 0..1 speckle. */
    const ROCKS = ['granite', 'sandstone', 'basalt', 'slate', 'marble', 'volcanic', 'alien'];
    function rock(style, col, size, seed, lichen) {
        const N = Kit.noise(seed || 11), dark = C(col[0]), mid = C(col[1]), light = C(col[2]), accent = C(col[3] || col[2]);
        const lich = lichen || 0, L1 = C('#c8b34a'), L2 = C('#9fb08a'), L3 = C('#e0dccf');
        const fn = {
            granite(u, v) {
                const m = N.fbm2(u, v, 4, 4, 5), sp = N.fbm2(u, v, 48, 48, 2), sp2 = N.fbm2(u + 0.5, v, 32, 32, 1);
                const h = 0.5 + 0.35 * m + 0.08 * sp;
                const m2 = N.fbm2(u, v, 12, 12, 3);
                let c = mixc(mixc(dark, mid, smooth(-0.6, 0.5, m + m2 * 0.3)), light, smooth(0.3, 0.55, sp) * 0.35);
                c = mixc(c, mul(dark, 0.75), smooth(0.35, 0.55, sp2) * 0.3);
                return { c, h };
            },
            sandstone(u, v) {
                // Beds of uneven thickness (the bed coordinate warped by slow noise), each its own tone, recessed where they meet;
                // faint cross-bedded laminae inside, weathering streaks running down, the color held back from cartoon saturation.
                const warp = N.fbm2(0.37, v, 1, 3, 3) * 1.7 + N.fbm2(u, v, 2, 2, 3) * 0.4, pos = v * 6 + warp, bed = Math.floor(pos), f = pos - bed;
                const k = (((bed % 6) + 6) % 6), tone = [0.15, 0.7, 0.4, 0.9, 0.25, 0.6][k], tone2 = [0.8, 0.1, 0.55, 0.3, 0.95, 0.45][k];
                const seam = 1 - smooth(0, 0.07, f) * (1 - smooth(0.93, 1, f));
                const lam = Math.abs(Math.sin(Math.PI * (f * 6 + u * 2.4 * (k % 2 ? 1 : -1) + N.fbm2(u, v, 3, 3, 2) * 0.7)));
                const grain = N.fbm2(u, v, 32, 32, 2), streak = smooth(0.05, 0.5, N.fbm2(u, v, 14, 1, 3)) * smooth(-0.2, 0.4, N.fbm2(u, v, 4, 3, 2));
                let c = mixc(mid, light, tone * 0.75);
                c = mixc(c, accent, smooth(0.6, 1, tone2) * 0.3);
                c = mixc(c, dark, seam * 0.55 + smooth(0.85, 1, lam) * 0.1 + streak * 0.18);
                c = mul(c, 0.94 + 0.12 * grain);
                const lum = (c[0] + c[1] + c[2]) / 3;
                c = mixc(c, [lum, lum, lum], 0.28);
                return { c, h: 0.55 - seam * 0.35 + 0.05 * lam + 0.08 * grain - streak * 0.05 };
            },
            basalt(u, v) {
                const m = N.fbm2(u, v, 5, 5, 4), ves = N.cells(u, v, 22, 22, 0.9), pit = smooth(0.22, 0.12, ves.d1) * smooth(0.0, 0.4, N.fbm2(u, v, 4, 4, 2) + 0.2);
                const h = 0.55 + 0.25 * m - pit * 0.45;
                return { c: mixc(mixc(dark, mid, smooth(-0.6, 0.6, m)), mul(dark, 0.5), pit), h };
            },
            slate(u, v) {
                const layer = v * 22 + N.fbm2(u, v, 2, 3, 3) * 2, l = Math.abs(Math.sin(Math.PI * layer)), m = N.fbm2(u, v, 6, 3, 3);
                const h = 0.5 + 0.3 * Math.pow(l, 3) + 0.15 * m;
                return { c: mixc(mixc(dark, mid, smooth(0.0, 1, l * 0.6 + m * 0.4 + 0.2)), accent, smooth(0.4, 0.6, N.fbm2(u, v, 3, 3, 2)) * 0.25), h };
            },
            marble(u, v) {
                const w = N.fbm2(u, v, 3, 3, 5), vein = Math.abs(Math.sin(Math.PI * (u * 2 + v * 3 + w * 3))), thin = smooth(0.96, 1, vein);
                const h = 0.5 + 0.08 * w - thin * 0.1;
                return { c: mixc(mixc(light, mid, smooth(-0.4, 0.6, w) * 0.6), dark, thin * 0.8), h };
            },
            volcanic(u, v) {
                const cell = N.cells(u, v, 8, 8, 0.9), crack = 1 - smooth(0.0, 0.05, cell.d2 - cell.d1), m = N.fbm2(u, v, 6, 6, 4);
                const h = 0.6 + 0.2 * m - crack * 0.4;
                return { c: mixc(mixc(dark, mid, smooth(-0.4, 0.8, m)), accent, crack * 0.85), h };
            },
            alien(u, v) {
                const cell = N.cells(u, v, 6, 6, 0.8), m = N.fbm2(u, v, 5, 5, 4), ring = Math.abs(Math.sin(Math.PI * cell.d1 * 6));
                const h = 0.5 + 0.25 * m + 0.15 * ring * (1 - cell.d1);
                return { c: mixc(mixc(dark, mid, smooth(-0.4, 0.7, m)), accent, smooth(0.8, 1, ring) * 0.5 * (1 - cell.d1)), h };
            }
        }[style] || (() => ({ c: mid, h: 0.5 }));
        const draw = (u, v) => {
            const s = fn(u, v);
            if (lich > 0) {
                // Lichen: crusted rosettes in three colors, raised a touch.
                const sp = N.cells(u + 0.13, v + 0.71, 14, 14, 0.9), patch = smooth(0.35 - 0.25 * lich, 0.1, sp.d1) * smooth(0.55 - lich * 0.5, 0.75 - lich * 0.5, 0.5 + 0.5 * N.fbm2(u, v, 3, 3, 3));
                if (patch > 0) { const lc = [L1, L2, L3][sp.id % 3]; s.c = mixc(s.c, mixc(lc, mul(lc, 0.75), N.fbm2(u, v, 40, 40, 1) * 0.5 + 0.5), patch * 0.9); s.h += patch * 0.05; }
            }
            return s;
        };
        const strength = { granite: 4, sandstone: 5, basalt: 5, slate: 6, marble: 2, volcanic: 6, alien: 4 }[style] || 4;
        return paint('nature-rock-' + style, size, draw, strength);
    }

    // ── covers ─────────────────────────────────────────────────────────────
    /** Moss, snow or sand for a cover shell: soft-edged holes in the alpha so its edge breaks up. */
    function coverPicture(kind, size, seed, tint) {
        const N = Kit.noise((seed || 3) + 101);
        const col = { moss: ['#2d4a1a', '#5d8a2c', '#a6c25a'], snow: ['#b9c8dc', '#e9eff7', '#ffffff'], sand: ['#9a7a4c', '#c8a66e', '#e6cf9c'], ash: ['#3a3634', '#5c5652', '#8a837c'], glow: ['#1a2a3a', '#2a6a8a', '#7ae0ff'] }[kind] || ['#444', '#888', '#ccc'];
        const [d, m, l] = (tint || col).map(C);
        return paint('nature-cover-' + kind, size, (u, v) => {
            const f = N.fbm2(u, v, 6, 6, 4), fine = N.fbm2(u, v, 40, 40, 2), holes = N.fbm2(u + 0.3, v + 0.6, 5, 5, 3);
            if (kind === 'moss') {
                const tuft = N.cells(u, v, 40, 40, 0.9), bump = 1 - tuft.d1;
                return { c: mixc(mixc(d, m, smooth(-0.3, 0.5, f) * 0.7 + bump * 0.3), l, smooth(0.6, 0.95, bump) * 0.4 + smooth(0.3, 0.6, fine) * 0.2), h: 0.4 * bump + 0.3 * f, a: smooth(-0.32, -0.18, holes) };
            }
            if (kind === 'snow') return { c: mixc(mixc(d, m, smooth(-0.6, 0.3, f)), l, smooth(0.5, 0.7, fine) * 0.6), h: 0.5 + 0.2 * f + 0.05 * fine, a: smooth(-0.45, -0.3, holes) };
            const ripple = Math.sin(Math.PI * 2 * (v * 9 + f * 1.5));
            return { c: mixc(mixc(d, m, 0.5 + 0.5 * ripple * 0.6 + 0.2 * f), l, smooth(0.3, 0.6, fine) * 0.4), h: 0.5 + 0.2 * ripple + 0.1 * fine, a: smooth(-0.4, -0.25, holes) };
        }, kind === 'moss' ? 5 : 2);
    }

    // ── leaves ─────────────────────────────────────────────────────────────
    /**
     * Leaf outlines: half-width at t (0 foot, 1 tip) as a share of the leaf's
     * width, before any edge teeth.
     */
    const OUTLINES = {
        ovate: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85),
        oak: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8) * (0.62 + 0.38 * Math.abs(Math.cos(Math.PI * (t * 3.6 + 0.3)))),
        lance: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.6)), 1.3),
        round: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.6),
        heart: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 1.15)), 0.7) * (t < 0.12 ? 0.6 + t * 3.3 : 1),
        needle: () => 1,
        petal: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.65)), 0.55),
        blade: t => Math.pow(1 - t, 0.7) * smooth(0, 0.05, t),
        paddle: t => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.5)), 0.45)
    };

    /** A float RGBA canvas of `w` x `h` pixels with `over(x, y, color, alpha)` compositing. */
    function canvas(w, h) {
        const px = new Float32Array(w * h * 4);
        return {
            w, h, px,
            over(x, y, c, a) {
                if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
                const o = (y * w + x) * 4, A = px[o + 3], out = a + A * (1 - a);
                if (out <= 0) return;
                for (let k = 0; k < 3; k++) px[o + k] = (c[k] * a + px[o + k] * A * (1 - a)) / out;
                px[o + 3] = out;
            }
        };
    }

    /**
     * One leaf on `cv`: foot at (x, y) px, pointing at `angle` (0 = +y, up the
     * picture), `L` long and `Wd` wide (px). Midrib and side veins lighter,
     * margin darker, a sheen toward the tip; `teeth` serrates the edge.
     */
    function leaf(cv, x, y, angle, L, Wd, shape, color, o = {}) {
        const ca = Math.cos(angle), sa = Math.sin(angle), out = OUTLINES[shape] || OUTLINES.ovate, R = Math.max(L, Wd) + 2;
        const x0 = Math.floor(x - R), x1 = Math.ceil(x + R), y0 = Math.floor(y - R), y1 = Math.ceil(y + R);
        const vein = mixc(color, [1, 1, 0.85], 0.28), edge = mul(color, 0.62), curl = o.curl || 0, teeth = o.teeth || 0;
        for (let py = Math.max(0, y0); py <= Math.min(cv.h - 1, y1); py++) for (let px = Math.max(0, x0); px <= Math.min(cv.w - 1, x1); px++) {
            const dx = px + 0.5 - x, dy = py + 0.5 - y;
            const s = dx * sa + dy * ca, q0 = dx * ca - dy * sa, t = s / L;
            if (t < -0.02 || t > 1.02) continue;
            const q = q0 - curl * L * t * t;
            let hw = out(clamp(t, 0, 1)) * Wd / 2;
            if (teeth) hw *= 1 - 0.09 * Math.abs(Math.sin(t * Math.PI * teeth));
            const d = Math.abs(q) - hw, a = clamp(0.5 - d, 0, 1) * (t < 0 ? 0 : 1) * clamp((1.02 - t) * 40, 0, 1);
            if (a <= 0) continue;
            const across = hw > 0 ? Math.min(1, Math.abs(q) / hw) : 1;
            let c = mixc(color, mul(color, 1.18), 0.5 + 0.5 * Math.sin(t * Math.PI));
            if (o.side) c = mixc(c, mul(c, 0.7), clamp(Math.sign(q) * o.side, 0, 1) * 0.5);
            c = mixc(c, edge, Math.pow(across, 4) * 0.7);
            if (shape !== 'needle' && shape !== 'blade') {
                const mid = clamp(1.4 - Math.abs(q) / Math.max(0.6, Wd * 0.018), 0, 1) * (t < 0.95 ? 1 : 0);
                const lateral = Math.abs(((s - Math.abs(q) * 0.75) / (L * 0.09)) % 1 - 0.5);
                const side = clamp(1 - lateral * 9, 0, 1) * (1 - across) * 0.55 * (Wd > 10 ? 1 : 0);
                c = mixc(c, vein, Math.max(mid * 0.7, side));
            }
            cv.over(px, py, c, a);
        }
    }

    /** A stem from (x0, y0) to (x1, y1), bending by `bow` px, `w0`..`w1` thick. */
    function stem(cv, x0, y0, x1, y1, w0, w1, color, bow) {
        const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5), nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
        for (let i = 0; i <= n; i++) {
            const t = i / n, b = (bow || 0) * Math.sin(Math.PI * t), cx = lerp(x0, x1, t) + nx / nl * b, cy = lerp(y0, y1, t) + ny / nl * b, r = lerp(w0, w1, t) / 2;
            for (let py = Math.floor(cy - r - 1); py <= cy + r + 1; py++) for (let px = Math.floor(cx - r - 1); px <= cx + r + 1; px++) {
                const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - r, a = clamp(0.5 - d, 0, 1);
                if (a > 0) cv.over(px, py, mixc(color, mul(color, 0.7), clamp((px + 0.5 - cx) / (r + 0.5), 0, 1)), a);
            }
        }
        return (t) => [lerp(x0, x1, t) + nx / nl * (bow || 0) * Math.sin(Math.PI * t), lerp(y0, y1, t) + ny / nl * (bow || 0) * Math.sin(Math.PI * t)];
    }

    /** A five-petal (or `petals`) flower at (x, y), `r` px. */
    function flower(cv, x, y, r, petal, center, R, petals = 5) {
        const turn = R.next() * Math.PI * 2;
        for (let k = 0; k < petals; k++) {
            const a = turn + k * Math.PI * 2 / petals;
            leaf(cv, x, y, a, r, r * 0.95, 'petal', mixc(petal, mul(petal, 0.85), R.next() * 0.5), {});
        }
        for (let py = Math.floor(y - r * 0.3); py <= y + r * 0.3; py++) for (let px = Math.floor(x - r * 0.3); px <= x + r * 0.3; px++) {
            const d = Math.hypot(px + 0.5 - x, py + 0.5 - y), a = clamp(r * 0.24 - d, 0, 1);
            if (a > 0) cv.over(px, py, mixc(center, mul(center, 0.6), d / (r * 0.24)), a);
        }
    }

    /** Leaf colors for a cell: a pick per leaf among `palette` (hex), each moved a little. */
    const pickColor = (R, palette, vary) => { const c = C(palette[Math.floor(R.next() * palette.length)]); return Kit.shift(c, (R.next() - 0.5) * 0.03 * vary, (R.next() - 0.5) * 0.2 * vary, (R.next() - 0.5) * 0.12 * vary); };

    /**
     * The painters for a cell (each gets the canvas, its spec, a roll): what
     * a card shows. A spec: { type, shape, palette, stem, count, flowers, ... }.
     */
    const PAINTERS = {
        /** A twig with leaves alternating up it and a leaf at its tip. */
        sprig(cv, s, R) {
            const W = cv.w, H = cv.h, n = s.count || 9, len = s.len || 0.34, wid = s.wid || 0.5;
            const tip = [W * (0.5 + (R.next() - 0.5) * 0.12), H * 0.82], bow = (R.next() - 0.5) * W * 0.08;
            const at = stem(cv, W / 2, 0, tip[0], tip[1], W * 0.028, W * 0.01, C(s.stem || '#4a3a26'), bow);
            const leaves = [];
            for (let i = 0; i < n; i++) {
                const t = 0.18 + 0.82 * (i / (n - 1)), side = i % 2 ? 1 : -1, [x, y] = at(Math.min(1, t));
                const size = (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1))) * (0.85 + R.next() * 0.3), last = i === n - 1;
                const a = last ? (R.next() - 0.5) * 0.3 : side * (0.65 + R.next() * 0.5) - 0.1 * side;
                leaves.push([x, y, a, H * len * size, H * len * wid * size, last]);
            }
            // Back leaves first, so the tip leaf lies on top.
            leaves.sort((a, b) => b[1] - a[1]).reverse();
            for (const [x, y, a, L, Wd] of leaves) {
                const petiole = L * (s.petiole ?? 0.12), px = x + Math.sin(a) * petiole, py = y + Math.cos(a) * petiole;
                stem(cv, x, y, px, py, W * 0.009, W * 0.006, C(s.stem || '#4a3a26'), 0);
                leaf(cv, px, py, a, L, Wd, s.shape || 'ovate', pickColor(R, s.palette, s.vary ?? 1), { teeth: s.teeth, side: (R.next() - 0.5) * 0.8, curl: (R.next() - 0.5) * 0.1 });
            }
            if (s.flowers) for (let i = 0; i < s.flowers; i++) { const [x, y] = at(0.3 + R.next() * 0.7); flower(cv, x + (R.next() - 0.5) * W * 0.3, y + (R.next() - 0.5) * H * 0.2, W * 0.07 * (0.8 + R.next() * 0.4), pickColor(R, s.petals, 1), C(s.center || '#f0d040'), R); }
            if (s.berries) for (let i = 0; i < s.berries; i++) { const [x, y] = at(0.3 + R.next() * 0.65); dotBall(cv, x + (R.next() - 0.5) * W * 0.25, y + (R.next() - 0.5) * H * 0.1, W * 0.032, pickColor(R, s.berryColors, 0.5)); }
        },
        /** Many leaves bunched round a twig's end (oak, maple, broad canopies). */
        cluster(cv, s, R) {
            // A twig forking into three or four shoots, leaves bunched round each: the cell filled to its edges.
            const W = cv.w, H = cv.h, n = s.count || 14, col = C(s.stem || '#4a3a26');
            const main = stem(cv, W / 2, 0, W * (0.5 + (R.next() - 0.5) * 0.1), H * 0.42, W * 0.03, W * 0.016, col, (R.next() - 0.5) * W * 0.05);
            const shoots = [main];
            for (const dx of [-0.3, 0.3, (R.next() - 0.5) * 0.15]) {
                const [x0, y0] = main(0.45 + R.next() * 0.4);
                shoots.push(stem(cv, x0, y0, W * (0.5 + dx + (R.next() - 0.5) * 0.08), H * (0.62 + R.next() * 0.12), W * 0.016, W * 0.008, col, (R.next() - 0.5) * W * 0.06));
            }
            const leaves = [];
            for (let i = 0; i < n; i++) {
                const sh = shoots[i % shoots.length], t = 0.3 + 0.7 * R.next(), [x, y] = sh(t), a = (R.next() - 0.5) * 3.6, size = 0.7 + 0.4 * R.next();
                leaves.push([x, y, a, H * (s.len || 0.3) * size, H * (s.len || 0.3) * (s.wid || 0.55) * size]);
            }
            leaves.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
            for (const [x, y, a, L, Wd] of leaves) {
                const pl = L * (s.petiole ?? 0.15), px = x + Math.sin(a) * pl, py = y + Math.cos(a) * pl;
                stem(cv, x, y, px, py, W * 0.01, W * 0.006, col, 0);
                if (s.shape === 'palmate') palmate(cv, px, py, a, L, pickColor(R, s.palette, s.vary ?? 1), s.lobes || 5);
                else leaf(cv, px, py, a, L, Wd, s.shape || 'ovate', pickColor(R, s.palette, s.vary ?? 1), { teeth: s.teeth, side: (R.next() - 0.5), curl: (R.next() - 0.5) * 0.12 });
            }
            if (s.flowers) for (let i = 0; i < s.flowers; i++) flower(cv, W * (0.2 + R.next() * 0.6), H * (0.3 + R.next() * 0.6), W * 0.08 * (0.8 + R.next() * 0.4), pickColor(R, s.petals, 1), C(s.center || '#f0d040'), R);
        },
        /** Blossom: a bare twig crowded with flowers, a few young leaves. */
        blossom(cv, s, R) {
            const W = cv.w, H = cv.h;
            const at = stem(cv, W / 2, 0, W * (0.5 + (R.next() - 0.5) * 0.2), H * 0.85, W * 0.03, W * 0.012, C(s.stem || '#3a2620'), (R.next() - 0.5) * W * 0.1);
            for (let i = 0; i < 4; i++) { const t = 0.3 + R.next() * 0.6, [x, y] = at(t), side = i % 2 ? 1 : -1; stem(cv, x, y, x + side * W * 0.3, y + H * 0.18, W * 0.016, W * 0.008, C(s.stem || '#3a2620'), 0); }
            if (s.leaves) for (let i = 0; i < s.leaves; i++) { const [x, y] = at(0.2 + R.next() * 0.8); leaf(cv, x, y, (R.next() - 0.5) * 2.4, H * 0.18, W * 0.1, 'ovate', pickColor(R, s.palette, 1), {}); }
            const n = s.count || 22;
            for (let i = 0; i < n; i++) {
                const t = 0.15 + R.next() * 0.85, [x, y] = at(t), rr = W * (s.size || 0.085) * (0.75 + R.next() * 0.5);
                flower(cv, clamp(x + (R.next() - 0.5) * W * 0.75, rr, W - rr), clamp(y + (R.next() - 0.5) * H * 0.3, rr, H - rr), rr, pickColor(R, s.petals, 1), C(s.center || '#e8c050'), R, s.petalCount || 5);
            }
        },
        /** A flat spray of needles on side branchlets (fir, spruce). */
        spray(cv, s, R) {
            const W = cv.w, H = cv.h, col = C(s.stem || '#5a4430');
            const at = stem(cv, W / 2, 0, W / 2 + (R.next() - 0.5) * W * 0.06, H * 0.95, W * 0.022, W * 0.008, col, (R.next() - 0.5) * W * 0.04);
            const twigs = [[0.5, 0, 1]];
            const branch = s.branches || 7;
            for (let i = 0; i < branch; i++) { const t = 0.12 + 0.8 * i / branch, side = i % 2 ? 1 : -1; twigs.push([t, side, 1 - t * 0.55]); }
            for (const [t, side, k] of twigs) {
                let x0, y0, x1, y1;
                if (!side) { x0 = W / 2; y0 = 0; [x1, y1] = at(1); } else { [x0, y0] = at(t); x1 = x0 + side * W * 0.42 * k; y1 = y0 + H * 0.22 * k; stem(cv, x0, y0, x1, y1, W * 0.012, W * 0.006, col, 0); }
                const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / (W * 0.012));
                for (let j = 0; j < n; j++) {
                    const u = j / n, x = lerp(x0, x1, u), y = lerp(y0, y1, u), dir = Math.atan2(x1 - x0, y1 - y0);
                    for (const sd of [-1, 1]) leaf(cv, x, y, dir + sd * (s.splay || 0.9) + (R.next() - 0.5) * 0.3, W * (s.needle || 0.075) * (0.8 + 0.3 * (1 - u)), Math.max(1.6, W * 0.012), 'needle', pickColor(R, s.palette, s.vary ?? 0.6), {});
                }
            }
        },
        /** Brush-like tufts of long needles at twig tips (pine). */
        tuft(cv, s, R) {
            const W = cv.w, H = cv.h, col = C(s.stem || '#6a4a30');
            for (let k = 0; k < (s.tufts || 3); k++) {
                const bx = W * (0.3 + 0.4 * (k / Math.max(1, (s.tufts || 3) - 1))), top = [bx + (R.next() - 0.5) * W * 0.1, H * (0.5 + R.next() * 0.25)];
                stem(cv, W / 2, 0, top[0], top[1], W * 0.035, W * 0.022, col, (R.next() - 0.5) * W * 0.04);
                for (let i = 0; i < (s.count || 60); i++) {
                    const a = (R.next() - 0.5) * 2.6, t = R.next() * 0.4, x = lerp(W / 2, top[0], 0.6 + t), y = lerp(0, top[1], 0.6 + t);
                    leaf(cv, x, y, a * (0.5 + t), H * (s.needle || 0.38) * (0.7 + R.next() * 0.4), Math.max(1.8, W * 0.011), 'needle', pickColor(R, s.palette, 0.7), {});
                }
            }
        },
        /** Overlapping scale-leaf fans (cypress, cedar). */
        scale(cv, s, R) {
            const W = cv.w, H = cv.h, col = C(s.stem || '#5a4430');
            const grow = (x, y, a, L, depth) => {
                const x1 = x + Math.sin(a) * L, y1 = y + Math.cos(a) * L, n = Math.ceil(L / (W * 0.018));
                for (let j = 0; j <= n; j++) { const u = j / n; dotBall(cv, lerp(x, x1, u), lerp(y, y1, u), W * 0.016 * (1 - u * 0.5) * (1 + depth * 0.3), pickColor(R, s.palette, 0.7)); }
                if (depth > 0) for (let k = 1; k <= 3; k++) { const u = k / 4; grow(lerp(x, x1, u), lerp(y, y1, u), a + (k % 2 ? 0.7 : -0.7), L * 0.48, depth - 1); }
            };
            stem(cv, W / 2, 0, W / 2, H * 0.1, W * 0.02, W * 0.014, col, 0);
            grow(W / 2, H * 0.08, (R.next() - 0.5) * 0.2, H * 0.8, 2);
        },
        /** A long frond, leaflets both sides of a midrib (palm, fern); `bipinnate` divides each leaflet again. */
        frond(cv, s, R) {
            const W = cv.w, H = cv.h, col = C(s.stem || '#6a6a30'), n = s.count || 34;
            stem(cv, W / 2, 0, W / 2, H * 0.99, W * 0.05, W * 0.012, col, 0);
            for (let i = 0; i < n; i++) {
                const t = 0.04 + 0.95 * i / n, y = t * H, k = Math.sin(Math.PI * Math.pow(t, s.peak || 0.7)), L = W * 0.5 * (s.reach || 0.95) * (0.25 + 0.75 * k);
                for (const side of [-1, 1]) {
                    if (s.ragged && R.next() < s.ragged) continue;
                    const a = side * (s.angle || 1.0) * (0.85 + R.next() * 0.2) * (1 - t * 0.25), c = pickColor(R, s.palette, 0.8);
                    if (s.bipinnate) {
                        const n2 = 7, x1 = W / 2 + Math.sin(a) * L, y1 = y + Math.cos(a) * L;
                        stem(cv, W / 2, y, x1, y1, W * 0.012, W * 0.005, c, 0);
                        for (let j = 0; j < n2; j++) { const u = (j + 0.5) / n2, x = lerp(W / 2, x1, u), yy = lerp(y, y1, u); for (const sd of [-1, 1]) leaf(cv, x, yy, a + sd * 1.1, L * 0.2 * (1 - u * 0.6), L * 0.09, 'ovate', c, {}); }
                    } else leaf(cv, W / 2, y, a, L, Math.max(2.5, W * (s.leaflet || 0.07)), s.shape || 'lance', c, { side: side * 0.6 });
                }
            }
        },
        /** A palmate fan on a stalk (fan palm, ginkgo-like). */
        fan(cv, s, R) {
            const W = cv.w, H = cv.h, cx = W / 2, cy = H * 0.07, n = s.count || 34, rr = Math.min(H * 0.9, W * 0.5 / Math.sin(1.0));
            stem(cv, cx, 0, cx, cy, W * 0.04, W * 0.03, C(s.stem || '#6a6a30'), 0);
            for (let i = 0; i < n; i++) {
                const a = -1.0 + 2.0 * (i + 0.5) / n + (R.next() - 0.5) * 0.04;
                leaf(cv, cx, cy, a, rr * (0.9 + R.next() * 0.12), rr * 0.13, 'lance', pickColor(R, s.palette, 0.6), { side: 0.6 });
            }
        },
        /** A hanging strand: a thin stem with long narrow leaves all along it (willow). */
        strand(cv, s, R) {
            const W = cv.w, H = cv.h;
            for (let k = 0; k < (s.strands || 2); k++) {
                const x0 = W * (0.35 + 0.3 * k / Math.max(1, (s.strands || 2) - 1)), at = stem(cv, x0, 0, x0 + (R.next() - 0.5) * W * 0.2, H, W * 0.02, W * 0.008, C(s.stem || '#6a7a3a'), (R.next() - 0.5) * W * 0.1);
                const n = s.count || 26;
                for (let i = 0; i < n; i++) {
                    const t = 0.02 + 0.96 * i / n, [x, y] = at(t), side = i % 2 ? 1 : -1;
                    leaf(cv, x, y, side * (0.25 + R.next() * 0.35), H * (s.len || 0.075), W * (s.wid || 0.09), s.shape || 'lance', pickColor(R, s.palette, s.vary ?? 1), { side: side * 0.5 });
                }
            }
        },
        /** Grass blades from a tuft (or reeds, pampas plumes). */
        blades(cv, s, R) {
            const W = cv.w, H = cv.h, n = s.count || 26;
            for (let i = 0; i < n; i++) {
                const x = W * (0.5 + (R.next() - 0.5) * 0.35), lean = (R.next() - 0.5) * 0.5, L = H * (0.55 + R.next() * 0.43);
                leaf(cv, x, 0, lean, L, W * (s.wid || 0.05) * (0.7 + R.next() * 0.6), 'blade', pickColor(R, s.palette, 1), { curl: (R.next() - 0.5) * 0.25, side: (R.next() - 0.5) });
            }
            if (s.plumes) for (let i = 0; i < s.plumes; i++) {
                const x = W * (0.5 + (R.next() - 0.5) * 0.3), top = H * (0.92 + R.next() * 0.06), lean = (R.next() - 0.5) * 0.3;
                stem(cv, x, 0, x + Math.sin(lean) * top * 0.6, top * 0.62, W * 0.012, W * 0.008, C(s.plumeStem || '#a09060'), 0);
                const bx = x + Math.sin(lean) * top * 0.6, by = top * 0.62;
                for (let j = 0; j < 90; j++) { const t = R.next(); leaf(cv, bx + Math.sin(lean) * t * H * 0.3, by + t * H * 0.3, lean + (R.next() - 0.5) * 1.2, H * 0.06, W * 0.02, 'lance', pickColor(R, s.plumeColors, 0.6), {}); }
            }
        },
        /** One leaf or petal filling the cell, its foot at the bottom. */
        single(cv, s, R) {
            leaf(cv, cv.w / 2, 0, 0, cv.h * 0.98, cv.w * (s.wid || 0.9), s.shape || 'petal', pickColor(R, s.palette, s.vary ?? 0.4), { teeth: s.teeth, side: s.side || 0 });
        },
        /** Flower spikes: a stem crowded at its top with small florets (lavender, lupins). */
        spike(cv, s, R) {
            const W = cv.w, H = cv.h;
            for (let k = 0; k < (s.spikes || 3); k++) {
                const x0 = W * (0.3 + 0.4 * k / Math.max(1, (s.spikes || 3) - 1)), lean = (R.next() - 0.5) * 0.2, top = [x0 + Math.sin(lean) * H * 0.9, H * 0.97];
                stem(cv, x0, 0, top[0], top[1], W * 0.02, W * 0.012, C(s.stem || '#5a7a4a'), 0);
                for (let i = 0; i < (s.count || 40); i++) {
                    const t = 1 - Math.pow(R.next(), 1.4) * (s.reach || 0.4), x = lerp(x0, top[0], t) + (R.next() - 0.5) * W * 0.06 * (1.2 - t * 0.6), y = lerp(0, top[1], t);
                    dotBall(cv, x, y, W * (s.size || 0.026) * (0.7 + R.next() * 0.5), pickColor(R, s.palette, 0.6));
                }
            }
        },
        /** Dead leaves scattered (litter), for a bare tree's last few leaves. */
        litter(cv, s, R) {
            for (let i = 0; i < (s.count || 18); i++) leaf(cv, cv.w * (0.1 + R.next() * 0.8), cv.h * (0.05 + R.next() * 0.7), R.next() * 6.3, cv.h * 0.22, cv.w * 0.16, s.shape || 'ovate', pickColor(R, s.palette, 1), {});
        }
    };
    /** A palmate leaf (maple): five pointed lobes from one point. */
    function palmate(cv, x, y, a, L, color, lobes) {
        for (let k = 0; k < lobes; k++) {
            const off = (k - (lobes - 1) / 2) * (2.5 / lobes), size = 1 - Math.abs(off) * 0.32;
            leaf(cv, x, y, a + off, L * size, L * 0.42 * size, 'oak', color, { teeth: 9 });
        }
    }
    function dotBall(cv, x, y, r, color) {
        for (let py = Math.floor(y - r - 1); py <= y + r + 1; py++) for (let px = Math.floor(x - r - 1); px <= x + r + 1; px++) {
            const dx = px + 0.5 - x, dy = py + 0.5 - y, d = Math.hypot(dx, dy), a = clamp(r - d + 0.5, 0, 1);
            if (a > 0) cv.over(px, py, mixc(mul(color, 1.25), mul(color, 0.6), clamp((dx + dy) / (r * 2) + 0.5, 0, 1)), a);
        }
    }

    /** Snow on a painted cell: soft white caps on the upper sides of what is there. */
    function snowOver(cv, R, amount) {
        // Soft drifts settled over the spray (a card lies near level, so its whole face catches snow), with a bright rim on what faces up the picture.
        const N = Kit.noise(Math.floor(R.next() * 1e6)), { w, h, px } = cv, sc = Math.max(8, w / 10);
        for (let y = h - 1; y >= 0; y--) for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            if (px[o + 3] < 0.4) continue;
            const up = y + 3 < h ? px[((y + 3) * w + x) * 4 + 3] : 0, drift = N.n2(x / sc, y / sc) * 0.8 + N.n2(x / (sc * 0.35), y / (sc * 0.35)) * 0.35;
            const k = clamp(Math.max(smooth(-0.05, 0.25, drift), (1 - up) * 0.8) * amount, 0, 1);
            if (k > 0.3) { const t = smooth(0.3, 0.75, k); for (let c = 0; c < 3; c++) px[o + c] = lerp(px[o + c], [0.9, 0.93, 0.98][c], t); }
        }
    }

    /**
     * The leaf picture: `cells` [{ rect: [x, y, w, h] (0..1), painter, ... }],
     * `size` the width in pixels (height `size * aspect`). Snow paints over
     * each cell when `snow` is given.
     */
    function leaves(key, cells, size, seed, opts = {}) {
        const W = size, H = Math.round(size * (opts.aspect || 1)), data = new Uint8Array(W * H * 4);
        let sum = [0, 0, 0], n = 0;
        const painted = cells.map((cell, i) => {
            const [rx, ry, rw, rh] = cell.rect, cw = Math.max(4, Math.round(rw * W)), ch = Math.max(4, Math.round(rh * H)), cv = canvas(cw, ch), R = Kit.roll((seed || 1) * 977 + i * 131);
            (PAINTERS[cell.painter] || PAINTERS.sprig)(cv, cell, R);
            if (opts.snow) snowOver(cv, R, opts.snow);
            for (let k = 0; k < cv.px.length; k += 4) if (cv.px[k + 3] > 0.5) { sum[0] += cv.px[k]; sum[1] += cv.px[k + 1]; sum[2] += cv.px[k + 2]; n++; }
            return { cv, x: Math.round(rx * W), y: Math.round(ry * H) };
        });
        const mean = n ? sum.map(v => v / n) : [0.3, 0.4, 0.2];
        for (let i = 0; i < W * H; i++) { data[i * 4] = mean[0] * 255; data[i * 4 + 1] = mean[1] * 255; data[i * 4 + 2] = mean[2] * 255; data[i * 4 + 3] = 0; }
        for (const { cv, x, y } of painted) for (let py = 0; py < cv.h; py++) for (let px = 0; px < cv.w; px++) {
            const X = x + px, Y = y + py;
            if (X >= W || Y >= H) continue;
            const s = (py * cv.w + px) * 4, o = (Y * W + X) * 4, a = cv.px[s + 3];
            // Under the edge the mean color, so mip levels and cut edges stay in the leaf's tone.
            for (let c = 0; c < 3; c++) data[o + c] = clamp(Math.round(lerp(mean[c], cv.px[s + c], Math.min(1, a * 1.5)) * 255), 0, 255);
            data[o + 3] = clamp(Math.round(a * 255), 0, 255);
        }
        return { name: 'nature-leaves-' + key + '.png', width: W, height: H, data };
    }

    /** A glow picture for emissive parts: bright spots or bands on dark, by `pattern`. */
    function glow(pattern, size, seed) {
        const N = Kit.noise((seed || 5) + 404);
        return paint('nature-glow-' + pattern, size, (u, v) => {
            let k = 0;
            if (pattern === 'spots') { const c = N.cells(u, v, 8, 8, 0.8); k = smooth(0.35, 0.12, c.d1) * (c.id % 3 ? 1 : 0.4); }
            else if (pattern === 'veins') { const w = N.fbm2(u, v, 3, 3, 4); k = smooth(0.9, 0.99, Math.abs(Math.sin(Math.PI * (u * 4 + w * 2)))) + smooth(0.92, 1, Math.abs(Math.sin(Math.PI * (v * 3 + w * 2)))) * 0.6; }
            else if (pattern === 'bands') { k = smooth(0.6, 0.95, Math.abs(Math.sin(Math.PI * (v * 6 + N.fbm2(u, v, 2, 2, 2) * 0.3)))); }
            else if (pattern === 'ribs') { k = (0.3 + 0.7 * smooth(-0.9, 0.4, Math.cos(Math.PI * 16 * u))) * (0.75 + 0.25 * N.fbm2(u, v, 4, 4, 2)); }
            else if (pattern === 'gills') { k = smooth(0.4, 1, Math.abs(Math.sin(Math.PI * u * 48))) * (0.6 + 0.4 * N.fbm2(u, v, 8, 2, 2)); }
            else k = 0.5 + 0.5 * N.fbm2(u, v, 4, 4, 3);
            k = clamp(k, 0, 1);
            return { c: [k, k, k], h: 0 };
        }, 0).albedo;
    }

    const api = { BARKS, ROCKS, OUTLINES, PAINTERS, bark, rock, coverPicture, leaves, glow, normalMap, paint };
    root.RRNatureTexture = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
