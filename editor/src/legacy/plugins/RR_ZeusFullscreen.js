/*:
 * @target MZ
 * @plugindesc Fullscreen++ by Zeus81 (VX Ace), for imported games
 * @author Zeus81; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ZeusFullscreen.js
 *
 * The game's own key for full screen: F5 switches between full screen and a
 * window, Shift+F5 between stretching the picture and keeping its shape (the
 * engine's F3). F5 no longer restarts the game.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param keyCode
 * @text Key
 * @desc The key's code (116 is F5).
 * @type number
 * @default 116
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_ZeusFullscreen');
    const KEY = Number(P.keyCode) || 116;
    const _onKeyDown = SceneManager.onKeyDown;
    SceneManager.onKeyDown = function(event) {
        if (event.keyCode === KEY && !event.ctrlKey && !event.altKey) {
            event.preventDefault();
            if (event.shiftKey) Graphics._switchStretchMode();
            else Graphics._switchFullScreen();
            return;
        }
        _onKeyDown.call(this, event);
    };
})();
