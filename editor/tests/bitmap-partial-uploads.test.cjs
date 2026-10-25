const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const core = runtimeSource('reactor_core.js');

// The runtime Bitmap over a recording 2D context: what each draw op names as
// the area it changed (Bitmap._touchUpload), read off its texture source.
function loadBitmap() {
    const start = core.indexOf('function Bitmap() {');
    const end = core.indexOf('\nfunction ', start + 20);
    const context = { console, Math, Number, String, Array, Object, Error, Uint8Array, Promise, $dataSystem: null };
    vm.createContext(context);
    vm.runInContext('Number.prototype.clamp = function(a, b) { return Math.min(Math.max(this, a), b); };', context);
    vm.runInContext(core.slice(start, end > start ? end : undefined) + '\nthis.Bitmap = Bitmap;', context);
    return context.Bitmap;
}

function canvasBitmap(Bitmap, width = 400, height = 200) {
    const drawn = [];
    const ctx = new Proxy({ lineWidth: 1, globalAlpha: 1, measureText: text => ({ width: text.length * 10 }),
        createLinearGradient: () => ({ addColorStop() {} }) }, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => drawn.push([key, ...args]);
        }
    });
    const bitmap = Object.create(Bitmap.prototype);
    Object.assign(bitmap, {
        _canvas: { width, height }, _context: ctx, _image: null, _paintOpacity: 255,
        fontFace: 'sans-serif', fontSize: 24, fontBold: false, fontItalic: false,
        textColor: '#ffffff', outlineColor: 'rgba(0, 0, 0, 0.6)', outlineWidth: 3
    });
    Object.defineProperty(bitmap, 'width', { value: width });
    Object.defineProperty(bitmap, 'height', { value: height });
    const source = {};
    let updates = 0;
    bitmap._baseTexture = { source, update() { updates++; source.__lastTouch = source.__rrTouch ?
        [source.__rrTouchX0, source.__rrTouchY0, source.__rrTouchX1, source.__rrTouchY1] : null; source.__rrTouch = false; } };
    return { bitmap, source, drawn, updates: () => updates };
}

test('each draw op names the area it changed', () => {
    const Bitmap = loadBitmap();
    const { bitmap, source } = canvasBitmap(Bitmap);
    bitmap.fillRect(10, 20, 30, 40, '#fff');
    assert.deepEqual(source.__lastTouch, [10, 20, 40, 60]);
    bitmap.clearRect(5.5, 6.5, 10, 10);
    assert.deepEqual(source.__lastTouch, [5, 6, 16, 17], 'rounded outward');
    bitmap.fillRect(50, 50, -10, -10, '#fff');
    assert.deepEqual(source.__lastTouch, [40, 40, 50, 50], 'a negative size covers the same pixels');
    bitmap.strokeRect(10, 10, 20, 20, '#fff');
    assert.deepEqual(source.__lastTouch, [8, 8, 32, 32], 'the stroke straddles the edge');
    bitmap.drawCircle(100, 100, 10, '#fff');
    assert.deepEqual(source.__lastTouch, [89, 89, 111, 111]);
    bitmap.gradientFillRect(0, 0, 50, 5, '#000', '#fff', false);
    assert.deepEqual(source.__lastTouch, [0, 0, 50, 5]);
    const other = canvasBitmap(Bitmap).bitmap;
    bitmap.blt(other, 0, 0, 16, 16, 30, 40);
    assert.deepEqual(source.__lastTouch, [30, 40, 46, 56]);
});

test('drawn text names a band that holds its glyphs, outline and all', () => {
    const Bitmap = loadBitmap();
    const { bitmap, source } = canvasBitmap(Bitmap);
    bitmap.drawText('Hello', 40, 36, 60, 36, 'left');
    const [x0, y0, x1, y1] = source.__lastTouch;
    // Baseline at y + lineHeight / 2 + fontSize * 0.35; ascent and descent around it.
    const baseline = Math.round(36 + 18 + 24 * 0.35);
    assert.ok(x0 <= 40 - 3 && x1 >= 100 + 3, `horizontal ${x0}..${x1}`);
    assert.ok(y0 <= baseline - 24 - 3 && y1 >= baseline + 24 * 0.3 + 3, `vertical ${y0}..${y1}`);
    assert.ok(x1 - x0 < 200 && y1 - y0 < 100, 'and stays a band, not the canvas');
    bitmap.drawText('Unbounded', 40, 36);
    assert.deepEqual([source.__lastTouch[0], source.__lastTouch[2]], [0, 400], 'no width given: the whole row');
});

test('handing out the canvas or context makes every later upload whole', () => {
    const Bitmap = loadBitmap();
    const { bitmap, source } = canvasBitmap(Bitmap);
    bitmap.measureTextWidth('abc');
    bitmap.paintOpacity = 128;
    bitmap.fillRect(0, 0, 4, 4, '#fff');
    assert.ok(source.__lastTouch, 'its own measuring and opacity keep partial uploads');
    void bitmap.context;
    bitmap.fillRect(0, 0, 4, 4, '#fff');
    assert.equal(source.__lastTouch, null, 'a plugin may draw with it unseen');
    const second = canvasBitmap(Bitmap);
    void second.bitmap.canvas;
    second.bitmap.fillRect(0, 0, 4, 4, '#fff');
    assert.equal(second.source.__lastTouch, null);
    const third = canvasBitmap(Bitmap);
    Bitmap.partialUploads = false;
    third.bitmap.fillRect(0, 0, 4, 4, '#fff');
    assert.equal(third.source.__lastTouch, null, 'switch off');
});
