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
    static SIZE_MIN = 4;
    static SIZE_MAX = 200;
    /** What an effect can be, the way the 3D Models page attaches them: a screen, a light, an animation. */
    static EFFECT_KINDS = ['screen', 'light', 'animation'];
    static EFFECT_DEFAULTS = { screen: { width: 4, height: 2.25, z: 1, media: '' }, light: { color: '#9fd8ff', radius: 6, intensity: 1.2, z: 4 }, animation: { animation: 0, z: 0 } };
    static SHAPE_KINDS = ['box', 'wedge', 'pyramid', 'prism', 'hull', 'spike', 'cylinder', 'capsule', 'tube', 'cone', 'dome', 'sphere', 'dish', 'fin', 'arch', 'tunnel', 'ring', 'rock'];
    /** The settings a kind carries beyond its size, with what it wears until told otherwise. */
    static SHAPE_PARAMS = { hull: { sides: 8, taper: 0.8 }, spike: { sides: 6, taper: 0 }, capsule: { sides: 24 }, dish: { sides: 32 }, fin: { taper: 0.4 }, cylinder: { sweep: 360 }, tube: { sweep: 360, thick: 0.3 }, ring: { sweep: 360, thick: 0.2 }, rock: { rough: 0.5 } };
    /** What a shape is first placed at, in tiles: wide enough to see, tall enough to matter. */
    static SHAPE_DEFAULTS = { box: [4, 3, 4], wedge: [4, 2, 4], pyramid: [4, 4, 4], prism: [4, 3, 6], cylinder: [4, 6, 4], tube: [6, 5, 6], cone: [4, 4, 4], dome: [4, 2, 4], sphere: [4, 4, 4], arch: [3, 4, 1], tunnel: [4, 4, 8], ring: [6, 1, 6], hull: [4, 6, 4], spike: [1, 4, 1], capsule: [2, 6, 2], dish: [4, 1, 4], fin: [3, 3, 0.25], rock: [4, 4, 4], tower: [4, 6, 4] };
    /** How close a dragged face comes to another shape's face before it clicks onto it, in tiles. */
    static SNAP_REACH = 0.35;
    static HISTORY = 100;
    static HISTORY_CHARS = 64 * 1024 * 1024;

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
            rock: `<path d="M2 13l1.7-4 2.7-2.7 2.3 1.3 2-2.6 3.3 4.3V13z M6.3 6l.7 3.3 2-2" ${stroke}/>`,
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

    /** The images under img/materials, by name. */
    materials() {
        const palette = window.reactor?.pieceBuilderManager;
        if (palette?.materials) return palette.materials().map(entry => entry.name);
        const node = this._node(), root = this.projectPath();
        if (!node || !root || typeof RRAssetFiles === 'undefined') return [];
        try { return RRAssetFiles.listMaterials(node.path.join(root, 'img', 'materials')).map(record => record.imageReference || record.name); } catch (error) { return []; }
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
        // A 2D structure (Structure2D.js): its own fields, none of a building's.
        if (plan.dimension === '2d' && typeof RRStructure2D !== 'undefined') {
            RRStructure2D.normalize(plan);
            plan.description = typeof plan.description === 'string' ? plan.description : '';
            plan.category = typeof plan.category === 'string' ? plan.category : '';
            return plan;
        }
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
                // The door that hangs there: its own settings (an object), or false for an open doorway.
                const own = door[door.length - 1];
                if (door.length > 3 && (own === false || (own && typeof own === 'object' && !Array.isArray(own)))) out.push(own === false ? false : JSON.parse(JSON.stringify(own)));
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
        // A building kept as pieces (no floors of rooms) has its roof among them, so a pitch it was never given is
        // none (null), not a number: "Rebuild roof" then lays the usual one (6 rows, 3 for a slanted roof), and a
        // pitch typed for it is kept and saved. A stored pitch is read as it is; a plan of rooms keeps its default of 2.
        const pitchGiven = plan.roof && plan.roof.pitch !== undefined && plan.roof.pitch !== '' && Number.isFinite(Number(plan.roof.pitch));
        plan.roof = Object.assign({ pitch: (plan.roof && plan.roof.pitch === null) || (!plan.floors.length && !pitchGiven) ? null : int(plan.roof?.pitch, 2, 0, 20) },
            plan.roof && this.ROOF_STYLES.includes(plan.roof.style) ? { style: plan.roof.style } : {},
            plan.roof && plan.roof.style === 'shed' && this.DIRECTIONS.includes(plan.roof.high) ? { high: plan.roof.high } : {},
            plan.roof && Number.isFinite(Number(plan.roof.overhang)) ? { overhang: Math.max(0, Math.min(1, Number(plan.roof.overhang))) } : {});
        // The window rhythm, and how the windows look: their frame, shutters and flower boxes (StructurePlan reads them).
        // `windows: false` is a plan with none (StructurePlan reads it so), and stays as written.
        const look = plan.windows && typeof plan.windows === 'object' ? plan.windows : {};
        if (plan.windows !== false) plan.windows = Object.assign({ every: int(look.every, 6, 0, 60), width: int(look.width, 2, 1, 8) },
            look.frame === false || typeof look.frame === 'string' || (look.frame && typeof look.frame === 'object') ? { frame: JSON.parse(JSON.stringify(look.frame)) } : {},
            look.shutters === true || /^#[0-9a-f]{6}$/i.test(String(look.shutters)) ? { shutters: look.shutters } : {},
            look.closed === true ? { closed: true } : {},
            look.flowerBox === true || look.flowerBox === 'all' ? { flowerBox: look.flowerBox } : {});
        // Every door's settings (`door`), or none hung at all (`doors: false`).
        if (plan.door !== undefined && !(plan.door && typeof plan.door === 'object' && !Array.isArray(plan.door))) delete plan.door;
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
        // What was built in the Structure workshop: the pieces as laid (plot cells), and the lights and screens as the map held them.
        // A plan of parts or shapes alone says no height and has one floor of its own: counted as three, "+ Add floor" took one off instead of adding one.
        plan.height = int(plan.height, Array.isArray(plan.pieces) && plan.pieces.length ? 3 : 1, 1, 24);
        const E = typeof RRMapElevation !== 'undefined' ? RRMapElevation : null;
        plan.pieces = (Array.isArray(plan.pieces) ? plan.pieces : []).map(raw => {
            const piece = E ? E.normalizePiece(raw, null) : (raw && typeof raw === 'object' && typeof raw.kind === 'string' ? Object.assign({}, raw) : null);
            if (!piece) return null;
            delete piece.id; delete piece.group;
            return piece;
        }).filter(Boolean);
        plan.lights = (Array.isArray(plan.lights) ? plan.lights : []).filter(row => row && typeof row === 'object').map(row => Object.assign({}, row));
        // The Structure workshop's own settings, which a stamp never copies: the sun that lights the build there.
        // A sun lights a whole map, so one an older file kept among the structure's lights moves here, and is
        // written here the next time that structure is saved. A plan with neither has no `workshop` at all.
        const workshop = plan.workshop && typeof plan.workshop === 'object' && !Array.isArray(plan.workshop) ? plan.workshop : null;
        const suns = (workshop && Array.isArray(workshop.lights) ? workshop.lights : []).filter(row => row && typeof row === 'object').map(row => Object.assign({}, row))
            .concat(plan.lights.filter(row => row.type === 'sun'));
        plan.lights = plan.lights.filter(row => row.type !== 'sun');
        if (workshop || suns.length) plan.workshop = Object.assign({}, workshop, { lights: suns }); else delete plan.workshop;
        plan.surfaces = (Array.isArray(plan.surfaces) ? plan.surfaces : []).filter(row => row && typeof row === 'object').map(row => Object.assign({}, row));
        // A saved selection's placed models (plot cells) and the water standing in it (its level above the pad).
        plan.props = (Array.isArray(plan.props) ? plan.props : []).filter(row => row && typeof row === 'object' && row.name).map(row => { const out = Object.assign({}, row); delete out.id; delete out.structure; return out; });
        plan.water = (Array.isArray(plan.water) ? plan.water : []).filter(row => row && typeof row === 'object').map(row => { const out = JSON.parse(JSON.stringify(row)); delete out.structure; return out; });
        plan.description = typeof plan.description === 'string' ? plan.description : '';
        plan.category = typeof plan.category === 'string' ? plan.category : '';
        // A described building is as tall as its floors; a built one as its highest storey with walls,
        // doors, windows or stairs (what stands above that, a roof, sits on top).
        const builtFloors = plan.pieces.length && typeof RRStructureFloors !== 'undefined' ? RRStructureFloors.occupiedFloors(plan) : 0;
        if (plan.floors.length || builtFloors) plan.height = Math.min(24, Math.max(plan.floors.length, builtFloors));
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
        if (plan.dimension === '2d' && typeof RRStructure2D !== 'undefined') {
            const fields = { name: plan.name, size: plan.size.slice() };
            if (plan.description) fields.description = plan.description;
            if (plan.category) fields.category = plan.category;
            RRStructure2D.trim(plan, fields);
            const out = {};
            for (const key of plan._had || []) if (key in fields) out[key] = fields[key];
            for (const key of Object.keys(fields)) if (!(key in out)) out[key] = fields[key];
            return out;
        }
        const fields = { name: plan.name, size: plan.size.slice(), storey: plan.storey };
        const materials = Object.fromEntries(Object.entries(plan.materials).filter(([, value]) => value));
        if (Object.keys(materials).length || had.has('materials')) fields.materials = materials;
        if (plan.floors.length || had.has('floors')) fields.floors = plan.floors.map(floor => {
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
        // A building in pieces whose file had no roof setting gains one only when a pitch was typed for it.
        if (plan.floors.length || had.has('roof') || plan.roof.pitch !== null) fields.roof = Object.assign({ pitch: plan.roof.pitch }, plan.roof.style ? { style: plan.roof.style } : {}, plan.roof.high ? { high: plan.roof.high } : {}, Number.isFinite(plan.roof.overhang) ? { overhang: plan.roof.overhang } : {});
        if (plan.windows === false) fields.windows = false;
        else if (plan.floors.length || had.has('windows')) fields.windows = Object.assign({}, plan.windows);
        if (plan.door) fields.door = JSON.parse(JSON.stringify(plan.door));
        if (plan.doors === false) fields.doors = false;
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
        if (plan.pieces.length || had.has('pieces')) { fields.height = plan.height; fields.pieces = plan.pieces.map(piece => { const out = Object.assign({}, piece); if (!out.material) delete out.material; if (!out.rot) delete out.rot; if (!out.z) delete out.z; return out; }); }
        if (plan.lights.length || had.has('lights')) fields.lights = plan.lights.map(row => Object.assign({}, row));
        if (plan.workshop && ((plan.workshop.lights || []).length || had.has('workshop'))) fields.workshop = JSON.parse(JSON.stringify(plan.workshop));
        if (plan.surfaces.length || had.has('surfaces')) fields.surfaces = plan.surfaces.map(row => Object.assign({}, row));
        if ((plan.props || []).length || had.has('props')) fields.props = (plan.props || []).map(row => Object.assign({}, row));
        if ((plan.water || []).length || had.has('water')) fields.water = (plan.water || []).map(row => JSON.parse(JSON.stringify(row)));
        if (plan.description) fields.description = plan.description;
        if (plan.category) fields.category = plan.category;
        // The file's own order first, then anything new at the end.
        const out = {};
        for (const key of plan._had || []) if (key in fields) out[key] = fields[key];
        for (const key of Object.keys(fields)) if (!(key in out)) out[key] = fields[key];
        return out;
    }

    /**
     * A copy of a structure record (or of a list of them) made through JSON
     * takes its source's memory of which settings the file had. That memory is
     * hidden from JSON on purpose, so it never reaches a file or a stamp; but a
     * copy without it reads as a file that had every setting, and the next save
     * wrote about fifteen empty ones into it. Only a copy of the same file (or
     * of the same unsaved plan) takes it, so a record that took another's place
     * in the list is not given the wrong one.
     */
    static carryFileMemory(from, to) {
        if (Array.isArray(from) || Array.isArray(to)) {
            if (Array.isArray(from) && Array.isArray(to)) for (let i = 0; i < to.length; i++) this.carryFileMemory(from[i], to[i]);
            return to;
        }
        const had = from && from.plan && from.plan._had;
        if (!had || !to || !to.plan || typeof to.plan !== 'object' || to.plan._had) return to;
        if ((from.file || '') !== (to.file || '')) return to;
        Object.defineProperty(to.plan, '_had', { value: had.slice(), enumerable: false });
        return to;
    }

    /** The plot a built structure needs: every piece, light, screen, shape, effect and spot inside it. */
    static builtExtent(plan, resolve) {
        let w = 0, d = 0;
        const cover = (x, y) => {
            if (Number.isFinite(Number(x))) w = Math.max(w, Math.floor(Number(x)) + 1);
            if (Number.isFinite(Number(y))) d = Math.max(d, Math.floor(Number(y)) + 1);
        };
        for (const row of [].concat(plan.pieces || [], plan.lights || [], plan.surfaces || [], plan.props || [])) if (row) cover(row.x, row.y);
        for (const sheet of plan.water || []) if (sheet) cover(sheet.x1, sheet.y1);
        for (const row of [].concat(plan.shapes || [], plan.effects || [])) if (row && Array.isArray(row.at)) cover(row.at[0], row.at[1]);
        for (const cell of Object.values(plan.spots || {})) if (Array.isArray(cell)) cover(cell[0], cell[1]);
        // A described building: its rooms (corner to corner), windows and stairs.
        for (const floor of plan.floors || []) {
            for (const rect of Object.values(floor.rooms || {})) if (Array.isArray(rect)) cover(rect[2], rect[3]);
            for (const cell of floor.windows || []) if (Array.isArray(cell)) cover(cell[0], cell[1]);
        }
        for (const stair of plan.stairs || []) if (stair && Array.isArray(stair.from)) cover(stair.from[0], stair.from[1]);
        // Paving, corner to corner, and the plans it is made of: each one's own plot, grown by its scale and turned by its turn.
        for (const strip of plan.paths || []) if (Array.isArray(strip)) { cover(strip[0], strip[1]); cover(strip[2], strip[3]); }
        for (const part of plan.parts || []) {
            if (!part || !Array.isArray(part.at)) continue;
            cover(part.at[0], part.at[1]);
            const inner = typeof resolve === 'function' && part.plan ? resolve(part.plan) : null;
            if (!inner || !Array.isArray(inner.size)) continue;
            const k = Math.max(1, Math.min(4, Math.floor(part.scale || 1) || 1));
            const turned = (((Math.floor(part.rot) || 0) % 4 + 4) % 4) % 2;
            cover(part.at[0] + inner.size[turned ? 1 : 0] * k - 1, part.at[1] + inner.size[turned ? 0 : 1] * k - 1);
        }
        return [w, d];
    }

    /** A cottage to start from: two rooms, a front door, a door between, a window every six cells. */
    /** An empty page with one floor and a style: the building is whatever gets drawn on it. */
    static newPlan(name) {
        // An empty plot: the structure is whatever gets built on it with Build.
        return this.normalizePlan({ name, size: [16, 16], storey: 5, height: 2, pieces: [] });
    }

    /** Whether any floor has a room, or the plan a shape or a part: something to build. */
    static isEmpty(plan) {
        return !plan || (!plan.floors.some(floor => Object.keys(floor.rooms || {}).length) && !plan.shapes.length && !plan.parts.length && !(plan.pieces || []).length);
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
        // A 2D structure has a page of its own (DatabaseStructure2DPage.js).
        if (entry.plan.dimension === '2d' && typeof DatabaseStructure2DPage !== 'undefined') {
            this.current = null;
            this._detail = null;
            if (!this.page2D) this.page2D = new DatabaseStructure2DPage(this);
            this.page2D.show(detailEl, entry);
            return;
        }
        this.current = { entry, plan: entry.plan };
        this.floor = 0;
        this.selection = null;
        this._sel = [];
        this._history = [];
        this._future = [];
        const tt = text => this._t(text);
        // A saved building: its name, a look at it, and the way onto the map. Building
        // happens in the world (the Build toggle over the 3D map), not in a form here.
        // The structure one floor at a time (paint walls, floors, doors, windows and stairs) beside it whole in 3D.
        // Both edit the same pieces as the 3D Build bar, so the plan, the preview and Build never disagree.
        this._paint = Object.assign({ floor: 0, tool: 'room', dir: 'north' }, this._paint || {}, { floor: 0, above: false, roofPitch: null });
        this._paintVersion = (this._paintVersion || 0) + 1;
        this._dressing = null;
        detailEl.innerHTML = `
            <div class="rr-structures" style="display:flex;flex-direction:column;height:100%;min-height:0;font-size:12px;">
                <div class="rr-structures-bar" style="display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--color-border);flex-wrap:wrap;"></div>
                <div class="rr-structures-body">
                    <div class="rr-structures-side rr-accent-scrollbar"></div>
                    <div class="rr-structures-planpane">
                        <canvas class="rr-structures-paint" tabindex="0" aria-label="${rrEscapeHtml(tt('Floor plan'))}"></canvas>
                        <div class="rr-structures-paint-hint" tabindex="0"></div>
                    </div>
                    <div class="rr-structures-3dpane">
                        <canvas class="rr-structures-3d" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab;"></canvas>
                        <button type="button" class="rr-btn-secondary rr-structures-peek" title="${rrEscapeHtml(this._t('Cut away the floors above the one in the plan'))}" aria-pressed="false" style="position:absolute;top:8px;right:8px;width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;">${DatabaseStructureEditor.icon('peek')}</button>
                        <div class="rr-structures-report" style="position:absolute;left:8px;bottom:8px;right:8px;padding:6px 8px;font-size:11px;line-height:1.4;color:var(--color-text-muted);background:color-mix(in srgb, var(--color-bg-panel) 85%, transparent);border-radius:3px;pointer-events:none;"></div>
                    </div>
                </div>
            </div>`;
        this._bindPaint(detailEl.querySelector('.rr-structures-paint'));
        this._bindOrbit(detailEl.querySelector('.rr-structures-3d'));
        detailEl.querySelector('.rr-structures-peek')?.addEventListener('click', () => {
            const plan = this.current?.plan;
            this._peek = !(this._peek === true);
            this.draw3D(this._report);
        });
        this.render();
    }

    render() {
        this.renderBar();
        this.renderSide();
        this.drawPaint();
        this.schedulePreview();
    }

    // ---- The floor plan: one floor of pieces, painted ------------------------

    static PAINT_TOOLS = ['select', 'room', 'floor', 'wall', 'door', 'window', 'stairs', 'erase'];
    static ROOF_STYLES = ['gable', 'flat', 'shed'];
    /** Shapes drawn round on the plan; the rest are drawn as their box. */
    static ROUND_SHAPES = ['cylinder', 'capsule', 'tube', 'cone', 'dome', 'sphere', 'dish', 'ring'];

    floorsApi() { return typeof RRStructureFloors !== 'undefined' ? RRStructureFloors : null; }

    /** Floors: more copies the top floor up, fewer takes floors off the top (asking first when they hold something). */
    async setFloorCount(value) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return;
        const target = Math.max(1, Math.min(24, Math.floor(Number(value)) || 1));
        const now = this._floorCount(plan);
        if (target === now) return;
        if (target < now && !F.isDescribed(plan)) {
            let lost = false;
            for (let f = target; f < now; f++) if (F.hasPieces(Object.assign({}, plan, { pieces: this._builtPieces(plan) }), f)) lost = true;
            if (lost) {
                const one = now - target === 1;
                const action = one ? this._t('Remove Floor') : this._t('Remove Floors');
                const remove = await RRDialog.confirm(one
                    ? this._t('Take away floor {floor} and everything on it?', { floor: now })
                    : this._t('Take away floors {from} to {to} and everything on them?', { from: target + 1, to: now }),
                    { title: action, ok: action, danger: true });
                // The answer is for the plan and the floors that were there when it was asked.
                if (this.current?.plan !== plan) return;
                if (!remove || this._floorCount(plan) !== now) { this.renderBar(); return; }
            }
        }
        this.pushHistory();
        // Once in pieces the plan counts its floors by its height: the count shown is the one the change starts from.
        if (((plan.parts || []).length || (plan.shapes || []).length || (plan.paths || []).length)
            && F.materialize(plan, typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null, name => this.resolve(name))) plan.height = now;
        F.setFloors(plan, target);
        this._paint.floor = Math.min(this._paint.floor, target - 1);
        this.markDirty();
        this.renderBar();
        this.renderSide();
    }

    /** The floor list, the tools and the materials they paint with. */
    renderSide() {
        const side = this._detail?.querySelector('.rr-structures-side');
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!side || !F || !plan) return;
        const tt = text => this._t(text);
        const count = this._floorCount(plan);
        this._paint.floor = Math.max(0, Math.min(count - 1, this._paint.floor));
        const roofStyle = (plan.roof && plan.roof.style) || 'gable';
        const roofPitch = this._roofPitch(plan);
        const floors = [];
        for (let f = count - 1; f >= 0; f--) {
            const label = f === 0 ? tt('Ground floor') : this._t('Floor {n}', { n: f + 1 });
            const active = !this._paint.above && f === this._paint.floor;
            floors.push(`<button type="button" class="rr-structures-floor${active ? ' active' : ''}" data-floor="${f}" aria-pressed="${active}">${rrEscapeHtml(label)}</button>`);
        }
        // Over the floors: the whole building from above, roof, tower and all (to look at, not to paint on).
        floors.unshift(`<button type="button" class="rr-structures-floor rr-structures-above${this._paint.above ? ' active' : ''}" data-above="1" aria-pressed="${!!this._paint.above}">${rrEscapeHtml(tt('Seen from above'))}</button>`);
        const toolNames = { select: 'Select', room: 'Room', floor: 'Floor', wall: 'Wall', door: 'Door', window: 'Window', stairs: 'Stairs', erase: 'Eraser' };
        const toolIcons = { select: 'select', room: 'drawRect', floor: 'floor', wall: 'wall', door: 'doorway', window: 'window', stairs: 'stair', erase: 'hammer' };
        const tools = BuildHotbar.slotsHtml(DatabaseStructureEditor.PAINT_TOOLS.map(tool => ({ id: tool, label: tt(toolNames[tool]), icon: BuildHotbar.icon(toolIcons[tool]), className: 'rr-structures-tool' })), this._paint.tool);
        const dirNames = { north: 'North', east: 'East', south: 'South', west: 'West' };
        side.innerHTML = `
            <div class="lit-section-header rr-structures-side-title">${rrEscapeHtml(tt('Floors'))}</div>
            <div class="rr-structures-floorlist">${floors.join('')}</div>
            <button type="button" class="rr-btn-secondary rr-structures-addfloor">${rrEscapeHtml(tt('+ Add floor'))}</button>
            <div class="lit-section-header rr-structures-side-title">${rrEscapeHtml(tt('Roof'))}</div>
            <label class="rr-structures-side-field"><span>${rrEscapeHtml(tt('Style'))}</span><select class="database-field-value rr-structures-roof-style">${[['gable', 'Gable'], ['flat', 'Flat'], ['shed', 'Slanted']].map(([v, l]) => `<option value="${v}"${v === roofStyle ? ' selected' : ''}>${rrEscapeHtml(tt(l))}</option>`).join('')}</select></label>
            <label class="rr-structures-side-field"${roofStyle === 'shed' ? '' : ' hidden'}><span>${rrEscapeHtml(tt('Rises'))}</span><select class="database-field-value rr-structures-roof-high">${Object.keys(dirNames).map(d => `<option value="${d}"${d === ((plan.roof && plan.roof.high) || 'north') ? ' selected' : ''}>${rrEscapeHtml(tt(dirNames[d]))}</option>`).join('')}</select></label>
            <label class="rr-structures-side-field"${roofStyle === 'flat' ? ' hidden' : ''}><span>${rrEscapeHtml(tt('Roof pitch (rows)'))}</span><input type="number" class="database-field-value rr-structures-roof-pitch" min="${roofStyle === 'shed' ? 1 : 0}" max="20" step="1" value="${roofPitch}"></label>
            ${this._materialTile('roof', tt('Roof'))}
            <button type="button" class="rr-btn-secondary rr-structures-roof" title="${rrEscapeHtml(tt('Lay the roof again over the top floor.'))}">${rrEscapeHtml(tt('Rebuild roof'))}</button>
            <div class="lit-section-header rr-structures-side-title">${rrEscapeHtml(tt('Tools'))}</div>
            <div class="rr-build-row rr-structures-toolgrid">${tools}</div>
            ${this._sel?.length ? `<div class="rr-structures-selbar"><span>${rrEscapeHtml(this._selLabel())}</span>${this._sel.some(p => p.kind === 'stair') ? `<button type="button" class="rr-btn-secondary rr-structures-selturn">${rrEscapeHtml(tt('Turn'))}</button>` : ''}<button type="button" class="rr-btn-secondary rr-structures-seldelete">${rrEscapeHtml(tt('Delete'))}</button></div>` : ''}
            <div class="lit-section-header rr-structures-side-title">${rrEscapeHtml(tt('Materials'))}</div>
            <div class="rr-structures-side-field"><span>${rrEscapeHtml(tt('Walls'))}</span>${this._materialTile('wall', tt('Walls'))}</div>
            <div class="rr-structures-side-field"><span>${rrEscapeHtml(tt('Floors'))}</span>${this._materialTile('floor', tt('Floors'))}</div>
            <label class="rr-structures-side-field"${this._paint.tool === 'stairs' ? '' : ' hidden'}><span>${rrEscapeHtml(tt('Stairs climb'))}</span><select class="database-field-value rr-structures-dir">${Object.keys(dirNames).map(d => `<option value="${d}"${d === this._paint.dir ? ' selected' : ''}>${rrEscapeHtml(tt(dirNames[d]))}</option>`).join('')}</select></label>`;
        side.querySelector('.rr-structures-selturn')?.addEventListener('click', () => this.turnSelection());
        side.querySelector('.rr-structures-seldelete')?.addEventListener('click', () => this.deleteSelection());
        side.querySelectorAll('.rr-structures-floor').forEach(button => button.addEventListener('click', () => {
            this._paint.above = button.dataset.above === '1';
            if (!this._paint.above) this._paint.floor = Number(button.dataset.floor);
            this._sel = []; this.renderSide(); this.drawPaint();
            if (this._peek === true) this.draw3D(this._report);
        }));
        side.querySelector('.rr-structures-roof').addEventListener('click', () => this.rebuildRoof());
        side.querySelector('.rr-structures-addfloor').addEventListener('click', async () => { await this.setFloorCount(count + 1); this._paint.floor = count; this._paint.above = false; this.renderSide(); this.drawPaint(); });
        // A tool is for a floor: picking one from the view from above goes back to the floor last looked at.
        BuildHotbar.bindSlots(side, tool => { this._paint.tool = tool; this._paint.above = false; if (tool !== 'select') this._sel = []; this.renderSide(); this.drawPaint(); });
        // A material is chosen from its pictures; the building wears it as the pointer passes over, and keeps it on a click.
        for (const button of side.querySelectorAll('.rr-structures-mat')) button.addEventListener('click', () => {
            const role = button.dataset.role;
            this.openMaterialPicker(button, name => this.dressRole(role, name), name => this.previewRole(role, name));
        });
        side.querySelector('.rr-structures-roof-style').addEventListener('change', event => this.setRoof({ style: event.target.value }));
        side.querySelector('.rr-structures-roof-high').addEventListener('change', event => this.setRoof({ high: event.target.value }));
        side.querySelector('.rr-structures-roof-pitch').addEventListener('change', event => this.setRoof({ pitch: event.target.value }));
        side.querySelector('.rr-structures-dir')?.addEventListener('change', event => { this._paint.dir = event.target.value; this.drawPaint(); });
        const hint = this._detail?.querySelector('.rr-structures-paint-hint');
        if (hint) {
            const tips = { select: 'Click a piece to pick it up, or drag a box. Drag to move; arrows nudge, R turns stairs, Delete removes.', room: 'Drag a rectangle: walls around it, floor inside.', floor: 'Drag a rectangle of floor.', wall: 'Drag a straight line of wall.', door: 'Drag along a wall to open a doorway in it.', window: 'Drag along a wall to put windows in it.', stairs: 'Click where the stairs start; they climb to the next floor. R turns them.', erase: 'Drag over anything on this floor to take it away.' };
            hint.textContent = this._paint.above ? tt('Seen from above') : (F.isDescribed(plan) ? tt('Painting turns this described building into pieces.') + ' ' : '') + tt(tips[this._paint.tool]) + ' ' + tt('Right-drag erases. Ctrl+Z undoes.');
            hint.title = hint.textContent;
        }
    }

    /** A role's material as a large tile; a click swaps it for another. */
    _materialTile(role, title) {
        const value = this._roleMaterial(role);
        return RRMaterialPopup.tile({ cls: 'rr-structures-mat', value, url: value ? this.materialUrl(value) || '' : '', blank: this._t('Plain'), attrs: `data-role="${role}" title="${rrEscapeHtml(title)}"` });
    }

    /** A material's picture, loaded once, for painting cells in it. */
    _materialImage(name) {
        this._materialImages = this._materialImages || new Map();
        if (!name) return null;
        if (this._materialImages.has(name)) return this._materialImages.get(name);
        const entry = { image: null };
        this._materialImages.set(name, entry);
        const url = this.materialUrl(name);
        if (url) { const image = new Image(); image.onload = () => { entry.image = image; this.drawPaint(); }; image.src = url; }
        return entry;
    }

    /** Where the plan's cells sit in the canvas. */
    _paintGeometry(canvas) {
        const plan = this.current?.plan;
        if (!canvas || !plan) return null;
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width)), height = Math.max(1, Math.floor(rect.height));
        const [W, D] = plan.size;
        const cell = Math.max(4, Math.floor(Math.min((width - 24) / W, (height - 24) / D)));
        return { width, height, cell, ox: Math.floor((width - cell * W) / 2), oy: Math.floor((height - cell * D) / 2), W, D };
    }

    _paintCellAt(canvas, clientX, clientY) {
        const g = this._paintGeometry(canvas);
        if (!g) return null;
        const rect = canvas.getBoundingClientRect();
        const x = Math.floor((clientX - rect.left - g.ox) / g.cell), y = Math.floor((clientY - rect.top - g.oy) / g.cell);
        return { x: Math.max(0, Math.min(g.W - 1, x)), y: Math.max(0, Math.min(g.D - 1, y)), inside: x >= 0 && y >= 0 && x < g.W && y < g.D };
    }

    /** The cells a drag covers for the tool in hand. */
    _paintCells(tool, a, b) {
        const F = this.floorsApi();
        if (tool === 'room') return F.outlineCells(a.x, a.y, b.x, b.y);
        if (tool === 'wall' || tool === 'door' || tool === 'window') return F.lineCells(a.x, a.y, b.x, b.y);
        if (tool === 'stairs') return [[a.x, a.y]];
        return F.rectCells(a.x, a.y, b.x, b.y);
    }

    /** How far up a shape reaches from where it stands, in levels (a tilted slab by its lean). */
    static shapeRise(shape) {
        const size = Array.isArray(shape.size) ? shape.size : [1, 1, 1];
        const h = Number(size[1]) || 1, d = Number(size[2]) || Number(size[0]) || 1;
        const tilt = (Number(shape.tilt) || 0) * Math.PI / 180;
        return Math.abs(h * Math.cos(tilt)) + Math.abs(d * Math.sin(tilt));
    }

    /** A piece's own surface (a finish, or its sliders), or null. */
    static surfaceOf(piece) {
        const presets = (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_FINISHES) || {};
        return (piece && (piece.surface || (piece.finish && presets[piece.finish]))) || null;
    }

    /**
     * A surface as a flat colour for a view with no reflections: its tint (silver for an untinted
     * mirror or chrome), and whether the material's picture still shows through it.
     */
    static surfaceLook(surface) {
        if (!surface || !(Number(surface.reflect) > 0)) return null;
        const tint = /^#[0-9a-f]{6}$/i.test(String(surface.tint || '')) ? String(surface.tint).toLowerCase() : '#ffffff';
        const pictured = (Number(surface.texture) || 0) >= 0.5;
        return { color: tint === '#ffffff' && !pictured ? '#d5dde6' : tint, pictured };
    }

    /**
     * One shape on the plan: its footprint where it stands, turned as it is, in its material (or its
     * finish's colour), darker the taller it is, with the lines that tell a pyramid from a dome from a
     * tube. Overhead ones are an outline in dashes.
     */
    _drawShape(ctx, g, shape, options = {}) {
        const { cell, ox, oy } = g;
        const E = DatabaseStructureEditor;
        const offset = Array.isArray(shape.offset) ? shape.offset : [0, 0];
        const tilt = (Number(shape.tilt) || 0) * Math.PI / 180;
        const w = Math.max(0.1, Number(shape.size[0]) || 1) * cell;
        // A tilted slab covers less ground than its length.
        const d = Math.max(0.1, Math.abs((Number(shape.size[2]) || Number(shape.size[0]) || 1) * Math.cos(tilt)) + Math.abs((Number(shape.size[1]) || 0) * Math.sin(tilt))) * cell;
        const round = E.ROUND_SHAPES.includes(shape.kind), hollow = shape.kind === 'tube' || shape.kind === 'ring';
        const thick = Math.max(0.05, Math.min(0.95, (Number.isFinite(Number(shape.thick)) ? Number(shape.thick) : 0.3) * 2));
        ctx.save();
        ctx.translate(ox + (shape.x + 0.5 + (Number(offset[0]) || 0)) * cell, oy + (shape.y + 0.5 + (Number(offset[1]) || 0)) * cell);
        ctx.rotate((Number(shape.angle) || 0) * Math.PI / 180);
        const outline = () => {
            ctx.beginPath();
            if (round) ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); else ctx.rect(-w / 2, -d / 2, w, d);
            // A tube or a ring is its wall: the middle is open.
            if (hollow) ctx.ellipse(0, 0, w / 2 * (1 - thick), d / 2 * (1 - thick), 0, 0, Math.PI * 2);
        };
        outline();
        if (options.overhead) {
            ctx.setLineDash([4, 3]);
            ctx.strokeStyle = 'rgba(225,230,240,0.55)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
            return;
        }
        const look = E.surfaceLook(E.surfaceOf(shape));
        const entry = look && !look.pictured ? null : this._materialImage(shape.material);
        if (entry && entry.image) {
            const pattern = ctx.createPattern(entry.image, 'repeat');
            if (pattern && pattern.setTransform && typeof DOMMatrix === 'function') pattern.setTransform(new DOMMatrix().scale(cell / entry.image.width, cell / entry.image.height));
            ctx.fillStyle = pattern || '#6b6f76';
        } else ctx.fillStyle = look ? look.color : '#6b6f76';
        ctx.fill('evenodd');
        if (look && entry && entry.image) { ctx.globalAlpha = 0.45; ctx.fillStyle = look.color; ctx.fill('evenodd'); ctx.globalAlpha = 1; }
        // A solid as tall as a wall reads as one; low things (a bench, a crate) stay light.
        const rise = E.shapeRise(shape);
        if (!options.above && rise >= 2.5) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill('evenodd'); }
        ctx.strokeStyle = 'rgba(15,17,20,0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // What kind it is: a peak's diagonals, a ridge, a slope's high edge, a dome's ring.
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        if (shape.kind === 'pyramid' || shape.kind === 'spike') { ctx.moveTo(-w / 2, -d / 2); ctx.lineTo(w / 2, d / 2); ctx.moveTo(w / 2, -d / 2); ctx.lineTo(-w / 2, d / 2); }
        else if (shape.kind === 'prism') { ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); }
        else if (shape.kind === 'wedge') { ctx.moveTo(-w / 2, d / 2 - 2); ctx.lineTo(w / 2, d / 2 - 2); }
        else if (shape.kind === 'cone') { ctx.moveTo(1.5, 0); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); }
        else if (shape.kind === 'dome' || shape.kind === 'sphere' || shape.kind === 'dish' || shape.kind === 'capsule') { ctx.moveTo(w / 4, 0); ctx.ellipse(0, 0, w / 4, d / 4, 0, 0, Math.PI * 2); }
        else if (shape.kind === 'arch' || shape.kind === 'tunnel') { ctx.setLineDash([3, 3]); ctx.moveTo(-w * 0.3, -d / 2); ctx.lineTo(-w * 0.3, d / 2); ctx.moveTo(w * 0.3, -d / 2); ctx.lineTo(w * 0.3, d / 2); }
        ctx.stroke();
        ctx.restore();
    }

    /**
     * The whole building from above: every cell's highest piece and every shape, the lower drawn
     * first, so the roof lies over the rooms and a tower's cap over its tower.
     */
    _drawAbove(ctx, g, S) {
        const { cell, ox, oy, W, D } = g;
        const index = this._paintIndex;
        if (!index.above) {
            const tops = new Map();
            for (const [, cells] of index.floors) for (const [key, list] of cells) for (const piece of list) {
                if (piece.kind === 'glass' || piece.kind === 'door') continue;
                const z = Number(piece.z) || 0;
                const top = z + (['wall', 'doorway', 'window', 'pillar', 'ladder'].includes(piece.kind) ? S : piece.kind === 'floor' || piece.kind === 'roof' ? 0.1 : 1);
                const best = tops.get(key);
                if (!best || top > best.top) tops.set(key, { top, piece });
            }
            const items = [];
            let low = Infinity, high = -Infinity;
            for (const [key, { top, piece }] of tops) { const [x, y] = key.split(',').map(Number); items.push({ top, piece, x, y }); low = Math.min(low, top); high = Math.max(high, top); }
            for (const shape of index.shapeList) { const top = (Number(shape.z) || 0) + DatabaseStructureEditor.shapeRise(shape); items.push({ top, shape }); low = Math.min(low, top); high = Math.max(high, top); }
            items.sort((a, b) => a.top - b.top);
            index.above = { items, low, high };
        }
        const { items, low, high } = index.above;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, W * cell, D * cell);
        ctx.clip();
        for (const item of items) {
            // Higher is lighter, so a slope and a tower read as height.
            const lift = high > low ? (item.top - low) / (high - low) : 0;
            if (item.shape) { this._drawShape(ctx, g, item.shape, { above: true }); continue; }
            const entry = this._materialImage(item.piece.material);
            if (entry && entry.image) ctx.drawImage(entry.image, ox + item.x * cell, oy + item.y * cell, cell, cell);
            else { ctx.fillStyle = '#6b6f76'; ctx.fillRect(ox + item.x * cell, oy + item.y * cell, cell, cell); }
            ctx.fillStyle = lift >= 0.5 ? `rgba(255,255,255,${((lift - 0.5) * 0.36).toFixed(3)})` : `rgba(0,0,0,${((0.5 - lift) * 0.7).toFixed(3)})`;
            ctx.fillRect(ox + item.x * cell, oy + item.y * cell, cell, cell);
        }
        ctx.restore();
        const accent = (typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? ThemeColors.resolve('--color-accent') : null) || '#e0b020';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox - 1, oy - 1, W * cell + 2, D * cell + 2);
    }

    /** Everything the plan builds, as the 3D view shows it: built once per change. */
    _builtPieces(plan) {
        const version = this._paintVersion || 0, cache = this._built;
        if (cache && cache.plan === plan && cache.version === version) return cache.pieces;
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        let pieces = plan.pieces || [];
        if (SP) { try { pieces = SP.build(plan, 0, 0, 1, 0, name => this.resolve(name)); } catch (error) { pieces = plan.pieces || []; } }
        this._built = { plan, version, pieces };
        return pieces;
    }

    /** How many floors the plan shows: its described floors, its built ones, or those of the plans it is made of. */
    _floorCount(plan) {
        const F = this.floorsApi();
        const own = F.isDescribed(plan) ? Math.max(plan.floors.length, F.occupiedFloors(plan)) : F.floorsOf(plan);
        if (!(plan.parts || []).length) return Math.max(1, Math.min(24, own));
        const whole = F.occupiedFloors({ storey: plan.storey, pieces: this._builtPieces(plan) });
        return Math.max(1, Math.min(24, F.isDescribed(plan) || (plan.pieces || []).length ? Math.max(own, whole) : whole));
    }

    /** The material a role wears: the plan's own, what most of its pieces wear, or a stock one. */
    _roleMaterial(role) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return '';
        if (F.isDescribed(plan) && plan.materials?.[role]) return plan.materials[role];
        const worn = F.roleMaterial(plan, role, this._builtPieces(plan));
        if (worn !== null) return worn;
        if (plan.materials?.[role]) return plan.materials[role];
        const names = this.materials(), stock = { wall: 'Stone', floor: 'Wood', roof: 'RoofTile' }[role];
        return names.includes(stock) ? stock : (role === 'roof' ? '' : names[0] || '');
    }

    /** The roof's height in rows: the plan's own, or the one set here for a building already in pieces. */
    _roofPitch(plan) {
        // A building in pieces keeps no pitch of its own (a new plan's is only the default every plan is given), so the one typed here comes first.
        const F = this.floorsApi();
        if (F && !F.isDescribed(plan) && Number.isFinite(this._paint.roofPitch)) return this._paint.roofPitch;
        if (plan.roof && plan.roof.pitch !== null && Number.isFinite(Number(plan.roof.pitch))) return Number(plan.roof.pitch);
        if (Number.isFinite(this._paint.roofPitch)) return this._paint.roofPitch;
        return plan.roof && plan.roof.style === 'shed' ? 3 : 6;
    }

    /**
     * The roof's style, high side or pitch changed: a described building takes the setting and builds
     * with it; one already in pieces has its roof laid again. One undo step either way.
     */
    setRoof(change) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return;
        const next = Object.assign({}, plan.roof || {});
        if (DatabaseStructureEditor.ROOF_STYLES.includes(change.style)) next.style = change.style;
        if (DatabaseStructureEditor.DIRECTIONS.includes(change.high)) next.high = change.high;
        if (next.style !== 'shed') delete next.high;
        const pitch = change.pitch === undefined ? null : Math.max(next.style === 'shed' ? 1 : 0, Math.min(20, Math.floor(Number(change.pitch)) || 0));
        if (pitch !== null) this._paint.roofPitch = pitch;
        const described = F.isDescribed(plan);
        // A typed pitch is kept with the plan either way: a described building builds with it, and one in
        // pieces shows it again when the structure is next opened.
        if (pitch !== null) next.pitch = pitch;
        this.pushHistory();
        plan.roof = next;
        if (!described) F.rebuildRoof(plan, Object.assign({ style: next.style || 'gable', pitch: this._roofPitch(plan) }, this._roleMaterial('roof') ? { roof: this._roleMaterial('roof') } : {}));
        this._sel = [];
        this.markDirty();
        this.renderSide();
    }

    /** A material over a role as the pointer passes it in the picker: shown, not kept. `null` takes it back. */
    previewRole(role, name) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return;
        if (this._dressing) { F.undress(this._dressing.changes); this._dressing = null; }
        this._paintVersion = (this._paintVersion || 0) + 1;
        if (name !== null && name !== undefined) {
            const only = role !== 'roof' && this._paint.tool === 'select' && this._sel?.length ? this._sel : null;
            this._dressing = { changes: F.dress(plan, role, this._roleMaterial(role), name, only) };
        }
        this._paintVersion = (this._paintVersion || 0) + 1;
        this.drawPaint();
        this.schedulePreview();
    }

    /** A material chosen for a role: the selection wears it, or with nothing selected the whole building; new painting uses it. */
    dressRole(role, name) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return;
        if (this._dressing) { F.undress(this._dressing.changes); this._dressing = null; }
        this._paintVersion = (this._paintVersion || 0) + 1;
        const only = role !== 'roof' && this._paint.tool === 'select' && this._sel?.length ? this._sel : null;
        this.pushHistory();
        const changes = F.dress(plan, role, this._roleMaterial(role), name, only);
        if (!changes.length) this._history.pop();
        this.markDirty();
        this.renderSide();
    }

    /** The roof laid again over the top floor (a squashed one, or after the floors changed), undoably. */
    rebuildRoof() {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return;
        this.pushHistory();
        const pitch = this._roofPitch(plan), roof = this._roleMaterial('roof');
        if (F.needsMaterialize(plan)) F.materialize(plan, typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null, name => this.resolve(name));
        const style = (plan.roof && plan.roof.style) || 'gable';
        F.rebuildRoof(plan, Object.assign({ style, pitch }, roof ? { roof } : {}));
        this._sel = [];
        this.markDirty();
        this.renderBar();
        this.renderSide();
    }

    /** What is selected, in a few words. */
    _selLabel() {
        const sel = this._sel || [];
        const kinds = new Set(sel.map(p => p.kind === 'glass' ? 'window' : p.kind));
        const names = { stair: 'Stairs', wall: 'Wall', doorway: 'Door', window: 'Window', floor: 'Floor' };
        if (kinds.size === 1) {
            const kind = [...kinds][0];
            // A flight is one thing however many cells it covers.
            const cells = kind === 'stair' ? 1 : new Set(sel.map(p => p.x + ',' + p.y)).size;
            return this._t(names[kind] || 'Pieces') + (cells > 1 ? ` × ${cells}` : '');
        }
        return this._t('{n} pieces', { n: sel.length });
    }

    /** The plan as pieces, ready to pick up: a described plan is built out first (undoable). */
    _ensureBuilt() {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan || !F.needsMaterialize(plan)) return false;
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        this.pushHistory();
        F.materialize(plan, SP, name => this.resolve(name));
        this.markDirty();
        return true;
    }

    /** Move the selection by whole cells, undoably; false when it would leave the plot. */
    moveSelection(dx, dy) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan || !this._sel?.length || (!dx && !dy)) return false;
        // A move off the plot is refused (movePieces checks the same): no copy of the plan is made for it.
        if (this._sel.some(p => p.x + dx < 0 || p.y + dy < 0 || p.x + dx >= plan.size[0] || p.y + dy >= plan.size[1])) return false;
        const before = JSON.stringify(plan);
        if (!F.movePieces(plan, this._paint.floor, this._sel, dx, dy)) return false;
        this._history.push(before);
        this._trimHistory();
        this._future.length = 0;
        this.markDirty();
        this.renderSide();
        return true;
    }

    deleteSelection() {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan || !this._sel?.length) return;
        this.pushHistory();
        F.removePieces(plan, this._paint.floor, this._sel);
        this._sel = [];
        this.markDirty();
        this.renderSide();
    }

    /** Turn the selected stairs a quarter; the new flight stays selected. */
    turnSelection() {
        const F = this.floorsApi(), plan = this.current?.plan;
        const stairs = (this._sel || []).filter(p => p.kind === 'stair');
        if (!F || !plan || !stairs.length) return;
        this.pushHistory();
        const before = new Set(plan.pieces);
        F.turnStairs(plan, this._paint.floor, stairs);
        this._sel = plan.pieces.filter(p => p.kind === 'stair' && !before.has(p));
        this.markDirty();
        this.renderSide();
    }

    /** One drag, done: the pieces it makes on the floor in view, undoable. */
    applyPaint(tool, a, b) {
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!F || !plan) return;
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        this.pushHistory();
        const wall = this._roleMaterial('wall'), slab = this._roleMaterial('floor');
        if (F.needsMaterialize(plan)) F.materialize(plan, SP, name => this.resolve(name));
        const floor = this._paint.floor;
        if (tool === 'room') {
            F.paintFloor(plan, floor, F.rectCells(a.x, a.y, b.x, b.y), slab);
            F.paintWall(plan, floor, F.outlineCells(a.x, a.y, b.x, b.y), wall, slab);
        } else if (tool === 'floor') F.paintFloor(plan, floor, F.rectCells(a.x, a.y, b.x, b.y), slab);
        else if (tool === 'wall') F.paintWall(plan, floor, F.lineCells(a.x, a.y, b.x, b.y), wall, slab);
        else if (tool === 'door') F.placeDoor(plan, floor, F.lineCells(a.x, a.y, b.x, b.y));
        else if (tool === 'window') F.placeWindow(plan, floor, F.lineCells(a.x, a.y, b.x, b.y));
        else if (tool === 'stairs') {
            if (floor + 1 >= F.floorsOf(plan)) F.setFloors(plan, floor + 2);
            F.placeStairs(plan, floor, a.x, a.y, this._paint.dir, 2, slab);
        } else if (tool === 'erase') F.erase(plan, floor, F.rectCells(a.x, a.y, b.x, b.y));
        this.markDirty();
        this.renderBar();
        this.renderSide();
    }

    _bindPaint(canvas) {
        if (!canvas) return;
        let drag = null;
        canvas.addEventListener('contextmenu', event => event.preventDefault());
        canvas.addEventListener('pointerdown', event => {
            if (event.button !== 0 && event.button !== 2) return;
            if (this._paint.above) return;
            const cell = this._paintCellAt(canvas, event.clientX, event.clientY);
            if (!cell || !cell.inside) return;
            canvas.setPointerCapture?.(event.pointerId);
            canvas.focus({ preventScroll: true });
            if (event.button === 0 && this._paint.tool === 'select') {
                const F = this.floorsApi(), plan = this.current.plan;
                if (this._ensureBuilt()) this._sel = [];
                const sel = this._sel || [];
                const inSel = sel.some(p => p.x === cell.x && p.y === cell.y);
                const picked = inSel ? [] : F.selectAt(plan, this._paint.floor, cell.x, cell.y);
                if (!inSel && picked.length) this._sel = event.shiftKey ? [...new Set(sel.concat(picked))] : picked;
                else if (!inSel && !event.shiftKey) this._sel = [];
                drag = { tool: inSel || picked.length ? 'move' : 'marquee', a: cell, b: cell, add: event.shiftKey };
                this._paintDrag = drag;
                this.renderSide();
                this.drawPaint();
                return;
            }
            drag = { tool: event.button === 2 ? 'erase' : this._paint.tool, a: cell, b: cell };
            this._paintDrag = drag;
            this.drawPaint();
        });
        canvas.addEventListener('pointermove', event => {
            const cell = this._paintCellAt(canvas, event.clientX, event.clientY);
            // The picture changes only when the pointer reaches another cell: a move inside one draws nothing new.
            const same = (a, b) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);
            const hover = cell && cell.inside ? cell : null;
            const moved = !same(hover, this._paintHover) || (drag && cell && !same(cell, drag.b));
            this._paintHover = hover;
            if (drag && cell) drag.b = cell;
            if (moved) this.drawPaint();
        });
        const finish = event => {
            if (!drag) return;
            const done = drag;
            drag = null;
            this._paintDrag = null;
            canvas.releasePointerCapture?.(event.pointerId);
            if (done.tool === 'move') { if (!this.moveSelection(done.b.x - done.a.x, done.b.y - done.a.y)) this.drawPaint(); return; }
            if (done.tool === 'marquee') {
                const F = this.floorsApi();
                const picked = F.selectCells(this.current.plan, this._paint.floor, F.rectCells(done.a.x, done.a.y, done.b.x, done.b.y));
                this._sel = done.add ? [...new Set((this._sel || []).concat(picked))] : picked;
                this.renderSide(); this.drawPaint();
                return;
            }
            this.applyPaint(done.tool, done.a, done.b);
        };
        canvas.addEventListener('pointerup', finish);
        canvas.addEventListener('pointercancel', () => { drag = null; this._paintDrag = null; this.drawPaint(); });
        canvas.addEventListener('pointerleave', () => { this._paintHover = null; if (!drag) this.drawPaint(); });
        canvas.addEventListener('keydown', event => {
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); if (event.shiftKey ? this.redo() : this.undo()) this.renderSide(); return; }
            if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); if (this.redo()) this.renderSide(); return; }
            if (this._paint.tool === 'select' && this._sel?.length) {
                const step = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
                if (step) { event.preventDefault(); this.moveSelection(step[0], step[1]); return; }
                if (key === 'delete' || key === 'backspace') { event.preventDefault(); this.deleteSelection(); return; }
                if (key === 'r') { this.turnSelection(); return; }
                if (key === 'escape') { this._sel = []; this.renderSide(); this.drawPaint(); return; }
            }
            if (key === 'r' && this._paint.tool === 'stairs') {
                const order = ['north', 'east', 'south', 'west'];
                this._paint.dir = order[(order.indexOf(this._paint.dir) + 1) % 4];
                this.renderSide(); this.drawPaint();
            }
        });
        if (typeof ResizeObserver === 'function') {
            this._paintObserver?.disconnect?.();
            this._paintObserver = new ResizeObserver(() => this.drawPaint());
            this._paintObserver.observe(canvas);
        }
    }

    /** The floor in view from above: floors in their material, walls dark, doors, windows and stairs marked, the floor below faint. */
    drawPaint() {
        const canvas = this._detail?.querySelector('.rr-structures-paint');
        const F = this.floorsApi(), plan = this.current?.plan;
        if (!canvas || !F || !plan) return;
        const g = this._paintGeometry(canvas);
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(g.width * dpr) || canvas.height !== Math.round(g.height * dpr)) { canvas.width = Math.round(g.width * dpr); canvas.height = Math.round(g.height * dpr); }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        const css = name => (typeof ThemeColors !== 'undefined' && ThemeColors.resolve ? ThemeColors.resolve(name) : null);
        ctx.fillStyle = css('--color-bg-deep') || '#101216';
        ctx.fillRect(0, 0, g.width, g.height);
        const { cell, ox, oy, W, D } = g;
        // The plot, and the floor below as a faint outline to build on.
        ctx.fillStyle = '#262b31';
        ctx.fillRect(ox, oy, W * cell, D * cell);
        const S = F.storeyOf(plan);
        // The plan is drawn from what it builds (its rooms, its own pieces, its shapes, its parts and paths),
        // the same pieces the 3D view shows, without changing a described building until it is painted.
        const source = { size: plan.size, storey: S, pieces: this._builtPieces(plan) };
        const floor = this._paint.floor;
        // Pieces by floor and cell, built once per change: a 24-floor manor is tens of thousands of
        // pieces, and searching them all for every cell of the plan took seconds per draw.
        const cacheKey = [this._paintVersion || 0, source.pieces, source.pieces.length].join('|');
        if (!this._paintIndex || this._paintIndex.key !== cacheKey || this._paintIndex.pieces !== source.pieces) {
            const floors = new Map(), shapes = new Map();
            // A shape belongs on the plan of every floor it stands through (a tower from the ground up),
            // lowest first so what stands on something is drawn over it. What only hangs in the top of
            // a storey (eaves, a roof's slab) is overhead and left to the view from above.
            const shapeList = (source.pieces || []).filter(piece => Array.isArray(piece.size)).sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0));
            for (const piece of shapeList) {
                const z0 = Number(piece.z) || 0, z1 = z0 + DatabaseStructureEditor.shapeRise(piece);
                for (let f = Math.floor(z0 / S); f * S < z1 - 0.05; f++) {
                    if (f === Math.floor(z0 / S) && z0 - f * S > S - 1.5) continue;
                    if (!shapes.has(f)) shapes.set(f, []);
                    shapes.get(f).push(piece);
                }
            }
            for (const piece of source.pieces || []) {
                const f = Math.floor((Number(piece.z) || 0) / S);
                if (Array.isArray(piece.size)) continue;
                let cells = floors.get(f);
                if (!cells) floors.set(f, cells = new Map());
                const key = piece.x + ',' + piece.y;
                const list = cells.get(key);
                if (list) list.push(piece); else cells.set(key, [piece]);
            }
            this._paintIndex = { key: cacheKey, pieces: source.pieces, floors, shapes, shapeList };
        }
        const byCell = floorIndex => this._paintIndex.floors.get(floorIndex) || new Map();
        const shownOf = list => {
            for (const kind of ['doorway', 'window', 'wall', 'stair', 'pillar', 'block', 'fence', 'ramp', 'roof']) { const piece = list.find(p => p.kind === kind); if (piece) return piece; }
            return list.find(p => p.kind === 'floor') || list[0] || null;
        };
        if (this._paint.above) { this._drawAbove(ctx, g, S); return; }
        if (floor > 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.10)';
            for (const [key, list] of byCell(floor - 1)) if (list.some(p => F.WALLISH.includes(p.kind))) { const [x, y] = key.split(',').map(Number); ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
        }
        const drawMaterial = (name, x, y, shade) => {
            const entry = this._materialImage(name);
            if (entry && entry.image) ctx.drawImage(entry.image, ox + x * cell, oy + y * cell, cell, cell);
            else { ctx.fillStyle = '#6b6f76'; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
            if (shade) { ctx.fillStyle = shade; ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell); }
        };
        const arrow = (x, y, rot) => {
            const cx = ox + (x + 0.5) * cell, cy = oy + (y + 0.5) * cell, r = cell * 0.32;
            // rot 0 rises south, 1 west, 2 north, 3 east: the arrow points up the stairs.
            const angle = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][rot % 4];
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, cell / 10);
            ctx.beginPath(); ctx.moveTo(-r, -r * 0.8); ctx.lineTo(r * 0.6, 0); ctx.lineTo(-r, r * 0.8); ctx.stroke();
            ctx.restore();
        };
        for (const [key, list] of byCell(floor)) {
            const [x, y] = key.split(',').map(Number);
            const slab = list.find(p => p.kind === 'floor');
            if (slab && (Number(slab.z) || 0) === floor * S) drawMaterial(slab.material, x, y, null);
            const shown = shownOf(list);
            if (!shown || shown.kind === 'floor') continue;
            const px = ox + x * cell, py = oy + y * cell;
            if (shown.kind === 'wall') drawMaterial(shown.material, x, y, 'rgba(0,0,0,0.45)');
            else if (shown.kind === 'doorway') { drawMaterial(slab ? slab.material : '', x, y, null); ctx.fillStyle = '#c8873a'; ctx.fillRect(px + cell * 0.15, py + cell * 0.4, cell * 0.7, cell * 0.2); }
            else if (shown.kind === 'window') { drawMaterial(shown.material, x, y, 'rgba(0,0,0,0.45)'); ctx.fillStyle = '#8fd3ff'; ctx.fillRect(px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6); }
            else if (shown.kind === 'stair') { drawMaterial(shown.material, x, y, 'rgba(0,0,0,0.25)'); arrow(x, y, Number(shown.rot) || 0); }
            else { ctx.fillStyle = 'rgba(150,160,175,0.85)'; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2); }
            if (shown.kind === 'wall' || shown.kind === 'window') { ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, cell - 1, cell - 1); }
        }
        // Shapes: each one's own footprint, turned as it stands, kept inside the plot. What starts above
        // head height (a canopy, a hanging sign) is overhead: an outline in dashes.
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox, oy, W * cell, D * cell);
        ctx.clip();
        for (const shape of this._paintIndex.shapes.get(floor) || []) this._drawShape(ctx, g, shape, { overhead: (Number(shape.z) || 0) - floor * S >= 2.5 });
        ctx.restore();
        // The grid, then the plot's edge.
        if (cell >= 8) {
            ctx.strokeStyle = 'rgba(255,255,255,0.07)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= W; x++) { ctx.moveTo(ox + x * cell + 0.5, oy); ctx.lineTo(ox + x * cell + 0.5, oy + D * cell); }
            for (let y = 0; y <= D; y++) { ctx.moveTo(ox, oy + y * cell + 0.5); ctx.lineTo(ox + W * cell, oy + y * cell + 0.5); }
            ctx.stroke();
        }
        const accent = css('--color-accent') || '#e0b020';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox - 1, oy - 1, W * cell + 2, D * cell + 2);
        // The selection, and where a drag would put it.
        const drag = this._paintDrag;
        if (this._sel?.length) {
            const moving = drag && drag.tool === 'move' ? [drag.b.x - drag.a.x, drag.b.y - drag.a.y] : [0, 0];
            const selCells = new Set(this._sel.map(p => p.x + ',' + p.y));
            ctx.lineWidth = 2;
            for (const key of selCells) {
                const [x, y] = key.split(',').map(Number);
                if (moving[0] || moving[1]) {
                    ctx.fillStyle = 'rgba(255,255,255,0.12)';
                    ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
                }
                const gx = x + moving[0], gy = y + moving[1];
                if (gx < 0 || gy < 0 || gx >= W || gy >= D) continue;
                ctx.fillStyle = 'rgba(255,214,64,0.30)';
                ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
                ctx.strokeStyle = accent;
                const edge = (nx, ny) => !selCells.has((nx - moving[0]) + ',' + (ny - moving[1]));
                const px = ox + gx * cell, py = oy + gy * cell;
                ctx.beginPath();
                if (edge(gx, gy - 1)) { ctx.moveTo(px, py + 1); ctx.lineTo(px + cell, py + 1); }
                if (edge(gx, gy + 1)) { ctx.moveTo(px, py + cell - 1); ctx.lineTo(px + cell, py + cell - 1); }
                if (edge(gx - 1, gy)) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + cell); }
                if (edge(gx + 1, gy)) { ctx.moveTo(px + cell - 1, py); ctx.lineTo(px + cell - 1, py + cell); }
                ctx.stroke();
            }
        }
        if (this._paint.tool === 'select' && !(drag && drag.tool === 'marquee')) return;
        // What a drag would do, or the cell under the pointer.
        const cells = drag ? this._paintCells(drag.tool, drag.a, drag.b) : (this._paintHover ? this._paintCells(this._paint.tool, this._paintHover, this._paintHover) : []);
        if (this._paint.tool === 'stairs' && !drag?.tool?.startsWith?.('erase') && (drag || this._paintHover)) {
            const start = drag ? drag.a : this._paintHover, d = F.DIRS[this._paint.dir];
            cells.length = 0;
            for (let i = 0; i < S; i++) for (let k = 0; k < 2; k++) cells.push([start.x + d[0] * i + (d[1] !== 0 ? k : 0), start.y + d[1] * i + (d[0] !== 0 ? k : 0)]);
        }
        const erasing = drag ? drag.tool === 'erase' : this._paint.tool === 'erase';
        ctx.fillStyle = erasing ? 'rgba(224,92,78,0.35)' : 'rgba(255,214,64,0.28)';
        ctx.strokeStyle = erasing ? '#e05c4e' : accent;
        for (const [x, y] of cells) {
            if (x < 0 || y < 0 || x >= W || y >= D) continue;
            ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
            ctx.strokeRect(ox + x * cell + 0.5, oy + y * cell + 0.5, cell - 1, cell - 1);
        }
    }

    // ---- History ---------------------------------------------------------

    /** Before a change: the plan as it is, so Undo can bring it back. */
    /**
     * Undo keeps whole plans as text: at most HISTORY of them, and no more text than HISTORY_CHARS
     * (a plan of 80,000 pieces is 4.5 million characters, and a hundred of those was 450 MB).
     * The newest step is always kept.
     */
    _trimHistory() {
        const history = this._history;
        let chars = 0;
        for (const text of history) chars += text.length;
        while (history.length > 1 && (history.length > DatabaseStructureEditor.HISTORY || chars > DatabaseStructureEditor.HISTORY_CHARS)) chars -= history.shift().length;
    }

    pushHistory() {
        if (!this.current) return;
        this._history.push(JSON.stringify(this.current.plan));
        this._trimHistory();
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
        this._paintVersion = (this._paintVersion || 0) + 1;
        this._dressing = null;
        const plan = this.current.plan;
        const next = DatabaseStructureEditor.normalizePlan(JSON.parse(json));
        for (const key of Object.keys(plan)) delete plan[key];
        Object.assign(plan, next);
        this.current.entry.name = plan.name;
        this.parentEditor?.refreshDatabaseListLabel?.(this.current.entry, 'structures');
        if (this.floor !== 'roof') this.floor = Math.max(0, Math.min(plan.floors.length - 1, this.floor));
        this.selection = null;
        this._sel = [];
        this.parentEditor?._markDatabaseMutation?.();
        this.render();
    }

    /**
     * A record made by Change Maximum or Clear has no name yet while its Name field shows its plan's ("New Plan"):
     * worked on, it takes that name, or the save (which skips a record with no name and no file, a deleted one)
     * dropped what was built on it.
     */
    nameIfNew() {
        const entry = this.current?.entry, plan = this.current?.plan;
        if (entry && plan && !entry.name && !entry.file && plan.name) {
            entry.name = String(plan.name);
            this.parentEditor?.refreshDatabaseListLabel?.(entry, 'structures');
        }
    }

    /** An edit: the database owns the dirty state; the previews follow. */
    markDirty() {
        if (!this.current) return;
        this.nameIfNew();
        this._paintVersion = (this._paintVersion || 0) + 1;
        this.parentEditor?._markDatabaseMutation?.();
        this._reportStale = true;
        this.drawPaint();
        this.schedulePreview();
    }

    setName(name) {
        const { entry, plan } = this.current;
        entry.name = name;
        plan.name = name;
        this.parentEditor?.refreshDatabaseListLabel?.(entry, 'structures');
        this.parentEditor?._markDatabaseMutation?.();
    }

    _numberHtml(cls, value, attrs = '') {
        return `<input type="number" class="database-field-value ${cls}" value="${Number(value)}" step="1" style="width:52px;" ${attrs}>`;
    }

    /** The grid under a swatch button; a click chooses, Escape or a click elsewhere closes. */
    openMaterialPicker(button, onPick, onHover = null) {
        this.closeMaterialPicker();
        RRMaterialPopup.open(button, {
            materials: this.materials().map(name => ({ name, url: this.materialUrl(name) || '' })),
            current: button.dataset.value || '', blank: button.dataset.blank || '',
            note: this._t('Any tileable image under img/materials is a material.'), onPick, onHover
        });
    }

    closeMaterialPicker() {
        if (typeof RRMaterialPopup !== 'undefined') RRMaterialPopup.close();
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
        // A structure is a plot you build on with the map's own Build bar; the page names it, sizes the plot and places it.
        bar.innerHTML = `
            ${this._field(tt('Name'), `<input type="text" class="database-field-value rr-structures-name" value="${rrEscapeHtml(plan.name)}" style="width:150px;">`)}
            ${this._field(tt('Plot'), `${this._numberHtml('rr-structures-size', plan.size[0], `data-i="0" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}" title="${rrEscapeHtml(tt('Width in tiles'))}"`)}<span>×</span>${this._numberHtml('rr-structures-size', plan.size[1], `data-i="1" min="${DatabaseStructureEditor.SIZE_MIN}" max="${DatabaseStructureEditor.SIZE_MAX}" title="${rrEscapeHtml(tt('Depth in tiles'))}"`)}`)}
            ${this._field(tt('Floors'), this._numberHtml('rr-structures-height', this.floorsApi() ? this._floorCount(plan) : plan.height, 'min="1" max="24"'))}
            ${typeof RRStructure2D !== 'undefined' ? `<label class="rr-structures-3d" title="${rrEscapeHtml(tt('On: a 3D structure, built of pieces. Off: a 2D one, of tiles, pictures and media surfaces, for 2D maps.'))}"><input type="checkbox" class="rr-structures-3d-check" checked><span>3D</span></label>` : ''}
            <button type="button" class="rr-button-primary rr-structures-build rr-btn-with-icon" style="margin-left:auto;"><svg class="rr-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20 13.4 10.6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M13 4.2 19.8 11 17 13.8 10.2 7Z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg><span>${tt('Build')}</span></button>
            <button type="button" class="rr-btn-secondary rr-structures-use rr-btn-with-icon"><svg class="rr-btn-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21.5s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5-6.5 11.2-6.5 11.2Z" fill="currentColor"/><circle cx="12" cy="10.3" r="2.4" fill="var(--rr-btn-icon-hole, #000)"/></svg><span>${tt('Use on the map')}</span></button>`;
        bar.querySelector('.rr-structures-name').addEventListener('input', event => this.setName(event.target.value));
        for (const input of bar.querySelectorAll('.rr-structures-size')) {
            // The plot never shrinks past what is built on it: those pieces could not be reached again.
            const least = () => Math.max(DatabaseStructureEditor.SIZE_MIN, DatabaseStructureEditor.builtExtent(plan, name => this.resolve(name))[Number(input.dataset.i)]);
            input.min = String(least());
            input.addEventListener('change', () => {
                const i = Number(input.dataset.i);
                const size = Math.max(least(), Math.min(DatabaseStructureEditor.SIZE_MAX, Math.floor(Number(input.value)) || DatabaseStructureEditor.SIZE_MIN));
                input.value = String(size);
                if (size === plan.size[i]) return;
                this.pushHistory();
                plan.size[i] = size;
                this.markDirty();
            });
        }
        bar.querySelector('.rr-structures-height')?.addEventListener('change', event => this.setFloorCount(event.target.value));
        bar.querySelector('.rr-structures-build')?.addEventListener('click', () => {
            const workshop = window.reactor?.structureWorkshop;
            if (workshop && this.current) { this.nameIfNew(); workshop.open(this.current.entry); }
        });
        bar.querySelector('.rr-structures-use').addEventListener('click', () => this.useOnMap());
        bar.querySelector('.rr-structures-3d-check')?.addEventListener('change', async event => {
            // Off: a 2D structure. What is built in 3D does not carry over, so a built one asks first.
            if (!DatabaseStructureEditor.isEmpty(plan) && !await RRDialog.confirm(this._t('Make this a 2D structure? What is built in 3D is cleared.'), { title: this._t('Structures'), ok: this._t('Make it 2D'), danger: true })) { event.target.checked = true; return; }
            // The tileset of the map open in the editor, else the first: the tile layer it starts with.
            const tilesetId = window.reactor?.tilemapManager?.currentMap?.tilesetId || this.databaseManager?.getTilesets?.()?.find(Boolean)?.id || 1;
            const entry = this.current.entry, size = plan.size;
            entry.plan = RRStructure2D.newPlan(plan.name, Math.min(size[0], RRStructure2D.SIZE_MAX), Math.min(size[1], RRStructure2D.SIZE_MAX), tilesetId);
            this.nameIfNew();
            this.parentEditor?._markDatabaseMutation?.();
            this.showStructureDetail(this._detail, entry);
        });
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
        this.drawReport(report);
        this.draw3D(report);
    }

    drawReport(report) {
        const box = this._detail?.querySelector('.rr-structures-report');
        if (!box) return;
        if (!report) { box.textContent = ''; return; }
        const lines = [];
        lines.push(this._t('Pieces: {count}', { count: report.pieces }) + (report.triangles === null ? '' : ', ' + this._t('triangles: {count}', { count: report.triangles.toLocaleString() })));
        if (report.error) lines.push(rrEscapeHtml(report.error));
        else if (DatabaseStructureEditor.isEmpty(this.current.plan)) lines.push(this._t('An empty plot. Press Build to build on it with the Build bar.'));
        // A built structure is its pieces: there are no rooms to walk, so nothing more to report.
        else if (!this.current.plan.floors.length && (this.current.plan.pieces || []).length) lines.push(this._t('Press Build to change it, or Use on the map to place it.'));
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
        // Looking inside: everything above the floor being painted is left off, so the plan's floor
        // is seen from above in 3D. Off by default: the whole building shows.
        const peek = this._peek === true;
        const lid = plan.storey * ((this._paint ? this._paint.floor : 0) + 1);
        const shown = peek ? report.built.filter(piece => !(piece.z >= lid - 1e-6 && !DatabaseStructureEditor.SHAPE_KINDS.includes(piece.kind))) : report.built;
        const mapData = { width: W, height: H, reactor3d: { version: 1, elevation: new Array(W * H).fill(0), pieces: shown } };
        const byMaterial = new Map();
        const peekButton = this._detail?.querySelector('.rr-structures-peek');
        if (peekButton) { peekButton.setAttribute('aria-pressed', String(peek)); peekButton.style.borderColor = peek ? 'var(--color-accent)' : ''; }
        // One mesh per material and surface: a gold bell is gold here too.
        for (const piece of shown) {
            const surface = DatabaseStructureEditor.surfaceOf(piece);
            const key = (piece.material || '') + '\u0001' + (surface && Reactor3D.surfaceKey ? Reactor3D.surfaceKey(surface) : '');
            if (!byMaterial.has(key)) byMaterial.set(key, { name: piece.material || '', surface, pieces: [] });
            byMaterial.get(key).pieces.push(piece);
        }
        for (const [key, { name, surface, pieces }] of byMaterial) {
            const geometry = Reactor3D.pieceGeometry(pieces, mapData);
            const mesh = new THREE.Mesh(geometry, this._material3D(name, surface, key));
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
        // How high the building stands: a built one has no floor descriptions to count, so the view centres on half of that.
        let top = plan.storey;
        for (const piece of shown) top = Math.max(top, (Number(piece.z) || 0) + (Array.isArray(piece.size) ? Number(piece.size[1]) || 1 : 1));
        preview.centre = { x: W / 2, y: plan.floors.length ? plan.storey * plan.floors.length / 2 : top / 2, z: H / 2 };
        this._layoutHandles(preview, plan);
        this._layoutProxies(preview, plan);
        this._layoutEffects(preview, plan);
        this._setGhost(preview, null);
        this._syncGizmo(preview);
        // Until the wheel says otherwise the whole building is in view, however narrow the pane: its
        // half-diagonal, top included, is what the frame loop fits.
        preview.fit = Math.sqrt(W * W + H * H + top * top) / 2;
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
        const pitch = plan.roof.style === 'shed' ? Math.max(1, plan.roof.pitch || 1) : Math.max(0, Math.min(Math.floor((H - 1) / 2), plan.roof.pitch || 0));
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

    _material3D(name, surface = null, key = name) {
        const preview = this._preview;
        if (preview.materials.has(key)) return preview.materials.get(key);
        // No reflections in this view: a finish shows as its colour, over the picture when the finish keeps it.
        const look = DatabaseStructureEditor.surfaceLook(surface);
        const material = new THREE.MeshBasicMaterial({ color: look ? look.color : name ? 0xffffff : 0x9a9a9a, vertexColors: true, side: THREE.FrontSide });
        const url = look && !look.pictured ? null : this.materialUrl(name);
        if (url) {
            const texture = new THREE.TextureLoader().load(url, () => { preview.dirty = true; });
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            material.map = texture;
        }
        preview.materials.set(key, material);
        return material;
    }

    _ensure3D(canvas) {
        if (this._preview && this._preview.canvas === canvas) return;
        this._disposePreview();
        const scene = new THREE.Scene();
        if (typeof ModelPreview3D !== 'undefined' && ModelPreview3D.updateBackground) ModelPreview3D.updateBackground(scene); else scene.background = new THREE.Color(0x202830);
        const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        if (typeof RRModelRelease !== 'undefined') RRModelRelease.track(renderer, 'structure-preview');
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
        const preview = this._preview = { canvas, scene, camera, renderer, meshes: [], materials: new Map(), yaw: 0.7, pitch: 0.55, distance: 0, autoDistance: true, centre: { x: 0, y: 0, z: 0 }, dirty: true, raf: 0 };
        const tick = () => {
            if (this._preview !== preview) return;
            if (!canvas.isConnected) { this._disposePreview(); return; }
            const rect = canvas.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
            if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
                renderer.setSize(width, height, false);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                preview.dirty = true;
            }
            if (preview.dirty || preview.live) {
                if (preview.autoDistance && preview.fit) preview.distance = preview.fit / Math.tan(camera.fov * Math.PI / 360) / Math.min(1, camera.aspect) * 1.05;
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
                this._showHandleLabel((handle === 'pitch' ? tt('Roof pitch') : tt('Floor height')) + ': ' + drag.start, event.clientX, event.clientY);
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
                this._showHandleLabel((drag.handle === 'pitch' ? tt('Roof pitch') : tt('Floor height')) + ': ' + value, event.clientX, event.clientY);
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
                    this._trimHistory();
                    this._future.length = 0;
                    this.markDirty();
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
                }
            }
            if (drag && drag.handle) {
                this._showHandleLabel(null);
                canvas.style.cursor = 'grab';
                if (drag.changed) {
                    this._history.push(drag.snapshot);
                    this._trimHistory();
                    this._future.length = 0;
                    this.markDirty();
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
        // The page's own context goes back to the browser with it.
        if (typeof RRModelRelease !== 'undefined') RRModelRelease.dropRenderer(preview.renderer);
        else preview.renderer.dispose();
        this._preview = null;
    }

    // ---- Shapes: pickers, placement, the numbers behind the handles ---------

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

    /** Set one dimension of a shape; with the lock on, the other two follow in proportion. */
    resizeShape(shape, i, value, lock) {
        const snap = v => Math.max(0.25, Math.round(v * 4) / 4);
        if (lock && shape.size[i] > 0) {
            const k = value / shape.size[i];
            shape.size = shape.size.map(v => Math.min(60, snap(v * k)));
        }
        shape.size[i] = Math.min(60, snap(value));
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
            const mime = { webm: 'video/webm', mp4: 'video/mp4', ogv: 'video/ogg', m4v: 'video/mp4', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', jxl: 'image/jxl' }[ext] || 'application/octet-stream';
            return 'data:' + mime + ';base64,' + node.fs.readFileSync(file).toString('base64');
        } catch (error) { return null; }
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
        this._paintObserver?.disconnect?.();
        this._paintObserver = null;
        this._detail = null;
        // The page is gone: its undo steps (whole plans as text) and what it built to draw them go with it.
        // Opening a structure starts them again. The material pictures stay: every structure paints with them.
        this._history = [];
        this._future = [];
        this._built = null;
        this._paintIndex = null;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseStructureEditor;
