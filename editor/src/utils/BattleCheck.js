/**
 * BattleCheck - what a map's battle is, and what is wrong with it.
 *
 * One reading of a map, for Battle Setup's sentence and for
 * build-scripts/validate-battle.cjs: the battle mode in force and where it
 * is set, when the map starts its battle, the units by side (rows, note
 * tags, page comments and PTBS comments, each named as what it is), and
 * what is wrong: a record the Database does not have, a unit with no
 * picture, a unit standing where nothing can stand, a big unit that does
 * not fit, a start that can never fire, a tag the game cannot read.
 *
 *   RRBattleCheck.problems(map, lookups) -> report
 *
 * `map` is the map's JSON with its `id`, and its 3D sidecar as
 * `map.reactor3d` when it has one. `lookups` holds what the caller has:
 * `system`, `actors`, `enemies`, `tilesets` (the Database), `bindings`
 * (Database.r3d.json), `troops` (for a Start Battle on Map that names one),
 * `Reactor3D` and `ReactorPhysics` (the game's 3D world and physics; the
 * globals of those names when not given), `body(event, unit)` (the tiles a
 * model covers round its event), `props(map)` (the tiles the map's placed
 * models stand in the way on: `modelTiles` of each), `lookOf(event, unit)`
 * and `exists(relativePath)`. A check that lacks what it needs is left out
 * and named in `report.skipped`.
 *
 * Every sentence is a key of `MESSAGES` with its values (`{ key, args,
 * text }`): `text` is the English, `say(item, t)` any other language.
 * No DOM, no file access.
 */
(function(root) {
    'use strict';

    const MODES = ['classic', 'tactical', 'action', 'firstPerson'];
    const ON_MAP = ['tactical', 'action', 'firstPerson'];
    const TEAMS = ['enemy', 'ally', 'neutral'];
    const LOOKS = ['own', 'model', 'character', 'battler', 'figure'];
    // Tiles: the start distance of a map with no tag, and how far round the party a battle takes units where the start is `open` or `0`.
    const DISTANCE = 6;
    const DISTANCE_MAX = 50;
    // The enemies a Classic battle shows.
    const CLASSIC_CAP = 8;
    // How far above or below its own height a unit's place to stand may be, in tiles: a step.
    const STEP = 0.75;
    const EVENT_SIZE_MAX = 64;

    const MESSAGES = {
        'battleCheck.none': 'No enemies yet. Click one above, then click the map.',
        'battleCheck.near': 'Enemies: {count}. Walk within {tiles} tiles of one and the battle starts.',
        'battleCheck.nearOne': 'Enemies: {count}. Walk next to one and the battle starts.',
        'battleCheck.open': 'Enemies: {count}. The battle starts when the party enters this map.',
        'battleCheck.event': 'Enemies: {count}. They wait for an event: {name} ({id}).',
        'battleCheck.noStarter': 'Enemies: {count}. No event starts a battle yet: add Start Battle on Map to one.',
        'battleCheck.noPicture': '{name} has no picture: it stands as a plain figure.',
        'battleCheck.noParty': 'Nobody is in the party.',
        'battleCheck.noStand': '{name} ({id}) stands where nothing can stand.',
        'battleCheck.noFit': '{name} ({id}) does not fit where it stands.',
        'battleCheck.classicCap': 'A Classic battle takes the 8 nearest.',
        'battleCheck.noEnemyRecord': '{name} ({id}) is enemy {record}, which is not in the Database.',
        'battleCheck.noActorRecord': '{name} ({id}) is actor {record}, which is not in the Database.',
        'battleCheck.badRow': '{name} ({id}) has an In battle row the game cannot read.',
        'battleCheck.badMode': 'The battle mode tag says "{text}": the game reads classic, tactical, action or firstPerson.',
        'battleCheck.badTrigger': 'The battle trigger tag says "{text}": the game reads a number of tiles from 1 to 50, open or 0.',
        'battleCheck.emptyStart': '{name} ({id}) starts a battle no enemy would be in. Place some with Battle Setup, or pick a troop.',
        'battleCheck.classicTags': 'On a Classic map only enemies placed as rows start a battle: {count} here are tag units.',
        'battleCheck.firstPerson2D': 'First Person plays as Action on a 2D map.',
        'battleCheck.waiting': 'Enemies that stand here only when their page\'s conditions are met: {count}.',
        'battleCheck.onStart': '{name} ({id}) stands on the tile the party starts on.',
        'battleCheck.why.roof': 'Nothing can stand on this roof.',
        'battleCheck.why.water': 'Too deep to stand.',
        'battleCheck.why.wall': 'Inside a wall.',
        'battleCheck.why.taken': 'Something is already here.',
        'battleCheck.why.fit': '{name} does not fit here.',
        'battleCheck.why.offMap': 'Off the map.',
        'battleCheck.why.tile': 'Nobody can walk onto this tile.',
        'battleCheck.why.steep': 'Too steep to stand.',
        'battleCheck.why.nothing': 'Nothing to stand on here.',
        'battleCheck.why.low': 'Not enough room to stand up.',
        'battleCheck.fix.picture': 'Give it one',
        'battleCheck.fix.party': 'Starting Party',
        'battleCheck.fix.show': 'Show'
    };

    const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const fill = (text, args) => String(text).replace(/\{(\w+)\}/g, (token, key) => (args && has(args, key) ? String(args[key]) : token));
    const item = (key, args, more) => Object.assign({ key, args: args || {}, text: fill(MESSAGES[key], args) }, more);
    const pad = id => String(id).padStart(3, '0');
    const int = value => Math.floor(Number(value) || 0);
    const recordOf = (list, id) => (Array.isArray(list) ? list.find(entry => entry && Number(entry.id) === Number(id)) : null) || null;
    const world = lookups => (lookups && lookups.Reactor3D) || (typeof root.Reactor3D !== 'undefined' ? root.Reactor3D : null) || null;
    const physics = lookups => (lookups && lookups.ReactorPhysics) || (typeof root.ReactorPhysics !== 'undefined' ? root.ReactorPhysics : null) || null;

    /** An item's sentence through a translator `t(key, args)`; the English without one, or where it has no such key. */
    function say(entry, t) {
        if (!entry) return '';
        if (typeof t === 'function') {
            const told = t(entry.key, entry.args || {});
            if (told && told !== entry.key) return told;
        }
        return fill(MESSAGES[entry.key] || entry.key, entry.args);
    }

    //-------------------------------------------------------------------------
    // Units, as the game reads them (ReactorFight.unitSpecOf).

    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !TEAMS.includes(raw.team)) return null;
        const record = raw.record === 'actor' || raw.record === 'enemy' ? raw.record : '';
        const id = record ? Math.max(0, int(raw.id)) : 0;
        if (raw.team !== 'neutral' && !(record && id > 0)) return null;
        return { team: raw.team, record: record && id > 0 ? record : '', id: record && id > 0 ? id : 0, move: Math.max(0, Math.min(20, int(raw.move))) };
    }

    /** `enemy 5`, `actor 3`, `ally 2` (actor 2 on the allies' side), `ally enemy 4`, `neutral`, with an optional `move N`. */
    function parseUnitText(text) {
        const words = String(text || '').toLowerCase().replace(/[,:]/g, ' ').split(/\s+/).filter(Boolean);
        const raw = { team: '', record: '', id: 0, move: 0 };
        for (let i = 0; i < words.length; i++) {
            const word = words[i], next = Number(words[i + 1]);
            if (word === 'move' && Number.isFinite(next)) { raw.move = next; i++; continue; }
            if (word === 'actor' || word === 'enemy' || word === 'ally') {
                if (Number.isFinite(next) && next > 0) {
                    raw.record = word === 'enemy' ? 'enemy' : 'actor';
                    raw.id = Math.floor(next);
                    if (!raw.team) raw.team = word === 'enemy' ? 'enemy' : 'ally';
                    i++;
                } else if (word !== 'actor') raw.team = word;
                continue;
            }
            if (word === 'neutral') raw.team = 'neutral';
        }
        return raw.team ? normalize(raw) : null;
    }

    const UNIT_TAG = /<unit\s*:\s*([^>]+)>/i;
    const commentsOf = page => ((page && page.list) || []).filter(command => command && (command.code === 108 || command.code === 408))
        .map(command => String((command.parameters && command.parameters[0]) || ''));

    /** The unit a page's comments name: a `<unit: …>` comment, else a PTBS comment. */
    function pageUnit(page) {
        const texts = commentsOf(page);
        for (const text of texts) {
            const tag = UNIT_TAG.exec(text);
            if (tag) { const unit = parseUnitText(tag[1]); return unit ? Object.assign(unit, { source: 'comment' }) : null; }
        }
        for (const text of texts) {
            let match = /PTBS_(?:Party)?Actor:\s*(\d+)/i.exec(text);
            if (match) { const unit = normalize({ team: 'ally', record: 'actor', id: Number(match[1]) }); return unit ? Object.assign(unit, { source: 'ptbs' }) : null; }
            match = /PTBS_Enemy:\s*(\d+)/i.exec(text);
            if (match) { const unit = normalize({ team: 'enemy', record: 'enemy', id: Number(match[1]) }); return unit ? Object.assign(unit, { source: 'ptbs' }) : null; }
        }
        return null;
    }

    /**
     * The unit an event is: `{ team, record, id, move, returns, source, page }`,
     * or null. `source` says what makes it one: `row` (its In battle row),
     * `note` (a `<unit: …>` note tag), `comment` (a `<unit: …>` comment on
     * page `page`, counted from 1) or `ptbs` (a PTBS comment there).
     */
    function unitOf(event) {
        if (!event) return null;
        if (event.rrUnit) {
            const unit = normalize(event.rrUnit);
            return unit ? Object.assign(unit, { returns: unit.team === 'enemy' && event.rrUnit.returns === true, source: 'row', page: 0 }) : null;
        }
        const note = UNIT_TAG.exec(String(event.note || ''));
        if (note) {
            const unit = parseUnitText(note[1]);
            return unit ? Object.assign(unit, { returns: false, source: 'note', page: 0 }) : null;
        }
        const pages = event.pages || [];
        for (let i = 0; i < pages.length; i++) {
            const unit = pageUnit(pages[i]);
            if (unit) return Object.assign(unit, { returns: false, page: i + 1 });
        }
        return null;
    }

    /** Whether an event carries an In battle row the game reads as no unit (a side with no record, a side it does not know). */
    const rowProblem = event => !!(event && event.rrUnit && !normalize(event.rrUnit));

    const isCommand = (command, name) => !!command && command.code === 357 && Array.isArray(command.parameters)
        && command.parameters[0] === 'RPGReactor' && command.parameters[1] === name;
    /** Every command of that name on a map, as `{ event, page, pageIndex, args }`. */
    function commandsOf(map, name) {
        const found = [];
        for (const event of (map && map.events) || []) {
            if (!event) continue;
            (event.pages || []).forEach((page, pageIndex) => {
                for (const command of (page && page.list) || []) {
                    if (isCommand(command, name)) found.push({ event, page, pageIndex, args: (command.parameters[3] && typeof command.parameters[3] === 'object' ? command.parameters[3] : {}) });
                }
            });
        }
        return found;
    }

    /** The events that have a Start Battle on Map command, in id order. */
    function starters(map) {
        const seen = new Set(), list = [];
        for (const found of commandsOf(map, 'StartMapBattle')) if (!seen.has(found.event)) { seen.add(found.event); list.push(found.event); }
        return list.sort((a, b) => a.id - b.id);
    }

    //-------------------------------------------------------------------------
    // The map's own mode and start: its two Note tags.

    const tagPattern = (name, flags) => new RegExp('<battle\\s*' + name + '\\s*:([^>]*)>', flags);
    function tagOf(note, name) {
        const match = tagPattern(name, 'i').exec(String(note || ''));
        return match ? { text: match[1].trim(), tag: match[0] } : null;
    }

    /** The note with `<battle name: value>` set, every other line kept; a null value takes the tag (and a line it stood alone on) out. */
    function withTag(note, name, value) {
        const source = String(note || '');
        if (value === null || value === undefined || value === '') {
            return source.split('\n').map(line => {
                if (!tagPattern(name, 'i').test(line)) return line;
                const rest = line.replace(tagPattern(name, 'gi'), '');
                return rest.trim() === '' ? null : rest;
            }).filter(line => line !== null).join('\n');
        }
        const tag = `<battle ${name}: ${value}>`;
        if (tagPattern(name, 'i').test(source)) {
            let first = true;
            return source.replace(tagPattern(name, 'gi'), () => { if (!first) return ''; first = false; return tag; });
        }
        return source + (source && !source.endsWith('\n') ? '\n' : '') + tag;
    }

    const modeNamed = text => MODES.find(mode => mode.toLowerCase() === String(text || '').trim().toLowerCase()) || '';

    function is3D(map, lookups) {
        const R = world(lookups);
        if (R && typeof R.isMap3D === 'function') { try { return !!R.isMap3D(map); } catch (error) { /* read from the data below */ } }
        const side = map && map.reactor3d, noted = !!map && /<3d>/i.test(String(map.note || ''));
        return noted && !(side && typeof side.mode === 'string' && side.mode !== '3d');
    }

    /**
     * The battle mode in force on a map and where it is set: `from` is `map`
     * (its `<battle mode: x>` tag, read in any letter case, else its sidecar),
     * `game` (System) or `default` (nothing names one: Classic). `playsAs` is
     * what the player gets (First Person is Action on a 2D map); `unreadable`
     * the text of a tag the game cannot read.
     */
    function modeOf(map, lookups = {}) {
        const found = tagOf(map && map.note, 'mode');
        const own = found ? modeNamed(found.text) : '';
        const side = map && map.reactor3d && map.reactor3d.battle;
        const sidecar = !found && side && MODES.includes(side.mode) ? side.mode : '';
        const settings = lookups.system && lookups.system.reactorBattle;
        const game = settings && MODES.includes(settings.mode) ? settings.mode : '';
        const mode = own || sidecar || game || 'classic';
        return {
            mode, from: own || sidecar ? 'map' : game ? 'game' : 'default', game: game || 'classic',
            playsAs: mode === 'firstPerson' && !is3D(map, lookups) ? 'action' : mode,
            tag: found ? found.tag : '', unreadable: found && !own ? found.text : ''
        };
    }

    function readStart(text) {
        const value = String(text === undefined || text === null ? '' : text).trim();
        if (/^open$/i.test(value)) return { kind: 'open', tiles: DISTANCE };
        if (!/^\d+$/.test(value)) return null;
        const tiles = Number(value);
        if (tiles === 0) return { kind: 'event', tiles: DISTANCE };
        return tiles <= DISTANCE_MAX ? { kind: 'near', tiles } : null;
    }

    /**
     * When a map starts its battle: `kind` is `near` (the party within
     * `tiles` of an enemy), `open` (the map opens) or `event` (an event says
     * so); `from` what says so: the `<battle trigger: …>` `tag`, the
     * `sidecar`, the map's `events` (no tag, and one has Start Battle on
     * Map) or the `default` (no tag: 6 tiles). `tiles` is also how far round
     * the party a battle takes units. `lose` is `continue` where the Note
     * says `<battle lose: continue>`.
     */
    function startOf(map) {
        const found = tagOf(map && map.note, 'trigger');
        const list = starters(map).map(event => ({ eventId: event.id, name: event.name || '' }));
        const loss = tagOf(map && map.note, 'lose');
        const out = { kind: 'near', tiles: DISTANCE, from: 'default', tag: found ? found.tag : '', unreadable: '', starters: list, lose: loss && /^continue$/i.test(loss.text) ? 'continue' : 'gameover' };
        let read = found ? readStart(found.text) : null;
        if (read) out.from = 'tag';
        else if (found) out.unreadable = found.text;
        if (!read && !found) {
            const side = map && map.reactor3d && map.reactor3d.battle;
            read = side && side.trigger !== undefined ? readStart(side.trigger) : null;
            if (read) out.from = 'sidecar';
        }
        if (!read && list.length) { read = { kind: 'event', tiles: DISTANCE }; out.from = 'events'; }
        if (read) { out.kind = read.kind; out.tiles = read.tiles; }
        return out;
    }

    //-------------------------------------------------------------------------
    // Looks (SPEC 2.14: never nothing; the last answer is a plain figure).

    /**
     * What a unit stands as: `own` (the event's picture or model), `model`
     * (the model the Database binds to its record), `character` (an actor's
     * character graphic, an enemy's own picture or `<unit character: …>`), `battler` (an
     * enemy's battler picture) or `figure` (a plain figure in its side's
     * color: it has no look of its own).
     */
    function lookOf(map, event, unit, lookups = {}) {
        if (typeof lookups.lookOf === 'function') {
            const told = lookups.lookOf(event, unit), kind = told && typeof told === 'object' ? told.kind : told;
            if (LOOKS.includes(kind)) return kind;
        }
        const pages = (event && event.pages) || [];
        const models = map && map.reactor3d && map.reactor3d.events && event ? map.reactor3d.events[String(event.id)] : null;
        const shown = unit && unit.page > 0 ? [unit.page - 1] : pages.map((page, index) => index);
        for (const index of shown) {
            const image = pages[index] && pages[index].image;
            if (image && (image.characterName || image.tileId > 0)) return 'own';
            if (models && models[String(index)] && models[String(index)].name) return 'own';
        }
        if (event && /<\s*r3d\s*>/i.test(String(event.note || ''))) return 'own';
        if (!unit || !unit.record) return 'figure';
        const bound = lookups.bindings && lookups.bindings[unit.record === 'actor' ? 'actors' : 'enemies'];
        const entry = bound ? bound[String(unit.id)] : null;
        const spec = entry && (unit.record === 'actor' ? (entry.character || entry) : entry);
        if (spec && spec.name) return 'model';
        const record = recordOf(unit.record === 'actor' ? lookups.actors : lookups.enemies, unit.id);
        if (!record) return 'figure';
        if (unit.record === 'actor') return record.characterName ? 'character' : 'figure';
        // The game's own rule (FightLook.js): the enemy's own setting (`rrBattle.character`), else its `<unit character:>` tag.
        const rule = root.ReactorFightLook || (typeof module !== 'undefined' && module.exports ? require('./FightLook.js') : null);
        const sheet = rule ? rule.recordCharacter(unit, record) : null;
        // A sheet that is not in img/characters is no picture, as in the game: the next look stands.
        if (sheet ? typeof lookups.exists !== 'function' || lookups.exists('img/characters/' + sheet.characterName + '.png')
            : !rule && /<unit\s*character\s*:\s*[^>,\s][^>]*>/i.test(String(record.note || ''))) return 'character';
        if (record.battlerName) {
            const folder = lookups.system && lookups.system.optSideView ? 'img/sv_enemies/' : 'img/enemies/';
            if (typeof lookups.exists !== 'function' || lookups.exists(folder + record.battlerName + '.png')) return 'battler';
        }
        return 'figure';
    }

    //-------------------------------------------------------------------------
    // Bodies: the tiles a unit covers round its own.

    const ONE = Object.freeze({ ox: 0, oy: 0, w: 1, h: 1, cells: null, count: 1 });
    const sizeNumber = value => Math.max(1, Math.min(EVENT_SIZE_MAX, Math.floor(Number(value)) || 1));
    const rectShape = (ox, oy, w, h) => ({ ox, oy, w, h, cells: null, count: w * h });
    const shapeHas = (shape, dx, dy) => {
        const i = dx - shape.ox, j = dy - shape.oy;
        return i >= 0 && j >= 0 && i < shape.w && j < shape.h && (!shape.cells || shape.cells[j * shape.w + i] === 1);
    };

    /** A list of tiles round an event (`[dx, dy]` or `{ x, y }`), or a shape, as a shape that covers the event's own tile. */
    function toShape(given) {
        if (!given) return null;
        if (!Array.isArray(given)) {
            if (!(given.w >= 1 && given.h >= 1)) return null;
            if (given.w === 1 && given.h === 1) return ONE;
            let count = given.w * given.h;
            if (given.cells) { count = 0; for (let i = 0; i < given.cells.length; i++) if (given.cells[i]) count++; }
            return { ox: int(given.ox), oy: int(given.oy), w: given.w, h: given.h, cells: given.cells || null, count };
        }
        const tiles = given.map(tile => (Array.isArray(tile) ? [int(tile[0]), int(tile[1])] : [int(tile.x), int(tile.y)])).concat([[0, 0]]);
        let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
        for (const [x, y] of tiles) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        if (w === 1 && h === 1) return ONE;
        const cells = new Uint8Array(w * h);
        for (const [x, y] of tiles) cells[(y - y0) * w + (x - x0)] = 1;
        let count = 0;
        for (let i = 0; i < cells.length; i++) count += cells[i];
        return { ox: x0, oy: y0, w, h, cells: count < w * h ? cells : null, count };
    }

    /**
     * The tiles an event's body covers, as `{ ox, oy, w, h, cells, count }`
     * (the shape `Reactor3D.eventBody` gives in the game): a size typed on
     * the event, else what `lookups.body` measures from its model, else the
     * size the editor measured (`reactor3d.eventSizeAuto`), else its own tile.
     */
    function bodyOf(map, event, unit, lookups = {}) {
        const side = map && map.reactor3d, key = event ? String(event.id) : '';
        const typed = side && side.eventSize ? side.eventSize[key] : null;
        if (Array.isArray(typed)) {
            const w = sizeNumber(typed[0]), h = sizeNumber(typed[1]);
            if (w > 1 || h > 1) {
                const centered = side.eventSizeAnchor === 'center';
                return rectShape(centered ? 0 - Math.floor((w - 1) / 2) : 0, centered ? 0 - Math.floor((h - 1) / 2) : 0, w, h);
            }
        }
        if (typeof lookups.body === 'function') {
            let measured = null;
            try { measured = toShape(lookups.body(event, unit)); } catch (error) { measured = null; }
            if (measured) return measured;
        }
        const auto = side && side.eventSizeAuto ? side.eventSizeAuto[key] : null;
        if (Array.isArray(auto)) {
            const w = sizeNumber(auto[0]), h = sizeNumber(auto[1]);
            if (w > 1 || h > 1) return rectShape(Math.max(1 - w, Math.min(0, int(auto[2]))), Math.max(1 - h, Math.min(0, int(auto[3]))), w, h);
        }
        return ONE;
    }

    /** Whether an event is in a walker's way: some page of it stands level with characters and is not passed through. */
    const blocks = event => ((event && event.pages) || []).some(page => page && page.priorityType === 1 && !page.through);

    /**
     * The tiles one placed model is in the way on, as `[[x, y], ...]`: the
     * tiles its body covers (`[{ x, y }]` or `[[x, y]]`, as the game
     * measures them), the tile it stands on (`x`, `y` as placed, between
     * tiles or not), and every tile its body closes in, which no walker can
     * reach (the inside of a hollow trunk).
     */
    function modelTiles(tiles, x, y) {
        const list = (tiles || []).map(tile => (Array.isArray(tile) ? [int(tile[0]), int(tile[1])] : [int(tile.x), int(tile.y)]));
        if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) list.push([Math.round(Number(x)), Math.round(Number(y))]);
        if (!list.length) return list;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [tx, ty] of list) { x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty); }
        // A frame one tile wider than the body: 1 a tile it covers, 2 a tile a walker reaches from outside it.
        const w = x1 - x0 + 3, h = y1 - y0 + 3, cells = new Uint8Array(w * h);
        for (const [tx, ty] of list) cells[(ty - y0 + 1) * w + (tx - x0 + 1)] = 1;
        const open = [0];
        cells[0] = 2;
        while (open.length) {
            const at = open.pop(), i = at % w, j = (at - i) / w;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ni = i + di, nj = j + dj;
                if (ni < 0 || nj < 0 || ni >= w || nj >= h || cells[nj * w + ni]) continue;
                cells[nj * w + ni] = 2;
                open.push(nj * w + ni);
            }
        }
        const out = [];
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (cells[j * w + i] !== 2) out.push([x0 + i - 1, y0 + j - 1]);
        return out;
    }

    /** The placed models of a map that stand in a walker's way, as its sidecar lists them. */
    const solidProps = map => ((map && map.reactor3d && Array.isArray(map.reactor3d.props) && map.reactor3d.props) || [])
        .filter(prop => prop && prop.name && prop.passable !== true && prop.passable !== 'true');

    /**
     * Who is on which tile: `Map(y * width + x -> [{ id, own, blocks, lift }])`.
     * `own` marks an event's own tile; `blocks` a tile of a body that is in
     * the way. A placed model (a tree, a cart) is in the way on the tile it
     * stands on and on the tiles `lookups.props(map)` measured for it
     * (`[x, y, lift]`; `modelTiles` makes one model's list); its entry
     * carries its `lift` off the ground, so what hangs high over a unit is
     * not in its way. Built once for a report; `standing` builds its own
     * without one.
     */
    function occupancy(map, lookups = {}) {
        const taken = new Map(), width = map.width, height = map.height;
        const put = (x, y, entry) => {
            if (!(x >= 0 && y >= 0 && x < width && y < height)) return;
            const key = y * width + x, list = taken.get(key);
            if (list) list.push(entry); else taken.set(key, [entry]);
        };
        for (const event of map.events || []) {
            if (!event) continue;
            const solid = blocks(event);
            put(event.x, event.y, { id: event.id, own: true, blocks: solid });
            if (!solid) continue;
            const shape = bodyOf(map, event, unitOf(event), lookups);
            if (shape.count <= 1) continue;
            for (let j = 0; j < shape.h; j++) for (let i = 0; i < shape.w; i++) {
                const dx = shape.ox + i, dy = shape.oy + j;
                if ((dx || dy) && shapeHas(shape, dx, dy)) put(event.x + dx, event.y + dy, { id: event.id, own: false, blocks: true });
            }
        }
        let models = null;
        if (typeof lookups.props === 'function') { try { models = lookups.props(map); } catch (error) { models = null; } }
        // The tile a model stands on is taken whatever was measured of it: its trunk may be hollow there.
        const stood = solidProps(map).map(prop => [Math.round(Number(prop.x) || 0), Math.round(Number(prop.y) || 0), Number(prop.z) || 0]);
        for (const tile of (Array.isArray(models) ? models.concat(stood) : stood)) put(tile[0], tile[1], { id: 0, own: false, blocks: true, lift: Number(tile[2]) || 0 });
        return taken;
    }

    //-------------------------------------------------------------------------
    // Where a body can stand.

    /** Whether a character can walk onto a tile from some side, by the tileset's passage flags (the game's `checkPassage`). */
    function tileOpen(map, lookups, x, y, deep) {
        const tileset = recordOf(lookups && lookups.tilesets, map.tilesetId), flags = tileset && tileset.flags;
        if (!Array.isArray(flags) || !Array.isArray(map.data)) return true;
        const size = map.width * map.height, at = y * map.width + x, tiles = [];
        for (let z = 3; z >= 0; z--) { const tile = map.data[z * size + at] || 0; if (tile > 0) tiles.push(tile); }
        // On a 3D map with a room, a tile with nothing solid on it is the room's floor.
        if (deep && map.reactor3d && map.reactor3d.room && typeof map.reactor3d.room === 'object' && !tiles.some(tile => (flags[tile] & 0x10) === 0)) return true;
        for (const bit of [1, 2, 4, 8]) {
            for (const tile of tiles) {
                const flag = flags[tile];
                if ((flag & 0x10) !== 0) continue;
                if ((flag & bit) === 0) return true;
                if ((flag & bit) === bit) break;
            }
        }
        return false;
    }

    const refusal = (why, args) => ({ ok: false, why, whyKey: 'battleCheck.why.' + why, whyArgs: args || {}, whyText: fill(MESSAGES['battleCheck.why.' + why], args) });

    // The pieces that are a house's wall: a storey high, and nobody is stood on the top of one.
    const WALL_KINDS = { wall: true, window: true };
    // What a tile's floor is made of: the ground, or a piece laid to be walked on.
    const FLOOR_KINDS = { ground: true, rock: true, floor: true, stair: true, ramp: true, wedge: true };

    /**
     * The pieces of a 3D map on a cell, each with its `foot` and `head`
     * (world heights over the cell's middle); `base` on the list is the
     * ground they stand on.
     */
    function stackAt(R, map, x, y) {
        const stack = R.piecesAt && R.hasPieces && R.hasPieces(map) ? R.piecesAt(map, x, y) : null;
        const base = stack && R.pieceBaseAt ? R.pieceBaseAt(map, x, y) || 0 : null;
        const list = (stack || []).filter(Boolean).map(piece => {
            const foot = base + (Number(piece.z) || 0);
            const head = R.pieceTop ? base + R.pieceTop(piece, 0.5, 0.5) : foot;
            return { kind: piece.kind, foot, head: Number.isFinite(head) ? head : foot };
        });
        list.base = base;
        return list;
    }

    /**
     * The place to stand at a height on a cell: its `level` (the physics'
     * own), whether it is the cell's `lowest`, and whether a wall stands
     * under it (`walled`: a wall or a window between the level below and
     * this one, so this is the wall's top or what is laid over it).
     */
    function placeAt(P, stack, map, x, y, height) {
        const levels = P.levelsAt ? P.levelsAt(map, x, y) : [];
        let at = -1;
        for (let i = 0; i < levels.length && at < 0; i++) if (Math.abs(levels[i].top - height) < 1e-3) at = i;
        if (at < 0) return null;
        const level = levels[at], below = at > 0 ? levels[at - 1].top : -Infinity;
        return { level, lowest: at === 0, walled: stack.some(piece => WALL_KINDS[piece.kind] && piece.foot < level.top - 1e-3 && piece.head > below + 1e-3) };
    }

    /** Why the physics gives a cell no place to stand within `within` of a height. */
    function whyNot(R, P, stack, map, x, y, near, within) {
        if (R.bushBlocksCell && map.reactor3d && map.reactor3d.foliage && R.bushBlocksCell(map, x, y)) return 'taken';
        const levels = P.levelsAt ? P.levelsAt(map, x, y) : [];
        let level = null;
        for (const each of levels) if (!level || Math.abs(each.top - near) < Math.abs(level.top - near)) level = each;
        if (!level) return 'nothing';
        // The height asked about is inside a wall: a click on its face.
        if (stack.some(piece => WALL_KINDS[piece.kind] && piece.foot <= near + 1e-3 && piece.head > near + 1e-3)) return 'wall';
        // No place near that height: it is in the air, or under the ground.
        if (Math.abs(level.top - near) > within + 1e-6) return 'nothing';
        if (WALL_KINDS[level.kind]) return 'wall';
        if (level.ceiling - level.top < (Number(P.BODY_HEIGHT) || 3) - 1e-6) return 'low';
        // A rail, a post or a lamp is a thing in the way; ground or rock too steep to stop on; any other top that slopes is a roof.
        if (!level.stand) return level.narrow ? 'taken' : level.kind === 'ground' || level.kind === 'rock' ? 'steep' : 'roof';
        if (R.hasWater && R.hasWater(map) && R.waterDepthAt && R.waterDepthAt(map, x + 0.5, y + 0.5, level.top) > (Number(R.WATER_WADE) || 0.45)) return 'water';
        return 'nothing';
    }

    /**
     * One tile: `{ ok, height, ground }`, a refusal, or `{ ok: true,
     * unknown: true }` where the 3D world is not there to ask. With no
     * `height` asked for, the place is the tile's own floor (its lowest
     * level, where the game stands an event that has no Z) plus `lift`. The
     * physics' stand test decides, and then: nobody is stood on a wall's
     * top, nor on a roof's slope laid over a wall or hanging over a room;
     * and with `any` (a unit put on the tile, no height named) not on
     * anything built over a wall, nor up on a thing that stands on the
     * floor (a crate, a block, a tower's body): a deck, a flat roof or a
     * crate's top is asked for by its height.
     */
    function tileStand(map, x, y, options, lookups) {
        if (!(x >= 0 && y >= 0 && x < map.width && y < map.height)) return refusal('offMap');
        const deep = is3D(map, lookups);
        if (!tileOpen(map, lookups, x, y, deep)) return refusal('tile');
        if (!deep) return { ok: true, height: 0 };
        const R = world(lookups), P = physics(lookups);
        if (!R || !P || typeof P.standingAt !== 'function' || typeof R.groundHeightAt !== 'function') return { ok: true, height: null, unknown: true };
        try {
            const ground = R.groundHeightAt(map, x + 0.5, y + 0.5) || 0;
            const asked = Number.isFinite(options.height);
            const within = options.within === Infinity || Number.isFinite(options.within) ? options.within : STEP;
            const near = asked ? options.height : ground + (Number(options.lift) || 0);
            const stack = stackAt(R, map, x, y);
            const height = P.standingAt(map, x, y, near, Number.isFinite(within) ? { within } : {});
            if (height === null || height === undefined) return refusal(whyNot(R, P, stack, map, x, y, near, within));
            const place = placeAt(P, stack, map, x, y, height);
            if (place) {
                // A unit put on a tile with no height named goes on the tile's floor, and a wall's tile has none.
                if (WALL_KINDS[place.level.kind] || (place.walled && options.any)) return refusal('wall');
                // A tile of a house's wall, pointed at as a tile, is the wall; a roof pointed at by its height is the roof.
                if (place.level.roof && (place.walled || !place.lowest)) return refusal(place.walled && !asked ? 'wall' : 'roof');
                // Nor is it put up on what stands on the floor: a crate, a barrel or a block is a thing in the way, and a
                // shape taller than a body is a wall. Paving and a kerb, within a step of the ground, are the floor.
                const rise = stack.base === null ? 0 : height - stack.base;
                if (options.any && !FLOOR_KINDS[place.level.kind] && rise > STEP + 1e-6) return refusal(rise > (Number(P.BODY_HEIGHT) || 3) ? 'wall' : 'taken');
            }
            return { ok: true, height, ground };
        } catch (error) {
            return { ok: true, height: null, unknown: true };
        }
    }

    /**
     * Whether a unit can stand with its own tile on (x, y): `{ ok: true,
     * height }` (the world height of its place on a 3D map), or `{ ok:
     * false, why, whyKey, whyText }`, `whyText` being the sentence Battle
     * Setup shows for a refused place. `options`: `lift` (an event's Z over
     * the tile's own floor, for a unit that stands there already), `any` (a
     * unit put on the tile with no height named: the tile's own floor, which
     * a tile of a house's wall has none of), or `height` (a world height to
     * stand near: the surface under the pointer) with `within` (how far
     * from it the place may be: a step, or Infinity for the nearest place
     * on the tile); `eventId` (the event asked about, left
     * out among the others), `body` (its shape, for one bigger than a
     * tile), `name` (for "Tank does not fit here."), `occupancy` (one
     * already built).
     */
    function standing(map, x, y, options = {}, lookups = {}) {
        if (!map) return refusal('offMap');
        const taken = options.occupancy || occupancy(map, lookups), self = options.eventId;
        const others = (tx, ty) => (taken.get(ty * map.width + tx) || []).filter(entry => entry.id !== self);
        const onMap = x >= 0 && y >= 0 && x < map.width && y < map.height;
        if (onMap && others(x, y).some(entry => entry.lift === undefined && (entry.own || entry.blocks))) return refusal('taken');
        const here = tileStand(map, x, y, options, lookups);
        if (!here.ok) return here;
        // A placed model is in the way of a body whose height range it crosses: not one a floor above or below it.
        const room = Number((physics(lookups) || {}).BODY_HEIGHT) || 3;
        const feet = Number.isFinite(here.height) && Number.isFinite(here.ground) ? here.height - here.ground : 0;
        const modelAt = (tx, ty) => others(tx, ty).some(entry => entry.lift !== undefined && Math.abs(entry.lift - feet) < room);
        if (modelAt(x, y)) return refusal('taken');
        const shape = options.body;
        if (shape && shape.count > 1) {
            const fit = { within: STEP, height: here.height };
            for (let j = 0; j < shape.h; j++) for (let i = 0; i < shape.w; i++) {
                const dx = shape.ox + i, dy = shape.oy + j;
                if (!(dx || dy) || !shapeHas(shape, dx, dy)) continue;
                const tx = x + dx, ty = y + dy;
                const open = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height && !others(tx, ty).some(entry => entry.lift === undefined && entry.blocks)
                    && !modelAt(tx, ty) && tileStand(map, tx, ty, Number.isFinite(here.height) ? fit : {}, lookups).ok;
                if (!open) return Object.assign(refusal('fit', { name: options.name || '' }), { x: tx, y: ty });
            }
        }
        return here;
    }

    //-------------------------------------------------------------------------
    // The report.

    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    /**
     * Whether some tile of the map has more than a Classic battle's eight of
     * `fighters` within `reach` tiles of it: a leader standing there is in
     * one start distance of them all.
     */
    function crowdedAt(map, fighters, reach) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const unit of fighters) { x0 = Math.min(x0, unit.x); x1 = Math.max(x1, unit.x); y0 = Math.min(y0, unit.y); y1 = Math.max(y1, unit.y); }
        // The tiles that can be within reach of two of them at once lie inside the box round them all.
        x0 = Math.max(0, x0); y0 = Math.max(0, y0);
        x1 = Math.min((Number(map.width) || x1 + 1) - 1, x1); y1 = Math.min((Number(map.height) || y1 + 1) - 1, y1);
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                let near = 0;
                for (const unit of fighters) if (Math.hypot(unit.x - x, unit.y - y) <= reach && ++near > CLASSIC_CAP) return true;
            }
        }
        return false;
    }

    /** Whether a page shows only when something is so: a switch, a variable, a self switch, an item, an actor. */
    const conditional = page => {
        const c = page && page.conditions;
        return !!c && !!(c.switch1Valid || c.switch2Valid || c.variableValid || c.selfSwitchValid || c.itemValid || c.actorValid);
    };
    /** The pages an event is its unit on: the one a comment names; every page, for a row or a note tag. */
    const unitPages = (event, unit) => (unit.page > 0 ? [(event.pages || [])[unit.page - 1]] : event.pages || []).filter(Boolean);

    /**
     * Whether a unit that waits for a page condition can be standing when a
     * start command runs: the command's own page turns its switch on, sets
     * its variable or shows on the same one; or the condition is one the
     * map's data cannot follow (a self switch, an item, an actor).
     */
    function standsFor(pages, found) {
        const page = found.page || {}, mine = page.conditions || {}, switches = new Set(), variables = new Set();
        if (mine.switch1Valid) switches.add(Number(mine.switch1Id));
        if (mine.switch2Valid) switches.add(Number(mine.switch2Id));
        if (mine.variableValid) variables.add(Number(mine.variableId));
        for (const command of page.list || []) {
            const p = (command && command.parameters) || [];
            if (!command || (command.code !== 121 && command.code !== 122) || (command.code === 121 && p[2] !== 0)) continue;
            const from = int(p[0]), to = Math.min(int(p[1]), from + 5000);
            for (let id = from; id <= to; id++) (command.code === 121 ? switches : variables).add(id);
        }
        return pages.some(each => {
            const c = each.conditions || {};
            return !(c.switch1Valid && !switches.has(Number(c.switch1Id))) && !(c.switch2Valid && !switches.has(Number(c.switch2Id)))
                && !(c.variableValid && !variables.has(Number(c.variableId)));
        });
    }

    /** Whether a troop the Database has shows an enemy; true where the caller did not give the troops. */
    function troopHasMember(lookups, id) {
        if (!Array.isArray(lookups.troops)) return true;
        const troop = recordOf(lookups.troops, id);
        return !!troop && Array.isArray(troop.members) && troop.members.some(member => member && Number(member.enemyId) > 0);
    }

    /**
     * Whether a Start Battle on Map command would have an enemy in its
     * battle, as far as the map's data can say. `waiting(unit)` gives the
     * pages of a unit that waits for a page condition, null for one that
     * stands there from the start.
     */
    function startHasEnemy(found, units, mode, start, lookups, waiting) {
        const args = found.args;
        if (int(args.troopId) > 0 && troopHasMember(lookups, int(args.troopId))) return true;
        // A goal other than Defeat every enemy may start empty: its own pages bring the enemies.
        if (args.objective && args.objective !== 'defeatAll') return true;
        // Its own event brings them: a Spawn Unit, or a Change Unit Side that makes an enemy.
        const own = { events: [found.event] };
        if (commandsOf(own, 'SpawnUnit').some(spawn => (spawn.args.team || (spawn.args.record === 'actor' ? 'ally' : 'enemy')) === 'enemy')) return true;
        if (commandsOf(own, 'ChangeUnitSide').some(change => change.args.team === 'enemy')) return true;
        // "This map's mode" on a Classic map is the battle screen against the enemy rows near the party.
        const classic = !ON_MAP.includes(args.mode) && mode.mode === 'classic';
        const enemies = units.filter(unit => {
            if (unit.team !== 'enemy' || (classic && unit.source !== 'row')) return false;
            const pages = waiting(unit);
            return !pages || standsFor(pages, found);
        });
        if (!enemies.length) return false;
        if (args.who !== 'near' && !classic) return true;
        // The party stands beside an event it touches or checks; anywhere, for one that runs by itself or walks.
        const fixed = found.page && found.page.trigger <= 2 && !found.page.moveType;
        if (!fixed) return true;
        const reach = (start.kind === 'near' ? start.tiles : DISTANCE) + 1;
        return enemies.some(unit => distance(unit, found.event) <= reach);
    }

    /**
     * What a map's battle is and what is wrong with it (`lookups`: the head
     * of this file). The report: `mode` (`modeOf`), `start` (`startOf`),
     * `units` (each with its `source`, `look`, `body`, and `waits` when it
     * is on the map only once a page condition is met), `count` (by side,
     * tag units included), `rows` (placed as rows only), `starts` (`near`,
     * `open`, `event`, or '' when Play starts no battle), `sentence` (the one
     * sentence; `level` is `warn` when enemies stand here and nothing starts
     * their battle), `lines` (each `level` `fix` or `note`, with the event it
     * is about and where a button under it goes), `skipped` (checks that
     * could not run) and `ok` (nothing to fix).
     */
    function problems(map, lookups = {}) {
        const report = {
            mapId: map ? Number(map.id) || 0 : 0, is3D: false, mode: null, start: null, units: [],
            count: { enemy: 0, ally: 0, neutral: 0 }, rows: { enemy: 0, ally: 0, neutral: 0 },
            starts: '', sentence: null, lines: [], skipped: [], ok: true
        };
        if (!map) { report.mode = modeOf(null, lookups); report.start = startOf(null); report.sentence = item('battleCheck.none', {}, { level: 'ok' }); return report; }
        const mode = report.mode = modeOf(map, lookups), start = report.start = startOf(map);
        const deep = report.is3D = is3D(map, lookups);
        const lines = { tags: [], records: [], pictures: [], party: [], stands: [], fits: [], starts: [], notes: [] };
        const skip = name => { if (!report.skipped.includes(name)) report.skipped.push(name); };
        // Who stands where, read once, and only on a map that has a unit to ask about.
        let taken = null;
        const occupied = () => taken || (taken = Number.isFinite(map.width) && Number.isFinite(map.height) ? occupancy(map, lookups) : new Map());

        if (mode.unreadable) lines.tags.push(item('battleCheck.badMode', { text: mode.unreadable }, { level: 'fix' }));
        if (start.unreadable) lines.tags.push(item('battleCheck.badTrigger', { text: start.unreadable }, { level: 'fix' }));

        const pictured = new Set(), gated = new Map();
        const home = lookups.system && Number(lookups.system.startMapId) === report.mapId && report.mapId > 0 ? lookups.system : null;
        for (const event of map.events || []) {
            if (!event) continue;
            const named = { name: event.name || '', id: pad(event.id) };
            const show = { kind: 'show', eventId: event.id, labelKey: 'battleCheck.fix.show', label: MESSAGES['battleCheck.fix.show'] };
            if (rowProblem(event)) { lines.records.push(item('battleCheck.badRow', named, { level: 'fix', eventId: event.id, x: event.x, y: event.y, fix: show })); continue; }
            const unit = unitOf(event);
            if (!unit) continue;
            const list = unit.record === 'actor' ? lookups.actors : unit.record === 'enemy' ? lookups.enemies : null;
            const record = unit.record ? recordOf(list, unit.id) : null;
            const missing = !!unit.record && Array.isArray(list) && !record;
            // On the map only once a page condition is met: every page it is a unit on has one.
            const pages = unitPages(event, unit), waits = pages.length > 0 && pages.every(conditional);
            const entry = {
                eventId: event.id, name: event.name || '', x: event.x, y: event.y, team: unit.team, record: unit.record, id: unit.id,
                recordName: record ? record.name || '' : '', move: unit.move, returns: unit.returns, source: unit.source, page: unit.page, waits, look: '', body: ONE
            };
            if (waits) gated.set(entry, pages);
            report.units.push(entry);
            report.count[unit.team]++;
            if (unit.source === 'row') report.rows[unit.team]++;
            if (missing) {
                lines.records.push(item(unit.record === 'actor' ? 'battleCheck.noActorRecord' : 'battleCheck.noEnemyRecord', Object.assign({ record: unit.id }, named),
                    { level: 'fix', eventId: event.id, x: event.x, y: event.y, fix: show }));
            } else {
                entry.look = lookOf(map, event, unit, lookups);
                const about = unit.record ? unit.record + ':' + unit.id : 'event:' + event.id;
                // Without the Database's list nothing is known of a record's pictures, and nothing is said.
                const known = !unit.record || Array.isArray(list) || typeof lookups.lookOf === 'function';
                if (entry.look === 'figure' && known && !pictured.has(about)) {
                    pictured.add(about);
                    const fix = unit.record
                        ? { kind: 'picture', page: unit.record === 'actor' ? 'actors' : 'enemies', id: unit.id, labelKey: 'battleCheck.fix.picture', label: MESSAGES['battleCheck.fix.picture'] }
                        : show;
                    lines.pictures.push(item('battleCheck.noPicture', { name: (record && record.name) || event.name || pad(event.id) }, { level: 'fix', eventId: event.id, fix }));
                }
            }
            // Where it stands, and whether all of it fits there.
            const shape = bodyOf(map, event, unit, lookups);
            entry.body = { ox: shape.ox, oy: shape.oy, w: shape.w, h: shape.h, count: shape.count };
            const lift = Number(map.reactor3d && map.reactor3d.eventZ && map.reactor3d.eventZ[String(event.id)]) || 0;
            const stand = standing(map, event.x, event.y, { lift, eventId: event.id, body: shape, name: (record && record.name) || event.name || '', occupancy: occupied() }, lookups);
            if (stand.unknown) skip('stand');
            if (!stand.ok) {
                const fit = stand.why === 'fit';
                (fit ? lines.fits : lines.stands).push(item(fit ? 'battleCheck.noFit' : 'battleCheck.noStand', named,
                    { level: 'fix', eventId: event.id, x: event.x, y: event.y, why: stand.why, whyKey: stand.whyKey, whyArgs: stand.whyArgs, whyText: stand.whyText, fix: show }));
            }
            if (home && event.x === Number(home.startX) && event.y === Number(home.startY)) {
                lines.notes.push(item('battleCheck.onStart', named, { level: 'note', eventId: event.id, x: event.x, y: event.y, fix: show }));
            }
        }
        if (!deep && report.units.length && !recordOf(lookups.tilesets, map.tilesetId)) skip('stand');

        // Who a battle the map starts would take: on a Classic map, the enemy rows only.
        const classic = mode.mode === 'classic';
        const enemies = report.units.filter(unit => unit.team === 'enemy');
        const fighters = classic ? enemies.filter(unit => unit.source === 'row') : enemies;
        const counted = { count: enemies.length };

        // Each Start Battle on Map: one that would be won the moment it starts starts nothing in the game.
        const waiting = unit => gated.get(unit) || null;
        const empty = new Set(), sound = new Set();
        for (const found of commandsOf(map, 'StartMapBattle')) {
            (startHasEnemy(found, report.units, mode, start, lookups, waiting) ? sound : empty).add(found.event.id);
        }
        for (const id of empty) {
            const event = map.events.find(each => each && each.id === id);
            lines.starts.push(item('battleCheck.emptyStart', { name: event.name || '', id: pad(id) },
                { level: 'fix', eventId: id, x: event.x, y: event.y, fix: { kind: 'show', eventId: id, labelKey: 'battleCheck.fix.show', label: MESSAGES['battleCheck.fix.show'] } }));
        }
        lines.starts.sort((a, b) => a.eventId - b.eventId);

        // The event the enemies wait for: the first whose battle an enemy would be in.
        const first = start.starters.find(starter => sound.has(starter.eventId)) || start.starters[0];
        if (!enemies.length) report.sentence = item('battleCheck.none', {}, { level: 'ok' });
        else if (start.kind === 'event' || !fighters.length) {
            if (first) { report.starts = 'event'; report.sentence = item('battleCheck.event', Object.assign({ name: first.name, id: pad(first.eventId) }, counted), { level: 'ok', eventId: first.eventId }); }
            else report.sentence = item('battleCheck.noStarter', counted, { level: 'warn' });
        } else if (start.kind === 'open') { report.starts = 'open'; report.sentence = item('battleCheck.open', counted, { level: 'ok' }); }
        else { report.starts = 'near'; report.sentence = item(start.tiles === 1 ? 'battleCheck.nearOne' : 'battleCheck.near', Object.assign({ tiles: start.tiles }, counted), { level: 'ok' }); }

        const set = report.units.length > 0 || start.starters.length > 0;
        if (set && lookups.system) {
            const party = Array.isArray(lookups.system.partyMembers) ? lookups.system.partyMembers : [];
            const known = Array.isArray(lookups.actors) ? party.filter(id => recordOf(lookups.actors, id)) : party;
            if (!known.length) lines.party.push(item('battleCheck.noParty', {}, { level: 'fix', fix: { kind: 'party', page: 'system1', labelKey: 'battleCheck.fix.party', label: MESSAGES['battleCheck.fix.party'] } }));
        }

        const held = enemies.filter(unit => unit.waits).length;
        if (held > 0) lines.notes.push(item('battleCheck.waiting', { count: held }, { level: 'note' }));

        if (classic && report.starts && report.starts !== 'event') {
            if (fighters.length > CLASSIC_CAP && (start.kind === 'open' || crowdedAt(map, fighters, start.tiles))) lines.notes.push(item('battleCheck.classicCap', {}, { level: 'note' }));
            const tags = enemies.length - fighters.length;
            if (tags > 0) lines.notes.push(item('battleCheck.classicTags', { count: tags }, { level: 'note' }));
        }
        if (set && mode.mode === 'firstPerson' && !deep) lines.notes.push(item('battleCheck.firstPerson2D', {}, { level: 'note' }));

        report.lines = [].concat(lines.tags, lines.records, lines.pictures, lines.party, lines.stands, lines.fits, lines.starts, lines.notes);
        report.ok = report.sentence.level !== 'warn' && !report.lines.some(line => line.level === 'fix');
        return report;
    }

    const api = {
        MODES, TEAMS, LOOKS, MESSAGES, DISTANCE, DISTANCE_MAX, CLASSIC_CAP,
        problems, say, unitOf, rowProblem, parseUnitText, starters, commandsOf, modeOf, modeNamed, startOf, tagOf, withTag,
        lookOf, bodyOf, toShape, modelTiles, occupancy, standing, tileOpen, is3D
    };
    root.RRBattleCheck = api;
    root.BattleCheck = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
