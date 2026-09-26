'use strict';
// Plugin parameters for RR_YanflyBattleCommandList from the game's copy of Battle Command List (module
// YEA::BATTLE_COMMANDS): the party command order, the custom party commands and the default actor commands.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-BattleCommandList"\]\s*=\s*true/.test(s)) || '';
    const out = {};
    const party = literal(source, 'PARTY_COMMANDS');
    if (Array.isArray(party)) out.partyCommands = JSON.stringify(party.map(String));
    const custom = literal(source, 'CUSTOM_PARTY_COMMANDS');
    if (custom instanceof Map) out.customPartyCommands = JSON.stringify(plain(custom));
    const actor = literal(source, 'DEFAULT_ACTOR_COMMANDS');
    if (Array.isArray(actor)) out.defaultActorCommands = JSON.stringify(actor.map(s => String(s).toUpperCase()));
    return out;
}

module.exports = { extract };
