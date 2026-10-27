/**
 * RRPropPaint - pictures for props, painted in plain JavaScript (RGBA
 * Uint8Array, row 0 at the top), so the editor and node tests paint alike.
 *
 * Shapes are tested per sample in their own frame ([-1, 1] on each axis,
 * y down); a picture is smoothed by sampling each pixel several times.
 * Weaves are height fields repeating every few pixels; a normal map is
 * the slope of a height field.
 */
(function(root) {
    'use strict';

    const hex = h => {
        const s = String(h || '#808080').replace('#', '');
        const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s.slice(0, 6), 16);
        return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
    };

    function random(seed) {
        let s = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0 || 1;
        return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }

    /** Smooth value noise in [0, 1], wrapping every `cells` along each axis. */
    function noise(seed, cells) {
        const rand = random(seed), n = cells, g = new Float32Array(n * n);
        for (let i = 0; i < g.length; i++) g[i] = rand();
        return (x, y) => {
            const fx = x * n, fy = y * n, ix = Math.floor(fx), iy = Math.floor(fy);
            let u = fx - ix, v = fy - iy;
            u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
            const at = (a, b) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
            const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        };
    }

    /** Several octaves of `noise`, in [0, 1]. */
    function fractal(seed, cells, octaves) {
        const layers = Array.from({ length: octaves }, (_, k) => noise(seed + k * 101, cells << k));
        return (x, y) => {
            let s = 0, w = 0.5, total = 0;
            for (const f of layers) { s += f(x, y) * w; total += w; w *= 0.5; }
            return s / total;
        };
    }

    function pointInPolygon(poly, x, y) {
        let inside = false;
        for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
            const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    /** A regular star of `points` (outer radius 1, inner `inner`), one point straight up. */
    function starPolygon(points, inner) {
        const out = [];
        for (let k = 0; k < points * 2; k++) {
            const r = k % 2 ? inner : 1, a = -Math.PI / 2 + k * Math.PI / points;
            out.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        return out;
    }

    const STAR = starPolygon(5, 0.382);
    // A crown: a band with three points, drawn in [-1, 1] (y down).
    const CROWN = [-0.85, 0.7, 0.85, 0.7, 0.85, 0.42, 0.7, -0.62, 0.4, 0.02, 0, -0.92, -0.4, 0.02, -0.7, -0.62, -0.85, 0.42];
    // A sword point up: blade, crossguard, grip.
    const SWORD = [0, -1, 0.11, -0.78, 0.11, 0.42, 0.42, 0.42, 0.42, 0.54, 0.08, 0.54, 0.08, 0.78, -0.08, 0.78, -0.08, 0.54, -0.42, 0.54, -0.42, 0.42, -0.11, 0.42, -0.11, -0.78];
    // An eagle with raised wings, from the front, for a pole's top: drawn in a 100 x 100 box.
    const EAGLE = [
        50, 30, 54, 34, 58, 40, 66, 30, 74, 18, 86, 6, 96, 2, 92, 14, 98, 18, 88, 28, 94, 34,
        82, 40, 88, 46, 74, 50, 62, 56, 60, 66, 66, 76, 60, 80, 56, 90, 50, 86, 44, 90, 40, 80,
        34, 76, 40, 66, 38, 56, 26, 50, 12, 46, 18, 40, 6, 34, 12, 28, 2, 18, 8, 14, 4, 2,
        14, 6, 26, 18, 34, 30, 42, 40, 46, 34
    ].map(v => v / 50 - 1);

    /** Built-in emblems, each a test of a point in its own [-1, 1] box (y down). */
    const EMBLEMS = {
        star: (x, y) => pointInPolygon(STAR, x, y * 1.05 - 0.05),
        circle: (x, y) => x * x + y * y <= 1,
        crescent: (x, y) => x * x + y * y <= 1 && (x - 0.36) * (x - 0.36) + y * y > 0.78 * 0.78,
        shield: (x, y) => {
            // A heater shield: straight sides, then curving in to a point.
            if (y < -0.92 || y > 1 || Math.abs(x) > 0.8) return false;
            if (y <= 0.05) return true;
            const t = (y - 0.05) / 0.95;
            return Math.abs(x) <= 0.8 * Math.pow(Math.cos(t * Math.PI / 2), 0.7) * (1 - 0.15 * t);
        },
        sun: (x, y) => {
            const r = Math.hypot(x, y), a = Math.atan2(y, x);
            return r <= 0.52 || (r <= 1 && r >= 0.6 && Math.cos(a * 12) > 0.35 + (r - 0.6) * 1.2);
        },
        eagle: (x, y) => pointInPolygon(EAGLE, x, y),
        cross: (x, y) => (Math.abs(x) <= 0.28 && Math.abs(y) <= 0.95) || (Math.abs(y) <= 0.28 && Math.abs(x) <= 0.95),
        crown: (x, y) => pointInPolygon(CROWN, x, y) || [-0.7, 0, 0.7].some((cx, k) => Math.hypot(x - cx, y - (k === 1 ? -0.92 : -0.62)) < 0.13),
        sword: (x, y) => pointInPolygon(SWORD, x, y) || Math.hypot(x, y - 0.86) < 0.11,
        laurel: (x, y) => {
            // Two branches of leaves curving up round an open top, tied at the foot.
            for (let k = 0; k < 9; k++) for (const s of [-1, 1]) {
                const a = Math.PI * (0.62 + k * 0.105), cx = s * Math.cos(a) * 0.72, cy = -Math.sin(a) * 0.72 + 0.05;
                const ang = a + Math.PI / 2, dx = x - cx, dy = y - cy;
                const lx = dx * Math.cos(ang) * s + dy * Math.sin(ang), ly = -dx * Math.sin(ang) * s + dy * Math.cos(ang);
                if ((lx / 0.2) ** 2 + (ly / 0.09) ** 2 <= 1) return true;
            }
            const r = Math.hypot(x, y - 0.05);
            return r < 0.76 && r > 0.69 && y > -0.2 || (Math.abs(x) < 0.12 && Math.abs(y - 0.8) < 0.08);
        },
        gear: (x, y) => {
            const r = Math.hypot(x, y), a = Math.atan2(y, x);
            if (r < 0.3) return false;
            return r <= 0.72 || (r <= 0.95 && Math.cos(a * 8) > 0.15);
        },
        skull: (x, y) => {
            const head = (x / 0.78) ** 2 + ((y + 0.15) / 0.72) ** 2 <= 1 || (Math.abs(x) < 0.42 && y > 0.25 && y < 0.82);
            const eyes = Math.hypot(Math.abs(x) - 0.3, y + 0.05) < 0.19, nose = y > 0.22 && y < 0.42 && Math.abs(x) < (y - 0.22) * 0.5;
            const teeth = y > 0.62 && y < 0.82 && Math.abs(x) < 0.4 && Math.abs(((x + 0.4) / 0.16) % 1 - 0.5) < 0.08;
            return head && !eyes && !nose && !teeth;
        },
        tree: (x, y) => (Math.abs(x) < 0.12 && y > 0.3 && y < 0.95) || Math.hypot(x, y + 0.25) < 0.5 || Math.hypot(x - 0.38, y + 0.02) < 0.36 || Math.hypot(x + 0.38, y + 0.02) < 0.36 || (y > 0.88 && y < 0.95 && Math.abs(x) < 0.5)
    };

    /**
     * A picture of `width` x `height`, each pixel the average of `ss` x `ss`
     * samples of `color(u, v, out)` (u, v in [0, 1], out an RGBA array of
     * 0..255). Returns { width, height, data }.
     */
    function paint(width, height, color, ss) {
        const data = new Uint8Array(width * height * 4), out = [0, 0, 0, 255], n = ss || 2, inv = 1 / (n * n);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            let r = 0, g = 0, b = 0, a = 0;
            for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
                out[3] = 255;
                color((x + (sx + 0.5) / n) / width, (y + (sy + 0.5) / n) / height, out);
                r += out[0] * out[3]; g += out[1] * out[3]; b += out[2] * out[3]; a += out[3];
            }
            const o = (y * width + x) * 4;
            if (a > 0) { data[o] = r / a; data[o + 1] = g / a; data[o + 2] = b / a; }
            data[o + 3] = a * inv;
        }
        return { width, height, data };
    }

    /** A source picture ({ width, height, data }) read at (u, v) in [0, 1], smoothly, into `out`. */
    function sampleImage(img, u, v, out) {
        const x = Math.max(0, Math.min(img.width - 1, u * img.width - 0.5)), y = Math.max(0, Math.min(img.height - 1, v * img.height - 0.5));
        const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1), fx = x - x0, fy = y - y0;
        const d = img.data;
        for (let k = 0; k < 4; k++) {
            const a = d[(y0 * img.width + x0) * 4 + k], b = d[(y0 * img.width + x1) * 4 + k], c = d[(y1 * img.width + x0) * 4 + k], e = d[(y1 * img.width + x1) * 4 + k];
            out[k] = (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
        }
        return out;
    }

    /**
     * Woven cloth as height (0..1) at a thread position (x along the weft,
     * y along the warp, one unit per thread). Plain: one over one under.
     * Twill: two over two under, stepping each row (diagonal ribs). Satin:
     * four over one under (long smooth floats).
     */
    function weaveHeight(kind, x, y) {
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        let warpUp;
        if (kind === 'twill') warpUp = ((ix + iy) % 4 + 4) % 4 < 2;
        else if (kind === 'satin') warpUp = ((ix * 2 + iy) % 5 + 5) % 5 !== 0;
        else warpUp = ((ix + iy) & 1) === 0;
        // Each thread is round across and dips where it passes under its neighbor.
        const across = Math.sin(Math.PI * (warpUp ? fx : fy));
        const along = 0.75 + 0.25 * Math.sin(Math.PI * (warpUp ? fy : fx));
        return warpUp ? 0.55 + 0.45 * across * along : 0.5 * across * along;
    }

    /**
     * A normal map (glTF: +x right, +y up, +z out) from a height function
     * `h(px, py)` in pixels, slopes scaled by `strength`.
     */
    function normalMap(width, height, h, strength) {
        const data = new Uint8Array(width * height * 4), H = new Float32Array(width * height);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) H[y * width + x] = h(x, y);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const l = H[y * width + Math.max(0, x - 1)], r = H[y * width + Math.min(width - 1, x + 1)];
            const u = H[Math.max(0, y - 1) * width + x], d = H[Math.min(height - 1, y + 1) * width + x];
            const nx = -(r - l) * 0.5 * strength, ny = (d - u) * 0.5 * strength, len = Math.hypot(nx, ny, 1);
            const o = (y * width + x) * 4;
            data[o] = Math.round((nx / len * 0.5 + 0.5) * 255);
            data[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
            data[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
            data[o + 3] = 255;
        }
        return { width, height, data };
    }

    /** Wood: long grain with rings and a few knots, 256 x 256, repeating. */
    function wood(base, seed) {
        const c = hex(base), n1 = noise(seed || 3, 8), n2 = fractal((seed || 3) + 9, 16, 3);
        const pic = paint(256, 256, (u, v, out) => {
            const warp = n1(u, v * 0.25) * 6;
            const ring = 0.5 + 0.5 * Math.sin((u * 18 + warp) * Math.PI * 2);
            const k = 0.78 + 0.16 * ring + 0.12 * (n2(u * 2, v * 0.5) - 0.5);
            out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; out[3] = 255;
        }, 1);
        pic.name = 'wood.png';
        return pic;
    }

    /**
     * Flat-sawn wood for stocks, grip panels and instrument bodies, its grain running along v: growth rings
     * warped by slow figure and bowing into arches now and then, darker latewood at each ring's end, pores
     * drawn out along the grain, and broad shifts of tone (a darker heart, a redder streak) so no two places
     * look the same. `o.rings` rings across a tile (14; spruce is tighter). 256 across, 512 along, repeating.
     */
    function grainWood(base, seed, name, o) {
        const c = hex(base), red = [c[0] * 1.08 + 8, c[1] * 0.86, c[2] * 0.78], dark = c.map(v => v * 0.42), rings = (o && o.rings) || 14;
        seed = seed || 3;
        const hash = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7 + seed * 19.3) * 43758.5453; return v - Math.floor(v); };
        // Value noise repeating every px cells across and py along.
        const vn = (x, y, px, py, k) => {
            const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
            const h = (i, j) => hash(((i % px) + px) % px, ((j % py) + py) % py, k);
            return (h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy;
        };
        const pic = paint(256, 512, (u, v, out) => {
            // The rings meander along the grain and bow into long arches (flat-sawn figure) every so often.
            const arch = 0.9 * Math.pow(0.5 + 0.5 * Math.sin(Math.PI * 2 * (v + u)), 3) + 0.25 * Math.sin(Math.PI * 2 * (v * 2 - u) + 1.3);
            const figure = vn(u * 3, v * 3, 3, 3, 1) * 1.1 + vn(u * 6, v * 8, 6, 8, 2) * 0.22 + vn(u * 2, v * 20, 2, 20, 7) * 0.05 + arch;
            const ring = ((u * rings + figure) % 1 + 1) % 1;
            const late = Math.pow(Math.max(0, (ring - 0.7) / 0.3), 2.4) * (1 - Math.pow(Math.max(0, (ring - 0.95) / 0.05), 2));
            const pores = Math.pow(vn(u * 128, v * 10, 128, 10, 3), 5), fleck = Math.pow(vn(u * 48, v * 4, 48, 4, 4), 9);
            const broad = vn(u * 2, v * 1, 2, 1, 5), streak = Math.pow(vn(u * 4, v * 1, 4, 1, 6), 3);
            const k = 0.95 + 0.3 * (broad - 0.5) - 0.36 * late - 0.2 * pores - 0.12 * fleck;
            const mixR = 0.45 * streak, mixD = 0.25 * Math.max(0, 0.5 - broad) + 0.25 * late;
            for (let i = 0; i < 3; i++) { const col = c[i] * (1 - mixR - mixD) + red[i] * mixR + dark[i] * mixD; out[i] = Math.max(0, Math.min(255, col * k)); }
            out[3] = 255;
        }, 1);
        pic.name = name || 'wood.png'; pic.repeat = true;
        return pic;
    }
    const api = { wood, grainWood, hex, random, noise, fractal, pointInPolygon, starPolygon, EMBLEMS, EAGLE, paint, sampleImage, weaveHeight, normalMap };
    root.RRPropPaint = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
