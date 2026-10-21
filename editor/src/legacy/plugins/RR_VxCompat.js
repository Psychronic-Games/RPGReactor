/*:
 * @target MZ
 * @plugindesc RPG Maker VX rules for imported VX games
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VxCompat.js
 *
 * Installed by File › Import Project… with every RPG Maker VX game.
 *
 * Battle background: VX drew no battleback images. A battle took the map as
 * it looked when the battle began, blurred it, and laid the BattleFloor image
 * (img/system) over its lower half. A map or battle that names a battleback
 * (Map Properties, Change Battle Back) shows that instead, as in MZ.
 *
 * A battleback the game's script kept on the system ($gameSystem._rrBattleback,
 * set by the importer's translation of `$game_system.battleback = "…"`)
 * overrides every map's until it is cleared, as the script did.
 *
 * Windows, as VX laid them out and drew them: list rows from the contents'
 * left edge, columns 32 apart, command text left-aligned 4 px in; a
 * disabled item at half opacity; windows open and close in 6 frames; a
 * message's text from the window's left edge (112 in beside a face); text
 * with VX's drop shadow.
 *
 * Window_Base gains VX's drawing methods under rrVx names (rrVxDrawActorHp,
 * rrVxDrawItemName, rrVxSystemColor …), which the ports of the game's own
 * scripts replace in the game's script order, as the scripts replaced the
 * original methods. rrVxFontSize(n) is the size in pixels of a Ruby font
 * size n.
 *
 * Turning it off leaves MZ's battlebacks, which an imported VX game has none
 * of, and MZ's window layouts.
 *
 * @param fontSize
 * @text Default font size
 * @desc The game's Font.default_size, the size rrVxFontSize measures from.
 * @type number
 * @default 20
 *
 * @param textShadow
 * @text Text shadow
 * @desc VX drew text with a drop shadow unless the game turned Font.default_shadow off.
 * @type boolean
 * @default true
 *
 * @param floorOpacity
 * @text BattleFloor opacity
 * @type number
 * @max 255
 * @default 128
 *
 * @param blur
 * @text Blur the map
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VxCompat');
    const FLOOR_OPACITY = Number(params.floorOpacity || 128);
    const BLUR = params.blur !== 'false';
    const FONT_SIZE = Number(params.fontSize) || 20;
    const TEXT_SHADOW = params.textShadow !== 'false';

    const _battleback1Name = Game_Map.prototype.battleback1Name;
    Game_Map.prototype.battleback1Name = function() {
        const kept = $gameSystem && $gameSystem._rrBattleback;
        return kept ? String(kept) : _battleback1Name.call(this);
    };
    const _battleback2Name = Game_Map.prototype.battleback2Name;
    Game_Map.prototype.battleback2Name = function() {
        return $gameSystem && $gameSystem._rrBattleback ? '' : _battleback2Name.call(this);
    };

    const namesBattleback = () => !!(($gameMap && ($gameMap.battleback1Name() || $gameMap.battleback2Name())) || BattleManager.isBattleTest() && ($dataSystem.battleback1Name || $dataSystem.battleback2Name));

    // VX gave a battle a screen of its own ($game_troop.screen): the map's tint, flash and pictures stay with
    // the map, and a battle starts untinted. MZ shares one $gameScreen, so the map's tint lay on the battle twice
    // (once in the snapshot of the map behind it, once on the battle). The battle runs on a fresh screen, made
    // after the map's snapshot and before the battle's sprites, and the map's comes back when the battle ends.
    // The map's screen stays readable as $gameTemp._rrMapScreen while it is put aside.
    const _createBattleSpriteset = Scene_Battle.prototype.createSpriteset;
    Scene_Battle.prototype.createSpriteset = function() {
        if (!this._rrVxScreenSwapped && window.$gameScreen) {
            $gameTemp._rrMapScreen = $gameScreen;
            $gameScreen = new Game_Screen();
            this._rrVxScreenSwapped = true;
        }
        _createBattleSpriteset.call(this);
    };
    const _onSceneTerminate = SceneManager.onSceneTerminate;
    SceneManager.onSceneTerminate = function() {
        if (this._scene && this._scene._rrVxScreenSwapped && $gameTemp && $gameTemp._rrMapScreen) {
            $gameScreen = $gameTemp._rrMapScreen;
            $gameTemp._rrMapScreen = null;
            this._scene._rrVxScreenSwapped = false;
        }
        _onSceneTerminate.call(this);
    };

    /** RGSS's Bitmap#blur: one 3×3 box blur pass, edges repeated (MZ's Bitmap has none). */
    const blurBitmap = (bitmap) => {
        if (typeof bitmap.blur === 'function') { bitmap.blur(); return; }
        const w = bitmap.width, h = bitmap.height, canvas = bitmap.canvas, context = bitmap.context;
        const temp = document.createElement('canvas');
        temp.width = w + 2; temp.height = h + 2;
        const t = temp.getContext('2d');
        t.drawImage(canvas, 0, 0, w, h, 1, 1, w, h);
        t.drawImage(canvas, 0, 0, w, 1, 1, 0, w, 1);
        t.drawImage(canvas, 0, 0, 1, h, 0, 1, 1, h);
        t.drawImage(canvas, 0, h - 1, w, 1, 1, h + 1, w, 1);
        t.drawImage(canvas, w - 1, 0, 1, h, w + 1, 1, 1, h);
        context.save();
        context.fillStyle = 'black';
        context.fillRect(0, 0, w, h);
        context.globalCompositeOperation = 'lighter';
        context.globalAlpha = 1 / 9;
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) context.drawImage(temp, x, y, w, h, 0, 0, w, h);
        context.restore();
        if (bitmap._baseTexture) bitmap._baseTexture.update();
    };

    const _createBattleback = Spriteset_Battle.prototype.createBattleback;
    Spriteset_Battle.prototype.createBattleback = function() {
        if (namesBattleback()) { _createBattleback.call(this); return; }
        const snap = SceneManager.backgroundBitmap();
        const w = Graphics.width, h = Graphics.height;
        const back = new Bitmap(w, h);
        if (snap) {
            back.blt(snap, 0, 0, snap.width, snap.height, 0, 0, w, h);
            if (BLUR) { blurBitmap(back); blurBitmap(back); }
        } else back.fillAll('#000000');
        this._rrVxBack = new Sprite(back);
        this._baseSprite.addChild(this._rrVxBack);
        // BattleFloor sits at y 192 of VX's 544×416 screen, scaled with the screen.
        const floor = new Sprite(ImageManager.loadSystem('BattleFloor'));
        floor.y = Math.round(h * 192 / 416);
        floor.opacity = FLOOR_OPACITY;
        floor.scale.set(w / 544, w / 544);
        this._rrVxFloor = floor;
        this._baseSprite.addChild(floor);
        // Empty stand-ins for the stock battleback sprites, for code that looks for them
        // (a Sprite_Battleback would load MZ's default battleback, which the game does not have).
        // Spriteset_Battle positions them every frame (adjustPosition), so they answer that too, doing nothing.
        this._back1Sprite = new Sprite();
        this._back2Sprite = new Sprite();
        this._back1Sprite.adjustPosition = this._back2Sprite.adjustPosition = () => {};
        this._baseSprite.addChild(this._back1Sprite);
        this._baseSprite.addChild(this._back2Sprite);
    };

    //-------------------------------------------------------------------------
    // Text: VX's drop shadow (RGSS2 has no outline), and font sizes in Ruby's units
    //-------------------------------------------------------------------------
    if (TEXT_SHADOW) {
        const _onLoad = DataManager.onLoad;
        DataManager.onLoad = function(object) {
            _onLoad.call(this, object);
            if (object === window.$dataSystem && object.advanced) Object.assign(object.advanced, { textOutlineWidth: 1, rrTextShadow: true });
        };
    }
    /** The game's Font.default_size, in Ruby's units. */
    Game_System.prototype.rrVxDefaultFontSize = function() { return FONT_SIZE; };
    /** Pixels for a Ruby font size: RGSS sized a font by its cell height, a browser by its em. */
    Window_Base.prototype.rrVxFontSize = function(rubySize) {
        return rubySize * $gameSystem.mainFontSize() / $gameSystem.rrVxDefaultFontSize();
    };

    //-------------------------------------------------------------------------
    // Window rules: open and close in 6 frames, disabled text at half opacity,
    // text 4 px in from the window's contents
    //-------------------------------------------------------------------------
    const W = Window_Base.prototype;
    const WLH = 24;
    W.updateOpen = function() {
        if (this._opening) {
            this.openness += 48;
            if (this.isOpen()) this._opening = false;
        }
    };
    W.updateClose = function() {
        if (this._closing) {
            this.openness -= 48;
            if (this.isClosed()) this._closing = false;
        }
    };
    W.translucentOpacity = function() { return 128; };
    W.itemPadding = function() { return 4; };
    // A message's text starts at the contents' left edge, or 112 in beside a face.
    Window_Message.prototype.newLineX = function(textState) {
        const margin = $gameMessage.faceName() !== '' ? 112 : 0;
        return textState.rtl ? this.innerWidth - margin : margin;
    };

    //-------------------------------------------------------------------------
    // Lists: rows WLH tall from the contents' left edge, columns @spacing (32)
    // apart; commands left-aligned
    //-------------------------------------------------------------------------
    Window_Selectable.prototype.rrVxSpacing = function() { return 32; };
    Window_Selectable.prototype.rrVxItemRect = function(index) {
        const cols = this.maxCols(), spacing = this.rrVxSpacing();
        const width = Math.floor((this.innerWidth + spacing) / cols) - spacing;
        const height = this.itemHeight();
        const col = index % cols, row = Math.floor(index / cols);
        return new Rectangle(col * (width + spacing) - this.scrollBaseX(), row * height - this.scrollBaseY(), width, height);
    };
    Window_Selectable.prototype.itemRect = function(index) { return this.rrVxItemRect(index); };
    Window_Command.prototype.itemTextAlign = function() { return 'left'; };

    //-------------------------------------------------------------------------
    // Drawing, as VX's Window_Base did it. Colours come from the windowskin's
    // palette (text_color(n)), the indices VX used.
    //-------------------------------------------------------------------------
    const ALIGN = ['left', 'center', 'right'];
    // A picture still loading is drawn once it arrives, unless the window has new contents by then.
    const whenReady = (win, bitmap, draw) => {
        if (bitmap.isReady()) { draw(); return; }
        const contents = win.contents;
        bitmap.addLoadListener(() => { if (win.contents && win.contents === contents) draw(); });
    };
    Object.assign(W, {
        rrVxTextColor(n) { return ColorManager.textColor(n); },
        rrVxNormalColor() { return this.rrVxTextColor(0); },
        rrVxSystemColor() { return this.rrVxTextColor(16); },
        rrVxCrisisColor() { return this.rrVxTextColor(17); },
        rrVxKnockoutColor() { return this.rrVxTextColor(18); },
        rrVxGaugeBackColor() { return this.rrVxTextColor(19); },
        rrVxHpGaugeColor1() { return this.rrVxTextColor(20); },
        rrVxHpGaugeColor2() { return this.rrVxTextColor(21); },
        rrVxMpGaugeColor1() { return this.rrVxTextColor(22); },
        rrVxMpGaugeColor2() { return this.rrVxTextColor(23); },
        rrVxPowerUpColor() { return this.rrVxTextColor(24); },
        rrVxPowerDownColor() { return this.rrVxTextColor(25); },
        rrVxHpColor(actor) {
            if (actor.hp === 0) return this.rrVxKnockoutColor();
            if (actor.hp < Math.floor(actor.mhp / 4)) return this.rrVxCrisisColor();
            return this.rrVxNormalColor();
        },
        rrVxMpColor(actor) { return actor.mp < Math.floor(actor.mmp / 4) ? this.rrVxCrisisColor() : this.rrVxNormalColor(); },

        /** contents.draw_text(x, y, width, height, text, align): align 0 left, 1 centre, 2 right. */
        rrVxDrawText(x, y, width, height, text, align = 0) {
            this.contents.drawText(String(text), x, y, width, height, typeof align === 'string' ? align : ALIGN[align] || 'left');
        },
        rrVxDrawIcon(index, x, y, enabled = true) {
            const bitmap = ImageManager.loadSystem('IconSet');
            const pw = ImageManager.iconWidth, ph = ImageManager.iconHeight;
            whenReady(this, bitmap, () => {
                const opacity = this.contents.paintOpacity;
                this.contents.paintOpacity = enabled ? 255 : 128;
                this.contents.blt(bitmap, index % 16 * pw, Math.floor(index / 16) * ph, pw, ph, x, y);
                this.contents.paintOpacity = opacity;
            });
        },
        rrVxDrawFace(name, index, x, y, size = 96) {
            if (!name) return;
            const bitmap = ImageManager.loadFace(name);
            const inset = Math.floor((96 - size) / 2);
            whenReady(this, bitmap, () => this.contents.blt(bitmap, index % 4 * 96 + inset, Math.floor(index / 4) * 96 + inset, size, size, x, y));
        },
        rrVxDrawCharacter(name, index, x, y) {
            if (!name) return;
            const bitmap = ImageManager.loadCharacter(name);
            whenReady(this, bitmap, () => {
                const big = ImageManager.isBigCharacter(name);
                const cw = Math.floor(bitmap.width / (big ? 3 : 12)), ch = Math.floor(bitmap.height / (big ? 4 : 8));
                this.contents.blt(bitmap, (index % 4 * 3 + 1) * cw, Math.floor(index / 4) * 4 * ch, cw, ch, x - Math.floor(cw / 2), y - ch);
            });
        },
        rrVxDrawActorGraphic(actor, x, y) { this.rrVxDrawCharacter(actor.characterName(), actor.characterIndex(), x, y); },
        rrVxDrawActorFace(actor, x, y, size = 96) { this.rrVxDrawFace(actor.faceName(), actor.faceIndex(), x, y, size); },
        rrVxDrawActorName(actor, x, y) {
            this.changeTextColor(this.rrVxHpColor(actor));
            this.rrVxDrawText(x, y, 108, WLH, actor.name());
        },
        rrVxDrawActorClass(actor, x, y) {
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x, y, 108, WLH, actor.currentClass().name);
        },
        rrVxDrawActorLevel(actor, x, y) {
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 32, WLH, TextManager.levelA);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x + 32, y, 24, WLH, actor.level, 2);
        },
        rrVxDrawActorState(actor, x, y, width = 96) {
            let count = 0;
            for (const state of actor.states()) {
                this.rrVxDrawIcon(state.iconIndex, x + 24 * count, y);
                count++;
                if (24 * count > width - 24) break;
            }
        },
        rrVxDrawActorHp(actor, x, y, width = 120) {
            this.rrVxDrawActorHpGauge(actor, x, y, width);
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 30, WLH, TextManager.hpA);
            this.changeTextColor(this.rrVxHpColor(actor));
            const xr = x + width;
            if (width < 120) {
                this.rrVxDrawText(xr - 44, y, 44, WLH, actor.hp, 2);
            } else {
                this.rrVxDrawText(xr - 99, y, 44, WLH, actor.hp, 2);
                this.changeTextColor(this.rrVxNormalColor());
                this.rrVxDrawText(xr - 55, y, 11, WLH, '/', 2);
                this.rrVxDrawText(xr - 44, y, 44, WLH, actor.mhp, 2);
            }
        },
        rrVxDrawActorHpGauge(actor, x, y, width = 120) {
            const gw = Math.floor(width * actor.hp / actor.mhp);
            this.contents.fillRect(x, y + WLH - 8, width, 6, this.rrVxGaugeBackColor());
            this.contents.gradientFillRect(x, y + WLH - 8, gw, 6, this.rrVxHpGaugeColor1(), this.rrVxHpGaugeColor2());
        },
        rrVxDrawActorMp(actor, x, y, width = 120) {
            this.rrVxDrawActorMpGauge(actor, x, y, width);
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 30, WLH, TextManager.mpA);
            this.changeTextColor(this.rrVxMpColor(actor));
            const xr = x + width;
            if (width < 120) {
                this.rrVxDrawText(xr - 44, y, 44, WLH, actor.mp, 2);
            } else {
                this.rrVxDrawText(xr - 99, y, 44, WLH, actor.mp, 2);
                this.changeTextColor(this.rrVxNormalColor());
                this.rrVxDrawText(xr - 55, y, 11, WLH, '/', 2);
                this.rrVxDrawText(xr - 44, y, 44, WLH, actor.mmp, 2);
            }
        },
        rrVxDrawActorMpGauge(actor, x, y, width = 120) {
            const gw = Math.floor(width * actor.mp / Math.max(actor.mmp, 1));
            this.contents.fillRect(x, y + WLH - 8, width, 6, this.rrVxGaugeBackColor());
            this.contents.gradientFillRect(x, y + WLH - 8, gw, 6, this.rrVxMpGaugeColor1(), this.rrVxMpGaugeColor2());
        },
        /** type 0 Attack, 1 Defense, 2 Spirit, 3 Agility (MZ's ATK, DEF, MAT, AGI). */
        rrVxDrawActorParameter(actor, x, y, type) {
            const paramId = [2, 3, 4, 6][type];
            if (paramId === undefined) return;
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 120, WLH, TextManager.param(paramId));
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x + 120, y, 36, WLH, actor.param(paramId), 2);
        },
        rrVxDrawItemName(item, x, y, enabled = true) {
            if (!item) return;
            this.rrVxDrawIcon(item.iconIndex, x, y, enabled);
            this.changeTextColor(this.rrVxNormalColor());
            const opacity = this.contents.paintOpacity;
            this.contents.paintOpacity = enabled ? 255 : 128;
            this.rrVxDrawText(x + 24, y, 172, WLH, item.name);
            this.contents.paintOpacity = opacity;
        },
        rrVxDrawCurrencyValue(value, x, y, width) {
            const cx = this.textWidth(TextManager.currencyUnit);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x, y, width - cx - 2, WLH, value, 2);
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, width, WLH, TextManager.currencyUnit, 2);
        },
        // MZ windows' item names draw through the VX method, so the game's own version reaches them too.
        drawItemName(item, x, y) {
            this.rrVxDrawItemName(item, x, y, this.contents.paintOpacity >= 255);
        }
    });
})();
