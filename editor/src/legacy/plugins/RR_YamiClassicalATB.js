/*:
 * @target MZ
 * @plugindesc Classical ATB (VX Ace), for imported games
 * @author Yami; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YamiClassicalATB.js
 *
 * Yami's Classical ATB battle system, run by the Ace Battle Engine port
 * (RR_YanflyBattleEngine) when its battle system is 'catb':
 *   - Every battler's gauge fills with time, faster the higher its AGI
 *     against the battle's average; a full gauge lets the battler act. An
 *     actor's commands open as its gauge fills, one ready actor after
 *     another; Right moves to the next ready actor, Left or cancel opens the
 *     party commands (which stop the gauges).
 *   - The gauges fill in the fill time (frames, from the fill time variable
 *     when it holds more than 0) at average AGI. A preemptive or surprise
 *     battle starts them from the set values (out of 100000).
 *   - A skill or item with <charge rate: n%> in its note is cast after it is
 *     chosen, in a second gauge filling at n% of the battler's speed.
 *   - Gauges wait while the player chooses: 'wait' while any command, list
 *     or target window is active, 'quarter' in lists and targets, 'semi'
 *     choosing targets, 'full' never.
 *   - A turn passes every tick count frames of running gauges ('tick'), or
 *     after the set number of actions ('action'), the counts read from their
 *     variables when those hold more than 0. Turn-end effects and troop event
 *     turns follow it; troop pages set to run at turn end never run.
 *   - Enemies show a small gauge under them.
 *   - States that wear off at the end of an action count their turns at
 *     action ends, those that wear off at turn end at turn ends (on the map
 *     too).
 *   - Escaping that fails costs nothing but the attempt.
 *   - Force Action puts the forced action first in the battler's list; it is
 *     taken when that battler's gauge next fills (an enemy chooses anew every
 *     frame, so an enemy's forced action is dropped).
 *
 * Events may change the waiting and the turn counting:
 *   $gameSystem.rrSetCatbWaitType('full'|'quarter'|'semi'|'wait')
 *   $gameSystem.rrSetCatbTurnType('tick'|'action')
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param fillTime
 * @type number
 * @default 200
 *
 * @param fillTimeVariable
 * @type variable
 * @default 0
 *
 * @param waitType
 * @type select
 * @option full
 * @option quarter
 * @option semi
 * @option wait
 * @default full
 *
 * @param pausePartyCommand
 * @type boolean
 * @default true
 *
 * @param preemptiveActor
 * @type number
 * @default 70
 *
 * @param preemptiveEnemy
 * @type number
 * @default 0
 *
 * @param surpriseActor
 * @type number
 * @default 0
 *
 * @param surpriseEnemy
 * @type number
 * @default 70
 *
 * @param turnType
 * @type select
 * @option tick
 * @option action
 * @default tick
 *
 * @param tickCount
 * @type number
 * @default 200
 *
 * @param tickCountVariable
 * @type variable
 * @default 0
 *
 * @param afterAction
 * @type number
 * @default 5
 *
 * @param afterActionVariable
 * @type variable
 * @default 0
 *
 * @param gaugeColor1
 * @type number
 * @default 32
 *
 * @param gaugeColor2
 * @type number
 * @default 31
 *
 * @param chargeColor1
 * @type number
 * @default 18
 *
 * @param chargeColor2
 * @type number
 * @default 10
 *
 * @param gaugeYPlus
 * @type number
 * @min -99
 * @default 11
 *
 * @param phrase
 * @default ATB
 *
 * @param showEnemyGauge
 * @type boolean
 * @default true
 *
 * @param enemyGaugeWidth
 * @type number
 * @default 128
 *
 * @param enemyGaugeHeight
 * @type number
 * @default 12
 *
 * @param enemyGaugeColour1
 * @type number
 * @default 13
 *
 * @param enemyGaugeColour2
 * @type number
 * @default 5
 *
 * @param enemyBackColour
 * @type number
 * @default 19
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YamiClassicalATB');
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const FILL_TIME = num(params.fillTime, 200), FILL_VAR = num(params.fillTimeVariable, 0);
    const WAIT_TYPE = String(params.waitType || 'full'), TURN_TYPE = String(params.turnType || 'tick');
    const PAUSE_PARTY = bool(params.pausePartyCommand, true);
    const START = { actor: [0, num(params.preemptiveActor, 70), num(params.surpriseActor, 0)], enemy: [0, num(params.preemptiveEnemy, 0), num(params.surpriseEnemy, 70)] };
    const TICK_COUNT = num(params.tickCount, 200), TICK_VAR = num(params.tickCountVariable, 0);
    const AFTER_ACTION = num(params.afterAction, 5), AFTER_VAR = num(params.afterActionVariable, 0);
    const GAUGE = [num(params.gaugeColor1, 32), num(params.gaugeColor2, 31)], CHARGE = [num(params.chargeColor1, 18), num(params.chargeColor2, 10)];
    const GAUGE_Y_PLUS = num(params.gaugeYPlus, 11), PHRASE = String(params.phrase ?? 'ATB');
    const SHOW_ENEMY_GAUGE = bool(params.showEnemyGauge, true);
    const ENEMY_W = num(params.enemyGaugeWidth, 128), ENEMY_H = num(params.enemyGaugeHeight, 12);
    const ENEMY_COLOURS = [num(params.enemyGaugeColour1, 13), num(params.enemyGaugeColour2, 5)], ENEMY_BACK = num(params.enemyBackColour, 19);
    const MAX = 100000;
    const yea = PluginManager.parameters('RR_YanflyBattleEngine');
    const HPGAUGE_Y_PLUS = num(yea.hpGaugeYPlus, 11), RGSS_SIZE = num(yea.rgssFontSize, 24) || 24;
    const rubyAt = (array, index) => (index < 0 ? array[array.length + index] : array[index]);
    const catb = () => BattleManager._rrBattleType === 'catb';

    const chargeOf = (item) => {
        if (!item) return { on: false, rate: 100 };
        if (!item._rrCharge) {
            let on = false, rate = 100;
            for (const line of String(item.note || '').split(/[\r\n]+/)) {
                const m = /<(?:CHARGE_RATE|charge rate):[ ](\d+)?([%％])>/i.exec(line);
                if (m) { on = true; rate = Number(m[1]) || 0; }
            }
            item._rrCharge = { on, rate: rate <= 0 ? 100 : rate };
        }
        return item._rrCharge;
    };

    //-------------------------------------------------------------------------
    // Battle system and settings
    //-------------------------------------------------------------------------
    const _corrected = Game_System.prototype.rrBattleSystemCorrected;
    Game_System.prototype.rrBattleSystemCorrected = function(type) {
        return type === 'catb' ? 'catb' : _corrected ? _corrected.call(this, type) : 'dtb';
    };
    BattleManager.rrCatb = catb;
    const _isTpb = BattleManager.isTpb;
    BattleManager.isTpb = function() { return ($gameParty.inBattle() && catb()) || _isTpb.call(this); };
    const _isActiveTpb = BattleManager.isActiveTpb;
    BattleManager.isActiveTpb = function() {
        if ($gameParty.inBattle() && catb()) return $gameSystem.rrCatbWaitType() === 'full';
        return _isActiveTpb.call(this);
    };

    const variable = (id) => (id > 0 ? $gameVariables.value(id) : 0);
    Object.assign(Game_System.prototype, {
        rrCatbFillTime() {
            const v = Math.trunc(Number(variable(FILL_VAR))) || 0;
            return v > 0 ? v : FILL_TIME;
        },
        rrCatbTickCount() { const v = variable(TICK_VAR); return v > 0 ? v : TICK_COUNT; },
        rrCatbAfterAction() { const v = variable(AFTER_VAR); return v > 0 ? v : AFTER_ACTION; },
        rrCatbTurnType() { return this._rrCatbTurnType || TURN_TYPE; },
        rrCatbWaitType() { return this._rrCatbWaitType || WAIT_TYPE; },
        rrSetCatbWaitType(type = 'full') { this._rrCatbWaitType = String(type).replace(/^:/, ''); },
        rrSetCatbTurnType(type = 'tick') { this._rrCatbTurnType = String(type).replace(/^:/, ''); }
    });

    //-------------------------------------------------------------------------
    // Gauges
    //-------------------------------------------------------------------------
    Object.assign(Game_Battler.prototype, {
        rrCatbValue() { return this._rrCatb || 0; },
        rrCtCatbValue() { return this._rrCtCatb || 0; },
        rrRealGainCatb() { return (this.agi / BattleManager.rrAverageAgi()) * (MAX / $gameSystem.rrCatbFillTime()); },
        rrMakeCatbUpdate() {
            if (this.rrCatbValue() >= MAX || !this.canMove()) return;
            this._rrCatb = this.rrCatbValue() + Math.min(this.rrRealGainCatb(), MAX - this.rrCatbValue());
        },
        rrMakeCatbAction() {
            if (this.rrCatbValue() < MAX) return false;
            if (!this.canMove()) return this.rrClearCatb();
            return BattleManager.rrMakeCatbAction(this);
        },
        rrMakeCtCatbUpdate() {
            if (this.rrCatbValue() < MAX || this.rrCtCatbValue() >= MAX) return;
            const action = this.currentAction();
            if (!action || !action.item()) return;
            if (this.isActor() && !action.rrConfirm()) return;
            if (!this.canMove()) this.rrClearCatb();
            const charge = chargeOf(action.item());
            if (!charge.on) this._rrCtCatb = MAX;
            this._rrCtCatb = this.rrCtCatbValue() + Math.min(this.rrRealGainCatb() * charge.rate / 100, MAX - this.rrCtCatbValue());
        },
        rrChargeSkillDone() { return this.rrCatbValue() >= MAX && this.rrCtCatbValue() >= MAX; },
        rrClearCatb(value = 0) {
            this._rrCatb = value;
            this._rrCtCatb = 0;
            if (this.isActor() && BattleManager.actor() === this) BattleManager.rrClearActor();
            BattleManager.rrDeleteCatbAction(this);
            return true;
        },
        rrMakeFirstCatbValue(pre) {
            this.makeActions();
            this._rrCatb = START[this.isActor() ? 'actor' : 'enemy'][pre] || 0;
            this._rrCtCatb = 0;
        },
        rrCatbFilledRate() { return this.rrCatbValue() / MAX; },
        rrCatbCtFilledRate() { return this.rrCatbValue() < MAX ? 0 : this.rrCtCatbValue() / MAX; }
    });
    // MZ's own readers of the time gauge see the ATB one.
    const _tpbChargeTime = Game_Battler.prototype.tpbChargeTime;
    Game_Battler.prototype.tpbChargeTime = function() { return catb() ? this.rrCatbFilledRate() : _tpbChargeTime.call(this); };
    const _isTpbCharged = Game_Battler.prototype.isTpbCharged;
    Game_Battler.prototype.isTpbCharged = function() { return catb() && $gameParty.inBattle() ? this.rrCatbValue() >= MAX : _isTpbCharged.call(this); };
    const _clearTpbChargeTime = Game_Battler.prototype.clearTpbChargeTime;
    Game_Battler.prototype.clearTpbChargeTime = function() {
        if (catb() && $gameParty.inBattle()) this.rrClearCatb(0);
        else _clearTpbChargeTime.call(this);
    };
    const _makeActionTimes = Game_Battler.prototype.makeActionTimes;
    Game_Battler.prototype.makeActionTimes = function() { return catb() && $gameParty.inBattle() ? 1 : _makeActionTimes.call(this); };
    // Enemy turn conditions count the troop's turns.
    const _turnCount = Game_Battler.prototype.turnCount;
    Game_Battler.prototype.turnCount = function() { return catb() && $gameParty.inBattle() ? $gameTroop.turnCount() : _turnCount.call(this); };

    // Only turn-end states count down at turn end; action-end states count down after each action.
    Game_BattlerBase.prototype.updateStateTurns = function() {
        for (const state of this.states()) {
            if (this._stateTurns[state.id] > 0 && state.autoRemovalTiming === 2) this._stateTurns[state.id]--;
        }
    };
    Game_BattlerBase.prototype.rrUpdateStateActions = function() {
        for (const state of this.states()) {
            if (this._stateTurns[state.id] > 0 && state.autoRemovalTiming === 1) this._stateTurns[state.id]--;
        }
    };
    const _onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
    Game_Battler.prototype.onAllActionsEnd = function() {
        _onAllActionsEnd.call(this);
        this.rrUpdateStateActions();
    };
    const _onRestrict = Game_Battler.prototype.onRestrict;
    Game_Battler.prototype.onRestrict = function() {
        if (!catb() || !$gameParty.inBattle()) return _onRestrict.call(this);
        this.rrClearCatb(0);
        for (const state of this.states()) if (state.removeByRestriction) this.removeState(state.id);
    };
    const _forceAction = Game_Battler.prototype.forceAction;
    Game_Battler.prototype.forceAction = function(skillId, targetIndex) {
        if (!catb() || !$gameParty.inBattle()) return _forceAction.call(this, skillId, targetIndex);
        const action = new Game_Action(this, true);
        action.setSkill(skillId);
        if (targetIndex === -2) action.setTarget(this._lastTargetIndex);
        else if (targetIndex === -1) action.decideRandomTarget();
        else action.setTarget(targetIndex);
        this._actions.unshift(action);
    };
    const _managerForceAction = BattleManager.forceAction;
    BattleManager.forceAction = function(battler) { if (!catb()) _managerForceAction.call(this, battler); };
    // A failed escape leaves the gauges as they were.
    const _onEscapeFailure = Game_Actor.prototype.onEscapeFailure;
    Game_Actor.prototype.onEscapeFailure = function() {
        if (!catb()) return _onEscapeFailure.call(this);
        this.clearActions();
        this.requestMotionRefresh();
    };

    const _actionClear = Game_Action.prototype.clear;
    Game_Action.prototype.clear = function() {
        _actionClear.call(this);
        this._rrConfirm = false;
    };
    Game_Action.prototype.rrSetConfirm = function(confirm) { this._rrConfirm = confirm; };
    Game_Action.prototype.rrConfirm = function() { return this.subject().isAutoBattle() ? true : !!this._rrConfirm; };

    //-------------------------------------------------------------------------
    // BattleManager: the list of battlers whose gauges are full
    //-------------------------------------------------------------------------
    Object.assign(BattleManager, {
        rrMakeCatbActionOrders() { this._rrCatbAll = []; this._rrCatbActors = []; this._rrCatbEnemies = []; },
        rrAverageAgi() { return this._rrAverageAgi; },
        rrSetActor(actor) { this._currentActor = actor; },
        rrClearActor() { this._currentActor = null; },
        rrMakeCatbAction(battler) {
            if (!this._rrCatbAll) this.rrMakeCatbActionOrders();
            if (this._rrCatbAll.includes(battler)) return false;
            this._rrCatbAll.push(battler);
            (battler.isActor() ? this._rrCatbActors : this._rrCatbEnemies).push(battler);
            return true;
        },
        rrDeleteCatbAction(battler) {
            if (!battler || !this._rrCatbAll) return false;
            for (const list of [this._rrCatbAll, this._rrCatbActors, this._rrCatbEnemies]) {
                const i = list.indexOf(battler);
                if (i >= 0) list.splice(i, 1);
            }
            return true;
        },
        // Any type but 'all' and 'actor' reads the enemies (a slip in the original kept).
        rrActionList(type = 'all') {
            if (!this._rrCatbAll) this.rrMakeCatbActionOrders();
            return type === 'all' ? this._rrCatbAll : type === 'actor' ? this._rrCatbActors : this._rrCatbEnemies;
        },
        rrInputStart() {
            return !this._surprise && $gameParty.members().some(a => Game_BattlerBase.prototype.canInput.call(a));
        },
        // A turn: every battler's turn end, then the troop's turn count.
        rrCatbTurnEnd() {
            for (const battler of this.allBattleMembers()) battler.onTurnEnd();
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Battle) scene._statusWindow.refresh();
            $gameTroop.increaseTurn();
        }
    });
    const _startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function() {
        _startBattle.call(this);
        if (!catb()) return;
        this.rrMakeCatbActionOrders();
        this._rrTickAction = 0;
        const battlers = $gameParty.members().concat($gameTroop.members());
        let sum = 0;
        for (const battler of battlers) {
            battler.rrMakeFirstCatbValue(this._preemptive ? 1 : this._surprise ? 2 : 0);
            sum += battler.agi;
        }
        this._rrAverageAgi = battlers.length ? Math.floor(sum / battlers.length) : 0;
    };
    const _updateTpbInput = BattleManager.updateTpbInput;
    BattleManager.updateTpbInput = function() { if (!catb()) _updateTpbInput.call(this); };
    const _updateTurn = BattleManager.updateTurn;
    BattleManager.updateTurn = function(timeActive) {
        if (!catb()) return _updateTurn.call(this, timeActive);
        $gameParty.requestMotionRefresh();
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Battle) scene.rrProcessCatb(timeActive);
        if (this._subject) this.processTurn();
    };
    const _endBattlerActions = BattleManager.endBattlerActions;
    BattleManager.endBattlerActions = function(battler) {
        if (catb() && $gameSystem.rrCatbTurnType() === 'action') {
            this._rrTickAction = (this._rrTickAction || 0) + 1;
            if (this._rrTickAction >= $gameSystem.rrCatbAfterAction()) {
                this._rrTickAction = 0;
                this.rrCatbTurnEnd();
            }
        }
        const scene = SceneManager._scene;
        if (catb() && scene instanceof Scene_Battle && scene._statusAidWindow && scene._statusAidWindow.visible) scene._statusAidWindow.refresh();
        _endBattlerActions.call(this, battler);
    };

    //-------------------------------------------------------------------------
    // Status: the ATB gauge under the name
    //-------------------------------------------------------------------------
    const WS = Window_BattleStatus.prototype;
    const color = (n) => ColorManager.textColor(n);
    WS.rrDrawActorCatb = function(actor, x, y, width = 124) {
        this.rrAceGauge(x, y, width, actor.rrCatbFilledRate(), color(GAUGE[0]), color(GAUGE[1]));
        if (actor.rrCatbCtFilledRate() > 0) this.rrAceGauge(x, y, width, actor.rrCatbCtFilledRate(), color(CHARGE[0]), color(CHARGE[1]));
        this.changeTextColor(ColorManager.systemColor());
        const cy = Math.floor((RGSS_SIZE - this.contents.fontSize * RGSS_SIZE / $gameSystem.mainFontSize()) / 2) + 1;
        this.drawText(PHRASE, x + 2, y + cy, 30);
    };
    WS.rrDrawItemActorCatb = function(index) {
        if (index == null) return;
        const actor = rubyAt($gameParty.battleMembers(), index);
        if (!actor) return;
        const rect = this.itemRect(index), width = rect.width - 4;
        // Redrawn only when a gauge's length changes.
        const key = Math.floor(width * actor.rrCatbFilledRate()) + ':' + Math.floor(width * actor.rrCatbCtFilledRate());
        this._rrCatbDrawn = this._rrCatbDrawn || [];
        if (this._rrCatbDrawn[index] === key) return;
        this._rrCatbDrawn[index] = key;
        this.rrDrawActorCatb(actor, rect.x + 2, this.lineHeight() + HPGAUGE_Y_PLUS + GAUGE_Y_PLUS, width);
    };
    const _drawItem = WS.drawItem;
    WS.drawItem = function(index) {
        _drawItem.call(this, index);
        if (!catb() || index == null) return;
        if (this._rrCatbDrawn) this._rrCatbDrawn[index] = null;
        this.rrDrawItemActorCatb(index);
    };
    WS.rrRefreshCatb = function() {
        if (!catb()) return;
        for (let i = 0; i < this.maxItems(); i++) this.rrDrawItemActorCatb(i);
    };

    //-------------------------------------------------------------------------
    // Enemy gauges
    //-------------------------------------------------------------------------
    function Sprite_RRCatbGauge() { this.initialize(...arguments); }
    Sprite_RRCatbGauge.prototype = Object.create(Sprite.prototype);
    Sprite_RRCatbGauge.prototype.constructor = Sprite_RRCatbGauge;
    Sprite_RRCatbGauge.prototype.initialize = function(battler, type) {
        Sprite.prototype.initialize.call(this);
        this._battler = battler;
        this._type = type;
        const back = type === 'back';
        this._startWidth = ENEMY_W + (back ? 2 : 0);
        this._height = ENEMY_H + (back ? 2 : 0);
        const [c1, c2] = back ? [ENEMY_BACK, ENEMY_BACK] : type === 'catb' ? ENEMY_COLOURS : CHARGE;
        const w = this._startWidth;
        this.bitmap = new Bitmap(w * 2, this._height);
        this.bitmap.gradientFillRect(0, 0, w, this._height, color(c1), color(c2));
        this.bitmap.gradientFillRect(w, 0, w, this._height, color(c2), color(c1));
        this._gaugeWidth = this.targetWidth();
        this.setFrame(0, 0, back ? w : Math.floor(this._gaugeWidth), this._height);
        this.visible = false;
    };
    Sprite_RRCatbGauge.prototype.targetWidth = function() { return this._battler.rrCatbFilledRate() * this._startWidth; };
    Sprite_RRCatbGauge.prototype.update = function() {
        const b = this._battler;
        this.visible = b.isDead() ? false : b.isHidden() ? false : SHOW_ENEMY_GAUGE;
        this.updatePosition();
        this.updateGauge();
    };
    // Under the enemy's feet, but never down into the status strip.
    Sprite_RRCatbGauge.prototype.updatePosition = function(field) {
        const b = this._battler, back = this._type === 'back';
        field = field || this._rrField;
        const ox = field ? field.x : 0, oy = field ? field.y : 0;
        this.x = ox + b.screenX() - Math.floor(this._startWidth / 2);
        const dh = this._height + 1 + (back ? 0 : 2);
        this.y = Math.min(oy + b.screenY(), Graphics.height - dh - 120) + (back ? 0 : 1);
    };
    // As in the original, the charge gauge follows only while its width differs from the ATB gauge's.
    Sprite_RRCatbGauge.prototype.updateGauge = function() {
        if (this._gaugeWidth === this.targetWidth()) return;
        if (this._type === 'catb') this._gaugeWidth = this.targetWidth();
        if (this._type === 'catbct') this._gaugeWidth = this._battler.rrCatbCtFilledRate() * this._startWidth;
        if (this._type === 'back') return;
        this.setFrame(0, 0, Math.floor(this._gaugeWidth), this._height);
    };

    const _spritesetInitialize = Spriteset_Battle.prototype.initialize;
    Spriteset_Battle.prototype.initialize = function() {
        _spritesetInitialize.call(this);
        this._rrCatbGaugeLayer = new Sprite();
        this._rrCatbGaugeLayer.update = function() {};
        this.addChild(this._rrCatbGaugeLayer);
    };
    const _enemyUpdate = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function() {
        _enemyUpdate.call(this);
        this.rrUpdateCatbGauges();
    };
    Sprite_Enemy.prototype.rrUpdateCatbGauges = function() {
        if (!this._battler || !catb()) return;
        if (!this._rrCatbGauges) {
            const scene = SceneManager._scene, layer = scene && scene._spriteset && scene._spriteset._rrCatbGaugeLayer;
            if (!layer) return;
            this._rrCatbGauges = ['back', 'catb', 'catbct'].map(type => {
                const gauge = new Sprite_RRCatbGauge(this._battler, type);
                layer.addChild(gauge);
                return gauge;
            });
        }
        for (const gauge of this._rrCatbGauges) {
            gauge._rrField = this.parent;
            gauge.update();
        }
    };

    const _enemyMaxCols = Window_BattleEnemy.prototype.maxCols;
    Window_BattleEnemy.prototype.maxCols = function() { return _enemyMaxCols.call(this) || 1; };

    //-------------------------------------------------------------------------
    // Scene_Battle
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    SB.rrCatbPause = function() {
        if (this._partyCommandWindow.active) return PAUSE_PARTY;
        const type = $gameSystem.rrCatbWaitType();
        const targets = this._actorWindow.active || this._enemyWindow.active;
        const lists = this._skillWindow.active || this._itemWindow.active;
        if (type === 'full') return false;
        if (type === 'wait') return this._actorCommandWindow.active || lists || targets;
        if (type === 'quarter') return lists || targets;
        if (type === 'semi') return targets;
        return false;
    };
    const _isTimeActive = SB.isTimeActive;
    SB.isTimeActive = function() { return catb() ? !this.rrCatbPause() : _isTimeActive.call(this); };

    SB.rrProcessCatb = function(timeActive) {
        const status = this._statusWindow, list = () => BattleManager.rrActionList('actor');
        // The actor being chosen for has fallen, or lost its turn: close its windows.
        if (status.index() >= 0) {
            const member = $gameParty.members()[status.index()];
            if (member && (member.isDead() || !list().includes(member))) {
                member.rrClearCatb();
                if (this._skillWindow.visible || this._itemWindow.visible) {
                    status.open();
                    status.show();
                    this._statusAidWindow.hide();
                }
                for (const w of [this._actorWindow, this._enemyWindow]) { w.hide(); w.deactivate(); }
                this._actorCommandWindow.deactivate();
                this._actorCommandWindow.close();
                for (const w of [this._skillWindow, this._itemWindow]) { w.hide(); w.deactivate(); }
                status.deselect();
            }
        }
        if (!timeActive || SceneManager.isSceneChanging()) return;
        for (const battler of $gameParty.members().concat($gameTroop.members())) {
            battler.rrMakeCatbUpdate();
            battler.rrMakeCatbAction();
            battler.rrMakeCtCatbUpdate();
        }
        if ($gameSystem.rrCatbTurnType() === 'tick') {
            this._rrTickClock = (this._rrTickClock || 0) + 1;
            if (this._rrTickClock >= $gameSystem.rrCatbTickCount()) {
                this._rrTickClock = 0;
                BattleManager.rrCatbTurnEnd();
            }
        }
        for (const battler of list()) if (battler.isActor() && !battler.inputtingAction()) battler.makeActions();
        status.rrRefreshCatb();
        // The first ready actor who has not chosen gets the commands.
        const actors = list();
        if (this._rrFActorIndex == null || this._rrFActorIndex < 0 || this._rrFActorIndex + 1 > actors.length) this._rrFActorIndex = 0;
        let actor = actors[this._rrFActorIndex];
        const chosen = (a) => a && a.inputtingAction() && a.inputtingAction().item() && a.inputtingAction().rrConfirm();
        if (this._rrFActorIndex + 1 < actors.length && chosen(actor)) this._rrFActorIndex++;
        actor = actors[this._rrFActorIndex];
        const current = BattleManager.actor();
        if (actor && actor.inputtingAction() && !actor.inputtingAction().rrConfirm() && (!current || status.index() !== current.index())
            && !this._actorCommandWindow.active && !this._partyCommandWindow.active) {
            BattleManager.rrSetActor(actor);
            status.select(actor.index());
            this._actorCommandWindow.setup(actor);
            this._actorCommandWindow.show();
        }
        // Enemies choose again every frame until they act; the first battler ready acts.
        for (const battler of BattleManager.rrActionList().slice()) {
            if (battler.isEnemy()) battler.makeActions();
            if (!BattleManager._subject) this.rrPerformCatbAction(battler);
        }
    };
    SB.rrPerformCatbAction = function(subject) {
        if (!subject.rrChargeSkillDone()) return;
        if (subject.isActor()) {
            const action = subject.inputtingAction();
            if (!action || !action.item() || !action.rrConfirm()) return;
        }
        BattleManager._subject = subject;
    };

    // Choosing an action is the original's turn start: the commands close and the log clears.
    SB.rrCatbTurnStart = function() {
        BattleManager.rrSkillRestrictionsTurnStart?.();
        this._partyCommandWindow.close();
        this._actorCommandWindow.close();
        this._statusWindow.deselect();
        this._logWindow.push('wait');
        this._logWindow.push('clear');
    };
    SB.rrStartPartyCommandSelection = function() {
        if (SceneManager.isSceneChanging()) return;
        this._statusWindow.refresh();
        this._statusWindow.deselect();
        this._statusWindow.open();
        if (BattleManager.rrInputStart()) {
            this._actorCommandWindow.close();
            this._partyCommandWindow.setup();
        } else {
            this._partyCommandWindow.deactivate();
            this.rrCatbTurnStart();
        }
    };
    const _stockNextCommand = SB.rrStockNextCommand;
    SB.rrStockNextCommand = function() { if (catb()) this.rrCatbTurnStart(); else _stockNextCommand.call(this); };
    const _stockPriorCommand = SB.rrStockPriorCommand;
    SB.rrStockPriorCommand = function() { if (catb()) this.rrStartPartyCommandSelection(); else _stockPriorCommand.call(this); };
    const _commandFight = SB.commandFight;
    SB.commandFight = function() { if (catb()) this.rrNextCommand(); else _commandFight.call(this); };
    const _commandEscape = SB.commandEscape;
    SB.commandEscape = function() {
        if (!catb()) return _commandEscape.call(this);
        if (!BattleManager.processEscape()) this.rrCatbTurnStart();
    };
    // Right moves to the next actor whose gauge is full.
    SB.rrNextFActor = function() {
        const actors = BattleManager.rrActionList('actor');
        if (this._rrFActorIndex == null || actors.length <= 0) return;
        this._rrFActorIndex++;
        if (this._rrFActorIndex + 1 > actors.length) this._rrFActorIndex = 0;
        const actor = actors[this._rrFActorIndex];
        if (!actor) return;
        BattleManager.rrSetActor(actor);
        this._statusWindow.select(actor.index());
        this._actorCommandWindow.setup(actor);
    };
    SB.rrPriorFActor = function() {
        const actors = BattleManager.rrActionList('actor');
        if (this._rrFActorIndex == null || actors.length <= 0) return;
        this._rrFActorIndex = Math.max(this._rrFActorIndex - 1, 0);
        const actor = actors[this._rrFActorIndex];
        if (!actor) return;
        BattleManager.rrSetActor(actor);
        this._statusWindow.select(actor.index());
        this._actorCommandWindow.setup(actor);
    };
    const _createActorCommandWindow = SB.createActorCommandWindow;
    SB.createActorCommandWindow = function() {
        _createActorCommandWindow.call(this);
        if (!catb()) return;
        this._actorCommandWindow.setHandler('dir4', this.rrPriorFActor.bind(this));
        this._actorCommandWindow.setHandler('dir6', this.rrNextFActor.bind(this));
    };

    const confirm = (value) => {
        const actor = BattleManager.actor(), action = actor && actor.inputtingAction();
        if (action) action.rrSetConfirm(value);
    };
    const redrawActor = function() {
        const actor = BattleManager.actor();
        if (actor) this._statusWindow.drawItem(actor.index());
    };
    const wrap = (name, before, after) => {
        const base = SB[name];
        SB[name] = function(...args) {
            if (!catb()) return base.apply(this, args);
            if (before) before.call(this);
            base.apply(this, args);
            if (after) after.call(this);
        };
    };
    wrap('commandGuard', () => confirm(true), redrawActor);
    wrap('commandAttack', null, redrawActor);
    wrap('onEnemyOk', () => confirm(true));
    wrap('onEnemyCancel', () => confirm(false), redrawActor);
    wrap('onActorOk', () => confirm(true));
    wrap('onActorCancel', () => confirm(false), redrawActor);
    wrap('onSkillOk', null, redrawActor);
    wrap('onItemOk', null, redrawActor);

    // The commands wait closed while a message shows.
    const _needsInputWindowChange = SB.needsInputWindowChange;
    SB.needsInputWindowChange = function() { return catb() ? false : _needsInputWindowChange.call(this); };
    const _updateInputWindowVisibility = SB.updateInputWindowVisibility;
    SB.updateInputWindowVisibility = function() {
        if (!catb()) return _updateInputWindowVisibility.call(this);
        if ($gameMessage.isBusy()) {
            this._partyCommandWindow.close();
            this._actorCommandWindow.close();
            return;
        }
        for (const w of [this._partyCommandWindow, this._actorCommandWindow]) if (w.active && w.isClosed()) w.open();
    };

    // The info strip slides as the original's viewport did: several moves a frame, the last one winning.
    const _updateStatusWindowPosition = SB.updateStatusWindowPosition;
    SB.updateStatusWindowPosition = function() {
        if (!catb() || this._rrInfoOx === undefined) return _updateStatusWindowPosition.call(this);
        const move = (ox) => {
            if (this._rrInfoOx < ox) this._rrInfoOx = Math.min(ox, this._rrInfoOx + 16);
            else if (this._rrInfoOx > ox) this._rrInfoOx = Math.max(ox, this._rrInfoOx - 16);
        };
        const party = this._partyCommandWindow.active, actor = this._actorCommandWindow.active;
        if (party) move(0);
        if (actor) move(128);
        move(64);
        if (actor || this._actorWindow.active || this._enemyWindow.active) move(128);
        if (party) move(0);
        for (const w of [this._statusWindow, this._partyCommandWindow, this._actorCommandWindow]) w.x = w._rrInfoBaseX - this._rrInfoOx;
    };
})();
