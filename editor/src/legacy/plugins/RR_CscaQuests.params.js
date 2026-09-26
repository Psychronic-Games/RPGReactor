'use strict';
// The game's CSCA quests (module CSCA::QUESTS: DESCRIPTION[n], STEP[n], REWARD[n] and QUEST[n] = { … } naming
// them), read once for two uses: Reactor quest records (records) and RR_CscaQuests' rules (extract).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function read(scripts) {
    const source = scripts.map(text).find(s => /module QUESTS\b/.test(s) && /class CSCA_Quest\b/.test(s)) || '';
    // Each TABLE[n] = literal, kept as source text so QUEST[n] can have its references put in.
    const tables = {};
    for (const m of source.matchAll(/^[ \t]*(DESCRIPTION|STEP|REWARD)\[(\d+)\]\s*=\s*/gm)) {
        try {
            const [, end] = readLiteral(source, m.index + m[0].length);
            tables[`${m[1]}[${m[2]}]`] = source.slice(m.index + m[0].length, end);
        } catch (_) { /* unreadable: the reference reads as nil */ }
    }
    const quests = [];
    for (const m of source.matchAll(/^[ \t]*QUEST\[(\d+)\]\s*=\s*/gm)) {
        const start = m.index + m[0].length;
        let depth = 0, end = start;
        for (; end < source.length; end++) {
            if (source[end] === '{') depth++;
            else if (source[end] === '}' && --depth === 0) { end++; break; }
        }
        const body = source.slice(start, end).replace(/\b(DESCRIPTION|STEP|REWARD)\[(\d+)\]/g, (ref) => tables[ref] || 'nil');
        try { quests[Number(m[1])] = plain(readLiteral(body, 0)[0]); } catch (_) { /* a quest it cannot read is left out */ }
    }
    return quests.filter(Boolean);
}

// [amount, id, type]; a :string reward's id is its text, and it is never paid out.
const rewardList = (q) => (Array.isArray(q.rewards) ? q.rewards : []).filter(Array.isArray).map(r => ({ amount: r[2] === 'string' ? String(r[0] ?? '') : Number(r[0]) || 0, id: r[2] === 'string' ? String(r[1] ?? '') : Number(r[1]) || 0, type: String(r[2] || '') }));

/** Reactor quest records, one per CSCA quest. */
function records(scripts, constants = {}, db = {}) {
    const currency = String(constants['CSCA::QUESTS::CURRENCY_NAME'] ?? constants.CURRENCY_NAME ?? 'Gold');
    const name = (type, id) => { const t = { item: db.items, weapon: db.weapons, armor: db.armors }[type]; return (t && t[id] && t[id].name) || `${type} ${id}`; };
    return read(scripts).map(q => ({
        key: String(q.symbol || ''), name: String(q.name || q.symbol || ''), category: String(q.difficulty || ''),
        from: String(q.questgiver || ''), location: String(q.location || ''),
        description: (Array.isArray(q.description) ? q.description : [q.description || '']).join('\n'),
        // Steps show as the quest reaches them, as the CSCA objective history did.
        objectives: (Array.isArray(q.steps) ? q.steps : []).map(t => ({ text: String(t), hidden: true })),
        rewards: rewardList(q).map(r => (r.type === 'string' ? `${r.id} ${r.amount}` : r.type === 'gold' ? `${r.amount} ${currency}` : r.type === 'exp' ? `${r.amount} EXP` : `${name(r.type, r.id)} ×${r.amount}`))
    }));
}

function extract({ scripts = [], constants = {} } = {}) {
    const k = (n, d) => (constants['CSCA::QUESTS::' + n] === undefined ? d : constants['CSCA::QUESTS::' + n]);
    const quests = read(scripts).map(q => ({ key: String(q.symbol || ''), steps: Array.isArray(q.steps) ? q.steps.length : 0, autoEarn: q.auto_earn_reward === true, rewards: rewardList(q).filter(r => r.type !== 'string') }));
    return { quests: JSON.stringify(quests), showLevelUp: String(k('SHOW_LEVELUP', true) !== false) };
}

module.exports = { extract, records };
