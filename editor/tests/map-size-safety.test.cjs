const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadClass(file, name, context = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');
    return vm.runInNewContext(`${source}\n${name};`, { console, ...context });
}

test('Reactor accepts maps through 512x512 and rejects unsafe dimensions', () => {
    const context = { console };
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'DataLimits.js'), 'utf8');
    vm.runInNewContext(source, context);

    assert.equal(context.rrIsMapSizeSupported(512, 512), true);
    assert.equal(context.rrIsMapSizeSupported(513, 512), false);
    assert.equal(context.rrIsMapSizeSupported(10000, 10000), false);
    assert.equal(context.rrIsMapSizeSupported(128.5, 128), false);
    assert.equal(context.rrIsMapSizeSupported(0, 128), false);
});

test('Map Properties rejects an oversized map before allocation or mutation', async () => {
    const alerts = [];
    const width = { value: '10000', focus() { this.focused = true; } };
    const height = { value: '10000', focus() { this.focused = true; } };
    const context = {
        alert: message => alerts.push(message),
        // Map Properties tells through the editor's themed dialog.
        RRDialog: { alert: async message => { alerts.push(message); } },
        document: {
            getElementById(id) {
                if (id === 'map-width-input') return width;
                if (id === 'map-height-input') return height;
                throw new Error(`unsafe save continued to ${id}`);
            }
        },
        RR_LIMITS: { MAP_WIDTH: 512, MAP_HEIGHT: 512 },
        rrIsMapSizeSupported: (w, h) => Number.isInteger(w) && Number.isInteger(h) &&
            w >= 1 && w <= 512 && h >= 1 && h <= 512,
        process,
        require,
        nw: {}
    };
    const ProjectController = loadClass('ProjectController.js', 'ProjectController', context);
    const controller = Object.create(ProjectController.prototype);
    controller._tt = text => text;

    assert.equal(await controller.saveMapProperties(), false);
    assert.match(alerts[0], /1 to 512/);
    assert.equal(width.focused, true);
});

test('full-map layer caches are bounded by GPU limits and memory budget', () => {
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager');
    const gl = {
        MAX_TEXTURE_SIZE: 1,
        MAX_RENDERBUFFER_SIZE: 2,
        MAX_VIEWPORT_DIMS: 3,
        getParameter(key) {
            if (key === 3) return [16384, 16384];
            return 16384;
        }
    };
    const manager = Object.create(TilemapManager.prototype);
    manager.app = { renderer: { gl } };
    manager.layerCacheOptions = { resolution: 1 };
    manager._liveLayers = new Set();
    let cacheCalls = 0;
    let cacheDisables = 0;
    let cacheUpdates = 0;
    const layer = {
        isCachedAsTexture: false,
        getLocalBounds: () => ({ width: 24000, height: 24000 }),
        cacheAsTexture(options) {
            if (options === false) cacheDisables++;
            else cacheCalls++;
        },
        updateCacheTexture() { cacheUpdates++; }
    };

    manager.cacheLayerIfStatic(layer);
    assert.equal(cacheCalls, 0, 'a 500x500 map cannot request a 32768-square cache');

    layer.getLocalBounds = () => ({ width: 1536, height: 1536 });
    manager.cacheLayerIfStatic(layer);
    assert.equal(cacheCalls, 1, 'small bounded layers can still use the fast cache path');

    layer.getLocalBounds = () => ({ width: 12288, height: 12288 });
    assert.equal(manager.isLayerCacheSafe(layer), false,
        'a dimensionally legal but 1 GiB cache is rejected by the byte budget');

    layer.isCachedAsTexture = true;
    manager.refreshLayerCache(layer);
    assert.equal(cacheDisables, 1, 'a cache is disabled when painting expands it past the budget');
    assert.equal(cacheUpdates, 0, 'the unsafe framebuffer is never reallocated');
});

test('oversized imported map files are rejected before JSON parsing', async () => {
    const quietConsole = { log() {}, warn() {}, error() {} };
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager', { console: quietConsole });
    let reads = 0;
    const manager = Object.create(TilemapManager.prototype);
    manager._mapLoadGeneration = 0;
    manager.fs = {
        existsSync: () => true,
        statSync: () => ({ size: 65 * 1024 * 1024 }),
        readFileSync() { reads++; return '{}'; }
    };
    manager.path = { join: (...parts) => parts.join('/') };
    manager.projectPath = '/project';
    manager.databaseManager = {};
    manager.currentMap = null;
    manager.currentTileset = null;
    manager.savedMapState = null;

    assert.equal(await manager.loadMap(1), false);
    assert.equal(reads, 0);
});

test('large maps virtualize tiles and retain only a bounded undo history', () => {
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager');
    const tilemap = Object.create(TilemapManager.prototype);
    tilemap.virtualMapCellThreshold = 128 * 128;
    tilemap.currentMap = { width: 512, height: 512 };
    assert.equal(tilemap.usesVirtualViewport(), true);
    tilemap.currentMap = { width: 128, height: 128 };
    assert.equal(tilemap.usesVirtualViewport(), false);

    const MapEditor = require(path.join(editorRoot, 'src', 'MapEditor.js'));
    const editor = Object.create(MapEditor.prototype);
    editor.maxUndoSteps = 50;
    editor.tilemapManager = { currentMap: { data: { length: 512 * 512 * 6 } } };
    const history = new Array(50).fill(null);
    editor.trimMapHistory(history);
    assert.equal(history.length, 3, 'mixed map snapshots stay within the 64 MiB history budget');
});

test('virtual windows retain overlap, reconcile strips, and cover transforms before commit', () => {
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager');
    const manager = Object.create(TilemapManager.prototype);
    manager.virtualMapCellThreshold = 128 * 128;
    manager.virtualChunkSize = 32;
    manager.virtualChunkHalo = 1;
    manager.TILE_SIZE = manager.TILE_WIDTH = manager.TILE_HEIGHT = 48;
    manager.currentMap = { width: 512, height: 512 };
    manager.layers = {
        ground: null, lower1: null, lower2: null, lower3: null, shadow: null,
        upper0: null, upper1: null, upper2: null, upper3: null
    };
    manager.a1TilePositions = [];
    manager.cacheLayerIfStatic = () => {};
    const added = [];
    const removed = [];
    manager.renderTileCell = (x, y) => added.push(`${x},${y}`);
    manager.destroyTileCell = (x, y) => removed.push(`${x},${y}`);

    const first = manager.getBufferedTileBounds({ startX: 32, startY: 32, endX: 64, endY: 64 });
    assert.deepEqual([first.startX, first.startY, first.endX, first.endY], [0, 0, 96, 96]);
    manager.reconcileVirtualTileBounds(first);
    assert.equal(added.length, 96 * 96);

    added.length = 0;
    const second = manager.getBufferedTileBounds({ startX: 64, startY: 32, endX: 96, endY: 64 });
    manager.reconcileVirtualTileBounds(second);
    assert.equal(added.length, 32 * 96, 'only the entering chunk strip is created');
    assert.equal(removed.length, 0, 'leaving chunks are discarded as containers rather than cell by cell');
    assert.equal(added.includes('64,64'), false, 'overlapping cells retain their existing geometry');

    let reconciles = 0;
    manager.container = { x: 0, y: 0, scale: { x: 1, set(value) { this.x = value; } } };
    manager.getVisibleTileBounds = () => ({ startX: 32, startY: 32, endX: 64, endY: 64 });
    manager.reconcileVirtualTileBounds = () => { reconciles++; };
    manager.ensureVirtualViewportCoverage();
    assert.equal(reconciles, 0, 'motion inside the preload halo performs no tile work');

    let ensured;
    manager.panBounds = () => ({ minX: -1000, minY: -1000 });
    manager.ensureVirtualViewportCoverage = (x, y, scale) => {
        ensured = { x, y, scale, oldX: manager.container.x };
    };
    manager.setViewportTransform(-100, -80, 0.5);
    assert.deepEqual(ensured, { x: -100, y: -80, scale: 0.5, oldX: 0 },
        'destination coverage is prepared before the transform changes');
    assert.deepEqual([manager.container.x, manager.container.y, manager.container.scale.x], [-100, -80, 0.5]);

    const floor = manager.minimumZoomScale(1280, 720);
    assert.ok(floor <= 720 / (512 * 48), 'large-map minimum zoom can show the complete map');
});

test('virtual tiles are grouped into bounded per-layer chunk containers', () => {
    class Container {
        constructor() {
            this.children = [];
            this.parent = null;
        }
        addChild(child) {
            child.parent = this;
            this.children.push(child);
        }
        removeChild(child) {
            this.children.splice(this.children.indexOf(child), 1);
            child.parent = null;
        }
        destroy() {
            this.destroyed = true;
        }
    }
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager', {
        PIXI: { Container }
    });
    const manager = Object.create(TilemapManager.prototype);
    manager.virtualMapCellThreshold = 128 * 128;
    manager.virtualChunkSize = 32;
    manager.currentMap = { width: 200, height: 200 };
    manager._virtualChunkLayers = new Map();
    manager._layerNameMap = new Map();
    const layer = new Container();
    manager._layerNameMap.set(layer, 'ground');

    const first = manager.virtualTileLayer(layer, 1, 1);
    assert.equal(manager.virtualTileLayer(layer, 31, 31), first, 'one holder covers one 32x32 chunk');
    assert.notEqual(manager.virtualTileLayer(layer, 32, 1), first, 'the next chunk gets another holder');
    assert.equal(layer.children.length, 2);
    assert.equal(manager._layerNameMap.get(first), 'ground', 'holders retain canonical tracking keys');

    first.children.push({});
    manager.pruneVirtualChunkLayers();
    assert.equal(layer.children.length, 1, 'empty chunk holders are discarded');
    assert.equal(first.destroyed, undefined, 'resident chunk holders are retained');
});

test('virtual autotiles become GPU meshes and A1 animation updates UV buffers', () => {
    const PIXI = require('pixi.js');
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager', { PIXI });
    const manager = new TilemapManager({ renderer: {} }, '', {});
    manager.currentMap = { width: 200, height: 200 };
    manager.currentTileset = { flags: [] };
    manager.tilesetTextures[0] = PIXI.Texture.EMPTY;
    manager.tilesetTextures[1] = PIXI.Texture.EMPTY;
    manager._layerNameMap = new Map();
    const layer = new PIXI.Container();
    manager._layerNameMap.set(layer, 'ground');

    const holder = manager.virtualTileLayer(layer, 1, 1);
    manager.renderTile(manager.TILE_ID_A2, 1, 1, holder);
    manager.renderTile(manager.TILE_ID_A1, 2, 1, holder);
    manager.flushVirtualChunkMeshes();

    assert.equal(holder.children.length, 2, 'one mesh is emitted for each source sheet');
    assert.equal(holder.children.every(child => child instanceof PIXI.Mesh), true);
    const staticMesh = holder.children.find(child => !child._rrA1Tiles.length);
    const a1Mesh = holder.children.find(child => child._rrA1Tiles.length);
    assert.equal(staticMesh.geometry.getBuffer('aPosition').data.length, 32,
        'the mesh contains four quads with four XY vertices each');
    const before = Array.from(a1Mesh.geometry.getBuffer('aUV').data);
    manager.waterAnimationFrame = 1;
    manager.updateA1Tiles();
    assert.notDeepEqual(Array.from(a1Mesh.geometry.getBuffer('aUV').data), before,
        'water animation updates one mesh UV buffer instead of four sprites per cell');
    manager.destroyAllVirtualChunkLayers();
});

test('shadows render above both base tile planes and virtual pen updates stay chunked', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    const lower1 = source.indexOf('this.container.addChild(this.layers.lower1);');
    const shadow = source.indexOf('this.container.addChild(this.layers.shadow);');
    const lower2 = source.indexOf('this.container.addChild(this.layers.lower2);');
    assert.ok(lower1 < shadow && shadow < lower2,
        'shadows sit above data layers 0/1 and below decoration layers 2/3');

    const PIXI = require('pixi.js');
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager', { PIXI });
    const manager = new TilemapManager({ renderer: {} }, '', {});
    manager.currentMap = { width: 200, height: 200 };
    manager.currentTileset = { flags: [] };
    manager.layers.shadow = new PIXI.Container();
    manager._layerNameMap = new Map([[manager.layers.shadow, 'shadow']]);
    manager.blackShadowTexture = PIXI.Texture.EMPTY;

    manager.updateShadowTile(4, 5, 1);
    const chunks = manager._virtualChunkLayers.get(manager.layers.shadow);
    assert.equal(manager.layers.shadow.children.length, 1, 'the root contains one bounded chunk');
    assert.equal(chunks.get('0,0').children.length, 1, 'a click renders into that chunk immediately');
    assert.equal(manager.tileSprites['shadow_4_5'].length, 1);

    manager.updateShadowTile(4, 5, 0);
    assert.equal(manager.tileSprites['shadow_4_5'], undefined, 'erasing clears the tracked shadow');
    assert.equal(manager.layers.shadow.children.length, 0, 'an empty shadow chunk is pruned');
});
