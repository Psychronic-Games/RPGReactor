#!/usr/bin/env node
/**
 * Stand units on a project's map by script, as Battle Setup does by clicking,
 * and set the map's battle mode and start.
 *
 *   node editor/build-scripts/place-unit.cjs <project> <mapId> --enemy 6 --at 86,53
 *        [--face left] [--side ally] [--comes-back] [--mode firstPerson] [--start 6|open|0]
 *
 *   --enemy N | --actor N   the Database record the unit is
 *   --at x,y                the tile it stands on; repeat it to place several
 *   --side S                enemy, ally or bystander (an enemy record is an enemy, an actor an ally, unless said)
 *   --face D                down, left, right or up
 *   --comes-back            a defeated enemy stands again when the map is entered again
 *   --move N                its own Move in a Tactical battle (else its record's)
 *   --name "Text"           the event's name (else the record's)
 *   --z H                   on a 3D map: the place to stand nearest height H (an upper floor, a deck); else the tile's own floor
 *   --mode M                this map's battle mode: classic, tactical, action, firstPerson; `game` takes the map's own out
 *   --start V               when the map starts its battle: a distance in tiles (1 to 50), `open`, or `0` (an event starts it)
 *   --lose V                `continue`: the game goes on after a lost battle the map started; `gameover` takes that out
 *   --check                 report what would be placed and write nothing
 *   --force                 place even where the checker says nothing can stand
 *
 * A unit is placed only where one can stand: on the map, on no other event,
 * not on or inside a placed model, and, on a 3D map, where the game's
 * physics gives a body a place on the tile's floor (not on a tile of a
 * house's wall, in deep water, on a roof's slope or under a ceiling too
 * low); a big unit only where all of it fits. A refused tile says why and
 * nothing is written. The first unit on a map with none writes the map's
 * start into its Note. A new event starts clean: what the map's 3D sidecar
 * kept under its id for an event since deleted (a height, a model, a size)
 * goes. What it writes is what Battle Setup writes
 * (src/event/BattleSetup.js); validate-battle.cjs's report of the map
 * follows. Close the map in the editor first: the editor keeps its own copy
 * of an open map.
 */
const fs = require('node:fs');
const path = require('node:path');
const validate = require('./validate-battle.cjs');

const SIDES = { enemy: 'enemy', ally: 'ally', bystander: 'neutral', neutral: 'neutral' };
const FACES = { down: 2, left: 4, right: 6, up: 8, 2: 2, 4: 4, 6: 6, 8: 8 };
const FACE_NAMES = { 2: 'down', 4: 'left', 6: 'right', 8: 'up' };
const three = id => String(id).padStart(3, '0');

/**
 * What Battle Setup asks of the editor's event manager to make an event: the
 * next free id and a blank page, as EventManager makes them.
 */
function manager(map) {
    return {
        currentMap: map,
        getNextEventId() {
            const events = Array.isArray(this.currentMap.events) ? this.currentMap.events : [];
            const taken = new Set(events.filter(Boolean).map(event => Number(event.id)));
            let next = 1;
            while (taken.has(next) || events[next]) next++;
            return next;
        },
        makeDefaultEventPage(overrides = {}) {
            const page = {
                conditions: {
                    actorId: 1, actorValid: false, itemId: 1, itemValid: false,
                    selfSwitchCh: 'A', selfSwitchValid: false,
                    switch1Id: 1, switch1Valid: false,
                    switch2Id: 1, switch2Valid: false,
                    variableId: 1, variableValid: false, variableValue: 0
                },
                directionFix: false,
                image: { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 },
                moveFrequency: 3,
                moveRoute: { list: [{ code: 0, indent: null, parameters: [] }], repeat: true, skippable: false, wait: false },
                moveSpeed: 3, moveType: 0, priorityType: 1,
                stepAnime: false, through: false, trigger: 0, walkAnime: true,
                list: [{ code: 0, indent: 0, parameters: [] }]
            };
            for (const [key, value] of Object.entries(overrides)) {
                if (key === 'conditions' || key === 'image' || key === 'moveRoute') page[key] = { ...page[key], ...value };
                else page[key] = value;
            }
            return page;
        },
        makeQuickEvent(x, y, name, pages) {
            return { id: this.getNextEventId(), name, note: '', pages, x, y };
        }
    };
}

/**
 * Take out of the map's 3D sidecar what it keeps for an event id: a height,
 * a model, a preview page, a size. An id is used again once its event is
 * gone, and a new event starts with none of these. True when anything went.
 */
function forget(map, id) {
    const side = map.reactor3d;
    if (!side || typeof side !== 'object') return false;
    let gone = false;
    for (const key of ['eventZ', 'events', 'eventPreviews', 'eventSize', 'eventSizeAuto']) {
        const store = side[key];
        if (!store || typeof store !== 'object' || !Object.prototype.hasOwnProperty.call(store, String(id))) continue;
        delete store[String(id)];
        if (!Object.keys(store).length) delete side[key];
        gone = true;
    }
    return gone;
}

/**
 * Place an order on a map in memory. `order`: `unit` (`{ team, record, id }`,
 * or null to change only the map's mode and start), `spots` (`[{ x, y }]`),
 * `face` (2, 4, 6, 8), `returns`, `move`, `name`, `z`, `mode` (a mode, or
 * `game`), `start` (a number, `open`), `lose` (`continue`, `gameover`),
 * `force`. `context`: `BattleCheck`, `BattleSetup`, `lookups` (as
 * BattleCheck.problems takes them).
 *
 * Returns `{ placed: [{ event, lift, height }], refused: [{ x, y, text }],
 * notes: [text], sidecar: boolean }` (`height`: where it stands on a 3D map,
 * `lift` of that over the tile's ground, kept as the event's Z; `sidecar`:
 * the map's 3D sidecar changed). With a refusal (and no `force`) the map is
 * left as it was.
 */
function place(map, order, context) {
    const C = context.BattleCheck, B = context.BattleSetup, lookups = context.lookups || {};
    const R = lookups.Reactor3D || null;
    const out = { placed: [], refused: [], notes: [], sidecar: false };
    const unit = order.unit || null, spots = unit ? order.spots || [] : [];
    const before = C.startOf(map), hadUnits = (map.events || []).some(event => event && C.unitOf(event));
    let record = null;
    if (unit && unit.record) {
        const list = unit.record === 'actor' ? lookups.actors : lookups.enemies;
        record = Array.isArray(list) ? list.find(entry => entry && Number(entry.id) === Number(unit.id)) || null : null;
        if (Array.isArray(list) && !record) { out.refused.push({ x: null, y: null, text: `${unit.record} ${unit.id} is not in the Database.` }); return out; }
    }
    const face = order.face || 2;
    if (!Array.isArray(map.events)) map.events = [null];
    // Where each would stand, before anything is made: a refusal leaves the map as it was. Each one found a
    // place stands there, as a stand-in, while the next is asked about, so two of one order never share a tile.
    const stands = [], events = map.events, length = events.length;
    try {
        spots.forEach((spot, index) => {
            const ghost = { id: -1 - index, x: spot.x, y: spot.y, rrUnit: { team: unit.team, record: unit.record, id: unit.id }, pages: [{ priorityType: 1, through: false, image: { direction: face } }] };
            const shape = C.bodyOf(map, ghost, unit, lookups);
            // The tile's own floor; with a height, the place to stand nearest it.
            const asked = Number.isFinite(order.z) ? { height: order.z, within: Infinity } : { any: true };
            let stand = C.standing(map, spot.x, spot.y, Object.assign({ eventId: ghost.id, body: shape, name: (record && record.name) || order.name || '' }, asked), lookups);
            if (!stand.ok) {
                out.refused.push({ x: spot.x, y: spot.y, text: stand.whyText });
                if (!order.force) return;
                stand = { ok: true, height: null, ground: null };
            }
            events.push(ghost);
            stands.push({ spot, stand });
        });
    } finally {
        events.length = length;
    }
    if (out.refused.length && !order.force) return out;
    const maker = manager(map);
    for (const { spot, stand } of stands) {
        const made = B.unitEvent(maker, unit, spot.x, spot.y, { actors: lookups.actors, enemies: lookups.enemies, map });
        const event = made && made.event ? made.event : made;
        // The row Battle Setup writes, with what this order adds to it.
        event.rrUnit = Object.assign({ team: unit.team, record: unit.record, id: unit.record ? Math.floor(Number(unit.id) || 0) : 0 }, event.rrUnit || {});
        if (order.move > 0) event.rrUnit.move = Math.floor(order.move);
        if (order.returns) event.rrUnit.returns = true;
        if (order.name) event.name = order.name;
        if (typeof B.face === 'function') B.face(event, face);
        else for (const page of event.pages || []) if (page && page.image) page.image.direction = face;
        map.events[event.id] = event;
        if (forget(map, event.id)) out.sidecar = true;
        // On a 3D map the unit stands on the place found: its height over the tile's ground is the event's Z.
        let lift = 0;
        if (R && Number.isFinite(stand.height) && Number.isFinite(stand.ground) && typeof R.setEventZ === 'function') {
            lift = Math.round(Math.max(0, stand.height - stand.ground) * 100) / 100;
            if (lift > 0) { R.setEventZ(map, event.id, lift); out.sidecar = true; }
        }
        out.placed.push({ event, lift, height: Number.isFinite(stand.height) && Number.isFinite(stand.ground) ? stand.height : null });
    }
    // The map's own mode and start: the two Note tags, and the sidecar's keys for them taken out so there is one place.
    const sidecarKey = key => {
        const battle = map.reactor3d && map.reactor3d.battle;
        if (!battle || battle[key] === undefined) return;
        delete battle[key];
        if (!Object.keys(battle).length) delete map.reactor3d.battle;
        out.sidecar = true;
    };
    if (order.mode) {
        const value = order.mode === 'game' ? null : order.mode;
        // Battle Setup's own writer where it has one that writes what the game reads; the plain tag otherwise.
        let note = null;
        if (typeof B.withMode === 'function') {
            const tried = B.withMode(map.note, value), tag = C.tagOf(tried, 'mode');
            if (value ? !!tag && C.modeNamed(tag.text) === value : !tag) note = tried;
        }
        map.note = note === null ? C.withTag(map.note, 'mode', value) : note;
        sidecarKey('mode');
        out.notes.push(value ? `set <battle mode: ${value}>` : 'this map\'s own battle mode taken out: it uses the game\'s');
    }
    let start = order.start;
    // The first unit on a map with none writes the start in force, so the Note says what will happen.
    if (start === undefined && out.placed.length && !hadUnits && !before.tag) start = before.kind === 'open' ? 'open' : before.kind === 'event' ? 0 : before.tiles;
    if (start !== undefined) {
        const wanted = C.startOf({ note: `<battle trigger: ${start}>`, events: [] });
        // Battle Setup's own writer where it writes this value as the game reads it; the plain tag otherwise.
        let note = null;
        if (typeof B.withTrigger === 'function') {
            const tried = B.withTrigger(map.note, start), read = C.startOf({ note: tried, events: [] });
            if (read.from === 'tag' && read.kind === wanted.kind && read.tiles === wanted.tiles) note = tried;
        }
        map.note = note === null ? C.withTag(map.note, 'trigger', start) : note;
        sidecarKey('trigger');
        out.notes.push(`set <battle trigger: ${start}>`);
    }
    if (order.lose) {
        map.note = C.withTag(map.note, 'lose', order.lose === 'continue' ? 'continue' : null);
        out.notes.push(order.lose === 'continue' ? 'set <battle lose: continue>' : 'the map\'s <battle lose: continue> taken out');
    }
    return out;
}

function writeAtomic(file, text) {
    const temp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, file);
}

/** Write the map as the editor saves one: MapNNN.json, its sidecar when that changed, and System's version so saves reload the map. */
function save(project, map, sidecarChanged) {
    const { RRJson } = validate.world();
    require(path.join(validate.APP, 'src', 'utils', 'DataLimits.js'));
    const stem = path.join(project, 'data', `Map${String(map.id).padStart(3, '0')}`), written = [];
    const data = { ...map };
    delete data.id; delete data.name; delete data.reactor3d;
    writeAtomic(stem + '.json', globalThis.RRMapJson.stringify(data));
    written.push(stem + '.json');
    if (sidecarChanged && map.reactor3d) {
        const E = require(path.join(validate.APP, 'src', 'utils', 'MapElevation.js'));
        writeAtomic(stem + '.r3d.json', E.stringifySidecar(map.reactor3d));
        written.push(stem + '.r3d.json');
    }
    const systemFile = path.join(project, 'data', 'System.json');
    const system = RRJson.read(fs, systemFile);
    system.versionId = Math.floor(Math.random() * 100000000);
    writeAtomic(systemFile, RRJson.stringify(system));
    return written;
}

module.exports = { manager, forget, place, save };

function usage(problem) {
    if (problem) console.error(problem);
    console.error('usage: place-unit.cjs <project> <mapId> --enemy 6 --at 86,53 [--face left] [--side ally] [--comes-back] [--mode firstPerson] [--start 6|open|0]');
    console.error('       also: --actor N, --at repeated, --z H, --move N, --name "Text", --lose continue|gameover, --check, --force');
    process.exit(2);
}

if (require.main === module) {
    const argv = process.argv.slice(2), plain = [], order = { unit: null, spots: [] };
    let record = '', id = 0, side = '', check = false;
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i], value = () => { if (i + 1 >= argv.length) usage(`${arg} needs a value`); return argv[++i]; };
        if (arg === '--enemy' || arg === '--actor') { record = arg.slice(2); id = Number(value()); if (!(id > 0)) usage(`${arg} takes a Database id`); }
        else if (arg === '--at') {
            const match = /^(-?\d+),(-?\d+)$/.exec(value());
            if (!match) usage('--at takes x,y');
            order.spots.push({ x: Number(match[1]), y: Number(match[2]) });
        } else if (arg === '--side') { side = SIDES[String(value()).toLowerCase()]; if (!side) usage('--side is enemy, ally or bystander'); }
        else if (arg === '--face') { order.face = FACES[String(value()).toLowerCase()]; if (!order.face) usage('--face is down, left, right or up'); }
        else if (arg === '--comes-back') order.returns = true;
        else if (arg === '--move') { order.move = Number(value()); if (!(order.move >= 1 && order.move <= 20)) usage('--move is 1 to 20'); }
        else if (arg === '--name') order.name = String(value());
        else if (arg === '--z') { order.z = Number(value()); if (!Number.isFinite(order.z)) usage('--z takes a height in tiles'); }
        else if (arg === '--mode') order.mode = String(value());
        else if (arg === '--start') order.start = String(value());
        else if (arg === '--lose') { order.lose = String(value()).toLowerCase(); if (order.lose !== 'continue' && order.lose !== 'gameover') usage('--lose is continue or gameover'); }
        else if (arg === '--check') check = true;
        else if (arg === '--force') order.force = true;
        else if (arg.startsWith('--')) usage(`unknown option ${arg}`);
        else plain.push(arg);
    }
    const [project, mapArg] = plain;
    if (!project || !(Number(mapArg) > 0) || plain.length > 2) usage();
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) usage(`not a project: ${project} (no data/System.json)`);
    const loaded = validate.world(), C = loaded.BattleCheck;
    if (order.mode !== undefined) {
        const named = order.mode.toLowerCase() === 'game' ? 'game' : C.MODES.find(mode => mode.toLowerCase() === order.mode.toLowerCase());
        if (!named) usage('--mode is classic, tactical, action, firstPerson or game');
        order.mode = named;
    }
    if (order.start !== undefined) {
        const read = C.startOf({ note: `<battle trigger: ${order.start}>`, events: [] });
        if (read.from !== 'tag') usage('--start is a distance in tiles from 1 to 50, open, or 0');
        order.start = /^open$/i.test(order.start) ? 'open' : Number(order.start);
    }
    if (record || side || order.spots.length) {
        if (!order.spots.length) usage('--at x,y says where the unit stands');
        if (!record && side !== 'neutral') usage('--enemy N or --actor N says which record the unit is');
        order.unit = { team: side || (record === 'actor' ? 'ally' : 'enemy'), record, id: record ? Math.floor(id) : 0 };
        if (order.returns && order.unit.team !== 'enemy') usage('--comes-back is for the enemy side');
    } else if (order.mode === undefined && order.start === undefined && !order.lose) usage('nothing to do');
    const db = validate.database(project), measured = loaded.Reactor3D ? validate.models(project, loaded) : null;
    let map = null;
    try {
        map = validate.readMap(project, Number(mapArg));
    } catch (error) {
        if (!error.unreadable) throw error;
        console.error(`Map ${mapArg}: ${error.message}`);
        process.exit(2);
    }
    if (!map) usage(`Map ${mapArg}: no such map in ${project}`);
    if (loaded.problem) console.log(`note: the 3D world could not be loaded (${loaded.problem}); on a 3D map where a unit stands is not checked`);
    const lookups = validate.lookups(project, db, loaded, map, measured);
    const done = place(map, order, { BattleCheck: C, BattleSetup: require(path.join(validate.APP, 'src', 'event', 'BattleSetup.js')), lookups });
    for (const refused of done.refused) console.log(refused.x === null ? `refused: ${refused.text}` : `refused (${refused.x}, ${refused.y}): ${refused.text}`);
    if (done.refused.length && !order.force) { console.log('nothing written'); process.exit(1); }
    for (const { event, height } of done.placed) {
        const unit = event.rrUnit, what = unit.record ? `${unit.record} ${unit.id}` : 'no record';
        // On a 3D map, the height it stands at: a tile of a house's wall is stood on at the top of the wall.
        const stands = height === null ? '' : `, standing at height ${Math.round(height * 100) / 100}`;
        console.log(`placed ${three(event.id)} ${event.name} at (${event.x}, ${event.y})${stands}, facing ${FACE_NAMES[order.face || 2]}: ${unit.team === 'neutral' ? 'bystander' : unit.team}, ${what}${unit.returns ? ', comes back' : ''}`);
    }
    for (const note of done.notes) console.log(note);
    if (check) console.log('--check: nothing written');
    else for (const file of save(project, map, done.sidecar)) console.log(`wrote ${file}`);
    const report = C.problems(map, lookups), info = (db.mapInfos || []).find(entry => entry && Number(entry.id) === Number(mapArg));
    console.log(`Map ${report.mapId} (${(info && info.name) || ''}) ${map.width}x${map.height}`);
    for (const line of validate.print(report)) console.log(`  ${line.mark.padEnd(4)} ${line.text}`);
    process.exit(0);
}
