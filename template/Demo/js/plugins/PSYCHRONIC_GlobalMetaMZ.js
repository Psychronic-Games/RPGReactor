//=============================================================================
// PSYCHRONIC_GlobalMetaMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.0.0] Global switches and variables that persist across all save files
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_GlobalMetaMZ.js
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * This plugin allows you to create switches and variables that are saved
 * globally (in config.rpgsave) instead of in individual save files. This is
 * perfect for user preferences that should apply to all playthroughs, such as:
 * - Content filters (nudity, violence, language)
 * - Accessibility options
 * - UI preferences
 * - Any setting that's a "player preference" rather than "game state"
 *
 * ============================================================================
 * How to Use
 * ============================================================================
 *
 * STEP 1: Mark Switches/Variables as Global
 * ------------------------------------------
 * In the RPG Maker MZ database, add <Global Meta> anywhere in the name of
 * switches or variables you want to be global:
 *
 * Examples:
 * - Switch 100: "Pixel Nudity Enabled <Global Meta>"
 * - Variable 50: "UI Scale <Global Meta>"
 * - Switch 101: "<Global Meta> Gore Filter"
 *
 * STEP 2: Use in MegaOptions (Optional)
 * --------------------------------------
 * In your MegaOptions plugin, you can create options that control these
 * global switches/variables. In the option's "Process OK Code", use:
 *
 * For Switches (ON/OFF toggle):
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * var value = this.getConfigValue(symbol);
 * this.changeValue(symbol, !value);
 * $gameSwitches.setValue(100, this.getConfigValue(symbol)); // Switch ID
 *
 * For Variables (numeric values):
 * var index = this.index();
 * var symbol = this.commandSymbol(index);
 * $gameVariables.setValue(50, this.getConfigValue(symbol)); // Variable ID
 *
 * STEP 3: Access in Events
 * -------------------------
 * Use global switches/variables normally in events - they work exactly like
 * regular switches/variables, but their values persist globally!
 *
 * ============================================================================
 * Technical Details
 * ============================================================================
 *
 * Global switches and variables are:
 * - Saved in config.rpgsave (not individual save files)
 * - Shared across all save files
 * - Persist even if you delete all save files
 * - Can be accessed/modified exactly like normal switches/variables
 *
 * The plugin automatically:
 * - Scans for <Global Meta> tags on game start
 * - Redirects global switch/variable access to ConfigManager
 * - Saves/loads global values with the config file
 *
 * ============================================================================
 * Changelog
 * ============================================================================
 *
 * Version 1.0.0:
 * - Initial release
 *
 * @param debugMode
 * @text Debug Mode
 * @desc Show console logs for global switch/variable operations
 * @type boolean
 * @default false
 */

(function() {
    'use strict';

    const pluginName = 'PSYCHRONIC_GlobalMetaMZ';
    const parameters = PluginManager.parameters(pluginName);

    window.PSYCHRONIC = window.PSYCHRONIC || {};
    window.PSYCHRONIC.GlobalMeta = window.PSYCHRONIC.GlobalMeta || {};
    const PSYCHRONIC = window.PSYCHRONIC;

    PSYCHRONIC.GlobalMeta.debugMode = parameters['debugMode'] === 'true';

    // Storage for global switch/variable IDs
    PSYCHRONIC.GlobalMeta.globalSwitches = new Set();
    PSYCHRONIC.GlobalMeta.globalVariables = new Set();

    //=============================================================================
    // Scan for Global Meta Tags
    //=============================================================================

    PSYCHRONIC.GlobalMeta.scanForGlobalMeta = function() {
        this.globalSwitches.clear();
        this.globalVariables.clear();

        if (PSYCHRONIC.GlobalMeta.debugMode) {
            console.log('\n========== GlobalMeta: Scanning Database ==========');
        }

        // Scan switches
        if ($dataSystem && $dataSystem.switches) {
            for (let i = 1; i < $dataSystem.switches.length; i++) {
                const name = $dataSystem.switches[i];
                if (name && name.includes('<Global Meta>')) {
                    this.globalSwitches.add(i);
                    if (PSYCHRONIC.GlobalMeta.debugMode) {
                        console.log(`Global Switch found: ${i} - ${name}`);
                    }
                }
            }
        }

        // Scan variables
        if ($dataSystem && $dataSystem.variables) {
            for (let i = 1; i < $dataSystem.variables.length; i++) {
                const name = $dataSystem.variables[i];
                if (name && name.includes('<Global Meta>')) {
                    this.globalVariables.add(i);
                    if (PSYCHRONIC.GlobalMeta.debugMode) {
                        console.log(`Global Variable found: ${i} - ${name}`);
                    }
                }
            }
        }

        if (PSYCHRONIC.GlobalMeta.debugMode) {
            console.log(`Total Global Switches: ${this.globalSwitches.size}`);
            console.log(`Total Global Variables: ${this.globalVariables.size}`);
            console.log('====================================================\n');
        }
    };

    // Scan when database is loaded
    const _DataManager_onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _DataManager_onLoad.call(this, object);
        if (object === $dataSystem) {
            PSYCHRONIC.GlobalMeta.scanForGlobalMeta();
        }
    };

    //=============================================================================
    // ConfigManager - Global Storage
    //=============================================================================

    // Initialize global storage objects
    ConfigManager.globalSwitches = ConfigManager.globalSwitches || {};
    ConfigManager.globalVariables = ConfigManager.globalVariables || {};

    // Save global switches/variables
    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.globalSwitches = this.globalSwitches || {};
        config.globalVariables = this.globalVariables || {};
        
        if (PSYCHRONIC.GlobalMeta.debugMode) {
            console.log('GlobalMeta: Saving global data:', {
                switches: Object.keys(config.globalSwitches).length,
                variables: Object.keys(config.globalVariables).length
            });
        }
        
        return config;
    };

    // Load global switches/variables
    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.globalSwitches = config.globalSwitches || {};
        this.globalVariables = config.globalVariables || {};
        
        if (PSYCHRONIC.GlobalMeta.debugMode) {
            console.log('GlobalMeta: Loading global data:', {
                switches: Object.keys(this.globalSwitches).length,
                variables: Object.keys(this.globalVariables).length
            });
        }
    };

    //=============================================================================
    // Game_Switches - Redirect Global Switches
    //=============================================================================

    const _Game_Switches_value = Game_Switches.prototype.value;
    Game_Switches.prototype.value = function(switchId) {
        if (PSYCHRONIC.GlobalMeta.globalSwitches.has(switchId)) {
            // Global switch - read from ConfigManager
            const key = 's' + switchId;
            const value = ConfigManager.globalSwitches[key];
            return value !== undefined ? value : false;
        } else {
            // Regular switch - use original method
            return _Game_Switches_value.call(this, switchId);
        }
    };

    const _Game_Switches_setValue = Game_Switches.prototype.setValue;
    Game_Switches.prototype.setValue = function(switchId, value) {
        if (PSYCHRONIC.GlobalMeta.globalSwitches.has(switchId)) {
            // Global switch - write to ConfigManager
            const key = 's' + switchId;
            const oldValue = ConfigManager.globalSwitches[key];
            ConfigManager.globalSwitches[key] = value;
            
            if (PSYCHRONIC.GlobalMeta.debugMode && oldValue !== value) {
                const name = $dataSystem.switches[switchId] || 'Unknown';
                console.log(`GlobalMeta: Switch ${switchId} (${name}) changed: ${oldValue} → ${value}`);
            }
            
            // Save config immediately so changes persist
            ConfigManager.save();
            
            // Also update the regular switch data for compatibility
            _Game_Switches_setValue.call(this, switchId, value);
        } else {
            // Regular switch - use original method
            _Game_Switches_setValue.call(this, switchId, value);
        }
    };

    //=============================================================================
    // Game_Variables - Redirect Global Variables
    //=============================================================================

    const _Game_Variables_value = Game_Variables.prototype.value;
    Game_Variables.prototype.value = function(variableId) {
        if (PSYCHRONIC.GlobalMeta.globalVariables.has(variableId)) {
            // Global variable - read from ConfigManager
            const key = 'v' + variableId;
            const value = ConfigManager.globalVariables[key];
            return value !== undefined ? value : 0;
        } else {
            // Regular variable - use original method
            return _Game_Variables_value.call(this, variableId);
        }
    };

    const _Game_Variables_setValue = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function(variableId, value) {
        if (PSYCHRONIC.GlobalMeta.globalVariables.has(variableId)) {
            // Global variable - write to ConfigManager
            const key = 'v' + variableId;
            const oldValue = ConfigManager.globalVariables[key];
            ConfigManager.globalVariables[key] = value;
            
            if (PSYCHRONIC.GlobalMeta.debugMode && oldValue !== value) {
                const name = $dataSystem.variables[variableId] || 'Unknown';
                console.log(`GlobalMeta: Variable ${variableId} (${name}) changed: ${oldValue} → ${value}`);
            }
            
            // Save config immediately so changes persist
            ConfigManager.save();
            
            // Also update the regular variable data for compatibility
            _Game_Variables_setValue.call(this, variableId, value);
        } else {
            // Regular variable - use original method
            _Game_Variables_setValue.call(this, variableId, value);
        }
    };

    //=============================================================================
    // Initialize Global Values on New Game
    //=============================================================================

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        
        // Initialize global switches from config
        PSYCHRONIC.GlobalMeta.globalSwitches.forEach(switchId => {
            const key = 's' + switchId;
            const value = ConfigManager.globalSwitches[key];
            if (value !== undefined) {
                $gameSwitches._data[switchId] = value;
            }
        });
        
        // Initialize global variables from config
        PSYCHRONIC.GlobalMeta.globalVariables.forEach(variableId => {
            const key = 'v' + variableId;
            const value = ConfigManager.globalVariables[key];
            if (value !== undefined) {
                $gameVariables._data[variableId] = value;
            }
        });
        
        if (PSYCHRONIC.GlobalMeta.debugMode) {
            console.log('GlobalMeta: Initialized global values for new game');
        }
    };

    //=============================================================================
    // Sync Global Values on Load Game
    //=============================================================================

    const _DataManager_loadGame = DataManager.loadGame;
    DataManager.loadGame = function(savefileId) {
        const result = _DataManager_loadGame.call(this, savefileId);
        
        if (result) {
            // Override loaded save data with global config values
            PSYCHRONIC.GlobalMeta.globalSwitches.forEach(switchId => {
                const key = 's' + switchId;
                const value = ConfigManager.globalSwitches[key];
                if (value !== undefined) {
                    $gameSwitches._data[switchId] = value;
                }
            });
            
            PSYCHRONIC.GlobalMeta.globalVariables.forEach(variableId => {
                const key = 'v' + variableId;
                const value = ConfigManager.globalVariables[key];
                if (value !== undefined) {
                    $gameVariables._data[variableId] = value;
                }
            });
            
            if (PSYCHRONIC.GlobalMeta.debugMode) {
                console.log('GlobalMeta: Synced global values after loading game');
            }
        }
        
        return result;
    };

})();

//=============================================================================
// End of Plugin
//=============================================================================
