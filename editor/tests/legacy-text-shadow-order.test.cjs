'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Font = require('../src/legacy/LegacyFont.js');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const source = runtimeSource('reactor_core.js');
function pick(name) {
    const start = source.indexOf(name + ' = function');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n};', start) + 3);
}
function renderFixture(font) {
    const width = 160, height = 20, pixels = new Uint8ClampedArray(width * height * 4);
    const paint = color => ({ key: color.join(','), data: new Uint8ClampedArray(Array.from({ length: 256 }, () => [...color, 255]).flat()) });
    const body = paint([255, 255, 255]), shadow = paint([0, 0, 0]);
    class Canvas {
        constructor() { this.width = 0; this.height = 0; this.pixels = null; }
        getContext() {
            return {
                fillText: (text, x, baseline) => {
                    this.pixels = new Uint8ClampedArray(this.width * this.height * 4);
                    for (const [n, ch] of [...text].entries()) {
                        const glyph = font.glyphs.get(ch.charCodeAt(0));
                        for (let y = 0; y < glyph.rows.length; y++) for (let col = 0; col < glyph.rows[y].length; col++) {
                            if (glyph.rows[y][col]) this.pixels.set([255, 255, 255, 255], ((baseline - font.ascent + y) * this.width + x + n * 6 + col) * 4);
                        }
                    }
                },
                getImageData: () => ({ data: new Uint8ClampedArray(this.pixels) }),
                putImageData: image => { this.pixels = new Uint8ClampedArray(image.data); }
            };
        }
    }
    const stack = [], context = {
        globalAlpha: 1, textAlign: 'left', measureText: text => ({ width: [...String(text)].length * 6 }),
        save() { stack.push({ globalAlpha: this.globalAlpha, textAlign: this.textAlign }); },
        restore() { Object.assign(this, stack.pop()); },
        drawImage(canvas, dx, dy) {
            for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                const from = (y * canvas.width + x) * 4, tx = x + dx, ty = y + dy;
                if (!canvas.pixels[from + 3] || tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
                const to = (ty * width + tx) * 4;
                pixels.set(canvas.pixels.subarray(from, from + 4), to);
            }
        }
    };
    function Bitmap() {}
    Bitmap.fixedFontSize = () => font.height;
    Bitmap.legacyFontInfo = () => ({ height: font.height, ascent: font.ascent });
    Bitmap.pixelText = () => true;
    Bitmap.textShadow = () => true;
    const sandbox = { Bitmap, ColorManager: { legacyTextPaint: n => n === 20 ? shadow : body }, document: { fonts: { check: () => true }, createElement: () => new Canvas() } };
    vm.runInNewContext(['Bitmap.prototype.drawText', 'Bitmap.paintLegacyGlyph', 'Bitmap.prototype._drawLegacyPaletteRun', 'Bitmap.prototype._drawLegacyPaletteText'].map(pick).join('\n'), sandbox);
    const bitmap = Object.assign(new Bitmap(), {
        width, fontSize: font.height, outlineWidth: 1, textColor: '#ffffff', outlineColor: '#000000',
        _rrLegacyPaletteIndex: 0, _rrLegacyPaletteCss: '#ffffff', _rrLegacyPaletteShadow: true, _rrLegacyShadowCss: '#000000',
        _drawingContext: () => context, _makeFontNameText: () => font.height + 'px ' + font.face,
        _drawTextOutline(text, x, y) { this._drawLegacyPaletteText(text, x + 1, y + 1, shadow, true); },
        _drawTextBody(text, x, y) { this._drawLegacyPaletteText(text, x, y, body, false); },
        _touchUpload() {}, _baseTexture: { update() {} }
    });
    return { bitmap, Bitmap, context, pixels, width, height };
}
function nativeGlyphwise(font, text, width, height) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (const [n, ch] of [...text].entries()) {
        const glyph = font.glyphs.get(ch.charCodeAt(0));
        for (const shadow of [true, false]) for (let y = 0; y < glyph.rows.length; y++) for (let x = 0; x < glyph.rows[y].length; x++) {
            if (!glyph.rows[y][x]) continue;
            const at = ((2 + y + Number(shadow)) * width + 8 + n * 6 + x + Number(shadow)) * 4;
            data.set(shadow ? [0, 0, 0, 255] : [255, 255, 255, 255], at);
        }
    }
    return data;
}
// Mandatory fixture: previous batching lets the first overhang cover the next glyph's shadow.
const synthetic = { face: 'Overhang', height: 13, ascent: 11, glyphs: new Map([
    ['A'.charCodeAt(0), { rows: Array.from({ length: 13 }, (_, y) => Uint8Array.from({ length: 8 }, (_, x) => Number(y === 2 && x === 7))) }],
    ['B'.charCodeAt(0), { rows: Array.from({ length: 13 }, (_, y) => Uint8Array.from({ length: 5 }, (_, x) => Number(y === 1 && x === 0))) }]
]) };
const fonts = [{ font: synthetic, text: 'ABAB' }];
for (const face of ['RMG2000', 'RM2000']) {
    const file = path.resolve(__dirname, '../../template/DEEP 8/fonts', face + '.fon');
    if (fs.existsSync(file)) fonts.push({ font: Font.readFon(fs.readFileSync(file)), text: '%@&%@&' });
}
for (const { font, text } of fonts) test(font.face + ' shadow and overhanging ink match native order for whole and characterwise runs', () => {
    const whole = renderFixture(font), chars = renderFixture(font), previousBatch = renderFixture(font);
    whole.bitmap.drawText(text, 8, 0, 140, 16);
    [...text].forEach((ch, i) => chars.bitmap.drawText(ch, 8 + i * 6, 0, 6, 16));
    const expected = nativeGlyphwise(font, text, whole.width, whole.height);
    assert.deepEqual(whole.pixels, expected);
    assert.deepEqual(chars.pixels, expected);
    previousBatch.bitmap._drawLegacyPaletteRun = () => false;
    previousBatch.bitmap.drawText(text, 8, 0, 140, 16);
    assert.notDeepEqual(previousBatch.pixels, expected, "negative control exposes the previous shadow-first batching defect");
    assert.equal(whole.context.globalAlpha, 1, 'drawing context restored');
});
test('glyphwise run leaves smoothing, custom CSS, disabled shadows and outlines on their existing paths', () => {
    const f = renderFixture(synthetic), b = f.bitmap;
    f.Bitmap.pixelText = () => false;
    assert.equal(b._drawLegacyPaletteRun('AB', 8, 13), false);
    f.Bitmap.pixelText = () => true;
    f.Bitmap.fixedFontSize = () => 0;
    assert.equal(b._drawLegacyPaletteRun('AB', 8, 13), false);
    f.Bitmap.fixedFontSize = () => 13;
    for (const [key, value] of [['textColor', '#ff00ff'], ['outlineColor', '#ff0000'], ['outlineWidth', 0], ['_rrLegacyPaletteShadow', false]]) {
        const original = b[key]; b[key] = value;
        assert.equal(b._drawLegacyPaletteRun('AB', 8, 13), false, key);
        b[key] = original;
    }
    f.Bitmap.textShadow = () => false;
    assert.equal(b._drawLegacyPaletteRun('AB', 8, 13), false);
    assert.ok(f.pixels.every(v => v === 0));
});
