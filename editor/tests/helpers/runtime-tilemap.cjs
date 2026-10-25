'use strict';
// The runtime Tilemap (reactor_core_display.js, from `function Tilemap()` to
// the v5 renderer) loaded on Node's PIXI 8, without a GPU: the tile atlas is
// a layout with no canvas behind it, so meshes, chunks and their quads can
// be built and read back.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PIXI = require('pixi.js');

const runtimeRoot = path.resolve(__dirname, '..', '..', '..', 'runtime');

// The legacy super call as pixi_compat makes it for PIXI 8 classes.
function PIXISuper(PixiClass, instance, args) {
    const tmp = Reflect.construct(PixiClass, args || []);
    for (const key of Reflect.ownKeys(tmp)) {
        Object.defineProperty(instance, key, Object.getOwnPropertyDescriptor(tmp, key));
    }
    const visited = new WeakSet();
    const replace = (obj, depth) => {
        if (!obj || typeof obj !== 'object' || visited.has(obj) || depth > 4) return;
        visited.add(obj);
        for (const k of Reflect.ownKeys(obj)) {
            try {
                const v = obj[k];
                if (v === tmp) obj[k] = instance;
                else if (v && typeof v === 'object') replace(v, depth + 1);
            } catch (e) { /* unreadable */ }
        }
    };
    replace(instance, 0);
    return instance;
}

/** A context holding Tilemap; `atlasSheets` are the sheet sizes the fake atlas packs. */
function loadRuntimeTilemap(options = {}) {
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_core_display.js'), 'utf8');
    const start = source.indexOf('function Tilemap() {');
    const end = source.indexOf('Tilemap.Renderer = function() {');
    if (start < 0 || end < start) throw new Error('Tilemap section not found');
    const context = {
        PIXI, PIXISuper, console, performance,
        Point: PIXI.Point,
        Graphics: { frameCount: 0, width: options.width || 816, height: options.height || 624 }
    };
    vm.createContext(context);
    vm.runInContext('Number.prototype.mod = function(n) { return ((this % n) + n) % n; };', context);
    vm.runInContext(source.slice(start, end) + '\nthis.Tilemap = Tilemap;', context);
    const { Tilemap } = context;
    const sheets = options.atlasSheets || [[768, 576], [768, 576], [768, 384], [768, 720], [384, 768],
        [768, 768], [768, 768], [768, 768], [768, 768]];
    context.atlasRequests = 0;
    Tilemap.Layer._acquireV8Atlas = function(bitmaps) {
        context.atlasRequests++;
        const images = [];
        for (let i = 0; i < Tilemap.Layer.V8_ATLAS_SHEETS; i++) {
            const size = sheets[i];
            images.push(size ? { image: null, width: size[0], height: size[1] } : null);
        }
        const layout = Tilemap.Layer._v8AtlasLayout(images, 16384);
        return Object.assign({ bitmaps, texture: PIXI.Texture.EMPTY, refs: 1 }, layout);
    };
    Tilemap.Layer._releaseV8Atlas = function() {};
    return context;
}

const readyBitmap = () => ({ isReady: () => true, addLoadListener() {}, image: { width: 768, height: 768 } });

/**
 * A tilemap over `map` ({ width, height, data, flags }) with a mesh backend
 * and its tileset given, the way Spriteset_Map sets one up.
 */
function makeTilemap(context, map) {
    const { Tilemap } = context;
    context.$reactorTilemapBackend = 'mesh';
    const tilemap = new Tilemap();
    tilemap.setData(map.width, map.height, map.data);
    tilemap.flags = map.flags || [];
    tilemap.setBitmaps(Array.from({ length: 9 }, readyBitmap));
    tilemap.animationCount = 0;
    tilemap.animationFrame = 0;
    return tilemap;
}

module.exports = { loadRuntimeTilemap, makeTilemap, PIXI };
