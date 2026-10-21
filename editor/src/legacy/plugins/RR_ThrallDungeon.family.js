'use strict';
// Strak's Procedural Dungeon Generator (Thrall). Events keep the dungeon list on $game_system.dungeon
// ([[map id, x, y], …] — Game_System's attribute, read and set by the floors' common events).
module.exports = {
    key: 'thrallDungeon', detect: /module PDG\b[\s\S]*def create_dungeon\b/, plugin: 'RR_ThrallDungeon',
    members: { 'system.dungeon': ['($._dungeon || ($._dungeon = []))', 'array'] },
    setters: { 'system.dungeon': '$._dungeon = %v' }
};
