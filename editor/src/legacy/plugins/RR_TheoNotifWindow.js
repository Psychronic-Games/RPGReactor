/*:
 * @target MZ
 * @plugindesc TheoAllen - Notification Window (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoNotifWindow.js
 *
 * Script call: add_notif(text) queues a notification. On the map a strip
 * across the top of the screen fades in, types the text one character per
 * frame (text codes work), holds it, types the next queued one, and fades out
 * when the queue is empty. The queue lives on $gameTemp, so a save does not
 * keep it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; the importer turns the game's Ruby calls into the calls
 * below. Turning the plugin off leaves those calls doing nothing.
 *
 *   $gameTemp.rrAddNotif(text)
 *
 * @param startFadein
 * @text Fade-in frames
 * @type number
 * @default 15
 *
 * @param delayTime
 * @text Hold frames
 * @type number
 * @default 240
 * @desc Frames a notification stays after it is typed, before the next one or the fade-out.
 *
 * @param endFadeout
 * @text Fade-out frames
 * @type number
 * @default 15
 *
 * @param colorStart
 * @text Left colour
 * @default 0,0,0,180
 * @desc red,green,blue,alpha (0-255) at the left edge of the strip.
 *
 * @param colorEnd
 * @text Right colour
 * @default 0,0,0,50
 * @desc red,green,blue,alpha (0-255) at the right edge of the strip.
 *
 * @param xPosition
 * @text Vertical position
 * @type number
 * @min -9999
 * @default -6
 * @desc The strip's y on screen (the original named it XPosition). Smaller is higher.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoNotifWindow');
    const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
    const START_FADEIN = int(params.startFadein, 15);
    const DELAY_TIME = int(params.delayTime, 240);
    const END_FADEOUT = int(params.endFadeout, 15);
    const Y_POSITION = int(params.xPosition, -6);
    const rgba = (v, d) => {
        const c = String(v || d).split(',').map(s => parseInt(s, 10));
        const [r = 0, g = 0, b = 0, a = 255] = c.map(n => (Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0));
        return `rgba(${r},${g},${b},${a / 255})`;
    };
    const COLOR_START = rgba(params.colorStart, '0,0,0,180');
    const COLOR_END = rgba(params.colorEnd, '0,0,0,50');

    Game_Temp.prototype.rrAddNotif = function(text) {
        if (!this._rrNotifs) this._rrNotifs = [];
        this._rrNotifs.push(String(text == null ? '' : text));
    };

    function Window_RrTypingNotif() {
        this.initialize(...arguments);
    }
    Window_RrTypingNotif.prototype = Object.create(Window_Base.prototype);
    Window_RrTypingNotif.prototype.constructor = Window_RrTypingNotif;

    Window_RrTypingNotif.prototype.initialize = function() {
        const height = Window_Base.prototype.fittingHeight.call(Window_Base.prototype, 1);
        Window_Base.prototype.initialize.call(this, new Rectangle(-12, Y_POSITION, Graphics.width + 24, height));
        this._rrPhase = 'idle';
        this._rrOpacity = 0;
        this._rrFadeTarget = -1;
        this._rrFadeSpeed = 0;
        this._rrTextState = null;
        this._rrHold = 0;
        this.opacity = 0;
        this.contentsOpacity = 0;
        this.rrRefresh();
    };

    Window_RrTypingNotif.prototype.rrRefresh = function() {
        this.contents.clear();
        this.contents.gradientFillRect(0, 0, this.contents.width, this.contents.height, COLOR_START, COLOR_END, false);
    };

    // Linear fade kept in a float, finished when the rounded value lands on the target.
    Window_RrTypingNotif.prototype.rrFade = function(target, duration) {
        this._rrFadeTarget = target;
        if (duration > 0) this._rrFadeSpeed = (target - this._rrOpacity) / duration;
        else this._rrOpacity = target;
    };

    Window_RrTypingNotif.prototype.rrIsFading = function() {
        return this._rrFadeTarget !== -1 && this._rrFadeTarget !== Math.round(this._rrOpacity);
    };

    Window_RrTypingNotif.prototype.rrUpdateFade = function() {
        if (this.rrIsFading()) this._rrOpacity += this._rrFadeSpeed;
        else this._rrFadeTarget = -1;
    };

    Window_RrTypingNotif.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        this.rrUpdateFade();
        this.contentsOpacity = this._rrOpacity;
        this.rrUpdateNotif();
    };

    Window_RrTypingNotif.prototype.rrUpdateNotif = function() {
        const queue = $gameTemp._rrNotifs;
        switch (this._rrPhase) {
            case 'idle':
                if (!queue || !queue.length) return;
                this.rrRefresh();
                this.rrFade(255, START_FADEIN);
                this._rrPhase = 'fadein';
                return;
            case 'fadein':
                if (this.rrIsFading()) return;
                this.rrNextNotif();
                return;
            case 'typing': {
                // One character (or one text code) per frame, as the original typed it.
                const ts = this._rrTextState;
                this.processCharacter(ts);
                this.flushTextState(ts);
                if (ts.index >= ts.text.length) {
                    this._rrTextState = null;
                    this._rrHold = DELAY_TIME;
                    this._rrPhase = 'hold';
                }
                return;
            }
            case 'hold':
                if (this._rrHold-- > 0) return;
                if (queue && queue.length) this.rrNextNotif();
                else {
                    this.rrFade(0, END_FADEOUT);
                    this._rrPhase = 'fadeout';
                }
                return;
            case 'fadeout':
                if (this.rrIsFading()) return;
                this._rrPhase = 'idle';
                return;
        }
    };

    Window_RrTypingNotif.prototype.rrNextNotif = function() {
        const queue = $gameTemp._rrNotifs;
        const text = queue && queue.length ? queue.shift() : '';
        this.rrRefresh();
        this.resetFontSettings();
        this._rrTextState = this.createTextState(text, 4 + 12, 0, this.innerWidth);
        if (this._rrTextState.text.length) this._rrPhase = 'typing';
        else {
            this._rrTextState = null;
            this._rrHold = DELAY_TIME;
            this._rrPhase = 'hold';
        }
    };

    // Added to the scene above the window layer, as the original drew over every other window.
    const _rrNotifSceneMapStart = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _rrNotifSceneMapStart.call(this);
        this._rrNotifWindow = new Window_RrTypingNotif();
        this.addChild(this._rrNotifWindow);
    };

    window.Window_RrTypingNotif = Window_RrTypingNotif;
})();
