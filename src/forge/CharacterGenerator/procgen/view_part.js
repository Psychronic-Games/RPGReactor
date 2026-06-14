#!/usr/bin/env node
// Part viewer / analyzer for Character Generator looseleaf parts.
//
// Usage:
//   node view_part.js <path-to-part.js>            → all directions, frame 0, cropped
//   node view_part.js <path> --dir 0 --frame 1     → one direction+frame
//   node view_part.js <path> --all                 → every direction+frame
//   node view_part.js <path> --palette             → palette with hex + brightness + role guess
//   node view_part.js <path> --overlay             → part letters overlaid on body silhouette (·)
//   node view_part.js <path> --raw                 → no bbox crop (full 144 grid region of content)
//
// The viewer crops to the part's content bbox and prints a column ruler so
// you can read anatomical alignment. It also prints the palette sorted by
// brightness so you can see the dark→light ramp the artist used.

const fs = require('fs');
const path = require('path');

const PARTS_DIR = path.resolve(__dirname, '..', 'styles', 'looseleaf', 'parts');
const BODY_PATH = path.join(PARTS_DIR, 'body', 'male', 'body-looseleaf-looseleaf-male-body-01.js');
const DIR_NAMES = ['Front', 'Left', 'Right', 'Back'];

function loadPart(p) {
    const reg = []; const win = {};
    (new Function('RR_CHARACTER_REGISTRY', 'window', fs.readFileSync(p, 'utf8')))(reg, win);
    return reg[0];
}
function lum(hex) {
    hex = (hex || '#000000').replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}
function frameBbox(frame) {
    let minY = 1e9, maxY = -1, minX = 1e9, maxX = -1;
    for (let y = 0; y < frame.length; y++) {
        const row = frame[y] || '';
        for (let x = 0; x < row.length; x++) {
            const c = row[x];
            if (c && c !== ' ' && c !== '.') {
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (x < minX) minX = x; if (x > maxX) maxX = x;
            }
        }
    }
    return { minX, maxX, minY, maxY };
}
function unionBbox(frames) {
    let b = { minX: 1e9, maxX: -1, minY: 1e9, maxY: -1 };
    for (const f of frames) {
        const fb = frameBbox(f);
        if (fb.maxX < 0) continue;
        b.minX = Math.min(b.minX, fb.minX); b.maxX = Math.max(b.maxX, fb.maxX);
        b.minY = Math.min(b.minY, fb.minY); b.maxY = Math.max(b.maxY, fb.maxY);
    }
    return b;
}

function printFrame(frame, bbox, overlayBody) {
    const { minX, maxX, minY, maxY } = bbox;
    // Column ruler (tens + ones) over the crop window.
    let tens = '     ', ones = '     ';
    for (let x = minX; x <= maxX; x++) { tens += (x % 10 === 0) ? String(Math.floor(x / 10) % 10) : ' '; ones += x % 10; }
    console.log(tens); console.log(ones);
    for (let y = minY; y <= maxY; y++) {
        const row = (frame[y] || '');
        const brow = overlayBody ? (overlayBody[y] || '') : null;
        let line = String(y).padStart(4, ' ') + ' ';
        for (let x = minX; x <= maxX; x++) {
            let c = row[x] || ' ';
            if (c === ' ' && brow) { const bc = brow[x]; c = (bc && bc !== ' ' && bc !== '.') ? '·' : ' '; }
            line += c;
        }
        console.log(line);
    }
}

function main() {
    const file = process.argv[2];
    if (!file) { console.error('usage: node view_part.js <path> [--dir N] [--frame N] [--all] [--palette] [--overlay] [--raw]'); process.exit(1); }
    const full = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    const part = loadPart(full);
    const t = part.template;
    const flags = process.argv.slice(3);
    const has = f => flags.includes(f);
    const argOf = name => { const i = flags.indexOf(name); return i >= 0 ? Number(flags[i + 1]) : null; };

    console.log(`# ${part.id}  (${part.category})  name="${part.name}"  tags=${JSON.stringify(part.tags)}`);

    // Palette table sorted by luminance.
    const pal = Object.entries(t.palette).map(([k, v]) => ({ letter: k, hex: v.hex, lum: lum(v.hex) }))
        .sort((a, b) => a.lum - b.lum);
    console.log(`\n## palette (${pal.length} letters, sorted dark→light)`);
    for (const e of pal) console.log(`  ${e.letter}  ${e.hex}  lum=${String(e.lum).padStart(3)}  ${'█'.repeat(Math.max(1, Math.round(e.lum / 8)))}`);
    if (has('--palette')) return;

    const body = has('--overlay') ? loadPart(BODY_PATH).template : null;

    const dirs = argOf('--dir') !== null ? [argOf('--dir')] : [0, 1, 2, 3];
    const frames = argOf('--frame') !== null ? [argOf('--frame')] : (has('--all') ? [0, 1, 2] : [0]);

    for (const d of dirs) {
        const dirFrames = t.sheet[d];
        if (!dirFrames) continue;
        const bbox = has('--raw') ? { minX: 40, maxX: 103, minY: 30, maxY: 110 } : unionBbox(dirFrames);
        if (bbox.maxX < 0) { console.log(`\n## ${DIR_NAMES[d]}: (empty)`); continue; }
        for (const f of frames) {
            if (!dirFrames[f]) continue;
            console.log(`\n## ${DIR_NAMES[d]} (dir ${d}) frame ${f}   bbox x:${bbox.minX}-${bbox.maxX} y:${bbox.minY}-${bbox.maxY}`);
            const bodyFrame = body ? body.sheet[d][f] : null;
            printFrame(dirFrames[f], bbox, bodyFrame);
        }
    }
}
main();
