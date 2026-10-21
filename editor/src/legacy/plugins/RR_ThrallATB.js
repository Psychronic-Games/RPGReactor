/*:
 * @target MZ
 * @plugindesc STR33 Active Time Battle with Thrall's battle screen (VX), for imported games
 * @author star (STR33, STR11, STR15, STR31); translated by Mr. Bubble; Thrall's edits; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallATB.js
 *
 * Thrall's battle: star's STR33 Active Time Battle running VX's battle scene
 * with the Sideview Battle System's actions.
 *   - Every battler's CT gauge fills with time (AGI against the average AGI
 *     of everyone, times the speed in variable 9); a full gauge lets it act.
 *     A ready actor's commands open with a chime (Attack, Skills, Cover,
 *     Items, icons beside them) and a green marker over its head; enemies
 *     act as their gauges fill. Skills and items with a speed are chanted
 *     first in a second (purple) gauge.
 *   - Variable 10 sets when the gauges wait: 0 never, 1 in skill and item
 *     lists, 2 also choosing targets, 3 also at the actor commands, 4 also
 *     while an action plays.
 *   - Every action ends a turn: states count down for everyone, slip damage
 *     and regeneration land, troop events check their turns. Enemies count
 *     their own actions for their turn conditions.
 *   - Holding the escape button (A) fills the flee gauge under ESCAPE at the
 *     top right; while it fills the party's gauges stop. A full gauge
 *     escapes. Cancel at the actor commands passes the turn (the gauge drops
 *     back by 20%).
 *   - COUNTDAMAGE[n] in a skill's or item's note pushes the target's gauge
 *     back n%; HEAVY weapons push it back half. CTSPEEDRATE[n%] and
 *     CHANTSPEEDRATE[n%] on states and equipment change the speeds.
 *   - The screen: battle messages on a dark strip at the top; the party's
 *     rows at the bottom (name, HP in rolling numbers over a red gauge, the
 *     Overdrive gauge, the green CT gauge); each enemy shows its level (or
 *     its elite affixes), its CT gauge and its HP gauge; the marker over the
 *     chosen target; with switch 56, the turn order at the top left.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param WAIT_VA
 * @text Wait mode variable
 * @type variable
 * @default 10
 * @param CT_SPEED_VA
 * @text Gauge speed variable
 * @type variable
 * @default 9
 * @param WAIT
 * @default 3
 * @param WAIT_P
 * @default [[false,false,false,false],[false,true,false,false],[false,true,true,false],[false,true,true,true],[true,true,true,true]]
 * @param RTT
 * @default false
 * @param RTT_COUNT
 * @default 120
 * @param CT_MAX
 * @default 4096
 * @param CT_SPEED
 * @default 30
 * @param CT_CANCEL
 * @default 20
 * @param CT_DM_ATTACK
 * @default 0
 * @param CT_DM_WORD
 * @default COUNTDAMAGE
 * @param CT_CT_WORD
 * @default CTSPEEDRATE
 * @param CT_AW_WORD
 * @default CHANTSPEEDRATE
 * @param ESCAPE
 * @default 250
 * @param ESCAPE_SWITCH
 * @default false
 * @param ESCAPE_CSTOP
 * @default true
 * @param ESCAPE_LOSS
 * @default true
 * @param ESCAPE_LOSSP
 * @default 750
 * @param W_RESIZE
 * @default true
 * @param W_HELP_Y
 * @default 296
 * @param W_RECT
 * @default [0,352,608,128]
 * @param ESC_DISABLE
 * @default false
 * @param CNX_DISABLE
 * @default false
 * @param EXTEND
 * @default {"update":1}
 * @param COMMANDSE
 * @default {"name":"Decision2","volume":80,"pitch":100,"pan":0}
 * @param TEXT_B_COLOR
 * @default [[0,0,0,224],[0,0,0,196]]
 * @param MSG_BTWIDTH
 * @default 608
 * @param MSG_MOVE
 * @default true
 * @param MSG_SPEED
 * @default 1
 * @param MSG_W_OPACITY
 * @default 96
 * @param MSG_N_WINDOW
 * @default false
 * @param CURSOR_CURSOR
 * @default Cursor
 * @param CURSOR_WAIT
 * @default 8
 * @param CURSOR_SPEED
 * @default 4
 * @param CURSOR_CW
 * @default 32
 * @param CURSOR_CH
 * @default 32
 * @param BTSKIN_00
 * @default atb_Btskin_main
 * @param BTSKIN_01
 * @default atb_Btskin_hp
 * @param BTSKIN_03
 * @default atb_Btskin_state
 * @param BTSKIN_04
 * @default Btskin_n00
 * @param BTSKIN_100
 * @default od_gauge01
 * @param BTSKIN_101
 * @default od_gauge00
 * @param BTSKIN_17
 * @default wait_gauge01
 * @param BTSKIN_18
 * @default wait_gauge00
 */
(() => {
    'use strict';
    // A class other code may build by its global name is published as a plain MZ-style constructor: the engine
    // re-wraps every display class on window and calls the original without `new`, which a class cannot take.
    const mzGlobal = (name, Cls) => {
        const F = { [name]: function(...args) { this.initialize(...args); } }[name];
        F.prototype = Cls.prototype;
        Object.setPrototypeOf(F, Cls);
        window[name] = F;
        return F;
    };
    const PLUGIN = 'RR_ThrallATB';
    const P = PluginManager.parameters(PLUGIN);
    const VX = (window.RRThrallVx = window.RRThrallVx || {});
    const { idiv, imod, rand, vars, sw, trunc } = VX;
    const json = (s, d) => { try { const v = JSON.parse(s); return typeof v === 'string' ? JSON.parse(v) : v; } catch (_) { return d; } };
    const num = (s, d) => (s === undefined || s === '' || isNaN(Number(s)) ? d : Number(s));
    const bool = (s, d) => (s === undefined || s === '' ? d : s === 'true');
    const str = (s, d) => (s === undefined ? d : String(s));

    const CTB = (VX.CTB = {
        WAIT_VA: num(P.WAIT_VA, 10), CT_SPEED_VA: num(P.CT_SPEED_VA, 9), WAIT: num(P.WAIT, 3),
        WAIT_P: json(P.WAIT_P, [[false, false, false, false], [false, true, false, false], [false, true, true, false], [false, true, true, true], [true, true, true, true]]),
        RTT: bool(P.RTT, false), RTT_COUNT: num(P.RTT_COUNT, 120), CT_MAX: num(P.CT_MAX, 4096), CT_SPEED: num(P.CT_SPEED, 30), CT_CANCEL: num(P.CT_CANCEL, 20),
        CT_DM_ATTACK: num(P.CT_DM_ATTACK, 0), CT_DM_WORD: str(P.CT_DM_WORD, 'COUNTDAMAGE'), CT_CT_WORD: str(P.CT_CT_WORD, 'CTSPEEDRATE'), CT_AW_WORD: str(P.CT_AW_WORD, 'CHANTSPEEDRATE'),
        ESCAPE: num(P.ESCAPE, 250), ESCAPE_SWITCH: bool(P.ESCAPE_SWITCH, false), ESCAPE_CSTOP: bool(P.ESCAPE_CSTOP, true), ESCAPE_LOSS: bool(P.ESCAPE_LOSS, true),
        ESCAPE_LOSSP: num(P.ESCAPE_LOSSP, 750), W_RESIZE: bool(P.W_RESIZE, true), W_HELP_Y: num(P.W_HELP_Y, 296), W_RECT: json(P.W_RECT, [0, 352, 608, 128]),
        ESC_DISABLE: bool(P.ESC_DISABLE, false), CNX_DISABLE: bool(P.CNX_DISABLE, false), EXTEND: json(P.EXTEND, { update: 1 }),
        COMMANDSE: json(P.COMMANDSE, { name: 'Decision2', volume: 80, pitch: 100, pan: 0 })
    });
    // !!戦闘テストの場合、変数依存設定を無効にする!! (battle tests ignore the variables)
    CTB.waitMode = () => {
        const va = BattleManager.isBattleTest() ? 0 : CTB.WAIT_VA;
        return (va === 0 ? CTB.WAIT_P[CTB.WAIT] : CTB.WAIT_P[$gameVariables.value(va)]) || [false, false, false, false];
    };
    CTB.ctspeed = () => {
        const va = BattleManager.isBattleTest() ? 0 : CTB.CT_SPEED_VA;
        return va === 0 ? CTB.CT_SPEED : $gameVariables.value(va);
    };
    const MSG = { TEXT_B_COLOR: json(P.TEXT_B_COLOR, [[0, 0, 0, 224], [0, 0, 0, 196]]), BTWIDTH: num(P.MSG_BTWIDTH, 608), MOVE: bool(P.MSG_MOVE, true), SPEED: num(P.MSG_SPEED, 1),
        W_OPACITY: num(P.MSG_W_OPACITY, 96), N_WINDOW: bool(P.MSG_N_WINDOW, false) };
    const CURSOR = { CURSOR: str(P.CURSOR_CURSOR, 'Cursor'), WAIT: num(P.CURSOR_WAIT, 8), SPEED: num(P.CURSOR_SPEED, 4), CW: num(P.CURSOR_CW, 32), CH: num(P.CURSOR_CH, 32) };
    const SKIN = {
        BTSKIN_00: str(P.BTSKIN_00, 'atb_Btskin_main'), BTSKIN_01: str(P.BTSKIN_01, 'atb_Btskin_hp'), BTSKIN_03: str(P.BTSKIN_03, 'atb_Btskin_state'), BTSKIN_04: str(P.BTSKIN_04, 'Btskin_n00'),
        BTSKIN_100: str(P.BTSKIN_100, 'od_gauge01'), BTSKIN_101: str(P.BTSKIN_101, 'od_gauge00'), BTSKIN_17: str(P.BTSKIN_17, 'wait_gauge01'), BTSKIN_18: str(P.BTSKIN_18, 'wait_gauge00'),
        B_XY: json(P.BTSKIN_B_XY, [0, 0]), XY00: json(P.BTSKIN_00XY, [0, 0]), XY01: json(P.BTSKIN_01XY, [126, 15]), XY04: json(P.BTSKIN_04XY, [126, 2]),
        XY03: json(P.BTSKIN_03XY, [60, 0]), XY06: json(P.BTSKIN_06XY, [60, 0]), XY100: json(P.BTSKIN_100XY, [238, 16]), XY101: json(P.BTSKIN_101XY, [238, 16]),
        XY17: json(P.BTSKIN_17XY, [350, 15]), XY18: json(P.BTSKIN_18XY, [350, 7]), GS01: num(P.BTSKIN_01GS, 2), SS04: num(P.BTSKIN_04SS, 12), NS04: num(P.BTSKIN_04NS, 5),
        WH06: json(P.BTSKIN_06WH, [24, 24]), SC06: num(P.BTSKIN_06SC, 2)
    };
    const EG = {
        CTBGAUGE_BC: json(P.CTBGAUGE_BC, [[0, 0, 0, 255], [32, 48, 64, 255]]), ODGAUGE_BC: json(P.ODGAUGE_BC, [[0, 0, 0, 255], [32, 48, 64, 255]]),
        CTBGAUGE_GC: json(P.CTBGAUGE_GC, [[25, 218, 72, 255], [197, 255, 222, 255]]), ODGAUGE_GC: json(P.ODGAUGE_GC, [[189, 189, 90, 255], [255, 255, 255, 255]]),
        CTBGAUGE_AW: json(P.CTBGAUGE_AW, [[148, 87, 206, 255], [205, 190, 255, 255]]),
        CTBGAUGE_Y: num(P.CTBGAUGE_Y, 12), CTBGAUGE_Z: num(P.CTBGAUGE_Z, 50), CTBGAUGE_W: num(P.CTBGAUGE_W, 48), CTBGAUGE_H: num(P.CTBGAUGE_H, 5),
        ODGAUGE_Y: num(P.ODGAUGE_Y, 6), ODGAUGE_Z: num(P.ODGAUGE_Z, 50), ODGAUGE_W: num(P.ODGAUGE_W, 48), ODGAUGE_H: num(P.ODGAUGE_H, 5),
        LVL_Y: num(P.LVL_Y, 12), LVL_Z: num(P.LVL_Z, 50), LVL_W: num(P.LVL_W, 48), LVL_H: num(P.LVL_H, 48),
        GAUGE_N: str(P.GAUGE_N, 'HIDEOD'), GAUGE_NX: str(P.GAUGE_NX, 'HIDECT'), GAUGE_NL: str(P.GAUGE_NL, 'HIDELVL')
    };
    const FLEE = {
        BC: json(P.ESCGAUGE_BC, [[0, 0, 0, 255], [32, 48, 64, 255]]), GC: json(P.ESCGAUGE_GC, [[64, 174, 108, 255], [160, 255, 236, 255]]), XY: json(P.ESCGAUGE_XY, [416, 22]),
        W: num(P.ESCGAUGE_W, 192), H: num(P.ESCGAUGE_H, 6), TEXT_SIZE: num(P.ESCTEXT_SIZE, 18), TEXT: str(P.ESCTEXT, 'ESCAPE'), POS: num(P.ESCTEXT_POS, 1), ALIGN: num(P.ESCTEXT_ALIGN, 2)
    };
    const HPG = { M: str(P.HP_GAUGE_M, 'HIDEHP'), BOSS: str(P.HP_GAUGE_BOSS, 'BOSSHP'), W: num(P.HP_GAUGE_W, 48), H: num(P.HP_GAUGE_H, 5), S: num(P.HP_GAUGE_S, 8),
        T: num(P.HP_GAUGE_T, 1280), O: num(P.HP_GAUGE_O, 16), V: bool(P.HP_GAUGE_V, true) };
    const COMMANDNAME = json(P.COMMANDNAME, [[255, 255, 255, 255], [0, 0, 0, 255]]);
    const N01 = () => VX.N01;
    const rgba = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] === undefined ? 255 : c[3]) / 255})`;
    const WLH = 24;

    let BATTLE_ON = false;
    VX.battleActive = () => BATTLE_ON;
    const msgVisible = () => $gameMessage.isBusy();

    // ---- Game_Battler: CT and chant gauges (STR33a) ---------------------------------------------
    const B = Game_BattlerBase.prototype;
    const noteRate = (objs, word) => {
        let rate = 1.0;
        const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\[(\\d+)%\\]');
        for (const o of objs) { if (!o) continue; const m = re.exec(o.note || ''); if (m) rate *= Number(m[1]) / 100.0; }
        return rate;
    };
    B.rrCtspeedRate = function() { if (this._rrCtspeedRate == null) this.rrCtspeedRateSet(); return this._rrCtspeedRate; };
    B.rrCtspeedRateSet = function() {
        const objs = this.rrVxStates().concat(this.isActor() ? this.rrVxEquips() : []);
        this._rrCtspeedRate = noteRate(objs, CTB.CT_CT_WORD);
    };
    B.rrAwspeedRate = function() { if (this._rrAwspeedRate == null) this.rrAwspeedRateSet(); return this._rrAwspeedRate; };
    B.rrAwspeedRateSet = function() {
        const objs = this.rrVxStates().concat(this.isActor() ? this.rrVxEquips() : []);
        this._rrAwspeedRate = noteRate(objs, CTB.CT_AW_WORD);
    };
    B.rrMaxCtbGauge = function() { return CTB.CT_MAX; };
    Object.defineProperty(B, 'rrCtbGauge', {
        get() { if (this._rrCtbGauge == null) this._rrCtbGauge = 0; return this._rrCtbGauge; },
        set(n) {
            if (this._rrCtbGauge == null) this._rrCtbGauge = 0;
            this._rrCtbGauge = Math.max(Math.min(this.rrMaxCtbGauge(), n), 0);
            if (this._rrCtbGauge >= this.rrMaxCtbGauge()) this._rrCtbActionstart = true;
        },
        configurable: true
    });
    B.rrCtbGaugeGain = function() {
        if (!this.rrVxMovable()) return;
        if (this.rrCtbGauge >= this.rrMaxCtbGauge()) return;
        this.rrCtbGauge += this.agi * 1.0 / $gameTroop._rrCtbSpeed * CTB.ctspeed() * this.rrCtspeedRate();
    };
    B.rrAwGaugeClear = function() {
        this._rrAwGauge = 0;
        this._rrAwCtbActionstart = false;
        this._rrActionWaiting = false;
        this._rrActionWaitspeed = 0;
    };
    Object.defineProperty(B, 'rrAwGauge', {
        // STR33 resets the gauge while @aw (the last value set) is nil, not @aw_gauge.
        get() { if (this._rrAw == null) this._rrAwGauge = 0; return this._rrAwGauge || 0; },
        set(n) {
            if (this._rrAwGauge == null) this._rrAwGauge = 0;
            this._rrAw = n;
            this._rrAwGauge = Math.max(Math.min(this.rrMaxCtbGauge(), n), this._rrActionWaiting ? 1 : 0);
            if (this._rrAwGauge >= this.rrMaxCtbGauge()) this._rrAwCtbActionstart = true;
        },
        configurable: true
    });
    B.rrAwGaugeGain = function() {
        if (!this.rrVxMovable()) return;
        if (this.rrAwGauge >= this.rrMaxCtbGauge()) return;
        let sp = this.agi * 1.0 / $gameTroop._rrCtbSpeed * CTB.ctspeed();
        sp *= this._rrActionWaitspeed * this.rrAwspeedRate();
        this.rrAwGauge += sp;
    };
    const _addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        _addState.call(this, stateId);
        if (!this.rrVxMovable()) { this._rrCtbGauge = 0; this.rrAwGaugeClear(); }
        this.rrCtspeedRateSet();
        this.rrAwspeedRateSet();
    };
    const _removeState = Game_Battler.prototype.removeState;
    Game_Battler.prototype.removeState = function(stateId) {
        _removeState.call(this, stateId);
        this.rrCtspeedRateSet();
        this.rrAwspeedRateSet();
    };
    /** Game_Battler#make_action: may the battler choose an action (its gauge is full)? */
    B.rrCtbMakeActionReady = function() { return !!this._rrCtbActionstart; };
    const _actorMake = Game_Actor.prototype.rrVxMakeAction;
    Game_Actor.prototype.rrVxMakeAction = function() {
        if (!this.rrCtbMakeActionReady()) return;
        _actorMake.call(this);
    };
    const _enemyMake = Game_Enemy.prototype.rrVxMakeAction;
    Game_Enemy.prototype.rrVxMakeAction = function() {
        if (!this.rrCtbMakeActionReady()) return;
        _enemyMake.call(this);
        this._rrCtbSelfTurn = (this._rrCtbSelfTurn || 0) + 1;
    };
    // Enemies count their own actions for their turn conditions.
    Game_Enemy.prototype.rrVxTurnCountForActions = function() { return this._rrCtbSelfTurn || 0; };
    /** count_damage: COUNTDAMAGE[n] (or HEAVY weapons, Intimidate) pushes the gauge back n%. */
    B.rrCountDamage = function(obj, action = 0) {
        let ct = null;
        if (typeof action !== 'number') {
            const m = new RegExp(CTB.CT_DM_WORD + '\\[(\\d+)\\]').exec(action.note || '');
            const n = new RegExp(CTB.CT_DM_WORD + '\\[\\-(\\d+)\\]').exec(action.note || '');
            ct = m ? Number(m[1]) : n ? -Number(n[1]) : 0;
            if (obj.isActor() && action.isSkill && action.isSkill() && action.id === 160 && obj.rrVxSkillLearn(172)) ct = 50;
        } else if (obj.isActor()) {
            for (const w of obj.rrVxWeapons().filter(Boolean)) if (w.note.includes('HEAVY')) ct = 50;
        } else ct = action;
        if (ct == null) ct = 0;
        if (this._rrActionWaiting) {
            if (this.rrAwGauge < this.rrMaxCtbGauge() && this.rrAwGauge !== 0) {
                this.rrAwGauge -= (this.rrMaxCtbGauge() / 100.0) * ct;
                if (ct > 0) $gameVariables.setValue(165, vars(165) + 1);
            }
        } else if (this.rrCtbGauge < this.rrMaxCtbGauge() && this.rrCtbGauge !== 0) {
            this.rrCtbGauge -= (this.rrMaxCtbGauge() / 100.0) * ct;
            if (ct > 0) $gameVariables.setValue(165, vars(165) + 1);
        }
    };
    const _attackEffect = B.rrVxAttackEffect;
    B.rrVxAttackEffect = function(attacker) {
        _attackEffect.call(this, attacker);
        const r = this.rrVxResult();
        if (r.skipped || r.missed || r.evaded || r.hpDamage === 0) return;
        this.rrCountDamage(attacker, CTB.CT_DM_ATTACK);
    };
    const _skillEffect = B.rrVxSkillEffect;
    B.rrVxSkillEffect = function(user, skill) {
        _skillEffect.call(this, user, skill);
        const r = this.rrVxResult();
        if (r.skipped || r.missed || r.evaded || (skill.physical_attack && r.hpDamage === 0)) return;
        if (skill.physical_attack) this.rrCountDamage(user); else this.rrCountDamage(user, skill);
    };
    const _itemEffect = B.rrVxItemEffect;
    B.rrVxItemEffect = function(user, item) {
        _itemEffect.call(this, user, item);
        const r = this.rrVxResult();
        if (r.skipped || r.missed || r.evaded || (item.physical_attack && r.hpDamage === 0)) return;
        this.rrCountDamage(user, item);
    };
    const _changeEquip = Game_Actor.prototype.changeEquip;
    Game_Actor.prototype.changeEquip = function(slotId, item) {
        _changeEquip.call(this, slotId, item);
        this.rrCtspeedRateSet();
        this.rrAwspeedRateSet();
    };
    const _discardEquip = Game_Actor.prototype.discardEquip;
    Game_Actor.prototype.discardEquip = function(item) {
        _discardEquip.call(this, item);
        this.rrCtspeedRateSet();
        this.rrAwspeedRateSet();
    };
    const _enemySetup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _enemySetup.call(this, enemyId, x, y);
        this._rrCtbSelfTurn = 0;
    };

    // ---- Game_Troop / Game_Party / Game_Temp (STR33a) ------------------------------------------------
    const ctbSpeedSet = () => idiv(VX.averageAgi($gameParty) + VX.averageAgi($gameTroop), 2);
    const _troopClear = Game_Troop.prototype.clear;
    Game_Troop.prototype.clear = function() {
        _troopClear.call(this);
        this._rrCtbSpeed = 0;
        this._rrEscapeCount = 0;
        this._rrMaxEscapeCount = 0;
        this._rrEscPAverage = 0;
        this._rrEscTAverage = 0;
    };
    const _troopSetup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _troopSetup.call(this, troopId);
        this._rrCtbSpeed = ctbSpeedSet();
    };
    Game_Troop.prototype.rrVxIncreaseTurn = function() {
        this.increaseTurn();
        this._rrCtbSpeed = ctbSpeedSet();
    };
    Game_Troop.prototype.rrCanEscape = function() { return BattleManager.canEscape(); };
    const _gainItem = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
        _gainItem.call(this, item, amount, includeEquip);
        if (this.inBattle()) VX.atbItemRefresh = true;
    };

    // ---- the cursor (STR11c, STR33xx) ----------------------------------------------------------
    class Sprite_RrBattleCursor extends VX.Sprite_RrVx {
        initialize() {
            super.initialize(VX.loadSystem(CURSOR.CURSOR));
            this.srcRect(0, 0, CURSOR.CW, CURSOR.CH);
            this.ox = idiv(CURSOR.CW, 2);
            this.oy = idiv(CURSOR.CH, 2);
            this._wait = CURSOR.WAIT;
            this.x = idiv(608, 2);
            this.y = 480;
            this.z = 25;
            this.xx = this.x;
            this.yy = this.y;
            this.type = 0;
            this.rrApply();
        }
        rrVxUpdate() {
            const s = CURSOR.SPEED - 1;
            this.x = idiv(this.x * s + this.xx, CURSOR.SPEED);
            this.y = idiv(this.y * s + this.yy, CURSOR.SPEED);
            this._wait -= 1;
            if (this._wait <= 0) {
                this._wait = CURSOR.WAIT;
                let sx = this.srcX + CURSOR.CW;
                if ((this.bitmap.width || 128) <= sx) sx = 0;
                this.srcRect(sx, CURSOR.CH * this.type, CURSOR.CW, CURSOR.CH);
            }
            this.rrApply();
        }
        update() { Sprite.prototype.update.call(this); }
    }
    mzGlobal('Sprite_RrBattleCursor', Sprite_RrBattleCursor);
    // Sprite_Battler: the battler the cursor is on flashes white.
    const SBS = VX.Sprite_RrSbsBattler;
    const _sbsUpdate = SBS.prototype.update;
    SBS.prototype.update = function() {
        _sbsUpdate.call(this);
        const b = this.battler;
        if (b && b._rrCursorFlash && !b.isDead() && this._effectDuration <= 0) b._rrWhiteFlash = true;
        if (b && b.isEnemy() && this._rrGauges) this.rrUpdateEnemyGauges();
    };

    // ---- the enemy gauges (STR33g2 CT, overdrive and level; STR15 HP) -------------------------------------
    const gaugeBitmap = (w, h, rows) => {
        const bitmap = new Bitmap(w, h * rows.length);
        rows.forEach((row, i) => row(bitmap, i * h));
        return bitmap;
    };
    const cellColor = (cell, mode) => (VX.cellColor ? VX.cellColor(cell, mode) : [255, 255, 255, 255]);
    SBS.prototype.rrMakeEnemyGauges = function() {
        const b = this.battler;
        const note = () => ($dataEnemies[b.enemyId()] ? String($dataEnemies[b.enemyId()].note || '') : '');
        const layer = this._layer;
        const W = EG.CTBGAUGE_W, H = EG.CTBGAUGE_H;
        const ctb = gaugeBitmap(W, H, [
            (bm, y) => { bm.fillRect(0, y, W, H, rgba(EG.CTBGAUGE_BC[0])); bm.fillRect(1, y + 1, W - 2, H - 2, rgba(EG.CTBGAUGE_BC[1])); },
            (bm, y) => bm.gradientFillRect(1, y + 1, W - 2, H - 2, rgba(EG.CTBGAUGE_GC[0]), rgba(EG.CTBGAUGE_GC[1])),
            (bm, y) => bm.gradientFillRect(1, y + 1, W - 2, H - 2, rgba(EG.CTBGAUGE_AW[0]), rgba(EG.CTBGAUGE_AW[1]))
        ]);
        const mk = (bitmap, w, h, sy, x, y, z) => {
            const s = new VX.Sprite_RrVx(bitmap);
            s.srcRect(0, sy, w, h);
            s.x = x; s.y = y; s.z = z; s.ox = idiv(w, 2); s.oy = h / 2; s.opacity = 0;
            s.update = function() { Sprite.prototype.update.call(this); };
            s.rrApply();
            layer.addChild(s);
            return s;
        };
        const gx = b.screenX() + 32;
        const g = this._rrGauges = {};
        g.ctbA = mk(ctb, W, H, 0, gx, b.screenY() - 16 + EG.CTBGAUGE_Y, 200 + EG.CTBGAUGE_Z);
        g.ctbB = mk(ctb, W, H, H, gx, b.screenY() - 16 + EG.CTBGAUGE_Y, 220 + EG.CTBGAUGE_Z);
        g.ctb = b.rrCtbGauge;
        g.ctbW = W + 1;
        g.ctbO = 0;
        const OW = EG.ODGAUGE_W, OH = EG.ODGAUGE_H;
        const od = gaugeBitmap(OW, OH, [
            (bm, y) => { bm.fillRect(0, y, OW, OH, rgba(EG.ODGAUGE_BC[0])); bm.fillRect(1, y + 1, OW - 2, OH - 2, rgba(EG.ODGAUGE_BC[1])); },
            (bm, y) => bm.gradientFillRect(1, y + 1, OW - 2, OH - 2, rgba(EG.ODGAUGE_GC[0]), rgba(EG.ODGAUGE_GC[1]))
        ]);
        g.odA = mk(od, OW, OH, 0, gx, b.screenY() - 16 + EG.ODGAUGE_Y, 200 + EG.ODGAUGE_Z);
        g.odB = mk(od, OW, OH, OH, gx, b.screenY() - 16 + EG.ODGAUGE_Y, 220 + EG.ODGAUGE_Z);
        g.odB.setSrcW(1);
        g.odW = 1;
        g.overdrive = b.rrOverdrive();
        g.odO = 0;
        const lvl = VX.newBitmap(EG.LVL_W, EG.LVL_H);
        lvl.fontSize = VX.rubyFont(18);
        g.lvl = new VX.Sprite_RrVx(lvl);
        g.lvl.x = gx; g.lvl.y = b.screenY() - 28 + EG.LVL_Y; g.lvl.z = 200 + EG.LVL_Z;
        g.lvl.ox = idiv(EG.LVL_W, 2); g.lvl.oy = -6; g.lvl.opacity = 0;
        g.lvl.srcRect(0, 0, EG.LVL_W, EG.LVL_H);
        g.lvl.update = function() { Sprite.prototype.update.call(this); };
        g.lvl.rrApply();
        layer.addChild(g.lvl);
        g.lvlO = 0;
        g.lvlUpdate = true;
        const n = note();
        g.ctbA.visible = g.ctbB.visible = !n.includes(EG.GAUGE_NX);
        g.odVisible = !n.includes(EG.GAUGE_N);
        g.odA.visible = g.odB.visible = g.odVisible;
        g.lvl.visible = !n.includes(EG.GAUGE_NL);
        this.rrMakeHpGauge();
        g.hpVisible = !note().includes(HPG.M);
        for (const s of g.hp) s.visible = g.hpVisible;
    };
    // The enemy's HP gauge: the element it is weak to colours it (Pain, Fire, Ice, Shock, Weak).
    SBS.prototype.rrMakeHpGauge = function() {
        const b = this.battler, g = this._rrGauges;
        const mode = vars(80);
        const boss = () => ($dataEnemies[b.enemyId()] ? String($dataEnemies[b.enemyId()].note || '') : '').includes(HPG.BOSS) && sw(38);
        let gw = HPG.W, gh = HPG.H;
        if (boss()) { gw = 544; gh = 10; }
        const f = [cellColor(23, mode), cellColor(22, mode)];
        let c;
        if (b.rrPain() > 0) c = [cellColor(17, mode), cellColor(0, mode)];
        else if (b.rrVxElementRate(6) < 100) c = [cellColor(24, mode), cellColor(25, mode)];
        else if (b.rrVxElementRate(7) < 100) c = [cellColor(26, mode), cellColor(27, mode)];
        else if (b.rrVxElementRate(8) < 100) c = [cellColor(28, mode), cellColor(29, mode)];
        else if (b.rrVxStateProbability(5) < 60) c = [cellColor(30, mode), cellColor(31, mode)];
        else c = [cellColor(3, mode), cellColor(5, mode)];
        const bm = gaugeBitmap(gw, gh, [
            (x, y) => { x.fillRect(0, y, gw, gh, rgba(f[0])); x.fillRect(1, y + 1, gw - 2, gh - 2, rgba(f[1])); },
            (x, y) => x.gradientFillRect(1, y + 1, gw - 2, gh - 2, rgba(c[0]), rgba(c[1]))
        ]);
        if (g.hp) for (const s of g.hp) s.rrDispose();
        g.hp = [];
        for (let i = 0; i < 2; i++) {
            const s = new VX.Sprite_RrVx(bm);
            s.srcRect(0, i === 1 ? gh : 0, gw, gh);
            s.x = boss() ? 304 : b.screenX() + 32;
            s.y = b.screenY() + 2;
            if (boss()) {
                s.y = 32;
                let m = 0;
                for (const member of $gameTroop.members()) {
                    const isBoss = $dataEnemies[member.enemyId()] && String($dataEnemies[member.enemyId()].note || '').includes(HPG.BOSS) && member.isAlive();
                    if (isBoss) { if (member.index() === b.index()) break; m += 1; }
                }
                s.y -= m * 18;
            }
            s.ox = gw / 2; s.oy = gh / 2;
            s.z = 200 + (i === 1 ? 20 : 0);
            s.opacity = 255;
            s.update = function() { Sprite.prototype.update.call(this); };
            s.rrApply();
            this._layer.addChild(s);
            g.hp.push(s);
        }
        g.enid = b.enemyId();
        g.hpValue = b.hp;
        g.hpGaugeWidth = boss() ? 481 : HPG.W + 1;
        g.hpOpacity = 255;
        g.elements = [b.rrVxElementRate(6), b.rrVxElementRate(7), b.rrVxElementRate(8), b.rrVxStateProbability(5), b.rrPain()];
        g.maxHp = b.mhp;
        g.resetGauge = false;
    };
    SBS.prototype.rrUpdateEnemyGauges = function() {
        const b = this.battler, g = this._rrGauges;
        // CT (purple while chanting)
        let gauge = b.rrCtbGauge;
        if (b.rrAwGauge > 0) { gauge = b.rrAwGauge; g.ctbB.setSrcY(EG.CTBGAUGE_H * 2); } else g.ctbB.setSrcY(EG.CTBGAUGE_H);
        if (g.ctb !== gauge) {
            g.ctbW = trunc(EG.CTBGAUGE_W * (gauge / (b.rrMaxCtbGauge() * 1.0)) + 1);
            g.ctb = gauge;
            g.ctbB.setSrcW(g.ctbW);
        }
        if (b.isAlive()) {
            if (255 > g.ctbO) g.ctbO += 16;
            if (255 > g.lvlO) g.lvlO += 16;
            if (g.lvlUpdate) { this.rrDrawLevel(); g.lvlUpdate = false; }
        } else {
            if (0 < g.ctbO) g.ctbO -= 16;
            if (0 < g.lvlO) g.lvlO -= 16;
            g.lvlUpdate = true;
        }
        g.ctbA.opacity = g.ctbB.opacity = Math.min(255, g.ctbO);
        if (g.lvl.visible) g.lvl.opacity = Math.min(255, g.lvlO);
        for (const s of [g.ctbA, g.ctbB, g.lvl]) s.rrApply();
        // HP (STR15, which this script loads after)
        this.rrUpdateHpGauge();
        // Overdrive
        const note = $dataEnemies[b.enemyId()] ? String($dataEnemies[b.enemyId()].note || '') : '';
        g.odVisible = !note.includes(EG.GAUGE_N);
        g.odA.visible = g.odB.visible = g.odVisible;
        if (!g.odVisible) return;
        g.odB.setSrcY(EG.ODGAUGE_H);
        if (g.overdrive !== b.rrOverdrive()) {
            g.odW = trunc(EG.ODGAUGE_W * (b.rrOverdrive() / (b.rrMaxOverdrive() * 1.0)) + 1);
            g.overdrive = b.rrOverdrive();
        }
        const speed = 8;
        let w = idiv(g.odW + g.odB.srcW * (speed - 1), speed);
        if (w !== g.odW) w += w > g.odW ? -1 : 1;
        if (w <= 1 && g.overdrive > 0) w = 2;
        g.odB.setSrcW(w);
        if (b.isAlive()) { if (255 > g.odO) g.odO += 16; } else if (0 < g.odO) g.odO -= 16;
        g.odA.opacity = g.odB.opacity = Math.min(255, g.odO);
        g.odA.rrApply(); g.odB.rrApply();
    };
    const AFFIX = { 1: 'Regen.', 2: 'Deadly.', 3: 'Hearty', 4: 'Sharp', 5: 'Expl.', 6: 'Daunt.' };
    SBS.prototype.rrDrawLevel = function() {
        const b = this.battler, bm = this._rrGauges.lvl.bitmap;
        bm.clear();
        bm.fontSize = VX.rubyFont(18);
        const draw = (y, text, c) => { bm.textColor = rgba(c); bm.drawText(text, 0, y, EG.LVL_W, EG.LVL_H, 'center'); };
        const levelColor = () => (vars(23) > vars(24) + 3 ? [255, 0, 0] : vars(23) > vars(24) ? [255, 255, 0] : [255, 255, 255]);
        const level = () => draw(0, 'Lvl. ' + vars(23), levelColor());
        const members = $gameTroop.members();
        const elite = members[1] === b ? [91, 93] : members[2] === b ? [92, 94] : null;
        if (!elite) { level(); return; }
        if (AFFIX[vars(elite[0])]) draw(0, AFFIX[vars(elite[0])], [255, 0, 0]); else level();
        if (AFFIX[vars(elite[1])]) draw(18, AFFIX[vars(elite[1])], [255, 0, 0]);
    };
    SBS.prototype.rrUpdateHpGauge = function() {
        const b = this.battler, g = this._rrGauges;
        const note = () => ($dataEnemies[g.enid] ? String($dataEnemies[g.enid].note || '') : '');
        if (g.enid !== b.enemyId()) {
            g.enid = b.enemyId();
            g.hpVisible = !note().includes(HPG.M);
            for (const s of g.hp) s.visible = g.hpVisible;
        }
        if (!g.hpVisible) return;
        if (g.resetGauge && b.isAlive()) {
            for (const s of g.hp) s.opacity = 0;
            this.rrMakeHpGauge();
            for (const s of g.hp) s.visible = g.hpVisible;
        }
        const boss = note().includes(HPG.BOSS) && sw(38);
        const rate = b.hp / (g.maxHp * 1.0);
        const w = boss ? 544 : HPG.W;
        if (g.hpValue !== b.hp || g.hpGaugeWidth !== trunc(w * rate + 1)) {
            g.hpGaugeWidth = trunc(w * rate + 1);
            g.hpOpacity = HPG.T;
            g.hpValue = b.hp;
        }
        const bar = g.hp[1];
        let width = idiv(g.hpGaugeWidth + bar.srcW * (HPG.S - 1), HPG.S);
        if (width !== g.hpGaugeWidth) width += width > g.hpGaugeWidth ? -1 : 1;
        if (width <= 1 && g.hpValue > 0) width = 2;
        bar.setSrcW(width);
        if (HPG.V && b._rrCursorFlash) { if (g.hpOpacity <= HPG.T / 2) g.hpOpacity += HPG.O * 2; }
        else if (g.hpOpacity > 0) g.hpOpacity -= HPG.O;
        if (g.elements[0] !== b.rrVxElementRate(6) || g.elements[1] !== b.rrVxElementRate(7) || g.elements[2] !== b.rrVxElementRate(8)
            || g.elements[3] !== b.rrVxStateProbability(5) || (g.elements[4] !== b.rrPain() && b.rrPain() === 0) || b.mhp !== g.maxHp) g.resetGauge = true;
        for (const s of g.hp) {
            if (!b.isAlive()) { s.opacity = 0; g.resetGauge = true; } else s.opacity = 255;
            s.rrApply();
        }
    };
    const _sbsMake = SBS.prototype.makeBattler;
    SBS.prototype.makeBattler = function() {
        _sbsMake.call(this);
        if (this.battler.isEnemy() && !this._rrGauges) this.rrMakeEnemyGauges();
    };
    SBS.prototype.rrDisposeExtras = function() {
        const g = this._rrGauges;
        if (!g) return;
        for (const s of [g.ctbA, g.ctbB, g.odA, g.odB, g.lvl].concat(g.hp || [])) if (s) s.rrDispose();
        this._rrGauges = null;
    };

    // Sprite_Base#cell_color (Thrall's palette, with the colour-blind modes of variable 80).
    const CELL = {
        0: { 0: [255, 255, 255], 1: [132, 170, 255], 2: [255, 255, 64], 3: [255, 32, 32], 4: [32, 32, 64], 5: [255, 56, 16], 6: [128, 255, 128], 7: [192, 128, 128], 8: [160, 160, 160],
            9: [102, 204, 64], 10: [32, 160, 214], 11: [192, 128, 255], 12: [255, 204, 32], 13: [102, 224, 255], 14: [255, 120, 76], 15: [255, 255, 64], 16: [128, 128, 128], 17: [192, 192, 192],
            18: [0, 160, 64], 19: [0, 224, 96], 20: [255, 255, 160], 21: [0, 0, 0], 22: [32, 48, 64], 23: [0, 0, 0], 24: [164, 128, 0], 25: [224, 128, 0], 26: [0, 164, 164], 27: [0, 224, 224],
            28: [164, 0, 164], 29: [224, 0, 224], 30: [82, 164, 0], 31: [82, 224, 0] },
        1: { 0: [0, 0, 0], 1: [132, 170, 255], 2: [251, 223, 67], 12: [251, 223, 67], 3: [146, 129, 18], 9: [146, 129, 18], 4: [32, 32, 64], 5: [173, 161, 78], 6: [181, 187, 223], 14: [181, 187, 223],
            7: [110, 102, 79], 30: [110, 102, 79], 8: [191, 191, 191], 17: [191, 191, 191], 10: [83, 106, 171], 11: [96, 159, 255], 29: [96, 159, 255], 13: [213, 193, 101], 24: [213, 193, 101],
            15: [252, 231, 114], 16: [143, 143, 143], 31: [143, 143, 143], 18: [32, 95, 191], 28: [32, 95, 191], 19: [126, 144, 255], 20: [224, 209, 140], 25: [224, 209, 140], 21: [0, 0, 0], 23: [0, 0, 0],
            22: [32, 48, 64], 26: [135, 140, 167], 27: [200, 201, 231] },
        2: { 0: [0, 0, 0], 1: [132, 170, 255], 2: [255, 217, 168], 12: [255, 217, 168], 3: [164, 122, 0], 9: [164, 122, 0], 4: [32, 32, 64], 5: [187, 156, 64], 6: [184, 185, 234], 14: [184, 185, 234],
            7: [117, 99, 92], 30: [117, 99, 92], 8: [191, 191, 191], 17: [191, 191, 191], 10: [60, 109, 178], 11: [93, 164, 236], 29: [93, 164, 236], 13: [238, 183, 101], 24: [238, 183, 101],
            15: [255, 227, 190], 16: [143, 143, 143], 31: [143, 143, 143], 18: [28, 99, 171], 28: [28, 99, 171], 19: [109, 146, 197], 20: [242, 201, 140], 25: [242, 201, 140], 21: [0, 0, 0], 23: [0, 0, 0],
            22: [32, 48, 64], 26: [138, 138, 175], 27: [202, 203, 239] },
        3: { 0: [0, 0, 0], 1: [132, 170, 255], 2: [255, 212, 228], 12: [255, 212, 228], 3: [215, 88, 93], 9: [215, 88, 93], 4: [32, 32, 64], 5: [225, 130, 134], 6: [134, 199, 215], 14: [134, 199, 215],
            7: [41, 112, 121], 30: [41, 112, 121], 8: [191, 191, 191], 17: [191, 191, 191], 10: [0, 120, 128], 11: [186, 154, 161], 29: [186, 154, 161], 13: [236, 177, 190], 24: [236, 177, 190],
            15: [255, 223, 235], 16: [143, 143, 143], 31: [143, 143, 143], 18: [122, 90, 96], 28: [122, 90, 96], 19: [64, 154, 160], 20: [241, 197, 206], 25: [241, 197, 206], 21: [0, 0, 0], 23: [0, 0, 0],
            22: [32, 48, 64], 26: [100, 149, 161], 27: [164, 213, 225] }
    };
    if (!VX.cellColor) VX.cellColor = (cell, mode) => { const t = CELL[mode]; const c = t && t[cell]; return c ? c.concat([255]) : [0, 0, 0, 255]; };

    // ---- the flee gauge and the turn order (STR33g3) ---------------------------------------------------
    class Sprite_RrFleeGauge extends Sprite {
        initialize() {
            super.initialize();
            this.z = 50;
            this._escOpacity = 0;
            this._escCount = $gameTroop._rrEscapeCount;
            const back = new Bitmap(FLEE.W, FLEE.H + FLEE.TEXT_SIZE);
            const icon = VX.newBitmap(FLEE.W, 24);
            back.fillRect(0, 0, FLEE.W, FLEE.H, rgba(FLEE.BC[0]));
            back.fillRect(1, 1, FLEE.W - 2, FLEE.H - 2, rgba(FLEE.BC[1]));
            icon.fontSize = VX.rubyFont(FLEE.TEXT_SIZE);
            if (BattleManager.canEscape()) {
                icon.drawText(FLEE.TEXT, 0, 0, FLEE.W - 28, FLEE.TEXT_SIZE, ['left', 'center', 'right'][FLEE.ALIGN]);
                const ic = typeof VX.escapeKeyIcon === 'function' ? VX.escapeKeyIcon() : ($gameSystem.rrControls ? null : null);
                if (ic != null) {
                    const set = VX.loadSystem('IconSet');
                    const draw = () => icon.blt(set, (ic % 16) * 24, idiv(ic, 16) * 24, 24, 24, FLEE.W - 24, -5);
                    if (set.isReady()) draw(); else set.addLoadListener(draw);
                }
            }
            const bar = new Bitmap(FLEE.W, FLEE.H);
            bar.gradientFillRect(1, 1, FLEE.W - 2, FLEE.H - 2, rgba(FLEE.GC[0]), rgba(FLEE.GC[1]));
            this._back = new Sprite(back); this._back.x = FLEE.XY[0]; this._back.y = FLEE.XY[1]; this._back.opacity = 0;
            this._gauge = new Sprite(bar); this._gauge.x = FLEE.XY[0]; this._gauge.y = FLEE.XY[1] + (FLEE.POS === 0 ? FLEE.TEXT_SIZE : 0); this._gauge.opacity = 0;
            this._gauge.setFrame(0, 0, this.width_(), FLEE.H);
            this._icon = new Sprite(icon); this._icon.x = FLEE.XY[0]; this._icon.y = 0;
            this._priority = new Sprite(new Bitmap(120, 88));
            this._priority.visible = false;
            this._priority.y = sw(38) ? 44 : 0;
            this._order = [];
            this._queuedFull = [];
            for (const s of [this._back, this._gauge, this._icon, this._priority]) this.addChild(s);
            $gameTemp._rrBattlerQueue = [];
        }
        width_() {
            const count = $gameTroop._rrEscapeCount, max = $gameTroop._rrMaxEscapeCount + 1;
            return trunc(FLEE.W * (count / (max * 1.0)) + 1);
        }
        update() {
            super.update();
            if (this._escCount !== $gameTroop._rrEscapeCount) {
                if (this._escCount < $gameTroop._rrEscapeCount) this._escOpacity = Math.max(Math.min(384, this._escOpacity + 16), 0);
                this._gauge.setFrame(0, 0, this.width_(), FLEE.H);
                this._escCount = $gameTroop._rrEscapeCount;
            } else this._escOpacity = Math.max(Math.min(384, this._escOpacity - 4), 0);
            this._back.opacity = this._gauge.opacity = Math.min(255, this._escOpacity);
            this.updatePriority();
        }
        // With switch 56 the next six to act are listed at the top left: the queued, the full, then by time to fill.
        updatePriority() {
            if (msgVisible()) {
                $gameTemp._rrBattlerQueue = [];
                this._queuedFull = [];
                this._order = [];
                this._priority.bitmap.clear();
                this._priority.visible = false;
                return;
            }
            if (!sw(56)) { this._priority.visible = false; return; }
            this._priority.visible = true;
            const ctspeed = CTB.ctspeed();
            const full = (m) => m.rrCtbGauge >= CTB.CT_MAX;
            for (const m of ($gameTemp._rrBattlerQueue || []).slice()) {
                if (!full(m) || m._hp <= 0 || m.restriction() >= 4) $gameTemp._rrBattlerQueue = $gameTemp._rrBattlerQueue.filter(x => x !== m);
            }
            let queue = ($gameTemp._rrBattlerQueue || []).slice();
            for (const m of queue) this._queuedFull = this._queuedFull.filter(x => x !== m);
            queue = queue.filter(m => m._hp > 0);
            const everyone = $gameParty.members().filter(m => m.isAlive()).concat($gameTroop.members().filter(m => m.isAlive()));
            for (const m of everyone) {
                if (queue.includes(m)) continue;
                if (this._queuedFull.includes(m)) {
                    if (m._hp <= 0 || m.restriction() >= 4 || !full(m)) this._queuedFull = this._queuedFull.filter(x => x !== m);
                    continue;
                }
                if (m._hp <= 0 || m.restriction() >= 4 || !full(m)) continue;
                this._queuedFull.push(m);
            }
            queue = queue.concat(this._queuedFull).filter(m => !m._rrActionWaiting);
            const temp = everyone.filter(m => !queue.includes(m) && m._hp > 0 && m.restriction() < 4);
            const rateOf = (m) => (CTB.CT_MAX - m.rrCtbGauge) / (m.agi * 1.0 / $gameTroop._rrCtbSpeed * ctspeed * m.rrCtspeedRate());
            const ordered = [];
            const n = temp.length;
            for (let i = 0; i < n; i++) {
                let rate = CTB.CT_MAX;
                for (const m of temp) {
                    const p = rateOf(m);
                    if (trunc(p) < rate) rate = p;
                    else if (trunc(p) === rate && !m.isActor()) rate = p;
                }
                const at = temp.findIndex(m => rateOf(m) === rate);
                if (at >= 0) { ordered.push(temp[at]); temp.splice(at, 1); }
            }
            queue = queue.concat(ordered);
            if (queue.length === this._order.length && queue.every((m, i) => m === this._order[i])) return;
            this._order = queue.slice();
            const bm = VX.newBitmap(160, 124);
            bm.fontSize = VX.rubyFont(16);
            const back = VX.loadSystem('queue_back');
            let y = 0;
            this._order.slice(0, 6).forEach((m, count) => {
                if (back.isReady()) bm.blt(back, 0, 0, 160, 16, 0, y);
                bm.drawText((count + 1) + '. ', 0, y, 96, 18, 'left');
                if (m.isActor()) {
                    const face = ImageManager.loadFace(m.faceName());
                    if (face.isReady()) bm.blt(face, m.faceIndex() * 96, 0, 96, 16, 12, y);
                } else {
                    let x = 12;
                    if (m.rrSbsAnimeOn()) {
                        const src = VX.loadCharacter(m.rrVxCharacterName());
                        if (src.isReady()) bm.blt(src, idiv(src.width, 2) - 16, idiv(src.height, 12) - 8, 32, 16, 12, y);
                        x += 32;
                    }
                    bm.drawText(m.name(), x, y, 80, 18, 'left');
                }
                y += 18;
            });
            this._priority.bitmap = bm;
        }
    }
    mzGlobal('Sprite_RrFleeGauge', Sprite_RrFleeGauge);

    // ---- the battle message (VX Window_BattleMessage with STR11b's strip) --------------------------------
    class Window_RrVxBattleMessage extends Window_Message {
        initialize(rect) {
            super.initialize(rect);
            this.openness = 255;
            this._rrLines = [];
            this.x = 0; this.y = 0;
            this.backOpacity = 0;
            this.opacity = 0;
            this._rrStr11f = false;
            this.z = 10;
            this.rrRefresh();
        }
        open() { this.openness = 255; }
        close() {}
        // Thrall's message port places and draws battle messages itself (across the top, its own band);
        // without it the window still sits at the top with no frame, as STR11b put it.
        updatePlacement() {
            super.updatePlacement();
            if (!Window_Message.prototype.rrPrescan) { this.x = 0; this.y = 0; }
        }
        updateBackground() {
            super.updateBackground();
            if (!Window_Message.prototype.rrPrescan) { this.backOpacity = 0; this.opacity = 0; }
        }
        terminateMessage() {
            super.terminateMessage();
            this.openness = 255;
            if (this.contents) this.contents.clear();
        }
        rrClear() { this._rrLines = []; this.rrRefresh(); }
        rrLineNumber() { return this._rrLines.length; }
        rrBackOne() { this._rrLines.pop(); this.rrRefresh(); }
        rrBackTo(n) { while (this._rrLines.length > n) this._rrLines.pop(); this.rrRefresh(); }
        rrAddInstantText(text) { this._rrLines.push(text); this.rrRefresh(); }
        rrReplaceInstantText(text) { this._rrLines.pop(); this._rrLines.push(text); this.rrRefresh(); }
        rrLastInstantText() { return this._rrLines.length ? this._rrLines[this._rrLines.length - 1] : ''; }
        rrRefresh() {
            if (!this.contents) return;
            this.contents.clear();
            this.resetFontSettings();
            for (let i = 0; i < this._rrLines.length; i++) {
                this.changeTextColor(ColorManager.normalColor());
                this.contents.drawText(this._rrLines[i], 4, i * WLH, this.contentsWidth() - 8, WLH, 'left');
            }
        }
        rrIsShowing() { return !!this._textState || this.pause || (this._choiceListWindow && this._choiceListWindow.active); }
    }
    mzGlobal('Window_RrVxBattleMessage', Window_RrVxBattleMessage);
    /** STR11b: a dark gradient strip behind the battle messages, as tall as the lines shown. */
    class Sprite_RrMessageStrip extends Sprite {
        initialize(win) {
            const bm = new Bitmap(MSG.BTWIDTH, 96 + 16);
            bm.gradientFillRect(0, 16, MSG.BTWIDTH, 96, rgba(MSG.TEXT_B_COLOR[0]), rgba(MSG.TEXT_B_COLOR[1]));
            super.initialize(bm);
            this._win = win;
            this.z = 0;
            this.x = win.x; this.y = win.y;
            this.setFrame(0, 0, MSG.BTWIDTH, 16);
            this.opacity = 0;
            this._rrOpacity = 0;
        }
        update() {
            super.update();
            const w = this._win;
            if (MSG.N_WINDOW) return;
            const lines = w._rrLines.length;
            // The message port draws the band behind message text; this one is for the battle log's lines.
            const ownBand = !!Window_Message.prototype.rrPrescan;
            const showing = w.rrIsShowing();
            if ((w.visible && lines > 0 && !w._rrStr11f && !(ownBand && showing)) || (showing && !ownBand)) {
                this._rrOpacity = Math.min(255, this._rrOpacity + MSG.W_OPACITY);
                const h = this._frame.height;
                const l = showing ? 4 : lines;
                let nh;
                if (MSG.MOVE) nh = MSG.SPEED === 1 ? 16 + l * 24 : idiv(h + (16 + l * 24) * (MSG.SPEED - 1), MSG.SPEED);
                else nh = 96 + 16;
                this.setFrame(0, 0, MSG.BTWIDTH, nh);
            } else this._rrOpacity = Math.max(0, this._rrOpacity - MSG.W_OPACITY);
            this.opacity = this._rrOpacity;
        }
    }

    // ---- command windows (VX Window_Command, Thrall's text 24 px in) -------------------------------------
    class Window_RrVxCommand extends Window_Command {
        initialize(width, commands, columnMax = 1, rowMax = 0) {
            if (rowMax === 0) rowMax = idiv(commands.length + columnMax - 1, columnMax);
            this._rrCommands = commands.slice();
            this._rrColumnMax = columnMax;
            this._rrEnabled = [];
            super.initialize(new Rectangle(0, 0, width, rowMax * WLH + 32));
            this._rrManual = true;
        }
        updatePadding() { this.padding = 16; }
        itemHeight() { return WLH; }
        maxCols() { return this._rrColumnMax; }
        makeCommandList() { for (const c of this._rrCommands || []) this.addCommand(c, 'c'); }
        rrSetCommands(commands) { this._rrCommands = commands.slice(); this.refresh(); }
        drawItem(index) {
            const rect = this.itemRect(index);
            rect.width -= 8;
            this.contents.clearRect(rect.x, rect.y, rect.width + 8, rect.height);
            this.resetTextColor();
            this.changePaintOpacity(this._rrEnabled[index] !== false);
            // Thrall's Window_Command: the text 24 in.
            if (this.rrVxDrawText) this.rrVxDrawText(rect.x + 24, rect.y, rect.width, rect.height, this.commandName(index));
            else this.contents.drawText(this.commandName(index), rect.x + 24, rect.y, rect.width, rect.height, 'left');
            this.changePaintOpacity(true);
        }
        update() { if (!this._rrManual) super.update(); }
        rrVxUpdate() { super.update(); }
        processHandling() {}
    }
    mzGlobal('Window_RrVxCommand', Window_RrVxCommand);
    class Window_RrVxPartyCommand extends Window_RrVxCommand {
        initialize() {
            super.initialize(128, [TextManager.fight, TextManager.escape], 1, 4);
            this._rrEnabled = [true, BattleManager.canEscape()];
            this.refresh();
            this.deactivate();
        }
    }
    /** The actor commands with their icons (STR31): the attack icon is the element or weapon, Cover, Skills, Items. */
    class Window_RrVxActorCommand extends Window_RrVxCommand {
        initialize() {
            super.initialize(128, [], 1, 4);
            this.deactivate();
            this._nameSprite = new Sprite(VX.newBitmap(this.width, 18));
            this._nameSprite.bitmap.fontSize = VX.rubyFont(16);
            this._nameSprite.bitmap.outlineWidth = 0;
            this.addChild(this._nameSprite);
        }
        setup(actor) {
            this.nameSet(actor);
            const skillName = (() => { const c = VX.vxClass && actor.rrVxClassId ? VX.vxClass(actor.rrVxClassId()) : null; return c && c.skill_name_valid ? c.skill_name : TextManager.skill; })();
            this.rrSetCommands([TextManager.attack, skillName, TextManager.guard, TextManager.item]);
            this.select(0);
            const ic = [];
            const es = actor.rrVxElementSet();
            if (es.includes(6)) ic.push(1);
            if (es.includes(7)) ic.push(2);
            if (es.includes(8)) ic.push(3);
            if (actor.rrVxPlusStateSet().includes(5)) ic.push(4);
            if (ic.length <= 0) { const w = actor.rrVxWeapons()[0]; ic.push(w ? w.icon_index : 222); }
            const draw = this.rrVxDrawIcon ? this.rrVxDrawIcon.bind(this) : (i, x, y) => this.drawIcon(i, x, y);
            draw(ic[rand(ic.length)], 0, 0, true);
            draw(220, 0, 24, true);
            draw(781, 0, 48, true);
            draw(144, 0, 72, true);
        }
        nameSet(actor) {
            const bm = this._nameSprite.bitmap;
            bm.clear();
            if (actor.rrVxSkillLearn(173)) {
                const text = 'Fury: ' + actor.rrVxOverkill();
                drawTextF(bm, 0, 0, bm.width, bm.height, text, 'right', COMMANDNAME[1], [255, 255, 255]);
                this._nameSprite.x = -16;
                this._nameSprite.y = WLH * 4 + 8;
            }
        }
    }
    /** Bitmap#draw_text_f: text with a 1 px outline drawn in four directions (STR33g1's patch). */
    function drawTextF(bm, x, y, w, h, text, align = 'left', outline = [64, 32, 128], color = null) {
        const keep = bm.textColor, keepW = bm.outlineWidth;
        bm.outlineWidth = 0;
        bm.textColor = rgba(outline);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) bm.drawText(text, x + dx, y + dy, w, h, align);
        bm.textColor = color ? rgba(color) : keep;
        bm.drawText(text, x, y, w, h, align);
        bm.textColor = keep;
        bm.outlineWidth = keepW;
    }
    VX.drawTextF = drawTextF;
    /** Window_TargetEnemy as STR33 left it: an invisible row of the living enemies; left and right wrap. */
    class Window_RrVxTargetEnemy extends Window_RrVxCommand {
        initialize() {
            const enemies = $gameTroop.members().filter(e => e.isAlive());
            super.initialize(480, enemies.map(e => e.name()), 8, 1);
            this._enemies = enemies;
            this.z = -100;
            this.backOpacity = 0;
            this.opacity = 0;
            this.contentsOpacity = 0;
            this._eExist = [];
            for (const e of $gameTroop.members()) this._eExist[e.index()] = e.isAlive();
            this.select(0);
        }
        rrVxUpdate() {
            super.rrVxUpdate();
            for (const e of $gameTroop.members()) {
                if (this._eExist[e.index()] !== e.isAlive()) {
                    this._enemies = $gameTroop.members().filter(x => x.isAlive());
                    this.rrSetCommands(this._enemies.map(x => x.name()));
                    this.select(0);
                    this._eExist = [];
                    for (const x of $gameTroop.members()) this._eExist[x.index()] = x.isAlive();
                    break;
                }
            }
        }
        cursorRight() { if (this.maxCols() >= 2 && this.maxItems() > 0) this.smoothSelect((this.index() + 1) % this.maxItems()); }
        cursorLeft() { if (this.maxCols() >= 2 && this.maxItems() > 0) this.smoothSelect((this.index() - 1 + this.maxItems()) % this.maxItems()); }
        cursorDown() {}
        cursorUp() {}
        enemy() { return this._enemies.length === 0 ? $gameTroop.members()[0] : this._enemies[this.index()]; }
    }
    /** Window_BattleStatus (480 × 128): only its cursor shows; STR33g1's sprites draw the rows. */
    class Window_RrVxBattleStatus extends Window_Selectable {
        initialize() {
            super.initialize(new Rectangle(0, 0, 480, 128));
            this.backOpacity = 0;
            this.opacity = 0;
            this._rrManual = true;
            this.deactivate();
            this.select(-1);
        }
        updatePadding() { this.padding = 16; }
        itemHeight() { return WLH; }
        maxItems() { return $gameParty.members().length; }
        maxCols() { return 1; }
        refresh() {}
        drawItem() {}
        cursorRight() {}
        cursorLeft() {}
        update() { if (!this._rrManual) super.update(); }
        rrVxUpdate() { super.update(); }
        processHandling() {}
        setIndex(i) { if (i < 0) this.deselect(); else this.select(i); }
    }
    mzGlobal('Window_RrVxBattleStatus', Window_RrVxBattleStatus);

    /** STR33g1 Battle Status (with the overdrive and wait gauges): sprites per party member. */
    class Sprite_RrThrallBattleStatus extends Sprite {
        initialize() {
            super.initialize();
            this.x = 0; this.y = 480 - 128;
            this.z = 99;
            this._rows = [];
            this._opacity = 0;
            this._animFrame = 20;
            this._stateOpacity = [];
            this._skins = {};
            for (const k of ['BTSKIN_00', 'BTSKIN_01', 'BTSKIN_03', 'BTSKIN_04', 'BTSKIN_100', 'BTSKIN_101', 'BTSKIN_17', 'BTSKIN_18']) this._skins[k] = VX.loadSystem(SKIN[k]);
            this._iconSet = VX.loadSystem('IconSet');
            this._made = false;
        }
        ready() { return Object.values(this._skins).every(b => b.isReady()) && this._iconSet.isReady(); }
        make() {
            this._made = true;
            this._hpgw = this._skins.BTSKIN_01.width;
            this._odgw = this._skins.BTSKIN_100.width;
            this._wagw = this._skins.BTSKIN_17.width;
            $gameParty.members().forEach((a, i) => this.drawItem(i));
        }
        sprite(bitmap, x, y, z) {
            const s = new Sprite(bitmap);
            s.x = x; s.y = y; s.z = z;
            s.opacity = 0;
            return s;
        }
        stateBitmap(actor) {
            const states = actor.rrVxStates().filter(s => !s.extension().includes('HIDEICON'));
            const bm = new Bitmap(Math.max(24, states.length * 24), SKIN.WH06[1]);
            states.forEach((s, i) => { const icon = s.icon_index; bm.blt(this._iconSet, icon % 16 * 24, idiv(icon, 16) * 24, 24, 24, 24 * i, 0); });
            return bm;
        }
        drawItem(index) {
            const actor = $gameParty.members()[index];
            const x = 16 + SKIN.B_XY[0], y = index * 24 + 16 + SKIN.B_XY[1];
            const r = { actor, layer: new Sprite() };
            r.main = this.sprite(this._skins.BTSKIN_00, x + SKIN.XY00[0], y + SKIN.XY00[1], 0);
            r.odSkin = this.sprite(this._skins.BTSKIN_101, x + SKIN.XY101[0], y + SKIN.XY101[1], 0);
            const hpBm = this._skins.BTSKIN_01;
            const hh = idiv(hpBm.height, 4);
            const py = actor.rrPain() > 0 ? 16 : 0;
            r.hp = this.sprite(hpBm, x + SKIN.XY01[0], y + SKIN.XY01[1], 4);
            r.hp.setFrame(0, py, hpBm.width, hh);
            r.hp2 = this.sprite(hpBm, x + SKIN.XY01[0], y + SKIN.XY01[1], 3);
            r.hp2.setFrame(0, py + 8, hpBm.width, hh);
            r.numbers = new Sprite_RrStrNumbers(this._skins.BTSKIN_04, SKIN.NS04);
            r.numbers.x = x + SKIN.XY04[0]; r.numbers.y = y + SKIN.XY04[1]; r.numbers.z = 5;
            r.hpShown = actor.hp;
            r.numbers.set(r.hpShown, actor.hp < idiv(actor.mhp * 3, 10) ? (actor.hp === 0 ? 2 : 1) : 0);
            const odBm = this._skins.BTSKIN_100, oh = idiv(odBm.height, 12);
            r.od = this.sprite(odBm, x + SKIN.XY100[0], y + SKIN.XY100[1], 2);
            r.od.setFrame(0, actor.rrOverdrive() >= 1000 ? oh * 2 : 0, odBm.width, oh);
            r.od2 = this.sprite(odBm, x + SKIN.XY100[0], y + SKIN.XY100[1], 1);
            r.od2.setFrame(0, oh, odBm.width, oh);
            r.odValue = actor.rrOverdrive();
            r.stateSkin = this.sprite(this._skins.BTSKIN_03, x + SKIN.XY03[0], y + SKIN.XY03[1], -2);
            r.states = new Sprite(this.stateBitmap(actor));
            r.states.x = x + SKIN.XY06[0]; r.states.y = y + SKIN.XY06[1]; r.states.z = 1; r.states.opacity = 0;
            r.stateCount = actor.rrVxStates().filter(s => !s.extension().includes('HIDEICON')).length;
            r.stateOx = 0;
            r.stateList = actor._states.slice();
            r.hpW = trunc(this._hpgw * (actor.hp / (actor.mhp * 1.0)) + 1);
            r.odW = actor.rrOverdrive() !== 0 ? trunc(this._odgw * (actor.rrOverdrive() / (actor.rrMaxOverdrive() * 1.0)) + 1) : 0;
            const nameBm = VX.newBitmap(100, 24);
            nameBm.fontSize = VX.rubyFont(16);
            drawTextF(nameBm, 0, 0, 100, 24, actor.name());
            r.name = this.sprite(nameBm, x + 4, y + 2, 0);
            r.nameText = actor.name();
            r.hp.setFrame(0, py, r.hpW, hh);
            r.hp2.setFrame(0, py + 8, r.hpW, hh);
            r.od.setFrame(0, r.od._frame.y, r.odW, oh);
            r.od2.setFrame(0, oh, r.odW, oh);
            r.hpValue = actor.hp;
            // The wait (CT) gauge.
            const waBm = this._skins.BTSKIN_17, wh = idiv(waBm.height, 3);
            r.wa = this.sprite(waBm, x + SKIN.XY17[0], y + SKIN.XY17[1], 4);
            r.waW = trunc(this._wagw * (actor.rrCtbGauge / (actor.rrMaxCtbGauge() * 1.0)) + 1);
            r.wa.setFrame(0, 0, r.waW, wh);
            r.waSkin = this.sprite(this._skins.BTSKIN_18, x + SKIN.XY18[0], y + SKIN.XY18[1], 3);
            r.waValue = actor.rrCtbGauge;
            for (const s of [r.main, r.odSkin, r.od2, r.od, r.hp2, r.hp, r.stateSkin, r.states, r.name, r.waSkin, r.wa]) r.layer.addChild(s);
            r.layer.addChild(r.numbers);
            r.layer.children.sort((a, b) => (a.z || 0) - (b.z || 0));
            this.addChild(r.layer);
            this._rows[index] = r;
        }
        update() {
            super.update();
            if (!this._made) { if (this.ready()) this.make(); else return; }
            for (let i = 0; i < this._rows.length; i++) {
                const r = this._rows[i];
                const a = $gameParty.members()[i];
                if (!a) break;
                if (this._stateOpacity[i] == null) this._stateOpacity[i] = 0;
                this._stateOpacity[i] += 8;
                if (this._opacity < 272) {
                    this._opacity += 8;
                    for (const s of [r.main, r.hp, r.hp2, r.name, r.od, r.odSkin, r.od2, r.wa, r.waSkin]) s.opacity = Math.min(255, this._opacity);
                    r.numbers.setOpacity(Math.min(255, this._opacity));
                }
                if (a.name() !== r.nameText) {
                    r.name.bitmap.clear();
                    drawTextF(r.name.bitmap, 0, 0, 100, 24, a.name());
                    r.nameText = a.name();
                }
                this.updateHp(r, a);
                this.updateOd(r, a);
                if (r.stateCount > 2 && Graphics.frameCount % SKIN.SC06 === 0) r.stateOx += 1;
                if (r.stateCount > 0 && this._stateOpacity[i] < 272) { r.stateSkin.opacity = r.states.opacity = Math.min(255, this._stateOpacity[i]); }
                const shown = (ids) => ids.filter(id => { const s = VX.state(id); return s && !s.extension().includes('HIDEICON'); });
                if (shown(a._states).join() !== shown(r.stateList).join()) {
                    r.stateList = a._states.slice();
                    r.states.bitmap = this.stateBitmap(a);
                    r.stateCount = shown(a._states).length;
                    r.stateOx = 0;
                    this._stateOpacity[i] = 0;
                    r.stateSkin.opacity = r.states.opacity = 0;
                }
                // The state icons show through a viewport two icons wide that scrolls past more.
                const vws = Math.max(24, Math.min(r.stateCount * 24, 48));
                const bw = r.states.bitmap.width;
                r.states.setFrame(bw > vws ? r.stateOx % bw : 0, 0, vws, SKIN.WH06[1]);
                this.updateWa(r, a);
            }
            this._animFrame += 3;
            if (this._animFrame >= 120) this._animFrame = 20;
        }
        updateHp(r, a) {
            if (a.hp !== r.hpShown) {
                const c = a.hp === 0 ? 2 : a.hp < idiv(a.mhp * 3, 10) ? 1 : 0;
                const step = Math.abs(a.hp - r.hpShown) > 1000 ? SKIN.SS04 * 10 : SKIN.SS04;
                if (r.hpShown > a.hp) r.hpShown = Math.max(a.hp, r.hpShown - step);
                else r.hpShown = Math.min(a.hp, r.hpShown + step);
                r.numbers.set(r.hpShown, c);
            }
            if (a.hp !== r.hpValue) { r.hpW = trunc(this._hpgw * (a.hp / (a.mhp * 1.0)) + 1); r.hpValue = a.hp; }
            const hpBm = this._skins.BTSKIN_01, hh = idiv(hpBm.height, 4);
            let w = r.hp._frame.width;
            if (w !== r.hpW) {
                w = idiv(r.hpW + w * (SKIN.GS01 - 1), SKIN.GS01);
                if (w <= 1 && a.hp > 0) w = 2;
            }
            const py = a.rrPain() > 0 ? 16 : 0;
            r.hp.setFrame(0, py, w, hh);
            let w2 = r.hp2._frame.width;
            if (w2 !== w && Graphics.frameCount % 2 === 0) w2 += w2 < w ? 1 : -1;
            if (w2 <= 1 && a.hp > 0) w2 = 2;
            r.hp2.setFrame(0, r.hp2._frame.y, w2, hh);
        }
        updateOd(r, a) {
            if (a.rrOverdrive() !== r.odValue) {
                r.odW = a.rrOverdrive() !== 0 ? trunc(this._odgw * (a.rrOverdrive() / (a.rrMaxOverdrive() * 1.0)) + 1) : 0;
                r.odValue = a.rrOverdrive();
            }
            const odBm = this._skins.BTSKIN_100, oh = idiv(odBm.height, 12);
            let w = r.od._frame.width;
            if (w !== r.odW) {
                w = idiv(r.odW + w * 3, 4);
                if (w <= 1 && a.rrOverdrive() > 0) w = 2;
            }
            r.od.setFrame(0, a.rrOverdrive() >= 1000 ? idiv(this._animFrame, 10) * oh : 0, w, oh);
            let w2 = r.od2._frame.width;
            if (w2 !== w && Graphics.frameCount % 2 === 0) w2 += w2 < w ? 1 : -1;
            if (w2 <= 1 && a.rrOverdrive() > 0) w2 = 2;
            r.od2.setFrame(0, oh, w2, oh);
        }
        updateWa(r, a) {
            const waBm = this._skins.BTSKIN_17, wh = idiv(waBm.height, 3);
            let gauge = a.rrCtbGauge;
            let row;
            if (a.rrAwGauge > 0) { gauge = a.rrAwGauge; row = 2; }
            else if (this._wagw <= r.wa._frame.width) row = 1;
            else row = 0;
            if (gauge !== r.waValue) {
                r.waW = trunc(this._wagw * (gauge / (a.rrMaxCtbGauge() * 1.0)) + 1);
                r.waValue = gauge;
            }
            r.wa.setFrame(0, row * wh, r.waW, wh);
        }
    }
    mzGlobal('Sprite_RrThrallBattleStatus', Sprite_RrThrallBattleStatus);
    /** Sprite_strNumbers: digits from a 10-column, 3-row image (normal, low, zero), leading zeros hidden. */
    class Sprite_RrStrNumbers extends Sprite {
        initialize(bitmap, n) {
            super.initialize();
            this._n = n;
            this._bitmap0 = bitmap;
            this._digits = [];
            for (let i = 0; i < n; i++) { const s = new Sprite(bitmap); s.opacity = 0; this._digits.push(s); this.addChild(s); }
            this._value = 0; this._color = 0;
        }
        set(v, c = 0) {
            this._value = v; this._color = c;
            const bm = this._bitmap0, w = idiv(bm.width, 10), h = idiv(bm.height, 3), s = w;
            const val = [];
            for (let i = 0; i < this._n; i++) val[i] = idiv(v, Math.pow(10, i)) % 10;
            val.reverse();
            for (let i = 0; i < this._n; i++) { if (val[i] === 0 && this._n !== i + 1) val[i] = -1; else break; }
            for (let i = 0; i < this._n; i++) {
                const d = this._digits[i];
                d.x = i * s;
                if (val[i] < 0) d.setFrame(0, 0, 0, 0); else d.setFrame(val[i] * w, c * h, w, h);
            }
        }
        setOpacity(o) { for (const d of this._digits) d.opacity = o; }
    }

    // ---- the battle item list (Thrall's Window_Item in battle: items, then weapons the actor may swap to) ----
    class Window_RrThrallBattleItem extends Window_BattleItem {
        initialize(rect, actor) {
            this._rrActor = actor;
            super.initialize(rect);
            this._rrManual = true;
        }
        updatePadding() { this.padding = 16; }
        itemHeight() { return WLH; }
        maxCols() { return 2; }
        includes(item) {
            if (!item) return false;
            if (DataManager.isWeapon(item)) return true;
            return VX.itemCanUse($gameParty, VX.item(item.id));
        }
        isEnabled() { return true; }
        makeItemList() {
            const v100 = vars(100);
            const sort1 = v100 === 0 ? [9, 14] : [1, 5], sort2 = v100 === 0 ? [1, 5] : [9, 14];
            const data = [];
            const items = $gameParty.items();
            const keys = [0];
            for (const it of items) { const vx = VX.item(it.id); const k = vx ? (v100 === 0 ? vx.mp_recovery_rate : vx.mp_recovery) : 0; if (!keys.includes(k)) keys.push(k); }
            for (let i = Math.min(...keys); i <= Math.max(...keys); i++) {
                for (const it of items) {
                    if (!this.includes(it)) continue;
                    const vx = VX.item(it.id);
                    if (vx && (v100 === 0 ? vx.mp_recovery_rate : vx.mp_recovery) === i) data.push(it);
                }
            }
            for (let i = sort1[0]; i <= sort1[1]; i++) for (let ii = sort2[0]; ii <= sort2[1]; ii++) {
                for (const w of $gameParty.weapons()) {
                    if (this._rrActor && (parseInt(w.description, 10) || 0) > this._rrActor.level) continue;
                    const vx = VX.weapon(w.id);
                    if (vx && vx.element_set.includes(i) && vx.element_set.includes(ii)) data.push(w);
                }
            }
            this._data = data;
        }
        drawItem(index) {
            const item = this.itemAt(index);
            if (!item) return;
            const rect = this.itemLineRect(index);
            rect.width -= 4;
            this.drawItemName(item, rect.x, rect.y, rect.width);
        }
        updateHelp() {
            const item = this.item();
            if (this._helpWindow) this._helpWindow.setText(item ? (DataManager.isWeapon(item) ? 'Change currently equipped weapon' : item.description) : '');
        }
        update() { if (!this._rrManual) super.update(); }
        rrVxUpdate() { super.update(); }
        processHandling() {}
    }
    mzGlobal('Window_RrThrallBattleItem', Window_RrThrallBattleItem);
    class Window_RrThrallBattleSkill extends Window_BattleSkill {
        initialize(rect, actor) {
            super.initialize(rect);
            this._rrManual = true;
            this.setStypeId(0);
            this.setActor(actor);
            this._mpSprite = new Sprite(VX.newBitmap(rect.width, 18));
            this._mpSprite.y = -2;
            this.addChild(this._mpSprite);
            this.rrMpSet();
        }
        updatePadding() { this.padding = 16; }
        itemHeight() { return WLH; }
        maxCols() { return 2; }
        includes(item) { return !!item; }
        isEnabled(item) { return !!this._actor && this._actor.rrVxSkillCanUse(VX.skill(item.id)); }
        selectLast() {
            const id = this._actor && this._actor._rrLastSkillId;
            const at = this._data ? this._data.findIndex(s => s && s.id === id) : -1;
            this.forceSelect(at >= 0 ? at : 0);
        }
        refresh() { super.refresh(); if (this._mpSprite) this.rrMpSet(); }
        /** STR31: " Name MP x/y " over the top edge of the skill list. */
        rrMpSet() {
            const bm = this._mpSprite.bitmap, a = this._actor;
            bm.clear();
            if (!a) return;
            bm.fontSize = VX.rubyFont(16);
            const text = ' ' + a.name() + ' ' + TextManager.mpA + ' ' + a.mp + '/' + a.mmp + ' ';
            drawTextF(bm, 0, 0, bm.width, bm.height, text, 'left', COMMANDNAME[1], COMMANDNAME[0]);
        }
        update() { if (!this._rrManual) super.update(); }
        rrVxUpdate() { super.update(); }
        processHandling() {}
    }
    mzGlobal('Window_RrThrallBattleSkill', Window_RrThrallBattleSkill);

    /** An RGSS viewport for windows: a rectangle on screen, scrolled by ox; what lies outside it is hidden. */
    class Sprite_RrInfoViewport extends Sprite {
        initialize(x, y, w, h) {
            super.initialize();
            this.rect = new Rectangle(x, y, w, h);
            this.ox = 0;
            this.z = 100;
        }
        update() {
            this.x = this.rect.x - this.ox;
            this.y = this.rect.y;
            for (const c of this.children) {
                const sx = this.x + c.x;
                c.renderable = sx >= this.rect.x - 0.5 && sx + c.width <= this.rect.x + this.rect.width + 0.5 + 608;
                c.renderable = c.renderable && sx >= this.rect.x - 0.5;
            }
            super.update();
        }
    }

    // ---- Scene_Battle: VX's scene run as a coroutine ----------------------------------------------------
    // Ruby's battle scene blocks in loops (wait, wait_for_message, playing_action). Each Ruby frame boundary
    // (update_basic's Graphics.update) is a `yield` here; the scene steps the coroutine once a frame.
    const S = Scene_Battle.prototype;
    const _createMessageWindow = Scene_Message.prototype.createMessageWindow;
    S.createMessageWindow = function() {
        const rect = this.messageWindowRect ? this.messageWindowRect() : new Rectangle(0, 0, Graphics.boxWidth, 128);
        this._messageWindow = new Window_RrVxBattleMessage(new Rectangle(0, 0, rect.width || Graphics.boxWidth, 4 * WLH + 32));
        this.addWindow(this._messageWindow);
    };
    S.messageWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, 4 * WLH + 32); };
    if (!_createMessageWindow) S.createMessageWindow = S.createMessageWindow;

    S.create = function() {
        Scene_Message.prototype.create.call(this);
        BATTLE_ON = true;
        $gameParty.onBattleStart(false);
        $gameTroop.onBattleStart(false);
        $gameTroop._rrPreemptive = !!BattleManager._preemptive;
        $gameTroop._rrSurprise = !!BattleManager._surprise;
        $gameTemp._rrNextScene = null;
        VX.statusWindowRefresh = false;
        VX.atbItemRefresh = false;
        this.rrPreload();
        // STR33 start: the escape gauge is set before the battle screen.
        this.rrEscapeCountSet();
        // Scene_Battle#start (088)
        this._rrActionBattlers = [];
        for (const m of $gameParty.members()) { m._rrTempWeapon = m.rrVxWeaponId(); m._rrGuarded = false; }
        this.createSpriteset();
        this._rrGlobal = new VX.Sprite_RrZLayer();
        this.addChild(this._rrGlobal);
        VX.Sprite_RrSbsBattler.globalLayer = this._rrGlobal;
        // An animation's screen flash covers the battlefield (the spriteset), not the windows above it.
        VX.Sprite_RrSbsBattler.viewportFlash = (color, duration) => $gameScreen.startFlash(color, duration);
        this.createWindowLayer();
        Scene_Message.prototype.createAllWindows.call(this);
        // The message window lives with the battle's sprites (VX z 10) under the status and the cursor.
        this._windowLayer.removeChild(this._messageWindow);
        this._rrGlobal.addChild(this._messageWindow);
        this._rrStrip = new Sprite_RrMessageStrip(this._messageWindow);
        this._rrGlobal.addChild(this._rrStrip);
        this.rrCreateInfoViewport();
        // STR33
        VX.atbItemRefresh = false;
        this._messageWindow.z = 10;
        this._rrActionActiveWait = 0;
        this._rrActonPhase = false;
        this._rrProcessP = true;
        this._rrWaitingBattler = [];
        $gameTemp._rrBattlerQueue = [];
        for (const m of $gameParty.members().concat($gameTroop.members())) m.rrVxAction().clear();
        this._rrActorCommandWindow.openness = 0;
        this._rrRealtimeturnCount = 0;
        this._rrEscapeSwitch = false;
        this._rrFlee = new Sprite_RrFleeGauge();
        this._rrGlobal.addChild(this._rrFlee);
    };
    S.rrPreload = function() {
        for (const name of ['IconSet', 'Balloon', 'Counter', 'queue_back', CURSOR.CURSOR, VX.N01.DAMAGE_GRAPHICS, VX.N01.RECOVER_GRAPHICS].concat(Object.keys(SKIN).filter(k => /^BTSKIN_\d+$/.test(k)).map(k => SKIN[k]))) VX.loadSystem(name);
        const img = VX.FLOORS[$gameMap.mapId()] || 'BattleFloor';
        VX.loadSystem('Floors/' + img);
        for (const a of $gameParty.members()) { VX.loadCharacter(a.characterName()); ImageManager.loadFace(a.faceName()); VX.loadCharacter(a.rrSbs_shadow()); }
        const VARIANTS = { $ThrallA: 15, $ThrallB: 15, $ThrallC: 15, $ThrallD: 15, $VampireC: 15, $VampireD: 15, $VampireA: 10, $Pirate: 21 };
        for (const e of $gameTroop.members()) {
            const name = e.battlerName();
            if (e.rrSbsAnimeOn()) VX.loadCharacter(name); else ImageManager.loadEnemy(name);
            if (VARIANTS[name]) for (let i = 1; i <= VARIANTS[name]; i++) VX.loadCharacter(name + i);
            VX.loadCharacter(e.rrSbs_shadow());
        }
        for (const n of ['$Boulder', '$Fog']) VX.loadCharacter(n);
    };
    S.rrCreateInfoViewport = function() {
        this._rrStatusSprites = new Sprite_RrThrallBattleStatus();
        this._rrGlobal.addChild(this._rrStatusSprites);
        this._rrInfoViewport = new Sprite_RrInfoViewport(0, 352, 608, 128);
        this._rrInfoViewport.visible = false;
        this._rrStatusWindow = new Window_RrVxBattleStatus();
        this._rrPartyCommandWindow = new Window_RrVxPartyCommand();
        this._rrActorCommandWindow = new Window_RrVxActorCommand();
        this._rrStatusWindow.x = 128;
        this._rrActorCommandWindow.x = 608;
        for (const w of [this._rrStatusWindow, this._rrPartyCommandWindow, this._rrActorCommandWindow]) this._rrInfoViewport.addChild(w);
        this._rrGlobal.addChild(this._rrInfoViewport);
        this._rrCursor = new Sprite_RrBattleCursor();
        this._rrCursor.visible = false;
        this._rrGlobal.addChild(this._rrCursor);
    };
    S.start = function() {
        Scene_Message.prototype.start.call(this);
        // Thrall's map plays the battle music only with switch 29; otherwise the map's music goes on.
        if (sw(29)) { AudioManager.playBgm($gameSystem.battleBgm()); AudioManager.stopBgs(); }
        else if (BattleManager._mapBgm) BattleManager.replayBgmAndBgs();
        this.startFadeIn(this.fadeSpeed(), false);
        this._rrFlow = this.rrMain();
    };
    S.update = function() {
        const active = this.isActive();
        $gameTimer.update(active);
        $gameScreen.update();
        if (active && this._rrFlow && !this._rrFlowRunning) {
            this._rrFlowRunning = true;
            try {
                const r = this._rrFlow.next();
                if (r.done) this._rrFlow = null;
            } finally { this._rrFlowRunning = false; }
        }
        Scene_Message.prototype.update.call(this);
    };
    S.isBusy = function() { return false; };
    S.stop = function() {
        Scene_Message.prototype.stop.call(this);
        if (this.needsSlowFadeOut()) this.startFadeOut(this.slowFadeSpeed(), false);
        else this.startFadeOut(this.fadeSpeed(), false);
    };
    S.terminate = function() {
        Scene_Message.prototype.terminate.call(this);
        // SBS: a two-weapon actor holding only the left weapon was switched for the battle; switch back.
        for (const m of $gameParty.members()) {
            if (m._rrTwoSwordsChange) {
                m.rrVxChangeEquipById(1, m.rrVxWeaponId());
                m.rrVxChangeEquipById(0, 0);
                m._rrTwoSwordsChange = false;
            }
        }
        BATTLE_ON = false;
        VX.Sprite_RrSbsBattler.globalLayer = null;
        $gameParty.onBattleEnd();
        $gameTroop.onBattleEnd();
        AudioManager.stopMe();
    };
    S.rrMain = function* () {
        yield* this.rrProcessBattleStart();
        for (;;) {
            if (this._rrEnded) return;
            yield;
            if (this._rrEnded) return;
            yield* this.rrUpdate();
        }
    };

    // -- update_basic, wait, wait_for_message (088 with STR33's and the cursor's additions) --
    S.rrUpdateBasic = function* (main = false) {
        this.rrInfoVisibleUpdate();
        if (!main) yield;
        if (!main) {
            yield* this.rrUpdateActiveCommand();
            this.rrUpdateCtb();
            this.rrUpdateInfoViewport();
            this.rrStartAtbActorCommand();
            this.rrUpdateCursor();
        }
    };
    S.rrShowFast = function() { return Input.isPressed('shift') || Input.isPressed('ok'); };
    S.rrWait = function* (duration, noFast = false) {
        for (let i = 0; i < duration; i++) {
            yield* this.rrUpdateBasic();
            if (!noFast && i >= idiv(duration, 2) && this.rrShowFast()) break;
        }
    };
    S.rrWaitForMessage = function* () {
        this._messageWindow.update();
        while (msgVisible()) yield* this.rrUpdateBasic();
    };
    S.rrWaitForAnimation = function* () { while (this._spriteset.rrAnimation()) yield* this.rrUpdateBasic(); };
    S.rrNextScene = function() { return !!$gameTemp._rrNextScene || SceneManager.isSceneChanging() || this._rrEnded; };

    // -- STR33 update (with the cursor before it) --
    S.rrUpdate = function* () {
        this.rrUpdateCursor();
        yield* this.rrUpdateBasic(true);
        this.rrUpdateInfoViewport();
        if (msgVisible()) { this._rrInfoViewport.visible = false; this._messageWindow.visible = true; }
        if (yield* this.rrJudgeWinLoss()) return;
        if (this._rrEscapeSuccess) return;
        yield* this.rrUpdateActiveCommand();
        this.rrUpdateCtb();
        yield* this.rrProcessBattleEvent();
        yield* this.rrProcessAction();
        yield* this.rrProcessBattleEvent();
        if (this._rrEscapeFlag && !this._rrAtbResult) {
            this._rrEscapeFlag = false;
            this._rrEscapeSuccess = true;
            yield* this.rrProcessEscape();
        }
        this.rrStartAtbActorCommand();
    };
    S.rrUpdateInfoViewport = function() {
        this._rrPartyCommandWindow.rrVxUpdate();
        this._rrActorCommandWindow.rrVxUpdate();
        this._rrStatusWindow.rrVxUpdate();
        const vp = this._rrInfoViewport;
        if (this._rrPartyCommandWindow.active && vp.ox > 0) vp.ox -= 16;
        else if (this._rrActorCommandWindow.active && vp.ox < 128) vp.ox += 16;
    };
    S.rrInfoVisibleUpdate = function() {
        const vp = this._rrInfoViewport;
        vp.visible = true;
        const target = this._rrTargetEnemyWindow || this._rrTargetActorWindow;
        if (target) {
            const rx = this._rrPartyCommandWindow.width + target.width;
            vp.rect.x = rx - this._rrActorCommandWindow.width;
            vp.ox = rx;
        } else {
            vp.rect.x = 0;
            vp.ox = this._rrPartyCommandWindow.width;
        }
    };
    S.rrStartActionAtb = function() { return this._rrActionActiveWait > 0 || this._rrActionBattlers.length === 0 || !!this._rrAtbResult; };
    S.rrAtbCount = function() {
        if (this._rrProcessP || msgVisible() || this._rrAtbResult) return true;
        const a = CTB.waitMode();
        return !!((a[0] && this._rrActonPhase) || (a[1] && (this._rrSkillWindow || this._rrItemWindow)) ||
            (a[2] && (this._rrTargetEnemyWindow || this._rrTargetActorWindow)) || (a[3] && this._rrActorCommandWindow.active));
    };
    S.rrEscaping = function() {
        if (CTB.ESC_DISABLE) return false;
        if (!CTB.ESCAPE_SWITCH) return Input.isPressed('pageup');
        if (Input.isTriggered('pageup')) {
            if (this._rrEscapeSwitch) { SoundManager.playCancel(); this._rrEscapeSwitch = false; }
            else { SoundManager.playOk(); this._rrEscapeSwitch = true; }
        }
        return this._rrEscapeSwitch;
    };
    /** update_ctb: the gauges fill, the escape gauge fills or drains, the first ready actor and enemy act. */
    S.rrUpdateCtb = function() {
        if (this._rrActionActiveWait > 0) this._rrActionActiveWait -= 1;
        let escapeNow = false;
        if (Graphics.frameCount % (CTB.EXTEND.update || 1) !== 0) return;
        if (this.rrAtbCount()) return;
        if (CTB.RTT) {
            this._rrRealtimeturnCount += 1;
            if (this._rrRealtimeturnCount >= CTB.RTT_COUNT && !this._rrActonPhase) {
                this._rrRttTurnEnd = true;
                this._rrRealtimeturnCount = 0;
                this._rrPendingRtt = true;
            }
        }
        if (this.rrEscaping()) { this.rrEscapeCountGain(); escapeNow = true; }
        if (!CTB.ESCAPE_CSTOP || !BattleManager.canEscape() || (CTB.ESCAPE_CSTOP && !escapeNow)) {
            if (!escapeNow && CTB.ESCAPE_LOSS) this.rrEscapeCountGain('minus');
            for (const i of $gameParty.members()) { if (i._rrActionWaiting) i.rrAwGaugeGain(); else i.rrCtbGaugeGain(); }
        }
        for (const i of $gameTroop.members()) { if (i._rrActionWaiting) i.rrAwGaugeGain(); else i.rrCtbGaugeGain(); }
        for (const i of $gameParty.members()) {
            if (i._rrCtbActionstart) {
                if (i.rrVxAutoBattle()) {
                    i.rrVxMakeAction();
                    i._rrCtbActionstart = false;
                    if (this.rrAwSetup(i)) { this._rrActonPhase = true; this._rrActionBattlers.push(i); $gameTemp._rrBattlerQueue.push(i); break; }
                } else {
                    i._rrCtbActionstart = false;
                    this._rrWaitingBattler.push(i);
                    break;
                }
            } else if (i._rrActionWaiting && i._rrAwCtbActionstart) {
                i._rrActionWaiting = i._rrAwCtbActionstart = false;
                this._rrActonPhase = true;
                this._rrActionBattlers.push(i);
                $gameTemp._rrBattlerQueue.push(i);
                break;
            }
        }
        if (this._rrActionActiveWait > 0) return;
        for (const i of $gameTroop.members()) {
            if (i._rrCtbActionstart) {
                i.rrVxMakeAction();
                i._rrCtbActionstart = false;
                if (this.rrAwSetup(i)) { this._rrActonPhase = true; this._rrActionBattlers.push(i); $gameTemp._rrBattlerQueue.push(i); break; }
            } else if (i._rrActionWaiting && i._rrAwCtbActionstart) {
                i._rrActionWaiting = i._rrAwCtbActionstart = false;
                this._rrActonPhase = true;
                this._rrActionBattlers.push(i);
                $gameTemp._rrBattlerQueue.push(i);
                break;
            }
        }
    };
    /** aw_setup: a skill or item with a speed is chanted first (false: not yet). */
    S.rrAwSetup = function(b) {
        const act = b.rrVxAction();
        const skill = act.skill();
        if (skill && skill.speed > 0) {
            b._rrAwCtbActionstart = false; b._rrActionWaiting = true; b._rrActionWaitspeed = skill.speed / 100.0;
            return false;
        }
        const item = act.item();
        if (item && item.isItem && item.isItem()) {
            if (item.speed > 0) { b._rrAwCtbActionstart = false; b._rrActionWaiting = true; b._rrActionWaitspeed = item.speed / 100.0; return false; }
            return true;
        }
        return true;
    };
    S.rrStartAtbActorCommand = function() {
        const a = CTB.waitMode();
        if ((a[0] && this._rrActonPhase) || $gameTroop._interpreter.isRunning()) return;
        if (this._rrWaitingBattler.length === 0 || this._rrACommandBattler || this._rrAtbResult) return;
        if (this._rrActorCommandWindow.openness > 0) return;
        AudioManager.playSe(CTB.COMMANDSE);
        this.rrCtbActorCommand(this._rrWaitingBattler.shift().rrVxIndex());
    };
    S.rrCtbActorCommand = function(index) {
        if (index == null) return;
        this._rrACommandBattler = $gameParty.members()[index];
        this._rrStatusWindow.setIndex(index);
        this.rrStartActorCommandSelection();
    };
    S.rrCBattlerAtbA = function() {
        if (this._rrActive) this._rrActiveClone = this._rrActive;
        if (this._rrACommandBattler) this._rrWaitingClone = this._rrActive = this._rrACommandBattler;
    };
    S.rrCBattlerAtbB = function() {
        if (this._rrActiveClone) this._rrActive = this._rrActiveClone;
        if (this._rrWaitingClone) this._rrACommandBattler = this._rrWaitingClone;
        this._rrActiveClone = this._rrWaitingClone = null;
    };
    S.rrDisposeWindows = function() {
        this.rrEndSkillSelection();
        this.rrEndItemSelection();
        if (this._rrTargetActorWindow) this.rrEndTargetActorSelection();
        if (this._rrTargetEnemyWindow) this.rrEndTargetEnemySelection();
        const w = this._rrActorCommandWindow;
        w.createContents();
        w.select(-1);
        w.close();
        w._opening = false;
        w._closing = true;
        w.deactivate();
        this._rrACommandBattler = this._rrWaitingClone = null;
        this._rrStatusWindow.setIndex(-1);
    };
    S.rrBattlerCtset = function() {
        const max = CTB.CT_MAX;
        for (const i of $gameParty.members()) {
            i.rrAwGaugeClear();
            if ($gameTroop._rrSurprise) i.rrCtbGauge = 0;
            else if (i.rrVxFastAttack()) i.rrCtbGauge = max - 1;
            else if ($gameTroop._rrPreemptive) i.rrCtbGauge = max - rand(idiv(max, 10));
            else i.rrCtbGauge = idiv(max, 3) + rand(idiv(max, 10));
            i._rrCtbActionstart = false;
        }
        for (const i of $gameTroop.members()) {
            i.rrAwGaugeClear();
            if ($gameTroop._rrPreemptive) i.rrCtbGauge = 0;
            else if (i.rrVxFastAttack()) i.rrCtbGauge = max - 1;
            else if ($gameTroop._rrSurprise) i.rrCtbGauge = max - rand(idiv(max, 10));
            else i.rrCtbGauge = idiv(max, 3) + rand(idiv(max, 10));
            i._rrCtbActionstart = false;
        }
    };
    S.rrEscapeCountGain = function(n = 'plus') {
        const t = $gameTroop;
        if (n === 'minus') {
            const max = t._rrMaxEscapeCount;
            const g = idiv(max, CTB.ESCAPE_LOSSP);
            t._rrEscapeCount = Math.max(Math.min(max, t._rrEscapeCount - g), 0);
            return;
        }
        if (!BattleManager.canEscape()) return;
        t._rrEscapeCount += t._rrEscPAverage;
        if (t._rrEscapeCount >= t._rrMaxEscapeCount) this._rrEscapeFlag = true;
    };
    S.rrEscapeCountSet = function() {
        const t = $gameTroop;
        this._rrEscapeFlag = false;
        t._rrEscPAverage = VX.averageAgi($gameParty);
        t._rrEscTAverage = VX.averageAgi($gameTroop);
        const ave = t._rrEscTAverage;
        t._rrMaxEscapeCount = ave * t.members().length * CTB.ESCAPE;
        t._rrMaxEscapeCount = idiv(t._rrMaxEscapeCount, 2);
        t._rrMaxEscapeCount += rand(ave * 2);
        if (!BattleManager.canEscape()) { t._rrEscapeCount = 0; return; }
        if (t._rrPreemptive) t._rrEscapeCount = idiv(t._rrMaxEscapeCount, 2) + rand(idiv(t._rrMaxEscapeCount, 2));
        else if (t._rrSurprise) t._rrEscapeCount = 0;
        else t._rrEscapeCount = rand(idiv(t._rrMaxEscapeCount, 5));
    };
    /** next_actor (STR33): the chosen action joins the queue unless it is chanted first. */
    S.rrNextActor = function() {
        this._rrPartyCommandWindow.deactivate();
        const w = this._rrActorCommandWindow;
        w.createContents();
        w.select(-1);
        w.close();
        if (this._rrACommandBattler) {
            if (this.rrAwSetup(this._rrACommandBattler)) {
                this._rrActonPhase = true;
                this._rrActionBattlers.push(this._rrACommandBattler);
                $gameTemp._rrBattlerQueue.push(this._rrACommandBattler);
            }
            this._rrACommandBattler = this._rrWaitingClone = null;
        }
        this._rrStatusWindow.setIndex(-1);
        this._rrActorIndex = -1;
        this._rrProcessP = false;
        this.rrStartMain();
    };
    /** prior_actor (STR33): cancel passes the turn; the gauge drops back by CT_CANCEL%. */
    S.rrPriorActor = function() {
        if (CTB.CNX_DISABLE) return;
        if (!this._rrACommandBattler) return;
        const w = this._rrActorCommandWindow;
        w.createContents();
        w.select(-1);
        w.close();
        const b = this._rrACommandBattler;
        const c = b.rrMaxCtbGauge() / 100.0 * CTB.CT_CANCEL;
        b.rrCtbGauge = b.rrMaxCtbGauge() - c;
        this._rrACommandBattler = this._rrWaitingClone = null;
        this._rrStatusWindow.setIndex(-1);
        this._rrActorIndex = -1;
        this._rrProcessP = false;
        this.rrStartMain();
    };
    S.rrStartMain = function() {
        this._rrInfoViewport.visible = false;
        this._rrInfoViewport.ox = 0;
        this._messageWindow.visible = true;
        this._rrPartyCommandWindow.deactivate();
        this._rrActorCommandWindow.deactivate();
        this._rrStatusWindow.setIndex(-1);
        this._rrActorIndex = -1;
        this._rrActive = null;
        $gameTroop.rrVxMakeActions();
    };
    S.rrStartPartyCommandSelection = function() {
        if (this._rrSpcsDisable) return;
        this._rrProcessP = false;
        if ($gameParty.inBattle()) {
            this._rrStatusWindow.setIndex(-1);
            this._rrActorIndex = -1;
            this._messageWindow.visible = false;
            this._rrActorCommandWindow.deactivate();
        }
        this.rrNextActor();
    };
    S.rrStartActorCommandSelection = function() {
        this.rrCBattlerAtbA();
        this._rrPartyCommandWindow.deactivate();
        this._rrActorCommandWindow.setup(this._rrActive);
        this._rrActorCommandWindow.activate();
        this._rrActorCommandWindow.select(0);
        this._rrActorCommandWindow.open();
        this.rrCBattlerAtbB();
    };

    // -- update_active_command (STR33) and the selections (088 as Thrall left it) --
    S.rrUpdateActiveCommand = function* () {
        this.rrUpdateSceneChange();
        if (this._rrAtbResult) {
            this._rrPartyCommandWindow.deactivate();
            this._rrActorCommandWindow.select(-1);
            this._rrActorCommandWindow.deactivate();
            return;
        }
        if (this._rrProcessP || msgVisible() || this._rrAtbResult) return;
        this.rrCBattlerAtbA();
        if (!this._rrWaitingClone) { this.rrCBattlerAtbB(); return; }
        if (this._rrActive.rrCtbGauge < this._rrActive.rrMaxCtbGauge()) this.rrDisposeWindows();
        if (this._rrTargetEnemyWindow) this.rrUpdateTargetEnemySelection();
        else if (this._rrTargetActorWindow) this.rrUpdateTargetActorSelection();
        else if (this._rrSkillWindow) this.rrUpdateSkillSelection();
        else if (this._rrItemWindow) this.rrUpdateItemSelection();
        else if (this._rrPartyCommandWindow.active) yield* this.rrUpdatePartyCommandSelection();
        else if (this._rrActorCommandWindow.active) this.rrUpdateActorCommandSelection();
        this.rrCBattlerAtbB();
    };
    S.rrUpdatePartyCommandSelection = function* () {
        this._rrProcessP = false;
        if (Input.isTriggered('ok')) {
            if (this._rrPartyCommandWindow.index() === 0) {
                SoundManager.playOk();
                this._rrStatusWindow.setIndex(-1);
                this._rrActorIndex = -1;
                this.rrNextActor();
            } else if (this._rrPartyCommandWindow.index() === 1) {
                if (!BattleManager.canEscape()) { SoundManager.playBuzzer(); return; }
                SoundManager.playOk();
                yield* this.rrProcessEscape();
            }
        }
    };
    S.rrUpdateActorCommandSelection = function() {
        const b = this._rrActive;
        if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.rrPriorActor(); return; }
        if (Input.isTriggered('pageup')) { SoundManager.playCancel(); this.rrPriorActor(); return; }
        if (!Input.isTriggered('ok')) return;
        const act = b.rrVxAction();
        switch (this._rrActorCommandWindow.index()) {
            case 0:
                SoundManager.playOk();
                act.setAttack();
                this._rrSkill = null; this._rrItem = null;
                if (b.isActor() && b._equips[0] && b._equips[0].object()) {
                    for (const w of b.rrVxWeapons().filter(Boolean)) {
                        if (VX.nameWord(w) === 'Seraph') this.rrStartTargetActorSelection();
                        else { this.rrStartTargetEnemySelection(); this._rrTargetEnemyWindow.setCursorFixed(false); }
                    }
                } else { this.rrStartTargetEnemySelection(); this._rrTargetEnemyWindow.setCursorFixed(false); }
                break;
            case 1:
                this._rrItem = null;
                SoundManager.playOk();
                this.rrStartSkillSelection();
                break;
            case 2: {
                SoundManager.playOk();
                let covered = false, dead = 0;
                for (const m of $gameParty.members()) {
                    if (m === b) continue;
                    if (m.rrVxGuarding()) covered = true;
                    if (m.isDead() || m.isStateAffected(7) || m.isStateAffected(13)) dead++;
                }
                if (covered || dead >= $gameParty.members().length - 1) act.setNothing(); else act.setGuard();
                this.rrNextActor();
                break;
            }
            case 3:
                this._rrSkill = null;
                SoundManager.playOk();
                this.rrStartItemSelection();
                break;
        }
    };
    S.rrStartTargetEnemySelection = function() {
        this.rrStrtrhelpStart();
        const w = this._rrTargetEnemyWindow = new Window_RrVxTargetEnemy();
        const act = this._rrActive.rrVxAction();
        if (act.isSkill()) w.setCursorFixed(!this._rrSkill.needSelection()); else w.setCursorFixed(false);
        w.y = this._rrInfoViewport.rect.y;
        this._rrInfoViewport.rect.x += w.width;
        this._rrInfoViewport.ox += w.width;
        this._rrActorCommandWindow.deactivate();
        w.activate();
        w.z += 10;
        this._rrGlobal.addChild(w);
    };
    S.rrEndTargetEnemySelection = function() {
        for (const e of $gameTroop.members()) e._rrCursorFlash = false;
        this.rrStrtrhelpEnd();
        const w = this._rrTargetEnemyWindow;
        this._rrInfoViewport.rect.x -= w.width;
        this._rrInfoViewport.ox -= w.width;
        this._rrGlobal.removeChild(w);
        w.destroy();
        this._rrTargetEnemyWindow = null;
        if (this._rrActorCommandWindow.index() === 0) this._rrActorCommandWindow.activate();
    };
    S.rrUpdateTargetEnemySelection = function() {
        const w = this._rrTargetEnemyWindow;
        w.rrVxUpdate();
        if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.rrEndTargetEnemySelection(); }
        else if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            this._rrActive.rrVxAction().target_index = w.enemy().index();
            this.rrEndTargetEnemySelection();
            this.rrEndSkillSelection();
            this.rrEndItemSelection();
            this.rrNextActor();
        }
    };
    S.rrStartTargetActorSelection = function() {
        this.rrStrtrhelpStart();
        const w = this._rrTargetActorWindow = new Window_RrVxBattleStatus();
        const b = this._rrActive, act = b.rrVxAction();
        if (act.isSkill()) {
            if (this._rrSkill.needSelection()) { w.setIndex(0); w.setCursorFixed(false); }
            else { w.setIndex(b.rrVxIndex()); w.setCursorFixed(true); }
        } else if (act.isItem()) {
            if (this._rrItem && this._rrItem.needSelection && this._rrItem.needSelection()) { w.setIndex(0); w.setCursorFixed(false); }
            else { w.setIndex(b.rrVxIndex()); w.setCursorFixed(true); }
        } else { w.setIndex(0); w.setCursorFixed(false); }
        w.activate();
        w.y = this._rrInfoViewport.rect.y;
        this._rrInfoViewport.rect.x += w.width;
        this._rrInfoViewport.ox += w.width;
        this._rrActorCommandWindow.deactivate();
        w.z += 10;
        this._rrGlobal.addChild(w);
    };
    S.rrEndTargetActorSelection = function() {
        for (const a of $gameParty.members()) a._rrCursorFlash = false;
        this.rrStrtrhelpEnd();
        const w = this._rrTargetActorWindow;
        this._rrInfoViewport.rect.x -= w.width;
        this._rrInfoViewport.ox -= w.width;
        this._rrGlobal.removeChild(w);
        w.destroy();
        this._rrTargetActorWindow = null;
        const i = this._rrActorCommandWindow.index();
        if (i === 0 || i === 1) this._rrActorCommandWindow.activate();
    };
    S.rrUpdateTargetActorSelection = function() {
        const w = this._rrTargetActorWindow;
        w.rrVxUpdate();
        if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.rrEndTargetActorSelection(); }
        else if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            this._rrActive.rrVxAction().target_index = w.index();
            this.rrEndTargetActorSelection();
            this.rrEndSkillSelection();
            this.rrEndItemSelection();
            this.rrNextActor();
        }
    };
    S.rrStrtrhelpStart = function() {
        this._rrTrid = -1;
        if (this._rrHelpWindow) this._rrHelpWindow.visible = false;
        if (this._rrSkillWindow) this._rrSkillWindow.visible = false;
    };
    S.rrStrtrhelpEnd = function() {
        this._rrTrid = -1;
        if (this._rrHelpWindow) this._rrHelpWindow.visible = true;
        if (this._rrSkillWindow) this._rrSkillWindow.visible = true;
    };
    S.rrMakeHelpWindow = function() {
        const help = new Window_Help(new Rectangle(0, CTB.W_RESIZE ? CTB.W_HELP_Y : 0, Graphics.boxWidth, WLH + 32));
        help._rrManual = true;
        const _u = help.update;
        help.update = function() { if (!this._rrManual) _u.call(this); };
        help.rrVxUpdate = function() { _u.call(this); };
        this._windowLayer.addChild(help);
        return help;
    };
    S.rrDestroyWindow = function(w) { if (!w) return; if (w.parent) w.parent.removeChild(w); w.destroy(); };
    S.rrStartSkillSelection = function() {
        this._rrHelpWindow = this.rrMakeHelpWindow();
        const r = CTB.W_RESIZE ? CTB.W_RECT : [0, 56, 544, 232];
        const w = this._rrSkillWindow = new Window_RrThrallBattleSkill(new Rectangle(r[0], r[1], r[2], r[3]), this._rrActive);
        w.setHelpWindow(this._rrHelpWindow);
        w.selectLast();
        w.show();
        this._windowLayer.addChild(w);
        this._rrActorCommandWindow.deactivate();
        const a = this._rrActive;
        this._rrActiverefSkill = [a.mp, a.mmp, a._skills.join(), a.name()];
    };
    S.rrEndSkillSelection = function() {
        if (this._rrSkillWindow) {
            this.rrDestroyWindow(this._rrSkillWindow);
            this._rrSkillWindow = null;
            this.rrDestroyWindow(this._rrHelpWindow);
            this._rrHelpWindow = null;
        }
        this._rrActorCommandWindow.activate();
        this._rrActiverefSkill = null;
    };
    S.rrUpdateSkillSelection = function() {
        const a = this._rrActive;
        const b = [a.mp, a.mmp, a._skills.join(), a.name()];
        if (this._rrActiverefSkill && b.some((v, i) => v !== this._rrActiverefSkill[i])) {
            this._rrSkillWindow.refresh();
            this._rrActiverefSkill = b;
        }
        const w = this._rrSkillWindow;
        w.activate();
        w.rrVxUpdate();
        this._rrHelpWindow.rrVxUpdate();
        if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.rrEndSkillSelection(); }
        else if (Input.isTriggered('ok')) {
            const item = w.item();
            this._rrSkill = item ? VX.skill(item.id) : null;
            if (this._rrSkill) { a._rrLastSkillId = this._rrSkill.id; a.setLastBattleSkill && a.setLastBattleSkill(item); }
            if (a.rrVxSkillCanUse(this._rrSkill)) { SoundManager.playOk(); this.rrDetermineSkill(); }
            else SoundManager.playBuzzer();
        }
    };
    S.rrDetermineSkill = function() {
        const b = this._rrActive, skill = this._rrSkill;
        b.rrVxAction().setSkill(skill.id);
        this._rrSkillWindow.deactivate();
        if (b.isActor()) {
            const setScope = (s) => { skill.scope = s; if ($dataSkills[skill.id]) $dataSkills[skill.id].scope = ({ 1: 1, 2: 2, 7: 7, 11: 11 })[s]; };
            if ([62, 63, 64].includes(skill.id)) setScope(b.rrVxSkillLearn(93) ? 2 : 1);
            if (skill.id === 95) setScope(b.rrVxSkillLearn(125) ? 7 : 11);
            if (skill.id === 96) setScope(b.rrVxSkillLearn(126) ? 2 : 1);
            if (skill.forOpponent()) this.rrStartTargetEnemySelection(); else this.rrStartTargetActorSelection();
        }
    };
    S.rrStartItemSelection = function() {
        this._rrHelpWindow = this.rrMakeHelpWindow();
        const r = CTB.W_RESIZE ? CTB.W_RECT : [0, 56, 544, 232];
        const w = this._rrItemWindow = new Window_RrThrallBattleItem(new Rectangle(r[0], r[1], r[2], r[3]), this._rrActive);
        w.setHelpWindow(this._rrHelpWindow);
        w.refresh();
        w.forceSelect(0);
        w.show();
        this._windowLayer.addChild(w);
        this._rrActorCommandWindow.deactivate();
    };
    S.rrEndItemSelection = function() {
        if (this._rrItemWindow) {
            this.rrDestroyWindow(this._rrItemWindow);
            this._rrItemWindow = null;
            this.rrDestroyWindow(this._rrHelpWindow);
            this._rrHelpWindow = null;
        }
        this._rrActorCommandWindow.activate();
    };
    S.rrUpdateItemSelection = function() {
        if (VX.atbItemRefresh) { this._rrItemWindow.refresh(); VX.atbItemRefresh = false; }
        const w = this._rrItemWindow;
        w.activate();
        w.visible = true;
        w.rrVxUpdate();
        if (Input.isTriggered('cancel')) { SoundManager.playCancel(); this.rrEndItemSelection(); }
        else if (Input.isTriggered('ok')) {
            const item = w.item();
            this._rrItem = item ? VX.of(item) : null;
            if (item && DataManager.isItem(item)) $gameParty.setLastItem(item);
            if (this._rrItem && VX.itemCanUse($gameParty, this._rrItem)) { SoundManager.playOk(); this.rrDetermineItem(); }
            else if (item && DataManager.isWeapon(item)) this.rrDetermineItem();
            else SoundManager.playBuzzer();
        }
    };
    S.rrDetermineItem = function() {
        this._rrSkill = null;
        const b = this._rrActive, item = this._rrItem;
        if (item.isWeapon()) {
            const valid = item.id !== b._rrTempWeapon;
            b.rrVxAction().setItem(item.id, true);
            b.rrVxChangeEquipById(0, item.id);
            SoundManager.playEquip();
            if (valid) {
                if (b.rrVxSkillLearn(112)) b.addState(23);
                if (b.rrVxSkillLearn(118)) b.addState(24);
            } else { b.removeState(23); b.removeState(24); b.removeState(25); }
            this.rrEndItemSelection();
            this._rrActorCommandWindow.refresh();
            this._rrActorCommandWindow.setup(b);
        } else {
            b.rrVxAction().setItem(item.id);
            this._rrItemWindow.deactivate();
            this._rrItemWindow.visible = false;
            if (item.forOpponent()) {
                this.rrStartTargetEnemySelection();
                this._rrTargetEnemyWindow.setCursorFixed(item.forAll());
            } else {
                this.rrStartTargetActorSelection();
                this._rrTargetActorWindow.setIndex(0);
                this._rrTargetActorWindow.setCursorFixed(false);
            }
        }
    };

    // -- the cursor and the flashing battlers (STR33xx) --
    S.rrUpdateStrbtflash = function() { for (const m of $gameParty.members().concat($gameTroop.members())) m._rrCursorFlash = false; };
    S.rrUpdateCursor = function() {
        const c = this._rrCursor;
        if (!c) return;
        for (const m of $gameParty.members()) m._rrCursorFlash = false;
        const statusIndex = this._rrStatusWindow.index();
        const actorAt = (i) => { const ids = $gameParty._actors; return ids[i] != null ? $gameActors.actor(ids[i]) : null; };
        if (statusIndex !== -1) {
            this.rrUpdateStrbtflash();
            const a = actorAt(statusIndex);
            if (a) a._rrCursorFlash = true;
        }
        if (this._rrTargetEnemyWindow) {
            this.rrUpdateStrbtflash();
            const m = this._rrTargetEnemyWindow.enemy();
            const a = $gameTroop.members()[m.index()];
            if (m.rrVxElementRate(6) > 100) c.type = 4;
            else if (m.rrVxElementRate(7) > 100) c.type = 5;
            else if (m.rrVxElementRate(8) > 100) c.type = 6;
            else if (m.rrVxStateProbability(5) > 60) c.type = 7;
            else c.type = 2;
            const all = (this._rrSkill && this._rrSkill.forAll()) || (this._rrItem && this._rrItem.forAll && this._rrItem.forAll());
            if (all) {
                c.visible = false;
                for (const i of $gameTroop.members()) if (!i.isHidden()) i._rrCursorFlash = true;
            } else {
                a._rrCursorFlash = true;
                const point = this._spriteset.rrSetCursor(false, m.index());
                c.xx = point[0];
                c.yy = point[1] - 32;
                c.rrVxUpdate();
                c.visible = true;
            }
            if (this._rrTrid !== a.index()) this._rrTrid = a.index();
        } else if (this._rrTargetActorWindow) {
            this.rrUpdateStrbtflash();
            const a = actorAt(this._rrTargetActorWindow.index());
            c.type = 1;
            const all = (this._rrSkill && this._rrSkill.forAll()) || (this._rrItem && this._rrItem.forAll && this._rrItem.forAll());
            if (all) {
                c.visible = false;
                for (const i of $gameParty.members()) i._rrCursorFlash = true;
            } else if (a) {
                a._rrCursorFlash = true;
                const point = this._spriteset.rrSetCursor(true, this._rrTargetActorWindow.index());
                c.xx = point[0];
                c.yy = point[1] - 28;
                c.rrVxUpdate();
                c.visible = true;
            }
            if (a && this._rrTrid !== a.actorId()) this._rrTrid = a.actorId();
        } else if (statusIndex !== -1) {
            const a = actorAt(statusIndex);
            if (a) {
                let n = 0;
                const ready = (id) => a.rrVxSkillLearn(id) && a.rrVxSkillCanUse(VX.skill(id));
                const cls = a.rrVxClassId ? a.rrVxClassId() : a._classId;
                if (cls === 1) { if ([62, 63, 64].some(ready)) n = 3; }
                else if (cls === 2) { if ([127, 128].some(ready)) n = 3; }
                else if (cls === 3) { if ([159, 160].some(ready)) n = 3; }
                else if ([95, 96].some(ready)) n = 3;
                c.type = n;
            } else c.type = 0;
            const point = this._spriteset.rrSetCursor(true, statusIndex);
            c.xx = point[0];
            c.yy = point[1] - 32;
            c.rrVxUpdate();
            c.visible = true;
        } else {
            c.type = -1;
            c.xx = idiv(608, 2);
            c.yy = idiv(480, 2);
            c.visible = false;
        }
    };

    // -- battle start, events, actions (088 + SBS + STR33) --
    S.rrProcessBattleStart = function* () {
        this._rrBattleEventSet = true;
        this.rrBattlerCtset();
        // 088
        this._messageWindow.rrClear();
        yield* this.rrWait(10);
        this.rrMakeEscapeRatio();
        yield* this.rrProcessBattleEvent();
        yield* this.rrWaitForMessage();
        this._messageWindow.rrClear();
        this.rrStartPartyCommandSelection();
        // SBS: a two-weapon actor holding only its left weapon switches hands; Pain from variable 185.
        for (const m of $gameParty.members()) {
            const w = m.rrVxWeapons();
            if (!w[0] && w[1]) {
                const shield = m._equips[1] && m._equips[1].itemId();
                m.rrVxChangeEquipById(0, shield || 0);
                m.rrVxChangeEquipById(1, 0);
                m._rrTwoSwordsChange = true;
            }
            m.rrSetPain(vars(185) === 23 ? 1 : 0);
        }
        this._rrBattleEventSet = false;
        $gameTroop.rrVxIncreaseTurn();
    };
    S.rrMakeEscapeRatio = function() {
        this._rrEscapeRatio = 150 - idiv(100 * VX.averageAgi($gameTroop), VX.averageAgi($gameParty));
    };
    S.rrProcessBattleEvent = function* () {
        if (!(this.rrStartActionAtb() && !this._rrBattleEventSet)) yield* this.rrSbsProcessBattleEvent();
        this._rrActonPhase = false;
    };
    S.rrSbsProcessBattleEvent = function* () {
        for (;;) {
            if (yield* this.rrJudgeWinLoss()) return;
            if (this.rrNextScene()) return;
            $gameTroop._interpreter.update();
            $gameTroop.setupBattleEvent();
            this._messageWindow.update();
            if (msgVisible()) { this._messageWindow.visible = true; this._rrStatusWindow.visible = false; }
            yield* this.rrWaitForMessage();
            this._messageWindow.visible = false;
            this._rrStatusWindow.visible = true;
            if ($gameTroop._rrForcingBattler) yield* this.rrProcessAction();
            this._spriteset.update();
            if (!$gameTroop._interpreter.isRunning()) return;
            yield* this.rrUpdateBasic();
        }
    };
    S.rrJudgeWinLoss = function* () {
        if (!$gameParty.inBattle() || this._rrEnded) return true;
        if ($gameParty.members().every(m => !m.isAlive())) { yield* this.rrProcessDefeat(); return true; }
        if ($gameTroop.members().every(m => !m.isAlive())) { yield* this.rrProcessVictory(); return true; }
        return false;
    };
    S.rrUpdateSceneChange = function() {
        const next = $gameTemp._rrNextScene;
        if (next === 'map') { $gameTemp._rrNextScene = null; this.rrBattleEnd(1); }
        else if (next === 'gameover') { $gameTemp._rrNextScene = null; this.rrCallGameover(); }
        else if (next === 'title') { $gameTemp._rrNextScene = null; this.rrEnd(); SceneManager.goto(Scene_Title); }
        else $gameTemp._rrNextScene = null;
    };
    S.rrCallGameover = function() {
        this.rrEnd();
        this._messageWindow.rrClear();
        SceneManager.goto(Scene_Gameover);
    };
    S.rrEnd = function() { this._rrEnded = true; };
    /** battle_end (with the overdrive port's gains wrapped in front). */
    S.rrBattleEnd = function(result) {
        if (this.rrIncreaseOverdriveOnBattleEnd) this.rrIncreaseOverdriveOnBattleEnd(result);
        this.rrBattleEndSync(result);
    };
    S.rrBattleEndSync = function(result) {
        if (result === 2 && !BattleManager.canLose()) this.rrCallGameover();
        else {
            for (const m of $gameParty.members()) m.rrVxAction().clear();
            for (const m of $gameParty.members()) m.rrVxRemoveStatesBattle();
            for (const m of $gameParty.members()) if (m.isStateAffected(1)) { m.removeState(1); m.setHp(1); m._rrGuarded = false; }
            this.rrBattleProc(result);
            if (!BattleManager.isBattleTest()) BattleManager.replayBgmAndBgs();
            this._messageWindow.rrClear();
            this.rrEnd();
            if (BattleManager.isBattleTest()) SceneManager.exit(); else SceneManager.pop();
        }
        $gameParty._inBattle = false;
    };
    S.rrBattleProc = function(result) {
        const cb = BattleManager._eventCallback;
        if (cb) { BattleManager._eventCallback = null; cb(result); }
    };
    S.rrSetNextActiveBattler = function() {
        for (;;) {
            if ($gameTroop._rrForcingBattler) {
                this._rrActive = $gameTroop._rrForcingBattler;
                this._rrActionBattlers = this._rrActionBattlers.filter(x => x !== this._rrActive);
                $gameTroop._rrForcingBattler = null;
            } else this._rrActive = this._rrActionBattlers.shift() || null;
            if (!this._rrActive) return;
            if (this._rrActive.rrVxIndex() != null) return;
        }
    };
    /** process_action (STR33 around 088): one queued action, then that battler's gauge empties and a turn ends. */
    S.rrProcessAction = function* () {
        if (this.rrStartActionAtb()) return;
        this._rrActonPhase = true;
        yield* this.rrProcessAction088();
        if ((yield* this.rrJudgeWinLoss()) || this.rrNextScene()) return;
        const b = this._rrActive;
        if (!b || b.isDead()) return;
        b.rrCtbGauge = 0;
        b.rrAwGaugeClear();
        this._rrActive = null;
        yield* this.rrVxTurnEnd(false);
    };
    S.rrProcessAction088 = function* () {
        if (yield* this.rrJudgeWinLoss()) return;
        if (this.rrNextScene()) return;
        this.rrSetNextActiveBattler();
        if (!this._rrActive) { yield* this.rrVxTurnEnd(); return; }
        this._messageWindow.rrClear();
        yield* this.rrWait(5);
        const b = this._rrActive;
        b._rrWhiteFlash = true;
        const act = b.rrVxAction();
        if (!act.forcing) act.prepare();
        if (act.valid()) yield* this.rrExecuteAction();
        const now = this._rrActive;
        if (now && !now.rrVxAction().forcing) {
            this._messageWindow.rrClear();
            yield* this.rrRemoveStatesAuto();
            yield* this.rrDisplayCurrentState();
        }
        if (this._rrActive) this._rrActive._rrWhiteFlash = false;
        this._messageWindow.rrClear();
    };
    /** remove_states_auto (STR33): every battler's states count down at every action. */
    S.rrRemoveStatesAuto = function* () {
        const clone = this._rrActive;
        for (const rsa of $gameParty.members().concat($gameTroop.members())) {
            this._rrActive = rsa;
            const last = rsa._states.join();
            rsa.rrVxRemoveStatesAuto();
            if (rsa._states.join() !== last) {
                yield* this.rrWait(5);
                yield* this.rrDisplayStateChanges(rsa);
                yield* this.rrWait(30);
                this._messageWindow.rrClear();
            }
        }
        this._rrActive = clone;
    };
    S.rrDisplayCurrentState = function* () {
        const b = this._rrActive;
        if (!b) return;
        const text = b.rrVxMostImportantStateText();
        if (text) {
            yield* this.rrWait(5);
            this._messageWindow.rrAddInstantText(b.name() + text);
            yield* this.rrWait(45);
            this._messageWindow.rrClear();
        }
    };
    S.rrDisplayStateChanges = function* (target) {
        const r = target.rrVxResult();
        if (r.missed || r.evaded) return;
        if (!target.rrVxStatesActive()) return;
        const w = this._messageWindow;
        if (w.rrLineNumber() < 4) w.rrAddInstantText('');
        for (const state of target.rrVxAddedStates()) {
            const m = $dataStates[state.id];
            const text = target.isActor() ? m.message1 : m.message2;
            if (!text) continue;
            if (state.id === 1) target.performCollapse();
            w.rrReplaceInstantText(target.name() + text);
            yield* this.rrWait(20);
        }
        for (const state of target.rrVxRemovedStates()) {
            const text = $dataStates[state.id].message4;
            if (!text) continue;
            w.rrReplaceInstantText(target.name() + text);
            yield* this.rrWait(20);
        }
        for (const state of target.rrVxRemainedStates()) {
            const text = $dataStates[state.id].message3;
            if (!text) continue;
            w.rrReplaceInstantText(target.name() + text);
            yield* this.rrWait(20);
        }
        if (w.rrLastInstantText() === '') w.rrBackOne(); else yield* this.rrWait(10);
    };
    /** execute_action (SBS around 088; the overdrive port puts its action gain in front). */
    S.rrExecuteAction = function* () {
        const b = this._rrActive, act = b.rrVxAction();
        // KGC Overdrive's execute_action alias: the action's gauge gain first.
        if (this.rrIncreaseOverdriveOnAction) this.rrIncreaseOverdriveOnAction();
        if (act.kind !== 0) {
            const obj = act.kind === 1 ? act.skill() : act.item();
            if (obj && VX.ext(obj).includes('NOFLASH')) b._rrWhiteFlash = false;
        }
        b.rrActive = true;
        if (act.forcing) b.rrDerivation = 0;
        switch (act.kind) {
            case 0:
                if (act.basic === 0) yield* this.rrExecuteActionAttack();
                else if (act.basic === 1) yield* this.rrExecuteActionGuard();
                else if (act.basic === 2) yield* this.rrExecuteActionEscape();
                else if (act.basic === 3) yield* this.rrExecuteActionWait();
                break;
            case 1:
                yield* this.rrExecuteActionSkill();
                if (this.rrConsumeOdGauge) this.rrConsumeOdGauge();
                break;
            case 2: yield* this.rrExecuteActionItem(); break;
        }
        if (b.rrDerivation !== 0) {
            act.kind = 1;
            act.skill_id = b.rrDerivation;
            this._rrActionBattlers.unshift(b);
            $gameTemp._rrBattlerQueue.unshift(b);
            yield* this.rrProcessAction();
            return;
        }
        if (!b.isActor() && b._rrActTime) { b.rrVxMakeAction(); b._rrActTime -= 1; }
    };
    const fiend = (weapon) => {
        weapon.element_set = [3, 12];
        weapon.state_set = [];
        const n = rand(3);
        const src = VX.weapon(501 + n);
        if (src) { weapon.element_set = weapon.element_set.concat(src.element_set); weapon.state_set = weapon.state_set.concat(src.state_set); }
        weapon.animation_id = [2, 3, 4][n];
    };
    S.rrMarkDying = function() {
        for (const m of $gameParty.members().concat($gameTroop.members())) {
            if (m._rrImmortal || m.isDead()) continue;
            m.rrDying = true;
        }
    };
    S.rrExecuteActionAttack = function* () {
        const b = this._rrActive;
        b._rrGuarded = false;
        let action;
        if (b.isActor()) {
            if (b.rrVxWeaponId() === 0) { action = b.rrSbs_non_weapon(); this.rrImmortaling(); }
            else {
                for (const w of b.rrVxWeapons().filter(Boolean)) if (VX.nameWord(w) === 'Fiend') fiend(w);
                const w = VX.weapon(b.rrVxWeaponId());
                action = w.baseAction();
                if (w.state_set.includes(1)) this.rrMarkDying(); else this.rrImmortaling();
            }
        } else if (b.rrSbsWeapon() === 0) { action = b.rrSbs_base_action(); this.rrImmortaling(); }
        else {
            const w = VX.weapon(b.rrSbsWeapon());
            action = w ? w.baseAction() : b.rrSbs_base_action();
            if (w && w.state_set.includes(1)) this.rrMarkDying(); else this.rrImmortaling();
        }
        this.rrTargetDecision();
        this._spriteset.rrSetAction(b.isActor(), b.rrVxIndex(), action);
        yield* this.rrPlayingAction();
    };
    S.rrExecuteActionGuard = function* () {
        const b = this._rrActive;
        let covered = false, dead = 0;
        for (const m of $gameParty.members()) {
            if (m === b) continue;
            if (m.rrVxGuarding()) covered = true;
            if (m.isDead() || m.isStateAffected(7) || m.isStateAffected(13)) dead++;
        }
        if (covered || dead >= $gameParty.members().length - 1) { b.rrActive = false; yield* this.rrWait(45); }
        else {
            b.setHp(b.hp + idiv(b.mhp, 10));
            b._rrGuarded = true;
            this._spriteset.rrSetAction(b.isActor(), b.rrVxIndex(), 'GUARD_ATTACK');
            yield* this.rrWait(45);
            yield* this.rrPlayingAction();
        }
    };
    S.rrExecuteActionEscape = function* () {
        const b = this._rrActive;
        this._spriteset.rrSetAction(false, b.rrVxIndex(), b.rrSbs_run_success());
        b.rrActive = false;
        b.rrVxEscape();
        SoundManager.playEscape();
        yield* this.rrWait(45);
    };
    S.rrExecuteActionWait = function* () {
        this._rrActive.rrActive = false;
        yield* this.rrWait(45);
    };
    S.rrExecuteActionSkill = function* () {
        const b = this._rrActive;
        b._rrGuarded = false;
        const skill = b.rrVxAction().skill();
        let count = 0;
        if ([62, 63, 64].includes(skill.id)) { if (b.rrVxSkillLearn(93)) count = $gameTroop.members().filter(m => m.isAlive()).length; }
        else if (skill.id === 96) { if (b.rrVxSkillLearn(126)) count = $gameTroop.members().filter(m => m.isAlive()).length; }
        if (b.isActor() && skill.physical_attack) for (const w of b.rrVxWeapons().filter(Boolean)) if (VX.nameWord(w) === 'Fiend') fiend(w);
        if (skill.plus_state_set.includes(1)) this.rrMarkDying(); else this.rrImmortaling();
        if (!b.rrVxSkillCanUse(skill)) return;
        this.rrTargetDecision(skill);
        let act = skill.baseAction();
        if (b.isActor() && skill.id === 128 && b.rrVxSkillLearn(158)) act = 'TOXIC';
        if ([204, 205, 206, 207].includes(skill.id)) {
            if (b.isEnemy()) {
                const w = VX.weapon(b.rrSbsWeapon());
                act = b.rrSbsWeapon() === 0 || !w ? b.rrSbs_base_action() : w.baseAction();
            }
        } else if ([220, 221, 222, 223, 224, 225].includes(skill.id) && b.isActor()) {
            const w = b.rrVxWeapons()[0];
            if (w && w.element_set.includes(16)) {
                if (w.element_set.includes(1)) act = VX.nameWord(w) === 'Atlas' ? 'ATLAS_MUTLI' : 'FOUR_CUT';
                else if (w.element_set.includes(2)) act = 'TWIN_AXE_SPEC';
                else if (w.element_set.includes(3)) act = 'TWIN_BLUNT_SPEC';
                else if (w.element_set.includes(4)) act = 'TWIN_SPEAR_SPEC';
                else if (w.element_set.includes(5)) act = 'DOUBLE_DAGGER';
            }
        }
        this._spriteset.rrSetAction(b.isActor(), b.rrVxIndex(), act);
        yield* this.rrPlayingAction();
        b.setMp(b.mp - b.rrVxCalcMpCost(skill));
        if (skill.common_event_id) $gameTemp.reserveCommonEvent(skill.common_event_id);
        if (b.rrSetSkillRecharge) b.rrSetSkillRecharge(skill, count);
    };
    S.rrExecuteActionItem = function* () {
        const b = this._rrActive;
        b._rrGuarded = false;
        const item = b.rrVxAction().item();
        if (!item || item.isWeapon()) return;
        if (item.plus_state_set.includes(1)) this.rrMarkDying(); else this.rrImmortaling();
        if (!b.isStateAffected(31) && $dataItems[item.id]) $gameParty.consumeItem($dataItems[item.id]);
        this.rrTargetDecision(item);
        this._spriteset.rrSetAction(b.isActor(), b.rrVxIndex(), item.baseAction());
        yield* this.rrPlayingAction();
        if (item.common_event_id) $gameTemp.reserveCommonEvent(item.common_event_id);
    };
    S.rrTargetDecision = function(obj) {
        const b = this._rrActive;
        this._rrTargets = b.rrVxAction().makeTargets();
        if (this._rrTargets.length === 0) this._spriteset.rrSetAction(b.isActor(), b.rrVxIndex(), b.rrSbs_recover_action());
        if (obj) {
            if (obj.forTwo() || obj.forThree() || obj.dual()) this._rrTargets = [this._rrTargets[0]];
            if (VX.ext(obj).includes('RANDOMTARGET')) { const r = this._rrTargets.slice(); this._rrTargets = [r[rand(r.length)]]; }
        }
        this._spriteset.rrSetTarget(b.isActor(), b.rrVxIndex(), this._rrTargets);
    };
    /** playing_action: the battler's sequence plays; its OBJ_ANIM lands the damage, Can Collapse lets the fallen fall. */
    S.rrPlayingAction = function* () {
        const b = this._rrActive;
        for (;;) {
            yield* this.rrUpdateBasic();
            const action = b.rrPlay;
            if (action === 0 || action == null) continue;
            b.rrPlay = 0;
            if (Array.isArray(action) && action[0] === '個別処理') this.rrIndividual();
            else if (action === 'Can Collapse') yield* this.rrUnimmortaling();
            else if (action === 'Cancel Action' || action === 'End') { yield* this.rrActionEnd(); break; }
            else if (Array.isArray(action) && action[0] === 'OBJ_ANIM') this.rrDamageAction(action[1]);
            if (this._rrEnded) break;
        }
    };
    S.rrIndividual = function() {
        this._rrIndividualTarget = this._rrTargets;
        this._rrStandByTarget = this._rrTargets.slice();
    };
    S.rrImmortaling = function() {
        for (const m of $gameParty.members().concat($gameTroop.members())) {
            if (m.isDead()) continue;
            if (m._rrImmortal) m.rrNonDead = true;
            m._rrImmortal = true;
        }
    };
    S.rrUnimmortaling = function* () {
        if (this._rrActive.rrIndividual) return;
        for (const m of $gameParty.members().concat($gameTroop.members())) {
            if (m.rrDying) {
                m.rrDying = false;
                if (m.isDead() || m.hp === 0) {
                    if (m.isActor()) m.rrSetOverdrive(0);
                    m.addState(1);
                    m.performCollapse();
                }
            }
            if (m.rrNonDead) continue;
            if (m.isDead()) continue;
            m._rrImmortal = false;
            if (m.isActor() && m.hp === 0) m.rrSetOverdrive(0);
            if (m.hp === 0) m.addState(1);
            m.performCollapse();
        }
        if (this._rrStandByTarget) this._rrTargets = this._rrStandByTarget;
        if (!this._rrTargets || this._rrTargets.length === 0) return;
        for (const t of this._rrTargets) {
            if (!t) continue;
            this._spriteset.rrSetStandByAction(t.isActor(), t.rrVxIndex());
            if (t.hp !== 0) continue;
            yield* this.rrResurrection(t);
        }
    };
    /** Auto-life states (AUTOLIFE/n) revive an actor who knows Diehard; otherwise they wear off. */
    S.rrResurrection = function* (target) {
        for (const state of target.rrVxStates()) {
            for (const e of state.extension()) {
                if (e[0] !== 'A') continue;
                if (!target.isActor()) continue;
                if (target.rrVxSkillLearn(184)) {
                    yield* this.rrWait(50);
                    const n = parseInt(e.replace('AUTOLIFE/', ''), 10) || 0;
                    target.setHp(idiv(target.mhp * n, 100));
                    target.removeState(1);
                    target.removeState(state.id);
                    target.rrSetAnimationId(VX.N01.RESURRECTION);
                    const anim = VX.animation(VX.N01.RESURRECTION);
                    yield* this.rrWait(anim ? anim.frame_max * 4 : 0);
                } else target.removeState(state.id);
            }
        }
    };
    S.rrMagicReflection = function(target, obj) {
        if (obj.physical_attack) return;
        for (const state of target.rrVxStates()) for (const e of state.extension()) {
            if (e[0] !== 'M') continue;
            if (e[3] === 'R') { target.rrSetAnimationId(parseInt(e.replace('MAGREFLECT/', ''), 10) || 0); this._rrReflection = true; }
            else { target.rrSetAnimationId(parseInt(e.replace('MAGNULL/', ''), 10) || 0); this._rrInvalid = true; }
        }
    };
    S.rrPhysicsReflection = function(target, obj) {
        if (obj && !obj.physical_attack) return;
        for (const state of target.rrVxStates()) for (const e of state.extension()) {
            if (e[0] !== 'P') continue;
            if (e[3] === 'R') { target.rrSetAnimationId(parseInt(e.replace('PHYREFLECT/', ''), 10) || 0); this._rrReflection = true; }
            else { target.rrSetAnimationId(parseInt(e.replace('PHYNULL/', ''), 10) || 0); this._rrInvalid = true; }
        }
    };
    S.rrAbsorbCost = function(target, obj) {
        for (const state of target.rrVxStates()) {
            if (state.extension().includes('COSTABSORB')) {
                const cost = this._rrActive.rrVxCalcMpCost(obj);
                if (VX.ext(obj).includes('CONSUMEHP')) target.setHp(target.hp + cost); else target.setMp(target.mp + cost);
                return;
            }
        }
    };
    S.rrAbsorbAttack = function(obj, target, index, actor) {
        const b = this._rrActive, br = b.rrVxResult(), tr = target.rrVxResult();
        let absorb = tr.hpDamage;
        if (tr.mpDamage !== 0) absorb = tr.mpDamage;
        if ([2, 4, 6].includes(obj.scope) || VX.ext(obj).includes('TARGETALL')) this._rrWideAttack = true;
        if (this._rrWideAttack && this._rrAbsorb == null && this._rrTargets.length !== 1) {
            b.setHp(b.hp - br.hpDamage); b.setMp(b.mp - br.mpDamage);
            this._rrAbsorb = absorb;
            this._rrAbsorbTargetSize = this._rrTargets.length - 2;
        } else if (this._rrAbsorb != null && this._rrAbsorbTargetSize > 0) {
            b.setHp(b.hp - br.hpDamage); b.setMp(b.mp - br.mpDamage);
            this._rrAbsorb += absorb;
            this._rrAbsorbTargetSize -= 1;
        } else if (this._rrAbsorb != null) {
            b.setHp(b.hp - br.hpDamage); b.setMp(b.mp - br.mpDamage);
            this._rrAbsorb += absorb;
            br.hpDamage = -this._rrAbsorb;
            if (tr.mpDamage !== 0) br.mpDamage = -this._rrAbsorb;
            b.setHp(b.hp - br.hpDamage); b.setMp(b.mp - br.mpDamage);
            this._spriteset.rrSetDamageAction(actor, index, this._rrAbsorb === 0 ? ['absorb', null, false] : [null, null, false]);
            b.performCollapse();
            this._rrAbsorb = null;
            this._rrAbsorbTargetSize = null;
        } else {
            this._spriteset.rrSetDamageAction(actor, index, absorb === 0 ? ['absorb', null, false] : [null, null, false]);
            if (b.hp === 0 && !b.rrNonDead) this._rrAbsorbDead = true;
        }
        if (absorb === 0) return 0;
        return undefined;
    };
    S.rrActionEnd = function* () {
        const b = this._rrActive;
        this._rrIndividualTarget = null;
        b.rrActive = false;
        b.rrVxClearActionResults();
        if (b._rrReflex != null) {
            const act = b.rrVxAction();
            let obj = null;
            if (act.isSkill()) { obj = act.skill(); b.rrVxPerfectSkillEffect(b, obj); }
            else if (act.isItem()) { obj = act.item(); b.rrVxItemEffect(b, obj); }
            else b.rrVxPerfectAttackEffect(b);
            this.rrPopDamage(b, obj, b._rrReflex);
            b.performCollapse();
            b._rrReflex = null;
            yield* this.rrWait(VX.N01.COLLAPSE_WAIT);
        }
        if (this._rrAbsorbDead) {
            b.performCollapse();
            this._rrAbsorbDead = false;
            yield* this.rrWait(VX.N01.COLLAPSE_WAIT);
        }
        yield* this.rrWait(VX.N01.ACTION_WAIT);
    };
    /** damage_action: the targets take the hit (one at a time while processing a skill per target). */
    S.rrDamageAction = function(action) {
        const b = this._rrActive, act = b.rrVxAction();
        if (b.rrIndividual) this._rrTargets = [this._rrIndividualTarget.shift()];
        const key = [];
        let obj = null;
        const seize = (unitOfTargets) => {
            const t = unitOfTargets.filter(m => !this._rrTargets.includes(m) && m.isStateAffected(4));
            if (t.length > 0) this.rrDisplayNormalAnimation(t, 152);
        };
        if (act.isSkill() || act.isItem()) {
            obj = act.isSkill() ? act.skill() : act.item();
            const isSkill = act.isSkill();
            for (const target of this._rrTargets) {
                if (!target) return;
                if (target.isDead() && !obj.forDeadFriend()) return;
                if (obj.forDeadFriend()) target.rrRevival = true;
                if (target.hp === 0 && !obj.forDeadFriend()) {
                    if (isSkill) target.rrVxPerfectSkillEffect(b, obj); else target.rrVxPerfectItemEffect(b, obj);
                } else if (VX.ext(obj).includes('NOEVADE')) {
                    if (isSkill) target.rrVxPerfectSkillEffect(b, obj); else target.rrVxPerfectItemEffect(b, obj);
                } else {
                    if (!VX.ext(obj).includes('IGNOREREFLECT')) { this.rrMagicReflection(target, obj); this.rrPhysicsReflection(target, obj); }
                    if (!(this._rrReflection || this._rrInvalid)) { if (isSkill) target.rrVxSkillEffect(b, obj); else target.rrVxItemEffect(b, obj); }
                }
                if (!(this._rrReflection || this._rrInvalid)) this.rrPopDamage(target, obj, action.slice());
                if (isSkill) this.rrAbsorbCost(target, obj);
                if (this._rrReflection && !this._rrInvalid) b._rrReflex = action;
                const tr = target.rrVxResult();
                if (!(tr.evaded || tr.missed)) key.push(true);
                this._rrReflection = false;
                this._rrInvalid = false;
            }
            if (key.includes(true)) {
                if (b.isActor()) {
                    if (this._rrTargets[0] && !this._rrTargets[0].isActor() && (obj.element_set.includes(8) || (b.rrVxElementSet().includes(8) && obj.physical_attack))) seize($gameTroop.members());
                } else if (this._rrTargets[0] && this._rrTargets[0].isActor() && obj.element_set.includes(8)) seize($gameParty.members());
            }
        } else {
            for (const target of this._rrTargets) {
                if (!target || target.isDead()) return;
                this.rrPhysicsReflection(target, null);
                if (target.hp <= 0) target.rrVxPerfectAttackEffect(b);
                if (!(target.hp <= 0 || this._rrReflection || this._rrInvalid)) target.rrVxAttackEffect(b);
                if (!(this._rrReflection || this._rrInvalid)) this.rrPopDamage(target, null, action.slice());
                if (this._rrReflection && !this._rrInvalid) b._rrReflex = action;
                const tr = target.rrVxResult();
                if (!(tr.evaded || tr.missed)) key.push(true);
                this._rrReflection = false;
                this._rrInvalid = false;
            }
            if (key.includes(true) && b.isActor() && this._rrTargets[0] && !this._rrTargets[0].isActor() && b.rrVxElementSet().includes(8)) seize($gameTroop.members());
        }
        VX.statusWindowRefresh = true;
        if (!obj) return;
        if (VX.ext(obj).includes('RANDOMTARGET')) this.rrTargetDecision(obj);
    };
    S.rrPopDamage = function(target, obj, action) {
        const b = this._rrActive;
        if (obj) {
            let absorb;
            if (obj.absorb_damage) absorb = this.rrAbsorbAttack(obj, target, b.rrVxIndex(), b.isActor());
            if (absorb === 0) action.push(true);
            if (VX.ext(obj).includes('NOOVERKILL')) action[2] = false;
        }
        this._spriteset.rrSetDamageAction(target.isActor(), target.rrVxIndex(), action);
    };
    S.rrDisplayNormalAnimation = function(targets, animationId, mirror = false) {
        if (!VX.animation(animationId)) return;
        for (const t of [...new Set(targets)]) t.rrSetAnimationId(animationId, mirror);
    };
    /** turn_end (SBS's slip damage and regeneration, STR33's every-action turn). The recharge port wraps it. */
    S.rrVxTurnEnd = function* (noAction = true) {
        if (noAction) return;
        if (CTB.RTT && !this._rrRttTurnEnd) return;
        this._rrRttTurnEnd = false;
        this._rrBattleEventSet = true;
        this._rrSpcsDisable = true;
        yield* this.rrSbsTurnEnd();
        this._rrBattleEventSet = false;
        this._rrSpcsDisable = false;
        this._rrActionActiveWait = 4;
        $gameTroop.rrVxIncreaseTurn();
    };
    S.rrSbsTurnEnd = function* () {
        let radiantHp = 0;
        let damage = 0;
        // Ruby keeps these locals across the loop's members (a for loop opens no scope).
        let slipPop, slipDead, slipDamageFlug, plusHpFlug;
        const monster = $gameActors.actor(5);
        const monsterHalf = () => idiv(monster ? monster.rrVxBaseMaxhp() : 0, 2);
        for (const member of $gameParty.members().concat($gameTroop.members())) {
            member.rrVxClearActionResults();
            if (!member.isAlive()) continue;
            member._rrSlipDamage = false;
            const actor = member.isActor();
            damage = 0;
            if (member.rrDriveFatal && member.rrDriveFatal() && this.rrGainOverdrive) this.rrGainOverdrive(member, VX.OD_GAIN_RATE ? VX.OD_GAIN_RATE[6] : 50);
            for (const state of member.rrVxStates()) {
                if (state.extension().includes('ZEROTURNLIFT')) member.removeState(state.id);
                if (!state.extension().includes('SLIPDAMAGE')) continue;
                for (const ext of state.slipExtension()) {
                    let perc = ext[2];
                    if (member.isActor()) { const lead = $gameActors.actor(1); if (state.id === 20 && lead && lead.rrVxSkillLearn(99)) perc -= 1; }
                    else if (state.id === 20) perc -= 1;
                    if (ext[0] === 'hp') {
                        let base = 0;
                        if (ext[1] > 0 && !member.isActor()) {
                            if (state.id === 2) base = monsterHalf() * member.rrStatusMod()[0];
                            else if (state.id === 5) { if (member.rrStatusMod()[2] === 1) base = monsterHalf(); }
                            else base = monsterHalf();
                        } else {
                            if (state.id !== 5) base = idiv(member.mhp * perc, 100);
                            if (state.id === 2) base *= member.rrStatusMod()[0];
                        }
                        damage += base + idiv(base * (rand(5) - rand(5)), 100);
                        slipPop = ext[3];
                        slipDead = ext[4];
                        slipDamageFlug = true;
                        member._rrSlipDamage = true;
                    }
                }
            }
            if (member.rrVxSlipDamage() && member.isAlive() && !slipDamageFlug) {
                damage += member.rrVxApplyVariance(idiv(member.mhp, 10), 10);
                slipDead = false;
                slipDamageFlug = true;
                member._rrSlipDamage = true;
            }
            // `damage >= hp && slip_dead = false` assigns: the cap never applies.
            slipDead = false;
            if (member.isStateAffected(32) && damage > 0 && member.hp <= damage) damage = member.hp - 1;
            member.setHp(member.hp - damage);
            if (member.isActor() && damage < 0) {
                $gameVariables.setValue(169, vars(169) - Math.max(member.hp - member.mhp, damage));
                if (member.rrVxSkillLearn(120)) radiantHp -= idiv(damage, 2);
            }
            if (slipPop && damage !== 0) this._spriteset.rrSetDamagePop(actor, member.rrVxIndex(), damage);
            if (member.isDead() && member._rrSlipDamage) member.performCollapse();
            if (member.hp !== 0) continue;
            yield* this.rrResurrection(member);
            this._spriteset.rrStandby(actor, member.rrVxIndex());
            member.rrVxClearActionResults();
        }
        slipDamageFlug = false;
        for (const member of $gameTroop.members()) {
            let plusHp = 0;
            if (member.isAlive() && !member.isStateAffected(1)) {
                const name = String(member.originalName()).split(/ /);
                if (name[0] === 'Newblood') plusHp += sw(38) ? idiv(member.mhp, 150) : idiv(member.mhp, 100);
                else if (name[0] === 'Carlos') plusHp += idiv(member.mhp, 100);
                else if (name[0] === '???') plusHp += member.mhp;
                if (vars(91) === 1) plusHp += idiv(member.mhp, 20);
                if (vars(92) === 1) plusHp += idiv(member.mhp, 20);
            }
            if (plusHp > 0) plusHpFlug = true;
            if (plusHpFlug) member.setHp(member.hp + plusHp);
            member.rrVxClearActionResults();
        }
        const armorRegen = (member, avatar) => {
            let plus = 0;
            for (const a of member.rrVxArmors().filter(Boolean)) {
                const w = VX.nameWord(a);
                if (w === 'Goddess') plus += Math.max(0, idiv(idiv(member.mhp, 2) - member.hp, 2));
                else if (w === 'Curse') plus -= idiv(member.mhp, 100);
                else if (w === 'Avatar' && avatar) { for (const s of [2, 3, 4, 5]) if (member.isStateAffected(s)) plus += idiv(member.mhp, 200); }
                else if (a.auto_hp_recover) plus += avatar ? idiv(member.mhp, 200) : idiv(member.mhp, 100);
            }
            return plus;
        };
        const canUse = (m, id) => m.rrVxSkillCanUse(VX.skill(id));
        for (const member of $gameParty.members()) {
            const cls = member.rrVxClassId ? member.rrVxClassId() : member._classId;
            if (cls !== 4) continue;
            let plusHp = 0;
            if (member.isAlive() && member.rrVxSkillLearn(114) && !canUse(member, 95)) {
                if (!$gameParty.members().some(m => m.isStateAffected(20))) { plusHp += idiv(member.mhp, 100); plusHpFlug = true; }
            }
            if (member.rrVxAutoHpRecover() && member.isAlive()) { plusHp += armorRegen(member, true); plusHpFlug = true; }
            if (member.rrVxSkillLearn(120)) radiantHp += idiv(plusHp, 2);
            if (plusHpFlug && !member.isStateAffected(1)) member.setHp(member.hp + plusHp);
            $gameVariables.setValue(169, vars(169) + Math.min(member.mhp - member.hp, plusHp));
            member.rrVxClearActionResults();
        }
        for (const member of $gameParty.members()) {
            const cls = member.rrVxClassId ? member.rrVxClassId() : member._classId;
            if (cls === 4) continue;
            let plusHp = 0;
            if (member.isAlive() && member.rrVxSkillLearn(82)) {
                for (const id of [62, 63, 64]) if (member.rrVxSkillLearn(id) && !canUse(member, id)) { plusHp += idiv(member.mhp, 100); plusHpFlug = true; }
            }
            if (member.rrVxAutoHpRecover() && member.isAlive()) { plusHp += armorRegen(member, false); plusHpFlug = true; }
            plusHp += radiantHp;
            if (plusHp > 0) plusHpFlug = true;
            if (plusHpFlug && !member.isStateAffected(1)) member.setHp(member.hp + plusHp);
            $gameVariables.setValue(169, vars(169) + Math.min(member.mhp - member.hp, plusHp));
            member.rrVxClearActionResults();
        }
        $gameTroop._rrTurnEnding = true;
        $gameTroop._rrPreemptive = false;
        $gameTroop._rrSurprise = false;
        $gameSwitches.setValue(2, false);
        $gameSwitches.setValue(58, false);
        yield* this.rrProcessBattleEvent();
        $gameTroop._rrTurnEnding = false;
        this.rrStartPartyCommandSelection();
    };

    // -- victory, defeat, escape --
    S.rrProcessVictory = function* () {
        this.rrDisposeWindows();
        this._rrAtbResult = true;
        // SBS
        this._rrStatusWindow.visible = true;
        this._messageWindow.visible = false;
        const bossWait = $gameTroop.members().some(e => e.rrSbsCollapseType() === 3);
        yield* this.rrWait(bossWait ? 440 : VX.N01.WIN_WAIT);
        for (const a of $gameParty.members()) if (a.restriction() < 4) this._spriteset.rrSetAction(true, a.rrVxIndex(), a.rrSbs_win());
        // 088
        this._rrInfoViewport.visible = false;
        this._messageWindow.visible = true;
        if (!BattleManager.isBattleTest()) BattleManager.replayBgmAndBgs();
        yield* this.rrDisplayExpAndGold();
        yield* this.rrDisplayLevelUp();
        for (const m of $gameParty.members()) m.rrVxAction().clear();
        for (const m of $gameParty.members()) m.rrVxRemoveStatesBattle();
        for (const m of $gameParty.members()) if (m.isStateAffected(1)) { m.removeState(1); m.setHp(1); }
        this.rrBattleProc(0);
        yield* this.rrDisplayDropItems();
        $gameParty._inBattle = false;
    };
    S.rrDisplayExpAndGold = function* () {
        $gameMessage.add('\\|' + TextManager.victory.format($gameParty.name()));
        for (const actor of $gameParty.members()) {
            const exp = $gameTroop.rrVxExpTotal(actor);
            if (exp > 0) $gameMessage.add('\\.\\ic[172] ' + actor.name() + TextManager.obtainExp.format(exp));
        }
        yield* this.rrWaitForMessage();
    };
    S.rrDisplayLevelUp = function* () {
        for (const actor of $gameParty.members()) {
            const exp = $gameTroop.rrVxExpTotal(actor);
            const last = actor.level;
            actor.changeExp(actor.currentExp() + exp, true);
            if (actor.level !== last) actor.setHp(actor.hp + idiv(actor.mhp, 2));
        }
        yield* this.rrWaitForMessage();
    };
    S.rrDisplayDropItems = function* () {
        const drop = $gameTroop.rrVxMakeDropItems();
        const [iterations, chance, levels] = drop;
        const dead = $gameTroop.members().filter(m => m.isDead());
        const m = [];
        let ind = 0;
        for (const c of chance) {
            if (ind < dead.length) { if (c != null) m.push(dead[ind]); ind += 1; }
        }
        const chances = chance.filter(c => c != null);
        const items = $gameTemp.rrGenerateLoot ? ($gameTemp.rrGenerateLoot(iterations, chances, levels) || []) : [];
        ind = 0;
        for (const i of items) {
            if (ind >= m.length) break;
            const e = [m[ind]];
            const vx = VX.of(i) || i;
            const es = (vx && vx.element_set) || [];
            if (es.includes(14)) this.rrDisplayNormalAnimation(e, 169);
            else if (es.includes(13)) this.rrDisplayNormalAnimation(e, 170);
            else if (es.includes(12)) this.rrDisplayNormalAnimation(e, 171);
            else if (es.includes(11)) this.rrDisplayNormalAnimation(e, 172);
            else if (es.includes(10)) this.rrDisplayNormalAnimation(e, 173);
            else if (es.includes(19)) this.rrDisplayNormalAnimation(e, 174);
            else if (DataManager.isItem(i) || (vx && vx.isItem && vx.isItem())) this.rrDisplayNormalAnimation(e, 175);
            ind += 1;
        }
        if (items.length > 0) {
            yield* this.rrWait(30, true);
            this.rrEnd();
            if (typeof window.Scene_RRThrallLootTable === 'function') SceneManager.goto(window.Scene_RRThrallLootTable);
            else SceneManager.pop();
        } else {
            if (!BattleManager.isBattleTest()) BattleManager.replayBgmAndBgs();
            this.rrEnd();
            if (BattleManager.isBattleTest()) SceneManager.exit(); else SceneManager.pop();
        }
    };
    S.rrProcessDefeat = function* () {
        this.rrDisposeWindows();
        this._rrAtbResult = true;
        for (const m of $gameParty.members()) this._spriteset.rrSetStandByAction(true, m.rrVxIndex());
        this._rrInfoViewport.visible = false;
        this._messageWindow.visible = true;
        $gameMessage.add(TextManager.defeat.format($gameParty.name()));
        yield* this.rrWaitForMessage();
        this.rrBattleEnd(2);
    };
    /** process_escape (STR33 then SBS): escaping by the gauge always succeeds (it sets the preemptive flag first). */
    S.rrProcessEscape = function* () {
        $gameTroop._rrPreemptive = true;
        this.rrDisposeWindows();
        this._rrAtbResult = true;
        this._rrInfoViewport.visible = false;
        this._messageWindow.visible = true;
        $gameMessage.add(TextManager.escapeStart.format($gameParty.name()));
        const success = $gameTroop._rrPreemptive ? true : rand(100) < this._rrEscapeRatio;
        SoundManager.playEscape();
        if (success) {
            for (const a of $gameParty.members()) if (a.restriction() < 4) this._spriteset.rrSetAction(true, a.rrVxIndex(), a.rrSbs_run_success());
            yield* this.rrWaitForMessage();
            this.rrBattleEnd(1);
        } else {
            for (const a of $gameParty.members()) if (a.restriction() < 4) this._spriteset.rrSetAction(true, a.rrVxIndex(), a.rrSbs_run_ng());
            this._rrEscapeRatio += 10;
            $gameMessage.add('\\.' + TextManager.escapeFailure);
            yield* this.rrWaitForMessage();
            for (const m of $gameParty.members()) m.rrVxAction().clear();
            this.rrStartMain();
        }
    };

    // ---- event commands in this battle ------------------------------------------------------------
    // Abort Battle: VX's next_scene "map" ends the battle as an escape.
    const _abort = BattleManager.abort;
    BattleManager.abort = function() {
        if (BATTLE_ON) { $gameTemp._rrNextScene = 'map'; return; }
        _abort.call(this);
    };
    // Force Action (VX command_339): the battler's VX action, its target, and it acts next.
    const _command339 = Game_Interpreter.prototype.command339;
    Game_Interpreter.prototype.command339 = function(params) {
        if (!BATTLE_ON) return _command339.call(this, params);
        const attackId = ($dataSystem.rrGuardSkillId || 2) - 1, guardId = $dataSystem.rrGuardSkillId || 0, escapeId = guardId + 1;
        let done = true;
        this.iterateBattler(params[0], params[1], battler => {
            if (!done || !battler.isAlive()) return;
            const act = battler.rrVxAction();
            const skillId = params[2];
            if (skillId === attackId) { act.kind = 0; act.basic = 0; }
            else if (skillId === guardId) { act.kind = 0; act.basic = 1; }
            else if (skillId === escapeId) { act.kind = 0; act.basic = 2; }
            else if (skillId === 0) { act.kind = 0; act.basic = 3; }
            else { act.kind = 1; act.skill_id = skillId; }
            if (params[3] === -2) act.decideLastTarget();
            else if (params[3] === -1) act.decideRandomTarget();
            else if (params[3] >= 0) act.target_index = params[3];
            act.forcing = true;
            $gameTroop._rrForcingBattler = battler;
            this._index++;
            done = false;
        });
        return done;
    };
    const _isTurnEnd = BattleManager.isTurnEnd;
    BattleManager.isTurnEnd = function() { return BATTLE_ON ? !!$gameTroop._rrTurnEnding : _isTurnEnd.call(this); };
})();
