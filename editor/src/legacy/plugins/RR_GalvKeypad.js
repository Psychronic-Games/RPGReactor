/*:
 * @target MZ
 * @plugindesc Galv's Keypad Input (VX Ace), for imported games
 * @author Galv; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_GalvKeypad.js
 *
 * A keypad screen over the blurred map: a box showing the digits typed so
 * far, and under it a 3×4 pad (1–9, OK, 0, X). The arrows move over the pad
 * (wrapping only on a fresh press, not a held key), OK/Enter presses the key
 * under the cursor, Cancel/Escape deletes the last digit and, with none left,
 * leaves the keypad. OK stores the typed number in the keypad's variable (0
 * when nothing was typed); X, or backing out, stores -1. A digit past the
 * limit buzzes. The digit keys of the keyboard do nothing. With the game's
 * mouse on, a left click presses the key under the cursor and a right click
 * deletes; pointing does not move the cursor.
 *
 *   this.rrKeypadInput()     open the keypad; the event waits until it closes
 *
 * (the importer writes this for the game's keypad_input).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param variable
 * @text Result variable
 * @type variable
 * @default 20
 *
 * @param maxDigits
 * @text Digits
 * @type number
 * @min 1
 * @default 4
 * @desc How many digits can be typed. Past 10 the display box widens by 20 px a digit.
 *
 * @param okSe
 * @text OK sound
 * @default {"name":"","volume":100,"pitch":100}
 * @desc JSON {"name","volume","pitch"}, played from the sound effects folder when OK is pressed. No name, no sound.
 *
 * @param rgssFontSize
 * @text Game's RGSS font size
 * @type number
 * @default 18
 * @desc The keypad's size-28 digits and size-32 keys are drawn in proportion to it.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_GalvKeypad');
    const VARIABLE = Number(params.variable) || 0;
    const MAX_DIGITS = Math.max(1, Number(params.maxDigits) || 4);
    let OK_SE = null;
    try { OK_SE = JSON.parse(params.okSe || 'null'); } catch (_) { OK_SE = null; }
    const RGSS_SIZE = Number(params.rgssFontSize) || 18;

    const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'OK', '0', 'X'];
    const KEYS = 12, OK = 9, ZERO = 10, X = 11;
    const PAD_WIDTH = 185;
    const EXTEND = MAX_DIGITS > 10 ? 20 * (MAX_DIGITS - 10) : 0;
    const fontSize = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;
    const fittingHeight = (lines) => lines * $gameSystem.lineHeight() + $gameSystem.windowPadding() * 2;
    const setResult = (value) => { if (VARIABLE > 0) $gameVariables.setValue(VARIABLE, value); };
    // Returns true, as the cancel sound after it depends on it.
    const leave = (value) => {
        setResult(value);
        if (!SceneManager.isSceneChanging()) SceneManager.pop();
        return true;
    };

    /** The digits typed so far. */
    function Window_RRKeypadNumber() { this.initialize(...arguments); }
    Window_RRKeypadNumber.prototype = Object.create(Window_Base.prototype);
    Window_RRKeypadNumber.prototype.constructor = Window_RRKeypadNumber;
    Window_RRKeypadNumber.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._numeral = '';
        this.refresh();
    };
    Window_RRKeypadNumber.prototype.numeral = function() { return this._numeral; };
    Window_RRKeypadNumber.prototype.add = function(ch) {
        if (this._numeral.length >= MAX_DIGITS) return false;
        this._numeral += ch;
        this.refresh();
        return true;
    };
    /** Deletes the last digit; with none, leaves the keypad with -1. */
    Window_RRKeypadNumber.prototype.back = function() {
        if (!this._numeral.length) return leave(-1);
        this._numeral = this._numeral.slice(0, -1);
        this.refresh();
        return true;
    };
    Window_RRKeypadNumber.prototype.charWidth = function() {
        return Math.ceil(this.textWidth('0')) + 5;
    };
    // The digits sit centred for the full count, so they fill in from the left of that span.
    Window_RRKeypadNumber.prototype.left = function() {
        const width = MAX_DIGITS * this.charWidth();
        return Math.min(Math.floor(this.innerWidth / 2) - Math.floor(width / 2), this.innerWidth - width);
    };
    Window_RRKeypadNumber.prototype.refresh = function() {
        this.contents.clear();
        this.contents.fontSize = fontSize(28);
        this.resetTextColor();
        const cw = this.charWidth(), left = this.left();
        for (let i = 0; i < this._numeral.length; i++) {
            this.contents.drawText(this._numeral[i], left + i * cw - 1, -3, cw + 4, this.lineHeight(), 'left');
        }
    };

    /** The pad: keys 48 px apart with 62 px cursor squares that overlap. */
    function Window_RRKeypad() { this.initialize(...arguments); }
    Window_RRKeypad.prototype = Object.create(Window_Selectable.prototype);
    Window_RRKeypad.prototype.constructor = Window_RRKeypad;
    Window_RRKeypad.prototype.initialize = function(rect, numberWindow) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._numberWindow = numberWindow;
        this._index = 0;
        this.refresh();
        this.refreshCursor();
    };
    Window_RRKeypad.prototype.maxItems = function() { return KEYS; };
    Window_RRKeypad.prototype.maxCols = function() { return 3; };
    Window_RRKeypad.prototype.itemRect = function(index) {
        const step = this.lineHeight() * 2;
        return new Rectangle((index % 3) * step, Math.floor(index / 3) * step, 62, 62);
    };
    Window_RRKeypad.prototype.paint = function() {
        if (!this.contents) return;
        this.contents.clear();
        this.contentsBack.clear();
        this.contents.fontSize = fontSize(32);
        this.resetTextColor();
        for (let i = 0; i < KEYS; i++) {
            const r = this.itemRect(i);
            this.contents.drawText(NUMPAD[i], r.x, r.y, r.width, r.height, 'center');
        }
    };
    /** The digit under the cursor, or '' on OK and X. */
    Window_RRKeypad.prototype.character = function() {
        return this._index < OK || this._index === ZERO ? NUMPAD[this._index] : '';
    };
    Window_RRKeypad.prototype.moveTo = function(index) {
        this._index = index;
        this.refreshCursor();
    };
    Window_RRKeypad.prototype.isCursorMovable = function() { return this.active; };
    // Down and up step a row and wrap only on a fresh press; left and right run
    // through the keys in order, the same.
    Window_RRKeypad.prototype.cursorDown = function(wrap) {
        if (this._index < 9 || wrap) this.moveTo((this._index + 3) % KEYS);
    };
    Window_RRKeypad.prototype.cursorUp = function(wrap) {
        if (this._index > 2 || wrap) this.moveTo((this._index + 9) % KEYS);
    };
    Window_RRKeypad.prototype.cursorRight = function(wrap) {
        if (this._index < X) this.moveTo(this._index + 1);
        else if (wrap) this.moveTo(this._index - X);
    };
    Window_RRKeypad.prototype.cursorLeft = function(wrap) {
        if (this._index > 0) this.moveTo(this._index - 1);
        else if (wrap) this.moveTo(this._index + X);
    };
    Window_RRKeypad.prototype.cursorPagedown = function() {};
    Window_RRKeypad.prototype.cursorPageup = function() {};
    Window_RRKeypad.prototype.processWheelScroll = function() {};
    Window_RRKeypad.prototype.processHandling = function() {
        if (!this.isOpenAndActive()) return;
        if (Input.isRepeated('cancel')) this.processBack();
        if (Input.isTriggered('ok')) this.processOk();
    };
    // The game's mouse: clicks are the OK and Cancel buttons; the pointer never selects.
    Window_RRKeypad.prototype.processTouch = function() {
        if (!this.isOpenAndActive() || !window.rrMouse || !window.rrMouse.isEnabled()) return;
        if (TouchInput.isCancelled()) this.processBack();
        if (TouchInput.isTriggered()) this.processOk();
    };
    Window_RRKeypad.prototype.processBack = function() {
        if (SceneManager.isSceneChanging()) return;
        if (this._numberWindow.back()) SoundManager.playCancel();
    };
    Window_RRKeypad.prototype.processOk = function() {
        if (SceneManager.isSceneChanging()) return;
        const ch = this.character();
        if (ch) {
            if (this._numberWindow.add(ch)) SoundManager.playOk();
            else SoundManager.playBuzzer();
        } else if (this._index === X) {
            SoundManager.playCancel();
            this.callHandler('leave');
        } else if (this._index === OK) {
            if (OK_SE && OK_SE.name) AudioManager.playSe({ name: String(OK_SE.name), volume: Number(OK_SE.volume ?? 100), pitch: Number(OK_SE.pitch ?? 100), pan: 0 });
            this.callHandler('confirm');
        }
    };

    function Scene_RRKeypad() { this.initialize(...arguments); }
    Scene_RRKeypad.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRKeypad.prototype.constructor = Scene_RRKeypad;
    window.Scene_RRKeypad = Scene_RRKeypad;
    Scene_RRKeypad.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const W = Graphics.boxWidth, H = Graphics.boxHeight;
        const y = Math.floor((H - (fittingHeight(4) + fittingHeight(9) + 8)) / 2);
        const numberRect = new Rectangle(Math.floor((W - PAD_WIDTH) / 2) - EXTEND * 0.5, y, PAD_WIDTH + EXTEND, fittingHeight(1));
        this._numberWindow = new Window_RRKeypadNumber(numberRect);
        this.addWindow(this._numberWindow);
        const padRect = new Rectangle(Math.floor((W - PAD_WIDTH) / 2), y + numberRect.height + 8, PAD_WIDTH, fittingHeight(9));
        this._padWindow = new Window_RRKeypad(padRect, this._numberWindow);
        this._padWindow.setHandler('confirm', this.onInputOk.bind(this));
        this._padWindow.setHandler('leave', this.onInputX.bind(this));
        this.addWindow(this._padWindow);
        this._padWindow.activate();
    };
    // An empty entry confirms as 0.
    Scene_RRKeypad.prototype.onInputOk = function() { leave(parseInt(this._numberWindow.numeral(), 10) || 0); };
    Scene_RRKeypad.prototype.onInputX = function() { leave(-1); };

    // The interpreter stops at a scene change and resumes on the first frame back, after the variable is set.
    Game_Interpreter.prototype.rrKeypadInput = function() {
        SceneManager.push(Scene_RRKeypad);
        return true;
    };
})();
