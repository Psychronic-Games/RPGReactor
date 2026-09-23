#!/usr/bin/env node
/**
 * Stamp a structure plan onto a project's map.
 *
 *   node editor/build-scripts/build-structure.cjs <project> <mapId> <plan.json> <x> <y> [--check]
 *
 * Reads the plan, builds its pieces at (x, y), flattens the terrain under
 * the footprint to its mean height so the house stands level, merges the
 * pieces into Map###.r3d.json beside the map (existing pieces on the
 * footprint are replaced) and walks the result with the engine to report
 * which rooms can be reached. `--check` reports without writing.
 */
const fs = require('node:fs');
const path = require('node:path');
const [project, mapArg, planFile, xArg, yArg, ...flags] = process.argv.slice(2);
if (!project || !mapArg || !planFile || xArg === undefined || yArg === undefined) {
    console.error('usage: build-structure.cjs <project> <mapId> <plan.json> <x> <y> [--check]');
    process.exit(2);
}
const check = flags.includes('--check');
const repo = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repo, 'runtime/libs/three.js'));
const Reactor3D = require(path.join(repo, 'runtime/reactor_3d.js'));
const SP = require(path.join(repo, 'editor/src/utils/StructurePlan.js'));
const elevationContext = { window: {} }; elevationContext.window = elevationContext;
require('node:vm').runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapElevation.js'), 'utf8'), elevationContext);
const E = elevationContext.RRMapElevation;

const mapId = Number(mapArg), X0 = Number(xArg), Y0 = Number(yArg);
const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
const map = JSON.parse(fs.readFileSync(stem + '.json', 'utf8'));
map.id = mapId;
map.reactor3d = fs.existsSync(stem + '.r3d.json') ? JSON.parse(fs.readFileSync(stem + '.r3d.json', 'utf8')) : { version: 1, mode: '3d' };
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const [W, H] = plan.size;
if (X0 < 0 || Y0 < 0 || X0 + W > map.width || Y0 + H > map.height) {
    console.error(`the plan (${W}x${H}) at (${X0}, ${Y0}) does not fit the ${map.width}x${map.height} map`);
    process.exit(1);
}
// Level the pad: every terrain corner under the footprint to the footprint's mean.
if (E.hasTerrain(map)) {
    const grid = E.terrain(map), stride = map.width + 1;
    let sum = 0, n = 0;
    for (let y = Y0; y <= Y0 + H; y++) for (let x = X0; x <= X0 + W; x++) { sum += Number(grid[y * stride + x]) || 0; n++; }
    const mean = Math.round((sum / n) * 1000) / 1000;
    for (let y = Y0; y <= Y0 + H; y++) for (let x = X0; x <= X0 + W; x++) grid[y * stride + x] = mean;
    console.log(`terrain pad levelled at ${mean}`);
}
// Replace whatever stood on the footprint, keep everything else.
const kept = E.pieces(map).filter(p => !(p.x >= X0 && p.x < X0 + W && p.y >= Y0 && p.y < Y0 + H));
const firstId = kept.reduce((m, p) => Math.max(m, p.id), 0) + 1;
const group = E.nextPieceGroup(map);
const resolve = name => { const file = path.join(path.dirname(planFile), /\.json$/i.test(name) ? name : name + '.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };
const built = SP.build(plan, X0, Y0, firstId, group, resolve);
const all = kept.concat(built);
E.restorePieces(map, all);
E.setStructure(map, { group, plan: path.basename(planFile), x: X0, y: Y0, rot: 0, scale: 1, spots: SP.spots(plan, X0, Y0, resolve) });
const movedProps = E.relocatePropsOff(map, X0, Y0, W, H);
if (movedProps) console.log(`${movedProps} placed model(s) moved off the footprint`);
const report = SP.validate(plan, E.pieces(map), X0, Y0, map.width, map.height, Reactor3D, resolve);
const rooms = Object.entries(report.report);
console.log(`${plan.name || path.basename(planFile)}: ${built.length} pieces at (${X0}, ${Y0}); ${kept.length} kept; front door outside at (${report.start.x}, ${report.start.y})`);
for (const [name, r] of rooms) console.log(`  ${r.reached ? 'ok  ' : 'MISS'} ${name}${r.reached ? ` (${r.steps} steps)` : ''}`);
for (const [name, at] of Object.entries(SP.spots(plan, X0, Y0, resolve))) console.log(`  spot ${name} at (${at[0]}, ${at[1]})`);
if (check) process.exit(rooms.every(([, r]) => r.reached) ? 0 : 1);
const loadTemplate = name => { const file = path.join(path.dirname(planFile), 'events', /\.json$/i.test(name) ? name : name + '.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };
const placedEvents = SP.placeEvents(map, group, SP.eventsOf(plan, X0, Y0, resolve), loadTemplate);
if (placedEvents.length) {
    const data = Object.assign({}, map); delete data.id; delete data.reactor3d;
    fs.writeFileSync(stem + '.json', JSON.stringify(data, null, 2));
    console.log(`${placedEvents.length} event(s) placed: ${placedEvents.map(e => `${e.name} (${e.x}, ${e.y})`).join(', ')}`);
}
const sidecar = E.ensure(map);
fs.writeFileSync(stem + '.r3d.json', JSON.stringify(sidecar, null, 2));
console.log(`wrote ${stem}.r3d.json (${E.pieces(map).length} pieces)`);
process.exit(rooms.every(([, r]) => r.reached) ? 0 : 1);
