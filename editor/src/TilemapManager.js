// RPG Reactor - Tilemap Manager
// Handles tilemap rendering using Pixi.js, compatible with RPG Maker MZ format

// PIXI8: Set global texture defaults for pixel-perfect rendering BEFORE loading any textures
if (typeof PIXI !== 'undefined' && PIXI.TextureStyle) {
    PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';
}

class TilemapManager {
    constructor(app, projectPath, databaseManager) {
        this.app = app;
        this.projectPath = projectPath;
        this.databaseManager = databaseManager;
        this.fs = null;
        this.path = null;

        // Initialize Node.js modules if running in NW.js
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }

        // Tilemap constants (RPG Maker MZ compatible)
        this.TILE_WIDTH = 48;
        this.TILE_HEIGHT = 48;
        this.TILE_SIZE = 48;  // Tiles are square (48x48)
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

        // Animation state for A1 autotiles
        this.waterAnimationFrame = 0; // 0, 1, or 2 (ping-pong: 0→1→2→1→0)
        this.waterfallAnimationFrame = 0; // 0, 1, or 2 (straight: 0→1→2→0)
        this.waterAnimationDirection = 1; // 1 for forward, -1 for backward
        this.animationTicker = null;
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

    async loadMap(mapId) {
        if (!this.fs || !this.path) {
            return false;
        }

        try {
            // Load map data
            const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
            const mapPath = this.path.join(this.projectPath, 'data', mapFile);

            if (!this.fs.existsSync(mapPath)) {
                return false;
            }

            const mapData = JSON.parse(this.fs.readFileSync(mapPath, 'utf8'));
            // Set the map ID (it's not stored in the JSON file)
            mapData.id = mapId;
            this.currentMap = mapData;

            // PERFORMANCE: Clear and destroy texture caches when loading a new map
            // Destroy old cached textures to free GPU memory
            for (const key in this.textureCache) {
                if (this.textureCache[key] && this.textureCache[key].destroy) {
                    this.textureCache[key].destroy(false); // Don't destroy base texture
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

            // Load tileset for this map
            let tileset = this.databaseManager.getTileset(mapData.tilesetId);
            if (!tileset) {
                console.warn(`Tileset ${mapData.tilesetId} not found for map ${mapId}; using first available tileset as fallback.`);
                tileset = this.databaseManager.getTilesets()[0];
                if (!tileset) {
                    return false;
                }
            }
            this.currentTileset = tileset;

            // Load tileset images
            await this.loadTilesetImages(tileset);

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

            return true;
        } catch (error) {
            console.error(`Error loading map ${mapId}:`, error);
            return false;
        }
    }

    async loadTilesetImages(tileset) {
        const imgPath = this.path.join(this.projectPath, 'img', 'tilesets');

        // Load all tileset images (A1-A5, B, C, D, E)
        const promises = [];

        for (let i = 0; i < tileset.tilesetNames.length; i++) {
            const name = tileset.tilesetNames[i];
            if (!name) continue;

            const filePath = this.path.join(imgPath, name + '.png');

            // Convert to file:// URL for Pixi.js
            const fileUrl = 'file://' + filePath.replace(/\\/g, '/');

            // PERFORMANCE: Skip existsSync — let PIXI.Assets.load handle missing files
            // via catch handler. This avoids blocking synchronous disk I/O per tileset image.
            const idx = i;
            promises.push(
                PIXI.Assets.load(fileUrl).then(texture => {
                    // Set texture wrap mode to CLAMP to prevent tiling/repeating (PIXI v8 API)
                    texture.source.style.addressMode = 'clamp-to-edge';
                    texture.source.style.scaleMode = 'nearest'; // Pixel-perfect
                    // PIXI v8 defaults to proper alpha handling for PNG files
                    this.tilesetTextures[idx] = texture;
                }).catch(err => {
                    // Failed to load tileset image (file missing or corrupt)
                })
            );
        }

        await Promise.all(promises);
    }

    createTilemapContainer() {
        // Remove old container if exists
        if (this.container) {
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
        this.layers.upper4 = new PIXI.Container();
        this.layers.upper5 = new PIXI.Container();
        this.layers.shadow = new PIXI.Container();
        this.layers.layerHighlight = new PIXI.Container();

        // PERFORMANCE: Enable culling on all layers to skip rendering off-screen sprites
        this.layers.ground.cullable = true;
        this.layers.lower1.cullable = true;
        this.layers.lower2.cullable = true;
        this.layers.lower3.cullable = true;
        this.layers.upper4.cullable = true;
        this.layers.upper5.cullable = true;
        this.layers.shadow.cullable = true;

        // PERFORMANCE: Build layer-to-name map for fast sprite tracking lookups
        this._layerNameMap = new Map([
            [this.layers.ground, 'ground'],
            [this.layers.lower1, 'lower1'],
            [this.layers.lower2, 'lower2'],
            [this.layers.lower3, 'lower3'],
            [this.layers.shadow, 'shadow']
        ]);

        // Add layers in correct rendering order (bottom to top)
        this.container.addChild(this.layers.checkerboard);
        this.container.addChild(this.layers.parallax);
        this.container.addChild(this.layers.ground);
        this.container.addChild(this.layers.shadow);
        this.container.addChild(this.layers.lower1);
        this.container.addChild(this.layers.lower2);
        this.container.addChild(this.layers.lower3);
        this.container.addChild(this.layers.upper4);
        this.container.addChild(this.layers.upper5);
        this.container.addChild(this.layers.layerHighlight);

        // Add panning support
        this.setupPanning();
    }

    setupPanning() {
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        const canvasContainer = document.getElementById('canvas-container');

        // Middle mouse button or Shift+drag for panning
        this.container.on('pointerdown', (event) => {
            // Check for middle mouse button or shift key
            if (event.data.button === 1 || event.data.originalEvent.shiftKey) {
                isDragging = true;
                dragStart = {
                    x: event.data.global.x + canvasContainer.scrollLeft,
                    y: event.data.global.y + canvasContainer.scrollTop
                };
                event.stopPropagation(); // Prevent tile painting while panning
            }
        });

        this.container.on('pointermove', (event) => {
            if (isDragging) {
                // Scroll the container element instead of moving the Pixi container
                canvasContainer.scrollLeft = dragStart.x - event.data.global.x;
                canvasContainer.scrollTop = dragStart.y - event.data.global.y;
            }
        });

        this.container.on('pointerup', () => {
            isDragging = false;
        });

        this.container.on('pointerupoutside', () => {
            isDragging = false;
        });

        // Remove any existing custom scrollbar elements
        if (canvasContainer) {
            const existingScrollbars = canvasContainer.querySelectorAll('.custom-scrollbar, .custom-scrollbar-corner');
            existingScrollbars.forEach(el => el.remove());
        }

        // Initialize custom scrollbars
        this.initCustomScrollbars(canvasContainer);

        // Mouse wheel zoom
        if (canvasContainer) {
            canvasContainer.addEventListener('wheel', (event) => {
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
                let minScale = 0.1;
                if (viewportWidth > 0 && viewportHeight > 0 && mapWidthPx > 0 && mapHeightPx > 0) {
                    const minScaleX = viewportWidth / mapWidthPx;
                    const minScaleY = viewportHeight / mapHeightPx;
                    minScale = Math.max(Math.min(minScaleX, minScaleY), 0.1);
                }
                const maxScale = 5;

                const newScale = Math.max(minScale, Math.min(maxScale, oldScale * scaleFactor));

                if (newScale !== oldScale) {
                    this.pauseLazyLoading();

                    // Get mouse position in viewport
                    const containerRect = canvasContainer.getBoundingClientRect();
                    const mouseX = event.clientX - containerRect.left;
                    const mouseY = event.clientY - containerRect.top;

                    // Get world position under mouse (accounting for container offset)
                    const worldX = (mouseX - this.container.x) / oldScale;
                    const worldY = (mouseY - this.container.y) / oldScale;

                    // Apply new scale
                    this.container.scale.set(newScale, newScale);

                    // Adjust container position to keep world point under mouse
                    this.container.x = mouseX - worldX * newScale;
                    this.container.y = mouseY - worldY * newScale;

                    // Clamp container position to prevent drifting outside bounds
                    const mapWidth = this.currentMap.width * this.TILE_SIZE * newScale;
                    const mapHeight = this.currentMap.height * this.TILE_SIZE * newScale;
                    const minX = Math.min(0, containerRect.width - mapWidth);
                    const minY = Math.min(0, containerRect.height - mapHeight);
                    this.container.x = Math.max(minX, Math.min(0, this.container.x));
                    this.container.y = Math.max(minY, Math.min(0, this.container.y));

                    // Update scrollbars
                    this.updateScrollbars();

                    // Re-crop the canvas to the new scaled map size.
                    this.applyViewportCrop();

                    if (this.onZoomChange) {
                        this.onZoomChange(newScale);
                    }

                    setTimeout(() => this.resumeLazyLoading(), 150);
                }
            }, { passive: false });
        }

        // Handle window resize - adjust zoom to maintain minimum constraints
        window.addEventListener('resize', () => {
            if (!this.currentMap || !this.container) return;
            if (this.applyMinScaleClamp()) {
                // Container scale changed; reset position so the map stays anchored.
                this.container.x = 0;
                this.container.y = 0;
            }
            this.updateCanvasSize();
            // Run AFTER ProjectController's resize handler resets renderer to full
            // canvas-container size — defer with a microtask so our crop wins.
            Promise.resolve().then(() => this.applyViewportCrop());
        });
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

        const minScaleX = viewportWidth / mapWidthPx;
        const minScaleY = viewportHeight / mapHeightPx;
        // Contain-fit floor so the user can zoom out enough to see the whole map.
        // Parallax bleed beyond the map edges is suppressed separately by
        // applyViewportCrop() which shrinks the PIXI canvas to the map's scaled size.
        const minScale = Math.max(Math.min(minScaleX, minScaleY), 0.1);

        const currentScale = this.container.scale.x;
        if (currentScale < minScale) {
            this.container.scale.set(minScale, minScale);
            if (this.onZoomChange) this.onZoomChange(minScale);
            return true;
        }
        return false;
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

        document.addEventListener('mousemove', (e) => {
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

            if (direction === 'horizontal') {
                this.container.x = Math.min(0, Math.max(-(mapSize - viewportSize), startContainerPos + containerDelta));
            } else {
                this.container.y = Math.min(0, Math.max(-(mapSize - viewportSize), startContainerPos + containerDelta));
            }

            // PERFORMANCE: Throttle scrollbar updates during drag
            if (!this.scrollbarUpdateScheduled) {
                this.scrollbarUpdateScheduled = true;
                requestAnimationFrame(() => {
                    this.updateScrollbars();
                    this.scrollbarUpdateScheduled = false;
                });
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    updateScrollbars() {
        if (!this.scrollbars || !this.currentMap) return;

        const container = document.getElementById('canvas-container');
        const rect = container.getBoundingClientRect();

        const scale = this.container.scale.x;
        const mapWidth = this.currentMap.width * this.TILE_WIDTH * scale;
        const mapHeight = this.currentMap.height * this.TILE_HEIGHT * scale;

        // Clamp container position to map bounds
        const minX = Math.min(0, rect.width - mapWidth);
        const minY = Math.min(0, rect.height - mapHeight);
        this.container.x = Math.max(minX, Math.min(0, this.container.x));
        this.container.y = Math.max(minY, Math.min(0, this.container.y));

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
    getVisibleTileBounds() {
        if (!this.currentMap || !this.container) {
            return null;
        }

        // Get the viewport/canvas size
        const viewportWidth = this.app.screen.width;
        const viewportHeight = this.app.screen.height;

        // Get the container's current position and scale
        const scale = this.container.scale.x; // Assuming uniform scale
        const offsetX = -this.container.x / scale;
        const offsetY = -this.container.y / scale;

        // Calculate visible tile range
        const startTileX = Math.floor(offsetX / this.TILE_WIDTH) - this.viewportMargin;
        const startTileY = Math.floor(offsetY / this.TILE_HEIGHT) - this.viewportMargin;
        const endTileX = Math.ceil((offsetX + viewportWidth / scale) / this.TILE_WIDTH) + this.viewportMargin;
        const endTileY = Math.ceil((offsetY + viewportHeight / scale) / this.TILE_HEIGHT) + this.viewportMargin;

        // Clamp to map bounds
        const { width, height } = this.currentMap;
        return {
            startX: Math.max(0, startTileX),
            startY: Math.max(0, startTileY),
            endX: Math.min(width, endTileX),
            endY: Math.min(height, endTileY)
        };
    }

    renderMap() {
        if (!this.currentMap || !this.currentTileset) return;

        const { width, height, data } = this.currentMap;

        // RPG Maker MZ has 6 data layers (z=0 through z=5)
        // Layers 0-3: Tile data (visual tiles)
        // Layer 4: Shadow bits (4-bit bitmask, NOT tile IDs)
        // Layer 5: Region/collision data (NOT rendered)
        // Formula: z * (width * height) + y * width + x

        const layerSize = width * height;

        // Clear existing sprites before rendering
        this.layers.checkerboard.removeChildren();
        this.layers.parallax.removeChildren();
        this.layers.ground.removeChildren();
        this.layers.lower1.removeChildren();
        this.layers.lower2.removeChildren();
        this.layers.lower3.removeChildren();
        this.layers.upper4.removeChildren();
        this.layers.upper5.removeChildren();
        this.layers.shadow.removeChildren();
        this.layers.layerHighlight.removeChildren();

        // PERFORMANCE: Clear sprite tracking when clearing map
        this.tileSprites = {};

        // Render checkerboard background (for transparency visualization)
        this.renderCheckerboard(width, height);

        // Render parallax background (non-blocking - loads in background while tiles render)
        this.renderParallax();

        // Render tile layers
        // Layer 0: Ground tiles
        // Layer 1: Lower tiles
        // Layer 2: Lower decoration tiles
        // Layer 3: Lower decoration tiles
        // Layer 4: Shadow bits (NOT tiles)
        // Layer 5: Region/collision data (NOT rendered)

        // NOTE: For full RPG Maker MZ compatibility, tiles from layers 0-3 should be
        // dynamically routed to upper/lower containers based on tileset.flags[tileId] & 0x10
        // (the "star" flag). Currently, we use fixed layer assignments which works for most
        // cases but may cause some tiles to render at the wrong z-order.
        // See rmmz_core.js:2465-2471 (_addSpotTile) for reference implementation.

        let tilesRendered = 0;

        // PERFORMANCE: Clear A1 tile tracking list before re-rendering
        this.a1TilePositions = [];

        // PERFORMANCE: Get visible tile bounds for viewport culling
        let startX = 0, startY = 0, endX = width, endY = height;
        if (this.useViewportCulling) {
            const bounds = this.getVisibleTileBounds();
            if (bounds) {
                startX = bounds.startX;
                startY = bounds.startY;
                endX = bounds.endX;
                endY = bounds.endY;
            }
        }

        // PERFORMANCE: Build A1 position map from FULL map (needed for A2/A3/A4 skip logic)
        // Uses numeric keys (y * width + x) instead of string concatenation for speed
        this.a1PositionMap = new Set();
        this._a1MapWidth = width; // Store for key calculation in renderTile
        for (let layerIndex = 0; layerIndex < 4; layerIndex++) {
            const layerOffset = layerIndex * layerSize;
            for (let i = 0; i < layerSize; i++) {
                const tileId = data[layerOffset + i];
                if (tileId >= 2048 && tileId < 2816) { // A1 tile
                    this.a1PositionMap.add(i); // i = y * width + x
                }
            }
        }

        // PERFORMANCE: Single pass over visible tiles for all 5 layers (0-4)
        // instead of 5 separate loops. This cuts iteration overhead by ~5x.
        const pixiLayers = [this.layers.ground, this.layers.lower1, this.layers.lower2, this.layers.lower3];

        for (let y = startY; y < endY; y++) {
            for (let x = startX; x < endX; x++) {
                // Layers 0-3: Tile data
                for (let layerIdx = 0; layerIdx < 4; layerIdx++) {
                    const index = layerIdx * layerSize + y * width + x;
                    const tileId = data[index];
                    if (tileId > 0) {
                        this.renderTile(tileId, x, y, pixiLayers[layerIdx]);
                        tilesRendered++;
                        // Track A1 tiles for animation
                        if (tileId >= 2048 && tileId < 2816) {
                            this.a1TilePositions.push({x, y, layerIndex: layerIdx, tileId, pixiLayer: pixiLayers[layerIdx]});
                        }
                    }
                }

                // Layer 4: Shadow bits
                const shadowIndex = 4 * layerSize + y * width + x;
                const shadowBits = data[shadowIndex];
                if (shadowBits > 0) {
                    this.renderShadowTile(shadowBits, x, y);
                    tilesRendered++;
                }
            }
        }

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
        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer && this.canvasPadding) {
            canvasContainer.scrollLeft = this.canvasPadding.x;
            canvasContainer.scrollTop = this.canvasPadding.y;
        }

        // PERFORMANCE: If viewport culling was used, lazy-load the rest of the map
        if (this.useViewportCulling && (startX > 0 || startY > 0 || endX < width || endY < height)) {
            this.lazyLoadRemainingTiles(width, height, startX, startY, endX, endY, data, layerSize);
        }
    }

    // PERFORMANCE: Update only specific tiles without re-rendering entire map
    // This is 1000x faster than renderMap() when only a few tiles changed
    // positions: Array of {x, y, layer} objects, where layer is 0-4 (0=ground, 1=lower1, 2=lower2, 3=lower3, 4=shadow)
    updateTiles(positions) {
        if (!this.currentMap || !this.currentTileset) return;

        const { width, height, data } = this.currentMap;
        const layerSize = width * height;
        const affectedLayers = new Set();

        // PRE-PASS: Update a1PositionMap for all affected positions BEFORE rendering
        // This ensures the map is accurate when renderTile() checks it
        if (this.a1PositionMap) {
            const updatedPositions = new Set();
            for (const pos of positions) {
                const numKey = pos.y * width + pos.x;
                if (!updatedPositions.has(numKey)) {
                    updatedPositions.add(numKey);
                    // Check all 4 layers at this position for A1 tiles
                    let hasA1 = false;
                    for (let layer = 0; layer <= 3; layer++) {
                        const index = layer * layerSize + pos.y * width + pos.x;
                        const tileId = data[index];
                        if (tileId >= 2048 && tileId < 2816) { // A1 tile
                            hasA1 = true;
                            break;
                        }
                    }
                    // Update map
                    if (hasA1) {
                        this.a1PositionMap.add(numKey);
                    } else {
                        this.a1PositionMap.delete(numKey);
                    }
                }
            }
        }

        for (const pos of positions) {
            const { x, y, layer: layerIdx } = pos;

            // Validate bounds
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (layerIdx < 0 || layerIdx > 4) continue;

            // Get the layer container
            let pixiLayer;
            switch (layerIdx) {
                case 0: pixiLayer = this.layers.ground; break;
                case 1: pixiLayer = this.layers.lower1; break;
                case 2: pixiLayer = this.layers.lower2; break;
                case 3: pixiLayer = this.layers.lower3; break;
                case 4: pixiLayer = this.layers.shadow; break;
            }

            // PERFORMANCE: Invalidate bitmap cache when painting tiles
            if (pixiLayer && pixiLayer.cacheAsBitmap) {
                pixiLayer.cacheAsBitmap = false;
                affectedLayers.add(pixiLayer);
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
                    this.renderTile(tileValue, x, y, pixiLayer);

                    // Track A1 tiles for animation
                    if (this.isTileA1(tileValue)) {
                        // Remove any existing tracking for this position
                        this.a1TilePositions = this.a1TilePositions.filter(
                            t => !(t.x === x && t.y === y && t.layerIndex === layerIdx)
                        );
                        // Add new tracking
                        this.a1TilePositions.push({
                            x, y,
                            layerIndex: layerIdx,
                            tileId: tileValue,
                            pixiLayer: pixiLayer
                        });
                    } else {
                        // Remove A1 tracking if tile is no longer A1
                        this.a1TilePositions = this.a1TilePositions.filter(
                            t => !(t.x === x && t.y === y && t.layerIndex === layerIdx)
                        );
                    }
                } else {
                    // Tile is empty (0) - ensure it's removed from A1 animation tracking
                    this.a1TilePositions = this.a1TilePositions.filter(
                        t => !(t.x === x && t.y === y && t.layerIndex === layerIdx)
                    );
                }
            }
        }

        // PERFORMANCE: Re-cache affected layers after a delay (debounced)
        if (affectedLayers.size > 0) {
            clearTimeout(this.recacheLayersTimer);
            this.recacheLayersTimer = setTimeout(() => {
                for (const layer of affectedLayers) {
                    if (layer && !layer.cacheAsBitmap) {
                        layer.cacheAsBitmap = true;
                    }
                }
            }, 500); // Wait 500ms after last paint before re-caching
        }
    }

    // PERFORMANCE: Lazily load tiles outside the initial viewport in batches
    lazyLoadRemainingTiles(width, height, viewportStartX, viewportStartY, viewportEndX, viewportEndY, data, layerSize) {
        // Build list of all tile positions outside viewport that need rendering
        const tilesToLoad = [];

        for (let layerIdx = 0; layerIdx < 5; layerIdx++) { // Layers 0-4 (layer 5 is regions, not rendered)
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    // Skip tiles that were already rendered in viewport
                    if (x >= viewportStartX && x < viewportEndX && y >= viewportStartY && y < viewportEndY) {
                        continue;
                    }

                    const index = layerIdx * layerSize + y * width + x;
                    const tileValue = data[index];

                    if (layerIdx === 4) {
                        // Shadow layer
                        if (tileValue > 0) {
                            tilesToLoad.push({ x, y, layerIdx, tileValue, isShadow: true });
                        }
                    } else {
                        // Tile layers 0-3
                        if (tileValue > 0) {
                            tilesToLoad.push({ x, y, layerIdx, tileValue, isShadow: false });
                        }
                    }
                }
            }
        }

        // Load tiles in batches using time budget instead of fixed count for smoother performance
        let currentIndex = 0;
        const loadNextBatch = () => {
            // Abort if this TilemapManager has been destroyed (e.g., project switch)
            if (this.destroyed) return;

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
            let tilesRendered = 0;

            // Render tiles until we hit the time budget or run out of tiles
            while (currentIndex < tilesToLoad.length) {
                const tile = tilesToLoad[currentIndex];
                if (tile.isShadow) {
                    this.renderShadowTile(tile.tileValue, tile.x, tile.y);
                } else {
                    const layer = [this.layers.ground, this.layers.lower1, this.layers.lower2, this.layers.lower3][tile.layerIdx];
                    this.renderTile(tile.tileValue, tile.x, tile.y, layer);

                    // Track A1 tiles for animation
                    if (this.isTileA1(tile.tileValue)) {
                        this.a1TilePositions.push({
                            x: tile.x,
                            y: tile.y,
                            layerIndex: tile.layerIdx,
                            tileId: tile.tileValue,
                            pixiLayer: layer
                        });
                    }
                }

                currentIndex++;
                tilesRendered++;

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
                // PERFORMANCE: Cache static layers as bitmaps after all tiles loaded
                this.cacheStaticLayers();
            }
        };

        // Start lazy loading with a delay to let initial render settle
        if (window.requestIdleCallback) {
            requestIdleCallback(loadNextBatch, { timeout: 100 });
        } else {
            setTimeout(loadNextBatch, 200); // Delay before starting
        }
    }

    // PERFORMANCE: Cache static layers as bitmaps for faster rendering
    cacheStaticLayers() {
        // Cache non-animated layers as bitmaps
        // This converts all sprites in a layer into a single texture, much faster to render
        // Don't cache ground layer if it has A1 animations
        if (this.a1TilePositions && this.a1TilePositions.length === 0) {
            // No A1 tiles, safe to cache all layers
            if (this.layers.ground) this.layers.ground.cacheAsBitmap = true;
        }

        // Always cache these layers (no animations)
        if (this.layers.lower1) this.layers.lower1.cacheAsBitmap = true;
        if (this.layers.lower2) this.layers.lower2.cacheAsBitmap = true;
        if (this.layers.lower3) this.layers.lower3.cacheAsBitmap = true;
        if (this.layers.upper4) this.layers.upper4.cacheAsBitmap = true;
        if (this.layers.upper5) this.layers.upper5.cacheAsBitmap = true;
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
        const tileSize = 48;

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

    // PERFORMANCE OPTIMIZED: Update only A1 autotiles for animation by updating textures, not recreating sprites
    updateA1Tiles() {
        if (!this.currentMap || !this.currentTileset) return;

        // Only iterate through known A1 tile positions instead of entire map
        for (const tileInfo of this.a1TilePositions) {
            const {x, y, tileId, pixiLayer} = tileInfo;

            // CRITICAL PERFORMANCE FIX: Update texture regions instead of destroying/recreating sprites
            this.updateA1TileTextures(tileId, x, y, pixiLayer);
        }
    }

    // PERFORMANCE: Update A1 tile textures without recreating sprites
    updateA1TileTextures(tileId, x, y, layer) {
        // Get the sprites for this tile
        let layerName = 'unknown';
        if (layer === this.layers.ground) layerName = 'ground';
        else if (layer === this.layers.lower1) layerName = 'lower1';
        else if (layer === this.layers.lower2) layerName = 'lower2';
        else if (layer === this.layers.lower3) layerName = 'lower3';

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
            // Apply 0.5px UV inset to prevent texture bleeding (same as RMMZ corescript _updateVertexBuffer)
            const inset = 0.5;
            const animCacheKey = `a1_${kind}_${shape}_${i}_${bx}_${by}`;
            let animTexture = this.a1AnimationCache[animCacheKey];
            if (!animTexture) {
                animTexture = new PIXI.Texture({
                    source: texture.source,
                    frame: new PIXI.Rectangle(sx + inset, sy + inset, w1 - inset * 2, h1 - inset * 2)
                });
                this.a1AnimationCache[animCacheKey] = animTexture;
            }

            sprite.texture = animTexture;
            // Scale sprite to fill the full tile size (compensate for UV inset)
            sprite.width = w1;
            sprite.height = h1;
        }
    }

    // PERFORMANCE OPTIMIZED: Clear sprites at a specific tile position using sprite tracking
    clearTileSpritesAt(x, y, layer) {
        if (!layer) return;

        // Determine layer name for sprite tracking key
        let layerName = 'unknown';
        if (layer === this.layers.ground) layerName = 'ground';
        else if (layer === this.layers.lower1) layerName = 'lower1';
        else if (layer === this.layers.lower2) layerName = 'lower2';
        else if (layer === this.layers.lower3) layerName = 'lower3';

        const key = `${layerName}_${x}_${y}`;
        const sprites = this.tileSprites[key];

        if (sprites && sprites.length > 0) {
            // Remove all tracked sprites for this tile
            for (const sprite of sprites) {
                if (sprite.parent) {
                    sprite.parent.removeChild(sprite);
                }
                sprite.destroy();
            }
            // Clear the tracking array
            delete this.tileSprites[key];
        }
    }

    // Render checkerboard background for transparency visualization
    renderCheckerboard(mapWidth, mapHeight) {
        const tileSize = 48; // Size of each checkerboard square
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

        // Render the small pattern to a texture, then tile it
        const renderTexture = PIXI.RenderTexture.create({ width: patternSize, height: patternSize });
        this.app.renderer.render({ container: pattern, target: renderTexture });
        pattern.destroy();

        const checkerboard = new PIXI.TilingSprite({
            texture: renderTexture,
            width: pixelWidth,
            height: pixelHeight
        });

        this.layers.checkerboard.addChild(checkerboard);
    }

    // Render parallax background
    async renderParallax() {
        if (!this.currentMap) return;

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

        if (!this.fs.existsSync(parallaxPath)) {
            if (this.layers.parallax) {
                this.layers.parallax.visible = false;
            }
            return;
        }

        // Convert to file:// URL for Pixi.js
        const fileUrl = 'file://' + parallaxPath.replace(/\\/g, '/');

        // Check if parallax is "locked" (filename starts with !)
        // Locked parallaxes move with the map, unlocked ones scroll independently
        const isLocked = parallaxName.startsWith('!');

        try {
            // Load texture using PIXI.Assets.load() to ensure it's loaded before rendering
            const texture = await PIXI.Assets.load(fileUrl);

            // Set texture wrap mode based on looping settings
            if (parallaxLoopX || parallaxLoopY) {
                texture.source.style.addressMode = 'repeat';
            } else {
                texture.source.style.addressMode = 'clamp-to-edge';
            }

            // If looping, use TilingSprite for seamless tiling
            if (parallaxLoopX || parallaxLoopY) {
                const mapPixelWidth = this.currentMap.width * this.TILE_WIDTH;
                const mapPixelHeight = this.currentMap.height * this.TILE_HEIGHT;

                this.parallaxSprite = new PIXI.TilingSprite({
                    texture: texture,
                    width: mapPixelWidth * 2,
                    height: mapPixelHeight * 2
                });

                // Center the tiling sprite
                this.parallaxSprite.x = -mapPixelWidth / 2;
                this.parallaxSprite.y = -mapPixelHeight / 2;

                // Initialize tilePosition for scrolling
                this.parallaxSprite.tilePosition = { x: 0, y: 0 };

            } else {
                // Use regular sprite if not looping
                this.parallaxSprite = new PIXI.Sprite(texture);
                this.parallaxSprite.x = 0;
                this.parallaxSprite.y = 0;
            }

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

    renderTile(tileId, x, y, layer) {
        if (tileId <= 0) return;

        // PERFORMANCE: A2/A3/A4 tiles should not render if there's ANY A1 at this position
        // Use pre-built position map instead of checking all layers
        const isA2orHigher = tileId >= 2816 && tileId < 8192;
        if (isA2orHigher && this.a1PositionMap && this.a1PositionMap.has(y * (this._a1MapWidth || 0) + x)) {
            return; // A1 tile exists at this position, skip A2/A3/A4
        }

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
            // Tiles above 1023 might be region/collision markers, ignore them
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
        // Apply 0.5px UV inset to prevent texture bleeding (same as RMMZ corescript _updateVertexBuffer)
        const inset = 0.5;
        const cacheKey = `${setNumber}_${sx}_${sy}`;
        let tileTexture = this.textureCache[cacheKey];
        if (!tileTexture) {
            tileTexture = new PIXI.Texture({
                source: texture.source,
                frame: new PIXI.Rectangle(sx + inset, sy + inset, w - inset * 2, h - inset * 2)
            });
            this.textureCache[cacheKey] = tileTexture;
        }

        const sprite = new PIXI.Sprite(tileTexture);
        sprite.x = x * this.TILE_WIDTH;
        sprite.y = y * this.TILE_HEIGHT;
        // Scale sprite to fill the full tile size (compensate for UV inset)
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
            // Apply 0.5px UV inset to prevent texture bleeding (same as RMMZ corescript _updateVertexBuffer)
            const inset = 0.5;
            const cacheKey = `auto_${setNumber}_${sx1}_${sy1}`;
            let tileTexture = this.textureCache[cacheKey];
            if (!tileTexture) {
                tileTexture = new PIXI.Texture({
                    source: texture.source,
                    frame: new PIXI.Rectangle(sx1 + inset, sy1 + inset, w1 - inset * 2, h1 - inset * 2)
                });
                this.textureCache[cacheKey] = tileTexture;
            }

            const sprite = new PIXI.Sprite(tileTexture);
            sprite.x = dx1;
            sprite.y = dy1;
            // Scale sprite to fill the full tile size (compensate for UV inset)
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

    renderShadowTile(shadowBits, x, y) {
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

            this.layers.shadow.addChild(container);
        }
    }

    // PERFORMANCE: Update only a single shadow tile without re-rendering entire map
    updateShadowTile(x, y, shadowBits) {
        if (!this.layers || !this.layers.shadow) return;

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

        // Re-render the affected tile
        this.clearTileAt(x, y, layerIndex);

        if (tileId > 0) {
            const layer = [this.layers.ground, this.layers.lower, this.layers.upper][layerIndex];
            if (layer) {
                this.renderTile(tileId, x, y, layer);
            }
        }
    }

    clearTileAt(x, y, layerIndex = 0) {
        const layer = [this.layers.ground, this.layers.lower, this.layers.upper][layerIndex];
        if (!layer) return;

        // Remove existing sprite at this position
        for (let i = layer.children.length - 1; i >= 0; i--) {
            const child = layer.children[i];
            if (child.x === x * this.TILE_WIDTH && child.y === y * this.TILE_HEIGHT) {
                layer.removeChild(child);
                child.destroy();
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

            // Create a copy of the map data to save (excluding the id field which isn't stored in the file)
            const mapDataToSave = { ...this.currentMap };
            delete mapDataToSave.id;

            // Write map data to file with formatting
            this.fs.writeFileSync(mapPath, JSON.stringify(mapDataToSave, null, 2), 'utf8');

            return true;
        } catch (error) {
            return false;
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
            const tileSize = 48;
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
            const a1Positions = new Set();
            for (let layerIndex = 0; layerIndex < 4; layerIndex++) {
                const layerOffset = layerIndex * layerSize;
                for (let i = 0; i < layerSize; i++) {
                    const tileId = data[layerOffset + i];
                    if (tileId >= 2048 && tileId < 2816) {
                        a1Positions.add(i);
                    }
                }
            }

            const drawTileLayer = (layerIndex) => {
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const index = layerIndex * layerSize + y * width + x;
                        const tileId = data[index];

                        if (tileId > 0) {
                            if (tileId >= 2816 && tileId < 8192 && a1Positions.has(y * width + x)) {
                                continue;
                            }
                            this.drawTileToCanvas(ctx, tileId, x, y, tilesetImages, tileSize);
                        }
                    }
                }
            };

            drawTileLayer(0);

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
                drawTileLayer(layerIndex);
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
            img.src = 'file://' + filePath.replace(/\\/g, '/');
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

        if (!this.fs.existsSync(parallaxPath)) {
            return; // Skip if image doesn't exist
        }

        // Load parallax image
        const img = new Image();
        img.src = 'file://' + parallaxPath.replace(/\\/g, '/');

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvasWidth = mapWidth * tileSize;
        const canvasHeight = mapHeight * tileSize;

        // Check if parallax is "locked" (filename starts with !)
        const isLocked = parallaxName.startsWith('!');

        if (isLocked) {
            // Locked parallax - draw once centered/positioned
            const x = (canvasWidth - img.width) / 2;
            const y = (canvasHeight - img.height) / 2;
            ctx.drawImage(img, x, y);
        } else if (parallaxLoopX || parallaxLoopY) {
            // Tiling parallax - tile it across the canvas
            const pattern = ctx.createPattern(img,
                parallaxLoopX && parallaxLoopY ? 'repeat' :
                parallaxLoopX ? 'repeat-x' : 'repeat-y');

            if (pattern) {
                ctx.fillStyle = pattern;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
            }
        } else {
            // Non-looping, non-locked - draw at top-left
            ctx.drawImage(img, 0, 0);
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
                    // Only E-type waterfalls (tx=4-7) use waterfall table
                    if (Math.floor(tx / 4) === 1) {
                        autotileTable = this.WATERFALL_AUTOTILE_TABLE;
                    }
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

    /**
     * OLD BROKEN METHOD - keeping as backup but not used
     */
    async generateMapThumbnail_OLD(mapId, maxWidth = 400, maxHeight = 300) {
        if (!this.fs || !this.path) {
            throw new Error('File system not available');
        }

        // Load map data
        const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
        const mapPath = this.path.join(this.projectPath, 'data', mapFile);

        let mapData;
        try {
            const mapJson = this.fs.readFileSync(mapPath, 'utf8');
            mapData = JSON.parse(mapJson);
            mapData.id = mapId;
        } catch (error) {
            throw new Error(`Failed to load map ${mapId}: ${error.message}`);
        }

        // Load tileset data
        const tilesetId = mapData.tilesetId;
        const tilesets = this.databaseManager.getTilesets();
        const tileset = tilesets[tilesetId];

        if (!tileset) {
            throw new Error(`Tileset ${tilesetId} not found`);
        }

        // Load tileset images
        const tilesetImages = {};
        const tilesetNames = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];

        for (const name of tilesetNames) {
            const imageName = tileset[`tileset${name}Name`];
            if (imageName && imageName.trim() !== '') {
                const imagePath = this.path.join(this.projectPath, 'img', 'tilesets', imageName + '.png');
                if (this.fs.existsSync(imagePath)) {
                    const img = new Image();
                    img.src = 'file://' + imagePath.replace(/\\/g, '/');
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                    tilesetImages[name] = img;
                }
            }
        }

        // Calculate thumbnail size maintaining aspect ratio
        const mapPixelWidth = mapData.width * this.TILE_SIZE;
        const mapPixelHeight = mapData.height * this.TILE_SIZE;

        const scale = Math.min(maxWidth / mapPixelWidth, maxHeight / mapPixelHeight, 1);
        const thumbWidth = Math.floor(mapPixelWidth * scale);
        const thumbHeight = Math.floor(mapPixelHeight * scale);

        // Create thumbnail canvas
        const canvas = document.createElement('canvas');
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;
        const ctx = canvas.getContext('2d');

        // Scale context for rendering
        ctx.scale(scale, scale);

        // Render map layers
        const data = mapData.data;
        const width = mapData.width;
        const height = mapData.height;

        for (let layerIndex = 0; layerIndex < 4; layerIndex++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index = (layerIndex * height * width) + (y * width) + x;
                    const tileId = data[index];

                    if (tileId > 0) {
                        this.drawTileToCanvas(ctx, tileId, x * this.TILE_SIZE, y * this.TILE_SIZE, this.TILE_SIZE, tilesetImages);
                    }
                }
            }
        }

        return canvas;
    }
}
