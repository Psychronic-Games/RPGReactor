/*:
 * @target MZ
 * @plugindesc OZ Character Z and Animation Z (VX Ace), for imported games
 * @author OZ; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_OzCharacterZ.js
 *
 * @plus_z = N in a move route shifts a character's draw order by N (in the
 * old engine's units: 100 per priority layer, MZ spaces its layers 2 apart);
 * change_zmap(ids, z, only) does it for many. @animation_z = N places the
 * character's animations N units from it (-2: just behind it).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * below. Turning the plugin off leaves those calls doing nothing.
 */
(() => {
    'use strict';
    const _rrPlusZScreenZ = Game_CharacterBase.prototype.screenZ;
    Game_CharacterBase.prototype.screenZ = function() {
        const base = _rrPlusZScreenZ.call(this);
        return typeof this._rrPlusZ === "number" && this._rrPlusZ ? base + this._rrPlusZ / 50 : base;
    };

    Game_Map.prototype.rrChangeZ = function(ids, z, only = true) {
        const list = Array.isArray(ids) ? ids : [ids];
        const all = [$gamePlayer].concat(this.events());
        for (const character of all) {
            const id = character === $gamePlayer ? -1 : character.eventId();
            if (list.includes(id) === only) character._rrPlusZ = z;
        }
    };


    const _rrAuthoredAnimationZ = Spriteset_Base.prototype.authoredAnimationZ;
    Spriteset_Base.prototype.authoredAnimationZ = function(targets) {
        for (const target of targets || []) {
            if (target && typeof target._rrAnimationZ === "number" && typeof target.screenZ === "function") {
                return target.screenZ() + target._rrAnimationZ / 50;
            }
        }
        return _rrAuthoredAnimationZ.call(this, targets);
    };
})();
