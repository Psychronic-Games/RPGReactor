#!/usr/bin/env node
/**
 * A 3D map's health, for a person or a generator to read before playing.
 *
 *   node editor/build-scripts/validate-map.cjs <project> <mapId>
 *
 * Reports: pieces off the map, materials with no image, placed models
 * standing inside a building, buildings whose rooms cannot all be walked
 * to from their front door, terrain steeper than a character can climb
 * under a building, rivers whose course leaves the map, runs uphill or
 * has no water, doors hung in a wall, foliage that is malformed or grows nowhere, and the counts
 * that decide performance. Exit 1 when
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
const ctx = { window: {}, Reactor3D }; ctx.window = ctx;
require('node:vm').runInNewContext(fs.readFileSync(path.join(repo, 'editor/src/utils/MapElevation.js'), 'utf8'), ctx);
const E = ctx.RRMapElevation;

const mapId = Number(mapArg);
const stem = path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);
const map = JSON.parse(fs.readFileSync(stem + '.json', 'utf8'));
map.id = mapId;
map.reactor3d = fs.existsSync(stem + '.r3d.json') ? JSON.parse(fs.readFileSync(stem + '.r3d.json', 'utf8')) : null;
const problems = [], notes = [];

if (!map.reactor3d) {
    console.log(`Map ${mapId} (${map.name || ''}) ${map.width}x${map.height}: no 3D sidecar.`);
    for (const note of notes) console.log(`  ok   ${note}`);
    for (const problem of problems) console.log(`  FIX  ${problem}`);
    process.exit(problems.length ? 1 : 0);
}
// What lies past the border.
if (map.reactor3d.surround !== undefined) {
    const surround = Reactor3D.normalizeSurround(map.reactor3d.surround);
    const rawStyle = map.reactor3d.surround && map.reactor3d.surround.style;
    if (!Reactor3D.SURROUND_STYLES.includes(rawStyle)) problems.push(`surround: style "${rawStyle}" is not one of ${Reactor3D.SURROUND_STYLES.join(', ')}`);
    else if (surround) {
        if (surround.style !== 'void' && !(Reactor3D.roomFor(map) || {}).floor) problems.push('surround: the map has no room floor for the land past its border to wear (Map Properties > 3D > Floor)');
        const built = Reactor3D.surroundGeometry(map, surround, { floorY: 0 });
        notes.push(`surround: ${surround.style}${Object.keys(surround.edges).length ? ' (' + Object.entries(surround.edges).map(([side, style]) => side + ' ' + style).join(', ') + ')' : ''}, ${built.info.triangles.toLocaleString()} triangles${built.info.sea !== null ? ', sea at ' + built.info.sea.toFixed(2) : ''}`);
    }
}
const pieces = E.pieces(map);
const raw = Array.isArray(map.reactor3d.pieces) ? map.reactor3d.pieces : [];
if (raw.length !== pieces.length) problems.push(`${raw.length - pieces.length} piece(s) are off the map or malformed and will not be built`);
// Materials with no image.
const materialsDir = path.join(project, 'img', 'materials');
for (const name of E.pieceMaterials(map)) {
    if (/^glass/i.test(name)) continue; // drawn see-through, no image wanted
    if (/glow$/i.test(name)) continue; // lit from within in a colour read from its name, no image wanted
    const found = ['.png', '.jpg', '.jpeg', '.webp'].some(ext => fs.existsSync(path.join(materialsDir, name + ext)));
    if (!found) problems.push(`material "${name}" has no image under img/materials (pieces draw plain grey)`);
}
// Buildings: every room reachable from the front door.
for (const record of E.structures(map)) {
    const planFile = path.join(project, '3d', 'Structures', record.plan);
    if (!fs.existsSync(planFile)) { problems.push(`building ${record.group} names a plan that is missing: ${record.plan}`); continue; }
    const plan = SP.transform(JSON.parse(fs.readFileSync(planFile, 'utf8')), record.rot, record.scale);
    const resolve = name => { const file = path.join(path.dirname(planFile), /\.json$/i.test(name) ? name : name + '.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; };
    const report = SP.validate(plan, pieces, record.x, record.y, map.width, map.height, Reactor3D, resolve);
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
// Doors: each hangs across a doorway (or a gap in a fence), and a locked one says what unlocks it.
const doorPieces = Reactor3D.piecesOf(map).filter(p => p.kind === 'door');
if (doorPieces.length) {
    const kindsAt = (x, y, z) => Reactor3D.piecesOf(map).filter(p => p.x === x && p.y === y && p.z === z).map(p => p.kind);
    let locked = 0;
    for (const door of doorPieces) {
        const cells = Reactor3D.doorCells(door);
        const walled = cells.filter(([x, y]) => kindsAt(x, y, door.z).some(kind => kind === 'wall' || kind === 'window' || kind === 'block'));
        if (walled.length) problems.push(`door ${door.id} at (${door.x}, ${door.y}): ${walled.length} of its ${cells.length} cell(s) are wall, not a doorway`);
        if (cells.length < (door.width || 1)) problems.push(`door ${door.id} at (${door.x}, ${door.y}) runs off the map`);
        if (door.opens === 'locked') locked++;
    }
    notes.push(`${doorPieces.length} door(s)${locked ? `, ${locked} locked` : ''}; ${Reactor3D.pieceTrims(map).length} trim(s) (casings, window frames)`);
}
// Doorways: nothing may stand in an opening (a rail, a sill, a fence, a shape) between its threshold and its head.
for (const crossed of Reactor3D.doorwayCrossings(map)) problems.push(`something crosses doorway at ${crossed.x},${crossed.y}${crossed.z ? ` (level ${crossed.z})` : ''}: ${crossed.by.join(', ')}`);
// Rivers: a course on the map, running downhill, with water somewhere along it.
(Array.isArray(map.reactor3d.water) ? map.reactor3d.water : []).forEach((raw, index) => {
    if (!raw || !Array.isArray(raw.path)) return;
    const name = `river ${index + 1}`;
    const points = raw.path.filter(p => Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every(v => Number.isFinite(Number(v))));
    if (points.length < 2) { problems.push(`${name}: its path needs at least two [x, y, level] points (it draws as a level pond)`); return; }
    if (points.length !== raw.path.length) problems.push(`${name}: ${raw.path.length - points.length} path point(s) are not [x, y, level] and are skipped`);
    const off = points.filter(([x, y]) => x < 0 || y < 0 || x > map.width || y > map.height);
    if (off.length) problems.push(`${name}: ${off.length} path point(s) lie off the ${map.width}x${map.height} map: ${off.map(p => `(${p[0]}, ${p[1]})`).join(', ')}`);
    const uphill = [];
    for (let i = 0; i + 1 < points.length; i++) if (Number(points[i + 1][2]) > Number(points[i][2]) + 0.01) uphill.push(`(${points[i][0]}, ${points[i][1]}) to (${points[i + 1][0]}, ${points[i + 1][1]})`);
    if (uphill.length) problems.push(`${name}: runs uphill ${uphill.join(', ')} (list the path upstream first, its levels never rising)`);
    const sheet = Reactor3D.normalizeWater(raw, map);
    if (!sheet || (sheet.mask && !sheet.mask.includes('1'))) { problems.push(`${name}: no cell of it is wet`); return; }
    const falls = Reactor3D.riverFalls(sheet);
    notes.push(`${name}: ${points.length} points, ${Number(points[0][2])} down to ${Number(points[points.length - 1][2])}${falls.length ? `, ${falls.length} waterfall(s)` : ''}`);
});
// Ground types: each a material with an image, painted somewhere, no more than the floor's shader takes.
const groundRaw = map.reactor3d.ground;
if (groundRaw && typeof groundRaw === 'object') {
    const rawTypes = Array.isArray(groundRaw.types) ? groundRaw.types : [];
    const ground = Reactor3D.groundOf(map);
    const kept = ground ? ground.types : [];
    if (rawTypes.length > Reactor3D.GROUND_TYPES_MAX) problems.push(`ground: ${rawTypes.length} types, and a map draws ${Reactor3D.GROUND_TYPES_MAX}; the rest are not drawn`);
    else if (rawTypes.length !== kept.length) problems.push(`ground: ${rawTypes.length - kept.length} type(s) name no material and are not drawn`);
    if (kept.length && !(Reactor3D.roomFor(map) || {}).floor) problems.push('ground: the map has no room floor to lay its ground types over (Map Properties > 3D > Floor)');
    for (const type of kept) {
        const found = ['.png', '.jpg', '.jpeg', '.webp'].some(ext => fs.existsSync(path.join(materialsDir, type.material + ext)));
        if (!found) problems.push(`ground: type "${type.name}" names material "${type.material}", which has no image under img/materials`);
        const cells = type.paint.reduce((n, v) => n + (v ? 1 : 0), 0);
        if (!cells) notes.push(`ground: "${type.name}" is painted nowhere`);
        else notes.push(`ground: "${type.name}" (${type.material}${type.tint ? ', ' + type.tint : ''}) on ${cells.toLocaleString()} cell(s)${type.bare ? ', nothing grows on it' : ''}`);
    }
    for (const type of rawTypes) {
        const tokens = String(type && type.paint || '').split(/[\s,]+/).filter(Boolean);
        const bad = tokens.filter(token => !/^[0-9](?:x\d+)?$/.test(token));
        if (bad.length) problems.push(`ground: "${(type && (type.name || type.material)) || '?'}" has ${bad.length} paint token(s) that are not a level 0-9 or a run like 9x12: ${bad.slice(0, 3).join(' ')}`);
        const total = tokens.reduce((n, token) => { const m = /^[0-9](?:x(\d+))?$/.exec(token); return n + (m ? (m[1] ? Number(m[1]) : 1) : 0); }, 0);
        if (total > map.width * map.height) problems.push(`ground: "${(type && (type.name || type.material)) || '?'}" paints ${total} cells on a map of ${map.width * map.height}`);
    }
}
// Foliage: layers that are kinds the runtime grows, cells it can grow on, bushes on the map.
const foliageRaw = map.reactor3d.foliage;
if (foliageRaw && typeof foliageRaw === 'object') {
    const foliage = Reactor3D.normalizeFoliage(foliageRaw, map);
    const rawLayers = Array.isArray(foliageRaw.layers) ? foliageRaw.layers : [];
    if (rawLayers.length !== foliage.layers.length) problems.push(`foliage: ${rawLayers.length - foliage.layers.length} layer(s) are not ${Reactor3D.FOLIAGE_KINDS.join(', ')} and do not grow`);
    const rawBushes = Array.isArray(foliageRaw.bushes) ? foliageRaw.bushes : [];
    if (rawBushes.length !== foliage.bushes.length) problems.push(`foliage: ${rawBushes.length - foliage.bushes.length} bush(es) are off the map or malformed`);
    const limit = Reactor3D.foliageSlopeLimit(map);
    let drawn = 0;
    for (const layer of foliage.layers) {
        let painted = 0, open = 0, clumps = 0;
        for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
            const level = layer.density[y * map.width + x];
            if (!level) continue;
            painted++;
            if (Reactor3D.foliageCellOpen(map, x, y, layer.kind, limit) < 0) continue;
            open++; clumps += level * Reactor3D.FOLIAGE_LOOKS[layer.kind].perLevel;
        }
        if (!painted) continue;
        if (!open) problems.push(`foliage: the ${layer.kind} layer is painted only where nothing grows (pieces, rocks, water or cliffs)`);
        else notes.push(`foliage: ${layer.kind} on ${open.toLocaleString()} cell(s) (${(painted - open).toLocaleString()} painted where it cannot grow), about ${Math.round(clumps).toLocaleString()} clumps`);
        drawn += clumps * (Reactor3D.foliageTemplate(layer.kind).index.length / 3);
    }
    if (foliage.bushes.length) notes.push(`foliage: ${foliage.bushes.length} bush(es), ${foliage.bushes.filter(b => b.size >= Reactor3D.BUSH_BLOCK_SIZE).length} of them big enough to block the way`);
    // Only the near field is drawn whole; past FOLIAGE_LOD.full.far nothing is. A full map's worth is the worst case.
    if (drawn > 0) notes.push(`foliage: ${Math.round(drawn).toLocaleString()} triangles if every clump were drawn (distance thins it to a fraction)`);
}
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
