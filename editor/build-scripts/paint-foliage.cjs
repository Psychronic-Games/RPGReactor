#!/usr/bin/env node
/**
 * Grow foliage over a project's map by rule, as the Build bar's Foliage
 * brushes do by hand.
 *
 *   node editor/build-scripts/paint-foliage.cjs <project> <mapId> <spec.json> [--check]
 *
 * `spec.json`:
 *
 *   { "clear": ["grass"],                       // kinds (or true: all, bushes too) taken away first
 *     "wind": { "dir": 30, "strength": 0.6 },
 *     "fill": [ { "kind": "grass", "level": 6,
 *                 "where": { "rect": [x0, y0, x1, y1] } | { "polygon": [[x, y], ...] } | { "all": true },
 *                 "rules": { "maxSlope": 0.5, "awayFromPieces": 2, "nearPieces": 4, "awayFromWater": 1, "nearWater": 3,
 *                            "noise": 0.5, "noiseScale": 9, "minLevel": 1 },
 *                 "height": 0.8, "colour": "#4a7a30", "tip": "#b9c862", "glow": 0, "width": 1, "lean": 1, "seed": 1 } ],
 *     "bushes": [ { "x": 41.5, "y": 30.2, "size": 2 },
 *                 { "where": { "rect": [...] }, "count": 30, "size": [1.2, 2.4], "spacing": 3,
 *                   "rules": { "awayFromPieces": 2 }, "colour": "#3f6b2b", "bloom": "#f2c4d8", "seed": 4 } ] }
 *
 * A cell is filled only where the kind can grow at all (no piece or rock
 * standing there, no water but for reeds in the shallows, no cliff), then
 * where the rules allow: `maxSlope` in rise per tile, `awayFromPieces` /
 * `nearPieces` / `awayFromWater` / `nearWater` in cells, `noise` (0-1) breaking the level
 * into natural patches at `noiseScale` cells. Rects are cells inclusive.
 * `--check` reports without writing.
 */
const fs = require('node:fs');
const path = require('node:path');

/** A seeded generator, the same as the runtime's scatter uses. */
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

/** Smooth value noise in [0, 1] over cells, seeded. */
const noiseField = (seed, scale) => {
    const hash = (x, y) => { const r = rng(Math.imul(x + 1013, 73856093) ^ Math.imul(y + 2029, 19349663) ^ seed); return r(); };
    return (x, y) => {
        const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    };
};

const inside = (where, x, y) => {
    if (!where || where.all) return true;
    const cx = x + 0.5, cy = y + 0.5;
    if (Array.isArray(where.rect)) {
        const [x0, y0, x1, y1] = where.rect.map(Number);
        return x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && y >= Math.min(y0, y1) && y <= Math.max(y0, y1);
    }
    if (Array.isArray(where.polygon) && where.polygon.length >= 3) {
        let hit = false;
        const p = where.polygon;
        for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
            const [xi, yi] = p[i], [xj, yj] = p[j];
            if ((yi > cy) !== (yj > cy) && cx < (xj - xi) * (cy - yi) / (yj - yi) + xi) hit = !hit;
        }
        return hit;
    }
    return false;
};

/** Distance fields (in cells, capped) to the nearest cell with pieces standing, and to water. */
const distances = (map, R, cap) => {
    const W = map.width, H = map.height;
    const pieces = new Float32Array(W * H).fill(cap), water = new Float32Array(W * H).fill(cap);
    const seedsP = [], seedsW = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const stack = R.hasPieces(map) ? R.piecesAt(map, x, y) : null;
        if (stack && stack.some(p => (p.z || 0) < 1.5)) { pieces[y * W + x] = 0; seedsP.push(y * W + x); }
        if (R.hasWater(map) && R.waterLevelAt(map, x, y) !== null) { water[y * W + x] = 0; seedsW.push(y * W + x); }
    }
    // A breadth-first spread, eight ways; close enough to round for rules counted in cells.
    const spread = (field, seeds) => {
        let frontier = seeds;
        for (let d = 1; d < cap && frontier.length; d++) {
            const next = [];
            for (const i of frontier) {
                const x = i % W, y = (i / W) | 0;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                    const j = ny * W + nx;
                    if (field[j] > d) { field[j] = d; next.push(j); }
                }
            }
            frontier = next;
        }
    };
    spread(pieces, seedsP); spread(water, seedsW);
    return { pieces, water };
};

const slopeAt = (map, R, x, y) => {
    if (!R.terrainOf(map)) return 0;
    const a = R.terrainHeightAt(map, x, y), b = R.terrainHeightAt(map, x + 1, y), c = R.terrainHeightAt(map, x, y + 1), d = R.terrainHeightAt(map, x + 1, y + 1);
    return Math.max(Math.abs(b - a + d - c) / 2, Math.abs(c - a + d - b) / 2);
};

/**
 * Apply a spec to a map in memory. `R` is the runtime (Reactor3D), `F` the
 * editor's RRMapFoliage. Returns { report: [lines] }.
 */
function paint(map, spec, { Reactor3D: R, F }) {
    const report = [];
    const W = map.width, H = map.height;
    if (spec.clear) {
        const data = F.foliage(map);
        if (spec.clear === true) F.restore(map, null);
        else if (Array.isArray(spec.clear)) {
            data.layers = (data.layers || []).filter(layer => !spec.clear.includes(layer.kind));
            if (spec.clear.includes('bush')) data.bushes = [];
            F.restore(map, data);
            if (!(data.layers && data.layers.length) && !(data.bushes && data.bushes.length)) F.restore(map, null);
        }
        report.push(`cleared ${spec.clear === true ? 'all foliage' : spec.clear.join(', ')}`);
    }
    let fields = null;
    const field = () => fields || (fields = distances(map, R, 24));
    const passes = (rules, kind, x, y, limit) => {
        if (R.foliageCellOpen(map, x, y, kind, limit) < 0) return false;
        if (!rules) return true;
        if (Number.isFinite(rules.maxSlope) && slopeAt(map, R, x, y) > rules.maxSlope) return false;
        const f = (rules.awayFromPieces || rules.nearPieces || rules.awayFromWater || rules.nearWater) ? field() : null;
        if (rules.awayFromPieces && f.pieces[y * W + x] <= rules.awayFromPieces) return false;
        if (rules.nearPieces && f.pieces[y * W + x] > rules.nearPieces) return false;
        if (rules.awayFromWater && f.water[y * W + x] <= rules.awayFromWater) return false;
        if (rules.nearWater && f.water[y * W + x] > rules.nearWater) return false;
        return true;
    };
    const limit = R.foliageSlopeLimit(map);
    for (const job of Array.isArray(spec.fill) ? spec.fill : []) {
        if (!F.KINDS.includes(job.kind)) { report.push(`skipped a fill of "${job.kind}": not one of ${F.KINDS.join(', ')}`); continue; }
        const level = Math.max(1, Math.min(9, Math.round(Number(job.level) || 6)));
        const rules = job.rules || {};
        const noise = Number(rules.noise) > 0 ? noiseField((Number(job.seed) || 1) * 7919, Number(rules.noiseScale) || 9) : null;
        const minLevel = Math.max(0, Math.min(9, Math.round(Number(rules.minLevel) || 0)));
        const count = F.fill(map, job.kind, (x, y) => {
            if (!inside(job.where, x, y) || !passes(rules, job.kind, x, y, limit)) return null;
            if (!noise) return level;
            const n = noise(x, y), amount = Math.max(0, Math.min(1, Number(rules.noise)));
            const v = Math.round(level * (1 - amount + amount * Math.min(1, n * 1.6)));
            return v >= Math.max(1, minLevel) ? v : 0;
        }, level, { height: job.height, colour: job.colour, tip: job.tip, vary: job.vary, seed: job.seed, colours: job.colours, glow: job.glow, width: job.width, lean: job.lean });
        report.push(`${job.kind}: ${count} cell(s) set (level ${level}${noise ? `, patchy ${rules.noise}` : ''})`);
    }
    let stood = 0;
    for (const job of Array.isArray(spec.bushes) ? spec.bushes : []) {
        if (Number.isFinite(Number(job.x)) && Number.isFinite(Number(job.y)) && !job.where) {
            if (F.addBush(map, job)) stood++;
            continue;
        }
        const random = rng((Number(job.seed) || 1) * 104729);
        const [lo, hi] = Array.isArray(job.size) ? job.size.map(Number) : [Number(job.size) || 1.6, Number(job.size) || 1.6];
        const spacing = Math.max(0.8, Number(job.spacing) || 3);
        const placed = [];
        const want = Math.max(0, Math.floor(Number(job.count) || 0));
        for (let tries = 0; placed.length < want && tries < want * 40; tries++) {
            const x = random() * W, y = random() * H, cx = Math.floor(x), cy = Math.floor(y);
            if (!inside(job.where, cx, cy) || !passes(job.rules, 'grass', cx, cy, limit)) continue;
            if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < spacing)) continue;
            const bush = F.addBush(map, { x, y, size: lo + (hi - lo) * random(), colour: job.colour, bloom: job.bloom, tall: job.tall || (0.85 + random() * 0.35), seed: Math.floor(random() * 100000) });
            if (bush) { placed.push([x, y]); stood++; }
        }
        if (placed.length < want) report.push(`bushes: only ${placed.length} of ${want} found room`);
    }
    if (stood) report.push(`bushes: ${stood} stood`);
    if (spec.wind) { F.setWind(map, spec.wind); report.push(`wind: ${JSON.stringify(F.wind(map))}`); }
    const stats = F.stats(map);
    for (const layer of stats.layers) report.push(`  ${layer.kind}: ${layer.cells} cell(s), about ${layer.clumps} clumps`);
    if (stats.bushes) report.push(`  bushes: ${stats.bushes}`);
    return { report };
}

module.exports = { paint, inside, noiseField };

if (require.main === module) {
    const args = process.argv.slice(2);
    const [project, mapArg, specFile] = args;
    if (!project || !mapArg || !specFile) {
        console.error('usage: paint-foliage.cjs <project> <mapId> <spec.json> [--check]');
        process.exit(2);
    }
    const check = args.includes('--check');
    const repo = path.resolve(__dirname, '..', '..');
    global.self = global; global.window = global;
    require(path.join(repo, 'runtime/libs/three.js'));
    const Reactor3D = require(path.join(repo, 'runtime/reactor_3d.js'));
    const RRJson = require(path.join(repo, 'editor/src/utils/JsonFiles.js'));
    const context = { window: {}, Reactor3D }; context.window = context;
    const vm = require('node:vm');
    vm.runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapElevation.js'), 'utf8'), context);
    vm.runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapFoliage.js'), 'utf8'), context);
    const E = context.RRMapElevation, F = context.RRMapFoliage;
    const mapId = Number(mapArg);
    const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
    const map = RRJson.read(fs, stem + '.json');
    map.id = mapId;
    map.reactor3d = fs.existsSync(stem + '.r3d.json') ? RRJson.read(fs, stem + '.r3d.json') : { version: 1, mode: '3d' };
    const spec = RRJson.read(fs, specFile);
    const run = paint(map, spec, { Reactor3D, F });
    for (const line of run.report) console.log(line);
    if (check) process.exit(0);
    fs.writeFileSync(stem + '.r3d.json', E.stringifySidecar(E.ensure(map)));
    console.log(`wrote ${stem}.r3d.json`);
}
