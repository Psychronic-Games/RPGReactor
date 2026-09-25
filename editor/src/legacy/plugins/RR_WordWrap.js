/*:
 * @target MZ
 * @plugindesc Word Wrapping Message Boxes (VX Ace), for imported games
 * @author KilloZapit; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_WordWrap.js
 *
 * Text drawn in any window wraps at the word that would run past the right
 * edge. Text codes:
 *   \ww  word wrap on          \nw   word wrap off
 *   \ws  line breaks as spaces \nl   line breaks kept
 *   \cs  collapse spaces       \pre  keep spaces
 *   \br  line break            \rm[n] right margin in pixels
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param wordwrap
 * @text Wrap by default
 * @type boolean
 * @default true
 *
 * @param whitespace
 * @text Line breaks as spaces by default
 * @type boolean
 * @default false
 *
 * @param collapse
 * @text Collapse spaces by default
 * @type boolean
 * @default true
 *
 * @param rightMargin
 * @text Right margin
 * @type number
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_WordWrap');
    const flag = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const DEFAULTS = {
        wordwrap: flag(params.wordwrap, true),
        whitespace: flag(params.whitespace, false),
        collapse: flag(params.collapse, true),
        rightMargin: Number(params.rightMargin) || 0
    };
    const ICON_WIDTH = () => ImageManager.iconWidth + 4;

    const state = (textState) => {
        if (!textState.rrWrap) textState.rrWrap = Object.assign({ last: '\n' }, DEFAULTS);
        return textState.rrWrap;
    };

    // The next word's width, with the codes that draw nothing taken out and icons counted.
    Window_Base.prototype.rrNextWordWidth = function(c, textState) {
        let word = textState.text.slice(textState.index).split(/[\s\n\f]/, 1)[0] || '';
        let icons = 0;
        if (word.includes('\x1b')) {
            word = word.split(/\x1b[OC]+\[\d*\]/i).join('');
            word = word.split(/\x1b[.|^<>!]/).join('');
            word = word.split(/\x1b[^IH]+/i, 1)[0] || '';
            word = word.replace(/\x1b[IH]+\[[\d,]*\]/gi, () => { icons++; return ''; });
        }
        return this.textWidth(c + word) + icons * ICON_WIDTH();
    };

    Window_Base.prototype.rrWrapLimit = function(textState) {
        return this.contentsWidth() - state(textState).rightMargin;
    };

    const _processCharacter = Window_Base.prototype.processCharacter;
    Window_Base.prototype.processCharacter = function(textState) {
        const wrap = state(textState);
        let c = textState.text[textState.index];
        if (wrap.whitespace && c === '\n') {
            textState.text = textState.text.slice(0, textState.index) + ' ' + textState.text.slice(textState.index + 1);
            c = ' ';
        }
        if (wrap.wordwrap && (c === ' ' || c === '\t') && !textState.rtl) {
            textState.index++;
            this.flushTextState(textState);
            if (wrap.collapse && /[\s\n\f]/.test(wrap.last)) c = '';
            if (textState.x + this.rrNextWordWidth(c, textState) > this.rrWrapLimit(textState)) {
                this.processNewLine(textState);
                wrap.last = '\n';
                return;
            }
            textState.buffer += c;
            wrap.last = c;
            return;
        }
        wrap.last = c;
        _processCharacter.call(this, textState);
    };

    const _processEscapeCharacter = Window_Base.prototype.processEscapeCharacter;
    Window_Base.prototype.processEscapeCharacter = function(code, textState) {
        const wrap = state(textState);
        switch (code) {
            case 'WW': wrap.wordwrap = true; break;
            case 'NW': wrap.wordwrap = false; break;
            case 'WS': wrap.whitespace = true; break;
            case 'NL': wrap.whitespace = false; break;
            case 'CS': wrap.collapse = true; break;
            case 'PRE': wrap.collapse = false; break;
            case 'BR': this.processNewLine(textState); wrap.last = '\n'; break;
            case 'RM': wrap.rightMargin = this.obtainEscapeParam(textState); break;
            default: _processEscapeCharacter.call(this, code, textState);
        }
        // A code that widens what follows (a larger font, an icon) can push the word onto the next line.
        if (textState.x + this.rrNextWordWidth('', textState) > this.contentsWidth()) {
            this.flushTextState(textState);
            this.processNewLine(textState);
        }
    };
})();
