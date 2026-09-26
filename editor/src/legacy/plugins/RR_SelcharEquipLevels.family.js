'use strict';
// Selchar's Equipment Levelling and Equip Upgrade: an equip's level methods, and the upgrade scene called by class.

module.exports = {
    key: 'selcharEquipLevels', detect: /\$imported\[:Sel_Equip_Leveling_Base\]\s*=\s*true/, plugin: 'RR_SelcharEquipLevels',
    objects: {
        record: {
            level: '(window.RRSelcharLevels?.level($) ?? 1)',
            level_up: 'window.RRSelcharLevels?.levelUp($)',
            level_down: 'window.RRSelcharLevels?.levelDown($)',
            can_level: '(window.RRSelcharLevels?.canLevel($) ?? false)',
            max_level: '(window.RRSelcharLevels?.maxLevel($) ?? 1)',
            level_upgrade_price: '(window.RRSelcharLevels?.upgradePrice($) ?? 0)'
        }
    },
    classes: { Scene_EquipUpgrade: 'Scene_RREquipUpgrade' }
};
