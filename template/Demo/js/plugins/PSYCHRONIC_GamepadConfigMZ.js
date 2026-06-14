//=============================================================================
// PSYCHRONIC_GamepadConfigMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.0.5] Customize gamepad controls with a visual controller interface
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_GamepadConfigMZ.js
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * This plugin allows players to customize their gamepad controls from the
 * Options menu. It features a visual gamepad diagram where players can click
 * on buttons to assign actions. Both Standard and Alternative layouts are
 * supported by default.
 *
 * ============================================================================
 * Features
 * ============================================================================
 *
 * - Visual gamepad diagram for easy configuration
 * - Standard and Alternative gamepad layouts included
 * - Click on any button to assign an action
 * - Assign actions like OK, Cancel, Menu, Dash, etc.
 * - Controller outline for visual clarity
 * - Saves configuration automatically
 * - Full keyboard/mouse support for navigation
 * - Integrates with MegaOptions plugin
 *
 * ============================================================================
 * Integration with MegaOptions
 * ============================================================================
 *
 * To add Gamepad Config to your MegaOptions menu, create an option with:
 *
 * Name: Gamepad Config
 * Symbol: gamepadConfig
 * Default Value: false
 * Help Description: Customize your gamepad controls.
 *
 * Process OK Code:
 * SceneManager.push(Scene_GamepadConfig);
 *
 * Draw Item Code:
 * var rect = this.itemLineRect(index);
 * this.resetTextColor();
 * this.changePaintOpacity(this.isCommandEnabled(index));
 * this.drawText(this.commandName(index), rect.x, rect.y, rect.width, "left");
 *
 * ============================================================================
 * Usage
 * ============================================================================
 *
 * 1. Access from Options Menu
 * 2. Click on a button you want to change
 * 3. Select the action you want to assign to that button
 * 4. Use "Default Layout" or "Alt Layout" to quick-switch
 * 5. Press "Finish" when done
 *
 * ============================================================================
 * Version History
 * ============================================================================
 *
 * v1.0.5 - Enhanced startup gamepad detection
 * - Fixed: Gamepads now properly activate when already connected at game start
 * - Added: Multiple detection mechanisms for maximum compatibility
 *   1. Continuous frame-by-frame polling via Input.update() 
 *   2. Independent 100ms interval polling (10 seconds)
 *   3. Keyboard/mouse/touch event listeners trigger instant gamepad check
 * - Added: Automatic detection when user presses ANY key or clicks mouse
 * - Added: Detection of gamepad state transitions (null to active)
 * - Enhanced: Comprehensive logging for debugging gamepad detection
 * - Browser security note: Gamepads require user interaction to activate
 * - Solution: Simply press any key, click mouse, or press controller button at start
 *
 * v1.0.4 - Linux gamepad initialization fix
 * - Fixed: Gamepad now properly detected on Linux when plugged in before game starts
 * - Added: Input._initializeGamepadsAtStartup() to manually initialize gamepad state
 * - Added: Input._createGamepadState() helper for proper state creation
 * - Changed: Gamepad initialization triggered in Input.clear() and on timer at boot
 * - Linux-specific: No longer requires unplugging/replugging to detect gamepad
 *
 * v1.0.3 - Global gamepad detection at startup
 * - Fixed: Gamepad now properly detected when connected before game starts
 * - Added: Global gamepad event listeners set up at plugin load
 * - Added: Forced gamepad polling during first 3 seconds of gameplay
 * - Added: Input._updateGamepads() method for manual gamepad refresh
 *
 * v1.0.2 - Gamepad detection and highlight fixes
 * - Fixed: Yellow highlight no longer persists after button configuration
 * - Fixed: Gamepad now detected even when connected before game starts
 * - Added: Gamepad connection/disconnection event listeners
 * - Added: Continuous gamepad polling during scene (once per second)
 * - Cursor now moves to command buttons after assigning/clearing actions
 *
 * v1.0.1 - Bug fixes and improvements
 * - Fixed: Window now properly activates on scene start
 * - Fixed: Keyboard/mouse navigation now works correctly
 * - Removed: Protected button restrictions (all buttons can be changed on PC)
 * - Controller outline drawn around buttons for visual clarity
 * - Keyboard/mouse support for navigation (Escape to exit)
 *
 * v1.0.0 - Initial Release
 * - Visual gamepad configuration
 * - Standard and Alternative presets
 * - Full MZ compatibility
 * - Explicit clearRect to prevent graphics caching
 *
 * @param ---General---
 * @default
 *
 * @param commandName
 * @text Command Name
 * @parent ---General---
 * @desc The name shown in the Options menu
 * @default Gamepad Config
 *
 * @param ---Help Text---
 * @default
 *
 * @param buttonHelp
 * @text Button Help
 * @parent ---Help Text---
 * @desc Help text shown when hovering over a button
 * @default Select this button to change its assigned action.
 *
 * @param defaultHelp
 * @text Default Layout Help
 * @parent ---Help Text---
 * @desc Help text for the Default Layout option
 * @default Reset to the default gamepad layout.
 *
 * @param altHelp
 * @text Alt Layout Help
 * @parent ---Help Text---
 * @desc Help text for the Alternative Layout option
 * @default Change to alternative gamepad layout.
 *
 * @param finishHelp
 * @text Finish Help
 * @parent ---Help Text---
 * @desc Help text for the Finish option
 * @default Save your gamepad configuration and return.
 *
 * @param ---Colors---
 * @default
 *
 * @param assignedColor
 * @text Assigned Button Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Background color for buttons with actions assigned
 * @default 21
 *
 * @param selectedColor
 * @text Selected Button Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Background color for currently selected button
 * @default 17
 *
 * @param protectedColor
 * @text Protected Button Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Background color for protected (locked) buttons
 * @default 2
 *
 * @param actionColor
 * @text Action Text Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Text color for action names on buttons
 * @default 4
 *
 * @param ---Action Names---
 * @default
 *
 * @param clearText
 * @text Clear Action
 * @parent ---Action Names---
 * @desc Text for clearing a button assignment
 * @default Clear
 *
 * @param okKey
 * @text OK Button Display
 * @parent ---Action Names---
 * @desc Short text shown on the button
 * @default OK
 *
 * @param okText
 * @text OK Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default OK / Confirm / Talk
 *
 * @param escapeKey
 * @text Cancel Button Display
 * @parent ---Action Names---
 * @desc Short text shown on the button
 * @default X
 *
 * @param escapeText
 * @text Cancel Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Cancel / Menu
 *
 * @param menuKey
 * @text Menu Button Display
 * @parent ---Action Names---
 * @desc Short text shown on the button
 * @default Menu
 *
 * @param menuText
 * @text Menu Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Open Menu
 *
 * @param shiftKey
 * @text Dash Button Display
 * @parent ---Action Names---
 * @desc Short text shown on the button
 * @default Dash
 *
 * @param shiftText
 * @text Dash Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Dash / Sprint
 *
 * @param pageupKey
 * @text PageUp Button Display
 * @parent ---Action Names---
 * @desc Short text shown on the button
 * @default PgUp
 *
 * @param pageupText
 * @text PageUp Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Page Up / Prev Character
 *
 * @param pagedownKey
 * @text PageDown Button Display
 * @parent ---Action Names---
 * @desc Short text shown on the button
 * @default PgDn
 *
 * @param pagedownText
 * @text PageDown Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Page Down / Next Character
 */

//=============================================================================
// Plugin Start
//=============================================================================

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_GamepadConfigMZ';
    const parameters = PluginManager.parameters(pluginName);

    window.PSYCHRONIC = window.PSYCHRONIC || {};
    window.PSYCHRONIC.GamepadConfig = window.PSYCHRONIC.GamepadConfig || {};
    const PSYCHRONIC = window.PSYCHRONIC;

    // Parse parameters
    PSYCHRONIC.GamepadConfig.commandName = String(parameters['commandName'] || 'Gamepad Config');
    PSYCHRONIC.GamepadConfig.buttonHelp = String(parameters['buttonHelp'] || 'Select this button to change its assigned action.');
    PSYCHRONIC.GamepadConfig.defaultHelp = String(parameters['defaultHelp'] || 'Reset to the default gamepad layout.');
    PSYCHRONIC.GamepadConfig.altHelp = String(parameters['altHelp'] || 'Change to alternative gamepad layout.');
    PSYCHRONIC.GamepadConfig.finishHelp = String(parameters['finishHelp'] || 'Save your gamepad configuration and return. (Press Escape to exit)');
    PSYCHRONIC.GamepadConfig.assignedColor = Number(parameters['assignedColor'] || 21);
    PSYCHRONIC.GamepadConfig.selectedColor = Number(parameters['selectedColor'] || 17);
    PSYCHRONIC.GamepadConfig.protectedColor = Number(parameters['protectedColor'] || 2);
    PSYCHRONIC.GamepadConfig.actionColor = Number(parameters['actionColor'] || 4);

    PSYCHRONIC.GamepadConfig.clearText = String(parameters['clearText'] || 'Clear');
    PSYCHRONIC.GamepadConfig.okKey = String(parameters['okKey'] || 'OK');
    PSYCHRONIC.GamepadConfig.okText = String(parameters['okText'] || 'OK / Confirm / Talk');
    PSYCHRONIC.GamepadConfig.escapeKey = String(parameters['escapeKey'] || 'X');
    PSYCHRONIC.GamepadConfig.escapeText = String(parameters['escapeText'] || 'Cancel / Menu');
    PSYCHRONIC.GamepadConfig.menuKey = String(parameters['menuKey'] || 'Menu');
    PSYCHRONIC.GamepadConfig.menuText = String(parameters['menuText'] || 'Open Menu');
    PSYCHRONIC.GamepadConfig.shiftKey = String(parameters['shiftKey'] || 'Dash');
    PSYCHRONIC.GamepadConfig.shiftText = String(parameters['shiftText'] || 'Dash / Sprint');
    PSYCHRONIC.GamepadConfig.pageupKey = String(parameters['pageupKey'] || 'PgUp');
    PSYCHRONIC.GamepadConfig.pageupText = String(parameters['pageupText'] || 'Page Up / Prev Character');
    PSYCHRONIC.GamepadConfig.pagedownKey = String(parameters['pagedownKey'] || 'PgDn');
    PSYCHRONIC.GamepadConfig.pagedownText = String(parameters['pagedownText'] || 'Page Down / Next Character');

    //=============================================================================
    // ConfigManager
    //=============================================================================

    // Store the default and alternative gamepad mappings
    // Standard gamepad button mapping (most common)
    PSYCHRONIC.GamepadConfig.defaultMap = {
        0: 'ok',        // A / Cross
        1: 'escape',    // B / Circle
        2: 'shift',     // X / Square
        3: 'menu',      // Y / Triangle
        4: 'pageup',    // LB / L1
        5: 'pagedown',  // RB / R1
        12: 'up',       // D-pad Up
        13: 'down',     // D-pad Down
        14: 'left',     // D-pad Left
        15: 'right'     // D-pad Right
    };

    // Alternative layout - swaps some common functions
    PSYCHRONIC.GamepadConfig.altMap = {
        0: 'ok',        // A / Cross
        1: 'escape',    // B / Circle
        2: 'menu',      // X / Square (swapped with Y)
        3: 'shift',     // Y / Triangle (swapped with X)
        4: 'pageup',    // LB / L1
        5: 'pagedown',  // RB / R1
        12: 'up',       // D-pad Up
        13: 'down',     // D-pad Down
        14: 'left',     // D-pad Left
        15: 'right'     // D-pad Right
    };

    // Initialize with default mapping
    ConfigManager.padMapper = ConfigManager.padMapper || JSON.parse(JSON.stringify(PSYCHRONIC.GamepadConfig.defaultMap));

    // Save padMapper
    PSYCHRONIC.GamepadConfig.ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = PSYCHRONIC.GamepadConfig.ConfigManager_makeData.call(this);
        config.padMapper = this.padMapper;
        return config;
    };

    // Load padMapper
    PSYCHRONIC.GamepadConfig.ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        PSYCHRONIC.GamepadConfig.ConfigManager_applyData.call(this, config);
        this.padMapper = config.padMapper || JSON.parse(JSON.stringify(PSYCHRONIC.GamepadConfig.defaultMap));
        this.applyPadConfig();
    };

    // Apply the gamepad configuration
    ConfigManager.applyPadConfig = function() {
        Input.gamepadMapper = JSON.parse(JSON.stringify(this.padMapper));
    };

    //=============================================================================
    // Input
    //=============================================================================

    // Apply pad config on game start
    PSYCHRONIC.GamepadConfig.Input_clear = Input.clear;
    Input.clear = function() {
        PSYCHRONIC.GamepadConfig.Input_clear.call(this);
        ConfigManager.applyPadConfig();
        // Force gamepad reinitialization on clear
        this._initializeGamepadsAtStartup();
    };

    // Hook into Input update to poll for gamepad during startup
    PSYCHRONIC.GamepadConfig.Input_update = Input.update;
    Input.update = function() {
        PSYCHRONIC.GamepadConfig.Input_update.call(this);
        // Poll for gamepad activation during first few seconds
        this._pollGamepadAtStartup();
    };
    
    // Input.update() hook installed for gamepad polling

    // Force Input system to recognize already-connected gamepads
    Input._initializeGamepadsAtStartup = function() {
        if (navigator.getGamepads) {
            const gamepads = navigator.getGamepads();
            let initializedCount = 0;
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i] && gamepads[i].connected) {
                    // Manually trigger the same initialization that happens on gamepadconnected
                    const gamepad = gamepads[i];

                    // Reset the gamepad state in Input system
                    if (!this._gamepadStates) {
                        this._gamepadStates = [];
                    }
                    this._gamepadStates[gamepad.index] = this._createGamepadState(gamepad);
                    initializedCount++;
                }
            }
            if (initializedCount === 0) {
                // No gamepads found to initialize
            }
        }
    };

    // Continuously poll for gamepad activity during startup to "wake up" pre-connected controllers
    Input._startupGamepadPollCount = 0;
    Input._startupGamepadPollMax = 600; // Poll for ~10 seconds (600 frames at 60fps)
    Input._gamepadActivated = false;
    Input._lastGamepadCheckCount = 0;

    Input._pollGamepadAtStartup = function() {
        if (this._gamepadActivated || this._startupGamepadPollCount >= this._startupGamepadPollMax) {
            return; // Stop polling once activated or timeout reached
        }

        this._startupGamepadPollCount++;

        if (navigator.getGamepads) {
            const gamepads = navigator.getGamepads();
            let foundGamepad = false;
            let foundNull = false;
            
            for (let i = 0; i < gamepads.length; i++) {
                const gamepad = gamepads[i];
                
                // Check if we went from null to non-null (gamepad just became active)
                if (gamepad) {
                    // Found a non-null gamepad!
                    if (!this._lastKnownGamepads) {
                        this._lastKnownGamepads = [];
                    }
                    
                    // If this is newly detected (was null before)
                    if (!this._lastKnownGamepads[i] && gamepad.connected) {
                        this._initializeGamepadsAtStartup();
                        this._gamepadActivated = true;
                        return;
                    }
                    
                    this._lastKnownGamepads[i] = gamepad;
                    foundGamepad = true;
                    
                    // Check if any button is pressed - this "activates" the gamepad
                    for (let b = 0; b < gamepad.buttons.length; b++) {
                        if (gamepad.buttons[b].pressed) {
                            this._initializeGamepadsAtStartup();
                            this._gamepadActivated = true;
                            return;
                        }
                    }
                    
                    // Also check axes for stick movement
                    for (let a = 0; a < gamepad.axes.length; a++) {
                        if (Math.abs(gamepad.axes[a]) > 0.5) {
                            this._initializeGamepadsAtStartup();
                            this._gamepadActivated = true;
                            return;
                        }
                    }
                } else {
                    foundNull = true;
                }
            }
        }
    };

    // Helper to create gamepad state (mimics what Input does internally)
    Input._createGamepadState = function(gamepad) {
        return {
            buttons: gamepad.buttons.map(button => ({ pressed: button.pressed, value: button.value })),
            axes: [...gamepad.axes]
        };
    };

    // Add global gamepad connection listeners at boot
    PSYCHRONIC.GamepadConfig.setupGlobalGamepadListeners = function() {
        window.addEventListener("gamepadconnected", function(e) {
            // Force Input to recognize it
            if (!Input._gamepadStates) {
                Input._gamepadStates = [];
            }
            Input._gamepadStates[e.gamepad.index] = Input._createGamepadState(e.gamepad);
        });
        
        window.addEventListener("gamepaddisconnected", function(e) {
            if (Input._gamepadStates && Input._gamepadStates[e.gamepad.index]) {
                delete Input._gamepadStates[e.gamepad.index];
            }
        });
        
        // Add keyboard/mouse listeners to force gamepad check on ANY user interaction
        // This is needed because browsers won't populate the gamepad array until user interaction
        let hasCheckedOnInteraction = false;
        
        const checkGamepadsOnInteraction = function() {
            if (hasCheckedOnInteraction || Input._gamepadActivated) return;
            
            hasCheckedOnInteraction = true;

            if (navigator.getGamepads) {
                const gamepads = navigator.getGamepads();
                for (let i = 0; i < gamepads.length; i++) {
                    if (gamepads[i] && gamepads[i].connected) {
                        Input._initializeGamepadsAtStartup();
                        Input._gamepadActivated = true;
                        return;
                    }
                }
            }
            
            // If still no gamepad, allow another check on next interaction
            setTimeout(function() {
                hasCheckedOnInteraction = false;
            }, 1000);
        };
        
        // Listen for any keyboard input
        window.addEventListener("keydown", checkGamepadsOnInteraction, { once: false });
        
        // Listen for any mouse input
        window.addEventListener("mousedown", checkGamepadsOnInteraction, { once: false });
        window.addEventListener("mousemove", checkGamepadsOnInteraction, { once: false });
        
        // Listen for any touch input (mobile)
        window.addEventListener("touchstart", checkGamepadsOnInteraction, { once: false });
        
        // Force immediate initialization after a short delay
        setTimeout(function() {
            Input._initializeGamepadsAtStartup();
        }, 500);
    };

    // Set up listeners immediately when plugin loads
    PSYCHRONIC.GamepadConfig.setupGlobalGamepadListeners();

    // Also set up a high-frequency independent polling loop for the first 10 seconds
    // This runs separately from the game's update loop to catch gamepad activation faster
    PSYCHRONIC.GamepadConfig.independentPollCount = 0;
    PSYCHRONIC.GamepadConfig.independentPollMax = 100; // 100 checks over 10 seconds
    PSYCHRONIC.GamepadConfig.independentPollInterval = setInterval(function() {
        if (Input._gamepadActivated || PSYCHRONIC.GamepadConfig.independentPollCount >= PSYCHRONIC.GamepadConfig.independentPollMax) {
            clearInterval(PSYCHRONIC.GamepadConfig.independentPollInterval);
            if (PSYCHRONIC.GamepadConfig.independentPollCount >= PSYCHRONIC.GamepadConfig.independentPollMax) {
                // Independent gamepad polling timeout reached
            }
            return;
        }
        
        PSYCHRONIC.GamepadConfig.independentPollCount++;
        
        // Quick check for gamepad activation
        if (navigator.getGamepads) {
            const gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i] && gamepads[i].connected) {
                    Input._initializeGamepadsAtStartup();
                    Input._gamepadActivated = true;
                    clearInterval(PSYCHRONIC.GamepadConfig.independentPollInterval);
                    return;
                }
            }
        }
    }, 100); // Check every 100ms

    //=============================================================================
    // Window_GamepadConfig
    //=============================================================================

    window.Window_GamepadConfig = function() {
        this.initialize(...arguments);
    };

    Window_GamepadConfig.prototype = Object.create(Window_Selectable.prototype);
    Window_GamepadConfig.prototype.constructor = Window_GamepadConfig;

    // Gamepad button layout - visual positions
    // Using a coordinate system where gamepad is centered
    Window_GamepadConfig._layout = [
        // D-Pad (left side)
        {button: 12, x: 3, y: 4, w: 1.5, h: 1.5, name: '↑', label: 'D-Up'},
        {button: 13, x: 3, y: 6, w: 1.5, h: 1.5, name: '↓', label: 'D-Down'},
        {button: 14, x: 1.5, y: 5, w: 1.5, h: 1.5, name: '←', label: 'D-Left'},
        {button: 15, x: 4.5, y: 5, w: 1.5, h: 1.5, name: '→', label: 'D-Right'},
        
        // Face Buttons (right side) - using standard layout (A bottom, B right, X left, Y top)
        {button: 3, x: 14, y: 4, w: 1.5, h: 1.5, name: 'Y', label: 'Y'},
        {button: 0, x: 14, y: 6, w: 1.5, h: 1.5, name: 'A', label: 'A'},
        {button: 2, x: 12.5, y: 5, w: 1.5, h: 1.5, name: 'X', label: 'X'},
        {button: 1, x: 15.5, y: 5, w: 1.5, h: 1.5, name: 'B', label: 'B'},
        
        // Shoulder Buttons (top)
        {button: 4, x: 2, y: 1, w: 2.5, h: 1.2, name: 'LB', label: 'LB/L1'},
        {button: 5, x: 13.5, y: 1, w: 2.5, h: 1.2, name: 'RB', label: 'RB/R1'},
        {button: 6, x: 1.5, y: 2.5, w: 2.5, h: 1, name: 'LT', label: 'LT/L2'},
        {button: 7, x: 14, y: 2.5, w: 2.5, h: 1, name: 'RT', label: 'RT/R2'},
        
        // Center Buttons
        {button: 8, x: 7, y: 4, w: 1.5, h: 1, name: 'Select', label: 'Select'},
        {button: 9, x: 9.5, y: 4, w: 1.5, h: 1, name: 'Start', label: 'Start'},
        
        // Analog Stick Buttons
        {button: 10, x: 5.5, y: 7, w: 1.5, h: 1.5, name: 'L3', label: 'L3'},
        {button: 11, x: 11, y: 7, w: 1.5, h: 1.5, name: 'R3', label: 'R3'}
    ];

    Window_GamepadConfig.prototype.initialize = function(rect) {
        this._data = [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.calculateButtonSize();
        this.makeItemList();
        this.refresh();
        this.select(0);
    };

    Window_GamepadConfig.prototype.calculateButtonSize = function() {
        // Calculate size based on available width
        // Gamepad uses ~18 units width (including spacing)
        const totalGamepadUnits = 18;
        const availableWidth = this.innerWidth - 40; // Leave margin
        const baseButtonSize = Math.floor(availableWidth / totalGamepadUnits);

        // Clamp between reasonable sizes
        this._buttonSize = Math.max(30, Math.min(baseButtonSize, 50));
        this._buttonPadding = Math.max(3, Math.floor(this._buttonSize / 10));
        this._buttonOffsetX = Math.floor((this.innerWidth - (totalGamepadUnits * (this._buttonSize + this._buttonPadding))) / 2);
        this._buttonOffsetY = 20;

        // Calculate where gamepad area ends for command buttons
        this._gamepadArea = this._buttonOffsetY + (9 * (this._buttonSize + this._buttonPadding));

        // Scale fonts proportionally
        this._buttonNameFontSize = Math.max(12, Math.floor(this._buttonSize * 0.45));
        this._actionFontSize = Math.max(10, Math.floor(this._buttonSize * 0.35));
    };

    Window_GamepadConfig.prototype.maxCols = function() {
        return 3;
    };

    Window_GamepadConfig.prototype.maxItems = function() {
        return this._data ? this._data.length : 0;
    };

    Window_GamepadConfig.prototype.colSpacing = function() {
        return 16;
    };

    Window_GamepadConfig.prototype.itemHeight = function() {
        return 48;
    };

    Window_GamepadConfig.prototype.overallHeight = function() {
        return this.innerHeight;
    };

    Window_GamepadConfig.prototype.scrollTo = function(x, y) {
        // Disable scrolling - keep everything visible
    };

    Window_GamepadConfig.prototype.ensureCursorVisible = function(smooth) {
        // Disable auto-scrolling to keep gamepad visible
    };

    Window_GamepadConfig.prototype.makeItemList = function() {
        this._data = [];

        // Add gamepad buttons
        for (const buttonData of Window_GamepadConfig._layout) {
            this._data.push({
                type: 'button',
                button: buttonData.button,
                name: buttonData.name,
                label: buttonData.label,
                x: buttonData.x,
                y: buttonData.y,
                w: buttonData.w,
                h: buttonData.h
            });
        }

        // Add command buttons at the bottom
        this._data.push({type: 'reset', name: 'Default Layout'});
        this._data.push({type: 'alt', name: 'Alt Layout'});
        this._data.push({type: 'finish', name: 'Finish'});
    };

    Window_GamepadConfig.prototype.refresh = function() {
        this.makeItemList();
        this.contents.clear();
        this.drawAllItems();
    };

    Window_GamepadConfig.prototype.drawAllItems = function() {
        // Draw the controller outline first
        this.drawControllerOutline();
        
        // Draw the gamepad buttons
        this.drawGamepad();

        // Draw command buttons - always visible at bottom
        const buttonsCount = Window_GamepadConfig._layout.length;
        for (let i = buttonsCount; i < this._data.length; i++) {
            const item = this._data[i];
            if (item.type !== 'button') {
                this.drawItemBackground(i);
                this.drawCommand(item, i);
            }
        }
    };

    Window_GamepadConfig.prototype.drawControllerOutline = function() {
        const buttonSize = this._buttonSize;
        const padding = this._buttonPadding;
        const offsetX = this._buttonOffsetX;
        const offsetY = this._buttonOffsetY;
        
        const unit = buttonSize + padding;
        
        // Define controller body shape
        const bodyLeft = offsetX + (0.5 * unit);
        const bodyRight = offsetX + (17 * unit);
        const bodyTop = offsetY + (3 * unit);
        const bodyBottom = offsetY + (8.5 * unit);
        const bodyWidth = bodyRight - bodyLeft;
        const bodyHeight = bodyBottom - bodyTop;
        
        const ctx = this.contents.context;
        ctx.save();
        
        // Set outline style
        ctx.strokeStyle = ColorManager.normalColor();
        ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Subtle background
        
        ctx.beginPath();
        
        // Top left curve (left grip)
        ctx.moveTo(bodyLeft + 20, bodyTop);
        ctx.lineTo(bodyLeft + 60, bodyTop);
        
        // Top section with shoulder button area
        ctx.lineTo(bodyLeft + 100, bodyTop - 15);
        ctx.lineTo(bodyRight - 100, bodyTop - 15);
        ctx.lineTo(bodyRight - 60, bodyTop);
        
        // Top right curve (right grip)
        ctx.lineTo(bodyRight - 20, bodyTop);
        ctx.quadraticCurveTo(bodyRight, bodyTop, bodyRight, bodyTop + 20);
        
        // Right side
        ctx.lineTo(bodyRight, bodyBottom - 40);
        
        // Bottom right grip
        ctx.quadraticCurveTo(bodyRight, bodyBottom - 20, bodyRight - 20, bodyBottom - 10);
        ctx.lineTo(bodyRight - 50, bodyBottom);
        ctx.quadraticCurveTo(bodyRight - 60, bodyBottom + 5, bodyRight - 70, bodyBottom);
        
        // Bottom center
        ctx.lineTo(bodyLeft + 70, bodyBottom);
        
        // Bottom left grip
        ctx.quadraticCurveTo(bodyLeft + 60, bodyBottom + 5, bodyLeft + 50, bodyBottom);
        ctx.lineTo(bodyLeft + 20, bodyBottom - 10);
        ctx.quadraticCurveTo(bodyLeft, bodyBottom - 20, bodyLeft, bodyBottom - 40);
        
        // Left side
        ctx.lineTo(bodyLeft, bodyTop + 20);
        ctx.quadraticCurveTo(bodyLeft, bodyTop, bodyLeft + 20, bodyTop);
        
        ctx.closePath();
        
        // Fill and stroke
        ctx.fill();
        ctx.stroke();
        
        // Draw center dividing line for visual interest
        ctx.beginPath();
        ctx.strokeStyle = ColorManager.normalColor();
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        const centerX = bodyLeft + (bodyWidth / 2);
        ctx.moveTo(centerX, bodyTop + 20);
        ctx.lineTo(centerX, bodyBottom - 20);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw subtle decorative circles for D-pad and face button areas
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        
        // D-pad circle (left)
        const dpadCenterX = offsetX + (3 * unit);
        const dpadCenterY = offsetY + (5.25 * unit);
        ctx.beginPath();
        ctx.arc(dpadCenterX, dpadCenterY, unit * 2, 0, Math.PI * 2);
        ctx.stroke();
        
        // Face buttons circle (right)
        const faceCenterX = offsetX + (14 * unit);
        const faceCenterY = offsetY + (5.25 * unit);
        ctx.beginPath();
        ctx.arc(faceCenterX, faceCenterY, unit * 2, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    };

    Window_GamepadConfig.prototype.drawItemBackground = function(index) {
        const buttonsCount = Window_GamepadConfig._layout.length;
        
        // Only draw background for command buttons, not gamepad buttons
        // Gamepad buttons handle their own highlighting in drawGamepad()
        if (index >= buttonsCount) {
            Window_Selectable.prototype.drawItemBackground.call(this, index);
        }
    };

    Window_GamepadConfig.prototype.drawCommand = function(item, index) {
        const buttonsCount = Window_GamepadConfig._layout.length;
        const commandIndex = index - buttonsCount;
        const buttonY = this._gamepadArea + 10;

        // Calculate x position for 3-column layout
        const colWidth = Math.floor(this.innerWidth / 3);
        const x = commandIndex * colWidth + 8;
        const width = colWidth - 16;

        this.resetTextColor();
        this.changePaintOpacity(true);

        // Draw box around button
        this.contents.strokeRect(x, buttonY, width, 36, ColorManager.normalColor());

        // Draw button text
        this.drawText(item.name, x, buttonY + 6, width, 'center');
    };

    Window_GamepadConfig.prototype.drawGamepad = function() {
        const buttonSize = this._buttonSize;
        const padding = this._buttonPadding;
        const offsetX = this._buttonOffsetX;
        const offsetY = this._buttonOffsetY;

        for (let i = 0; i < Window_GamepadConfig._layout.length; i++) {
            const item = this._data[i];
            if (!item || item.type !== 'button') continue;

            const x = Math.floor(item.x * (buttonSize + padding)) + offsetX;
            const y = Math.floor(item.y * (buttonSize + padding)) + offsetY;
            const w = Math.floor(item.w * buttonSize + (item.w - 1) * padding);
            const h = Math.floor(item.h * buttonSize + (item.h - 1) * padding);

            // Get assigned action
            const action = ConfigManager.padMapper[item.button];
            const actionName = this.getActionButtonName(action);

            // Check if button has an action assigned
            const hasAction = action !== undefined && action !== null && action !== '';

            // Explicitly clear the button area first to remove any lingering graphics
            this.contents.clearRect(x, y, w, h);

            // Draw button background
            if (this.index() === i) {
                // Selected button
                this.changePaintOpacity(false);
                this.contents.fillRect(x, y, w, h, ColorManager.textColor(PSYCHRONIC.GamepadConfig.selectedColor));
                this.changePaintOpacity(true);
            } else if (hasAction) {
                // Assigned button
                this.changePaintOpacity(false);
                this.contents.fillRect(x, y, w, h, ColorManager.textColor(PSYCHRONIC.GamepadConfig.assignedColor));
                this.changePaintOpacity(true);
            }

            // Draw button border
            this.contents.strokeRect(x, y, w, h, ColorManager.normalColor());

            // Draw button name (top)
            this.contents.fontSize = this._buttonNameFontSize;
            this.drawText(item.name, x + 2, y + 2, w - 4, 'center');

            // Draw action name (bottom)
            if (actionName) {
                this.contents.fontSize = this._actionFontSize;
                this.changeTextColor(ColorManager.textColor(PSYCHRONIC.GamepadConfig.actionColor));
                this.drawText(actionName, x + 2, y + h - (this._actionFontSize + 4), w - 4, 'center');
                this.resetTextColor();
            }

            this.contents.fontSize = $gameSystem.mainFontSize();
        }
    };

    Window_GamepadConfig.prototype.itemLineRect = function(index) {
        const rect = Window_Selectable.prototype.itemLineRect.call(this, index);
        const buttonsCount = Window_GamepadConfig._layout.length;

        if (index >= buttonsCount) {
            // Command buttons
            const commandIndex = index - buttonsCount;
            const buttonY = this._gamepadArea + 10;
            const colWidth = Math.floor(this.innerWidth / 3);

            rect.x = commandIndex * colWidth + 8;
            rect.y = buttonY;
            rect.width = colWidth - 16;
            rect.height = 36;
        }

        return rect;
    };

    Window_GamepadConfig.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        const buttonsCount = Window_GamepadConfig._layout.length;

        if (index >= buttonsCount) {
            // Command buttons
            const commandIndex = index - buttonsCount;
            const buttonY = this._gamepadArea + 10;
            const colWidth = Math.floor(this.innerWidth / 3);

            rect.x = commandIndex * colWidth + 8;
            rect.y = buttonY;
            rect.width = colWidth - 16;
            rect.height = 36;
        } else {
            // Gamepad buttons - use visual position
            const item = this._data[index];
            if (item && item.type === 'button') {
                const buttonSize = this._buttonSize;
                const padding = this._buttonPadding;
                const offsetX = this._buttonOffsetX;
                const offsetY = this._buttonOffsetY;

                rect.x = Math.floor(item.x * (buttonSize + padding)) + offsetX;
                rect.y = Math.floor(item.y * (buttonSize + padding)) + offsetY;
                rect.width = Math.floor(item.w * buttonSize + (item.w - 1) * padding);
                rect.height = Math.floor(item.h * buttonSize + (item.h - 1) * padding);
            }
        }

        return rect;
    };

    Window_GamepadConfig.prototype.getActionButtonName = function(action) {
        switch(action) {
            case 'up': return '↑';
            case 'down': return '↓';
            case 'left': return '←';
            case 'right': return '→';
            case 'ok': return PSYCHRONIC.GamepadConfig.okKey;
            case 'escape': return PSYCHRONIC.GamepadConfig.escapeKey;
            case 'menu': return PSYCHRONIC.GamepadConfig.menuKey;
            case 'shift': return PSYCHRONIC.GamepadConfig.shiftKey;
            case 'pageup': return PSYCHRONIC.GamepadConfig.pageupKey;
            case 'pagedown': return PSYCHRONIC.GamepadConfig.pagedownKey;
            default: return '';
        }
    };

    Window_GamepadConfig.prototype.currentItem = function() {
        return this._data[this.index()];
    };

    Window_GamepadConfig.prototype.isCurrentItemEnabled = function() {
        const item = this.currentItem();
        if (!item) return false;

        // All buttons and commands are enabled on PC
        return true;
    };

    Window_GamepadConfig.prototype.isOkEnabled = function() {
        return true; // Always allow OK input
    };

    Window_GamepadConfig.prototype.cursorDown = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const buttonsCount = Window_GamepadConfig._layout.length;

        if (index >= buttonsCount) {
            // In command buttons - use default behavior
            Window_Selectable.prototype.cursorDown.call(this, wrap);
        } else if (item && item.type === 'button') {
            // In gamepad - find nearest button below
            const nearestIndex = this.findNearestButtonInDirection(index, 'down');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            } else if (wrap) {
                // Wrap to command buttons
                this.select(buttonsCount);
            }
        }
    };

    Window_GamepadConfig.prototype.cursorUp = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const buttonsCount = Window_GamepadConfig._layout.length;

        if (index >= buttonsCount) {
            // In command buttons - move back to gamepad
            this.select(buttonsCount - 1);
        } else if (item && item.type === 'button') {
            // In gamepad - find nearest button above
            const nearestIndex = this.findNearestButtonInDirection(index, 'up');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            }
        }
    };

    Window_GamepadConfig.prototype.cursorRight = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const buttonsCount = Window_GamepadConfig._layout.length;

        if (index >= buttonsCount) {
            // In command buttons - use default behavior
            Window_Selectable.prototype.cursorRight.call(this, wrap);
        } else if (item && item.type === 'button') {
            // In gamepad - find nearest button to the right
            const nearestIndex = this.findNearestButtonInDirection(index, 'right');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            }
        }
    };

    Window_GamepadConfig.prototype.cursorLeft = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const buttonsCount = Window_GamepadConfig._layout.length;

        if (index >= buttonsCount) {
            // In command buttons - use default behavior
            Window_Selectable.prototype.cursorLeft.call(this, wrap);
        } else if (item && item.type === 'button') {
            // In gamepad - find nearest button to the left
            const nearestIndex = this.findNearestButtonInDirection(index, 'left');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            }
        }
    };

    Window_GamepadConfig.prototype.findNearestButtonInDirection = function(currentIndex, direction) {
        const currentItem = this._data[currentIndex];
        if (!currentItem) return -1;

        const currentX = currentItem.x + currentItem.w / 2;
        const currentY = currentItem.y + currentItem.h / 2;

        let bestIndex = -1;
        let bestDistance = 999999;

        for (let i = 0; i < Window_GamepadConfig._layout.length; i++) {
            if (i === currentIndex) continue;

            const testItem = this._data[i];
            if (!testItem || testItem.type !== 'button') continue;

            const testX = testItem.x + testItem.w / 2;
            const testY = testItem.y + testItem.h / 2;

            let isInDirection = false;
            let distance = 0;

            switch (direction) {
                case 'up':
                    isInDirection = testY < currentY - 0.3;
                    distance = Math.abs(testX - currentX) + (currentY - testY) * 0.5;
                    break;
                case 'down':
                    isInDirection = testY > currentY + 0.3;
                    distance = Math.abs(testX - currentX) + (testY - currentY) * 0.5;
                    break;
                case 'left':
                    isInDirection = testX < currentX - 0.3;
                    distance = Math.abs(testY - currentY) * 2 + (currentX - testX);
                    break;
                case 'right':
                    isInDirection = testX > currentX + 0.3;
                    distance = Math.abs(testY - currentY) * 2 + (testX - currentX);
                    break;
            }

            if (isInDirection && distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }

        return bestIndex;
    };

    Window_GamepadConfig.prototype.processCancel = function() {
        SoundManager.playCancel();
        this.updateInputData();
        this.deactivate();
        this.callHandler('cancel');
    };

    Window_GamepadConfig.prototype.processOk = function() {
        const item = this.currentItem();
        if (!item) return;

        if (item.type === 'button') {
            if (this.isCurrentItemEnabled()) {
                SoundManager.playOk();
                this.updateInputData();
                this.deactivate();
                this.callHandler('button');
            } else {
                this.playBuzzerSound();
            }
        } else if (item.type === 'reset') {
            this.updateInputData();
            this.callHandler('reset');
        } else if (item.type === 'alt') {
            this.updateInputData();
            this.callHandler('alt');
        } else if (item.type === 'finish') {
            this.updateInputData();
            this.callHandler('cancel');
        }
    };

    Window_GamepadConfig.prototype.updateHelp = function() {
        if (!this._helpWindow) return;
        const item = this.currentItem();
        if (!item) return;

        switch(item.type) {
            case 'button':
                this._helpWindow.setText(PSYCHRONIC.GamepadConfig.buttonHelp);
                break;
            case 'reset':
                this._helpWindow.setText(PSYCHRONIC.GamepadConfig.defaultHelp);
                break;
            case 'alt':
                this._helpWindow.setText(PSYCHRONIC.GamepadConfig.altHelp);
                break;
            case 'finish':
                this._helpWindow.setText(PSYCHRONIC.GamepadConfig.finishHelp);
                break;
        }
    };

    Window_GamepadConfig.prototype.onTouch = function(triggered) {
        const lastIndex = this.index();
        const x = this.canvasToLocalX(TouchInput.x);
        const y = this.canvasToLocalY(TouchInput.y);
        const hitIndex = this.hitTest(x, y);

        if (hitIndex >= 0) {
            if (hitIndex === this.index()) {
                if (triggered && this.isTouchOkEnabled()) {
                    this.processOk();
                }
            } else if (this.isCursorMovable()) {
                this.select(hitIndex);
            }
        }
        if (this.index() !== lastIndex) {
            this.playCursorSound();
        }
    };

    //=============================================================================
    // Window_GamepadAction
    //=============================================================================

    window.Window_GamepadAction = function() {
        this.initialize(...arguments);
    };

    Window_GamepadAction.prototype = Object.create(Window_Command.prototype);
    Window_GamepadAction.prototype.constructor = Window_GamepadAction;

    Window_GamepadAction.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
        this.openness = 0;
        this.deactivate();
    };

    Window_GamepadAction.prototype.makeCommandList = function() {
        this.addCommand(PSYCHRONIC.GamepadConfig.clearText, 'clear');
        this.addCommand('Move Up', 'up');
        this.addCommand('Move Down', 'down');
        this.addCommand('Move Left', 'left');
        this.addCommand('Move Right', 'right');
        this.addCommand(PSYCHRONIC.GamepadConfig.okText, 'ok');
        this.addCommand(PSYCHRONIC.GamepadConfig.escapeText, 'escape');
        this.addCommand(PSYCHRONIC.GamepadConfig.menuText, 'menu');
        this.addCommand(PSYCHRONIC.GamepadConfig.shiftText, 'shift');
        this.addCommand(PSYCHRONIC.GamepadConfig.pageupText, 'pageup');
        this.addCommand(PSYCHRONIC.GamepadConfig.pagedownText, 'pagedown');
    };

    //=============================================================================
    // Scene_GamepadConfig
    //=============================================================================

    window.Scene_GamepadConfig = function() {
        this.initialize(...arguments);
    };

    Scene_GamepadConfig.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_GamepadConfig.prototype.constructor = Scene_GamepadConfig;

    Scene_GamepadConfig.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_GamepadConfig.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createGamepadWindow();
        this.createActionWindow();
    };

    Scene_GamepadConfig.prototype.start = function() {
        Scene_MenuBase.prototype.start.call(this);
        // Add gamepad connection event listeners
        this.setupGamepadListeners();
        // Force gamepad state initialization
        Input._initializeGamepadsAtStartup();
        // Show gamepad status
        this.checkGamepadStatus();
        this._gamepadWindow.activate();
        this._gamepadWindow.select(0);
    };

    Scene_GamepadConfig.prototype.checkGamepadStatus = function() {
        if (navigator.getGamepads) {
            const gamepads = navigator.getGamepads();
            for (let i = 0; i < gamepads.length; i++) {
                if (gamepads[i]) {
                    break;
                }
            }
        }
    };

    Scene_GamepadConfig.prototype.setupGamepadListeners = function() {
        // Store bound functions so we can remove them later
        this._onGamepadConnected = this.onGamepadConnected.bind(this);
        this._onGamepadDisconnected = this.onGamepadDisconnected.bind(this);
        
        window.addEventListener("gamepadconnected", this._onGamepadConnected);
        window.addEventListener("gamepaddisconnected", this._onGamepadDisconnected);
    };

    Scene_GamepadConfig.prototype.onGamepadConnected = function(event) {
        Input._initializeGamepadsAtStartup();
        this._gamepadWindow.refresh();
    };

    Scene_GamepadConfig.prototype.onGamepadDisconnected = function(event) {
        this._gamepadWindow.refresh();
    };

    Scene_GamepadConfig.prototype.terminate = function() {
        // Remove event listeners
        if (this._onGamepadConnected) {
            window.removeEventListener("gamepadconnected", this._onGamepadConnected);
        }
        if (this._onGamepadDisconnected) {
            window.removeEventListener("gamepaddisconnected", this._onGamepadDisconnected);
        }
        Scene_MenuBase.prototype.terminate.call(this);
        ConfigManager.save();
    };

    Scene_GamepadConfig.prototype.createHelpWindow = function() {
        const rect = this.helpWindowRect();
        this._helpWindow = new Window_Help(rect);
        this.addWindow(this._helpWindow);
    };

    Scene_GamepadConfig.prototype.helpWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(2, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_GamepadConfig.prototype.createGamepadWindow = function() {
        const rect = this.gamepadWindowRect();
        this._gamepadWindow = new Window_GamepadConfig(rect);
        this._gamepadWindow.setHelpWindow(this._helpWindow);
        this._gamepadWindow.setHandler('button', this.commandButton.bind(this));
        this._gamepadWindow.setHandler('reset', this.commandDefault.bind(this));
        this._gamepadWindow.setHandler('alt', this.commandAlt.bind(this));
        this._gamepadWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._gamepadWindow);
    };

    Scene_GamepadConfig.prototype.gamepadWindowRect = function() {
        const helpHeight = this.helpWindowRect().height;
        const wx = 0;
        const wy = helpHeight;
        const ww = Graphics.boxWidth;
        const wh = Graphics.boxHeight - helpHeight;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_GamepadConfig.prototype.createActionWindow = function() {
        const rect = this.actionWindowRect();
        this._actionWindow = new Window_GamepadAction(rect);
        this._actionWindow.setHandler('clear', this.onActionSelect.bind(this, null));
        this._actionWindow.setHandler('up', this.onActionSelect.bind(this, 'up'));
        this._actionWindow.setHandler('down', this.onActionSelect.bind(this, 'down'));
        this._actionWindow.setHandler('left', this.onActionSelect.bind(this, 'left'));
        this._actionWindow.setHandler('right', this.onActionSelect.bind(this, 'right'));
        this._actionWindow.setHandler('ok', this.onActionSelect.bind(this, 'ok'));
        this._actionWindow.setHandler('escape', this.onActionSelect.bind(this, 'escape'));
        this._actionWindow.setHandler('menu', this.onActionSelect.bind(this, 'menu'));
        this._actionWindow.setHandler('shift', this.onActionSelect.bind(this, 'shift'));
        this._actionWindow.setHandler('pageup', this.onActionSelect.bind(this, 'pageup'));
        this._actionWindow.setHandler('pagedown', this.onActionSelect.bind(this, 'pagedown'));
        this._actionWindow.setHandler('cancel', this.onActionCancel.bind(this));
        this.addWindow(this._actionWindow);
    };

    Scene_GamepadConfig.prototype.actionWindowRect = function() {
        const ww = 400;
        const wh = this.calcWindowHeight(11, true);
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = (Graphics.boxHeight - wh) / 2;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_GamepadConfig.prototype.commandButton = function() {
        this._actionWindow.select(0);
        this._actionWindow.activate();
        this._actionWindow.open();
    };

    Scene_GamepadConfig.prototype.commandDefault = function() {
        ConfigManager.padMapper = JSON.parse(JSON.stringify(PSYCHRONIC.GamepadConfig.defaultMap));
        ConfigManager.applyPadConfig();
        this.refreshWindows();
        SoundManager.playOk();
    };

    Scene_GamepadConfig.prototype.commandAlt = function() {
        ConfigManager.padMapper = JSON.parse(JSON.stringify(PSYCHRONIC.GamepadConfig.altMap));
        ConfigManager.applyPadConfig();
        this.refreshWindows();
        SoundManager.playOk();
    };

    Scene_GamepadConfig.prototype.onActionSelect = function(action) {
        const item = this._gamepadWindow.currentItem();
        if (item && item.type === 'button') {
            if (action === null) {
                // Clear the button assignment by deleting it
                delete ConfigManager.padMapper[item.button];
            } else {
                // Assign the action to the button
                ConfigManager.padMapper[item.button] = action;
            }
            ConfigManager.applyPadConfig();
            SoundManager.playEquip();
            
            // Move cursor to first command button to remove highlight from button
            const buttonsCount = Window_GamepadConfig._layout.length;
            this._gamepadWindow.select(buttonsCount); // Select "Default Layout" button
        }
        this.onActionCancel();
    };

    Scene_GamepadConfig.prototype.onActionCancel = function() {
        this._actionWindow.close();
        this._actionWindow.deactivate();
        this._gamepadWindow.activate();
        this.refreshWindows();
    };

    Scene_GamepadConfig.prototype.refreshWindows = function() {
        this._gamepadWindow.refresh();
        this._gamepadWindow.activate();
    };

    Scene_GamepadConfig.prototype.terminate = function() {
        // Remove event listeners
        if (this._onGamepadConnected) {
            window.removeEventListener("gamepadconnected", this._onGamepadConnected);
        }
        if (this._onGamepadDisconnected) {
            window.removeEventListener("gamepaddisconnected", this._onGamepadDisconnected);
        }
        Scene_MenuBase.prototype.terminate.call(this);
        ConfigManager.save();
    };

    //=============================================================================
    // Scene_Options - Add command (optional standalone integration)
    //=============================================================================

    PSYCHRONIC.GamepadConfig.Scene_Options_maxCommands = Scene_Options.prototype.maxCommands;
    Scene_Options.prototype.maxCommands = function() {
        return PSYCHRONIC.GamepadConfig.Scene_Options_maxCommands.call(this) + 1;
    };

    // Note: For MegaOptions integration, users should add the option via MegaOptions parameters
    // This standalone integration is optional

})();

//=============================================================================
// End of Plugin
//=============================================================================
