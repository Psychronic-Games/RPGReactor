/**
 * DatabaseStructureEditor - Database > Structures.
 *
 * A structure plan is a file under the project's 3d/Structures folder: a
 * building as a person describes it (rooms as rectangles, doors between
 * named rooms, stairs, a roof pitch, windows, named spots and the people
 * at them), or a plan of plans (parts placed on a page, with paths). The
 * palette's 3D-B tab stamps the same files, and `build-structure.cjs`
 * builds them from a shell, so this page is a form over that file and
 * nothing else: what it saves is what everything else reads.
 *
 * Three columns: the plans in the folder; the form; the plan drawn from
 * above (the pieces it builds, one floor at a time) and in 3D, with the
 * engine's own walk from the front door saying which rooms it reaches.
 */
class DatabaseStructureEditor {
    static MATERIAL_ROLES = ['wall', 'inner', 'floor', 'wet', 'roof', 'stair', 'path'];
    static DIRECTIONS = ['south', 'north', 'east', 'west'];
    static FACINGS = [[2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];
    static SIZE_MIN = 4;
    static SIZE_MAX = 200;

    constructor(databaseManager, projectController, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.current = null;
        this.floor = 0;
        this._detail = null;
        this._listCache = null;
        this._preview = null;
        this._previewTimer = null;
    }

    _t(text, params) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) value = value.split(`{${key}}`).join(String(replacement));
        return value;
    }

    _node() {
        if (typeof require !== 'function') return null;
        try { return { fs: require('fs'), path: require('path') }; } catch (error) { return null; }
    }

    projectPath() {
        const pc = this.projectController;
        const project = pc?.getCurrentProject ? pc.getCurrentProject() : pc?.currentProject;
        return project?.path || null;
    }

    directory() {
        const node = this._node(), root = this.projectPath();
        return node && root ? node.path.join(root, '3d', 'Structures') : null;
    }

    // ---- Files ----------------------------------------------------------

    /** The plans in the folder, by file name; a file that is not a plan is listed with its error. */
    list(refresh = false) {
        if (this._listCache && !refresh) return this._listCache;
        const node = this._node(), directory = this.directory();
        const list = [];
        if (node && directory && node.fs.existsSync(directory)) {
            for (const file of node.fs.readdirSync(directory).filter(name => /\.json$/i.test(name)).sort()) {
                try {
                    const plan = JSON.parse(node.fs.readFileSync(node.path.join(directory, file), 'utf8'));
                    if (plan && Array.isArray(plan.size)) list.push({ file, name: plan.name || file.replace(/\.json$/i, ''), plan });
                    else list.push({ file, name: file, plan: null, error: 'not a plan' });
                } catch (error) {
                    list.push({ file, name: file, plan: null, error: error.message });
                }
            }
        }
        this._listCache = list;
        return list;
    }

    read(file) {
        const node = this._node(), directory = this.directory();
        if (!node || !directory) return null;
        try {
            return DatabaseStructureEditor.normalizePlan(JSON.parse(node.fs.readFileSync(node.path.join(directory, file), 'utf8')));
        } catch (error) { return null; }
    }

    /** Written the way a person would: two-space indent, one trailing newline. */
    write(file, plan) {
        const node = this._node(), directory = this.directory();
        if (!node || !directory) return false;
        node.fs.mkdirSync(directory, { recursive: true });
        node.fs.writeFileSync(node.path.join(directory, file), JSON.stringify(DatabaseStructureEditor.trimPlan(plan), null, 2) + '\n');
        this._listCache = null;
        return true;
    }

    /** A file name from a plan name, unique in the folder. */
    fileNameFor(name, taken = this.list().map(entry => entry.file)) {
        const base = String(name || 'Plan').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-') || 'Plan';
        let file = base + '.json', n = 2;
        while (taken.includes(file)) file = `${base}-${n++}.json`;
        return file;
    }

    /** The plan a part names, for plans made of plans. */
    resolve(name) {
        return this.list().find(entry => entry.plan && (entry.file === name || entry.file === name + '.json' || entry.name === name))?.plan || null;
    }

    /** Event templates under 3d/Structures/events, by name. */
    eventTemplates() {
        const node = this._node(), directory = this.directory();
        if (!node || !directory) return [];
        const folder = node.path.join(directory, 'events');
        if (!node.fs.existsSync(folder)) return [];
        return node.fs.readdirSync(folder).filter(name => /\.json$/i.test(name)).sort().map(name => name.replace(/\.json$/i, ''));
    }

    /** The images under img/materials, by name. */
    materials() {
        const palette = window.reactor?.pieceBuilderManager;
        if (palette?.materials) return palette.materials().map(entry => entry.name);
        const node = this._node(), root = this.projectPath();
        if (!node || !root || typeof RRAssetFiles === 'undefined') return [];
        try { return RRAssetFiles.listImages(node.path.join(root, 'img', 'materials')).map(record => record.imageReference || record.name); } catch (error) { return []; }
    }

    materialUrl(name) {
        const node = this._node(), root = this.projectPath();
        if (!node || !root || !name || typeof RRAssetFiles === 'undefined') return null;
        try { return RRAssetFiles.imageUrlFor(node.path.join(root, 'img', 'materials'), name); } catch (error) { return null; }
    }

    // ---- The plan as data -------------------------------------------------

    /** Every field present with a sane value, so the form never reads undefined and the file gains nothing it did not have. */
    static normalizePlan(raw) {
        const plan = raw && typeof raw === 'object' ? raw : {};
        // What the file had, and in what order, so trimming writes it back
        // the same way: an author's empty list stays, a field they never
        // wrote is not added, and a hand-written file diffs as they left it.
        if (!plan._had) Object.defineProperty(plan, '_had', { value: Object.keys(plan), enumerable: false });
        const int = (value, fallback, min, max) => {
            const n = Math.floor(Number(value));
            return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
        };
        plan.name = String(plan.name || 'Plan');
        const size = Array.isArray(plan.size) ? plan.size : [];
        plan.size = [int(size[0], 12, this.SIZE_MIN, this.SIZE_MAX), int(size[1], 10, this.SIZE_MIN, this.SIZE_MAX)];
        plan.storey = int(plan.storey, 5, 3, 12);
        plan.materials = Object.assign({}, plan.materials || {});
        for (const role of this.MATERIAL_ROLES) plan.materials[role] = String(plan.materials[role] || '');
        plan.floors = (Array.isArray(plan.floors) ? plan.floors : []).map(floor => ({
            rooms: Object.fromEntries(Object.entries(floor?.rooms || {}).map(([name, rect]) => [name, [0, 1, 2, 3].map(i => int(rect?.[i], 0, 0, this.SIZE_MAX))])),
            doors: (floor?.doors || []).filter(Array.isArray).map(door => [String(door[0] || ''), String(door[1] || 'outside'), int(door[2], 3, 1, 12)]),
            wet: (floor?.wet || []).map(String)
        }));
        plan.stairs = (Array.isArray(plan.stairs) ? plan.stairs : []).map(stair => ({
            floor: int(stair?.floor, 0, 0, 20), from: [int(stair?.from?.[0], 0, 0, this.SIZE_MAX), int(stair?.from?.[1], 0, 0, this.SIZE_MAX)],
            dir: this.DIRECTIONS.includes(stair?.dir) ? stair.dir : 'north', width: int(stair?.width, 1, 1, 8)
        }));
        plan.roof = { pitch: int(plan.roof?.pitch, 2, 0, 20) };
        plan.windows = { every: int(plan.windows?.every, 6, 0, 60), width: int(plan.windows?.width, 2, 1, 8) };
        plan.spots = Object.fromEntries(Object.entries(plan.spots || {}).map(([name, cell]) => [name, [int(cell?.[0], 0, 0, this.SIZE_MAX), int(cell?.[1], 0, 0, this.SIZE_MAX)]]));
        plan.events = (Array.isArray(plan.events) ? plan.events : []).map(event => ({
            spot: String(event?.spot || ''), name: String(event?.name || ''), template: String(event?.template || ''), direction: [2, 4, 6, 8].includes(Number(event?.direction)) ? Number(event.direction) : 2
        }));
        plan.parts = (Array.isArray(plan.parts) ? plan.parts : []).map(part => ({
            name: String(part?.name || ''), plan: String(part?.plan || ''), at: [int(part?.at?.[0], 0, 0, this.SIZE_MAX), int(part?.at?.[1], 0, 0, this.SIZE_MAX)],
            rot: int(part?.rot, 0, 0, 3), scale: int(part?.scale, 1, 1, 4)
        }));
        plan.paths = (Array.isArray(plan.paths) ? plan.paths : []).filter(Array.isArray).map(strip => {
            const out = [0, 1, 2, 3].map(i => int(strip[i], 0, 0, this.SIZE_MAX));
            if (strip[4]) out.push(String(strip[4]));
            return out;
        });
        return plan;
    }

    /** The file keeps only what says something: an empty list, a blank material or a default window spacing is left out. */
    static trimPlan(plan) {
        const had = new Set(plan._had || []);
        const fields = { name: plan.name, size: plan.size.slice(), storey: plan.storey };
        const materials = Object.fromEntries(Object.entries(plan.materials).filter(([, value]) => value));
        if (Object.keys(materials).length || had.has('materials')) fields.materials = materials;
        fields.floors = plan.floors.map(floor => {
            const f = { rooms: Object.fromEntries(Object.entries(floor.rooms).map(([name, rect]) => [name, rect.slice()])) };
            if (floor.doors.length) f.doors = floor.doors.map(door => door.slice());
            if (floor.wet.length) f.wet = floor.wet.slice();
            return f;
        });
        if (plan.stairs.length || had.has('stairs')) fields.stairs = plan.stairs.map(stair => ({ floor: stair.floor, from: stair.from.slice(), dir: stair.dir, width: stair.width }));
        if (plan.floors.length || had.has('roof')) fields.roof = { pitch: plan.roof.pitch };
        if (plan.floors.length || had.has('windows')) fields.windows = { every: plan.windows.every, width: plan.windows.width };
        if (Object.keys(plan.spots).length || had.has('spots')) fields.spots = Object.fromEntries(Object.entries(plan.spots).map(([name, cell]) => [name, cell.slice()]));
        if (plan.events.length || had.has('events')) fields.events = plan.events.map(event => ({ ...event }));
        if (plan.parts.length || had.has('parts')) fields.parts = plan.parts.map(part => {
            const p = { name: part.name, plan: part.plan, at: part.at.slice(), rot: part.rot };
            if (part.scale !== 1) p.scale = part.scale;
            return p;
        });
        if (plan.paths.length || had.has('paths')) fields.paths = plan.paths.map(strip => strip.slice());
        // The file's own order first, then anything new at the end.
        const out = {};
        for (const key of plan._had || []) if (key in fields) out[key] = fields[key];
        for (const key of Object.keys(fields)) if (!(key in out)) out[key] = fields[key];
        return out;
    }

    /** A cottage to start from: two rooms, a front door, a door between, a window every six cells. */
    static newPlan(name) {
        return this.normalizePlan({
            name, size: [14, 10], storey: 5,
            materials: { wall: 'Stone', inner: 'Plaster', floor: 'Wood', wet: 'Stone', roof: 'RoofTile', stair: 'Wood' },
            floors: [{ rooms: { hall: [1, 1, 6, 8], kitchen: [8, 1, 12, 8] }, doors: [['hall', 'outside', 3], ['hall', 'kitchen', 3]], wet: ['kitchen'] }],
            roof: { pitch: 2 }, windows: { every: 6, width: 2 }
        });
    }

    /** Every room name on every floor, once, plus "outside". */
    static roomNames(plan) {
        const names = new Set();
        for (const floor of plan.floors) for (const name of Object.keys(floor.rooms)) names.add(name);
        return [...names];
    }

    /** A name no room on the floor has yet. */
    static freshName(taken, base) {
        let name = base, n = 2;
        while (taken.includes(name)) name = `${base}${n++}`;
        return name;
    }

    /**
     * The plan built as it would be stamped at the origin, and what the
     * engine's own walk from the front door reaches. Without three.js the
     * triangle count is left out; nothing else here needs it.
     */
    static report(plan, resolve, Reactor3D) {
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        const out = { pieces: 0, triangles: null, reached: [], missing: [], entrance: null, built: [] };
        if (!SP || !plan) return out;
        let pieces = [];
        try { pieces = SP.build(plan, 0, 0, 1, 0, resolve); } catch (error) { out.error = error.message; return out; }
        out.built = pieces;
        out.pieces = pieces.length;
        try { out.entrance = SP.entrance(plan); } catch (error) { out.entrance = null; }
        if (Reactor3D && typeof Reactor3D.pieceGeometry === 'function' && typeof THREE !== 'undefined') {
            const mapData = { width: plan.size[0], height: plan.size[1], reactor3d: { version: 1, elevation: new Array(plan.size[0] * plan.size[1]).fill(0), pieces } };
            try { out.triangles = Reactor3D.pieceGeometry(pieces, mapData).attributes.position.count / 3; } catch (error) { out.triangles = null; }
        }
        // A plan of rooms is walked from its front door, a plan of parts from its start spot; validate says which.
        if (Reactor3D && typeof SP.validate === 'function' && (out.entrance || plan.parts.length)) {
            try {
                const walked = SP.validate(plan, pieces, 0, 0, plan.size[0], plan.size[1], Reactor3D, resolve);
                for (const [room, result] of Object.entries(walked?.report || {})) (result && result.reached ? out.reached : out.missing).push(room);
            } catch (error) { out.error = error.message; }
        }
        return out;
    }

    // ---- The page -------------------------------------------------------

    show(detailEl) {
        this._detail = detailEl;
        this._listCache = null;
        const tt = text => this._t(text);
        detailEl.innerHTML = `
            <div class="rr-structures" style="display:flex;flex-direction:row;gap:0;height:100%;min-height:0;">
                <div style="width:220px;flex:0 0 220px;display:flex;flex-direction:column;border-right:1px solid var(--color-border);min-height:0;">
                    <div style="padding:6px 10px;font-weight:bold;color:var(--color-text);border-bottom:1px solid var(--color-border);">${tt('Plans')}</div>
                    <div class="rr-structures-list" style="flex:1;overflow-y:auto;min-height:0;"></div>
                    <div style="display:flex;gap:4px;padding:8px;border-top:1px solid var(--color-border);flex-wrap:wrap;">
                        <button type="button" class="rr-btn-secondary rr-structures-new">${tt('New')}</button>
                        <button type="button" class="rr-btn-secondary rr-structures-duplicate">${tt('Duplicate')}</button>
                        <button type="button" class="rr-btn-secondary rr-structures-delete">${tt('Delete')}</button>
                    </div>
                </div>
                <div class="rr-structures-form database-detail-wrapper db-page" style="flex:1;min-width:0;overflow-y:auto;min-height:0;"></div>
                <div style="width:340px;flex:0 0 340px;display:flex;flex-direction:column;border-left:1px solid var(--color-border);min-height:0;background:var(--color-bg-deep);">
                    <div class="rr-structures-floors" style="display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--color-border);flex-wrap:wrap;align-items:center;"></div>
                    <canvas class="rr-structures-plan" style="width:100%;height:280px;flex:0 0 auto;background:var(--color-bg-panel);"></canvas>
                    <div style="position:relative;flex:1;min-height:120px;">
                        <canvas class="rr-structures-3d" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab;"></canvas>
                    </div>
                    <div class="rr-structures-report" style="padding:8px;font-size:11px;color:var(--color-text-muted);border-top:1px solid var(--color-border);line-height:1.5;"></div>
                    <div style="display:flex;gap:6px;padding:8px;border-top:1px solid var(--color-border);align-items:center;">
                        <button type="button" class="rr-btn-secondary rr-structures-save">${tt('Save')}</button>
                        <button type="button" class="rr-btn-secondary rr-structures-use">${tt('Use on the map')}</button>
                        <span class="rr-structures-dirty" style="flex:1;text-align:right;font-size:11px;color:var(--color-text-muted);"></span>
                    </div>
                </div>
            </div>`;
        detailEl.querySelector('.rr-structures-new').addEventListener('click', () => this.createPlan());
        detailEl.querySelector('.rr-structures-duplicate').addEventListener('click', () => this.duplicatePlan());
        detailEl.querySelector('.rr-structures-delete').addEventListener('click', () => this.deletePlan());
        detailEl.querySelector('.rr-structures-save').addEventListener('click', () => this.save());
        detailEl.querySelector('.rr-structures-use').addEventListener('click', () => this.useOnMap());
        this._bindOrbit(detailEl.querySelector('.rr-structures-3d'));
        this.renderList();
        const list = this.list();
        const keep = this.current && list.some(entry => entry.file === this.current.file) ? this.current.file : list.find(entry => entry.plan)?.file;
        if (keep) this.select(keep, true); else this.renderForm();
    }

    renderList() {
        const listEl = this._detail?.querySelector('.rr-structures-list');
        if (!listEl) return;
        const entries = this.list();
        listEl.innerHTML = entries.length ? '' : `<div style="padding:10px;font-size:11px;color:var(--color-text-muted);">${this._t('No plans yet. New makes one.')}</div>`;
        for (const entry of entries) {
            const item = document.createElement('div');
            item.className = 'database-list-item' + (this.current && this.current.file === entry.file ? ' selected' : '');
            item.dataset.file = entry.file;
            item.style.cssText = 'padding:6px 10px;cursor:pointer;font-size:12px;display:flex;justify-content:space-between;gap:6px;';
            const size = entry.plan ? `${entry.plan.size[0]}×${entry.plan.size[1]}` : '';
            item.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;">${rrEscapeHtml(entry.name)}</span><span style="color:var(--color-text-muted);">${entry.error ? '!' : size}</span>`;
            if (entry.error) item.title = entry.error;
            item.addEventListener('click', () => { if (entry.plan) this.select(entry.file); });
            listEl.appendChild(item);
        }
    }

    async select(file, force = false) {
        if (!force && this.current && this.current.file === file) return;
        if (!(await this.confirmLeave())) return;
        const plan = this.read(file);
        this.current = plan ? { file, plan, dirty: false } : null;
        this.floor = 0;
        this.renderList();
        this.renderForm();
    }

    /** Unsaved edits ask before they are lost: save them, or let them go. */
    async confirmLeave() {
        if (!this.current || !this.current.dirty) return true;
        const ui = window.reactor?.uiManager;
        const message = this._t('This plan has unsaved changes. Save them?');
        if (ui?.showConfirm) {
            const save = await ui.showConfirm(this._t('Structures'), message, this._t('Save'), this._t('Discard'));
            if (save) this.save();
            return true;
        }
        if (typeof window.confirm === 'function' && window.confirm(message)) this.save();
        return true;
    }

    markDirty() {
        if (!this.current) return;
        this.current.dirty = true;
        const dirty = this._detail?.querySelector('.rr-structures-dirty');
        if (dirty) dirty.textContent = this._t('Unsaved');
        this.schedulePreview();
    }

    save() {
        if (!this.current) return false;
        if (!this.write(this.current.file, this.current.plan)) return false;
        this.current.dirty = false;
        const dirty = this._detail?.querySelector('.rr-structures-dirty');
        if (dirty) dirty.textContent = this._t('Saved to {file}.', { file: this.current.file });
        this.renderList();
        // The palette's Structure list reads the same folder.
        const palette = window.reactor?.pieceBuilderManager;
        if (palette?.structures) { palette.structures(true); palette.renderStructures?.(true); }
        return true;
    }

    async createPlan() {
        if (!(await this.confirmLeave())) return;
        const name = DatabaseStructureEditor.freshName(this.list().map(entry => entry.name), this._t('Cottage'));
        const plan = DatabaseStructureEditor.newPlan(name);
        const file = this.fileNameFor(name);
        if (!this.write(file, plan)) return;
        this.current = { file, plan: this.read(file), dirty: false };
        this.floor = 0;
        this.renderList();
        this.renderForm();
    }

    async duplicatePlan() {
        if (!this.current) return;
        if (!(await this.confirmLeave())) return;
        const plan = DatabaseStructureEditor.normalizePlan(JSON.parse(JSON.stringify(this.current.plan)));
        plan.name = DatabaseStructureEditor.freshName(this.list().map(entry => entry.name), plan.name);
        const file = this.fileNameFor(plan.name);
        if (!this.write(file, plan)) return;
        this.current = { file, plan: this.read(file), dirty: false };
        this.renderList();
        this.renderForm();
    }

    async deletePlan() {
        if (!this.current) return;
        const ui = window.reactor?.uiManager;
        const message = this._t('Delete {name}?', { name: this.current.plan.name });
        const yes = ui?.showConfirm ? await ui.showConfirm(this._t('Structures'), message, this._t('Delete')) : window.confirm(message);
        if (!yes) return;
        const node = this._node(), directory = this.directory();
        if (node && directory) {
            try { node.fs.unlinkSync(node.path.join(directory, this.current.file)); } catch (error) { console.warn('The plan could not be deleted.', error); }
        }
        this._listCache = null;
        this.current = null;
        this.renderList();
        const next = this.list().find(entry => entry.plan);
        if (next) this.select(next.file, true); else this.renderForm();
        const palette = window.reactor?.pieceBuilderManager;
        if (palette?.structures) { palette.structures(true); palette.renderStructures?.(true); }
    }

    /** Hand the plan to the 3D-B tab in Stamp mode and close the database so the next click on the map puts it down. */
    useOnMap() {
        if (!this.current) return;
        if (this.current.dirty) this.save();
        const reactor = window.reactor;
        const palette = reactor?.pieceBuilderManager;
        if (!palette) return;
        const file = this.current.file;
        // The database hides rather than tears down, so let the preview's context go here.
        this._disposePreview();
        this.parentEditor?.requestCloseDatabase?.(false);
        reactor.tilesetPaletteViewer?.selectLayer?.('P');
        palette.structures?.(true);
        palette.structure = file;
        palette.renderStructures?.(true);
        palette.setMode?.('stamp');
        if (palette.panel) palette._syncPanel?.();
    }

    // ---- The form -------------------------------------------------------

    _selectHtml(cls, options, value, attrs = '') {
        return `<select class="database-field-value ${cls}" ${attrs}>${options.map(([v, label]) => `<option value="${rrEscapeHtml(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`).join('')}</select>`;
    }

    _numberHtml(cls, value, attrs = '') {
        return `<input type="number" class="database-field-value ${cls}" value="${Number(value)}" step="1" style="width:64px;" ${attrs}>`;
    }

    renderForm() {
        const form = this._detail?.querySelector('.rr-structures-form');
        if (!form) return;
        const tt = text => this._t(text);
        const dirtyEl = this._detail.querySelector('.rr-structures-dirty');
        if (dirtyEl) dirtyEl.textContent = this.current?.dirty ? tt('Unsaved') : '';
        if (!this.current) {
            form.innerHTML = `<div style="padding:16px;color:var(--color-text-muted);font-size:12px;">${tt('Pick a plan, or make a new one. A plan is a file under 3d/Structures that the palette stamps and a script can write.')}</div>`;
            this.renderFloorTabs();
            this.schedulePreview();
            return;
        }
        const plan = this.current.plan;
        const ttp = (text, params) => this._t(text, params);
        const materialNames = this.materials();
        const materialOptions = [['', tt('Plain')]].concat(materialNames.map(name => [name, name]));
        const roleLabels = { wall: tt('Wall'), inner: tt('Inner wall'), floor: tt('Floor'), wet: tt('Wet floor'), roof: tt('Roof'), stair: tt('Stair'), path: tt('Path') };
        this.floor = Math.max(0, Math.min(plan.floors.length - 1, this.floor));
        const floor = plan.floors[this.floor] || null;
        const roomNames = floor ? Object.keys(floor.rooms) : [];
        const doorRooms = roomNames.map(name => [name, name]).concat([['outside', tt('Outside')]]);
        const spotNames = Object.keys(plan.spots);
        const templates = this.eventTemplates();
        const otherPlans = this.list().filter(entry => entry.plan && entry.file !== this.current.file).map(entry => [entry.file, entry.name]);
        const facings = DatabaseStructureEditor.FACINGS.map(([value, label]) => [value, tt(label)]);
        const directions = DatabaseStructureEditor.DIRECTIONS.map(dir => [dir, tt(dir)]);

        const section = (title, body, extra = '') => `
            <div class="database-section">
                <div class="database-section-header" style="display:flex;align-items:center;gap:8px;"><span style="flex:1;">${title}</span>${extra}</div>
                <div class="database-section-content">${body}</div>
            </div>`;
        const rows = (kind, header, body, empty) => `
            <div class="rr-structures-rows" data-rows="${kind}" style="display:grid;grid-template-columns:${header.cols};gap:6px 8px;align-items:center;font-size:11px;">
                ${header.labels.map(label => `<span style="color:var(--color-text-muted);">${label}</span>`).join('')}<span></span>
                ${body || `<span style="grid-column:1 / -1;color:var(--color-text-muted);">${empty}</span>`}
            </div>`;
        const remove = (kind, index) => `<button type="button" class="rr-btn-secondary rr-structures-remove" data-rows="${kind}" data-index="${index}" title="${rrEscapeHtml(tt('Remove'))}">✕</button>`;
        const add = kind => `<button type="button" class="rr-btn-secondary rr-structures-add" data-rows="${kind}">${tt('Add')}</button>`;

        const general = section(tt('General'), `<div class="db-form">
            <div class="db-row-cols">
                <span class="db-col"><label>${tt('Name')}</label><input type="text" class="database-field-value rr-structures-field" data-path="name" value="${rrEscapeHtml(plan.name)}"></span>
                <span class="db-col"><label>${tt('Width')}</label>${this._numberHtml('rr-structures-field', plan.size[0], `data-path="size.0" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}"`)}</span>
                <span class="db-col"><label>${tt('Height')}</label>${this._numberHtml('rr-structures-field', plan.size[1], `data-path="size.1" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}"`)}</span>
                <span class="db-col"><label>${tt('Storey (tiles)')}</label>${this._numberHtml('rr-structures-field', plan.storey, 'data-path="storey" min="3" max="12"')}</span>
            </div>
            <div class="db-row-cols">
                <span class="db-col"><label>${tt('Roof pitch (rows)')}</label>${this._numberHtml('rr-structures-field', plan.roof.pitch, 'data-path="roof.pitch" min="0" max="20"')}</span>
                <span class="db-col"><label>${tt('A window every (cells)')}</label>${this._numberHtml('rr-structures-field', plan.windows.every, 'data-path="windows.every" min="0" max="60"')}</span>
                <span class="db-col"><label>${tt('Window width')}</label>${this._numberHtml('rr-structures-field', plan.windows.width, 'data-path="windows.width" min="1" max="8"')}</span>
            </div>
            <div style="grid-column:1 / -1;font-size:11px;color:var(--color-text-muted);margin-top:4px;">${tt('Cells are the plan\'s own; the map position is chosen when it is stamped. Leave one cell between rooms and one round the outside: those cells become walls.')}</div>
        </div>`);

        const materialCol = role => `<span class="db-col"><label>${roleLabels[role]}</label>${this._selectHtml('rr-structures-field', materialOptions, plan.materials[role], `data-path="materials.${role}"`)}</span>`;
        const materials = section(tt('Materials'), `<div class="db-form">
            <div class="db-row-cols">${['wall', 'inner', 'floor', 'wet'].map(materialCol).join('')}</div>
            <div class="db-row-cols">${['roof', 'stair', 'path'].map(materialCol).join('')}</div>
            <div style="grid-column:1 / -1;font-size:11px;color:var(--color-text-muted);margin-top:4px;">${tt('Any tileable image under img/materials is a material.')}</div>
        </div>`);

        const roomsBody = floor ? Object.entries(floor.rooms).map(([name, rect], index) => `
            <input type="text" class="database-field-value rr-structures-room-name" data-index="${index}" value="${rrEscapeHtml(name)}" style="min-width:0;">
            ${[0, 1, 2, 3].map(i => this._numberHtml('rr-structures-room', rect[i], `data-index="${index}" data-i="${i}" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)).join('')}
            <input type="checkbox" class="system-checkbox rr-structures-wet" data-index="${index}" ${floor.wet.includes(name) ? 'checked' : ''} title="${rrEscapeHtml(tt('Wet floor'))}">
            ${remove('rooms', index)}`).join('') : '';
        const doorsBody = floor ? floor.doors.map((door, index) => `
            ${this._selectHtml('rr-structures-door', doorRooms, door[0], `data-index="${index}" data-i="0"`)}
            ${this._selectHtml('rr-structures-door', doorRooms, door[1], `data-index="${index}" data-i="1"`)}
            ${this._numberHtml('rr-structures-door', door[2], `data-index="${index}" data-i="2" min="1" max="12"`)}
            ${remove('doors', index)}`).join('') : '';
        const floors = section(tt('Floors'), floor ? `
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px;">${ttp('Floor {n} of {count}', { n: this.floor + 1, count: plan.floors.length })}</div>
            <div class="database-field-label" style="font-size:11px;">${tt('Rooms')}</div>
            ${rows('rooms', { cols: 'minmax(80px,1fr) 64px 64px 64px 64px 24px 28px', labels: [tt('Room'), 'x0', 'y0', 'x1', 'y1', tt('Wet')] }, roomsBody, tt('No rooms on this floor.'))}
            <div style="margin:4px 0 10px;">${add('rooms')}</div>
            <div class="database-field-label" style="font-size:11px;">${tt('Doors')}</div>
            ${rows('doors', { cols: 'minmax(80px,1fr) minmax(80px,1fr) 64px 28px', labels: [tt('From'), tt('To'), tt('Width')] }, doorsBody, tt('No doors on this floor: nothing can get in.'))}
            <div style="margin:4px 0 0;">${add('doors')}</div>`
            : `<div style="font-size:11px;color:var(--color-text-muted);">${tt('No floors: a plan of parts, or an empty plan. Add a floor to draw rooms.')}</div>`,
            `<button type="button" class="rr-btn-secondary rr-structures-floor-add">${tt('Add floor')}</button>${floor ? `<button type="button" class="rr-btn-secondary rr-structures-floor-remove">${tt('Remove floor')}</button>` : ''}`);

        const stairsBody = plan.stairs.map((stair, index) => `
            ${this._numberHtml('rr-structures-stair', stair.floor + 1, `data-index="${index}" data-prop="floor" min="1" max="${Math.max(1, plan.floors.length)}"`)}
            ${this._numberHtml('rr-structures-stair', stair.from[0], `data-index="${index}" data-prop="x" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._numberHtml('rr-structures-stair', stair.from[1], `data-index="${index}" data-prop="y" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._selectHtml('rr-structures-stair', directions, stair.dir, `data-index="${index}" data-prop="dir"`)}
            ${this._numberHtml('rr-structures-stair', stair.width, `data-index="${index}" data-prop="width" min="1" max="8"`)}
            ${remove('stairs', index)}`).join('');
        const stairs = section(tt('Stairs'), rows('stairs', { cols: '64px 64px 64px minmax(80px,1fr) 64px 28px', labels: [tt('Floor'), 'x', 'y', tt('Rises'), tt('Width')] }, stairsBody, tt('No stairs. Each cell climbs one tile, so a storey is that many cells.')) + `<div style="margin-top:4px;">${add('stairs')}</div>`);

        const spotsBody = Object.entries(plan.spots).map(([name, cell], index) => `
            <input type="text" class="database-field-value rr-structures-spot-name" data-index="${index}" value="${rrEscapeHtml(name)}" style="min-width:0;">
            ${this._numberHtml('rr-structures-spot', cell[0], `data-index="${index}" data-i="0" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._numberHtml('rr-structures-spot', cell[1], `data-index="${index}" data-i="1" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${remove('spots', index)}`).join('');
        const eventsBody = plan.events.map((event, index) => `
            ${this._selectHtml('rr-structures-event', spotNames.map(name => [name, name]), event.spot, `data-index="${index}" data-prop="spot"`)}
            <input type="text" class="database-field-value rr-structures-event" data-index="${index}" data-prop="name" value="${rrEscapeHtml(event.name)}" style="min-width:0;">
            ${this._selectHtml('rr-structures-event', [['', tt('Blank event')]].concat(templates.map(name => [name, name])), event.template, `data-index="${index}" data-prop="template"`)}
            ${this._selectHtml('rr-structures-event', facings, event.direction, `data-index="${index}" data-prop="direction"`)}
            ${remove('events', index)}`).join('');
        const people = section(tt('Spots and people'), `
            ${rows('spots', { cols: 'minmax(80px,1fr) 64px 64px 28px', labels: [tt('Spot'), 'x', 'y'] }, spotsBody, tt('No spots. A spot is a named cell a story can send someone to.'))}
            <div style="margin:4px 0 10px;">${add('spots')}</div>
            ${rows('events', { cols: 'minmax(70px,1fr) minmax(70px,1fr) minmax(70px,1fr) 80px 28px', labels: [tt('Spot'), tt('Name'), tt('Template'), tt('Facing')] }, eventsBody, tt('No people. An event at a spot moves with the building and keeps its hand edits.'))}
            <div style="margin-top:4px;">${add('events')}</div>`);

        const partsBody = plan.parts.map((part, index) => `
            <input type="text" class="database-field-value rr-structures-part" data-index="${index}" data-prop="name" value="${rrEscapeHtml(part.name)}" style="min-width:0;">
            ${this._selectHtml('rr-structures-part', [['', '']].concat(otherPlans), part.plan, `data-index="${index}" data-prop="plan"`)}
            ${this._numberHtml('rr-structures-part', part.at[0], `data-index="${index}" data-prop="x" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._numberHtml('rr-structures-part', part.at[1], `data-index="${index}" data-prop="y" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._numberHtml('rr-structures-part', part.rot, `data-index="${index}" data-prop="rot" min="0" max="3"`)}
            ${this._numberHtml('rr-structures-part', part.scale, `data-index="${index}" data-prop="scale" min="1" max="4"`)}
            ${remove('parts', index)}`).join('');
        const pathsBody = plan.paths.map((strip, index) => `
            ${[0, 1, 2, 3].map(i => this._numberHtml('rr-structures-path', strip[i], `data-index="${index}" data-i="${i}" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)).join('')}
            ${this._selectHtml('rr-structures-path', [['', tt('Path material')]].concat(materialNames.map(name => [name, name])), strip[4] || '', `data-index="${index}" data-i="4"`)}
            ${remove('paths', index)}`).join('');
        const parts = section(tt('Parts and paths'), `
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px;">${tt('A plan can be made of other plans: a hamlet is cottages at corners, turned in quarter turns, with paved paths between.')}</div>
            ${rows('parts', { cols: 'minmax(70px,1fr) minmax(90px,1fr) 64px 64px 64px 64px 28px', labels: [tt('Part'), tt('Plan'), 'x', 'y', tt('Turn'), tt('Scale')] }, partsBody, tt('No parts.'))}
            <div style="margin:4px 0 10px;">${add('parts')}</div>
            ${rows('paths', { cols: '64px 64px 64px 64px minmax(90px,1fr) 28px', labels: ['x0', 'y0', 'x1', 'y1', tt('Material')] }, pathsBody, tt('No paths.'))}
            <div style="margin-top:4px;">${add('paths')}</div>`);

        form.innerHTML = general + materials + floors + stairs + people + parts;
        this.bindForm(form);
        this.renderFloorTabs();
        this.schedulePreview();
    }

    renderFloorTabs() {
        const strip = this._detail?.querySelector('.rr-structures-floors');
        if (!strip) return;
        const plan = this.current?.plan;
        const count = plan ? Math.max(1, plan.floors.length) : 0;
        strip.innerHTML = `<span style="font-size:11px;color:var(--color-text-muted);margin-right:4px;">${this._t('Seen from above')}</span>`
            + Array.from({ length: count }, (_, i) => `<button type="button" class="rr-btn-secondary rr-structures-floor-tab" data-floor="${i}" aria-pressed="${i === this.floor}" style="font-size:11px;padding:2px 8px;${i === this.floor ? 'font-weight:bold;' : ''}">${i + 1}</button>`).join('')
            + (plan && plan.floors.length ? `<button type="button" class="rr-btn-secondary rr-structures-floor-tab" data-floor="roof" aria-pressed="${this.floor === 'roof'}" style="font-size:11px;padding:2px 8px;">${this._t('Roof')}</button>` : '');
        for (const button of strip.querySelectorAll('.rr-structures-floor-tab')) {
            button.addEventListener('click', () => {
                const value = button.dataset.floor;
                this.floor = value === 'roof' ? 'roof' : Number(value);
                if (this.floor !== 'roof') this.renderForm(); else { this.renderFloorTabs(); this.schedulePreview(); }
            });
        }
    }

    bindForm(form) {
        const plan = this.current.plan;
        const floorIndex = this.floor === 'roof' ? 0 : this.floor;
        const floor = plan.floors[floorIndex];
        const writePath = (path, value) => {
            const keys = path.split('.');
            let target = plan;
            for (const key of keys.slice(0, -1)) target = target[key];
            target[keys[keys.length - 1]] = value;
        };
        const number = (input, min, max) => Math.max(min, Math.min(max, Math.floor(Number(input.value)) || 0));
        for (const input of form.querySelectorAll('.rr-structures-field')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const path = input.dataset.path;
                if (input.type === 'number') writePath(path, number(input, Number(input.min) || 0, Number(input.max) || DatabaseStructureEditor.SIZE_MAX));
                else writePath(path, input.value);
                if (path === 'name') this.renderList();
                this.markDirty();
            });
        }
        // Rooms: a rename keeps the room's doors and wetness with it.
        for (const input of form.querySelectorAll('.rr-structures-room-name')) {
            input.addEventListener('change', () => {
                const entries = Object.entries(floor.rooms);
                const index = Number(input.dataset.index);
                const [oldName, rect] = entries[index];
                const newName = input.value.trim();
                if (!newName || newName === 'outside' || (newName !== oldName && floor.rooms[newName])) { input.value = oldName; return; }
                entries[index] = [newName, rect];
                floor.rooms = Object.fromEntries(entries);
                floor.doors = floor.doors.map(door => [door[0] === oldName ? newName : door[0], door[1] === oldName ? newName : door[1], door[2]]);
                floor.wet = floor.wet.map(name => (name === oldName ? newName : name));
                this.markDirty();
                this.renderForm();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-room')) {
            input.addEventListener('input', () => {
                const rect = Object.values(floor.rooms)[Number(input.dataset.index)];
                rect[Number(input.dataset.i)] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-wet')) {
            input.addEventListener('change', () => {
                const name = Object.keys(floor.rooms)[Number(input.dataset.index)];
                floor.wet = floor.wet.filter(other => other !== name);
                if (input.checked) floor.wet.push(name);
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-door')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const door = floor.doors[Number(input.dataset.index)];
                const i = Number(input.dataset.i);
                door[i] = i === 2 ? number(input, 1, 12) : input.value;
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-stair')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const stair = plan.stairs[Number(input.dataset.index)];
                const prop = input.dataset.prop;
                if (prop === 'floor') stair.floor = number(input, 1, Math.max(1, plan.floors.length)) - 1;
                else if (prop === 'x') stair.from[0] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                else if (prop === 'y') stair.from[1] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                else if (prop === 'dir') stair.dir = input.value;
                else if (prop === 'width') stair.width = number(input, 1, 8);
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-spot-name')) {
            input.addEventListener('change', () => {
                const entries = Object.entries(plan.spots);
                const index = Number(input.dataset.index);
                const [oldName, cell] = entries[index];
                const newName = input.value.trim();
                if (!newName || (newName !== oldName && plan.spots[newName])) { input.value = oldName; return; }
                entries[index] = [newName, cell];
                plan.spots = Object.fromEntries(entries);
                for (const event of plan.events) if (event.spot === oldName) event.spot = newName;
                this.markDirty();
                this.renderForm();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-spot')) {
            input.addEventListener('input', () => {
                Object.values(plan.spots)[Number(input.dataset.index)][Number(input.dataset.i)] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-event')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const event = plan.events[Number(input.dataset.index)];
                const prop = input.dataset.prop;
                event[prop] = prop === 'direction' ? Number(input.value) : input.value;
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-part')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const part = plan.parts[Number(input.dataset.index)];
                const prop = input.dataset.prop;
                if (prop === 'x') part.at[0] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                else if (prop === 'y') part.at[1] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                else if (prop === 'rot') part.rot = number(input, 0, 3);
                else if (prop === 'scale') part.scale = number(input, 1, 4);
                else part[prop] = input.value;
                this.markDirty();
            });
        }
        for (const input of form.querySelectorAll('.rr-structures-path')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const strip = plan.paths[Number(input.dataset.index)];
                const i = Number(input.dataset.i);
                if (i === 4) { if (input.value) strip[4] = input.value; else strip.length = 4; }
                else strip[i] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const button of form.querySelectorAll('.rr-structures-add')) button.addEventListener('click', () => this.addRow(button.dataset.rows));
        for (const button of form.querySelectorAll('.rr-structures-remove')) button.addEventListener('click', () => this.removeRow(button.dataset.rows, Number(button.dataset.index)));
        form.querySelector('.rr-structures-floor-add')?.addEventListener('click', () => {
            // A new floor copies the one below it: the rooms usually line up, and a landing is easier to trim than to draw.
            const below = plan.floors[plan.floors.length - 1];
            plan.floors.push(below ? { rooms: Object.fromEntries(Object.entries(below.rooms).map(([name, rect]) => [name, rect.slice()])), doors: below.doors.filter(door => door[1] !== 'outside' && door[0] !== 'outside').map(door => door.slice()), wet: [] }
                : { rooms: {}, doors: [], wet: [] });
            this.floor = plan.floors.length - 1;
            this.markDirty();
            this.renderForm();
        });
        form.querySelector('.rr-structures-floor-remove')?.addEventListener('click', () => {
            plan.floors.splice(floorIndex, 1);
            plan.stairs = plan.stairs.filter(stair => stair.floor < plan.floors.length);
            this.floor = Math.max(0, floorIndex - 1);
            this.markDirty();
            this.renderForm();
        });
    }

    addRow(kind) {
        const plan = this.current.plan;
        const floor = plan.floors[this.floor === 'roof' ? 0 : this.floor];
        const [W, H] = plan.size;
        if (kind === 'rooms' && floor) {
            const name = DatabaseStructureEditor.freshName(Object.keys(floor.rooms), this._t('room'));
            floor.rooms[name] = [1, 1, Math.max(1, Math.min(W - 2, 4)), Math.max(1, Math.min(H - 2, 4))];
        } else if (kind === 'doors' && floor) {
            const names = Object.keys(floor.rooms);
            floor.doors.push([names[0] || '', names[1] || 'outside', 3]);
        } else if (kind === 'stairs') {
            plan.stairs.push({ floor: 0, from: [1, 1], dir: 'north', width: 1 });
        } else if (kind === 'spots') {
            plan.spots[DatabaseStructureEditor.freshName(Object.keys(plan.spots), this._t('spot'))] = [1, 1];
        } else if (kind === 'events') {
            plan.events.push({ spot: Object.keys(plan.spots)[0] || '', name: '', template: '', direction: 2 });
        } else if (kind === 'parts') {
            plan.parts.push({ name: DatabaseStructureEditor.freshName(plan.parts.map(part => part.name), this._t('part')), plan: '', at: [0, 0], rot: 0, scale: 1 });
        } else if (kind === 'paths') {
            plan.paths.push([0, 0, 0, 0]);
        }
        this.markDirty();
        this.renderForm();
    }

    removeRow(kind, index) {
        const plan = this.current.plan;
        const floor = plan.floors[this.floor === 'roof' ? 0 : this.floor];
        if (kind === 'rooms' && floor) {
            const name = Object.keys(floor.rooms)[index];
            delete floor.rooms[name];
            floor.doors = floor.doors.filter(door => door[0] !== name && door[1] !== name);
            floor.wet = floor.wet.filter(other => other !== name);
        } else if (kind === 'doors' && floor) floor.doors.splice(index, 1);
        else if (kind === 'stairs') plan.stairs.splice(index, 1);
        else if (kind === 'spots') {
            const name = Object.keys(plan.spots)[index];
            delete plan.spots[name];
            plan.events = plan.events.filter(event => event.spot !== name);
        } else if (kind === 'events') plan.events.splice(index, 1);
        else if (kind === 'parts') plan.parts.splice(index, 1);
        else if (kind === 'paths') plan.paths.splice(index, 1);
        this.markDirty();
        this.renderForm();
    }

    // ---- The previews ---------------------------------------------------

    schedulePreview() {
        clearTimeout(this._previewTimer);
        this._previewTimer = setTimeout(() => this.refreshPreview(), 120);
    }

    refreshPreview() {
        if (!this._detail) return;
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        const report = this.current ? DatabaseStructureEditor.report(this.current.plan, name => this.resolve(name), R) : null;
        this._report = report;
        this.drawPlan(report);
        this.drawReport(report);
        this.draw3D(report);
    }

    /** The pieces of one storey (or the roof) seen from above, with room names, spots and parts over them. */
    drawPlan(report) {
        const canvas = this._detail?.querySelector('.rr-structures-plan');
        if (!canvas || typeof canvas.getContext !== 'function') return;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width || 320)), height = Math.max(1, Math.round(rect.height || 280));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const size = Math.min(width, height);
        const ctx = canvas.getContext('2d');
        const colours = typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? name => ThemeColors.resolve(name) : name => ({ '--color-bg-panel': '#1e1e1e', '--color-border': '#3a3a3a', '--color-text': '#e0e0e0', '--color-text-muted': '#9a9a9a', '--color-accent': '#5b8def' })[name] || '#888';
        ctx.fillStyle = colours('--color-bg-panel');
        ctx.fillRect(0, 0, width, height);
        const plan = this.current?.plan;
        if (!plan || !report) return;
        const [W, H] = plan.size;
        const cell = Math.max(2, Math.floor((size - 16) / Math.max(W, H)));
        const ox = Math.floor((width - cell * W) / 2), oy = Math.floor((height - cell * H) / 2);
        const S = plan.storey;
        const zLow = this.floor === 'roof' ? plan.floors.length * S : this.floor * S;
        const zHigh = this.floor === 'roof' ? Infinity : zLow + S;
        const tint = { wall: '#6f6f6f', block: '#7a6a5a', floor: '#c9a06b', doorway: '#e0b070', window: '#7fb2e0', stair: '#e07f3a', ramp: '#e07f3a', roof: '#b04a40', pillar: '#8a8a8a', fence: '#a08050' };
        const order = ['floor', 'ramp', 'stair', 'block', 'roof', 'wall', 'pillar', 'fence', 'window', 'doorway'];
        const pieces = report.built.filter(piece => piece.z >= zLow && piece.z < zHigh).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.z - b.z);
        for (const piece of pieces) {
            ctx.fillStyle = tint[piece.kind] || '#888';
            ctx.globalAlpha = piece.kind === 'floor' ? 0.55 : 0.95;
            ctx.fillRect(ox + piece.x * cell, oy + piece.y * cell, cell, cell);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colours('--color-border');
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + 0.5, oy + 0.5, cell * W, cell * H);
        ctx.font = `${Math.max(9, Math.min(13, cell * 1.5))}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const floorIndex = this.floor === 'roof' ? plan.floors.length - 1 : this.floor;
        const floor = plan.floors[floorIndex];
        if (floor && this.floor !== 'roof') {
            ctx.fillStyle = colours('--color-text');
            for (const [name, r] of Object.entries(floor.rooms)) ctx.fillText(name, ox + ((r[0] + r[2] + 1) / 2) * cell, oy + ((r[1] + r[3] + 1) / 2) * cell);
        }
        ctx.strokeStyle = colours('--color-accent');
        for (const part of plan.parts) {
            const child = this.resolve(part.plan);
            if (!child) continue;
            const turned = part.rot % 2 ? [child.size[1], child.size[0]] : child.size;
            const k = part.scale || 1;
            ctx.strokeRect(ox + part.at[0] * cell + 0.5, oy + part.at[1] * cell + 0.5, turned[0] * k * cell, turned[1] * k * cell);
            ctx.fillStyle = colours('--color-text-muted');
            ctx.fillText(part.name, ox + (part.at[0] + turned[0] * k / 2) * cell, oy + (part.at[1] + turned[1] * k / 2) * cell);
        }
        for (const [name, at] of Object.entries(plan.spots)) {
            ctx.fillStyle = colours('--color-accent');
            ctx.beginPath(); ctx.arc(ox + (at[0] + 0.5) * cell, oy + (at[1] + 0.5) * cell, Math.max(2, cell * 0.3), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = colours('--color-text');
            ctx.fillText(name, ox + (at[0] + 0.5) * cell, oy + (at[1] + 0.5) * cell - Math.max(6, cell * 0.8));
        }
        if (report.entrance && report.entrance.door) {
            const [dx, dy] = report.entrance.door;
            ctx.fillStyle = '#4ad07a';
            ctx.beginPath(); ctx.arc(ox + (dx + 0.5) * cell, oy + (dy + 0.5) * cell, Math.max(2, cell * 0.35), 0, Math.PI * 2); ctx.fill();
        }
    }

    drawReport(report) {
        const box = this._detail?.querySelector('.rr-structures-report');
        if (!box) return;
        if (!report) { box.textContent = ''; return; }
        const lines = [];
        lines.push(this._t('Pieces: {count}', { count: report.pieces }) + (report.triangles === null ? '' : ', ' + this._t('triangles: {count}', { count: report.triangles.toLocaleString() })));
        if (report.error) lines.push(rrEscapeHtml(report.error));
        else if (!this.current.plan.floors.length && this.current.plan.parts.length) lines.push(this._t('A plan of parts is walked from its start spot.'));
        else if (!report.entrance) lines.push(this._t('No front door: add a door to outside on the ground floor.'));
        else if (report.missing.length) lines.push(`<span style="color:var(--color-danger, #e05c4e);">${this._t('Not reachable from the front door: {rooms}', { rooms: rrEscapeHtml(report.missing.join(', ')) })}</span>`);
        else if (report.reached.length) lines.push(this._t('Every room is reachable from the front door.'));
        box.innerHTML = lines.join('<br>');
    }

    /** The whole building in three dimensions, one mesh per material, orbited by drag. */
    async draw3D(report) {
        const canvas = this._detail?.querySelector('.rr-structures-3d');
        if (!canvas || !report) return;
        const map3d = this.projectController?.mapEditor3D || window.reactor?.mapEditor3D;
        const ready = (typeof window !== 'undefined' && window.THREE && window.Reactor3D?.extensionsLoaded?.()) || (map3d?.ensureLibraries && await map3d.ensureLibraries());
        if (!ready || !canvas.isConnected || typeof THREE === 'undefined' || typeof Reactor3D === 'undefined') return;
        if (report !== this._report) return;
        this._ensure3D(canvas);
        const preview = this._preview;
        if (!preview) return;
        for (const mesh of preview.meshes) { preview.scene.remove(mesh); mesh.geometry.dispose(); }
        preview.meshes = [];
        const plan = this.current?.plan;
        if (!plan) return;
        const [W, H] = plan.size;
        const mapData = { width: W, height: H, reactor3d: { version: 1, elevation: new Array(W * H).fill(0), pieces: report.built } };
        const byMaterial = new Map();
        for (const piece of report.built) { const key = piece.material || ''; if (!byMaterial.has(key)) byMaterial.set(key, []); byMaterial.get(key).push(piece); }
        for (const [name, pieces] of byMaterial) {
            const geometry = Reactor3D.pieceGeometry(pieces, mapData);
            const mesh = new THREE.Mesh(geometry, this._material3D(name));
            preview.scene.add(mesh);
            preview.meshes.push(mesh);
        }
        // Ground: the plan's own footprint.
        if (!preview.ground) {
            preview.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x3f6b3a }));
            preview.ground.rotation.x = -Math.PI / 2;
            preview.scene.add(preview.ground);
        }
        preview.ground.scale.set(W + 2, H + 2, 1);
        preview.ground.position.set(W / 2, -0.01, H / 2);
        preview.centre = { x: W / 2, y: plan.storey * Math.max(1, plan.floors.length) / 2, z: H / 2 };
        if (!preview.distance || preview.autoDistance) { preview.distance = Math.max(W, H) * 1.3 + 6; preview.autoDistance = true; }
        preview.dirty = true;
    }

    _material3D(name) {
        const preview = this._preview;
        if (preview.materials.has(name)) return preview.materials.get(name);
        const material = new THREE.MeshBasicMaterial({ color: name ? 0xffffff : 0x9a9a9a, vertexColors: true, side: THREE.FrontSide });
        const url = this.materialUrl(name);
        if (url) {
            const texture = new THREE.TextureLoader().load(url, () => { preview.dirty = true; });
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            material.map = texture;
        }
        preview.materials.set(name, material);
        return material;
    }

    _ensure3D(canvas) {
        if (this._preview && this._preview.canvas === canvas) return;
        this._disposePreview();
        const scene = new THREE.Scene();
        if (typeof ModelPreview3D !== 'undefined' && ModelPreview3D.updateBackground) ModelPreview3D.updateBackground(scene); else scene.background = new THREE.Color(0x202830);
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        const preview = this._preview = { canvas, scene, camera, renderer, meshes: [], materials: new Map(), yaw: 0.7, pitch: 0.55, distance: 0, autoDistance: true, centre: { x: 0, y: 0, z: 0 }, dirty: true, raf: 0 };
        const tick = () => {
            if (this._preview !== preview) return;
            if (!canvas.isConnected) { this._disposePreview(); return; }
            const rect = canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
            if (canvas.width !== width * renderer.getPixelRatio() || canvas.height !== height * renderer.getPixelRatio()) {
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                preview.dirty = true;
            }
            if (preview.dirty) {
                const c = preview.centre, d = preview.distance || 20;
                camera.position.set(c.x + Math.cos(preview.yaw) * Math.cos(preview.pitch) * d, c.y + Math.sin(preview.pitch) * d, c.z + Math.sin(preview.yaw) * Math.cos(preview.pitch) * d);
                camera.lookAt(c.x, c.y, c.z);
                renderer.render(scene, camera);
                preview.dirty = false;
            }
            preview.raf = requestAnimationFrame(tick);
        };
        preview.raf = requestAnimationFrame(tick);
    }

    _bindOrbit(canvas) {
        if (!canvas) return;
        let drag = null;
        canvas.addEventListener('pointerdown', event => { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture?.(event.pointerId); });
        canvas.addEventListener('pointermove', event => {
            if (!drag || !this._preview) return;
            this._preview.yaw += (event.clientX - drag.x) * 0.01;
            this._preview.pitch = Math.max(0.05, Math.min(1.5, this._preview.pitch + (event.clientY - drag.y) * 0.01));
            drag = { x: event.clientX, y: event.clientY };
            this._preview.dirty = true;
        });
        const stop = () => { drag = null; };
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
        canvas.addEventListener('wheel', event => {
            if (!this._preview) return;
            event.preventDefault();
            this._preview.distance = Math.max(4, Math.min(600, (this._preview.distance || 20) * (event.deltaY > 0 ? 1.1 : 0.9)));
            this._preview.autoDistance = false;
            this._preview.dirty = true;
        }, { passive: false });
    }

    _disposePreview() {
        const preview = this._preview;
        if (!preview) return;
        cancelAnimationFrame(preview.raf);
        for (const mesh of preview.meshes) mesh.geometry.dispose();
        for (const material of preview.materials.values()) { material.map?.dispose(); material.dispose(); }
        preview.ground?.geometry.dispose();
        preview.renderer.dispose();
        this._preview = null;
    }

    /** Called by the database when the page is left. */
    detach() {
        clearTimeout(this._previewTimer);
        this._disposePreview();
        this._detail = null;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseStructureEditor;
