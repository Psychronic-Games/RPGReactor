'use strict';
// Plugin parameters for RR_ThrallATB from the game's copies of star's STR33 Active Time Battle (STRRGSS2::CTB in
// "STR33b_ATB Customization"), the battle message (STR11b), the cursor (STR33xx), the battle status skins
// (STR33g1 and the wait gauge), the enemy gauges (STR33g2, STR15) and the flee gauge (STR33g3).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return plain(readLiteral(source, m.index + m[0].length)[0]); } catch (_) { return undefined; }
}
/** `NAME = value` (a number, a string, true/false or an array), else undefined. */
function value(source, name) {
    const v = literal(source, name);
    return v;
}
/** Color.new(r, g, b[, a]) lists: `NAME = [Color.new(…), Color.new(…)]` → [[r,g,b,a], …]. */
function colors(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*\\[([^\\]]*)\\]', 'm').exec(source);
    if (!m) return undefined;
    const out = [];
    for (const c of m[1].matchAll(/Color\.new\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/g)) out.push([+c[1], +c[2], +c[3], c[4] === undefined ? 255 : +c[4]]);
    return out;
}
function rect(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*Rect\\.new\\(([^)]*)\\)', 'm').exec(source);
    return m ? m[1].split(',').map(s => Number(s.trim()) || 0) : undefined;
}
function se(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*RPG::SE\\.new\\(\\s*"([^"]*)"\\s*(?:,\\s*(\\d+))?\\s*(?:,\\s*(\\d+))?', 'm').exec(source);
    return m ? { name: m[1], volume: m[2] === undefined ? 80 : +m[2], pitch: m[3] === undefined ? 100 : +m[3], pan: 0 } : undefined;
}

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const find = (re) => sources.find(s => re.test(s)) || '';
    const ctb = find(/module STRRGSS2;\s*module CTB/);
    const message = find(/class Window_BattleMessage < Window_Message[\s\S]*TEXT_B_COLOR/);
    const cursor = find(/class Sprite_BattleCursor < Sprite[\s\S]*CURSOR\s*=/);
    const status = find(/BTSKIN_00\s*=/);
    const wait = find(/BTSKIN_17\s*=/);
    const enemy = find(/CTBGAUGE_BC\s*=/);
    const flee = find(/ESCGAUGE_BC\s*=/);
    const hp = find(/GAUGE_M\s*=\s*"HIDEHP"/);
    const out = {};
    const put = (key, v) => { if (v !== undefined) out[key] = typeof v === 'string' ? v : JSON.stringify(v); };
    for (const name of ['WAIT_VA', 'CT_SPEED_VA', 'WAIT', 'WAIT_P', 'RTT', 'RTT_COUNT', 'CT_MAX', 'CT_SPEED', 'CT_CANCEL', 'CT_DM_ATTACK', 'CT_DM_WORD', 'CT_CT_WORD', 'CT_AW_WORD',
        'ESCAPE', 'ESCAPE_SWITCH', 'ESCAPE_CSTOP', 'ESCAPE_LOSS', 'ESCAPE_LOSSP', 'W_RESIZE', 'W_HELP_Y', 'ESC_DISABLE', 'CNX_DISABLE', 'EXTEND']) put(name, value(ctb, name));
    put('W_RECT', rect(ctb, 'W_RECT'));
    put('COMMANDSE', se(ctb, 'COMMANDSE'));
    put('TEXT_B_COLOR', colors(message, 'TEXT_B_COLOR'));
    for (const name of ['BTWIDTH', 'MOVE', 'SPEED', 'W_OPACITY', 'N_WINDOW']) put('MSG_' + name, value(message, name));
    for (const name of ['CURSOR', 'WAIT', 'SPEED', 'CW', 'CH']) put('CURSOR_' + name, value(cursor, name));
    for (const name of ['BTSKIN_00', 'BTSKIN_01', 'BTSKIN_02', 'BTSKIN_03', 'BTSKIN_04', 'BTSKIN_05', 'BTSKIN_100', 'BTSKIN_101', 'BTSKIN_B_XY', 'BTSKIN_00XY', 'BTSKIN_01XY',
        'BTSKIN_02XY', 'BTSKIN_04XY', 'BTSKIN_05XY', 'BTSKIN_03XY', 'BTSKIN_06XY', 'BTSKIN_100XY', 'BTSKIN_101XY', 'BTSKIN_01GS', 'BTSKIN_02GS', 'BTSKIN_100GS', 'BTSKIN_04SS',
        'BTSKIN_05SS', 'BTSKIN_04NS', 'BTSKIN_05NS', 'BTSKIN_06WH', 'BTSKIN_06SC']) put(name, value(status, name));
    for (const name of ['BTSKIN_17', 'BTSKIN_18', 'BTSKIN_17XY', 'BTSKIN_18XY']) put(name, value(wait, name));
    for (const name of ['CTBGAUGE_BC', 'ODGAUGE_BC', 'CTBGAUGE_GC', 'ODGAUGE_GC', 'CTBGAUGE_AW']) put(name, colors(enemy, name));
    for (const name of ['CTBGAUGE_Y', 'CTBGAUGE_Z', 'CTBGAUGE_W', 'CTBGAUGE_H', 'ODGAUGE_Y', 'ODGAUGE_Z', 'ODGAUGE_W', 'ODGAUGE_H', 'LVL_Y', 'LVL_Z', 'LVL_W', 'LVL_H',
        'GAUGE_N', 'GAUGE_NX', 'GAUGE_NL']) put(name, value(enemy, name));
    for (const name of ['ESCGAUGE_BC', 'ESCGAUGE_GC']) put(name, colors(flee, name));
    for (const name of ['ESCGAUGE_XY', 'ESCGAUGE_W', 'ESCGAUGE_H', 'ESCTEXT_SIZE', 'ESCTEXT', 'ESCTEXT_POS', 'ESCTEXT_ALIGN']) put(name, value(flee, name));
    for (const name of ['GAUGE_M', 'GAUGE_BOSS', 'GAUGE_W', 'GAUGE_H', 'GAUGE_S', 'GAUGE_T', 'GAUGE_O', 'GAUGE_V']) put('HP_' + name, value(hp, name));
    // STR31's command name colours.
    const info = find(/COMMANDNAME\s*=/);
    put('COMMANDNAME', colors(info, 'COMMANDNAME'));
    return out;
}

module.exports = { extract };
