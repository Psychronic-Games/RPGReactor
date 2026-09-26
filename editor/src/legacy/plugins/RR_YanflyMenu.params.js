'use strict';
// Plugin parameters for RR_YanflyMenu from the game's copy of Yanfly's Ace Menu Engine (YEA::MENU).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const MAIN = ['item', 'skill', 'equip', 'status', 'formation', 'save', 'game_end'];
const ALIGN = ['left', 'center', 'right'];

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-AceMenuEngine"\]\s*=\s*true/.test(s)) || '';
    const literal = (name) => {
        const m = new RegExp('\\b' + name + '\\s*=').exec(source);
        if (!m) return null;
        try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return null; }
    };
    const asMap = (v) => (v instanceof Map ? v : new Map(Object.entries(v || {})));
    const common = asMap(literal('COMMON_EVENT_COMMANDS')), custom = asMap(literal('CUSTOM_COMMANDS'));
    const commands = [];
    for (const symbol of literal('COMMANDS') || []) {
        const s = String(symbol);
        if (MAIN.includes(s)) { commands.push({ symbol: s, kind: 'main' }); continue; }
        // Both tables are consulted, as the original did; a symbol in both adds two commands.
        const ce = common.get(s);
        if (Array.isArray(ce)) commands.push({ symbol: s, kind: 'common', text: String(ce[0]), enable: Number(ce[1]) || 0, show: Number(ce[2]) || 0, commonEvent: Number(ce[3]) || 0 });
        const cu = custom.get(s);
        if (Array.isArray(cu)) commands.push({ symbol: s, kind: 'custom', text: String(cu[0]), enable: Number(cu[1]) || 0, show: Number(cu[2]) || 0, handler: String(cu[3]) });
    }
    const k = (name, d) => (constants['YEA::MENU::' + name] === undefined ? d : constants['YEA::MENU::' + name]);
    return {
        commands: JSON.stringify(commands),
        helpLocation: ['top', 'middle', 'bottom'][Number(k('HELP_WINDOW_LOCATION', 0))] || 'bottom',
        commandAlign: ALIGN[Number(k('COMMAND_WINDOW_ALIGN', 1))] || 'center',
        menuAlign: ALIGN[Number(k('MAIN_MENU_ALIGN', 0))] || 'left',
        menuRight: String(k('MAIN_MENU_RIGHT', false) === true),
        menuRows: String(Number(k('MAIN_MENU_ROWS', 10)) || 10),
        drawTp: String(k('DRAW_TP_GAUGE', true) !== false && k('DRAW_TP_GAUGE', true) !== null),
        drawMp: String(k('DRAW_MP_GAUGE', true) !== false && k('DRAW_MP_GAUGE', true) !== null),
        tpFirst: String(scripts.map(text).some(s => /\$imported\["YEA-BattleEngine"\]\s*=\s*true/.test(s)))
    };
}

module.exports = { extract };
