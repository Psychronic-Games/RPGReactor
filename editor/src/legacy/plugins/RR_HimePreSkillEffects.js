/*:
 * @target MZ
 * @plugindesc Pre-Skill Effects (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimePreSkillEffects.js
 *
 * <pre skill effect: n> in a skill or item's note takes its n-th effect (1
 * is the top of the list) out of the list and runs it before the skill is
 * used in battle: a Common Event effect's event runs to its end before the
 * battle log names the skill. Other kinds of effect do nothing there.
 *
 * Battle flows that replace BattleManager.processTurn run the effects with
 *   BattleManager.rrPreSkillEffects(subject, action)
 * which returns true while a common event it reserved still has to run.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const RE = /<pre[-_ ]skill[-_ ]effect:\s*(\d+)\s*>/gi;

    // The tagged effects move out of the item's list, by their places in the original list.
    function split(item) {
        if (!item || !Array.isArray(item.effects) || item._rrPreSkillEffects) return;
        const effects = item.effects.slice(), pre = [];
        for (const m of String(item.note || '').matchAll(RE)) {
            const i = Number(m[1]) - 1;
            const effect = effects[i];
            effects[i] = null;
            if (effect) pre.push(effect);
        }
        Object.defineProperty(item, '_rrPreSkillEffects', { value: pre, configurable: true });
        if (pre.length) item.effects = effects.filter(Boolean);
    }
    DataManager.rrPreSkillEffects = function(item) {
        split(item);
        return (item && item._rrPreSkillEffects) || [];
    };
    const _onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _onLoad.call(this, object);
        if (object === $dataSkills || object === $dataItems) for (const item of object) split(item);
    };

    // An effect run before the skill: a common event is reserved; nothing else applies without a target.
    Game_Battler.prototype.rrApplyPreSkillEffects = function(item) {
        for (const effect of DataManager.rrPreSkillEffects(item)) {
            if (effect.code === Game_Action.EFFECT_COMMON_EVENT) $gameTemp.reserveCommonEvent(effect.dataId);
        }
    };

    BattleManager.rrPreSkillEffects = function(subject, action) {
        if (!subject || !action || action._rrPreSkillDone) return false;
        action._rrPreSkillDone = true;
        const item = action.item();
        if (!DataManager.rrPreSkillEffects(item).length) return false;
        subject.rrApplyPreSkillEffects(item);
        return $gameTemp.isCommonEventReserved();
    };

    // A valid action with pre-skill effects waits for their common event, which the battle's event update runs
    // before the action is taken up again.
    const _processTurn = BattleManager.processTurn;
    BattleManager.processTurn = function() {
        const subject = this._subject;
        const action = subject && subject.currentAction();
        if (action && !action._rrPreSkillDone) {
            action.prepare();
            if (action.isValid() && this.rrPreSkillEffects(subject, action)) return;
        }
        _processTurn.call(this);
    };
})();
