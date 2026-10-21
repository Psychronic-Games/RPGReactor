#!/usr/bin/env node
/**
 * A map's battle, for a person or a generator to read before playing.
 *
 *   node editor/build-scripts/validate-battle.cjs <project> [mapId] [--json]
 *
 * One map, or every map of the project. Reports the battle mode in force and
 * where it is set, when the map starts its battle, the units by side (rows,
 * note tags and page comments, each named as what it is), the one sentence
 * Battle Setup shows, and what is wrong: a record the Database does not have,
 * a unit with no picture, an enemy whose picture on the map names a sheet
 * that is not in img/characters, a unit standing where nothing can stand (off the
 * map, on another event, on or inside a placed model; on a tile of a house's
 * wall, in deep water, on a roof or under a ceiling too low on a 3D map; a
 * tile nobody can walk onto on a 2D one), a big unit that does not fit, a
 * start that can never fire, a tag the game cannot read. A map or a Database
 * file that is not JSON is said and the run goes on. Exit 1 when anything is
 * wrong. `--json` prints the reports as JSON.
 *
 * What it reads:
 *
 *   A unit is an event in MapNNN.json with
 *     "rrUnit": { "team": "enemy" | "ally" | "neutral", "record": "enemy" | "actor", "id": 6,
 *                 "move": 5, "returns": true }          // move, returns: optional
 *   The map's Note holds its own mode and start:
 *     <battle mode: classic | tactical | action | firstPerson>     none: the game's mode
 *     <battle trigger: 6>      the battle starts when the party comes within 6 tiles (1 to 50) of an enemy
 *     <battle trigger: open>   it starts when the map opens
 *     <battle trigger: 0>      an event starts it (a Start Battle on Map command)
 *     <battle lose: continue>  the game goes on after a lost battle the map started
 *   No trigger tag is 6 tiles, unless an event on the map has Start Battle on Map.
 *
 * The same checker (src/utils/BattleCheck.js) writes Battle Setup's sentence;
 * place-unit.cjs places units by script.
 */
const fs = require('node:fs');
const path = require('node:path');

// The editor's own folder: editor/ in a source checkout, the app folder in a packaged editor.
const APP = path.resolve(__dirname, '..');
const source = (...parts) => path.join(APP, 'src', ...parts);

let shared = null;
/**
 * The checker, the editor's JSON reader, and the game's 3D world and physics
 * (the stand test and a model's body are the game's own). `problem` says why
 * the 3D world is not there, when it is not: 3D maps are then checked without it.
 */
function world() {
    if (shared) return shared;
    shared = { BattleCheck: require(source('utils', 'BattleCheck.js')), RRJson: require(source('utils', 'JsonFiles.js')), Reactor3D: null, ReactorPhysics: null, problem: '' };
    try {
        const runtime = require(source('legacy', 'EditorPaths.js')).runtime();
        global.self = global; global.window = global;
        require(path.join(runtime, 'libs', 'three.js'));
        const Reactor3D = require(path.join(runtime, 'reactor_3d.js'));
        global.Reactor3D = Reactor3D;
        const ReactorPhysics = require(path.join(runtime, 'reactor_physics.js'));
        // Nothing is drawn here: a model is read for its shape, never its textures.
        Reactor3D._loadGlbTexture = () => null;
        shared.Reactor3D = Reactor3D; shared.ReactorPhysics = ReactorPhysics;
    } catch (error) {
        shared.problem = error && error.message ? error.message : String(error);
    }
    return shared;
}

/** A data file's JSON; an error that names the file, and nothing of its bytes, when it is not JSON. */
function readJson(file) {
    try {
        return world().RRJson.read(fs, file);
    } catch (error) {
        const failed = new Error(`${path.basename(file)} cannot be read (not valid JSON)`);
        failed.unreadable = path.basename(file);
        throw failed;
    }
}

/**
 * The project's Database files the checker asks about; a missing file is
 * null, and so is one that cannot be read, which `unreadable` then names.
 */
function database(project) {
    const unreadable = [];
    const read = name => {
        const file = path.join(project, 'data', name);
        if (!fs.existsSync(file)) return null;
        try { return readJson(file); } catch (error) { unreadable.push(name); return null; }
    };
    return {
        system: read('System.json'), actors: read('Actors.json'), enemies: read('Enemies.json'), troops: read('Troops.json'),
        tilesets: read('Tilesets.json'), bindings: read('Database.r3d.json'), mapInfos: read('MapInfos.json'), unreadable
    };
}

const mapStem = (project, mapId) => path.join(project, 'data', `Map${String(mapId).padStart(3, '0')}`);

/**
 * A map with its id and its 3D sidecar (`map.reactor3d`), as the editor
 * holds one; null when the project has no such map. A file that is not a
 * map's JSON throws an error whose `unreadable` names it.
 */
function readMap(project, mapId) {
    const stem = mapStem(project, mapId);
    if (!fs.existsSync(stem + '.json')) return null;
    const map = readJson(stem + '.json');
    if (!map || typeof map !== 'object' || Array.isArray(map)) {
        const failed = new Error(`${path.basename(stem)}.json cannot be read (not a map)`);
        failed.unreadable = path.basename(stem) + '.json';
        throw failed;
    }
    map.id = Number(mapId);
    if (fs.existsSync(stem + '.r3d.json')) map.reactor3d = readJson(stem + '.r3d.json');
    return map;
}

function glbParts(bytes) {
    const buffer = new Uint8Array(bytes).buffer, view = new DataView(buffer);
    let offset = 12, json = null, bin = null;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), at = offset + 8;
        if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer, at, length)));
        else if (type === 0x004E4942) bin = new Uint8Array(buffer, at, length);
        offset = at + length;
    }
    return { json, bin };
}

/**
 * The project's models, measured as the game measures them
 * (`Reactor3D.blockedTilesFor` over a model's own mesh). `bodies(map, db)`
 * gives `(event, unit) => [[dx, dy], ...]`, the tiles a unit's model covers
 * round its event (null for an event with no model to measure); `props(map)`
 * gives `[[x, y, lift], ...]`, the tiles the map's placed models stand in a
 * walker's way on. A model file is read once per run.
 */
function models(project, loaded) {
    const R = loaded.Reactor3D, templates = new Map(), placed = new WeakMap();
    const templateOf = spec => {
        const key = [spec.name, spec.ext, spec.file].join('|');
        if (templates.has(key)) return templates.get(key);
        let made = null;
        try {
            const file = path.join(project, ...String(R.modelUrl(spec.name, spec.ext, spec.file)).split('/'));
            if (/\.glb$/i.test(file) && fs.existsSync(file)) {
                const parts = glbParts(fs.readFileSync(file));
                if (parts.json) made = { template: R.buildGlbTemplate(parts.json, parts.bin, '', null), json: parts.json };
            }
        } catch (error) {
            made = null;
        }
        templates.set(key, made);
        return made;
    };
    const props = map => {
        const list = map.reactor3d && Array.isArray(map.reactor3d.props) ? map.reactor3d.props : null;
        if (!list) return [];
        if (placed.has(list)) return placed.get(list);
        const tiles = [];
        for (const prop of R.mapProps(map)) {
            if (prop.passable) continue;
            const spec = R.normalizeModelSpec(R.propModelSpec(prop)), model = spec ? templateOf(spec) : null;
            // What its mesh covers, the tile it stands on, and what it closes in; a model whose file cannot be read here stands on its own tile.
            const covered = model ? R.blockedTilesFor(model.template, model.json, spec, prop.direction, prop.x, prop.y) : [];
            for (const tile of loaded.BattleCheck.modelTiles(covered, prop.x, prop.y)) tiles.push([tile[0], tile[1], prop.z]);
        }
        placed.set(list, tiles);
        return tiles;
    };
    const bodies = (map, db) => (event, unit) => {
        if (!R || !event) return null;
        // Its own model on the page that shows it, else the one the Database binds to its record.
        const own = map.reactor3d && map.reactor3d.events && map.reactor3d.events[String(event.id)];
        let raw = own ? (unit && unit.page > 0 ? own[String(unit.page - 1)] : own['0'] || Object.values(own).find(spec => spec && spec.name)) : null;
        if (!(raw && raw.name) && unit && unit.record && db.bindings) {
            const entry = (db.bindings[unit.record === 'actor' ? 'actors' : 'enemies'] || {})[String(unit.id)];
            raw = entry && unit.record === 'actor' ? R.actorEntrySlots(entry).character : entry;
        }
        const spec = raw && raw.name ? R.normalizeModelSpec(raw) : null;
        const model = spec ? templateOf(spec) : null;
        if (!model) return null;
        const page = (event.pages || [])[unit && unit.page > 0 ? unit.page - 1 : 0];
        const direction = Number(page && page.image && page.image.direction) || 2;
        return R.blockedTilesFor(model.template, model.json, spec, direction, 0, 0).map(tile => [tile.x, tile.y]);
    };
    return { bodies, props };
}

/** What `BattleCheck.problems` is given for a map of a project (`measured`: `models(project, loaded)`, or null without the 3D world). */
function lookups(project, db, loaded, map, measured) {
    return {
        system: db.system, actors: db.actors, enemies: db.enemies, troops: db.troops, tilesets: db.tilesets, bindings: db.bindings,
        Reactor3D: loaded.Reactor3D, ReactorPhysics: loaded.ReactorPhysics,
        body: loaded.Reactor3D && measured ? measured.bodies(map, db) : null,
        props: loaded.Reactor3D && measured ? () => measured.props(map) : null,
        // A picture may be stored encrypted (`.png_`).
        exists: relative => fs.existsSync(path.join(project, ...relative.split('/'))) || fs.existsSync(path.join(project, ...(relative + '_').split('/')))
    };
}

/**
 * One map of a project, checked: `{ map, report, name }`, or null when the
 * project has no such map. A map whose file cannot be read comes back as
 * `{ map: null, report: null, name, unreadable }` (the sentence that says
 * so). `context` is `{ loaded, db, measured }` from a run over several
 * maps; left out, it is made.
 */
function check(project, mapId, context = {}) {
    const loaded = context.loaded || world(), db = context.db || database(project);
    const measured = context.measured || (loaded.Reactor3D ? models(project, loaded) : null);
    const info = (Array.isArray(db.mapInfos) ? db.mapInfos : []).find(entry => entry && Number(entry.id) === Number(mapId));
    let map = null;
    try {
        map = readMap(project, mapId);
    } catch (error) {
        if (!error.unreadable) throw error;
        return { map: null, report: null, name: (info && info.name) || '', unreadable: error.message };
    }
    if (!map) return null;
    const asked = lookups(project, db, loaded, map, measured), report = loaded.BattleCheck.problems(map, asked);
    missingSheets(report, db, asked.exists);
    return { map, name: (info && info.name) || map.displayName || '', report };
}

/**
 * An enemy's picture on the map (its own `rrBattle.character`, else its
 * `<unit character:>` tag) that names a sheet the project does not have:
 * one line for each such enemy that is a unit of the map, something to fix.
 * The game then shows the enemy's next look (its battler picture, a figure).
 */
function missingSheets(report, db, exists) {
    const rule = require(source('utils', 'FightLook.js')), said = new Set();
    for (const unit of report.units) {
        if (unit.record !== 'enemy' || said.has(unit.id)) continue;
        const record = (Array.isArray(db.enemies) ? db.enemies : []).find(entry => entry && Number(entry.id) === Number(unit.id));
        const sheet = record ? rule.recordCharacter({ record: 'enemy', id: unit.id }, record) : null;
        if (!sheet || exists('img/characters/' + sheet.characterName + '.png')) continue;
        said.add(unit.id);
        report.lines.push({ key: 'validate.noSheet', level: 'fix', eventId: unit.eventId,
            text: `${record.name || 'Enemy ' + unit.id} (enemy ${unit.id}) names the character sheet "${sheet.characterName}" as its picture on the map: it is not in img/characters.` });
        report.ok = false;
    }
}

const MODE_NAMES = { classic: 'Classic', tactical: 'Tactical', action: 'Action', firstPerson: 'First Person' };
const SIDE_NAMES = { enemy: 'enemy', ally: 'ally', neutral: 'bystander' };
const three = id => String(id).padStart(3, '0');

/** A report as the lines this tool prints: `[{ mark: 'ok' | 'note' | 'FIX', text }]`. */
function print(report) {
    const out = [], say = (mark, text) => out.push({ mark, text });
    const mode = report.mode, start = report.start;
    const where = mode.from === 'map' ? (mode.tag ? `this map's own, ${mode.tag}` : 'this map\'s own, its sidecar') : mode.from === 'game' ? 'the game\'s mode' : 'no mode is set';
    say('ok', `Battle mode: ${MODE_NAMES[mode.mode]} (${where})`);
    const starter = start.starters[0] ? `${start.starters[0].name} (${three(start.starters[0].eventId)}) has Start Battle on Map` : '';
    const why = start.from === 'tag' ? start.tag : start.from === 'sidecar' ? 'its sidecar' : start.from === 'events' ? `no tag; ${starter}` : 'no tag';
    const when = start.kind === 'open' ? 'when the map opens' : start.kind === 'event' ? 'when an event says so' : `when the party comes within ${start.tiles} tile(s) of an enemy`;
    say('ok', `Starts: ${when} (${why})${start.lose === 'continue' ? '; the game goes on after a loss' : ''}`);
    const tally = side => {
        const all = report.count[side], rows = report.rows[side];
        return `${all}${all === rows ? '' : rows ? ` (${rows} placed as rows, ${all - rows} tag units)` : ' (tag units)'}`;
    };
    say('ok', `Units: enemies ${tally('enemy')}, allies ${tally('ally')}, bystanders ${tally('neutral')}`);
    for (const unit of report.units) {
        const what = unit.record ? `${unit.record} ${unit.id}${unit.recordName ? ' ' + unit.recordName : ''}` : 'no record';
        const from = unit.source === 'row' ? 'row' : unit.source === 'note' ? 'a note tag' : unit.source === 'ptbs' ? `a PTBS comment on page ${unit.page}` : `a comment on page ${unit.page}`;
        const size = unit.body.count > 1 ? `, covers ${unit.body.count} tiles (${unit.body.w} by ${unit.body.h})` : '';
        const look = unit.look === 'figure' ? ', a plain figure' : '';
        const waits = unit.waits ? ', waits for a page condition' : '';
        say('ok', `  ${three(unit.eventId)} ${unit.name} at (${unit.x}, ${unit.y}): ${SIDE_NAMES[unit.team]}, ${what}, from ${from}${unit.returns ? ', comes back' : ''}${waits}${size}${look}`);
    }
    say(report.sentence.level === 'warn' ? 'FIX' : 'ok', report.sentence.text);
    for (const line of report.lines) {
        const at = Number.isFinite(line.x) && ['battleCheck.noStand', 'battleCheck.noFit', 'battleCheck.onStart'].includes(line.key) ? ` (${line.x}, ${line.y})` : '';
        say(line.level === 'fix' ? 'FIX' : 'note', line.text + (line.whyText && line.why !== 'fit' ? ' ' + line.whyText : '') + at);
    }
    for (const name of report.skipped) {
        if (name === 'stand') say('note', report.is3D ? 'where units stand was not checked: the 3D world could not be loaded' : 'where units stand was not checked: the map\'s tileset is not in Tilesets.json');
    }
    return out;
}

/** Whether a map has anything to do with battles: units, a start, a tag. */
const concerns = report => report.units.length > 0 || report.start.starters.length > 0 || !!report.mode.tag || !!report.start.tag || report.lines.length > 0;

module.exports = { APP, world, database, readMap, models, lookups, check, missingSheets, print, concerns };

if (require.main === module) {
    const args = process.argv.slice(2), json = args.includes('--json');
    const [project, mapArg] = args.filter(arg => !arg.startsWith('--'));
    if (!project || (mapArg !== undefined && !(Number(mapArg) > 0))) { console.error('usage: validate-battle.cjs <project> [mapId] [--json]'); process.exit(2); }
    if (!fs.existsSync(path.join(project, 'data', 'System.json'))) { console.error(`not a project: ${project} (no data/System.json)`); process.exit(2); }
    const loaded = world(), db = database(project);
    const context = { loaded, db, measured: loaded.Reactor3D ? models(project, loaded) : null };
    const ids = mapArg !== undefined ? [Number(mapArg)]
        : fs.readdirSync(path.join(project, 'data')).map(name => /^Map(\d+)\.json$/.exec(name)).filter(Boolean).map(match => Number(match[1])).sort((a, b) => a - b);
    const results = [];
    let wrong = 0, quiet = 0;
    for (const id of ids) {
        const result = check(project, id, context);
        if (!result) { console.error(`Map ${id}: no such map in ${project}`); process.exit(2); }
        results.push(Object.assign(result, { id }));
        if (result.unreadable || !result.report.ok) wrong++;
    }
    // A Database file that cannot be read leaves its checks out: said, and counted as wrong.
    const lost = db.unreadable.map(name => `data/${name} cannot be read (not valid JSON)`);
    if (json) {
        for (const text of lost) console.error(text);
        console.log(JSON.stringify(results.map(result => (result.unreadable
            ? { mapId: result.id, name: result.name, unreadable: result.unreadable, ok: false }
            : Object.assign({ name: result.name, width: result.map.width, height: result.map.height }, result.report))), null, 1));
        process.exit(wrong || lost.length ? 1 : 0);
    }
    if (loaded.problem) console.log(`note: the 3D world could not be loaded (${loaded.problem})`);
    for (const text of lost) console.log(`FIX  ${text}`);
    for (const result of results) {
        if (result.unreadable) {
            console.log(`Map ${result.id} (${result.name})`);
            console.log(`  FIX  ${result.unreadable}`);
            continue;
        }
        // A run over the whole project lists only the maps that have to do with battles.
        if (mapArg === undefined && !concerns(result.report)) { quiet++; continue; }
        console.log(`Map ${result.report.mapId} (${result.name}) ${result.map.width}x${result.map.height}`);
        for (const line of print(result.report)) console.log(`  ${line.mark.padEnd(4)} ${line.text}`);
    }
    if (mapArg === undefined) console.log(`${results.length} map(s) checked, ${quiet} with no units and no battle start; ${wrong ? wrong + ' with something to fix' : 'nothing to fix'}`);
    process.exit(wrong || lost.length ? 1 : 0);
}
