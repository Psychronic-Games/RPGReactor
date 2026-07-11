// RPG Reactor - Tileset Palette Viewer
// Displays tileset layers as tabs with tile graphics for map editing

class TilesetPaletteViewer {
    constructor(app, projectPath) {
        this.app = app;
        this.projectPath = projectPath;
        this.fs = null;
        this.path = null;
        this.currentTileset = null;
        this.currentLayer = 'A'; // Default to A (merged A1-A5)
        this.tilesetTextures = {}; // Cache for loaded tileset textures
        this.selectedTiles = []; // Currently selected tiles for painting
        this.mapEditor = null; // Reference to MapEditor for auto-toggling erase mode
        this.cachedLayerCanvas = null; // OPTIMIZATION: Cache rendered layer to avoid re-rendering on selection change
        this.enabled = true; // Whether the palette is enabled for interaction

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
    }

    // Set reference to MapEditor
    setMapEditor(mapEditor) {
        this.mapEditor = mapEditor;
    }

    // Enable or disable palette interaction
    setEnabled(enabled) {
        this.enabled = enabled;
        const paletteContainer = document.getElementById('tileset-palette-content');
        if (paletteContainer) {
            if (enabled) {
                paletteContainer.style.opacity = '1';
                paletteContainer.style.pointerEvents = 'auto';
            } else {
                paletteContainer.style.opacity = '0.5';
                paletteContainer.style.pointerEvents = 'none';
            }
        }
    }

    // Update project path when switching projects
    setProjectPath(newProjectPath) {
        this.projectPath = newProjectPath;

        // Clear cached data from previous project
        this.tilesetTextures = {};
        this.currentTileset = null;
        this.selectedTiles = [];
        this.cachedLayerCanvas = null;
    }

    // Initialize the palette viewer UI in the sidebar
    initializeUI(container) {
        container.innerHTML = `
            <div id="tileset-palette-container" style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
                <!-- Layer Tabs -->
                <div id="tileset-tabs" style="display: flex; flex-wrap: wrap; gap: 2px; padding: 8px; background-color: var(--color-bg-surface); border-bottom: 1px solid var(--color-border); flex-shrink: 0;">
                    ${this.createLayerTab('A')}
                    ${this.createLayerTab('B')}
                    ${this.createLayerTab('C')}
                    ${this.createLayerTab('D')}
                    ${this.createLayerTab('E')}
                    ${this.createLayerTab('R', '📍')} <!-- Regions tab -->
                </div>

                <!-- Tileset Preview Canvas -->
                <div id="tileset-preview-container" style="flex: 1; overflow: auto; background-color: transparent; position: relative; min-height: 0;">
                    <canvas id="tileset-preview-canvas" style="display: block; image-rendering: pixelated; cursor: crosshair; min-width: 100%; min-height: 100%;"></canvas>
                    <div id="tileset-empty-message" style="display: none; padding: 20px; text-align: center; color: var(--color-text-dim); font-size: 11px;">
                        No tileset image assigned<br/>for this layer
                    </div>
                </div>

                <!-- Region UI Container (shown when R tab is active) -->
                <div id="region-ui-container" style="flex: 1; display: none;"></div>

                <!-- Selection Info -->
                <div id="selection-info" style="padding: 8px; background-color: var(--color-bg-list-item); border-top: 1px solid var(--color-border); font-size: 10px; color: var(--color-text-muted); flex-shrink: 0;">
                    <div>No tiles selected</div>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    createLayerTab(layerName, icon = '') {
        const isActive = layerName === this.currentLayer;
        const displayText = icon ? `${icon} ${layerName}` : layerName;
        return `
            <button
                class="tileset-layer-tab ${isActive ? 'active' : ''}"
                data-layer="${layerName}"
                style="
                    padding: 4px 8px;
                    font-size: 10px;
                    background-color: ${isActive ? 'var(--color-bg-hover)' : 'var(--color-bg-menubar)'};
                    border: 1px solid ${isActive ? 'var(--color-link)' : 'var(--color-border-input)'};
                    color: ${isActive ? 'var(--color-text-strong)' : 'var(--color-text)'};
                    border-radius: 3px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: ${isActive ? '600' : '400'};
                "
            >${displayText}</button>
        `;
    }

    setupEventListeners() {
        // Layer tab clicks
        document.querySelectorAll('.tileset-layer-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const layer = tab.dataset.layer;
                this.selectLayer(layer);
            });
        });

        // Canvas mouse events for tile selection
        const canvas = document.getElementById('tileset-preview-canvas');
        if (canvas) {
            let isSelecting = false;
            let selectionStart = null;

            canvas.addEventListener('mousedown', (e) => {
                isSelecting = true;
                const rect = canvas.getBoundingClientRect();

                // Account for canvas scaling: convert client coordinates to canvas coordinates
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const canvasX = (e.clientX - rect.left) * scaleX;
                const canvasY = (e.clientY - rect.top) * scaleY;

                let x = Math.floor(canvasX / 48); // 48px per tile
                let y = Math.floor(canvasY / 48);
                let actualLayer = this.currentLayer;

                // Handle merged 'A' layer - determine which sub-layer was clicked
                if (this.currentLayer === 'A' && this.mergedALayerOffsets) {
                    const clickResult = this.getSubLayerFromY(canvasY);
                    if (clickResult) {
                        actualLayer = clickResult.layer;
                        y = Math.floor((canvasY - clickResult.startY) / 48);
                    }
                }

                // Adjust for split layout on B-E layers only (not autotiles A1-A4 or A5)
                const isSplitLayer = ['B', 'C', 'D', 'E'].includes(actualLayer);
                if (isSplitLayer) {
                    // Calculate half height based on actual image height
                    const img = this.tilesetTextures[actualLayer];
                    const halfHeight = img ? (img.height / 48) : 16; // Image height in tiles
                    if (y >= halfHeight) {
                        // Clicked on bottom half - adjust x coordinate
                        x += 8; // Add 8 tiles (384px / 48px)
                        y -= halfHeight; // Adjust y to be relative to original image
                    }
                }

                // For autotiles (A1-A4), coordinates are already correct - each grid cell is one "kind"

                selectionStart = { x, y, layer: actualLayer };
                this.updateTileSelection(selectionStart, selectionStart);
            });

            canvas.addEventListener('mousemove', (e) => {
                if (isSelecting && selectionStart) {
                    const rect = canvas.getBoundingClientRect();

                    // Account for canvas scaling: convert client coordinates to canvas coordinates
                    const scaleX = canvas.width / rect.width;
                    const scaleY = canvas.height / rect.height;
                    const canvasX = (e.clientX - rect.left) * scaleX;
                    const canvasY = (e.clientY - rect.top) * scaleY;

                    let x = Math.floor(canvasX / 48);
                    let y = Math.floor(canvasY / 48);
                    let actualLayer = this.currentLayer;

                    // Handle merged 'A' layer - determine which sub-layer was clicked
                    if (this.currentLayer === 'A' && this.mergedALayerOffsets) {
                        const clickResult = this.getSubLayerFromY(canvasY);
                        if (clickResult) {
                            actualLayer = clickResult.layer;
                            y = Math.floor((canvasY - clickResult.startY) / 48);
                        }
                    }

                    // Adjust for split layout on B-E layers only (not autotiles A1-A4 or A5)
                    const isSplitLayer = ['B', 'C', 'D', 'E'].includes(actualLayer);
                    if (isSplitLayer) {
                        // Calculate half height based on actual image height
                        const img = this.tilesetTextures[actualLayer];
                        const halfHeight = img ? (img.height / 48) : 16; // Image height in tiles
                        if (y >= halfHeight) {
                            x += 8;
                            y -= halfHeight;
                        }
                    }

                    // For autotiles (A1-A4), coordinates are already correct - each grid cell is one "kind"

                    this.updateTileSelection(selectionStart, { x, y, layer: actualLayer });
                }
            });

            canvas.addEventListener('mouseup', () => {
                isSelecting = false;
            });

            canvas.addEventListener('mouseleave', () => {
                isSelecting = false;
            });
        }
    }

    selectLayer(layerName) {
        this.currentLayer = layerName;

        // Update tab styles
        document.querySelectorAll('.tileset-layer-tab').forEach(tab => {
            const isActive = tab.dataset.layer === layerName;
            tab.style.backgroundColor = isActive ? 'var(--color-bg-hover)' : 'var(--color-bg-menubar)';
            tab.style.borderColor = isActive ? 'var(--color-link)' : 'var(--color-border-input)';
            tab.style.color = isActive ? 'var(--color-text-strong)' : 'var(--color-text)';
            tab.style.fontWeight = isActive ? '600' : '400';
            if (isActive) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Handle region tab vs tileset tabs
        const tilesetContainer = document.getElementById('tileset-preview-container');
        const regionContainer = document.getElementById('region-ui-container');
        const selectionInfo = document.getElementById('selection-info');

        if (layerName === 'R') {
            // Show region UI, hide tileset preview
            if (tilesetContainer) tilesetContainer.style.display = 'none';
            if (regionContainer) regionContainer.style.display = 'flex';
            if (selectionInfo) selectionInfo.style.display = 'none';

            // Trigger region UI initialization (will be handled by main app)
            this.onRegionTabSelected?.();
        } else {
            // Show tileset preview, hide region UI
            if (tilesetContainer) tilesetContainer.style.display = 'block';
            if (regionContainer) regionContainer.style.display = 'none';
            if (selectionInfo) selectionInfo.style.display = 'block';

            // Hide regions overlay when switching away from R tab
            this.onTilesetLayerSelected?.();

            // Render the selected layer
            this.renderCurrentLayer();

            // Trigger layer changed callback to update layer highlights
            if (this.onLayerChanged) {
                this.onLayerChanged(layerName);
            }

            // Don't trigger callback - allow browsing layers without disabling event mode
            // Users can browse different layers to select tiles for events
        }
    }

    // Load tileset for the current map
    async loadTilesetForMap(mapData) {
        if (!mapData || !this.fs) return;

        try {
            const tilesetsPath = this.path.join(this.projectPath, 'data', 'Tilesets.json');
            if (!this.fs.existsSync(tilesetsPath)) {
                console.warn('Tilesets.json not found');
                return;
            }

            const tilesets = JSON.parse(this.fs.readFileSync(tilesetsPath, 'utf8'));
            const tilesetId = mapData.tilesetId || 1;
            this.currentTileset = tilesets[tilesetId];

            if (!this.currentTileset) {
                console.warn('Tileset not found:', tilesetId);
                return;
            }

            // Load all tileset images (wait for them to complete)
            await this.loadTilesetImages();

            // Render the current layer (now that images are loaded)
            this.renderCurrentLayer();
        } catch (error) {
            console.error('Error loading tileset:', error);
        }
    }

    async loadTilesetImages() {
        if (!this.currentTileset) return;

        const tilesetNames = this.currentTileset.tilesetNames;

        // Load each tileset image
        for (let i = 0; i < tilesetNames.length; i++) {
            const name = tilesetNames[i];
            if (!name || name === '') continue;

            const layerKey = this.getLayerKeyFromIndex(i);
            const imgPath = this.path.join(this.projectPath, 'img', 'tilesets', name + '.png');

            if (this.fs.existsSync(imgPath)) {
                // Load image using Image object
                const img = new Image();
                img.src = typeof window !== 'undefined' && window.RPGReactorHost?.assetUrl
                    ? window.RPGReactorHost.assetUrl(imgPath)
                    : 'file://' + imgPath.replace(/\\/g, '/');

                await new Promise((resolve) => {
                    img.onload = () => {
                        this.tilesetTextures[layerKey] = img;
                        resolve();
                    };
                    img.onerror = () => {
                        console.error(`Failed to load tileset image: ${imgPath}`);
                        resolve();
                    };
                });
            }
        }
    }

    getLayerKeyFromIndex(index) {
        const layers = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];
        return layers[index] || 'A1';
    }

    getIndexFromLayerKey(layerKey) {
        const layers = ['A1', 'A2', 'A3', 'A4', 'A5', 'B', 'C', 'D', 'E'];
        return layers.indexOf(layerKey);
    }

    renderCurrentLayer() {
        const canvas = document.getElementById('tileset-preview-canvas');
        const emptyMessage = document.getElementById('tileset-empty-message');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        // Handle merged 'A' layer (A1-A5 stacked)
        if (this.currentLayer === 'A') {
            this.renderMergedALayer(ctx, canvas, emptyMessage);
            this.cacheCurrentLayer(canvas);
            return;
        }

        const img = this.tilesetTextures[this.currentLayer];

        if (!img) {
            // No image for this layer
            canvas.style.display = 'none';
            emptyMessage.style.display = 'block';
            return;
        }

        canvas.style.display = 'block';
        emptyMessage.style.display = 'none';

        // Check if this is an autotile layer (A1-A4)
        const isAutotileLayer = ['A1', 'A2', 'A3', 'A4'].includes(this.currentLayer);

        if (isAutotileLayer) {
            // Autotiles: show compact preview grid (one tile per "kind")
            // First draw checkerboard, then render autotile palette on top
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            this.renderAutotilePalette(tempCtx, img, this.currentLayer);

            // Set main canvas size to match
            canvas.width = tempCanvas.width;
            canvas.height = tempCanvas.height;

            // Draw checkerboard on main canvas
            this.drawCheckerboard(ctx, canvas.width, canvas.height);

            // Draw autotile palette on top
            ctx.drawImage(tempCanvas, 0, 0);
        } else if (this.currentLayer === 'A5') {
            // A5 is 384x768 - display as-is, no splitting needed
            const scale = 1;
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            // Draw checkerboard background for transparency
            this.drawCheckerboard(ctx, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);

            this.drawGrid(ctx, img.width, img.height, scale);

        } else {
            // Regular tile layers (B, C, D, E) are 768px wide
            // RPG Maker style: split the 768px wide image into two 384px columns stacked vertically
            const halfWidth = img.width / 2;
            const scale = 1;

            canvas.width = halfWidth * scale;
            canvas.height = img.height * 2 * scale; // Double height to fit both halves

            // Draw checkerboard background for transparency
            this.drawCheckerboard(ctx, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;

            // Draw left half at top
            ctx.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth * scale, img.height * scale);

            // Draw right half at bottom
            ctx.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, img.height * scale, halfWidth * scale, img.height * scale);

            this.drawGrid(ctx, halfWidth, img.height * 2, scale);
        }

        // OPTIMIZATION: Cache the rendered layer for fast redrawing during selection
        this.cacheCurrentLayer(canvas);
    }

    // Cache the current canvas content for fast redraws
    cacheCurrentLayer(canvas) {
        if (!this.cachedLayerCanvas) {
            this.cachedLayerCanvas = document.createElement('canvas');
        }
        this.cachedLayerCanvas.width = canvas.width;
        this.cachedLayerCanvas.height = canvas.height;
        const cacheCtx = this.cachedLayerCanvas.getContext('2d');
        cacheCtx.drawImage(canvas, 0, 0);
    }

    // Restore cached layer to main canvas (fast redraw)
    restoreCachedLayer() {
        if (!this.cachedLayerCanvas) return;
        const canvas = document.getElementById('tileset-preview-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(this.cachedLayerCanvas, 0, 0);
    }

    renderMergedALayer(ctx, canvas, emptyMessage) {
        // Render A1-A5 stacked vertically
        canvas.style.display = 'block';
        emptyMessage.style.display = 'none';

        let currentY = 0;
        const layersToRender = ['A1', 'A2', 'A3', 'A4', 'A5'];
        const layerHeights = [];

        // Calculate total height needed
        for (const layer of layersToRender) {
            const img = this.tilesetTextures[layer];
            if (!img) continue;

            let height;
            if (layer === 'A1') {
                height = 2 * 48; // 2 rows (8 cols × 2 rows)
            } else if (layer === 'A2' || layer === 'A3') {
                height = 4 * 48; // 4 rows each
            } else if (layer === 'A4') {
                height = 6 * 48; // 6 rows
            } else if (layer === 'A5') {
                height = img.height; // Full A5 height
            }
            layerHeights.push({ layer, height, startY: currentY });
            currentY += height;
        }

        // Determine canvas width - use widest layer (A2/A3/A4/A5 are 8 cols = 384px)
        const canvasWidth = 384; // 8 columns × 48px (A1 is narrower at 2 cols = 96px)
        canvas.width = canvasWidth;
        canvas.height = currentY;

        // Draw checkerboard background for transparency
        this.drawCheckerboard(ctx, canvas.width, canvas.height);

        // Render each layer
        for (const layerInfo of layerHeights) {
            const { layer, startY } = layerInfo;
            const img = this.tilesetTextures[layer];
            if (!img) continue;

            // Save context and translate to layer position
            ctx.save();
            ctx.translate(0, startY);

            // Create a temporary canvas for this layer
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');

            if (['A1', 'A2', 'A3', 'A4'].includes(layer)) {
                this.renderAutotilePalette(tempCtx, img, layer);
                ctx.drawImage(tempCanvas, 0, 0);
            } else if (layer === 'A5') {
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                // Note: Checkerboard is drawn on main canvas, temp canvas just draws the image
                tempCtx.imageSmoothingEnabled = false;
                tempCtx.drawImage(img, 0, 0);
                this.drawGrid(tempCtx, img.width, img.height, 1);
                ctx.drawImage(tempCanvas, 0, 0);
            }

            ctx.restore();
        }

        // Store layer offsets for click detection
        this.mergedALayerOffsets = layerHeights;
    }

    renderAutotilePalette(ctx, img, layer) {
        const canvas = ctx.canvas;
        const tileSize = 48; // Each preview tile is 48x48

        // Autotile palette layout:
        // A1: 16 kinds (8 cols × 2 rows - water types + waterfalls spread horizontally)
        // A2: 32 kinds (8 cols × 4 rows - ground autotiles)
        // A3: 32 kinds (8 cols × 4 rows - building/wall autotiles)
        // A4: 48 kinds (8 cols × 6 rows - wall and roof autotiles)
        //     Even rows (0,2,4): Roofs 2×3 blocks, Odd rows (1,3,5): Walls 2×2 blocks

        let gridCols, gridRows;

        switch(layer) {
            case 'A1':
                gridCols = 8;
                gridRows = 2;
                break;
            case 'A2':
                gridCols = 8;
                gridRows = 4;
                break;
            case 'A3':
                gridCols = 8;
                gridRows = 4;
                break;
            case 'A4':
                gridCols = 8;
                gridRows = 6;
                break;
        }

        canvas.width = gridCols * tileSize;
        canvas.height = gridRows * tileSize;

        // Clear canvas (no checkerboard here - it's drawn by the caller)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;

        // Draw each autotile preview
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const destX = col * tileSize;
                const destY = row * tileSize;
                const kindIndex = row * gridCols + col;

                // Draw properly assembled autotile preview
                this.drawAutotilePreview(ctx, img, layer, kindIndex, destX, destY, tileSize);
            }
        }

        // Draw grid
        this.drawGrid(ctx, canvas.width, canvas.height, 1);
    }

    drawAutotilePreview(ctx, img, layer, kindIndex, destX, destY, tileSize) {
        // Each autotile "kind" is arranged in a 2x3 block (96px wide, 144px tall for A2-A4)
        // The top-left tile (48x48) is the preview tile used in the palette

        let srcX, srcY;

        if (layer === 'A1') {
            // A1: 8 cols × 2 rows palette layout
            // Palette shows: Water A, Rocks C, Water B, Rocks C overlay, Water D, Waterfall E, Water D, Waterfall E (row 1)
            // Tileset IMAGE has 4 source rows, each with blocks at positions [0, 3, 4, 7]
            const paletteCol = kindIndex % 8;  // 0-7
            const paletteRow = Math.floor(kindIndex / 8);  // 0 or 1

            // RPG Maker MZ A1 structure (from corescript)
            const kindToBlock = [
                [0, 0], [0, 1], [3, 0], [3, 1], [4, 0], [7, 0], [4, 1], [7, 1], // kinds 0-7
                [0, 2], [3, 2], [0, 3], [3, 3], [4, 2], [7, 2], [4, 3], [7, 3]  // kinds 8-15
            ];

            const [block, sourceRow] = kindToBlock[kindIndex];

            srcX = block * tileSize * 2;  // Block position in pixels
            srcY = sourceRow * tileSize * 3;  // Source row in pixels
        } else if (layer === 'A2') {
            // A2: Ground autotiles (8 columns × 4 rows of 2x3 blocks)
            const col = kindIndex % 8;
            const row = Math.floor(kindIndex / 8);
            srcX = col * tileSize * 2;  // Each block is 2 tiles (96px) wide
            srcY = row * tileSize * 3;  // Each block is 3 tiles (144px) tall
        } else if (layer === 'A3') {
            // A3: Building/wall autotiles (8 columns × 4 rows of 2x2 blocks)
            const col = kindIndex % 8;
            const row = Math.floor(kindIndex / 8);
            srcX = col * tileSize * 2;  // Each block is 2 tiles (96px) wide
            srcY = row * tileSize * 2;  // Each block is 2 tiles (96px) tall for A3
        } else if (layer === 'A4') {
            // A4: Wall and roof autotiles (8 columns × 6 rows)
            // Even rows: Roofs (2×3), Odd rows: Walls (2×2)
            const col = kindIndex % 8;
            const row = Math.floor(kindIndex / 8);
            srcX = col * tileSize * 2;  // Each block is 2 tiles (96px) wide

            // Calculate Y position: roofs are 3 tiles tall, walls are 2 tiles tall
            // Pattern: Roof(3) Wall(2) Roof(3) Wall(2) Roof(3) Wall(2)
            const pairIndex = Math.floor(row / 2);  // Which roof+wall pair (0, 1, or 2)
            const isWall = row % 2 === 1;
            srcY = pairIndex * tileSize * 5 + (isWall ? tileSize * 3 : 0);
        }

        // Extract just the top-left preview tile (48x48)
        ctx.drawImage(
            img,
            srcX, srcY,
            tileSize, tileSize,
            destX, destY,
            tileSize, tileSize
        );
    }


    drawGrid(ctx, width, height, scale) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;

        const tileSize = 48 * scale; // RPG Maker uses 48px tiles

        // Draw vertical lines
        for (let x = 0; x <= width * scale; x += tileSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height * scale);
            ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = 0; y <= height * scale; y += tileSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width * scale, y);
            ctx.stroke();
        }
    }

    updateTileSelection(start, end) {
        const canvas = document.getElementById('tileset-preview-canvas');
        if (!canvas) return;

        // Calculate selection rectangle
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;

        // Determine the actual layer (use layer from start if available, else currentLayer)
        const actualLayer = start.layer || this.currentLayer;

        // Store selected tiles
        this.selectedTiles = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.selectedTiles.push({ x, y, layer: actualLayer });
            }
        }

        // OPTIMIZATION: Use cached layer instead of re-rendering
        this.restoreCachedLayer();
        this.drawSelectionOverlay(minX, minY, width, height, actualLayer);

        // Update selection info
        const info = document.getElementById('selection-info');
        if (info) {
            const displayLayer = this.currentLayer === 'A' ? actualLayer : this.currentLayer;
            info.innerHTML = `<div>Selected: ${width}x${height} tiles (${this.selectedTiles.length} tiles) on layer ${displayLayer}</div>`;
        }

        // Auto-toggle erase mode based on tile transparency
        this.autoToggleEraseMode();
    }

    // Check if selected tiles are transparent and auto-toggle erase mode
    autoToggleEraseMode() {
        if (!this.mapEditor) return;

        const isTransparent = this.isSelectionTransparent();

        if (isTransparent && !this.mapEditor.eraserMode) {
            // Enable erase mode when selecting transparent tile
            this.mapEditor.setEraserMode(true);
        } else if (!isTransparent) {
            // ALWAYS disable erase mode when selecting non-transparent tile
            // This ensures that after using eraser, selecting a real tile lets you paint again
            this.mapEditor.setEraserMode(false);

            // Auto-activate previous tool (or pencil if no previous tool) if no tool is currently selected
            if (!this.mapEditor.currentTool && !this.mapEditor.shadowPenMode) {
                // Use previous tool, or default to pencil
                const toolToActivate = this.mapEditor.previousTool || 'pencil';
                this.mapEditor.setTool(toolToActivate);

                // Update button UI state
                const toolBtn = document.querySelector(`[data-tool="${toolToActivate}"]`);
                if (toolBtn) {
                    // Remove active from all tool buttons first
                    document.querySelectorAll('.tool-draw-mode').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    // Add active to the restored tool button
                    toolBtn.classList.add('active');
                }
            }
        }
    }

    // Check if the currently selected tiles are fully transparent
    isSelectionTransparent() {
        if (!this.selectedTiles || this.selectedTiles.length === 0) {
            return false;
        }

        // Use the palette canvas which has the processed tiles rendered
        const canvas = document.getElementById('tileset-preview-canvas');
        if (!canvas) return false;

        const ctx = canvas.getContext('2d');
        const tileSize = 48;

        // Check each selected tile
        for (const tile of this.selectedTiles) {
            let checkX = tile.x * tileSize;
            let checkY = tile.y * tileSize;

            // For split layers (B-E), adjust coordinates if x >= 8
            const layer = tile.layer || this.currentLayer;
            const isSplitLayer = ['B', 'C', 'D', 'E'].includes(layer);

            if (isSplitLayer && tile.x >= 8) {
                const img = this.tilesetTextures[layer];
                const halfHeight = img ? (img.height / 48) : 16;
                checkX = (tile.x - 8) * tileSize;
                checkY = (tile.y + halfHeight) * tileSize;
            }

            // Handle merged 'A' layer offsets
            if (this.currentLayer === 'A' && tile.layer && this.mergedALayerOffsets) {
                const sublayerInfo = this.mergedALayerOffsets.find(info => info.layer === tile.layer);
                if (sublayerInfo) {
                    checkY = tile.y * tileSize + sublayerInfo.startY;
                }
            }

            // Sample the center area of the tile
            try {
                const imageData = ctx.getImageData(checkX + 12, checkY + 12, 24, 24);
                const data = imageData.data;

                // Check if any pixel has non-zero alpha
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] > 0) {
                        // Found a non-transparent pixel
                        return false;
                    }
                }
            } catch (e) {
                // If we can't read the image data, assume not transparent
                console.warn('Could not check transparency:', e);
                return false;
            }
        }

        // All selected tiles are fully transparent
        return true;
    }

    drawSelectionOverlay(x, y, width, height, layer = null) {
        const canvas = document.getElementById('tileset-preview-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const scale = 1;
        const tileSize = 48 * scale;

        // Convert original image coordinates to canvas coordinates
        let canvasX = x;
        let canvasY = y;

        // Handle merged 'A' layer - add Y offset for the sublayer
        if (this.currentLayer === 'A' && layer && this.mergedALayerOffsets) {
            const sublayerInfo = this.mergedALayerOffsets.find(info => info.layer === layer);
            if (sublayerInfo) {
                canvasY = y + (sublayerInfo.startY / 48); // Add sublayer offset in tiles
            }
        }

        // For split layout (B-E layers only, not autotiles A1-A4 or A5), need to handle tiles from right half (x >= 8)
        // These are drawn in the bottom half of the canvas
        const actualLayer = layer || this.currentLayer;
        const isSplitLayer = ['B', 'C', 'D', 'E'].includes(actualLayer);

        if (isSplitLayer && x >= 8) {
            // Right half of original image (x 8-15) displays in bottom half
            const img = this.tilesetTextures[actualLayer];
            const halfHeight = img ? (img.height / 48) : 16; // Image height in tiles
            canvasX = x - 8;  // Map x 8-15 to canvas x 0-7
            canvasY = y + halfHeight; // Offset down by the image height
        }

        // For autotiles (A1-A4), coordinates are already correct - canvas matches grid

        // Draw selection rectangle
        ctx.strokeStyle = '#007acc';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            canvasX * tileSize,
            canvasY * tileSize,
            width * tileSize,
            height * tileSize
        );

        // Draw semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 122, 204, 0.2)';
        ctx.fillRect(
            canvasX * tileSize,
            canvasY * tileSize,
            width * tileSize,
            height * tileSize
        );
    }

    // Get currently selected tiles for painting
    getSelectedTiles() {
        // console.log('getSelectedTiles called, returning:', this.selectedTiles);
        return this.selectedTiles;
    }

    // Clear selection
    clearSelection() {
        this.selectedTiles = [];
        this.renderCurrentLayer();
        const info = document.getElementById('selection-info');
        if (info) {
            info.innerHTML = '<div>No tiles selected</div>';
        }
    }

    // Helper to determine which sub-layer of merged 'A' was clicked
    getSubLayerFromY(canvasY) {
        if (!this.mergedALayerOffsets) return null;

        for (const layerInfo of this.mergedALayerOffsets) {
            if (canvasY >= layerInfo.startY && canvasY < layerInfo.startY + layerInfo.height) {
                return layerInfo;
            }
        }
        return null;
    }

    // Draw a checkerboard pattern to represent transparency
    drawCheckerboard(ctx, width, height, squareSize = 8) {
        const color1 = 'var(--color-syntax-comment)'; // Gray
        const color2 = 'var(--color-text-muted)'; // Light gray

        for (let y = 0; y < height; y += squareSize) {
            for (let x = 0; x < width; x += squareSize) {
                // Alternate colors in checkerboard pattern
                const isEven = (Math.floor(x / squareSize) + Math.floor(y / squareSize)) % 2 === 0;
                ctx.fillStyle = isEven ? color1 : color2;
                ctx.fillRect(x, y, squareSize, squareSize);
            }
        }
    }
}
