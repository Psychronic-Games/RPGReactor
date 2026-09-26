/*:
 * @target MZ
 * @plugindesc Icons for HP, MP, TP and EXP (VX Ace), for imported games
 * @author Soulpour777; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_StatusIcons.js
 *
 * HP, MP and TP gauges are labelled with an icon instead of their name, and
 * TP shows its maximum as HP and MP do.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param hpIcon
 * @type number
 * @default 0
 *
 * @param mpIcon
 * @type number
 * @default 0
 *
 * @param tpIcon
 * @type number
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_StatusIcons');
    const HP = Number(params.hpIcon) || 0, MP = Number(params.mpIcon) || 0, TP = Number(params.tpIcon) || 0;
    Object.assign(Window_Base.prototype, {
        rrAceDrawActorHp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.hpRate(), ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2());
            this.drawIcon(HP, x, y);
            this.rrAceDrawCurrentAndMaxValues(x, y, width, actor.hp, actor.mhp, this.rrAceHpColor(actor), ColorManager.normalColor());
        },
        rrAceDrawActorMp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.mpRate(), ColorManager.mpGaugeColor1(), ColorManager.mpGaugeColor2());
            this.drawIcon(MP, x, y);
            this.rrAceDrawCurrentAndMaxValues(x, y, width, actor.mp, actor.mmp, this.rrAceMpColor(actor), ColorManager.normalColor());
        },
        rrAceDrawActorTp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.tpRate(), ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2());
            this.drawIcon(TP, x, y);
            this.rrAceDrawCurrentAndMaxValues(x, y, width, Math.floor(actor.tp), actor.maxTp(), this.rrAceTpColor(actor), ColorManager.normalColor());
        }
    });
})();
