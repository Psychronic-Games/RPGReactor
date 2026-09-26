'use strict';
// Yanfly's Ace Battle Engine: the plugin runs the battle screen; events may choose the battle system.
module.exports = {
    key: 'yeaBattleEngine', detect: /\$imported\["YEA-BattleEngine"\]\s*=\s*true/, plugin: 'RR_YanflyBattleEngine',
    objects: { system: { set_battle_system: '$.rrSetBattleSystem?.(%0)', battle_system: '$.rrBattleSystem?.()' } },
    modules: { BattleManager: { 'btype?': ['!!BattleManager.rrBtype?.(%0)', 'bool'] } }
};
