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
            const shaped = transform(inner, part.rot || 0, part.scale || 1);
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
            const shaped = transform(inner, part.rot || 0, part.scale || 1);
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
            eventsOf(transform(inner, part.rot || 0, part.scale || 1), X0 + (part.at ? part.at[0] : 0), Y0 + (part.at ? part.at[1] : 0), resolve, prefix + (part.name ? part.name + '.' : ''), out);
        }
        return out;
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
        if (!(plan.floors || []).length) return [];
        const S = Number(plan.storey) > 0 ? Math.floor(plan.storey) : 5;
        const M = Object.assign({ wall: '', inner: '', floor: '', wet: '', roof: '', stair: '' }, plan.materials || {});
        const pieces = [];
        let id = firstId;
        const put = (kind, x, y, z, rot, material, extra) => {
            const piece = { id: id++, kind, x: X0 + x, y: Y0 + y, z, rot: rot || 0, material: material || '' };
            if (group > 0) piece.group = group;
            if (extra) Object.assign(piece, extra);
            pieces.push(piece);
        };
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
                if (windowCells.has(key)) { put('window', x, y, z, 0, M.wall); continue; }
                put('wall', x, y, z, 0, wallMaterial);
            }
        });
        for (const c of stairCells) put('stair', c.x, c.y, c.z, c.rot, M.stair);
        // A ceiling over every room of the top floor, so a window does not
        // look at the underside of the roof; the roof sits on it.
        const roofZ = floors.length * S;
        const top = floors[floors.length - 1];
        if (top) for (const [name, rect] of Object.entries(top.rooms || {})) {
            for (let x = rect[0]; x <= rect[2]; x++) for (let y = rect[1]; y <= rect[3]; y++) put('floor', x, y, roofZ, 0, M.inner || M.floor);
        }
        // A roof over each building of the top floor (its rooms and their walls): ramps up
        // from each eave for `pitch` rows, a flat top between, gables of blocks at the ends.
        const roof = Object.assign({ pitch: 6 }, plan.roof || {});
        if (roof.pitch !== null) for (const [bx0, by0, bx1, by1] of buildingBoxes(top ? top.rooms : {}, plan.size)) {
            const bh = by1 - by0 + 1;
            const pitch = Math.max(0, Math.min(Math.floor((bh - 1) / 2), Math.floor(roof.pitch)));
            for (let x = bx0; x <= bx1; x++) {
                for (let i = 0; i < pitch; i++) { put('ramp', x, by0 + i, roofZ + i, 0, M.roof); put('ramp', x, by1 - i, roofZ + i, 2, M.roof); }
                for (let y = by0 + pitch; y <= by1 - pitch; y++) put('floor', x, y, roofZ + pitch, 0, M.roof);
            }
            for (const gx of [bx0, bx1]) for (let y = by0 + 1; y < by1; y++) {
                const height = Math.min(y - by0, by1 - y, pitch);
                for (let z = roofZ; z < roofZ + height; z++) put('block', gx, y, z, 0, M.wall);
            }
        }
        return pieces;
    }

    /**
     * The same plan turned `rot` quarter turns clockwise and with its rooms
     * `scale` times as big. Rooms, stairs and the size turn and grow; doors
     * are between rooms and follow; windows keep their spacing per cell.
     * Walls stay one cell between rooms, so at scale 2 they are two thick.
     */
    function transform(plan, rot = 0, scale = 1) {
        const turns = ((Math.floor(rot) || 0) % 4 + 4) % 4;
        const k = Math.max(1, Math.min(4, Math.floor(scale) || 1));
        let out = JSON.parse(JSON.stringify(plan));
        if (k > 1) {
            const grow = rect => [rect[0] * k, rect[1] * k, (rect[2] + 1) * k - 1, (rect[3] + 1) * k - 1];
            out.size = [out.size[0] * k, out.size[1] * k];
            for (const name of Object.keys(out.spots || {})) out.spots[name] = [out.spots[name][0] * k, out.spots[name][1] * k];
            out.paths = (out.paths || []).map(strip => grow(strip).concat(strip.slice(4)));
            for (const part of out.parts || []) { part.at = [(part.at ? part.at[0] : 0) * k, (part.at ? part.at[1] : 0) * k]; part.scale = (part.scale || 1) * k; }
            for (const level of out.floors || []) {
                for (const name of Object.keys(level.rooms || {})) level.rooms[name] = grow(level.rooms[name]);
                level.doors = (level.doors || []).map(d => {
                    // Width and anchor grow; the side, if the door names one, stays.
                    const grown = d.length > 3 && Number.isFinite(Number(d[3])) ? [d[0], d[1], (Number(d[2]) || 2) * k, Number(d[3]) * k + Math.floor((k - 1) / 2)] : [d[0], d[1], (Number(d[2]) || 2) * k];
                    if (grown.length > 3 && d.length > 4) grown.push(d[4]);
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
            if (out.windows && out.windows !== false) out.windows = { every: (out.windows.every || 6) * k, width: (out.windows.width || 2) * k };
            if (out.roof) out.roof = Object.assign({}, out.roof, { pitch: (Number(out.roof.pitch) || 6) * k });
        }
        const DIR_CW = { north: 'east', east: 'south', south: 'west', west: 'north' };
        for (let t = 0; t < turns; t++) {
            const [W, H] = out.size;
            const point = (x, y) => [H - 1 - y, x];
            const rect = r => { const [ax, ay] = point(r[0], r[3]); const [bx, by] = point(r[2], r[1]); return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)]; };
            for (const level of out.floors || []) {
                // A door's anchor is a position along its wall: a row's x becomes the
                // turned column's y unchanged; a column's y becomes H-1-y, the new x.
                level.doors = (level.doors || []).map(d => {
                    if (d.length < 4 || !Number.isFinite(Number(d[3]))) return d;
                    const found = doorWall(level.rooms || {}, [W, H], d);
                    const turned = [d[0], d[1], d[2], found && !found.alongX ? H - 1 - Number(d[3]) : Number(d[3])];
                    if (d.length > 4) turned.push(DIR_CW[d[4]] || d[4]);
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
            for (const name of Object.keys(out.spots || {})) out.spots[name] = point(out.spots[name][0], out.spots[name][1]);
            out.paths = (out.paths || []).map(strip => rect(strip).concat(strip.slice(4)));
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
            const shaped = inner ? transform(inner, part.rot || 0, part.scale || 1) : null;
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
                    const tx = X0 + ox + Math.floor((rect[0] + rect[2]) / 2), ty = Y0 + oy + Math.floor((rect[1] + rect[3]) / 2), near = index * S + 0.1;
                    let hit = null;
                    for (const s of seen.values()) if (s.x === tx && s.y === ty && Math.abs(s.near - near) < 0.3) { hit = s; break; }
                    const moves = [];
                    for (let s = hit; s && s.from; s = s.from) moves.unshift(s.dir);
                    // A tower calls every floor's room by the same name: the report tells the floors apart.
                    report[prefix + (index ? name + ' (' + (index + 1) + ')' : name)] = hit ? { reached: true, steps: moves.length, moves } : { reached: false };
                }
            });
            for (const part of target.parts || []) {
                const inner = typeof resolve === 'function' ? resolve(part.plan) : null;
                if (!inner) continue;
                rooms(transform(inner, part.rot || 0, part.scale || 1), ox + (part.at ? part.at[0] : 0), oy + (part.at ? part.at[1] : 0), prefix + (part.name || part.plan.replace(/\.json$/i, '')) + '.');
            }
        };
        rooms(plan, 0, 0, '');
        return { start, report, states: seen.size };
    }

    const api = { build, buildOwn, spots, eventsOf, placeEvents, removeGroupEvents, eventTag, EVENT_TAG, transform, validate, entrance, doorCells, doorWall, sharedWall, isWallCell, isOuterWallCell, canWindow, buildingBox, buildingBoxes, DIRS };
    root.RRStructurePlan = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
