// RPG Reactor - 3D Object Manager
//
// Painting which cells of a map are one 3D object, and showing what has been
// painted. The store is RRMapObjects3D; this is the palette and the overlay.
//
// Deliberately shaped like RegionManager: the same tab strip, the same picker
// of numbered swatches, the same overlay drawn over the map. An author who
// knows how to paint regions already knows how to paint these, and the two
// answer questions of the same kind — regions say "these cells mean something
// to the game", objects say "these cells are one thing in 3D".

class Object3DManager {
    constructor(tilemapManager) {
        this.tilemapManager = tilemapManager;
        this.objectLayer = null;
        this.enabled = false;
        this.selectedObject = 1;
        /*
         * Which map layer the paint goes on.
         *
         * A tree on B standing over a wall on A is not part of the building,
         * so the object number is per layer and the author says which. `auto`
         * takes every layer holding a tile in the cell, which is what you want
         * when grouping a building you can see: you are pointing at the thing,
         * not at one plane of it.
         */
        this.targetLayer = 'auto';
        /*
         * Painting the footing rather than the object.
         *
         * Standing a drawing up turns its rows into courses, so a building
         * painted across seven rows is seven tiles tall and plants itself on
         * its southernmost row. Marking the rows that are the ground it stands
         * on is what puts its feet where its feet are — and it is a mark on
         * cells that already belong to an object, not a number of its own.
         */
        this.groundMode = false;

        this.objectColors = this.generateObjectColors();
        this.canvas = null;
        this.ctx = null;
        // A swatch is the project's tile, like every tile in the A-G preview
        // beside it. The canvas is stretched to the panel by the stylesheet, so
        // a 16-pixel project draws small squares and shows them at the same
        // size a 48-pixel one does — the numbers scale with them.
        this.tileSize = 48;
        this.columns = 8;
        this.rows = Math.ceil(256 / this.columns);
    }

    /**
     * Colours far apart from the region palette's.
     *
     * Both overlays can be looked at in the same session, and two sets of
     * arbitrary hues would be told apart only by which tab was open. Regions
     * walk the whole wheel by the golden angle; these stay in the warm half
     * and are lighter, so an object overlay never reads as a region one.
     */
    generateObjectColors() {
        const colors = [];
        colors[0] = 0x000000;
        for (let i = 1; i <= 255; i++) {
            const hue = (i * 47) % 130;
            const saturation = 70 + (i % 3) * 10;
            const lightness = 55 + (i % 4) * 6;
            colors[i] = this.hslToHex(hue, saturation, lightness);
        }
        return colors;
    }

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

    store() {
        return (typeof window !== 'undefined' && window.RRMapObjects3D) || null;
    }

    currentMap() {
        return this.tilemapManager && this.tilemapManager.currentMap;
    }

    //-------------------------------------------------------------------------
    // Which layers a stroke touches

    /**
     * The layers one cell's paint goes on.
     *
     * In `auto` that is every layer holding a tile, so grouping a building
     * takes its walls and the signage hung on them in one gesture — which is
     * the whole point, since a flag on a B sheet can never join a wall's
     * facade any other way. A chosen layer paints only that one.
     */
    layersAt(x, y) {
        if (this.targetLayer !== 'auto') return [Number(this.targetLayer)];
        const map = this.currentMap();
        if (!map) return [];
        const plane = map.width * map.height;
        const found = [];
        for (let layer = 0; layer < 4; layer++) {
            if (map.data[layer * plane + y * map.width + x]) found.push(layer);
        }
        // An empty cell still takes the paint on the ground layer, so an
        // author can group a gap they mean to fill in later.
        return found.length ? found : [0];
    }

    /** Paint one cell, reporting whether anything changed. */
    paintCell(x, y) {
        const store = this.store();
        const map = this.currentMap();
        if (!store || !map) return false;
        let changed = false;
        for (const layer of this.layersAt(x, y)) {
            changed = this.groundMode
                ? store.setGroundAt(map, x, y, layer, true) || changed
                : store.setAt(map, x, y, layer, this.selectedObject) || changed;
        }
        return changed;
    }

    /** What a cell shows in the overlay: its object number, and whether it is footing. */
    readCell(x, y) {
        const store = this.store();
        const map = this.currentMap();
        if (!store || !map) return { id: 0, ground: false };
        for (let layer = 3; layer >= 0; layer--) {
            const id = store.at(map, x, y, layer);
            if (id) return { id, ground: store.groundAt(map, x, y, layer) };
        }
        return { id: 0, ground: false };
    }

    //-------------------------------------------------------------------------
    // Overlay

    createObjectLayer() {
        if (!this.tilemapManager || !this.tilemapManager.container) return;
        if (this.objectLayer) return;
        this.objectLayer = new PIXI.Container();
        this.objectLayer.name = 'object3d-overlay';
        this.objectLayer.zIndex = 900;
        this.tilemapManager.container.addChild(this.objectLayer);
    }

    /**
     * Draw the overlay.
     *
     * One graphic for the lot rather than a sprite per cell: an object covers
     * far fewer cells than a region layer does, and a map with a dozen
     * buildings painted redraws faster than it would rebuild a sprite pool.
     */
    renderObjects() {
        const map = this.currentMap();
        if (!this.objectLayer || !map) return;
        this.objectLayer.removeChildren();

        const tileW = this.tilemapManager.TILE_WIDTH;
        const tileH = this.tilemapManager.TILE_HEIGHT;
        const graphics = new PIXI.Graphics();
        const labels = [];

        for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
                const { id, ground } = this.readCell(x, y);
                if (!id) continue;
                const colour = this.objectColors[id] || 0xffffff;
                graphics.rect(x * tileW, y * tileH, tileW, tileH);
                // Footing is drawn fainter and outlined, so a building's
                // ground reads as part of it without hiding the art.
                graphics.fill({ color: colour, alpha: ground ? 0.22 : 0.45 });
                if (ground) {
                    graphics.rect(x * tileW + 1, y * tileH + 1, tileW - 2, tileH - 2);
                    graphics.stroke({ color: colour, width: 2, alpha: 0.9 });
                }
                labels.push({ x, y, id });
            }
        }
        this.objectLayer.addChild(graphics);

        // The number, once per object rather than once per cell — a building
        // tiled with its own number is unreadable.
        const seen = new Set();
        for (const label of labels) {
            if (seen.has(label.id)) continue;
            seen.add(label.id);
            // Sized from the tile, outline and all: a fixed 18px number with a
            // 4px outline is wider than a 16-pixel cell.
            const size = Math.max(7, Math.round(Math.min(tileW, tileH) * 0.42));
            const text = new PIXI.Text({
                text: String(label.id),
                style: { fontFamily: 'Arial', fontSize: size, fill: 0xffffff,
                    stroke: { color: 0x000000, width: Math.max(2, Math.round(size / 4.5)) } }
            });
            text.x = label.x * tileW + 2;
            text.y = label.y * tileH + 2;
            this.objectLayer.addChild(text);
        }
    }

    toggleObjects() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.createObjectLayer();
            this.renderObjects();
        }
        this.setVisible(this.enabled);
        return this.enabled;
    }

    setVisible(visible) {
        this.enabled = !!visible;
        if (!this.objectLayer && visible) this.createObjectLayer();
        if (this.objectLayer) this.objectLayer.visible = !!visible;
        if (visible) this.renderObjects();
    }

    refresh() {
        if (this.enabled && this.objectLayer) this.renderObjects();
    }

    //-------------------------------------------------------------------------
    // Palette

    initializeUI(container) {
        const tt = text => (typeof window !== 'undefined' && window.I18n)
            ? window.I18n.tText(text) : text;
        container.innerHTML = `
            <div id="object3d-palette-container" style="display: flex; flex-direction: column; flex: 1; min-width: 0; height: 100%; min-height: 0; background-color: var(--color-bg-surface);">
                <div id="object3d-selection-info" style="padding: 8px; background-color: var(--color-bg-list-item); border-bottom: 1px solid var(--color-border);">
                    <div style="font-size: 11px; color: var(--color-text-muted);">${tt('Selected: 3D object')} <span id="selected-object3d-number">1</span></div>
                    <div style="display: flex; gap: 6px; align-items: center; margin-top: 6px; flex-wrap: wrap;">
                        <label style="font-size: 10px; color: var(--color-text-muted);">${tt('Layer')}
                            <select id="object3d-layer" style="font-size: 10px; margin-left: 2px;">
                                <option value="auto">${tt('Auto')}</option>
                                <option value="0">1</option>
                                <option value="1">2</option>
                                <option value="2">3</option>
                                <option value="3">4</option>
                            </select>
                        </label>
                        <label style="font-size: 10px; color: var(--color-text-muted); cursor: pointer;"
                            title="${tt('Mark cells as the ground the object stands on rather than its height')}">
                            <input type="checkbox" id="object3d-ground"> ${tt('Footing')}
                        </label>
                        <button id="object3d-new" style="font-size: 10px; padding: 3px 8px; cursor: pointer;
                            background-color: var(--color-bg-menubar); color: var(--color-text);
                            border: 1px solid var(--color-border-input); border-radius: 3px;"
                            title="${tt('Start a new object on the lowest number nothing is using yet')}">${tt('New object')}</button>
                    </div>
                </div>
                <div id="object3d-palette-scroll" style="flex: 1; overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable; position: relative; min-height: 0; background-color: var(--color-bg-menubar);">
                    <canvas id="object3d-palette-canvas" style="display: block; cursor: pointer; width: 100%; height: auto;"></canvas>
                </div>
            </div>
        `;

        this.canvas = document.getElementById('object3d-palette-canvas');
        if (this.canvas) {
            this.ctx = this.canvas.getContext('2d');
            this.setupCanvas();
            this.renderPalette();
            this.setupPaletteEventListeners();
        }

        const layer = document.getElementById('object3d-layer');
        if (layer) {
            layer.value = this.targetLayer;
            layer.addEventListener('change', () => { this.targetLayer = layer.value; });
        }
        const ground = document.getElementById('object3d-ground');
        if (ground) {
            ground.checked = this.groundMode;
            ground.addEventListener('change', () => { this.groundMode = ground.checked; });
        }
        const fresh = document.getElementById('object3d-new');
        if (fresh) {
            fresh.addEventListener('click', () => {
                const store = this.store();
                const map = this.currentMap();
                if (store && map) this.selectObject(store.nextFreeId(map));
            });
        }
    }

    /**
     * Size the picker to the panel it is in.
     *
     * The grid used to be a fixed eight columns of forty-eight pixels, so it
     * met the panel's right edge only by luck: wider and it left a bare strip
     * beside the scrollbar, narrower and it grew a horizontal scrollbar of its
     * own. The tileset preview next to it has always filled its panel, and two
     * palettes in the same slot that do not line up read as a layout fault.
     *
     * The swatch size is derived from the width actually available rather than
     * the canvas being stretched to fit: the numbers are drawn as text, and
     * scaling a canvas up blurs them.
     */
    /** The project's tile size, which is what the A-G preview draws at. */
    projectTileSize() {
        const metrics = (typeof RRTileMetrics !== 'undefined' && RRTileMetrics)
            || (typeof window !== 'undefined' && window.RRTileMetrics);
        const database = this.tilemapManager && this.tilemapManager.databaseManager;
        const system = database && typeof database.getSystem === 'function'
            ? database.getSystem() : null;
        const size = metrics ? metrics.tileSizeOf(system) : 48;
        return size > 0 ? size : 48;
    }

    setupCanvas() {
        if (!this.canvas || !this.ctx) return;

        this.tileSize = this.projectTileSize();

        // Its natural size only. The stylesheet's `min-width: 100%` stretches
        // it to the panel when there is room and its container scrolls it when
        // there is not — which is the whole of how the A-G preview behaves.
        this.canvas.width = this.columns * this.tileSize;
        this.canvas.height = this.rows * this.tileSize;
    }

    renderPalette() {
        if (!this.ctx) return;
        const store = this.store();
        const map = this.currentMap();
        const used = new Set(store && map ? store.idsInUse(map) : []);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let i = 0; i < 256; i++) {
            const x = (i % this.columns) * this.tileSize;
            const y = Math.floor(i / this.columns) * this.tileSize;
            const colour = this.objectColors[i];
            this.ctx.fillStyle = '#' + colour.toString(16).padStart(6, '0');
            this.ctx.fillRect(x, y, this.tileSize, this.tileSize);
            this.ctx.strokeStyle = '#555';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x, y, this.tileSize, this.tileSize);

            this.ctx.fillStyle = '#fff';
            this.ctx.font = `bold ${Math.max(9, Math.round(this.tileSize * 0.38))}px Arial`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 4;
            this.ctx.lineJoin = 'round';
            this.ctx.miterLimit = 2;
            this.ctx.strokeText(String(i), x + this.tileSize / 2, y + this.tileSize / 2);
            this.ctx.fillText(String(i), x + this.tileSize / 2, y + this.tileSize / 2);

            // A dot on the numbers this map has actually used, so finding the
            // building you painted does not mean hunting through 256 swatches.
            if (used.has(i)) {
                const dot = Math.max(2.5, this.tileSize * 0.075);
                this.ctx.beginPath();
                this.ctx.arc(x + this.tileSize - dot * 2, y + dot * 2, dot, 0, Math.PI * 2);
                this.ctx.fillStyle = '#fff';
                this.ctx.fill();
                this.ctx.lineWidth = 1.5;
                this.ctx.strokeStyle = '#000';
                this.ctx.stroke();
            }
        }
        this.drawSelection();
    }

    drawSelection() {
        if (!this.ctx) return;
        const x = (this.selectedObject % this.columns) * this.tileSize;
        const y = Math.floor(this.selectedObject / this.columns) * this.tileSize;
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x + 1.5, y + 1.5, this.tileSize - 3, this.tileSize - 3);
    }

    setupPaletteEventListeners() {
        if (!this.canvas) return;
        this.canvas.addEventListener('click', event => {
            const rect = this.canvas.getBoundingClientRect();

            // Account for canvas scaling: convert client coordinates to canvas
            // coordinates, the same way the tileset preview does.
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = Math.floor(((event.clientX - rect.left) * scaleX) / this.tileSize);
            const y = Math.floor(((event.clientY - rect.top) * scaleY) / this.tileSize);
            const id = y * this.columns + x;
            if (id >= 0 && id <= 255) this.selectObject(id);
        });
    }

    selectObject(id) {
        if (window.reactor?.mapTool !== 'paint') window.reactor?.tilesetPaletteViewer?.selectLayer('O');
        if (this.mapEditor?.mapStamp) this.mapEditor.clearMapStamp();
        this.selectedObject = Math.max(0, Math.min(255, id));
        const label = document.getElementById('selected-object3d-number');
        if (label) label.textContent = String(this.selectedObject);
        this.renderPalette();
    }

    destroy() {
        if (this.objectLayer) {
            this.objectLayer.destroy({ children: true });
            this.objectLayer = null;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Object3DManager;
