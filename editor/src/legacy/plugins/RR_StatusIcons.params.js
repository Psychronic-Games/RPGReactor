'use strict';
// Plugin parameters for RR_StatusIcons from the game's copy of the HP/MP/TP/EXP icons script (Soul_Icons).

function extract({ constants = {} } = {}) {
    const k = (name) => String(Number(constants['Soul_Icons::' + name]) || 0);
    return { hpIcon: k('HP_Icon'), mpIcon: k('MP_Icon'), tpIcon: k('TP_Icon') };
}

module.exports = { extract };
