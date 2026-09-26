/*:
 * @target MZ
 * @plugindesc RPG Maker VX Ace rules for imported VX Ace games
 * @author RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_AceCompat.js
 *
 * Installed by File › Import Project… with every RPG Maker VX Ace game.
 *
 * The windows VX Ace drew, where MZ draws them otherwise:
 *   Main menu     commands on the left, 160 wide (Item, Skill, Equip, Status,
 *                 Formation, the game's own, Save, Game End; no Options), the
 *                 gold under them, and the party on the right, four to a
 *                 screen, each with the face and name, level, states, class
 *                 and HP and MP bars with their numbers.
 *
 *   Battle        with no battleback, the map radially blurred behind it;
 *                 the party commands, the status (one row per member with
 *                 name, states and gauges) and the actor commands in one
 *                 strip along the bottom that slides between them; help,
 *                 skills and items above it; a six-line battle log.
 *   Game End      To Title, Shut Down (the game's word for it) and Cancel,
 *                 160 wide, over the menu background turned half grey.
 *   Items         help at the top, the categories under it, and the list
 *                 to the bottom, each item with its icon, name and ":n".
 *
 * An icon in text (\\I[n]) moves the text on by the icon's width alone.
 *
 * Command lists are left-aligned, the horizontal ones centred. List rows start
 * at the window's left edge, columns 32 apart (8 in a horizontal list), and
 * their text sits 4 in from the row's edges.
 *
 * Window_Base gains VX Ace's drawing methods under rrAce names
 * (rrAceGauge, rrAceDrawActorHp, rrAceDrawActorSimpleStatus,
 * rrAceDrawCurrencyValue …), which the ports of the game's own scripts
 * replace one after another in the game's script order, as the scripts
 * replaced the original methods.
 *
 * Turning it off leaves MZ's layouts.
 */
(() => {
    'use strict';
    const W = Window_Base.prototype;

    //-------------------------------------------------------------------------
    // Drawing, as VX Ace's Window_Base did it
    //-------------------------------------------------------------------------
    // An icon drawn disabled is faint.
    const _drawIcon = W.drawIcon;
    W.drawIcon = function(iconIndex, x, y, enabled) {
        if (enabled !== false) return _drawIcon.call(this, iconIndex, x, y);
        const opacity = this.contents.paintOpacity;
        this.contents.paintOpacity = this.translucentOpacity();
        _drawIcon.call(this, iconIndex, x, y);
        this.contents.paintOpacity = opacity;
    };

    // An icon in text sits on the line's top-left corner and moves the text on by one icon.
    W.processDrawIcon = function(iconIndex, textState) {
        if (textState.drawing) this.drawIcon(iconIndex, textState.x, textState.y);
        textState.x += ImageManager.iconWidth;
    };

    Object.assign(W, {
        rrAceGauge(x, y, width, rate, color1, color2) {
            const fill = Math.floor(width * rate);
            const gy = y + this.lineHeight() - 8;
            this.contents.fillRect(x, gy, width, 6, ColorManager.gaugeBackColor());
            this.contents.gradientFillRect(x, gy, fill, 6, color1, color2);
        },
        rrAceHpColor(actor) {
            if (actor.hp === 0) return ColorManager.deathColor();
            if (actor.hp < actor.mhp / 4) return ColorManager.crisisColor();
            return ColorManager.normalColor();
        },
        rrAceMpColor(actor) { return actor.mp < actor.mmp / 4 ? ColorManager.crisisColor() : ColorManager.normalColor(); },
        rrAceTpColor() { return ColorManager.normalColor(); },
        rrAceDrawActorName(actor, x, y, width = 112) {
            this.changeTextColor(this.rrAceHpColor(actor));
            this.drawText(actor.name(), x, y, width);
        },
        rrAceDrawActorClass(actor, x, y, width = 112) {
            this.resetTextColor();
            this.drawText(actor.currentClass().name, x, y, width);
        },
        rrAceDrawActorNickname(actor, x, y, width = 180) {
            this.resetTextColor();
            this.drawText(actor.nickname(), x, y, width);
        },
        rrAceDrawActorLevel(actor, x, y) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.levelA, x, y, 32);
            this.resetTextColor();
            this.drawText(actor.level, x + 32, y, 24, 'right');
        },
        rrAceDrawActorIcons(actor, x, y, width = 96) {
            const icons = actor.allIcons().slice(0, Math.floor(width / 24));
            icons.forEach((n, i) => this.drawIcon(n, x + 24 * i, y));
        },
        rrAceDrawCurrentAndMaxValues(x, y, width, current, max, color1, color2) {
            this.changeTextColor(color1);
            const xr = x + width;
            if (width < 96) {
                this.drawText(current, xr - 40, y, 42, 'right');
            } else {
                this.drawText(current, xr - 92, y, 42, 'right');
                this.changeTextColor(color2);
                this.drawText('/', xr - 52, y, 12, 'right');
                this.drawText(max, xr - 42, y, 42, 'right');
            }
        },
        rrAceDrawActorHp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.hpRate(), ColorManager.hpGaugeColor1(), ColorManager.hpGaugeColor2());
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.hpA, x, y, 30);
            this.rrAceDrawCurrentAndMaxValues(x, y, width, actor.hp, actor.mhp, this.rrAceHpColor(actor), ColorManager.normalColor());
        },
        rrAceDrawActorMp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.mpRate(), ColorManager.mpGaugeColor1(), ColorManager.mpGaugeColor2());
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.mpA, x, y, 30);
            this.rrAceDrawCurrentAndMaxValues(x, y, width, actor.mp, actor.mmp, this.rrAceMpColor(actor), ColorManager.normalColor());
        },
        rrAceDrawActorTp(actor, x, y, width = 124) {
            this.rrAceGauge(x, y, width, actor.tpRate(), ColorManager.tpGaugeColor1(), ColorManager.tpGaugeColor2());
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.tpA, x, y, 30);
            this.changeTextColor(this.rrAceTpColor(actor));
            this.drawText(Math.floor(actor.tp), x + width - 42, y, 42, 'right');
        },
        rrAceDrawActorSimpleStatus(actor, x, y) {
            const lh = this.lineHeight();
            this.rrAceDrawActorName(actor, x, y);
            this.rrAceDrawActorLevel(actor, x, y + lh);
            this.rrAceDrawActorIcons(actor, x, y + lh * 2);
            this.rrAceDrawActorClass(actor, x + 120, y);
            this.rrAceDrawActorHp(actor, x + 120, y + lh);
            this.rrAceDrawActorMp(actor, x + 120, y + lh * 2);
        },
        rrAceDrawActorParam(actor, x, y, paramId) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.param(paramId), x, y, 120);
            this.resetTextColor();
            this.drawText(actor.param(paramId), x + 120, y, 36, 'right');
        },
        rrAceDrawItemName(item, x, y, enabled = true, width = 172) {
            if (!item) return;
            this.changePaintOpacity(enabled);
            this.drawIcon(item.iconIndex, x, y, enabled);
            this.resetTextColor();
            this.drawText(item.name, x + 24, y, width);
            this.changePaintOpacity(true);
        },
        // MZ windows' drawItemName (width is the whole row) draws through the Ace method, so the game's overrides reach them.
        drawItemName(item, x, y, width) {
            this.rrAceDrawItemName(item, x, y, true, width === undefined ? 172 : Math.max(width - 24, 0));
        },
        rrAceDrawCurrencyValue(value, unit, x, y, width) {
            const cx = this.textWidth(unit);
            this.resetTextColor();
            this.drawText(value, x, y, width - cx - 2, 'right');
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(unit, x, y, width, 'right');
        },
        rrAceGroup(value) { return String(value); },
        rrAceFittingHeight(lines) { return lines * this.lineHeight() + $gameSystem.windowPadding() * 2; }
    });

    //-------------------------------------------------------------------------
    // List rows: the first column at the left edge, columns 32 apart (8 in a
    // horizontal command list), text 4 in from the row's edges
    //-------------------------------------------------------------------------
    Window_Selectable.prototype.rrAceSpacing = function() { return 32; };
    Window_HorzCommand.prototype.rrAceSpacing = function() { return 8; };
    Window_Selectable.prototype.itemPadding = function() { return 4; };
    Window_Selectable.prototype.itemRect = function(index) {
        const cols = this.maxCols(), spacing = this.rrAceSpacing();
        const width = Math.floor((this.innerWidth + spacing) / cols - spacing);
        const height = this.itemHeight();
        const col = index % cols, row = Math.floor(index / cols);
        return new Rectangle(col * (width + spacing) - this.scrollBaseX(), row * height - this.scrollBaseY(), width, height);
    };

    //-------------------------------------------------------------------------
    // Item lists: the icon and name, and ":n" at the right of the row
    //-------------------------------------------------------------------------
    W.rrAceDrawItemNumber = function(rect, item) {
        this.drawText(':' + String($gameParty.numItems(item)).padStart(2, ' '), rect.x, rect.y, rect.width, 'right');
    };
    Window_ItemList.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrAceDrawItemName(item, rect.x, rect.y, this.isEnabled(item));
        this.changePaintOpacity(this.isEnabled(item));
        this.rrAceDrawItemNumber(rect, item);
        this.changePaintOpacity(true);
    };

    //-------------------------------------------------------------------------
    // Item screen: help (two lines) at the top, the categories, then the list
    //-------------------------------------------------------------------------
    Scene_Item.prototype.helpWindowRect = function() {
        return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false));
    };
    Scene_Item.prototype.categoryWindowRect = function() {
        return new Rectangle(0, this._helpWindow.y + this._helpWindow.height, Graphics.boxWidth, this.calcWindowHeight(1, true));
    };
    Scene_Item.prototype.itemWindowRect = function() {
        const y = this._categoryWindow.y + this._categoryWindow.height;
        return new Rectangle(0, y, Graphics.boxWidth, Graphics.boxHeight - y);
    };

    //-------------------------------------------------------------------------
    // Battle: the info area along the bottom holds the party commands, the
    // status and the actor commands side by side and slides between them
    // (party commands 0, during a turn 64, actor commands 128)
    //-------------------------------------------------------------------------
    const INFO_WIDTH = 128;
    Scene_Battle.prototype.rrAceInfoHeight = function() { return this.calcWindowHeight(4, true); };
    Scene_Battle.prototype.rrAceInfoTop = function() { return Graphics.boxHeight - this.rrAceInfoHeight(); };
    Scene_Battle.prototype.logWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(6, false)); };
    Scene_Battle.prototype.statusWindowRect = function() { return new Rectangle(INFO_WIDTH, this.rrAceInfoTop(), Graphics.boxWidth - INFO_WIDTH, this.rrAceInfoHeight()); };
    Scene_Battle.prototype.partyCommandWindowRect = function() { return new Rectangle(0, this.rrAceInfoTop(), INFO_WIDTH, this.rrAceInfoHeight()); };
    Scene_Battle.prototype.actorCommandWindowRect = function() { return new Rectangle(Graphics.boxWidth, this.rrAceInfoTop(), INFO_WIDTH, this.rrAceInfoHeight()); };
    Scene_Battle.prototype.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false)); };
    Scene_Battle.prototype.skillWindowRect = function() {
        const y = this.calcWindowHeight(2, false);
        return new Rectangle(0, y, Graphics.boxWidth, this.rrAceInfoTop() - y);
    };
    Scene_Battle.prototype.itemWindowRect = function() { return this.skillWindowRect(); };
    // Target lists sit right of the party command column.
    Scene_Battle.prototype.actorWindowRect = function() { return new Rectangle(INFO_WIDTH, this.rrAceInfoTop(), Graphics.boxWidth - INFO_WIDTH, this.rrAceInfoHeight()); };
    Scene_Battle.prototype.enemyWindowRect = function() { return this.actorWindowRect(); };

    // With no battleback the map shows behind the battle, turned about the screen's centre: sixteen copies
    // spread over 120 degrees, averaged (RGSS radial_blur(120, 16)).
    Spriteset_Battle.prototype.createBackground = function() {
        this._backgroundSprite = new Sprite();
        const source = SceneManager.backgroundBitmap();
        const probe = new Sprite_Battleback(0);
        if (!probe.battleback1Name() && source) {
            const w = Graphics.width, h = Graphics.height, bitmap = new Bitmap(w, h);
            const ctx = bitmap.context, image = source.canvas;
            if (ctx && image) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = 1 / 16;
                for (let i = 0; i < 16; i++) {
                    ctx.setTransform(1, 0, 0, 1, w / 2, h / 2);
                    ctx.rotate((-60 + i * 8) * Math.PI / 180);
                    ctx.drawImage(image, -w / 2, -h / 2, w, h);
                }
                ctx.restore();
                bitmap._baseTexture.update();
            }
            this._backgroundSprite.bitmap = bitmap;
        } else {
            this._backgroundSprite.bitmap = source;
            this._backgroundFilter = new PIXI.BlurFilter();
            this._backgroundSprite.filters = [this._backgroundFilter];
        }
        this._baseSprite.addChild(this._backgroundSprite);
    };

    const _createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _createAllWindows.call(this);
        this._rrInfoOx = 64;
        for (const w of [this._statusWindow, this._partyCommandWindow, this._actorCommandWindow]) w._rrInfoBaseX = w.x;
        this.updateStatusWindowPosition();
    };
    Scene_Battle.prototype.updateStatusWindowPosition = function() {
        if (this._rrInfoOx === undefined) return;
        let target = null;
        if (this._partyCommandWindow.active) target = 0;
        if (this._actorCommandWindow.active) target = INFO_WIDTH;
        if (BattleManager.isInTurn()) target = INFO_WIDTH / 2;
        if (target !== null) {
            if (this._rrInfoOx < target) this._rrInfoOx = Math.min(target, this._rrInfoOx + 16);
            if (this._rrInfoOx > target) this._rrInfoOx = Math.max(target, this._rrInfoOx - 16);
        }
        for (const w of [this._statusWindow, this._partyCommandWindow, this._actorCommandWindow]) w.x = w._rrInfoBaseX - this._rrInfoOx;
    };
    // The status stays up while an enemy is chosen.
    Scene_Battle.prototype.startEnemySelection = function() {
        this._enemyWindow.refresh();
        this._enemyWindow.show();
        this._enemyWindow.select(0);
        this._enemyWindow.activate();
    };
    Window_BattleLog.prototype.maxLines = function() { return 6; };

    // One row per member: name and states on the left, HP, MP (and TP) gauges on the right.
    Window_BattleStatus.prototype.maxCols = function() { return 1; };
    Window_BattleStatus.prototype.itemHeight = function() { return this.lineHeight(); };
    Window_BattleStatus.prototype.drawItem = function(index) {
        const actor = this.actor(index);
        if (!actor) return;
        const rect = this.itemLineRect(index), gauges = 220;
        this.rrAceDrawActorName(actor, rect.x, rect.y, 100);
        this.rrAceDrawActorIcons(actor, rect.x + 104, rect.y, rect.width - gauges - 10 - 104);
        const gx = rect.x + rect.width - gauges;
        if ($dataSystem.optDisplayTp) {
            this.rrAceDrawActorHp(actor, gx, rect.y, 72);
            this.rrAceDrawActorMp(actor, gx + 82, rect.y, 64);
            this.rrAceDrawActorTp(actor, gx + 156, rect.y, 64);
        } else {
            this.rrAceDrawActorHp(actor, gx, rect.y, 134);
            this.rrAceDrawActorMp(actor, gx + 144, rect.y, 76);
        }
    };
    Window_BattleStatus.prototype.drawItemBackground = function() {};

    //-------------------------------------------------------------------------
    // Game End: To Title, Shut Down and Cancel in a window 160 wide, over the
    // menu background turned half grey
    //-------------------------------------------------------------------------
    Window_GameEnd.prototype.makeCommandList = function() {
        this.addCommand(TextManager.toTitle, 'toTitle');
        const shutdown = $dataSystem && typeof $dataSystem.rrTitleShutdown === 'string' ? $dataSystem.rrTitleShutdown : '';
        if (shutdown) this.addCommand(shutdown, 'shutdown');
        this.addCommand(TextManager.cancel, 'cancel');
    };
    Scene_GameEnd.prototype.commandWindowRect = function() {
        const rows = $dataSystem && $dataSystem.rrTitleShutdown ? 3 : 2;
        const w = 160, h = this.calcWindowHeight(rows, true);
        return new Rectangle(Math.floor((Graphics.boxWidth - w) / 2), Math.floor((Graphics.boxHeight - h) / 2), w, h);
    };
    const _gameEndWindow = Scene_GameEnd.prototype.createCommandWindow;
    Scene_GameEnd.prototype.createCommandWindow = function() {
        _gameEndWindow.call(this);
        this._commandWindow.setHandler('shutdown', () => { this.fadeOutAll(); SceneManager.exit(); });
    };
    Scene_GameEnd.prototype.createBackground = function() {
        Scene_MenuBase.prototype.createBackground.call(this);
        this._backgroundSprite.setColorTone([0, 0, 0, 128]);
    };

    //-------------------------------------------------------------------------
    // Main menu
    //-------------------------------------------------------------------------
    // Command lists are left-aligned, the horizontal ones centred.
    Window_Command.prototype.itemTextAlign = function() { return 'left'; };
    Window_HorzCommand.prototype.itemTextAlign = function() { return 'center'; };

    Window_MenuCommand.prototype.makeCommandList = function() {
        this.addMainCommands();
        this.addFormationCommand();
        this.addOriginalCommands();
        this.addSaveCommand();
        this.addGameEndCommand();
    };
    // VX Ace had no Options command in the menu; its main commands are Item, Skill, Equip and Status.
    Window_MenuCommand.prototype.addMainCommands = function() {
        const enabled = this.areMainCommandsEnabled();
        this.addCommand(TextManager.item, 'item', enabled);
        this.addCommand(TextManager.skill, 'skill', enabled);
        this.addCommand(TextManager.equip, 'equip', enabled);
        this.addCommand(TextManager.status, 'status', enabled);
    };
    Window_MenuCommand.prototype.addFormationCommand = function() {
        this.addCommand(TextManager.formation, 'formation', this.isFormationEnabled());
    };
    Window_MenuCommand.prototype.isFormationEnabled = function() {
        return $gameParty.size() >= 2 && $gameSystem.isFormationEnabled();
    };

    Window_Gold.prototype.refresh = function() {
        this.contents.clear();
        this.rrAceDrawCurrencyValue(this.value(), this.currencyUnit(), 4, 0, this.innerWidth - 8);
    };

    Window_MenuStatus.prototype.numVisibleRows = function() { return 4; };
    Window_MenuStatus.prototype.itemHeight = function() { return Math.floor(this.innerHeight / 4); };
    Window_MenuStatus.prototype.drawItem = function(index) {
        const actor = this.actor(index);
        const rect = this.itemRect(index);
        const enabled = actor.isBattleMember();
        this.drawPendingItemBackground(index);
        this.changePaintOpacity(enabled);
        this.drawActorFace(actor, rect.x + 1, rect.y + 1, ImageManager.faceWidth, ImageManager.faceHeight);
        this.changePaintOpacity(true);
        this.rrAceDrawActorSimpleStatus(actor, rect.x + 108, rect.y + Math.floor(this.lineHeight() / 2));
    };
    Window_MenuStatus.prototype.drawItemBackground = function() {};

    Scene_Menu.prototype.commandWindowRect = function() {
        const rows = this._rrMenuRows || 7;
        return new Rectangle(0, 0, 160, this.calcWindowHeight(rows, true));
    };
    // The command window's height follows its commands, as Ace's visible_line_number did.
    const _createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        const w = this._commandWindow;
        const rows = w.rrVisibleRows ? w.rrVisibleRows() : w.maxItems();
        w.height = this.calcWindowHeight(Math.max(rows, 1), true);
        w.createContents();
        w.refresh();
    };
    Scene_Menu.prototype.goldWindowRect = function() {
        const h = this.calcWindowHeight(1, true);
        return new Rectangle(0, Graphics.boxHeight - h, 160, h);
    };
    Scene_Menu.prototype.statusWindowRect = function() {
        return new Rectangle(160, 0, Graphics.boxWidth - 160, Graphics.boxHeight);
    };
})();
