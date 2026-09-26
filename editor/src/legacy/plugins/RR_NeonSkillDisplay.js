/*:
 * @target MZ
 * @plugindesc Skill Display (VX Ace), for imported games
 * @author Neon Black; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_NeonSkillDisplay.js
 *
 * The battle log becomes one centred line near the top of the screen: the
 * name (and icon) of the skill or item being used on a black band that fades
 * out to both sides, in place of the usage messages. Counters, reflections
 * and substitutes show their word there too. The other log messages (damage,
 * states) are no longer shown; the line stays until the action ends, and the
 * log's pauses take the game's action speed (0: none).
 *
 * Other ports add lines through the log's queue:
 *   log.push('rrAddPopLine', text or item)
 *   log.push('rrAddPopArray', iconIndex, text)
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param counterText
 * @default Counter-Attack!
 * @desc Empty shows nothing; "null" turns the counter line off.
 * @param reflectText
 * @default Reflect
 * @param substituteText
 * @default Protect
 * @param offsetX
 * @type number
 * @min -9999
 * @default 0
 * @param offsetY
 * @type number
 * @min -9999
 * @default 55
 * @param backColor
 * @default [0,0,0,255]
 * @desc JSON [red, green, blue, alpha].
 * @param backPicture
 * @type file
 * @dir img/pictures
 * @default
 * @param actionSpeed
 * @text Log pause (frames)
 * @type number
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_NeonSkillDisplay');
    const json = (t, d) => { try { return JSON.parse(t) ?? d; } catch (_) { return d; } };
    const num = (key, d) => (params[key] === undefined || params[key] === '' ? d : Number(params[key]));
    // "null" is the original's nil: that line is never shown.
    const word = (key, d) => (params[key] === undefined ? d : params[key] === 'null' ? null : String(params[key]));
    const COUNTER = word('counterText', 'Counter-Attack!'), REFLECT = word('reflectText', 'Reflect'), SUB = word('substituteText', 'Protect');
    const X_OFFSET = num('offsetX', 0), Y_OFFSET = num('offsetY', 55);
    const BACK = json(params.backColor || '', [0, 0, 0, 255]);
    const BACK_PIC = String(params.backPicture || '');
    const ACTION_SPEED = num('actionSpeed', 0);
    const rgba = (a) => `rgba(${a[0]},${a[1]},${a[2]},${(a[3] ?? 255) / 255})`;

    // One line, the full width, at the offsets.
    Scene_Battle.prototype.logWindowRect = function() {
        return new Rectangle(X_OFFSET, Y_OFFSET, Graphics.boxWidth, this.calcWindowHeight(1, false));
    };

    const L = Window_BattleLog.prototype;
    L.maxLines = function() { return 1; };
    L.messageSpeed = function() { return ACTION_SPEED; };
    L.rrPopWind = function() {
        if (!this._rrPopWind) this._rrPopWind = [];
        return this._rrPopWind;
    };
    const _initialize = L.initialize;
    L.initialize = function(rect) {
        this._rrPopWind = [];
        _initialize.call(this, rect);
        this.rrCreateBackgroundPicture();
    };
    // The picture sits centred on the window, shown only while a line is up.
    L.rrCreateBackgroundPicture = function() {
        this._rrBackPicSprite = new Sprite();
        if (!BACK_PIC) return;
        const sprite = this._rrBackPicSprite;
        sprite.bitmap = ImageManager.loadPicture(BACK_PIC);
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0.5;
        sprite.x = this.width / 2;
        sprite.y = this.height / 2;
        sprite.visible = false;
        this.addChildToBack(sprite);
    };
    const _clear = L.clear;
    L.clear = function() {
        this.rrPopWind().length = 0;
        _clear.call(this);
    };
    L.refresh = function() {
        if (!BACK_PIC) this.drawBackground();
        this.contents.clear();
        if (this._rrBackPicSprite) this._rrBackPicSprite.visible = false;
        const pop = this.rrPopWind();
        if (!pop.length) return;
        this.openness = 255;
        if (this._rrBackPicSprite) this._rrBackPicSprite.visible = true;
        const last = pop[pop.length - 1], cw = this.contents.width;
        if (typeof last === 'string') {
            this.drawText(last, 0, 0, cw, 'center');
        } else if (Array.isArray(last)) {
            const x = Math.floor((cw - (this.textWidth(last[1]) + 24)) / 2);
            this.drawIcon(last[0], x, 0);
            this.resetTextColor();
            this.drawText(last[1], x + 24, 0, cw, 'left');
        } else {
            const x = Math.floor((cw - (this.textWidth(last.name) + 24)) / 2);
            this.rrAceDrawItemName(last, x, 0);
        }
    };
    // The band behind the line, as wide as its text (and icon), fading out over 64 pixels to each side.
    L.drawBackground = function() {
        const back = this.contentsBack;
        back.clear();
        const rect = this.backRect();
        if (rect.height <= 0) return;
        const color = rgba(BACK), none = rgba([BACK[0], BACK[1], BACK[2], 0]);
        back.fillRect(rect.x, rect.y, rect.width, rect.height, color);
        back.gradientFillRect(rect.x - 64, rect.y, 64, rect.height, none, color);
        back.gradientFillRect(rect.x + rect.width, rect.y, 64, rect.height, color, none);
    };
    L.backRect = function() {
        const pop = this.rrPopWind(), pad = this.padding;
        let i = this.width;
        if (pop.length) {
            const last = pop[pop.length - 1];
            if (Array.isArray(last)) i = this.textWidth(last[1]) + 24;
            else i = this.textWidth(typeof last === 'string' ? last : last.name) + (typeof last === 'string' ? 0 : 24);
        }
        // The window's own coordinates (the band is centred on the whole window), moved into the contents.
        return new Rectangle(Math.floor((this.width - i) / 2) - pad, 0, i, pop.length ? this.lineHeight() : 0);
    };
    /** Adds a line: a string, or a skill or item shown with its icon. Empty and nameless ones are dropped. */
    L.rrAddPopLine = function(item) {
        const pop = this.rrPopWind();
        if (item !== null && item !== undefined && item !== '') pop.push(item);
        if (typeof item !== 'string' && item && item.name === '') pop.pop();
        this.refresh();
    };
    L.rrAddPopArray = function(icon = 0, text = '') {
        if (text !== '') this.rrPopWind().push([icon, text]);
        this.refresh();
    };

    // The name of what is used, in place of the usage messages.
    L.displayAction = function(subject, item) {
        this.push('rrAddPopLine', item);
    };
    L.displayCounter = function(target) {
        this.push('performCounter', target);
        if (COUNTER === null) return;
        this.push('rrAddPopLine', COUNTER);
        this.push('wait');
    };
    L.displayReflection = function(target) {
        this.push('performReflection', target);
        if (REFLECT === null) return;
        this.push('rrAddPopLine', REFLECT);
        this.push('wait');
    };
    L.displaySubstitute = function(substitute, target) {
        this.push('performSubstitute', substitute, target);
        if (SUB === null) return;
        this.push('rrAddPopLine', SUB);
        this.push('wait');
    };
})();
