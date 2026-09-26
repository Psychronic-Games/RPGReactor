/*:
 * @target MZ
 * @plugindesc HMS: Choice Display Mode (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ChoiceDisplayMode.js
 *
 * In embed mode, choices are listed inside the message window, under the
 * text, indented, with no frame of their own; in default mode they have their
 * own window, as usual. With the scroll patch, an embedded list shows three
 * rows and scrolls.
 *   $gameMessage.rrChoiceDisplayMode = "embed" | "default"
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param mode
 * @type select
 * @option embed
 * @option default
 * @default embed
 *
 * @param indent
 * @type number
 * @default 36
 *
 * @param rows
 * @text Visible rows (0 = all)
 * @type number
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ChoiceDisplayMode');
    const MODE = params.mode === 'default' ? 'default' : 'embed';
    const INDENT = Number(params.indent ?? 36);
    const ROWS = Number(params.rows) || 0;

    Object.defineProperty(Game_Message.prototype, 'rrChoiceDisplayMode', {
        get() { return this._rrChoiceDisplayMode || MODE; },
        set(value) { this._rrChoiceDisplayMode = String(value).replace(/^:/, ''); },
        configurable: true
    });
    const embedded = () => $gameMessage.rrChoiceDisplayMode === 'embed';

    // Where the text reached: the line after the last one drawn, as the original read the text state.
    const _onEndOfText = Window_Message.prototype.onEndOfText;
    Window_Message.prototype.onEndOfText = function() {
        const ts = this._textState;
        this._rrTextEndY = ts && ts.text && ts.text.trim() ? ts.y + ts.height : 0;
        _onEndOfText.call(this);
    };

    const _updatePlacement = Window_ChoiceList.prototype.updatePlacement;
    Window_ChoiceList.prototype.updatePlacement = function() {
        _updatePlacement.call(this);
        if (!embedded() || !this._messageWindow) return;
        const mw = this._messageWindow;
        const count = $gameMessage.choices().length;
        this.x = mw.x + mw.newLineX({ rtl: false }) + INDENT;
        this.width = Math.min(this.width, Graphics.boxWidth - this.x);
        this.y = mw.y + ($gameMessage.hasText() ? mw._rrTextEndY || 0 : 0);
        this.height = this.fittingHeight(ROWS > 0 ? ROWS : count);
    };
    const _updateBackground = Window_ChoiceList.prototype.updateBackground;
    Window_ChoiceList.prototype.updateBackground = function() {
        _updateBackground.call(this);
        if (embedded()) this.opacity = 0;
    };
    const _contentsHeight = Window_ChoiceList.prototype.contentsHeight;
    Window_ChoiceList.prototype.contentsHeight = function() {
        if (!embedded() || ROWS <= 0) return _contentsHeight.call(this);
        return Math.max(this.maxItems(), ROWS) * this.itemHeight();
    };
})();
