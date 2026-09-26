/*:
 * @target MZ
 * @plugindesc Buff & State Manager (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyBuffStateManager.js
 *
 * How long states and buffs last, and how far a stat can be buffed:
 *   - a stat can be buffed or debuffed up to the game's limit (5 here), each
 *     level worth the game's formula; notes add to the limit per stat:
 *     <max buff atk: +1>, <max debuff all: -1> on actors, classes, equipment,
 *     enemies and states;
 *   - a state put on again follows the game's rule: turns kept (<reapply
 *     ignore>), reset (<reapply reset>) or added on (<reapply total>);
 *   - <state 7 turns: +2> on an actor, class, equipment, enemy or state
 *     lengthens state 7 on that battler; on a skill or item it changes the
 *     turns left on a target that has state 7 (in battle), removing the state
 *     at 0; <buff atk turns: +1> / <debuff def turns: -1> likewise for buffs;
 *   - in battle, the turns left are drawn over the state and buff icons.
 *
 * As the original did: a buff meeting a debuff (or a debuff a buff) clears
 * the stat instead of stepping it; a debuff three or more levels deep shows
 * the icon two rows past the debuff icons; buff turns never run below 0, so
 * a skill shortening a buff does not remove it; a state added under the
 * "total" rule starts no step count, so walking never removes it, and one
 * first added under the "ignore" rule no turn count, so turns never remove
 * it (the original stopped with an error in both cases).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param showTurns
 * @text Show remaining turns
 * @type boolean
 * @default true
 *
 * @param turnsSize
 * @text Turns font size (RGSS)
 * @type number
 * @default 18
 *
 * @param turnsY
 * @text Turns y adjustment
 * @type number
 * @min -99
 * @default -4
 *
 * @param defaultBuffLimit
 * @type number
 * @default 2
 *
 * @param maximumBuffLimit
 * @type number
 * @default 2
 *
 * @param buffFormula
 * @text Buff rate formula (JavaScript)
 * @type string
 * @default this.rrBuffLevel(paramId) * 0.25 + 1.0
 * @desc this.rrBuffLevel(paramId) is the buff level, capped by the limits.
 *
 * @param reapplyRule
 * @text Reapplying a state
 * @type select
 * @option Ignored
 * @value 0
 * @option Turns reset
 * @value 1
 * @option Turns added
 * @value 2
 * @default 1
 *
 * @param rgssFontSize
 * @text Game's default font size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyBuffStateManager');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const SHOW_TURNS = String(params.showTurns) !== 'false';
    const TURNS_SIZE = num(params.turnsSize, 18);
    const TURNS_Y = num(params.turnsY, -4);
    const DEFAULT_LIMIT = num(params.defaultBuffLimit, 2);
    const MAXIMUM_LIMIT = num(params.maximumBuffLimit, 2);
    const REAPPLY = num(params.reapplyRule, 1);
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    let formula;
    try { formula = new Function('paramId', 'return (' + (params.buffFormula || 'this.rrBuffLevel(paramId) * 0.25 + 1.0') + ');'); } catch (_) { formula = null; }

    //-------------------------------------------------------------------------
    // Notes, read once per database object
    //-------------------------------------------------------------------------
    const STATS = [['MAXHP', 'MHP', 'HP'], ['MAXMP', 'MMP', 'MP', 'MAXSP', 'SP', 'MSP'], ['ATK'], ['DEF'], ['MAT', 'INT', 'SPI'], ['MDF', 'RES'], ['AGI'], ['LUK']];
    // The stats a name stands for ("ALL" is every one), or none.
    const stats = (name) => {
        const n = String(name).toUpperCase();
        if (n === 'ALL') return [0, 1, 2, 3, 4, 5, 6, 7];
        const i = STATS.findIndex(names => names.includes(n));
        return i < 0 ? [] : [i];
    };
    const RE = {
        maxBuff: /<(?:MAX_BUFF|max buff)[ ](.*):[ ]([+-]\d+)>/i,
        maxDebuff: /<(?:MAX_DEBUFF|max debuff)[ ](.*):[ ]([+-]\d+)>/i,
        stateTurn: /<(?:state)[ ](\d+)[ ](?:TURN|turns):[ ]([+-]\d+)>/i,
        buffTurn: /<(?:buff)[ ](.*)[ ](?:TURN|turns):[ ]([+-]\d+)>/i,
        debuffTurn: /<(?:debuff)[ ](.*)[ ](?:TURN|turns):[ ]([+-]\d+)>/i,
        ignore: /<(?:REAPPLY_IGNORE|reapply ignore)>/i,
        reset: /<(?:REAPPLY_RESET|reapply reset)>/i,
        total: /<(?:REAPPLY_TOTAL|reapply total)>/i
    };
    const lines = (o) => String((o && o.note) || '').split(/[\r\n]+/);
    const isUsable = (o) => o && ('scope' in o || 'effects' in o);
    const isState = (o) => o && 'autoRemovalTiming' in o;
    // Each line takes the first tag it matches, in the original's order.
    function bsm(o) {
        if (!o) return null;
        if (o._rrBsm) return o._rrBsm;
        const out = { maxBuff: [0, 0, 0, 0, 0, 0, 0, 0], maxDebuff: [0, 0, 0, 0, 0, 0, 0, 0], stateTurns: new Map(), buffTurns: new Map(), debuffTurns: new Map(), reapply: isState(o) ? REAPPLY : undefined };
        let m;
        for (const line of lines(o)) {
            if (isUsable(o)) {
                if ((m = RE.stateTurn.exec(line))) out.stateTurns.set(Number(m[1]), Number(m[2]));
                else if ((m = RE.buffTurn.exec(line))) for (const i of stats(m[1])) out.buffTurns.set(i, Number(m[2]));
                else if ((m = RE.debuffTurn.exec(line))) for (const i of stats(m[1])) out.debuffTurns.set(i, Number(m[2]));
                continue;
            }
            if ((m = RE.maxBuff.exec(line))) for (const i of stats(m[1])) out.maxBuff[i] = Number(m[2]);
            else if ((m = RE.maxDebuff.exec(line))) for (const i of stats(m[1])) out.maxDebuff[i] = Number(m[2]);
            else if ((m = RE.stateTurn.exec(line))) out.stateTurns.set(Number(m[1]), Number(m[2]));
            else if (RE.ignore.test(line)) { if (isState(o)) out.reapply = 0; }
            else if (RE.reset.test(line)) { if (isState(o)) out.reapply = 1; }
            else if (RE.total.test(line)) { if (isState(o)) out.reapply = 2; }
        }
        Object.defineProperty(o, '_rrBsm', { value: out, configurable: true });
        return out;
    }

    //-------------------------------------------------------------------------
    // Buff limits and levels
    //-------------------------------------------------------------------------
    const B = Game_BattlerBase.prototype;
    // The objects whose notes shape the battler: actor, class and equipment, or the enemy; then its states.
    B.rrBsmObjects = function() {
        const own = this.isActor() ? [this.actor(), this.currentClass()].concat(this.equips()) : [this.enemy()];
        return own.concat(this.states()).filter(Boolean);
    };
    const limit = (battler, key, paramId) => {
        let n = DEFAULT_LIMIT;
        for (const o of battler.rrBsmObjects()) n += bsm(o)[key][paramId] || 0;
        return Math.min(Math.max(Math.trunc(n), 0), MAXIMUM_LIMIT);
    };
    B.rrMaxBuffLimit = function(paramId) { return limit(this, 'maxBuff', paramId); };
    B.rrMaxDebuffLimit = function(paramId) { return limit(this, 'maxDebuff', paramId); };
    B.rrBuffLevel = function(paramId) {
        const level = this._buffs[paramId];
        if (level === undefined || level === null) return 0;
        return Math.max(Math.min(level, this.rrMaxBuffLimit(paramId)), -this.rrMaxDebuffLimit(paramId));
    };
    const _paramBuffRate = B.paramBuffRate;
    B.paramBuffRate = function(paramId) {
        if (!formula) return _paramBuffRate.call(this, paramId);
        const rate = Number(formula.call(this, paramId));
        return isNaN(rate) ? _paramBuffRate.call(this, paramId) : rate;
    };
    // A stat is at its limit only exactly there: one above a lowered limit can still climb.
    B.isMaxBuffAffected = function(paramId) { return this._buffs[paramId] === this.rrMaxBuffLimit(paramId); };
    B.isMaxDebuffAffected = function(paramId) { return this._buffs[paramId] === -this.rrMaxDebuffLimit(paramId); };
    B.buffIconIndex = function(buffLevel, paramId) {
        if (buffLevel > 0) return Game_BattlerBase.ICON_BUFF_START + Math.min(buffLevel - 1, 1) * 8 + paramId;
        // max, not min: from three levels down this points past the debuff rows, as it did.
        if (buffLevel < 0) return Game_BattlerBase.ICON_DEBUFF_START + Math.max(-buffLevel - 1, -1) * 8 + paramId;
        return 0;
    };
    B.rrBuffTurns = function(paramId) { return this._buffTurns[paramId] || 0; };
    B.rrBuffChangeTurns = function(paramId, value) { this._buffTurns[paramId] = Math.max(value, 0); };

    // A buff that meets a debuff (or a debuff a buff) clears the stat.
    const G = Game_Battler.prototype;
    G.addBuff = function(paramId, turns) {
        if (!this.isAlive()) return;
        this.increaseBuff(paramId);
        if (this.isDebuffAffected(paramId)) this.eraseBuff(paramId);
        this.overwriteBuffTurns(paramId, turns);
        this._result.pushAddedBuff(paramId);
        this.refresh();
    };
    G.addDebuff = function(paramId, turns) {
        if (!this.isAlive()) return;
        this.decreaseBuff(paramId);
        if (this.isBuffAffected(paramId)) this.eraseBuff(paramId);
        this.overwriteBuffTurns(paramId, turns);
        this._result.pushAddedDebuff(paramId);
        this.refresh();
    };

    //-------------------------------------------------------------------------
    // State turns
    //-------------------------------------------------------------------------
    B.rrStateTurns = function(stateId) {
        const id = stateId && typeof stateId === 'object' ? stateId.id : stateId;
        return this._stateTurns[id] || 0;
    };
    B.rrStateChangeTurns = function(stateId, value) {
        const id = stateId && typeof stateId === 'object' ? stateId.id : stateId;
        this._stateTurns[id] = Math.max(value, 0);
    };
    // The state's own turns, lengthened by the notes on the battler's actor, class, equipment or enemy and states.
    B.rrStateTurnMod = function(stateId) {
        const state = $dataStates[stateId];
        if (!state) return 0;
        let n = state.minTurns + Math.randomInt(1 + Math.max(state.maxTurns - state.minTurns, 0));
        for (const o of this.rrBsmObjects()) {
            const turns = bsm(o).stateTurns;
            if (turns.has(stateId)) n += turns.get(stateId);
        }
        return Math.max(n, 0);
    };
    B.resetStateCounts = function(stateId) {
        this._stateTurns[stateId] = this.rrStateTurnMod(stateId);
    };
    G.rrTotalStateCounts = function(stateId) {
        this.rrStateChangeTurns(stateId, this.rrStateTurnMod(stateId) + this.rrStateTurns(stateId));
    };
    // A state already there follows its reapply rule (kept, reset or added on); a state removed earlier in the
    // same action can come back.
    G.addState = function(stateId) {
        const state = $dataStates[stateId];
        if (!state) return;
        const rule = bsm(state).reapply;
        const renewed = this.isStateAffected(stateId);
        if (rule === 0 && renewed) return;
        if (!this.isStateAddable(stateId)) {
            if (!renewed && this._result.pushBlockedState) this._result.pushBlockedState(stateId);
            return;
        }
        if (!renewed) {
            this.addNewState(stateId);
            // A plugin may turn the state away in addNewState (a refused death): nothing landed, nothing is reported.
            const landed = this.isStateAffected(stateId);
            this.refresh();
            if (!landed) {
                if (this._result.pushBlockedState) this._result.pushBlockedState(stateId);
                return;
            }
        }
        if (rule === 1) this.resetStateCounts(stateId);
        if (rule === 2) this.rrTotalStateCounts(stateId);
        const first = !this._result.isStateAdded(stateId);
        this._result.pushAddedState(stateId);
        if (renewed && first && this._result.pushRenewedState) this._result.pushRenewedState(stateId);
        if (typeof ReactorEvents !== 'undefined' && ReactorEvents.emit) ReactorEvents.emit('stateAdded', { battler: this, stateId, renewed });
    };

    //-------------------------------------------------------------------------
    // Skills and items that change turns left (in battle)
    //-------------------------------------------------------------------------
    const _applyItemUserEffect = Game_Action.prototype.applyItemUserEffect;
    Game_Action.prototype.applyItemUserEffect = function(target) {
        _applyItemUserEffect.call(this, target);
        const item = this.item();
        if (!item || !$gameParty.inBattle()) return;
        const tags = bsm(item);
        for (const [stateId, delta] of tags.stateTurns) {
            if (!target.isStateAffected(stateId)) continue;
            if (!($dataStates[stateId] && $dataStates[stateId].autoRemovalTiming > 0)) continue;
            target.rrStateChangeTurns(stateId, delta + target.rrStateTurns(stateId));
            if (target.rrStateTurns(stateId) <= 0) target.removeState(stateId);
            target.result().success = true;
        }
        for (const [table, has] of [[tags.buffTurns, 'isBuffAffected'], [tags.debuffTurns, 'isDebuffAffected']]) {
            for (const [paramId, delta] of table) {
                if (!target[has](paramId)) continue;
                target.rrBuffChangeTurns(paramId, delta + target.rrBuffTurns(paramId));
                if (target.rrBuffTurns(paramId) < 0) target.removeBuff(paramId);
                target.result().success = true;
            }
        }
    };

    //-------------------------------------------------------------------------
    // Turns left, drawn over the icons in battle
    //-------------------------------------------------------------------------
    const W = Window_Base.prototype;
    const _drawIcons = W.rrAceDrawActorIcons;
    W.rrAceDrawActorIcons = function(actor, x, y, width = 96) {
        if (_drawIcons) _drawIcons.call(this, actor, x, y, width);
        else this.drawActorIcons(actor, x, y, width);
        this.rrDrawActorIconTurns(actor, x, y, width);
    };
    W.rrDrawActorIconTurns = function(actor, dx, dy, dw) {
        if (!SHOW_TURNS || !(SceneManager._scene instanceof Scene_Battle)) return;
        this.resetFontSettings();
        this.contents.outlineColor = 'rgba(0, 0, 0, 1)';
        this.contents.fontBold = true;
        this.contents.fontSize = $gameSystem.mainFontSize() * TURNS_SIZE / RGSS_SIZE;
        const bx = dx;
        dy += TURNS_Y;
        // An icon that ends exactly at the edge gets no number.
        for (const state of actor.states()) {
            if (dx + 24 >= dw + bx) break;
            if (state.iconIndex <= 0) continue;
            const turns = Math.trunc(actor.rrStateTurns(state.id));
            if (state.autoRemovalTiming > 0 && turns < 100) this.drawText(turns, dx, dy, 24, 'right');
            dx += 24;
        }
        for (let i = 0; i < 8; i++) {
            if (dx + 24 >= dw + bx) break;
            if (actor.buffIconIndex(actor.rrBuffLevel(i), i) === 0) continue;
            const turns = Math.trunc(actor.rrBuffTurns(i));
            if (turns < 100) this.drawText(turns, dx, dy, 24, 'right');
            dx += 24;
        }
        this.contents.fontBold = false;
        this.resetFontSettings();
    };
})();
