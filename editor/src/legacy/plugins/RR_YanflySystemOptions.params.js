'use strict';
// Plugin parameters for RR_YanflySystemOptions from the game's copy of Yanfly's System Options (YEA::SYSTEM:
// COMMANDS, CUSTOM_SWITCHES, CUSTOM_VARIABLES, COMMAND_VOCAB), whether Theo's Global System Options made them
// global, and the values the game shipped in OptionData.rvdata2 (the global options file).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const M = require('../RubyMarshal.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const literal = (source, name) => {
    const m = new RegExp('^\\s*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return null;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return null; }
};
const asMap = (v) => (v instanceof Map ? v : v && typeof v === 'object' && !Array.isArray(v) ? new Map(Object.entries(v).filter(([k]) => k !== '__class')) : new Map());

function extract({ scripts = [], constants = {}, read = () => null } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-SystemOptions"\]\s*=\s*true/.test(s)) || '';
    const order = literal(source, 'COMMANDS') || [];
    const switches = asMap(literal(source, 'CUSTOM_SWITCHES'));
    const variables = asMap(literal(source, 'CUSTOM_VARIABLES'));
    const vocab = asMap(literal(source, 'COMMAND_VOCAB'));
    const commands = [];
    for (const sym of Array.isArray(order) ? order : []) {
        const v = vocab.get(sym) || [];
        if (sym === 'blank') commands.push({ kind: 'blank', name: String(v[0] ?? ''), help: String(v[3] ?? '') });
        else if (/^window_(red|grn|blu)$/.test(sym)) commands.push({ kind: 'tone', type: sym.slice(7), name: String(v[0] ?? ''), help: String(v[3] ?? '') });
        else if (/^volume_(bgm|bgs|sfx)$/.test(sym)) commands.push({ kind: 'volume', type: sym.slice(7), name: String(v[0] ?? ''), color1: Number(v[1]) || 0, color2: Number(v[2]) || 0, help: String(v[3] ?? '') });
        else if (['autodash', 'instantmsg', 'animations'].includes(sym)) commands.push({ kind: 'toggle', type: sym, name: String(v[0] ?? ''), off: String(v[1] ?? 'OFF'), on: String(v[2] ?? 'ON'), help: String(v[3] ?? '') });
        else if (['to_title', 'shutdown', 'difficulty', 'music', 'mouse', 'photo'].includes(sym)) commands.push({ kind: 'action', type: sym, name: String(v[0] ?? ''), help: String(v[3] ?? '') });
        else if (switches.has(sym)) { const s = switches.get(sym); commands.push({ kind: 'switch', id: Number(s[0]), name: String(s[1] ?? ''), off: String(s[2] ?? 'OFF'), on: String(s[3] ?? 'ON'), help: String(s[4] ?? '') }); }
        else if (variables.has(sym)) { const s = variables.get(sym); commands.push({ kind: 'variable', id: Number(s[0]), name: String(s[1] ?? ''), color1: Number(s[2]) || 0, color2: Number(s[3]) || 0, min: Number(s[4]) || 0, max: Number(s[5]) || 0, help: String(s[6] ?? '') }); }
    }
    const k = (name, d) => (constants['YEA::SYSTEM::' + name] === undefined ? d : constants['YEA::SYSTEM::' + name]);
    const defaults = { bgm: 100, bgs: 100, sfx: 100, autodash: k('DEFAULT_AUTODASH', false) === true, instantmsg: k('DEFAULT_INSTANTMSG', false) === true, animations: k('DEFAULT_ANIMATIONS', true) !== false, switches: {}, variables: {} };
    const global = sources.some(s => /Theo_GlobalOption/.test(s));
    if (global) {
        try {
            const bytes = read('OptionData.rvdata2');
            const data = bytes ? M.load(bytes) : null;
            if (data && typeof data === 'object') {
                const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
                Object.assign(defaults, { bgm: num(data.volume_bgm, 100), bgs: num(data.volume_bgs, 100), sfx: num(data.volume_sfx, 100) });
                for (const key of ['autodash', 'animations']) if (typeof data[key] === 'boolean') defaults[key] = data[key];
                if (typeof data.instant_msg === 'boolean') defaults.instantmsg = data.instant_msg;
                for (const [id, value] of asMap(data.switches)) defaults.switches[Number(id)] = value === true;
                for (const [id, value] of asMap(data.variables)) defaults.variables[Number(id)] = Number(value) || 0;
            }
        } catch (_) { /* an unreadable options file leaves the script's defaults */ }
    }
    return { commands: JSON.stringify(commands), global: String(global), defaults: JSON.stringify(defaults) };
}

module.exports = { extract };
