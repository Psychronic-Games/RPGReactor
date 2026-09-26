'use strict';
// Plugin parameters for RR_HimeBattleRules from the game's copy of Hime's Battle Rules (TH::Battle_Rules
// Default_Victory_Rules / Default_Defeat_Rules) and every rule condition in the game's map notes, troop page
// comments and map event page comments, translated from Ruby to JavaScript here, at import (null when not).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const RULE = /<(victory|defeat) rule: (\w+)>(.*?)<\/\1 rule>/gis;

/** The cond: value of each rule in a text, split as the script splits it (at every colon, the name first on the line). */
function ruleConditions(source) {
    const out = [];
    for (const m of String(source || '').matchAll(RULE)) {
        let condition = 'true';
        for (const tag of m[3].trim().split(/\r?\n/)) {
            const [name, value] = tag.split(':');
            if (name && name.toLowerCase() === 'cond') condition = value;
        }
        out.push(String(condition ?? ''));
    }
    return out;
}

/** The comment texts of an event command list (each 108 with its 408 lines). */
function comments(list) {
    const out = [];
    let comment = '';
    for (const cmd of list || []) {
        if (!cmd) continue;
        if (cmd.code === 108) { if (comment) out.push(comment); comment = String(cmd.parameters[0]); }
        else if (cmd.code === 408) comment += '\r\n' + cmd.parameters[0];
    }
    out.push(comment);
    return out;
}

/** Every rule condition in the game's data files (map notes, troop pages, map event pages). */
function gameConditions(read) {
    const M = require('../RubyMarshal.js');
    const load = (name) => { try { const b = read(name); return b ? M.load(b) : null; } catch (_) { return null; } };
    const out = [];
    const pages = (list) => { for (const c of comments(list)) out.push(...ruleConditions(c)); };
    for (const troop of load('Data/Troops.rvdata2') || []) for (const page of (troop && troop.pages) || []) pages(page.list);
    const infos = load('Data/MapInfos.rvdata2') || {};
    for (const id of infos instanceof Map ? infos.keys() : Object.keys(infos)) {
        const map = load(`Data/Map${String(id).padStart(3, '0')}.rvdata2`);
        if (!map) continue;
        out.push(...ruleConditions(map.note));
        const events = map.events instanceof Map ? Array.from(map.events.values()) : Object.values(map.events || {});
        for (const event of events) for (const page of (event && event.pages) || []) pages(page.list);
    }
    return out;
}

function extract({ scripts = [], constants = {}, read = () => null } = {}) {
    const texts = scripts.map(text);
    const source = texts.find(s => /\$imported\["TH_BattleRules"\]\s*=\s*true/.test(s)) || '';
    const rules = (name, d) => {
        const at = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
        let v = null;
        if (at) { try { v = readLiteral(source, at.index + at[0].length)[0]; } catch (_) { v = null; } }
        return v instanceof Map ? Array.from(v, ([c, desc]) => [String(c), String(desc ?? '')]) : d;
    };
    const victory = rules('Default_Victory_Rules', [['$game_troop.all_dead?', 'All enemies defeated']]);
    const defeat = rules('Default_Defeat_Rules', [['$game_party.all_dead?', 'All allies defeated']]);
    const C = require('../RgssConvert.js');
    const families = C.scriptFamilies(texts);
    const conditions = {};
    for (const raw of [...victory.map(r => r[0]), ...defeat.map(r => r[0]), ...gameConditions(read)]) {
        const cond = raw.trim();
        if (!cond || Object.prototype.hasOwnProperty.call(conditions, cond)) continue;
        let js = null;
        try { js = C.ruby(cond, 'expression', { constants, families }); } catch (_) { js = null; }
        conditions[cond] = js === undefined ? null : js;
    }
    return { defaultVictory: JSON.stringify(victory), defaultDefeat: JSON.stringify(defeat), conditions: JSON.stringify(conditions) };
}

module.exports = { extract, ruleConditions, comments };
