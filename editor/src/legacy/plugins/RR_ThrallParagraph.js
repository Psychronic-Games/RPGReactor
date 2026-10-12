/*:
 * @target MZ
 * @plugindesc Paragraph Formatter 2.0 (VX), for imported games
 * @author modern algebra (rmrk.net); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallParagraph.js
 *
 * Breaks a long text into lines that fit a width and justifies them: the
 * space left on a line is shared out between its letters (not its words),
 * the last line and a line ended by a line break are not stretched. Lines
 * are the font size + 4 apart, closer if the height does not fit them.
 *
 * For other ports: bitmap.rrDrawParagraph(x, y, width, height, text) draws
 * into a bitmap as the script's draw_paragraph did; RRParagrapher.format and
 * RRParagrapher.draw are its two halves. Nothing in the game's own scripts
 * calls it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    // RGSS sizes a font by its cell, the browser by its em: the script's "font size + 4" in the game's units.
    const rubySize = (bitmap) => {
        const base = typeof $gameSystem !== 'undefined' && $gameSystem ? $gameSystem.mainFontSize() : bitmap.fontSize;
        return Math.round(bitmap.fontSize * 20 / (base || bitmap.fontSize));
    };

    /** Formatter#format: the lines (each an array of letters) and the gap to add after each letter. */
    function format(string, bitmap, maxWidth) {
        string = String(string);
        const lines = [], blank = [];
        let lineBreak = 0, lastWord = 0;
        const width = (s) => bitmap.measureTextWidth(s);
        const nextLine = (last) => {
            const line = string.substr(lineBreak, last - lineBreak);
            lines.push(Array.from(line).filter(c => c !== '\n'));
            blank.push((maxWidth - width(line)) / (line.length - 1));
            lineBreak = last + 1;
        };
        for (let i = 0; i < string.length; i++) {
            const c = string[i];
            if (c === '\n' || c === ' ' || i === string.length - 1) {
                let j = i;
                if (i === string.length - 1) j += 1;
                if (width(string.substr(lineBreak, j - lineBreak)) > maxWidth) nextLine(lastWord);
                if (c === '\n') { nextLine(j); blank[blank.length - 1] = 0; }
                lastWord = j;
            }
        }
        lines.push(Array.from(string.substr(lineBreak)).filter(c => c !== '\n'));
        blank.push(0);
        return { lines, blank };
    }

    /** Artist#draw: each letter at its place, justified. */
    function draw(f, bitmap, x = 0, y = 0, height = bitmap.height, justify = true) {
        let distance = height / f.lines.length;
        distance = Math.min(rubySize(bitmap) + 4, distance);
        f.lines.forEach((line, i) => {
            let position = 0;
            for (const ch of line) {
                const tw = bitmap.measureTextWidth(ch);
                bitmap.drawText(ch, x + position, y + distance * i, tw + 2, distance);
                position += tw;
                if (justify) position += f.blank[i];
            }
        });
        return bitmap;
    }

    Bitmap.prototype.rrDrawParagraph = function(x, y, maxWidth, maxHeight, string) {
        const f = format(string, this, maxWidth);
        draw(f, this, x, y, maxHeight);
    };
    window.RRParagrapher = { format, draw };
})();
