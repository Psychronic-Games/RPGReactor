/*:
 * @target MZ
 * @plugindesc Battle Symphony Add-on: Skill Effect Tags (VX Ace), for imported games
 * @author Yami; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YamiSkillEffectTags.js
 *
 * Three more tags for Battle Symphony action sequences:
 *   add state 9: user            add state 10, 11, 12: targets
 *   remove state 9: user         remove state 10, 11: targets
 *   damage change: 80%
 * Add and remove state put states on (or take them off) the battlers the
 * tag names; a state added this way ignores its success rate. Damage change
 * scales the HP and MP damage the action's targets take for the rest of the
 * action (80% of the damage, truncated); every battler is back to 100% once
 * the action ends.
 *
 * The action sequences are run by the Battle Symphony port, which hands a
 * tag it does not know to
 *   Scene_Battle.prototype.rrImportedSymphony(action, { values, targets,
 *     actionTargets, subject })
 * (targets: the battlers the tag's target typing names; actionTargets: the
 * action's own targets); this add-on answers true for its tags.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const ADD = /(?:ADD_STATE|ADD STATE)[ ](\d+(?:\s*,\s*\d+)*)/i;
    const REMOVE = /(?:REMOVE_STATE|REMOVE STATE)[ ](\d+(?:\s*,\s*\d+)*)/i;
    const ids = (list) => (list.match(/\d+/g) || []).map(Number).filter(n => n > 0);
    const unique = (list) => Array.from(new Set((list || []).filter(Boolean)));

    //-------------------------------------------------------------------------
    // Damage ratio: kept on each battler's result, applied to the final damage
    //-------------------------------------------------------------------------
    // A ratio of 0 holds: no damage at all.
    Game_ActionResult.prototype.rrDamageRatio = function() { return this._rrDamageRatio === undefined || this._rrDamageRatio === null ? 100 : this._rrDamageRatio; };
    Game_ActionResult.prototype.rrSetDamageRatio = function(ratio = 100) { this._rrDamageRatio = ratio; };
    const _makeDamageValue = Game_Action.prototype.makeDamageValue;
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        const value = _makeDamageValue.call(this, target, critical);
        return Math.trunc(value * target.result().rrDamageRatio() / 100);
    };
    const _endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        _endAction.call(this);
        for (const battler of $gameParty.battleMembers().concat($gameTroop.members())) battler.result().rrSetDamageRatio(100);
    };

    //-------------------------------------------------------------------------
    // The tags
    //-------------------------------------------------------------------------
    const _imported = Scene_Battle.prototype.rrImportedSymphony;
    Scene_Battle.prototype.rrImportedSymphony = function(action, context = {}) {
        const name = String(action || '');
        let m;
        if ((m = ADD.exec(name))) {
            const states = ids(m[1]);
            for (const target of unique(context.targets)) for (const id of states) target.addState(id);
            return true;
        }
        if ((m = REMOVE.exec(name))) {
            const states = ids(m[1]);
            for (const target of unique(context.targets)) for (const id of states) target.removeState(id);
            return true;
        }
        if (/DAMAGE CHANGE/i.test(name)) {
            const subject = context.subject;
            if (!subject || !subject.isAlive()) return true;
            const ratio = parseInt(String((context.values || [])[0] ?? ''), 10) || 0;
            for (const target of context.actionTargets || []) target.result().rrSetDamageRatio(ratio);
            return true;
        }
        return _imported ? _imported.call(this, action, context) : false;
    };
})();
