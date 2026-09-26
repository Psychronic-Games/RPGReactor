/*:
 * @target MZ
 * @plugindesc State Rate Popups (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeStateRatePopups.js
 *
 * When a skill or item's Add State effect leaves a living target without the
 * state, and the target takes that state at less than 100% (but not less
 * than 0%), a popup with the state's icon says so: the "immune" text at 0%,
 * the "resistant" text otherwise. States without an icon give no popup.
 *
 * The popups are Yanfly's battle popups (RR_YanflyBattleEngine, "ADDSTATE"
 * style); without that plugin nothing is shown.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy of Yanfly's
 * Battle Engine.
 *
 * @param immuneText
 * @type string
 * @default IMMUNE
 *
 * @param resistText
 * @type string
 * @default RESIST
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HimeStateRatePopups');
    const IMMUNE = String(params.immuneText ?? 'IMMUNE');
    const RESIST = String(params.resistText ?? 'RESIST');

    Game_BattlerBase.prototype.rrMakeStateRatePopup = function(stateId) {
        const rate = this.stateRate(stateId);
        // A weakness or an absorbing rate says nothing.
        if (rate < 0 || rate >= 1) return;
        const state = $dataStates[stateId];
        if (!state || state.iconIndex === 0) return;
        this.rrCreatePopup?.(rate === 0 ? IMMUNE : RESIST, 'ADDSTATE', ['state', state.iconIndex]);
    };

    // Checked on every Add State effect, whoever the target is, when the state did not newly land.
    const _addNormalState = Game_Action.prototype.itemEffectAddNormalState;
    Game_Action.prototype.itemEffectAddNormalState = function(target, effect) {
        const before = target._states.slice();
        _addNormalState.call(this, target, effect);
        const landed = target._states.includes(effect.dataId) && !before.includes(effect.dataId);
        if (!target.isDead() && !landed) target.rrMakeStateRatePopup(effect.dataId);
    };
})();
