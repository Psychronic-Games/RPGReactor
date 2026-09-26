/*:
 * @target MZ
 * @plugindesc Ace Menu Engine (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyMenu.js
 *
 * The main menu's commands in the order and with the names the game set,
 * including commands that open another screen or run a common event (and
 * are shown or enabled by a switch), the command window only as tall as its
 * commands (up to a maximum), the menu on the left or the right, the text
 * alignment of the menu and of every other command list, and the item
 * screen's help window above, between or below its other windows. The party
 * shows TP and MP gauges only for actors with skills that cost them.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commands
 * @type multiline_string
 * @default []
 * @desc JSON: [{ symbol, kind: "main"|"custom"|"common", text, show, enable, handler|commonEvent }].
 *
 * @param helpLocation
 * @text Help window on the item screen
 * @type select
 * @option top
 * @option middle
 * @option bottom
 * @default middle
 *
 * @param commandAlign
 * @type select
 * @option left
 * @option center
 * @option right
 * @default center
 *
 * @param menuAlign
 * @type select
 * @option left
 * @option center
 * @option right
 * @default left
 *
 * @param menuRight
 * @type boolean
 * @default false
 *
 * @param menuRows
 * @type number
 * @default 11
 *
 * @param drawTp
 * @type boolean
 * @default true
 *
 * @param drawMp
 * @type boolean
 * @default true
 *
 * @param tpFirst
 * @text TP gauge before MP
 * @type boolean
 * @default false
 * @desc When both show; the original swapped them when Yanfly's battle engine was in the game.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyMenu');
    let COMMANDS = [];
    try { COMMANDS = JSON.parse(params.commands || '[]') || []; } catch (_) { COMMANDS = []; }
    const COMMAND_ALIGN = String(params.commandAlign || 'center');
    const MENU_ALIGN = String(params.menuAlign || 'left');
    const MENU_RIGHT = String(params.menuRight) === 'true';
    const MENU_ROWS = Number(params.menuRows) || 11;
    const DRAW_TP = String(params.drawTp) !== 'false';
    const DRAW_MP = String(params.drawMp) !== 'false';
    const TP_FIRST = String(params.tpFirst) === 'true';
    const HELP_LOCATION = String(params.helpLocation || 'middle');

    // The screens a custom command's method opened; one whose screen is not in the game is shown disabled.
    const SCENES = {
        command_quest: 'Scene_Quest', command_quit: 'Scene_GameEnd', command_debug: 'Scene_Debug', command_shop: 'Scene_Shop',
        command_difficulty: 'Scene_RRCscaDifficulty', command_ach: 'Scene_RRCscaAchievements', command_database: 'Scene_RRCscaEncyclopedia'
    };
    const sceneFor = (handler) => window[SCENES[handler]] || null;
    const switchOn = (id) => Number(id) <= 0 || $gameSwitches.value(Number(id));

    Window_Command.prototype.itemTextAlign = function() { return COMMAND_ALIGN; };
    Window_MenuCommand.prototype.itemTextAlign = function() { return MENU_ALIGN; };
    Window_MenuCommand.prototype.rrVisibleRows = function() { return Math.max(Math.min(this.maxItems(), MENU_ROWS), 1); };

    Window_MenuCommand.prototype.makeCommandList = function() {
        const enabled = this.areMainCommandsEnabled();
        for (const c of COMMANDS) {
            if (c.kind === 'main') {
                switch (c.symbol) {
                    case 'item': this.addCommand(TextManager.item, 'item', enabled); break;
                    case 'skill': this.addCommand(TextManager.skill, 'skill', enabled); break;
                    case 'equip': this.addCommand(TextManager.equip, 'equip', enabled); break;
                    case 'status': this.addCommand(TextManager.status, 'status', enabled); break;
                    case 'formation': this.addFormationCommand(); break;
                    // The game's own commands (a mail box, …) come before Save, as the original placed them.
                    case 'save': this.addOriginalCommands(); this.addSaveCommand(); break;
                    case 'game_end': this.addGameEndCommand(); break;
                }
                continue;
            }
            if (!switchOn(c.show)) continue;
            const on = switchOn(c.enable);
            if (c.kind === 'common') this.addCommand(c.text, 'rrCommon:' + c.symbol, on, Number(c.commonEvent) || 0);
            // The quest log keeps its own symbol, so the runtime does not add it a second time.
            else if (c.handler === 'command_quest') this.addCommand(c.text, 'reactorQuest', on && !!sceneFor(c.handler));
            else this.addCommand(c.text, 'rrCustom:' + c.symbol, on && !!sceneFor(c.handler), c.handler);
        }
    };

    const _createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _createCommandWindow.call(this);
        const w = this._commandWindow;
        for (const c of COMMANDS) {
            if (c.kind === 'common') w.setHandler('rrCommon:' + c.symbol, this.rrCommandCommonEvent.bind(this));
            else if (c.kind === 'custom' && c.handler === 'command_quest') w.setHandler('reactorQuest', () => SceneManager.push(Scene_Quest));
            else if (c.kind === 'custom') w.setHandler('rrCustom:' + c.symbol, this.rrCommandCustom.bind(this));
        }
    };
    Scene_Menu.prototype.rrCommandCommonEvent = function() {
        const id = this._commandWindow.currentExt();
        if (id && $dataCommonEvents[id]) $gameTemp.reserveCommonEvent(id);
        SceneManager.goto(Scene_Map);
    };
    Scene_Menu.prototype.rrCommandCustom = function() {
        const handler = this._commandWindow.currentExt();
        const scene = sceneFor(handler);
        if (!scene) return this._commandWindow.activate();
        SceneManager.push(scene);
        if (handler === 'command_shop') SceneManager.prepareNextScene([], false);
    };

    const _start = Scene_Menu.prototype.start;
    Scene_Menu.prototype.start = function() {
        _start.call(this);
        if (!MENU_RIGHT) return;
        this._commandWindow.x = Graphics.boxWidth - this._commandWindow.width;
        this._goldWindow.x = Graphics.boxWidth - this._goldWindow.width;
        this._statusWindow.x = 0;
    };

    // The item screen's windows are stacked again around the help window, keeping their sizes.
    const _itemStart = Scene_Item.prototype.start;
    Scene_Item.prototype.start = function() {
        _itemStart.call(this);
        const help = this._helpWindow, category = this._categoryWindow, list = this._itemWindow;
        if (HELP_LOCATION === 'top') { help.y = 0; category.y = help.height; list.y = category.y + category.height; }
        else if (HELP_LOCATION === 'middle') { category.y = 0; help.y = category.height; list.y = help.y + help.height; }
        else { category.y = 0; list.y = category.height; help.y = list.y + list.height; }
    };

    // TP and MP are drawn for an actor with a skill (of a skill type they can use) that costs them.
    const costs = (actor, key) => actor.skills().some(s => actor.addedSkillTypes().includes(s.stypeId) && s[key] > 0);
    Game_Actor.prototype.rrDrawMp = function() { return costs(this, 'mpCost'); };
    Game_Actor.prototype.rrDrawTp = function() { return !!$dataSystem.optDisplayTp && costs(this, 'tpCost'); };

    Window_Base.prototype.rrAceDrawActorSimpleStatus = function(actor, x, y) {
        const lh = this.lineHeight();
        y -= Math.floor(lh / 2);
        const w = this.contents.width - x - 124;
        this.rrAceDrawActorName(actor, x, y);
        this.rrAceDrawActorLevel(actor, x, y + lh);
        this.rrAceDrawActorIcons(actor, x, y + lh * 2);
        this.rrAceDrawActorClass(actor, x + 120, y, w);
        this.rrAceDrawActorHp(actor, x + 120, y + lh, w);
        const tp = DRAW_TP && actor.rrDrawTp(), mp = DRAW_MP && actor.rrDrawMp();
        const half = Math.floor(w / 2);
        if (tp && !mp) this.rrAceDrawActorTp(actor, x + 120, y + lh * 2, w);
        else if (tp && mp && TP_FIRST) {
            this.rrAceDrawActorTp(actor, x + 120, y + lh * 2, half - 1);
            this.rrAceDrawActorMp(actor, x + 120 + half, y + lh * 2, half + 1);
        } else if (tp && mp) {
            this.rrAceDrawActorMp(actor, x + 120, y + lh * 2, half - 1);
            this.rrAceDrawActorTp(actor, x + 120 + half, y + lh * 2, half + 1);
        } else if (mp) this.rrAceDrawActorMp(actor, x + 120, y + lh * 2, w);
    };
})();
