#!/usr/bin/env node
/**
 * Save what stands in a box of a map as a structure to use again.
 *
 *   node editor/build-scripts/save-structure.cjs <project> <mapId> <x0> <y0> <x1> <y1> <name> [--events] [--note "text"] [--force] [--check]
 *
 * Every piece whose cell lies in the box (cells inclusive), with the lights,
 * screens, placed models and water standing in it, is written to
 * `<project>/3d/Structures/<Name>.json` in the built format, where the Build
 * bar's Blueprint slot, Database › Structures and build-structure.cjs find it.
 * `--events` brings the events in the box along as its people (templates under
 * 3d/Structures/events). An existing structure of that name is kept unless
 * `--force`. `--check` reports without writing.
 */
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const valueOf = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const positional = args.filter((arg, i) => !arg.startsWith('--') && !(i > 0 && args[i - 1] === '--note'));
const [project, mapArg, x0Arg, y0Arg, x1Arg, y1Arg, ...nameParts] = positional;
const name = nameParts.join(' ').trim();
if (!project || !mapArg || [x0Arg, y0Arg, x1Arg, y1Arg].some(v => v === undefined || !Number.isFinite(Number(v))) || !name) {
    console.error('usage: save-structure.cjs <project> <mapId> <x0> <y0> <x1> <y1> <name> [--events] [--note "text"] [--force] [--check]');
    process.exit(2);
}
const repo = path.resolve(__dirname, '..', '..');
const elevationContext = { window: {} }; elevationContext.window = elevationContext;
require('node:vm').runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapElevation.js'), 'utf8'), elevationContext);
const E = elevationContext.RRMapElevation;
const SC = require(path.join(repo, 'editor/src/utils/StructureCapture.js'));

const mapId = Number(mapArg);
const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
if (!fs.existsSync(stem + '.json')) { console.error(`no map ${mapId} in ${project}`); process.exit(1); }
const map = JSON.parse(fs.readFileSync(stem + '.json', 'utf8'));
map.id = mapId;
map.reactor3d = fs.existsSync(stem + '.r3d.json') ? JSON.parse(fs.readFileSync(stem + '.r3d.json', 'utf8')) : { version: 1 };
const lo = [Math.min(Number(x0Arg), Number(x1Arg)), Math.min(Number(y0Arg), Number(y1Arg))], hi = [Math.max(Number(x0Arg), Number(x1Arg)), Math.max(Number(y0Arg), Number(y1Arg))];
const ids = E.pieces(map).filter(p => p.x >= lo[0] && p.x <= hi[0] && p.y >= lo[1] && p.y <= hi[1]).map(p => p.id);
const result = SC.capture(map, ids, { E, name, description: valueOf('--note') || '', events: flag('--events') });
if (!result) { console.error(`no pieces in (${lo[0]}, ${lo[1]}) to (${hi[0]}, ${hi[1]})`); process.exit(1); }
const directory = path.join(project, '3d', 'Structures');
const file = SC.fileStem(name) + '.json';
const c = result.counts;
console.log(`${name}: ${c.pieces} pieces, ${c.lights} lights, ${c.surfaces} screens, ${c.props} models, ${c.water} water, ${c.events} events; ${result.plan.size[0]} x ${result.plan.size[1]} cells, ${result.plan.height} floor(s)`);
if (fs.existsSync(path.join(directory, file)) && !flag('--force')) { console.error(`3d/Structures/${file} exists (use --force to replace it)`); process.exit(1); }
if (flag('--check')) process.exit(0);
SC.write(project, result, { fs, path, file, stringify: plan => E.stringifySidecar(plan) });
console.log(`wrote 3d/Structures/${file}${result.templates.length ? ` and ${result.templates.length} event template(s)` : ''}`);
