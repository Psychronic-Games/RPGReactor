#!/usr/bin/env node
/**
 * Builds the Character Builder's face movements from MakeHuman's CC0
 * expression units.
 *
 *   node editor/build-scripts/build-expression-pack.cjs <makehuman/data folder>
 *
 * Reads targets/expression/units/<african|asian|caucasian>/*.target (the
 * facial action units MakeHuman made for its hm08 base mesh, one set per
 * ancestry) and writes src/forge/Character3D/data/expressions.json (names,
 * layout) and expressions.bin (each unit's vertex indices and int16
 * deltas). The human pack is not touched: the units are offsets on the
 * same base mesh vertices.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DATA = process.argv[2];
const UNITS_DIR = DATA && path.join(DATA, 'targets', 'expression', 'units');
if (!UNITS_DIR || !fs.existsSync(path.join(UNITS_DIR, 'caucasian'))) {
    console.error('usage: build-expression-pack.cjs <makehuman/data folder>');
    process.exit(1);
}
const OUT = path.join(__dirname, '..', 'src', 'forge', 'Character3D', 'data');
const UNIT = 0.1; // MakeHuman works in decimeters.

/** File name (without .target) → the unit's name in RRCharacterExpressions. */
const NAMES = {
    'eyebrows-left-down': 'browDownL', 'eyebrows-right-down': 'browDownR',
    'eyebrows-left-extern-up': 'browOuterUpL', 'eyebrows-right-extern-up': 'browOuterUpR',
    'eyebrows-left-inner-up': 'browInnerUpL', 'eyebrows-right-inner-up': 'browInnerUpR',
    'eyebrows-left-up': 'browUpL', 'eyebrows-right-up': 'browUpR',
    'eye-left-closure': 'eyeCloseL', 'eye-right-closure': 'eyeCloseR',
    'eye-left-opened-up': 'eyeWideL', 'eye-right-opened-up': 'eyeWideR',
    'eye-left-slit': 'eyeSquintL', 'eye-right-slit': 'eyeSquintR',
    'mouth-compression': 'lipPress', 'mouth-corner-puller': 'smile',
    'mouth-depression-retraction': 'grimaceOpen', 'mouth-depression': 'frown',
    'mouth-elevation': 'upperLipRaise', 'mouth-eversion': 'pout',
    'mouth-open': 'jawDrop', 'mouth-parling': 'lipsPart',
    'mouth-part-later': 'stretchOpen', 'mouth-protusion': 'funnel',
    'mouth-pursing': 'pucker', 'mouth-retraction': 'stretch',
    'mouth-upward-retraction': 'grin', 'neck-platysma': 'neckTense',
    'nose-compression': 'noseCompress', 'nose-depression': 'noseDown',
    'nose-left-dilatation': 'nostrilFlareL', 'nose-right-dilatation': 'nostrilFlareR',
    'nose-left-elevation': 'sneerL', 'nose-right-elevation': 'sneerR'
};
const RACES = ['african', 'asian', 'caucasian'];

function readTarget(file) {
    const idx = [], d = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line || line[0] === '#') continue;
        const p = line.trim().split(/\s+/);
        if (p.length < 4) continue;
        idx.push(+p[0]); d.push(+p[1] * UNIT, +p[2] * UNIT, +p[3] * UNIT);
    }
    return { idx, d };
}

const chunks = [];
let offset = 0;
const put = typed => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    const at = offset;
    chunks.push(bytes); offset += bytes.length;
    return [at, typed.length];
};
const units = [];
for (const race of RACES) for (const [file, name] of Object.entries(NAMES)) {
    const f = path.join(UNITS_DIR, race, file + '.target');
    if (!fs.existsSync(f)) { console.warn('missing', race, file); continue; }
    const t = readTarget(f);
    let max = 0;
    for (const x of t.d) max = Math.max(max, Math.abs(x));
    const scale = (max || 1) / 32767;
    units.push({ name, race, scale, index: put(Uint16Array.from(t.idx)), delta: put(Int16Array.from(t.d, x => Math.round(x / scale))) });
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'expressions.bin'), Buffer.concat(chunks));
fs.writeFileSync(path.join(OUT, 'expressions.json'), JSON.stringify({
    format: 1,
    source: 'MakeHuman hm08 expression units (targets/expression/units, CC0 1.0, makehumancommunity.org)',
    races: RACES,
    units
}));
console.log(`units ${units.length}, bin ${(offset / 1024).toFixed(0)} KB`);
