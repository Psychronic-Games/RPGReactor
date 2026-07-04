// RPG Reactor - Map Editor
// Handles tile placement and editing on maps

class MapEditor {
    constructor(tilemapManager, tilesetPaletteViewer) {
        this.tilemapManager = tilemapManager;
        this.tilesetPaletteViewer = tilesetPaletteViewer;
        this.regionManager = null; // Will be set later
        this.currentTool = 'pencil'; // pencil, rectangle, circle, fill
        this.previousTool = 'pencil'; // Remember tool before shadow/eraser mode
        this.eraserMode = false;
        this.shadowPenMode = false;
        this.isDrawing = false;
        this.drawStart = null;
        this.previewLayer = null;
        this.tilePreviewContainer = null; // Container for tile placement preview
        this.lastMousePos = null; // Track mouse position for quadrant calculation
        this.shadowPaintMode = null; // 'add' or 'remove' - set on first click, maintained during drag
        this.lastPreviewTile = { x: -1, y: -1, quadrant: -1 }; // PERFORMANCE: Track last preview position to avoid recreating
        this.lastPaintedTile = { x: -1, y: -1, quadrant: -1 }; // PERFORMANCE: Track last painted tile to avoid redundant paints
        this.layerMode = 'auto'; // auto, or layer number (0-3)
        this.enabled = true; // Whether map editor is enabled (disabled during event mode)
        this.pendingAutotileUpdates = []; // Accumulate autotile updates during drag, process on mouseup

        // Undo/Redo system
        this.undoStack = [];
        this.redoStack = [];
        this.maxUndoSteps = 50; // Maximum number of undo steps to store
        this.activeEditState = null;

        // Callbacks
        this.onCoordinatesChange = null; // Callback for when mouse coordinates change
        this.onUndoStateChange = null; // Callback for when undo/redo availability changes

        // Initialize preview layer for showing shapes before placement
        this.createPreviewLayer();
    }

    setRegionManager(regionManager) {
        this.regionManager = regionManager;
    }

    createPreviewLayer() {
        if (!this.tilemapManager || !this.tilemapManager.container) {
            return;
        }

        // Clean up existing preview layers if they exist
        if (this.previewLayer) {
            if (this.previewLayer.parent) {
                this.previewLayer.parent.removeChild(this.previewLayer);
            }
            this.previewLayer.destroy();
        }
        if (this.tilePreviewContainer) {
            if (this.tilePreviewContainer.parent) {
                this.tilePreviewContainer.parent.removeChild(this.tilePreviewContainer);
            }
            this.tilePreviewContainer.destroy({ children: true });
        }

        // Create a layer for drawing previews (rectangles, circles)
        this.previewLayer = new PIXI.Graphics();
        this.previewLayer.zIndex = 1000; // Ensure preview is on top
        this.tilemapManager.container.addChild(this.previewLayer);

        // Create a container for tile placement preview
        this.tilePreviewContainer = new PIXI.Container();
        this.tilePreviewContainer.zIndex = 1001; // Above shape preview
        this.tilePreviewContainer.visible = false;
        this.tilemapManager.container.addChild(this.tilePreviewContainer);

        // Enable sorting by zIndex
        this.tilemapManager.container.sortableChildren = true;
    }

    setTool(tool) {
        // Save current tool as previous before switching
        if (this.currentTool) {
            this.previousTool = this.currentTool;
        }
        this.currentTool = tool;
    }

    setEraserMode(enabled) {
        this.eraserMode = enabled;
        this.hideTilePreview();

        // Update eraser button UI state
        const eraserBtn = document.querySelector('[data-action="eraser"]');
        if (eraserBtn) {
            if (enabled) {
                eraserBtn.classList.add('active');
            } else {
                eraserBtn.classList.remove('active');
            }
        }

        // Disable shadow pen when eraser is enabled
        if (enabled && this.shadowPenMode) {
            this.setShadowPenMode(false);
        }
    }

    setShadowPenMode(enabled) {
        this.shadowPenMode = enabled;

        // CRITICAL: Clear tileset rendering state when enabling shadow mode
        if (enabled) {
            // Clear tile selection in palette
            if (this.tilesetPaletteViewer) {
                this.tilesetPaletteViewer.selectedTiles = [];
                this.tilesetPaletteViewer.clearSelection();
            }
        }

        // Disable eraser when shadow pen is enabled
        if (enabled && this.eraserMode) {
            this.setEraserMode(false);
        }

        // When enabling/disabling shadow pen, manage tool states
        if (enabled) {
            // Save current tool before entering shadow pen mode
            if (this.currentTool) {
                this.previousTool = this.currentTool;
            }

            // Clear current tool to prevent conflicts
            this.currentTool = null;

            // Deactivate event mode button
            const eventBtn = document.getElementById('toolbar-event-manager-btn');
            if (eventBtn) {
                eventBtn.classList.remove('active');
            }

            // Deactivate eraser button
            const eraserBtn = document.querySelector('[data-action="eraser"]');
            if (eraserBtn) {
                eraserBtn.classList.remove('active');
            }

            // Deactivate all drawing tool buttons (pencil, rectangle, circle, fill)
            const drawToolBtns = document.querySelectorAll('.tool-draw-mode');
            drawToolBtns.forEach(btn => {
                btn.classList.remove('active');
            });
        } else {
            // When disabling shadow pen, clear the current tool so nothing is active
            // The previous tool will be restored when user selects a tile from palette
            this.currentTool = null;
        }

        // Update shadow pen button UI state
        const shadowPenBtn = document.querySelector('[data-action="shadow-pen"]');
        if (shadowPenBtn) {
            if (enabled) {
                shadowPenBtn.classList.add('active');
            } else {
                shadowPenBtn.classList.remove('active');
            }
        }

        // Disable/enable tileset palette when shadow pen is toggled
        if (this.tilesetPaletteViewer) {
            if (enabled) {
                // Disable tileset palette interaction
                this.tilesetPaletteViewer.setEnabled(false);
            } else {
                // Re-enable tileset palette
                this.tilesetPaletteViewer.setEnabled(true);
            }
        }
    }

    setLayerMode(mode) {
        this.layerMode = mode;
    }

    setEnabled(enabled) {
        this.enabled = enabled;

        // Hide preview when disabled
        if (!enabled) {
            if (this.isDrawing || this.activeEditState) {
                this.resetDrawingState(true);
            } else {
                this.hideTilePreview();
                this.clearPreview();
            }
        }
    }

    // Undo/Redo system methods
    saveState() {
        if (!this.tilemapManager.currentMap) return;

        // Save a deep copy of the current map data
        const mapData = JSON.parse(JSON.stringify(this.tilemapManager.currentMap.data));
        this.undoStack.push(mapData);

        // Clear redo stack on new action
        this.redoStack = [];

        // Limit undo stack size
        if (this.undoStack.length > this.maxUndoSteps) {
            this.undoStack.shift();
        }

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    beginEditState() {
        if (!this.tilemapManager.currentMap || this.activeEditState) return;

        const beforeData = JSON.parse(JSON.stringify(this.tilemapManager.currentMap.data));
        this.activeEditState = {
            beforeData,
            beforeDataJson: JSON.stringify(beforeData)
        };
    }

    commitEditState() {
        if (!this.activeEditState || !this.tilemapManager.currentMap) {
            this.activeEditState = null;
            return;
        }

        const currentDataJson = JSON.stringify(this.tilemapManager.currentMap.data);
        if (currentDataJson !== this.activeEditState.beforeDataJson) {
            this.undoStack.push(this.activeEditState.beforeData);
            this.redoStack = [];

            if (this.undoStack.length > this.maxUndoSteps) {
                this.undoStack.shift();
            }

            this.notifyUndoStateChange();
        }

        this.activeEditState = null;
    }

    cancelEditState() {
        this.activeEditState = null;
    }

    resetDrawingState(commitEdit = true) {
        this.clearPreview();
        this.hideTilePreview();
        this.isDrawing = false;
        this.drawStart = null;
        this.shadowPaintMode = null;
        this.lastPaintedTile = { x: -1, y: -1, quadrant: -1 };

        if (commitEdit) {
            this.commitEditState();
        } else {
            this.cancelEditState();
        }

        if (this.tilemapManager && this.tilemapManager.resumeLazyLoading) {
            this.tilemapManager.resumeLazyLoading();
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;

        // Save current state to redo stack
        const currentData = JSON.parse(JSON.stringify(this.tilemapManager.currentMap.data));
        this.redoStack.push(currentData);

        // Restore previous state
        const previousData = this.undoStack.pop();
        this.tilemapManager.currentMap.data = previousData;

        // Re-render the map
        this.tilemapManager.renderMap();

        // Refresh region overlay if visible
        if (this.regionManager && this.regionManager.enabled) {
            this.regionManager.renderRegions();
        }

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    redo() {
        if (this.redoStack.length === 0) return;

        // Save current state to undo stack
        const currentData = JSON.parse(JSON.stringify(this.tilemapManager.currentMap.data));
        this.undoStack.push(currentData);

        // Restore next state
        const nextData = this.redoStack.pop();
        this.tilemapManager.currentMap.data = nextData;

        // Re-render the map
        this.tilemapManager.renderMap();

        // Refresh region overlay if visible
        if (this.regionManager && this.regionManager.enabled) {
            this.regionManager.renderRegions();
        }

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    canUndo() {
        return this.undoStack.length > 0;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clearUndoHistory() {
        this.undoStack = [];
        this.redoStack = [];
        this.cancelEditState();
        this.notifyUndoStateChange();
    }

    notifyUndoStateChange() {
        if (this.onUndoStateChange) {
            this.onUndoStateChange(this.canUndo(), this.canRedo());
        }
    }

    // Set up event listeners for map canvas
    setupMapInteraction() {
        if (!this.tilemapManager || !this.tilemapManager.container) {
            return;
        }

        // Ensure preview layers exist (recreate if container was recreated)
        this.createPreviewLayer();

        const container = this.tilemapManager.container;

        // Remove any existing listeners to prevent duplicates
        container.off('pointerdown');
        container.off('pointermove');
        container.off('pointerup');
        container.off('pointerupoutside');
        container.off('pointercancel');
        container.off('pointerleave');

        // Make container interactive
        container.interactive = true;
        container.cursor = 'crosshair';

        // Mouse down - start drawing
        container.on('pointerdown', (event) => {
            // Don't process if map editor is disabled (event mode is active)
            if (!this.enabled) return;

            // Only left-click paints. Middle/shift drag is panning; right-click must not edit tiles.
            if (event.data.button !== 0 || event.data.originalEvent.shiftKey) {
                return;
            }

            // Don't process if no tool is selected (neither drawing tool nor shadow pen nor eraser)
            if (!this.currentTool && !this.shadowPenMode && !this.eraserMode) {
                return;
            }

            const pos = event.data.getLocalPosition(container);
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            if (!this.tilemapManager.currentMap ||
                tileX < 0 || tileY < 0 ||
                tileX >= this.tilemapManager.currentMap.width ||
                tileY >= this.tilemapManager.currentMap.height) {
                return;
            }

            this.beginEditState();

            // PERFORMANCE: Reset last painted tile for new drawing operation
            this.lastPaintedTile = { x: -1, y: -1, quadrant: -1 };

            // PERFORMANCE: Pause lazy-loading during drawing for smoother interaction
            this.tilemapManager.pauseLazyLoading();

            this.isDrawing = true;
            this.drawStart = { x: tileX, y: tileY };

            // Hide preview when starting to draw
            this.hideTilePreview();

            // Eraser works independently of the active draw tool. Shape tools
            // apply on pointerup so the user can drag out the area first.
            if (this.eraserMode && this.currentTool !== 'rectangle' && this.currentTool !== 'circle') {
                this.paintTile(tileX, tileY);
            } else if (this.currentTool === 'pencil') {
                this.paintTile(tileX, tileY);
            } else if (this.currentTool === 'fill') {
                this.fillArea(tileX, tileY);
                this.resetDrawingState(true);
            }

            event.stopPropagation(); // Prevent event from bubbling to panning handler
        });

        // Mouse move - continue drawing or show preview
        container.on('pointermove', (event) => {
            // Don't process if map editor is disabled (event mode is active)
            if (!this.enabled) return;

            const pos = event.data.getLocalPosition(container);
            this.lastMousePos = pos; // Store for quadrant calculation
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            // Update coordinate display in tileset mode
            if (this.enabled && this.onCoordinatesChange && this.tilemapManager.currentMap) {
                if (tileX >= 0 && tileY >= 0 &&
                    tileX < this.tilemapManager.currentMap.width &&
                    tileY < this.tilemapManager.currentMap.height) {
                    this.onCoordinatesChange(tileX, tileY);
                }
            }

            if (this.isDrawing) {
                if (this.eraserMode && this.currentTool !== 'rectangle' && this.currentTool !== 'circle') {
                    this.paintTile(tileX, tileY);
                    this.updateTilePreview(tileX, tileY);
                } else if (this.currentTool === 'pencil' || this.shadowPenMode) {
                    this.paintTile(tileX, tileY);
                    // Show preview at cursor position for immediate visual feedback
                    this.updateTilePreview(tileX, tileY);
                } else if (this.currentTool === 'rectangle' || this.currentTool === 'circle') {
                    // Hide tile preview for shape tools, show shape preview instead
                    this.hideTilePreview();
                    this.showPreview(this.drawStart, { x: tileX, y: tileY });
                }
            } else {
                // Show tile preview when hovering (not drawing)
                this.updateTilePreview(tileX, tileY);
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

            this.resetDrawingState(true);
        });

        container.on('pointerupoutside', () => {
            if (!this.isDrawing) return;
            this.resetDrawingState(true);
        });

        container.on('pointercancel', () => {
            if (!this.isDrawing) return;
            this.resetDrawingState(true);
        });

        // Mouse leave - hide tile preview and clear coordinates
        container.on('pointerleave', () => {
            this.hideTilePreview();

            // Clear coordinate display when mouse leaves map
            if (this.enabled && this.onCoordinatesChange) {
                this.onCoordinatesChange(null, null);
            }
        });

        if (typeof window !== 'undefined') {
            if (this._windowBlurHandler) {
                window.removeEventListener('blur', this._windowBlurHandler);
            }
            this._windowBlurHandler = () => {
                if (this.isDrawing) {
                    this.resetDrawingState(true);
                } else {
                    this.hideTilePreview();
                    this.clearPreview();
                }
            };
            window.addEventListener('blur', this._windowBlurHandler);
        }
    }

    // Update autotiles surrounding a painted area (not the painted tiles themselves)
    // painted Positions: Array of {x, y} positions that were painted
    updateSurroundingAutotiles(paintedPositions) {
        const paintedSet = new Set(paintedPositions.map(p => `${p.x},${p.y}`));
        const neighborsToUpdate = new Set();

        for (const pos of paintedPositions) {
            const neighbors = [
                { x: pos.x, y: pos.y - 1 },
                { x: pos.x + 1, y: pos.y - 1 },
                { x: pos.x + 1, y: pos.y },
                { x: pos.x + 1, y: pos.y + 1 },
                { x: pos.x, y: pos.y + 1 },
                { x: pos.x - 1, y: pos.y + 1 },
                { x: pos.x - 1, y: pos.y },
                { x: pos.x - 1, y: pos.y - 1 }
            ];

            for (const n of neighbors) {
                const key = `${n.x},${n.y}`;
                if (!paintedSet.has(key)) {
                    neighborsToUpdate.add(key);
                }
            }
        }

        for (const key of neighborsToUpdate) {
            const [x, y] = key.split(',').map(Number);
            this.updateNeighboringAutotiles(x, y);
        }
    }

    // Process accumulated autotile updates after drag completes
    processPendingAutotileUpdates() {
        if (this.pendingAutotileUpdates.length === 0) return;

        // Update all accumulated autotiles at once
        for (const autotile of this.pendingAutotileUpdates) {
            this.updateNeighboringAutotiles(autotile.x, autotile.y);
        }

        // Clear the accumulator for next operation
        this.pendingAutotileUpdates = [];
    }

    // Paint a single tile at position
    paintTile(x, y) {
        if (!this.tilemapManager.currentMap) return;

        const { width, height, data } = this.tilemapManager.currentMap;
        if (x < 0 || x >= width || y < 0 || y >= height) return;

        const layerSize = width * height;

        // Get the current layer from palette
        const currentLayer = this.tilesetPaletteViewer.currentLayer;

        // Handle shadow pen mode
        if (this.shadowPenMode) {
            // PERFORMANCE: Calculate quadrant and skip if we already painted this exact spot
            if (this.lastMousePos) {
                const localX = this.lastMousePos.x - (x * this.tilemapManager.TILE_WIDTH);
                const localY = this.lastMousePos.y - (y * this.tilemapManager.TILE_HEIGHT);
                const halfTile = this.tilemapManager.TILE_WIDTH / 2;
                const quadX = localX < halfTile ? 0 : 1;
                const quadY = localY < halfTile ? 0 : 1;
                const quadrant = quadY * 2 + quadX;

                if (this.lastPaintedTile.x === x && this.lastPaintedTile.y === y && this.lastPaintedTile.quadrant === quadrant) {
                    return; // Already painted this quadrant
                }
                this.lastPaintedTile.x = x;
                this.lastPaintedTile.y = y;
                this.lastPaintedTile.quadrant = quadrant;
            }

            this.toggleShadow(x, y, data, width, height, layerSize, this.lastMousePos);
            return;
        }

        // PERFORMANCE: Skip if we already painted this tile position (for non-shadow modes)
        if (this.lastPaintedTile.x === x && this.lastPaintedTile.y === y && !this.shadowPenMode) {
            return;
        }
        this.lastPaintedTile.x = x;
        this.lastPaintedTile.y = y;
        this.lastPaintedTile.quadrant = -1;

        // If eraser mode, erase tiles layer-aware (no tile selection needed)
        if (this.eraserMode) {
            this.eraseTilesAtPositions([{ x, y }]);
            return;
        }

        // Handle region painting (layer 5)
        if (currentLayer === 'R') {
            if (!this.regionManager || !this.regionManager.selectedTiles || this.regionManager.selectedTiles.length === 0) {
                return;
            }

            const selectedRegion = this.regionManager.selectedRegion;
            const index = 5 * layerSize + y * width + x;
            data[index] = selectedRegion;

            // Refresh the region overlay if it's visible
            if (this.regionManager.enabled) {
                this.regionManager.renderRegions();
            }
            return;
        }

        // Get selected tiles from palette (only needed for drawing, not erasing)
        const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
        if (!selectedTiles || selectedTiles.length === 0) {
            return;
        }

        const layerIndex = this.getLayerIndex(currentLayer);

        if (layerIndex === -1) {
            return;
        }

        // Paint the selected tiles (support multi-tile selection)
        const minX = Math.min(...selectedTiles.map(t => t.x));
        const minY = Math.min(...selectedTiles.map(t => t.y));

        // PERFORMANCE: Track affected tiles for incremental update
        const affectedTiles = new Set();
        // No longer tracking autotiles for recalculation - tiles placed with correct shapes immediately

        for (const tile of selectedTiles) {
            const offsetX = tile.x - minX;
            const offsetY = tile.y - minY;
            const targetX = x + offsetX;
            const targetY = y + offsetY;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Use the tile's stored layer (important for merged 'A' layer which stores A1-A5)
                const tileLayer = tile.layer || currentLayer;

                // For autotiles, we need to determine the placement layer FIRST before calculating shape
                // Get the base tile ID without shape calculation
                const baseTileId = this.getBaseTileIdFromPalettePosition(tile.x, tile.y, tileLayer);

                // If tile ID is 0 (transparent), erase the tile instead of placing
                if (baseTileId === 0) {
                    this.eraseTile(targetX, targetY, data, width, height, layerSize);
                    // Track all layers as potentially affected by erase
                    for (let layer = 0; layer <= 3; layer++) {
                        affectedTiles.add(`${targetX},${targetY},${layer}`);
                    }
                } else {
                    // Check if this is an autotile (A1-A5)
                    // A5: 1536-2047, A1: 2048-2815, A2: 2816-4351, A3: 4352-5887, A4: 5888-7423
                    const isAutotile = baseTileId >= 1536 && baseTileId < 8192;

                    if (isAutotile) {
                        // Autotiles (A1-A5) placement rules (shared with
                        // paintSingleTileFromPalette via classifyAutotile /
                        // getAutotilePlacementLayer)
                        const basePos = targetY * width + targetX;
                        const cls = this.classifyAutotile(baseTileId);
                        const { isA1Water, isA1Decoration, isA2Decoration } = cls;

                        // Erase tiles based on what we're placing
                        if (!isA1Water) {
                            if (isA1Decoration || isA2Decoration) {
                                // Decorations: only erase B-E tiles (1-1535) on layers 1-3
                                for (let layer = 1; layer <= 3; layer++) {
                                    const layerIndex = layer * layerSize + basePos;
                                    const tileId = data[layerIndex];
                                    if (tileId > 0 && tileId < 1536) {
                                        data[layerIndex] = 0;
                                        affectedTiles.add(`${targetX},${targetY},${layer}`);
                                    }
                                }
                            } else {
                                // Ground autotiles (A2 ground, A3-A5): erase layers 1-3 only
                                for (let layer = 1; layer <= 3; layer++) {
                                    const layerIndex = layer * layerSize + basePos;
                                    const tileId = data[layerIndex];
                                    if (tileId > 0) {
                                        data[layerIndex] = 0;
                                        affectedTiles.add(`${targetX},${targetY},${layer}`);
                                    }
                                }
                            }
                        } else {
                            // A1 water: erase layers 1-3 (layer 0 gets replaced)
                            for (let layer = 1; layer <= 3; layer++) {
                                const layerIndex = layer * layerSize + basePos;
                                const tileId = data[layerIndex];
                                if (tileId > 0) {
                                    data[layerIndex] = 0;
                                    affectedTiles.add(`${targetX},${targetY},${layer}`);
                                }
                            }
                        }

                        // Determine which layer this tile will be placed on
                        const actualPlacementLayer = this.getAutotilePlacementLayer(baseTileId, targetX, targetY);

                        // Place the tile with base shape
                        const targetLayerIndex = actualPlacementLayer * layerSize + basePos;
                        data[targetLayerIndex] = baseTileId;
                        affectedTiles.add(`${targetX},${targetY},${actualPlacementLayer}`);

                        // For A1/A2 decorations on layer 1, also update layer 0 for proper rendering
                        if ((isA1Decoration || isA2Decoration) && actualPlacementLayer === 1) {
                            affectedTiles.add(`${targetX},${targetY},0`);
                        }

                        // Calculate correct shape
                        const shapeResult = this.calculateAutotileShape(baseTileId, targetX, targetY, null, actualPlacementLayer);
                        const tileId = shapeResult.tileId;

                        // Update with correctly shaped tile
                        data[targetLayerIndex] = tileId;
                    } else {
                        // For non-autotiles, use the original function
                        const tileId = this.getTileIdFromPalettePosition(tile.x, tile.y, tileLayer, targetX, targetY);
                        // B-E tiles use the layering system (L1-L4)
                        const placementLayer = this.findAvailableLayer(data, width, height, targetX, targetY, layerIndex);

                        if (placementLayer === -2) {
                            // Auto mode: all 3 layers full, shift down and add new tile
                            this.shiftLayersDown(data, width, height, targetX, targetY, tileId);
                            // Track all layers as potentially affected
                            for (let layer = 0; layer <= 3; layer++) {
                                affectedTiles.add(`${targetX},${targetY},${layer}`);
                            }
                        } else if (placementLayer !== -1) {
                            // Place on the returned layer
                            const index = placementLayer * layerSize + targetY * width + targetX;
                            data[index] = tileId;
                            affectedTiles.add(`${targetX},${targetY},${placementLayer}`);
                            // B-E tiles don't affect autotile borders, so no update needed
                        }
                    }
                }
            }
        }

        // PERFORMANCE: After placing all tiles, recalculate autotile shapes
        // This is necessary because tiles are placed left-to-right, top-to-bottom,
        // so early tiles don't see later tiles as neighbors during initial calculation
        let recalcCount = 0;
        for (const tile of selectedTiles) {
            const offsetX = tile.x - minX;
            const offsetY = tile.y - minY;
            const targetX = x + offsetX;
            const targetY = y + offsetY;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Check if we placed an autotile at this position
                for (let layer = 0; layer <= 3; layer++) {
                    const index = layer * layerSize + targetY * width + targetX;
                    const tileId = data[index];
                    if (tileId >= 2048 && tileId < 8192) {
                        // This is an autotile, recalculate its shape
                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                        const result = this.calculateAutotileShape(baseTileId, targetX, targetY, null, layer);
                        if (result.tileId !== tileId) {
                            data[index] = result.tileId;
                            affectedTiles.add(`${targetX},${targetY},${layer}`);
                            recalcCount++;
                        }
                    }
                }
            }
        }

        // After painting, update neighboring autotiles that might need recalculation
        // This handles the case where we paint tiles one-by-one (single-tile brush)
        // and earlier tiles need to be updated when later tiles are placed
        const neighborsUpdated = new Set();
        for (const tile of selectedTiles) {
            const offsetX = tile.x - minX;
            const offsetY = tile.y - minY;
            const targetX = x + offsetX;
            const targetY = y + offsetY;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Update the 8 neighboring tiles (and the center tile itself)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = targetX + dx;
                        const ny = targetY + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const key = `${nx},${ny}`;
                            if (!neighborsUpdated.has(key)) {
                                neighborsUpdated.add(key);
                                // Check all layers for autotiles at this position
                                for (let layer = 0; layer <= 3; layer++) {
                                    const index = layer * layerSize + ny * width + nx;
                                    const tileId = data[index];
                                    if (tileId >= 2048 && tileId < 8192) {
                                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                                        const result = this.calculateAutotileShape(baseTileId, nx, ny, null, layer);
                                        if (result.tileId !== tileId) {
                                            data[index] = result.tileId;
                                            affectedTiles.add(`${nx},${ny},${layer}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Render the placed tiles immediately (with updated shapes)
        // PERFORMANCE: Use incremental update instead of full re-render
        const tilesToUpdate = [];
        for (const tileKey of affectedTiles) {
            const [x, y, layer] = tileKey.split(',').map(Number);
            tilesToUpdate.push({ x, y, layer });
        }
        this.tilemapManager.updateTiles(tilesToUpdate);
    }

    // Paint a single tile from the palette at a specific map position
    // skipAutotileUpdate: PERFORMANCE - set to true when doing batch operations (rectangle/circle)
    // to avoid expensive cascade updates. Caller must call updateNeighboringAutotiles manually after batch.
    paintSingleTileFromPalette(mapX, mapY, paletteTile, skipAutotileUpdate = false) {
        if (!this.tilemapManager.currentMap) return;

        const { width, height, data } = this.tilemapManager.currentMap;
        if (mapX < 0 || mapX >= width || mapY < 0 || mapY >= height) return;

        // Get the current layer from palette
        const currentLayer = this.tilesetPaletteViewer.currentLayer;
        const layerIndex = this.getLayerIndex(currentLayer);

        if (layerIndex === -1) {
            return;
        }

        const layerSize = width * height;

        // If eraser mode, erase tiles layer-aware
        if (this.eraserMode) {
            this.eraseTile(mapX, mapY, data, width, height, layerSize);
        } else {
            // Use the tile's stored layer (important for merged 'A' layer which stores A1-A5)
            const tileLayer = paletteTile.layer || currentLayer;

            // For autotiles, determine placement layer first
            const baseTileId = this.getBaseTileIdFromPalettePosition(paletteTile.x, paletteTile.y, tileLayer);

            // If tile ID is 0 (transparent), erase the tile instead of placing
            if (baseTileId === 0) {
                this.eraseTile(mapX, mapY, data, width, height, layerSize);
            } else {
                // Check if this is an autotile (A1-A5)
                const isAutotile = baseTileId >= 1536 && baseTileId < 8192;

                if (isAutotile) {
                    // Autotiles (A1-A5) placement rules:
                    // - Erase B-E tiles (layers 1-3)
                    // - Can stack on A1 or A2 tiles, but only 1 deep
                    // - A1 range: 2048-2815, A2 range: 2816-4351
                    const basePos = mapY * width + mapX;

                    // Shared MZ classification (image-transparency based for
                    // A2 — see classifyAutotile / isA2DecorationKind)
                    const cls = this.classifyAutotile(baseTileId);
                    const { isA1Water, isA1Decoration, isA2Decoration } = cls;

                    // Erase tiles based on what we're placing:
                    // - A1 water: erase layers 1-3 only
                    // - A1 decorations: erase B-E tiles only on layers 1-3
                    // - A2 decorations: erase B-E tiles only on layers 1-3 (stack on A2 ground)
                    // - A2 ground / A3-A5: erase layers 1-3 only
                    if (!isA1Water) {
                        if (isA1Decoration || isA2Decoration) {
                            // Decorations: only erase B-E tiles (1-1535) on layers 1-3
                            for (let layer = 1; layer <= 3; layer++) {
                                const layerIndex = layer * layerSize + basePos;
                                const tileId = data[layerIndex];
                                if (tileId > 0 && tileId < 1536) {
                                    data[layerIndex] = 0;
                                }
                            }
                        } else {
                            // Ground autotiles (A2 ground, A3-A5): erase layers 1-3 only
                            for (let layer = 1; layer <= 3; layer++) {
                                const layerIndex = layer * layerSize + basePos;
                                const tileId = data[layerIndex];
                                if (tileId > 0) {
                                    data[layerIndex] = 0;
                                }
                            }
                        }
                    } else {
                        // A1 water: erase layers 1-3
                        for (let layer = 1; layer <= 3; layer++) {
                            const layerIndex = layer * layerSize + basePos;
                            const tileId = data[layerIndex];
                            if (tileId > 0) {
                                data[layerIndex] = 0;
                            }
                        }
                    }

                    // Determine which layer this tile will be placed on
                    // (shared rules — see getAutotilePlacementLayer)
                    const actualPlacementLayer = this.getAutotilePlacementLayer(baseTileId, mapX, mapY);

                    // First, place the tile in map data with base shape so it's included in neighbor checks
                    const targetLayerIndex = actualPlacementLayer * layerSize + basePos;
                    data[targetLayerIndex] = baseTileId; // Base shape first

                    // NOW calculate the correct shape based on current map state (includes this tile)
                    const result = this.calculateAutotileShape(baseTileId, mapX, mapY, null, actualPlacementLayer);
                    const tileId = result.tileId;

                    // Update with the correctly shaped tile
                    data[targetLayerIndex] = tileId;

                    // PERFORMANCE: Skip autotile update if doing batch operation (caller will update once at end)
                    if (!skipAutotileUpdate) {
                        // Update all layers at this position using updateTiles
                        // This ensures erased layers are cleared and the new tile is rendered
                        const tilesToUpdate = [];
                        for (let layer = 0; layer <= 3; layer++) {
                            tilesToUpdate.push({ x: mapX, y: mapY, layer: layer });
                        }
                        this.tilemapManager.updateTiles(tilesToUpdate);

                        // Update neighboring autotiles after placing this tile
                        // A2 objects are transparent, so neighbors will see through them
                        this.updateNeighboringAutotiles(mapX, mapY);
                    }
                    // NOTE: Erased tiles will be updated by the batch update at the end (paintRectangle/paintCircle)
                    // which already includes all layers 0-3 for each painted position
                } else {
                    // For non-autotiles, calculate tile ID normally
                    const tileId = this.getTileIdFromPalettePosition(paletteTile.x, paletteTile.y, tileLayer, mapX, mapY);
                    // B-E tiles use the layering system (L1-L4)
                    const placementLayer = this.findAvailableLayer(data, width, height, mapX, mapY, layerIndex);

                    if (placementLayer === -2) {
                        // Auto mode: all 3 layers full, shift down and add new tile
                        this.shiftLayersDown(data, width, height, mapX, mapY, tileId);
                    } else if (placementLayer !== -1) {
                        // Place on the returned layer
                        const index = placementLayer * layerSize + mapY * width + mapX;
                        data[index] = tileId;
                        // B-E tiles don't affect autotile borders, so no update needed
                    }
                }
            }
        }
    }

    // Paint a rectangle of tiles
    paintRectangle(start, end) {
        if (!this.tilemapManager.currentMap) return;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        if (this.eraserMode) {
            const positions = [];
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    positions.push({ x, y });
                }
            }
            this.eraseTilesAtPositions(positions);
            return;
        }

        // Get selected tiles from palette
        const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
        if (!selectedTiles || selectedTiles.length === 0) {
                        return;
        }

        // Calculate the pattern dimensions
        const patternMinX = Math.min(...selectedTiles.map(t => t.x));
        const patternMaxX = Math.max(...selectedTiles.map(t => t.x));
        const patternMinY = Math.min(...selectedTiles.map(t => t.y));
        const patternMaxY = Math.max(...selectedTiles.map(t => t.y));
        const patternWidth = patternMaxX - patternMinX + 1;
        const patternHeight = patternMaxY - patternMinY + 1;

        // PERFORMANCE: Track all painted positions for batch autotile update and incremental rendering
        const paintedPositions = [];
        const affectedTiles = new Set(); // Track unique tiles for incremental update (format: "x,y,layer")

        // For each position in the rectangle, place the appropriate tile from the pattern
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                // Calculate which tile from the pattern to use (using modulo for tiling)
                const patternX = (x - minX) % patternWidth;
                const patternY = (y - minY) % patternHeight;

                // Find the tile at this position in the pattern
                const tile = selectedTiles.find(t =>
                    (t.x - patternMinX) === patternX &&
                    (t.y - patternMinY) === patternY
                );

                if (tile) {
                    // PERFORMANCE: Skip autotile updates during batch operation
                    this.paintSingleTileFromPalette(x, y, tile, true);
                    paintedPositions.push({x, y});

                    // Track all potentially affected layers for this position
                    // (paintSingleTileFromPalette can modify layers 0-3)
                    for (let layer = 0; layer <= 3; layer++) {
                        affectedTiles.add(`${x},${y},${layer}`);
                    }
                }
            }
        }

        // PERFORMANCE: After placing all tiles, recalculate autotile shapes
        // This is necessary because tiles are placed sequentially,
        // so early tiles don't see later tiles as neighbors during initial calculation
        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        let recalcCount = 0;

        for (const pos of paintedPositions) {
            const targetX = pos.x;
            const targetY = pos.y;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Check if we placed an autotile at this position
                for (let layer = 0; layer <= 3; layer++) {
                    const index = layer * layerSize + targetY * width + targetX;
                    const tileId = data[index];
                    if (tileId >= 2048 && tileId < 8192) {
                        // This is an autotile, recalculate its shape
                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                        const result = this.calculateAutotileShape(baseTileId, targetX, targetY, null, layer);
                        if (result.tileId !== tileId) {
                            data[index] = result.tileId;
                            affectedTiles.add(`${targetX},${targetY},${layer}`);
                            recalcCount++;
                        }
                    }
                }
            }
        }

        // After painting, update neighboring autotiles that might need recalculation
        const neighborsUpdated = new Set();
        for (const pos of paintedPositions) {
            const targetX = pos.x;
            const targetY = pos.y;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Update the 8 neighboring tiles (and the center tile itself)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = targetX + dx;
                        const ny = targetY + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const key = `${nx},${ny}`;
                            if (!neighborsUpdated.has(key)) {
                                neighborsUpdated.add(key);
                                // Check all layers for autotiles at this position
                                for (let layer = 0; layer <= 3; layer++) {
                                    const index = layer * layerSize + ny * width + nx;
                                    const tileId = data[index];
                                    if (tileId >= 2048 && tileId < 8192) {
                                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                                        const result = this.calculateAutotileShape(baseTileId, nx, ny, null, layer);
                                        if (result.tileId !== tileId) {
                                            data[index] = result.tileId;
                                            affectedTiles.add(`${nx},${ny},${layer}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // PERFORMANCE: Use incremental update instead of full re-render (1000x faster!)
        const tilesToUpdate = [];
        for (const tileKey of affectedTiles) {
            const [x, y, layer] = tileKey.split(',').map(Number);
            tilesToUpdate.push({ x, y, layer });
        }

        this.tilemapManager.updateTiles(tilesToUpdate);

        // Cache refresh happens inside updateTiles (updateCacheTexture in
        // place) — no uncache/recache flip needed here.
    }

    // Paint a circle of tiles
    paintCircle(start, end) {
        if (!this.tilemapManager.currentMap) return;

        const centerX = start.x;
        const centerY = start.y;
        const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

        const minX = Math.floor(centerX - radius);
        const maxX = Math.ceil(centerX + radius);
        const minY = Math.floor(centerY - radius);
        const maxY = Math.ceil(centerY + radius);

        if (this.eraserMode) {
            const positions = [];
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                    if (dist <= radius) {
                        positions.push({ x, y });
                    }
                }
            }
            this.eraseTilesAtPositions(positions);
            return;
        }

        // Get selected tiles from palette
        const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
        if (!selectedTiles || selectedTiles.length === 0) {
                        return;
        }

        // Calculate the pattern dimensions
        const patternMinX = Math.min(...selectedTiles.map(t => t.x));
        const patternMaxX = Math.max(...selectedTiles.map(t => t.x));
        const patternMinY = Math.min(...selectedTiles.map(t => t.y));
        const patternMaxY = Math.max(...selectedTiles.map(t => t.y));
        const patternWidth = patternMaxX - patternMinX + 1;
        const patternHeight = patternMaxY - patternMinY + 1;

        // PERFORMANCE: Track all painted positions for batch autotile update and incremental rendering
        const paintedPositions = [];
        const affectedTiles = new Set(); // Track unique tiles for incremental update (format: "x,y,layer")

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                if (dist <= radius) {
                    // Calculate which tile from the pattern to use (using modulo for tiling)
                    const patternX = (x - minX) % patternWidth;
                    const patternY = (y - minY) % patternHeight;

                    // Find the tile at this position in the pattern
                    const tile = selectedTiles.find(t =>
                        (t.x - patternMinX) === patternX &&
                        (t.y - patternMinY) === patternY
                    );

                    if (tile) {
                        // PERFORMANCE: Skip autotile updates during batch operation
                        this.paintSingleTileFromPalette(x, y, tile, true);
                        paintedPositions.push({x, y});

                        // Track all potentially affected layers for this position
                        // (paintSingleTileFromPalette can modify layers 0-3)
                        for (let layer = 0; layer <= 3; layer++) {
                            affectedTiles.add(`${x},${y},${layer}`);
                        }
                    }
                }
            }
        }

        // PERFORMANCE: After placing all tiles, recalculate autotile shapes
        // This is necessary because tiles are placed sequentially,
        // so early tiles don't see later tiles as neighbors during initial calculation
        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        let recalcCount = 0;

        for (const pos of paintedPositions) {
            const targetX = pos.x;
            const targetY = pos.y;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Check if we placed an autotile at this position
                for (let layer = 0; layer <= 3; layer++) {
                    const index = layer * layerSize + targetY * width + targetX;
                    const tileId = data[index];
                    if (tileId >= 2048 && tileId < 8192) {
                        // This is an autotile, recalculate its shape
                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                        const result = this.calculateAutotileShape(baseTileId, targetX, targetY, null, layer);
                        if (result.tileId !== tileId) {
                            data[index] = result.tileId;
                            affectedTiles.add(`${targetX},${targetY},${layer}`);
                            recalcCount++;
                        }
                    }
                }
            }
        }

        // After painting, update neighboring autotiles that might need recalculation
        const neighborsUpdated = new Set();
        for (const pos of paintedPositions) {
            const targetX = pos.x;
            const targetY = pos.y;

            if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
                // Update the 8 neighboring tiles (and the center tile itself)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = targetX + dx;
                        const ny = targetY + dy;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const key = `${nx},${ny}`;
                            if (!neighborsUpdated.has(key)) {
                                neighborsUpdated.add(key);
                                // Check all layers for autotiles at this position
                                for (let layer = 0; layer <= 3; layer++) {
                                    const index = layer * layerSize + ny * width + nx;
                                    const tileId = data[index];
                                    if (tileId >= 2048 && tileId < 8192) {
                                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                                        const result = this.calculateAutotileShape(baseTileId, nx, ny, null, layer);
                                        if (result.tileId !== tileId) {
                                            data[index] = result.tileId;
                                            affectedTiles.add(`${nx},${ny},${layer}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // PERFORMANCE: Use incremental update instead of full re-render (1000x faster!)
        const tilesToUpdate = [];
        for (const tileKey of affectedTiles) {
            const [x, y, layer] = tileKey.split(',').map(Number);
            tilesToUpdate.push({ x, y, layer });
        }

        this.tilemapManager.updateTiles(tilesToUpdate);

        // Cache refresh happens inside updateTiles (updateCacheTexture in
        // place) — no uncache/recache flip needed here.
    }

    // Fill an area with the selected tile (flood fill)
    fillArea(startX, startY) {
        if (!this.tilemapManager.currentMap) return;

        if (this.eraserMode) {
            this.eraseFillArea(startX, startY);
            return;
        }

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

        // Get palette coordinates for autotile shape calculation
        const tileLayer = selectedTiles[0].layer || currentLayer;
        const paletteX = selectedTiles[0].x;
        const paletteY = selectedTiles[0].y;

        // Flood fill algorithm (iterative)
        const stack = [{ x: startX, y: startY }];
        const visited = new Set();
        const filledPositions = []; // Track positions for neighbor updates
        const affectedTiles = new Set(); // PERFORMANCE: Track tiles for incremental update

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const index = layerIndex * layerSize + y * width + x;
            if (data[index] !== targetTileId) continue;

            visited.add(key);

            // Get base tile ID first (without shape calculation)
            const baseTileId = this.eraserMode ? 0 : this.getBaseTileIdFromPalettePosition(paletteX, paletteY, tileLayer);

            // If tile ID is 0 (transparent) or eraser mode, erase the tile instead of placing
            if (baseTileId === 0 || this.eraserMode) {
                this.eraseTile(x, y, data, width, height, layerSize);
                // Track all layers as potentially affected by erase
                for (let layer = 0; layer <= 3; layer++) {
                    affectedTiles.add(`${x},${y},${layer}`);
                }
            } else {
                // Check if this is an autotile (A1-A5)
                const isAutotile = baseTileId >= 1536 && baseTileId < 8192;

                if (isAutotile) {
                    // Shared MZ placement rules: decorations stack to the
                    // second A-slot, ground replaces layer 0 (the old fill
                    // stacked EVERYTHING to z1 — grass over grass at z1).
                    const basePos = y * width + x;
                    const cls = this.classifyAutotile(baseTileId);
                    const actualPlacementLayer = this.getAutotilePlacementLayer(baseTileId, x, y);

                    // Erase layers 1-3 (decorations spare existing A-tiles
                    // there, matching the paint paths)
                    for (let layer = 1; layer <= 3; layer++) {
                        const layerIdx = layer * layerSize + basePos;
                        if (layer === actualPlacementLayer) continue;
                        const t = data[layerIdx];
                        if (t > 0 && (!cls.isDecoration || t < 1536)) {
                            data[layerIdx] = 0;
                            affectedTiles.add(`${x},${y},${layer}`);
                        }
                    }

                    // Place base first so neighbor checks see it, then shape
                    const targetIdx = actualPlacementLayer * layerSize + basePos;
                    data[targetIdx] = baseTileId;
                    const result = this.calculateAutotileShape(baseTileId, x, y, null, actualPlacementLayer);
                    data[targetIdx] = result.tileId;
                    affectedTiles.add(`${x},${y},${actualPlacementLayer}`);
                    if (actualPlacementLayer === 1) affectedTiles.add(`${x},${y},0`);
                } else {
                    // For non-autotiles, calculate tile ID normally
                    const fillTileId = this.getTileIdFromPalettePosition(paletteX, paletteY, tileLayer, x, y);
                    // B-E tiles use the layering system (L1-L4)
                    data[index] = fillTileId;
                    affectedTiles.add(`${x},${y},${layerIndex}`);
                }
            }
            filledPositions.push({ x, y });

            // Add adjacent tiles
            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });
        }

        // PERFORMANCE: Use incremental update instead of full re-render (1000x faster!)
        const tilesToUpdate = [];
        for (const tileKey of affectedTiles) {
            const [x, y, layer] = tileKey.split(',').map(Number);
            tilesToUpdate.push({ x, y, layer });
        }
        this.tilemapManager.updateTiles(tilesToUpdate);

        // Tiles already have correct shapes - no neighbor updates needed
    }

    // Show preview for rectangle/circle tools
    showPreview(start, current) {
        if (!this.previewLayer) {
            return;
        }

        // Clear previous preview
        this.previewLayer.clear();
        this.previewLayer.removeChildren();

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;

        if (this.currentTool === 'rectangle') {
            const minX = Math.min(start.x, current.x);
            const maxX = Math.max(start.x, current.x);
            const minY = Math.min(start.y, current.y);
            const maxY = Math.max(start.y, current.y);

            // Draw outline of rectangle
            this.previewLayer.rect(
                minX * tileWidth,
                minY * tileHeight,
                (maxX - minX + 1) * tileWidth,
                (maxY - minY + 1) * tileHeight
            );
            this.previewLayer.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

            if (this.eraserMode) {
                return;
            }

            // Try to draw tile preview
            try {
                const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
                if (selectedTiles && selectedTiles.length > 0) {
                    const patternMinX = Math.min(...selectedTiles.map(t => t.x));
                    const patternMaxX = Math.max(...selectedTiles.map(t => t.x));
                    const patternMinY = Math.min(...selectedTiles.map(t => t.y));
                    const patternMaxY = Math.max(...selectedTiles.map(t => t.y));
                    const patternWidth = patternMaxX - patternMinX + 1;
                    const patternHeight = patternMaxY - patternMinY + 1;
                    const currentLayer = this.tilesetPaletteViewer.currentLayer;

                    // Build preview pattern map for autotile shape calculation
                    const previewPattern = new Set();
                    for (let y = minY; y <= maxY; y++) {
                        for (let x = minX; x <= maxX; x++) {
                            previewPattern.add(`${x},${y}`);
                        }
                    }

                    // Draw each tile in the pattern preview
                    for (let y = minY; y <= maxY; y++) {
                        for (let x = minX; x <= maxX; x++) {
                            const patternX = (x - minX) % patternWidth;
                            const patternY = (y - minY) % patternHeight;

                            const tile = selectedTiles.find(t =>
                                (t.x - patternMinX) === patternX &&
                                (t.y - patternMinY) === patternY
                            );

                            if (tile) {
                                this.drawPreviewTile(x, y, tile, currentLayer, previewPattern);
                            }
                        }
                    }
                }
            } catch (e) {
                // Failed to draw tile preview
            }
        } else if (this.currentTool === 'circle') {
            const centerX = start.x;
            const centerY = start.y;
            const radius = Math.sqrt(
                Math.pow(current.x - start.x, 2) + Math.pow(current.y - start.y, 2)
            );

            if (this.eraserMode) {
                const minX = Math.floor(centerX - radius);
                const maxX = Math.ceil(centerX + radius);
                const minY = Math.floor(centerY - radius);
                const maxY = Math.ceil(centerY + radius);
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                        if (dist <= radius) {
                            const borderGraphics = new PIXI.Graphics();
                            borderGraphics.rect(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
                            borderGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
                            this.previewLayer.addChild(borderGraphics);
                        }
                    }
                }
                return;
            }

            // Try to draw tile preview and track tiles for border
            const tilesInCircle = [];
            try {
                const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
                if (selectedTiles && selectedTiles.length > 0) {
                    const patternMinX = Math.min(...selectedTiles.map(t => t.x));
                    const patternMaxX = Math.max(...selectedTiles.map(t => t.x));
                    const patternMinY = Math.min(...selectedTiles.map(t => t.y));
                    const patternMaxY = Math.max(...selectedTiles.map(t => t.y));
                    const patternWidth = patternMaxX - patternMinX + 1;
                    const patternHeight = patternMaxY - patternMinY + 1;
                    const currentLayer = this.tilesetPaletteViewer.currentLayer;

                    const minX = Math.floor(centerX - radius);
                    const maxX = Math.ceil(centerX + radius);
                    const minY = Math.floor(centerY - radius);
                    const maxY = Math.ceil(centerY + radius);

                    // Build preview pattern map for autotile shape calculation
                    const previewPattern = new Set();
                    for (let y = minY; y <= maxY; y++) {
                        for (let x = minX; x <= maxX; x++) {
                            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                            if (dist <= radius) {
                                previewPattern.add(`${x},${y}`);
                            }
                        }
                    }

                    // Draw each tile in the pattern preview
                    for (let y = minY; y <= maxY; y++) {
                        for (let x = minX; x <= maxX; x++) {
                            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                            if (dist <= radius) {
                                tilesInCircle.push({ x, y });
                                const patternX = (x - minX) % patternWidth;
                                const patternY = (y - minY) % patternHeight;

                                const tile = selectedTiles.find(t =>
                                    (t.x - patternMinX) === patternX &&
                                    (t.y - patternMinY) === patternY
                                );

                                if (tile) {
                                    this.drawPreviewTile(x, y, tile, currentLayer, previewPattern);
                                }
                            }
                        }
                    }

                    // Draw borders around each tile in the "boxy circle"
                    for (const tilePos of tilesInCircle) {
                        const borderGraphics = new PIXI.Graphics();
                        borderGraphics.rect(
                            tilePos.x * tileWidth,
                            tilePos.y * tileHeight,
                            tileWidth,
                            tileHeight
                        );
                        borderGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
                        this.previewLayer.addChild(borderGraphics);
                    }
                }
            } catch (e) {
                // Failed to draw tile preview
            }
        }
    }

    clearPreview() {
        if (this.previewLayer) {
            this.previewLayer.clear();
            this.previewLayer.removeChildren();
        }
    }

    // Draw a single tile in the preview layer
    drawPreviewTile(mapX, mapY, paletteTile, layer, previewPattern = null) {
        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;

        // Get the tile layer (important for merged 'A' layer)
        const tileLayer = paletteTile.layer || layer;

        // Get tileset texture for this layer
        const tilesetTexture = this.tilesetPaletteViewer.tilesetTextures[tileLayer];
        if (!tilesetTexture) return;

        // Draw a background border (add first so it renders behind the sprite)
        const borderGraphics = new PIXI.Graphics();
        borderGraphics.rect(mapX * tileWidth, mapY * tileHeight, tileWidth, tileHeight);
        borderGraphics.fill({ color: 0xffffff, alpha: 0.3 }); // White semi-transparent background
        this.previewLayer.addChild(borderGraphics);

        // For autotiles with preview pattern, calculate proper shape based on neighbors in pattern
        if (previewPattern && ['A1', 'A2', 'A3', 'A4'].includes(tileLayer)) {
            // Get the base tile ID
            const baseTileId = this.getBaseTileIdFromPalettePosition(paletteTile.x, paletteTile.y, tileLayer);

            // The preview must match what painting will produce: same
            // target z-slot, and neighbor checks that see BOTH the pattern
            // and the real map (isSameKindTile falls through to the map
            // for cells outside the pattern).
            const placeLayer = this.getAutotilePlacementLayer(baseTileId, mapX, mapY);
            const shapeResult = this.calculateAutotileShape(baseTileId, mapX, mapY, previewPattern, placeLayer);
            const tileId = shapeResult.tileId;

            // Render the autotile preview using the same 4-subtile approach as TilemapManager
            this.renderAutotilePreview(tileId, mapX, mapY, tilesetTexture);
        } else {
            // Use getTileTextureFromPalette for A1 or non-autotiles or when no pattern provided
            const texture = this.getTileTextureFromPalette(paletteTile.x, paletteTile.y, tileLayer, tilesetTexture);
            if (!texture) return;

            const sprite = new PIXI.Sprite(texture);
            sprite.x = mapX * tileWidth;
            sprite.y = mapY * tileHeight;
            sprite.alpha = 0.7; // Semi-transparent for preview

            this.previewLayer.addChild(sprite);
        }
    }

    // Render autotile preview into a container (for hover preview)
    renderAutotilePreviewToContainer(tileId, container, tilesetTexture) {
        try {
            const tileWidth = this.tilemapManager.TILE_WIDTH;
            const tileHeight = this.tilemapManager.TILE_HEIGHT;
            const kind = this.tilemapManager.getAutotileKind(tileId);
            const shape = this.tilemapManager.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let bx = 0;
        let by = 0;
        let autotileTable = this.tilemapManager.FLOOR_AUTOTILE_TABLE;

        // Determine position based on tile type (simplified without animation)
        if (this.tilemapManager.isTileA1(tileId)) {
            // A1 - use frame 0 for preview (no animation)
            if (kind === 0) {
                bx = 0; by = 0;
            } else if (kind === 1) {
                bx = 0; by = 3;
            } else if (kind === 2) {
                bx = 6; by = 0;
            } else if (kind === 3) {
                bx = 6; by = 3;
            } else if (kind === 4) {
                bx = 0; by = 6;
            } else if (kind === 5) {
                bx = 6; by = 6;
            } else if (kind === 6) {
                bx = 0; by = 9;
            } else if (kind === 7) {
                bx = 6; by = 9;
            } else {
                // Kinds 8-15
                bx = Math.floor(tx / 4) * 8;
                by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
                if (kind % 2 === 1) {
                    bx += 6;
                    autotileTable = this.tilemapManager.WATERFALL_AUTOTILE_TABLE;
                }
            }
        } else if (this.tilemapManager.isTileA2(tileId)) {
            // A2
            bx = tx * 2;
            by = (ty - 2) * 3;
        } else if (this.tilemapManager.isTileA3(tileId)) {
            // A3
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = this.tilemapManager.WALL_AUTOTILE_TABLE;
        } else if (this.tilemapManager.isTileA4(tileId)) {
            // A4: 8 cols × 6 rows. Even rows: Roofs (2×3), Odd rows: Walls (2×2)
            bx = tx * 2;
            const rowInA4 = ty - 10;
            const pairIndex = Math.floor(rowInA4 / 2);
            const isWall = rowInA4 % 2 === 1;
            // For roofs: extract rows 0-1 of the 2x3 block
            by = pairIndex * 5 + (isWall ? 3 : 0);
            // A4 walls use WALL_AUTOTILE_TABLE (16 shapes), roofs use FLOOR_AUTOTILE_TABLE (48 shapes)
            autotileTable = isWall ? this.tilemapManager.WALL_AUTOTILE_TABLE : this.tilemapManager.FLOOR_AUTOTILE_TABLE;
        }

        if (!tilesetTexture) return;

        // Get the autotile pattern from the table
        const table = autotileTable[shape];
        if (!table) return;

        // Convert HTML image to PIXI texture if needed
        const baseTexture = tilesetTexture instanceof HTMLImageElement
            ? PIXI.Texture.from(tilesetTexture)
            : tilesetTexture;

        const w1 = tileWidth / 2;
        const h1 = tileHeight / 2;

        // Render all 4 sub-tiles at relative position (0, 0)
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1;
            const dx1 = (i % 2) * w1;
            const dy1 = Math.floor(i / 2) * h1;

            const subTexture = new PIXI.Texture({
                source: baseTexture.source,
                frame: new PIXI.Rectangle(sx1, sy1, w1, h1)
            });

            const sprite = new PIXI.Sprite(subTexture);
            sprite.x = dx1;
            sprite.y = dy1;
            sprite.alpha = 0.7;
            container.addChild(sprite);
        }
        } catch (error) {
            // Error in renderAutotilePreviewToContainer
        }
    }

    // Render autotile preview with 4 sub-tiles (adapted from TilemapManager.renderAutotile)
    renderAutotilePreview(tileId, mapX, mapY, tilesetTexture) {
        try {
            const tileWidth = this.tilemapManager.TILE_WIDTH;
            const tileHeight = this.tilemapManager.TILE_HEIGHT;
            const kind = this.tilemapManager.getAutotileKind(tileId);
            const shape = this.tilemapManager.getAutotileShape(tileId);
        const tx = kind % 8;
        const ty = Math.floor(kind / 8);
        let bx = 0;
        let by = 0;
        let autotileTable = this.tilemapManager.FLOOR_AUTOTILE_TABLE;

        // Determine position based on tile type (simplified without animation)
        if (this.tilemapManager.isTileA1(tileId)) {
            // A1 - use EXACT same logic as RPG Maker MZ corescript (frame 0 for preview)
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
                    bx += 0; // waterSurfaceIndex=0
                } else {
                    bx += 6;
                    autotileTable = this.tilemapManager.WATERFALL_AUTOTILE_TABLE;
                }
            }
        } else if (this.tilemapManager.isTileA2(tileId)) {
            // A2
            bx = tx * 2;
            by = (ty - 2) * 3;
        } else if (this.tilemapManager.isTileA3(tileId)) {
            // A3
            bx = tx * 2;
            by = (ty - 6) * 2;
            autotileTable = this.tilemapManager.WALL_AUTOTILE_TABLE;
        } else if (this.tilemapManager.isTileA4(tileId)) {
            // A4: 8 cols × 6 rows. Even rows: Roofs (2×3), Odd rows: Walls (2×2)
            bx = tx * 2;
            const rowInA4 = ty - 10;
            const pairIndex = Math.floor(rowInA4 / 2);
            const isWall = rowInA4 % 2 === 1;
            // For roofs: extract rows 0-1 of the 2x3 block
            by = pairIndex * 5 + (isWall ? 3 : 0);
            // A4 walls use WALL_AUTOTILE_TABLE (16 shapes), roofs use FLOOR_AUTOTILE_TABLE (48 shapes)
            autotileTable = isWall ? this.tilemapManager.WALL_AUTOTILE_TABLE : this.tilemapManager.FLOOR_AUTOTILE_TABLE;
        }

        if (!tilesetTexture) return;

        // Get the autotile pattern from the table
        const table = autotileTable[shape];
        if (!table) return;

        // Convert HTML image to PIXI texture if needed
        const baseTexture = tilesetTexture instanceof HTMLImageElement
            ? PIXI.Texture.from(tilesetTexture)
            : tilesetTexture;

        const w1 = tileWidth / 2;
        const h1 = tileHeight / 2;

        // Render all 4 sub-tiles (24x24 each)
        for (let i = 0; i < 4; i++) {
            const qsx = table[i][0];
            const qsy = table[i][1];
            const sx1 = (bx * 2 + qsx) * w1;
            const sy1 = (by * 2 + qsy) * h1;
            const dx1 = mapX * tileWidth + (i % 2) * w1;
            const dy1 = mapY * tileHeight + Math.floor(i / 2) * h1;

            const subTexture = new PIXI.Texture({
                source: baseTexture.source,
                frame: new PIXI.Rectangle(sx1, sy1, w1, h1)
            });

            const sprite = new PIXI.Sprite(subTexture);
            sprite.x = dx1;
            sprite.y = dy1;
            sprite.alpha = 0.7;
            this.previewLayer.addChild(sprite);
        }
        } catch (error) {
            // Error in renderAutotilePreview
        }
    }

    // Update tile preview at mouse position
    updateTilePreview(tileX, tileY) {
        if (!this.tilePreviewContainer || !this.tilemapManager) {
            return;
        }

        // Handle shadow pen preview - need to check quadrant too
        if (this.shadowPenMode && this.lastMousePos) {
            // Calculate which quadrant of the tile the mouse is in
            const localX = this.lastMousePos.x - (tileX * this.tilemapManager.TILE_WIDTH);
            const localY = this.lastMousePos.y - (tileY * this.tilemapManager.TILE_HEIGHT);
            const halfTile = this.tilemapManager.TILE_WIDTH / 2; // 24 pixels

            // Determine quadrant based on how rendering works:
            // The rendering uses i % 2 for x and Math.floor(i / 2) for y
            // So: i=0 is (0,0) top-left, i=1 is (1,0) top-right, i=2 is (0,1) bottom-left, i=3 is (1,1) bottom-right
            const quadX = localX < halfTile ? 0 : 1;  // 0 = left, 1 = right
            const quadY = localY < halfTile ? 0 : 1;  // 0 = top, 1 = bottom
            const quadrant = quadY * 2 + quadX;  // 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right

            // PERFORMANCE: Skip if preview is already at this tile position AND quadrant
            if (this.lastPreviewTile.x === tileX && this.lastPreviewTile.y === tileY && this.lastPreviewTile.quadrant === quadrant) {
                return;
            }

            // Update last preview position
            this.lastPreviewTile.x = tileX;
            this.lastPreviewTile.y = tileY;
            this.lastPreviewTile.quadrant = quadrant;

            // Clear existing preview
            this.tilePreviewContainer.removeChildren();

            const container = new PIXI.Container();
            container.x = tileX * this.tilemapManager.TILE_WIDTH;
            container.y = tileY * this.tilemapManager.TILE_HEIGHT;

            // Draw 24x24 semi-transparent shadow square in the hovered quadrant
            const shadowGraphic = new PIXI.Graphics();
            const quadOffsetX = (quadrant % 2) * halfTile;
            const quadOffsetY = Math.floor(quadrant / 2) * halfTile;

            shadowGraphic.rect(quadOffsetX, quadOffsetY, halfTile, halfTile);
            shadowGraphic.fill({ color: 0x000000, alpha: 0.48 });
            shadowGraphic.stroke({ color: 0xFFFFFF, width: 1, alpha: 0.6 });
            container.addChild(shadowGraphic);

            this.tilePreviewContainer.addChild(container);
            this.tilePreviewContainer.visible = true;
            return;
        }

        // PERFORMANCE: Skip if preview is already at this tile position (for non-shadow modes)
        if (this.lastPreviewTile.x === tileX && this.lastPreviewTile.y === tileY) {
            return;
        }

        // Update last preview position
        this.lastPreviewTile.x = tileX;
        this.lastPreviewTile.y = tileY;
        this.lastPreviewTile.quadrant = -1; // Reset quadrant for non-shadow modes

        // Clear existing preview
        this.tilePreviewContainer.removeChildren();

        if (this.eraserMode) {
            const outlineGraphics = new PIXI.Graphics();
            outlineGraphics.rect(
                tileX * this.tilemapManager.TILE_WIDTH,
                tileY * this.tilemapManager.TILE_HEIGHT,
                this.tilemapManager.TILE_WIDTH,
                this.tilemapManager.TILE_HEIGHT
            );
            outlineGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
            this.tilePreviewContainer.addChild(outlineGraphics);
            this.tilePreviewContainer.visible = true;
            return;
        }

        // Get the current layer from palette
        const currentLayer = this.tilesetPaletteViewer.currentLayer;

        // Handle region preview
        if (currentLayer === 'R') {
            if (!this.regionManager || !this.regionManager.selectedTiles || this.regionManager.selectedTiles.length === 0) {
                this.tilePreviewContainer.visible = false;
                return;
            }

            const selectedRegion = this.regionManager.selectedRegion;
            const color = this.regionManager.regionColors[selectedRegion];

            // Create region preview
            const container = new PIXI.Container();
            container.x = tileX * this.tilemapManager.TILE_WIDTH;
            container.y = tileY * this.tilemapManager.TILE_HEIGHT;

            // Draw colored rectangle with border
            const regionGraphic = new PIXI.Graphics();
            regionGraphic.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
            regionGraphic.fill({ color: color, alpha: 0.5 });
            regionGraphic.stroke({ color: color, width: 2, alpha: 0.8 });
            container.addChild(regionGraphic);

            // Add region number text (bigger and fully opaque)
            const text = new PIXI.Text({
                text: selectedRegion.toString(),
                style: {
                    fontFamily: 'Arial',
                    fontSize: 18,
                    fontWeight: 'bold',
                    fill: 0xFFFFFF,
                    stroke: { color: 0x000000, width: 4, join: 'round' }
                }
            });
            text.anchor.set(0.5, 0.5);
            text.x = this.tilemapManager.TILE_WIDTH / 2;
            text.y = this.tilemapManager.TILE_HEIGHT / 2;
            container.addChild(text);

            this.tilePreviewContainer.addChild(container);
            this.tilePreviewContainer.visible = true;
            return;
        }

        // Get selected tiles from palette
        const selectedTiles = this.tilesetPaletteViewer.selectedTiles;
        if (!selectedTiles || selectedTiles.length === 0) {
            this.tilePreviewContainer.visible = false;
            return;
        }

        // Calculate selection bounds
        const minX = Math.min(...selectedTiles.map(t => t.x));
        const minY = Math.min(...selectedTiles.map(t => t.y));
        const maxX = Math.max(...selectedTiles.map(t => t.x));
        const maxY = Math.max(...selectedTiles.map(t => t.y));

        // The selection footprint acts as the autotile pattern, so a 2x2
        // water selection previews with connected inner edges.
        const hoverPattern = new Set();
        for (const t of selectedTiles) {
            hoverPattern.add(`${tileX + (t.x - minX)},${tileY + (t.y - minY)}`);
        }
        const map = this.tilemapManager.currentMap;

        // Create preview for each selected tile
        for (const tile of selectedTiles) {
            const offsetX = tile.x - minX;
            const offsetY = tile.y - minY;

            const container = new PIXI.Container();
            container.x = (tileX + offsetX) * this.tilemapManager.TILE_WIDTH;
            container.y = (tileY + offsetY) * this.tilemapManager.TILE_HEIGHT;

            // Draw a background border (add first so it renders behind the sprite)
            const borderGraphics = new PIXI.Graphics();
            borderGraphics.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
            borderGraphics.fill({ color: 0xffffff, alpha: 0.3 }); // White semi-transparent background
            container.addChild(borderGraphics);

            // Get the appropriate layer and texture
            const currentLayer = this.tilesetPaletteViewer.currentLayer;
            // For merged 'A' layer, use the tile's specific layer property
            const layerToUse = (currentLayer === 'A' && tile.layer) ? tile.layer : currentLayer;
            const tilesetTexture = this.tilesetPaletteViewer.tilesetTextures[layerToUse];

            // Try to show actual tile texture if available
            if (tilesetTexture) {
                const px = tileX + offsetX;
                const py = tileY + offsetY;
                const isAutotileLayer = ['A1', 'A2', 'A3', 'A4'].includes(layerToUse);
                const baseTileId = isAutotileLayer
                    ? this.getBaseTileIdFromPalettePosition(tile.x, tile.y, layerToUse)
                    : 0;

                if (baseTileId >= 2048 && baseTileId < 8192 && map &&
                    px >= 0 && px < map.width && py >= 0 && py < map.height) {
                    // Autotile: preview the EXACT tile that placement will
                    // produce — same target z-slot, same shape, neighbors
                    // from both the selection footprint and the real map.
                    const placeLayer = this.getAutotilePlacementLayer(baseTileId, px, py);
                    const shapeResult = this.calculateAutotileShape(baseTileId, px, py, hoverPattern, placeLayer);
                    const auto = new PIXI.Container();
                    auto.alpha = 0.7;
                    this.renderAutotilePreviewToContainer(shapeResult.tileId, auto, tilesetTexture);
                    container.addChild(auto);
                } else {
                    const tileTexture = this.getTileTextureFromPalette(tile.x, tile.y, layerToUse, tilesetTexture);
                    if (tileTexture) {
                        const sprite = new PIXI.Sprite(tileTexture);
                        sprite.alpha = 0.7; // Semi-transparent preview
                        container.addChild(sprite);
                    }
                }
            }

            this.tilePreviewContainer.addChild(container);
        }

        // Draw a single white border around the entire selection
        const selectionWidth = (maxX - minX + 1) * this.tilemapManager.TILE_WIDTH;
        const selectionHeight = (maxY - minY + 1) * this.tilemapManager.TILE_HEIGHT;
        const outlineGraphics = new PIXI.Graphics();
        outlineGraphics.rect(
            tileX * this.tilemapManager.TILE_WIDTH,
            tileY * this.tilemapManager.TILE_HEIGHT,
            selectionWidth,
            selectionHeight
        );
        outlineGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 }); // White border
        this.tilePreviewContainer.addChild(outlineGraphics);

        this.tilePreviewContainer.visible = true;
    }

    // Get texture for a tile from the palette
    getTileTextureFromPalette(x, y, layer, tilesetTexture) {
        const tileSize = 48; // RPG Maker tile size

        // Calculate source position in tileset based on layer type
        // MUST match TilesetPaletteViewer.js drawAutotilePreview logic exactly
        let srcX, srcY;

        if (['A1', 'A2', 'A3', 'A4'].includes(layer)) {
            // Calculate kindIndex from palette grid coordinates
            let gridCols, kindIndex;

            if (layer === 'A1') {
                gridCols = 8;
                const kind = y * gridCols + x;
                const tx = kind % 8;
                const ty = Math.floor(kind / 8);
                let bx, by;

                // Use EXACT same logic as RPG Maker MZ corescript
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
                        bx += 0; // waterSurfaceIndex=0
                    } else {
                        bx += 6;
                    }
                }

                // bx/by are in FULL-tile units: the corescript samples at
                // (bx*2 + qsx) half-tiles, i.e. bx*48 px. The old *24 here
                // sampled the middle of the water block — lily pads
                // previewed as the water corner-dots tile.
                srcX = bx * 48;
                srcY = by * 48;
            } else if (layer === 'A2') {
                // A2: Ground autotiles (8 columns × 4 rows of 2x3 blocks)
                // x,y are palette grid coordinates - extract top-left preview tile from 2x3 block
                srcX = x * tileSize * 2;  // Each block is 2 tiles (96px) wide
                srcY = y * tileSize * 3;  // Each block is 3 tiles (144px) tall
            } else if (layer === 'A3') {
                // A3: Building/wall autotiles (8 columns × 4 rows of 2x2 blocks)
                // x,y are palette grid coordinates - extract top-left preview tile from 2x2 block
                srcX = x * tileSize * 2;  // Each block is 2 tiles (96px) wide
                srcY = y * tileSize * 2;  // Each block is 2 tiles (96px) tall
            } else if (layer === 'A4') {
                // A4: Wall and roof autotiles (8 columns × 6 rows)
                // Even rows: Roofs (2×3), Odd rows: Walls (2×2)
                srcX = x * tileSize * 2;  // Each block is 2 tiles (96px) wide

                // Calculate Y position: roofs are 3 tiles tall, walls are 2 tiles tall
                const pairIndex = Math.floor(y / 2);
                const isWall = y % 2 === 1;
                srcY = pairIndex * tileSize * 5 + (isWall ? tileSize * 3 : 0);
            }
        } else if (layer === 'A5') {
            // A5 layer - direct mapping
            srcX = x * tileSize;
            srcY = y * tileSize;
        } else if (['B', 'C', 'D', 'E'].includes(layer)) {
            // Regular tiles - handle split layout
            // For split layers, x >= 8 means right half of original image
            if (x >= 8) {
                srcX = (x - 8) * tileSize + (tilesetTexture.width / 2);
                srcY = y * tileSize;
            } else {
                srcX = x * tileSize;
                srcY = y * tileSize;
            }
        } else {
            return null;
        }

        // Create a texture from the tileset image using PIXI v8 API
        try {
            // Convert HTML image to PIXI texture if needed
            const baseTexture = tilesetTexture instanceof HTMLImageElement
                ? PIXI.Texture.from(tilesetTexture)
                : tilesetTexture;

            const newTexture = new PIXI.Texture({
                source: baseTexture.source,
                frame: new PIXI.Rectangle(srcX, srcY, tileSize, tileSize)
            });
            return newTexture;
        } catch (error) {
            return null;
        }
    }

    hideTilePreview() {
        if (this.tilePreviewContainer) {
            this.tilePreviewContainer.visible = false;
        }
        // PERFORMANCE: Reset tracking so next preview will be created
        this.lastPreviewTile = { x: -1, y: -1, quadrant: -1 };
    }

    // Find available layer for tile placement (supports stacking up to 3 layers deep)
    findAvailableLayer(data, width, height, x, y, preferredLayer) {
        const layerSize = width * height;
        const basePos = y * width + x;
        const maxStackLayers = 3;

        // If manual layer selection, try to place on that specific layer
        if (this.layerMode !== 'auto') {
            const targetLayer = this.layerMode;
            const targetIndex = targetLayer * layerSize + basePos;

            // If the target layer is empty, use it
            if (data[targetIndex] === 0) {
                return targetLayer;
            }

            // Layer is occupied - replace it (overwrite mode for manual selection)
            return targetLayer;
        }

        // Auto mode: smart stacking
        // Try preferred layer first
        const preferredIndex = preferredLayer * layerSize + basePos;
        if (data[preferredIndex] === 0) {
            return preferredLayer;
        }

        // IMPORTANT: B-E tiles (layers 1-4) should NEVER be placed on layer 0 (A layer)
        // Only search from the preferred layer upwards, not downwards
        // This ensures layer separation: A tiles on layer 0, B-E tiles on layers 1+
        const searchStart = preferredLayer; // Start from preferred layer, not from 0!
        for (let layer = searchStart; layer < maxStackLayers + 1; layer++) {
            const index = layer * layerSize + basePos;
            if (data[index] === 0) {
                return layer;
            }
        }

        // All layers from preferred upwards are occupied
        // Return -2 to trigger layer shifting/stacking
        return -2;
    }

    // Shift B-E tile layers down at a position (preserves layer 0, shifts 2→1, 3→2, places new tile at layer 3)
    // This allows stacking up to 4 layers: layer 0 (autotiles) + layers 1-3 (B-E tiles)
    shiftLayersDown(data, width, height, x, y, newTileId) {
        const layerSize = width * height;
        const basePos = y * width + x;

        // Only A5 tiles should erase autotiles below them (for water borders)
        // B-E tiles should never erase A-layer tiles
        const isNewTileAutotile = newTileId >= 2048 && newTileId < 8192;
        const isA5Tile = newTileId >= 1536 && newTileId < 2048;

        // If placing A5 tile, erase any autotiles before shifting
        if (isA5Tile) {
            // Check all 3 layers for autotiles and erase them
            for (let layer = 0; layer < 3; layer++) {
                const tileId = data[layer * layerSize + basePos];
                if (tileId >= 2048 && tileId < 8192) {
                    data[layer * layerSize + basePos] = 0;
                }
            }
        }

        // Shift B-E tile layers: layer 2 → layer 1, layer 3 → layer 2
        // Layer 0 is preserved (contains autotiles A1-A5)
        // The oldest B-E tile on layer 1 is discarded to make room
        data[1 * layerSize + basePos] = data[2 * layerSize + basePos];
        data[2 * layerSize + basePos] = data[3 * layerSize + basePos];

        // Place new tile on layer 3 (topmost B-E layer)
        data[3 * layerSize + basePos] = newTileId;
        // B-E tiles don't affect autotile borders, so no update needed
    }

    // Erase a tile at the specified position (layer-aware)
    eraseTile(x, y, data, width, height, layerSize) {
        const basePos = y * width + x;

        if (this.layerMode === 'auto') {
            // Auto erase should target the topmost actual tile, not the current
            // palette tab. Imported maps often have existing base tiles on layer 0.
            for (let layer = 3; layer >= 0; layer--) {
                const index = layer * layerSize + basePos;
                if (data[index] !== 0) {
                    data[index] = 0;
                    return [layer];
                }
            }
        } else {
            // Manual layer mode: erase only the selected layer
            const targetLayer = this.layerMode;
            if (targetLayer >= 0 && targetLayer <= 3) {
                const index = targetLayer * layerSize + basePos;
                if (data[index] !== 0) {
                    data[index] = 0;
                    return [targetLayer];
                }
            }
        }

        return [];
    }

    eraseTilesAtPositions(positions) {
        if (!this.tilemapManager.currentMap) return 0;

        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        const affectedTiles = new Set();
        const erasedPositions = [];
        const visited = new Set();

        for (const pos of positions) {
            const x = pos.x;
            const y = pos.y;
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const erasedLayers = this.eraseTile(x, y, data, width, height, layerSize);
            if (erasedLayers.length > 0) {
                erasedPositions.push({ x, y });
                for (let layer = 0; layer <= 3; layer++) {
                    affectedTiles.add(`${x},${y},${layer}`);
                }
            }
        }

        if (affectedTiles.size === 0) return 0;

        const tilesToUpdate = [];
        for (const tileKey of affectedTiles) {
            const [x, y, layer] = tileKey.split(',').map(Number);
            tilesToUpdate.push({ x, y, layer });
        }
        this.tilemapManager.updateTiles(tilesToUpdate);

        for (const pos of erasedPositions) {
            this.updateNeighboringAutotiles(pos.x, pos.y);
        }

        return erasedPositions.length;
    }

    getEraseTargetAt(x, y, data, width, layerSize) {
        const basePos = y * width + x;

        if (this.layerMode === 'auto') {
            for (let layer = 3; layer >= 0; layer--) {
                const tileId = data[layer * layerSize + basePos];
                if (tileId !== 0) {
                    return { layer, tileId };
                }
            }
        } else if (this.layerMode >= 0 && this.layerMode <= 3) {
            const tileId = data[this.layerMode * layerSize + basePos];
            if (tileId !== 0) {
                return { layer: this.layerMode, tileId };
            }
        }

        return null;
    }

    eraseFillArea(startX, startY) {
        if (!this.tilemapManager.currentMap) return 0;

        const { width, height, data } = this.tilemapManager.currentMap;
        if (startX < 0 || startX >= width || startY < 0 || startY >= height) return 0;

        const layerSize = width * height;
        const target = this.getEraseTargetAt(startX, startY, data, width, layerSize);
        if (!target) return 0;

        const stack = [{ x: startX, y: startY }];
        const visited = new Set();
        const positions = [];

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const current = this.getEraseTargetAt(x, y, data, width, layerSize);
            if (!current || current.layer !== target.layer || current.tileId !== target.tileId) {
                continue;
            }

            positions.push({ x, y });
            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });
        }

        return this.eraseTilesAtPositions(positions);
    }

    // Toggle shadow on any tile quadrant
    toggleShadow(x, y, data, width, height, layerSize, mousePos) {
        const shadowLayerIndex = 4 * layerSize + y * width + x;

        // Calculate which quadrant of the tile was clicked
        if (!mousePos) return;

        const localX = mousePos.x - (x * this.tilemapManager.TILE_WIDTH);
        const localY = mousePos.y - (y * this.tilemapManager.TILE_HEIGHT);
        const halfTile = this.tilemapManager.TILE_WIDTH / 2;

        // Determine quadrant based on how rendering works:
        // i=0 is (0,0) top-left, i=1 is (1,0) top-right, i=2 is (0,1) bottom-left, i=3 is (1,1) bottom-right
        const quadX = localX < halfTile ? 0 : 1;  // 0 = left, 1 = right
        const quadY = localY < halfTile ? 0 : 1;  // 0 = top, 1 = bottom
        const quadrant = quadY * 2 + quadX;  // 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right
        const quadrantBit = 1 << quadrant;

        // Get current shadow value (0-15, a 4-bit bitmask)
        const currentShadow = data[shadowLayerIndex] || 0;

        // On first click of a drag operation, determine if we're adding or removing
        if (this.shadowPaintMode === null) {
            // Toggle: if quadrant has shadow, we'll be removing; otherwise adding
            this.shadowPaintMode = (currentShadow & quadrantBit) ? 'remove' : 'add';
        }

        // Apply the shadow paint mode consistently throughout the drag
        if (this.shadowPaintMode === 'remove') {
            // Remove shadow from this quadrant
            if (currentShadow & quadrantBit) {
                data[shadowLayerIndex] = currentShadow & ~quadrantBit;
            }
        } else {
            // Add shadow to this quadrant
            if (!(currentShadow & quadrantBit)) {
                data[shadowLayerIndex] = currentShadow | quadrantBit;
            }
        }

        // PERFORMANCE: Only update this specific shadow tile instead of re-rendering entire map
        const newShadowBits = data[shadowLayerIndex];
        this.tilemapManager.updateShadowTile(x, y, newShadowBits);
    }

    // Convert layer key to index
    getLayerIndex(layerKey) {
        // In RPG Maker MZ:
        // Layers 0-3 can contain any tiles (including autotiles A1-A5 and regular B-E)
        // Layer 4 is shadows, Layer 5 is regions
        // For now, we'll default to layer 0 for autotiles and layer 0-3 for B-E
        const layerMap = {
            'A': 0,  // Merged A layer (A1-A5)
            'A1': 0, // Autotiles go on layer 0 by default
            'A2': 0,
            'A3': 0,
            'A4': 0,
            'A5': 0,
            'B': 1,  // B tiles go on layer 1 (above A layer)
            'C': 2,  // C tiles go on layer 2 (above B layer)
            'D': 3,  // D tiles go on layer 3 (above C layer)
            'E': 3   // E tiles also go on layer 3 (or use findAvailableLayer to stack)
        };
        return layerMap[layerKey] ?? 0;
    }

    // Convert palette position to tile ID
    getTileIdFromPalettePosition(x, y, layer, mapX, mapY, previewPattern = null) {
        // Determine the layer index (0-3) from the current layer being edited
        // This is needed for proper autotile shape calculation
        let layerIndex = null;
        if (this.tilesetPaletteViewer && this.tilesetPaletteViewer.currentLayer) {
            layerIndex = this.getLayerIndex(this.tilesetPaletteViewer.currentLayer);
        }

        switch (layer) {
            case 'B': {
                // Palette click handler gives coordinates in 16-tile-wide space (x can be 0-15)
                // But tile IDs use 8-tile-per-row system for RPG Maker MZ compatibility
                // Convert: if x >= 8, move to bottom half
                if (x >= 8) {
                    x -= 8;
                    y += 16; // Move to bottom half (assumes 16 rows per half)
                }
                const tilesPerRow = 8;
                return y * tilesPerRow + x; // B starts at 0
            }
            case 'C': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return 256 + (y * tilesPerRow + x); // C starts at 256
            }
            case 'D': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return 512 + (y * tilesPerRow + x); // D starts at 512
            }
            case 'E': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return 768 + (y * tilesPerRow + x); // E starts at 768
            }
            case 'A5': {
                const tilesPerRow = 8;
                return 1536 + (y * tilesPerRow + x); // A5 starts at 1536
            }
            // A1-A4 are autotiles - each grid position represents a "kind"
            // Each kind has 48 variations based on surrounding tiles
            case 'A1': {
                // A1 palette: 8 cols × 2 rows (kinds 0-15)
                // Row 0: Water A, Water B, Rocks C, Rocks C, Water D, Waterfall E, Water D, Waterfall E
                // Pattern: Water base, Water overlay, Rocks base, Rocks overlay
                const kindIndex = y * 8 + x; // Linear mapping: row 0 = 0-7, row 1 = 8-15
                const baseTileId = 2048 + kindIndex * 48;

                // Return base tile ID - shape calculation happens during placement
                return baseTileId + 0; // Shape 0
            }
            case 'A2': {
                const kindIndex = y * 8 + x; // A2 grid is 8 cols × 4 rows
                const baseTileId = 2816 + kindIndex * 48;

                // Return base tile ID - shape calculation happens during placement
                return baseTileId + 0;
            }
            case 'A3': {
                const kindIndex = y * 8 + x; // A3 grid is 8 cols × 4 rows
                const baseTileId = 4352 + kindIndex * 48; // All autotiles use 48 IDs per kind

                // Return base tile ID - shape calculation happens during placement
                return baseTileId + 0;
            }
            case 'A4': {
                const kindIndex = y * 8 + x; // A4 grid is 8 cols × 6 rows
                const baseTileId = 5888 + kindIndex * 48; // All autotiles use 48 IDs per kind

                // Return base tile ID - shape calculation happens during placement
                return baseTileId + 0;
            }
            default: return 0;
        }
    }

    // Get base tile ID from palette position without calculating autotile shape
    // Used when we need to determine placement layer before calculating shape
    getBaseTileIdFromPalettePosition(x, y, layer) {
        switch (layer) {
            case 'B': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return y * tilesPerRow + x;
            }
            case 'C': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return 256 + (y * tilesPerRow + x);
            }
            case 'D': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return 512 + (y * tilesPerRow + x);
            }
            case 'E': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                return 768 + (y * tilesPerRow + x);
            }
            case 'A5': {
                const tilesPerRow = 8;
                return 1536 + (y * tilesPerRow + x);
            }
            case 'A1': {
                const kindIndex = y * 8 + x;
                return 2048 + kindIndex * 48; // Base tile ID with shape 0
            }
            case 'A2': {
                const kindIndex = y * 8 + x;
                return 2816 + kindIndex * 48;
            }
            case 'A3': {
                const kindIndex = y * 8 + x;
                return 4352 + kindIndex * 48;
            }
            case 'A4': {
                const kindIndex = y * 8 + x;
                return 5888 + kindIndex * 48;
            }
            default: return 0;
        }
    }

    // ── MZ A-layer stacking rules (shared by paint, fill, and preview) ──
    // A1 kinds 2-3 and odd kinds ≥5 are decorations/waterfalls; A2 kinds
    // drawn with transparency (paths, fences, the dish) are decorations.
    // Decorations stack onto the second A-slot (z1) whenever z0 already
    // holds ANY A-tile; ground autotiles replace z0.
    classifyAutotile(baseTileId) {
        const isA1Tile = baseTileId >= 2048 && baseTileId < 2816;
        const isA2Tile = baseTileId >= 2816 && baseTileId < 4352;
        let isA1Decoration = false;
        if (isA1Tile) {
            const kind = Math.floor((baseTileId - 2048) / 48);
            isA1Decoration = kind < 4 ? kind >= 2 : kind % 2 === 1;
        }
        let isA2Decoration = false;
        if (isA2Tile) {
            const kind = Math.floor((baseTileId - 2816) / 48);
            isA2Decoration = this.tilemapManager.isA2DecorationKind(kind);
        }
        return {
            isA1Tile,
            isA2Tile,
            isA1Decoration,
            isA2Decoration,
            isA1Water: isA1Tile && !isA1Decoration,
            isDecoration: isA1Decoration || isA2Decoration,
        };
    }

    // The z-slot an autotile will land in at (x, y) — MUST be shared by
    // placement AND preview, or the preview shows a different shape than
    // what painting produces.
    getAutotilePlacementLayer(baseTileId, x, y) {
        const { width, data } = this.tilemapManager.currentMap;
        const layer0Tile = data[y * width + x];
        const cls = this.classifyAutotile(baseTileId);
        if (cls.isDecoration) {
            // Decorations stack over ANY A-tile on layer 0 — water included
            // (MZ: the dish sits at z1 over the water at z0).
            const layer0HasATile = layer0Tile >= 1536 && layer0Tile < 8192;
            return layer0HasATile ? 1 : 0;
        }
        if (cls.isA1Water) {
            // A different water kind over existing water stacks on layer 1
            // (deep-water pools inside water); same kind replaces layer 0.
            const layer0IsA1 = layer0Tile >= 2048 && layer0Tile < 2816;
            if (layer0IsA1) {
                const layer0Kind = Math.floor((layer0Tile - 2048) / 48);
                const layer0IsDecoration = layer0Kind >= 2 && (layer0Kind < 4 || layer0Kind % 2 === 1);
                const currentKind = Math.floor((baseTileId - 2048) / 48);
                if (!layer0IsDecoration && layer0Kind !== currentKind) return 1;
            }
            return 0;
        }
        // A2 ground, A3-A5: replace layer 0
        return 0;
    }

    // Calculate wall autotile shape (A3/A4 - only uses 4 cardinal directions, 16 shapes)
    calculateWallAutotileShape(baseTileId, x, y, previewPattern = null) {
        if (!this.tilemapManager.currentMap) return { tileId: baseTileId, shape: 0 };

        const { width, height } = this.tilemapManager.currentMap;

        // Check 4 cardinal neighbors. Horizontal checks allow the A4
        // wall-beside-roof connection; vertical ones keep the eave edge.
        const top = this.isSameKindTile(baseTileId, x, y - 1, previewPattern);
        const right = this.isSameKindTile(baseTileId, x + 1, y, previewPattern, null, true);
        const bottom = this.isSameKindTile(baseTileId, x, y + 1, previewPattern);
        const left = this.isSameKindTile(baseTileId, x - 1, y, previewPattern, null, true);

        // RPG Maker MZ wall tile shape calculation
        // Based on actual data from Map001.json:
        // Isolated: 15, R only: 11, L only: 14, L+R: 10, T+B: 5, Corner (R+B): 7

        // INVERTED bits: 1 = no neighbor, 0 = has neighbor
        // Bit weights: left=1, top=2, right=4, bottom=8 (top/bottom swapped from expected)
        let shape = 0;
        if (!left) shape += 1;    // Bit 0: no left
        if (!top) shape += 2;     // Bit 1: no top (swapped with bottom)
        if (!right) shape += 4;   // Bit 2: no right
        if (!bottom) shape += 8;  // Bit 3: no bottom (swapped with top)

        return { tileId: baseTileId + shape, shape: shape };
    }

    // Calculate autotile shape based on surrounding tiles (RPG Maker MZ algorithm)
    calculateAutotileShape(baseTileId, x, y, previewPattern = null, currentLayer = null) {
        if (!this.tilemapManager.currentMap) return { tileId: baseTileId, shape: 0 };

        // Validate baseTileId is an autotile
        if (baseTileId < 2048 || baseTileId >= 8192) {
            return { tileId: baseTileId, shape: 0 };
        }

        // A3 and A4 walls use a simpler 16-shape system (no diagonals)
        // A4 roofs use the 48-shape system
        const isA3 = baseTileId >= 4352 && baseTileId < 5888;
        const isA4 = baseTileId >= 5888 && baseTileId < 8192;

        if (isA3) {
            return this.calculateWallAutotileShape(baseTileId, x, y, previewPattern);
        }

        if (isA4) {
            // Determine if this is a wall or roof
            const kind = Math.floor((baseTileId - 5888) / 48);
            const rowInA4 = kind % 8; // Column
            const colInA4 = Math.floor(kind / 8); // Row
            const isA4Wall = colInA4 % 2 === 1; // Odd rows are walls

            if (isA4Wall) {
                return this.calculateWallAutotileShape(baseTileId, x, y, previewPattern);
            }
            // A4 roofs continue to floor autotile calculation below with special handling
        }

        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;

        // Get the autotile kind from the base tile ID
        const kind = Math.floor((baseTileId - 2048) / 48);

        // A1 waterfall tiles (odd kinds >= 5) use WATERFALL_AUTOTILE_TABLE with only 4 shapes
        // They only care about left/right neighbors (not top/bottom)
        const isA1 = baseTileId >= 2048 && baseTileId < 2816;
        const isWaterfall = isA1 && kind >= 5 && kind % 2 === 1;

        // Waterfalls have special shape calculation: only 4 shapes based on left/right
        if (isWaterfall) {
            const left = this.isSameKindTile(baseTileId, x - 1, y, previewPattern, currentLayer);
            const right = this.isSameKindTile(baseTileId, x + 1, y, previewPattern, currentLayer);
            // Shape = bitmask of OPEN sides: +1 left edge, +2 right edge
            // (corpus-verified: MZ stores 1 when only the right neighbor
            // exists, 2 when only the left — the old mapping was inverted)
            const shape = (left ? 0 : 1) + (right ? 0 : 2);
            return { tileId: baseTileId + shape, shape: shape };
        }

        // Check neighbors for shape calculation (only check the SAME layer)
        const top = this.isSameKindTile(baseTileId, x, y - 1, previewPattern, currentLayer);
        const right = this.isSameKindTile(baseTileId, x + 1, y, previewPattern, currentLayer);
        const bottom = this.isSameKindTile(baseTileId, x, y + 1, previewPattern, currentLayer);
        const left = this.isSameKindTile(baseTileId, x - 1, y, previewPattern, currentLayer);

        // Create a simple bit pattern for the 4 cardinal directions
        let pattern = 0;
        if (top) pattern |= 1;
        if (right) pattern |= 2;
        if (bottom) pattern |= 4;
        if (left) pattern |= 8;

        // Check diagonals for inner corners when all 4 sides have neighbors
        let shape;

        if (pattern === 0b1111) {
            // All 4 cardinal sides have neighbors - check diagonals for inner corners
            const topLeft = this.isSameKindTile(baseTileId, x - 1, y - 1, previewPattern, currentLayer);
            const topRight = this.isSameKindTile(baseTileId, x + 1, y - 1, previewPattern, currentLayer);
            const bottomLeft = this.isSameKindTile(baseTileId, x - 1, y + 1, previewPattern, currentLayer);
            const bottomRight = this.isSameKindTile(baseTileId, x + 1, y + 1, previewPattern, currentLayer);

            // Shape is a bitmask of missing diagonals
            shape = 0;
            if (!topLeft) shape += 1;      // Bit 1: Missing top-left diagonal
            if (!topRight) shape += 2;     // Bit 2: Missing top-right diagonal
            if (!bottomRight) shape += 4;  // Bit 4: Missing bottom-right diagonal (swapped!)
            if (!bottomLeft) shape += 8;   // Bit 8: Missing bottom-left diagonal (swapped!)
            // Result can be 0-15 (0 = fully surrounded, 15 = all diagonals missing)
        } else {
            // Use the pattern-based mapping for non-fully-surrounded tiles
            const shapeMap = {
                // Isolated tile = shape 46 (borders on all sides). 47 is the
                // palette "demo" block — MZ NEVER stores it on maps
                // (corpus: 2210 × shape 46, 0 × shape 47).
                0b0000: 46,

                // Edges (3 neighbors) - will be overridden below with diagonal checking
                0b1110: 20,  // Missing top (has R+B+L) = TOP EDGE (default)
                0b0111: 16,  // Missing left (has T+R+B) = LEFT EDGE (default)
                0b1101: 24,  // Missing right (has T+B+L) = RIGHT EDGE (default)
                0b1011: 28,  // Missing bottom (has T+R+L) = BOTTOM EDGE (default)

                // Opposite sides (2 non-adjacent neighbors)
                0b1010: 33,  // Has R+L (horizontal strip middle) - SWAPPED
                0b0101: 32,  // Has T+B (vertical strip middle) - SWAPPED

                // Single neighbors - SWAPPED horizontal/vertical
                0b0001: 44,  // Top only (vertical strip bottom) - SWAPPED
                0b0010: 43,  // Right only (horizontal strip left) - SWAPPED
                0b0100: 42,  // Bottom only (vertical strip top) - SWAPPED
                0b1000: 45   // Left only (horizontal strip right) - SWAPPED
            };

            // For 3-neighbor edges, check diagonals for inner corners
            if (pattern === 0b1110) {
                // Top edge (has R+B+L, missing T)
                const bottomLeft = this.isSameKindTile(baseTileId, x - 1, y + 1, previewPattern, currentLayer);
                const bottomRight = this.isSameKindTile(baseTileId, x + 1, y + 1, previewPattern, currentLayer);
                shape = 20;
                if (!bottomRight) shape += 1;  // Missing bottom-right diagonal → +1
                if (!bottomLeft) shape += 2;   // Missing bottom-left diagonal → +2
            } else if (pattern === 0b0111) {
                // Left edge (has T+R+B, missing L)
                const topRight = this.isSameKindTile(baseTileId, x + 1, y - 1, previewPattern, currentLayer);
                const bottomRight = this.isSameKindTile(baseTileId, x + 1, y + 1, previewPattern, currentLayer);
                shape = 16;
                if (!topRight) shape += 1;     // Missing top-right diagonal → +1
                if (!bottomRight) shape += 2;  // Missing bottom-right diagonal → +2
            } else if (pattern === 0b1101) {
                // Right edge (has T+B+L, missing R)
                const topLeft = this.isSameKindTile(baseTileId, x - 1, y - 1, previewPattern, currentLayer);
                const bottomLeft = this.isSameKindTile(baseTileId, x - 1, y + 1, previewPattern, currentLayer);
                shape = 24;
                if (!bottomLeft) shape += 1;   // Missing bottom-left diagonal → +1
                if (!topLeft) shape += 2;      // Missing top-left diagonal → +2
            } else if (pattern === 0b1011) {
                // Bottom edge (has T+R+L, missing B)
                const topLeft = this.isSameKindTile(baseTileId, x - 1, y - 1, previewPattern, currentLayer);
                const topRight = this.isSameKindTile(baseTileId, x + 1, y - 1, previewPattern, currentLayer);
                shape = 28;
                if (!topLeft) shape += 1;      // Missing top-left diagonal
                if (!topRight) shape += 2;     // Missing top-right diagonal
            }
            // For 2-neighbor corners, check diagonal to determine inner vs outer corner
            else if (pattern === 0b0110) {
                // Has right + bottom (top-left corner)
                const diagonal = this.isSameKindTile(baseTileId, x + 1, y + 1, previewPattern, currentLayer);
                shape = diagonal ? 34 : 35;  // Outer : Inner (inner when diagonal missing)
            } else if (pattern === 0b1100) {
                // Has bottom + left (top-right corner)
                const diagonal = this.isSameKindTile(baseTileId, x - 1, y + 1, previewPattern, currentLayer);
                shape = diagonal ? 36 : 37;  // Outer : Inner
            } else if (pattern === 0b0011) {
                // Has top + right (bottom-left corner)
                const diagonal = this.isSameKindTile(baseTileId, x + 1, y - 1, previewPattern, currentLayer);
                shape = diagonal ? 40 : 41;  // Outer : Inner
            } else if (pattern === 0b1001) {
                // Has top + left (bottom-right corner)
                const diagonal = this.isSameKindTile(baseTileId, x - 1, y - 1, previewPattern, currentLayer);
                shape = diagonal ? 38 : 39;  // Outer : Inner
            } else {
                shape = shapeMap[pattern];
            }
        }

        return { tileId: baseTileId + shape, shape: shape };
    }


    // Helper to describe pattern
    patternToString(pattern) {
        const parts = [];
        if (pattern & 1) parts.push('T');
        if (pattern & 2) parts.push('R');
        if (pattern & 4) parts.push('B');
        if (pattern & 8) parts.push('L');
        return parts.length ? parts.join('+') : 'NONE';
    }

    // Check if a tile at position (x,y) is the same autotile kind as baseTileId
    // checkLayer: if provided, only check this specific layer (0-3). If null, check the specific layer being edited.
    isSameKindTile(baseTileId, x, y, previewPattern = null, checkLayer = null, allowRoofMatch = false) {
        if (!this.tilemapManager.currentMap) return false;

        const { width, height, data } = this.tilemapManager.currentMap;

        // DEBUG: Check if position is in bounds
        const inBounds = x >= 0 && x < width && y >= 0 && y < height;

        // Cells covered by the preview pattern count as same-kind; cells
        // OUTSIDE it fall through to the real-map check below so previews
        // connect to existing tiles exactly like the actual placement will
        // (pattern-only checks made every 1x1 preview look "isolated").
        if (previewPattern && previewPattern.has(`${x},${y}`)) {
            return true;
        }

        // Out-of-bounds counts as "same kind" for ALL autotiles — the MZ
        // editor continues cliffs/roofs/ground seamlessly off the map edge
        // (corpus-verified: edge roofs/walls store fully-connected shapes).
        if (x < 0 || x >= width || y < 0 || y >= height) {
            return baseTileId >= 2048 && baseTileId < 8192;
        }

        // Only check autotiles (A1-A4 range: 2048-8191)
        if (baseTileId < 2048 || baseTileId >= 8192) return false;

        const layerSize = width * height;

        // All autotiles use 48 IDs per kind (even A3/A4 which only use 16 of them)
        // A1: 2048-2815 (16 kinds), A2: 2816-4351 (32 kinds)
        // A3: 4352-5887 (32 kinds), A4: 5888-7423 (32 kinds)
        // Calculate baseStart and baseKind BEFORE the loop so they're available for empty space logic
        let baseStart, baseKind;
        if (baseTileId < 2816) {
            // A1
            baseStart = 2048;
            baseKind = Math.floor((baseTileId - 2048) / 48);
        } else if (baseTileId < 4352) {
            // A2
            baseStart = 2816;
            baseKind = Math.floor((baseTileId - 2816) / 48);
        } else if (baseTileId < 5888) {
            // A3
            baseStart = 4352;
            baseKind = Math.floor((baseTileId - 4352) / 48);
        } else {
            // A4
            baseStart = 5888;
            baseKind = Math.floor((baseTileId - 5888) / 48);
        }

        // If checkLayer is specified, only check that specific layer (RMMZ behavior)
        // Otherwise check all layers (old behavior for preview patterns)
        // NOTE: checking both A-slots here sounds right but is WRONG — MZ
        // stacks deep water (z1) over water (z0), and the non-matching-tile-
        // blocks rule below would cut off the z0 check (corpus-verified:
        // it broke 40k cells to fix 200).
        const layersToCheck = (checkLayer !== null && checkLayer !== undefined) ? [checkLayer] : [3, 2, 1, 0];

        // Check specified layer(s) for matching autotile
        for (const layer of layersToCheck) {
            const index = layer * layerSize + y * width + x;
            const tileId = data[index];

            // Skip empty tiles (0) and B-E tiles (1-1535)
            // Only A-layer tiles (A5: 1536-2047, A1-A4: 2048-8191) should affect borders
            if (tileId === 0 || (tileId > 0 && tileId < 1536)) {
                continue;
            }

            // Check if it's an autotile in the valid range (A1-A4: 2048-8191)
            if (tileId >= 2048 && tileId < 8192) {
                // Determine which autotile layer this tile belongs to
                let tileStart, tileKind;
                if (tileId < 2816) {
                    // A1
                    tileStart = 2048;
                    tileKind = Math.floor((tileId - tileStart) / 48);
                } else if (tileId < 4352) {
                    // A2
                    tileStart = 2816;
                    tileKind = Math.floor((tileId - tileStart) / 48);
                } else if (tileId < 5888) {
                    // A3
                    tileStart = 4352;
                    tileKind = Math.floor((tileId - tileStart) / 48);
                } else {
                    // A4
                    tileStart = 5888;
                    tileKind = Math.floor((tileId - tileStart) / 48);
                }

                let shouldSkip = false;

                // A1 special rules:
                // A1 has two types of tiles based on their bx position in the tileset:
                // - "Animated water" at bx=0,2,4 (columns 0-5): Should blend together
                // - "Static decorations" at bx=6 (columns 6-7): Should NOT blend (independent placements)
                //
                // The corescript formula determines which tiles are decorations:
                // - Kinds 0, 1: Use waterSurfaceIndex (animate) - WATER
                // - Kinds 2, 3: Use bx=6 (static) - DECORATIONS
                // - Kinds 4+: Even kinds animate, odd kinds are static decorations (waterfalls)
                //
                // So decorations are: kinds 2, 3, 5, 7, 9, 11, 13, 15
                // And water is: kinds 0, 1, 4, 6, 8, 10, 12, 14
                if (baseStart === 2048 && tileStart === 2048) {
                    // Determine if baseKind is a decoration (static) tile
                    let baseIsDecoration;
                    if (baseKind < 4) {
                        // Kinds 0-3: 0,1 are water, 2,3 are decorations
                        baseIsDecoration = baseKind >= 2;
                    } else {
                        // Kinds 4+: odd = decoration (waterfall), even = water
                        baseIsDecoration = baseKind % 2 === 1;
                    }

                    const isWaterfallKind = (k) => k >= 5 && k % 2 === 1;
                    const isWaterKind = (k) => (k < 4 ? k < 2 : k % 2 === 0);

                    // Decorations blend with OTHER decorations of the SAME kind only
                    // EXCEPT waterfalls, which also connect to any water kind
                    // (corpus-verified: MZ stores connected shapes at
                    // water↔waterfall junctions, e.g. kinds 4↔5, 0↔9).
                    if (baseIsDecoration) {
                        // Check if neighbor is also a decoration of the same kind
                        if (tileKind === baseKind) {
                            return true; // Same decoration type - blend together
                        }
                        if (isWaterfallKind(baseKind) && isWaterKind(tileKind)) {
                            return true; // Waterfall meets water - connected
                        }
                        return false; // Different kind or water - don't blend
                    }

                    // Water tiles blend with other water tiles of the SAME kind only
                    // Different water kinds can now stack on different layers
                    // Determine if tileKind is also water (not decoration)
                    let tileIsDecoration;
                    if (tileKind < 4) {
                        tileIsDecoration = tileKind >= 2;
                    } else {
                        tileIsDecoration = tileKind % 2 === 1;
                    }

                    // If both are water, only blend if they're the same kind
                    if (!tileIsDecoration) {
                        if (baseKind === tileKind) {
                            // Same water kind - blend together
                            return true;
                        }
                        // Different water kinds - don't blend (allows layering)
                        return false;
                    }
                    // Water meets a waterfall - connected (mirror of the
                    // waterfall rule above)
                    if (isWaterfallKind(tileKind)) {
                        return true;
                    }
                    // One is water, other is a static decoration - don't blend
                }

                // A1 checking higher layers should skip them
                if (baseStart === 2048 && tileStart > 2048) {
                    shouldSkip = true;
                }

                // When A1 checks neighbors, A2/A3/A4 tiles with A1 below should be transparent
                if (baseStart === 2048 && tileStart > 2048) {
                    // A1 is checking an A2/A3/A4 neighbor - check if there's A1 below the neighbor
                    for (let checkLayer = layer - 1; checkLayer >= 0; checkLayer--) {
                        const checkIndex = checkLayer * layerSize + y * width + x;
                        const checkTileId = data[checkIndex];
                        if (checkTileId >= 2048 && checkTileId < 2816) {
                            // Found A1 below the A2/A3/A4 - skip to check that A1 instead
                            shouldSkip = true;
                            break;
                        }
                    }
                }

                // A2 transparency rules (only apply when neighbor is A2):
                // - Overlays (odd columns) are transparent only when their base tile checks them
                // - Objects (cols 4-7) are transparent only when A2 terrain (cols 0-3) is checking
                if (tileStart === 2816) {
                    const columnInA2 = tileKind % 8;
                    const baseColumnInA2 = baseKind % 8;
                    const isOverlay = columnInA2 % 2 === 1;
                    const isBaseEven = baseColumnInA2 % 2 === 0;

                    // Overlays transparent only when checked by their corresponding base (even column)
                    const isOverlayTransparentToBase = isOverlay && (baseStart === 2816 && isBaseEven);

                    // Objects are transparent only when checked by A2 terrain
                    const isObjectTransparentToTerrain = (columnInA2 >= 4) && (baseStart === 2816 && baseColumnInA2 < 4);

                    shouldSkip = isOverlayTransparentToBase || isObjectTransparentToTerrain;
                }
                if (shouldSkip) {
                    continue; // Skip this layer, check the layer below
                }

                // Match if same base and same kind
                if (tileStart === baseStart && tileKind === baseKind) {
                    // Special check for A4: roofs and walls are separate
                    if (tileStart === 5888) {
                        // Both are A4 - check if both are roofs or both are walls
                        const baseRow = Math.floor(baseKind / 8);
                        const tileRow = Math.floor(tileKind / 8);
                        const baseIsWall = baseRow % 2 === 1;
                        const tileIsWall = tileRow % 2 === 1;
                        // Only match if both are walls or both are roofs
                        return (baseIsWall === tileIsWall);
                    } else {
                        return true;
                    }
                } else if (allowRoofMatch && tileStart === 5888 && baseStart === 5888 &&
                           Math.floor(baseKind / 8) % 2 === 1 &&
                           Math.floor(tileKind / 8) % 2 === 0) {
                    // A4 WALL beside an A4 ROOF (any kind): connected — the
                    // wall face tucks under the roof slope with no side
                    // border. HORIZONTAL neighbors only (the caller sets
                    // allowRoofMatch): against a roof ABOVE, the wall keeps
                    // its top edge — that's the eave line. Corpus-verified:
                    // 2121 side junctions connected, 2316 top edges kept.
                    return true;
                } else if (tileStart === 2816 && baseStart === 2816) {
                    // A2 Field Type pairing: consecutive pairs are treated as same kind
                    // Pairs: (0,1), (2,3), (4,5), (6,7), (8,9), (10,11), etc.
                    // Each row has 8 kinds, and within each row consecutive kinds pair
                    const sameRow = Math.floor(baseKind / 8) === Math.floor(tileKind / 8);
                    const arePaired = (baseKind ^ tileKind) === 1; // XOR by 1 means consecutive pair

                    if (sameRow && arePaired) {
                        return true; // Paired patterns blend together (1+2 or 3+4)
                    }
                    // Not paired - fall through to not matching
                } else {
                    // Found an autotile on this layer, but it doesn't match
                    // Higher layers take precedence, so return false
                    return false;
                }
            } else if (tileId >= 1536 && tileId < 2048) {
                // Found an A5 tile (1536-2047) - it's different from any autotile
                // Higher layers take precedence, so return false
                return false;
            }
        }

        // No A-layer tile found on the specified layer(s)
        // Different kind = show border
        return false;
    }

    // Convert 8-direction neighbor checks to autotile shape number (RPG Maker MZ algorithm)
    getAutotileShapeNumber(checks) {
        const [top, right, bottom, left, topLeft, topRight, bottomLeft, bottomRight] = checks;

        // RPG Maker uses a lookup table based on neighbor configuration
        // This is the exact mapping from RPG Maker's algorithm
        const tl = top && left ? (topLeft ? 0 : 1) : (top ? 2 : (left ? 8 : 10));
        const tr = top && right ? (topRight ? 1 : 0) : (top ? 3 : (right ? 9 : 11));
        const bl = bottom && left ? (bottomLeft ? 0 : 2) : (bottom ? 4 : (left ? 12 : 14));
        const br = bottom && right ? (bottomRight ? 1 : 3) : (bottom ? 5 : (right ? 13 : 15));

        // Combine the 4 corner values to get the final shape
        // This generates shapes 0-47 based on the lookup table pattern
        const shapeTable = [
            // Top-left values: 0, 1, 2, 8, 10
            // Top-right values: 0, 1, 3, 9, 11
            // Bottom-left values: 0, 2, 4, 12, 14
            // Bottom-right values: 0, 1, 3, 5, 13, 15
        ];

        //Simplified version: Calculate based on pattern
        if (!top && !right && !bottom && !left) return 10; // Island
        if (top && right && bottom && left) {
            // All 4 directions filled - check corners
            if (topLeft && topRight && bottomLeft && bottomRight) return 47; // Fully surrounded
            if (!topLeft && topRight && bottomLeft && bottomRight) return 38;
            if (topLeft && !topRight && bottomLeft && bottomRight) return 34;
            if (topLeft && topRight && !bottomLeft && bottomRight) return 20;
            if (topLeft && topRight && bottomLeft && !bottomRight) return 18;
            if (!topLeft && !topRight && bottomLeft && bottomRight) return 36;
            if (topLeft && topRight && !bottomLeft && !bottomRight) return 18;
            if (!topLeft && !topRight && !bottomLeft && bottomRight) return 26;
            if (!topLeft && !topRight && bottomLeft && !bottomRight) return 30;
            if (!topLeft && topRight && !bottomLeft && !bottomRight) return 24;
            if (topLeft && !topRight && !bottomLeft && !bottomRight) return 32;
            if (!topLeft && topRight && !bottomLeft && bottomRight) return 22;
            if (topLeft && !topRight && bottomLeft && !bottomRight) return 28;
            return 15; // All sides but no corners
        }

        // Edge and corner cases
        if (top && right && bottom && !left) return 2;
        if (top && right && !bottom && left) return 0;
        if (top && !right && bottom && left) return 13;
        if (!top && right && bottom && left) return 14;
        if (top && right && !bottom && !left) return 1;
        if (top && !right && bottom && !left) return 4;
        if (top && !right && !bottom && left) return 6;
        if (!top && right && bottom && !left) return 8;
        if (!top && right && !bottom && left) return 11;
        if (!top && !right && bottom && left) return 12;
        if (top && !right && !bottom && !left) return 3;
        if (!top && right && !bottom && !left) return 5;
        if (!top && !right && bottom && !left) return 7;
        if (!top && !right && !bottom && left) return 9;

        return 10; // Default to island
    }

    // Update neighboring autotiles when a tile is placed
    updateNeighboringAutotiles(centerX, centerY) {
        if (!this.tilemapManager.currentMap) return;

        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        let updateCount = 0;

        // Check all 8 surrounding tiles (NOT the center - it's already been placed with correct shape)
        const neighbors = [
            { x: centerX, y: centerY - 1 },     // Top
            { x: centerX + 1, y: centerY - 1 }, // Top-right
            { x: centerX + 1, y: centerY },     // Right
            { x: centerX + 1, y: centerY + 1 }, // Bottom-right
            { x: centerX, y: centerY + 1 },     // Bottom
            { x: centerX - 1, y: centerY + 1 }, // Bottom-left
            { x: centerX - 1, y: centerY },     // Left
            { x: centerX - 1, y: centerY - 1 }  // Top-left
        ];

        for (const neighbor of neighbors) {
            if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) {
                continue;
            }

            // Check all layers for autotiles at this position
            for (let layer = 0; layer < 4; layer++) {
                const index = layer * layerSize + neighbor.y * width + neighbor.x;
                const tileId = data[index];

                // If it's an autotile (A1-A4), recalculate its shape
                if (tileId >= 2048 && tileId < 8192) {
                    const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;

                    // All A1 and A2 tiles autotile - no need to skip any
                    // Pass the current layer so shape calculation only checks the same layer
                    const result = this.calculateAutotileShape(baseTileId, neighbor.x, neighbor.y, null, layer);
                    const newTileId = result.tileId;

                    if (newTileId !== tileId) {
                        data[index] = newTileId;
                        updateCount++;

                        // Re-render this tile (☆-flag routing picks the stack)
                        const pixiLayer = this.tilemapManager.tileTargetLayer(layer, newTileId);

                        if (pixiLayer) {
                            this.tilemapManager.clearTileSpritesAt(neighbor.x, neighbor.y, pixiLayer);
                            this.tilemapManager.renderAutotile(newTileId, neighbor.x, neighbor.y, pixiLayer);
                        }
                    }
                }
            }
        }
    }

    // Recalculate all autotile shapes with layer-aware logic (fixes RMMZ maps on load)
    recalculateAllAutotileShapes() {
        if (!this.tilemapManager.currentMap) return;

        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        let updatedCount = 0;

        // Process each layer
        for (let layer = 0; layer < 4; layer++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index = layer * layerSize + y * width + x;
                    const tileId = data[index];

                    // Check if this is an autotile (A1-A4)
                    if (tileId >= 2048 && tileId < 8192) {
                        const baseTileId = Math.floor((tileId - 2048) / 48) * 48 + 2048;
                        const result = this.calculateAutotileShape(baseTileId, x, y, null, layer);
                        const newTileId = result.tileId;

                        if (newTileId !== tileId) {
                            data[index] = newTileId;
                            updatedCount++;
                        }
                    }
                }
            }
        }

        if (updatedCount > 0) {
            // Trigger a full re-render
            this.tilemapManager.renderMap();
        }
    }

    // Clean up
    destroy() {
        if (this.previewLayer) {
            this.previewLayer.destroy();
            this.previewLayer = null;
        }
        if (this.tilePreviewContainer) {
            this.tilePreviewContainer.destroy({ children: true });
            this.tilePreviewContainer = null;
        }
        if (typeof window !== 'undefined' && this._windowBlurHandler) {
            window.removeEventListener('blur', this._windowBlurHandler);
            this._windowBlurHandler = null;
        }
    }
}
