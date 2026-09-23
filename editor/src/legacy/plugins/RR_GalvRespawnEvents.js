/*:
 * @target MZ
 * @plugindesc Galv's Event Spawn Timer (VX Ace), for imported games
 * @author Galv; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_GalvRespawnEvents.js
 *
 * Respawn timers for events: a timer runs in play-time seconds, and when it is
 * up a switch or self switch is changed.
 *
 * Script calls (Game_Interpreter):
 *   this.rrSetSpawn(mapId, eventId, seconds)   0 = this map / this event
 *   this.rrDoAllRespawn(switch, status)        every timer that is up
 *   this.rrDoMapRespawn(mapId, switch, status) the timers of one map
 *   this.rrDoEventRespawn(mapId, eventId, switch, status)
 *   this.rrRespawnTime(mapId, eventId)         seconds left (0 = none)
 *   this.rrPurgeTimer(mapId, eventId)          drop one timer
 *   this.rrPurgeRespawnTimers()                drop all timers
 * Move route Script (the event itself):
 *   this.rrDoRespawn(switch, status)           check this event's timer
 * switch is a self switch letter ("A") or a game switch number.
 * Timers are kept in $gameSystem._rrSpawnTimers, so a save keeps them.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * above. Turning the plugin off leaves those calls doing nothing.
 */
(() => {
    'use strict';
    PluginManager.parameters('RR_GalvRespawnEvents');

    const timers = () => {
        if (!$gameSystem._rrSpawnTimers) $gameSystem._rrSpawnTimers = {};
        return $gameSystem._rrSpawnTimers;
    };
    const keyOf = (mapId, eventId) => `${mapId},${eventId}`;
    const parseKey = (key) => key.split(',').map(Number);

    const applySwitch = (mapId, eventId, sw, status) => {
        if (typeof sw === 'string') $gameSelfSwitches.setValue([mapId, eventId, sw], status);
        else if (typeof sw === 'number') $gameSwitches.setValue(sw, status);
    };

    // Fires every expired timer the filter accepts and removes it.
    const fireExpired = (sw, status, accept) => {
        const list = timers(), now = $gameSystem.playtime();
        for (const key of Object.keys(list)) {
            const [mapId, eventId] = parseKey(key);
            if (!accept(mapId, eventId) || now < list[key]) continue;
            applySwitch(mapId, eventId, sw, status);
            delete list[key];
        }
    };

    Game_Interpreter.prototype.rrSetSpawn = function(mapId, eventId, seconds) {
        if (Number(eventId) === 0) eventId = this._eventId;
        if (Number(mapId) === 0) mapId = $gameMap.mapId();
        timers()[keyOf(Number(mapId), Number(eventId))] = $gameSystem.playtime() + Number(seconds || 0);
    };

    Game_Interpreter.prototype.rrDoAllRespawn = function(sw, status) {
        fireExpired(sw, status, () => true);
    };

    Game_Interpreter.prototype.rrDoMapRespawn = function(mapId, sw, status) {
        fireExpired(sw, status, (m) => m === Number(mapId));
    };

    Game_Interpreter.prototype.rrDoEventRespawn = function(mapId, eventId, sw, status) {
        fireExpired(sw, status, (m, e) => m === Number(mapId) && e === Number(eventId));
    };

    Game_Interpreter.prototype.rrRespawnTime = function(mapId, eventId) {
        if (Number(eventId) === 0) eventId = this._eventId;
        if (Number(mapId) === 0) mapId = $gameMap.mapId();
        const at = timers()[keyOf(Number(mapId), Number(eventId))];
        return at === undefined ? 0 : at - $gameSystem.playtime();
    };

    Game_Interpreter.prototype.rrPurgeTimer = function(mapId, eventId) {
        delete timers()[keyOf(Number(mapId), Number(eventId))];
    };

    Game_Interpreter.prototype.rrPurgeRespawnTimers = function() {
        $gameSystem._rrSpawnTimers = {};
    };

    Game_Event.prototype.rrDoRespawn = function(sw, status) {
        const list = timers(), key = keyOf(this._mapId, this._eventId);
        if (list[key] === undefined || $gameSystem.playtime() < list[key]) return;
        applySwitch(this._mapId, this._eventId, sw, status);
        delete list[key];
    };
})();
