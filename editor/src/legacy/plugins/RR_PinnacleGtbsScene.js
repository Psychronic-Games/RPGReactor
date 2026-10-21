/*:
 * @target MZ
 * @plugindesc GTBS battle scene (VX Ace): grid battles on the map, as Pinnacle plays them, for imported games
 * @author GubiD (GTBS 1.5.1.4) and the game's author; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 * @base RR_PinnacleGtbs
 * @orderAfter RR_PinnacleGtbsSprites
 *
 * @help RR_PinnacleGtbsScene.js
 *
 * Battle Processing starts a grid battle on the map: the screen dissolves
 * through the BattleStart pattern, the party is placed (on the PLACE tiles, or
 * where the ACTOR# events stand), the battle's goal is shown, and the turns
 * alternate: ALLY TURN, where the player picks a unit with the cursor and
 * moves it, attacks, uses a skill or item and chooses where it faces, then
 * ENEMY TURN, where the enemies (and allied AI units) act on their own.
 * Escape (or Esc on an empty tile) opens the options: End Turn, the animation
 * speed (Shift or this option fasts them), the goal, Escape/Surrender. A shows
 * a unit's details, D every enemy's reach. Damage, experience and gold pop up
 * over the units; items dropped are shown as they fall. The battle ends when
 * its goal is met (all enemies down, a tile reached, a boss down) or lost.
 *
 * Script calls (events running in battle reach the scene):
 *   SceneManager._scene.cursorMove(x, y) / .updateScreen() / .cursorMoveto(battler)
 *   SceneManager._scene.setCharacter(type, id, x, y[, anim, summon])
 *   SceneManager._scene.endBattle(result) / .disposeCharacter(battler)
 *   SceneManager._scene.activeBattler() / .tacticsAll() / .tacticsActors()
 *   RRGtbs.inBattle() — true while a grid battle runs.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 */
(() => {
    'use strict';
    const R = window.RRGtbs;
    if (!R) return;
    const { U, GT, text, rand, P } = R;
    const get = R.get, table = R.tableOf, list = R.listOf, idiv = R.idiv, V = R.V;
    const vtext = (name) => text(V[name] != null ? V[name] : name);

    const Turn_Player = 'player', Turn_Enemy = 'enemy';
    const Battler_Actor = 'actor', Battler_Enemy = 'enemy', Battler_Neutral = 'neutral';
    const HEAL_SCOPES = [7, 9, 11], ALL_TYPES = [2, 8, 10];

    // Shift, or the Anim option (1: enemy turns, 2: always), fasts walking and actions.
    R.goFast = () => {
        const anim = R.setting('anim');
        const sc = R.scene();
        const enemyTurn = !!(sc && sc.activeBattler() && sc.activeBattler().isEnemy());
        return Input.isPressed('shift') || anim === 2 || (anim === 1 && enemyTurn);
    };

    //=========================================================================
    // TBS_Cursor: where the player points, and what the current action reaches
    //=========================================================================
    class TBS_Cursor {
        constructor() {
            this.x = 0; this.y = 0;
            this.active = false;
            this.mode = null;
            this.targetArea = [];
            this.targetPositions = [];
            this.targets = [];
            this._range = [];
            this.forceVisible = false;
            this.lastX = 0; this.lastY = 0;
            this.targetNeedRefresh = false;
            this.reselectTargets = false;
            this._index = -1;
        }
        get range() { return this._range; }
        set range(r) { this._index = -1; this._range = r || []; }
        pos() { return [this.x, this.y]; }
        update() {
            if (!this.active) return false;
            let nx = this.x, ny = this.y;
            if (Input.isRepeated('right')) nx++;
            else if (Input.isRepeated('left')) nx--;
            else if (Input.isRepeated('down')) ny++;
            else if (Input.isRepeated('up')) ny--;
            if ((nx !== this.x || ny !== this.y) && $gameMap.isValid(nx, ny)) {
                this.moveto(nx, ny);
                SoundManager.playCursor();
                return true;
            }
            return false;
        }
        setMode(mode) {
            if (mode) this.active = true;
            else this.targetArea.length = 0;
            this.mode = mode;
        }
        moveto(pos, y) {
            this.lastX = this.x; this.lastY = this.y;
            if (pos == null) return;
            if (Array.isArray(pos)) { this.x = pos[0]; this.y = pos[1]; }
            else if (typeof pos === 'object') { this.x = pos.x; this.y = pos.y; }
            else { this.x = pos; this.y = y; }
            if (this.lastX !== this.x || this.lastY !== this.y) this.targetNeedRefresh = true;
        }
        movetoNext() {
            if (!this._range.length) return;
            const i = this._range.findIndex(p => p[0] === this.x && p[1] === this.y);
            if (i >= 0) this._index = i;
            this._index = (this._index + 1) % this._range.length;
            this.moveto(this._range[this._index]);
        }
        inRange() { return P.includes(this._range, [this.x, this.y]); }
        at(pos) {
            if (Array.isArray(pos)) return pos[0] === this.x && pos[1] === this.y;
            if (pos && typeof pos === 'object') return pos.x === this.x && pos.y === this.y;
            return false;
        }
        targetedBattlers() {
            const out = [];
            const sc = R.scene();
            if (!sc) return out;
            for (const b of sc.tacticsAll()) {
                if (b.tbsHidden()) continue;
                if (P.and(b.tbsPositions(), this.targetPositions).length) out.push(b);
            }
            return out;
        }
        setTargetPositions(positions) {
            this.targetNeedRefresh = true;
            this.reselectTargets = true;
            this.setTargets([]);
            this.targetPositions = positions;
        }
        consumeTargetRefresh() {
            if (this.targetNeedRefresh) { this.targetNeedRefresh = false; return true; }
            return false;
        }
        needTargetUpdate() { return this.targetArea.length > 0 && this.targetNeedRefresh; }
        setTargets(targets) {
            const same = targets.length === this.targets.length && targets.every((t, i) => t === this.targets[i]);
            if (!same) {
                for (const t of targets) t._tbsTargeted = [this.targetArea[0]];
                this.reselectTargets = true;
                this.targets = targets.slice();
            }
        }
        // The area an action hits around (x, y). The game's AoE kinds: 0 all around, 1 behind, 2 to the sides
        // (relative to where the active unit stands).
        calculateAoe(max, min, x = this.x, y = this.y, vAoe = 0) {
            if (max == null) return [];
            if (max === 0) return [[x, y]];
            let positions = [];
            const sc = R.scene();
            const active = sc && sc.activeBattler();
            for (let i = 0; i <= max; i++) {
                const it = max - i;
                const direction = active ? relativeDirection(active.tbsPos(), [x, y]) : 0;
                const backdir = direction, frontdir = 10 - direction;
                const sidedir = [2, 4, 6, 8].filter(d => d !== backdir && d !== frontdir);
                positions.push([x, y]);
                for (let oy = 0; oy <= i; oy++) {
                    if (it + oy < min) continue;
                    const all = [[x - it, y - oy], [x - it, y + oy], [x + it, y + oy], [x + it, y - oy]];
                    const dirPos = { 2: [[x, y + oy]], 4: [[x - oy, y]], 6: [[x + oy, y]], 8: [[x, y - oy]] };
                    if (vAoe === 0 || vAoe == null) positions = positions.concat(all);
                    if (direction !== 0) {
                        if (vAoe === 1) positions = positions.concat(dirPos[backdir]);
                        if (vAoe === 2) positions = positions.concat(dirPos[sidedir[0]], dirPos[sidedir[1]]);
                    }
                }
            }
            return positions.filter(p => p && $gameMap.isValid(p[0], p[1]));
        }
        updateTarget(battler, force = false) {
            if (this.needTargetUpdate()) {
                const positions = (force || this.inRange()) ? this.determineCursorArea(battler) : [];
                this.setTargetPositions(positions);
            }
        }
        determineCursorArea(battler) {
            const [line, exclude, field, vAoe] = this.targetArea.slice(1, 5);
            return battler.tbsTargetZone(battler.tbsPos(), this.pos(), [line, field, this.range, exclude, vAoe]);
        }
        distance(pos2) { return R.distance(this, pos2); }
    }
    const relativeDirection = (orig, targ) => {
        if (targ[0] > orig[0]) return 6;
        if (targ[1] > orig[1]) return 2;
        if (targ[0] < orig[0]) return 4;
        if (targ[1] < orig[1]) return 8;
        return 0;
    };
    window.TBS_Cursor = TBS_Cursor;
    R.cursor = () => (R.scene() ? R.scene()._cursor : R._cursor);
    R.calculateAoe = (field, min, x, y, vAoe) => R.cursor().calculateAoe(field, min, x, y, vAoe);
    R.pictureExists = (name) => {
        try {
            const fs = require('fs'), path = require('path');
            const base = path.dirname(process.mainModule.filename);
            return fs.existsSync(path.join(base, 'img', 'pictures', name + '.png'));
        } catch (_) { return true; }
    };

    //=========================================================================
    // Scene_Battle_TBS
    //=========================================================================
    function Scene_Battle_TBS() { this.initialize(...arguments); }
    Scene_Battle_TBS.prototype = Object.create(Scene_Message.prototype);
    Scene_Battle_TBS.prototype.constructor = Scene_Battle_TBS;
    window.Scene_Battle_TBS = Scene_Battle_TBS;
    const S = Scene_Battle_TBS.prototype;

    S.initialize = function() {
        Scene_Message.prototype.initialize.call(this);
        this._fiber = null;
        this._activeBattler = null;
        this._windows = {};
    };
    S.activeBattler = function() { return this._activeBattler; };
    S.miniShowing = function() { return false; };
    S.spriteset = function() { return this._spriteset; };

    //-------------------------------------------------------------------------
    // Start: the battle map, its units, the spriteset
    //-------------------------------------------------------------------------
    S.create = function() {
        Scene_Message.prototype.create.call(this);
        this._ATBActive = $gameSystem.tbsCustBattle() === 'ATB';
        $gameSystem.tbsClearBattlers();
        this._ending = false;
        this.setupMap();
        this.setupTempInfo();
        this.createEvents();
        this.createBattlers();
        this.createSpriteset();
        this.setupMiniSceneVariables();
        this.startCenter();
        this.setupVictoryFailEvents();
        R.makeMapshot($gameMap.mapId());
        this.createWindowLayer();
        this.createAllWindows();
        this.createGtbsWindows();
        this.createInfoLayer();
    };
    S.start = function() {
        Scene_Message.prototype.start.call(this);
        this._fiber = this.gMain();
    };
    S.update = function() {
        if (this._fiber) {
            try {
                const r = this._fiber.next();
                if (r.done) this._fiber = null;
            } catch (e) {
                this._fiber = null;
                throw e;
            }
        }
        Scene_Message.prototype.update.call(this);
    };
    S.isBusy = function() {
        return Scene_Message.prototype.isBusy.call(this);
    };
    S.terminate = function() {
        Scene_Message.prototype.terminate.call(this);
        for (const bat of this.tacticsAllies()) bat.tbsRecoverAfterBattle();
        $gameParty.tbsClearPositions();
        $gameSystem.tbsClearBattlers();
        R.clearMapshot();
    };
    S.setupMap = function() {
        this._mapId = $gameMap.mapId();
        const battleMapId = this.determineBattleMap(this._mapId);
        if (battleMapId !== $gameMap.mapId()) {
            // A battle on another map needs its data; the game's battles all stay where they start.
            this._mapId = $gameMap.mapId();
        }
        $gameMap.setup(this._mapId);
        this.createBattleEvents();
        this._deadActors = [];
    };
    S.determineBattleMap = function(mapId) {
        const regionId = $gamePlayer.regionId();
        const regions = table('MAP_Region_Transfer')[mapId];
        const tmap = regions ? regions[regionId] : undefined;
        if (tmap == null) mapId = GT.battleMap(mapId); else mapId = tmap;
        if ($gameTemp._tbsMapId != null && $gameTemp._tbsMapId > 0) mapId = $gameTemp._tbsMapId;
        $gameTemp._tbsMapId = 0;
        return mapId;
    };
    // The map's events by name: ACTOR#, ENEMY#, NEUTRAL# (where units start), PLACE (where the party may
    // be placed), BATTLE_EVENT (shown and run in battle), EXTRA (shown).
    S.createBattleEvents = function() {
        const enemyLoc = {}, actorLoc = {}, neuLoc = {}, placeLoc = [];
        this._extras = {};
        const types = ['actor', 'enemy', 'neutral', 'battle_event', 'extra', 'place'];
        for (const event of $gameMap.events()) {
            const name = event.event().name;
            if (name == null) continue;
            const lower = String(name).toLowerCase();
            types.forEach((type, i) => {
                if (!lower.includes(type)) return;
                // Ruby's String#delete removes each of the type's letters anywhere in the name.
                const letters = new Set(type);
                const id = parseInt([...lower].filter(ch => !letters.has(ch)).join(''), 10) || 0;
                if (i <= 2 && id === 0) return;
                if (i === 0) actorLoc[id] = event;
                else if (i === 1) enemyLoc[id] = event;
                else if (i === 2) neuLoc[id] = event;
                else if (i === 3) $gameSystem.tbsBattleEvents()[event.eventId()] = event;
                else if (i === 4) this._extras[event.eventId()] = event;
                else if (i === 5) placeLoc.push([event.x, event.y]);
            });
        }
        this._enemyLoc = enemyLoc; this._actorLoc = actorLoc; this._neuLoc = neuLoc; this._placeLoc = placeLoc;
    };
    S.gtbsEvents = function() { return Object.values($gameSystem.tbsBattleEvents()).concat(Object.values(this._extras)); };
    S.setupTempInfo = function() {
        R.battleStart();
        BattleManager._tbsFoeData = { actor: 'enemy', enemy: 'actor' };
        if ($gameTemp._tbsFoeData) {
            for (const [key, data] of Object.entries($gameTemp._tbsFoeData)) BattleManager._tbsFoeData[key] = data;
            $gameTemp._tbsFoeData = null;
        }
        this._cursor = new TBS_Cursor();
        R._cursor = this._cursor;
        this._waitCount = 0;
        this._showDmgPopInd = [];
        this._useSpell = [];
        this._expGained = [];
        this._counters = [];
        this._melee = true;
        this._targets = [];
        this._tempActed = 0;
        this._phaseCount = -1;
        this._commonEventQ = [];
        this._queuedForCollapse = [];
        this._setCharacterLater = [];
        this._battleExiting = null;
        this._escapeCooldown = 0;
        this._turn = null;
        this._drawn = false;
        this._selected = null;
        this._windows = {};
    };
    S.createEvents = function() { /* the start locations were read with the map's events */ };
    S.createBattlers = function() {
        const teamOf = (event) => { const m = /team\s*=\s*(.+)/.exec(R.eventNotes(event).toLowerCase()); return m ? m[1] : null; };
        if (get('ACTOR_PLACE_USES_INDEX', true)) {
            for (const battler of $gameParty.allMembers()) {
                battler.hide();
                const pos = this._actorLoc[battler.actorId()];
                if (pos) {
                    battler.tbsGtbsEntrance(pos.x, pos.y);
                    const team = teamOf(pos);
                    if (team) battler.tbsSetTeam(team);
                }
            }
        } else {
            for (const [key, pos] of Object.entries(this._actorLoc)) {
                const actor = $gameActors.actor(Number(key));
                if (actor) { actor.tbsGtbsEntrance(pos.x, pos.y); actor.animationId = 0; const team = teamOf(pos); if (team) actor.tbsSetTeam(team); }
            }
        }
        for (const battler of $gameTroop.members()) {
            battler.hide();
            const pos = this._enemyLoc[battler.index() + 1];
            if (pos) {
                battler.tbsGtbsEntrance(pos.x, pos.y);
                battler._letter = '';
                const team = teamOf(pos);
                if (team) battler.tbsSetTeam(team);
            }
        }
        for (const [key, pos] of Object.entries(this._neuLoc)) {
            const actor = $gameActors.actor(Number(key));
            if (actor) { actor.tbsGtbsEntrance(pos.x, pos.y, true); actor.animationId = 0; const team = teamOf(pos); if (team) actor.tbsSetTeam(team); }
        }
    };
    S.createSpriteset = function() {
        this._spriteset = new Spriteset_TBS(this);
        this.addChild(this._spriteset);
        this._spriteset.update();
    };
    S.createInfoLayer = function() {
        this._infoLayer = new Sprite();
        this.addChild(this._infoLayer);
    };
    S.addInfoSprite = function(sprite) { this._infoLayer.addChild(sprite); return sprite; };
    S.createCharacter = function(obj) { return this._spriteset.createCharacter(obj); };
    S.disposeCharacter = function(ch) { if (this._spriteset) this._spriteset.disposeCharacter(ch); };
    S.queueCollapse = function(ch) { if (!this._queuedForCollapse.includes(ch)) this._queuedForCollapse.push(ch); };
    S.setupMiniSceneVariables = function() { this._mini = false; this._miniShowing = false; };
    S.startCenter = function() {
        if (this._placeLoc.length > 0) { const [x, y] = this._placeLoc[0]; this._spriteset.cursor().center(x, y); }
        else if (Object.keys(this._actorLoc).length > 0) { const c = Object.values(this._actorLoc)[0]; this._spriteset.cursor().center(c.x, c.y); }
        else if (Object.keys(this._neuLoc).length > 0) { const c = Object.values(this._neuLoc)[0]; this._spriteset.cursor().center(c.x, c.y); }
        this._spriteset.update();
    };
    S.setupVictoryFailEvents = function() {
        const v = $gameTemp._tbsVictory || {}, f = $gameTemp._tbsFailure || {};
        if (v.condition != null) { this._vicCondition = v.condition; this._vicVal = v.val; this._vicCom = v.common; }
        if (f.condition != null) { this._failCondition = f.condition; this._failVal = f.val; this._failCom = f.common; }
        $gameTemp._tbsVictory = { condition: null, val: null, common: null };
        $gameTemp._tbsFailure = { condition: null, val: null, common: null };
    };
    S.createGtbsWindows = function() {
        const w = this._windows;
        w.help = new TBS_Window_Help(3);
        w.help.moveTo(2);
        this.addWindow(w.help);
        this.createCommandWindow();
        w.detail = new Window_Full_Status();
        w.status = new Windows_Status_GTBS();
        w.status.winHelp = w.help;
        w.confirm = new Command_Confirm();
        w.item = new TBS_Item(w.help);
        w.skill = new TBS_Skill(w.help);
        w.skill.height = idiv(Graphics.height, 2);
        w.option = new Battle_Option();
        w.minimap = new Window_Minimap();
        for (const k of ['status', 'confirm', 'item', 'skill', 'option', 'minimap', 'detail']) this.addWindow(w[k]);
        for (const win of Object.values(w)) {
            win.backOpacity = get('CONTROL_OPACITY', 230);
            win.visible = false;
            win.active = false;
        }
        for (const k of ['skill', 'item', 'actor']) w[k].setHelpWindow(w.help);
        this._messageWindow.backOpacity = get('CONTROL_OPACITY', 230);
        this._logWindow = new TBS_Window_BattleLog();
        this.addWindow(this._logWindow);
    };
    S.createCommandWindow = function() {
        const win = this._windows.actor = new Commands_All();
        win.y = 100;
        win.setHandler('move', this.actorMenuMove.bind(this));
        win.setHandler('attack', this.actorMenuAttack.bind(this));
        win.setHandler('wait', this.actorMenuWait.bind(this));
        win.setHandler('defend', this.actorMenuWait.bind(this));
        win.setHandler('skill', this.actorMenuSkill.bind(this));
        win.setHandler('item', this.actorMenuItem.bind(this));
        win.setHandler('cancel', this.actorMenuCancel.bind(this));
        this.addWindow(win);
        this.addWindow(win.actorDisplay());
    };
    S.waitingOnPlace = function() {
        if (get('Always_Allow_Place', true) && this._placeLoc.length > 0) return true;
        return this.tacticsActors().length === 0 && this._placeLoc.length > 0;
    };

    //-------------------------------------------------------------------------
    // The fiber: GTBS's blocking loops, a frame at each yield
    //-------------------------------------------------------------------------
    S.gMain = function* () {
        yield* this.gTransition();
        $gameTemp.pathfinderLocations = [];
        if (this.waitingOnPlace()) yield* this.gStartActorPlace();
        else this._placementDone = true;
        if (SceneManager.isSceneChanging()) return;
        this.faceEnemies();
        yield* this.gOpenScene();
        yield* this.gBattleStart();
        yield* this.gFinishPrep();
        while (!SceneManager.isSceneChanging()) yield* this.gUpdate();
    };
    // Graphics.transition(80, "Graphics/System/BattleStart", 80).
    S.gTransition = function* () {
        const sprite = new Sprite_TbsTransition(SceneManager.backgroundBitmap(), get('TRANSITION_IMAGE', 'BattleStart'), 80, 80);
        this.addChild(sprite);
        while (!sprite.isDone()) { sprite.updateTransition(); yield; }
        this.removeChild(sprite);
        sprite.destroy();
    };
    /** update_basic: a frame passes, then the troop, the map, the windows' visibility and the units update. */
    S.gUpdateBasic = function* () {
        yield;
        $gameMap.update(false);
        $gameScreen.update();
        $gameTimer.update(false);
        this.updateWinVisible();
        this.updateBattlers();
    };
    S.gWait = function* (duration, noFast = false) {
        for (let i = 0; i < duration; i++) {
            yield* this.gUpdateBasic();
            if (!noFast && i >= duration / 2 && this.showFast()) break;
        }
    };
    S.showFast = function() { return Input.isPressed('shift') || Input.isPressed('ok'); };
    S.gWaitForMessage = function* () {
        while ($gameMessage.isBusy()) yield* this.gUpdateBasic();
    };
    S.updateWinVisible = function() {
        this.updateSelected();
        const st = this._windows.status;
        if (!st) return;
        if (this._tbsProcessPhase) st.visible = false;
        else {
            if (this._turn !== Turn_Enemy) st.tbsUpdate(this._selected);
            if (this._showDmgPopInd.length !== 0) st.visible = true;
        }
    };
    S.updateBattlers = function() {
        for (const battler of this.tacticsAll()) battler.tbsUpdate();
        this.updateQueuedBattlers();
    };
    S.updateQueuedBattlers = function() {
        for (const battler of this._queuedForCollapse.slice()) {
            const sprite = this._spriteset.getBattlerSprite(battler);
            if (sprite && !(sprite.isEffecting() || sprite.isAnimationPlaying())) {
                this.disposeCharacter(battler);
                this._queuedForCollapse.splice(this._queuedForCollapse.indexOf(battler), 1);
                battler.hide();
            }
        }
    };
    S.gOpenScene = function* () {
        const id = $gameTemp._tbsOpenSceneEventId;
        if (id != null) {
            const interpreter = new Game_Interpreter();
            $gameTemp._tbsOpenSceneEventId = null;
            const event = $gameMap.event(id);
            interpreter.setup(event.list(), event.eventId());
            while (interpreter.isRunning()) {
                interpreter.update();
                yield* this.gUpdateBasic();
                yield* this.gWaitForMessage();
            }
        }
    };
    S.faceEnemies = function() {
        if (!get('FACE_ENEMY', true)) return;
        const actors = this.friendsOf(Battler_Actor), enemies = this.friendsOf(Battler_Enemy);
        for (const a of actors) a.tbsTurnTo(enemies[0]);
        for (const e of enemies) e.tbsTurnTo(actors[0]);
    };
    S.gFinishPrep = function* () {
        this._windows.help.hide();
        if (this._ATBActive) this.setupStartAtb();
        else yield* this.gChooseTeamStart();
    };
    S.gChooseTeamStart = function* () {
        let team = Turn_Player;
        if ($gameTemp._tbsTurnStart != null) { team = $gameTemp._tbsTurnStart; $gameTemp._tbsTurnStart = null; }
        yield* this.gSetTurn(team);
    };
    // The phase banner: the turn's ribbon and its music; the map goes on behind it.
    S.gSetTurn = function* (team) {
        this._turn = team;
        this._spriteset.update();
        this.changeMusic(this._turn);
        const phase = this.addInfoSprite(new TBS_Phase_Sprite(this._turn));
        while (!phase.isDisposed()) {
            yield;
            $gameMap.update(false);
            $gameScreen.update();
            phase.updateInfo();
        }
        this._infoLayer.removeChild(phase);
    };
    S.changeMusic = function(turn = Turn_Player, placing = false) {
        if (!get('PHASE_MUSIC', true)) return;
        const name = placing ? GT.placingMusic() : turn === Turn_Player ? GT.actorPhaseMusic() : GT.enemyPhaseMusic();
        AudioManager.playBgm({ name, volume: 100, pitch: 100, pan: 0 });
    };
    S.setupStartAtb = function() {
        for (const b of $gameParty.tbsExistingMembers().concat($gameTroop.tbsExistingMembers())) b.tbsSetupAtb(rand(100));
    };
    S.gBattleStart = function* (inBattle = false) {
        if (this._windows.help) this._windows.help.visible = false;
        const sprite = this.addInfoSprite(new TBS_Battle_Start_Sprite(this._vicCondition, this._failCondition, this._vicVal, this._failVal, inBattle, ''));
        yield* this.gShowTbsInfoSprite(sprite);
    };
    S.gShowTbsInfoSprite = function* (sprite) {
        if (!sprite.parent) this.addInfoSprite(sprite);
        while (!sprite.isDisposed()) {
            yield* this.gUpdateBasic();
            sprite.updateInfo();
        }
        if (sprite.parent) sprite.parent.removeChild(sprite);
    };

    //-------------------------------------------------------------------------
    // Units
    //-------------------------------------------------------------------------
    S.tacticsActors = function() { return $gameParty.tbsExistingMembers(); };
    S.tacticsEnemies = function() { return $gameTroop.tbsExistingMembers(); };
    S.tacticsNeutral = function() { return $gameParty.tbsNeutrals(); };
    S.tacticsAllies = function() { return this.tacticsActors().concat(this.tacticsNeutral()); };
    S.tacticsAll = function() { return this.tacticsAllies().concat(this.tacticsEnemies(), this.tacticsDead()); };
    S.tacticsAlive = function() { return this.tacticsAllies().concat(this.tacticsEnemies()).filter(m => !m.isDeathStateAffected()); };
    S.tacticsDead = function() {
        return $gameTroop.tbsDeadMembers().concat($gameParty.tbsDeadMembers(), this.tacticsNeutral().filter(m => m.isDeathStateAffected()));
    };
    // FriendOrFoe: the foe table holds a team's foes as text (Ruby's include? on a String: a substring test).
    S.opponentsOf = function(obj) {
        const key = obj instanceof Game_Battler ? obj.tbsTeam() : obj;
        const foes = (BattleManager._tbsFoeData || {})[key];
        if (foes == null) return [];
        return this.tacticsAll().filter(m => (Array.isArray(foes) ? foes.includes(m.tbsTeam()) : String(foes).includes(m.tbsTeam())));
    };
    S.friendsOf = function(obj) {
        const key = obj instanceof Game_Battler ? obj.tbsTeam() : obj;
        if (key == null) return [];
        return this.tacticsAll().filter(m => m.tbsTeam() === key);
    };
    S.deadFriendsOf = function(battler) { return this.tacticsDead().filter(m => m.tbsTeam() === battler.tbsTeam()); };
    S.occupiedBy = function(x = this._cursor.x, y = this._cursor.y) { return R.occupiedBy(x, y); };
    S.clearTrSprites = function() { this._spriteset.disposeTileSprites(); this.clearRSprites(); };
    S.clearRSprites = function() { this._cursor.setTargetPositions([]); };

    //-------------------------------------------------------------------------
    // The frame (Scene_Battle_TBS#update)
    //-------------------------------------------------------------------------
    S.gUpdate = function* () {
        if (SceneManager.isSceneChanging()) return;
        yield* this.gUpdateBasic();
        this.updateCursorVisibility();
        $gameTroop.setupBattleEvent();
        this.updateBattleEvent();
        yield* this.gWaitForMessage();
        if (yield* this.gUpdateProcesses()) return;
        const interp = $gameTroop._interpreter;
        if (this._battleExiting == null) {
            if (this.checkAbort()) return;
            if (!interp.isRunning()) yield* this.gUpdatePhase();
            if (!interp.isRunning()) {
                const w = this._windows;
                if (this._activeBattler && this._activeBattler.tbsAiControlled()) yield* this.gUpdateAiUnit();
                else if (this._waitPic) yield* this.gActorWaitPhase();
                else if (w.detail.active) this.updateWindowDetail();
                else if (w.item.active) this.updateWindowItem();
                else if (w.skill.active) this.updateWindowSkill();
                else if (w.actor.active) this.updateActorMenu();
                else if (w.option.active) yield* this.gUpdBattleOption();
                else if (w.confirm.active) yield* this.gWinConfirmUpdate();
                else if (this._cursor.active) yield* this.gCursorActiveSelection();
                else if (this._activeBattler) this.deactivateBattler();
            }
            if (!$gameMessage.isBusy()) yield* this.gJudgeWinLoss();
        } else {
            yield* this.gProcessAtb();
            yield* this.gResultPhase();
        }
        this.updateTransfer();
    };
    S.updateScreen = function() {
        if (this._spriteset.isAnimationPlaying()) return true;
        if (R.updateGtbsScroll(this._cursor.x, this._cursor.y) && !this._cursor.active) return true;
        return false;
    };
    S.updateCursorVisibility = function() {
        this._cursor.forceVisible = this.forceCursor();
        this._spriteset.cursor().updateVis();
    };
    S.forceCursor = function() {
        const w = this._windows;
        if (this._ending || this._turn === Turn_Enemy) return false;
        if (w.item.active || w.skill.active || w.detail.active) return false;
        return $gameParty.inBattle();
    };
    S.gCursorActiveSelection = function* () {
        this._cursor.update();
        this.updateCursorVisibility();
        this.updateTargetCursor();
        switch (this._cursor.mode) {
            case 'item': yield* this.gUpdateCursorItem(); break;
            case 'skill': yield* this.gUpdateCursorSkill(); break;
            case 'attack': this.cursorUseAttack(); break;
            case 'move': yield* this.gCursorUseMove(); break;
            default: yield* this.gCursorNoSelect(); break;
        }
    };
    S.updateTargetCursor = function() { this._cursor.updateTarget(this._activeBattler, this._usingSkill); };
    // Battle events: the troop's pages and the map's BATTLE_EVENT events.
    S.updateBattleEvent = function() {
        const interp = $gameTroop._interpreter;
        interp.update();
        if (interp.isRunning()) {
            interp.update();
            interp.update();
            if (!interp.isRunning()) $gameTroop.setupBattleEvent();
        } else {
            for (const event of Object.values($gameSystem.tbsBattleEvents())) event.update();
        }
    };
    S.gUpdateProcesses = function* () {
        if (this.setLater()) return true;
        if (yield* this.gUsingSkill()) return true;
        if (yield* this.gGainingExp()) return true;
        if (this.updateScreen()) return true;
        return false;
    };
    S.setLater = function() {
        if (this._setCharacterLater.length > 0 && !this._miniShowing) this.setCharacter(...this._setCharacterLater.shift());
        return false;
    };
    S.gUsingSkill = function* () {
        if (this._useSpell.length === 0 || this._usingSkill) return false;
        return false;
    };
    S.playSoundLevelup = function() {
        const se = get('LEVEL_GAIN_SE', '');
        if (se) AudioManager.playSe({ name: se, volume: 80, pitch: 100, pan: 0 });
    };
    // Experience: the actor that acted gains it for its targets; it pops up over the unit.
    S.gGainingExp = function* () {
        if (this._expGained.length === 0) return false;
        const [, battler, targets] = this._expGained.shift();
        if (!(battler && battler.tbsTeam() === Battler_Actor && battler.isActor())) return false;
        this._windows.help.hide();
        const exp = battler.tbsCalculateExp(targets);
        if (exp === 0) return false;
        const lev = new Map();
        this.applyGainExp(battler, exp, lev);
        if (lev.size > 0) {
            const win = this._windows.earned = new Window_EXP_Earn(battler, lev);
            this.addWindow(win);
            win.visible = true; win.active = true;
            this.playSoundLevelup();
            while (this._windows.earned) {
                yield* this.gUpdateBasic();
                this.updateExpWindow();
            }
        }
        yield* this.gWait(get('EXP_WAIT_TIME', 30));
        return true;
    };
    S.applyGainExp = function(battler, exp, lev) {
        const plev = battler.level;
        if (!get('POP_EXP', true)) this._logWindow.showExpGain(battler, exp * battler.finalExpRate());
        battler.gainExp(exp);
        if (get('POP_EXP', true)) {
            battler.result().expGainAmt = R.sprintf(V.POP_Gain_Exp || '%d exp', exp * battler.finalExpRate());
            battler.rrDamageFlag();
        } else if (battler.level > plev) {
            lev.set(battler, [plev, battler.level]);
        }
    };
    S.updateExpWindow = function() {
        const win = this._windows.earned;
        if (Input.isTriggered('cancel') || Input.isTriggered('ok')) {
            SoundManager.playOk();
            win.active = false; win.visible = false;
            this._windowLayer.removeChild(win);
            delete this._windows.earned;
        }
    };
    S.disableCursor = function(remainActive = false) {
        this._cursor.active = remainActive;
        this._cursor.setMode(null);
    };
    S.gUpdateCursorItem = function* () {
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.disableCursor();
            this._windows.status.hide();
            this.openItemWindow();
            this.clearTrSprites();
        } else if (Input.isTriggered('ok')) {
            if (this._cursor.inRange()) this.validItem();
            else SoundManager.playBuzzer();
        }
    };
    S.gUpdateCursorSkill = function* () {
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this._windows.status.clearDmgPreview();
            this.disableCursor();
            this._spell = null;
            this._cursor.active = false;
            this.clearTrSprites();
            this.openSkillWindow();
        } else if (Input.isTriggered('ok')) {
            if (this._cursor.inRange()) this.validSkill();
            else SoundManager.playBuzzer();
        }
    };
    S.actorMenuOpen = function() {
        const w = this._windows.actor;
        w.activate();
        w.clearHelp();
        w.callUpdateHelp();
    };
    S.cursorUseAttack = function() {
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.disableCursor();
            this.clearTrSprites();
            this.actorMenuOpen();
        } else if (Input.isTriggered('ok')) {
            if (this._cursor.inRange()) {
                this._activeBattler.currentAction().setAttack();
                this._targets = this.getTargets();
                if (this._targets.length > 0) {
                    this._cursor.active = false;
                    this._windows.status.dmgPreview(1, this._activeBattler, this._targets);
                    this._windows.confirm.ask('attack');
                    SoundManager.playOk();
                } else SoundManager.playBuzzer();
            } else SoundManager.playBuzzer();
        }
    };
    S.gCursorUseMove = function* () {
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.actorMenuOpen();
            this.disableCursor();
            this.clearTrSprites();
            return true;
        } else if (Input.isTriggered('ok')) {
            const occ = this.occupiedBy();
            if (this._cursor.inRange() && (occ == null || occ === this._activeBattler)) {
                SoundManager.playOk();
                const b = this._activeBattler;
                this._preX = b.x; this._preY = b.y;
                this._oldX = b.x; this._oldY = b.y;
                if (!b.tbsCanTeleport()) {
                    b.tbsRunRoute(R.routeOf(this._route, this._cursor.pos()));
                    b._tbsCostForMove = R.costOf(this._cost, this._cursor.pos());
                }
                this._drawn = false;
                for (;;) {
                    yield* this.gUpdateBasic();
                    if (!b.tbsMoving() && !(b._tbsPath && b._tbsPath.length)) break;
                }
                this._windows.confirm.ask('move', (b._tbsCostForMove || 0) * get('REQUIRED_TP_FOR_MOVE', 0), TextManager.tp);
                return true;
            }
            SoundManager.playBuzzer();
            return false;
        }
        return undefined;
    };
    // Nothing selected: Esc shows a unit's reach (again: its details), or the options on an empty tile;
    // D shows every enemy's reach; Enter picks a unit to act.
    S.gCursorNoSelect = function* () {
        if (Input.isTriggered('cancel')) {
            this.checkArea();
            return true;
        } else if (Input.isTriggered('rgssZ')) {
            if (this._drawn) { this.clearTrSprites(); this._drawn = false; }
            else {
                for (const b of this.tacticsAll().filter(m => m.tbsTeam() === 'enemy' && m.isAlive())) this.drawRanges(b, 1, true);
                this._drawn = true;
            }
        } else if (Input.isTriggered('ok')) {
            this.clearTrSprites();
            if (this._ATBActive) this.atbPressValid();
            else yield* this.gTeamModePressValid();
            return true;
        }
        return undefined;
    };
    S.updateSelected = function() {
        if (this._battleExiting != null) { this._selected = null; return; }
        if (this._selected == null || !R.atXy(this._selected, this._cursor.x, this._cursor.y)) {
            this._selected = null;
            const battler = R.occupiedBy(this._cursor.x, this._cursor.y);
            if (battler) {
                this._selected = battler;
                const st = this._windows.status;
                if (!st) return;
                if (!(this._turn === Turn_Enemy && battler !== this._activeBattler)) st.tbsUpdate(battler);
                const cur = this._spriteset.cursor();
                const mx = Graphics.width - st.width, mw = Graphics.width, my = 0, mv = st.height;
                if (cur.x >= mx && cur.x <= mw && cur.y >= my && cur.y <= mv) st.moveTo(3);
                else st.moveTo(9);
            }
        }
    };
    S.checkAbort = function() { return BattleManager.isAborting(); };
    S.gUpdatePhase = function* () {
        if (this._ATBActive) return;
        yield* this.gCheckTurn();
        yield* this.gCheckPhase();
        if (idiv(this._phaseCount, 2) >= this.tbsTurnCount()) yield* this.gTbsIncreaseTurn();
    };
    S.gCheckPhase = function* () {
        const acted = $gameSystem.tbsActed();
        if (this._turn === Turn_Player) {
            const alive = this.friendsOf(Battler_Actor).filter(m => !m.isDeathStateAffected());
            $gameVariables.setValue(11, alive);
            if (acted.length >= alive.length) {
                this._phaseCount++;
                if (this._activeBattler == null) {
                    acted.length = 0;
                    yield* this.gSetTurn(Turn_Enemy);
                    yield* this.gNextEnemy();
                }
            }
        } else if (this._turn === Turn_Enemy) {
            if (acted.length >= this.friendsOf(Battler_Enemy).filter(m => !m.isDeathStateAffected()).length) {
                if (this._phaseCount % 2 === 0) this._phaseCount++;
                if (this._activeBattler == null) {
                    acted.length = 0;
                    yield* this.gSetTurn(Turn_Player);
                    const actors = this.friendsOf(Battler_Actor).filter(m => !m.isDeathStateAffected());
                    if (actors.length) actors[rand(actors.length)].affection += 1;
                    for (const actor of actors) {
                        if (!actor.canMove()) { acted.push(actor); actor.onTurnEnd(); }
                    }
                    this._cursor.moveto(this.tacticsActors()[0]);
                }
            }
        }
    };
    S.gCheckTurn = function* () {
        if (this._turn === Turn_Enemy) yield* this.gNextEnemy();
        else if (this._turn === Turn_Player) yield* this.gNextActor();
    };
    // The next enemy (and any unit not of the player's team) that has not acted; state 53 lets one act again.
    S.gNextEnemy = function* () {
        if (this._activeBattler != null) return;
        if (yield* this.gProcessForcedAction()) return;
        const acted = $gameSystem.tbsActed();
        for (const battler of this.tacticsAll()) {
            if (battler.tbsTeam() === Battler_Actor) continue;
            if (battler.isStateAffected(53) && !battler._tbsUsedRapid) { const i = acted.indexOf(battler); if (i >= 0) acted.splice(i, 1); }
            if (acted.includes(battler)) continue;
            if (battler.isDeathStateAffected()) continue;
            battler.removeState(53);
            yield* this.gSetActiveBattler(battler);
            return;
        }
    };
    S.gNextActor = function* () {
        if (this._activeBattler != null) return;
        if (yield* this.gProcessForcedAction()) return;
        const acted = $gameSystem.tbsActed();
        for (const battler of this.tacticsAll()) {
            if (battler.tbsTeam() !== Battler_Actor) continue;
            if (acted.includes(battler)) continue;
            if (!battler.tbsAiControlled()) continue;
            if (battler.isDeathStateAffected()) continue;
            yield* this.gSetActiveBattler(battler);
            return;
        }
        if (this._activeBattler == null && this._cursor.active === false) {
            this.disableCursor(true);
            const battler = this.tacticsAllies().find(b => !acted.includes(b));
            if (battler) { this._cursor.moveto(battler.tbsPos()); this.cursorMoved(); }
        }
    };
    S.cursorMoved = function() {};
    S.gTbsIncreaseTurn = function* () {
        $gameTroop.increaseTurn();
        BattleManager._phase = 'turnEnd';
        yield* this.gProcessBattleEvent();
        BattleManager._phase = 'turn';
        this._escapeCooldown = Math.max(0, this._escapeCooldown - 1);
    };
    S.tbsTurnCount = function() { return $gameTroop.turnCount(); };
    S.gProcessAtb = function* () {
        // Team battles never have a unit waiting when this runs at the battle's end.
    };
    S.gSetActiveBattler = function* (battler, forcing = false) {
        this.clearTrSprites();
        this._activeBattler = battler;
        this.playSelectActiveSound();
        this.setActiveCursor();
        this._spell = null;
        this._item = null;
        if (battler.isDeathStateAffected()) { this._activeBattler = null; return; }
        battler.tbsStartTurn();
        this.disablePlayerControl();
        if (battler.tbsAiControlled()) {
            while (this.updateScreen()) yield* this.gUpdateBasic();
            yield* this.gUpdateAI(forcing);
        } else {
            this._windows.actor.setup(battler);
            if (get('ENABLE_MOVE_START', false) && !battler.tbsMovedQ()) this.activeCursorMove();
        }
    };
    S.deactivateBattler = function() {
        if (this._ATBActive) this._tempActed++;
        else $gameSystem.tbsActed().push(this._activeBattler);
        this._activeBattler.onTurnEnd();
        this._activeBattler = null;
        this.disablePlayerControl();
    };
    S.disablePlayerControl = function() {
        this._windows.actor.active = false;
        this._cursor.setMode(null);
        this._cursor.active = false;
    };
    S.playSelectActiveSound = function() {
        if (R.seExists('SelectActive')) AudioManager.playSe({ name: 'SelectActive', volume: 100, pitch: 100, pan: 0 });
    };
    S.setActiveCursor = function() {
        if (!this._cursor.at(this._activeBattler)) {
            this._cursor.moveto(this._activeBattler);
            this.updateSelected();
        }
    };

    //-------------------------------------------------------------------------
    // The command window
    //-------------------------------------------------------------------------
    S.actorMenuAttack = function() {
        this._cursor.range = this.drawRanges(this._activeBattler, 7);
        this.updateTargetCursor();
        this._cursor.setMode('attack');
        this._windows.actor.active = false;
        this._windows.actor.visible = false;
    };
    S.actorMenuSkill = function() {
        this._windows.actor.deactivate();
        this._windows.actor.hide();
        this.openSkillWindow();
    };
    S.actorMenuWait = function() {
        const b = this._activeBattler;
        if (get('WAIT_CONFIRM', true)) {
            let msg;
            if (!b.tbsMovedQ()) msg = !b.tbsPerfactionQ() ? vtext('Do_Not_Move_Or_Attack') : vtext('Do_Not_Move');
            else if (!b.tbsPerfactionQ()) msg = vtext('Do_Not_Attack');
            else { this.activateWaitPhase(); return; }
            this._windows.confirm.ask('wait', msg);
            this._windows.actor.active = false;
            this._windows.actor.visible = false;
        } else {
            this.activateWaitPhase();
        }
    };
    S.actorMenuItem = function() {
        this._windows.actor.deactivate();
        this._windows.actor.hide();
        this.openItemWindow();
    };
    S.actorMenuMove = function() { this.activeCursorMove(); };
    S.actorMenuCancel = function() {
        const b = this._activeBattler;
        if (b._tbsMoved && !b._tbsUsedRapid) {
            this.actorCancelMove();
            this.disableCursor(true);
        } else {
            this._windows.actor.deactivate();
            this._windows.actor.hide();
            this._windows.help.hide();
            this.disableCursor(true);
        }
    };
    S.updateActorMenu = function() {
        const b = this._activeBattler, w = this._windows.actor;
        if (b == null) { w.deactivate(); return; }
        if (b.isDeathStateAffected()) { this.deactivateBattler(); w.deactivate(); return; }
        if (get('Force_Wait', true) && b.tbsPerfactionQ() && b.tbsMovedQ() && !b._tbsExtraMove) { this.activateWaitPhase(); return; }
        w.visible = true;
        w.tbsUpdate();
        this.setActiveCursor();
        this._windows.status.visible = true;
    };
    S.updateWindowSkill = function() {
        const w = this._windows;
        w.skill.tbsUpdate();
        w.status.hide();
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.closeWindowSkill();
            this.actorMenuOpen();
        } else if (Input.isTriggered('ok')) {
            this._spell = w.skill.item();
            if (this._spell && this._activeBattler.tbsSkillCanUse(this._spell)) {
                SoundManager.playOk();
                this._activeBattler.currentAction().setSkill(this._spell.id);
                this.closeWindowSkill();
                this._cursor.range = this.drawRanges(this._activeBattler, 5);
                this.updateTargetCursor();
                this._cursor.setMode('skill');
            } else {
                this._spell = null;
                SoundManager.playBuzzer();
            }
        }
    };
    S.closeWindowSkill = function() {
        const w = this._windows;
        w.skill.deactivate();
        w.skill.hide();
        w.skill.select(-1);
        w.help.moveTo(2);
    };
    S.updateWindowItem = function() {
        const w = this._windows;
        w.item.tbsUpdate();
        w.status.hide();
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            w.item.deactivate();
            w.item.hide();
            this.actorMenuOpen();
            w.help.moveTo(2);
        } else if (Input.isTriggered('ok')) {
            this._item = w.item.item();
            if ($gameParty.canUse(this._item)) {
                SoundManager.playOk();
                this._activeBattler.currentAction().setItem(this._item.id);
                this._cursor.range = this.drawRanges(this._activeBattler, 8);
                this.updateTargetCursor();
                this._cursor.setMode('item');
                w.item.deactivate();
                w.item.hide();
            } else {
                this._item = null;
                SoundManager.playBuzzer();
            }
        }
    };
    S.updateWindowDetail = function() {
        const w = this._windows;
        w.status.hide();
        w.detail.tbsUpdate();
        if (Input.isTriggered('cancel') || Input.isTriggered('ok')) {
            SoundManager.playCancel();
            w.detail.active = false;
            w.detail.visible = false;
            if (!this._cursor.active) this.actorMenuOpen();
        }
    };

    //-------------------------------------------------------------------------
    // Victory and defeat
    //-------------------------------------------------------------------------
    S.checkVictoryConditions = function() {
        switch (this._vicCondition) {
            case null: case undefined:
                if (this.friendsOf(Battler_Enemy).filter(m => !m.isDeathStateAffected()).length === 0) this.addVicCom();
                break;
            case 'reach':
                for (const b of this.friendsOf(Battler_Actor)) if (b.x === this._vicVal[0] && b.y === this._vicVal[1]) { this.addVicCom(); break; }
                break;
            case 'boss': {
                const down = this.friendsOf(Battler_Enemy).some(b => b._enemyId === this._vicVal && b.isDeathStateAffected());
                if (down) this.addVicCom();
                break;
            }
            case 'exterminate': {
                const present = this.friendsOf(Battler_Enemy).some(b => b._enemyId === this._vicVal && !b.isDeathStateAffected());
                if (!present) this.addVicCom();
                break;
            }
            case 'holdout':
                if (this.tbsTurnCount() === this._vicVal) this.addVicCom();
                break;
            case 'critical_actor': {
                const actor = $gameActors.actor(this._vicVal[0]);
                if (this._vicVal[1] != null && actor.hp / actor.mhp * 100 <= this._vicVal[1]) this.addVicCom();
                break;
            }
            default: break;
        }
    };
    S.checkFailureConditions = function() {
        if (this._failCondition === 'holdout') {
            if (this.tbsTurnCount() > this._failVal) this.addFailCom();
        } else if (this._failCondition === 'death') {
            if (this.tacticsDead().includes($gameActors.actor(this._failVal))) this.addFailCom();
        }
    };
    S.gJudgeWinLoss = function* () {
        if ((yield* this.gUpdateProcesses()) || this._spriteset.isEffecting()) return undefined;
        this.checkVictoryConditions();
        this.checkFailureConditions();
        if (this.friendsOf(Battler_Actor).filter(m => !m.isDeathStateAffected()).length === 0) this.addFailCom();
        return this.updateEventQueue();
    };
    S.addVicCom = function() {
        const ce = $dataCommonEvents;
        if (this._vicCom != null && ce[this._vicCom]) this._commonEventQ = this._commonEventQ.concat(ce[this._vicCom].list);
        if (ce[get('VIC_COM', 2)]) this._commonEventQ = this._commonEventQ.concat(ce[get('VIC_COM', 2)].list);
        this.endBattle(0);
    };
    S.addFailCom = function() {
        const ce = $dataCommonEvents;
        if (this._failCom != null && ce[this._failCom]) this._commonEventQ = this._commonEventQ.concat(ce[this._failCom].list);
        if (ce[get('FAIL_COM', 1)] && BattleManager.canLose()) this._commonEventQ = this._commonEventQ.concat(ce[get('FAIL_COM', 1)].list);
        this.endBattle(2);
    };
    S.updateEventQueue = function() {
        if (this._commonEventQ.length > 0) {
            if (!$gameTroop._interpreter.isRunning()) {
                $gameTroop._interpreter.setup(this._commonEventQ.filter(c => c.code !== 0).concat([{ code: 0, indent: 0, parameters: [] }]), 0);
                this._commonEventQ = [];
            }
            return true;
        }
        return false;
    };
    S.updateTransfer = function() {
        if (!$gamePlayer.isTransferring()) return;
        this.endBattle(1);
        this.exitBattle();
    };
    S.confirmSurrender = function() { this.endBattle(2); };
    S.confirmEscape = function() { this.endBattle(1); };

    //-------------------------------------------------------------------------
    // The confirmation window
    //-------------------------------------------------------------------------
    S.gWinConfirmUpdate = function* () {
        const w = this._windows;
        w.confirm.tbsUpdate();
        w.help.hide();
        switch (w.confirm.question()) {
            case 'move': {
                this.showRangeAfterMove();
                const a = this.confirmTrigger();
                if (a === 0) this.confirmMove(); else if (a === 1) this.cancelMove();
                break;
            }
            case 'surrender': { const a = this.confirmTrigger(); if (a === 0) this.confirmSurrender(); else if (a === 1) this.closeConfirmWindow(); break; }
            case 'escape': { const a = this.confirmTrigger(); if (a === 0) this.confirmEscape(); else if (a === 1) this.closeConfirmWindow(); break; }
            case 'attack': { const a = this.confirmTrigger(); if (a === 0) yield* this.gConfirmAttack(); else if (a === 1) this.cancelAttack(); break; }
            case 'skill': { const a = this.confirmTrigger(); if (a === 0) yield* this.gConfirmSkill(); else if (a === 1) this.cancelSkill(); break; }
            case 'item': { const a = this.confirmTrigger(); if (a === 0) yield* this.gConfirmItem(); else if (a === 1) this.cancelItem(); break; }
            case 'wait': {
                const a = this.confirmTrigger();
                if (a === 0) { this.activateWaitPhase(); w.actor.active = false; }
                else if (a === 1) this.actorMenuOpen();
                break;
            }
            case 'place': {
                const a = this.confirmTrigger();
                if (a === 0) {
                    this.closeConfirmWindow();
                    this._cursor.active = false;
                    w.status.visible = false;
                    w.status.tbsUpdate();
                    this.clearTrSprites();
                    return true;
                } else if (a === 1) {
                    this.closeConfirmWindow();
                    this._cursor.active = true;
                    return null;
                }
                break;
            }
            default: break;
        }
        return undefined;
    };
    S.closeConfirmWindow = function() {
        const w = this._windows;
        w.confirm.active = false;
        w.confirm.visible = false;
        w.status.clearDmgPreview();
        w.confirm.resetCommands();
    };
    S.confirmTrigger = function(sound = true) {
        let answer;
        if (Input.isTriggered('ok')) { if (sound) SoundManager.playOk(); answer = this._windows.confirm.tbsIndex(); }
        else if (Input.isTriggered('cancel')) { if (sound) SoundManager.playCancel(); answer = 1; }
        if (answer != null) {
            this.closeConfirmWindow();
            this._windows.confirm.select(-1);
        }
        return answer;
    };
    S.atbPressValid = function() {
        if (this._selected === this._activeBattler) { this.actorMenuOpen(); this.disableCursor(); }
        else { SoundManager.playOk(); this.setActiveCursor(); }
    };
    S.gTeamModePressValid = function* () {
        const acted = $gameSystem.tbsActed();
        if (this._selected != null && this._selected.tbsTeam() === Battler_Actor && !acted.includes(this._selected)) {
            yield* this.gSetActiveBattler(this._selected);
        } else if (this._selected == null) {
            for (const actor of this.tacticsAll()) {
                if (actor.tbsTeam() !== Battler_Actor || acted.includes(actor)) continue;
                this._cursor.moveto(actor);
                this.cursorMoved();
                return;
            }
        }
    };
    // Facing at the end of a unit's turn: the arrows over it turn it; Enter ends its turn.
    S.gActorWaitPhase = function* () {
        this._waitPic.updateWait();
        if (Input.isTriggered('cancel')) {
            this._activeBattler.tbsSetDirection(this._waitPic.initialDir());
            this.exitWaitPhase();
            this.actorMenuOpen();
        } else if (Input.isTriggered('ok')) {
            this._activeBattler.tbsSetWait();
            this.checkBateventTrigger();
            this.deactivateBattler();
            this.exitWaitPhase();
            if (!this._ATBActive) yield* this.gNextActor();
        }
    };
    S.activateWaitPhase = function() {
        const w = this._windows;
        this._cursor.active = false;
        w.help.hide();
        w.actor.active = false;
        w.actor.visible = false;
        if (!this._waitPic) {
            this._waitPic = this._spriteset.createWaitCursor(this._activeBattler);
            this._tempDir = this._activeBattler.tbsDirection();
        }
    };
    S.exitWaitPhase = function() {
        this._spriteset.removeWaitCursor(this._waitPic);
        this._waitPic = null;
        this._windows.help.hide();
    };
    // Esc on the map: a unit's reach (Esc again: its details), or the options on an empty tile.
    S.checkArea = function() {
        const w = this._windows;
        if (this._selected == null) {
            if (this._drawn) { this.clearTrSprites(); this._drawn = false; }
            else {
                w.option.active = true;
                w.option.refresh();
                w.option.visible = true;
                w.minimap.visible = true;
                w.minimap.refresh();
                w.option.select(0);
                this._cursor.active = false;
            }
        } else if (this._drawn === this._selected) {
            this.openStatusWindow(this._selected);
        } else if (!this._selected.tbsHideMove()) {
            this.clearTrSprites();
            this._drawn = this._selected;
            let type;
            if (this._selected.isEnemy()) type = 1;
            else if (!(this._selected.tbsPerfactionQ() !== this._selected.tbsMovedQ())) type = 2;
            else if (this._selected.tbsPerfactionQ()) type = 3;
            else type = 4;
            this.drawRanges(this._selected, type);
        }
    };
    /**
     * draw_ranges: the move, attack, attack-skill and help-skill tiles of a unit, coloured, and the reach
     * of the current command. type: 1 enemy all, 2 actor all, 3 move, 4 moved not acted, 5 skill, 7 weapon,
     * 8 item.
     */
    S.drawRanges = function(battler, type, convert = false) {
        const c = this._cursor;
        c.targetArea.length = 0;
        let attackSpellMin = 0, helpSpellMin = 0;
        let moveRange = type > 3 ? 0 : battler.tbsBaseMoveRange();
        let weaponRange, attackRangeMax, attackRangeMin, attackSpellRange, helpSpellRange;
        if (type === 1) {
            weaponRange = battler.tbsWeaponRange();
            attackRangeMax = weaponRange[0]; attackRangeMin = weaponRange[1];
            attackSpellRange = battler.tbsAttackSkillRange()[0];
        } else if (type === 2 || type === 4) {
            weaponRange = battler.tbsWeaponRange();
            attackRangeMax = weaponRange[0]; attackRangeMin = weaponRange[1];
            attackSpellRange = battler.tbsAttackSkillRange()[0];
            helpSpellRange = battler.tbsHelpSkillRange();
        } else if (type === 5) {
            const sr = battler.tbsSkillRange(this._spell.id);
            c.targetArea[1] = sr[2]; c.targetArea[2] = sr[3]; c.targetArea[3] = sr[1];
            if (U.forOpponent(this._spell)) { c.targetArea[0] = 5; attackSpellRange = sr[0]; attackSpellMin = sr[4]; }
            else { c.targetArea[0] = 6; helpSpellRange = sr[0]; helpSpellMin = sr[4]; }
            c.targetArea[4] = sr[6];
        } else if (type === 8) {
            const ir = battler.tbsItemRange(this._item.id);
            if (U.forOpponent(this._item)) { c.targetArea[0] = 5; attackSpellRange = ir[0]; }
            else { c.targetArea[0] = 6; helpSpellRange = ir[0]; }
            c.targetArea[1] = false; c.targetArea[2] = false; c.targetArea[3] = ir[1]; c.targetArea[4] = ir[6];
        } else if (type === 7) {
            weaponRange = battler.tbsWeaponRange();
            attackRangeMax = weaponRange[0]; attackRangeMin = weaponRange[1];
            c.targetArea[0] = 7; c.targetArea[1] = weaponRange[3]; c.targetArea[2] = false; c.targetArea[3] = weaponRange[4]; c.targetArea[4] = weaponRange[6];
        }
        let attackRange, attackSpell, helpRange;
        if ([1, 2, 3].includes(type) && battler.tbsCanTeleport()) {
            this._movePositions = battler.tbsSetTeleportPositions();
            helpRange = []; attackSpell = []; attackRange = [];
        } else {
            [this._route, this._cost] = battler.tbsCalcPosMove(moveRange);
            this._movePositions = R.routeKeys(this._route);
            if (weaponRange) {
                attackRange = weaponRange[2] ? battler.tbsCalcPosBow(attackRangeMax, attackRangeMin, this._movePositions)
                    : battler.tbsCalcPosAttack(attackRangeMax, attackRangeMin, this._movePositions);
            } else attackRange = [];
            if (c.targetArea[1]) {
                helpRange = battler.tbsCalcPosAttack(helpSpellRange, helpSpellMin, this._movePositions);
                attackSpell = battler.tbsCalcPosAttack(attackSpellRange, attackSpellMin, this._movePositions);
            } else {
                helpRange = battler.tbsCalcPosSpell(helpSpellRange, helpSpellMin, this._movePositions);
                attackSpell = battler.tbsCalcPosSpell(attackSpellRange, attackSpellMin, this._movePositions);
            }
            attackRange = P.minus(attackRange, this._movePositions);
            if (convert) { attackRange = attackRange.concat(this._movePositions); this._movePositions = []; }
            if (type === 1 || type === 2) {
                attackSpell = P.minus(P.minus(attackSpell, this._movePositions), attackRange);
                helpRange = P.minus(P.minus(P.minus(helpRange, this._movePositions), attackRange), attackSpell);
            } else if (type === 4) {
                attackSpell = P.minus(attackSpell, attackRange);
            }
        }
        if (!(type > 4)) this._spriteset.drawRange(this._movePositions, 2);
        this._spriteset.drawRange(attackRange, 1);
        this._spriteset.drawRange(attackSpell, 4);
        this._spriteset.drawRange(helpRange, 3);
        c.targetPositions = [];
        switch (c.targetArea[0]) {
            case 5: return attackSpell;
            case 6: return helpRange;
            case 7: return attackRange;
            default: return this._movePositions;
        }
    };
    S.openStatusWindow = function(battler) {
        const w = this._windows;
        SoundManager.playOk();
        w.detail.refresh(battler);
        w.detail.activate();
        w.detail.show();
        w.actor.hide();
        w.help.hide();
        w.status.hide();
    };
    S.activeCursorMove = function() {
        const w = this._windows;
        this._cursor.range = this.drawRanges(this._activeBattler, 3);
        w.actor.deactivate();
        w.actor.hide();
        w.help.hide();
        this._drawn = false;
        this._cursor.setMode('move');
    };
    S.openSkillWindow = function() {
        const w = this._windows;
        w.help.moveTo(8);
        w.skill.setStypeId(w.actor.currentExt());
        w.skill.setActor(this._activeBattler);
        w.skill.show();
        w.skill.activate();
        w.skill.select(0);
        w.skill.callUpdateHelp();
    };
    S.openItemWindow = function() {
        const w = this._windows;
        w.help.moveTo(8);
        w.item.select(0);
        w.item.activate();
        w.item.show();
        w.item.refresh();
        w.help.refresh();
    };
    S.cancelAttack = function() {
        this._windows.status.clearDmgPreview();
        this._cursor.active = true;
    };
    S.gConfirmAttack = function* () {
        this._activeBattler.currentAction().setAttack();
        yield* this.gProcessAction();
        this._windows.status.clearDmgPreview();
        if (this._activeBattler != null) this._activeBattler.tbsSetPerfAction(true);
        this._windows.actor.setup(this._activeBattler);
        this.actorMenuOpen();
        this.clearTrSprites();
    };
    S.cancelSkill = function() {
        this._windows.confirm.resetCommands();
        this._cursor.active = true;
    };
    S.gConfirmSkill = function* () {
        this._windows.confirm.resetCommands();
        this.disableCursor();
        const b = this._activeBattler;
        b._tbsSkillCast = null;
        b.tbsCountSkillUsage(this._spell);
        yield* this.gActivateImmediatSkill();
        if (this._activeBattler == null) return;
        this._windows.actor.setup(this._activeBattler);
        this.actorMenuOpen();
        this._windows.status.clearDmgPreview();
        this.clearTrSprites();
    };
    S.gActivateImmediatSkill = function* () {
        this._activeBattler.rrAceUseItem(this._spell);
        yield* this.gProcessAction();
    };
    S.cancelItem = function() {
        this._windows.status.clearDmgPreview();
        this._cursor.active = true;
    };
    S.gConfirmItem = function* () {
        const w = this._windows;
        w.help.moveTo(2);
        const b = this._activeBattler;
        if (U.isSkill(this._item)) { this._spell = $dataSkills[this._item.id]; b.currentAction().setSkill(this._spell.id); }
        else b.currentAction().setItem(this._item.id);
        const pos = b.currentAction().position;
        b.tbsTurnToPos(pos[0], pos[1]);
        b.rrAceUseItem(this._item);
        w.item.refresh();
        b.tbsSetPerfAction(true);
        this.clearTrSprites();
        w.status.clearDmgPreview();
        w.actor.setup(b);
        this.actorMenuOpen();
        yield* this.gProcessAction();
    };
    S.cancelMove = function() {
        const b = this._activeBattler;
        this._cursor.active = true;
        b.tbsMoveto(this._preX, this._preY);
        b.tbsResetTilesMoved();
        this.clearTrSprites();
        this.drawRanges(b, 3);
    };
    S.actorCancelMove = function() {
        const b = this._activeBattler;
        if (this._oldX != null && this._oldY != null) b.tbsMoveto(this._oldX, this._oldY);
        b._tbsMoved = false;
        b.tbsResetTilesMoved();
        this.clearTrSprites();
        this.disableCursor();
        this.drawRanges(b, 3);
        this._windows.actor.setup(b);
    };
    S.confirmMove = function() {
        const b = this._activeBattler;
        if (b.tbsCanTeleport()) {
            b.animationId = get('TELEPORT_ANIM', 2);
            if (b.tbsTeleportChance(this._cursor)) b.tbsMoveto(this._cursor.x, this._cursor.y);
            this._waitCount = 10;
        }
        b._tbsMoved = true;
        this._preX = null; this._preY = null;
        this.clearTrSprites();
        this.disableCursor();
        b.tbsApplyMoveCost(b._tbsCostForMove || 0);
        this._windows.actor.setup(b);
    };
    S.showRangeAfterMove = function() {
        const b = this._activeBattler;
        if (get('SHOW_MOVE_ATTACK', true) && this._drawn === false && this._cursor.at(b)) {
            this.clearTrSprites();
            if (!b.tbsPerfactionQ()) {
                this.drawRanges(b, get('MOVE_INCLUDE_SPELL', false) ? 4 : 7);
                this._drawn = true;
            }
        }
    };
    S.getTargets = function() {
        const targets = this._activeBattler.tbsGetTargets() || [];
        this._cursor.setTargets(targets);
        return targets;
    };
    S.checkBateventTrigger = function() {
        const b = this._activeBattler;
        if (b == null) return;
        for (const event of Object.values($gameSystem.tbsBattleEvents())) {
            if ([0, 1, 2].includes(event._trigger) && R.atXy(event, b.x, b.y) && event.list().length > 0) {
                if (!event._starting) event.start();
                return;
            }
        }
    };
    S.validSkill = function() {
        const w = this._windows, b = this._activeBattler;
        w.help.moveTo(2);
        b.currentAction().setSkill(this._spell.id);
        this._targets = this.getTargets();
        if (this._targets.length > 0) {
            const summon = GT.isSummon(this._spell.id, b.isActor()) > 0;
            if ((summon && this.occupiedBy(this._cursor.x, this._cursor.y) != null) ||
                (U.forOpponent(this._spell) && (this._selected === b && !get('ATTACK_ALLIES', false)) && !b.tbsSkillRange(this._spell.id)[3])) {
                SoundManager.playBuzzer();
            } else {
                SoundManager.playOk();
                this._cursor.active = false;
                w.confirm.ask('skill');
                w.status.dmgPreview(2, b, this._spell, this._targets);
            }
        } else if (GT.isSummon(this._spell.id, b.isActor()) > 0 && $gameMap.isPassable(this._cursor.x, this._cursor.y, 2)) {
            SoundManager.playOk();
            this._cursor.active = false;
            w.confirm.ask('skill');
            w.status.dmgPreview(2, b, this._spell, this._targets);
        } else {
            SoundManager.playBuzzer();
        }
    };
    S.validItem = function() {
        const w = this._windows, b = this._activeBattler;
        b.currentAction().clear();
        b.currentAction().setItem(this._item.id);
        this._targets = this.getTargets();
        if (this._targets.length === 0) SoundManager.playBuzzer();
        else {
            b.currentAction().position = [this._cursor.x, this._cursor.y];
            SoundManager.playOk();
            this._cursor.active = false;
            w.confirm.ask('item');
            w.status.dmgPreview(3, b, this._item, this._targets);
            w.help.moveTo(2);
        }
    };
    S.confirmVisible = function() {
        const c = this._windows && this._windows.confirm;
        return !!(c && c.active && c.visible);
    };
    S.getBattlerSprite = function(ch) { return this._spriteset.getBattlerSprite(ch); };

    //-------------------------------------------------------------------------
    // Options (Esc on an empty tile)
    //-------------------------------------------------------------------------
    S.gUpdBattleOption = function* () {
        const w = this._windows;
        w.option.tbsUpdate();
        const close = () => { w.option.active = false; w.option.visible = false; w.minimap.visible = false; };
        if (Input.isTriggered('ok')) {
            switch (w.option.option()) {
                case 'End Turn': {
                    SoundManager.playOk();
                    close();
                    this._phaseCount++;
                    const acted = $gameSystem.tbsActed();
                    for (const b of this.tacticsAllies().filter(m => !acted.includes(m))) { b.onTurnEnd(); b.tbsOnActionEnd(); }
                    acted.length = 0;
                    this._activeBattler = null;
                    for (const b of this.tacticsAllies()) b.tbsClearTbsActions();
                    yield* this.gSetTurn(Turn_Enemy);
                    this._cursor.active = false;
                    yield* this.gNextEnemy();
                    break;
                }
                case 'Anim':
                    SoundManager.playOk();
                    R.setSetting('anim', (R.setting('anim') + 1) > 2 ? 0 : R.setting('anim') + 1);
                    w.option.refresh();
                    break;
                case 'Conditions':
                    SoundManager.playOk();
                    close();
                    w.option.tbsUpdate();
                    yield* this.gBattleStart(true);
                    this._cursor.active = true;
                    break;
                case 'Escape':
                    SoundManager.playOk();
                    close();
                    this._cursor.active = true;
                    w.confirm.visible = true; w.confirm.active = true;
                    w.confirm.ask('escape');
                    break;
                case 'Surrender':
                    SoundManager.playOk();
                    close();
                    this._cursor.active = true;
                    w.confirm.visible = true; w.confirm.active = true;
                    w.confirm.ask('surrender');
                    break;
                case 'Cancel':
                    SoundManager.playOk();
                    close();
                    this._cursor.active = true;
                    break;
                default: break;
            }
        } else if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            close();
            w.minimap.refresh();
            this._cursor.active = true;
        }
    };

    //-------------------------------------------------------------------------
    // Leaving the battle
    //-------------------------------------------------------------------------
    // result: 0 won, 1 escaped, 2 lost.
    S.endBattle = function(result = 0) {
        this.clearTrSprites();
        this._spriteset.update();
        AudioManager.fadeOutBgm(0.4);
        R.battleEnd(result);
        this._battleExiting = result;
        this._cursor.active = false;
        this.cleanUpBattle();
        if (result === 2 && BattleManager.canLose() === true) SceneManager.pop();
    };
    S.cleanUpBattle = function() {
        for (const win of Object.values(this._windows)) { if (!win) continue; win.visible = false; win.active = false; }
        const help = this._windows.help;
        help.visible = false;
        help.opacity = 0;
        help.setText('', true);
        this._turn = null;
        for (const b of this.tacticsAll()) {
            b.tbsClearTbsActions();
            b._tbsBattler = false;
            this.addRemoveInvited(b);
        }
    };
    S.addRemoveInvited = function(b) {
        const charm = get('CHARM_ID', 0);
        if (b.isEnemy() && !b.isDeathStateAffected() && b.tbsTeam() === Battler_Actor && !b.isStateAffected(charm)) {
            const id = GT.captureToActor(b._enemyId);
            if (id !== 0) $gameParty.addActor(id);
        } else if (b.isActor() && !b.isDeathStateAffected() && b.tbsTeam() !== Battler_Actor && !b.isStateAffected(charm)) {
            $gameParty.removeActor(b.actorId());
        } else if (b.isActor() && !b.isDeathStateAffected() && b.tbsTeam() === Battler_Actor && !b.isStateAffected(charm) &&
            !$gameParty.allMembers().includes(b) && !$gameParty.tbsNeutrals().includes(b) && !b.tbsIsSummoned()) {
            $gameParty.addActor(b.actorId());
        }
    };
    // Gold and drops the moment an enemy falls: the gold pops over the unit, the items show as they fall.
    S.gShowItemGold = function* (targets) {
        if (!get('SHOW_ITEMGOLD_IMMEDIATELY', true)) return;
        const dead = R.uniqObjects(targets).filter(t => t.isDead() && t.isEnemy());
        let gold = 0, treasures = [];
        for (const d of dead) {
            gold += d.gold();
            treasures = treasures.concat(d.makeDropItems());
            if (this._activeBattler.hasSkill(151) && d.attackElements().includes(19) && rand(10) >= 7) treasures.push($dataItems[151]);
        }
        if (gold === 0 && treasures.length === 0) return;
        this._windows.status.hide();
        yield* this.gShowGoldGain(gold);
        yield* this.gShowItemGain(treasures);
    };
    S.gShowGoldGain = function* (gold) {
        if (gold === 0) return;
        yield* this.gWait(5);
        this._activeBattler.result().expGainAmt = R.sprintf(V.POP_Gain_Gold || '%d %s', gold, text('[47'));
        this._activeBattler.rrDamageFlag();
        $gameParty.gainGold(gold);
    };
    S.gShowItemGain = function* (treasures) {
        if (treasures.length === 0) return;
        yield* this.gShowTbsInfoSprite(this.addInfoSprite(new TBS_Treasure_Sprite(treasures)));
        for (const item of treasures) $gameParty.gainItem(item, 1);
    };
    S.gResultPhase = function* () {
        yield* this.gShowCongrat();
        if (!(this._battleExiting === 2 && !this._canLose)) yield* this.gExitBattle();
    };
    S.gShowCongrat = function* () {
        const congrat = this.addInfoSprite(new Congrat_Sprite(this._battleExiting));
        while (!congrat.isDisposed()) {
            yield;
            $gameMap.update(false);
            $gameScreen.update();
            congrat.updateInfo();
        }
        if (this._battleExiting === 2 && !this._canLose) SceneManager.goto(Scene_Gameover);
    };
    S.gExitBattle = function* () {
        let [returnToMap, returnX, returnY, returnDir] = GT.battleExitInfo(this._mapId) || [];
        if (returnToMap == null || returnToMap === false || returnToMap === 0) returnToMap = this._mapId;
        if (returnToMap === $gameMap.mapId()) {
            $gameMap.setup(returnToMap);
            if (returnX != null) $gamePlayer.locate(returnX, returnY);
            if (returnDir != null) $gamePlayer.setDirection(returnDir);
        } else {
            $gamePlayer.reserveTransfer(returnToMap, returnX ?? $gamePlayer.x, returnY ?? $gamePlayer.y, returnDir ?? 0, 2);
        }
        $gameParty.tbsClearSummons();
        $gameParty.tbsClearNeutrals();
        $gameTroop.tbsClearSummons();
        $gameTemp._rrGtbsFadeIn = true;
        this.startFadeOut(30, false);
        $gameMap.autoplay();
        $gamePlayer.refresh();
        $gamePlayer.center($gamePlayer.x, $gamePlayer.y);
        SceneManager.pop();
        yield;
    };
    S.exitBattle = function() {
        const it = this.gExitBattle();
        while (!it.next().done) { /* the fade runs on as the scene closes */ }
    };

    //-------------------------------------------------------------------------
    // Event calls
    //-------------------------------------------------------------------------
    S.cursorMove = function(x, y) { this._cursor.moveto(x, y); };
    S.cursorMoveto = function(battler) { if (battler) this._cursor.moveto(battler.x, battler.y); };
    S.cursor_move = S.cursorMove;
    S.update_screen = function() { return this.updateScreen(); };
    S.set_character = function(...args) { return this.setCharacter(...args); };
    S.end_battle = function(result) { return this.endBattle(result); };
    S.dispose_character = function(ch) { return this.disposeCharacter(ch); };
    S.cursor_moveto = S.cursorMoveto;
    S.active_battler = S.activeBattler;
    S.tactics_all = S.tacticsAll;
    S.tactics_actors = S.tacticsActors;
    // Puts a unit on the map: an actor (joining the party), an enemy (joining the troop) or a neutral.
    S.setCharacter = function(type, id, x, y, anim = 0, summon = false) {
        let actor;
        if (type === Battler_Actor) {
            if (summon) actor = $gameParty.tbsAddSummon(id);
            else if (!$gameParty.allMembers().includes($gameActors.actor(id))) { $gameParty.addActor(id); actor = $gameActors.actor(id); }
            if (!actor) return null;
            if (list('ACTOR_SUMMONS').includes(id)) {
                actor._tbsNeutral = !list('CONTROLABLE_SUMMONS').includes(id);
                if (get('DOOM_SUMMONS', true)) actor.addState(get('DOOM_ID', 0));
            } else if (summon) return null;
        } else if (type === Battler_Enemy) {
            actor = summon ? $gameTroop.tbsAddSummon(id) : $gameTroop.tbsAddMember(id);
            if (!actor) return null;
        } else if (type === Battler_Neutral) {
            actor = $gameParty.tbsAddNeutral(id);
            if (!actor) return null;
            actor._tbsNeutral = true;
        } else return null;
        actor.tbsGtbsEntrance(x, y);
        const s = this.createCharacter(actor);
        if (s) s.update();
        actor.animationId = anim;
        actor.tbsAdjustSpecialStates();
        return actor;
    };
    S.playMapAnimation = function(x, y, type, animId = 0) { this._spriteset.playMapAnimation(x, y, type, animId); };

    //-------------------------------------------------------------------------
    // Placing the party before the battle
    //-------------------------------------------------------------------------
    S.gStartActorPlace = function* () {
        const w = this._windows;
        AudioManager.playBgm({ name: GT.placingMusic(), volume: 100, pitch: 100, pan: 0 });
        this._spriteset.drawRange(this._placeLoc, 2);
        this._cursor.moveto(this._placeLoc[0]);
        this._index = -1;
        this.nextActorToPlace();
        w.status.visible = true;
        w.status.tbsUpdate($gameParty.allMembers()[this._index], this.findNextActor(), this.findPrevActor());
        w.help.moveTo(8);
        w.help.moveTo(2);
        w.help.setText(R.party.mode() === 'troops' ? vtext('Place_Troop_Message') : vtext('Place_Message'));
        this._tempPlaced = null;
        this._cursor.active = true;
        this._cursor.range = this._placeLoc;
        for (;;) {
            yield;
            $gameMap.update(false);
            $gameScreen.update();
            this.updateBattlers();
            w.status.drawNextprev(this.findNextActor(), this.findPrevActor());
            if (this.updateScreen()) continue;
            if (w.confirm.active) {
                if (yield* this.gWinConfirmUpdate()) break;
            } else if (SceneManager.isSceneChanging()) {
                break;
            } else {
                this.placeUpdate();
            }
        }
    };
    S.setPlaceFinish = function() { this._windows.confirm.ask('place'); };
    S.placeUpdate = function() {
        $gameMap.update(false);
        this._cursor.update();
        this.updateScreen();
        this._windows.status.tbsUpdate($gameParty.allMembers()[this._index], this.findNextActor(), this.findPrevActor());
        if (Input.isTriggered('rgssZ')) this._cursor.movetoNext();
        else if (this._tempPlaced) this.placeFollow();
        else this.placeInit();
    };
    S.placeInit = function() {
        const actor = $gameParty.allMembers()[this._index];
        if (Input.isTriggered('cancel')) {
            if (this.tacticsActors().length === 0) SoundManager.playBuzzer();
            else { SoundManager.playCancel(); this.setPlaceFinish(); }
        } else if (Input.isTriggered('ok')) {
            if (this._cursor.inRange()) {
                const tempPlaced = this.occupiedBy();
                if (tempPlaced) {
                    this._cursor.targetPositions = [this._cursor.pos()];
                    this._cursor.targetArea[0] = 1;
                    this._cursor.targetNeedRefresh = true;
                    this._tempPlaced = tempPlaced;
                    SoundManager.playOk();
                } else if (actor.isHidden()) {
                    if (actor.isDeathStateAffected()) { SoundManager.playBuzzer(); return; }
                    SoundManager.playOk();
                    actor.tbsGtbsEntrance(this._cursor.x, this._cursor.y);
                    this.createCharacter(actor);
                    this.nextActorToPlace();
                    this._cursor.movetoNext();
                    if (this.tacticsActors().length === $gameParty.tbsPlacable()) this.setPlaceFinish();
                } else if (!P.includes(this._placeLoc, actor.tbsPos())) {
                    SoundManager.playBuzzer();
                } else {
                    SoundManager.playOk();
                    actor.tbsMoveto(this._cursor.x, this._cursor.y);
                    actor.tbsUpdate();
                }
            } else SoundManager.playBuzzer();
        } else if (Input.isTriggered('pagedown')) {
            SoundManager.playCursor();
            this.nextActorToPlace();
        } else if (Input.isTriggered('pageup')) {
            SoundManager.playCursor();
            this.previousActorToPlace();
        }
    };
    S.placeFollow = function() {
        const tp = this._tempPlaced;
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this._tempPlaced = null;
            this.clearRSprites();
        } else if (Input.isTriggered('shift')) {
            if (this._cursor.at(tp)) {
                tp.hide(); tp._tbsBattler = false; tp.tbsClearTbsPos();
                this.disposeCharacter(tp);
                this.clearRSprites();
                this._tempPlaced = null;
            }
        } else if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            if (this._cursor.at(tp)) {
                tp.hide(); tp._tbsBattler = false; tp.tbsClearTbsPos();
                this.disposeCharacter(tp);
                this._tempPlaced = null;
                const actor = $gameParty.allMembers()[this._index];
                actor.tbsGtbsEntrance(this._cursor.x, this._cursor.y);
                this.createCharacter(actor);
                this.clearRSprites();
                this.nextActorToPlace();
            } else if (this._cursor.inRange()) {
                const swap = this.occupiedBy(this._cursor.x, this._cursor.y);
                if (swap) {
                    const [tx, ty] = tp.tbsPos();
                    tp.tbsMoveto(swap.x, swap.y); tp.tbsUpdate();
                    swap.tbsMoveto(tx, ty); swap.tbsUpdate();
                } else {
                    tp.tbsMoveto(this._cursor.x, this._cursor.y); tp.tbsUpdate();
                }
                this._tempPlaced = null;
                this.clearRSprites();
            } else SoundManager.playBuzzer();
        }
    };
    S.nextActorToPlace = function() {
        const members = $gameParty.allMembers();
        for (let i = 0; i < members.length; i++) {
            this._index = (this._index + 1) % members.length;
            const actor = members[this._index];
            if (!(actor.isHidden() && !P.includes(this._placeLoc, actor.tbsPos()))) continue;
            return;
        }
    };
    S.previousActorToPlace = function() {
        const members = $gameParty.allMembers();
        for (let i = 0; i < members.length; i++) {
            this._index = ((this._index - 1) % members.length + members.length) % members.length;
            const actor = members[this._index];
            if (!(actor.isHidden() && !P.includes(this._placeLoc, actor.tbsPos()))) continue;
            return;
        }
    };
    S.actorLocPos = function() { return Object.values(this._actorLoc).map(e => [e.x, e.y]); };
    S.findNextActor = function() { return this.findPlaceActor(1); };
    S.findPrevActor = function() { return this.findPlaceActor(-1); };
    S.findPlaceActor = function(step) {
        const members = $gameParty.allMembers();
        let i = this._index;
        const taken = this.actorLocPos().concat(this._placeLoc);
        for (let n = 0; n < members.length; n++) {
            i = ((i + step) % members.length + members.length) % members.length;
            const actor = members[i];
            if (P.includes(taken, actor.tbsPos())) continue;
            return actor;
        }
        return null;
    };

    //-------------------------------------------------------------------------
    // The AI's turn
    //-------------------------------------------------------------------------
    S.gUpdateAI = function* (forcing) {
        const b = this._activeBattler;
        this._cursor.moveto(b);
        this._thinking = new Sprite_Thinking(b);
        this._spriteset.addThinking(this._thinking);
        if (b.isStateAffected(get('CONFUSE_ID', 5)) && !forcing) {
            const movePositions = b.tbsMovedQ() ? [b.tbsPos()] : R.routeKeys(b.tbsCalcPosMove()[0]);
            b.tbsMakeTbsConfusedAction(movePositions);
            if (b.currentAction()) b.currentAction().tbsDetermineTactic();
        } else {
            let movePositions, moveCost;
            if (b.tbsMovedQ()) { movePositions = [b.tbsPos()]; moveCost = new Map([[P.key(b.x, b.y), 0]]); }
            else { const [r, c] = b.tbsCalcPosMove(); movePositions = R.routeKeys(r); moveCost = c; }
            yield* b.tbsMakeTbsAction(movePositions, moveCost, false);
        }
        if (b.currentAction()) b.currentAction().tbsDetermineTactic();
        this._cursor.moveto(b);
        while (this._thinking.updateThinking()) yield* this.gUpdateBasic();
        this._spriteset.removeThinking(this._thinking);
        this._thinking = null;
        this._cursor.setMode(null);
    };
    S.gUpdateThinking = function* () {
        if (this._thinking) this._thinking.updateThinking();
        yield* this.gUpdateBasic();
    };
    S.gUpdateAiUnit = function* () {
        const b = this._activeBattler;
        if (b.tbsMoving() || (b._tbsPath && b._tbsPath.length)) return;
        if (!(yield* this.gBattlerMovable())) return;
        this.clearTrSprites();
        const action = b.currentAction();
        if (action == null) { yield* this.gExitAiProcessing(); return; }
        if (b.isHidden() || b.isDeathStateAffected()) { yield* this.gExitAiProcessing(); return; }
        if (!b.tbsMovedQ() && action.tactic === 3) {
            if (b.tbsCanTeleport()) this._movePositions = b.tbsSetTeleportPositions();
            else { [this._route] = b.tbsCalcPosMove(); this._movePositions = R.routeKeys(this._route); }
            this.getRetreatPosRating();
            this.processMove();
        } else if (!b.tbsMovedQ() && !P.eq(action.movePos, b.tbsPos())) {
            this.processMove();
        } else if (!b.tbsPerfactionQ() && action.tactic === 2) {
            yield* this.gProcessSkill();
            action.tactic = 3;
        } else if (!b.tbsPerfactionQ() && action.tactic === 1) {
            if (b.currentAction().position && b.currentAction().position.length) yield* this.gProcessAttack();
            action.tactic = 3;
        } else {
            yield* this.gExitAiProcessing();
        }
    };
    S.gBattlerMovable = function* () {
        const b = this._activeBattler;
        if (b.tbsParalyzed() || b.tbsSleeping()) {
            b.tbsHasDoom();
            b.tbsClearTbsActions();
            this.deactivateBattler();
            if (!this._ATBActive) {
                if (this._turn === Turn_Player) yield* this.gNextActor(); else yield* this.gNextEnemy();
            }
            return false;
        }
        return true;
    };
    S.gProcessAttack = function* () {
        const b = this._activeBattler;
        this._cursor.moveto(b.currentAction().position);
        this._cursor.range = this.drawRanges(b, 7);
        this.updateTargetCursor();
        this._targets = this.getTargets();
        b.tbsSetPerfAction(true);
        yield* this.gProcessAction();
    };
    S.gProcessSkill = function* () {
        const b = this._activeBattler, action = b.currentAction();
        this._spell = action.item();
        this._waitCount = 5;
        this._cursor.moveto(action.position);
        this._cursor.range = this.drawRanges(b, 5);
        this.updateTargetCursor();
        b._tbsSkillCast = null;
        b.rrAceUseItem(this._spell);
        b.tbsCountSkillUsage(this._spell);
        this._targets = this.getTargets();
        b.currentAction().setSkill(this._spell.id);
        yield* this.gProcessAction();
    };
    S.processMove = function() {
        const b = this._activeBattler;
        const [route, cost] = b.tbsCalcPosMove();
        this._route = route;
        this._movePositions = R.routeKeys(route);
        if (!b.tbsHideMove()) this._spriteset.drawRange(this._movePositions, 2);
        const movePos = b.currentAction().movePos;
        this._cursor.moveto(movePos);
        b.tbsRunRoute(R.routeOf(route, movePos));
        b._tbsMoved = true;
        b.tbsApplyMoveCost((R.costOf(cost, movePos) || 0) * get('REQUIRED_TP_FOR_MOVE', 0));
    };
    S.gExitAiProcessing = function* () {
        const b = this._activeBattler;
        b.tbsFaceClosestEnemy();
        b.tbsSetWait();
        this.deactivateBattler();
        if (!this._ATBActive) {
            if (this._turn === Turn_Enemy) yield* this.gNextEnemy(); else yield* this.gNextActor();
        }
    };
    S.getRetreatPosRating = function() {
        let rating = [this._activeBattler.tbsPos(), 1, 0, 0, 0];
        for (const pos of this._movePositions) rating = this.rateRetreat(rating, pos);
        this._activeBattler.currentAction().movePos = rating[0];
    };
    S.rateRetreat = function(rating, pos) {
        const b = this._activeBattler;
        let farthest = 0, greatestMin = 999, count = 0;
        for (const enemy of b.tbsOpponents()) {
            const dist = Math.abs(enemy.x - pos[0]) + Math.abs(enemy.y - pos[1]);
            if (dist <= b.tbsViewRange()) {
                count++;
                if (dist < greatestMin) greatestMin = dist;
                if (dist > farthest) farthest = dist;
            }
        }
        let rate = 1;
        if (greatestMin >= rating[2]) rate += 30;
        if (farthest >= rating[3]) rate += 30;
        if (count <= rating[4]) rate += 25;
        const a = b.currentAction();
        if (a.tbsSkillQ() && a.item()) {
            const sr = b.tbsSkillRange(a.item().id);
            const field = sr[1], vAoe = sr[6];
            if (a.targets != null && field !== 0 && a.targets.includes(b) && a.targets.length > 1 && HEAL_SCOPES.includes(a.item().scope)) {
                const ap = a.position;
                if (P.includes(this._cursor.calculateAoe(field, 0, ap[0], ap[1], vAoe), pos)) rate += 50;
            }
        }
        if (rate >= rating[1] && (farthest > rating[3] || (farthest === rating[3] && rand(2) === 0))) rating = [pos, rate, greatestMin, farthest, count];
        return rating;
    };

    //-------------------------------------------------------------------------
    // Performing an action: setup, the action list's animation, damage, counters
    //-------------------------------------------------------------------------
    S.gProcessAction = function* () {
        this._windows.actor.visible = false;
        this._activeBattler.tbsResetWepCheck();
        this._tbsProcessPhase = true;
        this._step = 1;
        this._gained = [];
        yield* this.gProcessBattleEvent();
        while (this._tbsProcessPhase) {
            for (;;) {
                yield* this.gUpdateBasic();
                this._waitCount--;
                if (!(this.updateScreen() || this._waitCount > 0)) break;
            }
            this._waitCount = 0;
            yield* this.gUpdateProcessPhase();
        }
        yield* this.gProcessBattleEvent();
        yield* this.gWait(10);
    };
    S.gUpdateProcessPhase = function* () {
        switch (this._step) {
            case 1: this.processSetup(); break;
            case 2: this.executeSummonMiss(); break;
            case 3: yield* this.gExecuteAction(); break;
            case 4: this.cleanUpProcessAction(); break;
            default: break;
        }
    };
    S.processSetup = function() {
        const b = this._activeBattler;
        if (this._targets.length > 1) b.tbsTurnToMidpoint(this._targets);
        else b.tbsTurnTo(this._targets[0] || this._target || this._cursor);
        this._hitCount = 0;
        this.setupItemskill();
        this._step = 2;
    };
    S.setupItemskill = function() {
        const action = this._activeBattler.currentAction();
        if (action.tbsAttackQ()) this._applyAll = null;
        this._spell = action.item();
        if (action.item() && !action.tbsAttackQ() && !action.tbsGuardQ() && ALL_TYPES.includes(this._spell.scope)) this._applyAll = true;
        this._logWindow.displayUseItem(this._activeBattler, this._spell);
    };
    S.executeSummonMiss = function() {
        const b = this._activeBattler;
        if (this._targets.length === 0) {
            const sumid = GT.isSummon(b.currentAction().item().id, b.isActor());
            if (sumid > 0 && $gameMap.isPassable(this._cursor.x, this._cursor.y, 2)) {
                this._target = { anim: 'summon' };
                if (b.isAppeared()) {
                    let actor;
                    if (b.isActor() && !b._tbsNeutral) actor = this.setCharacter('actor', sumid, this._cursor.x, this._cursor.y, 0, true);
                    else if (b.isActor()) actor = this.setCharacter('neutral', sumid, this._cursor.x, this._cursor.y, 0, true);
                    else actor = this.setCharacter('enemy', sumid, this._cursor.x, this._cursor.y, 0, true);
                    if (actor) { this._targets.push(actor); actor.setHp(actor.mhp); actor.setMp(actor.mmp); this._gained = [actor]; }
                }
                this.playMapAnimation(this._cursor.x, this._cursor.y, 1);
            } else {
                this._target = { anim: 'miss' };
                this.playMapAnimation(this._cursor.x, this._cursor.y, 0);
            }
            this.exitProcessAction();
        } else if (GT.isSummon(this._spell.id, b.isActor()) > 0) {
            this.playMapAnimation(this._cursor.x, this._cursor.y, 0);
            this.exitProcessAction();
        }
        this._step = 3;
    };
    S.gExecuteAction = function* () {
        $gameSwitches.setValue(4981, false);
        this._waitCount += 25;
        if (this._target && this._target.anim) this._step = 4;
        this._musicChanged = false;
        const b = this._activeBattler;
        this._action = b.currentAction().tbsClone();
        if (get('POP_DAMAGE_IND', true)) {
            for (const target of R.uniqObjects(this._targets)) {
                yield* this.gMakeResultOnTarget([target]);
                yield* this.gShowItemGold([target]);
            }
        } else {
            yield* this.gMakeResultOnTarget(this._targets);
            yield* this.gShowItemGold(this._targets);
        }
        this._action = null;
        for (const target of this._targets) {
            yield* this.gCheckKnockBack(target);
            this.checkSpin(target);
            target.tbsPerformDeath();
            if (b.isActor()) this.checkExpGained(target);
            if (this._activeBatTemp == null && !b.isDeathStateAffected() && this._melee === true && !target.isDeathStateAffected()) {
                this._counters.push(target.tbsCounter(b));
            }
        }
        this._step = 4;
    };
    S.gMakeResultOnTarget = function* (targets) {
        if (this._action == null) return;
        yield* this.gMakeActionResults(targets);
    };
    S.gMakeActionResults = function* (targets) {
        const action = this._activeBattler.currentAction();
        if (this._action.tbsAttackQ() || this._action.tbsSkillQ()) yield* this.gMakeSkillResult(targets);
        else if (this._action.tbsGuardQ()) yield* this.gMakeSkillResult(targets);
        else if (this._action.tbsItemQ()) {
            if (action.itemSkill != null) { this._spell = this._action.itemSkill; yield* this.gMakeSkillResult(targets); this._item = null; }
            else yield* this.gMakeItemResult(targets);
        }
    };
    S.checkExpGained = function(target) {
        if (get('GAIN_EXP_ON_MISS', false) || !(target.result().missed || target.result().evaded)) this._gained.push(target);
    };
    S.gCheckKnockBack = function* (target) {
        for (const state of target.states()) {
            if (list('KNOCK_BACK_STATES').includes(state.id)) {
                const distance = table('STATE_PUSH_INFO')[state.id] || 0;
                if (distance !== 0) yield* this.gPerformKnockBack(target, distance);
                target.removeState(state.id);
            }
        }
    };
    S.checkSpin = function(target) {
        for (const state of target.states()) {
            if (list('SPIN_STATES').includes(state.id)) {
                target.tbsSetDirection(target.tbsReverseDir(target.tbsDirection()));
                target.removeState(state.id);
            }
        }
    };
    S.gPerformKnockBack = function* (target, distance) {
        let count = Math.abs(distance);
        let dir = this._activeBattler.tbsDirection();
        if (distance < 0) dir = this._activeBattler.tbsReverseDir(dir);
        while (count > 0) {
            const [, dx, dy] = R.TEST_DIR.find(t => t[0] === dir);
            if (this.occupiedBy(target.x + dx, target.y + dy) == null && target.tbsPassable(target.x, target.y, dir, true)) target.tbsKnockBack(dir);
            for (;;) { yield* this.gUpdateBasic(); if (!target.tbsMoving()) break; }
            count--;
        }
    };
    S.cleanUpProcessAction = function() {
        if (!(this._activeBattler.isDeathStateAffected() || this._gained.length === 0 || this._activeBatTemp)) this._expGained.push([3, this._activeBattler, this._gained]);
        this._gained = [];
        this._hitCount = 0;
        if (this._activeBatTemp) this._activeBattler = this._activeBatTemp;
        this._counters = R.uniqObjects(this._counters.filter(c => c != null));
        this._counter = this._counters.shift();
        while (this._counters.length && (this._counter == null || this._counter.isDead())) this._counter = this._counters.shift();
        if (this._counter != null && !this._counter.isDeathStateAffected()) {
            this._activeBatTemp = this._activeBattler;
            this._activeBattler = this._counter;
            this._activeBattler.tbsClearTbsActions();
            this._activeBattler.currentAction().setAttack();
            this._targets = [this._activeBatTemp];
            this._activeBattler.currentAction().position = this._activeBatTemp.tbsPos();
            this._activeBattler.currentAction().targets = this._targets;
            this._activeBattler.tbsResetWepCheck();
            this.clearTrSprites();
            this._cursor.moveto(this._activeBatTemp);
            this._melee = false;
            this._counter = null;
            this._step = 1;
            return;
        }
        if (this._activeBatTemp != null) { this._activeBattler = this._activeBatTemp; this._activeBatTemp = null; }
        this._counters.length = 0;
        this._targets.length = 0;
        this._melee = true;
        this._applyAll = null;
        this._waitCount += 25;
        this.exitProcessAction();
    };
    S.exitProcessAction = function() {
        this._logWindow.clear();
        if (this._windows.actor.active) this._windows.actor.setup(this._activeBattler);
        this._activeBattler.tbsOnActionEnd();
        if (this._usingSkill || this._activeBattler.isDeathStateAffected()) {
            this._usingSkill = false;
            this.deactivateBattler();
        }
        this._cursor.setMode(null);
        this.clearTrSprites();
        this._tbsProcessPhase = false;
    };
    S.gMakeItemResult = function* (targets) {
        this._actionTargets = targets.slice();
        const b = this._activeBattler;
        const item = $dataItems[b.currentAction().item().id];
        yield* this.gRunActionList(item, item.repeats);
    };
    S.gMakeSkillResult = function* (targets) {
        this._actionTargets = targets.slice();
        const spell = this._spell == null ? this._action.item() : this._spell;
        let num;
        if (this._action.tbsAttackQ()) num = (1 + Math.trunc(this._activeBattler.attackTimesAdd() || 0)) * spell.repeats;
        else num = spell.repeats;
        yield* this.gRunActionList(spell, num);
    };
    // The action list (move, animation, wait, damage …), each step waiting as it asks, then the damage
    // (once per repeat) and the cleanup.
    S.gRunActionList = function* (spell, num) {
        const [data] = this.getActionAnimeData(spell, this._activeBattler);
        const dmgType = ['damage', 'target', []];
        let dmgDeal = data.filter(d => d[0] === 'damage' && d[1] === 'target' && d[2] && d[2].length === 0).length;
        while (dmgDeal < num) { data.push(dmgType); dmgDeal++; }
        data.push(['cleanup', null, []]);
        while (data.length > 0) {
            const act = data.shift();
            this.parseActionData(act, spell);
            while (this.shouldWait()) {
                yield* this.gUpdateBasic();
                if (!this._spriteset.isMovement()) this._movementWait = false;
                if (!this._spriteset.isAnimationPlaying()) this._animationWait = false;
                if (!this._spriteset.isEffecting()) this._effectWait = false;
            }
        }
    };
    S.getActionAnimeData = function(spell, battler) {
        const data = (U.isItem(spell) ? GT.animeItemData() : GT.animeAnimationData(spell.id)).map(a => a.slice());
        const anim = [];
        let id = spell.animationId;
        const rot = this.rotatedAnimations()[id];
        if (rot != null) id = rot[battler.tbsDirection() / 2 - 1];
        if (id === -1) { anim.push(battler.tbsAtkAnimationId1()); anim.push(battler.tbsAtkAnimationId2()); }
        else anim.push(id);
        return [data, anim];
    };
    S.rotatedAnimations = function() { return { 101: [101, 102, 103, 104], 105: [105, 106, 107, 108, 109] }; };
    S.shouldWait = function() {
        if ((this._waitCount -= 1) > 0) return true;
        return !!(this._movementWait || this._animationWait || this._effectWait);
    };
    S.parseActionData = function(act, spell) {
        const kind = String(act[0] || '');
        const quiet = $gameSwitches.value(4981) || R.goFast();
        if (/^move/i.test(kind)) { if (!quiet) this.actionMovement(act); }
        else if (/^create/i.test(kind)) { if (!quiet) this.actionCreate(act); }
        else if (/^damage/i.test(kind)) this.actionDamage(act, spell);
        else if (/^screen/i.test(kind)) { if (!quiet) this.actionScreen(act); }
        else if (/^delete/i.test(kind)) this.actionDelete(act);
        else if (/^animation/i.test(kind)) { if (!quiet) this.actionAnimation(act, spell); }
        else if (/^message/i.test(kind)) { /* GTBS compared the parameter list with a pattern: never matched */ }
        else if (/^predict/i.test(kind)) { if (this._actionTargets.length === 1) this._actionTargets[0].rrItemPredictResult(this._activeBattler, spell); }
        else if (/^(movie|cine|cinema)/i.test(kind)) { /* no movies in battle */ }
        else if (/^wait/i.test(kind)) { if (!quiet) this.actionWait(act); }
        else if (/^cleanup/i.test(kind)) this.actionCleanup();
        else if (/^norepeat/i.test(kind)) $gameSwitches.setValue(4981, true);
    };
    S.actionCleanup = function() {
        this._windows.help.hide();
        this._movementWait = true;
        this._animationWait = true;
        this._effectWait = true;
    };
    S.actionWait = function(act) {
        const p = String((act[2] || [])[0] || '');
        if (/^(animation|anim)/i.test(p)) this._animationWait = true;
        else if (/^(movement|move)/i.test(p)) this._movementWait = true;
        else if (/^effect/i.test(p)) this._effectWait = true;
        else if (/^(\d+)/.test(p)) this._waitCount = parseInt(p, 10);
    };
    // A hit: the item applied (Ace's rules), the extra move skill 152 gives for a hit with element 2, the log.
    S.dealDmg = function(target, battler, spell) {
        target.rrAceItemApply(battler, spell);
        if ((spell.damage.elementId === 2 || spell.damage.elementId < 0) && target.result().isHit()) {
            if (target.isEnemy() && battler.hasSkill(152)) {
                battler._tbsExtraMove = true;
                battler._tbsMoved = false;
                this._oldX = battler.x; this._oldY = battler.y;
                const acted = $gameSystem.tbsActed(); const i = acted.indexOf(battler); if (i >= 0) acted.splice(i, 1);
                battler.tbsOnReact();
                battler.tbsResetTilesMoved();
                this._windows.actor.setup(battler);
            }
        }
        this._logWindow.displayActionResults(target, spell);
    };
    S.actionDamage = function(act, spell) {
        const who = String(act[1] || '');
        if (/^(target|enemy)/i.test(who)) for (const t of this._actionTargets) this.dealDmg(t, this._activeBattler, spell);
        else if (/^(user|self)/i.test(who)) this.dealDmg(this._activeBattler, this._actionTargets[0], spell);
    };
    S.actionMovement = function(act) {
        const who = String(act[1] || '');
        if (/^(user|self)/.test(who)) { if (!R.goFast()) this._activeBattler._tbsMoveActions.push(this.createMovementAction(act[2], 'user')); }
        else if (/^(target|enemy)/.test(who)) {
            if (R.goFast()) return;
            const ma = this.createMovementAction(act[2], 'target');
            for (const t of this._actionTargets) t._tbsMoveActions.push(Object.assign({}, ma, { offsetList: ma.offsetList.slice() }));
        } else if (/^(picture|pic|image|img|icon|ico)/.test(who)) {
            this._spriteset.addImageInstruction(this.setupImageMovement(act[2]));
        }
    };
    S.getSymFromDir = function(dir) {
        if ([1, 2, 3].includes(dir)) return 'down';
        if (dir === 4) return 'left';
        if (dir === 6) return 'right';
        return 'up';
    };
    S.createMovementAction = function(params, type) {
        const ma = { xy: null, targets: null, position: 'body', time: 10, offsetList: [], reset: false, jumpPeak: 0 };
        for (const param of params || []) {
            const t = this._actionTargets;
            let avgX = 0, avgY = 0;
            for (const a of t) { avgX += a.x; avgY += a.y; }
            avgX = idiv(avgX, t.length || 1); avgY = idiv(avgY, t.length || 1);
            let m;
            if ((m = /^(target|enemy)\s*(.+)*/i.exec(param))) {
                ma.targets = type === 'target' ? [this._activeBattler] : t;
                const opt = m[2] || '';
                if (/^(feet|base)/i.test(opt)) ma.position = 'feet';
                else if (/^(head|top)/i.test(opt)) ma.position = 'head';
                else if (/^(middle|body)/i.test(opt)) ma.position = 'body';
            } else if ((m = /^(absolute|abs|xy)\s*(\d+)\s*(\d+)/i.exec(param))) {
                ma.xy = { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
            } else if ((m = /^(t|time|duration|dur)\s*(\d+)/i.exec(param))) {
                ma.time = parseInt(m[2], 10);
            } else if ((m = /^(right|left|up|down)\s*(\d+)/i.exec(param))) {
                ma.offsetList.push([m[1].toLowerCase(), parseInt(m[2], 10)]);
            } else if (/^(return)/i.test(param)) {
                ma.reset = true;
            } else if (/^(wait|halt|complete)/i.test(param)) {
                this.actionWait([null, null, ['movement']]);
            } else if ((m = /^(away|back|backword[s]*)\s*(\d+)/i.exec(param))) {
                const who = type === 'target' ? t[0] : this._activeBattler;
                const sprite = this.getBattlerSprite(who);
                const dir = t.length === 1 ? sprite.getDirection() : R.directionFrom(this._activeBattler.x, this._activeBattler.y, avgX, avgY);
                ma.offsetList.push([this.getSymFromDir(who.tbsReverseDir(dir)), parseInt(m[2], 10)]);
            } else if ((m = /^(forward|approach|toward[s]*)\s*(\d+)/i.exec(param))) {
                const who = type === 'target' ? t[0] : this._activeBattler;
                const sprite = this.getBattlerSprite(who);
                const dir = t.length === 1 ? sprite.getDirection() : R.directionFrom(this._activeBattler.x, this._activeBattler.y, avgX, avgY);
                ma.offsetList.push([this.getSymFromDir(dir), parseInt(m[2], 10)]);
            } else if ((m = /^(jump)\s*(\d+)/i.exec(param))) {
                ma.jumpPeak = 10 + parseInt(m[2], 10);
            }
        }
        return ma;
    };
    S.getDefaultImageParameters = function() {
        return { create: false, pos: null, filename: null, offsetList: [], mirror: false, key: null, container: null, colCount: 1, rowCount: 1, row: 0, col: 0,
            time: 10, repeat: 0, angle: null, rotate: null, mirrorA: false, mirrored: false, opacity: null, zoomX: null, zoomY: null, isIcon: false,
            center: null, weaponAction: null, z: 2000 };
    };
    S.setupImageMovement = function(params) {
        let imp = this.getDefaultImageParameters();
        for (const param of params || []) imp = this.buildImageMovementParams(param, imp);
        return imp;
    };
    S.buildImageMovementParams = function(param, imp) {
        let m;
        const handSide = (p) => {
            if (/(hand1|arm1|right)$/i.test(p)) { imp.key = 'right'; imp.filename = 'weapon1'; imp.center = 'weapon1'; }
            else if (/(hand2|arm2|left)$/i.test(p)) { imp.key = 'left'; imp.filename = 'weapon2'; imp.center = 'weapon2'; }
            else if (/(head|top)$/i.test(p)) imp.key = 'top';
            else if (/(feet|bottom)$/i.test(p)) imp.key = 'bottom';
        };
        if ((m = /^(index|idx)\s*(\d+)/i.exec(param))) imp.filename = parseInt(m[2], 10);
        else if ((m = /^(file|filename|src|source)\s*(.+)/i.exec(param))) imp.filename = m[2];
        else if ((m = /^(abs|absolute|xy|pos)\s*(\d+)\s*(\d+)/i.exec(param))) imp.pos = { x: parseInt(m[2], 10), y: parseInt(m[3], 10) };
        else if ((m = /^(z)\s*(\d+)/i.exec(param))) imp.z = parseInt(m[2], 10);
        else if ((m = /^(angle)\s*(\d+)/i.exec(param))) { imp.angle = parseInt(m[2], 10); if (/(<>)/.test(param)) imp.mirrorA = true; }
        else if ((m = /^(zoom|scale)\s*(x|y)\s*(\d+)/i.exec(param))) imp['zoom' + m[2].toUpperCase()] = parseInt(m[3], 10) / 100;
        else if ((m = /^(rotate)\s*([-]*\d+)/i.exec(param))) imp.rotate = parseInt(m[2], 10);
        else if ((m = /^(mirror|flip)\s*(true|false)/i.exec(param))) imp.mirror = m[2] === 'true';
        else if ((m = /^(origin|center|cnt)( at)?\s*(\d+)\s*(\d+)/i.exec(param))) imp.center = { x: parseInt(m[2], 10), y: parseInt(m[3], 10) };
        else if ((m = /^(origin|center|cnt)\s*(\d)/i.exec(param))) imp.center = parseInt(m[2], 10);
        else if ((m = /^(origin|center|cnt)\s*(LR|LL|UR|UL)/i.exec(param))) imp.center = m[2];
        else if ((m = /^(key|tag)\s*(.+)/i.exec(param))) imp.key = m[2];
        else if (/^(user|self)/i.test(param)) { imp.container = this._activeBattler; handSide(param); }
        else if (/^(target|enemy)/i.test(param)) { imp.container = this._actionTargets[0]; handSide(param); }
        else if ((m = /^(t|time|duration|dur)\s*(\d+)/i.exec(param))) imp.time = parseInt(m[2], 10);
        else if ((m = /^(wep|weapon) (\d)/i.exec(param))) { imp.filename = 'weapon' + m[2]; imp.center = 'weapon' + m[2]; }
        else if ((m = /^(opacity|op)\*(\d+)/i.exec(param))) imp.opacity = parseInt(m[2], 10);
        else if (/^(attack|strike|hit|fire)/i.test(param)) imp.weaponAction = 'strike';
        else if ((m = /^(forward|approach|toward[s]*)\s*(\d+)/i.exec(param))) {
            if (imp.container) {
                const sprite = this.getBattlerSprite(imp.container);
                if (sprite) imp.offsetList.push([this.getSymFromDir(sprite.getDirection()), parseInt(m[2], 10)]);
            }
        } else if ((m = /^(away|back|backword[s]*)\s*(\d+)/i.exec(param))) {
            if (imp.container) {
                const sprite = this.getBattlerSprite(imp.container);
                if (sprite) imp.offsetList.push([this.getSymFromDir(imp.container.tbsReverseDir(sprite.getDirection())), parseInt(m[2], 10)]);
            }
        }
        return imp;
    };
    S.actionCreate = function(act) {
        const imp = this.setupImageMovement(act[2]);
        imp.create = true;
        if (/^(icon|ico)/i.test(String(act[1] || ''))) imp.isIcon = true;
        this._spriteset.addImageInstruction(imp);
    };
    S.actionDelete = function(act) {
        const imp = this.setupImageMovement(act[2]);
        imp.delete = true;
        if (/^(icon|ico)/i.test(String(act[1] || ''))) imp.isIcon = true;
        this._spriteset.addImageInstruction(imp);
    };
    S.actionScreen = function(act) {
        const who = String(act[1] || '');
        if (!who) return;
        const p = { power: 1, duration: 1, speed: 1, rgb: [0, 0, 0, 255], tone: null };
        for (const param of act[2] || []) {
            let m;
            if ((m = /^(power|pwr)\s*(\d+)/i.exec(param))) p.power = +m[2];
            else if ((m = /^(duration|dur|time)\s*(\d+)/i.exec(param))) p.duration = +m[2];
            else if ((m = /^(speed|spd)\s*(\d+)/i.exec(param))) p.speed = +m[2];
            else if ((m = /^(rgb|color)\s*(\d+)\s*(\d+)\s*(\d+)/i.exec(param))) p.rgb = [+m[2], +m[3], +m[4], p.rgb[3]];
            else if ((m = /^(opacity|opaque)\s*(\d+)/i.exec(param))) p.rgb[3] = +m[2];
            else if ((m = /^(tone)\s*(\d+)\s*(\d+)\s*(\d+)\s*(\d+)/i.exec(param))) p.tone = [+m[2], +m[3], +m[4], +m[5]];
        }
        if (/^shake/i.test(who)) $gameScreen.startShake(p.power, p.speed, p.duration);
        else if (/^flash/i.test(who)) $gameScreen.startFlash(p.rgb, p.duration);
        else if (/^tint/i.test(who)) $gameScreen.startTint(p.tone || [0, 0, 0, 0], p.duration);
    };
    S.actionAnimation = function(act, skill) {
        let anims = [];
        const who = String(act[1] || '');
        const isTarget = /^(target|enemy)/i.test(who), isUser = /^(self|user)/i.test(who);
        for (const param of act[2] || []) {
            let m;
            if ((m = /^([-]?\d+)/.exec(param))) anims = [parseInt(m[1], 10)];
            else if (/^(skill)/i.test(param)) {
                let id = skill.animationId;
                const rot = this.rotatedAnimations()[id];
                if (rot != null) id = rot[this._activeBattler.tbsDirection() / 2 - 1];
                anims = id;
            } else if (/^(wait|halt|complete)/i.test(param)) { this.actionWait([null, null, ['animation']]); continue; }
            else if ((m = /^(pose)\s*(\d)/i.exec(param))) {
                const battler = isTarget ? this._actionTargets[0] : isUser ? this._activeBattler : null;
                if (battler) battler.tbsSetPose(parseInt(m[2], 10) - 1);
            } else if ((m = /^(pose)\s*(.+)/i.exec(param))) {
                const battler = isTarget ? this._actionTargets[0] : isUser ? this._activeBattler : null;
                if (battler) battler.tbsSetPose(m[2]);
            } else if ((m = /^(weapon|wep)(\d) (\d+)/i.exec(param))) {
                const battler = isTarget ? this._actionTargets[0] : isUser ? this._activeBattler : null;
                if (battler) this._spriteset.makeWeaponAnimation(battler, parseInt(m[2], 10) - 1);
                return;
            } else if ((m = /^(weapon|wep)(\d)/i.exec(param))) {
                const battler = isTarget ? this._actionTargets[0] : isUser ? this._activeBattler : null;
                if (battler) this._spriteset.makeWeaponAnimation(battler, parseInt(m[2], 10) - 1);
                return;
            }
            if (isTarget) {
                if (anims === -1) anims = [this._activeBattler.tbsAtkAnimationId1(), this._activeBattler.tbsAtkAnimationId2()];
                for (const target of this._actionTargets) { const sp = this.getBattlerSprite(target); if (sp) sp.appendAnimQueue(anims); }
            } else if (isUser) {
                if (anims === -1) anims = [this._actionTargets[0].tbsAtkAnimationId1(), this._actionTargets[0].tbsAtkAnimationId2()];
                const sp = this.getBattlerSprite(this._activeBattler);
                if (sp) sp.appendAnimQueue(anims);
            }
        }
    };
    // Battle events between steps, the forced actions they make.
    S.gProcessBattleEvent = function* () {
        for (;;) {
            if (yield* this.gJudgeWinLoss()) return;
            if (SceneManager.isSceneChanging()) return;
            $gameTroop._interpreter.update();
            $gameTroop.setupBattleEvent();
            yield* this.gWaitForMessage();
            if (BattleManager.isActionForced()) yield* this.gProcessAction();
            if (!$gameTroop._interpreter.isRunning()) return;
            yield* this.gUpdateBasic();
        }
    };
    S.gProcessForcedAction = function* () {
        if (BattleManager.isActionForced() && this._activeBattler == null) {
            const battler = BattleManager._actionForcedBattler;
            BattleManager._actionForcedBattler = null;
            yield* this.gSetActiveBattler(battler, true);
            return true;
        }
        return false;
    };

    //=========================================================================
    // Entering and leaving: SceneManager, the map scene, BattleManager
    //=========================================================================
    const isTbsClass = (c) => c && c.name === 'Scene_Battle_TBS';
    const isBattleClass = (c) => c === Scene_Battle || (c && c.name === 'Scene_Battle');
    // Battle Processing opens the grid battle while GTBS is on.
    const _push = SceneManager.push;
    SceneManager.push = function(sceneClass) {
        if (isBattleClass(sceneClass) && $gameSystem && $gameSystem.tbsEnabled()) sceneClass = Scene_Battle_TBS;
        _push.call(this, sceneClass);
    };
    const _goto = SceneManager.goto;
    SceneManager.goto = function(sceneClass) {
        if (isBattleClass(sceneClass) && $gameSystem && $gameSystem.tbsEnabled() && !BattleManager.isBattleTest()) sceneClass = Scene_Battle_TBS;
        _goto.call(this, sceneClass);
    };
    // Leaving the map for the battle: the map's music kept, the battle-start sound (no encounter flash).
    const _mapStop = Scene_Map.prototype.stop;
    Scene_Map.prototype.stop = function() {
        _mapStop.call(this);
        if (SceneManager._nextScene && isTbsClass(SceneManager._nextScene.constructor)) {
            BattleManager.saveBgmAndBgs();
            SoundManager.playBattleStart();
        }
    };
    const _needsFadeIn = Scene_Map.prototype.needsFadeIn;
    Scene_Map.prototype.needsFadeIn = function() {
        if ($gameTemp._rrGtbsFadeIn) { $gameTemp._rrGtbsFadeIn = false; return true; }
        return _needsFadeIn.call(this);
    };
    // BattleManager.battle_start (GTBS calls it as the scene starts).
    R.battleStart = function() {
        $gameSystem.onBattleStart();
        $gameParty.onBattleStart(false);
        $gameTroop.onBattleStart();
        BattleManager._phase = 'turn';
    };
    // BattleManager.battle_end: the event's branch, then the party's and troop's end of battle.
    R.battleEnd = function(result) {
        BattleManager._phase = null;
        if (BattleManager._eventCallback) BattleManager._eventCallback(result);
        $gameParty.onBattleEnd();
        $gameTroop.onBattleEnd();
        if (result === 0) $gameSystem.onBattleWin();
    };
    R.seExists = (name) => {
        try {
            const fs = require('fs'), path = require('path');
            const base = path.join(path.dirname(process.mainModule.filename), 'audio', 'se');
            return ['.ogg', '.m4a', '.mp3', '.wav'].some(ext => fs.existsSync(path.join(base, name + ext)));
        } catch (_) { return false; }
    };
    // $game_map.update_gtbs_scroll: the view follows the cursor past the screen's middle, a cursor step at
    // a time (Game_Map#scroll_* moved the view at once).
    R.updateGtbsScroll = function(cx, cy) {
        if ($gameMap.isScrolling()) return true;
        const centerX = ($gameMap.screenTileX() - 1) / 2, centerY = ($gameMap.screenTileY() - 1) / 2;
        const c = R.cursor();
        const ax1 = $gameMap.adjustX(c.lastX), ay1 = $gameMap.adjustY(c.lastY);
        const ax2 = $gameMap.adjustX(cx), ay2 = $gameMap.adjustY(cy);
        if (ay2 > ay1 && ay2 > centerY) $gameMap.scrollDown(ay2 - ay1);
        if (ax2 < ax1 && ax2 < centerX) $gameMap.scrollLeft(ax1 - ax2);
        if (ax2 > ax1 && ax2 > centerX) $gameMap.scrollRight(ax2 - ax1);
        if (ay2 < ay1 && ay2 < centerY) $gameMap.scrollUp(ay1 - ay2);
        return false;
    };
    R.eventNotes = (event) => {
        const page = event.page();
        if (!page || !page.list) return '';
        return page.list.filter(c => c && (c.code === 108 || c.code === 408)).map(c => c.parameters[0]).join('\r\n');
    };

    //=========================================================================
    // Game_Interpreter: the GTBS calls events make
    //=========================================================================
    const GI = Game_Interpreter.prototype;
    GI.rrDisableTbs = function() { $gameSystem._tbsEnabled = false; };
    GI.rrEnableTbs = function() { $gameSystem._tbsEnabled = true; };
    GI.rrTbsOverrideMap = function(value) { if (typeof value === 'number') $gameTemp._tbsMapId = Math.max(0, value); };
    GI.rrTbsVictory = function(type = null, val = null, common = null) { $gameTemp._tbsVictory = { condition: type, val, common }; };
    GI.rrTbsFailure = function(type = null, val = null, common = null) { $gameTemp._tbsFailure = { condition: type, val, common }; };
    GI.rrTbsOccupied = function(type = 'actor') {
        const sc = R.scene();
        if (!sc) return false;
        const event = $gameMap.event(this._eventId);
        const bat = sc.occupiedBy(event.x, event.y);
        if (bat == null) return false;
        if (type === 'actor') return bat.isActor();
        if (type === 'enemy') return bat.isEnemy();
        return bat instanceof Game_Event;
    };
    GI.rrTbsGetOccupant = function() {
        const sc = R.scene();
        if (!sc) return null;
        const event = $gameMap.event(this._eventId);
        return sc.occupiedBy(event.x, event.y);
    };
    GI.rrForcePlayerTurn = function() { $gameTemp._tbsTurnStart = 'player'; };
    GI.rrForceEnemyTurn = function() { $gameTemp._tbsTurnStart = 'enemy'; };
    GI.rrFoeTeam = function(team1, team2) {
        team1 = String(team1).toLowerCase(); team2 = String(team2).toLowerCase();
        $gameTemp._tbsFoeData = $gameTemp._tbsFoeData || {};
        const list1 = $gameTemp._tbsFoeData[team1] = $gameTemp._tbsFoeData[team1] || [];
        if (!list1.includes(team2)) list1.push(team2);
    };
    // Zoro's Army Switcher: the main party and the army trade places (each side's ids kept for the other).
    GI.rrSwitchToMainParty = function() {
        const p = R.party;
        if (p.mode() === 'main') return;
        const ids = $gameParty.members().map(m => m.actorId());
        p.setSaved(ids);
        for (const id of ids) $gameParty.removeActor(id, false);
        for (const id of p.troops()) $gameParty.addActor(id);
        p.setMode('main');
    };
    GI.rrSwitchToTroopsParty = function() {
        const p = R.party;
        if (p.mode() === 'troops') return;
        const ids = $gameParty.members().map(m => m.actorId());
        p.setTroops(ids);
        for (const id of ids) $gameParty.removeActor(id, false);
        for (const id of p.saved()) $gameParty.addActor(id);
        p.setMode('troops');
    };
    if (!SceneManager.rrScene) SceneManager.rrScene = function() { return this._nextScene || this._scene; };
    // The game's set_place_max / clear_place_max.
    Game_Party.prototype.rrSetPlaceMax = function(v) { this._tbsMaxPlace = v; };
    Game_Party.prototype.rrClearPlaceMax = function() { this._tbsMaxPlace = null; };
})();
