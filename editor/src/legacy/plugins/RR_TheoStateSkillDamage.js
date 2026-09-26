/*:
 * @target MZ
 * @plugindesc State Damage Using Skill (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoStateSkillDamage.js
 *
 * A state with <skill damage: n> in its note hurts the battler with skill n
 * at the end of each battle turn, as if the battler who inflicted the state
 * used the skill on it: the skill's formula, element, critical and effects
 * apply, its animation plays and the battle log reports the result, then the
 * battle waits a moment. The battler must be alive at the turn's end. This
 * happens before the turn's regeneration and state countdown.
 *
 * Only a state put on by a skill or item's Add State (or an attack's state)
 * that the battler still has remembers who put it on; a state added by an
 * event deals no skill damage. Who put a state on is not kept in saves.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const RE = /<skill[\s_]+damage\s*:\s*(\d+)>/i;
    const skillDamage = (state) => {
        if (!state) return 0;
        if (state._rrSkillDamage === undefined) {
            const m = RE.exec(String(state.note || ''));
            Object.defineProperty(state, '_rrSkillDamage', { value: m ? Number(m[1]) : 0, configurable: true });
        }
        return state._rrSkillDamage;
    };

    // Who put each state on, per battler; battler objects are not saved with it.
    const inflicters = new WeakMap();
    const table = (battler) => {
        let t = inflicters.get(battler);
        if (!t) inflicters.set(battler, (t = new Map()));
        return t;
    };
    Game_BattlerBase.prototype.rrStateInflicter = function(stateId) { return table(this).get(stateId) || null; };

    const _clearStates = Game_BattlerBase.prototype.clearStates;
    Game_BattlerBase.prototype.clearStates = function() {
        _clearStates.call(this);
        inflicters.delete(this);
    };
    const _eraseState = Game_BattlerBase.prototype.eraseState;
    Game_BattlerBase.prototype.eraseState = function(stateId) {
        _eraseState.call(this, stateId);
        table(this).delete(stateId);
    };

    // After a successful Add State, the user is remembered for each of the effect's states the target has.
    const _addAttackState = Game_Action.prototype.itemEffectAddAttackState;
    Game_Action.prototype.itemEffectAddAttackState = function(target, effect) {
        _addAttackState.call(this, target, effect);
        if (!target.result().success) return;
        for (const stateId of this.subject().attackStates()) {
            if (target.isStateAffected(stateId)) table(target).set(stateId, this.subject());
        }
    };
    const _addNormalState = Game_Action.prototype.itemEffectAddNormalState;
    Game_Action.prototype.itemEffectAddNormalState = function(target, effect) {
        _addNormalState.call(this, target, effect);
        if (!target.result().success) return;
        if (target.isStateAffected(effect.dataId)) table(target).set(effect.dataId, this.subject());
    };

    const _onTurnEnd = Game_Battler.prototype.onTurnEnd;
    Game_Battler.prototype.onTurnEnd = function() {
        if (this.isAlive() && $gameParty.inBattle()) this.rrPerformSlipDamageFormula();
        _onTurnEnd.call(this);
    };
    Game_Battler.prototype.rrPerformSlipDamageFormula = function() {
        for (const stateId of this._states.slice()) {
            const skill = $dataSkills[skillDamage($dataStates[stateId])];
            const user = table(this).get(stateId);
            if (!skill || !user) continue;
            const action = new Game_Action(user);
            action.setSkill(skill.id);
            action.apply(this);
            if (skill.animationId > 0) $gameTemp.requestAnimation([this], skill.animationId);
            const log = BattleManager._logWindow;
            if (log) {
                // Without Yanfly's popups the damage is popped up from the result as it stands now: the turn's
                // own countdown clears it before the log gets there.
                if (!this.rrCreatePopup) log.push('rrPopupResult', this, JsonEx.makeDeepCopy(this.result()));
                log.displayActionResults(user, this);
                log.push('rrWaitFrames', 15);
            }
        }
    };

    Window_BattleLog.prototype.rrWaitFrames = function(frames) { this._waitCount = frames; };
    Window_BattleLog.prototype.rrPopupResult = function(target, result) {
        const sprite = BattleManager._spriteset && BattleManager._spriteset.findTargetSprite(target);
        if (!sprite || !target.isSpriteVisible()) return;
        const held = target._result;
        target._result = result;
        target.startDamagePopup();
        sprite.setupDamagePopup();
        target._result = held;
    };
})();
