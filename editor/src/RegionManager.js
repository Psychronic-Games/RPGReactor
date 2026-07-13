// RPG Reactor - Region Manager
// Handles region overlay rendering and region editing UI

class RegionManager {
    constructor(tilemapManager) {
        this.tilemapManager = tilemapManager;
        this.regionLayer = null;
        this.enabled = false;
        this.selectedRegion = 1; // Default region to paint
        this.selectedTiles = [{ x: 0, y: 0, regionId: 1 }]; // Track selected region like tileset palette

        // RPG Maker MZ region colors (1-63 have predefined colors)
        this.regionColors = this.generateRegionColors();

        // Canvas for region palette
        this.canvas = null;
        this.ctx = null;
        this.tileSize = 48; // Match tileset palette tile size
        this.columns = 8; // 8 columns of regions
        this.rows = Math.ceil(256 / this.columns); // 256 regions (0-255), so 32 rows
    }

    // Generate color palette for regions (similar to RPG Maker MZ)
    generateRegionColors() {
        const colors = [];
        colors[0] = 0x000000; // Region 0 = transparent/no region

        // Generate 255 distinct colors for regions 1-255
        for (let i = 1; i <= 255; i++) {
            // Use HSL color space to generate visually distinct colors
            const hue = (i * 137.5) % 360; // Golden angle for good distribution
            const saturation = 60 + (i % 4) * 10; // Vary saturation slightly
            const lightness = 45 + (i % 3) * 10; // Vary lightness slightly
            colors[i] = this.hslToHex(hue, saturation, lightness);
        }

        return colors;
    }

    // Convert HSL to hex color
    hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        const r = Math.round(255 * f(0));
        const g = Math.round(255 * f(8));
        const b = Math.round(255 * f(4));
        return (r << 16) | (g << 8) | b;
    }

    // Create the region overlay layer
    createRegionLayer() {
        if (!this.tilemapManager || !this.tilemapManager.container) {
            console.warn('TilemapManager not ready');
            return;
        }

        // Remove old layer if exists
        if (this.regionLayer) {
            this.tilemapManager.container.removeChild(this.regionLayer);
            this.regionLayer.destroy({ children: true });
        }

        // Create new layer
        this.regionLayer = new PIXI.Container();
        this.regionLayer.alpha = 0.5; // Semi-transparent overlay

        // Add to top of tilemap container
        this.tilemapManager.container.addChild(this.regionLayer);
    }

    // One shared texture per region id (colored fill + border + number),
    // rendered once to a canvas. The old per-cell PIXI.Graphics + PIXI.Text
    // pair rasterized a fresh glyph texture for EVERY cell — a fully
    // regioned 256×256 map froze for ~5s on every overlay rebuild.
    _regionTileTexture(regionId) {
        if (!this._tileTextures) this._tileTextures = new Map();
        let tex = this._tileTextures.get(regionId);
        if (tex) return tex;

        const TW = this.tilemapManager.TILE_WIDTH;
        const TH = this.tilemapManager.TILE_HEIGHT;
        const canvas = document.createElement('canvas');
        canvas.width = TW;
        canvas.height = TH;
        const c = canvas.getContext('2d');
        const color = '#' + this.regionColors[regionId].toString(16).padStart(6, '0');
        c.globalAlpha = 0.4;
        c.fillStyle = color;
        c.fillRect(0, 0, TW, TH);
        c.globalAlpha = 0.8;
        c.strokeStyle = color;
        c.lineWidth = 1;
        c.strokeRect(0.5, 0.5, TW - 1, TH - 1);
        c.globalAlpha = 1;
        c.font = 'bold 18px Arial';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.strokeStyle = '#000';
        c.lineWidth = 4;
        c.lineJoin = 'round';
        c.miterLimit = 2;
        c.strokeText(String(regionId), TW / 2, TH / 2);
        c.fillStyle = '#fff';
        c.fillText(String(regionId), TW / 2, TH / 2);

        tex = PIXI.Texture.from(canvas);
        this._tileTextures.set(regionId, tex);
        return tex;
    }

    _addCellSprite(x, y, regionId) {
        const sprite = new PIXI.Sprite(this._regionTileTexture(regionId));
        sprite.x = x * this.tilemapManager.TILE_WIDTH;
        sprite.y = y * this.tilemapManager.TILE_HEIGHT;
        sprite.eventMode = 'none';
        this.regionLayer.addChild(sprite);
        this._cellSprites.set(y * this.tilemapManager.currentMap.width + x, sprite);
    }

    // Render regions on the map (full rebuild — map load / overlay toggle)
    renderRegions() {
        if (!this.regionLayer || !this.tilemapManager.currentMap) {
            return;
        }

        // Clear existing region sprites
        this.regionLayer.removeChildren();
        this._cellSprites = new Map();

        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;

        // Layer 5 contains region data
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const regionId = data[5 * layerSize + y * width + x];
                if (regionId > 0 && regionId <= 255) {
                    this._addCellSprite(x, y, regionId);
                }
            }
        }
    }

    // Refresh only the given cells ({x, y}) from map data — the paint tools
    // call this instead of rebuilding the whole overlay per stroke.
    updateRegionCells(positions) {
        if (!this.regionLayer || !this.tilemapManager.currentMap) return;
        if (!this._cellSprites) {
            this.renderRegions();
            return;
        }
        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        for (const pos of positions) {
            const { x, y } = pos;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            const key = y * width + x;
            const old = this._cellSprites.get(key);
            if (old) {
                this.regionLayer.removeChild(old);
                old.destroy();
                this._cellSprites.delete(key);
            }
            const regionId = data[5 * layerSize + key];
            if (regionId > 0 && regionId <= 255) {
                this._addCellSprite(x, y, regionId);
            }
        }
    }

    // Toggle region visibility
    toggleRegions() {
        this.enabled = !this.enabled;

        if (this.enabled) {
            if (!this.regionLayer) {
                this.createRegionLayer();
            }
            this.renderRegions();
            this.regionLayer.visible = true;
        } else {
            if (this.regionLayer) {
                this.regionLayer.visible = false;
            }
        }

        return this.enabled;
    }

    // Set region visibility
    setVisible(visible) {
        this.enabled = visible;
        if (this.regionLayer) {
            this.regionLayer.visible = visible;
            if (visible) {
                this.renderRegions();
            }
        }
    }

    // Initialize the region palette UI
    initializeUI(container) {
        container.innerHTML = `
            <div id="region-palette-container" style="display: flex; flex-direction: column; height: 100%; background-color: var(--color-bg-surface);">
                <!-- Region Info -->
                <div id="region-selection-info" style="padding: 8px; background-color: var(--color-bg-list-item); border-bottom: 1px solid var(--color-border);">
                    <div style="font-size: 11px; color: var(--color-text-muted);">Selected: Region <span id="selected-region-number">1</span></div>
                </div>

                <!-- Region Palette Canvas (scrollable) -->
                <div id="region-palette-scroll" style="flex: 1; overflow-y: auto; background-color: var(--color-bg-menubar);">
                    <canvas id="region-palette-canvas" style="display: block; image-rendering: pixelated;"></canvas>
                </div>
            </div>
        `;

        // Create and setup canvas
        this.canvas = document.getElementById('region-palette-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.setupCanvas();
            this.renderRegionPalette();
            this.setupPaletteEventListeners();
        }
    }

    // Setup canvas dimensions
    setupCanvas() {
        if (!this.canvas || !this.ctx) return;

        const canvasWidth = this.columns * this.tileSize;
        const canvasHeight = this.rows * this.tileSize;

        this.canvas.width = canvasWidth;
        this.canvas.height = canvasHeight;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
    }

    // Render the region palette
    renderRegionPalette() {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw all 256 regions (0-255)
        for (let i = 0; i < 256; i++) {
            const col = i % this.columns;
            const row = Math.floor(i / this.columns);
            const x = col * this.tileSize;
            const y = row * this.tileSize;

            // Draw region square
            const color = this.regionColors[i];
            this.ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
            this.ctx.fillRect(x, y, this.tileSize, this.tileSize);

            // Draw border
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, y, this.tileSize, this.tileSize);

            // Draw region number (bigger and fully opaque)
            this.ctx.fillStyle = '#fff';
            this.ctx.font = 'bold 18px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 4;
            this.ctx.lineJoin = 'round';
            this.ctx.miterLimit = 2;
            this.ctx.strokeText(i.toString(), x + this.tileSize / 2, y + this.tileSize / 2);
            this.ctx.fillText(i.toString(), x + this.tileSize / 2, y + this.tileSize / 2);
        }

        // Draw selection highlight
        this.drawSelection();
    }

    // Draw selection highlight on canvas
    drawSelection() {
        if (!this.ctx || !this.selectedTiles || this.selectedTiles.length === 0) return;

        for (const tile of this.selectedTiles) {
            const regionId = tile.regionId;
            const col = regionId % this.columns;
            const row = Math.floor(regionId / this.columns);
            const x = col * this.tileSize;
            const y = row * this.tileSize;

            // Draw white selection border
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x + 1.5, y + 1.5, this.tileSize - 3, this.tileSize - 3);
        }
    }

    // Setup event listeners for palette canvas
    setupPaletteEventListeners() {
        if (!this.canvas) return;

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / this.tileSize);
            const y = Math.floor((e.clientY - rect.top) / this.tileSize);
            const regionId = y * this.columns + x;

            if (regionId >= 0 && regionId <= 255) {
                this.selectRegion(regionId);
            }
        });
    }

    // Select a region
    selectRegion(regionId) {
        this.selectedRegion = regionId;

        // Update selectedTiles array (similar to tileset palette)
        const col = regionId % this.columns;
        const row = Math.floor(regionId / this.columns);
        this.selectedTiles = [{ x: col, y: row, regionId: regionId }];

        // Update selection info display
        const regionNumberSpan = document.getElementById('selected-region-number');
        if (regionNumberSpan) {
            regionNumberSpan.textContent = regionId;
        }

        // Redraw palette to show new selection
        this.renderRegionPalette();
    }

    // Refresh the region overlay when map data changes
    refresh() {
        if (this.enabled && this.regionLayer) {
            this.renderRegions();
        }
    }

    // Clean up
    destroy() {
        if (this.regionLayer) {
            this.regionLayer.destroy({ children: true });
            this.regionLayer = null;
        }
        this._cellSprites = null;
        if (this._tileTextures) {
            for (const tex of this._tileTextures.values()) {
                try { tex.destroy(true); } catch (e) {}
            }
            this._tileTextures = null;
        }
    }
}
