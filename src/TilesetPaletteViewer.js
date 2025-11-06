// RPG Reactor - Tileset Palette Viewer
// Displays tileset layers as tabs with tile graphics for map editing

class TilesetPaletteViewer {
    constructor(app, projectPath) {
        this.app = app;
        this.projectPath = projectPath;
        this.fs = null;
        this.path = null;
        this.currentTileset = null;
        this.currentLayer = 'A1'; // Default to A1
        this.tilesetTextures = {}; // Cache for loaded tileset textures
        this.selectedTiles = []; // Currently selected tiles for painting

        // Initialize Node.js modules if running in NW.js
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    // Initialize the palette viewer UI in the sidebar
    initializeUI(container) {
        container.innerHTML = `
            <div id="tileset-palette-container" style="display: flex; flex-direction: column; height: 100%;">
                <!-- Layer Tabs -->
                <div id="tileset-tabs" style="display: flex; flex-wrap: wrap; gap: 2px; padding: 8px; background-color: #1e1e1e; border-bottom: 1px solid #3e3e42;">
                    ${this.createLayerTab('A1')}
                    ${this.createLayerTab('A2')}
                    ${this.createLayerTab('A3')}
                    ${this.createLayerTab('A4')}
                    ${this.createLayerTab('A5')}
                    ${this.createLayerTab('B')}
                    ${this.createLayerTab('C')}
                    ${this.createLayerTab('D')}
                    ${this.createLayerTab('E')}
                    ${this.createLayerTab('R', '📍')} <!-- Regions tab -->
                </div>

                <!-- Tileset Preview Canvas -->
                <div id="tileset-preview-container" style="flex: 1; overflow: auto; background-color: #1e1e1e; position: relative; min-height: 0;">
                    <canvas id="tileset-preview-canvas" style="display: block; image-rendering: pixelated; cursor: crosshair; min-width: 100%; min-height: 100%;"></canvas>
                    <div id="tileset-empty-message" style="display: none; padding: 20px; text-align: center; color: #666; font-size: 11px;">
                        No tileset image assigned<br/>for this layer
                    </div>
                </div>

                <!-- Region UI Container (shown when R tab is active) -->
                <div id="region-ui-container" style="flex: 1; display: none;"></div>

                <!-- Selection Info -->
                <div id="selection-info" style="padding: 8px; background-color: #252526; border-top: 1px solid #3e3e42; font-size: 10px; color: #999;">
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
                    background-color: ${isActive ? '#37373d' : '#2d2d30'};
                    border: 1px solid ${isActive ? '#007acc' : '#555'};
                    color: ${isActive ? '#fff' : '#ccc'};
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

                // Adjust for split layout on B-E layers only (not autotiles A1-A4 or A5)
                const isSplitLayer = ['B', 'C', 'D', 'E'].includes(this.currentLayer);
                if (isSplitLayer) {
                    // Calculate half height based on actual image height
                    const img = this.tilesetTextures[this.currentLayer];
                    const halfHeight = img ? (img.height / 48) : 16; // Image height in tiles
                    if (y >= halfHeight) {
                        // Clicked on bottom half - adjust x coordinate
                        x += 8; // Add 8 tiles (384px / 48px)
                        y -= halfHeight; // Adjust y to be relative to original image
                    }
                }

                // For autotiles (A1-A4), coordinates are already correct - each grid cell is one "kind"

                selectionStart = { x, y };
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

                    // Adjust for split layout on B-E layers only (not autotiles A1-A4 or A5)
                    const isSplitLayer = ['B', 'C', 'D', 'E'].includes(this.currentLayer);
                    if (isSplitLayer) {
                        // Calculate half height based on actual image height
                        const img = this.tilesetTextures[this.currentLayer];
                        const halfHeight = img ? (img.height / 48) : 16; // Image height in tiles
                        if (y >= halfHeight) {
                            x += 8;
                            y -= halfHeight;
                        }
                    }

                    // For autotiles (A1-A4), coordinates are already correct - each grid cell is one "kind"

                    this.updateTileSelection(selectionStart, { x, y });
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
            tab.style.backgroundColor = isActive ? '#37373d' : '#2d2d30';
            tab.style.borderColor = isActive ? '#007acc' : '#555';
            tab.style.color = isActive ? '#fff' : '#ccc';
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

            // Render the selected layer
            this.renderCurrentLayer();
        }
    }

    // Load tileset for the current map
    loadTilesetForMap(mapData) {
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

            console.log('Loaded tileset:', this.currentTileset.name);

            // Load all tileset images
            this.loadTilesetImages();

            // Render the current layer
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
                img.src = 'file://' + imgPath.replace(/\\/g, '/');

                await new Promise((resolve) => {
                    img.onload = () => {
                        this.tilesetTextures[layerKey] = img;
                        console.log(`Loaded tileset image for layer ${layerKey}:`, name);
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
            this.renderAutotilePalette(ctx, img, this.currentLayer);
        } else if (this.currentLayer === 'A5') {
            // A5 is 384x768 - display as-is, no splitting needed
            const scale = 1;
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            console.log(`Canvas sized for layer A5: ${canvas.width}x${canvas.height}, img: ${img.width}x${img.height}`);

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, img.width * scale, img.height * scale);

            this.drawGrid(ctx, img.width, img.height, scale);

            console.log(`Canvas actual size: ${canvas.offsetWidth}x${canvas.offsetHeight}, client: ${canvas.clientWidth}x${canvas.clientHeight}`);
        } else {
            // Regular tile layers (B, C, D, E) are 768px wide
            // RPG Maker style: split the 768px wide image into two 384px columns stacked vertically
            const halfWidth = img.width / 2;
            const scale = 1;

            canvas.width = halfWidth * scale;
            canvas.height = img.height * 2 * scale; // Double height to fit both halves

            console.log(`Canvas sized for layer ${this.currentLayer}: ${canvas.width}x${canvas.height}, img: ${img.width}x${img.height}`);

            ctx.imageSmoothingEnabled = false;

            // Draw left half at top
            ctx.drawImage(img, 0, 0, halfWidth, img.height, 0, 0, halfWidth * scale, img.height * scale);

            // Draw right half at bottom
            ctx.drawImage(img, halfWidth, 0, halfWidth, img.height, 0, img.height * scale, halfWidth * scale, img.height * scale);

            this.drawGrid(ctx, halfWidth, img.height * 2, scale);

            console.log(`Canvas actual size: ${canvas.offsetWidth}x${canvas.offsetHeight}, client: ${canvas.clientWidth}x${canvas.clientHeight}`);
        }
    }

    renderAutotilePalette(ctx, img, layer) {
        const canvas = ctx.canvas;
        const tileSize = 48; // Each preview tile is 48x48

        // Autotile palette layout:
        // A1: 4 rows × 2 cols (water/animated) + 4 rows × 4 cols (waterfalls) = 8 kinds
        // A2: 8 rows × 4 cols = 32 kinds (ground autotiles)
        // A3: 8 rows × 4 cols = 32 kinds (building/wall autotiles)
        // A4: 10 rows × 4 cols = 40 kinds (wall top autotiles)

        let gridCols, gridRows;

        switch(layer) {
            case 'A1':
                gridCols = 2;
                gridRows = 4;
                break;
            case 'A2':
                gridCols = 4;
                gridRows = 8;
                break;
            case 'A3':
                gridCols = 4;
                gridRows = 8;
                break;
            case 'A4':
                gridCols = 4;
                gridRows = 10;
                break;
        }

        canvas.width = gridCols * tileSize;
        canvas.height = gridRows * tileSize;

        ctx.imageSmoothingEnabled = false;

        // Draw each autotile preview
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const destX = col * tileSize;
                const destY = row * tileSize;

                // Extract the preview tile from the source image
                // For autotiles, we take the top-left mini-tile (2x2 arrangement)
                const srcX = col * tileSize * 2; // Autotiles are 2 tiles wide
                const srcY = row * tileSize * 3; // Autotiles are 3 tiles tall (for A2-A4)

                if (layer === 'A1') {
                    // A1 is special - different layout for water vs waterfalls
                    const kindIndex = row * gridCols + col;
                    this.drawA1Preview(ctx, img, kindIndex, destX, destY, tileSize);
                } else {
                    // A2, A3, A4: Take top-left 48x48 section of each autotile block
                    ctx.drawImage(
                        img,
                        srcX, srcY,
                        tileSize, tileSize,
                        destX, destY,
                        tileSize, tileSize
                    );
                }
            }
        }

        // Draw grid
        this.drawGrid(ctx, canvas.width, canvas.height, 1);
    }

    drawA1Preview(ctx, img, kindIndex, destX, destY, tileSize) {
        // A1 layout is special:
        // Kinds 0-3: Ocean, Deep Ocean, Beach, Sea (top 4 rows, cols 0-1)
        // Kinds 4-7: Waterfalls (rows 4-7, arranged differently)

        let srcX, srcY;

        if (kindIndex < 4) {
            // Water tiles (animated) - top 4 kinds
            const col = kindIndex % 2;
            const row = Math.floor(kindIndex / 2);
            srcX = col * tileSize * 2;
            srcY = row * tileSize * 3;
        } else {
            // Waterfall tiles - bottom 4 kinds
            const waterfallIndex = kindIndex - 4;
            const col = waterfallIndex % 2;
            const row = Math.floor(waterfallIndex / 2);
            srcX = (col + 2) * tileSize * 2; // Offset by 2 columns
            srcY = row * tileSize * 3;
        }

        // Draw the preview (top-left mini-tile)
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

        // Store selected tiles
        this.selectedTiles = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.selectedTiles.push({ x, y, layer: this.currentLayer });
            }
        }

        // Re-render with selection overlay
        this.renderCurrentLayer();
        this.drawSelectionOverlay(minX, minY, width, height);

        // Update selection info
        const info = document.getElementById('selection-info');
        if (info) {
            info.innerHTML = `<div>Selected: ${width}x${height} tiles (${this.selectedTiles.length} tiles) on layer ${this.currentLayer}</div>`;
        }
    }

    drawSelectionOverlay(x, y, width, height) {
        const canvas = document.getElementById('tileset-preview-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const scale = 1;
        const tileSize = 48 * scale;

        // For split layout (B-E layers only, not autotiles A1-A4 or A5), need to handle tiles from right half (x >= 8)
        // These are drawn in the bottom half of the canvas
        const isSplitLayer = ['B', 'C', 'D', 'E'].includes(this.currentLayer);

        // Convert original image coordinates to canvas coordinates
        let canvasX = x;
        let canvasY = y;

        if (isSplitLayer && x >= 8) {
            // Right half of original image (x 8-15) displays in bottom half
            const img = this.tilesetTextures[this.currentLayer];
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
}
