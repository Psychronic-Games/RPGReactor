// RPG Reactor - Map Editor
// Handles tile placement and editing on maps

class MapEditor {
    constructor(tilemapManager, tilesetPaletteViewer) {
        this.tilemapManager = tilemapManager;
        this.tilesetPaletteViewer = tilesetPaletteViewer;
        this.regionManager = null; // Will be set later
        this.currentTool = 'pencil'; // pencil, rectangle, circle, fill
        this.activeElevationState = null;
        this.onElevationChanged = null;
        this.previousTool = 'pencil'; // Remember tool before shadow/eraser mode
        this.eraserMode = false;
        this.shadowPenMode = false;
        this.isDrawing = false;
        this.drawStart = null;
        this.previewLayer = null;
        this.previewGraphics = null;
        this.tilePreviewContainer = null; // Container for tile placement preview
        this.lastMousePos = null; // Track mouse position for quadrant calculation
        this.shadowPaintMode = null; // 'add' or 'remove' - set on first click, maintained during drag
        this.lastPreviewTile = { x: -1, y: -1, quadrant: -1 }; // PERFORMANCE: Track last preview position to avoid recreating
        this.lastPaintedTile = { x: -1, y: -1, quadrant: -1 }; // PERFORMANCE: Track last painted tile to avoid redundant paints
        this.layerMode = 'auto'; // auto, or layer number (0-3)
        this.enabled = true; // Whether map editor is enabled (disabled during event mode)
        this.pendingAutotileUpdates = []; // Accumulate autotile updates during drag, process on mouseup
        this.preserveAutotileShape = false; // Shift-paint without reconnecting autotile shapes
        this.mapStamp = null; // Six-layer map rectangle sampled with right-drag
        this.mapSampleDrag = null;
        this._mapStampPreviewTexture = null;

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
        if (regionManager) regionManager.mapEditor = this;
    }

    captureMapStamp(map, start, end) {
        if (!map || !Array.isArray(map.data) || !map.width || !map.height) return null;
        const minX = Math.max(0, Math.min(map.width - 1, Math.min(start.x, end.x)));
        const maxX = Math.max(0, Math.min(map.width - 1, Math.max(start.x, end.x)));
        const minY = Math.max(0, Math.min(map.height - 1, Math.min(start.y, end.y)));
        const maxY = Math.max(0, Math.min(map.height - 1, Math.max(start.y, end.y)));
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const sourceLayerSize = map.width * map.height;
        const stampLayerSize = width * height;
        const data = new Array(stampLayerSize * 6).fill(0);

        for (let layer = 0; layer < 6; layer++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const sourceIndex = layer * sourceLayerSize + (minY + y) * map.width + minX + x;
                    data[layer * stampLayerSize + y * width + x] = Number(map.data[sourceIndex]) || 0;
                }
            }
        }

        return { width, height, data, tilesetId: map.tilesetId };
    }

    applyMapStamp(map, stamp, anchor) {
        const visualUpdates = [];
        const regionUpdates = [];
        if (!map || !stamp || !Array.isArray(map.data) || !Array.isArray(stamp.data)) {
            return { changed: false, visualUpdates, regionUpdates };
        }

        const mapLayerSize = map.width * map.height;
        const stampLayerSize = stamp.width * stamp.height;
        let changed = false;
        for (let y = 0; y < stamp.height; y++) {
            for (let x = 0; x < stamp.width; x++) {
                const targetX = anchor.x + x;
                const targetY = anchor.y + y;
                if (targetX < 0 || targetY < 0 || targetX >= map.width || targetY >= map.height) continue;

                for (let layer = 0; layer < 6; layer++) {
                    const sourceIndex = layer * stampLayerSize + y * stamp.width + x;
                    const targetIndex = layer * mapLayerSize + targetY * map.width + targetX;
                    const value = stamp.data[sourceIndex] || 0;
                    if (map.data[targetIndex] === value) continue;
                    map.data[targetIndex] = value;
                    changed = true;
                    if (layer <= 4) visualUpdates.push({ x: targetX, y: targetY, layer });
                    else regionUpdates.push({ x: targetX, y: targetY });
                }
            }
        }
        return { changed, visualUpdates, regionUpdates };
    }

    /**
     * The shadow a wall casts, and the cell it falls on.
     *
     * RPG Maker fills the *left half* of the cell immediately east of a wall —
     * quadrant bits 0x01 (bottom-left) and 0x04 (top-left). Read off the
     * authored maps rather than guessed: of 39,104 shadow cells across the
     * bundled projects, 85.6% carry exactly this pattern, and much the
     * commonest thing beside a shadow is a wall immediately west of it.
     */
    get WALL_SHADOW_BITS() { return 0x05; }

    /** Whether any layer of a cell holds a wall autotile. */
    wallAt(x, y) {
        const map = this.tilemapManager.currentMap;
        if (!map) return false;
        const { width, height, data } = map;
        if (x < 0 || y < 0 || x >= width || y >= height) return false;
        const layerSize = width * height;
        for (let layer = 0; layer <= 3; layer++) {
            const tileId = data[layer * layerSize + y * width + x];
            if (tileId >= 2048 && tileId < 8192 && this.isWallAutotile(tileId)) return true;
        }
        return false;
    }

    /**
     * Put the wall shadow on one cell, or take it off, from what is west of it.
     *
     * Only the two quadrants a wall casts are ever touched, so a shadow painted
     * by hand in the other half of the same cell survives having a wall built
     * or removed beside it.
     */
    refreshAutoShadowAt(x, y, updates) {
        const map = this.tilemapManager.currentMap;
        if (!map) return;
        const { width, height, data } = map;
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const index = 4 * width * height + y * width + x;
        const before = data[index] || 0;
        // A wall does not cast onto another wall — there is nothing to fall on.
        const lit = this.wallAt(x - 1, y) && !this.wallAt(x, y);
        const after = lit ? (before | this.WALL_SHADOW_BITS)
            : (before & ~this.WALL_SHADOW_BITS);
        if (after === before) return;
        data[index] = after;
        if (updates) updates.push({ x, y, layer: 4 });
    }

    /**
     * Note where walls stand, before an edit that may move them.
     *
     * Paired with `refreshAutoShadow` so that only cells whose wall actually
     * came or went get their shadow reconsidered. Refreshing everything an
     * operation *touched* is too eager: filling a floor under a wall that was
     * already there would conjure a shadow the author never asked for, and
     * filling over one would take away a shadow they may have painted.
     */
    captureWallState(cells) {
        const before = new Map();
        for (const cell of cells) this.noteWallState(before, cell.x, cell.y);
        return before;
    }

    /** Record a cell and its neighbours in a wall-state snapshot. */
    noteWallState(before, x, y) {
        for (const cellX of [x - 1, x, x + 1]) {
            const key = `${cellX},${y}`;
            if (!before.has(key)) before.set(key, this.wallAt(cellX, y));
        }
    }

    /**
     * Redo the wall shadows wherever a wall came or went.
     *
     * Each changed cell is asked about twice: the cell east of it, which is
     * where a wall built there casts, and the cell itself, since a wall
     * removed from it may now be somewhere a shadow can fall.
     */
    refreshAutoShadow(before) {
        const updates = [];
        for (const [key, wasWall] of before) {
            const [x, y] = key.split(',').map(Number);
            if (this.wallAt(x, y) === wasWall) continue;
            this.refreshAutoShadowAt(x, y, updates);
            this.refreshAutoShadowAt(x + 1, y, updates);
        }
        return updates;
    }

    /**
     * Rebuild the autotiles in a pasted area against where it landed.
     *
     * A stamp carries the ids it was lifted from, and an autotile id is a
     * corner arrangement rather than a picture — so a stretch taken out of the
     * middle of a wall arrives carrying middle-of-wall pieces, with no ends,
     * and reads as a wall someone has cut a slice out of. RPG Maker rebuilds
     * the shapes on paste and the copy comes down as a finished wall of its
     * own; Shift is what asks for the ids verbatim, exactly as it does when
     * painting a single autotile from the palette.
     *
     * The border is walked as well as the area itself: pasting against an
     * existing wall has to join it, and that is a change to the wall's tiles
     * rather than to the pasted ones.
     */
    reshapeStampedAutotiles(map, stamp, anchor) {
        const updates = [];
        if (!map || !stamp || !Array.isArray(map.data)) return updates;
        const layerSize = map.width * map.height;
        const minX = Math.max(0, anchor.x - 1);
        const minY = Math.max(0, anchor.y - 1);
        const maxX = Math.min(map.width - 1, anchor.x + stamp.width);
        const maxY = Math.min(map.height - 1, anchor.y + stamp.height);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                for (let layer = 0; layer <= 3; layer++) {
                    const index = layer * layerSize + y * map.width + x;
                    const tileId = map.data[index];
                    // A5 is not an autotile and B-G are pictures; only the
                    // shape-bearing bands are rebuilt.
                    if (!(tileId >= 2048 && tileId < 8192)) continue;
                    const baseTileId = 2048 + Math.floor((tileId - 2048) / 48) * 48;
                    const result = this.calculateAutotileShape(baseTileId, x, y, null, layer);
                    if (result.tileId === tileId) continue;
                    map.data[index] = result.tileId;
                    updates.push({ x, y, layer });
                }
            }
        }
        return updates;
    }

    clearMapStamp() {
        this.mapStamp = null;
        this.mapSampleDrag = null;
        if (this._mapStampPreviewTexture) {
            try { this._mapStampPreviewTexture.destroy(true); } catch (error) {}
            this._mapStampPreviewTexture = null;
        }
        this.hideTilePreview();
        this.clearPreview();
    }

    activateMapStamp(stamp) {
        if (!stamp) return;
        this.clearMapStamp();
        if (this.tilesetPaletteViewer) this.tilesetPaletteViewer.clearSelection();
        if (this.shadowPenMode) this.setShadowPenMode(false);
        if (this.eraserMode) this.setEraserMode(false);
        this.mapStamp = stamp;
        this._mapStampPreviewTexture = this.createMapStampPreviewTexture(stamp);
        this.setTool('pencil', { preserveMapStamp: true });

        if (typeof document !== 'undefined') {
            document.querySelectorAll('.tool-draw-mode').forEach(button => {
                button.classList.toggle('active', button.dataset.tool === 'pencil');
            });
        }
    }

    createMapStampPreviewTexture(stamp) {
        if (typeof document === 'undefined' || typeof PIXI === 'undefined' || !stamp) return null;
        const tileSize = this.tilemapManager.TILE_WIDTH || 48;
        const canvasWidth = stamp.width * tileSize;
        const canvasHeight = stamp.height * tileSize;
        if (canvasWidth > 4096 || canvasHeight > 4096 || canvasWidth * canvasHeight > 16777216) return null;

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = false;
        const keys = RRTilesetSheets.SHEET_KEYS;
        const images = keys.map(key => this.tilesetPaletteViewer?.tilesetTextures?.[key] || null);
        const layerSize = stamp.width * stamp.height;

        for (const higherPass of [false, true]) {
            for (let layer = 0; layer < 4; layer++) {
                for (let y = 0; y < stamp.height; y++) {
                    for (let x = 0; x < stamp.width; x++) {
                        const tileId = stamp.data[layer * layerSize + y * stamp.width + x] || 0;
                        if (!tileId || this.tilemapManager.isHigherTile(tileId) !== higherPass) continue;
                        this.tilemapManager.drawTileToCanvas(ctx, tileId, x, y, images, tileSize);
                    }
                }
            }
        }

        ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
        for (let y = 0; y < stamp.height; y++) {
            for (let x = 0; x < stamp.width; x++) {
                const shadow = stamp.data[4 * layerSize + y * stamp.width + x] || 0;
                for (let quadrant = 0; quadrant < 4; quadrant++) {
                    if (!(shadow & (1 << quadrant))) continue;
                    ctx.fillRect(
                        x * tileSize + (quadrant % 2) * tileSize / 2,
                        y * tileSize + Math.floor(quadrant / 2) * tileSize / 2,
                        tileSize / 2,
                        tileSize / 2
                    );
                }
            }
        }

        if (this.regionManager?.enabled) {
            for (let y = 0; y < stamp.height; y++) {
                for (let x = 0; x < stamp.width; x++) {
                    const region = stamp.data[5 * layerSize + y * stamp.width + x] || 0;
                    if (!region) continue;
                    const color = this.regionManager.regionColors[region] || 0;
                    ctx.fillStyle = `rgba(${color >> 16}, ${(color >> 8) & 255}, ${color & 255}, 0.35)`;
                    ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }

        const texture = PIXI.Texture.from(canvas);
        if (texture.source?.style) texture.source.style.scaleMode = 'nearest';
        return texture;
    }

    showMapSampleSelection(start, current) {
        if (!this.previewLayer || !this.tilemapManager.currentMap) return;
        const map = this.tilemapManager.currentMap;
        const minX = Math.max(0, Math.min(map.width - 1, Math.min(start.x, current.x)));
        const maxX = Math.max(0, Math.min(map.width - 1, Math.max(start.x, current.x)));
        const minY = Math.max(0, Math.min(map.height - 1, Math.min(start.y, current.y)));
        const maxY = Math.max(0, Math.min(map.height - 1, Math.max(start.y, current.y)));
        this._resetPreviewLayer();
        this.previewGraphics.rect(
            minX * this.tilemapManager.TILE_WIDTH,
            minY * this.tilemapManager.TILE_HEIGHT,
            (maxX - minX + 1) * this.tilemapManager.TILE_WIDTH,
            (maxY - minY + 1) * this.tilemapManager.TILE_HEIGHT
        );
        this.previewGraphics.fill({ color: 0x5bc0de, alpha: 0.18 });
        this.previewGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
    }

    finishMapSampling() {
        if (!this.mapSampleDrag || !this.tilemapManager.currentMap) return;
        const { start, current } = this.mapSampleDrag;
        this.mapSampleDrag = null;
        this.clearPreview();

        // Picking a single autotile takes the kind for ordinary painting, and
        // remembers the exact piece for Shift-painting, as RPG Maker's own
        // right-click does: Shift+click then stamps that corner verbatim. A
        // sampled *area* is a different gesture and is handled below.
        if (start.x === current.x && start.y === current.y
            && this.selectPickedAutotile(start.x, start.y)) {
            return;
        }

        this.activateMapStamp(this.captureMapStamp(
            this.tilemapManager.currentMap, start, current));
    }

    /**
     * Point the palette at the autotile kind under a picked cell, carrying the
     * picked piece's exact id (`tileId`) for Shift-painting.
     *
     * Returns false when the cell holds no autotile, leaving the caller to fall
     * back to a verbatim stamp.
     */
    selectPickedAutotile(x, y) {
        const map = this.tilemapManager.currentMap;
        const palette = this.tilesetPaletteViewer;
        if (!map || !palette) return false;

        const layerSize = map.width * map.height;
        for (let layer = 3; layer >= 0; layer--) {
            const tileId = map.data[layer * layerSize + y * map.width + x] || 0;
            if (tileId < 2048 || tileId >= 8192) continue;

            const position = this.palettePositionForTile(tileId);
            if (!position) return false;

            this.clearMapStamp();
            position.tileId = tileId;
            palette.selectedTiles = [position];
            palette.currentLayer = 'A';
            if (this.shadowPenMode) this.setShadowPenMode(false);
            if (this.eraserMode) this.setEraserMode(false);
            this.setTool('pencil', { preserveMapStamp: true });
            if (typeof palette.renderCurrentLayer === 'function') palette.renderCurrentLayer();
            return true;
        }
        return false;
    }

    /**
     * Where a tile id sits in the palette — the inverse of
     * `getBaseTileIdFromPalettePosition`, so a picked tile can be selected as
     * if it had been clicked there.
     */
    palettePositionForTile(tileId) {
        const autotiles = [
            { layer: 'A4', base: 5888 },
            { layer: 'A3', base: 4352 },
            { layer: 'A2', base: 2816 },
            { layer: 'A1', base: 2048 }
        ];
        for (const band of autotiles) {
            if (tileId >= band.base) {
                const kind = Math.floor((tileId - band.base) / 48);
                return { x: kind % 8, y: Math.floor(kind / 8), layer: band.layer };
            }
        }
        return null;
    }

    /**
     * The id a Shift-paint stamps for a palette tile: the exact piece a pick
     * remembered when it is of the same kind, else the kind's base shape.
     */
    exactAutotileId(paletteTile, baseTileId) {
        const exact = paletteTile && paletteTile.tileId;
        if (!Number.isInteger(exact) || exact < 2048 || exact >= 8192) return baseTileId;
        return Math.floor((exact - 2048) / 48) === Math.floor((baseTileId - 2048) / 48) ? exact : baseTileId;
    }

    paintMapStamp(x, y) {
        const map = this.tilemapManager.currentMap;
        if (!map || !this.mapStamp) return;
        const stamped = [];
        for (let row = 0; row < this.mapStamp.height; row++) {
            for (let col = 0; col < this.mapStamp.width; col++) {
                stamped.push({ x: x + col, y: y + row });
            }
        }
        const wallsBefore = this.captureWallState(stamped);
        const result = this.applyMapStamp(map, this.mapStamp, { x, y });
        if (!result.changed) return;
        if (!this.preserveAutotileShape) {
            for (const update of this.reshapeStampedAutotiles(map, this.mapStamp, { x, y })) {
                result.visualUpdates.push(update);
            }
        }
        // The shadows come back from the walls the paste actually contains,
        // rather than travelling with the copy: a stretch lifted from beside a
        // wall would otherwise arrive carrying that wall's shadow with no wall
        // to cast it.
        for (const update of this.refreshAutoShadow(wallsBefore)) result.visualUpdates.push(update);
        if (result.visualUpdates.length) this.tilemapManager.updateTiles(result.visualUpdates);
        if (result.regionUpdates.length && this.regionManager?.enabled) {
            if (result.regionUpdates.length > 1000) this.regionManager.renderRegions();
            else this.regionManager.updateRegionCells(result.regionUpdates);
        }
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
            this.previewLayer.destroy({ children: true });
            this.previewGraphics = null;
        }
        if (this.tilePreviewContainer) {
            if (this.tilePreviewContainer.parent) {
                this.tilePreviewContainer.parent.removeChild(this.tilePreviewContainer);
            }
            this.tilePreviewContainer.destroy({ children: true });
        }

        // Create a layer for drawing previews (rectangles, circles)
        // previewLayer is a Container, not a Graphics. It is used as a parent
        // (tile sprites and per-tile borders are added to it on every pointer
        // move), and PIXI v8 deprecated parenting to a Graphics: each addChild
        // ran a deprecation path, and the node does not batch like a container.
        // Vector drawing moved to a dedicated child, previewGraphics.
        this.previewLayer = new PIXI.Container();
        this.previewGraphics = new PIXI.Graphics();
        this.previewLayer.addChild(this.previewGraphics);
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

    setTool(tool, options = {}) {
        if (!options.preserveMapStamp && this.mapStamp) this.clearMapStamp();
        // Save current tool as previous before switching
        if (this.currentTool) {
            this.previousTool = this.currentTool;
        }
        this.currentTool = tool;
    }

    setEraserMode(enabled) {
        if (enabled && this.mapStamp) this.clearMapStamp();
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
        if (enabled && this.mapStamp) this.clearMapStamp();
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
        // MZ-style feedback: dim every other layer while one is selected
        if (this.tilemapManager && this.tilemapManager.setLayerDimming) {
            this.tilemapManager.setLayerDimming(mode);
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;

        // Hide preview when disabled
        if (!enabled) {
            if (this.mapStamp || this.mapSampleDrag) this.clearMapStamp();
            if (this.isDrawing || this.activeEditState) {
                this.resetDrawingState(true);
            } else {
                this.hideTilePreview();
                this.clearPreview();
            }
        }
    }

    /**
     * Paint elevation under the brush.
     *
     * Raise and lower step from whatever is already there, so a slope can be
     * built by dragging over the same ground twice; Set writes one level, which
     * is what flattening a terrace or cutting a floor wants.
     */
    /**
     * Tell whoever is drawing the map in 3D that the massing moved.
     *
     * Announced per change rather than per stroke, so the 3D view follows the
     * brush as it is dragged — shaping ground you cannot see the effect of
     * until you let go is guesswork. The listener there is debounced, so a long
     * drag still costs one rebuild rather than one per cell.
     */
    notifyElevationChanged() {
        if (typeof this.onElevationChanged === 'function') {
            this.onElevationChanged(this.tilemapManager && this.tilemapManager.currentMap);
        }
        this.notifyMapEdited();
    }


    // Undo/Redo system methods
    trimMapHistory(stack) {
        const dataLength = this.tilemapManager?.currentMap?.data?.length || 0;
        const memoryBound = dataLength > 0
            ? Math.max(1, Math.floor((64 * 1024 * 1024) / (dataLength * 12)))
            : this.maxUndoSteps;
        const limit = Math.min(this.maxUndoSteps, memoryBound);
        while (stack.length > limit) stack.shift();
    }

    saveState() {
        if (!this.tilemapManager.currentMap) return;

        // Save a copy of the current map data (flat numeric array — slice is
        // a full snapshot at a fraction of the JSON round-trip cost)
        const mapData = this.tilemapManager.currentMap.data.slice();
        this.undoStack.push(mapData);

        // Clear redo stack on new action
        this.redoStack = [];

        // Limit undo stack size
        this.trimMapHistory(this.undoStack);

        // Notify about undo state change
        this.notifyUndoStateChange();
    }

    beginEditState() {
        if (!this.tilemapManager.currentMap) return;
        // The 3D object tab does not touch `map.data` at all, so the ordinary
        // snapshot would record a change that never happened and miss the one
        // that did.
        if (this.tilesetPaletteViewer?.currentLayer === 'O') {
            this.beginObject3DState();
            return;
        }
        if (this.activeEditState) return;

        // Flat numeric array: slice + element compare replaces three
        // whole-map JSON serializations per stroke (tens of ms of jank at
        // pointer-down and pointer-up on a 256×256 map).
        this.activeEditState = {
            beforeData: this.tilemapManager.currentMap.data.slice()
        };
    }

    _editStateChanged() {
        const before = this.activeEditState.beforeData;
        const now = this.tilemapManager.currentMap.data;
        if (before.length !== now.length) return true;
        for (let i = 0; i < now.length; i++) {
            if (before[i] !== now[i]) return true;
        }
        return false;
    }

    commitEditState() {
        if (this.activeObject3DState) {
            this.commitObject3DState();
            return;
        }
        if (!this.activeEditState || !this.tilemapManager.currentMap) {
            this.activeEditState = null;
            return;
        }

        if (this._editStateChanged()) {
            this.undoStack.push(this.activeEditState.beforeData);
            this.redoStack = [];

            this.trimMapHistory(this.undoStack);

            this.notifyUndoStateChange();
            this.notifyMapEdited();
        }

        this.activeEditState = null;
    }

    /**
     * Announce that the map's tile data changed.
     *
     * Announced rather than pushed to the 3D viewport directly: the map editor
     * has no business knowing what else is looking at the map, and this fires
     * once per completed stroke rather than once per painted tile.
     */
    notifyMapEdited() {
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', {
            detail: { mapId: this.tilemapManager?.currentMap?.id }
        }));
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
        this.preserveAutotileShape = false;
        this.lastPaintedTile = { x: -1, y: -1, quadrant: -1 };

        // A height stroke has its own before-snapshot, and commits whichever
        // way the stroke ended: there is no half-applied elevation to cancel,
        // only a stroke worth remembering or one that changed nothing.
        if (this.activeElevationState) this.commitElevationState();

        if (commitEdit) {
            this.commitEditState();
        } else {
            this.cancelEditState();
        }

        if (this.tilemapManager && this.tilemapManager.resumeLazyLoading) {
            this.tilemapManager.resumeLazyLoading();
        }
    }

    /**
     * A snapshot only fits the map it was taken from. Map Properties can resize
     * the map between a paint and an undo, and the stored array is then sized
     * for the old dimensions — restoring it would leave currentMap.data at the
     * wrong length while width/height say otherwise, which renders as garbage
     * and, once saved, writes a corrupt Map###.json. Discard stale snapshots
     * rather than trusting them.
     */
    isUndoSnapshotValid(snapshot) {
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        if (!map) return false;
        // A props snapshot is the map's own list, any map: it is checked by its map id.
        if (snapshot && snapshot.kind === 'props') return snapshot.mapId === map.id;
        // Elevation strokes share this stack so one Ctrl+Z steps back through
        // the work in the order it was done, rather than the author having to
        // know which of two histories a change went into. A bare array is the
        // tile kind, which is what every entry was before heights existed.
        if (snapshot && snapshot.kind === 'elevation') {
            return Array.isArray(snapshot.data)
                && snapshot.data.length === map.width * map.height;
        }
        // Grouping strokes share it too. Their payload is per layer and
        // sparse, so it is checked by the length of whatever planes it holds.
        if (snapshot && snapshot.kind === 'object3d') {
            const plane = map.width * map.height;
            const fits = store => !store || Object.keys(store).every(layer =>
                Array.isArray(store[layer]) && store[layer].length === plane);
            return !!snapshot.data && fits(snapshot.data.objects)
                && fits(snapshot.data.objectGround);
        }
        if (!Array.isArray(snapshot)) return false;
        return snapshot.length === map.width * map.height * 6;
    }

    /** The elevation module, absent on a host that never loaded it. */
    mapElevation() {
        return (typeof RRMapElevation !== 'undefined' && RRMapElevation)
            || (typeof window !== 'undefined' && window.RRMapElevation) || null;
    }

    /** Remember the height field before a stroke changes it. */
    beginElevationState() {
        const elevation = this.mapElevation();
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        if (!elevation || !map || this.activeElevationState) return;
        elevation.ensure(map);
        this.activeElevationState = { before: elevation.snapshot(map) };
    }

    mapObjects3D() {
        return (typeof RRMapObjects3D !== 'undefined' && RRMapObjects3D)
            || (typeof window !== 'undefined' && window.RRMapObjects3D) || null;
    }

    /**
     * Remember the grouping before a stroke changes it.
     *
     * Grouping lives in the map's sidecar rather than in `map.data`, so the
     * ordinary undo snapshot — a slice of that one array — cannot see it. It
     * gets its own kind of entry on the shared stack instead, so one Ctrl+Z
     * steps back through the work in the order it was done.
     */
    beginObject3DState() {
        const store = this.mapObjects3D();
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        if (!store || !map || this.activeObject3DState) return;
        this.activeObject3DState = { before: store.snapshot(map) };
    }

    commitObject3DState() {
        const store = this.mapObjects3D();
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        const state = this.activeObject3DState;
        this.activeObject3DState = null;
        if (!store || !map || !state) return;
        const now = store.snapshot(map);
        if (JSON.stringify(now) === JSON.stringify(state.before)) return;

        this.undoStack.push({ kind: 'object3d', data: state.before });
        this.redoStack = [];
        this.trimMapHistory(this.undoStack);
        this.notifyUndoStateChange();
        this.notifyMapEdited();
    }

    /** Put a grouping snapshot back, and redraw whatever is showing it. */
    restoreObject3DState(state) {
        const store = this.mapObjects3D();
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        if (!store || !map) return null;
        const now = store.snapshot(map);
        store.restore(map, state);
        this.object3DManager?.refresh();
        this.object3DManager?.renderPalette?.();
        return now;
    }

    /** Push that stroke onto the shared undo stack, if it changed anything. */
    commitElevationState() {
        const elevation = this.mapElevation();
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        const state = this.activeElevationState;
        this.activeElevationState = null;
        if (!elevation || !map || !state || !state.before) return;
        const now = elevation.snapshot(map);
        if (!now || now.length !== state.before.length) return;
        if (state.before.every((value, index) => value === now[index])) return;

        this.undoStack.push({ kind: 'elevation', data: state.before });
        this.redoStack = [];
        this.trimMapHistory(this.undoStack);
        this.notifyUndoStateChange();
        this.notifyMapEdited();
    }

    dropStaleUndoStates() {
        const before = this.undoStack.length + this.redoStack.length;
        this.undoStack = this.undoStack.filter(state => this.isUndoSnapshotValid(state));
        this.redoStack = this.redoStack.filter(state => this.isUndoSnapshotValid(state));
        return before !== this.undoStack.length + this.redoStack.length;
    }

    /** The props tab's edits share this history: a snapshot of the map's prop list before a change. */
    recordPropsState(snapshot) {
        const map = this.tilemapManager && this.tilemapManager.currentMap;
        if (!map) return;
        this.undoStack.push({ kind: 'props', mapId: map.id, data: snapshot });
        this.redoStack = [];
        this.trimMapHistory(this.undoStack);
        this.notifyUndoStateChange();
    }

    propsManager() {
        return this.projectController?.modelPropsManager || window.reactor?.modelPropsManager || null;
    }

    undo() {
        if (this.dropStaleUndoStates()) this.notifyUndoStateChange();
        if (this.undoStack.length === 0) return;

        if (this.undoStack[this.undoStack.length - 1]?.kind === 'props') {
            const entry = this.undoStack.pop();
            const manager = this.propsManager();
            if (manager) {
                this.redoStack.push({ kind: 'props', mapId: entry.mapId, data: manager.snapshotProps() });
                this.trimMapHistory(this.redoStack);
                manager.restoreProps(entry.data);
            }
            this.notifyUndoStateChange();
            this.notifyMapEdited();
            return;
        }

        // An elevation entry restores the height field and leaves the tiles
        // alone; the two kinds share one stack but not one payload.
        if (this.undoStack[this.undoStack.length - 1]?.kind === 'object3d') {
            const entry = this.undoStack.pop();
            this.redoStack.push({ kind: 'object3d', data: this.restoreObject3DState(entry.data) });
            this.trimMapHistory(this.redoStack);
            this.notifyUndoStateChange();
            this.notifyMapEdited();
            return;
        }

        if (this.undoStack[this.undoStack.length - 1]?.kind === 'elevation') {
            const entry = this.undoStack.pop();
            const elevation = this.mapElevation();
            const map = this.tilemapManager.currentMap;
            this.redoStack.push({ kind: 'elevation', data: elevation.snapshot(map) });
            this.trimMapHistory(this.redoStack);
            elevation.restore(map, entry.data);
            this.notifyElevationChanged();
            this.notifyUndoStateChange();
            this.notifyMapEdited();
            return;
        }

        // Save current state to redo stack
        this.redoStack.push(this.tilemapManager.currentMap.data.slice());
        this.trimMapHistory(this.redoStack);

        // Restore previous state
        const previousData = this.undoStack.pop();
        this.tilemapManager.currentMap.data = previousData;

        // Re-render the map without yanking the view back to the origin
        this.tilemapManager.renderMap({ preserveScroll: true });

        // Refresh region overlay if visible
        if (this.regionManager && this.regionManager.enabled) {
            this.regionManager.renderRegions();
        }

        // Notify about undo state change
        this.notifyUndoStateChange();
        this.notifyMapEdited();
    }

    redo() {
        if (this.dropStaleUndoStates()) this.notifyUndoStateChange();
        if (this.redoStack[this.redoStack.length - 1]?.kind === 'props') {
            const entry = this.redoStack.pop();
            const manager = this.propsManager();
            if (manager) {
                this.undoStack.push({ kind: 'props', mapId: entry.mapId, data: manager.snapshotProps() });
                this.trimMapHistory(this.undoStack);
                manager.restoreProps(entry.data);
            }
            this.notifyUndoStateChange();
            this.notifyMapEdited();
            return;
        }
        if (this.redoStack.length === 0) return;

        if (this.redoStack[this.redoStack.length - 1]?.kind === 'object3d') {
            const entry = this.redoStack.pop();
            this.undoStack.push({ kind: 'object3d', data: this.restoreObject3DState(entry.data) });
            this.trimMapHistory(this.undoStack);
            this.notifyUndoStateChange();
            this.notifyMapEdited();
            return;
        }

        if (this.redoStack[this.redoStack.length - 1]?.kind === 'elevation') {
            const entry = this.redoStack.pop();
            const elevation = this.mapElevation();
            const map = this.tilemapManager.currentMap;
            this.undoStack.push({ kind: 'elevation', data: elevation.snapshot(map) });
            this.trimMapHistory(this.undoStack);
            elevation.restore(map, entry.data);
            this.notifyElevationChanged();
            this.notifyUndoStateChange();
            this.notifyMapEdited();
            return;
        }

        // Save current state to undo stack
        this.undoStack.push(this.tilemapManager.currentMap.data.slice());
        this.trimMapHistory(this.undoStack);

        // Restore next state
        const nextData = this.redoStack.pop();
        this.tilemapManager.currentMap.data = nextData;

        // Re-render the map without yanking the view back to the origin
        this.tilemapManager.renderMap({ preserveScroll: true });

        // Refresh region overlay if visible
        if (this.regionManager && this.regionManager.enabled) {
            this.regionManager.renderRegions();
        }

        // Notify about undo state change
        this.notifyUndoStateChange();
        this.notifyMapEdited();
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
        this.clearMapStamp();
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

        this._shiftAutotilePaintClaim = event => this.claimsShiftAutotilePaint(event);
        this.tilemapManager.shouldBypassShiftPanning = this._shiftAutotilePaintClaim;

        // Remove only OUR previous listeners. A blanket off('pointerdown')
        // strips EVERY listener for the event — including TilemapManager's
        // pan handlers registered on the same container, which left
        // middle-mouse/Shift+drag panning dead on arrival.
        if (this._mapPointerHandlers && this._mapPointerHandlersContainer === container) {
            for (const [ev, fn] of Object.entries(this._mapPointerHandlers)) {
                container.off(ev, fn);
            }
        }
        this._mapPointerHandlers = {};
        this._mapPointerHandlersContainer = container;
        const _rrOn = (ev, fn) => {
            this._mapPointerHandlers[ev] = fn;
            container.on(ev, fn);
        };

        const mapTileFromEvent = (event, clamp = false) => {
            const pos = event.data.getLocalPosition(container);
            let x = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            let y = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);
            const map = this.tilemapManager.currentMap;
            if (clamp && map) {
                x = Math.max(0, Math.min(map.width - 1, x));
                y = Math.max(0, Math.min(map.height - 1, y));
            }
            return { x, y, pos };
        };

        // Make container interactive
        container.interactive = true;
        container.cursor = 'crosshair';

        _rrOn('rightdown', (event) => {
            if (!this.enabled || !this.tilemapManager.currentMap) return;
            const tile = mapTileFromEvent(event);
            const map = this.tilemapManager.currentMap;
            if (tile.x < 0 || tile.y < 0 || tile.x >= map.width || tile.y >= map.height) return;

            event.data.originalEvent?.preventDefault?.();
            event.stopPropagation();
            this.hideTilePreview();
            this.mapSampleDrag = {
                start: { x: tile.x, y: tile.y },
                current: { x: tile.x, y: tile.y }
            };
            this.showMapSampleSelection(this.mapSampleDrag.start, this.mapSampleDrag.current);
        });

        // Mouse down - start drawing
        _rrOn('pointerdown', (event) => {
            // Don't process if map editor is disabled (event mode is active)
            if (!this.enabled) return;

            // Shift+left-click on an autotile pencil selection preserves the exact
            // selected shape. Every other Shift gesture remains map panning.
            const preserveAutotileShape = this.claimsShiftAutotilePaint(event);
            this.preserveAutotileShape = preserveAutotileShape;
            if (event.data.button !== 0 || (event.data.originalEvent.shiftKey && !preserveAutotileShape)) {
                return;
            }

            // Don't process if no tool is selected (neither drawing tool nor shadow pen nor eraser)
            if (!this.currentTool && !this.shadowPenMode && !this.eraserMode) {
                return;
            }

            const pos = event.data.getLocalPosition(container);
            /*
             * Where the press landed, not where the pointer was last seen.
             *
             * The shadow pen paints a quadrant of a cell, and it works out
             * which quadrant from `lastMousePos` — which only `pointermove`
             * used to set. A press with no move before it therefore had
             * nothing to read: `toggleShadow` takes a missing position as
             * "cannot tell which quarter" and returns, so a single click
             * painted nothing at all while a drag worked perfectly, because
             * the drag's first move filled the field in. Reading a stale
             * position was the same bug wearing a disguise — the quadrant came
             * from wherever the pointer had last moved rather than from where
             * it was pressed.
             */
            this.lastMousePos = pos;
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
            // The eraser is a modifier on the active tool, not a tool of its
            // own. Bucket still floods — eraseFillArea handles the erase — and
            // the shape tools still apply on pointerup so the area can be
            // dragged out first. Letting the eraser claim the click outright
            // made the bucket behave like the pencil and left eraseFillArea
            // unreachable.
            if (this.eraserMode && this.currentTool !== 'rectangle' &&
                this.currentTool !== 'circle' && this.currentTool !== 'fill') {
                this.paintTile(tileX, tileY);
            } else if (this.shadowPenMode) {
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
        _rrOn('pointermove', (event) => {
            // Don't process if map editor is disabled (event mode is active)
            if (!this.enabled) return;

            const pos = event.data.getLocalPosition(container);
            this.lastMousePos = pos; // Store for quadrant calculation
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            if (this.mapSampleDrag) {
                const tile = mapTileFromEvent(event, true);
                this.mapSampleDrag.current = { x: tile.x, y: tile.y };
                this.showMapSampleSelection(this.mapSampleDrag.start, this.mapSampleDrag.current);
                return;
            }

            this.preserveAutotileShape = Boolean(event.data.originalEvent.shiftKey) &&
                this.canPreserveAutotileShape();

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
        _rrOn('pointerup', (event) => {
            if (this.mapSampleDrag) {
                const tile = mapTileFromEvent(event, true);
                this.mapSampleDrag.current = { x: tile.x, y: tile.y };
                this.finishMapSampling();
                this.updateTilePreview(tile.x, tile.y);
                return;
            }
            if (!this.isDrawing) return;

            const pos = event.data.getLocalPosition(container);
            const tileX = Math.floor(pos.x / this.tilemapManager.TILE_WIDTH);
            const tileY = Math.floor(pos.y / this.tilemapManager.TILE_HEIGHT);

            this.preserveAutotileShape = Boolean(event.data.originalEvent.shiftKey) &&
                this.canPreserveAutotileShape();

            if (this.currentTool === 'rectangle') {
                this.paintRectangle(this.drawStart, { x: tileX, y: tileY });
            } else if (this.currentTool === 'circle') {
                this.paintCircle(this.drawStart, { x: tileX, y: tileY });
            }

            this.resetDrawingState(true);
        });

        _rrOn('pointerupoutside', () => {
            if (this.mapSampleDrag) {
                this.finishMapSampling();
                return;
            }
            if (!this.isDrawing) return;
            this.resetDrawingState(true);
        });

        _rrOn('pointercancel', () => {
            if (this.mapSampleDrag) {
                this.mapSampleDrag = null;
                this.clearPreview();
                return;
            }
            if (!this.isDrawing) return;
            this.resetDrawingState(true);
        });

        // Mouse leave - hide tile preview and clear coordinates
        _rrOn('pointerleave', () => {
            if (!this.mapSampleDrag) this.hideTilePreview();
            if (!this.isDrawing) this.preserveAutotileShape = false;

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
                if (this.mapSampleDrag) {
                    this.mapSampleDrag = null;
                    this.clearPreview();
                } else if (this.isDrawing) {
                    this.resetDrawingState(true);
                } else {
                    this.preserveAutotileShape = false;
                    this.hideTilePreview();
                    this.clearPreview();
                }
            };
            window.addEventListener('blur', this._windowBlurHandler);
        }
    }

    canPreserveAutotileShape() {
        if (!this.enabled || !['pencil', 'rectangle', 'circle'].includes(this.currentTool) || this.eraserMode ||
            this.shadowPenMode) return false;
        // A stamp carries its own tiles rather than a palette selection, and
        // Shift means the same thing for it: put the pieces down exactly as
        // they were lifted instead of rebuilding them where they land.
        if (this.mapStamp) return true;
        const currentLayer = this.tilesetPaletteViewer?.currentLayer;
        const selectedTiles = this.tilesetPaletteViewer?.selectedTiles;
        return currentLayer !== 'R' && Array.isArray(selectedTiles) && selectedTiles.length > 0 &&
            selectedTiles.every(tile => ['A1', 'A2', 'A3', 'A4'].includes(tile.layer || currentLayer));
    }

    claimsShiftAutotilePaint(event) {
        return event?.data?.button === 0 && Boolean(event.data.originalEvent?.shiftKey) &&
            this.canPreserveAutotileShape();
    }

    preservesSelectedAutotileShapes(selectedTiles, currentLayer = this.tilesetPaletteViewer?.currentLayer) {
        return this.preserveAutotileShape && Array.isArray(selectedTiles) && selectedTiles.length > 0 &&
            selectedTiles.every(tile => ['A1', 'A2', 'A3', 'A4'].includes(tile.layer || currentLayer));
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

        if (this.mapStamp) {
            if (this.lastPaintedTile.x === x && this.lastPaintedTile.y === y) return;
            this.lastPaintedTile = { x, y, quadrant: -1 };
            this.paintMapStamp(x, y);
            return;
        }

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

        // If eraser mode, erase layer-aware (no tile selection needed).
        // On the Regions tab the eraser clears the REGION at the cell —
        // it used to silently delete map tiles hidden under the overlay.
        if (this.eraserMode) {
            if (currentLayer === 'R') {
                const index = 5 * layerSize + y * width + x;
                data[index] = 0;
                if (this.regionManager && this.regionManager.enabled) {
                    this.regionManager.updateRegionCells([{ x, y }]);
                }
                return;
            }
            // The same reasoning on the 3D tab: what is on screen is the
            // grouping, so that is what the eraser takes — deleting the map
            // tiles hidden under the overlay is never what was meant.
            if (currentLayer === 'O') {
                this.eraseObject3DArea(x, x, y, y, null);
                return;
            }
            this.eraseTilesAtPositions([{ x, y }]);
            return;
        }

        // Which cells are one 3D object. Painted on the map because a tileset
        // cannot say it: an autotile id is a corner arrangement shared by
        // forty-eight shapes, so every shop built from one wall kind is the
        // same tile as every other.
        if (currentLayer === 'O') {
            if (this.object3DManager && this.object3DManager.paintCell(x, y)) {
                this.object3DManager.refresh();
            }
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

            // Refresh only the painted cell in the overlay
            if (this.regionManager.enabled) {
                this.regionManager.updateRegionCells([{ x, y }]);
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

        const preserveSelectedAutotileShapes = this.preservesSelectedAutotileShapes(selectedTiles, currentLayer);

        // Paint the selected tiles (support multi-tile selection)
        const minX = Math.min(...selectedTiles.map(t => t.x));
        const minY = Math.min(...selectedTiles.map(t => t.y));

        // PERFORMANCE: Track affected tiles for incremental update
        const affectedTiles = new Set();
        // No longer tracking autotiles for recalculation - tiles placed with correct shapes immediately

        // Where the walls stand before anything is written, so the shadow pass
        // at the end can tell which of them the brush actually moved.
        const wallsBefore = this.captureWallState(selectedTiles.map(tile => ({
            x: x + (tile.x - minX),
            y: y + (tile.y - minY)
        })));

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

                        // Erase tiles based on what we're placing.
                        // Manual layer mode writes ONLY to the selected
                        // z-slot and must never clear the other layers.
                        if (this.layerMode !== 'auto') {
                            // no cross-layer erasing in manual mode
                        } else if (!isA1Water) {
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

                        // Moving a broken same-kind run back onto its upper
                        // neighbor slot must not leave the stale lower copy.
                        if (this.layerMode === 'auto' && actualPlacementLayer === 1 &&
                            this.sameAutotileKind(data[basePos], baseTileId)) {
                            data[basePos] = 0;
                            affectedTiles.add(`${targetX},${targetY},0`);
                        }

                        // Place the tile with base shape (a Shift-paint of a picked piece: that piece)
                        const targetLayerIndex = actualPlacementLayer * layerSize + basePos;
                        data[targetLayerIndex] = preserveSelectedAutotileShapes ? this.exactAutotileId(tile, baseTileId) : baseTileId;
                        affectedTiles.add(`${targetX},${targetY},${actualPlacementLayer}`);

                        // For A1/A2 decorations on layer 1, also update layer 0 for proper rendering
                        if ((isA1Decoration || isA2Decoration) && actualPlacementLayer === 1) {
                            affectedTiles.add(`${targetX},${targetY},0`);
                        }

                        if (!preserveSelectedAutotileShapes) {
                            const shapeResult = this.calculateAutotileShape(
                                baseTileId, targetX, targetY, null, actualPlacementLayer);
                            data[targetLayerIndex] = shapeResult.tileId;
                        }
                    } else {
                        // For non-autotiles, use the original function
                        const tileId = this.getTileIdFromPalettePosition(tile.x, tile.y, tileLayer, targetX, targetY);
                        // B-E tiles use the layering system (L1-L4)
                        const placementLayer = this.findAvailableLayer(
                            data, width, height, targetX, targetY, layerIndex, tileId);

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

        if (preserveSelectedAutotileShapes) {
            this.tilemapManager.updateTiles([...affectedTiles].map(tileKey => {
                const [tileX, tileY, layer] = tileKey.split(',').map(Number);
                return { x: tileX, y: tileY, layer };
            }));
            return;
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

        // A wall built here casts on the cell east of it.
        for (const update of this.refreshAutoShadow(wallsBefore)) {
            affectedTiles.add(`${update.x},${update.y},${update.layer}`);
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
            const preserveAutotileShape = this.preserveAutotileShape &&
                ['A1', 'A2', 'A3', 'A4'].includes(tileLayer);

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
                    // Manual layer mode writes ONLY to the selected z-slot
                    // and must never clear the other layers.
                    if (this.layerMode !== 'auto') {
                        // no cross-layer erasing in manual mode
                    } else if (!isA1Water) {
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

                    if (this.layerMode === 'auto' && actualPlacementLayer === 1 &&
                        this.sameAutotileKind(data[basePos], baseTileId)) {
                        data[basePos] = 0;
                    }

                    // First, place the tile in map data with base shape so it's included in neighbor checks
                    const targetLayerIndex = actualPlacementLayer * layerSize + basePos;
                    data[targetLayerIndex] = baseTileId; // Base shape first

                    if (preserveAutotileShape) {
                        // A picked piece is stamped as it was, corner and all.
                        data[targetLayerIndex] = this.exactAutotileId(paletteTile, baseTileId);
                    } else {
                        const result = this.calculateAutotileShape(
                            baseTileId, mapX, mapY, null, actualPlacementLayer);
                        data[targetLayerIndex] = result.tileId;
                    }

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
                        if (!preserveAutotileShape) this.updateNeighboringAutotiles(mapX, mapY);
                    }
                    // NOTE: Erased tiles will be updated by the batch update at the end (paintRectangle/paintCircle)
                    // which already includes all layers 0-3 for each painted position
                } else {
                    // For non-autotiles, calculate tile ID normally
                    const tileId = this.getTileIdFromPalettePosition(paletteTile.x, paletteTile.y, tileLayer, mapX, mapY);
                    // B-E tiles use the layering system (L1-L4)
                    const placementLayer = this.findAvailableLayer(
                        data, width, height, mapX, mapY, layerIndex, tileId);

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

    // Paint the selected region over every cell in [minX..maxX]×[minY..maxY]
    // that includeFn accepts (includeFn null = whole rectangle). Regions live
    // on z5 and are selected in the RegionManager, not the tile palette.
    paintRegionArea(minX, maxX, minY, maxY, includeFn, regionOverride = null) {
        if (!this.regionManager) return;
        if (regionOverride === null &&
            (!this.regionManager.selectedTiles ||
             this.regionManager.selectedTiles.length === 0)) {
            return;
        }
        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        const region = regionOverride !== null ? regionOverride : this.regionManager.selectedRegion;
        const painted = [];
        for (let y = Math.max(0, minY); y <= Math.min(height - 1, maxY); y++) {
            for (let x = Math.max(0, minX); x <= Math.min(width - 1, maxX); x++) {
                if (includeFn && !includeFn(x, y)) continue;
                data[5 * layerSize + y * width + x] = region;
                painted.push({ x, y });
            }
        }
        if (this.regionManager.enabled) {
            this.regionManager.updateRegionCells(painted);
        }
    }

    /** Group every cell in an area into the selected object. */
    paintObject3DArea(minX, maxX, minY, maxY, includeFn) {
        const manager = this.object3DManager;
        const map = this.tilemapManager.currentMap;
        if (!manager || !map) return;
        let changed = false;
        for (let y = Math.max(0, minY); y <= Math.min(map.height - 1, maxY); y++) {
            for (let x = Math.max(0, minX); x <= Math.min(map.width - 1, maxX); x++) {
                if (includeFn && !includeFn(x, y)) continue;
                if (manager.paintCell(x, y)) changed = true;
            }
        }
        if (changed) manager.refresh();
    }

    /**
     * Clear the grouping over an area.
     *
     * Only the object number goes; the tiles stay exactly where they are. In
     * footing mode it clears the footing mark instead, so an author can take
     * back "these rows are the ground" without ungrouping the building.
     */
    eraseObject3DArea(minX, maxX, minY, maxY, includeFn) {
        const manager = this.object3DManager;
        const store = typeof window !== 'undefined' ? window.RRMapObjects3D : null;
        const map = this.tilemapManager.currentMap;
        if (!manager || !store || !map) return;
        let changed = false;
        for (let y = Math.max(0, minY); y <= Math.min(map.height - 1, maxY); y++) {
            for (let x = Math.max(0, minX); x <= Math.min(map.width - 1, maxX); x++) {
                if (includeFn && !includeFn(x, y)) continue;
                for (const layer of manager.layersAt(x, y)) {
                    changed = manager.groundMode
                        ? store.setGroundAt(map, x, y, layer, false) || changed
                        : store.setAt(map, x, y, layer, 0) || changed;
                }
            }
        }
        if (changed) manager.refresh();
    }

    // Paint a rectangle of tiles
    paintRectangle(start, end) {
        if (!this.tilemapManager.currentMap) return;

        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        if (this.eraserMode) {
            if (this.tilesetPaletteViewer.currentLayer === 'R') {
                this.paintRegionArea(minX, maxX, minY, maxY, null, 0);
                return;
            }
            if (this.tilesetPaletteViewer.currentLayer === 'O') {
                this.eraseObject3DArea(minX, maxX, minY, maxY, null);
                return;
            }
            const positions = [];
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    positions.push({ x, y });
                }
            }
            this.eraseTilesAtPositions(positions);
            return;
        }

        // Region painting (z5): the tile-pattern path below would default the
        // 'R' tab to layer 0 and paint tiles from a stale palette selection.
        if (this.tilesetPaletteViewer.currentLayer === 'R') {
            this.paintRegionArea(minX, maxX, minY, maxY, null);
            return;
        }
        if (this.tilesetPaletteViewer.currentLayer === 'O') {
            this.paintObject3DArea(minX, maxX, minY, maxY, null);
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

        // Where the walls stand before the area is filled in, so the shadow
        // pass at the end can tell which of them this stroke moved. The whole
        // bounding box is noted rather than the shape: recording a cell the
        // stroke turns out not to touch costs nothing, since the pass only
        // acts where a wall actually came or went.
        const wallsBefore = new Map();
        for (let noteY = minY; noteY <= maxY; noteY++) {
            for (let noteX = minX; noteX <= maxX; noteX++) {
                this.noteWallState(wallsBefore, noteX, noteY);
            }
        }

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

        if (this.preservesSelectedAutotileShapes(selectedTiles)) {
            this.tilemapManager.updateTiles([...affectedTiles].map(tileKey => {
                const [tileX, tileY, layer] = tileKey.split(',').map(Number);
                return { x: tileX, y: tileY, layer };
            }));
            return;
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

        // A wall laid down by the area tools casts just as one from the brush does.
        for (const update of this.refreshAutoShadow(wallsBefore)) {
            affectedTiles.add(`${update.x},${update.y},${update.layer}`);
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
            if (this.tilesetPaletteViewer.currentLayer === 'R') {
                this.paintRegionArea(minX, maxX, minY, maxY, (x, y) =>
                    Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) <= radius, 0);
                return;
            }
            if (this.tilesetPaletteViewer.currentLayer === 'O') {
                this.eraseObject3DArea(minX, maxX, minY, maxY, (x, y) =>
                    Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) <= radius);
                return;
            }
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

        // Region painting (z5): same routing as paintRectangle — the tile
        // path below must never see the 'R' tab.
        if (this.tilesetPaletteViewer.currentLayer === 'R') {
            this.paintRegionArea(minX, maxX, minY, maxY, (x, y) =>
                Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) <= radius);
            return;
        }
        if (this.tilesetPaletteViewer.currentLayer === 'O') {
            this.paintObject3DArea(minX, maxX, minY, maxY, (x, y) =>
                Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) <= radius);
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

        // Where the walls stand before the area is filled in, so the shadow
        // pass at the end can tell which of them this stroke moved. The whole
        // bounding box is noted rather than the shape: recording a cell the
        // stroke turns out not to touch costs nothing, since the pass only
        // acts where a wall actually came or went.
        const wallsBefore = new Map();
        for (let noteY = minY; noteY <= maxY; noteY++) {
            for (let noteX = minX; noteX <= maxX; noteX++) {
                this.noteWallState(wallsBefore, noteX, noteY);
            }
        }

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

        if (this.preservesSelectedAutotileShapes(selectedTiles)) {
            this.tilemapManager.updateTiles([...affectedTiles].map(tileKey => {
                const [tileX, tileY, layer] = tileKey.split(',').map(Number);
                return { x: tileX, y: tileY, layer };
            }));
            return;
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

        // A wall laid down by the area tools casts just as one from the brush does.
        for (const update of this.refreshAutoShadow(wallsBefore)) {
            affectedTiles.add(`${update.x},${update.y},${update.layer}`);
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

        /*
         * Filling by object number, which is how a building gets grouped in
         * one gesture: click inside a structure and every connected cell that
         * belongs to the same object — usually none of them yet — takes the
         * selected number. The tile path below would default this tab to
         * layer 0 and fill tiles instead.
         */
        if (currentLayer === 'O') {
            const manager = this.object3DManager;
            if (!manager) return;
            const target = manager.readCell(startX, startY).id;
            if (!manager.groundMode && target === manager.selectedObject) return;
            const stack = [{ x: startX, y: startY }];
            const done = new Set();
            let changed = false;
            while (stack.length) {
                const cell = stack.pop();
                if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) continue;
                const key = cell.y * width + cell.x;
                if (done.has(key)) continue;
                done.add(key);
                if (manager.readCell(cell.x, cell.y).id !== target) continue;
                if (manager.paintCell(cell.x, cell.y)) changed = true;
                stack.push({ x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y },
                    { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 });
            }
            if (changed) manager.refresh();
            return;
        }

        // Region fill (z5): flood by region value; the tile path below would
        // default the 'R' tab to layer 0 and fill tiles instead.
        if (currentLayer === 'R') {
            if (!this.regionManager || !this.regionManager.selectedTiles ||
                this.regionManager.selectedTiles.length === 0) {
                return;
            }
            const layerSize = width * height;
            const targetRegion = data[5 * layerSize + startY * width + startX];
            const fillRegion = this.regionManager.selectedRegion;
            if (targetRegion === fillRegion) return;
            const stack = [{ x: startX, y: startY }];
            const filled = [];
            while (stack.length > 0) {
                const { x, y } = stack.pop();
                if (x < 0 || x >= width || y < 0 || y >= height) continue;
                const index = 5 * layerSize + y * width + x;
                if (data[index] !== targetRegion) continue;
                data[index] = fillRegion;
                filled.push({ x, y });
                stack.push({ x: x + 1, y });
                stack.push({ x: x - 1, y });
                stack.push({ x, y: y + 1 });
                stack.push({ x, y: y - 1 });
            }
            if (this.regionManager.enabled) {
                this.regionManager.updateRegionCells(filled);
            }
            return;
        }

        // Manual layer mode: match and write on the selected z-slot so the
        // fill region is defined by the layer actually being edited.
        const layerIndex = this.layerMode !== 'auto'
            ? this.layerMode
            : this.getLayerIndex(currentLayer);

        if (layerIndex === -1) return;

        const layerSize = width * height;
        const startIndex = layerIndex * layerSize + startY * width + startX;
        // Autotiles store their shape variant in the ID (base + 0..47), so
        // adjacent cells of the same terrain have DIFFERENT ids (interior vs
        // edge vs corner). Matching the exact id makes the fill stop at the
        // first border variant, leaving rings of old tiles. Match by autotile
        // kind instead; non-autotiles still match by exact id.
        const targetTileKey = this.normalizeTileIdForFillMatch(data[startIndex]);

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
        const affectedTiles = new Set(); // PERFORMANCE: Track tiles for incremental update
        const reshapeSeeds = new Set(); // Only reconnect layers changed by this fill
        // Filled as the flood goes, since which cells it reaches is not known
        // until it has run.
        const wallsBefore = new Map();

        while (stack.length > 0) {
            const { x, y } = stack.pop();
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const index = layerIndex * layerSize + y * width + x;
            if (this.normalizeTileIdForFillMatch(data[index]) !== targetTileKey) continue;

            visited.add(key);
            this.noteWallState(wallsBefore, x, y);

            // Get base tile ID first (without shape calculation)
            const baseTileId = this.eraserMode ? 0 : this.getBaseTileIdFromPalettePosition(paletteX, paletteY, tileLayer);

            // If tile ID is 0 (transparent) or eraser mode, erase the tile instead of placing
            if (baseTileId === 0 || this.eraserMode) {
                const erasedLayers = this.eraseTile(x, y, data, width, height, layerSize);
                for (const layer of erasedLayers) {
                    affectedTiles.add(`${x},${y},${layer}`);
                    reshapeSeeds.add(`${x},${y},${layer}`);
                }
            } else {
                // Check if this is an autotile (A1-A5)
                const isAutotile = baseTileId >= 1536 && baseTileId < 8192;

                if (isAutotile) {
                    const basePos = y * width + x;
                    const actualPlacementLayer = this.getFillPlacementLayer(baseTileId, x, y);

                    // Write the base id only: the post-fill reshape pass
                    // recomputes every filled cell (and its border) against
                    // the FINAL fill state, so a shape computed mid-flood
                    // against half-filled neighbors was pure throwaway work
                    // (~8 neighbor scans per cell on a large fill).
                    const targetIdx = actualPlacementLayer * layerSize + basePos;
                    data[targetIdx] = baseTileId;
                    affectedTiles.add(`${x},${y},${actualPlacementLayer}`);
                    reshapeSeeds.add(`${x},${y},${actualPlacementLayer}`);
                    if (actualPlacementLayer === 1) affectedTiles.add(`${x},${y},0`);
                } else {
                    // For non-autotiles, calculate tile ID normally
                    const fillTileId = this.getTileIdFromPalettePosition(paletteX, paletteY, tileLayer, x, y);
                    // B-E tiles use the layering system (L1-L4)
                    data[index] = fillTileId;
                    affectedTiles.add(`${x},${y},${layerIndex}`);
                    reshapeSeeds.add(`${x},${y},${layerIndex}`);
                }
            }
            // Add adjacent tiles
            stack.push({ x: x + 1, y });
            stack.push({ x: x - 1, y });
            stack.push({ x, y: y + 1 });
            stack.push({ x, y: y - 1 });
        }

        // Recalculate autotile shapes for the filled cells and their border:
        // during the flood pass each cell's shape was computed while its
        // yet-unfilled neighbors still held the old tile, so interiors come
        // out as isolated/edge variants until every cell is in place.
        const reshaped = new Set();
        for (const seed of reshapeSeeds) {
            const [seedX, seedY, layer] = seed.split(',').map(Number);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = seedX + dx;
                    const ny = seedY + dy;
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                    const key = `${nx},${ny},${layer}`;
                    if (reshaped.has(key)) continue;
                    reshaped.add(key);
                    const idx = layer * layerSize + ny * width + nx;
                    const t = data[idx];
                    if (t >= 2048 && t < 8192) {
                        const base = Math.floor((t - 2048) / 48) * 48 + 2048;
                        const result = this.calculateAutotileShape(base, nx, ny, null, layer);
                        if (result.tileId !== t) {
                            data[idx] = result.tileId;
                            affectedTiles.add(`${nx},${ny},${layer}`);
                        }
                    }
                }
            }
        }

        // Walls filled in — or filled over — cast on the cell east of them.
        for (const update of this.refreshAutoShadow(wallsBefore)) {
            affectedTiles.add(`${update.x},${update.y},${update.layer}`);
        }

        // PERFORMANCE: Use incremental update instead of full re-render (1000x faster!)
        const tilesToUpdate = [];
        for (const tileKey of affectedTiles) {
            const [x, y, layer] = tileKey.split(',').map(Number);
            tilesToUpdate.push({ x, y, layer });
        }
        this.tilemapManager.updateTiles(tilesToUpdate);
    }

    // Show preview for rectangle/circle tools
    showPreview(start, current) {
        if (!this.previewLayer) {
            return;
        }

        // Rebuilding the preview is expensive (per-cell sprites/textures on
        // big drags) and pointermove fires per pixel — skip when the drag is
        // still over the same tile pair.
        if (this._lastShapePreview &&
            this._lastShapePreview.tool === this.currentTool &&
            this._lastShapePreview.sx === start.x && this._lastShapePreview.sy === start.y &&
            this._lastShapePreview.cx === current.x && this._lastShapePreview.cy === current.y) {
            return;
        }
        this._lastShapePreview = {
            tool: this.currentTool,
            sx: start.x, sy: start.y, cx: current.x, cy: current.y
        };

        // Clear previous preview
        this._resetPreviewLayer();

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;

        if (this.currentTool === 'rectangle') {
            const minX = Math.min(start.x, current.x);
            const maxX = Math.max(start.x, current.x);
            const minY = Math.min(start.y, current.y);
            const maxY = Math.max(start.y, current.y);

            // Draw outline of rectangle
            this.previewGraphics.rect(
                minX * tileWidth,
                minY * tileHeight,
                (maxX - minX + 1) * tileWidth,
                (maxY - minY + 1) * tileHeight
            );
            this.previewGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });

            if (this.eraserMode) {
                return;
            }

            // Region area preview: show the region color over the rectangle
            // (the tile-preview path below has nothing to draw for regions)
            if (this.tilesetPaletteViewer.currentLayer === 'O' && this.object3DManager) {
                const colour = this.object3DManager.objectColors[
                    this.object3DManager.selectedObject];
                this.previewGraphics.rect(minX * tileWidth, minY * tileHeight,
                    (maxX - minX + 1) * tileWidth, (maxY - minY + 1) * tileHeight);
                this.previewGraphics.fill({ color: colour, alpha: 0.4 });
                this.previewGraphics.stroke({ color: colour, width: 2, alpha: 0.9 });
                return;
            }
            if (this.tilesetPaletteViewer.currentLayer === 'R') {
                if (this.regionManager && this.regionManager.selectedTiles &&
                    this.regionManager.selectedTiles.length > 0) {
                    const color = this.regionManager.regionColors[this.regionManager.selectedRegion];
                    this.previewGraphics.rect(
                        minX * tileWidth,
                        minY * tileHeight,
                        (maxX - minX + 1) * tileWidth,
                        (maxY - minY + 1) * tileHeight
                    );
                    this.previewGraphics.fill({ color: color, alpha: 0.4 });
                }
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
                            this.previewGraphics.rect(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
                            this.previewGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
                        }
                    }
                }
                return;
            }

            // Region area preview: colored cells inside the radius, with a
            // white cell outline (there was NO preview at all for regions —
            // the tile-preview path below has nothing to draw for them)
            if (this.tilesetPaletteViewer.currentLayer === 'O' && this.object3DManager) {
                const colour = this.object3DManager.objectColors[
                    this.object3DManager.selectedObject];
                for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y++) {
                    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
                        if (Math.hypot(x - centerX, y - centerY) > radius) continue;
                        this.previewGraphics.rect(x * tileWidth, y * tileHeight,
                            tileWidth, tileHeight);
                        this.previewGraphics.fill({ color: colour, alpha: 0.4 });
                    }
                }
                return;
            }
            if (this.tilesetPaletteViewer.currentLayer === 'R') {
                if (this.regionManager && this.regionManager.selectedTiles &&
                    this.regionManager.selectedTiles.length > 0) {
                    const color = this.regionManager.regionColors[this.regionManager.selectedRegion];
                    const minX = Math.floor(centerX - radius);
                    const maxX = Math.ceil(centerX + radius);
                    const minY = Math.floor(centerY - radius);
                    const maxY = Math.ceil(centerY + radius);
                    for (let y = minY; y <= maxY; y++) {
                        for (let x = minX; x <= maxX; x++) {
                            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                            if (dist <= radius) {
                                this.previewGraphics.rect(x * tileWidth, y * tileHeight, tileWidth, tileHeight);
                            }
                        }
                    }
                    this.previewGraphics.fill({ color: color, alpha: 0.4 });
                    this.previewGraphics.stroke({ width: 1, color: 0xffffff, alpha: 0.5 });
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
                        this.previewGraphics.rect(
                            tilePos.x * tileWidth,
                            tilePos.y * tileHeight,
                            tileWidth,
                            tileHeight
                        );
                        this.previewGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
                    }
                }
            } catch (e) {
                // Failed to draw tile preview
            }
        }
    }

    clearPreview() {
        this._lastShapePreview = null;
        if (this.previewLayer) {
            this._resetPreviewLayer();
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

        // Backing plate. previewGraphics is the layer's first child, so it
        // already renders behind every sprite added after it — no per-tile
        // Graphics object is needed to get the ordering right.
        this.previewGraphics.rect(mapX * tileWidth, mapY * tileHeight, tileWidth, tileHeight);
        this.previewGraphics.fill({ color: 0xffffff, alpha: 0.3 }); // White semi-transparent background

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
            } else {
                // Kinds 4-15: only 0-3 sit at fixed positions; everything
                // else follows the block formula, with odd kinds drawing
                // from the waterfall table.
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

    updateMapStampPreview(tileX, tileY) {
        if (!this.tilePreviewContainer || !this.mapStamp || !this.tilemapManager.currentMap) return;
        if (this.lastPreviewTile.x === tileX && this.lastPreviewTile.y === tileY) return;
        this.lastPreviewTile = { x: tileX, y: tileY, quadrant: -1 };
        this.tilePreviewContainer.removeChildren();

        const map = this.tilemapManager.currentMap;
        if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) {
            this.tilePreviewContainer.visible = false;
            return;
        }

        const tileWidth = this.tilemapManager.TILE_WIDTH;
        const tileHeight = this.tilemapManager.TILE_HEIGHT;
        const visibleWidth = Math.min(this.mapStamp.width, map.width - tileX);
        const visibleHeight = Math.min(this.mapStamp.height, map.height - tileY);
        const footprint = new PIXI.Graphics();
        footprint.rect(
            tileX * tileWidth,
            tileY * tileHeight,
            visibleWidth * tileWidth,
            visibleHeight * tileHeight
        );
        footprint.fill({ color: 0xffffff, alpha: 0.16 });
        this.tilePreviewContainer.addChild(footprint);

        if (this._mapStampPreviewTexture) {
            const sprite = new PIXI.Sprite(this._mapStampPreviewTexture);
            sprite.x = tileX * tileWidth;
            sprite.y = tileY * tileHeight;
            sprite.alpha = 0.72;
            sprite.eventMode = 'none';
            this.tilePreviewContainer.addChild(sprite);
        }

        const outline = new PIXI.Graphics();
        outline.rect(
            tileX * tileWidth,
            tileY * tileHeight,
            visibleWidth * tileWidth,
            visibleHeight * tileHeight
        );
        outline.stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
        this.tilePreviewContainer.addChild(outline);
        this.tilePreviewContainer.visible = true;
    }

    // Update tile preview at mouse position
    updateTilePreview(tileX, tileY) {
        if (!this.tilePreviewContainer || !this.tilemapManager) {
            return;
        }

        if (this.mapStamp) {
            this.updateMapStampPreview(tileX, tileY);
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

        // The cell about to be grouped, in the object's own colour.
        if (currentLayer === 'O') {
            if (!this.object3DManager) {
                this.tilePreviewContainer.visible = false;
                return;
            }
            const manager = this.object3DManager;
            const colour = manager.objectColors[manager.selectedObject];
            const container = new PIXI.Container();
            container.x = tileX * this.tilemapManager.TILE_WIDTH;
            container.y = tileY * this.tilemapManager.TILE_HEIGHT;
            const patch = new PIXI.Graphics();
            patch.rect(0, 0, this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT);
            patch.fill({ color: colour, alpha: manager.groundMode ? 0.25 : 0.5 });
            patch.stroke({ color: colour, width: 2, alpha: 0.9 });
            container.addChild(patch);
            const size = Math.max(7, Math.round(Math.min(
                this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT) * 0.42));
            const label = new PIXI.Text({
                text: manager.groundMode ? '⌄' : String(manager.selectedObject),
                style: { fontFamily: 'Arial', fontSize: size, fontWeight: 'bold', fill: 0xFFFFFF,
                    stroke: { color: 0x000000, width: Math.max(2, Math.round(size / 4.5)),
                        join: 'round' } }
            });
            label.anchor.set(0.5, 0.5);
            label.x = this.tilemapManager.TILE_WIDTH / 2;
            label.y = this.tilemapManager.TILE_HEIGHT / 2;
            container.addChild(label);
            this.tilePreviewContainer.removeChildren();
            this.tilePreviewContainer.addChild(container);
            this.tilePreviewContainer.visible = true;
            return;
        }

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
            const regionLabelSize = Math.max(7, Math.round(Math.min(
                this.tilemapManager.TILE_WIDTH, this.tilemapManager.TILE_HEIGHT) * 0.42));
            const text = new PIXI.Text({
                text: selectedRegion.toString(),
                style: {
                    fontFamily: 'Arial',
                    fontSize: regionLabelSize,
                    fontWeight: 'bold',
                    fill: 0xFFFFFF,
                    stroke: { color: 0x000000, join: 'round',
                        width: Math.max(2, Math.round(regionLabelSize / 4.5)) }
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
                    const previewTileId = this.preserveAutotileShape &&
                        ['A1', 'A2', 'A3', 'A4'].includes(layerToUse)
                        ? this.exactAutotileId(tile, baseTileId)
                        : this.calculateAutotileShape(baseTileId, px, py, hoverPattern, placeLayer).tileId;
                    const auto = new PIXI.Container();
                    auto.alpha = 0.7;
                    this.renderAutotilePreviewToContainer(previewTileId, auto, tilesetTexture);
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
        // The project's tile size, not an assumption: MZ offers 48, 32, 24 and
        // 16, and a sheet is laid out in whichever was chosen.
        const tileSize = this.tilemapManager?.TILE_SIZE || 48;

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
                srcX = bx * tileSize;
                srcY = by * tileSize;
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
        } else if (RRTilesetSheets.isNormalSheetKey(layer)) {
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

    /**
     * Clear the preview: wipe the vector drawing and drop the tile sprites.
     *
     * `previewLayer.removeChildren()` cannot be used directly any more, because
     * `previewGraphics` is itself a child and removing it would silently kill
     * every rectangle and outline drawn afterwards. The sprites and per-tile
     * borders are rebuilt from scratch on each pointer move, so they are
     * destroyed rather than merely detached — previously they were removed and
     * left to the garbage collector, which on a large map meant a fresh
     * Graphics per tile per mouse movement.
     */
    _resetPreviewLayer() {
        if (this.previewGraphics && !this.previewGraphics.destroyed) {
            this.previewGraphics.clear();
        }
        if (!this.previewLayer || this.previewLayer.destroyed) return;

        for (let i = this.previewLayer.children.length - 1; i >= 0; i--) {
            const child = this.previewLayer.children[i];
            if (child === this.previewGraphics) continue;
            this.previewLayer.removeChild(child);
            // Textures here are shared with the tileset caches, so the sprite
            // goes but the texture it points at must not.
            if (child && !child.destroyed && child.destroy) {
                child.destroy({ children: true, texture: false, textureSource: false });
            }
        }
    }

    hideTilePreview() {
        if (this.tilePreviewContainer) {
            this.tilePreviewContainer.visible = false;
        }
        // PERFORMANCE: Reset tracking so next preview will be created
        this.lastPreviewTile = { x: -1, y: -1, quadrant: -1 };
    }

    /**
     * Whether a tile is drawn over characters — RPG Maker's star flag.
     *
     * Asked of the tilemap, which owns the open tileset's flags, and false
     * where there is no tileset to ask rather than throwing: the layer choice
     * has to keep working on a map opened before its tileset resolved.
     */
    drawsAboveCharacters(tileId) {
        if (!(tileId > 0)) return false;
        const tilemap = this.tilemapManager;
        if (tilemap && typeof tilemap.isHigherTile === 'function') {
            return !!tilemap.isHigherTile(tileId);
        }
        const flags = tilemap && tilemap.currentTileset && tilemap.currentTileset.flags;
        return !!(flags && (flags[tileId] & 0x10));
    }

    // Find available layer for tile placement (supports stacking up to 3 layers deep)
    findAvailableLayer(data, width, height, x, y, preferredLayer, newTileId = 0) {
        const layerSize = width * height;
        const basePos = y * width + x;

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

        /*
         * An overhang keeps its place, and the new tile slides under it.
         *
         * The star flag means "draws above characters" — a canopy, an archway,
         * the top of a doorway. Painting a plain tile into a cell that already
         * holds one of those should not shove it down the stack; the overhang
         * is the thing meant to be in front. The authored maps agree: of the
         * 14,066 stacked pairs where exactly one of the two is starred, the
         * starred one is the upper of them 84% of the time.
         */
        if (this.drawsAboveCharacters(data[preferredIndex])
            && !this.drawsAboveCharacters(newTileId)) {
            for (let layer = preferredLayer - 1; layer >= 1; layer--) {
                if (data[layer * layerSize + basePos] === 0) return layer;
            }
        }

        /*
         * Otherwise the new tile takes the top slot and the stack moves down
         * under it.
         *
         * Searching downward for a free slot was wrong, and wrong in a way the
         * authored maps cannot show: a cell holding two tiles ends up at z2 and
         * z3 whichever order they were laid down in. What decides it is that z3
         * draws over z2 — so painting one thing over another has to put the new
         * one *above*, or the tile you just placed disappears behind the tile
         * you placed before it. Shifting is what makes room for that, and it is
         * also what leaves the z2+z3 pairing the maps are full of, with the
         * older tile underneath.
         *
         * Placing something *beneath* what is already there is what choosing a
         * layer by hand is for.
         */
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
        // Where the walls stand before the erase, so a wall taken away can take
        // its shadow with it.
        const wallsBefore = this.captureWallState(positions);

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

        const shadowUpdates = this.refreshAutoShadow(wallsBefore);
        if (shadowUpdates.length) this.tilemapManager.updateTiles(shadowUpdates);

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
            if (!current || current.layer !== target.layer ||
                this.normalizeTileIdForFillMatch(current.tileId) !==
                this.normalizeTileIdForFillMatch(target.tileId)) {
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
        /*
         * Which z-slot a palette tab starts on.
         *
         * The letter used to decide it — B on z1, C on z2, D onwards on z3 —
         * which is not how RPG Maker lays a map out and is visible the moment
         * you paint: the same object dropped from two tabs sat at two
         * different depths. Counted over the authored maps in the bundled
         * projects, of 256,366 cells carrying exactly one B-G tile, 90.8% have
         * it on z3 and 8.9% on z2; and of the 45,075 carrying two, 99.8% use
         * z2 and z3 together. The sheet it came from makes no difference at
         * all: B, C, D and E each sit on z2/z3 in the same proportions.
         *
         * So every picture sheet starts at the top of the stack and fills
         * downwards, and only the A tabs own the ground.
         */
        // Listed rather than asked of RRTilesetSheets: this runs before the
        // sheet registry is necessarily on the page, and an undefined global
        // here would quietly send every picture tile to the ground slot.
        if (['B', 'C', 'D', 'E', 'F', 'G'].includes(layerKey)) return 3;
        return 0;
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
            case 'B':
            case 'C':
            case 'D':
            case 'E':
            case 'F':
            case 'G': {
                // Palette click handler gives coordinates in 16-tile-wide space (x can be 0-15)
                // But tile IDs use 8-tile-per-row system for RPG Maker MZ compatibility
                // Convert: if x >= 8, move to bottom half
                if (x >= 8) {
                    x -= 8;
                    y += 16; // Move to bottom half (assumes 16 rows per half)
                }
                const tilesPerRow = 8;
                // B 0, C 256, D 512, E 768, F 1024, G 1280.
                const base = RRTilesetSheets.baseTileIdForSheet(RRTilesetSheets.indexFromKey(layer));
                return base + (y * tilesPerRow + x);
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
            case 'B':
            case 'C':
            case 'D':
            case 'E':
            case 'F':
            case 'G': {
                if (x >= 8) {
                    x -= 8;
                    y += 16;
                }
                const tilesPerRow = 8;
                // B 0, C 256, D 512, E 768, F 1024, G 1280. Omitting a sheet
                // here fell through to the default and returned 0, and painting
                // tile id 0 erases — so a missing case silently rubbed tiles
                // out instead of placing them.
                const base = RRTilesetSheets.baseTileIdForSheet(RRTilesetSheets.indexFromKey(layer));
                return base + (y * tilesPerRow + x);
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

    // Collapse an autotile's shape variant (base + 0..47) to its base id so
    // flood-fill matching treats all variants of one terrain as the same
    // tile. Non-autotiles (0, B-E, A5) pass through unchanged.
    normalizeTileIdForFillMatch(tileId) {
        if (tileId >= 2048 && tileId < 8192) {
            return Math.floor((tileId - 2048) / 48) * 48 + 2048;
        }
        return tileId;
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
        // Manual layer selection pins ALL tile types to the chosen z-slot;
        // the auto-stacking rules below only apply in auto mode.
        if (this.layerMode !== 'auto') {
            return this.layerMode;
        }
        const { width, data } = this.tilemapManager.currentMap;
        const layer0Tile = data[y * width + x];
        const layer0HasATile = layer0Tile >= 1536 && layer0Tile < 8192;
        const cls = this.classifyAutotile(baseTileId);

        // Join the slot this terrain already occupies beside the cell.
        //
        // Looking only at what is under the cursor is not enough, because a
        // shape is decided by neighbours on the *same* slot: a stretch of road
        // put down at z0 beside road living at z1 cannot see it, and both ends
        // cap off against each other. Landing where the run already is settles
        // the join before the shape is ever calculated.
        const joined = this.adjacentAutotileLayer(baseTileId, x, y);
        if (joined !== null) {
            // A decoration beside a lower-slot copy still has to sit above a
            // different floor at the destination rather than erase it.
            if (joined === 0 && cls.isDecoration && layer0HasATile &&
                !this.sameAutotileKind(layer0Tile, baseTileId)) return 1;
            return joined;
        }

        if (!layer0HasATile) return 0;
        if (this.sameAutotileKind(layer0Tile, baseTileId)) return 0;

        if (cls.isDecoration) return 1;
        if (cls.isA1Water && layer0Tile >= 2048 && layer0Tile < 2816) {
            const layer0Kind = Math.floor((layer0Tile - 2048) / 48);
            const layer0IsDecoration =
                layer0Kind >= 2 && (layer0Kind < 4 || layer0Kind % 2 === 1);
            if (!layer0IsDecoration) return 1;
        }

        // Ground autotiles replace the ground already in the cell. Stacking
        // them made an ordinary sand stroke over water land on layer 2, where
        // it could neither replace nor connect to the layer-1 terrain.
        return 0;
    }

    /**
     * The A-slot a neighbouring cell of the same terrain sits on, or null.
     *
     * The upper slot wins where both carry it, since that is the one a terrain
     * painted over another lives on and the one a stroke is usually continuing.
     * Only the four cardinal neighbours are asked, because those are the ones
     * an autotile shape is built from.
     */
    adjacentAutotileLayer(baseTileId, x, y) {
        const map = this.tilemapManager.currentMap;
        if (!map) return null;
        const { width, height, data } = map;
        const layerSize = width * height;
        let onGround = false;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const at = ny * width + nx;
            if (this.sameAutotileKind(data[layerSize + at], baseTileId)) return 1;
            if (this.sameAutotileKind(data[at], baseTileId)) onGround = true;
        }
        return onGround ? 0 : null;
    }

    /**
     * The z-slot a *bucket fill* writes into.
     *
     * A fill resolves one destination for the whole matched region rather than
     * following a neighboring run cell by cell. Ground replaces that region;
     * a decoration fills into the second A-slot and leaves its ground alone.
     */
    getFillPlacementLayer(baseTileId, x, y) {
        if (this.layerMode !== 'auto') return this.layerMode;
        const { width, data } = this.tilemapManager.currentMap;
        const layer0Tile = data[y * width + x];
        const cls = this.classifyAutotile(baseTileId);
        if (cls.isDecoration) {
            // Over any A-tile, including water: MZ sets the dish at z1 over
            // the water at z0.
            return (layer0Tile >= 1536 && layer0Tile < 8192) ? 1 : 0;
        }
        if (cls.isA1Water) {
            // A different water kind inside water is a deep-water pool at z1;
            // the same kind replaces the ground slot.
            if (layer0Tile >= 2048 && layer0Tile < 2816) {
                const layer0Kind = Math.floor((layer0Tile - 2048) / 48);
                const layer0IsDecoration =
                    layer0Kind >= 2 && (layer0Kind < 4 || layer0Kind % 2 === 1);
                if (!layer0IsDecoration && !this.sameAutotileKind(layer0Tile, baseTileId)) return 1;
            }
            return 0;
        }
        // Ground, walls and roofs replace the slot the region was matched on.
        return 0;
    }

    /**
     * Whether two A-layer tiles are the same terrain.
     *
     * An autotile's 48 ids are one terrain in its 48 arrangements, so they
     * compare by kind. A5 is not an autotile and each id is its own picture,
     * so those compare directly. Tiles from different bands are never the same
     * terrain even if their kind numbers coincide.
     */
    sameAutotileKind(a, b) {
        const key = tileId => {
            if (tileId >= 1536 && tileId < 2048) return `a5:${tileId}`;
            if (tileId >= 2048 && tileId < 2816) return `a1:${Math.floor((tileId - 2048) / 48)}`;
            if (tileId >= 2816 && tileId < 4352) return `a2:${Math.floor((tileId - 2816) / 48)}`;
            if (tileId >= 4352 && tileId < 5888) return `a3:${Math.floor((tileId - 4352) / 48)}`;
            if (tileId >= 5888 && tileId < 8192) return `a4:${Math.floor((tileId - 5888) / 48)}`;
            return null;
        };
        const ka = key(a);
        return ka !== null && ka === key(b);
    }

    // Calculate wall autotile shape (A3/A4 - only uses 4 cardinal directions, 16 shapes)
    /**
     * Whether an autotile uses the 16-shape wall system.
     *
     * A3 is walls throughout; A4 alternates roof rows and wall rows, eight
     * kinds to a row.
     */
    isWallAutotile(baseTileId) {
        if (baseTileId >= 4352 && baseTileId < 5888) return true;
        if (baseTileId >= 5888 && baseTileId < 8192) {
            const kind = Math.floor((baseTileId - 5888) / 48);
            return Math.floor(kind / 8) % 2 === 1;
        }
        return false;
    }

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

        // Off the map edge, floors and walls part company.
        //
        // Ground and roofs run on seamlessly, so out-of-bounds counts as the
        // same kind and no border is drawn. Walls are capped instead: MZ closes
        // them off at the edge. Checked against the authored maps in the
        // bundled projects — of 8,455 wall autotiles sitting on a map edge,
        // 91.3% store the capped shape and 2.4% the connected one, while 82.9%
        // of the 83,674 floor autotiles on an edge store shape 0, the fully
        // connected interior. Treating walls like floors swallowed the end cap,
        // so a wall painted against the edge lost its finished edge.
        if (x < 0 || x >= width || y < 0 || y >= height) {
            if (baseTileId < 2048 || baseTileId >= 8192) return false;
            return !this.isWallAutotile(baseTileId);
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
        const changed = [];

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
                        changed.push({ x: neighbor.x, y: neighbor.y, layer });
                    }
                }
            }
        }
        if (changed.length > 0) this.tilemapManager.updateTiles(changed);
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
        this.clearMapStamp();
        if (this._mapPointerHandlers && this._mapPointerHandlersContainer) {
            for (const [eventName, handler] of Object.entries(this._mapPointerHandlers)) {
                this._mapPointerHandlersContainer.off(eventName, handler);
            }
            this._mapPointerHandlers = null;
            this._mapPointerHandlersContainer = null;
        }
        if (this.previewLayer) {
            this.previewLayer.destroy({ children: true });
            this.previewLayer = null;
            this.previewGraphics = null;
        }
        if (this.tilePreviewContainer) {
            this.tilePreviewContainer.destroy({ children: true });
            this.tilePreviewContainer = null;
        }
        if (typeof window !== 'undefined' && this._windowBlurHandler) {
            window.removeEventListener('blur', this._windowBlurHandler);
            this._windowBlurHandler = null;
        }
        if (this.tilemapManager?.shouldBypassShiftPanning === this._shiftAutotilePaintClaim) {
            this.tilemapManager.shouldBypassShiftPanning = null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapEditor;
}
