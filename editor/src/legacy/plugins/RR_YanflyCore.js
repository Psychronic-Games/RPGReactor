/*:
 * @target MZ
 * @plugindesc Ace Core Engine colours and text (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyCore.js
 *
 * The parts of Yanfly's Ace Core Engine that change how every window looks:
 * which window-skin colour each kind of text uses, how faint a disabled
 * item is, and numbers grouped with commas. The screen size and the default
 * font are converted by the import itself.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param colours
 * @text Text colours
 * @type multiline_string
 * @default {}
 * @desc JSON: colour role → window-skin colour number, e.g. {"system":8}.
 *
 * @param transparency
 * @text Disabled item opacity
 * @type number
 * @max 255
 * @default 160
 *
 * @param groupDigits
 * @text Group digits with commas
 * @type boolean
 * @default false
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyCore');
    let COLOURS = {};
    try { COLOURS = JSON.parse(params.colours || '{}') || {}; } catch (_) { COLOURS = {}; }
    const TRANSPARENCY = params.transparency === undefined || params.transparency === '' ? 160 : Number(params.transparency);
    const GROUP_DIGITS = String(params.groupDigits) === 'true';

    const ROLES = {
        normal: 'normalColor', system: 'systemColor', crisis: 'crisisColor', knockout: 'deathColor',
        gauge_back: 'gaugeBackColor', hp_gauge1: 'hpGaugeColor1', hp_gauge2: 'hpGaugeColor2',
        mp_gauge1: 'mpGaugeColor1', mp_gauge2: 'mpGaugeColor2', mp_cost: 'mpCostColor',
        power_up: 'powerUpColor', power_down: 'powerDownColor',
        tp_gauge1: 'tpGaugeColor1', tp_gauge2: 'tpGaugeColor2', tp_cost: 'tpCostColor'
    };
    for (const [role, method] of Object.entries(ROLES)) {
        const n = Number(COLOURS[role]);
        if (!Number.isInteger(n) || typeof ColorManager[method] !== 'function') continue;
        ColorManager[method] = function() { return this.textColor(n); };
    }

    Window_Base.prototype.translucentOpacity = function() { return TRANSPARENCY; };

    if (GROUP_DIGITS) {
        const group = (value) => String(value).replace(/^(-?\d+)/, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
        Window_Base.prototype.drawCurrencyValue = function(value, unit, x, y, width) {
            const unitWidth = Math.min(80, this.textWidth(unit));
            this.resetTextColor();
            this.drawText(group(value), x, y, width - unitWidth - 6, 'right');
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(unit, x + width - unitWidth, y, unitWidth, 'right');
        };
    }
})();
