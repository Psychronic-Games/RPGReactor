/*:
 * @target MZ
 * @plugindesc Sleek Item Popup (VX Ace), for imported games
 * @author V.M of D.T (Vlue); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VlueItemPopup.js
 *
 * A small frameless popup above the player naming an item gained or lost:
 * its icon, the name typed in one letter every two frames, and the amount in
 * green (gain) or red (loss), hidden for exactly 1 in compact mode. It fades
 * in, stays about 90 frames, fades out; popups queue and show one at a time,
 * on the map only. A sound plays as each one appears.
 *   this.rrPopup(type, id, amount, duration, nosound)
 * type 0 item, 1 weapon, 2 armor, 3 gold (id unused). The duration is taken
 * and ignored: the original always shows 90 frames. A fifth argument other
 * than false or null silences the sound, as it did in the original.
 * Change Gold / Items / Weapons / Armors show one automatically while
 * window.rrPuAutomaticPopup is true ($PU_AUTOMATIC_POPUP in the game).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param soundGain
 * @type struct<Se>
 * @default {"name":"OK","volume":"100","pitch":"100"}
 *
 * @param soundLose
 * @type struct<Se>
 * @default {"name":"Cancel","volume":"100","pitch":"50"}
 *
 * @param goldGain
 * @type struct<Se>
 * @default {"name":"shop","volume":"100","pitch":"100"}
 *
 * @param goldLose
 * @type struct<Se>
 * @default {"name":"shop","volume":"100","pitch":"50"}
 *
 * @param useAnimation
 * @type boolean
 * @default false
 *
 * @param animationId
 * @type animation
 * @default 0
 *
 * @param fadeIn
 * @type number
 * @min 1
 * @default 5
 *
 * @param fadeOut
 * @type number
 * @min 1
 * @default 5
 *
 * @param defaultDuration
 * @type number
 * @default 5
 *
 * @param automatic
 * @type boolean
 * @default true
 *
 * @param useCustomFont
 * @type boolean
 * @default false
 *
 * @param customFont
 * @type multiline_string
 * @default {}
 * @desc JSON: { name, size, color: [r,g,b,a], bold, italic, outline }, sizes in RGSS units.
 *
 * @param compact
 * @type boolean
 * @default true
 *
 * @param useBackgroundIcon
 * @type boolean
 * @default false
 *
 * @param backgroundIcon
 * @type number
 * @default 0
 *
 * @param goldName
 * @default G
 *
 * @param goldIcon
 * @type number
 * @default 262
 *
 * @param singleLine
 * @type boolean
 * @default true
 *
 * @param rarityColours
 * @type multiline_string
 * @default
 * @desc JSON { rarity: [r,g,b] } from Hime's Item Rarity when the game had it; the name is drawn in its colour.
 *
 * @param rgssFontSize
 * @type number
 * @default 24
 * @desc The game's Font.default_size: RGSS sizes are scaled from it to this project's font size.
 */
/*~struct~Se:
 * @param name
 * @param volume
 * @type number
 * @param pitch
 * @type number
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VlueItemPopup');
    const json = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (_) { return d; } };
    const num = (s, d) => (s === undefined || s === '' ? d : Number(s));
    const bool = (s, d) => (s === undefined || s === '' ? d : String(s) === 'true');
    const se = (s, name, pitch) => { const v = json(s, {}); return { name: String(v.name ?? name), volume: num(v.volume, 100), pitch: num(v.pitch, pitch), pan: 0 }; };
    const SE_GAIN = se(params.soundGain, 'OK', 100), SE_LOSE = se(params.soundLose, 'Cancel', 50);
    const GOLD_GAIN = se(params.goldGain, 'shop', 100), GOLD_LOSE = se(params.goldLose, 'shop', 50);
    const USE_ANIMATION = bool(params.useAnimation, false), ANIMATION = num(params.animationId, 0);
    const FADE_IN = Math.max(1, num(params.fadeIn, 5)), FADE_OUT = Math.max(1, num(params.fadeOut, 5));
    const DEFAULT_DURATION = num(params.defaultDuration, 5);
    const CUSTOM = bool(params.useCustomFont, false), FONT = json(params.customFont, {});
    const COMPACT = bool(params.compact, true), SINGLE = bool(params.singleLine, true);
    const USE_BG_ICON = bool(params.useBackgroundIcon, false), BG_ICON = num(params.backgroundIcon, 0);
    const GOLD_NAME = String(params.goldName ?? 'G'), GOLD_ICON = num(params.goldIcon, 262);
    const RARITY = params.rarityColours ? json(params.rarityColours, null) : null;
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    // Ruby global, not saved: every boot starts with the setting.
    window.rrPuAutomaticPopup = bool(params.automatic, true);

    // A size in RGSS cell heights as this project's font size.
    const px = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;
    const rgb = (a) => `rgba(${a[0] | 0}, ${a[1] | 0}, ${a[2] | 0}, ${(a[3] ?? 255) / 255})`;
    const RARITY_TAG = /<item[-_ ]rarity:\s*(\d+)\s*>/i;
    const rarityColour = (item) => {
        const m = RARITY_TAG.exec(item.note || '');
        const c = RARITY[m ? Number(m[1]) : 1];
        return c ? rgb(c) : ColorManager.normalColor();
    };

    // Popup_Manager: added at the front, taken from the back, so first in is first shown.
    const queue = [];
    // The popup outlives its scene (the original kept it in a global): it is hidden while another scene
    // is up and carries on when the map comes back.
    let current = null;

    function Window_RRItemPopup() { this.initialize(...arguments); }
    Window_RRItemPopup.prototype = Object.create(Window_Base.prototype);
    Window_RRItemPopup.prototype.constructor = Window_RRItemPopup;

    Window_RRItemPopup.prototype.initialize = function(item, amount, duration, nosound) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, 100, 96));
        const [gain, lose] = item.name !== GOLD_NAME ? [SE_GAIN, SE_LOSE] : [GOLD_GAIN, GOLD_LOSE];
        if (!nosound && amount > 0) AudioManager.playSe(gain);
        if (!nosound && amount < 0) AudioManager.playSe(lose);
        this.opacity = 0;
        this._duration = 90;   // the script's own; the duration handed to popup() is not used
        this._item = item;
        this._amount = amount;
        this._name = Array.from(String(item.name));
        this._text = '';
        this._padding = this._name.length;
        this._timer = 0;
        this._split = Math.max(2, Math.floor(FADE_IN / Math.max(1, this._name.length)));
        this._red = amount > 0 ? 'rgb(0, 255, 0)' : 'rgb(255, 0, 0)';
        // Measured at 16 (or the custom size) before the contents are made; drawn at the default size after.
        const measure = CUSTOM ? num(FONT.size, 0) : 16;
        this.contents.fontSize = px(measure);
        const nameWidth = this.textWidth(String(item.name));
        const amountWidth = this.textWidth('+' + String(amount));
        const pad = 12;
        let width = Math.ceil(nameWidth) + pad * 2 + 24;
        if (SINGLE) width += Math.ceil(amountWidth) + 48;
        const size = measure < 24 ? 24 : measure;
        const height = size + pad * 2 + (SINGLE ? 0 : size);
        this.move(0, 0, width, height);
        this.createContents();
        if (CUSTOM) this.applyCustomFont();
        this._opacityValue = 0;
        this.contentsOpacity = 0;
        if (USE_ANIMATION && ANIMATION > 0) $gameTemp.requestAnimation([$gamePlayer], ANIMATION);
        this.updatePopup();
    };
    Window_RRItemPopup.prototype.applyCustomFont = function() {
        const names = [].concat(FONT.name || []).filter(Boolean);
        if (names.length) this.contents.fontFace = names.map(n => JSON.stringify(String(n))).join(', ') + ', ' + $gameSystem.mainFontFace();
        this.contents.fontSize = px(num(FONT.size, RGSS_SIZE));
        if (Array.isArray(FONT.color)) this.contents.textColor = rgb(FONT.color);
        this.contents.fontBold = !!FONT.bold;
        this.contents.fontItalic = !!FONT.italic;
        if (FONT.outline === false) this.contents.outlineWidth = 0;
    };
    Window_RRItemPopup.prototype.resetFontSettings = function() {
        Window_Base.prototype.resetFontSettings.call(this);
        if (CUSTOM && this._item) this.applyCustomFont();
    };
    Window_RRItemPopup.prototype.setPopupOpacity = function(value) {
        this._opacityValue = Math.max(0, Math.min(255, value));
        this.contentsOpacity = this._opacityValue;
    };
    Window_RRItemPopup.prototype.popupOpacity = function() { return this._opacityValue; };
    // The window's own update is left alone: only the popup's step (below) moves it, once per map frame.
    Window_RRItemPopup.prototype.update = function() {};
    Window_RRItemPopup.prototype.updatePopup = function() {
        this.visible = true;
        const cw = this.contents.width;
        this.x = $gamePlayer.screenX() - Math.floor(cw / 4) + 12;
        this.y = $gamePlayer.screenY() - 80;
        this.x -= Math.floor(this.width / 3);
        if (this._timer < FADE_IN) this.setPopupOpacity(this._opacityValue + Math.floor(255 / FADE_IN));
        if (this._timer > FADE_OUT + this._duration) this.setPopupOpacity(this._opacityValue - Math.floor(255 / FADE_OUT));
        this._timer++;
        if (this._timer % this._split !== 0) return;
        this._text += this._name.shift() || '';
        if (this._padding > 0) this._padding--;
        this.refresh();
    };
    Window_RRItemPopup.prototype.refresh = function() {
        const c = this.contents, cw = c.width, lh = this.lineHeight();
        c.clear();
        const shown = this._text + ' '.repeat(this._padding);
        const amount = this._amount > 0 ? '+' + String(this._amount) : String(this._amount);
        const hideAmount = COMPACT && this._amount === 1;
        this.changeTextColor(this._red);
        if (SINGLE) {
            const width = this.textWidth(String(this._item.name));
            if (!hideAmount) this.drawText(amount, 27 + width, 0, 36);
            this.changeTextColor(RARITY ? rarityColour(this._item) : 'rgb(255, 255, 255)');
            this.drawText(shown, 24, 0, cw);
            this.resetTextColor();
            if (USE_BG_ICON) this.drawIcon(BG_ICON, 0, 0);
            this.drawIcon(this._item.iconIndex, 0, 0);
        } else {
            if (!hideAmount) this.drawText(amount, Math.floor(cw / 4) + 16, lh, 36);
            this.changeTextColor('rgb(255, 255, 255)');
            if (USE_BG_ICON) this.drawIcon(BG_ICON, Math.floor(cw / 2) - 24, lh);
            this.drawIcon(this._item.iconIndex, Math.floor(cw / 2) - 24, lh);
            this.drawText(shown, 0, 0, cw);
        }
    };

    const isOn = (v) => v !== false && v != null;

    Game_Interpreter.prototype.rrPopup = function(type, id, amount, duration = DEFAULT_DURATION, nosound = false) {
        let item = null;
        if (type === 0) item = $dataItems[id];
        if (type === 1) item = $dataWeapons[id];
        if (type === 2) item = $dataArmors[id];
        if (type === 3) item = { name: GOLD_NAME, iconIndex: GOLD_ICON, note: '' };
        if (!item) return;
        queue.unshift([item, Number(amount) || 0, duration, isOn(nosound)]);
    };

    // Change Gold / Items / Weapons / Armors: the popup follows the change, with the amount asked for.
    const automatic = (code, type, at) => {
        const command = Game_Interpreter.prototype[code];
        Game_Interpreter.prototype[code] = function(params) {
            const result = command.call(this, params);
            const value = this.operateValue(params[at], params[at + 1], params[at + 2]);
            if (window.rrPuAutomaticPopup) this.rrPopup(type, params[0], value);
            return result;
        };
    };
    automatic('command125', 3, 0);
    automatic('command126', 0, 1);
    automatic('command127', 1, 1);
    automatic('command128', 2, 1);

    const attach = (scene) => {
        if (!current || current.parent === scene) return;
        const at = scene._windowLayer ? scene.children.indexOf(scene._windowLayer) : -1;
        if (at >= 0) scene.addChildAt(current, at); else scene.addChild(current);
    };
    const _update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _update.call(this);
        if (current) {
            attach(this);
            current.updatePopup();
            if (current.popupOpacity() === 0) {
                if (current.parent) current.parent.removeChild(current);
                current.destroy();
                current = null;
            }
        }
        if (!queue.length) return;
        if (!current || current.popupOpacity() === 0) {
            const [item, amount, duration, nosound] = queue.pop();
            current = new Window_RRItemPopup(item, amount, duration, nosound);
            attach(this);
        }
    };
    const _terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        if (current) current.visible = false;
        _terminate.call(this);
        if (current && current.parent === this) this.removeChild(current);
    };

    window.Window_RRItemPopup = Window_RRItemPopup;
})();
