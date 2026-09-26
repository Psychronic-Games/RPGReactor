/**
 * StructureWorkshop - building a Structure with the map's own builder.
 *
 * Database › Structures › Build opens the structure's plot, an empty 3D map
 * of the plot's size, in the main 3D view with the Build bar up: the same
 * hotbar, hammer, selection, lights and screens as on any map. A banner over
 * the view names what is being built and saves it. Saving writes what stands
 * on the plot into the structure's file (`pieces`, `lights`, `surfaces`), so
 * the Blueprint slot and "Use on the map" stamp it anywhere, as often as
 * wanted. Closing brings back the map that was open.
 *
 * The plot is no map file: TilemapManager.saveMap hands it here, so Ctrl+S,
 * Apply and the "save changes?" questions all save the structure.
 */
class StructureWorkshop {
    constructor(projectController) {
        this.projectController = projectController;
        this.session = null;
        this.banner = null;
    }

    _t(text, params) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) value = value.split(`{${key}}`).join(String(replacement));
        return value;
    }

    reactor() { return window.reactor || null; }
    tilemap() { return this.projectController?.getTilemapManager?.() || null; }
    database() { return this.projectController?.databaseManager || this.reactor()?.databaseManager || null; }
    elevation() { return typeof RRMapElevation !== 'undefined' ? RRMapElevation : null; }
    plans() { return typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null; }
    isOpen() { return !!(this.session && this.tilemap()?.currentMap?.rrWorkshop); }

    /** The structure record by id, from the database as it is now. */
    record(id) { return (this.database()?.data?.structures || []).find(entry => entry && entry.id === id) || null; }

    /** A named plan's object, for plans made of other plans. */
    resolve(name) {
        const entry = (this.database()?.data?.structures || []).find(e => e && (e.file === name || e.name === name || e.file === name + '.json'));
        return entry ? entry.plan : null;
    }

    /**
     * The plot as a map: the structure's size, marked 3D, holding what the
     * structure has. A structure described by rooms (the older format) is
     * built out into pieces here; saving keeps the pieces.
     */
    plotMap(entry) {
        const E = this.elevation(), SP = this.plans();
        const plan = entry.plan;
        const [W, D] = plan.size;
        const previous = this.tilemap()?.currentMap;
        const tilesets = this.database()?.getTilesets?.() || [];
        const mapData = {
            id: 0, width: W, height: D, tilesetId: previous?.tilesetId || tilesets[0]?.id || 1,
            data: new Array(W * D * 6).fill(0), events: [null], note: E ? E.NOTE_TAG || '<3d>' : '<3d>',
            displayName: entry.name, autoplayBgm: false, autoplayBgs: false, bgm: { name: '', pan: 0, pitch: 100, volume: 90 }, bgs: { name: '', pan: 0, pitch: 100, volume: 90 },
            battleback1Name: '', battleback2Name: '', disableDashing: false, encounterList: [], encounterStep: 30,
            parallaxName: '', parallaxLoopX: false, parallaxLoopY: false, parallaxShow: true, parallaxSx: 0, parallaxSy: 0,
            scrollType: 0, specifyBattleback: false,
            rrWorkshop: { structureId: entry.id, file: entry.file, name: entry.name, maxLevel: Math.max(1, plan.height * (Number(plan.storey) || 5)) - 1 }
        };
        if (E) {
            E.addNote?.(mapData);
            E.ensure(mapData);
            if (mapData.reactor3d && E.MODE_3D) mapData.reactor3d.mode = E.MODE_3D;
            let pieces = [];
            if (plan.pieces && plan.pieces.length) pieces = plan.pieces.map((piece, i) => Object.assign({}, piece, { id: i + 1 }));
            else if (SP) {
                try { pieces = SP.build(plan, 0, 0, 1, 0, name => this.resolve(name)); } catch (error) { console.warn('Could not build the structure into pieces:', error); }
            }
            E.restorePieces(mapData, pieces);
            const sidecar = mapData.reactor3d || (mapData.reactor3d = { version: 1 });
            // Lights and screens: as saved, or the older effects placed the way a stamp places them.
            if ((plan.lights && plan.lights.length) || (plan.surfaces && plan.surfaces.length)) {
                if (plan.lights?.length) sidecar.lights = plan.lights.map((row, i) => Object.assign({}, row, { id: row.id || 'light' + (i + 1) }));
                if (plan.surfaces?.length) sidecar.mediaSurfaces = plan.surfaces.map((row, i) => Object.assign({}, row, { id: i + 1 }));
            } else if (SP && (plan.effects || []).length) {
                try { SP.addEffects(mapData, SP.effectsOf(plan, 0, 0, name => this.resolve(name)).filter(fx => fx.type !== 'animation'), 0); } catch (error) { console.warn('Could not place the structure\'s effects:', error); }
            }
        }
        return mapData;
    }

    /** From the Structures page: save the database, close it, and open the plot. */
    async open(entry) {
        if (!entry) return false;
        const reactor = this.reactor(), tilemap = this.tilemap();
        if (!reactor || !tilemap) return false;
        const structureId = entry.id;
        // The page's changes go in first (the name, the plot size), the way "Use on the map" does.
        document.getElementById('database-ok-btn')?.click();
        const started = Date.now();
        while (Date.now() - started < 5000) {
            const viewer = document.getElementById('database-viewer');
            if (!viewer || viewer.style.display === 'none' || viewer.offsetParent === null) break;
            await new Promise(resolve => setTimeout(resolve, 80));
        }
        return this.enter(structureId);
    }

    /**
     * Put a structure's plot in the view. From a map, the map is remembered to
     * come back to; from another structure's plot, that one's unsaved work is
     * asked about first and the map to come back to stays the same.
     */
    async enter(structureId) {
        const reactor = this.reactor(), tilemap = this.tilemap();
        const record = this.record(structureId);
        if (!record || !reactor || !tilemap) return false;
        if (tilemap.currentMap && !await this.projectController.confirmUnsavedChanges?.('map')) return false;
        const returnTo = tilemap.currentMap && !tilemap.currentMap.rrWorkshop ? tilemap.currentMap.id : (this.session?.returnTo ?? null);
        const was3D = this.session ? this.session.was3D : !!reactor.mapEditor3D?.enabled;
        const barWasUp = this.session ? this.session.barWasUp : !!reactor.buildHotbar?.visible;
        const mapData = this.plotMap(record);
        this.session = { structureId, returnTo, was3D, barWasUp };
        tilemap.onWorkshopSave = () => this.save();
        if (!await this.projectController.openWorkshopMap(mapData)) { this.end(); return false; }
        if (!reactor.mapEditor3D?.enabled) await reactor.applyMap3DViewPreference?.(true);
        reactor.pieceBuilderManager && (reactor.pieceBuilderManager.undoStack = [], reactor.pieceBuilderManager.redoStack = []);
        reactor.buildHotbar?.show();
        reactor.pieceBuilderManager?.syncHistoryButtons?.();
        this.showBanner();
        this.showStructureList();
        return true;
    }

    /** What stands on the plot, written into the structure and its file. */
    save() {
        const tilemap = this.tilemap(), map = tilemap?.currentMap, E = this.elevation();
        if (!this.session || !map?.rrWorkshop || !E) return false;
        const entry = this.record(this.session.structureId);
        if (!entry) return false;
        const plan = entry.plan;
        plan.pieces = E.pieces(map).map(piece => { const out = Object.assign({}, piece); delete out.id; delete out.group; return out; });
        const sidecar = map.reactor3d || {};
        plan.lights = (sidecar.lights || []).filter(Boolean).map(row => { const out = Object.assign({}, row); delete out.tag; return out; });
        plan.surfaces = (sidecar.mediaSurfaces || []).filter(Boolean).map(row => { const out = Object.assign({}, row); delete out.structure; return out; });
        // What the pieces replace: a built structure is its pieces, not rooms described in words.
        plan.floors = []; plan.stairs = []; plan.shapes = []; plan.parts = []; plan.paths = []; plan.effects = [];
        if (plan.roof) plan.roof.pitch = null;
        if (!this.writeFile(entry)) return false;
        this.reactor()?.pieceBuilderManager?.structures?.(true);
        this.flash(this._t('Saved'));
        return true;
    }

    writeFile(entry) {
        const db = this.database(), project = this.projectController?.getCurrentProject?.();
        if (typeof require !== 'function' || !db || !project?.path) return false;
        try {
            const fs = require('fs'), path = require('path');
            const directory = db.structuresPath ? db.structuresPath(project.path) : path.join(project.path, '3d', 'Structures');
            fs.mkdirSync(directory, { recursive: true });
            const trimmed = typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor.trimPlan(entry.plan) : entry.plan;
            const target = path.join(directory, entry.file), temp = target + '.tmp';
            fs.writeFileSync(temp, JSON.stringify(trimmed, null, 2) + '\n', 'utf8');
            fs.renameSync(temp, target);
            db.captureSavedState?.('structures');
            return true;
        } catch (error) {
            console.error('Could not save the structure:', error);
            alert(this._t('The structure could not be saved.'));
            return false;
        }
    }

    /** Leave the plot: ask about unsaved work, bring the previous map back, and the Database if asked. */
    async close({ toDatabase = false, save = false } = {}) {
        if (!this.session) return;
        const tilemap = this.tilemap(), reactor = this.reactor();
        if (save && !this.save()) return;
        if (!save && tilemap?.isMapDirty?.() && !window.confirm(this._t('Leave the workshop without saving?'))) return;
        const session = this.session;
        if (tilemap?.currentMap?.rrWorkshop) tilemap.captureSavedMapState();
        if (!session.barWasUp) reactor?.buildHotbar?.hide();
        this.end();
        if (session.returnTo != null) await this.projectController.loadMap(session.returnTo, { skipDirtyCheck: true, forceReload: true });
        if (!session.was3D && reactor?.mapEditor3D?.enabled) await reactor.applyMap3DViewPreference?.(false);
        if (toDatabase) {
            reactor?.openDatabase?.('structures');
            setTimeout(() => document.querySelector(`.database-list-item[data-entry-id="${session.structureId}"]`)?.click(), 300);
        }
    }

    /** The plot is gone (another map opened, or closed): forget the session, and give the maps back. */
    end() {
        this.session = null;
        const tilemap = this.tilemap();
        if (tilemap) tilemap.onWorkshopSave = null;
        this.hideBanner();
        this.hideStructureList();
    }

    // ---- The sidebar: structures instead of maps --------------------------

    /**
     * While a structure is being built the sidebar's Maps list becomes the
     * project's structures: the one in the view is marked, a click moves to
     * another (asking about unsaved work), and the maps come back when the
     * workshop closes. A map can only be opened by leaving the workshop.
     */
    showStructureList() {
        const section = document.getElementById('maps-section');
        if (!section || !this.session) return;
        // The tile palette and the map's events have nothing to do on a plot, and a click on a tile would hand the map to tile painting.
        document.body.classList.add('rr-workshop-open');
        if (!this.listPanel) {
            this._hiddenMapParts = [...section.children].map(child => [child, child.style.display]);
            for (const [child] of this._hiddenMapParts) child.style.display = 'none';
            this.listPanel = document.createElement('div');
            this.listPanel.className = 'rr-workshop-list';
            section.appendChild(this.listPanel);
        }
        const tt = text => this._t(text);
        const records = (this.database()?.data?.structures || []).filter(entry => entry && entry.name);
        this.listPanel.innerHTML = `
            <div class="sidebar-header">${rrEscapeHtml(tt('Structures'))}</div>
            <div class="sidebar-content rr-accent-scrollbar rr-workshop-items" role="listbox" aria-label="${rrEscapeHtml(tt('Structures'))}">
                ${records.map(entry => `<div class="tree-item${entry.id === this.session.structureId ? ' selected' : ''}" role="option" aria-selected="${entry.id === this.session.structureId}" tabindex="-1" data-structure-id="${entry.id}">${rrEscapeHtml(entry.name)}</div>`).join('')}
            </div>
            <button type="button" class="rr-btn-secondary rr-workshop-leave">${rrEscapeHtml(tt('Close the workshop and show the maps'))}</button>`;
        this.listPanel.onclick = event => {
            const item = event.target.closest('[data-structure-id]');
            if (item) { const id = Number(item.dataset.structureId); if (this.session && id !== this.session.structureId) this.enter(id); return; }
            if (event.target.closest('.rr-workshop-leave')) this.close();
        };
    }

    hideStructureList() {
        document.body.classList.remove('rr-workshop-open');
        if (!this.listPanel) return;
        this.listPanel.remove();
        this.listPanel = null;
        for (const [child, display] of this._hiddenMapParts || []) child.style.display = display;
        this._hiddenMapParts = null;
    }

    /** Called after any map load: a real map means the workshop is over. */
    mapChanged() {
        if (this.session && !this.tilemap()?.currentMap?.rrWorkshop) this.end();
    }

    // ---- The banner -------------------------------------------------------

    showBanner() {
        const container = document.getElementById('canvas-container');
        if (!container || !this.session) return;
        if (!this.banner) {
            this.banner = document.createElement('div');
            this.banner.className = 'rr-workshop-banner';
            container.appendChild(this.banner);
        }
        const entry = this.record(this.session.structureId);
        const plan = entry?.plan;
        const tt = text => this._t(text);
        const size = plan ? this._t('{w} × {d} plot, {h} floors', { w: plan.size[0], d: plan.size[1], h: plan.height }) : '';
        this.banner.innerHTML = `
            <span class="rr-workshop-title">${rrEscapeHtml(tt('Building'))} <strong>${rrEscapeHtml(entry?.name || '')}</strong></span>
            <span class="rr-workshop-size">${rrEscapeHtml(size)}</span>
            <span class="rr-workshop-status" aria-live="polite"></span>
            <button type="button" class="rr-button-primary" data-workshop="save">${rrEscapeHtml(tt('Save'))}</button>
            <button type="button" class="rr-btn-secondary" data-workshop="back">${rrEscapeHtml(tt('Save and Back to Database'))}</button>
            <button type="button" class="rr-btn-secondary" data-workshop="close">${rrEscapeHtml(tt('Close'))}</button>`;
        this.banner.onclick = event => {
            const action = event.target.closest('[data-workshop]')?.dataset.workshop;
            if (action === 'save') { if (this.save()) this.tilemap()?.captureSavedMapState(); }
            else if (action === 'back') this.close({ toDatabase: true, save: true });
            else if (action === 'close') this.close();
        };
        this.banner.style.display = 'flex';
    }

    hideBanner() { if (this.banner) this.banner.style.display = 'none'; }

    flash(text) {
        const status = this.banner?.querySelector('.rr-workshop-status');
        if (!status) return;
        status.textContent = text;
        clearTimeout(this._flash);
        this._flash = setTimeout(() => { status.textContent = ''; }, 2000);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = StructureWorkshop;
