//=============================================================================
// reactor_fight_flow.js - How a battle on the map begins, and who is in it
//=============================================================================
//
// A map starts its battle by itself, in every mode:
// - `<battle trigger: N>` in the map's Note: when the leader comes within N
//   tiles (1 to 50, a straight line) of an enemy unit it can see.
// - `<battle trigger: open>`: as soon as the party is on the map, once per
//   visit, against every unit on it.
// - `<battle trigger: 0>`: never; the map's events start its battles.
// - No tag: 6 tiles, unless an event of the map has a Start Battle on Map
//   command: such a map waits for its events, as with 0.
// - `<battle lose: continue>`: a battle the map starts can be lost and the
//   game goes on.
// The map's 3D sidecar (`battle.trigger`) is read only where the Note has no
// trigger tag.
//
// Where the mode in force is Tactical, Action or First Person the battle is
// fought on the map (reactor_fight.js); where it is Classic the battle screen
// opens against the enemy rows taken (reactor_fight_classic.js).
//
// One rule says who is in a battle: a unit is taken when it stands within the
// map's start distance of a party member who can see it, and a unit standing
// within F.GROUP tiles of one that is taken comes with it (a group is fought
// whole). It is asked as a battle starts (`F.takenNear`) and on the beat
// while one runs, of the map's units outside it (`F.bringNear`): whoever it
// takes joins.
//
// After a battle the enemy units that were in it start no battle until the
// leader has been out of their reach once (the start distance and a group's
// width), each for itself. An enemy that was not in it starts its battle as
// always, and one still held is in that battle when the rule takes it. A hold
// belongs to the map it was made on and is let go on any other.
//
// Also here: the launch line of the editor's Play this battle (`playat`) and
// of a scripted Test battle (`fight`), both read in a playtest only.
//
// Sight and heights are the Tactical grid's (ReactorFight.Grid, in
// reactor_fight_tactical.js), asked for when a line is judged and never while
// this file loads: where the grid is not loaded nothing is seen. A unit's
// body hides no unit from the rule: not its own, not that of one standing
// with it. Ground, what is built and scenery do.
//=============================================================================

(function(root) {
    "use strict";

    const F = root.ReactorFight;
    if (!F || !root.Game_Fight) return;

    const frameNow = () => (typeof Graphics !== "undefined" ? Graphics.frameCount || 0 : 0);

    // The start distance of a map that names none, in tiles, and the longest one a map can name.
    F.START_DISTANCE = 6;
    F.START_MAX = 50;
    // The beat, in frames: how often the map's units are counted, a start is judged and units outside a battle are looked at.
    F.BEAT = 12;
    // The sight lines one beat may ask for; who is left is asked on the next.
    F.BEAT_LINES = 16;
    // A unit standing this near (tiles, a straight line) to one the rule takes comes with it, seen or not: a group
    // is fought whole. One step out, not a chain. 0: nobody comes along.
    F.GROUP = 3;

    const onBeat = () => frameNow() % F.BEAT === 0;

    //-------------------------------------------------------------------------
    // What the map's Note says of its start.

    const TRIGGER_TAG = /<battle\s*trigger\s*:([^>]*)>/i, LOSE_TAG = /<battle\s*lose\s*:([^>]*)>/i;

    /** A start as its text names it (`open`, `0`, a distance from 1 to F.START_MAX): `kind` and `tiles`; null for any other text. */
    const readStart = function(text) {
        const value = String(text === undefined || text === null ? "" : text).trim();
        if (/^open$/i.test(value)) return { kind: "open", tiles: F.START_DISTANCE };
        if (!/^\d+$/.test(value)) return null;
        const tiles = Number(value);
        if (tiles === 0) return { kind: "event", tiles: F.START_DISTANCE };
        return tiles <= F.START_MAX ? { kind: "near", tiles } : null;
    };

    /** Whether an event of a map has a Start Battle on Map command, on any of its pages. */
    F.mapHasStarter = function(mapData) {
        for (const event of (mapData && mapData.events) || []) {
            if (!event) continue;
            for (const page of event.pages || []) {
                for (const command of (page && page.list) || []) {
                    if (command && command.code === 357 && Array.isArray(command.parameters) && command.parameters[0] === "RPGReactor" && command.parameters[1] === "StartMapBattle") return true;
                }
            }
        }
        return false;
    };

    // What each map's data says of its start, kept per data object: its events are read once, its Note again when it changes.
    const starts = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    const NO_MAP = Object.freeze({ kind: "event", tiles: F.START_DISTANCE, lose: "gameover", from: "default" });

    /**
     * When a map starts its battle by itself: `kind` is "near" (the leader within `tiles` of an enemy unit it
     * sees), "open" (the map opens) or "event" (never: its events do). `tiles` is also how far round the party
     * a battle takes units (F.START_DISTANCE where the map names no distance). `lose`: "continue" where the Note
     * says `<battle lose: continue>`, else "gameover". `from`: "tag", "sidecar", "events" (no tag, and an event
     * has Start Battle on Map) or "default". Shared and kept: read it, never write it.
     */
    F.mapStart = function(mapData) {
        if (!mapData) return NO_MAP;
        const sidecar = mapData.reactor3d && mapData.reactor3d.battle, side = sidecar ? sidecar.trigger : undefined;
        let entry = starts ? starts.get(mapData) : null;
        if (!entry) {
            entry = { note: undefined, side: undefined, starter: F.mapHasStarter(mapData), start: null };
            if (starts) starts.set(mapData, entry);
        }
        if (entry.start && entry.note === mapData.note && entry.side === side) return entry.start;
        const note = String(mapData.note || ""), tag = TRIGGER_TAG.exec(note), lose = LOSE_TAG.exec(note);
        let read = tag ? readStart(tag[1]) : null, from = read ? "tag" : "default";
        if (!read && !tag && side !== undefined) {
            read = readStart(side);
            if (read) from = "sidecar";
        }
        if (!read && entry.starter) { read = { kind: "event", tiles: F.START_DISTANCE }; from = "events"; }
        if (!read) read = { kind: "near", tiles: F.START_DISTANCE };
        entry.note = mapData.note; entry.side = side;
        entry.start = Object.freeze({ kind: read.kind, tiles: read.tiles, lose: lose && /^continue$/i.test(lose[1].trim()) ? "continue" : "gameover", from });
        return entry.start;
    };

    /** The distance at which a map starts its battle when the party comes near; 0 for a map that does not start one that way. */
    F.triggerRange = function(mapData) {
        if (!mapData) return 0;
        const start = F.mapStart(mapData);
        return start.kind === "near" ? start.tiles : 0;
    };

    //-------------------------------------------------------------------------
    // The map's unit events, counted on the beat: who could start a battle,
    // who could join one. The lists are reused; nothing is made per frame.

    // Active map frames, counted here: what was counted in a frame is not counted twice in it.
    let tick = 0;
    const census = { tick: -1, mapId: 0, data: null, count: 0, events: [], teams: [] };

    /**
     * The events of this map that are units now (`F.eventSide`), in id order: `{ count, events, teams }`, the
     * side each fights on beside it. Counted on the beat and when the map changes; `fresh` counts now (a battle
     * about to start, an outcome about to be judged). Shared: read it, never keep or write it.
     */
    F.unitEvents = function(fresh) {
        const mapId = $gameMap.mapId(), same = census.data === $dataMap && census.mapId === mapId;
        if (same && !fresh && census.tick >= 0 && (census.tick === tick || !onBeat())) return census;
        const props = typeof Reactor3D !== "undefined" && Reactor3D && Reactor3D.PROP_EVENT_BASE ? Reactor3D.PROP_EVENT_BASE : 10000;
        const list = $gameMap.events();
        let count = 0;
        for (let i = 0; i < list.length; i++) {
            const event = list[i];
            // A model placed as scenery stands in the map as an event of its own, and is nobody.
            if (!event || event._eventId >= props) continue;
            const team = F.eventSide(event);
            if (!team) continue;
            census.events[count] = event;
            census.teams[count] = team;
            count++;
        }
        for (let i = count; i < census.count; i++) census.events[i] = null;
        census.count = count;
        census.tick = tick; census.mapId = mapId; census.data = $dataMap;
        return census;
    };

    const far2 = function(a, b) {
        const dx = $gameMap.deltaX(a.x, b.x), dy = $gameMap.deltaY(a.y, b.y);
        return dx * dx + dy * dy;
    };

    // The models that stand in a line's way and are no unit: what the Action driver measures (`Action.props`), less the unit events.
    const scenery = { count: 0, list: [], of: null, stamp: NaN, tick: -1 };
    const sceneryOnly = () => scenery;

    /**
     * Whether one character has a line of sight to another: the line battles use (the Tactical grid's: tiles that
     * hide, the ground, what is built, a shut door, a model in the way), except that a unit event's model stops
     * nothing. In a battle's own lines a model that is no unit of the battle stands in the way; here that would
     * be the unit looked at itself, and whoever stands in front of it in its group. Nothing is seen where no
     * grid is loaded.
     */
    F.sees = function(from, to) {
        const grid = F.Grid;
        if (!grid || !from || !to) return false;
        const A = F.Action, props = A && typeof A.props === "function" && A.props !== sceneryOnly ? A.props : null;
        const all = props ? props.call(A, typeof $gameFight !== "undefined" ? $gameFight : null) : null;
        if (!all || !(all.count > 0) || !all.list) return !!grid.sight(from.x, from.y, grid.heightOf(from), to.x, to.y, grid.heightOf(to));
        if (scenery.of !== all || scenery.stamp !== all.stamp || scenery.tick !== tick) {
            const base = typeof Reactor3D !== "undefined" && Reactor3D && Reactor3D.PROP_EVENT_BASE ? Reactor3D.PROP_EVENT_BASE : 10000;
            let count = 0;
            for (let i = 0; i < all.count; i++) {
                const body = all.list[i], character = body ? body.character : null;
                if (!character || (character._eventId < base && F.eventSide(character))) continue;
                scenery.list[count++] = body;
            }
            for (let i = count; i < scenery.count; i++) scenery.list[i] = null;
            scenery.count = count; scenery.of = all; scenery.stamp = all.stamp; scenery.tick = tick;
        }
        // The grid's line asks the driver for the models in its way: for this one line it is given the scenery alone.
        A.props = sceneryOnly;
        try {
            return !!grid.sight(from.x, from.y, grid.heightOf(from), to.x, to.y, grid.heightOf(to));
        } finally {
            A.props = props;
        }
    };

    // The party's members on the map, filled when the rule is asked.
    const eyes = [];
    /** Whoever the rule looks with: in a battle here its living party members, else the leader and the followers who stand for a battle member. */
    const lookers = function() {
        eyes.length = 0;
        const fight = $gameFight;
        if (fight.isActive() && fight.isHere()) {
            for (const unit of fight._units) {
                if (!unit.party || unit.gone || !fight.isAlive(unit)) continue;
                eyes.push(fight.character(unit));
            }
            return eyes;
        }
        eyes.push($gamePlayer);
        const members = $gameParty.battleMembers().length, followers = $gamePlayer.followers()._data;
        for (let i = 0; i < followers.length; i++) if (followers[i]._memberIndex < members) eyes.push(followers[i]);
        return eyes;
    };

    /** The rule: whether an event stands within `reach2` (tiles, squared) of one of `who` that sees it. */
    const taken = function(event, who, reach2) {
        for (let k = 0; k < who.length; k++) if (far2(who[k], event) <= reach2 && F.sees(who[k], event)) return true;
        return false;
    };

    /** The map's start distance, in tiles: how far round the party the rule reaches. */
    F.startDistance = function() {
        return F.mapStart(typeof $dataMap !== "undefined" ? $dataMap : null).tiles;
    };

    /** Whether an event stands within F.GROUP tiles of one of the first `count` of `list`. */
    const standsWith = function(event, list, count) {
        const group2 = F.GROUP * F.GROUP;
        for (let k = 0; k < count; k++) if (list[k] !== event && far2(list[k], event) <= group2) return true;
        return false;
    };

    /**
     * The unit events a battle takes round the party now, of any side: those the rule takes, in id order, then
     * whoever stands with one of them (F.GROUP). A new list, for a battle about to start.
     */
    F.takenNear = function() {
        const units = F.unitEvents(true), who = lookers(), reach = F.startDistance(), list = [];
        for (let i = 0; i < units.count; i++) if (taken(units.events[i], who, reach * reach)) list.push(units.events[i]);
        const seen = list.length;
        if (seen > 0 && F.GROUP > 0) {
            for (let i = 0; i < units.count; i++) {
                const event = units.events[i];
                if (!list.includes(event) && standsWith(event, list, seen)) list.push(event);
            }
        }
        return list;
    };

    //-------------------------------------------------------------------------
    // While a battle runs: the map's units outside it are looked at on the
    // beat, and whoever the rule takes joins.

    // The unit events outside the battle running here, as of the last look: `{ count, events, teams }`. Shared: read it.
    F.outside = { count: 0, events: [], teams: [] };
    // The mark the last look left on every unit outside the battle (`_rrStandsBy` on the event): a Tactical battle keeps those still.
    F.standsByMark = 0;
    let marks = 0, firstAsked = 0;
    const inside = typeof Set !== "undefined" ? new Set() : null;
    // Those the rule brought in at one look, for who stands with them.
    const came = [];

    const standBy = function(event, mark) {
        // Not enumerable: a save never sees it.
        if (event._rrStandsBy === undefined) Object.defineProperty(event, "_rrStandsBy", { value: mark, enumerable: false, configurable: true, writable: true });
        else event._rrStandsBy = mark;
    };

    /**
     * Looks at the map's units outside the battle running here and brings in whoever the rule takes, and whoever
     * stands with one of those (F.GROUP); returns how many joined. On the beat a look asks for F.BEAT_LINES sight
     * lines at most and goes on from there on the next; `now` counts the map again and asks for every line (a
     * battle about to be judged won).
     */
    F.bringNear = function(fight, now) {
        if (!fight || !fight.isActive() || !fight.isHere() || fight._ending || !inside) return 0;
        const units = F.unitEvents(!!now), who = lookers(), reach = F.startDistance(), reach2 = reach * reach;
        const outside = F.outside, mark = F.standsByMark = ++marks, count = units.count;
        inside.clear();
        for (const unit of fight._units) if (unit.eventId) inside.add(unit.eventId);
        let joined = 0, out = 0, lines = now ? Infinity : F.BEAT_LINES, next = -1;
        const first = count ? firstAsked % count : 0;
        came.length = 0;
        for (let n = 0; n < count; n++) {
            const i = (first + n) % count, event = units.events[i];
            if (inside.has(event._eventId)) continue;
            let seen = false;
            for (let k = 0; k < who.length && !seen; k++) {
                if (far2(who[k], event) > reach2) continue;
                if (lines <= 0) { if (next < 0) next = i; break; }
                lines--;
                seen = F.sees(who[k], event);
            }
            if (seen && fight.join(event)) { joined++; came.push(event); continue; }
            standBy(event, mark);
            outside.events[out] = event;
            outside.teams[out] = units.teams[i];
            out++;
        }
        // Whoever stands with one the rule brought in comes too.
        if (came.length && F.GROUP > 0) {
            const seen = came.length;
            let kept = 0;
            for (let i = 0; i < out; i++) {
                const event = outside.events[i];
                if (standsWith(event, came, seen) && fight.join(event)) { joined++; event._rrStandsBy = 0; continue; }
                outside.events[kept] = event;
                outside.teams[kept] = outside.teams[i];
                kept++;
            }
            out = kept;
            came.length = 0;
        }
        for (let i = out; i < outside.count; i++) outside.events[i] = null;
        outside.count = out;
        firstAsked = next < 0 ? 0 : next;
        return joined;
    };

    //-------------------------------------------------------------------------
    // The map's own start.

    /** The hold after a battle is let go, whoever it was against. */
    const letGo = fight => {
        fight._triggerHeld = false;
        if (fight._triggerHeldMap) fight._triggerHeldMap = 0;
        if (fight._triggerHeldIds && fight._triggerHeldIds.length) fight._triggerHeldIds.length = 0;
    };

    /**
     * Unit events of this map (their ids) come under the hold: none of them starts a battle until the leader has
     * been out of its reach once. Those already under it stay. Saved with the game (`_triggerHeldIds`).
     */
    F.holdAgainst = function(fight, ids) {
        const mapId = $gameMap.mapId();
        if (!Array.isArray(fight._triggerHeldIds) || (fight._triggerHeldMap > 0 && fight._triggerHeldMap !== mapId)) fight._triggerHeldIds = [];
        const held = fight._triggerHeldIds;
        for (let i = 0; i < ids.length; i++) if (ids[i] > 0 && !held.includes(ids[i])) held.push(ids[i]);
        fight._triggerHeld = true;
        fight._triggerHeldMap = mapId;
    };

    // The ids handed to the hold as a battle ends or a battle screen opens.
    const fought = [];

    /** The enemy rows a battle screen made from `rows` fights (the screen's own take: those handed over, who stands with them, the nearest ones) come under the hold. */
    F.holdRows = function(fight, rows) {
        const C = F.Classic, taken = C && typeof C.take === "function" ? C.take(rows) : null;
        if (!taken) return;
        fought.length = 0;
        for (const row of taken) fought.push(row.eventId);
        F.holdAgainst(fight, fought);
    };

    // As a battle on this map ends, the unit events that were in it come under the hold, whoever started it.
    const finishFight = Game_Fight.prototype.finish;
    Game_Fight.prototype.finish = function() {
        if (this.isHere()) {
            fought.length = 0;
            for (const unit of this._units) if (unit.eventId > 0) fought.push(unit.eventId);
            F.holdAgainst(this, fought);
        }
        finishFight.call(this);
    };

    /**
     * Lets go of whoever the hold need not be against any more: a unit the leader is out of reach of (`free2`,
     * tiles squared), one that is no enemy unit now, one that left the map. Returns those still held (their
     * event ids: shared, read only); with nobody left the hold is over and the answer is null.
     */
    const stillHeld = function(fight, free2) {
        const ids = fight._triggerHeldIds;
        let kept = 0;
        for (let i = 0; ids && i < ids.length; i++) {
            const event = $gameMap.event(ids[i]);
            if (!event || far2($gamePlayer, event) > free2 || F.eventSide(event) !== "enemy") continue;
            ids[kept++] = ids[i];
        }
        if (ids && ids.length !== kept) ids.length = kept;
        if (kept) return ids;
        letGo(fight);
        return null;
    };

    /** The device the player used last ("keys", "pad" or "touch"), where the game's controls say; "" where they do not. */
    F.lastDevice = function() {
        const controls = root.ReactorControls;
        return controls && typeof controls.device === "function" ? controls.device() : "";
    };

    /**
     * Why the map does not start a battle of `mode` now, or "" when nothing holds it: a battle runs, the scene is
     * changing or still fading in (the player sees the map before a battle begins on it), an event runs or is
     * about to, a message is open, a transfer, the party in a vehicle, in the air, swimming or moved by a route,
     * encounters switched off, the tester walking through walls; and, for an Action or First Person battle, a
     * player whose last input was a touch.
     */
    F.startHeld = function(mode) {
        const fight = $gameFight, player = $gamePlayer, C = F.Classic, P = root.ReactorPhysics;
        if (fight.isActive() || $gameParty.inBattle() || (C && C.isRunning && C.isRunning())) return "battle";
        const scenes = typeof SceneManager !== "undefined" ? SceneManager : null, scene = scenes ? scenes._scene : null;
        if (scenes && ((scenes.isSceneChanging && scenes.isSceneChanging()) || (scene && typeof scene.isFading === "function" && scene.isFading()))) return "scene";
        if ($gameMap.isEventRunning() || ($gameTemp.isCommonEventReserved && $gameTemp.isCommonEventReserved())) return "event";
        if ($gameMessage.isBusy()) return "message";
        if (player.isTransferring()) return "transfer";
        if (player.isInVehicle()) return "vehicle";
        if (player.isJumping() || (P && P.isAirborne && P.isAirborne(player))) return "air";
        if (P && P.isSwimming && P.isSwimming(player)) return "swimming";
        if (player.isMoveRouteForcing()) return "route";
        if (!$gameSystem.isEncounterEnabled()) return "encounters";
        if (player.isDebugThrough()) return "through";
        if ((mode === "action" || mode === "firstPerson") && F.lastDevice() === "touch") return "touch";
        return "";
    };

    /**
     * The battle the map starts by itself: Defeat every enemy, it can be escaped, and a loss is Game Over unless
     * the Note says `<battle lose: continue>`. `rows`: on a Classic map, the enemy rows that fight (null: of the
     * whole map); `who`: on the map, "near" (the units the rule takes round the party) or "map". With no enemy
     * to take nothing starts: such a battle would be won the moment it began. A next-battle mode a command set
     * is left for the battle it was set for. Returns whether a battle started.
     */
    F.startOwn = function(fight, start, mode, who, rows) {
        const canLose = start.lose === "continue";
        if (!F.isOnMap(mode)) {
            const C = F.Classic;
            if (!C || typeof C.start !== "function" || !(C.start(rows, { canEscape: true, canLose }) > 0)) return false;
            F.holdRows(fight, rows);
            return true;
        }
        const taken = who === "near" ? F.takenNear() : null;
        if (!F.anyEnemyAmong(taken)) return false;
        const o = F.overrides(), next = o.next;
        const serial = fight.start({ mode, who, taken, canEscape: true, canLose });
        if (next !== undefined) o.next = next;
        return serial > 0;
    };

    // The enemy units within the start distance of the leader, filled when a start is judged: those that can
    // start a battle, and those under the hold.
    const near = [], heldNear = [];
    let nearAsked = 0;

    // Where the leader stood when the start was last judged.
    const judged = { mapId: 0, x: -1, y: -1 };

    /**
     * Whether something holds a start that would begin now. What holds it for a moment (the map fading in, a
     * transfer, a hop) is asked again on the next frame, so the battle begins the frame it lets go; the rest on
     * the next beat.
     */
    const heldNow = function(mode) {
        const why = F.startHeld(mode);
        if (why === "scene" || why === "transfer" || why === "air") judged.mapId = 0;
        return why !== "";
    };

    /**
     * Whether an event the last count had as an enemy unit can start a battle of this map now. The count is up to
     * a beat old: the event is asked whether it is an enemy unit still. On a Classic map only an enemy row can.
     */
    const startsBattle = function(event, classic, C) {
        if (!classic) return F.eventSide(event) === "enemy";
        const data = event.event();
        return !!(data && data.rrUnit && !data.rrSpawned && C && C.rowOf && C.rowOf(event));
    };

    /**
     * Judges the map's own start. First the hold: each unit it is against is let go once the leader is out of its
     * reach, a group's width beyond the start distance (F.GROUP; on a Classic map the battle screen's own,
     * Classic.GROUP), or it is no enemy unit any more. Then the start, where nothing holds it (`F.startHeld`):
     * the leader sees an enemy unit within the start distance that is not under the hold (an "open" map: an
     * enemy unit stands on it and nobody is under the hold, once per visit). On a Classic map only enemy rows
     * count. Returns whether a battle started.
     */
    F.judgeStart = function(fight, start) {
        const mode = F.modeInForce(), classic = !F.isOnMap(mode), C = F.Classic || null;
        const units = F.unitEvents(false), leader = $gamePlayer, mapId = $gameMap.mapId();
        const group = Math.max(0, Number(classic ? (C ? C.GROUP : 0) : F.GROUP) || 0);
        const reach2 = start.tiles * start.tiles, free = start.tiles + group;
        const held = fight._triggerHeld ? stillHeld(fight, free * free) : null;
        const open = start.kind === "open" && fight._openedMap !== mapId;
        let any = false;
        near.length = 0; heldNear.length = 0;
        for (let i = 0; i < units.count; i++) {
            if (units.teams[i] !== "enemy") continue;
            const event = units.events[i], inReach = far2(leader, event) <= reach2;
            // Asked only of those in reach (and, on an "open" map, until one is found): on a Classic map the answer makes a record.
            if (!inReach && !(open && !any)) continue;
            if (!startsBattle(event, classic, C)) continue;
            any = true;
            if (!inReach) continue;
            if (held && held.includes(event._eventId)) heldNear.push(event); else near.push(event);
        }
        if (start.kind === "open") {
            if (!open || !any || held || heldNow(mode)) return false;
            if (!F.startOwn(fight, start, mode, "map", null)) return false;
            fight._openedMap = mapId;
            return true;
        }
        if (!near.length || heldNow(mode)) return false;
        // The first enemy the leader sees starts it. A beat asks for F.BEAT_LINES lines at most and goes on from there on the next.
        let seen = false, lines = F.BEAT_LINES;
        const first = nearAsked % near.length;
        for (let n = 0; n < near.length && lines > 0 && !seen; n++, lines--) seen = F.sees(leader, near[(first + n) % near.length]);
        nearAsked = seen ? 0 : first + F.BEAT_LINES;
        if (!seen) return false;
        // On a Classic map the rows the leader sees fight, those under the hold too (the battle screen brings who stands with them).
        return F.startOwn(fight, start, mode, "near", classic ? near.concat(heldNear).filter(event => F.sees(leader, event)) : null);
    };

    // The battle whose outside units were last looked at.
    let looked = 0;

    /**
     * One active map frame. While a battle runs here the units outside it are looked at, on its first frame and
     * on the beat (as it ends its units come under the hold). Else a hold made on another map, or on a map that
     * starts no battle, is let go, and the start is judged on the beat and on the frame the leader stands on a
     * new tile.
     */
    F.updateTrigger = function() {
        tick++;
        const fight = $gameFight, mapId = $gameMap.mapId();
        if (fight.isActive() && fight.isHere()) {
            if (onBeat() || looked !== fight._serial) {
                looked = fight._serial;
                F.bringNear(fight, false);
            }
            return;
        }
        const start = F.mapStart($dataMap);
        // A hold belongs to the map it was made on (`_triggerHeldMap`, saved with it). One that names no map is against
        // nobody (the battle screen leaves one after a battle no unit of the map fought in) and is let go as well.
        if (fight._triggerHeld && (start.kind === "event" || fight._triggerHeldMap !== mapId)) letGo(fight);
        if (start.kind === "event") return;
        const moved = judged.mapId !== mapId || judged.x !== $gamePlayer.x || judged.y !== $gamePlayer.y;
        if (!moved && !onBeat()) return;
        judged.mapId = mapId; judged.x = $gamePlayer.x; judged.y = $gamePlayer.y;
        F.judgeStart(fight, start);
    };

    const updateMap = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        updateMap.call(this, sceneActive);
        if (sceneActive && typeof $gameFight !== "undefined" && $gameFight) F.updateTrigger();
    };

    // Entering a map (not a load of the map the party is on): a map that starts its battle as it opens may do so again.
    const setupMap = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        if (mapId !== this._mapId && typeof $gameFight !== "undefined" && $gameFight) $gameFight._openedMap = 0;
        setupMap.call(this, mapId);
    };

    //-------------------------------------------------------------------------
    // The launch line: Play this battle, and a scripted Test battle.

    /** Every `&`-separated token of the launch line: the page's query and, under NW.js, the program's arguments. */
    const launchTokens = function(each) {
        const read = text => { for (const token of String(text || "").split("&")) each(token); };
        if (typeof location !== "undefined" && location.search) read(location.search.slice(1));
        if (typeof Utils !== "undefined" && Utils.isNwjs && Utils.isNwjs() && typeof nw !== "undefined" && nw.App) for (const arg of nw.App.argv) read(arg);
    };

    /** Whether the launch line says this is a playtest (`test`). What follows is read in a playtest only: a game that was deployed starts at its title whatever its address says. */
    const isPlaytest = function() {
        let found = false;
        launchTokens(token => { if (token === "test") found = true; });
        return found;
    };

    /**
     * Play this battle: `playat=<mapId>,<x>,<y>,<direction>` on a playtest's launch line asks for a new game with
     * the title skipped and the party on that tile, facing that way (2, 4, 6 or 8). No battle is started for it:
     * the map's own start does that, as in the game. `{ mapId, x, y, direction }`, or null.
     */
    F.playRequest = function() {
        if (!isPlaytest()) return null;
        let at = null;
        launchTokens(token => {
            const match = /^playat=(\d+),(\d+),(\d+),(\d+)$/.exec(token);
            if (!match) return;
            const direction = Number(match[4]);
            at = { mapId: Number(match[1]), x: Number(match[2]), y: Number(match[3]), direction: direction === 4 || direction === 6 || direction === 8 ? direction : 2 };
        });
        return at;
    };

    /** A scripted Test battle on a playtest's launch line (`fight`, `fightat=<mapId>,<x>,<y>`, `fightmode=<mode>`): `{ at: { mapId, x, y } | null, mode }`, or null. */
    F.bootRequest = function() {
        if (!isPlaytest()) return null;
        let found = false, at = null, mode = "";
        launchTokens(token => {
            if (token === "fight") found = true;
            const match = /^fightat=(\d+),(\d+),(\d+)$/.exec(token);
            if (match) { found = true; at = { mapId: Number(match[1]), x: Number(match[2]), y: Number(match[3]) }; }
            const named = /^fightmode=(\w+)$/.exec(token);
            if (named && F.isOnMap(named[1])) mode = named[1];
        });
        return found ? { at, mode } : null;
    };

    if (typeof Scene_Map !== "undefined") {
        // A scripted Test battle: `fight` on the launch line starts a battle on the first map the game opens, in
        // the game's own on-map mode (`fightmode=<tactical|action|firstPerson>` names one; a Classic game gets
        // Tactical), against the map's units, or the Database's test troop where the map has no enemy unit;
        // `fightat=<mapId>,<x>,<y>` also skips the title and puts the party on that tile. A map that starts
        // its own battle keeps it: the test start stands down.
        const startScene = Scene_Map.prototype.start;
        Scene_Map.prototype.start = function() {
            startScene.call(this);
            if (F._bootFight === undefined) F._bootFight = F.bootRequest() ? 1 : 0;
        };
        const updateBoot = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            updateBoot.call(this);
            if (!(F._bootFight > 0)) return;
            if ($gameFight.isActive() || $gameFight.serial() > 0) { F._bootFight = 0; return; }
            if ($gameMap.isEventRunning() || $gameMessage.isBusy() || $gamePlayer.isTransferring() || !this.isActive()) { F._bootFight = 1; return; }
            // Idle for a frame with no battle of the map's own: the test's battle starts.
            if (F._bootFight++ < 2) return;
            F._bootFight = 0;
            // The mode the launch line names, else the one the game would fight in here; Tactical for a Classic game.
            const request = F.bootRequest(), resolved = F.resolveMode(0);
            const mode = request && F.isOnMap(request.mode) ? request.mode : F.isOnMap(resolved) ? resolved : "tactical";
            $gameFight.start({ mode, troopId: $dataSystem.testTroopId || 1, troopIfEmpty: true, canEscape: true, canLose: true });
        };
    }

    if (typeof Scene_Boot !== "undefined") {
        const bootStart = Scene_Boot.prototype.start;
        Scene_Boot.prototype.start = function() {
            const play = F.playRequest(), test = play ? null : F.bootRequest();
            const at = play || (test && test.at);
            if (!at || !(at.mapId > 0) || DataManager.isBattleTest() || DataManager.isEventTest()) return bootStart.apply(this, arguments);
            Scene_Base.prototype.start.call(this);
            SoundManager.preloadImportantSounds();
            DataManager.setupNewGame();
            $gamePlayer.reserveTransfer(at.mapId, at.x, at.y, play ? play.direction : 2, 0);
            SceneManager.goto(Scene_Map);
            this.resizeScreen();
            this.updateDocumentTitle();
        };
    }
})(globalThis);
