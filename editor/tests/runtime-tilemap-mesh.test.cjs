const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const PIXI = require('pixi.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');

function loadTileLayers() {
    const start = core.indexOf('Tilemap.Layer = function()');
    const end = core.indexOf('Tilemap.Renderer = function()', start);
    assert.ok(start >= 0 && end > start);
    const context = { PIXI, Tilemap: function Tilemap() {}, console, performance };
    vm.runInNewContext(core.slice(start, end), context);
    return context;
}

function meshLayer(context) {
    const { Tilemap } = context;
    const layer = new PIXI.Container();
    Object.setPrototypeOf(layer, Tilemap.Layer.prototype);
    layer._elements = [];
    layer._images = [];
    layer._v8Backend = 'mesh';
    layer._v8MeshDirty = false;
    layer._v8SpritePool = [];
    layer._v8TileRoot = new PIXI.Container();
    layer.addChild(layer._v8TileRoot);
    layer._v8Atlas = {
        texture: PIXI.Texture.EMPTY,
        width: 4096,
        height: 3072,
        shadowX: 3072,
        shadowY: 2048,
        refs: 1
    };
    layer._v8Geometry = new PIXI.MeshGeometry({
        positions: new Float32Array(8),
        uvs: new Float32Array(8),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3])
    });
    layer._v8Mesh = new PIXI.Mesh({ geometry: layer._v8Geometry, texture: PIXI.Texture.EMPTY });
    layer._v8TileRoot.addChild(layer._v8Mesh);
    return layer;
}

test('the PIXI 8 runtime backend merges ordered tile commands into one mesh', () => {
    const context = loadTileLayers();
    const layer = meshLayer(context);
    layer.addRect(1, 48, 96, 10, 20, 48, 48);
    layer.addRect(-1, 0, 0, 22, 32, 24, 24);
    layer._syncV8Backend();

    assert.equal(layer._v8TileRoot.children.length, 1);
    assert.equal(layer._v8Mesh.visible, true);
    assert.deepEqual(Array.from(layer._v8Geometry.positions), [
        10, 20, 58, 20, 58, 68, 10, 68,
        22, 32, 46, 32, 46, 56, 22, 56
    ]);
    assert.deepEqual(Array.from(layer._v8Geometry.indices), [
        0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7
    ]);
    const shadowUvs = Array.from(layer._v8Geometry.uvs.slice(8));
    assert.equal(new Set(shadowUvs.filter((_, index) => index % 2 === 0)).size, 1);
    assert.equal(new Set(shadowUvs.filter((_, index) => index % 2 === 1)).size, 1);
    assert.equal(context.$reactorTilemapStats.backend, 'pending');
    assert.equal(context.$reactorTilemapStats.meshBuilds, 1);
    assert.equal(context.$reactorTilemapStats.lastRectCount, 2);
});

test('clearing a runtime layer preserves plugin children and hides stale geometry', () => {
    const context = loadTileLayers();
    const layer = meshLayer(context);
    const pluginChild = new PIXI.Container();
    layer.addChild(pluginChild);
    layer.addRect(1, 0, 0, 0, 0, 48, 48);
    layer._syncV8Backend();

    layer.clear();

    assert.equal(pluginChild.parent, layer);
    assert.equal(layer._v8TileRoot.parent, layer);
    assert.equal(layer._v8Mesh.visible, false);
    assert.equal(layer.size(), 0);
});

test('a render-time camera repaint synchronizes every mesh before returning', () => {
    const context = loadTileLayers();
    const { Tilemap } = context;
    const methodsStart = core.indexOf('Tilemap.prototype._syncV8TileLayers = function()');
    const methodsEnd = core.indexOf('\nTilemap.prototype._createLayers = function()', methodsStart);
    vm.runInNewContext(core.slice(methodsStart, methodsEnd), context);

    const lower = meshLayer(context);
    const upper = meshLayer(context);
    const pluginLayer = meshLayer(context);
    const tilemap = new Tilemap();
    Object.assign(tilemap, {
        origin: { x: 48, y: 0 },
        _margin: 20,
        tileWidth: 48,
        tileHeight: 48,
        _lowerLayer: lower,
        _upperLayer: upper,
        children: [lower, upper, pluginLayer],
        _needsRepaint: true,
        _lastAnimationFrame: 0,
        _lastStartX: 0,
        _lastStartY: 0,
        animationFrame: 0,
        _addAllSpots() {
            for (const layer of [lower, upper, pluginLayer]) {
                layer.clear();
                layer.addRect(0, 0, 0, 0, 0, 48, 48);
            }
        },
        _sortChildren() {}
    });

    tilemap.updateTransform();

    for (const layer of [lower, upper, pluginLayer]) {
        assert.equal(layer._v8MeshDirty, false);
        assert.equal(layer._v8Mesh.visible, true);
    }
});

test('the current map camera reaches the tilemap before its child update', () => {
    const start = sprites.indexOf('Spriteset_Map.prototype.update = function()');
    const end = sprites.indexOf('\n};', start);
    const body = sprites.slice(start, end);
    assert.ok(body.indexOf('this.updateTilemap();') < body.indexOf('Spriteset_Base.prototype.update.call(this);'));
    assert.equal((body.match(/this\.updateTilemap\(\);/g) || []).length, 1);
});

test('the forced sprite fallback pools tiles and renders map shadows', () => {
    const context = loadTileLayers();
    const { Tilemap } = context;
    const layer = new PIXI.Container();
    Object.setPrototypeOf(layer, Tilemap.Layer.prototype);
    layer._elements = [];
    layer._images = [];
    layer._v8Backend = 'sprites';
    layer._v8TileRoot = new PIXI.Container();
    layer.addChild(layer._v8TileRoot);
    const pluginChild = new PIXI.Container();
    layer.addChild(pluginChild);

    layer.addRect(-1, 0, 0, 4, 8, 24, 24);
    const first = layer._v8TileRoot.children[0];
    assert.equal(first.tint, 0x000000);
    assert.equal(first.alpha, 0.5);
    assert.deepEqual([first.x, first.y, first.width, first.height], [4, 8, 24, 24]);

    layer.clear();
    assert.equal(pluginChild.parent, layer);
    assert.equal(layer._v8SpritePool.length, 1);
    layer.addRect(-1, 0, 0, 12, 16, 24, 24);
    assert.equal(layer._v8TileRoot.children[0], first, 'the detached sprite is reused');
    assert.equal(context.$reactorTilemapStats.spritePoolHits, 1);
});

test('CombinedLayer forwards extended commands and ignores unrelated plugin children', () => {
    const context = loadTileLayers();
    const { Tilemap } = context;
    const combined = new PIXI.Container();
    Object.setPrototypeOf(combined, Tilemap.CombinedLayer.prototype);
    const calls = [];
    let unrelatedClears = 0;
    const tileLayer = new PIXI.Container();
    tileLayer.size = () => 0;
    tileLayer.addRect = (...args) => calls.push(args);
    tileLayer.clear = () => { tileLayer.cleared = true; };
    tileLayer.setBitmaps = bitmaps => { tileLayer.bitmaps = bitmaps; };
    tileLayer.isReady = () => true;
    const unrelated = new PIXI.Container();
    unrelated.clear = () => { unrelatedClears++; };
    unrelated.setBitmaps = () => { throw new Error('unrelated plugin child was treated as a tile layer'); };
    unrelated.isReady = () => false;
    combined.addChild(tileLayer, unrelated);

    combined.setBitmaps(['A1']);
    combined.clear();
    combined.addRect(0, 1, 2, 3, 4, 5, 6, 7, 8);

    assert.deepEqual(tileLayer.bitmaps, ['A1']);
    assert.equal(tileLayer.cleared, true);
    assert.equal(unrelatedClears, 0);
    assert.deepEqual(calls[0], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(combined.isReady(), true);
});

test('runtime exposes reversible mesh selection and diagnostics', () => {
    assert.match(core, /\$reactorTilemapBackend/);
    assert.match(core, /\$reactorTilemapStats/);
    assert.match(core, /requested === "sprites"/);
    assert.match(core, /this\._switchV8ToSprites\(error\)/);
    assert.match(core, /typeof UltraMode7 !== "undefined"/,
        'UltraMode7 remains authoritative while it is active');
});

test('forced sprite selection bypasses atlas setup and mesh failure falls back', () => {
    const context = loadTileLayers();
    const { Tilemap } = context;
    const layer = new PIXI.Container();
    Object.setPrototypeOf(layer, Tilemap.Layer.prototype);
    layer._elements = [];
    layer._v8TileRoot = new PIXI.Container();
    layer.addChild(layer._v8TileRoot);
    let atlasCalls = 0;
    Tilemap.Layer._acquireV8Atlas = () => {
        atlasCalls++;
        throw new Error('atlas unavailable');
    };

    context.$reactorTilemapBackend = 'sprites';
    layer._setupV8Backend([]);
    assert.equal(layer._v8Backend, 'sprites');
    assert.equal(atlasCalls, 0, 'forced fallback never allocates the atlas');

    context.$reactorTilemapBackend = 'mesh';
    layer._setupV8Backend([]);
    assert.equal(layer._v8Backend, 'sprites');
    assert.equal(atlasCalls, 1);
    assert.equal(context.$reactorTilemapStats.fallbacks, 1);
    assert.equal(context.$reactorTilemapStats.fallbackReason, 'atlas unavailable');
});

test('the shared runtime atlas is destroyed only after its last layer releases it', () => {
    const context = loadTileLayers();
    const { Tilemap } = context;
    const bitmaps = [];
    let destroys = 0;
    const entry = {
        bitmaps,
        refs: 2,
        texture: { destroyed: false, destroy(source) { destroys++; this.destroySource = source; } }
    };
    Tilemap.Layer._v8AtlasCache.set(bitmaps, entry);

    Tilemap.Layer._releaseV8Atlas(entry);
    assert.equal(entry.refs, 1);
    assert.equal(destroys, 0);
    assert.equal(Tilemap.Layer._v8AtlasCache.get(bitmaps), entry);

    Tilemap.Layer._releaseV8Atlas(entry);
    assert.equal(entry.refs, 0);
    assert.equal(destroys, 1);
    assert.equal(entry.texture.destroySource, true);
    assert.equal(Tilemap.Layer._v8AtlasCache.has(bitmaps), false);
});

test('tile UVs span the full texel rect so a panning camera cannot warble rows', () => {
    const context = loadTileLayers();
    const layer = meshLayer(context);
    layer.addRect(1, 48, 96, 10, 20, 48, 48);
    layer._syncV8Backend();
    const uvs = Array.from(layer._v8Geometry.uvs.slice(0, 8));
    const spanX = (uvs[2] - uvs[0]) * layer._v8Atlas.width;
    const spanY = (uvs[5] - uvs[1]) * layer._v8Atlas.height;
    // A half-texel inset compressed 48 texels into a 47-texel span: one
    // duplicated or dropped texel row per tile whenever the tilemap sits at
    // a fractional screen position or any zoom — crawling horizontal seams
    // during camera pans. The span must cover the tile...
    assert.ok(spanX > 47.9 && spanX < 48, `x span ${spanX}`);
    assert.ok(spanY > 47.9 && spanY < 48, `y span ${spanY}`);
    // ...while staying a whisker inside the boundary, so a quad edge can
    // never sample the neighbouring atlas row.
    const slot = context.Tilemap.Layer.V8_ATLAS_SLOT_SIZE;
    const columns = context.Tilemap.Layer.V8_ATLAS_COLUMNS;
    const offsetX = (1 % columns) * slot;
    assert.ok(uvs[0] * layer._v8Atlas.width > offsetX + 48, 'left edge inset');
    assert.ok(uvs[2] * layer._v8Atlas.width < offsetX + 96, 'right edge inset');
});
