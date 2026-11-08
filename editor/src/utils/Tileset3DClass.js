/**
 * Per-tile 3D classification, stored beside the database as `Tilesets.r3d.json`.
 *
 * Which tiles stand up and which lie flat cannot be derived from map data — a
 * shopfront wall and a cliff edge are both simply impassable, and guessing from
 * the flags produced facades fifty-one tiles tall on a real city map. So it is
 * authored, and because a tile is the same kind of thing wherever it is painted,
 * it is stored per tileset rather than per map.
 *
 * The file is additive: a project without one behaves exactly as it did, and the
 * runtime falls back to its flag heuristic for any tile left unclassified. The
 * class values mirror `Reactor3D.CLASS_*` in `runtime/reactor_3d.js`; a test
 * pins them together, since the editor cannot load the runtime module.
 */
(function(root) {
    const AUTO = 0;      // fall back to the runtime's heuristic
    const GROUND = 1;    // always lies flat
    const UPRIGHT = 2;   // part of a standing object
    const SCENERY = 3;   // raises the ground it sits on
    const FOLIAGE = 4;   // a cut-out per cell, over ground that stays flat
    const PANEL = 5;     // stands still, faces a way, has a little depth

    // Upright, scenery and foliage all rise off the floor, and the difference is
    // what a group of them means. A building is one picture spanning many cells,
    // so those cells collapse into a single cut-out as tall as the column. A
    // cliff or a mesa is a mass, so scenery lifts the ground and takes its faces
    // from the wall code. A forest is neither: it is one thing drawn over and
    // over, so foliage leaves the ground alone and stands a copy of the lone
    // variant on each cell.

    /** Shape 46 is the autotile shape with no neighbours — one lone cell. */
    const LONE_SHAPE = 46;

    const FILENAME = 'Tilesets.r3d.json';
    const VERSION = 1;

    const create = () =>
        ({ version: VERSION, tilesets: {}, standIns: {}, objects: {}, materials: {} });

    /**
     * The id a class is stored under.
     *
     * Autotiles occupy 48 consecutive ids — one per shape — but a shape is a
     * corner arrangement, not a different kind of thing, so a kind is
     * classified once at its base id and every shape reads that entry. Mirrors
     * `Reactor3D.classKey`; a test pins the two together.
     */
    const keyFor = tileId => {
        const id = Number(tileId);
        if (id >= 2048 && id < 8192) return 2048 + Math.floor((id - 2048) / 48) * 48;
        return id;
    };

    /**
     * Normalise whatever was on disk.
     *
     * A hand-edited or truncated file must not take the editor down, so anything
     * unrecognised degrades to "nothing is classified" rather than throwing.
     */
    const normalize = data => {
        if (!data || typeof data !== 'object' || !data.tilesets || typeof data.tilesets !== 'object') {
            return create();
        }
        const tilesets = {};
        for (const [tilesetId, tiles] of Object.entries(data.tilesets)) {
            if (!tiles || typeof tiles !== 'object') continue;
            const kept = {};
            for (const [tileId, value] of Object.entries(tiles)) {
                // Only the explicit classes are stored; AUTO is the absence of
                // an entry, so writing it would bloat the file for no reason.
                // Keys are folded to their autotile kind so a hand-written file
                // that named a shape is still read back by every shape.
                if (value === GROUND || value === UPRIGHT || value === SCENERY
                    || value === FOLIAGE || value === PANEL) {
                    kept[keyFor(tileId)] = value;
                }
            }
            if (Object.keys(kept).length > 0) tilesets[tilesetId] = kept;
        }

        // Stand-ins are only meaningful for B-E tiles: an autotile's lone
        // variant is shape 46 of its own kind, which needs no recording.
        const standIns = {};
        const source = data.standIns && typeof data.standIns === 'object' ? data.standIns : {};
        for (const [tilesetId, tiles] of Object.entries(source)) {
            if (!tiles || typeof tiles !== 'object') continue;
            const kept = {};
            for (const [tileId, value] of Object.entries(tiles)) {
                if (Number(tileId) >= 2048) continue;
                if (Number.isInteger(value) && value > 0) { kept[Number(tileId)] = value; continue; }
                if (Array.isArray(value) && Number.isInteger(value[0]) && value[0] > 0) {
                    kept[Number(tileId)] = [value[0], value[1] || 1, value[2] || 1];
                }
            }
            if (Object.keys(kept).length > 0) standIns[tilesetId] = kept;
        }
        // Declared objects, dropping anything malformed rather than throwing:
        // a hand-edited file must not take the editor down.
        const objects = {};
        const declared = data.objects && typeof data.objects === 'object' ? data.objects : {};
        for (const [tilesetId, list] of Object.entries(declared)) {
            if (!Array.isArray(list)) continue;
            const kept = [];
            for (const object of list) {
                if (!object || !isObjectOrigin(object.tile)) continue;
                const w = Math.max(1, Math.round(object.w || 1));
                const h = Math.max(1, Math.round(object.h || 1));
                const roles = String(object.roles || '')
                    .replace(/[^SF]/g, STAND).padEnd(w * h, STAND).slice(0, w * h);
                kept.push({ tile: Number(object.tile), w, h, roles });
            }
            if (kept.length > 0) objects[tilesetId] = kept;
        }
        // Per-tile materials: which art covers a face the tileset never drew as
        // one. Only `top` so far — the roof a raised wall is capped with, for
        // the sheets where it cannot be derived.
        const materials = {};
        const named = data.materials && typeof data.materials === 'object' ? data.materials : {};
        for (const [tilesetId, tiles] of Object.entries(named)) {
            if (!tiles || typeof tiles !== 'object') continue;
            const kept = {};
            for (const [tileId, value] of Object.entries(tiles)) {
                if (!value || typeof value !== 'object') continue;
                const top = Number(value.top);
                if (!Number.isInteger(top) || top <= 0) continue;
                kept[keyFor(tileId)] = { top: keyFor(top) };
            }
            if (Object.keys(kept).length > 0) materials[tilesetId] = kept;
        }
        return { version: VERSION, tilesets, standIns, objects, materials };
    };

    /**
     * Whether a tile is one of the sixteen-shape wall autotiles.
     *
     * A3 is walls throughout; A4 alternates roof rows and wall rows, eight
     * kinds to a row, odd rows being walls. Mirrors `Reactor3D.Geometry`'s
     * copy and the editor's; a test pins all three together.
     */
    const isWallLike = tileId => {
        const id = Number(tileId);
        if (!Number.isFinite(id)) return false;
        if (id >= 4352 && id < 5888) return true;
        if (id >= 5888 && id < 8192) {
            const kind = Math.floor((id - 5888) / 48);
            return Math.floor(kind / 8) % 2 === 1;
        }
        return false;
    };

    /** The art named for a tile's faces, or null. */
    const materialOf = (data, tilesetId, tileId) => {
        const tiles = data && data.materials && data.materials[tilesetId];
        return (tiles && tiles[keyFor(tileId)]) || null;
    };

    /**
     * Name the roof a wall kind is capped with, or clear it with 0.
     *
     * A4 pairs a roof with every wall by its own layout, so this is for the
     * sheets that do not — A3, which is walls throughout, and any tileset whose
     * author put the roof somewhere else.
     */
    const setTopFace = (data, tilesetId, tileId, topTileId) => {
        const store = data && data.tilesets ? data : create();
        if (!store.materials) store.materials = {};
        const key = String(tilesetId);
        const tile = keyFor(tileId);
        const top = Number(topTileId);
        if (!Number.isInteger(top) || top <= 0) {
            if (store.materials[key]) {
                delete store.materials[key][tile];
                if (Object.keys(store.materials[key]).length === 0) delete store.materials[key];
            }
            return store;
        }
        if (!store.materials[key]) store.materials[key] = {};
        store.materials[key][tile] = { top: keyFor(top) };
        return store;
    };

    const classOf = (data, tilesetId, tileId) => {
        const tiles = data && data.tilesets && data.tilesets[tilesetId];
        const value = tiles && tiles[keyFor(tileId)];
        return value === GROUND || value === UPRIGHT || value === SCENERY
            || value === FOLIAGE || value === PANEL
            ? value : AUTO;
    };

    /**
     * Set a tile's class, returning the same object for chaining.
     *
     * Setting AUTO deletes the entry, and an emptied tileset drops out
     * entirely, so clearing every tile leaves a file identical to a fresh one
     * rather than a husk of empty objects.
     */
    const setClass = (data, tilesetId, tileId, value) => {
        const store = data && data.tilesets ? data : create();
        const key = String(tilesetId);
        const tile = keyFor(tileId);
        if (value !== GROUND && value !== UPRIGHT && value !== SCENERY
            && value !== FOLIAGE && value !== PANEL) {
            if (store.tilesets[key]) {
                delete store.tilesets[key][tile];
                if (Object.keys(store.tilesets[key]).length === 0) delete store.tilesets[key];
            }
            return store;
        }
        if (!store.tilesets[key]) store.tilesets[key] = {};
        store.tilesets[key][tile] = value;
        return store;
    };

    /** Ground -> Upright -> Scenery -> Foliage -> Auto, the order the editor cycles. */
    const cycle = current => {
        if (current === AUTO) return GROUND;
        if (current === GROUND) return UPRIGHT;
        if (current === UPRIGHT) return SCENERY;
        if (current === SCENERY) return FOLIAGE;
        if (current === FOLIAGE) return PANEL;
        return AUTO;
    };

    /** How many tiles a tileset has classified, for a "needs attention" hint. */
    const countClassified = (data, tilesetId) => {
        const tiles = data && data.tilesets && data.tilesets[String(tilesetId)];
        return tiles ? Object.keys(tiles).length : 0;
    };

    // Empty only when no section holds anything: objects, roles (materials) and stand-ins are kept apart from the
    // tile classes, and work in them alone was never written while `tilesets` was empty.
    const hasEntries = section => !!section && typeof section === 'object' && Object.keys(section).length > 0;
    const isEmpty = data =>
        !data || !['tilesets', 'objects', 'materials', 'standIns'].some(key => hasEntries(data[key]));

    /**
     * The tile a foliage cut-out draws. Autotiles answer for themselves; a B-E
     * tile has to be pointed at its lone variant, and standing its own art up
     * is the fallback when nothing has been.
     */
    const standInOf = (data, tilesetId, tileId) => {
        const id = Number(tileId);
        if (id >= 2048 && id < 8192) return keyFor(id) + LONE_SHAPE;
        const tiles = data && data.standIns && data.standIns[tilesetId];
        const value = tiles && tiles[id];
        // Stored as [top-left tile, width, height]: a lone variant is usually
        // drawn over a block rather than a single cell.
        if (Array.isArray(value) && value[0] > 0) {
            return { tileId: value[0], w: value[1] || 1, h: value[2] || 1 };
        }
        return value > 0 ? value : id;
    };

    const setStandIn = (data, tilesetId, tileId, standIn) => {
        const store = data && data.tilesets ? data : create();
        if (!store.standIns) store.standIns = {};
        const key = String(tilesetId);
        const id = Number(tileId);
        const first = Array.isArray(standIn) ? standIn[0] : standIn;
        if (!(first > 0) || first === id) {
            if (store.standIns[key]) {
                delete store.standIns[key][id];
                if (Object.keys(store.standIns[key]).length === 0) delete store.standIns[key];
            }
            return store;
        }
        if (!store.standIns[key]) store.standIns[key] = {};
        store.standIns[key][id] = Array.isArray(standIn)
            ? [standIn[0], standIn[1] || 1, standIn[2] || 1]
            : standIn;
        return store;
    };

    /*
     * Declared objects: "these tiles are one thing".
     *
     * Which tiles belong to one object cannot be inferred reliably. Adjacency
     * on the sheet is the obvious guess and it cannot tell the last piece of
     * one picture from the first piece of the next: an ice mountain drawn in
     * columns 0-1 and a rock mountain in columns 2-3, painted side by side,
     * weld into a single four-wide object. And it says nothing at all about
     * autotile terrain, where every cell is legitimately its own tile.
     *
     * So an object is declared: a rectangle of the sheet, stored as its
     * top-left tile with a width and a height, and a role for each cell in it.
     * Roles are a flat string, `w * h` characters, row by row:
     *
     *   S  stands as part of the object's picture
     *   F  lies flat on the ground — a pad, an apron, a shadow
     *
     * Roles answer a different question from the tile's 3D class, which is why
     * they are separate: the class says what an unattached tile is, the role
     * says how a tile behaves within the object it belongs to.
     */
    const STAND = 'S';
    const FLAT = 'F';

    /**
     * Whether a tile is laid out as a plain grid of pictures.
     *
     * A5 is not an autotile despite living on the A tab: it is whole tiles in
     * an eight-wide grid, exactly like B-G, so it can be part of a declared
     * object. Only A1-A4 cannot — their ids encode a corner arrangement rather
     * than a position in a drawing.
     */
    /**
     * Whether a tile id can be *found* inside a declared object.
     *
     * Tile 0 is the engine's "no tile": an empty map cell reads as 0, so a
     * lookup for it must never match an object or every blank cell on the map
     * would belong to whatever sits at the top-left of the B sheet.
     */
    const isPictureTile = tileId => {
        const id = Number(tileId);
        return id > 0 && id < 2048;
    };

    /**
     * Whether a tile id can be the *corner* of a declared object.
     *
     * Wider than `isPictureTile` by exactly one value. Tile 0 is a real place
     * on the B sheet — its top-left cell — and an object anchored there works
     * for every other cell it covers; only that one cell can never be looked
     * up, which is correct, because a map cell holding 0 is empty. Refusing it
     * as an origin meant a large prop drawn into the corner of a sheet could
     * not be declared at all, and the attempt did nothing without saying why.
     */
    const isObjectOrigin = tileId => {
        const id = Number(tileId);
        return Number.isInteger(id) && id >= 0 && id < 2048;
    };

    /** Where a picture tile sits on its sheet, in whole tiles. */
    const sheetCell = tileId => {
        const id = Number(tileId);
        if (id >= 1536 && id < 2048) {
            const local = id - 1536;
            return { setNumber: 4, col: local % 8, row: Math.floor(local / 8) };
        }
        const local = id % 256;
        return {
            setNumber: 5 + Math.floor(id / 256),
            col: (Math.floor(local / 128) % 2) * 8 + (local % 8),
            row: Math.floor((local % 256) / 8) % 16
        };
    };

    /** The picture tile at a sheet position, or 0 off the sheet. */
    const tileAtCell = (setNumber, col, row) => {
        if (col < 0 || row < 0 || row > 15) return 0;
        // A5 is eight wide with no split; B-G is two half-sheets side by side.
        if (setNumber === 4) return col > 7 ? 0 : 1536 + row * 8 + col;
        if (col > 15) return 0;
        return (setNumber - 5) * 256 + (col >= 8 ? 128 : 0) + row * 8 + (col % 8);
    };

    const objectList = (data, tilesetId) =>
        (data && data.objects && data.objects[String(tilesetId)]) || [];

    /**
     * The declared object a tile belongs to, with the tile's place in it.
     *
     * Returns `{ object, dc, dr, role }`, or null when the tile is unattached.
     * Autotiles are excluded: their id encodes a corner arrangement rather than
     * a position in a drawing, so a rectangle of the sheet means nothing there.
     */
    const objectAt = (data, tilesetId, tileId) => {
        const id = Number(tileId);
        if (!isPictureTile(id)) return null;
        const here = sheetCell(id);
        for (const object of objectList(data, tilesetId)) {
            const origin = sheetCell(object.tile);
            if (origin.setNumber !== here.setNumber) continue;
            const dc = here.col - origin.col;
            const dr = here.row - origin.row;
            if (dc < 0 || dr < 0 || dc >= object.w || dr >= object.h) continue;
            const roles = object.roles || '';
            const role = roles[dr * object.w + dc] === FLAT ? FLAT : STAND;
            return { object, dc, dr, role };
        }
        return null;
    };

    /** How a tile behaves inside its object; STAND for anything unattached. */
    const roleOf = (data, tilesetId, tileId) => {
        const found = objectAt(data, tilesetId, tileId);
        return found ? found.role : STAND;
    };

    /**
     * Declare the rectangle from `tile` as one object, replacing any declaration
     * overlapping it so a tile never belongs to two things at once.
     */
    const defineObject = (data, tilesetId, tile, w, h, roles) => {
        const store = data && data.tilesets ? data : create();
        if (!isObjectOrigin(tile)) return store;
        if (!store.objects) store.objects = {};
        const key = String(tilesetId);
        const width = Math.max(1, Math.round(w));
        const height = Math.max(1, Math.round(h));
        const origin = sheetCell(tile);
        // Overlap is a question about rectangles on a sheet, so it is asked
        // that way. Comparing the tile ids they cover could not tell a real
        // tile 0 — the top-left of the B sheet — from the 0 `tileAtCell`
        // returns for a cell off the edge of the sheet.
        const kept = (store.objects[key] || []).filter(object => {
            const other = sheetCell(object.tile);
            if (other.setNumber !== origin.setNumber) return true;
            const overlaps = other.col < origin.col + width
                && other.col + object.w > origin.col
                && other.row < origin.row + height
                && other.row + object.h > origin.row;
            return !overlaps;
        });
        const filled = (roles || '').padEnd(width * height, STAND).slice(0, width * height);
        kept.push({ tile: Number(tile), w: width, h: height, roles: filled });
        store.objects[key] = kept;
        return store;
    };

    /** Remove whatever object a tile belongs to. */
    const clearObject = (data, tilesetId, tileId) => {
        const store = data && data.tilesets ? data : create();
        const key = String(tilesetId);
        const found = objectAt(store, tilesetId, tileId);
        if (!found) return store;
        store.objects[key] = objectList(store, tilesetId).filter(o => o !== found.object);
        if (store.objects[key].length === 0) delete store.objects[key];
        return store;
    };

    /** Flip one cell of an object between standing and lying flat. */
    const cycleRole = (data, tilesetId, tileId) => {
        const found = objectAt(data, tilesetId, tileId);
        if (!found) return data;
        const { object, dc, dr } = found;
        const index = dr * object.w + dc;
        const roles = object.roles.split('');
        roles[index] = roles[index] === FLAT ? STAND : FLAT;
        object.roles = roles.join('');
        return data;
    };

    /**
     * Forget everything said about one tile.
     *
     * Erase used to remove a tile from its declared object and nothing else,
     * so a tile classified Upright, given a stand-in or paired with a roof
     * kept all of it with no way back short of editing the file. Clearing is
     * one idea — "this tile has no 3D information" — and it needs one action.
     *
     * Reports whether anything was actually forgotten, so the editor can say
     * so rather than claiming a clear it did not perform.
     */
    const clearTile = (data, tilesetId, tileId) => {
        const store = data && data.tilesets ? data : create();
        // Read the store rather than the accessors. The accessors answer with
        // derived facts as well as authored ones — an A4 wall is paired with
        // the roof its sheet layout implies, a tile with no stand-in stands in
        // for itself — so asking them reported untouched autotiles as carrying
        // information, and Clear claimed to remove what was never there.
        const key = String(tilesetId);
        const tile = keyFor(tileId);
        const stored = (group, at) => {
            const forTileset = store[group] && store[group][key];
            return !!forTileset && forTileset[at] !== undefined;
        };
        const had = stored('tilesets', tile)
            || stored('standIns', Number(tileId))
            || stored('materials', tile)
            || !!objectAt(store, tilesetId, tileId);
        setClass(store, tilesetId, tileId, AUTO);
        setStandIn(store, tilesetId, tileId, 0);
        setTopFace(store, tilesetId, tileId, 0);
        clearObject(store, tilesetId, tileId);
        return had;
    };

    const api = {
        AUTO, GROUND, UPRIGHT, SCENERY, FOLIAGE, PANEL, LONE_SHAPE, FILENAME, VERSION,
        STAND, FLAT,
        create, normalize, keyFor, classOf, setClass, cycle, countClassified, isEmpty,
        standInOf, setStandIn,
        materialOf, setTopFace, isWallLike,
        sheetCell, tileAtCell, isPictureTile, isObjectOrigin, objectList, objectAt, roleOf,
        defineObject, clearObject, cycleRole, clearTile
    };
    root.RRTileset3DClass = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
