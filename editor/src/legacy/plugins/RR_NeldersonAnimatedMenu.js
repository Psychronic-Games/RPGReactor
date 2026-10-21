/*:
 * @target MZ
 * @plugindesc N.A.S.T.Y. Animated Main Menu by Nelderson (VX Ace), for imported games
 * @author Nelderson; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_NeldersonAnimatedMenu.js
 *
 * The main menu's windows slide in when it opens, one after another: the
 * party, then the commands, then the gold; and slide out the same way they
 * came (gold, party, commands) whenever the menu closes, for the map or for
 * another screen. Nothing takes input while they move.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param goldSpeed
 * @text Gold speed
 * @desc Pixels a frame.
 * @type number
 * @default 25
 *
 * @param commandSpeed
 * @text Command speed
 * @type number
 * @default 50
 *
 * @param actorSpeed
 * @text Party speed
 * @type number
 * @default 50
 *
 * @param direction
 * @text Comes from
 * @desc 2 below, 4 left, 6 right, 8 above.
 * @type select
 * @option 2
 * @option 4
 * @option 6
 * @option 8
 * @default 2
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_NeldersonAnimatedMenu');
    const SPEED = { gold: Number(P.goldSpeed) || 25, command: Number(P.commandSpeed) || 50, actor: Number(P.actorSpeed) || 50 };
    const DIR = Number(P.direction) || 2;

    /** Where a window waits off screen, coming from `dir`. */
    const offscreen = (w, dir) => {
        if (dir === 2) w.y = Graphics.boxHeight;
        if (dir === 4) w.x = -w.width;
        if (dir === 6) w.x = Graphics.boxWidth;
        if (dir === 8) w.y = -w.height;
    };
    /** One frame of a window's way to (x, y), as the script stepped it; true when there. */
    const stepIn = (w, x, y, dir, sp) => {
        if (dir === 2) { w.y -= sp; if (w.y <= y) w.y = y; }
        if (dir === 4) { w.x += sp; if (w.x >= x) w.x = x; }
        if (dir === 6) { w.x -= sp; if (w.x <= x) w.x = x; }
        if (dir === 8) { w.y += sp; if (w.y >= y) w.y = y; }
        return w.x === x && w.y === y;
    };
    const stepOut = (w, dir, sp) => {
        const target = { 2: [w.x, Graphics.boxHeight], 4: [-w.width, w.y], 6: [Graphics.boxWidth, w.y], 8: [w.x, -w.height] }[dir];
        if (dir === 2) { w.y += sp; if (w.y >= target[1]) w.y = target[1]; }
        if (dir === 4) { w.x -= sp; if (w.x <= target[0]) w.x = target[0]; }
        if (dir === 6) { w.x += sp; if (w.x >= target[0]) w.x = target[0]; }
        if (dir === 8) { w.y -= sp; if (w.y <= target[1]) w.y = target[1]; }
        return w.x === target[0] && w.y === target[1];
    };

    const S = Scene_Menu.prototype;
    const _create = S.create;
    S.create = function() {
        _create.call(this);
        for (const w of [this._commandWindow, this._goldWindow, this._statusWindow]) if (w) offscreen(w, DIR);
        this._rrNelQueue = null;
    };
    const _start = S.start;
    S.start = function() {
        _start.call(this);
        const gold = this._goldWindow, status = this._statusWindow, command = this._commandWindow;
        this._rrNelQueue = [
            () => stepIn(status, command.width, 0, DIR, SPEED.actor),
            () => stepIn(command, 0, 0, DIR, SPEED.command),
            () => stepIn(gold, 0, Graphics.boxHeight - gold.height, DIR, SPEED.gold)
        ];
    };
    const _update = S.update;
    S.update = function() {
        if (this.rrNelAnimating()) {
            if (this._rrNelQueue[0]()) this._rrNelQueue.shift();
            // The script moved them in a loop of its own: the screen redraws, nothing else runs.
            if (this.updateFade) this.updateFade();
            if (this.updateColorFilter) this.updateColorFilter();
            return;
        }
        _update.call(this);
    };
    S.rrNelAnimating = function() { return !!(this._rrNelQueue && this._rrNelQueue.length); };
    // Leaving the menu: gold, party, then commands slide back out before the next screen.
    const _stop = S.stop;
    S.stop = function() {
        _stop.call(this);
        const gold = this._goldWindow, status = this._statusWindow, command = this._commandWindow;
        this._rrNelQueue = [
            () => stepOut(gold, DIR, SPEED.gold),
            () => stepOut(status, DIR, SPEED.actor),
            () => stepOut(command, DIR, SPEED.command)
        ];
    };
    const _isBusy = S.isBusy;
    S.isBusy = function() { return this.rrNelAnimating() || _isBusy.call(this); };
})();
