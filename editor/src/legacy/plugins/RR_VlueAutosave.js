/*:
 * @target MZ
 * @plugindesc Basic Autosave (VX Ace), for imported games
 * @author Vlue (V.M of D.T); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_VlueAutosave.js
 *
 * The game saves itself to the autosave file (file 0, the first slot) after
 * every map transfer, a transfer within the same map too, and after every
 * battle when After battles is on, won or lost. The autosave runs whether or
 * not Save Access is on, and whatever the database's own Autosave option.
 * Starting a new game and loading a save do not autosave.
 *
 * Script calls (the import writes them from the game's Ruby):
 *   window.rrAutoSave = false     $auto_save: stops the autosave until the
 *                                 game is started again (not kept in saves)
 *   window.rrSaveGame(n)          DataManager.save_game(n): saves to file n
 *
 * On the stock save screen the autosave slot is listed under File name.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param onMap
 * @text After transfers
 * @type boolean
 * @default true
 *
 * @param afterBattle
 * @text After battles
 * @type boolean
 * @default false
 *
 * @param autoSave
 * @text Autosave on at start
 * @type boolean
 * @default true
 * @desc The script's $auto_save.
 *
 * @param nameFile
 * @text Name the autosave slot
 * @type boolean
 * @default true
 *
 * @param fileName
 * @text File name
 * @default Autosave
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_VlueAutosave');
    const bool = (v, d) => (v === undefined || v === '' ? d : String(v) === 'true');
    const ON_MAP = bool(params.onMap, true);
    const AFTER_BATTLE = bool(params.afterBattle, false);
    const NAME_FILE = bool(params.nameFile, true);
    const FILE_NAME = String(params.fileName ?? 'Autosave');

    // $auto_save lives for the session, as a Ruby global did; only false and nil turn it off.
    if (!('rrAutoSave' in window)) window.rrAutoSave = bool(params.autoSave, true);
    const autosaveOn = () => window.rrAutoSave !== false && window.rrAutoSave != null;

    window.rrSaveGame = function(savefileId) {
        $gameSystem.onBeforeSave();
        DataManager.saveGame(Number(savefileId) || 0).catch(() => {});
        return true;
    };

    // A new game's first map and a load that reloads the map (a changed game) arrive by a transfer here, but
    // were not transfers there.
    const _setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _setupNewGame.apply(this, arguments);
        this._rrSkipAutosave = true;
    };
    const _loadGame = DataManager.loadGame;
    DataManager.loadGame = function() {
        return _loadGame.apply(this, arguments).then((r) => { this._rrSkipAutosave = true; return r; });
    };
    const _start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _start.call(this);
        DataManager._rrSkipAutosave = false;
    };

    // The script's autosave, not the database option's: ignores Save Access, skipped only in tests.
    const autosaveAllowed = () => !DataManager.isBattleTest() && !DataManager.isEventTest();
    Scene_Map.prototype.isAutosaveEnabled = autosaveAllowed;
    Scene_Battle.prototype.isAutosaveEnabled = autosaveAllowed;
    Scene_Map.prototype.shouldAutosave = function() {
        return ON_MAP && autosaveOn() && !this._lastMapWasNull && !DataManager._rrSkipAutosave;
    };
    Scene_Battle.prototype.shouldAutosave = function() { return AFTER_BATTLE && autosaveOn(); };

    // The stock save screen: the autosave slot is always listed, under the script's name.
    Scene_File.prototype.needsAutosave = function() { return true; };
    const _drawTitle = Window_SavefileList.prototype.drawTitle;
    Window_SavefileList.prototype.drawTitle = function(savefileId, x, y) {
        if (NAME_FILE && savefileId === 0) return this.drawText(FILE_NAME, x, y, 180);
        return _drawTitle.apply(this, arguments);
    };
})();
