'use strict';
// Plugin parameters for RR_YanflyEquipEngine from the game's copy of Yanfly's Ace Equip Engine (YEA::EQUIP).
// Equipment types are written as the imported database numbers them: the original's type x is x + 1 (weapon 1).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const ENGINE = /\$imported\["YEA-AceEquipEngine"\]\s*=\s*true/;

/** NAME = <literal> in the source (the first uncommented one), or undefined. */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

const camel = (name) => String(name).replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function extract({ scripts = [], constants = {} } = {}) {
    const texts = scripts.map(text);
    const at = texts.findIndex(s => ENGINE.test(s));
    const source = at >= 0 ? texts[at] : '';
    const k = (name, d) => (constants['YEA::EQUIP::' + name] === undefined ? d : constants['YEA::EQUIP::' + name]);

    const base = literal(source, 'DEFAULT_BASE_SLOTS');
    const slots = (Array.isArray(base) ? base : [0, 1, 2, 3, 4]).map(n => Number(n) + 1);

    const typesHash = literal(source, 'TYPES');
    const types = {};
    if (typesHash instanceof Map) {
        for (const [id, spec] of typesHash) {
            if (!Array.isArray(spec)) continue;
            // Ruby truth: only false and nil turn a flag off.
            types[Number(id) + 1] = { name: String(spec[0] ?? ''), removable: spec[1] !== false && spec[1] != null, optimize: spec[2] !== false && spec[2] != null };
        }
    }

    const list = literal(source, 'COMMAND_LIST');
    const custom = literal(source, 'CUSTOM_EQUIP_COMMANDS');
    const commands = [];
    for (const symbol of Array.isArray(list) ? list : ['equip', 'optimize', 'clear']) {
        if (['equip', 'optimize', 'clear'].includes(symbol)) { commands.push({ symbol }); continue; }
        const spec = custom instanceof Map ? custom.get(symbol) : null;
        if (!Array.isArray(spec)) continue;
        commands.push({ symbol, text: String(spec[0] ?? ''), enable: Number(spec[1]) || 0, show: Number(spec[2]) || 0, handler: camel(spec[3] ?? '') });
    }

    // Ace Adjust Limits, placed after the engine, redraws each row of the parameter window its own way.
    const limits = texts.findIndex((s, i) => i > at && /class Window_EquipStatus\b/.test(s) && /YEA::LIMIT::EQUIP_FONT/.test(s));
    const size = /Font\.default_size\s*=\s*(\d+)/.exec(texts.join('\n'));
    const core = constants['YEA::CORE::FONT_SIZE'];

    return {
        defaultSlots: JSON.stringify(slots),
        types: JSON.stringify(types),
        commands: JSON.stringify(commands),
        statusFontSize: String(Number(k('STATUS_FONT_SIZE', 20)) || 20),
        removeIcon: String(Number(k('REMOVE_EQUIP_ICON', 0)) || 0),
        removeText: String(k('REMOVE_EQUIP_TEXT', '') ?? ''),
        nothingIcon: String(Number(k('NOTHING_ICON', 0)) || 0),
        nothingText: String(k('NOTHING_TEXT', '') ?? ''),
        statusRows: at >= 0 && limits > at ? 'adjustLimits' : 'engine',
        limitsFontSize: String(Number(constants['YEA::LIMIT::EQUIP_FONT']) || 20),
        defaultFontSize: String(Number(core) || (size ? Number(size[1]) : 24))
    };
}

module.exports = { extract };
