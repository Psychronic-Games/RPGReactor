/*:
 * @target MZ
 * @plugindesc Kread's Event update (VX Ace), for imported games
 * @author Kread-EX; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_KreadEventUpdate.js
 *
 * An event with [update] in its name keeps its autonomous movement (random,
 * approach or custom route) going wherever it is on the map. Other events
 * start their autonomous moves only near the screen, as usual.
 * No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 *
 * @param tag
 * @text Name tag
 * @default [update]
 * @desc An event whose name contains this text always moves.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_KreadEventUpdate');
    const TAG = params.tag || '[update]';

    const _isNearTheScreen = Game_Event.prototype.isNearTheScreen;
    Game_Event.prototype.isNearTheScreen = function() {
        const data = this.event();
        if (data && String(data.name || '').includes(TAG)) return true;
        return _isNearTheScreen.apply(this, arguments);
    };
})();
