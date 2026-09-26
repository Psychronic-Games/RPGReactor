'use strict';
// Plugin parameters for RR_TacticsCrafting from the game's copy of Tactics Ogre PSP Crafting System
// (module Bubs::TOCrafting) and the Info Pages Window it draws its components page with (Bubs::InfoPages).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** NAME = <literal> in the source (the first uncommented one), or undefined. */
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

// Gamepad symbols of RGSS as the imported game's button names.
const BUTTONS = { LEFT: 'left', RIGHT: 'right', UP: 'up', DOWN: 'down', A: 'shift', B: 'cancel', C: 'ok', X: 'rgssX', Y: 'rgssY', Z: 'rgssZ',
    L: 'pageup', R: 'pagedown', SHIFT: 'shift', CTRL: 'control', ALT: 'alt' };
const button = (v, d) => BUTTONS[String(v || '').toUpperCase()] || d;
const sound = (v, d) => { const a = Array.isArray(v) ? v : d; return JSON.stringify({ name: String(a[0] ?? ''), volume: Number(a[1] ?? 100), pitch: Number(a[2] ?? 100) }); };
// RGSS reads pictures from Graphics/Pictures/; the import keeps them in img/pictures/.
const folder = (dir) => String(dir || 'Graphics/Pictures/').replace(/^Graphics\//i, 'img/').replace(/^img\/(\w)/, (m, c) => 'img/' + c.toLowerCase()).replace(/\/?$/, '/');

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const craft = sources.find(s => /\$imported\["BubsTOCrafting"\]\s*=/.test(s)) || '';
    const pages = sources.find(s => /\$imported\["BubsInfoPages"\]\s*=/.test(s)) || '';
    const k = (name, d) => (constants['Bubs::TOCrafting::' + name] === undefined ? d : constants['Bubs::TOCrafting::' + name]);
    const ip = (name, d) => (constants['Bubs::InfoPages::' + name] === undefined ? d : constants['Bubs::InfoPages::' + name]);
    const nextPage = /NEXT_INGREDIENT_PAGE_BUTTON\s*=\s*:(\w+)/.exec(craft);
    const keys = literal(pages, 'PAGE_BUTTONS'), icons = literal(pages, 'PAGE_BUTTON_ICONS'), actors = literal(pages, 'ACTOR_ICONS');
    const get = (map, key, d) => (map instanceof Map && map.has(key) ? map.get(key) : d);
    return {
        headerText: String(k('INGREDIENTS_HEADER_TEXT', 'Components')),
        pageSize: String(k('INGREDIENTS_PAGE_SIZE', 6)),
        lackColor: String(k('NOT_ENOUGH_INGREDIENTS_COLOR', 10)),
        fadeLacking: String(k('FADED_REQUIREMENT_QUANTITY', true) !== false),
        moreFooter: String(k('INGREDIENTS_VIEW_MORE_FOOTER_TEXT', 'More Parts →')),
        nextPageButton: button(nextPage && nextPage[1], 'right'),
        footerText: String(ip('NORMAL_FOOTER_TEXT', '')),
        pageButtonIcons: JSON.stringify([Number(get(icons, 'prev_info_page', 0)) || 0, Number(get(icons, 'next_info_page', 0)) || 0]),
        pageKeys: JSON.stringify([button(get(keys, 'next_info_page', 'SHIFT'), 'shift'), button(get(keys, 'prev_info_page', 'SHIFT'), 'shift')]),
        pageSe: sound(literal(pages, 'PAGE_CHANGE_SE'), ['Cursor', 80, 100]),
        toolTexts: JSON.stringify([String(k('TOOL_AVAILABLE_TEXT', 'Available')), Number(k('TOOL_AVAILABLE_TEXT_COLOR', 3)),
            String(k('TOOL_UNAVAILABLE_TEXT', 'Unavailable')), Number(k('TOOL_UNAVAILABLE_TEXT_COLOR', 10))]),
        actorTexts: JSON.stringify([String(k('ACTOR_AVAILABLE_TEXT', 'Available')), Number(k('ACTOR_AVAILABLE_TEXT_COLOR', 3)),
            String(k('ACTOR_UNAVAILABLE_TEXT', 'Unavailable')), Number(k('ACTOR_UNAVAILABLE_TEXT_COLOR', 10))]),
        actorIcons: JSON.stringify(actors instanceof Map ? Object.fromEntries([...actors].filter(([id]) => typeof id === 'number').map(([id, icon]) => [id, Number(icon) || 0])) : {}),
        feeRate: String(k('CRAFTING_FEE_PRICE_RATE', 100)),
        goldWindow: String(k('USE_GOLD_WINDOW', true) !== false),
        goldIcon: String(k('GOLD_WINDOW_ICON_INDEX', 0)),
        goldText: String(k('GOLD_WINDOW_TEXT', 'Gold')),
        resultHeader: String(k('RESULT_WINDOW_HEADER_TEXT', 'You Received')),
        coverFolder: folder(k('RECIPEBOOK_PICTURES_DIRECTORY', 'Graphics/Pictures/')),
        stretchCovers: String(k('STRETCH_RECIPEBOOK_PICTURES', false) === true),
        craftSe: sound(literal(craft, 'CRAFTING_RESULT_SE'), ['', 100, 100])
    };
}

module.exports = { extract };
