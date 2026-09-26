'use strict';
// Plugin parameters for RR_YanflyStatusMenu from the game's copy of Yanfly's Ace Status Menu (YEA::STATUS), with the
// Menu Engine's help placement and the Equip Engine's stat font size when the game had them.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-StatusMenu"\]\s*=\s*true/.test(s)) || '';
    const literal = (name) => {
        const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
        if (!m) return null;
        try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return null; }
    };
    const custom = literal('CUSTOM_STATUS_COMMANDS');
    const table = custom instanceof Map ? custom : new Map();
    const commands = (literal('COMMANDS') || []).filter(Array.isArray).map(([symbol, label]) => {
        const c = table.get(symbol);
        return Object.assign({ symbol: String(symbol), text: String(label ?? '') }, Array.isArray(c) ? { enable: Number(c[0]) || 0, show: Number(c[1]) || 0, handler: String(c[2]), draw: String(c[3]) } : {});
    });
    // PARAM_COLOUR: id => [:sym, Color.new(r, g, b), Color.new(r, g, b)].
    const paramColours = {};
    const block = /PARAM_COLOUR\s*=\s*\{([\s\S]*?)\}\s*#?/.exec(source);
    if (block) for (const m of block[1].matchAll(/(\d+)\s*=>\s*\[\s*:\w+\s*,\s*Color\.new\(([^)]*)\)\s*,\s*Color\.new\(([^)]*)\)/g)) {
        const nums = (t) => t.split(',').map(v => Number(v.trim()) || 0).slice(0, 3);
        paramColours[m[1]] = [nums(m[2]), nums(m[3])];
    }
    const columns = ['PROPERTIES_COLUMN1', 'PROPERTIES_COLUMN2', 'PROPERTIES_COLUMN3'].map(n => (literal(n) || []).filter(Array.isArray).map(([k, l]) => [String(k), String(l ?? '')]));
    const k = (name, d) => (constants['YEA::STATUS::' + name] === undefined ? d : constants['YEA::STATUS::' + name]);
    const hasEquip = sources.some(s => /\$imported\["YEA-AceEquipEngine"\]\s*=\s*true/.test(s));
    const hasMenu = sources.some(s => /\$imported\["YEA-AceMenuEngine"\]\s*=\s*true/.test(s));
    const size = /Font\.default_size\s*=\s*(\d+)/.exec(sources.join('\n'));
    return {
        commands: JSON.stringify(commands),
        vocab: JSON.stringify({ parameters: String(k('PARAMETERS_VOCAB', 'Parameters')), experience: String(k('EXPERIENCE_VOCAB', 'Experience')), nextTotal: String(k('NEXT_TOTAL_VOCAB', 'Next %s Total EXP')), nickname: String(k('BIOGRAPHY_NICKNAME_TEXT', '%s the %s')) }),
        paramColours: JSON.stringify(paramColours),
        properties: JSON.stringify(columns),
        sizes: JSON.stringify({
            properties: Number(k('PROPERTIES_FONT_SIZE', 20)), nickname: Number(k('BIOGRAPHY_NICKNAME_SIZE', 32)),
            equip: hasEquip ? Number(constants['YEA::EQUIP::STATUS_FONT_SIZE'] ?? 20) : 20,
            base: Number(constants['YEA::CORE::FONT_SIZE']) || (size ? Number(size[1]) : 24)
        }),
        helpLocation: hasMenu ? (['top', 'middle', 'bottom'][Number(constants['YEA::MENU::HELP_WINDOW_LOCATION'] ?? 2)] || 'bottom') : 'none'
    };
}

module.exports = { extract };
