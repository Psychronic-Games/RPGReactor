'use strict';
// Plugin parameters for RR_CustomItemMenu from the game's copy of modern algebra's Customizable Item Menu
// (the MA_CUSTOM_ITEM_MENU hash).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /MA_CUSTOM_ITEM_MENU\s*=\s*\{/.test(s)) || '';
    const m = /MA_CUSTOM_ITEM_MENU\s*=\s*/.exec(source);
    let config = new Map();
    if (m) try { config = readLiteral(source, m.index + m[0].length)[0]; } catch (_) { config = new Map(); }
    const get = (k, d) => (config.has(k) ? config.get(k) : d);
    const table = (k) => (get(k, new Map()) instanceof Map ? get(k, new Map()) : new Map());
    const vocab = table('category_vocab'), icons = table('category_icons'), descriptions = table('category_descriptions');
    const categories = (get('custom_categories', ['item', 'weapon', 'armor', 'key_item']) || []).map(symbol => {
        const v = vocab.get(symbol);
        // A name given as :"Vocab::weapon" is the database term.
        const term = typeof v === 'string' && /^Vocab::(\w+)$/.exec(v);
        const d = descriptions.get(symbol);
        return Object.assign({ symbol: String(symbol) }, term ? { term: term[1] } : { name: String(v ?? '') }, { icon: Number(icons.get(symbol)) || 0, description: String(Array.isArray(d) ? d[0] ?? '' : d ?? '') });
    });
    return {
        categories: JSON.stringify(categories),
        icons: String(get('use_icons_for_categories', true) !== false && get('use_icons_for_categories', true) !== null),
        helpLines: String(Number(get('description_lines', 2)) || 2),
        helpAtTop: String(get('description_at_top', true) !== false && get('description_at_top', true) !== null)
    };
}

module.exports = { extract };
