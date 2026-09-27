//=============================================================================
// reactor_3d_world.js — RPG Reactor 3D world builder: terrain, pieces, water
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js): the authored ground and the 3D
 * tileset. Loaded right after the core, in the game from scriptUrls, in the
 * editor from Reactor3D.EXTENSIONS, and in Node by the core's own tail so
 * require("./reactor_3d.js") returns the whole API.
 *
 * Two halves. The rules come first and need nothing but the map data: where
 * the ground is, what a piece is, how deep the water stands. The command-line
 * checks (validate-map, build-structure) run them without three.js. The
 * meshes come second and touch THREE only when a scene is built, so a game
 * with no 3D map never reaches them.
 */

(function(root) {
    // Node alone takes the core from require; the NW.js page and the browser
    // find it on the global object, booted from scriptUrls.
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const Reactor3D = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!Reactor3D) return;

//-----------------------------------------------------------------------------
// Terrain
//
// Elevation is one whole number per tile: terraces, cliffs, floors. Terrain is
// the rolling ground on top of it — a height at every tile *corner*,
// `(width + 1) * (height + 1)` of them, fractional, in tiles — and the map's
// meshes are bent through it after they are built, so a tile's top becomes a
// bilinear patch and the cliff faces stay attached at their corners. Absent
// until painted; a map without it is exactly what it was.

Reactor3D.TERRAIN_MAX = 60;
/** Steeper than this, in tiles of rise per tile walked, and a step is blocked. */
Reactor3D.TERRAIN_SLOPE_LIMIT = 0.75;

Reactor3D.terrainOf = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const grid = sidecar && sidecar.terrain;
    if (!grid || typeof grid.length !== "number") return null;
    const size = (mapData.width + 1) * (mapData.height + 1);
    if (grid.length === size) return grid;
    // A map resized after its terrain was painted: refit the grid from the
    // width it was made for, keeping every corner that still exists.
    const oldWidth = Number(sidecar.terrainWidth) > 0 ? Number(sidecar.terrainWidth) : Number(sidecar.width) || 0;
    const stride = oldWidth + 1;
    if (!(oldWidth > 0) || grid.length % stride !== 0) return null;
    const grown = new Array(size).fill(0);
    const rows = Math.min(grid.length / stride, mapData.height + 1), cols = Math.min(stride, mapData.width + 1);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) grown[y * (mapData.width + 1) + x] = Number(grid[y * stride + x]) || 0;
    sidecar.terrain = grown;
    sidecar.terrainWidth = mapData.width;
    return grown;
};

Reactor3D.hasTerrain = function(mapData) {
    const grid = this.terrainOf(mapData);
    if (!grid) return false;
    for (let i = 0; i < grid.length; i++) if (grid[i]) return true;
    return false;
};

/** The terrain's rise at a world point (tile `x` spans world x..x+1), bilinear over its corners. */
Reactor3D.terrainHeightAt = function(mapData, wx, wz) {
    const grid = this.terrainOf(mapData);
    if (!grid) return 0;
    const width = mapData.width, height = mapData.height;
    const gx = Math.max(0, Math.min(width, wx)), gz = Math.max(0, Math.min(height, wz));
    const x0 = Math.min(width - 1, Math.floor(gx)), z0 = Math.min(height - 1, Math.floor(gz));
    const fx = gx - x0, fz = gz - z0, stride = width + 1;
    const h00 = grid[z0 * stride + x0] || 0, h10 = grid[z0 * stride + x0 + 1] || 0;
    const h01 = grid[(z0 + 1) * stride + x0] || 0, h11 = grid[(z0 + 1) * stride + x0 + 1] || 0;
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
};

/** Where the ground is at a world point: the cell's elevation plus the terrain's rise there. */
Reactor3D.groundHeightAt = function(mapData, wx, wz, near) {
    const base = this.elevationAt(mapData, Math.floor(wx), Math.floor(wz)) + this.terrainHeightAt(mapData, wx, wz);
    // `near` is a world height; the piece stacks count from the cell's ground.
    return base + this.pieceSurfaceAt(mapData, wx, wz, Number.isFinite(near) ? near - base : 0, base);
};

/**
 * The ground a camera looks at, over a point that is not where anyone stands:
 * the view's middle, which drifts over walls. A stack of walls reads as its
 * top (a character cannot step into it), so over a wall beside a door the view
 * jumped to the roof. More than a step above the player's own floor (`near`)
 * is not ground anyone is on; the player's floor is.
 */
Reactor3D.viewGroundAt = function(mapData, wx, wz, near) {
    const ground = this.groundHeightAt(mapData, wx, wz, near);
    if (Number.isFinite(near) && ground > near + 1 + this.TERRAIN_SLOPE_LIMIT) return near;
    return ground;
};

/** The ground under a character, at the middle of its cell as it moves between cells. */
Reactor3D.characterGround = function(mapData, character) {
    if (!character) return this.DEFAULT_ELEVATION;
    const x = Number.isFinite(character._realX) ? character._realX : character.x || 0;
    const y = Number.isFinite(character._realY) ? character._realY : character.y || 0;
    // Where the character last stood decides which floor of a house it is
    // on; `locate` forgets it, so a transfer lands on the ground floor.
    const near = character._reactorGround;
    let ground = this.groundHeightAt(mapData, x + 0.5, y + 0.5, near);
    // A diagonal step passes over the corner cell between its two cells; beside
    // a doorway that corner is a wall, whose stack reads as its top, and the
    // character was lifted onto the roof (and stayed, standing there). A surface
    // out of a step's reach is not ground anyone walked onto: the cell being
    // entered is.
    if (Number.isFinite(near) && ground > near + 1 + this.TERRAIN_SLOPE_LIMIT
        && Number.isFinite(character.x) && Number.isFinite(character.y)) {
        ground = this.groundHeightAt(mapData, character.x + 0.5, character.y + 0.5, near);
    }
    character._reactorGround = ground;
    return ground;
};

/**
 * A step between two cells the terrain makes too steep to take: the rise
 * from either cell's middle to the middle of the edge between them, or
 * across the whole step. The edge is checked as well as the centres so a
 * ridge on the shared corner, which two flat centres would not see, still
 * blocks.
 */
Reactor3D.terrainBlocks = function(mapData, x, y, x2, y2, near) {
    // Pieces stand on the same rule: a floor is a small step, a block a
    // whole level, a stair a slope that stays under the limit. `near` is
    // the height the character stands at now, which picks its floor.
    if (!mapData || (!this.terrainOf(mapData) && !this.hasPieces(mapData) && !this.hasWater(mapData))) return false;
    const limit = this.TERRAIN_SLOPE_LIMIT;
    // Off a ledge onto the top of a ladder: the climber takes hold there.
    const ladderTo = this.hasPieces(mapData) ? this.ladderAt(mapData, x2, y2) : null;
    if (ladderTo && Number.isFinite(near) && Math.abs(near - ladderTo.top) <= limit && this.groundHeightAt(mapData, x2 + 0.5, y2 + 0.5, near) < ladderTo.top - limit) return false;
    // Up a ladder, a climber is as high as it holds, whatever is under it.
    const ladderFrom = this.hasPieces(mapData) ? this.ladderAt(mapData, x, y) : null;
    const from = ladderFrom && Number.isFinite(near) && near > ladderFrom.bottom + 0.02 && near <= ladderFrom.top + 0.05
        ? near : this.groundHeightAt(mapData, x + 0.5, y + 0.5, near);
    const onLadder = !!ladderFrom && from === near;
    const ex = (x + x2) / 2 + 0.5, ey = (y + y2) / 2 + 0.5;
    // The edge sample can fall on the ladder's own cell, where the climber's height stands.
    const edge = onLadder && Math.floor(ex) === x && Math.floor(ey) === y ? from : this.groundHeightAt(mapData, ex, ey, from);
    const to = this.groundHeightAt(mapData, x2 + 0.5, y2 + 0.5, edge);
    const swim = this.hasWater(mapData) ? this.swimRule() : null;
    if (swim) {
        // A game that swims (reactor_physics): deep water is entered from
        // anywhere at or above its surface (a swim, or a fall into it) and
        // left onto a bank no more than a step over the surface; water a
        // character stands in is walked on its bottom like any ground.
        const levelTo = this.waterLevelAt(mapData, x2, y2), levelFrom = this.waterLevelAt(mapData, x, y);
        const deepTo = levelTo !== null && levelTo - to > swim.swimDepth;
        const deepFrom = levelFrom !== null && levelFrom - from > swim.swimDepth;
        if (deepTo) return !(deepFrom || from >= levelTo - limit);
        if (deepFrom) return to - levelFrom > limit;
    } else if (this.waterDepthAt(mapData, x2 + 0.5, y2 + 0.5, edge) > this.WATER_WADE) {
        // Water deeper than a wade is not walked into.
        return true;
    }
    if (Math.abs(edge - from) > limit || Math.abs(to - edge) > limit) return true;
    // A stair is climbed along its run and nothing else: its sides are as
    // solid as a wall (crossing a hall in a camera-relative walk drifted
    // onto the run from the side and up to the next floor), and a raised
    // step stands on a solid down to the ground, not a passage beneath.
    const stairHere = this.stairPieceAt(mapData, x, y), stairThere = this.stairPieceAt(mapData, x2, y2);
    if (stairHere || stairThere) {
        const dx = x2 - x, dy = y2 - y;
        for (const stair of [stairHere, stairThere]) {
            if (!stair) continue;
            const axis = this.stairAxis(stair.rot);
            if (dx * axis[0] + dy * axis[1] === 0) return true;
        }
        if (stairThere && to < this.pieceBaseAt(mapData, x2, y2) + stairThere.z - 1e-6) return true;
        // A stair rises a whole tile across its cell, so two stairs in a row
        // stand a tile apart at their middles and each half of the step is a
        // half tile: built to be climbed, judged by its halves.
        return false;
    }
    return Math.abs(to - from) > limit;
};

Reactor3D.stairAt = function(mapData, x, y) {
    return !!this.stairPieceAt(mapData, x, y);
};

/** The stair on a cell, or null. */
Reactor3D.stairPieceAt = function(mapData, x, y) {
    const stack = this.piecesAt(mapData, x, y);
    if (!stack) return null;
    for (const piece of stack) if (piece.kind === "stair" && !piece.standIn) return piece;
    return null;
};

/**
 * The ladder on a cell: the way it climbs (a map direction, 2/4/6/8, toward
 * the wall it leans on) and the world heights of its foot and its top.
 */
Reactor3D.ladderAt = function(mapData, x, y) {
    const stack = this.piecesAt(mapData, x, y);
    if (!stack) return null;
    let low = Infinity, high = -Infinity, rot = 0;
    for (const piece of stack) {
        if (piece.kind !== "ladder") continue;
        if (piece.z < low) { low = piece.z; rot = piece.rot || 0; }
        high = Math.max(high, piece.z + 1);
    }
    if (!Number.isFinite(low)) return null;
    const base = this.pieceBaseAt(mapData, x, y);
    // A ladder whose foot stands a step over the ground (laid on a slab) is still reached from it.
    const ground = this.groundHeightAt(mapData, x + 0.5, y + 0.5, base + low);
    const foot = base + low - ground <= 1 + this.TERRAIN_SLOPE_LIMIT ? Math.min(base + low, ground) : base + low;
    return { dir: [2, 4, 8, 6][((rot % 4) + 4) % 4], bottom: foot, top: base + high };
};

/** The way a stair climbs, in cells: rot 0 rises south, each turn is clockwise seen from above. */
Reactor3D.stairAxis = function(rot) {
    return [[0, 1], [-1, 0], [0, -1], [1, 0]][((rot % 4) + 4) % 4];
};

/**
 * Bend the built meshes through the terrain: every vertex rises by the field
 * at its own x/z, so a tile top follows its corners, a cliff face stays
 * joined to the top it hangs from, and a standing cut-out (whose vertices
 * share an anchor) rides up whole. Tops and sides of a terrace keep their
 * relative shape. Nothing to do on a map without terrain.
 */
Reactor3D.displaceByTerrain = function(built, mapData) {
    if (!built || !built.groups || !this.hasTerrain(mapData)) return built;
    for (const group of built.groups) {
        const positions = group.positions;
        if (!positions) continue;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] += this.terrainHeightAt(mapData, positions[i], positions[i + 2]);
        }
    }
    return built;
};

//-----------------------------------------------------------------------------
// Pieces
//
// A 3D tileset. A piece is a block painted on a cell at a level: a wall
// cube, a floor slab, a pillar, a stair, a ramp, a gable, a doorway, a
// window, a fence. Pieces snap to whole cells, turn in quarter turns and
// stack in whole levels on top of the ground (elevation plus terrain), so a
// house is a rectangle of blocks dragged out, a doorway dropped in, and a
// roof laid across — the way a 2D map is tiles rather than pictures. Each
// piece names a *material*, a tileable image under img/materials, which is
// what makes a wall stone or plaster.
//
// Stored in the sidecar as `pieces: [{id, kind, x, y, z, rot, material}]`.
// The ground under a character is the top of the highest piece on its cell
// (`pieceSurfaceAt`), so a floor at level 1 is walked on and a stair climbs
// to it; anything a character cannot step up onto (a block, a fence) blocks
// through the same rise rule the terrain uses.

/**
 * Shapes: the free pieces. Unlike the cell pieces they have a size in
 * tiles (`size: [w, h, d]`, the cell they stand on being the middle of
 * the footprint, `offset: [ox, oy]` a nudge of the middle within it), a
 * free turn in degrees (`angle`, clockwise from above), and a `tilt` and
 * `roll` in degrees about their own middle, so a tower is a cylinder five
 * tiles across with a dome on top, a market tent a cone, and a fallen
 * column a cylinder rolled onto its side. The cells a shape's solid parts
 * cover block like a wall of its height; a tube, a ring, an arch and a
 * tunnel are hollow, walked into and through.
 */
Reactor3D.SHAPE_KINDS = ["box", "wedge", "pyramid", "prism", "hull", "spike", "cylinder", "capsule", "tube", "cone", "dome", "sphere", "dish", "fin", "arch", "tunnel", "ring"];
/**
 * The settings a kind can carry beyond its size: `sides` (how many flat
 * faces round a hull, a spike, a capsule or a dish) and `taper` (how wide
 * the top is against the bottom, 0 a point, 1 straight; a fin's tip
 * against its root). A shape without them wears its kind's own.
 */
Reactor3D.SHAPE_PARAMS = { hull: { sides: 8, taper: 0.8 }, spike: { sides: 6, taper: 0 }, capsule: { sides: 24 }, dish: { sides: 32 }, fin: { taper: 0.4 }, cylinder: { sweep: 360 }, tube: { sweep: 360, thick: 0.3 }, ring: { sweep: 360, thick: 0.2 } };
Reactor3D.shapeParams = function(piece) {
    const own = this.SHAPE_PARAMS[piece.kind] || {};
    const out = {};
    if ("sides" in own) { const n = Math.round(Number(piece.sides)); out.sides = Number.isFinite(n) ? Math.max(3, Math.min(32, n)) : own.sides; }
    if ("taper" in own) { const t = Number(piece.taper); out.taper = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : own.taper; }
    // How much of the circle a round shape goes round, in degrees, the arc centred on its
    // back (+v) so the opening faces forward: a horseshoe deck, a curved console, a bent pipe.
    if ("sweep" in own) { const a = Number(piece.sweep); out.sweep = Number.isFinite(a) ? Math.max(1, Math.min(360, Math.round(a))) : own.sweep; }
    // How thick a hollow shape's wall is, as a fraction of its half width: a rail is thin, a silo thick.
    if ("thick" in own) { const t = Number(piece.thick); out.thick = Number.isFinite(t) ? Math.max(0.02, Math.min(1, t)) : own.thick; }
    return out;
};
/** Whether a ground point of a swept shape, at `lx`, `lz` from its middle in its own frame, lies within the arc. */
Reactor3D.withinSweep = function(sweep, lx, lz, slack) {
    if (!(sweep < 360)) return true;
    const a = Math.atan2(lz, lx);
    let away = Math.abs(a - Math.PI / 2);
    if (away > Math.PI) away = Math.PI * 2 - away;
    return away <= (sweep / 2) * Math.PI / 180 + (slack || 0);
};
Reactor3D.PIECE_KINDS = ["wall", "block", "floor", "pillar", "stair", "ramp", "roof", "doorway", "window", "fence", "glass", "ladder"].concat(Reactor3D.SHAPE_KINDS);
/**
 * What a material's name says about how it is drawn: a name beginning
 * "Glass" is see-through (tinted, a third opaque, both faces), a name
 * ending "Glow" is lit from within (full bright whatever the lights, so a
 * console face or a light strip reads as a light source). Any other name
 * is a tileable image under img/materials, shaded by the lights.
 */
Reactor3D.materialLook = function(name) {
    const text = String(name || "");
    return { glass: /^glass/i.test(text), glow: /glow$/i.test(text) };
};
Reactor3D.isShapeKind = function(kind) { return this.SHAPE_KINDS.includes(kind); };
/** The shapes with an open middle: only their walls block. */
Reactor3D.HOLLOW_KINDS = ["tube", "ring", "arch", "tunnel"];
/** A shape's middle on the ground: its cell's middle plus its offset, in tiles. */
Reactor3D.shapeCentre = function(piece) {
    const o = Array.isArray(piece.offset) ? piece.offset : [0, 0];
    // A stand-in on another cell of the footprint remembers the cell the shape stands on.
    const ax = Array.isArray(piece.anchor) ? piece.anchor[0] : piece.x, ay = Array.isArray(piece.anchor) ? piece.anchor[1] : piece.y;
    return [ax + 0.5 + (Number(o[0]) || 0), ay + 0.5 + (Number(o[1]) || 0)];
};
/** Whether a shape is turned off the vertical (a tilt or a roll). */
Reactor3D.shapeTurned = function(piece) {
    return !!(((Number(piece.tilt) || 0) % 360) || ((Number(piece.roll) || 0) % 360));
};
/**
 * The map from a shape's unit cell (u across, y up, v along, each 0..1)
 * to the world: stretched to its size, rolled about its own forward axis,
 * tilted about its sideways axis, turned about the vertical, all about
 * the middle of its box, then stood at its cell with its lowest corner at
 * its height, so a rolled column lies on the ground. `base` is the ground
 * under the piece.
 */
Reactor3D.shapePlacer = function(piece, base) {
    const [w, h, d] = this.shapeSize(piece);
    const [cx, cz] = this.shapeCentre(piece);
    const rad = deg => (Number(deg) || 0) * Math.PI / 180;
    const yaw = -rad((Number(piece.angle) || 0) + (Number(piece.rot) || 0) * 90), tilt = rad(piece.tilt), roll = rad(piece.roll);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(roll), sr = Math.sin(roll);
    const turned = this.shapeTurned(piece);
    const spin = (u, y, v) => {
        let x = (u - 0.5) * w, yy = (y - 0.5) * h, z = (v - 0.5) * d;
        if (turned) {
            let t = x * cr - yy * sr; yy = x * sr + yy * cr; x = t;
            t = yy * ct - z * st; z = yy * st + z * ct; yy = t;
        }
        const tx = x * cy + z * sy; z = -x * sy + z * cy; x = tx;
        return [x, yy, z];
    };
    let lowest = -h / 2;
    if (turned) { lowest = Infinity; for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) lowest = Math.min(lowest, spin(u, y, v)[1]); }
    const oy = (Number(base) || 0) + (Number(piece.z) || 0) - lowest;
    return (u, y, v) => { const q = spin(u, y, v); return [cx + q[0], oy + q[1], cz + q[2]]; };
};
/**
 * Whether a point of the ground, `lx` across and `lz` along from a
 * shape's middle in its own turned frame (tiles), is under a solid part
 * of the shape: a round one inside its ellipse, a hollow one in its wall,
 * an arch or tunnel in its posts. `slack` widens the solid part so the
 * rim's cells block too.
 */
Reactor3D.shapeSolidAt = function(kind, lx, lz, hw, hd, slack, sweep, thick) {
    const s = slack || 0;
    if (sweep < 360 && !this.withinSweep(sweep, lx, lz, 0.1)) return false;
    const wall = Number.isFinite(thick) ? thick : (kind === "ring" ? 0.2 : 0.3);
    const inside = (kw, kd, grow) => { const a = hw * kw + grow, b = hd * kd + grow; return a > 0 && b > 0 && (lx * lx) / (a * a) + (lz * lz) / (b * b) <= 1; };
    switch (kind) {
        case "cylinder": case "cone": case "dome": case "sphere": case "hull": case "spike": case "capsule": case "dish": return inside(1, 1, s);
        case "tube": return inside(1, 1, s) && !inside(1 - wall, 1 - wall, -s);
        case "ring": return inside(1, 1, s) && !inside(1 - 2 * wall, 1 - 2 * wall, -s);
        case "arch": case "tunnel": return Math.abs(lx) <= hw + s && Math.abs(lz) <= hd + s && Math.abs(lx) >= hw * 0.7 - s;
        default: return Math.abs(lx) <= hw + s && Math.abs(lz) <= hd + s;
    }
};
/** A shape's [w, h, d] in tiles; a cell piece is one by one by its height. */
Reactor3D.shapeSize = function(piece) {
    const size = Array.isArray(piece.size) ? piece.size : null;
    const n = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
    return size ? [n(size[0], 1), n(size[1], 1), n(size[2], n(size[0], 1))] : [1, this.pieceHeight(piece.kind), 1];
};
/** The cells a piece's footprint covers: one for a cell piece, w by d round the middle for a shape. */
Reactor3D.pieceFootprint = function(piece) {
    if (!this.isShapeKind(piece.kind)) return [[piece.x, piece.y]];
    const SLACK = 0.15;
    const [w, , d] = this.shapeSize(piece);
    const hw = w / 2, hd = d / 2;
    const [cx, cz] = this.shapeCentre(piece);
    const cells = [];
    if (this.shapeTurned(piece)) {
        // Tilted or rolled: the shadow the turned box throws on the ground, the hull of
        // its corners; a cell counts when its middle lies in it or within the slack of it.
        const at = this.shapePlacer(piece, 0);
        const pts = [];
        for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) { const q = at(u, y, v); pts.push([q[0], q[2]]); }
        const hull = this.convexHull(pts);
        const x0 = Math.floor(Math.min(...hull.map(c => c[0])) - SLACK), x1 = Math.ceil(Math.max(...hull.map(c => c[0])) + SLACK);
        const y0 = Math.floor(Math.min(...hull.map(c => c[1])) - SLACK), y1 = Math.ceil(Math.max(...hull.map(c => c[1])) + SLACK);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (x < 0 || y < 0) continue;
            if (this.hullReach([x + 0.5, y + 0.5], hull) <= SLACK) cells.push([x, y]);
        }
    } else {
        const angle = ((Number(piece.angle) || 0) + (Number(piece.rot) || 0) * 90) * Math.PI / 180;
        const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [cx + u * Math.cos(angle) - v * Math.sin(angle), cz + u * Math.sin(angle) + v * Math.cos(angle)]);
        const x0 = Math.floor(Math.min(...corners.map(c => c[0])) - SLACK), x1 = Math.ceil(Math.max(...corners.map(c => c[0])) + SLACK) - 1;
        const y0 = Math.floor(Math.min(...corners.map(c => c[1])) - SLACK), y1 = Math.ceil(Math.max(...corners.map(c => c[1])) + SLACK) - 1;
        // A cell counts when its middle, seen from the shape's own frame, is under a solid part.
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (x < 0 || y < 0) continue;
            const px = x + 0.5 - cx, pz = y + 0.5 - cz;
            const u = px * Math.cos(-angle) - pz * Math.sin(-angle), v = px * Math.sin(-angle) + pz * Math.cos(-angle);
            const params = this.shapeParams(piece);
            if (this.shapeSolidAt(piece.kind, u, v, hw, hd, SLACK, params.sweep, params.thick)) cells.push([x, y]);
        }
    }
    if (!cells.length && !this.HOLLOW_KINDS.includes(piece.kind)) cells.push([piece.x, piece.y]);
    return cells;
};
/** The convex hull of ground points [[x, z]], counter-clockwise, by monotone chain. */
Reactor3D.convexHull = function(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const q of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop(); lower.push(q); }
    for (let i = pts.length - 1; i >= 0; i--) { const q = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop(); upper.push(q); }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
};
/** How far a ground point lies outside a convex hull: zero inside, else the distance to its edge. */
Reactor3D.hullReach = function(point, hull) {
    if (hull.length < 3) return Infinity;
    let inside = true, nearest = Infinity;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        const ex = b[0] - a[0], ez = b[1] - a[1];
        if (ex * (point[1] - a[1]) - ez * (point[0] - a[0]) < 0) inside = false;
        const len2 = ex * ex + ez * ez || 1;
        const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * ex + (point[1] - a[1]) * ez) / len2));
        nearest = Math.min(nearest, Math.hypot(point[0] - (a[0] + ex * t), point[1] - (a[1] + ez * t)));
    }
    return inside ? 0 : nearest;
};
// Levels a piece may stand at: 24 storeys of five tiles, so a tower plan is never cut short by the store.
Reactor3D.PIECE_MAX_LEVEL = 240;
Reactor3D.PIECE_FLOOR_THICKNESS = 0.1;
/**
 * A storey, in tiles. The bundled characters stand three tiles tall, a
 * little under 1.8 m, so a tile is about 0.6 m and a room a person walks
 * into is five tiles to the ceiling: a 3 m storey. The pieces a character
 * walks past or through are a storey tall — a wall, a doorway, a window, a
 * pillar — and a block is the one-tile brick (a 60 cm cube) for garden
 * walls, steps and anything built up by hand.
 */
Reactor3D.PIECE_STOREY = 5;
Reactor3D.pieceHeight = function(kind) {
    return kind === "wall" || kind === "doorway" || kind === "window" || kind === "pillar" || kind === "glass" ? this.PIECE_STOREY : 1;
};

/**
 * The finishes a built piece can wear over its material, as model surfaces
 * (see `readModelSurface`): a mirror (sharp, the party in it), chrome,
 * polished, glossy paint and gold.
 */
Reactor3D.PIECE_FINISHES = {
    mirror: { reflect: 1, gloss: 1, metal: 1, tint: "#ffffff", texture: 0 },
    chrome: { reflect: 1, gloss: 0.95, metal: 1, tint: "#ffffff", texture: 0.15 },
    polished: { reflect: 0.9, gloss: 0.9, metal: 0.55, tint: "#ffffff", texture: 0.85 },
    glossy: { reflect: 0.9, gloss: 0.9, metal: 0, tint: "#ffffff", texture: 1 },
    gold: { reflect: 1, gloss: 0.85, metal: 1, tint: "#ffcc55", texture: 0.2 }
};

Reactor3D.normalizePiece = function(raw, mapData) {
    if (!raw || typeof raw !== "object") return null;
    const kind = this.PIECE_KINDS.includes(raw.kind) ? raw.kind : null;
    if (!kind) return null;
    const x = Math.floor(Number(raw.x)), y = Math.floor(Number(raw.y));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return null;
    if (mapData && (x >= mapData.width || y >= mapData.height)) return null;
    const shape = this.isShapeKind(kind);
    // A shape stands at any quarter tile; a cell piece at a whole level.
    const z = Math.max(0, Math.min(this.PIECE_MAX_LEVEL, shape ? Math.round((Number(raw.z) || 0) * 4) / 4 : Math.floor(Number(raw.z)) || 0));
    const rot = ((Math.floor(Number(raw.rot)) || 0) % 4 + 4) % 4;
    const material = typeof raw.material === "string" ? raw.material.trim() : "";
    const id = Number(raw.id);
    const piece = { id: Number.isFinite(id) && id > 0 ? Math.floor(id) : 0, kind, x, y, z, rot, material };
    const group = Number(raw.group);
    if (Number.isFinite(group) && group > 0) piece.group = Math.floor(group);
    if (typeof raw.finish === "string" && Object.prototype.hasOwnProperty.call(this.PIECE_FINISHES, raw.finish)) piece.finish = raw.finish;
    // A surface of its own (the sliders): it wins over the finish's.
    const surface = raw.surface && typeof raw.surface === "object" && this.readModelSurface ? this.readModelSurface({ surface: raw.surface }) : null;
    if (surface) piece.surface = surface;
    if (this.isShapeKind(kind)) {
        const size = Array.isArray(raw.size) ? raw.size : [];
        const n = (v, fallback) => { const k = Number(v); return Number.isFinite(k) && k > 0 ? Math.min(60, Math.round(k * 100) / 100) : fallback; };
        piece.size = [n(size[0], 1), n(size[1], 1), n(size[2], n(size[0], 1))];
        const angle = Number(raw.angle);
        piece.angle = Number.isFinite(angle) ? ((Math.round(angle) % 360) + 360) % 360 : 0;
        // A tilt, a roll and an offset only when they are something, so a plain shape stays plain.
        const turn = v => { const k = Number(v); return Number.isFinite(k) ? ((Math.round(k) % 360) + 360) % 360 : 0; };
        const tilt = turn(raw.tilt), roll = turn(raw.roll);
        if (tilt) piece.tilt = tilt;
        if (roll) piece.roll = roll;
        const offset = Array.isArray(raw.offset) ? raw.offset.slice(0, 2).map(v => Math.max(-0.5, Math.min(0.5, Math.round((Number(v) || 0) * 100) / 100))) : null;
        if (offset && (offset[0] || offset[1])) piece.offset = [offset[0] || 0, offset[1] || 0];
        const own = this.SHAPE_PARAMS[kind] || {};
        if ("sides" in own && Number.isFinite(Number(raw.sides))) piece.sides = Math.max(3, Math.min(32, Math.round(Number(raw.sides))));
        if ("taper" in own && Number.isFinite(Number(raw.taper))) piece.taper = Math.max(0, Math.min(1, Math.round(Number(raw.taper) * 100) / 100));
        if ("sweep" in own && Number.isFinite(Number(raw.sweep))) piece.sweep = Math.max(1, Math.min(360, Math.round(Number(raw.sweep))));
        if ("thick" in own && Number.isFinite(Number(raw.thick))) piece.thick = Math.max(0.02, Math.min(1, Math.round(Number(raw.thick) * 100) / 100));
    }
    return piece;
};

/**
 * The map's pieces, indexed by cell. Cached against the sidecar's own
 * array: the editor writes a new array on every change, so an edit is a
 * new index and a frame's many ground lookups share one.
 */
Reactor3D.pieceIndex = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const raw = sidecar && sidecar.pieces;
    if (!Array.isArray(raw) || !raw.length) return null;
    const memo = this._pieceIndexMemo || (this._pieceIndexMemo = new WeakMap());
    const known = memo.get(raw);
    if (known) return known;
    const cells = new Map();
    const list = [];
    for (const entry of raw) {
        const piece = this.normalizePiece(entry, mapData);
        if (!piece) continue;
        list.push(piece);
        // A shape stands on every cell of its footprint: the cell rule sees a
        // stand-in there of the shape's height, so nothing walks into a tower.
        for (const [fx, fy] of this.pieceFootprint(piece)) {
            const key = fy * 65536 + fx;
            let stack = cells.get(key);
            if (!stack) cells.set(key, stack = []);
            stack.push(fx === piece.x && fy === piece.y ? piece : Object.assign({}, piece, { x: fx, y: fy, standIn: true, anchor: [piece.x, piece.y] }));
        }
    }
    // Each cell's stack from the ground up, which is the order the surface
    // rule reads it in.
    for (const stack of cells.values()) stack.sort((a, b) => a.z - b.z);
    // Each stamped building's footprint, so a cutaway reaches its walls and no further.
    const groups = new Map();
    for (const piece of list) {
        if (!piece.group) continue;
        const box = groups.get(piece.group) || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        box.x0 = Math.min(box.x0, piece.x); box.y0 = Math.min(box.y0, piece.y); box.x1 = Math.max(box.x1, piece.x); box.y1 = Math.max(box.y1, piece.y);
        groups.set(piece.group, box);
    }
    const index = { list, cells, groups };
    memo.set(raw, index);
    return index;
};

Reactor3D.piecesOf = function(mapData) {
    const index = this.pieceIndex(mapData);
    return index ? index.list : [];
};

Reactor3D.hasPieces = function(mapData) {
    return !!this.pieceIndex(mapData);
};

Reactor3D.piecesAt = function(mapData, x, y) {
    const index = this.pieceIndex(mapData);
    if (!index) return null;
    return index.cells.get(y * 65536 + x) || null;
};

/**
 * A point in a cell (u, v in 0..1, +v south) seen from the piece's own
 * frame, undoing its quarter turns: a stair rises along its own +v
 * whichever way it was turned.
 */
Reactor3D.pieceLocal = function(piece, u, v) {
    let du = u - 0.5, dv = v - 0.5;
    for (let i = 0; i < piece.rot; i++) {
        const next = dv;
        dv = -du;
        du = next;
    }
    return { u: du + 0.5, v: dv + 0.5 };
};

/**
 * How high a piece's walkable top stands over the cell's ground at a
 * point of the cell.
 */
Reactor3D.pieceTop = function(piece, u, v) {
    switch (piece.kind) {
        case "floor": return piece.z + this.PIECE_FLOOR_THICKNESS;
        case "stair":
        case "ramp": {
            const local = this.pieceLocal(piece, u, v);
            return piece.z + Math.max(0, Math.min(1, local.v));
        }
        // A doorway is stood in at its threshold: the level it is laid at,
        // which is the ground downstairs and the floor's level upstairs.
        case "doorway": return piece.z;
        default:
            if (this.isShapeKind(piece.kind)) {
                // A wedge is a ramp: its top rises along its own +v, so a long low wedge is a
                // slope walked in steps under the limit.
                if (piece.kind === "wedge" && !this.shapeTurned(piece)) {
                    const [w, h, d] = this.shapeSize(piece);
                    const [cx, cz] = this.shapeCentre(piece);
                    const angle = -((Number(piece.angle) || 0) + (Number(piece.rot) || 0) * 90) * Math.PI / 180;
                    const px = (piece.x + (Number.isFinite(u) ? u : 0.5)) - cx, pz = (piece.y + (Number.isFinite(v) ? v : 0.5)) - cz;
                    const lv = px * Math.sin(angle) + pz * Math.cos(angle);
                    const t = Math.max(0, Math.min(1, lv / d + 0.5));
                    return piece.z + h * t;
                }
                if (!this.shapeTurned(piece)) return piece.z + this.shapeSize(piece)[1];
                const at = this.shapePlacer(piece, 0);
                // A rolled or tilted wedge is still a ramp: its slope (y = v in its own frame) is an
                // affine sheet, so the point under the walker is found by inverting it across the
                // ground, and the height read there. (Its highest corner made a crooked ramp a wall.)
                if (piece.kind === "wedge") {
                    const p00 = at(0, 0, 0), p10 = at(1, 0, 0), p01 = at(0, 1, 1);
                    const ax = p10[0] - p00[0], az = p10[2] - p00[2], bx = p01[0] - p00[0], bz = p01[2] - p00[2];
                    const det = ax * bz - bx * az;
                    if (Math.abs(det) > 1e-9) {
                        const qx = piece.x + (Number.isFinite(u) ? u : 0.5) - p00[0], qz = piece.y + (Number.isFinite(v) ? v : 0.5) - p00[2];
                        const su = Math.max(0, Math.min(1, (qx * bz - bx * qz) / det)), sv = Math.max(0, Math.min(1, (ax * qz - qx * az) / det));
                        return p00[1] + su * (p10[1] - p00[1]) + sv * (p01[1] - p00[1]);
                    }
                }
                let top = -Infinity;
                for (const u of [0, 1]) for (const y of [0, 1]) for (const v of [0, 1]) top = Math.max(top, at(u, y, v)[1]);
                return top;
            }
            return piece.z + this.pieceHeight(piece.kind);
    }
};

/**
 * What a character on the cell stands on, over the cell's ground, at a
 * world point, given how high the character already stands (`near`).
 *
 * The stack is read from the ground up. A piece whose foot is within a
 * level and a step of the surface so far joins it (a floor on blocks, a
 * wall on a wall). A piece higher than that opens a gap, and the gap is
 * where the character's own height decides: within reach of the piece's
 * foot, the character is on the upper layer and the surface jumps to it;
 * out of reach, the character is on the lower layer and the reading
 * stops. So a house has two walkable floors — downstairs you stand on the
 * ground-floor slab under the upper floor, and coming up the stairs you
 * arrive on the upper floor — a roof of ramps over either is never
 * walked on, a doorway under a wall is the ground, a floor two levels up
 * with nothing under it is a bridge walked under from below and a floor
 * arrived at from a stair.
 */
Reactor3D.pieceSurfaceAt = function(mapData, wx, wz, near, base) {
    const index = this.pieceIndex(mapData);
    if (!index) return 0;
    const x = Math.floor(wx), y = Math.floor(wz);
    const stack = index.cells.get(y * 65536 + x);
    if (!stack) return 0;
    const reach = 1 + this.TERRAIN_SLOPE_LIMIT + 1e-6;
    const standing = Number.isFinite(near) ? near : 0;
    let surface = 0;
    const u = wx - x, v = wz - y;
    // A shape is drawn from one base, its own cell's ground: over rising ground its top is
    // read from there, not from each cell it covers (a ramp laid on a hill was a wall).
    const cellBase = Number.isFinite(base) ? base : null;
    const shapeTop = piece => {
        const top = this.pieceTop(piece, u, v);
        if (cellBase === null || !this.isShapeKind(piece.kind)) return top;
        const anchor = Array.isArray(piece.anchor) ? piece.anchor : [piece.x, piece.y];
        return top + this.pieceBaseAt(mapData, anchor[0], anchor[1]) - cellBase;
    };
    for (const piece of stack) {
        // A ladder is climbed, never stood on.
        if (piece.kind === "ladder") continue;
        if (piece.z > surface + reach) {
            if (standing + reach < piece.z) break;
            surface = Math.max(0, shapeTop(piece));
            continue;
        }
        const height = shapeTop(piece);
        if (height > surface) surface = height;
    }
    return surface;
};

/** The ground a piece stands on: the cell's elevation plus the terrain at its middle. */
Reactor3D.pieceBaseAt = function(mapData, x, y) {
    return this.elevationAt(mapData, x, y) + this.terrainHeightAt(mapData, x + 0.5, y + 0.5);
};

//-----------------------------------------------------------------------------
// Water
//
// Water poured into a hollow of the ground: a sheet at one world height over
// the hollow's cells, drawn as a moving translucent plane. Ground below the
// sheet by more than a wade is impassable; a shore is terrain sloping under
// it. Stored in the sidecar as `water: [{ x0, y0, x1, y1, level, material,
// mask }]`, cells inclusive; `mask` is one character per cell of the box,
// row by row, "1" where the water is. A sheet without a mask (an older one)
// covers its whole box.

Reactor3D.WATER_WADE = 0.45;
Reactor3D.WATER_MAX_LEVEL = 60;

Reactor3D.normalizeWater = function(raw, mapData) {
    if (!raw || typeof raw !== "object") return null;
    let x0 = Math.floor(Number(raw.x0)), y0 = Math.floor(Number(raw.y0)), x1 = Math.floor(Number(raw.x1)), y1 = Math.floor(Number(raw.y1));
    if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (mapData) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(mapData.width - 1, x1); y1 = Math.min(mapData.height - 1, y1); }
    if (x1 < x0 || y1 < y0) return null;
    const level = Math.max(-this.WATER_MAX_LEVEL, Math.min(this.WATER_MAX_LEVEL, Number(raw.level) || 0));
    const region = { x0, y0, x1, y1, level: Math.round(level * 100) / 100, material: typeof raw.material === "string" ? raw.material.trim() : "" };
    const mask = this.waterMaskFor(raw, region);
    if (mask) region.mask = mask;
    Object.assign(region, this.waterLookOf(raw));
    return region;
};

/**
 * A sheet's look beyond its image, only what was set: `reflect` (0-1, how
 * much of the world its surface mirrors), `gloss` (0-1, 1 a clean mirror)
 * and `tint` (the colour the reflection takes). Mercury is all three high:
 * reflect 1, gloss 0.9, a pale steel tint.
 */
Reactor3D.waterLookOf = function(raw) {
    const out = {};
    const unit = value => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null; };
    if (unit(raw.reflect) !== null) out.reflect = unit(raw.reflect);
    if (unit(raw.gloss) !== null) out.gloss = unit(raw.gloss);
    if (typeof raw.tint === "string" && /^#[0-9a-f]{6}$/i.test(raw.tint)) out.tint = raw.tint.toLowerCase();
    // What the liquid is: its own colour (none: the depth blue of water), how clear it is
    // (0 opaque, like tar), how much it waves (0-2, tar barely stirs) and whether it glows (lava).
    if (typeof raw.colour === "string" && /^#[0-9a-f]{6}$/i.test(raw.colour)) out.colour = raw.colour.toLowerCase();
    if (unit(raw.clear) !== null) out.clear = unit(raw.clear);
    const waves = Number(raw.waves);
    if (Number.isFinite(waves)) out.waves = Math.max(0, Math.min(2, Math.round(waves * 100) / 100));
    if (unit(raw.glow) !== null) out.glow = unit(raw.glow);
    return out;
};

/** The raw sheet's mask cut to the region's box (the box may have been clamped to the map), or null when it covers the box. */
Reactor3D.waterMaskFor = function(raw, region) {
    if (typeof raw.mask !== "string" || !raw.mask.length) return null;
    const rx0 = Math.floor(Number(raw.x0)), ry0 = Math.floor(Number(raw.y0)), rx1 = Math.floor(Number(raw.x1)), ry1 = Math.floor(Number(raw.y1));
    const rw = Math.abs(rx1 - rx0) + 1, rh = Math.abs(ry1 - ry0) + 1, ox = Math.min(rx0, rx1), oy = Math.min(ry0, ry1);
    if (raw.mask.length !== rw * rh) return null;
    const w = region.x1 - region.x0 + 1, h = region.y1 - region.y0 + 1;
    let out = "", full = true;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = raw.mask[(region.y0 + y - oy) * rw + (region.x0 + x - ox)] === "1" ? "1" : "0";
        if (c === "0") full = false;
        out += c;
    }
    return full ? null : out;
};

/** Whether a sheet stands over a cell. */
Reactor3D.waterCovers = function(region, x, y) {
    if (x < region.x0 || x > region.x1 || y < region.y0 || y > region.y1) return false;
    return !region.mask || region.mask[(y - region.y0) * (region.x1 - region.x0 + 1) + (x - region.x0)] === "1";
};

Reactor3D.waterOf = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const raw = sidecar && sidecar.water;
    if (!Array.isArray(raw) || !raw.length) return [];
    const memo = this._waterMemo || (this._waterMemo = new WeakMap());
    const known = memo.get(raw);
    if (known) return known;
    const list = raw.map(entry => this.normalizeWater(entry, mapData)).filter(Boolean);
    memo.set(raw, list);
    return list;
};

Reactor3D.hasWater = function(mapData) {
    return this.waterOf(mapData).length > 0;
};

/** The water level over a cell, or null on dry land; the highest sheet wins. */
Reactor3D.waterLevelAt = function(mapData, x, y) {
    let level = null;
    for (const region of this.waterOf(mapData)) {
        if (this.waterCovers(region, x, y) && (level === null || region.level > level)) level = region.level;
    }
    return level;
};

/**
 * The physics' settings when the game swims (reactor_physics.js), else null:
 * the editor and a game without physics keep deep water impassable.
 */
Reactor3D.swimRule = function() {
    const physics = typeof ReactorPhysics !== "undefined" ? ReactorPhysics : null;
    if (!physics || !physics.settings) return null;
    const settings = physics.settings();
    return settings.swim ? settings : null;
};

/** How deep the water stands over the ground at a world point; 0 on dry land. */
Reactor3D.waterDepthAt = function(mapData, wx, wz, near) {
    const level = this.waterLevelAt(mapData, Math.floor(wx), Math.floor(wz));
    if (level === null) return 0;
    return Math.max(0, level - this.groundHeightAt(mapData, wx, wz, near));
};

/** The Y of every vertex as built, kept so the terrain can lift it again later. */
Reactor3D.terrainBaseY = function(positions) {
    const base = new Float32Array(positions.length / 3);
    for (let i = 0, j = 0; i < positions.length; i += 3, j++) base[j] = positions[i + 1];
    return base;
};

//-----------------------------------------------------------------------------
// World meshes
//
// The terrain bend, piece chunks and water sheets of a Reactor3D.MapScene.
// Pieces are laid in chunks: one mesh per material per PIECE_CHUNK-cell
// square of the map, so an off-screen chunk is culled whole and an edit
// relays only the chunks it touches.

/**
 * Bend the built scene through the terrain again, in place, after the grid
 * changed under it. Only vertices inside `region` (corner-grid bounds
 * `{x0, x1, z0, z1}` in tiles, or null for the whole map) are touched: a
 * brush dab moves a few hundred vertices instead of throwing the scene away
 * and building it again, which is what made every dab pause and reset the
 * sky's drift. Returns the geometries it changed, or null when the scene was
 * built without terrain vertices and has to be rebuilt to get them.
 */
Reactor3D.MapScene.prototype.updateTerrain = function(mapData, region) {
    if (!this._terrainMap || !mapData || !Reactor3D.terrainOf(mapData)) return null;
    const x0 = region ? region.x0 - 1e-3 : -Infinity, x1 = region ? region.x1 + 1e-3 : Infinity;
    const z0 = region ? region.z0 - 1e-3 : -Infinity, z1 = region ? region.z1 + 1e-3 : Infinity;
    const changed = [];
    const seen = new Set();
    for (const mesh of this._meshes) {
        const geometry = mesh && mesh.geometry;
        if (!geometry || seen.has(geometry)) continue;
        const base = geometry.userData && geometry.userData.terrainBaseY;
        if (base === undefined || base === null) continue;
        seen.add(geometry);
        const attribute = geometry.attributes.position;
        const positions = attribute.array;
        const constant = typeof base === "number";
        let moved = false;
        for (let i = 0, j = 0; i < positions.length; i += 3, j++) {
            const x = positions[i], z = positions[i + 2];
            if (x < x0 || x > x1 || z < z0 || z > z1) continue;
            const y = (constant ? base : base[j]) + Reactor3D.terrainHeightAt(mapData, x, z);
            if (positions[i + 1] !== y) { positions[i + 1] = y; moved = true; }
        }
        if (!moved) continue;
        attribute.needsUpdate = true;
        if (geometry.userData.terrainPlane) geometry.computeVertexNormals();
        if (geometry.boundingBox) geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        changed.push(geometry);
    }
    if (changed.length && Reactor3D.Shadows && Reactor3D.Shadows.invalidate) Reactor3D.Shadows.invalidate();
    return changed;
};

/**
 * The shape of each kind in its own unit cell: x east, y up, v south, all
 * 0..1. A piece is a few boxes, a wedge (rises along +v), a gable (a ridge
 * across the middle, eaves at v 0 and 1) or a column. Turned by `rot`
 * quarter turns about the cell's middle when it is laid down.
 */
Reactor3D.pieceShapes = function(kind, piece) {
    const box = (x0, y0, v0, x1, y1, v1) => ({ box: [x0, y0, v0, x1, y1, v1] });
    const S = this.PIECE_STOREY;
    const params = this.shapeParams(piece || { kind });
    switch (kind) {
        case "wall": return [box(0, 0, 0, 1, S, 1)];
        case "block": return [box(0, 0, 0, 1, 1, 1)];
        case "floor": return [box(0, 0, 0, 1, this.PIECE_FLOOR_THICKNESS, 1)];
        case "pillar": return [box(0.24, 0, 0.24, 0.76, 0.12, 0.76), { column: [0.5, 0.5, 0.2, 0.12, S - 0.12] }, box(0.24, S - 0.12, 0.24, 0.76, S, 0.76)];
        case "stair": {
            const steps = [0, 1, 2, 3].map(i => box(0, 0, i * 0.25, 1, (i + 1) * 0.25, 1));
            // A step above what it stands on has a solid down to it: a plan lays no slab under a stair,
            // and the ground showed through the run. Down to the roof or floor under it, not the ground
            // (a stair on a skyscraper's roof ran the building's whole height down its side).
            const under = piece && Number.isFinite(piece.supportTop) ? piece.supportTop : 0;
            const drop = piece && Number.isFinite(piece.z) && piece.z > under ? piece.z - under : 0;
            return drop > 0 ? steps.concat([box(0, -drop, 0, 1, 0, 1)]) : steps;
        }
        case "ramp": return [{ wedge: true }];
        case "roof": return [{ gable: true }];
        // A level of ladder against the side it climbs toward (+v): two rails, two rungs.
        case "ladder": return [box(0.14, 0, 0.84, 0.22, 1, 0.94), box(0.78, 0, 0.84, 0.86, 1, 0.94),
            box(0.22, 0.22, 0.86, 0.78, 0.29, 0.92), box(0.22, 0.72, 0.86, 0.78, 0.79, 0.92)];
        // A doorway is a wall with its bottom gone: a lintel band across the
        // top and nothing under it, the whole cell wide. The walls either
        // side are the posts, so two doorways side by side are one opening
        // two tiles wide — 1.2 m, a door a person walks through — and one
        // alone is a narrow 60 cm gap. A window is the same with a sill
        // under the hole and a header over it.
        case "doorway": return [box(0, S - 0.6, 0, 1, S, 1)];
        case "window": return [box(0, 0, 0, 1, 1.5, 1), box(0, S - 1.4, 0, 1, S, 1)];
        // A pane the height of a wall, thin, in the middle of the cell: a viewport, or
        // the glass a plan sets in every window's hole.
        case "glass": return [box(0, 0, 0.45, 1, S, 0.55)];
        // Waist high on a three-tile character; it still blocks a cell.
        case "fence": return [box(0.05, 0, 0.42, 0.15, 1.5, 0.58), box(0.85, 0, 0.42, 0.95, 1.5, 0.58), box(0, 0.5, 0.45, 1, 0.62, 0.55), box(0, 1.15, 0.45, 1, 1.27, 0.55)];
        // The shapes fill the unit cell; their size stretches the cell.
        case "box": return [box(0, 0, 0, 1, 1, 1)];
        case "wedge": return [{ wedge: true }];
        case "prism": return [{ gable: true }];
        case "pyramid": return [{ pyramid: true }];
        case "cylinder": return [{ column: [0.5, 0.5, 0.5, 0, 1, 32, params.sweep] }];
        case "tube": return [{ tube: [0.5, 0.5, 0.5, 0.5 * (1 - params.thick), 0, 1, 32, params.sweep] }];
        case "cone": return [{ cone: [0.5, 0.5, 0.5, 0, 1, 32] }];
        case "dome": return [{ dome: [0.5, 0.5, 0.5, 0, 32, 10] }];
        case "sphere": return [{ sphere: [0.5, 0.5, 0.5, 0.5, 32, 16] }];
        // An arch is a wall with a round-topped opening through it; a tunnel is the same, deep.
        case "arch": case "tunnel": return [{ arch: [0.15, 0.5, 0.35, 24] }];
        case "ring": return [{ torus: [0.5, 0.5, 0.5, 0.5 - params.thick / 2, params.thick / 2, 0.5, 32, 16, params.sweep] }];
        // Ship parts: a hull segment and a spike are sided prisms that taper (flats touch
        // the cell), a capsule a column with domed ends, a dish a shallow bowl, a fin a
        // swept plate standing on its root.
        case "hull": case "spike": return [{ frustum: [0.5, 0.5, 0.5, 0, 1, params.sides, params.taper] }];
        case "capsule": return [{ capsule: [0.5, 0.5, 0.5, 0.25, 0.75, params.sides, 6] }];
        case "dish": return [{ dish: [0.5, 0.5, 0.5, 0.12, params.sides, 8] }];
        case "fin": return [{ fin: [params.taper] }];
        default: return [];
    }
};

/**
 * Triangles for one piece, in world units, appended to flat arrays.
 * Faces carry planar world-space UVs (one image repeat per tile, so a row
 * of blocks tiles seamlessly) and a per-vertex shade by facing, which is
 * the only lighting a flat-shaded block gets: tops bright, undersides
 * dark, the four sides each their own tone so edges read.
 */
Reactor3D.emitPiece = function(piece, base, out, hidden) {
    const cx = piece.x + 0.5, cz = piece.y + 0.5, oy = base + piece.z;
    const rot = piece.rot;
    const skip = hidden || {};
    // A shape is the unit cell stretched to its size, turned, tilted and rolled about its middle.
    const placeShape = this.isShapeKind(piece.kind) ? this.shapePlacer(piece, base) : null;
    const place = (x, y, v) => {
        if (placeShape) return placeShape(x, y, v);
        let dx = x - 0.5, dz = v - 0.5;
        for (let i = 0; i < rot; i++) {
            const next = -dz;
            dz = dx;
            dx = next;
        }
        return [cx + dx, oy + y, cz + dz];
    };
    const shadeFor = (nx, ny, nz) => {
        if (ny > 0.7) return 1;
        if (ny < -0.7) return 0.5;
        const side = 0.62 + 0.16 * (nx * 0.5 + 0.5) + 0.12 * (nz * 0.5 + 0.5);
        return ny > 0 ? side + (1 - side) * ny : side;
    };
    const tri = (a, b, c) => {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length; ny /= length; nz /= length;
        const shade = shadeFor(nx, ny, nz);
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        for (const p of [a, b, c]) {
            out.positions.push(p[0], p[1], p[2]);
            if (ay >= ax && ay >= az) out.uvs.push(p[0], p[2]);
            else if (ax >= az) out.uvs.push(p[2], p[1]);
            else out.uvs.push(p[0], p[1]);
            out.colors.push(shade, shade, shade);
        }
    };
    const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
    const shapes = this.pieceShapes(piece.kind, piece);
    // The highest box face of the piece: the top the skip rule speaks of (a window's header, not its sill).
    let boxTop = 0;
    for (const shape of shapes) if (shape.box) boxTop = Math.max(boxTop, shape.box[4]);
    for (const shape of shapes) {
        if (shape.box) {
            const [x0, y0, v0, x1, y1, v1] = shape.box;
            const p = (x, y, v) => place(x, y, v);
            // Wound to face outward, whichever way the piece is turned. A
            // face pressed against a neighbouring solid is left out: it was
            // never seen, and a cutaway through a wall would have shown it.
            if (!(skip.top && y1 >= boxTop - 1e-6)) quad(p(x0, y1, v0), p(x0, y1, v1), p(x1, y1, v1), p(x1, y1, v0)); // top
            if (!(skip.bottom && y0 <= 1e-6)) quad(p(x0, y0, v0), p(x1, y0, v0), p(x1, y0, v1), p(x0, y0, v1)); // bottom
            const side = (covered, atEdge, emit) => { for (const [a, b] of (atEdge ? Reactor3D.visibleSpans(y0, y1, covered) : [[y0, y1]])) emit(a, b); };
            side(skip.south, v1 >= 1 - 1e-6, (a, b) => quad(p(x0, a, v1), p(x1, a, v1), p(x1, b, v1), p(x0, b, v1))); // south
            side(skip.north, v0 <= 1e-6, (a, b) => quad(p(x1, a, v0), p(x0, a, v0), p(x0, b, v0), p(x1, b, v0))); // north
            side(skip.east, x1 >= 1 - 1e-6, (a, b) => quad(p(x1, a, v1), p(x1, a, v0), p(x1, b, v0), p(x1, b, v1))); // east
            side(skip.west, x0 <= 1e-6, (a, b) => quad(p(x0, a, v0), p(x0, a, v1), p(x0, b, v1), p(x0, b, v0))); // west
        } else if (shape.wedge) {
            // Flat at v 0, a full level at v 1.
            const p = place;
            quad(p(0, 0, 0), p(0, 1, 1), p(1, 1, 1), p(1, 0, 0)); // slope
            quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)); // bottom
            quad(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)); // back wall
            tri(p(1, 0, 0), p(1, 1, 1), p(1, 0, 1)); // east
            tri(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1)); // west
        } else if (shape.gable) {
            const p = place;
            quad(p(0, 0, 0), p(0, 1, 0.5), p(1, 1, 0.5), p(1, 0, 0)); // north slope
            quad(p(0, 1, 0.5), p(0, 0, 1), p(1, 0, 1), p(1, 1, 0.5)); // south slope
            quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)); // bottom
            tri(p(1, 0, 0), p(1, 1, 0.5), p(1, 0, 1)); // east gable
            tri(p(0, 0, 0), p(0, 0, 1), p(0, 1, 0.5)); // west gable
        } else if (shape.column) {
            // Round the circle, or round an arc of it centred on +v with flat faces at the ends.
            const [ccx, ccv, r, y0, y1, segs, sweep] = shape.column;
            const segments = segs || 12, arc = (sweep || 360) * Math.PI / 180, start = Math.PI / 2 - arc / 2;
            const at = i => { const a = start + (i / segments) * arc; return [ccx + Math.cos(a) * r, ccv + Math.sin(a) * r]; };
            for (let i = 0; i < segments; i++) {
                const [x0, v0] = at(i), [x1, v1] = at(i + 1);
                quad(place(x0, y0, v0), place(x0, y1, v0), place(x1, y1, v1), place(x1, y0, v1));
                tri(place(ccx, y1, ccv), place(x1, y1, v1), place(x0, y1, v0));
                tri(place(ccx, y0, ccv), place(x0, y0, v0), place(x1, y0, v1));
            }
            if (arc < Math.PI * 2 - 1e-6) {
                const [xs, vs] = at(0), [xe, ve] = at(segments);
                quad(place(ccx, y0, ccv), place(ccx, y1, ccv), place(xs, y1, vs), place(xs, y0, vs)); // the face at the start
                quad(place(xe, y0, ve), place(xe, y1, ve), place(ccx, y1, ccv), place(ccx, y0, ccv)); // and at the end
            }
        } else if (shape.cone) {
            const [ccx, ccv, r, y0, y1, segs] = shape.cone;
            const segments = segs || 24;
            for (let i = 0; i < segments; i++) {
                const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
                const x0 = ccx + Math.cos(a0) * r, v0 = ccv + Math.sin(a0) * r;
                const x1 = ccx + Math.cos(a1) * r, v1 = ccv + Math.sin(a1) * r;
                tri(place(x0, y0, v0), place(ccx, y1, ccv), place(x1, y0, v1));
                tri(place(ccx, y0, ccv), place(x0, y0, v0), place(x1, y0, v1));
            }
        } else if (shape.dome) {
            // A half sphere in rings of quads, closed by a disc underneath.
            const [ccx, ccv, r, y0, segs, ringCount] = shape.dome;
            const segments = segs || 24, rings = ringCount || 8;
            const at = (i, j) => {
                const a = (i / segments) * Math.PI * 2, t = (j / rings) * (Math.PI / 2);
                return place(ccx + Math.cos(a) * Math.cos(t) * r, y0 + Math.sin(t), ccv + Math.sin(a) * Math.cos(t) * r);
            };
            // Wound up the ring first, then round it, like the column's side: the normal points out.
            for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
                if (j === rings - 1) tri(at(i, j), at(i, j + 1), at(i + 1, j));
                else quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
            }
            for (let i = 0; i < segments; i++) {
                const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
                tri(place(ccx, y0, ccv), place(ccx + Math.cos(a0) * r, y0, ccv + Math.sin(a0) * r), place(ccx + Math.cos(a1) * r, y0, ccv + Math.sin(a1) * r));
            }
        } else if (shape.pyramid) {
            const p = place, apex = p(0.5, 1, 0.5);
            quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)); // bottom
            tri(p(1, 0, 0), p(0, 0, 0), apex); // north
            tri(p(0, 0, 1), p(1, 0, 1), apex); // south
            tri(p(1, 0, 1), p(1, 0, 0), apex); // east
            tri(p(0, 0, 0), p(0, 0, 1), apex); // west
        } else if (shape.sphere) {
            // Rings of quads from pole to pole, wound up the ring first like the dome.
            const [ccx, ccy, ccv, r, segs, ringCount] = shape.sphere;
            const segments = segs || 24, rings = ringCount || 12;
            const at = (i, j) => {
                const a = (i / segments) * Math.PI * 2, t = -Math.PI / 2 + (j / rings) * Math.PI;
                return place(ccx + Math.cos(a) * Math.cos(t) * r, ccy + Math.sin(t) * r, ccv + Math.sin(a) * Math.cos(t) * r);
            };
            for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
                if (j === 0) tri(at(i, j), at(i, j + 1), at(i + 1, j + 1));
                else if (j === rings - 1) tri(at(i, j), at(i, j + 1), at(i + 1, j));
                else quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
            }
        } else if (shape.tube) {
            // A column with a hole down its middle: the inner wall faces the hole, the ends are rings.
            const [ccx, ccv, r, ri, y0, y1, segs, sweep] = shape.tube;
            const segments = segs || 24, arc = (sweep || 360) * Math.PI / 180, start = Math.PI / 2 - arc / 2;
            const ring = (i, rad) => { const a = start + (i / segments) * arc; return [ccx + Math.cos(a) * rad, ccv + Math.sin(a) * rad]; };
            if (arc < Math.PI * 2 - 1e-6) {
                const os = ring(0, r), ns = ring(0, ri), oe = ring(segments, r), ne = ring(segments, ri);
                quad(place(ns[0], y0, ns[1]), place(ns[0], y1, ns[1]), place(os[0], y1, os[1]), place(os[0], y0, os[1])); // the face at the start
                quad(place(oe[0], y0, oe[1]), place(oe[0], y1, oe[1]), place(ne[0], y1, ne[1]), place(ne[0], y0, ne[1])); // and at the end
            }
            for (let i = 0; i < segments; i++) {
                const o0 = ring(i, r), o1 = ring(i + 1, r);
                const n0 = ring(i, ri), n1 = ring(i + 1, ri);
                quad(place(o0[0], y0, o0[1]), place(o0[0], y1, o0[1]), place(o1[0], y1, o1[1]), place(o1[0], y0, o1[1])); // outside
                quad(place(n1[0], y0, n1[1]), place(n1[0], y1, n1[1]), place(n0[0], y1, n0[1]), place(n0[0], y0, n0[1])); // inside
                quad(place(o0[0], y1, o0[1]), place(n0[0], y1, n0[1]), place(n1[0], y1, n1[1]), place(o1[0], y1, o1[1])); // top ring
                quad(place(o0[0], y0, o0[1]), place(o1[0], y0, o1[1]), place(n1[0], y0, n1[1]), place(n0[0], y0, n0[1])); // bottom ring
            }
        } else if (shape.torus) {
            // A ring lying flat: the tube's cross-section is `rh` wide and `rv` tall, so a
            // one-tile-tall ring's tube stands the full height.
            const [ccx, ccy, ccv, R, rh, rv, segs, tsegs, sweep] = shape.torus;
            const segments = segs || 24, around = tsegs || 8, arc = (sweep || 360) * Math.PI / 180, start = Math.PI / 2 - arc / 2;
            const at = (i, j) => {
                const a = start + (i / segments) * arc, b = (j / around) * Math.PI * 2;
                const rad = R + Math.cos(b) * rh;
                return place(ccx + Math.cos(a) * rad, ccy + Math.sin(b) * rv, ccv + Math.sin(a) * rad);
            };
            for (let j = 0; j < around; j++) for (let i = 0; i < segments; i++) quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
            if (arc < Math.PI * 2 - 1e-6) {
                // A disc closes each end of the bent pipe.
                const centre = i => { const a = start + (i / segments) * arc; return place(ccx + Math.cos(a) * R, ccy, ccv + Math.sin(a) * R); };
                for (let j = 0; j < around; j++) { tri(centre(0), at(0, j), at(0, j + 1)); tri(centre(segments), at(segments, j + 1), at(segments, j)); }
            }
        } else if (shape.frustum) {
            // A sided prism fitted to the cell (a flat faces forward; the polygon is stretched so
            // its box is the cell's, so four sides make a box), its top ring `taper` as wide as its
            // bottom, a point when 0.
            const [ccx, ccv, half, y0, y1, sides, taper] = shape.frustum;
            const n = Math.max(3, sides || 8), rt = taper;
            const corner = i => { const a = (i / n) * Math.PI * 2 + Math.PI / n; return [Math.cos(a), Math.sin(a)]; };
            let mx = 0, mz = 0;
            for (let i = 0; i < n; i++) { const c = corner(i); mx = Math.max(mx, Math.abs(c[0])); mz = Math.max(mz, Math.abs(c[1])); }
            const ring = (i, k) => { const c = corner(i); return [ccx + c[0] / mx * half * k, ccv + c[1] / mz * half * k]; };
            for (let i = 0; i < n; i++) {
                const b0 = ring(i, 1), b1 = ring(i + 1, 1), t0 = ring(i, rt), t1 = ring(i + 1, rt);
                if (rt > 1e-6) {
                    quad(place(b0[0], y0, b0[1]), place(t0[0], y1, t0[1]), place(t1[0], y1, t1[1]), place(b1[0], y0, b1[1]));
                    tri(place(ccx, y1, ccv), place(t1[0], y1, t1[1]), place(t0[0], y1, t0[1]));
                } else tri(place(b0[0], y0, b0[1]), place(ccx, y1, ccv), place(b1[0], y0, b1[1]));
                tri(place(ccx, y0, ccv), place(b0[0], y0, b0[1]), place(b1[0], y0, b1[1]));
            }
        } else if (shape.capsule) {
            // A column between `y0` and `y1` with a half dome at each end filling the rest of the cell.
            const [ccx, ccy, ccv, y0, y1, sides, ringCount] = shape.capsule;
            const n = Math.max(3, sides || 24), rings = ringCount || 6, r = 0.5;
            const at = (i, j) => {
                // j runs from the bottom pole, over the lower cap, up the side, over the top cap to the top pole.
                const a = (i / n) * Math.PI * 2;
                let y, rad;
                if (j <= rings) { const t = -Math.PI / 2 + (j / rings) * (Math.PI / 2); y = y0 + Math.sin(t) * y0; rad = Math.cos(t) * r; }
                else { const t = ((j - rings - 1) / rings) * (Math.PI / 2); y = y1 + Math.sin(t) * (1 - y1); rad = Math.cos(t) * r; }
                return place(ccx + Math.cos(a) * rad, y, ccv + Math.sin(a) * rad);
            };
            const last = rings * 2 + 1;
            for (let j = 0; j < last; j++) for (let i = 0; i < n; i++) {
                if (j === 0) tri(at(i, j), at(i, j + 1), at(i + 1, j + 1));
                else if (j === last - 1) tri(at(i, j), at(i, j + 1), at(i + 1, j));
                else quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
            }
        } else if (shape.dish) {
            // A bowl: a paraboloid shell `thick` deep, its rim flat at the top of the cell.
            const [ccx, ccv, r, thick, sides, ringCount] = shape.dish;
            const n = Math.max(3, sides || 32), rings = ringCount || 8;
            const rimIn = r * Math.sqrt(1 - thick);
            const outer = (i, j) => { const a = (i / n) * Math.PI * 2, t = j / rings, rad = t * r; return place(ccx + Math.cos(a) * rad, t * t, ccv + Math.sin(a) * rad); };
            const inner = (i, j) => { const a = (i / n) * Math.PI * 2, t = (j / rings) * Math.sqrt(1 - thick), rad = t * r; return place(ccx + Math.cos(a) * rad, t * t + thick, ccv + Math.sin(a) * rad); };
            const rim = (i, rad) => { const a = (i / n) * Math.PI * 2; return place(ccx + Math.cos(a) * rad, 1, ccv + Math.sin(a) * rad); };
            for (let j = 0; j < rings; j++) for (let i = 0; i < n; i++) {
                // Outside faces down and out; inside faces up and in; the rim closes them.
                if (j === 0) { tri(outer(i, 0), outer(i, 1), outer(i + 1, 1)); tri(inner(i, 0), inner(i + 1, 1), inner(i, 1)); }
                else { quad(outer(i, j), outer(i, j + 1), outer(i + 1, j + 1), outer(i + 1, j)); quad(inner(i, j), inner(i + 1, j), inner(i + 1, j + 1), inner(i, j + 1)); }
            }
            for (let i = 0; i < n; i++) quad(rim(i, r), rim(i, rimIn), rim(i + 1, rimIn), rim(i + 1, r));
        } else if (shape.fin) {
            // A plate in the u-y plane, `d` thick along v, its root the full width at the bottom and
            // its tip `taper` as wide at the top, swept so the trailing edge (u 1) stands straight.
            const [taper] = shape.fin;
            const p = place, u0 = 1 - taper;
            quad(p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(u0, 1, 1)); // south face
            quad(p(1, 0, 0), p(0, 0, 0), p(u0, 1, 0), p(1, 1, 0)); // north face
            quad(p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)); // root
            quad(p(u0, 1, 0), p(u0, 1, 1), p(1, 1, 1), p(1, 1, 0)); // tip
            quad(p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)); // trailing edge
            quad(p(0, 0, 0), p(0, 0, 1), p(u0, 1, 1), p(u0, 1, 0)); // leading edge
        } else if (shape.arch) {
            // A wall (the unit cell) with an opening through it along v: posts `post` wide, the
            // opening straight up to `spring` and a half circle of `r` above, the band over it solid.
            const [post, spring, r, segs] = shape.arch;
            const p = place, segments = segs || 16;
            const arc = i => { const t = Math.PI - (i / segments) * Math.PI; return [0.5 + Math.cos(t) * r, spring + Math.sin(t) * r]; }; // left to right
            // A face in the u-y plane at v: `south` order is bottom-left, bottom-right, top-right, top-left.
            const south = (a, b, c, d) => quad(p(a[0], a[1], 1), p(b[0], b[1], 1), p(c[0], c[1], 1), p(d[0], d[1], 1));
            const north = (a, b, c, d) => quad(p(b[0], b[1], 0), p(a[0], a[1], 0), p(d[0], d[1], 0), p(c[0], c[1], 0));
            for (const face of [south, north]) {
                face([0, 0], [post, 0], [post, spring], [0, spring]); // left post
                face([1 - post, 0], [1, 0], [1, spring], [1 - post, spring]); // right post
                face([0, spring], [post, spring], [post, 1], [0, 1]); // over the left post
                face([1 - post, spring], [1, spring], [1, 1], [1 - post, 1]); // over the right post
                for (let i = 0; i < segments; i++) { const a = arc(i), b = arc(i + 1); face(a, b, [b[0], 1], [a[0], 1]); } // the band over the arc
            }
            quad(p(0, 1, 0), p(0, 1, 1), p(1, 1, 1), p(1, 1, 0)); // top
            quad(p(0, 0, 0), p(post, 0, 0), p(post, 0, 1), p(0, 0, 1)); // under the left post
            quad(p(1 - post, 0, 0), p(1, 0, 0), p(1, 0, 1), p(1 - post, 0, 1)); // under the right post
            quad(p(1, 0, 1), p(1, 0, 0), p(1, 1, 0), p(1, 1, 1)); // east
            quad(p(0, 0, 0), p(0, 0, 1), p(0, 1, 1), p(0, 1, 0)); // west
            quad(p(post, 0, 1), p(post, 0, 0), p(post, spring, 0), p(post, spring, 1)); // the left post's inner face
            quad(p(1 - post, 0, 0), p(1 - post, 0, 1), p(1 - post, spring, 1), p(1 - post, spring, 0)); // the right post's inner face
            for (let i = 0; i < segments; i++) { // the underside of the arc, facing into the opening
                const a = arc(i), b = arc(i + 1);
                quad(p(a[0], a[1], 0), p(b[0], b[1], 0), p(b[0], b[1], 1), p(a[0], a[1], 1));
            }
        }
    }
    return out;
};

/**
 * Which faces of a full cube (a wall, a block) touch another full cube of
 * the same footing: those faces are dropped. The sides only where the
 * neighbour spans the same levels and stands on the same ground (to a
 * hair: a shaped map is never exactly flat, and a wall row on a slope
 * keeps its sides so no seam opens); a wall's top under another wall, a
 * block's bottom on a block; and a bottom on the map's ground level. A
 * face kept between two walls is never seen whole, but the cutaway shows
 * it: a row of them through a cut or a faded wall is a sawtooth.
 */
Reactor3D.HIDDEN_FACE_KINDS = ["wall", "block", "window", "doorway"];
/** Height ranges sorted and joined where they touch. */
Reactor3D.mergeRanges = function(ranges) {
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of sorted) {
        const last = out[out.length - 1];
        if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
};
/** The parts of [y0, y1] that `covered` (true, false, or ranges) leaves showing. */
Reactor3D.visibleSpans = function(y0, y1, covered) {
    if (covered === true) return [];
    if (!covered || !covered.length) return [[y0, y1]];
    const spans = [];
    let at = y0;
    for (const [a, b] of covered) {
        if (b <= at + 1e-6) continue;
        if (a >= y1 - 1e-6) break;
        if (a > at + 1e-6) spans.push([at, Math.min(a, y1)]);
        at = Math.max(at, b);
        if (at >= y1 - 1e-6) break;
    }
    if (at < y1 - 1e-6) spans.push([at, y1]);
    return spans;
};
Reactor3D.hiddenFacesOf = function(piece, mapData) {
    if (!this.HIDDEN_FACE_KINDS.includes(piece.kind) && piece.kind !== "floor") return null;
    const height = this.pieceHeight(piece.kind);
    // What a neighbouring cell covers of a shared face, as height ranges from
    // the piece's base: a wall or block all of it (true); a window its sill
    // and header, a doorway its header, and the hole between stays open, so
    // the face shows there as the side of the opening. Nothing: false.
    const solidAt = (x, y, z, h) => {
        const stack = mapData ? this.piecesAt(mapData, x, y) : null;
        if (!stack) return false;
        let ranges = [];
        for (const other of stack) {
            if (!this.HIDDEN_FACE_KINDS.includes(other.kind) || other.z !== z || this.pieceHeight(other.kind) !== h) continue;
            if (other.kind === "wall" || other.kind === "block") return true;
            for (const shape of this.pieceShapes(other.kind, other)) {
                if (!shape.box) continue;
                const [x0, y0, v0, x1, y1, v1] = shape.box;
                if (x0 <= 1e-6 && x1 >= 1 - 1e-6 && v0 <= 1e-6 && v1 >= 1 - 1e-6) ranges.push([y0, y1]);
            }
        }
        return ranges.length ? this.mergeRanges(ranges) : false;
    };
    const stoneAt = (x, y, z, h) => {
        const stack = mapData ? this.piecesAt(mapData, x, y) : null;
        return !!stack && stack.some(other => (other.kind === "wall" || other.kind === "block") && other.z === z && this.pieceHeight(other.kind) === h);
    };
    const here = mapData ? this.pieceBaseAt(mapData, piece.x, piece.y) : 0;
    const level = (x, y) => !!mapData && Math.abs(this.pieceBaseAt(mapData, x, y) - here) < 0.02;
    if (piece.kind === "floor") {
        // A slab is laid under every wall of a plan, so a doorway has a
        // threshold and a cut wall never shows the ground. Inside a wall it
        // is never seen, and its sides would fight the wall's own faces for
        // the bottom tenth of a tile: a band of floorboard round the foot of
        // every building. A side against a neighbouring slab at the same
        // level is a seam inside one floor, and a side against a
        // neighbouring wall is covered by it. The underside stays wherever
        // nothing stands beneath: that is the ceiling of the room below.
        const stackHere = mapData ? this.piecesAt(mapData, piece.x, piece.y) : null;
        const enclosed = !!stackHere && stackHere.some(other => (other.kind === "wall" || other.kind === "block") && other.z === piece.z);
        const covered = (x, y) => {
            const stack = mapData ? this.piecesAt(mapData, x, y) : null;
            return !!stack && stack.some(other => other.z === piece.z && (other.kind === "floor" || other.kind === "wall" || other.kind === "block"));
        };
        return {
            east: enclosed || (level(piece.x + 1, piece.y) && covered(piece.x + 1, piece.y)),
            west: enclosed || (level(piece.x - 1, piece.y) && covered(piece.x - 1, piece.y)),
            south: enclosed || (level(piece.x, piece.y + 1) && covered(piece.x, piece.y + 1)),
            north: enclosed || (level(piece.x, piece.y - 1) && covered(piece.x, piece.y - 1)),
            top: enclosed,
            bottom: piece.z === 0 || stoneAt(piece.x, piece.y, piece.z - 1, 1) || stoneAt(piece.x, piece.y, piece.z - this.PIECE_STOREY, this.PIECE_STOREY)
        };
    }
    // Rotation does not change a cube, so the faces are named in world terms and the cube is emitted unturned.
    return {
        east: level(piece.x + 1, piece.y) && solidAt(piece.x + 1, piece.y, piece.z, height),
        west: level(piece.x - 1, piece.y) && solidAt(piece.x - 1, piece.y, piece.z, height),
        south: level(piece.x, piece.y + 1) && solidAt(piece.x, piece.y + 1, piece.z, height),
        north: level(piece.x, piece.y - 1) && solidAt(piece.x, piece.y - 1, piece.z, height),
        top: stoneAt(piece.x, piece.y, piece.z + height, 1) || stoneAt(piece.x, piece.y, piece.z + height, this.PIECE_STOREY),
        // The bottom stays on the ground too: it is what a cut wall shows from above, else the ground.
        bottom: stoneAt(piece.x, piece.y, piece.z - 1, 1) || stoneAt(piece.x, piece.y, piece.z - this.PIECE_STOREY, this.PIECE_STOREY)
    };
};

/** A geometry of the given pieces, each on its own cell's ground. */
Reactor3D.pieceGeometry = function(pieces, mapData) {
    const out = { positions: [], uvs: [], colors: [] };
    const index = mapData ? this.pieceIndex(mapData) : null;
    for (let piece of pieces) {
        const base = mapData ? this.pieceBaseAt(mapData, piece.x, piece.y) : 0;
        // A raised stair's support stops on the highest piece top under it in its cell.
        if (piece.kind === "stair" && piece.z > 0 && index) {
            const stack = index.cells.get(piece.y * 65536 + piece.x) || [];
            let top = 0;
            for (const other of stack) {
                if (other === piece || other.id === piece.id || other.kind === "ladder" || other.z >= piece.z) continue;
                top = Math.max(top, Math.min(piece.z, this.pieceTop(other, 0.5, 0.5)));
            }
            if (top > 0) piece = Object.assign({}, piece, { supportTop: top });
        }
        const hidden = this.hiddenFacesOf(piece, mapData);
        this.emitPiece(hidden ? Object.assign({}, piece, { rot: 0 }) : piece, base, out, hidden);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(out.positions), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(out.uvs), 2));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(out.colors), 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
};

Reactor3D.defaultMaterialLoader = function(name) {
    if (!name || typeof ImageManager === "undefined" || !ImageManager || typeof ImageManager.loadBitmap !== "function") return null;
    return ImageManager.loadBitmap("img/materials/", name);
};

/** The group the pieces stand in: part of the world, drawn with the ground pass. */
Reactor3D.MapScene.prototype.piecesGroup = function() {
    if (!this._piecesGroup) {
        this._piecesGroup = new THREE.Group();
        this._piecesGroup.name = "pieces";
        this._scene.add(this._piecesGroup);
    }
    return this._piecesGroup;
};

/**
 * A material's texture, repeating, made once per scene. A bitmap still
 * loading (the game's ImageManager hands those out) fills the texture when
 * it arrives; the wall is drawn plain until then and textured a frame later.
 */
Reactor3D.MapScene.prototype.materialTexture = function(name, load) {
    if (!name) return null;
    if (!this._materialTextures) this._materialTextures = {};
    if (this._materialTextures[name] !== undefined) return this._materialTextures[name];
    let bitmap = null;
    try { bitmap = typeof load === "function" ? load(name) : null; } catch (error) { bitmap = null; }
    if (!bitmap) { this._materialTextures[name] = null; return null; }
    const texture = new THREE.Texture();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    const fill = () => {
        const source = bitmap.image || bitmap.canvas;
        if (!source) return;
        texture.image = source;
        texture.needsUpdate = true;
    };
    if (bitmap.isReady && !bitmap.isReady()) {
        if (typeof bitmap.addLoadListener === "function") bitmap.addLoadListener(fill);
    } else {
        fill();
    }
    this._textures.push(texture);
    this._materialTextures[name] = texture;
    return texture;
};

/**
 * Pieces are laid in chunks: one mesh per material per PIECE_CHUNK-cell
 * square of the map. A chunk off screen is culled whole, and an edit
 * relays only the chunks it touches — on a ten-thousand-piece map that is
 * a few milliseconds instead of fifty.
 */
Reactor3D.PIECE_CHUNK = 16;

Reactor3D.pieceChunkKey = function(x, y) {
    return Math.floor(x / this.PIECE_CHUNK) * 65536 + Math.floor(y / this.PIECE_CHUNK);
};

/** A piece's surface: its own, else its finish's, else none. */
Reactor3D.pieceSurface = function(piece) {
    return (piece && (piece.surface || (piece.finish && this.PIECE_FINISHES[piece.finish]))) || null;
};

/** A surface as a key: pieces shining alike share a draw. */
Reactor3D.surfaceKey = function(surface) {
    return surface ? [surface.reflect, surface.gloss, surface.metal, surface.texture || 0, surface.tint || "#ffffff"].join(",") : "";
};

/** One material's material object (in a surface, when it has one), shared by every chunk that wears it. */
Reactor3D.MapScene.prototype.pieceMaterial = function(name, load, surface) {
    if (!this._pieceMaterials) this._pieceMaterials = new Map();
    if (typeof surface === "string") surface = Reactor3D.PIECE_FINISHES[surface] || null;
    const shine = Reactor3D.surfaceKey(surface);
    const key = shine ? name + "\u0001" + shine : name;
    let material = this._pieceMaterials.get(key);
    if (material) return material;
    const look = Reactor3D.materialLook(name);
    const texture = look.glass ? null : this.materialTexture(name, load);
    material = new THREE.MeshBasicMaterial({
        map: texture || null,
        color: texture ? 0xffffff : look.glass ? 0xbfe6ff : 0x9a9a9a,
        vertexColors: true,
        side: look.glass ? THREE.DoubleSide : THREE.FrontSide,
        transparent: look.glass,
        opacity: look.glass ? 0.32 : 1,
        depthWrite: !look.glass
    });
    material.__reactorShaded = true;
    material.__reactorPieces = true;
    material.__reactorSelfLit = look.glow;
    material.userData.rrPieceMaterial = name;
    Reactor3D.litMaterial(material);
    if (surface && Reactor3D.setMaterialShine) Reactor3D.setMaterialShine(material, surface);
    this._materials.push(material);
    this._pieceMaterials.set(key, material);
    return material;
};

/**
 * Caps over the cut: a top laid over every wall-high piece the cut plane
 * passes through inside `box` (x0, z0, x1, z1 in world tiles), so the
 * storey the player stands in reads as though it had no floor above it.
 * One mesh per material in the pieces group, wearing the piece material
 * (its top mapping: the image by world x and z); made again when the cut
 * changes and dropped when it ends. A doorway's header sits under the
 * plane, so a doorway gets none and stays an opening.
 */
Reactor3D.MapScene.prototype.updateCutCaps = function(mapData, cutTop, box) {
    for (const mesh of this._cutCaps || []) { if (mesh.parent) mesh.parent.remove(mesh); mesh.geometry.dispose(); }
    this._cutCaps = [];
    if (!mapData || !Number.isFinite(cutTop) || cutTop >= 1e8 || !box || !this._scene) return;
    const index = Reactor3D.pieceIndex(mapData);
    if (!index) return;
    const byMaterial = new Map();
    for (const piece of index.list) {
        if (!Reactor3D.CAPPED_KINDS.includes(piece.kind)) continue;
        if (piece.x + 1 < box[0] || piece.x > box[2] || piece.y + 1 < box[1] || piece.y > box[3]) continue;
        const base = Reactor3D.pieceBaseAt(mapData, piece.x, piece.y) + piece.z;
        if (!(base < cutTop - 1e-6 && base + Reactor3D.pieceHeight(piece.kind) > cutTop + 1e-6)) continue;
        let list = byMaterial.get(piece.material);
        if (!list) byMaterial.set(piece.material, list = []);
        list.push(piece);
    }
    const group = this.piecesGroup();
    // A hair under the plane, so the cut itself never takes the cap.
    const y = cutTop - 0.01;
    for (const [name, list] of byMaterial) {
        const positions = [], uvs = [], colors = [];
        for (const piece of list) {
            const x0 = piece.x, x1 = piece.x + 1, z0 = piece.y, z1 = piece.y + 1;
            for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) { positions.push(x, y, z); uvs.push(x, z); colors.push(1, 1, 1); }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
        geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, this.pieceMaterial(name, null));
        mesh.userData.pieceCap = true;
        mesh.renderOrder = -5;
        group.add(mesh);
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        this._cutCaps.push(mesh);
    }
};
/** The kinds a cap is laid over: full-cell pieces a storey tall or stacked to one. */
Reactor3D.CAPPED_KINDS = ["wall", "block", "window", "glass"];

/** The see-through twin of a piece material: what the sight corridor holds is drawn with this, at a third. */
Reactor3D.MapScene.prototype.pieceGhostMaterial = function(name, load) {
    if (!this._pieceGhostMaterials) this._pieceGhostMaterials = new Map();
    let material = this._pieceGhostMaterials.get(name);
    if (material) return material;
    const look = Reactor3D.materialLook(name);
    const texture = look.glass ? null : this.materialTexture(name, load);
    material = new THREE.MeshBasicMaterial({
        map: texture || null,
        color: texture ? 0xffffff : look.glass ? 0xbfe6ff : 0x9a9a9a,
        vertexColors: true, side: THREE.FrontSide, transparent: true, opacity: Reactor3D.GHOST_OPACITY, depthWrite: false
    });
    material.__reactorShaded = true;
    material.__reactorPieces = true;
    material.__reactorGhost = true;
    material.__reactorSelfLit = look.glow;
    material.userData.rrPieceMaterial = name;
    Reactor3D.litMaterial(material);
    this._materials.push(material);
    this._pieceGhostMaterials.set(name, material);
    return material;
};
/** How much of a wall in the way is still seen. */
Reactor3D.GHOST_OPACITY = 0.35;

/** Lay the pieces of the chunks named in `keys` (every chunk when null). */
Reactor3D.MapScene.prototype.layPieceChunks = function(mapData, load, keys) {
    const pieces = Reactor3D.piecesOf(mapData);
    const wanted = keys ? new Set(keys) : null;
    const byChunk = new Map();
    for (const piece of pieces) {
        const key = Reactor3D.pieceChunkKey(piece.x, piece.y);
        if (wanted && !wanted.has(key)) continue;
        let byMaterial = byChunk.get(key);
        if (!byMaterial) byChunk.set(key, byMaterial = new Map());
        // Material and surface: a mirror wall is its own draw.
        const shine = Reactor3D.surfaceKey(Reactor3D.pieceSurface(piece));
        const look = shine ? piece.material + "\u0001" + shine : piece.material;
        let list = byMaterial.get(look);
        if (!list) byMaterial.set(look, list = []);
        list.push(piece);
    }
    const group = this.piecesGroup();
    for (const [key, byMaterial] of byChunk) {
        for (const [look, list] of byMaterial) {
            const name = list[0].material, surface = Reactor3D.pieceSurface(list[0]);
            const geometry = Reactor3D.pieceGeometry(list, mapData);
            const mesh = new THREE.Mesh(geometry, this.pieceMaterial(name, load, surface));
            mesh.userData.pieces = true;
            mesh.userData.pieceMaterial = name;
            if (surface) mesh.userData.pieceFinish = Reactor3D.surfaceKey(surface);
            mesh.userData.pieceChunk = key;
            // Glass draws after everything solid, so what is behind it shows through.
            mesh.renderOrder = Reactor3D.materialLook(name).glass ? 5 : -5;
            group.add(mesh);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            this._meshes.push(mesh);
            this._pieceMeshes.push(mesh);
            if (Reactor3D.Shadows && Reactor3D.Shadows.markCaster) Reactor3D.Shadows.markCaster(mesh, false);
            // The chunk again for the ghost pass: the same geometry, drawn translucent where a wall is in the way, shown only while a cut is on.
            if (!Reactor3D.materialLook(name).glass) {
                const ghost = new THREE.Mesh(geometry, this.pieceGhostMaterial(name, load));
                ghost.userData.pieceGhost = true;
                ghost.userData.pieceChunk = key;
                ghost.renderOrder = 4;
                ghost.visible = !!this._cutLook;
                group.add(ghost);
                ghost.updateMatrix();
                ghost.matrixAutoUpdate = false;
                (this._pieceGhosts = this._pieceGhosts || []).push(ghost);
            }
        }
    }
};

/** Lay every piece down, cast into the static shadow rows. */
Reactor3D.MapScene.prototype.addPieces = function(mapData, load) {
    this._pieceMeshes = this._pieceMeshes || [];
    if (!Reactor3D.hasPieces(mapData)) return;
    this.layPieceChunks(mapData, load, null);
};

/**
 * Lay the pieces down again after an edit. Only the chunks `region`
 * (cell bounds {x0, y0, x1, y1}, inclusive; null for all) touches are
 * dropped and laid again; the tiles, ground, room, sky and every other
 * chunk stay as they are. Returns the meshes laid.
 */
Reactor3D.MapScene.prototype.updatePieces = function(mapData, load, region) {
    let keys = null;
    if (region) {
        keys = [];
        const size = Reactor3D.PIECE_CHUNK;
        for (let cy = Math.floor(Math.max(0, region.y0) / size); cy <= Math.floor(Math.max(0, region.y1) / size); cy++) {
            for (let cx = Math.floor(Math.max(0, region.x0) / size); cx <= Math.floor(Math.max(0, region.x1) / size); cx++) keys.push(cx * 65536 + cy);
        }
    }
    const wanted = keys ? new Set(keys) : null;
    const ghosts = [];
    for (const ghost of this._pieceGhosts || []) {
        if (wanted && !wanted.has(ghost.userData.pieceChunk)) { ghosts.push(ghost); continue; }
        if (ghost.parent) ghost.parent.remove(ghost);
    }
    this._pieceGhosts = ghosts;
    const kept = [];
    for (const mesh of this._pieceMeshes || []) {
        if (wanted && !wanted.has(mesh.userData.pieceChunk)) { kept.push(mesh); continue; }
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();
        const at = this._meshes.indexOf(mesh);
        if (at >= 0) this._meshes.splice(at, 1);
        if (Reactor3D.Shadows && Reactor3D.Shadows._static) Reactor3D.Shadows._static.delete(mesh);
    }
    this._pieceMeshes = kept;
    const before = kept.length;
    if (Reactor3D.hasPieces(mapData)) this.layPieceChunks(mapData, load, keys);
    if (Reactor3D.Shadows && Reactor3D.Shadows.invalidate) Reactor3D.Shadows.invalidate();
    return this._pieceMeshes.slice(before);
};

/** The one clock every water sheet reads. */
Reactor3D.waterUniforms = function() {
    if (!this._waterUniforms) this._waterUniforms = { rrWaveTime: { value: 0 } };
    return this._waterUniforms;
};

/**
 * Waves in the sheet's own shader: two swells cross the surface and lift
 * the vertices, their slopes catch a glint from a fixed high light, the
 * colour deepens with the water's depth, and the sheet fades out where
 * the ground rises to meet it, so a shore is a shore. Cheap: a sum of
 * sines in the vertex stage, one dot product in the fragment stage.
 */
Reactor3D.waterMaterial = function(texture, look) {
    const material = new THREE.MeshBasicMaterial({
        map: texture || null, color: 0xffffff, transparent: true, opacity: 1,
        depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true
    });
    material.__reactorShaded = true;
    material.__reactorWater = true;
    const shared = this.waterUniforms();
    // Its look: reflect, roughness, then the tint the reflection takes.
    const reflect = look && look.reflect > 0 ? look.reflect : 0;
    material.userData.rrWaterLook = new THREE.Vector4(reflect, 1 - (look && look.gloss !== undefined ? look.gloss : 0.85), 0, 0);
    material.userData.rrWaterTint = new THREE.Color(look && look.tint ? look.tint : "#ffffff");
    // The liquid: its colour (w 1 when it has its own), and its clarity, waves and glow.
    const colour = look && look.colour ? new THREE.Color(look.colour) : null;
    material.userData.rrWaterColour = new THREE.Vector4(colour ? colour.r : 0, colour ? colour.g : 0, colour ? colour.b : 0, colour ? 1 : 0);
    const glow = look && look.glow > 0 ? look.glow : 0;
    material.userData.rrWaterForm = new THREE.Vector4(look && look.clear !== undefined ? look.clear : 0.6, look && look.waves !== undefined ? look.waves : 1, glow, 0);
    // A glowing liquid lights itself: lava is bright in the dark.
    if (glow >= 0.5) material.__reactorSelfLit = true;
    if (reflect > 0 && this.Reflections) { this.Reflections.wanted = true; this.Reflections.hook(material); }
    const env = this.Reflections ? this.Reflections.uniforms() : null;
    material.onBeforeCompile = function(shader) {
        shader.uniforms.rrWaveTime = shared.rrWaveTime;
        shader.uniforms.rrWaterLook = { value: material.userData.rrWaterLook };
        shader.uniforms.rrWaterTint = { value: material.userData.rrWaterTint };
        shader.uniforms.rrWaterColour = { value: material.userData.rrWaterColour };
        shader.uniforms.rrWaterForm = { value: material.userData.rrWaterForm };
        if (env) { shader.uniforms.rrEnvMap = env.rrEnvMap; shader.uniforms.rrEnvMaxLod = env.rrEnvMaxLod; shader.uniforms.rrEnvFlip = env.rrEnvFlip; }
        const mirror = env && Reactor3D.Mirrors ? Reactor3D.Mirrors.uniforms() : null;
        if (mirror) for (const name of Object.keys(mirror)) shader.uniforms[name] = mirror[name];
        shader.vertexShader = "uniform float rrWaveTime;\nuniform vec4 rrWaterForm;\nattribute float rrDepth;\nvarying float vRRDepth;\nvarying vec3 vRRWaveNormal;\n" + shader.vertexShader.replace(
            "#include <begin_vertex>",
            [
                "#include <begin_vertex>",
                "{",
                "\tvec2 rrP = vec2(position.x, position.z);",
                "\tvec2 rrK1 = vec2(0.9, 0.45), rrK2 = vec2(-0.35, 0.8);",
                // How much it waves: higher and quicker for more, low and sluggish for tar.
                "\tfloat rrA1 = 0.07 * rrWaterForm.y, rrA2 = 0.045 * rrWaterForm.y;",
                "\tfloat rrPace = mix(0.25, 1.0, clamp(rrWaterForm.y, 0.0, 1.0));",
                "\tfloat rrPh1 = dot(rrK1, rrP) - rrWaveTime * 1.1 * rrPace, rrPh2 = dot(rrK2, rrP) - rrWaveTime * 1.7 * rrPace;",
                "\tfloat rrLift = rrA1 * sin(rrPh1) + rrA2 * sin(rrPh2);",
                "\tfloat rrDx = rrA1 * cos(rrPh1) * rrK1.x + rrA2 * cos(rrPh2) * rrK2.x;",
                "\tfloat rrDz = rrA1 * cos(rrPh1) * rrK1.y + rrA2 * cos(rrPh2) * rrK2.y;",
                "\t// Waves die out in the shallows, so the sheet meets the shore flat.",
                "\tfloat rrCalm = smoothstep(0.0, 0.8, rrDepth);",
                "\ttransformed.y += rrLift * rrCalm;",
                "\tvRRWaveNormal = normalize(vec3(-rrDx * rrCalm, 1.0, -rrDz * rrCalm));",
                "\tvRRDepth = rrDepth;",
                "}"
            ].join("\n")
        );
        shader.fragmentShader = "varying float vRRDepth;\nvarying vec3 vRRWaveNormal;\nuniform vec4 rrWaterLook;\nuniform vec3 rrWaterTint;\nuniform vec4 rrWaterColour;\nuniform vec4 rrWaterForm;\n"
            + (env ? "uniform samplerCube rrEnvMap;\nuniform float rrEnvMaxLod;\nuniform float rrEnvFlip;\n" : "")
            + (mirror ? "uniform float rrMirrorOn0;\nuniform vec4 rrMirrorPlane0;\nuniform mat4 rrMirrorMatrix0;\nuniform sampler2D rrMirrorMap0;\nuniform float rrMirrorOn1;\nuniform vec4 rrMirrorPlane1;\nuniform mat4 rrMirrorMatrix1;\nuniform sampler2D rrMirrorMap1;\nuniform float rrMirrorTolerance;\n" : "")
            + shader.fragmentShader.replace(
            "#include <map_fragment>",
            [
                "#include <map_fragment>",
                "{",
                "\tvec3 rrShallow = vec3(0.55, 0.85, 0.95), rrDeep = vec3(0.10, 0.32, 0.58);",
                "\tvec3 rrTint = mix(rrShallow, rrDeep, smoothstep(0.0, 2.5, vRRDepth));",
                // A liquid of its own colour: a touch lighter in the shallows.
                "\tif (rrWaterColour.w > 0.5) rrTint = mix(min(rrWaterColour.rgb * 1.3 + 0.04, vec3(1.0)), rrWaterColour.rgb, smoothstep(0.0, 1.5, vRRDepth));",
                "\tvec3 rrLightDir = normalize(vec3(0.35, 1.0, 0.25));",
                "\tvec3 rrViewDir = normalize(cameraPosition - vRRWorldPos);",
                "\tvec3 rrHalf = normalize(rrLightDir + rrViewDir);",
                "\tfloat rrGlint = pow(max(dot(vRRWaveNormal, rrHalf), 0.0), 48.0);",
                "\tfloat rrFresnel = pow(1.0 - max(dot(vRRWaveNormal, rrViewDir), 0.0), 3.0);",
                "\tdiffuseColor.rgb = mix(diffuseColor.rgb * rrTint, vec3(1.0), rrGlint * 0.7 * (1.0 - rrWaterForm.z));",
                // Clarity 0.6 is water as it always was; lower is murkier to opaque (tar, lava), higher clearer.
                "\tfloat rrSeen = 0.55 + 0.3 * smoothstep(0.0, 2.0, vRRDepth) + 0.15 * rrFresnel;",
                // Past water's own 0.6 it thins only so far: a clear liquid is still there to see.
                "\tfloat rrOpacity = rrWaterForm.x <= 0.6 ? mix(1.0, rrSeen, rrWaterForm.x / 0.6) : mix(rrSeen, max(rrSeen * 0.55, 0.25), (rrWaterForm.x - 0.6) / 0.4);",
                "\tdiffuseColor.a *= rrOpacity * smoothstep(0.0, 0.35, vRRDepth);",
                // A glowing liquid burns brighter at its crests.
                "\tif (rrWaterForm.z > 0.0) diffuseColor.rgb *= 1.0 + rrWaterForm.z * (0.35 + 2.5 * (1.0 - vRRWaveNormal.y));",
                // A reflective sheet mirrors the world through its waves, more at a
                // glancing angle, and turns opaque as it does: mercury is a mirror.
                env ? [
                    "\tif (rrWaterLook.x > 0.0) {",
                    "\t\tvec3 rrR = reflect(-rrViewDir, vRRWaveNormal);",
                    "\t\trrR.x *= rrEnvFlip;",
                    "\t\tvec3 rrEnvC = textureLod(rrEnvMap, rrR, rrWaterLook.y * rrEnvMaxLod).rgb * rrWaterTint;",
                    // The sheet's own mirror picture when it is one of the frame's mirrors: the world sharp and
                    // in place, rippled by the waves (and blurred a little as the water roughens).
                    mirror ? [
                        "\t\tvec2 rrRipple = vRRWaveNormal.xz * (0.035 + 0.1 * rrWaterLook.y);",
                        "\t\tif (rrMirrorOn0 > 0.5 && rrMirrorPlane0.y > 0.9 && abs(vRRWorldPos.y - rrMirrorPlane0.w) < 0.4) {",
                        "\t\t\tvec4 rrMC = rrMirrorMatrix0 * vec4(vRRWorldPos, 1.0); vec2 rrMU = clamp(rrMC.xy / rrMC.w + rrRipple, 0.001, 0.999);",
                        "\t\t\tif (rrMC.w > 0.0) rrEnvC = textureLod(rrMirrorMap0, rrMU, 0.0).rgb * rrWaterTint;",
                        "\t\t} else if (rrMirrorOn1 > 0.5 && rrMirrorPlane1.y > 0.9 && abs(vRRWorldPos.y - rrMirrorPlane1.w) < 0.4) {",
                        "\t\t\tvec4 rrMC = rrMirrorMatrix1 * vec4(vRRWorldPos, 1.0); vec2 rrMU = clamp(rrMC.xy / rrMC.w + rrRipple, 0.001, 0.999);",
                        "\t\t\tif (rrMC.w > 0.0) rrEnvC = textureLod(rrMirrorMap1, rrMU, 0.0).rgb * rrWaterTint;",
                        "\t\t}"
                    ].join("\n") : "",
                    // Glancing light is reflected, light from above goes in: a dark liquid stays dark seen from
                    // above (tar is black, not sky blue) and mirrors the world toward the horizon; only a full
                    // mirror (mercury) reflects as strongly straight down.
                    "\t\tfloat rrFloor = mix(0.12, 0.9, rrWaterLook.x * rrWaterLook.x * rrWaterLook.x);",
                    "\t\tfloat rrMirror = clamp(rrWaterLook.x * mix(rrFloor, 1.0, pow(1.0 - max(dot(vRRWaveNormal, rrViewDir), 0.0), 3.0)), 0.0, 1.0);",
                    "\t\tdiffuseColor.rgb = mix(diffuseColor.rgb, rrEnvC + vec3(rrGlint * 0.8), rrMirror);",
                    "\t\tdiffuseColor.a = mix(diffuseColor.a, smoothstep(0.0, 0.35, vRRDepth), rrWaterLook.x * 0.85);",
                    "\t}"
                ].join("\n") : "",
                "}"
            ].join("\n")
        );
    };
    material.customProgramCacheKey = function() { return "reactor3d-water" + (env ? "|env|mirror" : ""); };
    this.litMaterial(material);
    return material;
};

/**
 * A sheet's surface: one quad per cell the water covers, corners shared, a
 * vertex per tile corner so the waves and the shoreline have something to
 * move; each vertex knows how deep the water is under it (`rrDepth`). UVs run
 * over the sheet's box so the image repeats once per tile.
 *
 * The quads reach one cell past the wet cells (`shore`, on by default): a
 * bank cell is dry at its middle but its ground dips under the level toward
 * the pond, and the sheet must be there for the shoreline to be where the
 * ground crosses the water rather than a square cut at the cell's edge.
 * Where the bank stands above the level the ground hides the sheet.
 */
Reactor3D.waterGeometry = function(region, mapData, shore = true) {
    const w = region.x1 - region.x0 + 1, h = region.y1 - region.y0 + 1;
    const reach = shore && region.mask ? 1 : 0;
    const gw = w + 2 * reach, gh = h + 2 * reach;
    const positions = [], uvs = [], depth = [], index = [];
    const ids = new Map();
    const wet = (cx, cy) => cx >= 0 && cy >= 0 && cx < w && cy < h && (!region.mask || region.mask[cy * w + cx] === "1");
    const corner = (cx, cy) => {
        const key = (cy + reach) * (gw + 1) + (cx + reach);
        let id = ids.get(key);
        if (id === undefined) {
            id = positions.length / 3;
            ids.set(key, id);
            const wx = region.x0 + cx, wz = region.y0 + cy;
            positions.push(wx, region.level, wz);
            uvs.push((cx + reach) / gw, 1 - (cy + reach) / gh);
            const gx = Math.max(0, Math.min(mapData.width - 1e-3, wx)), gz = Math.max(0, Math.min(mapData.height - 1e-3, wz));
            depth.push(region.level - Reactor3D.groundHeightAt(mapData, gx, gz, 0));
        }
        return id;
    };
    for (let cy = -reach; cy < h + reach; cy++) for (let cx = -reach; cx < w + reach; cx++) {
        const wx = region.x0 + cx, wz = region.y0 + cy;
        if (wx < 0 || wz < 0 || wx >= mapData.width || wz >= mapData.height) continue;
        if (!wet(cx, cy) && !(reach && (wet(cx - 1, cy) || wet(cx + 1, cy) || wet(cx, cy - 1) || wet(cx, cy + 1) || wet(cx - 1, cy - 1) || wet(cx + 1, cy - 1) || wet(cx - 1, cy + 1) || wet(cx + 1, cy + 1)))) continue;
        const a = corner(cx, cy), b = corner(cx + 1, cy), c = corner(cx + 1, cy + 1), d = corner(cx, cy + 1);
        index.push(a, d, b, b, d, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute("rrDepth", new THREE.Float32BufferAttribute(depth, 1));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry;
};

/** The water sheets: one waving translucent surface per sheet, in the world's own pass. */
Reactor3D.MapScene.prototype.addWater = function(mapData, load) {
    this._waterMeshes = this._waterMeshes || [];
    for (const region of Reactor3D.waterOf(mapData)) {
        const shore = region.mask ? 1 : 0;
        const w = region.x1 - region.x0 + 1 + 2 * shore, h = region.y1 - region.y0 + 1 + 2 * shore;
        const geometry = Reactor3D.waterGeometry(region, mapData);
        // The image repeats once per tile, drifting.
        const texture = this.materialTexture(region.material, load);
        if (texture) { texture.repeat.set(w, h); }
        const material = Reactor3D.waterMaterial(texture, region);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.water = region;
        mesh.renderOrder = 6;
        this.piecesGroup().add(mesh);
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        this._materials.push(material);
        this._waterMeshes.push(mesh);
    }
};

/**
 * The scene's water sheets as volumes (world boxes and levels) for the
 * lit shader; the nearest four to the camera when there are more.
 */
Reactor3D.MapScene.prototype.noteWaterVolume = function() {
    const scene = this.scene && this.scene();
    if (!scene) return;
    const meshes = this._waterMeshes || [];
    if (!meshes.length) { scene.userData.rrWater = null; return; }
    if (this._waterVolumeFor !== meshes || this._waterVolumeCount !== meshes.length) {
        this._waterVolumeFor = meshes;
        this._waterVolumeCount = meshes.length;
        const a = new THREE.Vector3(), b = new THREE.Vector3();
        scene.userData.rrWater = meshes.map(mesh => {
            const region = mesh.userData.water;
            mesh.updateMatrixWorld();
            a.set(region.x0, region.level, region.y0).applyMatrix4(mesh.matrixWorld);
            b.set(region.x1 + 1, region.level, region.y1 + 1).applyMatrix4(mesh.matrixWorld);
            return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z), level: a.y };
        });
    }
};

/** Each frame: the waves run and the image drifts. */
Reactor3D.MapScene.prototype.updateWater = function(frame) {
    this.noteWaterVolume();
    if (!this._waterMeshes || !this._waterMeshes.length || !Number.isFinite(frame)) return;
    Reactor3D.waterUniforms().rrWaveTime.value = frame / 60;
    for (const mesh of this._waterMeshes) {
        const texture = mesh.material.map;
        if (!texture) continue;
        texture.offset.x = (frame * 0.0015) % 1;
        texture.offset.y = (frame * 0.0009) % 1;
    }
};

/**
 * Rings on the water around swimmers: a wake while one swims, a slow ring
 * while one treads water, and a burst where one splashes in (the physics'
 * `_reactorSplash`). A small pool of flat rings, reused; in the game only.
 */
Reactor3D.RIPPLE_POOL = 24;
Reactor3D.MapScene.prototype.updateRipples = function(frame, characters) {
    if (!this._waterMeshes || !this._waterMeshes.length || !Number.isFinite(frame) || typeof THREE === "undefined") return;
    const ripples = this._ripples || (this._ripples = { live: [], free: [], geometry: null });
    const mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
    const spawn = (x, z, y, size, life, strength) => {
        let mesh = ripples.free.pop();
        if (!mesh) {
            if (ripples.live.length >= Reactor3D.RIPPLE_POOL) return;
            if (!ripples.geometry) {
                ripples.geometry = new THREE.RingGeometry(0.42, 0.5, 40);
                ripples.geometry.rotateX(-Math.PI / 2);
            }
            mesh = new THREE.Mesh(ripples.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
            mesh.renderOrder = 7;
            this.piecesGroup().add(mesh);
        }
        mesh.visible = true;
        mesh.position.set(x, y, z);
        ripples.live.push({ mesh, born: frame, life, size, strength });
    };
    for (const character of characters || []) {
        if (!character || !mapData) continue;
        const x = character._realX + 0.5, z = character._realY + 0.5;
        const level = Reactor3D.waterLevelAt(mapData, Math.floor(x), Math.floor(z));
        if (level === null) continue;
        const splash = character._reactorSplash;
        if (splash && splash.frame !== character._reactorSplashSeen) {
            character._reactorSplashSeen = splash.frame;
            const burst = Math.min(1, 0.4 + splash.speed * 2);
            spawn(x, z, level + 0.1, 2.6 * burst + 1, 50, 0.85);
            spawn(x, z, level + 0.1, 1.6 * burst + 0.8, 38, 0.7);
            character._reactorRippleAt = frame;
        }
        // Rings are the surface's: a diver under it leaves none.
        if (!character._reactorSwim || (character._reactorDive || 0) > 0.3) continue;
        const moving = character.isMoving && character.isMoving();
        const every = moving ? 14 : 48;
        if (character._reactorRippleAt !== undefined && frame - character._reactorRippleAt < every && frame >= character._reactorRippleAt) continue;
        character._reactorRippleAt = frame;
        spawn(x, z, level + 0.1, moving ? 1.5 : 1.2, moving ? 40 : 70, moving ? 0.45 : 0.3);
    }
    for (let i = ripples.live.length - 1; i >= 0; i--) {
        const ripple = ripples.live[i];
        const t = (frame - ripple.born) / ripple.life;
        if (t >= 1 || t < 0) {
            ripple.mesh.visible = false;
            ripples.free.push(ripple.mesh);
            ripples.live.splice(i, 1);
            continue;
        }
        const scale = 0.5 + ripple.size * Math.sqrt(t);
        ripple.mesh.scale.set(scale, 1, scale);
        ripple.mesh.material.opacity = ripple.strength * (1 - t) * (1 - t);
    }
};

/** Lay the water again after an edit; the rest of the scene stays. */
Reactor3D.MapScene.prototype.updateWaterSheets = function(mapData, load) {
    for (const mesh of this._waterMeshes || []) {
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();
        const m = this._materials.indexOf(mesh.material);
        if (m >= 0) this._materials.splice(m, 1);
        mesh.material.dispose();
    }
    this._waterMeshes = [];
    this.addWater(mapData, load);
    return this._waterMeshes.slice();
};

Reactor3D.World = { file: "reactor_3d_world.js" };
})(typeof globalThis !== "undefined" ? globalThis : this);
