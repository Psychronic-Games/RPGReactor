'use strict';
// Plugin parameters for RR_CscaExtraStats from the game's copy of CSCA Extra Stats (CSCA_EXTRA_STATS's
// variable IDs).

const NAMES = { goldSpent: 'GOLDSPENT', goldGained: 'GOLDGAINED', itemsBought: 'ITEMSBOUGHT', itemsSold: 'ITEMSSOLD', damageTaken: 'DAMAGE_TAKEN', damageDealt: 'DAMAGE_DEALT', itemsUsed: 'ITEMS_USED', looted: 'LOOTED' };

function extract({ constants = {} } = {}) {
    const out = {};
    for (const [param, name] of Object.entries(NAMES)) out[param] = String(Number(constants['CSCA_EXTRA_STATS::' + name]) || 0);
    return out;
}

module.exports = { extract };
