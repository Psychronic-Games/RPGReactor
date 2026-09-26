'use strict';
// Plugin parameters for RR_YanflyBuffStateManager from the game's copy of Yanfly's Buff & State Manager
// (YEA::BUFF_STATE_MANAGER) and the game's Font.default_size.

const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** The Ruby buff formula as JavaScript run on the battler: buff_level(param_id) → this.rrBuffLevel(paramId). */
function buffFormula(ruby) {
    return String(ruby)
        .replace(/\bbuff_level\s*\(/g, 'this.rrBuffLevel(')
        .replace(/\bparam_id\b/g, 'paramId')
        .replace(/\bself\./g, 'this.');
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const k = (name, d) => (constants['YEA::BUFF_STATE_MANAGER::' + name] === undefined ? d : constants['YEA::BUFF_STATE_MANAGER::' + name]);
    const size = C.fontDefaults(sources, constants).size;
    return {
        showTurns: String(k('SHOW_REMAINING_TURNS', true) !== false),
        turnsSize: String(Number(k('TURNS_REMAINING_SIZE', 18))),
        turnsY: String(Number(k('TURNS_REMAINING_Y', -4))),
        defaultBuffLimit: String(Number(k('DEFAULT_BUFF_LIMIT', 4))),
        maximumBuffLimit: String(Number(k('MAXIMUM_BUFF_LIMIT', 8))),
        buffFormula: buffFormula(k('BUFF_BOOST_FORMULA', 'buff_level(param_id) * 0.25 + 1.0')),
        reapplyRule: String(Number(k('REAPPLY_STATE_RULES', 2))),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract, buffFormula };
