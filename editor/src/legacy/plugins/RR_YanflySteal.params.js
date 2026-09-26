'use strict';
// Plugin parameters for RR_YanflySteal from the game's copy of Yanfly's Steal Items (YEA::STEAL), whether it
// carried the Skill Display popup add-on, and the game's Font.default_size.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** NAME = <literal> at the start of a line, or undefined. */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
/** NAME = RPG::SE.new("name", volume, pitch). */
function se(source, name, fallback) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*RPG::SE\\.new\\(\\s*["\']([^"\']*)["\'](?:\\s*,\\s*(\\d+))?(?:\\s*,\\s*(\\d+))?', 'm').exec(source);
    if (!m) return fallback;
    return { name: m[1], volume: m[2] === undefined ? 100 : Number(m[2]), pitch: m[3] === undefined ? 100 : Number(m[3]) };
}
// Ruby's "\e" is the escape the message codes are read from; here a backslash.
const codes = (s) => String(s).replace(/\x1b/g, '\\');

/** The steal bonus formula as JavaScript of a (the thief) and b (the enemy), through the formula translator. */
function formula(source) {
    const ruby = String(source).replace(/\buser\b/g, 'a').replace(/\bself\b/g, 'b');
    try {
        const js = require('../RgssConvert.js').ruby(ruby, 'formula', {});
        if (js) return js;
    } catch (_) { /* below */ }
    return '0';
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YEA-StealItems"\]\s*=\s*true/.test(s)) || '';
    const get = (name, d) => { const v = literal(source, name); return v === undefined || v === null ? d : v; };
    // Ruby truth: only false and nil are false.
    const truth = (v) => String(v !== false && v !== null && v !== undefined);
    let fontSize = 24;
    for (const s of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(s);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : constants[m[1]];
        if (typeof v === 'number' && v > 0) fontSize = v;
    }
    return {
        failText: codes(get('STEAL_FAIL_TEXT', "%s couldn't steal an item.")),
        successText: codes(get('STEAL_SUCCESS_TEXT', '%s steals \\c[17]%s\\c[0] from %s!')),
        emptyText: codes(get('STEAL_EMPTY_TEXT', '%s has nothing left to steal.')),
        rateText: String(get('SNATCH_RATE_TEXT', '%1.2f%%')),
        rateSize: String(Number(get('SNATCH_RATE_SIZE', 18)) || 18),
        sounds: JSON.stringify({
            1: se(source, 'STEAL_ITEM_SFX', { name: 'Item3', volume: 100, pitch: 100 }),
            2: se(source, 'STEAL_WEAPON_SFX', { name: 'Equip1', volume: 100, pitch: 100 }),
            3: se(source, 'STEAL_ARMOUR_SFX', { name: 'Equip2', volume: 100, pitch: 100 }),
            4: se(source, 'STEAL_GOLD_SFX', { name: 'Shop', volume: 100, pitch: 100 })
        }),
        maxRate: String(Number(get('MAXIMUM_RATE', 0.9999))),
        minRate: String(Number(get('MINIMUM_RATE', 0.0001))),
        bonusRate: formula(get('STEAL_BONUS_RATE', '(user.luk/(512.0+user.luk))*0.3333')),
        lowerStats: truth(get('STEAL_LOWER_STATS', true)),
        goldIcon: String(Number(get('GOLD_ICON', 0)) || 0),
        goldDescription: String(get('GOLD_DESCRIPTION', '')),
        nothingDescription: String(get('NOTHING_DESCRIPTION', '')),
        popups: String(sources.some(s => /def show_steal_popup_nb\b/.test(s))),
        defaultFontSize: String(fontSize)
    };
}

module.exports = { extract };
