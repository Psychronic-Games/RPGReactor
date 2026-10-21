//=============================================================================
// reactor_3d_foliage.js — RPG Reactor 3D foliage: grass, flowers, ferns, reeds, bushes
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js), loaded after the world builder:
 * in the game from scriptUrls, in the editor from Reactor3D.EXTENSIONS, and in
 * Node by the core's own tail.
 *
 * A map's foliage lives in its sidecar as `foliage`:
 *
 *   { "wind": { "dir": 30, "strength": 0.6, "gust": 1 },
 *     "layers": [ { "kind": "grass", "density": "0x812 4x6 7x3 0x...", "height": 0.8,
 *                   "colour": "#4f7d34", "tip": "#b4c45e", "vary": 0.25, "seed": 1 } ],
 *     "bushes": [ { "x": 41.5, "y": 30.2, "size": 2.2, "colour": "#3d6a2a", "seed": 7 } ] }
 *
 * A layer is one kind painted over the map: `density` is a level 0-9 per
 * cell, row by row over the whole map, written as runs ("0x812" is 812 cells
 * of none, "7" one cell at level 7). Blades are not stored: they are grown
 * from the density by a seeded scatter, on the ground the map has where it is
 * drawn, so the file stays small and the grass follows the terrain. Grass
 * does not grow where a piece or a rock stands, under water (reeds stand in
 * shallow water), or on a slope the room draws as cliff.
 *
 * Drawing: one instanced mesh per layer per chunk of the map; an instance is a
 * clump (three grass blades, a flower, a fern's fronds, a stand of reeds) built
 * in the vertex shader from a few numbers, so a field is a few megabytes of
 * attributes and no per-frame CPU work. Wind is a rolling gust field over the
 * map in the same shader; characters walking through bend it. Density thins
 * with distance by rank: each chunk's clumps are sorted by a random rank and
 * drawn up to the share the distance keeps, the last of them shrinking away,
 * so nothing pops. Bushes are seeded clusters of leaf cards round a woody core,
 * merged per chunk, swaying gently, casting shadows; a big one blocks its cells.
 */

(function(root) {
    "use strict";
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const R = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!R) return;

    //-------------------------------------------------------------------------
    // The format

    // The last three are not Earth's: bulbs (a lit globe on a thin stalk), tendrils (fronds that curl and
    // uncurl, each in its own time) and crystals (shards standing in the ground, which no wind moves).
    R.FOLIAGE_KINDS = ["grass", "flowers", "fern", "reeds", "bulbs", "tendrils", "crystals"];
    /** What each kind looks like before an author says otherwise. Heights in tiles (a tile is about 0.6 m). */
    R.FOLIAGE_LOOKS = {
        grass: { height: 0.8, colour: "#4a7a30", tip: "#b9c862", vary: 0.25, perLevel: 0.9 },
        flowers: { height: 0.65, colour: "#4f7f34", tip: "#7ea54a", vary: 0.3, perLevel: 0.3, colours: ["#f4d54a", "#fafafa", "#e2609b", "#8f7ee6"] },
        fern: { height: 1.0, colour: "#2f5e24", tip: "#6f9a3e", vary: 0.2, perLevel: 0.22 },
        reeds: { height: 2.2, colour: "#5d7a3a", tip: "#b8b06a", vary: 0.2, perLevel: 0.45 },
        // `glow` (0-1): how much of the kind's own colour shows whatever the light, strongest at the tip.
        bulbs: { height: 1.1, colour: "#2a3f52", tip: "#5a8fa0", vary: 0.3, perLevel: 0.22, glow: 1, colours: ["#7afff0", "#b8ff5a", "#ff7af0"] },
        tendrils: { height: 1.3, colour: "#3a2a70", tip: "#c48cf0", vary: 0.25, perLevel: 0.26, glow: 0.3 },
        crystals: { height: 0.7, colour: "#5a4a9a", tip: "#d8c8ff", vary: 0.35, perLevel: 0.3, glow: 0.45 }
    };
    /** The kinds a ground marked bare still takes: mineral, not grown. */
    R.FOLIAGE_ON_BARE = ["crystals"];
    /** How bright a glowing tip is beside its colour in full light. */
    R.FOLIAGE_GLOW = 1.1;
    R.BUSH_LOOK = { colour: "#3f6b2b", size: 1.6 };
    /** A bush this wide or wider stops a walker; smaller ones are walked through. */
    R.BUSH_BLOCK_SIZE = 1.4;
    R.FOLIAGE_MAX_HEIGHT = 6;
    R.WIND_DEFAULT = { dir: 30, strength: 0.6, gust: 1 };

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const num = (v, fallback) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
    const hex = (v, fallback) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);

    /** Density runs to levels: one byte per cell, `size` of them. Unknown tokens read as none. */
    R.decodeFoliageDensity = function(text, size) {
        const out = new Uint8Array(Math.max(0, size | 0));
        if (typeof text !== "string" || !text) return out;
        let i = 0;
        for (const token of text.split(/[\s,]+/)) {
            if (!token || i >= out.length) continue;
            const m = /^([0-9])(?:x(\d+))?$/.exec(token);
            if (!m) continue;
            const level = Number(m[1]), count = m[2] ? Math.min(Number(m[2]), out.length - i) : 1;
            if (level) out.fill(level, i, i + count);
            i += count;
        }
        return out;
    };

    /** Levels to runs, the trailing none left off. */
    R.encodeFoliageDensity = function(levels) {
        const parts = [];
        let end = levels.length;
        while (end > 0 && !levels[end - 1]) end--;
        for (let i = 0; i < end;) {
            const level = levels[i];
            let j = i + 1;
            while (j < end && levels[j] === level) j++;
            const run = j - i;
            if (run > 1) parts.push(level + "x" + run);
            else parts.push(String(level));
            i = j;
        }
        return parts.join(" ");
    };

    R.normalizeFoliageLayer = function(raw, mapData) {
        if (!raw || typeof raw !== "object" || !R.FOLIAGE_KINDS.includes(raw.kind)) return null;
        const look = R.FOLIAGE_LOOKS[raw.kind];
        const size = mapData && mapData.width > 0 && mapData.height > 0 ? mapData.width * mapData.height : 0;
        const layer = {
            kind: raw.kind,
            density: R.decodeFoliageDensity(raw.density, size),
            height: clamp(num(raw.height, look.height), 0.1, R.FOLIAGE_MAX_HEIGHT),
            colour: hex(raw.colour, look.colour),
            tip: hex(raw.tip, look.tip),
            vary: clamp(num(raw.vary, look.vary), 0, 1),
            glow: clamp(num(raw.glow, look.glow || 0), 0, 1),
            seed: Math.floor(num(raw.seed, 1)) | 0
        };
        if (look.colours) {
            const colours = Array.isArray(raw.colours) ? raw.colours.map(c => hex(c, null)).filter(Boolean) : [];
            layer.colours = colours.length ? colours : look.colours.slice();
        }
        return layer;
    };

    R.normalizeBush = function(raw, mapData) {
        if (!raw || typeof raw !== "object") return null;
        const x = num(raw.x, NaN), y = num(raw.y, NaN);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const w = mapData && mapData.width > 0 ? mapData.width : Infinity, h = mapData && mapData.height > 0 ? mapData.height : Infinity;
        if (x < 0 || y < 0 || x > w || y > h) return null;
        const bush = {
            x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
            size: clamp(num(raw.size, R.BUSH_LOOK.size), 0.4, 8),
            colour: hex(raw.colour, R.BUSH_LOOK.colour),
            seed: Math.floor(num(raw.seed, 1)) | 0
        };
        // Optional: taller than wide (0.5-2, 1 a round bush) and blossom colour.
        const tall = num(raw.tall, 1);
        if (Math.abs(tall - 1) > 1e-6) bush.tall = clamp(tall, 0.5, 2.5);
        const bloom = hex(raw.bloom, null);
        if (bloom) bush.bloom = bloom;
        return bush;
    };

    R.normalizeWind = function(raw) {
        const wind = raw && typeof raw === "object" ? raw : {};
        return {
            dir: ((num(wind.dir, R.WIND_DEFAULT.dir) % 360) + 360) % 360,
            strength: clamp(num(wind.strength, R.WIND_DEFAULT.strength), 0, 2),
            gust: clamp(num(wind.gust, R.WIND_DEFAULT.gust), 0, 2)
        };
    };

    R.normalizeFoliage = function(raw, mapData) {
        if (!raw || typeof raw !== "object") return null;
        const layers = (Array.isArray(raw.layers) ? raw.layers : []).map(layer => R.normalizeFoliageLayer(layer, mapData)).filter(Boolean);
        const bushes = (Array.isArray(raw.bushes) ? raw.bushes : []).map(bush => R.normalizeBush(bush, mapData)).filter(Boolean);
        return { wind: R.normalizeWind(raw.wind), layers, bushes };
    };

    /** The map's foliage, normalized once per sidecar object (an edit writes a new one). */
    R.foliageOf = function(mapData) {
        const raw = mapData && mapData.reactor3d && mapData.reactor3d.foliage;
        if (!raw || typeof raw !== "object") return null;
        const memo = this._foliageMemo || (this._foliageMemo = new WeakMap());
        let known = memo.get(raw);
        if (known && known.width === mapData.width && known.height === mapData.height) return known.value;
        known = { width: mapData.width, height: mapData.height, value: R.normalizeFoliage(raw, mapData) };
        memo.set(raw, known);
        return known.value;
    };

    R.hasFoliage = function(mapData) {
        const foliage = this.foliageOf(mapData);
        return !!(foliage && (foliage.bushes.length || foliage.layers.some(layer => layer.density.some(v => v))));
    };

    //-------------------------------------------------------------------------
    // Where things grow

    /** The bare ground at a point: elevation and terrain, no pieces (foliage keeps off cells with pieces). */
    const bareGround = (mapData, wx, wz) => R.elevationAt(mapData, Math.floor(wx), Math.floor(wz)) + R.terrainHeightAt(mapData, wx, wz);

    /** The terrain's slope in a cell, rise per tile, from its corners. */
    const slopeAt = (mapData, x, y) => {
        if (!R.terrainOf(mapData)) return 0;
        const a = R.terrainHeightAt(mapData, x, y), b = R.terrainHeightAt(mapData, x + 1, y);
        const c = R.terrainHeightAt(mapData, x, y + 1), d = R.terrainHeightAt(mapData, x + 1, y + 1);
        return Math.max(Math.abs(b - a + d - c) / 2, Math.abs(c - a + d - b) / 2);
    };

    /**
     * Whether a kind may grow in a cell: not where a piece or a rock stands on
     * the ground, not under water (reeds take shallow water), not on a slope the
     * room draws as rock. Returns the water's depth for reeds (0 on land), or -1.
     */
    R.foliageCellOpen = function(mapData, x, y, kind, limit = R.foliageSlopeLimit(mapData)) {
        if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return -1;
        if (R.pieceOnGround(mapData, x, y)) return -1;
        if (slopeAt(mapData, x, y) > limit) return -1;
        // Nor on a ground type marked bare (sand, snow, ash).
        if (R.groundBareAt && !R.FOLIAGE_ON_BARE.includes(kind) && R.groundBareAt(mapData, x, y)) return -1;
        const level = R.hasWater(mapData) ? R.waterLevelAt(mapData, x, y) : null;
        if (level !== null) {
            const depth = level - bareGround(mapData, x + 0.5, y + 0.5);
            if (depth > 0.02) return kind === "reeds" && depth < 0.9 ? depth : -1;
        }
        return 0;
    };

    /** Whether a piece or a rock stands on the ground in a cell (its foot under 1.5): nothing grows there. */
    R.pieceOnGround = function(mapData, x, y) {
        const stack = R.hasPieces(mapData) ? R.piecesAt(mapData, x, y) : null;
        if (stack) for (const piece of stack) if ((piece.z || 0) < 1.5) return true;
        return false;
    };

    /** The steepest ground anything grows on (rise per tile): a little short of where the room draws rock. */
    R.foliageSlopeLimit = function(mapData) {
        const room = R.roomFor ? R.roomFor(mapData) : null;
        const cliff = room && room.cliff !== "" && Number.isFinite(room.cliffSlope) ? room.cliffSlope - 4 : 60;
        return Math.tan(Math.max(5, cliff) * Math.PI / 180);
    };

    /** A small seeded generator: the same map grows the same field every time. */
    const rng = seed => {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    };
    const cellSeed = (seed, kind, x, y) => (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(seed + 7, 83492791) ^ (R.FOLIAGE_KINDS.indexOf(kind) * 2654435761)) >>> 0;
    const rgb = text => [parseInt(text.slice(1, 3), 16) / 255, parseInt(text.slice(3, 5), 16) / 255, parseInt(text.slice(5, 7), 16) / 255];

    /**
     * One layer's clumps in a square of cells, sorted by rank (drawing the first
     * n is an even thinning): base (x, ground, z, yaw), shape (height, width,
     * lean, rank) and tint (r, g, b, phase) per clump.
     */
    R.foliageClumps = function(mapData, layer, x0, y0, x1, y1) {
        const look = R.FOLIAGE_LOOKS[layer.kind];
        const W = mapData.width;
        const items = [];
        const width = { grass: 0.06, flowers: 0.03, fern: 0.24, reeds: 0.055, bulbs: 0.028, tendrils: 0.11, crystals: 0.2 }[layer.kind];
        const lean = { grass: 0.28, flowers: 0.08, fern: 0.85, reeds: 0.06, bulbs: 0.3, tendrils: 0.5, crystals: 0.35 }[layer.kind];
        const palette = layer.colours ? layer.colours.map(rgb) : null;
        const limit = R.foliageSlopeLimit(mapData);
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                const level = layer.density[y * W + x];
                if (!level) continue;
                const open = R.foliageCellOpen(mapData, x, y, layer.kind, limit);
                if (open < 0) continue;
                const random = rng(cellSeed(layer.seed, layer.kind, x, y));
                const want = level * look.perLevel;
                let count = Math.floor(want);
                if (random() < want - count) count++;
                for (let i = 0; i < count; i++) {
                    const wx = x + random(), wz = y + random();
                    const ground = bareGround(mapData, wx, wz);
                    const size = 1 + (random() - 0.5) * 2 * layer.vary;
                    const shade = 1 + (random() - 0.5) * 1.4 * layer.vary;
                    const tint = palette ? palette[Math.floor(random() * palette.length) % palette.length] : [shade, shade * (1 + (random() - 0.5) * 0.12), shade];
                    items.push({
                        rank: random(),
                        base: [wx, ground, wz, random() * Math.PI * 2],
                        shape: [layer.height * size * (open > 0 ? 1 + open : 1), width * (0.75 + random() * 0.5), lean * (0.3 + random() * 1.5), 0],
                        tint: [tint[0], tint[1], tint[2], random() * 6.2832]
                    });
                }
            }
        }
        items.sort((a, b) => a.rank - b.rank);
        const n = items.length;
        const base = new Float32Array(n * 4), shape = new Float32Array(n * 4), tint = new Float32Array(n * 4);
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < n; i++) {
            const item = items[i];
            base.set(item.base, i * 4);
            item.shape[3] = n > 1 ? i / (n - 1) : 0;
            shape.set(item.shape, i * 4);
            tint.set(item.tint, i * 4);
            lo = Math.min(lo, item.base[1]); hi = Math.max(hi, item.base[1] + item.shape[0]);
        }
        return { count: n, base, shape, tint, y0: Number.isFinite(lo) ? lo : 0, y1: Number.isFinite(hi) ? hi : 1 };
    };

    //-------------------------------------------------------------------------
    // Bushes

    /** The cells a bush stops a walker in: its middle cell and those its body covers, when it is big enough. */
    R.bushCells = function(bush) {
        if (bush.size < R.BUSH_BLOCK_SIZE) return [];
        const r = bush.size * 0.32, out = [];
        for (let y = Math.floor(bush.y - r); y <= Math.floor(bush.y + r); y++) {
            for (let x = Math.floor(bush.x - r); x <= Math.floor(bush.x + r); x++) {
                const dx = Math.max(x - bush.x, 0, bush.x - (x + 1)), dy = Math.max(y - bush.y, 0, bush.y - (y + 1));
                if (dx * dx + dy * dy <= r * r) out.push([x, y]);
            }
        }
        return out;
    };

    R.bushBlocking = function(mapData) {
        const foliage = this.foliageOf(mapData);
        if (!foliage || !foliage.bushes.length) return null;
        const memo = this._bushBlockMemo || (this._bushBlockMemo = new WeakMap());
        let cells = memo.get(foliage);
        if (cells) return cells;
        cells = new Set();
        for (const bush of foliage.bushes) for (const [x, y] of this.bushCells(bush)) cells.add(y * 65536 + x);
        memo.set(foliage, cells);
        return cells;
    };

    R.bushBlocksCell = function(mapData, x, y) {
        const cells = this.bushBlocking(mapData);
        // A bush left under a building (painted before it was laid) gives way to the building's own floor.
        return !!(cells && cells.has(y * 65536 + x)) && !R.pieceOnGround(mapData, x, y);
    };

    // A step into a big bush is blocked like a step into a rock.
    if (typeof R.terrainBlocks === "function" && !R.terrainBlocks.__rrFoliage) {
        const blocks = R.terrainBlocks;
        R.terrainBlocks = function(mapData, x, y, x2, y2, near) {
            if (mapData && mapData.reactor3d && mapData.reactor3d.foliage && R.bushBlocksCell(mapData, x2, y2)) return true;
            return blocks.apply(this, arguments);
        };
        R.terrainBlocks.__rrFoliage = true;
    }

    /**
     * A bush as leaf cards round a woody core: positions (tiles), leaf-atlas UVs,
     * colours, and per vertex the bush's foot and how much the vertex sways.
     * Seeded by the bush, so it looks the same each time the map loads.
     */
    R.bushMesh = function(mapData, bush, out) {
        const random = rng((Math.imul(bush.seed + 11, 2654435761) ^ Math.imul(Math.round(bush.x * 100), 40503) ^ Math.imul(Math.round(bush.y * 100), 69069)) >>> 0);
        const ground = R.groundHeightAt(mapData, bush.x, bush.y);
        const radius = bush.size / 2, tall = (bush.tall || 1) * 0.85;
        const height = bush.size * tall;
        // Vertex colours are linear, and the daylight brightens them (FOLIAGE_LIGHT).
        const lin = c => c.map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) * R.FOLIAGE_LIGHT * 1.6);
        const colour = lin(rgb(bush.colour)), bloom = bush.bloom ? lin(rgb(bush.bloom)) : null;
        const cards = Math.round(clamp(60 + bush.size * 60, 40, 320));
        const cy = ground + height * 0.52;
        const push = (px, py, pz, u, v, r, g, b, sway) => {
            out.position.push(px, py, pz);
            out.uv.push(u, v);
            out.color.push(r, g, b);
            out.foot.push(bush.x, ground, bush.y, sway);
        };
        const quad = (corners, uv0, uv1, shade, sway) => {
            const start = out.position.length / 3;
            const uvs = [[uv0[0], uv0[1]], [uv1[0], uv0[1]], [uv1[0], uv1[1]], [uv0[0], uv1[1]]];
            for (let k = 0; k < 4; k++) {
                const c = corners[k];
                push(c[0], c[1], c[2], uvs[k][0], uvs[k][1], shade[k][0], shade[k][1], shade[k][2], sway[k]);
            }
            out.index.push(start, start + 1, start + 2, start, start + 2, start + 3);
        };
        // The woody core: a few stems from the foot up into the leaves (the atlas's solid corner).
        const stems = 3 + Math.floor(random() * 3);
        for (let s = 0; s < stems; s++) {
            const a = random() * Math.PI * 2, reach = radius * (0.25 + random() * 0.35);
            const tx = bush.x + Math.cos(a) * reach, tz = bush.y + Math.sin(a) * reach, ty = ground + height * (0.45 + random() * 0.25);
            const w = 0.035 + bush.size * 0.012;
            const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
            const bark = [0.035, 0.02, 0.01];
            const dark = [bark[0] * 0.6, bark[1] * 0.6, bark[2] * 0.6];
            quad([[bush.x - px, ground, bush.y - pz], [bush.x + px, ground, bush.y + pz], [tx + px * 0.5, ty, tz + pz * 0.5], [tx - px * 0.5, ty, tz - pz * 0.5]],
                [0.97, 0.97], [0.99, 0.99], [dark, dark, bark, bark], [0, 0, 0.35, 0.35]);
        }
        // The body: bigger, darker cards of dense leaves well inside, so the bush has mass between its leaves.
        for (let c = 0, inner = Math.round(6 + bush.size * 6); c < inner; c++) {
            const u = random() * 2 - 1, theta = random() * Math.PI * 2, s = Math.sqrt(1 - u * u), shell = 0.2 + 0.35 * random();
            const nx = s * Math.cos(theta), ny = u, nz = s * Math.sin(theta);
            const px = bush.x + nx * radius * shell, pz = bush.y + nz * radius * shell, py = Math.max(ground + 0.15, cy + ny * height * 0.45 * shell);
            const half = radius * (0.45 + random() * 0.25);
            const a = random() * Math.PI, ex = [Math.cos(a), 0, Math.sin(a)], fx = [0, 1, 0];
            const tiltIn = random() * 0.6 - 0.3;
            const corner = (i, j) => [px + (ex[0] * i + tiltIn * j) * half, py + fx[1] * j * half * 0.8, pz + (ex[2] * i + tiltIn * j) * half];
            const dark = [colour[0] * 0.45, colour[1] * 0.45, colour[2] * 0.45];
            quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], [0.52, 0.52], [0.98, 0.98], [dark, dark, dark, dark], [0.2, 0.2, 0.5, 0.5]);
        }
        // Leaf cards: more near the skin than inside, turned every way, darker low and inside.
        for (let c = 0; c < cards; c++) {
            const u = random() * 2 - 1, theta = random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
            const shell = 0.55 + 0.45 * Math.sqrt(random());
            const nx = s * Math.cos(theta), ny = u, nz = s * Math.sin(theta);
            // A bush sits on the ground: flatten the bottom of its ball.
            const px = bush.x + nx * radius * shell, pz = bush.y + nz * radius * shell;
            const py = Math.max(ground + 0.08, cy + ny * height * 0.5 * shell);
            const card = (0.45 + random() * 0.35) * Math.sqrt(bush.size) * 0.6;
            // The card's two edges: one roughly round the bush, one tilted toward up.
            const ax = -nz, az = nx;
            const tilt = random() * Math.PI * 2;
            const ex = [Math.cos(tilt) * ax, Math.sin(tilt) * 0.9 + 0.1, Math.cos(tilt) * az];
            const fx = [nx * 0.6 + ex[1] * 0.0, Math.cos(tilt) * 0.9, nz * 0.6];
            const half = card / 2;
            const corner = (i, j) => [px + (ex[0] * i + fx[0] * j) * half, py + (ex[1] * i + fx[1] * j) * half, pz + (ex[2] * i + fx[2] * j) * half];
            const cell = Math.floor(random() * 3);
            const u0 = (cell % 2) * 0.5, v0 = Math.floor(cell / 2) * 0.5;
            const lift = (py - ground) / Math.max(0.01, height);
            const inside = 0.62 + 0.38 * shell;
            const vary = 0.85 + random() * 0.3;
            const blossom = bloom && random() < 0.22;
            const base = blossom ? bloom : colour;
            const light = (0.5 + 0.5 * clamp(lift, 0, 1)) * inside * vary;
            const shade = [base[0] * light, base[1] * light, base[2] * light];
            const tipShade = blossom ? shade : [Math.min(1, shade[0] * 1.15 + 0.03), Math.min(1, shade[1] * 1.12 + 0.03), shade[2] * 1.05];
            const sway = clamp(lift, 0, 1) * (0.7 + 0.3 * shell);
            quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], [u0 + 0.02, v0 + 0.02], [u0 + 0.48, v0 + 0.48], [shade, shade, tipShade, tipShade], [sway, sway, sway, sway]);
        }
        return out;
    };

    //-------------------------------------------------------------------------
    // Drawing (needs THREE; never reached in Node checks)

    /** A chunk is a draw per layer; those past the fade are not drawn at all (updateFoliageFrame). */
    R.FOLIAGE_CHUNK = 16;
    /** Where density starts to thin and where it is gone, in tiles from the eye, and how much is drawn at all. */
    R.FOLIAGE_LOD = { full: { near: 22, far: 64, scale: 1 }, weak: { near: 12, far: 38, scale: 0.5 } };
    /** The map's daylight brightens what it lights by about this much: authored colours are taken back by it, so a colour reads as itself in the sun. */
    R.FOLIAGE_LIGHT = 0.4;
    R.FOLIAGE_PUSHERS = 4;

    let uniforms = null;
    R.foliageUniforms = function() {
        if (uniforms) return uniforms;
        const V4 = typeof THREE !== "undefined" ? THREE.Vector4 : null, V3 = typeof THREE !== "undefined" ? THREE.Vector3 : null;
        uniforms = {
            rrFolTime: { value: 0 },
            rrFolWind: { value: V4 ? new V4(0.87, 0.5, 0.6, 1) : null },
            rrFolView: { value: V3 ? new V3(0, 0, 0) : null },
            rrFolLod: { value: V4 ? new V4(16, 58, 1, 0.06) : null },
            rrFolPush: { value: [] }
        };
        for (let i = 0; i < R.FOLIAGE_PUSHERS; i++) uniforms.rrFolPush.value.push(V4 ? new V4(0, 0, 1, 0) : null);
        return uniforms;
    };

    /** A kind's clump, built in the shader from these: (side or u, height share t or v, which blade) and the part (0 blade, 1 flower head, 2 cattail, 3 bulb). */
    R.foliageTemplate = function(kind) {
        const pos = [], part = [], index = [];
        const blade = (which, rows, tip) => {
            const start = pos.length / 3;
            for (const t of rows) { pos.push(-1, t, which, 1, t, which); part.push(0, 0); }
            if (tip) { pos.push(0, 1, which); part.push(0); }
            for (let r = 0; r + 1 < rows.length; r++) { const a = start + r * 2; index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
            if (tip) { const a = start + (rows.length - 1) * 2; index.push(a, a + 1, a + 2); }
        };
        if (kind === "grass") for (let b = 0; b < 3; b++) blade(b, [0, 0.35, 0.68], true);
        else if (kind === "fern") for (let b = 0; b < 6; b++) blade(b, [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.93], true);
        else if (kind === "tendrils") for (let b = 0; b < 3; b++) blade(b, [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.7, 0.8, 0.88, 0.95], true);
        // Three shards, each two crossed cards: wide at the shoulder, to a point.
        else if (kind === "crystals") for (let b = 0; b < 6; b++) blade(b, [0, 0.55], true);
        else if (kind === "bulbs") {
            blade(0, [0, 0.5, 1], false);
            // The globe: two crossed discs at the stalk's top.
            const rim = 12;
            for (let k = 0; k < 2; k++) {
                const start = pos.length / 3;
                pos.push(0, 0, k); part.push(3);
                for (let p = 0; p < rim; p++) { const a = p / rim * Math.PI * 2; pos.push(Math.cos(a), Math.sin(a), k); part.push(3); }
                for (let p = 0; p < rim; p++) index.push(start, start + 1 + p, start + 1 + (p + 1) % rim);
            }
        } else if (kind === "reeds") {
            blade(0, [0, 0.4, 0.75], true); blade(1, [0, 0.4, 0.75], true); blade(2, [0, 0.45, 0.8], true);
            // The cattail on the first stalk: two crossed cards.
            for (let k = 0; k < 3; k++) {
                const start = pos.length / 3;
                for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { pos.push(u, v, k); part.push(2); }
                index.push(start, start + 1, start + 2, start, start + 2, start + 3);
            }
        } else {
            blade(0, [0, 0.5, 1], false);
            // The head: a ring of petals round a middle.
            const start = pos.length / 3, rim = 20;
            pos.push(0, 0, 0); part.push(1);
            for (let p = 0; p < rim; p++) {
                // Five rounded petals.
                const a = p / rim * Math.PI * 2, r = 0.3 + 0.7 * Math.abs(Math.cos(a * 2.5));
                pos.push(Math.cos(a) * r, Math.sin(a) * r, 0); part.push(1);
            }
            for (let p = 0; p < rim; p++) index.push(start, start + 1 + p, start + 1 + (p + 1) % rim);
        }
        return { position: new Float32Array(pos), part: new Float32Array(part), index: new Uint16Array(index) };
    };

    const FOLIAGE_VERTEX = [
        "attribute vec4 aFolBase;",
        "attribute vec4 aFolShape;",
        "attribute vec4 aFolTint;",
        "attribute float aFolPart;",
        "uniform float rrFolTime;",
        "uniform vec4 rrFolWind;",
        "uniform vec3 rrFolView;",
        "uniform vec4 rrFolLod;",
        "uniform vec4 rrFolPush[" + R.FOLIAGE_PUSHERS + "];",
        "uniform vec3 rrFolRoot;",
        "uniform vec3 rrFolTip;",
        "uniform float rrFolGlow;",
        "varying float vRRGlow;",
        "varying vec3 vRRFoliage;",
        "varying float vRRSide;",
        "float rrFolHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
        "float rrFolNoise(vec2 p) {",
        "\tvec2 i = floor(p), f = fract(p);",
        "\tf = f * f * (3.0 - 2.0 * f);",
        "\treturn mix(mix(rrFolHash(i), rrFolHash(i + vec2(1.0, 0.0)), f.x), mix(rrFolHash(i + vec2(0.0, 1.0)), rrFolHash(i + vec2(1.0, 1.0)), f.x), f.y);",
        "}"
    ].join("\n");

    /** The clump's vertex: placed, bent by the wind and by whoever walks through, faded by distance. */
    const foliageBody = kind => [
        "vec3 rrBase = aFolBase.xyz;",
        "float rrDist = distance(rrBase, rrFolView);",
        "float rrKeep = rrFolLod.z * (1.0 - smoothstep(rrFolLod.x, rrFolLod.y, rrDist));",
        "float rrGrow = clamp((rrKeep - aFolShape.w) / rrFolLod.w, 0.0, 1.0);",
        // A crystal's shard is two crossed cards: the pair share everything but which way they face.
        kind === "crystals" ? "float rrWhich = floor(position.z * 0.5);\n\tfloat rrCross = mod(position.z, 2.0);" : "float rrWhich = position.z;",
        "float rrT = position.y, rrSide = position.x;",
        "float rrJit = rrFolHash(vec2(rrWhich + 1.0, aFolTint.w));",
        kind === "fern"
            ? "float rrYaw = aFolBase.w + rrWhich * 1.0472 + (rrJit - 0.5) * 0.5;"
            : "float rrYaw = aFolBase.w + rrWhich * 2.39996 + (rrJit - 0.5) * 0.8;",
        "vec2 rrDir = vec2(cos(rrYaw), sin(rrYaw));",
        "vec2 rrAcross = vec2(-rrDir.y, rrDir.x);",
        "float rrH = aFolShape.x * rrGrow * (" + (kind === "fern" ? "0.8 + 0.4 * rrJit" : kind === "reeds" ? "0.75 + 0.35 * rrJit" : "0.7 + 0.6 * rrJit") + ");",
        "vec3 rrP = rrBase;",
        // Blades of a clump stand a hair apart; a fern's fronds from one crown.
        kind === "fern" ? "" : "rrP.xz += rrDir * (0.05 + 0.07 * rrJit) * (rrWhich > 0.5 ? 1.0 : 0.3);",
        "float rrWidth = aFolShape.y * rrGrow;",
        "float rrLean = aFolShape.z * (0.75 + 0.5 * rrJit);",
        "float rrUp = rrT;",
        "if (aFolPart < 0.5) {",
        kind === "fern"
            // A frond: wide in the middle, arching out and over.
            ? "\tfloat rrLeaflet = mod(floor(rrT * 8.4 + 0.5), 2.0) > 0.5 ? 1.0 : 0.45;\n\tfloat rrW = rrWidth * pow(sin(3.14159 * min(rrT, 0.98)), 0.7) * (1.0 - rrT * 0.35) * rrLeaflet;\n\trrP.xz += rrAcross * rrSide * rrW * 0.5;\n\tfloat rrArc = rrT * 2.3;\n\trrP.xz += rrDir * (1.0 - cos(rrArc)) * 0.5 * rrLean * rrH;\n\trrUp = sin(rrArc) * 0.6;\n\trrP.y += rrUp * rrH;"
            : kind === "tendrils"
            // A tendril: it rises and curls over, tighter toward its tip, curling and uncurling in its own time.
            ? "\tfloat rrCurl = (2.6 + 2.4 * rrJit) * (0.72 + 0.28 * sin(rrFolTime * 1.1 + aFolTint.w + rrWhich * 2.1));\n\tvec2 rrArc = vec2(0.0);\n\tfloat rrSeg = rrT / 8.0;\n\tfor (int k = 0; k < 8; k++) { float rrS = (float(k) + 0.5) * rrSeg; float rrA = rrLean * 0.4 + rrCurl * rrS * rrS * rrS; rrArc += vec2(sin(rrA), cos(rrA)) * rrSeg; }\n\tfloat rrW = rrWidth * (1.0 - 0.78 * rrT);\n\trrP.xz += rrAcross * rrSide * rrW * 0.5 + rrDir * rrArc.x * rrH;\n\trrUp = max(rrArc.y, 0.0);\n\trrP.y += rrArc.y * rrH;"
            : kind === "crystals"
            // A shard: a card wide at its shoulder and pointed, leaning its own way; nothing bends it.
            ? "\tfloat rrW = rrWidth * (rrT < 0.55 ? 0.5 + 0.5 * rrT / 0.55 : (1.0 - rrT) / 0.45) * (0.55 + 0.9 * rrJit);\n\tvec2 rrCard = rrCross < 0.5 ? rrAcross : rrDir;\n\trrP.xz += rrDir * 0.17 * rrWhich;\n\trrP.xz += rrCard * rrSide * rrW * 0.5 + rrDir * rrLean * rrT * rrH * 0.6;\n\trrP.y += rrT * rrH;\n\trrUp = 0.0;"
            : "\tfloat rrW = rrWidth * pow(1.0 - rrT, 0.75);\n\trrP.xz += rrAcross * rrSide * rrW * 0.5;\n\trrP.xz += rrDir * rrLean * rrT * rrT * rrH;\n\trrP.y += rrT * rrH * (1.0 - 0.25 * rrLean * rrT);",
        "} else if (aFolPart < 1.5) {",
        // A flower's head: a disc of petals tipped toward the light at the stem's top.
        "\tfloat rrHead = rrH * 0.08 + 0.03;",
        "\trrP.xz += rrDir * rrLean * rrH;",
        "\trrP.y += rrH * (1.0 - 0.25 * rrLean);",
        "\tfloat rrTilt = 0.5 + 0.5 * rrJit;",
        "\trrP.xz += rrAcross * rrSide * rrHead + rrDir * rrT * rrHead * (1.0 - rrTilt * 0.5);",
        "\trrP.y += rrT * rrHead * rrTilt + 0.015 * (1.0 - length(vec2(rrSide, rrT)));",
        "\trrUp = 1.0;",
        "} else if (aFolPart > 2.5) {",
        // A bulb: a globe (two crossed discs) on the top of the clump's stalk, moving as the stalk's tip does.
        "\tfloat rrJ0 = rrFolHash(vec2(1.0, aFolTint.w));",
        "\tfloat rrY0 = aFolBase.w + (rrJ0 - 0.5) * 0.8;",
        "\trrDir = vec2(cos(rrY0), sin(rrY0));",
        "\trrAcross = vec2(-rrDir.y, rrDir.x);",
        "\trrH = aFolShape.x * rrGrow * (0.7 + 0.6 * rrJ0);",
        "\tfloat rrLean0 = aFolShape.z * (0.75 + 0.5 * rrJ0);",
        "\tfloat rrGlobe = (rrH * 0.055 + 0.035) * rrGrow;",
        "\trrP = rrBase;",
        "\trrP.xz += rrDir * ((0.05 + 0.07 * rrJ0) * 0.3 + rrLean0 * rrH) + (position.z < 0.5 ? rrDir : rrAcross) * rrSide * rrGlobe;",
        "\trrP.y += rrH * (1.0 - 0.25 * rrLean0) + (rrT * 1.2 + 0.85) * rrGlobe;",
        "\trrUp = 1.0;",
        "} else {",
        // A cattail: a brown card high on the first stalk, crossed with its twin.
        "\tvec2 rrFace = rrWhich < 0.5 ? rrDir : rrAcross;",
        "\tfloat rrFrom = 0.74, rrTo = 0.87;",
        "\tfloat rrAt = mix(rrFrom, rrTo, rrT);",
        "\tvec2 rrStalk = vec2(cos(aFolBase.w), sin(aFolBase.w));",
        "\tfloat rrHasTail = step(0.55, rrFolHash(vec2(aFolTint.w, 3.7)));",
        "\trrFace = rrWhich < 0.5 ? rrDir : rrWhich < 1.5 ? rrAcross : normalize(rrDir + rrAcross);",
        "\trrP.xz += rrStalk * rrLean * rrAt * rrAt * rrH + rrFace * rrSide * rrWidth * 0.55 * rrHasTail;",
        "\trrP.y += mix(0.74, rrAt, rrHasTail) * rrH;",
        "\trrUp = rrAt;",
        "}",
        // Wind: a rolling gust field over the map, the tip moving most.
        "vec2 rrWindDir = rrFolWind.xy;",
        "float rrGust = rrFolNoise(rrBase.xz * 0.07 - rrWindDir * rrFolTime * 1.6) * rrFolWind.w;",
        "float rrSway = (0.22 * sin(rrFolTime * 2.3 + aFolTint.w + rrBase.x * 0.37 + rrBase.z * 0.29) + 0.25 + rrGust * 0.9) * rrFolWind.z;",
        "float rrBend = rrUp * rrUp * rrH;",
        "rrP.xz += rrWindDir * rrSway * rrBend * " + (kind === "reeds" ? "0.18" : kind === "fern" ? "0.2" : kind === "tendrils" ? "0.14" : kind === "bulbs" ? "0.3" : "0.42") + ";",
        "rrP.xz += rrAcross * 0.06 * sin(rrFolTime * 3.1 + aFolTint.w * 2.0) * rrBend * rrFolWind.z;",
        "rrP.y -= abs(rrSway) * rrBend * 0.08;",
        // Pressed aside and down where someone walks.
        "for (int i = 0; i < " + R.FOLIAGE_PUSHERS + "; i++) {",
        "\tvec4 rrPush = rrFolPush[i];",
        "\tif (rrPush.w <= 0.0) continue;",
        "\tvec2 rrAway = rrP.xz - rrPush.xy;",
        "\tfloat rrNear = length(rrAway);",
        "\tfloat rrPress = (1.0 - smoothstep(rrPush.z * 0.35, rrPush.z, rrNear)) * rrPush.w;",
        "\trrP.xz += rrAway / max(rrNear, 0.05) * rrPress * rrBend * 0.55;",
        "\trrP.y -= rrPress * rrBend * 0.4;",
        "}",
        "vec3 transformed = rrP;",
        // Colour: root to tip, each clump its own shade, shadowed toward the ground.
        "float rrShadeT = aFolPart > 0.5 ? 1.0 : rrT;",
        "vec3 rrCol = mix(rrFolRoot, rrFolTip, rrShadeT);",
        "if ((aFolPart > 0.5 && aFolPart < 1.5) || aFolPart > 2.5) rrCol = aFolTint.rgb;",
        "else if (aFolPart > 1.5) rrCol = vec3(0.09, 0.05, 0.025);",
        kind === "bulbs" ? "else {" : kind === "tendrils" ? "else {\n\t\trrCol *= aFolTint.rgb;" : kind === "crystals"
            // Each face of a shard its own brightness.
            ? "else {\n\t\trrCol *= aFolTint.rgb * (rrCross < 0.5 ? 1.0 : 0.6) * (1.25 + 0.5 * rrShadeT);"
            : "else {\n\t\trrCol *= aFolTint.rgb;",
        // Now and then an Earth blade gone dry, straw at its tip.
        kind === "bulbs" || kind === "tendrils" || kind === "crystals" ? "}"
            : "\tfloat rrDry = step(0.86, rrFolHash(vec2(rrWhich + 7.0, aFolTint.w * 3.1)));\n\t\trrCol = mix(rrCol, vec3(0.42, 0.36, 0.17) * mix(0.55, 1.0, rrShadeT), rrDry * 0.75);\n\t}",
        // How much of its own colour shows whatever the light: a globe wholly, a flower's head, a blade toward its tip.
        "vRRGlow = rrFolGlow * (aFolPart > 2.5 ? 1.0 : aFolPart > 0.5 ? (aFolPart < 1.5 ? 0.7 : 0.0) : rrShadeT * rrShadeT);",

        "vRRFoliage = rrCol * (0.32 + 0.68 * rrShadeT) * " + R.FOLIAGE_LIGHT.toFixed(3) + ";",
        // A blade is darker toward its edges, a globe toward its rim.
        "vRRSide = aFolPart < 0.5 ? rrSide : aFolPart > 2.5 ? min(1.0, length(vec2(rrSide, rrT)) * 1.6) : 0.0;"
    ].join("\n\t");

    const linear = text => {
        const c = rgb(text);
        // Colours are authored in sRGB; the lit shader works in linear.
        return c.map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    };

    R.foliageMaterial = function(layer) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        material.__reactorFoliage = layer.kind;
        const own = {
            rrFolRoot: { value: new THREE.Color().setRGB(...linear(layer.colour)) },
            rrFolTip: { value: new THREE.Color().setRGB(...linear(layer.tip)) },
            rrFolGlow: { value: layer.glow || 0 }
        };
        // A glowing layer shows its own colour over the light: drawn lit in place, not with the light laid on afterwards.
        const glow = (layer.glow || 0) > 0;
        if (glow) material.__reactorGlowTip = true;
        material.userData.rrFoliage = own;
        material.onBeforeCompile = function(shader) {
            const shared = R.foliageUniforms();
            for (const key of Object.keys(shared)) shader.uniforms[key] = shared[key];
            shader.uniforms.rrFolRoot = own.rrFolRoot;
            shader.uniforms.rrFolTip = own.rrFolTip;
            shader.uniforms.rrFolGlow = own.rrFolGlow;
            shader.vertexShader = FOLIAGE_VERTEX + "\n" + shader.vertexShader.replace("#include <begin_vertex>", foliageBody(layer.kind));
            // A blade is lighter along its middle than at its edges.
            shader.fragmentShader = "varying vec3 vRRFoliage;\nvarying float vRRSide;\nvarying float vRRGlow;\n" + shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n\tdiffuseColor.rgb *= vRRFoliage * (0.8 + 0.2 * (1.0 - abs(vRRSide)));" + (glow ? "\n\tvec3 rrFolSelf = diffuseColor.rgb;" : ""));
            // The glow: the colour before the light, kept where the light would leave it darker. No pass of its own.
            if (glow) shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight = mix(outgoingLight, max(outgoingLight, rrFolSelf * " + R.FOLIAGE_GLOW.toFixed(2) + "), vRRGlow);\n\t#include <opaque_fragment>");
        };
        material.customProgramCacheKey = function() { return "reactor3d-foliage-" + layer.kind + (glow ? "-glow" : ""); };
        R.litMaterial(material);
        return material;
    };

    let leafAtlas = null;
    /** Leaf clusters on a transparent sheet, three cells of it, and a solid corner for the stems. */
    R.leafAtlas = function() {
        if (leafAtlas !== null) return leafAtlas;
        if (typeof document === "undefined" || typeof THREE === "undefined") return (leafAtlas = null);
        const size = 256, canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d");
        if (!g) return null;
        const random = rng(4242);
        for (let cell = 0; cell < 4; cell++) {
            const ox = (cell % 2) * size / 2, oy = Math.floor(cell / 2) * size / 2;
            // Three cells of loose sprays, the fourth a dense mass for a bush's body.
            const leaves = cell === 3 ? 46 : 16 + cell * 3;
            for (let l = 0; l < leaves; l++) {
                const spread = cell === 3 ? 0.34 : 0.3;
                const cx = ox + size * (0.25 + (random() - 0.5) * spread * 1.4), cy = oy + size * (0.25 + (random() - 0.5) * spread * 1.4);
                const len = size * (0.06 + random() * 0.05), wid = len * (0.45 + random() * 0.2), a = random() * Math.PI * 2;
                g.save();
                g.translate(cx, cy); g.rotate(a);
                const tone = 200 + Math.floor(random() * 55);
                g.fillStyle = `rgb(${tone},${tone},${tone})`;
                g.beginPath();
                g.moveTo(-len, 0);
                g.quadraticCurveTo(-len * 0.2, -wid, len, 0);
                g.quadraticCurveTo(-len * 0.2, wid, -len, 0);
                g.fill();
                g.strokeStyle = `rgba(120,120,120,0.55)`;
                g.lineWidth = 1;
                g.beginPath(); g.moveTo(-len * 0.9, 0); g.lineTo(len * 0.85, 0); g.stroke();
                g.restore();
            }
        }
        g.fillStyle = "#ffffff";
        g.fillRect(size - 12, size - 12, 12, 12);
        const texture = new THREE.CanvasTexture(canvas);
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 2;
        leafAtlas = texture;
        return texture;
    };

    const BUSH_VERTEX = [
        "attribute vec4 aBushFoot;",
        "uniform float rrFolTime;",
        "uniform vec4 rrFolWind;",
        "float rrBushHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }"
    ].join("\n");
    const BUSH_BODY = [
        "vec3 transformed = vec3(position);",
        "float rrPhase = rrBushHash(aBushFoot.xz) * 6.2832;",
        "float rrSwayB = (0.5 + 0.5 * sin(rrFolTime * 1.3 + rrPhase)) * rrFolWind.z * aBushFoot.w;",
        "transformed.xz += rrFolWind.xy * rrSwayB * 0.07;",
        "transformed.xz += vec2(sin(rrFolTime * 2.7 + position.y * 3.0 + rrPhase), cos(rrFolTime * 2.3 + position.x * 3.0)) * 0.012 * aBushFoot.w * rrFolWind.z;"
    ].join("\n\t");

    R.bushMaterial = function() {
        const atlas = R.leafAtlas();
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, map: atlas || null, alphaTest: atlas ? 0.5 : 0 });
        material.__reactorFoliage = "bush";
        material.onBeforeCompile = function(shader) {
            const shared = R.foliageUniforms();
            shader.uniforms.rrFolTime = shared.rrFolTime;
            shader.uniforms.rrFolWind = shared.rrFolWind;
            shader.vertexShader = BUSH_VERTEX + "\n" + shader.vertexShader.replace("#include <begin_vertex>", BUSH_BODY);
        };
        material.customProgramCacheKey = function() { return "reactor3d-bush"; };
        R.litMaterial(material);
        return material;
    };

    /** The eye in the map's tiles, for the distance fade; one vector reused. */
    const eye = { world: null, inverse: null, frame: -1 };
    const lodNow = { near: 0, far: 0, scale: 0 };
    /** The tier's distances and share of clumps, less what the quality level takes (`Reactor3D.Quality`); one record reused. */
    const lodOf = () => {
        const lod = R.isWeakGpu && R.isWeakGpu() ? R.FOLIAGE_LOD.weak : R.FOLIAGE_LOD.full, quality = R.Quality;
        if (!quality || (quality.foliageReach() === 1 && quality.foliageShare() === 1)) return lod;
        lodNow.near = lod.near * quality.foliageReach(); lodNow.far = lod.far * quality.foliageReach(); lodNow.scale = lod.scale * quality.foliageShare();
        return lodNow;
    };

    /** Before a chunk draws: its share of clumps for the eye's distance, the eye and the clock set once a frame. */
    function beforeChunk(renderer, scene, camera) {
        const u = R.foliageUniforms(), group = this.parent;
        if (!camera || !group) return;
        const frame = renderer && renderer.info && renderer.info.render ? renderer.info.render.frame : 0;
        // (By the group too: the plants of a neighboring map stand in a group of their own beside this map's,
        // and the eye is somewhere else in that map's tiles.)
        if (eye.frame !== frame || eye.camera !== camera || eye.group !== group) {
            eye.frame = frame; eye.camera = camera; eye.group = group;
            if (!eye.world) { eye.world = new THREE.Vector3(); eye.inverse = new THREE.Matrix4(); }
            eye.world.setFromMatrixPosition(camera.matrixWorld);
            eye.inverse.copy(group.matrixWorld).invert();
            u.rrFolView.value.copy(eye.world).applyMatrix4(eye.inverse);
            const lod = lodOf();
            u.rrFolLod.value.set(lod.near, lod.far, lod.scale, 0.06);
            u.rrFolTime.value = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
        }
        const info = this.userData.rrFoliageChunk;
        if (!info) return;
        const view = u.rrFolView.value, lod = u.rrFolLod.value;
        const dx = Math.max(info.x0 - view.x, 0, view.x - info.x1), dz = Math.max(info.z0 - view.z, 0, view.z - info.z1);
        const dy = Math.max(info.y0 - view.y, 0, view.y - info.y1);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const t = Math.max(0, Math.min(1, (d - lod.x) / Math.max(0.001, lod.y - lod.x)));
        const keep = lod.z * (1 - t * t * (3 - 2 * t));
        this.geometry.instanceCount = Math.min(info.count, Math.ceil(info.count * Math.min(1, keep + lod.w)));
    }

    const templates = {};
    const templateFor = kind => {
        if (templates[kind]) return templates[kind];
        const data = R.foliageTemplate(kind);
        return (templates[kind] = {
            position: new THREE.BufferAttribute(data.position, 3),
            part: new THREE.BufferAttribute(data.part, 1),
            index: new THREE.BufferAttribute(data.index, 1)
        });
    };

    /** Every scene's foliage group, so the reflection passes can leave the blades out. */
    const liveGroups = new Set();

    R.MapScene.prototype.foliageGroup = function() {
        if (!this._foliageGroup) {
            this._foliageGroup = new THREE.Group();
            this._foliageGroup.name = "foliage";
            this.piecesGroup().add(this._foliageGroup);
            liveGroups.add(this._foliageGroup);
        }
        return this._foliageGroup;
    };

    /**
     * The reflection capture and the water's mirrors draw the scene again; the
     * blades stay out of those (a dense field there cost the weak tier ten
     * milliseconds a frame for a few pixels of reflected grass). Bushes stay in.
     */
    const hiddenBlades = [];
    const withoutBlades = fn => function() {
        const from = hiddenBlades.length;
        for (const group of liveGroups) {
            if (!group.parent) { liveGroups.delete(group); continue; }
            for (const mesh of group.children) if (mesh.visible && mesh.userData.rrFoliageChunk) { mesh.visible = false; hiddenBlades.push(mesh); }
        }
        try { return fn.apply(this, arguments); } finally { for (let i = from; i < hiddenBlades.length; i++) hiddenBlades[i].visible = true; hiddenBlades.length = from; }
    };
    for (const [owner, name] of [[R.Reflections, "update"], [R.Mirrors, "update"]]) {
        if (owner && typeof owner[name] === "function" && !owner[name].__rrFoliage) {
            owner[name] = withoutBlades(owner[name]);
            owner[name].__rrFoliage = true;
        }
    }

    /** One chunk of one layer, as an instanced mesh; null when nothing grows there. */
    R.MapScene.prototype.foliageChunkMesh = function(mapData, layer, index, cx, cy) {
        const size = R.FOLIAGE_CHUNK;
        const x0 = cx * size, y0 = cy * size, x1 = Math.min(mapData.width, x0 + size), y1 = Math.min(mapData.height, y0 + size);
        const clumps = R.foliageClumps(mapData, layer, x0, y0, x1, y1);
        if (!clumps.count) return null;
        const template = templateFor(layer.kind);
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute("position", template.position);
        geometry.setAttribute("aFolPart", template.part);
        geometry.setIndex(template.index);
        geometry.setAttribute("aFolBase", new THREE.InstancedBufferAttribute(clumps.base, 4));
        geometry.setAttribute("aFolShape", new THREE.InstancedBufferAttribute(clumps.shape, 4));
        geometry.setAttribute("aFolTint", new THREE.InstancedBufferAttribute(clumps.tint, 4));
        geometry.instanceCount = clumps.count;
        const reach = 1.5;
        const box = new THREE.Box3(new THREE.Vector3(x0 - reach, clumps.y0 - 0.5, y0 - reach), new THREE.Vector3(x1 + reach, clumps.y1 + 0.5, y1 + reach));
        geometry.boundingBox = box;
        geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        const materials = this._foliageMaterials || (this._foliageMaterials = []);
        let material = layer.__material;
        if (!material) {
            material = layer.__material = R.foliageMaterial(layer);
            materials.push(material);
            this._materials.push(material);
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = "foliage:" + layer.kind;
        mesh.userData.rrFoliageChunk = { count: clumps.count, x0, z0: y0, x1, z1: y1, y0: clumps.y0, y1: clumps.y1, layer: index, key: cx * 65536 + cy };
        mesh.onBeforeRender = beforeChunk;
        // Before the ground and the pieces: the ground a field of blades hides is then never shaded
        // (on the weak tier a dense meadow cost half as much this way).
        mesh.renderOrder = -1;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        return mesh;
    };

    /** The bushes standing in one chunk, merged; null when there are none. */
    R.MapScene.prototype.bushChunkMesh = function(mapData, bushes, cx, cy) {
        const size = R.FOLIAGE_CHUNK;
        // Not a bush whose root a piece stands on: one painted before a building was laid there would grow through it.
        const mine = bushes.filter(b => Math.floor(b.x / size) === cx && Math.floor(b.y / size) === cy && !R.pieceOnGround(mapData, Math.floor(b.x), Math.floor(b.y)));
        if (!mine.length) return null;
        const out = { position: [], uv: [], color: [], foot: [], index: [] };
        for (const bush of mine) R.bushMesh(mapData, bush, out);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.position, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(out.uv, 2));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(out.color, 3));
        geometry.setAttribute("aBushFoot", new THREE.Float32BufferAttribute(out.foot, 4));
        geometry.setIndex(out.index.length > 65535 ? new THREE.Uint32BufferAttribute(out.index, 1) : new THREE.Uint16BufferAttribute(out.index, 1));
        geometry.computeBoundingSphere();
        if (geometry.boundingSphere) geometry.boundingSphere.radius += 0.3;
        if (!this._bushMaterial) { this._bushMaterial = R.bushMaterial(); this._materials.push(this._bushMaterial); }
        const mesh = new THREE.Mesh(geometry, this._bushMaterial);
        mesh.name = "foliage:bushes";
        mesh.userData.rrBushChunk = cx * 65536 + cy;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        return mesh;
    };

    /** Chunk keys a region of cells ({x0, y0, x1, y1}, inclusive) touches; null for all. */
    const chunkKeys = (mapData, region) => {
        if (!region) return null;
        const size = R.FOLIAGE_CHUNK, keys = new Set();
        const x0 = Math.max(0, Math.floor((region.x0 - 2) / size)), x1 = Math.min(Math.ceil(mapData.width / size) - 1, Math.floor((region.x1 + 2) / size));
        const y0 = Math.max(0, Math.floor((region.y0 - 2) / size)), y1 = Math.min(Math.ceil(mapData.height / size) - 1, Math.floor((region.y1 + 2) / size));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) keys.add(x * 65536 + y);
        return keys;
    };

    /**
     * Lay the map's foliage: every chunk at once in the editor (it draws only
     * on a change), and in the game those near the player at once and the rest
     * a few a frame (`updateFoliage` drains the queue). `keys` limits the work
     * to some chunks (an edit), their old meshes taken away first.
     */
    R.MapScene.prototype.addFoliage = function(mapData, keys) {
        const foliage = R.foliageOf(mapData);
        this._foliageMap = mapData;
        if (!foliage) { this.removeFoliage(keys); return; }
        const u = R.foliageUniforms();
        const wind = foliage.wind, a = wind.dir * Math.PI / 180;
        if (u.rrFolWind.value) u.rrFolWind.value.set(Math.cos(a), Math.sin(a), wind.strength, wind.gust);
        this.removeFoliage(keys);
        const size = R.FOLIAGE_CHUNK, cw = Math.ceil(mapData.width / size), ch = Math.ceil(mapData.height / size);
        const jobs = [];
        for (let cy = 0; cy < ch; cy++) {
            for (let cx = 0; cx < cw; cx++) {
                if (keys && !keys.has(cx * 65536 + cy)) continue;
                jobs.push([cx, cy]);
            }
        }
        // Old layer materials are dropped when the layer list changed (another colour, another kind).
        const live = this._foliageLayers || [];
        if (!keys || live.length !== foliage.layers.length || live.some((layer, i) => layer.kind !== foliage.layers[i].kind || layer.colour !== foliage.layers[i].colour || layer.tip !== foliage.layers[i].tip)) {
            this.disposeFoliageMaterials();
            if (keys) { this.removeFoliage(null); return this.addFoliage(mapData, null); }
        } else {
            foliage.layers.forEach((layer, i) => { layer.__material = live[i].__material; });
        }
        this._foliageLayers = foliage.layers;
        const player = typeof $gamePlayer !== "undefined" && $gamePlayer && this._rockWorkers !== false ? $gamePlayer : null;
        if (player) {
            const px = player.x / size, py = player.y / size;
            jobs.sort((a, b) => Math.hypot(a[0] + 0.5 - px, a[1] + 0.5 - py) - Math.hypot(b[0] + 0.5 - px, b[1] + 0.5 - py));
        }
        const queue = [];
        for (const job of jobs) {
            const near = !player || Math.hypot((job[0] + 0.5) * size - player.x, (job[1] + 0.5) * size - player.y) < 40;
            if (near) this.layFoliageChunk(mapData, foliage, job[0], job[1]);
            else queue.push(job);
        }
        this._foliageQueue = queue;
    };

    R.MapScene.prototype.layFoliageChunk = function(mapData, foliage, cx, cy) {
        const group = this.foliageGroup();
        foliage.layers.forEach((layer, i) => {
            const mesh = this.foliageChunkMesh(mapData, layer, i, cx, cy);
            if (mesh) group.add(mesh);
        });
        const bushes = this.bushChunkMesh(mapData, foliage.bushes, cx, cy);
        if (bushes) {
            group.add(bushes);
            if (R.Shadows && R.Shadows.markCaster) { R.Shadows.markCaster(bushes, false); if (R.Shadows.invalidate) R.Shadows.invalidate(); }
        }
    };

    /** Take away foliage meshes: those of `keys` chunks, or all. */
    R.MapScene.prototype.removeFoliage = function(keys) {
        const group = this._foliageGroup;
        if (!group) return;
        if (!keys) this._foliageQueue = [];
        else if (this._foliageQueue) this._foliageQueue = this._foliageQueue.filter(job => !keys.has(job[0] * 65536 + job[1]));
        for (let i = group.children.length - 1; i >= 0; i--) {
            const mesh = group.children[i];
            const key = mesh.userData.rrFoliageChunk ? mesh.userData.rrFoliageChunk.key : mesh.userData.rrBushChunk;
            if (keys && !keys.has(key)) continue;
            group.remove(mesh);
            // A bush chunk leaves the shadow rows (the caster list drops parentless roots itself).
            if (mesh.userData.rrBushChunk !== undefined && R.Shadows && R.Shadows.invalidate) R.Shadows.invalidate();
            mesh.geometry.dispose();
        }
    };

    R.MapScene.prototype.disposeFoliageMaterials = function() {
        for (const material of this._foliageMaterials || []) {
            const at = this._materials ? this._materials.indexOf(material) : -1;
            if (at >= 0) this._materials.splice(at, 1);
            material.dispose();
        }
        this._foliageMaterials = [];
        for (const layer of this._foliageLayers || []) layer.__material = null;
    };

    /** Lay foliage again after an edit: the chunks a region of cells touches, or all of it. */
    R.MapScene.prototype.updateFoliage = function(mapData, region) {
        if (typeof THREE === "undefined" || !this._scene) return;
        const keys = chunkKeys(mapData, region || null);
        this.addFoliage(mapData, keys);
    };

    /** A few queued chunks a frame (game), within a small time budget; whoever walks through bends the grass. */
    R.MapScene.prototype.updateFoliageFrame = function(characters) {
        const queue = this._foliageQueue;
        if (queue && queue.length && this._foliageMap) {
            const foliage = R.foliageOf(this._foliageMap);
            const start = typeof performance !== "undefined" ? performance.now() : 0;
            while (queue.length && foliage) {
                const job = queue.shift();
                this.layFoliageChunk(this._foliageMap, foliage, job[0], job[1]);
                if (typeof performance === "undefined" || performance.now() - start > 2.5) break;
            }
        }
        // Chunks wholly past the fade are not drawn at all (an empty draw still costs a draw).
        const group = this._foliageGroup, viewport = R._viewport, camera = viewport && viewport.camera ? viewport.camera() : null;
        if (group && camera && camera.matrixWorld) {
            if (!eye.world) { eye.world = new THREE.Vector3(); eye.inverse = new THREE.Matrix4(); }
            const at = eye.cull || (eye.cull = new THREE.Vector3());
            at.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(eye.inverse.copy(group.matrixWorld).invert());
            const far = lodOf().far + 2;
            for (const mesh of group.children) {
                const info = mesh.userData.rrFoliageChunk;
                if (!info) continue;
                const dx = Math.max(info.x0 - at.x, 0, at.x - info.x1), dz = Math.max(info.z0 - at.z, 0, at.z - info.z1), dy = Math.max(info.y0 - at.y, 0, at.y - info.y1);
                mesh.visible = dx * dx + dy * dy + dz * dz < far * far;
            }
        }
        const pushers = R.foliageUniforms().rrFolPush.value;
        let n = 0;
        if (characters) {
            for (let i = 0; i < characters.length && n < pushers.length; i++) {
                const c = characters[i];
                if (!c || (c.isTransparent && c.isTransparent())) continue;
                if (c !== characters[0] && !(c.isMoving && c.isMoving())) continue;
                const v = pushers[n++];
                if (v) v.set(c._realX + 0.5, c._realY + 0.5, 1.0, 1);
            }
        }
        for (; n < pushers.length; n++) if (pushers[n]) pushers[n].w = 0;
    };

    //-------------------------------------------------------------------------
    // Hooks into the scene's own steps

    const wrap = (name, after) => {
        const original = R.MapScene.prototype[name];
        if (typeof original !== "function" || original.__rrFoliage) return;
        const wrapped = function() {
            const result = original.apply(this, arguments);
            try { after.apply(this, arguments); } catch (error) { if (typeof console !== "undefined") console.warn("Foliage:", error); }
            return result;
        };
        wrapped.__rrFoliage = true;
        R.MapScene.prototype[name] = wrapped;
    };
    // Laid with the map, after the water (whose cells it keeps out of); again when the water is laid again.
    wrap("addWater", function(mapData) { this.addFoliage(mapData, null); });
    // The ground moved under it, or pieces came or went: the chunks there grow again.
    wrap("updateTerrain", function(mapData, region) {
        this.updateFoliage(mapData, region ? { x0: region.x0, y0: region.z0, x1: region.x1, y1: region.z1 } : null);
    });
    wrap("updatePieces", function(mapData, load, region) { this.updateFoliage(mapData, region || null); });
    // Every frame of the game: queued chunks, and who is walking through.
    wrap("updateRipples", function(frame, characters) { this.updateFoliageFrame(characters); });
    const clear = R.MapScene.prototype.clear;
    if (typeof clear === "function" && !clear.__rrFoliage) {
        R.MapScene.prototype.clear = function() {
            R.MapScene.prototype.removeFoliage.call(this, null);
            R.MapScene.prototype.disposeFoliageMaterials.call(this);
            if (this._foliageGroup && this._foliageGroup.parent) this._foliageGroup.parent.remove(this._foliageGroup);
            liveGroups.delete(this._foliageGroup);
            this._foliageGroup = null;
            this._foliageLayers = null;
            this._bushMaterial = null;
            return clear.apply(this, arguments);
        };
        R.MapScene.prototype.clear.__rrFoliage = true;
    }

    R.Foliage = { file: "reactor_3d_foliage.js" };
    if (typeof module !== "undefined" && module.exports) module.exports = R;
})(typeof globalThis !== "undefined" ? globalThis : this);
