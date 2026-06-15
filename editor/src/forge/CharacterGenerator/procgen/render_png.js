#!/usr/bin/env node
// Render the REAL composite (body + generated outfit) to a PNG, exactly the
// way the editor's CharacterRenderer does, upscaled, as a 2×2 direction grid.
//
// This is the tool that lets me SEE what the user sees — the letter-grid
// viewer (view_part.js) shows the outfit's letters in isolation, which hides
// how it actually renders in colour, at scale, composited over the body.
//
//   node render_png.js [out.png] [gender] [frame] [style]
//
// Defaults: /tmp/outfit_preview.png, male, frame 1, looseleaf.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CG = path.resolve(__dirname, '..');

// ── Minimal CharacterRenderer environment (matches the editor globals) ────
global.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
const envFiles = ['helpers/pixel.js', 'helpers/palette.js', 'helpers/palette_resolve.js', 'helpers/part_draw.js', 'CharacterRenderer.js'];
let envSrc = envFiles.map(f => fs.readFileSync(path.join(CG, f), 'utf8')).join('\n');
envSrc += '\nglobal.CharacterRenderer=CharacterRenderer;global.RR_CG_drawTemplatePart=RR_CG_drawTemplatePart;' +
          'global.RR_CG_sheetContentBbox=RR_CG_sheetContentBbox;global.RR_CG_canonicalSheetDims=RR_CG_canonicalSheetDims;' +
          'global.RR_CG_resolveTemplatePalette=RR_CG_resolveTemplatePalette;global.pixRect=pixRect;global.pixOutlinePass=pixOutlinePass;';
(0, eval)(envSrc);

const engine = require('./outfit_engine.js');
global.RR_CHARACTER_REGISTRY = [];
function loadPart(f) {
    (new Function('RR_CHARACTER_REGISTRY', 'window', fs.readFileSync(f, 'utf8')))(RR_CHARACTER_REGISTRY, undefined);
    return RR_CHARACTER_REGISTRY[RR_CHARACTER_REGISTRY.length - 1];
}

// ── PNG encoder (zlib + manual CRC) ───────────────────────────────────────
function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
}
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(rgba, W, H) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
    const raw = Buffer.alloc((W * 4 + 1) * H);
    for (let y = 0; y < H; y++) {
        raw[y * (W * 4 + 1)] = 0; // filter none
        rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
    }
    const idat = zlib.deflateSync(raw, { level: 9 });
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))
    ]);
}

// ── Compose a 2×2 grid of the four directions, upscaled, on a dark bg ─────
function main() {
    const outPath = process.argv[2] || '/tmp/outfit_preview.png';
    const gender = process.argv[3] || 'male';
    const frame = process.argv[4] !== undefined ? parseInt(process.argv[4], 10) : 1;
    const style = process.argv[5] || 'looseleaf';
    const SCALE = 4, CELL = 144, PAD = 8;

    const bodyDir = path.join(CG, 'styles', style, 'parts', 'body', gender);
    const bodyFile = fs.readdirSync(bodyDir).filter(f => /-01\.js$/.test(f))[0] || fs.readdirSync(bodyDir).filter(f => f.endsWith('.js'))[0];
    const body = loadPart(path.join(bodyDir, bodyFile));
    const cfg = engine.defaultConfig(style);
    if (process.env.RR_EAR_MODULE && cfg.zones && cfg.zones.head) cfg.zones.head.params.earModule = process.env.RR_EAR_MODULE;
    const result = engine.generateOutfit(cfg, body.template);
    const outfit = {
        id: 'live', category: 'full outfits', template: { palette: result.palette, sheet: result.sheet },
        draw(b, W, H, d, f, p) { RR_CG_drawTemplatePart(b, W, H, d, f, p, this); }
    };
    const bp = { descriptor: body, params: CharacterRenderer.resolveParams(body, { alignX: 'center', alignY: 'middle' }) };
    const op = { descriptor: outfit, params: {} };

    const gridW = (CELL * SCALE + PAD) * 2 + PAD;
    const gridH = (CELL * SCALE + PAD) * 2 + PAD;
    const out = Buffer.alloc(gridW * gridH * 4);
    // dark background
    for (let i = 0; i < gridW * gridH; i++) { out[i*4]=24; out[i*4+1]=28; out[i*4+2]=44; out[i*4+3]=255; }

    for (let d = 0; d < 4; d++) {
        const img = CharacterRenderer.render(CELL, CELL, d, frame, [bp, op]);
        const gx = (d % 2) * (CELL * SCALE + PAD) + PAD;
        const gy = Math.floor(d / 2) * (CELL * SCALE + PAD) + PAD;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
            const si = (y * CELL + x) * 4;
            const a = img.data[si + 3];
            if (!a) continue;
            for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) {
                const px = gx + x * SCALE + sx, py = gy + y * SCALE + sy;
                const di = (py * gridW + px) * 4;
                out[di] = img.data[si]; out[di+1] = img.data[si+1]; out[di+2] = img.data[si+2]; out[di+3] = 255;
            }
        }
    }
    fs.writeFileSync(outPath, encodePNG(out, gridW, gridH));
    console.log('Wrote', outPath, `(${gridW}x${gridH}, ${style}, ${gender}, frame ${frame})`);
}
main();
