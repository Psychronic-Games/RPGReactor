/*:
 * @target MZ
 * @plugindesc Window Color Opacity (VX Ace), for imported games
 * @author ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_WindowOpacity.js
 *
 * Every window's background opacity is a game variable (with Yanfly's System
 * Options, which offers it as an option) or a fixed number.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param variable
 * @type variable
 * @default 0
 *
 * @param opacity
 * @type number
 * @max 255
 * @default 200
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_WindowOpacity');
    const VARIABLE = Number(params.variable) || 0;
    const OPACITY = params.opacity === undefined || params.opacity === '' ? 200 : Number(params.opacity);
    const _windowOpacity = Game_System.prototype.windowOpacity;
    Game_System.prototype.windowOpacity = function() {
        if (VARIABLE > 0 && $gameVariables) return Math.min(Math.max(Number($gameVariables.value(VARIABLE)) || 0, 0), 255);
        return OPACITY >= 0 ? OPACITY : _windowOpacity.call(this);
    };
})();
