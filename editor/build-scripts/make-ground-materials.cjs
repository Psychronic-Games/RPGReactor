#!/usr/bin/env node
/**
 * Ground materials to paint with, drawn by rule so they can be made again:
 * small tiling images with a normal map each, light and near grey so a ground
 * type's Tint makes one image many grounds (a pale sand tinted red is Mars).
 *
 *   node editor/build-scripts/make-ground-materials.cjs <project | folder> [--force] [--only Name,Name] [--size 256]
 *
 * Writes `<Name>.png`, `<Name>_normal.png`, `<Name>.json` and, for the materials with a sheen, `<Name>_rough.png` under the
 * project's img/materials (or into the folder given). A file already there is
 * left alone unless --force.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const args = process.argv.slice(2);
const flag = name => args.includes('--' + name);
const option = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : null; };
const target = args.find((arg, i) => !arg.startsWith('--') && !(i > 0 && ['--only', '--size'].includes(args[i - 1])));
if (!target) {
    console.error('usage: make-ground-materials.cjs <project | folder> [--force] [--only Name,Name] [--size 256]');
    process.exit(2);
}
const SIZE = Math.max(64, Math.min(1024, Number(option('size')) || 256));
const only = option('only') ? option('only').split(',').map(name => name.trim()) : null;
const directory = fs.existsSync(path.join(target, 'img')) ? path.join(target, 'img', 'materials') : target;

// ---- Tiling noise ----------------------------------------------------------

const hash = (x, y, seed) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const smooth = t => t * t * (3 - 2 * t);
/** Value noise that repeats every `period` cells; `u`, `v` in cells. */
const value = (u, v, period, seed) => {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = smooth(u - x0), fy = smooth(v - y0);
    const at = (x, y) => hash(((x % period) + period) % period, ((y % period) + period) % period, seed);
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
};
/** Layered noise over the unit square (`x`, `y` 0-1), tiling: `base` cells across, `octaves` layers. */
const fbm = (x, y, base, octaves, seed) => {
    let sum = 0, weight = 0, amplitude = 1, period = base;
    for (let o = 0; o < octaves; o++) {
        sum += value(x * period, y * period, period, seed + o * 17) * amplitude;
        weight += amplitude; amplitude *= 0.5; period *= 2;
    }
    return sum / weight;
};
/** Cells: the nearest and second-nearest seed points over a tiling grid of `cells` across. Returns [f1, f2, id]. */
const cells = (x, y, count, seed) => {
    const u = x * count, v = y * count, cx = Math.floor(u), cy = Math.floor(v);
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gy = cy + dy, wx = ((gx % count) + count) % count, wy = ((gy % count) + count) % count;
        const px = gx + hash(wx, wy, seed), py = gy + hash(wx, wy, seed + 5);
        const d = Math.hypot(u - px, v - py);
        if (d < f1) { f2 = f1; f1 = d; id = hash(wx, wy, seed + 11); } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
};
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const ramp = (lo, hi, v) => smooth(clamp((v - lo) / (hi - lo)));

// ---- The grounds: each answers a color (0-1 rgb) and a height (0-1) at a point of the unit square ----

const grey = (v, warm = 0) => [clamp(v + warm * 0.04), clamp(v), clamp(v - warm * 0.05)];
const MATERIALS = {
    // Loose earth: soft clods, a few small stones.
    Dirt: { scale: 3, strength: 1, at(x, y) {
        const clods = fbm(x, y, 6, 5, 3), fine = fbm(x, y, 28, 3, 9), [f1, , id] = cells(x, y, 22, 4);
        const stone = id > 0.82 ? ramp(0.3, 0.12, f1) : 0;
        const h = clods * 0.7 + fine * 0.3 + stone * 0.35;
        return { color: grey(0.56 + clods * 0.2 + fine * 0.12 + stone * 0.12, 1), height: h };
    } },
    // Pebbles packed together, dark between them.
    Gravel: { scale: 2.5, strength: 1.4, at(x, y) {
        const [f1, f2, id] = cells(x, y, 16, 21), [g1, g2, gid] = cells(x, y, 34, 22);
        const big = ramp(0.02, 0.22, f2 - f1), small = ramp(0.02, 0.2, g2 - g1);
        const stone = Math.max(big * (0.75 + id * 0.25), small * (0.55 + gid * 0.3) * (1 - big * 0.6));
        const fine = fbm(x, y, 40, 2, 6);
        return { color: grey(0.34 + stone * 0.5 + fine * 0.08), height: stone * 0.85 + (1 - f1) * big * 0.15 };
    } },
    // Wet earth dried into plates: smooth, with thin cracks.
    Mud: { scale: 3.5, strength: 0.9, gloss: 0.35, at(x, y) {
        const [f1, f2, id] = cells(x, y, 7, 31), crack = ramp(0.07, 0.0, f2 - f1), soft = fbm(x, y, 5, 4, 8);
        const plate = 0.6 + id * 0.12 + soft * 0.14;
        return { color: grey(mix(plate, 0.3, crack), 1), height: mix(0.55 + soft * 0.3, 0.05, crack) };
    } },
    // Fine ash with cinders: a volcano's floor.
    Ash: { scale: 3, strength: 0.8, at(x, y) {
        const drift = fbm(x, y, 5, 4, 41), fine = fbm(x, y, 36, 3, 42), [f1, , id] = cells(x, y, 26, 43);
        const cinder = id > 0.78 ? ramp(0.28, 0.1, f1) : 0;
        return { color: grey(0.62 + drift * 0.18 + fine * 0.1 - cinder * 0.34), height: drift * 0.6 + fine * 0.25 + cinder * 0.4 };
    } },
    // Alien: a mat of living cells, bright walls round darker hearts.
    'Alien-Cells': { scale: 3, strength: 1.3, gloss: 0.3, at(x, y) {
        const [f1, f2, id] = cells(x, y, 9, 51), wall = ramp(0.16, 0.02, f2 - f1), heart = ramp(0.0, 0.5, f1);
        const [n1] = cells(x, y, 30, 52), pore = ramp(0.22, 0.05, n1) * (1 - wall);
        const body = 0.42 + heart * 0.26 + id * 0.1;
        return { color: grey(mix(body, 0.95, wall) - pore * 0.16), height: mix(heart * 0.6 + 0.1, 1, wall) - pore * 0.2 };
    } },
    // Alien: a crust of crystals. Long angular shards lying every way, each a ridge with two flat faces,
    // one bright and one dark, with small bright glints: no rounded stones, no mortar lines.
    'Alien-Crystal': { scale: 3, strength: 1.8, gloss: 0.8, rough: true, at(x, y) {
        let best = -1, face = 0, id = 0;
        // Two sizes of shard, each cell holding one, turned its own way; the tallest ridge at a point shows.
        for (const [count, seed, tall] of [[5, 61, 1], [11, 62, 0.62], [23, 63, 0.3]]) {
            const u = x * count, v = y * count, cx = Math.floor(u), cy = Math.floor(v);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const gx = cx + dx, gy = cy + dy, wx = ((gx % count) + count) % count, wy = ((gy % count) + count) % count;
                const px = gx + 0.2 + 0.6 * hash(wx, wy, seed), py = gy + 0.2 + 0.6 * hash(wx, wy, seed + 5);
                const angle = hash(wx, wy, seed + 9) * Math.PI, ca = Math.cos(angle), sa = Math.sin(angle);
                const along = (u - px) * ca + (v - py) * sa, across = -(u - px) * sa + (v - py) * ca;
                const length = 0.75 + 0.5 * hash(wx, wy, seed + 13), width = 0.2 + 0.16 * hash(wx, wy, seed + 17);
                // A ridge: highest along its spine, falling straight to its edges, pointed at both ends.
                const taper = 1 - Math.abs(along) / length;
                if (taper <= 0) continue;
                const h = (1 - Math.abs(across) / (width * Math.min(1, taper * 2.2))) * tall * (0.7 + 0.3 * taper);
                if (h > best) { best = h; face = across > 0 ? 1 : 0; id = hash(wx, wy, seed + 21); }
            }
        }
        const height = Math.max(0, best);
        const lit = best > 0 ? (face ? 0.8 : 0.4) + (id - 0.5) * 0.24 : 0.24;
        const spine = best > 0 ? ramp(0.06, 0.0, Math.abs(1 - best / Math.max(best, 0.999)) + (1 - height) * 0.0) : 0;
        const [g1, , gid] = cells(x, y, 40, 64), glint = gid > 0.9 ? ramp(0.16, 0.02, g1) : 0;
        return { color: grey(clamp(lit + glint * 0.5 + height * 0.08 + spine * 0)), height, rough: clamp(0.5 - height * 0.42 - glint * 0.3 + (face ? 0 : 0.18)) };
    } },
    // Alien: overlapping plates of chitin, each a smooth dome with a dark seam under the next one's lip.
    'Alien-Chitin': { scale: 3, strength: 1.4, gloss: 0.7, rough: true, at(x, y) {
        const rows = 9, v = y * rows, row = Math.floor(v), fv = v - row;
        const shift = (row % 2) * 0.5, u = x * rows + shift, col = Math.floor(u), fu = u - col;
        // The plate above overlaps: a scale's lip is an arc along its lower edge.
        const here = Math.hypot(fu - 0.5, (fv - 0.15) * 0.9), lip = ramp(0.62, 0.5, here);
        const id = hash(((col % rows) + rows) % rows, ((row % rows) + rows) % rows, 81);
        const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, here / 0.66) ** 2));
        const groove = fbm(x, y, 46, 2, 82), ridge = Math.abs(Math.sin((fu - 0.5) * 9)) * 0.06 * dome;
        const seam = 1 - lip;
        return { color: grey(clamp(0.36 + dome * 0.4 + id * 0.1 + groove * 0.06 - seam * 0.26)), height: clamp(dome * 0.8 + (1 - fv) * 0.2 * lip + ridge - seam * 0.3), rough: clamp(0.22 + seam * 0.6 + groove * 0.2) };
    } },
    // Alien: a porous sponge or coral, pale walls round dark holes of many sizes.
    'Alien-Sponge': { scale: 3, strength: 1.6, gloss: 0.15, at(x, y) {
        const [a1, a2] = cells(x, y, 8, 91), [b1, b2] = cells(x, y, 19, 92), [c1] = cells(x, y, 41, 93);
        const big = ramp(0.34, 0.16, a1), mid = ramp(0.3, 0.14, b1) * (1 - big), small = ramp(0.24, 0.1, c1) * (1 - big) * (1 - mid) * 0.7;
        const hole = Math.max(big, mid, small), wall = ramp(0.0, 0.2, Math.min(a2 - a1, b2 - b1));
        const grain = fbm(x, y, 30, 3, 94);
        return { color: grey(clamp(0.78 + grain * 0.14 - hole * 0.5 - (1 - wall) * 0.08), 1), height: clamp(0.75 + grain * 0.2 - hole * 0.75) };
    } },
    // Alien: dark hide run through with bright veins.
    'Alien-Veins': { scale: 3.5, strength: 1.2, gloss: 0.4, at(x, y) {
        const warp = fbm(x, y, 4, 3, 71) * 0.08, a = fbm(x + warp, y - warp, 5, 4, 72), b = fbm(x - warp, y + warp, 11, 3, 73);
        const vein = Math.max(ramp(0.045, 0.0, Math.abs(a - 0.5)), ramp(0.03, 0.0, Math.abs(b - 0.5)) * 0.7);
        const [f1, f2] = cells(x, y, 24, 74), scale = ramp(0.0, 0.14, f2 - f1), hide = fbm(x, y, 20, 3, 75);
        return { color: grey(mix(0.3 + scale * 0.14 + hide * 0.1, 1, vein)), height: mix(0.3 + scale * 0.3, 0.95, vein) };
    } }
};

// ---- Writing ---------------------------------------------------------------

/** Round a channel to 6 bits, so the image packs small without banding the eye catches. */
const pack = v => { const q = Math.round(clamp(v) * 63); return (q << 2) | (q >> 4); };
/** A normal's channel to 5 bits: its slopes are smooth, and it is the larger file. */
const packNormal = v => { const q = Math.round(clamp(v) * 31); return (q << 3) | (q >> 2); };

function render(name) {
    const spec = MATERIALS[name], n = SIZE;
    const color = new PNG({ width: n, height: n, colorType: 2 }), normal = new PNG({ width: n, height: n, colorType: 2 });
    const heights = new Float32Array(n * n);
    const rough = spec.rough ? new PNG({ width: n, height: n, colorType: 0 }) : null;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const sample = spec.at((x + 0.5) / n, (y + 0.5) / n), i = (y * n + x) * 4;
        heights[y * n + x] = clamp(sample.height);
        if (rough) { const r = pack(sample.rough === undefined ? 1 : sample.rough); rough.data[i] = r; rough.data[i + 1] = r; rough.data[i + 2] = r; rough.data[i + 3] = 255; }
        color.data[i] = pack(sample.color[0]); color.data[i + 1] = pack(sample.color[1]); color.data[i + 2] = pack(sample.color[2]); color.data[i + 3] = 255;
    }
    // The normal from the height, wrapping at the edges so it tiles; green up.
    const h = (x, y) => heights[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
    const depth = 2.2 * (n / 256);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * depth, dy = (h(x, y + 1) - h(x, y - 1)) * depth;
        const length = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
        normal.data[i] = packNormal(-dx / length * 0.5 + 0.5); normal.data[i + 1] = packNormal(dy / length * 0.5 + 0.5); normal.data[i + 2] = packNormal(1 / length * 0.5 + 0.5); normal.data[i + 3] = 255;
    }
    const options = { colorType: 2, deflateLevel: 9 };
    return {
        ...(rough ? { [name + '_rough.png']: PNG.sync.write(rough, { colorType: 0, inputColorType: 6, deflateLevel: 9 }) } : {}),
        [name + '.png']: PNG.sync.write(color, options),
        [name + '_normal.png']: PNG.sync.write(normal, options),
        [name + '.json']: Buffer.from(JSON.stringify({ scale: spec.scale, gloss: spec.gloss || 0, reflect: 0, normalStrength: spec.strength }, null, 2) + '\n')
    };
}

fs.mkdirSync(directory, { recursive: true });
let bytes = 0, written = 0, kept = 0;
for (const name of Object.keys(MATERIALS)) {
    if (only && !only.includes(name)) continue;
    const files = render(name);
    for (const [file, data] of Object.entries(files)) {
        const full = path.join(directory, file);
        if (fs.existsSync(full) && !flag('force')) { kept++; console.log(`kept     ${file} (already there)`); continue; }
        fs.writeFileSync(full, data);
        bytes += data.length; written++;
        console.log(`wrote    ${file} ${(data.length / 1024).toFixed(1)} KB`);
    }
}
console.log(`${written} file(s), ${(bytes / 1024).toFixed(1)} KB written; ${kept} left alone. Names: ${Object.keys(MATERIALS).join(', ')}`);

module.exports = { MATERIALS: Object.keys(MATERIALS) };
