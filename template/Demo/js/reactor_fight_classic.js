//=============================================================================
// reactor_fight_classic.js — placed enemies on a Classic map
//
// On a map whose battle mode in force is Classic, the enemy units the map's
// start rule takes open the battle screen (Scene_Battle) as a troop made for
// that one battle. The troop's record stands at the end of $dataTroops while
// the battle runs, so $gameTroop.troop() and $dataTroops[id] are real for
// every reader; it is taken out again when the battle scene has ended.
//
// A Classic battle has no joining, so a group is fought whole: an enemy row
// standing within C.GROUP tiles of one the rule takes comes with it.
//
// The flow is a random encounter's: BattleManager.setup, onEncounter, the
// count to the next random encounter, the battle scene pushed. The Battle
// Start sound, the encounter effect, the stage, the music, the rewards and
// the victory step are the battle screen's own.
//
// When the battle is won or escaped, every member that fell is a defeated
// unit: its event is erased and, unless its row says Comes back, remembered
// in the list defeated units are kept in ($gameFight). A lost battle changes
// nothing on the map.
//
// Two rules here serve the battle screen whoever opened it (Battle
// Processing, a random encounter, a battle made here):
// - The stage. A stock battleback chosen by terrain that the project does
//   not have is left out, so the battle stands on the map behind it.
// - The hold. After the battle screen the map starts no battle of its own
//   until the leader has been out of every enemy's reach once.
//
// Nothing here runs per frame.
//=============================================================================

(function(root) {
    "use strict";

    const F = root.ReactorFight = root.ReactorFight || {};
    const C = F.Classic = F.Classic || {};

    // As many members as a troop shows.
    C.MAX = 8;
    // An enemy row this near (tiles, a straight line) to one that fights fights too.
    C.GROUP = 3;
    // One row holds up to this many; more stand in two rows.
    C.ONE_ROW = 4;
    // Where the rows stand, as parts of the battle field's height. One row stands on the line the project's own
    // troops stand on (C.troopLine), between C.TOP_Y and C.ROW_Y, the stock line. Two rows stand C.ROW_GAP apart
    // about that line, the front one no lower than C.FRONT_Y: lower, the stock status window covers its feet.
    C.ROW_Y = 0.70;
    C.TOP_Y = 0.30;
    C.FRONT_Y = 0.72;
    C.ROW_GAP = 0.14;
    // The part of the battle field's width the rows use in a side-view game (the party stands on the rest).
    C.SIDE_WIDTH = 0.55;
    // The longest the map scene waits, in frames from the battle's start, to learn whether a stock battleback is there.
    C.STAGE_WAIT = 180;
    // Whether the stage rule serves every battle screen opened from the map (false: only the battles made here).
    C.STAGE_EVERY_BATTLE = true;

    const WIN = 0, ESCAPE = 1, LOSE = 2;
    const PENDING = "pending", FOUND = "found", MISSING = "missing";

    // The battle made here that is running: { troopId, record, mapId, result, members, onResult }; null otherwise.
    if (C._session === undefined) C._session = null;
    // The stock battlebacks being tried for the battle screen about to open: { tried: [entry | null, entry | null], frame }.
    if (C._stage === undefined) C._stage = null;

    /** Whether a battle made here is running (from start until its battle scene has ended). */
    C.isRunning = function() {
        return !!C._session && C.sceneUp();
    };

    /**
     * Whether a battle screen is up, about to be, or under a scene pushed over it. A battle made here whose
     * battle screen is none of these never opened (another scene was asked for in its place): it is not
     * running, and the next start forgets it. Before the first scene there is nothing to judge by.
     */
    C.sceneUp = function() {
        const manager = typeof SceneManager !== "undefined" ? SceneManager : null;
        if (!manager || !manager._scene || typeof Scene_Battle === "undefined") return true;
        if (manager._scene instanceof Scene_Battle || manager._nextScene instanceof Scene_Battle) return true;
        for (const sceneClass of manager._stack || []) {
            if (sceneClass === Scene_Battle || (sceneClass && sceneClass.prototype instanceof Scene_Battle)) return true;
        }
        return false;
    };

    //-------------------------------------------------------------------------
    // Who fights: the enemy rows among the events given and the rows standing
    // with them, nearest first.

    /** The unit a live event is now, where the battle core has no one answer yet: its row, on the side Change Unit Side last gave it. */
    C.unitNow = function(event) {
        const spec = F.unitSpecOf(event.event(), F.eventList(event));
        if (!spec) return null;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        const side = fight && fight.sideOverride ? fight.sideOverride($gameMap.mapId(), event.eventId()) : "";
        return side && (side === "neutral" || spec.record) ? Object.assign({}, spec, { team: side }) : spec;
    };

    /**
     * The enemy row an event is: `{ event, eventId, enemyId, remembered }`, or null. A row is the event's own
     * In battle setting (`rrUnit`); it counts while the event is on the map, on the Enemy side, with an enemy
     * record that exists. Tag units, allies, bystanders, actor records and units a command spawned are no part
     * of a Classic battle.
     * `remembered`: it stays defeated once it falls. Only a row whose own side is Enemy does (one a command
     * turned into an enemy stands again when the map is entered again), and not one that says Comes back.
     */
    C.rowOf = function(event) {
        if (typeof event === "number") event = $gameMap.event(event);
        if (!event || typeof event.event !== "function") return null;
        const data = event.event();
        // On the map: a page whose conditions are met. An erased event has none.
        if (!data || !data.rrUnit || data.rrSpawned || !event.page()) return null;
        const unit = typeof F.eventUnit === "function" ? F.eventUnit(event) : C.unitNow(event);
        if (!unit || unit.team !== "enemy" || unit.record !== "enemy" || !$dataEnemies[unit.id]) return null;
        return { event, eventId: event.eventId(), enemyId: unit.id, remembered: data.rrUnit.team === "enemy" && data.rrUnit.returns !== true };
    };

    /**
     * The rows that fight. With a list (`events`: Game_Events or event ids): the enemy rows among them and,
     * unless `group` is false, every enemy row of the map within C.GROUP tiles of one of those. With no list:
     * every enemy row of the map. In order of their straight-line distance from the leader's tile, the nearest
     * C.MAX of them; the rest stay on the map.
     */
    C.take = function(events, group) {
        const named = Array.isArray(events);
        const rows = [], seen = {};
        for (const entry of named ? events : $gameMap.events()) {
            const row = C.rowOf(entry);
            if (!row || seen[row.eventId]) continue;
            seen[row.eventId] = true;
            rows.push(row);
        }
        if (named && group !== false && rows.length) {
            const count = rows.length, reach = C.GROUP * C.GROUP;
            for (const event of $gameMap.events()) {
                if (seen[event.eventId()]) continue;
                const row = C.rowOf(event);
                if (!row) continue;
                for (let i = 0; i < count; i++) {
                    const dx = $gameMap.deltaX(row.event.x, rows[i].event.x), dy = $gameMap.deltaY(row.event.y, rows[i].event.y);
                    if (dx * dx + dy * dy > reach) continue;
                    seen[row.eventId] = true;
                    rows.push(row);
                    break;
                }
            }
        }
        for (const row of rows) {
            const dx = $gameMap.deltaX(row.event.x, $gamePlayer.x), dy = $gameMap.deltaY(row.event.y, $gamePlayer.y);
            row.far = dx * dx + dy * dy;
        }
        rows.sort((a, b) => a.far - b.far || a.eventId - b.eventId);
        return rows.slice(0, C.MAX);
    };

    //-------------------------------------------------------------------------
    // The troop made for the battle.

    /** The members' names as a troop is named: each name once, in order, with its count ("Raider*2, Raider Cutter"). */
    C.troopName = function(enemyIds) {
        const names = [], counts = {};
        for (const id of enemyIds) {
            const enemy = $dataEnemies[id];
            const name = enemy ? String(enemy.name || "") : "";
            if (counts[name] === undefined) { counts[name] = 0; names.push(name); }
            counts[name]++;
        }
        return names.map(name => (counts[name] > 1 ? name + "*" + counts[name] : name)).join(", ");
    };

    /**
     * The line troops stand on in this project, as a part of the battle field's `height`: the middle of the
     * heights the members of the project's own troops stand at, where the author's battle screen leaves them
     * room. Between C.TOP_Y and C.ROW_Y; C.ROW_Y for a project none of whose troops has a placed member.
     * Members left at the field's top edge and troops that fight on the map are not counted.
     */
    C.troopLine = function(height) {
        if (!(height > 0)) return C.ROW_Y;
        const heights = [];
        for (const troop of $dataTroops) {
            if (!troop || !Array.isArray(troop.members)) continue;
            if (troop.reactorBattle && F.isOnMap(troop.reactorBattle.mode)) continue;
            for (const member of troop.members) {
                const y = member ? Number(member.y) : 0;
                if (y > 0) heights.push(y);
            }
        }
        if (!heights.length) return C.ROW_Y;
        heights.sort((a, b) => a - b);
        const half = heights.length >> 1;
        const middle = heights.length % 2 ? heights[half] : (heights[half - 1] + heights[half]) / 2;
        return Math.max(C.TOP_Y, Math.min(C.ROW_Y, middle / height));
    };

    /**
     * Where `count` members stand, nearest first, in the battle field's own units (`width` by `height`).
     * `line` is the line one row stands on, as a part of the height (C.ROW_Y when left out).
     * Up to C.ONE_ROW in one row, spread evenly. More in two rows: the nearer half in front, the rest behind,
     * each standing in a gap of the front row. A side-view game uses the left C.SIDE_WIDTH of the field.
     */
    C.positions = function(count, sideView, width, height, line) {
        const n = Math.max(0, Math.min(C.MAX, Math.floor(Number(count) || 0)));
        const field = (sideView ? C.SIDE_WIDTH : 1) * width;
        const at = Math.max(C.TOP_Y, Math.min(C.ROW_Y, Number(line) || C.ROW_Y));
        const spots = [];
        if (n <= C.ONE_ROW) {
            const y = Math.round(height * at);
            for (let k = 1; k <= n; k++) spots.push({ x: Math.round(field * k / (n + 1)), y });
            return spots;
        }
        const front = Math.ceil(n / 2), back = n - front, step = field / (front + 1);
        const frontAt = Math.min(at + C.ROW_GAP / 2, C.FRONT_Y);
        const frontY = Math.round(height * frontAt), backY = Math.round(height * (frontAt - C.ROW_GAP));
        // Rows as long as each other leave the back row one member past the front row's end. In a side-view game
        // that member stands on the party's side, clear of the screen's edge; in front view the two rows are
        // centered together, a quarter step each way.
        const shift = front === back && !sideView ? 0.25 : 0;
        for (let k = 1; k <= front; k++) spots.push({ x: Math.round(step * (k - shift)), y: frontY });
        for (let k = 1; k <= back; k++) spots.push({ x: Math.round(step * (k + 0.5 - shift)), y: backY });
        return spots;
    };

    /** The battle field's size: the area troop members are placed in. */
    C.fieldSize = function() {
        const graphics = typeof Graphics !== "undefined" && Graphics ? Graphics : null;
        return { width: Number(graphics && graphics.boxWidth) || 808, height: Number(graphics && graphics.boxHeight) || 616 };
    };

    C.isSideView = function() {
        return typeof $gameSystem !== "undefined" && !!$gameSystem && typeof $gameSystem.isSideView === "function" && !!$gameSystem.isSideView();
    };

    /** One troop page that never runs: no condition is set. */
    C.emptyPage = function() {
        return {
            conditions: { actorHp: 50, actorId: 1, actorValid: false, enemyHp: 50, enemyIndex: 0, enemyValid: false,
                switchId: 1, switchValid: false, turnA: 0, turnB: 0, turnEnding: false, turnValid: false },
            list: [{ code: 0, indent: 0, parameters: [] }],
            span: 0
        };
    };

    /** The troop record for `rows` (C.take's), with the id it will stand at: the end of $dataTroops. */
    C.makeTroop = function(rows) {
        const size = C.fieldSize();
        const spots = C.positions(rows.length, C.isSideView(), size.width, size.height, C.troopLine(size.height));
        return {
            id: $dataTroops.length,
            name: C.troopName(rows.map(row => row.enemyId)),
            members: rows.map((row, index) => ({ enemyId: row.enemyId, x: spots[index].x, y: spots[index].y, hidden: false })),
            pages: [C.emptyPage()]
        };
    };

    //-------------------------------------------------------------------------
    // Starting the battle.

    /**
     * Open the battle screen against the rows C.take gives for `events`. Options: group (true unless false:
     * the rows standing with the ones named fight too), canEscape (true unless false), canLose (false unless
     * true: a loss is Game Over), encounter (true unless false: the party may strike first or be surprised,
     * as in a random encounter), onResult (called once with 0 won, 1 escaped, 2 lost, when the battle ends
     * and before the map is back).
     * Returns the made troop's id, or 0 when nothing started: no enemy row to fight, a battle already running
     * here or on the map, or the scene already changing.
     */
    C.start = function(events, options) {
        options = options || {};
        // A battle made here whose battle screen never opened stops no other.
        if (C._session && !C.sceneUp()) C.drop();
        if (C._session || $gameParty.inBattle()) return 0;
        if (typeof $gameFight !== "undefined" && $gameFight && $gameFight.isActive()) return 0;
        if (typeof SceneManager !== "undefined" && SceneManager.isSceneChanging && SceneManager.isSceneChanging()) return 0;
        const rows = C.take(events, options.group);
        if (!rows.length) return 0;
        const record = C.makeTroop(rows);
        $dataTroops[record.id] = record;
        BattleManager.setup(record.id, options.canEscape !== false, options.canLose === true);
        if (options.encounter !== false) BattleManager.onEncounter();
        BattleManager.setEventCallback(C.onResult);
        $gamePlayer.makeEncounterCount();
        // Each member remembers its event; the battler is the one the troop made for it, whatever it turns into.
        const battlers = $gameTroop.members();
        C._session = {
            troopId: record.id,
            record,
            mapId: $gameMap.mapId(),
            result: -1,
            members: rows.map((row, index) => ({ eventId: row.eventId, enemyId: row.enemyId, remembered: row.remembered, battler: battlers[index] || null, dead: false })),
            onResult: typeof options.onResult === "function" ? options.onResult : null
        };
        C.tryStage();
        SceneManager.push(Scene_Battle);
        return record.id;
    };

    //-------------------------------------------------------------------------
    // The stage: the map's battleback rule. A battleback the map names is asked
    // for as it is. Where the map names none, a world map gets a stock picture
    // chosen by terrain, and a project need not have it. That picture is tried
    // while the encounter effect plays, apart from the images a scene waits
    // for. One the project does not have is left out, and the battle shows the
    // map behind it, as it does on a map that is not a world map. The map scene
    // waits for the answer, C.STAGE_WAIT frames at most; a picture still
    // unanswered then is asked for as the stock rule asks.

    const BATTLEBACK_FOLDERS = ["img/battlebacks1/", "img/battlebacks2/"];
    const stockStageNames = [null, null];
    const frameNow = () => (typeof Graphics !== "undefined" && Graphics ? Number(Graphics.frameCount) || 0 : 0);

    /** Tries the pictures the stock choice by terrain names for the party's place: `[{ name, state, image } | null, …]`. */
    C.tryStage = function() {
        const tried = [null, null];
        C._stage = { tried, frame: frameNow() };
        if (typeof Sprite_Battleback === "undefined" || typeof Image === "undefined") return tried;
        // The battle test's battlebacks are the author's own.
        if (BattleManager.isBattleTest()) return tried;
        // An encrypted project's pictures cannot be tried as plain images: the stock choice stands.
        if (typeof Utils.hasEncryptedImages === "function" && Utils.hasEncryptedImages()) return tried;
        const rule = Object.create(Sprite_Battleback.prototype);
        for (let index = 0; index < 2; index++) {
            if (!stockStageNames[index]) continue;
            // The map's own battlebacks are the author's: nothing to try.
            if ((index ? $gameMap.battleback2Name() : $gameMap.battleback1Name()) !== null) continue;
            // A choice that cannot be made away from its sprite (a plugin's own) is the battle scene's to make.
            let name = "";
            try { name = stockStageNames[index].call(rule); } catch (error) { name = ""; }
            if (!name) continue;
            // The picture is let go once it has answered.
            const entry = tried[index] = { name, state: PENDING, image: new Image() };
            const url = BATTLEBACK_FOLDERS[index] + Utils.encodeURI(name) + ".png";
            entry.image.onload = () => { entry.state = FOUND; entry.image = null; };
            entry.image.onerror = () => { entry.state = MISSING; entry.image = null; };
            entry.image.src = typeof Utils.resolveFileCase === "function" ? Utils.resolveFileCase(url, "") : url;
        }
        return tried;
    };

    /** Whether a tried picture has not answered yet and the wait for it is not over. */
    C.stagePending = function() {
        const stage = C._stage;
        if (!stage || frameNow() - stage.frame >= C.STAGE_WAIT) return false;
        const tried = stage.tried;
        return !!((tried[0] && tried[0].state === PENDING) || (tried[1] && tried[1].state === PENDING));
    };

    /** The battleback to show: `name`, or none where it is the stock picture tried for this battle and the project does not have it. */
    C.stageName = function(index, name) {
        const entry = C._stage ? C._stage.tried[index] : null;
        return entry && entry.name === name && entry.state === MISSING ? "" : name;
    };

    if (typeof Sprite_Battleback !== "undefined") {
        stockStageNames[0] = Sprite_Battleback.prototype.battleback1Name;
        stockStageNames[1] = Sprite_Battleback.prototype.battleback2Name;
        Sprite_Battleback.prototype.battleback1Name = function() {
            return C.stageName(0, stockStageNames[0].call(this));
        };
        Sprite_Battleback.prototype.battleback2Name = function() {
            return C.stageName(1, stockStageNames[1].call(this));
        };
    }

    if (typeof Scene_Map !== "undefined" && typeof Scene_Map.prototype.launchBattle === "function") {
        const launchBattle = Scene_Map.prototype.launchBattle;
        Scene_Map.prototype.launchBattle = function() {
            // A battle made here tried its stage as it started.
            if (!C._session && C.STAGE_EVERY_BATTLE) C.tryStage();
            launchBattle.call(this);
        };
        // Asked only while a scene change waits for the map scene.
        const isBusy = Scene_Map.prototype.isBusy;
        Scene_Map.prototype.isBusy = function() {
            return isBusy.call(this) || C.stagePending();
        };
    }

    //-------------------------------------------------------------------------
    // The result, taken when the battle ends.

    /** The battle's own word for its end (BattleManager's event callback). */
    C.onResult = function(result) {
        const session = C._session;
        if (!session || session.result >= 0) return;
        C.settle(session, result);
        if (session.onResult) session.onResult(session.result);
    };

    /** The result of a battle that ended without saying so, read from who is left: the party fallen, the troop fallen, or neither. */
    C.resultNow = function() {
        if ($gameParty.isAllDead()) return LOSE;
        return $gameTroop.isAllDead() ? WIN : ESCAPE;
    };

    /** Takes the result: after a win or an escape the members that fell are defeated units. */
    C.settle = function(session, result) {
        session.result = result === WIN || result === LOSE ? result : ESCAPE;
        for (const member of session.members) member.dead = !!(member.battler && member.battler.isDead());
        if (session.result === LOSE) return;
        for (const member of session.members) {
            if (member.dead) C.defeat(session.mapId, member);
        }
    };

    /**
     * A member that fell: its event leaves the map as Erase Event has it leave, and a row that is remembered
     * goes on the list of the defeated, so it stays gone when the map is entered again.
     */
    C.defeat = function(mapId, member) {
        const event = $gameMap.mapId() === mapId ? $gameMap.event(member.eventId) : null;
        if (event && !event._erased) event.erase();
        if (!member.remembered) return;
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        if (!fight) return;
        if (typeof fight.setEventDefeated === "function") {
            fight.setEventDefeated(member.eventId, true, mapId);
        } else {
            if (!fight._fallen) fight._fallen = {};
            fight._fallen[mapId + "," + member.eventId] = true;
        }
    };

    //-------------------------------------------------------------------------
    // When the battle scene has ended: the made troop goes.

    /** Whether the battle scene is left for a scene that returns to it (one pushed over it): the battle goes on. */
    C.comesBack = function(scene) {
        const stack = typeof SceneManager !== "undefined" && SceneManager ? SceneManager._stack : null;
        return !!(stack && scene && stack.includes(scene.constructor));
    };

    /** Takes the made record out of $dataTroops: off the end of the list, or its place left empty when another record stands after it. */
    C.removeRecord = function(session) {
        if ($dataTroops[session.troopId] !== session.record) return;
        if (session.troopId === $dataTroops.length - 1) $dataTroops.length = session.troopId;
        else $dataTroops[session.troopId] = null;
    };

    /**
     * Ends the battle made here. A battle that never gave its result has it read from who is left, and whoever
     * waits for it is told. The record leaves $dataTroops and $gameTroop is cleared (a save made from here on
     * holds no troop id past the list's end).
     */
    C.close = function() {
        const session = C._session;
        if (!session) return;
        C._session = null;
        if (session.result < 0) {
            C.settle(session, C.resultNow());
            if (session.onResult) session.onResult(session.result);
        }
        if ($gameTroop._troopId === session.troopId) {
            $gameTroop.onBattleEnd();
            $gameTroop.clear();
        }
        C.removeRecord(session);
    };

    /**
     * The battle screen is left for good, whoever opened it: a battle made here ends, the stage tried for it is
     * dropped, and the map starts no battle of its own until the leader has been out of every enemy's reach once.
     */
    C.leave = function() {
        C.close();
        C._stage = null;
        if (typeof $gameFight !== "undefined" && $gameFight) $gameFight._triggerHeld = true;
    };

    /**
     * Forgets a battle made here whose scene never ended: when the game is made anew (New Game, a loaded save),
     * and at the next start when its battle screen never opened. It had no result.
     */
    C.drop = function() {
        const session = C._session;
        C._session = null;
        C._stage = null;
        if (session) C.removeRecord(session);
    };

    if (typeof Scene_Battle !== "undefined" && typeof Scene_Battle.prototype.terminate === "function") {
        const terminate = Scene_Battle.prototype.terminate;
        Scene_Battle.prototype.terminate = function() {
            // Before the scene's own end, which makes the autosave and the playtest checkpoint.
            if (!C.comesBack(this)) C.leave();
            terminate.call(this);
        };
    }

    if (typeof DataManager !== "undefined" && typeof DataManager.createGameObjects === "function") {
        const createGameObjects = DataManager.createGameObjects;
        DataManager.createGameObjects = function() {
            C.drop();
            createGameObjects.call(this);
        };
    }
})(globalThis);
