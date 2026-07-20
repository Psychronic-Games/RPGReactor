/*:
 * @target MZ
 * @plugindesc Adds Extra Functionality to the Save/Load Screen for RPG Maker MZ.
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @command triggerAutosave
 * @text Trigger Autosave
 * @desc Saves the game to the autosave slot.
 *
 * @help PSYCHRONIC_MegaSaveMZ.js
 *
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * This plugin completely overhauls the save/load screen in RPG Maker MZ.
 *
 * Features:
 * - Display character sprites on save files
 * - Three configurable statistics columns
 * - Customizable command buttons (Load/Save/Delete)
 * - Support for text codes like \i[52], \c[3] in stat labels
 * - Autosave slot as first entry in save list
 * - Plugin command to trigger autosave
 * - Customizable autosave popup notification
 * - Configurable autosave sound effect
 *
 * ============================================================================
 * Notes
 * ============================================================================
 *
 * - The Autosave Icon parameter only affects the save menu list
 * - To add an icon to the popup, manually include \i[x] in the popup text
 * - Example: Set popup text to "\i[652] Autosave Complete"
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 * Trigger Autosave
 *   - Saves the current game to the autosave slot (appears first in list)
 *   - Use this in events to create manual autosave points
 *   - Shows popup notification if enabled
 *   - Plays custom sound effect if configured
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 *
 * Free for commercial and non-commercial use.
 * Credit Psychronic in your game.
 *
 * @param FileListSettings
 * @text File List Settings
 *
 * @param maxSaveFiles
 * @text Max Save Files
 * @parent FileListSettings
 * @type number
 * @min 1
 * @max 999
 * @default 50
 * @desc Maximum number of manual save files (not counting autosave).
 *
 * @param fileListWidth
 * @text File List Width
 * @parent FileListSettings
 * @type number
 * @min 100
 * @max 400
 * @default 160
 * @desc Width of the file list column in pixels.
 *
 * @param fileItemHeight
 * @text File Item Height
 * @parent FileListSettings
 * @type number
 * @min 20
 * @max 100
 * @default 36
 * @desc Height of each file slot in pixels.
 *
 * @param autosaveIcon
 * @text Autosave Icon
 * @parent FileListSettings
 * @type number
 * @min 0
 * @default 0
 * @desc Icon for autosave slot in the save menu list (0 = no icon). For popup icon, use \i[x] in popup text.
 *
 * @param savedFileIcon
 * @text Saved File Icon
 * @parent FileListSettings
 * @type number
 * @min 0
 * @default 0
 * @desc Icon for slots with save data (0 = green square).
 *
 * @param emptyFileIcon
 * @text Empty File Icon
 * @parent FileListSettings
 * @type number
 * @min 0
 * @default 0
 * @desc Icon for empty slots (0 = gray square).
 *
 * @param DisplaySettings
 * @text Display Settings
 *
 * @param autosaveText
 * @text Autosave Text
 * @parent DisplaySettings
 * @type text
 * @default Autosave
 * @desc Text to display for the autosave slot.
 *
 * @param gameTitle
 * @text Game Title
 * @parent DisplaySettings
 * @type text
 * @default Star-Shift: Freelancers
 * @desc Game title shown below the command buttons.
 *
 * @param showMapName
 * @text Show Map/Location Line
 * @parent DisplaySettings
 * @type boolean
 * @default true
 * @desc Show the current map name between characters and stats.
 *
 * @param CommandSettings
 * @text Command Button Settings
 *
 * @param loadCommandIcon
 * @text Load Icon
 * @parent CommandSettings
 * @type number
 * @default 0
 * @desc Icon index for Load button (0 = no icon).
 *
 * @param saveCommandIcon
 * @text Save Icon
 * @parent CommandSettings
 * @type number
 * @default 0
 * @desc Icon index for Save button (0 = no icon).
 *
 * @param deleteCommandIcon
 * @text Delete Icon
 * @parent CommandSettings
 * @type number
 * @default 0
 * @desc Icon index for Delete button (0 = no icon).
 *
 * @param loadCommandText
 * @text Load Button Text
 * @parent CommandSettings
 * @type text
 * @default LOAD
 * @desc Text for Load button. Use \i[x] for inline icons.
 *
 * @param saveCommandText
 * @text Save Button Text
 * @parent CommandSettings
 * @type text
 * @default SAVE
 * @desc Text for Save button. Use \i[x] for inline icons.
 *
 * @param deleteCommandText
 * @text Delete Button Text
 * @parent CommandSettings
 * @type text
 * @default DELETE
 * @desc Text for Delete button. Use \i[x] for inline icons.
 *
 * @param showDeleteCommand
 * @text Show Delete Button
 * @parent CommandSettings
 * @type boolean
 * @default true
 * @desc Show the Delete command button.
 *
 * @param AutosaveSettings
 * @text Autosave Settings
 *
 * @param showAutosavePopup
 * @text Show Autosave Popup
 * @parent AutosaveSettings
 * @type boolean
 * @default true
 * @desc Show a notification popup when autosave completes.
 *
 * @param autosavePopupText
 * @text Autosave Popup Text
 * @parent AutosaveSettings
 * @type text
 * @default Autosave Complete
 * @desc Text to display in the autosave popup. Use \i[x] to manually add icons if desired.
 *
 * @param autosavePopupDuration
 * @text Popup Duration
 * @parent AutosaveSettings
 * @type number
 * @min 30
 * @max 600
 * @default 120
 * @desc How long the popup stays on screen (in frames, 60 = 1 second).
 *
 * @param autosavePopupPosition
 * @text Popup Position
 * @parent AutosaveSettings
 * @type select
 * @option Top Left
 * @value topLeft
 * @option Top Right
 * @value topRight
 * @option Bottom Left
 * @value bottomLeft
 * @option Bottom Right
 * @value bottomRight
 * @default topRight
 * @desc Where the autosave popup appears on screen.
 *
 * @param autosavePopupOffsetX
 * @text Popup Offset X
 * @parent AutosaveSettings
 * @type number
 * @min -500
 * @max 500
 * @default 20
 * @desc Horizontal offset from the edge (in pixels).
 *
 * @param autosavePopupOffsetY
 * @text Popup Offset Y
 * @parent AutosaveSettings
 * @type number
 * @min -500
 * @max 500
 * @default 20
 * @desc Vertical offset from the edge (in pixels).
 *
 * @param playAutosaveSound
 * @text Play Autosave Sound
 * @parent AutosaveSettings
 * @type boolean
 * @default true
 * @desc Play a sound when autosave completes. Turn off for silent autosaves.
 *
 * @param autosaveSoundName
 * @text Autosave Sound Name
 * @parent AutosaveSettings
 * @type file
 * @dir audio/se
 * @desc Sound effect file to play on autosave. Leave blank for default save sound.
 *
 * @param autosaveSoundVolume
 * @text Autosave Sound Volume
 * @parent AutosaveSettings
 * @type number
 * @min 0
 * @max 100
 * @default 90
 * @desc Volume of the autosave sound effect (0-100).
 *
 * @param autosaveSoundPitch
 * @text Autosave Sound Pitch
 * @parent AutosaveSettings
 * @type number
 * @min 50
 * @max 150
 * @default 100
 * @desc Pitch of the autosave sound effect (50-150).
 *
 * @param autosaveSoundPan
 * @text Autosave Sound Pan
 * @parent AutosaveSettings
 * @type number
 * @min -100
 * @max 100
 * @default 0
 * @desc Pan of the autosave sound effect (-100 to 100).
 *
 * @param InfoColumns
 * @text Information Columns
 *
 * @param useVariableNames
 * @text Use Database Variable Names
 * @parent InfoColumns
 * @type boolean
 * @default true
 * @desc If true, empty labels will use variable names from database. If false, shows "Variable X".
 *
 * @param column1Stats
 * @text Column 1 Stats
 * @parent InfoColumns
 * @type struct<StatDisplay>[]
 * @default ["{\"label\":\"Location\",\"type\":\"mapName\",\"variableId\":\"0\",\"iconIndex\":\"0\"}","{\"label\":\"Playtime\",\"type\":\"playtime\",\"variableId\":\"0\",\"iconIndex\":\"0\"}","{\"label\":\"Total Saves\",\"type\":\"saveCount\",\"variableId\":\"0\",\"iconIndex\":\"0\"}","{\"label\":\"\\\\i[314] Credits\",\"type\":\"gold\",\"variableId\":\"0\",\"iconIndex\":\"0\"}","{\"label\":\"Missions Completed\",\"type\":\"variable\",\"variableId\":\"4\",\"iconIndex\":\"0\"}","{\"label\":\"Loyalty (Crew)\",\"type\":\"variable\",\"variableId\":\"61\",\"iconIndex\":\"0\"}","{\"label\":\"CYBERNET RANK\",\"type\":\"variable\",\"variableId\":\"200\",\"iconIndex\":\"0\"}"]
 * @desc Statistics to display in column 1.
 *
 * @param column2Stats
 * @text Column 2 Stats
 * @parent InfoColumns
 * @type struct<StatDisplay>[]
 * @default ["{\"label\":\"\\\\i[87] Reputation (ESA)\",\"type\":\"variable\",\"variableId\":\"1\",\"iconIndex\":\"0\"}","{\"label\":\"\\\\i[87] Reputation (NVS)\",\"type\":\"variable\",\"variableId\":\"2\",\"iconIndex\":\"0\"}","{\"label\":\"\\\\i[87] Reputation (ORC)\",\"type\":\"variable\",\"variableId\":\"6\",\"iconIndex\":\"0\"}","{\"label\":\"\\\\i[87] Reputation (KRYLL)\",\"type\":\"variable\",\"variableId\":\"35\",\"iconIndex\":\"0\"}","{\"label\":\"\\\\i[87] Reputation (Overall)\",\"type\":\"variable\",\"variableId\":\"8\",\"iconIndex\":\"0\"}","{\"label\":\"Ground Units\",\"type\":\"variable\",\"variableId\":\"69\",\"iconIndex\":\"0\"}","{\"label\":\"Fleet Units\",\"type\":\"variable\",\"variableId\":\"70\",\"iconIndex\":\"0\"}"]
 * @desc Statistics to display in column 2.
 *
 * @param column3Stats
 * @text Column 3 Stats
 * @parent InfoColumns
 * @type struct<StatDisplay>[]
 * @default ["{\"label\":\"Member Worlds\",\"type\":\"variable\",\"variableId\":\"71\",\"iconIndex\":\"0\"}","{\"label\":\"Diplomacy\",\"type\":\"variable\",\"variableId\":\"65\",\"iconIndex\":\"0\"}","{\"label\":\"Empathy\",\"type\":\"variable\",\"variableId\":\"3\",\"iconIndex\":\"0\"}","{\"label\":\"Aggression\",\"type\":\"variable\",\"variableId\":\"66\",\"iconIndex\":\"0\"}","{\"label\":\"Honesty\",\"type\":\"variable\",\"variableId\":\"22\",\"iconIndex\":\"0\"}","{\"label\":\"Intelligence\",\"type\":\"variable\",\"variableId\":\"7\",\"iconIndex\":\"0\"}","{\"label\":\"Greed\",\"type\":\"variable\",\"variableId\":\"72\",\"iconIndex\":\"0\"}"]
 * @desc Statistics to display in column 3.
 */

/*~struct~StatDisplay:
 * @param label
 * @text Label
 * @type text
 * @desc Label to display. Leave blank to use variable name from database. Use \i[x] for icons, \c[x] for colors.
 *
 * @param type
 * @text Stat Type
 * @type select
 * @option Gold
 * @value gold
 * @option Playtime
 * @value playtime
 * @option Save Count
 * @value saveCount
 * @option Battle Count
 * @value battleCount
 * @option Map Name
 * @value mapName
 * @option Variable
 * @value variable
 * @option Steps
 * @value steps
 * @option Party Size
 * @value partySize
 * @default variable
 * @desc Type of stat to display.
 *
 * @param variableId
 * @text Variable ID
 * @type variable
 * @default 0
 * @desc Variable ID to display (only used if type is "Variable").
 *
 * @param iconIndex
 * @text Icon Index
 * @type number
 * @min 0
 * @default 0
 * @desc Icon to display before the value (0 = no icon).
 */

(() => {
    const pluginName = "PSYCHRONIC_MegaSaveMZ";
    const parameters = PluginManager.parameters(pluginName);

    // Parse parameters
    const maxSaveFiles = Number(parameters.maxSaveFiles) || 50;
    const fileListWidth = Number(parameters.fileListWidth) || 160;
    const fileItemHeight = Number(parameters.fileItemHeight) || 36;
    const autosaveIcon = Number(parameters.autosaveIcon) || 0;
    const savedFileIcon = Number(parameters.savedFileIcon) || 0;
    const emptyFileIcon = Number(parameters.emptyFileIcon) || 0;
    const autosaveText = String(parameters.autosaveText) || "Autosave";
    const gameTitle = String(parameters.gameTitle) || "Star-Shift: Freelancers";
    const showMapName = parameters.showMapName !== "false";
    const loadCommandIcon = Number(parameters.loadCommandIcon) || 0;
    const saveCommandIcon = Number(parameters.saveCommandIcon) || 0;
    const deleteCommandIcon = Number(parameters.deleteCommandIcon) || 0;
    const loadCommandText = String(parameters.loadCommandText || "LOAD");
    const saveCommandText = String(parameters.saveCommandText || "SAVE");
    const deleteCommandText = String(parameters.deleteCommandText || "DELETE");
    const showDeleteCommand = parameters.showDeleteCommand !== "false";
    const useVariableNames = parameters.useVariableNames !== "false";

    // Parse autosave settings
    const showAutosavePopup = parameters.showAutosavePopup !== "false";
    const autosavePopupText = String(parameters.autosavePopupText || "Autosave Complete");
    const autosavePopupDuration = Number(parameters.autosavePopupDuration) || 120;
    const autosavePopupPosition = String(parameters.autosavePopupPosition || "topRight");
    const autosavePopupOffsetX = Number(parameters.autosavePopupOffsetX) || 20;
    const autosavePopupOffsetY = Number(parameters.autosavePopupOffsetY) || 20;
    const playAutosaveSound = parameters.playAutosaveSound !== "false";
    const autosaveSoundName = String(parameters.autosaveSoundName || "");
    const autosaveSoundVolume = Number(parameters.autosaveSoundVolume) || 90;
    const autosaveSoundPitch = Number(parameters.autosaveSoundPitch) || 100;
    const autosaveSoundPan = Number(parameters.autosaveSoundPan) || 0;

    // Parse column stats
    const parseStatArray = (jsonArray) => {
        if (!jsonArray) return [];
        try {
            const parsed = JSON.parse(jsonArray);
            return parsed.map(item => {
                const stat = JSON.parse(item);
                return {
                    label: String(stat.label || ""),
                              type: String(stat.type) || "variable",
                              variableId: Number(stat.variableId) || 0,
                              iconIndex: Number(stat.iconIndex) || 0
                };
            });
        } catch (e) {
            console.error("Error parsing stats:", e);
            return [];
        }
    };

    const column1Stats = parseStatArray(parameters.column1Stats);
    const column2Stats = parseStatArray(parameters.column2Stats);
    const column3Stats = parseStatArray(parameters.column3Stats);

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    PluginManager.registerCommand(pluginName, "triggerAutosave", args => {
        if ($gameSystem.isAutosaveEnabled()) {
            DataManager.saveGame(0)
            .then(() => {
                // Play custom autosave sound or default (only if enabled)
                if (playAutosaveSound) {
                    if (autosaveSoundName) {
                        AudioManager.playSe({
                            name: autosaveSoundName,
                            volume: autosaveSoundVolume,
                            pitch: autosaveSoundPitch,
                            pan: autosaveSoundPan
                        });
                    } else {
                        SoundManager.playSave();
                    }
                }

                // Show popup notification if enabled
                if (showAutosavePopup && SceneManager._scene) {
                    SceneManager._scene.showAutosavePopup();
                }
            })
            .catch(() => {
                console.error("Autosave failed");
            });
        }
    });

    //=============================================================================
    // DataManager - Extended Save Info
    //=============================================================================

    const _DataManager_makeSavefileInfo = DataManager.makeSavefileInfo;
    DataManager.makeSavefileInfo = function() {
        const info = _DataManager_makeSavefileInfo.call(this);

        // Add map name
        info.mapName = $gameMap.displayName() || "";

        // Add all variables that might be used
        info.variables = {};
        const allStats = [...column1Stats, ...column2Stats, ...column3Stats];
        for (const stat of allStats) {
            if (stat.type === "variable" && stat.variableId > 0) {
                info.variables[stat.variableId] = $gameVariables.value(stat.variableId);
            }
        }

        // Add game stats
        info.gold = $gameParty.gold();
        info.saveCount = $gameSystem.saveCount();
        info.battleCount = $gameSystem.battleCount();
        info.steps = $gameParty.steps();
        info.partySize = $gameParty.size();

        // Store actor IDs so we can get names from database
        info.actorIds = [];
        const members = $gameParty.members();
        for (let i = 0; i < members.length; i++) {
            const actor = members[i];
            if (actor) {
                info.actorIds.push(actor.actorId());
            }
        }

        // Also store names for new saves
        info.actorNames = [];
        for (let i = 0; i < members.length; i++) {
            const actor = members[i];
            if (actor) {
                info.actorNames.push(actor.name());
            }
        }

        return info;
    };

    //=============================================================================
    // Scene_File - Complete Layout
    //=============================================================================

    Scene_File.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        DataManager.loadAllSavefileImages();
        this.createHelpWindow();
        this.createListWindow();
        this.createCommandWindow();
        this.createInfoWindows();
    };

    Scene_File.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        this._listWindow.refresh();
        this._listWindow.activate();
    };

    Scene_File.prototype.createHelpWindow = function() {
        const rect = this.helpWindowRect();
        this._helpWindow = new Window_Help(rect);
        this._helpWindow.setText(this.helpWindowText());
        this.addWindow(this._helpWindow);
    };

    Scene_File.prototype.helpWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(1, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.helpAreaHeight = function() {
        return this.calcWindowHeight(1, false);
    };

    Scene_File.prototype.mainAreaTop = function() {
        return this.helpAreaHeight();
    };

    Scene_File.prototype.helpWindowText = function() {
        return "";
    };

    Scene_File.prototype.createListWindow = function() {
        const rect = this.listWindowRect();
        this._listWindow = new Window_MegaSaveList(rect);
        this._listWindow.setHandler("ok", this.onListOk.bind(this));
        this._listWindow.setHandler("cancel", this.popScene.bind(this));
        this._listWindow.setMode(this.mode(), this.needsAutosave());
        this._listWindow.selectSavefile(this.firstSavefileId());
        this.addWindow(this._listWindow);
    };

    Scene_File.prototype.listWindowRect = function() {
        const wx = 0;
        const wy = this.mainAreaTop();
        const ww = fileListWidth;
        const wh = this.mainAreaHeight();
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.createCommandWindow = function() {
        const rect = this.commandWindowRect();
        this._commandWindow = new Window_MegaSaveCommand(rect, this.mode());
        this._commandWindow.setHandler("load", this.onCommandLoad.bind(this));
        this._commandWindow.setHandler("save", this.onCommandSave.bind(this));
        this._commandWindow.setHandler("delete", this.onCommandDelete.bind(this));
        this._commandWindow.setHandler("cancel", this.onCommandCancel.bind(this));
        this.addWindow(this._commandWindow);
    };

    Scene_File.prototype.commandWindowRect = function() {
        const wx = fileListWidth;
        const wy = this.mainAreaTop();
        const ww = Graphics.boxWidth - fileListWidth;
        const wh = this.calcWindowHeight(1, true);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.createInfoWindows = function() {
        // Title window
        const titleRect = this.titleWindowRect();
        this._titleWindow = new Window_MegaSaveTitle(titleRect);
        this.addWindow(this._titleWindow);

        // Character window
        const charRect = this.characterWindowRect();
        this._characterWindow = new Window_MegaSaveCharacters(charRect);
        this.addWindow(this._characterWindow);

        // Location window
        const locRect = this.locationWindowRect();
        this._locationWindow = new Window_MegaSaveLocation(locRect);
        this.addWindow(this._locationWindow);

        // Three column windows
        const col1Rect = this.column1Rect();
        this._column1Window = new Window_MegaSaveColumn(col1Rect, column1Stats);
        this.addWindow(this._column1Window);

        const col2Rect = this.column2Rect();
        this._column2Window = new Window_MegaSaveColumn(col2Rect, column2Stats);
        this.addWindow(this._column2Window);

        const col3Rect = this.column3Rect();
        this._column3Window = new Window_MegaSaveColumn(col3Rect, column3Stats);
        this.addWindow(this._column3Window);

        // Connect windows to list
        this._listWindow.setInfoWindows(
            this._titleWindow,
            this._characterWindow,
            this._locationWindow,
            this._column1Window,
            this._column2Window,
            this._column3Window
        );
    };

    Scene_File.prototype.titleWindowRect = function() {
        const cmdHeight = this.calcWindowHeight(1, true);
        const wx = fileListWidth;
        const wy = this.mainAreaTop() + cmdHeight;
        const ww = Graphics.boxWidth - fileListWidth;
        const wh = this.calcWindowHeight(1, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.characterWindowRect = function() {
        const cmdHeight = this.calcWindowHeight(1, true);
        const titleHeight = this.calcWindowHeight(1, false);
        const wx = fileListWidth;
        const wy = this.mainAreaTop() + cmdHeight + titleHeight;
        const ww = Graphics.boxWidth - fileListWidth;
        const wh = 150;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.locationWindowRect = function() {
        const cmdHeight = this.calcWindowHeight(1, true);
        const titleHeight = this.calcWindowHeight(1, false);
        const wx = fileListWidth;
        const wy = this.mainAreaTop() + cmdHeight + titleHeight + 150;
        const ww = Graphics.boxWidth - fileListWidth;
        const wh = this.calcWindowHeight(1, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.column1Rect = function() {
        const cmdHeight = this.calcWindowHeight(1, true);
        const titleHeight = this.calcWindowHeight(1, false);
        const locHeight = this.calcWindowHeight(1, false);
        const colWidth = Math.floor((Graphics.boxWidth - fileListWidth) / 3);
        const wx = fileListWidth;
        const wy = this.mainAreaTop() + cmdHeight + titleHeight + 150 + locHeight;
        const ww = colWidth;
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.column2Rect = function() {
        const cmdHeight = this.calcWindowHeight(1, true);
        const titleHeight = this.calcWindowHeight(1, false);
        const locHeight = this.calcWindowHeight(1, false);
        const colWidth = Math.floor((Graphics.boxWidth - fileListWidth) / 3);
        const wx = fileListWidth + colWidth;
        const wy = this.mainAreaTop() + cmdHeight + titleHeight + 150 + locHeight;
        const ww = colWidth;
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.column3Rect = function() {
        const cmdHeight = this.calcWindowHeight(1, true);
        const titleHeight = this.calcWindowHeight(1, false);
        const locHeight = this.calcWindowHeight(1, false);
        const colWidth = Math.floor((Graphics.boxWidth - fileListWidth) / 3);
        const wx = fileListWidth + colWidth * 2;
        const wy = this.mainAreaTop() + cmdHeight + titleHeight + 150 + locHeight;
        const ww = Graphics.boxWidth - wx;
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_File.prototype.onListOk = function() {
        // Play OK sound when selecting a file
        SoundManager.playOk();
        // Activate command window instead of immediately loading
        this._listWindow.deactivate();
        this._commandWindow.activate();
        this._commandWindow.select(0);
    };

    Scene_File.prototype.onCommandLoad = function() {
        if (this.isSavefileEnabled(this._listWindow.savefileId())) {
            this.onSavefileOk();
        } else {
            SoundManager.playBuzzer();
            this._commandWindow.activate();
        }
    };

    Scene_File.prototype.onCommandSave = function() {
        const savefileId = this._listWindow.savefileId();

        // Prevent saving to autosave slot through the menu
        if (savefileId === 0) {
            SoundManager.playBuzzer();
            this._commandWindow.activate();
            return;
        }

        if (this.isSavefileEnabled(savefileId)) {
            this.onSavefileOk();
        } else {
            SoundManager.playBuzzer();
            this._commandWindow.activate();
        }
    };

    Scene_File.prototype.onCommandDelete = function() {
        const savefileId = this._listWindow.savefileId();

        // Prevent deleting autosave slot
        if (savefileId === 0) {
            SoundManager.playBuzzer();
            this._commandWindow.activate();
            return;
        }

        if (savefileId > 0 && DataManager.savefileExists(savefileId)) {
            SoundManager.playLoad();
            StorageManager.remove(DataManager.makeSavename(savefileId));
            this._listWindow.refresh();
            this._commandWindow.activate();
        } else {
            SoundManager.playBuzzer();
            this._commandWindow.activate();
        }
    };

    Scene_File.prototype.onCommandCancel = function() {
        this._commandWindow.deactivate();
        this._commandWindow.deselect();
        this._listWindow.activate();
    };

    //=============================================================================
    // Window_MegaSaveCommand
    //=============================================================================

    function Window_MegaSaveCommand() {
        this.initialize(...arguments);
    }

    Window_MegaSaveCommand.prototype = Object.create(Window_HorzCommand.prototype);
    Window_MegaSaveCommand.prototype.constructor = Window_MegaSaveCommand;

    Window_MegaSaveCommand.prototype.initialize = function(rect, mode) {
        this._mode = mode;
        Window_HorzCommand.prototype.initialize.call(this, rect);
        this.deactivate();
        this.deselect();
    };

    Window_MegaSaveCommand.prototype.maxCols = function() {
        return showDeleteCommand ? 3 : 2;
    };

    Window_MegaSaveCommand.prototype.itemTextAlign = function() {
        return "center";
    };

    // Override addCommand to force icon to NEVER be stored in command data
    Window_MegaSaveCommand.prototype.addCommand = function(name, symbol, enabled, ext) {
        if (enabled === undefined) {
            enabled = true;
        }
        if (ext === undefined) {
            ext = null;
        }
        // Explicitly set icon to 0 to prevent parent class from drawing it
        this._list.push({ name: name, symbol: symbol, enabled: enabled, ext: ext, icon: 0 });
    };

    Window_MegaSaveCommand.prototype.drawIcon = function(iconIndex, x, y) {
        // Check if we're in measurement mode (x and y will be 0 or very small during textSizeEx)
        // textSizeEx uses a temporary dummy bitmap, we can detect it
        if (this.contents.width === 0 || (x === 0 && y <= 4)) {
            // Don't actually draw during measurement, just reserve the space
            return;
        }
        // Normal drawing for actual rendering
        Window_Base.prototype.drawIcon.call(this, iconIndex, x, y);
    };

    // Override drawItem - completely custom implementation
    Window_MegaSaveCommand.prototype.drawItem = function(index) {
        const rect = this.itemLineRect(index);
        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));

        // Use drawTextEx to support text codes - this handles icons inline
        const text = this.commandName(index);
        const textWidth = this.textSizeEx(text).width;
        const x = rect.x + (rect.width - textWidth) / 2;
        this.drawTextEx(text, x, rect.y);
    };

    Window_MegaSaveCommand.prototype.makeCommandList = function() {
        // Load command - use custom text or build with icon
        let loadText = loadCommandText;
        if (loadCommandIcon > 0 && !loadText.includes("\\i[")) {
            loadText = "\\i[" + loadCommandIcon + "] " + loadText;
        }
        this.addCommand(loadText, "load", this._mode === "load");

        // Save command - use custom text or build with icon
        let saveText = saveCommandText;
        if (saveCommandIcon > 0 && !saveText.includes("\\i[")) {
            saveText = "\\i[" + saveCommandIcon + "] " + saveText;
        }
        this.addCommand(saveText, "save", this._mode === "save");

        // Delete command - use custom text or build with icon
        if (showDeleteCommand) {
            let deleteText = deleteCommandText;
            if (deleteCommandIcon > 0 && !deleteText.includes("\\i[")) {
                deleteText = "\\i[" + deleteCommandIcon + "] " + deleteText;
            }
            this.addCommand(deleteText, "delete");
        }
    };

    //=============================================================================
    // Window_MegaSaveList
    //=============================================================================

    function Window_MegaSaveList() {
        this.initialize(...arguments);
    }

    Window_MegaSaveList.prototype = Object.create(Window_SavefileList.prototype);
    Window_MegaSaveList.prototype.constructor = Window_MegaSaveList;

    Window_MegaSaveList.prototype.initialize = function(rect) {
        Window_SavefileList.prototype.initialize.call(this, rect);
        this._infoWindows = null;
    };

    Window_MegaSaveList.prototype.maxItems = function() {
        // Autosave (1) + max manual saves
        return maxSaveFiles + 1;
    };

    Window_MegaSaveList.prototype.itemHeight = function() {
        return fileItemHeight;
    };

    Window_MegaSaveList.prototype.indexToSavefileId = function(index) {
        // Index 0 = Autosave (file ID 0)
        // Index 1+ = File 1, 2, 3, etc.
        return index;
    };

    Window_MegaSaveList.prototype.savefileIdToIndex = function(savefileId) {
        return savefileId;
    };

    Window_MegaSaveList.prototype.setInfoWindows = function(title, chars, loc, col1, col2, col3) {
        this._infoWindows = {
            title: title,
            characters: chars,
            location: loc,
            column1: col1,
            column2: col2,
            column3: col3
        };
        this.updateInfoWindows();
    };

    Window_MegaSaveList.prototype.updateInfoWindows = function() {
        if (!this._infoWindows) return;

        const savefileId = this.savefileId();
        const info = DataManager.savefileInfo(savefileId);

        this._infoWindows.title.setInfo(info);
        this._infoWindows.characters.setInfo(info);
        this._infoWindows.location.setInfo(info);
        this._infoWindows.column1.setInfo(info);
        this._infoWindows.column2.setInfo(info);
        this._infoWindows.column3.setInfo(info);
    };

    Window_MegaSaveList.prototype.select = function(index) {
        Window_SavefileList.prototype.select.call(this, index);
        this.updateInfoWindows();
    };

    Window_MegaSaveList.prototype.drawItem = function(index) {
        const savefileId = this.indexToSavefileId(index);
        const info = DataManager.savefileInfo(savefileId);
        const rect = this.itemRectWithPadding(index);

        this.resetTextColor();
        this.changePaintOpacity(this.isEnabled(savefileId));

        let x = rect.x + 4;
        const y = rect.y + (rect.height - ImageManager.iconHeight) / 2;

        // Special handling for autosave slot
        if (savefileId === 0) {
            // Determine which icon to draw (if any)
            if (info) {
                // Has save data - use autosave icon if set
                if (autosaveIcon > 0) {
                    this.drawIcon(autosaveIcon, x, y);
                    x += ImageManager.iconWidth + 4;
                }
                // If autosaveIcon is 0, draw nothing - just continue to text
            } else {
                // No save data - use empty file icon if set
                if (emptyFileIcon > 0) {
                    this.drawIcon(emptyFileIcon, x, y);
                    x += ImageManager.iconWidth + 4;
                }
                // If emptyFileIcon is 0, draw nothing - just continue to text
            }

            // Draw autosave text
            this.drawText(autosaveText, x, rect.y + 4, rect.width - x);
        } else {
            // Normal save file icon
            if (info && savedFileIcon > 0) {
                this.drawIcon(savedFileIcon, x, y);
                x += ImageManager.iconWidth + 4;
            } else if (!info && emptyFileIcon > 0) {
                this.drawIcon(emptyFileIcon, x, y);
                x += ImageManager.iconWidth + 4;
            } else {
                // Fallback to colored squares
                const indicatorSize = 12;
                const indicatorY = rect.y + (rect.height - indicatorSize) / 2;
                if (info) {
                    this.contents.fillRect(x, indicatorY, indicatorSize, indicatorSize,
                                           ColorManager.textColor(3));
                } else {
                    this.contents.fillRect(x, indicatorY, indicatorSize, indicatorSize,
                                           ColorManager.dimColor2());
                }
                x += indicatorSize + 4;
            }

            // Draw file name
            this.drawTitle(savefileId, x, rect.y + 4);
        }
    };

    //=============================================================================
    // Window_MegaSaveTitle
    //=============================================================================

    function Window_MegaSaveTitle() {
        this.initialize(...arguments);
    }

    Window_MegaSaveTitle.prototype = Object.create(Window_Base.prototype);
    Window_MegaSaveTitle.prototype.constructor = Window_MegaSaveTitle;

    Window_MegaSaveTitle.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._info = null;
        this.refresh();
    };

    Window_MegaSaveTitle.prototype.setInfo = function(info) {
        this._info = info;
        this.refresh();
    };

    Window_MegaSaveTitle.prototype.refresh = function() {
        this.contents.clear();
        const y = Math.floor((this.innerHeight - this.lineHeight()) / 2);

        // Draw game title centered with text code support
        this.contents.fontSize = 24;

        // Measure the text width with all codes processed
        const textWidth = this.textSizeEx(gameTitle).width;

        // Calculate centered X position
        const x = Math.floor((this.innerWidth - textWidth) / 2);

        // Draw with text codes support
        this.drawTextEx(gameTitle, x, y);

        this.contents.fontSize = $gameSystem.mainFontSize();
        this.resetTextColor();
    };

    //=============================================================================
    // Window_MegaSaveCharacters
    //=============================================================================

    function Window_MegaSaveCharacters() {
        this.initialize(...arguments);
    }

    Window_MegaSaveCharacters.prototype = Object.create(Window_Base.prototype);
    Window_MegaSaveCharacters.prototype.constructor = Window_MegaSaveCharacters;

    Window_MegaSaveCharacters.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._info = null;
    };

    Window_MegaSaveCharacters.prototype.setInfo = function(info) {
        this._info = info;

        if (!info) {
            this.refresh();
            return;
        }

        // For saves with actorIds (new saves)
        if (info.actorIds && info.actorIds.length > 0) {
            info.actorNames = [];
            for (let i = 0; i < info.actorIds.length; i++) {
                const actorId = info.actorIds[i];
                const actor = $dataActors[actorId];
                if (actor) {
                    info.actorNames.push(actor.name);
                }
            }
        }
        // For old saves without actorIds, deduce them from character sprites
        else if (info.characters && info.characters.length > 0) {
            info.actorIds = [];
            info.actorNames = [];

            for (let i = 0; i < info.characters.length; i++) {
                const [charName, charIndex] = info.characters[i];

                // Find which actor has this character sprite
                let foundActorId = 0;
                for (let actorId = 1; actorId < $dataActors.length; actorId++) {
                    const actor = $dataActors[actorId];
                    if (actor && actor.characterName === charName && actor.characterIndex === charIndex) {
                        foundActorId = actorId;
                        info.actorIds.push(actorId);
                        info.actorNames.push(actor.name);
                        break;
                    }
                }

                if (!foundActorId) {
                    info.actorIds.push(0);
                    info.actorNames.push("");
                }
            }
        }

        this.refresh();
    };

    Window_MegaSaveCharacters.prototype.refresh = function() {
        this.contents.clear();

        if (!this._info || !this._info.characters || this._info.characters.length === 0) {
            return;
        }

        const characters = this._info.characters;
        const actorNames = this._info.actorNames || [];
        const numChars = characters.length;

        if (numChars === 0) return;

        // Calculate spacing with less padding on sides
        const sidePadding = 30;
        const totalWidth = this.innerWidth - (sidePadding * 2);
        const charWidth = 100;

        // Calculate even spacing between characters - reduced minimum spacing
        const totalCharWidth = charWidth * numChars;
        const availableSpace = totalWidth - totalCharWidth;
        const spacing = numChars > 1 ? Math.max(15, Math.floor(availableSpace / (numChars - 1))) : 0;

        const charY = 90;

        // Start at sidePadding + half character width (since drawCharacter uses center point)
        let currentX = sidePadding + Math.floor(charWidth / 2);

        for (let i = 0; i < numChars; i++) {
            const data = characters[i];

            // Draw character sprite (currentX is the center point)
            if (data && data[0]) {
                this.drawCharacter(data[0], data[1], currentX, charY);
            }

            // Draw actor name below character with font scaling
            if (actorNames && actorNames[i]) {
                const name = actorNames[i];
                const nameY = charY + 5;

                // Calculate maximum width for this name (space between characters)
                const maxNameWidth = i < numChars - 1 ? spacing + charWidth : charWidth + 40;

                // Save original font size
                const originalFontSize = this.contents.fontSize;

                // Start with smaller font size for names (20 instead of standard ~28)
                const baseFontSize = 20;
                this.contents.fontSize = baseFontSize;

                // Calculate if we need to scale down the font
                let nameWidth = this.textWidth(name);
                let scaledFontSize = baseFontSize;

                if (nameWidth > maxNameWidth) {
                    // Scale font down proportionally to fit
                    scaledFontSize = Math.floor(baseFontSize * (maxNameWidth / nameWidth));
                    // Don't go below a minimum size
                    scaledFontSize = Math.max(scaledFontSize, 14);
                    this.contents.fontSize = scaledFontSize;
                    nameWidth = this.textWidth(name);
                }

                // Center the name under the character (currentX is already the center)
                const nameX = currentX - Math.floor(nameWidth / 2);

                this.resetTextColor();
                this.drawText(name, nameX, nameY, maxNameWidth, "left");

                // Restore original font size
                this.contents.fontSize = originalFontSize;
            }

            // Move to next position
            if (i < numChars - 1) {
                currentX += charWidth + spacing;
            }
        }
    };

    //=============================================================================
    // Window_MegaSaveLocation
    //=============================================================================

    function Window_MegaSaveLocation() {
        this.initialize(...arguments);
    }

    Window_MegaSaveLocation.prototype = Object.create(Window_Base.prototype);
    Window_MegaSaveLocation.prototype.constructor = Window_MegaSaveLocation;

    Window_MegaSaveLocation.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._info = null;
    };

    Window_MegaSaveLocation.prototype.setInfo = function(info) {
        this._info = info;
        this.refresh();
    };

    Window_MegaSaveLocation.prototype.refresh = function() {
        this.contents.clear();

        if (!this._info) {
            return;
        }

        const y = Math.floor((this.innerHeight - this.lineHeight()) / 2);

        // Draw map name if available, centered
        if (showMapName && this._info.mapName) {
            const mapText = this._info.mapName;
            const textWidth = this.textSizeEx(mapText).width;
            const x = Math.floor((this.innerWidth - textWidth) / 2);
            this.drawTextEx(mapText, x, y);
        }
    };

    //=============================================================================
    // Window_MegaSaveColumn
    //=============================================================================

    function Window_MegaSaveColumn() {
        this.initialize(...arguments);
    }

    Window_MegaSaveColumn.prototype = Object.create(Window_Base.prototype);
    Window_MegaSaveColumn.prototype.constructor = Window_MegaSaveColumn;

    Window_MegaSaveColumn.prototype.initialize = function(rect, stats) {
        Window_Base.prototype.initialize.call(this, rect);
        this._stats = stats || [];
        this._info = null;
    };

    Window_MegaSaveColumn.prototype.setInfo = function(info) {
        this._info = info;
        this.refresh();
    };

    Window_MegaSaveColumn.prototype.refresh = function() {
        this.contents.clear();

        if (!this._info) {
            return;
        }

        const lineHeight = this.lineHeight();
        let y = 10;

        for (const stat of this._stats) {
            if (stat && stat.label !== undefined) {
                this.drawStat(stat, y);
                y += lineHeight + 4;
            }
        }
    };

    Window_MegaSaveColumn.prototype.drawStat = function(stat, y) {
        // Get the label - use variable name from database if label is empty
        let labelText = stat.label || "";

        // If label is empty and type is variable, use variable name from database
        if (!labelText && stat.type === "variable" && stat.variableId > 0) {
            labelText = $dataSystem.variables[stat.variableId] || "Variable " + stat.variableId;
        }

        this.changeTextColor(ColorManager.systemColor());
        this.drawTextEx(labelText, 10, y, this.innerWidth - 100);

        this.resetTextColor();
        const value = this.getStatValue(stat);

        // Calculate value position based on whether there's an icon
        if (stat.iconIndex > 0) {
            const iconX = this.innerWidth - ImageManager.iconWidth - 4;
            this.drawIcon(stat.iconIndex, iconX, y + 2);

            const valueX = iconX - 74;
            this.drawText(value, valueX, y, 70, "right");
        } else {
            const valueX = this.innerWidth - 80;
            this.drawText(value, valueX, y, 70, "right");
        }
    };

    Window_MegaSaveColumn.prototype.getStatValue = function(stat) {
        if (!this._info) return "0";

        switch (stat.type) {
            case "gold":
                return this._info.gold !== undefined ? this._info.gold.toString() : "0";
            case "playtime":
                return this._info.playtime || "00:00:00";
            case "saveCount":
                return this._info.saveCount !== undefined ? this._info.saveCount.toString() : "0";
            case "battleCount":
                return this._info.battleCount !== undefined ? this._info.battleCount.toString() : "0";
            case "mapName":
                return this._info.mapName || "Unknown";
            case "steps":
                return this._info.steps !== undefined ? this._info.steps.toString() : "0";
            case "partySize":
                return this._info.partySize !== undefined ? this._info.partySize.toString() : "0";
            case "variable":
                if (this._info.variables && stat.variableId > 0) {
                    const val = this._info.variables[stat.variableId];
                    return val !== undefined ? val.toString() : "0";
                }
                return "0";
            default:
                return "0";
        }
    };

    //=============================================================================
    // Window_AutosavePopup
    //=============================================================================

    function Window_AutosavePopup() {
        this.initialize(...arguments);
    }

    Window_AutosavePopup.prototype = Object.create(Window_Base.prototype);
    Window_AutosavePopup.prototype.constructor = Window_AutosavePopup;

    Window_AutosavePopup.prototype.initialize = function() {
        const width = 300;
        const height = this.fittingHeight(1);
        const x = this.getPopupX(width);
        const y = this.getPopupY(height);
        const rect = new Rectangle(x, y, width, height);
        Window_Base.prototype.initialize.call(this, rect);
        this.openness = 0;
        this._duration = 0;
        this.refresh();
    };

    Window_AutosavePopup.prototype.getPopupX = function(width) {
        switch (autosavePopupPosition) {
            case "topLeft":
            case "bottomLeft":
                return autosavePopupOffsetX;
            case "topRight":
            case "bottomRight":
            default:
                return Graphics.boxWidth - width - autosavePopupOffsetX;
        }
    };

    Window_AutosavePopup.prototype.getPopupY = function(height) {
        switch (autosavePopupPosition) {
            case "topLeft":
            case "topRight":
                return autosavePopupOffsetY;
            case "bottomLeft":
            case "bottomRight":
            default:
                return Graphics.boxHeight - height - autosavePopupOffsetY;
        }
    };

    Window_AutosavePopup.prototype.refresh = function() {
        this.contents.clear();

        // Parse the display text to extract icon and clean text
        const displayText = autosavePopupText;
        const iconMatch = displayText.match(/\\i\[(\d+)\]/);

        if (iconMatch) {
            // Text contains an icon code - draw icon and text separately
            const iconIndex = parseInt(iconMatch[1]);
            const cleanText = displayText.replace(/\\i\[\d+\]\s*/, "");

            const textWidth = this.textWidth(cleanText);
            const totalWidth = ImageManager.iconWidth + 4 + textWidth;

            let x = Math.floor((this.innerWidth - totalWidth) / 2);
            const y = Math.floor((this.innerHeight - this.lineHeight()) / 2);

            // Draw icon
            this.drawIcon(iconIndex, x, y + 2);
            x += ImageManager.iconWidth + 4;

            // Draw text (no text codes needed)
            this.drawText(cleanText, x, y, textWidth);
        } else {
            // No icon - just draw text centered
            const y = Math.floor((this.innerHeight - this.lineHeight()) / 2);
            this.drawText(displayText, 0, y, this.innerWidth, "center");
        }
    };

    Window_AutosavePopup.prototype.show = function() {
        this._duration = autosavePopupDuration;
        this.open();
    };

    Window_AutosavePopup.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._duration > 0) {
            this._duration--;
            if (this._duration <= 0) {
                this.close();
            }
        }
    };

    //=============================================================================
    // Scene_Map - Autosave Popup Integration
    //=============================================================================

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this.createAutosavePopup();
    };

    Scene_Map.prototype.createAutosavePopup = function() {
        if (!this._autosavePopup) {
            this._autosavePopup = new Window_AutosavePopup();
            this.addWindow(this._autosavePopup);
        }
    };

    Scene_Map.prototype.showAutosavePopup = function() {
        if (this._autosavePopup) {
            this._autosavePopup.show();
        }
    };

    //=============================================================================
    // Scene_Battle - Autosave Popup Integration
    //=============================================================================

    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        this.createAutosavePopup();
    };

    Scene_Battle.prototype.createAutosavePopup = function() {
        if (!this._autosavePopup) {
            this._autosavePopup = new Window_AutosavePopup();
            this.addWindow(this._autosavePopup);
        }
    };

    Scene_Battle.prototype.showAutosavePopup = function() {
        if (this._autosavePopup) {
            this._autosavePopup.show();
        }
    };

})();
