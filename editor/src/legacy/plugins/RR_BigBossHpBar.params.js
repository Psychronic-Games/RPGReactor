'use strict';
// Plugin parameters for RR_BigBossHpBar from the game's copy of the script (module BIG_BOSS_HP_BAR) and the
// game's Font.default_size. Settings written as sums of the others ((640 - BAR_WIDTH) / 2) are worked out.

const C = require('../RgssConvert.js');
const { setting } = require('./RR_YanflySkillCost.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** A setting's value: a literal, Color.new(r, g, b[, a]) as [r, g, b, a], or integer arithmetic on numbers and earlier settings. */
function value(source, name, known) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*(.*?)\\s*(?:#.*)?$', 'm').exec(source);
    if (!m) return undefined;
    const color = /^Color\.new\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)$/.exec(m[1]);
    if (color) return [Number(color[1]), Number(color[2]), Number(color[3]), color[4] === undefined ? 255 : Number(color[4])];
    const expr = m[1].replace(/\b[A-Z][A-Z0-9_]*\b/g, (k) => (typeof known[k] === 'number' ? String(known[k]) : 'NaN'));
    if (!/^[\d\s+\-*/()]+$/.test(expr)) return setting(source, name, undefined);
    let result;
    try { result = Function(`"use strict"; return (${expr});`)(); } catch (_) { return undefined; }
    // Ruby divides integers to an integer (the settings' sums divide once, at the end).
    return Number.isFinite(result) ? Math.floor(result) : undefined;
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /module BIG_BOSS_HP_BAR\b/.test(s)) || '';
    const known = {};
    const names = ['ENABLE_SHAKE_WHEN_DAMAGED', 'SHAKE_POWER', 'SHAKE_DURATION', 'BAR_WIDTH', 'BAR_HEIGHT', 'BAR_X', 'BAR_Y', 'WINDOW_HEIGHT', 'WINDOW_PADDING',
        'BACK_OPACITY', 'SHOW_NUMBERS', 'SHOW_MAX_HP', 'SHOW_BOSS_NAME', 'NAME_FONT_SIZE', 'HP_FONT_SIZE', 'NAME_BOLD', 'HP_BOLD', 'BAR_BACK_COLOR', 'BAR_FRAME_COLOR',
        'DEFAULT_BAR_COLOR1', 'DEFAULT_BAR_COLOR2'];
    for (const name of names) { const v = value(source, name, known); if (v !== undefined) known[name] = v; }
    const get = (name, d) => (known[name] !== undefined && typeof known[name] === typeof d ? known[name] : d);
    const size = C.fontDefaults(sources, constants).size;
    return {
        shake: String(get('ENABLE_SHAKE_WHEN_DAMAGED', true)), shakePower: String(get('SHAKE_POWER', 3)), shakeDuration: String(get('SHAKE_DURATION', 12)),
        barWidth: String(get('BAR_WIDTH', 200)), barHeight: String(get('BAR_HEIGHT', 44)), barX: String(get('BAR_X', 220)), barY: String(get('BAR_Y', 112)),
        windowHeight: String(get('WINDOW_HEIGHT', 40)), windowPadding: String(get('WINDOW_PADDING', 12)), backOpacity: String(get('BACK_OPACITY', 200)),
        showNumbers: String(get('SHOW_NUMBERS', true)), showMaxHp: String(get('SHOW_MAX_HP', true)), showName: String(get('SHOW_BOSS_NAME', true)),
        nameFontSize: String(get('NAME_FONT_SIZE', 20)), hpFontSize: String(get('HP_FONT_SIZE', 16)), nameBold: String(get('NAME_BOLD', true)), hpBold: String(get('HP_BOLD', true)),
        barBackColor: JSON.stringify(get('BAR_BACK_COLOR', [24, 24, 24, 255])), barFrameColor: JSON.stringify(get('BAR_FRAME_COLOR', [255, 255, 255, 255])),
        color1: String(get('DEFAULT_BAR_COLOR1', 2)), color2: String(get('DEFAULT_BAR_COLOR2', 10)),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract, value };
