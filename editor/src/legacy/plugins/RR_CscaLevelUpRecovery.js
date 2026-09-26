/*:
 * @target MZ
 * @plugindesc CSCA Recovery on Level Up (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaLevelUpRecovery.js
 *
 * An actor who gains a level is fully recovered: HP and MP to the maximum
 * and every state removed (TP is left as it is). No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const _levelUp = Game_Actor.prototype.levelUp;
    Game_Actor.prototype.levelUp = function() {
        _levelUp.call(this);
        this.recoverAll();
    };
})();
