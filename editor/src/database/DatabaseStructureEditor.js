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
    static MATERIAL_ROLES = ['wall', 'inner', 'floor', 'wet', 'roof', 'stair', 'path', 'glass'];
    static DIRECTIONS = ['south', 'north', 'east', 'west'];
    static FACINGS = [[2, 'Down'], [4, 'Left'], [6, 'Right'], [8, 'Up']];
    static SIZE_MIN = 4;
    static SIZE_MAX = 200;
    static TOOLS = ['select', 'room', 'door', 'window', 'stairs', 'person', 'shape', 'effect'];
    /** What an effect can be, the way the 3D Models page attaches them: a screen, a light, an animation. */
    static EFFECT_KINDS = ['screen', 'light', 'animation'];
    static EFFECT_DEFAULTS = { screen: { width: 4, height: 2.25, z: 1, media: '' }, light: { color: '#9fd8ff', radius: 6, intensity: 1.2, z: 4 }, animation: { animation: 0, z: 0 } };
    static SHAPE_KINDS = ['box', 'wedge', 'pyramid', 'prism', 'hull', 'spike', 'cylinder', 'capsule', 'tube', 'cone', 'dome', 'sphere', 'dish', 'fin', 'arch', 'tunnel', 'ring'];
    /** The settings a kind carries beyond its size, with what it wears until told otherwise. */
    static SHAPE_PARAMS = { hull: { sides: 8, taper: 0.8 }, spike: { sides: 6, taper: 0 }, capsule: { sides: 24 }, dish: { sides: 32 }, fin: { taper: 0.4 }, cylinder: { sweep: 360 }, tube: { sweep: 360, thick: 0.3 }, ring: { sweep: 360, thick: 0.2 } };
    /** What a shape is first placed at, in tiles: wide enough to see, tall enough to matter. */
    static SHAPE_DEFAULTS = { box: [4, 3, 4], wedge: [4, 2, 4], pyramid: [4, 4, 4], prism: [4, 3, 6], cylinder: [4, 6, 4], tube: [6, 5, 6], cone: [4, 4, 4], dome: [4, 2, 4], sphere: [4, 4, 4], arch: [3, 4, 1], tunnel: [4, 4, 8], ring: [6, 1, 6], hull: [4, 6, 4], spike: [1, 4, 1], capsule: [2, 6, 2], dish: [4, 1, 4], fin: [3, 3, 0.25], tower: [4, 6, 4] };
    /** The three things the 3D handles do to a selected shape. */
    static GIZMO_MODES = ['move', 'turn', 'size'];
    /** How close a dragged face comes to another shape's face before it clicks onto it, in tiles. */
    static SNAP_REACH = 0.35;
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
        this._shape = { kind: 'cylinder', size: [4, 6, 4] };
        this._effect = { kind: 'screen' };
        this._peek = null;
        this._gizmoMode = 'move';
        this._sizeLock = false;
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
            shape: `<path d="M2 12a6 6 0 0 1 12 0M2 12h12v2H2z" ${stroke}/>`,
            dome: `<path d="M2 12a6 6 0 0 1 12 0M2 12h12v2H2z" ${stroke}/>`,
            cylinder: `<path d="M3.5 4a4.5 1.5 0 0 0 9 0a4.5 1.5 0 0 0-9 0M3.5 4v8a4.5 1.5 0 0 0 9 0V4" ${stroke}/>`,
            cone: `<path d="M8 2l5.5 11h-11z M2.5 13a5.5 1.3 0 0 0 11 0" ${stroke}/>`,
            tower: `<path d="M4 7a4 4 0 0 1 8 0M4 7v6.5a4 1.2 0 0 0 8 0V7" ${stroke}/>`,
            box: `<path d="M8 2l5 3v6l-5 3-5-3V5z M8 8l5-3 M8 8v6 M8 8L3 5" ${stroke}/>`,
            wedge: `<path d="M2 13h12L2 5z" ${stroke}/>`,
            pyramid: `<path d="M8 2l6 11H2z M8 2v11" ${stroke}/>`,
            prism: `<path d="M2 13h9L6.5 5z M6.5 5l2.5-2 5 8-2.5 2" ${stroke}/>`,
            tube: `<path d="M3.5 4a4.5 1.5 0 0 0 9 0a4.5 1.5 0 0 0-9 0M3.5 4v8a4.5 1.5 0 0 0 9 0V4 M6 4a2 .7 0 0 0 4 0a2 .7 0 0 0-4 0" ${stroke}/>`,
            sphere: `<path d="M8 2a6 6 0 1 0 0 12a6 6 0 1 0 0-12 M2 8h12 M8 2a3 6 0 0 0 0 12" ${stroke}/>`,
            arch: `<path d="M2.5 14V7a5.5 5.5 0 0 1 11 0v7 M5.5 14V8a2.5 2.5 0 0 1 5 0v6" ${stroke}/>`,
            tunnel: `<path d="M2.5 13V7.5a5.5 5.5 0 0 1 11 0V13 M5.5 13V8.5a2.5 2.5 0 0 1 5 0V13 M2.5 13h11 M5.5 8.5L3 5.5 M10.5 8.5L13 5.5" ${stroke}/>`,
            ring: `<path d="M8 3a5.5 2.5 0 1 0 0 5a5.5 2.5 0 1 0 0-5 M8 4.6a2.2 .9 0 1 0 0 1.8a2.2 .9 0 1 0 0-1.8 M2.5 5.5v4a5.5 2.5 0 0 0 11 0v-4" ${stroke}/>`,
            hull: `<path d="M4 4h8l2 2v4l-2 2H4l-2-2V6z M4 4l1.5 1.5h5L12 4 M4 12l1.5-1.5h5L12 12" ${stroke}/>`,
            spike: `<path d="M8 1.5l3 11H5z M5 12.5a3 1 0 0 0 6 0" ${stroke}/>`,
            capsule: `<path d="M5 5.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z M5 6.5h6 M5 9.5h6" ${stroke}/>`,
            dish: `<path d="M2.5 5a5.5 5.5 0 0 0 11 0 M2.5 5h11 M8 9v4 M6 13h4" ${stroke}/>`,
            fin: `<path d="M3 13h10V7L9 2H3z M3 7h6" ${stroke}/>`,
            move: `<path d="M8 2v12M2 8h12M8 2l-2 2M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" ${stroke}/>`,
            turn: `<path d="M13 8a5 5 0 1 1-1.5-3.5M11.5 2v2.5H14" ${stroke}/>`,
            size: `<path d="M3 13V8M3 13h5M3 13l4-4M13 3v5M13 3H8M13 3L9 7" ${stroke}/>`,
            lock: `<path d="M4 7h8v7H4z M5.5 7V5a2.5 2.5 0 0 1 5 0v2" ${stroke}/>`,
            unlock: `<path d="M4 7h8v7H4z M5.5 7V5a2.5 2.5 0 0 1 5 0" ${stroke}/>`,
            duplicate: `<path d="M5 5h8v8H5z M3 11V3h8" ${stroke}/>`,
            effect: `<path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z" ${stroke}/>`,
            peek: `<path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" ${stroke}/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>`,
            screen: `<path d="M2 3.5h12v8H2z M6 13.5h4 M7 6.5l3 2-3 2z" ${stroke}/>`,
            light: `<path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" ${stroke}/><circle cx="8" cy="8" r="2.5" fill="currentColor"/>`,
            animation: `<path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6z" fill="currentColor"/>`,
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
                const anchored = door.length > 3 && Number.isFinite(Number(door[3]));
                if (anchored) out.push(int(door[3], 0, 0, this.SIZE_MAX));
                // A front door may say which side of the room it is on.
                if (anchored && ['north', 'south', 'east', 'west'].includes(door[4])) out.push(door[4]);
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
        // A roof of so many rows, or none at all (`pitch: null`): a bridge, a hangar, a flat-topped tower.
        plan.roof = { pitch: plan.roof && plan.roof.pitch === null ? null : int(plan.roof?.pitch, 2, 0, 20) };
        plan.windows = { every: int(plan.windows?.every, 6, 0, 60), width: int(plan.windows?.width, 2, 1, 8) };
        plan.spots = Object.fromEntries(Object.entries(plan.spots || {}).map(([name, cell]) => [name, [int(cell?.[0], 0, 0, this.SIZE_MAX), int(cell?.[1], 0, 0, this.SIZE_MAX)]]));
        plan.effects = (Array.isArray(plan.effects) ? plan.effects : []).filter(fx => fx && this.EFFECT_KINDS.includes(fx.type)).map(fx => {
            const own = this.EFFECT_DEFAULTS[fx.type];
            const num = (v, fallback, lo, hi) => { const k = Number(v); return Number.isFinite(k) ? Math.max(lo, Math.min(hi, Math.round(k * 100) / 100)) : fallback; };
            const out = { name: String(fx.name || fx.type), type: fx.type, at: [int(fx.at?.[0], 0, 0, this.SIZE_MAX), int(fx.at?.[1], 0, 0, this.SIZE_MAX)], z: num(fx.z, own.z, 0, 120) };
            if (fx.type === 'screen') Object.assign(out, { facing: this.DIRECTIONS.includes(fx.facing) ? fx.facing : 'south', width: num(fx.width, own.width, 0.25, 60), height: num(fx.height, own.height, 0.25, 60), media: String(fx.media || ''), audio: fx.audio === true, scanlines: num(fx.scanlines, 0, 0, 1) });
            else if (fx.type === 'light') Object.assign(out, { color: /^#[0-9a-f]{6}$/i.test(String(fx.color)) ? String(fx.color).toLowerCase() : own.color, radius: num(fx.radius, own.radius, 0.5, 60), intensity: num(fx.intensity, own.intensity, 0, 4) });
            else Object.assign(out, { animation: Math.max(0, Math.floor(Number(fx.animation) || 0)) });
            return out;
        });
        plan.events = (Array.isArray(plan.events) ? plan.events : []).map(event => ({
            spot: String(event?.spot || ''), name: String(event?.name || ''), template: String(event?.template || ''), direction: [2, 4, 6, 8].includes(Number(event?.direction)) ? Number(event.direction) : 2
        }));
        plan.parts = (Array.isArray(plan.parts) ? plan.parts : []).map(part => ({
            name: String(part?.name || ''), plan: String(part?.plan || ''), at: [int(part?.at?.[0], 0, 0, this.SIZE_MAX), int(part?.at?.[1], 0, 0, this.SIZE_MAX)],
            rot: int(part?.rot, 0, 0, 3), scale: int(part?.scale, 1, 1, 4),
            materials: part?.materials && typeof part.materials === 'object' ? Object.fromEntries(Object.entries(part.materials).map(([role, name]) => [role, String(name || '')])) : {}
        }));
        plan.shapes = (Array.isArray(plan.shapes) ? plan.shapes : []).filter(shape => shape && this.SHAPE_KINDS.includes(shape.kind)).map(shape => {
            const size = Array.isArray(shape.size) ? shape.size : [];
            const n = (v, fallback) => { const k = Number(v); return Number.isFinite(k) && k > 0 ? Math.min(60, Math.round(k * 100) / 100) : fallback; };
            const turn = v => ((Math.round(Number(v)) || 0) % 360 + 360) % 360;
            const off = v => Math.max(-0.5, Math.min(0.5, Math.round((Number(v) || 0) * 100) / 100));
            const out = { kind: shape.kind, at: [int(shape.at?.[0], 0, 0, this.SIZE_MAX), int(shape.at?.[1], 0, 0, this.SIZE_MAX)], z: Math.max(0, Math.min(120, Math.round((Number(shape.z) || 0) * 4) / 4)),
                size: [n(size[0], 3), n(size[1], 2), n(size[2], n(size[0], 3))], angle: turn(shape.angle), tilt: turn(shape.tilt), roll: turn(shape.roll),
                offset: [off(shape.offset?.[0]), off(shape.offset?.[1])], material: String(shape.material || '') };
            // A kind's own settings, only when the record says them.
            const own = this.SHAPE_PARAMS[shape.kind] || {};
            if ('sides' in own && Number.isFinite(Number(shape.sides))) out.sides = Math.max(3, Math.min(32, Math.round(Number(shape.sides))));
            if ('taper' in own && Number.isFinite(Number(shape.taper))) out.taper = Math.max(0, Math.min(1, Math.round(Number(shape.taper) * 100) / 100));
            if ('sweep' in own && Number.isFinite(Number(shape.sweep))) out.sweep = Math.max(1, Math.min(360, Math.round(Number(shape.sweep))));
            if ('thick' in own && Number.isFinite(Number(shape.thick))) out.thick = Math.max(0.02, Math.min(1, Math.round(Number(shape.thick) * 100) / 100));
            return out;
        });
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
        if (plan.effects.length || had.has('effects')) fields.effects = plan.effects.map(fx => {
            const own = DatabaseStructureEditor.EFFECT_DEFAULTS[fx.type];
            const out = { name: fx.name, type: fx.type, at: fx.at.slice() };
            if (fx.z !== own.z) out.z = fx.z;
            if (fx.type === 'screen') { out.facing = fx.facing; if (fx.width !== own.width) out.width = fx.width; if (fx.height !== own.height) out.height = fx.height; if (fx.media) out.media = fx.media; if (fx.audio) out.audio = true; if (fx.scanlines) out.scanlines = fx.scanlines; }
            else if (fx.type === 'light') { if (fx.color !== own.color) out.color = fx.color; if (fx.radius !== own.radius) out.radius = fx.radius; if (fx.intensity !== own.intensity) out.intensity = fx.intensity; }
            else out.animation = fx.animation;
            return out;
        });
        if (plan.parts.length || had.has('parts')) fields.parts = plan.parts.map(part => {
            const p = { name: part.name, plan: part.plan, at: part.at.slice(), rot: part.rot };
            if (part.scale !== 1) p.scale = part.scale;
            const own = Object.fromEntries(Object.entries(part.materials || {}).filter(([, name]) => name));
            if (Object.keys(own).length) p.materials = own;
            return p;
        });
        if (plan.paths.length || had.has('paths')) fields.paths = plan.paths.map(strip => strip.slice());
        if (plan.shapes.length || had.has('shapes')) fields.shapes = plan.shapes.map(shape => {
            const out = { kind: shape.kind, at: shape.at.slice() };
            if (shape.z) out.z = shape.z;
            out.size = shape.size.slice();
            if (shape.angle) out.angle = shape.angle;
            if (shape.tilt) out.tilt = shape.tilt;
            if (shape.roll) out.roll = shape.roll;
            if (shape.offset && (shape.offset[0] || shape.offset[1])) out.offset = shape.offset.slice();
            const own = DatabaseStructureEditor.SHAPE_PARAMS[shape.kind] || {};
            if ('sides' in own && shape.sides !== undefined && shape.sides !== own.sides) out.sides = shape.sides;
            if ('taper' in own && shape.taper !== undefined && shape.taper !== own.taper) out.taper = shape.taper;
            if ('sweep' in own && shape.sweep !== undefined && shape.sweep !== own.sweep) out.sweep = shape.sweep;
            if ('thick' in own && shape.thick !== undefined && shape.thick !== own.thick) out.thick = shape.thick;
            if (shape.material) out.material = shape.material;
            return out;
        });
        // The file's own order first, then anything new at the end.
        const out = {};
        for (const key of plan._had || []) if (key in fields) out[key] = fields[key];
        for (const key of Object.keys(fields)) if (!(key in out)) out[key] = fields[key];
        return out;
    }

    /** A cottage to start from: two rooms, a front door, a door between, a window every six cells. */
    /** An empty page with one floor and a style: the building is whatever gets drawn on it. */
    static newPlan(name) {
        return this.normalizePlan({
            name, size: [20, 16], storey: 5,
            materials: this.styleMaterials('Stone and tile'),
            floors: [{ rooms: {}, doors: [] }],
            roof: { pitch: 2 }, windows: { every: 6, width: 2 }
        });
    }

    /** Whether any floor has a room, or the plan a shape or a part: something to build. */
    static isEmpty(plan) {
        return !plan || (!plan.floors.some(floor => Object.keys(floor.rooms || {}).length) && !plan.shapes.length && !plan.parts.length);
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
        // A saved building: its name, a look at it, and the way onto the map. Building
        // happens in the world (the Build toggle over the 3D map), not in a form here.
        detailEl.innerHTML = `
            <div class="rr-structures" style="display:flex;flex-direction:column;height:100%;min-height:0;font-size:12px;">
                <div class="rr-structures-bar" style="display:flex;align-items:center;gap:14px;padding:6px 10px;border-bottom:1px solid var(--color-border);flex-wrap:wrap;"></div>
                <div style="display:flex;flex:1;min-height:220px;">
                    <div style="flex:1;min-width:0;position:relative;background:var(--color-bg-deep);">
                        <canvas class="rr-structures-3d" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab;"></canvas>
                        <button type="button" class="rr-btn-secondary rr-structures-peek" title="${rrEscapeHtml(this._t('Look inside: the ceiling and roof left off'))}" aria-pressed="false" style="position:absolute;top:8px;right:8px;width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;">${DatabaseStructureEditor.icon('peek')}</button>
                        <div class="rr-structures-report" style="position:absolute;left:8px;bottom:8px;right:8px;padding:6px 8px;font-size:11px;line-height:1.4;color:var(--color-text-muted);background:color-mix(in srgb, var(--color-bg-panel) 85%, transparent);border-radius:3px;pointer-events:none;"></div>
                    </div>
                </div>
            </div>`;
        this._bindOrbit(detailEl.querySelector('.rr-structures-3d'));
        detailEl.querySelector('.rr-structures-peek')?.addEventListener('click', () => {
            const plan = this.current?.plan;
            const now = this._peek === null ? (plan ? plan.roof.pitch === null : true) : this._peek;
            this._peek = !now;
            this.draw3D(this._report);
        });
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
        const card = !bar.closest('.rr-structures').querySelector('.rr-structures-plan');
        bar.innerHTML = card ? `
            ${this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-name" value="${rrEscapeHtml(plan.name)}" style="width:150px;">`)}
            <span style="color:var(--color-text-muted);">${tt('A saved building. Build on the map with the Build toggle, then stamp this where you like.')}</span>
            <button type="button" class="rr-btn-secondary rr-structures-use" style="margin-left:auto;">${tt('Use on the map')}</button>` : `
            ${this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-name" value="${rrEscapeHtml(plan.name)}" style="width:150px;">`)}
            ${this._field(tt('Style'), this._selectHtml('rr-structures-style', styleNames.map(name => [name, tt(name)]).concat([['', tt('Custom')]]), style || '', 'style="width:140px;"'))}
            ${this._field(tt('Size'), `${this._numberHtml('rr-structures-size', plan.size[0], `data-i="0" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}"`)}<span>×</span>${this._numberHtml('rr-structures-size', plan.size[1], `data-i="1" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}"`)}`)}
            <button type="button" class="rr-btn-secondary rr-structures-use" style="margin-left:auto;">${tt('Use on the map')}</button>`;
        bar.querySelector('.rr-structures-name').addEventListener('input', event => this.setName(event.target.value));
        bar.querySelector('.rr-structures-style')?.addEventListener('change', event => {
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
        const labels = { select: tt('Select'), room: tt('Room'), door: tt('Door'), window: tt('Window'), stairs: tt('Stairs'), person: tt('Person'), shape: tt('Shape'), effect: tt('Effect') };
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
                this.selection = null;
                this.renderTools();
                this.renderInspector();
                this.requestPlanRedraw();
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
        const sel = this.tool === 'shape' ? null : this.selection;
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
        } else if (sel && sel.kind === 'shape' && plan.shapes[sel.key]) {
            // One shape: what it is, then one of three things to do to it (move, turn, size),
            // with that thing's three numbers; the handles on the 3D view do the same by drag.
            const shape = plan.shapes[sel.key];
            const mode = this._gizmoMode;
            const modes = `<span style="display:inline-flex;gap:2px;">${DatabaseStructureEditor.GIZMO_MODES.map(m => `<button type="button" class="rr-btn-secondary rr-structures-shape-mode" data-mode="${m}" title="${rrEscapeHtml(tt(m === 'move' ? 'Move' : m === 'turn' ? 'Turn' : 'Size'))}" aria-pressed="${m === mode}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;${m === mode ? 'border-color:var(--color-accent);' : ''}">${DatabaseStructureEditor.icon(m)}</button>`).join('')}</span>`;
            const field = (cls, label, value, min, max, step, i) => this._field(label, `<input type="number" class="database-field-value ${cls}" data-i="${i}" value="${value}" min="${min}" max="${max}" step="${step}" style="width:64px;">`);
            const [cx, cy] = DatabaseStructureEditor.shapeCentre(shape);
            let numbers = '';
            if (mode === 'move') numbers = field('rr-structures-shape-pos', 'X', cx, 0, DatabaseStructureEditor.SIZE_MAX, 0.25, 0) + field('rr-structures-shape-pos', 'Y', cy, 0, DatabaseStructureEditor.SIZE_MAX, 0.25, 1) + field('rr-structures-shape-pos', tt('Up'), shape.z, 0, 120, 0.25, 2);
            else if (mode === 'turn') numbers = field('rr-structures-shape-turn', tt('Turn'), shape.angle, 0, 359, 5, 0) + field('rr-structures-shape-turn', tt('Tilt'), shape.tilt || 0, 0, 359, 5, 1) + field('rr-structures-shape-turn', tt('Roll'), shape.roll || 0, 0, 359, 5, 2);
            else numbers = field('rr-structures-shape-size', tt('Width'), shape.size[0], 0.25, 60, 0.25, 0) + field('rr-structures-shape-size', tt('Height'), shape.size[1], 0.25, 60, 0.25, 1) + field('rr-structures-shape-size', tt('Depth'), shape.size[2], 0.25, 60, 0.25, 2)
                + `<button type="button" class="rr-btn-secondary rr-structures-shape-lock" title="${rrEscapeHtml(tt('Keep the proportions'))}" aria-pressed="${this._sizeLock}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;${this._sizeLock ? 'border-color:var(--color-accent);' : ''}">${DatabaseStructureEditor.icon(this._sizeLock ? 'lock' : 'unlock')}</button>`;
            const own = DatabaseStructureEditor.SHAPE_PARAMS[shape.kind] || {};
            if (mode === 'size' && 'sides' in own) numbers += field('rr-structures-shape-param', tt('Sides'), shape.sides ?? own.sides, 3, 32, 1, 'sides');
            if (mode === 'size' && 'taper' in own) numbers += field('rr-structures-shape-param', tt('Top') + ' %', Math.round((shape.taper ?? own.taper) * 100), 0, 100, 5, 'taper');
            if (mode === 'size' && 'sweep' in own) numbers += field('rr-structures-shape-param', tt('Around') + ' °', shape.sweep ?? own.sweep, 15, 360, 15, 'sweep');
            if (mode === 'size' && 'thick' in own) numbers += field('rr-structures-shape-param', tt('Wall') + ' %', Math.round((shape.thick ?? own.thick) * 100), 2, 100, 2, 'thick');
            html = `${kindLabel(tt('Shape'))}
                ${this._shapePickHtml('rr-structures-shape-pick', shape.kind)}
                ${modes}
                ${numbers}
                ${this._materialPickerHtml('rr-structures-shape-material', shape.material, `title="${rrEscapeHtml(tt('Material'))}"`, tt("Building's own"))}
                <button type="button" class="rr-btn-secondary rr-structures-shape-duplicate" title="${rrEscapeHtml(tt('Duplicate'))}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;">${DatabaseStructureEditor.icon('duplicate')}</button>`;
        } else if (sel && sel.kind === 'spot' && plan.spots[sel.key]) {
            const event = plan.events.find(item => item.spot === sel.key) || null;
            const templates = this.eventTemplates();
            html = `${kindLabel(tt('Person'))}
                ${this._field(tt('Spot'), `<input type="text" class="database-field-value rr-structures-spot-name" value="${rrEscapeHtml(sel.key)}" style="width:100px;">`)}
                ${this._field(tt('Who'), this._selectHtml('rr-structures-person', [['', tt('Nobody')], ['blank', tt('Blank event')]].concat(templates.map(name => [name, name])), event ? (event.template || 'blank') : '', 'style="width:120px;"'))}
                ${event ? this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-person-name" value="${rrEscapeHtml(event.name)}" style="width:110px;">`) : ''}
                ${event ? this._field(tt('Facing'), facingArrows('rr-structures-person-facing', event.direction)) : ''}`;
        } else if (this.tool === 'effect' && floor) {
            const kinds = `<span style="display:inline-flex;gap:2px;">${DatabaseStructureEditor.EFFECT_KINDS.map(kind => `<button type="button" class="rr-btn-secondary rr-structures-next-effect" data-kind="${kind}" title="${rrEscapeHtml(this.effectName(kind))}" aria-pressed="${kind === this._effect.kind}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;${kind === this._effect.kind ? 'border-color:var(--color-accent);' : ''}">${DatabaseStructureEditor.icon(kind)}</button>`).join('')}</span>`;
            html = `${kindLabel(tt('Effect'))} ${kinds} <span style="color:var(--color-text-muted);">${rrEscapeHtml(this.effectName(this._effect.kind))}: ${tt(this._effect.kind === 'screen' ? 'click a wall; the screen faces the room.' : this._effect.kind === 'light' ? 'click a cell; the light hangs above it.' : 'click a cell; the animation plays there over and over.')}</span>`;
        } else if (sel && sel.kind === 'effect' && plan.effects[sel.key]) {
            const fx = plan.effects[sel.key];
            const field = (cls, label, value, min, max, step, key) => this._field(label, `<input type="number" class="database-field-value ${cls}" data-key="${key}" value="${value}" min="${min}" max="${max}" step="${step}" style="width:64px;">`);
            let fields = '';
            if (fx.type === 'screen') {
                const media = this.mediaChoices();
                fields = this._field(tt('Media'), this._selectHtml('rr-structures-effect-media', [['', tt('None')]].concat(media.map(name => [name, name])), fx.media, 'style="width:200px;"'))
                    + field('rr-structures-effect-num', tt('Width'), fx.width, 0.25, 60, 0.25, 'width') + field('rr-structures-effect-num', tt('Height'), fx.height, 0.25, 60, 0.25, 'height') + field('rr-structures-effect-num', tt('Up'), fx.z, 0, 120, 0.25, 'z')
                    + this._field(tt('Facing'), arrows('rr-structures-effect-facing', fx.facing))
                    + this._field(tt('Sound'), `<input type="checkbox" class="system-checkbox rr-structures-effect-audio" ${fx.audio ? 'checked' : ''}>`);
            } else if (fx.type === 'light') {
                fields = this._field(tt('Colour'), `<input type="color" class="rr-structures-effect-color" value="${fx.color}" style="width:36px;height:26px;padding:0;border:1px solid var(--color-border-input);background:none;">`)
                    + field('rr-structures-effect-num', tt('Radius'), fx.radius, 0.5, 60, 0.5, 'radius') + field('rr-structures-effect-num', tt('Strength'), fx.intensity, 0, 4, 0.1, 'intensity') + field('rr-structures-effect-num', tt('Up'), fx.z, 0, 120, 0.25, 'z');
            } else {
                const animations = this.animationChoices();
                fields = this._field(tt('Animation'), this._selectHtml('rr-structures-effect-animation', [[0, tt('None')]].concat(animations.map(a => [a.id, a.id + ': ' + a.name])), fx.animation, 'style="width:200px;"'))
                    + field('rr-structures-effect-num', tt('Up'), fx.z, 0, 120, 0.25, 'z');
            }
            html = `${kindLabel(this.effectName(fx.type))}
                ${this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-effect-name" value="${rrEscapeHtml(fx.name)}" style="width:100px;">`)}
                ${fields}`;
        } else if (this.tool === 'shape' && floor) {
            const pending = this._shape;
            const num = (i, min, max, step) => `<input type="number" class="database-field-value rr-structures-next-size" data-i="${i}" value="${pending.size[i]}" min="${min}" max="${max}" step="${step}" style="width:52px;">`;
            html = `${kindLabel(tt('Shape'))}
                ${this._shapePickHtml('rr-structures-next-pick', pending.kind)}
                ${this._field(tt('Size'), `${num(0, 0.25, 60, 0.25)}<span>×</span>${num(1, 0.25, 60, 0.25)}<span>×</span>${num(2, 0.25, 60, 0.25)}`)}
                <span style="color:var(--color-text-muted);">${tt('Click the plan to place it; on another shape, it sits on top. A tower is a cylinder with a dome on it.')}</span>`;
        } else {
            const hints = {
                select: tt('Click anything on the plan to select it, drag to move it. Delete removes it.'),
                room: tt('Drag on the plan to draw a room. Drag a room to move it, its edge to resize it.'),
                door: tt('Click a wall between two rooms for a door, an outer wall beside a room for the front door. Drag a door along its wall.'),
                window: tt('Click an outer wall for a window. Drag a window along the wall.'),
                stairs: tt('Click a cell inside a room to start stairs there. Each cell climbs one tile.'),
                shape: tt('Pick a shape and click the plan to put it there. Select it to move, turn and size it with the handles in the 3D view.'),
                effect: tt('Click a wall for a screen, or any cell for a light or an animation. They go on the map with the building.'),
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
        box.querySelector('.rr-structures-next-pick')?.addEventListener('click', event => this.openShapePicker(event.currentTarget, this._shape.kind, [...DatabaseStructureEditor.SHAPE_KINDS, 'tower'], kind => {
            // A new kind comes at its own size, so a dome is low and a tunnel long.
            this._shape.kind = kind;
            this._shape.size = (DatabaseStructureEditor.SHAPE_DEFAULTS[kind] || [4, 4, 4]).slice();
            this.renderInspector();
        }));
        for (const input of box.querySelectorAll('.rr-structures-next-size')) input.addEventListener('change', () => { const v = Number(input.value); this._shape.size[Number(input.dataset.i)] = Number.isFinite(v) && v > 0 ? Math.min(60, v) : 1; });
        this._syncGizmo();
        for (const button of box.querySelectorAll('.rr-structures-next-effect')) button.addEventListener('click', () => { this._effect.kind = button.dataset.kind; this.renderInspector(); });
        const fx = sel && sel.kind === 'effect' ? plan.effects[sel.key] : null;
        if (fx) {
            const changed = () => { this.markDirty(); this.renderInspector(); };
            box.querySelector('.rr-structures-effect-name')?.addEventListener('change', event => { const name = event.target.value.trim(); if (!name) { event.target.value = fx.name; return; } this.pushHistory(); fx.name = name; changed(); });
            box.querySelector('.rr-structures-effect-media')?.addEventListener('change', event => { this.pushHistory(); fx.media = event.target.value; changed(); });
            box.querySelector('.rr-structures-effect-animation')?.addEventListener('change', event => { this.pushHistory(); fx.animation = Math.max(0, Math.floor(Number(event.target.value)) || 0); changed(); });
            box.querySelector('.rr-structures-effect-audio')?.addEventListener('change', event => { this.pushHistory(); fx.audio = !!event.target.checked; changed(); });
            box.querySelector('.rr-structures-effect-color')?.addEventListener('change', event => { this.pushHistory(); fx.color = String(event.target.value).toLowerCase(); changed(); });
            for (const button of box.querySelectorAll('.rr-structures-effect-facing')) button.addEventListener('click', () => { this.pushHistory(); fx.facing = button.dataset.dir; changed(); });
            for (const input of box.querySelectorAll('.rr-structures-effect-num')) input.addEventListener('change', () => { const v = Number(input.value); if (!Number.isFinite(v)) { this.renderInspector(); return; } this.pushHistory(); fx[input.dataset.key] = Math.round(v * 100) / 100; changed(); });
        }
        box.querySelector('.rr-structures-shape-pick')?.addEventListener('click', event => this.openShapePicker(event.currentTarget, plan.shapes[sel.key]?.kind, DatabaseStructureEditor.SHAPE_KINDS, kind => { this.pushHistory(); plan.shapes[sel.key].kind = kind; this.markDirty(); this.renderInspector(); }));
        for (const button of box.querySelectorAll('.rr-structures-shape-mode')) button.addEventListener('click', () => { this._gizmoMode = button.dataset.mode; this.renderInspector(); });
        box.querySelector('.rr-structures-shape-lock')?.addEventListener('click', () => { this._sizeLock = !this._sizeLock; this.renderInspector(); });
        box.querySelector('.rr-structures-shape-duplicate')?.addEventListener('click', () => this.duplicateShape(sel.key));
        for (const input of box.querySelectorAll('.rr-structures-shape-size')) input.addEventListener('change', () => {
            const shape = plan.shapes[sel.key], i = Number(input.dataset.i), v = Number(input.value);
            if (!shape || !Number.isFinite(v) || v <= 0) { this.renderInspector(); return; }
            this.pushHistory();
            this.resizeShape(shape, i, Math.min(60, Math.round(v * 4) / 4), this._sizeLock);
            this.markDirty(); this.renderInspector();
        });
        for (const input of box.querySelectorAll('.rr-structures-shape-pos')) input.addEventListener('change', () => {
            const shape = plan.shapes[sel.key], i = Number(input.dataset.i), v = Number(input.value);
            if (!shape || !Number.isFinite(v)) { this.renderInspector(); return; }
            this.pushHistory();
            const [cx, cy] = DatabaseStructureEditor.shapeCentre(shape);
            if (i === 2) shape.z = Math.max(0, Math.min(120, Math.round(v * 4) / 4));
            else DatabaseStructureEditor.placeShapeAt(shape, i === 0 ? v : cx, i === 1 ? v : cy);
            this.markDirty(); this.renderInspector();
        });
        for (const input of box.querySelectorAll('.rr-structures-shape-param')) input.addEventListener('change', () => {
            const shape = plan.shapes[sel.key], key = input.dataset.i, v = Number(input.value);
            if (!shape || !Number.isFinite(v)) { this.renderInspector(); return; }
            this.pushHistory();
            if (key === 'sides') shape.sides = Math.max(3, Math.min(32, Math.round(v))); else if (key === 'sweep') shape.sweep = Math.max(15, Math.min(360, Math.round(v))); else if (key === 'thick') shape.thick = Math.max(0.02, Math.min(1, Math.round(v) / 100)); else shape.taper = Math.max(0, Math.min(1, Math.round(v) / 100));
            this.markDirty(); this.renderInspector();
        });
        for (const input of box.querySelectorAll('.rr-structures-shape-turn')) input.addEventListener('change', () => {
            const shape = plan.shapes[sel.key], i = Number(input.dataset.i), v = ((Math.round(Number(input.value)) || 0) % 360 + 360) % 360;
            if (!shape) return;
            this.pushHistory();
            if (i === 0) shape.angle = v; else if (i === 1) shape.tilt = v; else shape.roll = v;
            this.markDirty(); this.renderInspector();
        });
        box.querySelector('.rr-structures-shape-material')?.addEventListener('click', event => this.openMaterialPicker(event.currentTarget, name => { this.pushHistory(); plan.shapes[sel.key].material = name; this.markDirty(); this.renderInspector(); }));
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
        else if (sel.kind === 'shape') plan.shapes.splice(sel.key, 1);
        else if (sel.kind === 'effect') plan.effects.splice(sel.key, 1);
        else if (sel.kind === 'spot') { delete plan.spots[sel.key]; plan.events = plan.events.filter(item => item.spot !== sel.key); }
        this.selection = null;
        this.markDirty();
        this.renderInspector();
        this.renderMore();
    }

    /** What is not drawn: the materials, the building's numbers, and the parts of a plan of plans, each behind its own fold. */
    renderMore() {
        const more = this._detail?.querySelector('.rr-structures-more');
        if (!more || !this.current) return;
        const tt = text => this._t(text);
        const plan = this.current.plan;
        const materialNames = this.materials();
        const roleLabels = { glass: tt('Glass'), wall: tt('Wall'), inner: tt('Inner wall'), floor: tt('Floor'), wet: tt('Wet floor'), roof: tt('Roof'), stair: tt('Stair'), path: tt('Path') };
        const styleNames = Object.keys(DatabaseStructureEditor.STYLES);
        const otherPlans = this.records().filter(entry => entry !== this.current.entry).map(entry => [entry.file || entry.name, entry.name]);
        const fold = (key, title, count, body) => {
            const open = !!this._open[key];
            const badge = !open && count ? ` <span style="font-weight:normal;text-transform:none;color:var(--color-text-muted);">(${count})</span>` : '';
            return `<div class="sidebar-header rr-structures-fold" data-fold="${key}" style="display:flex;align-items:center;gap:8px;"><span style="flex:0 0 12px;font-size:10px;color:var(--color-text-muted);">${open ? '▾' : '▸'}</span><span style="flex:1;">${title}${badge}</span></div>
                <div class="database-section-content" style="${open ? '' : 'display:none;'}padding:8px 10px 10px;">${body}</div>`;
        };
        const row = (...fields) => `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">${fields.join('')}</div>`;
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
        more.innerHTML = fold('materials', tt('Materials'), null, row(...DatabaseStructureEditor.MATERIAL_ROLES.map(materialField)))
            + fold('building', tt('Building'), null, row(
                this._field(tt('Storey (tiles)'), this._numberHtml('rr-structures-field', plan.storey, 'data-path="storey" min="3" max="12"')),
                this._field(tt('Roof'), `<input type="checkbox" class="system-checkbox rr-structures-roof-on" ${plan.roof.pitch !== null ? 'checked' : ''}>`),
                plan.roof.pitch !== null ? this._field(tt('Roof pitch (rows)'), this._numberHtml('rr-structures-field', plan.roof.pitch, 'data-path="roof.pitch" min="0" max="20"')) : '',
                this._field(tt('A window every (cells)'), this._numberHtml('rr-structures-field', plan.windows.every, 'data-path="windows.every" min="0" max="60"')),
                this._field(tt('Window width'), this._numberHtml('rr-structures-field', plan.windows.width, 'data-path="windows.width" min="1" max="8"'))))
            + fold('parts', tt('Parts'), plan.parts.length + plan.paths.length, `
                <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:6px;">${tt('Other plans placed on this one, and paved paths between them.')}</div>
                ${rows('parts', { cols: 'minmax(70px,1fr) minmax(90px,1fr) 52px 52px 52px minmax(90px,1fr) 28px', labels: [tt('Part'), tt('Plan'), 'x', 'y', tt('Turn'), tt('Style')] }, partsBody, tt('No parts.'))}
                <div style="margin:4px 0 10px;">${add('parts')}</div>
                ${rows('paths', { cols: '52px 52px 52px 52px minmax(90px,1fr) 28px', labels: ['x0', 'y0', 'x1', 'y1', tt('Material')] }, pathsBody, tt('No paths.'))}
                <div style="margin-top:4px;">${add('paths')}</div>`);
        this.bindMore(more);
    }

    bindMore(more) {
        const plan = this.current.plan;
        const materialNames = this.materials();
        const number = (input, min, max) => Math.max(min, Math.min(max, Math.floor(Number(input.value)) || 0));
        for (const header of more.querySelectorAll('.rr-structures-fold')) header.addEventListener('click', () => { const key = header.dataset.fold; this._open[key] = !this._open[key]; this.renderMore(); });
        for (const button of more.querySelectorAll('.rr-structures-material')) {
            button.addEventListener('click', () => this.openMaterialPicker(button, name => { this.pushHistory(); plan.materials[button.dataset.role] = name; this.markDirty(); this.renderBar(); this.renderMore(); }));
        }
        more.querySelector('.rr-structures-roof-on')?.addEventListener('change', event => { this.pushHistory(); plan.roof.pitch = event.target.checked ? 2 : null; this.markDirty(); this.renderMore(); this.renderFloorTabs?.(); });
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
                this._open.parts = true;
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
            palette.structures?.(true);
            palette.structure = entry.file;
            if (reactor.buildHotbar) reactor.buildHotbar.show(); else palette.activate?.();
            palette.setMode?.('stamp');
            reactor.buildHotbar?.render?.();
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
        const effect = plan.effects.findIndex(fx => fx.at[0] === x && fx.at[1] === y);
        if (effect >= 0) return { kind: 'effect', key: effect };
        const spot = Object.entries(plan.spots).find(([, at]) => at[0] === x && at[1] === y);
        if (spot) return { kind: 'spot', key: spot[0] };
        const stair = plan.stairs.findIndex(s => s.floor === floorIndex && s.from[0] === x && s.from[1] === y);
        if (stair >= 0) return { kind: 'stair', key: stair };
        for (let i = 0; i < floor.doors.length; i++) if (this.doorCellsOf(i, floor).some(([cx, cy]) => cx === x && cy === y)) return { kind: 'door', key: i };
        const window = floor.windows.findIndex(([wx, wy]) => wx === x && wy === y);
        if (window >= 0) return { kind: 'window', key: window };
        for (let i = plan.shapes.length - 1; i >= 0; i--) if (DatabaseStructureEditor.shapeCovers(plan.shapes[i], x + 0.5, y + 0.5)) return { kind: 'shape', key: i };
        const room = this.roomAtCell(x, y, floor);
        if (room) return { kind: 'room', key: room };
        return null;
    }

    /** The cells a shape covers, from the runtime's own rule when it is loaded, else its box. */
    /** The top of the tallest shape whose box covers the cell, or the ground. */
    shapeTopAt(x, y) {
        let top = 0;
        for (const shape of this.current.plan.shapes) {
            if (!DatabaseStructureEditor.shapeCovers(shape, x + 0.5, y + 0.5)) continue;
            top = Math.max(top, Math.round(DatabaseStructureEditor.shapeBounds(shape).z1 * 4) / 4);
        }
        return top;
    }

    shapeCells(shape) {
        const piece = DatabaseStructureEditor.pieceOf(shape);
        if (typeof Reactor3D !== 'undefined' && Reactor3D.pieceFootprint) return Reactor3D.pieceFootprint(piece);
        // Without the runtime: the same round rule, a cell counting when its middle lies in the turned ellipse.
        const [w, , d] = shape.size, cells = [], angle = -(shape.angle || 0) * Math.PI / 180, cx = shape.at[0] + 0.5, cz = shape.at[1] + 0.5;
        const reach = Math.max(w, d) / 2 + 1;
        for (let y = Math.floor(cz - reach); y <= Math.ceil(cz + reach); y++) for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
            if (x < 0 || y < 0) continue;
            const px = x + 0.5 - cx, pz = y + 0.5 - cz;
            const u = px * Math.cos(angle) - pz * Math.sin(angle), v = px * Math.sin(angle) + pz * Math.cos(angle);
            if ((u * u) / ((w / 2 + 0.15) ** 2) + (v * v) / ((d / 2 + 0.15) ** 2) <= 1) cells.push([x, y]);
        }
        if (!cells.length) cells.push([shape.at[0], shape.at[1]]);
        return cells;
    }

    /** Whether a window may go here: an outer wall of this floor's rooms. */
    onRing(x, y) {
        const floor = this.currentFloor();
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!floor || !SP || !SP.canWindow) return false;
        return SP.canWindow(floor.rooms, this.current.plan.size, x, y);
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
        // A door, window, stairs, person or effect is picked up by any tool; a room only by Select and
        // Room, and a shape only by Select, since the other tools place things on and beside shapes.
        if (hit && (hit.kind !== 'room' || this.tool === 'select' || this.tool === 'room') && !(hit.kind === 'shape' && this.tool !== 'select')) {
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
            } else if (t.kind === 'effect') {
                plan.effects[t.key].at = [cell.x, cell.y];
            } else if (t.kind === 'shape') {
                plan.shapes[t.key].at = [cell.x, cell.y];
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
        } else if (this.tool === 'shape') {
            this.pushHistory();
            const { kind, size } = this._shape;
            const [w, h, d] = size;
            // On top of whatever shape already covers the cell, so a dome lands on its cylinder
            // and a second cylinder makes a tier; a dome wears the roof's material.
            const z = this.shapeTopAt(cell.x, cell.y);
            const material = kind => kind === 'dome' ? plan.materials.roof || '' : '';
            const fresh = (kind, z, size) => ({ kind, at: [cell.x, cell.y], z, size, angle: 0, tilt: 0, roll: 0, offset: [0, 0], material: material(kind) });
            if (kind === 'tower') {
                plan.shapes.push(fresh('cylinder', z, [w, h, d]));
                plan.shapes.push(fresh('dome', Math.round((z + h) * 4) / 4, [w, Math.round(w * 2) / 4, d]));
                this.selection = { kind: 'shape', key: plan.shapes.length - 2 };
            } else {
                plan.shapes.push(fresh(kind, z, [w, h, d]));
                this.selection = { kind: 'shape', key: plan.shapes.length - 1 };
            }
            this.markDirty();
        } else if (this.tool === 'effect') {
            const kind = this._effect.kind, own = DatabaseStructureEditor.EFFECT_DEFAULTS[kind];
            // A screen goes on a wall and faces the room beside it; a light or an animation goes anywhere.
            let facing = 'south';
            if (kind === 'screen') {
                if (room) { this.selection = null; return; }
                const beside = [['south', 0, 1], ['north', 0, -1], ['east', 1, 0], ['west', -1, 0]].find(([, dx, dy]) => this.roomAtCell(cell.x + dx, cell.y + dy, floor));
                if (!beside) { this.selection = null; return; }
                facing = beside[0];
            }
            this.pushHistory();
            const name = DatabaseStructureEditor.freshName(plan.effects.map(f => f.name), this.effectName(kind).toLowerCase());
            const fx = Object.assign({ name, type: kind, at: [cell.x, cell.y] }, JSON.parse(JSON.stringify(own)));
            if (kind === 'screen') Object.assign(fx, { facing, audio: false, scanlines: 0 });
            plan.effects.push(fx);
            this.selection = { kind: 'effect', key: plan.effects.length - 1 };
            this.markDirty();
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
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        let pair = null, alongX = null, side = null;
        if (n && s && n !== s) { pair = [n, s]; alongX = true; }
        else if (w && e && w !== e) { pair = [w, e]; alongX = false; }
        else if (SP && SP.isOuterWallCell && SP.isOuterWallCell(floor.rooms, plan.size, x, y)) {
            // A front door on the side of the room the click is on.
            if (n) { pair = [n, 'outside']; side = 'south'; alongX = true; }
            else if (s) { pair = [s, 'outside']; side = 'north'; alongX = true; }
            else if (w) { pair = [w, 'outside']; side = 'east'; alongX = false; }
            else if (e) { pair = [e, 'outside']; side = 'west'; alongX = false; }
        }
        if (!pair) return false;
        this.pushHistory();
        floor.doors.push(side ? [pair[0], pair[1], 3, alongX ? x : y, side] : [pair[0], pair[1], 3, alongX ? x : y]);
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
        if (hit && hit.kind !== 'room' && !(hit.kind === 'shape' && this.tool !== 'select')) return 'move';
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
        // Shapes: each one's own outline on the ground, its solid parts filled in its kind's
        // colour, a hollow one's box dashed; a tilted or rolled one shows the shadow of its box.
        const tints = typeof PieceBuilderManager !== 'undefined' && PieceBuilderManager.OVERLAY_COLOURS ? PieceBuilderManager.OVERLAY_COLOURS : {};
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        for (const shape of plan.shapes) {
            const [w, , d] = shape.size, angle = shape.angle * Math.PI / 180;
            const [cx, cy] = DatabaseStructureEditor.shapeCentre(shape);
            const tint = '#' + (tints[shape.kind] || 0x8f8fa8).toString(16).padStart(6, '0');
            ctx.save();
            ctx.fillStyle = tint; ctx.strokeStyle = colours('--color-text'); ctx.lineWidth = 1;
            const turned = R && R.shapeTurned && R.shapeTurned(DatabaseStructureEditor.pieceOf(shape));
            if (turned && R.convexHull) {
                const hull = R.convexHull(DatabaseStructureEditor.shapeCorners(shape).map(q => [q[0], q[2]]));
                ctx.globalAlpha = 0.5; ctx.beginPath();
                hull.forEach(([hx, hy], i) => i ? ctx.lineTo(ox + hx * cell, oy + hy * cell) : ctx.moveTo(ox + hx * cell, oy + hy * cell));
                ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.setLineDash([4, 3]); ctx.stroke();
            } else {
                ctx.translate(ox + cx * cell, oy + cy * cell);
                ctx.rotate(angle);
                const outline = DatabaseStructureEditor.shapeOutline(shape.kind, shape);
                const trace = poly => { poly.forEach(([u, v], i) => i ? ctx.lineTo(u * w * cell, v * d * cell) : ctx.moveTo(u * w * cell, v * d * cell)); ctx.closePath(); };
                ctx.globalAlpha = 0.75; ctx.beginPath();
                for (const poly of outline.solid) trace(poly);
                ctx.fill('evenodd'); ctx.globalAlpha = 1; ctx.stroke();
                if (outline.open) { ctx.setLineDash([4, 3]); ctx.beginPath(); trace(outline.open); ctx.stroke(); }
            }
            ctx.restore();
        }
        // Effects: a screen is a bar on the side of its wall that faces the room, a light a dot with rays, an animation a star.
        for (const fx of plan.effects) {
            const cx = ox + (fx.at[0] + 0.5) * cell, cy = oy + (fx.at[1] + 0.5) * cell;
            ctx.save();
            if (fx.type === 'screen') {
                const [dx, dy] = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[fx.facing] || [0, 1];
                ctx.fillStyle = '#4fd1ff';
                const along = dx ? 0.18 : 0.8, across = dx ? 0.8 : 0.18;
                ctx.fillRect(cx + dx * cell * 0.3 - along * cell / 2, cy + dy * cell * 0.3 - across * cell / 2, along * cell, across * cell);
                ctx.fillStyle = '#10222c'; ctx.beginPath(); ctx.moveTo(cx - cell * 0.1, cy - cell * 0.12); ctx.lineTo(cx + cell * 0.14, cy); ctx.lineTo(cx - cell * 0.1, cy + cell * 0.12); ctx.closePath(); ctx.fill();
            } else if (fx.type === 'light') {
                ctx.strokeStyle = fx.color; ctx.fillStyle = fx.color; ctx.lineWidth = Math.max(1, cell * 0.08);
                ctx.beginPath(); ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2); ctx.fill();
                for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * cell * 0.24, cy + Math.sin(a) * cell * 0.24); ctx.lineTo(cx + Math.cos(a) * cell * 0.4, cy + Math.sin(a) * cell * 0.4); ctx.stroke(); }
            } else {
                ctx.fillStyle = '#ff7ad9'; ctx.beginPath();
                for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI * 2, r = i % 2 ? cell * 0.16 : cell * 0.4; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
                ctx.closePath(); ctx.fill();
            }
            ctx.restore();
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
            if (hit.kind === 'effect' && plan.effects[hit.key]) { const a = plan.effects[hit.key].at; return [[a[0], a[1], a[0], a[1]]]; }
            if (hit.kind === 'shape' && plan.shapes[hit.key]) { const b = DatabaseStructureEditor.shapeBounds(plan.shapes[hit.key]); return [[Math.floor(b.x0 + 1e-6), Math.floor(b.y0 + 1e-6), Math.ceil(b.x1 - 1e-6) - 1, Math.ceil(b.y1 - 1e-6) - 1]]; }
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
        else if (DatabaseStructureEditor.isEmpty(this.current.plan)) lines.push(this._t('Draw a room to start the building, or place a shape.'));
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
        // Looking inside: the top floor's ceiling and the roof are left off. On unless the plan
        // has a roof to look at, until the button says otherwise.
        const peek = this._peek === null ? plan.roof.pitch === null : this._peek;
        const lid = plan.storey * Math.max(1, plan.floors.length);
        const shown = peek ? report.built.filter(piece => !(piece.z >= lid - 1e-6 && !DatabaseStructureEditor.SHAPE_KINDS.includes(piece.kind))) : report.built;
        const mapData = { width: W, height: H, reactor3d: { version: 1, elevation: new Array(W * H).fill(0), pieces: shown } };
        const byMaterial = new Map();
        const peekButton = this._detail?.querySelector('.rr-structures-peek');
        if (peekButton) { peekButton.setAttribute('aria-pressed', String(peek)); peekButton.style.borderColor = peek ? 'var(--color-accent)' : ''; }
        for (const piece of shown) { const key = piece.material || ''; if (!byMaterial.has(key)) byMaterial.set(key, []); byMaterial.get(key).push(piece); }
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
        this._layoutHandles(preview, plan);
        this._layoutProxies(preview, plan);
        this._layoutEffects(preview, plan);
        this._setGhost(preview, null);
        this._syncGizmo(preview);
        if (!preview.distance || preview.autoDistance) { preview.distance = Math.max(W, H) * 1.3 + 6; preview.autoDistance = true; }
        preview.dirty = true;
    }

    /**
     * Two handles on the building: one on the roof's ridge for its pitch,
     * one at the top of the walls for the storey. Dragging either up or
     * down changes the number, one per few pixels, and the building
     * rebuilds as it goes.
     */
    _layoutHandles(preview, plan) {
        if (!preview.handles) {
            const make = key => {
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf0c060, depthTest: false, transparent: true, opacity: 0.9 }));
                mesh.renderOrder = 10;
                mesh.userData.handle = key;
                preview.scene.add(mesh);
                return mesh;
            };
            preview.handles = { pitch: make('pitch'), storey: make('storey') };
        }
        const [W, H] = plan.size, floors = Math.max(1, plan.floors.length), S = plan.storey;
        const roofZ = floors * S;
        const pitch = Math.max(0, Math.min(Math.floor((H - 1) / 2), plan.roof.pitch || 0));
        const radius = Math.max(0.35, Math.min(1.2, Math.max(W, H) * 0.03));
        const show = plan.floors.length > 0;
        preview.handles.pitch.visible = show && plan.roof.pitch !== null;
        preview.handles.storey.visible = show;
        preview.handles.pitch.scale.setScalar(radius);
        preview.handles.storey.scale.setScalar(radius);
        preview.handles.pitch.position.set(W / 2, roofZ + pitch + 0.2, H / 2);
        preview.handles.storey.position.set(W + 0.3, roofZ, H + 0.3);
    }

    /** The handle under a canvas point, if any. */
    _handleAt(canvas, clientX, clientY) {
        const preview = this._preview;
        if (!preview || !preview.handles) return null;
        const rect = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), preview.camera);
        const hits = ray.intersectObjects(Object.values(preview.handles).filter(h => h.visible), false);
        return hits.length ? hits[0].object.userData.handle : null;
    }

    _showHandleLabel(text, x, y) {
        let label = this._detail?.querySelector('.rr-structures-handle-label');
        if (!label) {
            label = document.createElement('div');
            label.className = 'rr-structures-handle-label';
            label.style.cssText = 'position:fixed;z-index:10015;padding:3px 8px;font-size:12px;border-radius:3px;background:var(--color-bg-panel);border:1px solid var(--color-accent);color:var(--color-text-strong);pointer-events:none;';
            this._detail?.appendChild(label);
        }
        if (!text) { label.remove(); return; }
        label.textContent = text;
        label.style.left = (x + 14) + 'px';
        label.style.top = (y - 28) + 'px';
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
            if (preview.dirty || preview.live) {
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
        const tt = text => this._t(text);
        const PIXELS_PER_STEP = 14;
        canvas.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            const grab = this.current && typeof THREE !== 'undefined' ? this._grabGizmo(canvas, event.clientX, event.clientY) : null;
            if (grab) {
                drag = { gizmo: grab, snapshot: JSON.stringify(this.current.plan), changed: false };
                canvas.style.cursor = 'grabbing';
                canvas.setPointerCapture?.(event.pointerId);
                return;
            }
            const handle = this.current && typeof THREE !== 'undefined' ? this._handleAt(canvas, event.clientX, event.clientY) : null;
            if (handle) {
                const plan = this.current.plan;
                drag = { handle, y: event.clientY, start: handle === 'pitch' ? (plan.roof.pitch || 0) : plan.storey, snapshot: JSON.stringify(plan), changed: false };
                canvas.style.cursor = 'ns-resize';
                this._showHandleLabel((handle === 'pitch' ? tt('Roof pitch') : tt('Storey')) + ': ' + drag.start, event.clientX, event.clientY);
            } else {
                drag = { x: event.clientX, y: event.clientY, downX: event.clientX, downY: event.clientY, moved: 0 };
            }
            canvas.setPointerCapture?.(event.pointerId);
        });
        canvas.addEventListener('pointermove', event => {
            if (!this._preview) return;
            if (!drag) {
                const handle = this.current && typeof THREE !== 'undefined' ? this._handleAt(canvas, event.clientX, event.clientY) : null;
                canvas.style.cursor = handle ? 'ns-resize' : (this.current && typeof THREE !== 'undefined' && this._shapeAt(canvas, event.clientX, event.clientY) >= 0 ? 'pointer' : 'grab');
                return;
            }
            if (drag.gizmo) {
                if (this._dragGizmo(drag.gizmo, event.clientX, event.clientY)) {
                    drag.changed = true;
                    this._setGhost(this._preview, drag.gizmo.shape);
                    this._syncGizmo(this._preview);
                    this.requestPlanRedraw();
                    const shape = drag.gizmo.shape, mode = drag.gizmo.mode;
                    const [cx, cy] = DatabaseStructureEditor.shapeCentre(shape);
                    const text = mode === 'move' ? `${cx}, ${cy}, ${shape.z}` : mode === 'turn' ? `${shape.angle}°, ${shape.tilt || 0}°, ${shape.roll || 0}°` : shape.size.join(' × ');
                    this._showHandleLabel(text, event.clientX, event.clientY);
                }
                return;
            }
            if (drag.handle) {
                const plan = this.current.plan;
                const steps = Math.round((drag.y - event.clientY) / PIXELS_PER_STEP);
                const value = drag.handle === 'pitch' ? Math.max(0, Math.min(20, drag.start + steps)) : Math.max(3, Math.min(12, drag.start + steps));
                const current = drag.handle === 'pitch' ? plan.roof.pitch : plan.storey;
                this._showHandleLabel((drag.handle === 'pitch' ? tt('Roof pitch') : tt('Storey')) + ': ' + value, event.clientX, event.clientY);
                if (value !== current) {
                    if (drag.handle === 'pitch') plan.roof.pitch = value; else plan.storey = value;
                    drag.changed = true;
                    this._reportStale = true;
                    this.schedulePreview();
                }
                return;
            }
            drag.moved = (drag.moved || 0) + Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y);
            this._preview.yaw += (event.clientX - drag.x) * 0.01;
            this._preview.pitch = Math.max(0.05, Math.min(1.5, this._preview.pitch + (event.clientY - drag.y) * 0.01));
            drag = { x: event.clientX, y: event.clientY };
            this._preview.dirty = true;
        });
        const stop = event => {
            if (drag && drag.gizmo) {
                const g = this._preview && this._preview.gizmo;
                if (g) { RRAxisArrows3D.emphasize(g.arrows, null, false); RRPoseRings3D.emphasize(g.rings, null, false); for (const axis of ['u', 'y', 'v']) g.cubes[axis].material.opacity = 0.9; }
                this._showHandleLabel(null);
                canvas.style.cursor = 'grab';
                if (drag.changed) {
                    this._history.push(drag.snapshot);
                    if (this._history.length > DatabaseStructureEditor.HISTORY) this._history.shift();
                    this._future.length = 0;
                    this.markDirty();
                    this.renderInspector();
                } else if (this._preview) this._setGhost(this._preview, null);
                drag = null;
                return;
            }
            // A press that did not orbit picks the shape under it.
            if (drag && !drag.handle && (drag.moved || 0) < 4 && event && this.current && typeof THREE !== 'undefined') {
                const index = this._shapeAt(canvas, event.clientX, event.clientY);
                if (index >= 0) {
                    this.selection = { kind: 'shape', key: index };
                    if (this.tool === 'shape') this.tool = 'select';
                    this.renderInspector(); this.renderTools(); this.requestPlanRedraw();
                }
            }
            if (drag && drag.handle) {
                this._showHandleLabel(null);
                canvas.style.cursor = 'grab';
                if (drag.changed) {
                    this._history.push(drag.snapshot);
                    if (this._history.length > DatabaseStructureEditor.HISTORY) this._history.shift();
                    this._future.length = 0;
                    this.markDirty();
                    this.renderMore();
                }
            }
            drag = null;
        };
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
        for (const handle of Object.values(preview.handles || {})) { handle.geometry.dispose(); handle.material.dispose(); }
        this._disposeGizmo(preview);
        this._clearProxies(preview);
        this._clearEffects(preview);
        preview.ground?.geometry.dispose();
        this._showHandleLabel(null);
        preview.renderer.dispose();
        this._preview = null;
    }

    // ---- Shapes: pickers, placement, the numbers behind the handles ---------

    /** The kind's name for people: the palette's own names, the Tower's phrase. */
    kindName(kind) {
        if (kind === 'tower') return this._t('Tower');
        const key = 'pieces.kind.' + kind;
        const name = typeof window !== 'undefined' && window.I18n && typeof window.I18n.t === 'function' ? window.I18n.t(key) : key;
        return name && name !== key ? name : kind.charAt(0).toUpperCase() + kind.slice(1);
    }

    /** A button showing a kind's icon and name that opens the shape picker. */
    _shapePickHtml(cls, kind) {
        return `<button type="button" class="rr-btn-secondary ${cls}" data-kind="${rrEscapeHtml(kind)}" title="${rrEscapeHtml(this._t('Pick a shape'))}" style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:2px 8px 2px 4px;text-transform:none;font-weight:normal;">${DatabaseStructureEditor.icon(kind)}<span>${rrEscapeHtml(this.kindName(kind))}</span><span style="opacity:.6;font-size:10px;">▾</span></button>`;
    }

    /** The grid of shapes under a kind button; a click chooses, Escape or a click elsewhere closes. */
    openShapePicker(button, current, kinds, onPick) {
        this.closeMaterialPicker();
        const grid = document.createElement('div');
        grid.className = 'rr-structures-picker rr-structures-shape-picker';
        grid.setAttribute('role', 'listbox');
        grid.style.cssText = 'position:fixed;z-index:10020;display:grid;grid-template-columns:repeat(4, 74px);gap:4px;padding:8px;background:var(--color-bg-panel);border:1px solid var(--color-border);border-radius:4px;box-shadow:0 6px 18px rgba(0,0,0,.35);';
        grid.innerHTML = kinds.map(kind => `<button type="button" class="rr-btn-secondary rr-structures-shape-option" data-kind="${kind}" aria-checked="${kind === current}" style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;font-size:11px;text-transform:none;font-weight:normal;${kind === current ? 'border-color:var(--color-accent);' : ''}"><span style="display:block;transform:scale(1.5);margin:4px 0 6px;">${DatabaseStructureEditor.icon(kind)}</span><span>${rrEscapeHtml(this.kindName(kind))}</span></button>`).join('');
        const rect = button.getBoundingClientRect();
        grid.style.left = Math.max(8, Math.min(window.innerWidth - 330, rect.left)) + 'px';
        grid.style.top = (rect.bottom + 4 + 280 > window.innerHeight ? rect.top - 4 - 280 : rect.bottom + 4) + 'px';
        document.body.appendChild(grid);
        for (const el of grid.querySelectorAll('.rr-structures-shape-option')) el.addEventListener('click', () => { onPick(el.dataset.kind); this.closeMaterialPicker(); });
        const away = event => { if (!grid.contains(event.target) && event.target !== button) this.closeMaterialPicker(); };
        const key = event => { if (event.key === 'Escape') this.closeMaterialPicker(); };
        setTimeout(() => { document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true); }, 0);
        this._picker = { grid, away, key };
    }

    /** The selected shape, when the selection is one. */
    selectedShape() {
        const sel = this.selection;
        return sel && sel.kind === 'shape' && this.current ? this.current.plan.shapes[sel.key] || null : null;
    }

    /** A plan's shape as the runtime's piece, stood at the plan's origin. */
    static pieceOf(shape) {
        const piece = { kind: shape.kind, x: shape.at[0], y: shape.at[1], z: shape.z, rot: 0, size: shape.size, angle: shape.angle, tilt: shape.tilt || 0, roll: shape.roll || 0, offset: shape.offset || [0, 0] };
        if (shape.sides !== undefined) piece.sides = shape.sides;
        if (shape.taper !== undefined) piece.taper = shape.taper;
        if (shape.sweep !== undefined) piece.sweep = shape.sweep;
        if (shape.thick !== undefined) piece.thick = shape.thick;
        return piece;
    }

    /** The shape's middle on the ground, in plan cells (its cell's middle plus its offset). */
    static shapeCentre(shape) {
        return [shape.at[0] + 0.5 + (shape.offset ? shape.offset[0] || 0 : 0), shape.at[1] + 0.5 + (shape.offset ? shape.offset[1] || 0 : 0)];
    }

    /** Put the shape's middle at a point of the ground: the cell under it, and the rest as its offset. */
    static placeShapeAt(shape, cx, cy) {
        const clamp = v => Math.max(0.5, Math.min(this.SIZE_MAX - 0.5, Math.round(v * 100) / 100));
        cx = clamp(cx); cy = clamp(cy);
        const ax = Math.min(this.SIZE_MAX - 1, Math.floor(cx)), ay = Math.min(this.SIZE_MAX - 1, Math.floor(cy));
        shape.at = [ax, ay];
        const ox = Math.round((cx - ax - 0.5) * 100) / 100, oy = Math.round((cy - ay - 0.5) * 100) / 100;
        shape.offset = [ox, oy];
        return shape;
    }

    /** The eight corners of the shape's turned box, [x, up, y] in plan units, via the runtime; a plain box without it. */
    static shapeCorners(shape) {
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        const corners = [];
        if (R && R.shapePlacer) {
            const at = R.shapePlacer(this.pieceOf(shape), 0);
            for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) corners.push(at(u, y, v));
            return corners;
        }
        const [cx, cy] = this.shapeCentre(shape), [w, h, d] = shape.size, a = (shape.angle || 0) * Math.PI / 180;
        for (const u of [-0.5, 0.5]) for (const y of [0, 1]) for (const v of [-0.5, 0.5]) corners.push([cx + u * w * Math.cos(a) - v * d * Math.sin(a), shape.z + y * h, cy + u * w * Math.sin(a) + v * d * Math.cos(a)]);
        return corners;
    }

    /** Where the shape's box reaches on the ground and up: { x0, x1, y0, y1, z0, z1 } in plan units. */
    static shapeBounds(shape) {
        const c = this.shapeCorners(shape);
        return { x0: Math.min(...c.map(q => q[0])), x1: Math.max(...c.map(q => q[0])), z0: Math.min(...c.map(q => q[1])), z1: Math.max(...c.map(q => q[1])), y0: Math.min(...c.map(q => q[2])), y1: Math.max(...c.map(q => q[2])) };
    }

    /** Whether a point of the ground (plan units) is under the shape's turned box. */
    static shapeCovers(shape, px, py) {
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        if (R && R.shapeTurned && R.shapeTurned(this.pieceOf(shape)) && R.convexHull && R.hullReach) {
            return R.hullReach([px, py], R.convexHull(this.shapeCorners(shape).map(q => [q[0], q[2]]))) <= 1e-9;
        }
        const [cx, cy] = this.shapeCentre(shape), [w, , d] = shape.size, a = -(shape.angle || 0) * Math.PI / 180;
        const dx = px - cx, dy = py - cy;
        const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
        return Math.abs(u) <= w / 2 + 1e-9 && Math.abs(v) <= d / 2 + 1e-9;
    }

    /**
     * The shape's outline on the plan, polygons in its own frame (u across,
     * v along, -0.5..0.5 of its size): a circle for a round one, a ring for a
     * hollow one, the two posts of an arch. `open` is the box round a hollow
     * shape, drawn dashed.
     */
    static shapeOutline(kind, shape) {
        const circle = (r, n = 32, turn = 0) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2 + turn) * r, Math.sin(i / n * Math.PI * 2 + turn) * r]);
        const rect = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        const own = this.SHAPE_PARAMS[kind] || {};
        const sides = 'sides' in own ? Math.max(3, Math.min(32, Math.round(Number(shape && shape.sides !== undefined ? shape.sides : own.sides)))) : 32;
        const sweep = 'sweep' in own ? Math.max(1, Math.min(360, Number(shape && shape.sweep !== undefined ? shape.sweep : own.sweep))) : 360;
        const thick = 'thick' in own ? Math.max(0.02, Math.min(1, Number(shape && shape.thick !== undefined ? shape.thick : own.thick))) : 0.3;
        // An arc of the circle centred on +v, as a sector (solid) or an annular sector (hollow).
        const arc = (ro, ri) => {
            const a = sweep * Math.PI / 180, start = Math.PI / 2 - a / 2, n = 32;
            const outer = Array.from({ length: n + 1 }, (_, i) => [Math.cos(start + i / n * a) * ro, Math.sin(start + i / n * a) * ro]);
            if (!ri) return outer.concat([[0, 0]]);
            const inner = Array.from({ length: n + 1 }, (_, i) => [Math.cos(start + (n - i) / n * a) * ri, Math.sin(start + (n - i) / n * a) * ri]);
            return outer.concat(inner);
        };
        switch (kind) {
            case 'cylinder': return sweep < 360 ? { solid: [arc(0.5, 0)] } : { solid: [circle(0.5)] };
            case 'cone': case 'dome': case 'sphere': case 'capsule': case 'dish': return { solid: [circle(0.5, sides === 32 ? 32 : sides)] };
            case 'hull': case 'spike': {
                const poly = circle(1, sides, Math.PI / sides);
                const mx = Math.max(...poly.map(q => Math.abs(q[0]))), mz = Math.max(...poly.map(q => Math.abs(q[1])));
                return { solid: [poly.map(([u, v]) => [u / mx * 0.5, v / mz * 0.5])] };
            }
            case 'tube': { const ri = 0.5 * (1 - thick); return sweep < 360 ? { solid: [arc(0.5, ri)], open: rect(-0.5, -0.5, 0.5, 0.5) } : { solid: [circle(0.5), circle(ri)], open: rect(-0.5, -0.5, 0.5, 0.5) }; }
            case 'ring': { const ri = 0.5 * (1 - 2 * thick); return sweep < 360 ? { solid: [arc(0.5, ri)], open: rect(-0.5, -0.5, 0.5, 0.5) } : { solid: [circle(0.5), circle(ri)], open: rect(-0.5, -0.5, 0.5, 0.5) }; }
            case 'arch': case 'tunnel': return { solid: [rect(-0.5, -0.5, -0.35, 0.5), rect(0.35, -0.5, 0.5, 0.5)], open: rect(-0.5, -0.5, 0.5, 0.5) };
            default: return { solid: [rect(-0.5, -0.5, 0.5, 0.5)] };
        }
    }

    /** Set one dimension of a shape; with the lock on, the other two follow in proportion. */
    resizeShape(shape, i, value, lock) {
        const snap = v => Math.max(0.25, Math.round(v * 4) / 4);
        if (lock && shape.size[i] > 0) {
            const k = value / shape.size[i];
            shape.size = shape.size.map(v => Math.min(60, snap(v * k)));
        }
        shape.size[i] = Math.min(60, snap(value));
    }

    /** A copy of the shape beside it, selected. */
    duplicateShape(index) {
        const plan = this.current?.plan, shape = plan?.shapes[index];
        if (!shape) return null;
        this.pushHistory();
        const copy = JSON.parse(JSON.stringify(shape));
        const [cx, cy] = DatabaseStructureEditor.shapeCentre(shape);
        const { x0, x1 } = DatabaseStructureEditor.shapeBounds(shape);
        DatabaseStructureEditor.placeShapeAt(copy, cx + (x1 - x0) + 0.5, cy);
        plan.shapes.push(copy);
        this.selection = { kind: 'shape', key: plan.shapes.length - 1 };
        this.markDirty(); this.renderInspector(); this.renderTools();
        return copy;
    }

    /**
     * Where a dragged shape clicks into place along one axis (0 x, 1 up, 2 y):
     * its faces and middle against every other shape's, within reach; else
     * the quarter-tile grid. `travel` is how far it has moved from `from`,
     * the bounds it started with.
     */
    snapTravel(shape, axis, travel, from) {
        const plan = this.current.plan;
        const keys = [['x0', 'x1'], ['z0', 'z1'], ['y0', 'y1']][axis];
        const mine = [from[keys[0]], from[keys[1]], (from[keys[0]] + from[keys[1]]) / 2];
        let best = null;
        for (const other of plan.shapes) {
            if (other === shape) continue;
            const b = DatabaseStructureEditor.shapeBounds(other);
            const theirs = [b[keys[0]], b[keys[1]], (b[keys[0]] + b[keys[1]]) / 2];
            for (const m of mine) for (const t of theirs) {
                const need = t - m;
                if (Math.abs(need - travel) <= DatabaseStructureEditor.SNAP_REACH && (!best || Math.abs(need - travel) < Math.abs(best - travel))) best = need;
            }
        }
        return best === null ? Math.round(travel * 4) / 4 : Math.round(best * 100) / 100;
    }

    // ---- The handles on the 3D view ----------------------------------------

    /** Arrows to move, rings to turn, cubes to size the selected shape, made once per preview. */
    _ensureGizmo(preview, reach) {
        if (typeof RRAxisArrows3D === 'undefined' || typeof RRPoseRings3D === 'undefined') return null;
        const length = Math.max(1.5, Math.min(8, reach * 0.5 + 1));
        let g = preview.gizmo;
        if (g && Math.abs(g.length - length) > length * 0.3) { this._disposeGizmo(preview); g = null; }
        if (g) return g;
        const arrows = RRAxisArrows3D.create(THREE, length, 'shape-arrows');
        const rings = RRPoseRings3D.create(THREE, length * 0.8, 'shape-rings');
        const cubes = { root: new THREE.Group() };
        const colours = { u: 0xff5c5c, y: 0x3ddc84, v: 0x5ca8ff };
        for (const axis of ['u', 'y', 'v']) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: colours[axis], depthTest: false, transparent: true, opacity: 0.9 }));
            mesh.renderOrder = 8;
            mesh.userData.axis = axis;
            cubes.root.add(mesh);
            cubes[axis] = mesh;
        }
        preview.scene.add(arrows.root, rings.root, cubes.root);
        g = preview.gizmo = { length, arrows, rings, cubes, ghost: null };
        return g;
    }

    _disposeGizmo(preview) {
        const g = preview.gizmo;
        if (!g) return;
        RRAxisArrows3D.dispose(g.arrows);
        RRPoseRings3D.dispose(g.rings);
        preview.scene.remove(g.cubes.root);
        for (const axis of ['u', 'y', 'v']) { g.cubes[axis].geometry.dispose(); g.cubes[axis].material.dispose(); }
        this._setGhost(preview, null);
        preview.gizmo = null;
    }

    /** One invisible box per shape, so a click on the 3D view can say which shape it hit. They outlive the handles. */
    _layoutProxies(preview, plan) {
        if (!preview.proxies) { preview.proxies = new THREE.Group(); preview.proxies.visible = false; preview.scene.add(preview.proxies); }
        this._clearProxies(preview);
        plan.shapes.forEach((shape, index) => {
            const c = DatabaseStructureEditor.shapeCorners(shape);
            const at = (u, y, v) => c[u * 4 + y * 2 + v];
            const o = at(0, 0, 0), ex = at(1, 0, 0), ey = at(0, 1, 0), ez = at(0, 0, 1);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
            mesh.matrixAutoUpdate = false;
            const mid = [0, 1, 2].map(i => (o[i] + at(1, 1, 1)[i]) / 2);
            mesh.matrix.set(ex[0] - o[0], ey[0] - o[0], ez[0] - o[0], mid[0], ex[1] - o[1], ey[1] - o[1], ez[1] - o[1], mid[1], ex[2] - o[2], ey[2] - o[2], ez[2] - o[2], mid[2], 0, 0, 0, 1);
            mesh.userData.shape = index;
            preview.proxies.add(mesh);
        });
    }

    /** Screens as planes showing their media, lights as coloured balls, animations as stars, on the preview. */
    _layoutEffects(preview, plan) {
        if (!preview.effects) { preview.effects = new THREE.Group(); preview.scene.add(preview.effects); }
        this._clearEffects(preview);
        const dirs = { north: [0, -1, 180], south: [0, 1, 0], east: [1, 0, 90], west: [-1, 0, 270] };
        for (const fx of plan.effects) {
            const [x, y] = fx.at;
            let mesh;
            if (fx.type === 'screen') {
                const [dx, dy, yaw] = dirs[fx.facing] || dirs.south;
                const material = new THREE.MeshBasicMaterial({ color: 0x0c1a2a, side: THREE.DoubleSide });
                const url = this.mediaUrl(fx.media);
                if (url && /\.(webm|mp4|ogv|m4v)$/i.test(fx.media)) {
                    const video = document.createElement('video');
                    video.src = url; video.muted = true; video.loop = true; video.playsInline = true; video.crossOrigin = 'anonymous';
                    video.play().catch(() => {});
                    material.map = new THREE.VideoTexture(video); material.color.set(0xffffff);
                    if (THREE.SRGBColorSpace) material.map.colorSpace = THREE.SRGBColorSpace;
                    preview.effects.userData.videos = (preview.effects.userData.videos || []).concat(video);
                    preview.live = true;
                } else if (url) {
                    material.map = new THREE.TextureLoader().load(url, () => { preview.dirty = true; }); material.color.set(0xffffff);
                    if (THREE.SRGBColorSpace) material.map.colorSpace = THREE.SRGBColorSpace;
                }
                mesh = new THREE.Mesh(new THREE.PlaneGeometry(fx.width, fx.height), material);
                mesh.position.set(x + 0.5 + dx * 0.52, fx.z + fx.height / 2, y + 0.5 + dy * 0.52);
                mesh.rotation.y = yaw * Math.PI / 180;
            } else if (fx.type === 'light') {
                mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(fx.color) }));
                mesh.position.set(x + 0.5, fx.z, y + 0.5);
                const halo = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.5, fx.radius * 0.25), 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(fx.color), transparent: true, opacity: 0.12, depthWrite: false }));
                mesh.add(halo);
            } else {
                mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xff7ad9 }));
                mesh.position.set(x + 0.5, fx.z + 0.6, y + 0.5);
            }
            preview.effects.add(mesh);
        }
        preview.dirty = true;
    }

    _clearEffects(preview) {
        if (!preview.effects) return;
        for (const video of preview.effects.userData.videos || []) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (error) { /* gone */ } }
        preview.effects.userData.videos = [];
        preview.live = false;
        for (const mesh of preview.effects.children.slice()) {
            preview.effects.remove(mesh);
            mesh.traverse(node => { node.geometry?.dispose?.(); if (node.material) { node.material.map?.dispose?.(); node.material.dispose?.(); } });
        }
    }

    /** A screen's media as a URL the preview can play: movies and pictures of the project. */
    mediaUrl(name) {
        const node = this._node(), root = this.projectPath();
        if (!node || !root || !name) return null;
        const file = /\.(webm|mp4|ogv|m4v)$/i.test(name) ? node.path.join(root, 'movies', name) : node.path.join(root, 'img', 'pictures', name);
        try {
            const stat = node.fs.statSync(file);
            if (stat.size > 40 * 1024 * 1024) return null;
            const ext = name.split('.').pop().toLowerCase();
            const mime = { webm: 'video/webm', mp4: 'video/mp4', ogv: 'video/ogg', m4v: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext] || 'application/octet-stream';
            return 'data:' + mime + ';base64,' + node.fs.readFileSync(file).toString('base64');
        } catch (error) { return null; }
    }

    /** The movies and pictures a screen can show. */
    mediaChoices() {
        const node = this._node(), root = this.projectPath();
        if (!node || !root) return [];
        const list = dir => { try { return node.fs.readdirSync(node.path.join(root, ...dir)).filter(f => !f.startsWith('.')); } catch (error) { return []; } };
        return list(['movies']).filter(f => /\.(webm|mp4|ogv|m4v)$/i.test(f)).concat(list(['img', 'pictures']).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))).sort();
    }

    /** The database's animations, for an animation effect. */
    animationChoices() {
        const list = this.databaseManager?.data?.animations || (typeof window !== 'undefined' && window.reactor?.databaseManager?.data?.animations) || [];
        return list.filter(a => a && a.id > 0).map(a => ({ id: a.id, name: a.name || '' }));
    }

    /** An effect kind's name for people. */
    effectName(kind) {
        return this._t(kind === 'screen' ? 'Screen' : kind === 'light' ? 'Light' : 'Animation');
    }

    _clearProxies(preview) {
        if (!preview.proxies) return;
        for (const mesh of preview.proxies.children.slice()) { preview.proxies.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    }

    /** Which shape a canvas point is over, by its box, or -1. */
    _shapeAt(canvas, clientX, clientY) {
        const preview = this._preview;
        if (!preview || !preview.proxies) return -1;
        const rect = canvas.getBoundingClientRect();
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), preview.camera);
        const hits = ray.intersectObjects(preview.proxies.children, false);
        return hits.length ? hits[0].object.userData.shape : -1;
    }

    /** Put the handles on the selected shape for the current mode, or hide them. */
    _syncGizmo(preview) {
        preview = preview || this._preview;
        if (!preview || typeof THREE === 'undefined') return;
        const shape = this.selectedShape();
        const show = !!shape && this.tool !== 'shape';
        const g = show ? this._ensureGizmo(preview, Math.max(...shape.size)) : preview.gizmo;
        if (!g) return;
        const mode = this._gizmoMode;
        g.arrows.root.visible = false; g.rings.root.visible = false; g.cubes.root.visible = false;
        if (!show) { preview.dirty = true; return; }
        const c = DatabaseStructureEditor.shapeCorners(shape);
        const at = (u, y, v) => c[u * 4 + y * 2 + v];
        const far = at(1, 1, 1), near = at(0, 0, 0);
        const centre = new THREE.Vector3((near[0] + far[0]) / 2, (near[1] + far[1]) / 2, (near[2] + far[2]) / 2);
        if (mode === 'move') RRAxisArrows3D.sync(g.arrows, centre, true);
        else if (mode === 'turn') RRPoseRings3D.sync(g.rings, centre, -(shape.angle || 0), shape.tilt || 0, true);
        else {
            g.cubes.root.visible = true;
            const size = Math.max(0.25, Math.min(0.8, Math.max(...shape.size) * 0.05 + 0.2));
            const ends = { u: [at(1, 0, 0), at(1, 1, 1)], y: [at(0, 1, 0), at(1, 1, 1)], v: [at(0, 0, 1), at(1, 1, 1)] };
            for (const axis of ['u', 'y', 'v']) {
                const [a, b] = ends[axis];
                const face = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
                const dir = face.clone().sub(centre).normalize();
                g.cubes[axis].position.copy(face.add(dir.multiplyScalar(size * 0.8)));
                g.cubes[axis].scale.setScalar(size);
                g.cubes[axis].userData.dir = dir.normalize();
            }
        }
        preview.dirty = true;
    }

    /** The point on an axis line nearest the pointer's ray, as travel along it from the origin. */
    _axisTravel(camera, rect, clientX, clientY, origin, direction) {
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const caster = new THREE.Raycaster();
        caster.setFromCamera(ndc, camera);
        const d = direction, o = caster.ray.origin, r = caster.ray.direction;
        const w0 = new THREE.Vector3().subVectors(origin, o);
        const a = d.dot(d), b = d.dot(r), cc = r.dot(r);
        const pp = d.dot(w0), q = r.dot(w0);
        const denom = a * cc - b * b;
        if (Math.abs(denom) < 1e-9) return null;
        return (b * q - cc * pp) / denom;
    }

    /** What a press on the 3D view grabs: a handle of the selected shape, or nothing. */
    _grabGizmo(canvas, clientX, clientY) {
        const preview = this._preview, g = preview && preview.gizmo, shape = this.selectedShape();
        if (!g || !shape || this.tool === 'shape') return null;
        const rect = canvas.getBoundingClientRect(), camera = preview.camera, mode = this._gizmoMode;
        const from = DatabaseStructureEditor.shapeBounds(shape);
        const start = { at: shape.at.slice(), offset: (shape.offset || [0, 0]).slice(), z: shape.z, size: shape.size.slice(), angle: shape.angle, tilt: shape.tilt || 0, roll: shape.roll || 0 };
        if (mode === 'move') {
            const grab = RRAxisArrows3D.pick(THREE, g.arrows, camera, rect, clientX, clientY);
            if (!grab) return null;
            RRAxisArrows3D.emphasize(g.arrows, grab.axis, true);
            return { mode, axis: grab.axis, travel: grab.travel, shape, from, start };
        }
        if (mode === 'turn') {
            const grab = RRPoseRings3D.pick(THREE, g.rings, camera, rect, clientX, clientY, { yaw: -(shape.angle || 0), pitch: shape.tilt || 0, roll: shape.roll || 0 });
            if (!grab) return null;
            RRPoseRings3D.emphasize(g.rings, grab.axis, true);
            return { mode, ring: grab, shape, from, start };
        }
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(['u', 'y', 'v'].map(axis => g.cubes[axis]), false)[0];
        if (!hit) return null;
        const axis = hit.object.userData.axis, dir = hit.object.userData.dir.clone(), origin = hit.object.position.clone();
        const t0 = this._axisTravel(camera, rect, clientX, clientY, origin, dir);
        if (t0 === null) return null;
        for (const key of ['u', 'y', 'v']) hit.object.parent.children.find(m => m.userData.axis === key).material.opacity = key === axis ? 1 : 0.25;
        return { mode, axis, shape, from, start, travel: (cx, cy) => { const t = this._axisTravel(camera, rect, cx, cy, origin, dir); return t === null ? 0 : t - t0; } };
    }

    /** Apply a handle drag's pointer position to its shape; true when something changed. */
    _dragGizmo(drag, clientX, clientY) {
        const { shape, start } = drag;
        const before = JSON.stringify([shape.at, shape.offset, shape.z, shape.size, shape.angle, shape.tilt, shape.roll]);
        if (drag.mode === 'move') {
            const t = drag.travel(clientX, clientY);
            const axis = drag.axis === 'x' ? 0 : drag.axis === 'y' ? 1 : 2;
            const snapped = this.snapTravel(shape, axis, t, drag.from);
            if (axis === 1) shape.z = Math.max(0, Math.min(120, Math.round((start.z + snapped) * 4) / 4));
            else {
                const cx = start.at[0] + 0.5 + start.offset[0], cy = start.at[1] + 0.5 + start.offset[1];
                DatabaseStructureEditor.placeShapeAt(shape, axis === 0 ? cx + snapped : cx, axis === 2 ? cy + snapped : cy);
            }
        } else if (drag.mode === 'turn') {
            const value = RRPoseRings3D.drag(THREE, drag.ring, this._preview.camera, this._preview.canvas.getBoundingClientRect(), clientX, clientY);
            if (value !== null) {
                const deg = ((Math.round(value / 5) * 5) % 360 + 360) % 360;
                if (drag.ring.axis === 'yaw') shape.angle = (360 - deg) % 360;
                else if (drag.ring.axis === 'pitch') shape.tilt = deg;
                else shape.roll = deg;
            }
        } else {
            const t = drag.travel(clientX, clientY);
            const i = drag.axis === 'u' ? 0 : drag.axis === 'y' ? 1 : 2;
            shape.size = start.size.slice();
            this.resizeShape(shape, i, start.size[i] + t, this._sizeLock);
        }
        return JSON.stringify([shape.at, shape.offset, shape.z, shape.size, shape.angle, shape.tilt, shape.roll]) !== before;
    }

    /** The dragged shape drawn on its own where it is now, over the building as it was. */
    _setGhost(preview, shape) {
        const g = preview.gizmo;
        if (!g) return;
        if (g.ghost) { preview.scene.remove(g.ghost); g.ghost.geometry.dispose(); g.ghost.material.dispose(); g.ghost = null; }
        if (!shape || typeof Reactor3D === 'undefined' || !Reactor3D.pieceGeometry) { preview.dirty = true; return; }
        const [W, H] = this.current.plan.size;
        const piece = Object.assign({ id: 1, material: shape.material || '' }, DatabaseStructureEditor.pieceOf(shape));
        const mapData = { width: W, height: H, reactor3d: { version: 1, elevation: new Array(W * H).fill(0), pieces: [piece] } };
        try {
            const geometry = Reactor3D.pieceGeometry([piece], mapData);
            g.ghost = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xf0c060, transparent: true, opacity: 0.6, vertexColors: true }));
            g.ghost.renderOrder = 4;
            preview.scene.add(g.ghost);
        } catch (error) { g.ghost = null; }
        preview.dirty = true;
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
