/*:
 * @target MZ
 * @plugindesc Enemy Turn Count Fix (VX Ace), for imported games
 * @author ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_EnemyTurnCountFix.js
 *
 * The troop's turn count goes up when the party starts choosing commands,
 * not when the turn starts, so enemies and troop pages see turn 1 from the
 * first commands on. In a time-progress battle that is once, as the battle
 * begins (after the turn-0 troop pages).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const _startInput = BattleManager.startInput;
    BattleManager.startInput = function() {
        if (this._phase !== 'input') $gameTroop.increaseTurn();
        _startInput.call(this);
    };
    const _startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function() {
        const increase = $gameTroop.increaseTurn;
        $gameTroop.increaseTurn = function() {};
        try { _startTurn.call(this); } finally { delete $gameTroop.increaseTurn; }
    };
    const _updateStart = BattleManager.updateStart;
    BattleManager.updateStart = function() {
        if (this.isTpb()) $gameTroop.increaseTurn();
        _updateStart.call(this);
    };
})();
