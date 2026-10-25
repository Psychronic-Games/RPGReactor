'use strict';
// The maps past a map's border in the editor's 2D view (editor/src/utils/MapNeighbor2D.js): the view
// pans as far past a side with a neighbor as the game's view does (half its screen), the neighbor's
// tiles are drawn there dimmed, from its file, a chunk at a time as they come into view; nothing
// there takes input; a file written, a shift or another map draws them again; the Surroundings
// tick hides them and the reach with them. Its rules are the runtime's (Reactor3D.neighborsOf,
// Neighbors.offsetOf) whether or not a 3D runtime is loaded.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repo = path.resolve(editorRoot, '..');
const metrics = require(path.join(editorRoot, 'src', 'utils', 'TileMetrics.js'));
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

/** The runtime's own answers, from reactor_3d_surround.js as the game loads it. */
function runtimeRules() {
    const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, performance, setTimeout, clearTimeout, TextDecoder };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis; self = globalThis;', ctx);
    const read = name => fs.readFileSync(path.join(repo, 'runtime', name), 'utf8');
    vm.runInContext(read('libs/three.js'), ctx, { filename: 'three.js' });
    vm.runInContext(read('reactor_3d.js'), ctx, { filename: 'reactor_3d.js' });
    vm.runInContext(read('reactor_3d_surround.js'), ctx, { filename: 'reactor_3d_surround.js' });
    return ctx.Reactor3D;
}

/** The module with no 3D runtime, as a 2D session holds it. */
function bare() {
    const ctx = { console: { log() {}, warn() {}, error: console.error }, performance, setTimeout };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(editorRoot, 'src/utils/MapNeighbor2D.js'), 'utf8'), ctx, { filename: 'MapNeighbor2D.js' });
    return ctx.RRMapNeighbor2D;
}

test('without a 3D runtime the sides and places are the runtime\'s', () => {
    const R = runtimeRules(), V = bare();
    const raws = [
        null, {}, { north: 7 }, { east: { map: 9, shift: 12 } }, { west: { map: '3', shift: '-4' } },
        { south: { map: 0 } }, { north: { map: -2 } }, { east: { map: 4, shift: 99999 } }, { west: { map: 2.6, shift: 1.4 } },
        { north: { map: 'x' } }, { south: { map: 5, shift: 'y' } }
    ];
    for (const raw of raws) {
        const map = { width: 30, height: 20, reactor3d: { surround: { style: 'none', neighbors: raw } } };
        assert.deepEqual(plain(V.neighborsOf(map)), plain(R.neighborsOf(map)), JSON.stringify(raw));
    }
    const map = { width: 30, height: 20 };
    for (const side of ['north', 'east', 'south', 'west']) {
        for (const entry of [{ map: 2 }, { map: 2, shift: 5 }, { map: 2, shift: -3 }]) {
            assert.deepEqual(plain(V.offsetOf(map, side, entry, 12, 9)), plain(R.Neighbors.offsetOf(map, side, entry, 12, 9)), side + JSON.stringify(entry));
        }
    }
});

test('the reach is half the game\'s screen, and a strip is the neighbor cut to it', () => {
    const V = bare();
    assert.deepEqual(plain(V.reachTiles({ advanced: { screenWidth: 816, screenHeight: 624 } }, 48, 48)), { x: 9, y: 7 });
    assert.deepEqual(plain(V.reachTiles({ advanced: { screenWidth: 1280, screenHeight: 720 } }, 48, 48)), { x: 14, y: 8 });
    assert.deepEqual(plain(V.reachTiles(null, 32, 32)), { x: 13, y: 10 });
    const map = { width: 30, height: 20 }, reach = { x: 9, y: 7 };
    // A north neighbor wider than the map, shifted left: its bottom rows, along the map and the reach past each end.
    assert.deepEqual(plain(V.stripOf('north', map, V.offsetOf(map, 'north', { map: 2, shift: -20 }, 60, 40), 60, 40, reach)), { x0: -9, y0: -7, x1: 39, y1: 0 });
    // An east neighbor shorter than the side: only where it lies.
    assert.deepEqual(plain(V.stripOf('east', map, V.offsetOf(map, 'east', { map: 2, shift: 5 }, 25, 8), 25, 8, reach)), { x0: 30, y0: 5, x1: 39, y1: 13 });
    // A neighbor slid wholly past the reach shows nothing.
    assert.equal(V.stripOf('south', map, V.offsetOf(map, 'south', { map: 2, shift: 60 }, 10, 10), 10, 10, reach), null);
    // A west neighbor narrower than the reach: all of its width.
    assert.deepEqual(plain(V.stripOf('west', map, V.offsetOf(map, 'west', { map: 2 }, 4, 20), 4, 20, reach)), { x0: -4, y0: 0, x1: 0, y1: 20 });
});

test('chunks are whole squares of the strip in view; detail halves as the zoom goes out', () => {
    const V = bare();
    const strip = { x0: -9, y0: -7, x1: 39, y1: 0 };
    assert.deepEqual(plain(V.chunksIn(strip, { x0: -100, y0: -100, x1: 100, y1: 100 }, 16)), [[-1, -1], [0, -1], [1, -1], [2, -1]]);
    assert.deepEqual(plain(V.chunksIn(strip, { x0: 20, y0: -3, x1: 25, y1: 5 }, 16)), [[1, -1]]);
    assert.deepEqual(plain(V.chunksIn(strip, { x0: 0, y0: 0, x1: 10, y1: 10 }, 16)), []);
    assert.equal(V.levelFor(1), 1);
    assert.equal(V.levelFor(2), 1);
    assert.equal(V.levelFor(0.6), 1);
    assert.equal(V.levelFor(0.5), 0.5);
    assert.equal(V.levelFor(0.3), 0.5);
    assert.equal(V.levelFor(0.25), 0.25);
    assert.equal(V.levelFor(0.01), 0.125);
    assert.equal(V.levelFor(0.5, 2), 1, 'a dense screen shows twice the pixels');
});

//-----------------------------------------------------------------------------
// In the map view: the real TilemapManager's pan range and crop, the module beside it

const VIEWPORT = { width: 800, height: 600 };

function view({ neighbors = { east: { map: 2 } }, tick: ticked = true, mapSize = { width: 30, height: 20 } } = {}) {
    const files = new Map();
    const put = (file, value) => files.set(file, { text: JSON.stringify(value), mtimeMs: (files.get(file)?.mtimeMs || 1000) + 1 });
    const fileOf = id => path.join('/project', 'data', 'Map' + String(id).padStart(3, '0') + '.json');
    const mapOf = (id, width, height, tile) => {
        const data = new Array(width * height * 6).fill(0);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = tile + x + y * 100;
        data[4 * width * height] = 15; // a shadow at the neighbor's first tile
        return { width, height, tilesetId: 1, data, events: [null, { id: 1, x: 0, y: 0, name: 'Guard' }] };
    };
    put(fileOf(2), mapOf(2, 25, 20, 10000));
    put(fileOf(3), mapOf(3, 30, 12, 20000));
    const reads = [];
    const disk = {
        statSync(file) { const f = files.get(file); if (!f) throw new Error('ENOENT'); return { mtimeMs: f.mtimeMs, size: f.text.length }; },
        existsSync: file => files.has(file),
        readFileSync: file => files.get(file).text,
        promises: { readFile: async file => { reads.push(file); return files.get(file).text; } },
        writeFileSync() { throw new Error('nothing here writes a file'); }
    };

    class Container {
        constructor() { this.children = []; this.parent = null; this.visible = true; this.destroyed = false; this.x = 0; this.y = 0; this.scale = { x: 1, y: 1, set(a) { this.x = a; this.y = a; } }; }
        addChild(c) { c.parent?.removeChild(c); this.children.push(c); c.parent = this; return c; }
        addChildAt(c, i) { c.parent?.removeChild(c); this.children.splice(i, 0, c); c.parent = this; return c; }
        removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parent = null; return c; }
        destroy() { this.destroyed = true; }
        on() {}
    }
    class Sprite extends Container { constructor(texture) { super(); this.texture = texture; } }
    const box = { checked: ticked };
    const element = { getBoundingClientRect: () => ({ ...VIEWPORT, left: 0, top: 0 }), querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} };
    const frames = [];
    const sandbox = {
        console: Object.assign(Object.create(console), { log() {}, warn() {}, error: console.error }),
        RRTileMetrics: metrics, performance, setTimeout,
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
        PIXI: {
            TextureStyle: { defaultOptions: {} }, Rectangle: class {}, Container, Sprite,
            Texture: { from: canvas => ({ canvas, source: { style: {} } }) }
        },
        document: {
            getElementById: id => (id === 'canvas-container' ? element : id === 'map-surround-view' ? box : null),
            createElement: () => ({ width: 0, height: 0, getContext: () => ({ setTransform(...m) { this.m = m; } }) }),
            addEventListener() {}, removeEventListener() {}, readyState: 'complete'
        },
        addEventListener() {}, removeEventListener() {}
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    const TilemapManager = new vm.Script(`${source}\n;TilemapManager;`).runInContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(editorRoot, 'src/utils/MapNeighbor2D.js'), 'utf8'), sandbox, { filename: 'MapNeighbor2D.js' });
    const V = sandbox.RRMapNeighbor2D;

    const system = { tileSize: 48, advanced: { screenWidth: 816, screenHeight: 624 } };
    const tm = new TilemapManager({ renderer: { resize(w, h) { tm.app.screen.width = w; tm.app.screen.height = h; } }, screen: { width: 800, height: 600 }, canvas: { style: {} } }, '/project', {
        getSystem: () => system, getTileset: id => ({ id, tilesetNames: ['A1', '', '', '', '', 'B'], flags: [] })
    });
    tm.fs = disk; tm.path = path;
    tm.container = new Container();
    tm.currentMap = { id: 1, ...mapSize, data: [], reactor3d: { surround: { style: 'none', neighbors } } };
    tm.currentTileset = { tilesetNames: ['A1', '', '', '', '', 'B'] };
    // Its own sheets, decoded: the neighbor on the same tileset draws from them.
    tm.tilesetTextures = { 0: { source: { resource: { width: 768 } } }, 5: { source: { resource: { width: 768 } } } };
    tm.updateScrollbars = function() { this.clampContainerToMap(); };
    const drawn = [];
    tm.drawTileToCanvas = (ctx, id, x, y) => drawn.push({ id, x, y, m: ctx.m });
    tm.drawShadowToCanvas = (ctx, bits, x, y) => drawn.push({ shadow: bits, x, y });
    const flush = async () => { for (let i = 0; i < 5; i++) await tick(); while (frames.length) frames.shift()(); };
    return { tm, V, put, fileOf, mapOf, files, box, drawn, flush, frames, sandbox, reads };
}

const chunkSprites = tm => (tm._neighbor2D?.layer?.children || []);

test('the view pans half the game\'s screen past a side with a neighbor, and no further elsewhere', async () => {
    const w = view({ neighbors: { east: { map: 2 }, north: { map: 3, shift: -5 } } });
    const { tm, V } = w;
    // Before the neighbor is read nothing lies past the edge.
    V.sync(tm);
    assert.deepEqual(plain(V.reach(tm)), { north: 0, east: 0, south: 0, west: 0 });
    await w.flush();
    assert.deepEqual(plain(V.reach(tm)), { north: 7, east: 9, south: 0, west: 0 });
    const bounds = tm.panBounds(1);
    // East: the map's right edge may come 9 tiles in from the viewport's; north: its top 7 tiles down. West and south: the edge.
    assert.equal(bounds.minX, VIEWPORT.width - 30 * 48 - 9 * 48);
    assert.equal(bounds.maxY, 7 * 48);
    assert.equal(bounds.maxX, 0);
    assert.equal(bounds.minY, Math.min(0, VIEWPORT.height - 20 * 48));
    // At half zoom the reach is half the pixels.
    assert.equal(tm.panBounds(0.5).maxY, 7 * 24);
});

test('the neighbor\'s tiles are drawn past the edge, dimmed, a picture that takes no input; its events are not', async () => {
    const w = view();
    const { tm, V, drawn } = w;
    tm.container.x = -(30 * 48 + 9 * 48 - VIEWPORT.width); // scrolled hard right
    V.sync(tm);
    await w.flush();
    const layer = tm._neighbor2D.layer;
    assert.equal(tm.container.children[0], layer, 'under everything of the map\'s own');
    assert.equal(layer.eventMode, 'none');
    assert.equal(layer.interactiveChildren, false);
    const sprites = chunkSprites(tm);
    assert.ok(sprites.length > 0, 'chunks drawn');
    for (const sprite of sprites) {
        assert.equal(sprite.tint, V.DIM);
        assert.equal(sprite.eventMode, 'none');
        assert.ok(sprite.x >= 30 * 48, 'past the east edge only');
    }
    // The neighbor's own tiles from its first column, at its own coordinates.
    const first = drawn.find(d => d.id === 10000);
    assert.ok(first && first.x === 0 && first.y === 0, 'the neighbor\'s first tile');
    assert.ok(drawn.some(d => d.shadow === 15), 'its shadows');
    assert.ok(!drawn.some(d => d.x >= 9 && d.id !== undefined), 'no column past the reach');
    assert.equal(JSON.stringify(drawn).includes('Guard'), false, 'no events');
    // The map's own hit surface still ends at its edge: a click past it reaches no map handler.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    assert.match(source, /x >= 0 && y >= 0 &&\s*x < this\.currentMap\.width \* this\.TILE_WIDTH && y < this\.currentMap\.height \* this\.TILE_HEIGHT/);
});

test('a file written, a shift and another map draw it again; None takes it away', async () => {
    const w = view();
    const { tm, V, put, fileOf, mapOf } = w;
    tm.container.x = -(30 * 48 + 9 * 48 - VIEWPORT.width);
    V.sync(tm);
    await w.flush();
    const before = chunkSprites(tm).slice();
    // Nothing changed: nothing is read or drawn again.
    V.sync(tm);
    await w.flush();
    assert.deepEqual(chunkSprites(tm), before);
    // The neighbor saved.
    put(fileOf(2), mapOf(2, 25, 20, 30000));
    w.drawn.length = 0;
    V.sync(tm);
    await w.flush();
    assert.ok(w.drawn.some(d => d.id === 30000), 'its new tiles');
    assert.ok(before.every(s => !s.parent), 'the old chunks went');
    // Slid down five tiles: the strip moves with it.
    tm.currentMap.reactor3d.surround.neighbors.east = { map: 2, shift: 5 };
    V.sync(tm);
    await w.flush();
    assert.deepEqual(plain(tm._neighbor2D.sides.east.strip), { x0: 30, y0: 5, x1: 39, y1: 25 });
    // Another map there.
    tm.currentMap.reactor3d.surround.neighbors.east = { map: 3 };
    V.sync(tm);
    await w.flush();
    assert.equal(tm._neighbor2D.sides.east.mapId, 3);
    // None.
    tm.currentMap.reactor3d.surround.neighbors = {};
    V.sync(tm);
    await w.flush();
    assert.equal(tm._neighbor2D.sides.east, undefined);
    assert.equal(chunkSprites(tm).length, 0);
    assert.deepEqual(plain(V.reach(tm)), { north: 0, east: 0, south: 0, west: 0 });
    assert.equal(tm.panBounds(1).minX, VIEWPORT.width - 30 * 48);
});

test('the Surroundings tick hides the strips and the reach, and shows them again without reading anything', async () => {
    const w = view();
    const { tm, V, box } = w;
    V.sync(tm);
    await w.flush();
    assert.equal(V.reach(tm).east, 9);
    box.checked = false;
    V.sync(tm);
    assert.equal(tm._neighbor2D.layer.visible, false);
    assert.deepEqual(plain(V.reach(tm)), { north: 0, east: 0, south: 0, west: 0 });
    assert.equal(tm.panBounds(1).minX, VIEWPORT.width - 30 * 48, 'the view keeps to the map');
    const reads = w.reads.length;
    box.checked = true;
    V.sync(tm);
    assert.equal(tm._neighbor2D.layer.visible, true);
    assert.equal(V.reach(tm).east, 9);
    await w.flush();
    assert.equal(w.reads.length, reads, 'nothing read again');
});

test('another map opened lets the strips go; a map with no neighbors pans as before', async () => {
    const w = view();
    const { tm, V } = w;
    V.sync(tm);
    await w.flush();
    tm.currentMap = { id: 4, width: 30, height: 20, data: [] };
    assert.deepEqual(plain(V.reach(tm)), { north: 0, east: 0, south: 0, west: 0 }, 'nothing past the edge before it is in line');
    V.sync(tm);
    assert.deepEqual(Object.keys(tm._neighbor2D.sides), []);
    const bounds = tm.panBounds(1);
    assert.equal(bounds.maxX, 0);
    assert.equal(bounds.minX, VIEWPORT.width - 30 * 48);
});

test('chunks are drawn only in view, a few a frame, and at the zoom\'s detail', async () => {
    const w = view({ mapSize: { width: 200, height: 200 }, neighbors: { south: { map: 3 } } });
    const { tm, V } = w;
    V.sync(tm);
    await w.flush();
    // At the map's top-left nothing of the south strip is in view.
    assert.equal(chunkSprites(tm).length, 0);
    tm.container.y = -(200 * 48 + 7 * 48 - VIEWPORT.height);
    tm.applyViewportCrop();
    await w.flush();
    const near = chunkSprites(tm).length;
    assert.ok(near > 0 && near < 5, `only the chunks in view (${near})`);
    // Zoomed out: drawn again at half the pixels.
    tm.container.scale.set(0.5);
    tm.container.y = -(200 * 24 + 7 * 24 - VIEWPORT.height);
    tm.applyViewportCrop();
    await w.flush();
    const levels = [...tm._neighbor2D.sides.south.chunks.values()].map(c => c.level);
    assert.ok(levels.length && levels.every(level => level === 0.5), JSON.stringify(levels));
    const sprite = chunkSprites(tm)[0];
    assert.equal(sprite.texture.canvas.height, 7 * 24, 'half the pixels');
    assert.equal(sprite.height, 7 * 48, 'over the same tiles');
});

test('the crop takes in a strip past the right or bottom edge', async () => {
    const w = view({ mapSize: { width: 10, height: 8 }, neighbors: { east: { map: 2 }, south: { map: 3 } } });
    const { tm, V } = w;
    V.sync(tm);
    await w.flush();
    tm.applyViewportCrop();
    assert.equal(tm.app.screen.width, Math.min(VIEWPORT.width, 10 * 48 + 9 * 48));
    assert.equal(tm.app.screen.height, Math.min(VIEWPORT.height, 8 * 48 + 7 * 48));
});
