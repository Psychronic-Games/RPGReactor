/**
 * TerrainManager - the Terrain tab: brushes that shape a 3D map's ground.
 *
 * Painting happens in the 3D view (MapEditor3D asks `active` and calls
 * `beginStroke` / `paintAt` / `endStroke`); this owns the brush settings,
 * the panel, and an undo stack of whole height fields per stroke.
 */
class TerrainManager {
    /** Water looks to start from: clear water with a sky in it, liquid mercury, and no reflection. */
    /** The liquids: how each reflects (reflect, gloss, tint) and what it is (colour, clear, waves, glow). */
    static WATER_LOOKS = {
        water: { reflect: 0.45, gloss: 0.85, tint: '#ffffff', colour: '', clear: 0.6, waves: 1, glow: 0 },
        mercury: { reflect: 1, gloss: 0.92, tint: '#d8dde3', colour: '#9aa3ad', clear: 0, waves: 0.4, glow: 0 },
        tar: { reflect: 0.35, gloss: 0.95, tint: '#ffffff', colour: '#0b0b0d', clear: 0, waves: 0.12, glow: 0 },
        lava: { reflect: 0, gloss: 0.3, tint: '#ffffff', colour: '#ff4a10', clear: 0, waves: 0.3, glow: 1 },
        slime: { reflect: 0.25, gloss: 0.85, tint: '#d6ffc4', colour: '#46c22c', clear: 0.2, waves: 0.5, glow: 0 },
        plain: { reflect: 0, gloss: 0.85, tint: '#ffffff', colour: '', clear: 0.6, waves: 1, glow: 0 }
    };

    /**
     * Grounds to start a type from: the material (img/materials), a tint and whether anything grows on it.
     * A project without the material's image still lists the type; it draws once the image is there.
     */
    static GROUND_PRESETS = [
        { name: 'Sand', material: 'Sand', tint: '', bare: true },
        { name: 'Dirt', material: 'Dirt', tint: '#8a6a4c' },
        { name: 'Gravel', material: 'Gravel', tint: '#8f8a82', bare: true },
        { name: 'Snow', material: 'Snow', tint: '', bare: true },
        { name: 'Mud', material: 'Mud', tint: '#5d4a3a', bare: true },
        { name: 'Ash', material: 'Ash', tint: '#4a4644', bare: true },
        { name: 'Red sand', material: 'Sand', tint: '#e8866a', bare: true },
        { name: 'Spore mat', material: 'Alien-Cells', tint: '#6fb84a' },
        { name: 'Crystal crust', material: 'Alien-Crystal', tint: '#a88cf0', bare: true },
        { name: 'Vein rock', material: 'Alien-Veins', tint: '#b04a60', bare: true },
        { name: 'Chitin plates', material: 'Alien-Chitin', tint: '#6a8a5a', bare: true },
        { name: 'Sponge reef', material: 'Alien-Sponge', tint: '#e8b0a0' }
    ];

    /** Foliage colors to start from: each kind's root and tip, the flowers' petals, a bush's leaves and blossom. */
    static FOLIAGE_PALETTES = {
        meadow: { grass: ['#4a7a30', '#b9c862'], flowers: ['#3f7a34', '#7fae4a'], petals: ['#f4d54a', '#ffffff', '#e86a8c', '#8f7fe8'], fern: ['#2f6b2c', '#7dbb4d'], reeds: ['#5a7a3a', '#c8c27a'], bush: ['#3f6b2b', '#f2c4d8'], bulbs: ['#3a5a3a', '#8ab86a'], bulbPetals: ['#fff2a8', '#ffffff'], tendrils: ['#2f6b2c', '#9ad06a'], crystals: ['#7a8a8a', '#e8f4f4'] },
        autumn: { grass: ['#8a6a2c', '#d9a441'], flowers: ['#7a5a2a', '#c98a3a'], petals: ['#e2702a', '#c8402a', '#f2c14a'], fern: ['#7a4a22', '#d98a3a'], reeds: ['#8a6a3a', '#e0c07a'], bush: ['#a8501e', ''], bulbs: ['#5a3a22', '#c98a3a'], bulbPetals: ['#ffb84a', '#ff7a3a'], tendrils: ['#7a3a1a', '#e8a04a'], crystals: ['#8a5a3a', '#ffd9a8'] },
        dry: { grass: ['#8d8346', '#dccf8f'], flowers: ['#857a44', '#c9bd7c'], petals: ['#f1e6b4', '#d9a85a'], fern: ['#7a7440', '#c2b876'], reeds: ['#9a8c54', '#e6d9a0'], bush: ['#77703c', ''], bulbs: ['#6a6238', '#c2b876'], bulbPetals: ['#f1e6b4', '#e0c07a'], tendrils: ['#7a7440', '#d8cc8a'], crystals: ['#9a9070', '#f4ecc8'] },
        snow: { grass: ['#6f8a7c', '#eef5f7'], flowers: ['#6a8478', '#dfeaec'], petals: ['#ffffff', '#cfe6ff'], fern: ['#5f7f74', '#e3eef0'], reeds: ['#8a9a94', '#f2f6f7'], bush: ['#5c7a70', '#ffffff'], bulbs: ['#5f7f74', '#dfeaec'], bulbPetals: ['#ffffff', '#cfe6ff'], tendrils: ['#5f7f8a', '#e3eef8'], crystals: ['#8ab0d0', '#f4faff'] },
        violet: { grass: ['#4a2f7a', '#c48cf0'], flowers: ['#3f2a6a', '#a070e0'], petals: ['#ff8adf', '#7ae6ff', '#fff07a'], fern: ['#3a2a70', '#b07af0'], reeds: ['#5a3a8a', '#e0a8ff'], bush: ['#4a2a7a', '#ff9ae0'], bulbs: ['#3a2a60', '#9a70d0'], bulbPetals: ['#ff8adf', '#7ae6ff', '#fff07a'], tendrils: ['#3a2a70', '#c48cf0'], crystals: ['#5a4a9a', '#d8c8ff'] },
        teal: { grass: ['#145a5a', '#6fe0c8'], flowers: ['#124f52', '#58c8b4'], petals: ['#f6ff8a', '#ff9a6a', '#ffffff'], fern: ['#0f4a50', '#5ad6c0'], reeds: ['#1f6a66', '#9af0dc'], bush: ['#125650', '#f6ff9a'], bulbs: ['#0f4a50', '#58c8b4'], bulbPetals: ['#f6ff8a', '#ff9a6a', '#9afff0'], tendrils: ['#0f4a50', '#6fe0c8'], crystals: ['#1f6a7a', '#b8fff0'] },
        crimson: { grass: ['#6a1420', '#f0705a'], flowers: ['#5a121c', '#d8584a'], petals: ['#ffd27a', '#ffffff', '#ff4a6a'], fern: ['#5a1018', '#e85a4a'], reeds: ['#7a2a24', '#ffa07a'], bush: ['#64141c', '#ffd27a'], bulbs: ['#5a1018', '#d8584a'], bulbPetals: ['#ffd27a', '#ff4a6a', '#ffffff'], tendrils: ['#5a1018', '#f0705a'], crystals: ['#8a2a3a', '#ffc0c8'] },
        glow: { grass: ['#0d3a44', '#7afff0'], flowers: ['#0c3440', '#5af0e0'], petals: ['#b8ff5a', '#5affea', '#ff7af0'], fern: ['#0a3040', '#6affd0'], reeds: ['#104a50', '#a8fff0'], bush: ['#0c3a40', '#c8ff6a'], bulbs: ['#0a3040', '#5af0e0'], bulbPetals: ['#b8ff5a', '#5affea', '#ff7af0'], tendrils: ['#0a3040', '#7afff0'], crystals: ['#104a60', '#a8fff0'], glow: 0.85 }
    };

    /**
     * A map's starting look, each set together: the ground laid over the whole floor, the cliff's tint,
     * the grounds to paint with, the foliage palette and the water's color. Heights are never touched.
     */
    static BIOMES = {
        temperate: { base: null, cliffTint: '', grounds: ['Dirt', 'Gravel', 'Sand'], palette: 'meadow', water: '' },
        desert: { base: 'Sand', cliffTint: '#c9a777', grounds: ['Red sand', 'Gravel', 'Dirt'], palette: 'dry', water: '#3f8f8a' },
        snow: { base: 'Snow', cliffTint: '#b8c0c8', grounds: ['Gravel', 'Dirt'], palette: 'snow', water: '#5f8fb0' },
        volcanic: { base: 'Ash', cliffTint: '#5a4e4a', grounds: ['Gravel', 'Mud'], palette: 'dry', water: '#ff4a10' },
        alienViolet: { base: 'Crystal crust', cliffTint: '#8a78b8', grounds: ['Vein rock', 'Sand'], palette: 'violet', water: '#b04ae0', plants: [['crystals', 6, 0.62], ['bulbs', 5, 0.7]] },
        alienFungal: { base: 'Spore mat', cliffTint: '#7f9a78', grounds: ['Mud', 'Vein rock'], palette: 'teal', water: '#46c22c', plants: [['tendrils', 6, 0.55], ['bulbs', 6, 0.62]] }
    };

    /** The Foliage group's modes: four kinds painted as a density, and bushes stood one by one. */
    static FOLIAGE_MODES = ['grass', 'flowers', 'fern', 'reeds', 'bulbs', 'tendrils', 'crystals', 'bush'];

    constructor(projectController) {
        this.projectController = projectController;
        this.active = false;
        this.mode = 'raise';
        this.radius = 3;
        this.strength = 0.5;
        this.waterMaterial = 'Water';
        this.waterLook = Object.assign({}, TerrainManager.WATER_LOOKS.water);
        this._preview = null;
        this.panel = null;
        this.undoStack = [];
        this.redoStack = [];
        this._stroke = null;
        // River: its channel's width and depth, and the course clicked so far.
        this.riverWidth = 3;
        this.riverDepth = 1;
        this._river = null;
        // Foliage: paint or erase, how thick, and each kind's look in hand.
        this.foliageErase = false;
        this.foliageLevel = 7;
        this.foliageLook = {};
        this.bushSize = 1.6;
        this.bushVary = true;
        this.bushColour = '';
        this.bushBloom = '';
        this._foliageStroke = null;
        // Ground: the type in hand, paint or erase, how full and how soft the brush's edge.
        this.groundType = 0;
        this.groundErase = false;
        this.groundLevel = 9;
        this.groundSoft = 0.4;
        // 'brush' paints under the pointer; 'rect' fills the rectangle a drag spans.
        this.groundShape = 'brush';
        this._groundStroke = null;
        // Dunes: where the wind blows toward, a ridge to the next, a crest's height, which field.
        this.dunes = { dir: 30, size: 10, height: 1.6, seed: 1, walkable: true };
    }

    ground() { return typeof RRMapGround !== 'undefined' ? RRMapGround : (window.RRMapGround || null); }

    foliage() { return typeof RRMapFoliage !== 'undefined' ? RRMapFoliage : (window.RRMapFoliage || null); }
    /** The Foliage group's eraser: its brush takes every kind away. */
    static FOLIAGE_ERASER = 'ferase';
    isFoliageMode(mode = this.mode) { return TerrainManager.FOLIAGE_MODES.includes(mode) || mode === TerrainManager.FOLIAGE_ERASER; }
    /** A kind's look in hand: what the runtime grows it as, with the author's changes over it. */
    foliageLookOf(kind) {
        const base = (typeof Reactor3D !== 'undefined' && Reactor3D.FOLIAGE_LOOKS && Reactor3D.FOLIAGE_LOOKS[kind]) || {};
        return Object.assign({ height: base.height, colour: base.colour, tip: base.tip, glow: base.glow || 0 }, this.foliageLook[kind] || {});
    }

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    elevation() { return typeof RRMapElevation !== 'undefined' ? RRMapElevation : (window.RRMapElevation || null); }
    currentMap() { return this.projectController?.getTilemapManager?.()?.currentMap || null; }

    initializeUI(container) {
        if (!container) return;
        this.panel = container;
        const t = key => this._t(key);
        if (!container.querySelector('.rr-terrain-panel')) {
            container.innerHTML = `
                <div class="rr-terrain-panel" style="display: flex; flex-direction: column; gap: 10px; padding: 10px; overflow-y: auto; min-height: 0;">
                    <div class="rr-terrain-hint" style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="terrain.hint">${t('terrain.hint')}</div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="terrain.brush">${t('terrain.brush')}</div>
                    <div class="rr-terrain-modes" role="radiogroup" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        ${['raise', 'lower', 'smooth', 'flatten'].map(mode => `<button type="button" class="rr-btn-secondary rr-terrain-mode" data-terrain-mode="${mode}" role="radio" aria-checked="${mode === this.mode}" style="padding: 6px 4px; font-size: 12px;" data-i18n="terrain.${mode}">${t('terrain.' + mode)}</button>`).join('')}
                    </div>
                    <label style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--color-text-muted);">
                        <span><span data-i18n="terrain.radius">${t('terrain.radius')}</span> <span class="rr-terrain-radius-value" style="color: var(--color-text);">${this.radius}</span></span>
                        <input type="range" class="rr-terrain-radius" min="1" max="12" step="0.5" value="${this.radius}" data-no-stepper>
                    </label>
                    <label style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--color-text-muted);">
                        <span><span data-i18n="terrain.strength">${t('terrain.strength')}</span> <span class="rr-terrain-strength-value" style="color: var(--color-text);">${this.strength}</span></span>
                        <input type="range" class="rr-terrain-strength" min="0.05" max="1" step="0.05" value="${this.strength}" data-no-stepper>
                    </label>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button type="button" class="rr-btn-secondary rr-terrain-undo" style="flex: 1; padding: 5px;" data-i18n="terrain.undo">${t('terrain.undo')}</button>
                        <button type="button" class="rr-btn-secondary rr-terrain-redo" style="flex: 1; padding: 5px;" data-i18n="terrain.redo">${t('terrain.redo')}</button>
                    </div>
                    <button type="button" class="rr-btn-secondary rr-terrain-clear" style="padding: 5px;" data-i18n="terrain.clear">${t('terrain.clear')}</button>
                    <div class="database-field-label" style="font-size: 11px; margin: 6px 0 0;" data-i18n="terrain.water">${t('terrain.water')}</div>
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="terrain.waterHint">${t('terrain.waterHint')}</div>
                    <div class="rr-terrain-water-modes" role="radiogroup" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <button type="button" class="rr-btn-secondary rr-terrain-mode" data-terrain-mode="fill" role="radio" aria-checked="false" style="padding: 6px 4px; font-size: 12px;" data-i18n="terrain.waterPour">${t('terrain.waterPour')}</button>
                        <button type="button" class="rr-btn-secondary rr-terrain-mode" data-terrain-mode="drain" role="radio" aria-checked="false" style="padding: 6px 4px; font-size: 12px;" data-i18n="terrain.waterErase">${t('terrain.waterErase')}</button>
                        <button type="button" class="rr-btn-secondary rr-terrain-mode" data-terrain-mode="look" role="radio" aria-checked="false" style="padding: 6px 4px; font-size: 12px; grid-column: span 2;" data-i18n="terrain.waterLook">${t('terrain.waterLook')}</button>
                    </div>
                    <div class="rr-terrain-look" hidden style="display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                            ${['water', 'mercury', 'plain'].map(p => `<button type="button" class="rr-btn-secondary rr-terrain-look-preset" data-preset="${p}" style="padding: 4px; font-size: 11px;" data-i18n="terrain.look.${p}">${t('terrain.look.' + p)}</button>`).join('')}
                        </div>
                        ${['reflect', 'gloss'].map(f => `<label style="display: grid; grid-template-columns: 70px 1fr 34px; align-items: center; gap: 6px; font-size: 11px; color: var(--color-text-muted);"><span data-i18n="terrain.look.${f}">${t('terrain.look.' + f)}</span><input type="range" class="rr-terrain-look-${f}" min="0" max="1" step="0.01" value="${this.waterLook[f]}" data-no-stepper><span class="rr-terrain-look-${f}-value" style="color: var(--color-text);">${Math.round(this.waterLook[f] * 100)}%</span></label>`).join('')}
                        <label style="display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 6px; font-size: 11px; color: var(--color-text-muted);"><span data-i18n="terrain.look.tint">${t('terrain.look.tint')}</span><input type="color" class="rr-terrain-look-tint" value="${this.waterLook.tint}"></label>
                        <div style="font-size: 11px; color: var(--color-text-muted);" data-i18n="terrain.look.hint">${t('terrain.look.hint')}</div>
                    </div>
                    <div class="rr-terrain-status" style="font-size: 11px; color: var(--color-text-muted);" data-rr-i18n-skip></div>
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="terrain.keys">${t('terrain.keys')}</div>
                </div>`;
            container.querySelectorAll('.rr-terrain-mode').forEach(button => button.addEventListener('click', () => this.setMode(button.dataset.terrainMode)));
            const radius = container.querySelector('.rr-terrain-radius');
            radius.addEventListener('input', () => { this.radius = Number(radius.value) || 3; container.querySelector('.rr-terrain-radius-value').textContent = this.radius; });
            const strength = container.querySelector('.rr-terrain-strength');
            strength.addEventListener('input', () => { this.strength = Number(strength.value) || 0.25; container.querySelector('.rr-terrain-strength-value').textContent = this.strength; });
            container.querySelector('.rr-terrain-undo').addEventListener('click', () => this.undo());
            container.querySelector('.rr-terrain-redo').addEventListener('click', () => this.redo());
            container.querySelector('.rr-terrain-clear').addEventListener('click', () => this.clear());
            const lookInputs = () => {
                for (const f of ['reflect', 'gloss']) {
                    container.querySelector(`.rr-terrain-look-${f}`).value = this.waterLook[f];
                    container.querySelector(`.rr-terrain-look-${f}-value`).textContent = Math.round(this.waterLook[f] * 100) + '%';
                }
                container.querySelector('.rr-terrain-look-tint').value = this.waterLook.tint;
            };
            for (const f of ['reflect', 'gloss']) {
                container.querySelector(`.rr-terrain-look-${f}`).addEventListener('input', event => { this.waterLook[f] = Number(event.target.value); lookInputs(); });
            }
            container.querySelector('.rr-terrain-look-tint').addEventListener('input', event => { this.waterLook.tint = event.target.value; });
            container.querySelectorAll('.rr-terrain-look-preset').forEach(button => button.addEventListener('click', () => {
                Object.assign(this.waterLook, TerrainManager.WATER_LOOKS[button.dataset.preset]);
                lookInputs();
            }));
        }
        this.refreshStatus();
    }

    setMode(mode) {
        if (!this.elevation()?.TERRAIN_MODES.includes(mode) && !['drain', 'fill', 'look', 'river', 'ground', 'dunes', 'biome', 'surround'].includes(mode) && !this.isFoliageMode(mode)) return;
        if (mode !== 'river') this.cancelRiver();
        this.mode = mode;
        if (mode !== 'look' && this.selectedWater) this.selectWater(null);
        const look = this.panel?.querySelector('.rr-terrain-look');
        if (look) look.hidden = mode !== 'look';
        window.reactor?.mapEditor3D?.hideWaterGhost?.();
        this._preview = null;
        this.panel?.querySelectorAll('.rr-terrain-mode').forEach(button => button.setAttribute('aria-checked', String(button.dataset.terrainMode === mode)));
    }

    /** A word in the status for a moment (the stroke's end would otherwise write the plain status straight over it). */
    /** What the ground and the water here are, for a status line. */
    statusText() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return '';
        if (!elevation.hasNote(map)) return this._t('terrain.needs3D');
        let text = elevation.hasTerrain(map) ? this._t('terrain.shaped') : this._t('terrain.flat');
        if (elevation.hasWater?.(map)) text += ' ' + this._t('terrain.waterCount', { count: elevation.water(map).length });
        return text;
    }

    _flash(key) {
        // Over the Build bar when it is up (the terrain tools live there), else the old panel's status line.
        const bar = window.reactor?.buildHotbar;
        if (bar?.visible) bar.flash(this._t(key));
        const status = this.panel?.querySelector('.rr-terrain-status');
        if (!status) return;
        status.textContent = this._t(key);
        this._flashUntil = Date.now() + 2500;
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => { this._flashUntil = 0; this.refreshStatus(); }, 2600);
    }

    refreshStatus() {
        // The Build bar's panel says it too (an undo from the keyboard does not redraw it).
        window.reactor?.buildHotbar?.refreshTerrainStatus?.(this.statusText());
        const status = this.panel?.querySelector('.rr-terrain-status');
        if (!status || Date.now() < (this._flashUntil || 0)) return;
        const map = this.currentMap(), elevation = this.elevation();
        const is3D = !!(map && elevation && elevation.hasNote(map));
        status.textContent = !map ? '' : !is3D ? this._t('terrain.needs3D') : elevation.hasTerrain(map) ? this._t('terrain.shaped') : this._t('terrain.flat');
        if (map && is3D && elevation.hasWater?.(map)) status.textContent += ' ' + this._t('terrain.waterCount', { count: elevation.water(map).length });
    }

    activate() {
        window.reactor?.claimMapTool?.('terrain');
        const mapEditor = window.reactor?.mapEditor;
        if (!this.active) this._resumeMapEditor = !!mapEditor?.enabled;
        this.active = true;
        mapEditor?.setEnabled?.(false);
        // Terrain is shaped in the 3D view: bring it up for a 3D map.
        const map = this.currentMap();
        if (map && this.elevation()?.hasNote(map)) {
            const toggle = document.getElementById('map-3d-view');
            if (toggle && !toggle.checked) toggle.click();
        }
        this.refreshStatus();
        this.syncHistoryButtons();
    }

    /** Another map: the history and the sheet in the Look panel were the last map's. */
    setMap() {
        this.undoStack = []; this.redoStack = [];
        this._stroke = null;
        this._foliageStroke = null;
        this._groundStroke = null;
        this.groundType = 0;
        this.cancelRiver();
        this._groundSnapshot = null;
        this._lookSnapshot = null;
        this._cliffSnapshot = null;
        this._surroundSnapshot = null;
        this._surroundNumbers = null;
        this.mapEdges()?.drop?.();
        this._basins = null; this._preview = null;
        if (this.selectedWater) this.selectWater(null);
        if (this.active) this.syncHistoryButtons();
    }

    deactivate() {
        if (!this.active) return;
        this._settleGathered();
        // Another tool taken up mid-stroke: the stroke so far is a step, its ponds and pieces follow the ground.
        if (this._stroke || this._foliageStroke || this._groundStroke) this.endStroke();
        this.active = false;
        this.cancelRiver();
        this.selectedWater = null;
        window.reactor?.mapEditor3D?.showWaterSelection?.(null);
        // Pour's preview goes with the tool; picked up again, it shows at once.
        window.reactor?.mapEditor3D?.hideWaterGhost?.();
        this._preview = null;
        const mapEditor = window.reactor?.mapEditor;
        if (mapEditor && this._resumeMapEditor) {
            mapEditor.setEnabled(true);
            mapEditor.setupMapInteraction?.();
        }
    }

    /**
     * Called by the 3D view at the first touch of a stroke; `point` is in
     * tiles. The first dab is the click: it lands whole, so a single click
     * visibly moves the ground. A drag then lays a dab every part of a
     * tile of travel (`spacing`), so a slow drag and a fast one build the
     * same ridge and holding still does not keep piling up.
     */
    beginStroke(point) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !point) return false;
        // Water: Pour fills the hollow under the click; Remove takes the sheet under it.
        if (this.mode === 'fill') return this.pourAt(point);
        if (this.mode === 'river') return this.riverPoint(point);
        if (this.isFoliageMode()) return this.beginFoliage(point);
        if (this.mode === 'ground') return this.beginGround(point);
        // The biome and the border panels have no brush.
        if (this.mode === 'biome' || this.mode === 'surround') return false;
        if (this.mode === 'drain') {
            const cell = { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
            return this.drain(saved => elevation.removeWaterAt(map, cell.x, cell.y));
        }
        this.undoStack.push(this.groundSnapshot(map));
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        // Flatten levels to the ground under the first touch.
        // Dunes are laid on the ground as the stroke found it.
        this._stroke = { reference: elevation.terrainHeightAt(map, point.x + 0.5, point.y + 0.5), moved: false, last: null,
            base: this.mode === 'dunes' ? this.undoStack[this.undoStack.length - 1].terrain : null };
        return this.dab(point);
    }

    /**
     * Pour into the hollow under a point: the water rises until it would
     * spill, one sheet over the hollow's cells. Nothing happens on open
     * ground, or in a hollow already full to its rim; the status says which.
     */
    pourAt(point) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !point) return false;
        const cell = { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
        const basin = this.basinAt(cell.x, cell.y);
        if (!basin) { this._flash('terrain.noBasin'); return false; }
        const standing = elevation.waterAt(map, cell.x, cell.y);
        if (standing && standing.level >= basin.level - 1e-6) { this._flash('terrain.waterFull'); return false; }
        const saved = elevation.waterSnapshot(map);
        if (!elevation.fillWaterAt(map, cell.x, cell.y, this.waterMaterial)) return false;
        // Poured as the liquid in hand: tar pours as tar.
        const poured = elevation.waterAt(map, cell.x, cell.y);
        if (poured) elevation.styleWaterRegion(map, poured, this.waterLook);
        this.undoStack.push({ water: saved }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announce(null, true); this.refreshStatus();
        return true;
    }

    /** A sheet's look as the panel shows it, its unset values filled with water's. */
    lookOf(region) {
        return { reflect: region.reflect ?? 0, gloss: region.gloss ?? 0.85, tint: region.tint || '#ffffff', colour: region.colour || '',
            clear: region.clear ?? 0.6, waves: region.waves ?? 1, glow: region.glow ?? 0 };
    }

    /**
     * Pick the sheet the Look panel edits (a click on it in Look mode): it is
     * outlined, and its look fills the panel. Null lets go.
     */
    selectWater(region) {
        // A look still being changed (a colour a moment from its commit) is kept as its own step first.
        if (this._lookSnapshot) this.editLook({}, 'commit');
        this.selectedWater = region ? { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1, level: region.level } : null;
        if (region) this.waterLook = this.lookOf(region);
        this._lookSnapshot = null;
        window.reactor?.mapEditor3D?.showWaterSelection?.(this.selectedWater);
        window.reactor?.buildHotbar?.render?.();
    }

    /** The selected sheet as it stands in the sidecar now, or null. */
    selectedRegion() {
        const key = this.selectedWater, map = this.currentMap(), elevation = this.elevation();
        if (!key || !map || !elevation) return null;
        return elevation.water(map).find(r => r.x0 === key.x0 && r.y0 === key.y0 && r.x1 === key.x1 && r.y1 === key.y1 && Math.abs(r.level - key.level) < 1e-6) || null;
    }

    /**
     * Change the look in hand and, with a sheet selected, that sheet: 'live'
     * while a slider moves (the sheet's material follows at once, one undo step
     * gathered), 'commit' when it lets go (the step is kept, the view rebuilt).
     */
    editLook(patch, phase = 'commit') {
        Object.assign(this.waterLook, patch || {});
        const map = this.currentMap(), elevation = this.elevation(), region = this.selectedRegion();
        if (!map || !elevation || !region) return false;
        // A commit with nothing gathered and nothing new (a late timer after the step was kept) is no step.
        if (phase !== 'live' && !this._lookSnapshot && !Object.keys(patch || {}).length) return false;
        if (!this._lookSnapshot) this._lookSnapshot = elevation.waterSnapshot(map);
        elevation.styleWaterRegion(map, region, this.waterLook);
        if (phase === 'live') {
            window.reactor?.mapEditor3D?.restyleWater?.(this.selectedWater, this.waterLook);
            return true;
        }
        this.undoStack.push({ water: this._lookSnapshot }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this._lookSnapshot = null;
        this.announce(null, true); this.refreshStatus();
        window.reactor?.mapEditor3D?.showWaterSelection?.(this.selectedWater);
        return true;
    }

    /** Give the sheet the 3D view found under the pointer the look set in the panel. */
    styleRegion(region) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !region) return false;
        return this.drain(() => elevation.styleWaterRegion(map, region, this.waterLook));
    }

    /** Remove the sheet the 3D view found under the pointer (so a sheet standing high over the ground still goes). */
    drainRegion(region) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !region) return false;
        return this.drain(() => elevation.removeWaterRegion(map, region));
    }

    drain(remove) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return false;
        const saved = elevation.waterSnapshot(map);
        if (!remove(saved)) return false;
        this.undoStack.push({ water: saved }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announce(null, true); this.refreshStatus();
        return true;
    }

    /** The hollow under a cell, remembered per cell until the ground changes. */
    basinAt(x, y) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return null;
        const key = map.id + ':' + x + ',' + y;
        if (!this._basins || this._basinsMap !== map) { this._basins = new Map(); this._basinsMap = map; }
        if (!this._basins.has(key)) { this._basins.set(key, elevation.waterBasin(map, x, y)); if (this._basins.size > 400) this._basins.delete(this._basins.keys().next().value); }
        return this._basins.get(key);
    }

    /**
     * River: each click adds a point to the course (in tiles, the cell's
     * middle at x + 0.5); a second click on the last point within a moment
     * (a double-click) lays the river, as Enter does.
     */
    riverPoint(point) {
        if (!point) return false;
        const at = { x: point.x + 0.5, y: point.y + 0.5 }, now = Date.now();
        const river = this._river || (this._river = { points: [], clickedAt: 0 });
        const last = river.points[river.points.length - 1];
        if (last && now - river.clickedAt < 400 && Math.hypot(at.x - last[0], at.y - last[1]) < 0.75) return this.finishRiver();
        river.clickedAt = now;
        if (!last || Math.hypot(at.x - last[0], at.y - last[1]) >= 0.5) river.points.push([Math.round(at.x * 100) / 100, Math.round(at.y * 100) / 100]);
        this._showRiver(null);
        window.reactor?.buildHotbar?.renderTerrainPanel?.();
        return true;
    }

    /** Whether a course is being clicked out. */
    riverPending() { return !!(this._river && this._river.points.length); }

    _showRiver(cursor) {
        const view = window.reactor?.mapEditor3D;
        const points = this._river ? this._river.points : [];
        if (!points.length) { view?.hideRiverGhost?.(); return; }
        view?.showRiverGhost?.(cursor ? points.concat([cursor]) : points, this.riverWidth);
    }

    /**
     * Lay the river along the course clicked: its channel is carved, it runs
     * downhill from the first point, falls where the ground drops, and one
     * undo step takes the ground and the water back together.
     */
    finishRiver() {
        const map = this.currentMap(), elevation = this.elevation();
        const points = this._river ? this._river.points : [];
        if (!map || !elevation?.carveRiver) return false;
        if (points.length < 2) { this._flash('terrain.riverShort'); return false; }
        const saved = this.groundSnapshot(map);
        const laid = elevation.carveRiver(map, points, Object.assign({ width: this.riverWidth, depth: this.riverDepth, material: this.waterMaterial }, this._riverLook()));
        if (!laid) { this._flash('terrain.riverNone'); return false; }
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this._seal(saved);
        this.cancelRiver();
        this.announce(); this.announce(null, true);
        this._relayPieces(laid.region);
        this.refreshStatus();
        window.reactor?.buildHotbar?.renderTerrainPanel?.();
        return true;
    }

    /** The look in hand, as a river is written with it (water's own values left out). */
    _riverLook() {
        const look = this.waterLook || {}, out = {};
        if (Number(look.reflect) > 0) Object.assign(out, { reflect: Number(look.reflect), gloss: Number(look.gloss), tint: look.tint });
        if (look.colour) out.colour = look.colour;
        if (look.clear !== undefined && Math.abs(Number(look.clear) - 0.6) > 1e-6) out.clear = Number(look.clear);
        if (look.waves !== undefined && Math.abs(Number(look.waves) - 1) > 1e-6) out.waves = Number(look.waves);
        if (Number(look.glow) > 0) out.glow = Number(look.glow);
        return out;
    }

    /** Drop the course clicked so far. */
    cancelRiver() {
        if (!this._river) return false;
        this._river = null;
        window.reactor?.mapEditor3D?.hideRiverGhost?.();
        window.reactor?.buildHotbar?.renderTerrainPanel?.();
        return true;
    }

    /** Keys while the River slot is in hand: Enter lays the river, Escape drops the course. True when taken. */
    handleRiverKey(event) {
        if (this.mode !== 'river' || !this.riverPending()) return false;
        if (event.key === 'Enter') { this.finishRiver(); return true; }
        if (event.key === 'Escape') { this.cancelRiver(); return true; }
        return false;
    }

    /** The pointer over the ground in Pour: a ghost of the hollow the click would fill. Elsewhere, no ghost. */
    hoverAt(point) {
        const view = window.reactor?.mapEditor3D;
        if (this.mode === 'river') { if (this.riverPending()) this._showRiver(point ? [point.x + 0.5, point.y + 0.5] : null); return; }
        if (this.mode !== 'fill' || !point) { if (this._preview) { view?.hideWaterGhost?.(); this._preview = null; } return; }
        const cell = { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
        if (this._preview && this._preview.x === cell.x && this._preview.y === cell.y) return;
        this._preview = cell;
        const basin = this.basinAt(cell.x, cell.y);
        if (basin) view?.showWaterGhost?.(basin); else view?.hideWaterGhost?.();
    }

    // ---- Foliage ------------------------------------------------------------

    /** A foliage stroke starts: one undo step for the whole of it; the first dab lands at once. */
    beginFoliage(point) {
        const map = this.currentMap(), foliage = this.foliage();
        if (!map || !foliage || !point) return false;
        this._foliageStroke = { saved: foliage.snapshot(map), region: null, last: null, travelled: 0 };
        return this.foliageDab(point, true);
    }

    foliageDab(point, first) {
        const map = this.currentMap(), foliage = this.foliage(), stroke = this._foliageStroke;
        if (!map || !foliage || !stroke) return false;
        const cx = point.x + 0.5, cy = point.y + 0.5;
        let changed = null;
        if (this.mode === TerrainManager.FOLIAGE_ERASER) {
            // Every kind under the brush, and the bushes that stand in it.
            const last = stroke.last, spacing = Math.max(0.35, this.radius * 0.3);
            if (!first && last && Math.hypot(cx - last.x, cy - last.y) < spacing) return false;
            const join = region => { if (region) changed = changed ? { x0: Math.min(changed.x0, region.x0), y0: Math.min(changed.y0, region.y0), x1: Math.max(changed.x1, region.x1), y1: Math.max(changed.y1, region.y1) } : region; };
            for (const kind of TerrainManager.FOLIAGE_MODES) {
                if (kind !== 'bush') join(foliage.paint(map, kind, cx, cy, { radius: this.radius, strength: 1, level: this.foliageLevel, erase: true, settings: this.foliageLook[kind] || {} }));
            }
            if (foliage.removeBushes(map, cx, cy, this.radius)) join({ x0: Math.floor(cx - this.radius), y0: Math.floor(cy - this.radius), x1: Math.ceil(cx + this.radius), y1: Math.ceil(cy + this.radius) });
            stroke.last = { x: cx, y: cy };
        } else if (this.mode === 'bush') {
            if (this.foliageErase) {
                if (foliage.removeBushes(map, cx, cy, this.radius * 0.5)) changed = { x0: Math.floor(cx - this.radius), y0: Math.floor(cy - this.radius), x1: Math.ceil(cx + this.radius), y1: Math.ceil(cy + this.radius) };
            } else {
                // Not on a ground where nothing grows (a script may still stand one there by its place).
                if (typeof Reactor3D !== 'undefined' && Reactor3D.groundBareAt && Reactor3D.groundBareAt(map, Math.floor(cx), Math.floor(cy))) { if (first) this._flashText(this._tt('Nothing grows on this ground.')); return false; }
                // A click stands one bush; a drag one every bush's width of travel, scattered over the brush when they vary.
                const last = stroke.last, step = Math.max(0.8, this.bushSize * 1.1);
                if (!first && last && Math.hypot(cx - last.x, cy - last.y) < step) return false;
                const vary = this.bushVary, r = vary && !first ? Math.random() * this.radius * 0.5 : 0, a = Math.random() * Math.PI * 2;
                const size = vary ? this.bushSize * (0.75 + Math.random() * 0.5) : this.bushSize;
                const bush = foliage.addBush(map, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, size, colour: this.bushColour || undefined, bloom: this.bushBloom || undefined, tall: vary ? 0.85 + Math.random() * 0.35 : 1 });
                if (bush) changed = { x0: Math.floor(bush.x - bush.size), y0: Math.floor(bush.y - bush.size), x1: Math.ceil(bush.x + bush.size), y1: Math.ceil(bush.y + bush.size) };
                stroke.last = { x: cx, y: cy };
            }
        } else {
            const last = stroke.last, spacing = Math.max(0.35, this.radius * 0.3);
            if (!first && last && Math.hypot(cx - last.x, cy - last.y) < spacing) return false;
            const look = this.foliageLook[this.mode] || {};
            changed = foliage.paint(map, this.mode, cx, cy, { radius: this.radius, strength: this.strength, level: this.foliageLevel, erase: this.foliageErase, settings: look });
            stroke.last = { x: cx, y: cy };
        }
        if (!changed) return false;
        const seen = stroke.region;
        stroke.region = seen ? { x0: Math.min(seen.x0, changed.x0), y0: Math.min(seen.y0, changed.y0), x1: Math.max(seen.x1, changed.x1), y1: Math.max(seen.y1, changed.y1) } : changed;
        this.announceFoliage(changed);
        return true;
    }

    endFoliage() {
        const stroke = this._foliageStroke;
        this._foliageStroke = null;
        if (!stroke || !stroke.region) return;
        this.undoStack.push({ foliage: stroke.saved, foliageSet: true }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.syncHistoryButtons();
    }

    /** The map's wind (direction in degrees, strength), one undo step each change. */
    setWind(patch) {
        const map = this.currentMap(), foliage = this.foliage();
        if (!map || !foliage) return false;
        const saved = foliage.snapshot(map);
        if (!foliage.setWind(map, patch)) { this._flash('foliage.windNeedsFoliage'); return false; }
        this.undoStack.push({ foliage: saved, foliageSet: true }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announceFoliage(null);
        return true;
    }

    /** Foliage changed where it says (cells), or everywhere: the 3D view grows those chunks again. */
    announceFoliage(region) {
        this.syncHistoryButtons();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, foliage: true, region: region || null } }));
    }

    // ---- Ground types ------------------------------------------------------

    /** The map's ground types as stored, and the one in hand (null when the map has none). */
    groundTypes() { const map = this.currentMap(), ground = this.ground(); return map && ground ? ground.types(map) : []; }
    groundTypeInHand() { const types = this.groundTypes(); if (this.groundType >= types.length) this.groundType = Math.max(0, types.length - 1); return types[this.groundType] || null; }

    /** One undo step round a change to the ground types; `structure` says the types themselves changed (the view builds again). */
    _groundStep(change, structure = true) {
        const map = this.currentMap(), ground = this.ground();
        if (!map || !ground) return false;
        const saved = ground.snapshot(map);
        const result = change(map, ground);
        if (result === false || result === -1 || result === null) return result;
        this.undoStack.push({ groundPaint: saved, groundSet: true }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announceGround(null, structure);
        return result;
    }

    /** A new type from a preset or a material; it becomes the one in hand. -1 when the map has as many as it may. */
    addGroundType(source) {
        const index = this._groundStep((map, ground) => ground.addType(map, source));
        if (index >= 0) { this.groundType = index; this.groundErase = false; }
        else if (index === -1) this._flashText(this._tt('A map holds eight ground types.'));
        return index;
    }

    /** Change the type in hand: 'live' while a color or slider moves (one step gathered), 'commit' when it lets go. */
    editGroundType(patch, phase = 'commit') {
        const map = this.currentMap(), ground = this.ground(), index = this.groundType;
        if (!map || !ground || !ground.types(map)[index]) return false;
        if (phase !== 'live' && !this._groundSnapshot && !Object.keys(patch || {}).length) return false;
        if (!this._groundSnapshot) this._groundSnapshot = { saved: ground.snapshot(map), structure: false };
        if (patch && 'material' in patch) this._groundSnapshot.structure = true;
        if (patch && Object.keys(patch).length) ground.updateType(map, index, patch);
        if (phase === 'live') { this.announceGround(null, this._groundSnapshot.structure); return true; }
        const gathered = this._groundSnapshot;
        this._groundSnapshot = null;
        this.undoStack.push({ groundPaint: gathered.saved, groundSet: true }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announceGround(null, gathered.structure);
        return true;
    }

    removeGroundType() {
        const removed = this._groundStep((map, ground) => ground.removeType(map, this.groundType));
        if (removed) this.groundType = Math.max(0, this.groundType - 1);
        return removed;
    }

    /** The type in hand over the whole map (or, erasing, every type off it). */
    fillGround() {
        return this._groundStep((map, ground) => ground.fill(map, this.groundErase ? -1 : this.groundType, null, this.groundLevel) || null, false);
    }

    beginGround(point) {
        const map = this.currentMap(), ground = this.ground();
        if (!map || !ground || !point) return false;
        if (this._groundSnapshot) this.editGroundType({}, 'commit');
        if (!this.groundErase && !this.groundTypeInHand()) { this._flashText(this._tt('Add a ground type first.')); return false; }
        this._groundStroke = { saved: ground.snapshot(map), region: null, last: null,
            start: this.groundShape === 'rect' ? { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) } : null };
        return this.groundDab(point, true);
    }

    groundDab(point, first) {
        const map = this.currentMap(), ground = this.ground(), stroke = this._groundStroke;
        if (!map || !ground || !stroke) return false;
        if (stroke.start) return this.groundRect(point);
        const cx = point.x + 0.5, cy = point.y + 0.5, last = stroke.last, spacing = Math.max(0.35, this.radius * 0.3);
        if (!first && last && Math.hypot(cx - last.x, cy - last.y) < spacing) return false;
        stroke.last = { x: cx, y: cy };
        const changed = ground.paint(map, this.groundType, cx, cy, { radius: this.radius, strength: this.strength, level: this.groundLevel, soft: this.groundSoft, erase: this.groundErase });
        if (!changed) return false;
        const seen = stroke.region;
        stroke.region = seen ? { x0: Math.min(seen.x0, changed.x0), y0: Math.min(seen.y0, changed.y0), x1: Math.max(seen.x1, changed.x1), y1: Math.max(seen.y1, changed.y1) } : changed;
        this.announceGround(changed, false);
        return true;
    }

    /** The rectangle from where the drag began to the pointer, filled (or cleared) whole; it follows the pointer until the drag ends. */
    groundRect(point) {
        const map = this.currentMap(), ground = this.ground(), stroke = this._groundStroke;
        const end = { x: Math.max(0, Math.min(map.width - 1, Math.floor(point.x + 0.5))), y: Math.max(0, Math.min(map.height - 1, Math.floor(point.y + 0.5))) };
        if (stroke.end && stroke.end.x === end.x && stroke.end.y === end.y) return false;
        stroke.end = end;
        const rect = { x0: Math.min(stroke.start.x, end.x), y0: Math.min(stroke.start.y, end.y), x1: Math.max(stroke.start.x, end.x), y1: Math.max(stroke.start.y, end.y) };
        ground.restore(map, stroke.saved);
        const count = ground.fill(map, this.groundErase ? -1 : this.groundType, (x, y) => x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1, this.groundLevel);
        const was = stroke.rect || rect;
        stroke.rect = rect;
        if (count || stroke.region) stroke.region = stroke.region
            ? { x0: Math.min(stroke.region.x0, rect.x0), y0: Math.min(stroke.region.y0, rect.y0), x1: Math.max(stroke.region.x1, rect.x1), y1: Math.max(stroke.region.y1, rect.y1) } : rect;
        this.announceGround({ x0: Math.min(was.x0, rect.x0), y0: Math.min(was.y0, rect.y0), x1: Math.max(was.x1, rect.x1), y1: Math.max(was.y1, rect.y1) }, false);
        return !!count;
    }

    /** Give a map with no floor one to paint over: the room's floor becomes `name` (an image under img/parallaxes). One undo step. */
    setGroundFloor(name) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !name || !elevation.hasNote(map)) return false;
        this._settleGathered();
        const saved = { biome: true, label: 'Ground', ground: this.ground().snapshot(map), foliage: this.foliage() ? this.foliage().snapshot(map) : null, room: map.reactor3d && map.reactor3d.room ? JSON.parse(JSON.stringify(map.reactor3d.room)) : null, water: elevation.waterSnapshot(map) };
        if (!elevation.setRoom(map, Object.assign({}, elevation.room(map), { floor: name }))) return false;
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this._announceAll();
        return true;
    }

    /** Whether the map has a floor for ground types to lie over. */
    hasGroundFloor() { const map = this.currentMap(), elevation = this.elevation(); return !!(map && elevation && elevation.room(map).floor); }

    endGround() {
        const stroke = this._groundStroke;
        this._groundStroke = null;
        if (!stroke || !stroke.region) return;
        this.undoStack.push({ groundPaint: stroke.saved, groundSet: true }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        // What grows follows the ground: a bare type clears the foliage drawn on it.
        this.announceFoliage(stroke.region);
        // Rocks capped with the ground wear what is painted under them.
        this._relayGroundCaps();
        this.syncHistoryButtons();
    }

    /** Rocks capped with "ground" are laid again, when the map has any: their tops follow the paint. */
    _relayGroundCaps() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation?.hasPieces?.(map) || !elevation.pieces(map).some(piece => piece.kind === 'rock' && piece.cap === 'ground')) return;
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: map.id, pieces: true, region: null } }));
    }

    /** The ground types changed where it says (cells), or everywhere; `structure` when the types themselves did. */
    announceGround(region, structure) {
        this.syncHistoryButtons();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, ground: true, types: !!structure, region: region || null } }));
    }

    _tt(text) { return window.I18n?.tText ? window.I18n.tText(text) : text; }
    _flashText(text) { const bar = window.reactor?.buildHotbar; if (bar?.visible) bar.flash(text); }

    /**
     * A biome: its ground laid over the whole floor under what is already painted (`replace` clears
     * the paint first), its other grounds added to paint with, the cliff tinted, the foliage on the
     * map and in hand recolored, the water colored. One undo step. Heights are not touched.
     */
    applyBiome(key, replace = false) {
        const biome = TerrainManager.BIOMES[key], map = this.currentMap(), ground = this.ground(), elevation = this.elevation(), foliage = this.foliage();
        if (!biome || !map || !ground || !elevation) return false;
        this._settleGathered();
        const saved = { biome: true, ground: ground.snapshot(map), foliage: foliage ? foliage.snapshot(map) : null, room: map.reactor3d && map.reactor3d.room ? JSON.parse(JSON.stringify(map.reactor3d.room)) : null, water: elevation.waterSnapshot(map) };
        const preset = name => TerrainManager.GROUND_PRESETS.find(entry => entry.name === name);
        let types = replace ? [] : ground.types(map);
        // A biome's own ground from an earlier pick gives way to this one's.
        types = types.filter(type => !type.biome);
        const size = map.width * map.height;
        const wanted = [];
        if (biome.base) wanted.push(Object.assign({}, preset(biome.base), { paint: ground.encode(new Uint8Array(size).fill(9)), biome: true }));
        const list = wanted.concat(types);
        for (const name of biome.grounds) {
            const entry = preset(name);
            if (entry && list.length < ground.MAX && !list.some(type => (type.name || type.material) === entry.name)) list.push(Object.assign({}, entry, { paint: '' }));
        }
        map.reactor3d = map.reactor3d || { version: 1, mode: '3d' };
        const records = list.map(type => { const record = ground.typeRecord(type); if (record && type.biome) record.biome = true; return record; }).filter(Boolean);
        if (records.length) map.reactor3d.ground = { types: records }; else delete map.reactor3d.ground;
        if (map.reactor3d.room && typeof map.reactor3d.room === 'object') {
            map.reactor3d.room = Object.assign({}, map.reactor3d.room);
            if (biome.cliffTint) map.reactor3d.room.cliffTint = biome.cliffTint; else delete map.reactor3d.room.cliffTint;
        }
        this.applyFoliagePalette(biome.palette, false);
        // An alien biome's own plants, in patches, where that kind does not grow yet.
        if (foliage && biome.plants) {
            const hash = (x, y, seed) => { const v = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };
            const noise = (x, y, seed) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
                return (hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx) * (1 - sy) + (hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx) * sy; };
            biome.plants.forEach(([kind, level, threshold], index) => {
                const planted = (foliage.snapshot(map)?.layers || []).some(layer => layer.kind === kind && /[1-9]/.test(String(layer.density || '')));
                if (planted) return;
                foliage.fill(map, kind, (x, y) => {
                    const n = noise(x / 7, y / 7, index + 1);
                    return n > threshold ? Math.max(1, Math.round(level * Math.min(1, (n - threshold) / 0.15))) : null;
                }, level, this.foliageLook[kind] || {});
            });
        }
        if (biome.water && elevation.hasWater?.(map)) for (const sheet of elevation.water(map)) elevation.styleWaterRegion(map, sheet, Object.assign(this.lookOf(sheet), { colour: biome.water }));
        this.groundType = 0;
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this._announceAll();
        return true;
    }

    // ---- The steep ground and the land past the border ---------------------

    mapEdges() { return typeof RRMapEdges !== 'undefined' ? RRMapEdges : (window.RRMapEdges || null); }

    /** The room's steep ground as `{ name, slope, tint }`: the material it turns to ('' for none), the angle it starts at, its tint ('' for none). */
    cliff() {
        const map = this.currentMap(), elevation = this.elevation();
        return elevation?.roomCliff ? elevation.roomCliff(elevation.room(map)) : { name: 'Rock', slope: 40, tint: '' };
    }

    /** Whether the map's ground has slopes for the steep ground to show on: a flat map has none. */
    hasSlopes() { const map = this.currentMap(), elevation = this.elevation(); return !!(map && elevation && elevation.hasTerrain(map)); }

    _writeCliff(map, cliff) {
        const elevation = this.elevation();
        return elevation.setRoom(map, Object.assign({}, elevation.room(map), { cliff: cliff.name, cliffSlope: cliff.slope, cliffTint: cliff.tint || '' }));
    }

    /**
     * Change the room's steep ground by `patch` (`name`, `slope`, `tint`): 'live' while a slider or a color
     * moves (one undo step gathered, the floor follows at once), 'commit' when it lets go (the step is kept).
     */
    setCliff(patch, phase = 'commit') {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation?.roomCliff || !elevation.hasNote(map)) return false;
        const said = patch && Object.keys(patch).length;
        // A change made whole while another is still gathering (a color still settling, then a material): that one is its own step first.
        if (phase !== 'live' && said && this._cliffSnapshot) this.setCliff({}, 'commit');
        if (phase !== 'live' && !this._cliffSnapshot && !said) return false;
        const before = this.cliff();
        if (!this._cliffSnapshot) this._cliffSnapshot = before;
        if (said && this._writeCliff(map, Object.assign({}, before, patch))) this.announceCliff();
        if (phase === 'live') return true;
        const gathered = this._cliffSnapshot;
        this._cliffSnapshot = null;
        // A drag that ended where it began is no step.
        if (JSON.stringify(gathered) === JSON.stringify(this.cliff())) return false;
        this.undoStack.push({ cliffSet: true, cliff: gathered }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.syncHistoryButtons();
        return true;
    }

    /** The steep ground changed: the 3D view puts it on the floor as it stands; the rest of the scene stays. */
    announceCliff() {
        this.syncHistoryButtons();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, cliff: true } }));
    }

    /** The map's `surround` as stored (what lies past its border), or null. */
    surround() { const map = this.currentMap(); return (map && map.reactor3d && map.reactor3d.surround) || null; }

    /**
     * What a change to the land past the border starts from: the map's `surround`, or, with nothing there,
     * the numbers it had when Nothing was picked on this map (a style picked again is as far and as hilly as before).
     */
    surroundBase() { return this.surround() || (this._surroundNumbers ? Object.assign({ style: 'none' }, this._surroundNumbers) : null); }

    _writeSurround(map, value) {
        if (value) {
            // A 2D map's sidecar is made without a view mode: only a 3D map says how it is looked at.
            const sidecar = map.reactor3d && typeof map.reactor3d === 'object' ? map.reactor3d : (this.elevation().hasNote(map) ? this.elevation().ensure(map) : (map.reactor3d = { version: 1 }));
            if (sidecar) sidecar.surround = JSON.parse(JSON.stringify(value));
        } else if (map.reactor3d) delete map.reactor3d.surround;
    }

    /**
     * Set what lies past the map's border: `next` is the `surround` to store (RRMapEdges.patch makes it), null
     * for nothing. 'live' while a slider moves (one undo step gathered, the land laid on the view's next
     * frame), 'commit' when it lets go (the step is kept).
     */
    setSurround(next, phase = 'commit') {
        const map = this.currentMap(), elevation = this.elevation();
        // A 2D map takes the maps past its sides (they are entered from any map) and nothing of the land past the border, which is a 3D map's.
        if (!map || !elevation) return false;
        if (!elevation.hasNote(map) && next && next.style && next.style !== 'none') return false;
        const key = value => JSON.stringify(value || null);
        const before = this.surround(), changed = key(before) !== key(next);
        // A change made whole while another is still gathering (a slider's keys, then a tile): that one is its own step first.
        if (phase !== 'live' && changed && this._surroundSnapshot) this.setSurround(before, 'commit');
        if (phase !== 'live' && !this._surroundSnapshot && !changed) return false;
        if (!this._surroundSnapshot) this._surroundSnapshot = { surround: before ? JSON.parse(JSON.stringify(before)) : null };
        if (changed && before && !next) {
            const { style, edges, neighbors, ...numbers } = JSON.parse(JSON.stringify(before));
            this._surroundNumbers = numbers;
        }
        if (changed) { this._writeSurround(map, next); this.announceSurround(); }
        if (phase === 'live') return true;
        const gathered = this._surroundSnapshot;
        this._surroundSnapshot = null;
        // A drag that ended where it began is no step.
        if (key(gathered.surround) === key(this.surround())) return false;
        this.undoStack.push({ surroundSet: true, surround: gathered.surround }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.syncHistoryButtons();
        return true;
    }

    /** The land past the border changed: the 3D view lays it again on its next frame; the rest of the scene stays. */
    announceSurround() {
        this.syncHistoryButtons();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, surround: true } }));
    }

    /** The steep ground or the land past the border still being dragged is a step first. */
    _settleMapSettings() {
        if (this._cliffSnapshot) this.setCliff({}, 'commit');
        if (this._surroundSnapshot) this.setSurround(this.surround(), 'commit');
    }

    /** Every change still gathering (a ground type, a water look, the steep ground, the land past the border) is a step first. */
    _settleGathered() {
        if (this._groundSnapshot) this.editGroundType({}, 'commit');
        if (this._lookSnapshot) this.editLook({}, 'commit');
        this._settleMapSettings();
    }

    /** Everything a biome touches is drawn again. */
    _announceAll() {
        this.syncHistoryButtons();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id } }));
    }

    /**
     * A foliage palette: every kind's colors in hand, and (unless `step` is false, when a biome
     * gathers the step) the layers and bushes already on the map recolored as one undo step.
     */
    applyFoliagePalette(key, step = true) {
        const palette = TerrainManager.FOLIAGE_PALETTES[key], map = this.currentMap(), foliage = this.foliage();
        if (!palette) return false;
        // A palette that glows lights every kind's tips; any other leaves each kind its own glow.
        const dress = (kind, target) => {
            target.colour = palette[kind][0]; target.tip = palette[kind][1];
            if (kind === 'flowers') target.colours = palette.petals.slice();
            if (kind === 'bulbs') target.colours = palette.bulbPetals.slice();
            if (palette.glow) target.glow = palette.glow; else delete target.glow;
            return target;
        };
        for (const kind of TerrainManager.FOLIAGE_MODES) if (palette[kind] && kind !== 'bush') this.foliageLook[kind] = dress(kind, Object.assign({}, this.foliageLook[kind] || {}));
        this.bushColour = palette.bush[0];
        this.bushBloom = palette.bush[1] || '';
        this.foliagePalette = key;
        if (!map || !foliage || !foliage.hasFoliage(map)) return true;
        const saved = foliage.snapshot(map), data = foliage.snapshot(map);
        // Layers of one kind the palette has made alike are one layer again when next painted; here they only change color.
        for (const layer of data.layers || []) if (palette[layer.kind]) dress(layer.kind, layer);
        for (const bush of data.bushes || []) { bush.colour = palette.bush[0]; if (palette.bush[1]) bush.bloom = palette.bush[1]; else delete bush.bloom; }
        foliage.restore(map, data);
        if (step) {
            this.undoStack.push({ foliage: saved, foliageSet: true }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
            this.announceFoliage(null);
        }
        return true;
    }

    paintAt(point) {
        if (this._groundStroke) return point ? this.groundDab(point, false) : false;
        if (this._foliageStroke) return point ? this.foliageDab(point, false) : false;
        if (!this._stroke || !point) return false;
        const last = this._stroke.last;
        const spacing = Math.max(0.35, this.radius * 0.25);
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < spacing) return false;
        return this.dab(point);
    }

    dab(point) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !point || !this._stroke) return false;
        const changed = elevation.paintTerrain(map, point.x + 0.5, point.y + 0.5, {
            mode: this.mode, radius: this.radius, strength: this.strength, reference: this._stroke.reference,
            base: this._stroke.base, dunes: this.dunes
        });
        this._stroke.last = { x: point.x, y: point.y };
        if (changed) {
            this._stroke.moved = true;
            const seen = this._stroke.region;
            this._stroke.region = seen ? { x0: Math.min(seen.x0, changed.x0), x1: Math.max(seen.x1, changed.x1), z0: Math.min(seen.z0, changed.z0), z1: Math.max(seen.z1, changed.z1) } : changed;
            this.announce(changed);
        }
        return changed;
    }

    endStroke() {
        if (this._groundStroke) { this.endGround(); return; }
        if (this._foliageStroke) { this.endFoliage(); return; }
        if (this._stroke && !this._stroke.moved) this.undoStack.pop();
        else if (this._stroke) {
            // A sheet the stroke reached is laid again even when its outline held: its depth is the ground's.
            if (!this.refitWater() && this._reachesWater(this._stroke.region)) this.announce(null, true);
            this._relayPieces(this._stroke.region);
            this._seal(this.undoStack[this.undoStack.length - 1]);
        }
        this._stroke = null;
        this.refreshStatus();
        this.syncHistoryButtons();
    }

    // Ctrl+Z / Ctrl+Y and the toolbar's Undo and Redo reach these through the editor's one undo shortcut (UIManager) while the tool is up.
    // A stroke still being drawn closes first: it is the step undone.
    undo() { if (this._groundSnapshot) this.editGroundType({}, 'commit'); this._settleMapSettings(); if (this._stroke || this._foliageStroke || this._groundStroke) this.endStroke(); this._swap(this.undoStack, this.redoStack); }
    redo() { if (this._groundSnapshot) this.editGroundType({}, 'commit'); this._settleMapSettings(); if (this._stroke || this._foliageStroke || this._groundStroke) this.endStroke(); this._swap(this.redoStack, this.undoStack); }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    syncHistoryButtons() {
        const ui = window.reactor?.uiManager;
        if (this.active && ui?.updateUndoRedoButtons) ui.updateUndoRedoButtons(this.canUndo(), this.canRedo());
    }
    /** The ground and the water on it, as one undo step: a stroke can move both. */
    groundSnapshot(map) {
        const elevation = this.elevation();
        return { ground: true, terrain: elevation.terrainSnapshot(map), water: elevation.waterSnapshot(map) };
    }

    /**
     * A ground step is done: it keeps only the corners it moved, before and
     * after, so undo and redo move those and leave the rest (a building's pad
     * levelled since) alone, and a small stroke on a big map stays small.
     */
    _seal(entry) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!entry || !entry.ground || !map || !elevation) return;
        const before = entry.terrain, after = elevation.terrainSnapshot(map);
        const size = (map.width + 1) * (map.height + 1);
        entry.waterAfter = elevation.waterSnapshot(map);
        if ((before && before.length !== size) || (after && after.length !== size)) { entry.after = after; return; }
        const index = [], was = [], now = [];
        for (let i = 0; i < size; i++) {
            const a = before ? Number(before[i]) || 0 : 0, b = after ? Number(after[i]) || 0 : 0;
            if (a !== b) { index.push(i); was.push(a); now.push(b); }
        }
        entry.changes = { size, index, was, now };
        delete entry.terrain;
    }

    /** The tiles a sealed step's corners touch (`x0..x1`, `z0..z1`), or null for the whole map. */
    _changesRegion(map, changes) {
        if (!changes || !changes.index.length) return null;
        const stride = map.width + 1;
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const i of changes.index) { const x = i % stride, z = Math.floor(i / stride); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        return { x0: Math.max(0, x0 - 1), x1: Math.min(map.width, x1 + 1), z0: Math.max(0, z0 - 1), z1: Math.min(map.height, z1 + 1) };
    }

    /** Put one sealed step's corners to one side of it. */
    _applyChanges(map, changes, undoing) {
        const elevation = this.elevation();
        if (changes.size !== (map.width + 1) * (map.height + 1)) return;
        const grid = elevation.ensureTerrain(map);
        if (!grid) return;
        const values = undoing ? changes.was : changes.now;
        for (let k = 0; k < changes.index.length; k++) grid[changes.index[k]] = values[k];
        if (!elevation.hasTerrain(map)) elevation.clearTerrain(map);
    }

    /**
     * Pieces came or went: they hold water back, so the hollows read again
     * and the ponds refit to them. `region` is the cells the edit touched
     * ({x0, y0, x1, y1}); ponds whose box it misses are left as they are.
     */
    piecesChanged(region = null) {
        this._basins = null; this._preview = null;
        const map = this.currentMap(), elevation = this.elevation();
        if (region && map && elevation?.water && !elevation.water(map).some(sheet => region.x0 <= sheet.x1 && region.x1 >= sheet.x0 && region.y0 <= sheet.y1 && region.y1 >= sheet.y0)) return false;
        return this.refitWater();
    }

    /** Ponds follow the ground after it changes shape; the view redraws them when one did. */
    refitWater() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation?.refitWater?.(map)) return false;
        this.announce(null, true);
        return true;
    }

    /**
     * Pieces and rocks stand on the ground: after it moved under them they
     * are laid again, the cells of the region a stroke moved (`x0..x1`,
     * `z0..z1` in tiles) or, with none, the whole map.
     */
    _relayPieces(region) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation?.hasPieces?.(map) || typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        const cells = region ? { x0: region.x0 - 1, y0: region.z0 - 1, x1: region.x1, y1: region.z1 } : null;
        if (cells && !elevation.pieces(map).some(piece => piece.x >= cells.x0 && piece.x <= cells.x1 && piece.y >= cells.y0 && piece.y <= cells.y1)) return;
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: map.id, pieces: true, region: cells } }));
    }

    /** Whether a region a stroke moved (`x0..x1`, `z0..z1` in tiles) reaches a sheet or the shore it laps. */
    _reachesWater(region) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!region || !map || !elevation?.water) return false;
        return elevation.water(map).some(sheet => region.x0 <= sheet.x1 + 2 && region.x1 >= sheet.x0 - 1 && region.z0 <= sheet.y1 + 2 && region.z1 >= sheet.y0 - 1);
    }

    _swap(from, to) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !from.length) return;
        const entry = from.pop();
        if (entry && entry.biome) {
            const ground = this.ground(), foliage = this.foliage();
            const twin = { biome: true, ground: ground.snapshot(map), foliage: foliage ? foliage.snapshot(map) : null, room: map.reactor3d && map.reactor3d.room ? JSON.parse(JSON.stringify(map.reactor3d.room)) : null, water: elevation.waterSnapshot(map) };
            if (entry.label) twin.label = entry.label;
            to.push(twin);
            ground.restore(map, entry.ground);
            if (foliage) foliage.restore(map, entry.foliage);
            if (map.reactor3d) { if (entry.room) map.reactor3d.room = JSON.parse(JSON.stringify(entry.room)); else delete map.reactor3d.room; }
            elevation.restoreWater(map, entry.water);
            this.groundTypeInHand();
            this._announceAll();
            window.reactor?.buildHotbar?.render?.();
            return;
        }
        if (entry && entry.surroundSet) {
            const now = this.surround();
            to.push({ surroundSet: true, surround: now ? JSON.parse(JSON.stringify(now)) : null });
            this._writeSurround(map, entry.surround);
            this.announceSurround();
            window.reactor?.buildHotbar?.render?.();
            return;
        }
        if (entry && entry.cliffSet) {
            to.push({ cliffSet: true, cliff: this.cliff() });
            this._writeCliff(map, entry.cliff);
            this.announceCliff();
            window.reactor?.buildHotbar?.render?.();
            return;
        }
        if (entry && entry.groundSet) {
            const ground = this.ground();
            const before = ground.types(map);
            to.push({ groundPaint: ground.snapshot(map), groundSet: true });
            ground.restore(map, entry.groundPaint);
            const after = ground.types(map);
            this.groundTypeInHand();
            // The types themselves changed (one added, taken away, another material): the view builds again.
            const structure = before.length !== after.length || before.some((type, i) => type.material !== after[i].material);
            this.announceGround(null, structure);
            this.announceFoliage(null);
            this._relayGroundCaps();
            window.reactor?.buildHotbar?.render?.();
            return;
        }
        if (entry && entry.foliageSet) {
            const foliage = this.foliage();
            to.push({ foliage: foliage.snapshot(map), foliageSet: true });
            foliage.restore(map, entry.foliage);
            this.announceFoliage(null);
            return;
        }
        if (entry && entry.ground && (entry.changes || entry.after !== undefined)) {
            const undoing = from === this.undoStack;
            if (entry.changes) this._applyChanges(map, entry.changes, undoing);
            else elevation.restoreTerrainChanges(map, undoing ? entry.after : entry.terrain, undoing ? entry.terrain : entry.after);
            elevation.restoreWater(map, undoing ? entry.water : entry.waterAfter);
            // Ground another tool levelled since (a stamped building's pad) keeps its ponds fitted.
            elevation.refitWater?.(map);
            to.push(entry);
            this.announce(); this.announce(null, true); this._relayPieces(this._changesRegion(map, entry.changes)); this.refreshStatus(); this._followHistory();
            return;
        }
        if (entry && entry.ground) {
            to.push(this.groundSnapshot(map));
            elevation.restoreTerrain(map, entry.terrain);
            elevation.restoreWater(map, entry.water);
            this.announce(); this.announce(null, true); this._relayPieces(null); this.refreshStatus(); this._followHistory();
            return;
        }
        if (entry && !Array.isArray(entry) && entry.water) {
            to.push({ water: elevation.waterSnapshot(map) });
            elevation.restoreWater(map, entry.water);
            this.announce(null, true); this.refreshStatus(); this._followHistory();
            return;
        }
        to.push(elevation.terrainSnapshot(map));
        elevation.restoreTerrain(map, entry);
        this.announce(); this.refreshStatus();
    }

    /**
     * After an undo or redo: the sheet picked for Look is let go when the
     * step took it away, and otherwise the panel shows its look as it now
     * is (a slider would else write the undone look straight back).
     */
    _followHistory() {
        if (!this.selectedWater) return;
        const region = this.selectedRegion();
        if (!region) { this.selectWater(null); return; }
        this.waterLook = this.lookOf(region);
        this._lookSnapshot = null;
        window.reactor?.buildHotbar?.render?.();
    }

    clear() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !elevation.hasTerrain(map)) return;
        const saved = this.groundSnapshot(map);
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        elevation.clearTerrain(map);
        this.announce();
        if (!this.refitWater() && elevation.hasWater(map)) this.announce(null, true);
        this._seal(saved);
        this._relayPieces(saved.changes ? this._changesRegion(map, saved.changes) : null);
        this.refreshStatus();
    }

    /**
     * The ground changed shape. The announcement says so, and where: the
     * 3D view then bends the vertices it already has through the new grid
     * instead of building the scene again, so a stroke neither pauses nor
     * resets the sky's drift. `region` is the corner range a dab touched,
     * or nothing for the whole map (undo, redo, flatten).
     */
    announce(region = null, waterToo = false) {
        this._basins = null; this._preview = null;
        this.syncHistoryButtons();
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        if (waterToo) {
            document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, water: true } }));
            return;
        }
        document.dispatchEvent(new CustomEvent('rr-map-edited', {
            detail: { mapId: this.currentMap()?.id, terrain: true, region: region && typeof region === 'object' ? region : null }
        }));
    }
}

if (typeof window !== 'undefined') window.TerrainManager = TerrainManager;
