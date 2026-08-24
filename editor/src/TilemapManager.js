// RPG Reactor - Tilemap Manager
// Handles tilemap rendering using Pixi.js, compatible with RPG Maker MZ format

// PIXI8: Set global texture defaults for pixel-perfect rendering BEFORE loading any textures
if (typeof PIXI !== 'undefined' && PIXI.TextureStyle) {
    PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';
}

class TilemapManager {
    // Atomic write for project data: write a temp sibling then rename over
    // the destination, so a crash/kill/full-disk mid-write can never destroy
    // the previous good file. Falls back to a plain write when the fs
    // implementation has no renameSync (test mocks, web host shims).
    _writeFileAtomic(fs, filePath, data, options) {
        const atomic = (typeof window !== 'undefined' && window.RRWriteFileAtomicSync) || null;
        if (atomic && fs && typeof fs.renameSync === 'function') {
            atomic(fs, filePath, data, options);
        } else {
            fs.writeFileSync(filePath, data, options);
        }
    }

    constructor(app, projectPath, databaseManager) {
        this.app = app;
        this.projectPath = projectPath;
        this.databaseManager = databaseManager;
        this.fs = null;
        this.path = null;
        this._mapLoadGeneration = 0;

        const host = typeof window !== 'undefined' ? window.RPGReactorHost : null;
        if (host?.fs && host?.path) {
            this.fs = host.fs;
            this.path = host.path;
        }

        // Initialize Node.js modules if running in NW.js
        if (!this.fs && typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }

        // Tilemap constants (RPG Maker MZ compatible).
        //
        // The pixel size comes from the project: MZ offers 48, 32, 24 and 16
        // and records the choice in System.json. Assuming 48 sampled a
        // 32-pixel project's sheets in 48-pixel steps, so every tile drew the
        // wrong art. The 48s in the tile-id arithmetic elsewhere are a
        // different number entirely — 48 shapes per autotile kind — and are
        // fixed by the format.
        this.TILE_SIZE = this.readTileSize();
        this.TILE_WIDTH = this.TILE_SIZE;
        this.TILE_HEIGHT = this.TILE_SIZE;
        this.TILESET_COLS = 8;  // A1-A5 tiles are 8 columns wide
        this.TILESET_ROWS_PER_SHEET = 16;

        // Tile ID ranges (RPG Maker MZ format)
        this.TILE_ID_A1 = 2048;  // Animated autotiles
        this.TILE_ID_A2 = 2816;  // Ground autotiles
        this.TILE_ID_A3 = 4352;  // Building/wall autotiles
        this.TILE_ID_A4 = 5888;  // Wall top autotiles
        this.TILE_ID_A5 = 1536;  // Normal tiles (A5 starts at 1536, not 8000!)
        this.TILE_ID_B = 0;      // Lower layer tileset B
        this.TILE_ID_C = 256;    // Upper layer tileset C
        this.TILE_ID_D = 512;    // Upper layer tileset D
        this.TILE_ID_E = 768;    // Upper layer tileset E
        this.TILE_ID_MAX = 8192; // Maximum tile ID: A4 has 48 kinds (5888 + 48*48 = 8192)

        // Current state
        this.currentMap = null;
        this.savedMapState = null;
        this.currentTileset = null;
        this.tilesetTextures = {};
        this.textureCache = {}; // PERFORMANCE: Cache sub-textures to avoid recreating them
        this.a1AnimationCache = {}; // PERFORMANCE: Cache A1 animation frame textures
        this.container = null;
        this.parallaxSprite = null;
        this.mapMask = null;
        this.layers = {
            parallax: null,
            ground: null,
            lower: null,
            upper: null,
            shadow: null
        };

        // Callbacks
        this.onZoomChange = null;
        // Pixel-art layer caches: the cached texture gets scaled by the
        // zoom, so it must sample nearest — cacheAsTexture defaults to
        // 'linear', which blurred every zoom-in past 100%.
        // resolution MUST be 1: PIXI defaults the cache to the renderer's
        // resolution (devicePixelRatio), which rasterizes 48px tiles into
        // dpr-times texels (first resample) before the zoom scale (second
        // resample) — live sprites resample once, so on scaled desktops
        // every cache/uncache cycle while painting made the art "breathe".
        // At resolution 1 the cache is an exact 1:1 texel copy and renders
        // pixel-identically to the live sprites.
        this.layerCacheOptions = { scaleMode: 'nearest', resolution: 1 };

        // Animation state for A1 autotiles
        this.waterAnimationFrame = 0; // 0, 1, or 2 (ping-pong: 0→1→2→1→0)
        this.waterfallAnimationFrame = 0; // 0, 1, or 2 (straight: 0→1→2→0)
        this.waterAnimationDirection = 1; // 1 for forward, -1 for backward
        this.animationTicker = null;
        this.a1AnimationEnabled = true;
        // PERFORMANCE: Track A1 tile positions to avoid scanning entire map every frame
        this.a1TilePositions = []; // Array of {x, y, layerIndex, tileId, pixiLayer, sprites}
        // PERFORMANCE: Track all tile sprites by position for fast updates
        this.tileSprites = {}; // Map of "layer_x_y" -> array of sprite objects
        // PERFORMANCE: Layer-to-name map to avoid if-else chains per tile
        this._layerNameMap = null; // Initialized after layers are created

        // PERFORMANCE: Viewport culling - only render visible tiles
        this.useViewportCulling = true; // Enable for initial fast render
        this.viewportMargin = 5; // Number of extra tiles to render beyond visible area
        this.lazyLoadChunkSize = 100; // Number of tiles to load per lazy-load batch
        this.lazyLoadTimeBudgetMs = 8; // Max time to spend per lazy-load batch (8ms leaves plenty of frame budget)
        this.isLazyLoadingPaused = false; // Pause lazy-loading during user interaction
        this.lazyLoadTimerBatch = null; // Timer for lazy loading remaining tiles
        this.virtualMapCellThreshold = 128 * 128;
        this.virtualChunkSize = 32;
        this.virtualChunkHalo = 1;
        this._renderedTileBounds = null;
        this._renderedViewportKey = null;
        this._virtualChunkLayers = new Map();

        // PERFORMANCE: Debounce canvas resize during zoom to prevent lag
        this.resizeDebounceTimer = null;
        this.resizeDebounceMs = 100; // Wait 100ms after last zoom before resizing canvas
        this.pendingScale = null; // Track pending scale for debounced resize

        // Autotile tables from RPG Maker MZ
        this.FLOOR_AUTOTILE_TABLE = [
            [[2, 4], [1, 4], [2, 3], [1, 3]], [[2, 0], [1, 4], [2, 3], [1, 3]],
            [[2, 4], [3, 0], [2, 3], [1, 3]], [[2, 0], [3, 0], [2, 3], [1, 3]],
            [[2, 4], [1, 4], [2, 3], [3, 1]], [[2, 0], [1, 4], [2, 3], [3, 1]],
            [[2, 4], [3, 0], [2, 3], [3, 1]], [[2, 0], [3, 0], [2, 3], [3, 1]],
            [[2, 4], [1, 4], [2, 1], [1, 3]], [[2, 0], [1, 4], [2, 1], [1, 3]],
            [[2, 4], [3, 0], [2, 1], [1, 3]], [[2, 0], [3, 0], [2, 1], [1, 3]],
            [[2, 4], [1, 4], [2, 1], [3, 1]], [[2, 0], [1, 4], [2, 1], [3, 1]],
            [[2, 4], [3, 0], [2, 1], [3, 1]], [[2, 0], [3, 0], [2, 1], [3, 1]],
            [[0, 4], [1, 4], [0, 3], [1, 3]], [[0, 4], [3, 0], [0, 3], [1, 3]],
            [[0, 4], [1, 4], [0, 3], [3, 1]], [[0, 4], [3, 0], [0, 3], [3, 1]],
            [[2, 2], [1, 2], [2, 3], [1, 3]], [[2, 2], [1, 2], [2, 3], [3, 1]],
            [[2, 2], [1, 2], [2, 1], [1, 3]], [[2, 2], [1, 2], [2, 1], [3, 1]],
            [[2, 4], [3, 4], [2, 3], [3, 3]], [[2, 4], [3, 4], [2, 1], [3, 3]],
            [[2, 0], [3, 4], [2, 3], [3, 3]], [[2, 0], [3, 4], [2, 1], [3, 3]],
            [[2, 4], [1, 4], [2, 5], [1, 5]], [[2, 0], [1, 4], [2, 5], [1, 5]],
            [[2, 4], [3, 0], [2, 5], [1, 5]], [[2, 0], [3, 0], [2, 5], [1, 5]],
            [[0, 4], [3, 4], [0, 3], [3, 3]], [[2, 2], [1, 2], [2, 5], [1, 5]],
            [[0, 2], [1, 2], [0, 3], [1, 3]], [[0, 2], [1, 2], [0, 3], [3, 1]],
            [[2, 2], [3, 2], [2, 3], [3, 3]], [[2, 2], [3, 2], [2, 1], [3, 3]],
            [[2, 4], [3, 4], [2, 5], [3, 5]], [[2, 0], [3, 4], [2, 5], [3, 5]],
            [[0, 4], [1, 4], [0, 5], [1, 5]], [[0, 4], [3, 0], [0, 5], [1, 5]],
            [[0, 2], [3, 2], [0, 3], [3, 3]], [[0, 2], [1, 2], [0, 5], [1, 5]],
            [[0, 4], [3, 4], [0, 5], [3, 5]], [[2, 2], [3, 2], [2, 5], [3, 5]],
            [[0, 2], [3, 2], [0, 5], [3, 5]], [[0, 0], [1, 0], [0, 1], [1, 1]]
        ];

        this.WALL_AUTOTILE_TABLE = [
            [[2, 2], [1, 2], [2, 1], [1, 1]], [[0, 2], [1, 2], [0, 1], [1, 1]],
            [[2, 0], [1, 0], [2, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]],
            [[2, 2], [3, 2], [2, 1], [3, 1]], [[0, 2], [3, 2], [0, 1], [3, 1]],
            [[2, 0], [3, 0], [2, 1], [3, 1]], [[0, 0], [3, 0], [0, 1], [3, 1]],
            [[2, 2], [1, 2], [2, 3], [1, 3]], [[0, 2], [1, 2], [0, 3], [1, 3]],
            [[2, 0], [1, 0], [2, 3], [1, 3]], [[0, 0], [1, 0], [0, 3], [1, 3]],
            [[2, 2], [3, 2], [2, 3], [3, 3]], [[0, 2], [3, 2], [0, 3], [3, 3]],
            [[2, 0], [3, 0], [2, 3], [3, 3]], [[0, 0], [3, 0], [0, 3], [3, 3]]
        ];

        this.WATERFALL_AUTOTILE_TABLE = [
            [[2, 0], [1, 0], [2, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]],
            [[2, 0], [3, 0], [2, 1], [3, 1]], [[0, 0], [3, 0], [0, 1], [3, 1]]
        ];
    }

    /**
     * The project's tile size in pixels, from System.json.
     *
     * Read rather than cached at module load because the Database can change
     * it, and read defensively because the manager is built before the
     * database has necessarily finished loading.
     */
    readTileSize() {
        const metrics = (typeof RRTileMetrics !== 'undefined' && RRTileMetrics)
            || (typeof window !== 'undefined' && window.RRTileMetrics);
        if (!metrics) return 48;
        const system = this.databaseManager && typeof this.databaseManager.getSystem === 'function'
            ? this.databaseManager.getSystem()
            : null;
        return metrics.tileSizeOf(system);
    }

    /**
     * Re-read the tile size, reporting whether it moved.
     *
     * Called when a project or its database loads, since the manager is
     * constructed first and would otherwise keep whatever default it started
     * with for the life of the project.
     */
    refreshTileMetrics() {
        const size = this.readTileSize();
        if (size === this.TILE_SIZE) return false;
        this.TILE_SIZE = size;
        this.TILE_WIDTH = size;
        this.TILE_HEIGHT = size;
        return true;
    }

    async loadMap(mapId) {
        const generation = ++this._mapLoadGeneration;
        if (!this.fs || !this.path) {
            return false;
        }

        const previousMap = this.currentMap;
        const previousTileset = this.currentTileset;
        const previousSavedMapState = this.savedMapState;
        try {
            // Load map data
            const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
            const mapPath = this.path.join(this.projectPath, 'data', mapFile);

            if (!this.fs.existsSync(mapPath)) {
                return false;
            }

            const maxMapBytes = globalThis.RR_LIMITS?.MAP_FILE_BYTES || 64 * 1024 * 1024;
            if (typeof this.fs.statSync === 'function' && this.fs.statSync(mapPath).size > maxMapBytes) {
                throw new RangeError(`Map ${mapId} exceeds the ${maxMapBytes}-byte editor safety limit`);
            }
            const mapData = JSON.parse(this.fs.readFileSync(mapPath, 'utf8'));
            const validMapSize = typeof globalThis.rrIsMapSizeSupported === 'function'
                ? globalThis.rrIsMapSizeSupported(mapData.width, mapData.height)
                : Number.isInteger(mapData.width) && Number.isInteger(mapData.height) &&
                    mapData.width >= 1 && mapData.width <= 512 && mapData.height >= 1 && mapData.height <= 512;
            if (!validMapSize) {
                throw new RangeError(`Map ${mapId} dimensions must be between 1x1 and 512x512`);
            }
            const expectedDataLength = mapData.width * mapData.height * 6;
            if (!Array.isArray(mapData.data) || mapData.data.length !== expectedDataLength) {
                throw new RangeError(`Map ${mapId} data must contain exactly ${expectedDataLength} entries`);
            }
            // Set the map ID (it's not stored in the JSON file)
            mapData.id = mapId;
            // Its 3D sidecar comes with it, and has to: grouping is painted on
            // the 2D canvas, so the file cannot wait for the 3D view to open.
            this.loadMapSidecar(mapData);

            // Load tileset for this map
            let tileset = this.databaseManager.getTileset(mapData.tilesetId);
            if (!tileset) {
                console.warn(`Tileset ${mapData.tilesetId} not found for map ${mapId}; using first available tileset as fallback.`);
                tileset = this.databaseManager.getTilesets()[0];
                if (!tileset) {
                    throw new Error(`No tileset is available for map ${mapId}`);
                }
            }
            // Load tileset images
            const tilesetTextures = await this.loadTilesetImages(tileset);
            if (this.destroyed || generation !== this._mapLoadGeneration) return false;

            // Commit only after every asynchronous dependency belongs to the
            // latest request. Until here the previously rendered map remains intact.
            for (const key in this.textureCache) {
                if (this.textureCache[key] && this.textureCache[key].destroy) {
                    this.textureCache[key].destroy(false);
                }
            }
            for (const key in this.a1AnimationCache) {
                if (this.a1AnimationCache[key] && this.a1AnimationCache[key].destroy) {
                    this.a1AnimationCache[key].destroy(false);
                }
            }
            this.textureCache = {};
            this.a1AnimationCache = {};
            this.currentMap = mapData;
            this.currentTileset = tileset;
            this.tilesetTextures = tilesetTextures;
            this._a2DecorKinds = null;

            // Create tilemap container
            this.createTilemapContainer();

            // Render the map
            this.renderMap();

            // Start with map at origin
            this.container.x = 0;
            this.container.y = 0;

            // Fit-to-viewport on map load: if this map is smaller than the viewport
            // at scale 1.0, upscale so it fills the viewport instead of leaving
            // empty space around it. Larger maps stay at scale 1.0.
            this.applyMinScaleClamp();

            // Shrink the PIXI canvas to the map's scaled dimensions so the
            // parallax doesn't render outside the actual map area.
            this.applyViewportCrop();

            // Update canvas size and scrollbars
            this.updateCanvasWrapperSize();
            this.updateScrollbars();
            this.captureSavedMapState();

            return true;
        } catch (error) {
            if (generation === this._mapLoadGeneration) {
                this.currentMap = previousMap;
                this.currentTileset = previousTileset;
                this.savedMapState = previousSavedMapState;
            }
            console.error(`Error loading map ${mapId}:`, error);
            return false;
        }
    }

    cancelPendingMapLoad() {
        this._mapLoadGeneration++;
    }

    assetUrl(filePath) {
        return typeof window !== 'undefined' && window.RPGReactorAssetUrl
            ? window.RPGReactorAssetUrl(filePath)
            : 'file://' + filePath.replace(/\\/g, '/');
    }

    async loadTilesetImages(tileset) {
        const imgPath = this.path.join(this.projectPath, 'img', 'tilesets');
        const textures = {};

        // Load all tileset images (A1-A5, B, C, D, E)
        const promises = [];

        for (let i = 0; i < tileset.tilesetNames.length; i++) {
            const name = tileset.tilesetNames[i];
            if (!name) continue;

            const filePath = this.path.join(imgPath, name + '.png');

            const fileUrl = this.assetUrl(filePath);

            // PERFORMANCE: Skip existsSync — let PIXI.Assets.load handle missing files
            // via catch handler. This avoids blocking synchronous disk I/O per tileset image.
            const idx = i;
            promises.push(
                PIXI.Assets.load(fileUrl).then(texture => {
                    // Set texture wrap mode to CLAMP to prevent tiling/repeating (PIXI v8 API)
                    texture.source.style.addressMode = 'clamp-to-edge';
                    texture.source.style.scaleMode = 'nearest'; // Pixel-perfect
                    // PIXI v8 defaults to proper alpha handling for PNG files
                    textures[idx] = texture;
                }).catch(err => {
                    // An empty slot is skipped above, so reaching here means a
                    // sheet the tileset actually names could not be loaded.
                    // Swallowing it silently leaves every tile drawn from that
                    // sheet rendering as nothing, with no clue why.
                    console.warn(
                        `Tileset sheet ${idx} ("${name}") failed to load from ${fileUrl}:`,
                        err && err.message ? err.message : err);
                })
            );
        }

        await Promise.all(promises);
        return textures;
    }

    /** Sheet slot a tile id is drawn from, matching the engine's own mapping. */
    setNumberForTileId(tileId) {
        if (this.isTileA1(tileId)) return 0;
        if (this.isTileA2(tileId)) return 1;
        if (this.isTileA3(tileId)) return 2;
        if (this.isTileA4(tileId)) return 3;
        if (this.isTileA5(tileId)) return 4;
        if (tileId <= 0 || tileId >= this.TILE_ID_A5) return -1;
        return 5 + Math.floor(tileId / 256);
    }

    /** True if any tile currently on the map is drawn from one of these slots. */
    mapUsesSheets(slots) {
        const map = this.currentMap;
        if (!map || !Array.isArray(map.data)) return false;
        const wanted = new Set(slots);
        // Only the four tile planes; shadow (4) and region (5) are not sheets.
        const planeCells = map.width * map.height * 4;
        for (let i = 0; i < planeCells; i++) {
            const tileId = map.data[i];
            if (tileId > 0 && wanted.has(this.setNumberForTileId(tileId))) return true;
        }
        return false;
    }

    /**
     * Rebind tileset sheets after the database rewrites them, without reloading
     * the map.
     *
     * `currentTileset` is captured when the map opens, so a sheet assigned
     * afterwards is absent from the array `loadTilesetImages` walks and its
     * texture never loads — every tile painted from it then draws nothing.
     *
     * Only the slots whose filename actually changed are reloaded, and the
     * repaint is skipped entirely unless a tile currently on the map is drawn
     * from one of them. Assigning a sheet to a previously empty slot — the
     * common case — therefore costs one image load and no repaint at all. An
     * earlier version called `renderMap()` unconditionally on every tileset
     * save, which froze large maps.
     */
    async refreshTilesetImages(tileset) {
        const next = tileset || this.currentTileset;
        if (!next || !Array.isArray(next.tilesetNames)) return false;

        const previousNames = (this.currentTileset && this.currentTileset.tilesetNames) || [];
        const nextNames = next.tilesetNames;
        const changed = [];
        for (let i = 0; i < Math.max(previousNames.length, nextNames.length); i++) {
            if ((previousNames[i] || '') !== (nextNames[i] || '')) changed.push(i);
        }

        this.currentTileset = next;
        if (changed.length === 0) return false;

        const imgPath = this.path.join(this.projectPath, 'img', 'tilesets');
        await Promise.all(changed.map(index => {
            const name = nextNames[index];
            if (!name) {
                delete this.tilesetTextures[index];
                return Promise.resolve();
            }
            const fileUrl = this.assetUrl(this.path.join(imgPath, name + '.png'));
            return PIXI.Assets.load(fileUrl).then(texture => {
                texture.source.style.addressMode = 'clamp-to-edge';
                texture.source.style.scaleMode = 'nearest';
                this.tilesetTextures[index] = texture;
            }).catch(err => {
                delete this.tilesetTextures[index];
                console.warn(
                    `Tileset sheet ${index} ("${name}") failed to load from ${fileUrl}:`,
                    err && err.message ? err.message : err);
            });
        }));

        // Per-tile textures are cut from the sheets and keyed by slot, so the
        // entries belonging to a replaced sheet have to go. Everything else
        // stays, which is what keeps this cheap.
        const changedSlots = new Set(changed);
        for (const cache of [this.textureCache, this.a1AnimationCache]) {
            for (const key in cache) {
                const parts = key.split('_');
                const slot = Number(parts[0] === 'auto' ? parts[1] : parts[0]);
                if (!changedSlots.has(slot)) continue;
                if (cache[key] && cache[key].destroy) cache[key].destroy(false);
                delete cache[key];
            }
        }
        if (changedSlots.has(0)) this._a2DecorKinds = null;

        if (this.mapUsesSheets(changed)) {
            this.renderMap();
        }
        return true;
    }

    createTilemapContainer() {
        // Remove old container if exists
        if (this.container) {
            this.destroyAllVirtualChunkLayers();
            this.app.stage.removeChild(this.container);
            this.container.destroy({ children: true });
        }

        // Create new container for tilemap
        this.container = new PIXI.Container();
        this.app.stage.addChild(this.container);

        // Position at origin so scrollbars work correctly
        this.container.x = 0;
        this.container.y = 0;

        // Enable interactive for dragging
        this.container.interactive = true;
        this.container.buttonMode = true;

        // Create layers
        this.layers.checkerboard = new PIXI.Container();
        this.layers.parallax = new PIXI.Container();
        this.layers.ground = new PIXI.Container();
        this.layers.lower1 = new PIXI.Container();
        this.layers.lower2 = new PIXI.Container();
        this.layers.lower3 = new PIXI.Container();
        // MZ ☆ ("higher") tiles: one upper container per data z-slot,
        // stacked ABOVE every lower container. A tile whose tileset flag
        // has bit 0x10 renders up here regardless of its z-slot — that's
        // how a ☆ roof piece at z2 covers a tree at z3 in MZ.
        this.layers.upper0 = new PIXI.Container();
        this.layers.upper1 = new PIXI.Container();
        this.layers.upper2 = new PIXI.Container();
        this.layers.upper3 = new PIXI.Container();
        // A1 water/waterfall tiles animate by in-place texture swaps, which
        // a cached layer would freeze. They render into these small live
        // overlays (one per z-slot, drawn directly above their slot's
        // static container) so the big static containers can ALWAYS be
        // cached as textures — with water in the ground container, a large
        // water map left ~200k live sprites re-rendering every frame.
        this.layers.a1ground = new PIXI.Container();
        this.layers.a1lower1 = new PIXI.Container();
        this.layers.a1lower2 = new PIXI.Container();
        this.layers.a1lower3 = new PIXI.Container();
        this.layers.shadow = new PIXI.Container();
        this.layers.layerHighlight = new PIXI.Container();

        // PERFORMANCE: Enable culling on all layers to skip rendering off-screen sprites
        this.layers.ground.cullable = true;
        this.layers.lower1.cullable = true;
        this.layers.lower2.cullable = true;
        this.layers.lower3.cullable = true;
        this.layers.upper0.cullable = true;
        this.layers.upper1.cullable = true;
        this.layers.upper2.cullable = true;
        this.layers.upper3.cullable = true;
        this.layers.a1ground.cullable = true;
        this.layers.a1lower1.cullable = true;
        this.layers.a1lower2.cullable = true;
        this.layers.a1lower3.cullable = true;
        this.layers.shadow.cullable = true;

        // PERFORMANCE: Build layer-to-name map for fast sprite tracking lookups.
        // Upper and A1 containers map to their z-slot's name: a cell holds
        // ONE tile per z-slot, so tracking keys stay per-slot no matter
        // which stack (lower/upper/A1) the sprite rendered into.
        this._layerNameMap = new Map([
            [this.layers.ground, 'ground'],
            [this.layers.lower1, 'lower1'],
            [this.layers.lower2, 'lower2'],
            [this.layers.lower3, 'lower3'],
            [this.layers.upper0, 'ground'],
            [this.layers.upper1, 'lower1'],
            [this.layers.upper2, 'lower2'],
            [this.layers.upper3, 'lower3'],
            [this.layers.a1ground, 'ground'],
            [this.layers.a1lower1, 'lower1'],
            [this.layers.a1lower2, 'lower2'],
            [this.layers.a1lower3, 'lower3'],
            [this.layers.shadow, 'shadow']
        ]);

        // Layers that must stay live (never cached as textures): the A1
        // overlays animate, and shadows are cheap and edited constantly.
        this._liveLayers = new Set([
            this.layers.a1ground,
            this.layers.a1lower1,
            this.layers.a1lower2,
            this.layers.a1lower3,
            this.layers.shadow
        ]);

        // Add layers in correct rendering order (bottom to top). Each A1
        // overlay draws directly above its z-slot's static container, so
        // stacking between z-slots is unchanged. RPG Maker draws shadows
        // after both base planes (z0 and z1), then draws decorations (z2/z3).
        this.container.addChild(this.layers.checkerboard);
        this.container.addChild(this.layers.parallax);
        this.container.addChild(this.layers.ground);
        this.container.addChild(this.layers.a1ground);
        this.container.addChild(this.layers.lower1);
        this.container.addChild(this.layers.a1lower1);
        this.container.addChild(this.layers.shadow);
        this.container.addChild(this.layers.lower2);
        this.container.addChild(this.layers.a1lower2);
        this.container.addChild(this.layers.lower3);
        this.container.addChild(this.layers.a1lower3);
        this.container.addChild(this.layers.upper0);
        this.container.addChild(this.layers.upper1);
        this.container.addChild(this.layers.upper2);
        this.container.addChild(this.layers.upper3);
        this.container.addChild(this.layers.layerHighlight);
        this.drawGrid();

        // Containers are recreated on setup — re-apply any active layer
        // dimming so switching maps keeps the editing context visible.
        this.setLayerDimming(this._layerDimMode ?? 'auto');

        // Add panning support
        this.setupPanning();
    }

    /**
     * A line at every tile boundary, over the map.
     *
     * Drawn from `TILE_WIDTH`/`TILE_HEIGHT` rather than a constant, so it
     * matches whatever size the project chose in System 2 — a 32-pixel project
     * gets a 32-pixel grid. Above every tile layer and below the editing
     * overlays, and faint enough to read as a guide rather than as artwork.
     */
    drawGrid() {
        if (typeof PIXI === "undefined" || !this.container) return;
        if (this.gridLayer) {
            this.gridLayer.parent?.removeChild(this.gridLayer);
            this.gridLayer.destroy({ children: true });
            this.gridLayer = null;
        }
        if (!this.currentMap) return;

        const width = this.currentMap.width * this.TILE_WIDTH;
        const height = this.currentMap.height * this.TILE_HEIGHT;
        const graphics = new PIXI.Graphics();
        for (let x = 0; x <= this.currentMap.width; x++) {
            const at = x * this.TILE_WIDTH;
            graphics.moveTo(at, 0).lineTo(at, height);
        }
        for (let y = 0; y <= this.currentMap.height; y++) {
            const at = y * this.TILE_HEIGHT;
            graphics.moveTo(0, at).lineTo(width, at);
        }
        // pixelLine keeps the stroke one device pixel at every zoom. A plain
        // width-1 stroke lives in world space: zoomed out it goes sub-pixel
        // and lines alias away, zoomed in it fattens.
        graphics.stroke({ width: 1, color: 0xffffff, alpha: 0.16, pixelLine: true });
        graphics.eventMode = "none";
        graphics.visible = this.gridVisible === true;

        this.gridLayer = graphics;
        this.container.addChild(graphics);
    }

    /** Show or hide the tile grid. */
    setGridVisible(on) {
        this.gridVisible = on === true;
        if (this.gridLayer) this.gridLayer.visible = this.gridVisible;
    }

    /**
     * MZ-style layer editing feedback: while a specific layer (0-3) is
     * selected in the toolbar, every OTHER tile layer renders semi-
     * transparent so it's obvious which tiles live on the active layer.
     * 'auto' restores full opacity. Works per z-slot because each data
     * z-slot renders into its own container (ground/lowerN plus its ☆
     * upper twin); shadows belong to the A layer (z0) for this purpose.
     */
    setLayerDimming(layerMode) {
        this._layerDimMode = layerMode;
        const DIM = 0.35;
        const sel = layerMode === 'auto' ? null : layerMode;
        const apply = (name, z) => {
            const layer = this.layers[name];
            if (layer) layer.alpha = (sel === null || sel === z) ? 1 : DIM;
        };
        apply('ground', 0);
        apply('upper0', 0);
        apply('a1ground', 0);
        apply('shadow', 0);
        apply('lower1', 1);
        apply('upper1', 1);
        apply('a1lower1', 1);
        apply('lower2', 2);
        apply('upper2', 2);
        apply('a1lower2', 2);
        apply('lower3', 3);
        apply('upper3', 3);
        apply('a1lower3', 3);
    }

    setupPanning() {
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        const canvasContainer = document.getElementById('canvas-container');

        // Middle mouse button or Shift+drag for panning. The view scrolls by
        // moving the PIXI container (like the custom scrollbars do) —
        // #canvas-container is overflow:hidden and the canvas is cropped to
        // the viewport, so DOM scrollLeft/scrollTop are pinned at 0 and
        // panning through them silently did nothing.
        this.container.on('pointerdown', (event) => {
            const shiftPressed = Boolean(event.data.originalEvent.shiftKey);
            const shiftClaimedByPainter = shiftPressed && event.data.button === 0 &&
                this.shouldBypassShiftPanning?.(event);
            if (event.data.button === 1 || (shiftPressed && !shiftClaimedByPainter)) {
                isDragging = true;
                dragStart = {
                    x: event.data.global.x - this.container.x,
                    y: event.data.global.y - this.container.y
                };
                event.stopPropagation(); // Prevent tile painting while panning
            }
        });

        this.container.on('pointermove', (event) => {
            if (isDragging) {
                // Clamp here, as the view moves, rather than leaving it to the
                // scrollbar refresh. That refresh is throttled to one frame,
                // so a drag past the edge was drawn out of bounds and yanked
                // back a frame later, over and over: the map jittered against
                // its own edge for as long as you kept pulling.
                this.setViewportTransform(
                    event.data.global.x - dragStart.x,
                    event.data.global.y - dragStart.y,
                    this.container.scale.x);

                // Re-anchor to where the view actually is. Without this the
                // drag keeps accumulating past the edge and the map does not
                // move again until that overshoot has been pulled back out,
                // which reads as the pan sticking.
                dragStart.x = event.data.global.x - this.container.x;
                dragStart.y = event.data.global.y - this.container.y;

                // The thumbs only need repositioning, so one update a frame is
                // still enough for them.
                if (!this.scrollbarUpdateScheduled) {
                    this.scrollbarUpdateScheduled = true;
                    requestAnimationFrame(() => {
                        this.updateScrollbars();
                        this.scrollbarUpdateScheduled = false;
                    });
                }
            }
        });

        this.container.on('pointerup', () => {
            isDragging = false;
            this.scheduleVirtualViewportRefresh();
        });

        this.container.on('pointerupoutside', () => {
            isDragging = false;
            this.scheduleVirtualViewportRefresh();
        });

        // Remove any existing custom scrollbar elements
        if (canvasContainer) {
            const existingScrollbars = canvasContainer.querySelectorAll('.custom-scrollbar, .custom-scrollbar-corner');
            existingScrollbars.forEach(el => el.remove());
        }

        // Initialize custom scrollbars
        this.initCustomScrollbars(canvasContainer);

        // Mouse wheel zoom — REPLACE any previous handler: setupPanning runs
        // on every map load against the persistent #canvas-container, and
        // stacked handlers compounded the zoom step (5 map loads made one
        // wheel notch zoom ~1.6x and resize the renderer five times).
        if (canvasContainer) {
            if (canvasContainer.__rrWheelZoomHandler) {
                canvasContainer.removeEventListener('wheel', canvasContainer.__rrWheelZoomHandler);
            }
            canvasContainer.__rrWheelZoomHandler = (event) => {
                event.preventDefault();
                if (!this.currentMap) return;

                const delta = event.deltaY;
                const scaleFactor = delta > 0 ? 0.9 : 1.1;
                const oldScale = this.container.scale.x;

                // Get ACTUAL viewport dimensions (container size, not canvas size)
                const canvasContainer = document.getElementById('canvas-container');
                const containerRect = canvasContainer.getBoundingClientRect();
                const viewportWidth = containerRect.width;
                const viewportHeight = containerRect.height;
                const mapWidthPx = this.currentMap.width * this.TILE_SIZE;
                const mapHeightPx = this.currentMap.height * this.TILE_SIZE;

                // Minimum zoom = contain-fit (the entire map can fit in the viewport).
                // Beyond this, the map would shrink inside the canvas — but since
                // applyViewportCrop() shrinks the canvas itself to match map dimensions,
                // there's no parallax bleed at any zoom level >= floor.
                const minScale = this.minimumZoomScale(viewportWidth, viewportHeight);
                const maxScale = 5;

                // Quantize so a tile is a WHOLE number of device pixels:
                // fractional tile sizes cause uneven pixel steps and the
                // occasional hairline seam between uncached tile sprites.
                let newScale = this._quantizeScale(
                    Math.max(minScale, Math.min(maxScale, oldScale * scaleFactor)));
                if (newScale === oldScale) {
                    // Step at least one quantum in the intended direction
                    // (at low zoom the 10% step can round back onto itself).
                    newScale = this._quantizeScale(oldScale, scaleFactor > 1 ? 1 : -1);
                }
                if (newScale < minScale) newScale = minScale;
                newScale = Math.min(maxScale, newScale);

                if (newScale !== oldScale) {
                    this.pauseLazyLoading();

                    // Get mouse position in viewport
                    const containerRect = canvasContainer.getBoundingClientRect();
                    const mouseX = event.clientX - containerRect.left;
                    const mouseY = event.clientY - containerRect.top;

                    // Get world position under mouse (accounting for container offset)
                    const worldX = (mouseX - this.container.x) / oldScale;
                    const worldY = (mouseY - this.container.y) / oldScale;

                    // Build the newly exposed tile window before committing
                    // the transform, so zoom never reveals an unrendered gap.
                    this.setViewportTransform(
                        mouseX - worldX * newScale,
                        mouseY - worldY * newScale,
                        newScale);

                    // Update scrollbars
                    this.updateScrollbars();

                    // Re-crop the canvas to the new scaled map size.
                    this.applyViewportCrop();

                    if (this.onZoomChange) {
                        this.onZoomChange(newScale);
                    }

                    setTimeout(() => this.resumeLazyLoading(), 150);
                }
            };
            canvasContainer.addEventListener('wheel', canvasContainer.__rrWheelZoomHandler, { passive: false });
        }

        // Handle window resize - adjust zoom to maintain minimum constraints
        // (same dedupe: one live handler regardless of how many maps loaded)
        if (window.__rrTilemapResizeHandler) {
            window.removeEventListener('resize', window.__rrTilemapResizeHandler);
        }
        window.__rrTilemapResizeHandler = () => {
            if (!this.currentMap || !this.container) return;
            if (this.applyMinScaleClamp()) {
                // Container scale changed; reset position so the map stays anchored.
                this.container.x = 0;
                this.container.y = 0;
            }
            this.updateCanvasSize();
            this.ensureVirtualViewportCoverage();
            // Run AFTER ProjectController's resize handler resets renderer to full
            // canvas-container size — defer with a microtask so our crop wins.
            Promise.resolve().then(() => this.applyViewportCrop());
        };
        window.addEventListener('resize', window.__rrTilemapResizeHandler);
    }

    /**
     * Snap a zoom scale so one tile covers a whole number of DEVICE pixels
     * (TILE_SIZE * scale * dpr ∈ ℤ). direction: 0 = nearest, 1 = up,
     * -1 = down — always by at least one quantum when a direction is given.
     */
    _quantizeScale(scale, direction = 0) {
        const dpr = window.devicePixelRatio || 1;
        const unit = this.TILE_SIZE * dpr;
        const steps = scale * unit;
        if (direction > 0) return (Math.floor(steps) + 1) / unit;
        if (direction < 0) return Math.max(1, Math.ceil(steps) - 1) / unit;
        return Math.max(1, Math.round(steps)) / unit;
    }

    /**
     * Compute the min scale at which the current map fully fills the viewport,
     * and upscale the container if it's currently below that. Returns true if
     * scale was changed. Called on map load and on window resize so a small map
     * never renders with empty space around it.
     */
    applyMinScaleClamp() {
        if (!this.currentMap || !this.container) return false;
        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) return false;
        const containerRect = canvasContainer.getBoundingClientRect();
        const viewportWidth = containerRect.width;
        const viewportHeight = containerRect.height;
        const mapWidthPx = this.currentMap.width * this.TILE_SIZE;
        const mapHeightPx = this.currentMap.height * this.TILE_SIZE;
        if (viewportWidth <= 0 || viewportHeight <= 0 || mapWidthPx <= 0 || mapHeightPx <= 0) return false;

        const minScale = this.minimumZoomScale(viewportWidth, viewportHeight);

        const currentScale = this.container.scale.x;
        if (currentScale < minScale) {
            this.container.scale.set(minScale, minScale);
            if (this.onZoomChange) this.onZoomChange(minScale);
            return true;
        }
        return false;
    }

    minimumZoomScale(viewportWidth, viewportHeight) {
        if (!this.currentMap || viewportWidth <= 0 || viewportHeight <= 0) return 0.1;
        const mapWidthPx = this.currentMap.width * this.TILE_SIZE;
        const mapHeightPx = this.currentMap.height * this.TILE_SIZE;
        const containScale = Math.min(viewportWidth / mapWidthPx, viewportHeight / mapHeightPx);
        const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
        const unit = this.TILE_SIZE * dpr;
        // Keep one tile on an integer number of device pixels without making
        // the quantized result larger than the scale that fits the whole map.
        return Math.max(1 / unit, Math.floor(containScale * unit) / unit);
    }

    /**
     * Shrink the PIXI renderer (background canvas) to match the map's scaled
     * dimensions whenever the map is smaller than the natural canvas-container.
     * This is what kills parallax bleed around the edges: the renderer simply
     * doesn't exist outside the map's footprint, so the parent panel's bg shows.
     * Called after every scale change (load, wheel zoom, window resize).
     */
    applyViewportCrop() {
        if (!this.app || !this.currentMap) return;
        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) return;
        const rect = canvasContainer.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const scale = this.container ? this.container.scale.x : 1;
        const mapWidthPx = this.currentMap.width * this.TILE_SIZE * scale;
        const mapHeightPx = this.currentMap.height * this.TILE_SIZE * scale;

        const targetW = Math.min(rect.width, mapWidthPx);
        const targetH = Math.min(rect.height, mapHeightPx);

        this.app.renderer.resize(targetW, targetH);
    }

    // Initialize custom scrollbars
    initCustomScrollbars(container) {
        // Create scrollbar elements
        const hScrollbar = document.createElement('div');
        hScrollbar.className = 'custom-scrollbar custom-scrollbar-horizontal';
        hScrollbar.id = 'custom-scrollbar-h';

        const hThumb = document.createElement('div');
        hThumb.className = 'custom-scrollbar-thumb';
        hThumb.style.height = '12px';
        hScrollbar.appendChild(hThumb);

        const vScrollbar = document.createElement('div');
        vScrollbar.className = 'custom-scrollbar custom-scrollbar-vertical';
        vScrollbar.id = 'custom-scrollbar-v';

        const vThumb = document.createElement('div');
        vThumb.className = 'custom-scrollbar-thumb';
        vThumb.style.width = '12px';
        vScrollbar.appendChild(vThumb);

        const corner = document.createElement('div');
        corner.className = 'custom-scrollbar-corner';

        container.appendChild(hScrollbar);
        container.appendChild(vScrollbar);
        container.appendChild(corner);

        this.scrollbars = { hScrollbar, vScrollbar, hThumb, vThumb, corner };

        // Add drag handlers
        this.setupScrollbarDrag(hThumb, 'horizontal');
        this.setupScrollbarDrag(vThumb, 'vertical');
    }

    setupScrollbarDrag(thumb, direction) {
        let isDragging = false;
        let startPos = 0;
        let startContainerPos = 0;

        thumb.addEventListener('mousedown', (e) => {
            isDragging = true;
            startPos = direction === 'horizontal' ? e.clientX : e.clientY;
            startContainerPos = direction === 'horizontal' ? this.container.x : this.container.y;
            e.preventDefault();
        });

        // Replace the previous drag handlers for this direction — the thumbs
        // are recreated on every map load and the old document-level
        // listeners accumulated for the whole session otherwise.
        const handlerKey = '__rrScrollDrag_' + direction;
        if (document[handlerKey]) {
            document.removeEventListener('mousemove', document[handlerKey].move);
            document.removeEventListener('mouseup', document[handlerKey].up);
        }

        const onMove = (e) => {
            if (!isDragging) return;

            const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
            const delta = currentPos - startPos;

            const containerRect = document.getElementById('canvas-container').getBoundingClientRect();
            const viewportSize = direction === 'horizontal' ? containerRect.width : containerRect.height;
            const mapSize = direction === 'horizontal' ?
                (this.currentMap.width * this.TILE_WIDTH * this.container.scale.x) :
                (this.currentMap.height * this.TILE_HEIGHT * this.container.scale.y);

            const scrollableSize = mapSize - viewportSize;
            const thumbTrackSize = direction === 'horizontal' ?
                (containerRect.width - 14) : (containerRect.height - 14);

            const ratio = scrollableSize / thumbTrackSize;
            const containerDelta = -delta * ratio;

            this.setViewportTransform(
                direction === 'horizontal' ? startContainerPos + containerDelta : this.container.x,
                direction === 'vertical' ? startContainerPos + containerDelta : this.container.y,
                this.container.scale.x);

            // PERFORMANCE: Throttle scrollbar updates during drag
            if (!this.scrollbarUpdateScheduled) {
                this.scrollbarUpdateScheduled = true;
                requestAnimationFrame(() => {
                    this.updateScrollbars();
                    this.scrollbarUpdateScheduled = false;
                });
            }
        };
        const onUp = () => {
            isDragging = false;
            this.scheduleVirtualViewportRefresh();
        };
        document[handlerKey] = { move: onMove, up: onUp };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /**
     * How far the view may be scrolled, in container pixels.
     *
     * `x` runs from `minX` (the map's right edge against the viewport's) to 0
     * (its left edge against the viewport's). When the map is smaller than the
     * viewport there is nowhere to go and both ends are 0.
     *
     * Returns null when there is no map or no viewport to measure against, so
     * a caller can tell "do not move" from "clamp to zero".
     */
    panBounds(scale = this.container.scale.x) {
        if (!this.currentMap) return null;
        const element = document.getElementById('canvas-container');
        const rect = element && element.getBoundingClientRect();
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
        return {
            minX: Math.min(0, rect.width - this.currentMap.width * this.TILE_WIDTH * scale),
            minY: Math.min(0, rect.height - this.currentMap.height * this.TILE_HEIGHT * scale),
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * Hold the view inside the map, and report where it ended up.
     *
     * Every path that moves the view goes through here rather than writing the
     * same two `Math.max(min, Math.min(0, …))` lines again: panning, the
     * scrollbar thumbs, wheel zoom and the scrollbar refresh had four copies
     * between them and the pan had none, which is what let a drag leave the
     * map at all.
     */
    clampContainerToMap(scale = this.container.scale.x) {
        const bounds = this.panBounds(scale);
        if (!bounds) return null;
        this.container.x = Math.max(bounds.minX, Math.min(0, this.container.x));
        this.container.y = Math.max(bounds.minY, Math.min(0, this.container.y));
        return bounds;
    }

    updateScrollbars() {
        if (!this.scrollbars || !this.currentMap) return;

        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();

        const scale = this.container.scale.x;
        const mapWidth = this.currentMap.width * this.TILE_WIDTH * scale;
        const mapHeight = this.currentMap.height * this.TILE_HEIGHT * scale;

        this.clampContainerToMap(scale);

        // Horizontal scrollbar
        const needsHScroll = mapWidth > rect.width;
        if (needsHScroll) {
            const trackWidth = rect.width - 14;
            const thumbWidth = Math.max(30, (rect.width / mapWidth) * trackWidth);
            const scrollRange = mapWidth - rect.width;
            const thumbRange = trackWidth - thumbWidth;
            const thumbPos = (-this.container.x / scrollRange) * thumbRange;

            this.scrollbars.hThumb.style.width = thumbWidth + 'px';
            this.scrollbars.hThumb.style.left = thumbPos + 'px';
            this.scrollbars.hScrollbar.style.display = 'block';
        } else {
            this.scrollbars.hScrollbar.style.display = 'none';
        }

        // Vertical scrollbar
        const needsVScroll = mapHeight > rect.height;
        if (needsVScroll) {
            const trackHeight = rect.height - 14;
            const thumbHeight = Math.max(30, (rect.height / mapHeight) * trackHeight);
            const scrollRange = mapHeight - rect.height;
            const thumbRange = trackHeight - thumbHeight;
            const thumbPos = (-this.container.y / scrollRange) * thumbRange;

            this.scrollbars.vThumb.style.height = thumbHeight + 'px';
            this.scrollbars.vThumb.style.top = thumbPos + 'px';
            this.scrollbars.vScrollbar.style.display = 'block';
        } else {
            this.scrollbars.vScrollbar.style.display = 'none';
        }

        // Corner
        this.scrollbars.corner.style.display = (needsHScroll && needsVScroll) ? 'block' : 'none';
    }

    updateCanvasSize() {
        // Kept for compatibility - calls updateCanvasWrapperSize
        this.updateCanvasWrapperSize();
    }

    updateCanvasWrapperSize() {
        // Canvas stays at viewport size - custom scrollbars handle navigation
        // No need to resize the canvas when zooming
    }

    // PERFORMANCE: Calculate visible tile bounds for viewport culling
    getVisibleTileBounds(transform = {}) {
        if (!this.currentMap || !this.container) {
            return null;
        }

        // Get the viewport/canvas size
        const viewportWidth = this.app.screen.width;
        const viewportHeight = this.app.screen.height;

        // Get the container's current position and scale
        const scale = transform.scale ?? this.container.scale.x;
        const containerX = transform.x ?? this.container.x;
        const containerY = transform.y ?? this.container.y;
        const margin = transform.margin ?? this.viewportMargin;
        const offsetX = -containerX / scale;
        const offsetY = -containerY / scale;

        // Calculate visible tile range
        const startTileX = Math.floor(offsetX / this.TILE_WIDTH) - margin;
        const startTileY = Math.floor(offsetY / this.TILE_HEIGHT) - margin;
        const endTileX = Math.ceil((offsetX + viewportWidth / scale) / this.TILE_WIDTH) + margin;
        const endTileY = Math.ceil((offsetY + viewportHeight / scale) / this.TILE_HEIGHT) + margin;

        // Clamp to map bounds
        const { width, height } = this.currentMap;
        return {
            startX: Math.max(0, startTileX),
            startY: Math.max(0, startTileY),
            endX: Math.min(width, endTileX),
            endY: Math.min(height, endTileY)
        };
    }

    usesVirtualViewport() {
        return !!this.currentMap &&
            this.currentMap.width * this.currentMap.height > this.virtualMapCellThreshold;
    }

    visibleViewportKey(bounds = this.getVisibleTileBounds()) {
        return bounds
            ? `${bounds.startX},${bounds.startY},${bounds.endX},${bounds.endY}`
            : '';
    }

    getBufferedTileBounds(visibleBounds) {
        if (!visibleBounds || !this.currentMap) return null;
        const size = this.virtualChunkSize;
        const halo = this.virtualChunkHalo * size;
        return {
            startX: Math.max(0, Math.floor(visibleBounds.startX / size) * size - halo),
            startY: Math.max(0, Math.floor(visibleBounds.startY / size) * size - halo),
            endX: Math.min(this.currentMap.width, Math.ceil(visibleBounds.endX / size) * size + halo),
            endY: Math.min(this.currentMap.height, Math.ceil(visibleBounds.endY / size) * size + halo)
        };
    }

    tileBoundsContain(bounds, x, y) {
        return !!bounds && x >= bounds.startX && x < bounds.endX &&
            y >= bounds.startY && y < bounds.endY;
    }

    tileBoundsEqual(a, b) {
        return !!a && !!b && a.startX === b.startX && a.startY === b.startY &&
            a.endX === b.endX && a.endY === b.endY;
    }

    tileBoundsContainBounds(outer, inner) {
        return !!outer && !!inner && inner.startX >= outer.startX && inner.startY >= outer.startY &&
            inner.endX <= outer.endX && inner.endY <= outer.endY;
    }

    virtualTileLayer(layer, x, y) {
        if (!this.usesVirtualViewport() || !layer) return layer;
        if (!this._virtualChunkLayers) this._virtualChunkLayers = new Map();
        let chunks = this._virtualChunkLayers.get(layer);
        if (!chunks) {
            chunks = new Map();
            this._virtualChunkLayers.set(layer, chunks);
        }
        const key = `${Math.floor(x / this.virtualChunkSize)},${Math.floor(y / this.virtualChunkSize)}`;
        let holder = chunks.get(key);
        if (!holder) {
            holder = new PIXI.Container();
            holder.cullable = true;
            holder._rrVirtualChunk = true;
            holder._rrChunkX = Math.floor(x / this.virtualChunkSize);
            holder._rrChunkY = Math.floor(y / this.virtualChunkSize);
            holder._rrMeshGroups = new Map();
            chunks.set(key, holder);
            layer.addChild(holder);
            this._layerNameMap.set(holder, this._layerNameMap.get(layer) || 'unknown');
        }
        return holder;
    }

    destroyVirtualChunkHolder(layer, chunks, key, holder) {
        if (holder.parent) holder.parent.removeChild(holder);
        for (const child of holder.children) {
            if (child._rrOwnedGeometry && child.geometry?.destroy) child.geometry.destroy(true);
        }
        const layerName = this._layerNameMap.get(holder);
        if (layerName && this.tileSprites) {
            const startX = holder._rrChunkX * this.virtualChunkSize;
            const startY = holder._rrChunkY * this.virtualChunkSize;
            const endX = Math.min(this.currentMap?.width || startX, startX + this.virtualChunkSize);
            const endY = Math.min(this.currentMap?.height || startY, startY + this.virtualChunkSize);
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) delete this.tileSprites[`${layerName}_${x}_${y}`];
            }
        }
        this._layerNameMap.delete(holder);
        holder.destroy({ children: true });
        chunks.delete(key);
        if (chunks.size === 0) this._virtualChunkLayers.delete(layer);
    }

    destroyAllVirtualChunkLayers() {
        if (!this._virtualChunkLayers) return;
        for (const [layer, chunks] of [...this._virtualChunkLayers]) {
            for (const [key, holder] of [...chunks]) {
                this.destroyVirtualChunkHolder(layer, chunks, key, holder);
            }
        }
        this._virtualChunkLayers.clear();
    }

    pruneVirtualChunkLayers(bounds = null) {
        if (!this._virtualChunkLayers) return;
        const size = this.virtualChunkSize;
        for (const [layer, chunks] of [...this._virtualChunkLayers]) {
            for (const [key, holder] of [...chunks]) {
                const startX = holder._rrChunkX * size;
                const startY = holder._rrChunkY * size;
                const outside = bounds && (startX >= bounds.endX || startY >= bounds.endY ||
                    startX + size <= bounds.startX || startY + size <= bounds.startY);
                if (!outside && holder.children.length > 0) continue;
                this.destroyVirtualChunkHolder(layer, chunks, key, holder);
            }
        }
    }

    setViewportTransform(x, y, scale = this.container.scale.x) {
        const pan = this.panBounds(scale);
        const nextX = pan ? Math.max(pan.minX, Math.min(0, x)) : x;
        const nextY = pan ? Math.max(pan.minY, Math.min(0, y)) : y;
        if (this.usesVirtualViewport()) {
            this.ensureVirtualViewportCoverage(nextX, nextY, scale);
        }
        if (scale !== this.container.scale.x) this.container.scale.set(scale, scale);
        this.container.x = nextX;
        this.container.y = nextY;
        return { x: nextX, y: nextY, scale };
    }

    scheduleVirtualViewportRefresh() {
        this.ensureVirtualViewportCoverage();
    }

    renderTileCell(x, y) {
        const { width, height, data } = this.currentMap;
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const layerSize = width * height;
        for (let layerIdx = 0; layerIdx < 4; layerIdx++) {
            const tileId = data[layerIdx * layerSize + y * width + x];
            if (tileId <= 0) continue;
            const target = this.virtualTileLayer(this.tileTargetLayer(layerIdx, tileId), x, y);
            this.renderTile(tileId, x, y, target);
            if (this.isTileA1(tileId)) {
                const layerName = this._layerNameMap.get(target) || 'unknown';
                if (this.tileSprites[`${layerName}_${x}_${y}`]) {
                    this.a1TilePositions.push({ x, y, layerIndex: layerIdx, tileId, pixiLayer: target });
                }
            }
        }

        const shadowBits = data[4 * layerSize + y * width + x];
        if (shadowBits > 0) {
            this.renderShadowTile(shadowBits, x, y, this.virtualTileLayer(this.layers.shadow, x, y));
        }
    }

    destroyTileCell(x, y) {
        for (const layer of [
            this.layers.ground,
            this.layers.lower1,
            this.layers.lower2,
            this.layers.lower3,
            this.layers.shadow
        ]) {
            this.clearTileSpritesAt(x, y, layer);
        }
    }

    reconcileVirtualTileBounds(nextBounds) {
        if (!this.usesVirtualViewport() || !nextBounds) return;
        const previous = this._renderedTileBounds;
        if (this.tileBoundsEqual(previous, nextBounds)) return;

        // Materialize the destination first. The browser cannot draw between
        // this work and the transform commit, so even a disjoint scrollbar
        // jump keeps the old view until every required destination cell exists.
        for (let y = nextBounds.startY; y < nextBounds.endY; y++) {
            for (let x = nextBounds.startX; x < nextBounds.endX; x++) {
                if (!this.tileBoundsContain(previous, x, y)) this.renderTileCell(x, y);
            }
        }
        this.flushVirtualChunkMeshes();

        if (previous) {
            this.a1TilePositions = this.a1TilePositions.filter(entry =>
                this.tileBoundsContain(nextBounds, entry.x, entry.y));
            this.pruneVirtualChunkLayers(nextBounds);
        }

        this._renderedTileBounds = nextBounds;
        for (const layer of [
            this.layers.ground, this.layers.lower1, this.layers.lower2, this.layers.lower3,
            this.layers.upper0, this.layers.upper1, this.layers.upper2, this.layers.upper3
        ]) {
            if (layer?.isCachedAsTexture) this.refreshLayerCache(layer);
            else this.cacheLayerIfStatic(layer);
        }
    }

    ensureVirtualViewportCoverage(
        x = this.container?.x,
        y = this.container?.y,
        scale = this.container?.scale?.x
    ) {
        if (!this.usesVirtualViewport() || !this.container) return;
        const visible = this.getVisibleTileBounds({ x, y, scale, margin: 0 });
        if (!visible) return;
        if (this.tileBoundsContainBounds(this._renderedTileBounds, visible)) {
            this._renderedViewportKey = this.visibleViewportKey(visible);
            return;
        }
        const buffered = this.getBufferedTileBounds(visible);
        this.reconcileVirtualTileBounds(buffered);
        this._renderedViewportKey = this.visibleViewportKey(visible);
    }

    isTileCellRendered(x, y) {
        return !this.usesVirtualViewport() || this.tileBoundsContain(this._renderedTileBounds, x, y);
    }

    // options.preserveScroll: keep the current scroll position instead of
    // resetting to the map origin — used by undo/redo restores and the
    // huge-batch updateTiles fallback, where a viewport jump would be jarring.
    renderMap(options = {}) {
        if (!this.currentMap || !this.currentTileset) return;

        // Invalidate any in-flight lazy fill from a previous render — its
        // batches abort and its detached holders are discarded.
        this._lazyLoadGeneration = (this._lazyLoadGeneration || 0) + 1;

        // Drop layer texture caches before rebuilding children. A cached
        // layer re-renders its cache texture on every structural change, so
        // leaving caches on during the rebuild pays a full cache re-render
        // for the rebuild frames and briefly holds two map-sized textures.
        // The lazy fill re-caches each layer when its stream completes.
        for (const layer of Object.values(this.layers)) {
            if (layer && layer.isCachedAsTexture) {
                layer.cacheAsTexture(false);
            }
        }
        this.destroyAllVirtualChunkLayers();

        const { width, height, data } = this.currentMap;

        // RPG Maker MZ has 6 data layers (z=0 through z=5)
        // Layers 0-3: Tile data (visual tiles)
        // Layer 4: Shadow bits (4-bit bitmask, NOT tile IDs)
        // Layer 5: Region/collision data (NOT rendered)
        // Formula: z * (width * height) + y * width + x

        const layerSize = width * height;

        // Clear existing sprites before rendering
        if (!options.virtualRefresh) {
            this.layers.checkerboard.removeChildren();
            this.layers.parallax.removeChildren();
        }
        this.layers.ground.removeChildren();
        this.layers.lower1.removeChildren();
        this.layers.lower2.removeChildren();
        this.layers.lower3.removeChildren();
        this.layers.upper0.removeChildren();
        this.layers.upper1.removeChildren();
        this.layers.upper2.removeChildren();
        this.layers.upper3.removeChildren();
        this.layers.a1ground.removeChildren();
        this.layers.a1lower1.removeChildren();
        this.layers.a1lower2.removeChildren();
        this.layers.a1lower3.removeChildren();
        this.layers.shadow.removeChildren();
        this.layers.layerHighlight.removeChildren();

        // PERFORMANCE: Clear sprite tracking when clearing map
        this.tileSprites = {};

        // Render checkerboard background (for transparency visualization)
        if (!options.virtualRefresh) this.renderCheckerboard(width, height);

        // Render parallax background (non-blocking - loads in background while tiles render)
        if (!options.virtualRefresh) this.renderParallax();

        // Render tile layers
        // Layer 0: Ground tiles
        // Layer 1: Lower tiles
        // Layer 2: Lower decoration tiles
        // Layer 3: Lower decoration tiles
        // Layer 4: Shadow bits (NOT tiles)
        // Layer 5: Region/collision data (NOT rendered)

        // MZ compatibility: tiles from layers 0-3 are routed to lower/upper
        // containers based on tileset.flags[tileId] & 0x10 (the ☆ "higher"
        // flag) via tileTargetLayer() — see rmmz_core Tilemap._addSpotTile.
        // Without this, a ☆ roof piece at z2 rendered UNDER a tree at z3
        // ("trees above buildings" bug).

        // PERFORMANCE: Clear A1 tile tracking list before re-rendering
        this.a1TilePositions = [];

        // PERFORMANCE: Get visible tile bounds for viewport culling
        let startX = 0, startY = 0, endX = width, endY = height;
        if (this.useViewportCulling) {
            const visible = this.getVisibleTileBounds({ margin: this.usesVirtualViewport() ? 0 : this.viewportMargin });
            const bounds = this.usesVirtualViewport() ? this.getBufferedTileBounds(visible) : visible;
            if (bounds) {
                startX = bounds.startX;
                startY = bounds.startY;
                endX = bounds.endX;
                endY = bounds.endY;
            }
        }
        this._renderedTileBounds = this.usesVirtualViewport()
            ? { startX, startY, endX, endY }
            : null;
        this._renderedViewportKey = this.usesVirtualViewport()
            ? this.visibleViewportKey(this.getVisibleTileBounds({ margin: 0 }))
            : null;

        // PERFORMANCE: Single pass over visible tiles for all 5 layers (0-4)
        // instead of 5 separate loops. This cuts iteration overhead by ~5x.
        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                this.renderTileCell(x, y);
            }
        }
        this.flushVirtualChunkMeshes();

        // Layer 5 - NOT RENDERED
        // In RPG Maker MZ, layer 5 contains region/collision metadata, NOT visual tiles
        // This layer should NEVER be rendered. Rendering it causes region IDs to appear as tiles.

        // Start A1 autotile animation
        this.startA1Animation();

        // Render layer highlights
        this.renderLayerHighlights();

        // Update canvas size to match map dimensions
        this.updateCanvasSize();

        // Set initial scroll to show map at top-left (not padding)
        if (!options.preserveScroll) {
            const canvasContainer = document.getElementById('canvas-container');
            if (canvasContainer && this.canvasPadding) {
                canvasContainer.scrollLeft = this.canvasPadding.x;
                canvasContainer.scrollTop = this.canvasPadding.y;
            }
        }

        // PERFORMANCE: If viewport culling was used, lazy-load the rest of the map
        if (!this.usesVirtualViewport() && this.useViewportCulling &&
            (startX > 0 || startY > 0 || endX < width || endY < height)) {
            this.lazyLoadRemainingTiles(width, height, startX, startY, endX, endY, data, layerSize);
        } else if (this.usesVirtualViewport()) {
            this.cacheStaticLayers();
        }
    }

    // PERFORMANCE: Update only specific tiles without re-rendering entire map
    // This is 1000x faster than renderMap() when only a few tiles changed
    // positions: Array of {x, y, layer} objects, where layer is 0-4 (0=ground, 1=lower1, 2=lower2, 3=lower3, 4=shadow)
    updateTiles(positions) {
        if (!this.currentMap || !this.currentTileset) return;

        if (this.usesVirtualViewport()) {
            const chunkKeys = new Set();
            for (const { x, y, layer } of positions) {
                if (layer < 0 || layer > 4 || !this.isTileCellRendered(x, y)) continue;
                chunkKeys.add(`${Math.floor(x / this.virtualChunkSize)},${Math.floor(y / this.virtualChunkSize)}`);
            }
            this.rebuildVirtualChunks(chunkKeys);
            return;
        }

        // Huge batches (whole-map bucket fills, giant rectangle drags) are
        // far faster through the streaming full re-render than through
        // 100k+ incremental sprite updates — measured 39.6s of updateTiles
        // for a 256×256 fill vs an instant viewport render plus a ~2.5s
        // background stream. The scroll position is preserved.
        if (positions.length > 3000 && !this.usesVirtualViewport()) {
            this.renderMap({ preserveScroll: true });
            return;
        }

        const { width, height, data } = this.currentMap;
        const layerSize = width * height;
        const affectedLayers = new Set();
        // Batch A1 animation-tracking maintenance: one filter at the end
        // instead of one PER POSITION (each filter walks the whole tracking
        // list — on a watery map that made big batches quadratic).
        const a1RemovedSlots = new Set();
        const a1Added = new Map(); // slot key -> entry (dedupes repeat positions)

        for (const pos of positions) {
            const { x, y, layer: layerIdx } = pos;

            // Validate bounds
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (layerIdx < 0 || layerIdx > 4) continue;
            if (!this.isTileCellRendered(x, y)) continue;

            // Get the layer container (canonical lower container for the
            // z-slot — sprite-tracking keys are per-slot, so clearing via
            // it removes the old sprite from either stack).
            let pixiLayer;
            switch (layerIdx) {
                case 0: pixiLayer = this.layers.ground; break;
                case 1: pixiLayer = this.layers.lower1; break;
                case 2: pixiLayer = this.layers.lower2; break;
                case 3: pixiLayer = this.layers.lower3; break;
                case 4: pixiLayer = this.layers.shadow; break;
            }

            // Track cached layers touched at this z-slot: their cache
            // textures are refreshed IN PLACE after the sprite updates
            // (updateCacheTexture below). The layer never flips to live
            // rendering — an uncache→recache cycle rendered the art through
            // a subtly different sampling path for ~500ms and made tiles
            // visibly "breathe" on every paint click.
            // Both stacks of the z-slot: the old sprite may live in the
            // upper container (☆ tile) even though the new one won't.
            const affected = layerIdx === 4 ? [pixiLayer] : this.containersForZ(layerIdx);
            for (const c of affected) {
                if (c && c.isCachedAsTexture) {
                    affectedLayers.add(c);
                }
            }

            // Clear the old tile sprites at this position
            this.clearTileSpritesAt(x, y, pixiLayer);

            // Get new tile data
            const index = layerIdx * layerSize + y * width + x;
            const tileValue = data[index];

            // Render the new tile if it's not empty
            if (layerIdx === 4) {
                // Shadow layer
                if (tileValue > 0) {
                    this.renderShadowTile(tileValue, x, y);
                }
            } else {
                // Tile layers 0-3
                if (tileValue > 0) {
                    const target = this.virtualTileLayer(this.tileTargetLayer(layerIdx, tileValue), x, y);
                    this.renderTile(tileValue, x, y, target);

                    // Track A1 tiles for animation (old tracking for the
                    // slot is dropped in one batch pass below)
                    const slotKey = `${x},${y},${layerIdx}`;
                    a1RemovedSlots.add(slotKey);
                    if (this.isTileA1(tileValue)) {
                        a1Added.set(slotKey, {
                            x, y,
                            layerIndex: layerIdx,
                            tileId: tileValue,
                            pixiLayer: target
                        });
                    } else {
                        a1Added.delete(slotKey);
                    }
                } else {
                    // Tile is empty (0) - ensure it's removed from A1 animation tracking
                    const slotKey = `${x},${y},${layerIdx}`;
                    a1RemovedSlots.add(slotKey);
                    a1Added.delete(slotKey);
                }
            }
        }

        // Apply the batched A1 tracking changes
        if (a1RemovedSlots.size > 0) {
            this.a1TilePositions = this.a1TilePositions.filter(
                t => !a1RemovedSlots.has(`${t.x},${t.y},${t.layerIndex}`)
            );
        }
        if (a1Added.size > 0) {
            this.a1TilePositions.push(...a1Added.values());
        }

        // Refresh the touched caches in place — the cached texture
        // re-renders with the new sprites on the next frame, and the
        // layer never round-trips through live rendering.
        for (const layer of affectedLayers) {
            this.refreshLayerCache(layer);
        }
    }

    // PERFORMANCE: Lazily load tiles outside the initial viewport in batches.
    //
    // Off-viewport sprites are streamed into DETACHED holder containers (one
    // per target layer) and only attached to the stage when their layer's
    // stream completes. Streaming into the live layers made every editor
    // frame re-render the ever-growing uncached sprite tree (a full 256×256
    // map can be ~500k sprites — over 1s per frame near the end), which starved
    // the idle-callback batches and stretched a ~1s fill into ~10s wall time.
    // With holders the per-frame render stays viewport-sized throughout, and
    // each layer pays its one-time cache render as it lands.
    lazyLoadRemainingTiles(width, height, viewportStartX, viewportStartY, viewportEndX, viewportEndY, data, layerSize) {
        // Build list of all tile positions outside viewport that need rendering.
        // Values are re-read from map data at render time, so paints that land
        // while the fill is streaming are never overwritten with stale tiles.
        const tilesToLoad = [];

        for (let layerIdx = 0; layerIdx < 5; layerIdx++) { // Layers 0-4 (layer 5 is regions, not rendered)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    // Skip tiles that were already rendered in viewport
                    if (x >= viewportStartX && x < viewportEndX && y >= viewportStartY && y < viewportEndY) {
                        continue;
                    }

                    const index = layerIdx * layerSize + y * width + x;
                    if (data[index] > 0) {
                        tilesToLoad.push({ x, y, layerIdx });
                    }
                }
            }
        }

        // Generation guard: a renderMap() for another map (or a reload of
        // this one) invalidates this fill — without it, stale batches would
        // keep rendering the old map's tiles into the new map's containers.
        const generation = this._lazyLoadGeneration;

        // Detached holder containers, keyed by the real target container.
        // Holders register in _layerNameMap under the real layer's name so
        // renderTile/clearTileSpritesAt track sprites under the same keys.
        const holders = new Map();
        const holderFor = (target) => {
            let holder = holders.get(target);
            if (!holder) {
                holder = new PIXI.Container();
                this._layerNameMap.set(holder, this._layerNameMap.get(target) || 'unknown');
                holders.set(target, holder);
            }
            return holder;
        };
        const discardHolders = () => {
            for (const [, holder] of holders) {
                this._layerNameMap.delete(holder);
                holder.destroy({ children: true });
            }
            holders.clear();
        };

        // Attach one completed holder per frame: reparenting ~500k sprites
        // and building each layer's cache texture are the two remaining
        // one-time costs, so spreading them per-layer avoids a single hitch.
        const finalizeNextHolder = () => {
            if (this.destroyed || generation !== this._lazyLoadGeneration) {
                discardHolders();
                return;
            }
            const next = holders.entries().next();
            if (next.done) {
                // Cache any layer the streams didn't touch as well
                this.cacheStaticLayers();
                return;
            }
            const [target, holder] = next.value;
            holders.delete(target);
            const children = holder.removeChildren();
            for (const child of children) {
                target.addChild(child);
            }
            // A1 animation entries created during the stream point at the
            // holder; repoint them at the real container they now live in.
            for (const t of this.a1TilePositions) {
                if (t.pixiLayer === holder) t.pixiLayer = target;
            }
            this._layerNameMap.delete(holder);
            holder.destroy();
            this.cacheLayerIfStatic(target);
            requestAnimationFrame(finalizeNextHolder);
        };

        // Load tiles in batches using time budget instead of fixed count for smoother performance
        let currentIndex = 0;
        const loadNextBatch = () => {
            // Abort if this TilemapManager has been destroyed (e.g., project
            // switch) or another map render superseded this fill
            if (this.destroyed || generation !== this._lazyLoadGeneration) {
                discardHolders();
                return;
            }

            // Skip this batch if lazy-loading is paused (user is interacting)
            if (this.isLazyLoadingPaused) {
                if (window.requestIdleCallback) {
                    requestIdleCallback(loadNextBatch);
                } else {
                    setTimeout(loadNextBatch, 100);
                }
                return;
            }

            const startTime = performance.now();

            // Render tiles until we hit the time budget or run out of tiles
            while (currentIndex < tilesToLoad.length) {
                const tile = tilesToLoad[currentIndex];
                currentIndex++;

                // Live value: the cell may have been painted (and rendered by
                // updateTiles) since the list was built — tracked sprites for
                // the z-slot mean it's already current, so skip it.
                const tileValue = data[tile.layerIdx * layerSize + tile.y * width + tile.x];
                if (tileValue <= 0) continue;

                if (tile.layerIdx === 4) {
                    if (!this.tileSprites[`shadow_${tile.x}_${tile.y}`]) {
                        this.renderShadowTile(tileValue, tile.x, tile.y, holderFor(this.layers.shadow));
                    }
                } else {
                    const target = this.tileTargetLayer(tile.layerIdx, tileValue);
                    const layerName = this._layerNameMap.get(target) || 'unknown';
                    if (!this.tileSprites[`${layerName}_${tile.x}_${tile.y}`]) {
                        const holder = holderFor(target);
                        this.renderTile(tileValue, tile.x, tile.y, holder);

                        // Track A1 tiles for animation
                        if (this.isTileA1(tileValue)) {
                            this.a1TilePositions.push({
                                x: tile.x,
                                y: tile.y,
                                layerIndex: tile.layerIdx,
                                tileId: tileValue,
                                pixiLayer: holder
                            });
                        }
                    }
                }

                // Check if we've exceeded our time budget
                const elapsed = performance.now() - startTime;
                if (elapsed >= this.lazyLoadTimeBudgetMs) {
                    break;
                }
            }

            // Continue loading if there are more tiles
            if (currentIndex < tilesToLoad.length) {
                if (window.requestIdleCallback) {
                    requestIdleCallback(loadNextBatch, { timeout: 100 });
                } else {
                    // Fallback for browsers without requestIdleCallback
                    setTimeout(loadNextBatch, 50); // Longer delay to reduce frequency
                }
            } else {
                // All streamed: attach holders (one per frame), then cache
                finalizeNextHolder();
            }
        };

        // Start lazy loading with a delay to let initial render settle
        if (window.requestIdleCallback) {
            requestIdleCallback(loadNextBatch, { timeout: 100 });
        } else {
            setTimeout(loadNextBatch, 200); // Delay before starting
        }
    }

    // Cache one layer as a texture if it's eligible. The A1 overlays and
    // the shadow layer stay live (_liveLayers); every static container —
    // ground included, now that water lives outside it — can cache.
    // Already-cached layers are left alone.
    cacheLayerIfStatic(layer) {
        if (!layer || layer.isCachedAsTexture) return;
        if (this._liveLayers && this._liveLayers.has(layer)) return;
        if (this.usesVirtualViewport()) return;
        if (!this.isLayerCacheSafe(layer)) return;
        layer.cacheAsTexture(this.layerCacheOptions);
    }

    refreshLayerCache(layer) {
        if (!layer?.isCachedAsTexture) return;
        if (this.isLayerCacheSafe(layer)) {
            layer.updateCacheTexture();
        } else {
            layer.cacheAsTexture(false);
        }
    }

    isLayerCacheSafe(layer) {
        const gl = this.app?.renderer?.gl;
        if (!gl || typeof gl.getParameter !== 'function') return false;

        let bounds;
        try {
            bounds = layer.getLocalBounds();
        } catch (_error) {
            return false;
        }
        const resolution = this.layerCacheOptions?.resolution || 1;
        const width = Math.ceil(Number(bounds?.width) * resolution);
        const height = Math.ceil(Number(bounds?.height) * resolution);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;

        const nextPowerOfTwo = value => 2 ** Math.ceil(Math.log2(Math.max(1, value)));
        const textureWidth = nextPowerOfTwo(width);
        const textureHeight = nextPowerOfTwo(height);
        try {
            const limits = [
                Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
                Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))
            ];
            const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
            if (viewport?.length >= 2) limits.push(Number(viewport[0]), Number(viewport[1]));
            const maxSide = Math.min(...limits.filter(limit => Number.isFinite(limit) && limit > 0));
            if (!Number.isFinite(maxSide) || textureWidth > maxSide || textureHeight > maxSide) return false;
        } catch (_error) {
            return false;
        }

        // Pixi pools RGBA8 cache textures at power-of-two dimensions. Keeping
        // each cache below this budget bounds all eight static layers to a
        // practical amount instead of allowing a single 1-4 GiB framebuffer.
        const maxCacheBytes = 32 * 1024 * 1024;
        return textureWidth * textureHeight * 4 <= maxCacheBytes;
    }

    // PERFORMANCE: Cache static layers as textures for faster rendering
    cacheStaticLayers() {
        // Cache non-animated layers as textures
        // This converts all sprites in a layer into a single texture, much faster to render
        // cacheLayerIfStatic skips live layers (A1 overlays, shadows) and
        // already-cached layers
        this.cacheLayerIfStatic(this.layers.ground);
        this.cacheLayerIfStatic(this.layers.lower1);
        this.cacheLayerIfStatic(this.layers.lower2);
        this.cacheLayerIfStatic(this.layers.lower3);
        this.cacheLayerIfStatic(this.layers.upper0);
        this.cacheLayerIfStatic(this.layers.upper1);
        this.cacheLayerIfStatic(this.layers.upper2);
        this.cacheLayerIfStatic(this.layers.upper3);
    }

    // Pause/resume lazy-loading during user interaction
    pauseLazyLoading() {
        this.isLazyLoadingPaused = true;
    }

    resumeLazyLoading() {
        this.isLazyLoadingPaused = false;
    }

    // Render highlights for tiles on the currently selected layer
    renderLayerHighlights() {
        if (!this.currentMap || !this.mapEditor) return;

        // PERFORMANCE: Disable layer highlights feature - it creates thousands of Graphics objects
        // causing 1+ second freezes on large maps. This feature isn't essential for editing.
        // TODO: If needed, reimplement using a shader or single large Graphics object instead
        // of creating individual Graphics per tile.

        // Clear existing highlights
        this.layers.layerHighlight.removeChildren();

        // Feature disabled for performance - was causing 1000ms+ frame freezes
        return;

        // DISABLED CODE (was creating 10,000+ Graphics objects on large maps):
        /*
        // Get the currently selected layer from the palette
        const currentLayer = this.mapEditor.tilesetPaletteViewer.currentLayer;

        // Map layer keys to layer indices
        const layerMap = {
            'A': 0, 'A1': 0, 'A2': 0, 'A3': 0, 'A4': 0, 'A5': 0,
            'B': 0, 'C': 1, 'D': 2, 'E': 3
        };

        const layerIndex = layerMap[currentLayer];
        if (layerIndex === undefined) return;

        const { width, height, data } = this.currentMap;
        const layerSize = width * height;
        const tileSize = this.TILE_SIZE;

        // Render semi-transparent highlights for all tiles on this layer
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = layerIndex * layerSize + y * width + x;
                const tileId = data[index];

                if (tileId > 0) {
                    // Create a semi-transparent overlay for this tile
                    const highlight = new PIXI.Graphics();
                    highlight.beginFill(0xFFFFFF, 0.15); // White with 15% opacity
                    highlight.drawRect(0, 0, tileSize, tileSize);
                    highlight.endFill();

                    // Draw a subtle border
                    highlight.lineStyle(1, 0xFFFFFF, 0.3);
                    highlight.drawRect(0, 0, tileSize, tileSize);

                    highlight.x = x * tileSize;
                    highlight.y = y * tileSize;

                    this.layers.layerHighlight.addChild(highlight);
                }
            }
        }
        */
    }

    // Start animation for A1 autotiles (water/waterfalls)
    startA1Animation() {
        // Stop existing animation ticker if any
        if (this.animationTicker) {
            this.app.ticker.remove(this.animationTicker);
            this.animationTicker = null;
        }

        // Reset animation frames
        this.waterAnimationFrame = 0;
        this.waterfallAnimationFrame = 0;
        this.waterAnimationDirection = 1;
        if (!this.a1AnimationEnabled) return;

        let frameCounter = 0;
        const framesPerUpdate = 30; // Update every 30 frames (~0.5 seconds at 60fps)

        this.animationTicker = () => {
            frameCounter++;
            if (frameCounter >= framesPerUpdate) {
                frameCounter = 0;

                // Water: ping-pong pattern (0→1→2→1→0)
                this.waterAnimationFrame += this.waterAnimationDirection;
                if (this.waterAnimationFrame === 2 || this.waterAnimationFrame === 0) {
                    this.waterAnimationDirection *= -1; // Reverse direction
                }

                // Waterfall: straight loop (0→1→2→0)
                this.waterfallAnimationFrame = (this.waterfallAnimationFrame + 1) % 3;

                // Update only A1 tiles without clearing the entire map
                this.updateA1Tiles();
            }
        };

        this.app.ticker.add(this.animationTicker);
    }

    setA1AnimationEnabled(enabled) {
        this.a1AnimationEnabled = enabled !== false;

        if (this.a1AnimationEnabled) {
            if (!this.animationTicker && this.currentMap && this.currentTileset) {
                this.startA1Animation();
            }
            return;
        }

        if (this.animationTicker) {
            this.app.ticker.remove(this.animationTicker);
            this.animationTicker = null;
        }
        this.waterAnimationFrame = 0;
        this.waterfallAnimationFrame = 0;
        this.waterAnimationDirection = 1;
        this.updateA1Tiles();
    }

    // PERFORMANCE OPTIMIZED: Update only A1 autotiles for animation by updating textures, not recreating sprites
    updateA1Tiles() {
        if (!this.currentMap || !this.currentTileset) return;

        if (this.usesVirtualViewport()) {
            for (const chunks of this._virtualChunkLayers.values()) {
                for (const holder of chunks.values()) {
                    for (const mesh of holder.children) {
                        if (!mesh._rrA1Tiles?.length) continue;
                        const uvBuffer = mesh.geometry.getBuffer('aUV');
                        const uvs = uvBuffer.data;
                        const sourceWidth = Number(mesh.texture?.source?.width || mesh.texture?.width);
                        const sourceHeight = Number(mesh.texture?.source?.height || mesh.texture?.height);
                        for (const entry of mesh._rrA1Tiles) {
                            const rects = this.meshTileRects(entry.tileId, entry.x, entry.y);
                            let offset = entry.uvOffset;
                            for (const rect of rects) {
                                const values = this.rectUvs(rect, sourceWidth, sourceHeight);
                                uvs.set(values, offset);
                                offset += values.length;
                            }
                        }
                        uvBuffer.update();
                    }
                }
            }
        }

        // Only iterate through known A1 tile positions instead of entire map
        for (const tileInfo of this.a1TilePositions) {
            const {x, y, tileId, pixiLayer} = tileInfo;

            // CRITICAL PERFORMANCE FIX: Update texture regions instead of destroying/recreating sprites
            this.updateA1TileTextures(tileId, x, y, pixiLayer);
        }
    }

    // PERFORMANCE: Update A1 tile textures without recreating sprites
    updateA1TileTextures(tileId, x, y, layer) {
        // Get the sprites for this tile (upper containers map to their
        // z-slot's name, so ☆-routed tiles resolve the same key)
        const layerName = (this._layerNameMap && this._layerNameMap.get(layer)) || 'unknown';

        const key = `${layerName}_${x}_${y}`;
        const sprites = this.tileSprites[key];

        if (!sprites || sprites.length !== 4) {
            // Sprites don't exist or wrong count, fall back to full re-render
            this.clearTileSpritesAt(x, y, layer);
            this.renderAutotile(tileId, x, y, layer);
            return;
        }

        // Calculate the new texture regions for current animation frame
        const kind = this.getAutotileKind(tileId);
        const shape = this.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let bx = 0;
        let by = 0;
        let autotileTable = this.FLOOR_AUTOTILE_TABLE;

        // A1 animation calculations - use EXACT same logic as RPG Maker MZ corescript
        const waterSurfaceIndex = [0, 1, 2, 1][this.waterAnimationFrame];

        if (kind === 0) {
            bx = waterSurfaceIndex * 2;
            by = 0;
        } else if (kind === 1) {
            bx = waterSurfaceIndex * 2;
            by = 3;
        } else if (kind === 2) {
            bx = 6;
            by = 0;
        } else if (kind === 3) {
            bx = 6;
            by = 3;
        } else {
            bx = Math.floor(tx / 4) * 8;
            by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
            if (kind % 2 === 0) {
                bx += waterSurfaceIndex * 2;
            } else {
                bx += 6;
                // Per RMMZ corescript: ALL odd kinds >= 4 use WATERFALL_AUTOTILE_TABLE
                autotileTable = this.WATERFALL_AUTOTILE_TABLE;
                by += this.waterfallAnimationFrame;
            }
        }

        const texture = this.tilesetTextures[0]; // A1
        if (!texture) return;

        const table = autotileTable[shape];
        if (!table) return;

        const w1 = this.TILE_WIDTH / 2;
        const h1 = this.TILE_HEIGHT / 2;

        // Update each of the 4 sub-tile sprites with new texture regions
        for (let i = 0; i < 4; i++) {
            const sprite = sprites[i];
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx = (bx * 2 + qsx) * w1;
            const sy = (by * 2 + qsy) * h1;

            // PERFORMANCE: Use cached animation frame textures
            // Exact texel frame: with nearest sampling + integer-pixel zoom
            // there is no edge bleeding. The old 0.5px inset + stretch
            // fattened thin art ~2% and made every cache/uncache cycle
            // visibly "breathe" when painting.
            const animCacheKey = `a1_${kind}_${shape}_${i}_${bx}_${by}`;
            let animTexture = this.a1AnimationCache[animCacheKey];
            if (!animTexture) {
                animTexture = new PIXI.Texture({
                    source: texture.source,
                    frame: new PIXI.Rectangle(sx, sy, w1, h1)
                });
                this.a1AnimationCache[animCacheKey] = animTexture;
            }

            sprite.texture = animTexture;
            // Natural size (the frame is exactly one tile)
            sprite.width = w1;
            sprite.height = h1;
        }
    }

    // PERFORMANCE OPTIMIZED: Clear sprites at a specific tile position using sprite tracking
    clearTileSpritesAt(x, y, layer) {
        if (!layer) return;

        // Determine layer name for sprite tracking key (upper containers
        // share their z-slot's name; sprites are removed from whichever
        // container actually parents them via sprite.parent below)
        const layerName = (this._layerNameMap && this._layerNameMap.get(layer)) || 'unknown';

        const key = `${layerName}_${x}_${y}`;
        const sprites = this.tileSprites[key];

        if (sprites && sprites.length > 0) {
            // Remove all tracked sprites for this tile
            for (const sprite of sprites) {
                if (sprite.parent) {
                    sprite.parent.removeChild(sprite);
                }
                sprite.destroy(sprite.children ? { children: true } : undefined);
            }
            // Clear the tracking array
            delete this.tileSprites[key];
        }
    }

    // Render checkerboard background for transparency visualization
    renderCheckerboard(mapWidth, mapHeight) {
        const tileSize = this.TILE_SIZE; // Size of each checkerboard square
        const pixelWidth = mapWidth * this.TILE_WIDTH;
        const pixelHeight = mapHeight * this.TILE_HEIGHT;

        // PERFORMANCE: Create a tiny 2x2 tile checkerboard texture and tile it
        // instead of drawing thousands of individual rects
        const lightColor = 0xCCCCCC;
        const darkColor = 0x999999;

        // Create a 2-tile wide, 2-tile tall pattern using Graphics, then use as TilingSprite source
        const patternSize = tileSize * 2;
        const pattern = new PIXI.Graphics();
        pattern.rect(0, 0, tileSize, tileSize).fill(lightColor);
        pattern.rect(tileSize, 0, tileSize, tileSize).fill(darkColor);
        pattern.rect(0, tileSize, tileSize, tileSize).fill(darkColor);
        pattern.rect(tileSize, tileSize, tileSize, tileSize).fill(lightColor);

        // Render the small pattern to a texture ONCE and reuse it — render
        // textures are exempt from PIXI's texture GC, so allocating a fresh
        // one per full re-render (every undo/redo/large-fill fallback)
        // leaked a GPU framebuffer each time.
        if (!this._checkerboardTexture) {
            this._checkerboardTexture = PIXI.RenderTexture.create({ width: patternSize, height: patternSize });
            this.app.renderer.render({ container: pattern, target: this._checkerboardTexture });
        }
        pattern.destroy();

        const checkerboard = new PIXI.TilingSprite({
            texture: this._checkerboardTexture,
            width: pixelWidth,
            height: pixelHeight
        });

        this.layers.checkerboard.addChild(checkerboard);
    }

    // Render parallax background
    async renderParallax() {
        if (!this.currentMap) return;

        const generation = this._mapLoadGeneration;
        const map = this.currentMap;
        const parallaxLayer = this.layers.parallax;
        const { parallaxName, parallaxShow, parallaxLoopX, parallaxLoopY, parallaxSx, parallaxSy } = this.currentMap;

        if (this.layers.parallax) {
            this.layers.parallax.removeChildren().forEach(child => child.destroy?.({ children: true }));
            this.layers.parallax.visible = true;
        }
        this.parallaxSprite = null;

        // Clear existing parallax ticker if any
        if (this.parallaxTicker) {
            this.app.ticker.remove(this.parallaxTicker);
            this.parallaxTicker = null;
        }

        // Check if parallax should be shown
        // Also check editor setting (can be toggled via UI)
        if (!parallaxShow || !parallaxName || parallaxName === '' || this.hideParallaxInEditor) {
            // Hide parallax layer if it exists
            if (this.layers.parallax) {
                this.layers.parallax.visible = false;
            }
            return;
        }

        // Load parallax image
        const parallaxPath = this.path.join(this.projectPath, 'img', 'parallaxes', parallaxName + '.png');

        if (!this.fs.existsSync(parallaxPath)
            && !(typeof window !== 'undefined' && window.RREncryptedAssets?.assetExists(parallaxPath))) {
            if (this.layers.parallax) {
                this.layers.parallax.visible = false;
            }
            return;
        }

        // Convert to file:// URL for Pixi.js
        const fileUrl = this.assetUrl(parallaxPath);

        try {
            // Load texture using PIXI.Assets.load() to ensure it's loaded before rendering
            const texture = await PIXI.Assets.load(fileUrl);
            if (this.destroyed || generation !== this._mapLoadGeneration ||
                this.currentMap !== map || this.layers.parallax !== parallaxLayer) return;

            // MZ semantics: the parallax ALWAYS repeats to fill the map —
            // in-game it's a screen-filling TilingSprite and the MZ editor
            // tiles it across the whole map. The loop flags only control
            // SCROLLING, not whether the image tiles. Nearest sampling
            // keeps zoomed parallax consistent with the pixel-art tiles.
            texture.source.style.addressMode = 'repeat';
            texture.source.style.scaleMode = 'nearest';

            const mapPixelWidth = map.width * this.TILE_WIDTH;
            const mapPixelHeight = map.height * this.TILE_HEIGHT;

            this.parallaxSprite = new PIXI.TilingSprite({
                texture: texture,
                width: mapPixelWidth,
                height: mapPixelHeight
            });
            this.parallaxSprite.x = 0;
            this.parallaxSprite.y = 0;

            // Initialize tilePosition for scrolling (wraps via texture
            // repeat, so the sprite never needs to be oversized)
            this.parallaxSprite.tilePosition = { x: 0, y: 0 };

            // Add to parallax layer
            this.layers.parallax.addChild(this.parallaxSprite);

            // Setup scrolling animation if speeds are set
            if ((parallaxSx !== 0 || parallaxSy !== 0) && (parallaxLoopX || parallaxLoopY)) {
                this.parallaxScrollOffset = { x: 0, y: 0 };

                this.parallaxTicker = (delta) => {
                    if (this.parallaxSprite && this.parallaxSprite.tilePosition) {
                        // RPG Maker assumes 60 FPS as baseline
                        // delta.deltaTime is the time multiplier (1.0 at 60fps, 2.0 at 30fps, 0.5 at 120fps)
                        // We need to normalize to 60 FPS to match RPG Maker's behavior
                        const frameRateMultiplier = delta.deltaTime || 1.0;

                        // RPG Maker scrolls at 1/2 pixel per frame at speed 1
                        // So we divide by 2 to match RPG Maker's actual scroll speed
                        const speedMultiplier = 0.5;

                        if (parallaxLoopX && parallaxSx !== 0) {
                            // Apply frame rate normalization and speed adjustment
                            this.parallaxScrollOffset.x += parallaxSx * speedMultiplier * frameRateMultiplier;
                            // Round to prevent sub-pixel jitter
                            this.parallaxSprite.tilePosition.x = Math.round(this.parallaxScrollOffset.x);
                        }
                        if (parallaxLoopY && parallaxSy !== 0) {
                            // INVERT Y direction: negative values scroll DOWN in RPG Maker
                            // Apply frame rate normalization and speed adjustment
                            this.parallaxScrollOffset.y -= parallaxSy * speedMultiplier * frameRateMultiplier;
                            // Round to prevent sub-pixel jitter
                            this.parallaxSprite.tilePosition.y = Math.round(this.parallaxScrollOffset.y);
                        }
                    }
                };

                this.app.ticker.add(this.parallaxTicker);
            }
        } catch (error) {
            if (this.layers.parallax) {
                this.layers.parallax.visible = false;
            }
        }
    }

    // RPG Maker MZ tile checking functions
    isAutotile(tileId) {
        // Autotiles are A1-A4, but NOT A5 (A5 are normal tiles)
        return (tileId >= this.TILE_ID_A1 && tileId < this.TILE_ID_MAX) && !this.isTileA5(tileId);
    }

    isTileA5(tileId) {
        return tileId >= this.TILE_ID_A5 && tileId < this.TILE_ID_A5 + 256;
    }

    isTileA1(tileId) {
        return tileId >= this.TILE_ID_A1 && tileId < this.TILE_ID_A2;
    }

    isTileA2(tileId) {
        return tileId >= this.TILE_ID_A2 && tileId < this.TILE_ID_A3;
    }

    isTileA3(tileId) {
        return tileId >= this.TILE_ID_A3 && tileId < this.TILE_ID_A4;
    }

    isTileA4(tileId) {
        return tileId >= this.TILE_ID_A4 && tileId < this.TILE_ID_MAX;
    }

    getAutotileKind(tileId) {
        // Returns global kind number (0-127) across all autotile types
        // A1: 0-15, A2: 16-47, A3: 48-79, A4: 80-127
        // This is used by renderAutotile() which expects global kind indices
        return Math.floor((tileId - this.TILE_ID_A1) / 48);
    }

    getAutotileShape(tileId) {
        return (tileId - this.TILE_ID_A1) % 48;
    }

    isTileA1Waterfall(tileId) {
        // Check if this A1 tile is a waterfall (vertical animation)
        // Per RPG Maker MZ corescript: waterfalls are odd kinds >= 5 (5, 7, 9, 11, 13, 15)
        // Kinds 2, 3 are deep sea water/whirlpool (static, not waterfalls)
        if (!this.isTileA1(tileId)) return false;
        const kind = this.getAutotileKind(tileId);
        return kind >= 5 && kind % 2 === 1;
    }

    // ── A2 decoration classification ─────────────────────────────────────
    // The MZ editor decides "does this A2 autotile REPLACE the ground (z0)
    // or STACK onto the second A-slot (z1)?" from the ART: kinds drawn
    // with transparent pixels (paths, fences, the dish) are decorations.
    // There is no metadata for this — sample the sheet's alpha per kind.
    isA2DecorationKind(kind) {
        if (this._a2DecorKinds === null || this._a2DecorKinds === undefined) {
            this._a2DecorKinds = this._analyzeA2Sheet();
        }
        if (this._a2DecorKinds) return !!this._a2DecorKinds[kind];
        // Sheet pixels unavailable — positional fallback (right half of
        // each kind row holds the decoration blocks in the stock sheets).
        return (kind % 8) >= 4;
    }

    _analyzeA2Sheet() {
        try {
            const tex = this.tilesetTextures[1];   // A2 sheet
            const src = tex && tex.source && tex.source.resource;
            if (!src || !src.width) return null;
            const canvas = document.createElement('canvas');
            canvas.width = src.width;
            canvas.height = src.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(src, 0, 0);
            const blockW = src.width / 8, blockH = src.height / 4;   // 8×4 kinds
            const kinds = [];
            for (let k = 0; k < 32; k++) {
                const px = ctx.getImageData((k % 8) * blockW, Math.floor(k / 8) * blockH, blockW, blockH).data;
                let clear = 0;
                for (let i = 3; i < px.length; i += 4) {
                    if (px[i] < 16) clear++;
                }
                // >2% fully-transparent pixels → drawn as an overlay
                kinds[k] = clear / (px.length / 4) > 0.02;
            }
            return kinds;
        } catch (e) {
            return null;
        }
    }

    // MZ ☆ ("higher") flag — rmmz_core Tilemap._isHigherTile: bit 0x10 in
    // the tileset flags marks a tile that renders in the UPPER layer,
    // above every non-☆ tile regardless of z-slot order.
    isHigherTile(tileId) {
        const flags = this.currentTileset && this.currentTileset.flags;
        return !!(flags && (flags[tileId] & 0x10));
    }

    // The container a tile actually renders into: its z-slot's lower
    // container normally, or the z-slot's upper container when ☆-flagged
    // (mirrors rmmz_core Tilemap._addSpotTile routing).
    tileTargetLayer(layerIdx, tileId) {
        const L = this.layers;
        // A1 water/waterfalls animate by texture swap and must stay out of
        // the cached static containers — they get per-slot live overlays.
        if (this.isTileA1(tileId)) {
            return [L.a1ground, L.a1lower1, L.a1lower2, L.a1lower3][layerIdx];
        }
        return this.isHigherTile(tileId)
            ? [L.upper0, L.upper1, L.upper2, L.upper3][layerIdx]
            : [L.ground, L.lower1, L.lower2, L.lower3][layerIdx];
    }

    // Both containers a z-slot can render into — for cache invalidation
    // when a tile at that slot changes (the old sprite may be in either).
    containersForZ(layerIdx) {
        const L = this.layers;
        return [
            [L.ground, L.lower1, L.lower2, L.lower3][layerIdx],
            [L.upper0, L.upper1, L.upper2, L.upper3][layerIdx],
            [L.a1ground, L.a1lower1, L.a1lower2, L.a1lower3][layerIdx],
        ].filter(Boolean);
    }

    meshTileRects(tileId, x, y) {
        const w = this.TILE_WIDTH;
        const h = this.TILE_HEIGHT;
        if (!this.isAutotile(tileId)) {
            const setNumber = this.setNumberForTileId(tileId);
            if (setNumber < 0) return [];
            let sx;
            let sy;
            if (this.isTileA5(tileId)) {
                const localTileId = tileId - this.TILE_ID_A5;
                sx = (localTileId % 8) * w;
                sy = Math.floor(localTileId / 8) * h;
            } else if (tileId < this.TILE_ID_A5) {
                const localTileId = tileId % 256;
                sx = ((Math.floor(localTileId / 128) % 2) * 8 + (localTileId % 8)) * w;
                sy = (Math.floor(localTileId / 8) % 16) * h;
            } else {
                return [];
            }
            return [{ setNumber, sx, sy, dx: x * w, dy: y * h, w, h }];
        }

        const kind = this.getAutotileKind(tileId);
        const shape = this.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let setNumber;
        let bx;
        let by;
        let table;
        if (this.isTileA1(tileId)) {
            setNumber = 0;
            const waterSurfaceIndex = [0, 1, 2, 1][this.waterAnimationFrame];
            if (kind === 0) {
                bx = waterSurfaceIndex * 2;
                by = 0;
            } else if (kind === 1) {
                bx = waterSurfaceIndex * 2;
                by = 3;
            } else if (kind === 2) {
                bx = 6;
                by = 0;
            } else if (kind === 3) {
                bx = 6;
                by = 3;
            } else {
                bx = Math.floor(tx / 4) * 8;
                by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
                if (kind % 2 === 0) {
                    bx += waterSurfaceIndex * 2;
                } else {
                    bx += 6;
                    by += this.waterfallAnimationFrame;
                    table = this.WATERFALL_AUTOTILE_TABLE;
                }
            }
            table ||= this.FLOOR_AUTOTILE_TABLE;
        } else if (this.isTileA2(tileId)) {
            setNumber = 1;
            bx = tx * 2;
            by = (ty - 2) * 3;
            table = this.FLOOR_AUTOTILE_TABLE;
        } else if (this.isTileA3(tileId)) {
            setNumber = 2;
            bx = tx * 2;
            by = (ty - 6) * 2;
            table = this.WALL_AUTOTILE_TABLE;
        } else if (this.isTileA4(tileId)) {
            setNumber = 3;
            bx = tx * 2;
            const rowInA4 = ty - 10;
            const pairIndex = Math.floor(rowInA4 / 2);
            const isWall = rowInA4 % 2 === 1;
            by = pairIndex * 5 + (isWall ? 3 : 0);
            table = isWall ? this.WALL_AUTOTILE_TABLE : this.FLOOR_AUTOTILE_TABLE;
        } else {
            return [];
        }
        const pattern = table[shape];
        if (!pattern) return [];
        const w1 = w / 2;
        const h1 = h / 2;
        return pattern.map((source, index) => ({
            setNumber,
            sx: (bx * 2 + source[0]) * w1,
            sy: (by * 2 + source[1]) * h1,
            dx: x * w + (index % 2) * w1,
            dy: y * h + Math.floor(index / 2) * h1,
            w: w1,
            h: h1
        }));
    }

    rectUvs(rect, sourceWidth, sourceHeight) {
        return [
            rect.sx / sourceWidth, rect.sy / sourceHeight,
            (rect.sx + rect.w) / sourceWidth, rect.sy / sourceHeight,
            (rect.sx + rect.w) / sourceWidth, (rect.sy + rect.h) / sourceHeight,
            rect.sx / sourceWidth, (rect.sy + rect.h) / sourceHeight
        ];
    }

    appendVirtualMeshTile(tileId, x, y, holder) {
        const rects = this.meshTileRects(tileId, x, y);
        let a1Entry = null;
        for (const rect of rects) {
            const texture = this.tilesetTextures[rect.setNumber];
            const sourceWidth = Number(texture?.source?.width || texture?.width);
            const sourceHeight = Number(texture?.source?.height || texture?.height);
            if (!texture || !(sourceWidth > 0) || !(sourceHeight > 0)) continue;
            let group = holder._rrMeshGroups.get(rect.setNumber);
            if (!group) {
                group = { texture, positions: [], uvs: [], indices: [], a1Tiles: [] };
                holder._rrMeshGroups.set(rect.setNumber, group);
            }
            if (this.isTileA1(tileId) && !a1Entry) {
                a1Entry = { tileId, x, y, uvOffset: group.uvs.length };
                group.a1Tiles.push(a1Entry);
            }
            const base = group.positions.length / 2;
            group.positions.push(
                rect.dx, rect.dy,
                rect.dx + rect.w, rect.dy,
                rect.dx + rect.w, rect.dy + rect.h,
                rect.dx, rect.dy + rect.h
            );
            group.uvs.push(...this.rectUvs(rect, sourceWidth, sourceHeight));
            group.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            holder._rrMeshDirty = true;
        }
    }

    flushVirtualChunkMeshes() {
        if (!this._virtualChunkLayers || typeof PIXI.MeshGeometry !== 'function') return;
        for (const chunks of this._virtualChunkLayers.values()) {
            for (const holder of chunks.values()) {
                if (!holder._rrMeshDirty) continue;
                for (let i = holder.children.length - 1; i >= 0; i--) {
                    const child = holder.children[i];
                    if (!child._rrOwnedGeometry) continue;
                    holder.removeChild(child);
                    child.geometry?.destroy(true);
                    child.destroy();
                }
                for (const group of holder._rrMeshGroups.values()) {
                    if (group.indices.length === 0) continue;
                    const geometry = new PIXI.MeshGeometry({
                        positions: new Float32Array(group.positions),
                        uvs: new Float32Array(group.uvs),
                        indices: new Uint32Array(group.indices),
                        shrinkBuffersToFit: false
                    });
                    geometry.batchMode = 'no-batch';
                    const mesh = new PIXI.Mesh({
                        geometry,
                        texture: group.texture,
                        roundPixels: true
                    });
                    mesh.eventMode = 'none';
                    mesh._rrOwnedGeometry = true;
                    mesh._rrA1Tiles = group.a1Tiles;
                    holder.addChild(mesh);
                }
                holder._rrMeshGroups = new Map();
                holder._rrMeshDirty = false;
            }
        }
    }

    rebuildVirtualChunks(chunkKeys) {
        if (!this.usesVirtualViewport() || !chunkKeys?.size) return;
        for (const key of chunkKeys) {
            for (const [layer, chunks] of [...this._virtualChunkLayers]) {
                const holder = chunks.get(key);
                if (holder) this.destroyVirtualChunkHolder(layer, chunks, key, holder);
            }
        }
        this.a1TilePositions = this.a1TilePositions.filter(entry => {
            const key = `${Math.floor(entry.x / this.virtualChunkSize)},${Math.floor(entry.y / this.virtualChunkSize)}`;
            return !chunkKeys.has(key);
        });
        const bounds = this._renderedTileBounds;
        for (const key of chunkKeys) {
            const [chunkX, chunkY] = key.split(',').map(Number);
            const startX = Math.max(bounds?.startX || 0, chunkX * this.virtualChunkSize);
            const startY = Math.max(bounds?.startY || 0, chunkY * this.virtualChunkSize);
            const endX = Math.min(bounds?.endX ?? this.currentMap.width,
                this.currentMap.width, (chunkX + 1) * this.virtualChunkSize);
            const endY = Math.min(bounds?.endY ?? this.currentMap.height,
                this.currentMap.height, (chunkY + 1) * this.virtualChunkSize);
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) this.renderTileCell(x, y);
            }
        }
        this.flushVirtualChunkMeshes();
    }

    renderTile(tileId, x, y, layer) {
        if (tileId <= 0) return;

        if (layer?._rrVirtualChunk) {
            this.appendVirtualMeshTile(tileId, x, y, layer);
            return;
        }

        // NOTE: there used to be a "skip A2+ wherever an A1 exists" rule
        // here. MZ has no such rule — it renders every z-slot in order —
        // and it hid legitimate A-decorations stacked at z1 over water.

        // Route to appropriate rendering method
        if (this.isAutotile(tileId)) {
            this.renderAutotile(tileId, x, y, layer);
        } else {
            this.renderNormalTile(tileId, x, y, layer);
        }
    }

    renderNormalTile(tileId, x, y, layer) {
        // TileId 0 is always empty/transparent in RPG Maker
        if (tileId === 0) {
            return;
        }

        let setNumber = 0;

        // Determine which tileset image to use (RPG Maker MZ format)
        if (this.isTileA1(tileId)) {
            setNumber = 0; // A1
        } else if (this.isTileA2(tileId)) {
            setNumber = 1; // A2
        } else if (this.isTileA3(tileId)) {
            setNumber = 2; // A3
        } else if (this.isTileA4(tileId)) {
            setNumber = 3; // A4
        } else if (this.isTileA5(tileId)) {
            setNumber = 4; // A5
        } else {
            // B-E tilesets (tileId 0-1535)
            // B: 1-255 -> setNumber 5
            // C: 256-511 -> setNumber 6
            // D: 512-767 -> setNumber 7
            // E: 768-1023 -> setNumber 8
            // F: 1024-1279 -> setNumber 9, G: 1280-1535 -> setNumber 10
            // (Reactor's added sheets, in the band MZ leaves unallocated
            // between E and A5). Anything from 1536 up is an A-layer tile and
            // was handled above, so reaching here with one means a bad id.
            if (tileId >= 1536) {
                return; // Don't render invalid tile IDs
            }
            setNumber = 5 + Math.floor(tileId / 256);
        }


        const texture = this.tilesetTextures[setNumber];
        if (!texture) {
            return;
        }

        const w = this.TILE_WIDTH;
        const h = this.TILE_HEIGHT;

        // Calculate texture coordinates
        let localTileId = tileId;
        let sx, sy;

        if (this.isTileA5(tileId)) {
            // A5 tiles (1536-1791) - subtract base to get position 0-255
            // A5 tileset is 384px wide = 8 tiles per row
            localTileId = tileId - this.TILE_ID_A5;
            const tilesPerRow = 8;
            sx = (localTileId % tilesPerRow) * w;
            sy = Math.floor(localTileId / tilesPerRow) * h;
        } else if (tileId < 1536) {
            // B-E tiles (0-1535)
            // First, calculate which tileset (B/C/D/E) and get the local tile ID within that set
            // B: 0-255, C: 256-511, D: 512-767, E: 768-1023
            localTileId = tileId % 256; // Get position within the 256-tile set

            // RPG Maker MZ's formula for B-E tiles
            // Each tileset is split into two halves (left and right) of 128 tiles each
            sx = ((Math.floor(localTileId / 128) % 2) * 8 + (localTileId % 8)) * w;
            sy = (Math.floor((localTileId % 256) / 8) % 16) * h;
        }

        // PERFORMANCE: Cache textures to avoid recreating them
        // Exact texel frame: with nearest sampling + integer-pixel zoom
        // there is no edge bleeding. The old 0.5px inset + stretch
        // fattened thin art ~2% and made every cache/uncache cycle
        // visibly "breathe" when painting.
        const cacheKey = `${setNumber}_${sx}_${sy}`;
        let tileTexture = this.textureCache[cacheKey];
        if (!tileTexture) {
            tileTexture = new PIXI.Texture({
                source: texture.source,
                frame: new PIXI.Rectangle(sx, sy, w, h)
            });
            this.textureCache[cacheKey] = tileTexture;
        }

        const sprite = new PIXI.Sprite(tileTexture);
        sprite.x = x * this.TILE_WIDTH;
        sprite.y = y * this.TILE_HEIGHT;
        // Natural size (the frame is exactly one tile)
        sprite.width = w;
        sprite.height = h;
        sprite.roundPixels = true;

        // PERFORMANCE: Disable interactivity for tiles
        sprite.eventMode = 'none';

        layer.addChild(sprite);

        // PERFORMANCE: Track sprite for fast removal later
        const layerName = this._layerNameMap ? (this._layerNameMap.get(layer) || 'unknown') : 'unknown';
        const key = `${layerName}_${x}_${y}`;
        this.tileSprites[key] = [sprite];
    }

    renderAutotile(tileId, x, y, layer) {
        const kind = this.getAutotileKind(tileId);
        const shape = this.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let setNumber = 0;
        let bx = 0;
        let by = 0;
        let autotileTable = this.FLOOR_AUTOTILE_TABLE;

        // Determine tileset image and position based on tile type
        if (this.isTileA1(tileId)) {
            setNumber = 0; // A1
            // A1 autotiles animate with 3 frames
            // Water tiles: ping-pong pattern (0→1→2→1→0), animate horizontally
            // Waterfall tiles: straight loop (0→1→2→0), animate vertically
            const waterAnimationOffset = this.waterAnimationFrame * 2; // Each frame is 2 tiles wide (96px)

            // A1 layout: Palette has 8 cols × 2 rows (kinds 0-15)
            // Palette: Water A, Water B, Rocks C, Rocks C, Water D, Waterfall E, Water D, Waterfall E (row 0)
            // Tileset IMAGE has 4 source rows with blocks at [0, 3, 4, 7]

            // Use EXACT same logic as RPG Maker MZ corescript _addAutotile function
            // Instead of a lookup table, calculate bx/by directly from kind
            let animBx, animBy;
            const waterSurfaceIndex = [0, 1, 2, 1][this.waterAnimationFrame];

            if (kind === 0) {
                animBx = waterSurfaceIndex * 2;
                animBy = 0;
            } else if (kind === 1) {
                animBx = waterSurfaceIndex * 2;
                animBy = 3;
            } else if (kind === 2) {
                animBx = 6;
                animBy = 0;
            } else if (kind === 3) {
                animBx = 6;
                animBy = 3;
            } else {
                animBx = Math.floor(tx / 4) * 8;
                animBy = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
                if (kind % 2 === 0) {
                    // Even kinds: animated water
                    animBx += waterSurfaceIndex * 2;
                } else {
                    // Odd kinds: static decorations or waterfalls
                    animBx += 6;
                    // Per RMMZ corescript: ALL odd kinds >= 4 use WATERFALL_AUTOTILE_TABLE
                    autotileTable = this.WATERFALL_AUTOTILE_TABLE;
                    animBy += this.waterfallAnimationFrame;
                }
            }

            bx = animBx;
            by = animBy;
            // autotileTable is already set appropriately in the logic above
        } else if (this.isTileA2(tileId)) {
            setNumber = 1; // A2
            bx = tx * 2;
            by = (ty - 2) * 3;
            // All A2 tiles use normal autotile rendering
            autotileTable = this.FLOOR_AUTOTILE_TABLE;
        } else if (this.isTileA3(tileId)) {
            setNumber = 2; // A3
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = this.WALL_AUTOTILE_TABLE;
        } else if (this.isTileA4(tileId)) {
            setNumber = 3; // A4
            bx = tx * 2;
            // A4: 8 cols × 6 rows. Even rows: Roofs (2×3), Odd rows: Walls (2×2)
            // ty starts at 10 for A4 (kind 80), so ty ranges from 10-15
            const rowInA4 = ty - 10; // 0-5
            const pairIndex = Math.floor(rowInA4 / 2);
            const isWall = rowInA4 % 2 === 1;
            // For roofs: extract rows 0-1 of the 2x3 block (offset 0)
            // For walls: start at row 3 of the pair (after the roof's 3 rows)
            by = pairIndex * 5 + (isWall ? 3 : 0);
            // A4 walls use WALL_AUTOTILE_TABLE (16 shapes), roofs use FLOOR_AUTOTILE_TABLE (48 shapes)
            autotileTable = isWall ? this.WALL_AUTOTILE_TABLE : this.FLOOR_AUTOTILE_TABLE;
        }

        const texture = this.tilesetTextures[setNumber];
        if (!texture) {
            return;
        }

        // Get the autotile pattern from the table
        const table = autotileTable[shape];
        if (!table) {
            return;
        }
        const w1 = this.TILE_WIDTH / 2;
        const h1 = this.TILE_HEIGHT / 2;

        // PERFORMANCE: Determine layer name for sprite tracking
        const layerName = this._layerNameMap ? (this._layerNameMap.get(layer) || 'unknown') : 'unknown';
        const key = `${layerName}_${x}_${y}`;
        const spritesArray = [];

        // Render all 4 sub-tiles (24x24 each)
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1;
            const dx1 = x * this.TILE_WIDTH + (i % 2) * w1;
            const dy1 = y * this.TILE_HEIGHT + Math.floor(i / 2) * h1;

            // PERFORMANCE: Cache autotile sub-textures
            // Exact texel frame: with nearest sampling + integer-pixel zoom
            // there is no edge bleeding. The old 0.5px inset + stretch
            // fattened thin art ~2% and made every cache/uncache cycle
            // visibly "breathe" when painting.
            const cacheKey = `auto_${setNumber}_${sx1}_${sy1}`;
            let tileTexture = this.textureCache[cacheKey];
            if (!tileTexture) {
                tileTexture = new PIXI.Texture({
                    source: texture.source,
                    frame: new PIXI.Rectangle(sx1, sy1, w1, h1)
                });
                this.textureCache[cacheKey] = tileTexture;
            }

            const sprite = new PIXI.Sprite(tileTexture);
            sprite.x = dx1;
            sprite.y = dy1;
            // Natural size (the frame is exactly one tile)
            sprite.width = w1;
            sprite.height = h1;
            sprite.roundPixels = true;

            // PERFORMANCE: Disable interactivity for tiles
            sprite.eventMode = 'none';

            layer.addChild(sprite);
            spritesArray.push(sprite);
        }

        // PERFORMANCE: Track sprites for fast removal later
        this.tileSprites[key] = spritesArray;
    }

    isShadowTile(shadowBits) {
        // Shadow bits is a 4-bit bitmask value (0x00 to 0x0F)
        // Check if any of the lower 4 bits are set
        return (shadowBits & 0x0f) !== 0;
    }

    renderShadowTile(shadowBits, x, y, targetLayer = null) {
        // Render shadow using shadowBits bitmask (RPG Maker MZ approach)
        // shadowBits is a 4-bit value where each bit represents one quadrant:
        // Bit 0 (0x01) = bottom-left quadrant
        // Bit 1 (0x02) = bottom-right quadrant
        // Bit 2 (0x04) = top-left quadrant
        // Bit 3 (0x08) = top-right quadrant

        if (shadowBits & 0x0f) {
            const w1 = this.TILE_WIDTH / 2;   // Half tile width
            const h1 = this.TILE_HEIGHT / 2;  // Half tile height

            // Create ONE container per tile (not per quadrant)
            const container = new PIXI.Container();
            container.x = x * this.TILE_WIDTH;
            container.y = y * this.TILE_HEIGHT;

            // Iterate through the 4 quadrants
            for (let i = 0; i < 4; i++) {
                if (shadowBits & (1 << i)) {
                    // Calculate position for this quadrant
                    // i % 2 gives column (0 or 1), Math.floor(i / 2) gives row (0 or 1)
                    const quadOffsetX = (i % 2) * w1;
                    const quadOffsetY = Math.floor(i / 2) * h1;

                    // Create a solid black texture if not cached
                    if (!this.blackShadowTexture) {
                        const canvas = document.createElement('canvas');
                        canvas.width = 1;
                        canvas.height = 1;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#000000';
                        ctx.fillRect(0, 0, 1, 1);
                        this.blackShadowTexture = PIXI.Texture.from(canvas);
                    }

                    // Use a Sprite with solid black texture instead of Graphics
                    const shadowSprite = new PIXI.Sprite(this.blackShadowTexture);
                    shadowSprite.x = quadOffsetX;
                    shadowSprite.y = quadOffsetY;
                    shadowSprite.width = w1;
                    shadowSprite.height = h1;
                    shadowSprite.alpha = 0.48;

                    container.addChild(shadowSprite);
                }
            }

            (targetLayer || this.layers.shadow).addChild(container);
            // Track for clearTileSpritesAt — without this, repainting a
            // shadow stacked a duplicate container on the old one, visibly
            // darkening the quadrants a little more on every paint.
            this.tileSprites[`shadow_${x}_${y}`] = [container];
        }
    }

    // PERFORMANCE: Update only a single shadow tile without re-rendering entire map
    updateShadowTile(x, y, shadowBits) {
        if (!this.layers || !this.layers.shadow) return;

        if (this.usesVirtualViewport()) {
            this.clearTileSpritesAt(x, y, this.layers.shadow);
            if (shadowBits > 0) {
                const holder = this.virtualTileLayer(this.layers.shadow, x, y);
                this.renderShadowTile(shadowBits, x, y, holder);
            }
            this.pruneVirtualChunkLayers();
            return;
        }

        // Remove existing shadow containers for this tile position
        const tileX = x * this.TILE_WIDTH;
        const tileY = y * this.TILE_HEIGHT;

        // Filter out shadow containers at this tile position
        const childrenToRemove = [];
        for (const child of this.layers.shadow.children) {
            if (child.x === tileX && child.y === tileY) {
                childrenToRemove.push(child);
            }
        }

        for (const child of childrenToRemove) {
            this.layers.shadow.removeChild(child);
            child.destroy({ children: true });
        }

        // Render the new shadow if shadowBits is non-zero
        if (shadowBits > 0) {
            this.renderShadowTile(shadowBits, x, y);
        }
    }

    clearMap() {
        // Stop A1 animation ticker
        if (this.animationTicker) {
            this.app.ticker.remove(this.animationTicker);
            this.animationTicker = null;
        }

        if (this.mapMask) {
            this.mapMask.destroy();
            this.mapMask = null;
        }
        if (this.container) {
            this.destroyAllVirtualChunkLayers();
            this.container.destroy({ children: true });
            this.container = null;
        }
        this.currentMap = null;
        this.parallaxSprite = null;
        this.layers = {
            parallax: null,
            ground: null,
            lower: null,
            upper: null,
            shadow: null
        };
    }

    // Full cleanup when this TilemapManager is being replaced (e.g., project switch)
    destroy() {
        this.destroyed = true;
        this.cancelPendingMapLoad();

        // Stop animation tickers
        if (this.animationTicker) {
            this.app.ticker.remove(this.animationTicker);
            this.animationTicker = null;
        }
        if (this.parallaxTicker) {
            this.app.ticker.remove(this.parallaxTicker);
            this.parallaxTicker = null;
        }

        // Destroy texture caches
        for (const key in this.textureCache) {
            if (this.textureCache[key] && this.textureCache[key].destroy) {
                this.textureCache[key].destroy(false);
            }
        }
        for (const key in this.a1AnimationCache) {
            if (this.a1AnimationCache[key] && this.a1AnimationCache[key].destroy) {
                this.a1AnimationCache[key].destroy(false);
            }
        }
        this.textureCache = {};
        this.a1AnimationCache = {};
        this.tilesetTextures = {};

        // Remove and destroy container from stage
        if (this.mapMask) {
            this.mapMask.destroy();
            this.mapMask = null;
        }
        if (this.container) {
            this.destroyAllVirtualChunkLayers();
            this.app.stage.removeChild(this.container);
            this.container.destroy({ children: true });
            this.container = null;
        }

        this.currentMap = null;
        this.currentTileset = null;
        this.parallaxSprite = null;
        this.a1TilePositions = [];
        this.tileSprites = {};
        this.layers = {};
    }

    // Get tile at position
    getTileAt(x, y, layerIndex = 0) {
        if (!this.currentMap) return 0;

        const { width, height, data } = this.currentMap;
        if (x < 0 || x >= width || y < 0 || y >= height) return 0;

        const layerHeight = width * height;
        const index = layerHeight * layerIndex + y * width + x;

        return data[index] || 0;
    }

    // Set tile at position
    setTileAt(x, y, tileId, layerIndex = 0) {
        if (!this.currentMap) return;

        const { width, height, data } = this.currentMap;
        if (x < 0 || x >= width || y < 0 || y >= height) return;

        const layerHeight = width * height;
        const index = layerHeight * layerIndex + y * width + x;

        data[index] = tileId;
        if (!this.isTileCellRendered(x, y)) return;

        if (this.usesVirtualViewport()) {
            const key = `${Math.floor(x / this.virtualChunkSize)},${Math.floor(y / this.virtualChunkSize)}`;
            this.rebuildVirtualChunks(new Set([key]));
            return;
        }

        // Re-render the affected tile
        this.clearTileAt(x, y, layerIndex);

        if (tileId > 0) {
            const layer = this.virtualTileLayer(this.tileTargetLayer(layerIndex, tileId), x, y);
            if (layer) {
                this.renderTile(tileId, x, y, layer);
            }
        }
    }

    clearTileAt(x, y, layerIndex = 0) {
        if (this.usesVirtualViewport()) {
            const key = `${Math.floor(x / this.virtualChunkSize)},${Math.floor(y / this.virtualChunkSize)}`;
            this.rebuildVirtualChunks(new Set([key]));
            return;
        }
        // The old sprite can live in either stack of the z-slot (☆ tiles
        // render in the upper container).
        for (const layer of this.containersForZ(layerIndex)) {
            // Remove existing sprite at this position
            for (let i = layer.children.length - 1; i >= 0; i--) {
                const child = layer.children[i];
                if (child.x === x * this.TILE_WIDTH && child.y === y * this.TILE_HEIGHT) {
                    layer.removeChild(child);
                    child.destroy();
                }
            }
        }
    }

    // Convert screen coordinates to tile coordinates
    screenToTile(screenX, screenY) {
        return {
            x: Math.floor(screenX / this.TILE_WIDTH),
            y: Math.floor(screenY / this.TILE_HEIGHT)
        };
    }

    // Convert tile coordinates to screen coordinates
    tileToScreen(tileX, tileY) {
        return {
            x: tileX * this.TILE_WIDTH,
            y: tileY * this.TILE_HEIGHT
        };
    }

    getPersistedMapData(map = this.currentMap) {
        if (!map) return null;
        const data = { ...map };
        delete data.id;
        delete data.name;
        // Elevation and camera live in Map###.r3d.json beside the map. They are
        // attached to the loaded map so the 3D view can read them, and writing
        // them back here would put fields RPG Maker does not know into a file
        // that has to stay ordinary RPG Maker data.
        delete data.reactor3d;
        return data;
    }

    /**
     * Read `Map###.r3d.json` onto the map, if it has one.
     *
     * With the map, not with the 3D view. It used to be attached only when
     * that view opened, which held while everything in the file was something
     * only that view could show.
     *
     * Grouping is not: it is painted on the 2D canvas, so the file has to be
     * in hand whenever the map is. Without this an author who grouped some
     * buildings, saved, and reopened the project found the numbers gone — they
     * were on disk, but nothing had read them back, so the palette drew an
     * empty overlay. The silent half was worse than the visible one: painting
     * again over an unread sidecar and saving writes one built from nothing,
     * taking everything else in the file with it.
     */
    loadMapSidecar(mapData) {
        if (!this.fs || !this.path || !this.projectPath || !mapData || !mapData.id) return false;
        const elevation = this.mapElevation();
        const suffix = elevation ? elevation.SUFFIX : '.r3d.json';
        const file = `Map${String(mapData.id).padStart(3, '0')}${suffix}`;
        const filePath = this.path.join(this.projectPath, 'data', file);
        try {
            if (!this.fs.existsSync(filePath)) return false;
            const sidecar = JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
            if (sidecar && typeof sidecar === 'object') {
                mapData.reactor3d = sidecar;
                return true;
            }
        } catch (error) {
            // A corrupt sidecar must not stop the map opening: the map is the
            // work, and its 3D notes are recoverable by repainting.
            console.error(`${file} could not be read.`, error);
        }
        return false;
    }

    /** The height field module, absent on a host that never loaded it. */
    mapElevation() {
        return (typeof RRMapElevation !== 'undefined' && RRMapElevation)
            || (typeof window !== 'undefined' && window.RRMapElevation) || null;
    }

    /**
     * Write the map's 3D sidecar, or clear it when nothing is left to say.
     *
     * Separate from the map itself, and failing here must not fail the save:
     * losing a height field is bad, losing the map is worse.
     */
    saveMapSidecar() {
        const elevation = this.mapElevation();
        if (!elevation || !this.currentMap || !this.fs || !this.path) return false;
        try {
            return elevation.save(this.fs, this.path, this.projectPath, this.currentMap, {
                writeFileAtomicSync: this._writeFileAtomic
                    ? (fs, filePath, data, encoding) =>
                        this._writeFileAtomic(fs, filePath, data, encoding)
                    : null
            });
        } catch (error) {
            console.error('Error saving the map 3D sidecar:', error);
            return false;
        }
    }

    /**
     * The sidecar's contribution to "has this map changed".
     *
     * It is deliberately not part of `getPersistedMapData` — that is what goes
     * into `Map###.json`, which has to stay ordinary RPG Maker data. But it is
     * still the author's work, and a change to it is still a change to the map.
     */
    sidecarState() {
        const sidecar = this.currentMap && this.currentMap.reactor3d;
        return sidecar ? JSON.stringify(sidecar) : null;
    }

    captureSavedMapState() {
        const data = this.getPersistedMapData();
        this.savedMapState = data ? JSON.stringify(data) : null;
        this.savedSidecarState = this.sidecarState();
    }

    isMapDirty() {
        const data = this.getPersistedMapData();
        if (!data || this.savedMapState === null) return false;
        // The 3D sidecar lives beside the map rather than in it, and
        // comparing only what goes into `Map###.json` said a map with a
        // freshly grouped building was unchanged — so closing the project
        // never asked, and the work went with it.
        if (this.sidecarState() !== this.savedSidecarState) return true;
        return JSON.stringify(data) !== this.savedMapState;
    }

    // Save current map data to JSON file
    saveMap() {
        if (!this.fs || !this.path) {
            return false;
        }

        if (!this.currentMap) {
            return false;
        }

        try {
            const mapId = this.currentMap.id;
            const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
            const mapPath = this.path.join(this.projectPath, 'data', mapFile);

            const mapDataToSave = this.getPersistedMapData();

            // Write map data to file with formatting
            const json = typeof RRMapJson !== 'undefined'
                ? RRMapJson.stringify(mapDataToSave)
                : JSON.stringify(mapDataToSave, null, 2);
            this._writeFileAtomic(this.fs, mapPath, json, 'utf8');
            this.saveMapSidecar();
            this.captureSavedMapState();
            this.bumpVersionId();

            return true;
        } catch (error) {
            console.error('Error saving map:', error);
            return false;
        }
    }

    // RPG Maker regenerates $dataSystem.versionId on every editor save; the
    // runtime's Scene_Load.reloadMapIfUpdated compares it against save files
    // to force a fresh map setup when data changed. Without this, loading a
    // save made on an older version of an edited map leaves stale
    // Game_Events pointing at missing $dataMap entries (crash at map load).
    bumpVersionId() {
        try {
            const systemPath = this.path.join(this.projectPath, 'data', 'System.json');
            const system = JSON.parse(this.fs.readFileSync(systemPath, 'utf8'));
            system.versionId = Math.floor(Math.random() * 100000000);
            this._writeFileAtomic(this.fs, systemPath, JSON.stringify(system, null, 2));
        } catch (error) {
            console.error('Error bumping versionId:', error);
        }
    }

    /**
     * Generate a thumbnail image of a map by rendering it with Pixi and extracting the image
     * @param {number} mapId - The map ID to render
     * @param {number} maxWidth - Maximum width of thumbnail
     * @param {number} maxHeight - Maximum height of thumbnail
     * @returns {Promise<HTMLCanvasElement>} Canvas containing the thumbnail
     */
    /**
     * Render a map directly to a canvas element (for preview purposes)
     * This renders the full map without affecting the main Pixi renderer
     * @param {number} mapId - The map ID to render
     * @param {HTMLCanvasElement} targetCanvas - Canvas to render to
     * @param {Object} options - Rendering options
     * @returns {Promise<boolean>} Success status
     */
    async renderMapToCanvas(mapId, targetCanvas, options = {}) {
        if (!this.fs || !this.path) {
            return false;
        }

        try {
            const includeParallax = options.includeParallax !== false;
            const includeShadows = options.includeShadows !== false;
            const includeEvents = options.includeEvents !== false;

            // Load map data
            const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
            const mapPath = this.path.join(this.projectPath, 'data', mapFile);

            if (!this.fs.existsSync(mapPath)) {
                return false;
            }

            const mapData = JSON.parse(this.fs.readFileSync(mapPath, 'utf8'));
            const { width, height, data, tilesetId } = mapData;

            // Load tileset
            let tileset = this.databaseManager.getTileset(tilesetId);
            if (!tileset) {
                tileset = this.databaseManager.getTilesets()[0];
                if (!tileset) {
                    return false;
                }
            }

            // Set canvas size to map size
            const tileSize = this.TILE_SIZE;
            targetCanvas.width = width * tileSize;
            targetCanvas.height = height * tileSize;

            const ctx = targetCanvas.getContext('2d');

            // Fill with black background
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

            // Render parallax background if present
            if (includeParallax && mapData.parallaxShow && mapData.parallaxName && mapData.parallaxName !== '') {
                await this.renderParallaxToCanvas(ctx, mapData, width, height, tileSize);
            }

            // Load tileset images
            const tilesetImages = await this.loadTilesetImagesForPreview(tileset);

            // Render layers 0-3. Layer 4 is shadow bits; layer 5 is regions.
            const layerSize = width * height;

            // Two passes per MZ's ☆ ("higher") flag: non-☆ tiles paint in
            // z-slot order first, ☆ tiles paint above them all — same
            // routing as the live tilemap (rmmz _addSpotTile).
            const tsFlags = tileset && tileset.flags;
            const isHigher = (tileId) => !!(tsFlags && (tsFlags[tileId] & 0x10));
            const drawTileLayer = (layerIndex, higherPass) => {
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const index = layerIndex * layerSize + y * width + x;
                        const tileId = data[index];

                        if (tileId > 0 && isHigher(tileId) === higherPass) {
                            this.drawTileToCanvas(ctx, tileId, x, y, tilesetImages, tileSize);
                        }
                    }
                }
            };

            drawTileLayer(0, false);

            if (includeShadows) {
                const shadowOffset = 4 * layerSize;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const shadowBits = data[shadowOffset + y * width + x] || 0;
                        if (shadowBits > 0) {
                            this.drawShadowToCanvas(ctx, shadowBits, x, y, tileSize);
                        }
                    }
                }
            }

            for (let layerIndex = 1; layerIndex < 4; layerIndex++) {
                drawTileLayer(layerIndex, false);
            }
            for (let layerIndex = 0; layerIndex < 4; layerIndex++) {
                drawTileLayer(layerIndex, true);
            }

            // Render events on top of tiles
            if (includeEvents && mapData.events && mapData.events.length > 0) {
                let eventsRendered = 0;
                mapData.events.forEach((event, index) => {
                    if (!event || index === 0) return; // Skip null and index 0

                    const eventX = event.x * tileSize;
                    const eventY = event.y * tileSize;

                    // Draw event background box (black with white border)
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                    ctx.fillRect(eventX, eventY, tileSize, tileSize);

                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(eventX, eventY, tileSize, tileSize);

                    // Draw event name
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';

                    const eventName = event.name || 'Event';
                    const textX = eventX + tileSize / 2;
                    const textY = eventY + tileSize - 4;

                    ctx.strokeText(eventName, textX, textY);
                    ctx.fillText(eventName, textX, textY);

                    eventsRendered++;
                });
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    drawShadowToCanvas(ctx, shadowBits, x, y, tileSize) {
        const w1 = tileSize / 2;
        const h1 = tileSize / 2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';

        for (let i = 0; i < 4; i++) {
            if (shadowBits & (1 << i)) {
                const dx = x * tileSize + (i % 2) * w1;
                const dy = y * tileSize + Math.floor(i / 2) * h1;
                ctx.fillRect(dx, dy, w1, h1);
            }
        }
    }

    /**
     * Load tileset images for canvas preview (returns Image objects, not Pixi textures)
     */
    async loadTilesetImagesForPreview(tileset) {
        const imgPath = this.path.join(this.projectPath, 'img', 'tilesets');
        const images = [];

        for (let i = 0; i < tileset.tilesetNames.length; i++) {
            const name = tileset.tilesetNames[i];
            if (!name) {
                images[i] = null;
                continue;
            }

            const filePath = this.path.join(imgPath, name + '.png');
            if (!this.fs.existsSync(filePath)) {
                images[i] = null;
                continue;
            }

            // Load as Image for canvas rendering
            const img = new Image();
            img.src = this.assetUrl(filePath);
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = (err) => {
                    reject(err);
                };
            });

            images[i] = img;
        }

        return images;
    }

    /**
     * Render parallax background to canvas (for preview)
     */
    async renderParallaxToCanvas(ctx, mapData, mapWidth, mapHeight, tileSize) {
        const { parallaxName, parallaxLoopX, parallaxLoopY } = mapData;

        const parallaxPath = this.path.join(this.projectPath, 'img', 'parallaxes', parallaxName + '.png');

        if (!this.fs.existsSync(parallaxPath)
            && !(typeof window !== 'undefined' && window.RREncryptedAssets?.assetExists(parallaxPath))) {
            return; // Skip if image doesn't exist
        }

        // Load parallax image
        const img = new Image();
        img.src = this.assetUrl(parallaxPath);

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvasWidth = mapWidth * tileSize;
        const canvasHeight = mapHeight * tileSize;

        // MZ semantics: the parallax always repeats to fill the map — the
        // loop flags only control scrolling, and the "!" prefix only
        // scroll-locking; neither affects whether the image tiles.
        const pattern = ctx.createPattern(img, 'repeat');
        if (pattern) {
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
    }

    /**
     * Draw a single tile to canvas context (for preview rendering)
     * Handles both normal tiles and autotiles
     */
    drawTileToCanvas(ctx, tileId, x, y, tilesetImages, tileSize) {
        if (tileId === 0) return;

        const w = tileSize;
        const h = tileSize;

        // Check if this is an autotile that needs special rendering
        if (this.isAutotile(tileId)) {
            this.drawAutotileToCanvas(ctx, tileId, x, y, tilesetImages, tileSize);
            return;
        }

        // Normal tile rendering (A5, B-E)
        let setNumber = 0;
        let sx, sy;

        if (this.isTileA5(tileId)) {
            // A5 tiles - normal tiles, not autotiles
            setNumber = 4;
            const localTileId = tileId - this.TILE_ID_A5;
            const tilesPerRow = 8;
            sx = (localTileId % tilesPerRow) * w;
            sy = Math.floor(localTileId / tilesPerRow) * h;
        } else if (tileId < 1536) {
            // B-E tiles - normal tiles
            if (tileId >= 1536) return; // Invalid

            setNumber = 5 + Math.floor(tileId / 256);
            const localTileId = tileId % 256;

            // EXACT formula from renderNormalTile
            sx = ((Math.floor(localTileId / 128) % 2) * 8 + (localTileId % 8)) * w;
            sy = (Math.floor((localTileId % 256) / 8) % 16) * h;
        } else {
            return; // Invalid tile ID
        }

        const img = tilesetImages[setNumber];
        if (!img || !img.complete || img.naturalWidth === 0) {
            return; // No image or image not loaded
        }

        try {
            ctx.drawImage(img, sx, sy, w, h, x * w, y * h, w, h);
        } catch (e) {
            // Failed to draw tile
        }
    }

    /**
     * Draw an autotile (A1-A4) to canvas using the same logic as renderAutotile
     */
    drawAutotileToCanvas(ctx, tileId, x, y, tilesetImages, tileSize) {
        const kind = this.getAutotileKind(tileId);
        const shape = this.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let setNumber = 0;
        let bx = 0;
        let by = 0;
        let autotileTable = this.FLOOR_AUTOTILE_TABLE;

        // Determine tileset image and position based on tile type
        // Using EXACT same logic as RPG Maker MZ corescript (static frame 0 for preview)
        if (this.isTileA1(tileId)) {
            setNumber = 0;
            // Use first animation frame for static preview
            if (kind === 0) {
                bx = 0; // waterSurfaceIndex=0, *2
                by = 0;
            } else if (kind === 1) {
                bx = 0;
                by = 3;
            } else if (kind === 2) {
                bx = 6;
                by = 0;
            } else if (kind === 3) {
                bx = 6;
                by = 3;
            } else {
                bx = Math.floor(tx / 4) * 8;
                by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
                if (kind % 2 === 0) {
                    bx += 0; // waterSurfaceIndex=0, *2
                } else {
                    bx += 6;
                    // Every odd A1 kind uses the waterfall table — the runtime
                    // and both sibling render paths do this unconditionally.
                    // Gating on tx skipped kinds 9 and 11, which then sampled
                    // the floor table's rects and drew the wrong art.
                    autotileTable = this.WATERFALL_AUTOTILE_TABLE;
                }
            }
        } else if (this.isTileA2(tileId)) {
            setNumber = 1;
            bx = tx * 2;
            by = (ty - 2) * 3;
            autotileTable = this.FLOOR_AUTOTILE_TABLE;
        } else if (this.isTileA3(tileId)) {
            setNumber = 2;
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = this.WALL_AUTOTILE_TABLE;
        } else if (this.isTileA4(tileId)) {
            setNumber = 3;
            bx = tx * 2;
            const rowInA4 = ty - 10;
            const pairIndex = Math.floor(rowInA4 / 2);
            const isWall = rowInA4 % 2 === 1;
            by = pairIndex * 5 + (isWall ? 3 : 0);
            autotileTable = isWall ? this.WALL_AUTOTILE_TABLE : this.FLOOR_AUTOTILE_TABLE;
        } else {
            return; // Unknown autotile
        }

        const img = tilesetImages[setNumber];
        if (!img || !img.complete || img.naturalWidth === 0) {
            return;
        }

        const table = autotileTable[shape];
        if (!table) {
            return;
        }

        const w1 = tileSize / 2;
        const h1 = tileSize / 2;

        // Render all 4 sub-tiles (24x24 each) - EXACT same logic as renderAutotile
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1;
            const dx1 = x * tileSize + (i % 2) * w1;
            const dy1 = y * tileSize + Math.floor(i / 2) * h1;

            try {
                ctx.drawImage(img, sx1, sy1, w1, h1, dx1, dy1, w1, h1);
            } catch (e) {
                // Failed to draw autotile sub-tile
            }
        }
    }
}
