'use strict';
// Plugin parameters for RR_MolegatoQuests from the game's MOLEGATO_QUESTS (its entries, categories and colour)
// and Window_QuestCat#cat_names.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

function constant(text, name) {
    const m = new RegExp(`^[ \\t]*${name}\\s*=\\s*`, 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /module MOLEGATO_QUESTS\b[\s\S]*QUEST_DATA\s*=/.test(s));
    if (!text) return {};
    const out = {};
    const quests = constant(text, 'QUEST_DATA');
    if (Array.isArray(quests)) out.quests = JSON.stringify(quests);
    const categories = constant(text, 'CATEGORIES');
    if (Array.isArray(categories)) out.categories = JSON.stringify(categories);
    const color = constant(text, 'COLOR_ACTIVE');
    if (typeof color === 'number') out.solvedColor = String(color);
    const names = /def cat_names\s*\n\s*(\{[\s\S]*?\})/.exec(text);
    if (names) {
        try {
            const h = readLiteral(names[1], 0)[0];
            if (h instanceof Map) out.categoryNames = JSON.stringify(Object.fromEntries(h));
        } catch (_) { /* left at the default */ }
    }
    return out;
}

module.exports = { extract };
