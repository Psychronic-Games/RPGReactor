//=============================================================================
// reactor_fight.js — battles on the live map
//
// Classic battles stay the separate battle scene (Scene_Battle). Tactical,
// Action and First Person battles happen on the map itself: the fight is a
// state object beside the map ($gameFight), Scene_Map keeps running, map
// events keep running, and every unit is an ordinary character (the player,
// a follower or an event) carrying a Database battler. Damage, skills, items
// and states go through the stock Game_Action and Game_Battler math.
//
// This file is the framework the three map modes share (docs/DESIGN-BATTLE-
// MODES.md, phase 1): the mode switch, units, hooks, outcomes and rewards,
// save and load mid-battle, and a minimal team-turn driver in which every
// unit approaches its nearest opponent and attacks or uses a skill.
//=============================================================================

(function(root) {
    "use strict";

    const F = root.ReactorFight = root.ReactorFight || {};

    F.MODES = ["classic", "tactical", "action", "firstPerson"];
    F.ON_MAP = ["tactical", "action", "firstPerson"];
    F.TEAMS = ["ally", "enemy", "neutral"];
    F.TURNS = ["team", "initiative"];
    F.HOOKS = ["battleStart", "turnStart", "turnEnd", "unitDefeated", "unitEnters"];
    F.DEFAULT_MOVE = 4;
    // Rounds with no step taken and no action used before a stuck battle ends as an escape.
    F.IDLE_ROUNDS = 20;
    // A fallen unit's event fades over this many frames, after waiting at most this many for a shot on it to end.
    F.DEFEAT_FADE = 32;
    F.DEFEAT_HOLD = 240;
    // One who falls goes over in this many frames, and an event's unit lies this many (the fall among them) before it fades.
    F.FALL_FRAMES = 18;
    F.FALL_REST = 70;
    /** How far over a falling body is (0 upright, 1 flat), `t` 0-1 through the fall: slow to tip, quick to land. */
    F.fallPitch = t => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
    // Results, as Battle Processing's branches number them.
    F.WIN = 0;
    F.ESCAPE = 1;
    F.LOSE = 2;
    // A shot or a sequence holds the battle for at most this many frames; one that never lets go is passed over.
    F.HOLD_MAX = 900;
    // A battle that has waited this many frames for something the player cannot see says what in the console.
    F.STALL_WARN = 600;
    // After a battle a follower within this many tiles of the one before it, and no more than a hop above or
    // below it, walks back at a run; one further off, or stopped on the way, is put beside it and fades in.
    // Nobody takes longer than the frames given.
    F.REGROUP_REACH = 8;
    F.REGROUP_RISE = 1.5;
    F.REGROUP_SPEED = 5;
    F.REGROUP_FRAMES = 180;
    F.REGROUP_FADE = 16;
    // After the walk back a follower nobody could be put beside is put on the nearest free standing place this
    // many cells round the one before it.
    F.REGROUP_AROUND = 4;
    // Where a unit may be put: no more than this above or below the place asked from.
    F.SPOT_STEP = 0.5;
    // A unit asked for by its cell alone stands on the cell's own ground, or on what is built there as ground:
    // blocks or a floor no more than this over it (a stage), or a top joined to some cell's own ground, within
    // this many cells, by steps a walker takes (a hill of rock, a bridge).
    F.SPOT_STAGE = 2;
    F.SPOT_REACH = 200;
    // Tops a body can stand on where nobody is put: a tube's is the rim of its wall (a fountain's, a well's).
    F.NO_SPOT = { tube: true };
    // A unit bigger than its cell is put where every cell under it holds a standing place within this of its own.
    F.SPOT_HULL = 1;

    // Seams other files fill (docs/BATTLE-MODES.md): a camera director that can hold the battle for a shot,
    // the Action Sequence stage that plays a run's steps on map units, and the weapon a unit holds.
    if (F.Director === undefined) F.Director = null;
    if (F.Stage === undefined) F.Stage = null;
    // What a unit's 3D model holds (Reactor3D.MapHeld): `op` is "show" / "move" / "hide" for an Action Sequence
    // weapon step (`options` the step as stored, plus { battler, item, targetCharacter }), "carry" when a unit
    // joins ({ battler }), "aim" as it aims (`options` the target's character, or null to stop), "drop" when
    // it leaves. False when nothing was shown: a 2D map, a character with no model, a weapon with none bound.
    if (!F.heldItem) F.heldItem = function(character, op, options) {
        const held = typeof Reactor3D !== "undefined" && Reactor3D ? Reactor3D.MapHeld : null;
        try {
            return !!(held && character && typeof held[op] === "function" && held[op](character, options));
        } catch (error) {
            // A hand that cannot hold never stops the battle.
            return false;
        }
    };

    /**
     * Whether a director's shot or a sequence still settling holds whatever would start next. One that throws
     * is ignored, and so is one that has held for longer than any shot lasts: the battle goes on without it.
     */
    let heldSince = -1, heldAsked = -1, heldWarned = false;
    F.isHeld = function() {
        const director = F.Director, stage = F.Stage;
        let held = false;
        try { held = !!(director && director.isBusy && director.isBusy()); } catch (error) { /* ignored for this frame */ }
        if (!held) try { held = !!(stage && stage.isBusy && stage.isBusy()); } catch (error) { /* ignored for this frame */ }
        if (!held) { heldSince = -1; heldWarned = false; return false; }
        // Only a hold seen frame after frame counts: one nobody asked about for a while starts afresh.
        const frame = typeof Graphics !== "undefined" && Graphics ? Number(Graphics.frameCount) || 0 : 0;
        if (heldSince < 0 || frame - heldAsked > 1) { heldSince = frame; heldWarned = false; }
        heldAsked = frame;
        if (frame - heldSince <= F.HOLD_MAX) return true;
        if (!heldWarned) {
            heldWarned = true;
            console.warn("ReactorFight: a camera shot or an action sequence held the battle for more than " + F.HOLD_MAX + " frames; the battle goes on without it.");
        }
        return false;
    };

    F.isMode = mode => F.MODES.includes(mode);
    F.isOnMap = mode => F.ON_MAP.includes(mode);
    F.oppose = team => (team === "ally" ? "enemy" : team === "enemy" ? "ally" : "");

    //-------------------------------------------------------------------------
    // Which mode a battle uses: the Change Battle Mode command's next-battle
    // setting, then the troop, then the map (a command for this map, else the
    // map's own setting), then the game (a command, else System). Stock data
    // has none of these and plays Classic.

    F.systemSettings = function() {
        const settings = typeof $dataSystem !== "undefined" && $dataSystem ? $dataSystem.reactorBattle : null;
        return settings && typeof settings === "object" ? settings : {};
    };

    F.overrides = function() {
        if (typeof $gameSystem === "undefined" || !$gameSystem) return {};
        if (!$gameSystem._rrBattle || typeof $gameSystem._rrBattle !== "object") $gameSystem._rrBattle = {};
        return $gameSystem._rrBattle;
    };

    /** The mode a word names, whatever its letter case ("firstperson" is First Person); "" when it names none. */
    F.modeNamed = function(text) {
        const word = String(text === undefined || text === null ? "" : text).trim().toLowerCase();
        for (let i = 0; i < F.MODES.length; i++) if (F.MODES[i].toLowerCase() === word) return F.MODES[i];
        return "";
    };

    // What each map's data names as its own mode, kept per data object and read again when its Note or its sidecar's mode changes.
    const mapModes = typeof WeakMap !== "undefined" ? new WeakMap() : null;

    /**
     * A map's own mode: the first `<battle mode: x>` tag of its Note, its value in any letter case; where the Note
     * has no such tag, its 3D sidecar's `battle.mode`. "" when neither names one (a tag whose value is no mode
     * names none, and the sidecar is not asked).
     */
    F.mapMode = function(mapData) {
        if (!mapData) return "";
        const sidecar = mapData.reactor3d && mapData.reactor3d.battle, side = sidecar ? sidecar.mode : undefined;
        let entry = mapModes ? mapModes.get(mapData) : null;
        if (!entry || entry.note !== mapData.note || entry.side !== side) {
            const match = /<battle\s*mode\s*:([^>]*)>/i.exec(String(mapData.note || ""));
            entry = { note: mapData.note, side, mode: match ? F.modeNamed(match[1]) : F.isMode(side) ? side : "" };
            if (mapModes) mapModes.set(mapData, entry);
        }
        return entry.mode;
    };

    F.troopMode = function(troopId) {
        const troop = typeof $dataTroops !== "undefined" && $dataTroops ? $dataTroops[troopId] : null;
        const settings = troop && troop.reactorBattle;
        return settings && F.isMode(settings.mode) ? settings.mode : "";
    };

    /**
     * The mode in force on the map the party is on: what a battle started here now would use with no troop and no
     * next-battle setting. A command for this map, else the map's own, else a command for the game, else System,
     * else Classic.
     */
    F.modeInForce = function() {
        const o = F.overrides();
        const mapId = typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;
        if (o.maps && F.isMode(o.maps[mapId])) return o.maps[mapId];
        const map = F.mapMode(typeof $dataMap !== "undefined" ? $dataMap : null);
        if (map) return map;
        if (F.isMode(o.game)) return o.game;
        const system = F.systemSettings().mode;
        return F.isMode(system) ? system : "classic";
    };

    /** The mode of the next battle against a troop (0: none): the next-battle setting, then the troop's, then the mode in force. */
    F.resolveMode = function(troopId) {
        const o = F.overrides();
        if (F.isMode(o.next)) return o.next;
        return F.troopMode(troopId) || F.modeInForce();
    };

    /** The next-battle setting is used up: by the battle it was set for, on the map or on the battle screen. */
    F.spendNext = function() {
        const o = F.overrides();
        if (o.next !== undefined) delete o.next;
    };

    F.resolveTurns = function() {
        const o = F.overrides();
        if (F.TURNS.includes(o.turns)) return o.turns;
        const system = F.systemSettings().turns;
        return F.TURNS.includes(system) ? system : "team";
    };

    /** The Change Battle Mode command: `scope` game / map / next; mode "default" clears that scope. */
    F.changeMode = function(mode, scope) {
        const o = F.overrides();
        const value = F.isMode(mode) ? mode : null;
        if (scope === "next") {
            if (value) o.next = value; else delete o.next;
        } else if (scope === "map") {
            const mapId = typeof $gameMap !== "undefined" && $gameMap ? $gameMap.mapId() : 0;
            o.maps = o.maps || {};
            if (value) o.maps[mapId] = value; else delete o.maps[mapId];
        } else {
            if (value) o.game = value; else delete o.game;
        }
    };

    //-------------------------------------------------------------------------
    // Units. An event is a unit by its Unit card (`rrUnit` on the event), a
    // `<unit: …>` note tag, or a PTBS comment (PTBS_Actor / PTBS_PartyActor /
    // PTBS_Enemy) on its current page, so maps made for PSYCHRONIC_PTBS fight
    // without rework.

    /**
     * `<unit: enemy 5>`, `<unit: actor 3>`, `<unit: ally 2>` (actor 2 on the
     * allies' side), `<unit: ally enemy 4>`, `<unit: neutral>`, with an
     * optional `move N`. Null when the text names no unit.
     */
    F.parseUnitText = function(text) {
        const words = String(text || "").toLowerCase().replace(/[,:]/g, " ").split(/\s+/).filter(Boolean);
        if (!words.length) return null;
        const spec = { team: "", record: "", id: 0, move: 0 };
        for (let i = 0; i < words.length; i++) {
            const word = words[i], next = Number(words[i + 1]);
            if (word === "move" && Number.isFinite(next)) { spec.move = next; i++; continue; }
            if (word === "actor" || word === "enemy" || word === "ally") {
                if (Number.isFinite(next) && next > 0) {
                    spec.record = word === "enemy" ? "enemy" : "actor";
                    spec.id = Math.floor(next);
                    if (!spec.team) spec.team = word === "enemy" ? "enemy" : "ally";
                    i++;
                } else if (word !== "actor") {
                    spec.team = word;
                }
                continue;
            }
            if (word === "neutral") spec.team = "neutral";
        }
        if (!spec.team) return null;
        return F.normalizeUnit(spec);
    };

    F.normalizeUnit = function(raw) {
        if (!raw || typeof raw !== "object") return null;
        const team = F.TEAMS.includes(raw.team) ? raw.team : null;
        if (!team) return null;
        const record = raw.record === "actor" || raw.record === "enemy" ? raw.record : "";
        const id = record ? Math.max(0, Math.floor(Number(raw.id) || 0)) : 0;
        const move = Math.max(0, Math.min(20, Math.floor(Number(raw.move) || 0)));
        // Every combatant needs a Database record; a neutral one without is a bystander.
        if (team !== "neutral" && !(record && id > 0)) return null;
        const spec = { team, record: record && id > 0 ? record : "", id: record && id > 0 ? id : 0, move: move || F.DEFAULT_MOVE };
        // Whether the event says its own Move: one that does not takes its record's (`<move: N>` on the actor, class or enemy).
        Object.defineProperty(spec, "ownMove", { value: move > 0, enumerable: false });
        return spec;
    };

    /** The PTBS comments on an event's current page as a unit, or null. */
    F.ptbsUnit = function(list) {
        for (const command of list || []) {
            if (!command || (command.code !== 108 && command.code !== 408)) continue;
            const text = String(command.parameters && command.parameters[0] || "");
            let match = /PTBS_(?:Party)?Actor:\s*(\d+)/i.exec(text);
            if (match) return F.normalizeUnit({ team: "ally", record: "actor", id: Number(match[1]) });
            match = /PTBS_Enemy:\s*(\d+)/i.exec(text);
            if (match) return F.normalizeUnit({ team: "enemy", record: "enemy", id: Number(match[1]) });
        }
        return null;
    };

    /** An event's running command list; null while none of its pages meets its conditions. */
    F.eventList = function(event) {
        // An event whose data left with the map (a unit spawned in an earlier battle) has no page either.
        return event && typeof event.page === "function" && event.event() && event.page() && event.list ? event.list() : null;
    };

    /** The unit an event's data names: its card, else its note tag, else a page comment or PTBS comment. */
    F.unitSpecOf = function(data, list) {
        if (!data) return null;
        if (data.rrUnit) return F.normalizeUnit(data.rrUnit);
        const note = /<unit\s*:\s*([^>]+)>/i.exec(String(data.note || ""));
        if (note) return F.parseUnitText(note[1]);
        for (const command of list || []) {
            if (!command || (command.code !== 108 && command.code !== 408)) continue;
            const tag = /<unit\s*:\s*([^>]+)>/i.exec(String(command.parameters && command.parameters[0] || ""));
            if (tag) return F.parseUnitText(tag[1]);
        }
        return F.ptbsUnit(list);
    };

    // What an event is on one page (unitSpecOf), kept per page list: asked for every event of the map on every beat.
    const pageUnits = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    /** The unit an event's data and one page's commands name, kept until the event's card or note changes. Shared: read it, never write it. */
    F.pageUnit = function(data, list) {
        if (!data) return null;
        if (!list) return F.unitSpecOf(data, null);
        let entry = pageUnits ? pageUnits.get(list) : null;
        if (!entry || entry.rrUnit !== data.rrUnit || entry.note !== data.note) {
            entry = { rrUnit: data.rrUnit, note: data.note, spec: F.unitSpecOf(data, list) };
            if (pageUnits) pageUnits.set(list, entry);
        }
        return entry.spec;
    };

    // What an event's own data says (its card or its note), kept per data object: the 3D view asks for every
    // character every frame. A page's comments are not part of it, so a page change needs nothing here.
    const dataSpecs = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    F.dataUnitSpec = function(data) {
        if (!data) return null;
        let entry = dataSpecs ? dataSpecs.get(data) : null;
        if (!entry || entry.rrUnit !== data.rrUnit || entry.note !== data.note) {
            const named = !!(data.rrUnit || /<unit\s*:/i.test(String(data.note || "")));
            entry = { rrUnit: data.rrUnit, note: data.note, spec: named ? F.unitSpecOf(data, null) : null };
            if (dataSpecs) dataSpecs.set(data, entry);
        }
        return entry.spec;
    };

    //-------------------------------------------------------------------------
    // Hooks: a page that runs when its battle condition fires. The page's
    // ordinary conditions (switches, variables, self switch, item, actor) must
    // hold too; its trigger is not used, and it never becomes the event's
    // shown page. Stored as `rrFightHook` on the page, or written as a
    // `<fight hook: turnStart turn=2 team=enemy>` comment.

    F.normalizeHook = function(raw) {
        if (!raw || typeof raw !== "object" || !F.HOOKS.includes(raw.on)) return null;
        const hook = { on: raw.on };
        const team = ["any", "ally", "enemy"].includes(raw.team) ? raw.team : "any";
        if (raw.on === "turnStart" || raw.on === "turnEnd") {
            hook.turn = Math.max(0, Math.floor(Number(raw.turn) || 0));
            hook.team = team;
        } else if (raw.on === "unitDefeated") {
            const unit = raw.unit;
            hook.unit = ["any", "ally", "enemy", "this"].includes(unit) ? unit : Math.max(0, Math.floor(Number(unit) || 0)) || "any";
        } else if (raw.on === "unitEnters") {
            hook.team = team;
            const region = Math.floor(Number(raw.region) || 0);
            if (region > 0) hook.region = region;
            else if (["x0", "y0", "x1", "y1"].every(key => Number.isFinite(Number(raw[key])))) {
                hook.x0 = Math.min(Number(raw.x0), Number(raw.x1)); hook.x1 = Math.max(Number(raw.x0), Number(raw.x1));
                hook.y0 = Math.min(Number(raw.y0), Number(raw.y1)); hook.y1 = Math.max(Number(raw.y0), Number(raw.y1));
            } else return null;
        }
        return hook;
    };

    F.parseHookText = function(text) {
        const match = /<fight\s*hook\s*:\s*(\w+)([^>]*)>/i.exec(String(text || ""));
        if (!match) return null;
        const raw = { on: match[1] };
        for (const pair of match[2].trim().split(/\s+/)) {
            const at = pair.indexOf("=");
            if (at > 0) raw[pair.slice(0, at).toLowerCase()] = pair.slice(at + 1);
        }
        return F.normalizeHook(raw);
    };

    F.pageHook = function(page) {
        if (!page) return null;
        if (page.rrFightHook) return F.normalizeHook(page.rrFightHook);
        const first = page.list && page.list[0];
        if (first && first.code === 108) return F.parseHookText(first.parameters && first.parameters[0]);
        return null;
    };

    //-------------------------------------------------------------------------
    // Rewards, worked out from the enemy-side units defeated (never from an
    // ally made of an enemy record) and given through the message window, as
    // the stock battle words them.

    F.makeRewards = function(enemies) {
        const dead = enemies.filter(enemy => enemy && enemy.isDead());
        const goldRate = typeof $gameTroop !== "undefined" && $gameTroop.goldRate ? $gameTroop.goldRate() : 1;
        return {
            exp: dead.reduce((sum, enemy) => sum + enemy.exp(), 0),
            gold: Math.floor(dead.reduce((sum, enemy) => sum + enemy.gold(), 0) * goldRate),
            items: dead.reduce((list, enemy) => list.concat(enemy.makeDropItems()), [])
        };
    };

    F.giveRewards = function(rewards) {
        $gameMessage.newPage();
        $gameMessage.add(TextManager.victory.format($gameParty.name()));
        if (rewards.exp > 0) $gameMessage.add("\\." + TextManager.obtainExp.format(rewards.exp, TextManager.exp));
        if (rewards.gold > 0) {
            $gameMessage.add("\\." + TextManager.obtainGold.format(rewards.gold));
            $gameParty.gainGold(rewards.gold);
        }
        for (const item of rewards.items) {
            $gameMessage.add(TextManager.obtainItem.format(item.name));
            $gameParty.gainItem(item, 1);
        }
        for (const actor of $gameParty.allMembers()) actor.gainExp(rewards.exp);
    };

    /**
     * The results of a battle that was won: the rewards are given and shown, and `done()` says the player has
     * read them. Until it is called the battle is not over; after it the battle waits, as it always does, while
     * a message is open. Here the message window shows them and holds the battle by itself, so nothing more is
     * waited for.
     */
    F.showResults = function(fight, rewards, done) {
        F.giveRewards(rewards);
        done();
    };

    //-------------------------------------------------------------------------
    // Game_Fight — one object for every on-map battle; saved with the game.

    function Game_Fight() {
        this.initialize(...arguments);
    }
    root.Game_Fight = Game_Fight;

    Game_Fight.prototype.initialize = function() {
        this._serial = 0;
        this._results = {};
        // The side an event fights on when a command changed it ("mapId,eventId": team), kept with the save.
        this._sides = {};
        // A battle page still running when its battle ended (updateTail).
        this._tail = null;
        this.clear();
    };

    Game_Fight.prototype.clear = function() {
        this._active = false;
        this._mode = "";
        this._mapId = 0;
        this._units = [];
        this._nextUnitId = 1;
        this._turn = 0;
        this._turns = "team";
        this._phase = "idle";
        this._queue = [];
        this._act = null;
        this._run = null;
        this._wait = 0;
        this._options = {};
        this._hooks = [];
        this._ending = null;
        this._inside = {};
        this._fading = [];
        this._savedBgm = null;
        this._followers = null;
        this._hookInterpreter = null;
        // What the battle says on a HUD's banner (`announce`).
        this._notice = null;
        // The rounds in a row nobody moved or acted in (`nextInQueue`): each battle counts its own.
        this._idleRounds = 0;
        this._progress = false;
        // The units spawned for a battle kept on a map the party left, until it is back (`Game_Map.setup`).
        this._spawnedKept = null;
    };

    Game_Fight.prototype.isActive = function() { return this._active; };
    Game_Fight.prototype.serial = function() { return this._serial; };
    Game_Fight.prototype.mode = function() { return this._mode; };
    Game_Fight.prototype.turn = function() { return this._turn; };
    Game_Fight.prototype.mapId = function() { return this._mapId; };
    Game_Fight.prototype.resultOf = function(serial) {
        const value = this._results[serial];
        return value === undefined ? (this._active && serial === this._serial ? -1 : F.ESCAPE) : value;
    };

    /** Whether the fight runs on the map the party stands on (one left with "keep" waits there). */
    Game_Fight.prototype.isHere = function() {
        return this._active && typeof $gameMap !== "undefined" && $gameMap.mapId() === this._mapId;
    };

    //-------------------------------------------------------------------------
    // Units: who they are and where they stand.

    Game_Fight.prototype.units = function(filter) {
        const list = this._units.filter(unit => !unit.gone);
        if (!filter) return list;
        return list.filter(unit => (!filter.team || unit.team === filter.team) && (!filter.alive || this.isAlive(unit)));
    };

    Game_Fight.prototype.unit = function(id) {
        // (Under 0: a vehicle of the party's on this map, which is hit and mended as a unit is: reactor_vehicles_mount.js.)
        if (id < 0) return typeof this.vehicleUnit === "function" ? this.vehicleUnit(-id) : null;
        return this._units.find(unit => unit.id === id) || null;
    };

    Game_Fight.prototype.unitOfEvent = function(eventId) {
        return this._units.find(unit => !unit.gone && unit.eventId === eventId) || null;
    };

    Game_Fight.prototype.battler = function(unit) {
        if (!unit) return null;
        if (unit.vehicle) return typeof this.vehicleBattler === "function" ? this.vehicleBattler(unit) : null;
        if (unit.enemy) return unit.enemy;
        return unit.actorId ? $gameActors.actor(unit.actorId) : null;
    };

    Game_Fight.prototype.character = function(unit) {
        if (!unit) return null;
        if (unit.eventId) {
            const event = $gameMap.event(unit.eventId);
            return event && !event._erased ? event : null;
        }
        if (unit.party) {
            const actor = $gameActors.actor(unit.actorId);
            if ($gameParty.leader() === actor) return $gamePlayer;
            const follower = $gamePlayer.followers().data().find(f => f.actor() === actor);
            return follower || null;
        }
        return null;
    };

    Game_Fight.prototype.isAlive = function(unit) {
        if (!unit || unit.gone || unit.team === "neutral") return false;
        const battler = this.battler(unit);
        return !!(battler && battler.isAlive() && this.character(unit));
    };

    Game_Fight.prototype.unitAt = function(x, y, except) {
        for (const unit of this.units()) {
            if (unit === except) continue;
            const character = this.character(unit);
            if (character && character.x === x && character.y === y && (unit.team === "neutral" || this.isAlive(unit))) return unit;
        }
        return null;
    };

    Game_Fight.prototype.addUnit = function(spec) {
        const unit = {
            id: this._nextUnitId++,
            team: spec.team,
            party: !!spec.party,
            actorId: spec.record === "actor" ? spec.id : 0,
            enemy: null,
            eventId: spec.eventId || 0,
            move: spec.move || F.DEFAULT_MOVE,
            ownMove: !!spec.ownMove,
            defeated: false,
            gone: false
        };
        if (spec.record === "enemy" && typeof $dataEnemies !== "undefined" && $dataEnemies[spec.id]) {
            unit.enemy = new Game_Enemy(spec.id, 0, 0);
        }
        if (!unit.enemy && !unit.actorId && unit.team !== "neutral") return null;
        // Whoever joins already fallen did not fall here: the battle's end does not get them up (`reviveFallen`).
        const joining = this.battler(unit);
        unit.down = !!(joining && joining.isDead());
        this._units.push(unit);
        if (unit.enemy) this.syncTroop();
        const character = this.character(unit);
        if (character) this._inside[String(unit.id)] = [character.x, character.y];
        if (character && unit.team !== "neutral") F.heldItem(character, "carry", { battler: this.battler(unit) });
        return unit;
    };

    /**
     * $gameTroop holds the fight's enemy-record battlers, so Game_Action finds
     * an enemy subject by its index as it does in a battle. The troop is not
     * saved; a load rebuilds it from the units.
     */
    Game_Fight.prototype.syncTroop = function() {
        if (typeof $gameTroop === "undefined" || !$gameTroop) return;
        $gameTroop._enemies = this._units.filter(unit => unit.enemy && !unit.gone).map(unit => unit.enemy);
        $gameTroop._turnCount = Math.max(0, this._turn - 1);
    };

    //-------------------------------------------------------------------------
    // Starting a fight.

    /**
     * Start an on-map battle here. Options: mode, who and taken (which of the
     * map's units are in it: `takeUnits`), troopId (its members join, spawned
     * round the party), canEscape, canLose, turns ("team" / "initiative"), objective
     * ({ type: "defeatAll" } / { type: "survive", turns } / { type: "defeatUnit", eventId } /
     * { type: "switch", switchId } / { type: "variable", variableId, value }),
     * onTransfer ("escape" / "keep"), bgm ("battle", the game's battle BGM, / "map").
     * Returns the fight's serial, or 0 when one is already running.
     */
    Game_Fight.prototype.start = function(options) {
        if (this._active) return 0;
        options = options || {};
        // Those who were still fading when the last battle here ended are gone by now.
        F.sweepSpawned();
        this.clear();
        this._serial++;
        this._active = true;
        this._mode = F.isOnMap(options.mode) ? options.mode : "tactical";
        this._mapId = $gameMap.mapId();
        this._turns = F.TURNS.includes(options.turns) ? options.turns : F.resolveTurns();
        this._options = {
            canEscape: !!options.canEscape,
            canLose: !!options.canLose,
            onTransfer: options.onTransfer === "keep" ? "keep" : "escape",
            bgm: options.bgm === "map" ? "map" : "battle",
            objective: F.normalizeObjective(options.objective)
        };
        const o = F.overrides();
        delete o.next;
        // Who is in it: the party, then the map's own units and a troop's members.
        this.takeParty();
        this.takeUnits(options);
        this.syncTroop();
        this.prepareParty();
        // What goes on round it: the music.
        this.startAround(options);
        this._phase = "start";
        for (const unit of this._units) {
            const battler = this.battler(unit);
            if (battler) battler.onBattleStart(false);
        }
        if (F.feed()) ReactorEvents.emit("mapBattleStart", { serial: this._serial, mode: this._mode, mapId: this._mapId });
        return this._serial;
    };

    /** The party joins: every battle member, the leader and the followers who stand for them. */
    Game_Fight.prototype.takeParty = function() {
        $gameParty.battleMembers().forEach(actor => this.addUnit({ team: "ally", record: "actor", id: actor.actorId(), party: true }));
    };

    /**
     * The unit an event is now, or null. An erased event, or one none of whose pages is met, is not on the map
     * and is no unit; any other is what its card, its note tag or a comment on its page names (`unitSpecOf`),
     * on the side Change Unit Side last gave it.
     */
    F.eventUnit = function(event) {
        const team = F.eventSide(event);
        if (!team) return null;
        const kept = F.pageUnit(event.event(), event.page().list);
        const spec = { team, record: kept.record, id: kept.id, move: kept.move };
        Object.defineProperty(spec, "ownMove", { value: !!kept.ownMove, enumerable: false });
        return spec;
    };

    /**
     * The side the unit an event is now fights on, or "" when it is no unit now: `F.eventUnit`'s answer with no
     * record made, for whoever asks about every event of the map (the map's own start, who joins a battle).
     */
    F.eventSide = function(event) {
        if (!event || event._erased) return "";
        const data = event.event(), page = data ? event.page() : null;
        if (!page) return "";
        const kept = F.pageUnit(data, page.list);
        if (!kept) return "";
        // Change Unit Side outlasts the battle it was used in: the event fights on the side it was last given.
        // (Asked only where a command has changed a side: the lookup makes a key.)
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        let side = "";
        if (fight && fight._sides) for (const any in fight._sides) { side = fight.sideOverride($gameMap.mapId(), event.eventId()); break; }
        return side && (side === "neutral" || kept.record) ? side : kept.team;
    };

    /**
     * Who is in the battle as it starts. `options.taken`: the events handed over; else `options.who`: "near" takes
     * the units the start rule takes round the party (within the map's start distance of a party member who sees
     * them: `F.takenNear`, reactor_fight_flow.js), anything else every unit on the map. The unit a goal names is in
     * it wherever it stands. A troop's members (`options.troopId`) always come, placed round the party;
     * `options.troopIfEmpty`: only when no enemy unit was taken.
     */
    Game_Fight.prototype.takeUnits = function(options) {
        F.keepResults(this);
        let events = Array.isArray(options.taken) ? options.taken : null;
        if (!events && options.who === "near" && F.takenNear) events = F.takenNear();
        for (const event of events || $gameMap.events()) this.takeEvent(event);
        const goal = this._options.objective;
        if (goal && goal.type === "defeatUnit") this.takeEvent($gameMap.event(goal.eventId));
        if (options.troopId && !(options.troopIfEmpty && this.units({ team: "enemy" }).length)) this.takeTroop(options.troopId);
    };

    /** An event of the map becomes the unit it is now (`F.eventUnit`); null when it is none, or already has one. */
    Game_Fight.prototype.takeEvent = function(event) {
        if (!event || typeof event.eventId !== "function") return null;
        const eventId = event.eventId();
        for (const unit of this._units) if (unit.eventId === eventId && !unit.gone) return null;
        const spec = F.eventUnit(event);
        return spec ? this.addUnit(Object.assign({}, spec, { eventId, ownMove: spec.ownMove })) : null;
    };

    /** A troop's members come into the battle as spawned units round the party; returns how many came. */
    Game_Fight.prototype.takeTroop = function(troopId) {
        const troop = troopId > 0 && typeof $dataTroops !== "undefined" && $dataTroops ? $dataTroops[troopId] : null;
        let came = 0;
        for (const member of (troop && troop.members) || []) {
            if (!member || member.hidden || !$dataEnemies[member.enemyId]) continue;
            const spot = this.freeSpotNear($gamePlayer.x, $gamePlayer.y, 3);
            // One bigger than its cell is moved out from the party until its body is clear of it (`around`).
            if (spot && this.spawn({ record: "enemy", id: member.enemyId, team: "enemy", x: spot.x, y: spot.y, height: spot.height, around: $gamePlayer })) came++;
        }
        return came;
    };

    /** Whether a troop would bring anyone: a member that is not hidden and whose enemy record exists. */
    F.troopComes = function(troopId) {
        const troop = troopId > 0 && typeof $dataTroops !== "undefined" && $dataTroops ? $dataTroops[troopId] : null;
        for (const member of (troop && troop.members) || []) if (member && !member.hidden && $dataEnemies[member.enemyId]) return true;
        return false;
    };

    /**
     * An event of this map joins the battle running here as the unit it is now, a full member from this moment:
     * its battler starts its battle, it counts for the goal and gives its reward. `named`: a command names it, so
     * one that left this battle earlier comes back; the rule that brings units in by itself never brings one back.
     * Returns its unit (the one it has, when it is in already), or null.
     */
    Game_Fight.prototype.join = function(event, named) {
        if (!this._active || this._ending || !this.isHere()) return null;
        if (typeof event === "number") event = $gameMap.event(event);
        if (!event || typeof event.eventId !== "function") return null;
        const eventId = event.eventId();
        const existing = this.unitOfEvent(eventId);
        if (existing) return existing;
        if (!named) for (const unit of this._units) if (unit.eventId === eventId) return null;
        const unit = this.takeEvent(event);
        if (!unit) return null;
        const battler = this.battler(unit);
        if (battler) battler.onBattleStart(false);
        // A Tactical battle: an event the map lifts onto a roof or a deck stands on it, and whatever shows the units is told.
        if (this._tac) {
            if (F.standOnLift) F.standOnLift(event);
            if (this.touch) this.touch();
        }
        return unit;
    };

    // How many battles' results are kept for an event that waits for one.
    F.RESULTS_KEPT = 16;
    /** The results of older battles are let go: nothing waits for them any more. */
    F.keepResults = function(fight) {
        const oldest = fight._serial - F.RESULTS_KEPT;
        if (oldest < 1) return;
        for (const key in fight._results) if (Number(key) <= oldest) delete fight._results[key];
    };

    /** What goes on round a battle as it starts: the game's battle BGM plays, the map's own kept for the end. */
    Game_Fight.prototype.startAround = function(options) {
        if (this._options.bgm === "battle" && typeof AudioManager !== "undefined") {
            this._savedBgm = AudioManager.saveBgm();
            AudioManager.playBgm($gameSystem.battleBgm());
        }
    };

    F.normalizeObjective = function(raw) {
        if (raw && raw.type === "survive") return { type: "survive", turns: Math.max(1, Math.floor(Number(raw.turns) || 1)) };
        if (raw && raw.type === "defeatUnit" && Number(raw.eventId) > 0) return { type: "defeatUnit", eventId: Math.floor(Number(raw.eventId)) };
        // Won when a switch is ON, or a variable is at least a value: whatever the game's events decide.
        if (raw && raw.type === "switch" && Number(raw.switchId) > 0) return { type: "switch", switchId: Math.floor(Number(raw.switchId)) };
        if (raw && raw.type === "variable" && Number(raw.variableId) > 0) return { type: "variable", variableId: Math.floor(Number(raw.variableId)), value: Math.floor(Number(raw.value) || 0) };
        return { type: "defeatAll" };
    };

    Game_Fight.prototype.sideOverride = function(mapId, eventId) {
        return (this._sides && this._sides[mapId + "," + eventId]) || "";
    };

    /**
     * Change Unit Side: an event of this map fights as an ally, an enemy or a bystander from now on
     * (in the battle running here at once, and in later ones), or goes back to its own setting
     * (any other `team`). A bystander with no Database record cannot be made to fight. The party's
     * own members never change sides. A unit standing outside the battle running here joins it first,
     * wherever it stands.
     */
    Game_Fight.prototype.setEventSide = function(eventId, team) {
        if (!(eventId > 0)) return false;
        const key = $gameMap.mapId() + "," + eventId;
        const authored = typeof $dataMap !== "undefined" && $dataMap && $dataMap.events && $dataMap.events[eventId];
        this._sides = this._sides || {};
        if (!F.TEAMS.includes(team)) delete this._sides[key];
        else if (authored) this._sides[key] = team;
        if (!this._active || !this.isHere()) return true;
        const unit = this.unitOfEvent(eventId) || this.join(eventId, true);
        if (!unit || unit.party) return true;
        let next = team;
        if (!F.TEAMS.includes(next)) {
            const event = $gameMap.event(eventId);
            const spec = event ? F.pageUnit(event.event(), F.eventList(event)) : null;
            next = spec ? spec.team : unit.team;
        }
        if (next !== "neutral" && !unit.enemy && !unit.actorId) return false;
        if (unit.team === next) return true;
        unit.team = next;
        this.syncTroop();
        this.checkOutcome();
        return true;
    };

    /** A command's goal fields as an objective (Start Battle on Map, Change Battle Goal). */
    F.objectiveOfArgs = function(args) {
        const int = value => Math.floor(Number(value) || 0);
        args = args || {};
        if (args.objective === "survive") return F.normalizeObjective({ type: "survive", turns: int(args.turnsToSurvive) });
        if (args.objective === "defeatUnit") return F.normalizeObjective({ type: "defeatUnit", eventId: int(args.unitEventId) });
        if (args.objective === "switch") return F.normalizeObjective({ type: "switch", switchId: int(args.goalSwitchId) });
        if (args.objective === "variable") return F.normalizeObjective({ type: "variable", variableId: int(args.goalVariableId), value: int(args.goalValue) });
        return { type: "defeatAll" };
    };

    /** A new goal for the battle that is running; it is judged at once and from then on. The unit it names joins the battle first, wherever it stands. */
    Game_Fight.prototype.setObjective = function(objective) {
        if (!this._active) return;
        const goal = this._options.objective = F.normalizeObjective(objective);
        if (goal.type === "defeatUnit") this.join(goal.eventId, true);
        this.checkOutcome();
    };

    Game_Fight.prototype.objective = function() {
        return Object.assign({}, (this._options && this._options.objective) || { type: "defeatAll" });
    };

    /** Followers stand and walk on their own during a fight; they were hidden, they show. */
    Game_Fight.prototype.prepareParty = function() {
        const followers = $gamePlayer.followers();
        // A save made before the party's size was raised has too few followers: one for every member who fights.
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        for (let i = followers._data.length + 1; i < $gameParty.maxBattleMembers(); i++) {
            const follower = new Game_Follower(i);
            follower.locate($gamePlayer.x, $gamePlayer.y);
            followers._data.push(follower);
            if (scene && scene._spriteset && scene._spriteset.rrAddCharacter) scene._spriteset.rrAddCharacter(follower);
        }
        // A walk back from the last battle that is still on ends here, and so does a gather: each is a unit on its own cell again.
        F.endRegroup(followers);
        followers._gathering = false;
        this._followers = { visible: followers.isVisible() };
        if (!followers.isVisible()) followers.show();
        for (const follower of followers.data()) {
            follower.setThrough(false);
            // One still fading in from the last battle is whole: in a battle it keeps the dimness it starts with.
            follower._rrFade = 0;
            follower.setOpacity($gamePlayer.opacity());
        }
        $gamePlayer.refresh();
    };

    /**
     * The party walks out of a battle that is kept on its map (`away`), or back into it. Away from it the
     * followers trail the leader as on any map, hidden where the game had them hidden; back in it each is a
     * unit on its own again.
     */
    Game_Fight.prototype.partyAway = function(away) {
        const followers = $gamePlayer.followers();
        const hidden = !!this._followers && !this._followers.visible;
        if (away) F.endRegroup(followers);
        for (const follower of followers.data()) follower.setThrough(!!away);
        if (hidden && away === followers.isVisible()) {
            if (away) followers.hide(); else followers.show();
            $gamePlayer.refresh();
        }
    };

    Game_Fight.prototype.restoreParty = function() {
        const followers = $gamePlayer.followers();
        for (const follower of followers.data()) follower.setThrough(true);
        const hidden = !!this._followers && !this._followers.visible;
        if (hidden) followers.hide();
        this._followers = null;
        $gamePlayer.refresh();
        // They come back by themselves and the player is never held for it. Hidden ones are simply with the leader again.
        if (hidden) for (const follower of followers._data) Game_CharacterBase.prototype.locate.call(follower, $gamePlayer.x, $gamePlayer.y);
        else F.regroup(followers);
    };

    //-------------------------------------------------------------------------
    // Where a body can be put. On a 3D map a cell is more than its tile: a lamp
    // post, a stall's roof, a fountain's rim and a pond's floor are all cells
    // the tiles call walkable.

    const is3D = function() {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        return !!(R && R.isMap3D && typeof $dataMap !== "undefined" && $dataMap && R.isMap3D($dataMap));
    };

    /** The height a character stands at: 0 on a map without 3D, NaN when nobody is asked about. */
    const groundOf = function(character) {
        if (!character) return NaN;
        if (!is3D()) return 0;
        if (Number.isFinite(character._reactorGround)) return character._reactorGround;
        return Reactor3D.characterGround ? Reactor3D.characterGround($dataMap, character) : NaN;
    };

    // What the physics is asked with: how far from the height given a standing place may be, and in what water.
    const nearBy = { within: 0 }, inWater = { within: 0, water: "any" };

    /** The height of a cell's own ground, what is built there stands on: the 3D world's answer, else the lowest of the cell's levels. */
    const baseOf = function(x, y) {
        if (Reactor3D.pieceBaseAt) return Reactor3D.pieceBaseAt($dataMap, x, y);
        const levels = root.ReactorPhysics.levelsAt($dataMap, x, y);
        return levels.length ? levels[0].top : NaN;
    };

    /** What a body at a height on a cell stands on: "ground", or the kind of the piece on top; "" when no level is there. */
    const kindAt = function(x, y, height) {
        const levels = root.ReactorPhysics.levelsAt($dataMap, x, y);
        for (let i = 0; i < levels.length; i++) if (Math.abs(levels[i].top - height) < 1e-3) return levels[i].kind;
        return "";
    };

    /**
     * The height a body put on cell (x, y) stands at, or NaN when the cell holds no place for one. Coming from
     * height `from` it is the place nearest that height, no more than a low step off it (the same floor, not
     * the roof over it or the ledge beside it); with no `from` it is the place on the cell's own ground (a floor
     * slab is a low step up from it; a crate, a counter, a rock or a wall is not). Either way a place the physics
     * lets a body stand (`ReactorPhysics.standingAt`: wide and level enough, room for the body under whatever hangs
     * over it, out of a bush that blocks, in water no deeper than a wade). `plain`: only the ground and what is built
     * as ground (a floor, a stair, a block, rock), not the top of a shape (a bench, a crate, a deck). A map without
     * 3D has one level, 0, on every cell.
     */
    F.standLevel = function(x, y, from, plain) {
        const P = root.ReactorPhysics;
        if (!P || !P.standingAt || !is3D()) return 0;
        nearBy.within = F.SPOT_STEP;
        const height = P.standingAt($dataMap, x, y, Number.isFinite(from) ? from : baseOf(x, y), nearBy);
        if (height === null) return NaN;
        if (plain) {
            const kind = kindAt(x, y, height);
            if (kind !== "rock" && Reactor3D.isShapeKind && Reactor3D.isShapeKind(kind)) return NaN;
        }
        return height;
    };

    /**
     * The height a unit asked for by its cell alone stands at, or NaN. The floor the party leader is on, where the
     * cell has it (the battle is there); else the highest of the cell's places to stand that is ground: the
     * cell's own ground, blocks or a floor no more than `F.SPOT_STAGE` over it (a stage), or a top a walker
     * reaches (a hill of rock, a bridge over a ravine). Never the top of something that only stands there (a
     * crate, a stall's roof, a house's, a fountain's rim): such a cell holds no place for a unit that names no height.
     */
    F.groundLevel = function(x, y) {
        const P = root.ReactorPhysics;
        if (!P || !P.standingAt || !is3D()) return 0;
        const lead = typeof $gamePlayer !== "undefined" && $gamePlayer ? groundOf($gamePlayer) : NaN;
        if (Number.isFinite(lead)) {
            const level = F.standLevel(x, y, lead);
            if (Number.isFinite(level)) return level;
        }
        const base = baseOf(x, y), levels = P.levelsAt($dataMap, x, y);
        for (let i = levels.length - 1; i >= 0; i--) {
            const top = levels[i].top, kind = levels[i].kind;
            nearBy.within = 1e-3;
            if (P.standingAt($dataMap, x, y, top, nearBy) !== top) continue;
            if (Math.abs(top - base) <= F.SPOT_STEP) return top;
            if (F.NO_SPOT[kind]) continue;
            if ((kind === "block" || kind === "floor") && top - base <= F.SPOT_STAGE) return top;
            if (F.reachedOnFoot(x, y, top)) return top;
        }
        return NaN;
    };

    const STEP_X = [0, -1, 1, 0], STEP_Y = [1, 0, 0, -1];
    /**
     * Whether a place to stand is ground a walker reaches: joined to some cell's own ground, through no more than
     * `F.SPOT_REACH` cells, by steps from cell to cell no higher than a walked one. A stair's steps are higher, so
     * an upper floor and a roof are not; neither is a top with a drop all round it.
     */
    F.reachedOnFoot = function(x, y, height) {
        const R = Reactor3D, P = root.ReactorPhysics, width = $dataMap.width;
        const seen = new Set([y * width + x]), queue = [x, y, height];
        nearBy.within = Number.isFinite(R.TERRAIN_SLOPE_LIMIT) ? R.TERRAIN_SLOPE_LIMIT : 0.75;
        for (let at = 0; at < queue.length && seen.size <= F.SPOT_REACH; at += 3) {
            const cx = queue[at], cy = queue[at + 1], ch = queue[at + 2];
            for (let d = 0; d < 4; d++) {
                const nx = cx + STEP_X[d], ny = cy + STEP_Y[d], key = ny * width + nx;
                if (!$gameMap.isValid(nx, ny) || seen.has(key)) continue;
                const next = P.standingAt($dataMap, nx, ny, ch, nearBy);
                if (next === null) continue;
                if (Math.abs(next - baseOf(nx, ny)) <= F.SPOT_STEP) return true;
                seen.add(key);
                queue.push(nx, ny, next);
            }
        }
        return false;
    };

    /** The height whoever stands on a cell stands at (the player, a unit, an event); NaN when nobody does. */
    Game_Fight.prototype.heightAt = function(x, y) {
        if ($gamePlayer.pos(x, y)) return groundOf($gamePlayer);
        const unit = this._active ? this.unitAt(x, y) : null;
        if (unit) return groundOf(this.character(unit));
        const events = $gameMap.eventsXy(x, y);
        return events.length ? groundOf(events[0]) : NaN;
    };

    /**
     * Whether the 3D world knows a model's body or guesses it: until a model has loaded, its body is taken as a
     * square of its longest side (a standing figure, three cells square).
     */
    const bodyKnown = function(event, body) {
        if (!body.model) return true;
        const R = Reactor3D, spec = R.characterModelSpec ? R.characterModelSpec(event) : null;
        if (!spec || !R._glbCache || !R.collisionKeysFor) return true;
        const entry = R._glbCache[R.collisionKeysFor(spec).model];
        return !!(entry && entry.template);
    };

    /**
     * Whether a cell is taken: the player, a unit, or an event that stands in the way. An event is on every cell
     * its body covers (a big model, a sized event: `Game_Event.prototype.pos`), so nobody is put inside a big unit;
     * a body that is only a guess takes its own cell alone, so a formation of models still loading is not scattered.
     */
    Game_Fight.prototype.cellTaken = function(x, y) {
        if ($gamePlayer.pos(x, y) || this.unitAt(x, y)) return true;
        const events = $gameMap.eventsXyNt(x, y);
        if (!events.length) return false;
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            if ((event.x === x && event.y === y) || !R || !R.eventBody || bodyKnown(event, R.eventBody(event))) return true;
        }
        return false;
    };

    /**
     * The nearest free cell a body can stand on, at least `near` from (x, y), searching outward: `{ x, y, height }`,
     * or null. `from` is the height asked from (whoever stands on (x, y) without it). Plain ground on that same
     * level comes first; then anything else stood on at that level (a deck, a bench); then a cell that is a
     * place to stand by its own ground (a hillside has no two cells level); a map where none of these is in
     * reach gives a free cell its tiles let a walker onto.
     */
    Game_Fight.prototype.freeSpotNear = function(x, y, near, from) {
        if (!Number.isFinite(from)) from = this.heightAt(x, y);
        const known = Number.isFinite(from);
        let second = null, third = null;
        for (let radius = Math.max(1, near); radius <= near + 6; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const cx = x + dx, cy = y + dy;
                    if (!$gameMap.isValid(cx, cy)) continue;
                    // The cheap questions first: in a crowd (an army spawned around one spot) most cells tried hold a unit,
                    // and asking the map who stands there walks every event. So that is asked last, of a cell good otherwise.
                    if ($gamePlayer.pos(cx, cy) || this.unitAt(cx, cy)) continue;
                    if (!($gameMap.isPassable(cx, cy, 2) || $gameMap.isPassable(cx, cy, 4) || $gameMap.isPassable(cx, cy, 6) || $gameMap.isPassable(cx, cy, 8))) continue;
                    let height = F.standLevel(cx, cy, from, true);
                    if (Number.isFinite(height)) {
                        if (!this.cellTaken(cx, cy)) return { x: cx, y: cy, height };
                        continue;
                    }
                    if (!second && Number.isFinite(height = F.standLevel(cx, cy, from)) && !this.cellTaken(cx, cy)) second = { x: cx, y: cy, height };
                    else if (known && !third && Number.isFinite(height = F.standLevel(cx, cy)) && !this.cellTaken(cx, cy)) third = { x: cx, y: cy, height };
                }
            }
        }
        return second || third || this.anyFreeCell(x, y, near);
    };

    /** The nearest free cell the tiles let a walker onto, whatever is built on it: the last answer of `freeSpotNear`. */
    Game_Fight.prototype.anyFreeCell = function(x, y, near) {
        for (let radius = Math.max(1, near); radius <= near + 6; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const cx = x + dx, cy = y + dy;
                    if (!$gameMap.isValid(cx, cy) || this.cellTaken(cx, cy)) continue;
                    if ($gameMap.isPassable(cx, cy, 2) || $gameMap.isPassable(cx, cy, 4) || $gameMap.isPassable(cx, cy, 6) || $gameMap.isPassable(cx, cy, 8)) return { x: cx, y: cy, height: NaN };
                }
            }
        }
        return null;
    };

    /**
     * Where a unit asked for at (x, y) is put: that cell when it is free and a body can stand there (at the height
     * `from` when one is given, else on its ground: `F.groundLevel`), else the nearest one that is; the cell as
     * asked when there is none, so a unit a battle needs is never missing.
     */
    Game_Fight.prototype.spotFor = function(x, y, from) {
        const known = Number.isFinite(from);
        const height = known ? F.standLevel(x, y, from) : F.groundLevel(x, y);
        if (Number.isFinite(height) && !this.cellTaken(x, y)) return { x, y, height };
        return this.freeSpotNear(x, y, 1, known ? from : this.heightAt(x, y)) || { x, y, height };
    };

    /**
     * A unit bigger than its cell must fit where it stands: its body clear of the party and of every other body
     * (`Reactor3D.bodyFits`). One that does not is moved to the nearest cell round (x, y), from `near` cells out,
     * where it does. `free`: the place was the battle's own choice near (x, y), not the game's cell, so more is
     * asked of it, there and anywhere it is moved to: its body (the rectangle it lies in), not only its own cell,
     * keeps `near` cells from (x, y), and every cell under it is a place to stand near its own level (not through
     * a wall, a lamp or a pond). What cannot be had is given up in that order, the ground first, and good ground is
     * looked for close by only. The party is never moved for it. Returns whether its body is clear where it is now.
     */
    Game_Fight.prototype.fitBody = function(event, x, y, near, from, free) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        if (!R || !R.eventBody || !R.bodyFits) return true;
        let body = null;
        try { body = R.eventBody(event); } catch (error) { body = null; }
        if (!body || body.count <= 1) return true;
        // A body that is only a guess moves nobody off the cell the game asked for.
        if (!free && !bodyKnown(event, body)) return true;
        const homeX = event.x, homeY = event.y, homeGround = event._reactorGround;
        const solid = is3D() && !!(root.ReactorPhysics && root.ReactorPhysics.standingAt);
        // The open ground between the body and the middle of (x, y): what a one-cell unit `near` cells off leaves.
        const room = free ? Math.max(0, near - 0.5) : 0, px = x + 0.5, py = y + 0.5;
        const roomAt = (cx, cy) => {
            if (room <= 0) return true;
            const x0 = cx + body.ox, y0 = cy + body.oy;
            const dx = px < x0 ? x0 - px : px > x0 + body.w ? px - x0 - body.w : 0, dy = py < y0 ? y0 - py : py > y0 + body.h ? py - y0 - body.h : 0;
            return dx * dx + dy * dy >= room * room;
        };
        const clear = R.bodyFits(event, homeX, homeY), roomy = clear && roomAt(homeX, homeY);
        if (roomy && !(free && solid && Number.isFinite(homeGround) && !this.bodyStands(body, homeX, homeY, homeGround))) return true;
        // Far enough out to clear another body as big as its own.
        const first = Math.max(1, near), last = first + 2 * body.reach + 6;
        // Pass 0: clear, roomy and on standing ground; 1: clear and roomy; 2: clear.
        for (let pass = solid ? 0 : 1; pass < 3; pass++) {
            // What this pass asks it already has where it stood (or the pass asks nothing new): it stays.
            if ((pass === 1 && roomy) || (pass === 2 && (clear || room <= 0))) break;
            const far = pass === 0 ? Math.min(last, first + body.reach + 2) : last;
            for (let radius = first; radius <= far; radius++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    for (let dy = -radius; dy <= radius; dy++) {
                        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                        const cx = x + dx, cy = y + dy;
                        // The cheap questions first: most cells near (x, y) leave no room.
                        if (!$gameMap.isValid(cx, cy) || (pass < 2 && !roomAt(cx, cy))) continue;
                        const height = F.standLevel(cx, cy, from);
                        if (!Number.isFinite(height)) continue;
                        // Tried where it would stand: nothing is drawn of a try.
                        event.setPosition(cx, cy);
                        if (solid) event._reactorGround = height;
                        if (!R.bodyFits(event, cx, cy) || (pass === 0 && !this.bodyStands(body, cx, cy, height))) continue;
                        return true;
                    }
                }
            }
        }
        event.setPosition(homeX, homeY);
        event._reactorGround = homeGround;
        return clear;
    };

    /** Whether every cell under a body whose own cell is (x, y) holds a place to stand within `F.SPOT_HULL` of `height`. */
    Game_Fight.prototype.bodyStands = function(body, x, y, height) {
        const P = root.ReactorPhysics;
        nearBy.within = F.SPOT_HULL;
        for (let j = 0; j < body.h; j++) {
            for (let i = 0; i < body.w; i++) {
                if (body.cells !== null && !body.cells[j * body.w + i]) continue;
                const cx = x + body.ox + i, cy = y + body.oy + j;
                if (!$gameMap.isValid(cx, cy) || P.standingAt($dataMap, cx, cy, height, nearBy) === null) return false;
            }
        }
        return true;
    };

    //-------------------------------------------------------------------------
    // After a battle the followers, who fought wherever it took them, fall in
    // behind the leader again by themselves: the player walks on at once. One
    // near enough walks back at a run; one far off, on another floor or stopped
    // on the way is put beside the one before it and fades in. Each ends on a
    // cell of its own, one walked step from the one before it.

    // Where a follower stands beside the one before it, by that one's facing: behind, then the sides, then the
    // corners behind, then in front. [dx, dy] pairs.
    const BESIDE = {
        2: [0, -1, -1, 0, 1, 0, -1, -1, 1, -1, 0, 1, -1, 1, 1, 1],
        8: [0, 1, 1, 0, -1, 0, 1, 1, -1, 1, 0, -1, 1, -1, -1, -1],
        4: [1, 0, 0, -1, 0, 1, 1, -1, 1, 1, -1, 0, -1, -1, -1, 1],
        6: [-1, 0, 0, 1, 0, -1, -1, 1, -1, -1, 1, 0, 1, 1, 1, -1]
    };
    const spotOut = { x: 0, y: 0, height: NaN }, spotOther = { x: 0, y: 0, height: NaN };

    /** Starts the walk back: the frames it may take, and how many of the party walk the map (`members`: a follower past them stands for nobody). */
    F.regroup = function(followers) {
        if (!followers) return;
        followers._gathering = false;
        followers._rrRegroup = { frames: F.REGROUP_FRAMES, members: $gameParty.battleMembers().length };
    };

    /** The walk back is over (or cut short): followers trail the leader as they always do. */
    F.endRegroup = function(followers) {
        if (!followers || !followers._rrRegroup) return;
        followers._rrRegroup = null;
        for (const follower of followers._data) follower.setThrough(true);
    };

    /**
     * One walked step: the height a walker at `height` on cell (x, y) is at on the next cell toward `d` (2, 4, 6,
     * 8), or NaN when the tiles or the terrain stop it (a wall, a ledge, a bush, a stair's side). Nobody's body
     * is asked. A map without 3D is level: 0.
     */
    const stepLands = function(x, y, d, height) {
        if (height !== height) return NaN;
        const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
        if (!$gameMap.isValid(x2, y2) || !$gameMap.isPassable(x, y, d) || !$gameMap.isPassable(x2, y2, 10 - d)) return NaN;
        if (!is3D()) return 0;
        const R = Reactor3D;
        // A world that cannot say how its ground steps is level.
        if (!R.terrainBlocks || !R.groundHeightAt) return height;
        if (R.terrainBlocks($dataMap, x, y, x2, y2, height)) return NaN;
        // As the terrain's own rule reads the step: the edge between the two cells, then the middle of the next.
        const edge = R.groundHeightAt($dataMap, (x + x2) / 2 + 0.5, (y + y2) / 2 + 0.5, height);
        return R.groundHeightAt($dataMap, x2 + 0.5, y2 + 0.5, edge);
    };

    /**
     * The height a walker leaving `lead`'s cell is at on the cell (dx, dy) beside it, a diagonal one by either of
     * its corners; NaN when no walked step leads there. Up a stair it is the stair's next step, not the lead's height.
     */
    F.besideLands = function(lead, dx, dy) {
        const from = is3D() ? groundOf(lead) : 0, horz = dx < 0 ? 4 : 6, vert = dy < 0 ? 8 : 2;
        if (!dy) return stepLands(lead.x, lead.y, horz, from);
        if (!dx) return stepLands(lead.x, lead.y, vert, from);
        const height = stepLands($gameMap.roundXWithDirection(lead.x, horz), lead.y, vert, stepLands(lead.x, lead.y, horz, from));
        return height === height ? height : stepLands(lead.x, $gameMap.roundYWithDirection(lead.y, vert), horz, stepLands(lead.x, lead.y, vert, from));
    };

    /** Whether a follower may be put on a cell: on the map, not the leader's, not that of a follower before it in the line (`index`), no event in the way. */
    const cellOpen = function(followers, index, x, y) {
        if (!$gameMap.isValid(x, y) || $gamePlayer.pos(x, y)) return false;
        const data = followers._data;
        for (let k = 0; k < index && k < data.length; k++) if (data[k].pos(x, y)) return false;
        const events = $gameMap.eventsXyNt(x, y);
        for (let k = 0; k < events.length; k++) if (events[k].isNormalPriority()) return false;
        return true;
    };

    /** Whether a character stands in water deeper than a wade (it swims there, or stands on the bottom). */
    const inDeepWater = function(character) {
        if (!is3D()) return false;
        const R = Reactor3D, ground = groundOf(character);
        return !!(R.hasWater && R.waterDepthAt && R.hasWater($dataMap) && Number.isFinite(ground)
            && R.waterDepthAt($dataMap, character.x + 0.5, character.y + 0.5, ground) > R.WATER_WADE);
    };

    /**
     * A free cell beside `lead` a body can stand on, one walked step from the lead's cell (never through a wall
     * or up a ledge): the shared `spotOut`, or null. Plain ground first; beside a lead that is itself in deep
     * water, the water it is in; then anything stood on. `index` is the follower's place in the line (those
     * before it keep their cells).
     */
    F.spotBeside = function(followers, lead, index) {
        return F.spotBesideOn(followers, lead, index, "plain")
            || (inDeepWater(lead) ? F.spotBesideOn(followers, lead, index, "water") : null)
            || F.spotBesideOn(followers, lead, index, "any");
    };
    /** As `spotBeside`, by one rule: "plain" ground only, "any" place a body stands on, or the "water" the lead is in. */
    F.spotBesideOn = function(followers, lead, index, rule) {
        const order = BESIDE[lead.direction()] || BESIDE[2];
        for (let i = 0; i < order.length; i += 2) {
            const dx = order[i], dy = order[i + 1], x = lead.x + dx, y = lead.y + dy;
            if (!cellOpen(followers, index, x, y)) continue;
            const lands = F.besideLands(lead, dx, dy);
            if (lands !== lands) continue;
            let height = NaN;
            if (rule === "water") {
                inWater.within = F.SPOT_STEP;
                const wet = root.ReactorPhysics.standingAt($dataMap, x, y, lands, inWater);
                if (wet !== null) height = wet;
            } else height = F.standLevel(x, y, lands, rule === "plain");
            if (!Number.isFinite(height)) continue;
            spotOut.x = x; spotOut.y = y; spotOut.height = height;
            return spotOut;
        }
        return null;
    };

    /**
     * Where a follower goes when no cell beside `lead` will do (the lead in a doorway, on a post, in a crowd): the
     * nearest free cell within `F.REGROUP_AROUND` a body can stand on, level with the lead first, else on its own
     * ground. The shared `spotOut`, or null.
     */
    F.spotAround = function(followers, lead, index) {
        const from = groundOf(lead);
        let other = null;
        for (let radius = 2; radius <= F.REGROUP_AROUND; radius++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const x = lead.x + dx, y = lead.y + dy;
                    if (!cellOpen(followers, index, x, y)) continue;
                    let height = F.standLevel(x, y, from);
                    if (Number.isFinite(height)) { spotOut.x = x; spotOut.y = y; spotOut.height = height; return spotOut; }
                    if (!other && Number.isFinite(height = F.standLevel(x, y))) { other = spotOther; other.x = x; other.y = y; other.height = height; }
                }
            }
        }
        return other;
    };

    /**
     * Puts a follower beside `lead`, on the level a step from the lead's cell ends on, and lets it fade in; where
     * nobody can stand beside the lead, on the nearest standing place round it. Only where the map holds no such
     * place at all is it left on the lead's cell.
     */
    F.putBeside = function(followers, follower, lead, index) {
        const spot = F.spotBeside(followers, lead, index) || F.spotAround(followers, lead, index);
        const x = spot ? spot.x : lead.x, y = spot ? spot.y : lead.y;
        const height = spot ? spot.height : groundOf(lead);
        const level = !is3D() || Math.abs(groundOf(follower) - height) <= F.SPOT_STEP;
        if (follower.pos(x, y) && level && !follower.isMoving()) return;
        // One step away on that level it walks there; further off it is simply there.
        const near = level && Math.max(Math.abs(follower.x - x), Math.abs(follower.y - y)) === 1;
        follower.setThrough(true);
        if (near && F.stepToward(follower, x, y)) { follower.setMoveSpeed(F.REGROUP_SPEED); return; }
        follower.locate(x, y);
        follower.setDirection(lead.direction());
        // On the level found there, not on whatever roof or ledge it stood on where it was.
        if (Number.isFinite(height) && is3D()) follower._reactorGround = height;
        follower._rrFade = F.REGROUP_FADE;
    };

    /** Whether a follower beside `lead` stands where one walked step from the lead's cell ends: its own floor, a stair's next step, not the roof over it or a ledge. */
    F.standsBeside = function(lead, follower) {
        if (!is3D()) return true;
        const lands = F.besideLands(lead, follower.x - lead.x, follower.y - lead.y);
        return Math.abs(lands - groundOf(follower)) <= F.SPOT_STEP;
    };

    /** One step toward a cell as a walker takes it: the diagonal, else along the longer way, else the other. False when none is open. */
    F.stepToward = function(character, x, y) {
        const sx = character.deltaXFrom(x), sy = character.deltaYFrom(y);
        const horz = sx > 0 ? 4 : 6, vert = sy > 0 ? 8 : 2;
        if (sx !== 0 && sy !== 0) {
            character.moveDiagonally(horz, vert);
            if (character.isMovementSucceeded()) return true;
        }
        const first = Math.abs(sx) >= Math.abs(sy) ? (sx !== 0 ? horz : vert) : (sy !== 0 ? vert : horz);
        const second = first === horz ? vert : horz;
        for (const d of [first, second]) {
            if ((d === horz && sx === 0) || (d === vert && sy === 0)) continue;
            character.moveStraight(d);
            if (character.isMovementSucceeded()) return true;
        }
        return false;
    };

    /** A follower's frame of the walk back to `lead`, the one before it in the line. False once it stands in its place. */
    F.regroupStep = function(followers, follower, lead, index, last) {
        // On its way: at a run, whatever pace the leader keeps.
        if (follower.isMoving()) { follower.setMoveSpeed(F.REGROUP_SPEED); return true; }
        const far = Math.max(Math.abs(follower.x - lead.x), Math.abs(follower.y - lead.y));
        // In its place: beside the one before it, on a cell of its own, on that one's floor (not on the roof over the next cell).
        if (far === 1 && !F.sharesCell(followers, follower, index) && F.standsBeside(lead, follower)) { follower.setThrough(true); return false; }
        if (far > 1 && far <= F.REGROUP_REACH && !last && Math.abs(groundOf(follower) - groundOf(lead)) <= F.REGROUP_RISE) {
            // It walks as a walker does, round nothing: the first thing in its way ends the walk.
            follower.setThrough(false);
            if (F.stepToward(follower, lead.x, lead.y)) { follower.setMoveSpeed(F.REGROUP_SPEED); return true; }
        }
        F.putBeside(followers, follower, lead, index);
        return follower.isMoving();
    };

    /** Whether a follower stands on the leader's cell or on that of a follower before it in the line. */
    F.sharesCell = function(followers, follower, index) {
        if ($gamePlayer.pos(follower.x, follower.y)) return true;
        const data = followers._data;
        for (let k = 0; k < index && k < data.length; k++) if (data[k] !== follower && data[k].pos(follower.x, follower.y)) return true;
        return false;
    };

    /** One frame of the walk back, before the followers' own update. */
    F.updateRegroup = function(followers) {
        const state = followers._rrRegroup;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        // A new battle, a transfer, a ride, a gather an event asked for or hidden followers: it ends where it stands.
        if (!state || (fight && fight.isHere()) || $gamePlayer.isTransferring() || $gamePlayer.isInVehicle() || followers.areGathering() || !followers.isVisible()) {
            F.endRegroup(followers);
            return;
        }
        const last = --state.frames <= 0, data = followers._data;
        let lead = $gamePlayer, busy = false;
        for (let i = 0; i < data.length; i++) {
            const follower = data[i];
            // A follower past the party's number stands for nobody and is not shown.
            if (follower._memberIndex >= state.members) continue;
            if (F.regroupStep(followers, follower, lead, i, last)) busy = true;
            lead = follower;
        }
        if (!busy || last) F.endRegroup(followers);
    };

    //-------------------------------------------------------------------------
    // Spawning: a unit made as a new event on this map. It looks like a
    // template event when one is named, else like its record (an actor's
    // character, an enemy's `<unit character: Name, index>` note) and, on a 3D
    // map, the model the Database binds to that record.

    Game_Fight.prototype.spawn = function(options) {
        const spec = F.normalizeUnit({ team: options.team || (options.record === "actor" ? "ally" : "enemy"), record: options.record, id: options.id, move: options.move });
        if (!spec || !$gameMap.isValid(options.x, options.y)) return null;
        // Only where a body can stand and nobody does: a cell that is a lamp, a roof, a crate, a bush, deep water or
        // somebody's own gives way to the nearest one that is not (`height`: the floor meant, on a cell with several).
        const spot = this.spotFor(options.x, options.y, Number(options.height));
        if (spot.x !== options.x || spot.y !== options.y) options = Object.assign({}, options, { x: spot.x, y: spot.y });
        const eventId = F.freeEventId();
        const data = F.spawnData(eventId, spec, options);
        $dataMap.events[eventId] = data;
        $gameMap._rrSpawned = $gameMap._rrSpawned || {};
        $gameMap._rrSpawned[eventId] = data;
        const event = new Game_Event($gameMap.mapId(), eventId);
        $gameMap._events[eventId] = event;
        // It stands on the level chosen: left to the cell's stack it would stand on top of whatever is built there.
        if (Number.isFinite(spot.height) && is3D()) event._reactorGround = spot.height;
        if (options.direction) event.setDirection(options.direction);
        // One bigger than its cell: clear of the party and of the others, round the one it was asked near
        // (`around`: a character, or anything with x and y) or round its own cell.
        const around = options.around;
        if (around) this.fitBody(event, around.x, around.y, Math.max(Math.abs(event.x - around.x), Math.abs(event.y - around.y)), spot.height, true);
        else this.fitBody(event, event.x, event.y, 1, spot.height, false);
        data.x = event.x; data.y = event.y;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        if (scene && scene._spriteset && scene._spriteset.rrAddCharacter) scene._spriteset.rrAddCharacter(event);
        return this._active ? this.addUnit(Object.assign({}, spec, { eventId, ownMove: spec.ownMove })) : null;
    };

    /**
     * Units spawned for a battle that fell and are gone from the map leave it: the event, its sprite, its place in
     * the saved list of spawned units and its self switches. A map that hosts battle after battle (an army drill) would otherwise carry every
     * fallen unit of every battle, each still a sprite updated every frame. One still standing, or still fading, stays.
     */
    F.sweepSpawned = function() {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null, spawned = map && map._rrSpawned;
        if (!spawned) return 0;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        const spriteset = scene && scene._spriteset;
        let swept = 0;
        for (const key of Object.keys(spawned)) {
            const id = Number(key), event = map._events[id];
            if (event && !event._erased) continue;
            if (fight && fight._active && fight._units.some(unit => unit.eventId === id && !unit.gone)) continue;
            if (event && spriteset && spriteset._characterSprites) {
                for (let at = spriteset._characterSprites.length - 1; at >= 0; at--) {
                    const sprite = spriteset._characterSprites[at];
                    if (!sprite || sprite._character !== event) continue;
                    spriteset._characterSprites.splice(at, 1);
                    if (sprite.parent) sprite.parent.removeChild(sprite);
                    if (sprite.destroy) sprite.destroy();
                }
            }
            map._events[id] = undefined;
            delete spawned[key];
            // Its data stays in the map's list until the map is read again: whatever still holds the event for a
            // frame (a model's holder, an effect) reads an erased event, not a missing one, and the id is not reused.
            // The next unit to take this id starts with no self switch of the last one's.
            if (typeof $gameSelfSwitches !== "undefined" && $gameSelfSwitches && $gameSelfSwitches._data) {
                for (const letter of ["A", "B", "C", "D"]) delete $gameSelfSwitches._data[[map.mapId(), id, letter]];
            }
            swept++;
        }
        return swept;
    };

    /** An id after every authored event and below the props' range. */
    F.freeEventId = function() {
        let id = 1;
        const base = typeof Reactor3D !== "undefined" && Reactor3D.PROP_EVENT_BASE ? Reactor3D.PROP_EVENT_BASE : 10000;
        const events = $dataMap.events || [];
        for (let i = 1; i < Math.min(events.length, base); i++) if (events[i] || $gameMap._events[i]) id = i + 1;
        return id;
    };

    F.spawnData = function(eventId, spec, options) {
        const template = options.template > 0 ? $dataMap.events[options.template] : null;
        let image = { tileId: 0, characterName: "", characterIndex: 0, direction: options.direction || 2, pattern: 1 };
        let pages = null;
        if (template && template.pages) {
            pages = JSON.parse(JSON.stringify(template.pages)).filter(page => !F.pageHook(page));
        } else if (spec.record === "actor" && $dataActors[spec.id]) {
            image.characterName = $dataActors[spec.id].characterName;
            image.characterIndex = $dataActors[spec.id].characterIndex;
        } else if (spec.record === "enemy" && $dataEnemies[spec.id]) {
            // The enemy's own picture on the map: its `rrBattle.character` (the Database's card), else its note tag.
            const own = $dataEnemies[spec.id].rrBattle && $dataEnemies[spec.id].rrBattle.character;
            // A tag with no index names the sheet's first character, as the look rule reads it.
            const ownName = own && typeof own === "object" ? String(own.name || "").trim() : "";
            const match = ownName ? null : /<unit\s*character\s*:\s*([^,>]+?)\s*(?:,\s*(\d+)\s*)?>/i.exec(String($dataEnemies[spec.id].note || ""));
            if (ownName) { image.characterName = ownName; image.characterIndex = Math.min(7, Math.max(0, Number(own.index) || 0)); }
            else if (match && match[1].trim()) { image.characterName = match[1].trim(); image.characterIndex = Math.min(7, Number(match[2]) || 0); }
        }
        if (!pages || !pages.length) {
            pages = [{
                conditions: { actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: "A", selfSwitchValid: false,
                    switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0 },
                directionFix: false, image, list: [{ code: 0, indent: 0, parameters: [] }], moveFrequency: 3,
                moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
                moveSpeed: 4, moveType: 0, priorityType: 1, stepAnime: false, through: false, trigger: 0, walkAnime: true
            }];
        }
        const name = spec.record === "enemy" ? ($dataEnemies[spec.id] || {}).name : ($dataActors[spec.id] || {}).name;
        return { id: eventId, name: name || "Unit", note: "", pages, x: options.x, y: options.y, rrUnit: spec, rrSpawned: true };
    };

    /** A unit leaves the fight; an event unit is erased unless `keep`. Removed units give no reward. */
    Game_Fight.prototype.removeUnit = function(unit, keep) {
        if (!unit || unit.gone) return;
        unit.gone = true;
        const character = unit.eventId ? $gameMap.event(unit.eventId) : null;
        if (character && !keep) {
            character.erase();
            // Off the map with it, and still off it when the map is read again under this battle (`eraseFallen`).
            unit.erased = true;
        }
        this.syncTroop();
        this.checkOutcome();
    };

    //-------------------------------------------------------------------------
    // The frame loop. Scene_Map runs it through Game_Map.update; the menu,
    // another scene or a different map leave it waiting where it stood.

    Game_Fight.prototype.hookInterpreter = function() {
        if (!this._hookInterpreter) this._hookInterpreter = new Game_Interpreter();
        return this._hookInterpreter;
    };

    /**
     * Whether the battle waits: a message, choice or number input, an event
     * the map is running (an autorun, a touch or action trigger, a cutscene),
     * a hook page running, a transfer. Parallel events never hold it. The
     * interpreter that started the fight and waits for it does not count;
     * while it waits, events that need it (touch, action, autorun) start
     * after the fight, so a fight meant to be interrupted by them is started
     * with Start Battle on Map, which does not wait.
     */
    Game_Fight.prototype.isBusy = function() {
        if ($gameMessage.isBusy()) return true;
        // A battle page running, or queued behind it: they run one after another, and nothing else starts between them.
        if (this._hooks.length || (this._hookInterpreter && this._hookInterpreter.isRunning())) return true;
        const interpreter = $gameMap._interpreter;
        const waiting = !!this.waitingInterpreter();
        if (interpreter && interpreter.isRunning() && !waiting) return true;
        if (!waiting && F.anyEventStarting()) return true;
        if ($gamePlayer.isTransferring()) return true;
        if ($gameTemp.isCommonEventReserved && $gameTemp.isCommonEventReserved()) return true;
        return false;
    };

    /**
     * The interpreter of the map's running event that waits for this fight, however deep in the common events
     * it called (Battle Processing or Start Battle on Map inside a common event waits there, not in the event
     * that called it); null when the map's event does something else, or nothing.
     */
    Game_Fight.prototype.waitingInterpreter = function() {
        let interpreter = typeof $gameMap !== "undefined" && $gameMap ? $gameMap._interpreter : null;
        if (!interpreter || !interpreter.isRunning()) return null;
        for (let depth = 0; depth < 100 && interpreter._childInterpreter && interpreter._childInterpreter.isRunning(); depth++) interpreter = interpreter._childInterpreter;
        return interpreter._waitMode === "reactorFight" && interpreter._rrFightSerial === this._serial ? interpreter : null;
    };

    /** Whether an event of the map is about to start (no list is built to ask). */
    F.anyEventStarting = function() {
        const events = typeof $gameMap !== "undefined" && $gameMap ? $gameMap._events : null;
        if (!events) return false;
        for (let i = 1; i < events.length; i++) if (events[i] && events[i].isStarting()) return true;
        return false;
    };

    /** What the battle waits for, in words for the console; "" when nothing holds it. */
    Game_Fight.prototype.waitReason = function() {
        if ($gameMessage.isBusy()) return "a message";
        const hook = this._hookInterpreter;
        if (hook && hook.isRunning()) return hook.eventId() > 0 ? "the battle page of event " + hook.eventId() : "a common event";
        const interpreter = $gameMap._interpreter, waiting = !!this.waitingInterpreter();
        if (interpreter && interpreter.isRunning() && !waiting) return interpreter.eventId() > 0 ? "event " + interpreter.eventId() : "a common event on the map";
        if (!waiting && F.anyEventStarting()) return "an event about to start";
        if ($gamePlayer.isTransferring()) return "a transfer";
        if ($gameTemp.isCommonEventReserved && $gameTemp.isCommonEventReserved()) return "a reserved common event";
        if (F.isHeld()) return "a camera shot or an action sequence";
        return "";
    };

    // Frames in a row the battle has waited for something that shows nothing on screen.
    let stalled = 0;
    /** The battle waits this frame. A wait that goes on and on is named once in the console, so its cause can be found. */
    Game_Fight.prototype.noteWait = function() {
        if ($gameMessage.isBusy()) { stalled = 0; return; }
        if (++stalled === F.STALL_WARN) console.warn("ReactorFight: the battle has waited " + F.STALL_WARN + " frames for " + (this.waitReason() || "nothing it can name") + ".");
    };

    Game_Fight.prototype.update = function() {
        if (this._tail) this.updateTail();
        if (!this._active || !this.isHere()) return;
        this.updateBattle();
        // A battle the frame did not end: its notice has stood for one more frame.
        if (this._active) this.updateNotice();
    };

    /** One frame of a battle that is on this map: what fades, the pages it owes, its ending, else the phase it is in. */
    Game_Fight.prototype.updateBattle = function() {
        this.updateFading();
        this.updateHooks();
        // A page that took the party off the map has ended the battle from inside it.
        if (!this._active) return;
        if (this._ending) {
            this.updateEnding();
            return;
        }
        if (this.isBusy()) { this.noteWait(); return; }
        // A switch or a variable goal is met whenever an event says so, not only when a unit falls.
        const goal = this._options.objective;
        if (goal && (goal.type === "switch" || goal.type === "variable")) {
            this.checkOutcome();
            if (this._ending) return;
        }
        if (this._wait > 0) {
            this._wait--;
            return;
        }
        // An action already playing keeps its frames, and a unit already walking arrives.
        const stage = this._phase === "act" && this._act ? this._act.stage : "";
        if (stage !== "perform" && stage !== "walk" && stage !== "react" && F.isHeld()) { this.noteWait(); return; }
        stalled = 0;
        switch (this._phase) {
            case "start":
                this.fireHooks("battleStart", {});
                this._phase = "round";
                break;
            case "round":
                this.startRound();
                break;
            case "queue":
                this.nextInQueue();
                break;
            case "act":
                this.updateAct();
                break;
        }
    };

    Game_Fight.prototype.startRound = function() {
        this._turn++;
        this.syncTroop();
        this._queue = [];
        const order = unit => this.battler(unit).agi;
        if (this._turns === "initiative") {
            this._queue.push({ kind: "turnStart", team: "any" });
            this.units({ alive: true }).filter(unit => unit.team !== "neutral")
                .sort((a, b) => order(b) - order(a) || a.id - b.id)
                .forEach(unit => this._queue.push({ kind: "unit", unitId: unit.id }));
            this._queue.push({ kind: "turnEnd", team: "any" });
        } else {
            for (const team of ["ally", "enemy"]) {
                this._queue.push({ kind: "turnStart", team });
                this.units({ team, alive: true }).forEach(unit => this._queue.push({ kind: "unit", unitId: unit.id }));
                this._queue.push({ kind: "turnEnd", team });
            }
        }
        this._queue.push({ kind: "roundEnd" });
        this._phase = "queue";
        if (F.feed()) ReactorEvents.emit("mapBattleTurnStart", { turn: this._turn });
    };

    Game_Fight.prototype.nextInQueue = function() {
        const entry = this._queue.shift();
        if (!entry) {
            this._phase = "round";
            return;
        }
        if (entry.kind === "turnStart" || entry.kind === "turnEnd") {
            this.fireHooks(entry.kind, { turn: this._turn, team: entry.team });
        } else if (entry.kind === "unit") {
            const unit = this.unit(entry.unitId);
            if (this.isAlive(unit)) {
                this._act = { unitId: unit.id, steps: unit.move, stage: "move", targetId: 0 };
                this._phase = "act";
            }
        } else if (entry.kind === "roundEnd") {
            for (const unit of this.units({ alive: true })) {
                const battler = this.battler(unit);
                battler.onTurnEnd();
                if (battler.isDead()) this.defeat(unit);
            }
            // A battle nobody can move or land a blow in would never end; after a while it ends as an escape.
            this._idleRounds = this._progress ? 0 : (this._idleRounds || 0) + 1;
            this._progress = false;
            const surviving = this._options.objective && this._options.objective.type === "survive";
            if (!surviving && this._idleRounds >= F.IDLE_ROUNDS) {
                console.warn("ReactorFight: no unit could move or act for " + F.IDLE_ROUNDS + " rounds; the battle ends as an escape.");
                this.end(F.ESCAPE, true);
                return;
            }
            this.checkOutcome(true);
        }
    };

    //-------------------------------------------------------------------------
    // A unit's turn: walk toward the nearest opponent, then act on one beside
    // it. Phase 2 replaces this with ranges, the player's own choices and AI.

    Game_Fight.prototype.distance = function(a, b) {
        return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    };

    /**
     * How far a character's body reaches from its cell, in tiles: a 3D model
     * blocks the cells its body covers (Reactor3D.eventModelFootprint), so a
     * big one is struck from beside its body, not its middle. Half a tile
     * for a character on one cell. With `toward` (a character, or anything
     * with x and y) it is the body's reach that way: a long body's flank is
     * nearer its middle than its ends are, and a standing figure (taller than
     * it is long or wide) is half a tile whatever its arms span. Without it,
     * the furthest the body reaches any way.
     */
    Game_Fight.prototype.bodyRadius = function(character, toward) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        if (!R || !R.eventModelFootprint || !R.characterModelSpec || !R.shouldRender3D || typeof $dataMap === "undefined" || !R.shouldRender3D($dataMap)) return 0.5;
        try {
            const spec = R.characterModelSpec(character);
            if (!spec) return 0.5;
            const foot = R.eventModelFootprint(character, spec);
            const halfX = foot.rawX != null ? foot.rawX : foot.halfX, halfZ = foot.rawZ != null ? foot.rawZ : foot.halfZ;
            const longest = Math.max(0.5, halfX, halfZ);
            if (!toward) return longest;
            if (R.characterHeightTiles && R.characterHeightTiles(character) > 1.6 * Math.max(halfX, halfZ)) return 0.5;
            const dx = toward.x - character.x, dy = toward.y - character.y, length = Math.hypot(dx, dy);
            if (!(length > 0)) return longest;
            // The way there in the footprint's own frame, and where it leaves the footprint.
            const yaw = foot.rawX != null ? foot.yaw || 0 : 0, cos = Math.cos(yaw), sin = Math.sin(yaw);
            const lx = Math.abs(dx * cos - dy * sin) / length, lz = Math.abs(dx * sin + dy * cos) / length;
            return Math.max(0.5, Math.min(lx > 1e-6 ? halfX / lx : Infinity, lz > 1e-6 ? halfZ / lz : Infinity));
        } catch (error) {
            return 0.5;
        }
    };

    /** Whether two units' bodies are close enough to strike. */
    Game_Fight.prototype.inReach = function(a, b) {
        return this.distance(a, b) <= Math.max(1, Math.round(this.bodyRadius(a) + this.bodyRadius(b)));
    };

    Game_Fight.prototype.nearestOpponent = function(unit) {
        const character = this.character(unit);
        let best = null, bestDistance = Infinity;
        for (const other of this.units({ team: F.oppose(unit.team), alive: true })) {
            const d = this.distance(character, this.character(other));
            if (d < bestDistance) { best = other; bestDistance = d; }
        }
        return best;
    };

    Game_Fight.prototype.updateAct = function() {
        const act = this._act;
        const unit = act && this.unit(act.unitId);
        const character = this.character(unit);
        if (!unit || !this.isAlive(unit) || !character) {
            this.finishAct();
            return;
        }
        if (character.isMoving()) return;
        if (act.stage === "move") {
            this.checkEnterHooks(unit, character);
            if (this._hooks.length || this.isBusy()) return;
            const target = this.nearestOpponent(unit);
            if (!target) { this.finishAct(); return; }
            const targetCharacter = this.character(target);
            if (this.inReach(character, targetCharacter) || act.steps <= 0) {
                act.stage = "action";
                act.targetId = target.id;
                return;
            }
            const direction = character.findDirectionTo(targetCharacter.x, targetCharacter.y);
            const nx = $gameMap.roundXWithDirection(character.x, direction);
            const ny = $gameMap.roundYWithDirection(character.y, direction);
            if (direction > 0 && character.canPass(character.x, character.y, direction) && !this.unitAt(nx, ny, unit)) {
                character.moveStraight(direction);
                act.steps--;
                this._progress = true;
            } else {
                act.stage = "action";
                act.targetId = target.id;
            }
            return;
        }
        if (act.stage === "action") {
            this.startAction(unit, character);
            return;
        }
        if (act.stage === "perform") {
            if (this.updateRun()) return;
            this.finishAct();
        }
    };

    Game_Fight.prototype.finishAct = function() {
        const unit = this._act && this.unit(this._act.unitId);
        const battler = unit && this.battler(unit);
        if (battler && battler.isAlive()) battler.onAllActionsEnd();
        this._act = null;
        if (this._run) this.endStage(this._run, true);
        this._run = null;
        this._wait = 8;
        this._phase = "queue";
        this.checkOutcome();
    };

    /** What a battler does: an enemy by its action patterns, an actor by its skills; the attack otherwise. */
    Game_Fight.prototype.chooseAction = function(battler) {
        const action = new Game_Action(battler);
        let skill = null;
        if (battler.isEnemy()) {
            const list = battler.enemy().actions.filter(a => battler.isActionValid(a));
            if (list.length) {
                const ratingMax = Math.max(...list.map(a => a.rating));
                const ratingZero = ratingMax - 3;
                const chosen = battler.selectAction(list.filter(a => a.rating > ratingZero), ratingZero);
                skill = chosen ? $dataSkills[chosen.skillId] : null;
            }
        } else {
            const usable = battler.usableSkills().filter(s => s.id !== battler.attackSkillId() && s.damage && s.damage.type === 1);
            if (usable.length && Math.random() < 0.3) skill = usable[Math.floor(Math.random() * usable.length)];
        }
        if (skill && battler.canUse(skill)) action.setSkill(skill.id);
        else action.setAttack();
        return action;
    };

    /** The units an action lands on, from the one beside the actor: friends for a friendly skill, an area for "all". */
    Game_Fight.prototype.actionTargets = function(unit, action, target) {
        if (action.isForUser()) return [unit];
        if (action.isForFriend()) {
            const character = this.character(unit);
            const friends = this.units({ team: unit.team, alive: true }).filter(f => this.distance(character, this.character(f)) <= 2);
            if (action.isForAll()) return friends;
            friends.sort((a, b) => this.battler(a).hpRate() - this.battler(b).hpRate());
            return friends.slice(0, 1);
        }
        if (action.isForAll()) {
            const centre = this.character(target);
            return this.units({ team: target.team, alive: true }).filter(o => this.distance(centre, this.character(o)) <= 2);
        }
        return [target];
    };

    Game_Fight.prototype.startAction = function(unit, character) {
        const target = this.unit(this._act.targetId);
        const targetCharacter = this.character(target);
        if (!target || !this.isAlive(target) || !targetCharacter || !this.inReach(character, targetCharacter)) {
            this.finishAct();
            return;
        }
        const battler = this.battler(unit);
        const action = this.chooseAction(battler);
        if (!action.item() || !battler.canUse(action.item())) {
            this.finishAct();
            return;
        }
        character.turnTowardCharacter(targetCharacter);
        const targets = this.actionTargets(unit, action, target);
        battler.useItem(action.item());
        this._progress = true;
        this._run = F.makeRun(this, unit, action, targets);
        this._act.stage = "perform";
    };

    //-------------------------------------------------------------------------
    // Playing an action: its Action Sequence (Skill / Item › Weapon › Class ›
    // Actor / Enemy) cue by cue, the hit landing where the sequence lands it.
    // The run is plain data so a save mid-swing reloads; the sequence is
    // resolved again from the records.

    F.makeRun = function(fight, unit, action, targets, via) {
        const item = action.item();
        const run = {
            subjectId: unit.id,
            targetIds: targets.map(t => t.id),
            kind: DataManager.isSkill(item) ? "skill" : "item",
            itemId: item.id,
            attack: action.isAttack(),
            frame: 0,
            applied: false
        };
        // Whose it is when it is not the unit's own: "vehicle", the one it rides (`actingBattler`).
        if (via) run.via = via;
        return run;
    };

    /**
     * The battler an action of a unit's is made with: its own, or with `via` "vehicle" the battler of the vehicle
     * it rides (its weapon, its skills, its strength), where it rides one that has a battler.
     */
    Game_Fight.prototype.actingBattler = function(unit, via) {
        const own = this.battler(unit);
        if (via !== "vehicle" || typeof F.mountBattler !== "function") return own;
        return F.mountBattler(unit) || own;
    };

    Game_Fight.prototype.runAction = function(run) {
        const battler = this.actingBattler(this.unit(run.subjectId), run.via);
        if (!battler) return null;
        const action = new Game_Action(battler);
        if (run.kind === "skill") action.setSkill(run.itemId); else action.setItem(run.itemId);
        return action;
    };

    /** The resolved sequence's cues, by start frame; null when there is none to play. */
    Game_Fight.prototype.runCues = function(run, action) {
        if (run._cues !== undefined) return run._cues;
        let cues = null;
        const P = root.ReactorBattlePresentation, B = root.ReactorBattleData;
        try {
            const sequence = P && P.sequence && P.state === "ready" ? P.sequence(action.subject(), action) : null;
            if (sequence && B && B.timeline) {
                cues = B.timeline(sequence).map(cue => ({ start: Math.round(cue.start), step: cue.step, total: Math.round(cue.total) }));
            }
        } catch (error) {
            cues = null;
        }
        Object.defineProperty(run, "_cues", { value: cues, enumerable: false, writable: true });
        return cues;
    };

    /**
     * The run's action, subject and targets, made once per run (and again after a load) and kept off the
     * save: the same Game_Action plays and lands the blow, and the Action Sequence stage reads this.
     */
    Game_Fight.prototype.runContext = function(run) {
        let ctx = run._ctx;
        if (!ctx) {
            const subject = this.unit(run.subjectId);
            const action = this.runAction(run);
            if (!subject || !action) return null;
            const targets = run.targetIds.map(id => this.unit(id)).filter(t => t && !t.gone);
            ctx = {
                fight: this, run, action, subject, character: this.character(subject), targets,
                targetCharacters: targets.map(t => this.character(t)).filter(Boolean), cell: run.cell || null, frame: run.frame
            };
            Object.defineProperty(run, "_ctx", { value: ctx, enumerable: false, writable: true });
        }
        // An enemy's action finds its subject by its place in the troop, which moves up when a unit before it
        // leaves the battle (Remove Unit) while the action plays.
        const battler = ctx.subject.enemy;
        if (battler && battler.index() >= 0 && ctx.action.subject() !== battler) ctx.action.setSubject(battler);
        ctx.frame = run.frame;
        return ctx;
    };

    /** Tells the stage a run is over (`interrupted`: cut short); once per staged run. */
    Game_Fight.prototype.endStage = function(run, interrupted) {
        if (!run || !run._staged) return;
        run._staged = false;
        const S = F.Stage;
        try { if (S && S.end) S.end(run, run._ctx, !!interrupted); } catch (error) { /* a stage that throws is ignored */ }
    };

    /** Advances the run a frame; false when it has ended. */
    Game_Fight.prototype.updateRun = function() {
        const run = this._run;
        if (!run) return false;
        const ctx = this.runContext(run);
        if (!ctx || !this.isAlive(ctx.subject)) {
            this.endStage(run, true);
            return false;
        }
        const action = ctx.action, character = ctx.character, targets = ctx.targets;
        // A quick run (a crowded battle's own units, `run.quick`): the motion, the animation and the result, in a quarter of a second.
        if (run.quick) {
            if (run.frame === 0) {
                this.playMotion(character, action.isMagical() ? "cast" : "attack");
                this.playAnimation(action, targets);
            } else if (run.frame === 6) {
                this.applyRun(run, action, targets);
            }
            run.frame++;
            if (run.frame <= 14) return true;
            if (!run.applied) this.applyRun(run, action, targets);
            return false;
        }
        // The Action Sequence stage plays the whole run where it is installed and has a sequence for it
        // (its own defaults included); it counts the frames and calls applyRun where the sequence lands the blow.
        const S = F.Stage;
        if (S && run._staged === undefined) {
            let staged = false;
            try { staged = !!S.begin(run, ctx); } catch (error) { staged = false; }
            Object.defineProperty(run, "_staged", { value: staged, enumerable: false, writable: true });
        }
        if (run._staged) {
            let more = false;
            try { more = !!S.update(ctx); } catch (error) { more = false; }
            if (more) return true;
            this.endStage(run, false);
            if (!run.applied) this.applyRun(run, action, targets);
            return false;
        }
        const cues = this.runCues(run, action);
        const total = cues ? Math.min(600, Math.max(1, cues.length ? cues[0].total : 1)) : 40;
        if (cues) {
            for (const cue of cues) if (cue.start === run.frame) this.playCue(cue.step, run, action, character, targets);
        } else if (run.frame === 0) {
            this.playMotion(character, action.isMagical() ? "cast" : "attack");
            this.playAnimation(action, targets);
        } else if (run.frame === 18) {
            this.applyRun(run, action, targets);
        }
        run.frame++;
        if (run.frame <= total) return true;
        // A sequence that never landed its blow lands it as it ends.
        if (!run.applied) this.applyRun(run, action, targets);
        return false;
    };

    Game_Fight.prototype.playCue = function(step, run, action, character, targets) {
        switch (step.type) {
            case "motion":
                this.playMotion(character, step.motion);
                break;
            case "animation":
                this.playAnimation(action, step.target === "user" ? [this.unit(run.subjectId)] : targets, step.animationId);
                break;
            case "sound":
                if (step.se && step.se.name && typeof AudioManager !== "undefined") AudioManager.playSe(step.se);
                break;
            case "weapon":
                F.heldItem(character, step.visible === false ? "hide" : step.mode === "move" ? "move" : "show",
                    Object.assign({}, step, { battler: action.subject(), item: action.item(), targetCharacter: targets.length ? this.character(targets[0]) : null }));
                break;
            case "impact":
            case "action":
                this.applyRun(run, action, targets);
                break;
        }
    };

    /** A model's motion rule of that name, where the character is a 3D model with one. */
    Game_Fight.prototype.playMotion = function(character, motion) {
        if (!motion || !character || typeof Reactor3D === "undefined" || !Reactor3D.playModelAnimation) return;
        if (!Reactor3D.characterModelSpec || !Reactor3D.characterModelSpec(character)) return;
        try {
            Reactor3D.playModelAnimation(character, motion);
        } catch (error) {
            // A model without that rule simply keeps its pose.
        }
    };

    Game_Fight.prototype.playAnimation = function(action, targets, id) {
        let animationId = Number(id) > 0 ? Number(id) : action.item().animationId;
        if (animationId < 0) {
            const subject = action.subject();
            animationId = subject && subject.isActor() ? subject.attackAnimationId1() : 1;
        }
        const characters = targets.map(t => this.character(t)).filter(Boolean);
        if (animationId > 0 && characters.length && $dataAnimations[animationId]) $gameTemp.requestAnimation(characters, animationId);
        else if (action.subject() && action.subject().isEnemy() && typeof SoundManager !== "undefined") SoundManager.playEnemyAttack();
    };

    /**
     * Lands `count` hits of the action on each target and shows them: the result, one popup with what the
     * hits took together, the fightImpact report (`hit` the first of these hits, from 1; `hits` the action's
     * total), a defeat. A fallen target takes the first hit of an action only (a revival), never a later one.
     */
    Game_Fight.prototype.landHits = function(run, action, targets, count, first, total) {
        const hit = [];
        // The stock action lands damage only on a party in battle (Game_Action.testApply); for the
        // instant it applies, this party is.
        const inBattle = $gameParty._inBattle;
        $gameParty._inBattle = true;
        try {
            for (const target of targets) {
                const battler = this.battler(target);
                if (!battler || target.gone || (first > 1 && battler.isDead())) continue;
                // Where the blow comes from (a tactical battle's flank, cover and height); null elsewhere.
                F._strike = this.strikeFor ? this.strikeFor(run, action, target) : null;
                let sum = 0, landed = false, done = 0;
                try {
                    for (let i = 0; i < count && (i === 0 || battler.isAlive()); i++) {
                        action.apply(battler);
                        sum += battler.result().hpDamage;
                        landed = landed || battler.result().isHit();
                        done++;
                    }
                } finally {
                    F._strike = null;
                }
                if (done > 1) {
                    // One number over the unit: everything these hits took together.
                    const result = battler.result();
                    result.hpDamage = sum;
                    if (landed) { result.missed = false; result.evaded = false; result.hpAffected = result.hpAffected || sum !== 0; }
                }
                hit.push([target, battler]);
            }
        } finally {
            $gameParty._inBattle = inBattle;
        }
        for (const [target, battler] of hit) {
            this.popup(target, battler);
            const dead = battler.isDead();
            // A revival landed on one who joined already down.
            if (!dead && target.down) target.down = false;
            if (F.feed()) {
                const result = battler.result();
                ReactorEvents.emit("fightImpact", { unitId: run.subjectId, targetId: target.id, damage: result.hpDamage, critical: !!result.critical,
                    missed: !!result.missed, evaded: !!result.evaded, defeated: dead, heal: result.hpDamage < 0, hit: first, hits: total, overwatch: !!run.overwatch });
            }
            if (dead) { target.struck = this.blowFrom(run, action, target); this.defeat(target); }
        }
        if (this.afterHit) this.afterHit(run, targets);
    };

    /** How many times the run's action lands: what the stage counted (`run.hitTotal`), else the skill's Repeats and the battler's Attack Times+. */
    Game_Fight.prototype.hitTotal = function(run, action) {
        return Math.max(1, Math.floor(run.hitTotal || action.numRepeats()) || 1);
    };

    /** One hit of the run's action, where an Action Sequence lands it; `run.hits` counts them. */
    Game_Fight.prototype.applyHit = function(run, action, targets) {
        const index = (run.hits || 0) + 1;
        this.landHits(run, action, targets, 1, index, this.hitTotal(run, action));
        run.hits = index;
    };

    /** The action is done landing: its global effects (a common event), once. */
    Game_Fight.prototype.finishHits = function(run, action) {
        if (run.applied) return;
        run.applied = true;
        const inBattle = $gameParty._inBattle;
        $gameParty._inBattle = true;
        try {
            action.applyGlobal();
        } finally {
            $gameParty._inBattle = inBattle;
        }
    };

    /** Lands whatever of the action has not landed yet (all of it, when no hit was landed one by one), then finishes it. */
    Game_Fight.prototype.applyRun = function(run, action, targets) {
        if (run.applied) return;
        const total = Math.max(1, Math.floor(action.numRepeats()) || 1);
        const left = run.hits ? total - run.hits : total;
        if (left > 0) {
            this.landHits(run, action, targets, left, (run.hits || 0) + 1, this.hitTotal(run, action));
            run.hits = (run.hits || 0) + left;
        }
        this.finishHits(run, action);
    };

    Game_Fight.prototype.popup = function(unit, battler) {
        const character = this.character(unit);
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null;
        if (character && scene && scene._spriteset && scene._spriteset.rrFightPopup) scene._spriteset.rrFightPopup(character, battler);
    };

    //-------------------------------------------------------------------------
    // The words a battle shows, its goal as text, and the notice it puts on a
    // HUD's banner: the same in every mode.

    /** The words a battle shows, a project's own (System.json `reactorBattle.terms`) over the stock ones. */
    F.term = function(key) {
        const own = F.systemSettings().terms;
        return (own && typeof own[key] === "string" && own[key]) || F.TERMS[key] || "";
    };
    F.TERMS = {
        wait: "Wait", endTurn: "End Turn", auto: "Auto", overwatch: "Overwatch",
        // A unit and a vehicle: getting on one beside it, and getting off.
        mount: "Mount", dismount: "Dismount", whyNoRoom: "No room to get off here",
        // The goal in full (the battle menu, a change of goal), and as the HUD's line counts it down.
        goalDefeatAll: "Defeat all enemies", goalSurvive: "Survive %1 turns", goalDefeatUnit: "Defeat %1", goal: "Complete the objective",
        goalEnemiesLeft: "Enemies left: %1", goalSurviveLeft: "Survive: %1 turns left", goalSurviveLast: "Survive: last turn", goalChanged: "New goal: %1",
        goalLose: "You lose if your party falls", goalTurn: "Turn %1",
        // The battle menu, its pages and its questions (a line break in a question starts its second line). The row
        // for what every enemy reaches is named for what choosing it does.
        menuResume: "Resume", menuUnits: "Units", menuGoal: "Goal", menuControls: "Controls", menuOptions: "Options", menuRetreat: "Retreat", menuBack: "Back",
        menuThreatShow: "Show enemy reach", menuThreatHide: "Hide enemy reach",
        menuPace: "Enemy turn speed", paceNormal: "Normal", paceFast: "Fast", paceSkip: "Skip to my turn", menuHints: "Control hints", on: "On", off: "Off",
        menuGameOptions: "Game options", unitDone: "Done", unitWatch: "On watch",
        endTurnAsk: "%1 units have not acted.\nEnd the turn?", endTurnAskOne: "1 unit has not acted.\nEnd the turn?", endTurnYes: "End the turn", endTurnNo: "Keep playing",
        retreatAsk: "Leave the battle?", retreatYes: "Retreat", retreatNo: "Stay and fight",
        autoAsk: "Your units act by themselves\nfor the rest of this turn?", autoYes: "Let them act", autoNo: "Keep playing",
        // The hint line's tips: %1 and %2 are the names of the keys or buttons in force. Short: a 640 pixel screen
        // has room for about 34 letters.
        tipPick: "Choose a unit: %1", tipNext: "%1: next unit", tipMenu: "%1: battle menu", tipTurn: "%1 %2: turn the view", tipZoom: "Mouse wheel: zoom",
        tipAuto: "Battle menu: Auto plays the turn",
        tipMove: "Where to move: %1", tipStay: "%1 on its own tile: stay", tipBack: "%1: back", tipUnit: "%1: back to the unit", tipLevel: "%1: the tile's next level",
        tipThreat: "%1: show enemy reach",
        tipFace: "%1 %2: turn the unit", tipUndo: "%1: undo the move", tipWait: "Wait ends this unit's turn",
        tipTarget: "Choose a target: %1", tipNextTarget: "%1: next target", tipHurry: "Hold %1 to hurry",
        orClick: "%1 or click", orRightClick: "%1 or right-click",
        // Why a command is grayed (commandReason): a HUD writes these words unless its own node has others.
        whyNoReach: "Nobody in reach",
        // The Controls page.
        ctlOk: "Choose, confirm", ctlCancel: "Back, battle menu", ctlCursor: "Move the cursor", ctlNext: "Next unit or target",
        ctlHurry: "Hurry the other side", ctlView: "Turn the view", ctlZoom: "Zoom", ctlUnit: "Back to the unit", ctlLevel: "A tile's next level", ctlFace: "Turn the unit",
        ctlThreat: "Every enemy's reach",
        keyArrows: "Arrow keys", keyPad: "D-pad", keyWheel: "Mouse wheel", keyHold: "%1 (hold)", keyClick: "Click", keyRightClick: "Right-click"
    };

    /** The battle's words for a key, as a HUD asks for them: the reason it gave for a grayed command (`commandReason`). */
    Game_Fight.prototype.term = function(key) {
        return F.term(key);
    };

    /** The goal in full: what the battle menu's Goal page and a change of goal say. */
    Game_Fight.prototype.goalText = function() {
        if (!this._active) return "";
        const goal = this._options.objective || { type: "defeatAll" };
        if (goal.type === "survive") return F.term("goalSurvive").replace("%1", goal.turns);
        if (goal.type === "defeatUnit") {
            const unit = this._units.find(u => u.eventId === goal.eventId), battler = this.battler(unit);
            return F.term("goalDefeatUnit").replace("%1", battler ? battler.name() : "");
        }
        return goal.type === "defeatAll" ? F.term("goalDefeatAll") : F.term("goal");
    };

    /** The goal as a HUD's line shows it: what is left of it where that can be counted (enemies standing, turns to hold). */
    Game_Fight.prototype.objectiveText = function() {
        if (!this._active) return "";
        const goal = this._options.objective || { type: "defeatAll" };
        if (goal.type === "survive") {
            // Won as round `goal.turns` ends: the turn being played is one of those left.
            const left = goal.turns - Math.max(1, this._turn) + 1;
            return left > 1 ? F.term("goalSurviveLeft").replace("%1", left) : F.term("goalSurviveLast");
        }
        if (goal.type === "defeatAll") {
            let left = 0;
            for (const unit of this._units) if (unit.team === "enemy" && !unit.gone && this.isAlive(unit)) left++;
            return F.term("goalEnemiesLeft").replace("%1", left);
        }
        return this.goalText();
    };

    // How long a notice stands for a HUD's banner, in frames of the battle.
    F.NOTICE_FRAMES = 150;

    /** A line for the HUD's banner (where the phase is announced), in any mode: it stands for F.NOTICE_FRAMES, then is gone. */
    Game_Fight.prototype.announce = function(text) {
        this._notice = { text: String(text || ""), frames: F.NOTICE_FRAMES };
        // A HUD that draws on the battle's revision is told (the Tactical driver's `touch`).
        if (this.touch) this.touch();
    };

    /** The notice to show now (a goal that changed), or "" when there is none. */
    Game_Fight.prototype.notice = function() {
        const notice = this._active ? this._notice : null;
        return notice && notice.frames > 0 ? notice.text : "";
    };

    /** One frame of the notice: counted with the battle's own frames, whatever the battle did in this one. */
    Game_Fight.prototype.updateNotice = function() {
        const notice = this._notice;
        if (notice && notice.frames > 0 && --notice.frames === 0 && this.touch) this.touch();
    };

    //-------------------------------------------------------------------------
    // Defeat, outcomes and the end of the fight.

    Game_Fight.prototype.defeat = function(unit) {
        if (!unit || unit.defeated || unit.gone) return;
        unit.defeated = true;
        const character = this.character(unit);
        // It goes over away from the blow that felled it (`landHits` says where that came from), else onto its back.
        const yaw = unit.vehicle ? null : F.fallYaw(unit.struck, character);
        delete unit.struck;
        if (character && !unit.vehicle) character._reactorFallYaw = yaw;
        // A vehicle is wrecked where it stands: whoever rides it is put off it (reactor_vehicles_mount.js).
        if (unit.vehicle) { if (typeof this.wreckVehicle === "function") this.wreckVehicle(unit); }
        // It falls and lies: one of the party until it is brought back, an event's unit as its Collapse Effect says.
        else if (unit.eventId && character) this.fell(unit, character);
        else if (character) { character.setOpacity(110); character._reactorFall = 1; }
        if (unit.enemy) F.collapseSound(this.battler(unit));
        // (A battle page's "unit defeated" is asked about the battle's units, not about what they ride.)
        if (!unit.vehicle) this.fireHooks("unitDefeated", { unit });
        if (F.feed()) ReactorEvents.emit("unitDefeated", { unitId: unit.id, eventId: unit.eventId, team: unit.team, battler: this.battler(unit) });
    };

    /**
     * Where the blow that lands on `target` comes from: the middle of a blast (a circle, square or cross, for
     * whoever is not standing on it), else where the one who struck stands. Null when nobody did.
     */
    Game_Fight.prototype.blowFrom = function(run, action, target) {
        const to = this.character(target);
        if (!run || !to) return null;
        const cell = run.cell;
        if (cell && (cell.x !== to.x || cell.y !== to.y) && typeof F.tactics === "function") {
            const tactics = F.tactics(action.subject(), action.item()), shape = tactics && tactics.area ? tactics.area.shape : "";
            if (shape === "circle" || shape === "square" || shape === "cross") return { x: cell.x, y: cell.y };
        }
        const from = this.character(this.unit(run.subjectId));
        return from && from !== to ? { x: from._realX, y: from._realY } : null;
    };

    /**
     * The way a character struck from `from` goes over: the angle, on the map, of the line from the blow to it
     * (0 down the map, a quarter turn to the right of it), or null when the blow came from nowhere or from its own cell.
     */
    F.fallYaw = function(from, character) {
        if (!from || !character) return null;
        const dx = character._realX - from.x, dy = character._realY - from.y;
        return Math.hypot(dx, dy) < 0.01 ? null : Math.round(Math.atan2(dx, dy) * 1000) / 1000;
    };

    /** A character is on its feet again: nothing of a fall is left on it. */
    F.stand = function(character) {
        if (character._reactorFall) character._reactorFall = 0;
        if (character._reactorPosePitch) character._reactorPosePitch = 0;
        if (character._reactorFallYaw != null) character._reactorFallYaw = null;
    };

    // The Collapse Effects a battle on the map tells apart (the trait's stored values); every other is a look of
    // the same going, which the map has one of.
    F.COLLAPSE = { boss: 1, instant: 2, none: 3, corpse: 8 };

    /**
     * What a fallen unit that an event stands for leaves, by its battler's Collapse Effect: "body" (Corpse: it
     * falls and lies for the rest of the battle, and gets up if it is revived; so does anyone on the party's side
     * that an actor stands behind), "stand" (No Disappear: it stays as it stood), "gone" (Instant: it is not there
     * the next frame), or "fade" (every other: it falls, lies a moment and fades).
     */
    F.remainsOf = function(unit, battler) {
        if (unit.actorId && unit.team === "ally") return "body";
        const type = battler && typeof battler.collapseType === "function" ? battler.collapseType() : 0;
        return type === F.COLLAPSE.corpse ? "body" : type === F.COLLAPSE.none ? "stand" : type === F.COLLAPSE.instant ? "gone" : "fade";
    };

    /** The sound of an enemy going: its own if one is chosen for it, else the one its Collapse Effect has (Instant has none). */
    F.collapseSound = function(battler) {
        if (typeof SoundManager === "undefined") return;
        const type = battler && typeof battler.collapseType === "function" ? battler.collapseType() : 0;
        const stock = type === F.COLLAPSE.instant ? null
            : type === F.COLLAPSE.boss && SoundManager.playBossCollapse1 ? () => SoundManager.playBossCollapse1()
            : () => SoundManager.playEnemyCollapse();
        if (battler && typeof battler.playCollapseSe === "function") battler.playCollapseSe(stock);
        else if (stock) stock();
    };

    /** A unit an event stands for has fallen: what is left of it (`F.remainsOf`) is put on the way it goes. */
    Game_Fight.prototype.fell = function(unit, event) {
        const remains = F.remainsOf(unit, this.battler(unit));
        const fade = { eventId: unit.eventId, frames: F.DEFEAT_FADE, hold: F.DEFEAT_HOLD, rest: F.FALL_REST };
        if (remains === "gone") { fade.frames = 1; fade.hold = 0; fade.rest = 0; }
        if (remains === "stand") fade.rest = 0;
        if (remains === "body" || remains === "stand") {
            // It stays for the battle; one of the party's side stays to its very end, when it may get up (`settleFallen`).
            fade.stay = true;
            fade.ours = !!unit.actorId && unit.team === "ally";
            unit.body = remains === "body" ? "lie" : "stand";
            // (Which way it lies, for a map that is read again under the battle: `eraseFallen`.)
            if (event._reactorFallYaw != null) unit.fallYaw = event._reactorFallYaw;
        }
        // Whoever comes by walks over one that lies.
        if (unit.body === "lie") { unit.through = !!event.isThrough(); event.setThrough(true); }
        this._fading.push(fade);
    };

    /** Whether a fallen unit is still on its way out (one that stays for the battle is not, until the battle is decided). */
    Game_Fight.prototype.isFading = function() {
        return this._fading.some(fade => !fade.stay || (!!this._ending && !fade.ours));
    };

    /** A fallen unit is alive again: it is in the battle as it was, and what was left of it stands. */
    Game_Fight.prototype.raise = function(unit) {
        unit.defeated = false;
        if (unit.eventId) {
            this._fading = this._fading.filter(fade => fade.eventId !== unit.eventId);
            const event = $gameMap.event(unit.eventId);
            if (event) {
                F.stand(event);
                if (unit.through !== undefined) event.setThrough(!!unit.through);
            }
            delete unit.through;
            delete unit.body;
            delete unit.fallYaw;
        }
        const character = this.character(unit);
        if (character) character.setOpacity(255);
    };

    /**
     * The battle is over: a body whose battler is alive again stands (the party's side, got up by `reviveFallen`),
     * and whatever else was still on its way out is off the map as the ones that faded are.
     */
    Game_Fight.prototype.settleFallen = function() {
        if (!this.isHere()) { this._fading.length = 0; return; }
        for (const unit of this._units) {
            if (!unit.eventId || !unit.defeated || unit.gone) continue;
            const battler = this.battler(unit), event = $gameMap.event(unit.eventId);
            if (!event || event._erased) continue;
            if (battler && battler.isAlive()) { this.raise(unit); continue; }
            F.stand(event);
            event.erase();
        }
        this._fading.length = 0;
    };

    Game_Fight.prototype.updateFading = function() {
        // The party's fallen lie where they fell, and one brought back stands. Here rather than in the battle's own
        // frame, which stops when the outcome is decided: the last member to fall falls too.
        for (const unit of this._units) {
            if (!unit.party || unit.gone) continue;
            const character = this.character(unit);
            if (!character || !(character._reactorFall > 0 || character._reactorPosePitch > 0)) continue;
            const battler = this.battler(unit);
            if (battler && battler.isAlive()) { F.stand(character); character.setOpacity(255); }
            else if (character._reactorFall > 0) {
                character._reactorFall = Math.min(F.FALL_FRAMES + 1, character._reactorFall + 1);
                character._reactorPosePitch = F.fallPitch(character._reactorFall / F.FALL_FRAMES);
            }
        }
        // A fallen unit stays whole while a director's shot or a sequence is still on it (never longer than the hold).
        const held = this._fading.length > 0 && F.isHeld();
        for (const fade of this._fading) {
            const event = $gameMap.event(fade.eventId);
            if (!event) { fade.frames = 0; continue; }
            // It falls and lies a while before it fades, rather than vanishing where it stood.
            if (fade.rest > 0) {
                fade.rest--;
                event._reactorPosePitch = F.fallPitch((F.FALL_REST - fade.rest) / F.FALL_FRAMES);
                continue;
            }
            // A body, or one that does not disappear, is there for the battle; all but the party's own go as it is decided.
            if (fade.stay && !(this._ending && !fade.ours)) continue;
            if (held && fade.hold > 0) { fade.hold--; continue; }
            fade.frames--;
            event.setOpacity(Math.max(0, Math.round(255 * fade.frames / F.DEFEAT_FADE)));
            if (fade.frames <= 0) event.erase();
        }
        this._fading = this._fading.filter(fade => fade.frames > 0);
    };

    /**
     * The map of a battle that is still on was read again (the party is back on the map of a battle that was kept,
     * or a load read the map anew): every event stands on it as authored, and those of the units that fell in the
     * battle, or left it and the map, are taken off it again.
     */
    Game_Fight.prototype.eraseFallen = function() {
        const stays = [];
        for (const unit of this._units) {
            if (!unit.eventId || !(unit.defeated || unit.erased)) continue;
            const event = $gameMap.event(unit.eventId);
            // One that stays for the battle is put back as it was left: lying, or standing where it stood.
            if (event && unit.defeated && unit.body && !unit.erased) {
                if (unit.body === "lie") { event._reactorPosePitch = 1; event._reactorFallYaw = unit.fallYaw != null ? unit.fallYaw : null; event.setThrough(true); }
                stays.push({ eventId: unit.eventId, frames: F.DEFEAT_FADE, hold: 0, rest: 0, stay: true, ours: !!unit.actorId && unit.team === "ally" });
                continue;
            }
            if (event && !event._erased) event.erase();
        }
        this._fading = stays;
    };

    Game_Fight.prototype.checkOutcome = function(roundEnded) {
        if (!this._active || this._ending) return;
        // One who joined already down and has been revived since is in the battle like anyone: falling again is falling here.
        for (const unit of this._units) {
            if (!unit.down) continue;
            const battler = this.battler(unit);
            if (battler && battler.isAlive()) unit.down = false;
        }
        // The party in the battle: a member an event took out of the party since stands on the map as nobody, and is not counted.
        const party = this._units.filter(unit => unit.party && !unit.gone && this.character(unit));
        if (party.length && party.every(unit => this.battler(unit).isDead())) {
            this.end(F.LOSE);
            return;
        }
        const objective = this._options.objective || { type: "defeatAll" };
        if (objective.type === "survive") {
            if (roundEnded && this._turn >= objective.turns) this.end(F.WIN);
            return;
        }
        if (objective.type === "defeatUnit") {
            const target = this.unitOfEvent(objective.eventId) || this._units.find(unit => unit.eventId === objective.eventId);
            if (target && target.defeated) this.end(F.WIN);
            return;
        }
        if (objective.type === "switch") {
            if ($gameSwitches.value(objective.switchId)) this.end(F.WIN);
            return;
        }
        if (objective.type === "variable") {
            if ($gameVariables.value(objective.variableId) >= objective.value) this.end(F.WIN);
            return;
        }
        if (this.units({ team: "enemy", alive: true }).length) return;
        // The last enemy in the battle has fallen. One more look: an enemy the start rule takes now joins (`F.bringNear`,
        // reactor_fight_flow.js), and the battle goes on against it.
        if (F.bringNear && this.isHere() && F.bringNear(this, true) > 0 && this.units({ team: "enemy", alive: true }).length) return;
        this.end(F.WIN);
    };

    /** Ends the fight: WIN gives the rewards, LOSE the defeat (Game Over unless the battle can be lost), ESCAPE nothing. */
    Game_Fight.prototype.end = function(result, quiet) {
        if (!this._active || this._ending) return;
        if (result === F.LOSE && !this._options.canLose) quiet = false;
        this._ending = { result, shown: false, quiet: !!quiet };
    };

    // The ending whose results are being shown (F.showResults). Never part of a save: a game loaded while they
    // are up ends its battle by the message window alone.
    let resultsOf = null;

    Game_Fight.prototype.updateEnding = function() {
        const ending = this._ending;
        if (!ending.shown) {
            const fading = this.isFading();
            if (this.isBusy() || fading) { if (!fading) this.noteWait(); return; }
            ending.shown = true;
            if (!ending.quiet) {
                if (ending.result === F.WIN) {
                    AudioManager.playMe($gameSystem.victoryMe());
                    const enemies = this._units.filter(unit => unit.team === "enemy" && unit.enemy && !unit.gone).map(unit => unit.enemy);
                    resultsOf = ending;
                    F.showResults(this, F.makeRewards(enemies), () => { if (resultsOf === ending) resultsOf = null; });
                } else if (ending.result === F.LOSE) {
                    AudioManager.playMe($gameSystem.defeatMe());
                    $gameMessage.add(TextManager.defeat.format($gameParty.name()));
                } else if (ending.result === F.ESCAPE) {
                    $gameMessage.add(TextManager.escapeStart.format($gameParty.name()));
                }
            }
            return;
        }
        // The results are still being read.
        if (resultsOf === ending) return;
        // The result has been read: a page or a common event the battle still owes runs before it is over.
        if (this.isBusy()) { this.noteWait(); return; }
        this.finish();
    };

    /**
     * Whoever fell in this battle on the party's side gets up with 1 HP: the party's members and the allies that
     * events stand for. One who was already down when it joined (`down`) stays down: a battle is no free revival.
     */
    Game_Fight.prototype.reviveFallen = function() {
        for (const unit of this._units) {
            if (unit.gone || unit.down || unit.team !== "ally" || !unit.actorId) continue;
            const battler = this.battler(unit);
            if (battler && battler.isDead()) battler.setHp(1);
        }
        // The party's vehicles wrecked here are mended as far as its fallen are.
        if (typeof this.reviveVehicles === "function") this.reviveVehicles();
    };

    Game_Fight.prototype.finish = function() {
        const result = this._ending ? this._ending.result : F.ESCAPE;
        const lost = result === F.LOSE, canLose = this._options.canLose;
        if (this._run) this.endStage(this._run, true);
        // A battle that was won: those who fell in it get up, unless the game keeps them down (`reviveAfterBattle:
        // false`, as after a Classic battle). One that was lost and can be: they do too, and the stock rule then
        // revives the whole party. One that was left (an escape, a transfer, an event's quiet end) leaves the
        // fallen as they are, as leaving a Classic battle does.
        if (lost ? canLose : result === F.WIN && F.systemSettings().reviveAfterBattle !== false) this.reviveFallen();
        this.settleFallen();
        // What it leaves of its units, the party as the map has it, then what goes on round it; the battle is cleared there.
        this.finishUnits(result);
        this.restoreParty();
        this.finishAround(result);
        if (lost) {
            if (canLose) $gameParty.reviveBattleMembers();
            else SceneManager.goto(Scene_Gameover);
        }
    };

    /** The units as the battle leaves them: nobody holds a weapon, the party's battlers end their battle, and nobody keeps its look. */
    Game_Fight.prototype.finishUnits = function(result) {
        for (const unit of this._units) {
            const battler = this.battler(unit);
            const held = unit.gone || unit.team === "neutral" ? null : this.character(unit);
            if (held) F.heldItem(held, "drop", { battler });
            if (battler && !unit.enemy) battler.onBattleEnd();
            if (unit.party) {
                // Nobody keeps the look of the battle: not its dimness, not the pose it fell in.
                const character = this.character(unit);
                if (character) {
                    character.setOpacity(255);
                    F.stand(character);
                }
            }
        }
        const mapHeld = typeof Reactor3D !== "undefined" && Reactor3D ? Reactor3D.MapHeld : null;
        try { if (mapHeld && mapHeld.clear) mapHeld.clear(); } catch (error) { console.warn("ReactorFight: held items", error); }
    };

    /**
     * What goes on round a battle as it ends: the map's music comes back, the troop is emptied, the result is
     * kept for whoever asks (`resultOf`), the feed is told, and the battle is cleared. Fallen spawned units are
     * swept last: while the battle stands they are still its units.
     */
    Game_Fight.prototype.finishAround = function(result) {
        if (this._savedBgm) AudioManager.replayBgm(this._savedBgm);
        $gameTroop.clear();
        this._results[this._serial] = result;
        if (F.feed()) ReactorEvents.emit("mapBattleEnd", { serial: this._serial, result });
        // A battle page or common event that ended the battle from inside itself (it took the party to another
        // map) is not cut off: the rest of its commands still run (updateTail).
        if (this._hookInterpreter && this._hookInterpreter.isRunning()) this._tail = this._hookInterpreter;
        this.clear();
        stalled = 0;
        F.sweepSpawned();
    };

    //-------------------------------------------------------------------------
    // Hooks firing: queued pages run one after another on the fight's own
    // interpreter; the battle waits while one runs.

    Game_Fight.prototype.hookMatches = function(hook, type, info, event) {
        if (hook.on !== type) return false;
        if (type === "turnStart" || type === "turnEnd") {
            if (hook.turn && hook.turn !== info.turn) return false;
            return hook.team === "any" || info.team === "any" || hook.team === info.team;
        }
        if (type === "unitDefeated") {
            const unit = info.unit;
            if (hook.unit === "any") return true;
            if (hook.unit === "this") return unit.eventId === event.eventId();
            if (hook.unit === "ally" || hook.unit === "enemy") return unit.team === hook.unit;
            return unit.eventId === hook.unit;
        }
        if (type === "unitEnters") {
            if (hook.team !== "any" && info.unit.team !== hook.team) return false;
            return F.inArea(hook, info.x, info.y) && !(info.px !== null && F.inArea(hook, info.px, info.py));
        }
        return true;
    };

    F.inArea = function(hook, x, y) {
        if (hook.region) return $gameMap.regionId(x, y) === hook.region;
        return x >= hook.x0 && x <= hook.x1 && y >= hook.y0 && y <= hook.y1;
    };

    Game_Fight.prototype.fireHooks = function(type, info) {
        for (const event of $gameMap.events()) {
            if (!event || event._erased) continue;
            const pages = event.event().pages || [];
            pages.forEach((page, pageIndex) => {
                const hook = F.pageHook(page);
                if (!hook || !this.hookMatches(hook, type, info, event)) return;
                if (!F.meetsPageConditions(event, page)) return;
                this._hooks.push({ eventId: event.eventId(), pageIndex });
            });
        }
    };

    /**
     * The interpreter of a battle that ended while one of its own pages was still running (`_tail`, kept with
     * the save) runs that page to its end, beside whatever the map does, as a parallel event would.
     */
    Game_Fight.prototype.updateTail = function() {
        const tail = this._tail;
        if (tail.isRunning()) tail.update();
        if (!tail.isRunning()) this._tail = null;
    };

    Game_Fight.prototype.updateHooks = function() {
        const interpreter = this.hookInterpreter();
        if (!interpreter.isRunning() && !$gameMessage.isBusy()) {
            if (this._hooks.length) {
                const next = this._hooks.shift();
                const event = $gameMap.event(next.eventId);
                const page = event && event.event().pages[next.pageIndex];
                if (page) interpreter.setup(page.list, next.eventId);
            } else if ($gameTemp.isCommonEventReserved && $gameTemp.isCommonEventReserved() && this.waitingInterpreter()) {
                // A common event reserved during the battle (a skill's or an item's effect, a quest reward) is the
                // map's to run, and the map's event is waiting for this battle: it runs here, or neither would move again.
                const commonEvent = $gameTemp.retrieveCommonEvent();
                if (commonEvent && commonEvent.list) interpreter.setup(commonEvent.list, 0);
            }
        }
        if (interpreter.isRunning()) interpreter.update();
    };

    /** A unit that has just stepped into a hook's area from outside it. */
    Game_Fight.prototype.checkEnterHooks = function(unit, character) {
        const key = String(unit.id);
        const from = this._inside[key];
        if (from && from[0] === character.x && from[1] === character.y) return;
        this._inside[key] = [character.x, character.y];
        this.fireHooks("unitEnters", { unit, x: character.x, y: character.y, px: from ? from[0] : null, py: from ? from[1] : null });
    };

    //-------------------------------------------------------------------------
    // The runtime events feed, for plugins (docs/RUNTIME-EVENTS.md).

    F.feed = () => typeof ReactorEvents !== "undefined" && !!ReactorEvents.emit;

    //-------------------------------------------------------------------------
    // Engine hooks.

    const unhookedMeetsConditions = Game_Event.prototype.meetsConditions;
    F.meetsPageConditions = function(event, page) {
        return unhookedMeetsConditions.call(event, page);
    };

    // A hook page runs when its battle condition fires; it is never the page an event shows.
    Game_Event.prototype.meetsConditions = function(page) {
        if (F.pageHook(page)) return false;
        return unhookedMeetsConditions.call(this, page);
    };

    // Units walk where the battle sends them, not on their own. In a Tactical battle a unit standing outside the
    // battle stands still too (`_rrStandsBy`: marked on the beat by who looks for units to bring in, F.bringNear);
    // in the other modes it carries on as the map has it.
    const updateSelfMovement = Game_Event.prototype.updateSelfMovement;
    Game_Event.prototype.updateSelfMovement = function() {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (fight && fight.isHere()) {
            if (fight._mode === "tactical" && this._rrStandsBy > 0 && this._rrStandsBy === F.standsByMark) return;
            if (fight.unitOfEvent(this.eventId())) return;
        }
        updateSelfMovement.call(this);
    };

    // Followers walk on their own during a fight instead of trailing the leader, and on the walk back after it
    // each makes for its own place: a step taken with every step of the leader's would never close the gap.
    const updateFollowersMove = Game_Followers.prototype.updateMove;
    Game_Followers.prototype.updateMove = function() {
        if (this._rrRegroup || (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere())) return;
        updateFollowersMove.call(this);
    };
    // Nor do they jump to the leader when it hops a ledge or climbs: each is a unit on its own cell.
    const jumpAllFollowers = Game_Followers.prototype.jumpAll;
    Game_Followers.prototype.jumpAll = function() {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere()) return;
        jumpAllFollowers.call(this);
    };
    // Nor are they brought to the leader's cell when the leader is put somewhere on the battle's own map (a
    // battle page moving the player): they would all stand inside each other. Arriving on the battle's map from
    // another one they are, as after any transfer.
    let arriving = false;
    const synchronizeFollowers = Game_Followers.prototype.synchronize;
    Game_Followers.prototype.synchronize = function(x, y, d) {
        if (!arriving && typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere()) return;
        synchronizeFollowers.call(this, x, y, d);
    };
    const performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        arriving = this.isTransferring() && this.newMapId() !== $gameMap.mapId();
        const fight = typeof $gameFight !== "undefined" && $gameFight && $gameFight._active ? $gameFight : null;
        const here = !!fight && fight.isHere();
        try {
            performTransfer.call(this);
        } finally {
            arriving = false;
        }
        // The party left the map of a battle that is kept, or is back on it.
        if (fight && fight._active && fight.isHere() !== here) fight.partyAway(here);
    };
    // Nor can they be gathered: they would never arrive (they do not trail), and an event that waits for the
    // gather (a battle page, a common event) would hold the battle for good.
    const gatherFollowers = Game_Followers.prototype.gather;
    Game_Followers.prototype.gather = function() {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere()) return;
        gatherFollowers.call(this);
    };
    // The walk back to the leader after a battle.
    const updateFollowers = Game_Followers.prototype.update;
    Game_Followers.prototype.update = function() {
        if (this._rrRegroup) F.updateRegroup(this);
        updateFollowers.call(this);
    };
    // In a battle a follower is a unit of its own: it keeps its own dimness (a fallen one stays dim, and a
    // fallen leader does not dim the rest) where a follower on the map takes the leader's. One put beside the
    // leader after a battle fades in.
    const updateFollower = Game_Follower.prototype.update;
    Game_Follower.prototype.update = function() {
        const own = typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere() ? this._opacity : -1;
        updateFollower.call(this);
        if (own >= 0) this._opacity = own;
        else if (this._rrFade > 0) {
            this._rrFade--;
            this.setOpacity(Math.round(this.opacity() * (1 - this._rrFade / F.REGROUP_FADE)));
        }
    };

    // The battle moves the party; the player's keys do not, and no encounter starts.
    const canMove = Game_Player.prototype.canMove;
    Game_Player.prototype.canMove = function() {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere()) return false;
        return canMove.call(this);
    };
    const canEncounter = Game_Player.prototype.canEncounter;
    Game_Player.prototype.canEncounter = function() {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isActive()) return false;
        return canEncounter.call(this);
    };

    /** Runs `call` with the party's next random troop fixed to `troopId`: the stock code rolls for a troop again, and gets the one whose mode was read. */
    const withTroop = function(player, troopId, call) {
        const own = Object.prototype.hasOwnProperty.call(player, "makeEncounterTroopId"), kept = player.makeEncounterTroopId;
        player.makeEncounterTroopId = () => troopId;
        try {
            return call();
        } finally {
            if (own) player.makeEncounterTroopId = kept; else delete player.makeEncounterTroopId;
        }
    };

    // A random encounter on a map whose mode is on the map starts the fight there: against its troop, placed round
    // the party, and the units the start rule takes. Where it opens the battle screen it is the next battle.
    const executeEncounter = Game_Player.prototype.executeEncounter;
    Game_Player.prototype.executeEncounter = function() {
        if ($gameMap.isEventRunning() || this._encounterCount > 0 || $gameFight.isActive()) return executeEncounter.call(this);
        const troopId = this.makeEncounterTroopId();
        const mode = F.resolveMode(troopId);
        if (F.isOnMap(mode) && $dataTroops[troopId]) {
            this.makeEncounterCount();
            $gameFight.start({ mode, troopId, who: "near", canEscape: true, canLose: false });
            return false;
        }
        const started = withTroop(this, troopId, () => executeEncounter.call(this));
        if (started) F.spendNext();
        return started;
    };

    // Leaving the map ends the fight as an escape, unless it was started to keep.
    const reserveTransfer = Game_Player.prototype.reserveTransfer;
    Game_Player.prototype.reserveTransfer = function(mapId, x, y, d, fadeType) {
        if ($gameFight.isActive() && mapId !== $gameFight.mapId() && $gameFight._options.onTransfer !== "keep") {
            $gameFight._ending = { result: F.ESCAPE, shown: true, quiet: true };
            $gameFight.finish();
        }
        reserveTransfer.call(this, mapId, x, y, d, fadeType);
    };

    // Items and skills marked for battle work for units in an on-map battle. A menu opened over the battle (the
    // pause menu of an Action battle) keeps the menu's own rule: it cannot aim what only a battle uses, and would
    // spend it for nothing.
    const isOccasionOk = Game_BattlerBase.prototype.isOccasionOk;
    Game_BattlerBase.prototype.isOccasionOk = function(item) {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere() && !$gameParty.inBattle()) {
            const scene = typeof SceneManager !== "undefined" && SceneManager ? SceneManager._scene : null;
            const menu = !!scene && typeof Scene_Map !== "undefined" && !(scene instanceof Scene_Map);
            if (!menu) return item.occasion === 0 || item.occasion === 1;
        }
        return isOccasionOk.call(this, item);
    };

    // A turn in a battle on the map is the battle's own: the party's steps there do not end turns besides (states
    // and buffs counted down, HP mended or poisoned every twenty steps of the leader's, the party alone).
    const turnEndOnMap = Game_Actor.prototype.turnEndOnMap;
    Game_Actor.prototype.turnEndOnMap = function() {
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isHere()) return;
        turnEndOnMap.call(this);
    };

    const updateMap = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        updateMap.call(this, sceneActive);
        if (sceneActive && typeof $gameFight !== "undefined" && $gameFight) $gameFight.update();
    };

    // Spawned units are not in the map's file: they go back into its data when it loads, and leave with the map.
    const setupMap = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        const same = mapId === this._mapId;
        const fight = typeof $gameFight !== "undefined" && $gameFight && $gameFight._active ? $gameFight : null;
        if (!same) {
            // A battle kept on the map being left keeps the units spawned for it until the party is back.
            if (fight && fight._mapId === this._mapId && this._rrSpawned) fight._spawnedKept = this._rrSpawned;
            this._rrSpawned = null;
        }
        setupMap.call(this, mapId);
        const back = !same && !!fight && fight._mapId === mapId;
        if (back && fight._spawnedKept) {
            this._rrSpawned = fight._spawnedKept;
            fight._spawnedKept = null;
        }
        // The same map set up again (a load after the project changed reloads it), or the map of a battle that was
        // kept: units still standing come back, and those that fell in the battle do not.
        if ((same || back) && this._rrSpawned) F.reinstateSpawned(this);
        if (fight && fight._mapId === mapId) fight.eraseFallen();
    };

    F.reinstateSpawned = function(map) {
        for (const id of Object.keys(map._rrSpawned || {})) {
            const unit = typeof $gameFight !== "undefined" && $gameFight ? $gameFight._units.find(u => u.eventId === Number(id)) : null;
            if (unit && (unit.defeated || unit.gone)) { delete map._rrSpawned[id]; continue; }
            if (!$dataMap.events[id]) $dataMap.events[id] = map._rrSpawned[id];
            if (!map._events[id]) map._events[id] = new Game_Event(map.mapId(), Number(id));
        }
    };

    F.restoreSpawned = function() {
        const spawned = typeof $gameMap !== "undefined" && $gameMap && $gameMap._rrSpawned;
        if (!spawned || typeof $dataMap === "undefined" || !$dataMap || !$dataMap.events) return;
        for (const [id, data] of Object.entries(spawned)) {
            if (!$dataMap.events[id]) $dataMap.events[id] = data;
        }
    };

    if (typeof Scene_Map !== "undefined") {
        const onMapLoaded = Scene_Map.prototype.onMapLoaded;
        Scene_Map.prototype.onMapLoaded = function() {
            // The map's file is read again on every transfer; one within the same map keeps its events, so the
            // units spawned on it get their data back too.
            if (!$gamePlayer.isTransferring() || $gamePlayer.newMapId() === $gameMap.mapId()) F.restoreSpawned();
            onMapLoaded.call(this);
        };
        // A party that falls in a battle on the map is the battle's to judge: it ends in the defeat (and Game Over
        // unless the battle can be lost), not in the map's own Game Over before the battle has ended.
        const checkGameover = Scene_Map.prototype.checkGameover;
        Scene_Map.prototype.checkGameover = function() {
            // (One kept on a map the party left judges nothing there: the map the party is on does.)
            if ($gameFight.isHere()) return;
            checkGameover.call(this);
        };
        // The menu (and saving) stays open while the only event running is the one waiting for the fight.
        const isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
        Scene_Map.prototype.isMenuEnabled = function() {
            if ($gameFight.isHere() && $gameFight.waitingInterpreter()) {
                return $gameSystem.isMenuEnabled() && !$gameMessage.isBusy();
            }
            return isMenuEnabled.call(this);
        };
    }

    // Battle Processing in an on-map mode fights here, and an event that starts a battle can wait for it. One
    // battle at a time: a command that would start one while a battle runs on this map joins it.

    /**
     * Whether an interpreter runs a page of the battle itself (a battle page, or a common event one called): such
     * a page never waits for the battle it runs in.
     */
    F.isBattlePage = function(interpreter) {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        let own = fight ? fight._hookInterpreter : null;
        for (let depth = 0; own && depth < 100; depth++) {
            if (own === interpreter) return true;
            own = own._childInterpreter;
        }
        return false;
    };

    /** The result an event's If Win / If Escape / If Lose rows read, and the variable its command names. */
    F.setBattleBranch = function(interpreter, result, variable) {
        if (interpreter && interpreter._branch) interpreter._branch[interpreter._indent] = result;
        if (variable > 0) $gameVariables.setValue(variable, result);
    };

    /** An event waits for a battle on the map; its branch rows and `variable` take the result when it ends. False for a page of that battle: it goes on, and none of its branch rows is taken. */
    F.waitForBattle = function(interpreter, serial, variable) {
        if (F.isBattlePage(interpreter)) {
            F.setBattleBranch(interpreter, -1, 0);
            return false;
        }
        interpreter._rrFightSerial = serial;
        interpreter._rrFightVariable = variable > 0 ? variable : 0;
        interpreter.setWaitMode("reactorFight");
        return true;
    };

    /** Whether an enemy unit is among `events` (with no list: among every event of the map). */
    F.anyEnemyAmong = function(events) {
        for (const event of events || $gameMap.events()) if (F.eventSide(event) === "enemy") return true;
        return false;
    };

    /**
     * A command that would start a battle while one runs here gives that battle what it brought: whether the party
     * can escape and can lose, the units it would have taken (`who`: "near" the party, else every unit on the
     * map), its troop, and its goal, judged at once. The battle keeps its mode.
     */
    Game_Fight.prototype.adopt = function(options) {
        if (!this._active || !this.isHere()) return false;
        options = options || {};
        this._options.canEscape = !!options.canEscape;
        this._options.canLose = !!options.canLose;
        const events = options.who === "near" ? (F.takenNear ? F.takenNear() : []) : $gameMap.events();
        for (const event of events) this.join(event);
        if (options.troopId) this.takeTroop(options.troopId);
        this.setObjective(options.objective);
        return true;
    };

    /**
     * Start Battle on Map where the mode is Classic: the battle screen opens against the troop the command names,
     * else against the enemy rows near the party (`who: "map"`: the rows of the whole map), made into a troop for
     * that battle (reactor_fight_classic.js). The event's branch rows and `variable` take the result, as Battle
     * Processing's do. Nobody to fight: the event carries on down If Win. Returns the troop's id, or 0.
     */
    F.startScreen = function(interpreter, options) {
        if ($gameParty.inBattle()) return 0;
        const set = result => F.setBattleBranch(interpreter, result, options.variable);
        if (options.troopId > 0 && $dataTroops[options.troopId]) {
            BattleManager.setup(options.troopId, !!options.canEscape, !!options.canLose);
            BattleManager.setEventCallback(set);
            $gamePlayer.makeEncounterCount();
            SceneManager.push(Scene_Battle);
            F.spendNext();
            return options.troopId;
        }
        const C = F.Classic;
        const rows = options.who === "map" ? null : F.takenNear ? F.takenNear() : [];
        const id = C && typeof C.start === "function" ? C.start(rows, { canEscape: !!options.canEscape, canLose: !!options.canLose, encounter: false, onResult: set }) : 0;
        if (!id) { set(F.WIN); return 0; }
        F.spendNext();
        // The rows that fight start no battle of the map's own until the leader has been out of their reach once (reactor_fight_flow.js).
        if (F.holdRows) F.holdRows($gameFight, rows);
        return id;
    };

    // Battle Processing. While a battle runs on this map its troop comes into that battle and the event waits for
    // it: never the battle screen over a battle on the map. Else, where the battle's mode is on the map, it is
    // fought here against the troop and the units the start rule takes. Its If Win / Escape / Lose rows follow
    // the result. On the battle screen it fights the troop whose mode was read, and it is the next battle.
    const command301 = Game_Interpreter.prototype.command301;
    Game_Interpreter.prototype.command301 = function(params) {
        if ($gameParty.inBattle() || !($gameMap.mapId() > 0)) return command301.call(this, params);
        const troopId = params[0] === 0 ? params[1] : params[0] === 1 ? $gameVariables.value(params[1]) : $gamePlayer.makeEncounterTroopId();
        const fight = $gameFight;
        if (fight.isActive() && fight.isHere()) {
            fight.takeTroop(troopId);
            F.waitForBattle(this, fight.serial(), 0);
            return true;
        }
        if (!fight.isActive()) {
            const mode = F.resolveMode(troopId);
            if (F.isOnMap(mode) && $dataTroops[troopId]) {
                const serial = fight.start({ mode, troopId, who: "near", canEscape: params[2], canLose: params[3] });
                if (serial) {
                    F.waitForBattle(this, serial, 0);
                    $gamePlayer.makeEncounterCount();
                    return true;
                }
            }
        }
        if ($dataTroops[troopId]) F.spendNext();
        return withTroop($gamePlayer, troopId, () => command301.call(this, params));
    };

    const updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode !== "reactorFight") return updateWaitMode.call(this);
        // A page of the battle itself never waits for it.
        const own = F.isBattlePage(this);
        // The battle it waits for runs here. One left on another map to be kept (the party walked out of it) can
        // not end while the party is away, and an event that waited for it would hold the player for good: the
        // event goes on, as after an escape.
        if (!own && $gameFight.isActive() && $gameFight.serial() === this._rrFightSerial && $gameFight.isHere()) return true;
        const result = $gameFight.resultOf(this._rrFightSerial);
        F.setBattleBranch(this, result < 0 ? (own ? -1 : F.ESCAPE) : result, own ? 0 : this._rrFightVariable);
        this._rrFightSerial = 0;
        this._rrFightVariable = 0;
        this._waitMode = "";
        return false;
    };

    // How many of the party fight (and follow on the map): System.json `reactorBattle.partySize`; the stock four without it.
    const maxBattleMembers = Game_Party.prototype.maxBattleMembers;
    Game_Party.prototype.maxBattleMembers = function() {
        const size = Math.floor(Number(F.systemSettings().partySize) || 0);
        return size > 0 ? Math.min(size, 99) : maxBattleMembers.call(this);
    };

    // $gameFight is created with the game and saved with it; the troop is rebuilt from it on load.
    const createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        createGameObjects.call(this);
        root.$gameFight = new Game_Fight();
    };
    const makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = makeSaveContents.call(this);
        contents.reactorFight = root.$gameFight;
        return contents;
    };
    const extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        extractSaveContents.call(this, contents);
        root.$gameFight = contents.reactorFight instanceof Game_Fight ? contents.reactorFight : new Game_Fight();
        if (root.$gameFight.isActive()) root.$gameFight.syncTroop();
    };
    if (typeof root.$gameFight === "undefined") root.$gameFight = new Game_Fight();

    //-------------------------------------------------------------------------
    // Damage numbers over units, and spawned units' sprites.

    if (typeof Spriteset_Map !== "undefined") {
        Spriteset_Map.prototype.rrAddCharacter = function(character) {
            if (!this._characterSprites || !this._tilemap) return;
            const sprite = new Sprite_Character(character);
            this._characterSprites.push(sprite);
            this._tilemap.addChild(sprite);
        };

        /**
         * A damage or heal number on a unit. It keeps its unit and is placed again every frame (F.placePopup), so
         * it stays on the unit as the camera moves; numbers still showing on the same unit stand apart.
         */
        Spriteset_Map.prototype.rrFightPopup = function(character, battler) {
            if (typeof Sprite_Damage === "undefined") return;
            const sprite = new Sprite_Damage();
            sprite.setup(battler);
            const popups = this._rrFightPopups || (this._rrFightPopups = []);
            // The first place none of the unit's other numbers has.
            let slot = 0;
            for (let taken = true; taken && slot < F.POPUP_SPREAD.length - 1;) {
                taken = false;
                for (const other of popups) if (other._rrCharacter === character && other._rrSlot === slot) { taken = true; slot++; break; }
            }
            sprite._rrCharacter = character;
            sprite._rrSlot = slot;
            sprite._rrSeen = true;
            sprite._rrLooked = -1e9;
            sprite._rrTall = typeof Reactor3D !== "undefined" && Reactor3D && Reactor3D.characterHeightTiles ? Reactor3D.characterHeightTiles(character) : 0;
            F.placePopup(sprite);
            popups.push(sprite);
            this.addChild(sprite);
        };

        const updateSpriteset = Spriteset_Map.prototype.update;
        Spriteset_Map.prototype.update = function() {
            updateSpriteset.call(this);
            const popups = this._rrFightPopups;
            if (!popups || !popups.length) return;
            for (let i = popups.length - 1; i >= 0; i--) {
                if (popups[i].isPlaying()) { F.placePopup(popups[i]); continue; }
                this.removeChild(popups[i]);
                popups[i].destroy();
                popups.splice(i, 1);
            }
        };
    }

    /**
     * Where the numbers on one unit stand, the first at its head: pixels across and up, by the order they landed.
     * One over the other, a line of digits and a little apart, so numbers of any length never cross.
     */
    F.POPUP_SPREAD = [[0, 0], [0, 38], [0, 76], [0, 114], [0, 152], [0, 190]];
    /** How often a number looks whether its unit is behind something, in frames. */
    F.POPUP_LOOK = 6;
    // How near the picture's edges a number may sit: pixels from the sides, shares of its height from the top
    // (under a target's name and bar) and for the bottom (over the HUD's row). `off`: how far past a side its unit
    // may be before the number is not shown at all.
    // `line`: a number's own height, which stands above the point it is put at.
    F.POPUP_EDGE = { side: 36, top: 0.16, bottom: 0.76, off: 60, line: 44 };

    /**
     * Puts a damage number where its unit is now. Out of sight while the unit is behind the eye, off to the side
     * of the picture, or (on a 3D map) behind the ground or behind something built that the picture does not show
     * it through; never over the HUD along the bottom. Through the eyes the player's own number stands beside the
     * HUD's vitals instead of in the world, where it would be at the eye itself.
     */
    F.placePopup = function(sprite) {
        const character = sprite._rrCharacter;
        if (!character) return;
        const spread = F.POPUP_SPREAD[sprite._rrSlot] || F.POPUP_SPREAD[0], edge = F.POPUP_EDGE;
        const own = F.ownPopupPoint(character, F._ownPoint || (F._ownPoint = { x: 0, y: 0 }));
        if (own) {
            sprite.x = own.x + spread[0]; sprite.y = own.y - spread[1];
            sprite.visible = true;
            return;
        }
        const head = F.headPoint(character, F._headPoint || (F._headPoint = { x: 0, y: 0, visible: true }), sprite._rrTall);
        const frame = typeof Graphics !== "undefined" && Graphics.frameCount || 0;
        if (head.visible && head.world && (frame - sprite._rrLooked >= F.POPUP_LOOK || frame < sprite._rrLooked)) {
            sprite._rrLooked = frame;
            sprite._rrSeen = F.pointSeen(head.world, character);
        }
        const width = Graphics.width, height = Graphics.height;
        sprite.visible = head.visible && sprite._rrSeen && head.x >= -edge.off && head.x <= width + edge.off;
        if (!sprite.visible) return;
        const top = Math.round(height * edge.top) + (edge.line || 0), at = Math.max(top, Math.min(Math.round(height * edge.bottom), head.y));
        // The numbers of one unit stand upward from its head; where the head is at the top of the picture, downward.
        if (sprite._rrDown === undefined) sprite._rrDown = at - top < F.POPUP_SPREAD[F.POPUP_SPREAD.length - 1][1];
        sprite.x = Math.max(edge.side, Math.min(width - edge.side, head.x + spread[0]));
        sprite.y = sprite._rrDown ? at + spread[1] : Math.max(top, at - spread[1]);
    };

    /**
     * Whether a character is the one whose eyes the battle is seen through: the player, in an Action or First
     * Person battle here, with the map's camera in the head. (A Tactical battle has its own view, whatever the
     * map's camera is.)
     */
    F.throughEyes = function(character) {
        if (typeof $gamePlayer === "undefined" || character !== $gamePlayer || typeof Reactor3D === "undefined" || !Reactor3D || !Reactor3D.Camera) return false;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!fight || !fight._active || (fight._mode !== "action" && fight._mode !== "firstPerson") || !fight.isHere()) return false;
        if (!Reactor3D.shouldRender3D || typeof $dataMap === "undefined" || !Reactor3D.shouldRender3D($dataMap)) return false;
        return Reactor3D.Camera.currentState().mode === "firstPerson";
    };

    /**
     * Where the player's own number goes while the battle is seen through the eyes: over the HUD's vitals (the
     * lower left where no HUD says). Null in every other view, and for everyone else.
     */
    F.ownPopupPoint = function(character, out) {
        if (!F.throughEyes(character)) return null;
        const scene = typeof SceneManager !== "undefined" ? SceneManager._scene : null, hud = scene && scene._reactorActionHud;
        const windows = hud && hud._nodeWindows;
        if (windows) {
            for (const window of windows) {
                if (!window.visible || typeof window.node !== "function" || window.node().type !== "actionVitals") continue;
                out.x = Math.round(window.x + window.width * 0.72); out.y = Math.round(window.y - 6);
                return out;
            }
        }
        out.x = Math.round(Graphics.width * 0.17); out.y = Math.round(Graphics.height * 0.8);
        return out;
    };

    /**
     * Whether the map's camera sees a point of the world: nothing of the ground or of what is built stands on the
     * way to it. `character` is who stands there: what the cutaway has opened to show it (a corridor through a
     * wall, a tactical battle's ground) is not in the way, only the ground still can be.
     */
    F.pointSeen = function(world, character) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        if (!R || !R.cameraArm || !R.viewport || typeof $dataMap === "undefined") return true;
        const viewport = R.viewport(), camera = viewport && viewport.camera && viewport.camera();
        if (!camera) return true;
        const eye = camera.position;
        const length = Math.hypot(world.x - eye.x, world.y - eye.y, world.z - eye.z);
        const shown = !!(character && R.cutawayShows && R.cutawayShows(character, world.x, world.z));
        // Up to the unit itself: what it stands against hides nothing of it.
        return R.cameraArm($dataMap, eye, world, 0, 0, 0.4, shown ? "ground" : "") >= length - 0.75;
    };

    /**
     * Where a character's head is on screen: above its feet, through the 3D camera on a 3D map. Fills and returns
     * `out` (a new record without one): `x`, `y`, whether it is in front of the camera (`visible`), and on a 3D
     * map the point of the world it is (`world`). `tall` is the character's height in tiles when the caller knows it.
     */
    F.headPoint = function(character, out, tall) {
        out = out || { x: 0, y: 0, visible: true };
        out.visible = true;
        // (Asked of the map, not of the character's own screen point: that makes a record a call, and this runs
        // every frame for every number showing.)
        const deep = typeof Reactor3D !== "undefined" && Reactor3D && Reactor3D.viewport && Reactor3D.shouldRender3D
            && typeof $dataMap !== "undefined" && Reactor3D.shouldRender3D($dataMap);
        const viewport = deep ? Reactor3D.viewport() : null;
        const camera = viewport && viewport.camera && viewport.camera();
        if (camera) {
            const ground = Reactor3D.characterGround ? Reactor3D.characterGround($dataMap, character) : 0;
            const world = out.world || (out.world = { x: 0, y: 0, z: 0 });
            world.x = character._realX + 0.5; world.y = ground + (tall > 0 ? tall + 0.2 : 2.6); world.z = character._realY + 0.5;
            const head = Reactor3D.projectToScreen(camera, world.x, world.y, world.z, F._headScreen || (F._headScreen = {}));
            if (head) { out.x = Math.round(head.x); out.y = Math.round(head.y); out.visible = head.visible !== false; return out; }
        }
        out.world = null;
        out.x = character.screenX(); out.y = character.screenY() - Math.round($gameMap.tileHeight() * 1.4);
        return out;
    };

    // A unit event with no model of its own wears the one the Database binds to its record.
    // Its own picture comes first (F.hasOwnPicture), and a model whose file could not be read is not worn
    // (F.modelFailed): the unit then stands as the next thing its record gives (Looks, below).
    if (typeof Reactor3D !== "undefined" && Reactor3D.characterModelSpec) {
        const characterModelSpec = Reactor3D.characterModelSpec;
        // The model an event has of its own: its page's, or its note's.
        F.ownModelSpec = character => characterModelSpec.call(Reactor3D, character);
        Reactor3D.characterModelSpec = function(character) {
            const own = characterModelSpec.call(this, character);
            if (own || !character || typeof character.event !== "function") return own;
            // An erased event (a fallen unit), one with no page met and one whose data left with the map show nothing, so wear nothing.
            const unit = F.lookUnit(character);
            if (!unit || !unit.id || !this.databaseModelSpec) return own;
            // Asked many times a frame for every unit: what its record gives it is worked out once a frame, and
            // again at once when its page or its own picture changes.
            const frame = typeof Graphics !== "undefined" && Graphics ? Graphics.frameCount : 0;
            let worn = character._rrWornKept;
            if (worn && frame > 0 && worn.frame === frame && worn.page === character._pageIndex && worn.name === character._characterName
                && worn.tile === character._tileId) return worn.spec || own;
            let spec = null;
            if (!F.hasOwnPicture(character, unit)) {
                const bound = this.databaseModelSpec(unit.record === "enemy" ? "enemies" : "actors", unit.id);
                if (bound && !F.modelFailed(bound)) spec = bound;
            }
            if (!worn) {
                worn = { frame: 0, page: 0, name: "", tile: 0, spec: null };
                // Not enumerable: a save never sees it.
                Object.defineProperty(character, "_rrWornKept", { value: worn, enumerable: false, configurable: true, writable: true });
            }
            worn.frame = frame; worn.page = character._pageIndex; worn.name = character._characterName; worn.tile = character._tileId;
            worn.spec = spec;
            return spec || own;
        };
    }

    //-------------------------------------------------------------------------
    // Looks. A unit is never invisible: an event that is a unit and has no
    // picture or model of its own stands as its record does, by the one rule
    // the editor shares (ReactorFightLook, reactor_fight_look.js): the model
    // the Database binds to the record, else the record's character sheet
    // (an actor's, an enemy's `<unit character: Name, index>`), else an
    // enemy's battler picture, else a plain figure in its side's color. The
    // model is worn through Reactor3D.characterModelSpec above; the sheet,
    // the picture and the figure are drawn by the event's sprite
    // (Sprite_Character.updateReactorLook) and, in a 3D scene, its billboard.

    const lookRule = () => (typeof ReactorFightLook !== "undefined" && ReactorFightLook ? ReactorFightLook : null);
    // A page's command list -> the unit the event is on that page. Kept per list: the 3D view asks for every character every frame.
    const lookUnits = typeof WeakMap !== "undefined" ? new WeakMap() : null;

    /**
     * The unit an event is on the page it shows, read for its look: its row or note tag, else a `<unit: ...>` or
     * PTBS comment on that page. Null for an event that is no unit there, is erased, or shows no page.
     */
    F.lookUnit = function(event) {
        const data = event && typeof event.event === "function" ? event.event() : null;
        if (!data || event._erased) return null;
        const page = typeof event.page === "function" ? event.page() : null;
        const list = page ? page.list : null;
        if (!list) return null;
        let entry = lookUnits ? lookUnits.get(list) : null;
        if (!entry || entry.rrUnit !== data.rrUnit || entry.note !== data.note) {
            entry = { rrUnit: data.rrUnit, note: data.note, spec: F.unitSpecOf(data, list) };
            if (lookUnits) lookUnits.set(list, entry);
        }
        return entry.spec;
    };

    // What each record stands as on each side, kept until the Database, its model bindings or the battle view change.
    const looks = { enemies: null, actors: null, sidecar: null, presentation: null, sideView: null, table: new Map(), own: {} };

    /** A record's two looks on a side: `model` with the model the Database binds to it (null when it binds none), `plain` without. */
    function recordLooks(record, id, team) {
        const rule = lookRule();
        if (!rule) return null;
        const enemies = typeof $dataEnemies !== "undefined" ? $dataEnemies : null, actors = typeof $dataActors !== "undefined" ? $dataActors : null;
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        const sidecar = (R && R._databaseSidecar) || null;
        const presentation = (typeof ReactorBattlePresentation !== "undefined" && ReactorBattlePresentation && ReactorBattlePresentation.settings) || null;
        const sideView = !!(typeof $dataSystem !== "undefined" && $dataSystem && $dataSystem.optSideView);
        if (looks.enemies !== enemies || looks.actors !== actors || looks.sidecar !== sidecar || looks.presentation !== presentation || looks.sideView !== sideView) {
            looks.enemies = enemies; looks.actors = actors; looks.sidecar = sidecar; looks.presentation = presentation; looks.sideView = sideView;
            looks.table.clear();
        }
        const key = (id * 2 + (record === "actor" ? 1 : 0)) * 4 + Math.max(0, F.TEAMS.indexOf(team));
        let entry = looks.table.get(key);
        const data = (record === "actor" ? actors && actors[id] : record === "enemy" ? enemies && enemies[id] : null) || null;
        // The record's own picture may change in a running game: its note, or a new `rrBattle` object.
        const note = data ? data.note : undefined, own = data ? data.rrBattle : undefined;
        if (!entry || entry.note !== note || entry.own !== own) {
            const unit = { team, record, id };
            const spec = R && R.databaseModelSpec && record && id > 0 ? R.databaseModelSpec(record === "enemy" ? "enemies" : "actors", id) : null;
            entry = {
                note, own,
                model: spec ? Object.freeze(rule.resolve(unit, { model: spec, record: data, sideView })) : null,
                plain: Object.freeze(rule.resolve(unit, { record: data, sideView }))
            };
            looks.table.set(key, entry);
        }
        return entry;
    }

    /** Whether a model's file could not be read: such a model is nobody's look. */
    F.modelFailed = function(spec) {
        const R = typeof Reactor3D !== "undefined" ? Reactor3D : null;
        const cached = R && spec && R._glbCache && R.specCacheKey ? R._glbCache[R.specCacheKey(spec)] : null;
        return !!(cached && cached.failed);
    };

    /**
     * What a unit of this record (`record`: "actor" or "enemy", `id`) stands as when its event has no picture or
     * model of its own: { kind: "model", spec } | { kind: "character", characterName, characterIndex }
     * | { kind: "picture", folder, name, hue } | { kind: "figure" }, each with `team` and `color` (the side's:
     * `team`, else the record's usual side). Never null while the look rule is loaded. The answer is shared and
     * kept: read it, never write it.
     */
    F.unitLook = function(record, id, team) {
        const kind = record === "actor" || record === "enemy" ? record : "";
        const number = kind ? Math.max(0, Math.floor(Number(id) || 0)) : 0;
        const side = F.TEAMS.includes(team) ? team : kind === "actor" ? "ally" : kind === "enemy" ? "enemy" : "neutral";
        const entry = recordLooks(number ? kind : "", number, side);
        if (!entry) return null;
        return entry.model && !F.modelFailed(entry.model.spec) ? entry.model : entry.plain;
    };

    /**
     * Whether the picture an event shows is its own: a tile or a character sheet, but not the sheet Spawn Unit
     * wrote into it from its record (`unit`: what the event is, F.lookUnit).
     */
    F.hasOwnPicture = function(event, unit) {
        if (event._tileId > 0) return true;
        const name = event._characterName;
        if (!name) return false;
        const data = event.event();
        if (!data || !data.rrSpawned || !unit) return true;
        const entry = recordLooks(unit.record, unit.id, unit.team);
        // (Where the look rule is not loaded, a spawned unit's picture is taken as its record's.)
        if (!entry) return false;
        const sheet = entry.plain.kind === "character" ? entry.plain : null;
        return !(sheet && sheet.characterName === name && sheet.characterIndex === event._characterIndex);
    };

    // How often a kept look is read again, in frames: a side changed by a command, a model that could not be loaded.
    F.LOOK_BEAT = 12;

    /**
     * What an event stands as: null when it is no unit on the page it shows; { kind: "own" } when it shows a
     * picture or a model of its own; else its record's look (F.unitLook) on the side it is on now. Asked every
     * frame by the event's sprite: the answer is kept beside the event, read again every F.LOOK_BEAT frames and at
     * once when its page or its picture changes.
     */
    F.eventLook = function(event) {
        if (!event || typeof event.event !== "function") return null;
        const frame = typeof Graphics !== "undefined" && Graphics ? Graphics.frameCount : 0;
        let kept = event._rrLookKept;
        if (kept && frame > 0 && frame >= kept.at && frame - kept.at < F.LOOK_BEAT && kept.page === event._pageIndex
            && kept.name === event._characterName && kept.tile === event._tileId && kept.erased === event._erased) return kept.look;
        const unit = F.lookUnit(event);
        let look = null;
        if (unit) {
            const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
            let side = "";
            // (Asked only where a command has changed a side: the lookup makes a key.)
            if (fight && fight._sides && fight.sideOverride && typeof $gameMap !== "undefined" && $gameMap) {
                for (const any in fight._sides) { side = fight.sideOverride($gameMap.mapId(), event.eventId()); break; }
            }
            const team = side || unit.team;
            if (F.hasOwnPicture(event, unit) || (F.ownModelSpec && F.ownModelSpec(event))) {
                const rule = lookRule();
                look = rule ? looks.own[team] || (looks.own[team] = Object.freeze(rule.resolve({ team }, { own: true }))) : null;
            } else {
                look = F.unitLook(unit.record, unit.id, team);
            }
        }
        if (!kept) {
            kept = { at: 0, page: 0, name: "", tile: 0, erased: false, look: null };
            // Not enumerable: a save never sees it.
            Object.defineProperty(event, "_rrLookKept", { value: kept, enumerable: false, configurable: true, writable: true });
        }
        kept.at = frame; kept.page = event._pageIndex; kept.name = event._characterName; kept.tile = event._tileId; kept.erased = event._erased;
        kept.look = look;
        return look;
    };

    //-------------------------------------------------------------------------
    // The event commands (code 357, plugin "RPGReactor").

    if (typeof PluginManager !== "undefined" && PluginManager.registerCommand) {
        const bool = value => value === true || value === "true";
        const int = value => Math.floor(Number(value) || 0);
        PluginManager.registerCommand("RPGReactor", "ChangeBattleMode", function(args) {
            F.changeMode(String(args && args.mode || "default"), String(args && args.scope || "game"));
        });
        // Start Battle on Map. `who`: "near" takes the units the start rule takes round the party, anything else
        // every unit on the map. The mode is the one it names, else the one in force (the next-battle setting, its
        // troop's, this map's, the game's); where that is Classic the battle is the battle screen (F.startScreen).
        PluginManager.registerCommand("RPGReactor", "StartMapBattle", function(args) {
            args = args || {};
            const fight = $gameFight, troopId = int(args.troopId), variable = int(args.resultVariable);
            const who = args.who === "near" ? "near" : "map";
            const canEscape = bool(args.canEscape), canLose = bool(args.canLose), objective = F.objectiveOfArgs(args);
            // One battle at a time: a battle running on this map takes what this one brings, and the event waits for it.
            if (fight.isActive()) {
                if (!fight.isHere()) return;
                fight.adopt({ who, troopId, canEscape, canLose, objective });
                if (bool(args.wait)) F.waitForBattle(this, fight.serial(), variable);
                return;
            }
            const mode = F.isMode(args.mode) ? args.mode : F.resolveMode(troopId);
            if (!F.isOnMap(mode)) {
                F.startScreen(this, { who, troopId, canEscape, canLose, variable });
                return;
            }
            // A battle that would be won the moment it starts does not start: the event carries on down If Win.
            const taken = who === "near" && F.takenNear ? F.takenNear() : null;
            if (objective.type === "defeatAll" && !F.troopComes(troopId) && !F.anyEnemyAmong(taken)) {
                F.setBattleBranch(this, F.WIN, variable);
                return;
            }
            const serial = fight.start({
                mode, troopId, who, taken, canEscape, canLose,
                turns: args.turns === "initiative" || args.turns === "team" ? args.turns : undefined,
                objective, onTransfer: args.onTransfer, bgm: args.bgm, view: args.view
            });
            if (serial && bool(args.wait)) F.waitForBattle(this, serial, variable);
        });
        PluginManager.registerCommand("RPGReactor", "ChangeBattleGoal", function(args) {
            $gameFight.setObjective(F.objectiveOfArgs(args));
        });
        PluginManager.registerCommand("RPGReactor", "ChangeUnitSide", function(args) {
            $gameFight.setEventSide(int(args && args.eventId) || this._eventId, String(args && args.team || ""));
        });
        PluginManager.registerCommand("RPGReactor", "SpawnUnit", function(args) {
            args = args || {};
            // `height`: the floor meant on a cell with several (tiles over the map's zero); without it the cell's ground.
            let x = int(args.x), y = int(args.y), height = args.height === undefined || args.height === "" ? undefined : Number(args.height), around;
            if (args.at === "event") {
                const anchor = this.character(int(args.eventId));
                if (!anchor) return;
                const spot = $gameFight.freeSpotNear(anchor.x, anchor.y, 1);
                if (!spot) return;
                x = spot.x; y = spot.y; height = spot.height; around = anchor;
            } else if (args.at === "variables") {
                x = $gameVariables.value(int(args.x));
                y = $gameVariables.value(int(args.y));
            }
            $gameFight.spawn({ record: args.record === "actor" ? "actor" : "enemy", id: int(args.id), team: args.team, x, y, height, around, template: int(args.template), direction: int(args.direction) });
        });
        PluginManager.registerCommand("RPGReactor", "RemoveUnit", function(args) {
            const eventId = int(args && args.eventId) || this._eventId;
            // A unit standing outside the battle joins it first, wherever it stands, and leaves as any unit does.
            $gameFight.removeUnit($gameFight.unitOfEvent(eventId) || $gameFight.join(eventId, true), args && bool(args.keep));
        });
        PluginManager.registerCommand("RPGReactor", "EndMapBattle", function(args) {
            const result = String(args && args.result || "win");
            $gameFight.end(result === "lose" ? F.LOSE : result === "escape" ? F.ESCAPE : F.WIN);
        });
    }
})(globalThis);
