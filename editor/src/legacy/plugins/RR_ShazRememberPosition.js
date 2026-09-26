/*:
 * @target MZ
 * @plugindesc Remember Event Position (VX Ace), for imported games
 * @author Shaz; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ShazRememberPosition.js
 *
 * An event can remember where it stands: the next time its map loads it
 * appears there, facing the same way, instead of where it was placed in the
 * editor. The positions are kept in the save.
 *
 * In a move route (`this` is the event):
 *   this.rrShazSavePos()            remember the current position and facing
 *   this.rrShazSavePos(x, y, dir)   remember that position instead
 *   this.rrShazForgetPos()          go back to the editor position next time
 * In a Script command the same calls go through the event:
 *   $gameMap.event(this._eventId)?.rrShazSavePos?.()
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const positions = () => $gameSystem._rrEventPositions || ($gameSystem._rrEventPositions = {});
    const keyOf = (mapId, eventId) => mapId + ',' + eventId;

    const _initialize = Game_Event.prototype.initialize;
    Game_Event.prototype.initialize = function(mapId, eventId) {
        _initialize.call(this, mapId, eventId);
        const saved = positions()[keyOf(mapId, eventId)];
        if (saved) {
            this.locate(saved[0], saved[1]);
            // Any stored facing counts (Ruby truth); setDirection itself ignores 0 and a fixed direction.
            if (saved[2] !== null && saved[2] !== undefined && saved[2] !== false) this.setDirection(saved[2]);
            this._stopCount = 0;
            this.refresh();
        }
    };

    Game_Event.prototype.rrShazSavePos = function(x = this.x, y = this.y, dir = this._direction) {
        positions()[keyOf(this._mapId, this._eventId)] = [x, y, dir];
    };

    Game_Event.prototype.rrShazForgetPos = function() {
        delete positions()[keyOf(this._mapId, this._eventId)];
    };
})();
