'use strict';
// Plugin parameters for RR_MaVariableStatBooster from the game's copy of modern algebra's Variable Stat Booster
// for Enemies: VSB_STAT_ARRAY (the stats, as symbols) and VSB_BOOST_VARIABLE_ID (one variable, or one per stat).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /VSB_BOOST_VARIABLE_ID\s*=/.test(s)) || '';
    const out = {};
    const stats = /^\s*VSB_STAT_ARRAY\s*=\s*\[([^\]]*)\]/m.exec(source);
    if (stats) out.stats = JSON.stringify(Array.from(stats[1].matchAll(/:(\w+)/g), m => m[1]));
    const vars = /^\s*VSB_BOOST_VARIABLE_ID\s*=\s*(\[[^\]]*\]|\d+)/m.exec(source);
    if (vars) out.variables = vars[1].startsWith('[') ? JSON.stringify(Array.from(vars[1].matchAll(/\d+/g), m => Number(m[0]))) : vars[1];
    return out;
}

module.exports = { extract };
