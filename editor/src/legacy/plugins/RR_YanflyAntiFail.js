/*:
 * @target MZ
 * @plugindesc Anti-Fail Message (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyAntiFail.js
 *
 * A skill or item with <anti fail> in its note counts as a success on every
 * target it hits, so the battle log never says it failed, even when its only
 * effects are a common event or custom ones. A miss or an evasion is still
 * reported.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const RE = /<(?:ANTI_FAIL|anti fail|antifail)>/i;
    const antiFail = (item) => {
        if (!item) return false;
        if (item._rrAntiFail === undefined) Object.defineProperty(item, '_rrAntiFail', { value: RE.test(String(item.note || '')), configurable: true });
        return item._rrAntiFail;
    };
    // Runs for a target the action hit, after the user's own effects.
    const _applyItemUserEffect = Game_Action.prototype.applyItemUserEffect;
    Game_Action.prototype.applyItemUserEffect = function(target) {
        _applyItemUserEffect.call(this, target);
        if (antiFail(this.item())) target.result().success = true;
    };
})();
