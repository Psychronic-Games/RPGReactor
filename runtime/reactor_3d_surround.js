//=============================================================================
// reactor_3d_surround.js — RPG Reactor 3D surroundings: the land past a map's border
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js), loaded after the world builder:
 * in the game from scriptUrls, in the editor from Reactor3D.EXTENSIONS, and in
 * Node by the core's own tail.
 *
 * A map ends at its border; what is seen past it lives in its sidecar as
 * `surround`:
 *
 *   { "style": "continue", "distance": 160, "rough": 0.5, "seed": 1,
 *     "edges": { "south": "ocean", "north": "mountains" } }
 *
 * `style` is what lies past every side: `continue` (the border's own heights
 * carried outward and rolled into hills), `ocean` (the land falls to a shore
 * and water runs to the horizon), `mountains` (the land rises into ridges that
 * close the view), `plateau` (the map is a mesa: its edge drops to a far
 * floor), `void` (a floating island: a rock underside under the map) or
 * `none`. `edges` says otherwise for one side (not for a void). `distance` is
 * how far it reaches in tiles, `rough` (0-1) how hilly, `seed` which hills;
 * `level` an ocean's surface (absent: the lowest water at the border, else
 * just under the lowest ground there), `height` the mountains' (tiles), `drop`
 * the plateau's and the void's depth, `haze` (0-1) how far the far land fades
 * into the sky's horizon colour, `water` the ocean's material.
 *
 * `neighbors` names the map past a side: `{ "north": { "map": 7, "shift": 4 } }`.
 * A player who walks (or drives) off the map on that side goes on into that
 * map, onto its facing border, at the same tile along it; `shift` is the tile
 * of this map the neighbor's first tile lies against.
 *
 * A neighbor is shown and entered without a break (`Reactor3D.Neighbors`): as
 * a map starts, the maps past its borders are read and their worlds built
 * beside it in place of each side's style, and then the maps past theirs
 * (`DEPTH` maps out), so nothing on the horizon changes as the player nears
 * a border. A step or a drive over the border makes the world past it the
 * map's own and leaves this one standing behind it with what stood beside
 * it, with no fade and nothing built again; worlds further than `DEPTH` maps
 * from the one played are let go. A border reached before its neighbor is
 * ready is crossed with a fade, as any transfer is.
 *
 * It is scenery: no one walks on it, nothing collides with it, nothing is
 * worked out each frame. One mesh of the room floor's own material (so the
 * border is the same grass, lit the same way, wearing the ground painted
 * there), a ring of rays out from the border whose cells grow with distance,
 * built once when the map is laid; a second mesh of the same far vertices
 * fades them into the sky; an ocean is one water sheet.
 */

(function(root) {
    "use strict";
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const R = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!R) return;

    //-------------------------------------------------------------------------
    // The format

    R.SURROUND_STYLES = ["continue", "ocean", "mountains", "plateau", "void", "none"];
    R.SURROUND_SIDES = ["north", "east", "south", "west"];
    /** How far the land reaches past the border, in tiles; less on weak graphics. */
    R.SURROUND_DISTANCE = { full: 160, weak: 96, min: 24, max: 320 };
    R.SURROUND_DEFAULTS = { rough: 0.5, seed: 1, height: 45, drop: 40, haze: 1 };
    /** Rays in a corner's quarter turn. */
    R.SURROUND_FAN = 12;

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const num = (v, fallback) => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? fallback : n; };
    const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

    /** A map's surroundings as stored, checked; null when it has none (absent, or style none on every side). */
    R.normalizeSurround = function(raw) {
        if (!raw || typeof raw !== "object") return null;
        const style = R.SURROUND_STYLES.includes(raw.style) ? raw.style : "none";
        const edges = {};
        if (style !== "void" && raw.edges && typeof raw.edges === "object") {
            for (const side of R.SURROUND_SIDES) {
                const s = raw.edges[side];
                if (R.SURROUND_STYLES.includes(s) && s !== "void" && s !== style) edges[side] = s;
            }
        }
        const neighbors = R.normalizeNeighbors(raw.neighbors);
        if (style === "none" && !Object.keys(edges).length && !Object.keys(neighbors).length) return null;
        const D = R.SURROUND_DEFAULTS, range = R.SURROUND_DISTANCE;
        const out = {
            style, edges, neighbors,
            distance: raw.distance === undefined || raw.distance === null ? null : clamp(Math.round(num(raw.distance, range.full)), range.min, range.max),
            rough: clamp(num(raw.rough, D.rough), 0, 1),
            seed: Math.round(clamp(num(raw.seed, D.seed), 0, 99999)),
            level: raw.level === undefined || raw.level === null || raw.level === "" || !Number.isFinite(Number(raw.level)) ? null : clamp(Number(raw.level), -200, 200),
            height: clamp(num(raw.height, D.height), 4, 160),
            drop: clamp(num(raw.drop, D.drop), 4, 200),
            haze: clamp(num(raw.haze, D.haze), 0, 1),
            water: typeof raw.water === "string" && raw.water.trim() ? raw.water.trim() : ""
        };
        return out;
    };

    /** The maps past a border as stored, checked: only the sides that name a map, each `{ map }` or `{ map, shift }`. */
    R.normalizeNeighbors = function(raw) {
        const out = {};
        if (!raw || typeof raw !== "object") return out;
        for (const side of R.SURROUND_SIDES) {
            const entry = raw[side], said = entry && typeof entry === "object";
            const map = Math.round(num(said ? entry.map : entry, 0));
            if (!(map > 0)) continue;
            const shift = Math.round(clamp(num(said ? entry.shift : 0, 0), -9999, 9999));
            out[side] = shift ? { map, shift } : { map };
        }
        return out;
    };

    /** The maps past a map's border, by side; empty when it has none. */
    R.neighborsOf = function(mapData) {
        const surround = mapData && mapData.reactor3d && mapData.reactor3d.surround;
        return R.normalizeNeighbors(surround && surround.neighbors);
    };

    /** The side a step in each direction leaves the map by. */
    R.NEIGHBOR_SIDE = { 8: "north", 6: "east", 2: "south", 4: "west" };

    /**
     * Where a step off the map from tile (x, y) in direction `d` leads: `{ mapId, side, along, d }`,
     * or null when the step stays on the map or no map lies past that side. `along` is the tile
     * along the shared border, counted in the neighbor's own tiles. `reach` is how many tiles
     * from the border the step may start (a vehicle's nose meets the border before its middle does).
     */
    R.neighborExit = function(mapData, x, y, d, reach = 0) {
        const side = R.NEIGHBOR_SIDE[d];
        if (!side || !mapData) return null;
        const W = mapData.width, H = mapData.height;
        const leaves = side === "north" ? y <= reach : side === "south" ? y >= H - 1 - reach : side === "west" ? x <= reach : x >= W - 1 - reach;
        if (!leaves) return null;
        const neighbor = R.neighborsOf(mapData)[side];
        if (!neighbor) return null;
        return { mapId: neighbor.map, side, along: (side === "north" || side === "south" ? x : y) - (neighbor.shift || 0), d, inset: Math.max(0, Math.round(reach) || 0) };
    };

    /**
     * The tile someone who left by `exit` arrives on in a map `width` by `height`: on the border
     * that faces the side left (`inset` tiles in from it: a vehicle arrives whole), at `along` held
     * to the border's length, or the nearest tile along the border that `standable(x, y)` accepts
     * (the plain tile when none is).
     */
    R.neighborArrival = function(exit, width, height, standable) {
        const horizontal = exit.side === "north" || exit.side === "south", length = horizontal ? width : height;
        if (!(width > 0) || !(height > 0)) return null;
        const depth = horizontal ? height : width, inset = clamp(Math.round(num(exit.inset, 0)), 0, depth - 1);
        const fixed = exit.side === "north" || exit.side === "west" ? depth - 1 - inset : inset;
        const at = along => (horizontal ? { x: along, y: fixed } : { x: fixed, y: along });
        const start = clamp(Math.round(num(exit.along, 0)), 0, length - 1);
        if (typeof standable !== "function") return at(start);
        for (let reach = 0; reach < length; reach++) {
            for (const along of reach ? [start - reach, start + reach] : [start]) {
                if (along < 0 || along >= length) continue;
                const tile = at(along);
                if (standable(tile.x, tile.y)) return tile;
            }
        }
        return at(start);
    };

    R.surroundOf = function(mapData) {
        const sidecar = mapData && mapData.reactor3d;
        return sidecar ? R.normalizeSurround(sidecar.surround) : null;
    };

    /** The style past one side. */
    R.surroundStyleOf = function(surround, side) {
        return (surround.edges && surround.edges[R.SURROUND_SIDES[side]]) || surround.style;
    };

    //-------------------------------------------------------------------------
    // Hills: seeded value noise

    const hash = (x, y, seed) => {
        let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    };
    const valueNoise = (x, y, seed) => {
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    };
    /** -1..1, three octaves. */
    R.surroundNoise = function(x, y, seed) {
        return (valueNoise(x, y, seed) * 0.57 + valueNoise(x * 2.03 + 11.3, y * 2.03 - 7.1, seed + 17) * 0.29 + valueNoise(x * 4.1 - 3.7, y * 4.1 + 5.9, seed + 41) * 0.14) * 2 - 1;
    };

    //-------------------------------------------------------------------------
    // Rays and rings

    /**
     * The rays the land runs out along: one from every border corner of every
     * tile, straight out from its side, and a fan of them round each corner of
     * the map. `keep` is the coarsest ring a ray is still part of (a power of
     * two: far rings keep every second, fourth, ... ray of a side).
     */
    R.surroundRays = function(W, H, fan = R.SURROUND_FAN) {
        const rays = [];
        const side = (s, len, origin, dx, dz) => {
            for (let j = 0; j <= len; j++) {
                const [ox, oz] = origin(j);
                rays.push({ ox, oz, dx, dz, a: s, b: s, t: 0, keep: j === 0 || j === len ? 1024 : (j & -j) });
            }
        };
        const corner = (s, ox, oz, dir) => {
            for (let f = 1; f < fan; f++) {
                const [dx, dz] = dir((f / fan) * Math.PI / 2);
                rays.push({ ox, oz, dx, dz, a: s, b: (s + 1) % 4, t: f / fan, keep: 1024 });
            }
        };
        side(0, W, j => [j, 0], 0, -1);
        corner(0, W, 0, a => [Math.sin(a), -Math.cos(a)]);
        side(1, H, j => [W, j], 1, 0);
        corner(1, W, H, a => [Math.cos(a), Math.sin(a)]);
        side(2, W, j => [W - j, H], 0, 1);
        corner(2, 0, H, a => [-Math.sin(a), Math.cos(a)]);
        side(3, H, j => [0, H - j], -1, 0);
        corner(3, 0, 0, a => [-Math.cos(a), -Math.sin(a)]);
        return rays;
    };

    /** Ring distances out to `distance`, close together at the border, and each ring's ray step. */
    R.surroundRings = function(distance) {
        const ds = [0, 1, 2, 4, 8, 16];
        let d = 16;
        while (d < distance - 0.5) { d = Math.min(distance, d < 32 ? 32 : d * 1.4); ds.push(d); }
        return ds.filter(v => v <= distance).map(v => ({ d: v, step: v <= 2 ? 1 : v <= 4 ? 2 : v <= 8 ? 4 : v <= 16 ? 8 : 16 }));
    };

    /** The border's height under every ray, and that profile smoothed ever wider (level l over 2^(l-1) rays each way). */
    R.surroundProfile = function(heights) {
        const n = heights.length, levels = [Float32Array.from(heights)];
        for (let l = 1; l <= 8; l++) {
            const radius = 1 << (l - 1), from = levels[l - 1], to = new Float32Array(n);
            // A box of the level before, twice the reach: cheap, and smooth enough after a few levels.
            const half = Math.max(1, radius >> 1);
            let sum = 0;
            for (let k = -half; k <= half; k++) sum += from[((k % n) + n) % n];
            for (let i = 0; i < n; i++) {
                to[i] = sum / (2 * half + 1);
                sum += from[(i + half + 1) % n] - from[(((i - half) % n) + n) % n];
            }
            levels.push(to);
        }
        return levels;
    };

    const carried = (levels, i, d) => {
        if (d <= 0) return levels[0][i];
        const l = d < 1 ? d : Math.min(levels.length - 1, Math.log2(d) + 1);
        const lo = Math.floor(l), hi = Math.min(levels.length - 1, lo + 1), f = l - lo;
        return levels[lo][i] * (1 - f) + levels[hi][i] * f;
    };

    /**
     * The land's height `d` tiles out along a ray, for one style. `c` carries
     * what the ray knows: `h0` the border's height there, `hC` that height
     * carried out (smoothed with distance), `slope` the ground's lean across the
     * border, `x`, `z` the point, `D` the reach, and the map's `mean`/`low`.
     */
    R.surroundHeight = function(style, s, c) {
        const d = c.d, D = c.D, seed = s.seed;
        // The border's own lean runs on a few tiles, so the join is not a crease.
        const lean = c.slope * d * Math.exp(-d / 4);
        const n1 = R.surroundNoise(c.x / 38, c.z / 38, seed), n2 = R.surroundNoise(c.x / 13, c.z / 13, seed + 7);
        const grow = smooth(0, 14, d);
        if (style === "ocean") {
            const shore = clamp((c.h0 - c.level) * 2 + 8, 8, D * 0.5);
            const bed = c.level - 2.5 - 6 * smooth(shore, D, d);
            const t = smooth(0, shore, d);
            return (c.hC + lean) * (1 - t) + bed * t + n2 * 0.6 * grow * (1 - t);
        }
        if (style === "mountains") {
            const rise = smooth(D * 0.06, D * 0.5, d);
            const ridge = 1 - Math.abs(R.surroundNoise(c.x / 46, c.z / 46, seed + 23));
            return c.hC + lean + rise * s.height * (0.35 + 0.65 * ridge * ridge) + n2 * (1.5 + 5 * s.rough) * grow;
        }
        if (style === "plateau") {
            const edge = 1.5 + 3 * (0.5 + 0.5 * R.surroundNoise(c.x / 9, c.z / 9, seed + 5));
            const fall = smooth(edge, edge + 6, d);
            return c.hC + lean * (1 - fall) - s.drop * fall + (n1 * 9 + n2 * 2.5) * s.rough * smooth(edge + 4, edge + 40, d);
        }
        // continue: the border carried out and rolled into hills that grow with distance.
        const amp = s.rough * (3 + 15 * smooth(8, D * 0.7, d));
        return c.hC + lean + (n1 * amp + n2 * amp * 0.28) * grow;
    };

    /** Tiles along a side, from a corner a neighbor stands past, over which the side's own style gives way to the land both maps agree on. */
    R.SURROUND_SEAM = 40;

    /**
     * The land along the line out from a corner two neighboring maps share: hills of the world's own, from
     * the corner's height, the same whatever style, seed or roughness either map chose. Each map's land
     * beside that line eases into it (`SURROUND_SEAM`), so the two lands are one land where they meet.
     */
    R.surroundSeamHeight = function(corner, x, z, d) {
        const amp = 0.5 * (3 + 15 * smooth(8, 112, d));
        return corner + (R.surroundNoise(x / 38, z / 38, 1) * amp + R.surroundNoise(x / 13, z / 13, 8) * amp * 0.28) * smooth(0, 14, d);
    };

    /** The water standing at a border point: a sheet's level over the ground there, else null. */
    R.surroundWetAt = function(mapData, ray, ground) {
        if (!R.waterLevelAt) return null;
        const W = mapData.width, H = mapData.height;
        let best = null;
        for (const [cx, cy] of [[ray.ox - 1, ray.oz - 1], [ray.ox, ray.oz - 1], [ray.ox - 1, ray.oz], [ray.ox, ray.oz]]) {
            if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
            const level = R.waterLevelAt(mapData, cx, cy);
            if (level !== null && level !== undefined && level > ground + 0.05 && (best === null || level > best)) best = level;
        }
        return best;
    };

    /**
     * The surroundings as plain arrays: `ground` (positions, uvs, normals, fade
     * 0-1 per vertex, index, and `hazeIndex`: the triangles the fade reaches),
     * `water` (positions, uvs, depth, edge, index) or null, and `info`. `floorY`
     * is the height the room floor lies at before the terrain lifts it.
     */
    R.surroundGeometry = function(mapData, surround, options = {}) {
        const W = mapData.width, H = mapData.height;
        if (!surround || !(W > 0) || !(H > 0)) return null;
        const floorY = Number.isFinite(options.floorY) ? options.floorY : 0;
        const range = R.SURROUND_DISTANCE;
        const D = clamp(surround.distance !== null && surround.distance !== undefined ? surround.distance : (options.weak ? range.weak : range.full), range.min, options.weak ? Math.max(range.weak, range.min) : range.max);
        const terrain = (x, z) => floorY + (R.terrainHeightAt ? R.terrainHeightAt(mapData, x, z) : 0);
        const rays = R.surroundRays(W, H);
        const n = rays.length;
        const heights = new Float32Array(n);
        let mean = 0, low = Infinity;
        for (let i = 0; i < n; i++) { heights[i] = terrain(rays[i].ox, rays[i].oz); mean += heights[i] / n; low = Math.min(low, heights[i]); }
        const levels = R.surroundProfile(heights);
        const wet = rays.map((ray, i) => R.surroundWetAt(mapData, ray, heights[i]));
        // Where a neighbor's world stands on a side there is no land of this map's, and no corner is turned toward it.
        // `none[side]` is true for the whole side, or `{ from, to }` in tiles along it where the neighbor is the shorter.
        const none = options.none || null;
        const styles = [0, 1, 2, 3].map(side => (none && none[R.SURROUND_SIDES[side]] === true ? "none" : R.surroundStyleOf(surround, side)));
        const covered = (ray, side) => {
            const part = none && none[R.SURROUND_SIDES[side]];
            if (!part || part === true) return !!part;
            const along = side === 0 || side === 2 ? ray.ox : ray.oz, length = side === 0 || side === 2 ? W : H;
            // The ray at an end the neighbor stops short of stays: this map's land begins there.
            return (along > part.from || part.from <= 0) && (along < part.to || part.to >= length);
        };
        const styleOf = (ray, side) => (covered(ray, side) ? "none" : styles[side]);
        const ends = ray => {
            const part = ray.a === ray.b && none ? none[R.SURROUND_SIDES[ray.a]] : null;
            if (!part || part === true) return false;
            const along = ray.a === 0 || ray.a === 2 ? ray.ox : ray.oz;
            return along === part.from || along === part.to;
        };
        // (A ray where a neighbor ends is in every ring, as a corner's is.)
        const keepOf = ray => (ends(ray) ? 1024 : ray.keep);
        // A side beside one the map names a neighbor past: how much of its own style each ray keeps, and the corner
        // it eases toward (corner `k` lies between side `k` and the next). By the names, not by what stands built,
        // so the land does not change as the neighbor's world comes and goes.
        const named = [0, 1, 2, 3].map(side => !!(surround.neighbors && surround.neighbors[R.SURROUND_SIDES[side]]));
        const cornerAt = [[W, 0], [W, H], [0, H], [0, 0]];
        const seamOf = ray => {
            if (ray.a !== ray.b) {
                const wa = named[ray.b] ? 0 : 1, wb = named[ray.a] ? 0 : 1;
                if (wa === 1 && wb === 1) return null;
                const t = smooth(0, 1, ray.t);
                return [wa * (1 - t) + wb * t, ray.a];
            }
            const side = ray.a, length = side === 0 || side === 2 ? W : H;
            const j = side === 0 ? ray.ox : side === 1 ? ray.oz : side === 2 ? W - ray.ox : H - ray.oz;
            const reach = Math.min(R.SURROUND_SEAM, length / 2), before = (side + 3) % 4, after = (side + 1) % 4;
            if (named[before] && j < reach) return [smooth(0, reach, j), before];
            if (named[after] && length - j < reach) return [smooth(0, reach, length - j), side];
            return null;
        };
        const seams = named.includes(true) ? rays.map(seamOf) : null;
        const cornerHeights = seams ? cornerAt.map(([x, z]) => terrain(x, z)) : null;
        const anyOcean = styles.includes("ocean");
        let sea = surround.level;
        if (anyOcean && sea === null) {
            for (const level of wet) if (level !== null && (sea === null || level < sea)) sea = level;
            if (sea === null) sea = low - 1;
        }
        if (surround.style === "void" && !none) return R.surroundUnderside(mapData, surround, { rays, heights, levels, mean, low, W, H });

        const rings = R.surroundRings(D);
        const ids = rings.map(() => new Int32Array(n).fill(-1));
        const positions = [], uvs = [], fade = [], rayOf = [], ringOf = [];
        const c = { d: 0, D, x: 0, z: 0, h0: 0, hC: 0, slope: 0, level: sea, mean, low };
        // `origin`: where this map lies in the world it is one map of, so the hills of two maps side by side are the same hills.
        const originX = options.origin ? Number(options.origin.x) || 0 : 0, originZ = options.origin ? Number(options.origin.z) || 0 : 0;
        const heightAt = (i, d) => {
            const ray = rays[i];
            c.d = d; c.x = ray.ox + ray.dx * d + originX; c.z = ray.oz + ray.dz * d + originZ; c.h0 = heights[i]; c.hC = carried(levels, i, d);
            c.slope = clamp(heights[i] - terrain(ray.ox - ray.dx, ray.oz - ray.dz), -1.2, 1.2);
            const sa = styleOf(ray, ray.a), sb = styleOf(ray, ray.b);
            let h;
            if (sa === sb || sa === "none" || sb === "none") h = R.surroundHeight(sa === "none" ? sb : sa, surround, c);
            else { const t = smooth(0, 1, ray.t); h = R.surroundHeight(sa, surround, c) * (1 - t) + R.surroundHeight(sb, surround, c) * t; }
            const seam = seams ? seams[i] : null;
            if (seam && seam[0] < 1) h = h * seam[0] + R.surroundSeamHeight(cornerHeights[seam[1]], c.x, c.z, d) * (1 - seam[0]);
            // A lake at the border is banked: the land past it climbs over the water's level.
            const level = wet[i];
            if (level !== null && sa !== "ocean" && sb !== "ocean") {
                const bank = heights[i] + (level + 0.9 - heights[i]) * smooth(0, 3, d);
                h = Math.max(h, bank * (1 - smooth(10, 24, d)) + h * smooth(10, 24, d));
            }
            return h;
        };
        const gone = i => (styleOf(rays[i], rays[i].a) === "none" && styleOf(rays[i], rays[i].b) === "none")
            || (!!none && rays[i].a !== rays[i].b && (covered(rays[i], rays[i].a) || covered(rays[i], rays[i].b)));
        for (let k = 0; k < rings.length; k++) {
            const ring = rings[k];
            for (let i = 0; i < n; i++) {
                if (keepOf(rays[i]) < ring.step || gone(i)) continue;
                const ray = rays[i], x = ray.ox + ray.dx * ring.d, z = ray.oz + ray.dz * ring.d;
                ids[k][i] = positions.length / 3;
                positions.push(x, k === 0 ? heights[i] : heightAt(i, ring.d), z);
                uvs.push(x / W, 1 - z / H);
                fade.push(surround.haze * smooth(D * 0.45, D * 0.98, ring.d));
                rayOf.push(i); ringOf.push(k);
            }
        }
        const index = [];
        const tri = (a, b, cc) => {
            if (a < 0 || b < 0 || cc < 0 || a === b || b === cc || a === cc) return;
            // Faces up, whichever way the strip ran.
            const ax = positions[a * 3], az = positions[a * 3 + 2];
            const ux = positions[b * 3] - ax, uz = positions[b * 3 + 2] - az, vx = positions[cc * 3] - ax, vz = positions[cc * 3 + 2] - az;
            const ny = uz * vx - ux * vz;
            if (Math.abs(ny) < 1e-9) return;
            if (ny > 0) index.push(a, b, cc); else index.push(a, cc, b);
        };
        const strips = (inner, outer, emit) => {
            // Between two rings: the outer ring's rays are some of the inner ring's; each outer span is fanned to the inner rays under it.
            const kept = [];
            for (let i = 0; i < n; i++) if (outer[i] >= 0) kept.push(i);
            for (let j = 0; j < kept.length; j++) {
                const from = kept[j], to = kept[(j + 1) % kept.length];
                const span = [];
                let open = false;
                for (let i = from; ; i = (i + 1) % n) { if (inner[i] >= 0) span.push(i); else if (gone(i)) open = true; if (i === to) break; }
                // A side with nothing past it is a gap, not a span to bridge.
                if (open || span.length < 2) continue;
                const mid = span.length >> 1;
                for (let m = 0; m < span.length - 1; m++) emit(inner[span[m]], inner[span[m + 1]], m < mid ? outer[from] : outer[to]);
                emit(inner[span[mid]], outer[from], outer[to]);
            }
        };
        const hazeIndex = [];
        for (let k = 0; k + 1 < rings.length; k++) {
            const before = index.length;
            strips(ids[k], ids[k + 1], tri);
            if (rings[k + 1].d > D * 0.45 && surround.haze > 0) for (let i = before; i < index.length; i++) hazeIndex.push(index[i]);
        }
        const normals = R.surroundNormals(positions, index);

        // Water: an ocean out to the rim; a border lake carried a few tiles to its bank.
        let water = null;
        const oceanAt = i => styleOf(rays[i], rays[i].a) === "ocean" || styleOf(rays[i], rays[i].b) === "ocean";
        const levelOf = i => (oceanAt(i) ? sea : wet[i]);
        const reachOf = i => (oceanAt(i) ? Infinity : 4);
        if (anyOcean || wet.some(level => level !== null)) {
            const wp = [], wuv = [], depth = [], edge = [], wi = [], wids = rings.map(() => new Int32Array(n).fill(-1)), wl = [];
            for (let k = 0; k < rings.length; k++) {
                for (let i = 0; i < n; i++) {
                    const level = levelOf(i);
                    if (ids[k][i] < 0 || level === null || rings[k].d > reachOf(i)) continue;
                    const g = ids[k][i] * 3;
                    wids[k][i] = wp.length / 3;
                    wp.push(positions[g], level, positions[g + 2]);
                    wuv.push(positions[g], -positions[g + 2]);
                    depth.push(level - positions[g + 1]);
                    // The far rim thins away rather than ending in a line.
                    edge.push(reachOf(i) === Infinity ? 1 - smooth(D * 0.85, D, rings[k].d) : 1);
                    wl.push(level);
                }
            }
            const wtri = (a, b, cc) => {
                if (a < 0 || b < 0 || cc < 0 || a === b || b === cc || a === cc) return;
                if (wl[a] !== wl[b] || wl[a] !== wl[cc]) return;
                if (depth[a] <= 0 && depth[b] <= 0 && depth[cc] <= 0) return;
                const ax = wp[a * 3], az = wp[a * 3 + 2];
                const ny = (wp[b * 3 + 2] - az) * (wp[cc * 3] - ax) - (wp[b * 3] - ax) * (wp[cc * 3 + 2] - az);
                if (Math.abs(ny) < 1e-9) return;
                if (ny > 0) wi.push(a, b, cc); else wi.push(a, cc, b);
            };
            for (let k = 0; k + 1 < rings.length; k++) strips(wids[k], wids[k + 1], wtri);
            if (wi.length) water = { positions: new Float32Array(wp), uvs: new Float32Array(wuv), depth: new Float32Array(depth), edge: new Float32Array(edge), index: new Uint32Array(wi) };
        }
        return {
            ground: { positions: new Float32Array(positions), uvs: new Float32Array(uvs), normals, fade: new Float32Array(fade), index: new Uint32Array(index), hazeIndex: new Uint32Array(hazeIndex) },
            water,
            info: { distance: D, rays: n, rings: rings.length, vertices: positions.length / 3, triangles: index.length / 3, sea: anyOcean ? sea : null, style: surround.style }
        };
    };

    /** Smooth normals from the triangles (each weighted by its area). */
    R.surroundNormals = function(positions, index) {
        const normals = new Float32Array(positions.length);
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const i of [a, b, c]) { normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz; }
        }
        for (let i = 0; i < normals.length; i += 3) {
            const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
            normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
        }
        return normals;
    };

    /**
     * A floating island's underside: from the border straight down a lip, then
     * in under the map to a point, rough as rock. Its faces look outward and
     * down, so the floor's own material draws it as cliff.
     */
    R.surroundUnderside = function(mapData, surround, p) {
        const { rays, heights, levels, mean, low, W, H } = p, n = rays.length;
        const cx = W / 2, cz = H / 2, depth = surround.drop, bottom = low - depth;
        const rings = [{ t: 0, step: 1 }, { t: 0, lip: 1, step: 1 }, { t: 0.06, step: 2 }, { t: 0.16, step: 4 }, { t: 0.32, step: 8 }, { t: 0.55, step: 16 }, { t: 0.8, step: 16 }, { t: 1, step: 16 }];
        const ids = rings.map(() => new Int32Array(n).fill(-1));
        const positions = [], uvs = [], fade = [];
        for (let k = 0; k < rings.length; k++) {
            const ring = rings[k];
            for (let i = 0; i < n; i++) {
                const ray = rays[i];
                if (ray.keep < ring.step) continue;
                // Fans add nothing under a corner: one ray of each stands for it.
                if (ray.a !== ray.b && k > 0) continue;
                let x = ray.ox, z = ray.oz, y = heights[i];
                if (ring.lip) y -= 1.6 + 1.2 * (0.5 + 0.5 * R.surroundNoise(x / 5, z / 5, surround.seed + 3));
                else if (ring.t > 0) {
                    const t = ring.t, u = Math.pow(t, 0.8);
                    x += (cx - x) * u; z += (cz - z) * u;
                    const top = carried(levels, i, t * 40) * (1 - t) + mean * t;
                    const rock = R.surroundNoise(x / 11 + i * 0.01, z / 11, surround.seed + 9) * depth * 0.18 * surround.rough * 2 * Math.sin(Math.PI * t);
                    y = top - 2.8 - (top - 2.8 - bottom) * (1 - Math.pow(1 - t, 1.7)) + rock;
                }
                ids[k][i] = positions.length / 3;
                positions.push(x, y, z);
                uvs.push(x / W, 1 - z / H);
                fade.push(0);
            }
        }
        const index = [];
        const tri = (a, b, c) => {
            if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) return;
            const A = a * 3, B = b * 3, C = c * 3;
            const ux = positions[B] - positions[A], uy = positions[B + 1] - positions[A + 1], uz = positions[B + 2] - positions[A + 2];
            const vx = positions[C] - positions[A], vy = positions[C + 1] - positions[A + 1], vz = positions[C + 2] - positions[A + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            if (nx * nx + ny * ny + nz * nz < 1e-12) return;
            // Away from a point inside the island.
            const mx = (positions[A] + positions[B] + positions[C]) / 3 - cx, my = (positions[A + 1] + positions[B + 1] + positions[C + 1]) / 3 - (mean - 1), mz = (positions[A + 2] + positions[B + 2] + positions[C + 2]) / 3 - cz;
            if (nx * mx + ny * my + nz * mz > 0) index.push(a, b, c); else index.push(a, c, b);
        };
        for (let k = 0; k + 1 < rings.length; k++) {
            const inner = ids[k], outer = ids[k + 1], kept = [];
            for (let i = 0; i < n; i++) if (outer[i] >= 0) kept.push(i);
            for (let j = 0; j < kept.length; j++) {
                const from = kept[j], to = kept[(j + 1) % kept.length], span = [];
                for (let i = from; ; i = (i + 1) % n) { if (inner[i] >= 0) span.push(i); if (i === to) break; }
                if (span.length < 2) continue;
                const mid = span.length >> 1;
                for (let m = 0; m < span.length - 1; m++) tri(inner[span[m]], inner[span[m + 1]], m < mid ? outer[from] : outer[to]);
                tri(inner[span[mid]], outer[from], outer[to]);
            }
        }
        return {
            ground: { positions: new Float32Array(positions), uvs: new Float32Array(uvs), normals: R.surroundNormals(positions, index), fade: new Float32Array(fade), index: new Uint32Array(index), hazeIndex: new Uint32Array(0) },
            water: null,
            info: { distance: 0, rays: n, rings: rings.length, vertices: positions.length / 3, triangles: index.length / 3, sea: null, style: "void" }
        };
    };

    if (!R.MapScene) {
        R.Surround = { file: "reactor_3d_surround.js" };
        if (typeof module !== "undefined" && module.exports) module.exports = R;
        return;
    }

    //-------------------------------------------------------------------------
    // The scene's meshes

    /** Off: the surroundings are built but not shown (the editor's toggle, for work at the border). */
    R.SURROUND_VISIBLE = true;

    const floorMeshOf = scene => (scene._meshes || []).find(mesh => mesh && mesh.userData && mesh.userData.roomPiece === "floor" && mesh.parent) || null;

    /** The colour of the sky's image where it meets the horizon, as light; null without a readable sky. */
    R.MapScene.prototype.surroundHorizon = function() {
        const sky = this._sky, texture = sky && sky.material && sky.material.map, image = texture && texture.image;
        if (!image || !(image.width > 0) || typeof document === "undefined") return null;
        if (this._surroundHorizon && this._surroundHorizon.image === image) return this._surroundHorizon.colour;
        let colour = null;
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 32; canvas.height = 32;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            context.drawImage(image, 0, 0, 32, 32);
            // The dome's equator in the image, by its repeat.
            const v = (((0.5 * texture.repeat.y) % 1) + 1) % 1;
            const row = clamp(Math.round((1 - v) * 32) % 32, 0, 31);
            let r = 0, g = 0, b = 0, count = 0;
            for (const y of [(row + 31) % 32, row, (row + 1) % 32]) {
                const pixels = context.getImageData(0, y, 32, 1).data;
                for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; count++; }
            }
            colour = new THREE.Color().setRGB(r / count / 255, g / count / 255, b / count / 255, THREE.SRGBColorSpace);
            canvas.width = canvas.height = 1;
        } catch (error) {
            colour = null;
        }
        this._surroundHorizon = { image, colour };
        return colour;
    };

    R.MapScene.prototype.removeSurround = function() {
        for (const mesh of this._surroundMeshes || []) {
            if (mesh.parent) mesh.parent.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.userData.rrSurroundOwn && mesh.material) mesh.material.dispose();
        }
        this._surroundMeshes = [];
        this._surroundHaze = null;
        this._surroundWater = null;
        this._surroundInfo = null;
    };

    /** Lay the map's surroundings (again): nothing for a map without them, or before its floor is there. */
    R.MapScene.prototype.addSurround = function(mapData) {
        this.removeSurround();
        if (!mapData || !this._scene) return false;
        const surround = R.surroundOf(mapData);
        if (!surround) return false;
        const floor = floorMeshOf(this);
        if (!floor) return false;
        const built = R.surroundGeometry(mapData, surround, { floorY: R.PARALLAX_GROUND_DROP - R.PARALLAX_LAYER_STEP, weak: !!(R.isWeakGpu && R.isWeakGpu()),
            none: this._surroundNone || null, origin: this._surroundOrigin || null });
        if (!built || !built.ground.index.length) return false;
        const g = built.ground;
        const position = new THREE.BufferAttribute(g.positions, 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", position);
        geometry.setAttribute("uv", new THREE.BufferAttribute(g.uvs, 2));
        geometry.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(g.index, 1));
        geometry.computeBoundingSphere();
        const lay = (mesh, group, order) => {
            mesh.renderOrder = order;
            mesh.castShadow = false;
            mesh.userData.rrSurround = true;
            // Scenery: a click or a camera ray passes through it.
            mesh.raycast = function() {};
            mesh.visible = R.SURROUND_VISIBLE !== false;
            group.add(mesh);
            mesh.updateMatrix();
            mesh.matrixAutoUpdate = false;
            this._surroundMeshes.push(mesh);
            return mesh;
        };
        // The floor's own material: the same image at the same scale, lit the same way, wearing what is painted at the border.
        const ground = lay(new THREE.Mesh(geometry, floor.material), this.belowGroup(), floor.renderOrder);
        ground.receiveShadow = floor.receiveShadow;
        if (g.hazeIndex.length) {
            // The far land again, in the horizon's colour, thicker with distance.
            const haze = new THREE.BufferGeometry();
            haze.setAttribute("position", position);
            const colours = new Float32Array((g.positions.length / 3) * 4);
            for (let i = 0; i < g.fade.length; i++) { colours[i * 4] = 1; colours[i * 4 + 1] = 1; colours[i * 4 + 2] = 1; colours[i * 4 + 3] = g.fade[i]; }
            haze.setAttribute("color", new THREE.BufferAttribute(colours, 4));
            haze.setIndex(new THREE.BufferAttribute(g.hazeIndex, 1));
            haze.boundingSphere = geometry.boundingSphere.clone();
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
            const mesh = lay(new THREE.Mesh(haze, material), this.belowGroup(), floor.renderOrder + 0.5);
            mesh.userData.rrSurroundOwn = true;
            mesh.visible = false;
            this._surroundHaze = mesh;
        }
        if (built.water && R.waterMaterial) {
            const w = built.water, sheet = new THREE.BufferGeometry();
            sheet.setAttribute("position", new THREE.BufferAttribute(w.positions, 3));
            sheet.setAttribute("uv", new THREE.BufferAttribute(w.uvs, 2));
            sheet.setAttribute("rrDepth", new THREE.BufferAttribute(w.depth, 1));
            sheet.setAttribute("rrEdge", new THREE.BufferAttribute(w.edge, 1));
            sheet.setIndex(new THREE.BufferAttribute(w.index, 1));
            sheet.computeBoundingSphere();
            // The look of the map's own water where it has some, so a lake at the border and the sea are one water.
            const own = (R.waterOf ? R.waterOf(mapData) : []).find(region => !region.path) || null;
            const name = surround.water || (own && own.material) || "Water";
            const load = this._surroundLoad || (material => R.defaultMaterialLoader(material));
            const material = R.waterMaterial(this.materialTexture(name, load), own || {});
            const mesh = lay(new THREE.Mesh(sheet, material), this.piecesGroup(), 6);
            mesh.userData.rrSurroundOwn = true;
            this._surroundWater = mesh;
        }
        this._surroundInfo = built.info;
        return true;
    };

    /** Show or hide the surroundings without building them again. */
    R.MapScene.prototype.setSurroundVisible = function(visible) {
        R.SURROUND_VISIBLE = !!visible;
        for (const mesh of this._surroundMeshes || []) if (mesh !== this._surroundHaze) mesh.visible = !!visible;
    };

    //-------------------------------------------------------------------------
    // Hooks into the scene's own steps

    const wrap = (name, after) => {
        const original = R.MapScene.prototype[name];
        if (typeof original !== "function" || original.__rrSurround) return;
        const wrapped = function() {
            const result = original.apply(this, arguments);
            try { after.apply(this, arguments); } catch (error) { if (typeof console !== "undefined") console.warn("Surround:", error); }
            return result;
        };
        // What earlier extensions marked on it stays readable through this one.
        Object.assign(wrapped, original);
        wrapped.__rrSurround = true;
        R.MapScene.prototype[name] = wrapped;
    };
    // Laid with the map once its water is (a lake at the border is banked); again when the water is laid again.
    wrap("addWater", function(mapData, load) { this._surroundMap = mapData; this._surroundLoad = load; this.followUp(() => this.addSurround(mapData)); });
    // The floor's image arrived after the map was built: the land past it can be laid now.
    wrap("addRoomPiece", function(piece) {
        if (piece === "floor" && this._surroundMap && !(this._surroundMeshes && this._surroundMeshes.length)) this.addSurround(this._surroundMap);
    });
    // The ground moved at the border: the land past it follows.
    wrap("updateTerrain", function(mapData, region) {
        if (!mapData || !this._surroundMap) return;
        const W = mapData.width, H = mapData.height;
        if (!region || region.x0 <= 1 || region.z0 <= 1 || region.x1 >= W - 1 || region.z1 >= H - 1) { this._surroundMap = mapData; this.addSurround(mapData); }
    });
    // Each frame: the far land takes the sky's colour at this time of day; an ocean's waves run.
    wrap("updateSky", function(camera, frame) {
        const haze = this._surroundHaze;
        if (haze) {
            const horizon = this.surroundHorizon();
            haze.visible = !!horizon && R.SURROUND_VISIBLE !== false;
            if (horizon) {
                const sky = R.daylight ? R.daylight().skyLinear : null;
                haze.material.color.setRGB(horizon.r * (sky ? sky[0] : 1), horizon.g * (sky ? sky[1] : 1), horizon.b * (sky ? sky[2] : 1));
            }
        }
        if (this._surroundWater && Number.isFinite(frame) && !(this._waterMeshes && this._waterMeshes.length) && R.waterUniforms) {
            R.waterUniforms().rrWaveTime.value = frame / 60;
            const texture = this._surroundWater.material.map;
            if (texture) { texture.offset.x = (frame * 0.0015) % 1; texture.offset.y = (frame * 0.0009) % 1; }
        }
    });
    const clear = R.MapScene.prototype.clear;
    if (typeof clear === "function" && !clear.__rrSurround) {
        R.MapScene.prototype.clear = function() {
            R.MapScene.prototype.removeSurround.call(this);
            this._surroundMap = null;
            this._surroundHorizon = null;
            return clear.apply(this, arguments);
        };
        Object.assign(R.MapScene.prototype.clear, clear);
        R.MapScene.prototype.clear.__rrSurround = true;
    }

    //-------------------------------------------------------------------------
    // Neighbors: the map past a border, shown beside this one and entered without a break

    const N = R.Neighbors = {
        /** Off: a neighbor is entered with a fade, and its side shows the style chosen for it. */
        enabled: true,
        /** How many maps out from the one played stand built: its neighbors, and theirs. */
        DEPTH: 2,
        /**
         * Tiles from a border within which the maps one further out past it are built too (and past which, with
         * `AHEAD_KEEP` more, they are let go): by the time the border is crossed everything that will then stand
         * already does, so nothing is built and nothing on the horizon changes in the crossing itself.
         */
        AHEAD: 48,
        AHEAD_KEEP: 24,
        /** Frames between two parts of a world built while the game plays (a part is one long frame). */
        PACE: 5,
        /** Worlds standing beside the map at once, the nearest first. */
        MAX: 8,
        /** Maps kept read at once. */
        KEEP: 16,
        /** Milliseconds a frame of building worlds while the screen fades in from a transfer (one part a frame otherwise). */
        BURST_MS: 80,
        /** Milliseconds of a world's pieces laid in one part (a chunk at least). */
        BUDGET_MS: 8,
        /** Frames a neighbor's placed models are given to arrive and be stood in their places. */
        SETTLE: 240,
        /**
         * Tiles from the side it shares with the map played within which a neighbor's events that stand as models
         * (a parked vehicle, a guard at the gate) are stood before the border is crossed: the map entered takes
         * them over by number, so nothing pops in and nothing is built in the crossing.
         */
        EVENTS_AHEAD: 48,
        /**
         * Updates back at most that the map left's last picture of the world may have been drawn for the crossing
         * frame to show it again rather than draw (Spriteset_Map.reactor3DKeepsLastPicture): the scene change takes
         * an update with no game in it, and a slow machine draws the world on its last update of a frame only. 0: drawn.
         */
        KEEP_PICTURE: 4,
        records: new Map(),
        /** The border crossing under way: `{ from, to, side, offset }`, from the step over the border until the map past it has started. */
        crossing: null,
        /** The map the crossing under way leaves, as the game held it (`begin`), until the map entered takes its world (`adopt`). */
        leftMap: null,
        /** The 3D state of the map being played (the spriteset's), as last updated. */
        live: null,
        stats: { read: 0, built: 0, adopted: 0, crossed: 0, faded: 0, buildMs: 0 }
    };
    N.OPPOSITE = { north: "south", east: "west", south: "north", west: "east" };
    const ZERO = { x: 0, z: 0 };

    /** Where a neighbor's first tile lies, in this map's tiles. */
    N.offsetOf = function(mapData, side, entry, width, height) {
        const shift = (entry && entry.shift) || 0;
        if (side === "north") return { x: shift, z: -height };
        if (side === "south") return { x: shift, z: mapData.height };
        if (side === "west") return { x: -width, z: shift };
        return { x: mapData.width, z: shift };
    };

    /**
     * The part of a side `length` tiles long that a neighbor `extent` tiles long, starting at `start`, stands
     * on: true for all of it, `{ from, to }` for a part, null when it stands beside none of it.
     */
    N.covered = function(length, start, extent) {
        const from = Math.max(0, start), to = Math.min(length, start + extent);
        if (!(to > from)) return null;
        return from <= 0 && to >= length ? true : { from, to };
    };

    /** How many tiles a place is from a side of its map. */
    N.sideDistance = function(mapData, x, y, side) {
        return side === "north" ? y : side === "south" ? mapData.height - 1 - y : side === "west" ? x : mapData.width - 1 - x;
    };

    const globalsOf = () => ({ surface: R._surface, facade: R._facade, eventProps: R._eventProps, tilt: R.BILLBOARD_TILT, doorStates: R._doorStates, doorScene: R._doorScene });
    const setGlobals = g => { R._surface = g.surface; R._facade = g.facade; R._eventProps = g.eventProps; R.BILLBOARD_TILT = g.tilt; R._doorStates = g.doorStates; R._doorScene = g.doorScene; };

    /**
     * Run `fn` with a neighbor's map as the map everything reads (its events, its surface), then put this map's back.
     * (A view with no game behind it, the editor's, has no such map: only what the last scene built left is swapped.)
     */
    N.within = function(mapData, globals, fn) {
        const game = typeof root.$dataMap !== "undefined", was = root.$dataMap, mine = globalsOf();
        if (game) root.$dataMap = mapData;
        if (globals) setGlobals(globals);
        try { return fn(); } finally { if (game) root.$dataMap = was; setGlobals(mine); }
    };

    N.read = function(file) {
        return new Promise(resolve => {
            if (typeof XMLHttpRequest === "undefined") { resolve(null); return; }
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "data/" + file);
            xhr.overrideMimeType("application/json");
            xhr.onload = () => resolve(xhr.status < 400 ? xhr.responseText : null);
            xhr.onerror = () => resolve(null);
            xhr.send();
        });
    };

    /** A map as the game holds it, from what was read: its sidecar on it, its notes read, its placed models among its events. */
    N.make = function(record) {
        const parse = text => (root.RRJson && root.RRJson.parse ? root.RRJson.parse(text) : JSON.parse(text));
        const map = parse(record.text[0]);
        if (record.text[1]) { try { map.reactor3d = parse(record.text[1]); } catch (error) { /* a map with no 3D notes */ } }
        const D = root.DataManager;
        if (D && D.extractMetadata) { D.extractMetadata(map); D.extractArrayMetadata(map.events); }
        if (map.reactor3d && R.installProps) R.installProps(map);
        return map;
    };

    /** A map past a border, read in the background: `{ state: "loading" | "ready" | "failed", map, copy }`. `map` is what its world is built from; `copy` is the one the game is handed when it enters. */
    N.request = function(mapId) {
        let record = N.records.get(mapId);
        if (record) { record.used = ++N._clock; return record; }
        record = { mapId, state: "loading", text: null, map: null, copy: null, used: ++N._clock };
        N.records.set(mapId, record);
        const stem = "Map" + String(mapId).padStart(3, "0");
        Promise.all([N.read(stem + ".json"), N.read(stem + (R.SIDECAR_SUFFIX || ".r3d.json"))]).then(texts => {
            if (!texts[0]) { record.state = "failed"; return; }
            try {
                record.text = texts;
                record.map = N.make(record);
                // (The copy the game enters by is made on a later frame: N.update.)
                record.state = "ready";
                N.stats.read++;
            } catch (error) {
                record.state = "failed";
                if (typeof console !== "undefined") console.warn("Reactor3D: the neighboring map " + mapId + " could not be read.", error);
            }
        });
        // The longest unused go, past what is kept.
        if (N.records.size > N.KEEP) {
            const old = Array.from(N.records.values()).filter(r => r !== record && !r.held).sort((p, q) => p.used - q.used)[0];
            if (old) N.records.delete(old.mapId);
        }
        return record;
    };
    N._clock = 0;

    /**
     * The map just left over a border, as a map past a border: its world stands built from `map`, the map the game
     * held, so nothing is read, parsed or indexed again in the frames after the crossing (Map005 behind the party
     * was 45 ms on one frame). Only the files are read in the background, for the copy the game is handed if the
     * party turns back (N.take).
     */
    N.played = function(mapId, map) {
        if (!map || !(mapId > 0)) return null;
        const record = { mapId, state: "ready", text: null, map, copy: null, used: ++N._clock, measure: "done" };
        N.records.set(mapId, record);
        const stem = "Map" + String(mapId).padStart(3, "0");
        Promise.all([N.read(stem + ".json"), N.read(stem + (R.SIDECAR_SUFFIX || ".r3d.json"))]).then(texts => { if (texts[0]) record.text = texts; });
        return record;
    };

    /** The map the game is handed as it crosses into `mapId`: read already, or null (then it is loaded as any map is). */
    N.take = function(mapId) {
        const cross = N.crossing, record = N.records.get(mapId);
        if (!cross || cross.to !== mapId || !record || record.state !== "ready") return null;
        const map = record.copy || (record.text ? N.make(record) : null);
        record.copy = null;
        // Its cells are the world's that stands built from the same files: indexed once (the camera asks in the crossing frame).
        if (map && R.sharePieceIndex) R.sharePieceIndex(record.map, map);
        return map;
    };

    /** Whether the border on `side` can be crossed without a break now: the map past it stands built and is read. */
    N.ready = function(side) {
        const live = N.live, body = live && live.scene && live.scene._neighborBodies ? live.scene._neighborBodies[side] : null;
        const record = body ? N.records.get(body.mapId) : null;
        return !!(N.enabled && body && !body.stage && record && record.state === "ready" && (record.copy || record.text));
    };

    /** Whether worlds stand beside the map played: their models, and the entered map's after a crossing, join a few a frame (Reactor3D.ModelJoins). */
    N.streaming = function() {
        const bodies = N.enabled && N.live && N.live.scene ? N.live.scene._neighborBodies : null;
        if (bodies) for (const side in bodies) return true;
        return false;
    };

    /** Whether the world of the map past `side` stands built beside this one (a vehicle rides over that border). */
    N.stands = function(side) {
        const live = N.live;
        return !!(N.enabled && live && live.scene && live.scene._neighborBodies && live.scene._neighborBodies[side]);
    };

    /** The step over a border begins: `exit` is Reactor3D.neighborExit's. True when it will be crossed without a break. */
    N.begin = function(exit, fromMapId) {
        N.crossing = null;
        N.leftMap = null;
        if (!N.ready(exit.side)) { N.stats.faded++; return false; }
        const body = N.live.scene._neighborBodies[exit.side];
        N.crossing = { from: fromMapId, to: exit.mapId, side: exit.side, offset: { x: body.offset.x, z: body.offset.z } };
        // The map left, as the game held it: what the world it leaves behind past the border is lit by.
        N.leftMap = root.$dataMap || null;
        // What the leader rides goes with it, model and all (the event it is on the map entered has another number).
        const ride = root.$gamePlayer && root.$gamePlayer._rrRide;
        if (ride && ride.id) N.crossing.ride = "e" + ride.id;
        // And what the followers ride behind it (ReactorVehicles.Convoy): each by the name it keeps on every map.
        const V = root.ReactorVehicles;
        if (ride && V && V.Convoy && V.Convoy.riders) N.crossing.convoy = V.Convoy.riders().map(rider => ["e" + rider.event._eventId, V.idOf(rider.event)]);
        return true;
    };

    /** The map crossed into has started (or the crossing was given up). */
    N.end = function() {
        if (N.crossing) { N.stats.crossed++; N.last = { from: N.crossing.from, to: N.crossing.to }; }
        N.crossing = null;
    };
    /** The border last crossed without a break, `{ from, to }`, until whoever goes on across it (a ride's view) has taken note. */
    N.last = null;

    //-------------------------------------------------------------------------
    // A neighbor's world in this map's scene

    const tilesetBitmaps = map => {
        const tileset = root.$dataTilesets && root.$dataTilesets[map.tilesetId];
        if (!tileset || !root.ImageManager) return [];
        return tileset.tilesetNames.map(name => root.ImageManager.loadTileset(name));
    };

    /**
     * Stand a built scene in another at an offset: the scene itself goes under one group there, so whatever
     * it lays later (plants as the eye nears, models as they load) stands there too.
     */
    N.attach = function(main, side, scene, mapId, offset, record, base) {
        const group = new THREE.Group();
        group.name = "neighbor:" + side;
        group.position.set(offset.x, 0, offset.z);
        // (A scene that was a map's own had its place in the world held still by the viewport: under a group it follows the group.)
        scene._scene.matrixWorldAutoUpdate = true;
        group.add(scene._scene);
        main._scene.add(group);
        group.updateMatrixWorld(true);
        const bodies = main._neighborBodies || (main._neighborBodies = {});
        // `offset` is from the scene it stands in; `at` from the map being played (`base`: where `main` itself stands).
        const at = { x: (base ? base.x : 0) + offset.x, z: (base ? base.z : 0) + offset.z };
        const body = bodies[side] = { mapId, side, scene, group, offset: { x: offset.x, z: offset.z }, at, record: record || null, props: null, ahead: null, settle: N.SETTLE, stage: 0, masks: 0 };
        // The scene a world stands in works every place in it out again each frame. A world stilled (N.still) is
        // left out of that: only when it has been stood somewhere else (N.reseat) is it worked out, once.
        const updateMatrixWorld = group.updateMatrixWorld;
        group.updateMatrixWorld = function(force) {
            if (body.stilled) { force = !!body.reseated; body.reseated = false; }
            return updateMatrixWorld.call(this, force);
        };
        if (scene._groundFrame) scene._groundFrame.shift.set(at.x, 0, at.z);
        if (scene._sky) scene._sky.visible = false;
        N.reseat(scene, at);
        return bodies[side];
    };

    /** Every world standing in `scene`, and in those, is told where it stands from the map being played (`base`: where `scene` does). */
    N.reseat = function(scene, base) {
        const bodies = scene._neighborBodies;
        if (!bodies) return;
        for (const side of Object.keys(bodies)) {
            const body = bodies[side];
            body.at = { x: base.x + body.offset.x, z: base.z + body.offset.z };
            body.reseated = true;
            if (body.scene._groundFrame) body.scene._groundFrame.shift.set(body.at.x, 0, body.at.z);
            if (body.scene._sky) body.scene._sky.visible = false;
            N.reseat(body.scene, body.at);
        }
    };

    /** Take a neighbor's world out of the scene it stands in: its scene is its own again. */
    N.detach = function(main, side) {
        const bodies = main._neighborBodies || {}, body = bodies[side];
        if (!body) return null;
        delete bodies[side];
        N.still(body, false);
        body.group.remove(body.scene._scene);
        if (body.scene._groundFrame) body.scene._groundFrame.shift.set(0, 0, 0);
        if (body.group.parent) body.group.parent.remove(body.group);
        body.scene._scene.updateMatrixWorld(true);
        N.reseat(body.scene, ZERO);
        return body;
    };

    /** The land past a side is laid again: without it where a neighbor's world stands (`on`: N.covered's), with it where one has gone. */
    N.relay = function(scene, side, on) {
        const none = Object.assign({}, scene._surroundNone);
        if (on) none[side] = on; else delete none[side];
        scene._surroundNone = Object.keys(none).length ? none : null;
        if (scene._surroundMap && scene.addSurround) scene.addSurround(scene._surroundMap);
    };

    /**
     * Each map keeps its own land along the part of a shared side the other does not reach: the part of this
     * map's side the neighbor stands on (`mine`) and the part of the neighbor's facing side this map stands on
     * (`theirs`), each N.covered's.
     */
    N.shared = function(mapData, map, side, offset) {
        const wide = side === "north" || side === "south";
        return {
            mine: N.covered(wide ? mapData.width : mapData.height, wide ? offset.x : offset.z, wide ? map.width : map.height),
            theirs: N.covered(wide ? map.width : map.height, wide ? -offset.x : -offset.z, wide ? mapData.width : mapData.height)
        };
    };

    /**
     * Build the world of the map past `side` beside this one. `host` is a view with no game behind it (the
     * editor's): the neighbor's tileset `flags` and the scene `settings` that view builds its own maps with
     * (its image loaders, the tile size). `parent` is the world `main` is, when `main` is itself a neighbor's
     * (`mapData` is then that neighbor's map): the world built stands two maps out.
     */
    N.addBody = function(main, mapData, side, entry, record, bitmaps, host, parent) {
        const map = record.map, offset = N.offsetOf(mapData, side, entry, map.width, map.height);
        const from = parent ? parent.at : ZERO, at = { x: from.x + offset.x, z: from.z + offset.z };
        const started = typeof performance !== "undefined" ? performance.now() : 0;
        const tileset = host ? null : root.$dataTilesets && root.$dataTilesets[map.tilesetId];
        const flags = (host ? host.flags : tileset && tileset.flags) || undefined;
        let scene = null;
        // Its hills past its own borders are the same hills this map's are: one world, one place for each map in it.
        const base = main._surroundOrigin || { x: 0, z: 0 };
        const { mine, theirs } = N.shared(mapData, map, side, offset);
        try {
            // The floor now; its pieces, then its water with the land and the plants, on the frames after (N.stage).
            scene = N.inBody(map, at, null, () => {
                const made = new R.MapScene(map, bitmaps, Object.assign({}, host && host.settings, { body: true, staged: true, tilesetId: map.tilesetId, flags,
                    surroundNone: theirs ? { [N.OPPOSITE[side]]: theirs } : null, surroundOrigin: { x: base.x + offset.x, z: base.z + offset.z } }));
                made._neighborGlobals = globalsOf();
                return made;
            });
        } catch (error) {
            if (typeof console !== "undefined") console.warn("Reactor3D: the neighboring map " + record.mapId + " could not be built.", error);
            record.state = "failed";
            scene = null;
        }
        if (!scene) return null;
        const body = N.attach(main, side, scene, record.mapId, offset, record, from);
        body.stage = 1;
        if (host && host.settings && host.settings.loadMaterial) body.load = host.settings.loadMaterial;
        N.relay(main, side, mine);
        N.stats.built++;
        if (started) N.stats.buildMs = Math.round((performance.now() - started) * 10) / 10;
        return body;
    };

    /**
     * Run `fn` as a neighbor's world is worked on: its map is the map everything reads, and the player is
     * where it stands in that map's own tiles (what is near it is laid first, the rest as it comes near).
     */
    N.inBody = function(map, offset, globals, fn) {
        const player = root.$gamePlayer;
        let stand = null;
        if (player && typeof player === "object") {
            stand = Object.create(player);
            stand._x = player._x - offset.x; stand._y = player._y - offset.z;
            stand._realX = player._realX - offset.x; stand._realY = player._realY - offset.z;
        }
        if (stand) root.$gamePlayer = stand;
        try { return N.within(map, globals, fn); } finally { if (stand) root.$gamePlayer = player; }
    };

    /**
     * The next part of a neighbor's world still to lay: its pieces, a few chunks a part (`BUDGET_MS`), then
     * its water (the land and the plants follow the water).
     */
    N.stage = function(body) {
        const map = body.record && body.record.map, scene = body.scene;
        if (!map || !scene._scene) { body.stage = 0; return; }
        const load = body.load || (name => R.defaultMaterialLoader(name));
        const stage = body.stage;
        // (A part that fails is not tried again: the next one is laid.)
        body.stage = stage === 1 ? 2 : stage === 2 ? 3 : 0;
        try {
            N.inBody(map, body.at || body.offset, scene._neighborGlobals, () => {
                if (stage === 1) scene.addPieces(map, load, true);
                else if (stage === 2) { if (!scene.layQueuedPieces(N.BUDGET_MS)) body.stage = 2; }
                else scene.addWater(map, load);
                scene._neighborGlobals = globalsOf();
            });
        } catch (error) {
            if (typeof console !== "undefined") console.warn("Reactor3D: part of the neighboring map " + body.mapId + " could not be laid.", error);
        }
    };

    N.removeBody = function(main, side) {
        const held = main._neighborBodies ? main._neighborBodies[side] : null;
        // What stands beside it goes with it.
        if (held && held.scene._neighborBodies) for (const far of Object.keys(held.scene._neighborBodies)) N.removeBody(held.scene, far);
        const body = N.detach(main, side);
        if (!body) return;
        try { body.scene.destroy(); } catch (error) { /* a renderer already gone */ }
        if (main._scene) N.relay(main, side, false);
    };

    /**
     * A neighbor's world that stands built is stood where `entry` now puts it (the editor: its shift along the
     * border was changed), with nothing built again: only the land of both maps past the shared side is laid
     * again, this map's from `mapData`. False when no world stands on that side.
     */
    N.place = function(main, mapData, side, entry) {
        const body = main._neighborBodies ? main._neighborBodies[side] : null, map = body && body.record ? body.record.map : null;
        if (!map || !body.scene._scene) return false;
        const scene = body.scene, offset = N.offsetOf(mapData, side, entry, map.width, map.height);
        const { mine, theirs } = N.shared(mapData, map, side, offset), base = main._surroundOrigin || { x: 0, z: 0 };
        body.offset = { x: offset.x, z: offset.z };
        body.at = { x: offset.x, z: offset.z };
        body.group.position.set(offset.x, 0, offset.z);
        body.group.updateMatrixWorld(true);
        N.reseat(scene, body.at);
        scene._surroundOrigin = { x: base.x + offset.x, z: base.z + offset.z };
        if (scene._groundFrame) { scene._groundFrame.shift.set(offset.x, 0, offset.z); scene._groundFrame.place.set(scene._surroundOrigin.x, 0, scene._surroundOrigin.z); }
        scene._surroundNone = theirs ? { [N.OPPOSITE[side]]: theirs } : null;
        if (scene._surroundMap && scene.addSurround) scene.addSurround(scene._surroundMap);
        const none = Object.assign({}, main._surroundNone);
        if (mine) none[side] = mine; else delete none[side];
        main._surroundNone = Object.keys(none).length ? none : null;
        if (main.addSurround) main.addSurround(mapData);
        // What it casts was drawn into the shadow maps where it stood.
        if (R.Shadows && R.Shadows.invalidate) R.Shadows.invalidate();
        return true;
    };

    /** A neighbor's placed models (its trees, its rocks as models) stand in their places: asked for until they have all arrived. */
    N.settle = function(body) {
        const map = body.record && body.record.map;
        if (!map || typeof root.Game_Event === "undefined" || !body.scene.syncCharacterModels) { body.settle = 0; return; }
        N.within(map, body.scene._neighborGlobals, () => {
            if (!body.props) {
                body.props = [];
                for (const event of map.events) {
                    if (!event || !(event.id >= R.PROP_EVENT_BASE)) continue;
                    try { body.props.push(new root.Game_Event(body.mapId, event.id)); } catch (error) { /* a placed model the game cannot stand */ }
                }
            }
            if (!body.props.length) { body.settle = 0; return; }
            body.scene.syncCharacterModels(body.props);
            const held = body.scene._modelInstances;
            // (What was stood ahead of the crossing is said so: the map entered keeps it only where its own event matches.)
            if (held && body.ahead) for (const character of body.ahead) { const holder = held.get(R.modelInstanceKey(character)); if (holder) holder.ahead = true; }
            let waiting = 0;
            if (held) for (const holder of held.values()) if (!holder.object) waiting++;
            // All there: once more to stand them, and that is that.
            body.settle = waiting ? body.settle - 1 : Math.min(body.settle - 1, 2);
        });
    };

    /**
     * The events of the map past a border, beside the map played, that stand as models within `EVENTS_AHEAD` tiles of
     * the side the two maps share, as the game will hold them (its parked vehicles among them, at the numbers its entry
     * gives them). Asked once for a world one map out.
     */
    N.aheadEvents = function(body) {
        const map = body.record && body.record.map;
        if (!map || !Array.isArray(map.events) || typeof root.Game_Event === "undefined" || !R.characterModelSpec || !N.OPPOSITE[body.side]) return [];
        const facing = N.OPPOSITE[body.side], out = [];
        return N.within(map, body.scene._neighborGlobals, () => {
            const V = root.ReactorVehicles;
            if (V && V.addVisitingVehicles && !map._rrVisitorsAdded) { map._rrVisitorsAdded = true; try { V.addVisitingVehicles(body.mapId); } catch (error) { /* no vehicles then */ } }
            for (const event of map.events) {
                if (!event || event.id >= R.PROP_EVENT_BASE || N.sideDistance(map, event.x, event.y, facing) > N.EVENTS_AHEAD) continue;
                let character = null;
                try { character = new root.Game_Event(body.mapId, event.id); } catch (error) { continue; }
                if (character && R.characterModelSpec(character)) out.push(character);
            }
            return out;
        });
    };

    /**
     * What each of a neighbor's placed models is bumped into, worked out one a frame while the player is
     * still on the way: nothing is left to work out in the frame the border is crossed.
     */
    N.mask = function(body) {
        const map = body.record && body.record.map;
        if (!map || !body.props || !R.modelCollisionMask || !R.characterModelSpec) { body.masks = -1; return; }
        N.within(map, body.scene._neighborGlobals, () => {
            const started = typeof performance !== "undefined" ? performance.now() : 0;
            while (body.masks >= 0 && body.masks < body.props.length) {
                const prop = body.props[body.masks++];
                try { const spec = R.characterModelSpec(prop); if (spec) R.modelCollisionMask(spec); } catch (error) { /* a model that cannot be measured */ }
                if (!started || performance.now() - started > 2) return;
            }
            body.masks = -1;
        });
    };

    /** Whether a map past a border has had its rocks measured on the background meshers (Reactor3D.prepareRockColumns), asked once: its world is built after. */
    N.measured = function(record) {
        if (!record.measure) {
            record.measure = "busy";
            const done = () => { record.measure = "done"; };
            const measuring = R.prepareRockColumns && record.map ? R.prepareRockColumns(record.map) : null;
            if (measuring) measuring.then(done, done); else done();
        }
        return record.measure === "done";
    };

    /** Whether the screen is still coming up from black (a map entered by a transfer): worlds are then built several parts a frame. */
    N.dark = function() {
        const scene = root.SceneManager && root.SceneManager._scene;
        return !!(scene && scene._fadeDuration > 0 && scene._fadeSign > 0);
    };

    /** Whether one more part of a world may be built this frame. */
    N.spend = function(frame) {
        if (N._dark) return typeof performance === "undefined" || performance.now() - N._burstFrom < N.BURST_MS;
        if (frame >= N._builtAt && frame - N._builtAt < N.PACE) return false;
        N._builtAt = frame;
        return true;
    };

    /**
     * A world that stands whole moves nothing: its places in the world are worked out once, not on every
     * frame for every tree in it (`on`). What is laid in it later (plants as the eye nears) finds its own
     * place. Undone when it becomes the map played, where things move again.
     */
    N.still = function(body, on) {
        if (!on) {
            if (body.stilled) for (const object of body.stilled) object.matrixAutoUpdate = true;
            body.stilled = null;
            return;
        }
        if (body.stilled || !body.group || !body.scene._scene) return;
        const held = [];
        body.group.updateMatrixWorld(true);
        const hold = object => {
            // (A skinned model's bones are moved by its motion; a world standing in this one is its own to still.)
            if (object.isBone || (object !== body.group && typeof object.name === "string" && object.name.indexOf("neighbor:") === 0)) return;
            if (object.matrixAutoUpdate) { object.matrixAutoUpdate = false; held.push(object); }
            for (const child of object.children) hold(child);
        };
        hold(body.group);
        body.stilled = held;
    };

    /** The frame's work on a world that stands `depth` maps out: the rest of it laid, its models stood, and, beside the map played, made ready to enter. */
    N.keep = function(body, depth, frame) {
        if (body.scene._sky && body.scene._sky.visible) body.scene._sky.visible = false;
        if (!body.record) { const record = N.request(body.mapId); if (record.state === "ready") body.record = record; }
        if (body.stage) { if (N.spend(frame)) N.stage(body); return; }
        // Beside the map played: what its own combine of the light draws with is compiled ahead (Reactor3D.HalfLight),
        // so crossing into it compiles nothing.
        if (depth === 1 && R.HalfLight && R.HalfLight.expect) R.HalfLight.expect();
        // And, past the side the party nears, the picture of its glowing water while the map played has none to keep (Reactor3D.WaterLight),
        // and the haze's and the halo's programs when it has lamps or water (Reactor3D.HalfHaze).
        if (depth === 1 && body.side === N._ahead && body.record && body.record.map) {
            const map = body.record.map, sidecar = map.reactor3d || {};
            if (R.WaterLight && R.WaterLight.prepare) R.WaterLight.prepare(map, root.$dataMap);
            if (R.HalfHaze && R.HalfHaze.expect && ((Array.isArray(sidecar.lights) && sidecar.lights.length) || (Array.isArray(sidecar.water) && sidecar.water.length))) R.HalfHaze.expect();
        }
        // Beside the map played: its events by the shared side are stood too, once (a world that came nearer by a crossing
        // included). Only those within reach are made, and their models join as the others do (Reactor3D.ModelJoins).
        if (depth === 1 && !body.ahead && body.record && body.record.state === "ready" && N.upkeep(frame)) {
            body.ahead = N.aheadEvents(body);
            if (body.ahead.length) {
                if (!body.props) N.settle(body);
                if (body.props) for (const character of body.ahead) body.props.push(character);
                body.settle = Math.max(body.settle, N.SETTLE);
                if (body.stilled) N.still(body, false);
            }
        }
        if (body.settle > 0) N.settle(body);
        else {
            if (!body.stilled) N.still(body, true);
            if (depth === 1 && body.masks >= 0 && body.record && N.upkeep(frame)) N.mask(body);
        }
        if (depth > 1) { if (body.record) body.record.used = ++N._clock; return; }
        // Its plants are laid as the eye nears them, as this map's are.
        if (body.scene.updateFoliageFrame && body.scene._foliageMap) N.inBody(body.scene._foliageMap, body.at, null, () => body.scene.updateFoliageFrame(null));
        // Read (a map left over a border was never asked for), and a copy of it ready for the game to enter by.
        const record = N.request(body.mapId);
        if (record.state === "ready" && !record.copy && record.text && N.upkeep(frame)) record.copy = N.make(record);
    };

    /**
     * Whether one more piece of a standing world's upkeep (its events stood ahead, a model's footprint measured,
     * the copy the game enters by) may be done this frame: one a frame, so the frames after a crossing, when the
     * map one further out comes beside the party, do not take them all at once.
     */
    N.upkeep = function(frame) {
        if (N._upkeptAt === frame) return false;
        N._upkeptAt = frame;
        return true;
    };

    /** How far a place of the map played is from a world standing at `at`, `width` by `height` tiles: 0 inside it. */
    N.gap = function(x, y, at, width, height) {
        const dx = Math.max(at.x - x, 0, x - (at.x + width)), dz = Math.max(at.z - y, 0, y - (at.z + height));
        return Math.hypot(dx, dz);
    };

    /** The scene of the map being played (the game's spriteset's), or null outside a game or for any other map. */
    N.playedScene = function(mapData) {
        const scene = root.SceneManager && root.SceneManager._scene, live = scene && scene._spriteset && scene._spriteset._reactor3d;
        return live && live.scene && root.$dataMap === mapData ? live.scene : null;
    };

    /**
     * Whether a point past the edge of the map played (`mapData`, in its tiles) is in the ground, or in
     * something built, of the neighboring map whose world stands there (Reactor3D.cameraArmBlocked): a camera
     * by a border keeps out of the rock past it as it does out of this map's. `what`: "ground" or "pieces"
     * for only that, else either. False where no world stands.
     */
    N.solidAt = function(mapData, x, y, z, thin, doors, what) {
        const bodies = N.enabled ? (N.playedScene(mapData) || {})._neighborBodies : null;
        if (!bodies) return false;
        for (const side of R.SURROUND_SIDES) {
            const body = bodies[side], map = body ? (body.record && body.record.map) || body.mapData : null;
            if (!map) continue;
            const lx = x - body.offset.x, lz = z - body.offset.z;
            if (!(lx >= 0 && lz >= 0 && lx < map.width && lz < map.height)) continue;
            return N.within(map, body.scene._neighborGlobals, () => {
                if (what !== "pieces" && R.terrainHeightAt && R.elevationAt && y < R.elevationAt(map, Math.floor(lx), Math.floor(lz)) + R.terrainHeightAt(map, lx, lz) + R.CAMERA_GROUND_MARGIN) return true;
                return what !== "ground" && !!(R.hasPieces && R.hasPieces(map) && R.pieceSolidAt(map, lx, y, lz, null, thin, doors));
            });
        }
        return false;
    };

    /** Tiles each side of a border over which the lighting of the two maps meets (`lightBlend`). */
    N.LIGHT_BAND = 16;
    /** The steps it meets in, across the whole band: each step moves a sun once, and redraws its shadows once. */
    N.LIGHT_STEPS = 16;

    /**
     * How far toward the lighting of a neighboring map the lighting stands where the player is
     * (Reactor3D.seamAmbient, Reactor3D.blendSeamSun): `{ home, weight, map, offset, globals }`, `home`
     * the map played, `weight` from 0 (its own) to 1, `map` the neighbor whose world stands in `scene`,
     * `offset` where that map's first tile lies in this map's tiles; null with none in reach. Worked
     * from how much nearer the player is to this map than to the neighbor's: one half on the border,
     * and at every place the same lighting reckoned from either map, so crossing changes nothing.
     */
    N.lightBlend = function(scene, mapData, player) {
        const bodies = scene && scene._neighborBodies;
        if (!N.enabled || !bodies || !mapData || !player) return null;
        const x = player._realX + 0.5, y = player._realY + 0.5, band = N.LIGHT_BAND, steps = N.LIGHT_STEPS;
        const inside = N.gap(x, y, ZERO, mapData.width, mapData.height);
        let best = null;
        for (const side of R.SURROUND_SIDES) {
            const body = bodies[side], map = body ? (body.record && body.record.map) || body.mapData : null;
            if (!map) continue;
            const lead = N.gap(x, y, body.offset, map.width, map.height) - inside;
            if (lead >= band) continue;
            const t = Math.max(0, Math.min(1, 0.5 - lead / (2 * band)));
            // Stepped evenly either side of the half, so either map's reckoning lands on the same step.
            const u = t * t * (3 - 2 * t) - 0.5, weight = 0.5 + Math.sign(u) * Math.round(Math.abs(u) * steps) / steps;
            if (weight > 0 && (!best || weight > best.weight)) best = { home: mapData, weight, map, offset: body.offset, globals: body.scene._neighborGlobals || null };
        }
        return best;
    };

    /**
     * Once a frame on a 3D map: every map within `DEPTH` maps of the one played is read and its world built
     * (one part a frame, the nearest first; several while the screen fades in), each map once however many
     * ways lead to it, and worlds further out are let go.
     */
    N.update = function(live, bitmaps) {
        N.live = live;
        const map = root.$dataMap, player = root.$gamePlayer, scene = live && live.scene;
        if (!N.enabled || !map || !player || !scene || !scene._scene || N.crossing) return;
        const infos = root.$dataMapInfos;
        if (!infos) return;
        const frame = root.Graphics ? root.Graphics.frameCount : 0;
        N._dark = N.dark();
        N._burstFrom = typeof performance !== "undefined" ? performance.now() : 0;
        // What is sorted by how far it is from the eye (a world's plants) asks where the camera is: a camera made
        // this frame (a map just entered) has been aimed, and has not yet been drawn with.
        const view = R._viewport, eye = view && typeof view.camera === "function" ? view.camera() : null;
        if (eye && eye.updateMatrixWorld) eye.updateMatrixWorld();
        const standing = new Set([root.$gameMap && root.$gameMap.mapId ? root.$gameMap.mapId() : 0]);
        // The side the party is about to leave by: the maps past it stand one further out.
        let ahead = "", least = Infinity;
        for (const side of R.SURROUND_SIDES) {
            const away = N.sideDistance(map, player._realX, player._realY, side);
            if (R.neighborsOf(map)[side] && away < least) { least = away; ahead = side; }
        }
        if (least > (N._ahead === ahead ? N.AHEAD + N.AHEAD_KEEP : N.AHEAD)) ahead = "";
        N._ahead = ahead;
        let level = [{ scene, map, body: null, side: "" }], count = 0;
        for (let depth = 1; depth <= N.DEPTH + 1 && level.length; depth++) {
            // One further out than `DEPTH`: only past the side the party nears.
            if (depth > N.DEPTH) { const beyond = level.filter(host => !!ahead && host.side === ahead); for (const host of level) if (beyond.indexOf(host) < 0) N.strip(host.scene); level = beyond; if (!level.length) break; }
            // What stands: a world the map no longer names, or that already stands nearer, goes.
            for (const host of level) {
                const bodies = host.scene._neighborBodies;
                if (!bodies) continue;
                const sides = host.map ? R.neighborsOf(host.map) : null;
                for (const side of Object.keys(bodies)) {
                    const body = bodies[side], entry = sides ? sides[side] : null;
                    if (standing.has(body.mapId) || (sides && (!entry || !infos[entry.map] || body.mapId !== entry.map))) { N.removeBody(host.scene, side); continue; }
                    standing.add(body.mapId);
                    count++;
                }
            }
            // What is to stand, the nearest first, and the frame's work on what does.
            const wanted = [], next = [];
            for (const host of level) {
                if (!host.map) continue;
                const sides = R.neighborsOf(host.map), bodies = host.scene._neighborBodies || (host.scene._neighborBodies = {});
                const from = host.body ? host.body.at : ZERO;
                for (const side of R.SURROUND_SIDES) {
                    const entry = sides[side], body = bodies[side];
                    if (body) { N.keep(body, depth, frame); if (!body.stage) next.push({ scene: body.scene, map: body.record ? body.record.map : null, body, side: host.side || side }); continue; }
                    if (!entry || !infos[entry.map] || standing.has(entry.map)) continue;
                    // (Its size is not known until it is read: how near it is, is how near the border it lies past is.)
                    const W = host.map.width, H = host.map.height, wide = side === "north" || side === "south";
                    const edge = { x: from.x + (side === "east" ? W : 0), z: from.z + (side === "south" ? H : 0) };
                    wanted.push({ host, side, entry, away: N.gap(player._realX, player._realY, edge, wide ? W : 0, wide ? 0 : H) });
                }
            }
            wanted.sort((p, q) => p.away - q.away);
            for (const want of wanted) {
                if (count >= N.MAX || standing.has(want.entry.map)) continue;
                const record = N.request(want.entry.map);
                if (record.state !== "ready" || !N.measured(record)) continue;
                const sheets = tilesetBitmaps(record.map);
                if (sheets.some(bitmap => bitmap && bitmap.isReady && !bitmap.isReady())) continue;
                if (!N.spend(frame)) continue;
                if (N.addBody(want.host.scene, want.host.map, want.side, want.entry, record, sheets.length ? sheets : bitmaps, null, want.host.body)) { standing.add(want.entry.map); count++; }
            }
            level = next;
        }
        // Past that nothing stands.
        for (const host of level) N.strip(host.scene);
        N.haze(scene, scene);
    };

    /** The worlds standing in a scene are let go, one a frame (letting one go is a long frame too). */
    N.strip = function(scene) {
        const bodies = scene._neighborBodies;
        if (!bodies) return;
        const frame = root.Graphics ? root.Graphics.frameCount : 0;
        for (const side of Object.keys(bodies)) {
            if (N._strippedAt === frame) return;
            N._strippedAt = frame;
            N.removeBody(scene, side);
        }
    };

    /** The far land of every world beside the map fades into the sky as the map's own does (only the map's own scene follows the sky each frame). */
    N.haze = function(main, scene) {
        const bodies = scene._neighborBodies;
        if (!bodies) return;
        const horizon = main.surroundHorizon ? main.surroundHorizon() : null, sky = horizon && R.daylight ? R.daylight().skyLinear : null;
        for (const side of Object.keys(bodies)) {
            const body = bodies[side], haze = body.scene._surroundHaze;
            if (haze) {
                haze.visible = !!horizon && R.SURROUND_VISIBLE !== false;
                if (horizon) haze.material.color.setRGB(horizon.r * (sky ? sky[0] : 1), horizon.g * (sky ? sky[1] : 1), horizon.b * (sky ? sky[2] : 1));
            }
            N.haze(main, body.scene);
        }
    };

    /**
     * The models stood ahead of the crossing (N.aheadEvents) stay where the map entered has the same event wearing the
     * same model, and go where it has not (a vehicle ridden off since, a page turned): its own syncing stands it again.
     */
    N.keepAhead = function(scene) {
        const held = scene._modelInstances, map = root.$gameMap;
        if (!held || !map || typeof map.event !== "function") return;
        for (const [key, holder] of Array.from(held.entries())) {
            if (!holder.ahead || !/^e\d+$/.test(key)) continue;
            const event = map.event(Number(key.slice(1))), spec = event && R.characterModelSpec ? R.characterModelSpec(event) : null;
            if (spec && R.modelCacheKey(spec.name, spec.ext, spec.file) === holder.spec) { holder.ahead = false; continue; }
            if (holder.object && holder.object.parent) holder.object.parent.remove(holder.object);
            if (R.releaseModelHolder) R.releaseModelHolder(holder);
            held.delete(key);
        }
    };

    /** The models of the party go with it: out of the scene left, into the one entered, as they are. */
    N.carryParty = function(from, to, ride, riddenNow, others) {
        const held = from._modelInstances;
        if (!held || !to.modelsGroup) return;
        if (!to._modelInstances) to._modelInstances = new Map();
        const group = to.modelsGroup();
        // What is ridden, the leader's and each follower's own: the key it had on the map left, and the one it has now.
        const rides = new Map();
        if (ride && riddenNow) rides.set(ride, riddenNow);
        for (const pair of others || []) if (pair && pair[0] && pair[1]) rides.set(pair[0], pair[1]);
        for (const [key, holder] of Array.from(held.entries())) {
            const ridden = rides.has(key);
            if (key !== "p" && !/^f\d+$/.test(key) && !ridden) continue;
            held.delete(key);
            const as = ridden ? rides.get(key) : key;
            const before = to._modelInstances.get(as);
            if (before && before.object && before.object.parent) before.object.parent.remove(before.object);
            to._modelInstances.set(as, holder);
            // What is ridden is another event on the map entered: its model follows that one from here (its wheels turn by the road that event rolls).
            if (ridden && root.$gameMap && root.$gameMap.event) {
                const event = root.$gameMap.event(Number(String(as).slice(1)));
                if (event) holder.character = event;
            }
            if (holder.object) group.add(holder.object);
        }
    };

    /**
     * The scene of the map crossed into, for its spriteset: the world that stood past the border, as it stands,
     * with the map left behind standing past the border come over. Null when there is none (the map is then
     * built as any map is).
     */
    N.adopt = function(mapId) {
        const cross = N.crossing, old = N.live;
        if (!cross || cross.to !== mapId || !old || !old.scene || !old.scene._scene) return null;
        const bodies = old.scene._neighborBodies || {}, body = bodies[cross.side];
        if (!body || body.mapId !== mapId) return null;
        // (What else stands beside the map left stays beside it: nothing behind the party changes as it crosses.)
        N.detach(old.scene, cross.side);
        const scene = body.scene;
        const riding = root.$gamePlayer && root.$gamePlayer._rrRide;
        const V = root.ReactorVehicles, vehicles = V && V.list && cross.convoy ? V.list() : [];
        const convoy = (cross.convoy || []).map(pair => { const now = vehicles.find(event => V.idOf(event) === pair[1]); return [pair[0], now ? "e" + now._eventId : null]; });
        N.carryParty(old.scene, scene, cross.ride, riding && riding.id ? "e" + riding.id : null, convoy);
        N.keepAhead(scene);
        // The map entered is the one everything reads now; what the map left read is kept for a way back.
        old.scene._neighborGlobals = globalsOf();
        scene._neighborKept = false;
        if (scene._neighborGlobals) setGlobals(scene._neighborGlobals);
        // The reflections go on from the capture they had: the same world, in the entered map's tiles.
        if (R.Reflections && R.Reflections.shift) R.Reflections.shift(cross.offset);
        if (scene._sky) scene._sky.visible = true;
        // The map left stands past the border come over, kept by its old spriteset no longer.
        old.scene._neighborKept = true;
        const back = N.OPPOSITE[cross.side];
        const kept = N.records.get(cross.from);
        const left = N.attach(scene, back, old.scene, cross.from, { x: -cross.offset.x, z: -cross.offset.z }, (kept && kept.state === "ready" ? kept : null) || N.played(cross.from, N.leftMap));
        left.settle = 0;
        // Its map is known before its file is read again (a map played was never read as a neighbor): its lighting meets this map's at once.
        left.mapData = N.leftMap || null;
        N.leftMap = null;
        // Its plants were last sorted into seen and unseen from a camera that had already gone over the border with
        // the party (all unseen): they are seen until its next sorting, a frame or two on.
        const plants = old.scene._foliageGroup;
        if (plants) for (const mesh of plants.children) if (mesh.userData && mesh.userData.rrFoliageChunk) mesh.visible = true;
        N.stats.adopted++;
        return scene;
    };

    R.Surround = { file: "reactor_3d_surround.js" };
    if (typeof module !== "undefined" && module.exports) module.exports = R;
})(typeof globalThis !== "undefined" ? globalThis : this);
