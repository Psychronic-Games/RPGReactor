//=============================================================================
// PSYCHRONIC_MegaOptionsMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.0.1] Expand the Options Menu with categories and customizable options
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_MegaOptionsMZ.js
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * This plugin expands the Options Menu into a more elegant looking menu
 * with category organization and extensive customization potential. You can
 * add custom options with full control over how they appear and behave.
 *
 * ============================================================================
 * Instructions - Option Categories
 * ============================================================================
 *
 * This plugin adds 'Option Categories' to organize your options. The 'All'
 * and 'Exit' categories are built-in, but you can add custom categories.
 *
 * Category Parameters:
 * - Name: How the category appears (supports text codes like \i[x] and \c[x])
 * - Help Description: Text shown in the help window when highlighted
 * - Options List: The options that appear when this category is selected
 *
 * IMPORTANT - Adding Options:
 * The code parameters have EMPTY defaults by design. This prevents RPG Maker
 * MZ's parameter editor from causing issues. All the code you need is provided
 * in the EXAMPLES section below - simply copy and paste!
 *
 * STEP BY STEP:
 * 1. Open the plugin parameters
 * 2. Go to "Option Categories"
 * 3. Click the "+" button to add a new category
 * 4. Set the category name (e.g., "General" or "\i[83]General")
 * 5. In "Options List", click "+" to add options to that category
 * 6. Fill in Name, Symbol, Help Description, and Default Value
 * 7. For the code parameters, refer to the EXAMPLES section below
 * 8. Copy and paste the appropriate code into each field
 *
 * ============================================================================
 * Instructions - Option List
 * ============================================================================
 *
 * Each option has the following parameters:
 *
 * Name: Display name (use text codes, or "EVAL: code" for dynamic names)
 * Help Description: Help text shown when option is highlighted
 * Symbol: Unique identifier for the option
 * Default Value: Default state for this option (IMPORTANT - see below!)
 * Meta Switch ID: Game switch to sync with this option (0 = none)
 * Meta Variable ID: Game variable to sync with this option (0 = none)
 * Show/Hide: Code determining if option is visible (default: "show = true;")
 * Enable: Code determining if option is enabled (default: "enabled = true;")
 * Ext: Extension value for additional data (default: "ext = 0;")
 *
 * Default Value Usage:
 * - For ON/OFF options: Use "true" or "false"
 * - For volume options: Use a number like "100" (0-100)
 * - For other options: Use any appropriate value
 * - ONLY affects NEW GAMES - saved games keep their existing values
 *
 * Meta Switch/Variable Usage:
 * - Meta Switch ID: Automatically syncs boolean options with a game switch
 * - Meta Variable ID: Automatically syncs numeric options with a game variable
 * - Set to 0 or leave blank to disable syncing
 * - Perfect for content toggles, unlocks, or tracking option states in events
 * - Example: Pixel Nudity option with Meta Switch ID 860 will automatically
 *   keep switch 860 in sync with the option's ON/OFF state
 *
 * Advanced Parameters (JavaScript):
 *
 * The following parameters use JavaScript code to control option behavior.
 * If you don't know JavaScript, copy the default code examples below.
 *
 * ---
 *
 * Show/Hide Code:
 * - JavaScript code to determine if this option is visible in the list.
 *
 *   The default code:
 *   show = true;
 *
 * ---
 *
 * Enable Code:
 * - JavaScript code to determine if this option can be selected.
 *
 *   The default code:
 *   enabled = true;
 *
 * ---
 *
 * Ext Code:
 * - Extension value for additional data. Usually not needed.
 *
 *   The default code:
 *   ext = 0;
 *
 * ---
 *
 * Make Command Code:
 * - JavaScript code to add the option to the command list.
 *
 *   The default code:
 *   this.addCommand(name, symbol, enabled, ext);
 *
 * ---
 *
 * Draw Item Code:
 * - JavaScript code that draws the option on screen.
 *
 *   The default code (for ON/OFF options):
 *   var rect = this.itemLineRect(index);
 *   var statusWidth = this.statusWidth();
 *   var titleWidth = rect.width - statusWidth;
 *   this.resetTextColor();
 *   this.changePaintOpacity(this.isCommandEnabled(index));
 *   this.drawOptionsName(index);
 *   this.drawOptionsOnOff(index);
 *
 * ---
 *
 * Process OK Code:
 * - JavaScript code that runs when OK/Enter is pressed on the option.
 *
 *   The default code (toggles ON/OFF):
 *   var index = this.index();
 *   var symbol = this.commandSymbol(index);
 *   var value = this.getConfigValue(symbol);
 *   this.changeValue(symbol, !value);
 *
 * ---
 *
 * Cursor Right Code:
 * - JavaScript code that runs when RIGHT is pressed on the option.
 *
 *   The default code (sets to ON/true):
 *   var index = this.index();
 *   var symbol = this.commandSymbol(index);
 *   this.changeValue(symbol, true);
 *
 * ---
 *
 * Cursor Left Code:
 * - JavaScript code that runs when LEFT is pressed on the option.
 *
 *   The default code (sets to OFF/false):
 *   var index = this.index();
 *   var symbol = this.commandSymbol(index);
 *   this.changeValue(symbol, false);
 *
 * ============================================================================
 * EXAMPLES - Copy-Paste Ready Option Configurations
 * ============================================================================
 *
 * Copy the code from these examples into your plugin parameters.
 * Simply click "Edit" on each code field and paste the appropriate code.
 *
 * --- EXAMPLE 1: Basic ON/OFF Option (Always Dash) ---
 *
 * Name: Always Dash
 * Help Description: Choose whether the player always dashes.
 * Symbol: alwaysDash
 * Default Value: true
 * Meta Switch ID: 0
 * Meta Variable ID: 0
 *
 * Show/Hide Code:
 * show = true;
 *
 * Enable Code:
 * enabled = true;
 *
 * Ext Code:
 * ext = 0;
 *
 * Make Command Code:
 * this.addCommand(name, symbol, enabled, ext);
 *
 * Draw Item Code:
 * var rect = this.itemLineRect(index);
 * var statusWidth = this.statusWidth();
 * var titleWidth = rect.width - statusWidth;
 * this.resetTextColor();
 * this.changePaintOpacity(this.isCommandEnabled(index));
 * this.drawOptionsName(index);
 * this.drawOptionsOnOff(index);
 *
 * Process OK Code:
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * var value = this.getConfigValue(symbol);
 * this.changeValue(symbol, !value);
 *
 * Cursor Right Code:
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * this.changeValue(symbol, true);
 *
 * Cursor Left Code:
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * this.changeValue(symbol, false);
 *
 * --- EXAMPLE 2: Volume Option (BGM Volume) ---
 *
 * Name: BGM Volume
 * Help Description: Adjust the background music volume.
 * Symbol: bgmVolume
 * Default Value: 100
 *
 * Show/Hide, Enable, Ext, and Make Command Code are the same as Example 1.
 *
 * Draw Item Code:
 * var rect = this.itemLineRect(index);
 * var statusWidth = this.statusWidth();
 * var titleWidth = rect.width - statusWidth;
 * this.resetTextColor();
 * this.changePaintOpacity(this.isCommandEnabled(index));
 * this.drawOptionsName(index);
 * var symbol = this.commandSymbol(index);
 * var value = this.getConfigValue(symbol);
 * var rate = value / 100;
 * var color1 = this.textColor(28);
 * var color2 = this.textColor(29);
 * this.drawOptionsGauge(index, rate, color1, color2);
 * this.drawText(value + '%', rect.x + titleWidth, rect.y, statusWidth, 'right');
 *
 * Process OK Code:
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * this.changeVolume(symbol, true, true);
 *
 * Cursor Right Code:
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * this.changeVolume(symbol, true, false);
 *
 * Cursor Left Code:
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * this.changeVolume(symbol, false, false);
 *
 * Simply copy and paste the code from the examples above into your plugin
 * parameters. Click "Edit" on each code field and paste - it's that simple!
 *
 * @param ---Categories---
 * @default
 *
 * @param AllCategoryName
 * @text All Category Name
 * @desc Display name for the "All" category (supports text codes like \i[x])
 * @type text
 * @default All
 *
 * @param ExitCategoryName
 * @text Exit Category Name
 * @desc Display name for the "Exit" category (supports text codes like \i[x])
 * @type text
 * @default Exit
 *
 * @param OptionCategories
 * @text Option Categories
 * @desc Configure categories for organizing options. Use the + button to add categories and options.
 * @type struct<OptionCategory>[]
 * @default []
 *
 * @param ---Windows---
 * @default
 *
 * @param CategoryWindowX
 * @text Category Window X
 * @desc X position of the category window
 * @type number
 * @default 0
 *
 * @param CategoryWindowY
 * @text Category Window Y
 * @desc Y position of the category window
 * @type number
 * @default 0
 *
 * @param CategoryWindowWidth
 * @text Category Window Width
 * @desc Width of the category window (0 = auto)
 * @type number
 * @default 240
 *
 * @param OptionsWindowX
 * @text Options Window X
 * @desc X position of the options window (0 = auto)
 * @type number
 * @default 0
 *
 * @param OptionsWindowY
 * @text Options Window Y
 * @desc Y position of the options window (0 = auto)
 * @type number
 * @default 0
 *
 * @param OptionsWindowWidth
 * @text Options Window Width
 * @desc Width of the options window (0 = auto)
 * @type number
 * @default 0
 *
 * @param StatusWidth
 * @text Status Width
 * @desc Width of the status column in options window
 * @type number
 * @default 120
 *
 * @param VolumeOffset
 * @text Volume Increment
 * @desc Amount volume changes per button press (1=1%, 5=5%, 10=10%, 20=20%)
 * @type number
 * @min 1
 * @max 100
 * @default 5
 *
 */

/*~struct~OptionCategory:
 * @param Name
 * @text Category Name
 * @desc Name of the category (supports text codes)
 * @type string
 * @default New Category
 *
 * @param HelpDesc
 * @text Help Description
 * @desc Help text shown when category is highlighted
 * @type string
 * @default Category description goes here.
 *
 * @param OptionsList
 * @text Options List
 * @desc List of options in this category
 * @type struct<OptionData>[]
 * @default []
 */

/*~struct~OptionData:
 * @param Name
 * @text Option Name
 * @desc Name of the option (supports text codes or EVAL: code)
 * @type string
 * @default New Option
 *
 * @param HelpDesc
 * @text Help Description
 * @desc Help text shown when option is highlighted
 * @type string
 * @default Option description goes here.
 *
 * @param Symbol
 * @text Symbol
 * @desc Unique symbol identifier for this option
 * @type string
 * @default newOption
 *
 * @param DefaultValue
 * @text Default Value
 * @desc Default value for this option. For on/off: "true" or "false". For volumes: "100". Only applies to new games!
 * @type string
 * @default false
 *
 * @param MetaSwitchId
 * @text Meta Switch ID
 * @desc Game switch to sync with this option (0 = none)
 * @type switch
 * @default 0
 *
 * @param MetaVariableId
 * @text Meta Variable ID
 * @desc Game variable to sync with this option (0 = none)
 * @type variable
 * @default 0
 *
 * @param ---Settings---
 * @default
 *
 * @param ShowHide
 * @text Show/Hide Code
 * @parent ---Settings---
 * @desc JavaScript code to determine if option is visible
 * @type note
 * @default "show = true;"
 *
 * @param Enable
 * @text Enable Code
 * @parent ---Settings---
 * @desc JavaScript code to determine if option is enabled
 * @type note
 * @default "enabled = true;"
 *
 * @param Ext
 * @text Extension Code
 * @parent ---Settings---
 * @desc JavaScript code for extension value
 * @type note
 * @default "ext = 0;"
 *
 * @param ---Functions---
 * @default
 *
 * @param MakeCommandCode
 * @text Make Command Code
 * @parent ---Functions---
 * @desc JavaScript code to add the command to the list
 * @type note
 * @default "this.addCommand(name, symbol, enabled, ext);"
 *
 * @param DrawItemCode
 * @text Draw Item Code
 * @parent ---Functions---
 * @desc JavaScript code to draw the option. See help for full default code.
 * @type note
 * @default "this.drawOptionsName(index); this.drawOptionsOnOff(index);"
 *
 * @param ProcessOkCode
 * @text Process OK Code
 * @parent ---Functions---
 * @desc JavaScript code when OK/Enter is pressed. See help for full default code.
 * @type note
 * @default "this.changeValue(this.commandSymbol(this.index()), !this.getConfigValue(this.commandSymbol(this.index())));"
 *
 * @param CursorRightCode
 * @text Cursor Right Code
 * @parent ---Functions---
 * @desc JavaScript code when right is pressed. See help for full default code.
 * @type note
 * @default "this.changeValue(this.commandSymbol(this.index()), true);"
 *
 * @param CursorLeftCode
 * @text Cursor Left Code
 * @parent ---Functions---
 * @desc JavaScript code when left is pressed. See help for full default code.
 * @type note
 * @default "this.changeValue(this.commandSymbol(this.index()), false);"
 */

//=============================================================================
// Plugin Start
//=============================================================================

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MegaOptionsMZ';
    const parameters = PluginManager.parameters(pluginName);

    // Parse parameters
    window.PSYCHRONIC = window.PSYCHRONIC || {};
    window.PSYCHRONIC.MegaOptions = window.PSYCHRONIC.MegaOptions || {};

    const PSYCHRONIC = window.PSYCHRONIC;

    PSYCHRONIC.MegaOptions.categories = JSON.parse(parameters['OptionCategories'] || '[]');
    PSYCHRONIC.MegaOptions.allCategoryName = String(parameters['AllCategoryName'] || 'All');
    PSYCHRONIC.MegaOptions.exitCategoryName = String(parameters['ExitCategoryName'] || 'Exit');
    PSYCHRONIC.MegaOptions.categoryWindowX = Number(parameters['CategoryWindowX'] || 0);
    PSYCHRONIC.MegaOptions.categoryWindowY = Number(parameters['CategoryWindowY'] || 0);
    PSYCHRONIC.MegaOptions.categoryWindowWidth = Number(parameters['CategoryWindowWidth'] || 240);
    PSYCHRONIC.MegaOptions.optionsWindowX = Number(parameters['OptionsWindowX'] || 0);
    PSYCHRONIC.MegaOptions.optionsWindowY = Number(parameters['OptionsWindowY'] || 0);
    PSYCHRONIC.MegaOptions.optionsWindowWidth = Number(parameters['OptionsWindowWidth'] || 0);
    PSYCHRONIC.MegaOptions.statusWidth = Number(parameters['StatusWidth'] || 120);
    PSYCHRONIC.MegaOptions.volumeOffset = Number(parameters['VolumeOffset'] || 5);

    // Debug mode - set to true to see parameter parsing in console
    PSYCHRONIC.MegaOptions.debugMode = true;

    // Extract default values from all options across all categories
    PSYCHRONIC.MegaOptions.optionDefaults = {};

    try {
        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log('\n========== MegaOptions: Extracting Default Values ==========');
        }

        for (let i = 0; i < PSYCHRONIC.MegaOptions.categories.length; i++) {
            const category = PSYCHRONIC.MegaOptions.categories[i];

            try {
                const categoryData = JSON.parse(category);
                const optionsList = JSON.parse(categoryData.OptionsList || '[]');

                if (PSYCHRONIC.MegaOptions.debugMode) {
                    // [silenced] console.log(`Category "${categoryData.Name}": ${optionsList.length} options`);
                }

                for (let j = 0; j < optionsList.length; j++) {
                    const option = optionsList[j];

                    try {
                        const optionData = JSON.parse(option);
                        const symbol = optionData.Symbol;
                        const defaultValue = optionData.DefaultValue;

                        if (symbol && defaultValue !== undefined && defaultValue !== null && defaultValue !== "") {
                            // Parse the default value appropriately
                            if (defaultValue === "true" || defaultValue === true) {
                                PSYCHRONIC.MegaOptions.optionDefaults[symbol] = true;
                            } else if (defaultValue === "false" || defaultValue === false) {
                                PSYCHRONIC.MegaOptions.optionDefaults[symbol] = false;
                            } else if (!isNaN(defaultValue) && defaultValue !== "") {
                                PSYCHRONIC.MegaOptions.optionDefaults[symbol] = Number(defaultValue);
                            } else {
                                PSYCHRONIC.MegaOptions.optionDefaults[symbol] = defaultValue;
                            }

                            if (PSYCHRONIC.MegaOptions.debugMode) {
                                // [silenced] console.log(`  ${symbol} = ${PSYCHRONIC.MegaOptions.optionDefaults[symbol]}`);
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing option:', e);
                    }
                }
            } catch (e) {
                console.error('Error parsing category:', e);
            }
        }

        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log('Extracted defaults:', PSYCHRONIC.MegaOptions.optionDefaults);
            // [silenced] console.log('============================================================\n');
        }
    } catch (e) {
        console.error('FATAL ERROR in default value extraction:', e);
    }

    //=============================================================================
    // IMMEDIATE Application of Defaults
    //=============================================================================

    // Track whether we've loaded from a save file
    PSYCHRONIC.MegaOptions.configLoadedFromSave = false;

    if (PSYCHRONIC.MegaOptions.debugMode) {
        // [silenced] console.log('========== Applying Initial Defaults to ConfigManager ==========');
        // [silenced] console.log('BEFORE: alwaysDash =', ConfigManager.alwaysDash, '| touchUI =', ConfigManager.touchUI);
    }

    // Apply defaults immediately
    // These will be overridden by applyData if a save exists
    for (let symbol in PSYCHRONIC.MegaOptions.optionDefaults) {
        ConfigManager[symbol] = PSYCHRONIC.MegaOptions.optionDefaults[symbol];
        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log(`✓ Set initial ${symbol} = ${PSYCHRONIC.MegaOptions.optionDefaults[symbol]}`);
        }
    }

    // Also apply masterVolume default if it exists
    if (PSYCHRONIC.MegaOptions.optionDefaults['masterVolume'] !== undefined) {
        ConfigManager._masterVolume = PSYCHRONIC.MegaOptions.optionDefaults['masterVolume'];
        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log(`✓ Set initial masterVolume = ${PSYCHRONIC.MegaOptions.optionDefaults['masterVolume']}`);
        }
    }

    if (PSYCHRONIC.MegaOptions.debugMode) {
        // [silenced] console.log('AFTER: alwaysDash =', ConfigManager.alwaysDash, '| touchUI =', ConfigManager.touchUI);
        // [silenced] console.log('AFTER: masterVolume =', ConfigManager.masterVolume);
        // [silenced] console.log('(These will be overridden if a save file exists)');
        // [silenced] console.log('================================================================\n');
    }

    //=============================================================================
    // ConfigManager - Set Default Option Values
    //=============================================================================

    // Note: The actual applyData override is below, combined with master volume handling

    // Helper function to parse note-type parameters (strips outer quotes added by RPG Maker)
    PSYCHRONIC.MegaOptions.parseNote = function(noteText) {
        if (!noteText) return '';
        let text = String(noteText);

        // Strip outer quotes if they exist (RPG Maker wraps note params in quotes)
        // Handle both single and double layers of quotes
        while ((text.startsWith('"') && text.endsWith('"')) ||
            (text.startsWith("'") && text.endsWith("'"))) {
            text = text.slice(1, -1);
            }

            // Replace escaped characters
            text = text.replace(/\\n/g, '\n');
        text = text.replace(/\\r/g, '\r');
        text = text.replace(/\\t/g, '\t');
        text = text.replace(/\\\"/g, '"');
        text = text.replace(/\\\'/g, "'");
        text = text.replace(/\\\\/g, '\\');

        return text;
    };

    //=============================================================================
    // ConfigManager - Add Master Volume Support
    //=============================================================================

    // Add masterVolume to ConfigManager
    Object.defineProperty(ConfigManager, 'masterVolume', {
        get: function() {
            if (this._masterVolume === undefined) {
                // Use plugin default if available, otherwise 100
                const defaultValue = PSYCHRONIC.MegaOptions.optionDefaults['masterVolume'];
                return defaultValue !== undefined ? defaultValue : 100;
            }
            return this._masterVolume;
        },
        set: function(value) {
            this._masterVolume = value;
        },
        configurable: true
    });

    // Save master volume
    PSYCHRONIC.MegaOptions.ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = PSYCHRONIC.MegaOptions.ConfigManager_makeData.call(this);
        config.masterVolume = this.masterVolume;

        // Save all custom options that have defaults defined
        for (let symbol in PSYCHRONIC.MegaOptions.optionDefaults) {
            config[symbol] = this[symbol];
        }

        return config;
    };

    // Load master volume AND set default values for options
    PSYCHRONIC.MegaOptions.ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        PSYCHRONIC.MegaOptions.ConfigManager_applyData.call(this, config);

        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log('\n========== ConfigManager.applyData Called ==========');
            // [silenced] console.log('Config has saved data?', Object.keys(config).length > 0);
            // [silenced] console.log('Config object:', config);
        }

        // Apply master volume with plugin default support
        if (config.masterVolume === undefined) {
            // No saved value - use plugin default if available
            const defaultValue = PSYCHRONIC.MegaOptions.optionDefaults['masterVolume'];
            if (defaultValue !== undefined) {
                this.masterVolume = defaultValue;
                if (PSYCHRONIC.MegaOptions.debugMode) {
                    // [silenced] console.log(`✓ Applied plugin default: masterVolume = ${defaultValue}`);
                }
            } else {
                this.masterVolume = this.readVolume(config, 'masterVolume');
            }
        } else {
            // Has saved value - use it
            this.masterVolume = this.readVolume(config, 'masterVolume');
            if (PSYCHRONIC.MegaOptions.debugMode) {
                // [silenced] console.log(`✓ Used saved value: masterVolume = ${this.masterVolume}`);
            }
        }

        // For each option, check if it exists in the saved config
        // If not, use our plugin default instead of RPG Maker's default
        for (let symbol in PSYCHRONIC.MegaOptions.optionDefaults) {
            if (config[symbol] === undefined) {
                // No saved value - use our plugin default
                this[symbol] = PSYCHRONIC.MegaOptions.optionDefaults[symbol];
                if (PSYCHRONIC.MegaOptions.debugMode) {
                    // [silenced] console.log(`✓ Applied plugin default: ${symbol} = ${this[symbol]}`);
                }
            } else {
                // Has saved value - load it from config
                this[symbol] = config[symbol];
                if (PSYCHRONIC.MegaOptions.debugMode) {
                    // [silenced] console.log(`✓ Loaded saved value: ${symbol} = ${config[symbol]}`);
                }
            }
        }

        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log('Final: alwaysDash =', this.alwaysDash, '| touchUI =', this.touchUI);
            // [silenced] console.log('====================================================\n');
        }

        // Set flag that we've loaded config
        PSYCHRONIC.MegaOptions.configLoadedFromSave = (Object.keys(config).length > 0);
    };

    // NEW: Sync meta switches/variables after DataManager is ready
    PSYCHRONIC.MegaOptions.DataManager_createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        PSYCHRONIC.MegaOptions.DataManager_createGameObjects.call(this);
        PSYCHRONIC.MegaOptions.syncAllMetaSwitchesAndVariables();
    };

    PSYCHRONIC.MegaOptions.DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        PSYCHRONIC.MegaOptions.DataManager_extractSaveContents.call(this, contents);
        PSYCHRONIC.MegaOptions.syncAllMetaSwitchesAndVariables();
    };

    // Helper function to sync all meta switches and variables with current config values
    PSYCHRONIC.MegaOptions.syncAllMetaSwitchesAndVariables = function() {
        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log('\n========== Syncing Meta Switches/Variables ==========');
        }

        for (let i = 0; i < PSYCHRONIC.MegaOptions.categories.length; i++) {
            const category = JSON.parse(PSYCHRONIC.MegaOptions.categories[i]);
            const optionsList = JSON.parse(category.OptionsList || '[]');

            for (let j = 0; j < optionsList.length; j++) {
                try {
                    const optionData = JSON.parse(optionsList[j]);
                    const symbol = optionData.Symbol;
                    const metaSwitchId = Number(optionData.MetaSwitchId || 0);
                    const metaVariableId = Number(optionData.MetaVariableId || 0);
                    const value = ConfigManager[symbol];

                    // Sync meta switch if specified
                    if (metaSwitchId > 0) {
                        const switchValue = (typeof value === 'boolean') ? value : (value > 0);
                        $gameSwitches.setValue(metaSwitchId, switchValue);
                        if (PSYCHRONIC.MegaOptions.debugMode) {
                            // [silenced] console.log(`✓ Synced Switch ${metaSwitchId} (${symbol}) = ${switchValue}`);
                        }
                    }

                    // Sync meta variable if specified
                    if (metaVariableId > 0) {
                        const varValue = (typeof value === 'number') ? value : (value ? 1 : 0);
                        $gameVariables.setValue(metaVariableId, varValue);
                        if (PSYCHRONIC.MegaOptions.debugMode) {
                            // [silenced] console.log(`✓ Synced Variable ${metaVariableId} (${symbol}) = ${varValue}`);
                        }
                    }
                } catch (e) {
                    console.error('Error syncing meta switch/variable:', e);
                }
            }
        }

        if (PSYCHRONIC.MegaOptions.debugMode) {
            // [silenced] console.log('=====================================================\n');
        }
    };

    // Apply master volume to audio
    PSYCHRONIC.MegaOptions.AudioManager_updateBgmParameters = AudioManager.updateBgmParameters;
    AudioManager.updateBgmParameters = function(bgm) {
        PSYCHRONIC.MegaOptions.AudioManager_updateBgmParameters.call(this, bgm);
        if (this._bgmBuffer) {
            // Apply master volume multiplier to the buffer volume
            this._bgmBuffer.volume *= (ConfigManager.masterVolume / 100);
        }
    };

    PSYCHRONIC.MegaOptions.AudioManager_updateBgsParameters = AudioManager.updateBgsParameters;
    AudioManager.updateBgsParameters = function(bgs) {
        PSYCHRONIC.MegaOptions.AudioManager_updateBgsParameters.call(this, bgs);
        if (this._bgsBuffer) {
            // Apply master volume multiplier to the buffer volume
            this._bgsBuffer.volume *= (ConfigManager.masterVolume / 100);
        }
    };

    PSYCHRONIC.MegaOptions.AudioManager_updateMeParameters = AudioManager.updateMeParameters;
    AudioManager.updateMeParameters = function(me) {
        PSYCHRONIC.MegaOptions.AudioManager_updateMeParameters.call(this, me);
        if (this._meBuffer) {
            // Apply master volume multiplier to the buffer volume
            this._meBuffer.volume *= (ConfigManager.masterVolume / 100);
        }
    };

    PSYCHRONIC.MegaOptions.AudioManager_updateSeParameters = AudioManager.updateSeParameters;
    AudioManager.updateSeParameters = function(buffer, se) {
        PSYCHRONIC.MegaOptions.AudioManager_updateSeParameters.call(this, buffer, se);
        if (buffer) {
            // Apply master volume multiplier to the buffer volume
            buffer.volume *= (ConfigManager.masterVolume / 100);
        }
    };

    //=============================================================================
    // Window_OptionsCategory
    //=============================================================================

    function Window_OptionsCategory() {
        this.initialize(...arguments);
    }

    Window_OptionsCategory.prototype = Object.create(Window_Command.prototype);
    Window_OptionsCategory.prototype.constructor = Window_OptionsCategory;

    Window_OptionsCategory.prototype.initialize = function(rect, helpWindow, optionsWindow) {
        this._helpWindow = helpWindow;
        this._optionsWindow = optionsWindow;
        this._list = []; // Initialize list before parent initialize
        Window_Command.prototype.initialize.call(this, rect);
        this.activate();
        this.select(0);
    };

    Window_OptionsCategory.prototype.makeCommandList = function() {
        this.addCommand(PSYCHRONIC.MegaOptions.allCategoryName, 'all');

        // Add custom categories
        const categories = PSYCHRONIC.MegaOptions.categories;
        for (let i = 0; i < categories.length; i++) {
            const cat = JSON.parse(categories[i]);
            this.addCommand(cat.Name, 'category');
        }

        this.addCommand(PSYCHRONIC.MegaOptions.exitCategoryName, 'cancel');
    };

    Window_OptionsCategory.prototype.itemTextAlign = function() {
        return 'left';
    };

    Window_OptionsCategory.prototype.update = function() {
        Window_Command.prototype.update.call(this);
        if (this._optionsWindow) {
            this._optionsWindow.setCategory(this.currentSymbol(), this.index());
        }
    };

    Window_OptionsCategory.prototype.updateHelp = function() {
        if (!this._helpWindow) return;
        if (this.index() < 0) return;

        const symbol = this.currentSymbol();
        if (symbol === 'all') {
            this._helpWindow.setText('View all available options.');
        } else if (symbol === 'cancel') {
            this._helpWindow.setText('Exit the options menu.');
        } else {
            const index = this.index() - 1;
            if (index >= 0 && index < PSYCHRONIC.MegaOptions.categories.length) {
                const cat = JSON.parse(PSYCHRONIC.MegaOptions.categories[index]);
                this._helpWindow.setText(cat.HelpDesc.replace(/\\\"/g, '"'));
            }
        }
    };

    //=============================================================================
    // Window_Options Extensions
    //=============================================================================

    PSYCHRONIC.MegaOptions.Window_Options_initialize = Window_Options.prototype.initialize;
    Window_Options.prototype.initialize = function(rect) {
        this._category = 'all';
        this._categoryIndex = -1;  // Track which custom category is selected (-1 for non-custom)
this._symbolData = {};
PSYCHRONIC.MegaOptions.Window_Options_initialize.call(this, rect);
    };

    Window_Options.prototype.setCategory = function(symbol, categoryIndex) {
        // categoryIndex is the index in the category window (-1 for 'all' and 'cancel')
        if (categoryIndex === undefined) {
            categoryIndex = -1;
        }

        // Refresh if either the symbol changed OR the category index changed
        if (this._category !== symbol || this._categoryIndex !== categoryIndex) {
            this._category = symbol;
            this._categoryIndex = categoryIndex;
            this.refresh();
            this.select(0);
        }
    };

    Window_Options.prototype.statusWidth = function() {
        return PSYCHRONIC.MegaOptions.statusWidth;
    };

    PSYCHRONIC.MegaOptions.Window_Options_makeCommandList = Window_Options.prototype.makeCommandList;
    Window_Options.prototype.makeCommandList = function() {
        this._symbolData = {};

        if (this._category === 'all') {
            this.addAllOptions();
        } else if (this._category === 'category') {
            this.addCategoryOptions();
        } else if (this._category === 'cancel') {
            // Don't show any options when Exit is highlighted
            // The list will be empty
        } else {
            // Fallback for any unexpected cases
            PSYCHRONIC.MegaOptions.Window_Options_makeCommandList.call(this);
        }
    };

    Window_Options.prototype.addAllOptions = function() {
        const categories = PSYCHRONIC.MegaOptions.categories;
        for (let i = 0; i < categories.length; i++) {
            const cat = JSON.parse(categories[i]);
            const optionsList = JSON.parse(cat.OptionsList || '[]');
            for (let j = 0; j < optionsList.length; j++) {
                this.addCustomOption(optionsList[j]);
            }
        }
    };

    Window_Options.prototype.addCategoryOptions = function() {
        // Use the stored category index instead of trying to get it from scene
        // categoryIndex is already adjusted (category window index - 1)
        const categoryIndex = this._categoryIndex - 1;  // Subtract 1 because "All" is at index 0
        if (categoryIndex < 0 || categoryIndex >= PSYCHRONIC.MegaOptions.categories.length) return;

        const cat = JSON.parse(PSYCHRONIC.MegaOptions.categories[categoryIndex]);
        const optionsList = JSON.parse(cat.OptionsList || '[]');
        for (let i = 0; i < optionsList.length; i++) {
            this.addCustomOption(optionsList[i]);
        }
    };

    Window_Options.prototype.addCustomOption = function(optionJson) {
        try {
            const data = JSON.parse(optionJson);

            // Evaluate name
            let name = data.Name;
            if (name.startsWith('EVAL:')) {
                try {
                    name = eval(name.substring(5));
                } catch (e) {
                    console.error('MegaOptions: Error evaluating name:', e);
                }
            }

            const symbol = data.Symbol;
            let show = true;
            let enabled = true;
            let ext = 0;

            // Evaluate show/hide
            try {
                eval(PSYCHRONIC.MegaOptions.parseNote(data.ShowHide));
            } catch (e) {
                console.error('MegaOptions: Error in ShowHide code:', e);
            }

            if (!show) return;

            // Evaluate enabled
            try {
                eval(PSYCHRONIC.MegaOptions.parseNote(data.Enable));
            } catch (e) {
                console.error('MegaOptions: Error in Enable code:', e);
            }

            // Evaluate ext
            try {
                eval(PSYCHRONIC.MegaOptions.parseNote(data.Ext));
            } catch (e) {
                console.error('MegaOptions: Error in Ext code:', e);
            }

            // Store symbol data for later use (INCLUDING meta switch/variable IDs)
            this._symbolData[symbol] = {
                DrawItemCode: PSYCHRONIC.MegaOptions.parseNote(data.DrawItemCode),
 ProcessOkCode: PSYCHRONIC.MegaOptions.parseNote(data.ProcessOkCode),
 CursorRightCode: PSYCHRONIC.MegaOptions.parseNote(data.CursorRightCode),
 CursorLeftCode: PSYCHRONIC.MegaOptions.parseNote(data.CursorLeftCode),
 HelpDesc: data.HelpDesc.replace(/\\\"/g, '"'),
 MetaSwitchId: Number(data.MetaSwitchId || 0),
 MetaVariableId: Number(data.MetaVariableId || 0)
            };

            // Execute make command code
            try {
                eval(PSYCHRONIC.MegaOptions.parseNote(data.MakeCommandCode));
            } catch (e) {
                console.error('MegaOptions: Error in MakeCommandCode:', e);
            }
        } catch (e) {
            console.error('MegaOptions: Error parsing option:', e);
        }
    };

    PSYCHRONIC.MegaOptions.Window_Options_drawItem = Window_Options.prototype.drawItem;
    Window_Options.prototype.drawItem = function(index) {
        const symbol = this.commandSymbol(index);
        if (symbol && this._symbolData[symbol]) {
            try {
                eval(this._symbolData[symbol].DrawItemCode);
            } catch (e) {
                console.error('MegaOptions: Error in DrawItemCode:', e);
                PSYCHRONIC.MegaOptions.Window_Options_drawItem.call(this, index);
            }
        } else {
            PSYCHRONIC.MegaOptions.Window_Options_drawItem.call(this, index);
        }
    };

    Window_Options.prototype.drawOptionsName = function(index) {
        const rect = this.itemLineRect(index);
        const statusWidth = this.statusWidth();
        const titleWidth = rect.width - statusWidth;
        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));
        this.drawTextEx(this.commandName(index), rect.x, rect.y, titleWidth);
    };

    Window_Options.prototype.drawOptionsOnOff = function(index, onText, offText) {
        onText = onText || 'ON';
        offText = offText || 'OFF';
        const rect = this.itemLineRect(index);
        const statusWidth = this.statusWidth();
        const halfStatusWidth = statusWidth / 2;
        const titleWidth = rect.width - statusWidth;
        this.resetTextColor();
        const symbol = this.commandSymbol(index);
        const value = this.getConfigValue(symbol);
        this.changePaintOpacity(!value);
        this.drawText(offText, rect.x + titleWidth, rect.y, halfStatusWidth, 'center');
        this.changePaintOpacity(value);
        this.drawText(onText, rect.x + titleWidth + halfStatusWidth, rect.y, halfStatusWidth, 'center');
    };

    Window_Options.prototype.drawOptionsGauge = function(index, rate, color1, color2) {
        const rect = this.itemLineRect(index);
        const statusWidth = this.statusWidth();
        const titleWidth = rect.width - statusWidth;
        const gaugeX = rect.x + titleWidth;
        const gaugeY = rect.y + this.lineHeight() - 8;
        const gaugeWidth = statusWidth - 8;
        const gaugeHeight = 6;

        // Draw gauge background (empty part)
        this.contents.fillRect(gaugeX, gaugeY, gaugeWidth, gaugeHeight, ColorManager.gaugeBackColor());

        // Draw gauge fill - color1 and color2 are already color strings from textColor()
        const fillWidth = Math.floor(gaugeWidth * rate);
        this.contents.gradientFillRect(gaugeX, gaugeY, fillWidth, gaugeHeight, color1, color2);
    };

    PSYCHRONIC.MegaOptions.Window_Options_processOk = Window_Options.prototype.processOk;
    Window_Options.prototype.processOk = function() {
        const symbol = this.commandSymbol(this.index());
        if (symbol && this._symbolData[symbol]) {
            try {
                eval(this._symbolData[symbol].ProcessOkCode);
            } catch (e) {
                console.error('MegaOptions: Error in ProcessOkCode:', e);
            }
        } else {
            PSYCHRONIC.MegaOptions.Window_Options_processOk.call(this);
        }
    };

    PSYCHRONIC.MegaOptions.Window_Options_cursorRight = Window_Options.prototype.cursorRight;
    Window_Options.prototype.cursorRight = function(wrap) {
        const symbol = this.commandSymbol(this.index());
        if (symbol && this._symbolData[symbol]) {
            try {
                eval(this._symbolData[symbol].CursorRightCode);
            } catch (e) {
                console.error('MegaOptions: Error in CursorRightCode:', e);
            }
        } else {
            PSYCHRONIC.MegaOptions.Window_Options_cursorRight.call(this, wrap);
        }
    };

    PSYCHRONIC.MegaOptions.Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
    Window_Options.prototype.cursorLeft = function(wrap) {
        const symbol = this.commandSymbol(this.index());
        if (symbol && this._symbolData[symbol]) {
            try {
                eval(this._symbolData[symbol].CursorLeftCode);
            } catch (e) {
                console.error('MegaOptions: Error in CursorLeftCode:', e);
            }
        } else {
            PSYCHRONIC.MegaOptions.Window_Options_cursorLeft.call(this, wrap);
        }
    };

    Window_Options.prototype.updateHelp = function() {
        if (!this._helpWindow) return;
        if (this.index() < 0) return;
        const symbol = this.commandSymbol(this.index());
        if (this._symbolData && this._symbolData[symbol]) {
            this._helpWindow.setText(this._symbolData[symbol].HelpDesc);
        } else {
            this._helpWindow.clear();
        }
    };

    Window_Options.prototype.changeWindowTone = function(symbol, value, color) {
        const index = ['red', 'green', 'blue'].indexOf(color);
        if (index < 0) return;
        const tone = JsonEx.makeDeepCopy($gameSystem.windowTone());
        const lastValue = tone[index];
        tone[index] = value.clamp(-255, 255);
        if (lastValue !== tone[index]) {
            $gameSystem.setWindowTone(tone);
            this.redrawItem(this.findSymbol(symbol));
            SoundManager.playCursor();
        }
    };

    // Override volumeOffset to change volume increment
    // Default is 20, now customizable via plugin parameter
    Window_Options.prototype.volumeOffset = function() {
        return PSYCHRONIC.MegaOptions.volumeOffset;
    };

    // NEW: Helper function for volume changes
    Window_Options.prototype.changeVolume = function(symbol, forward, wrap) {
        const lastValue = this.getConfigValue(symbol);
        const offset = this.volumeOffset();
        let value = lastValue + (forward ? offset : -offset);

        if (value > 100) {
            value = wrap ? 0 : 100;
        } else if (value < 0) {
            value = wrap ? 100 : 0;
        }

        this.changeValue(symbol, value);
    };

    // Hook changeValue to refresh audio when master volume or any volume changes
    // AND to sync meta switches/variables
    PSYCHRONIC.MegaOptions.Window_Options_changeValue = Window_Options.prototype.changeValue;
    Window_Options.prototype.changeValue = function(symbol, value) {
        const lastValue = this.getConfigValue(symbol);
        PSYCHRONIC.MegaOptions.Window_Options_changeValue.call(this, symbol, value);

        // Handle meta switch/variable syncing
        if (this._symbolData && this._symbolData[symbol]) {
            const optionData = this._symbolData[symbol];

            // Sync with meta switch if specified
            if (optionData.MetaSwitchId && optionData.MetaSwitchId > 0) {
                const switchValue = (typeof value === 'boolean') ? value : (value > 0);
                $gameSwitches.setValue(optionData.MetaSwitchId, switchValue);
                if (PSYCHRONIC.MegaOptions.debugMode) {
                    // [silenced] console.log(`Meta Switch ${optionData.MetaSwitchId} synced to:`, switchValue);
                }
            }

            // Sync with meta variable if specified
            if (optionData.MetaVariableId && optionData.MetaVariableId > 0) {
                const varValue = (typeof value === 'number') ? value : (value ? 1 : 0);
                $gameVariables.setValue(optionData.MetaVariableId, varValue);
                if (PSYCHRONIC.MegaOptions.debugMode) {
                    // [silenced] console.log(`Meta Variable ${optionData.MetaVariableId} synced to:`, varValue);
                }
            }
        }

        // If master volume changed, refresh all currently playing audio
        if (symbol === 'masterVolume' && lastValue !== value) {
            if (PSYCHRONIC.MegaOptions.debugMode) {
                // [silenced] console.log('Master volume changed from', lastValue, 'to', value);
            }
            if (AudioManager._currentBgm) {
                AudioManager.updateBgmParameters(AudioManager._currentBgm);
            }
            if (AudioManager._currentBgs) {
                AudioManager.updateBgsParameters(AudioManager._currentBgs);
            }
        }
        // If any volume changed, refresh that audio type
        else if (symbol === 'bgmVolume' && lastValue !== value) {
            if (AudioManager._currentBgm) {
                AudioManager.updateBgmParameters(AudioManager._currentBgm);
            }
        }
        else if (symbol === 'bgsVolume' && lastValue !== value) {
            if (AudioManager._currentBgs) {
                AudioManager.updateBgsParameters(AudioManager._currentBgs);
            }
        }
    };

    //=============================================================================
    // Scene_Options
    //=============================================================================

    PSYCHRONIC.MegaOptions.Scene_Options_create = Scene_Options.prototype.create;
    Scene_Options.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);  // Create window layer
        this.createHelpWindow();  // Create help window first

        // Manually create options window so we can set help window before it initializes
        const rect = this.optionsWindowRect();
        this._optionsWindow = new Window_Options(rect);
        this._optionsWindow.setHelpWindow(this._helpWindow);
        this._optionsWindow.setHandler('cancel', this.onOptionsCancel.bind(this));
        this._optionsWindow.deactivate();
        this._optionsWindow.deselect();
        this.addWindow(this._optionsWindow);

        this.createCategoryWindow();
        this.repositionWindows();
    };

    Scene_Options.prototype.createHelpWindow = function() {
        const rect = this.helpWindowRect();
        this._helpWindow = new Window_Help(rect);
        this.addWindow(this._helpWindow);
    };

    Scene_Options.prototype.helpWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(2, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Options.prototype.createCategoryWindow = function() {
        const rect = this.categoryWindowRect();
        this._categoryWindow = new Window_OptionsCategory(rect, this._helpWindow, this._optionsWindow);
        this._categoryWindow.setHandler('cancel', this.popScene.bind(this));
        this._categoryWindow.setHandler('category', this.onCategoryOk.bind(this));
        this._categoryWindow.setHandler('all', this.onCategoryOk.bind(this));
        this.addWindow(this._categoryWindow);

        // Initialize options window with the selected category
        if (this._optionsWindow) {
            this._optionsWindow.setCategory(this._categoryWindow.currentSymbol(), this._categoryWindow.index());
        }
    };

    Scene_Options.prototype.categoryWindowRect = function() {
        const helpHeight = this.helpWindowRect().height;
        const wx = PSYCHRONIC.MegaOptions.categoryWindowX;
        const wy = helpHeight + PSYCHRONIC.MegaOptions.categoryWindowY;
        // Default width for vertical left column (narrow)
        const ww = PSYCHRONIC.MegaOptions.categoryWindowWidth || 240;
        // Calculate height to fill remaining space (for vertical display)
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    PSYCHRONIC.MegaOptions.Scene_Options_optionsWindowRect = Scene_Options.prototype.optionsWindowRect;
    Scene_Options.prototype.optionsWindowRect = function() {
        const helpHeight = this.helpWindowRect().height;
        const catHeight = this.categoryWindowRect().height;
        const catWidth = this.categoryWindowRect().width;

        // Options window starts to the right of category window
        // Use 0 as "auto" - only use parameter if it's non-zero
        const wx = PSYCHRONIC.MegaOptions.optionsWindowX || catWidth;
        const wy = PSYCHRONIC.MegaOptions.optionsWindowY || helpHeight;
        const ww = PSYCHRONIC.MegaOptions.optionsWindowWidth || (Graphics.boxWidth - wx);
        const wh = Graphics.boxHeight - wy;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Options.prototype.repositionWindows = function() {
        // Adjust windows if needed based on parameters
        const catRect = this.categoryWindowRect();
        const optRect = this.optionsWindowRect();

        this._categoryWindow.move(catRect.x, catRect.y, catRect.width, catRect.height);
        this._optionsWindow.move(optRect.x, optRect.y, optRect.width, optRect.height);
    };

    Scene_Options.prototype.onCategoryOk = function() {
        this._optionsWindow.activate();
        this._optionsWindow.select(0);
    };

    Scene_Options.prototype.onOptionsCancel = function() {
        this._optionsWindow.deselect();
        this._categoryWindow.activate();
    };

    //=============================================================================
    // Utility Functions
    //=============================================================================

    PSYCHRONIC.MegaOptions.displayError = function(e, code, message) {
        // [silenced] console.log(message);
        // [silenced] console.log(code || 'NON-EXISTENT');
        console.error(e);
    };

})();

//=============================================================================
// End of Plugin
//=============================================================================
