'use strict';
// Plugin parameters for RR_SelcharEquipLevels from the game's copies of Selchar's Equipment Levelling
// (TH_Instance::Equip, Selchar::Param) and Equip Upgrade (TH_Instance::Scene_EquipUpgrade).

const { setting } = require('./RR_HimeInstanceItems.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
// Ruby truth: only false and nil are false.
const truth = (v) => String(v !== false && v !== null);

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const base = sources.find(s => /\$imported\[:Sel_Equip_Leveling_Base\]\s*=\s*true/.test(s)) || '';
    const scene = sources.find(s => /\$imported\[:Sel_Equip_Upgrade_Scene1\]\s*=\s*true/.test(s)) || '';
    const se = setting(scene, 'SE', ['Hammer', 100, 100]);
    const s = Array.isArray(se) ? se : ['Hammer', 100, 100];
    const names = setting(base, 'Param', null);
    const list = setting(scene, 'Window_Params', null);
    return {
        maxLevel: String(setting(base, 'Default_Max_Level', 100)),
        levelFormat: String(setting(base, 'Level_Prefix', ' [+%s]')),
        multBonus: String(setting(base, 'Default_Mult_Bonus', 1.5)),
        multPrice: String(setting(base, 'Default_Mult_Price', 2)),
        canLevel: truth(setting(base, 'Default_Can_Level', true)),
        paramNames: JSON.stringify(Array.isArray(names) ? names.map(String) : ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'mtp']),
        upgradeScene: String(!!scene),
        upgradeText: String(setting(scene, 'Vocab', 'Upgrade')),
        cancelText: 'Cancel',   // Vocab::ShopCancel
        noItemText: String(setting(scene, 'No_Selected_Item', 'Select an item you wish to upgrade')),
        priceText: String(setting(scene, 'Selected_Item', 'Upgrade Price: ')),
        maxText: String(setting(scene, 'Can_Not_Upgrade', 'Max Upgrade')),
        se: JSON.stringify({ name: String(s[0] ?? ''), volume: Number(s[1] ?? 100), pitch: Number(s[2] ?? 100) }),
        priceMod: String(setting(scene, 'Price_Mod', 0.5)),
        windowParams: JSON.stringify(Array.isArray(list) ? list.map(Number) : [0, 1, 2, 3, 4, 5, 6, 7])
    };
}

module.exports = { extract };
