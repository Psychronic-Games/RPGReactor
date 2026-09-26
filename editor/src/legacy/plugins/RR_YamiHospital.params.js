'use strict';
// Plugin parameters for RR_YamiHospital from the game's copy of Yami's Hospital (module YES::HOSPITAL), and whether
// the Hospital Prizes add-on came with it.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function constant(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const main = sources.find(s => /\$imported\["YES-Hospital"\]\s*=\s*true/.test(s)) || '';
    const prizes = sources.some(s => /\$imported\["YES-HospitalPrizes"\]\s*=\s*true/.test(s));
    const get = (name, d) => { const v = constant(main, name); return v === undefined || v === null ? d : v; };
    return {
        hpCost: String(get('HP_COST', 1)),
        mpCost: String(get('MP_COST', 2)),
        stateCost: String(get('STATE_COST', 10)),
        nurseFace: JSON.stringify(plain(get('NURSE_FACE', ['Actor4', 0]))),
        nurseMessages: JSON.stringify(plain(get('NURSE_MESSAGE', ['Hello!']))),
        helpText: JSON.stringify(plain(get('HELP_MESSAGE', new Map()))),
        commandText: JSON.stringify(plain(get('COMMAND_TEXT', new Map()))),
        commands: JSON.stringify(plain(get('COMMAND_ARRAY', ['heal_one', 'heal_all', 'exit']))),
        prizes: String(prizes)
    };
}

module.exports = { extract };
