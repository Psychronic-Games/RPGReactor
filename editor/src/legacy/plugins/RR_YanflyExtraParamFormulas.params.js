'use strict';
// Plugin parameters for RR_YanflyExtraParamFormulas from the game's copy of Yanfly's Extra Param Formulas (YEA::XPARAM::FORMULA).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-ExtraParamFormulas"\]\s*=\s*true/.test(s)) || '';
    const m = /FORMULA\s*=\s*/.exec(source);
    let table = new Map();
    if (m) try { table = readLiteral(source, m.index + m[0].length)[0]; } catch (_) { table = new Map(); }
    const formulas = {};
    for (const [key, value] of table instanceof Map ? table : []) {
        const k = /^(\w+?)_(n_value|formula)$/.exec(key);
        if (!k) continue;
        formulas[k[1]] = formulas[k[1]] || ['0', 'base_' + k[1]];
        formulas[k[1]][k[2] === 'n_value' ? 0 : 1] = String(value);
    }
    return { formulas: JSON.stringify(formulas) };
}

module.exports = { extract };
