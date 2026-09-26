'use strict';
// Selchar's Weapon and Armor Durability (with Equip Repair Scene and Armthrift, which the port carries): a piece's
// durability methods, and the repair scene called by class.

module.exports = {
    key: 'selcharDurability', detect: /\$imported\[:Sel_(Weapon|Armor)_Durability\]\s*=\s*true/, plugin: 'RR_SelcharDurability',
    objects: {
        record: {
            durability: '$.durability',
            max_durability: '(window.RRSelcharDurability?.maxDurability($) ?? 0)',
            use_durability: '(window.RRSelcharDurability?.useDurability($) ?? false)',
            repair: 'window.RRSelcharDurability?.repair($)',
            'can_repair?': '(window.RRSelcharDurability?.canRepair($) ?? false)',
            repair_price: '(window.RRSelcharDurability?.repairPrice($) ?? 0)'
        }
    },
    classes: { Scene_RepairEquip: 'Scene_RRRepairEquip' }
};
