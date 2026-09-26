'use strict';
// Plugin parameters for RR_YanflyShopOptions from the game's copy of Yanfly's Ace Shop Options (module YEA::SHOP),
// the add-ons that came with it (MUR's item features, the buy categories, Shiggy's actor icons), and what they
// read from other scripts: Adjust Limits' price font, Ace Menu Engine's help place, Hime's rarity colours.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

/** NAME = <literal> in the text (the first uncommented one), or undefined. */
function constant(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

/** The body of the last `def name` in the scripts (a later script's definition replaces an earlier one). */
function methodBody(sources, name) {
    let body = null;
    const re = new RegExp('^([ \\t]*)def ' + name + '\\b[^\\n]*\\n([\\s\\S]*?)^\\1end\\b', 'gm');
    for (const s of sources) for (const m of s.matchAll(re)) body = m[2];
    return body;
}

/** A game's scene class as the class a port gives it (families' `classes`), or its own name. */
function portedScene(name) {
    let classes = {};
    try {
        for (const f of require('../RgssConvert.js').FAMILIES) Object.assign(classes, f.classes || {});
    } catch (_) { classes = {}; }
    return classes[name] || name;
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const main = sources.find(s => /\$imported\["YEA-ShopOptions"\]\s*=\s*true/.test(s)) || '';
    const mur = sources.find(s => /def draw_feature_param\b/.test(s) && /class Window_ShopData\b/.test(s)) || '';
    const categories = sources.some(s => /def create_buy_category_window\b/.test(s));
    const icons = sources.find(s => /def draw_actor_icon\s*\(/.test(s) && /class Window_ShopStatus\b/.test(s)) || '';
    const k = (name, d) => (constants['YEA::SHOP::' + name] === undefined ? d : constants['YEA::SHOP::' + name]);
    const get = (source, name, d) => { const v = constant(source, name); return v === undefined || v === null ? d : v; };

    // The commands, in order; a custom one carries what its handler method opened.
    const custom = get(main, 'CUSTOM_SHOP_COMMANDS', new Map());
    const commands = [];
    for (const symbol of get(main, 'COMMANDS', ['buy', 'sell', 'equip', 'cancel'])) {
        if (['buy', 'sell', 'cancel'].includes(symbol)) { commands.push(symbol); continue; }
        const row = custom instanceof Map ? custom.get(symbol) : null;
        if (!Array.isArray(row)) continue;   // a command with no entry is not shown
        const [label, enable, show, handler] = row;
        const entry = { symbol: String(symbol), text: String(label ?? ''), enable: Number(enable) || 0, show: Number(show) || 0, handler: String(handler || '') };
        if (entry.handler === 'command_equip') entry.action = 'equip';
        else {
            const body = methodBody(sources, entry.handler) || '';
            const scene = /SceneManager\.call\(\s*(\w+)\s*\)/.exec(body);
            Object.assign(entry, { action: 'scene', scene: scene ? portedScene(scene[1]) : '', unequip: /\$game_party\.unequip_all\b/.test(body) });
        }
        commands.push(entry);
    }

    // Font.default_size, set by the game's scripts (a number or a constant); RGSS's own default is 24.
    let fontSize = 24;
    for (const src of sources) {
        const m = /^[ \t]*Font\.default_size\s*=\s*([\w:]+)/m.exec(src);
        if (!m) continue;
        const v = /^\d+$/.test(m[1]) ? Number(m[1]) : Number(constants[m[1]]);
        if (Number.isFinite(v) && v > 0) fontSize = v;
    }
    const limits = sources.some(s => /\$imported\["YEA-AdjustLimits"\]\s*=\s*true/.test(s));
    const menu = sources.some(s => /\$imported\["YEA-AceMenuEngine"\]\s*=\s*true/.test(s));
    const helpAt = Number(constants['YEA::MENU::HELP_WINDOW_LOCATION'] ?? 2);

    const out = {
        commands: JSON.stringify(commands),
        vocab: JSON.stringify(plain(get(main, 'VOCAB_STATUS', new Map()))),
        statusFontSize: String(k('STATUS_FONT_SIZE', 20)),
        maxIcons: String(k('MAX_ICONS_DRAWN', 10)),
        shopFontSize: String(limits ? Number(constants['YEA::LIMIT::SHOP_FONT'] ?? 0) : 0),
        rgssFontSize: String(fontSize),
        helpLocation: menu ? (['top', 'middle'][helpAt] || 'bottom') : '',
        itemFeatures: String(!!mur),
        featureText: '{}',
        buyCategories: String(categories),
        actorIcons: '',
        rarityColours: ''
    };
    if (mur) {
        out.featureText = JSON.stringify({
            exparam: plain(get(mur, 'EXPARAM', new Map())), sparam: plain(get(mur, 'SPPARAM', new Map())),
            spslot: plain(get(mur, 'SPSLOT', new Map())), spflag: plain(get(mur, 'SPFLAG', new Map())),
            collapse: plain(get(mur, 'COLLAPSE_EFFECT', new Map())), party: plain(get(mur, 'PARTY_ABILITY', new Map())),
            info: plain(get(mur, 'ITEM_INFO', new Map())), colours: plain(get(mur, 'COLOURS', new Map()))
        });
        // MUR draws item names in Hime's rarity colours when the game had Item Rarity.
        if (sources.some(s => /\$imported\[:TH_ItemRarity\]\s*=\s*true/.test(s))) {
            out.rarityColours = require('./RR_HimeItemRarity.params.js').extract({ scripts: sources }).colours;
        }
    }
    if (icons) {
        const body = methodBody([icons], 'draw_actor_icon') || '';
        const table = {};
        for (const m of body.matchAll(/when\s+(\d+)\s*\n?\s*index\s*=\s*(\d+)/g)) table[m[1]] = Number(m[2]);
        out.actorIcons = JSON.stringify(table);
    }
    return out;
}

module.exports = { extract };
