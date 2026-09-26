/*:
 * @target MZ
 * @plugindesc Meow Face Battle Ammo Window (VX Ace), for imported games
 * @author Meow Face; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MeowAmmo.js
 *
 * In battle, the party's count of each ammo item stands at the right of the
 * screen, one row per ammo type from 100 pixels down: the item's count
 * right-aligned beside its icon, on no window background. The counts redraw
 * when any of them changes. The counters sit over the battle windows and
 * under the message window.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param ammo
 * @text Ammo types
 * @type multiline_string
 * @default []
 * @desc JSON: [[item id, icon index], …] top to bottom.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MeowAmmo');
    let AMMO = [];
    try { AMMO = (JSON.parse(params.ammo || '[]') || []).filter(e => Array.isArray(e) && e.length >= 2).map(([item, icon]) => [Number(item) || 0, Number(icon) || 0]); } catch (_) { AMMO = []; }

    const count = (id) => ($dataItems[id] ? $gameParty.numItems($dataItems[id]) : 0);

    class Window_RRMeowAmmo extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._lastQty = {};
            this.opacity = 0;
            this.refresh();
        }
        refresh() {
            this.contents.clear();
            const lh = this.lineHeight(), cw = this.contentsWidth();
            AMMO.forEach(([item, icon], i) => {
                const y = lh * i;
                this.drawIcon(icon, cw - 24, y);
                this.drawText(count(item), 0, y, cw - 24, 'right');
                this._lastQty[item] = count(item);
            });
        }
        needRefresh() { return AMMO.some(([item]) => this._lastQty[item] !== count(item)); }
        update() {
            if (this.needRefresh()) this.refresh();
            super.update();
        }
    }
    window.Window_RRMeowAmmo = Window_RRMeowAmmo;

    const _createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _createAllWindows.call(this);
        this.rrCreateAmmoWindow();
    };
    // Created last, it is drawn over the battle windows; the message window stays above it.
    Scene_Battle.prototype.rrCreateAmmoWindow = function() {
        this._rrAmmoWindow = new Window_RRMeowAmmo(new Rectangle(0, 100, Graphics.boxWidth, this.calcWindowHeight(6, false)));
        const layer = this._windowLayer;
        const at = this._messageWindow ? layer.children.indexOf(this._messageWindow) : -1;
        if (at >= 0) layer.addChildAt(this._rrAmmoWindow, at);
        else this.addWindow(this._rrAmmoWindow);
    };
})();
