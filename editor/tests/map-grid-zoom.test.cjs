/**
 * The tile grid survives zooming out.
 *
 * The grid is a Graphics child of the zoomed container, so a plain width-1
 * stroke lives in world space: at 50% zoom it rasterizes 0.5 device pixels
 * wide and lines alias away. Measured live over CDP on Reactor One before
 * the fix: 24 of 25 expected lines at 100% zoom, then 0, 2, and 0 lines at
 * 50%, 25%, and 12.5%. PIXI 8's pixelLine stroke pins the width to one
 * device pixel through any transform; the same measurement reads the full
 * expected count at every zoom (scratchpad/grid-check.mjs).
 *
 * Checked as source: the aliasing lives in GPU rasterization, which no
 * headless test here stands up.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('the map grid stroke is a pixel line, immune to container zoom', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '..', 'src', 'TilemapManager.js'), 'utf8');
    const drawGrid = source.slice(source.indexOf('drawGrid()'), source.indexOf('setGridVisible'));
    assert.match(drawGrid, /stroke\(\{[^}]*pixelLine: true[^}]*\}\)/);
});
