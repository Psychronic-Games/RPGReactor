/*:
 * @target MZ
 * @plugindesc F12 Reset Fix (VX Ace), for imported games
 * @author Acezon; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_AcezonF12Reset.js
 *
 * F12 restarts the game from the beginning, as a fresh start of the program
 * (the splash and title screens again, nothing kept from the session but
 * the options and saves on disk).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    document.addEventListener('keydown', (event) => {
        if (event.keyCode !== 123 || event.ctrlKey || event.altKey || event.repeat) return;
        event.preventDefault();
        if (Utils.isNwjs()) SceneManager.reloadGame();
        else location.reload();
    });
})();
