'use strict';
// Plugin parameters for RR_DeathCommonEvents from the game's copy of Yanfly's Death Common Events
// (YEA::DEATH_EVENTS::WIPE_OUT_EVENT).

function extract({ constants = {} } = {}) {
    const v = Number(constants['YEA::DEATH_EVENTS::WIPE_OUT_EVENT']);
    return { wipeOutEvent: String(v > 0 ? v : 0) };
}

module.exports = { extract };
