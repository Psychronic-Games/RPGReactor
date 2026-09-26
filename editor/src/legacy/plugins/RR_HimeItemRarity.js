/*:
 * @target MZ
 * @plugindesc Item Rarity (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeItemRarity.js
 *
 * Item, weapon, armor and skill names are drawn in the colour of their
 * rarity: <item rarity: n> in the note (1 when absent), with the colours the
 * game set. A rarity with no colour draws in the normal colour.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param colours
 * @type multiline_string
 * @default {"1":[255,255,255]}
 * @desc JSON: { rarity: [r, g, b] }.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HimeItemRarity');
    let COLOURS = {};
    try { COLOURS = JSON.parse(params.colours || '{}') || {}; } catch (_) { COLOURS = {}; }
    const rarity = (item) => {
        if (item._rrRarity === undefined) {
            const m = /<item[-_ ]rarity:\s*(\d+)\s*>/i.exec(item.note || '');
            item._rrRarity = m ? Number(m[1]) : 1;
        }
        return item._rrRarity;
    };
    window.rrItemRarity = rarity;
    const colourOf = (item) => {
        const c = COLOURS[rarity(item)];
        return Array.isArray(c) ? `rgb(${Number(c[0]) || 0},${Number(c[1]) || 0},${Number(c[2]) || 0})` : ColorManager.normalColor();
    };
    Window_Base.prototype.rrAceDrawItemName = function(item, x, y, enabled = true, width = 172) {
        if (!item) return;
        this.drawIcon(item.iconIndex, x, y, enabled);
        this.changeTextColor(colourOf(item));
        this.changePaintOpacity(enabled);
        this.drawText(item.name, x + 24, y, width);
        this.resetTextColor();
        this.changePaintOpacity(true);
    };
})();
