'use strict';
// Plugin parameters for RR_DismantleItems from the game's copy of Dismantle Items (module Bubs::Dismantle), and
// whether Roninator2's quantity add-on (Window_DismantleNumber) came with it.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

const CATEGORIES = { items: 'item', weapons: 'weapon', armors: 'armor', key_items: 'keyItem' };

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const main = sources.find(s => /\$imported\["BubsDismantle"\]\s*=/.test(s)) || '';
    const addon = sources.some(s => /class Window_DismantleNumber\b/.test(s));
    const k = (name, d) => (constants['Bubs::Dismantle::' + name] === undefined ? d : constants['Bubs::Dismantle::' + name]);
    const literal = (name) => {
        const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(main);
        if (!m) return undefined;
        try { return readLiteral(main, m.index + m[0].length)[0]; } catch (_) { return undefined; }
    };
    const cats = literal('SHOP_CATEGORIES');
    const se = literal('DISMANTLE_SE');
    const s = Array.isArray(se) ? se : ['', 100, 100];
    // Font.default_size, set by the game's scripts (a number or a constant); RGSS's own default is 24.
    let fontSize = 24;
    for (const src of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(src);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : Number(constants[m[1]]);
        if (Number.isFinite(v) && v > 0) fontSize = v;
    }
    return {
        commandText: String(k('DISMANTLE_COMMAND_TEXT', 'Dismantle')),
        cancelText: 'Cancel',   // Vocab::ShopCancel
        categories: JSON.stringify((Array.isArray(cats) ? cats : ['items', 'weapons', 'armors']).map(c => CATEGORIES[c]).filter(Boolean)),
        chance: String(k('DEFAULT_DISMANTLE_CHANCE', 100)),
        showChance: String(k('SHOW_DISMANTLE_CHANCE', false) === true),
        fee: String(k('DEFAULT_DISMANTLE_FEE', 0)),
        showFee: String(k('SHOW_DISMANTLE_FEE', true) !== false),
        feeText: String(k('DISMANTLE_FEE_TEXT', 'Fee')),
        showParts: String(k('SHOW_DISMANTLABLE_ITEMS_LIST', true) !== false),
        partsText: String(k('DISMANTLABLE_ITEMS_LIST_TEXT', 'Dismantlable Items')),
        counterText: String(k('DISMANTLABLE_COUNTER_TEXT', 'Times Dismantled')),
        resultsText: String(k('RESULTS_HEADER_TEXT', 'Dismantled Items')),
        useMask: String(k('USE_DISMANTLABLE_ITEMS_MASK', false) === true),
        maskIcon: String(k('DISMANTLABLE_ITEMS_MASK_ICON_ID', 0)),
        maskText: String(k('DISMANTLABLE_ITEMS_MASK', '?')),
        maskChance: String(k('DISMANTLABLE_ITEMS_CHANCE_MASK', '?%')),
        se: JSON.stringify({ name: String(s[0] ?? ''), volume: Number(s[1] ?? 100), pitch: Number(s[2] ?? 100) }),
        quantity: String(addon),
        lowGoldText: String(k('LOW_GOLD', 'Not Enough Gold')),
        rgssFontSize: String(fontSize)
    };
}

module.exports = { extract };
