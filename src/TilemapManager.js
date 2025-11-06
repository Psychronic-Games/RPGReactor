// RPG Reactor - Tilemap Manager
// Handles tilemap rendering using Pixi.js, compatible with RPG Maker MZ format

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
        this.TILE_ID_MAX = 8192; // Maximum tile ID (changed from 1536)

        // Current state
        this.currentMap = null;
        this.currentTileset = null;
        this.tilesetTextures = {};
        this.container = null;
        this.parallaxSprite = null;
        this.layers = {
            parallax: null,
            ground: null,
            lower: null,
            upper: null,
            shadow: null
        };

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
            console.error('File system not available');
            return false;
        }

        try {
            // Load map data
            const mapFile = `Map${String(mapId).padStart(3, '0')}.json`;
            const mapPath = this.path.join(this.projectPath, 'data', mapFile);

            if (!this.fs.existsSync(mapPath)) {
                console.error(`Map file not found: ${mapFile}`);
                return false;
            }

            const mapData = JSON.parse(this.fs.readFileSync(mapPath, 'utf8'));
            this.currentMap = mapData;

            // Load tileset for this map
            const tileset = this.databaseManager.getTileset(mapData.tilesetId);
            if (!tileset) {
                console.error(`Tileset ${mapData.tilesetId} not found`);
                return false;
            }
            this.currentTileset = tileset;

            // Load tileset images
            await this.loadTilesetImages(tileset);

            // Create tilemap container
            this.createTilemapContainer();

            // Render the map
            this.renderMap();

            console.log(`Map ${mapId} loaded successfully`);
            console.log(`Size: ${mapData.width}x${mapData.height}`);
            console.log(`Tileset: ${tileset.name}`);

            return true;
        } catch (error) {
            console.error('Error loading map:', error);
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
            if (!this.fs.existsSync(filePath)) {
                console.warn(`Tileset image not found: ${name}.png`);
                continue;
            }

            // Convert to file:// URL for Pixi.js
            const fileUrl = 'file://' + filePath.replace(/\\/g, '/');

            promises.push(
                PIXI.Assets.load(fileUrl).then(texture => {
                    // Set texture wrap mode to CLAMP to prevent tiling/repeating (PIXI v8 API)
                    texture.source.style.wrapMode = 'clamp-to-edge';
                    this.tilesetTextures[i] = texture;
                    console.log(`Loaded tileset image [${i}]: ${name} (${texture.width}x${texture.height})`);
                }).catch(err => {
                    console.error(`Failed to load ${name}:`, err);
                })
            );
        }

        await Promise.all(promises);

        // Debug: show which textures are loaded
        console.log('Loaded textures:', Object.keys(this.tilesetTextures).map(k => `${k}=${this.tilesetTextures[k] ? 'yes' : 'no'}`).join(', '));
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

        // Enable interactive for dragging
        this.container.interactive = true;
        this.container.buttonMode = true;

        // Create layers
        this.layers.parallax = new PIXI.Container();
        this.layers.ground = new PIXI.Container();
        this.layers.lower1 = new PIXI.Container();
        this.layers.lower2 = new PIXI.Container();
        this.layers.lower3 = new PIXI.Container();
        this.layers.upper4 = new PIXI.Container();
        this.layers.upper5 = new PIXI.Container();
        this.layers.shadow = new PIXI.Container();

        // Add layers in correct rendering order (bottom to top)
        this.container.addChild(this.layers.parallax);
        this.container.addChild(this.layers.ground);
        this.container.addChild(this.layers.shadow);
        this.container.addChild(this.layers.lower1);
        this.container.addChild(this.layers.lower2);
        this.container.addChild(this.layers.lower3);
        this.container.addChild(this.layers.upper4);
        this.container.addChild(this.layers.upper5);

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
                    x: event.data.global.x - this.container.x,
                    y: event.data.global.y - this.container.y
                };
                event.stopPropagation(); // Prevent tile painting while panning
            }
        });

        this.container.on('pointermove', (event) => {
            if (isDragging) {
                this.container.x = event.data.global.x - dragStart.x;
                this.container.y = event.data.global.y - dragStart.y;
            }
        });

        this.container.on('pointerup', () => {
            isDragging = false;
        });

        this.container.on('pointerupoutside', () => {
            isDragging = false;
        });

        // Mouse wheel zoom
        if (canvasContainer) {
            canvasContainer.addEventListener('wheel', (event) => {
                event.preventDefault();
                const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
                const newScale = this.container.scale.x * scaleFactor;

                // Limit zoom range
                if (newScale >= 0.1 && newScale <= 5) {
                    // Get mouse position relative to container before zoom
                    const rect = canvasContainer.getBoundingClientRect();
                    const mouseX = event.clientX - rect.left;
                    const mouseY = event.clientY - rect.top;

                    // Calculate the point in world coordinates
                    const worldX = (mouseX - this.container.x) / this.container.scale.x;
                    const worldY = (mouseY - this.container.y) / this.container.scale.y;

                    // Apply zoom
                    this.container.scale.x = newScale;
                    this.container.scale.y = newScale;

                    // Adjust position to keep the mouse point in the same place
                    this.container.x = mouseX - worldX * newScale;
                    this.container.y = mouseY - worldY * newScale;

                    // Update canvas size to enable scrollbars
                    this.updateCanvasSize();
                }
            }, { passive: false });
        }
    }

    updateCanvasSize() {
        if (!this.currentMap || !this.app) return;

        const { width, height } = this.currentMap;
        const scale = this.container.scale.x;

        // Calculate the actual size of the map in pixels when scaled
        const mapWidth = width * this.TILE_WIDTH * scale;
        const mapHeight = height * this.TILE_HEIGHT * scale;

        // Get the container dimensions
        const canvasContainer = document.getElementById('canvas-container');
        if (!canvasContainer) return;

        const containerWidth = canvasContainer.clientWidth;
        const containerHeight = canvasContainer.clientHeight;

        // Set canvas size to be at least as large as the scaled map or container
        const newWidth = Math.max(mapWidth, containerWidth);
        const newHeight = Math.max(mapHeight, containerHeight);

        // Resize the Pixi application
        this.app.renderer.resize(newWidth, newHeight);
    }

    async renderMap() {
        if (!this.currentMap || !this.currentTileset) return;

        const { width, height, data } = this.currentMap;

        // RPG Maker MZ has 6 data layers (z=0 through z=5)
        // Layers 0-3: Tile data (visual tiles)
        // Layer 4: Shadow bits (4-bit bitmask, NOT tile IDs)
        // Layer 5: Region/collision data (NOT rendered)
        // Formula: z * (width * height) + y * width + x

        const layerSize = width * height;

        // Clear existing sprites before rendering
        console.log("CLEARING LAYERS before render. Ground children count:", this.layers.ground.children.length);
        this.layers.parallax.removeChildren();
        this.layers.ground.removeChildren();
        this.layers.lower1.removeChildren();
        this.layers.lower2.removeChildren();
        this.layers.lower3.removeChildren();
        this.layers.upper4.removeChildren();
        this.layers.upper5.removeChildren();
        this.layers.shadow.removeChildren();

        // Render parallax background first (async - waits for image to load)
        await this.renderParallax();

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

        // Layer 0 - Ground
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 0 * layerSize + y * width + x;
                const tileId = data[index];
                if (tileId > 0) {
                    this.renderTile(tileId, x, y, this.layers.ground);
                    tilesRendered++;
                }
            }
        }

        // Layer 1 - Lower
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 1 * layerSize + y * width + x;
                const tileId = data[index];
                if (tileId > 0) {
                    this.renderTile(tileId, x, y, this.layers.lower1);
                    tilesRendered++;
                }
            }
        }

        // Layer 2 - Lower decoration (below characters but above layer 1)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 2 * layerSize + y * width + x;
                const tileId = data[index];
                if (tileId > 0) {
                    this.renderTile(tileId, x, y, this.layers.lower2);
                    tilesRendered++;
                }
            }
        }

        // Layer 3 - Lower decoration (below characters)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 3 * layerSize + y * width + x;
                const tileId = data[index];
                if (tileId > 0) {
                    this.renderTile(tileId, x, y, this.layers.lower3);
                    tilesRendered++;
                }
            }
        }

        // Layer 4 - SHADOW BITS ONLY (NOT tile IDs)
        // In RPG Maker MZ, layer 4 contains shadow bitmasks (0-15), not tile IDs
        // Each value is a 4-bit mask indicating which quadrants have shadows
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 4 * layerSize + y * width + x;
                const shadowBits = data[index];
                if (shadowBits > 0) {
                    // Render shadow using the bitmask value
                    this.renderShadowTile(shadowBits, x, y);
                    tilesRendered++;
                }
            }
        }

        // Layer 5 - NOT RENDERED
        // In RPG Maker MZ, layer 5 contains region/collision metadata, NOT visual tiles
        // This layer should NEVER be rendered. Rendering it causes region IDs to appear as tiles.

        console.log(`Rendered ${tilesRendered} tiles across all layers on a ${width}x${height} map`);
        console.log("Ground layer:", this.layers.ground.children.length, "tiles");
        console.log("Lower1 layer:", this.layers.lower1.children.length, "tiles");
        console.log("Lower2 layer:", this.layers.lower2.children.length, "tiles");
        console.log("Lower3 layer:", this.layers.lower3.children.length, "tiles");
        console.log("Shadow layer:", this.layers.shadow.children.length, "tiles");
        console.log("Upper4 layer:", this.layers.upper4.children.length, "tiles");
        console.log("Upper5 layer:", this.layers.upper5.children.length, "tiles");

        // Update canvas size to match map dimensions
        this.updateCanvasSize();
    }

    // Render parallax background
    async renderParallax() {
        if (!this.currentMap) return;

        const { parallaxName, parallaxShow } = this.currentMap;

        // Check if parallax should be shown
        if (!parallaxShow || !parallaxName || parallaxName === '') {
            return;
        }

        // Load parallax image
        const parallaxPath = this.path.join(this.projectPath, 'img', 'parallaxes', parallaxName + '.png');

        if (!this.fs.existsSync(parallaxPath)) {
            console.warn(`Parallax image not found: ${parallaxPath}`);
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

            // Set texture wrap mode to CLAMP to prevent tiling/repeating (PIXI v8 API)
            texture.source.style.wrapMode = 'clamp-to-edge';

            // Create sprite with loaded texture
            this.parallaxSprite = new PIXI.Sprite(texture);

            // Position the sprite
            this.parallaxSprite.x = 0;
            this.parallaxSprite.y = 0;

            // Add to parallax layer
            this.layers.parallax.addChild(this.parallaxSprite);

            console.log(`Rendered parallax: ${parallaxName} (locked: ${isLocked})`);
            console.log(`Parallax sprite dimensions: ${this.parallaxSprite.width}x${this.parallaxSprite.height}`);
            console.log(`Parallax layer children count: ${this.layers.parallax.children.length}`);
        } catch (error) {
            console.error(`Failed to load parallax ${parallaxName}:`, error);
        }
    }

    // RPG Maker MZ tile checking functions
    isAutotile(tileId) {
        return tileId >= this.TILE_ID_A1;
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
        return Math.floor((tileId - this.TILE_ID_A1) / 48);
    }

    getAutotileShape(tileId) {
        return (tileId - this.TILE_ID_A1) % 48;
    }

    renderTile(tileId, x, y, layer) {
        if (tileId <= 0) return;

        // Debug first tile only
        if (x === 0 && y === 0) {
            console.log(`Rendering tile at (0,0): tileId=${tileId}, isAutotile=${this.isAutotile(tileId)}`);
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

        // Log first few tiles to diagnose the issue
        if (x < 5 && y < 5) {
            console.log(`Rendering tile at (${x},${y}) layer ${layer}: tileId=${tileId}`);
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
            console.warn(`Normal tile: No texture for setNumber ${setNumber}, tileId ${tileId}`);
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

        // Enhanced debug logging for first 5 tiles or E-tiles
        if ((x < 3 && y < 3) || (tileId >= 768 && tileId < 1024)) {
            const half = Math.floor(localTileId / 128) % 2;
            const col = localTileId % 8;
            const row = Math.floor((localTileId % 256) / 8) % 16;
            console.log(`[v3-CLONE] Tile[${x},${y}]: tileId=${tileId}, localId=${localTileId}, setNum=${setNumber}, half=${half}, col=${col}, row=${row}, sx=${sx}, sy=${sy}, tex=${texture.width}x${texture.height}`);
        }

        // Create a texture from a specific rectangle of the tileset
        // PIXI v8 API - use {source, frame} constructor
        const tileTexture = new PIXI.Texture({
            source: texture.source,
            frame: new PIXI.Rectangle(sx, sy, w, h)
        });

        const sprite = new PIXI.Sprite(tileTexture);
        sprite.x = x * this.TILE_WIDTH;
        sprite.y = y * this.TILE_HEIGHT;

        layer.addChild(sprite);
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
            // For now, simplified - no animation
            if (kind === 0) {
                bx = 0;
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
                    bx += 0; // Waterfall - simplified
                } else {
                    bx += 6;
                    autotileTable = this.WATERFALL_AUTOTILE_TABLE;
                }
            }
        } else if (this.isTileA2(tileId)) {
            setNumber = 1; // A2
            bx = tx * 2;
            by = (ty - 2) * 3;
        } else if (this.isTileA3(tileId)) {
            setNumber = 2; // A3
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = this.WALL_AUTOTILE_TABLE;
        } else if (this.isTileA4(tileId)) {
            setNumber = 3; // A4
            bx = tx * 2;
            by = Math.floor((ty - 10) * 2.5 + (ty % 2 === 1 ? 0.5 : 0));
            if (ty % 2 === 1) {
                autotileTable = this.WALL_AUTOTILE_TABLE;
            }
        }

        const texture = this.tilesetTextures[setNumber];
        if (!texture) {
            console.warn(`No texture for setNumber ${setNumber}`);
            return;
        }

        // Get the autotile pattern from the table
        const table = autotileTable[shape];
        const w1 = this.TILE_WIDTH / 2;
        const h1 = this.TILE_HEIGHT / 2;

        // Render all 4 sub-tiles (24x24 each)
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1;
            const dx1 = x * this.TILE_WIDTH + (i % 2) * w1;
            const dy1 = y * this.TILE_HEIGHT + Math.floor(i / 2) * h1;

            // PIXI v8 API - use {source, frame} constructor
            const tileTexture = new PIXI.Texture({
                source: texture.source,
                frame: new PIXI.Rectangle(sx1, sy1, w1, h1)
            });

            const sprite = new PIXI.Sprite(tileTexture);
            sprite.x = dx1;
            sprite.y = dy1;

            layer.addChild(sprite);
        }
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

            // Iterate through the 4 quadrants
            for (let i = 0; i < 4; i++) {
                if (shadowBits & (1 << i)) {
                    // Calculate position for this quadrant
                    // i % 2 gives column (0 or 1), Math.floor(i / 2) gives row (0 or 1)
                    const dx1 = x * this.TILE_WIDTH + (i % 2) * w1;
                    const dy1 = y * this.TILE_HEIGHT + Math.floor(i / 2) * h1;

                    // Create a semi-transparent black rectangle for the shadow
                    const shadow = new PIXI.Graphics();
                    shadow.rect(dx1, dy1, w1, h1);
                    shadow.fill({ color: 0x000000, alpha: 0.48 });

                    this.layers.shadow.addChild(shadow);
                }
            }
        }
    }

    clearMap() {
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
}
