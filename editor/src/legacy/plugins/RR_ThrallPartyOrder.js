/*:
 * @target MZ
 * @plugindesc Change Party Order (VX), for imported games
 * @author modern algebra; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallPartyOrder.js
 *
 * On the map, page down sends the leader to the back of the party and page
 * up brings the last member to the front, unless the freeze switch is on.
 * As in the original this works whenever the map updates, a message or an
 * event running included.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param freezeSwitch
 * @text Freeze switch
 * @desc ORDER_FREEZE_SWITCH_ID: on, the order stays.
 * @type switch
 * @default 22
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallPartyOrder');
    const FREEZE = Number(params.freezeSwitch || 22);
    const _update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _update.call(this);
        if ($gameSwitches.value(FREEZE)) return;
        if (Input.isTriggered('pagedown')) Game_Party.prototype.rrRotateForward.call($gameParty);
        if (Input.isTriggered('pageup')) Game_Party.prototype.rrRotateBack.call($gameParty);
    };
    /** The leader leaves and joins again at the back. */
    Game_Party.prototype.rrRotateForward = function() {
        const lead = this.members()[0];
        if (!lead) return;
        this.removeActor(lead.actorId());
        this.addActor(lead.actorId());
    };
    /** Every member leaves and joins again, the last one first. */
    Game_Party.prototype.rrRotateBack = function() {
        const ids = this.members().map(a => a.actorId());
        if (!ids.length) return;
        ids.unshift(ids.pop());
        for (const id of ids) { this.removeActor(id); this.addActor(id); }
    };
})();
