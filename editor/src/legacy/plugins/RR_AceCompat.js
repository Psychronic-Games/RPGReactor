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
 *   Items         help at the top, the categories under it, and the list
 *                 to the bottom, each item with its icon, name and ":n".
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
