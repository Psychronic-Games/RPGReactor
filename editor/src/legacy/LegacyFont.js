/**
 * LegacyFont - the RPG Maker 2000/2003 game font (RM2000.fon / RMG2000.fon,
 * Windows bitmap fonts in an NE executable) becomes a TrueType file whose
 * glyphs are the pixels themselves, so text drawn at the font's pixel size
 * lands on the same dots the old engine put on screen.
 *
 * readFon(bytes)       → { face, height, ascent, glyphs: Map<code, { width, rows }> }
 * toTrueType(font, cp) → Uint8Array of a .ttf (cp: code page decoder for glyph codes)
 * convert(bytes, opts) → { name, ttf, glyphs, height } or null
 *
 * Pure: runs in the editor, the import worker and Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.RRLegacyFont = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ---- Windows FNT ------------------------------------------------------

    function u16(b, o) { return b[o] | (b[o + 1] << 8); }
    function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
    function cstr(b, o, max) { let s = ''; for (let i = 0; i < max && b[o + i]; i++) s += String.fromCharCode(b[o + i]); return s; }

    /** Every FNT resource in an NE .fon file, or the bytes themselves when they already are one. */
    function fontResources(b) {
        if (b[0] === 0x4d && b[1] === 0x5a) {
            const ne = u16(b, 0x3c);
            if (b[ne] !== 0x4e || b[ne + 1] !== 0x45) return [];
            const table = ne + u16(b, ne + 0x24);
            const shift = u16(b, table);
            const out = [];
            let p = table + 2;
            for (;;) {
                const type = u16(b, p);
                if (!type) break;
                const count = u16(b, p + 2);
                p += 8;
                for (let i = 0; i < count; i++, p += 12) {
                    if (type !== 0x8008) continue;
                    const off = u16(b, p) << shift, len = u16(b, p + 2) << shift;
                    out.push(b.subarray(off, off + len));
                }
            }
            return out;
        }
        const version = u16(b, 0);
        return version === 0x200 || version === 0x300 ? [b] : [];
    }

    /** One FNT resource (version 2 or 3) as glyph bitmaps: rows of 0/1 per glyph. */
    function readFnt(f) {
        const version = u16(f, 0);
        if (version !== 0x200 && version !== 0x300) return null;
        const height = u16(f, 88), ascent = u16(f, 74);
        const first = f[95], last = f[96];
        const faceOffset = u32(f, 105);
        const face = faceOffset && faceOffset < f.length ? cstr(f, faceOffset, 64) : '';
        const entrySize = version === 0x300 ? 6 : 4;
        const tableStart = version === 0x300 ? 148 : 118;
        const glyphs = new Map();
        for (let code = first; code <= last; code++) {
            const e = tableStart + (code - first) * entrySize;
            const width = u16(f, e);
            const offset = version === 0x300 ? u32(f, e + 2) : u16(f, e + 2);
            if (!width) continue;
            const bands = Math.ceil(width / 8);
            const rows = [];
            for (let y = 0; y < height; y++) {
                const row = new Uint8Array(width);
                for (let band = 0; band < bands; band++) {
                    const byte = f[offset + band * height + y] || 0;
                    for (let bit = 0; bit < 8; bit++) { const x = band * 8 + bit; if (x < width) row[x] = (byte >> (7 - bit)) & 1; }
                }
                rows.push(row);
            }
            glyphs.set(code, { width, rows });
        }
        return { face, height, ascent, first, last, glyphs };
    }

    function readFon(bytes) {
        const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (const res of fontResources(b)) { const f = readFnt(res); if (f && f.glyphs.size) return f; }
        return null;
    }

    // ---- glyph outlines ---------------------------------------------------

    /** Rectangles covering the set pixels: maximal horizontal runs merged downward while identical. */
    function rectangles(rows, width) {
        const rects = [];
        const taken = rows.map(() => new Uint8Array(width));
        for (let y = 0; y < rows.length; y++) {
            for (let x = 0; x < width; x++) {
                if (!rows[y][x] || taken[y][x]) continue;
                let x2 = x; while (x2 + 1 < width && rows[y][x2 + 1] && !taken[y][x2 + 1]) x2++;
                let y2 = y;
                for (;;) {
                    const ny = y2 + 1;
                    if (ny >= rows.length) break;
                    let same = true;
                    for (let i = x; i <= x2; i++) if (!rows[ny][i] || taken[ny][i]) { same = false; break; }
                    if (!same || (x > 0 && rows[ny][x - 1] && !taken[ny][x - 1]) || (x2 + 1 < width && rows[ny][x2 + 1] && !taken[ny][x2 + 1])) break;
                    y2 = ny;
                }
                for (let yy = y; yy <= y2; yy++) for (let i = x; i <= x2; i++) taken[yy][i] = 1;
                rects.push([x, y, x2 + 1, y2 + 1]);
            }
        }
        return rects;
    }

    // ---- TrueType writer --------------------------------------------------

    class Writer {
        constructor() { this.parts = []; this.length = 0; }
        u8(v) { this.parts.push(Uint8Array.of(v & 255)); this.length += 1; }
        u16(v) { this.parts.push(Uint8Array.of((v >> 8) & 255, v & 255)); this.length += 2; }
        i16(v) { this.u16(v < 0 ? v + 65536 : v); }
        u32(v) { this.parts.push(Uint8Array.of((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255)); this.length += 4; }
        i64(v) { this.u32(0); this.u32(v >>> 0); }
        tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); }
        bytes(a) { this.parts.push(a); this.length += a.length; }
        pad4() { while (this.length % 4) this.u8(0); }
        done() { const out = new Uint8Array(this.length); let o = 0; for (const p of this.parts) { out.set(p, o); o += p.length; } return out; }
    }

    function checksum(bytes) {
        let sum = 0;
        for (let i = 0; i < bytes.length; i += 4) sum = (sum + (((bytes[i] << 24) | ((bytes[i + 1] || 0) << 16) | ((bytes[i + 2] || 0) << 8) | (bytes[i + 3] || 0)) >>> 0)) >>> 0;
        return sum;
    }

    function glyphOutline(glyph, ascent, scale) {
        const rects = rectangles(glyph.rows, glyph.width);
        if (!rects.length) return null;
        const w = new Writer();
        const contours = rects.map(r => ({ x0: r[0] * scale, y0: (ascent - r[3]) * scale, x1: r[2] * scale, y1: (ascent - r[1]) * scale }));
        const xMin = Math.min(...contours.map(c => c.x0)), xMax = Math.max(...contours.map(c => c.x1));
        const yMin = Math.min(...contours.map(c => c.y0)), yMax = Math.max(...contours.map(c => c.y1));
        w.i16(contours.length); w.i16(xMin); w.i16(yMin); w.i16(xMax); w.i16(yMax);
        for (let i = 0; i < contours.length; i++) w.u16(i * 4 + 3);
        w.u16(0);   // no instructions
        for (let i = 0; i < contours.length; i++) w.u8(1);   // every point on-curve, coordinates as 16-bit
        for (let i = 0; i < contours.length; i++) for (let k = 0; k < 3; k++) w.u8(1);
        let px = 0, py = 0;
        const points = [];
        for (const c of contours) points.push([c.x0, c.y0], [c.x0, c.y1], [c.x1, c.y1], [c.x1, c.y0]);   // clockwise: TrueType's filled direction
        for (const [x] of points) { w.i16(x - px); px = x; }
        for (const [, y] of points) { w.i16(y - py); py = y; }
        w.pad4();
        return { bytes: w.done(), points: points.length, contours: contours.length, xMin, xMax, yMin, yMax };
    }

    function nameRecords(strings) {
        const w = new Writer();
        const encoded = strings.map(([id, s]) => { const b = []; for (const ch of s) { const c = ch.charCodeAt(0); b.push((c >> 8) & 255, c & 255); } return [id, Uint8Array.from(b)]; });
        w.u16(0); w.u16(encoded.length); w.u16(6 + encoded.length * 12);
        let offset = 0;
        for (const [id, b] of encoded) { w.u16(3); w.u16(1); w.u16(0x409); w.u16(id); w.u16(b.length); w.u16(offset); offset += b.length; }
        for (const [, b] of encoded) w.bytes(b);
        return w.done();
    }

    function cmapFormat4(codeToGlyph) {
        const codes = Array.from(codeToGlyph.keys()).sort((a, b) => a - b);
        const segments = [];
        for (const c of codes) {
            const last = segments[segments.length - 1];
            if (last && last.end === c - 1 && codeToGlyph.get(c) === last.delta + c) last.end = c;
            else segments.push({ start: c, end: c, delta: codeToGlyph.get(c) - c });
        }
        segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
        const n = segments.length;
        const searchRange = 2 * Math.pow(2, Math.floor(Math.log2(n)));
        const w = new Writer();
        w.u16(0); w.u16(1); w.u16(3); w.u16(1); w.u32(12);   // one subtable: Windows Unicode BMP
        const length = 16 + n * 8;
        w.u16(4); w.u16(length); w.u16(0); w.u16(n * 2); w.u16(searchRange); w.u16(Math.log2(searchRange / 2)); w.u16(n * 2 - searchRange);
        for (const s of segments) w.u16(s.end);
        w.u16(0);
        for (const s of segments) w.u16(s.start);
        for (const s of segments) w.i16(((s.delta % 65536) + 65536) % 65536 > 32767 ? ((s.delta % 65536) + 65536) % 65536 - 65536 : ((s.delta % 65536) + 65536) % 65536);
        for (let i = 0; i < n; i++) w.u16(0);
        return w.done();
    }

    /**
     * A TrueType font at one unit per pixel: unitsPerEm = pixel height, so a
     * font size equal to the bitmap height reproduces the bitmap.
     */
    /**
     * The advance of each glyph. RPG Maker's fonts store every glyph in one
     * wide cell and the engine draws half-width characters 6 px apart and
     * full-width ones 12 px apart; a font with real per-glyph widths keeps them.
     */
    function advances(font, pitch) {
        const widths = new Set(Array.from(font.glyphs.values(), g => g.width));
        const fixedCell = widths.size === 1;
        const out = new Map();
        for (const [code, g] of font.glyphs) {
            let ink = 0;
            for (const row of g.rows) for (let x = row.length - 1; x >= ink; x--) if (row[x]) { ink = x + 1; break; }
            out.set(code, fixedCell ? (ink > pitch ? pitch * 2 : pitch) : g.width);
        }
        return out;
    }

    function toTrueType(font, decode, name, options = {}) {
        const advance = advances(font, options.pitch || 6);
        // FreeType refuses unitsPerEm under 16, so a pixel is `scale` units; at a font size of `height` px it is still one pixel.
        const scale = Math.max(1, Math.ceil(64 / font.height));
        const upm = font.height * scale;
        const ascent = font.ascent * scale, descent = (font.height - font.ascent) * scale;
        // glyph 0: .notdef (empty), then one glyph per distinct Unicode code point
        const glyphs = [{ outline: null, advance: 0 }];
        const codeToGlyph = new Map();
        for (const [code, g] of font.glyphs) {
            const ch = decode(code);
            if (ch === undefined || ch === null || ch === '' || codeToGlyph.has(ch.codePointAt(0))) continue;
            codeToGlyph.set(ch.codePointAt(0), glyphs.length);
            glyphs.push({ outline: glyphOutline(g, font.ascent, scale), advance: advance.get(code) * scale });
        }
        const glyf = new Writer(); const loca = [];
        let maxPoints = 0, maxContours = 0, xMin = 0, yMin = 0, xMax = 0, yMax = 0;
        for (const g of glyphs) {
            loca.push(glyf.length);
            if (g.outline) {
                glyf.bytes(g.outline.bytes);
                maxPoints = Math.max(maxPoints, g.outline.points); maxContours = Math.max(maxContours, g.outline.contours);
                xMin = Math.min(xMin, g.outline.xMin); yMin = Math.min(yMin, g.outline.yMin); xMax = Math.max(xMax, g.outline.xMax); yMax = Math.max(yMax, g.outline.yMax);
            }
        }
        loca.push(glyf.length);
        const tables = {};
        const t = (tag, fn) => { const w = new Writer(); fn(w); w.pad4(); tables[tag] = w.done(); };
        t('head', w => { w.u32(0x10000); w.u32(0x10000); w.u32(0); w.u32(0x5f0f3cf5); w.u16(0); w.u16(upm); w.i64(0); w.i64(0); w.i16(xMin); w.i16(yMin); w.i16(xMax); w.i16(yMax); w.u16(0); w.u16(upm); w.i16(2); w.i16(1); w.i16(0); });
        t('hhea', w => { w.u32(0x10000); w.i16(ascent); w.i16(-descent); w.i16(0); w.u16(Math.max(...glyphs.map(g => g.advance))); w.i16(0); w.i16(0); w.i16(xMax); w.i16(1); w.i16(0); w.i16(0); w.i16(0); w.i16(0); w.i16(0); w.i16(0); w.i16(0); w.u16(glyphs.length); });
        t('maxp', w => { w.u32(0x10000); w.u16(glyphs.length); w.u16(maxPoints); w.u16(maxContours); w.u16(0); w.u16(0); w.u16(1); w.u16(0); w.u16(0); w.u16(0); w.u16(0); w.u16(0); w.u16(0); w.u16(0); w.u16(0); });
        t('OS/2', w => {
            w.u16(4); w.i16(Math.round(glyphs.reduce((a, g) => a + g.advance, 0) / glyphs.length)); w.u16(400); w.u16(5); w.u16(0);
            for (let i = 0; i < 10; i++) w.i16(0);   // subscript/superscript/strikeout sizes and positions
            w.i16(0);   // family class
            for (let i = 0; i < 10; i++) w.u8(0);   // panose
            w.u32(3); w.u32(0); w.u32(0); w.u32(0);   // Unicode ranges: Basic Latin + Latin-1
            w.tag('RRct'); w.u16(0x40); w.u16(Math.min(...codeToGlyph.keys())); w.u16(Math.max(...codeToGlyph.keys()));
            w.i16(ascent); w.i16(-descent); w.i16(0); w.u16(ascent); w.u16(descent);
            w.u32(1); w.u32(0);   // code page ranges: Latin 1
            w.i16(ascent); w.i16(ascent); w.u16(0); w.u16(0); w.u16(0);
        });
        t('hmtx', w => { for (const g of glyphs) { w.u16(g.advance); w.i16(g.outline ? g.outline.xMin : 0); } });
        t('cmap', w => w.bytes(cmapFormat4(codeToGlyph)));
        t('loca', w => { for (const o of loca) w.u32(o); });
        t('glyf', w => w.bytes(glyf.done()));
        t('name', w => w.bytes(nameRecords([[1, name], [2, 'Regular'], [3, name + ' pixel'], [4, name], [5, 'Version 1.0'], [6, name.replace(/[^A-Za-z0-9]/g, '')]])));
        t('post', w => { w.u32(0x30000); w.u32(0); w.i16(-descent); w.i16(0); w.u32(1); w.u32(0); w.u32(0); w.u32(0); w.u32(0); });

        const tags = Object.keys(tables).sort();
        const header = new Writer();
        const n = tags.length, searchRange = 16 * Math.pow(2, Math.floor(Math.log2(n)));
        header.u32(0x10000); header.u16(n); header.u16(searchRange); header.u16(Math.log2(searchRange / 16)); header.u16(n * 16 - searchRange);
        let offset = 12 + n * 16;
        const offsets = {};
        for (const tag of tags) { offsets[tag] = offset; header.tag(tag); header.u32(checksum(tables[tag])); header.u32(offset); header.u32(tables[tag].length); offset += tables[tag].length; }
        const out = new Writer();
        out.bytes(header.done());
        for (const tag of tags) out.bytes(tables[tag]);
        const file = out.done();
        const adjust = (0xb1b0afba - checksum(file)) >>> 0;
        const at = offsets.head + 8;
        file[at] = adjust >>> 24; file[at + 1] = (adjust >> 16) & 255; file[at + 2] = (adjust >> 8) & 255; file[at + 3] = adjust & 255;
        return file;
    }

    /** A .fon's bytes → { name, ttf, height, glyphs } with codes read through the project's code page. */
    function convert(bytes, options = {}) {
        const font = readFon(bytes);
        if (!font) return null;
        const decoder = options.decode || ((code) => String.fromCharCode(code));
        const name = options.name || font.face || 'GameFont';
        return { name, height: font.height, ascent: font.ascent, glyphs: font.glyphs.size, ttf: toTrueType(font, decoder, name, options) };
    }

    /** Whether a string is RPG Maker's untouched Japanese default read through a Western code page (mojibake the game never shows). */
    function isJapaneseDefault(s, encoding) {
        if (!s || typeof TextDecoder === 'undefined' || (encoding && !/1252|latin/i.test(encoding))) return false;
        let high = 0;
        for (const ch of s) if (ch.charCodeAt(0) >= 0x80) high++;
        if (high < s.length / 2) return false;
        try {
            const bytes = new Uint8Array(Array.from(s, ch => encode1252(ch)));
            if (bytes.some(b => b === 0xff)) return false;
            const jp = new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
            let kana = 0;
            for (const ch of jp) { const c = ch.charCodeAt(0); if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff)) kana++; }
            return kana >= Math.max(2, jp.length / 2);
        } catch (_) { return false; }
    }
    let cp1252;
    function encode1252(ch) {
        if (!cp1252) { cp1252 = new Map(); const d = new TextDecoder('windows-1252'); for (let b = 0; b < 256; b++) cp1252.set(d.decode(Uint8Array.of(b)), b); }
        return cp1252.has(ch) ? cp1252.get(ch) : 0xff;
    }

    return { readFon, readFnt, rectangles, advances, toTrueType, convert, cmapFormat4, isJapaneseDefault };
});
