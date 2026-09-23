/*:
 * @target MZ
 * @plugindesc Editable Actor Options (VX), for imported games
 * @author modern algebra; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ActorOptions.js
 *
 * VX actors had six options (Dual Wield, Fix Equipment, Auto Battle, Guard,
 * Pharmacology, Critical Bonus); the importer made them traits on the actor.
 * This turns them on and off during play, as the script's
 * change_actor_options(actor, option, value) did:
 *
 *   this.rrActorOption(actorId, optionId, true | false)   // no value: toggle
 *
 * option: 0 dual wield, 1 fix equipment, 2 auto battle, 3 guard (super
 * guard), 4 pharmacology, 5 critical bonus. The change saves with the game.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script. Turning the plugin off leaves the calls doing nothing.
 */
(() => {
    'use strict';
    /** Each option as the traits the importer gave it (VxConvert.database). */
    const OPTION_TRAITS = [
        [{ code: 55, dataId: 1, value: 1 }],
        [1, 2, 3, 4, 5].map(e => ({ code: 53, dataId: e, value: 1 })),
        [{ code: 62, dataId: 0, value: 1 }],
        [{ code: 62, dataId: 1, value: 1 }],
        [{ code: 23, dataId: 3, value: 2 }],
        [{ code: 22, dataId: 2, value: 0.04 }]
    ];
    const isOption = (t, option) => OPTION_TRAITS[option].some(o => o.code === t.code && o.dataId === t.dataId && o.value === t.value);

    Game_Actor.prototype.rrHasOption = function(option) {
        if (this._rrOptions && this._rrOptions[option] !== undefined) return this._rrOptions[option];
        return this.actor().traits.some(t => isOption(t, option));
    };
    Game_Actor.prototype.rrSetOption = function(option, value) {
        if (!OPTION_TRAITS[option]) return;
        if (!this._rrOptions) this._rrOptions = {};
        this._rrOptions[option] = value === undefined || value === -1 ? !this.rrHasOption(option) : !!value;
        this.refresh();
    };

    // The actor's own traits, with the options this game changed put right.
    const _traitObjects = Game_Actor.prototype.traitObjects;
    Game_Actor.prototype.traitObjects = function() {
        const objects = _traitObjects.call(this);
        if (!this._rrOptions) return objects;
        const actor = this.actor();
        const set = Object.keys(this._rrOptions).map(Number);
        const traits = actor.traits.filter(t => !set.some(option => isOption(t, option)));
        for (const option of set) if (this._rrOptions[option]) traits.push(...OPTION_TRAITS[option]);
        return objects.map(o => (o === actor ? Object.assign({}, actor, { traits }) : o));
    };

    Game_Interpreter.prototype.rrActorOption = function(actorId, option, value) {
        const actor = $gameActors.actor(Number(actorId));
        if (actor) actor.rrSetOption(Number(option), value);
    };
})();
