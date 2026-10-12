/**
 * StructurePlan - a building described the way a person describes one.
 *
 * A plan names rooms as rectangles on a grid, says which rooms connect and
 * how wide the opening is, where the stairs run, and what the roof does.
 * From that the walls are whatever is left between rooms, every door is
 * centred on the wall the two rooms share, windows are spaced along the
 * outside walls where no door is, the stairwell is left open in the floor
 * above, and the roof steps up from each eave. The result is a list of
 * pieces (`RRMapElevation.setPiece` records) at a map position.
 *
 * Written to be read and written by hand and by a generator alike:
 *
 *   {
 *     "name": "Manor", "size": [48, 32], "storey": 5,
 *     "materials": { "wall": "Stone", "inner": "Plaster", "floor": "Wood", "wet": "Stone", "roof": "RoofTile", "stair": "Wood" },
 *     "floors": [
 *       { "rooms": { "hall": [18, 20, 29, 30], "living": [1, 17, 16, 30] },
 *         "doors": [["hall", "outside", 4], ["hall", "living", 2]],
 *         "wet": ["bath", "kitchen"] },
 *       { "rooms": { ... }, "doors": [ ... ] }
 *     ],
 *     "stairs": [{ "floor": 0, "from": [27, 29], "dir": "north", "width": 2 }],
 *     "roof": { "pitch": 6 },
 *     "windows": { "every": 6, "width": 2 }
 *   }
 *
 * Rooms are [x0, y0, x1, y1], inclusive, in the plan's own cells; walls
 * are the cells no room claims, so leave one cell between rooms and one
 * around the outside. "outside" as a door's other room is the outer wall.
 * `validate` walks the built plan with the engine's own passability from
 * outside the front door and says which rooms it reached.
 *
 * The roof is a gable unless `roof.style` says `"flat"` (a parapet round a
 * flat top) or `"shed"` (one slope, `pitch` levels up to the side `high`
 * names: north, south, east or west).
 */
(function(root) {
    'use strict';

    // dx, dy, and the stair's quarter turns: rot 0 rises south, each turn is clockwise seen from above, so 1 rises west, 2 north, 3 east.
    const DIRS = { north: [0, -1, 2], south: [0, 1, 0], west: [-1, 0, 1], east: [1, 0, 3] };

    const inRoom = (rect, x, y) => x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
    /** A cell no room claims that touches a room, even at a corner: where a wall stands. */
    function isWallCell(rooms, size, x, y) {
        if (x < 0 || y < 0 || x >= size[0] || y >= size[1] || roomAt(rooms, x, y)) return false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && roomAt(rooms, x + dx, y + dy)) return true;
        return false;
    }
    /** A wall cell with open ground or the page's edge on one of its four sides: the building's outside. */
    function isOuterWallCell(rooms, size, x, y) {
        if (!isWallCell(rooms, size, x, y)) return false;
        for (const [dx, dy] of Object.values(DIRS)) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size[0] || ny >= size[1]) return true;
            if (!roomAt(rooms, nx, ny) && !isWallCell(rooms, size, nx, ny)) return true;
        }
        return false;
    }
    /** An outer wall cell with a room straight behind it: where a window can look out. */
    function canWindow(rooms, size, x, y) {
        return isOuterWallCell(rooms, size, x, y) && Object.values(DIRS).some(([dx, dy]) => roomAt(rooms, x + dx, y + dy));
    }
    /**
     * The bounds of each building on a floor: rooms whose walls touch are one
     * building and share a roof; rooms with open ground between them are two.
     * Empty with no rooms.
     */
    function buildingBoxes(rooms, size) {
        const rects = Object.values(rooms || {}).filter(Array.isArray);
        if (!rects.length) return [];
        // Each room's box with its walls; boxes that overlap or touch merge until none do.
        let boxes = rects.map(r => [Math.max(0, r[0] - 1), Math.max(0, r[1] - 1), Math.min(size[0] - 1, r[2] + 1), Math.min(size[1] - 1, r[3] + 1)]);
        for (let merged = true; merged;) {
            merged = false;
            for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j];
                if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
                boxes[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
                boxes.splice(j, 1); merged = true; break;
            }
        }
        return boxes;
    }
    /** The bounds of all of a floor's rooms and their walls together, or null with no rooms. */
    function buildingBox(rooms, size) {
        const boxes = buildingBoxes(rooms, size);
        if (!boxes.length) return null;
        return [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
    }
    const roomAt = (rooms, x, y) => {
        for (const name of Object.keys(rooms)) if (inRoom(rooms[name], x, y)) return name;
        return null;
    };

    /**
     * The wall between two rooms (or a room and the outside): every cell of
     * the gap between them, however thick the wall is, ordered along the
     * wall and then through it. Rooms are neighbours when the gap between
     * them holds no other room.
     */
    function sharedWall(rooms, size, a, b, side = null) {
        const A = rooms[a];
        if (!A) return [];
        const [W, H] = size;
        const clear = (x0, y0, x1, y1) => !Object.keys(rooms).some(name => { const r = rooms[name]; return !(r[2] < x0 || r[0] > x1 || r[3] < y0 || r[1] > y1); });
        const column = (x0, x1, y0, y1) => { const cells = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push([x, y]); return cells; };
        const row = (y0, y1, x0, x1) => { const cells = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) cells.push([x, y]); return cells; };
        if (b === 'outside') {
            // The one wall beside the room on the side the door names, or else the first
            // side that faces open ground: south, north, east, west.
            const faces = (cells, dx, dy) => cells.some(([x, y]) => x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || (!roomAt(rooms, x + dx, y + dy) && !isWallCell(rooms, size, x + dx, y + dy)));
            const strip = (cells, dx, dy) => cells.length && cells.every(([x, y]) => isWallCell(rooms, size, x, y)) && faces(cells, dx, dy) ? cells : null;
            const sides = {
                south: () => A[3] < H - 1 && strip(row(A[3] + 1, A[3] + 1, A[0], A[2]), 0, 1),
                north: () => A[1] > 0 && strip(row(A[1] - 1, A[1] - 1, A[0], A[2]), 0, -1),
                east: () => A[2] < W - 1 && strip(column(A[2] + 1, A[2] + 1, A[1], A[3]), 1, 0),
                west: () => A[0] > 0 && strip(column(A[0] - 1, A[0] - 1, A[1], A[3]), -1, 0),
            };
            if (sides[side]) return sides[side]() || [];
            return sides.south() || sides.north() || sides.east() || sides.west() || [];
        }
        const B = rooms[b];
        if (!B) return [];
        const yLo = Math.max(A[1], B[1]), yHi = Math.min(A[3], B[3]);
        const xLo = Math.max(A[0], B[0]), xHi = Math.min(A[2], B[2]);
        if (yLo <= yHi) {
            const left = A[2] < B[0] ? A : B, right = left === A ? B : A;
            if (right[0] - left[2] >= 2 && clear(left[2] + 1, yLo, right[0] - 1, yHi)) return column(left[2] + 1, right[0] - 1, yLo, yHi);
        }
        if (xLo <= xHi) {
            const top = A[3] < B[1] ? A : B, bottom = top === A ? B : A;
            if (bottom[1] - top[3] >= 2 && clear(xLo, top[3] + 1, xHi, bottom[1] - 1)) return row(top[3] + 1, bottom[1] - 1, xLo, xHi);
        }
        return [];
    }

    /**
     * A door's wall and the axis it runs along: `alongX` when the wall is a
     * row, and the sorted positions along it. Null when the rooms share no wall.
     */
    function doorWall(rooms, size, door) {
        const wall = sharedWall(rooms, size, door[0], door[1], door[4]);
        if (!wall.length) return null;
        const xs = new Set(wall.map(c => c[0])), ys = new Set(wall.map(c => c[1]));
        const alongX = xs.size >= ys.size;
        return { wall, alongX, along: Array.from(alongX ? xs : ys).sort((p, q) => p - q) };
    }

    /**
     * The door cells: `width` cells along the wall, through its whole
     * thickness, centred on the wall unless the door says where: a fourth
     * entry is the position along the wall (the x of a row, the y of a
     * column) the door is centred on, clamped so the whole door stays in
     * the wall.
     */
    function doorCells(rooms, size, door) {
        const found = doorWall(rooms, size, door);
        if (!found) return [];
        const { wall, alongX, along } = found;
        // Three cells (1.8 m) unless the plan says: a doorway a character
        // walks through without brushing the posts.
        const w = Math.max(1, Math.min(along.length, Number(door[2]) || 3));
        let start = Math.floor((along.length - w) / 2);
        if (Number.isFinite(Number(door[3])) && door[3] !== null && door[3] !== undefined) {
            const at = Number(door[3]);
            let nearest = 0;
            for (let i = 1; i < along.length; i++) if (Math.abs(along[i] - at) < Math.abs(along[nearest] - at)) nearest = i;
            start = Math.max(0, Math.min(along.length - w, nearest - Math.floor(w / 2)));
        }
        const chosen = new Set(along.slice(start, start + w));
        return wall.filter(c => chosen.has(alongX ? c[0] : c[1]));
    }

    /** A door entry's own settings: its last element when that is an object (`false` there: no door, an open doorway). */
    function doorOptions(door) {
        const last = door[door.length - 1];
        return last === false || (last && typeof last === 'object' && !Array.isArray(last)) ? last : null;
    }

    /**
     * The door that hangs in a door's cells: a `door` piece on the first cell
     * along its front's across (as the runtime reads a door's `width`), facing
     * the outside (or the second room), one row of the wall's thickness (the
     * outer row of an outside wall). Null for an open doorway.
     */
    function doorPiece(rooms, size, door, defaults) {
        const own = doorOptions(door);
        if (own === false || defaults === false) return null;
        const found = doorWall(rooms, size, door);
        const cells = doorCells(rooms, size, door);
        if (!found || !cells.length) return null;
        const outside = door[0] === 'outside' || door[1] === 'outside';
        const inner = door[0] === 'outside' ? door[1] : door[0], other = door[0] === 'outside' ? door[0] : door[1];
        const rows = Array.from(new Set(cells.map(c => (found.alongX ? c[1] : c[0])))).sort((a, b) => a - b);
        // Which side is the front: the open ground for an outside door, else the second room.
        const sideOf = (row, sign) => {
            const probe = cells.filter(c => (found.alongX ? c[1] : c[0]) === row).map(([x, y]) => (found.alongX ? [x, y + sign] : [x + sign, y]));
            if (outside) return probe.some(([x, y]) => x < 0 || y < 0 || x >= size[0] || y >= size[1] || (!roomAt(rooms, x, y) && !isWallCell(rooms, size, x, y)));
            return probe.some(([x, y]) => roomAt(rooms, x, y) === other);
        };
        let sign = 1, row = rows[rows.length - 1];
        if (sideOf(rows[0], -1)) { sign = -1; row = rows[0]; } else if (!sideOf(rows[rows.length - 1], 1)) row = rows[Math.floor(rows.length / 2)];
        if (!outside) row = rows[Math.floor(rows.length / 2)];
        const rot = found.alongX ? (sign > 0 ? 0 : 2) : (sign > 0 ? 3 : 1);
        const run = cells.filter(c => (found.alongX ? c[1] : c[0]) === row).sort((a, b) => (found.alongX ? a[0] - b[0] : a[1] - b[1]));
        // The first cell along the door's across: east for a south face, south for a west face, west for north, north for east.
        const anchor = rot === 0 || rot === 1 ? run[0] : run[run.length - 1];
        const fields = Object.assign({ style: outside ? 'plank' : 'panelled', opens: 'auto' }, defaults || {}, own || {});
        const piece = { x: anchor[0], y: anchor[1], rot, width: run.length };
        for (const key of ['style', 'hinge', 'swing', 'opens', 'lock', 'message', 'sound', 'tag']) if (fields[key] !== undefined) piece[key] = fields[key];
        void inner;
        return piece;
    }

    /** The way a window looks out: the side of its cell with open ground, as a quarter turn (0 south, 1 west, 2 north, 3 east). */
    function windowRot(rooms, size, x, y) {
        for (const [name, [dx, dy, rot]] of Object.entries(DIRS)) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size[0] || ny >= size[1] || (!roomAt(rooms, nx, ny) && !isWallCell(rooms, size, nx, ny))) { void name; return rot; }
        }
        return 0;
    }

    /**
     * A plan may be made of other plans: `parts: [{ plan, at: [x, y], rot }]`
     * name sibling files, so a hamlet is three cottages and an inn on one
     * page, and a city is districts of hamlets. `paths: [[x0, y0, x1, y1]]`
     * are paved strips (floor slabs, the `path` material). `spots: { name:
     * [x, y] }` are named places a story can refer to later — the inn's
     * counter, the well. `resolve(name)` hands back a named plan's object;
     * the editor and the CLI read `3d/Structures/<name>`.
     */
    function build(plan, X0 = 0, Y0 = 0, firstId = 1, group = 0, resolve = null) {
        const pieces = buildOwn(plan, X0, Y0, firstId, group);
        let id = pieces.reduce((m, piece) => Math.max(m, piece.id), firstId - 1) + 1;
        const M = Object.assign({ path: '' }, plan.materials || {});
        for (const strip of plan.paths || []) {
            const x0 = Math.min(strip[0], strip[2]), x1 = Math.max(strip[0], strip[2]), y0 = Math.min(strip[1], strip[3]), y1 = Math.max(strip[1], strip[3]);
            for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
                const piece = { id: id++, kind: 'floor', x: X0 + x, y: Y0 + y, z: 0, rot: 0, material: strip[4] || M.path || '' };
                if (group > 0) piece.group = group;
                pieces.push(piece);
            }
        }
        for (const part of plan.parts || []) {
            const inner = typeof resolve === 'function' ? resolve(part.plan) : null;
            if (!inner) continue;
            const shaped = transform(inner, part.rot || 0, part.scale || 1, resolve);
            // A part wears what it is told: its own materials over the plan's, so one
            // cottage plan stands as stone here and timber there.
            if (part.materials && typeof part.materials === 'object') shaped.materials = Object.assign({}, shaped.materials || {}, part.materials);
            const built = build(shaped, X0 + (part.at ? part.at[0] : 0), Y0 + (part.at ? part.at[1] : 0), id, group, resolve);
            for (const piece of built) pieces.push(piece);
            id = pieces.reduce((m, piece) => Math.max(m, piece.id), id) + 1;
        }
        return pieces;
    }

    /** Every named spot of a plan and its parts, in map cells for a stamp at (X0, Y0). */
    function spots(plan, X0 = 0, Y0 = 0, resolve = null, out = {}) {
        for (const [name, at] of Object.entries(plan.spots || {})) out[name] = [X0 + at[0], Y0 + at[1]];
        for (const part of plan.parts || []) {
            const inner = typeof resolve === 'function' ? resolve(part.plan) : null;
            if (!inner) continue;
            const shaped = transform(inner, part.rot || 0, part.scale || 1, resolve);
            const prefix = part.name ? part.name + '.' : '';
            const own = spots(shaped, X0 + (part.at ? part.at[0] : 0), Y0 + (part.at ? part.at[1] : 0), resolve, {});
            for (const [name, at] of Object.entries(own)) out[prefix + name] = at;
        }
        return out;
    }

    /**
     * The events a plan asks for, with its parts' prefixed: `events:
     * [{ spot, name, template, direction }]`. `template` names a file under
     * `3d/Structures/events` holding an ordinary RPG Maker event (its pages
     * are what matter; id, x and y are ignored). Each comes back with the
     * spot's map cell and a `key` (`part.spot`) that names it on the map.
     */
    function eventsOf(plan, X0 = 0, Y0 = 0, resolve = null, prefix = '', out = []) {
        const places = spots(plan, X0, Y0, null, {});
        for (const wanted of plan.events || []) {
            const at = places[wanted.spot];
            if (!at) continue;
            out.push({ key: prefix + wanted.spot, name: wanted.name || wanted.spot, template: wanted.template || '', direction: Number(wanted.direction) || 2, at: [at[0], at[1]] });
        }
        for (const part of plan.parts || []) {
            const inner = typeof resolve === 'function' ? resolve(part.plan) : null;
            if (!inner) continue;
            eventsOf(transform(inner, part.rot || 0, part.scale || 1, resolve), X0 + (part.at ? part.at[0] : 0), Y0 + (part.at ? part.at[1] : 0), resolve, prefix + (part.name ? part.name + '.' : ''), out);
        }
        return out;
    }

    /**
     * A plan's effects, the way the 3D Models page attaches them to a model:
     * `effects: [{ name, type, at: [x, y], z, facing, ... }]`, `type` one of
     * `screen` (a media surface on a wall: `media` a movie or picture,
     * `width`/`height` in tiles), `light` (`color`, `radius`, `intensity`)
     * or `animation` (a database `animation` id, played over and over).
     * Listed in map cells for a stamp at (X0, Y0), parts' effects prefixed.
     */
    function effectsOf(plan, X0 = 0, Y0 = 0, resolve = null, prefix = '', out = []) {
        // A built structure's lights and screens, as the map had them, moved to the stamp.
        for (const row of plan.lights || []) if (row) out.push({ type: 'mapLight', row, key: prefix + 'light', at: [X0 + Math.floor(Number(row.x) || 0), Y0 + Math.floor(Number(row.y) || 0)], shift: [X0, Y0] });
        for (const row of plan.surfaces || []) if (row) out.push({ type: 'mapSurface', row, key: prefix + 'screen', at: [X0 + Math.floor(Number(row.x) || 0), Y0 + Math.floor(Number(row.y) || 0)], shift: [X0, Y0] });
        // Its placed models (cell coordinates, as the map's props) and the water standing in it (a sheet's box and mask, its level above the pad).
        for (const row of plan.props || []) if (row && row.name) out.push({ type: 'mapProp', row, key: prefix + 'prop', at: [X0 + Math.round(Number(row.x) || 0), Y0 + Math.round(Number(row.y) || 0)], shift: [X0, Y0] });
        for (const row of plan.water || []) if (row) out.push({ type: 'mapWater', row, key: prefix + 'water', at: [X0 + (Math.floor(Number(row.x0)) || 0), Y0 + (Math.floor(Number(row.y0)) || 0)], shift: [X0, Y0] });
        for (const fx of plan.effects || []) {
            if (!fx || !Array.isArray(fx.at)) continue;
            out.push(Object.assign({}, fx, { key: prefix + (fx.name || 'effect'), at: [X0 + fx.at[0], Y0 + fx.at[1]] }));
        }
        for (const part of plan.parts || []) {
            const inner = typeof resolve === 'function' ? resolve(part.plan) : null;
            if (!inner) continue;
            effectsOf(transform(inner, part.rot || 0, part.scale || 1, resolve), X0 + (part.at ? part.at[0] : 0), Y0 + (part.at ? part.at[1] : 0), resolve, prefix + (part.name ? part.name + '.' : ''), out);
        }
        return out;
    }

    const FACING_YAW = { south: 0, east: 90, north: 180, west: 270 };
    /**
     * Put a stamp's effects on the map: screens as media-surface rows and
     * lights as map lights, each marked with the group so a re-stamp or a
     * removal takes only its own; animations come back as event requests
     * for `placeEvents`, each a parallel event that shows its animation on
     * itself again and again.
     */
    /**
     * Whether a light is a stamped building's: marked with the group's number (`structure`), or, on a map
     * stamped before lights carried that mark, tagged with it. The tag is the author's to change.
     */
    const STRUCTURE_TAG = /^structure:\d+$/;
    function ownsLight(light, group) {
        return !!light && (Number(light.structure) === group || light.tag === 'structure:' + group);
    }

    function placeEffects(mapData, group, wanted) {
        if (!mapData) return [];
        const sidecar = mapData.reactor3d || (mapData.reactor3d = { version: 1 });
        sidecar.mediaSurfaces = (Array.isArray(sidecar.mediaSurfaces) ? sidecar.mediaSurfaces : []).filter(row => !(row && row.structure === group));
        sidecar.lights = (Array.isArray(sidecar.lights) ? sidecar.lights : []).filter(light => !ownsLight(light, group));
        if (Array.isArray(sidecar.props)) sidecar.props = sidecar.props.filter(prop => !(prop && Number(prop.structure) === group));
        if (Array.isArray(sidecar.water)) sidecar.water = sidecar.water.filter(sheet => !(sheet && Number(sheet.structure) === group));
        return addEffects(mapData, wanted, group);
    }

    /**
     * Put effects on the map as they are: screens as media-surface rows,
     * lights as map lights, marked with `group` when there is one (a
     * building's), plain when placed by hand. Animations come back as event
     * requests for `placeEvents`.
     */
    function addEffects(mapData, wanted, group) {
        if (!mapData) return [];
        const sidecar = mapData.reactor3d || (mapData.reactor3d = { version: 1 });
        const tag = group ? 'structure:' + group : '';
        const surfaces = Array.isArray(sidecar.mediaSurfaces) ? sidecar.mediaSurfaces : [];
        const lights = Array.isArray(sidecar.lights) ? sidecar.lights : [];
        const props = Array.isArray(sidecar.props) ? sidecar.props : [];
        const water = Array.isArray(sidecar.water) ? sidecar.water : [];
        const events = [];
        let nextProp = props.reduce((m, row) => Math.max(m, Number(row && row.id) || 0), 0) + 1;
        let nextSurface = surfaces.reduce((m, row) => Math.max(m, Number(row && row.id) || 0), 0) + 1;
        let nextLight = lights.length + 1;
        for (const fx of wanted) {
            const [x, y] = fx.at;
            if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) continue;
            const z = Number(fx.z) || 0;
            if (fx.type === 'mapSurface') {
                const row = Object.assign(JSON.parse(JSON.stringify(fx.row)), { id: nextSurface++, x: Number(fx.row.x) + fx.shift[0], y: Number(fx.row.y) + fx.shift[1] });
                if (group) row.structure = group; else delete row.structure;
                surfaces.push(row);
                continue;
            }
            if (fx.type === 'mapProp') {
                const row = Object.assign(JSON.parse(JSON.stringify(fx.row)), { id: nextProp++, x: Number(fx.row.x) + fx.shift[0], y: Number(fx.row.y) + fx.shift[1] });
                if (group) row.structure = group; else delete row.structure;
                props.push(row);
                continue;
            }
            if (fx.type === 'mapWater') {
                // The sheet's level is above the pad it was saved on: `base` is the pad's height where it is stamped.
                const base = Number(fx.base) || 0, [sx, sy] = fx.shift, from = fx.row;
                const row = Object.assign(JSON.parse(JSON.stringify(from)), { x0: Number(from.x0) + sx, y0: Number(from.y0) + sy, x1: Number(from.x1) + sx, y1: Number(from.y1) + sy, level: Math.round(((Number(from.level) || 0) + base) * 100) / 100 });
                if (Array.isArray(from.path)) row.path = from.path.map(p => [Number(p[0]) + sx, Number(p[1]) + sy, Math.round(((Number(p[2]) || 0) + base) * 100) / 100]);
                if (group) row.structure = group; else delete row.structure;
                water.push(row);
                continue;
            }
            if (fx.type === 'mapLight') {
                while (lights.some(l => l && l.id === 'light' + nextLight)) nextLight++;
                // A tag the plan's light was given is its own; without one it answers to the building's.
                const own = fx.row.tag && !STRUCTURE_TAG.test(String(fx.row.tag)) ? String(fx.row.tag) : tag;
                lights.push(Object.assign(JSON.parse(JSON.stringify(fx.row)), { id: 'light' + nextLight++, x: Number(fx.row.x) + fx.shift[0], y: Number(fx.row.y) + fx.shift[1], tag: own }, group ? { structure: group } : {}));
                continue;
            }
            if (fx.type === 'screen') {
                const [dx, dy] = DIRS[fx.facing] || DIRS.south;
                const w = Number(fx.width) > 0 ? Number(fx.width) : 4, h = Number(fx.height) > 0 ? Number(fx.height) : 2.25;
                const row = { id: nextSurface++, target: 'map', movie: String(fx.media || ''), x: x + 0.5 + dx * 0.52, y: y + 0.5 + dy * 0.52, z,
                    width: Math.round(w * 48), height: Math.round(h * 48), rotationX: 0, rotationY: FACING_YAW[fx.facing] || 0, rotationZ: 0, scaleX: 1, scaleY: 1,
                    opacity: 255, loop: true, muted: fx.audio !== true, volume: 100, playbackRate: 1, layer: 3, depth: 0, cullingDistance: 0, scanlines: Number(fx.scanlines) || 0, wait: false };
                if (group) row.structure = group;
                surfaces.push(row);
            } else if (fx.type === 'light') {
                while (lights.some(l => l && l.id === 'light' + nextLight)) nextLight++;
                lights.push({ id: 'light' + nextLight++, type: 'point', x: x + 0.5, y: y + 0.5, height: Math.round(z * 100) / 100, yaw: 0, pitch: 0,
                    radius: Number(fx.radius) > 0 ? Number(fx.radius) : 6, angle: 70, width: 0.08, color: String(fx.color || '#9fd8ff'), intensity: Number.isFinite(Number(fx.intensity)) ? Number(fx.intensity) : 1.2,
                    occlude: true, shadow: false, on: true, body: false, tag, attach: null, flicker: 0, pulse: null, ...(group ? { structure: group } : {}) });
            } else if (fx.type === 'animation' && Number(fx.animation) > 0) {
                events.push({ key: fx.key, name: fx.name || 'effect', template: '', direction: 2, at: [x, y], animation: Math.floor(Number(fx.animation)) });
            }
        }
        if (surfaces.length) sidecar.mediaSurfaces = surfaces; else delete sidecar.mediaSurfaces;
        if (lights.length) sidecar.lights = lights; else delete sidecar.lights;
        if (props.length) sidecar.props = props; else delete sidecar.props;
        if (water.length) sidecar.water = water; else delete sidecar.water;
        return events;
    }

    /** Take a group's screens and lights off the map; its animation events go with `removeGroupEvents`. */
    function removeGroupEffects(mapData, group) {
        const sidecar = mapData && mapData.reactor3d;
        if (!sidecar) return false;
        let changed = false;
        if (Array.isArray(sidecar.mediaSurfaces)) { const kept = sidecar.mediaSurfaces.filter(row => !(row && row.structure === group)); changed = kept.length !== sidecar.mediaSurfaces.length; if (kept.length) sidecar.mediaSurfaces = kept; else delete sidecar.mediaSurfaces; }
        if (Array.isArray(sidecar.lights)) { const kept = sidecar.lights.filter(light => !ownsLight(light, group)); changed = changed || kept.length !== sidecar.lights.length; if (kept.length) sidecar.lights = kept; else delete sidecar.lights; }
        // Its placed models and water, marked with the group's number.
        for (const key of ['props', 'water']) {
            if (!Array.isArray(sidecar[key])) continue;
            const kept = sidecar[key].filter(row => !(row && Number(row.structure) === group));
            changed = changed || kept.length !== sidecar[key].length;
            if (kept.length) sidecar[key] = kept; else delete sidecar[key];
        }
        return changed;
    }

    const EVENT_TAG = /<structure:(\d+)>\s*<spot:([^>]+)>/;
    function eventTag(group, key) { return `<structure:${group}><spot:${key}>`; }
    function blankEvent(id, x, y) {
        return { id, name: `EV${String(id).padStart(3, '0')}`, note: '', x, y, pages: [{
            conditions: { actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: 'A', selfSwitchValid: false, switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0 },
            directionFix: false, image: { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 },
            moveFrequency: 3, moveRoute: { list: [{ code: 0, indent: null, parameters: [] }], repeat: true, skippable: false, wait: false },
            moveSpeed: 3, moveType: 0, priorityType: 1, stepAnime: false, through: false, trigger: 0, walkAnime: true,
            list: [{ code: 0, indent: 0, parameters: [] }]
        }] };
    }

    /**
     * Put a stamped building's events on the RPG Maker map. An event the
     * building placed before (found by the tag in its note) is moved to
     * its spot and otherwise left alone, so a hand-edited page survives a
     * re-stamp; a new one is made from its template. `loadTemplate(name)`
     * hands back the template's event object or null.
     */
    function placeEvents(mapData, group, wanted, loadTemplate) {
        if (!mapData || !Array.isArray(mapData.events)) return [];
        const placed = [];
        const byKey = new Map();
        for (const event of mapData.events) {
            const tag = event && typeof event.note === 'string' ? EVENT_TAG.exec(event.note) : null;
            if (tag && Number(tag[1]) === group) byKey.set(tag[2], event);
        }
        for (const entry of wanted) {
            if (entry.at[0] < 0 || entry.at[1] < 0 || entry.at[0] >= mapData.width || entry.at[1] >= mapData.height) continue;
            let event = byKey.get(entry.key);
            if (event) { event.x = entry.at[0]; event.y = entry.at[1]; placed.push(event); byKey.delete(entry.key); continue; }
            const id = mapData.events.reduce((max, e) => Math.max(max, e && e.id ? e.id : 0), 0) + 1;
            const template = typeof loadTemplate === 'function' && entry.template ? loadTemplate(entry.template) : null;
            event = template && Array.isArray(template.pages) && template.pages.length
                ? Object.assign(JSON.parse(JSON.stringify(template)), { id, x: entry.at[0], y: entry.at[1] })
                : blankEvent(id, entry.at[0], entry.at[1]);
            if (entry.animation > 0 && !template) {
                const page = event.pages[0];
                page.trigger = 4; page.through = true; page.priorityType = 0;
                page.list = [{ code: 212, indent: 0, parameters: [0, entry.animation, true] }, { code: 0, indent: 0, parameters: [] }];
            }
            event.name = entry.name;
            event.note = eventTag(group, entry.key) + (typeof event.note === 'string' && event.note && !EVENT_TAG.test(event.note) ? ' ' + event.note : '');
            for (const page of event.pages) if (page && page.image) page.image.direction = entry.direction;
            while (mapData.events.length <= id) mapData.events.push(null);
            mapData.events[id] = event;
            placed.push(event);
        }
        // Spots the plan no longer names: their events go.
        for (const stale of byKey.values()) { const at = mapData.events.indexOf(stale); if (at >= 0) mapData.events[at] = null; }
        return placed;
    }

    function removeGroupEvents(mapData, group) {
        if (!mapData || !Array.isArray(mapData.events)) return 0;
        let removed = 0;
        mapData.events.forEach((event, index) => {
            const tag = event && typeof event.note === 'string' ? EVENT_TAG.exec(event.note) : null;
            if (tag && Number(tag[1]) === group) { mapData.events[index] = null; removed++; }
        });
        return removed;
    }

    /** Build one plan's own rooms, walls, doors, windows, stairs and roof at (X0, Y0). */
    function buildOwn(plan, X0 = 0, Y0 = 0, firstId = 1, group = 0) {
        const [W, H] = plan.size;
        const S = Number(plan.storey) > 0 ? Math.floor(plan.storey) : 5;
        const M = Object.assign({ wall: '', inner: '', floor: '', wet: '', roof: '', stair: '', glass: '' }, plan.materials || {});
        const pieces = [];
        let id = firstId;
        const put = (kind, x, y, z, rot, material, extra) => {
            const piece = { id: id++, kind, x: X0 + x, y: Y0 + y, z, rot: rot || 0, material: material || '' };
            if (group > 0) piece.group = group;
            if (extra) Object.assign(piece, extra);
            pieces.push(piece);
        };
        // Built pieces: `pieces: [{ kind, x, y, z, rot, material, ... }]` in the plan's own cells, exactly as they
        // were laid in the Structure workshop (a shape keeps its size, angle, tilt, roll, offset and settings).
        for (const raw of plan.pieces || []) {
            if (!raw || typeof raw.kind !== 'string' || !Number.isFinite(Number(raw.x)) || !Number.isFinite(Number(raw.y))) continue;
            const { kind, x, y, z, rot, material, id: _id, group: _group, ...extra } = raw;
            put(kind, Math.floor(Number(x)), Math.floor(Number(y)), Number(z) || 0, Number(rot) || 0, material || '', Object.keys(extra).length ? extra : null);
        }
        // Shapes: `shapes: [{ kind, at: [x, y], z, size: [w, h, d], angle, tilt, roll, offset: [ox, oy], material }]`,
        // the free pieces: a dome on a tower, a tent, a fallen column, at their own size and turn.
        for (const shape of plan.shapes || []) {
            if (!shape || !Array.isArray(shape.at)) continue;
            const size = Array.isArray(shape.size) ? shape.size : [1, 1, 1];
            const extra = { size: [size[0], size[1], size[2] === undefined ? size[0] : size[2]], angle: Number(shape.angle) || 0 };
            if (Number(shape.tilt)) extra.tilt = Number(shape.tilt);
            if (Number(shape.roll)) extra.roll = Number(shape.roll);
            if (Array.isArray(shape.offset) && (Number(shape.offset[0]) || Number(shape.offset[1]))) extra.offset = [Number(shape.offset[0]) || 0, Number(shape.offset[1]) || 0];
            if (Number.isFinite(Number(shape.sides))) extra.sides = Number(shape.sides);
            if (Number.isFinite(Number(shape.taper))) extra.taper = Number(shape.taper);
            if (Number.isFinite(Number(shape.sweep))) extra.sweep = Number(shape.sweep);
            if (Number.isFinite(Number(shape.thick))) extra.thick = Number(shape.thick);
            put(shape.kind, shape.at[0], shape.at[1], Number(shape.z) || 0, 0, shape.material || M.wall, extra);
        }
        const floors = Array.isArray(plan.floors) ? plan.floors : [];
        // Stairs: cells per step, and the cells the floor above leaves open.
        const stairCells = [];
        for (const stair of plan.stairs || []) {
            const dir = DIRS[stair.dir] || DIRS.north;
            const width = Math.max(1, Number(stair.width) || 1);
            const floor = Number(stair.floor) || 0;
            for (let i = 0; i < S; i++) for (let k = 0; k < width; k++) {
                const x = stair.from[0] + dir[0] * i + (dir[1] !== 0 ? k : 0);
                const y = stair.from[1] + dir[1] * i + (dir[0] !== 0 ? k : 0);
                stairCells.push({ x, y, z: floor * S + i, rot: dir[2], floor });
            }
        }
        const windows = plan.windows === false ? null : Object.assign({ every: 6, width: 2 }, plan.windows || {});
        // Windows wear a frame unless the plan says not (`windows.frame: false`): its style, shutters and,
        // on the ground floor (or every floor with "all"), a flower box. Doors hang in every doorway
        // unless `doors: false`; `door: { ... }` gives them all their settings, a door entry's own object its own.
        const frameOf = index => {
            if (!windows || windows.frame === false) return null;
            const frame = { style: typeof windows.frame === 'string' ? windows.frame : (windows.frame && windows.frame.style) || 'cottage' };
            if (M.frame) frame.material = M.frame;
            if (windows.shutters) frame.shutters = windows.shutters === true ? '#3f5f3a' : windows.shutters;
            if (windows.shutters && windows.closed) frame.closed = true;
            if (windows.flowerBox === 'all' || (windows.flowerBox && index === 0)) frame.flowerBox = true;
            return frame;
        };
        const doorDefaults = plan.doors === false ? false : (plan.door && typeof plan.door === 'object' ? plan.door : null);
        floors.forEach((level, index) => {
            const z = index * S;
            const rooms = level.rooms || {};
            const wet = new Set(level.wet || []);
            const doors = new Set();
            for (const door of level.doors || []) for (const [x, y] of doorCells(rooms, plan.size, door)) doors.add(x + ',' + y);
            // No slab over a stair (the stairwell) nor under one (the stair is the floor there).
            const open = new Set(stairCells.filter(c => c.floor === index - 1 || c.floor === index).map(c => c.x + ',' + c.y));
            // Windows along the outer walls: a pair every `every` cells, never on a door or its neighbour,
            // and any cell the floor names in `windows: [[x, y]]`, placed by hand.
            const windowCells = new Set();
            const windowable = (x, y) => canWindow(rooms, plan.size, x, y);
            for (const cell of level.windows || []) {
                if (!Array.isArray(cell)) continue;
                const [wx, wy] = cell;
                if (windowable(wx, wy) && !doors.has(wx + ',' + wy)) windowCells.add(wx + ',' + wy);
            }
            if (windows && windows.every > 0) {
                const nearDoor = (x, y) => doors.has(x + ',' + y) || doors.has((x + 1) + ',' + y) || doors.has((x - 1) + ',' + y) || doors.has(x + ',' + (y + 1)) || doors.has(x + ',' + (y - 1));
                const along = (cells) => {
                    for (let i = 0; i + windows.width <= cells.length; i += windows.every) {
                        const run = cells.slice(i + Math.floor(windows.every / 2) - 1, i + Math.floor(windows.every / 2) - 1 + windows.width);
                        if (run.length === windows.width && run.every(([x, y]) => !nearDoor(x, y) && windowable(x, y))) run.forEach(([x, y]) => windowCells.add(x + ',' + y));
                    }
                };
                // Along each side of each building's box, where the wall faces open ground.
                for (const [bx0, by0, bx1, by1] of buildingBoxes(rooms, plan.size)) {
                    const top = [], bottom = [], left = [], right = [];
                    for (let x = bx0 + 1; x < bx1; x++) { top.push([x, by0]); bottom.push([x, by1]); }
                    for (let y = by0 + 1; y < by1; y++) { left.push([bx0, y]); right.push([bx1, y]); }
                    along(top); along(bottom); along(left); along(right);
                }
            }
            for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
                const key = x + ',' + y;
                if (open.has(key)) continue;
                const room = roomAt(rooms, x, y);
                if (!room && !isWallCell(rooms, plan.size, x, y)) continue;
                const outer = !room && isOuterWallCell(rooms, plan.size, x, y);
                // A room may name its own floor, and the walls that touch it:
                // `materials: { hall: { floor: "Stone", wall: "Wood" } }` on the
                // floor. An inner wall between two rooms takes the first
                // neighbouring room that says; the outer wall stays the building's.
                const own = level.materials && typeof level.materials === 'object' ? level.materials : null;
                if (room) { put('floor', x, y, z, 0, (own && own[room] && own[room].floor) || (wet.has(room) ? M.wet : M.floor)); continue; }
                let wallMaterial = outer ? M.wall : M.inner;
                if (own && !outer) {
                    for (const [nx, ny] of [[x, y - 1], [x + 1, y], [x, y + 1], [x - 1, y]]) {
                        const near = roomAt(rooms, nx, ny);
                        if (near && own[near] && own[near].wall) { wallMaterial = own[near].wall; break; }
                    }
                }
                // Floor under a doorway (a threshold) and under every wall, so
                // nothing built shows the ground through a door or a cut wall.
                put('floor', x, y, z, 0, M.floor);
                if (doors.has(key)) { put('doorway', x, y, z, 0, wallMaterial); continue; }
                // A window is its sill and header with a pane of glass between them.
                // The pane is thin across v, so a wall running north-south (a room to
                // its east or west) turns it a quarter, or it stands through the wall
                // and its edge shows on the face as a line the height of the storey.
                if (windowCells.has(key)) {
                    const across = roomAt(rooms, x - 1, y) || roomAt(rooms, x + 1, y) ? 1 : 0;
                    const frame = frameOf(index);
                    put('window', x, y, z, frame ? windowRot(rooms, plan.size, x, y) : 0, M.wall, frame ? { frame } : null);
                    put('glass', x, y, z, across, M.glass || 'Glass'); continue;
                }
                put('wall', x, y, z, 0, wallMaterial);
            }
            for (const door of level.doors || []) {
                const hung = doorPiece(rooms, plan.size, door, doorDefaults);
                if (!hung) continue;
                const { x, y, rot, ...fields } = hung;
                put('door', x, y, z, rot, M.door || 'Wood', Object.assign(fields, M.frame ? { frame: M.frame } : {}));
            }
        });
        for (const c of stairCells) put('stair', c.x, c.y, c.z, c.rot, M.stair);
        // A ceiling over every room of the top floor, so a window does not
        // look at the underside of the roof; the roof sits on it.
        const roofZ = floors.length * S;
        const top = floors[floors.length - 1];
        if (top) for (const [name, rect] of Object.entries(top.rooms || {})) {
            for (let x = rect[0]; x <= rect[2]; x++) for (let y = rect[1]; y <= rect[3]; y++) put('floor', x, y, roofZ, 0, plan.roof && plan.roof.style === 'flat' ? M.wall : M.inner || M.floor);
        }
        // A roof over each building of the top floor (its rooms and their walls): ramps up
        // from each eave for `pitch` rows, a flat top between, gables of blocks at the ends.
        // The two end columns are the gable walls' own tops, in the wall's material: a
        // roof-coloured wedge over each step of blocks read as a row of teeth.
        const roof = Object.assign({ pitch: 6 }, plan.roof || {});
        // A flat roof: the top floor's slab with a parapet a tile high round each building's edge.
        if (roof.style === 'flat') for (const [bx0, by0, bx1, by1] of buildingBoxes(top ? top.rooms : {}, plan.size)) {
            for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) {
                if (x === bx0 || x === bx1 || y === by0 || y === by1) put('block', x, y, roofZ, 0, M.wall);
            }
        }
        // A slanted roof: one slope from a low eave up to the high side.
        if (roof.pitch !== null && roof.style === 'shed') for (const [bx0, by0, bx1, by1] of buildingBoxes(top ? top.rooms : {}, plan.size)) {
            shedRoof(roof, bx0, by0, bx1, by1, roofZ, M, put);
        }
        if (roof.pitch !== null && roof.style !== 'flat' && roof.style !== 'shed') for (const [bx0, by0, bx1, by1] of buildingBoxes(top ? top.rooms : {}, plan.size)) {
            const bh = by1 - by0 + 1;
            const pitch = Math.max(0, Math.min(Math.floor((bh - 1) / 2), Math.floor(roof.pitch)));
            for (let x = bx0; x <= bx1; x++) {
                const material = x === bx0 || x === bx1 ? M.wall : M.roof;
                for (let i = 0; i < pitch; i++) { put('ramp', x, by0 + i, roofZ + i, 0, material); put('ramp', x, by1 - i, roofZ + i, 2, material); }
                for (let y = by0 + pitch; y <= by1 - pitch; y++) put('floor', x, y, roofZ + pitch, 0, material);
            }
            for (const gx of [bx0, bx1]) for (let y = by0 + 1; y < by1; y++) {
                const height = Math.min(y - by0, by1 - y, pitch);
                for (let z = roofZ; z < roofZ + height; z++) put('block', gx, y, z, 0, M.wall);
            }
            if (pitch > 0) overhang(roof, bx0, by0, bx1, by1, pitch, roofZ, M.roof, put);
        }
        return pieces;
    }

    /** How far eaves and verges reach past the walls, in tiles (`roof.overhang`, 0 to 1; 0 is flush). */
    const ROOF_OVERHANG = 1;
    const ROOF_SLAB = 0.25;

    /**
     * Eaves and verges: the roof's slopes carried past the walls as thin slabs of roof, so a house reads
     * as roofed rather than a box with a lid. The slopes rise a level a cell (the ramps' 45°); each slab's
     * top lies a hair over that plane, its thickness shows as the fascia and its underside as the soffit.
     * A slab's middle must stay within its cell, so it reaches back one cell over the roof.
     */
    function overhang(roof, bx0, by0, bx1, by1, pitch, roofZ, material, put) {
        const raw = Number(roof.overhang);
        const o = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : ROOF_OVERHANG));
        if (!(o > 0)) return;
        const T = ROOF_SLAB, LIFT = 0.04, R2 = Math.SQRT2, two = v => Math.round(v * 100) / 100;
        // A slab stands on a cell of the building: a middle on a cell's edge takes the cell toward the house.
        const midX = (bx0 + bx1 + 1) / 2, midY = (by0 + by1 + 1) / 2;
        const cell = (c, mid) => (Math.abs(c - Math.round(c)) < 1e-9 && c > mid ? Math.round(c) - 1 : Math.floor(c + 1e-9));
        const box = (cx, cz, z, size, extra) => {
            const ax = cell(cx, midX), ay = cell(cz, midY);
            put('box', ax, ay, z, 0, material, Object.assign({ size: size.map(two), angle: 0, offset: [two(cx - ax - 0.5), two(cz - ay - 0.5)] }, extra || {}));
        };
        // A slab in the slope that rises toward `dir` (+1 south, -1 north) from row edge `yLow` at height `zLow`, `run` cells.
        const slope = (xa, xb, yLow, dir, zLow, run) => {
            if (!(run > 0)) return;
            const lowest = zLow + LIFT - T / R2;
            const z = Math.ceil(lowest * 4 - 1e-9) / 4;
            // Raised to the quarter level the slab stands on, and slid up the slope as far, so it stays in the plane.
            const cz = yLow + dir * run / 2 + dir * T / (2 * R2) + dir * (z - lowest);
            box((xa + xb) / 2, cz, z, [xb - xa, T, run * R2], { tilt: (360 - dir * 45) % 360 });
        };
        const W0 = bx0 - o, W1 = bx1 + 1 + o;
        // Eaves along both long sides, from the overhang's edge to a cell over the wall.
        slope(W0, W1, by0 - o, 1, roofZ - o, o + 1);
        slope(W0, W1, by1 + 1 + o, -1, roofZ - o, o + 1);
        // Verges past both gables, up each slope and along the flat top between.
        const flat0 = by0 + pitch, flat1 = by1 + 1 - pitch;
        for (const [xa, xb] of [[bx0 - o, bx0 + 1], [bx1, bx1 + 1 + o]]) {
            slope(xa, xb, by0 + 1, 1, roofZ + 1, pitch - 1);
            slope(xa, xb, by1, -1, roofZ + 1, pitch - 1);
            if (flat1 > flat0) box((xa + xb) / 2, (flat0 + flat1) / 2, roofZ + pitch - 0.25, [xb - xa, 0.25 + 0.1 + LIFT, flat1 - flat0]);
        }
    }

    /** The turn that points a wedge's rise at each side of a building. */
    const SHED_ANGLE = { south: 0, west: 90, north: 180, east: 270 };

    /**
     * A slanted roof over a building's box: one slope from a low eave up to the high side (`roof.high`,
     * north unless said), `roof.pitch` levels up over the building's depth. A wedge in the wall's
     * material closes the two ends and the high side; a slab of roof lies on it with eaves all round.
     * A shape's tilt is whole degrees and its height a quarter level, so the slope is the nearest whole
     * degree, the wedge rises to match it, and the low eave reaches out to where the slab's lowest
     * corner meets a quarter level.
     */
    function shedRoof(roof, bx0, by0, bx1, by1, roofZ, M, put) {
        const high = SHED_ANGLE[roof.high] === undefined ? 'north' : roof.high;
        const alongY = high === 'north' || high === 'south';
        const run = alongY ? by1 - by0 + 1 : bx1 - bx0 + 1, across = alongY ? bx1 - bx0 + 1 : by1 - by0 + 1;
        const wanted = Math.max(1, Math.min(run, Math.floor(Number(roof.pitch)) || 1));
        const degrees = Math.max(1, Math.min(60, Math.round(Math.atan2(wanted, run) * 180 / Math.PI)));
        const t = degrees * Math.PI / 180, tan = Math.tan(t), cos = Math.cos(t), sin = Math.sin(t);
        const two = v => Math.round(v * 100) / 100;
        const raw = Number(roof.overhang);
        const o = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : ROOF_OVERHANG));
        const T = ROOF_SLAB, LIFT = 0.04;
        // A shape stood `s` tiles up the run from the low edge, on the building's middle line, turned to rise toward the high side.
        const place = (kind, s, z, size, material, extra) => {
            const cx = high === 'east' ? bx0 + s : high === 'west' ? bx1 + 1 - s : (bx0 + bx1 + 1) / 2;
            const cy = high === 'south' ? by0 + s : high === 'north' ? by1 + 1 - s : (by0 + by1 + 1) / 2;
            const ax = Math.max(bx0, Math.min(bx1, Math.floor(cx))), ay = Math.max(by0, Math.min(by1, Math.floor(cy)));
            put(kind, ax, ay, z, 0, material, Object.assign({ size: size.map(two), angle: SHED_ANGLE[high], offset: [two(cx - ax - 0.5), two(cy - ay - 0.5)] }, extra || {}));
        };
        place('wedge', run / 2, roofZ, [across, run * tan, run], M.wall);
        // The low eave: the reach nearest the overhang asked for at which the slab's lowest corner stands on a quarter level.
        let drop = 0, low = LIFT * cos / tan;
        for (let m = 1; m <= 8; m++) {
            const reach = (LIFT * cos + m * 0.25) / tan;
            if (Math.abs(reach - o) < Math.abs(low - o)) { drop = m; low = reach; }
        }
        const middle = (run + o - low) / 2 - (LIFT + T / 2) * sin;
        place('box', middle, roofZ - drop * 0.25, [across + 2 * o, T, (run + o + low) / cos], M.roof || M.wall, { tilt: 360 - degrees });
    }

    /**
     * The same plan turned `rot` quarter turns clockwise and with its rooms
     * `scale` times as big. Rooms, stairs and the size turn and grow; doors
     * are between rooms and follow; windows keep their spacing per cell.
     * Walls stay one cell between rooms, so at scale 2 they are two thick.
     */
    /** A prop's facing a quarter turn clockwise: down to left, left to up, up to right, right to down. */
    const PROP_TURN = { 2: 4, 4: 8, 8: 6, 6: 2 };

    /** A water sheet turned a quarter clockwise in a plan `H` cells deep: its box, its mask and a river's path. */
    function turnWater(sheet, H) {
        const out = Object.assign({}, sheet);
        const x0 = Number(sheet.x0), y0 = Number(sheet.y0), x1 = Number(sheet.x1), y1 = Number(sheet.y1);
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        Object.assign(out, { x0: H - 1 - y1, x1: H - 1 - y0, y0: x0, y1: x1 });
        if (typeof sheet.mask === 'string' && sheet.mask.length === w * h) {
            // The new box is h wide and w deep; cell (i, j) of the old box lands at (h - 1 - j, i).
            const cells = new Array(w * h);
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cells[i * h + (h - 1 - j)] = sheet.mask[j * w + i];
            out.mask = cells.join('');
        }
        if (Array.isArray(sheet.path)) out.path = sheet.path.map(p => [H - Number(p[1]), Number(p[0]), p[2]]);
        return out;
    }

    /** A water sheet grown k times: its box, each mask cell k × k, its level and a river's path. */
    function growWater(sheet, k) {
        const out = Object.assign({}, sheet);
        const x0 = Number(sheet.x0), y0 = Number(sheet.y0), x1 = Number(sheet.x1), y1 = Number(sheet.y1);
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        Object.assign(out, { x0: x0 * k, y0: y0 * k, x1: (x1 + 1) * k - 1, y1: (y1 + 1) * k - 1, level: (Number(sheet.level) || 0) * k });
        if (typeof sheet.mask === 'string' && sheet.mask.length === w * h) {
            let mask = '';
            for (let j = 0; j < h * k; j++) for (let i = 0; i < w * k; i++) mask += sheet.mask[Math.floor(j / k) * w + Math.floor(i / k)];
            out.mask = mask;
        }
        if (Array.isArray(sheet.path)) out.path = sheet.path.map(p => [Number(p[0]) * k, Number(p[1]) * k, (Number(p[2]) || 0) * k]);
        return out;
    }

    function transform(plan, rot = 0, scale = 1, resolve = null) {
        const turns = ((Math.floor(rot) || 0) % 4 + 4) % 4;
        const k = Math.max(1, Math.min(4, Math.floor(scale) || 1));
        let out = JSON.parse(JSON.stringify(plan));
        if (k > 1) {
            const grow = rect => [rect[0] * k, rect[1] * k, (rect[2] + 1) * k - 1, (rect[3] + 1) * k - 1];
            out.size = [out.size[0] * k, out.size[1] * k];
            for (const name of Object.keys(out.spots || {})) out.spots[name] = [out.spots[name][0] * k, out.spots[name][1] * k];
            for (const fx of out.effects || []) { fx.at = [fx.at[0] * k + Math.floor((k - 1) / 2), fx.at[1] * k + Math.floor((k - 1) / 2)]; fx.z = (Number(fx.z) || 0) * k; if (fx.width) fx.width *= k; if (fx.height) fx.height *= k; if (fx.radius) fx.radius *= k; }
            out.paths = (out.paths || []).map(strip => grow(strip).concat(strip.slice(4)));
            for (const part of out.parts || []) { part.at = [(part.at ? part.at[0] : 0) * k, (part.at ? part.at[1] : 0) * k]; part.scale = (part.scale || 1) * k; }
            for (const level of out.floors || []) {
                for (const name of Object.keys(level.rooms || {})) level.rooms[name] = grow(level.rooms[name]);
                level.doors = (level.doors || []).map(d => {
                    // Width and anchor grow; the side, if the door names one, stays; so do the door's own settings.
                    const own = doorOptions(d);
                    const grown = d.length > 3 && Number.isFinite(Number(d[3])) ? [d[0], d[1], (Number(d[2]) || 2) * k, Number(d[3]) * k + Math.floor((k - 1) / 2)] : [d[0], d[1], (Number(d[2]) || 2) * k];
                    if (grown.length > 3 && typeof d[4] === 'string') grown.push(d[4]);
                    if (own !== null) grown.push(own);
                    return grown;
                });
                level.windows = (level.windows || []).map(([x, y]) => [x * k, y * k]);
            }
            for (const stair of out.stairs || []) { stair.from = [stair.from[0] * k, stair.from[1] * k]; stair.width = (Number(stair.width) || 1) * k; }
            for (const shape of out.shapes || []) {
                shape.at = [shape.at[0] * k + Math.floor((k - 1) / 2), shape.at[1] * k + Math.floor((k - 1) / 2)];
                shape.size = (shape.size || [1, 1, 1]).map(v => v * k);
                shape.z = (Number(shape.z) || 0) * k;
                if (Array.isArray(shape.offset)) shape.offset = shape.offset.map(v => (Number(v) || 0) * k);
            }
            // Built pieces grow like everything else: a cell piece fills its k×k×k block, a shape moves and grows.
            if (Array.isArray(out.pieces)) out.pieces = out.pieces.flatMap(piece => {
                if (Array.isArray(piece.size)) return [Object.assign({}, piece, { x: piece.x * k + Math.floor((k - 1) / 2), y: piece.y * k + Math.floor((k - 1) / 2),
                    z: (Number(piece.z) || 0) * k, size: piece.size.map(v => v * k), offset: Array.isArray(piece.offset) ? piece.offset.map(v => (Number(v) || 0) * k) : piece.offset })];
                const copies = [];
                for (let dz = 0; dz < k; dz++) for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
                    copies.push(Object.assign({}, piece, { x: piece.x * k + dx, y: piece.y * k + dy, z: (Number(piece.z) || 0) * k + dz }));
                }
                return copies;
            });
            for (const light of out.lights || []) { light.x *= k; light.y *= k; light.height = (Number(light.height) || 0) * k; light.radius = (Number(light.radius) || 0) * k; }
            for (const row of out.surfaces || []) { row.x *= k; row.y *= k; row.z = (Number(row.z) || 0) * k; row.width *= k; row.height *= k; }
            for (const prop of out.props || []) { prop.x = Number(prop.x) * k + Math.floor((k - 1) / 2); prop.y = Number(prop.y) * k + Math.floor((k - 1) / 2); prop.z = (Number(prop.z) || 0) * k; prop.size = (Number(prop.size) || 2) * k; }
            out.water = (out.water || []).map(sheet => growWater(sheet, k));
            if (out.windows && out.windows !== false) out.windows = Object.assign({}, out.windows, { every: (out.windows.every || 6) * k, width: (out.windows.width || 2) * k });
            if (out.roof) out.roof = Object.assign({}, out.roof, { pitch: (Number(out.roof.pitch) || 6) * k });
        }
        const DIR_CW = { north: 'east', east: 'south', south: 'west', west: 'north' };
        // A part's footprint in this plan (its own plan's size, grown by its scale, turned by its turn): its
        // corner moves with the whole footprint when the plan turns, not with its top-left cell alone.
        if (turns) for (const part of out.parts || []) {
            const inner = typeof resolve === 'function' && part.plan ? resolve(part.plan) : null;
            if (!inner || !Array.isArray(inner.size)) continue;
            const k2 = Math.max(1, Math.min(4, Math.floor(part.scale || 1) || 1));
            const own = [inner.size[0] * k2, inner.size[1] * k2];
            part._size = (((Math.floor(part.rot) || 0) % 4 + 4) % 4) % 2 ? [own[1], own[0]] : own;
        }
        for (let t = 0; t < turns; t++) {
            const [W, H] = out.size;
            const point = (x, y) => [H - 1 - y, x];
            const rect = r => { const [ax, ay] = point(r[0], r[3]); const [bx, by] = point(r[2], r[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]; };
            for (const level of out.floors || []) {
                // A door's anchor is a position along its wall: a row's x becomes the
                // turned column's y unchanged; a column's y becomes H-1-y, the new x.
                level.doors = (level.doors || []).map(d => {
                    const own = doorOptions(d);
                    if (d.length < 4 || !Number.isFinite(Number(d[3]))) {
                        // A named side turns with the plan even when the door has no anchor.
                        if (typeof d[4] === 'string') { const turned = d.slice(); turned[4] = DIR_CW[d[4]] || d[4]; return turned; }
                        return d;
                    }
                    const found = doorWall(level.rooms || {}, [W, H], d);
                    const turned = [d[0], d[1], d[2], found && !found.alongX ? H - 1 - Number(d[3]) : Number(d[3])];
                    if (typeof d[4] === 'string') turned.push(DIR_CW[d[4]] || d[4]);
                    if (own !== null) turned.push(own);
                    return turned;
                });
                level.windows = (level.windows || []).map(([x, y]) => point(x, y));
                for (const name of Object.keys(level.rooms || {})) level.rooms[name] = rect(level.rooms[name]);
            }
            for (const stair of out.stairs || []) { stair.from = point(stair.from[0], stair.from[1]); stair.dir = DIR_CW[stair.dir] || 'east'; }
            for (const shape of out.shapes || []) {
                shape.at = point(shape.at[0], shape.at[1]);
                shape.angle = ((Number(shape.angle) || 0) + 90) % 360;
                // The offset turns with the cell; the tilt and roll are the shape's own and stay.
                if (Array.isArray(shape.offset)) shape.offset = [-(Number(shape.offset[1]) || 0), Number(shape.offset[0]) || 0];
            }
            // Built pieces: a cell piece's cell turns and its facing with it; a shape turns by its angle.
            for (const piece of out.pieces || []) {
                [piece.x, piece.y] = point(piece.x, piece.y);
                if (Array.isArray(piece.size)) {
                    piece.angle = ((Number(piece.angle) || 0) + 90) % 360;
                    if (Array.isArray(piece.offset)) piece.offset = [-(Number(piece.offset[1]) || 0), Number(piece.offset[0]) || 0];
                } else piece.rot = ((Number(piece.rot) || 0) + 1) % 4;
            }
            // Lights and screens stand anywhere in the plot, not in cells: (x, y) turns about the plot, a screen's facing with it.
            for (const light of out.lights || []) { [light.x, light.y] = [H - light.y, light.x]; if (Number(light.yaw)) light.yaw = ((Number(light.yaw) || 0) + 270) % 360; }
            for (const row of out.surfaces || []) { [row.x, row.y] = [H - row.y, row.x]; row.rotationY = ((Number(row.rotationY) || 0) + 270) % 360; }
            // Models stand on cells (the event's cell) and face one of four ways: the cell turns and the facing with it.
            for (const prop of out.props || []) { [prop.x, prop.y] = [H - 1 - Number(prop.y), Number(prop.x)]; prop.direction = PROP_TURN[Number(prop.direction)] || 4; }
            out.water = (out.water || []).map(sheet => turnWater(sheet, H));
            for (const name of Object.keys(out.spots || {})) out.spots[name] = point(out.spots[name][0], out.spots[name][1]);
            for (const fx of out.effects || []) { fx.at = point(fx.at[0], fx.at[1]); if (fx.facing) fx.facing = DIR_CW[fx.facing] || fx.facing; }
            out.paths = (out.paths || []).map(strip => rect(strip).concat(strip.slice(4)));
            // A slanted roof's high side turns with the building.
            if (out.roof && DIR_CW[out.roof.high]) out.roof = Object.assign({}, out.roof, { high: DIR_CW[out.roof.high] });
            // A part turns about the whole: its own turn adds one, and its corner moves with its footprint.
            for (const part of out.parts || []) {
                const inner = part._size || [1, 1];
                const r = rect([part.at ? part.at[0] : 0, part.at ? part.at[1] : 0, (part.at ? part.at[0] : 0) + inner[0] - 1, (part.at ? part.at[1] : 0) + inner[1] - 1]);
                part.at = [r[0], r[1]]; part.rot = ((part.rot || 0) + 1) % 4; part._size = [inner[1], inner[0]];
            }
            out.size = [H, W];
        }
        return out;
    }

    /** Where the front door is, in plan cells: the middle of the first "outside" door on floor 0. */
    function entrance(plan) {
        const level = (plan.floors || [])[0];
        if (!level) return null;
        const door = (level.doors || []).find(d => d[1] === 'outside' || d[0] === 'outside');
        if (!door) return null;
        const a = door[0] === 'outside' ? door[1] : door[0];
        const cells = doorCells(level.rooms || {}, plan.size, [a, 'outside', door[2], door[3], door[4]]);
        if (!cells.length) return null;
        const [W, H] = plan.size;
        // The door cell on the outer face, and the cell just beyond it.
        const face = [[([, y]) => y === H - 1], [([, y]) => y === 0], [([x]) => x === W - 1], [([x]) => x === 0]]
            .map(([test]) => cells.filter(test)).find(list => list.length) || cells;
        const [x, y] = face[Math.floor(face.length / 2)];
        const room = level.rooms[a];
        const outside = y > room[3] ? [x, y + 1] : y < room[1] ? [x, y - 1] : x > room[2] ? [x + 1, y] : [x - 1, y];
        return { door: [x, y], outside };
    }

    /**
     * Walk the built plan with the engine from outside the front door,
     * carrying the walker's height as the game does; which room middles
     * were reached, and the moves (MZ directions) to each.
     */
    function validate(plan, pieces, X0, Y0, mapWidth, mapHeight, Reactor3D, resolve = null) {
        const R = Reactor3D || root.Reactor3D;
        if (!R || !R.terrainBlocks) return null;
        const map = { width: mapWidth, height: mapHeight, reactor3d: { version: 1, elevation: new Array(mapWidth * mapHeight).fill(0), pieces } };
        // A plan of parts is walked from its own `start` spot (or its first part's front door).
        let door = entrance(plan);
        if (!door && plan.spots && plan.spots.start) door = { door: plan.spots.start, outside: plan.spots.start };
        if (!door && (plan.parts || []).length && typeof resolve === 'function') {
            const part = plan.parts[0], inner = resolve(part.plan);
            const shaped = inner ? transform(inner, part.rot || 0, part.scale || 1, resolve) : null;
            const innerDoor = shaped ? entrance(shaped) : null;
            if (innerDoor) door = { door: innerDoor.door, outside: [innerDoor.outside[0] + (part.at ? part.at[0] : 0), innerDoor.outside[1] + (part.at ? part.at[1] : 0)] };
        }
        if (!door) return null;
        const start = { x: X0 + door.outside[0], y: Y0 + door.outside[1], near: 0 };
        const key = s => s.x + ',' + s.y + ',' + Math.round(s.near * 10);
        const seen = new Map([[key(start), start]]);
        const queue = [start];
        const STEPS = [[0, -1, 8], [0, 1, 2], [-1, 0, 4], [1, 0, 6]];
        while (queue.length) {
            const s = queue.shift();
            for (const [dx, dy, dir] of STEPS) {
                const x2 = s.x + dx, y2 = s.y + dy;
                if (x2 < 0 || y2 < 0 || x2 >= mapWidth || y2 >= mapHeight) continue;
                if (R.terrainBlocks(map, s.x, s.y, x2, y2, s.near)) continue;
                const next = { x: x2, y: y2, near: R.groundHeightAt(map, x2 + 0.5, y2 + 0.5, s.near), from: s, dir };
                const k = key(next);
                if (seen.has(k)) continue;
                seen.set(k, next);
                queue.push(next);
            }
        }
        const report = {};
        const rooms = (target, ox, oy, prefix) => {
            const S = Number(target.storey) > 0 ? Math.floor(target.storey) : 5;
            (target.floors || []).forEach((level, index) => {
                for (const [name, rect] of Object.entries(level.rooms || {})) {
                    // A room is reached when the walk stands on any of its cells at its level (furniture
                    // may fill its middle); the nearest to its middle gives the route, and the count of
                    // cells never stood on says how much of it is furniture or cut off.
                    const near = index * S + 0.1, mx = X0 + ox + (rect[0] + rect[2]) / 2, my = Y0 + oy + (rect[1] + rect[3]) / 2;
                    let hit = null, open = 0;
                    const cells = (rect[2] - rect[0] + 1) * (rect[3] - rect[1] + 1);
                    for (const s of seen.values()) {
                        const rx = s.x - X0 - ox, ry = s.y - Y0 - oy;
                        if (rx < rect[0] || rx > rect[2] || ry < rect[1] || ry > rect[3] || Math.abs(s.near - near) >= 0.3) continue;
                        open++;
                        if (!hit || Math.hypot(s.x + 0.5 - mx, s.y + 0.5 - my) < Math.hypot(hit.x + 0.5 - mx, hit.y + 0.5 - my)) hit = s;
                    }
                    const moves = [];
                    for (let s = hit; s && s.from; s = s.from) moves.unshift(s.dir);
                    // A tower calls every floor's room by the same name: the report tells the floors apart.
                    report[prefix + (index ? name + ' (' + (index + 1) + ')' : name)] = hit ? { reached: true, steps: moves.length, moves, open, cells } : { reached: false, open: 0, cells };
                }
            });
            for (const part of target.parts || []) {
                const inner = typeof resolve === 'function' ? resolve(part.plan) : null;
                if (!inner) continue;
                rooms(transform(inner, part.rot || 0, part.scale || 1, resolve), ox + (part.at ? part.at[0] : 0), oy + (part.at ? part.at[1] : 0), prefix + (part.name || part.plan.replace(/\.json$/i, '')) + '.');
            }
        };
        rooms(plan, 0, 0, '');
        return { start, report, states: seen.size };
    }

    const api = { shedRoof, SHED_ANGLE, doorPiece, doorOptions, windowRot, turnWater, growWater, PROP_TURN, build, buildOwn, spots, eventsOf, effectsOf, placeEffects, addEffects, removeGroupEffects, placeEvents, removeGroupEvents, eventTag, EVENT_TAG, transform, validate, entrance, doorCells, doorWall, sharedWall, isWallCell, isOuterWallCell, canWindow, buildingBox, buildingBoxes, DIRS };
    root.RRStructurePlan = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
