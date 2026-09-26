'use strict';
// Plugin parameters for RR_SelcharDurability from the game's copies of Selchar's Weapon Durability
// (TH_Instance::Weapon), Armor Durability (TH_Instance::Armor), Equip Repair Scene (TH_Instance::Scene_Repair)
// and Armthrift, each present or not.

const { setting } = require('./RR_HimeInstanceItems.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
// Ruby truth: only false and nil are false.
const truth = (v) => String(v !== false && v !== null);

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const find = (marker) => sources.find(s => new RegExp('\\$imported\\[:' + marker + '\\]\\s*=\\s*true').test(s)) || '';
    const weapon = find('Sel_Weapon_Durability'), armor = find('Sel_Armor_Durability'), repair = find('Sel_Equip_Dura_Repair');
    const se = setting(repair, 'SE', ['Hammer', 100, 100]);
    const s = Array.isArray(se) ? se : ['Hammer', 100, 100];
    return {
        weapons: String(!!weapon),
        weaponDefault: String(setting(weapon, 'Default_Durability', 100)),
        weaponCost: String(setting(weapon, 'Default_Durability_Cost', 1)),
        weaponDestroy: truth(setting(weapon, 'Destroy_Broken_Weapon', false)),
        weaponSetting: truth(setting(weapon, 'Durability_Setting', true)),
        weaponSuffix: String(setting(weapon, 'Dur_Suf', ' [%s%%]')),
        armors: String(!!armor),
        armorDefault: String(setting(armor, 'Default_Durability', 100)),
        armorDamage: String(setting(armor, 'Default_Durability_Damage', 1)),
        armorRate: String(setting(armor, 'Durability_Reduce_Rate', 1)),
        armorDestroy: truth(setting(armor, 'Destroy_Broken_Armor', true)),
        armorSetting: truth(setting(armor, 'Durability_Setting', false)),
        armorSuffix: String(setting(armor, 'Dur_Suf', ' [%s%%]')),
        repairScene: String(!!repair),
        repairText: String(setting(repair, 'Vocab', 'Repair')),
        cancelText: 'Cancel',   // Vocab::ShopCancel
        noItemText: String(setting(repair, 'No_Selected_Item', 'Select item that needs repairs.')),
        priceText: String(setting(repair, 'Selected_Item', 'Repair Cost: ')),
        fullText: String(setting(repair, 'Can_Not_Repair', 'Max Durability')),
        repairSe: JSON.stringify({ name: String(s[0] ?? ''), volume: Number(s[1] ?? 100), pitch: Number(s[2] ?? 100) }),
        repairPriceMod: String(setting(repair, 'Price_Mod', 1)),
        armthrift: String(!!find('Sel_Wep_Dura_Armthrift'))
    };
}

module.exports = { extract };
