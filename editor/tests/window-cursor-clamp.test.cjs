/**
 * The cursor rect is clamped to what is actually on screen, which is not the
 * same band as the window's inner rect once the window has scrolled.
 *
 * `_cursorRect` is in CONTENTS coordinates. The client area that holds the
 * cursor sprite is shifted by -origin (`Window._updateClientArea`,
 * runtime/reactor_core.js), so the visible band of the contents runs from
 * `origin` to `origin + inner`, not from `0` to `inner`.
 *
 * `Window_Scrollable.updateOrigin` (runtime/reactor_windows.js) sets
 * `origin.y = _scrollY % blockHeight`, so origin.y is non-zero precisely when
 * innerHeight is not a whole number of rows. Scrolling to the last row then put
 * that row fully on screen while a clamp against `inner` alone trimmed its
 * highlight to what would have been visible at scroll origin zero — the
 * half-height last-row cursor.
 *
 * The function is pure geometry, so it is extracted and run rather than
 * pattern-matched: a source assertion would still pass if the arithmetic were
 * reverted.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

/** The engine's own Rectangle is a PIXI subclass; only the four fields matter. */
function Rectangle(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
}

/** Extract `_clampedCursorRect` and make it callable against a fake window. */
function clampedCursorRect() {
    const marker = 'Window.prototype._clampedCursorRect = function() {';
    const at = source.indexOf(marker);
    assert.ok(at >= 0, '_clampedCursorRect is present');
    const open = at + marker.length - 1;
    let depth = 0;
    let i = open;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) { i++; break; }
        }
    }
    const body = source.slice(at + marker.length - 'function() {'.length, i);
    // eslint-disable-next-line no-new-func
    return new Function('Rectangle', `return (${body});`)(Rectangle);
}

const clamp = clampedCursorRect();

/** padding 12 either side, so innerHeight is height - 24. */
function windowAt({ cursor, origin = { x: 0, y: 0 }, innerW = 300, innerH = 100 }) {
    return {
        _cursorRect: cursor,
        _padding: 12,
        _width: innerW + 24,
        _height: innerH + 24,
        origin
    };
}

test('an unscrolled window clamps exactly as it always did', () => {
    const rect = clamp.call(windowAt({ cursor: { x: 0, y: 0, width: 300, height: 36 } }));
    assert.deepEqual({ ...rect }, { x: 0, y: 0, width: 300, height: 36 });
});

test('the last row keeps its full height once the window has scrolled', () => {
    // innerHeight 100 is not a whole number of 36px rows, so scrolling to the
    // bottom leaves origin.y = 8. The last row sits at contents y 72 and ends
    // at 108 — fully visible, because the band runs 8..108.
    const rect = clamp.call(windowAt({
        cursor: { x: 0, y: 72, width: 300, height: 36 },
        origin: { x: 0, y: 8 }
    }));
    assert.equal(rect.height, 36, 'the highlight covers the whole row');
    assert.equal(rect.y, 72);

    // What the old clamp produced: min(36, innerH - y) = min(36, 28) = 28.
    assert.notEqual(rect.height, 28, 'not trimmed to the scroll-origin-zero band');
});

test('a rect running past the visible band is still clipped', () => {
    // The clamp exists because plugins set cursor rects that extend past the
    // window and rely on it clipping rather than bleeding outside.
    const rect = clamp.call(windowAt({
        cursor: { x: 0, y: 72, width: 300, height: 400 },
        origin: { x: 0, y: 8 }
    }));
    assert.equal(rect.height, 36, 'clipped at origin + inner, i.e. 108');
});

test('a rect starting above the visible band is clipped from the top', () => {
    const rect = clamp.call(windowAt({
        cursor: { x: 0, y: 0, width: 300, height: 20 },
        origin: { x: 0, y: 8 }
    }));
    assert.equal(rect.y, 8, 'starts at the top of the visible band');
    assert.equal(rect.height, 12, 'and loses only the part scrolled out of view');
});

test('a rect entirely out of view collapses to zero rather than going negative', () => {
    const rect = clamp.call(windowAt({
        cursor: { x: 0, y: 400, width: 300, height: 36 },
        origin: { x: 0, y: 8 }
    }));
    assert.equal(rect.height, 0);
    assert.ok(rect.width >= 0);
});

test('horizontal scrolling clamps on x the same way', () => {
    const rect = clamp.call(windowAt({
        cursor: { x: 220, y: 0, width: 100, height: 36 },
        origin: { x: 20, y: 0 },
        innerW: 300
    }));
    assert.equal(rect.x, 220);
    assert.equal(rect.width, 100, 'the band runs 20..320, so 220..320 fits');
});

test('a window with no origin is treated as unscrolled rather than throwing', () => {
    const window = windowAt({ cursor: { x: 0, y: 0, width: 300, height: 36 } });
    window.origin = null;
    const rect = clamp.call(window);
    assert.deepEqual({ ...rect }, { x: 0, y: 0, width: 300, height: 36 });
});
