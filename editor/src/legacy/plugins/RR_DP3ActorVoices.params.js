'use strict';
// Plugin parameters for RR_DP3ActorVoices from the game's copy of DiamondandPlatinum3's Actor Voices in Battle
// (module DiamondandPlatinum3::BattleVoices: the folder, switch, states, frequency, multiple hits and voice hashes).

const { voiceSettings } = require('./RR_DP3EnemyVoices.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

const TABLES = ['TOO_MANY_ENEMIES', 'PARTY_NEEDS_HEALING', 'VERY_WEAK_ENEMIES', 'WEAK_ENEMIES', 'EQUAL_ENEMIES', 'STRONG_ENEMIES',
    'VERY_STRONG_ENEMIES', 'USING_ITEMS', 'USING_SKILLS', 'ACTOR_ATTACKING', 'MISSED_ENEMY', 'DODGED_ENEMY', 'LITTLE_DAMAGE',
    'SIGNIFICANT_DAMAGE', 'HEAVY_DAMAGE', 'MASSIVE_DAMAGE', 'DEFAULT_DAMAGE', 'HP_MP_RESTORE', 'DEATH_VOICE', 'REVIVED_VOICE',
    'ESCAPE_ATTEMPT_VOICE', 'SUCCESSFUL_ESCAPE', 'FAILED_ESCAPE', 'THAT_WAS_TOUGH', 'THAT_WAS_EASY', 'BATTLE_TOOK_AGES',
    'LEVELUP_VICTORY', 'NORMAL_VICTORY'];

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module BattleVoices\b/.test(s)) || '';
    return voiceSettings(source, TABLES);
}

module.exports = { extract };
