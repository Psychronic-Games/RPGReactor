#!/usr/bin/env node
/**
 * A 3D map's health, for a person or a generator to read before playing.
 *
 *   node editor/build-scripts/validate-map.cjs <project> <mapId>
 *
 * Reports: pieces off the map, materials with no image, placed models
 * standing inside a building, buildings whose rooms cannot all be walked
 * to from their front door, terrain steeper than a character can climb
 * under a building, and the counts that decide performance. Exit 1 when
 * anything is wrong.
 */
const fs = require('node:fs');
const path = require('node:path');
const [project, mapArg] = process.argv.slice(2);
if (!project || !mapArg) { console.error('usage: validate-map.cjs <project> <mapId>'); process.exit(2); }
const repo = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repo, 'runtime/libs/three.js'));
const Reactor3D = require(path.join(repo, 'runtime/reactor_3d.js'));
const SP = require(path.join(repo, 'editor/src/utils/StructurePlan.js'));
const ctx = { window: {} }; ctx.window = ctx;
require('node:vm').runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapElevation.js'), 'utf8'), ctx);
const E = ctx.RRMapElevation;

const mapId = Number(mapArg);
const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
const map = JSON.parse(fs.readFileSync(stem + '.json', 'utf8'));
map.id = mapId;
map.reactor3d = fs.existsSync(stem + '.r3d.json') ? JSON.parse(fs.readFileSync(stem + '.r3d.json', 'utf8')) : null;
const problems = [], notes = [];
if (!map.reactor3d) { console.log(`Map ${mapId}: no 3D sidecar; nothing to check.`); process.exit(0); }
const pieces = E.pieces(map);
const raw = Array.isArray(map.reactor3d.pieces) ? map.reactor3d.pieces : [];
if (raw.length !== pieces.length) problems.push(`${raw.length - pieces.length} piece(s) are off the map or malformed and will not be built`);
// Materials with no image.
const materialsDir = path.join(project, 'img', 'materials');
for (const name of E.pieceMaterials(map)) {
    const found = ['.png', '.jpg', '.jpeg', '.webp'].some(ext => fs.existsSync(path.join(materialsDir, name + ext)));
    if (!found) problems.push(`material "${name}" has no image under img/materials (pieces draw plain grey)`);
}
// Buildings: every room reachable from the front door.
for (const record of E.structures(map)) {
    const planFile = path.join(project, '3d', 'Structures', record.plan);
    if (!fs.existsSync(planFile)) { problems.push(`building ${record.group} names a plan that is missing: ${record.plan}`); continue; }
    const plan = SP.transform(JSON.parse(fs.readFileSync(planFile, 'utf8')), record.rot, record.scale);
    const report = SP.validate(plan, pieces, record.x, record.y, map.width, map.height, Reactor3D);
    if (!report) { problems.push(`building ${record.group} (${record.plan}) has no front door`); continue; }
    const missed = Object.entries(report.report).filter(([, r]) => !r.reached).map(([name]) => name);
    if (missed.length) problems.push(`building ${record.group} (${record.plan} at ${record.x}, ${record.y}): cannot walk to ${missed.join(', ')}`);
    else notes.push(`building ${record.group} (${record.plan} at ${record.x}, ${record.y}): all ${Object.keys(report.report).length} rooms reachable from (${report.start.x}, ${report.start.y})`);
    // Models inside it.
    const [W, H] = plan.size;
    const inside = E.props(map).filter(p => p.x >= record.x && p.x < record.x + W && p.y >= record.y && p.y < record.y + H);
    if (inside.length) problems.push(`building ${record.group}: ${inside.length} placed model(s) stand inside it: ${inside.map(p => `${p.name.split('/').pop()} (${p.x}, ${p.y})`).join(', ')}`);
    // Ground under it should be level.
    if (E.hasTerrain(map)) {
        const grid = E.terrain(map), stride = map.width + 1;
        let lo = Infinity, hi = -Infinity;
        for (let y = record.y; y <= record.y + H; y++) for (let x = record.x; x <= record.x + W; x++) { const v = Number(grid[y * stride + x]) || 0; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        if (hi - lo > 0.01) problems.push(`building ${record.group}: the ground under it varies by ${(hi - lo).toFixed(2)} tiles (stamp again to level it)`);
    }
}
// Loose pieces: a group of touching pieces with no building record is fine; a lone piece in the air is likely a mistake.
const floating = pieces.filter(p => p.z > 0 && !pieces.some(q => q.x === p.x && q.y === p.y && q.z < p.z) && p.kind !== 'floor');
if (floating.length) notes.push(`${floating.length} piece(s) stand above ground with nothing under them (bridges and balconies are fine; check the rest)`);
// Performance.
let tris = 0;
for (const material of E.pieceMaterials(map).concat(pieces.some(p => !p.material) ? [''] : [])) {
    const list = pieces.filter(p => p.material === material);
    if (list.length) tris += Reactor3D.pieceGeometry(list, map).attributes.position.count / 3;
}
const chunks = new Set(pieces.map(p => Reactor3D.pieceChunkKey(p.x, p.y))).size;
notes.push(`${pieces.length} pieces, ${tris.toLocaleString()} triangles in ${chunks} chunk(s) × ${E.pieceMaterials(map).length} material(s); ${E.props(map).length} placed model(s); ${(map.reactor3d.lights || []).length} light(s)`);
if (map.width * map.height > 40000) problems.push(`${map.width}x${map.height} is over the 40,000-cell limit of the editor's 3D preview`);
if (tris > 400000) problems.push(`${tris.toLocaleString()} piece triangles is heavy for weak hardware; consider fewer pieces or more plain walls`);

console.log(`Map ${mapId} (${map.name || ''}) ${map.width}x${map.height}`);
for (const note of notes) console.log(`  ok   ${note}`);
for (const problem of problems) console.log(`  FIX  ${problem}`);
process.exit(problems.length ? 1 : 0);
