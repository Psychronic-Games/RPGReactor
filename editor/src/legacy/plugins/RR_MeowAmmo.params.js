'use strict';
// Plugin parameters for RR_MeowAmmo from the game's copy of Add Ammo to Battle Scene (MeowSAMMO::ITEM, ICON,
// ITEM_2, ICON_2 … as the script's refresh draws them: the first five).

function extract({ constants = {} } = {}) {
    const ammo = [];
    for (const suffix of ['', '_2', '_3', '_4', '_5']) {
        const item = constants['MeowSAMMO::ITEM' + suffix], icon = constants['MeowSAMMO::ICON' + suffix];
        if (typeof item === 'number') ammo.push([item, typeof icon === 'number' ? icon : 0]);
    }
    return { ammo: JSON.stringify(ammo) };
}

module.exports = { extract };
