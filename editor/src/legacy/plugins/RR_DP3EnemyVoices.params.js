'use strict';
// Plugin parameters for RR_DP3EnemyVoices from the game's copy of DiamondandPlatinum3's Enemy Voices in Battle
// (module DiamondandPlatinum3::EnemyBattleVoices: the folder, switch, states, frequency and the voice hashes).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** The Ruby literal after `NAME =` at a line start or after `;` (the scripts chain hashes as `}; NAME = {`). */
function literal(source, name) {
    const at = new RegExp('(?:^|;)[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!at) return undefined;
    try { return readLiteral(source, at.index + at[0].length)[0]; } catch (_) { return undefined; }
}
/** A hash as a plain object (symbol keys by name), its arrays as they are. */
const plain = (v) => (v instanceof Map ? Object.fromEntries(Array.from(v, ([k, x]) => [String(k), plain(x)])) : v);

/** The settings the two voice scripts share, and their voice hashes as one JSON object. */
function voiceSettings(source, tables) {
    const k = (name, d) => { const v = literal(source, name); return v === undefined ? d : v; };
    const truthy = (v) => v !== false && v !== null;
    const ids = (v) => JSON.stringify(Array.isArray(v) ? v.filter(Number.isInteger) : []);
    const voices = {};
    for (const name of tables) { const v = literal(source, name); if (v instanceof Map) voices[name] = plain(v); }
    return {
        folder: String(k('FOLDER_DIRECTORY_NAME', '') ?? ''),
        switchId: String(Number(k('EVENT_SWITCH_ID', 0)) || 0),
        silenceStates: ids(k('SILENCE_STATES', [])),
        skillsWithoutVoice: ids(k('SKILLS_NOT_TO_PLAY_VOICE_FOR', [])),
        frequency: String(Number(k('VOICE_FREQUENCY', 100))),
        multipleHits: String(truthy(k('PLAY_MULTIPLE_VOICES_FOR_MULTIPLE_HITS', true))),
        voices: JSON.stringify(voices)
    };
}

const TABLES = ['ENEMY_ATTACKING', 'USING_SKILLS', 'MISSED_ACTOR_TARGET', 'DODGED_ACTOR_ATTACK', 'LITTLE_DAMAGE', 'SIGNIFICANT_DAMAGE',
    'HEAVY_DAMAGE', 'MASSIVE_DAMAGE', 'DEFAULT_DAMAGE', 'HP_MP_RESTORE', 'DEATH_VOICE'];

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module EnemyBattleVoices\b/.test(s)) || '';
    const out = voiceSettings(source, TABLES);
    delete out.multipleHits;
    return out;
}

module.exports = { extract, voiceSettings };
