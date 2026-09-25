'use strict';
// Plugin parameters for RR_CscaDifficulty from the game's copy of CSCA Difficulty System
// (CSCA::DIFFICULTY: its texts, MODIFY_HPMP and each DIFFICULTIES[n] = { ... }).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k).replace(/^:/, ''), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["CSCA-Difficulty"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => (constants['CSCA::DIFFICULTY::' + name] === undefined ? d : constants['CSCA::DIFFICULTY::' + name]);
    const difficulties = [];
    for (const m of source.matchAll(/^[ \t]*DIFFICULTIES\[(\d+)\]\s*=\s*/gm)) {
        try { difficulties[Number(m[1])] = plain(readLiteral(source, m.index + m[0].length)[0]); } catch (_) { /* a row it cannot read is left out */ }
    }
    const size = C.fontDefaults(sources, constants).size;
    // A later script that redraws the info panel without ENCRATE ("Hide Encounter Rate") hides that line.
    let showEncounterRate = true;
    for (const s of sources.slice(sources.indexOf(source) + 1)) {
        const m = /class CSCA_Window_DifficultyInfo[\s\S]*?def draw_info[\s\S]*?\n\s*end\s*\n/.exec(s);
        if (m) showEncounterRate = /ENCRATE/.test(m[0]);
    }
    return {
        header: String(k('HEADER', 'Difficulty Selection')),
        encrateText: String(k('ENCRATE', '')), enemyStatsText: String(k('ENEMYSTATS', '')),
        enemyExpText: String(k('ENEMYEXP', '')), enemyGoldText: String(k('ENEMYGOLD', '')),
        modifyHpMp: String(k('MODIFY_HPMP', false) === true),
        difficulties: JSON.stringify(difficulties.filter(Boolean)),
        showEncounterRate: String(showEncounterRate),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract };
