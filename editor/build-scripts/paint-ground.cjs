#!/usr/bin/env node
/**
 * Lay ground types over a project's map by rule, as the Build bar's Ground
 * brush does by hand.
 *
 *   node editor/build-scripts/paint-ground.cjs <project> <mapId> <spec.json> [--check]
 *
 * `spec.json`:
 *
 *   { "clear": true,                                      // every type and its paint taken away first
 *     "types": [ { "name": "Beach", "material": "Sand", "tint": "#e9d8ad", "scale": 4, "bare": true } ],
 *     "fill": [ { "type": "Beach", "level": 9,
 *                 "where": { "rect": [x0, y0, x1, y1] } | { "polygon": [[x, y], ...] } | { "all": true },
 *                 "rules": { "maxSlope": 0.5, "minSlope": 0.2, "minHeight": 0, "maxHeight": 3,
 *                            "nearWater": 3, "awayFromWater": 1, "nearPieces": 4, "awayFromPieces": 2,
 *                            "noise": 0.5, "noiseScale": 9, "seed": 1 } },
 *               { "type": "", "where": { "rect": [...] } } ] }   // "" clears back to the map's own ground
 *
 * A type is one of the map's own by name, or is added from `types`. A later
 * type lies over an earlier one. Rules: slopes in rise per tile, heights in
 * tiles (the ground's, without pieces), `nearWater` / `awayFromWater` /
 * `nearPieces` / `awayFromPieces` in cells (a beach is `nearWater`), `noise`
 * (0-1) breaking the edge into natural patches at `noiseScale` cells. Rects
 * are cells inclusive. `--check` reports without writing.
 */
const fs = require('node:fs');
const path = require('node:path');
const { inside, noiseField } = require('./paint-foliage.cjs');

/** Distance (cells, capped) to the nearest cell under water, and to the nearest with a piece standing. */
const distances = (map, R, cap) => {
    const W = map.width, H = map.height;
    const pieces = new Float32Array(W * H).fill(cap), water = new Float32Array(W * H).fill(cap);
    const seedsP = [], seedsW = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const stack = R.hasPieces(map) ? R.piecesAt(map, x, y) : null;
        if (stack && stack.some(p => (p.z || 0) < 1.5)) { pieces[y * W + x] = 0; seedsP.push(y * W + x); }
        if (R.hasWater(map) && R.waterLevelAt(map, x, y) !== null) { water[y * W + x] = 0; seedsW.push(y * W + x); }
    }
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

/** Apply a spec to a map in memory. `R` is the runtime (Reactor3D), `G` the editor's RRMapGround. Returns { report: [lines] }. */
function paint(map, spec, { Reactor3D: R, G }) {
    const report = [];
    const W = map.width;
    if (spec.clear) { G.restore(map, null); report.push('cleared every ground type'); }
    const indexOf = name => G.types(map).findIndex(type => (type.name || type.material) === name);
    for (const type of Array.isArray(spec.types) ? spec.types : []) {
        const name = type.name || type.material;
        const at = indexOf(name);
        if (at >= 0) { G.updateType(map, at, type); continue; }
        if (G.addType(map, type) < 0) report.push(`skipped type "${name}": no material named, or the map already holds ${G.MAX}`);
    }
    let fields = null;
    const field = () => fields || (fields = distances(map, R, 24));
    for (const job of Array.isArray(spec.fill) ? spec.fill : []) {
        const index = job.type === '' || job.type === null ? -1 : indexOf(job.type);
        if (index < 0 && job.type) { report.push(`skipped a fill of "${job.type}": not a ground type of this map`); continue; }
        const rules = job.rules || {}, number = key => (Number.isFinite(Number(rules[key])) && rules[key] !== null && rules[key] !== '' ? Number(rules[key]) : null);
        const noise = Number(rules.noise) > 0 ? noiseField((Number(rules.seed) || 1) * 7919, Number(rules.noiseScale) || 9) : null;
        const far = rules.nearWater || rules.awayFromWater || rules.nearPieces || rules.awayFromPieces ? field() : null;
        const count = G.fill(map, index, (x, y) => {
            if (!inside(job.where, x, y)) return false;
            const slope = slopeAt(map, R, x, y), height = R.elevationAt(map, x, y) + R.terrainHeightAt(map, x + 0.5, y + 0.5);
            if (number('maxSlope') !== null && slope > number('maxSlope')) return false;
            if (number('minSlope') !== null && slope < number('minSlope')) return false;
            if (number('maxHeight') !== null && height > number('maxHeight')) return false;
            if (number('minHeight') !== null && height < number('minHeight')) return false;
            // The noise moves the edge of a distance rule in and out, and thins the open fill.
            const wander = noise ? (noise(x, y) - 0.5) * 2 * Math.max(0, Math.min(1, Number(rules.noise))) : 0;
            if (rules.nearWater && far.water[y * W + x] > rules.nearWater * (1 + wander * 0.6)) return false;
            if (rules.awayFromWater && far.water[y * W + x] <= rules.awayFromWater) return false;
            if (rules.nearPieces && far.pieces[y * W + x] > rules.nearPieces * (1 + wander * 0.6)) return false;
            if (rules.awayFromPieces && far.pieces[y * W + x] <= rules.awayFromPieces) return false;
            if (noise && !rules.nearWater && !rules.nearPieces && wander < 0) return false;
            return true;
        }, job.level === undefined ? 9 : job.level);
        report.push(`${job.type || 'the map\'s own ground'}: ${count} cell(s) changed`);
    }
    for (const [i, type] of G.types(map).entries()) {
        const levels = G.levelsOf(map, i);
        report.push(`  ${type.name || type.material} (${type.material}${type.tint ? ', ' + type.tint : ''}): ${levels.reduce((n, v) => n + (v ? 1 : 0), 0)} cell(s)`);
    }
    return { report };
}

module.exports = { paint };

if (require.main === module) {
    const args = process.argv.slice(2);
    const [project, mapArg, specFile] = args;
    if (!project || !mapArg || !specFile) {
        console.error('usage: paint-ground.cjs <project> <mapId> <spec.json> [--check]');
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
    vm.runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapGround.js'), 'utf8'), context);
    const E = context.RRMapElevation, G = context.RRMapGround;
    const mapId = Number(mapArg);
    const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
    const map = RRJson.read(fs, stem + '.json');
    map.id = mapId;
    map.reactor3d = fs.existsSync(stem + '.r3d.json') ? RRJson.read(fs, stem + '.r3d.json') : { version: 1, mode: '3d' };
    const spec = RRJson.read(fs, specFile);
    const run = paint(map, spec, { Reactor3D, G });
    for (const line of run.report) console.log(line);
    if (check) process.exit(0);
    fs.writeFileSync(stem + '.r3d.json', E.stringifySidecar(E.ensure(map)));
    console.log(`wrote ${stem}.r3d.json`);
}
