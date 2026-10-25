/**
 * BattleSetup - enemies put on the map by clicking, and what the map does
 * with them.
 *
 * A card docked beside the map (the map's side dock): the map's battle
 * mode, the Database's enemies as picture tiles, when the map starts its
 * battle, one sentence that says whether Play will start one, and Play this
 * battle. A tile clicked is in hand: its look follows the pointer and each
 * click on the map stands one where the look stands. What it makes are
 * ordinary events with their In battle row filled in (`rrUnit: { team,
 * record, id }`); the mode and the start are the map's two Note tags
 * (`<battle mode: x>`, `<battle trigger: N | open | 0>`). No picture is
 * written into an event: a unit stands as its record's look
 * (ReactorFightLook), here and in the game.
 *
 * The first half of this file has no DOM (the tag writers, the readers,
 * the events it makes, the place the party plays from); the tests and
 * build-scripts/place-unit.cjs drive it.
 */
(function(root) {
    'use strict';

    const MODES = ['classic', 'tactical', 'action', 'firstPerson'];
    const TEAMS = ['ally', 'enemy', 'neutral'];
    // The sides' colors, the ones the battle HUD draws them in (runtime/reactor_ui_fight.js).
    const TEAM_COLORS = { ally: '#4aa8ff', enemy: '#ff5a4a', neutral: '#e6d15a' };
    // Facing, a quarter turn at a time: down, left, up, right.
    const TURN = [2, 4, 8, 6];
    // Tiles: the start distance of a map with no tag, and the farthest one a tag may name.
    const DISTANCE = 6, DISTANCE_MAX = 50;
    // A refused place: the preview's color.
    const REFUSED = 0x9a9a9a;
    // The smallest a preview is drawn on the screen, and the tile sizes a click's view change goes by, in pixels.
    const PREVIEW_MIN = 28, TILE_SMALL = 16, TILE_WORK = 48;
    // Where a preview's model is drawn among the 3D view's see-through things: after the world's, under the preview's own ring (998).
    const PREVIEW_ORDER = 997;
    // The enemy records above which the tiles get a search box.
    const SEARCH_ABOVE = 12;
    // How often a model's picture is asked for before its record's plain figure stands in.
    const MODEL_TRIES = 2;
    // How long the card's own picture renderer is kept after its last picture, in milliseconds.
    const STAGE_REST = 4000;
    // How long after the card opens a model's picture that has to be drawn waits, and the longest it waits for its programs, in milliseconds.
    const PICTURE_WAIT = 300, COMPILE_WAIT = 1500;
    // The side of the picture renderer's drawing buffer, in pixels: a model one tile tall is drawn about 140 wide.
    const STAGE_SIDE = 256;
    // How far a roof's slope may end from a flat top beside it and still run up to it, in tiles; and the most tiles of one flat top looked at.
    const RIDGE_REACH = 0.3, RIDGE_TILES = 2048;
    // The pictures of models kept between sessions are drawn again when this number changes.
    const PICTURE_VERSION = 1;

    const clone = value => JSON.parse(JSON.stringify(value));
    const int = value => Math.floor(Number(value) || 0);
    const pad = id => String(id).padStart(3, '0');
    const fromNode = file => { try { return typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require(file) : null; } catch (error) { return null; } };
    const Check = () => root.RRBattleCheck || fromNode('../utils/BattleCheck.js');
    const Look = () => root.ReactorFightLook || fromNode('../utils/FightLook.js');
    const FCE = () => (typeof FightCommandEditor !== 'undefined' ? FightCommandEditor : fromNode('./commands/FightCommandEditor.js'));

    // The card's words: the English, and the keys the 17 locales translate (I18nManager.js, the Battle Setup block).
    const WORDS = {
        'battleSetup.title': 'Battle Setup',
        'battleSetup.button': 'Battle Setup: put enemies on this map',
        'battleSetup.close': 'Close',
        'battleSetup.mode': 'Battle mode',
        'battleSetup.modeGame': 'The game\'s mode ({mode})',
        'battleSetup.classic': 'Classic',
        'battleSetup.tactical': 'Tactical',
        'battleSetup.action': 'Action',
        'battleSetup.firstPerson': 'First Person',
        'battleSetup.plays.classic': 'Classic: the separate battle screen. Walk up to an enemy placed here and it opens.',
        'battleSetup.plays.tactical': 'Tactical: turns on a grid.',
        'battleSetup.plays.action': 'Action: you walk and fight in real time.',
        'battleSetup.plays.firstPerson': 'First Person: Action seen through the leader\'s eyes.',
        'battleSetup.plays.firstPerson2D': 'First Person plays as Action on a 2D map.',
        'battleSetup.thisMapOnly': '{text} · this map only',
        'battleSetup.enemies': 'Enemies',
        'battleSetup.actors': 'Actors',
        'battleSetup.search': 'Search…',
        'battleSetup.noEnemies': 'No enemies in the Database yet.',
        'battleSetup.newEnemy': 'New enemy…',
        'battleSetup.noMatch': 'Nothing matches.',
        'battleSetup.hint.pick': 'Click an enemy, then click the map.',
        'battleSetup.hint.pickAny': 'Click one above, then click the map.',
        'battleSetup.hint.place': 'Click the map to place {name}. R turns it, right-click removes one, Esc stops.',
        'battleSetup.hint.tile': 'Click the map to choose the tile for {name}. R turns it, Esc cancels.',
        'battleSetup.facing': 'Facing',
        'battleSetup.left': 'Left',
        'battleSetup.up': 'Up',
        'battleSetup.down': 'Down',
        'battleSetup.right': 'Right',
        'battleSetup.remove': 'Remove',
        'battleSetup.starts': 'Starts',
        'battleSetup.starts.near': 'When the party comes near ({tiles})',
        'battleSetup.starts.open': 'When the map opens',
        'battleSetup.starts.event': 'When an event says so',
        'battleSetup.placeAs': 'Place as',
        'battleSetup.side.enemy': 'Enemy',
        'battleSetup.side.ally': 'Ally',
        'battleSetup.side.neutral': 'Bystander',
        'battleSetup.distance': 'Distance',
        'battleSetup.tiles': 'tiles',
        'battleSetup.play': 'Play this battle',
        'battleSetup.showAll': 'Show every unit on the map'
    };
    const fill = (text, args) => String(text).replace(/\{(\w+)\}/g, (token, key) => (args && Object.prototype.hasOwnProperty.call(args, key) ? String(args[key]) : token));
    /** One of the card's sentences in the editor's language; the English where there is no editor. */
    function say(key, args) {
        const full = 'battleSetup.' + key, translator = root.I18n;
        if (translator && typeof translator.t === 'function') {
            const told = translator.t(full, args || {});
            if (told && told !== full) return told;
        }
        return fill(WORDS[full] || full, args);
    }
    /** The checker's sentences (BattleCheck.js) in the editor's language. */
    const checkWords = (key, args) => (root.I18n && typeof root.I18n.t === 'function' ? root.I18n.t(key, args || {}) : key);

    //-------------------------------------------------------------------------
    // Units and battle starts, as the game reads them.

    /** `enemy 5`, `ally 2`, `ally enemy 4 move 6`, `neutral`: a `<unit: ...>` tag's words as `{ team, record, id, move }`; null when they name no unit. */
    const parseUnitText = text => Check().parseUnitText(text);

    /**
     * The unit a map event is: `{ team, record, id, move, returns, source,
     * page }`, or null. `source` says what makes it one: its In battle row
     * (`row`), a `<unit: ...>` note tag (`note`), a `<unit: ...>` comment on
     * page `page`, counted from 1 (`comment`), or a PTBS comment (`ptbs`).
     */
    const unitOf = event => Check().unitOf(event);

    /** Whether an event starts a battle on the map: a Start Battle on Map command on any page. */
    function isStarter(event) {
        return !!event && (event.pages || []).some(page => ((page && page.list) || []).some(command =>
            command && command.code === 357 && Array.isArray(command.parameters) && command.parameters[0] === 'RPGReactor' && command.parameters[1] === 'StartMapBattle'));
    }

    /** What the map holds for a battle: `{ ally, enemy, neutral, starters }`, tag units counted with the rows. */
    function census(map) {
        const count = { ally: 0, enemy: 0, neutral: 0, starters: 0 };
        for (const event of (map && map.events) || []) {
            if (!event) continue;
            const unit = unitOf(event);
            if (unit && count[unit.team] !== undefined) count[unit.team]++;
            if (isStarter(event)) count.starters++;
        }
        return count;
    }

    /** The facing a quarter turn on from `direction` (`step` 1 or -1). */
    function turned(direction, step = 1) {
        const at = Math.max(0, TURN.indexOf(Number(direction) || 2));
        return TURN[(at + (step < 0 ? 3 : 1)) % 4];
    }

    /** The way an event faces: its first page's picture. */
    const facingOf = event => Number(event && event.pages && event.pages[0] && event.pages[0].image && event.pages[0].image.direction) || 2;

    /** Turns an event to face `direction` on every page. */
    function face(event, direction) {
        for (const page of (event && event.pages) || []) if (page && page.image) page.image.direction = direction;
        return event;
    }

    //-------------------------------------------------------------------------
    // The map's own mode and start: its two Note tags.

    /** A start as the tag writes it: a distance from 1 to 50, `'open'` or 0; null for anything else. */
    function triggerValue(value) {
        if (typeof value === 'string' && /^\s*open\s*$/i.test(value)) return 'open';
        if (value === null || value === undefined || value === '' || !/^\s*-?\d+(\.\d+)?\s*$/.test(String(value))) return null;
        return Math.max(0, Math.min(DISTANCE_MAX, Math.floor(Number(value))));
    }

    /** What a Note's `<battle trigger: ...>` tag says: a distance in tiles, `'open'` (the map opens) or 0 (an event says so); null with no tag the game can read. */
    function triggerOf(note) {
        const found = Check().tagOf(note, 'trigger');
        if (!found) return null;
        if (/^open$/i.test(found.text)) return 'open';
        return /^\d+$/.test(found.text) && Number(found.text) <= DISTANCE_MAX ? Number(found.text) : null;
    }

    /**
     * The Note with the start written in full: `<battle trigger: N>`,
     * `<battle trigger: open>` or `<battle trigger: 0>`. A null value takes
     * the tag (and a line it stood alone on) out; every other line is kept.
     */
    function withTrigger(note, value) {
        if (value === null || value === undefined) return Check().withTag(note, 'trigger', null);
        const start = triggerValue(value);
        return start === null ? String(note || '') : Check().withTag(note, 'trigger', String(start));
    }

    /** The Note with `<battle mode: x>` written; no mode (null, '', `game`) takes the tag out: the map uses the game's mode. */
    function withMode(note, mode) {
        const named = MODES.find(each => each.toLowerCase() === String(mode || '').trim().toLowerCase()) || null;
        return Check().withTag(note, 'mode', named);
    }

    /** When the map starts its battle: `{ kind: 'near' | 'open' | 'event', tiles, from, ... }` (RRBattleCheck.startOf). */
    const startOf = map => Check().startOf(map);

    /**
     * The battle mode in force on a map: `{ mode, from, game, playsAs }`.
     * `from` is `map` (its Note tag, else its sidecar), `game` (System) or
     * `default` (Classic); `playsAs` is Action for First Person on a 2D map.
     */
    const modeInForce = (map, system) => Check().modeOf(map, { system: system || null });

    /** Takes a key out of the map's 3D sidecar `battle`, once the Note says it: there is one place. Returns whether it was there. */
    function dropSidecar(map, key) {
        const battle = map && map.reactor3d && map.reactor3d.battle;
        if (!battle || battle[key] === undefined) return false;
        delete battle[key];
        if (!Object.keys(battle).length) delete map.reactor3d.battle;
        return true;
    }

    /** Writes the map's start into its Note. Returns whether the map changed. */
    function setStart(map, value) {
        if (!map) return false;
        const before = String(map.note || ''), next = withTrigger(before, value);
        map.note = next;
        return dropSidecar(map, 'trigger') || next !== before;
    }

    /** Writes the map's own mode into its Note (no mode: the game's). Returns whether the map changed. */
    function setMode(map, mode) {
        if (!map) return false;
        const before = String(map.note || ''), next = withMode(before, mode);
        map.note = next;
        return dropSidecar(map, 'mode') || next !== before;
    }

    /** The first unit on a map whose Note names no start writes the start in force there, so the Note says what will happen. */
    function ensureStart(map) {
        if (!map || Check().tagOf(map.note, 'trigger')) return false;
        const start = startOf(map);
        return setStart(map, start.kind === 'open' ? 'open' : start.kind === 'event' ? 0 : start.tiles);
    }

    //-------------------------------------------------------------------------
    // The events it makes.

    /**
     * A unit as an event at (x, y): `{ event }`. `unit` is `{ team, record,
     * id }`; `lookups` gives `actors`, `enemies` (the Database lists) and
     * `direction` (the way it faces). The event has no picture of its own:
     * it stands as its record's look.
     */
    function unitEvent(manager, unit, x, y, lookups = {}) {
        const list = unit.record === 'actor' ? lookups.actors : lookups.enemies;
        const record = (list || []).find(entry => entry && Number(entry.id) === Number(unit.id)) || null;
        const image = { tileId: 0, characterName: '', characterIndex: 0, direction: TURN.includes(Number(lookups.direction)) ? Number(lookups.direction) : 2, pattern: 1 };
        const page = manager.makeDefaultEventPage({ image, priorityType: 1, trigger: 0 });
        const fallback = unit.team === 'ally' ? 'Ally' : unit.team === 'enemy' ? 'Enemy' : 'Bystander';
        const event = manager.makeQuickEvent(x, y, (record && record.name) || fallback, [page]);
        event.rrUnit = { team: unit.team, record: unit.record, id: int(unit.id) };
        return { event };
    }

    /**
     * Quick Event › Battle start: an event the player steps on that starts
     * a battle once. Its first page is Player Touch with Start Battle on
     * Map as its dialog writes a new one (and the branch rows under it),
     * then Self Switch A; its second page, behind Self Switch A, is empty.
     */
    function battleStartEvent(manager, x, y, context) {
        const commands = FCE();
        if (!commands || !manager) return null;
        const around = typeof commands.context === 'function' ? commands.context(context) : (context || {});
        const args = commands.argsOf('StartMapBattle', null, commands.formOf('StartMapBattle', null, around), around);
        const list = commands.block('StartMapBattle', args, 0).concat([{ code: 123, indent: 0, parameters: ['A', 0] }, { code: 0, indent: 0, parameters: [] }]);
        const first = manager.makeDefaultEventPage({ trigger: 1, priorityType: 0, list });
        const done = manager.makeDefaultEventPage({ conditions: { selfSwitchCh: 'A', selfSwitchValid: true }, priorityType: 0 });
        return manager.makeQuickEvent(x, y, 'Battle Start', [first, done]);
    }

    //-------------------------------------------------------------------------
    // Where the party plays from.

    /** The way to face from one tile toward another. */
    function facingToward(from, to) {
        const dx = to.x - from.x, dy = to.y - from.y;
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 6 : 4) : (dy > 0 ? 2 : 8);
    }

    /**
     * Where the party stands when Play this battle opens the map, and the
     * way it faces: `{ x, y, direction }`, or null when Play has nowhere to
     * start a battle from.
     *
     * `options`: `start` (the map's start, `startOf`), `enemies` and
     * `starters` (`[{ x, y }]`: the enemy units, and the events that have
     * Start Battle on Map, first first), `home` (`{ x, y, direction }`: the
     * game's start position when it is on this map), `near` (`{ x, y }`:
     * what the author last worked on, for "the nearest enemy"), `stand(x,
     * y)` (the height a character stands at there, or null where none can;
     * true on a map with no heights) and `taken(x, y)` (an event stands
     * there).
     *
     *   comes near: in a clear line to the nearest enemy, 4 tiles from it (2 inside the start distance when that is smaller), facing it;
     *   map opens:  the game's start position when it is on this map, else 8 tiles from the nearest enemy, facing it;
     *   an event:   2 tiles from the first event that has Start Battle on Map, facing it.
     */
    function playSpot(map, options = {}) {
        if (!map) return null;
        const start = options.start || startOf(map);
        const enemies = options.enemies || [], starters = options.starters || [];
        const inside = (x, y) => x >= 0 && y >= 0 && x < map.width && y < map.height;
        const asked = new Map();
        const heightAt = (x, y) => {
            if (!inside(x, y)) return null;
            const key = y * map.width + x;
            if (asked.has(key)) return asked.get(key);
            const at = options.stand ? options.stand(x, y) : true;
            const height = at === null || at === undefined || at === false ? null : (at === true ? 0 : Number(at) || 0);
            asked.set(key, height);
            return height;
        };
        const taken = (x, y) => (options.taken ? !!options.taken(x, y) : (map.events || []).some(event => event && event.x === x && event.y === y));
        const nearest = (list, from) => list.reduce((best, each) => (!best || Math.hypot(each.x - from.x, each.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? each : best), null);
        // Whether the tiles between two places can all be stood on: nothing built or deep lies between them.
        const clear = (from, to) => {
            const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
            for (let i = 1; i < steps; i++) {
                const x = Math.round(from.x + (to.x - from.x) * i / steps), y = Math.round(from.y + (to.y - from.y) * i / steps);
                if (heightAt(x, y) === null) return false;
            }
            return true;
        };
        // The free tile nearest to `reach` tiles from an anchor (no farther than `limit`), in a clear line and on its level where there is one.
        const around = (anchor, reach, limit) => {
            const level = heightAt(anchor.x, anchor.y), span = Math.ceil(reach) + 4;
            let best = null;
            for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
                const x = anchor.x + dx, y = anchor.y + dy, far = Math.hypot(dx, dy);
                if (far < 1 || far > limit + 1e-6 || taken(x, y)) continue;
                const height = heightAt(x, y);
                if (height === null) continue;
                // From below first: the party looks up the screen at what it fights.
                const side = dy > 0 && Math.abs(dy) >= Math.abs(dx) ? 0 : dy < 0 && Math.abs(dy) >= Math.abs(dx) ? 0.2 : 0.1;
                const cost = Math.abs(far - reach) * 4 + (clear({ x, y }, anchor) ? 0 : 6) + (level === null ? 0 : Math.min(4, Math.abs(height - level))) + side;
                if (!best || cost < best.cost) best = { x, y, cost };
            }
            return best ? { x: best.x, y: best.y, direction: facingToward(best, anchor) } : null;
        };
        const from = options.near || options.home || enemies[0] || starters[0] || { x: map.width / 2, y: map.height / 2 };
        if (start.kind === 'event') {
            return starters.length ? around(starters[0], 2, 12) : null;
        }
        if (!enemies.length) return null;
        if (start.kind === 'open') {
            const home = options.home;
            if (home && heightAt(home.x, home.y) !== null && !taken(home.x, home.y)) {
                return { x: home.x, y: home.y, direction: TURN.includes(Number(home.direction)) ? Number(home.direction) : facingToward(home, nearest(enemies, home)) };
            }
            return around(nearest(enemies, from), 8, 20);
        }
        const tiles = Math.max(1, Number(start.tiles) || DISTANCE);
        return around(nearest(enemies, from), Math.max(1, Math.min(4, tiles - 2)), tiles);
    }

    //-------------------------------------------------------------------------
    // What the card shows of a report, and the records it offers.

    /**
     * The checker's one sentence as the card draws it: `count` is the
     * button ("Enemies: 3."), `rest` what follows it, `level` `warn` when
     * Play will start no battle. A sentence with no count is all `rest`.
     */
    function sentenceParts(report, t) {
        const sentence = report && report.sentence;
        if (!sentence) return { count: '', rest: '', level: 'ok' };
        const C = Check(), args = sentence.args || {}, level = sentence.level || 'ok';
        const whole = C.say(sentence, t);
        if (args.count === undefined) return { count: '', rest: whole, level };
        const mark = '\u0001';
        const text = C.say(Object.assign({}, sentence, { args: Object.assign({}, args, { count: mark }) }), t);
        const at = text.indexOf(mark);
        if (at < 0) return { count: '', rest: whole, level };
        let end = at + 1;
        if (/[.。．]/.test(text.charAt(end))) end++;
        return { count: (text.slice(0, at) + args.count + text.slice(at + 1, end)).trim(), rest: text.slice(end).trim(), level };
    }

    /**
     * The records the tiles offer for a side: `{ total, groups: [{ record,
     * list: [{ record, id, name }] }] }`. Enemies for the Enemy side;
     * Actors, then Enemies, for an ally or a bystander. `search` narrows
     * them by name or number; `total` counts them before it does.
     */
    function tileRecords(team, data, search) {
        const of = (kind, record) => ((data && data[kind]) || []).filter(entry => entry && entry.id > 0 && String(entry.name || '').trim())
            .map(entry => ({ record, id: entry.id, name: String(entry.name) }));
        const all = team === 'enemy' ? [['enemy', of('enemies', 'enemy')]] : [['actor', of('actors', 'actor')], ['enemy', of('enemies', 'enemy')]];
        const asked = String(search || '').trim().toLowerCase();
        const groups = all.map(([record, list]) => ({ record, list: asked ? list.filter(entry => entry.name.toLowerCase().includes(asked) || String(entry.id) === asked) : list }))
            .filter(group => group.list.length);
        return { total: all.reduce((sum, [, list]) => sum + list.length, 0), groups };
    }

    /** The mode choices of a map: the game's first, then each mode; First Person only on a 3D map. `[[value, key, args]]`, value '' for the game's. */
    function modeChoices(inForce, is3D) {
        return [['', 'modeGame', { mode: say(inForce.game) }]].concat(MODES.filter(mode => mode !== 'firstPerson' || is3D).map(mode => [mode, mode, null]));
    }

    /** The line under the mode: what the mode in force plays like, and whether it is this map's own. */
    function playsLine(inForce) {
        const flat = inForce.mode === 'firstPerson' && inForce.playsAs === 'action';
        const text = say(flat ? 'plays.firstPerson2D' : 'plays.' + inForce.mode);
        return inForce.from === 'map' ? say('thisMapOnly', { text }) : text;
    }

    //-------------------------------------------------------------------------
    // The card.

    const escapeHtml = value => (typeof root.rrEscapeHtml === 'function' ? root.rrEscapeHtml(value) : String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
    const state = {
        panel: null, parts: null, open: false, manager: null, map: null, team: 'enemy', brush: null, pick: null, search: '',
        report: null, verdict: null, showUnits: false, shownId: 0, tilesKey: '', openedAt: 0, started: null,
        bound: new Map(), arts: new Map(), bodies: new Map(), files: new Map(), propTiles: new Map(), talls: new Map(), roofs: new Map(), props: null, propsKey: '', occupancy: null,
        ghostProp: null, ghost2D: null, ghost3D: null
    };

    const reactor = () => root.reactor || null;
    const database = () => (reactor() && reactor().databaseManager) || null;
    const dataOf = () => (database() && database().data) || {};
    const systemOf = () => (database() && database().getSystem ? database().getSystem() : dataOf().system) || null;
    /** The map's event manager: the one the card was opened with, else the editor's. */
    const managerNow = () => state.manager || (reactor() && reactor().eventManager) || null;
    const project = manager => { const from = manager || managerNow(), pc = from && from.projectController; return pc ? (pc.getCurrentProject ? pc.getCurrentProject() : pc.currentProject) : null; };
    const editor3D = manager => (manager && manager.projectController && manager.projectController.mapEditor3D) || (reactor() && reactor().mapEditor3D) || null;
    const recordOf = unit => (unit && unit.record ? ((unit.record === 'actor' ? dataOf().actors : dataOf().enemies) || []).find(entry => entry && Number(entry.id) === Number(unit.id)) : null) || null;
    const unitName = unit => { const record = recordOf(unit); return (record && record.name) || say('side.' + (unit.team === 'ally' ? 'ally' : unit.team === 'enemy' ? 'enemy' : 'neutral')); };
    const isOpen = () => state.open;
    /** What a click would stand on the map: the unit in hand, or the one a command's dialog is picking a tile for. */
    const inHand = () => (state.pick ? state.pick.unit : state.open ? state.brush : null);
    const handFacing = () => (state.pick ? state.pick.direction : state.brush ? state.brush.direction : 2) || 2;
    /** Whether a click on the map is the card's to take: a unit is in hand, or a command's dialog is picking a tile. */
    const holding = () => !!inHand();

    /**
     * The model the Database binds to a unit's record, as the game resolves it
     * (an actor's character slot, an enemy's entry). Kept for a moment: every
     * unit on the map asks on each redraw.
     */
    function boundModel(manager, unit) {
        if (!unit || !unit.record || !(unit.id > 0)) return null;
        const key = unit.record + ':' + unit.id, now = Date.now(), kept = state.bound.get(key);
        if (kept && now - kept.at < 1500) return kept.spec;
        let spec = null;
        try {
            const home = project(manager || state.manager), bindings = root.RRDatabase3DBindings;
            if (home && home.path && bindings && bindings.get) {
                spec = unit.record === 'actor' ? bindings.get(home.path, 'actors', unit.id, 'character') : bindings.get(home.path, 'enemies', unit.id);
            }
        } catch (error) {
            spec = null;
        }
        state.bound.set(key, { at: now, spec: spec && spec.name ? spec : null });
        return spec && spec.name ? spec : null;
    }

    /** Whether a picture file of the project is there (`folder` under img/); kept until the card is opened again. */
    function pictureExists(folder, name) {
        const home = project(state.manager);
        if (!home || !home.path || typeof require !== 'function') return true;
        const key = folder + '/' + name;
        if (state.files.has(key)) return state.files.get(key);
        let there = true;
        try {
            const fs = require('fs'), path = require('path'), file = path.join(home.path, 'img', folder, name + '.png');
            there = fs.existsSync(file) || fs.existsSync(file + '_');
        } catch (error) { there = true; }
        state.files.set(key, there);
        return there;
    }

    /** The page a unit shows on the map while units are shown: the page a comment makes it one on, else its first. */
    const unitPage = unit => (unit && unit.page > 0 ? unit.page - 1 : 0);

    /**
     * What a unit stands as (ReactorFightLook.resolve): `{ kind: 'own' |
     * 'model' | 'character' | 'picture' | 'figure', team, color, ... }`.
     * With an `event`, its own picture or model comes first; without one,
     * the look of the record. `given` overrides what the editor would look
     * up (`record`, `model`, `sideView`, `exists`, `own`).
     */
    function lookOf(unit, event, given) {
        const rule = Look();
        if (!rule || !unit) return null;
        const system = systemOf();
        const sources = Object.assign({ record: recordOf(unit), model: boundModel(state.manager, unit), sideView: !!(system && system.optSideView), colors: TEAM_COLORS, exists: pictureExists }, given || {});
        if (event && sources.own === undefined) {
            const from = managerNow(), map = (from && from.currentMap) || null, pages = event.pages || [];
            const models = map && map.reactor3d && map.reactor3d.events && map.reactor3d.events[String(event.id)];
            const shown = unit.page > 0 ? [unit.page - 1] : pages.map((page, index) => index);
            sources.own = shown.some(index => rule.hasOwn(pages[index] && pages[index].image, models && models[String(index)])) || /<\s*r3d\s*>/i.test(String(event.note || ''));
        }
        return rule.resolve(unit, sources);
    }

    /**
     * The page a unit shows on the map while Battle Setup is open, so units
     * are seen as what they are; null leaves it to Preview Event.
     */
    function previewPage(event) {
        if (!state.showUnits || !event || !event.pages || !event.pages[0]) return null;
        const unit = unitOf(event);
        return unit ? unitPage(unit) : null;
    }

    /**
     * The model an event's page stands as in a preview: its own, else (a
     * unit with none of its own) the one the Database binds to its record,
     * which is what the game gives it.
     */
    function modelSpec(map, event, pageIndex) {
        if (!event) return null;
        const own = map && map.reactor3d && map.reactor3d.events && map.reactor3d.events[String(event.id)];
        const spec = own && own[String(pageIndex == null ? 0 : pageIndex)];
        if (spec && spec.name) return spec;
        return boundModel(state.manager, unitOf(event));
    }

    const colorNumber = hex => parseInt(String(hex).replace('#', ''), 16);

    /** A unit's side as a color number while units are shown; null for anything else. */
    function teamTone(event) {
        const unit = state.showUnits ? unitOf(event) : null;
        return unit ? colorNumber(TEAM_COLORS[unit.team]) : null;
    }

    /** The 3D view draws its events again, without laying the map again. */
    function redrawEvents3D(manager) {
        const editor = editor3D(manager);
        if (editor && typeof editor.refreshEvents === 'function') editor.refreshEvents();
    }

    /**
     * Units are drawn as what they are (model or character, on a ring in
     * their side's color) while the card is open. The map views draw them
     * and their rings; the card only says when.
     */
    function setShowUnits(on) {
        on = !!on;
        if (state.showUnits === on) return;
        state.showUnits = on;
        state.bound.clear();
        const manager = state.manager;
        if (!on) { hover2D(manager, null); hover3D(editor3D(manager), null); }
        if (manager && manager.currentMap) {
            // The events alone are drawn again (the 3D view compares each with what it shows): the world stays as it is.
            manager.renderEvents();
            redrawEvents3D(manager);
        }
    }

    /** The preview's ring on the 2D map: a faint disc, its edge, and a notch the way the unit faces, or a bar through it where a click would do nothing. */
    function drawRing(graphics, cx, cy, tw, th, color, direction, alpha, barred) {
        const rx = tw * 0.44, ry = th * 0.44;
        graphics.ellipse(cx, cy, rx, ry);
        graphics.fill({ color, alpha: 0.16 * alpha });
        graphics.ellipse(cx, cy, rx, ry);
        graphics.stroke({ width: 3, color, alpha: 0.95 * alpha });
        if (barred) {
            // A refused place: a bar through the ring.
            graphics.moveTo(cx - rx * 0.72, cy + ry * 0.72);
            graphics.lineTo(cx + rx * 0.72, cy - ry * 0.72);
            graphics.stroke({ width: 4, color, alpha });
            return;
        }
        // The notch: a small arrowhead on the ring, the way the unit faces.
        const d = direction === 4 ? [-1, 0] : direction === 6 ? [1, 0] : direction === 8 ? [0, -1] : [0, 1];
        const tipX = cx + d[0] * (rx + 7), tipY = cy + d[1] * (ry + 7), baseX = cx + d[0] * (rx - 2), baseY = cy + d[1] * (ry - 2), w = 7;
        graphics.poly([tipX, tipY, baseX - d[1] * w, baseY - d[0] * w, baseX + d[1] * w, baseY + d[0] * w]);
        graphics.fill({ color, alpha });
    }

    //-------------------------------------------------------------------------
    // A unit's look as a picture: the card's tiles and the previews draw it.

    const loadImage = url => new Promise(resolve => {
        if (typeof Image === 'undefined' || !url) { resolve(null); return; }
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
    });
    const canvasOf = (width, height) => { const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height)); return canvas; };
    const imageUrl = (folder, name) => {
        const home = project(state.manager);
        if (!home || !home.path || !root.RRAssetFiles || typeof require !== 'function') return '';
        return root.RRAssetFiles.imageUrlFor(require('path').join(home.path, 'img', folder), name);
    };

    /** The plain figure in a side's color, as a picture. */
    function figureArt(look) {
        const canvas = canvasOf(96, 144);
        Look().drawFigure(canvas.getContext('2d'), 0, 0, 96, 144, look.color);
        return { canvas, kind: 'figure', tiles: [Look().TILES_WIDE, Look().TILES_TALL] };
    }

    /** A picture cut to its art (the margin off, the battler's hue turned), as the game draws it. */
    function trimmedArt(image, hue) {
        const whole = canvasOf(image.naturalWidth || image.width, image.naturalHeight || image.height), context = whole.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        let box = null, art = null;
        try {
            const pixels = context.getImageData(0, 0, whole.width, whole.height);
            if (hue) { Look().rotateHue(pixels.data, hue); context.putImageData(pixels, 0, 0); }
            box = Look().trim(pixels.data, whole.width, whole.height);
            // A creature drawn high over its shadow stands just over it, as in the game.
            if (box) art = Look().art(pixels.data, whole.width, box);
        } catch (error) { box = null; }
        if (!box || !art) return whole;
        const cut = canvasOf(art.width, art.height);
        Look().drawArt(cut.getContext('2d'), whole, box, art, art.width, art.height);
        return cut;
    }

    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    /** Once the next frame has been drawn: what follows does not hold that frame up. */
    const afterFrame = () => new Promise(resolve => {
        if (typeof requestAnimationFrame !== 'function') setTimeout(resolve, 0);
        else requestAnimationFrame(() => setTimeout(resolve, 0));
    });
    /** A quiet moment of the page: its next idle period (within a second), else after its next frame. */
    const whenIdle = () => new Promise(resolve => {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(() => resolve(), { timeout: 1000 });
        else afterFrame().then(resolve);
    });
    /** The moment a picture that has to be drawn may be: the card has been open for a moment, and the page is quiet. */
    const quietTurn = async () => {
        const since = Date.now() - (state.openedAt || 0);
        if (since >= 0 && since < PICTURE_WAIT) await pause(PICTURE_WAIT - since);
        await whenIdle();
    };

    /** The card's own small renderer for a model's picture: made when one is asked for, dropped a few seconds after the last. */
    function pictureStage() {
        const THREE = root.THREE;
        if (!state.stage) {
            const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, alpha: true, preserveDrawingBuffer: true });
            renderer.setClearColor(0x000000, 0);
            const scene = new THREE.Scene(), sun = new THREE.DirectionalLight(0xffffff, 0.9);
            scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
            sun.position.set(1.4, 2.2, 1.8);
            scene.add(sun);
            if (root.RRModelRelease && root.RRModelRelease.track) root.RRModelRelease.track(renderer, 'battle-setup-pictures');
            state.stage = { renderer, scene, camera: new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 100), side: 0 };
        }
        clearTimeout(state.stageTimer);
        state.stageTimer = setTimeout(dropStage, STAGE_REST);
        return state.stage;
    }

    function dropStage() {
        const stage = state.stage;
        clearTimeout(state.stageTimer);
        state.stage = null; state.stageTimer = 0;
        if (!stage) return;
        if (root.RRModelRelease && root.RRModelRelease.dropRenderer) root.RRModelRelease.dropRenderer(stage.renderer);
        else { stage.renderer.dispose(); if (stage.renderer.forceContextLoss) stage.renderer.forceContextLoss(); }
    }

    /** A model's picture as the game frames its sprite (`Reactor3D.frameModelSprite`), drawn by the card's own renderer: `{ url }`, or null. */
    async function ownShot(home, spec, editor, facing) {
        const models = root.RREventPreviewModels, R = root.Reactor3D;
        const template = await models.templateFor(home, spec, editor, true);
        if (!template || !root.THREE || !R || !R.frameModelSprite) return null;
        const decoded = async object => { for (let i = 0; i < 60 && !models.texturesDecoded(object); i++) await pause(100); return models.texturesDecoded(object); };
        if (!await decoded(template)) return null;
        const object = models.instance(template, Object.assign({}, spec, { size: 1, scale: 1 }), facing);
        // A variant's own picture is read after the model's.
        if (spec.variant && !await decoded(object)) return null;
        if (typeof ModelPreview3D !== 'undefined' && ModelPreview3D.isolateLighting) ModelPreview3D.isolateLighting(object);
        const stage = pictureStage();
        let url = null;
        try {
            stage.scene.add(object);
            const side = R.frameModelSprite(object, 64, stage.camera).pixels;
            // The drawing buffer only ever grows, and a picture is drawn into a corner of it: laying the buffer out again is a pause of the page.
            if (side > stage.side) { stage.side = Math.max(side, STAGE_SIDE); stage.renderer.setSize(stage.side, stage.side, false); }
            stage.renderer.setViewport(0, 0, side, side);
            // Its programs are built beside the page's frames where the driver can: the draw then waits for none.
            if (typeof stage.renderer.compileAsync === 'function') {
                try { await Promise.race([stage.renderer.compileAsync(stage.scene, stage.camera), pause(COMPILE_WAIT)]); } catch (error) { /* drawn as it is */ }
                if (state.stage !== stage) return null;
            }
            stage.renderer.render(stage.scene, stage.camera);
            // Reading it back waits for the draw to be done: in a frame of its own.
            await afterFrame();
            if (state.stage !== stage) return null;
            // The corner drawn into is the buffer's lower left.
            const cut = canvasOf(side, side);
            cut.getContext('2d').drawImage(stage.renderer.domElement, 0, stage.side - side, side, side, 0, 0, side, side);
            url = cut.toDataURL('image/png');
            pictureStage();
        } finally {
            stage.scene.remove(object);
            if (models.disposeInstance) models.disposeInstance(object);
        }
        return url ? { url } : null;
    }

    /** Whether the editor's shared thumbnail renderer can draw in this window: asked once, with nothing drawn. */
    function sharedShots() {
        if (state.ownShots === undefined) {
            const release = root.RRModelRelease;
            try {
                if (release && release.IdleRenderer) new release.IdleRenderer(() => ({}), { restMs: 1 }).use(() => 0);
                state.ownShots = false;
            } catch (error) { state.ownShots = true; }
        }
        return !state.ownShots;
    }

    /**
     * The file a model's picture is kept in between sessions, in the
     * editor's own cache of model pictures (outside the project): named by
     * the model's files as they are now, its spec and the facing, so a
     * model changed in any way is drawn again. Null where there is no disk.
     */
    function shotFile(home, spec, facing) {
        if (typeof require !== 'function' || typeof process === 'undefined' || typeof Database3DEditor === 'undefined' || !Database3DEditor.thumbnailCacheRoot || !home || !home.path) return null;
        try {
            const fs = require('fs'), path = require('path');
            const folder = path.join(home.path, '3d', ...String(spec.name).split('/'));
            const stamps = [];
            for (const dir of [folder, path.join(folder, 'source')]) {
                let names = [];
                try { names = fs.readdirSync(dir); } catch (error) { names = []; }
                for (const name of names.sort()) { const stat = fs.statSync(path.join(dir, name)); if (stat.isFile()) stamps.push(name + ':' + stat.size + ':' + Math.round(stat.mtimeMs)); }
            }
            if (!stamps.length) return null;
            const key = ['battle-setup-picture', PICTURE_VERSION, folder, stamps.join(','), JSON.stringify(spec), facing].join('|');
            return path.join(Database3DEditor.thumbnailCacheRoot(process, path, require('os')), require('crypto').createHash('sha1').update(key).digest('hex') + '.png');
        } catch (error) { return null; }
    }

    /**
     * A model's picture, facing `facing`: `{ url }`; null while its file is
     * still being read. One kept from an earlier session is used as it is;
     * a new one is drawn (by the editor's shared thumbnail renderer where
     * that draws, else by the card's own) and kept. Drawing is the heavy
     * part (the model is read and its programs built): one at a time, each
     * in a quiet moment of the page, none in the card's first moments.
     */
    function modelShot(home, spec, editor, facing) {
        const file = shotFile(home, spec, facing);
        if (file) {
            try {
                const bytes = require('fs').readFileSync(file);
                if (bytes.length > 320) return Promise.resolve({ url: 'data:image/png;base64,' + bytes.toString('base64'), kept: true });
            } catch (error) { /* not drawn yet */ }
        }
        const drawn = (state.drawing || Promise.resolve()).then(quietTurn).then(() => drawShot(home, spec, editor, facing, file));
        state.drawing = drawn.catch(() => null);
        return drawn;
    }

    /** Draws a model's picture now and keeps it in `file`. */
    async function drawShot(home, spec, editor, facing, file) {
        let shot = null;
        if (sharedShots()) {
            try { shot = await root.RREventPreviewModels.thumbnail(home, spec, editor, 64, facing); } catch (error) { state.ownShots = true; }
        }
        if (!shot && state.ownShots) shot = await ownShot(home, spec, editor, facing);
        if (shot && shot.url && file && String(shot.url).startsWith('data:image/png;base64,')) {
            try {
                const fs = require('fs'), path = require('path');
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, Buffer.from(String(shot.url).slice(shot.url.indexOf(',') + 1), 'base64'));
            } catch (error) { /* a home that cannot be written: drawn again next time */ }
        }
        return shot;
    }

    /**
     * A unit's look as a picture, facing `direction`: a promise of
     * `{ canvas, kind, tiles }` (`tiles`: the width and height it stands
     * at on the map, in tiles; null for a picture drawn at its own size).
     * Kept per record and look.
     */
    function artOf(unit, direction) {
        const look = lookOf(unit, null);
        if (!look || typeof document === 'undefined') return Promise.resolve(null);
        const home = project(state.manager), facing = look.kind === 'character' || look.kind === 'model' ? (TURN.includes(direction) ? direction : 2) : 2;
        const key = JSON.stringify([home && home.path, look.kind, look.spec || look.characterName || look.name || '', look.characterIndex || 0, look.hue || 0, look.folder || '', look.color, facing]);
        if (state.arts.has(key)) return state.arts.get(key);
        const made = (async () => {
            if (look.kind === 'model' && root.RREventPreviewModels) {
                // The game's 3D module is read the first time a model is shown (a project opened on a 2D map has not read it yet).
                const editor = editor3D(managerNow());
                if (!(root.Reactor3D && root.Reactor3D.normalizeModelSpec) && editor && editor.ensureLibraries) await editor.ensureLibraries();
                const spec = root.Reactor3D && root.Reactor3D.normalizeModelSpec ? root.Reactor3D.normalizeModelSpec(look.spec) : null;
                // Its pictures decode after the model is read: asked again while they do.
                for (let attempt = 0; spec && attempt < MODEL_TRIES; attempt++) {
                    const shot = await modelShot(home, spec, editor, facing);
                    const image = shot && shot.url ? await loadImage(shot.url) : null;
                    if (image) return { canvas: trimmedArt(image, 0), kind: 'model', tiles: null };
                    if (attempt + 1 < MODEL_TRIES) await pause(500);
                }
            }
            if (look.kind === 'character') {
                const image = await loadImage(imageUrl('characters', look.characterName));
                if (image) {
                    const name = String(look.characterName).split('/').pop(), big = /^[!$]+/.test(name) && name.match(/^[!$]+/)[0].includes('$') && !/\[8D\]/i.test(name);
                    const fw = image.width / (big ? 3 : 12), fh = image.height / (big ? 4 : 8);
                    const index = big ? 0 : look.characterIndex || 0, row = (facing - 2) / 2;
                    const canvas = canvasOf(fw, fh);
                    canvas.getContext('2d').drawImage(image, ((index % 4) * 3 + 1) * fw, (Math.floor(index / 4) * 4 + row) * fh, fw, fh, 0, 0, fw, fh);
                    return { canvas, kind: 'character', tiles: null };
                }
            }
            if (look.kind === 'picture') {
                const image = await loadImage(imageUrl(look.folder, look.name));
                if (image) return { canvas: trimmedArt(image, look.hue), kind: 'picture', tiles: [Look().TILES_WIDE, Look().TILES_TALL] };
            }
            return figureArt(look);
        })().catch(error => {
            if (typeof console !== 'undefined') console.warn('Battle Setup: a look could not be drawn', error);
            return figureArt(look);
        });
        state.arts.set(key, made);
        return made;
    }

    //-------------------------------------------------------------------------
    // What the checker is told of the open editor.

    /** The 3D view of the open map, when it is the view in use. */
    const live3D = manager => { const editor = editor3D(manager); return editor && editor.canvas && (!editor.isEnabled || editor.isEnabled()) ? editor : null; };

    /** Something the card measured has arrived (a model's body, the physics): what it shows is worked out again. */
    function changed() {
        state.occupancy = null;
        state.verdict = null;
        if (state.changeTimer) return;
        state.changeTimer = setTimeout(() => { state.changeTimer = 0; if (state.open) recheck(); }, 60);
    }

    /**
     * The tiles a model covers round its own tile, facing `direction`, by
     * the game's own measure (`Reactor3D.blockedTilesFor`): `[[dx, dy],
     * ...]`. Null for a body of one tile, and while the model is being
     * read (the card looks again when it has been).
     */
    function modelBody(manager, spec, direction) {
        const R = root.Reactor3D, models = root.RREventPreviewModels;
        if (!spec || !spec.name || !R || !R.blockedTilesFor || !R.normalizeModelSpec || !models) return null;
        const normal = R.normalizeModelSpec(spec);
        if (!normal) return null;
        const key = JSON.stringify([normal, direction || 2]);
        if (state.bodies.has(key)) return state.bodies.get(key);
        state.bodies.set(key, null);
        Promise.resolve(models.templateFor(project(manager), normal, editor3D(manager))).then(template => {
            if (!template) return;
            const tiles = R.blockedTilesFor(template, template.userData.reactorSidecar, normal, direction || 2, 0, 0, true).map(tile => [tile.x, tile.y]);
            if (!tiles.some(tile => tile[0] || tile[1])) return;
            state.bodies.set(key, tiles);
            changed();
        }).catch(() => {});
        return null;
    }

    /** The shape of a unit's body as the checker takes it, for the unit in hand. */
    function handBody(manager, unit, direction) {
        const tiles = modelBody(manager, boundModel(manager, unit), direction);
        return tiles ? Check().toShape(tiles) : null;
    }

    /**
     * The tiles the map's placed models stand in the way on, `[[x, y,
     * lift], ...]`: each model's own measure, the tile it stands on and
     * the tiles it closes in (`RRBattleCheck.modelTiles`). Measured a few
     * at a time after the card opens; the list grows as they are.
     */
    function propTiles(manager, map) {
        const R = root.Reactor3D, models = root.RREventPreviewModels, C = Check();
        const props = ((map && map.reactor3d && Array.isArray(map.reactor3d.props) && map.reactor3d.props) || []).filter(prop => prop && prop.name && prop.passable !== true && prop.passable !== 'true');
        if (!props.length || !R || !R.blockedTilesFor || !R.normalizeModelSpec || !models) return [];
        const key = props.length + '|' + props.map(prop => [prop.id, prop.x, prop.y, prop.direction, prop.size, prop.scale].join(',')).join(';');
        if (state.propsKey === key && state.props) return state.props;
        state.propsKey = key;
        state.props = [];
        const turn = state.propsTurn = (state.propsTurn || 0) + 1, list = state.props, queue = props.slice();
        const home = project(manager), editor = editor3D(manager);
        const step = () => {
            if (turn !== state.propsTurn || !state.open) return;
            const until = Date.now() + 6;
            let waiting = false;
            while (queue.length && Date.now() < until && !waiting) {
                const prop = queue.shift(), normal = R.normalizeModelSpec(prop);
                if (!normal) continue;
                const mine = JSON.stringify([normal, prop.direction || 2, prop.x, prop.y]);
                const add = tiles => { for (const tile of tiles) list.push([tile[0], tile[1], Number(prop.z) || 0]); };
                if (state.propTiles.has(mine)) { add(state.propTiles.get(mine)); continue; }
                waiting = true;
                Promise.resolve(models.templateFor(home, normal, editor)).then(template => {
                    const tiles = template ? C.modelTiles(R.blockedTilesFor(template, template.userData.reactorSidecar, normal, prop.direction || 2, prop.x, prop.y), prop.x, prop.y) : [];
                    state.propTiles.set(mine, tiles);
                    if (turn === state.propsTurn) add(tiles);
                }).catch(() => {}).then(() => { if (turn === state.propsTurn) setTimeout(step, 0); });
            }
            if (!queue.length && !waiting) { changed(); return; }
            if (!waiting) setTimeout(step, 16);
        };
        setTimeout(step, 120);
        return list;
    }

    /** What the checker looks things up in: the Database, the game's 3D world and physics, the models' bodies and the look rule. */
    function lookupsFor(manager) {
        const data = dataOf(), map = manager && manager.currentMap;
        return {
            system: systemOf(), actors: data.actors || null, enemies: data.enemies || null, tilesets: data.tilesets || null, troops: data.troops || null,
            Reactor3D: root.Reactor3D || null, ReactorPhysics: root.ReactorPhysics || null,
            body: event => modelBody(manager, modelSpec(map, event, unitPage(unitOf(event))), facingOf(event)),
            props: () => propTiles(manager, map),
            lookOf: (event, unit) => { const look = lookOf(unit, event); return look ? (look.kind === 'picture' ? 'battler' : look.kind) : 'figure'; }
        };
    }

    /** The game's physics, which says where a body can stand on a 3D map: read once, the first time the card opens on one. */
    function wantPhysics(manager) {
        const map = manager && manager.currentMap, labels = root.RRMapEdgeLabels, editor = editor3D(manager);
        if (root.ReactorPhysics || state.physicsAsked || !map || !labels || typeof labels.load !== 'function' || !editor || !Check().is3D(map, {})) return;
        state.physicsAsked = true;
        Promise.resolve(labels.load(editor)).then(found => { if (found) changed(); else state.physicsAsked = false; }).catch(() => { state.physicsAsked = false; });
    }

    /** Who stands on which tile of the open map (RRBattleCheck.occupancy), kept until the events or the measures change. */
    function occupancyOf(manager) {
        const map = manager.currentMap;
        if (!state.occupancy || state.occupancyMap !== map) { state.occupancy = Check().occupancy(map, lookupsFor(manager)); state.occupancyMap = map; }
        return state.occupancy;
    }

    /** The map is read again: the sentence and its lines. */
    function recheck() {
        const manager = state.manager, map = manager && manager.currentMap;
        if (!map) { state.report = null; return null; }
        state.occupancy = null;
        state.report = Check().problems(map, lookupsFor(manager));
        if (state.open) drawFoot();
        return state.report;
    }

    //-------------------------------------------------------------------------
    // Where a click lands: where the preview stands.

    /**
     * Whether a placed model lies under the pointer nearer than `reach`
     * tiles from the eye: the pointer is on a tree, not on the ground seen
     * past it.
     */
    function modelUnder(editor, client, reach) {
        const THREE = root.THREE, group = editor && editor.propGroup;
        if (!THREE || !group || !group.children.length || !editor.camera || !editor.canvas || !client) return false;
        const map = editor.currentMap ? editor.currentMap() : null, placed = (map && map.reactor3d && map.reactor3d.props) || [];
        const passable = id => { const prop = placed.find(each => each && each.id === id); return !!prop && (prop.passable === true || prop.passable === 'true'); };
        const rect = editor.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const caster = state.caster || (state.caster = new THREE.Raycaster()), at = state.casterAt || (state.casterAt = new THREE.Vector2()), point = state.casterPoint || (state.casterPoint = new THREE.Vector3());
        caster.setFromCamera(at.set(((client.x - rect.left) / rect.width) * 2 - 1, -((client.y - rect.top) / rect.height) * 2 + 1), editor.camera);
        for (const child of group.children) {
            if (child.userData.propId === undefined) continue;
            const box = child.userData.pickBox || (child.userData.pickBox = new THREE.Box3().setFromObject(child));
            if (!caster.ray.intersectBox(box, point) || point.distanceTo(caster.ray.origin) > reach || passable(child.userData.propId)) continue;
            const hit = caster.intersectObject(child, true).find(each => !(each.object.userData && each.object.userData.__reactorOverlay));
            if (hit && hit.distance < reach - 0.05) return true;
        }
        return false;
    }

    /**
     * Whether a place to stand up on a tile of a 3D map is part of a
     * pitched roof, where a click stands nobody: a slab or a ramp that
     * slopes, or the roof's flat top (its ridge, however wide: open to the
     * sky, with a roof's slope running up to it from a tile beside it).
     * The tile's own floor never is; nor a deck, a bridge, an upper floor
     * or a flat roof no slope runs up to.
     */
    function roofAt(map, x, y, height) {
        const R = root.Reactor3D, P = root.ReactorPhysics;
        if (!map || !R || !P || typeof P.levelsAt !== 'function' || typeof R.roofSlopeAt !== 'function' || typeof R.groundHeightAt !== 'function' || !Number.isFinite(height)) return false;
        const key = y * 65536 + x + '@' + Math.round(height * 100);
        if (state.roofsMap !== map || state.roofsPieces !== (map.reactor3d && map.reactor3d.pieces)) { state.roofs.clear(); state.roofsMap = map; state.roofsPieces = map.reactor3d && map.reactor3d.pieces; }
        if (state.roofs.has(key)) return state.roofs.get(key);
        const levelAt = (cx, cy, top) => { const levels = P.levelsAt(map, cx, cy); for (let i = 1; i < levels.length; i++) if (Math.abs(levels[i].top - top) < 0.02) return levels[i]; return null; };
        const here = levelAt(x, y, height);
        let roof = false;
        if (here && here.slope > 0.05 && R.roofSlopeAt(map, x, y, here.top)) roof = true;
        else if (here && here.level && here.ceiling === Infinity) {
            // Over the flat top, tile by tile: a slope that is lower at its middle and ends at the top's height runs up to it.
            const seen = new Set([y * 65536 + x]), strip = [[x, y, here.top]];
            for (let at = 0; at < strip.length && !roof; at++) {
                const [cx, cy] = strip[at];
                for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (!(nx >= 0 && ny >= 0 && nx < map.width && ny < map.height)) continue;
                    for (const level of P.levelsAt(map, nx, ny)) {
                        if (!level.roof || !(level.top < here.top)) continue;
                        const edge = R.groundHeightAt(map, nx + 0.5 - dx * 0.49, ny + 0.5 - dy * 0.49, level.top);
                        if (Math.abs(edge - here.top) <= RIDGE_REACH) roof = true;
                    }
                    const beside = levelAt(nx, ny, here.top);
                    if (beside && beside.level && beside.ceiling === Infinity && !seen.has(ny * 65536 + nx) && strip.length < RIDGE_TILES) { seen.add(ny * 65536 + nx); strip.push([nx, ny, beside.top]); }
                }
            }
            // What was learned holds for every tile of the top that was looked at.
            for (const [cx, cy, top] of strip) state.roofs.set(cy * 65536 + cx + '@' + Math.round(top * 100), roof);
        }
        state.roofs.set(key, roof);
        return roof;
    }

    /**
     * What a click on a tile would do with the unit in hand: `{ ok, x, y,
     * height, z }` (the world height it would stand at on a 3D map, and
     * its Z over the tile's own floor), or `{ ok: false, why, whyText,
     * height }`. `where` is what the 3D view met under the pointer
     * (`{ height, level, client, editor }`: the surface's world height,
     * the water's level when it is water, the pointer and the view); none
     * for a click in the 2D view, which names a tile and no height.
     */
    function judge(manager, x, y, where) {
        const unit = inHand(), map = manager && manager.currentMap, C = Check();
        if (!unit || !map) return null;
        const direction = handFacing();
        const pointed = where && Number.isFinite(where.height) ? where.height : null, water = !!(where && Number.isFinite(where.level));
        const key = [x, y, pointed === null ? '' : Math.round(pointed * 20), water ? 'w' : '', unit.team, unit.record, unit.id, direction].join(',');
        const over = !!(where && where.editor && where.client && pointed !== null && modelUnderPointer(where, x, y, pointed, key));
        if (state.verdict && state.verdict.key === key && state.verdict.map === map && state.verdict.over === over) return state.verdict;
        const lookups = lookupsFor(manager), shape = handBody(manager, unit, direction), name = unitName(unit);
        // On water the place asked about is the tile's own floor, its bed: deep, nothing stands there.
        const options = Object.assign(pointed === null || water ? { any: true } : { height: pointed }, { body: shape, name, occupancy: occupancyOf(manager) });
        let stand = over ? { ok: false, why: 'taken', whyKey: 'battleCheck.why.taken', whyArgs: {} } : C.standing(map, x, y, options, lookups);
        // A roof takes nobody by a click: its flat ridge and a roofing slab the physics walks as level are the roof too.
        if (stand.ok && Number.isFinite(stand.height) && roofAt(map, x, y, stand.height)) stand = { ok: false, why: 'roof', whyKey: 'battleCheck.why.roof', whyArgs: {} };
        const verdict = { key, map, over, x, y, ok: !!stand.ok, body: shape, height: pointed, z: 0, why: '', whyText: '' };
        if (stand.ok) {
            if (Number.isFinite(stand.height)) verdict.height = stand.height;
            if (Number.isFinite(stand.height) && Number.isFinite(stand.ground)) verdict.z = Math.round(Math.max(0, stand.height - stand.ground) * 100) / 100;
        } else {
            verdict.why = stand.why;
            verdict.whyText = C.say({ key: stand.whyKey, args: stand.whyArgs }, checkWords);
        }
        state.verdict = verdict;
        return verdict;
    }

    /** Whether the pointer is on a placed model in front of the surface it named. Asked again 25 times a second at most while the pointer stays on one place; `where.sure` asks now. */
    function modelUnderPointer(where, x, y, height, key) {
        const editor = where.editor, camera = editor.camera, now = Date.now(), last = state.under;
        if (!camera) return false;
        if (!where.sure && last && last.key === key && now - last.at < 40) return last.over;
        const over = modelUnder(editor, where.client, Math.hypot(camera.position.x - (x + 0.5), camera.position.y - height, camera.position.z - (y + 0.5)));
        state.under = { key, at: now, over };
        return over;
    }

    /** What the 3D view met under the pointer, as `judge` takes it. */
    const whereOf = (editor, tile, client) => (tile && editor ? { height: Number.isFinite(tile.level) ? tile.level : tile.height, level: tile.level, client: client || null, editor } : null);

    /**
     * The Z a new event stands at on (x, y) when the pointer named a
     * surface at world `height` there: the place within a step of it a
     * body can stand on (a deck, a bridge, an upper floor, a flat roof),
     * over the tile's own floor. 0 where there is none: the tile's floor.
     */
    function liftAt(map, x, y, height) {
        if (!map || !Number.isFinite(height)) return 0;
        let stand = null;
        try { stand = Check().standing(map, x, y, { height, eventId: -1, occupancy: new Map() }, { Reactor3D: root.Reactor3D || null, ReactorPhysics: root.ReactorPhysics || null }); } catch (error) { stand = null; }
        return stand && stand.ok && Number.isFinite(stand.height) && Number.isFinite(stand.ground) ? Math.round(Math.max(0, stand.height - stand.ground) * 100) / 100 : 0;
    }

    /**
     * A new plain event opened from a click in the 3D view stands on the
     * surface the pointer named: the event editor's Z takes it. `tile` is
     * the 3D view's pick (`tileAt`).
     */
    function standNewEvent(manager, tile) {
        const editor = manager && manager.eventEditor, map = manager && manager.currentMap;
        if (!editor || !editor.needsInitialCommit || !editor.currentEvent || !tile || Number.isFinite(tile.level) || !Number.isFinite(tile.height) || !live3D(manager)) return 0;
        if (editor.currentEvent.x !== tile.x || editor.currentEvent.y !== tile.y) return 0;
        const z = liftAt(map, tile.x, tile.y, tile.height);
        if (!(z > 0)) return 0;
        editor.pendingZ = z;
        editor.pendingZBaseline = z;
        const field = typeof document !== 'undefined' ? document.getElementById('event-position-z') : null;
        if (field) field.value = String(z);
        return z;
    }

    /**
     * An event just put on the map from the 3D view (a Quick Event) stands
     * on the surface the pointer named: its Z is written. `tile` is the 3D
     * view's pick. Returns the Z, 0 on the tile's own floor.
     */
    function standEvent(manager, event, tile) {
        const map = manager && manager.currentMap, R = root.Reactor3D;
        if (!map || !event || !tile || tile.x !== event.x || tile.y !== event.y || Number.isFinite(tile.level) || !Number.isFinite(tile.height) || !live3D(manager) || !R || !R.setEventZ) return 0;
        const z = liftAt(map, tile.x, tile.y, tile.height);
        if (!(z > 0)) return 0;
        R.setEventZ(map, event.id, z);
        if (manager.renderEvents) manager.renderEvents();
        redrawEvents3D(manager);
        return z;
    }

    function commit(manager, event, z) {
        const map = manager.currentMap;
        if (!event || !map) return false;
        if (event.x < 0 || event.y < 0 || event.x >= map.width || event.y >= map.height) return false;
        if (manager.getEventAt(event.x, event.y)) return false;
        if (manager.canPlaceEvent && !manager.canPlaceEvent(event, event.x, event.y)) return false;
        const events = map.events || (map.events = []);
        if (events[event.id]) return false;
        manager.saveState();
        // An id is used again once its event is gone: what the map's 3D sidecar kept under it goes first.
        if (manager._setEventModels) manager._setEventModels(event.id, null);
        if (manager._setEventPlacement) manager._setEventPlacement(event.id, null);
        events[event.id] = event;
        state.occupancy = null;
        if (z > 0 && root.Reactor3D && root.Reactor3D.setEventZ) root.Reactor3D.setEventZ(map, event.id, z);
        // The first unit writes the start in force into the Note; what the Note and the sidecar said before is kept, for an undo of this step.
        const before = String(map.note || ''), side = map.reactor3d && map.reactor3d.battle ? map.reactor3d.battle.trigger : undefined;
        if (ensureStart(map)) state.started = { map, eventId: event.id, before, after: map.note, side, undone: false };
        manager.renderEvents();
        manager.selectEvent(event);
        return true;
    }

    /**
     * The start the first unit wrote into the Note belongs to that unit's
     * undo step: undone, the Note (and the sidecar's key) is as it was;
     * done again, the start is written again. A Note changed since by
     * anyone is left alone, and a unit taken off by hand keeps the tag.
     */
    function followUndo(manager) {
        const kept = state.started, map = manager && manager.currentMap;
        if (!kept || kept.map !== map) return false;
        const event = (map.events || []).find(each => each && each.id === kept.eventId);
        const there = !!event && !!unitOf(event);
        if (!there && !kept.undone) {
            // Gone with something to do again: it was undone. Gone with nothing to do again: it was taken off, and the tag stays.
            if (!(typeof manager.canRedo === 'function' && manager.canRedo()) || map.note !== kept.after) { state.started = null; return false; }
            map.note = kept.before;
            if (kept.side !== undefined) { const side = map.reactor3d || (map.reactor3d = {}); (side.battle || (side.battle = {})).trigger = kept.side; }
            kept.undone = true;
            return true;
        }
        if (there && kept.undone) {
            if (map.note !== kept.before) { state.started = null; return false; }
            ensureStart(map);
            kept.after = map.note;
            kept.undone = false;
            return true;
        }
        return false;
    }

    /**
     * A click on a tile in Event mode with a unit in hand: stands it where
     * its preview stands and answers true. A refused place answers true as
     * well (the click does nothing; the hint says why). False leaves the
     * click to the map. `where`: what the 3D view met (`whereOf`).
     */
    function placeAt(manager, x, y, where) {
        const unit = inHand();
        if (!unit || !manager || !manager.currentMap || manager.getEventAt(x, y)) return false;
        if (where) where.sure = true;
        const verdict = judge(manager, x, y, where || null);
        if (!verdict) return false;
        if (!verdict.ok) { drawHint(); return true; }
        if (state.pick) { endPick({ x, y, direction: state.pick.direction }); return true; }
        const data = dataOf(), brush = state.brush;
        const made = unitEvent(manager, brush, x, y, { actors: data.actors, enemies: data.enemies, direction: brush.direction });
        const small = where && where.editor ? tileOnScreen(where.editor, x, y, verdict.height) < TILE_SMALL : !where && tileOnMap(manager) < TILE_SMALL;
        if (!commit(manager, made.event, verdict.z)) return false;
        state.verdict = null;
        hover2D(manager, null);
        hover3D(editor3D(manager), null);
        // Placed from far off: the view comes in on the new unit.
        if (small && where) comeIn(where.editor, x, y, verdict.height);
        else if (small) comeIn2D(manager, x, y);
        render();
        return true;
    }

    /**
     * A right-click on a unit while one is in hand takes it off the map
     * (one undo step) and answers true.
     */
    function removeAt(manager, event) {
        if (!isOpen() || !state.brush || !manager || !event || !unitOf(event)) return false;
        manager.deleteEvent(event);
        state.occupancy = null; state.verdict = null;
        render();
        return true;
    }

    /** Turns the selected unit: to `direction`, or a quarter turn on without one. One undo step. */
    function turnSelected(direction) {
        const manager = state.manager, event = manager && manager.selectedEvent;
        if (!isOpen() || !event || !unitOf(event)) return false;
        const next = direction || turned(facingOf(event));
        if (next === facingOf(event)) return true;
        manager.saveState();
        face(event, next);
        manager.renderEvents();
        redrawEvents3D(manager);
        render();
        return true;
    }

    /** Turns what is in hand a quarter turn (`step` 1 or -1). */
    function turnHand(step) {
        const hand = state.pick || state.brush;
        if (!hand) return false;
        hand.direction = turned(hand.direction || 2, step);
        state.verdict = null;
        if (state.lastHover) state.lastHover();
        return true;
    }

    //-------------------------------------------------------------------------
    // The view.

    /** A map tile's width on the screen at a place of the 3D view, in pixels. */
    function tileOnScreen(editor, x, y, height) {
        const THREE = root.THREE, camera = editor && editor.camera, canvas = editor && editor.canvas;
        if (!THREE || !camera || !canvas) return TILE_WORK;
        const rect = canvas.getBoundingClientRect(), h = Number.isFinite(height) ? height : 0;
        const a = new THREE.Vector3(x + 0.5, h, y + 0.5), eye = camera.position;
        // Across the line of sight, so a tile seen from a low angle is not taken for a small one.
        const away = new THREE.Vector3(a.x - eye.x, 0, a.z - eye.z);
        const across = away.lengthSq() > 1e-6 ? new THREE.Vector3(-away.z, 0, away.x).normalize() : new THREE.Vector3(1, 0, 0);
        const b = a.clone().add(across);
        a.project(camera); b.project(camera);
        return Math.hypot((a.x - b.x) * rect.width / 2, (a.y - b.y) * rect.height / 2);
    }

    /** The 3D view moves in on a place until a tile there is about the working size. */
    function comeIn(editor, x, y, height) {
        const view = editor && editor.view, size = tileOnScreen(editor, x, y, height);
        if (!view || !view.target || !(size > 0) || !(view.distance > 0)) return;
        view.target.x = x + 0.5; view.target.z = y + 0.5;
        if (Number.isFinite(height)) view.target.y = height;
        if (editor.applyCamera) editor.applyCamera();
        const now = tileOnScreen(editor, x, y, height);
        if (now > 0 && now < TILE_WORK) view.distance = Math.max(4, view.distance * now / TILE_WORK);
        if (editor.applyCamera) editor.applyCamera();
        if (editor.requestRender) editor.requestRender();
    }

    /** A map tile's width on the screen in the 2D view, in pixels. */
    function tileOnMap(manager) {
        const tilemap = manager && manager.tilemapManager, container = tilemap && tilemap.container;
        const scale = container && container.scale ? Number(container.scale.x) || 1 : 1;
        return (tilemap && Number(tilemap.TILE_WIDTH) > 0 ? Number(tilemap.TILE_WIDTH) : TILE_WORK) * scale;
    }

    /** The zoom of the 2D view at which a tile is `pixels` wide, kept inside what the view allows. */
    function zoomFor(tilemap, pixels, size) {
        const least = typeof tilemap.minimumZoomScale === 'function' ? Number(tilemap.minimumZoomScale(size.width, size.height)) || 0 : 0;
        return Math.max(least, Math.min(5, pixels / tilemap.TILE_WIDTH));
    }

    /** The 2D view shows a place of the map (in tiles) in its middle at a zoom. True when it did. */
    function show2D(manager, cx, cy, zoomOf) {
        const tilemap = manager && manager.tilemapManager, container = tilemap && tilemap.container;
        if (!container || typeof tilemap.setViewportTransform !== 'function' || typeof tilemap.viewportSize !== 'function') return false;
        const size = tilemap.viewportSize();
        if (!size || !(size.width > 0) || !(size.height > 0)) return false;
        const zoom = zoomOf(tilemap, size), before = container.scale ? container.scale.x : 1;
        tilemap.setViewportTransform(size.width / 2 - cx * tilemap.TILE_WIDTH * zoom, size.height / 2 - cy * tilemap.TILE_HEIGHT * zoom, zoom);
        if (tilemap.updateScrollbars) tilemap.updateScrollbars();
        if (zoom !== before && typeof tilemap.onZoomChange === 'function') tilemap.onZoomChange(zoom);
        return true;
    }

    /** The 2D view moves in on a tile until a tile is about the working size. */
    const comeIn2D = (manager, x, y) => show2D(manager, x + 0.5, y + 0.5, (tilemap, size) => zoomFor(tilemap, TILE_WORK, size));

    /** Brings one event into view and selects it. */
    function showEvent(manager, eventId) {
        const map = manager && manager.currentMap, event = map && (map.events || []).find(each => each && each.id === Number(eventId));
        if (!event) return false;
        manager.selectEvent(event);
        const editor = live3D(manager);
        if (editor) {
            if (typeof editor.frameEvent === 'function') editor.frameEvent(event.id);
            else {
                const R = root.Reactor3D, ground = R && R.groundHeightAt ? R.groundHeightAt(map, event.x + 0.5, event.y + 0.5) || 0 : 0;
                comeIn(editor, event.x, event.y, ground + (R && R.eventZAt ? R.eventZAt(map, event.id) || 0 : 0));
            }
        } else if (manager.centerOnEvent) manager.centerOnEvent(event);
        render();
        return true;
    }

    /** Brings every unit on the map into view. */
    function showAll(manager) {
        const map = manager && manager.currentMap, units = ((map && map.events) || []).filter(event => event && unitOf(event));
        if (!units.length) return false;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const event of units) { x0 = Math.min(x0, event.x); x1 = Math.max(x1, event.x); y0 = Math.min(y0, event.y); y1 = Math.max(y1, event.y); }
        const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, span = Math.max(x1 - x0, y1 - y0) + 6;
        const editor = live3D(manager);
        if (editor && editor.view && editor.view.target) {
            const R = root.Reactor3D;
            editor.view.target.x = cx; editor.view.target.z = cy;
            editor.view.target.y = R && R.groundHeightAt ? R.groundHeightAt(map, cx, cy) || 0 : 0;
            editor.view.distance = Math.max(14, span * 1.6);
            if (editor.applyCamera) editor.applyCamera();
            if (editor.requestRender) editor.requestRender();
        } else {
            // As large as shows them all, and no larger than the working size.
            show2D(manager, cx, cy, (tilemap, size) => zoomFor(tilemap, Math.min(TILE_WORK, size.width / (x1 - x0 + 3), size.height / (y1 - y0 + 3)), size));
        }
        return true;
    }

    //-------------------------------------------------------------------------
    // The preview under the pointer.

    /**
     * How much larger than life a preview is drawn, so it is never under
     * `PREVIEW_MIN` pixels tall: `tilePixels` is a map tile's width on the
     * screen where it stands, `tall` its own height in tiles. 1 wherever
     * it already shows that tall.
     */
    function previewGrow(tilePixels, tall) {
        const pixels = tilePixels * tall;
        return pixels > 0 && pixels < PREVIEW_MIN ? PREVIEW_MIN / pixels : 1;
    }

    /**
     * A preview's model made faint: its own materials turn see-through as
     * they are, so the look its record's variant gives it (its picture and
     * its colors, which live in the material's program) is the one drawn;
     * a refused one is gray. `own`: the instance has materials of its own
     * (the game's clone gives it them); else each is copied first.
     */
    function fadeModel(model, ok, own) {
        model.traverse(node => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            if (!materials.length) return;
            // After the world's own see-through things (water, glass): over a lake the preview is not painted out by the water behind it.
            node.renderOrder = PREVIEW_ORDER;
            const faded = materials.map(material => {
                const mine = own ? material : material.clone();
                mine.transparent = true;
                mine.opacity = ok ? 0.6 : 0.3;
                mine.depthWrite = false;
                if (!ok && mine.color) mine.color.setHex(REFUSED);
                mine.needsUpdate = true;
                return mine;
            });
            node.material = Array.isArray(node.material) ? faded : faded[0];
        });
        return model;
    }

    /**
     * A preview model's height over its tile, in tiles, as it stands
     * (not yet in the scene): every vertex where its bones put it, since a
     * rigged model's box as its file states it can be far off. Measured
     * once per look.
     */
    function modelTall(model, key) {
        if (state.talls.has(key)) return state.talls.get(key);
        const THREE = root.THREE;
        let tall = 0;
        try {
            model.updateMatrixWorld(true);
            const top = new THREE.Box3().setFromObject(model, true).max.y;
            if (Number.isFinite(top) && top > 0) tall = top;
        } catch (error) { tall = 0; }
        if (!(tall > 0)) {
            const extent = model.userData && model.userData.glbSize;
            tall = extent && extent.y > 0 ? extent.y * Math.abs(model.scale.y || 1) : 1.5;
        }
        state.talls.set(key, tall);
        return tall;
    }

    // The ghost's place among the model layer's records: no event or placed model has this id.
    const GHOST_ID = -2147483000;
    /** The unit a click would place, as a record for the 2D model layer; null while there is none. */
    const ghostProp = () => state.ghostProp || null;
    const handKey = unit => (unit ? `${unit.team}:${unit.record}:${unit.id}` : '');
    const unitTitle = event => { const unit = unitOf(event); return unit ? `${say('side.' + unit.team)} · ${pad(event.id)}: ${event.name || ''}` : ''; };

    /**
     * The 2D map's pointer over a tile (null: gone). With a unit in hand,
     * its look stands on the tile a click would stand it on, on a ring in
     * its side's color with the tiles its body covers; gray with a bar
     * through the ring where the click would do nothing. Over a unit, the
     * view names it.
     */
    function hover2D(manager, tile) {
        const PIXI = root.PIXI, tilemap = manager && manager.tilemapManager, parent = tilemap && tilemap.container;
        if (!PIXI || !parent) return;
        const unit = inHand();
        if (!unit && !state.ghost2D && !state.ghostProp && !state.showUnits) return;
        state.lastHover = tile && unit ? () => hover2D(manager, tile) : null;
        const canvas = tilemap.app && (tilemap.app.canvas || tilemap.app.view);
        const over = tile ? manager.getEventAt(tile.x, tile.y) : null;
        if (canvas) { const title = over && state.showUnits ? unitTitle(over) : ''; if (canvas.title !== title) canvas.title = title; }
        let ghost = state.ghost2D;
        if (ghost && (ghost.destroyed || ghost.parent !== parent)) { if (!ghost.destroyed) ghost.destroy({ children: true }); ghost = state.ghost2D = null; state.ghostKey2D = ''; }
        // On a map whose models are drawn by the model layer, the ghost's model is one more of them, faint.
        const props = manager.projectController && manager.projectController.modelPropsManager;
        const layer = props && props.currentMap === manager.currentMap && props.render ? props : null;
        const fade = () => { const sprite = layer && layer.preview2D && layer.preview2D.entries && layer.preview2D.entries.get(GHOST_ID) && layer.preview2D.entries.get(GHOST_ID).sprite; if (sprite) sprite.alpha = 0.55; return !!sprite; };
        const stand = prop => {
            const was = state.ghostProp, same = (!was && !prop) || (was && prop && was.name === prop.name && was.x === prop.x && was.y === prop.y && was.direction === prop.direction);
            state.ghostProp = prop;
            if (!same && layer) layer.render();
            if (prop && layer && !fade()) setTimeout(() => { if (state.ghostProp === prop && fade() && tilemap.requestRender) tilemap.requestRender(); }, 400);
        };
        if (!unit || !tile || over) {
            const shown = !!(ghost && ghost.visible);
            if (ghost) ghost.visible = false;
            stand(null);
            if (state.verdict) { state.verdict = null; drawHint(); }
            if (shown && tilemap.requestRender) tilemap.requestRender();
            return;
        }
        const before = state.verdict, verdict = judge(manager, tile.x, tile.y, null), direction = handFacing();
        if (verdict !== before) drawHint();
        const tw = tilemap.TILE_WIDTH, th = tilemap.TILE_HEIGHT, zoom = parent.scale ? parent.scale.x || 1 : 1;
        const bound = boundModel(manager, unit), color = verdict.ok ? colorNumber(TEAM_COLORS[unit.team]) : REFUSED;
        stand(bound && layer && verdict.ok ? Object.assign({}, bound, { id: GHOST_ID, x: tile.x, y: tile.y, size: Number(bound.size) > 0 ? Number(bound.size) : 2, scale: Number(bound.scale) > 0 ? Number(bound.scale) : 1, z: 0, direction }) : null);
        const key = [handKey(unit), direction, verdict.ok, verdict.body ? verdict.body.count : 1].join('|');
        if (!ghost || state.ghostKey2D !== key) {
            if (ghost) ghost.destroy({ children: true });
            ghost = state.ghost2D = new PIXI.Container();
            ghost.label = 'battle setup ghost';
            ghost.eventMode = 'none';
            state.ghostKey2D = key;
            state.ghostTall2D = 0;
            const base = new PIXI.Graphics();
            // The tiles the body covers.
            const shape = verdict.body;
            if (shape && shape.count > 1) {
                for (let j = 0; j < shape.h; j++) for (let i = 0; i < shape.w; i++) {
                    if (shape.cells && !shape.cells[j * shape.w + i]) continue;
                    base.rect((shape.ox + i) * tw + 1, (shape.oy + j) * th + 1, tw - 2, th - 2);
                    base.fill({ color, alpha: 0.18 });
                    base.rect((shape.ox + i) * tw + 1, (shape.oy + j) * th + 1, tw - 2, th - 2);
                    base.stroke({ width: 1, color, alpha: 0.7 });
                }
            }
            drawRing(base, tw / 2, th / 2, tw, th, color, direction, 0.9, !verdict.ok);
            ghost.addChild(base);
            // Its look: the model through the model layer, else the record's picture.
            const made = ghost;
            if (!(bound && layer && verdict.ok)) {
                artOf(unit, direction).then(art => {
                    if (!art || state.ghost2D !== made || made.destroyed) return;
                    const sprite = new PIXI.Sprite(PIXI.Texture.from(art.canvas));
                    // A battler picture or the figure fits its tile; a model's picture is 64 pixels to the tile; a character is its own size.
                    const own = art.kind === 'model' ? tw / 64 : 1;
                    const fit = art.tiles ? Look().fit(art.canvas.width, art.canvas.height, tw, th, 1) : { width: art.canvas.width * own, height: art.canvas.height * own };
                    sprite.anchor.set(0.5, 1);
                    sprite.width = fit.width; sprite.height = fit.height;
                    sprite.x = tw / 2; sprite.y = th - (art.kind === 'character' ? 6 : 2);
                    sprite.alpha = verdict.ok ? 0.75 : 0.45;
                    if (!verdict.ok) sprite.tint = REFUSED;
                    made.addChild(sprite);
                    state.ghostTall2D = fit.height;
                    if (tilemap.requestRender) tilemap.requestRender();
                });
            }
            parent.addChild(ghost);
        }
        // Never smaller on the screen than can be seen.
        const grow = previewGrow(th * zoom, (state.ghostTall2D || th * 1.5) / th);
        ghost.scale.set(grow);
        ghost.x = tile.x * tw - (grow - 1) * tw / 2;
        ghost.y = tile.y * th - (grow - 1) * th;
        ghost.visible = true;
        if (tilemap.requestRender) tilemap.requestRender();
    }

    function disposeGhost3D(ghost) {
        ghost.traverse(node => {
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const material of materials) { if (material && material.map && material.userData && material.userData.ownMap) material.map.dispose(); if (material && material.dispose) material.dispose(); }
            if (node.skeleton && typeof node.skeleton.dispose === 'function') node.skeleton.dispose();
            if (node.userData && node.userData.ownGeometry && node.geometry) node.geometry.dispose();
        });
    }

    /**
     * The 3D view's pointer over a tile (null: gone): the unit in hand as
     * it will stand, on the surface the pointer met (a floor, a deck, a
     * roof), where a click would stand it. `pointed` is the event under
     * the pointer, `client` the pointer on the screen.
     */
    function hover3D(editor, tile, pointed, client) {
        const THREE = root.THREE, R = root.Reactor3D;
        if (!editor || !editor.canvas) return;
        const manager = editor.eventManager ? editor.eventManager() : state.manager, map = editor.currentMap ? editor.currentMap() : null;
        state.lastHover = tile && inHand() ? () => hover3D(editor, tile, pointed, client) : null;
        const over = pointed || (tile && manager ? manager.getEventAt(tile.x, tile.y) : null);
        const title = over && state.showUnits ? unitTitle(over) : '';
        if (editor.canvas.title !== title) editor.canvas.title = title;
        const unit = inHand();
        const scene = editor.mapScene && editor.mapScene.scene ? editor.mapScene.scene() : null;
        let ghost = state.ghost3D;
        if (!THREE || !R || !scene || !map || !unit || !tile || over) {
            if (ghost && ghost.visible) { ghost.visible = false; if (editor.requestRender) editor.requestRender(); }
            if (state.verdict && (!unit || !tile || over)) { state.verdict = null; drawHint(); }
            return;
        }
        const before = state.verdict, verdict = judge(manager, tile.x, tile.y, whereOf(editor, tile, client)), direction = handFacing();
        if (verdict !== before) drawHint();
        const look = lookOf(unit, null), spec = look && look.kind === 'model' ? look.spec : null, normal = spec && R.normalizeModelSpec ? R.normalizeModelSpec(spec) : null;
        const key = [handKey(unit), direction, verdict.ok, verdict.body ? verdict.body.count : 1, normal ? [normal.name, normal.ext, normal.file, normal.variant || '', normal.size, normal.scale].join('|') : look ? look.kind : ''].join('|');
        if (!ghost || state.ghostKey3D !== key) {
            if (ghost) { if (ghost.parent) ghost.parent.remove(ghost); disposeGhost3D(ghost); }
            ghost = state.ghost3D = new THREE.Group();
            state.ghostKey3D = key;
            // Its height once measured is known at once: a preview built again (another facing, a refused place) keeps its size.
            state.ghostTall3D = (normal && state.talls.get(JSON.stringify(normal))) || 1.5;
            ghost.userData.__reactorOverlay = true;
            ghost.userData.placementGhost = true;
            ghost.userData.refused = !verdict.ok;
            const color = verdict.ok ? colorNumber(TEAM_COLORS[unit.team]) : REFUSED;
            const flat = (geometry, opacity, y) => {
                const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }));
                mesh.userData.ownGeometry = true;
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.y = y;
                mesh.renderOrder = 998;
                ghost.add(mesh);
                return mesh;
            };
            // The tiles the body covers, then the ring, with a notch the way it faces or a bar through it where nothing can be stood.
            const shape = verdict.body;
            if (shape && shape.count > 1) {
                for (let j = 0; j < shape.h; j++) for (let i = 0; i < shape.w; i++) {
                    if (shape.cells && !shape.cells[j * shape.w + i]) continue;
                    flat(new THREE.PlaneGeometry(0.94, 0.94), 0.22, 0.03).position.set(shape.ox + i, 0.03, shape.oy + j);
                }
            }
            flat(new THREE.RingGeometry(0.34, 0.47, 40), 0.9, 0.04);
            if (verdict.ok) {
                const d = direction === 4 ? [-1, 0] : direction === 6 ? [1, 0] : direction === 8 ? [0, -1] : [0, 1];
                const notch = flat(new THREE.CircleGeometry(0.13, 3), 0.95, 0.045);
                notch.position.set(d[0] * 0.56, 0.045, d[1] * 0.56);
                notch.rotation.z = Math.atan2(-d[1], d[0]);
            } else {
                const bar = flat(new THREE.PlaneGeometry(0.9, 0.09), 0.95, 0.05);
                bar.rotation.z = Math.PI / 4;
            }
            const made = ghost;
            if (normal && root.RREventPreviewModels) {
                root.RREventPreviewModels.templateFor(project(manager), normal, editor).then(template => {
                    if (!template || state.ghost3D !== made) return;
                    const model = fadeModel(root.RREventPreviewModels.instance(template, normal, direction), verdict.ok, typeof R.cloneModelTemplate === 'function');
                    const offset = normal.offset || [0, 0, 0];
                    model.position.set(offset[0], offset[2], offset[1]);
                    state.ghostTall3D = modelTall(model, JSON.stringify(normal));
                    made.add(model);
                    made.updateMatrixWorld(true);
                    if (state.lastHover) state.lastHover(); else if (editor.requestRender) editor.requestRender();
                }).catch(() => {});
            } else {
                // No model: the record's picture stands on the tile, turned to the eye.
                artOf(unit, direction).then(art => {
                    if (!art || state.ghost3D !== made) return;
                    const texture = new THREE.CanvasTexture(art.canvas);
                    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
                    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: verdict.ok ? 0.85 : 0.5, depthWrite: false, fog: false });
                    material.userData.ownMap = true;
                    if (!verdict.ok) material.color.setHex(REFUSED);
                    const sprite = new THREE.Sprite(material), pixels = (manager.tilemapManager && manager.tilemapManager.TILE_WIDTH) || 48;
                    const fit = art.tiles ? Look().fit(art.canvas.width, art.canvas.height, pixels, pixels, 1) : { width: art.canvas.width, height: art.canvas.height };
                    sprite.center.set(0.5, 0);
                    sprite.scale.set(fit.width / pixels, fit.height / pixels, 1);
                    sprite.renderOrder = 999;
                    made.add(sprite);
                    state.ghostTall3D = fit.height / pixels;
                    made.updateMatrixWorld(true);
                    if (state.lastHover) state.lastHover(); else if (editor.requestRender) editor.requestRender();
                });
            }
        }
        if (ghost.parent !== scene) scene.add(ghost);
        // On the place it would stand at; a refused one, on the surface the pointer met.
        const ground = R.groundHeightAt ? R.groundHeightAt(map, tile.x + 0.5, tile.y + 0.5) : R.elevationAt(map, tile.x, tile.y);
        const height = Number.isFinite(verdict.height) ? verdict.height : ground;
        ghost.position.set(tile.x + 0.5, height, tile.y + 0.5);
        // Never smaller on the screen than can be seen; life size wherever it shows that tall.
        ghost.scale.setScalar(previewGrow(tileOnScreen(editor, tile.x, tile.y, height), state.ghostTall3D || 1.5));
        // The view draws with the scene's own matrix updates off: a thing that moves says so itself.
        ghost.updateMatrixWorld(true);
        ghost.visible = true;
        if (editor.requestRender) editor.requestRender();
    }

    //-------------------------------------------------------------------------
    // The card's parts.

    const part = name => (state.parts && state.parts[name]) || null;
    const optionsHtml = (list, current) => list.map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === String(current) ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');

    function drawMode() {
        const host = part('mode'), map = state.manager && state.manager.currentMap;
        if (!host || !map) return;
        const C = Check(), inForce = modeInForce(map, systemOf()), is3D = C.is3D(map, {});
        const own = inForce.from === 'map' ? inForce.mode : '';
        const choices = modeChoices(inForce, is3D || own === 'firstPerson').map(([value, key, args]) => [value, say(key, args)]);
        host.innerHTML = `<div class="rr-battle-setup-grid"><label for="rr-battle-setup-mode">${escapeHtml(say('mode'))}</label>`
            + `<select id="rr-battle-setup-mode" class="database-field-value rr-battle-setup-mode" title="${escapeHtml(playsLine(inForce))}">${optionsHtml(choices, own)}</select></div>`;
        host.querySelector('select').addEventListener('change', event => {
            if (setMode(map, event.target.value || null)) noteChanged();
            else render();
        });
    }

    /** The tiles: the Database's records for the side being placed, each as its look with its name under it. */
    function drawTiles() {
        const host = part('tiles');
        if (!host) return;
        const found = tileRecords(state.team, dataOf(), state.search), brush = state.brush;
        const key = JSON.stringify([state.team, state.search, found.total, found.groups.map(group => group.list.map(entry => [entry.record, entry.id, entry.name]))]);
        const sides = [['enemy', say('enemies')], ['ally', say('side.ally')], ['neutral', say('side.neutral')]];
        if (state.tilesKey !== key) {
            state.tilesKey = key;
            if (state.tileWatch) { state.tileWatch.disconnect(); state.tileWatch = null; }
            const searching = found.total > SEARCH_ABOVE || !!state.search;
            const empty = !found.total
                ? `<div class="rr-battle-setup-empty">${escapeHtml(say('noEnemies'))}<button type="button" class="rr-btn-secondary rr-battle-setup-new">${escapeHtml(say('newEnemy'))}</button></div>`
                : !found.groups.length ? `<div class="rr-battle-setup-empty">${escapeHtml(say('noMatch'))}</div>` : '';
            const groups = found.groups.map(group => (state.team === 'enemy' ? '' : `<div class="rr-battle-setup-group">${escapeHtml(say(group.record === 'actor' ? 'actors' : 'enemies'))}</div>`)
                + '<div class="rr-battle-setup-row">' + group.list.map(entry =>
                    `<button type="button" class="rr-battle-setup-tile" data-record="${entry.record}" data-id="${entry.id}" title="${escapeHtml(String(entry.id).padStart(4, '0') + ': ' + entry.name)}" aria-pressed="false">`
                    + `<canvas width="136" height="136"></canvas><span class="rr-battle-setup-name">${escapeHtml(entry.name)}</span></button>`).join('') + '</div>').join('');
            host.innerHTML = `<div class="rr-battle-setup-tiles-head"><select class="database-field-value rr-battle-setup-side" aria-label="${escapeHtml(say('placeAs'))}" title="${escapeHtml(say('placeAs'))}">${optionsHtml(sides, state.team)}</select>`
                + (searching ? `<input type="search" class="database-field-value rr-battle-setup-search" placeholder="${escapeHtml(say('search'))}" aria-label="${escapeHtml(say('search'))}" value="${escapeHtml(state.search)}">` : '') + '</div>'
                + `<div class="rr-battle-setup-tiles rr-accent-scrollbar">${empty}${groups}</div>`;
            host.querySelector('.rr-battle-setup-side').addEventListener('change', event => {
                state.team = event.target.value;
                state.brush = null; state.search = ''; state.verdict = null;
                hover2D(state.manager, null); hover3D(editor3D(state.manager), null);
                drawTiles(); drawHint();
            });
            const search = host.querySelector('.rr-battle-setup-search');
            if (search) search.addEventListener('input', () => { state.search = search.value; drawTiles(); const again = part('tiles').querySelector('.rr-battle-setup-search'); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } });
            const fresh = host.querySelector('.rr-battle-setup-new');
            if (fresh) fresh.addEventListener('click', () => openDatabase('enemies', 0, true));
            host.querySelectorAll('.rr-battle-setup-tile').forEach(button => button.addEventListener('click', () => {
                const next = { team: state.team, record: button.dataset.record, id: Number(button.dataset.id), direction: 2 };
                state.brush = state.brush && handKey(state.brush) === handKey(next) ? null : next;
                state.verdict = null;
                if (!state.brush) { hover2D(state.manager, null); hover3D(editor3D(state.manager), null); }
                drawTiles(); drawHint();
            }));
            // A tile's picture is made when the tile comes into view.
            const scroller = host.querySelector('.rr-battle-setup-tiles');
            const paint = button => {
                if (button.dataset.painted) return;
                button.dataset.painted = '1';
                const unit = { team: state.team, record: button.dataset.record, id: Number(button.dataset.id) };
                state.painting = (state.painting || Promise.resolve()).then(afterFrame).then(() => (button.isConnected ? artOf(unit, 2) : null)).then(art => {
                    const canvas = button.querySelector('canvas');
                    if (!art || !canvas || !button.isConnected) return;
                    const context = canvas.getContext('2d'), room = canvas.width - 12;
                    const scale = Math.min(room / art.canvas.width, room / art.canvas.height);
                    const w = art.canvas.width * scale, h = art.canvas.height * scale;
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.imageSmoothingEnabled = art.kind !== 'character';
                    context.drawImage(art.canvas, (canvas.width - w) / 2, canvas.height - 6 - h, w, h);
                    button.dataset.look = art.kind;
                }).catch(() => {});
            };
            if (typeof IntersectionObserver !== 'undefined' && scroller) {
                state.tileWatch = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { paint(entry.target); state.tileWatch.unobserve(entry.target); } }, { root: scroller, rootMargin: '80px' });
                host.querySelectorAll('.rr-battle-setup-tile').forEach(button => state.tileWatch.observe(button));
            } else host.querySelectorAll('.rr-battle-setup-tile').forEach(paint);
        }
        host.querySelectorAll('.rr-battle-setup-tile').forEach(button => {
            const on = !!brush && brush.team === state.team && brush.record === button.dataset.record && Number(brush.id) === Number(button.dataset.id);
            button.classList.toggle('is-on', on);
            button.setAttribute('aria-pressed', String(on));
        });
    }

    /** The one line under the tiles: the next step, or why the place under the pointer is refused. */
    function drawHint() {
        const unit = inHand(), verdict = state.verdict;
        const refused = !!unit && !!verdict && !verdict.ok;
        const text = refused ? verdict.whyText
            : state.pick ? say('hint.tile', { name: unitName(unit) })
                : unit ? say('hint.place', { name: unitName(unit) })
                    : say(state.team === 'enemy' ? 'hint.pick' : 'hint.pickAny');
        const host = part('hint');
        if (host && host.textContent !== text) host.textContent = text;
        if (host) { host.classList.toggle('is-armed', !!unit && !refused); host.classList.toggle('is-refused', refused); }
        const banner = state.pick && state.pick.banner;
        if (banner && banner.textContent !== text) banner.textContent = text;
        if (banner) banner.classList.toggle('is-refused', refused);
    }

    /** The selected unit: its name, the way it faces, Remove. */
    function drawUnit() {
        const host = part('unit'), manager = state.manager;
        if (!host) return;
        const picked = manager && manager.selectedEvent && unitOf(manager.selectedEvent) ? manager.selectedEvent : null;
        state.shownId = picked ? picked.id : 0;
        host.hidden = !picked;
        if (!picked) { host.innerHTML = ''; return; }
        // The number tells two units of one record apart: it is never the part cut short.
        host.innerHTML = `<div class="rr-battle-setup-unit-head"><span class="rr-battle-setup-unit-name" title="${escapeHtml(unitTitle(picked))}"><span class="rr-battle-setup-unit-text">${escapeHtml(picked.name || '')}</span><span class="rr-battle-setup-unit-id">(${pad(picked.id)})</span></span>`
            + `<button type="button" class="rr-btn-secondary rr-battle-setup-remove">${escapeHtml(say('remove'))}</button></div>`
            + `<div class="rr-battle-setup-grid"><span class="rr-battle-setup-unit-label">${escapeHtml(say('facing'))}</span><span class="rr-battle-setup-facing">`
            + [[4, '◀', 'left'], [8, '▲', 'up'], [2, '▼', 'down'], [6, '▶', 'right']].map(([direction, mark, label]) =>
                `<button type="button" class="map-props-btn${facingOf(picked) === direction ? ' active' : ''}" data-face="${direction}" title="${escapeHtml(say(label))}" aria-label="${escapeHtml(say(label))}" aria-pressed="${facingOf(picked) === direction}">${mark}</button>`).join('')
            + '</span></div>';
        host.querySelectorAll('[data-face]').forEach(button => button.addEventListener('click', () => turnSelected(Number(button.dataset.face))));
        host.querySelector('.rr-battle-setup-remove').addEventListener('click', () => { manager.deleteEvent(picked); render(); });
    }

    /** Starts, and the distance when the party coming near is what starts the battle. */
    function drawStart() {
        const host = part('start'), map = state.manager && state.manager.currentMap;
        if (!host || !map) return;
        const start = startOf(map);
        const tiles = start.kind === 'near' ? start.tiles : DISTANCE;
        const starts = [['near', say('starts.near', { tiles })], ['open', say('starts.open')], ['event', say('starts.event')]];
        host.innerHTML = `<div class="rr-battle-setup-grid"><label for="rr-battle-setup-starts">${escapeHtml(say('starts'))}</label>`
            + `<select id="rr-battle-setup-starts" class="database-field-value rr-battle-setup-starts">${optionsHtml(starts, start.kind)}</select>`
            + (start.kind === 'near' ? `<label for="rr-battle-setup-distance">${escapeHtml(say('distance'))}</label><span class="rr-battle-setup-distance"><input type="number" id="rr-battle-setup-distance" class="database-field-value" data-no-stepper min="1" max="${DISTANCE_MAX}" step="1" value="${tiles}"><span>${escapeHtml(say('tiles'))}</span></span>` : '')
            + '</div>';
        host.querySelector('.rr-battle-setup-starts').addEventListener('change', event => {
            const kind = event.target.value;
            if (setStart(map, kind === 'open' ? 'open' : kind === 'event' ? 0 : tiles)) noteChanged();
            else render();
        });
        const distance = host.querySelector('#rr-battle-setup-distance');
        if (distance) distance.addEventListener('change', () => {
            const asked = Math.max(1, Math.min(DISTANCE_MAX, Math.floor(Number(distance.value) || DISTANCE)));
            if (setStart(map, asked)) noteChanged();
            else render();
        });
    }

    /** The sentence, the lines under it with their buttons, and Play this battle. */
    function drawFoot() {
        const host = part('foot'), manager = state.manager;
        if (!host || !manager) return;
        const report = state.report, C = Check();
        const parts = sentenceParts(report, checkWords);
        const told = [];
        const lines = ((report && report.lines) || []).map((line, index) => {
            const why = line.whyKey ? ' ' + C.say({ key: line.whyKey, args: line.whyArgs }, checkWords) : '';
            const text = C.say(line, checkWords) + why;
            if (line.level === 'note' && !line.fix) { told.push(text); return ''; }
            const button = line.fix ? `<button type="button" class="rr-btn-secondary rr-battle-setup-fix" data-line="${index}">${escapeHtml(C.say({ key: line.fix.labelKey, args: {} }, checkWords))}</button>` : '';
            return `<div class="rr-battle-setup-line is-${line.level === 'note' ? 'note' : 'fix'}"><span>${escapeHtml(text)}</span>${button}</div>`;
        }).join('');
        const spot = report && report.count.enemy > 0 ? spotFor(manager, report) : null;
        host.innerHTML = `<div class="rr-battle-setup-sentence${parts.level === 'warn' ? ' is-warn' : ''}" role="status"${told.length ? ` title="${escapeHtml(told.join('\n'))}"` : ''}>`
            + (parts.count ? `<button type="button" class="rr-battle-setup-count" title="${escapeHtml(say('showAll'))}">${escapeHtml(parts.count)}</button> ` : '') + `<span>${escapeHtml(parts.rest)}</span></div>`
            + (lines ? `<div class="rr-battle-setup-lines rr-accent-scrollbar">${lines}</div>` : '')
            + `<button type="button" class="rr-button-primary rr-battle-setup-play"${spot ? '' : ' disabled'}>${escapeHtml(say('play'))}</button>`;
        const count = host.querySelector('.rr-battle-setup-count');
        if (count) count.addEventListener('click', () => showAll(manager));
        host.querySelectorAll('.rr-battle-setup-fix').forEach(button => button.addEventListener('click', () => {
            const fix = report.lines[Number(button.dataset.line)].fix;
            if (fix.kind === 'show') showEvent(manager, fix.eventId);
            else if (fix.kind === 'party') openDatabase('system1');
            else if (fix.kind === 'picture') openDatabase(fix.page || 'enemies', fix.id);
        }));
        host.querySelector('.rr-battle-setup-play').addEventListener('click', () => { play(); });
    }

    function render() {
        if (!state.panel || !state.open) return;
        const manager = state.manager, map = manager && manager.currentMap;
        if (!map) return;
        if (state.map !== map) {
            // Another map: nothing measured of the last one holds.
            state.map = map;
            state.occupancy = null; state.verdict = null; state.props = null; state.propsKey = ''; state.report = null; state.started = null;
        }
        drawMode(); drawTiles(); drawHint(); drawUnit(); drawStart();
        recheck();
        syncButton();
    }

    /** The map's Note changed here: every part of the card that reads it follows. */
    function noteChanged() {
        state.occupancy = null;
        render();
    }

    /** Opens the Database on a page; on record `id` of it, or (`fresh`) on a new record. */
    function openDatabase(page, id, fresh) {
        const app = reactor();
        if (!app || typeof app.openDatabase !== 'function') return false;
        app.openDatabase(page);
        if (typeof document === 'undefined') return true;
        setTimeout(() => {
            if (fresh) { const add = document.querySelector('#database-viewer .database-add-btn'); if (add) add.click(); return; }
            if (!(id > 0)) return;
            const item = Array.from(document.querySelectorAll('#database-list .database-list-item')).find(each => each.dataset.entryId === String(id));
            if (item) { item.click(); if (item.scrollIntoView) item.scrollIntoView({ block: 'nearest' }); }
        }, 60);
        return true;
    }

    //-------------------------------------------------------------------------
    // Keys, and what follows the map.

    const typing = target => !!(target && target.closest && target.closest('.modal, [role="dialog"], input, textarea, select, [contenteditable="true"]'));
    /** Whether a key's target is one of the card's lists while a list hangs open. */
    const listOpen = target => !!(target && target.tagName === 'SELECT' && state.panel && state.panel.contains(target) && typeof document !== 'undefined' && document.querySelector('.rr-shim-popup'));
    /**
     * A key pressed with the keyboard on the card is the card's: Enter
     * presses the button it is on and the arrows are not the map's. Set
     * on the window when this file loads, so it speaks before the editor's
     * map shortcuts; a field or a list is left to them, which pass it by.
     */
    const cardKey = event => {
        if (!state.open || !state.panel || !event || event.ctrlKey || event.metaKey || event.altKey) return;
        const target = event.target;
        if (!target || !state.panel.contains(target) || typing(target)) return;
        if (event.key === 'Enter' || /^Arrow/.test(String(event.key))) event.stopImmediatePropagation();
    };
    /**
     * One of the card's lists opened: the keyboard goes to the list's own
     * field, so the arrows and Enter choose in the list and the map's
     * shortcuts, which leave a field alone, do not take them.
     */
    const onListFocus = event => {
        if (!state.open || !state.panel || typeof document === 'undefined') return;
        const popup = event.target;
        if (!popup || !popup.classList || !popup.classList.contains('rr-shim-popup')) return;
        const left = event.relatedTarget, asked = state.listAsked;
        const field = left && left.tagName === 'SELECT' && state.panel.contains(left) ? left : asked && Date.now() - asked.at < 500 ? asked.field : null;
        if (!field) return;
        setTimeout(() => { if (popup.isConnected && document.activeElement === popup && field.isConnected) field.focus({ preventScroll: true }); }, 0);
    };
    /** A click on one of the card's lists: which list is about to open. */
    const onListClick = event => {
        const trigger = event.target && event.target.closest ? event.target.closest('.rr-shim-trigger') : null;
        const field = trigger && trigger.parentNode && trigger.parentNode.querySelector ? trigger.parentNode.querySelector('select') : null;
        if (field) state.listAsked = { field, at: Date.now() };
    };
    const onKey = event => {
        if (!state.open && !state.pick) return;
        // A list of the card hangs open with the keyboard on its field: a letter typed is not a choice made unseen.
        if (listOpen(event.target) && String(event.key).length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); return; }
        // A pick has hidden the dialogs it came from: the focus may still be in one of their fields.
        if (state.pick ? !!(state.panel && state.panel.contains(event.target) && typing(event.target)) : typing(event.target)) return;
        if (event.key === 'Escape' && state.pick) {
            endPick(null);
            event.preventDefault(); event.stopImmediatePropagation();
        } else if (event.key === 'Escape' && state.brush) {
            state.brush = null; state.verdict = null;
            hover2D(state.manager, null); hover3D(editor3D(state.manager), null);
            drawTiles(); drawHint();
            event.preventDefault(); event.stopPropagation();
        } else if ((event.key === 'r' || event.key === 'R') && !event.ctrlKey && !event.metaKey && !event.altKey) {
            const done = state.pick || state.brush ? turnHand(event.shiftKey ? -1 : 1) : turnSelected(event.shiftKey ? turned(facingOf(state.manager.selectedEvent), -1) : 0);
            if (done) { event.preventDefault(); event.stopImmediatePropagation(); }
        }
    };
    function listen() {
        if (state.listening || typeof document === 'undefined') return;
        state.listening = true;
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerup', onPointerUp, true);
        document.addEventListener('focusin', onListFocus, true);
    }
    // A click on the map may have picked another unit: the facing row follows.
    const onPointerUp = () => setTimeout(() => {
        if (!state.open || !state.manager) return;
        const picked = state.manager.selectedEvent && unitOf(state.manager.selectedEvent) ? state.manager.selectedEvent.id : 0;
        if (picked !== state.shownId) drawUnit();
    }, 0);

    /** The toolbar's button shows pressed while the card is open. */
    function syncButton() {
        if (typeof document === 'undefined') return;
        const button = document.querySelector('.tool-button[data-action="battle-setup"]');
        if (!button) return;
        button.classList.toggle('active', state.open);
        button.setAttribute('aria-pressed', String(state.open));
    }

    function build() {
        const panel = document.createElement('div');
        panel.id = 'rr-battle-setup';
        panel.className = 'rr-battle-setup';
        panel.tabIndex = -1;
        panel.setAttribute('role', 'region');
        panel.innerHTML = `<div class="rr-battle-setup-head"><span class="rr-battle-setup-title"></span><button type="button" class="rr-btn-secondary rr-battle-setup-close">×</button></div>`
            + '<div class="rr-battle-setup-body rr-accent-scrollbar"><div class="rr-battle-setup-part" data-part="mode"></div><div class="rr-battle-setup-part" data-part="start"></div>'
            + '<div class="rr-battle-setup-part is-tiles" data-part="tiles"></div><div class="rr-battle-setup-hint" data-part="hint"></div>'
            + '<div class="rr-battle-setup-unit" data-part="unit" hidden></div></div><div class="rr-battle-setup-foot" data-part="foot"></div>';
        panel.querySelector('.rr-battle-setup-close').addEventListener('click', () => close());
        panel.addEventListener('click', onListClick, true);
        state.parts = {};
        panel.querySelectorAll('[data-part]').forEach(element => { state.parts[element.dataset.part] = element; });
        listen();
        // The Database closed: its records, their looks and the party may have changed.
        const viewer = document.getElementById('database-viewer');
        if (viewer && typeof MutationObserver !== 'undefined') {
            let shown = viewer.classList.contains('active');
            new MutationObserver(() => {
                const now = viewer.classList.contains('active');
                if (shown && !now && state.open) { state.bound.clear(); state.arts.clear(); state.files.clear(); state.tilesKey = ''; render(); }
                shown = now;
            }).observe(viewer, { attributes: true, attributeFilter: ['class'] });
        }
        return panel;
    }

    /** The card's title and its close button, in the editor's language. */
    function retitle() {
        const panel = state.panel;
        if (!panel) return;
        panel.querySelector('.rr-battle-setup-title').textContent = say('title');
        const closer = panel.querySelector('.rr-battle-setup-close');
        closer.title = say('close'); closer.setAttribute('aria-label', say('close'));
        panel.setAttribute('aria-label', say('title'));
    }

    /**
     * Opens the card beside the map; Event mode is switched on if it is
     * off. Answers whether it is open.
     */
    function open(manager) {
        manager = manager || state.manager || (reactor() && reactor().eventManager);
        if (!manager || !manager.currentMap || typeof document === 'undefined') return false;
        state.manager = manager;
        if (!manager.eventMode) {
            if (reactor() && reactor().toggleEventMode) reactor().toggleEventMode();
            else if (manager.setEventMode) manager.setEventMode(true);
        }
        if (!manager.eventMode) return false;
        if (!state.panel) state.panel = build();
        const panel = state.panel;
        retitle();
        if (!panel.isConnected) {
            const app = reactor();
            if (!(app && app.dockMapPanel && app.dockMapPanel(panel))) (document.getElementById('workspace') || document.body).appendChild(panel);
        }
        state.open = true;
        state.openedAt = Date.now();
        state.files.clear();
        state.roofs.clear();
        state.tilesKey = '';
        wantPhysics(manager);
        setShowUnits(true);
        render();
        return true;
    }

    function close() {
        const was = state.open;
        state.open = false;
        state.brush = null;
        state.verdict = null;
        state.propsTurn = (state.propsTurn || 0) + 1;
        state.props = null; state.propsKey = '';
        if (state.panel && state.panel.isConnected) {
            const app = reactor();
            if (app && app.undockMapPanel) app.undockMapPanel(state.panel); else state.panel.remove();
        }
        dropStage();
        if (was) {
            setShowUnits(false);
            hover2D(state.manager, null);
            hover3D(editor3D(state.manager), null);
        }
        syncButton();
        return true;
    }

    /** The toolbar's button and the Tools menu: opens the card, or closes it when it is open. */
    function toggle(manager) {
        return state.open ? !close() : open(manager);
    }

    /** Puts the keyboard on the card. */
    function focus() {
        if (!state.open || !state.panel) return false;
        state.panel.focus();
        return true;
    }

    /**
     * Keeps the card in step with the map: called when Event mode turns on
     * or off and when the map's events change. The open card closes when
     * Event mode ends.
     */
    function sync(manager) {
        if (typeof document === 'undefined') return;
        manager = manager || state.manager;
        if (!manager) return;
        state.manager = manager;
        if (state.pick && (!manager.eventMode || !manager.currentMap)) endPick(null);
        // The card shut, an undo still takes back what the card wrote with its first unit.
        if (!state.open) { followUndo(manager); syncButton(); return; }
        if (!manager.eventMode || !manager.currentMap) { close(); return; }
        state.occupancy = null;
        state.verdict = null;
        if (state.map !== manager.currentMap || followUndo(manager)) { render(); return; }
        drawUnit();
        recheck();
    }

    /** The map's Note was changed elsewhere (a dialog's Leave it to events): the card follows. */
    function syncMapTrigger() {
        if (state.open) render();
    }

    //-------------------------------------------------------------------------
    // Pick on the map, for a command's dialog.

    function endPick(answer) {
        const pick = state.pick;
        if (!pick) return;
        state.pick = null;
        state.verdict = null;
        if (pick.banner) pick.banner.remove();
        hover2D(state.manager, null);
        hover3D(editor3D(state.manager), null);
        if (state.open) drawHint();
        pick.resolve(answer);
    }

    /**
     * One tile of the open map, picked with a click on the live map, 2D
     * or 3D: the unit's look follows the pointer, R turns it, Esc gives
     * up. `request`: `{ unit: { team, record, id }, x, y, direction }`.
     * Resolves to `{ x, y, direction }`, or null.
     */
    function pickTile(request) {
        const manager = state.manager || (reactor() && reactor().eventManager);
        if (!manager || !manager.currentMap || typeof document === 'undefined') return Promise.resolve(null);
        if (state.pick) endPick(null);
        state.manager = manager;
        const asked = (request && request.unit) || {};
        const team = TEAMS.includes(asked.team) ? asked.team : 'enemy', record = asked.record === 'actor' ? 'actor' : 'enemy';
        return new Promise(resolve => {
            const banner = document.createElement('div');
            banner.className = 'rr-battle-setup-pick';
            banner.setAttribute('role', 'status');
            (document.getElementById('canvas-container') || document.body).appendChild(banner);
            state.pick = { unit: { team, record, id: int(asked.id) }, direction: TURN.includes(Number(request && request.direction)) ? Number(request.direction) : 2, resolve, banner };
            listen();
            state.verdict = null;
            wantPhysics(manager);
            drawHint();
        });
    }

    //-------------------------------------------------------------------------
    // Play this battle.

    /** Where Play this battle puts the party on the open map (`playSpot`), by the checker's report. */
    function spotFor(manager, report) {
        const map = manager && manager.currentMap;
        if (!map || !report) return null;
        const C = Check(), lookups = lookupsFor(manager), taken = occupancyOf(manager), system = systemOf();
        const mapId = Number(map.id) || 0;
        const stand = (x, y) => {
            const place = C.standing(map, x, y, { any: true, occupancy: taken }, lookups);
            return place.ok ? (Number.isFinite(place.height) ? place.height : true) : null;
        };
        const selected = manager.selectedEvent || (Number.isInteger(manager.selectedTileX) ? { x: manager.selectedTileX, y: manager.selectedTileY } : null);
        const home = system && Number(system.startMapId) === mapId && mapId > 0 ? { x: Number(system.startX) || 0, y: Number(system.startY) || 0, direction: Number(system.startDirection) || 0 } : null;
        // On a Classic map only the rows fight: the party is put by one of them.
        const classic = report.mode.mode === 'classic';
        const enemies = report.units.filter(unit => unit.team === 'enemy' && !unit.waits && (!classic || unit.source === 'row'));
        const starters = report.start.starters.map(starter => (map.events || []).find(event => event && event.id === starter.eventId)).filter(Boolean);
        const start = report.starts === 'event' || (report.start.kind !== 'event' && !enemies.length) ? Object.assign({}, report.start, { kind: 'event' }) : report.start;
        return playSpot(map, { start, enemies, starters, home, near: selected, stand, taken: (x, y) => (taken.get(y * map.width + x) || []).some(entry => entry.own || entry.blocks) });
    }

    /** Whether the game the project runs reads the `playat` launch token. */
    function readsPlayAt(home) {
        if (typeof require !== 'function' || !home || !home.path) return true;
        try {
            const fs = require('fs'), path = require('path'), file = path.join(home.path, 'js', 'reactor_fight_flow.js');
            return !fs.existsSync(file) || fs.readFileSync(file, 'utf8').includes('playat=');
        } catch (error) { return true; }
    }

    /**
     * Saves and plays the open map: a new game on it with the title
     * skipped, the party where a battle the map starts would begin. The
     * battle is not forced: the game starts it by the map's own rule.
     */
    async function play() {
        const app = reactor(), manager = state.manager || (app && app.eventManager);
        const home = project(manager), map = manager && manager.currentMap;
        if (!app || !home || !map || state.playing) return false;
        const report = recheck(), spot = report ? spotFor(manager, report) : null, mapId = Number(map.id) || 0;
        if (!spot || !(mapId > 0)) return false;
        state.playing = true;
        try {
            const saved = await app.projectController.saveAll();
            if (!saved) return false;
            if (app.audioPlayer && app.audioPlayer.stopExternal) app.audioPlayer.stopExternal();
            const at = { mapId, x: spot.x, y: spot.y, direction: spot.direction };
            const playtest = app.playtestManager;
            if (typeof playtest.playtestAt === 'function') return playtest.playtestAt(home.path, at, { playat: readsPlayAt(home), mode: report.mode.playsAs });
            return playtest.playtestFight(home.path, at);
        } finally {
            state.playing = false;
        }
    }

    if (typeof document !== 'undefined') document.addEventListener('rr-events-changed', () => sync(state.manager));
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        // The editor's language changed: the open card says everything again.
        window.addEventListener('rr-language-changed', () => { if (!state.open) return; state.tilesKey = ''; state.verdict = null; retitle(); render(); });
        // Before the editor's map shortcuts, which are set on the window after this file has loaded.
        window.addEventListener('keydown', cardKey, true);
    }

    const api = {
        MODES, TEAMS, TEAM_COLORS, WORDS, DISTANCE, DISTANCE_MAX, PREVIEW_MIN,
        parseUnitText, unitOf, isStarter, census, turned, face, facingOf,
        triggerOf, withTrigger, withMode, startOf, modeInForce, setStart, setMode, ensureStart,
        unitEvent, battleStartEvent, playSpot, facingToward, sentenceParts, tileRecords, modeChoices, playsLine, say,
        lookOf, artOf, modelShot, shotFile, previewPage, modelSpec, teamTone, ghostProp, liftAt, standNewEvent, standEvent,
        placeAt, removeAt, turnSelected, turnHand, hover2D, hover3D, whereOf, judge, roofAt, previewGrow, fadeModel, holding, lookupsFor, spotFor, readsPlayAt, pickTile,
        open, close, toggle, focus, isOpen, sync, syncButton, syncMapTrigger, play, showAll, showEvent, _state: state
    };
    root.RRBattleSetup = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
