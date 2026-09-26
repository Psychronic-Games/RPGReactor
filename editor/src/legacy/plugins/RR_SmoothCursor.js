/*:
 * @target MZ
 * @plugindesc Smooth Cursor (VX Ace), for imported games
 * @author RPG Maker Source (Maker Systems); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SmoothCursor.js
 *
 * Every list's cursor glides to the item selected, and changes size
 * smoothly, instead of jumping; a list scrolled to reach the item scrolls
 * the same way. Each frame covers 1/delay of the distance left (at least a
 * pixel), so a higher delay is slower. A cursor that had nothing selected
 * grows out of the list's top left corner. Selecting always scrolls the item
 * into view, as the original's windows did.
 *
 * Smooth Cursor © 2014 Maker Systems - RPG Maker Source
 * (www.rpgmakersource.com), credited as its license asks.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param delayLevel
 * @text Delay
 * @type number
 * @min 1
 * @default 4
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_SmoothCursor');
    const DELAY = Math.max(Number(params.delayLevel) || 4, 1);
    // A 1/DELAY step, rounded away from zero, never past the target (a fractional scroll could overshoot).
    const step = (target, now) => {
        const s = (target - now) / DELAY;
        return target > now ? Math.min(now + Math.ceil(s), target) : Math.max(now + Math.floor(s), target);
    };

    const W = Window_Selectable.prototype;
    const _refreshCursor = W.refreshCursor;
    // The target is kept in contents coordinates (unscrolled), with the scroll it needs.
    W.refreshCursor = function() {
        if (this._cursorAll || this.index() < 0) {
            this._rrSmoothTarget = null;
            return _refreshCursor.call(this);
        }
        const rect = this.itemRect(this.index());
        const itemHeight = this.itemHeight() || 1;
        const row = this.row(), top = Math.floor(this.scrollY() / itemHeight), bottom = top + this.maxPageRows() - 1;
        let oy = this.scrollY();
        if (row < top || row > bottom) {
            let r = row > bottom ? row - (this.maxPageRows() - 1) : row;
            r = Math.min(Math.max(r, 0), Math.max(this.maxRows() - 1, 0));
            oy = Math.min(r * itemHeight, this.maxScrollY());
        }
        this._rrSmoothTarget = { x: rect.x + this.scrollBaseX(), y: rect.y + this.scrollBaseY(), width: rect.width, height: rect.height, oy };
    };
    // Selecting scrolls through the target above.
    const _ensureCursorVisible = W.ensureCursorVisible;
    W.ensureCursorVisible = function(smooth) {
        if (this._cursorAll || this.index() < 0) _ensureCursorVisible.call(this, smooth);
    };
    const _update = W.update;
    W.update = function() {
        _update.call(this);
        if (this._rrSmoothTarget && this.index() >= 0 && !this._destroyed) this.rrSmoothCursorUpdate();
    };
    W.rrSmoothCursorUpdate = function() {
        const t = this._rrSmoothTarget, c = this._cursorRect;
        // An empty cursor sits at the contents' corner, as an empty Rect did.
        const empty = c.x === 0 && c.y === 0 && c.width === 0 && c.height === 0;
        const x = step(t.x, empty ? 0 : c.x + this.scrollBaseX());
        const y = step(t.y, empty ? 0 : c.y + this.scrollBaseY());
        const width = step(t.width, c.width), height = step(t.height, c.height);
        this.scrollTo(this.scrollX(), step(t.oy, this.scrollY()));
        this.setCursorRect(x - this.scrollBaseX(), y - this.scrollBaseY(), width, height);
        if (x === t.x && y === t.y && width === t.width && height === t.height && this.scrollY() === t.oy) this._rrSmoothTarget = null;
    };
})();
