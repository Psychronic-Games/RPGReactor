'use strict';
// Plugin parameters for RR_ThrallOverdrive from the game's copy of KGC_OverDrive (module KGC::OverDrive).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return plain(readLiteral(source, m.index + m[0].length)[0]); } catch (_) { return undefined; }
}

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["OverDrive"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => { const v = constants['KGC::OverDrive::' + name]; return v === undefined || v === null ? d : v; };
    const out = {
        gaugeMax: String(Number(k('GAUGE_MAX', 1000)) || 1000),
        gaugeNumber: String(Number(k('DEFAULT_GAUGE_NUMBER', 1)) || 1),
        emptyOnDead: String(k('EMPTY_ON_DEAD', true) !== false),
        hideNotInBattle: String(k('HIDE_GAUGE_NOT_IN_BATTLE', true) !== false),
        hideNoOdSkills: String(k('HIDE_GAUGE_NO_OD_SKILLS', true) !== false),
        notGainHiding: String(k('NOT_GAIN_GAUGE_HIDING', false) === true),
        hideSkillLackOfGauge: String(k('HIDE_SKILL_LACK_OF_GAUGE', true) !== false),
        gaugeName: String(k('GAUGE_NAME', 'Overdrive')),
        valueStyle: String(Number(k('GAUGE_VALUE_STYLE', 2))),
        valueFontSize: String(Number(k('GAUGE_VALUE_FONT_SIZE', 14)) || 14),
        offsetY: String(Number(k('GAUGE_OFFSET_Y', -2)))
    };
    const gain = literal(source, 'GAIN_RATE');
    if (Array.isArray(gain)) out.gainRate = JSON.stringify(gain);
    for (const [key, name] of [['actorDriveType', 'DEFAULT_ACTOR_DRIVE_TYPE'], ['enemyDriveType', 'DEFAULT_ENEMY_DRIVE_TYPE'], ['hideGaugeActor', 'HIDE_GAUGE_ACTOR']]) {
        const v = literal(source, name);
        if (Array.isArray(v)) out[key] = JSON.stringify(v);
    }
    const color = (name) => {
        const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*Color\\.new\\(([^)]*)\\)', 'm').exec(source);
        return m ? JSON.stringify(m[1].split(',').map(x => Number(x.trim()) || 0)) : undefined;
    };
    for (const [key, name] of [['normalColor1', 'GAUGE_NORMAL_START_COLOR'], ['normalColor2', 'GAUGE_NORMAL_END_COLOR'], ['maxColor1', 'GAUGE_MAX_START_COLOR'], ['maxColor2', 'GAUGE_MAX_END_COLOR']]) {
        const c = color(name);
        if (c) out[key] = c;
    }
    const messages = literal(source, 'OD_GAIN_MESSAGE');
    if (messages && typeof messages === 'object') out.messages = JSON.stringify(messages);
    return out;
}

module.exports = { extract };
