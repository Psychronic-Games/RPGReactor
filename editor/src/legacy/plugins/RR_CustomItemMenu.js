/*:
 * @target MZ
 * @plugindesc Customizable Item Menu (VX Ace), for imported games
 * @author modern algebra; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CustomItemMenu.js
 *
 * The item screen's categories are the game's own, shown as a row of icons
 * (the chosen one bright, the others faint) with the category's description
 * in the help window. An item joins categories with \CIM_CATEGORY[a, b] in
 * its note (\CIM_CATEGORY![a] leaves its default category), and adds lines
 * to its description with \DESC+{text}. The "all" category also lists one
 * empty row at the end, as the original did.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param categories
 * @type multiline_string
 * @default []
 * @desc JSON: [{ symbol, name, icon, description }].
 *
 * @param icons
 * @text Icons for categories
 * @type boolean
 * @default true
 *
 * @param helpLines
 * @type number
 * @default 2
 *
 * @param helpAtTop
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CustomItemMenu');
    let CATEGORIES = [];
    try { CATEGORIES = JSON.parse(params.categories || '[]') || []; } catch (_) { CATEGORIES = []; }
    const ICONS = String(params.icons) !== 'false';
    const HELP_LINES = Number(params.helpLines) || 2;
    const HELP_AT_TOP = String(params.helpAtTop) !== 'false';
    const TERMS = { weapon: 'weapon', armor: 'armor', key_item: 'keyItem', item: 'item' };
    const nameOf = (c) => (c.term ? TextManager[TERMS[c.term] || c.term] || '' : c.name || '');

    // Categories and extra description lines from the notes, once the database is in.
    const categoriesOf = (item) => {
        if (item._rrCimCategories) return item._rrCimCategories;
        const base = DataManager.isItem(item) ? (item.itypeId === 2 ? 'key_item' : 'item') : DataManager.isWeapon(item) ? 'weapon' : 'armor';
        const list = [base];
        const m = /\\CIM[_ ]CATEGOR(Y|IES)(!?)\s*\[\s*(.+?)\s*\]/i.exec(item.note || '');
        if (m) {
            if (m[2]) list.splice(list.indexOf(base), 1);
            list.push(...(m[3].match(/[^:,;\s]+/g) || []));
        }
        return (item._rrCimCategories = list);
    };
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_isDatabaseLoaded.call(this)) return false;
        if (!this._rrCimNotes) {
            this._rrCimNotes = true;
            for (const table of [$dataItems, $dataWeapons, $dataArmors]) for (const item of table) {
                if (!item) continue;
                for (const m of String(item.note || '').matchAll(/\\(?:DESC|DESCRIPTION)\+\{([\s\S]+?)\}/gi)) {
                    item.description += '\n' + m[1].replace(/\s*[\r\n]+\s*/g, ' ').replace(/\\[Nn]/g, '\n');
                }
            }
        }
        return true;
    };

    Window_ItemList.prototype.includes = function(item) {
        if (this._category === 'all') return true;
        if (!item) return false;
        return categoriesOf(item).includes(this._category);
    };
    // The key item count follows the database option, on the game's own key item category too.
    Window_ItemList.prototype.needsNumber = function() {
        return this._category === 'key_item' ? $dataSystem.optKeyItemsNumber : true;
    };

    Window_ItemCategory.prototype.makeCommandList = function() {
        for (const c of CATEGORIES) this.addCommand(ICONS ? '' : nameOf(c), c.symbol, true, c);
    };
    Window_ItemCategory.prototype.updateHelp = function() {
        const c = this.currentExt();
        this._helpWindow.setText(c ? String(c.description || '') : '');
    };
    Window_ItemCategory.prototype.needsSelection = function() { return true; };

    if (ICONS) {
        // As many columns as 24-pixel icons fit (8 apart), at most one per category.
        Window_ItemCategory.prototype.maxCols = function() {
            return Math.max(Math.min(Math.floor((this.width - this.padding) / (ImageManager.iconWidth + this.rrAceSpacing())), this.maxItems()), 1);
        };
        Window_ItemCategory.prototype.drawItem = function(index) {
            const rect = this.itemRect(index);
            const c = this._list[index].ext;
            this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);
            this.drawIcon(Number(c.icon) || 0, rect.x + Math.floor((rect.width - ImageManager.iconWidth) / 2), rect.y + Math.floor((rect.height - ImageManager.iconHeight) / 2), index === this.index());
        };
        const _select = Window_ItemCategory.prototype.select;
        Window_ItemCategory.prototype.select = function(index) {
            const last = this.index();
            _select.call(this, index);
            if (last !== this.index() && this.contents) this.refresh();
        };
    }

    Scene_Item.prototype.helpWindowRect = function() {
        const h = this.calcWindowHeight(HELP_LINES, false);
        return new Rectangle(0, HELP_AT_TOP ? 0 : Graphics.boxHeight - h, Graphics.boxWidth, h);
    };
    Scene_Item.prototype.categoryWindowRect = function() {
        return new Rectangle(0, HELP_AT_TOP ? this._helpWindow.height : 0, Graphics.boxWidth, this.calcWindowHeight(1, true));
    };
    Scene_Item.prototype.itemWindowRect = function() {
        const y = this._categoryWindow.y + this._categoryWindow.height;
        return new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y - (HELP_AT_TOP ? 0 : this._helpWindow.height));
    };
})();
