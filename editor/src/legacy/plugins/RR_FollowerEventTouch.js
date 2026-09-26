/*:
 * @target MZ
 * @plugindesc Follower Event Touch (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_FollowerEventTouch.js
 *
 * An "Event Touch" event that walks into one of the party's visible
 * followers starts, as if it had touched the leader. Anything else that asks
 * whether the leader stands on a tile counts the visible followers too.
 * Turning the chosen switch ON stops this (switch 0, the default, is never
 * on).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param disableSwitch
 * @text Disable switch
 * @desc While this switch is ON, followers do not count (Disable_Switch).
 * @type switch
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_FollowerEventTouch');
    const DISABLE_SWITCH = Number(params.disableSwitch || 0);

    Game_System.prototype.rrFollowerEventTouchDisabled = function() {
        return $gameSwitches.value(DISABLE_SWITCH);
    };

    // The player's own pos is inherited; read it through the chain so a later change to it still applies.
    const _pos = Object.prototype.hasOwnProperty.call(Game_Player.prototype, 'pos') ? Game_Player.prototype.pos : null;
    Game_Player.prototype.pos = function(x, y) {
        return (_pos || Game_Character.prototype.pos).call(this, x, y) || this.rrFollowerPos(x, y);
    };

    Game_Player.prototype.rrFollowerPos = function(x, y) {
        if ($gameSystem.rrFollowerEventTouchDisabled()) return false;
        return this._followers.visibleFollowers().some(follower => follower.pos(x, y));
    };
})();
