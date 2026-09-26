'use strict';
// Yanfly's Ace Adjust Limits: the script's gain/lose shorthands in Script commands.
module.exports = {
    key: 'yeaAdjustLimits', detect: /\$imported\["YEA-AdjustLimits"\]\s*=\s*true/, plugin: 'RR_YanflyAdjustLimits',
    event: {
        gain_gold: '$gameParty.gainGold(%0)', lose_gold: '$gameParty.loseGold(%0)',
        gain_item: '$gameParty.gainItem($dataItems[%0], %1)', lose_item: '$gameParty.loseItem($dataItems[%0], %1)',
        gain_weapon: '$gameParty.gainItem($dataWeapons[%0], %1)', lose_weapon: '$gameParty.loseItem($dataWeapons[%0], %1)',
        gain_armor: '$gameParty.gainItem($dataArmors[%0], %1)', lose_armor: '$gameParty.loseItem($dataArmors[%0], %1)',
        gain_armour: '$gameParty.gainItem($dataArmors[%0], %1)', lose_armour: '$gameParty.loseItem($dataArmors[%0], %1)'
    }
};
