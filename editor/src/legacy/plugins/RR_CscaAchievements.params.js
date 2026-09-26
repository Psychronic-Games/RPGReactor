'use strict';
// Plugin parameters for RR_CscaAchievements from the game's copy of CSCA Achievements (module
// CSCA::ACHIEVEMENTS: DESCRIPTION[n], PROGRESS[n], REWARD[n] and ACHIEVEMENT[n] = { … } naming them, and the
// misc. settings) and CSCA Extra Stats' variable IDs, which the :loot … :isell progress types read.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

// PROGRESS and REWARD are reassigned to strings further down the module, so the tables are read from the
// setup text as the ACHIEVEMENT hashes saw them, and the strings from the last assignment.
function read(source) {
    const tables = {};
    for (const m of source.matchAll(/^[ \t]*(DESCRIPTION|PROGRESS|REWARD)\[(\d+)\]\s*=\s*/gm)) {
        try {
            const [, end] = readLiteral(source, m.index + m[0].length);
            tables[`${m[1]}[${m[2]}]`] = source.slice(m.index + m[0].length, end);
        } catch (_) { /* unreadable: the reference reads as nil */ }
    }
    const list = [];
    for (const m of source.matchAll(/^[ \t]*ACHIEVEMENT\[(\d+)\]\s*=\s*/gm)) {
        const start = m.index + m[0].length;
        let depth = 0, end = start;
        for (; end < source.length; end++) {
            if (source[end] === '{') depth++;
            else if (source[end] === '}' && --depth === 0) { end++; break; }
        }
        const body = source.slice(start, end).replace(/\b(DESCRIPTION|PROGRESS|REWARD)\[(\d+)\]/g, (ref) => tables[ref] || 'nil');
        try { list[Number(m[1])] = plain(readLiteral(body, 0)[0]); } catch (_) { /* an achievement it cannot read is left out */ }
    }
    return list.filter(Boolean);
}

const lines = (v) => (v === null || v === undefined ? null : (Array.isArray(v) ? v : [v]).map(String));

function achievements(source) {
    return read(source).map(a => {
        const p = Array.isArray(a.progress) ? a.progress : null;
        const r = Array.isArray(a.reward) ? a.reward : null;
        return {
            symbol: String(a.symbol ?? ''), name: String(a.name ?? ''),
            nameBeforeUnlock: a.name_before_unlock === null || a.name_before_unlock === undefined ? null : String(a.name_before_unlock),
            description: lines(a.description) || [], descriptionBeforeUnlock: lines(a.description_before_unlock),
            progress: p ? { id: Array.isArray(p[0]) ? p[0].map(String) : p[0], upper: Number(p[1]) || 0, description: String(p[2] ?? ''), type: String(p[3] ?? '') } : null,
            reward: r ? { amount: Number(r[0]) || 0, id: r[1], type: String(r[2] ?? '') } : null,
            graphic: a.graphic ? String(a.graphic) : '', points: Number(a.points) || 0,
            completeIcon: Number(a.complete_icon) || 0, incompleteIcon: Number(a.incomplete_icon) || 0
        };
    });
}

// The last NAME = "string" or NAME = value in the source (Ruby keeps the last assignment).
function last(source, name) {
    let found;
    for (const m of source.matchAll(new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'gm'))) {
        try { found = readLiteral(source, m.index + m[0].length)[0]; } catch (_) { /* not a literal */ }
    }
    return found;
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["CSCA-Achievements"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => { const v = last(source, name); return v === undefined ? d : v; };
    const s = (name, d) => { const v = k(name, d); return typeof v === 'string' ? v : d; };
    const es = (name) => Number(constants['CSCA_EXTRA_STATS::' + name]) || 0;
    const align = k('POP_ALIGN', 'middle');
    const size = C.fontDefaults(sources, constants).size;
    return {
        achievements: JSON.stringify(achievements(source)),
        header: s('HEADER', 'Achievements'), totalText: s('TOTAL', 'Total Achievements Unlocked: '), pointsText: s('POINTS', 'Score: '),
        progressText: s('PROGRESS', 'Progress:'), rewardText: s('REWARD', 'Reward: '), unlockedText: s('UNLOCKED', 'Achievement Unlocked!'),
        usePoints: String(k('USE_POINTS', true) === true), numbered: String(k('NUMBERED', false) === true),
        center: String(k('CENTER', false) === true), stopTrack: String(k('STOP_TRACK', true) === true),
        color1: String(Number(k('COLOR1', 26)) || 0), color2: String(Number(k('COLOR2', 27)) || 0),
        sound: typeof k('SOUND', null) === 'string' ? k('SOUND', null) : '',
        popAlign: align === null ? '' : String(align),
        extraStats: JSON.stringify({ loot: es('LOOTED'), dtake: es('DAMAGE_TAKEN'), ddeal: es('DAMAGE_DEALT'), gspend: es('GOLDSPENT'), gearn: es('GOLDGAINED'), iuse: es('ITEMS_USED'), ibuy: es('ITEMSBOUGHT'), isell: es('ITEMSSOLD') }),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract, achievements };
