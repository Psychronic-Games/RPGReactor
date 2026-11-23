/**
 * Structure2DWorkshop - building a 2D structure on a phantom map (docs/DESIGN-2D-STRUCTURES.md).
 *
 * Database › Structures › Build, on a 2D structure, opens its plot: a 2D map of the structure's size, never a map
 * file, in the main view. The Layers panel beside it holds the structure's layers: the one being painted is the plot's
 * own tiles (its tileset in the palette); the others show as pictures under and over it. Passability is marked right
 * there, cell by cell: X blocked, O open, * open with the cell's art over the characters. Saving writes the structure,
 * draws its two pictures (below and over the characters) and brings every map it stands on up to date.
 *
 * The drawing (bake), the picture files and the maps' update are static: the Database page uses them too.
 */
class Structure2DWorkshop {
    static TILE = 48;
    static TEMP = '_workshop';

    constructor(projectController) {
        this.projectController = projectController;
        this.session = null;
        this.banner = null;
        this.panel = null;
    }

    _t(text, params) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) value = value.split(`{${key}}`).join(String(replacement));
        return value;
    }

    reactor() { return window.reactor || null; }
    tilemap() { return this.projectController?.getTilemapManager?.() || null; }
    database() { return this.projectController?.databaseManager || this.reactor()?.databaseManager || null; }
    projectPath() { return this.projectController?.getCurrentProject?.()?.path || null; }
    isOpen() { return !!(this.session && this.tilemap()?.currentMap?.rrWorkshop?.dimension === '2d'); }
    record(id) { return (this.database()?.data?.structures || []).find(entry => entry && entry.id === id) || null; }
    plan() { return this.session ? this.record(this.session.structureId)?.plan || null : null; }

    // ---- Pictures: the layers drawn -----------------------------------------------------------------

    static loadImage(url) {
        return new Promise(resolve => {
            if (!url) { resolve(null); return; }
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = url;
        });
    }

    static pictureUrl(projectPath, name) {
        if (!projectPath || !name) return '';
        if (typeof RRAssetFiles !== 'undefined' && RRAssetFiles.imageUrlFor) {
            const url = RRAssetFiles.imageUrlFor(require('path').join(projectPath, 'img', 'pictures'), name);
            if (url) return url;
        }
        return require('url').pathToFileURL(require('path').join(projectPath, 'img', 'pictures', name + '.png')).href;
    }

    /**
     * Draw `layers` of a plan onto canvases the plot's size. With `split`, a cell marked * and a ☆ tile go to `over`
     * and everything else to `below` (as a placement shows them); without, all of it goes to `below` (the workshop's
     * view of the layers it is not painting). Answers { below, over, drewBelow, drewOver }.
     */
    static async drawLayers(plan, layers, { tilemap, db, projectPath, split = true }) {
        const T = Structure2DWorkshop.TILE, [W, H] = plan.size;
        const canvas = () => { const c = document.createElement('canvas'); c.width = W * T; c.height = H * T; return c; };
        const below = canvas(), over = canvas();
        const lower = below.getContext('2d'), upper = over.getContext('2d');
        let drewBelow = false, drewOver = false;
        const starred = (x, y) => split && plan.passage[`${x},${y}`] === '*';
        for (const layer of layers) {
            if (layer.kind === 'tiles') {
                const tileset = db?.getTileset?.(layer.tilesetId) || db?.getTilesets?.()?.[0];
                if (!tileset || !tilemap?.loadTilesetImagesForPreview) continue;
                const images = await tilemap.loadTilesetImagesForPreview(tileset);
                const flags = tileset.flags || [];
                const tileAt = (z, x, y) => layer.tiles[z * W * H + y * W + x];
                const higher = tileId => !!(flags[tileId] & 0x10);
                const pass = (z, wantHigher) => {
                    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                        const tileId = tileAt(z, x, y);
                        if (!tileId || higher(tileId) !== wantHigher) continue;
                        const up = split && (wantHigher || starred(x, y));
                        tilemap.drawTileToCanvas(up ? upper : lower, tileId, x, y, images, T);
                        if (up) drewOver = true; else drewBelow = true;
                    }
                };
                pass(0, false);
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const bits = tileAt(4, x, y);
                    if (!bits || !tilemap.drawShadowToCanvas) continue;
                    const up = starred(x, y);
                    tilemap.drawShadowToCanvas(up ? upper : lower, bits, x, y, T);
                    if (up) drewOver = true; else drewBelow = true;
                }
                for (let z = 1; z < 4; z++) pass(z, false);
                for (let z = 0; z < 4; z++) pass(z, true);
            } else if (layer.kind === 'picture' && layer.picture) {
                const image = await Structure2DWorkshop.loadImage(Structure2DWorkshop.pictureUrl(projectPath, layer.picture));
                if (!image) continue;
                const draw = (ctx, keep) => {
                    ctx.save();
                    ctx.beginPath();
                    let any = false;
                    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (keep(x, y)) { ctx.rect(x * T, y * T, T, T); any = true; }
                    if (any) { ctx.clip(); ctx.globalAlpha = (layer.opacity ?? 255) / 255; ctx.drawImage(image, layer.at[0], layer.at[1]); }
                    ctx.restore();
                    return any;
                };
                if (draw(lower, (x, y) => !starred(x, y))) drewBelow = true;
                if (split && draw(upper, starred)) drewOver = true;
            }
        }
        return { below, over, drewBelow, drewOver };
    }

    /** A canvas written as a PNG under img/parallaxes/<name>.png (folders made); answers the file's path. */
    static writePicture(projectPath, name, canvas) {
        const fs = require('fs'), path = require('path');
        const file = path.join(projectPath, 'img', 'parallaxes', ...name.split('/')) + '.png';
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'));
        return file;
    }

    static hashOf(canvas) {
        return require('crypto').createHash('sha1').update(canvas.toDataURL('image/png')).digest('hex').slice(0, 10);
    }

    /**
     * The structure's two pictures drawn and written (a name for what each shows, so a picture already written is
     * kept and maps placed earlier never lose theirs), and every cell's passability worked out: `plan.baked`.
     */
    static async bake(plan, file, ctx) {
        const S = RRStructure2D;
        const drawn = await Structure2DWorkshop.drawLayers(plan, plan.layers, Object.assign({}, ctx, { split: true }));
        const names = S.pictureNames(file || plan.name, drawn.drewBelow ? Structure2DWorkshop.hashOf(drawn.below) : '', drawn.drewOver ? Structure2DWorkshop.hashOf(drawn.over) : '');
        if (names.below) Structure2DWorkshop.writePicture(ctx.projectPath, names.below, drawn.below);
        if (names.over) Structure2DWorkshop.writePicture(ctx.projectPath, names.over, drawn.over);
        plan.baked = { below: names.below, over: names.over, cells: S.cells(plan, id => ctx.db?.getTileset?.(id)?.flags || null) };
        return plan.baked;
    }

    /**
     * Every map a structure stands on, brought up to date with it (RRStructure2D.apply): the map files, and the map
     * open in the editor (in memory, so its unsaved work stays its own and saves with it). Answers how many changed.
     */
    static updateMaps(projectPath, file, planOf, tilemap) {
        if (!projectPath || typeof require !== 'function') return 0;
        const fs = require('fs'), path = require('path'), S = RRStructure2D;
        const dataDir = path.join(projectPath, 'data');
        let changed = 0;
        const open = tilemap?.currentMap && !tilemap.currentMap.rrWorkshop ? tilemap.currentMap : null;
        for (const name of fs.existsSync(dataDir) ? fs.readdirSync(dataDir) : []) {
            if (!/^Map\d{3,}\.json$/.test(name)) continue;
            const mapId = Number(name.slice(3, -5));
            if (open && open.id === mapId) continue;
            const target = path.join(dataDir, name);
            let text;
            try { text = fs.readFileSync(target, 'utf8'); } catch (error) { continue; }
            if (!text.includes('rrStructures2D') || (file && !text.includes(JSON.stringify(file).slice(1, -1)))) continue;
            let map;
            try { map = JSON.parse(text); } catch (error) { continue; }
            if (!S.apply(map, planOf)) continue;
            const json = typeof RRMapJson !== 'undefined' && RRMapJson.stringify ? RRMapJson.stringify(map) : JSON.stringify(map, null, 2);
            fs.writeFileSync(target + '.tmp-rr-structure', json, 'utf8');
            fs.renameSync(target + '.tmp-rr-structure', target);
            changed++;
        }
        if (open && (open.rrStructures2D || []).some(row => !file || row.file === file) && S.apply(open, planOf)) {
            changed++;
            tilemap.refreshPassage?.();
            window.reactor?.mapImageLayersManager?.drawFlat?.();
            window.reactor?.mediaSurfacePreviewManager?.rescan?.();
        }
        return changed;
    }

    /** The plan of a structure file, for apply: the database's record as it is now. */
    static planOfFrom(db) {
        return file => {
            const entry = (db?.data?.structures || []).find(e => e && (e.file === file || e.file === file + '.json'));
            return entry && entry.plan ? entry.plan : null;
        };
    }

    // ---- The phantom map ----------------------------------------------------------------------------

    /** From the Structures page: the Database saves and closes, and the plot opens. */
    async open(entry) {
        if (!entry) return false;
        document.getElementById('database-ok-btn')?.click();
        const started = Date.now();
        let closed = false;
        while (Date.now() - started < 5000) {
            const viewer = document.getElementById('database-viewer');
            if (!viewer || viewer.style.display === 'none' || viewer.offsetParent === null) { closed = true; break; }
            await new Promise(resolve => setTimeout(resolve, 80));
        }
        if (!closed) return false;
        return this.enter(entry.id);
    }

    async enter(structureId) {
        const reactor = this.reactor(), tilemap = this.tilemap(), entry = this.record(structureId);
        if (!entry || !reactor || !tilemap || entry.plan?.dimension !== '2d') return false;
        if (tilemap.currentMap && !await this.projectController.confirmUnsavedChanges?.('map')) return false;
        const returnTo = tilemap.currentMap && !tilemap.currentMap.rrWorkshop ? tilemap.currentMap.id : (this.session?.returnTo ?? null);
        const was3D = this.session ? this.session.was3D : !!reactor.mapEditor3D?.enabled;
        const plan = entry.plan;
        const first = plan.layers.findIndex(layer => layer.kind === 'tiles');
        this.session = { structureId, returnTo, was3D, active: first >= 0 ? first : 0, tool: 'paint', dirty: false, temp: [] };
        this.clearTemp();
        if (reactor.mapEditor3D?.enabled) await reactor.applyMap3DViewPreference?.(false);
        tilemap.onWorkshopSave = () => this.save();
        if (!await this.showPlot()) { this.end(); return false; }
        this.showBanner();
        this.showSidebar();
        this.showPanel();
        this.bindPlotInput();
        return true;
    }

    /**
     * On the plot, a video answers the mouse as its row in the list does: a right-click opens its menu, a double-click
     * its full settings. Listened for on the map's container before the map (once), only while a 2D structure is
     * being built, and only over a video; every other click is the map's.
     */
    bindPlotInput() {
        const host = document.getElementById('canvas-container');
        if (!host || host.__rrS2dInput) return;
        host.__rrS2dInput = true;
        const videoAt = event => {
            if (!this.session || !this.tilemap()?.currentMap?.rrWorkshop || event.target?.tagName !== 'CANVAS') return null;
            return this.previewManager()?.hitSurface?.(event.clientX, event.clientY) || null;
        };
        host.addEventListener('pointerdown', event => {
            if (event.button !== 2) return;
            const hit = videoAt(event);
            if (!hit) return;
            event.preventDefault(); event.stopPropagation();
            this.surfaceMenu(hit.id, event.clientX, event.clientY);
        }, true);
        host.addEventListener('contextmenu', event => { if (videoAt(event)) { event.preventDefault(); event.stopPropagation(); } }, true);
        host.addEventListener('dblclick', event => {
            const hit = videoAt(event);
            if (!hit || hit.handle) return;
            event.preventDefault(); event.stopPropagation();
            this.putDownSurface(); this.restoreTool(); this.editSurface(hit.id);
        }, true);
    }

    // ---- Right-click menus ---------------------------------------------------------------------------------

    /** A layer's menu: its row in the list, right-clicked. */
    layerMenu(index, x, y) {
        const plan = this.plan(), layer = plan?.layers[index];
        if (!layer || typeof RRContextMenu === 'undefined') return;
        const t = text => this._t(text), count = plan.layers.length, top = count - 1;
        const viaPanel = act => async () => { await this.selectLayer(index); this.panel?.querySelector(`[data-act="${act}"]`)?.click(); };
        RRContextMenu.show(x, y, [
            { label: t('Rename…'), action: async () => { await this.selectLayer(index); const input = this.panel?.querySelector('[data-field="name"]'); input?.focus(); input?.select(); } },
            layer.kind === 'tiles' ? { label: t('Change Tileset…'), action: viaPanel('chooseTileset') } : { label: t('Change Picture…'), action: viaPanel('choosePicture') },
            { label: t(layer.hidden ? 'Show while painting' : 'Hide while painting'), action: () => this.layerAct('hide', index) },
            { separator: true },
            { label: t('Move Up'), enabled: index < top, action: () => this.layerAct('up', index) },
            { label: t('Move Down'), enabled: index > 0, action: () => this.layerAct('down', index) },
            { label: t('Move to Top'), enabled: index < top, action: () => this.moveLayer(index, top, true) },
            { label: t('Move to Bottom'), enabled: index > 0, action: () => this.moveLayer(index, 0, false) },
            { separator: true },
            { label: t('Duplicate'), action: () => this.duplicateLayer(index) },
            { label: t('Remove'), enabled: count > 1, action: () => this.layerAct('delete', index) }
        ]);
    }

    /** What a layer row's own buttons do, by the row's index. */
    async layerAct(act, index) {
        const button = this.sidebar?.querySelector(`.rr-s2d-layer[data-layer="${index}"] [data-act="${act}"]`);
        if (button) await this.onPartsClick({ target: button });
    }

    /** A copy of a layer just over it, named so, and chosen. */
    async duplicateLayer(index) {
        const plan = this.plan(), layer = plan?.layers[index];
        if (!layer) return;
        this.capture();
        const copy = JSON.parse(JSON.stringify(layer));
        copy.name = this._t('{name} copy', { name: layer.name }).slice(0, 48);
        plan.layers.splice(index + 1, 0, copy);
        this.session.active = index + 1;
        await this.changed();
    }

    /** A video's menu: its row in the list, or the video on the plot, right-clicked. */
    surfaceMenu(id, x, y) {
        const row = this.surfaces().find(entry => Number(entry.id) === Number(id));
        if (!row || typeof RRContextMenu === 'undefined') return;
        const t = text => this._t(text), layer = Number(row.layer ?? 3);
        const place = value => () => this.writeSurfaces(this.surfaces().map(entry => Number(entry.id) === Number(id) ? Object.assign({}, entry, { layer: value }) : entry), id);
        RRContextMenu.show(x, y, [
            { label: t('Select'), enabled: this.session.surface !== Number(id), action: () => this.selectSurface(id) },
            { label: t('Change Video…'), action: () => { this.selectSurface(id); this.panel?.querySelector('[data-act="changeVideo"]')?.click(); } },
            { separator: true },
            { label: `${layer === 3 ? '✓ ' : ''}${t('Over the structure')}`, action: place(3) },
            { label: `${layer === 10 ? '✓ ' : ''}${t('Over everything')}`, action: place(10) },
            { separator: true },
            { label: t('Center on the Plot'), action: () => this.centerSurface(id) },
            { label: t('Duplicate'), action: () => this.duplicateSurface(id) },
            { label: t('All settings…'), action: () => { this.putDownSurface(); this.restoreTool(); this.editSurface(id); } },
            { separator: true },
            { label: t('Remove'), action: () => this.writeSurfaces(this.surfaces().filter(entry => Number(entry.id) !== Number(id)), null) }
        ]);
    }

    centerSurface(id) {
        const plan = this.plan();
        if (!plan) return;
        const [W, H] = plan.size;
        this.writeSurfaces(this.surfaces().map(entry => Number(entry.id) === Number(id) ? Object.assign({}, entry, { x: Math.round((W - 1) / 2 * 2) / 2, y: Math.round((H - 1) / 2 * 2) / 2 }) : entry), id);
    }

    duplicateSurface(id) {
        const rows = this.surfaces(), row = rows.find(entry => Number(entry.id) === Number(id));
        if (!row) return;
        const used = new Set(rows.map(entry => Number(entry.id)));
        let next = 1; while (used.has(next)) next++;
        const copy = Object.assign(JSON.parse(JSON.stringify(row)), { id: next, x: (Number(row.x) || 0) + 0.5, y: (Number(row.y) || 0) + 0.5 });
        this.writeSurfaces(rows.concat([copy]), next);
    }

    /** The plot as a map: the active tile layer's tiles and tileset, the other layers as pictures under and over it. */
    async plotMap() {
        const plan = this.plan(), S = RRStructure2D, db = this.database(), tilemap = this.tilemap(), [W, H] = plan.size;
        const active = plan.layers[this.session.active] || null;
        const tilesLayer = active && active.kind === 'tiles' ? active : null;
        const tilesets = db?.getTilesets?.() || [];
        const ctx = { tilemap, db, projectPath: this.projectPath() };
        const layers = [];
        const shown = list => list.filter(layer => !layer.hidden);
        const underList = shown(plan.layers.slice(0, this.session.active)).concat(active && active.kind === 'picture' && !active.hidden ? [active] : []);
        const overList = shown(plan.layers.slice(this.session.active + 1));
        const stamp = Date.now().toString(36);
        // The layers above the one being painted lie at 'same' (over the lower tiles, under a video), not 'over': on a
        // map the structure is one picture at 'ground' depth, so a video (layer 3) shows over all of it, and the plot
        // shows it so too (owner, 2026-11-22: a video showed under one of the tile layers).
        for (const [list, position, tag] of [[underList, 'back', 'under'], [overList, 'same', 'over']]) {
            if (!list.length) continue;
            const drawn = await Structure2DWorkshop.drawLayers(plan, list, Object.assign({}, ctx, { split: false }));
            if (!drawn.drewBelow) continue;
            const name = `${S.PICTURE_FOLDER}/${Structure2DWorkshop.TEMP}/${stamp}-${tag}`;
            this.session.temp.push(Structure2DWorkshop.writePicture(ctx.projectPath, name, drawn.below));
            layers.push({ name, layer: position });
        }
        return {
            id: 0, width: W, height: H, tilesetId: tilesLayer ? tilesLayer.tilesetId : (plan.layers.find(l => l.kind === 'tiles')?.tilesetId || tilesets[0]?.id || 1),
            data: tilesLayer ? tilesLayer.tiles.slice() : S.emptyTiles(W, H), events: [null], note: '',
            displayName: plan.name, autoplayBgm: false, autoplayBgs: false, bgm: { name: '', pan: 0, pitch: 100, volume: 90 }, bgs: { name: '', pan: 0, pitch: 100, volume: 90 },
            battleback1Name: '', battleback2Name: '', disableDashing: false, encounterList: [], encounterStep: 30,
            parallaxName: '', parallaxLoopX: false, parallaxLoopY: false, parallaxShow: true, parallaxSx: 0, parallaxSy: 0, scrollType: 0, specifyBattleback: false,
            rrImageLayers: layers.length ? layers : undefined,
            reactor3d: plan.surfaces.length ? { version: 1, mediaSurfaces: JSON.parse(JSON.stringify(plan.surfaces)) } : undefined,
            rrWorkshop: { structureId: this.session.structureId, dimension: '2d', name: plan.name }
        };
    }

    async showPlot() {
        this.putDownSurface();
        const mapData = await this.plotMap();
        const ok = await this.projectController.openWorkshopMap(mapData);
        this.tilemap()?.refreshPassage?.();
        return ok;
    }

    /** What the plot holds now, back into the structure: the active tile layer's tiles, the media surfaces. */
    capture() {
        const plan = this.plan(), map = this.tilemap()?.currentMap;
        if (!plan || !map?.rrWorkshop || map.rrWorkshop.dimension !== '2d') return false;
        const active = plan.layers[this.session.active];
        if (active && active.kind === 'tiles' && Array.isArray(map.data)) {
            const changed = map.data.length === active.tiles.length && map.data.some((v, i) => (v || 0) !== active.tiles[i]);
            if (changed) { active.tiles = map.data.map(v => v || 0); this.session.dirty = true; }
            if (map.tilesetId && map.tilesetId !== active.tilesetId) { active.tilesetId = map.tilesetId; this.session.dirty = true; }
        }
        const surfaces = (map.reactor3d?.mediaSurfaces || []).filter(Boolean).map(row => Object.assign({}, row));
        if (JSON.stringify(surfaces) !== JSON.stringify(plan.surfaces)) { plan.surfaces = surfaces; this.session.dirty = true; }
        if (this.tilemap()?.isMapDirty?.()) this.session.dirty = true;
        return true;
    }

    /** Another layer to paint: what the plot holds goes into the one before, and the plot shows the new one. */
    async selectLayer(index) {
        const plan = this.plan();
        if (plan && index === this.session.active && this._inline) { this.putDownSurface(); this.restoreTool(); this.showPanel(); return; }
        if (!plan || index < 0 || index >= plan.layers.length || index === this.session.active) return;
        this.capture();
        this.tilemap()?.captureSavedMapState?.();
        this.session.active = index;
        await this.showPlot();
        this.showPanel();
    }

    /** Save: the structure's file, its two pictures, every map it stands on. Ctrl+S on the plot comes here. */
    save() {
        if (!this.session || !this.capture()) return false;
        const entry = this.record(this.session.structureId), workshop = this.reactor()?.structureWorkshop;
        if (!entry || !workshop?.writeFile) return false;
        this.flash(this._t('Saving...'));
        const ctx = { tilemap: this.tilemap(), db: this.database(), projectPath: this.projectPath() };
        // The file first, as it is; the pictures and the maps follow when the pictures are drawn.
        if (!workshop.writeFile(entry)) return false;
        this.session.dirty = false;
        Structure2DWorkshop.bake(entry.plan, entry.file, ctx).then(() => {
            workshop.writeFile(entry);
            const maps = Structure2DWorkshop.updateMaps(ctx.projectPath, entry.file, Structure2DWorkshop.planOfFrom(ctx.db), null);
            this.flash(maps ? this._t('Saved. {count} maps updated.', { count: maps }) : this._t('Saved'));
        }).catch(error => {
            console.error('[Structure2DWorkshop] bake', error);
            this.flash(this._t('The pictures could not be drawn.'));
        });
        return true;
    }

    async close({ toDatabase = false, save = false } = {}) {
        if (!this.session) return;
        const tilemap = this.tilemap(), reactor = this.reactor();
        if (save && !this.save()) return;
        if (!save) {
            this.capture();
            if (this.session.dirty) {
                const leave = await RRDialog.confirm(this._t('Leave the workshop without saving?'), { title: this._t('Unsaved Changes'), ok: this._t('Discard Changes'), danger: true });
                if (!leave || !this.session) return;
                // What was painted goes: the structure as its file has it.
                this.revert();
            }
        }
        const session = this.session;
        if (tilemap?.currentMap?.rrWorkshop) tilemap.captureSavedMapState();
        this.end();
        const returnTo = session.returnTo ?? (this.projectController.getCurrentProject?.()?.maps || []).find(info => info && info.id)?.id ?? null;
        const back = returnTo != null && await this.projectController.loadMap(returnTo, { skipDirtyCheck: true, forceReload: true });
        if (!back && tilemap?.currentMap?.rrWorkshop) tilemap.clearMap?.();
        if (session.was3D && !reactor?.mapEditor3D?.enabled) await reactor?.applyMap3DViewPreference?.(true);
        if (toDatabase) {
            reactor?.openDatabase?.('structures');
            setTimeout(() => document.querySelector(`.database-list-item[data-entry-id="${session.structureId}"]`)?.click(), 300);
        }
    }

    /** The structure back as its file has it (Close without saving). */
    revert() {
        const entry = this.session && this.record(this.session.structureId), projectPath = this.projectPath(), db = this.database();
        if (!entry || !entry.file || !projectPath || typeof DatabaseStructureEditor === 'undefined') return;
        try {
            const path = require('path'), directory = db?.structuresPath ? db.structuresPath(projectPath) : path.join(projectPath, '3d', 'Structures');
            entry.plan = DatabaseStructureEditor.normalizePlan(JSON.parse(require('fs').readFileSync(path.join(directory, entry.file), 'utf8')));
        } catch (error) { /* a structure never saved stays as it is in the Database until it is */ }
    }

    /** Unsaved work on the plot that is not in its tiles (marks, layers, pictures): TilemapManager.isMapDirty asks. */
    hasUnsavedWork() { return !!this.session?.dirty; }

    end() {
        this.session = null;
        const tilemap = this.tilemap();
        if (tilemap) { tilemap.onWorkshopSave = null; tilemap.cellPicker = null; tilemap.workshopMarks = null; }
        this.hideBanner();
        this.hidePanel();
        this.hideSidebar();
        // The plot's pictures are its own: gone with it (a little later: the view may still be drawing them).
        setTimeout(() => this.clearTemp(), 1500);
    }

    clearTemp() {
        const projectPath = this.projectPath();
        if (!projectPath || typeof require !== 'function') return;
        try { require('fs').rmSync(require('path').join(projectPath, 'img', 'parallaxes', RRStructure2D.PICTURE_FOLDER, Structure2DWorkshop.TEMP), { recursive: true, force: true }); } catch (error) { /* in use */ }
    }

    mapChanged() {
        if (this.session && !this.tilemap()?.currentMap?.rrWorkshop) this.end();
    }

    // ---- Passability marks ----------------------------------------------------------------------------

    /** The plot's clicks paint marks (X, O, *, or none) while a mark tool is chosen; tiles otherwise. */
    setTool(tool) {
        if (!this.session) return;
        this.putDownSurface();
        this.session.tool = tool;
        const tilemap = this.tilemap();
        if (tilemap) tilemap.cellPicker = tool === 'paint' ? null : this.markPicker(tool);
        // The marks show while a mark tool is out.
        if (tilemap) { tilemap.workshopMarks = tool === 'paint' ? null : () => this.plan()?.passage || {}; tilemap.drawPassage?.(); }
        this.showPanel();
    }

    /** The plot's clicks for a mark tool: a drag paints X, O, ★ or Clear; Sides takes one click a side. */
    markPicker(tool) {
        return { onCell: (x, y, event) => this.mark(x, y, event), cursor: 'crosshair', drag: tool === 'edge' ? false : undefined };
    }

    /** The side of tile x, y nearest the pointer: its RPG Maker bit (8 up, 1 down, 2 left, 4 right). */
    sideAt(x, y, event) {
        const box = this.tilemap()?.tileBox?.(x, y, 1, 1), host = document.getElementById('canvas-container')?.getBoundingClientRect();
        if (!box || !host || !event) return 0;
        const fx = (event.clientX - host.left - box.left) / box.width, fy = (event.clientY - host.top - box.top) / box.height;
        return [[fy, 8], [1 - fy, 1], [fx, 2], [1 - fx, 4]].sort((a, b) => a[0] - b[0])[0][1];
    }

    mark(x, y, event = null) {
        const plan = this.plan();
        if (!plan || x < 0 || y < 0 || x >= plan.size[0] || y >= plan.size[1]) return;
        const cell = `${x},${y}`, tool = this.session.tool, before = plan.passage[cell];
        if (tool === 'clear') delete plan.passage[cell];
        else if (['X', 'O', '*'].includes(tool)) plan.passage[cell] = tool;
        else if (tool === 'edge') {
            // Sides: the side nearest the click blocked, or opened again (a cell with no mark starts open).
            const side = this.sideAt(x, y, event);
            if (!side) return;
            plan.passage[cell] = RRStructure2D.edgeMark((RRStructure2D.markBits(before) || 0) ^ side);
        }
        if (plan.passage[cell] !== before) {
            this.session.dirty = true;
            this.tilemap()?.refreshPassage?.();
            this.tilemap()?.requestRender?.();
        }
    }

    // ---- The structure's parts: the sidebar and the panel --------------------------------------------------
    //
    // While a 2D structure is built, the sidebar's Maps list becomes the structure's parts (its layers, top first, and
    // its videos and images) and the map's events go: a map can only be opened by leaving the workshop. The floating
    // panel edits the part chosen in the list (a layer's tileset or picture, changed in place and shown at once) and
    // holds the passability marks. Owner, 2026-11-22: "we don't want the elements of the app bleeding into each other".

    /** As the panel's list shows it: 0002 Reactor One - Inside (a tileset with no name is its number). */
    tilesetName(id) { return `${String(id).padStart(4, '0')} ${this.database()?.getTileset?.(id)?.name || ''}`.trim(); }

    static ICONS = {
        tiles: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 2.5h11v11h-11Z M2.5 6.2h11 M2.5 9.8h11 M6.2 2.5v11 M9.8 2.5v11" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
        picture: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3h12v10H2Z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="5.6" cy="6.3" r="1.3" fill="currentColor"/><path d="M2.6 12.2 6.4 8.4l2.8 2.8 1.9-1.9 2.4 2.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
        video: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.8 4h8.6v8H1.8Z M10.4 7.1 14.2 5v6l-3.8-2.1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
        sides: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 2.5h11v11h-11Z" fill="none" stroke="currentColor" stroke-width="1" opacity=".55"/><path d="M2 2h12v3H2Z" fill="#ff5050"/></svg>',
        grip: '<svg viewBox="0 0 10 16" width="8" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></g></svg>',
        eye: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="1.9" fill="currentColor"/></svg>',
        eyeOff: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M1.5 8s2.4-4.3 6.5-4.3S14.5 8 14.5 8s-2.4 4.3-6.5 4.3S1.5 8 1.5 8Z" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".55"/><path d="M2.5 13.5 13.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
    };

    picturesFolder() { const projectPath = this.projectPath(); return projectPath ? require('path').join(projectPath, 'img', 'pictures') : null; }

    pictureThumb(name) {
        const folder = this.picturesFolder();
        if (!folder || !name || typeof RRAssetFiles === 'undefined' || !RRAssetFiles.imageUrlFor) return '';
        try { return RRAssetFiles.imageUrlFor(folder, name) || ''; } catch (error) { return ''; }
    }

    /** The app's picture picker (thumbnails, search) on img/pictures; onPick gets the name without its extension. */
    choosePicture(current, onPick) {
        const ui = this.reactor()?.databaseEditorUI, projectPath = this.projectPath();
        if (!ui?.browseImageFolder || !projectPath) return false;
        return ui.browseImageFolder({ projectPath, folder: 'pictures', title: this._t('Choose a Picture'), current: current || undefined, zIndex: 20000,
            onPick: name => onPick(String(name || '').replace(/\.(png|webp|jpe?g)$/i, '')) });
    }

    /** The tileset picker (TilesetPicker.js): the list with every sheet of the one selected; onPick gets its id. */
    chooseTileset(current, title, onPick) {
        if (typeof TilesetPicker === 'undefined') return false;
        return TilesetPicker.open({ db: this.database(), projectPath: this.projectPath(), current, title, onPick });
    }

    /** The plot's videos and images (media surfaces): the plot holds them while it is open, the structure when saved. */
    surfaces() { return (this.tilemap()?.currentMap?.reactor3d?.mediaSurfaces || []).filter(Boolean); }

    /** The map's own media surface editor, on the plot: a new surface (id null) or one of its own. */
    editSurface(id) {
        const map = this.tilemap()?.currentMap, plan = this.plan();
        if (!map?.rrWorkshop || !plan || typeof MediaSurfaceEditor === 'undefined') return false;
        const rows = this.surfaces(), existing = id == null ? null : rows.find(row => Number(row.id) === Number(id));
        if (id != null && !existing) return false;
        const used = new Set(rows.map(row => Number(row.id)));
        let next = 1; while (used.has(next)) next++;
        const [W, H] = plan.size;
        const args = existing || Object.assign({}, MediaSurfaceEditor.defaults(), { id: next, target: 'map', x: Math.round((W - 1) / 2), y: Math.round((H - 1) / 2) });
        const command = { code: 357, indent: 0, parameters: ['RPGReactor', 'ShowVideoSurface', 'Show Media Surface', args] };
        this._surfaceEditor = this._surfaceEditor || new MediaSurfaceEditor(this.database(), this.projectController);
        return this._surfaceEditor.show(command, built => {
            if (!built || !this.session || this.tilemap()?.currentMap !== map) return;
            const list = this.surfaces().slice(), value = Object.assign({}, built.parameters[3], { target: 'map', wait: 'false' });
            const at = existing ? list.indexOf(existing) : -1;
            if (at >= 0) list[at] = value; else list.push(value);
            this.writeSurfaces(list);
        }, 'ShowVideoSurface', { type: 'map', mapSurface: true, currentMap: map, editing: !!existing, source: { mapId: map.id, surfaceId: id },
            validate: data => this.surfaces().some(row => row !== existing && Number(row.id) === Number(data.id)) ? [this._t('This Surface ID is already used on the map.')] : [] });
    }

    writeSurfaces(list, select = this.session?.surface ?? null) {
        const map = this.tilemap()?.currentMap;
        if (!map?.rrWorkshop) return;
        this.putDownSurface();
        if (list.length) { map.reactor3d = map.reactor3d || { version: 1 }; map.reactor3d.mediaSurfaces = JSON.parse(JSON.stringify(list)); }
        else if (map.reactor3d) delete map.reactor3d.mediaSurfaces;
        this.projectController?.mediaSurfacePreviewManager?.rescan?.();
        this.capture();
        this.session.dirty = true;
        if (select != null && list.some(row => Number(row.id) === Number(select))) this.selectSurface(select);
        else { this.restoreTool(); this.showPanel(); }
    }

    previewManager() { return this.projectController?.mediaSurfacePreviewManager || null; }

    /**
     * A video taken up on the plot: its handles out at once (move, resize, warp), its settings in the panel, every
     * change kept as it is made: the handles move the plot's own entry, so nothing waits for an OK and nothing is
     * lost when another layer is chosen (owner, 2026-11-22: it went back to where it was). A click on the plot away
     * from it, or Escape, puts it down. `id` null puts down the one in hand.
     */
    selectSurface(id) {
        if (!this.session) return false;
        this.putDownSurface();
        const map = this.tilemap()?.currentMap, pm = this.previewManager();
        const row = id == null ? null : this.surfaces().find(entry => Number(entry.id) === Number(id));
        if (!row || !map?.rrWorkshop || !pm?.beginAuthoring || typeof MediaSurfaceEditor === 'undefined') { this.restoreTool(); this.showPanel(); return false; }
        const defaults = MediaSurfaceEditor.defaults();
        for (const [key, value] of Object.entries(defaults)) if (row[key] === undefined) row[key] = JSON.parse(JSON.stringify(value));
        row.target = 'map';
        const self = this;
        const inline = {
            operation: 'ShowVideoSurface', data: row,
            context: { type: 'map', mapSurface: true, currentMap: map, editing: true, source: { mapId: map.id, surfaceId: Number(row.id) } },
            applyLiveMapPlacement() { if (self.session) { self.session.dirty = true; self.syncSurfaceFields(); } },
            livePanelRect() { return self.panel?.getBoundingClientRect?.() || null; }
        };
        this._inline = inline;
        this.session.surface = Number(row.id);
        pm.beginAuthoring(inline, row, inline.context);
        pm.syncToolInteraction?.();
        const tilemap = this.tilemap();
        if (tilemap) tilemap.cellPicker = {
            cursor: 'default',
            passes: event => !!pm.hitSurface?.(event.clientX, event.clientY),
            onCell: () => this.selectSurface(null),
            onEscape: () => this.selectSurface(null)
        };
        this.showPanel();
        return true;
    }

    /** The video in hand put down (its changes are already in the plot). */
    putDownSurface() {
        if (!this._inline) return;
        const inline = this._inline;
        this._inline = null;
        if (this.session) this.session.surface = null;
        const pm = this.previewManager();
        pm?.endAuthoring?.(inline);
        pm?.rescan?.();
        pm?.syncToolInteraction?.();
    }

    /** The plot's clicks back to the tool chosen (paint, or a mark). */
    restoreTool() {
        const tilemap = this.tilemap();
        if (!tilemap || !this.session) return;
        const tool = this.session.tool;
        tilemap.cellPicker = tool === 'paint' ? null : this.markPicker(tool);
    }

    /** The panel's video fields follow the handles while they are dragged. */
    syncSurfaceFields() {
        const row = this._inline?.data;
        if (!row || !this.panel) return;
        const round = value => Math.round(Number(value) * 100) / 100;
        for (const [field, value] of [['sx', row.x], ['sy', row.y], ['sw', row.width], ['sh', row.height]]) {
            const input = this.panel.querySelector(`[data-field="${field}"]`);
            if (input && document.activeElement !== input) input.value = round(value);
        }
        const small = this.sidebar?.querySelector(`[data-surface="${Number(row.id)}"] .rr-s2d-text small`);
        if (small) small.textContent = `#${Number(row.id)} · X ${round(row.x)} · Y ${round(row.y)}`;
    }

    /** A change typed in the panel: into the entry in hand, the plot shown with it. */
    changeSurface(field, value) {
        const row = this._inline?.data, pm = this.previewManager();
        if (!row) return;
        const number = Number(value);
        if (field === 'sx') row.x = Number.isFinite(number) ? number : row.x;
        else if (field === 'sy') row.y = Number.isFinite(number) ? number : row.y;
        else if (field === 'sw' || field === 'sh') {
            const key = field === 'sw' ? 'width' : 'height', axis = field === 'sw' ? 'x' : 'y';
            const next = Math.max(1, Math.min(8192, Number.isFinite(number) ? number : row[key])), old = Number(row[key]) || next;
            if (Array.isArray(row.corners)) row.corners = row.corners.map(corner => Object.assign({}, corner, { [axis]: corner[axis] * next / old }));
            row[key] = next;
        } else if (field === 'sopacity') row.opacity = Math.max(0, Math.min(255, Math.round(number) || 0));
        else return;
        this.session.dirty = true;
        pm?.updateAuthoring?.(this._inline);
        this.showSidebar();
    }

    /** The movies (or pictures) picker, through the media surface editor's own; onPick gets the file's path. */
    chooseMedia(kind, current, onPick) {
        if (typeof MediaSurfaceEditor === 'undefined') return false;
        const editor = new MediaSurfaceEditor(this.database(), this.projectController);
        editor.data = { movie: current || '' };
        editor._browseMedia(kind, onPick);
        return true;
    }

    /** A new video: chosen first, then laid in the middle of the plot at its own proportions, and taken up. */
    addVideo() {
        const plan = this.plan();
        if (!plan) return;
        this.chooseMedia('video', '', async name => {
            if (!this.session || !name) return;
            const rows = this.surfaces(), used = new Set(rows.map(row => Number(row.id)));
            let id = 1; while (used.has(id)) id++;
            const [W, H] = plan.size;
            const row = Object.assign(MediaSurfaceEditor.defaults(), { id, target: 'map', movie: name, wait: 'false', layer: 3, x: Math.round((W - 1) / 2 * 2) / 2, y: Math.round((H - 1) / 2 * 2) / 2 });
            const ratio = await Structure2DWorkshop.videoRatio(this.projectPath(), name);
            if (ratio) {
                const width = Math.min(W * Structure2DWorkshop.TILE * 0.8, 320), height = Math.round(width / ratio);
                row.width = Math.round(width); row.height = height;
                row.corners = [{ x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 }, { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }];
            }
            this.writeSurfaces(rows.concat([row]), id);
        });
    }

    /** A video file's width over its height, read from the file (null when it cannot be read in a second). */
    static videoRatio(projectPath, name) {
        return new Promise(resolve => {
            if (!projectPath || !name || typeof document === 'undefined') { resolve(null); return; }
            const video = document.createElement('video');
            const done = value => { clearTimeout(timer); video.removeAttribute('src'); try { video.load(); } catch (error) { /* gone */ } resolve(value); };
            const timer = setTimeout(() => done(null), 1500);
            video.preload = 'metadata'; video.muted = true;
            video.onloadedmetadata = () => done(video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : null);
            video.onerror = () => done(null);
            const file = require('path').join(projectPath, 'movies', ...String(name).split('/'));
            video.src = typeof RRAssetFiles !== 'undefined' && RRAssetFiles.toUrl ? RRAssetFiles.toUrl(file) : require('url').pathToFileURL(file).href;
        });
    }

    /** The sidebar: the structure's parts in place of the maps. */
    showSidebar() {
        const section = document.getElementById('maps-section'), plan = this.plan();
        if (!section || !plan) return;
        document.body.classList.add('rr-workshop2d-open');
        if (!this.sidebar) {
            this._hiddenMapParts = [...section.children].map(child => [child, child.style.display]);
            for (const [child] of this._hiddenMapParts) child.style.display = 'none';
            this.sidebar = document.createElement('div');
            this.sidebar.className = 'rr-workshop-list rr-s2d-sidebar';
            section.appendChild(this.sidebar);
            this.sidebar.addEventListener('click', event => this.onPartsClick(event));
            // A right-click is the structure's own menu, never the browser's.
            this.sidebar.addEventListener('contextmenu', event => {
                event.preventDefault();
                const layerRow = event.target.closest('.rr-s2d-layer'), surfaceRow = event.target.closest('[data-surface]');
                if (layerRow) this.layerMenu(Number(layerRow.dataset.layer), event.clientX, event.clientY);
                else if (surfaceRow) this.surfaceMenu(Number(surfaceRow.dataset.surface), event.clientX, event.clientY);
            });
            this.sidebar.addEventListener('change', event => {
                const select = event.target.closest('[data-field="surfaceLayer"]'), row = event.target.closest('[data-surface]');
                if (!select || !row) return;
                const id = Number(row.dataset.surface), layer = Number(select.value);
                this.writeSurfaces(this.surfaces().map(entry => Number(entry.id) === id ? Object.assign({}, entry, { layer }) : entry));
            });
            this.bindLayerDrag(this.sidebar);
        }
        const tt = text => rrEscapeHtml(this._t(text)), I = Structure2DWorkshop.ICONS, active = this.session.active;
        // Each layer's row is where its order is changed: dragged to a new place, or ▲ ▼ on the row; ✕ removes it.
        const count = plan.layers.length;
        const layers = plan.layers.map((layer, index) => ({ layer, index })).reverse().map(({ layer, index }) => `
            <div class="tree-item rr-s2d-item rr-s2d-layer${index === active && this.session.surface == null ? ' selected' : ''}${layer.hidden ? ' is-hidden' : ''}" data-layer="${index}" draggable="true" title="${tt('Drag to change the order')}">
                <span class="rr-s2d-grip" aria-hidden="true">${I.grip}</span>
                <button type="button" class="rr-s2d-eye" data-act="hide" title="${tt(layer.hidden ? 'Show while painting' : 'Hide while painting')}" aria-pressed="${!layer.hidden}">${layer.hidden ? I.eyeOff : I.eye}</button>
                <span class="rr-s2d-icon">${layer.kind === 'tiles' ? I.tiles : I.picture}</span>
                <span class="rr-s2d-text"><span class="rr-s2d-name">${rrEscapeHtml(layer.name)}</span><small>${rrEscapeHtml(layer.kind === 'tiles' ? this.tilesetName(layer.tilesetId) : (layer.picture || this._t('(no picture)')))}</small></span>
                <span class="rr-s2d-row-actions">
                    <button type="button" class="rr-s2d-move" data-act="up" title="${tt('Up: over the layer above it')}" aria-label="${tt('Up: over the layer above it')}"${index === count - 1 ? ' disabled' : ''}>▲</button>
                    <button type="button" class="rr-s2d-move" data-act="down" title="${tt('Down: under the layer below it')}" aria-label="${tt('Down: under the layer below it')}"${index === 0 ? ' disabled' : ''}>▼</button>
                    <button type="button" class="rr-s2d-x" data-act="delete" title="${tt('Remove')}" aria-label="${tt('Remove')}"${count < 2 ? ' disabled' : ''}>✕</button>
                </span>
            </div>`).join('');
        const surfaces = this.surfaces().map(row => {
            const file = String(row.movie || row.file || ''), image = /\.(?:png|jpe?g|webp|jxl)$/i.test(file);
            // Where it shows: over the structure (layer 3, with the characters; the structure is one picture under it
            // on a map) or over everything (10: over its ★ art and the characters). Another layer set in its editor
            // is kept and named.
            const layer = Number(row.layer ?? 3), places = [[3, 'Over the structure'], [10, 'Over everything']];
            const place = `<select class="rr-s2d-place" data-field="surfaceLayer" title="${tt('Where it shows')}">${places.map(([value, label]) => `<option value="${value}"${value === layer ? ' selected' : ''}>${tt(label)}</option>`).join('')}${places.some(([value]) => value === layer) ? '' : `<option value="${layer}" selected>${tt('Layer')} ${layer}</option>`}</select>`;
            return `<div class="tree-item rr-s2d-item rr-s2d-surface${Number(row.id) === this.session.surface ? ' selected' : ''}" data-surface="${Number(row.id)}" title="${tt('Select it on the plot')}">
                <span class="rr-s2d-icon">${image ? I.picture : I.video}</span>
                <span class="rr-s2d-text"><span class="rr-s2d-name">${rrEscapeHtml(file.split('/').pop() || this._t('Media Surface'))}</span><small>#${Number(row.id)} · X ${Math.round((Number(row.x) || 0) * 100) / 100} · Y ${Math.round((Number(row.y) || 0) * 100) / 100}</small>${place}</span>
                <button type="button" class="rr-s2d-x" data-act="removeSurface" title="${tt('Remove')}" aria-label="${tt('Remove')}">✕</button>
            </div>`;
        }).join('');
        this.sidebar.innerHTML = `
            <div class="sidebar-header rr-s2d-head"><span>${tt('Structure')}</span><strong>${rrEscapeHtml(plan.name)}</strong></div>
            <div class="sidebar-content rr-accent-scrollbar rr-workshop-items rr-s2d-items">
                <div class="rr-s2d-group">${tt('Layers')}<span>${tt('top first')}</span></div>
                ${layers}
                <div class="rr-s2d-group">${tt('Videos and images')}</div>
                ${surfaces || `<p class="rr-s2d-empty">${tt('None yet. + Video places one on the plot.')}</p>`}
            </div>
            <div class="rr-s2d-add">
                <button type="button" class="rr-btn-secondary" data-act="addTiles" title="${tt('A new tile layer: choose its tileset')}">${I.tiles}<span>${tt('Tiles')}</span></button>
                <button type="button" class="rr-btn-secondary" data-act="addPicture" title="${tt('A new picture layer: choose its picture')}">${I.picture}<span>${tt('Picture')}</span></button>
                <button type="button" class="rr-btn-secondary" data-act="addVideo" title="${tt('A video or image on the plot (a media surface)')}">${I.video}<span>${tt('Video')}</span></button>
            </div>
            <button type="button" class="rr-btn-secondary rr-workshop-leave" data-act="close">${tt('Close the workshop and show the maps')}</button>`;
    }

    /** A layer's row dragged over another: it goes above or below that one, as the line shown while dragging says. */
    bindLayerDrag(list) {
        const clear = () => { for (const row of list.querySelectorAll('.is-drop-above, .is-drop-below, .is-dragging')) row.classList.remove('is-drop-above', 'is-drop-below', 'is-dragging'); };
        const rowOf = event => event.target.closest?.('.rr-s2d-layer');
        list.addEventListener('dragstart', event => {
            const row = rowOf(event);
            if (!row) return;
            this._dragLayer = Number(row.dataset.layer);
            row.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            try { event.dataTransfer.setData('text/plain', row.dataset.layer); } catch (error) { /* the index is kept above */ }
        });
        list.addEventListener('dragover', event => {
            const row = rowOf(event);
            if (!row || this._dragLayer == null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            const box = row.getBoundingClientRect(), above = event.clientY < box.top + box.height / 2;
            for (const other of list.querySelectorAll('.is-drop-above, .is-drop-below')) if (other !== row) other.classList.remove('is-drop-above', 'is-drop-below');
            row.classList.toggle('is-drop-above', above);
            row.classList.toggle('is-drop-below', !above);
        });
        list.addEventListener('drop', async event => {
            const row = rowOf(event), from = this._dragLayer;
            this._dragLayer = null;
            if (!row || from == null) { clear(); return; }
            event.preventDefault();
            const above = row.classList.contains('is-drop-above');
            clear();
            await this.moveLayer(from, Number(row.dataset.layer), above);
        });
        list.addEventListener('dragend', () => { this._dragLayer = null; clear(); });
    }

    /** Layer `from` to just above (over) or below (under) layer `target`; the layer being painted stays the one chosen. */
    async moveLayer(from, target, above) {
        const plan = this.plan();
        if (!plan || from === target || !plan.layers[from] || !plan.layers[target]) return false;
        this.capture();
        const moving = plan.layers[from], targetLayer = plan.layers[target], activeLayer = plan.layers[this.session.active];
        const order = plan.layers.filter(layer => layer !== moving);
        order.splice(order.indexOf(targetLayer) + (above ? 1 : 0), 0, moving);
        if (order.every((layer, index) => layer === plan.layers[index])) return false;
        plan.layers.splice(0, plan.layers.length, ...order);
        this.session.active = Math.max(0, plan.layers.indexOf(activeLayer));
        await this.changed();
        return true;
    }

    hideSidebar() {
        document.body.classList.remove('rr-workshop2d-open');
        if (!this.sidebar) return;
        this.sidebar.remove();
        this.sidebar = null;
        for (const [child, display] of this._hiddenMapParts || []) child.style.display = display;
        this._hiddenMapParts = null;
    }

    /** The panel: the chosen layer's settings, then passability. */
    showPanel() {
        const container = document.getElementById('canvas-container');
        const plan = this.plan();
        if (!container || !plan) return;
        if (!this.panel) {
            this.panel = document.createElement('div');
            this.panel.className = 'lighting-panel rr-build-floating-dock rr-structure2d-panel';
            container.appendChild(this.panel);
            this.panel.addEventListener('click', event => this.onPartsClick(event));
            this.panel.addEventListener('change', event => this.onPanelChange(event));
            this.panel.addEventListener('contextmenu', event => { if (!event.target.closest('input, textarea')) event.preventDefault(); });
        }
        if (this.sidebar) this.showSidebar();
        const tt = text => rrEscapeHtml(this._t(text));
        const active = this.session.active, tool = this.session.tool, layer = plan.layers[active];
        const tilesets = (this.database()?.getTilesets?.() || []).filter(Boolean);
        let body = '';
        if (layer && layer.kind === 'tiles') {
            const tileset = tilesets.find(ts => ts.id === layer.tilesetId);
            const cover = tileset && typeof TilesetPicker !== 'undefined' ? TilesetPicker.sheetUrl(this.projectPath(), TilesetPicker.coverSheet(tileset)) : '';
            body = `<button type="button" class="rr-s2d-picture" data-act="chooseTileset" title="${tt('The tileset this layer paints with: its tiles show with the new one at once')}">
                    <span class="rr-s2d-picture-thumb">${cover ? `<img src="${rrEscapeHtml(cover)}" alt="">` : Structure2DWorkshop.ICONS.tiles}</span>
                    <span class="rr-s2d-picture-name">${rrEscapeHtml(this.tilesetName(layer.tilesetId))}<small>${tt('Choose…')}</small></span>
                </button>`;
        } else if (layer && layer.kind === 'picture') {
            const thumb = this.pictureThumb(layer.picture);
            body = `<button type="button" class="rr-s2d-picture" data-act="choosePicture" title="${tt('Choose another picture')}">
                    <span class="rr-s2d-picture-thumb">${thumb ? `<img src="${rrEscapeHtml(thumb)}" alt="">` : Structure2DWorkshop.ICONS.picture}</span>
                    <span class="rr-s2d-picture-name">${rrEscapeHtml(layer.picture || this._t('(no picture)'))}<small>${tt('Choose…')}</small></span>
                </button>
                <div class="rr-s2d-xyo">
                    <label>X<input type="number" class="lit-input" data-field="x" value="${layer.at[0]}" step="1"></label>
                    <label>Y<input type="number" class="lit-input" data-field="y" value="${layer.at[1]}" step="1"></label>
                    <label>${tt('Opacity')}<input type="number" class="lit-input" data-field="opacity" value="${layer.opacity}" min="0" max="255" step="1"></label>
                </div>`;
        }
        const layerCard = layer ? `
            <div class="lit-section"><div class="lit-section-header">${tt('Layer')}<span class="lit-section-meta">${tt(layer.kind === 'tiles' ? 'Tiles' : 'Picture')}</span></div>
                <label class="rr-structure2d-field">${tt('Name')}<input type="text" class="lit-input" data-field="name" maxlength="48" value="${rrEscapeHtml(layer.name)}"></label>
                ${body}
            </div>` : '';
        const surface = this._inline?.data || null;
        const round = value => Math.round(Number(value) * 100) / 100;
        const videoCard = surface ? `
            <div class="lit-section"><div class="lit-section-header">${tt(MediaSurfaceEditor.isImageFile(surface.movie) ? 'Image' : 'Video')}<span class="lit-section-meta">#${Number(surface.id)}</span></div>
                <button type="button" class="rr-s2d-picture" data-act="changeVideo" title="${tt('Choose another file')}">
                    <span class="rr-s2d-picture-thumb">${Structure2DWorkshop.ICONS.video}</span>
                    <span class="rr-s2d-picture-name">${rrEscapeHtml(String(surface.movie || '').split('/').pop() || this._t('(none)'))}<small>${tt('Choose…')}</small></span>
                </button>
                <div class="rr-s2d-xyo rr-s2d-xywh">
                    <label>X<input type="number" class="lit-input" data-field="sx" value="${round(surface.x)}" step="0.5"></label>
                    <label>Y<input type="number" class="lit-input" data-field="sy" value="${round(surface.y)}" step="0.5"></label>
                    <label>${tt('Opacity')}<input type="number" class="lit-input" data-field="sopacity" value="${Number(surface.opacity ?? 255)}" min="0" max="255" step="1"></label>
                    <label>${tt('Width')}<input type="number" class="lit-input" data-field="sw" value="${round(surface.width)}" min="1" step="1"></label>
                    <label>${tt('Height')}<input type="number" class="lit-input" data-field="sh" value="${round(surface.height)}" min="1" step="1"></label>
                    <label>${tt('Shows')}<select class="lit-select" data-field="surfaceLayer">${[[3, 'Over the structure'], [10, 'Over everything']].map(([value, label]) => `<option value="${value}"${value === Number(surface.layer ?? 3) ? ' selected' : ''}>${tt(label)}</option>`).join('')}${[3, 10].includes(Number(surface.layer ?? 3)) ? '' : `<option value="${Number(surface.layer)}" selected>${tt('Layer')} ${Number(surface.layer)}</option>`}</select></label>
                </div>
                <div class="rr-s2d-video-actions">
                    <button type="button" class="rr-btn-chip" data-act="surfaceSettings" title="${tt('Playback, scanlines and the rest, in the media surface editor')}">${tt('All settings…')}</button>
                    <button type="button" class="rr-btn-chip-danger" data-act="removeSurface">${tt('Remove')}</button>
                </div>
            </div>` : '';
        const toolButton = (id, label, title) => `<button type="button" class="rr-btn-chip rr-structure2d-tool${tool === id ? ' is-on' : ''}" data-tool="${id}" title="${tt(title)}">${label}</button>`;
        this.panel.innerHTML = `
            <div class="rr-modal-header rr-dock-head"><span class="rr-modal-title rr-dock-head-title">${tt('Structure Layers')}</span><button type="button" class="rr-modal-close" data-act="close" aria-label="${tt('Close')}">×</button></div>
            ${surface ? videoCard : layerCard}
            <div class="lit-section"><div class="lit-section-header">${tt('Passability')}</div>
                <div class="rr-structure2d-tools">
                    ${toolButton('paint', rrEscapeHtml(this._t('Paint')), 'Paint tiles and place things; no marks shown')}
                    ${toolButton('X', `<b>X</b> ${tt('Blocked')}`, 'Blocked')}
                    ${toolButton('O', `<b>O</b> ${tt('Open')}`, 'Open')}
                    ${toolButton('*', `<b>★</b> ${tt('Under')}`, 'Walk underneath: open, its art over the characters')}
                    ${toolButton('edge', `${Structure2DWorkshop.ICONS.sides} ${tt('Sides')}`, 'Block one side: click near a cell\'s edge to block it, again to open it')}
                    ${toolButton('clear', rrEscapeHtml(this._t('Clear')), 'No mark: its tiles decide')}
                </div>
            </div>
            <div class="lit-section"><div class="lit-section-header">${tt('Move Everything')}</div>
                <div class="rr-s2d-shift" role="group" aria-label="${tt('Move Everything')}">
                    <button type="button" class="rr-s2d-move" data-shift="0,-1" title="${tt('Every layer, mark and video one tile up')}" aria-label="${tt('Up')}">▲</button>
                    <button type="button" class="rr-s2d-move" data-shift="-1,0" title="${tt('Every layer, mark and video one tile left')}" aria-label="${tt('Left')}">◀</button>
                    <button type="button" class="rr-s2d-move" data-shift="1,0" title="${tt('Every layer, mark and video one tile right')}" aria-label="${tt('Right')}">▶</button>
                    <button type="button" class="rr-s2d-move" data-shift="0,1" title="${tt('Every layer, mark and video one tile down')}" aria-label="${tt('Down')}">▼</button>
                </div>
            </div>`;
    }

    hidePanel() { if (this.panel) { this.panel.remove(); this.panel = null; } }

    /** Clicks in the sidebar and in the panel. */
    async onPartsClick(event) {
        const plan = this.plan();
        if (!plan || event.target.closest('select')) return;
        const tool = event.target.closest('[data-tool]');
        if (tool) { this.setTool(tool.dataset.tool); return; }
        const shift = event.target.closest('[data-shift]');
        if (shift) { const [dx, dy] = shift.dataset.shift.split(',').map(Number); await this.shiftAll(dx, dy); return; }
        const act = event.target.closest('[data-act]')?.dataset.act;
        if (act === 'close') { this.close(); return; }
        const surfaceRow = event.target.closest('[data-surface]');
        const surfaceId = surfaceRow ? Number(surfaceRow.dataset.surface) : this.session.surface;
        if (act === 'removeSurface' && surfaceId != null) { this.writeSurfaces(this.surfaces().filter(row => Number(row.id) !== surfaceId), null); return; }
        if (act === 'surfaceSettings' && surfaceId != null) { this.putDownSurface(); this.restoreTool(); this.editSurface(surfaceId); return; }
        if (act === 'changeVideo' && this._inline) {
            const row = this._inline.data;
            this.chooseMedia(MediaSurfaceEditor.isImageFile(row.movie) ? 'image' : 'video', row.movie, name => { if (!name || !this._inline) return; row.movie = name; this.session.dirty = true; this.previewManager()?.updateAuthoring?.(this._inline); this.showPanel(); });
            return;
        }
        if (surfaceRow) { this.selectSurface(surfaceId); return; }
        if (act === 'addVideo') { this.addVideo(); return; }
        const row = event.target.closest('[data-layer]');
        const index = row ? Number(row.dataset.layer) : this.session.active;
        if (!act && row) { await this.selectLayer(index); return; }
        if (!act) return;
        const S = RRStructure2D, [W, H] = plan.size;
        if (act === 'addTiles' || act === 'chooseTileset') {
            const layer = act === 'chooseTileset' ? plan.layers[this.session.active] : null;
            const current = plan.layers[this.session.active];
            const suggested = (layer || (current && current.kind === 'tiles' ? current : plan.layers.find(entry => entry.kind === 'tiles')))?.tilesetId ?? null;
            this.chooseTileset(suggested, act === 'addTiles' ? this._t('A Tileset for the New Layer') : null, async id => {
                if (!this.session || !id) return;
                this.capture();
                if (layer) {
                    if (layer.tilesetId === id) return;
                    layer.tilesetId = id;
                } else {
                    plan.layers.push({ kind: 'tiles', name: this._t('Tiles {n}', { n: plan.layers.length + 1 }), tilesetId: id, tiles: S.emptyTiles(W, H) });
                    this.session.active = plan.layers.length - 1;
                }
                await this.changed();
            });
            return;
        }
        if (act === 'addPicture' || act === 'choosePicture') {
            const layer = act === 'choosePicture' ? plan.layers[this.session.active] : null;
            this.choosePicture(layer ? layer.picture : '', async name => {
                if (!this.session || !name) return;
                this.capture();
                if (layer) layer.picture = name;
                else {
                    plan.layers.push({ kind: 'picture', name: this._t('Picture {n}', { n: plan.layers.length + 1 }), picture: name, at: [0, 0], opacity: 255 });
                    this.session.active = plan.layers.length - 1;
                }
                await this.changed();
            });
            return;
        }
        this.capture();
        if (act === 'up' || act === 'down') {
            const to = index + (act === 'up' ? 1 : -1);
            if (to < 0 || to >= plan.layers.length) return;
            [plan.layers[index], plan.layers[to]] = [plan.layers[to], plan.layers[index]];
            if (this.session.active === index) this.session.active = to; else if (this.session.active === to) this.session.active = index;
        } else if (act === 'delete') {
            if (plan.layers.length < 2 || !await RRDialog.confirm(this._t('Remove the layer {name}?', { name: plan.layers[index].name }), { title: this._t('Structure Layers'), ok: this._t('Remove'), danger: true })) return;
            plan.layers.splice(index, 1);
            this.session.active = Math.max(0, Math.min(plan.layers.length - 1, this.session.active > index ? this.session.active - 1 : this.session.active));
        } else if (act === 'hide') {
            plan.layers[index].hidden = !plan.layers[index].hidden;
        } else return;
        await this.changed();
    }

    /**
     * The whole structure moved on its plot by (dx, dy) tiles: every tile layer, every picture, the passability marks
     * and the videos together (owner, 2026-11-22: built up to the plot's top edge, it had to come down as one; the
     * map editor's own selection takes only the layer being painted). What would leave the plot is asked about first.
     */
    async shiftAll(dx, dy) {
        const plan = this.plan();
        if (!plan || (!dx && !dy)) return false;
        this.capture();
        const [W, H] = plan.size, T = Structure2DWorkshop.TILE, Z = 6;
        const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
        let lost = 0;
        for (const layer of plan.layers) {
            if (layer.kind !== 'tiles') continue;
            for (let z = 0; z < Z; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (layer.tiles[(z * H + y) * W + x] && !inside(x + dx, y + dy)) lost++;
        }
        for (const key of Object.keys(plan.passage || {})) { const [x, y] = key.split(',').map(Number); if (!inside(x + dx, y + dy)) lost++; }
        if (lost && !await RRDialog.confirm(this._t('Part of the structure is at that edge and would be cut off. Move it anyway?'), { title: this._t('Move Everything'), ok: this._t('Move'), danger: true })) return false;
        for (const layer of plan.layers) {
            if (layer.kind === 'tiles') {
                const out = new Array(layer.tiles.length).fill(0);
                for (let z = 0; z < Z; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const value = layer.tiles[(z * H + y) * W + x];
                    if (value && inside(x + dx, y + dy)) out[(z * H + y + dy) * W + x + dx] = value;
                }
                layer.tiles = out;
            } else if (layer.kind === 'picture') {
                layer.at = [(Number(layer.at[0]) || 0) + dx * T, (Number(layer.at[1]) || 0) + dy * T];
            }
        }
        const passage = {};
        for (const [key, mark] of Object.entries(plan.passage || {})) { const [x, y] = key.split(',').map(Number); if (inside(x + dx, y + dy)) passage[`${x + dx},${y + dy}`] = mark; }
        plan.passage = passage;
        plan.surfaces = (plan.surfaces || []).map(row => Object.assign({}, row, { x: (Number(row.x) || 0) + dx, y: (Number(row.y) || 0) + dy }));
        await this.changed();
        if (this.session.tool !== 'paint') this.tilemap()?.drawPassage?.();
        return true;
    }

    /** The structure changed in a way the plot must show: it is drawn again, with the list and the panel. */
    async changed() {
        this.session.dirty = true;
        this.tilemap()?.captureSavedMapState?.();
        await this.showPlot();
        this.showPanel();
    }

    async onPanelChange(event) {
        const plan = this.plan(), field = event.target.dataset.field;
        if (this._inline && field === 'surfaceLayer') {
            const id = this.session.surface, layer = Number(event.target.value);
            this.writeSurfaces(this.surfaces().map(entry => Number(entry.id) === id ? Object.assign({}, entry, { layer }) : entry), id);
            return;
        }
        if (this._inline && ['sx', 'sy', 'sw', 'sh', 'sopacity'].includes(field)) { this.changeSurface(field, event.target.value); return; }
        const layer = plan?.layers[this.session.active];
        if (!layer || !field) return;
        this.capture();
        if (field === 'name') {
            const name = String(event.target.value || '').trim().slice(0, 48);
            if (!name || name === layer.name) { event.target.value = layer.name; return; }
            layer.name = name;
            this.session.dirty = true;
            this.showSidebar();
            return;
        }
        if (field === 'tileset' && layer.kind === 'tiles') {
            const id = Number(event.target.value);
            if (!id || id === layer.tilesetId) return;
            layer.tilesetId = id;
        } else if (layer.kind === 'picture' && field === 'x') layer.at[0] = Math.round(Number(event.target.value)) || 0;
        else if (layer.kind === 'picture' && field === 'y') layer.at[1] = Math.round(Number(event.target.value)) || 0;
        else if (layer.kind === 'picture' && field === 'opacity') layer.opacity = Math.max(0, Math.min(255, Math.round(Number(event.target.value)) || 0));
        else return;
        await this.changed();
    }

    // ---- The banner ------------------------------------------------------------------------------------

    showBanner() {
        const container = document.getElementById('canvas-container');
        const plan = this.plan();
        if (!container || !plan) return;
        if (!this.banner) {
            this.banner = document.createElement('div');
            this.banner.className = 'rr-workshop-banner';
            container.appendChild(this.banner);
        }
        const tt = text => rrEscapeHtml(this._t(text));
        this.banner.innerHTML = `
            <span class="rr-workshop-title">${tt('Building')} <strong>${rrEscapeHtml(plan.name)}</strong></span>
            <span class="rr-workshop-size">${rrEscapeHtml(this._t('{w} × {h} tiles, 2D', { w: plan.size[0], h: plan.size[1] }))}</span>
            <span class="rr-workshop-status" aria-live="polite"></span>
            <button type="button" class="rr-button-primary" data-workshop="save">${tt('Save')}</button>
            <button type="button" class="rr-btn-secondary" data-workshop="back">${tt('Save and Back to Database')}</button>
            <button type="button" class="rr-btn-secondary" data-workshop="close">${tt('Close')}</button>`;
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
        this._flash = setTimeout(() => { status.textContent = ''; }, 3000);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = Structure2DWorkshop;
