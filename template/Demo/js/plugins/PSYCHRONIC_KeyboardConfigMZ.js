//=============================================================================
// PSYCHRONIC_KeyboardConfigMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.0.5] Customize keyboard controls with a visual keyboard interface
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_KeyboardConfigMZ.js
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * This plugin allows players to customize their keyboard controls from the
 * Options menu. It features a visual keyboard diagram where players can click
 * on keys to assign actions. Both Standard (Arrow Keys) and WASD layouts are
 * supported by default.
 *
 * ============================================================================
 * Features
 * ============================================================================
 *
 * - Visual keyboard diagram for easy configuration
 * - WASD and Standard keyboard layouts included
 * - Click on any key to assign an action
 * - Assign actions like OK, Cancel, Menu, Dash, etc.
 * - Prevents locking yourself out (Enter and directional keys protected)
 * - Saves configuration automatically
 * - Integrates with MegaOptions plugin
 *
 * ============================================================================
 * Integration with MegaOptions
 * ============================================================================
 *
 * To add Keyboard Config to your MegaOptions menu, create an option with:
 *
 * Name: Keyboard Config
 * Symbol: keyboardConfig
 * Default Value: false
 * Help Description: Customize your keyboard controls.
 *
 * Process OK Code:
 * SceneManager.push(Scene_KeyboardConfig);
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
 * 2. Click on a key you want to change
 * 3. Select the action you want to assign to that key
 * 4. Use "Default Layout" or "WASD Layout" to quick-switch
 * 5. Press "Finish" when done
 *
 * ============================================================================
 * Version History
 * ============================================================================
 *
 * v1.0.5 - Cursor drawing fix
 * - Fixed: Eliminated residual yellow cursor highlight on cleared keys
 * - Overrode drawItemBackground to prevent default cursor on keyboard keys
 * - Cursor now moves to command buttons after assigning/clearing actions
 * - Added explicit clearRect for each key before redrawing to prevent graphics caching
 *
 * v1.0.4 - Protected keys and highlight fixes
 * - Added Escape key to keyboard layout (top-left position)
 * - Enter and Escape are now locked/protected keys (red background)
 * - Fixed: Cleared keys no longer show yellow highlight
 * - Protected keys list: Enter, Escape, Arrow keys (Up, Down, Left, Right)
 *
 * v1.0.3 - Refinements and polish
 * - Removed F9 debug key assignment (no longer highlighted)
 * - Keyboard now scales responsively to screen width
 * - Clear option properly removes key assignments
 * - Numpad keys show actual symbols (/, *, -, +, .) instead of N prefix
 *
 * v1.0.2 - Bug fixes and improvements
 * - Added Right Shift, Print Screen, Scroll Lock, Pause/Break
 * - Added Right Alt and Right Ctrl
 * - Fixed scrolling/jumping issue when selecting keys
 * - Command buttons now properly visible and clickable
 * - Protected keys show red background with "LOCKED" text
 * - Added directional actions (Up, Down, Left, Right)
 *
 * v1.0.1 - Fixed visual keyboard layout
 * - Properly displays full keyboard diagram
 * - Fixed selection and drawing issues
 *
 * v1.0.0 - Initial Release
 * - Visual keyboard configuration
 * - WASD and Standard presets
 * - Full MZ compatibility
 *
 * @param ---General---
 * @default
 *
 * @param commandName
 * @text Command Name
 * @parent ---General---
 * @desc The name shown in the Options menu
 * @default Keyboard Config
 *
 * @param ---Help Text---
 * @default
 *
 * @param keyHelp
 * @text Key Help
 * @parent ---Help Text---
 * @desc Help text shown when hovering over a key
 * @default Select this key to change its assigned action.
 *
 * @param defaultHelp
 * @text Default Layout Help
 * @parent ---Help Text---
 * @desc Help text for the Default Layout option
 * @default Reset to the default keyboard layout (Arrow Keys).
 *
 * @param wasdHelp
 * @text WASD Layout Help
 * @parent ---Help Text---
 * @desc Help text for the WASD Layout option
 * @default Change to WASD movement layout.
 *
 * @param finishHelp
 * @text Finish Help
 * @parent ---Help Text---
 * @desc Help text for the Finish option
 * @default Save your keyboard configuration and return.
 *
 * @param ---Colors---
 * @default
 *
 * @param assignedColor
 * @text Assigned Key Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Background color for keys with actions assigned
 * @default 21
 *
 * @param selectedColor
 * @text Selected Key Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Background color for currently selected key
 * @default 17
 *
 * @param protectedColor
 * @text Protected Key Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Background color for protected (locked) keys
 * @default 2
 *
 * @param actionColor
 * @text Action Text Color
 * @parent ---Colors---
 * @type number
 * @min 0
 * @max 31
 * @desc Text color for action names on keys
 * @default 4
 *
 * @param ---Action Names---
 * @default
 *
 * @param clearText
 * @text Clear Action
 * @parent ---Action Names---
 * @desc Text for clearing a key assignment
 * @default Clear
 *
 * @param okKey
 * @text OK Key Display
 * @parent ---Action Names---
 * @desc Short text shown on the key
 * @default OK
 *
 * @param okText
 * @text OK Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default OK / Confirm / Talk
 *
 * @param escapeKey
 * @text Cancel Key Display
 * @parent ---Action Names---
 * @desc Short text shown on the key
 * @default X
 *
 * @param escapeText
 * @text Cancel Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Cancel / Menu
 *
 * @param menuKey
 * @text Menu Key Display
 * @parent ---Action Names---
 * @desc Short text shown on the key
 * @default Menu
 *
 * @param menuText
 * @text Menu Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Open Menu
 *
 * @param shiftKey
 * @text Dash Key Display
 * @parent ---Action Names---
 * @desc Short text shown on the key
 * @default Dash
 *
 * @param shiftText
 * @text Dash Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Dash / Sprint
 *
 * @param pageupKey
 * @text PageUp Key Display
 * @parent ---Action Names---
 * @desc Short text shown on the key
 * @default PgUp
 *
 * @param pageupText
 * @text PageUp Action Text
 * @parent ---Action Names---
 * @desc Full text shown in action selection
 * @default Page Up / Prev Character
 *
 * @param pagedownKey
 * @text PageDown Key Display
 * @parent ---Action Names---
 * @desc Short text shown on the key
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

    const pluginName = 'PSYCHRONIC_KeyboardConfigMZ';
    const parameters = PluginManager.parameters(pluginName);

    window.PSYCHRONIC = window.PSYCHRONIC || {};
    window.PSYCHRONIC.KeyConfig = window.PSYCHRONIC.KeyConfig || {};
    const PSYCHRONIC = window.PSYCHRONIC;

    // Parse parameters
    PSYCHRONIC.KeyConfig.commandName = String(parameters['commandName'] || 'Keyboard Config');
    PSYCHRONIC.KeyConfig.keyHelp = String(parameters['keyHelp'] || 'Select this key to change its assigned action.');
    PSYCHRONIC.KeyConfig.defaultHelp = String(parameters['defaultHelp'] || 'Reset to the default keyboard layout.');
    PSYCHRONIC.KeyConfig.wasdHelp = String(parameters['wasdHelp'] || 'Change to WASD movement layout.');
    PSYCHRONIC.KeyConfig.finishHelp = String(parameters['finishHelp'] || 'Save your keyboard configuration and return.');
    PSYCHRONIC.KeyConfig.assignedColor = Number(parameters['assignedColor'] || 21);
    PSYCHRONIC.KeyConfig.selectedColor = Number(parameters['selectedColor'] || 17);
    PSYCHRONIC.KeyConfig.protectedColor = Number(parameters['protectedColor'] || 2);
    PSYCHRONIC.KeyConfig.actionColor = Number(parameters['actionColor'] || 4);

    PSYCHRONIC.KeyConfig.clearText = String(parameters['clearText'] || 'Clear');
    PSYCHRONIC.KeyConfig.okKey = String(parameters['okKey'] || 'OK');
    PSYCHRONIC.KeyConfig.okText = String(parameters['okText'] || 'OK / Confirm / Talk');
    PSYCHRONIC.KeyConfig.escapeKey = String(parameters['escapeKey'] || 'X');
    PSYCHRONIC.KeyConfig.escapeText = String(parameters['escapeText'] || 'Cancel / Menu');
    PSYCHRONIC.KeyConfig.menuKey = String(parameters['menuKey'] || 'Menu');
    PSYCHRONIC.KeyConfig.menuText = String(parameters['menuText'] || 'Open Menu');
    PSYCHRONIC.KeyConfig.shiftKey = String(parameters['shiftKey'] || 'Dash');
    PSYCHRONIC.KeyConfig.shiftText = String(parameters['shiftText'] || 'Dash / Sprint');
    PSYCHRONIC.KeyConfig.pageupKey = String(parameters['pageupKey'] || 'PgUp');
    PSYCHRONIC.KeyConfig.pageupText = String(parameters['pageupText'] || 'Page Up / Prev Character');
    PSYCHRONIC.KeyConfig.pagedownKey = String(parameters['pagedownKey'] || 'PgDn');
    PSYCHRONIC.KeyConfig.pagedownText = String(parameters['pagedownText'] || 'Page Down / Next Character');

    //=============================================================================
    // ConfigManager
    //=============================================================================

    // Store the default and WASD keyboard mappings
    PSYCHRONIC.KeyConfig.defaultMap = {
        9: 'tab',       // Tab
        13: 'ok',       // Enter
        16: 'shift',    // Shift
        17: 'control',  // Control
        18: 'control',  // Alt
        27: 'escape',   // Escape
        32: 'ok',       // Space
        33: 'pageup',   // Page Up
        34: 'pagedown', // Page Down
        37: 'left',     // Left Arrow
        38: 'up',       // Up Arrow
        39: 'right',    // Right Arrow
        40: 'down',     // Down Arrow
        45: 'escape',   // Insert
        81: 'pageup',   // Q
        87: 'pagedown', // W
        88: 'escape',   // X
        90: 'ok',       // Z
        96: 'escape',   // Numpad 0
        98: 'down',     // Numpad 2
        100: 'left',    // Numpad 4
        102: 'right',   // Numpad 6
        104: 'up'       // Numpad 8
    };

    PSYCHRONIC.KeyConfig.wasdMap = {
        9: 'tab',       // Tab
        13: 'ok',       // Enter
        16: 'shift',    // Shift
        17: 'control',  // Control
        18: 'control',  // Alt
        27: 'escape',   // Escape
        32: 'ok',       // Space
        33: 'pageup',   // Page Up
        34: 'pagedown', // Page Down
        37: 'left',     // Left Arrow
        38: 'up',       // Up Arrow
        39: 'right',    // Right Arrow
        40: 'down',     // Down Arrow
        45: 'escape',   // Insert
        65: 'left',     // A - WASD Left
        68: 'right',    // D - WASD Right
        69: 'pagedown', // E
        81: 'pageup',   // Q
        83: 'down',     // S - WASD Down
        87: 'up',       // W - WASD Up
        88: 'escape',   // X
        90: 'ok',       // Z
        96: 'escape',   // Numpad 0
        98: 'down',     // Numpad 2
        100: 'left',    // Numpad 4
        102: 'right',   // Numpad 6
        104: 'up'       // Numpad 8
    };

    // Initialize with WASD + Standard enabled by default
    ConfigManager.keyMapper = ConfigManager.keyMapper || JSON.parse(JSON.stringify(PSYCHRONIC.KeyConfig.wasdMap));

    // Save keyMapper
    PSYCHRONIC.KeyConfig.ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = PSYCHRONIC.KeyConfig.ConfigManager_makeData.call(this);
        config.keyMapper = this.keyMapper;
        return config;
    };

    // Load keyMapper
    PSYCHRONIC.KeyConfig.ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        PSYCHRONIC.KeyConfig.ConfigManager_applyData.call(this, config);
        this.keyMapper = config.keyMapper || JSON.parse(JSON.stringify(PSYCHRONIC.KeyConfig.wasdMap));
        this.applyKeyConfig();
    };

    // Apply the key configuration
    ConfigManager.applyKeyConfig = function() {
        Input.keyMapper = JSON.parse(JSON.stringify(this.keyMapper));
    };

    //=============================================================================
    // Input
    //=============================================================================

    // Apply key config on game start
    PSYCHRONIC.KeyConfig.Input_clear = Input.clear;
    Input.clear = function() {
        PSYCHRONIC.KeyConfig.Input_clear.call(this);
        ConfigManager.applyKeyConfig();
    };

    //=============================================================================
    // Window_KeyboardConfig
    //=============================================================================

    window.Window_KeyboardConfig = function() {
        this.initialize(...arguments);
    };

    Window_KeyboardConfig.prototype = Object.create(Window_Selectable.prototype);
    Window_KeyboardConfig.prototype.constructor = Window_KeyboardConfig;

    // Keyboard layout - defines visual positions
    // Full keyboard layout with F-keys, main section, nav cluster, arrows, and numpad
    Window_KeyboardConfig._layout = [
        // Row 0 - Function Keys
        {key: 27, x: 0, y: 0, w: 1, name: 'Esc'},
        {key: 112, x: 1.5, y: 0, w: 1, name: 'F1'},
        {key: 113, x: 2.5, y: 0, w: 1, name: 'F2'},
        {key: 114, x: 3.5, y: 0, w: 1, name: 'F3'},
        {key: 115, x: 4.5, y: 0, w: 1, name: 'F4'},
        {key: 116, x: 6, y: 0, w: 1, name: 'F5'},
        {key: 117, x: 7, y: 0, w: 1, name: 'F6'},
        {key: 118, x: 8, y: 0, w: 1, name: 'F7'},
        {key: 119, x: 9, y: 0, w: 1, name: 'F8'},
        {key: 120, x: 10.5, y: 0, w: 1, name: 'F9'},
        {key: 121, x: 11.5, y: 0, w: 1, name: 'F10'},
        {key: 122, x: 12.5, y: 0, w: 1, name: 'F11'},
        {key: 123, x: 13.5, y: 0, w: 1, name: 'F12'},
        // Print Screen, Scroll Lock, Pause/Break
        {key: 44, x: 15.5, y: 0, w: 1, name: 'PrtSc'},
        {key: 145, x: 16.5, y: 0, w: 1, name: 'ScrLk'},
        {key: 19, x: 17.5, y: 0, w: 1, name: 'Pause'},

        // Row 1.5 - Number keys + Backspace
        {key: 192, x: 0, y: 1.5, w: 1, name: '`'},
        {key: 49, x: 1, y: 1.5, w: 1, name: '1'},
        {key: 50, x: 2, y: 1.5, w: 1, name: '2'},
        {key: 51, x: 3, y: 1.5, w: 1, name: '3'},
        {key: 52, x: 4, y: 1.5, w: 1, name: '4'},
        {key: 53, x: 5, y: 1.5, w: 1, name: '5'},
        {key: 54, x: 6, y: 1.5, w: 1, name: '6'},
        {key: 55, x: 7, y: 1.5, w: 1, name: '7'},
        {key: 56, x: 8, y: 1.5, w: 1, name: '8'},
        {key: 57, x: 9, y: 1.5, w: 1, name: '9'},
        {key: 48, x: 10, y: 1.5, w: 1, name: '0'},
        {key: 189, x: 11, y: 1.5, w: 1, name: '-'},
        {key: 187, x: 12, y: 1.5, w: 1, name: '='},
        {key: 8, x: 13, y: 1.5, w: 1.5, name: 'BkSp'},

        // Nav Cluster Row 1
        {key: 45, x: 15.5, y: 1.5, w: 1, name: 'Ins'},
        {key: 36, x: 16.5, y: 1.5, w: 1, name: 'Hm'},
        {key: 33, x: 17.5, y: 1.5, w: 1, name: 'PgU'},

        // Numpad Row 1
        {key: 144, x: 19, y: 1.5, w: 1, name: 'NumLk'},
        {key: 111, x: 20, y: 1.5, w: 1, name: '/'},
        {key: 106, x: 21, y: 1.5, w: 1, name: '*'},
        {key: 109, x: 22, y: 1.5, w: 1, name: '-'},

        // Row 2.5 - Tab + QWERTY + Brackets + Backslash
        {key: 9, x: 0, y: 2.5, w: 1.5, name: 'Tab'},
        {key: 81, x: 1.5, y: 2.5, w: 1, name: 'Q'},
        {key: 87, x: 2.5, y: 2.5, w: 1, name: 'W'},
        {key: 69, x: 3.5, y: 2.5, w: 1, name: 'E'},
        {key: 82, x: 4.5, y: 2.5, w: 1, name: 'R'},
        {key: 84, x: 5.5, y: 2.5, w: 1, name: 'T'},
        {key: 89, x: 6.5, y: 2.5, w: 1, name: 'Y'},
        {key: 85, x: 7.5, y: 2.5, w: 1, name: 'U'},
        {key: 73, x: 8.5, y: 2.5, w: 1, name: 'I'},
        {key: 79, x: 9.5, y: 2.5, w: 1, name: 'O'},
        {key: 80, x: 10.5, y: 2.5, w: 1, name: 'P'},
        {key: 219, x: 11.5, y: 2.5, w: 1, name: '['},
        {key: 221, x: 12.5, y: 2.5, w: 1, name: ']'},
        {key: 220, x: 13.5, y: 2.5, w: 1, name: '\\'},

        // Nav Cluster Row 2
        {key: 46, x: 15.5, y: 2.5, w: 1, name: 'Del'},
        {key: 35, x: 16.5, y: 2.5, w: 1, name: 'End'},
        {key: 34, x: 17.5, y: 2.5, w: 1, name: 'PgD'},

        // Numpad Row 2
        {key: 103, x: 19, y: 2.5, w: 1, name: '7'},
        {key: 104, x: 20, y: 2.5, w: 1, name: '8'},
        {key: 105, x: 21, y: 2.5, w: 1, name: '9'},
        {key: 107, x: 22, y: 2.5, w: 1, h: 2, name: '+'},

        // Row 3.5 - Caps + ASDF + Quote + Enter
        {key: 20, x: 0, y: 3.5, w: 1.75, name: 'Caps'},
        {key: 65, x: 1.75, y: 3.5, w: 1, name: 'A'},
        {key: 83, x: 2.75, y: 3.5, w: 1, name: 'S'},
        {key: 68, x: 3.75, y: 3.5, w: 1, name: 'D'},
        {key: 70, x: 4.75, y: 3.5, w: 1, name: 'F'},
        {key: 71, x: 5.75, y: 3.5, w: 1, name: 'G'},
        {key: 72, x: 6.75, y: 3.5, w: 1, name: 'H'},
        {key: 74, x: 7.75, y: 3.5, w: 1, name: 'J'},
        {key: 75, x: 8.75, y: 3.5, w: 1, name: 'K'},
        {key: 76, x: 9.75, y: 3.5, w: 1, name: 'L'},
        {key: 186, x: 10.75, y: 3.5, w: 1, name: ';'},
        {key: 222, x: 11.75, y: 3.5, w: 1, name: '\''},
        {key: 13, x: 12.75, y: 3.5, w: 1.75, name: 'Enter'},

        // Numpad Row 3
        {key: 100, x: 19, y: 3.5, w: 1, name: '4'},
        {key: 101, x: 20, y: 3.5, w: 1, name: '5'},
        {key: 102, x: 21, y: 3.5, w: 1, name: '6'},

        // Row 4.5 - Shift + ZXCV + Slash + Right Shift
        {key: 16, x: 0, y: 4.5, w: 2.25, name: 'LShift'},
        {key: 90, x: 2.25, y: 4.5, w: 1, name: 'Z'},
        {key: 88, x: 3.25, y: 4.5, w: 1, name: 'X'},
        {key: 67, x: 4.25, y: 4.5, w: 1, name: 'C'},
        {key: 86, x: 5.25, y: 4.5, w: 1, name: 'V'},
        {key: 66, x: 6.25, y: 4.5, w: 1, name: 'B'},
        {key: 78, x: 7.25, y: 4.5, w: 1, name: 'N'},
        {key: 77, x: 8.25, y: 4.5, w: 1, name: 'M'},
        {key: 188, x: 9.25, y: 4.5, w: 1, name: ','},
        {key: 190, x: 10.25, y: 4.5, w: 1, name: '.'},
        {key: 191, x: 11.25, y: 4.5, w: 1, name: '/'},
        {key: 227, x: 12.25, y: 4.5, w: 2.25, name: 'RShift'},

        // Arrow Up
        {key: 38, x: 16.5, y: 4.5, w: 1, name: '↑'},

        // Numpad Row 4
        {key: 97, x: 19, y: 4.5, w: 1, name: '1'},
        {key: 98, x: 20, y: 4.5, w: 1, name: '2'},
        {key: 99, x: 21, y: 4.5, w: 1, name: '3'},
        {key: 13, x: 22, y: 4.5, w: 1, h: 2, name: 'Enter'},

        // Row 5.5 - Ctrl + Win + Alt + Space + RAlt + Fn + RCtrl
        {key: 17, x: 0, y: 5.5, w: 1.25, name: 'LCtrl'},
        {key: 91, x: 1.25, y: 5.5, w: 1.25, name: 'Win'},
        {key: 18, x: 2.5, y: 5.5, w: 1.25, name: 'LAlt'},
        {key: 32, x: 3.75, y: 5.5, w: 6.25, name: 'Space'},
        {key: 225, x: 10, y: 5.5, w: 1.25, name: 'RAlt'},
        {key: 93, x: 11.25, y: 5.5, w: 1.25, name: 'Menu'},
        {key: 226, x: 12.5, y: 5.5, w: 1.25, name: 'RCtrl'},

        // Arrow keys
        {key: 37, x: 15.5, y: 5.5, w: 1, name: '←'},
        {key: 40, x: 16.5, y: 5.5, w: 1, name: '↓'},
        {key: 39, x: 17.5, y: 5.5, w: 1, name: '→'},

        // Numpad Row 5
        {key: 96, x: 19, y: 5.5, w: 2, name: '0'},
        {key: 110, x: 21, y: 5.5, w: 1, name: '.'}
    ];

    Window_KeyboardConfig.prototype.initialize = function(rect) {
        this._keyboardArea = 340; // Height reserved for keyboard (increased for full layout)
Window_Selectable.prototype.initialize.call(this, rect);
this._data = [];
this.calculateKeyboardScale();
this.refresh();
this.select(0);
this.activate();
    };

    Window_KeyboardConfig.prototype.calculateKeyboardScale = function() {
        // Calculate responsive key size based on screen width
        // Keyboard spans from x=0 (Esc) to x=23 (numpad edge)
        const totalKeyboardUnits = 24; // Increased to account for full width
        const availableWidth = this.innerWidth - 20; // Leave some margin
        const baseKeySize = Math.floor(availableWidth / totalKeyboardUnits);

        // Clamp between reasonable sizes
        this._keySize = Math.max(24, Math.min(baseKeySize, 40));
        this._keyPadding = Math.max(2, Math.floor(this._keySize / 12));
        this._keyOffsetX = Math.floor((this.innerWidth - (totalKeyboardUnits * (this._keySize + this._keyPadding))) / 2);
        this._keyOffsetY = 10;

        // Scale fonts proportionally
        this._keyNameFontSize = Math.max(10, Math.floor(this._keySize * 0.4));
        this._actionFontSize = Math.max(8, Math.floor(this._keySize * 0.3));
    };

    Window_KeyboardConfig.prototype.maxCols = function() {
        return 3;
    };

    Window_KeyboardConfig.prototype.maxItems = function() {
        return this._data ? this._data.length : 0;
    };

    Window_KeyboardConfig.prototype.colSpacing = function() {
        return 16;
    };

    Window_KeyboardConfig.prototype.itemHeight = function() {
        return 48;
    };

    Window_KeyboardConfig.prototype.overallHeight = function() {
        return this.innerHeight;
    };

    Window_KeyboardConfig.prototype.scrollTo = function(x, y) {
        // Disable scrolling - keep everything visible
    };

    Window_KeyboardConfig.prototype.ensureCursorVisible = function(smooth) {
        // Disable auto-scrolling to keep keyboard visible
    };

    Window_KeyboardConfig.prototype.makeItemList = function() {
        this._data = [];

        // Add keyboard keys
        for (const keyData of Window_KeyboardConfig._layout) {
            this._data.push({
                type: 'key',
                key: keyData.key,
                name: keyData.name,
                x: keyData.x,
                y: keyData.y,
                w: keyData.w,
                h: keyData.h || 1
            });
        }

        // Add command buttons at the bottom
        this._data.push({type: 'reset', name: 'Reset to Default'});
        this._data.push({type: 'wasd', name: 'WASD Layout'});
        this._data.push({type: 'finish', name: 'Finish'});
    };

    Window_KeyboardConfig.prototype.refresh = function() {
        this.makeItemList();
        this.contents.clear();
        this.drawAllItems();
    };

    Window_KeyboardConfig.prototype.drawAllItems = function() {
        // Draw the keyboard
        this.drawKeyboard();

        // Draw command buttons - always visible at bottom
        const keysCount = Window_KeyboardConfig._layout.length;
        for (let i = keysCount; i < this._data.length; i++) {
            const item = this._data[i];
            if (item.type !== 'key') {
                this.drawItemBackground(i);
                this.drawCommand(item, i);
            }
        }
    };

    Window_KeyboardConfig.prototype.drawItemBackground = function(index) {
        const keysCount = Window_KeyboardConfig._layout.length;

        // Only draw background for command buttons, not keyboard keys
        // Keyboard keys handle their own highlighting in drawKeyboard()
        if (index >= keysCount) {
            Window_Selectable.prototype.drawItemBackground.call(this, index);
        }
    };

    Window_KeyboardConfig.prototype.drawCommand = function(item, index) {
        const keysCount = Window_KeyboardConfig._layout.length;
        const commandIndex = index - keysCount;
        const buttonY = this._keyboardArea + 10;

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

    Window_KeyboardConfig.prototype.drawKeyboard = function() {
        const keySize = this._keySize;
        const padding = this._keyPadding;
        const offsetX = this._keyOffsetX;
        const offsetY = this._keyOffsetY;

        for (let i = 0; i < Window_KeyboardConfig._layout.length; i++) {
            const item = this._data[i];
            if (!item || item.type !== 'key') continue;

            const x = Math.floor(item.x * (keySize + padding)) + offsetX;
            const y = Math.floor(item.y * (keySize + padding)) + offsetY;
            const w = Math.floor(item.w * keySize + (item.w - 1) * padding);
            const h = Math.floor(item.h * keySize + (item.h - 1) * padding);

            // Get assigned action
            const action = ConfigManager.keyMapper[item.key];
            const actionName = this.getActionKeyName(action);

            // Check if key is protected
            const protectedKeys = [13, 27, 37, 38, 39, 40]; // Enter, Escape, Arrows
            const isProtected = protectedKeys.includes(item.key);

            // Check if key has an action assigned (not undefined, null, or empty)
            const hasAction = action !== undefined && action !== null && action !== '';

            // Explicitly clear the key area first to remove any lingering graphics
            this.contents.clearRect(x, y, w, h);

            // Draw key background
            if (isProtected) {
                // Protected keys get red background
                this.changePaintOpacity(false);
                this.contents.fillRect(x, y, w, h, ColorManager.textColor(PSYCHRONIC.KeyConfig.protectedColor));
                this.changePaintOpacity(true);
            } else if (this.index() === i) {
                // Selected key
                this.changePaintOpacity(false);
                this.contents.fillRect(x, y, w, h, ColorManager.textColor(PSYCHRONIC.KeyConfig.selectedColor));
                this.changePaintOpacity(true);
            } else if (hasAction) {
                // Assigned key
                this.changePaintOpacity(false);
                this.contents.fillRect(x, y, w, h, ColorManager.textColor(PSYCHRONIC.KeyConfig.assignedColor));
                this.changePaintOpacity(true);
            }

            // Draw key border
            this.contents.strokeRect(x, y, w, h, ColorManager.normalColor());

            // Draw key name (top)
            this.contents.fontSize = this._keyNameFontSize;
            this.drawText(item.name, x + 2, y + 2, w - 4, 'center');

            // Draw action name (bottom) or "LOCKED" for protected keys
            if (isProtected) {
                this.contents.fontSize = this._actionFontSize;
                this.changeTextColor(ColorManager.textColor(10)); // Red text
                this.drawText('LOCKED', x + 2, y + h - (this._actionFontSize + 4), w - 4, 'center');
                this.resetTextColor();
            } else if (actionName) {
                this.contents.fontSize = this._actionFontSize;
                this.changeTextColor(ColorManager.textColor(PSYCHRONIC.KeyConfig.actionColor));
                this.drawText(actionName, x + 2, y + h - (this._actionFontSize + 4), w - 4, 'center');
                this.resetTextColor();
            }

            this.contents.fontSize = $gameSystem.mainFontSize();
        }
    };

    Window_KeyboardConfig.prototype.itemLineRect = function(index) {
        const rect = Window_Selectable.prototype.itemLineRect.call(this, index);
        const keysCount = Window_KeyboardConfig._layout.length;

        if (index >= keysCount) {
            // Command buttons
            const commandIndex = index - keysCount;
            const buttonY = this._keyboardArea + 10;
            const colWidth = Math.floor(this.innerWidth / 3);

            rect.x = commandIndex * colWidth + 8;
            rect.y = buttonY;
            rect.width = colWidth - 16;
            rect.height = 36;
        }

        return rect;
    };

    Window_KeyboardConfig.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        const keysCount = Window_KeyboardConfig._layout.length;

        if (index >= keysCount) {
            // Command buttons
            const commandIndex = index - keysCount;
            const buttonY = this._keyboardArea + 10;
            const colWidth = Math.floor(this.innerWidth / 3);

            rect.x = commandIndex * colWidth + 8;
            rect.y = buttonY;
            rect.width = colWidth - 16;
            rect.height = 36;
        } else {
            // Keyboard keys - use visual position
            const item = this._data[index];
            if (item && item.type === 'key') {
                const keySize = this._keySize;
                const padding = this._keyPadding;
                const offsetX = this._keyOffsetX;
                const offsetY = this._keyOffsetY;

                rect.x = Math.floor(item.x * (keySize + padding)) + offsetX;
                rect.y = Math.floor(item.y * (keySize + padding)) + offsetY;
                rect.width = Math.floor(item.w * keySize + (item.w - 1) * padding);
                rect.height = Math.floor(item.h * keySize + (item.h - 1) * padding);
            }
        }

        return rect;
    };

    Window_KeyboardConfig.prototype.getActionKeyName = function(action) {
        switch(action) {
            case 'up': return '↑';
            case 'down': return '↓';
            case 'left': return '←';
            case 'right': return '→';
            case 'ok': return PSYCHRONIC.KeyConfig.okKey;
            case 'escape': return PSYCHRONIC.KeyConfig.escapeKey;
            case 'menu': return PSYCHRONIC.KeyConfig.menuKey;
            case 'shift': return PSYCHRONIC.KeyConfig.shiftKey;
            case 'pageup': return PSYCHRONIC.KeyConfig.pageupKey;
            case 'pagedown': return PSYCHRONIC.KeyConfig.pagedownKey;
            default: return '';
        }
    };

    Window_KeyboardConfig.prototype.currentItem = function() {
        return this._data[this.index()];
    };

    Window_KeyboardConfig.prototype.isCurrentItemEnabled = function() {
        const item = this.currentItem();
        if (!item) return false;

        // Command buttons are always enabled
        if (item.type !== 'key') return true;

        // Can't change Enter, Escape, or arrow keys
        const protectedKeys = [13, 27, 37, 38, 39, 40]; // Enter, Escape, Arrows
        return !protectedKeys.includes(item.key);
    };

    Window_KeyboardConfig.prototype.isOkEnabled = function() {
        return true; // Always allow OK input
    };

    Window_KeyboardConfig.prototype.cursorDown = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const keysCount = Window_KeyboardConfig._layout.length;

        if (index >= keysCount) {
            // In command buttons - use default behavior
            Window_Selectable.prototype.cursorDown.call(this, wrap);
        } else if (item && item.type === 'key') {
            // In keyboard - find nearest key below
            const nearestIndex = this.findNearestKeyInDirection(index, 'down');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            } else if (wrap) {
                // Wrap to command buttons
                this.select(keysCount);
            }
        }
    };

    Window_KeyboardConfig.prototype.cursorUp = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const keysCount = Window_KeyboardConfig._layout.length;

        if (index >= keysCount) {
            // In command buttons - move back to keyboard
            this.select(keysCount - 1);
        } else if (item && item.type === 'key') {
            // In keyboard - find nearest key above
            const nearestIndex = this.findNearestKeyInDirection(index, 'up');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            }
        }
    };

    Window_KeyboardConfig.prototype.cursorRight = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const keysCount = Window_KeyboardConfig._layout.length;

        if (index >= keysCount) {
            // In command buttons - use default behavior
            Window_Selectable.prototype.cursorRight.call(this, wrap);
        } else if (item && item.type === 'key') {
            // In keyboard - find nearest key to the right
            const nearestIndex = this.findNearestKeyInDirection(index, 'right');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            }
        }
    };

    Window_KeyboardConfig.prototype.cursorLeft = function(wrap) {
        const index = this.index();
        const item = this._data[index];
        const keysCount = Window_KeyboardConfig._layout.length;

        if (index >= keysCount) {
            // In command buttons - use default behavior
            Window_Selectable.prototype.cursorLeft.call(this, wrap);
        } else if (item && item.type === 'key') {
            // In keyboard - find nearest key to the left
            const nearestIndex = this.findNearestKeyInDirection(index, 'left');
            if (nearestIndex >= 0) {
                this.select(nearestIndex);
            }
        }
    };

    Window_KeyboardConfig.prototype.findNearestKeyInDirection = function(currentIndex, direction) {
        const currentItem = this._data[currentIndex];
        if (!currentItem) return -1;

        const currentX = currentItem.x + currentItem.w / 2; // Center X of current key
        const currentY = currentItem.y + currentItem.h / 2; // Center Y of current key

        let bestIndex = -1;
        let bestDistance = 999999;

        for (let i = 0; i < Window_KeyboardConfig._layout.length; i++) {
            if (i === currentIndex) continue;

            const testItem = this._data[i];
            if (!testItem || testItem.type !== 'key') continue;

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

    Window_KeyboardConfig.prototype.processOk = function() {
        const item = this.currentItem();
        if (!item) return;

        if (item.type === 'key') {
            if (this.isCurrentItemEnabled()) {
                SoundManager.playOk();
                this.updateInputData();
                this.deactivate();
                this.callHandler('key');
            } else {
                this.playBuzzerSound();
            }
        } else if (item.type === 'reset') {
            this.updateInputData();
            this.callHandler('reset');
        } else if (item.type === 'wasd') {
            this.updateInputData();
            this.callHandler('wasd');
        } else if (item.type === 'finish') {
            this.updateInputData();
            this.callHandler('cancel');
        }
    };

    Window_KeyboardConfig.prototype.updateHelp = function() {
        if (!this._helpWindow) return;
        const item = this.currentItem();
        if (!item) return;

        switch(item.type) {
            case 'key':
                if (this.isCurrentItemEnabled()) {
                    this._helpWindow.setText(PSYCHRONIC.KeyConfig.keyHelp);
                } else {
                    this._helpWindow.setText('This key is protected and cannot be changed.');
                }
                break;
            case 'reset':
                this._helpWindow.setText(PSYCHRONIC.KeyConfig.defaultHelp);
                break;
            case 'wasd':
                this._helpWindow.setText(PSYCHRONIC.KeyConfig.wasdHelp);
                break;
            case 'finish':
                this._helpWindow.setText(PSYCHRONIC.KeyConfig.finishHelp);
                break;
        }
    };

    Window_KeyboardConfig.prototype.onTouch = function(triggered) {
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
    // Window_KeyAction
    //=============================================================================

    window.Window_KeyAction = function() {
        this.initialize(...arguments);
    };

    Window_KeyAction.prototype = Object.create(Window_Command.prototype);
    Window_KeyAction.prototype.constructor = Window_KeyAction;

    Window_KeyAction.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
        this.openness = 0;
        this.deactivate();
    };

    Window_KeyAction.prototype.makeCommandList = function() {
        this.addCommand(PSYCHRONIC.KeyConfig.clearText, 'clear');
        this.addCommand('Move Up', 'up');
        this.addCommand('Move Down', 'down');
        this.addCommand('Move Left', 'left');
        this.addCommand('Move Right', 'right');
        this.addCommand(PSYCHRONIC.KeyConfig.okText, 'ok');
        this.addCommand(PSYCHRONIC.KeyConfig.escapeText, 'escape');
        this.addCommand(PSYCHRONIC.KeyConfig.menuText, 'menu');
        this.addCommand(PSYCHRONIC.KeyConfig.shiftText, 'shift');
        this.addCommand(PSYCHRONIC.KeyConfig.pageupText, 'pageup');
        this.addCommand(PSYCHRONIC.KeyConfig.pagedownText, 'pagedown');
    };

    //=============================================================================
    // Scene_KeyboardConfig
    //=============================================================================

    window.Scene_KeyboardConfig = function() {
        this.initialize(...arguments);
    };

    Scene_KeyboardConfig.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_KeyboardConfig.prototype.constructor = Scene_KeyboardConfig;

    Scene_KeyboardConfig.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_KeyboardConfig.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createKeyboardWindow();
        this.createActionWindow();
    };

    Scene_KeyboardConfig.prototype.createHelpWindow = function() {
        const rect = this.helpWindowRect();
        this._helpWindow = new Window_Help(rect);
        this.addWindow(this._helpWindow);
    };

    Scene_KeyboardConfig.prototype.helpWindowRect = function() {
        const wx = 0;
        const wy = 0;
        const ww = Graphics.boxWidth;
        const wh = this.calcWindowHeight(2, false);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_KeyboardConfig.prototype.createKeyboardWindow = function() {
        const rect = this.keyboardWindowRect();
        this._keyboardWindow = new Window_KeyboardConfig(rect);
        this._keyboardWindow.setHelpWindow(this._helpWindow);
        this._keyboardWindow.setHandler('key', this.commandKey.bind(this));
        this._keyboardWindow.setHandler('reset', this.commandDefault.bind(this));
        this._keyboardWindow.setHandler('wasd', this.commandWASD.bind(this));
        this._keyboardWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._keyboardWindow);
    };

    Scene_KeyboardConfig.prototype.keyboardWindowRect = function() {
        const helpHeight = this.helpWindowRect().height;
        const wx = 0;
        const wy = helpHeight;
        const ww = Graphics.boxWidth;
        const wh = Graphics.boxHeight - helpHeight;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_KeyboardConfig.prototype.createActionWindow = function() {
        const rect = this.actionWindowRect();
        this._actionWindow = new Window_KeyAction(rect);
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

    Scene_KeyboardConfig.prototype.actionWindowRect = function() {
        const ww = 400;
        const wh = this.calcWindowHeight(11, true); // Increased from 7 to 11 for more actions
        const wx = (Graphics.boxWidth - ww) / 2;
        const wy = (Graphics.boxHeight - wh) / 2;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_KeyboardConfig.prototype.commandKey = function() {
        this._actionWindow.select(0);
        this._actionWindow.activate();
        this._actionWindow.open();
    };

    Scene_KeyboardConfig.prototype.commandDefault = function() {
        ConfigManager.keyMapper = JSON.parse(JSON.stringify(PSYCHRONIC.KeyConfig.defaultMap));
        ConfigManager.applyKeyConfig();
        this.refreshWindows();
        SoundManager.playOk();
    };

    Scene_KeyboardConfig.prototype.commandWASD = function() {
        ConfigManager.keyMapper = JSON.parse(JSON.stringify(PSYCHRONIC.KeyConfig.wasdMap));
        ConfigManager.applyKeyConfig();
        this.refreshWindows();
        SoundManager.playOk();
    };

    Scene_KeyboardConfig.prototype.onActionSelect = function(action) {
        const item = this._keyboardWindow.currentItem();
        if (item && item.type === 'key') {
            if (action === null) {
                // Clear the key assignment by deleting it
                delete ConfigManager.keyMapper[item.key];
            } else {
                // Assign the action to the key
                ConfigManager.keyMapper[item.key] = action;
            }
            ConfigManager.applyKeyConfig();
            SoundManager.playEquip();

            // Move cursor to first command button to remove highlight from key
            const keysCount = Window_KeyboardConfig._layout.length;
            this._keyboardWindow.select(keysCount); // Select "Reset to Default" button
        }
        this.onActionCancel();
    };

    Scene_KeyboardConfig.prototype.onActionCancel = function() {
        this._actionWindow.close();
        this._actionWindow.deactivate();
        this._keyboardWindow.activate();
        this.refreshWindows();
    };

    Scene_KeyboardConfig.prototype.refreshWindows = function() {
        this._keyboardWindow.refresh();
        this._keyboardWindow.activate();
    };

    Scene_KeyboardConfig.prototype.terminate = function() {
        Scene_MenuBase.prototype.terminate.call(this);
        ConfigManager.save();
    };

    //=============================================================================
    // Scene_Options - Add command (optional standalone integration)
    //=============================================================================

    PSYCHRONIC.KeyConfig.Scene_Options_maxCommands = Scene_Options.prototype.maxCommands;
    Scene_Options.prototype.maxCommands = function() {
        return PSYCHRONIC.KeyConfig.Scene_Options_maxCommands.call(this) + 1;
    };

    // Note: For MegaOptions integration, users should add the option via MegaOptions parameters
    // This standalone integration is optional

})();

//=============================================================================
// End of Plugin
//=============================================================================
