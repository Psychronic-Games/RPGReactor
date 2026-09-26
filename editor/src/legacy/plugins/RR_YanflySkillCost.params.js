'use strict';
// Plugin parameters for RR_YanflySkillCost from the game's copy of Yanfly's Skill Cost Manager (YEA::SKILL_COST),
// the game's Font.default_size, and the Ruby of its skills' <custom cost requirement>/<custom cost perform> blocks
// translated to JavaScript (read from the game's Data/Skills.rvdata2).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** A constant's literal in one script's source (the first `Name = value` line), or the default. */
function setting(source, name, fallback) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return fallback;
    try { const v = readLiteral(source, m.index + m[0].length)[0]; return v === undefined ? fallback : v; } catch (_) { return fallback; }
}

/** A game's script with =begin … =end blocks (Ruby's block comments) taken out. */
const live = (source) => String(source || '').replace(/^=begin\b[\s\S]*?^=end\b.*$/gm, '');

// Methods a notetag block calls on self (the battler) without a receiver; each becomes a.method.
const SELF = new Set(['actor?', 'enemy?', 'weapons', 'armors', 'equips', 'hp', 'mp', 'tp', 'mhp', 'mmp', 'mtp', 'max_tp', 'level', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk',
    'hit', 'eva', 'cri', 'state?', 'states', 'skills', 'dead?', 'alive?', 'name', 'id', 'actor_id', 'class_id', 'add_state', 'remove_state', 'skill_learn?', 'result',
    'state_turns', 'mcr', 'tcr', 'usable?', 'skill_mp_cost', 'skill_tp_cost', 'skill_hp_cost', 'skill_gold_cost', 'nickname']);

/**
 * Ruby run with a battler as self, rewritten with the battler as `a` (a damage formula's user), so the
 * translator's formula mode reads it: `weapons.size` → `a.weapons.size`, `self.hp` → `a.hp`. Block
 * parameters and locals keep their names.
 */
function battlerRuby(ruby) {
    const src = String(ruby || '');
    const locals = new Set();
    for (const m of src.matchAll(/\|([^|]*)\|/g)) for (const n of m[1].split(',')) locals.add(n.trim());
    for (const m of src.matchAll(/(?:^|[;\s(])([a-z_][A-Za-z0-9_]*)\s*=(?![=~>])/g)) locals.add(m[1]);
    let out = '', i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1;
            out += src.slice(i, j + 1);
            i = j + 1;
            continue;
        }
        const m = /^[A-Za-z_][A-Za-z0-9_]*[?!]?/.exec(src.slice(i));
        if (m && (i === 0 || !/[A-Za-z0-9_]/.test(src[i - 1]))) {
            let word = m[0];
            const prev = src.slice(0, i).replace(/\s+$/, '').slice(-1);
            const after = src.slice(i + word.length);
            // `a ? b : c` reads `a?` as one word only when the name is a predicate method.
            if (word.endsWith('?') && !SELF.has(word) && SELF.has(word.slice(0, -1))) word = word.slice(0, -1);
            const receiverless = !['.', '$', '@', ':'].includes(prev) && !/^:(?!:)/.test(after) && !/^::/.test(after);
            if (word === 'self' && receiverless) out += 'a';
            else if (receiverless && SELF.has(word) && !locals.has(word)) out += 'a.' + word;
            else out += word;
            i += word.length;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

/** Ruby with the battler as self, as JavaScript run with the battler as `a`, or null when it cannot be translated. */
function translate(ruby, constants = {}) {
    if (!String(ruby || '').trim()) return '';
    let js = null;
    try { js = C.ruby(battlerRuby(ruby), 'formula', { constants, families: new Set(['yanflySkillCost']) }); } catch (_) { js = null; }
    return js === undefined ? null : js;
}

/**
 * A notetag block's lines joined into one (the scripts join them with nothing between), as the script reads
 * the note: line by line, a line matching any of `others` (another of the script's tags) left out.
 */
function noteBlock(note, open, close, others = []) {
    let on = false, body = '', found = false;
    for (const line of String(note || '').split(/[\r\n]+/)) {
        if (open.test(line)) { on = true; found = true; continue; }
        if (close.test(line)) { on = false; found = true; continue; }
        if (others.some(re => re.test(line))) continue;
        if (on) body += line;
    }
    return found ? body : null;
}

/** The game's records of one database file (Skills, Items …) from its Data folder, or []. */
function aceRecords(read, name) {
    try {
        const bytes = read && read(`Data/${name}.rvdata2`);
        if (!bytes) return [];
        const list = require('../RubyMarshal.js').load(bytes);
        return Array.isArray(list) ? list.filter(o => o && typeof o === 'object') : [];
    } catch (_) { return []; }
}

// The Skill Cost Manager's skill tags (a line with any of them is not part of a Ruby block).
const TAGS = [/<(?:MP_COST|mp cost):[ ](\d+)>/i, /<(?:MP_COST|mp cost):[ ](\d+)([%％])>/i, /<(?:TP_COST|tp cost):[ ](\d+)>/i, /<(?:TP_COST|tp cost):[ ](\d+)([%％])>/i,
    /<(?:HP_COST|hp cost):[ ](\d+)>/i, /<(?:HP_COST|hp cost):[ ](\d+)([%％])>/i, /<(?:GOLD_COST|gold cost):[ ](\d+)>/i, /<(?:GOLD_COST|gold cost):[ ](\d+)([%％])>/i,
    /<(?:HP_COST_MIN|hp cost min):[ ](\d+)>/i, /<(?:HP_COST_MIN|hp cost max):[ ](\d+)>/i, /<(?:MP_COST_MIN|mp cost min):[ ](\d+)>/i, /<(?:MP_COST_MIN|mp cost max):[ ](\d+)>/i,
    /<(?:TP_COST_MIN|tp cost min):[ ](\d+)>/i, /<(?:TP_COST_MIN|tp cost max):[ ](\d+)>/i, /<(?:GOLD_COST_MIN|gold cost min):[ ](\d+)>/i, /<(?:GOLD_COST_MIN|gold cost max):[ ](\d+)>/i,
    /<(?:CUSTOM_COST|custom cost):[ ](.*)>/i, /<(?:CUSTOM_COST_COLOUR|custom cost colour|custom cost color):[ ](\d+)>/i, /<(?:CUSTOM_COST_SIZE|custom cost size):[ ](\d+)>/i,
    /<(?:CUSTOM_COST_ICON|custom cost icon):[ ](\d+)>/i];
const REQ_ON = /<(?:CUSTOM_COST_REQUIREMENT|custom cost requirement)>/i, REQ_OFF = /<\/(?:CUSTOM_COST_REQUIREMENT|custom cost requirement)>/i;
const PER_ON = /<(?:CUSTOM_COST_PERFORM|custom cost perform)>/i, PER_OFF = /<\/(?:CUSTOM_COST_PERFORM|custom cost perform)>/i;

/**
 * Each skill's custom cost blocks: { id: { requirement, perform } } as JavaScript, with the Ruby kept beside
 * any block that could not be translated ({ requirementRuby } / { performRuby }).
 */
function customCosts(skills, constants = {}) {
    const out = {};
    for (const skill of skills) {
        const note = String(skill.note || '');
        if (!REQ_ON.test(note) && !REQ_OFF.test(note) && !PER_ON.test(note) && !PER_OFF.test(note)) continue;
        // Both blocks are read in one pass: a requirement line inside a perform block is part of both, as in the script.
        const entry = {};
        const req = noteBlock(note, REQ_ON, REQ_OFF, [...TAGS, PER_ON, PER_OFF]) || '';
        const per = noteBlock(note, PER_ON, PER_OFF, [...TAGS, REQ_ON, REQ_OFF]) || '';
        const r = translate(req, constants), p = translate(per, constants);
        entry.requirement = r;
        entry.perform = p;
        if (r === null) entry.requirementRuby = req;
        if (p === null) entry.performRuby = per;
        out[skill.id] = entry;
    }
    return out;
}

function extract({ scripts = [], constants = {}, read } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-SkillCostManager"\]\s*=\s*true/.test(s)) || '';
    const get = (name, d) => setting(source, name, d);
    const size = C.fontDefaults(sources, constants).size;
    const kind = (k, colour, fontSize, suffix) => ({
        colour: String(get(k + '_COST_COLOUR', colour)), size: String(get(k + '_COST_SIZE', fontSize)),
        suffix: String(get(k + '_COST_SUFFIX', suffix)), icon: String(get(k + '_COST_ICON', 0))
    });
    const hp = kind('HP', 21, 20, '%sHP'), mp = kind('MP', 23, 20, '%sMP'), tp = kind('TP', 2, 20, '%sTP'), gold = kind('GOLD', 6, 20, '%sGOLD');
    return {
        hpColour: hp.colour, hpSize: hp.size, hpSuffix: hp.suffix, hpIcon: hp.icon,
        mpColour: mp.colour, mpSize: mp.size, mpSuffix: mp.suffix, mpIcon: mp.icon,
        tpColour: tp.colour, tpSize: tp.size, tpSuffix: tp.suffix, tpIcon: tp.icon,
        goldColour: gold.colour, goldSize: gold.size, goldSuffix: gold.suffix, goldIcon: gold.icon,
        // With Yanfly's Battle Engine the TP cost is drawn after (left of) the MP cost, without it before.
        tpAfterMp: String(sources.some(s => /\$imported\["YEA-BattleEngine"\]\s*=\s*true/.test(live(s)))),
        doppelganger: String(sources.some(s => /\$imported\["YEA-Doppelganger"\]\s*=\s*true/.test(live(s)))),
        coreEngine: String(sources.some(s => /\$imported\["YEA-CoreEngine"\]\s*=\s*true/.test(live(s)))),
        rgssFontSize: String(typeof size === 'number' ? size : 24),
        customCosts: JSON.stringify(customCosts(aceRecords(read, 'Skills'), constants))
    };
}

module.exports = { extract, setting, live, battlerRuby, translate, noteBlock, aceRecords, customCosts };
