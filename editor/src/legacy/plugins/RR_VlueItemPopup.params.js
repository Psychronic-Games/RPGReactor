'use strict';
// Plugin parameters for RR_VlueItemPopup from the game's copy of Vlue's Sleek Item Popup (PU_* constants),
// the rarity colours of Hime's Item Rarity when the game had it, and the game's Font.default_size.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** NAME = <literal> at the start of a line, or undefined. */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
const color = (source, name) => {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*Color\\.new\\(([^)]*)\\)', 'm').exec(source);
    return m ? m[1].split(',').map(n => Number(n.trim())) : undefined;
};

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\[:Vlue_SleekPopup\]/.test(s)) || '';
    const get = (name, d) => { const v = literal(source, name); return v === undefined || v === null ? d : v; };
    const se = (name, d) => { const a = get(name, d); return JSON.stringify({ name: String(a[0] ?? ''), volume: String(a[1] ?? 100), pitch: String(a[2] ?? 100) }); };
    const rarity = sources.find(s => /\$imported\[:TH_ItemRarity\]\s*=\s*true/.test(s));
    let rarityColours = '';
    if (rarity) {
        const map = literal(rarity, 'Colour_Map');
        if (map instanceof Map) rarityColours = JSON.stringify(Object.fromEntries([...map].map(([k, v]) => [String(k), v])));
    }
    // Font.default_size = 18, or = SOME::CONSTANT; RGSS3's own default is 24.
    let fontSize = 24;
    for (const s of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(s);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : constants[m[1]];
        if (typeof v === 'number' && v > 0) fontSize = v;
    }
    const truth = (v) => v !== false && v !== null && v !== undefined;
    return {
        soundGain: se('PU_SOUND_EFFECT_GAIN', ['OK', 100, 100]),
        soundLose: se('PU_SOUND_EFFECT_LOSE', ['Cancel', 100, 50]),
        goldGain: se('PU_SOUND_GOLD_GAIN', ['shop', 100, 100]),
        goldLose: se('PU_SOUND_GOLD_LOSE', ['shop', 100, 50]),
        useAnimation: String(truth(get('PU_USE_ANIMATION', false))),
        animationId: String(Number(get('PU_POPUP_ANIMATION', 0)) || 0),
        fadeIn: String(Number(get('PU_FADEIN_TIME', 5)) || 5),
        fadeOut: String(Number(get('PU_FADEOUT_TIME', 5)) || 5),
        defaultDuration: String(Number(get('PU_DEFAULT_DURATION', 5)) || 0),
        automatic: String(truth(get('$PU_AUTOMATIC_POPUP', true))),
        useCustomFont: String(truth(get('PU_USE_CUSTOM_FONT', false))),
        customFont: JSON.stringify({
            name: [].concat(get('PU_DEFAULT_FONT_NAME', [])), size: Number(get('PU_DEFAULT_FONT_SIZE', 0)) || 0,
            color: color(source, 'PU_DEFAULT_FONT_COLOR') || [255, 255, 255, 255], bold: truth(get('PU_DEFAULT_FONT_BOLD', false)),
            italic: truth(get('PU_DEFAULT_FONT_ITALIC', false)), outline: truth(get('PU_DEFAULT_FONT_OUTLINE', true))
        }),
        compact: String(truth(get('PU_COMPACT_MODE', true))),
        useBackgroundIcon: String(truth(get('PU_USE_BACKGROUND_ICON', false))),
        backgroundIcon: String(Number(get('PU_BACKGROUND_ICON', 0)) || 0),
        goldName: String(get('PU_GOLD_NAME', 'G')),
        goldIcon: String(Number(get('PU_GOLD_ICON', 262)) || 0),
        singleLine: String(truth(get('PU_SINGLE_LINE', true))),
        rarityColours,
        rgssFontSize: String(fontSize)
    };
}

module.exports = { extract };
