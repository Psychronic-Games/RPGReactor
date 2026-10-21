/**
 * A tile layer a plugin added to the tilemap can still draw.
 *
 * Through PIXI v5, v6 and v7 the tile textures belonged to the shared renderer
 * plugin: one atlas, uploaded once, addressed by set number. A layer drew from
 * it whether or not it had ever been handed the tileset, so plugins that add
 * their own tile layers -- a very old habit, and the whole basis of billboard
 * and overpass plugins -- worked without knowing any of this.
 *
 * v8 has no shared tile renderer. Each layer builds its tiles out of its own
 * image list, and a layer that was never given one drops every tile it is
 * asked to draw: no texture to make, nothing to log. TF_Billboard moves every
 * ☆ tile that also carries passage flags onto a layer of its own, so on a
 * wooded map each tree lost exactly the tiles that plugin had taken -- solid
 * tile-shaped holes, a clean console, and an editor that looked perfectly
 * right, because the editor runs no plugins at all.
 */
const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const core = runtimeSource('reactor_core.js');

/** A named `Tilemap[.Layer].prototype.<method> = function ... };` from the corescript. */
function method(head, context) {
    const start = core.indexOf(head);
    assert.ok(start >= 0, `${head} is defined`);
    const end = core.indexOf('\n};', start);
    const body = core.slice(start + head.length, end + 2);
    return vm.runInNewContext(`(function ${body})`, context);
}

/** Just enough of a layer to record whether it was handed the tileset. */
function fakeLayer(name) {
    return {
        name,
        images: null,
        setBitmaps(bitmaps) { this.images = bitmaps; }
    };
}

test('every tile layer on the tilemap is handed the tileset, not just our two', () => {
    const updateBitmaps = method('Tilemap.prototype._updateBitmaps = function', {});
    const lower = fakeLayer('lower');
    const upper = fakeLayer('upper');
    // What a plugin adds: more layers, sitting between ours.
    const billboards = [fakeLayer('billboard0'), fakeLayer('billboard1')];
    const bitmaps = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];

    const tilemap = {
        _needsBitmapsUpdate: true,
        _needsRepaint: false,
        _bitmaps: bitmaps,
        _lowerLayer: lower,
        _upperLayer: upper,
        children: [lower, ...billboards, upper],
        isReady: () => true
    };
    for (const layer of tilemap.children) layer.parent = tilemap;

    updateBitmaps.call(tilemap);

    for (const layer of [lower, upper, ...billboards]) {
        assert.deepEqual(layer.images, bitmaps, `${layer.name} was given the tileset`);
    }
    assert.equal(tilemap._needsBitmapsUpdate, false);
    assert.equal(tilemap._needsRepaint, true, 'and the map is repainted with them');
});

test('a layer held outside the child list is still set up', () => {
    // Plugins reparent things. Ours must be reached either way.
    const updateBitmaps = method('Tilemap.prototype._updateBitmaps = function', {});
    const lower = fakeLayer('lower');
    const upper = fakeLayer('upper');
    const tilemap = {
        _needsBitmapsUpdate: true,
        _bitmaps: ['A1'],
        _lowerLayer: lower,
        _upperLayer: upper,
        children: [],
        isReady: () => true
    };

    updateBitmaps.call(tilemap);

    assert.deepEqual(lower.images, ['A1']);
    assert.deepEqual(upper.images, ['A1']);
});

test('nothing is set up before the tileset has loaded', () => {
    const updateBitmaps = method('Tilemap.prototype._updateBitmaps = function', {});
    const lower = fakeLayer('lower');
    const tilemap = {
        _needsBitmapsUpdate: true,
        _bitmaps: ['A1'],
        _lowerLayer: lower,
        _upperLayer: fakeLayer('upper'),
        children: [lower],
        isReady: () => false
    };

    updateBitmaps.call(tilemap);

    assert.equal(lower.images, null, 'a half-loaded tileset is not handed out');
    assert.equal(tilemap._needsBitmapsUpdate, true, 'and it is tried again later');
});

test('v8 backend sync reaches plugin layers and detached canonical layers once', () => {
    const syncV8Layers = method('Tilemap.prototype._syncV8TileLayers = function', { Set });
    const calls = [];
    const lower = { _syncV8Backend: () => calls.push('lower') };
    const plugin = { _syncV8Backend: () => calls.push('plugin') };
    const upper = { _syncV8Backend: () => calls.push('upper') };
    const tilemap = {
        children: [lower, plugin],
        _lowerLayer: lower,
        _upperLayer: upper
    };

    syncV8Layers.call(tilemap);

    assert.deepEqual(calls, ['lower', 'plugin', 'upper']);
});

test('an undecoded image never becomes a texture source', () => {
    /*
     * The source is cached on the image element and lives for the session, so
     * one built from an image that has not decoded measures 1x1 forever. Every
     * tile drawn from that sheet then samples a single pixel and arrives as
     * one flat colour -- a forest of plain green squares -- and it never
     * recovers, because the image finishing loading invalidates nothing.
     *
     * Paints run every frame from updateTransform, including the frames before
     * the tileset has arrived, so this is reachable in ordinary play.
     */
    const addV8Tile = core.slice(core.indexOf('Tilemap.Layer.prototype._addV8Tile = function'));
    const body = addV8Tile.slice(0, addV8Tile.indexOf('\n};'));

    assert.match(body,
        /if \(!isShadow && !image\.width && !image\.naturalWidth && !image\.videoWidth\) return;/,
        'undecoded image tiles are declined while synthetic shadow rectangles remain valid');
    assert.ok(body.indexOf('!image.naturalWidth') < body.indexOf('__pixiTilemapSource'),
        'declined before anything is cached on the image');

    // And the layer must not go fetching bitmaps for itself mid-paint: that is
    // exactly how an undecoded sheet got in.
    assert.doesNotMatch(body, /setBitmaps/,
        'a layer takes its tileset from _updateBitmaps, which waits for isReady');
});
