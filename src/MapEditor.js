// RPG Reactor - Map Editor
// Handles tile placement and editing on maps

class MapEditor {
    constructor(tilemapManager, tilesetPaletteViewer) {
        this.tilemapManager = tilemapManager;
        this.tilesetPaletteViewer = tilesetPaletteViewer;
        this.currentTool = 'pencil'; // pencil, rectangle, circle, fill
        this.eraserMode = false;
        this.isDrawing = false;
        this.drawStart = null;
        this.previewLayer = null;

        // Initialize preview layer for showing shapes before placement
        this.createPreviewLayer();
    }

    createPreviewLayer() {
        if (!this.tilemapManager || !this.tilemapManager.container) {
            return;
        }

        // Create a layer for drawing previews (rectangles, circles)
        this.previewLayer = new PIXI.Graphics();
        this.previewLayer.alpha = 0.5;
        this.tilemapManager.container.addChild(this.previewLayer);
    }

    setTool(tool) {
        this.currentTool = tool;
        this.eraserMode = false;
        console.log(`Tool changed to: ${tool}`);
    }

    setEraserMode(enabled) {
        this.eraserMode = enabled;
        console.log(`Eraser mode: ${enabled}`);
    }

    // Set up event listeners for map canvas
    setupMapInteraction() {
        if (!this.tilemapManager || !this.tilemapManager.container) {
            return;
        }

        const container = this.tilemapManager.container;

        // Make container interactive
        container.interactive = true;
        container.cursor = 'crosshair';

        // Mouse down - start drawing
        container.on('pointerdown', (event) => {
            // Don't draw if panning (middle mouse or with Shift key)
            if (event.data.button === 1 || event.data.originalEvent.shiftKey) {
                return;
            }

            const pos = event.data.getLocalPosition(container);
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            this.isDrawing = true;
            this.drawStart = { x: tileX, y: tileY };

            // For pencil and fill, apply immediately
            if (this.currentTool === 'pencil') {
                this.paintTile(tileX, tileY);
            } else if (this.currentTool === 'fill') {
                this.fillArea(tileX, tileY);
                this.isDrawing = false;
            }

            event.stopPropagation(); // Prevent event from bubbling to panning handler
        });

        // Mouse move - continue drawing or show preview
        container.on('pointermove', (event) => {
            if (!this.isDrawing) return;

            const pos = event.data.getLocalPosition(container);
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            if (this.currentTool === 'pencil') {
                this.paintTile(tileX, tileY);
            } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
                this.showPreview(this.drawStart, { x: tileX, y: tileY });
            }
        });

        // Mouse up - finish drawing
        container.on('pointerup', (event) => {
            if (!this.isDrawing) return;

            const pos = event.data.getLocalPosition(container);
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            if (this.currentTool === 'rectangle') {
                this.paintRectangle(this.drawStart, { x: tileX, y: tileY });
            } else if (this.currentTool === 'circle') {
                this.paintCircle(this.drawStart, { x: tileX, y: tileY });
            }

            this.clearPreview();
            this.isDrawing = false;
            this.drawStart = null;
        });

        container.on('pointerupoutside', () => {
            this.clearPreview();
            this.isDrawing = false;
            this.drawStart = null;
        });
    }

    // Paint a single tile at position
    paintTile(x, y) {
        if (!this.tilemapManager.currentMap) return;

        const { width, height, data } = this.tilemapManager.currentMap;
        if (x < 0 || x >= width || y < 0 || y >= height) return;

        // Get selected tiles from palette
        const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
        if (!selectedTiles || selectedTiles.length === 0) {
            console.warn('No tiles selected in palette');
            return;
        }

        // Get the current layer from palette
        const currentLayer = this.tilesetPaletteViewer.currentLayer;
        const layerIndex = this.getLayerIndex(currentLayer);

        console.log(`Painting tile at (${x}, ${y}) on layer ${currentLayer} (index ${layerIndex})`);
        console.log('Selected tiles:', selectedTiles);

        if (layerIndex === -1) {
            console.error('Invalid layer index');
            return;
        }

        const layerSize = width * height;

        // If eraser mode, set to 0 (empty)
        if (this.eraserMode) {
            const index = layerIndex * layerSize + y * width + x;
            data[index] = 0;
        } else {
            // Paint the selected tiles (support multi-tile selection)
            const minX = Math.min(...selectedTiles.map(t => t.x));
            const minY = Math.min(...selectedTiles.map(t => t.y));

            for (const tile of selectedTiles) {
                const offsetX = tile.x - minX;
                const offsetY = tile.y - minY;
                const targetX = x + offsetX;
                const targetY = y + offsetY;

                if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                    const tileId = this.getTileIdFromPalettePosition(tile.x, tile.y, currentLayer);
                    const index = layerIndex * layerSize + targetY * width + targetX;
                    console.log(`Setting tile at (${targetX}, ${targetY}): tileId=${tileId}, index=${index}`);
                    data[index] = tileId;
                }
            }
        }

        // Re-render the map
        this.tilemapManager.renderMap();
    }

    // Paint a rectangle of tiles
    paintRectangle(start, end) {
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.paintTile(x, y);
            }
        }
    }

    // Paint a circle of tiles
    paintCircle(start, end) {
        const centerX = start.x;
        const centerY = start.y;
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

        const minX = Math.floor(centerX - radius);
        const maxX = Math.ceil(centerX + radius);
        const minY = Math.floor(centerY - radius);
        const maxY = Math.ceil(centerY + radius);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                if (dist <= radius) {
                    this.paintTile(x, y);
                }
            }
        }
    }

    // Fill an area with the selected tile (flood fill)
    fillArea(startX, startY) {
        if (!this.tilemapManager.currentMap) return;

        const { width, height, data } = this.tilemapManager.currentMap;
        const currentLayer = this.tilesetPaletteViewer.currentLayer;
        const layerIndex = this.getLayerIndex(currentLayer);

        if (layerIndex === -1) return;

        const layerSize = width * height;
        const startIndex = layerIndex * layerSize + startY * width + startX;
        const targetTileId = data[startIndex];

        // Get the tile to fill with
        const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
        if (!selectedTiles || selectedTiles.length === 0) return;

        const fillTileId = this.eraserMode ? 0 : this.getTileIdFromPalettePosition(
            selectedTiles[0].x,
            selectedTiles[0].y,
            currentLayer
        );

        // Don't fill if the target is already the fill color
        if (targetTileId === fillTileId) return;

        // Flood fill algorithm (iterative)
        const stack = [{ x: startX, y: startY }];
        const visited = new Set();

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const index = layerIndex * layerSize + y * width + x;
            if (data[index] !== targetTileId) continue;

            visited.add(key);
            data[index] = fillTileId;

            // Add adjacent tiles
            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });
        }

        // Re-render the map
        this.tilemapManager.renderMap();
    }

    // Show preview for rectangle/circle tools
    showPreview(start, current) {
        if (!this.previewLayer) return;

        this.previewLayer.clear();

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;

        if (this.currentTool === 'rectangle') {
            const minX = Math.min(start.x, current.x);
            const maxX = Math.max(start.x, current.x);
            const minY = Math.min(start.y, current.y);
            const maxY = Math.max(start.y, current.y);

            this.previewLayer.rect(
                minX * tileWidth,
                minY * tileHeight,
                (maxX - minX + 1) * tileWidth,
                (maxY - minY + 1) * tileHeight
            );
            this.previewLayer.stroke({ width: 2, color: 0x007acc });
        } else if (this.currentTool === 'circle') {
            const radius = Math.sqrt(
                Math.pow(current.x - start.x, 2) + Math.pow(current.y - start.y, 2)
            );

            this.previewLayer.circle(
                start.x * tileWidth + tileWidth / 2,
                start.y * tileHeight + tileHeight / 2,
                radius * tileWidth
            );
            this.previewLayer.stroke({ width: 2, color: 0x007acc });
        }
    }

    clearPreview() {
        if (this.previewLayer) {
            this.previewLayer.clear();
        }
    }

    // Convert layer key to index
    getLayerIndex(layerKey) {
        // In RPG Maker MZ:
        // Layers 0-3 can contain any tiles (including autotiles A1-A5 and regular B-E)
        // Layer 4 is shadows, Layer 5 is regions
        // For now, we'll default to layer 0 for autotiles and layer 0-3 for B-E
        const layerMap = {
            'A1': 0, // Autotiles go on layer 0 by default
            'A2': 0,
            'A3': 0,
            'A4': 0,
            'A5': 0,
            'B': 0,  // B tiles go on layer 0 by default
            'C': 1,  // C tiles go on layer 1
            'D': 2,  // D tiles go on layer 2
            'E': 3   // E tiles go on layer 3
        };
        return layerMap[layerKey] ?? 0;
    }

    // Convert palette position to tile ID
    getTileIdFromPalettePosition(x, y, layer) {
        switch (layer) {
            case 'B': {
                const tilesPerRow = 8;
                return y * tilesPerRow + x; // B starts at 0
            }
            case 'C': {
                const tilesPerRow = 8;
                return 256 + (y * tilesPerRow + x); // C starts at 256
            }
            case 'D': {
                const tilesPerRow = 8;
                return 512 + (y * tilesPerRow + x); // D starts at 512
            }
            case 'E': {
                const tilesPerRow = 8;
                return 768 + (y * tilesPerRow + x); // E starts at 768
            }
            case 'A5': {
                const tilesPerRow = 8;
                return 1536 + (y * tilesPerRow + x); // A5 starts at 1536
            }
            // A1-A4 are autotiles - each grid position represents a "kind"
            // Each kind has 48 variations, we use the first one (shape 0)
            case 'A1': {
                const kindIndex = y * 2 + x; // A1 grid is 2 cols
                return 2048 + kindIndex * 48; // A1 base + kind * 48 shapes
            }
            case 'A2': {
                const kindIndex = y * 4 + x; // A2 grid is 4 cols
                return 2816 + kindIndex * 48; // A2 base + kind * 48 shapes
            }
            case 'A3': {
                const kindIndex = y * 4 + x; // A3 grid is 4 cols
                return 4352 + kindIndex * 48; // A3 base + kind * 48 shapes
            }
            case 'A4': {
                const kindIndex = y * 4 + x; // A4 grid is 4 cols
                return 5888 + kindIndex * 48; // A4 base + kind * 48 shapes
            }
            default: return 0;
        }
    }

    // Clean up
    destroy() {
        if (this.previewLayer) {
            this.previewLayer.destroy();
            this.previewLayer = null;
        }
    }
}
