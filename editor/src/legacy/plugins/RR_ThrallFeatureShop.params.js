'use strict';
// Plugin parameters for RR_ThrallFeatureShop from Thrall's Feature Shop: STRAK::APPRAISE's tables (the
// upgrades, the bestiary entries, the prefix and name lists appraisal checks, and the guides and craftable
// equipment they unlock).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function tables(source) {
    const out = {};
    const start = source.search(/^\s*module APPRAISE\b/m);
    if (start < 0) return out;
    let body = source.slice(start);
    const end = body.search(/^class \w/m);
    if (end >= 0) body = body.slice(0, end);
    for (const m of body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(?=\[)/gm)) {
        try { out[m[1]] = readLiteral(body, m.index + m[0].length)[0]; } catch (_) { /* a table that does not read stays out */ }
    }
    return out;
}

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module APPRAISE\b/.test(s) && /class Scene_Appraise\b/.test(s));
    return source ? { tables: JSON.stringify(tables(source)) } : {};
}

module.exports = { extract, tables };
