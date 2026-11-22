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
        this.showPanel();
        return true;
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
        for (const [list, position, tag] of [[underList, 'back', 'under'], [overList, 'over', 'over']]) {
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
        this.session.tool = tool;
        const tilemap = this.tilemap();
        if (tilemap) tilemap.cellPicker = tool === 'paint' ? null : {
            onCell: (x, y) => this.mark(x, y),
            cursor: 'crosshair'
        };
        // The marks show while a mark tool is out.
        if (tilemap) { tilemap.workshopMarks = tool === 'paint' ? null : () => this.plan()?.passage || {}; tilemap.drawPassage?.(); }
        this.showPanel();
    }

    mark(x, y) {
        const plan = this.plan();
        if (!plan || x < 0 || y < 0 || x >= plan.size[0] || y >= plan.size[1]) return;
        const cell = `${x},${y}`, tool = this.session.tool, before = plan.passage[cell];
        if (tool === 'clear') delete plan.passage[cell];
        else if (['X', 'O', '*'].includes(tool)) plan.passage[cell] = tool;
        if (plan.passage[cell] !== before) {
            this.session.dirty = true;
            this.tilemap()?.refreshPassage?.();
            this.tilemap()?.requestRender?.();
        }
    }

    // ---- The Layers panel --------------------------------------------------------------------------------

    tilesetName(id) { return this.database()?.getTileset?.(id)?.name || `#${id}`; }

    pictures() {
        const projectPath = this.projectPath();
        if (!projectPath || typeof RRAssetFiles === 'undefined' || !RRAssetFiles.listUnique) return [];
        try { return RRAssetFiles.listUnique(require('path').join(projectPath, 'img', 'pictures'), ['.png', '.webp', '.jpg', '.jpeg']).map(record => record.name).sort(); } catch (error) { return []; }
    }

    showPanel() {
        const container = document.getElementById('canvas-container');
        const plan = this.plan();
        if (!container || !plan) return;
        if (!this.panel) {
            this.panel = document.createElement('div');
            this.panel.className = 'lighting-panel rr-build-floating-dock rr-structure2d-panel';
            container.appendChild(this.panel);
            this.panel.addEventListener('click', event => this.onPanelClick(event));
            this.panel.addEventListener('change', event => this.onPanelChange(event));
        }
        const tt = text => rrEscapeHtml(this._t(text));
        const active = this.session.active, tool = this.session.tool;
        const rows = plan.layers.map((layer, index) => ({ layer, index })).reverse().map(({ layer, index }) => `
            <div class="rr-structure2d-layer${index === active ? ' is-active' : ''}" data-layer="${index}">
                <button type="button" class="rr-structure2d-eye${layer.hidden ? ' is-off' : ''}" data-act="hide" title="${tt(layer.hidden ? 'Show while painting' : 'Hide while painting')}">${layer.hidden ? '◌' : '●'}</button>
                <span class="rr-structure2d-layer-name">${rrEscapeHtml(layer.name)}<small>${rrEscapeHtml(layer.kind === 'tiles' ? this.tilesetName(layer.tilesetId) : (layer.picture || this._t('(no picture)')))}</small></span>
                <button type="button" class="rr-btn-chip" data-act="up" title="${tt('Up')}" ${index === plan.layers.length - 1 ? 'disabled' : ''}>▲</button>
                <button type="button" class="rr-btn-chip" data-act="down" title="${tt('Down')}" ${index === 0 ? 'disabled' : ''}>▼</button>
                <button type="button" class="rr-btn-chip" data-act="rename" title="${tt('Rename')}">✎</button>
                <button type="button" class="rr-btn-chip" data-act="delete" title="${tt('Remove')}" ${plan.layers.length < 2 ? 'disabled' : ''}>✕</button>
            </div>`).join('');
        const activeLayer = plan.layers[active];
        const pictureProps = activeLayer && activeLayer.kind === 'picture' ? `
            <div class="lit-section"><div class="lit-section-header">${tt('Picture')}</div>
                <label class="rr-structure2d-field">${tt('Picture')}<select class="lit-select" data-field="picture"><option value="">${tt('(none)')}</option>${this.pictures().map(name => `<option value="${rrEscapeHtml(name)}"${name === activeLayer.picture ? ' selected' : ''}>${rrEscapeHtml(name)}</option>`).join('')}</select></label>
                <label class="rr-structure2d-field">X<input type="number" class="lit-input" data-field="x" value="${activeLayer.at[0]}" step="1"></label>
                <label class="rr-structure2d-field">Y<input type="number" class="lit-input" data-field="y" value="${activeLayer.at[1]}" step="1"></label>
                <label class="rr-structure2d-field">${tt('Opacity')}<input type="number" class="lit-input" data-field="opacity" value="${activeLayer.opacity}" min="0" max="255" step="1"></label>
            </div>` : '';
        const tilesets = this.database()?.getTilesets?.() || [];
        const toolButton = (id, label, title) => `<button type="button" class="rr-btn-chip rr-structure2d-tool${tool === id ? ' is-on' : ''}" data-tool="${id}" title="${tt(title)}">${label}</button>`;
        this.panel.innerHTML = `
            <div class="rr-modal-header rr-dock-head"><span class="rr-modal-title rr-dock-head-title">${tt('Structure Layers')}</span><button type="button" class="rr-modal-close" data-act="close" aria-label="${tt('Close')}">×</button></div>
            <div class="lit-section"><div class="lit-section-header">${tt('Layers')}</div>
                <div class="rr-structure2d-layers">${rows}</div>
                <div class="rr-structure2d-add">
                    <select class="lit-select" data-field="newTileset">${tilesets.filter(Boolean).map(ts => `<option value="${ts.id}">${rrEscapeHtml(ts.name || '#' + ts.id)}</option>`).join('')}</select>
                    <button type="button" class="rr-btn-chip" data-act="addTiles">${tt('+ Tile layer')}</button>
                    <button type="button" class="rr-btn-chip" data-act="addPicture">${tt('+ Picture layer')}</button>
                </div>
            </div>
            ${pictureProps}
            <div class="lit-section"><div class="lit-section-header">${tt('Passability')}</div>
                <div class="rr-structure2d-tools">
                    ${toolButton('paint', this._t('Paint'), 'Paint tiles and place things')}
                    ${toolButton('X', 'X', 'Blocked')}
                    ${toolButton('O', 'O', 'Open')}
                    ${toolButton('*', '★', 'Walk underneath: open, its art over the characters')}
                    ${toolButton('clear', this._t('Clear'), 'Back to what its tiles say')}
                </div>
                <p class="rr-structure2d-note">${tt('A cell with no mark follows its tiles. Marks show while a mark tool is out.')}</p>
            </div>`;
    }

    hidePanel() { if (this.panel) { this.panel.remove(); this.panel = null; } }

    async onPanelClick(event) {
        const plan = this.plan();
        if (!plan) return;
        const tool = event.target.closest('[data-tool]');
        if (tool) { this.setTool(tool.dataset.tool); return; }
        const act = event.target.closest('[data-act]')?.dataset.act;
        if (act === 'close') { this.close(); return; }
        const row = event.target.closest('[data-layer]');
        const index = row ? Number(row.dataset.layer) : -1;
        if (!act && row) { await this.selectLayer(index); return; }
        if (!act) return;
        this.capture();
        const S = RRStructure2D, [W, H] = plan.size;
        if (act === 'addTiles') {
            const id = Number(this.panel.querySelector('[data-field="newTileset"]')?.value) || 1;
            plan.layers.push({ kind: 'tiles', name: this._t('Tiles {n}', { n: plan.layers.length + 1 }), tilesetId: id, tiles: S.emptyTiles(W, H) });
            this.session.active = plan.layers.length - 1;
        } else if (act === 'addPicture') {
            plan.layers.push({ kind: 'picture', name: this._t('Picture {n}', { n: plan.layers.length + 1 }), picture: this.pictures()[0] || '', at: [0, 0], opacity: 255 });
            this.session.active = plan.layers.length - 1;
        } else if (act === 'up' || act === 'down') {
            const to = index + (act === 'up' ? 1 : -1);
            if (to < 0 || to >= plan.layers.length) return;
            [plan.layers[index], plan.layers[to]] = [plan.layers[to], plan.layers[index]];
            if (this.session.active === index) this.session.active = to; else if (this.session.active === to) this.session.active = index;
        } else if (act === 'rename') {
            const name = await RRDialog.prompt(this._t('Name this layer:'), { title: this._t('Structure Layers'), value: plan.layers[index].name });
            if (!name || !name.trim()) return;
            plan.layers[index].name = name.trim().slice(0, 48);
        } else if (act === 'delete') {
            if (plan.layers.length < 2 || !await RRDialog.confirm(this._t('Remove the layer {name}?', { name: plan.layers[index].name }), { title: this._t('Structure Layers'), ok: this._t('Remove'), danger: true })) return;
            plan.layers.splice(index, 1);
            this.session.active = Math.max(0, Math.min(plan.layers.length - 1, this.session.active > index ? this.session.active - 1 : this.session.active));
        } else if (act === 'hide') {
            plan.layers[index].hidden = !plan.layers[index].hidden;
        } else return;
        this.session.dirty = true;
        this.tilemap()?.captureSavedMapState?.();
        await this.showPlot();
        this.showPanel();
    }

    async onPanelChange(event) {
        const plan = this.plan(), field = event.target.dataset.field;
        const layer = plan?.layers[this.session.active];
        if (!layer || layer.kind !== 'picture' || !field) return;
        if (field === 'picture') layer.picture = event.target.value;
        else if (field === 'x') layer.at[0] = Math.round(Number(event.target.value)) || 0;
        else if (field === 'y') layer.at[1] = Math.round(Number(event.target.value)) || 0;
        else if (field === 'opacity') layer.opacity = Math.max(0, Math.min(255, Math.round(Number(event.target.value)) || 0));
        else return;
        this.session.dirty = true;
        this.capture();
        this.tilemap()?.captureSavedMapState?.();
        await this.showPlot();
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
