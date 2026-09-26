'use strict';
// Hime's Battle Rules: victory and defeat rules in map notes and troop / event comments, no calls from events.
// Their Ruby conditions are translated when the plugin's settings are read (RR_HimeBattleRules.params.js).
module.exports = { key: 'himeBattleRules', detect: /\$imported\["TH_BattleRules"\]\s*=\s*true/, plugin: 'RR_HimeBattleRules' };
