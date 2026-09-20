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
        this.selection = null;
        this.tool = 'room';
        this.doorWidth = 3;
        this._open = {};
        this._gesture = null;
        this._planGeom = null;
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

    // ---- Files and lookups --------------------------------------------------

    /** The records of the database's structures category, live: unsaved plans included. */
    records() {
        return (this.databaseManager?.data?.structures || []).filter(entry => entry && entry.name && entry.plan);
    }

    /** The plan a part names, by file or by name, from the records first and the folder second. */
    resolve(name) {
        if (!name) return null;
        const wanted = String(name).replace(/\.json$/i, '');
        const hit = this.records().find(entry => entry.file === name || entry.file === wanted + '.json' || entry.name === name || entry.name === wanted);
        if (hit) return hit.plan;
        const node = this._node(), root = this.projectPath();
        if (!node || !root) return null;
        try {
            const file = node.path.join(root, '3d', 'Structures', /\.json$/i.test(name) ? name : name + '.json');
            return node.fs.existsSync(file) ? DatabaseStructureEditor.normalizePlan(JSON.parse(node.fs.readFileSync(file, 'utf8'))) : null;
        } catch (error) { return null; }
    }

    /** Event templates under 3d/Structures/events, by name. */
    eventTemplates() {
        const node = this._node(), root = this.projectPath();
        if (!node || !root) return [];
        const folder = node.path.join(root, '3d', 'Structures', 'events');
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
            wet: (floor?.wet || []).map(String),
            materials: Object.fromEntries(Object.entries(floor?.materials && typeof floor.materials === 'object' ? floor.materials : {})
                .map(([room, own]) => [room, { floor: String(own?.floor || ''), wall: String(own?.wall || '') }]))
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
            rot: int(part?.rot, 0, 0, 3), scale: int(part?.scale, 1, 1, 4),
            materials: part?.materials && typeof part.materials === 'object' ? Object.fromEntries(Object.entries(part.materials).map(([role, name]) => [role, String(name || '')])) : {}
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
            const own = Object.entries(floor.materials || {}).filter(([room]) => room in floor.rooms)
                .map(([room, m]) => [room, Object.fromEntries(Object.entries(m).filter(([, name]) => name))]).filter(([, m]) => Object.keys(m).length);
            if (own.length) f.materials = Object.fromEntries(own);
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
            const own = Object.fromEntries(Object.entries(part.materials || {}).filter(([, name]) => name));
            if (Object.keys(own).length) p.materials = own;
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
            materials: this.styleMaterials('Stone and tile'),
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
     * A style is a set of materials to start from, named after what it is
     * built of. A material the project lacks is left plain rather than
     * named, so a preset never points at an image that is not there.
     */
    static STYLES = {
        'Stone and thatch': { wall: 'Stone', inner: 'Plaster', floor: 'Wood', wet: 'Stone', roof: 'Thatch', stair: 'Wood', path: 'Sand' },
        'Stone and tile': { wall: 'Stone', inner: 'Plaster', floor: 'Wood', wet: 'Stone', roof: 'RoofTile', stair: 'Wood', path: 'Sand' },
        'Timber': { wall: 'Wood', inner: 'Wood', floor: 'Wood', wet: 'Stone', roof: 'Thatch', stair: 'Wood', path: 'Sand' },
        'Plaster': { wall: 'Plaster', inner: 'Plaster', floor: 'Wood', wet: 'Stone', roof: 'RoofTile', stair: 'Wood', path: 'Sand' }
    };

    /** The style a set of materials is, or null when it is its own. */
    static styleOf(materials, available = null) {
        for (const [name, style] of Object.entries(this.STYLES)) {
            const resolved = this.styleMaterials(name, available);
            if (this.MATERIAL_ROLES.every(role => (materials[role] || '') === (resolved[role] || ''))) return name;
        }
        return null;
    }

    /** A style's materials, with any the project does not have left plain. */
    static styleMaterials(name, available = null) {
        const style = this.STYLES[name] || {};
        const out = {};
        for (const role of this.MATERIAL_ROLES) out[role] = !available || available.includes(style[role] || '') ? (style[role] || '') : '';
        return out;
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

    static TOOLS = ['room', 'door', 'stairs', 'spot'];

    /**
     * One record's plan, edited in place: the database's list, clipboard,
     * undo and Apply see every change as they do for any other record.
     */
    showStructureDetail(detailEl, entry) {
        this._detail = detailEl;
        entry.plan = DatabaseStructureEditor.normalizePlan(entry.plan || DatabaseStructureEditor.newPlan(entry.name || 'Plan'));
        if (entry.name) entry.plan.name = entry.name;
        this.current = { entry, plan: entry.plan };
        this.floor = 0;
        this.selection = null;
        this.tool = this.tool || 'room';
        const tt = text => this._t(text);
        detailEl.innerHTML = `
            <div class="rr-structures" style="display:flex;flex-direction:column;height:100%;min-height:0;">
                <div class="rr-structures-bar" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid var(--color-border);flex-wrap:wrap;font-size:12px;"></div>
                <div style="display:flex;flex:1;min-height:200px;">
                    <div style="flex:1;min-width:0;position:relative;background:var(--color-bg-panel);">
                        <canvas class="rr-structures-plan" tabindex="0" style="position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;outline:none;"></canvas>
                        <div class="rr-structures-floors" style="position:absolute;top:8px;left:8px;display:flex;gap:4px;align-items:center;"></div>
                    </div>
                    <div style="width:300px;flex:0 0 300px;display:flex;flex-direction:column;border-left:1px solid var(--color-border);background:var(--color-bg-deep);min-height:0;">
                        <div style="position:relative;flex:1;min-height:120px;"><canvas class="rr-structures-3d" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab;"></canvas></div>
                        <div class="rr-structures-report" style="padding:8px 10px;font-size:11px;color:var(--color-text-muted);border-top:1px solid var(--color-border);line-height:1.5;"></div>
                    </div>
                </div>
                <div class="rr-structures-inspector" style="border-top:1px solid var(--color-border);padding:8px 10px;min-height:40px;font-size:12px;"></div>
                <div class="rr-structures-more database-detail-wrapper db-page" style="border-top:1px solid var(--color-border);max-height:40%;overflow-y:auto;flex:0 0 auto;"></div>
            </div>`;
        this._bindOrbit(detailEl.querySelector('.rr-structures-3d'));
        this._bindPlanGestures(detailEl.querySelector('.rr-structures-plan'));
        this.render();
    }

    render() {
        this.renderBar();
        this.renderFloorTabs();
        this.renderInspector();
        this.renderMore();
        this.schedulePreview();
    }

    /** An edit: the database owns the dirty state; the list shows the name. */
    markDirty() {
        if (!this.current) return;
        this.parentEditor?._markDatabaseMutation?.();
        this.schedulePreview();
    }

    setName(name) {
        const { entry, plan } = this.current;
        entry.name = name;
        plan.name = name;
        this.parentEditor?.refreshDatabaseListLabel?.(entry, 'structures');
        this.markDirty();
    }

    currentFloor() {
        const plan = this.current?.plan;
        if (!plan) return null;
        return plan.floors[this.floor === 'roof' ? plan.floors.length - 1 : this.floor] || null;
    }

    _selectHtml(cls, options, value, attrs = '') {
        return `<select class="database-field-value ${cls}" ${attrs}>${options.map(([v, label]) => `<option value="${rrEscapeHtml(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`).join('')}</select>`;
    }

    _numberHtml(cls, value, attrs = '') {
        return `<input type="number" class="database-field-value ${cls}" value="${Number(value)}" step="1" style="width:64px;" ${attrs}>`;
    }

    /** Name, style, size, the tools, and the way onto the map: one row. */
    renderBar() {
        const bar = this._detail?.querySelector('.rr-structures-bar');
        if (!bar || !this.current) return;
        const tt = text => this._t(text);
        const { plan } = this.current;
        const materialNames = this.materials();
        const styleNames = Object.keys(DatabaseStructureEditor.STYLES);
        const style = DatabaseStructureEditor.styleOf(plan.materials, materialNames);
        const toolLabels = { room: tt('Room'), door: tt('Door'), stairs: tt('Stairs'), spot: tt('Spot') };
        const label = (text, control) => `<label style="display:flex;align-items:center;gap:6px;color:var(--color-text-muted);">${text}${control}</label>`;
        bar.innerHTML = `
            ${label(tt('Name'), `<input type="text" class="database-field-value rr-structures-name" value="${rrEscapeHtml(plan.name)}" style="width:140px;">`)}
            ${label(tt('Style'), this._selectHtml('rr-structures-style', styleNames.map(name => [name, tt(name)]).concat([['', tt('Custom')]]), style || '', 'style="width:150px;"'))}
            ${label(tt('Size'), `${this._numberHtml('rr-structures-size', plan.size[0], `data-i="0" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}" style="width:56px;"`)}<span>×</span>${this._numberHtml('rr-structures-size', plan.size[1], `data-i="1" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}" style="width:56px;"`)}`)}
            <span style="display:flex;gap:2px;margin-left:auto;" role="radiogroup">${DatabaseStructureEditor.TOOLS.map(tool => `<button type="button" class="rr-btn-secondary rr-structures-tool" data-tool="${tool}" role="radio" aria-checked="${tool === this.tool}" style="${tool === this.tool ? 'font-weight:bold;border-color:var(--color-accent);' : ''}">${toolLabels[tool]}</button>`).join('')}</span>
            <button type="button" class="rr-btn-secondary rr-structures-use">${tt('Use on the map')}</button>`;
        bar.querySelector('.rr-structures-name').addEventListener('input', event => this.setName(event.target.value));
        bar.querySelector('.rr-structures-style').addEventListener('change', event => {
            if (!event.target.value) return;
            Object.assign(plan.materials, DatabaseStructureEditor.styleMaterials(event.target.value, materialNames));
            this.markDirty();
            this.renderMore();
        });
        for (const input of bar.querySelectorAll('.rr-structures-size')) {
            input.addEventListener('input', () => {
                plan.size[Number(input.dataset.i)] = Math.max(DatabaseStructureEditor.SIZE_MIN, Math.min(DatabaseStructureEditor.SIZE_MAX, Math.floor(Number(input.value)) || DatabaseStructureEditor.SIZE_MIN));
                this.markDirty();
            });
        }
        for (const button of bar.querySelectorAll('.rr-structures-tool')) {
            button.addEventListener('click', () => { this.tool = button.dataset.tool; this.renderBar(); this.renderInspector(); });
        }
        bar.querySelector('.rr-structures-use').addEventListener('click', () => this.useOnMap());
    }

    renderFloorTabs() {
        const strip = this._detail?.querySelector('.rr-structures-floors');
        if (!strip) return;
        const plan = this.current?.plan;
        if (!plan) { strip.innerHTML = ''; return; }
        const tt = text => this._t(text);
        const count = plan.floors.length;
        const tab = (value, text, pressed, title = '') => `<button type="button" class="rr-btn-secondary rr-structures-floor-tab" data-floor="${value}" aria-pressed="${pressed}" title="${rrEscapeHtml(title)}" style="font-size:11px;padding:2px 8px;${pressed ? 'font-weight:bold;border-color:var(--color-accent);' : ''}">${text}</button>`;
        strip.innerHTML = `<span style="font-size:11px;color:var(--color-text-muted);margin-right:4px;">${tt('Floor')}</span>`
            + Array.from({ length: count }, (_, i) => tab(i, i + 1, i === this.floor)).join('')
            + (count ? tab('roof', tt('Roof'), this.floor === 'roof') : '')
            + tab('add', '+', false, tt('Add floor'))
            + (count > 1 && this.floor !== 'roof' ? tab('remove', '−', false, tt('Remove floor')) : '');
        for (const button of strip.querySelectorAll('.rr-structures-floor-tab')) {
            button.addEventListener('click', () => {
                const value = button.dataset.floor;
                if (value === 'add') return this.addFloor();
                if (value === 'remove') return this.removeFloor();
                this.floor = value === 'roof' ? 'roof' : Number(value);
                this.selection = null;
                this.renderFloorTabs(); this.renderInspector(); this.schedulePreview();
            });
        }
    }

    addFloor() {
        const plan = this.current.plan;
        // A new floor copies the one below it: the rooms usually line up, and a landing is easier to trim than to draw.
        const below = plan.floors[plan.floors.length - 1];
        plan.floors.push(below ? { rooms: Object.fromEntries(Object.entries(below.rooms).map(([name, rect]) => [name, rect.slice()])), doors: below.doors.filter(door => door[1] !== 'outside' && door[0] !== 'outside').map(door => door.slice()), wet: [], materials: {} }
            : { rooms: {}, doors: [], wet: [], materials: {} });
        this.floor = plan.floors.length - 1;
        this.selection = null;
        this.markDirty();
        this.render();
    }

    removeFloor() {
        const plan = this.current.plan;
        const index = this.floor === 'roof' ? plan.floors.length - 1 : this.floor;
        plan.floors.splice(index, 1);
        plan.stairs = plan.stairs.filter(stair => stair.floor < plan.floors.length);
        this.floor = Math.max(0, index - 1);
        this.selection = null;
        this.markDirty();
        this.render();
    }

    /** What is selected, or what the tool does: one strip under the plan. */
    renderInspector() {
        const box = this._detail?.querySelector('.rr-structures-inspector');
        if (!box || !this.current) return;
        const tt = text => this._t(text);
        const plan = this.current.plan;
        const floor = this.currentFloor();
        const materialNames = this.materials();
        const ownOptions = [['', tt("Building's own")]].concat(materialNames.map(name => [name, name]));
        const field = (text, control) => `<label style="display:flex;align-items:center;gap:6px;color:var(--color-text-muted);">${text}${control}</label>`;
        const remove = `<button type="button" class="rr-btn-secondary rr-structures-remove-selection" style="margin-left:auto;">${tt('Remove')}</button>`;
        const sel = this.selection;
        let html = '';
        if (sel && sel.kind === 'room' && floor && floor.rooms[sel.key]) {
            const own = floor.materials[sel.key] || { floor: '', wall: '' };
            html = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                ${field(tt('Room'), `<input type="text" class="database-field-value rr-structures-room-name" value="${rrEscapeHtml(sel.key)}" style="width:120px;">`)}
                ${field(tt('Room floor'), this._selectHtml('rr-structures-room-material', ownOptions, own.floor, 'data-role="floor" style="width:120px;"'))}
                ${field(tt('Room wall'), this._selectHtml('rr-structures-room-material', ownOptions, own.wall, 'data-role="wall" style="width:120px;"'))}
                ${field(tt('Wet floor'), `<input type="checkbox" class="system-checkbox rr-structures-wet" ${floor.wet.includes(sel.key) ? 'checked' : ''}>`)}
                ${remove}</div>`;
        } else if (sel && sel.kind === 'stair' && plan.stairs[sel.key]) {
            const stair = plan.stairs[sel.key];
            html = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                ${field(tt('Stairs'), `<span>${stair.from[0]}, ${stair.from[1]}</span>`)}
                ${field(tt('Rises'), this._selectHtml('rr-structures-stair-dir', DatabaseStructureEditor.DIRECTIONS.map(dir => [dir, tt(dir)]), stair.dir, 'style="width:110px;"'))}
                ${field(tt('Width'), this._numberHtml('rr-structures-stair-width', stair.width, 'min="1" max="8"'))}
                ${remove}</div>`;
        } else if (sel && sel.kind === 'spot' && plan.spots[sel.key]) {
            const event = plan.events.find(item => item.spot === sel.key) || null;
            const templates = this.eventTemplates();
            html = `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                ${field(tt('Spot'), `<input type="text" class="database-field-value rr-structures-spot-name" value="${rrEscapeHtml(sel.key)}" style="width:120px;">`)}
                ${field(tt('Person'), this._selectHtml('rr-structures-person', [['', tt('Nobody')], ['blank', tt('Blank event')]].concat(templates.map(name => [name, name])), event ? (event.template || 'blank') : '', 'style="width:130px;"'))}
                ${event ? field(tt('Name'), `<input type="text" class="database-field-value rr-structures-person-name" value="${rrEscapeHtml(event.name)}" style="width:120px;">`) : ''}
                ${event ? field(tt('Facing'), this._selectHtml('rr-structures-person-facing', DatabaseStructureEditor.FACINGS.map(([v, l]) => [v, tt(l)]), event.direction, 'style="width:90px;"')) : ''}
                ${remove}</div>`;
        } else {
            const hints = {
                room: tt('Drag on the plan to draw a room. Drag a room to move it, its edge to resize it. Click a wall for a door, an outer wall for the front door. Delete removes the selected room.'),
                door: tt('Click a wall between two rooms for a door, or an outer wall beside a room for the front door. Click it again to take the door away.'),
                stairs: tt('Click a cell inside a room to start stairs there. Each cell climbs one tile, so a storey is that many cells. Click stairs to select them.'),
                spot: tt('Click a cell to name a spot. A person can stand at it, and a story can send someone there.')
            };
            html = `<span style="color:var(--color-text-muted);">${floor ? hints[this.tool] : tt('No floors: a plan of parts, or an empty plan. Add a floor to draw rooms.')}</span>`;
        }
        box.innerHTML = html;
        this.bindInspector(box);
    }

    bindInspector(box) {
        const plan = this.current.plan, floor = this.currentFloor(), sel = this.selection;
        box.querySelector('.rr-structures-room-name')?.addEventListener('change', event => {
            const oldName = sel.key, newName = event.target.value.trim();
            if (!floor || !newName || newName === 'outside' || (newName !== oldName && floor.rooms[newName])) { event.target.value = oldName; return; }
            this.renameRoom(floor, oldName, newName);
            this.selection = { kind: 'room', key: newName };
            this.markDirty(); this.renderInspector();
        });
        for (const input of box.querySelectorAll('.rr-structures-room-material')) {
            input.addEventListener('change', () => {
                const own = floor.materials[sel.key] || (floor.materials[sel.key] = { floor: '', wall: '' });
                own[input.dataset.role] = input.value;
                this.markDirty();
            });
        }
        box.querySelector('.rr-structures-wet')?.addEventListener('change', event => {
            floor.wet = floor.wet.filter(other => other !== sel.key);
            if (event.target.checked) floor.wet.push(sel.key);
            this.markDirty();
        });
        box.querySelector('.rr-structures-stair-dir')?.addEventListener('change', event => { plan.stairs[sel.key].dir = event.target.value; this.markDirty(); });
        box.querySelector('.rr-structures-stair-width')?.addEventListener('input', event => { plan.stairs[sel.key].width = Math.max(1, Math.min(8, Math.floor(Number(event.target.value)) || 1)); this.markDirty(); });
        box.querySelector('.rr-structures-spot-name')?.addEventListener('change', event => {
            const oldName = sel.key, newName = event.target.value.trim();
            if (!newName || (newName !== oldName && plan.spots[newName])) { event.target.value = oldName; return; }
            const entries = Object.entries(plan.spots).map(([name, cell]) => [name === oldName ? newName : name, cell]);
            plan.spots = Object.fromEntries(entries);
            for (const item of plan.events) if (item.spot === oldName) item.spot = newName;
            this.selection = { kind: 'spot', key: newName };
            this.markDirty(); this.renderInspector();
        });
        box.querySelector('.rr-structures-person')?.addEventListener('change', event => {
            const value = event.target.value;
            plan.events = plan.events.filter(item => item.spot !== sel.key);
            if (value) plan.events.push({ spot: sel.key, name: '', template: value === 'blank' ? '' : value, direction: 2 });
            this.markDirty(); this.renderInspector();
        });
        box.querySelector('.rr-structures-person-name')?.addEventListener('input', event => { const item = plan.events.find(e => e.spot === sel.key); if (item) { item.name = event.target.value; this.markDirty(); } });
        box.querySelector('.rr-structures-person-facing')?.addEventListener('change', event => { const item = plan.events.find(e => e.spot === sel.key); if (item) { item.direction = Number(event.target.value); this.markDirty(); } });
        box.querySelector('.rr-structures-remove-selection')?.addEventListener('click', () => this.removeSelection());
    }

    renameRoom(floor, oldName, newName) {
        const entries = Object.entries(floor.rooms).map(([name, rect]) => [name === oldName ? newName : name, rect]);
        floor.rooms = Object.fromEntries(entries);
        floor.doors = floor.doors.map(door => [door[0] === oldName ? newName : door[0], door[1] === oldName ? newName : door[1], door[2]]);
        floor.wet = floor.wet.map(name => (name === oldName ? newName : name));
        if (floor.materials[oldName]) { floor.materials[newName] = floor.materials[oldName]; delete floor.materials[oldName]; }
    }

    removeRoom(name) {
        const floor = this.currentFloor();
        if (!floor || !name || !floor.rooms[name]) return;
        delete floor.rooms[name];
        floor.doors = floor.doors.filter(door => door[0] !== name && door[1] !== name);
        floor.wet = floor.wet.filter(other => other !== name);
        delete floor.materials[name];
        if (this.selection?.kind === 'room' && this.selection.key === name) this.selection = null;
        this.markDirty();
        this.renderInspector();
    }

    removeSelection() {
        const sel = this.selection, plan = this.current?.plan;
        if (!sel || !plan) return;
        if (sel.kind === 'room') return this.removeRoom(sel.key);
        if (sel.kind === 'stair') plan.stairs.splice(sel.key, 1);
        if (sel.kind === 'spot') { delete plan.spots[sel.key]; plan.events = plan.events.filter(item => item.spot !== sel.key); }
        this.selection = null;
        this.markDirty();
        this.renderInspector();
        this.renderMore();
    }

    /** Everything that is a number rather than a shape, behind one fold. */
    renderMore() {
        const more = this._detail?.querySelector('.rr-structures-more');
        if (!more || !this.current) return;
        const tt = text => this._t(text);
        const plan = this.current.plan;
        const materialNames = this.materials();
        const materialOptions = [['', tt('Plain')]].concat(materialNames.map(name => [name, name]));
        const roleLabels = { wall: tt('Wall'), inner: tt('Inner wall'), floor: tt('Floor'), wet: tt('Wet floor'), roof: tt('Roof'), stair: tt('Stair'), path: tt('Path') };
        const styleNames = Object.keys(DatabaseStructureEditor.STYLES);
        const otherPlans = this.records().filter(entry => entry !== this.current.entry).map(entry => [entry.file || entry.name, entry.name]);
        const open = !!this._open.more;
        const rows = (kind, header, body, empty) => `
            <div class="rr-structures-rows" data-rows="${kind}" style="display:grid;grid-template-columns:${header.cols};gap:6px 8px;align-items:center;font-size:11px;">
                ${header.labels.map(label => `<span style="color:var(--color-text-muted);">${label}</span>`).join('')}<span></span>
                ${body || `<span style="grid-column:1 / -1;color:var(--color-text-muted);">${empty}</span>`}
            </div>`;
        const remove = (kind, index) => `<button type="button" class="rr-btn-secondary rr-structures-remove" data-rows="${kind}" data-index="${index}" title="${rrEscapeHtml(tt('Remove'))}">✕</button>`;
        const add = kind => `<button type="button" class="rr-btn-secondary rr-structures-add" data-rows="${kind}">${tt('Add')}</button>`;
        const materialCol = role => `<span class="db-col"><label>${roleLabels[role]}</label>${this._selectHtml('rr-structures-material', materialOptions, plan.materials[role], `data-role="${role}"`)}</span>`;
        const partStyle = part => DatabaseStructureEditor.styleOf(Object.assign({}, DatabaseStructureEditor.styleMaterials('', null), part.materials || {}), null);
        const partsBody = plan.parts.map((part, index) => `
            <input type="text" class="database-field-value rr-structures-part" data-index="${index}" data-prop="name" value="${rrEscapeHtml(part.name)}" style="min-width:0;">
            ${this._selectHtml('rr-structures-part', [['', '']].concat(otherPlans), part.plan, `data-index="${index}" data-prop="plan"`)}
            ${this._numberHtml('rr-structures-part', part.at[0], `data-index="${index}" data-prop="x" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._numberHtml('rr-structures-part', part.at[1], `data-index="${index}" data-prop="y" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)}
            ${this._numberHtml('rr-structures-part', part.rot, `data-index="${index}" data-prop="rot" min="0" max="3"`)}
            ${this._selectHtml('rr-structures-part', [['', tt("Plan's own")]].concat(styleNames.map(name => [name, tt(name)])), Object.values(part.materials || {}).some(Boolean) ? (partStyle(part) || '') : '', `data-index="${index}" data-prop="style"`)}
            ${remove('parts', index)}`).join('');
        const pathsBody = plan.paths.map((strip, index) => `
            ${[0, 1, 2, 3].map(i => this._numberHtml('rr-structures-path', strip[i], `data-index="${index}" data-i="${i}" min="0" max="${DatabaseStructureEditor.SIZE_MAX}"`)).join('')}
            ${this._selectHtml('rr-structures-path', [['', tt('Path material')]].concat(materialNames.map(name => [name, name])), strip[4] || '', `data-index="${index}" data-i="4"`)}
            ${remove('paths', index)}`).join('');
        more.innerHTML = `
            <div class="database-section-header rr-structures-fold" style="display:flex;align-items:center;gap:8px;cursor:pointer;"><span style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">${open ? '▾' : '▸'}</span><span style="flex:1;">${tt('More')}</span><span style="font-weight:normal;color:var(--color-text-muted);font-size:11px;">${tt('Materials, roof, windows, parts')}</span></div>
            <div class="database-section-content" style="${open ? '' : 'display:none;'}">
                <div class="db-form">
                    <div class="db-row-cols">${['wall', 'inner', 'floor', 'wet'].map(materialCol).join('')}</div>
                    <div class="db-row-cols">${['roof', 'stair', 'path'].map(materialCol).join('')}</div>
                    <div class="db-row-cols">
                        <span class="db-col"><label>${tt('Storey (tiles)')}</label>${this._numberHtml('rr-structures-field', plan.storey, 'data-path="storey" min="3" max="12"')}</span>
                        <span class="db-col"><label>${tt('Roof pitch (rows)')}</label>${this._numberHtml('rr-structures-field', plan.roof.pitch, 'data-path="roof.pitch" min="0" max="20"')}</span>
                        <span class="db-col"><label>${tt('A window every (cells)')}</label>${this._numberHtml('rr-structures-field', plan.windows.every, 'data-path="windows.every" min="0" max="60"')}</span>
                        <span class="db-col"><label>${tt('Window width')}</label>${this._numberHtml('rr-structures-field', plan.windows.width, 'data-path="windows.width" min="1" max="8"')}</span>
                    </div>
                    <div style="grid-column:1 / -1;font-size:11px;color:var(--color-text-muted);margin-top:4px;">${tt('Any tileable image under img/materials is a material.')}</div>
                </div>
                <div class="database-field-label" style="font-size:11px;margin-top:10px;">${tt('Parts and paths')}</div>
                <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px;">${tt('A plan can be made of other plans: a hamlet is cottages at corners, turned in quarter turns, with paved paths between.')}</div>
                ${rows('parts', { cols: 'minmax(70px,1fr) minmax(90px,1fr) 64px 64px 64px minmax(90px,1fr) 28px', labels: [tt('Part'), tt('Plan'), 'x', 'y', tt('Turn'), tt('Style')] }, partsBody, tt('No parts.'))}
                <div style="margin:4px 0 10px;">${add('parts')}</div>
                ${rows('paths', { cols: '64px 64px 64px 64px minmax(90px,1fr) 28px', labels: ['x0', 'y0', 'x1', 'y1', tt('Material')] }, pathsBody, tt('No paths.'))}
                <div style="margin-top:4px;">${add('paths')}</div>
            </div>`;
        this.bindMore(more);
    }

    bindMore(more) {
        const plan = this.current.plan;
        const materialNames = this.materials();
        const number = (input, min, max) => Math.max(min, Math.min(max, Math.floor(Number(input.value)) || 0));
        more.querySelector('.rr-structures-fold').addEventListener('click', () => { this._open.more = !this._open.more; this.renderMore(); });
        for (const input of more.querySelectorAll('.rr-structures-material')) {
            input.addEventListener('change', () => { plan.materials[input.dataset.role] = input.value; this.markDirty(); this.renderBar(); });
        }
        for (const input of more.querySelectorAll('.rr-structures-field')) {
            input.addEventListener('input', () => {
                const keys = input.dataset.path.split('.');
                let target = plan;
                for (const key of keys.slice(0, -1)) target = target[key];
                target[keys[keys.length - 1]] = number(input, Number(input.min) || 0, Number(input.max) || DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const input of more.querySelectorAll('.rr-structures-part')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const part = plan.parts[Number(input.dataset.index)];
                const prop = input.dataset.prop;
                if (prop === 'x') part.at[0] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                else if (prop === 'y') part.at[1] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                else if (prop === 'rot') part.rot = number(input, 0, 3);
                else if (prop === 'style') part.materials = input.value ? DatabaseStructureEditor.styleMaterials(input.value, materialNames) : {};
                else part[prop] = input.value;
                this.markDirty();
            });
        }
        for (const input of more.querySelectorAll('.rr-structures-path')) {
            input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => {
                const strip = plan.paths[Number(input.dataset.index)];
                const i = Number(input.dataset.i);
                if (i === 4) { if (input.value) strip[4] = input.value; else strip.length = 4; }
                else strip[i] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const button of more.querySelectorAll('.rr-structures-add')) {
            button.addEventListener('click', () => {
                if (button.dataset.rows === 'parts') plan.parts.push({ name: DatabaseStructureEditor.freshName(plan.parts.map(part => part.name), this._t('part')), plan: '', at: [0, 0], rot: 0, scale: 1, materials: {} });
                else plan.paths.push([0, 0, 0, 0]);
                this._open.more = true;
                this.markDirty(); this.renderMore();
            });
        }
        for (const button of more.querySelectorAll('.rr-structures-remove')) {
            button.addEventListener('click', () => {
                if (button.dataset.rows === 'parts') plan.parts.splice(Number(button.dataset.index), 1); else plan.paths.splice(Number(button.dataset.index), 1);
                this.markDirty(); this.renderMore();
            });
        }
    }

    /**
     * Onto the map: the database saves and closes as OK does, then the
     * 3D-B tab holds this plan in Stamp mode for the next click on the map.
     */
    useOnMap() {
        if (!this.current) return;
        const { entry } = this.current;
        const reactor = window.reactor;
        document.getElementById('database-ok-btn')?.click();
        const started = Date.now();
        const settle = () => {
            const viewer = document.getElementById('database-viewer');
            const closed = !viewer || viewer.style.display === 'none' || viewer.offsetParent === null;
            if ((!closed || !entry.file) && Date.now() - started < 5000) return setTimeout(settle, 100);
            const palette = reactor?.pieceBuilderManager;
            if (!palette || !entry.file) return;
            reactor.tilesetPaletteViewer?.selectLayer?.('P');
            palette.structures?.(true);
            palette.structure = entry.file;
            palette.renderStructures?.(true);
            palette.setMode?.('stamp');
            if (palette.panel) palette._syncPanel?.();
        };
        setTimeout(settle, 100);
    }

    // ---- Drawing on the plan ----------------------------------------------

    /** The plan cell under a canvas pixel, or null outside the plan. */
    cellAt(px, py) {
        const g = this._planGeom, plan = this.current?.plan;
        if (!g || !plan) return null;
        const x = Math.floor((px - g.ox) / g.cell), y = Math.floor((py - g.oy) / g.cell);
        if (x < 0 || y < 0 || x >= plan.size[0] || y >= plan.size[1]) return null;
        return { x, y };
    }

    roomAtCell(x, y, floor = this.currentFloor()) {
        if (!floor) return null;
        for (const [name, r] of Object.entries(floor.rooms)) if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return name;
        return null;
    }

    /**
     * What a press on a cell starts: inside a room, a move; on a room's
     * edge, a resize of that edge; on empty ground, a new room drawn from
     * here. A press that never moves is a click, answered on release.
     */
    beginPlanGesture(cell) {
        const floor = this.currentFloor();
        if (!floor || !cell) return null;
        if (this.tool !== 'room') { this._gesture = { mode: 'click', start: cell, moved: false }; return this._gesture; }
        const room = this.roomAtCell(cell.x, cell.y, floor);
        if (room) {
            const r = floor.rooms[room];
            const edges = { left: cell.x === r[0] && r[2] > r[0], right: cell.x === r[2] && r[2] > r[0], top: cell.y === r[1] && r[3] > r[1], bottom: cell.y === r[3] && r[3] > r[1] };
            const resize = Object.values(edges).some(Boolean);
            this._gesture = { mode: resize ? 'resize' : 'move', room, edges, start: cell, from: r.slice(), moved: false };
            this.selection = { kind: 'room', key: room };
        } else {
            this._gesture = { mode: 'draw', start: cell, rect: [cell.x, cell.y, cell.x, cell.y], moved: false };
        }
        return this._gesture;
    }

    updatePlanGesture(cell) {
        const g = this._gesture, floor = this.currentFloor(), plan = this.current?.plan;
        if (!g || !cell || !floor || !plan) return;
        if (g.mode === 'click') return;
        if (cell.x === g.start.x && cell.y === g.start.y && !g.moved) return;
        g.moved = true;
        const [W, H] = plan.size;
        // A room keeps a wall's width of ground round the outside.
        const clampX = v => Math.max(1, Math.min(W - 2, v)), clampY = v => Math.max(1, Math.min(H - 2, v));
        if (g.mode === 'draw') {
            g.rect = [clampX(Math.min(g.start.x, cell.x)), clampY(Math.min(g.start.y, cell.y)), clampX(Math.max(g.start.x, cell.x)), clampY(Math.max(g.start.y, cell.y))];
        } else if (g.mode === 'move') {
            const r = g.from, w = r[2] - r[0], h = r[3] - r[1];
            const x0 = Math.max(1, Math.min(W - 2 - w, r[0] + cell.x - g.start.x)), y0 = Math.max(1, Math.min(H - 2 - h, r[1] + cell.y - g.start.y));
            floor.rooms[g.room] = [x0, y0, x0 + w, y0 + h];
        } else if (g.mode === 'resize') {
            const r = g.from.slice();
            if (g.edges.left) r[0] = Math.min(clampX(cell.x), r[2]);
            if (g.edges.right) r[2] = Math.max(clampX(cell.x), r[0]);
            if (g.edges.top) r[1] = Math.min(clampY(cell.y), r[3]);
            if (g.edges.bottom) r[3] = Math.max(clampY(cell.y), r[1]);
            floor.rooms[g.room] = r;
        }
        this.schedulePreview();
    }

    endPlanGesture(cell) {
        const g = this._gesture;
        this._gesture = null;
        const floor = this.currentFloor();
        if (!g || !floor) return;
        if (!g.moved) {
            this.clickPlan(g.start);
            return;
        }
        if (g.mode === 'draw') {
            const name = DatabaseStructureEditor.freshName(Object.keys(floor.rooms), this._t('room'));
            floor.rooms[name] = g.rect;
            this.selection = { kind: 'room', key: name };
        }
        this.markDirty();
        this.renderInspector();
    }

    /**
     * A click on the plan, by tool. Room: a room selects itself, a wall
     * cell gets a door. Door: the same, and nothing else. Stairs: stairs
     * here select themselves, a room cell starts new stairs. Spot: a spot
     * here selects itself, any other cell becomes one.
     */
    clickPlan(cell) {
        const plan = this.current?.plan, floor = this.currentFloor();
        if (!plan || !floor) return;
        const room = this.roomAtCell(cell.x, cell.y, floor);
        const floorIndex = this.floor === 'roof' ? plan.floors.length - 1 : this.floor;
        if (this.tool === 'room' || this.tool === 'door') {
            if (room) this.selection = { kind: 'room', key: room };
            else if (!this.toggleDoorAt(cell.x, cell.y)) this.selection = null;
        } else if (this.tool === 'stairs') {
            const index = plan.stairs.findIndex(stair => stair.floor === floorIndex && stair.from[0] === cell.x && stair.from[1] === cell.y);
            if (index >= 0) this.selection = { kind: 'stair', key: index };
            else if (room) { plan.stairs.push({ floor: floorIndex, from: [cell.x, cell.y], dir: 'north', width: 1 }); this.selection = { kind: 'stair', key: plan.stairs.length - 1 }; this.markDirty(); }
            else this.selection = null;
        } else if (this.tool === 'spot') {
            const hit = Object.entries(plan.spots).find(([, at]) => at[0] === cell.x && at[1] === cell.y);
            if (hit) this.selection = { kind: 'spot', key: hit[0] };
            else { const name = DatabaseStructureEditor.freshName(Object.keys(plan.spots), this._t('spot')); plan.spots[name] = [cell.x, cell.y]; this.selection = { kind: 'spot', key: name }; this.markDirty(); }
        }
        this.renderInspector();
        this.schedulePreview();
    }

    /**
     * A door through the wall cell at (x, y): between the two rooms either
     * side of it, or from the one room beside it to outside when the cell is
     * on the plan's edge. The same pair again takes the door away. Doors are
     * centred on the shared wall by the builder, so the click names the
     * wall, not the exact cell. False when the cell is not a wall between anything.
     */
    toggleDoorAt(x, y) {
        const floor = this.currentFloor(), plan = this.current?.plan;
        if (!floor || !plan || this.roomAtCell(x, y, floor)) return false;
        const [W, H] = plan.size;
        const n = this.roomAtCell(x, y - 1, floor), s = this.roomAtCell(x, y + 1, floor), w = this.roomAtCell(x - 1, y, floor), e = this.roomAtCell(x + 1, y, floor);
        let pair = null;
        if (n && s && n !== s) pair = [n, s];
        else if (w && e && w !== e) pair = [w, e];
        else if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
            const beside = [n, s, w, e].filter(Boolean);
            if (beside.length) pair = [beside[0], 'outside'];
        }
        if (!pair) return false;
        const index = floor.doors.findIndex(door => (door[0] === pair[0] && door[1] === pair[1]) || (door[0] === pair[1] && door[1] === pair[0]));
        if (index >= 0) floor.doors.splice(index, 1); else floor.doors.push([pair[0], pair[1], this.doorWidth]);
        this.markDirty();
        return true;
    }

    _bindPlanGestures(canvas) {
        if (!canvas) return;
        const cellOf = event => { const rect = canvas.getBoundingClientRect(); return this.cellAt(event.clientX - rect.left, event.clientY - rect.top); };
        canvas.addEventListener('pointerdown', event => {
            if (event.button !== 0 || this.floor === 'roof') return;
            const cell = cellOf(event);
            if (!cell) return;
            canvas.focus?.();
            if (this.beginPlanGesture(cell)) { canvas.setPointerCapture?.(event.pointerId); this.schedulePreview(); }
        });
        canvas.addEventListener('pointermove', event => { if (this._gesture) this.updatePlanGesture(cellOf(event) || this._gesture.start); });
        const finish = event => { if (this._gesture) this.endPlanGesture(cellOf(event)); };
        canvas.addEventListener('pointerup', finish);
        canvas.addEventListener('pointercancel', finish);
        canvas.addEventListener('keydown', event => {
            if ((event.key === 'Delete' || event.key === 'Backspace') && this.selection) { event.preventDefault(); this.removeSelection(); }
        });
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
        const width = Math.max(1, Math.round(rect.width || 320)), height = Math.max(1, Math.round(rect.height || 320));
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const size = Math.min(width, height);
        const ctx = canvas.getContext('2d');
        const colours = typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? name => ThemeColors.resolve(name) : name => ({ '--color-bg-panel': '#1e1e1e', '--color-border': '#3a3a3a', '--color-text': '#e0e0e0', '--color-text-muted': '#9a9a9a', '--color-accent': '#5b8def' })[name] || '#888';
        ctx.fillStyle = colours('--color-bg-panel');
        ctx.fillRect(0, 0, width, height);
        const plan = this.current?.plan;
        if (!plan || !report) return;
        const [W, H] = plan.size;
        const cell = Math.max(2, Math.floor((size - 40) / Math.max(W, H)));
        const ox = Math.floor((width - cell * W) / 2), oy = Math.floor((height - cell * H) / 2);
        this._planGeom = { ox, oy, cell };
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
        const floorNow = this.currentFloor(), sel = this.selection;
        ctx.strokeStyle = colours('--color-accent'); ctx.lineWidth = 2;
        if (floorNow && this.floor !== 'roof' && sel?.kind === 'room' && floorNow.rooms[sel.key]) {
            const r = floorNow.rooms[sel.key];
            ctx.strokeRect(ox + r[0] * cell + 1, oy + r[1] * cell + 1, (r[2] - r[0] + 1) * cell - 2, (r[3] - r[1] + 1) * cell - 2);
        } else if (sel?.kind === 'stair' && plan.stairs[sel.key]) {
            const s = plan.stairs[sel.key];
            ctx.strokeRect(ox + s.from[0] * cell + 1, oy + s.from[1] * cell + 1, cell - 2, cell - 2);
        } else if (sel?.kind === 'spot' && plan.spots[sel.key]) {
            const at = plan.spots[sel.key];
            ctx.beginPath(); ctx.arc(ox + (at[0] + 0.5) * cell, oy + (at[1] + 0.5) * cell, Math.max(4, cell * 0.5), 0, Math.PI * 2); ctx.stroke();
        }
        ctx.lineWidth = 1;
        if (this._gesture && this._gesture.mode === 'draw' && this._gesture.moved) {
            const r = this._gesture.rect;
            ctx.setLineDash([4, 3]); ctx.strokeStyle = colours('--color-accent');
            ctx.strokeRect(ox + r[0] * cell + 0.5, oy + r[1] * cell + 0.5, (r[2] - r[0] + 1) * cell, (r[3] - r[1] + 1) * cell);
            ctx.setLineDash([]);
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
