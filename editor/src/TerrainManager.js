/**
 * TerrainManager - the Terrain tab: brushes that shape a 3D map's ground.
 *
 * Painting happens in the 3D view (MapEditor3D asks `active` and calls
 * `beginStroke` / `paintAt` / `endStroke`); this owns the brush settings,
 * the panel, and an undo stack of whole height fields per stroke.
 */
class TerrainManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.active = false;
        this.mode = 'raise';
        this.radius = 3;
        this.strength = 0.5;
        this.waterMaterial = 'Water';
        this._preview = null;
        this._onKeyDown = event => this.handleKey(event);
        this.panel = null;
        this.undoStack = [];
        this.redoStack = [];
        this._stroke = null;
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
        }
        this.refreshStatus();
    }

    setMode(mode) {
        if (!this.elevation()?.TERRAIN_MODES.includes(mode) && mode !== 'drain' && mode !== 'fill') return;
        this.mode = mode;
        window.reactor?.mapEditor3D?.hideWaterGhost?.();
        this.panel?.querySelectorAll('.rr-terrain-mode').forEach(button => button.setAttribute('aria-checked', String(button.dataset.terrainMode === mode)));
    }

    /** A word in the status for a moment (the stroke's end would otherwise write the plain status straight over it). */
    _flash(key) {
        const status = this.panel?.querySelector('.rr-terrain-status');
        if (!status) return;
        status.textContent = this._t(key);
        this._flashUntil = Date.now() + 2500;
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => { this._flashUntil = 0; this.refreshStatus(); }, 2600);
    }

    refreshStatus() {
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
        document.addEventListener('keydown', this._onKeyDown);
        // Terrain is shaped in the 3D view: bring it up for a 3D map.
        const map = this.currentMap();
        if (map && this.elevation()?.hasNote(map)) {
            const toggle = document.getElementById('map-3d-view');
            if (toggle && !toggle.checked) toggle.click();
        }
        this.refreshStatus();
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this._stroke = null;
        document.removeEventListener('keydown', this._onKeyDown);
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
        if (this.mode === 'drain') {
            const cell = { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
            return this.drain(saved => elevation.removeWaterAt(map, cell.x, cell.y));
        }
        this.undoStack.push(elevation.terrainSnapshot(map));
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        // Flatten levels to the ground under the first touch.
        this._stroke = { reference: elevation.terrainHeightAt(map, point.x + 0.5, point.y + 0.5), moved: false, last: null };
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
        this.undoStack.push({ water: saved }); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announce(null, true); this.refreshStatus();
        return true;
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

    /** The pointer over the ground in Pour: a ghost of the hollow the click would fill. Elsewhere, no ghost. */
    hoverAt(point) {
        const view = window.reactor?.mapEditor3D;
        if (this.mode !== 'fill' || !point) { if (this._preview) { view?.hideWaterGhost?.(); this._preview = null; } return; }
        const cell = { x: Math.floor(point.x + 0.5), y: Math.floor(point.y + 0.5) };
        if (this._preview && this._preview.x === cell.x && this._preview.y === cell.y) return;
        this._preview = cell;
        const basin = this.basinAt(cell.x, cell.y);
        if (basin) view?.showWaterGhost?.(basin); else view?.hideWaterGhost?.();
    }

    paintAt(point) {
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
            mode: this.mode, radius: this.radius, strength: this.strength, reference: this._stroke.reference
        });
        this._stroke.last = { x: point.x, y: point.y };
        if (changed) { this._stroke.moved = true; this.announce(changed); }
        return changed;
    }

    /** Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) while the tab is up, unless a field has focus. */
    handleKey(event) {
        if (!this.active || !(event.ctrlKey || event.metaKey)) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && target.type !== 'range') return;
        const key = String(event.key || '').toLowerCase();
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); this.redo(); }
    }

    endStroke() {
        if (this._stroke && !this._stroke.moved) this.undoStack.pop();
        this._stroke = null;
        this.refreshStatus();
    }

    undo() { this._swap(this.undoStack, this.redoStack); }
    redo() { this._swap(this.redoStack, this.undoStack); }
    _swap(from, to) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !from.length) return;
        const entry = from.pop();
        if (entry && !Array.isArray(entry) && entry.water) {
            to.push({ water: elevation.waterSnapshot(map) });
            elevation.restoreWater(map, entry.water);
            this.announce(null, true); this.refreshStatus();
            return;
        }
        to.push(elevation.terrainSnapshot(map));
        elevation.restoreTerrain(map, entry);
        this.announce(); this.refreshStatus();
    }

    clear() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !elevation.hasTerrain(map)) return;
        this.undoStack.push(elevation.terrainSnapshot(map)); this.redoStack.length = 0;
        elevation.clearTerrain(map);
        this.announce(); this.refreshStatus();
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
