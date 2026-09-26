'use strict';
// The enemy turn count fix: no calls, the plugin moves where the troop's turn count goes up.
module.exports = { key: 'enemyTurnCountFix', detect: /def self\.input_start\s*\n\s*if @phase != :input\s*\n\s*@phase = :input\s*\n\s*\$game_troop\.increase_turn/, plugin: 'RR_EnemyTurnCountFix' };
