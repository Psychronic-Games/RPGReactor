/**
 * Where a window's client area gets clipped, and in whose coordinates.
 *
 * Every MZ window puts its contents inside a `_clientArea` carrying an
 * AlphaFilter, and hands the filter a rectangle so a scrolling list is clipped
 * to the inside of the window instead of spilling over the border. Through
 * v5/v6/v7 that rectangle was screen-space and the FilterSystem used it as
 * given. v8 reads it as container-LOCAL and applies the container's world
 * transform itself:
 *
 *     bounds.addRect(filterEffect.filterArea);
 *     bounds.applyMatrix(container.worldTransform);
 *
 * Give v8 the screen-space rect and it transforms it a second time. The region
 * it captures lands about twice as far from the origin as the window, so for
 * any window past the middle of the screen it falls off the edge and the filter
 * resolves to nothing. Everything inside the client area disappears — the
 * contents, the cursor, the scroll arrows — while the panel and border, which
 * are not in the client area, keep drawing. The window renders as an empty box,
 * with no error and nothing in the display tree measuring wrong.
 *
 * That is not a hypothetical: it is what emptied a title screen's command list
 * under a plugin that reimplements _updateFilterArea.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

/** A named `Window.prototype.<method> = function ... };` lifted out of the corescript. */
function windowMethod(name, context) {
    const head = `Window.prototype.${name} = function`;
    const start = core.indexOf(head);
    assert.ok(start >= 0, `${name} is defined`);
    const end = core.indexOf('\n};', start);
    assert.ok(end > start, `${name} terminates`);
    const body = core.slice(start + head.length, end + 2);
    return vm.runInNewContext(`(function ${body})`, context);
}

/** The pieces of a window these two methods touch, and nothing else. */
function fakeWindow({
    worldX,
    worldY,
    originX = 0,
    originY = 0,
    innerWidth = 200,
    innerHeight = 264,
    scaleX = 1,
    scaleY = scaleX,
    rotation = 0
}) {
    // The old tests all used the default identity scale, which hid the size
    // conversion bug. These are the matrix columns PIXI uses for each axis.
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const a = cos * scaleX;
    const b = sin * scaleX;
    const c = -sin * scaleY;
    const d = cos * scaleY;
    return {
        origin: { x: originX, y: originY },
        innerWidth,
        innerHeight,
        _clientArea: {
            filterArea: { x: 0, y: 0, width: 0, height: 0 },
            worldTransform: {
                a, b, c, d, tx: worldX, ty: worldY,
                apply(point) {
                    return {
                        x: this.a * point.x + this.c * point.y + this.tx,
                        y: this.b * point.x + this.d * point.y + this.ty
                    };
                }
            }
        }
    };
}

const CONTEXT = () => ({
    PIXI: {},
    Point: class Point {
        constructor(x, y) { this.x = x; this.y = y; }
    }
});

/** What v8's FilterSystem._calculateFilterArea does with the rect it is given. */
function asV8ReadsIt(filterArea, worldTransform) {
    const corners = [
        [filterArea.x, filterArea.y],
        [filterArea.x + filterArea.width, filterArea.y],
        [filterArea.x, filterArea.y + filterArea.height],
        [filterArea.x + filterArea.width, filterArea.y + filterArea.height]
    ].map(([x, y]) => ({
        x: worldTransform.a * x + worldTransform.c * y + worldTransform.tx,
        y: worldTransform.b * x + worldTransform.d * y + worldTransform.ty
    }));
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return {
        x,
        y,
        width: Math.max(...xs) - x,
        height: Math.max(...ys) - y
    };
}

test('the rect is written in world space, as every PIXI version documented it', () => {
    const context = CONTEXT();
    const update = windowMethod('_updateFilterArea', context);
    const win = fakeWindow({ worldX: 380, worldY: 264, originX: 0, originY: 16 });

    update.call(win);

    // Screen-space: the client area's own position plus the scroll origin.
    // A plugin replacing this method writes exactly this, which is the reason
    // it is not quietly changed to suit v8.
    assert.deepEqual(win._clientArea.filterArea,
        { x: 380, y: 280, width: 200, height: 264 });
});

test('localizing it puts v8\'s own transform back where it started', () => {
    const context = CONTEXT();
    const update = windowMethod('_updateFilterArea', context);
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 380, worldY: 264 });

    update.call(win);
    const worldSpace = { ...win._clientArea.filterArea };
    localize.call(win);

    // v8 multiplies by the world transform, which is precisely what was
    // subtracted, so the region it captures is the one that was asked for.
    assert.deepEqual(
        asV8ReadsIt(win._clientArea.filterArea, win._clientArea.worldTransform),
        { x: worldSpace.x, y: worldSpace.y, width: worldSpace.width, height: worldSpace.height });
});

test('without it, the captured region walks off the far edge of the screen', () => {
    // The failure this guards against, stated as arithmetic. A 960x540 game,
    // a window near the centre: the doubled rect starts past the bottom-right
    // corner, the filter captures nothing, and the window empties out.
    const context = CONTEXT();
    const update = windowMethod('_updateFilterArea', context);
    const win = fakeWindow({ worldX: 380, worldY: 264 });

    update.call(win);
    const doubled = asV8ReadsIt(win._clientArea.filterArea, win._clientArea.worldTransform);

    assert.deepEqual(doubled, { x: 760, y: 528, width: 200, height: 264 });
    assert.ok(doubled.x > 580, 'starts beyond the window it was meant to clip');
    assert.ok(doubled.y + doubled.height > 540, 'and runs off a 540px-tall screen');
});

test('a plugin\'s own _updateFilterArea is corrected too, without its cooperation', () => {
    /*
     * The whole reason the correction is a separate step. Windows are a
     * favourite thing for plugins to reimplement, and a plugin's version was
     * written against the engine's documented world-space rect years before v8
     * existed. It cannot be edited — obfuscated releases cannot be edited at
     * all — so nothing may depend on ours being the one that ran.
     */
    const context = CONTEXT();
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 380, worldY: 264 });

    // Stock MZ's body, as a plugin would have inherited and reproduced it.
    const pluginUpdate = function() {
        const pos = this._clientArea.worldTransform.apply({ x: 0, y: 0 });
        const filterArea = this._clientArea.filterArea;
        filterArea.x = pos.x + this.origin.x;
        filterArea.y = pos.y + this.origin.y;
        filterArea.width = this.innerWidth;
        filterArea.height = this.innerHeight;
    };

    pluginUpdate.call(win);
    localize.call(win);

    assert.deepEqual(
        asV8ReadsIt(win._clientArea.filterArea, win._clientArea.worldTransform),
        { x: 380, y: 264, width: 200, height: 264 });
});

test('a half-scale world-size rect is not clipped to a quarter of the client area', () => {
    const context = CONTEXT();
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 1006, worldY: 66, scaleX: 0.5 });

    // VisuMZ CoreEngine writes the screen-space dimensions expected by PIXI 5.
    const filterArea = win._clientArea.filterArea;
    filterArea.x = 1006;
    filterArea.y = 66;
    filterArea.width = Math.ceil(win.innerWidth * 0.5);
    filterArea.height = Math.ceil(win.innerHeight * 0.5);
    localize.call(win);

    assert.deepEqual(
        asV8ReadsIt(filterArea, win._clientArea.worldTransform),
        { x: 1006, y: 66, width: 100, height: 132 });
});

test('our own rect survives the round trip at a scale other than 1', () => {
    const context = CONTEXT();
    const update = windowMethod('_updateFilterArea', context);
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 380, worldY: 264, scaleX: 0.5 });

    update.call(win);
    const worldSpace = { ...win._clientArea.filterArea };
    localize.call(win);

    assert.deepEqual(
        asV8ReadsIt(win._clientArea.filterArea, win._clientArea.worldTransform),
        worldSpace);
    assert.deepEqual(worldSpace,
        { x: 380, y: 264, width: 100, height: 132 });
});

test('an unscaled plugin rect is not localized smaller than its requested area', () => {
    const context = CONTEXT();
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 380, worldY: 264, scaleX: 0.5 });
    const filterArea = win._clientArea.filterArea;

    // Stock MZ and plugins copying it write local dimensions into the otherwise
    // world-space rect. Preserve their PIXI 5 over-clip rather than shrinking it.
    filterArea.x = 380;
    filterArea.y = 264;
    filterArea.width = win.innerWidth;
    filterArea.height = win.innerHeight;
    localize.call(win);

    const captured = asV8ReadsIt(filterArea, win._clientArea.worldTransform);
    assert.ok(captured.width >= win.innerWidth);
    assert.ok(captured.height >= win.innerHeight);
});

test('dimension localization uses positive axis magnitudes for rotated reflections', () => {
    const context = CONTEXT();
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({
        worldX: 40,
        worldY: 60,
        scaleX: -0.5,
        scaleY: -0.25,
        rotation: Math.PI / 2
    });
    Object.assign(win._clientArea.filterArea,
        { x: 40, y: 60, width: 100, height: 66 });

    localize.call(win);

    assert.deepEqual(win._clientArea.filterArea,
        { x: 0, y: 0, width: 200, height: 264 });
    const captured = asV8ReadsIt(
        win._clientArea.filterArea,
        win._clientArea.worldTransform
    );
    assert.ok(Math.abs(captured.x - 40) < 1e-9);
    assert.ok(Math.abs(captured.y + 40) < 1e-9);
    assert.ok(Math.abs(captured.width - 66) < 1e-9);
    assert.ok(Math.abs(captured.height - 100) < 1e-9);
});

test('a zero-scale transform never produces infinite filter dimensions', () => {
    const context = CONTEXT();
    const update = windowMethod('_updateFilterArea', context);
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 40, worldY: 60, scaleX: 0, scaleY: 0 });

    update.call(win);
    localize.call(win);

    assert.deepEqual(win._clientArea.filterArea,
        { x: 0, y: 0, width: 200, height: 264 });
    assert.ok(Number.isFinite(win._clientArea.filterArea.width));
    assert.ok(Number.isFinite(win._clientArea.filterArea.height));
});

test('a stale world transform cancels out instead of shifting the rect', () => {
    // v8 computes world transforms in the render pipeline, so the one read here
    // can be a frame behind. Both steps read the same one, and the second
    // subtracts what the first added, so a window that has just moved is
    // clipped by a rect that is merely late — never by one that is wrong.
    const context = CONTEXT();
    const update = windowMethod('_updateFilterArea', context);
    const localize = windowMethod('_localizeFilterArea', context);
    const win = fakeWindow({ worldX: 999, worldY: -37, originX: 8, originY: 24 });

    update.call(win);
    localize.call(win);

    assert.deepEqual(win._clientArea.filterArea,
        { x: 8, y: 24, width: 200, height: 264 });
});

test('only v8 localizes; older PIXI keeps the rect it can use directly', () => {
    const updateTransform = core.slice(
        core.indexOf('Window.prototype.updateTransform = function'));
    const body = updateTransform.slice(0, updateTransform.indexOf('\n};'));

    // v5/v6/v7 is the branch that still runs the Container transform cascade,
    // and there the world-space rect is what FilterSystem wants.
    const legacy = body.slice(body.indexOf('if (!PIXI.TextureSource)'), body.indexOf('} else'));
    assert.match(legacy, /PIXI\.Container\.prototype\.updateTransform\.call\(this\)/);
    assert.match(legacy, /this\._updateFilterArea\(\)/);
    assert.doesNotMatch(legacy, /_localizeFilterArea/);

    const v8 = body.slice(body.indexOf('} else'));
    assert.match(v8, /this\._updateFilterArea\(\)/);
    assert.match(v8, /this\._localizeFilterArea\(\)/);
    assert.ok(v8.indexOf('_updateFilterArea') < v8.indexOf('_localizeFilterArea'),
        'and localizes after whoever computed it, not before');
});
