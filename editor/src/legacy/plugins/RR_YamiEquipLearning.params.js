'use strict';
// Plugin parameters for RR_YamiEquipLearning from the game's copy of Yami's Equipment Learning
// (YES::EQUIPMENT_LEARNING), and whether the game carried Victory Aftermath and the Ace Equip Engine.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** NAME = <literal> at the start of a line, or undefined. */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YES-EquipmentLearning"\]\s*=\s*true/.test(s)) || '';
    const get = (name, d) => { const v = literal(source, name); return v === undefined || v === null ? d : v; };
    const n = (name, d) => { const v = Number(get(name, d)); return String(Number.isFinite(v) ? v : d); };
    const colours = get('COLOR_GAUGE', null);
    const colour = (key, d) => (colours instanceof Map && colours.has(key) ? String(Number(colours.get(key)) || 0) : String(d));
    // Ruby truth: only false and nil are false.
    const truth = (v) => String(v !== false && v !== null && v !== undefined);
    return {
        vocab: String(get('VOCAB', ' Equip EXP')),
        learnTitle: String(get('LEARN_TITLE', 'Equip Skills')),
        gaugeColor1: colour('color1', 9),
        gaugeColor2: colour('color2', 1),
        enableWindow: truth(get('ENABLE_WINDOW', true)),
        enemyKill: n('ENEMY_KILL', 1),
        levelUp: n('LEVEL_UP', 5),
        requireAp: n('REQUIRE_AP', 100),
        victoryMessage: String(get('VICTORY_MESSAGE', '%s has earned %s %s!')),
        victoryLearn: String(get('VICTORY_LEARN', '%s has unlocked new Equip Skills!')),
        victoryAftermath: String(get('VICTORY_AFTERMATH', '+%s%s')),
        aftermath: String(sources.some(s => /\$imported\["YEA-VictoryAftermath"\]\s*=\s*true/.test(s))),
        equipEngine: String(sources.some(s => /\$imported\["YEA-AceEquipEngine"\]\s*=\s*true/.test(s)))
    };
}

module.exports = { extract };
