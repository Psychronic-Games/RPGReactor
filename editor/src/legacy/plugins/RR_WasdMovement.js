/*:
 * @target MZ
 * @plugindesc WASD Movement (VX Ace), for imported games
 * @author Helladen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_WasdMovement.js
 *
 * W, A, S and D walk the player (and move menu cursors) as well as the arrow
 * keys, unless a gamepad is connected, as the original did. W is also the
 * page-down button of the old engines, as it was there.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const padConnected = () => {
        try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).some(pad => pad && pad.connected); } catch (_) { return false; }
    };
    const _updateDirection = Input._updateDirection;
    Input._updateDirection = function() {
        _updateDirection.call(this);
        if (padConnected()) return;
        const dir = this.isPressed('rgssY') ? 2 : this.isPressed('rgssX') ? 4 : this.isPressed('rgssZ') ? 6 : this.isPressed('pagedown') ? 8 : 0;
        if (dir) { this._dir4 = dir; this._dir8 = dir; }
    };
})();
