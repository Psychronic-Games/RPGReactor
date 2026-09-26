/*:
 * @target MZ
 * @plugindesc Global Text Codes (VX Ace), for imported games
 * @author modern algebra; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MaGlobalTextCodes.js
 *
 * Message codes work in every window, not only in messages: a name, a
 * command or any other text drawn with \c[n], \i[n], \v[n], \n[n], \p[n],
 * \g and the rest shows the colour, icon or value, aligned as the plain text
 * would have been. \r[n] stands for a phrase the game defined (in messages
 * too), and \* is dropped.
 *
 * As in the original, every text of two characters or more is drawn this
 * way (unless the game set its codes to manual, where only text carrying \*
 * is): such text is never squeezed to fit its space, it runs on past it,
 * and a colour code inside it stays in effect for the window's next text.
 * The text keeps the window's font, size and colour as they were.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param manual
 * @text Codes only with \*
 * @type boolean
 * @default false
 *
 * @param rcodes
 * @type multiline_string
 * @default {}
 * @desc JSON: { "n": "replacement" } for \r[n].
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_MaGlobalTextCodes');
    const MANUAL = String(params.manual) === 'true';
    let RCODES = {};
    try { RCODES = JSON.parse(params.rcodes || '{}') || {}; } catch (_) { RCODES = {}; }

    const W = Window_Base.prototype;
    const FONT_KEYS = ['fontFace', 'fontSize', 'fontBold', 'fontItalic', 'textColor', 'outlineColor', 'outlineWidth'];

    const _drawText = W.drawText;
    W.drawText = function(text, x, y, maxWidth, align) {
        if (typeof text !== 'string' || text.length < 2 || (MANUAL && !text.includes('\\*')) || !this.contents) {
            return _drawText.apply(this, arguments);
        }
        // The font as it stands is what a reset inside the drawing goes back to.
        const font = {};
        for (const k of FONT_KEYS) font[k] = this.contents[k];
        this._rrGtcFont = font;
        try {
            const width = maxWidth === undefined ? this.contents.width - x : maxWidth;
            let dx = x;
            if (align === 'center' || align === 'right') {
                // Aligned by the first line's width, codes worked out (icons take their room).
                const lineWidth = this.textSizeEx(text.split('\n')[0]).width;
                dx = align === 'center' ? x + Math.floor((width - lineWidth) / 2) : x + width - lineWidth;
            }
            this.drawTextEx(text, dx, y, width);
        } finally {
            this._rrGtcFont = null;
        }
    };

    const _resetFontSettings = W.resetFontSettings;
    W.resetFontSettings = function() {
        _resetFontSettings.call(this);
        if (this._rrGtcFont && this.contents) Object.assign(this.contents, this._rrGtcFont);
    };

    const _convertEscapeCharacters = W.convertEscapeCharacters;
    W.convertEscapeCharacters = function(text) {
        text = String(text ?? '').replace(/\\\*/g, '').replace(/\\[Rr]\[(\d+)\]/g, (_, n) => String(RCODES[Number(n)] ?? ''));
        return _convertEscapeCharacters.call(this, text);
    };
})();
