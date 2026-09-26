/*:
 * @target MZ
 * @plugindesc EXP gauge (VX Ace), for imported games
 * @author Rbahamut; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_RbahamutExp.js
 *
 * The menu's party list shows each actor's HP, MP and TP gauges one under
 * the other and an EXP gauge below them, filled by the progress through the
 * current level and labelled with the experience still needed ("------------"
 * at the top level).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    Object.assign(Window_Base.prototype, {
        rrAceExpGauge(x, y, width, rate, color1, color2) {
            const gy = y + this.lineHeight() - 8;
            this.contents.fillRect(x, gy, width, 6, ColorManager.textColor(19));
            this.contents.gradientFillRect(x, gy, Math.floor(width * rate), 6, color1, color2);
        },
        rrAceDrawExp(actor, x, y, width = 112) {
            x += 5;
            const c1 = ColorManager.textColor(26), c2 = ColorManager.textColor(27);
            const top = actor.isMaxLevel();
            if (top) this.rrAceExpGauge(x, y - 1, width, 1, c1, c2);
            else {
                const base = actor.currentLevelExp();
                this.rrAceGauge(x, y - 1, width, (actor.currentExp() - base) / (actor.nextLevelExp() - base), c1, c2);
            }
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('EXP', x, y - 1, 60);
            this.resetTextColor();
            this.drawText(top ? '------------' : actor.nextLevelExp() - actor.currentExp(), x + width - 72, y - 1, 72, 'right');
        },
        // Rows at fractions of a line, cut to whole pixels.
        rrAceDrawActorSimpleStatus(actor, x, y) {
            const at = (n) => Math.trunc(y + this.lineHeight() * n);
            this.rrAceDrawActorName(actor, x, at(-0.3));
            this.rrAceDrawActorLevel(actor, x, at(0.7));
            this.rrAceDrawActorIcons(actor, x, at(1.7));
            this.rrAceDrawActorClass(actor, x + 120, at(-0.3));
            this.rrAceDrawActorHp(actor, x + 120, at(0.7));
            this.rrAceDrawActorMp(actor, x + 120, at(1.7));
            this.rrAceDrawActorTp(actor, x + 120, at(2.7));
            this.rrAceDrawExp(actor, x - 4, Math.trunc(y + 1 + this.lineHeight() * 2.7));
        }
    });
})();
