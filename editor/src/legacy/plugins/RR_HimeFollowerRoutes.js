/*:
 * @target MZ
 * @plugindesc Follower Move Routes (VX Ace), for imported games
 * @author Tsukihime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeFollowerRoutes.js
 *
 * A one-line comment <move character: x> directly above a Set Move Route
 * command sends that route to character x instead of the one the command
 * names: -1 is the leader, -2 the first follower, -3 the second and so on
 * (a positive number is an event on the map). Outside battle, anything that
 * looks a character up by number (including "Wait for completion") finds
 * followers the same way.
 *
 * In a move route, `this` is the character:
 *   this.rrSyncToLeader()        take speed, opacity and the rest from the leader
 *   this.rrUnsyncFromLeader()    keep its own
 *   this.rrChaseLeader(flag)     whether it chases the character ahead
 * With Smart Followers also installed (after this plugin), followers always
 * take the leader's settings and never chase, so these three have no effect;
 * that is how the two scripts behaved together.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const TAG = /<move[-_ ]character:\s*(-?\d+)\s*>/i;

    // Ruby truth: only false and nil are false.
    const truthy = (v) => v !== false && v !== null && v !== undefined;

    Game_Character.prototype.rrSyncToLeader = function() { this._rrSyncLeader = true; };
    Game_Character.prototype.rrUnsyncFromLeader = function() { this._rrSyncLeader = false; };
    Game_Character.prototype.rrChaseLeader = function(flag) { this._rrChaseLeader = truthy(flag); };

    const _followerUpdate = Game_Follower.prototype.update;
    Game_Follower.prototype.update = function() {
        if (this._rrSyncLeader !== false) _followerUpdate.call(this);
        else Game_Character.prototype.update.call(this);
    };

    const _chase = Game_Follower.prototype.chaseCharacter;
    Game_Follower.prototype.chaseCharacter = function(character) {
        if (this._rrChaseLeader === false) return;
        _chase.call(this, character);
    };

    const _character = Game_Interpreter.prototype.character;
    Game_Interpreter.prototype.character = function(param) {
        if (!$gameParty.inBattle() && param < -1) return $gamePlayer.followers().follower(Math.abs(param) - 2) || null;
        return _character.call(this, param);
    };

    const _command205 = Game_Interpreter.prototype.command205;
    Game_Interpreter.prototype.command205 = function(params) {
        const comment = this._list && this._list[this._index - 1];
        const match = comment && comment.code === 108 && TAG.exec(String(comment.parameters[0]));
        return _command205.call(this, match ? [parseInt(match[1], 10), ...params.slice(1)] : params);
    };
})();
