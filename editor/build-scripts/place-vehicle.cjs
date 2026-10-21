#!/usr/bin/env node
/**
 * Stand a vehicle on a project's map by script, as Use on the map does by
 * clicking.
 *
 *   node editor/build-scripts/place-vehicle.cjs <project> <mapId> --vehicle 1 --at 28,3
 *        [--yaw 180 | --face n|ne|e|se|s|sw|w|nw] [--key bike] [--z H] [--board ok|command] [--name "Text"]
 *        [--check] [--force] [--json]
 *
 *   --vehicle N     the type's number: its place in the list of data/ReactorVehicles.json
 *   --at x,y        the tile its middle stands on
 *   --yaw D         the way it faces, in degrees: 0 north, 90 east, 180 south, 270 west
 *   --face F        the same as a word: n, ne, e, se, s, sw, w, nw
 *   --key K         a name event commands and scripts may use for it ("bike")
 *   --z H           on a 3D map: the place to stand nearest height H (a deck, an upper floor); else the tile's own floor
 *   --board B       ok: OK beside it boards (the default); command: only a Get On Vehicle command boards
 *   --name "Text"   the event's name (else the type's)
 *   --check         say what would be placed and write nothing
 *   --force         place even where the stand test refuses (never off the map), and although the editor has the project open
 *
 * What it makes is an ordinary event named after the type, with
 * `rrVehicle: { type, yaw }`, one empty page, priority Same as Characters,
 * trigger Action Button and no picture (`RRVehicles.vehicleEvent`, the
 * event the click makes). It is placed only where the vehicle can stand
 * with its whole body, by the stand test Battle Setup uses
 * (`RRBattleCheck.standing`): a refused tile says why and nothing is
 * written. A name another vehicle has, `this`, `ridden`, `nearest` and a
 * name with a `:` are refused. The map is written as the editor saves one
 * and `System.json › versionId` is bumped, as place-unit.cjs does. The
 * validator's lines for the new vehicle follow. Exit 0 placed, 1 refused
 * (nothing written), 2 bad usage.
 */
const fs = require('node:fs');
const path = require('node:path');
const validate = require('./validate-vehicles.cjs');
const placer = require('./place-unit.cjs');

/**
 * Place an order on a map in memory. `order`: `type` (the record's place
 * in the list), `x`, `y`, `yaw` (degrees; absent: the event's own facing, south), `key`,
 * `board`, `name`, `z`, `force`. `context`: `VehicleSetup`, `BattleCheck`,
 * `types` (the records), `taken` (the names other vehicles carry),
 * `lookups` (what `RRBattleCheck.standing` takes), `body(map, event, spec,
 * yaw)` (the tiles the vehicle's model covers) and `spec(record)` (its
 * model spec).
 *
 * Returns `{ placed: { event, lift, height } | null, refused: [{ key,
 * text }], sidecar }` (`height`: where it stands on a 3D map; `lift` of
 * that over the tile's ground, kept as the event's Z; `sidecar`: the
 * map's 3D sidecar changed). With a refusal (and no `force`) the map is
 * left as it was; a name that cannot be used and a tile off the map are
 * refused whatever is forced.
 */
function place(map, order, context) {
    const S = context.VehicleSetup, C = context.BattleCheck, lookups = context.lookups || {};
    const R = lookups.Reactor3D || null;
    const out = { placed: null, refused: [], sidecar: false };
    // The record at that place in the list: where the game looks for the type an event names.
    const record = S.typeAt(context.types, order.type);
    if (!record) { out.refused.push({ key: 'vehicleCheck.noType', text: `vehicle type ${order.type} is not in the Database.`, hard: true }); return out; }
    const named = S.nameProblem(order.key, context.taken);
    if (named) { out.refused.push({ key: named.key, text: named.text, hard: true }); return out; }
    if (!Array.isArray(map.events)) map.events = [null];
    const maker = placer.manager(map), id = maker.getNextEventId();
    const name = order.name || record.name || 'Vehicle';
    const event = S.vehicleEvent(id, order.x, order.y, { type: Math.floor(Number(order.type)), yaw: order.yaw, key: order.key, board: order.board, name });
    const row = S.vehicleOf(event);
    // Where it would stand, asked with the event in place of nothing: a refusal leaves the map as it was.
    let shape = null;
    const spec = typeof context.spec === 'function' ? context.spec(record) : null;
    if (typeof context.body === 'function' && spec) { try { shape = C.toShape(context.body(map, event, spec, row.yaw)); } catch (error) { shape = null; } }
    const asked = Number.isFinite(order.z) ? { height: order.z, within: Infinity } : { any: true };
    let stand = C.standing(map, order.x, order.y, Object.assign({ eventId: id, body: shape || undefined, name }, asked), lookups);
    if (!stand.ok) {
        // A tile off the map is no place at all: nothing forces an event there, where the editor could not select it.
        const off = stand.why === 'offMap' || !(order.x >= 0 && order.y >= 0 && order.x < map.width && order.y < map.height);
        out.refused.push(Object.assign({ key: stand.whyKey, text: stand.whyText, x: order.x, y: order.y }, off ? { hard: true } : {}));
        if (!order.force || off) return out;
        stand = { ok: true, height: null, ground: null };
    }
    map.events[id] = event;
    if (placer.forget(map, id)) out.sidecar = true;
    // On a 3D map it stands on the place found: its height over the tile's ground is the event's Z, which the game spends at the first ride.
    let lift = 0;
    if (R && Number.isFinite(stand.height) && Number.isFinite(stand.ground) && typeof R.setEventZ === 'function') {
        lift = Math.round(Math.max(0, stand.height - stand.ground) * 100) / 100;
        if (lift > 0) { R.setEventZ(map, id, lift); out.sidecar = true; }
    }
    out.placed = { event, lift, height: Number.isFinite(stand.height) && Number.isFinite(stand.ground) ? stand.height : null, body: shape ? shape.count : 1 };
    return out;
}

module.exports = { place };

function usage(problem) {
    if (problem) console.error(problem);
    console.error('usage: place-vehicle.cjs <project> <mapId> --vehicle 1 --at 28,3 [--yaw 180 | --face n|ne|e|se|s|sw|w|nw] [--key bike] [--z H]');
    console.error('       also: --board ok|command, --name "Text", --check, --force, --json');
    process.exit(2);
}

if (require.main === module) {
    const argv = process.argv.slice(2), plain = [], order = {};
    let check = false, json = false, faced = 0;
    const S = require(path.join(validate.APP, 'src', 'event', 'VehicleSetup.js'));
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], value = () => { if (i + 1 >= argv.length) usage(`${arg} needs a value`); return argv[++i]; };
        if (arg === '--vehicle') { order.type = Number(value()); if (!Number.isInteger(order.type) || order.type < 1) usage('--vehicle takes a type\'s number'); }
        else if (arg === '--at') {
            const match = /^(-?\d+),(-?\d+)$/.exec(value());
            if (!match) usage('--at takes x,y');
            order.x = Number(match[1]); order.y = Number(match[2]);
        } else if (arg === '--yaw') { order.yaw = Number(value()); if (!Number.isFinite(order.yaw)) usage('--yaw takes degrees: 0 north, 90 east, 180 south, 270 west'); faced++; }
        else if (arg === '--face') { const word = String(value()).toLowerCase(); if (!Object.prototype.hasOwnProperty.call(S.FACES, word)) usage('--face is n, ne, e, se, s, sw, w or nw'); order.yaw = S.FACES[word]; faced++; }
        else if (arg === '--key') order.key = String(value());
        else if (arg === '--z') { order.z = Number(value()); if (!Number.isFinite(order.z)) usage('--z takes a height in tiles'); }
        else if (arg === '--board') { order.board = String(value()).toLowerCase(); if (!S.BOARD.includes(order.board)) usage('--board is ok or command'); }
        else if (arg === '--name') order.name = String(value());
        else if (arg === '--check') check = true;
        else if (arg === '--force') order.force = true;
        else if (arg === '--json') json = true;
        else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
        else plain.push(arg);
    }
    const [project, mapArg] = plain;
    if (!project || !(Number(mapArg) > 0) || plain.length > 2) usage();
    if (!order.type) usage('--vehicle N says which type it is');
    if (order.x === undefined) usage('--at x,y says where it stands');
    if (faced > 1) usage('--yaw and --face are two ways to say one thing: pass one');
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) usage(`not a project: ${project} (no data/System.json)`);
    const loaded = validate.world(), C = loaded.BattleCheck, lines = [];
    const finish = (code, more) => {
        if (json) console.log(JSON.stringify(Object.assign({ ok: code === 0, exit: code, lines }, more), null, 1));
        process.exit(code);
    };
    const refuse = (text, key = 'vehicleTool.refused', where = '') => {
        lines.push({ key, level: 'fix', text, args: {}, file: '', path: '' });
        if (!json) { console.log(`refused${where}: ${text}`); console.log('nothing written'); }
        finish(1, { wrote: [] });
    };
    const data = validate.read(project);
    const mapId = Number(mapArg), map = data.maps.find(each => each.id === mapId) || null;
    if (!map) {
        if (data.unreadable.includes(`data/Map${validate.three(mapId)}.json`)) refuse(`Map${validate.three(mapId)}.json cannot be read (not valid JSON).`);
        usage(`Map ${mapArg}: no such map in ${project}`);
    }
    if (!Array.isArray(data.types)) refuse('This project has no vehicle types yet (data/ReactorVehicles.json). make-vehicle.cjs makes one.');
    if (loaded.problem && !json) console.log(`note: the 3D world could not be loaded (${loaded.problem}); on a 3D map where it stands is not checked`);
    const looks = validate.lookups(project, data, loaded);
    const taken = loaded.VehicleCheck.placed(data).map(entry => entry.row && entry.row.key).filter(Boolean);
    const V = loaded.Vehicles, kinds = loaded.VehicleCheck.kindsOf({ Vehicles: V });
    // A type's model as the game fills it; as this tool reads it for a record the game's reader cannot take.
    const specOf = record => { const filled = loaded.VehicleCheck.typeOf(record, { Vehicles: V }); return (filled && filled.model) || S.typeModel(record, kinds); };
    // The stand test's own lookups, with a body for every event of the map: a vehicle's, a unit's, a model's.
    const standing = Object.assign({}, looks, {
        body: (event, unit) => {
            const row = S.vehicleOf(event), record = row ? S.typeAt(data.types, row.type) : null;
            const spec = record ? specOf(record) : null;
            if (spec && looks.body) return looks.body(map, event, spec, row.yaw);
            return looks.unitBody ? looks.unitBody(map, event, unit) : null;
        }
    });
    const done = place(map, order, { VehicleSetup: S, BattleCheck: C, types: data.types, taken, lookups: standing, body: looks.body, spec: specOf });
    for (const refused of done.refused) {
        lines.push({ key: refused.key || 'vehicleTool.refused', level: 'fix', text: refused.text, args: {}, file: `data/Map${validate.three(mapId)}.json`, path: '' });
        if (!json) console.log(Number.isFinite(refused.x) ? `refused (${refused.x}, ${refused.y}): ${refused.text}` : `refused: ${refused.text}`);
    }
    if (!done.placed) { if (!json) console.log('nothing written'); finish(1, { wrote: [] }); }
    if (!check && !order.force && validate.lockOwner(project)) refuse(validate.TOOL['vehicleTool.locked'], 'vehicleTool.locked');
    const { event, height } = done.placed, row = S.vehicleOf(event);
    const stands = height === null ? '' : `, standing at height ${Math.round(height * 100) / 100}`;
    const head = `placed ${validate.three(event.id)} ${event.name} at (${event.x}, ${event.y})${stands}, facing ${S.faceWord(row.yaw)} (${row.yaw})${row.key ? `, named ${row.key}` : ''}${row.board === 'command' ? ', boarded by a command' : ''}`;
    if (!json) console.log(head);
    const wrote = [];
    if (check) { if (!json) console.log('--check: nothing written'); }
    else {
        // The map as the editor saves one, its sidecar when a height was kept, and System's version so a save reloads the map.
        for (const file of placer.save(project, map, done.sidecar)) wrote.push(path.relative(project, file).split(path.sep).join('/'));
        wrote.push('data/System.json');
        if (!json) for (const file of wrote) console.log(`wrote ${file}`);
    }
    // What the validator says of the vehicle just placed.
    const report = loaded.VehicleCheck.problems(data, looks);
    const mine = report.lines.filter(line => line.mapId === mapId && line.eventId === event.id);
    for (const line of validate.jsonLines({ lines: mine })) lines.push(line);
    if (!json) for (const line of mine) console.log(`${(line.level === 'fix' ? 'FIX' : 'note').padEnd(4)} ${validate.lineText(line)}`);
    finish(0, { event, placed: head, wrote });
}
