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

    /** How many floors are built: up to the highest storey with walls, doors, windows or stairs (a roof above does not count). */
    function occupiedFloors(plan) {
        const S = storeyOf(plan);
        let top = -1;
        for (const piece of plan.pieces || []) if (WALLISH.includes(piece.kind) || piece.kind === 'stair') top = Math.max(top, Math.floor((Number(piece.z) || 0) / S));
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

    const api = { DIRS, WALLISH, storeyOf, floorsOf, occupiedFloors, band, isDescribed, buildOut, setFloors, hasPieces, paintFloor, paintWall, placeDoor, placeWindow, placeStairs, erase, cellKind, rectCells, lineCells, outlineCells };
    root.RRStructureFloors = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
