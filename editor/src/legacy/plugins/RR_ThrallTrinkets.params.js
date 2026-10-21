'use strict';
// Plugin parameters for RR_ThrallTrinkets from the game's copy of the Trinket Interface (STRAK::CABINET):
// its TRINKETS and CHALLENGES tables.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

function constant(text, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /module CABINET\b[\s\S]*TRINKETS\s*=/.test(String(s))) || '';
    const out = {};
    const cabinet = text.slice(Math.max(0, text.search(/module CABINET\b/)));
    const trinkets = constant(cabinet, 'TRINKETS');
    const challenges = constant(cabinet, 'CHALLENGES');
    if (Array.isArray(trinkets)) out.trinkets = JSON.stringify(trinkets);
    if (Array.isArray(challenges)) out.challenges = JSON.stringify(challenges);
    const variable = /draw_icon\((\d+), rect\.x, rect\.y\) if \$game_variables\[(\d+)\] == item\[0\]/.exec(text);
    if (variable) { out.equippedIcon = variable[1]; out.trinketVariable = variable[2]; }
    return out;
}

module.exports = { extract };
