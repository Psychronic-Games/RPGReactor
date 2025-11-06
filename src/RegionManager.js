// RPG Reactor - Region Manager
// Handles region overlay rendering and region editing UI

class RegionManager {
    constructor(tilemapManager) {
        this.tilemapManager = tilemapManager;
        this.regionLayer = null;
        this.enabled = false;
        this.selectedRegion = 1; // Default region to paint

        // RPG Maker MZ region colors (1-63 have predefined colors)
        this.regionColors = this.generateRegionColors();
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

    // Render regions on the map
    renderRegions() {
        if (!this.regionLayer || !this.tilemapManager.currentMap) {
            return;
        }

        // Clear existing region sprites
        this.regionLayer.removeChildren();

        const { width, height, data } = this.tilemapManager.currentMap;
        const layerSize = width * height;
        const TILE_WIDTH = this.tilemapManager.TILE_WIDTH;
        const TILE_HEIGHT = this.tilemapManager.TILE_HEIGHT;

        // Layer 5 contains region data
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = 5 * layerSize + y * width + x;
                const regionId = data[index];

                if (regionId > 0 && regionId <= 255) {
                    // Create colored rectangle for region
                    const regionGraphic = new PIXI.Graphics();
                    const color = this.regionColors[regionId];

                    // Draw filled rectangle
                    regionGraphic.rect(x * TILE_WIDTH, y * TILE_HEIGHT, TILE_WIDTH, TILE_HEIGHT);
                    regionGraphic.fill({ color: color, alpha: 0.4 });

                    // Draw border
                    regionGraphic.stroke({ color: color, width: 1, alpha: 0.8 });

                    // Add region number text
                    const text = new PIXI.Text({
                        text: regionId.toString(),
                        style: {
                            fontFamily: 'Arial',
                            fontSize: 12,
                            fontWeight: 'bold',
                            fill: 0xFFFFFF,
                            stroke: { color: 0x000000, width: 3 }
                        }
                    });
                    text.anchor.set(0.5, 0.5);
                    text.x = x * TILE_WIDTH + TILE_WIDTH / 2;
                    text.y = y * TILE_HEIGHT + TILE_HEIGHT / 2;

                    this.regionLayer.addChild(regionGraphic);
                    this.regionLayer.addChild(text);
                }
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
            <div id="region-palette-container" style="display: flex; flex-direction: column; height: 100%; background-color: #1e1e1e;">
                <!-- Region Selector -->
                <div style="padding: 8px; background-color: #252526; border-bottom: 1px solid #3e3e42;">
                    <div style="font-size: 11px; color: #999; margin-bottom: 4px;">Selected Region</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input
                            type="number"
                            id="region-selector-input"
                            min="1"
                            max="255"
                            value="${this.selectedRegion}"
                            style="
                                width: 60px;
                                background-color: #3e3e42;
                                border: 1px solid #555;
                                color: #ccc;
                                padding: 4px 6px;
                                font-size: 12px;
                                border-radius: 3px;
                            "
                        />
                        <div
                            id="region-color-preview"
                            style="
                                width: 24px;
                                height: 24px;
                                border: 1px solid #555;
                                border-radius: 3px;
                                background-color: #${this.regionColors[this.selectedRegion].toString(16).padStart(6, '0')};
                            "
                        ></div>
                        <button
                            id="region-clear-btn"
                            style="
                                padding: 4px 8px;
                                font-size: 11px;
                                background-color: #d14949;
                                border: 1px solid #555;
                                color: #fff;
                                border-radius: 3px;
                                cursor: pointer;
                            "
                        >Clear (0)</button>
                    </div>
                </div>

                <!-- Region Color Grid -->
                <div style="flex: 1; overflow-y: auto; padding: 8px;">
                    <div style="font-size: 11px; color: #999; margin-bottom: 8px;">Quick Select</div>
                    <div id="region-grid" style="
                        display: grid;
                        grid-template-columns: repeat(8, 1fr);
                        gap: 4px;
                    ">
                        ${this.createRegionGrid()}
                    </div>
                </div>

                <!-- Region Tools -->
                <div style="padding: 8px; background-color: #252526; border-top: 1px solid #3e3e42;">
                    <button
                        id="region-toggle-btn"
                        style="
                            width: 100%;
                            padding: 8px;
                            font-size: 12px;
                            background-color: ${this.enabled ? '#007acc' : '#3e3e42'};
                            border: 1px solid #555;
                            color: #fff;
                            border-radius: 3px;
                            cursor: pointer;
                        "
                    >
                        ${this.enabled ? '👁 Hide Regions' : '👁 Show Regions'}
                    </button>
                </div>
            </div>
        `;

        this.setupUIEventListeners();
    }

    // Create the region selection grid
    createRegionGrid() {
        let html = '';
        // Show first 64 regions in grid
        for (let i = 1; i <= 64; i++) {
            const color = this.regionColors[i];
            html += `
                <div
                    class="region-grid-item"
                    data-region="${i}"
                    style="
                        width: 100%;
                        aspect-ratio: 1;
                        background-color: #${color.toString(16).padStart(6, '0')};
                        border: 2px solid ${i === this.selectedRegion ? '#fff' : '#555'};
                        border-radius: 3px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        font-weight: bold;
                        color: #fff;
                        text-shadow: 0 0 2px #000, 0 0 2px #000;
                        transition: transform 0.1s;
                    "
                    title="Region ${i}"
                >${i}</div>
            `;
        }
        return html;
    }

    // Setup event listeners for region UI
    setupUIEventListeners() {
        // Region selector input
        const input = document.getElementById('region-selector-input');
        if (input) {
            input.addEventListener('change', (e) => {
                let value = parseInt(e.target.value);
                value = Math.max(1, Math.min(255, value));
                e.target.value = value;
                this.selectRegion(value);
            });
        }

        // Clear button (select region 0)
        const clearBtn = document.getElementById('region-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.selectRegion(0);
                if (input) input.value = 0;
            });
        }

        // Toggle visibility button
        const toggleBtn = document.getElementById('region-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.toggleRegions();
                toggleBtn.style.backgroundColor = this.enabled ? '#007acc' : '#3e3e42';
                toggleBtn.textContent = this.enabled ? '👁 Hide Regions' : '👁 Show Regions';
            });
        }

        // Region grid items
        document.querySelectorAll('.region-grid-item').forEach(item => {
            item.addEventListener('click', () => {
                const region = parseInt(item.dataset.region);
                this.selectRegion(region);
                if (input) input.value = region;
            });

            item.addEventListener('mouseenter', () => {
                item.style.transform = 'scale(1.1)';
            });

            item.addEventListener('mouseleave', () => {
                item.style.transform = 'scale(1)';
            });
        });
    }

    // Select a region
    selectRegion(regionId) {
        this.selectedRegion = regionId;

        // Update color preview
        const preview = document.getElementById('region-color-preview');
        if (preview && regionId > 0) {
            preview.style.backgroundColor = '#' + this.regionColors[regionId].toString(16).padStart(6, '0');
        } else if (preview) {
            preview.style.backgroundColor = '#000000';
        }

        // Update grid selection
        document.querySelectorAll('.region-grid-item').forEach(item => {
            const itemRegion = parseInt(item.dataset.region);
            item.style.border = itemRegion === regionId ? '2px solid #fff' : '2px solid #555';
        });

        console.log(`Selected region: ${regionId}`);
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
    }
}
