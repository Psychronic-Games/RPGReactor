/*:
 * @target MZ
 * @plugindesc Ace Core Engine colours and text (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyCore.js
 *
 * The parts of Yanfly's Ace Core Engine that change how the game looks and runs:
 * which window-skin colour each kind of text uses, how faint a disabled
 * item is, numbers grouped with commas, gauges, and how far from the screen
 * events keep moving on their own, how fast animations play, and troop positions moved onto the
 * larger screen. The screen size and the default
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
 *
 * @param gaugeHeight
 * @type number
 * @default 6
 *
 * @param gaugeOutline
 * @type boolean
 * @default true
 *
 * @param animationRate
 * @text Frames per animation frame
 * @type number
 * @default 4
 *
 * @param hpCrisis
 * @text HP crisis rate
 * @type number
 * @decimals 2
 * @default 0.25
 *
 * @param mpCrisis
 * @text MP crisis rate
 * @type number
 * @decimals 2
 * @default 0.25
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyCore');
    let COLOURS = {};
    try { COLOURS = JSON.parse(params.colours || '{}') || {}; } catch (_) { COLOURS = {}; }
    const TRANSPARENCY = params.transparency === undefined || params.transparency === '' ? 160 : Number(params.transparency);
    const GROUP_DIGITS = String(params.groupDigits) === 'true';
    const GAUGE_HEIGHT = Number(params.gaugeHeight) || 6;
    const ANIMATION_RATE = Number(params.animationRate) || 4;
    Sprite_AnimationMV.prototype.setupRate = function() { this._rate = ANIMATION_RATE; };
    const GAUGE_OUTLINE = String(params.gaugeOutline) !== 'false';
    const HP_CRISIS = params.hpCrisis === undefined || params.hpCrisis === '' ? 0.25 : Number(params.hpCrisis);
    const MP_CRISIS = params.mpCrisis === undefined || params.mpCrisis === '' ? 0.25 : Number(params.mpCrisis);

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

    const group = (value) => (GROUP_DIGITS ? String(value).replace(/^(-?\d+)/, (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')) : String(value));

    // The Ace drawing methods (RR_AceCompat) as the engine redrew them.
    if (typeof Window_Base.prototype.rrAceGauge === 'function') Object.assign(Window_Base.prototype, {
        rrAceGroup: group,
        rrAceHpColor(actor) {
            if (actor.hp === 0) return ColorManager.deathColor();
            if (actor.hp < actor.mhp * HP_CRISIS) return ColorManager.crisisColor();
            return ColorManager.normalColor();
        },
        rrAceMpColor(actor) { return actor.mp < actor.mmp * MP_CRISIS ? ColorManager.crisisColor() : ColorManager.normalColor(); },
        rrAceGauge(x, y, width, rate, color1, color2) {
            if (GAUGE_OUTLINE) width -= 2;
            const fill = Math.min(Math.floor(width * rate), width);
            const gy = y + this.lineHeight() - 2 - GAUGE_HEIGHT;
            if (GAUGE_OUTLINE) {
                this.contents.paintOpacity = TRANSPARENCY;
                this.contents.fillRect(x, gy - 1, width + 2, GAUGE_HEIGHT + 2, ColorManager.gaugeBackColor());
                this.contents.paintOpacity = 255;
                x += 1;
            }
            this.contents.fillRect(x, gy, width, GAUGE_HEIGHT, ColorManager.gaugeBackColor());
            this.contents.gradientFillRect(x, gy, fill, GAUGE_HEIGHT, color1, color2);
        },
        rrAceDrawActorLevel(actor, x, y) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.levelA, x, y, 32);
            this.resetTextColor();
            this.drawText(group(actor.level), x + 32, y, 24, 'right');
        },
        // The numbers fill the width after the HP term (the full one, not the abbreviation): max on the right, current before
        // it, or only the current when both and the term do not fit.
        rrAceDrawCurrentAndMaxValues(x, y, width, current, max, color1, color2) {
            const total = group(current) + '/' + group(max);
            const label = this.textWidth(TextManager.hp);
            if (width < this.textWidth(total) + label) {
                this.changeTextColor(color1);
                this.drawText(group(current), x, y, width, 'right');
                return;
            }
            const xr = x + label;
            width -= label;
            this.changeTextColor(color2);
            const text = '/' + group(max);
            this.drawText(text, xr, y, width, 'right');
            width -= this.textWidth(text);
            this.changeTextColor(color1);
            this.drawText(group(current), xr, y, width, 'right');
        },
        rrAceDrawActorTp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.tpRate(), ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2());
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.tpA, x, y, 30);
            this.changeTextColor(this.rrAceTpColor(actor));
            this.drawText(group(Math.floor(actor.tp)), x + width - 42, y, 42, 'right');
        },
        rrAceDrawActorParam(actor, x, y, paramId) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.param(paramId), x, y, 120);
            this.resetTextColor();
            this.drawText(group(actor.param(paramId)), x + 120, y, 36, 'right');
        },
        rrAceDrawCurrencyValue(value, unit, x, y, width) {
            const cx = this.textWidth(unit);
            this.resetTextColor();
            this.drawText(group(value), x, y, width - cx - 2, 'right');
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(unit, x, y, width, 'right');
        },
        rrAceDrawActorSimpleStatus(actor, x, y) {
            const lh = this.lineHeight(), w = this.contents.width - x - 124;
            this.rrAceDrawActorName(actor, x, y);
            this.rrAceDrawActorLevel(actor, x, y + lh);
            this.rrAceDrawActorIcons(actor, x, y + lh * 2);
            this.rrAceDrawActorClass(actor, x + 120, y, w);
            this.rrAceDrawActorHp(actor, x + 120, y + lh, w);
            this.rrAceDrawActorMp(actor, x + 120, y + lh * 2, w);
        }
    });

    // Events move on their own within 5 tiles short of a screen in each direction of the screen's centre tile.
    Game_Event.prototype.isNearTheScreen = function() {
        const tw = $gameMap.tileWidth(), th = $gameMap.tileHeight();
        const dx = Math.floor(Math.min(Graphics.width, $gameMap.width() * 256) / tw) - 5;
        const dy = Math.floor(Math.min(Graphics.height, $gameMap.height() * 256) / th) - 5;
        const ax = $gameMap.adjustX(this._realX) - Math.floor(Graphics.width / 2 / tw);
        const ay = $gameMap.adjustY(this._realY) - Math.floor(Graphics.height / 2 / th);
        return ax >= -dx && ax <= dx && ay >= -dy && ay <= dy;
    };

    // Troop positions were laid out on VX Ace's 544×416 screen: across they are centred on the wider
    // screen, down they move by the whole extra height.
    const _troopSetup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _troopSetup.call(this, troopId);
        const dx = Math.floor((Graphics.width - 544) / 2), dy = Graphics.height - 416;
        for (const enemy of this._enemies) { enemy._screenX += dx; enemy._screenY += dy; }
    };

    if (GROUP_DIGITS) {
        Window_Base.prototype.drawCurrencyValue = function(value, unit, x, y, width) {
            const unitWidth = Math.min(80, this.textWidth(unit));
            this.resetTextColor();
            this.drawText(group(value), x, y, width - unitWidth - 6, 'right');
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(unit, x + width - unitWidth, y, unitWidth, 'right');
        };
    }
})();
