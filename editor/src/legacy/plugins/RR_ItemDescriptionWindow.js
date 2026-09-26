/*:
 * @target MZ
 * @plugindesc Item Description window (VX Ace), for imported games
 * @author ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ItemDescriptionWindow.js
 *
 * On the item screen, Shift opens a full-screen window with the chosen
 * item's long description (<description: text> in its note, or its usual
 * description); Shift or Cancel closes it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    function Window_RRItemDescription() { this.initialize(...arguments); }
    Window_RRItemDescription.prototype = Object.create(Window_Base.prototype);
    Window_RRItemDescription.prototype.constructor = Window_RRItemDescription;
    Window_RRItemDescription.prototype.show = function(item) {
        this.contents.clear();
        Window_Base.prototype.show.call(this);
        if (!item) return;
        const m = /<\s*description\s*:\s*([^>]+)>/.exec(item.note || '');
        this.drawTextEx(m ? m[1] : item.description, 0, 0, this.innerWidth);
    };

    const _create = Scene_Item.prototype.create;
    Scene_Item.prototype.create = function() {
        _create.call(this);
        this._rrDescriptionWindow = new Window_RRItemDescription(new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight));
        this._rrDescriptionWindow.backOpacity = 255;
        this._rrDescriptionWindow.hide();
        this.addWindow(this._rrDescriptionWindow);
        this._itemWindow.setHandler('rrExpand', this.rrOnItemExpand.bind(this));
    };
    Scene_Item.prototype.rrOnItemExpand = function() {
        const w = this._rrDescriptionWindow;
        if (w.visible) w.hide();
        else w.show(this._itemWindow.item());
        this._itemWindow.activate();
    };
    const _onItemCancel = Scene_Item.prototype.onItemCancel;
    Scene_Item.prototype.onItemCancel = function() {
        if (this._rrDescriptionWindow && this._rrDescriptionWindow.visible) {
            this._rrDescriptionWindow.hide();
            this._itemWindow.activate();
            return;
        }
        _onItemCancel.call(this);
    };
    // While the description is open the list keeps its cursor keys and OK, as the original did.
    const _processHandling = Window_ItemList.prototype.processHandling;
    Window_ItemList.prototype.processHandling = function() {
        if (this.isOpenAndActive() && this.isHandled('rrExpand') && Input.isTriggered('shift')) {
            this.updateInputData();
            this.callHandler('rrExpand');
            return;
        }
        _processHandling.call(this);
    };
})();
