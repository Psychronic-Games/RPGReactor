#!/usr/bin/env node
/**
 * Lay a river along a course on a project's map, as the Build bar's River
 * tool does.
 *
 *   node editor/build-scripts/carve-river.cjs <project> <mapId> <course.json> [--width N] [--depth N] [--flow N] [--material Name] [--check]
 *
 * `course.json` is a list of points in tiles, upstream first: `[[x, y], ...]`
 * (a cell's middle is x + 0.5). The river starts a little under the ground
 * at the first point (or at the level of a lake it starts in), follows the
 * ground down and never up, falls where the ground drops, and ends at the
 * level of a lake it runs into. Points that all carry a level
 * (`[[x, y, level], ...]`) keep those heights instead. The channel is
 * carved into the terrain (`--width` tiles across, default 3; `--depth`
 * under the surface, default 1), and the sheet is added to
 * Map###.r3d.json with its path. `--check` reports without writing.
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const [project, mapArg, courseFile] = args;
if (!project || !mapArg || !courseFile) {
    console.error('usage: carve-river.cjs <project> <mapId> <course.json> [--width N] [--depth N] [--flow N] [--material Name] [--check]');
    process.exit(2);
}
const option = name => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined; };
const check = args.includes('--check');
const repo = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repo, 'runtime/libs/three.js'));
const Reactor3D = require(path.join(repo, 'runtime/reactor_3d.js'));
const RRJson = require(path.join(repo, 'editor/src/utils/JsonFiles.js'));
const elevationContext = { window: {}, Reactor3D }; elevationContext.window = elevationContext;
require('node:vm').runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapElevation.js'), 'utf8'), elevationContext);
const E = elevationContext.RRMapElevation;

const mapId = Number(mapArg);
const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
const map = RRJson.read(fs, stem + '.json');
map.id = mapId;
map.reactor3d = fs.existsSync(stem + '.r3d.json') ? RRJson.read(fs, stem + '.r3d.json') : { version: 1, mode: '3d' };
const course = RRJson.read(fs, courseFile);
const options = { width: option('--width'), depth: option('--depth'), material: option('--material') || 'Water' };
if (option('--flow') !== undefined) options.flow = Number(option('--flow'));
const laid = E.carveRiver(map, course, options);
if (!laid) { console.error('no river laid: the course needs two points on the map and at least one wet cell'); process.exit(1); }
const sheet = laid.sheet;
const falls = Reactor3D.riverFalls(Reactor3D.normalizeWater(sheet, map));
const wet = sheet.mask ? sheet.mask.split('').filter(c => c === '1').length : (sheet.x1 - sheet.x0 + 1) * (sheet.y1 - sheet.y0 + 1);
console.log(`river: ${sheet.path.length} points from ${sheet.path[0][2]} down to ${sheet.path[sheet.path.length - 1][2]}, ${wet} wet cells in (${sheet.x0}, ${sheet.y0})-(${sheet.x1}, ${sheet.y1})`);
for (const fall of falls) console.log(`  waterfall at (${fall.x0}, ${fall.z0}): ${(fall.top - fall.bottom).toFixed(2)} tiles down to (${fall.x1}, ${fall.z1})`);
if (laid.region) console.log(`  channel carved over corners (${laid.region.x0}, ${laid.region.z0})-(${laid.region.x1}, ${laid.region.z1})`);
if (check) process.exit(0);
// The ponds the carving reached follow the ground, as after a terrain stroke.
E.refitWater(map);
fs.writeFileSync(stem + '.r3d.json', E.stringifySidecar(E.ensure(map)));
console.log(`wrote ${stem}.r3d.json (${E.water(map).length} water sheet(s))`);
