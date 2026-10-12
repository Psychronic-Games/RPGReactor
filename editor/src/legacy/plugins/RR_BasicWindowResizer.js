/*:
 * @target MZ
 * @plugindesc Basic Window Resizer (VX), for imported games
 * @author V.M. of D.T.; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_BasicWindowResizer.js
 *
 * Resolution.resize(width, height) sizes the game window's inside to width
 * × height and centres it on the screen; the picture is stretched to fill
 * it. Nothing happens in full screen or in a browser.
 *
 * Script call: Graphics.rrResolutionResize(width, height)
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    Graphics.rrResolutionResize = function(width, height) {
        if (!Utils.isNwjs() || !(width > 0 && height > 0)) return;
        const win = typeof nw !== 'undefined' && nw.Window ? nw.Window.get() : null;
        if (win && win.isFullscreen) return;
        window.resizeBy(Math.round(width) - window.innerWidth, Math.round(height) - window.innerHeight);
        const sw = window.screen.availWidth || window.screen.width, sh = window.screen.availHeight || window.screen.height;
        window.moveTo(Math.max(0, Math.floor((sw - window.outerWidth) / 2)), Math.max(0, Math.floor((sh - window.outerHeight) / 2)));
    };
})();
