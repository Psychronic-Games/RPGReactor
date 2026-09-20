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
    return base + this.pieceSurfaceAt(mapData, wx, wz, Number.isFinite(near) ? near - base : 0);
};

/** The ground under a character, at the middle of its cell as it moves between cells. */
Reactor3D.characterGround = function(mapData, character) {
    if (!character) return this.DEFAULT_ELEVATION;
    const x = Number.isFinite(character._realX) ? character._realX : character.x || 0;
    const y = Number.isFinite(character._realY) ? character._realY : character.y || 0;
    // Where the character last stood decides which floor of a house it is
    // on; `locate` forgets it, so a transfer lands on the ground floor.
    const ground = this.groundHeightAt(mapData, x + 0.5, y + 0.5, character._reactorGround);
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
    const from = this.groundHeightAt(mapData, x + 0.5, y + 0.5, near);
    const edge = this.groundHeightAt(mapData, (x + x2) / 2 + 0.5, (y + y2) / 2 + 0.5, from);
    const to = this.groundHeightAt(mapData, x2 + 0.5, y2 + 0.5, edge);
    // Water deeper than a wade is not walked into.
    if (this.waterDepthAt(mapData, x2 + 0.5, y2 + 0.5, edge) > this.WATER_WADE) return true;
    if (Math.abs(edge - from) > limit || Math.abs(to - edge) > limit) return true;
    // A stair rises a whole tile across its cell, so two stairs in a row
    // stand a tile apart at their middles and each half of the step is a
    // half tile: built to be climbed, judged by its halves.
    if (this.stairAt(mapData, x, y) || this.stairAt(mapData, x2, y2)) return false;
    return Math.abs(to - from) > limit;
};

Reactor3D.stairAt = function(mapData, x, y) {
    const stack = this.piecesAt(mapData, x, y);
    return !!stack && stack.some(piece => piece.kind === "stair");
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

Reactor3D.PIECE_KINDS = ["wall", "block", "floor", "pillar", "stair", "ramp", "roof", "doorway", "window", "fence", "dome", "cylinder", "cone"];
/**
 * Shapes: the round pieces. Unlike the cell pieces they have a size in
 * tiles (`size: [w, h, d]`, the cell they stand on being the middle of
 * the footprint) and a free turn in degrees (`angle`), so a tower is a
 * cylinder five tiles across with a dome on top, and a market tent a
 * cone. The cells a shape's footprint covers block like a wall of its
 * height; nothing walks on a dome.
 */
Reactor3D.SHAPE_KINDS = ["dome", "cylinder", "cone"];
Reactor3D.isShapeKind = function(kind) { return this.SHAPE_KINDS.includes(kind); };
/** A shape's [w, h, d] in tiles; a cell piece is one by one by its height. */
Reactor3D.shapeSize = function(piece) {
    const size = Array.isArray(piece.size) ? piece.size : null;
    const n = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
    return size ? [n(size[0], 1), n(size[1], 1), n(size[2], n(size[0], 1))] : [1, this.pieceHeight(piece.kind), 1];
};
/** The cells a piece's footprint covers: one for a cell piece, w by d round the middle for a shape. */
Reactor3D.pieceFootprint = function(piece) {
    if (!this.isShapeKind(piece.kind)) return [[piece.x, piece.y]];
    const [w, , d] = this.shapeSize(piece);
    const angle = (Number(piece.angle) || 0) * Math.PI / 180;
    // The footprint of a turned box: its corners turned, then every cell the box covers.
    const hw = w / 2, hd = d / 2, cx = piece.x + 0.5, cz = piece.y + 0.5;
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [cx + u * Math.cos(angle) - v * Math.sin(angle), cz + u * Math.sin(angle) + v * Math.cos(angle)]);
    const x0 = Math.floor(Math.min(...corners.map(c => c[0])) + 1e-6), x1 = Math.ceil(Math.max(...corners.map(c => c[0])) - 1e-6) - 1;
    const y0 = Math.floor(Math.min(...corners.map(c => c[1])) + 1e-6), y1 = Math.ceil(Math.max(...corners.map(c => c[1])) - 1e-6) - 1;
    // The pieces are round: a cell counts when its middle lies inside the
    // turned ellipse, with a little slack so the rim's cells block too.
    const cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (x < 0 || y < 0) continue;
        const px = x + 0.5 - cx, pz = y + 0.5 - cz;
        const u = px * Math.cos(-angle) - pz * Math.sin(-angle), v = px * Math.sin(-angle) + pz * Math.cos(-angle);
        if ((u * u) / ((hw + 0.15) * (hw + 0.15)) + (v * v) / ((hd + 0.15) * (hd + 0.15)) <= 1) cells.push([x, y]);
    }
    if (!cells.length) cells.push([piece.x, piece.y]);
    return cells;
};
// Levels a piece may stand at: 24 storeys of five tiles, so a tower plan is never cut short by the store.
Reactor3D.PIECE_MAX_LEVEL = 120;
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
    return kind === "wall" || kind === "doorway" || kind === "window" || kind === "pillar" ? this.PIECE_STOREY : 1;
};

Reactor3D.normalizePiece = function(raw, mapData) {
    if (!raw || typeof raw !== "object") return null;
    const kind = this.PIECE_KINDS.includes(raw.kind) ? raw.kind : null;
    if (!kind) return null;
    const x = Math.floor(Number(raw.x)), y = Math.floor(Number(raw.y));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return null;
    if (mapData && (x >= mapData.width || y >= mapData.height)) return null;
    const z = Math.max(0, Math.min(this.PIECE_MAX_LEVEL, Math.floor(Number(raw.z)) || 0));
    const rot = ((Math.floor(Number(raw.rot)) || 0) % 4 + 4) % 4;
    const material = typeof raw.material === "string" ? raw.material.trim() : "";
    const id = Number(raw.id);
    const piece = { id: Number.isFinite(id) && id > 0 ? Math.floor(id) : 0, kind, x, y, z, rot, material };
    const group = Number(raw.group);
    if (Number.isFinite(group) && group > 0) piece.group = Math.floor(group);
    if (this.isShapeKind(kind)) {
        const size = Array.isArray(raw.size) ? raw.size : [];
        const n = (v, fallback) => { const k = Number(v); return Number.isFinite(k) && k > 0 ? Math.min(60, Math.round(k * 100) / 100) : fallback; };
        piece.size = [n(size[0], 1), n(size[1], 1), n(size[2], n(size[0], 1))];
        const angle = Number(raw.angle);
        piece.angle = Number.isFinite(angle) ? ((Math.round(angle) % 360) + 360) % 360 : 0;
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
            stack.push(fx === piece.x && fy === piece.y ? piece : Object.assign({}, piece, { x: fx, y: fy, standIn: true }));
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
        case "dome": case "cylinder": case "cone": return piece.z + this.shapeSize(piece)[1];
        default: return piece.z + this.pieceHeight(piece.kind);
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
Reactor3D.pieceSurfaceAt = function(mapData, wx, wz, near) {
    const index = this.pieceIndex(mapData);
    if (!index) return 0;
    const x = Math.floor(wx), y = Math.floor(wz);
    const stack = index.cells.get(y * 65536 + x);
    if (!stack) return 0;
    const reach = 1 + this.TERRAIN_SLOPE_LIMIT + 1e-6;
    const standing = Number.isFinite(near) ? near : 0;
    let surface = 0;
    const u = wx - x, v = wz - y;
    for (const piece of stack) {
        if (piece.z > surface + reach) {
            if (standing + reach < piece.z) break;
            surface = Math.max(0, this.pieceTop(piece, u, v));
            continue;
        }
        const height = this.pieceTop(piece, u, v);
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
// A region of the map under a sheet of water at one world height, drawn as
// a moving translucent plane. Ground below the sheet by more than a wade is
// impassable; a shore is terrain sloping under it. Stored in the sidecar as
// `water: [{ x0, y0, x1, y1, level, material }]`, cells inclusive.

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
    return { x0, y0, x1, y1, level: Math.round(level * 100) / 100, material: typeof raw.material === "string" ? raw.material.trim() : "" };
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
        if (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1 && (level === null || region.level > level)) level = region.level;
    }
    return level;
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
Reactor3D.pieceShapes = function(kind) {
    const box = (x0, y0, v0, x1, y1, v1) => ({ box: [x0, y0, v0, x1, y1, v1] });
    const S = this.PIECE_STOREY;
    switch (kind) {
        case "wall": return [box(0, 0, 0, 1, S, 1)];
        case "block": return [box(0, 0, 0, 1, 1, 1)];
        case "floor": return [box(0, 0, 0, 1, this.PIECE_FLOOR_THICKNESS, 1)];
        case "pillar": return [box(0.24, 0, 0.24, 0.76, 0.12, 0.76), { column: [0.5, 0.5, 0.2, 0.12, S - 0.12] }, box(0.24, S - 0.12, 0.24, 0.76, S, 0.76)];
        case "stair": return [0, 1, 2, 3].map(i => box(0, 0, i * 0.25, 1, (i + 1) * 0.25, 1));
        case "ramp": return [{ wedge: true }];
        case "roof": return [{ gable: true }];
        // A doorway is a wall with its bottom gone: a lintel band across the
        // top and nothing under it, the whole cell wide. The walls either
        // side are the posts, so two doorways side by side are one opening
        // two tiles wide — 1.2 m, a door a person walks through — and one
        // alone is a narrow 60 cm gap. A window is the same with a sill
        // under the hole and a header over it.
        case "doorway": return [box(0, S - 0.6, 0, 1, S, 1)];
        case "window": return [box(0, 0, 0, 1, 1.5, 1), box(0, S - 1.4, 0, 1, S, 1)];
        // Waist high on a three-tile character; it still blocks a cell.
        case "fence": return [box(0.05, 0, 0.42, 0.15, 1.5, 0.58), box(0.85, 0, 0.42, 0.95, 1.5, 0.58), box(0, 0.5, 0.45, 1, 0.62, 0.55), box(0, 1.15, 0.45, 1, 1.27, 0.55)];
        // The round pieces fill the unit cell; their size stretches the cell.
        case "cylinder": return [{ column: [0.5, 0.5, 0.5, 0, 1, 32] }];
        case "cone": return [{ cone: [0.5, 0.5, 0.5, 0, 1, 32] }];
        case "dome": return [{ dome: [0.5, 0.5, 0.5, 0, 32, 10] }];
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
    // A shape is the unit cell stretched to its size and turned by its angle.
    const shape = this.isShapeKind(piece.kind);
    const [sw, sh, sd] = shape ? this.shapeSize(piece) : [1, 1, 1];
    const angle = shape ? (Number(piece.angle) || 0) * Math.PI / 180 : 0;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const place = (x, y, v) => {
        let dx = (x - 0.5) * sw, dz = (v - 0.5) * sd;
        for (let i = 0; i < rot; i++) {
            const next = -dz;
            dz = dx;
            dx = next;
        }
        if (angle) { const tx = dx * cosA - dz * sinA; dz = dx * sinA + dz * cosA; dx = tx; }
        return [cx + dx, oy + y * sh, cz + dz];
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
    for (const shape of this.pieceShapes(piece.kind)) {
        if (shape.box) {
            const [x0, y0, v0, x1, y1, v1] = shape.box;
            const p = (x, y, v) => place(x, y, v);
            // Wound to face outward, whichever way the piece is turned. A
            // face pressed against a neighbouring solid is left out: it was
            // never seen, and a cutaway through a wall would have shown it.
            if (!skip.top) quad(p(x0, y1, v0), p(x0, y1, v1), p(x1, y1, v1), p(x1, y1, v0)); // top
            if (!skip.bottom) quad(p(x0, y0, v0), p(x1, y0, v0), p(x1, y0, v1), p(x0, y0, v1)); // bottom
            if (!skip.south) quad(p(x0, y0, v1), p(x1, y0, v1), p(x1, y1, v1), p(x0, y1, v1)); // south
            if (!skip.north) quad(p(x1, y0, v0), p(x0, y0, v0), p(x0, y1, v0), p(x1, y1, v0)); // north
            if (!skip.east) quad(p(x1, y0, v1), p(x1, y0, v0), p(x1, y1, v0), p(x1, y1, v1)); // east
            if (!skip.west) quad(p(x0, y0, v0), p(x0, y0, v1), p(x0, y1, v1), p(x0, y1, v0)); // west
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
            const [ccx, ccv, r, y0, y1, segs] = shape.column;
            const segments = segs || 12;
            for (let i = 0; i < segments; i++) {
                const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
                const x0 = ccx + Math.cos(a0) * r, v0 = ccv + Math.sin(a0) * r;
                const x1 = ccx + Math.cos(a1) * r, v1 = ccv + Math.sin(a1) * r;
                quad(place(x0, y0, v0), place(x0, y1, v0), place(x1, y1, v1), place(x1, y0, v1));
                tri(place(ccx, y1, ccv), place(x1, y1, v1), place(x0, y1, v0));
                tri(place(ccx, y0, ccv), place(x0, y0, v0), place(x1, y0, v1));
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
            for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
                if (j === rings - 1) tri(at(i, j), at(i + 1, j), at(i, j + 1));
                else quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
            }
            for (let i = 0; i < segments; i++) {
                const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
                tri(place(ccx, y0, ccv), place(ccx + Math.cos(a0) * r, y0, ccv + Math.sin(a0) * r), place(ccx + Math.cos(a1) * r, y0, ccv + Math.sin(a1) * r));
            }
        }
    }
    return out;
};

/**
 * Which faces of a full cube (a wall, a block) touch another full cube of
 * the same footing: those faces are dropped. The sides only where the
 * neighbour spans the same levels; a wall's top under another wall, a
 * block's bottom on a block; and a bottom on the map's ground level.
 */
Reactor3D.hiddenFacesOf = function(piece, mapData) {
    if (piece.kind !== "wall" && piece.kind !== "block" && piece.kind !== "floor") return null;
    const height = this.pieceHeight(piece.kind);
    const solidAt = (x, y, z, h) => {
        const stack = mapData ? this.piecesAt(mapData, x, y) : null;
        return !!stack && stack.some(other => (other.kind === "wall" || other.kind === "block") && other.z === z && this.pieceHeight(other.kind) === h);
    };
    const flat = mapData && !this.hasTerrain(mapData) && this.elevationAt(mapData, piece.x, piece.y) === this.elevationAt(mapData, piece.x + 1, piece.y)
        && this.elevationAt(mapData, piece.x, piece.y) === this.elevationAt(mapData, piece.x - 1, piece.y)
        && this.elevationAt(mapData, piece.x, piece.y) === this.elevationAt(mapData, piece.x, piece.y + 1)
        && this.elevationAt(mapData, piece.x, piece.y) === this.elevationAt(mapData, piece.x, piece.y - 1);
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
            east: enclosed || (flat && covered(piece.x + 1, piece.y)),
            west: enclosed || (flat && covered(piece.x - 1, piece.y)),
            south: enclosed || (flat && covered(piece.x, piece.y + 1)),
            north: enclosed || (flat && covered(piece.x, piece.y - 1)),
            top: enclosed,
            bottom: piece.z === 0 || solidAt(piece.x, piece.y, piece.z - 1, 1) || solidAt(piece.x, piece.y, piece.z - this.PIECE_STOREY, this.PIECE_STOREY)
        };
    }
    // Rotation does not change a cube, so the faces are named in world terms and the cube is emitted unturned.
    return {
        east: flat && solidAt(piece.x + 1, piece.y, piece.z, height),
        west: flat && solidAt(piece.x - 1, piece.y, piece.z, height),
        south: flat && solidAt(piece.x, piece.y + 1, piece.z, height),
        north: flat && solidAt(piece.x, piece.y - 1, piece.z, height),
        top: solidAt(piece.x, piece.y, piece.z + height, 1) || solidAt(piece.x, piece.y, piece.z + height, this.PIECE_STOREY),
        bottom: piece.z === 0 || solidAt(piece.x, piece.y, piece.z - 1, 1) || solidAt(piece.x, piece.y, piece.z - this.PIECE_STOREY, this.PIECE_STOREY)
    };
};

/** A geometry of the given pieces, each on its own cell's ground. */
Reactor3D.pieceGeometry = function(pieces, mapData) {
    const out = { positions: [], uvs: [], colors: [] };
    for (const piece of pieces) {
        const base = mapData ? this.pieceBaseAt(mapData, piece.x, piece.y) : 0;
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

/** One material's material object, shared by every chunk that wears it. */
Reactor3D.MapScene.prototype.pieceMaterial = function(name, load) {
    if (!this._pieceMaterials) this._pieceMaterials = new Map();
    let material = this._pieceMaterials.get(name);
    if (material) return material;
    const texture = this.materialTexture(name, load);
    material = new THREE.MeshBasicMaterial({
        map: texture || null,
        color: texture ? 0xffffff : 0x9a9a9a,
        vertexColors: true,
        side: THREE.FrontSide
    });
    material.__reactorShaded = true;
    material.__reactorPieces = true;
    material.userData.rrPieceMaterial = name;
    Reactor3D.litMaterial(material);
    this._materials.push(material);
    this._pieceMaterials.set(name, material);
    return material;
};

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
        let list = byMaterial.get(piece.material);
        if (!list) byMaterial.set(piece.material, list = []);
        list.push(piece);
    }
    const group = this.piecesGroup();
    for (const [key, byMaterial] of byChunk) {
        for (const [name, list] of byMaterial) {
            const geometry = Reactor3D.pieceGeometry(list, mapData);
            const mesh = new THREE.Mesh(geometry, this.pieceMaterial(name, load));
            mesh.userData.pieces = true;
            mesh.userData.pieceMaterial = name;
            mesh.userData.pieceChunk = key;
            mesh.renderOrder = -5;
            group.add(mesh);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            this._meshes.push(mesh);
            this._pieceMeshes.push(mesh);
            if (Reactor3D.Shadows && Reactor3D.Shadows.markCaster) Reactor3D.Shadows.markCaster(mesh, false);
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
Reactor3D.waterMaterial = function(texture) {
    const material = new THREE.MeshBasicMaterial({
        map: texture || null, color: 0xffffff, transparent: true, opacity: 1,
        depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true
    });
    material.__reactorShaded = true;
    material.__reactorWater = true;
    const shared = this.waterUniforms();
    material.onBeforeCompile = function(shader) {
        shader.uniforms.rrWaveTime = shared.rrWaveTime;
        shader.vertexShader = "uniform float rrWaveTime;\nattribute float rrDepth;\nvarying float vRRDepth;\nvarying vec3 vRRWaveNormal;\n" + shader.vertexShader.replace(
            "#include <begin_vertex>",
            [
                "#include <begin_vertex>",
                "{",
                "\tvec2 rrP = vec2(position.x, position.z);",
                "\tvec2 rrK1 = vec2(0.9, 0.45), rrK2 = vec2(-0.35, 0.8);",
                "\tfloat rrA1 = 0.07, rrA2 = 0.045;",
                "\tfloat rrPh1 = dot(rrK1, rrP) - rrWaveTime * 1.1, rrPh2 = dot(rrK2, rrP) - rrWaveTime * 1.7;",
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
        shader.fragmentShader = "varying float vRRDepth;\nvarying vec3 vRRWaveNormal;\n" + shader.fragmentShader.replace(
            "#include <map_fragment>",
            [
                "#include <map_fragment>",
                "{",
                "\tvec3 rrShallow = vec3(0.55, 0.85, 0.95), rrDeep = vec3(0.10, 0.32, 0.58);",
                "\tvec3 rrTint = mix(rrShallow, rrDeep, smoothstep(0.0, 2.5, vRRDepth));",
                "\tvec3 rrLightDir = normalize(vec3(0.35, 1.0, 0.25));",
                "\tvec3 rrViewDir = normalize(cameraPosition - vRRWorldPos);",
                "\tvec3 rrHalf = normalize(rrLightDir + rrViewDir);",
                "\tfloat rrGlint = pow(max(dot(vRRWaveNormal, rrHalf), 0.0), 48.0);",
                "\tfloat rrFresnel = pow(1.0 - max(dot(vRRWaveNormal, rrViewDir), 0.0), 3.0);",
                "\tdiffuseColor.rgb = mix(diffuseColor.rgb * rrTint, vec3(1.0), rrGlint * 0.7);",
                "\tdiffuseColor.a *= (0.55 + 0.3 * smoothstep(0.0, 2.0, vRRDepth) + 0.15 * rrFresnel) * smoothstep(0.0, 0.35, vRRDepth);",
                "}"
            ].join("\n")
        );
    };
    material.customProgramCacheKey = function() { return "reactor3d-water"; };
    this.litMaterial(material);
    return material;
};

/** The water sheets: one waving translucent plane per region, in the world's own pass. */
Reactor3D.MapScene.prototype.addWater = function(mapData, load) {
    this._waterMeshes = this._waterMeshes || [];
    for (const region of Reactor3D.waterOf(mapData)) {
        const w = region.x1 - region.x0 + 1, h = region.y1 - region.y0 + 1;
        // A vertex per tile, so the waves and the shoreline have something to move.
        const geometry = new THREE.PlaneGeometry(w, h, Math.min(128, w), Math.min(128, h));
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(region.x0 + w / 2, region.level, region.y0 + h / 2);
        const positions = geometry.attributes.position;
        const depth = new Float32Array(positions.count);
        for (let i = 0; i < positions.count; i++) {
            const x = Math.max(0, Math.min(mapData.width - 1e-3, positions.getX(i)));
            const z = Math.max(0, Math.min(mapData.height - 1e-3, positions.getZ(i)));
            depth[i] = region.level - Reactor3D.groundHeightAt(mapData, x, z, 0);
        }
        geometry.setAttribute("rrDepth", new THREE.BufferAttribute(depth, 1));
        // The image repeats once per tile, drifting.
        const texture = this.materialTexture(region.material, load);
        if (texture) { texture.repeat.set(w, h); }
        const material = Reactor3D.waterMaterial(texture);
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

/** Each frame: the waves run and the image drifts. */
Reactor3D.MapScene.prototype.updateWater = function(frame) {
    if (!this._waterMeshes || !this._waterMeshes.length || !Number.isFinite(frame)) return;
    Reactor3D.waterUniforms().rrWaveTime.value = frame / 60;
    for (const mesh of this._waterMeshes) {
        const texture = mesh.material.map;
        if (!texture) continue;
        texture.offset.x = (frame * 0.0015) % 1;
        texture.offset.y = (frame * 0.0009) % 1;
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
