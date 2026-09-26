/*:
 * @target MZ
 * @plugindesc Big Boss HP Bar (VX Ace), for imported games
 * @author unknown (Dreamwalker's script); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_BigBossHpBar.js
 *
 * In a battle with an enemy whose note has <boss hp bar>, a dark panel on
 * the field shows its name, an HP bar that slides to the new value and
 * "hp / max"; the panel shakes when the boss is hurt. Optional notes:
 *   <boss bar name: Name>     the name shown
 *   <boss bar color1: n>, <boss bar color2: n>   the bar's text colours
 * The first living boss is shown, or the first one on the field; a defeated
 * boss stays on the panel at 0. With the game's gradient bar style
 * (RR_BlizzBars) the HP bar is drawn in it.
 *
 * Despite its name the panel sits above the middle of the field, and its
 * bar is cut off by the panel's lower edge: both are the settings the game
 * shipped.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param shake
 * @type boolean
 * @default true
 *
 * @param shakePower
 * @type number
 * @default 3
 *
 * @param shakeDuration
 * @type number
 * @default 12
 *
 * @param barWidth
 * @type number
 * @default 200
 *
 * @param barHeight
 * @type number
 * @default 44
 *
 * @param barX
 * @type number
 * @min -9999
 * @default 220
 *
 * @param barY
 * @type number
 * @min -9999
 * @default 112
 *
 * @param windowHeight
 * @type number
 * @default 40
 *
 * @param windowPadding
 * @type number
 * @default 12
 *
 * @param backOpacity
 * @type number
 * @default 200
 *
 * @param showNumbers
 * @type boolean
 * @default true
 *
 * @param showMaxHp
 * @type boolean
 * @default true
 *
 * @param showName
 * @type boolean
 * @default true
 *
 * @param nameFontSize
 * @type number
 * @default 20
 *
 * @param hpFontSize
 * @type number
 * @default 16
 *
 * @param nameBold
 * @type boolean
 * @default true
 *
 * @param hpBold
 * @type boolean
 * @default true
 *
 * @param barBackColor
 * @desc JSON [red, green, blue, alpha]
 * @default [24,24,24,255]
 *
 * @param barFrameColor
 * @desc JSON [red, green, blue, alpha]
 * @default [255,255,255,255]
 *
 * @param color1
 * @type number
 * @default 2
 *
 * @param color2
 * @type number
 * @default 10
 *
 * @param rgssFontSize
 * @text The game's Font.default_size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_BigBossHpBar');
    const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const color = (v, d) => {
        let c = d;
        try { const a = JSON.parse(v); if (Array.isArray(a) && a.length >= 3) c = a; } catch (_) { /* default */ }
        return `rgba(${c[0]},${c[1]},${c[2]},${(c[3] ?? 255) / 255})`;
    };
    const SHAKE = bool(params.shake, true), SHAKE_POWER = num(params.shakePower, 3), SHAKE_DURATION = num(params.shakeDuration, 12);
    const BAR_WIDTH = num(params.barWidth, 200), BAR_HEIGHT = num(params.barHeight, 44);
    const BAR_X = num(params.barX, 220), BAR_Y = num(params.barY, 112);
    const WINDOW_HEIGHT = num(params.windowHeight, 40), PADDING = num(params.windowPadding, 12), BACK_OPACITY = num(params.backOpacity, 200);
    const SHOW_NUMBERS = bool(params.showNumbers, true), SHOW_MAX_HP = bool(params.showMaxHp, true), SHOW_NAME = bool(params.showName, true);
    const NAME_SIZE = num(params.nameFontSize, 20), HP_SIZE = num(params.hpFontSize, 16);
    const NAME_BOLD = bool(params.nameBold, true), HP_BOLD = bool(params.hpBold, true);
    const BACK_COLOR = color(params.barBackColor, [24, 24, 24, 255]), FRAME_COLOR = color(params.barFrameColor, [255, 255, 255, 255]);
    const COLOR1 = num(params.color1, 2), COLOR2 = num(params.color2, 10);
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    const px = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;

    const bossNotes = (enemy) => {
        if (enemy._rrBossBar) return enemy._rrBossBar;
        const note = String(enemy.note || '');
        const name = /<boss[ _]bar[ _]name:\s*(.+?)>/i.exec(note);
        const c1 = /<boss[ _]bar[ _]color1:\s*(\d+)>/i.exec(note), c2 = /<boss[ _]bar[ _]color2:\s*(\d+)>/i.exec(note);
        return (enemy._rrBossBar = {
            boss: /<boss[ _]hp[ _]bar>/i.test(note),
            name: name ? name[1].trim() : enemy.name,
            color1: c1 ? Number(c1[1]) : COLOR1,
            color2: c2 ? Number(c2[1]) : COLOR2
        });
    };
    window.RRBigBossHpBar = { bossNotes };
    Game_Troop.prototype.rrBossBarEnemy = function() {
        const boss = (e) => bossNotes(e.enemy()).boss;
        return this.aliveMembers().find(boss) || this.members().find(e => boss(e) && !e.isHidden()) || null;
    };

    class Sprite_RRBigBossHpBar extends Sprite {
        initialize() {
            super.initialize(new Bitmap(BAR_WIDTH + PADDING * 2, WINDOW_HEIGHT));
            this.x = BAR_X - PADDING;
            this.y = BAR_Y - 20;
            this.z = 9999;
            this._rrEnemy = null;
            this._lastHp = null;
            this._displayRate = 1;
            this._targetRate = 1;
            this._shakeCount = 0;
            this._needsRefresh = false;
            this.visible = false;
        }
        update() {
            super.update();
            this.updateEnemy();
            this.updateAnimation();
            this.updateShake();
            if (this._needsRefresh) {
                this.refresh();
                this._needsRefresh = false;
            }
        }
        updateEnemy() {
            const enemy = $gameTroop.rrBossBarEnemy();
            if (this._rrEnemy === enemy) return;
            this._rrEnemy = enemy;
            if (enemy && enemy.mhp > 0) {
                this._displayRate = this._targetRate = enemy.hp / enemy.mhp;
                this._lastHp = enemy.hp;
                this.visible = true;
            } else {
                this._lastHp = null;
                this.visible = false;
            }
            this._needsRefresh = true;
        }
        isValid() {
            const e = this._rrEnemy;
            return !!e && e.isAppeared() && !!e.enemy() && e.mhp > 0;
        }
        // The bar eases down a sixth (and up an eighth) of the way each frame, never less than 0.004.
        updateAnimation() {
            if (!this.isValid()) return;
            const e = this._rrEnemy;
            this._targetRate = e.hp / Math.max(e.mhp, 1);
            if (this._displayRate > this._targetRate) {
                this._displayRate = Math.max(this._displayRate - Math.max((this._displayRate - this._targetRate) / 6, 0.004), this._targetRate);
                this._needsRefresh = true;
            } else if (this._displayRate < this._targetRate) {
                this._displayRate = Math.min(this._displayRate + Math.max((this._targetRate - this._displayRate) / 8, 0.004), this._targetRate);
                this._needsRefresh = true;
            }
            if (this._lastHp !== e.hp) {
                if (SHAKE && this._lastHp !== null && e.hp < this._lastHp) this._shakeCount = SHAKE_DURATION;
                this._lastHp = e.hp;
                this._needsRefresh = true;
            }
            this.visible = e.isAppeared();
        }
        updateShake() {
            if (this._shakeCount > 0) {
                this.x = BAR_X - PADDING + Math.randomInt(SHAKE_POWER * 2 + 1) - SHAKE_POWER;
                this._shakeCount--;
            } else {
                this.x = BAR_X - PADDING;
            }
        }
        refresh() {
            const b = this.bitmap;
            b.clear();
            if (!this.isValid()) return;
            b.fontFace = $gameSystem.mainFontFace();
            b.fillRect(0, 0, b.width, b.height, `rgba(0,0,0,${BACK_OPACITY / 255})`);
            const notes = bossNotes(this._rrEnemy.enemy());
            if (SHOW_NAME) {
                b.fontSize = px(NAME_SIZE);
                b.fontBold = NAME_BOLD;
                b.textColor = '#ffffff';
                b.drawText(notes.name, 14, 2, b.width - 28, 24, 'center');
            }
            this.drawBar(notes);
            if (SHOW_NUMBERS) {
                const hp = Math.max(this._rrEnemy.hp, 0);
                b.fontSize = px(HP_SIZE);
                b.fontBold = HP_BOLD;
                b.textColor = '#ffffff';
                b.drawText(SHOW_MAX_HP ? `${hp} / ${this._rrEnemy.mhp}` : String(hp), 0, 14, b.width - 12, 24, 'right');
            }
            b.fontBold = false;
        }
        drawBar(notes) {
            const b = this.bitmap, bx = PADDING, by = 28, rate = Math.min(Math.max(this._displayRate, 0), 1);
            const c1 = ColorManager.textColor(notes.color1), c2 = ColorManager.textColor(notes.color2);
            const blizz = Number(PluginManager.parameters('RR_BlizzBars').style);
            if (b.rrBlizzBar && blizz >= 1 && blizz <= 7) {
                b.rrBlizzBar(bx, by, BAR_WIDTH, c1, c2, BACK_COLOR, rate, blizz - 1);
                return;
            }
            b.fillRect(bx - 1, by - 1, BAR_WIDTH + 2, BAR_HEIGHT + 2, FRAME_COLOR);
            b.fillRect(bx, by, BAR_WIDTH, BAR_HEIGHT, BACK_COLOR);
            const fill = Math.floor(BAR_WIDTH * rate);
            if (fill > 0) b.gradientFillRect(bx, by, fill, BAR_HEIGHT, c1, c2);
        }
    }
    window.Sprite_RRBigBossHpBar = Sprite_RRBigBossHpBar;

    // Over the battlers and their animations, under the pictures.
    const _createLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _createLowerLayer.call(this);
        this._rrBigBossHpBar = new Sprite_RRBigBossHpBar();
        this._baseSprite.addChild(this._rrBigBossHpBar);
    };
})();
