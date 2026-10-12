'use strict';
// Thrall's loot: Module_Loot's tables, the loot generator Thrall wrote into Game_Temp
// ($game_temp.generate_loot(iterations, rates, levels, type)) and Strak's Loot Table, the scene events open with
// $scene = Scene_LootTable.new after a chest, a shop or a battle.
module.exports = {
    key: 'thrallLoot', detect: /module LOOT\b[\s\S]*UNIQUE_WEAPONS\s*=/, plugin: 'RR_ThrallLoot',
    members: {
        'temp.generate_loot': ['($.rrGenerateLoot?.(%*) ?? [])', 'array'],
        'temp.in_battle': ['$gameParty.inBattle()', 'bool'],
        'party.party_has_item?': ['($.rrPartyHasItem?.(%*) ?? false)', 'bool']
    },
    scenes: { Scene_LootTable: '(typeof Scene_RRThrallLootTable === "function" && SceneManager.push(Scene_RRThrallLootTable))' },
    classes: { Scene_LootTable: 'Scene_RRThrallLootTable' }
};
