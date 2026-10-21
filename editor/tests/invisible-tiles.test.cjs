'use strict';
// Blank tiles leave the 3D draw: a triangle whose sample rectangle (every texel
// filtering reaches) is all alpha 0 is dropped from the index at build time.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Reactor3D = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js'));
const T = Reactor3D.InvisibleTiles;

// An 8x4 sheet: the left 4x4 is transparent, the right 4x4 has one pixel at (6, 1).
function sheet(opaque) {
    const width = 8, height = 4, sums = new Int32Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
        let row = 0;
        for (let x = 0; x < width; x++) {
            if (opaque.some(([ox, oy]) => ox === x && oy === y)) row++;
            sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
        }
    }
    return { src: 's', width, height, sums };
}
// A quad sampling texels [x0, x1) x [y0, y1) of an 8x4 sheet, in uvBounds form (v up).
const quadBounds = (x0, y0, x1, y1) => { const b = [x0 / 8, 1 - y1 / 4, x1 / 8, 1 - y0 / 4]; return [...b, ...b, ...b, ...b]; };

test('a quad over transparent pixels leaves the index; one with any pixel stays', () => {
    const saved = T.table;
    try {
        T.table = () => sheet([[6, 1]]);
        const bounds = Float32Array.from([...quadBounds(0.5, 0.5, 2.5, 2.5), ...quadBounds(4.5, 0.5, 7.5, 3.5)]);
        const indices = Uint16Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
        const kept = T.cull(indices, bounds, {});
        assert.deepEqual(Array.from(kept), [4, 5, 6, 4, 6, 7]);
        assert.ok(kept instanceof Uint16Array, 'the index keeps its width');
        T.table = () => sheet([[3, 1], [6, 1]]);
        assert.deepEqual(Array.from(T.cull(indices, bounds, {})), [4, 5, 6, 4, 6, 7], 'samples clamped to texel centres never reach the next texel');
        const offCentre = Float32Array.from([...quadBounds(0.5, 0.5, 2.75, 2.5), ...quadBounds(4.5, 0.5, 7.5, 3.5)]);
        assert.equal(T.cull(indices, offCentre, {}), indices, 'a sample between centres filters in the next texel, which has a pixel');
        T.table = () => null;
        assert.equal(T.cull(indices, bounds, {}), indices, 'a sheet that cannot be read draws everything');
        T.enabled = false; T.table = () => sheet([]);
        assert.equal(T.cull(indices, bounds, {}), indices, 'the kill switch');
    } finally { T.table = saved; T.enabled = true; }
});

test('only unchanging image sheets are trusted: a drawn-on canvas or an animated image is not', () => {
    assert.equal(T.table({ _image: { tagName: 'IMG', complete: true, naturalWidth: 8, naturalHeight: 4 }, _canvas: {} }), null);
    assert.equal(T.table({ _image: { tagName: 'IMG', complete: true, naturalWidth: 8, naturalHeight: 4 }, _animatedImage: {} }), null);
    assert.equal(T.table({ _image: { tagName: 'CANVAS', width: 8, height: 4 } }), null);
    assert.equal(T.table({ _image: { tagName: 'IMG', complete: false } }), null);
});

test('the editor keeps every quad: it picks cells by raycasting them', () => {
    const saved = T.table; global.window = { reactor: { projectController: {} } };
    try {
        T.table = () => sheet([]);
        const indices = Uint16Array.from([0, 1, 2]);
        assert.equal(T.cull(indices, Float32Array.from(quadBounds(0, 0, 2, 2)), {}), indices);
    } finally { T.table = saved; delete global.window; }
});

test('animated tile groups are never culled at build (their frames sample other pixels)', () => {
    const source = require('node:fs').readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /group\.anim \? group\.indices : Reactor3D\.InvisibleTiles\.cull\(group\.indices, group\.bounds, bitmaps && bitmaps\[group\.setNumber\]\)/);
});
