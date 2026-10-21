/**
 * PieceBuilderManager - the Pieces tab: a 3D tileset painted on a 3D map.
 *
 * A piece is a block of one kind (wall block, floor, pillar, stair, ramp,
 * gable roof, doorway, window, fence) on a cell at a level, turned in
 * quarter turns, wearing a material image from img/materials. Laying them
 * happens in the 3D view (MapEditor3D asks `active` and calls
 * `beginStroke` / `paintAt` / `endStroke` with a cell and level); this owns
 * the chosen piece, the panel and an undo stack of whole piece lists.
 */
class PieceBuilderManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.active = false;
        this.kind = 'wall';
        this.rot = 0;
        this.level = 0;
        this.material = '';
        this.finish = '';               // mirror, chrome, polished, glossy, gold, or plain
        this.surface = null;            // the sliders' surface for new pieces (wins over the finish)
        this.mode = 'select';
        this.structure = '';
        this.selectedGroup = 0;
        this.panel = null;
        this.undoStack = [];
        this.redoStack = [];
        this._stroke = null;
        this._onKeyDown = event => this.handleKey(event);
        this._materialsCache = null;
        // The next shape's scale and kind.
        this.shapeScale = 1;
        this.lastShape = 'cylinder';
        // Sizes chosen in the specs panel, per kind; a stair run's length; the selected piece and its handle mode.
        this.sizes = {};
        this.stairSteps = 1;
        this.stairWidth = 1;
        // A ladder reaches a storey unless told otherwise.
        this.ladderHeight = 5;
        this.ladderWidth = 1;
        // Rocks laid by hand each vary a little (size, turn, roughness) unless told not to; the next
        // one's variation is fixed ahead by its seed, so the ghost is the rock the click lays. The top
        // and tint the next rock wears.
        this.rockVary = true;
        this.rockSeed = 1;
        this.rockCap = '';
        this.rockTint = '';
        // The next door's settings (its width and facing come from the doorway it is hung in), and
        // the frame the next window wears.
        this.door = { style: 'plank', hinge: 'left', swing: 'away', opens: 'auto', width: 2 };
        this.windowFrame = { style: 'cottage' };
        this.selected = 0;
        this.selectedIds = [];
        this.gizmoMode = 'all';          // every handle at once: arrows, rings and size cubes
    }

    // ---- A selection of many: a box dragged round them ----------------------

    /** Every selected piece's id: the box's pieces, else the one piece. */
    selectionIds() { return this.selectedIds.length ? this.selectedIds.slice() : (this.selected ? [this.selected] : []); }
    selectionPieces() { const ids = new Set(this.selectionIds()); const map = this.currentMap(); return map ? (this.elevation()?.pieces(map) || []).filter(piece => ids.has(piece.id)) : []; }

    // ---- The parts of a building: a material and a finish each ---------------

    /** Every part a selection can hold, in the order they are listed. */
    static PART_ORDER = ['wall', 'inner', 'floor', 'ceiling', 'roof', 'stair', 'ramp', 'ladder', 'pillar', 'door', 'frame', 'glass', 'fence', 'path', 'block', 'shape', 'rock'];
    /** What a framed window's frame wears when it names no material (the runtime's own default). */
    static FRAME_MATERIAL = 'Wood';

    /**
     * Pieces sorted into the parts of the buildings they make: `[{ key, ids, at, count, material, mixed,
     * materials }]` in PART_ORDER, only the parts present. `at` are the pieces' places in the list given;
     * `material` is the part's one material ('' is plain), or null when its pieces differ (`mixed`), and
     * `materials` every one it holds. `shapes` names the shape kinds, `storey` a wall's height.
     *
     * A part is what a piece is in its building, which its kind alone does not say (a house's roof is
     * ramps, slabs and thin boxes; its gables are blocks):
     *  - wall: walls, doorways and windows with open ground on one of their four sides; the blocks stacked
     *    on a wall (a gable's steps, a parapet) and the ramps and slabs lying on those blocks.
     *  - inner: walls and doorways with the building on all four sides, and what is stacked on them.
     *  - floor: a slab with something over it that is the lowest in its cell or has walls standing at its
     *    level; an open slab on top of something low, or alone between walls on all four sides.
     *  - ceiling: a covered slab a storey or more above the foot of its cell, no wall standing at its level.
     *  - roof: `roof` pieces; a ramp or slab with nothing over it, a storey or more above the foot of its
     *    cell; the ramps up and down the same slope; a thin box that is tilted two levels up or higher, or
     *    lies on a roof's or a gable's top slab (eaves, verges, an awning).
     *  - path: an open slab alone in its cell, not walled in.
     *  - stair, ramp, ladder, pillar, door, glass, fence, rock: the kind. block: a block on no wall.
     *    shape: every other shape.
     *  - frame: the frames that windows wear (`frame.material`); such a window is in its wall part too.
     */
    static buildingParts(pieces, { shapes = [], storey = 5 } = {}) {
        const S = storey, shapeKinds = new Set(shapes);
        const SOLID = new Set(['floor', 'wall', 'doorway', 'window', 'glass', 'block', 'ramp', 'roof', 'stair', 'pillar']);
        const WALLS = new Set(['wall', 'doorway', 'window']);
        const RISE = [[0, 1], [-1, 0], [0, -1], [1, 0]];
        const NONE = [];
        const cellKey = (x, y) => y * 65536 + x;
        // Every solid cell piece by its cell, lowest first; the levels walls stand at per building; how far the walls of a level reach along each row and column.
        const cells = new Map(), wallLevels = new Map(), rows = new Map(), cols = new Map();
        const widen = (spans, key, at) => { const span = spans.get(key); if (!span) spans.set(key, [at, at]); else { if (at < span[0]) span[0] = at; if (at > span[1]) span[1] = at; } };
        for (const piece of pieces) {
            if (!SOLID.has(piece.kind)) continue;
            const key = cellKey(piece.x, piece.y);
            const list = cells.get(key);
            if (list) list.push(piece); else cells.set(key, [piece]);
            if (!WALLS.has(piece.kind)) continue;
            const levels = wallLevels.get(piece.group || 0);
            if (levels) levels.add(piece.z); else wallLevels.set(piece.group || 0, new Set([piece.z]));
            widen(rows, piece.z * 65536 + piece.y, piece.x); widen(cols, piece.z * 65536 + piece.x, piece.y);
        }
        for (const list of cells.values()) if (list.length > 1) list.sort((a, b) => a.z - b.z);
        const at = (x, y) => cells.get(cellKey(x, y)) || NONE;
        const part = new Map();
        // The building reaches a cell at a level when a wall stands there or anything lies over it.
        const inside = (x, y, z) => { for (const q of at(x, y)) if (q.z > z || (q.z === z && WALLS.has(q.kind))) return true; return false; };
        const walled = role => role === 'wall' || role === 'inner';
        // The part of the wall a piece stands directly on, or of the block carried up from a wall; null on neither.
        const onWall = piece => { for (const q of at(piece.x, piece.y)) { if (q.z >= piece.z) break; if (WALLS.has(q.kind) && q.z + S === piece.z) return part.get(q); } return null; };
        const onBlock = piece => { for (const q of at(piece.x, piece.y)) { if (q.z >= piece.z) break; if (q.kind === 'block' && q.z + 1 === piece.z && walled(part.get(q))) return part.get(q); } return null; };
        // Nothing over it, and nothing but a slab standing at its own level.
        const open = piece => { for (const q of at(piece.x, piece.y)) if (q !== piece && (q.z > piece.z || (q.z === piece.z && q.kind !== 'floor'))) return false; return true; };
        const foot = piece => at(piece.x, piece.y)[0].z;
        // The next ramp of the same slope, a level up (1) or down (-1).
        const slopeMate = (piece, up) => { const [ax, ay] = RISE[piece.rot || 0]; return at(piece.x + ax * up, piece.y + ay * up).find(q => q.kind === 'ramp' && q.z === piece.z + up && (q.rot || 0) === (piece.rot || 0)) || null; };
        const inWalls = piece => {
            const row = rows.get(piece.z * 65536 + piece.y), col = cols.get(piece.z * 65536 + piece.x);
            return !!row && !!col && row[0] < piece.x && row[1] > piece.x && col[0] < piece.y && col[1] > piece.y;
        };
        for (const piece of pieces) {
            if (!WALLS.has(piece.kind)) continue;
            const { x, y, z } = piece;
            part.set(piece, inside(x - 1, y, z) && inside(x + 1, y, z) && inside(x, y - 1, z) && inside(x, y + 1, z) ? 'inner' : 'wall');
        }
        // Blocks from the lowest up, so a stack is carried up from the wall under it.
        for (const list of cells.values()) for (const piece of list) if (piece.kind === 'block') part.set(piece, onWall(piece) || onBlock(piece) || 'block');
        // Ramps from the highest down: a gable's lowest ramp lies on the wall itself and follows the one above it.
        const ramps = pieces.filter(piece => piece.kind === 'ramp').sort((a, b) => b.z - a.z);
        for (const piece of ramps) {
            const above = slopeMate(piece, 1);
            const gable = onBlock(piece) || (onWall(piece) && above && walled(part.get(above)) ? part.get(above) : null);
            if (gable) part.set(piece, gable);
            else if (open(piece) && piece.z - foot(piece) >= S) part.set(piece, 'roof');
        }
        // The rest of each slope: a ramp next to a roof's ramp, up or down the slope, is roof too (an eave past the wall).
        for (const piece of ramps) if (!part.has(piece) && part.get(slopeMate(piece, 1)) === 'roof') part.set(piece, 'roof');
        for (let i = ramps.length - 1; i >= 0; i--) if (!part.has(ramps[i]) && part.get(slopeMate(ramps[i], -1)) === 'roof') part.set(ramps[i], 'roof');
        for (const piece of pieces) {
            const kind = piece.kind;
            if (part.has(piece) || shapeKinds.has(kind)) continue;
            if (kind !== 'floor') { part.set(piece, kind); continue; }
            const cap = onBlock(piece);
            if (cap) part.set(piece, cap);
            else if (open(piece)) part.set(piece, piece.z - foot(piece) >= S ? 'roof' : at(piece.x, piece.y).length > 1 || inWalls(piece) ? 'floor' : 'path');
            else part.set(piece, piece.z - foot(piece) >= S && !wallLevels.get(piece.group || 0)?.has(piece.z) ? 'ceiling' : 'floor');
        }
        // Shapes last: an eave or a verge is a thin box, tilted off the level or lying on a roof's or a gable's top slab.
        for (const piece of pieces) {
            const kind = piece.kind;
            if (!shapeKinds.has(kind)) continue;
            const size = piece.size || [1, 1, 1];
            const thin = kind === 'box' && Math.min(size[0], size[1], size[2]) <= 0.5;
            const tilted = thin && !!(piece.tilt || piece.roll) && piece.z >= 2;
            const lying = thin && !tilted && at(piece.x, piece.y).some(q => q.kind === 'floor' && q.z >= piece.z - 0.5 && q.z <= piece.z + size[1] + 0.5 && (walled(part.get(q)) || part.get(q) === 'roof'));
            part.set(piece, kind === 'rock' ? 'rock' : tilted || lying ? 'roof' : 'shape');
        }
        const lists = new Map();
        const add = (key, piece, index, material) => {
            let entry = lists.get(key);
            if (!entry) lists.set(key, entry = { key, ids: [], at: [], count: 0, material, mixed: false, materials: [] });
            entry.ids.push(piece.id); entry.at.push(index); entry.count++;
            if (!entry.materials.includes(material)) entry.materials.push(material);
        };
        pieces.forEach((piece, index) => {
            const key = part.get(piece);
            if (PieceBuilderManager.PART_ORDER.includes(key)) add(key, piece, index, piece.material || '');
            if (piece.kind === 'window' && piece.frame) add('frame', piece, index, piece.frame.material || PieceBuilderManager.FRAME_MATERIAL);
        });
        const out = [];
        for (const key of PieceBuilderManager.PART_ORDER) {
            const entry = lists.get(key);
            if (!entry) continue;
            entry.mixed = entry.materials.length > 1;
            if (entry.mixed) entry.material = null;
            out.push(entry);
        }
        return out;
    }

    /** The selection's parts (buildingParts), worked out once for a selection and kept until it or the map's pieces change. */
    selectionParts() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return [];
        const raw = map.reactor3d ? map.reactor3d.pieces : null;
        const memo = this._partsMemo;
        if (memo && memo.map === map && memo.raw === raw && memo.ids === this.selectedIds && memo.one === this.selected) return memo.parts;
        const storey = (typeof Reactor3D !== 'undefined' && Reactor3D.PIECE_STOREY) || 5;
        const parts = PieceBuilderManager.buildingParts(this.selectionPieces(), { shapes: elevation.SHAPE_KINDS || [], storey });
        this._partsMemo = { map, raw, ids: this.selectedIds, one: this.selected, parts };
        return parts;
    }

    /**
     * Change some of the selected pieces (a part of the building) and leave the selection whole:
     * `ids` theirs, `patch` a record, or a function of the piece giving one (null leaves that piece
     * as it is). One undo step. Nothing is recorded or drawn again when no piece ends up different.
     */
    updateSelectionPart(ids, patch, record = true) {
        const selected = new Set(this.selectionIds()), wanted = new Set();
        for (const id of ids || []) if (selected.has(id)) wanted.add(id);
        const map = this.currentMap(), elevation = this.elevation();
        if (!wanted.size || !map || !elevation) return false;
        const before = elevation.pieces(map), list = before.slice();
        for (let i = 0; i < list.length; i++) {
            if (!wanted.has(list[i].id)) continue;
            const change = typeof patch === 'function' ? patch(list[i]) : patch;
            if (change) list[i] = Object.assign({}, list[i], change);
        }
        const changed = this._changedPieces(map, before, list, wanted);
        if (!changed.length) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        elevation.restorePieces(map, list);
        this._detach(map, changed);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const piece of changed) { x0 = Math.min(x0, piece.x); y0 = Math.min(y0, piece.y); x1 = Math.max(x1, piece.x); y1 = Math.max(y1, piece.y); }
        this.announce(false, { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    /**
     * A material for one part of the selection (a `key` of selectionParts()): that part's pieces only,
     * one undo step. A window's frame keeps its material in the frame, so its wall is left as it is.
     */
    paintSelectionPart(key, material) {
        const part = this.selectionParts().find(entry => entry.key === key);
        if (!part) return false;
        const name = typeof material === 'string' ? material.trim() : '';
        if (key === 'frame') return this.updateSelectionPart(part.ids, piece => (piece.frame ? { frame: Object.assign({}, piece.frame, { material: name }) } : null));
        return this.updateSelectionPart(part.ids, { material: name });
    }

    /**
     * A hand edit to a stamped building's pieces: the building stops following
     * its plan, as for a piece laid or hammered in it (a move or turn builds
     * it again from the plan, which would lose the edit).
     */
    _detach(map, pieces) {
        const elevation = this.elevation();
        if (!pieces.some(piece => piece && piece.group)) return false;
        let detached = false;
        for (const group of new Set(pieces.map(piece => piece && piece.group).filter(Boolean))) {
            if (elevation.structureOf(map, group)) { elevation.removeStructure(map, group); detached = true; }
        }
        if (detached) this._flash('pieces.detached');
        return detached;
    }

    /** The pieces of `after` (by id) that differ from how they stood in `before`, as saved. */
    _changedPieces(map, before, after, ids) {
        const elevation = this.elevation(), was = new Map(before.map(piece => [piece.id, piece]));
        const saved = piece => JSON.stringify(elevation.normalizePiece ? elevation.normalizePiece(piece, map) : piece);
        return after.filter(piece => ids.has(piece.id) && (!was.has(piece.id) || saved(piece) !== saved(was.get(piece.id))));
    }

    /** Select every piece whose cell lies in the box (cells inclusive), at any level; a shape by the cell it stands on. */
    selectInBox(x0, y0, x1, y1) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return 0;
        const lo = [Math.min(x0, x1), Math.min(y0, y1)], hi = [Math.max(x0, x1), Math.max(y0, y1)];
        const ids = elevation.pieces(map).filter(piece => piece.x >= lo[0] && piece.x <= hi[0] && piece.y >= lo[1] && piece.y <= hi[1]).map(piece => piece.id);
        this.selectedIds = ids.length > 1 ? ids : [];
        this.selected = ids.length ? ids[0] : 0;
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return ids.length;
    }

    // ---- Whole buildings: select one, keep a selection as a structure -------

    /**
     * Select everything belonging with a piece: its building's whole group when it was stamped
     * or grouped, else every loose piece touching it (a wall run, the floor under it, its roof).
     * `target` a cell target (as a click gives), else the selected piece. How many were selected.
     */
    selectConnectedAt(target) {
        const piece = target ? this.pieceAtTarget(target) : this.selectedPiece();
        const map = this.currentMap(), elevation = this.elevation();
        if (!piece || !map || !elevation || typeof RRStructureCapture === 'undefined') return 0;
        const ids = RRStructureCapture.connected(elevation.pieces(map), piece.id);
        this.selectedIds = ids.length > 1 ? ids : [];
        this.selected = piece.id;
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return ids.length;
    }

    /** The selection as a structure, nothing written: `{ plan, templates, box, counts }` (RRStructureCapture.capture). */
    captureSelection(options = {}) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || typeof RRStructureCapture === 'undefined') return null;
        return RRStructureCapture.capture(map, this._copiedPieces().map(piece => piece.id), Object.assign({ E: elevation }, options));
    }

    /** How many events stand in the box the selection covers. */
    eventsInSelection() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || typeof RRStructureCapture === 'undefined') return 0;
        return RRStructureCapture.eventsInBox(map, this._copiedPieces().map(piece => piece.id), elevation);
    }

    database() { return this.projectController?.databaseManager || window.reactor?.databaseManager || null; }

    /** The structure already saved under a name or file, or null. */
    structureNamed(name) {
        const wanted = String(name || '').trim().toLowerCase();
        if (!wanted) return null;
        const stem = typeof RRStructureCapture !== 'undefined' ? RRStructureCapture.fileStem(name).toLowerCase() + '.json' : '';
        const records = (this.database()?.data?.structures || []).filter(entry => entry && entry.plan);
        return records.find(entry => String(entry.name || '').trim().toLowerCase() === wanted || String(entry.file || '').toLowerCase() === stem)
            || (this.structures(true).find(entry => String(entry.name || '').toLowerCase() === wanted || entry.file.toLowerCase() === stem) || null);
    }

    /**
     * Keep the selection as a structure: its file under 3d/Structures (and its people's templates
     * under events/), a record on Database › Structures, a choice in the Blueprint slot. With
     * `replace`, the selection becomes a stamp of it (one undo step). `overwrite` lets an existing
     * structure of that name take the new contents. Returns { file, record, counts } or null.
     */
    saveSelectionAsStructure({ name, description = '', events = false, replace = false, overwrite = false } = {}) {
        const map = this.currentMap(), elevation = this.elevation(), db = this.database(), projectPath = this.projectPath();
        name = String(name || '').trim();
        if (!name || !map || !elevation || !projectPath || typeof require !== 'function' || typeof RRStructureCapture === 'undefined') return null;
        const existing = this.structureNamed(name);
        if (existing && !overwrite) return null;
        const result = this.captureSelection({ name, description, events });
        if (!result) return null;
        const fs = require('fs'), path = require('path');
        const normalize = plan => typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor.normalizePlan(JSON.parse(JSON.stringify(plan))) : plan;
        const trim = plan => typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor.trimPlan(plan) : plan;
        const records = db?.data?.structures || null;
        const taken = new Set((records || []).filter(Boolean).map(entry => entry.file).filter(Boolean).concat([...(db?._structureFiles || [])]));
        const file = existing ? existing.file : (typeof DatabaseManager !== 'undefined' && DatabaseManager.structureFileName ? DatabaseManager.structureFileName(name, taken) : RRStructureCapture.fileStem(name) + '.json');
        const normalized = normalize(result.plan);
        try {
            RRStructureCapture.write(projectPath, Object.assign({}, result, { plan: normalized }), { fs, path, file, stringify: plan => (elevation.stringifySidecar ? elevation.stringifySidecar(trim(plan)) : JSON.stringify(trim(plan), null, 2)) });
        } catch (error) {
            console.error('Could not save the structure:', error);
            window.alert?.(window.I18n ? window.I18n.tText('The structure could not be saved.') : 'The structure could not be saved.');
            return null;
        }
        // The Database's Structures list takes it as saved (a later Database save writes it unchanged).
        let record = null;
        if (records) {
            record = records.find(entry => entry && entry.file === file) || null;
            if (record) { record.name = name; record.plan = normalized; }
            else { record = { id: records.length, name, file, plan: normalized }; records.push(record); }
            db._structureFiles?.add?.(file);
            const workshop = window.reactor?.structureWorkshop || this.projectController?.structureWorkshop;
            if (workshop?.markSaved) workshop.markSaved(db, record);
        }
        this.structures(true);
        if (replace) this._replaceWithStructure(map, file, result);
        this._syncPanel();
        return { file, record, counts: result.counts };
    }

    /** The selection (and what was saved with it) taken off and laid again as a stamp of the structure just saved. */
    _replaceWithStructure(map, file, result) {
        const elevation = this.elevation(), SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        const plan = this.resolvePlan(file);
        if (!plan || !SP) return false;
        const saved = this._snapshot(map, { ground: true, effects: true, events: true, props: true, allEvents: true });
        const { x0, y0, x1, y1 } = result.box;
        const inArea = (x, y) => x >= x0 && x < x1 + 1 && y >= y0 && y < y1 + 1, inCells = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const ids = new Set(this._copiedPieces().map(piece => piece.id));
        const gone = elevation.pieces(map).filter(piece => ids.has(piece.id));
        this._detach(map, gone);
        elevation.restorePieces(map, elevation.pieces(map).filter(piece => !ids.has(piece.id)));
        const sidecar = map.reactor3d || (map.reactor3d = { version: 1 });
        // What the structure brings again: lights, screens, models and water in the box (as captured).
        if (result.counts.lights) sidecar.lights = (sidecar.lights || []).filter(light => !(light && light.type !== 'sun' && !light.attach && inArea(Number(light.x), Number(light.y))));
        if (result.counts.surfaces) sidecar.mediaSurfaces = (sidecar.mediaSurfaces || []).filter(row => !(row && (!row.target || row.target === 'map') && inArea(Number(row.x), Number(row.y))));
        if (result.counts.props) sidecar.props = (sidecar.props || []).filter(prop => !(prop && inCells(Math.round(Number(prop.x)), Math.round(Number(prop.y)))));
        if (result.counts.water) sidecar.water = (sidecar.water || []).filter(sheet => !(sheet && sheet.x0 >= x0 && sheet.x1 <= x1 && sheet.y0 >= y0 && sheet.y1 <= y1));
        for (const key of ['lights', 'mediaSurfaces', 'props', 'water']) if (Array.isArray(sidecar[key]) && !sidecar[key].length) delete sidecar[key];
        const group = elevation.nextPieceGroup(map);
        // Its people stay the events they were: tagged as the building's, the stamp moves them to their spots instead of making new ones.
        if (result.counts.events && Array.isArray(map.events)) {
            const spots = new Map((result.plan.events || []).map(entry => [entry.template, entry.spot]));
            for (const template of result.templates) {
                const spot = spots.get(template.name);
                const at = result.plan.spots && result.plan.spots[spot];
                const event = at && map.events.find(e => e && e.x === x0 + at[0] && e.y === y0 + at[1] && (e.name || '') === (template.event.name || ''));
                if (event) event.note = (String(event.note || '').replace(SP.EVENT_TAG, '').trim() + ' ' + SP.eventTag(group, spot)).trim();
            }
        }
        if (!this._lay(map, plan, { group, plan: file, x: x0, y: y0, rot: 0, scale: 1 })) { this.undoStack.push(saved); this.undo(); return false; }
        saved.foliage = this._clearFoliage(map, piece => piece.group === group);
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.selectedIds = []; this.selected = 0;
        this._eventsChanged = true;
        this._effectsChanged?.();
        this.announce(true); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    /** Change every selected piece: `patch` a record, or a function of the piece giving one. */
    updateSelection(patch, record = true) {
        const ids = new Set(this.selectionIds());
        if (ids.size <= 1) return this.updateSelected(typeof patch === 'function' ? patch(this.selectedPiece()) : patch, record);
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        const list = elevation.pieces(map), before = list.slice();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < list.length; i++) {
            if (!ids.has(list[i].id)) continue;
            const before = list[i];
            list[i] = Object.assign({}, before, typeof patch === 'function' ? patch(before) : patch);
            for (const q of [before, list[i]]) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
        }
        elevation.restorePieces(map, list);
        this._detach(map, this._changedPieces(map, before, list, ids));
        this.announce(false, { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    /** The whole selection a number of cells across and along. */
    moveSelectionBy(dx, dy, record = true) {
        if (!dx && !dy) return false;
        const map = this.currentMap();
        const pieces = this.selectionPieces();
        if (!map || !pieces.length) return false;
        // Nothing leaves the map: the move is cut down to what fits.
        for (const piece of pieces) { dx = Math.max(-piece.x, Math.min(map.width - 1 - piece.x, dx)); dy = Math.max(-piece.y, Math.min(map.height - 1 - piece.y, dy)); }
        if (!dx && !dy) return false;
        return this.updateSelection(piece => ({ x: piece.x + dx, y: piece.y + dy }), record);
    }

    /** The whole selection a quarter turn clockwise about its box: each piece turned and carried round. */
    turnSelection(steps = 1) {
        this._settleCarry();
        const pieces = this.selectionPieces();
        if (pieces.length <= 1) return this.turnSelected(steps);
        const x0 = Math.min(...pieces.map(p => p.x)), y0 = Math.min(...pieces.map(p => p.y)), x1 = Math.max(...pieces.map(p => p.x)), y1 = Math.max(...pieces.map(p => p.y));
        const map = this.currentMap();
        const n = ((steps % 4) + 4) % 4;
        // The turned box slides back inside the map at an edge (clamping each piece stacked a row on one cell).
        const [W, H] = n % 2 ? [y1 - y0, x1 - x0] : [x1 - x0, y1 - y0];
        if (W >= map.width || H >= map.height) return false;
        const bx = Math.min(x0, map.width - 1 - W), by = Math.min(y0, map.height - 1 - H);
        return this.updateSelection(piece => {
            let x = piece.x - x0, y = piece.y - y0, w = x1 - x0, h = y1 - y0, offset = piece.offset ? piece.offset.slice() : null;
            for (let i = 0; i < n; i++) { const nx = h - y; y = x; x = nx; const t = w; w = h; h = t; if (offset) offset = [-offset[1], offset[0]]; }
            const out = { x: bx + x, y: by + y };
            if (this.isShape(piece.kind)) { out.angle = (((piece.angle || 0) + 90 * n) % 360 + 360) % 360; if (offset) out.offset = offset; }
            else out.rot = ((piece.rot + n) % 4 + 4) % 4;
            return out;
        });
    }

    removeSelection() {
        this._settleCarry();
        const ids = new Set(this.selectionIds());
        if (ids.size <= 1) return this.removeSelected();
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return false;
        this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        const gone = elevation.pieces(map).filter(piece => ids.has(piece.id));
        elevation.restorePieces(map, elevation.pieces(map).filter(piece => !ids.has(piece.id)));
        this._detach(map, gone);
        this.selectedIds = []; this.selected = 0;
        this.announce(false, { x0: Math.min(...gone.map(p => p.x)) - 4, y0: Math.min(...gone.map(p => p.y)) - 4, x1: Math.max(...gone.map(p => p.x)) + 4, y1: Math.max(...gone.map(p => p.y)) + 4 });
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    // ---- Selection: a placed piece picked up again --------------------------

    pieceById(id) { const map = this.currentMap(); return map && id ? (this.elevation()?.pieces(map) || []).find(piece => piece.id === id) || null : null; }
    selectedPiece() { return this.pieceById(this.selected); }
    isShape(kind) { const E = this.elevation(); return !!(E && E.SHAPE_KINDS && E.SHAPE_KINDS.includes(kind)); }

    /** The piece under a target: the one on the cell at the level, else the shape whose footprint covers it. */
    pieceAtTarget(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return null;
        // A door hangs across its doorway: a click on its leaf picks the door, not the doorway or the slab.
        if (target.door) { const door = this.pieceById(target.door); if (door) return door; }
        const R0 = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        const reach = Number.isFinite(target.height) ? target.height : target.z;
        const hung = R0 && R0.piecesAt ? (R0.piecesAt(map, target.x, target.y) || []).find(entry => entry.kind === 'door'
            && reach >= entry.z - 0.05 && reach <= entry.z + (R0.doorLeafHeight ? R0.doorLeafHeight(entry) : 3.6) + 0.05) : null;
        if (hung) {
            const door = this.pieceById(hung.id);
            if (door) return door;
        }
        const exact = elevation.pieceAt(map, target.x, target.y, target.z);
        if (exact) return exact;
        const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
        const stack = R && R.piecesAt ? R.piecesAt(map, target.x, target.y) : null;
        if (!stack || !stack.length) return null;
        const wanted = Number.isFinite(target.height) ? target.height : target.z;
        let best = null;
        for (const entry of stack) {
            const top = R.pieceTop(entry, 0.5, 0.5);
            if (wanted < entry.z - 0.05 || wanted > top + 0.05) continue;
            if (!best || entry.z >= best.z) best = entry;
        }
        if (!best) best = stack[stack.length - 1];
        return this.pieceById(best.id);
    }

    selectAt(target) {
        const piece = this.pieceAtTarget(target);
        // A press on a piece already in a box selection keeps the box (so the box can be dragged).
        if (piece && this.selectedIds.includes(piece.id)) { this.selected = piece.id; this._ghostChanged(); return piece; }
        this.selectedIds = [];
        this.selected = piece ? piece.id : 0;
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return piece;
    }

    clearSelection() { if (!this.selected && !this.selectedIds.length) return; this.selected = 0; this.selectedIds = []; this._syncPanel(); this._ghostChanged(); }

    /** Selected pieces that are gone (taken off, undone) let go: a piece laid later may be given the same id. */
    _pruneSelection() {
        if (!this.selected && !this.selectedIds.length) return;
        const live = new Set((this.elevation()?.pieces(this.currentMap()) || []).map(piece => piece.id));
        const ids = this.selectedIds.filter(id => live.has(id));
        if (!live.has(this.selected)) this.selected = ids[0] || 0;
        this.selectedIds = ids.length > 1 ? ids : [];
    }

    /** Change the selected piece in place (a material, a turn, a size, a move); the list keeps its ids. */
    /** A placed ladder is a stack of one-level pieces: every ladder level joined to this one on its cell. */
    ladderStack(piece) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !piece || piece.kind !== 'ladder') return [];
        const byZ = new Map(elevation.pieces(map).filter(p => p.kind === 'ladder' && p.x === piece.x && p.y === piece.y).map(p => [p.z, p]));
        let low = piece.z, high = piece.z;
        while (byZ.has(low - 1)) low--;
        while (byZ.has(high + 1)) high++;
        const out = [];
        for (let z = low; z <= high; z++) out.push(byZ.get(z));
        return out;
    }

    /** Make a placed ladder this many levels tall, from its foot: levels come off the top or are added over it. */
    setLadderHeight(piece, height, record = true) {
        const map = this.currentMap(), elevation = this.elevation();
        const stack = this.ladderStack(piece);
        if (!map || !elevation || !stack.length) return false;
        const foot = stack[0];
        const target = Math.max(1, Math.min((elevation.PIECE_MAX_LEVEL || 240) - foot.z + 1, Math.floor(height) || 1));
        if (target === stack.length) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        const gone = new Set(stack.slice(target).map(p => p.id));
        const list = elevation.pieces(map).filter(p => !gone.has(p.id));
        let id = list.reduce((max, p) => Math.max(max, p.id || 0), 0);
        for (let z = foot.z + stack.length; z < foot.z + target; z++) list.push(Object.assign({}, foot, { id: ++id, z }));
        elevation.restorePieces(map, list);
        this._detach(map, stack);
        // The selection stays on the ladder: its foot, which every height keeps.
        this.selected = foot.id;
        this.announce(false, { x0: foot.x - 1, y0: foot.y - 1, x1: foot.x + 1, y1: foot.y + 1 });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    /** The selected pieces, a ladder whole (every level and column), as it is turned, moved and deleted whole. */
    _copiedPieces() {
        const list = this.selectionPieces(), ids = new Set(list.map(p => p.id));
        for (const piece of list.slice()) {
            if (piece.kind !== 'ladder') continue;
            for (const p of this.ladderFlight(piece)?.pieces || []) if (!ids.has(p.id)) { ids.add(p.id); list.push(p); }
        }
        return list;
    }

    /** Copy the selected pieces (relative to their lowest corner) for Paste. */
    copySelection() {
        const list = this._copiedPieces();
        if (!list.length) return false;
        const x0 = Math.min(...list.map(p => p.x)), y0 = Math.min(...list.map(p => p.y)), z0 = Math.min(...list.map(p => p.z));
        PieceBuilderManager.clipboard = list.map(p => { const c = Object.assign({}, p, { x: p.x - x0, y: p.y - y0, z: p.z - z0 }); delete c.id; delete c.group; return c; });
        return true;
    }

    /**
     * Pieces put down by a paste or a carry take their slots, as laying one there would: a cell piece
     * on the same cell and level (a slab only by a slab) goes. Shapes stand anywhere and overlap freely.
     */
    _takeSlots(map, ids) {
        const elevation = this.elevation(), list = elevation.pieces(map);
        const slot = piece => this.isShape(piece.kind) ? null : piece.x + ',' + piece.y + ',' + piece.z + (piece.kind === 'floor' ? 'f' : '');
        const taken = new Set(list.filter(piece => ids.has(piece.id)).map(slot).filter(Boolean));
        const kept = list.filter(piece => ids.has(piece.id) || !taken.has(slot(piece)));
        if (kept.length === list.length) return false;
        elevation.restorePieces(map, kept);
        this._detach(map, list.filter(piece => !kept.includes(piece)));
        return true;
    }

    /** Lay the copied pieces with their lowest corner at `target` (a cell and level); they come selected, one undo step. */
    pasteAt(target) {
        this._settleCarry();
        const clip = PieceBuilderManager.clipboard, map = this.currentMap(), elevation = this.elevation();
        if (!clip || !clip.length || !target || !map || !elevation) return false;
        const list = elevation.pieces(map);
        let id = list.reduce((max, p) => Math.max(max, p.id || 0), 0);
        const added = clip.map(p => Object.assign({}, p, { id: ++id, x: target.x + p.x, y: target.y + p.y, z: Math.max(0, (target.z || 0) + p.z) }))
            .filter(p => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height);
        if (!added.length) return false;
        this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        elevation.restorePieces(map, list.concat(added));
        this._takeSlots(map, new Set(added.map(p => p.id)));
        this.mode = 'select';
        this.selectedIds = added.map(p => p.id);
        this.selected = added[0].id;
        const xs = added.map(p => p.x), ys = added.map(p => p.y);
        this.announce(false, { x0: Math.min(...xs) - 2, y0: Math.min(...ys) - 2, x1: Math.max(...xs) + 2, y1: Math.max(...ys) + 2 });
        this._syncPanel(); this._ghostChanged(); this.refreshStatus?.();
        return true;
    }

    /** A copy of the selection laid just east of it. */
    duplicateSelection() {
        this._settleCarry();
        const list = this._copiedPieces();
        if (!list.length || !this.copySelection()) return false;
        // Beside it, clear of it: a shape (a rock, a dome) covers cells beyond the one it stands on.
        const R = typeof Reactor3D !== 'undefined' && Reactor3D.pieceFootprint ? Reactor3D : null;
        const across = p => R && this.isShape(p.kind) ? R.pieceFootprint(p).map(cell => cell[0]) : [p.x];
        const width = Math.max(...list.flatMap(across)) - Math.min(...list.flatMap(across)) + 1;
        return this.pasteAt({ x: Math.min(...list.map(p => p.x)) + width, y: Math.min(...list.map(p => p.y)), z: Math.min(...list.map(p => p.z)) });
    }

    /**
     * The flight a placed stair belongs to: the stairs turned the same way
     * that rise a level per cell along its climb, and the ones beside them
     * across its width. `{ foot, steps, width, pieces }`, the foot being the
     * bottom step at the flight's left edge.
     */
    stairFlight(piece) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !piece || piece.kind !== 'stair') return null;
        const all = elevation.pieces(map);
        const at = (x, y, z) => all.find(p => p.kind === 'stair' && p.rot === piece.rot && p.x === x && p.y === y && p.z === z) || null;
        const [dx, dy] = PieceBuilderManager.stepOf(piece.rot);
        const [lx, ly] = [-dy, dx]; // to the right of the climb, as `stairRun` lays it
        // Back down the climb, then to the left edge.
        let foot = piece;
        for (let b = at(foot.x - dx, foot.y - dy, foot.z - 1); b; b = at(foot.x - dx, foot.y - dy, foot.z - 1)) foot = b;
        for (let l = at(foot.x - lx, foot.y - ly, foot.z); l; l = at(foot.x - lx, foot.y - ly, foot.z)) foot = l;
        let steps = 1, width = 1;
        while (at(foot.x + dx * steps, foot.y + dy * steps, foot.z + steps)) steps++;
        while (at(foot.x + lx * width, foot.y + ly * width, foot.z)) width++;
        const pieces = [];
        for (let i = 0; i < steps; i++) for (let k = 0; k < width; k++) {
            const p = at(foot.x + dx * i + lx * k, foot.y + dy * i + ly * k, foot.z + i);
            if (p) pieces.push(p);
        }
        return { foot, steps, width, pieces };
    }

    /** Lay a placed flight again from its foot with so many steps and so wide (one undo step). */
    setStairFlight(piece, steps, width, record = true) {
        const map = this.currentMap(), elevation = this.elevation();
        const flight = this.stairFlight(piece);
        if (!map || !elevation || !flight) return false;
        const max = elevation.PIECE_MAX_LEVEL || 240;
        steps = Math.max(1, Math.min(max - flight.foot.z + 1, Math.floor(steps) || 1));
        width = Math.max(1, Math.min(20, Math.floor(width) || 1));
        if (steps === flight.steps && width === flight.width) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        const gone = new Set(flight.pieces.map(p => p.id));
        const list = elevation.pieces(map).filter(p => !gone.has(p.id));
        let id = list.reduce((max, p) => Math.max(max, p.id || 0), 0);
        const [dx, dy] = PieceBuilderManager.stepOf(flight.foot.rot);
        const [lx, ly] = [-dy, dx];
        let footId = 0;
        for (let i = 0; i < steps; i++) for (let k = 0; k < width; k++) {
            const next = Object.assign({}, flight.foot, { id: ++id, x: flight.foot.x + dx * i + lx * k, y: flight.foot.y + dy * i + ly * k, z: flight.foot.z + i });
            if (!i && !k) footId = next.id;
            list.push(next);
        }
        elevation.restorePieces(map, list);
        this._detach(map, flight.pieces);
        this.selected = footId;
        const reach = Math.max(steps, width, flight.steps, flight.width) + 1;
        this.announce(false, { x0: flight.foot.x - reach, y0: flight.foot.y - reach, x1: flight.foot.x + reach, y1: flight.foot.y + reach });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    updateSelected(patch, record = true) {
        const map = this.currentMap(), elevation = this.elevation();
        const piece = this.selectedPiece();
        if (!map || !elevation || !piece) return false;
        // A ladder turns, changes material and moves whole, not one level or one column of it.
        if (piece.kind === 'ladder') {
            const flight = this.ladderFlight(piece);
            const ids = new Set((flight ? flight.pieces : this.ladderStack(piece)).map(p => p.id));
            const dx = 'x' in patch ? patch.x - piece.x : 0, dy = 'y' in patch ? patch.y - piece.y : 0, dz = 'z' in patch ? patch.z - piece.z : 0;
            const rest = Object.assign({}, patch); delete rest.x; delete rest.y; delete rest.z;
            if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
            if (flight && flight.columns > 1 && 'rot' in rest && rest.rot !== piece.rot) {
                // A wide ladder turned is laid again from its foot, its columns across the new way.
                const list = elevation.pieces(map).filter(p => !ids.has(p.id));
                let id = list.reduce((max, p) => Math.max(max, p.id || 0), 0), footId = 0;
                const from = Object.assign({}, flight.foot, rest, { x: flight.foot.x + dx, y: flight.foot.y + dy, z: flight.foot.z + dz });
                for (const { piece: next } of this._layLadder(from, flight.width, flight.height, flight.middle)) {
                    if (next.x < 0 || next.y < 0 || next.x >= map.width || next.y >= map.height) continue;
                    next.id = ++id;
                    if (!footId) footId = next.id;
                    list.push(next);
                }
                elevation.restorePieces(map, list);
                if (footId) this.selected = footId;
                this._detach(map, flight.pieces);
            } else {
                const before = elevation.pieces(map), after = before.map(p => ids.has(p.id) ? Object.assign({}, p, rest, { x: p.x + dx, y: p.y + dy, z: p.z + dz }) : p);
                elevation.restorePieces(map, after);
                this._detach(map, this._changedPieces(map, before, after, ids));
            }
            const reach = (flight ? flight.columns : 1) + 1;
            this.announce(false, { x0: Math.min(piece.x, piece.x + dx) - reach, y0: Math.min(piece.y, piece.y + dy) - reach, x1: Math.max(piece.x, piece.x + dx) + reach, y1: Math.max(piece.y, piece.y + dy) + reach });
            this._syncPanel(); this._ghostChanged();
            return true;
        }
        const list = elevation.pieces(map);
        const index = list.findIndex(entry => entry.id === piece.id);
        if (index < 0) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        const before = list[index];
        const next = Object.assign({}, before, patch);
        list[index] = next;
        elevation.restorePieces(map, list);
        this._detach(map, this._changedPieces(map, [before], [next], new Set([before.id])));
        const reach = this.isShape(next.kind) ? Math.ceil(Math.max(...(next.size || [1, 1, 1])) / 2) + 1 : 1;
        this.announce(false, { x0: Math.min(before.x, next.x) - reach, y0: Math.min(before.y, next.y) - reach, x1: Math.max(before.x, next.x) + reach, y1: Math.max(before.y, next.y) + reach });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    /** The selected piece's middle to a point of the ground, in tiles (a shape at any quarter, a cell piece on its cell). */
    moveSelectedPieceTo(cx, cy, z, record = true) {
        const piece = this.selectedPiece();
        if (!piece) return false;
        const map = this.currentMap();
        const clamp = (v, max) => Math.max(0, Math.min(max, v));
        if (this.isShape(piece.kind)) {
            const ax = clamp(Math.floor(cx), map.width - 1), ay = clamp(Math.floor(cy), map.height - 1);
            const patch = { x: ax, y: ay, offset: [Math.round((cx - ax - 0.5) * 100) / 100, Math.round((cy - ay - 0.5) * 100) / 100] };
            if (Number.isFinite(z)) patch.z = Math.max(0, Math.round(z * 4) / 4);
            return this.updateSelected(patch, record);
        }
        const patch = { x: clamp(Math.floor(cx), map.width - 1), y: clamp(Math.floor(cy), map.height - 1) };
        if (Number.isFinite(z)) patch.z = Math.max(0, Math.floor(z));
        return this.updateSelected(patch, record);
    }

    turnSelected(steps = 1) {
        const piece = this.selectedPiece();
        if (!piece) return false;
        return this.isShape(piece.kind) ? this.updateSelected({ angle: (((piece.angle || 0) + 90 * steps) % 360 + 360) % 360 }) : this.updateSelected({ rot: ((piece.rot + steps) % 4 + 4) % 4 });
    }

    removeSelected() {
        const map = this.currentMap(), elevation = this.elevation(), piece = this.selectedPiece();
        if (!map || !elevation || !piece) return false;
        this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        // A ladder goes whole, every column of a wide one.
        const flight = piece.kind === 'ladder' ? this.ladderFlight(piece) : null;
        const gone = new Set(piece.kind === 'ladder' ? (flight ? flight.pieces : this.ladderStack(piece)).map(p => p.id) : [piece.id]);
        elevation.restorePieces(map, elevation.pieces(map).filter(entry => !gone.has(entry.id)));
        this._detach(map, [piece]);
        this.selected = 0;
        const reach = this.isShape(piece.kind) ? Math.ceil(Math.max(...(piece.size || [1, 1, 1])) / 2) + 1 : (flight ? flight.columns + 1 : 1);
        this.announce(false, { x0: piece.x - reach, y0: piece.y - reach, x1: piece.x + reach, y1: piece.y + reach });
        this._syncPanel(); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    /** The size the next piece of a kind takes: the panel's choice, else the kind's own. */
    sizeFor(kind) {
        if (this.sizes[kind]) return this.sizes[kind].slice();
        if (kind === 'wedge') return [2, 1, 3];
        return this.shapeSizeFor(kind);
    }
    setSize(kind, size) { this.sizes[kind] = size.map(v => Math.max(0.25, Math.min(60, Math.round(v * 4) / 4))); this._syncPanel(); this._ghostChanged(); }
    /** The way a piece's own +v points for its turn: the direction a stair climbs, a ramp rises. */
    /** The tag a stamped building's events carry in their note (StructurePlan's eventTag). */
    static STRUCTURE_EVENT = /<structure:\d+>\s*<spot:[^>]+>/;

    static stepOf(rot) { return [[0, 1], [-1, 0], [0, -1], [1, 0]][((rot % 4) + 4) % 4]; }

    /** A shape's size for the next placement: its kind's own, scaled. */
    shapeSizeFor(kind) {
        const E = typeof DatabaseStructureEditor !== 'undefined' ? DatabaseStructureEditor : null;
        const base = (E && E.SHAPE_DEFAULTS && E.SHAPE_DEFAULTS[kind]) || [2, 2, 2];
        return base.map(v => Math.max(0.25, Math.round(v * this.shapeScale * 4) / 4));
    }

    /** The nearest screen or light within a tile of the cell, taken off the map. */
    removeEffectAt(map, target) {
        const sidecar = map && map.reactor3d;
        if (!sidecar) return false;
        const near = (x, y) => Math.abs(x - (target.x + 0.5)) <= 1 && Math.abs(y - (target.y + 0.5)) <= 1;
        const rows = Array.isArray(sidecar.mediaSurfaces) ? sidecar.mediaSurfaces : [];
        const row = rows.find(r => r && r.target === 'map' && near(Number(r.x), Number(r.y)));
        if (row) { sidecar.mediaSurfaces = rows.filter(r => r !== row); if (!sidecar.mediaSurfaces.length) delete sidecar.mediaSurfaces; this._effectsChanged(); return true; }
        const lights = Array.isArray(sidecar.lights) ? sidecar.lights : [];
        const light = lights.find(l => l && near(Number(l.x), Number(l.y)));
        if (light) { sidecar.lights = lights.filter(l => l !== light); if (!sidecar.lights.length) delete sidecar.lights; this._effectsChanged(); return true; }
        return false;
    }

    _effectsChanged() {
        window.reactor?.lightingManager?.render?.();
        window.reactor?.mediaSurfaceManager?.render?.();
        this.projectController?.mediaSurfacePreviewManager?.refresh?.();
        window.reactor?.mapEditor3D?.refreshLights?.();
        this.announce(false);
    }

    _t(key, params) { return window.I18n ? window.I18n.t(key, params) : key; }
    elevation() { return typeof RRMapElevation !== 'undefined' ? RRMapElevation : (window.RRMapElevation || null); }
    currentMap() { return this.projectController?.getTilemapManager?.()?.currentMap || null; }
    projectPath() {
        const pc = this.projectController;
        const project = pc?.getCurrentProject ? pc.getCurrentProject() : pc?.currentProject;
        return project?.path || null;
    }
    kinds() { return this.elevation()?.PIECE_KINDS || ['wall', 'block', 'floor', 'pillar', 'stair', 'ramp', 'roof', 'doorway', 'window', 'fence']; }

    /** The images under img/materials, each once, as {name, url}. */
    materials(refresh = false) {
        const projectPath = this.projectPath();
        // The list is one project's: another project open reads its own.
        if (this._materialsCache && !refresh && this._materialsProject === projectPath) return this._materialsCache;
        let list = [];
        try {
            if (projectPath && typeof RRAssetFiles !== 'undefined' && typeof require === 'function') {
                const path = require('path');
                const directory = path.join(projectPath, 'img', 'materials');
                list = RRAssetFiles.listMaterials(directory).map(record => ({
                    name: record.imageReference || record.name,
                    url: RRAssetFiles.imageUrlFor(directory, record.imageReference || record.name)
                }));
            }
        } catch (error) {
            console.warn('The materials folder could not be read.', error);
            list = [];
        }
        this._materialsCache = list;
        this._materialsProject = projectPath;
        return list;
    }

    /** The colour a kind shows in the flat map's overlay. */
    static OVERLAY_COLOURS = { wall: 0x9a9a9a, block: 0x8c8c8c, floor: 0xc99a5b, pillar: 0xdcdcdc, stair: 0xa87b4a, ramp: 0xb05a4a, roof: 0xc1443c, doorway: 0x3fa34d, door: 0x8a5a2b, window: 0x5b9fe8, fence: 0xb8864b, glass: 0x9fd8ff, dome: 0xb07a9a, cylinder: 0x8f8fa8, cone: 0xb8a04b, box: 0x8c8c8c, wedge: 0xb05a4a, pyramid: 0xb8a04b, prism: 0xc1443c, tube: 0x8f8fa8, sphere: 0xb07a9a, arch: 0x3fa34d, tunnel: 0x3fa34d, ring: 0xb07a9a, hull: 0x8f8fa8, spike: 0xb8a04b, capsule: 0x8f8fa8, dish: 0x8fa8a8, fin: 0xa88f8f };

    /**
     * What each cell shows in the flat map: its topmost piece's kind and
     * level, so a building reads as a plan from above — walls grey, floors
     * tan, doors green, windows blue, roofs red — one entry per cell.
     */
    static cellSummary(pieces, storey = 5) {
        // The ground storey is the plan: a roof over it is not what an author
        // wants to see from above. A cell with nothing in the ground storey
        // (an overhang, a bridge) shows its topmost piece instead.
        const cells = new Map();
        for (const piece of pieces) {
            const key = piece.x + ',' + piece.y;
            const top = cells.get(key);
            const better = !top
                || (piece.z < storey && top.z >= storey)
                || (piece.z < storey) === (top.z < storey) && (piece.z > top.z || (piece.z === top.z && piece.kind !== 'floor' && top.kind === 'floor'));
            if (better) cells.set(key, { x: piece.x, y: piece.y, z: piece.z, kind: piece.kind });
        }
        return Array.from(cells.values());
    }

    /** The map changed under the tool: the flat overlay follows it. */
    setMap(mapData, tilemapManager) {
        this.tilemapManager = tilemapManager || this.tilemapManager;
        this.selectedGroup = 0;
        // Ids are per map: a selection kept across the switch names another map's pieces (and Delete would take them).
        this.selected = 0; this.selectedIds = [];
        this._stroke = null;
        this.undoStack = []; this.redoStack = [];
        this.render2D();
        if (this.panel) { this.renderStructures(true); this.refreshStatus(); this._syncPanel(); }
    }

    _ensureOverlay() {
        const parent = this.tilemapManager?.container;
        if (!parent || typeof PIXI === 'undefined') return null;
        if (this.overlay && this.overlay.parent !== parent) {
            this.overlay.parent?.removeChild(this.overlay);
            if (!this.overlay.destroyed) this.overlay.destroy({ children: true });
            this.overlay = null;
        }
        if (!this.overlay) {
            this.overlay = new PIXI.Container();
            this.overlay.label = 'pieces overlay';
            this.overlay.eventMode = 'none';
            parent.addChild(this.overlay);
        }
        return this.overlay;
    }

    /**
     * Draw the pieces on the flat map. Pieces are map content, so this is
     * drawn whichever tab is up: the 2D view is otherwise blind to a house.
     */
    render2D() {
        const container = this._ensureOverlay();
        if (!container) return;
        for (const child of container.removeChildren()) child.destroy({ children: true });
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation) return;
        const cells = PieceBuilderManager.cellSummary(elevation.pieces(map));
        if (!cells.length) return;
        const tw = this.tilemapManager?.TILE_WIDTH || 48, th = this.tilemapManager?.TILE_HEIGHT || tw;
        const byKind = new Map();
        for (const cell of cells) (byKind.get(cell.kind) || byKind.set(cell.kind, []).get(cell.kind)).push(cell);
        for (const [kind, list] of byKind) {
            const graphics = new PIXI.Graphics();
            for (const cell of list) graphics.rect(cell.x * tw + 1, cell.y * th + 1, tw - 2, th - 2);
            // Higher pieces a little bolder, so an upper floor reads over a lower one.
            graphics.fill({ color: PieceBuilderManager.OVERLAY_COLOURS[kind] || 0x888888, alpha: 0.45 });
            graphics.eventMode = 'none';
            container.addChild(graphics);
        }
    }

    static ICONS = {
        wall: 'M4 4h16v17H4z M4 9h16 M4 15h16 M10 4v5 M14 9v6 M8 15v6',
        block: 'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
        floor: 'M3 13l9-4 9 4-9 4z M3 13v2l9 4 9-4v-2',
        pillar: 'M8 4h8 M9 4v16 M15 4v16 M7 20h10 M9 6h6',
        stair: 'M3 20h5v-4h4v-4h4v-4h5 M3 20v-4h5 M8 16v-4h4 M12 12V8h4',
        ladder: 'M7 3v18 M17 3v18 M7 7h10 M7 12h10 M7 17h10',
        ramp: 'M3 19h18V7z M3 19v2h18v-2',
        roof: 'M3 14l9-9 9 9 M5 14v6h14v-6 M9 20v-4h6v4',
        doorway: 'M5 20V5h14v15 M9 20v-9h6v9',
        door: 'M6 21V4h12v17 M4 21h16 M15 12h.5 M9 7h6v4H9z M9 14h6v4H9z',
        window: 'M4 4h16v16H4z M9 8h6v6H9z M12 8v6 M9 11h6',
        fence: 'M5 21V9l2-3 2 3v12 M15 21V9l2-3 2 3v12 M9 12h6 M9 17h6',
        glass: 'M5 3h14v18H5z M8 6l-2 2 M12 6l-6 6 M16 6l-8 8',
        dome: 'M3 17a9 9 0 0 1 18 0 M3 17h18v3H3z M12 8v-3',
        cylinder: 'M5 6a7 2.5 0 0 0 14 0a7 2.5 0 0 0-14 0 M5 6v12a7 2.5 0 0 0 14 0V6',
        cone: 'M12 3l8 16H4z M4 19a8 2 0 0 0 16 0',
        box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
        wedge: 'M4 18h16l-16-9z M4 9v9 M20 18l-2 2H2l2-2',
        pyramid: 'M12 4l9 14H3z M12 4v14 M3 18l9-3 9 3',
        prism: 'M4 18h13L10.5 7z M10.5 7l3-3L20 15l-3 3',
        tube: 'M5 6a7 2.5 0 0 0 14 0a7 2.5 0 0 0-14 0 M5 6v12a7 2.5 0 0 0 14 0V6 M9 6a3 1 0 0 0 6 0a3 1 0 0 0-6 0',
        sphere: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3a4.5 9 0 0 0 0 18',
        arch: 'M4 20V10a8 8 0 0 1 16 0v10 M8 20v-9a4 4 0 0 1 8 0v9 M4 20h4 M16 20h4',
        tunnel: 'M4 19V11a8 8 0 0 1 16 0v8 M8 19v-7a4 4 0 0 1 8 0v7 M4 19h4 M16 19h4 M8 12L5 8 M16 12l3-4',
        ring: 'M12 4a8 4 0 1 0 0 8a8 4 0 1 0 0-8 M12 6.5a3.5 1.5 0 1 0 0 3a3.5 1.5 0 1 0 0-3 M4 8v6a8 4 0 0 0 16 0V8',
        hull: 'M6 5h12l3 3v8l-3 3H6l-3-3V8z M6 5l2 2h8l2-2 M6 19l2-2h8l2 2',
        spike: 'M12 2l4 17H8z M8 19a4 1.5 0 0 0 8 0',
        capsule: 'M8 8a4 4 0 0 1 8 0v8a4 4 0 0 1-8 0z M8 9h8 M8 15h8',
        dish: 'M3 8a9 9 0 0 0 18 0 M3 8h18 M12 14v6 M9 20h6',
        fin: 'M4 20h16v-9L13 3H4z M4 11h9',
        rock: 'M3 19l2.5-6 4-4 3.5 2 3-4 5 6.5V19z M9.5 9l1 5 3-3 M16 7l.5 5'
    };

    initializeUI(container) {
        if (!container) return;
        this.panel = container;
        const t = key => this._t(key);
        if (!container.querySelector('.rr-pieces-panel')) {
            const icon = kind => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${PieceBuilderManager.ICONS[kind]}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
            container.innerHTML = `
                <div class="rr-pieces-panel" style="display: flex; flex-direction: column; gap: 10px; padding: 10px; overflow-y: auto; min-height: 0;">
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.hint">${t('pieces.hint')}</div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="pieces.piece">${t('pieces.piece')}</div>
                    <div class="rr-pieces-kinds" role="radiogroup" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                        ${this.kinds().map(kind => `<button type="button" class="rr-btn-secondary rr-pieces-kind" data-piece-kind="${kind}" role="radio" aria-checked="${kind === this.kind}" style="display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px 2px; font-size: 11px;">${icon(kind)}<span data-i18n="pieces.kind.${kind}">${t('pieces.kind.' + kind)}</span></button>`).join('')}
                    </div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="pieces.material">${t('pieces.material')}</div>
                    <div class="rr-pieces-materials" role="radiogroup" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                    <div class="rr-pieces-materials-hint" style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.materialsHint">${t('pieces.materialsHint')}</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; align-items: center; font-size: 11px; color: var(--color-text-muted);">
                        <button type="button" class="rr-btn-secondary rr-pieces-turn" style="padding: 5px;"><span data-i18n="pieces.turn">${t('pieces.turn')}</span> <span class="rr-pieces-rot-value" style="color: var(--color-text);">0°</span></button>
                        <div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
                            <button type="button" class="rr-btn-secondary rr-pieces-level-down" style="padding: 4px 8px;" aria-label="-">−</button>
                            <span><span data-i18n="pieces.level">${t('pieces.level')}</span> <span class="rr-pieces-level-value" style="color: var(--color-text);">0</span></span>
                            <button type="button" class="rr-btn-secondary rr-pieces-level-up" style="padding: 4px 8px;" aria-label="+">+</button>
                        </div>
                    </div>
                    <div class="database-field-label" style="font-size: 11px; margin: 0;" data-i18n="pieces.structure">${t('pieces.structure')}</div>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <select class="rr-pieces-structure database-field-value" style="flex: 1; min-width: 0;"></select>
                        <button type="button" class="rr-btn-secondary rr-pieces-stamp" role="radio" aria-checked="false" style="padding: 5px 8px; font-size: 12px; white-space: nowrap;" data-i18n="pieces.stamp">${t('pieces.stamp')}</button>
                    </div>
                    <div class="rr-pieces-structure-hint" style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.stampHint">${t('pieces.stampHint')}</div>
                    <div class="rr-pieces-modes" role="radiogroup" style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        ${['place', 'erase', 'move'].map(mode => `<button type="button" class="rr-btn-secondary rr-pieces-mode" data-piece-mode="${mode}" role="radio" aria-checked="${mode === this.mode}" style="padding: 6px 4px; font-size: 12px;" data-i18n="pieces.${mode}">${t('pieces.' + mode)}</button>`).join('')}
                        <button type="button" class="rr-btn-secondary rr-pieces-remove-structure" style="padding: 6px 4px; font-size: 12px;" disabled data-i18n="pieces.removeStructure">${t('pieces.removeStructure')}</button>
                    </div>
                    <div class="rr-pieces-transform" style="display: none; gap: 4px; align-items: center; font-size: 11px; color: var(--color-text-muted);">
                        <button type="button" class="rr-btn-secondary rr-pieces-rotate-structure" style="padding: 5px 8px;" data-i18n="pieces.rotate">${t('pieces.rotate')}</button>
                        <span data-i18n="pieces.scale">${t('pieces.scale')}</span>
                        <button type="button" class="rr-btn-secondary rr-pieces-scale-down" style="padding: 4px 8px;" aria-label="-">−</button>
                        <span class="rr-pieces-scale-value" style="color: var(--color-text);">1</span>
                        <button type="button" class="rr-btn-secondary rr-pieces-scale-up" style="padding: 4px 8px;" aria-label="+">+</button>
                    </div>
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.moveHint">${t('pieces.moveHint')}</div>
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        <button type="button" class="rr-btn-secondary rr-pieces-undo" style="flex: 1; padding: 5px;" data-i18n="pieces.undo">${t('pieces.undo')}</button>
                        <button type="button" class="rr-btn-secondary rr-pieces-redo" style="flex: 1; padding: 5px;" data-i18n="pieces.redo">${t('pieces.redo')}</button>
                    </div>
                    <button type="button" class="rr-btn-secondary rr-pieces-clear" style="padding: 5px;" data-i18n="pieces.clear">${t('pieces.clear')}</button>
                    <div class="rr-pieces-status" style="font-size: 11px; color: var(--color-text-muted);" data-rr-i18n-skip></div>
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.4;" data-i18n="pieces.keys">${t('pieces.keys')}</div>
                </div>`;
            container.querySelectorAll('.rr-pieces-kind').forEach(button => button.addEventListener('click', () => this.setKind(button.dataset.pieceKind)));
            container.querySelectorAll('.rr-pieces-mode').forEach(button => button.addEventListener('click', () => this.setMode(button.dataset.pieceMode)));
            container.querySelector('.rr-pieces-turn').addEventListener('click', () => this.turn());
            container.querySelector('.rr-pieces-level-down').addEventListener('click', () => this.setLevel(this.level - 1));
            container.querySelector('.rr-pieces-level-up').addEventListener('click', () => this.setLevel(this.level + 1));
            container.querySelector('.rr-pieces-undo').addEventListener('click', () => this.undo());
            container.querySelector('.rr-pieces-redo').addEventListener('click', () => this.redo());
            container.querySelector('.rr-pieces-clear').addEventListener('click', () => this.clear());
            container.querySelector('.rr-pieces-remove-structure').addEventListener('click', () => this.removeSelectedGroup());
            container.querySelector('.rr-pieces-rotate-structure').addEventListener('click', () => this.rotateSelected());
            container.querySelector('.rr-pieces-scale-down').addEventListener('click', () => this.scaleSelected(-1));
            container.querySelector('.rr-pieces-scale-up').addEventListener('click', () => this.scaleSelected(1));
            container.querySelector('.rr-pieces-structure').addEventListener('change', event => { this.structure = event.target.value || ''; if (this.structure) this.setMode('stamp'); });
            container.querySelector('.rr-pieces-stamp').addEventListener('click', () => this.setMode(this.mode === 'stamp' ? 'place' : 'stamp'));
        }
        this.renderStructures(true);
        this.renderMaterials(true);
        this.refreshStatus();
        this._syncPanel();
    }

    /** The swatches: a plain one, then every image in img/materials. */
    renderMaterials(refresh = false) {
        // Read first: the Build bar lists them too, with no panel of this tool on the page.
        const materials = this.materials(refresh);
        const holder = this.panel?.querySelector('.rr-pieces-materials');
        if (!holder) return;
        if (materials.length && !materials.some(entry => entry.name === this.material)) this.material = this.material || '';
        // An <img>, not a CSS background: the editor page cannot load a
        // project file as a stylesheet image, while an image element can.
        const swatch = (name, inner, title) => `<button type="button" class="rr-pieces-material" data-piece-material="${name.replace(/"/g, '&quot;')}" role="radio" aria-checked="${name === this.material}" title="${title.replace(/"/g, '&quot;')}" style="width: 34px; height: 34px; border-radius: 4px; border: 2px solid var(--color-border-input); padding: 0; cursor: pointer; overflow: hidden; background: linear-gradient(135deg, #9a9a9a, #6f6f6f);">${inner}</button>`;
        holder.innerHTML = swatch('', '', this._t('pieces.plain'))
            + materials.map(entry => swatch(entry.name, `<img src="${entry.url.replace(/"/g, '&quot;')}" alt="" draggable="false" style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;">`, entry.name)).join('');
        holder.querySelectorAll('.rr-pieces-material').forEach(button => button.addEventListener('click', () => this.setMaterial(button.dataset.pieceMaterial)));
        const hint = this.panel.querySelector('.rr-pieces-materials-hint');
        if (hint) hint.style.display = materials.length ? 'none' : '';
    }

    /** The plans under 3d/Structures, by name. */
    structures(refresh = false) {
        const projectPath = this.projectPath();
        if (this._structuresCache && !refresh && this._structuresProject === projectPath) return this._structuresCache;
        let list = [];
        try {
            if (projectPath && typeof require === 'function') {
                const fs = require('fs'), path = require('path');
                const directory = path.join(projectPath, '3d', 'Structures');
                if (fs.existsSync(directory)) {
                    for (const file of fs.readdirSync(directory).filter(name => /\.json$/i.test(name)).sort()) {
                        try {
                            const plan = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
                            if (plan && Array.isArray(plan.size) && (Array.isArray(plan.floors) || Array.isArray(plan.pieces) || Array.isArray(plan.parts) || Array.isArray(plan.shapes))) list.push({ file, name: plan.name || file.replace(/\.json$/i, ''), plan });
                        } catch (error) { console.warn(`${file} is not a structure plan.`, error); }
                    }
                }
            }
        } catch (error) { list = []; }
        this._structuresCache = list;
        this._structuresProject = projectPath;
        return list;
    }

    renderStructures(refresh = false) {
        // Read first, as the materials are: stamped buildings are built again from these plans.
        const list = this.structures(refresh);
        const select = this.panel?.querySelector('.rr-pieces-structure');
        if (!select) return;
        select.innerHTML = `<option value="">${this._t(list.length ? 'pieces.structureNone' : 'pieces.noStructures')}</option>`
            + list.map(entry => `<option value="${entry.file.replace(/"/g, '&quot;')}">${entry.name.replace(/</g, '&lt;')} (${entry.plan.size[0]}×${entry.plan.size[1]})</option>`).join('');
        select.value = list.some(entry => entry.file === this.structure) ? this.structure : '';
        if (!select.value) this.structure = '';
        select.disabled = !list.length;
    }

    structurePlan() {
        return this.structures().find(entry => entry.file === this.structure)?.plan || null;
    }

    /** A plan's part by file name, for plans made of plans. */
    resolvePlan(name) {
        return this.structures().find(entry => entry.file === name || entry.file === name + '.json' || entry.name === name)?.plan || null;
    }

    /** The plan's own pieces as one geometry at the origin: the stamp's ghost. */
    ghostGeometryFor(plan, rot = 0, scale = 1) {
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!SP || typeof Reactor3D === 'undefined' || !plan) return null;
        const shaped = SP.transform(plan, rot, scale, name => this.resolvePlan(name));
        const pieces = SP.build(shaped, 0, 0, 1, 0, name => this.resolvePlan(name));
        return Reactor3D.pieceGeometry(pieces, null);
    }

    /**
     * Put a plan down with its top-left cell at (x, y): the terrain under
     * it is levelled to its mean, whatever stood on the footprint goes, and
     * the plan's pieces take its place — one undo step for the lot.
     */
    stampAt(x, y) {
        const map = this.currentMap(), elevation = this.elevation(), plan = this.structurePlan();
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!map || !elevation || !plan || !SP) return false;
        // The turn in hand (R/Q/E) turns the building before it goes down;
        // _lay levels the pad and clamps the footprint to the map.
        const saved = this._snapshot(map, { ground: true, effects: true, events: true, props: this._bringsProps(plan) });
        const places = this._propPlaces(map);
        const group = elevation.nextPieceGroup(map);
        if (!this._lay(map, plan, { group, plan: this.structure, x: Math.floor(x), y: Math.floor(y), rot: this.rot || 0, scale: 1 })) return this._tooBig(map, plan, this.rot || 0, 1);
        saved.propMoves = this._propMoves(map, places);
        saved.foliage = this._clearFoliage(map, piece => piece.group === group);
        this.undoStack.push(saved);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        this.announce(true);
        this.refreshStatus();
        return true;
    }

    /** Build a plan's pieces for a structure record: the pad levelled, the footprint cleared, models pushed off. */
    _lay(map, plan, record) {
        const elevation = this.elevation(), SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        if (!elevation || !SP) return false;
        const shaped = SP.transform(plan, record.rot, record.scale, name => this.resolvePlan(name));
        const [W, H] = shaped.size;
        const X0 = Math.max(0, Math.min(map.width - W, record.x)), Y0 = Math.max(0, Math.min(map.height - H, record.y));
        if (W > map.width || H > map.height) return false;
        record.x = X0; record.y = Y0;
        this._levelPad(map, X0, Y0, W, H);
        elevation.relocatePropsOff(map, X0, Y0, W, H, record.group);
        const kept = elevation.pieces(map).filter(piece => piece.group !== record.group && !(piece.x >= X0 && piece.x < X0 + W && piece.y >= Y0 && piece.y < Y0 + H));
        const firstId = kept.reduce((max, piece) => Math.max(max, piece.id), 0) + 1;
        elevation.restorePieces(map, kept.concat(SP.build(shaped, X0, Y0, firstId, record.group, name => this.resolvePlan(name))));
        record.spots = SP.spots(shaped, X0, Y0, name => this.resolvePlan(name));
        elevation.setStructure(map, record);
        // The building's people: events at its spots, moved with it, kept when edited.
        const wanted = SP.eventsOf(shaped, X0, Y0, name => this.resolvePlan(name));
        // Its screens, lights and animations: surfaces and lights on the map, animations as events.
        const effects = SP.effectsOf(shaped, X0, Y0, name => this.resolvePlan(name));
        // Water the plan brings stands at its height above the pad, which is now level at the corner.
        const pad = elevation.hasTerrain(map) ? Number(elevation.terrain(map)[Y0 * (map.width + 1) + X0]) || 0 : 0;
        for (const fx of effects) if (fx.type === 'mapWater') fx.base = pad;
        if (effects.length || SP.removeGroupEffects(map, record.group)) {
            for (const request of SP.placeEffects(map, record.group, effects)) wanted.push(request);
            window.reactor?.lightingManager?.render?.();
            window.reactor?.mediaSurfaceManager?.render?.();
        }
        if (wanted.length) {
            SP.placeEvents(map, record.group, wanted, name => this.loadEventTemplate(name));
            this._eventsChanged = true;
        }
        window.reactor?.modelPropsManager?.render?.();
        return true;
    }

    /** Whether a plan (or a part of it) lays models of its own. */
    _bringsProps(plan, depth = 0) {
        if (!plan || depth > 8) return false;
        if (Array.isArray(plan.props) && plan.props.length) return true;
        return (plan.parts || []).some(part => this._bringsProps(this.resolvePlan(part.plan), depth + 1));
    }

    /** A plan that does not fit the map is said so, not ignored. Always false: nothing was laid. */
    _tooBig(map, plan, rot, scale) {
        const SP = typeof RRStructurePlan !== 'undefined' ? RRStructurePlan : null;
        const size = SP ? SP.transform(plan, rot, scale, name => this.resolvePlan(name)).size : plan.size;
        if (size && (size[0] > map.width || size[1] > map.height)) {
            const text = window.I18n ? window.I18n.tText('This plan is larger than the map.') : 'This plan is larger than the map.';
            const status = this.panel?.querySelector('.rr-pieces-status');
            if (status) status.textContent = text;
            window.reactor?.buildHotbar?.flash?.(text);
        }
        return false;
    }

    /** An event template under 3d/Structures/events, by name. */
    loadEventTemplate(name) {
        try {
            const projectPath = this.projectPath();
            if (!projectPath || typeof require !== 'function') return null;
            const fs = require('fs'), path = require('path');
            const file = path.join(projectPath, '3d', 'Structures', 'events', /\.json$/i.test(name) ? name : name + '.json');
            return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
        } catch (error) { console.warn(`Event template ${name} could not be read.`, error); return null; }
    }

    /** The selected structure, built again from its plan with a changed record. */
    _restamp(map, change) {
        const elevation = this.elevation();
        const record = elevation.structureOf(map, this.selectedGroup);
        if (!record) return false;
        const plan = this.structures().find(entry => entry.file === record.plan)?.plan;
        if (!plan) return false;
        const saved = this._snapshot(map, { ground: true, effects: true, events: true, props: this._bringsProps(plan) });
        const places = this._propPlaces(map);
        if (!this._lay(map, plan, Object.assign(record, change))) return this._tooBig(map, plan, record.rot, record.scale);
        saved.propMoves = this._propMoves(map, places);
        saved.foliage = this._clearFoliage(map, piece => piece.group === record.group);
        this.undoStack.push(saved); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0;
        this.announce(true); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    /** The selected building laid again from its plan as the plan is now (a rebuilt roof, more floors). */
    relayFromPlan() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup || !elevation.structureOf(map, this.selectedGroup)) return false;
        return this._restamp(map, {});
    }

    rotateSelected() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        if (elevation.structureOf(map, this.selectedGroup)) return this._restamp(map, { rot: (elevation.structureOf(map, this.selectedGroup).rot + 1) % 4 });
        const saved = elevation.piecesSnapshot(map);
        if (!elevation.rotatePieceGroup(map, this.selectedGroup)) return false;
        this.undoStack.push(saved); this.redoStack.length = 0;
        this.announce(); this.refreshStatus(); this._ghostChanged();
        return true;
    }

    scaleSelected(delta) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const record = elevation.structureOf(map, this.selectedGroup);
        if (!record) return false;
        const scale = Math.max(1, Math.min(4, record.scale + delta));
        return scale === record.scale ? false : this._restamp(map, { scale });
    }

    nudgeSelected(dx, dy) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const bounds = elevation.pieceGroupBounds(map, this.selectedGroup);
        return bounds ? this.moveSelectedTo(bounds.x0 + dx, bounds.y0 + dy) : false;
    }

    /** Move mode, first click: the structure the pointed piece belongs to. */
    selectGroupAt(target) {
        this._selectionChanged = true;
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return false;
        const stack = elevation.pieces(map).filter(piece => piece.x === target.x && piece.y === target.y);
        const piece = stack.find(p => p.z === target.z) || stack.reduce((best, p) => (!best || p.z > best.z ? p : best), null);
        if (!piece) { this.selectedGroup = 0; this._flash('pieces.notStructure'); this._ghostChanged(); return false; }
        if (!piece.group) {
            // A loose piece: everything touching it becomes one building, so a
            // house built by hand moves as one too.
            const saved = elevation.piecesSnapshot(map);
            const group = elevation.groupConnectedPieces(map, target.x, target.y);
            if (!group) { this.selectedGroup = 0; this._flash('pieces.notStructure'); this._ghostChanged(); return false; }
            this.undoStack.push(saved); this.redoStack.length = 0;
            this.selectedGroup = group;
            this._syncPanel();
            this._flash('pieces.grouped', { count: elevation.pieceGroup(map, group).length });
            this._ghostChanged();
            return true;
        }
        this.selectedGroup = piece.group;
        this._syncPanel();
        this.refreshStatus();
        this._ghostChanged();
        return true;
    }

    /** Move mode, second click: the selected structure's top-left cell goes here, ground levelled under it. */
    moveSelectedTo(x, y) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const bounds = elevation.pieceGroupBounds(map, this.selectedGroup);
        if (!bounds) { this.selectedGroup = 0; return false; }
        // A stamped building is built again at the new place; a hand-built group slides.
        if (elevation.structureOf(map, this.selectedGroup)) return this._restamp(map, { x: Math.floor(x), y: Math.floor(y) });
        const W = bounds.x1 - bounds.x0 + 1, H = bounds.y1 - bounds.y0 + 1;
        const X0 = Math.max(0, Math.min(map.width - W, Math.floor(x))), Y0 = Math.max(0, Math.min(map.height - H, Math.floor(y)));
        const saved = this._snapshot(map, { ground: true });
        const places = this._propPlaces(map);
        if (!elevation.movePieceGroup(map, this.selectedGroup, X0, Y0)) return false;
        elevation.relocatePropsOff(map, X0, Y0, W, H);
        saved.propMoves = this._propMoves(map, places);
        // What grew where it now stands goes; where it stood stays bare (nothing regrows).
        const moved = this.selectedGroup;
        saved.foliage = this._clearFoliage(map, piece => piece.group === moved);
        this.undoStack.push(saved);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        this._levelPad(map, X0, Y0, W, H);
        this.announce(true);
        this.refreshStatus();
        this._ghostChanged();
        return true;
    }

    /** Where each model stands, and the models an edit then pushed off its footprint as `{ id, from, to }` (an undo puts them back). */
    _propPlaces(map) { return new Map((this.elevation().props?.(map) || []).map(prop => [prop.id, [prop.x, prop.y]])); }
    _propMoves(map, places) {
        return (this.elevation().props?.(map) || []).filter(prop => places.has(prop.id) && (places.get(prop.id)[0] !== prop.x || places.get(prop.id)[1] !== prop.y))
            .map(prop => ({ id: prop.id, from: places.get(prop.id), to: [prop.x, prop.y] }));
    }

    /**
     * What a building edit can touch: pieces and the building records, and
     * the ground or the lights and screens only for an edit that changes
     * them (they have tools and undo of their own, which an undo here must
     * not roll back).
     */
    /**
     * What grew under the pieces a step laid on the ground (those `accept` takes) goes with that step, as a record
     * its undo grows back (`_swap`); null when nothing grew there.
     */
    _clearFoliage(map, accept) {
        const F = (typeof RRMapFoliage !== 'undefined' && RRMapFoliage) || (typeof window !== 'undefined' && window.RRMapFoliage) || null;
        if (!F || !F.clearUnderPieces || !map || !F.hasFoliage(map)) return null;
        const record = F.clearUnderPieces(map, accept);
        if (record && typeof window !== 'undefined') window.reactor?.terrainManager?.announceFoliage?.(F.clearedRegion(map, record));
        return record;
    }

    _snapshot(map, { ground = false, effects = false, events = false, props = false, allEvents = false } = {}) {
        const elevation = this.elevation();
        const out = { pieces: elevation.piecesSnapshot(map), structures: elevation.structures(map) };
        if (ground) out.terrain = elevation.terrainSnapshot(map);
        // Levelled ground and pieces refit the ponds (announce): a pond under a footprint or a wall shrinks or goes.
        if (elevation.waterSnapshot && (ground || elevation.hasWater?.(map))) out.water = JSON.stringify(elevation.waterSnapshot(map));
        if (effects) {
            const sidecar = map.reactor3d || {};
            out.surfaces = JSON.stringify(sidecar.mediaSurfaces || null);
            out.lights = JSON.stringify(sidecar.lights || null);
        }
        // A step that lays a saved structure's own models keeps every model (the Models tool's edits otherwise keep their own undo).
        if (props) out.props = JSON.stringify((map.reactor3d && map.reactor3d.props) || null);
        // A step that turns loose events into a building's people keeps every event as it was.
        if (allEvents) out.allEvents = JSON.stringify(Array.isArray(map.events) ? map.events : []);
        // A building's people come and go with it (placeEvents, removeGroupEvents): only the steps that
        // place or take them keep them, so undoing another step never rolls back an event edited since.
        if (events) out.events = JSON.stringify(this._structureEvents(map));
        return out;
    }

    /** The events a stamped building placed (`<structure:n><spot:…>` in the note), as [index, event]. */
    _structureEvents(map) {
        return (Array.isArray(map.events) ? map.events : []).map((event, index) => [index, event])
            .filter(([, event]) => event && typeof event.note === 'string' && PieceBuilderManager.STRUCTURE_EVENT.test(event.note));
    }

    /** Put a snapshot's building events back in place of the ones there now; a slot taken since by another event gives a new id. */
    _restoreStructureEvents(map, saved) {
        if (!Array.isArray(map.events)) return;
        for (const [index] of this._structureEvents(map)) map.events[index] = null;
        for (const [index, event] of saved) {
            let id = index;
            if (map.events[id]) id = map.events.reduce((max, e) => Math.max(max, e && e.id ? e.id : 0), 0) + 1;
            while (map.events.length <= id) map.events.push(null);
            map.events[id] = Object.assign(event, { id });
        }
        while (map.events.length > 1 && map.events[map.events.length - 1] == null) map.events.pop();
        this._eventsChanged = true;
    }

    /**
     * The ponds as they were before a step, keeping what was done to them since: a sheet the step
     * refitted gets its old cells back (its look as it is now), one the step dried up whole comes
     * back unless it was drained since, and a sheet poured since stays.
     */
    static mergeWater(current, before, after) {
        const key = sheet => [sheet.x0, sheet.y0, sheet.x1, sheet.y1, sheet.level].join(',');
        if (!Array.isArray(after)) return before.slice();
        const was = new Map(before.map(sheet => [key(sheet), sheet]));
        const left = new Set(after.map(key)), now = new Set(current.map(key));
        const out = current.map(sheet => {
            const old = was.get(key(sheet));
            if (!old) return sheet;
            const merged = Object.assign({}, sheet);
            if (old.mask) merged.mask = old.mask; else delete merged.mask;
            return merged;
        });
        // A sheet that comes back takes its old place among the ones it stood between.
        let cursor = 0;
        for (const [k, sheet] of was) {
            if (now.has(k)) cursor = out.findIndex(other => key(other) === k) + 1;
            else if (!left.has(k)) out.splice(cursor++, 0, sheet);
        }
        return out;
    }

    /**
     * Level a footprint's ground to one height for a building: the mean of its corners, or the
     * surface of a pond it stands in, so it is built on the water rather than sunk to the pond's floor.
     */
    _levelPad(map, X0, Y0, W, H) {
        const elevation = this.elevation();
        if (!elevation.hasTerrain(map)) return;
        const grid = elevation.terrain(map), stride = map.width + 1;
        let sum = 0, n = 0;
        for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) { sum += Number(grid[yy * stride + xx]) || 0; n++; }
        let level = Math.round((sum / n) * 1000) / 1000;
        for (const sheet of elevation.water ? elevation.water(map) : []) {
            if (sheet.level <= level) continue;
            for (let yy = Y0; yy < Y0 + H && sheet.level > level; yy++) for (let xx = X0; xx < X0 + W; xx++) if (elevation.waterCovers(sheet, xx, yy)) { level = sheet.level; break; }
        }
        for (let yy = Y0; yy <= Y0 + H; yy++) for (let xx = X0; xx <= X0 + W; xx++) grid[yy * stride + xx] = level;
    }

    removeSelectedGroup() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !this.selectedGroup) return false;
        const ownProps = (elevation.props?.(map) || []).some(prop => prop.structure === this.selectedGroup);
        const saved = this._snapshot(map, { effects: true, events: true, props: ownProps });
        if (typeof RRStructurePlan !== 'undefined' && RRStructurePlan.removeGroupEvents(map, this.selectedGroup)) this._eventsChanged = true;
        if (typeof RRStructurePlan !== 'undefined' && RRStructurePlan.removeGroupEffects(map, this.selectedGroup)) { window.reactor?.lightingManager?.render?.(); window.reactor?.mediaSurfaceManager?.render?.(); }
        if (!elevation.removePieceGroup(map, this.selectedGroup)) return false;
        this.undoStack.push(saved); this.redoStack.length = 0;
        this.selectedGroup = 0;
        this.announce(); this.refreshStatus(); this._syncPanel(); this._ghostChanged();
        return true;
    }

    selectedGroupBounds() {
        const map = this.currentMap(), elevation = this.elevation();
        return map && elevation && this.selectedGroup ? elevation.pieceGroupBounds(map, this.selectedGroup) : null;
    }

    _flash(key, params) {
        const status = this.panel?.querySelector('.rr-pieces-status');
        if (status) status.textContent = this._t(key, params);
        window.reactor?.buildHotbar?.flash?.(this._t(key, params));
    }

    _syncPanel() {
        this._syncBar();
        const panel = this.panel;
        if (!panel) return;
        const stamp = panel.querySelector('.rr-pieces-stamp');
        if (stamp) stamp.setAttribute('aria-checked', String(this.mode === 'stamp'));
        const remove = panel.querySelector('.rr-pieces-remove-structure');
        if (remove) remove.disabled = !this.selectedGroup;
        const transform = panel.querySelector('.rr-pieces-transform');
        if (transform) {
            const map = this.currentMap(), elevation = this.elevation();
            const record = map && elevation && this.selectedGroup ? elevation.structureOf(map, this.selectedGroup) : null;
            transform.style.display = this.mode === 'move' && this.selectedGroup ? 'flex' : 'none';
            const scaleValue = panel.querySelector('.rr-pieces-scale-value');
            if (scaleValue) scaleValue.textContent = record ? String(record.scale) : '–';
            for (const cls of ['.rr-pieces-scale-down', '.rr-pieces-scale-up']) { const b = panel.querySelector(cls); if (b) b.disabled = !record; }
        }
        panel.querySelectorAll('.rr-pieces-kind').forEach(button => button.setAttribute('aria-checked', String(button.dataset.pieceKind === this.kind)));
        panel.querySelectorAll('.rr-pieces-mode').forEach(button => button.setAttribute('aria-checked', String(button.dataset.pieceMode === this.mode)));
        panel.querySelectorAll('.rr-pieces-material').forEach(button => button.setAttribute('aria-checked', String(button.dataset.pieceMaterial === this.material)));
        const rot = panel.querySelector('.rr-pieces-rot-value');
        if (rot) rot.textContent = (this.rot * 90) + '°';
        const level = panel.querySelector('.rr-pieces-level-value');
        if (level) level.textContent = String(this.level);
    }
    /** The bar over the 3D view follows the same state as the panel. */
    _syncBar() { window.reactor?.buildHotbar?.sync?.(); }

    setKind(kind) { if (this.kinds().includes(kind)) { this.kind = kind; this.mode = 'place'; this._syncPanel(); this._ghostChanged(); } }
    setMode(mode) {
        if (mode !== 'place' && mode !== 'erase' && mode !== 'stamp' && mode !== 'move' && mode !== 'select') return;
        if (mode !== 'select') { this.selected = 0; this.selectedIds = []; }
        if (mode === 'stamp' && !this.structurePlan()) mode = 'place';
        if (mode !== 'move') this.selectedGroup = 0;
        this.mode = mode; this._syncPanel(); this.refreshStatus(); this._ghostChanged();
    }
    setMaterial(name) { this.material = String(name || ''); this._syncPanel(); }
    turn(steps = 1) { this.rot = ((this.rot + steps) % 4 + 4) % 4; this._syncPanel(); this._ghostChanged(); }
    setLevel(level) {
        // The Structure workshop's plot is only so many floors tall.
        const plot = this.currentMap()?.rrWorkshop;
        const max = plot ? plot.maxLevel : this.elevation()?.PIECE_MAX_LEVEL ?? 240;
        this.level = Math.max(0, Math.min(max, Math.floor(Number(level)) || 0));
        this._syncPanel();
        this._ghostChanged();
    }
    _ghostChanged() { window.reactor?.mapEditor3D?.refreshPieceGhost?.(); window.reactor?.mapEditor3D?.refreshSelection?.(); }

    refreshStatus() {
        const status = this.panel?.querySelector('.rr-pieces-status');
        if (!status) return;
        const map = this.currentMap(), elevation = this.elevation();
        const is3D = !!(map && elevation && elevation.hasNote(map));
        if (this.mode === 'move' && this.selectedGroup) {
            status.textContent = this._t('pieces.structureSelected', { count: elevation.pieceGroup(map, this.selectedGroup).length });
            return;
        }
        status.textContent = !map ? '' : !is3D ? this._t('pieces.needs3D') : this._t('pieces.count', { count: elevation.pieces(map).length });
    }

    activate() {
        window.reactor?.claimMapTool?.('pieces');
        this.renderStructures(true);
        const mapEditor = window.reactor?.mapEditor;
        if (!this.active) this._resumeMapEditor = !!mapEditor?.enabled;
        this.active = true;
        mapEditor?.setEnabled?.(false);
        document.addEventListener('keydown', this._onKeyDown);
        const map = this.currentMap();
        if (map && this.elevation()?.hasNote(map)) {
            const toggle = document.getElementById('map-3d-view');
            if (toggle && !toggle.checked) toggle.click();
        }
        this.renderMaterials(true);
        this.refreshStatus();
        this.syncHistoryButtons();
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        this._stroke = null;
        document.removeEventListener('keydown', this._onKeyDown);
        // Another tool holds the map: its selection lets go too (the outline and handles went with it, or looked live).
        this.clearSelection();
        window.reactor?.mapEditor3D?.hidePieceGhost?.();
        const mapEditor = window.reactor?.mapEditor;
        if (mapEditor && this._resumeMapEditor) {
            mapEditor.setEnabled(true);
            mapEditor.setupMapInteraction?.();
        }
        this.syncHistoryButtons();
    }

    /** The piece as it would be laid at a target `{x, y, z}`. */
    /**
     * A ladder leans on what it is placed against: the turn that climbs toward
     * a wall, a block or a bank beside the cell (the one the chosen turn names
     * when there are several), or null in the open, where the chosen turn stands.
     */
    ladderRotFor(target) {
        const map = this.currentMap();
        if (!map || !target || typeof Reactor3D === 'undefined' || !Reactor3D.pieceBaseAt) return null;
        const base = Reactor3D.pieceBaseAt(map, target.x, target.y) + (target.z || 0);
        const solid = (x, y) => {
            if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
            if (Reactor3D.pieceSolidAt && Reactor3D.pieceSolidAt(map, x + 0.5, base + 0.5, y + 0.5)) return true;
            // A bank or cliff that stands over the ladder's foot.
            return Reactor3D.groundHeightAt && Reactor3D.groundHeightAt(map, x + 0.5, y + 0.5, base) > base + 1;
        };
        const leaning = [0, 1, 2, 3].filter(rot => { const [dx, dy] = PieceBuilderManager.stepOf(rot); return solid(target.x + dx, target.y + dy); });
        if (!leaning.length) return null;
        return leaning.includes(this.rot) ? this.rot : leaning[0];
    }

    /**
     * The doorway a door clicked onto hangs in: its run of doorway cells at
     * the level (along the wall it opens through), the run's first cell
     * along the door's across, and the facing nearest the one in hand.
     * Null when the cell holds no doorway.
     */
    doorwayRun(target) {
        const map = this.currentMap(), E = this.elevation();
        if (!map || !E || !target) return null;
        const list = E.pieces(map);
        const kindAt = (x, y) => { const here = list.filter(piece => piece.x === x && piece.y === y && piece.z === target.z); return here.map(piece => piece.kind); };
        const isDoorway = (x, y) => kindAt(x, y).includes('doorway');
        if (!isDoorway(target.x, target.y)) return null;
        const wallish = (x, y) => kindAt(x, y).some(kind => kind === 'wall' || kind === 'window' || kind === 'doorway');
        // Along x when the doorway runs or is walled east and west, else along y.
        const alongX = isDoorway(target.x - 1, target.y) || isDoorway(target.x + 1, target.y)
            || (!isDoorway(target.x, target.y - 1) && !isDoorway(target.x, target.y + 1) && (wallish(target.x - 1, target.y) || wallish(target.x + 1, target.y)));
        const [dx, dy] = alongX ? [1, 0] : [0, 1];
        let x0 = target.x, y0 = target.y;
        while (isDoorway(x0 - dx, y0 - dy)) { x0 -= dx; y0 -= dy; }
        let width = 0;
        while (width < 6 && isDoorway(x0 + dx * width, y0 + dy * width)) width++;
        // Facing: 0 or 2 for a wall along x, 1 or 3 along y; the one in hand when it fits.
        const rot = alongX ? (this.rot === 2 ? 2 : 0) : (this.rot === 1 ? 1 : 3);
        // The first cell along the across: rot 0 runs east, 1 south, 2 west, 3 north.
        const anchor = rot === 0 || rot === 1 ? [x0, y0] : [x0 + dx * (width - 1), y0 + dy * (width - 1)];
        return { x: anchor[0], y: anchor[1], rot, width };
    }

    /** The framed windows framed as one with this one: side by side at its level and turn, with its frame. */
    windowRun(piece) {
        const map = this.currentMap(), E = this.elevation();
        if (!map || !E || !piece || piece.kind !== 'window') return piece ? [piece] : [];
        const list = E.pieces(map).filter(p => p.kind === 'window' && p.z === piece.z && p.rot === piece.rot);
        const look = JSON.stringify(piece.frame || null);
        const [dx, dy] = PieceBuilderManager.acrossOf(piece.rot);
        const at = (x, y) => list.find(p => p.x === x && p.y === y && JSON.stringify(p.frame || null) === look);
        const run = [piece];
        for (const sign of [-1, 1]) for (let k = 1, next = at(piece.x + dx * sign, piece.y + dy * sign); next && k < 12; k++, next = at(piece.x + dx * sign * k, piece.y + dy * sign * k)) run.push(next);
        return run;
    }

    /** A turn's across, as a door's or a window's runs along it: rot 0 east, 1 south, 2 west, 3 north. */
    static acrossOf(rot) { return [[1, 0], [0, 1], [-1, 0], [0, -1]][((rot % 4) + 4) % 4]; }

    pieceFor(target) {
        const piece = { kind: this.kind, x: target.x, y: target.y, z: target.z, rot: this.rot, material: this.material };
        if (this.finish) piece.finish = this.finish;
        if (this.surface) piece.surface = Object.assign({}, this.surface);
        if (this.kind === 'door') {
            Object.assign(piece, JSON.parse(JSON.stringify(this.door)));
            if (!piece.material) piece.material = 'Wood';
            // The doorway clicked: the cell aimed at, else the one whose face was struck, else the one under the hit
            // (a click on a doorway's reveal or on the floor just through it).
            const candidates = [target, target.faceCell, target.point ? { x: Math.floor(target.point.x), y: Math.floor(target.point.z) } : null];
            // Through the opening the pointer lands on the floor beyond: the doorway beside it, nearest first.
            const px = target.point ? target.point.x : target.x + 0.5, py = target.point ? target.point.z : target.y + 0.5;
            const around = [];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) around.push({ x: target.x + dx, y: target.y + dy });
            around.sort((a, b) => Math.hypot(a.x + 0.5 - px, a.y + 0.5 - py) - Math.hypot(b.x + 0.5 - px, b.y + 0.5 - py));
            candidates.push(...around);
            for (const cell of candidates) {
                const run = cell ? this.doorwayRun({ x: cell.x, y: cell.y, z: target.z }) : null;
                if (run) { Object.assign(piece, run); break; }
            }
        }
        if (this.kind === 'window' && this.windowFrame) piece.frame = Object.assign({}, this.windowFrame);
        if (this.kind === 'ladder') { const rot = this.ladderRotFor(target); if (rot !== null) piece.rot = rot; }
        const E = this.elevation();
        if (E && E.SHAPE_KINDS && E.SHAPE_KINDS.includes(this.kind)) {
            piece.size = this.sizeFor(this.kind);
            Object.assign(piece, (this.params && this.params[this.kind]) || {});
            const off = this.shapeOffsetFor(target);
            if (off && (off[0] || off[1])) piece.offset = off;
        }
        if (this.kind === 'rock') {
            if (this.rockCap) piece.cap = this.rockCap;
            if (this.rockTint) piece.tint = this.rockTint;
            if (this.rockVary) {
                const v = PieceBuilderManager.rockVariation(Number.isFinite(target.seed) ? target.seed : this.rockSeed);
                const quarter = n => Math.max(0.5, Math.round(n * 4) / 4);
                piece.size = [quarter(piece.size[0] * v.w), quarter(piece.size[1] * v.h), quarter(piece.size[2] * v.d)];
                piece.angle = ((v.angle % 360) + 360) % 360;
                const rough = Number.isFinite(piece.rough) ? piece.rough : 0.5;
                piece.rough = Math.max(0, Math.min(1, Math.round((rough + v.rough) * 100) / 100));
            }
        }
        return piece;
    }

    /** How a rock laid by hand differs from the size in hand, fixed by a seed: sizes scaled, a slight turn, roughness nudged. */
    static rockVariation(seed) {
        const r = n => { const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
        return { w: 0.8 + 0.45 * r(1), h: 0.75 + 0.55 * r(2), d: 0.8 + 0.45 * r(3), angle: Math.round((r(4) - 0.5) * 50), rough: Math.round((r(5) - 0.5) * 20) / 100 };
    }

    /** Where rocks go apart in a drag or a filled rectangle: most of a rock's width, so they meet and melt together. */
    rockSpacing() {
        const size = this.sizeFor('rock');
        return [Math.max(1, Math.round(size[0] * 0.75)), Math.max(1, Math.round(size[2] * 0.75))];
    }

    /** Where in its cell a shape goes: under the pointer, to the quarter tile (a cell piece fills its cell). */
    shapeOffsetFor(target) {
        if (!target || !target.point || !this.isShape(this.kind)) return null;
        const snap = v => Math.max(-0.5, Math.min(0.5, Math.round(v * 4) / 4));
        return [snap(target.point.x - (target.x + 0.5)), snap(target.point.z - (target.y + 0.5))];
    }

    /**
     * A stroke starts with the click and lays a piece on every new cell
     * or level the drag reaches; the same cell twice does nothing, so a
     * slow drag and a fast one leave the same row. The 3D view keeps the
     * drag on the plane of the first piece, so a run of walls stays a run
     * and never climbs onto the wall it just laid. A rectangle stroke
     * (Ctrl held) lays the rectangle between the first cell and the
     * pointer instead: a floor or a block fills it, anything else lines
     * its edge, and every move lays it again from the stroke's start so
     * the rectangle follows the pointer.
     */
    beginStroke(target, mode = this.mode, options = {}) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return false;
        // The building records too (an edit inside a stamped building detaches it), and what the hammer may take: a light or a screen.
        const saved = this._snapshot(map, { effects: mode === 'erase' });
        this.undoStack.push(saved);
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack.length = 0;
        this._stroke = { mode, moved: false, last: null, anchor: { x: target.x, y: target.y, z: target.z }, snapshot: saved.pieces, entry: saved, rectangle: !!options.rectangle, seed: this.rockSeed };
        return this.dab(target);
    }

    paintAt(target, options = {}) {
        if (!this._stroke || !target) return false;
        if (options.rectangle || this._stroke.rectangle) return this.layRectangle(target);
        const last = this._stroke.last;
        if (last && last.x === target.x && last.y === target.y && last.z === target.z) return false;
        return this.dab(target);
    }

    /** Kinds that fill a rectangle; the rest line its edge. */
    static fillsRectangle(kind) { return kind === 'floor' || kind === 'block'; }

    /** The cells of the rectangle between the stroke's anchor and `target`, at the anchor's level. */
    rectangleCells(target) {
        const a = this._stroke.anchor;
        const x0 = Math.min(a.x, target.x), x1 = Math.max(a.x, target.x);
        const y0 = Math.min(a.y, target.y), y1 = Math.max(a.y, target.y);
        const fill = this._stroke.mode === 'erase' || PieceBuilderManager.fillsRectangle(this.kind);
        const cells = [];
        // Rocks fill it on a grid of their spacing, each its own (seeded by its place, so the
        // rectangle keeps its rocks while it is dragged bigger).
        if (this.kind === 'rock' && this._stroke.mode !== 'erase') {
            const [sx, sy] = this.rockSpacing();
            for (let y = y0; y <= y1; y += sy) for (let x = x0; x <= x1; x += sx) cells.push({ x, y, z: a.z, seed: this._stroke.seed + x * 7919 + y * 104729 });
            return { cells, x0, y0, x1, y1 };
        }
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (fill || x === x0 || x === x1 || y === y0 || y === y1) cells.push({ x, y, z: a.z });
        }
        return { cells, x0, y0, x1, y1 };
    }

    layRectangle(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target || !this._stroke) return false;
        const last = this._stroke.last;
        if (this._stroke.rectangle && last && last.x === target.x && last.y === target.y) return false;
        this._stroke.rectangle = true;
        this._stroke.last = { x: target.x, y: target.y, z: this._stroke.anchor.z };
        // From the stroke's start again, so a rectangle that shrinks leaves nothing behind.
        elevation.restorePieces(map, this._stroke.snapshot);
        const { cells, x0, y0, x1, y1 } = this.rectangleCells(target);
        const group = elevation.pieceGroupAt(map, this._stroke.anchor.x, this._stroke.anchor.y);
        let changed = false;
        for (const cell of cells) {
            if (this._stroke.mode === 'erase') { if (this.eraseAt(map, cell)) changed = true; continue; }
            const piece = this.pieceFor(cell);
            if (group) piece.group = group;
            if (elevation.setPiece(map, piece)) changed = true;
        }
        if (changed && group && elevation.structureOf(map, group)) {
            elevation.removeStructure(map, group);
            this._flash('pieces.detached');
            this._flashed = true;
        }
        this._lastList = map.reactor3d?.pieces;
        this._stroke.moved = true;
        this.announce(false, { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 });
        return changed;
    }

    dab(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target || !this._stroke) return false;
        this._stroke.last = { x: target.x, y: target.y, z: target.z };
        // A drag of rocks lays one each spacing along the way, not one per cell.
        const rock = this.kind === 'rock' && this._stroke.mode !== 'erase';
        if (rock && this._stroke.lastRock) {
            const [sx, sy] = this.rockSpacing();
            if (Math.hypot((target.x - this._stroke.lastRock.x) / sx, (target.y - this._stroke.lastRock.y) / sy) < 1) return false;
        }
        // A hand edit inside a building: the new piece joins the building,
        // and the building stops following its plan (it would be built
        // again from the plan on the next move and lose the edit), while it
        // still moves and turns as one.
        const group = elevation.pieceGroupAt(map, target.x, target.y);
        const piece = this.pieceFor(target);
        if (group) piece.group = group;
        let changed;
        if (this._stroke.mode === 'erase') changed = this.eraseAt(map, target);
        else if ((piece.kind === 'stair' && (this.stairSteps > 1 || this.stairWidth > 1)) || (piece.kind === 'ladder' && (this.ladderHeight !== 1 || this.ladderWidth !== 1))) {
            changed = false;
            for (const step of (piece.kind === 'ladder' ? this.ladderRun(piece) : this.stairRun(piece))) {
                if (step.x < 0 || step.y < 0 || step.x >= map.width || step.y >= map.height) continue;
                if (elevation.setPiece(map, step) && this._changedSince(map)) changed = true;
            }
        } else changed = !!elevation.setPiece(map, piece) && this._changedSince(map);
        // The rock laid: the next one is another rock (its own variation; the ghost follows).
        if (rock && changed) { this._stroke.lastRock = { x: target.x, y: target.y }; this.rockSeed++; this._ghostChanged(); }
        if (changed && group && elevation.structureOf(map, group)) {
            elevation.removeStructure(map, group);
            this._flash('pieces.detached');
            this._flashed = true;
        }
        // The cells the edit could have changed: the cell and its neighbours
        // (a hidden face between touching walls belongs to both).
        if (changed) {
            this._stroke.moved = true;
            const reach = this.isShape(piece.kind) ? Math.ceil(Math.max(...(piece.size || [1, 1, 1])) / 2) + 1 : Math.max(1, this.stairSteps, this.stairWidth, piece.kind === 'ladder' ? this.ladderWidth : 1);
            this.announce(false, { x0: target.x - reach, y0: target.y - reach, x1: target.x + reach, y1: target.y + reach });
        }
        return changed;
    }

    /**
     * A run of stairs from one piece: `stairSteps` cells on and a level up
     * along the way it climbs, each `stairWidth` cells across (to the right
     * of the climb).
     */
    stairRun(piece) {
        const [dx, dy] = PieceBuilderManager.stepOf(piece.rot);
        const steps = Math.max(1, Math.floor(this.stairSteps) || 1), width = Math.max(1, Math.floor(this.stairWidth) || 1);
        const out = [];
        for (let i = 0; i < steps; i++) for (let k = 0; k < width; k++) {
            out.push(Object.assign({}, piece, { x: piece.x + dx * i - dy * k, y: piece.y + dy * i + dx * k, z: piece.z + i }));
        }
        return out;
    }

    /**
     * A ladder from one piece, `ladderWidth` wide and `ladderHeight` tall
     * (either may be a fraction), centred on the piece's column: laid out by
     * `ladderLayout`.
     */
    ladderRun(piece) {
        return this._layLadder(piece, this.ladderWidth, this.ladderHeight, 0).map(({ piece: next }) => next);
    }

    /**
     * A placed ladder: `{ foot, pieces, columns, levels, width, height, middle }`.
     * The foot is the bottom of its first column; `width` and `height` are its
     * drawn size (fractions allowed), `middle` where its middle stands across,
     * in columns from the foot's.
     */
    ladderFlight(piece) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !piece || piece.kind !== 'ladder') return null;
        const all = elevation.pieces(map);
        const [dx, dy] = PieceBuilderManager.stepOf(piece.rot), lx = -dy, ly = dx;
        const at = (x, y, z) => all.find(p => p.kind === 'ladder' && p.rot === piece.rot && p.x === x && p.y === y && p.z === z) || null;
        let foot = this.ladderStack(piece)[0] || piece;
        for (let l = at(foot.x - lx, foot.y - ly, foot.z); l; l = at(foot.x - lx, foot.y - ly, foot.z)) foot = l;
        let columns = 1;
        while (at(foot.x + lx * columns, foot.y + ly * columns, foot.z)) columns++;
        const pieces = [];
        let levels = 0, rise = 1, middle = 0;
        for (let k = 0; k < columns; k++) {
            const column = this.ladderStack(at(foot.x + lx * k, foot.y + ly * k, foot.z));
            if (column.length > levels) { levels = column.length; rise = column[column.length - 1].rise || 1; }
            const shift = column[0].offset ? column[0].offset[0] * lx + column[0].offset[1] * ly : 0;
            middle += (k + shift) / columns;
            pieces.push(...column);
        }
        const round = n => Math.round(n * 1000) / 1000;
        return { foot, pieces, columns, levels, width: round(columns * (foot.span || 1)), height: round(levels - 1 + rise), middle: round(middle) };
    }

    /**
     * How a ladder so wide and so tall is laid: whole columns and levels (the
     * cells it is climbed on), each column drawn `span` wide and shifted so
     * together they stand centred on `middle` (columns across, from the
     * first), and the top level drawn `rise` of the way up.
     */
    static ladderLayout(width, height, middle = 0) {
        const round = n => Math.round(n * 1000) / 1000;
        const count = Math.max(1, Math.ceil(width - 1e-6)), span = round(width / count);
        const levels = Math.max(1, Math.ceil(height - 1e-6)), rise = round(height - (levels - 1));
        const first = Math.round(middle - (count - 1) / 2) || 0;
        const columns = [];
        for (let k = 0; k < count; k++) columns.push({ t: first + k, shift: round(middle + (k - (count - 1) / 2) * span - (first + k)) });
        return { columns, span, levels, rise };
    }

    /** The pieces of a ladder so wide and tall from `from` (a piece: its cell, level and turn), `middle` as in `ladderLayout`. */
    _layLadder(from, width, height, middle) {
        const [dx, dy] = PieceBuilderManager.stepOf(from.rot), lx = -dy, ly = dx;
        const layout = PieceBuilderManager.ladderLayout(width, height, middle);
        const out = [];
        for (const { t, shift } of layout.columns) for (let i = 0; i < layout.levels; i++) {
            const next = Object.assign({}, from, { x: from.x + lx * t, y: from.y + ly * t, z: from.z + i });
            delete next.offset; delete next.span; delete next.rise;
            if (shift) next.offset = [lx * shift || 0, ly * shift || 0];
            if (layout.span < 1) next.span = layout.span;
            if (i === layout.levels - 1 && layout.rise < 1) next.rise = layout.rise;
            out.push({ piece: next, t });
        }
        return out;
    }

    static clampLadderSize(value, max) {
        const n = Math.round(Number(value) * 20) / 20;
        return Math.max(0.5, Math.min(max, Number.isFinite(n) && n > 0 ? n : 1));
    }

    /**
     * Lay a placed ladder again from its foot, so wide and so tall (fractions
     * allowed, one undo step), staying centred where it stood.
     */
    setLadderSize(piece, height, width, record = true) {
        const map = this.currentMap(), elevation = this.elevation();
        const flight = this.ladderFlight(piece);
        if (!map || !elevation || !flight) return false;
        height = PieceBuilderManager.clampLadderSize(height, (elevation.PIECE_MAX_LEVEL || 240) - flight.foot.z + 1);
        width = PieceBuilderManager.clampLadderSize(width, 20);
        if (height === flight.height && width === flight.width) return false;
        if (record) { this.undoStack.push(this._snapshot(map)); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }
        const gone = new Set(flight.pieces.map(p => p.id));
        const list = elevation.pieces(map).filter(p => !gone.has(p.id));
        let id = list.reduce((max, p) => Math.max(max, p.id || 0), 0);
        let footId = 0, reach = flight.columns;
        for (const { piece: next, t } of this._layLadder(flight.foot, width, height, flight.middle)) {
            next.id = ++id;
            reach = Math.max(reach, Math.abs(t) + 1);
            if (next.x < 0 || next.y < 0 || next.x >= map.width || next.y >= map.height) continue;
            if (!footId) footId = next.id;
            list.push(next);
        }
        elevation.restorePieces(map, list);
        this._detach(map, flight.pieces);
        this.selected = footId;
        reach += 1;
        this.announce(false, { x0: flight.foot.x - reach, y0: flight.foot.y - reach, x1: flight.foot.x + reach, y1: flight.foot.y + reach });
        this._syncPanel(); this._ghostChanged();
        return true;
    }

    /** setPiece returns the id even when nothing changed; the list identity says whether it did. */
    _changedSince(map) {
        const now = map.reactor3d?.pieces;
        const changed = now !== this._lastList;
        this._lastList = now;
        return changed;
    }

    /** Take the piece at the level, else the top piece on the cell. */
    eraseAt(map, target) {
        const elevation = this.elevation();
        // A door struck goes before the doorway it hangs in (the doorway is the wall's opening).
        const door = this.pieceAtTarget(target);
        if (door && door.kind === 'door') return elevation.restorePieces(map, elevation.pieces(map).filter(piece => piece.id !== door.id));
        if (elevation.removePiece(map, target.x, target.y, target.z)) return true;
        // What the strike landed in by its height, a shape standing over the cell included: a rock over a floor goes, not the floor under it.
        const struck = typeof Reactor3D !== 'undefined' && Reactor3D.piecesAt ? this.pieceAtTarget(target) : null;
        if (struck) return elevation.restorePieces(map, elevation.pieces(map).filter(piece => piece.id !== struck.id));
        const stack = elevation.pieces(map).filter(piece => piece.x === target.x && piece.y === target.y);
        if (!stack.length) {
            // A shape (a rock, a dome) stands on cells beyond its own: the hammer takes it wherever it is struck.
            const R = typeof Reactor3D !== 'undefined' ? Reactor3D : null;
            const wanted = Number.isFinite(target.height) ? target.height : target.z;
            const covering = (R && R.piecesAt ? R.piecesAt(map, target.x, target.y) || [] : [])
                .filter(entry => entry.standIn && wanted >= entry.z - 0.05 && wanted <= R.pieceTop(entry, 0.5, 0.5) + 0.05)
                .reduce((best, entry) => (!best || entry.z >= best.z ? entry : best), null);
            if (covering) return elevation.restorePieces(map, elevation.pieces(map).filter(piece => piece.id !== covering.id));
            return this.removeEffectAt(map, target);
        }
        const top = stack.reduce((best, piece) => (piece.z > best.z ? piece : best), stack[0]);
        return elevation.removePiece(map, top.x, top.y, top.z);
    }

    endStroke() {
        if (this._stroke && !this._stroke.moved) this.undoStack.pop();
        // What grew under the pieces the stroke laid on the ground goes with the stroke's own step.
        else if (this._stroke && this._stroke.mode !== 'erase' && this.undoStack[this.undoStack.length - 1] === this._stroke.entry) {
            const map = this.currentMap(), had = new Set((this._stroke.snapshot || []).map(piece => piece.id));
            if (map) this._stroke.entry.foliage = this._clearFoliage(map, piece => !had.has(piece.id));
        }
        // A rectangle of rocks used seeds from its start: the next rocks take new ones.
        if (this._stroke && this._stroke.rectangle && this.kind === 'rock') { this.rockSeed += 1000003; this._ghostChanged(); }
        this._stroke = null;
        if (this._flashed) this._flashed = false; else this.refreshStatus();
    }

    /** One piece off, outside a stroke: the right-click. */
    removeAt(target) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !target) return false;
        const saved = this._snapshot(map, { effects: true });
        if (!this.eraseAt(map, target)) return false;
        this.undoStack.push(saved);
        this.redoStack.length = 0;
        this._pruneSelection();
        this.announce(false, { x0: target.x - 1, y0: target.y - 1, x1: target.x + 1, y1: target.y + 1 });
        this.refreshStatus();
        return true;
    }

    handleKey(event) {
        if (!this.active) return;
        const target = event.target;
        if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && target.type !== 'range') return;
        if (target?.isContentEditable) return;
        if (window.reactor?.uiManager?.isEditorModalOpenForGlobalShortcuts?.()) return;
        const key = String(event.key || '').toLowerCase();
        // Ctrl+Z / Ctrl+Y come through the editor's one undo shortcut (UIManager), which hands them here while building.
        if (event.ctrlKey || event.metaKey) return;
        if (event.altKey) return;
        if (this.mode === 'select' && this.selected && key === 'r') { event.preventDefault(); this.turnSelection(event.shiftKey ? -1 : 1); }
        else if (this.mode === 'select' && this.selected && (key === 'delete' || key === 'backspace')) { event.preventDefault(); this.removeSelection(); }
        else if (this.mode === 'select' && this.selected && key === 'escape') { event.preventDefault(); this.clearSelection(); }
        else if (key === 'r' && !(this.mode === 'move' && this.selectedGroup)) { event.preventDefault(); this.turn(event.shiftKey ? -1 : 1); }
        else if (key === 'e') { event.preventDefault(); this.setLevel(this.level + 1); }
        else if (key === 'q') { event.preventDefault(); this.setLevel(this.level - 1); }
        else if (key === 'x') { event.preventDefault(); this.setMode(this.mode === 'erase' ? 'place' : 'erase'); }
        else if ((key === ']' || key === '[') && !(this.mode === 'move' && this.selectedGroup)) { event.preventDefault(); this.shapeScale = Math.max(0.25, Math.min(8, Math.round((this.shapeScale * (key === ']' ? 1.25 : 0.8)) * 100) / 100)); this._syncPanel(); this._ghostChanged(); }
        else if (key === 'm') { event.preventDefault(); this.setMode(this.mode === 'move' ? 'place' : 'move'); }
        else if (this.mode === 'move' && this.selectedGroup && key === 'r') { event.preventDefault(); this.rotateSelected(); }
        else if (this.mode === 'move' && this.selectedGroup && (key === ']' || key === '[')) { event.preventDefault(); this.scaleSelected(key === ']' ? 1 : -1); }
        else if (this.mode === 'move' && this.selectedGroup && /^arrow(left|right|up|down)$/.test(key)) {
            event.preventDefault();
            const step = event.shiftKey ? 5 : 1;
            this.nudgeSelected(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0);
        }
        else if ((key === 'delete' || key === 'backspace') && this.mode === 'move' && this.selectedGroup) { event.preventDefault(); this.removeSelectedGroup(); }
        else if (key === 'escape' && this.mode === 'move' && this.selectedGroup) { event.preventDefault(); this.selectedGroup = 0; this.refreshStatus(); this._syncPanel(); this._ghostChanged(); }
        else if (key === 'escape' && this.mode !== 'place') { event.preventDefault(); this.setMode('place'); }
    }

    undo() { this._endGesture(); this._swap(this.undoStack, this.redoStack); this.syncHistoryButtons(); }
    redo() { this._endGesture(); this._swap(this.redoStack, this.undoStack); this.syncHistoryButtons(); }

    /**
     * Ctrl+Z or Ctrl+Y in the middle of a drag (a stroke, a Ctrl-rectangle, a piece or a handle
     * carried): the drag ends there as its own undo step, so the undo takes back the drag and
     * not the edit before it, and the rest of the drag does nothing.
     */
    _endGesture() {
        if (this._stroke) this.endStroke();
        else window.reactor?.mapEditor3D?.endPieceDrag?.();
    }

    /** An edit made while pieces are carried (R, Delete, a paste): the carry so far becomes its own step first, so the steps stay in order. */
    _settleCarry() { window.reactor?.mapEditor3D?.endPieceDrag?.(undefined, { carryOn: true }); }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }
    /** The toolbar's Undo and Redo follow the builder's history while it is up, the map editor's otherwise. */
    syncHistoryButtons() {
        const ui = window.reactor?.uiManager;
        if (!ui?.updateUndoRedoButtons) return;
        if (this.active) ui.updateUndoRedoButtons(this.canUndo(), this.canRedo());
        else { const map = window.reactor?.mapEditor; ui.updateUndoRedoButtons(!!map?.canUndo?.(), !!map?.canRedo?.()); }
    }
    _swap(from, to) {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !from.length) return;
        const entry = from.pop();
        const whole = entry && !Array.isArray(entry) && entry.pieces;
        const ground = !!whole && 'terrain' in entry, effects = !!whole && entry.surfaces !== undefined, events = !!whole && entry.events !== undefined;
        const props = !!whole && entry.props !== undefined, allEvents = !!whole && entry.allEvents !== undefined;
        const back = whole ? this._snapshot(map, { ground, effects, events, props, allEvents }) : elevation.piecesSnapshot(map);
        // A step that knows the ground it left moves only the corners it levelled: terrain shaped since stays.
        const sealed = ground && entry.terrainAfter !== undefined;
        if (sealed) { back.terrain = entry.terrainAfter; back.terrainAfter = entry.terrain; }
        let water = null;
        if (whole && entry.water !== undefined && elevation.restoreWater) {
            water = PieceBuilderManager.mergeWater(elevation.waterSnapshot(map), JSON.parse(entry.water), entry.waterAfter !== undefined ? JSON.parse(entry.waterAfter) : undefined);
            back.waterAfter = JSON.stringify(water);
        }
        // The foliage a step cleared grows back on its undo and goes again on its redo.
        const F = (typeof RRMapFoliage !== 'undefined' && RRMapFoliage) || (typeof window !== 'undefined' && window.RRMapFoliage) || null;
        let foliageRegion;
        if (whole && F && entry.foliage) { F.uncover(map, entry.foliage); back.foliageRedo = entry.foliage; foliageRegion = F.clearedRegion(map, entry.foliage); }
        else if (whole && F && entry.foliageRedo) { F.recover(map, entry.foliageRedo); back.foliage = entry.foliageRedo; foliageRegion = F.clearedRegion(map, entry.foliageRedo); }
        to.push(back);
        elevation.restorePieces(map, whole ? entry.pieces : entry);
        // Models the edit pushed aside go back where they stood (unless moved since), and aside again on a redo;
        // a step that kept every model puts them all back as they were.
        if (whole && entry.props !== undefined) {
            const sidecar = map.reactor3d || (map.reactor3d = { version: 1 });
            const props = JSON.parse(entry.props);
            if (props) sidecar.props = props; else delete sidecar.props;
            window.reactor?.modelPropsManager?.render?.();
        } else if (whole && entry.propMoves?.length) {
            for (const move of entry.propMoves) {
                const prop = elevation.propById(map, move.id);
                if (prop && prop.x === move.to[0] && prop.y === move.to[1]) elevation.updateProp(map, move.id, { x: move.from[0], y: move.from[1] });
            }
            back.propMoves = entry.propMoves.map(move => ({ id: move.id, from: move.to, to: move.from }));
            window.reactor?.modelPropsManager?.render?.();
        }
        if (whole) {
            if (sealed) elevation.restoreTerrainChanges(map, entry.terrainAfter, entry.terrain);
            else if (ground) { if (entry.terrain) elevation.restoreTerrain(map, entry.terrain); else elevation.clearTerrain(map); }
            if (water) elevation.restoreWater(map, water);
            elevation.restoreStructures(map, entry.structures);
            if (effects) {
                const sidecar = map.reactor3d || (map.reactor3d = { version: 1 });
                const surfaces = JSON.parse(entry.surfaces), lights = JSON.parse(entry.lights);
                if (surfaces) sidecar.mediaSurfaces = surfaces; else delete sidecar.mediaSurfaces;
                if (lights) sidecar.lights = lights; else delete sidecar.lights;
                this._effectsChanged();
            }
            if (allEvents) { map.events = JSON.parse(entry.allEvents); this._eventsChanged = true; }
            else if (events) this._restoreStructureEvents(map, JSON.parse(entry.events));
        }
        this._pruneSelection();
        this.announce(ground); this.refreshStatus(); this._syncPanel();
        if (foliageRegion !== undefined && typeof window !== 'undefined') window.reactor?.terrainManager?.announceFoliage?.(foliageRegion);
    }

    clear() {
        const map = this.currentMap(), elevation = this.elevation();
        if (!map || !elevation || !elevation.hasPieces(map)) return;
        // The building records go with the last piece: the undo brings them back too.
        this.undoStack.push(this._snapshot(map)); this.redoStack.length = 0;
        elevation.clearPieces(map);
        this._pruneSelection();
        this.announce(); this.refreshStatus(); this._syncPanel();
    }

    /** The pieces changed: the 3D view lays them down again in place, and the map is dirty. */
    announce(terrainToo = false, region = null) {
        this.render2D();
        this.syncHistoryButtons();
        // A step that levelled ground keeps the ground it left, for its undo (_swap).
        const top = terrainToo && this.undoStack[this.undoStack.length - 1];
        if (top && 'terrain' in top && top.terrainAfter === undefined) top.terrainAfter = this.elevation()?.terrainSnapshot(this.currentMap()) ?? null;
        const mapEditor = window.reactor?.mapEditor;
        if (typeof mapEditor?.onElevationChanged === 'function') mapEditor.onElevationChanged(this.currentMap());
        if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
        // A stamp levels the ground as well: the terrain goes first (in
        // place, the whole map), then the pieces are laid on it. `region`
        // is the cells an edit touched, so only their chunks are relaid.
        if (terrainToo) document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, terrain: true, region: null } }));
        // Ponds follow levelled ground as they follow a terrain stroke, and the pieces that hold them back.
        window.reactor?.terrainManager?.piecesChanged?.(terrainToo ? null : region);
        // And the ponds it left, so its undo gives back only what it took from them.
        if (top && 'water' in top && top.waterAfter === undefined) top.waterAfter = JSON.stringify(this.elevation()?.waterSnapshot?.(this.currentMap()) || []);
        document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id, pieces: true, region: region || null } }));
        // Events came or went with a building: the event tool and the 3D
        // view's markers are redrawn (a plain edit notice rebuilds the view).
        if (this._eventsChanged) {
            this._eventsChanged = false;
            window.reactor?.eventManager?.renderEvents?.();
            document.dispatchEvent(new CustomEvent('rr-map-edited', { detail: { mapId: this.currentMap()?.id } }));
        }
    }
}

if (typeof window !== 'undefined') window.PieceBuilderManager = PieceBuilderManager;
if (typeof module !== 'undefined' && module.exports) module.exports = PieceBuilderManager;
