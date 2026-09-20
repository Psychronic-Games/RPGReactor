/**
 * DatabaseStructureEditor - Database > Structures.
 *
 * A structure plan is one record of the database, backed by a file under
 * the project's 3d/Structures folder: a building as a person describes it
 * (rooms as rectangles, doors between named rooms, windows, stairs, named
 * spots and the people at them), or a plan of plans. The palette's 3D-B
 * tab stamps the same files and `build-structure.cjs` builds them from a
 * shell, so what this page saves is what everything else reads.
 *
 * The page is the building. A strip of tools down the left (select, room,
 * door, window, stairs, person, undo, redo), the plan drawn from above
 * filling one pane and the whole building in 3D filling the other, one
 * line under them for whatever is selected, and one fold for the numbers.
 * Everything placed can be picked up again: a room moves and resizes, a
 * door slides along its wall, a window along the outside, stairs and
 * people go anywhere, and Undo takes any of it back.
 */
class DatabaseStructureEditor {
    static MATERIAL_ROLES = ['wall', 'inner', 'floor', 'wet', 'roof', 'stair', 'path'];
    static DIRECTIONS = ['south', 'north', 'east', 'west'];
    static FACINGS = [[2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];
    static SIZE_MIN = 4;
    static SIZE_MAX = 200;
    static TOOLS = ['select', 'room', 'door', 'window', 'stairs', 'person'];
    static HISTORY = 100;

    constructor(databaseManager, projectController, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this.current = null;
        this.floor = 0;
        this.selection = null;
        this.tool = 'room';
        this._open = {};
        this._gesture = null;
        this._planGeom = null;
        this._history = [];
        this._future = [];
        this._detail = null;
        this._preview = null;
        this._previewTimer = null;
        this._hover = null;
        this._redraw = 0;
        this._reportStale = false;
        this._picker = null;
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

    /** A 16px symbol for a tool, drawn like the map toolbar's: a plain signifier. */
    static icon(name) {
        const open = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">';
        const stroke = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
        const paths = {
            select: `<path d="M3.5 2.5l8.5 6.5-3.8.6 2.4 4.2-1.8 1-2.4-4.2-2.9 2.6z" fill="currentColor"/>`,
            room: `<rect x="2.5" y="2.5" width="11" height="11" rx="1" ${stroke}/>`,
            door: `<path d="M1.5 13.5h3.5M11 13.5h3.5M5 13.5V4.5M5 4.5a6.5 6.5 0 0 1 6 6" ${stroke}/>`,
            window: `<rect x="2.5" y="2.5" width="11" height="11" ${stroke}/><path d="M8 2.5v11M2.5 8h11" ${stroke}/>`,
            stairs: `<path d="M1.5 14.5h4v-4h4v-4h4v-4" ${stroke}/>`,
            person: `<circle cx="8" cy="4.5" r="2.6" fill="currentColor"/><path d="M2.5 14.5a5.5 5.5 0 0 1 11 0z" fill="currentColor"/>`,
            undo: `<path d="M3 7h7a3 3 0 0 1 0 6H6M3 7l3-3M3 7l3 3" ${stroke}/>`,
            redo: `<path d="M13 7H6a3 3 0 0 0 0 6h4M13 7l-3-3M13 7l-3 3" ${stroke}/>`,
            remove: `<path d="M4 4l8 8M12 4l-8 8" ${stroke}/>`,
            north: `<path d="M8 13V3M4 7l4-4 4 4" ${stroke}/>`,
            south: `<path d="M8 3v10M4 9l4 4 4-4" ${stroke}/>`,
            west: `<path d="M13 8H3M7 4L3 8l4 4" ${stroke}/>`,
            east: `<path d="M3 8h10M9 4l4 4-4 4" ${stroke}/>`
        };
        return open + (paths[name] || '') + '</svg>';
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
            doors: (floor?.doors || []).filter(Array.isArray).map(door => {
                const out = [String(door[0] || ''), String(door[1] || 'outside'), int(door[2], 3, 1, 12)];
                if (door.length > 3 && Number.isFinite(Number(door[3]))) out.push(int(door[3], 0, 0, this.SIZE_MAX));
                return out;
            }),
            windows: (floor?.windows || []).filter(Array.isArray).map(cell => [int(cell[0], 0, 0, this.SIZE_MAX), int(cell[1], 0, 0, this.SIZE_MAX)]),
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
            if (floor.windows.length) f.windows = floor.windows.map(cell => cell.slice());
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

    /**
     * One record's plan, edited in place: the database's list, clipboard,
     * undo of whole records and Apply see every change as they do for any
     * other record. Undo here is finer: every placement on the plan.
     */
    showStructureDetail(detailEl, entry) {
        this._detail = detailEl;
        entry.plan = DatabaseStructureEditor.normalizePlan(entry.plan || DatabaseStructureEditor.newPlan(entry.name || 'Plan'));
        if (entry.name) entry.plan.name = entry.name;
        this.current = { entry, plan: entry.plan };
        this.floor = 0;
        this.selection = null;
        this._history = [];
        this._future = [];
        const tt = text => this._t(text);
        detailEl.innerHTML = `
            <div class="rr-structures" style="display:flex;flex-direction:column;height:100%;min-height:0;font-size:12px;">
                <div class="rr-structures-bar" style="display:flex;align-items:center;gap:14px;padding:6px 10px;border-bottom:1px solid var(--color-border);flex-wrap:wrap;"></div>
                <div style="display:flex;flex:1;min-height:220px;">
                    <div class="rr-structures-tools" style="width:40px;flex:0 0 40px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 0;border-right:1px solid var(--color-border);background:var(--color-bg-menubar);"></div>
                    <div style="flex:1;min-width:0;position:relative;background:var(--color-bg-panel);">
                        <canvas class="rr-structures-plan" tabindex="0" style="position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;outline:none;"></canvas>
                        <div class="rr-structures-floors" style="position:absolute;top:6px;left:8px;display:flex;gap:3px;align-items:center;"></div>
                    </div>
                    <div style="flex:1;min-width:0;position:relative;border-left:1px solid var(--color-border);background:var(--color-bg-deep);">
                        <canvas class="rr-structures-3d" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab;"></canvas>
                        <div class="rr-structures-report" style="position:absolute;left:8px;bottom:8px;right:8px;padding:6px 8px;font-size:11px;line-height:1.4;color:var(--color-text-muted);background:color-mix(in srgb, var(--color-bg-panel) 85%, transparent);border-radius:3px;pointer-events:none;"></div>
                    </div>
                </div>
                <div class="rr-structures-inspector" style="border-top:1px solid var(--color-border);padding:6px 10px;min-height:34px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;"></div>
                <div class="rr-structures-more" style="border-top:1px solid var(--color-border);max-height:38%;overflow-y:auto;flex:0 0 auto;"></div>
            </div>`;
        this._bindOrbit(detailEl.querySelector('.rr-structures-3d'));
        this._bindPlanGestures(detailEl.querySelector('.rr-structures-plan'));
        this.render();
    }

    render() {
        this.renderBar();
        this.renderTools();
        this.renderFloorTabs();
        this.renderInspector();
        this.renderMore();
        this.schedulePreview();
    }

    // ---- History ---------------------------------------------------------

    /** Before a change: the plan as it is, so Undo can bring it back. */
    pushHistory() {
        if (!this.current) return;
        this._history.push(JSON.stringify(this.current.plan));
        if (this._history.length > DatabaseStructureEditor.HISTORY) this._history.shift();
        this._future.length = 0;
    }

    undo() {
        if (!this.current || !this._history.length) return false;
        this._future.push(JSON.stringify(this.current.plan));
        this.restore(this._history.pop());
        return true;
    }

    redo() {
        if (!this.current || !this._future.length) return false;
        this._history.push(JSON.stringify(this.current.plan));
        this.restore(this._future.pop());
        return true;
    }

    /** The plan object stays the record's own; only its contents change. */
    restore(json) {
        const plan = this.current.plan;
        const next = DatabaseStructureEditor.normalizePlan(JSON.parse(json));
        for (const key of Object.keys(plan)) delete plan[key];
        Object.assign(plan, next);
        this.current.entry.name = plan.name;
        this.parentEditor?.refreshDatabaseListLabel?.(this.current.entry, 'structures');
        if (this.floor !== 'roof') this.floor = Math.max(0, Math.min(plan.floors.length - 1, this.floor));
        this.selection = null;
        this.parentEditor?._markDatabaseMutation?.();
        this.render();
    }

    /** An edit: the database owns the dirty state; the previews follow. */
    markDirty() {
        if (!this.current) return;
        this.parentEditor?._markDatabaseMutation?.();
        this._reportStale = true;
        this.renderTools();
        this.requestPlanRedraw();
        this.schedulePreview();
    }

    setName(name) {
        const { entry, plan } = this.current;
        entry.name = name;
        plan.name = name;
        this.parentEditor?.refreshDatabaseListLabel?.(entry, 'structures');
        this.parentEditor?._markDatabaseMutation?.();
    }

    currentFloor() {
        const plan = this.current?.plan;
        if (!plan) return null;
        return plan.floors[this.floor === 'roof' ? plan.floors.length - 1 : this.floor] || null;
    }

    currentFloorIndex() {
        const plan = this.current?.plan;
        return this.floor === 'roof' ? plan.floors.length - 1 : this.floor;
    }

    _selectHtml(cls, options, value, attrs = '') {
        return `<select class="database-field-value ${cls}" ${attrs}>${options.map(([v, label]) => `<option value="${rrEscapeHtml(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`).join('')}</select>`;
    }

    _numberHtml(cls, value, attrs = '') {
        return `<input type="number" class="database-field-value ${cls}" value="${Number(value)}" step="1" style="width:52px;" ${attrs}>`;
    }

    /**
     * A material as a swatch: the image itself, or a plain square, and the
     * name. Clicking opens a grid of every material in the project.
     * `blank` names what the empty choice means here (plain, or the
     * building's own).
     */
    _materialPickerHtml(cls, value, attrs, blank) {
        const url = value ? this.materialUrl(value) : null;
        const face = url ? `<img src="${rrEscapeHtml(url)}" alt="" draggable="false" style="width:22px;height:22px;object-fit:cover;border-radius:3px;display:block;pointer-events:none;">`
            : `<span style="width:22px;height:22px;border-radius:3px;background:var(--color-bg-deep);border:1px dashed var(--color-border-input);display:block;"></span>`;
        return `<button type="button" class="rr-btn-secondary rr-structures-material-pick ${cls}" data-value="${rrEscapeHtml(value || '')}" data-blank="${rrEscapeHtml(blank)}" ${attrs} style="display:inline-flex;align-items:center;gap:6px;padding:2px 8px 2px 2px;height:28px;text-transform:none;font-size:12px;max-width:150px;">${face}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${rrEscapeHtml(value || blank)}</span></button>`;
    }

    /** The grid under a swatch button; a click chooses, Escape or a click elsewhere closes. */
    openMaterialPicker(button, onPick) {
        this.closeMaterialPicker();
        const blank = button.dataset.blank || '';
        const current = button.dataset.value || '';
        const names = this.materials();
        const swatch = (name, inner, title) => `<button type="button" class="rr-structures-swatch" data-name="${rrEscapeHtml(name)}" title="${rrEscapeHtml(title)}" aria-checked="${name === current}" style="width:44px;height:44px;padding:0;border-radius:4px;border:2px solid ${name === current ? 'var(--color-accent)' : 'var(--color-border-input)'};background:var(--color-bg-deep);overflow:hidden;cursor:pointer;">${inner}</button>`;
        const grid = document.createElement('div');
        grid.className = 'rr-structures-picker';
        grid.setAttribute('role', 'listbox');
        grid.style.cssText = 'position:fixed;z-index:10020;display:grid;grid-template-columns:repeat(6, 44px);gap:4px;padding:8px;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:4px;box-shadow:0 6px 18px rgba(0,0,0,.35);';
        grid.innerHTML = swatch('', `<span style="display:block;width:100%;height:100%;border:1px dashed var(--color-border-input);box-sizing:border-box;"></span>`, blank)
            + names.map(name => swatch(name, `<img src="${rrEscapeHtml(this.materialUrl(name) || '')}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;">`, name)).join('')
            + `<div style="grid-column:1 / -1;font-size:11px;color:var(--color-text-muted);padding-top:2px;">${rrEscapeHtml(this._t('Any tileable image under img/materials is a material.'))}</div>`;
        const rect = button.getBoundingClientRect();
        grid.style.left = Math.max(8, Math.min(window.innerWidth - 300, rect.left)) + 'px';
        grid.style.top = (rect.bottom + 4 + 260 > window.innerHeight ? rect.top - 4 - 260 : rect.bottom + 4) + 'px';
        document.body.appendChild(grid);
        for (const el of grid.querySelectorAll('.rr-structures-swatch')) el.addEventListener('click', () => { onPick(el.dataset.name); this.closeMaterialPicker(); });
        const away = event => { if (!grid.contains(event.target) && event.target !== button) this.closeMaterialPicker(); };
        const key = event => { if (event.key === 'Escape') this.closeMaterialPicker(); };
        setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); }, 0);
        this._picker = { grid, away, key };
    }

    closeMaterialPicker() {
        const picker = this._picker;
        if (!picker) return;
        document.removeEventListener('pointerdown', picker.away, true);
        document.removeEventListener('keydown', picker.key, true);
        picker.grid.remove();
        this._picker = null;
    }

    _field(text, control) {
        return `<label style="display:flex;align-items:center;gap:6px;color:var(--color-text-muted);white-space:nowrap;">${text}${control}</label>`;
    }

    /** Name, style and size on the left; the way onto the map on the right. */
    renderBar() {
        const bar = this._detail?.querySelector('.rr-structures-bar');
        if (!bar || !this.current) return;
        const tt = text => this._t(text);
        const { plan } = this.current;
        const materialNames = this.materials();
        const styleNames = Object.keys(DatabaseStructureEditor.STYLES);
        const style = DatabaseStructureEditor.styleOf(plan.materials, materialNames);
        bar.innerHTML = `
            ${this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-name" value="${rrEscapeHtml(plan.name)}" style="width:150px;">`)}
            ${this._field(tt('Style'), this._selectHtml('rr-structures-style', styleNames.map(name => [name, tt(name)]).concat([['', tt('Custom')]]), style || '', 'style="width:140px;"'))}
            ${this._field(tt('Size'), `${this._numberHtml('rr-structures-size', plan.size[0], `data-i="0" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}"`)}<span>×</span>${this._numberHtml('rr-structures-size', plan.size[1], `data-i="1" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}"`)}`)}
            <button type="button" class="rr-btn-secondary rr-structures-use" style="margin-left:auto;">${tt('Use on the map')}</button>`;
        bar.querySelector('.rr-structures-name').addEventListener('input', event => this.setName(event.target.value));
        bar.querySelector('.rr-structures-style').addEventListener('change', event => {
            if (!event.target.value) return;
            this.pushHistory();
            Object.assign(plan.materials, DatabaseStructureEditor.styleMaterials(event.target.value, materialNames));
            this.markDirty();
            this.renderMore();
        });
        for (const input of bar.querySelectorAll('.rr-structures-size')) {
            input.addEventListener('change', () => {
                this.pushHistory();
                plan.size[Number(input.dataset.i)] = Math.max(DatabaseStructureEditor.SIZE_MIN, Math.min(DatabaseStructureEditor.SIZE_MAX, Math.floor(Number(input.value)) || DatabaseStructureEditor.SIZE_MIN));
                this.markDirty();
            });
        }
        bar.querySelector('.rr-structures-use').addEventListener('click', () => this.useOnMap());
    }

    /** The tool strip: what a press on empty ground makes, and undo, redo, remove. */
    renderTools() {
        const strip = this._detail?.querySelector('.rr-structures-tools');
        if (!strip || !this.current) return;
        const tt = text => this._t(text);
        const labels = { select: tt('Select'), room: tt('Room'), door: tt('Door'), window: tt('Window'), stairs: tt('Stairs'), person: tt('Person') };
        const button = (name, title, extra = '') => `<button type="button" class="rr-btn-secondary rr-structures-tool" data-tool="${name}" title="${rrEscapeHtml(title)}" aria-label="${rrEscapeHtml(title)}" style="width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center;${extra}">${DatabaseStructureEditor.icon(name)}</button>`;
        strip.innerHTML = DatabaseStructureEditor.TOOLS.map(name => button(name, labels[name], name === this.tool ? 'border-color:var(--color-accent);background:var(--color-bg-hover);color:var(--color-text-strong);' : ''))
            .join('')
            + `<span style="height:1px;width:22px;background:var(--color-border);margin:4px 0;"></span>`
            + button('undo', tt('Undo'), this._history.length ? '' : 'opacity:.4;')
            + button('redo', tt('Redo'), this._future.length ? '' : 'opacity:.4;')
            + button('remove', tt('Remove'), this.selection ? '' : 'opacity:.4;');
        for (const el of strip.querySelectorAll('.rr-structures-tool')) {
            el.addEventListener('click', () => {
                const name = el.dataset.tool;
                if (name === 'undo') return this.undo();
                if (name === 'redo') return this.redo();
                if (name === 'remove') return this.removeSelection();
                this.tool = name;
                this.renderTools();
                this.renderInspector();
            });
        }
    }

    renderFloorTabs() {
        const strip = this._detail?.querySelector('.rr-structures-floors');
        if (!strip) return;
        const plan = this.current?.plan;
        if (!plan) { strip.innerHTML = ''; return; }
        const tt = text => this._t(text);
        const count = plan.floors.length;
        const tab = (value, text, pressed, title = '') => `<button type="button" class="rr-btn-secondary rr-structures-floor-tab" data-floor="${value}" aria-pressed="${pressed}" title="${rrEscapeHtml(title)}" style="font-size:11px;padding:2px 7px;${pressed ? 'font-weight:bold;border-color:var(--color-accent);' : ''}">${text}</button>`;
        strip.innerHTML = `<span style="font-size:11px;color:var(--color-text-muted);margin-right:3px;">${tt('Floor')}</span>`
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
                this.renderFloorTabs(); this.renderInspector(); this.renderTools(); this.schedulePreview();
            });
        }
    }

    addFloor() {
        const plan = this.current.plan;
        this.pushHistory();
        // A new floor copies the one below it: the rooms usually line up, and a landing is easier to trim than to draw.
        const below = plan.floors[plan.floors.length - 1];
        plan.floors.push(below ? { rooms: Object.fromEntries(Object.entries(below.rooms).map(([name, rect]) => [name, rect.slice()])), doors: below.doors.filter(door => door[1] !== 'outside' && door[0] !== 'outside').map(door => door.slice()), wet: [], materials: {}, windows: [] }
            : { rooms: {}, doors: [], wet: [], materials: {}, windows: [] });
        this.floor = plan.floors.length - 1;
        this.selection = null;
        this.markDirty();
        this.render();
    }

    removeFloor() {
        const plan = this.current.plan;
        const index = this.currentFloorIndex();
        this.pushHistory();
        plan.floors.splice(index, 1);
        plan.stairs = plan.stairs.filter(stair => stair.floor < plan.floors.length);
        this.floor = Math.max(0, index - 1);
        this.selection = null;
        this.markDirty();
        this.render();
    }

    /** What is selected, in a line; or what the tool does, in a sentence. */
    renderInspector() {
        const box = this._detail?.querySelector('.rr-structures-inspector');
        if (!box || !this.current) return;
        const tt = text => this._t(text);
        const plan = this.current.plan;
        const floor = this.currentFloor();
        const materialNames = this.materials();
        const arrows = (cls, current) => `<span style="display:inline-flex;gap:2px;">${DatabaseStructureEditor.DIRECTIONS.map(dir => `<button type="button" class="rr-btn-secondary ${cls}" data-dir="${dir}" title="${rrEscapeHtml(tt(dir))}" aria-pressed="${dir === current}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;${dir === current ? 'border-color:var(--color-accent);' : ''}">${DatabaseStructureEditor.icon(dir)}</button>`).join('')}</span>`;
        const facingArrows = (cls, current) => `<span style="display:inline-flex;gap:2px;">${[[8, 'north'], [4, 'west'], [6, 'east'], [2, 'south']].map(([value, dir]) => `<button type="button" class="rr-btn-secondary ${cls}" data-facing="${value}" title="${rrEscapeHtml(tt(DatabaseStructureEditor.FACINGS.find(([v]) => v === value)[1]))}" aria-pressed="${value === current}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;${value === current ? 'border-color:var(--color-accent);' : ''}">${DatabaseStructureEditor.icon(dir)}</button>`).join('')}</span>`;
        const sel = this.selection;
        const kindLabel = text => `<span style="font-weight:600;color:var(--color-text-strong);">${text}</span>`;
        let html = '';
        if (sel && sel.kind === 'room' && floor && floor.rooms[sel.key]) {
            const own = floor.materials[sel.key] || { floor: '', wall: '' };
            html = `${kindLabel(tt('Room'))}
                ${this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-room-name" value="${rrEscapeHtml(sel.key)}" style="width:110px;">`)}
                ${this._field(tt('Floor'), this._materialPickerHtml('rr-structures-room-material', own.floor, 'data-role="floor"', tt("Building's own")))}
                ${this._field(tt('Wall'), this._materialPickerHtml('rr-structures-room-material', own.wall, 'data-role="wall"', tt("Building's own")))}
                ${this._field(tt('Wet'), `<input type="checkbox" class="system-checkbox rr-structures-wet" ${floor.wet.includes(sel.key) ? 'checked' : ''}>`)}`;
        } else if (sel && sel.kind === 'door' && floor && floor.doors[sel.key]) {
            const door = floor.doors[sel.key];
            html = `${kindLabel(door[0] === 'outside' || door[1] === 'outside' ? tt('Front door') : tt('Door'))}
                <span style="color:var(--color-text-muted);">${rrEscapeHtml(door[0])} ↔ ${rrEscapeHtml(door[1] === 'outside' ? tt('Outside') : door[1])}</span>
                ${this._field(tt('Width'), this._numberHtml('rr-structures-door-width', door[2], 'min="1" max="12"'))}`;
        } else if (sel && sel.kind === 'window' && floor && floor.windows[sel.key]) {
            html = `${kindLabel(tt('Window'))}<span style="color:var(--color-text-muted);">${tt('Drag it along the wall.')}</span>`;
        } else if (sel && sel.kind === 'stair' && plan.stairs[sel.key]) {
            const stair = plan.stairs[sel.key];
            html = `${kindLabel(tt('Stairs'))}
                ${this._field(tt('Rises'), arrows('rr-structures-stair-dir', stair.dir))}
                ${this._field(tt('Width'), this._numberHtml('rr-structures-stair-width', stair.width, 'min="1" max="8"'))}`;
        } else if (sel && sel.kind === 'spot' && plan.spots[sel.key]) {
            const event = plan.events.find(item => item.spot === sel.key) || null;
            const templates = this.eventTemplates();
            html = `${kindLabel(tt('Person'))}
                ${this._field(tt('Spot'), `<input type="text" class="database-field-value rr-structures-spot-name" value="${rrEscapeHtml(sel.key)}" style="width:100px;">`)}
                ${this._field(tt('Who'), this._selectHtml('rr-structures-person', [['', tt('Nobody')], ['blank', tt('Blank event')]].concat(templates.map(name => [name, name])), event ? (event.template || 'blank') : '', 'style="width:120px;"'))}
                ${event ? this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-person-name" value="${rrEscapeHtml(event.name)}" style="width:110px;">`) : ''}
                ${event ? this._field(tt('Facing'), facingArrows('rr-structures-person-facing', event.direction)) : ''}`;
        } else {
            const hints = {
                select: tt('Click anything on the plan to select it, drag to move it. Delete removes it.'),
                room: tt('Drag on the plan to draw a room. Drag a room to move it, its edge to resize it.'),
                door: tt('Click a wall between two rooms for a door, an outer wall beside a room for the front door. Drag a door along its wall.'),
                window: tt('Click an outer wall for a window. Drag a window along the wall.'),
                stairs: tt('Click a cell inside a room to start stairs there. Each cell climbs one tile.'),
                person: tt('Click a cell to put a person there. Pick who from the templates under 3d/Structures/events.')
            };
            html = `<span style="color:var(--color-text-muted);">${floor ? hints[this.tool] : tt('No floors: a plan of parts, or an empty plan. Add a floor to draw rooms.')}</span>`;
        }
        box.innerHTML = html;
        this.bindInspector(box);
    }

    bindInspector(box) {
        const plan = this.current.plan, floor = this.currentFloor(), sel = this.selection;
        const number = (input, min, max) => Math.max(min, Math.min(max, Math.floor(Number(input.value)) || min));
        box.querySelector('.rr-structures-room-name')?.addEventListener('change', event => {
            const oldName = sel.key, newName = event.target.value.trim();
            if (!floor || !newName || newName === 'outside' || (newName !== oldName && floor.rooms[newName])) { event.target.value = oldName; return; }
            this.pushHistory();
            this.renameRoom(floor, oldName, newName);
            this.selection = { kind: 'room', key: newName };
            this.markDirty(); this.renderInspector();
        });
        for (const button of box.querySelectorAll('.rr-structures-room-material')) {
            button.addEventListener('click', () => this.openMaterialPicker(button, name => {
                this.pushHistory();
                const own = floor.materials[sel.key] || (floor.materials[sel.key] = { floor: '', wall: '' });
                own[button.dataset.role] = name;
                this.markDirty(); this.renderInspector();
            }));
        }
        box.querySelector('.rr-structures-wet')?.addEventListener('change', event => {
            this.pushHistory();
            floor.wet = floor.wet.filter(other => other !== sel.key);
            if (event.target.checked) floor.wet.push(sel.key);
            this.markDirty();
        });
        box.querySelector('.rr-structures-door-width')?.addEventListener('change', event => { this.pushHistory(); floor.doors[sel.key][2] = number(event.target, 1, 12); this.markDirty(); });
        for (const button of box.querySelectorAll('.rr-structures-stair-dir')) button.addEventListener('click', () => { this.pushHistory(); plan.stairs[sel.key].dir = button.dataset.dir; this.markDirty(); this.renderInspector(); });
        box.querySelector('.rr-structures-stair-width')?.addEventListener('change', event => { this.pushHistory(); plan.stairs[sel.key].width = number(event.target, 1, 8); this.markDirty(); });
        box.querySelector('.rr-structures-spot-name')?.addEventListener('change', event => {
            const oldName = sel.key, newName = event.target.value.trim();
            if (!newName || (newName !== oldName && plan.spots[newName])) { event.target.value = oldName; return; }
            this.pushHistory();
            plan.spots = Object.fromEntries(Object.entries(plan.spots).map(([name, cell]) => [name === oldName ? newName : name, cell]));
            for (const item of plan.events) if (item.spot === oldName) item.spot = newName;
            this.selection = { kind: 'spot', key: newName };
            this.markDirty(); this.renderInspector();
        });
        box.querySelector('.rr-structures-person')?.addEventListener('change', event => {
            this.pushHistory();
            const value = event.target.value;
            const had = plan.events.find(item => item.spot === sel.key);
            plan.events = plan.events.filter(item => item.spot !== sel.key);
            if (value) plan.events.push({ spot: sel.key, name: had ? had.name : '', template: value === 'blank' ? '' : value, direction: had ? had.direction : 2 });
            this.markDirty(); this.renderInspector();
        });
        box.querySelector('.rr-structures-person-name')?.addEventListener('change', event => { const item = plan.events.find(e => e.spot === sel.key); if (item) { this.pushHistory(); item.name = event.target.value; this.markDirty(); } });
        for (const button of box.querySelectorAll('.rr-structures-person-facing')) button.addEventListener('click', () => { const item = plan.events.find(e => e.spot === sel.key); if (item) { this.pushHistory(); item.direction = Number(button.dataset.facing); this.markDirty(); this.renderInspector(); } });
    }

    renameRoom(floor, oldName, newName) {
        floor.rooms = Object.fromEntries(Object.entries(floor.rooms).map(([name, rect]) => [name === oldName ? newName : name, rect]));
        floor.doors = floor.doors.map(door => [door[0] === oldName ? newName : door[0], door[1] === oldName ? newName : door[1], ...door.slice(2)]);
        floor.wet = floor.wet.map(name => (name === oldName ? newName : name));
        if (floor.materials[oldName]) { floor.materials[newName] = floor.materials[oldName]; delete floor.materials[oldName]; }
    }

    removeSelection() {
        const sel = this.selection, plan = this.current?.plan, floor = this.currentFloor();
        if (!sel || !plan) return;
        this.pushHistory();
        if (sel.kind === 'room' && floor) {
            delete floor.rooms[sel.key];
            floor.doors = floor.doors.filter(door => door[0] !== sel.key && door[1] !== sel.key);
            floor.wet = floor.wet.filter(other => other !== sel.key);
            delete floor.materials[sel.key];
        } else if (sel.kind === 'door' && floor) floor.doors.splice(sel.key, 1);
        else if (sel.kind === 'window' && floor) floor.windows.splice(sel.key, 1);
        else if (sel.kind === 'stair') plan.stairs.splice(sel.key, 1);
        else if (sel.kind === 'spot') { delete plan.spots[sel.key]; plan.events = plan.events.filter(item => item.spot !== sel.key); }
        this.selection = null;
        this.markDirty();
        this.renderInspector();
        this.renderMore();
    }

    /** The numbers, behind one fold: materials, storey, roof, windows, parts and paths. */
    renderMore() {
        const more = this._detail?.querySelector('.rr-structures-more');
        if (!more || !this.current) return;
        const tt = text => this._t(text);
        const plan = this.current.plan;
        const materialNames = this.materials();
        const roleLabels = { wall: tt('Wall'), inner: tt('Inner wall'), floor: tt('Floor'), wet: tt('Wet floor'), roof: tt('Roof'), stair: tt('Stair'), path: tt('Path') };
        const styleNames = Object.keys(DatabaseStructureEditor.STYLES);
        const otherPlans = this.records().filter(entry => entry !== this.current.entry).map(entry => [entry.file || entry.name, entry.name]);
        const open = !!this._open.more;
        const row = (...fields) => `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:4px 0;">${fields.join('')}</div>`;
        const rows = (kind, header, body, empty) => `
            <div class="rr-structures-rows" data-rows="${kind}" style="display:grid;grid-template-columns:${header.cols};gap:4px 8px;align-items:center;font-size:11px;">
                ${header.labels.map(label => `<span style="color:var(--color-text-muted);">${label}</span>`).join('')}<span></span>
                ${body || `<span style="grid-column:1 / -1;color:var(--color-text-muted);">${empty}</span>`}
            </div>`;
        const remove = (kind, index) => `<button type="button" class="rr-btn-secondary rr-structures-row-remove" data-rows="${kind}" data-index="${index}" title="${rrEscapeHtml(tt('Remove'))}" style="padding:2px 6px;">✕</button>`;
        const add = kind => `<button type="button" class="rr-btn-secondary rr-structures-row-add" data-rows="${kind}" style="padding:2px 8px;font-size:11px;">${tt('Add')}</button>`;
        const materialField = role => this._field(roleLabels[role], this._materialPickerHtml('rr-structures-material', plan.materials[role], `data-role="${role}"`, tt('Plain')));
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
            <div class="sidebar-header rr-structures-fold" style="display:flex;align-items:center;gap:8px;"><span style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">${open ? '▾' : '▸'}</span><span style="flex:1;">${tt('More')}</span><span style="font-weight:normal;text-transform:none;color:var(--color-text-muted);font-size:11px;">${tt('Materials, roof, windows, parts')}</span></div>
            <div class="database-section-content" style="${open ? '' : 'display:none;'}padding:6px 10px 10px;">
                ${row(...['wall', 'inner', 'floor', 'wet'].map(materialField))}
                ${row(...['roof', 'stair', 'path'].map(materialField))}
                ${row(
                    this._field(tt('Storey (tiles)'), this._numberHtml('rr-structures-field', plan.storey, 'data-path="storey" min="3" max="12"')),
                    this._field(tt('Roof pitch (rows)'), this._numberHtml('rr-structures-field', plan.roof.pitch, 'data-path="roof.pitch" min="0" max="20"')),
                    this._field(tt('A window every (cells)'), this._numberHtml('rr-structures-field', plan.windows.every, 'data-path="windows.every" min="0" max="60"')),
                    this._field(tt('Window width'), this._numberHtml('rr-structures-field', plan.windows.width, 'data-path="windows.width" min="1" max="8"'))
                )}
                <div style="font-size:11px;color:var(--color-text-muted);">${tt('Any tileable image under img/materials is a material.')} ${tt('A window every 0 cells means only the windows you place.')}</div>
                <div class="database-field-label" style="font-size:11px;margin-top:10px;">${tt('Parts and paths')}</div>
                <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px;">${tt('A plan can be made of other plans: a hamlet is cottages at corners, turned in quarter turns, with paved paths between.')}</div>
                ${rows('parts', { cols: 'minmax(70px,1fr) minmax(90px,1fr) 52px 52px 52px minmax(90px,1fr) 28px', labels: [tt('Part'), tt('Plan'), 'x', 'y', tt('Turn'), tt('Style')] }, partsBody, tt('No parts.'))}
                <div style="margin:4px 0 10px;">${add('parts')}</div>
                ${rows('paths', { cols: '52px 52px 52px 52px minmax(90px,1fr) 28px', labels: ['x0', 'y0', 'x1', 'y1', tt('Material')] }, pathsBody, tt('No paths.'))}
                <div style="margin-top:4px;">${add('paths')}</div>
            </div>`;
        this.bindMore(more);
    }

    bindMore(more) {
        const plan = this.current.plan;
        const materialNames = this.materials();
        const number = (input, min, max) => Math.max(min, Math.min(max, Math.floor(Number(input.value)) || 0));
        more.querySelector('.rr-structures-fold').addEventListener('click', () => { this._open.more = !this._open.more; this.renderMore(); });
        for (const button of more.querySelectorAll('.rr-structures-material')) {
            button.addEventListener('click', () => this.openMaterialPicker(button, name => { this.pushHistory(); plan.materials[button.dataset.role] = name; this.markDirty(); this.renderBar(); this.renderMore(); }));
        }
        for (const input of more.querySelectorAll('.rr-structures-field')) {
            input.addEventListener('change', () => {
                this.pushHistory();
                const keys = input.dataset.path.split('.');
                let target = plan;
                for (const key of keys.slice(0, -1)) target = target[key];
                target[keys[keys.length - 1]] = number(input, Number(input.min) || 0, Number(input.max) || DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const input of more.querySelectorAll('.rr-structures-part')) {
            input.addEventListener('change', () => {
                this.pushHistory();
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
            input.addEventListener('change', () => {
                this.pushHistory();
                const strip = plan.paths[Number(input.dataset.index)];
                const i = Number(input.dataset.i);
                if (i === 4) { if (input.value) strip[4] = input.value; else strip.length = 4; }
                else strip[i] = number(input, 0, DatabaseStructureEditor.SIZE_MAX);
                this.markDirty();
            });
        }
        for (const button of more.querySelectorAll('.rr-structures-row-add')) {
            button.addEventListener('click', () => {
                this.pushHistory();
                if (button.dataset.rows === 'parts') plan.parts.push({ name: DatabaseStructureEditor.freshName(plan.parts.map(part => part.name), this._t('part')), plan: '', at: [0, 0], rot: 0, scale: 1, materials: {} });
                else plan.paths.push([0, 0, 0, 0]);
                this._open.more = true;
                this.markDirty(); this.renderMore();
            });
        }
        for (const button of more.querySelectorAll('.rr-structures-row-remove')) {
            button.addEventListener('click', () => {
                this.pushHistory();
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

    doorCellsOf(index, floor = this.currentFloor()) {
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!SP || !floor || !floor.doors[index]) return [];
        try { return SP.doorCells(floor.rooms, this.current.plan.size, floor.doors[index]); } catch (error) { return []; }
    }

    /** What stands on a cell, nearest to the hand first: a person, stairs, a door, a window, a room. */
    hitAt(x, y) {
        const plan = this.current?.plan, floor = this.currentFloor();
        if (!plan || !floor) return null;
        const floorIndex = this.currentFloorIndex();
        const spot = Object.entries(plan.spots).find(([, at]) => at[0] === x && at[1] === y);
        if (spot) return { kind: 'spot', key: spot[0] };
        const stair = plan.stairs.findIndex(s => s.floor === floorIndex && s.from[0] === x && s.from[1] === y);
        if (stair >= 0) return { kind: 'stair', key: stair };
        for (let i = 0; i < floor.doors.length; i++) if (this.doorCellsOf(i, floor).some(([cx, cy]) => cx === x && cy === y)) return { kind: 'door', key: i };
        const window = floor.windows.findIndex(([wx, wy]) => wx === x && wy === y);
        if (window >= 0) return { kind: 'window', key: window };
        const room = this.roomAtCell(x, y, floor);
        if (room) return { kind: 'room', key: room };
        return null;
    }

    onRing(x, y) {
        const [W, H] = this.current.plan.size;
        const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1);
        return !corner && (x === 0 || x === W - 1 || y === 0 || y === H - 1);
    }

    /**
     * A press on the plan. On something already there, whatever the tool,
     * it is picked up: a room moves (or resizes from its edge), a door
     * slides along its wall, a window along the outside, stairs and people
     * go anywhere. On empty ground the tool decides what a drag or a click
     * makes; the press that never moves is answered on release.
     */
    beginPlanGesture(cell) {
        const floor = this.currentFloor();
        if (!floor || !cell) return null;
        const hit = this.hitAt(cell.x, cell.y);
        // A door, window, stairs or person is picked up by any tool; a room only
        // by Select and Room, since the other tools place things inside rooms.
        if (hit && (hit.kind !== 'room' || this.tool === 'select' || this.tool === 'room')) {
            this.selection = hit;
            const g = { mode: 'move', target: hit, start: cell, moved: false, snapshot: JSON.stringify(this.current.plan) };
            if (hit.kind === 'room') {
                const r = floor.rooms[hit.key];
                const edges = { left: cell.x === r[0] && r[2] > r[0], right: cell.x === r[2] && r[2] > r[0], top: cell.y === r[1] && r[3] > r[1], bottom: cell.y === r[3] && r[3] > r[1] };
                if (Object.values(edges).some(Boolean)) { g.mode = 'resize'; g.edges = edges; }
                g.from = r.slice();
            }
            this._gesture = g;
            this.renderInspector(); this.renderTools();
            return g;
        }
        if (this.tool === 'room') this._gesture = { mode: 'draw', start: cell, rect: [cell.x, cell.y, cell.x, cell.y], moved: false };
        else this._gesture = { mode: 'click', start: cell, moved: false };
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
        } else if (g.mode === 'resize') {
            const r = g.from.slice();
            if (g.edges.left) r[0] = Math.min(clampX(cell.x), r[2]);
            if (g.edges.right) r[2] = Math.max(clampX(cell.x), r[0]);
            if (g.edges.top) r[1] = Math.min(clampY(cell.y), r[3]);
            if (g.edges.bottom) r[3] = Math.max(clampY(cell.y), r[1]);
            floor.rooms[g.target.key] = r;
        } else if (g.mode === 'move') {
            const t = g.target;
            if (t.kind === 'room') {
                const r = g.from, w = r[2] - r[0], h = r[3] - r[1];
                const x0 = Math.max(1, Math.min(W - 2 - w, r[0] + cell.x - g.start.x)), y0 = Math.max(1, Math.min(H - 2 - h, r[1] + cell.y - g.start.y));
                floor.rooms[t.key] = [x0, y0, x0 + w, y0 + h];
            } else if (t.kind === 'door') {
                const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
                const door = floor.doors[t.key];
                const found = SP && SP.doorWall ? SP.doorWall(floor.rooms, plan.size, door) : null;
                if (found) door[3] = found.alongX ? cell.x : cell.y;
            } else if (t.kind === 'window') {
                if (this.onRing(cell.x, cell.y)) floor.windows[t.key] = [cell.x, cell.y];
            } else if (t.kind === 'stair') {
                plan.stairs[t.key].from = [cell.x, cell.y];
            } else if (t.kind === 'spot') {
                plan.spots[t.key] = [cell.x, cell.y];
            }
        }
        this._reportStale = true;
        this.requestPlanRedraw();
    }

    /** The plan alone, on the next frame: what a drag needs, without the build behind it. */
    requestPlanRedraw() {
        if (this._redraw || typeof requestAnimationFrame !== 'function') return;
        this._redraw = requestAnimationFrame(() => { this._redraw = 0; this.drawPlan(this._report); });
    }

    endPlanGesture(cell) {
        const g = this._gesture;
        this._gesture = null;
        const floor = this.currentFloor();
        if (!g || !floor) return;
        if (!g.moved) {
            if (g.mode === 'click' || g.mode === 'draw') this.clickPlan(g.start);
            else { this.renderInspector(); this.renderTools(); }
            return;
        }
        if (g.mode === 'draw') {
            this.pushHistory();
            const name = DatabaseStructureEditor.freshName(Object.keys(floor.rooms), this._t('room'));
            floor.rooms[name] = g.rect;
            this.selection = { kind: 'room', key: name };
        } else if (g.snapshot) {
            // The move was applied as it went; the state before it is what Undo returns to.
            this._history.push(g.snapshot);
            if (this._history.length > DatabaseStructureEditor.HISTORY) this._history.shift();
            this._future.length = 0;
        }
        this.markDirty();
        this.renderInspector();
    }

    /** A click on empty ground, by tool. */
    clickPlan(cell) {
        const plan = this.current?.plan, floor = this.currentFloor();
        if (!plan || !floor) return;
        const floorIndex = this.currentFloorIndex();
        const room = this.roomAtCell(cell.x, cell.y, floor);
        if (this.tool === 'select') this.selection = null;
        else if (this.tool === 'room') this.selection = null;
        else if (this.tool === 'door') { if (!this.addDoorAt(cell.x, cell.y)) this.selection = null; }
        else if (this.tool === 'window') {
            if (this.onRing(cell.x, cell.y) && !room) { this.pushHistory(); floor.windows.push([cell.x, cell.y]); this.selection = { kind: 'window', key: floor.windows.length - 1 }; this.markDirty(); }
            else this.selection = null;
        } else if (this.tool === 'stairs') {
            if (room) { this.pushHistory(); plan.stairs.push({ floor: floorIndex, from: [cell.x, cell.y], dir: 'north', width: 1 }); this.selection = { kind: 'stair', key: plan.stairs.length - 1 }; this.markDirty(); }
            else this.selection = null;
        } else if (this.tool === 'person') {
            this.pushHistory();
            const name = DatabaseStructureEditor.freshName(Object.keys(plan.spots), this._t('person'));
            plan.spots[name] = [cell.x, cell.y];
            const templates = this.eventTemplates();
            plan.events.push({ spot: name, name: '', template: templates[0] || '', direction: 2 });
            this.selection = { kind: 'spot', key: name };
            this.markDirty();
        }
        this.renderInspector();
        this.renderTools();
        this.schedulePreview();
    }

    /**
     * A door through the wall cell at (x, y), where the click was: between
     * the two rooms either side of it, or from the one room beside it to
     * outside when the cell is on the plan's edge. False when the cell is
     * not a wall between anything.
     */
    addDoorAt(x, y) {
        const floor = this.currentFloor(), plan = this.current?.plan;
        if (!floor || !plan || this.roomAtCell(x, y, floor)) return false;
        const [W, H] = plan.size;
        const n = this.roomAtCell(x, y - 1, floor), s = this.roomAtCell(x, y + 1, floor), w = this.roomAtCell(x - 1, y, floor), e = this.roomAtCell(x + 1, y, floor);
        let pair = null, alongX = null;
        if (n && s && n !== s) { pair = [n, s]; alongX = true; }
        else if (w && e && w !== e) { pair = [w, e]; alongX = false; }
        else if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
            const beside = [n, s, w, e].filter(Boolean);
            if (beside.length) { pair = [beside[0], 'outside']; alongX = y === 0 || y === H - 1; }
        }
        if (!pair) return false;
        this.pushHistory();
        floor.doors.push([pair[0], pair[1], 3, alongX ? x : y]);
        this.selection = { kind: 'door', key: floor.doors.length - 1 };
        this.markDirty();
        return true;
    }

    /** Kept for the tests and the palette: a door toggled by the wall it names. */
    toggleDoorAt(x, y) {
        const floor = this.currentFloor();
        if (!floor) return false;
        const hit = this.hitAt(x, y);
        if (hit && hit.kind === 'door') { this.pushHistory(); floor.doors.splice(hit.key, 1); this.selection = null; this.markDirty(); return true; }
        return this.addDoorAt(x, y);
    }

    /** What the pointer would do here: move, resize from an edge, place, or nothing. */
    cursorFor(cell, hit) {
        if (!cell || !this.currentFloor() || this.floor === 'roof') return 'default';
        if (hit && hit.kind === 'room' && (this.tool === 'select' || this.tool === 'room')) {
            const r = this.currentFloor().rooms[hit.key];
            const left = cell.x === r[0] && r[2] > r[0], right = cell.x === r[2] && r[2] > r[0], top = cell.y === r[1] && r[3] > r[1], bottom = cell.y === r[3] && r[3] > r[1];
            if ((left || right) && (top || bottom)) return (left && top) || (right && bottom) ? 'nwse-resize' : 'nesw-resize';
            if (left || right) return 'ew-resize';
            if (top || bottom) return 'ns-resize';
            return 'move';
        }
        if (hit && hit.kind !== 'room') return 'move';
        if (this.tool === 'select') return 'default';
        return this.tool === 'room' ? 'crosshair' : 'copy';
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
        canvas.addEventListener('pointermove', event => {
            if (this._gesture) { this.updatePlanGesture(cellOf(event) || this._gesture.start); return; }
            const cell = cellOf(event);
            const hit = cell ? this.hitAt(cell.x, cell.y) : null;
            const key = hit ? hit.kind + ':' + hit.key : '';
            canvas.style.cursor = this.cursorFor(cell, hit);
            if (key !== (this._hover ? this._hover.kind + ':' + this._hover.key : '')) { this._hover = hit; this.requestPlanRedraw(); }
        });
        canvas.addEventListener('pointerleave', () => { if (this._hover) { this._hover = null; this.requestPlanRedraw(); } });
        const finish = event => { if (this._gesture) this.endPlanGesture(cellOf(event)); };
        canvas.addEventListener('pointerup', finish);
        canvas.addEventListener('pointercancel', finish);
        canvas.addEventListener('keydown', event => {
            const key = event.key.toLowerCase();
            if ((event.key === 'Delete' || event.key === 'Backspace') && this.selection) { event.preventDefault(); this.removeSelection(); }
            else if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) { event.preventDefault(); this.undo(); }
            else if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) { event.preventDefault(); this.redo(); }
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
        this._reportStale = false;
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
            const cx = ox + (at[0] + 0.5) * cell, cy = oy + (at[1] + 0.5) * cell, r = Math.max(2, cell * 0.16);
            const person = plan.events.some(item => item.spot === name);
            ctx.fillStyle = person ? '#f0c060' : colours('--color-accent');
            ctx.beginPath(); ctx.arc(cx, cy - r * 1.2, r, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy + r * 1.6, r * 1.9, Math.PI, 0); ctx.fill();
            ctx.fillStyle = colours('--color-text');
            ctx.fillText(name, cx, cy - Math.max(7, cell * 0.9));
        }
        const floorNow = this.currentFloor(), sel = this.selection;
        // While the build behind the plan is stale (a drag, an edit not yet
        // rebuilt), the rooms, doors and windows are drawn from the plan's
        // own data on top, so what moves under the hand moves at once.
        if (floorNow && this.floor !== 'roof' && (this._reportStale || this._gesture)) {
            for (const [, r] of Object.entries(floorNow.rooms)) {
                ctx.fillStyle = tint.floor; ctx.globalAlpha = 0.5;
                ctx.fillRect(ox + r[0] * cell, oy + r[1] * cell, (r[2] - r[0] + 1) * cell, (r[3] - r[1] + 1) * cell);
            }
            ctx.globalAlpha = 0.95;
            for (let i = 0; i < floorNow.doors.length; i++) for (const [dx, dy] of this.doorCellsOf(i, floorNow)) { ctx.fillStyle = tint.doorway; ctx.fillRect(ox + dx * cell, oy + dy * cell, cell, cell); }
            for (const [wx, wy] of floorNow.windows) { ctx.fillStyle = tint.window; ctx.fillRect(ox + wx * cell, oy + wy * cell, cell, cell); }
            ctx.globalAlpha = 1;
            ctx.fillStyle = colours('--color-text');
            for (const [name, r] of Object.entries(floorNow.rooms)) ctx.fillText(name, ox + ((r[0] + r[2] + 1) / 2) * cell, oy + ((r[1] + r[3] + 1) / 2) * cell);
        }
        // Stairs point the way they rise; hand-placed windows show even before the build catches up.
        const arrow = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
        for (const s of plan.stairs) {
            if (s.floor !== floorIndex || this.floor === 'roof') continue;
            const [dx, dy] = arrow[s.dir] || [0, -1];
            const cx = ox + (s.from[0] + 0.5) * cell, cy = oy + (s.from[1] + 0.5) * cell;
            ctx.strokeStyle = colours('--color-text'); ctx.lineWidth = Math.max(1, cell * 0.12);
            ctx.beginPath(); ctx.moveTo(cx - dx * cell * 0.3, cy - dy * cell * 0.3); ctx.lineTo(cx + dx * cell * 0.3, cy + dy * cell * 0.3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + dx * cell * 0.3, cy + dy * cell * 0.3); ctx.lineTo(cx + dx * cell * 0.3 - (dx + dy) * cell * 0.2, cy + dy * cell * 0.3 - (dy - dx) * cell * 0.2);
            ctx.moveTo(cx + dx * cell * 0.3, cy + dy * cell * 0.3); ctx.lineTo(cx + dx * cell * 0.3 - (dx - dy) * cell * 0.2, cy + dy * cell * 0.3 - (dy + dx) * cell * 0.2); ctx.stroke();
            ctx.lineWidth = 1;
        }
        // The hovered thing is lit faintly; the selected one is outlined, filled, and a room gets corner handles.
        const boxOf = hit => {
            if (!hit || !floorNow) return null;
            if (hit.kind === 'room' && this.floor !== 'roof' && floorNow.rooms[hit.key]) { const r = floorNow.rooms[hit.key]; return [r]; }
            if (hit.kind === 'door' && floorNow.doors[hit.key]) return this.doorCellsOf(hit.key, floorNow).map(([x, y]) => [x, y, x, y]);
            if (hit.kind === 'window' && floorNow.windows[hit.key]) { const [x, y] = floorNow.windows[hit.key]; return [[x, y, x, y]]; }
            if (hit.kind === 'stair' && plan.stairs[hit.key]) { const f = plan.stairs[hit.key].from; return [[f[0], f[1], f[0], f[1]]]; }
            if (hit.kind === 'spot' && plan.spots[hit.key]) { const a = plan.spots[hit.key]; return [[a[0], a[1], a[0], a[1]]]; }
            return null;
        };
        const accent = colours('--color-accent');
        const hoverBoxes = this._hover && !(sel && this._hover.kind === sel.kind && String(this._hover.key) === String(sel.key)) ? boxOf(this._hover) : null;
        if (hoverBoxes) {
            ctx.strokeStyle = accent; ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
            for (const [x0, y0, x1, y1] of hoverBoxes) ctx.strokeRect(ox + x0 * cell + 1, oy + y0 * cell + 1, (x1 - x0 + 1) * cell - 2, (y1 - y0 + 1) * cell - 2);
            ctx.globalAlpha = 1;
        }
        const selBoxes = boxOf(sel);
        if (selBoxes) {
            ctx.fillStyle = accent; ctx.globalAlpha = 0.22;
            for (const [x0, y0, x1, y1] of selBoxes) ctx.fillRect(ox + x0 * cell, oy + y0 * cell, (x1 - x0 + 1) * cell, (y1 - y0 + 1) * cell);
            ctx.globalAlpha = 1; ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
            for (const [x0, y0, x1, y1] of selBoxes) ctx.strokeRect(ox + x0 * cell + 1, oy + y0 * cell + 1, (x1 - x0 + 1) * cell - 2, (y1 - y0 + 1) * cell - 2);
            if (sel.kind === 'room') {
                const [x0, y0, x1, y1] = selBoxes[0], h = Math.max(3, Math.min(6, cell * 0.35));
                ctx.fillStyle = accent;
                for (const [hx, hy] of [[x0, y0], [x1 + 1, y0], [x0, y1 + 1], [x1 + 1, y1 + 1]]) ctx.fillRect(ox + hx * cell - h, oy + hy * cell - h, h * 2, h * 2);
            }
            if (sel.kind === 'spot') { const a = plan.spots[sel.key]; ctx.beginPath(); ctx.arc(ox + (a[0] + 0.5) * cell, oy + (a[1] + 0.5) * cell, Math.max(6, cell * 0.6), 0, Math.PI * 2); ctx.stroke(); }
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
        this.closeMaterialPicker();
        if (this._redraw && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._redraw);
        this._redraw = 0;
        this._disposePreview();
        this._detail = null;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseStructureEditor;
