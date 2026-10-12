'use strict';
// Plugin parameters for RR_SzyuCrafting from the game's copy of Szyu's Crafting System: its words, sounds, menu
// command (and the switch that enables it), the category bar and the details hint its ingredients window draws.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

function constant(text, name) {
    const m = new RegExp(`^[ \\t]*${name}\\s*=\\s*`, 'm').exec(text);
    if (!m) return undefined;
    try { return readLiteral(text, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const text = scripts.find(s => /class Scene_Crafting < Scene_ItemBase[\s\S]*def load_crafting_notetags_sz/.test(s));
    if (!text) return {};
    const out = {};
    const term = constant(text, 'INGREDIENTS_TERM');
    if (typeof term === 'string') out.ingredientsTerm = term;
    const byCat = constant(text, 'CUSTOM_CRAFT_SOUNDS_BY_CAT');
    if (Array.isArray(byCat)) out.soundsByCategory = JSON.stringify(byCat);
    const byType = constant(text, 'CUSTOM_CRAFT_SOUNDS_BY_TYPE');
    if (Array.isArray(byType)) out.soundsByType = JSON.stringify(byType);
    const inMenu = constant(text, 'CRAFTING_IN_MENU');
    if (typeof inMenu === 'boolean') out.inMenu = String(inMenu);
    const vocab = constant(text, 'MENU_CRAFTING_VOCAB');
    if (typeof vocab === 'string') out.menuCommand = vocab;
    const status = constant(text, 'CRAFTING_ITEM_STATUS');
    if (status instanceof Map) out.status = JSON.stringify(Object.fromEntries(status));
    const sw = /add_command\(MENU_CRAFTING_VOCAB,\s*:crafting,\s*\$game_switches\[(\d+)\]\)/.exec(text);
    if (sw) out.menuSwitch = sw[1];
    // The category bar: Vocab terms stay the database's ("" here), strings are the game's.
    const list = (/class Window_CraftingCategory[\s\S]*?def make_command_list([\s\S]*?)\n\s*end/.exec(text) || [])[1] || '';
    const categories = [];
    for (const m of list.matchAll(/add_command\(\s*(?:"([^"]*)"|Vocab::(\w+))\s*,\s*:(\w+)\)/g)) categories.push([m[1] !== undefined ? m[1] : '', m[3]]);
    if (categories.length) out.categories = JSON.stringify(categories);
    const hint = /draw_text\(0,\s*contents_height - 24,\s*160,\s*line_height,\s*"([^"]*)"\)/.exec(text);
    if (hint) out.detailsHint = hint[1];
    return out;
}

module.exports = { extract };
