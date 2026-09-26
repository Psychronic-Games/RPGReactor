/*:
 * @target MZ
 * @plugindesc HP Color Controller (VX Ace), for imported games
 * @author FSE; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HpColorController.js
 *
 * HP numbers and bars change colour in three steps: normal, low and
 * critical, at the rates the game set, with their own colour for a knocked
 * out actor. HP exactly at the critical rate counts as normal, as it did in
 * the original.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param lowHp
 * @type number
 * @decimals 2
 * @default 0.3
 *
 * @param critHp
 * @type number
 * @decimals 2
 * @default 0.15
 *
 * @param compat
 * @text Keep the default bar colours
 * @type boolean
 * @default false
 *
 * @param colours
 * @type multiline_string
 * @default {}
 * @desc JSON: role → window-skin colour number (low_hp_text, hp_crisis, hp_ko, hp_gaugenormal1 …).
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HpColorController');
    const LOW = Number(params.lowHp || 0.3), CRIT = Number(params.critHp || 0.15);
    const COMPAT = String(params.compat) === 'true';
    let COLOURS = {};
    try { COLOURS = JSON.parse(params.colours || '{}') || {}; } catch (_) { COLOURS = {}; }
    const DEFAULTS = { low_hp_text: 2, hp_crisis: 18, hp_ko: 15, hp_gaugenormal1: 11, hp_gaugenormal2: 3, hp_gaugelow1: 20, hp_gaugelow2: 6, hp_gaugecri1: 18, hp_gaugecri2: 2 };
    const colour = (role) => ColorManager.textColor(Number(COLOURS[role] ?? DEFAULTS[role]));
    const crit = (a) => a.hp < a.mhp * CRIT;
    const low = (a) => a.hp > a.mhp * CRIT && a.hp < a.mhp * LOW;

    Object.assign(Window_Base.prototype, {
        rrAceHpBarColor1(actor) {
            if (crit(actor)) return colour('hp_gaugecri1');
            if (low(actor)) return colour('hp_gaugelow1');
            return COMPAT ? ColorManager.hpGaugeColor1() : colour('hp_gaugenormal1');
        },
        rrAceHpBarColor2(actor) {
            if (crit(actor)) return colour('hp_gaugecri2');
            if (low(actor)) return colour('hp_gaugelow2');
            return COMPAT ? ColorManager.hpGaugeColor2() : colour('hp_gaugenormal2');
        },
        rrAceHpColor(actor) {
            if (actor.hp === 0) return colour('hp_ko');
            if (crit(actor)) return colour('hp_crisis');
            if (low(actor)) return colour('low_hp_text');
            return ColorManager.normalColor();
        },
        rrAceDrawActorHp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.hpRate(), this.rrAceHpBarColor1(actor), this.rrAceHpBarColor2(actor));
            this.changeTextColor(ColorManager.systemColor());
            const cy = Math.trunc(($gameSystem.mainFontSize() - this.contents.fontSize) / 2) + 1;
            this.drawText(TextManager.hpA, x + 2, y + cy, 30);
            this.rrAceDrawCurrentAndMaxValues(x, y + cy, width, actor.hp, actor.mhp, this.rrAceHpColor(actor), ColorManager.normalColor());
        }
    });
})();
