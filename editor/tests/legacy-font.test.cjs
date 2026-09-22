'use strict';
// The 2000/2003 game font: a Windows .fon (NE executable holding FNT bitmap
// resources) read into glyph bitmaps and written as a TrueType file whose
// outlines are the pixels, at the engine's 6 / 12 px pitch. A fixture FNT is
// built here; the real RM2000.fon is read too when Deep 8 is present.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const F = require('../src/legacy/LegacyFont.js');

// ---- a tiny FNT v2 writer ---------------------------------------------------
function fnt({ height, ascent, glyphs, face = 'Fixture' }) {
    const first = Math.min(...Object.keys(glyphs).map(Number)), last = Math.max(...Object.keys(glyphs).map(Number));
    const count = last - first + 2;
    const header = new Uint8Array(118 + count * 4);
    const dv = new DataView(header.buffer);
    dv.setUint16(0, 0x200, true); dv.setUint16(74, ascent, true); dv.setUint16(88, height, true);
    header[95] = first; header[96] = last;
    const bitmaps = [];
    let offset = header.length;
    for (let code = first; code <= last; code++) {
        const g = glyphs[code];
        const e = 118 + (code - first) * 4;
        if (!g) { dv.setUint16(e, 0, true); dv.setUint16(e + 2, 0, true); continue; }
        const width = g[0].length, bands = Math.ceil(width / 8);
        dv.setUint16(e, width, true); dv.setUint16(e + 2, offset, true);
        const bytes = new Uint8Array(bands * height);
        for (let band = 0; band < bands; band++) for (let y = 0; y < height; y++) { let b = 0; for (let bit = 0; bit < 8; bit++) { const x = band * 8 + bit; if (x < width && g[y][x] === '#') b |= 0x80 >> bit; } bytes[band * height + y] = b; }
        bitmaps.push(bytes); offset += bytes.length;
    }
    const faceBytes = Uint8Array.from(Buffer.from(face + '\0', 'latin1'));
    dv.setUint32(105, offset, true);
    dv.setUint32(2, offset + faceBytes.length, true);
    return Buffer.concat([header, ...bitmaps, faceBytes]);
}
const CELL = 15;
const cell = (rows) => rows.map(r => r.padEnd(CELL, '.'));
const A = cell(['.....', '..#..', '.#.#.', '#...#', '#####', '#...#', '.....']);
const AT = cell(['.#########.', '#.........#', '#..#####..#', '#..#...#..#', '#..#####..#', '#.........#', '.#########.']);
const glyphs = { 65: A, 64: AT, 66: cell(['###..', '#..#.', '###..', '#..#.', '###..', '.....', '.....']) };
const fixture = fnt({ height: 7, ascent: 6, glyphs });

test('a FNT resource reads its face, metrics and glyph rows; an NE wrapper is unwrapped', () => {
    const font = F.readFon(fixture);
    assert.equal(font.face, 'Fixture');
    assert.deepEqual([font.height, font.ascent, font.first, font.last], [7, 6, 64, 66]);
    assert.equal(font.glyphs.get(65).width, CELL);
    assert.deepEqual(Array.from(font.glyphs.get(65).rows[4].slice(0, 5)), [1, 1, 1, 1, 1]);
    assert.deepEqual(Array.from(font.glyphs.get(65).rows[1].slice(0, 5)), [0, 0, 1, 0, 0]);
    // wrapped in a minimal NE executable: MZ header, NE header at 0x80, one resource table entry of type 0x8008
    const shift = 4, res = 0x100, len = Math.ceil(fixture.length / 16) * 16;
    const ne = Buffer.alloc(res + len);
    ne.write('MZ', 0, 'latin1'); ne.writeUInt16LE(0x80, 0x3c); ne.write('NE', 0x80, 'latin1'); ne.writeUInt16LE(0x40, 0x80 + 0x24);
    const table = 0x80 + 0x40; ne.writeUInt16LE(shift, table); ne.writeUInt16LE(0x8008, table + 2); ne.writeUInt16LE(1, table + 4); ne.writeUInt16LE(res >> shift, table + 10); ne.writeUInt16LE(len >> shift, table + 12);
    fixture.copy(ne, res);
    assert.equal(F.readFon(ne).glyphs.size, 3);
    assert.equal(F.readFon(Buffer.from('not a font')), null);
});

test('pixels become rectangles and a fixed-cell font advances 6 px per half-width glyph, 12 for a wide one', () => {
    assert.deepEqual(F.rectangles([Uint8Array.from([1, 1, 0]), Uint8Array.from([1, 1, 0]), Uint8Array.from([0, 0, 1])], 3), [[0, 0, 2, 2], [2, 2, 3, 3]]);
    const font = F.readFon(fixture);
    const adv = F.advances(font, 6);
    assert.deepEqual([adv.get(65), adv.get(66), adv.get(64)], [6, 6, 12]);
    // a font with real per-glyph widths keeps them
    const varying = new Map([[65, { width: 5, rows: A.map(r => Uint8Array.from(r.slice(0, 5), c => (c === '#' ? 1 : 0))) }], [66, { width: 4, rows: A.map(() => new Uint8Array(4)) }]]);
    assert.deepEqual([F.advances({ glyphs: varying }, 6).get(65), F.advances({ glyphs: varying }, 6).get(66)], [5, 4]);
});

test('the TrueType file has every required table, a valid checksum and a cmap that finds the glyphs', () => {
    const out = F.convert(fixture, { decode: (c) => String.fromCharCode(c) });
    assert.equal(out.name, 'Fixture');
    assert.equal(out.glyphs, 3);
    const b = Buffer.from(out.ttf);
    assert.equal(b.readUInt32BE(0), 0x10000);
    const n = b.readUInt16BE(4);
    const dir = {};
    for (let i = 0; i < n; i++) { const o = 12 + i * 16; dir[b.toString('latin1', o, o + 4)] = { offset: b.readUInt32BE(o + 8), length: b.readUInt32BE(o + 12) }; }
    assert.deepEqual(Object.keys(dir).sort(), ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']);
    for (const t of Object.values(dir)) assert.ok(t.offset + t.length <= b.length && t.offset % 4 === 0);
    // whole-file checksum comes to 0xB1B0AFBA once head.checksumAdjustment is in
    let sum = 0; for (let i = 0; i < b.length; i += 4) sum = (sum + b.readUInt32BE(i)) >>> 0;
    assert.equal(sum, 0xb1b0afba);
    const upm = b.readUInt16BE(dir.head.offset + 18);
    assert.ok(upm >= 16 && upm % 7 === 0, 'unitsPerEm is a whole multiple of the pixel height, at least 16');
    assert.equal(b.readUInt16BE(dir.maxp.offset + 4), 4, 'notdef plus three glyphs');
    // cmap format 4: '@', 'A', 'B' are consecutive codes and glyphs, one segment; 0xFFFF closes
    const c = dir.cmap.offset + 12;
    assert.equal(b.readUInt16BE(c), 4);
    const segs = b.readUInt16BE(c + 6) / 2;
    const ends = [], starts = [];
    for (let i = 0; i < segs; i++) { ends.push(b.readUInt16BE(c + 14 + i * 2)); starts.push(b.readUInt16BE(c + 16 + segs * 2 + i * 2)); }
    assert.deepEqual(starts, [64, 0xffff]);
    assert.deepEqual(ends, [66, 0xffff]);
    // hmtx: '@' twice the pitch, scaled to font units
    const scale = upm / 7;
    assert.equal(b.readUInt16BE(dir.hmtx.offset + 4), 12 * scale);
    assert.equal(b.readUInt16BE(dir.hmtx.offset + 8), 6 * scale);
});

test('RPG Maker’s untouched Japanese default terms are told from Western text', () => {
    assert.equal(F.isJapaneseDefault('UŒ‚', 'windows-1252'), false, 'two bytes is too short to be sure');
    assert.equal(F.isJapaneseDefault('‚ÌUŒ‚I', 'windows-1252'), true);
    assert.equal(F.isJapaneseDefault('‚Í“¦‚°‚Ä‚µ‚Ü‚Á‚½I', 'windows-1252'), true);
    for (const s of ['Kämpfen', 'Angriff', 'Fähigkeit', 'Ätzend übel', '', 'Attack']) assert.equal(F.isJapaneseDefault(s, 'windows-1252'), false, s);
    assert.equal(F.isJapaneseDefault('‚ÌUŒ‚I', 'shift_jis'), false, 'a Japanese game keeps its Japanese');
});

const deep8Font = path.resolve(__dirname, '..', '..', 'template', 'DEEP 8', 'fonts', 'RM2000.fon');
test('RM2000.fon converts: 13 px, ascent 11, 225 glyphs, A is five columns wide', { skip: !fs.existsSync(deep8Font) }, () => {
    const dec = new TextDecoder('windows-1252');
    const out = F.convert(fs.readFileSync(deep8Font), { decode: (c) => dec.decode(Uint8Array.of(c)) });
    assert.deepEqual([out.name, out.height, out.ascent, out.glyphs], ['RM2000', 13, 11, 225]);
    const font = F.readFon(fs.readFileSync(deep8Font));
    assert.equal(font.glyphs.get(65).rows.map(r => Array.from(r.slice(0, 5)).join('')).slice(1, 4).join('|'), '00100|01010|01010');
    assert.equal(F.advances(font, 6).get(0xc6), 12, 'Æ is a full-width glyph');
});
