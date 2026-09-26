/*:
 * @target MZ
 * @plugindesc Blizz-ABS style gradient bars (VX Ace), for imported games
 * @author Blizzard (BlizzArt Gradient Styler); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_BlizzBars.js
 *
 * Gauges drawn as the game's gradient bar script drew them: a slanted bar
 * with a dark and a light edge, the empty part shading into the gauge back
 * colour and the filled part from one colour to the other, in one of seven
 * styles, at a set opacity. HP, MP and TP gauges and the gauges of other
 * ported windows use it.
 *
 * Window_Base.prototype.rrAceGauge(x, y, width, rate, color1, color2) draws
 * one where an Ace window called draw_gauge.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param style
 * @type number
 * @min 0
 * @max 7
 * @default 1
 * @desc 0 draws plain gauges; 1-7 the script's styles.
 *
 * @param opacity
 * @type number
 * @max 255
 * @default 155
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_BlizzBars');
    const STYLE = Number(params.style ?? 1);
    const ALPHA = Math.min(Math.max(Number(params.opacity ?? 155), 0), 255);

    const rgb = (css) => {
        const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(css));
        if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
        const n = String(css).match(/[\d.]+/g);
        return n ? n.slice(0, 3).map(Number) : [0, 0, 0];
    };
    const css = (r, g, b, a) => `rgba(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)},${a / 255})`;

    /**
     * The original's blizz_gradient_bar(x, y, w, color1, color2, color3, rate), with style the
     * script's bar_style minus one (its draw_gauge steps it down before drawing).
     */
    Bitmap.prototype.rrBlizzBar = function(x, y, w, c1, c2, c3, rate, style) {
        rate = Math.min(rate, 1);
        if (!(style >= 0 && style <= 6)) return;
        const [A, B, C] = [rgb(c1), rgb(c2), rgb(c3)];
        const a = ALPHA;
        const styles = [1, 3, 4, 5, 6];
        let offs = 5;
        x += offs;
        if (styles.includes(style)) {
            offs += 2;
            y -= 1;
            if (style === 5 || style === 6) y -= 2; else x += 1;
            w = Math.floor(w / 8) * 8;
        }
        // RGSS fill_rect replaces the pixels, alpha included: a translucent back leaves the window showing through.
        const fill = (fx, fy, fw, fh, c) => { if (fw > 0 && fh > 0) { this.clearRect(fx, fy, fw, fh); this.fillRect(fx, fy, fw, fh, c); } };
        const dot = (px, py, c) => { this.clearRect(px, py, 1, 1); this.fillRect(px, py, 1, 1, c); };
        if (style < 5) {
            for (let i = 0; i < offs + 3; i++) fill(x - i, y + i - 2, w + 3, 1, css(0, 0, 0, 255));
            for (let i = 0; i < offs + 1; i++) fill(x - i, y + i - 1, w + 1, 1, css(255, 255, 255, 255));
            if (style < 2) {
                for (let i = 0; i < w + offs; i++) {
                    const k = i / (w + offs);
                    const oy = i < offs ? offs - i : 0;
                    const off = i < offs ? i : i > w ? w + offs - i : offs;
                    fill(x + i - offs + 1, y + oy - 1, 1, off, css(C[0] * k, C[1] * k, C[2] * k, a));
                }
                const filled = Math.floor(w * rate);
                if (filled >= offs) {
                    for (let i = 0; i < filled + offs; i++) {
                        const k = i / ((w + offs) * rate);
                        const oy = i < offs ? offs - i : 0;
                        const off = i < offs ? i : i > w * rate ? filled + offs - i : offs;
                        fill(x + i - offs + 1, y + oy - 1, 1, off, css(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k, a));
                    }
                } else {
                    for (let i = 0; i < filled; i++) {
                        const k = i / (w * rate);
                        for (let j = 0; j < offs; j++) dot(x + i - j + 1, y + j - 1, css(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k, a));
                    }
                }
            } else {
                for (let i = 0; i < offs; i++) fill(x - i + 1, y + i - 1, w, 1, css(C[0] * i / offs, C[1] * i / offs, C[2] * i / offs, a));
                if (style === 4) {
                    const half = Math.floor(offs / 2);
                    for (let i = 0; i < half + 1; i++) {
                        const k = (i + 1) / half;
                        fill(x - i + 1, y + i - 1, w * rate, 1, css(B[0] * k, B[1] * k, B[2] * k, a));
                        fill(x - offs + i + 2, y + offs - i - 2, w * rate, 1, css(B[0] * k, B[1] * k, B[2] * k, a));
                    }
                } else {
                    for (let i = 0; i < offs; i++) {
                        const k = i / offs;
                        fill(x - i + 1, y + i - 1, w * rate, 1, css(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k, a));
                    }
                }
            }
            if (styles.includes(style)) {
                for (let i = 0; i < w; i++) {
                    if (i % 8 >= 2) continue;
                    for (let j = 0; j < offs; j++) dot(x + i - j + 1, y + j - 1, css(0, 0, 0, a));
                }
            }
        } else {
            fill(x + 1, y - 3, w + 2, 12, css(255, 255, 255, a));
            for (let i = 1; i < 6; i++) {
                fill(x + 2, y + i - 3, w, 12 - i * 2, css(C[0] * i / 5, C[1] * i / 5, C[2] * i / 5, a));
                fill(x + 2, y + i - 3, w * rate, 12 - i * 2, css(B[0] * i / 5, B[1] * i / 5, B[2] * i / 5, a));
            }
            if (style === 5) {
                for (let i = 0; i < Math.floor(w / 8); i++) {
                    fill(x + 2 + i * 8, y - 2, 1, 10, css(0, 0, 0, a));
                    fill(x + 2 + (i + 1) * 8 - 1, y - 2, 1, 10, css(0, 0, 0, a));
                }
            }
        }
    };

    // Ace's draw_gauge(x, y, width, rate, color1, color2): the bar sits at the foot of the line.
    Window_Base.prototype.rrAceGauge = function(x, y, width, rate, color1, color2) {
        if (STYLE >= 1 && STYLE <= 7) {
            this.contents.rrBlizzBar(x, y + this.lineHeight() - 6, width, color1, color2, ColorManager.gaugeBackColor(), rate, STYLE - 1);
            return;
        }
        const gy = y + this.lineHeight() - 8;
        this.contents.fillRect(x, gy, width, 6, ColorManager.gaugeBackColor());
        this.contents.gradientFillRect(x, gy, Math.floor(width * rate), 6, color1, color2);
    };

    if (STYLE >= 1 && STYLE <= 7) {
        Sprite_Gauge.prototype.drawGaugeRect = function(x, y, width, height) {
            const rate = this.gaugeRate();
            this.bitmap.rrBlizzBar(x, y + height - 6, width - 8, this.gaugeColor1(), this.gaugeColor2(), this.gaugeBackColor(), rate, STYLE - 1);
        };
    }
})();
