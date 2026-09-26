'use strict';
// Plugin parameters for RR_SmartFollowers from the game's copy of the script (CPSmartFollowers::MoveDelay).

function extract({ constants = {} } = {}) {
    const delay = constants['CPSmartFollowers::MoveDelay'];
    return { moveDelay: String(typeof delay === 'number' && Number.isFinite(delay) ? delay : 100) };
}

module.exports = { extract };
