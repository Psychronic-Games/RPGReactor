const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { loadRuntimeTilemap, makeTilemap, PIXI } = require('./helpers/runtime-tilemap.cjs');

// A map with every kind of tile the paint treats differently: water and
// waterfalls (A1), table tiles and their edges (A2), walls (A3/A4), A5,
// upper (star) tiles, shadows, and tiles against the map's edges.
function testMap(width = 40, height = 30, seed = 7) {
    let s = seed;
    const rand = n => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
    const data = new Array(width * height * 6).fill(0);
    const at = (x, y, z) => (z * height + y) * width + x;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const area = (Math.floor(x / 7) + Math.floor(y / 6) * 3) % 6;
            let ground;
            // Shapes as each autotile table allows: 48 floor, 16 wall, 4 waterfall.
            if (area === 0) ground = 2048 + rand(4) * 48 + rand(48);                   // still water, deep water, rocks
            else if (area === 1) {                                                     // water and waterfall kinds
                const kind = 4 + rand(12);
                ground = 2048 + kind * 48 + rand(kind % 2 ? 4 : 48);
            } else if (area === 2) ground = 2816 + rand(32) * 48 + rand(48);           // A2 ground and tables
            else if (area === 3) ground = 4352 + rand(32) * 48 + rand(16);              // A3 roofs and walls
            else if (area === 4) {                                                     // A4 tops and walls
                const kind = rand(48);
                ground = 5888 + kind * 48 + rand(Math.floor(kind / 8) % 2 ? 16 : 48);
            } else ground = 1536 + rand(128);                                          // A5
            data[at(x, y, 0)] = ground;
            if (rand(4) === 0) data[at(x, y, 1)] = 2816 + rand(32) * 48 + rand(48);
            if (rand(3) === 0) data[at(x, y, 2)] = 1 + rand(255);
            if (rand(5) === 0) data[at(x, y, 3)] = 256 + rand(512);
            data[at(x, y, 4)] = rand(16);
        }
    }
    const flags = new Array(8192).fill(0);
    for (let id = 0; id < 8192; id++) {
        if (id % 7 === 0) flags[id] |= 0x10;
        if (id >= 2816 && id < 4352 && Math.floor((id - 2816) / 48) % 3 === 0) flags[id] |= 0x80;
    }
    return { width, height, data, flags };
}

function quadsOf(positions, uvs, count, offsetX, offsetY, into) {
    for (let n = 0; n < count; n++) {
        const p = n * 8;
        const x0 = positions[p] + offsetX, y0 = positions[p + 1] + offsetY;
        const x1 = positions[p + 4] + offsetX, y1 = positions[p + 5] + offsetY;
        if (x1 === x0 && y1 === y0) continue;
        into.push([x0, y0, x1, y1, uvs[p], uvs[p + 1], uvs[p + 4], uvs[p + 5]].map(v => Math.round(v * 1e6) / 1e6));
    }
    return into;
}

// Each cell's quads, in drawing order, in the layer's own space.
function cells(quads, tileWidth, tileHeight, cols, rows) {
    const out = new Map();
    for (const q of quads) {
        const cx = Math.floor(q[0] / tileWidth), cy = Math.floor(q[1] / tileHeight);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        const key = cx + ',' + cy;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push(q.join(' '));
    }
    return out;
}

function stockQuads(tilemap, combined) {
    const quads = [];
    for (const layer of combined.children) {
        if (layer._v8Quads && layer._v8Mesh && layer._v8Mesh.visible) {
            quadsOf(layer._v8Quads.positions, layer._v8Quads.uvs, layer._v8Quads.used, 0, 0, quads);
        }
    }
    return quads;
}

function chunkQuads(tilemap, root) {
    const quads = [];
    for (const mesh of root.children) {
        if (!mesh.visible) continue;
        const geometry = mesh.geometry;
        const count = geometry.positions.length / 8;
        quadsOf(geometry.positions, geometry.uvs, count, root.x + mesh.x, root.y + mesh.y, quads);
    }
    return quads;
}

function viewOf(tilemap) {
    return {
        cols: Math.ceil((tilemap.width + tilemap._margin * 2) / tilemap.tileWidth) + 1,
        rows: Math.ceil((tilemap.height + tilemap._margin * 2) / tilemap.tileHeight) + 1
    };
}

// Runs a plugin's source in the runtime's context the way the game loads
// one: as the current script, js/plugins/<name>.js.
function loadPlugin(context, name, source) {
    context.document = { currentScript: { src: 'file:///game/js/plugins/' + name + '.js' } };
    try {
        vm.runInContext(source, context, { filename: name + '.js' });
    } finally {
        delete context.document;
    }
}

function pair(map = testMap(), plugins = []) {
    const stock = loadRuntimeTilemap();
    stock.Tilemap.ChunkPaint.enabled = false;
    const chunked = loadRuntimeTilemap();
    for (const [name, source] of plugins) {
        loadPlugin(stock, name, source);
        loadPlugin(chunked, name, source);
    }
    const a = makeTilemap(stock, map);
    const b = makeTilemap(chunked, map);
    return { stock, chunked, a, b };
}

function step(context, tilemap, x, y) {
    tilemap.origin.x = x;
    tilemap.origin.y = y;
    context.Graphics.frameCount++;
    tilemap.update();
}

test('chunked painting draws the same quads, cell by cell and in order, as the full paint', () => {
    const { stock, chunked, a, b } = pair();
    assert.equal(chunked.$reactorTilemapStats.chunkFallback, '');
    // A walk over the map, through every water frame, past the edges.
    const path = [];
    for (let f = 0; f < 260; f++) path.push([-30 + f * 7, 10 + f * 3]);
    let compared = 0;
    for (const [x, y] of path) {
        step(stock, a, x, y);
        step(chunked, b, x, y);
        assert.equal(chunked.$reactorTilemapStats.chunked, true);
        if (a.animationCount % 17 !== 0 && a.animationCount % 30 !== 1) continue;
        const { cols, rows } = viewOf(a);
        for (const [stockLayer, root] of [[a._lowerLayer, b._rrChunks.lowerRoot], [a._upperLayer, b._rrChunks.upperRoot]]) {
            const want = cells(stockQuads(a, stockLayer), a.tileWidth, a.tileHeight, cols, rows);
            const got = cells(chunkQuads(b, root), b.tileWidth, b.tileHeight, cols, rows);
            assert.ok(want.size > 0);
            for (const [key, list] of want) assert.deepEqual(got.get(key), list, `cell ${key} at frame ${a.animationCount}`);
            for (const key of got.keys()) assert.ok(want.has(key), `extra cell ${key}`);
        }
        compared++;
    }
    assert.ok(compared > 10);
    const stats = chunked.$reactorTilemapStats;
    assert.ok(stats.animPatches > 0, 'water moved by UV offset');
    assert.equal(stats.meshBuilds, 0, 'the full-view mesh was never built');
    assert.ok(stock.$reactorTilemapStats.meshBuilds > 40, 'the full paint rebuilt as the view moved');
});

test('walking builds blocks ahead of the view, not whole views', () => {
    const { chunked, b } = pair(testMap(120, 120));
    const stats = chunked.$reactorTilemapStats;
    step(chunked, b, 40 * 48, 40 * 48);
    const first = stats.chunkSyncBuilds;
    assert.ok(first > 0);
    for (let f = 0; f < 400; f++) step(chunked, b, 40 * 48 + f * 3, 40 * 48);
    assert.equal(stats.chunkSyncBuilds, first, 'every block the view reached was already built');
    assert.ok(stats.chunkBuilds > first, 'blocks were built ahead');
    assert.ok(stats.chunksLive < 60, 'blocks far behind are let go');
    assert.ok(b._rrChunks.pool.length > 0, 'and their meshes kept for reuse');
});

test('a plugin hook on the painting path keeps the full paint, and the hook runs', () => {
    const { chunked, b } = pair();
    step(chunked, b, 100, 100);
    assert.equal(chunked.$reactorTilemapStats.chunked, true);
    const lowerRoot = b._rrChunks.lowerRoot;
    let calls = 0;
    const original = chunked.Tilemap.prototype._addSpot;
    chunked.Tilemap.prototype._addSpot = function() { calls++; return original.apply(this, arguments); };
    step(chunked, b, 100, 100);
    assert.equal(chunked.$reactorTilemapStats.chunked, false);
    assert.match(chunked.$reactorTilemapStats.chunkFallback, /_addSpot/);
    assert.equal(b._rrChunks, null);
    assert.equal(lowerRoot.parent, null, 'the blocks are gone from the layer');
    assert.ok(calls > 100, 'the full paint ran through the plugin hook');
    assert.ok(b._lowerLayer.children[0]._v8Mesh.visible, 'and drew');
    chunked.Tilemap.prototype._addSpot = original;
    step(chunked, b, 100, 100);
    assert.equal(chunked.$reactorTilemapStats.chunked, true, 'back once the hook is gone');
    assert.equal(b._lowerLayer.children[0]._v8Mesh.visible, false, 'the full-view mesh hides');
});

test('layer hooks, plugin tile layers, tile frames and the switch keep the full paint', () => {
    const cases = {
        'Layer.addRect': c => { const o = c.Tilemap.Layer.prototype.addRect; c.Tilemap.Layer.prototype.addRect = function() { return o.apply(this, arguments); }; },
        'plugin layer': (c, t) => { const layer = new c.Tilemap.Layer(); t.addChild(layer); },
        'tile frames': (c, t) => { t._rrTileFrames = { 5: [5, 6] }; },
        'switch': c => { c.Tilemap.ChunkPaint.enabled = false; },
        'UltraMode7 drawing the map': c => { c.UltraMode7 = { isActive: () => true }; },
        'updateTransform': (c, t) => { const o = t.updateTransform; t.updateTransform = function() { return o.apply(this, arguments); }; }
    };
    for (const [name, apply] of Object.entries(cases)) {
        const { chunked, b } = pair();
        step(chunked, b, 0, 0);
        apply(chunked, b);
        b.updateTransform();
        assert.equal(chunked.$reactorTilemapStats.chunked, false, name);
        assert.equal(b._rrChunks, null, name);
    }
});

test('a profiler-timed paint method still paints in chunks', () => {
    const { chunked, b } = pair();
    const original = chunked.Tilemap.prototype._addAllSpots;
    const timed = function() { return original.apply(this, arguments); };
    timed.__rrProfilerOriginal = original;
    chunked.Tilemap.prototype._addAllSpots = timed;
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunked, true);
});

test('map data written without refresh shows within a pass of the block check; refresh rebuilds at once', () => {
    const map = testMap();
    const { chunked, b } = pair(map);
    step(chunked, b, 0, 0);
    const chunk = b._rrChunks.chunks.get(chunked.Tilemap._rrChunkKey(0, 0));
    const before = chunk.lower.quads.uvs.slice(0, 8);
    map.data[0] = 2; // tile (0,0), layer 0: a B tile instead of the ground autotile
    for (let f = 0; f < b._rrChunks.live.length + 1; f++) step(chunked, b, 0, 0);
    const after = b._rrChunks.chunks.get(chunked.Tilemap._rrChunkKey(0, 0));
    assert.notDeepEqual(Array.from(after.lower.quads.uvs.slice(0, 8)), Array.from(before));
    const builds = chunked.$reactorTilemapStats.chunkSyncBuilds;
    b.refresh();
    step(chunked, b, 0, 0);
    assert.ok(chunked.$reactorTilemapStats.chunkSyncBuilds > builds);
});

test('a hidden tilemap (a 3D map) builds no blocks and holds no atlas', () => {
    const { chunked, b } = pair();
    b._lowerLayer.visible = false;
    b._upperLayer.visible = false;
    step(chunked, b, 0, 0);
    assert.ok(!b._rrChunks);
    assert.equal(chunked.$reactorTilemapStats.chunkBuilds, 0);
    assert.equal(chunked.atlasRequests, 0);
});

test('the tile atlas packs MZ sheets well under the old fixed size, sheets apart', () => {
    const { Tilemap } = loadRuntimeTilemap();
    const sizes = [[768, 576], [768, 576], [768, 384], [768, 720], [384, 768], [768, 768], [768, 768], [768, 768], [768, 768]];
    const images = Array.from({ length: 11 }, (_, i) => sizes[i] ? { width: sizes[i][0], height: sizes[i][1] } : null);
    const packed = Tilemap.Layer._v8AtlasLayout(images, 4096);
    assert.ok(packed.width * packed.height <= 0.4 * 4096 * 3072, `${packed.width}x${packed.height}`);
    const rects = sizes.map((s, i) => [packed.ox[i], packed.oy[i], s[0], s[1]]);
    rects.push([packed.shadowX, packed.shadowY, 2, 2]);
    for (const [x, y, w, h] of rects) assert.ok(x >= 0 && y >= 0 && x + w <= packed.width && y + h <= packed.height);
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const [ax, ay, aw, ah] = rects[i], [bx, by, bw, bh] = rects[j];
            assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `sheets ${i} and ${j} overlap`);
        }
    }
    assert.throws(() => Tilemap.Layer._v8AtlasLayout(images, 2048), /texture limit/, 'past the GPU limit: the sprite fallback takes over');
    Tilemap.Layer.v8AtlasPacked = false;
    const fixed = Tilemap.Layer._v8AtlasLayout(images, 4096);
    assert.deepEqual([fixed.width, fixed.height, fixed.ox[5], fixed.oy[5]], [4096, 3072, 1024, 1024]);
});

test('a tile rect past its sheet edge is clipped; one wholly past it draws nothing', () => {
    const { Tilemap } = loadRuntimeTilemap();
    const atlas = { width: 1000, height: 1000, shadowX: 0, shadowY: 0,
        ox: [100], oy: [200], rw: [96], rh: [96] };
    const positions = new Float32Array(16), uvs = new Float32Array(16);
    Tilemap.Layer._writeV8Quad(atlas, positions, uvs, 0, 0, 72, 0, 10, 20, 48, 48);
    assert.deepEqual(Array.from(positions.slice(0, 8)), [10, 20, 34, 20, 34, 68, 10, 68], 'the 24px inside the sheet');
    assert.ok(uvs[2] * 1000 < 100 + 96 && uvs[2] * 1000 > 100 + 95.9);
    Tilemap.Layer._writeV8Quad(atlas, positions, uvs, 1, 0, 96, 0, 10, 20, 48, 48);
    assert.ok(positions.slice(8).every(v => v === 0));
});

test('the atlas lets its CPU copy go once the GPU holds it, and draws it again when the GPU loses it', () => {
    const context = loadRuntimeTilemap();
    const { Tilemap } = context;
    let paints = 0;
    Tilemap.Layer._paintV8Atlas = entry => { paints++; entry.canvas.width = entry.width; entry.canvas.height = entry.height; entry.dropped = false; };
    const gl = { isContextLost: () => false };
    context.Graphics.app = { renderer: { uid: 3, gl } };
    const entry = { width: 64, height: 32, canvas: { width: 64, height: 32 }, source: { _gpuData: {} }, dropped: false };
    Tilemap.Layer._keepV8AtlasPixels(entry);
    assert.equal(entry.dropped, false, 'not before the upload');
    entry.source._gpuData[3] = { width: 64, height: 32 };
    Tilemap.Layer._keepV8AtlasPixels(entry);
    assert.equal(entry.dropped, true);
    assert.deepEqual([entry.canvas.width, entry.canvas.height], [1, 1]);
    entry.source._gpuData[3] = null; // texture GC or a lost context
    Tilemap.Layer._keepV8AtlasPixels(entry);
    assert.equal(paints, 1);
    assert.equal(entry.dropped, false);
    assert.equal(entry.canvas.width, 64);
    Tilemap.Layer.v8AtlasDropsCanvas = false;
    entry.source._gpuData[3] = { width: 64, height: 32 };
    Tilemap.Layer._keepV8AtlasPixels(entry);
    assert.equal(entry.dropped, false, 'kept with the switch off');
});

test('the full paint reuses its arrays between paints', () => {
    const { stock, a } = pair();
    const layer = a._lowerLayer.children[0];
    const arrays = new Set();
    for (let f = 0; f < 200; f++) {
        step(stock, a, f * 5, 0);
        arrays.add(layer._v8Geometry.positions);
    }
    assert.ok(stock.$reactorTilemapStats.meshBuilds > 10);
    assert.ok(arrays.size <= 3, `the same arrays, uploaded again (${arrays.size} made)`);
    assert.ok(PIXI);
});

//-----------------------------------------------------------------------------
// Plugins that hook the painting path but hand every call straight on while
// they are not drawing the map (UltraMode7 on its 2D maps).
//-----------------------------------------------------------------------------

// The painting hooks of UltraMode7 2.2.0 (the Demo's), as that plugin writes
// them: each calls the method it replaced while the plugin is not drawing the
// map. What it draws while active is cut down to the calls that show it ran.
const UM7 = `
var UltraMode7 = { active: false, paints: 0, isActive() { return this.active; } };
const UltraMode7_Tilemap_prototype_initialize = Tilemap.prototype.initialize;
Tilemap.prototype.initialize = function() {
    if (!UltraMode7.isActive()) {
        UltraMode7_Tilemap_prototype_initialize.call(this);
        return;
    }
    UltraMode7_Tilemap_prototype_initialize.call(this);
    this._margin = 0;
};
if (UltraMode7) {
    const UltraMode7_Tilemap_prototype_updateTransform = Tilemap.prototype.updateTransform;
    Tilemap.prototype.updateTransform = function() {
        if (!UltraMode7.isActive()) {
            UltraMode7_Tilemap_prototype_updateTransform.call(this);
            return;
        }
        UltraMode7.paints++;
        if (this._needsRepaint) {
            this._addAllSpots(0, 0);
            this._needsRepaint = false;
        }
        this._sortChildren();
    };
    const UltraMode7_Tilemap_prototype__createLayers = Tilemap.prototype._createLayers;
    Tilemap.prototype._createLayers = function() {
        UltraMode7_Tilemap_prototype__createLayers.call(this);
        if (UltraMode7.isActive()) {
            this._upperLayer.z = 0;
        }
    };
    const UltraMode7_Tilemap_prototype__addAllSpots = Tilemap.prototype._addAllSpots;
    Tilemap.prototype._addAllSpots = function(startX, startY) {
        if (!UltraMode7.isActive()) {
            UltraMode7_Tilemap_prototype__addAllSpots.call(this, startX, startY);
            return;
        }
        this._lowerLayer.clear();
        this._upperLayer.clear();
        const tileCols = Math.ceil(this._width / this.tileWidth);
        const tileRows = Math.ceil(this._height / this.tileHeight);
        for (var y = startY; y < tileRows - startY; ++y) {
            for (var x = startX; x < tileCols - startX; ++x) {
                this._addSpot(0, 0, x, y);
            }
        }
    };
    const UltraMode7_Tilemap_prototype__addAutotile = Tilemap.prototype._addAutotile;
    Tilemap.prototype._addAutotile = function(layer, tileId, dx, dy) {
        if (!UltraMode7.isActive() || !Tilemap.isTileA1(tileId)) {
            UltraMode7_Tilemap_prototype__addAutotile.call(this, layer, tileId, dx, dy);
            return;
        }
        const kind = Tilemap.getAutotileKind(tileId);
        if (kind === 2 || kind === 3) {
            UltraMode7_Tilemap_prototype__addAutotile.call(this, layer, tileId, dx, dy);
            return;
        }
        layer.addRect(0, 0, 0, dx, dy, this.tileWidth, this.tileHeight, 2 * this.tileWidth, 0);
    };
    const UltraMode7_Tilemap_Layer_prototype_addRect = Tilemap.Layer.prototype.addRect;
    Tilemap.Layer.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h, ax, ay) {
        if (!UltraMode7.isActive()) {
            UltraMode7_Tilemap_Layer_prototype_addRect.call(this, setNumber, sx, sy, dx, dy, w, h);
            return;
        }
        (this._allElements || (this._allElements = [])).push([setNumber, sx, sy, dx, dy, w, h, ax || 0, ay || 0]);
    };
    const UltraMode7_Tilemap_CombinedLayer_prototype_addRect = Tilemap.CombinedLayer.prototype.addRect;
    Tilemap.CombinedLayer.prototype.addRect = function(setNumber, sx, sy, dx, dy, w, h, ax, ay) {
        if (!UltraMode7.isActive()) {
            UltraMode7_Tilemap_CombinedLayer_prototype_addRect.call(this, setNumber, sx, sy, dx, dy, w, h);
            return;
        }
        for (const child of this.children) {
            if (child.size() < Tilemap.Layer.MAX_SIZE) {
                child.addRect(setNumber, sx, sy, dx, dy, w, h, ax, ay);
                break;
            }
        }
    };
}
`;

// The current frame's quads, cell by cell and in order, are the same in
// both tilemaps: `a` painted in full, `b` in blocks.
function assertSamePaint(a, b, label) {
    const { cols, rows } = viewOf(a);
    for (const [stockLayer, root] of [[a._lowerLayer, b._rrChunks.lowerRoot], [a._upperLayer, b._rrChunks.upperRoot]]) {
        const want = cells(stockQuads(a, stockLayer), a.tileWidth, a.tileHeight, cols, rows);
        const got = cells(chunkQuads(b, root), b.tileWidth, b.tileHeight, cols, rows);
        assert.ok(want.size > 0, label);
        for (const [key, list] of want) assert.deepEqual(got.get(key), list, `${label}: cell ${key}`);
        for (const key of got.keys()) assert.ok(want.has(key), `${label}: extra cell ${key}`);
    }
}

test('with UltraMode7 installed but not drawing the map, blocks draw the same quads as the full paint', () => {
    const { stock, chunked, a, b } = pair(testMap(), [['UltraMode7', UM7]]);
    const C = chunked.Tilemap.ChunkPaint;
    for (const name of ['updateTransform', '_createLayers', '_addAllSpots', '_addAutotile']) {
        assert.notEqual(b[name], C.stock[name], `UltraMode7 hooks ${name}`);
        assert.equal(C.origins.get(b[name]), 'UltraMode7');
    }
    let compared = 0;
    for (let f = 0; f < 260; f++) {
        const x = -30 + f * 7, y = 10 + f * 3;
        step(stock, a, x, y);
        step(chunked, b, x, y);
        assert.equal(chunked.$reactorTilemapStats.chunkFallback, '', `frame ${f}`);
        assert.equal(chunked.$reactorTilemapStats.chunked, true);
        if (a.animationCount % 17 !== 0 && a.animationCount % 30 !== 1) continue;
        assertSamePaint(a, b, `frame ${a.animationCount}`);
        compared++;
    }
    assert.ok(compared > 10);
    assert.ok(chunked.$reactorTilemapStats.animPatches > 0, 'water moved by UV offset');
    assert.equal(chunked.$reactorTilemapStats.meshBuilds, 0, 'the full-view mesh was never built');
    assert.equal(stock.$reactorTilemapStats.chunkFallback, 'off');
    assert.equal(chunked.UltraMode7.paints, 0);
});

test('UltraMode7 drawing the map mid-map takes over, and blocks come back the same once it stops', () => {
    const { stock, chunked, a, b } = pair(testMap(), [['UltraMode7', UM7]]);
    const stats = chunked.$reactorTilemapStats;
    let f = 0;
    const walk = frames => {
        for (let n = 0; n < frames; n++, f++) {
            step(stock, a, 40 + f * 5, 30 + f * 2);
            step(chunked, b, 40 + f * 5, 30 + f * 2);
        }
    };
    walk(20);
    assert.equal(stats.chunked, true);
    const roots = [b._rrChunks.lowerRoot, b._rrChunks.upperRoot];
    chunked.UltraMode7.active = stock.UltraMode7.active = true;
    walk(3);
    assert.equal(stats.chunked, false);
    assert.equal(stats.chunkFallback, 'UltraMode7 active');
    assert.equal(b._rrChunks, null, 'the blocks are let go');
    for (const root of roots) assert.equal(root.parent, null);
    assert.ok(chunked.UltraMode7.paints >= 3, 'UltraMode7 painted the map');
    assert.ok(b._lowerLayer.children[0]._allElements.length > 0, 'through its own layer path');
    chunked.UltraMode7.active = stock.UltraMode7.active = false;
    walk(1);
    assert.equal(stats.chunked, true, 'blocks again once it stops');
    assert.equal(stats.chunkFallback, '');
    assertSamePaint(a, b, 'right after');
    walk(40);
    assertSamePaint(a, b, '40 frames on');
    chunked.UltraMode7.active = true;
    walk(1);
    assert.equal(stats.chunkFallback, 'UltraMode7 active', 'and on again');
});

test('a hook that does not hand every call straight on keeps the full paint, and says which', () => {
    const gate = 'var UltraMode7 = { active: false, isActive() { return this.active; } };\n';
    const cases = {
        // reads the tilemap before handing on
        _addSpotTile: `{ const o = Tilemap.prototype._addSpotTile;
            Tilemap.prototype._addSpotTile = function(tileId, dx, dy) { if (this._hideTiles) return; o.call(this, tileId, dx, dy); }; }`,
        // moves waterfall tiles only
        _addAutotile: `{ const o = Tilemap.prototype._addAutotile;
            Tilemap.prototype._addAutotile = function(layer, tileId, dx, dy) {
                o.call(this, layer, tileId, dx, Tilemap.isWaterfallTile(tileId) ? dy + 1 : dy); }; }`,
        // writes to the tilemap after handing on
        updateTransform: `{ const o = Tilemap.prototype.updateTransform;
            Tilemap.prototype.updateTransform = function() { o.call(this); this._seen = true; }; }`,
        // answers differently
        _isOverpassPosition: 'Tilemap.prototype._isOverpassPosition = function() { return true; };',
        // throws on anything but a real tilemap
        _addShadow: `{ const o = Tilemap.prototype._addShadow;
            Tilemap.prototype._addShadow = function(layer, bits, dx, dy) {
                if (!(this instanceof Tilemap)) throw new Error('not a tilemap'); o.call(this, layer, bits, dx, dy); }; }`,
        // hands on twice
        _readMapData: `{ const o = Tilemap.prototype._readMapData;
            Tilemap.prototype._readMapData = function(x, y, z) { o.call(this, x, y, z); return o.call(this, x, y, z); }; }`
    };
    for (const [name, source] of Object.entries(cases)) {
        const { chunked, b } = pair(testMap(), [['UltraMode7', gate + source]]);
        step(chunked, b, 100, 100);
        assert.equal(chunked.$reactorTilemapStats.chunked, false, name);
        assert.equal(chunked.$reactorTilemapStats.chunkFallback, `plugin hook ${name} (UltraMode7)`);
        assert.ok(!b._rrChunks, name);
    }
    // Layer methods: the layers are not the stock ones.
    const twice = `{ const o = Tilemap.Layer.prototype.addRect;
        Tilemap.Layer.prototype.addRect = function() { o.apply(this, arguments); o.apply(this, arguments); }; }`;
    const layered = pair(testMap(), [['UltraMode7', gate + twice]]);
    step(layered.chunked, layered.b, 100, 100);
    assert.equal(layered.chunked.$reactorTilemapStats.chunkFallback, 'plugin tile layers');
});

test('only a gated plugin, not drawing the map, with the switch on, gets its hooks through', () => {
    const passOn = `{ const o = Tilemap.prototype._addSpot;
        Tilemap.prototype._addSpot = function(startX, startY, x, y) { o.call(this, startX, startY, x, y); }; }`;
    // The same pass-through from any other plugin: it may keep its own count of calls.
    let { chunked, b } = pair(testMap(), [['OtherPlugin', passOn]]);
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunkFallback, 'plugin hook _addSpot (OtherPlugin)');
    ({ chunked, b } = pair(testMap(), [['UltraMode7', 'var UltraMode7 = { isActive() { return false; } };\n' + passOn]]));
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunked, true, 'from UltraMode7 it passes');
    chunked.Tilemap.ChunkPaint.passThrough = false;
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunkFallback, 'plugin hook _addSpot (UltraMode7)', 'switch off');
    chunked.Tilemap.ChunkPaint.passThrough = true;
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunked, true, 'switch on again');
    // Installed without the plugin's own check answering.
    ({ chunked, b } = pair(testMap(), [['UltraMode7', 'var UltraMode7 = {};\n' + passOn]]));
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunkFallback, 'UltraMode7 check failed');
    // Assigned after the first paint, from a plugin script or not: no known origin.
    ({ chunked, b } = pair(testMap(), [['UltraMode7', 'var UltraMode7 = { isActive() { return false; } };']]));
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunked, true);
    loadPlugin(chunked, 'UltraMode7', passOn);
    step(chunked, b, 0, 0);
    assert.equal(chunked.$reactorTilemapStats.chunkFallback, 'plugin hook _addSpot');
});

test('the runtime bridge for UltraMode7 before 2.2.0 counts as its hook, and blocks stay the same', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const compat = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'libs', 'pixi_compat.js'), 'utf8');
    const start = compat.indexOf('const origCombinedAddRect = Tilemap.CombinedLayer.prototype.addRect;');
    const end = compat.indexOf('compatLog("pixi_compat: UltraMode7 pre-2.2.0', start);
    assert.ok(start > 0 && end > start, 'bridge found in pixi_compat.js');
    const { stock, chunked, a, b } = pair(testMap(), [['UltraMode7', 'var UltraMode7 = { isActive() { return false; } };']]);
    for (const context of [stock, chunked]) vm.runInContext('{' + compat.slice(start, end) + '}', context);
    const C = chunked.Tilemap.ChunkPaint;
    assert.notEqual(chunked.Tilemap.CombinedLayer.prototype.addRect, C.stock.combinedAddRect);
    for (let f = 0; f < 40; f++) {
        step(stock, a, f * 9, f * 4);
        step(chunked, b, f * 9, f * 4);
        assert.equal(chunked.$reactorTilemapStats.chunkFallback, '', `frame ${f}`);
    }
    assertSamePaint(a, b, 'bridge');
});

test('painting methods are watched only until the first paint; instance assignments stay on the instance', () => {
    const context = loadRuntimeTilemap();
    const { Tilemap } = context;
    const C = Tilemap.ChunkPaint;
    assert.equal(typeof Object.getOwnPropertyDescriptor(Tilemap.prototype, '_addSpot').get, 'function');
    const tilemap = makeTilemap(context, testMap());
    loadPlugin(context, 'SomePlugin', 'globalThis.made = function() {}; Tilemap.prototype._addSpot = made;');
    const own = function() {};
    tilemap._addShadow = own;
    assert.equal(Tilemap.prototype._addShadow, C.stock._addShadow, 'the prototype keeps its method');
    assert.ok(Object.prototype.hasOwnProperty.call(tilemap, '_addShadow'));
    assert.equal(C.origins.get(context.made), 'SomePlugin');
    assert.equal(C.origins.has(own), false, 'assigned outside a plugin script');
    step(context, tilemap, 0, 0);
    for (const name of C.HOOKS) {
        const desc = Object.getOwnPropertyDescriptor(Tilemap.prototype, name);
        assert.equal(typeof desc.value, 'function', name);
        assert.equal(desc.writable, true, name);
    }
    assert.equal(Tilemap.prototype._addSpot, context.made);
    assert.equal(Object.getOwnPropertyDescriptor(Tilemap.Layer.prototype, 'addRect').value, C.stock.layerAddRect);
});

test('every stock painting method leaves a clean, repeatable record on the stand-in', () => {
    const { Tilemap } = loadRuntimeTilemap();
    const C = Tilemap.ChunkPaint;
    const names = [...C.HOOKS, 'layerAddRect', 'layerClear', 'combinedAddRect', 'combinedClear'];
    for (const name of names) {
        const sets = C.PROBES[name];
        assert.ok(sets && sets.length, `${name} has probes`);
        for (const args of sets) {
            const first = C.trace(C.stock[name], args, name === "_createLayers");
            assert.notEqual(first, null, `${name}(${args.map(String).join(", ")}) runs on the stand-in`);
            assert.equal(C.trace(C.stock[name], args, name === "_createLayers"), first, `${name} records the same twice`);
        }
        assert.equal(C.probe(C.stock[name], name), true, name);
    }
    // The record sees reads, calls with their arguments, and the answer.
    const addSpot = C.trace(C.stock._addSpot, C.PROBES._addSpot[0]);
    assert.match(addSpot, /call this\._addSpotTile on this \(this\._readMapData\(\)0, 1, 1\)/);
    assert.match(C.trace(C.stock._isOverpassPosition, [3, 4]), /^return false$/);
    assert.equal(Tilemap.CombinedLayer.prototype.addRect, C.stock.combinedAddRect, 'layers restored after probing _createLayers');
    const loop = function() { let n = this; while (n.parent) n = n.parent; };
    assert.equal(C.trace(loop, []), null, 'a walk that never ends stops at the probe limit');
});

test('a passing hook is judged again on a new map and every RECHECK checks', () => {
    const source = `var UltraMode7 = { isActive() { return false; } };
        var Hide = { shadows: false };
        { const o = Tilemap.prototype._addShadow;
          Tilemap.prototype._addShadow = function(layer, bits, dx, dy) { if (Hide.shadows) return; o.call(this, layer, bits, dx, dy); }; }`;
    const { chunked, b } = pair(testMap(), [['UltraMode7', source]]);
    const C = chunked.Tilemap.ChunkPaint;
    const stats = chunked.$reactorTilemapStats;
    chunked.$gameMap = { id: 1, mapId() { return this.id; } };
    step(chunked, b, 0, 0);
    assert.equal(stats.chunked, true);
    chunked.Hide.shadows = true;
    step(chunked, b, 0, 0);
    assert.equal(stats.chunked, true, 'a check on its own state is not seen before the next judgment');
    chunked.$gameMap.id = 2;
    step(chunked, b, 0, 0);
    assert.equal(stats.chunkFallback, 'plugin hook _addShadow (UltraMode7)', 'a new map');
    chunked.Hide.shadows = false;
    C.RECHECK = 5;
    for (let f = 0; f < 6; f++) step(chunked, b, 0, 0);
    assert.equal(stats.chunked, true, 'after RECHECK checks');
    chunked.Hide.shadows = true;
    for (let f = 0; f < 6; f++) step(chunked, b, 0, 0);
    assert.equal(stats.chunked, false);
});

test('stale verdicts are judged again one per frame, never all at once', () => {
    const { chunked, b } = pair(testMap(), [['UltraMode7', UM7]]);
    const C = chunked.Tilemap.ChunkPaint;
    step(chunked, b, 0, 0);
    const judged = C._verdicts.size;
    assert.ok(judged >= 5, `${judged} UltraMode7 hooks judged`);
    let probes = 0;
    const probe = C.probe;
    C.probe = function() { probes++; return probe.apply(this, arguments); };
    C.RECHECK = 0;
    for (let f = 1; f <= judged; f++) {
        step(chunked, b, 0, 0);
        assert.equal(probes, f, `frame ${f}`);
        assert.equal(chunked.$reactorTilemapStats.chunked, true);
    }
});

test('judging UltraMode7 hooks costs well under a frame', t => {
    const { chunked, b } = pair(testMap(), [['UltraMode7', UM7]]);
    step(chunked, b, 0, 0);
    const C = chunked.Tilemap.ChunkPaint;
    const started = performance.now();
    const rounds = 20;
    for (let i = 0; i < rounds; i++) {
        C._verdicts.clear();
        assert.equal(b._rrChunkBlocker(), null);
    }
    const ms = (performance.now() - started) / rounds;
    t.diagnostic(`one judgment of the UltraMode7 hooks: ${ms.toFixed(3)} ms`);
    assert.ok(ms < 8, `${ms} ms`);
});
