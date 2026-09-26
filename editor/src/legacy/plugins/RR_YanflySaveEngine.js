/*:
 * @target MZ
 * @plugindesc Ace Save Engine (VX Ace), for imported games
 * @author Yanfly; Galv (confirmation add-on); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflySaveEngine.js
 *
 * The save and load screens become one: a help line at the top, the save
 * slots down the left (an icon when the slot holds a save), Load, Save and
 * Delete across the top, and the chosen slot's details under them: its
 * number, playtime, times saved, gold, location, the party's walking
 * graphics with names and levels, and the game's chosen variables in two
 * columns. The menu's Save command is always available; Save on the screen
 * follows Save Access. Load from the title (or any Scene_Load) only loads.
 *
 * With Galv's confirmation add-on, overwriting a save, deleting one and
 * loading from the menu ask Yes or No first.
 *
 * Slots are save files: the slot shown as "Save n" is file n-1, so the first
 * slot is file 0, the one Reactor's autosave writes. With the add-on that
 * names it, the first slot reads "Autosave".
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param maxFiles
 * @text Save slots
 * @type number
 * @min 1
 * @default 16
 *
 * @param slotName
 * @default Save %s
 * @desc %s is the slot number.
 *
 * @param autosaveName
 * @text First slot's name
 * @default
 * @desc When set, the first slot is listed under this name (the autosave file-name add-on).
 *
 * @param saveIcon
 * @type number
 * @default 368
 *
 * @param emptyIcon
 * @type number
 * @default 375
 *
 * @param actionLoad
 * @default Load
 *
 * @param actionSave
 * @default Save
 *
 * @param actionDelete
 * @default Delete
 *
 * @param deleteSound
 * @default {"name":"","volume":100,"pitch":100}
 * @desc JSON { name, volume, pitch }; no name plays nothing.
 *
 * @param selectHelp
 * @default Please select a save slot.
 *
 * @param loadHelp
 * @default Loads the data from the saved game.
 *
 * @param saveHelp
 * @default Saves the current progress in your game.
 *
 * @param deleteHelp
 * @default Deletes all data from this save file.
 *
 * @param emptyText
 * @default No Data
 *
 * @param playtime
 * @default Playtime
 *
 * @param totalSave
 * @default Total Saves:
 *
 * @param totalGold
 * @default Total Gold:
 *
 * @param location
 * @default Location:
 *
 * @param column1
 * @default [1,2,3]
 * @desc JSON: the variable ids shown in the left column.
 *
 * @param column2
 * @default [4,5,6]
 * @desc JSON: the variable ids shown in the right column.
 *
 * @param confirm
 * @text Confirm (Galv's add-on)
 * @type boolean
 * @default false
 *
 * @param confirmDelete
 * @default Are you sure you want to delete this save file?
 *
 * @param confirmSave
 * @default Are you sure you want to overwrite this save file?
 *
 * @param confirmLoad
 * @default Are you sure you want to load this save file?
 *
 * @param rgssFontSize
 * @text Game's RGSS font size
 * @type number
 * @default 24
 * @desc The party's names and levels are drawn 8 smaller, in proportion to it.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflySaveEngine');
    const json = (text, d) => { try { return JSON.parse(text) ?? d; } catch (_) { return d; } };
    const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
    const P = {
        maxFiles: Math.max(1, num(params.maxFiles, 16)), slotName: String(params.slotName ?? 'Save %s'), autosaveName: String(params.autosaveName || ''),
        saveIcon: num(params.saveIcon, 368), emptyIcon: num(params.emptyIcon, 375),
        actionLoad: String(params.actionLoad ?? 'Load'), actionSave: String(params.actionSave ?? 'Save'), actionDelete: String(params.actionDelete ?? 'Delete'),
        deleteSound: json(params.deleteSound, {}),
        selectHelp: String(params.selectHelp ?? ''), loadHelp: String(params.loadHelp ?? ''), saveHelp: String(params.saveHelp ?? ''), deleteHelp: String(params.deleteHelp ?? ''),
        emptyText: String(params.emptyText ?? ''), playtime: String(params.playtime ?? ''), totalSave: String(params.totalSave ?? ''),
        totalGold: String(params.totalGold ?? ''), location: String(params.location ?? ''),
        column1: json(params.column1, []), column2: json(params.column2, []),
        confirm: String(params.confirm) === 'true',
        confirmDelete: String(params.confirmDelete ?? ''), confirmSave: String(params.confirmSave ?? ''), confirmLoad: String(params.confirmLoad ?? ''),
        rgssFontSize: num(params.rgssFontSize, 24) || 24
    };
    const COLUMN_IDS = [...new Set([].concat(P.column1, P.column2).map(Number).filter(n => n > 0))];

    // Ruby's sprintf for the slot name: %s and %d take the number.
    const format = (pattern, value) => pattern.replace(/%%|%[sd]/g, m => (m === '%%' ? '%' : String(value)));
    const group = (win, n) => (typeof win.rrAceGroup === 'function' ? win.rrAceGroup(n) : String(n));
    const isLoadScene = (scene) => typeof Scene_Load === 'function' && scene instanceof Scene_Load;

    //-------------------------------------------------------------------------
    // Slots and files: slot n is file n (0 is the autosave file)
    //-------------------------------------------------------------------------
    DataManager.maxSavefiles = function() { return P.maxFiles; };
    // A playtest keeps its checkpoint in a file of its own, which the list leaves out.
    DataManager.rrYeaSlotCount = function() {
        const checkpoint = this.isPlaytestCheckpointEnabled && this.isPlaytestCheckpointEnabled() ? this.PLAYTEST_CHECKPOINT_ID : undefined;
        return checkpoint >= 0 && checkpoint < P.maxFiles ? checkpoint : P.maxFiles;
    };
    DataManager.rrYeaInfo = function(savefileId) { return this.savefileInfo(savefileId); };
    // The file last saved or loaded, the save screen's first slot (0 until one is).
    DataManager._rrLastSavefileId = 0;
    DataManager.rrYeaLastSavefileId = function() { return this._rrLastSavefileId || 0; };
    // The newest file of all the slots, the autosave's too; the first slot when none exists.
    DataManager.rrYeaLatestSavefileId = function() {
        let best = 0, stamp = -Infinity;
        for (let id = 0; id < this.rrYeaSlotCount(); id++) {
            const info = this.savefileInfo(id);
            if (info && (info.timestamp || 0) > stamp) { best = id; stamp = info.timestamp || 0; }
        }
        return best;
    };
    const record = (id) => { if (id !== DataManager.PLAYTEST_CHECKPOINT_ID) DataManager._rrLastSavefileId = id; };
    const _saveGame = DataManager.saveGame;
    DataManager.saveGame = function(savefileId) {
        return _saveGame.apply(this, arguments).then((r) => { record(savefileId); return r; });
    };
    const _loadGame = DataManager.loadGame;
    DataManager.loadGame = function(savefileId) {
        return _loadGame.apply(this, arguments).then((r) => { record(savefileId); return r; });
    };
    DataManager.rrYeaDeleteSavefile = function(savefileId) {
        try { StorageManager.remove(this.makeSavename(savefileId)); } catch (_) { /* a file already gone is deleted */ }
        if (this._globalInfo) {
            delete this._globalInfo[savefileId];
            this.saveGlobalInfo(this._globalInfo);
        }
    };
    // The details the status window shows, kept in the save list beside the file.
    const _makeSavefileInfo = DataManager.makeSavefileInfo;
    DataManager.makeSavefileInfo = function() {
        const info = _makeSavefileInfo.call(this);
        const variables = {};
        for (const id of COLUMN_IDS) variables[id] = $gameVariables.value(id);
        info.rrYea = {
            saveCount: $gameSystem.saveCount(), gold: $gameParty.gold(), mapId: $gameMap.mapId(), displayName: ($dataMap && $gameMap.displayName()) || '',
            maxBattleMembers: $gameParty.maxBattleMembers(), variables,
            members: $gameParty.battleMembers().map(a => ({ name: a.name(), level: a.level, characterName: a.characterName(), characterIndex: a.characterIndex() }))
        };
        return info;
    };

    // The menu's Save command is always available.
    Window_MenuCommand.prototype.isSaveEnabled = function() { return true; };

    //-------------------------------------------------------------------------
    // The slot list
    //-------------------------------------------------------------------------
    function Window_RRYeaFileList() { this.initialize(...arguments); }
    Window_RRYeaFileList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRYeaFileList.prototype.constructor = Window_RRYeaFileList;
    window.Window_RRYeaFileList = Window_RRYeaFileList;
    Window_RRYeaFileList.prototype.initialize = function(rect, loadOnly) {
        this._loadOnly = !!loadOnly;
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
        this.activate();
    };
    Window_RRYeaFileList.prototype.maxItems = function() { return DataManager.rrYeaSlotCount(); };
    // On the load screen an empty slot cannot be chosen.
    Window_RRYeaFileList.prototype.isCurrentItemEnabled = function() {
        return !(this._loadOnly && !DataManager.rrYeaInfo(this.index()));
    };
    Window_RRYeaFileList.prototype.slotName = function(index) {
        return index === 0 && P.autosaveName ? P.autosaveName : format(P.slotName, group(this, index + 1));
    };
    Window_RRYeaFileList.prototype.drawItem = function(index) {
        const enabled = !!DataManager.rrYeaInfo(index);
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.drawIcon(enabled ? P.saveIcon : P.emptyIcon, rect.x, rect.y, enabled);
        this.resetTextColor();
        this.changePaintOpacity(enabled);
        this.drawText(this.slotName(index), rect.x + 24, rect.y, rect.width - 24);
        this.changePaintOpacity(true);
    };

    //-------------------------------------------------------------------------
    // Load, Save, Delete
    //-------------------------------------------------------------------------
    function Window_RRYeaFileAction() { this.initialize(...arguments); }
    Window_RRYeaFileAction.prototype = Object.create(Window_HorzCommand.prototype);
    Window_RRYeaFileAction.prototype.constructor = Window_RRYeaFileAction;
    window.Window_RRYeaFileAction = Window_RRYeaFileAction;
    Window_RRYeaFileAction.prototype.initialize = function(rect, fileWindow, loadOnly) {
        this._fileWindow = fileWindow;
        this._loadOnly = !!loadOnly;
        this._currentIndex = undefined;
        Window_HorzCommand.prototype.initialize.call(this, rect);
        this.deactivate();
        this.deselect();
    };
    Window_RRYeaFileAction.prototype.maxCols = function() { return 3; };
    // The commands follow the slot the list is on.
    Window_RRYeaFileAction.prototype.update = function() {
        Window_HorzCommand.prototype.update.call(this);
        const index = this._fileWindow.index();
        if (index < 0 || index === this._currentIndex) return;
        this._currentIndex = index;
        this.refresh();
    };
    Window_RRYeaFileAction.prototype.makeCommandList = function() {
        const saved = !!DataManager.rrYeaInfo(this._fileWindow ? this._fileWindow.index() : -1);
        this.addCommand(P.actionLoad, 'load', saved);
        this.addCommand(P.actionSave, 'save', !this._loadOnly && $gameSystem.isSaveEnabled());
        this.addCommand(P.actionDelete, 'delete', saved);
    };
    Window_RRYeaFileAction.prototype.updateHelp = function() {
        const text = { load: P.loadHelp, save: P.saveHelp, delete: P.deleteHelp }[this.currentSymbol()];
        if (text !== undefined) this._helpWindow.setText(text);
    };

    //-------------------------------------------------------------------------
    // The chosen slot's details
    //-------------------------------------------------------------------------
    function Window_RRYeaFileStatus() { this.initialize(...arguments); }
    Window_RRYeaFileStatus.prototype = Object.create(Window_Base.prototype);
    Window_RRYeaFileStatus.prototype.constructor = Window_RRYeaFileStatus;
    window.Window_RRYeaFileStatus = Window_RRYeaFileStatus;
    Window_RRYeaFileStatus.prototype.initialize = function(rect, fileWindow) {
        this._fileWindow = fileWindow;
        this._currentIndex = fileWindow.index();
        this._pending = [];
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_RRYeaFileStatus.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        // Walking graphics still loading are drawn when they arrive.
        if (this._pending.length && this._pending.every(b => b.isReady())) this.refresh();
        const index = this._fileWindow.index();
        if (index < 0 || index === this._currentIndex) return;
        this._currentIndex = index;
        this.refresh();
    };
    Window_RRYeaFileStatus.prototype.refresh = function() {
        this.contents.clear();
        this.resetFontSettings();
        this._pending = [];
        this._info = DataManager.rrYeaInfo(this._fileWindow.index());
        if (this._info) this.drawSaveContents(); else this.drawEmpty();
    };
    Window_RRYeaFileStatus.prototype.drawEmpty = function() {
        const cw = this.contents.width, ch = this.contents.height;
        this.contents.fillRect(0, 0, cw, ch, `rgba(0, 0, 0, ${this.translucentOpacity() / 2 / 255})`);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(P.emptyText, 0, Math.floor((ch - this.lineHeight()) / 2), cw, 'center');
    };
    Window_RRYeaFileStatus.prototype.makeFontSmaller = function() {
        const size = P.rgssFontSize;
        if (size >= 16) this.contents.fontSize = $gameSystem.mainFontSize() * (size - 8) / size;
    };
    // A label in the system colour with its value after it.
    Window_RRYeaFileStatus.prototype.drawPair = function(label, value, x, y, width) {
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(label, x, y, width);
        const cx = this.textWidth(label);
        this.resetTextColor();
        this.drawText(value, x + cx, y, width - cx);
    };
    Window_RRYeaFileStatus.prototype.drawSaveSlot = function(x, y, width) {
        this.resetFontSettings();
        this.drawPair(format(P.slotName, ''), group(this, this._fileWindow.index() + 1), x, y, width);
    };
    Window_RRYeaFileStatus.prototype.drawSavePlaytime = function(x, y, width) {
        if (this._info.playtime == null) return;
        this.resetFontSettings();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(P.playtime, x, y, width);
        this.resetTextColor();
        this.drawText(this._info.playtime, x, y, width, 'right');
    };
    Window_RRYeaFileStatus.prototype.drawSaveTotalSaves = function(x, y, width) {
        const yea = this._info.rrYea;
        if (!yea) return;
        this.resetFontSettings();
        this.drawPair(P.totalSave, group(this, yea.saveCount), x, y, width);
    };
    Window_RRYeaFileStatus.prototype.drawSaveGold = function(x, y, width) {
        const yea = this._info.rrYea;
        if (!yea) return;
        this.resetFontSettings();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(P.totalGold, x, y, width);
        const unit = TextManager.currencyUnit;
        this.drawText(unit, x, y, width, 'right');
        const cx = this.textWidth(unit);
        this.resetTextColor();
        this.drawText(group(this, yea.gold), x, y, width - cx, 'right');
    };
    // The map's display name, else its name in the map list; nothing after the label for a map no longer there.
    Window_RRYeaFileStatus.prototype.drawSaveLocation = function(x, y, width) {
        const yea = this._info.rrYea;
        if (!yea) return;
        this.resetFontSettings();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(P.location, x, y, width);
        this.resetTextColor();
        const cx = this.textWidth(P.location);
        const mapInfo = $dataMapInfos && $dataMapInfos[yea.mapId];
        if (!mapInfo) return;
        this.drawText(yea.displayName || mapInfo.name, x + cx, y, width - cx);
    };
    // Each battle member's walking graphic stands on the line, the name under it and the level over it.
    Window_RRYeaFileStatus.prototype.drawSaveCharacters = function(x, y) {
        const yea = this._info.rrYea;
        if (!yea) return;
        this.resetFontSettings();
        this.makeFontSmaller();
        const lh = this.lineHeight();
        const dw = Math.floor((this.contents.width - x) / Math.max(1, yea.maxBattleMembers || 4));
        let dx = x + Math.floor(dw / 2);
        for (const member of yea.members || []) {
            if (!member) continue;
            this.resetTextColor();
            if (member.characterName) {
                const bitmap = ImageManager.loadCharacter(member.characterName);
                if (bitmap.isReady()) this.drawCharacter(member.characterName, member.characterIndex, dx, y);
                else this._pending.push(bitmap);
            }
            const left = dx - Math.floor(dw / 2);
            this.drawText(member.name, left, y, dw, 'center');
            const level = group(this, member.level);
            this.drawText(level, left, y - lh, dw - 4, 'right');
            const cx = this.textWidth(level);
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.levelA, left, y - lh, dw - cx - 4, 'right');
            dx += dw;
        }
    };
    // Each variable's name from the database, its value at the right; strings as they are.
    Window_RRYeaFileStatus.prototype.drawColumnData = function(ids, x, y, width) {
        const yea = this._info.rrYea;
        if (!yea || !yea.variables) return;
        this.resetFontSettings();
        for (const id of ids) {
            const name = $dataSystem.variables[id];
            if (name == null) continue;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(name, x, y, width);
            let value = yea.variables[id];
            if (typeof value === 'number') value = group(this, value);
            this.resetTextColor();
            this.drawText(value == null ? '' : value, x, y, width, 'right');
            y += this.lineHeight();
        }
    };
    Window_RRYeaFileStatus.prototype.drawSaveContents = function() {
        const cw = this.contents.width, lh = this.lineHeight(), half = Math.floor(cw / 2);
        this.drawSaveSlot(4, 0, half - 8);
        this.drawSavePlaytime(half + 4, 0, half - 8);
        this.drawSaveTotalSaves(4, lh, half - 8);
        this.drawSaveGold(half + 4, lh, half - 8);
        this.drawSaveLocation(4, lh * 2, cw - 8);
        this.drawSaveCharacters(0, lh * 5 + Math.floor(lh / 3));
        this.drawColumnData(P.column1, 16, lh * 7, half - 48);
        this.drawColumnData(P.column2, half + 16, lh * 7, half - 48);
    };

    //-------------------------------------------------------------------------
    // Galv's Yes / No
    //-------------------------------------------------------------------------
    function Window_RRYeaConfirm() { this.initialize(...arguments); }
    Window_RRYeaConfirm.prototype = Object.create(Window_Command.prototype);
    Window_RRYeaConfirm.prototype.constructor = Window_RRYeaConfirm;
    window.Window_RRYeaConfirm = Window_RRYeaConfirm;
    Window_RRYeaConfirm.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
        this.backOpacity = 255;
    };
    Window_RRYeaConfirm.prototype.updateBackOpacity = function() { this.backOpacity = 255; };
    Window_RRYeaConfirm.prototype.makeCommandList = function() {
        this.addCommand('Yes', 'yes');
        this.addCommand('No', 'no');
    };
    Window_RRYeaConfirm.prototype.updateHelp = function() {};

    //-------------------------------------------------------------------------
    // The scene (Scene_Save and Scene_Load alike)
    //-------------------------------------------------------------------------
    const S = Scene_File.prototype;
    S.rrYeaLoadOnly = function() { return isLoadScene(this); };
    S.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        DataManager.loadAllSavefileImages();
        this.createHelpWindow();
        this._helpWindow.setText(P.selectHelp);
        this.createFileWindow();
        this.createActionWindow();
        this.createStatusWindow();
        if (P.confirm) this.createConfirmWindow();
    };
    S.start = function() { Scene_MenuBase.prototype.start.call(this); };
    S.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false)); };
    S.createFileWindow = function() {
        const wy = this._helpWindow.height;
        const w = new Window_RRYeaFileList(new Rectangle(0, wy, 128, Graphics.boxHeight - wy), this.rrYeaLoadOnly());
        w.select(Math.min(Math.max(this.firstSavefileId(), 0), w.maxItems() - 1));
        w.ensureCursorVisible(false);
        w.setHandler('ok', this.onFileOk.bind(this));
        w.setHandler('cancel', this.popScene.bind(this));
        this._fileWindow = w;
        this.addWindow(w);
    };
    S.createActionWindow = function() {
        const wx = this._fileWindow.width, wy = this._helpWindow.height;
        const w = new Window_RRYeaFileAction(new Rectangle(wx, wy, Graphics.boxWidth - wx, this.calcWindowHeight(1, true)), this._fileWindow, this.rrYeaLoadOnly());
        w.setHelpWindow(this._helpWindow);
        w.setHandler('cancel', this.onActionCancel.bind(this));
        w.setHandler('load', this.onActionLoad.bind(this));
        w.setHandler('save', this.onActionSave.bind(this));
        w.setHandler('delete', this.onActionDelete.bind(this));
        this._actionWindow = w;
        this.addWindow(w);
    };
    S.createStatusWindow = function() {
        const a = this._actionWindow, wy = a.y + a.height;
        this._statusWindow = new Window_RRYeaFileStatus(new Rectangle(a.x, wy, Graphics.boxWidth - a.x, Graphics.boxHeight - wy), this._fileWindow);
        this.addWindow(this._statusWindow);
    };
    S.createConfirmWindow = function() {
        // 200 wide, centred, its top at the middle of the screen.
        const w = new Window_RRYeaConfirm(new Rectangle(Math.floor((Graphics.boxWidth - 200) / 2), Math.floor(Graphics.boxHeight / 2), 200, this.calcWindowHeight(2, true)));
        w.setHelpWindow(this._helpWindow);
        w.hide();
        w.deactivate();
        w.setHandler('ok', this.onConfirmOk.bind(this));
        w.setHandler('cancel', this.onConfirmCancel.bind(this));
        this._confirmWindow = w;
        this.addWindow(w);
    };
    S.savefileId = function() { return this._fileWindow.index(); };
    S.isSavefileEnabled = function(savefileId) { return !!DataManager.rrYeaInfo(savefileId); };
    S.activateListWindow = function() { this._fileWindow.activate(); };
    // An active command list shows its command's help, as activating one did.
    S.activateActions = function() {
        this._actionWindow.activate();
        this._actionWindow.callUpdateHelp();
    };
    S.refreshWindows = function() {
        this._fileWindow.refresh();
        this._actionWindow.refresh();
        this._statusWindow.refresh();
    };

    S.onFileOk = function() {
        this._actionWindow.activate();
        this._actionWindow.select(this.rrYeaLoadOnly() ? 0 : 1);
    };
    S.onActionCancel = function() {
        this._actionWindow.deselect();
        this._fileWindow.activate();
        this._helpWindow.setText(P.selectHelp);
    };
    S.confirmChoice = function() {
        this._actionWindow.deactivate();
        this._confirmWindow.select(0);
        this._confirmWindow.show();
        this._confirmWindow.activate();
        const text = { load: P.confirmLoad, save: P.confirmSave, delete: P.confirmDelete }[this._actionWindow.currentSymbol()];
        if (text !== undefined) this._helpWindow.setText(text);
    };
    S.onConfirmOk = function() {
        if (this._confirmWindow.currentSymbol() === 'yes') {
            const symbol = this._actionWindow.currentSymbol();
            if (symbol === 'load') this.executeLoadSlot(this.savefileId());
            else if (symbol === 'save') { this.doSave(); this.refreshWindows(); }
            else if (symbol === 'delete') { this.doDelete(); this.refreshWindows(); }
        }
        this.onConfirmCancel();
    };
    S.onConfirmCancel = function() {
        this.activateActions();
        this._confirmWindow.hide();
        this._confirmWindow.deactivate();
    };

    // Load: straight away on the load screen; from the menu, after Yes (with the add-on).
    S.onActionLoad = function() {
        const id = this.savefileId();
        if (this.rrYeaLoadOnly() || !P.confirm) return this.executeLoadSlot(id);
        if (DataManager.savefileExists(id)) return this.confirmChoice();
        SoundManager.playBuzzer();
        this.activateActions();
    };
    S.executeLoadSlot = function(savefileId) {
        DataManager.loadGame(savefileId)
            .then(() => this.onYeaLoadSuccess())
            .catch(() => { SoundManager.playBuzzer(); this.activateActions(); });
    };
    // The load screen's own success (which other ports extend); from the menu, the same steps without them.
    S.onYeaLoadSuccess = function() {
        if (isLoadScene(this)) return this.onLoadSuccess();
        SoundManager.playLoad();
        this.fadeOutAll();
        Scene_Load.prototype.reloadMapIfUpdated.call(this);
        SceneManager.goto(Scene_Map);
        this._rrYeaLoaded = true;
    };
    const _terminate = S.terminate;
    S.terminate = function() {
        _terminate.call(this);
        if (this._rrYeaLoaded) $gameSystem.onAfterLoad();
    };

    // Save: an empty slot at once, a used one after Yes (with the add-on). The screen stays open.
    S.onActionSave = function() {
        if (P.confirm && DataManager.rrYeaInfo(this.savefileId())) return this.confirmChoice();
        this.doSave();
        this.refreshWindows();
    };
    S.doSave = function() {
        this.activateActions();
        const id = this.savefileId();
        $gameSystem.setSavefileId(id);
        $gameSystem.onBeforeSave();
        DataManager.saveGame(id)
            .then(() => { SoundManager.playSave(); this.refreshWindows(); })
            .catch(() => SoundManager.playBuzzer());
    };

    S.onActionDelete = function() {
        if (P.confirm) return this.confirmChoice();
        this.doDelete();
    };
    S.doDelete = function() {
        this.activateActions();
        DataManager.rrYeaDeleteSavefile(this.savefileId());
        if (P.deleteSound && P.deleteSound.name) AudioManager.playSe({ name: P.deleteSound.name, volume: num(P.deleteSound.volume, 100), pitch: num(P.deleteSound.pitch, 100), pan: 0 });
        this.refreshWindows();
    };

    Scene_Save.prototype.firstSavefileId = function() { return DataManager.rrYeaLastSavefileId(); };
    Scene_Load.prototype.firstSavefileId = function() { return DataManager.rrYeaLatestSavefileId(); };
})();
