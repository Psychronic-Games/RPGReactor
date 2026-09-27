/**
 * StructureFloors - a built structure seen one floor at a time.
 *
 * A structure's pieces stand in bands of `storey` levels: floor 0 is levels
 * 0..storey-1, floor 1 the next band, and so on; anything above the top
 * floor (a roof, a ceiling) sits above the last band. The floor plan on
 * Database › Structures paints pieces into one band the way the Build bar
 * lays them on a map (a slab at the band's base, a wall piece per cell with
 * a slab under it, a doorway or a window in place of a wall, stairs that
 * climb the band and leave the slab above them open), so the plan and the
 * 3D builder edit the same pieces and never disagree.
 *
 * Floors are added by copying the top floor up (walls, slabs, windows,
 * stairs, lights and screens) with whatever stood above it moved up too,
 * and taken away from the top with what stood above moved down.
 */
(function(root) {
    'use strict';

    const WALLISH = ['wall', 'doorway', 'window', 'glass'];
    // dx, dy and the stair's turn: rot 0 rises south, 1 west, 2 north, 3 east (as StructurePlan's DIRS).
    const DIRS = { south: [0, 1, 0], west: [-1, 0, 1], north: [0, -1, 2], east: [1, 0, 3] };

    const storeyOf = plan => Number(plan.storey) > 0 ? Math.floor(plan.storey) : 5;
    const floorsOf = plan => Math.max(1, Math.floor(Number(plan.height) || 1));
    const levelPx = 48;

    /** The pieces of one floor: every piece whose level is in the floor's band. */
    function band(plan, floor) {
        const S = storeyOf(plan), z0 = floor * S;
        return (plan.pieces || []).filter(piece => (Number(piece.z) || 0) >= z0 && (Number(piece.z) || 0) < z0 + S);
    }

    /** Whether a plan is still described (rooms, doors) rather than built (pieces). */
    function isDescribed(plan) {
        return !(plan.pieces || []).length && (plan.floors || []).some(floor => Object.keys(floor.rooms || {}).length);
    }

    /**
     * Build a described plan out into pieces, once: the rooms become their
     * walls, floors, doors, windows, stairs and roof, and the plan keeps
     * only the pieces from then on (its lights and screens come along).
     */
    function buildOut(plan, SP, resolve) {
        if (!isDescribed(plan) || !SP) return false;
        const floors = plan.floors.length;
        plan.pieces = SP.build(plan, 0, 0, 1, 0, resolve).map(piece => { const out = Object.assign({}, piece); delete out.id; delete out.group; return out; });
        const effects = SP.effectsOf(plan, 0, 0, resolve).filter(fx => fx.type === 'light' || fx.type === 'screen');
        if (effects.length) {
            const scratch = { width: plan.size[0], height: plan.size[1], reactor3d: { version: 1 } };
            SP.addEffects(scratch, effects, 0);
            plan.lights = (scratch.reactor3d.lights || []).map(row => { const out = Object.assign({}, row); delete out.tag; return out; });
            plan.surfaces = scratch.reactor3d.mediaSurfaces || [];
        }
        plan.floors = []; plan.stairs = []; plan.shapes = []; plan.parts = []; plan.paths = []; plan.effects = [];
        if (plan.roof) plan.roof.pitch = null;
        plan.height = Math.max(1, floors);
        return true;
    }

    /** Move everything at or above a level up (or down) by a number of levels. */
    function shift(plan, fromLevel, by) {
        for (const piece of plan.pieces || []) if ((Number(piece.z) || 0) >= fromLevel) piece.z = (Number(piece.z) || 0) + by;
        for (const light of plan.lights || []) if ((Number(light.height) || 0) >= fromLevel * levelPx) light.height = (Number(light.height) || 0) + by * levelPx;
        for (const row of plan.surfaces || []) if ((Number(row.z) || 0) >= fromLevel) row.z = (Number(row.z) || 0) + by;
    }

    /**
     * Set how many floors the structure has. More floors copy the top floor
     * up, as many times as asked, lifting whatever stood above it; fewer take
     * floors off the top and lower what stood above them. A described plan
     * copies or drops its top floor description the same way.
     */
    function setFloors(plan, count) {
        const target = Math.max(1, Math.min(24, Math.floor(Number(count)) || 1));
        if (isDescribed(plan)) {
            while (plan.floors.length < target) plan.floors.push(JSON.parse(JSON.stringify(plan.floors[plan.floors.length - 1])));
            while (plan.floors.length > target) plan.floors.pop();
            plan.height = target;
            return target;
        }
        const S = storeyOf(plan);
        let floors = floorsOf(plan);
        while (floors < target) {
            const top = floors - 1, z0 = top * S, z1 = floors * S;
            const copies = (plan.pieces || []).filter(piece => (Number(piece.z) || 0) >= z0 && (Number(piece.z) || 0) < z1).map(piece => Object.assign(JSON.parse(JSON.stringify(piece)), { z: (Number(piece.z) || 0) + S }));
            const lightCopies = (plan.lights || []).filter(l => (Number(l.height) || 0) >= z0 * levelPx && (Number(l.height) || 0) < z1 * levelPx).map(l => Object.assign(JSON.parse(JSON.stringify(l)), { height: (Number(l.height) || 0) + S * levelPx, id: '' }));
            const screenCopies = (plan.surfaces || []).filter(r => (Number(r.z) || 0) >= z0 && (Number(r.z) || 0) < z1).map(r => Object.assign(JSON.parse(JSON.stringify(r)), { z: (Number(r.z) || 0) + S }));
            shift(plan, z1, S);
            plan.pieces = (plan.pieces || []).concat(copies);
            plan.lights = (plan.lights || []).concat(lightCopies);
            plan.surfaces = (plan.surfaces || []).concat(screenCopies);
            floors++;
        }
        while (floors > target) {
            const top = floors - 1, z0 = top * S, z1 = floors * S;
            plan.pieces = (plan.pieces || []).filter(piece => !((Number(piece.z) || 0) >= z0 && (Number(piece.z) || 0) < z1));
            plan.lights = (plan.lights || []).filter(l => !((Number(l.height) || 0) >= z0 * levelPx && (Number(l.height) || 0) < z1 * levelPx));
            plan.surfaces = (plan.surfaces || []).filter(r => !((Number(r.z) || 0) >= z0 && (Number(r.z) || 0) < z1));
            shift(plan, z1, -S);
            floors--;
        }
        (plan.lights || []).forEach((light, i) => { if (!light.id) light.id = 'light' + (i + 1); });
        plan.height = target;
        return target;
    }

    /**
     * How many floors are built: up to the highest storey with walls, doors
     * or windows, or the one a flight of stairs climbs to (a roof above does
     * not count).
     */
    function occupiedFloors(plan) {
        const S = storeyOf(plan);
        let top = -1;
        for (const piece of plan.pieces || []) {
            const floor = Math.floor((Number(piece.z) || 0) / S);
            if (WALLISH.includes(piece.kind)) top = Math.max(top, floor);
            else if (piece.kind === 'stair') top = Math.max(top, floor + 1);
        }
        return top >= 0 ? Math.min(24, top + 1) : 0;
    }

    /** Whether a floor has anything on it (taking it away would lose work). */
    function hasPieces(plan, floor) { return band(plan, floor).length > 0; }

    // ---- Painting one floor ------------------------------------------------

    const at = (plan, x, y, z, kinds) => (plan.pieces || []).filter(p => p.x === x && p.y === y && (Number(p.z) || 0) === z && (!kinds || kinds.includes(p.kind)));
    const remove = (plan, test) => { plan.pieces = (plan.pieces || []).filter(p => !test(p)); };
    const add = (plan, piece) => { plan.pieces = plan.pieces || []; plan.pieces.push(piece); };
    const inPlot = (plan, x, y) => x >= 0 && y >= 0 && x < plan.size[0] && y < plan.size[1];

    function setSlab(plan, x, y, z, material) {
        remove(plan, p => p.x === x && p.y === y && (Number(p.z) || 0) === z && p.kind === 'floor');
        add(plan, { kind: 'floor', x, y, z, material: material || '' });
    }

    /** Floor slabs over cells (a dragged rectangle). */
    function paintFloor(plan, floor, cells, material) {
        const z = floor * storeyOf(plan);
        for (const [x, y] of cells) if (inPlot(plan, x, y)) setSlab(plan, x, y, z, material);
    }

    /** Wall on cells, with a slab under each (as a wall is laid on a map), replacing doors and windows there. */
    function paintWall(plan, floor, cells, material, slabMaterial) {
        const z = floor * storeyOf(plan);
        for (const [x, y] of cells) {
            if (!inPlot(plan, x, y)) continue;
            remove(plan, p => p.x === x && p.y === y && (Number(p.z) || 0) === z && WALLISH.includes(p.kind));
            if (!at(plan, x, y, z, ['floor']).length) add(plan, { kind: 'floor', x, y, z, material: slabMaterial || material || '' });
            add(plan, { kind: 'wall', x, y, z, material: material || '' });
        }
    }

    /** The wall material a cell has, to keep when it becomes a door or window. */
    const wallMaterial = (plan, x, y, z) => (at(plan, x, y, z, WALLISH)[0] || {}).material || '';

    /** A doorway in place of each wall cell given (cells with no wall are left alone). */
    function placeDoor(plan, floor, cells, material) {
        const z = floor * storeyOf(plan);
        for (const [x, y] of cells) {
            if (!at(plan, x, y, z, WALLISH).length) continue;
            const mat = material || wallMaterial(plan, x, y, z);
            remove(plan, p => p.x === x && p.y === y && (Number(p.z) || 0) === z && WALLISH.includes(p.kind));
            add(plan, { kind: 'doorway', x, y, z, material: mat });
        }
    }

    /**
     * A window in place of each wall cell given: its sill and header, and a
     * pane turned to lie along the wall (a wall running north-south, with
     * floor to its east or west, turns the pane a quarter).
     */
    function placeWindow(plan, floor, cells, material, glass) {
        const z = floor * storeyOf(plan);
        for (const [x, y] of cells) {
            if (!at(plan, x, y, z, WALLISH).length) continue;
            const mat = material || wallMaterial(plan, x, y, z);
            remove(plan, p => p.x === x && p.y === y && (Number(p.z) || 0) === z && WALLISH.includes(p.kind));
            // The wall runs the way its neighbours do: more wall above and below than to the sides is north-south.
            const northSouth = at(plan, x, y - 1, z, WALLISH).length + at(plan, x, y + 1, z, WALLISH).length;
            const eastWest = at(plan, x - 1, y, z, WALLISH).length + at(plan, x + 1, y, z, WALLISH).length;
            add(plan, { kind: 'window', x, y, z, material: mat });
            add(plan, Object.assign({ kind: 'glass', x, y, z, material: glass || 'Glass' }, northSouth > eastWest ? { rot: 1 } : {}));
        }
    }

    /**
     * Stairs from a cell, climbing the floor's band toward `dir` one step a
     * level, `width` cells wide: no slab under the steps (they are the floor)
     * and none above them on the next floor (the stairwell).
     */
    function placeStairs(plan, floor, x, y, dir, width, material) {
        const S = storeyOf(plan), z0 = floor * S;
        const d = DIRS[dir] || DIRS.north;
        const w = Math.max(1, Math.floor(Number(width) || 1));
        for (let i = 0; i < S; i++) for (let k = 0; k < w; k++) {
            const cx = x + d[0] * i + (d[1] !== 0 ? k : 0), cy = y + d[1] * i + (d[0] !== 0 ? k : 0);
            if (!inPlot(plan, cx, cy)) continue;
            remove(plan, p => p.x === cx && p.y === cy && p.kind === 'floor' && ((Number(p.z) || 0) === z0 || (Number(p.z) || 0) === z0 + S));
            remove(plan, p => p.x === cx && p.y === cy && p.kind === 'stair' && (Number(p.z) || 0) >= z0 && (Number(p.z) || 0) < z0 + S);
            add(plan, { kind: 'stair', x: cx, y: cy, z: z0 + i, rot: d[2], material: material || '' });
        }
    }

    /** Everything on the floor's band at the cells given. */
    function erase(plan, floor, cells) {
        const S = storeyOf(plan), z0 = floor * S;
        const keys = new Set(cells.map(([x, y]) => x + ',' + y));
        remove(plan, p => keys.has(p.x + ',' + p.y) && (Number(p.z) || 0) >= z0 && (Number(p.z) || 0) < z0 + S);
    }

    /** What a cell shows on the plan of a floor: the tallest-reading piece there. */
    function cellKind(plan, floor, x, y) {
        const here = band(plan, floor).filter(p => p.x === x && p.y === y);
        for (const kind of ['doorway', 'window', 'wall', 'stair', 'pillar', 'block', 'fence', 'ramp', 'roof']) {
            const piece = here.find(p => p.kind === kind);
            if (piece) return piece;
        }
        return here.find(p => p.kind === 'floor') || here[0] || null;
    }

    // ---- Selecting and moving what is on a floor ----------------------------

    /** Which pieces share a cell's slot: two of a group never stand in one cell at one level. */
    const groupOf = kind => (WALLISH.includes(kind) ? 'wall' : kind);

    /** The stairs connected to one (same turn, side by side or in a run): a flight. */
    function flightOf(plan, floor, stair) {
        const stairs = band(plan, floor).filter(p => p.kind === 'stair' && (Number(p.rot) || 0) === (Number(stair.rot) || 0));
        const byCell = new Map(stairs.map(p => [p.x + ',' + p.y, p]));
        const out = new Set([stair]), queue = [stair];
        while (queue.length) {
            const p = queue.pop();
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const next = byCell.get((p.x + dx) + ',' + (p.y + dy));
                if (next && !out.has(next)) { out.add(next); queue.push(next); }
            }
        }
        return [...out];
    }

    /**
     * What a click on a cell picks up: a flight of stairs whole, a door or a
     * window with its pane, a wall, or else the floor slab there.
     */
    function selectAt(plan, floor, x, y) {
        const here = band(plan, floor).filter(p => p.x === x && p.y === y);
        const stair = here.find(p => p.kind === 'stair');
        if (stair) return flightOf(plan, floor, stair);
        const wallish = here.filter(p => WALLISH.includes(p.kind));
        if (wallish.length) return wallish;
        const other = here.filter(p => p.kind !== 'floor');
        if (other.length) return other;
        return here.filter(p => p.kind === 'floor');
    }

    /** Everything on a floor within cells (a dragged box), stairs taken whole. */
    function selectCells(plan, floor, cells) {
        const keys = new Set(cells.map(([x, y]) => x + ',' + y));
        const out = new Set();
        for (const piece of band(plan, floor)) {
            if (!keys.has(piece.x + ',' + piece.y)) continue;
            if (piece.kind === 'stair') for (const p of flightOf(plan, floor, piece)) out.add(p);
            else out.add(piece);
        }
        return [...out];
    }

    /** The slab material nearest a cell at a level (to close a stairwell with). */
    function slabNear(plan, x, y, z) {
        let best = null, dist = Infinity;
        for (const p of plan.pieces || []) {
            if (p.kind !== 'floor' || (Number(p.z) || 0) !== z) continue;
            const d = Math.abs(p.x - x) + Math.abs(p.y - y);
            if (d < dist) { dist = d; best = p; }
            if (d <= 1) break;
        }
        return best && dist <= 2 ? best.material || '' : null;
    }

    /**
     * Take stairs off a floor: their cells get the floor back, and the
     * stairwell above closes where the floor above has floor around it.
     */
    function closeStairwell(plan, floor, stairs, keep = new Set()) {
        const S = storeyOf(plan), z0 = floor * S;
        const cells = new Map();
        for (const p of stairs) cells.set(p.x + ',' + p.y, p);
        for (const [key, stair] of cells) {
            if (keep.has(key)) continue;
            const [x, y] = key.split(',').map(Number);
            if (!at(plan, x, y, z0, ['floor', 'stair']).length) add(plan, { kind: 'floor', x, y, z: z0, material: stair.material || '' });
            if (!at(plan, x, y, z0 + S, ['floor', 'stair']).length) {
                const above = slabNear(plan, x, y, z0 + S);
                if (above !== null) add(plan, { kind: 'floor', x, y, z: z0 + S, material: above });
            }
        }
    }

    /** Take pieces away (stairs give their cells the floor back). */
    function removePieces(plan, floor, pieces) {
        const gone = new Set(pieces);
        remove(plan, p => gone.has(p));
        const stairs = pieces.filter(p => p.kind === 'stair');
        if (stairs.length) closeStairwell(plan, floor, stairs);
    }

    /**
     * Move pieces on their floor by whole cells. What stood in the same slot
     * where they land (a wall on a wall, a slab on a slab) gives way; stairs
     * open their stairwell where they land and close it where they were.
     * Returns false, changing nothing, when any would leave the plot.
     */
    function movePieces(plan, floor, pieces, dx, dy) {
        if (!pieces.length || (!dx && !dy)) return false;
        if (pieces.some(p => !inPlot(plan, p.x + dx, p.y + dy))) return false;
        const S = storeyOf(plan), z0 = floor * S;
        const moving = new Set(pieces);
        const landing = new Set(pieces.map(p => (p.x + dx) + ',' + (p.y + dy) + ',' + (Number(p.z) || 0) + ',' + groupOf(p.kind)));
        const stairs = pieces.filter(p => p.kind === 'stair');
        const stairLanding = new Set(stairs.map(p => (p.x + dx) + ',' + (p.y + dy)));
        remove(plan, p => !moving.has(p) && (landing.has(p.x + ',' + p.y + ',' + (Number(p.z) || 0) + ',' + groupOf(p.kind))
            || (stairLanding.has(p.x + ',' + p.y) && p.kind === 'floor' && ((Number(p.z) || 0) === z0 || (Number(p.z) || 0) === z0 + S))));
        const vacated = stairs.map(p => ({ x: p.x, y: p.y, material: p.material }));
        for (const p of pieces) { p.x += dx; p.y += dy; }
        if (vacated.length) closeStairwell(plan, floor, vacated, stairLanding);
        return true;
    }

    /** Turn a flight of stairs a quarter clockwise about its first step. */
    function turnStairs(plan, floor, stairs) {
        if (!stairs.length) return false;
        const rot = Number(stairs[0].rot) || 0;
        const d = Object.values(DIRS).find(v => v[2] === rot) || DIRS.north;
        // The first step is the lowest; the flight's width runs across it.
        const first = stairs.reduce((a, b) => ((Number(b.z) || 0) < (Number(a.z) || 0) ? b : a));
        const width = new Set(stairs.map(p => (d[0] !== 0 ? p.y : p.x))).size;
        const bottom = stairs.filter(p => (Number(p.z) || 0) === (Number(first.z) || 0));
        const x0 = Math.min(...bottom.map(p => p.x)), y0 = Math.min(...bottom.map(p => p.y));
        const order = ['north', 'east', 'south', 'west'];
        const current = Object.keys(DIRS).find(k => DIRS[k][2] === rot) || 'north';
        const next = order[(order.indexOf(current) + 1) % 4];
        const material = first.material || '';
        removePieces(plan, floor, stairs);
        placeStairs(plan, floor, x0, y0, next, width, material);
        return true;
    }

    // ---- The roof ------------------------------------------------------------

    /** The most used material among pieces, or ''. */
    function commonMaterial(pieces) {
        const counts = new Map();
        for (const p of pieces) if (p.material) counts.set(p.material, (counts.get(p.material) || 0) + 1);
        let best = '', n = 0;
        for (const [m, c] of counts) if (c > n) { best = m; n = c; }
        return best;
    }

    /**
     * Lay the roof again over the top floor: whatever stands above it goes,
     * and over each building of the top floor (cells joined side by side) a
     * ceiling, ramps up from the long sides' eaves for `pitch` rows, a flat
     * ridge between them and gables of blocks at the ends, the way a plan's
     * roof is built. For a roof squashed flat, or one to raise or re-pitch.
     */
    function rebuildRoof(plan, options = {}) {
        const S = storeyOf(plan), floors = floorsOf(plan), roofZ = floors * S;
        const top = band(plan, floors - 1);
        const above = (plan.pieces || []).filter(p => (Number(p.z) || 0) >= roofZ);
        const M = Object.assign({}, plan.materials || {});
        const wall = options.wall || M.wall || commonMaterial(top.filter(p => WALLISH.includes(p.kind)));
        const roofMaterial = options.roof || M.roof || commonMaterial(above.filter(p => p.kind === 'ramp')) || wall;
        const ceiling = options.ceiling || M.inner || commonMaterial(above.filter(p => p.kind === 'floor')) || commonMaterial(top.filter(p => p.kind === 'floor'));
        // Gable (ramps up from two eaves) or flat (a flat top with a low wall round its edge,
        // for a tower or a block), from the option, else the plan's own, else gable.
        const style = options.style || (plan.roof && plan.roof.style) || 'gable';
        // A built plan's roof.pitch is null (its roof is in its pieces): a rebuild lays the standard one.
        const pitchWanted = Number.isFinite(Number(options.pitch)) ? Math.max(0, Math.floor(Number(options.pitch))) : (plan.roof && plan.roof.pitch !== null && Number.isFinite(Number(plan.roof.pitch)) ? Number(plan.roof.pitch) : 6);
        plan.pieces = (plan.pieces || []).filter(p => (Number(p.z) || 0) < roofZ);
        // The top floor's footprint: every cell it has a piece in, grouped where cells touch.
        const cells = new Set(top.map(p => p.x + ',' + p.y));
        const seen = new Set(), boxes = [];
        for (const key of cells) {
            if (seen.has(key)) continue;
            const box = [Infinity, Infinity, -Infinity, -Infinity], queue = [key];
            seen.add(key);
            while (queue.length) {
                const [x, y] = queue.pop().split(',').map(Number);
                box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const next = (x + dx) + ',' + (y + dy);
                    if (cells.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
                }
            }
            boxes.push(box);
        }
        let laid = 0;
        const put = (kind, x, y, z, rot, material) => { add(plan, Object.assign({ kind, x, y, z, material: material || '' }, rot ? { rot } : {})); laid++; };
        for (const [bx0, by0, bx1, by1] of boxes) {
            // A flat roof's top is outside, in the walls' material; a gable's is the ceiling under it.
            for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) if (cells.has(x + ',' + y)) put('floor', x, y, roofZ, 0, style === 'flat' ? wall : ceiling);
            if (style === 'flat') {
                // A parapet a tile high on every edge cell of the top floor's footprint.
                for (let x = bx0; x <= bx1; x++) for (let y = by0; y <= by1; y++) {
                    if (!cells.has(x + ',' + y)) continue;
                    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !cells.has((x + dx) + ',' + (y + dy)));
                    if (edge) put('block', x, y, roofZ, 0, wall);
                }
                continue;
            }
            const pitch = Math.max(0, Math.min(Math.floor((by1 - by0) / 2), pitchWanted));
            for (let x = bx0; x <= bx1; x++) {
                const material = x === bx0 || x === bx1 ? wall : roofMaterial;
                for (let i = 0; i < pitch; i++) { put('ramp', x, by0 + i, roofZ + i, 0, material); put('ramp', x, by1 - i, roofZ + i, 2, material); }
                for (let y = by0 + pitch; y <= by1 - pitch; y++) put('floor', x, y, roofZ + pitch, 0, material);
            }
            for (const gx of [bx0, bx1]) for (let y = by0 + 1; y < by1; y++) {
                const height = Math.min(y - by0, by1 - y, pitch);
                for (let z = roofZ; z < roofZ + height; z++) put('block', gx, y, z, 0, wall);
            }
        }
        return laid;
    }

    /** Cells of a dragged rectangle, or of a straight line (the longer axis wins). */
    function rectCells(x0, y0, x1, y1) {
        const out = [];
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([x, y]);
        return out;
    }
    function lineCells(x0, y0, x1, y1) {
        const out = [];
        if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) out.push([x, y0]);
        else for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) out.push([x0, y]);
        return out;
    }
    /** The outline of a rectangle: four walls around a room in one drag. */
    function outlineCells(x0, y0, x1, y1) {
        return rectCells(x0, y0, x1, y1).filter(([x, y]) => x === Math.min(x0, x1) || x === Math.max(x0, x1) || y === Math.min(y0, y1) || y === Math.max(y0, y1));
    }

    const api = { DIRS, WALLISH, rebuildRoof, selectAt, selectCells, flightOf, movePieces, removePieces, turnStairs, storeyOf, floorsOf, occupiedFloors, band, isDescribed, buildOut, setFloors, hasPieces, paintFloor, paintWall, placeDoor, placeWindow, placeStairs, erase, cellKind, rectCells, lineCells, outlineCells };
    root.RRStructureFloors = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
