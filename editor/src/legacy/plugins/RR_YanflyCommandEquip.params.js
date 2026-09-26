'use strict';
// Plugin parameters for RR_YanflyCommandEquip from the game's copy of Command Equip (YEA::COMMAND_EQUIP):
// the command text, the cooldown, whether equipping costs the turn and the types fixed in battle.

function extract({ constants = {} } = {}) {
    const k = (name) => constants['YEA::COMMAND_EQUIP::' + name];
    const out = {};
    if (typeof k('COMMAND_TEXT') === 'string') out.commandText = k('COMMAND_TEXT');
    if (typeof k('EQUIP_COOLDOWN') === 'number') out.cooldown = String(k('EQUIP_COOLDOWN'));
    // Ruby truth: only false and nil are false.
    if (k('EQUIP_SKIPTURN') !== undefined) out.skipTurn = String(k('EQUIP_SKIPTURN') !== false && k('EQUIP_SKIPTURN') !== null);
    if (Array.isArray(k('EQUIP_FIXEDSLOT'))) out.fixedSlots = JSON.stringify(k('EQUIP_FIXEDSLOT').map(Number));
    return out;
}

module.exports = { extract };
