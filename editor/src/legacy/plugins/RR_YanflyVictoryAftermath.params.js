'use strict';
// Plugin parameters for RR_YanflyVictoryAftermath from the game's copy of Yanfly's Victory Aftermath (module
// YEA::VICTORY_AFTERMATH): sounds, switches, texts, gauge settings and the default quotes (with Yami's
// Equipment Learning quotes merged in when the game carries it), and the game's Font.default_size.
// A setting the copy lacks falls back to Dreamwalker's value.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const DETECT = /\$imported\["YEA-VictoryAftermath"\]\s*=\s*true/;
const EQUIP_LEARNING = /\$imported\["YES-EquipmentLearning"\]\s*=\s*true/;

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

/** NAME = RPG::BGM.new("name", volume, pitch) as { name, volume, pitch }, or the fallback. */
function audio(source, name, fallback) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*RPG::(?:BGM|SE|ME)\\.new\\(\\s*(["\'])(.*?)\\1\\s*(?:,\\s*(\\d+))?\\s*(?:,\\s*(\\d+))?', 'm').exec(source);
    if (!m) return fallback;
    return { name: m[2], volume: m[3] === undefined ? 100 : Number(m[3]), pitch: m[4] === undefined ? 100 : Number(m[4]) };
}

// Message text codes: ESC (Ruby "\e") back to the backslash the message window reads.
const codes = (s) => String(s).replace(/\x1b/g, '\\');
const quoteList = (v, d) => (Array.isArray(v) ? v.map(q => codes(q)) : d);

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => DETECT.test(s)) || '';
    const get = (name, d) => { const v = literal(source, name); return v === undefined || v === null ? d : v; };
    const n = (name, d) => { const v = Number(get(name, d)); return String(Number.isFinite(v) ? v : d); };
    const s = (name, d) => codes(get(name, d));
    const quotes = get('VICTORY_QUOTES', null);
    const q = (key, d) => quoteList(quotes instanceof Map ? quotes.get(key) : undefined, d);
    const table = { win: q('win', ['Victory...']), level: q('level', ['Level Up!']), drops: q('drops', ['The enemy dropped something...']) };
    // Equipment Learning merges its :el_learn quotes into the table when Victory Aftermath is in the game.
    const el = sources.find(x => EQUIP_LEARNING.test(x));
    if (el) {
        const extra = literal(el, 'VICTORY_AFTERMATH_QUOTES');
        table.el_learn = quoteList(extra instanceof Map ? extra.get('el_learn') : undefined, ['']);
    }
    // Font.default_size = 18, or = SOME::CONSTANT; RGSS3's own default is 24.
    let fontSize = 24;
    for (const x of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(x);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : constants[m[1]];
        if (typeof v === 'number' && v > 0) fontSize = v;
    }
    return {
        victoryBgm: JSON.stringify(audio(source, 'VICTORY_BGM', { name: '', volume: 100, pitch: 100 })),
        victoryTick: JSON.stringify(audio(source, 'VICTORY_TICK', { name: '', volume: 100, pitch: 100 })),
        levelSound: JSON.stringify(audio(source, 'LEVEL_SOUND', { name: '', volume: 100, pitch: 100 })),
        skillsText: s('SKILLS_TEXT', 'New Skills'),
        skipAftermathSwitch: n('SKIP_AFTERMATH_SWITCH', 0),
        skipMusicSwitch: n('SKIP_MUSIC_SWITCH', 0),
        commonEvent: n('AFTERMATH_COMMON_EVENT', 0),
        topTeam: s('TOP_TEAM', "%s's party"),
        topVictory: s('TOP_VICTORY_TEXT', '%s is victorious'),
        topLevelUp: s('TOP_LEVEL_UP', '%s has leveled up'),
        topSpoils: s('TOP_SPOILS', 'Loot'),
        victoryExp: s('VICTORY_EXP', '+%s EXP'),
        expPercent: s('EXP_PERCENT', '%1.2f%%'),
        levelUpText: s('LEVELUP_TEXT', 'LEVEL UP!'),
        maxLevelText: s('MAX_LVL_TEXT', 'MAX LEVEL'),
        fontSizeExp: n('FONTSIZE_EXP', 18),
        expTicks: n('EXP_TICKS', 15),
        expGauge1: n('EXP_GAUGE1', 26),
        expGauge2: n('EXP_GAUGE2', 27),
        levelGauge1: n('LEVEL_GAUGE1', 13),
        levelGauge2: n('LEVEL_GAUGE2', 5),
        headerText: s('HEADER_TEXT', '\\>\\C[6]%s\\C[0]\\<\n'),
        footerText: s('FOOTER_TEXT', ''),
        quotes: JSON.stringify(table),
        rgssFontSize: String(fontSize)
    };
}

module.exports = { extract };
