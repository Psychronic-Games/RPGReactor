'use strict';
// Plugin parameters for RR_PinnacleKingdom from the game's Troop module (troop_data, troop_nameflag,
// faction_names) and its Game_Party (fighting members, item limit, leader, name) and Game_Party#remove_actor
// (the commander's armor offset).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

/** The literal a `def self.name` (or `def name`) returns first, or undefined. */
function returned(text, name) {
    const m = new RegExp(`def (?:self\\.)?${name}\\b[^\\n]*\\n\\s*`).exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
const plain = (v) => (v instanceof Map ? Object.fromEntries(Array.from(v, ([k, x]) => [k, plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function extract({ scripts = [] } = {}) {
    const out = {};
    const troop = scripts.find(s => /module Troop\b[\s\S]*def self\.troop_data/.test(s));
    if (troop) {
        const data = returned(troop, 'troop_data');
        if (data instanceof Map) out.troopData = JSON.stringify(plain(data));
        const flags = returned(troop, 'troop_nameflag');
        if (Array.isArray(flags)) out.troopNameflag = JSON.stringify(flags);
        const factions = returned(troop, 'faction_names');
        if (factions instanceof Map) out.factionNames = JSON.stringify(plain(factions));
    }
    const party = scripts.find(s => /class Game_Party < Game_Unit[\s\S]*attr_accessor :daily_income/.test(s));
    if (party) {
        const battle = /def max_battle_members\s*\n\s*return (\d+)/.exec(party);
        if (battle) out.maxBattleMembers = battle[1];
        const items = /def max_item_number\(item\)\s*\n\s*return (\d+)/.exec(party);
        if (items) out.maxItems = items[1];
        const leader = /def leader\s*\n\s*\$game_actors\[(\d+)\]/.exec(party);
        if (leader) out.leaderActor = leader[1];
        const name = /@name = "([^"]*)"/.exec(party);
        if (name) out.partyName = name[1];
        const commander = /lose_item\(\$data_armors\[actor_id\s*\+\s*(\d+)\]/.exec(party);
        if (commander) out.commanderOffset = commander[1];
    }
    return out;
}

module.exports = { extract };
