/*:
 * @target MZ
 * @plugindesc Command Help Popup (VX Ace), for imported games
 * @author TheoAllen; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TheoCommandHelp.js
 *
 * In any command list (the main menu, the title, battle, shops, item
 * categories …), pressing the help button (Shift unless the game chose
 * another) over a command the game wrote help for opens a box in the middle
 * of the screen with that help, sized to the text. It stays five seconds
 * (or the game's time) and closes; pressing again restarts it. The help is
 * matched to the command's name exactly, capitals included.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param list
 * @type multiline_string
 * @default {}
 * @desc JSON: { "command name": "help text" }.
 *
 * @param button
 * @default shift
 * @desc The MZ button that shows the help.
 *
 * @param showTime
 * @type number
 * @default 300
 * @desc Frames the help stays open (60 a second).
 *
 * @param rgssFontSize
 * @text Game's RGSS font size
 * @type number
 * @default 18
 * @desc The box is this much taller than its padding (the original sized it by the text's height).
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TheoCommandHelp');
    let LIST = {};
    try { LIST = JSON.parse(params.list || '{}') || {}; } catch (_) { LIST = {}; }
    const BUTTON = String(params.button || 'shift');
    const SHOW_TIME = Number(params.showTime ?? 300);
    const TEXT_HEIGHT = Number(params.rgssFontSize) || 18;
    const has = (name) => typeof name === 'string' && Object.prototype.hasOwnProperty.call(LIST, name);

    /** The help box: closed until shown, then open for SHOW_TIME frames. */
    function Window_RRCommandHelp() { this.initialize(...arguments); }
    Window_RRCommandHelp.prototype = Object.create(Window_Base.prototype);
    Window_RRCommandHelp.prototype.constructor = Window_RRCommandHelp;
    Window_RRCommandHelp.prototype.initialize = function() {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, 1, this.fittingHeight(1)));
        this.openness = 0;
        this._text = '';
        this._showTime = 0;
    };
    Window_RRCommandHelp.prototype.rrShow = function(help) {
        this._text = String(help ?? '');
        this.resizeWindow();
        this.x = Math.floor((Graphics.boxWidth - this.width) / 2);
        this.y = Math.floor((Graphics.boxHeight - this.height) / 2);
        this.drawTextEx(this._text, 0, 0, this.innerWidth);
        this.openness = 0;
        this._showTime = SHOW_TIME;
        this.visible = true;
    };
    // Sized to the text as written (codes and all): its width plus the padding and 2, its height plus three paddings.
    Window_RRCommandHelp.prototype.resizeWindow = function() {
        this.resetFontSettings();
        const pad = this.padding;
        const width = Math.ceil(this.textWidth(this._text)) + pad * 2 + 2;
        const height = TEXT_HEIGHT + pad * 3;
        this.move(this.x, this.y, width, height);
        this.createContents();
    };
    Window_RRCommandHelp.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._showTime > 0) this.open();
        else this.close();
        this._showTime--;
    };
    // The box opens and closes in six frames.
    Window_RRCommandHelp.prototype.updateOpen = function() {
        if (this._opening) { this.openness += 48; if (this.isOpen()) this._opening = false; }
    };
    Window_RRCommandHelp.prototype.updateClose = function() {
        if (this._closing) { this.openness -= 48; if (this.isClosed()) this._closing = false; }
    };
    window.Window_RRCommandHelp = Window_RRCommandHelp;

    // Drawn over every window of the screen the list is on.
    Window_Command.prototype.rrCommandHelp = function() {
        const scene = SceneManager._scene;
        if (!this._rrCommandHelp) this._rrCommandHelp = new Window_RRCommandHelp();
        if (scene && this._rrCommandHelp.parent !== scene) scene.addChild(this._rrCommandHelp);
        return this._rrCommandHelp;
    };
    const _processHandling = Window_Command.prototype.processHandling;
    Window_Command.prototype.processHandling = function() {
        _processHandling.call(this);
        if (!this.isOpenAndActive()) return;
        const name = this.commandName(this.index());
        if (has(name) && Input.isTriggered(BUTTON)) this.rrCommandHelp().rrShow(LIST[name]);
    };
})();
