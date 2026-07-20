//=============================================================================
// PSYCHRONIC_MenuManagerMZ.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc [v1.5.0] Menu Manager MZ - Independent Positioning with Animated Character Sprites
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_MenuManagerMZ.js
 * @version 1.5.0
 *
 * @param menuSettings
 * @text Main Menu Settings
 * @desc Configure the main menu appearance and behavior
 * @type struct<MainMenuConfig>
 * @default {"windowWidth":"400","windowHeight":"624","windowX":"0","windowY":"0","statusWindowWidth":"0","statusWindowHeight":"0","statusWindowX":"-999","statusWindowY":"-999","goldWindowWidth":"0","goldWindowHeight":"0","goldWindowX":"-999","goldWindowY":"-999","goldWindowIconIndex":"314","goldWindowIconPosition":"left","goldWindowShowCurrency":"true","goldWindowCurrencyFormat":"amount_currency","independentPositioning":"true","backgroundType":"0","backgroundImage":"","opacity":"255"}
 *
 * @param commandSettings
 * @text Command Window Settings
 * @desc Configure the command window in the main menu
 * @type struct<CommandConfig>
 * @default {"showItems":"true","showSkills":"true","showEquip":"true","showStatus":"true","showOptions":"true","showSave":"true","showGameEnd":"true","customCommands":"[]"}
 *
 * @param statusSettings
 * @text Status Window Settings
 * @desc Configure the status display in menus
 * @type struct<StatusConfig>
 * @default {"displayMode":"vertical","showFace":"true","showName":"true","showClass":"true","showLevel":"true","showExp":"true","showParams":"true","useCharacterSprites":"false","spriteAnimationSpeed":"4","spriteDirectionCycleSpeed":"2","spriteScale":"1.0","maxSpriteSize":"144","faceSize":"144"}
 *
 * @param uiSettings
 * @text UI Customization
 * @desc General UI customization settings
 * @type struct<UIConfig>
 * @default {"fontSize":"28","fontFace":"GameFont","customFontFile":"","customFontName":"CustomFont","textColor":"0","highlightColor":"17","disabledColor":"7"}
 *
 * @param animationSettings
 * @text Animation Settings
 * @desc Configure menu animations and transitions
 * @type struct<AnimationConfig>
 * @default {"enableAnimations":"true","slideSpeed":"12","fadeSpeed":"8","bounceEffect":"false"}
 *
 * @param infoWindowSettings
 * @text Information Window Settings
 * @desc Configure the contextual information window
 * @type struct<InfoWindowConfig>
 * @default {"enabled":"false","windowWidth":"300","windowHeight":"200","windowX":"0","windowY":"432","showMinimap":"false","defaultText":"Menu Information"}
 *
 * @param controlPanelSettings
 * @text Control Panel Settings
 * @desc Configure the dynamic control panel
 * @type struct<ControlPanelConfig>
 * @default {"enabled":"true","panelWidth":"300","panelHeight":"400","panelX":"1000","panelY":"432","variableDisplays":"[]"}
 *
 */

/*~struct~MainMenuConfig:
 * @param windowWidth
 * @text Command Window Width
 * @desc Width of the command menu window
 * @type number
 * @min 100
 * @max 1000
 * @default 400
 *
 * @param windowHeight
 * @text Command Window Height
 * @desc Height of the command menu window
 * @type number
 * @min 100
 * @max 800
 * @default 624
 *
 * @param windowX
 * @text Command Window X Position
 * @desc X position of the command menu window
 * @type number
 * @min -1000
 * @max 1000
 * @default 0
 *
 * @param windowY
 * @text Command Window Y Position
 * @desc Y position of the command menu window
 * @type number
 * @min -1000
 * @max 1000
 * @default 0
 *
 * @param statusWindowWidth
 * @text Status Window Width
 * @desc Width of the status window (0 = auto-calculate)
 * @type number
 * @min 0
 * @max 1200
 * @default 0
 *
 * @param statusWindowHeight
 * @text Status Window Height
 * @desc Height of the status window (0 = auto-calculate)
 * @type number
 * @min 0
 * @max 800
 * @default 0
 *
 * @param statusWindowX
 * @text Status Window X Position
 * @desc X position of the status window (-999 = right side of screen)
 * @type number
 * @min -999
 * @max 1000
 * @default -999
 *
 * @param statusWindowY
 * @text Status Window Y Position
 * @desc Y position of the status window (-999 = center of screen)
 * @type number
 * @min -999
 * @max 1000
 * @default -999
 *
 * @param goldWindowWidth
 * @text Gold Window Width
 * @desc Width of the gold window (0 = auto-calculate)
 * @type number
 * @min 0
 * @max 600
 * @default 0
 *
 * @param goldWindowHeight
 * @text Gold Window Height
 * @desc Height of the gold window (0 = auto-calculate)
 * @type number
 * @min 0
 * @max 200
 * @default 0
 *
 * @param goldWindowX
 * @text Gold Window X Position
 * @desc X position of the gold window (-999 = bottom right corner)
 * @type number
 * @min -999
 * @max 1000
 * @default -999
 *
 * @param goldWindowY
 * @text Gold Window Y Position
 * @desc Y position of the gold window (-999 = bottom right corner)
 * @type number
 * @min -999
 * @max 1000
 * @default -999
 *
 * @param goldWindowIconIndex
 * @text Gold Window Icon
 * @desc Icon to display next to gold amount (0 = no icon)
 * @type number
 * @min 0
 * @max 999
 * @default 314
 *
 * @param goldWindowIconPosition
 * @text Gold Icon Position
 * @desc Position of the icon relative to the gold text
 * @type select
 * @option Left of Text
 * @value left
 * @option Right of Text
 * @value right
 * @default left
 *
 * @param goldWindowShowCurrency
 * @text Show Currency Name
 * @desc Display the currency name (like "Gold") with the amount
 * @type boolean
 * @default true
 *
 * @param goldWindowCurrencyFormat
 * @text Currency Display Format
 * @desc How to display the currency name and amount
 * @type select
 * @option Amount Currency (1000 Gold)
 * @value amount_currency
 * @option Currency: Amount (Gold: 1000)
 * @value currency_amount
 * @option Amount Only (1000)
 * @value amount_only
 * @default amount_currency
 *
 * @param independentPositioning
 * @text Independent Window Positioning
 * @desc Allow command, status, and gold windows to be positioned completely independently
 * @type boolean
 * @default true
 *
 * @param backgroundType
 * @text Background Type
 * @desc Type of background for the menu
 * @type select
 * @option Window
 * @value 0
 * @option Dim
 * @value 1
 * @option Transparent
 * @value 2
 * @option Custom Image
 * @value 3
 * @default 0
 *
 * @param backgroundImage
 * @text Background Image
 * @desc Custom background image file (if using Custom Image type)
 * @type file
 * @dir img/pictures/
 * @default
 *
 * @param opacity
 * @text Window Opacity
 * @desc Opacity of the menu window (0-255)
 * @type number
 * @min 0
 * @max 255
 * @default 255
 */

/*~struct~CommandConfig:
 * @param showItems
 * @text Show Items
 * @desc Show the Items command in the menu
 * @type boolean
 * @default true
 *
 * @param showSkills
 * @text Show Skills
 * @desc Show the Skills command in the menu
 * @type boolean
 * @default true
 *
 * @param showEquip
 * @text Show Equip
 * @desc Show the Equip command in the menu
 * @type boolean
 * @default true
 *
 * @param showStatus
 * @text Show Status
 * @desc Show the Status command in the menu
 * @type boolean
 * @default true
 *
 * @param showFormation
 * @text Show Formation
 * @desc Show the Formation command in the menu
 * @type boolean
 * @default true
 *
 * @param showOptions
 * @text Show Options
 * @desc Show the Options command in the menu
 * @type boolean
 * @default true
 *
 * @param showSave
 * @text Show Save
 * @desc Show the Save command in the menu
 * @type boolean
 * @default true
 *
 * @param showGameEnd
 * @text Show Game End
 * @desc Show the Game End command in the menu
 * @type boolean
 * @default true
 *
 * @param customCommands
 * @text Custom Commands
 * @desc Add custom commands to the menu
 * @type struct<CustomCommand>[]
 * @default []
 */

/*~struct~CustomCommand:
 * @param name
 * @text Command Name
 * @desc Display name of the custom command
 * @type string
 * @default Custom Command
 *
 * @param symbol
 * @text Command Symbol
 * @desc Unique symbol for the command
 * @type string
 * @default customCommand
 *
 * @param enabled
 * @text Enabled
 * @desc Whether the command is enabled by default
 * @type boolean
 * @default true
 *
 * @param script
 * @text Script Call
 * @desc Script to execute when command is selected
 * @type multiline_string
 * @default
 *
 * @param icon
 * @text Icon Index
 * @desc Icon to display next to the command (0 = no icon)
 * @type number
 * @min 0
 * @default 0
 */

/*~struct~StatusConfig:
 * @param displayMode
 * @text Character Display Mode
 * @desc How to display character information
 * @type select
 * @option Vertical List
 * @value vertical
 * @option Horizontal List
 * @value horizontal
 * @default vertical
 *
 * @param showFace
 * @text Show Face
 * @desc Show character faces in status displays
 * @type boolean
 * @default true
 *
 * @param useCharacterSprites
 * @text Use Character Sprites Instead of Faces
 * @desc Use animated character sprites instead of static faces
 * @type boolean
 * @default false
 *
 * @param spriteAnimationSpeed
 * @text Sprite Animation Speed
 * @desc Speed of sprite animation (higher = faster, 1-10)
 * @type number
 * @min 1
 * @max 50
 * @default 4
 *
 * @param spriteDirectionCycleSpeed
 * @text Direction Cycle Speed
 * @desc Speed of direction changes (higher = faster, 1-10)
 * @type number
 * @min 1
 * @max 10
 * @default 2
 *
 * @param spriteScale
 * @text Character Sprite Scale
 * @desc Scale multiplier for character sprites (1.0 = original size, 0.5 = half size, 2.0 = double size)
 * @type number
 * @min 0.25
 * @max 4.0
 * @decimals 2
 * @default 1.0
 *
 * @param maxSpriteSize
 * @text Maximum Sprite Display Size
 * @desc Maximum pixel size for scaled sprites (prevents oversized sprites)
 * @type number
 * @min 32
 * @max 288
 * @default 144
 *
 * @param showName
 * @text Show Name
 * @desc Show character names
 * @type boolean
 * @default true
 *
 * @param showClass
 * @text Show Class
 * @desc Show character classes
 * @type boolean
 * @default true
 *
 * @param showLevel
 * @text Show Level
 * @desc Show character levels
 * @type boolean
 * @default true
 *
 * @param showTp
 * @text Show TP
 * @desc Show character TP gauge
 * @type boolean
 * @default false
 *
 * @param showExp
 * @text Show Experience
 * @desc Show experience points and next level
 * @type boolean
 * @default true
 *
 * @param showParams
 * @text Show Parameters
 * @desc Show character parameters (ATK, DEF, etc.)
 * @type boolean
 * @default true
 *
 * @param faceSize
 * @text Face Size
 * @desc Size of character faces in pixels
 * @type number
 * @min 48
 * @max 288
 * @default 144
 */

/*~struct~InfoWindowConfig:
 * @param enabled
 * @text Enable Information Window
 * @desc Show a window with contextual information based on selection
 * @type boolean
 * @default false
 *
 * @param windowWidth
 * @text Window Width
 * @desc Width of the information window
 * @type number
 * @min 100
 * @max 800
 * @default 300
 *
 * @param windowHeight
 * @text Window Height
 * @desc Height of the information window
 * @type number
 * @min 100
 * @max 600
 * @default 200
 *
 * @param windowX
 * @text Window X Position
 * @desc X position of the information window
 * @type number
 * @min 0
 * @max 1000
 * @default 0
 *
 * @param windowY
 * @text Window Y Position
 * @desc Y position of the information window
 * @type number
 * @min 0
 * @max 1000
 * @default 432
 *
 * @param showMinimap
 * @text Show Minimap (Default View)
 * @desc Show a minimap when nothing is selected (requires additional setup)
 * @type boolean
 * @default false
 *
 * @param defaultText
 * @text Default Text
 * @desc Text to show when nothing is selected and minimap is disabled
 * @type string
 * @default Menu Information
 */

/*~struct~ControlPanelConfig:
 * @param enabled
 * @text Enable Control Panel
 * @desc Show the dynamic control panel
 * @type boolean
 * @default true
 *
 * @param panelWidth
 * @text Panel Width
 * @desc Width of the control panel in pixels
 * @type number
 * @min 100
 * @max 1000
 * @default 240
 *
 * @param panelHeight
 * @text Panel Height
 * @desc Height of the control panel in pixels
 * @type number
 * @min 100
 * @max 1000
 * @default 320
 *
 * @param panelX
 * @text Panel X Position
 * @desc X position of control panel on screen
 * @type number
 * @min -2000
 * @max 2000
 * @default 1025
 *
 * @param panelY
 * @text Panel Y Position
 * @desc Y position of control panel on screen
 * @type number
 * @min -2000
 * @max 2000
 * @default 305
 *
 * @param variableDisplays
 * @text Variable HUD Display
 * @desc Variables to display when no menu option is selected
 * @type struct<VariableDisplay>[]
 * @default []
 */

/*~struct~VariableDisplay:
 * @param variableId
 * @text Variable ID
 * @desc ID of the game variable to display
 * @type variable
 * @default 1
 *
 * @param label
 * @text Display Label
 * @desc Label text to show for this variable
 * @type string
 * @default Variable
 *
 * @param icon
 * @text Icon Index
 * @desc Icon to display next to the variable (0 = no icon)
 * @type number
 * @min 0
 * @default 0
 */

/*~struct~GaugeColors:
 * @param fullColor
 * @text Full Color
 * @desc Color when gauge is full (CSS color: #RRGGBB or rgb(r,g,b))
 * @type string
 * @default #20c040
 *
 * @param midColor
 * @text Middle Color
 * @desc Color when gauge is half full (CSS color: #RRGGBB or rgb(r,g,b))
 * @type string
 * @default #e0c010
 *
 * @param emptyColor
 * @text Empty/Low Color
 * @desc Color when gauge is nearly empty (CSS color: #RRGGBB or rgb(r,g,b))
 * @type string
 * @default #f08080
 */

/*~struct~UIConfig:
 * @param fontSize
 * @text Font Size
 * @desc Font size for menu text
 * @type number
 * @min 12
 * @max 48
 * @default 28
 *
 * @param fontFace
 * @text Font Face
 * @desc Font family for menu text
 * @type combo
 * @option GameFont
 * @option Arial
 * @option Helvetica
 * @option Times New Roman
 * @option Courier New
 * @option Verdana
 * @option Georgia
 * @option Custom Font
 * @default GameFont
 *
 * @param customFontFile
 * @text Custom Font File
 * @desc Custom font file in fonts folder (e.g., MyFont.woff2)
 * @type string
 * @default
 *
 * @param customFontName
 * @text Custom Font Name
 * @desc Display name for the custom font
 * @type string
 * @default CustomFont
 *
 * @param textColor
 * @text Text Color
 * @desc Default text color (system color index)
 * @type number
 * @min 0
 * @max 31
 * @default 0
 *
 * @param highlightColor
 * @text Highlight Color
 * @desc Color for highlighted items (system color index)
 * @type number
 * @min 0
 * @max 31
 * @default 17
 *
 * @param disabledColor
 * @text Disabled Color
 * @desc Color for disabled items (system color index)
 * @type number
 * @min 0
 * @max 31
 * @default 7
 *
 * @param hpGaugeColors
 * @text HP Gauge Colors
 * @desc Colors for HP gauge at different fill levels
 * @type struct<GaugeColors>
 * @default {"fullColor":"#20c040","midColor":"#e0c010","emptyColor":"#f08080"}
 *
 * @param mpGaugeColors
 * @text MP Gauge Colors
 * @desc Colors for MP gauge at different fill levels
 * @type struct<GaugeColors>
 * @default {"fullColor":"#4080c0","midColor":"#4080c0","emptyColor":"#4080c0"}
 *
 * @param tpGaugeColors
 * @text TP Gauge Colors
 * @desc Colors for TP gauge at different fill levels
 * @type struct<GaugeColors>
 * @default {"fullColor":"#e08040","midColor":"#f0c040","emptyColor":"#f0c040"}
 */

/*~struct~AnimationConfig:
 * @param enableAnimations
 * @text Enable Animations
 * @desc Enable menu animations and transitions
 * @type boolean
 * @default true
 *
 * @param slideSpeed
 * @text Slide Speed
 * @desc Speed of sliding animations (higher = faster)
 * @type number
 * @min 1
 * @max 30
 * @default 12
 *
 * @param fadeSpeed
 * @text Fade Speed
 * @desc Speed of fade animations (higher = faster)
 * @type number
 * @min 1
 * @max 30
 * @default 8
 *
 * @param bounceEffect
 * @text Bounce Effect
 * @desc Add a bounce effect to menu transitions
 * @type boolean
 * @default false
 */

(() => {
    'use strict';

    // Plugin Name
    const pluginName = 'PSYCHRONIC_MenuManagerMZ';

    // Get plugin parameters
    const parameters = PluginManager.parameters(pluginName);
    const menuSettings = JSON.parse(parameters['menuSettings'] || '{}');
    const commandSettings = JSON.parse(parameters['commandSettings'] || '{}');
    const statusSettings = JSON.parse(parameters['statusSettings'] || '{}');
    const uiSettings = JSON.parse(parameters['uiSettings'] || '{}');
    const animationSettings = JSON.parse(parameters['animationSettings'] || '{}');
    const infoWindowSettings = JSON.parse(parameters['infoWindowSettings'] || '{}');

    // Parse custom commands
    const customCommands = JSON.parse(commandSettings.customCommands || '[]').map(cmd => JSON.parse(cmd));

    //=============================================================================
    // Menu Manager Core Class
    //=============================================================================

    class MenuManager {
        static initialize() {
            try {
                this.loadSettings();
                this.availableFonts = {}; // Initialize font registry
                this.loadCustomFonts();
                this.registerSystemFonts();
                this.setupEventListeners();
                this.setupSpriteAnimation();

// [silenced]                 console.log('MenuManager initialized with fonts:', this.availableFonts);
            } catch (e) {
                console.warn('MenuManager initialization failed:', e);
                // Ensure we have at least basic configs
                this.uiConfig = this.uiConfig || { fontSize: 28, fontFace: 'GameFont', customFontName: 'MyCustomFont' };
                this.menuConfig = this.menuConfig || { windowWidth: 400, windowHeight: 624, windowX: 0, windowY: 0 };
                this.statusConfig = this.statusConfig || { displayMode: 'vertical' };
                this.availableFonts = { 'GameFont': 'GameFont' };
            }
        }

        static loadSettings() {
            // Process and validate all settings
            this.menuConfig = {
                windowWidth: parseInt(menuSettings.windowWidth) || 400,
 windowHeight: parseInt(menuSettings.windowHeight) || 624,
 windowX: parseInt(menuSettings.windowX) || 0,
 windowY: parseInt(menuSettings.windowY) || 0,
 statusWindowWidth: parseInt(menuSettings.statusWindowWidth) || 0,
 statusWindowHeight: parseInt(menuSettings.statusWindowHeight) || 0,
 statusWindowX: parseInt(menuSettings.statusWindowX) || -999,
 statusWindowY: parseInt(menuSettings.statusWindowY) || -999,
 goldWindowWidth: parseInt(menuSettings.goldWindowWidth) || 0,
 goldWindowHeight: parseInt(menuSettings.goldWindowHeight) || 0,
 goldWindowX: parseInt(menuSettings.goldWindowX) || -999,
 goldWindowY: parseInt(menuSettings.goldWindowY) || -999,
 goldWindowIconIndex: parseInt(menuSettings.goldWindowIconIndex) || 0,
 goldWindowIconPosition: menuSettings.goldWindowIconPosition || 'left',
 goldWindowShowCurrency: menuSettings.goldWindowShowCurrency !== 'false', // Default to true
 goldWindowCurrencyFormat: menuSettings.goldWindowCurrencyFormat || 'amount_currency',
 independentPositioning: menuSettings.independentPositioning === 'true',
 backgroundType: parseInt(menuSettings.backgroundType) || 0,
 backgroundImage: menuSettings.backgroundImage || '',
 opacity: parseInt(menuSettings.opacity) || 255
            };

            this.commandConfig = {
                showItems: commandSettings.showItems === 'true',
                showSkills: commandSettings.showSkills === 'true',
                showEquip: commandSettings.showEquip === 'true',
                showStatus: commandSettings.showStatus === 'true',
                showFormation: commandSettings.showFormation === 'true',
                showOptions: commandSettings.showOptions === 'true',
                showSave: commandSettings.showSave === 'true',
                showGameEnd: commandSettings.showGameEnd === 'true',
                customCommands: customCommands
            };

            this.statusConfig = {
                displayMode: statusSettings.displayMode || 'vertical',
                showFace: statusSettings.showFace === 'true',
                showName: statusSettings.showName === 'true',
                showClass: statusSettings.showClass === 'true',
                showLevel: statusSettings.showLevel === 'true',
                showTp: statusSettings.showTp === 'true',
                showExp: statusSettings.showExp === 'true',
                showParams: statusSettings.showParams === 'true',
                useCharacterSprites: statusSettings.useCharacterSprites === 'true',
                spriteAnimationSpeed: parseInt(statusSettings.spriteAnimationSpeed) || 4,
 spriteDirectionCycleSpeed: parseInt(statusSettings.spriteDirectionCycleSpeed) || 2,
 spriteScale: parseFloat(statusSettings.spriteScale) || 1.0,
 maxSpriteSize: parseInt(statusSettings.maxSpriteSize) || 144,
 faceSize: parseInt(statusSettings.faceSize) || 144
            };

            this.infoWindowConfig = {
                enabled: infoWindowSettings.enabled === 'true',
                windowWidth: parseInt(infoWindowSettings.windowWidth) || 300,
 windowHeight: parseInt(infoWindowSettings.windowHeight) || 200,
 windowX: parseInt(infoWindowSettings.windowX) || 0,
 windowY: parseInt(infoWindowSettings.windowY) || 432,
 showMinimap: infoWindowSettings.showMinimap === 'true',
 defaultText: infoWindowSettings.defaultText || 'Menu Information'
            };

            this.uiConfig = {
                fontSize: parseInt(uiSettings.fontSize) || 28,
 fontFace: uiSettings.fontFace || 'GameFont',
 customFontFile: uiSettings.customFontFile || '',
 customFontName: uiSettings.customFontName || 'CustomFont',
 textColor: parseInt(uiSettings.textColor) || 0,
 highlightColor: parseInt(uiSettings.highlightColor) || 17,
 disabledColor: parseInt(uiSettings.disabledColor) || 7,
 gaugeChamferSize: parseInt(uiSettings.gaugeChamferSize) !== undefined ? parseInt(uiSettings.gaugeChamferSize) : 12,
 hpGaugeColors: uiSettings.hpGaugeColors ? JSON.parse(uiSettings.hpGaugeColors) : {fullColor:"#20c040",midColor:"#e0c010",emptyColor:"#f08080"},
 mpGaugeColors: uiSettings.mpGaugeColors ? JSON.parse(uiSettings.mpGaugeColors) : {fullColor:"#4080c0",midColor:"#4080c0",emptyColor:"#4080c0"},
 tpGaugeColors: uiSettings.tpGaugeColors ? JSON.parse(uiSettings.tpGaugeColors) : {fullColor:"#e08040",midColor:"#f0c040",emptyColor:"#f0c040"}
            };

            // Process font face selection
            if (this.uiConfig.fontFace === 'Custom Font' && this.uiConfig.customFontFile) {
                this.uiConfig.effectiveFontFace = this.uiConfig.customFontName;
            } else {
                this.uiConfig.effectiveFontFace = this.uiConfig.fontFace;
            }

            this.animationConfig = {
                enableAnimations: animationSettings.enableAnimations === 'true',
                slideSpeed: parseInt(animationSettings.slideSpeed) || 12,
 fadeSpeed: parseInt(animationSettings.fadeSpeed) || 8,
 bounceEffect: animationSettings.bounceEffect === 'true'
            };
            const controlPanelSettings = JSON.parse(parameters['controlPanelSettings'] || '{}');
            this.controlPanelConfig = {
                enabled: controlPanelSettings.enabled !== 'false',
                panelWidth: parseInt(controlPanelSettings.panelWidth) || 300,
 panelHeight: parseInt(controlPanelSettings.panelHeight) || 400,
 panelX: parseInt(controlPanelSettings.panelX) || 1000,
 panelY: parseInt(controlPanelSettings.panelY) || 432,
 variableDisplays: JSON.parse(controlPanelSettings.variableDisplays || '[]').map(v => {
     try {
         return JSON.parse(v);
     } catch(e) {
         return { variableId: 1, label: 'Variable', icon: 0 };
     }
 })
            };
        }

        static getGaugeColors(rate, colorConfig) {
            // Interpolate between full/mid/empty colors based on rate
            let color1, color2;

            if (rate >= 0.5) {
                // Interpolate between mid and full (50% to 100%)
                const t = (rate - 0.5) * 2; // 0 to 1
                color1 = this.interpolateColor(colorConfig.midColor, colorConfig.fullColor, t);
                color2 = this.interpolateColor(colorConfig.midColor, colorConfig.fullColor, Math.min(t + 0.2, 1));
            } else {
                // Interpolate between empty and mid (0% to 50%)
                const t = rate * 2; // 0 to 1
                color1 = this.interpolateColor(colorConfig.emptyColor, colorConfig.midColor, t);
                color2 = this.interpolateColor(colorConfig.emptyColor, colorConfig.midColor, Math.min(t + 0.2, 1));
            }

            return { color1, color2 };
        }

        static interpolateColor(color1, color2, t) {
            // Parse hex colors
            const parseColor = (color) => {
                const hex = color.replace('#', '');
                return {
                    r: parseInt(hex.substr(0, 2), 16),
 g: parseInt(hex.substr(2, 2), 16),
 b: parseInt(hex.substr(4, 2), 16)
                };
            };

            const c1 = parseColor(color1);
            const c2 = parseColor(color2);

            const r = Math.round(c1.r + (c2.r - c1.r) * t);
            const g = Math.round(c1.g + (c2.g - c1.g) * t);
            const b = Math.round(c1.b + (c2.b - c1.b) * t);

            return `rgb(${r}, ${g}, ${b})`;
        }

        static setupSpriteAnimation() {
// [silenced]             console.log('=== Setting up sprite animation ===');

            this.spriteAnimationData = {
                currentDirection: 0,
                walkFrame: 0,
                directions: [2, 4, 6, 8],
                animationTimer: null,
                directionTimer: null,
                isPaused: false
            };

            if (this.statusConfig && this.statusConfig.useCharacterSprites) {
                console.log('Starting sprite animation with intervals');
                this.startSpriteAnimationLoop();
            }
        }

        static startSpriteAnimationLoop() {
            if (this.animationLoopRunning) {
                return;
            }

            console.log('Starting interval-based animation');
            this.animationLoopRunning = true;
            this.spriteAnimationData.isPaused = false;

            // Calculate intervals (higher speed = shorter interval)
            const frameInterval = Math.max(150, 500 - (this.statusConfig.spriteAnimationSpeed * 40));
            const directionInterval = frameInterval * (11 - this.statusConfig.spriteDirectionCycleSpeed) * 2;

            // Walking animation timer (updates frames: 0, 1, 2)
            this.spriteAnimationData.animationTimer = setInterval(() => {
                if (this.spriteAnimationData.isPaused) return;

                this.spriteAnimationData.walkFrame = (this.spriteAnimationData.walkFrame + 1) % 3;
                this.refreshStatusWindowSprites();
            }, frameInterval);

            // Direction cycling timer (changes direction: down, left, up, right)
            this.spriteAnimationData.directionTimer = setInterval(() => {
                if (this.spriteAnimationData.isPaused) return;

                this.spriteAnimationData.currentDirection = (this.spriteAnimationData.currentDirection + 1) % 4;
                this.refreshStatusWindowSprites();
            }, directionInterval);
        }

        static stopSpriteAnimationLoop() {
            console.log('Stopping animation loop');
            this.animationLoopRunning = false;

            if (this.spriteAnimationData.animationTimer) {
                clearInterval(this.spriteAnimationData.animationTimer);
                this.spriteAnimationData.animationTimer = null;
            }

            if (this.spriteAnimationData.directionTimer) {
                clearInterval(this.spriteAnimationData.directionTimer);
                this.spriteAnimationData.directionTimer = null;
            }
        }

        static pauseSpriteAnimation() {
            if (this.spriteAnimationData) {
                this.spriteAnimationData.isPaused = true;
            }
        }

        static resumeSpriteAnimation() {
            if (this.spriteAnimationData) {
                this.spriteAnimationData.isPaused = false;
            }
        }

        static refreshStatusWindowSprites() {
            try {
                if (SceneManager._scene instanceof Scene_Menu &&
                    this.statusConfig.displayMode === 'horizontal' &&
                    !this.spriteAnimationData.isPaused) {

                    // Refresh actor windows if they exist
                    if (SceneManager._scene._actorWindows) {
                        for (const actorWindow of SceneManager._scene._actorWindows) {
                            actorWindow.refresh();
                        }
                    } else if (SceneManager._scene._statusWindow) {
                        SceneManager._scene._statusWindow.refresh();
                    }
                    }
            } catch (error) {
                console.warn('Error refreshing status window:', error);
            }
        }
        static getSpriteAnimationFrame(actorIndex = 0) {
            if (!this.spriteAnimationData) {
                console.warn('Sprite animation data not initialized');
                return { direction: 2, walkFrame: 0 }; // Default: facing down, frame 0
            }

            // Optional: Add slight offset per actor to make them not perfectly synchronized
            const offset = actorIndex * 0.3;
            const adjustedFrame = Math.floor(this.spriteAnimationData.walkFrame + offset) % 3;

            const result = {
                direction: this.spriteAnimationData.directions[this.spriteAnimationData.currentDirection],
                walkFrame: adjustedFrame
            };

            console.log(`Animation frame for actor ${actorIndex}:`, result);
            return result;
        }

        static loadCustomFonts() {
            // Register custom fonts that can be used
            this.availableFonts = {
                'GameFont': 'GameFont', // Default RPG Maker font
                'Arial': 'Arial',
                'Helvetica': 'Helvetica',
                'Times New Roman': 'Times New Roman',
                'Courier New': 'Courier New',
                'Verdana': 'Verdana',
                'Georgia': 'Georgia'
            };

            // Load custom font files if specified
            if (this.uiConfig.customFontFile) {
                this.loadFontFile(this.uiConfig.customFontFile, this.uiConfig.customFontName || 'CustomFont');
            }
        }

        static loadFontFile(filename, fontName) {
            try {
                // Create font face for web fonts
                const fontFace = new FontFace(fontName, `url(fonts/${filename})`);

                fontFace.load().then((loadedFace) => {
                    document.fonts.add(loadedFace);
                    this.availableFonts[fontName] = fontName;
// [silenced]                     console.log(`Custom font ${fontName} loaded successfully`);
                }).catch((error) => {
                    console.warn(`Failed to load custom font ${fontName}:`, error);
                });
            } catch (error) {
                console.warn(`Error setting up custom font ${fontName}:`, error);
            }
        }

        static isFontAvailable(fontName) {
            // Test if a font is actually available in the system
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // Test with a known font
            context.font = '12px monospace';
            const baselineWidth = context.measureText('test').width;

            // Test with the requested font
            context.font = `12px ${fontName}, monospace`;
            const testWidth = context.measureText('test').width;

            return baselineWidth !== testWidth;
        }

        static registerSystemFonts() {
            // Register commonly available system fonts
            const systemFonts = [
                'Arial', 'Helvetica', 'Times New Roman', 'Courier New',
 'Verdana', 'Georgia', 'Comic Sans MS', 'Impact',
 'Trebuchet MS', 'Palatino', 'Garamond'
            ];

            systemFonts.forEach(font => {
                if (this.isFontAvailable(font)) {
                    this.availableFonts[font] = font;
                }
            });
        }

        static setupEventListeners() {
            // Setup any global event listeners needed
            this.setupCustomCommands();
        }

        static setupCustomCommands() {
            // Register custom command handlers
            this.commandConfig.customCommands.forEach(command => {
                if (command.symbol && command.script) {
                    // Store command for later use
                    this.customCommandMap = this.customCommandMap || {};
                    this.customCommandMap[command.symbol] = command;
                }
            });
        }

        static executeCustomCommand(symbol) {
            const command = this.customCommandMap && this.customCommandMap[symbol];
            if (command && command.script) {
                try {
                    eval(command.script);
                } catch (e) {
                    console.error(`Error executing custom command ${symbol}:`, e);
                }
            }
        }

        static getMenuRect() {
            return new Rectangle(
                this.menuConfig.windowX,
                this.menuConfig.windowY,
                this.menuConfig.windowWidth,
                this.menuConfig.windowHeight
            );
        }

        static getStatusRect() {
            if (!this.menuConfig.independentPositioning) {
                return null;
            }

            let width = this.menuConfig.statusWindowWidth;
            let height = this.menuConfig.statusWindowHeight;

            if (width === 0) {
                width = Math.floor(Graphics.boxWidth * 0.6);
                width = Math.max(300, Math.min(width, 800));
            }

            if (height === 0) {
                // Calculate height based on actual content
                height = this.calculateActorWindowContentHeight();
            }

            let x = this.menuConfig.statusWindowX;
            let y = this.menuConfig.statusWindowY;

            if (x === -999) {
                x = Graphics.boxWidth - width - 20;
            }

            if (y === -999) {
                y = Math.floor((Graphics.boxHeight - height) / 2);
            }

            return new Rectangle(x, y, width, height);
        }

        static calculateActorWindowContentHeight() {
            const config = this.statusConfig;
            let totalHeight = 0;

            // Top padding
            totalHeight += 16;

            // Sprite or face height
            if (config.useCharacterSprites) {
                totalHeight += (config.maxSpriteSize || 144) + 6;
            } else if (config.showFace) {
                const faceSize = Math.min(config.faceSize || 144, 100);
                totalHeight += faceSize + 6;
            }

            // Line height for text (approximate)
            const lineHeight = 36;

            // Name
            if (config.showName) totalHeight += lineHeight;

            // Class
            if (config.showClass) totalHeight += lineHeight;

            // Level
            if (config.showLevel) totalHeight += lineHeight;

            // HP bar
            totalHeight += Math.floor(lineHeight * 0.8);

            // MP bar
            totalHeight += Math.floor(lineHeight * 0.8);

            // Params
            if (config.showParams) totalHeight += lineHeight;

            // Bottom padding
            totalHeight += 10;

            // Add window frame padding
            totalHeight += 10; // Standard window frame

            return totalHeight;
        }

        static getGoldRect() {
            if (!this.menuConfig.independentPositioning) {
                return null;
            }

            let width = this.menuConfig.goldWindowWidth;
            if (width === 0) {
                width = 240;
            }

            let height = this.menuConfig.goldWindowHeight;
            if (height === 0) {
                height = this.calcWindowHeight(1, true);
                if (typeof height !== 'number' || height <= 0) {
                    height = 72;
                }
            }

            let x = this.menuConfig.goldWindowX;
            let y = this.menuConfig.goldWindowY;

            // Only calculate if -999 (meaning "auto-position from edge")
            if (x === -999) {
                x = Graphics.boxWidth - width - 8;
            }
            if (y === -999) {
                y = Graphics.boxHeight - height - 8;
            }

            console.log('Gold Window Rect - X:', x, 'Y:', y, 'W:', width, 'H:', height);

            return new Rectangle(x, y, width, height);
        }

        static getGoldIconSettings() {
            return {
                iconIndex: this.menuConfig.goldWindowIconIndex || 0,
 position: this.menuConfig.goldWindowIconPosition || 'left',
 showCurrency: this.menuConfig.goldWindowShowCurrency !== false, // Default to true
 currencyFormat: this.menuConfig.goldWindowCurrencyFormat || 'amount_currency'
            };
        }

        static getControlPanelRect() {
            if (!this.controlPanelConfig || !this.controlPanelConfig.enabled) {
                return null;
            }

            const config = this.controlPanelConfig;

            return new Rectangle(
                config.panelX,
                config.panelY,
                config.panelWidth,
                config.panelHeight
            );
        }

        static calcWindowHeight(numLines, hasFrame = true) {
            // Calculate window height based on number of lines
            const lineHeight = 36; // Standard line height in RPG Maker MZ
            const padding = hasFrame ? 18 : 0; // Frame padding
            return (numLines * lineHeight) + (padding * 2);
        }

        static isIndependentPositioning() {
            return this.menuConfig && this.menuConfig.independentPositioning;
        }

        static debugPositioning() {
            console.log('=== Menu Manager Debug Info ===');
            console.log('Independent Positioning:', this.isIndependentPositioning());
            console.log('Command Window Rect:', this.getMenuRect());
            console.log('Status Window Rect:', this.getStatusRect());
            console.log('Gold Window Rect:', this.getGoldRect());
            console.log('Menu Config:', this.menuConfig);
            console.log('==============================');
        }

        static getStatusDisplayMode() {
            return this.statusConfig ? this.statusConfig.displayMode : 'vertical';
        }

        static getOptimalCharacterWidth(windowWidth, memberCount) {
            if (this.getStatusDisplayMode() === 'horizontal') {
                const minWidth = 90; // Further reduced minimum
                const maxWidth = windowWidth; // Allow characters to use full width if needed
                const availableWidth = windowWidth - 4; // Only 2px margin on each side
                const calculatedWidth = Math.floor(availableWidth / memberCount);
                return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
            }
            return windowWidth;
        }

        static isHorizontalDisplayMode() {
            return this.getStatusDisplayMode() === 'horizontal';
        }

        static getEffectiveFontFace() {
            if (!this.uiConfig) {
                return 'GameFont';
            }

            const requestedFont = this.uiConfig.effectiveFontFace || this.uiConfig.fontFace || 'GameFont';

            // Debug logging
            console.log(`Requested font: ${requestedFont}`);
            console.log(`Available fonts:`, this.availableFonts);

            // Check if the requested font is available
            if (this.availableFonts && this.availableFonts[requestedFont]) {
                console.log(`Using font: ${requestedFont}`);
                return this.availableFonts[requestedFont];
            }

            // Fallback logic
            console.warn(`Font ${requestedFont} not available, falling back to GameFont`);
            return 'GameFont';
        }
    }

    //=============================================================================
    // Scene_Menu Overrides
    //=============================================================================

    const _Scene_Menu_create = Scene_Menu.prototype.create;
    Scene_Menu.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createCommandWindow();
        this.createGoldWindow();

        // Create individual actor windows instead of one status window
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            this.createIndividualActorWindows();
        } else {
            this.createStatusWindow();
        }

        // Create info window if enabled
        if (MenuManager.infoWindowConfig && MenuManager.infoWindowConfig.enabled) {
            this.createInfoWindow();
        }

        // CREATE CONTROL PANEL
        if (MenuManager.controlPanelConfig && MenuManager.controlPanelConfig.enabled) {
            this.createContextControlPanel();
        }

        this.applyMenuManagerSettings();
        this.removeWindowMargins();
    };

    Scene_Menu.prototype.createContextControlPanel = function() {
        const rect = MenuManager.getControlPanelRect();
        if (!rect) return;

        this._contextControlPanel = new Window_ContextControlPanel(rect);
        this._contextControlPanel.setHandler('ok', this.onControlPanelOk.bind(this));
        this._contextControlPanel.setHandler('cancel', this.onControlPanelCancel.bind(this));

        // Start in default mode (variable HUD)
        this._contextControlPanel.setMode('default');

        this.addWindow(this._contextControlPanel);

        console.log('Control panel created at:', rect.x, rect.y, rect.width, rect.height);
    };

    Scene_Menu.prototype.onControlPanelOk = function() {
        const item = this._contextControlPanel.item();
        if (!item) return;

        switch(item.symbol) {
            case 'equip':
                this.commandEquip();
                break;
            case 'optimize':
                this.optimizeEquipment();
                break;
            case 'remove':
                this.removeEquipment();
                break;
            case 'use':
                // Handle use item/skill
                break;
            case 'discard':
                // Handle discard
                break;
        }
    };

    Scene_Menu.prototype.onControlPanelCancel = function() {
        // Variable HUD is display-only, no cancel action
    };

    Scene_Menu.prototype.optimizeEquipment = function() {
        SoundManager.playEquip();
        const actor = $gameParty.members()[this._selectedActorIndex];
        actor.optimizeEquipments();

        // Refresh displays
        if (this._actorWindows) {
            this._actorWindows[this._selectedActorIndex].refresh();
        }
        if (this._infoWindow) {
            this._infoWindow.refresh();
        }

        this._contextControlPanel.activate();
    };

    Scene_Menu.prototype.removeEquipment = function() {
        SoundManager.playEquip();
        const actor = $gameParty.members()[this._selectedActorIndex];
        actor.changeEquip(this._currentEquipSlot, null);

        // Refresh displays
        if (this._actorWindows) {
            this._actorWindows[this._selectedActorIndex].refresh();
        }
        if (this._infoWindow) {
            this._infoWindow.refresh();
        }

        this._contextControlPanel.refresh();
        this._contextControlPanel.activate();
    };

    Scene_Menu.prototype.createIndividualActorWindows = function() {
        const members = $gameParty.allMembers();
        const statusRect = this.statusWindowRect();

        const boxSpacing = 8;
        const maxColumns = 7; // Always calculate width based on 7 columns
        const totalSpacing = boxSpacing * (maxColumns - 1);
        const availableWidth = statusRect.width - totalSpacing;
        const boxWidth = Math.floor(availableWidth / maxColumns);

        this._actorWindows = [];
        this._selectedActorIndex = 0;

        for (let i = 0; i < members.length; i++) {
            const x = statusRect.x + (i * (boxWidth + boxSpacing));
            const rect = new Rectangle(x, statusRect.y, boxWidth, statusRect.height);
            const actorWindow = new Window_MenuActor(rect, members[i]);
            this._actorWindows.push(actorWindow);
            this.addWindow(actorWindow);
        }

        // Set up command handlers for personal commands
        this._commandWindow.setHandler("skill", this.commandPersonal.bind(this));
        this._commandWindow.setHandler("equip", this.commandPersonal.bind(this));
        this._commandWindow.setHandler("status", this.commandPersonal.bind(this));
        this._commandWindow.setHandler("formation", this.commandFormation.bind(this));
    };

    const _Scene_Menu_start = Scene_Menu.prototype.start;
    Scene_Menu.prototype.start = function() {
        if (MenuManager.statusConfig.displayMode === 'horizontal' && this._actorWindows) {
            Scene_MenuBase.prototype.start.call(this);

            for (const actorWindow of this._actorWindows) {
                actorWindow.setSelected(false);
                actorWindow.refresh();
            }
        } else {
            _Scene_Menu_start.call(this);
        }

        // Debug gold window
        if (this._goldWindow) {
            console.log('=== GOLD WINDOW STATE ===');
            console.log('Position:', this._goldWindow.x, this._goldWindow.y);
            console.log('Size:', this._goldWindow.width, this._goldWindow.height);
            console.log('Visible:', this._goldWindow.visible);
            console.log('Opacity:', this._goldWindow.opacity);
            console.log('Openness:', this._goldWindow.openness);
            console.log('========================');
        }
    };

    Scene_Menu.prototype.onActorOk = function() {
        // Handle actor selection
        SceneManager.push(Scene_Skill);
    };

    Scene_Menu.prototype.onActorCancel = function() {
        this._commandWindow.activate();
    };

    Scene_Menu.prototype.commandPersonal = function() {
        if (this._actorWindows && this._actorWindows.length > 0) {
            // Deactivate command window
            this._commandWindow.deactivate();

            // Now select the first actor
            this._selectedActorIndex = 0;
            this._actorWindows[0].setSelected(true);

            // Make actor windows interactive
            this._actorSelectionMode = true;
            this._actorWindows[0].activate();
        }
    };

    Scene_Menu.prototype.createGoldWindow = function() {
        const rect = this.goldWindowRect();

        if (MenuManager.isIndependentPositioning()) {
            // Use custom gold window with independent positioning
            this._goldWindow = new Window_CustomGold(rect);
            console.log('Created custom gold window at:', rect.x, rect.y, rect.width, rect.height);
        } else {
            // Use default gold window
            this._goldWindow = new Window_Gold(rect);
        }

        this.addWindow(this._goldWindow);
    };

    Scene_Menu.prototype.createInfoWindow = function() {
        const rect = this.infoWindowRect();
        this._infoWindow = new Window_MenuInfo(rect);
        this.addWindow(this._infoWindow);
    };

    Scene_Menu.prototype.infoWindowRect = function() {
        const config = MenuManager.infoWindowConfig;
        return new Rectangle(config.windowX, config.windowY, config.windowWidth, config.windowHeight);
    };

    const _Scene_Menu_update = Scene_Menu.prototype.update;
    Scene_Menu.prototype.update = function() {
        _Scene_Menu_update.call(this);

        if (this._actorWindows && this._actorSelectionMode) {
            this.updateActorSelection();
        }

        // Update info window based on current state
        if (this._infoWindow) {
            this.updateInfoWindow();
        }

        // UPDATE CONTROL PANEL - ADD THIS
        if (this._contextControlPanel) {
            this.updateControlPanel();
        }
    };

    Scene_Menu.prototype.updateInfoWindow = function() {
        if (this._actorSelectionMode && this._actorWindows) {
            const actor = $gameParty.members()[this._selectedActorIndex];
            const symbol = this._commandWindow.currentSymbol();

            if (symbol === 'equip') {
                this._infoWindow.setMode('actorEquip', actor);
            } else {
                this._infoWindow.setMode('actor', actor);
            }
        } else {
            this._infoWindow.setMode('default', null);
        }
    };

    Scene_Menu.prototype.updateControlPanel = function() {
        if (!this._contextControlPanel) return;

        // Always stay in default (variable HUD) mode
        this._contextControlPanel.setMode('default');
    };

    Scene_Menu.prototype.updateActorSelection = function() {
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.onPersonalCancel();
        } else if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            this.onPersonalOk();
        } else if (Input.isTriggered('left')) {
            this.selectPreviousActor();
        } else if (Input.isTriggered('right')) {
            this.selectNextActor();
        }
    };

    Scene_Menu.prototype.updateActorWindowSelection = function() {
        if (!this._commandWindow.active) return;

        if (Input.isTriggered('left')) {
            this.selectPreviousActor();
        } else if (Input.isTriggered('right')) {
            this.selectNextActor();
        }
    };

    Scene_Menu.prototype.onPersonalOk = function() {
        const actor = $gameParty.members()[this._selectedActorIndex];
        $gameParty.setMenuActor(actor);

        const symbol = this._commandWindow.currentSymbol();

        switch (symbol) {
            case "skill":
                SceneManager.push(Scene_Skill);
                break;
            case "equip":
                // Always go to Scene_Equip
                SceneManager.push(Scene_Equip);
                break;
            case "status":
                SceneManager.push(Scene_Status);
                break;
        }
    };

    Scene_Menu.prototype.onControlPanelOk = function() {
        // Variable HUD is display-only, no OK action
    };


    Scene_Menu.prototype.onInfoWindowEquipOk = function() {
        // User selected an equipment slot
        const slot = this._infoWindow.item();
        if (slot) {
            console.log('Selected equipment slot:', slot.slotName);
            // TODO: Open equipment selection window for this slot
            // For now, go to equip scene
            const actor = $gameParty.members()[this._selectedActorIndex];
            $gameParty.setMenuActor(actor);
            SceneManager.push(Scene_Equip);
        }
    };

    Scene_Menu.prototype.onInfoWindowEquipCancel = function() {
        this._infoWindow.deactivate();
        this._infoWindow.deselect();

        // Reactivate control panel
        if (this._contextControlPanel) {
            this._contextControlPanel.activate();
        }
    };

    Scene_Menu.prototype.onPersonalCancel = function() {
        this._actorSelectionMode = false;

        if (MenuManager.statusConfig.displayMode === 'horizontal' && this._actorWindows) {
            // Horizontal mode - use actor windows
            this._actorWindows[this._selectedActorIndex].setSelected(false);
            this._actorWindows[this._selectedActorIndex].deactivate();

            // Clear selection state on all actor windows
            for (const actorWindow of this._actorWindows) {
                actorWindow.setSelected(false);
            }
        } else if (this._statusWindow) {
            // Vertical mode - use status window
            this._statusWindow.deselect();
        }

        // Activate command window
        this._commandWindow.activate();
    };

    Scene_Menu.prototype.selectNextActor = function() {
        if (this._selectedActorIndex < this._actorWindows.length - 1) {
            SoundManager.playCursor();
            this._actorWindows[this._selectedActorIndex].setSelected(false);
            this._actorWindows[this._selectedActorIndex].deactivate();
            this._selectedActorIndex++;
            this._actorWindows[this._selectedActorIndex].setSelected(true);
            this._actorWindows[this._selectedActorIndex].activate();
        }
    };

    Scene_Menu.prototype.selectPreviousActor = function() {
        if (this._selectedActorIndex > 0) {
            SoundManager.playCursor();
            this._actorWindows[this._selectedActorIndex].setSelected(false);
            this._actorWindows[this._selectedActorIndex].deactivate();
            this._selectedActorIndex--;
            this._actorWindows[this._selectedActorIndex].setSelected(true);
            this._actorWindows[this._selectedActorIndex].activate();
        }
    };

    Scene_Menu.prototype.removeWindowMargins = function() {
        // Try to remove any CSS margins/padding that might be causing the issue
        if (this._statusWindow && this._statusWindow._windowskin) {
            try {
                // Force the window element to use full width
                const windowElement = this._statusWindow._windowskin.canvas;
                if (windowElement && windowElement.style) {
                    windowElement.style.margin = '0px';
                    windowElement.style.padding = '0px';
                    windowElement.style.left = '0px';
                    windowElement.style.right = '0px';
                }

                // Also try the window container
                if (this._statusWindow._container) {
                    this._statusWindow._container.style.margin = '0px';
                    this._statusWindow._container.style.padding = '0px';
                }

                console.log('Applied CSS margin/padding overrides to status window');
            } catch (error) {
                console.log('Could not apply CSS overrides:', error);
            }
        }
    };

    Scene_Menu.prototype.applyMenuManagerSettings = function() {
        // Apply custom settings to the menu scene
        if (MenuManager.animationConfig.enableAnimations) {
            this.setupMenuAnimations();
        }

        // Start sprite animations if enabled
        if (MenuManager.statusConfig.useCharacterSprites) {
            MenuManager.startSpriteAnimationLoop();
        }
    };

    const _Scene_Menu_terminate = Scene_Menu.prototype.terminate;
    Scene_Menu.prototype.terminate = function() {
        // Stop sprite animations when leaving menu
        MenuManager.stopSpriteAnimationLoop();

        // Clean up actor windows if they exist
        if (this._actorWindows) {
            for (const actorWindow of this._actorWindows) {
                actorWindow.close();
            }
        }

        _Scene_Menu_terminate.call(this);
    };

    Scene_Menu.prototype.setupMenuAnimations = function() {
        // Setup entrance animations
        if (this._commandWindow) {
            this._commandWindow.x = -this._commandWindow.width;
            this.slideInWindow(this._commandWindow, MenuManager.menuConfig.windowX);
        }

        if (this._statusWindow) {
            this._statusWindow.opacity = 0;
            this.fadeInWindow(this._statusWindow);
        }
    };

    // IMPROVED: Smooth slide animation using requestAnimationFrame
    Scene_Menu.prototype.slideInWindow = function(window, targetX) {
        const startX = window.x;
        const distance = targetX - startX;
        const speed = MenuManager.animationConfig.slideSpeed;

        // Use a more accurate frame-based animation
        let progress = 0;
        const animate = () => {
            progress += speed / 60; // Normalize to 60 FPS

            if (progress >= 1) {
                progress = 1;
                window.x = targetX;

                if (MenuManager.animationConfig.bounceEffect) {
                    this.addBounceEffect(window);
                }
            } else {
                // Use easing function for smoother animation
                const easedProgress = this.easeOutQuart(progress);
                window.x = startX + (distance * easedProgress);
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };

    // IMPROVED: Smooth fade animation using requestAnimationFrame
    Scene_Menu.prototype.fadeInWindow = function(window) {
        const speed = MenuManager.animationConfig.fadeSpeed;
        let progress = 0;

        const animate = () => {
            progress += speed / 60; // Normalize to 60 FPS

            if (progress >= 1) {
                progress = 1;
                window.opacity = 255;
            } else {
                window.opacity = Math.floor(255 * this.easeOutQuart(progress));
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };

    // NEW: Add easing function for smoother animations
    Scene_Menu.prototype.easeOutQuart = function(t) {
        return 1 - Math.pow(1 - t, 4);
    };

    // IMPROVED: Better bounce effect with proper timing
    Scene_Menu.prototype.addBounceEffect = function(window) {
        const originalX = window.x;
        const bounceDistance = 10;
        let progress = 0;
        const duration = 0.5; // seconds

        const animate = () => {
            progress += 1/60 / duration; // Increment per frame for duration

            if (progress >= 1) {
                window.x = originalX;
            } else {
                // Create bounce using sine wave
                const bounce = Math.sin(progress * Math.PI * 4) * bounceDistance * (1 - progress);
                window.x = originalX + bounce;
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    };

    //=============================================================================
    // Scene_Item - Use Horizontal Actor Windows Like Main Menu
    //=============================================================================

    const _Scene_Item_create = Scene_Item.prototype.create;
    Scene_Item.prototype.create = function() {
        _Scene_Item_create.call(this);

        // If horizontal mode, replace the actor window with individual windows
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            this.removeChild(this._actorWindow);
            this._actorWindow = null;
            this.createIndividualActorWindowsForItems();
        }
    };

    Scene_Item.prototype.createIndividualActorWindowsForItems = function() {
        const members = $gameParty.allMembers();
        const rect = this.actorWindowRect();

        const boxSpacing = 8;
        const totalSpacing = boxSpacing * (members.length - 1);
        const availableWidth = rect.width - totalSpacing;
        const boxWidth = Math.floor(availableWidth / members.length);

        this._actorWindows = [];
        this._selectedActorIndex = 0;

        for (let i = 0; i < members.length; i++) {
            const x = rect.x + (i * (boxWidth + boxSpacing));
            const actorRect = new Rectangle(x, rect.y, boxWidth, rect.height);
            const actorWindow = new Window_MenuActor(actorRect, members[i]);
            actorWindow.hide();
            actorWindow.deactivate();
            this._actorWindows.push(actorWindow);
            this.addWindow(actorWindow);
        }

        // Set up handlers
        this._actorWindows.forEach((window, index) => {
            window._itemIndex = index; // Store index for navigation
        });
    };

    const _Scene_Item_onItemOk = Scene_Item.prototype.onItemOk;
    Scene_Item.prototype.onItemOk = function() {
        if (MenuManager.statusConfig.displayMode === 'horizontal' && this._actorWindows) {
            this.showActorWindowsForSelection();
        } else {
            _Scene_Item_onItemOk.call(this);
        }
    };

    Scene_Item.prototype.showActorWindowsForSelection = function() {
        // Hide item window
        this._itemWindow.hide();
        this._itemWindow.deactivate();

        // Show all actor windows
        for (const actorWindow of this._actorWindows) {
            actorWindow.show();
        }

        const item = this.item();

        // Check if item targets all allies
        if (this.isItemForAll()) {
            // Highlight all actors
            this._multiTargetMode = true;
            this._selectedActorIndex = 0;
            for (let i = 0; i < this._actorWindows.length; i++) {
                this._actorWindows[i].setSelected(true);
            }
            this._actorWindows[0].activate();
        } else {
            // Single target - highlight only first actor
            this._multiTargetMode = false;
            this._selectedActorIndex = 0;

            // Make sure only the first actor is selected
            for (let i = 0; i < this._actorWindows.length; i++) {
                this._actorWindows[i].setSelected(i === 0);
            }
            this._actorWindows[0].activate();
        }

        this._actorSelectionMode = true;
    };

    const _Scene_Item_update = Scene_Item.prototype.update;
    Scene_Item.prototype.update = function() {
        _Scene_Item_update.call(this);

        if (this._actorWindows && this._actorSelectionMode) {
            this.updateItemActorSelection();
        }
    };

    Scene_Item.prototype.isItemForAll = function() {
        const item = this.item();
        if (!item) return false;

        // Correct scope values:
        // 7 = One Ally (single target)
        // 8 = All Allies
        // 9 = One Ally (Dead) (single target)
        // 10 = All Allies (Dead)
        // 11 = The User (single target)

        return item.scope === 8 || item.scope === 10;
    };

    Scene_Item.prototype.updateItemActorSelection = function() {
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.onActorCancelForItem();
        } else if (Input.isTriggered('ok')) {
            SoundManager.playOk();
            this.onActorOkForItem();
        } else if (!this._multiTargetMode) {
            // Only allow navigation for single-target items
            if (Input.isTriggered('left')) {
                this.selectPreviousActorForItem();
            } else if (Input.isTriggered('right')) {
                this.selectNextActorForItem();
            }
        }
    };

    Scene_Item.prototype.onActorOkForItem = function() {
        if (this._multiTargetMode) {
            // For multi-target, check if any actor can use it
            const item = this.item();
            const canUse = $gameParty.members().some(actor => actor && actor.canUse(item));
            if (canUse) {
                this.useItem();
            } else {
                SoundManager.playBuzzer();
            }
        } else {
            // For single-target
            const actor = $gameParty.members()[this._selectedActorIndex];
            if (this.canUseItemOnActor(actor)) {
                this.useItem();
            } else {
                SoundManager.playBuzzer();
            }
        }
    };

    Scene_Item.prototype.checkCommonEvent = function() {
        if ($gameTemp.isCommonEventReserved()) {
            SceneManager.goto(Scene_Map);
        }
    };

    Scene_Item.prototype.checkGameover = function() {
        if ($gameParty.isAllDead()) {
            SceneManager.goto(Scene_Gameover);
        }
    };

    Scene_Item.prototype.canUseItemOnActor = function(actor) {
        const item = this.item();
        return actor && actor.canUse(item);
    };

    Scene_Item.prototype.useItem = function() {
        const item = this.item();

        // Play use item sound effect
        SoundManager.playUseItem();

        // Apply the item
        $gameParty.leader().useItem(item);

        if (this._multiTargetMode) {
            // Apply to all party members
            const action = new Game_Action($gameParty.leader());
            action.setItemObject(item);

            for (const member of $gameParty.members()) {
                action.apply(member);
            }
            action.applyGlobal();
        } else {
            // Apply to single target
            const actor = $gameParty.members()[this._selectedActorIndex];
            const action = new Game_Action($gameParty.leader());
            action.setItemObject(item);
            action.apply(actor);
            action.applyGlobal();
        }

        // Check for effects
        this.checkCommonEvent();
        this.checkGameover();

        // Refresh actor windows to show updated HP/MP
        for (const actorWindow of this._actorWindows) {
            actorWindow.refresh();
        }

        // Check if item is used up - if so, return to item list
        if ($gameParty.numItems(item) === 0) {
            this.hideActorWindowsAfterUse();
        }
    };

    Scene_Item.prototype.hideActorWindowsAfterUse = function() {
        this._actorSelectionMode = false;
        this._multiTargetMode = false;

        // Deselect and hide all actor windows
        for (const actorWindow of this._actorWindows) {
            actorWindow.setSelected(false);
            actorWindow.deactivate();
            actorWindow.hide();
        }

        // Show and activate item window
        this._itemWindow.show();
        this._itemWindow.activate();
        this._itemWindow.refresh();
    };

    Scene_Item.prototype.onActorCancelForItem = function() {
        this._actorSelectionMode = false;
        this._multiTargetMode = false;

        // Deselect all actors
        for (const actorWindow of this._actorWindows) {
            actorWindow.setSelected(false);
            actorWindow.deactivate();
            actorWindow.hide();
        }

        // Return to item window
        this._itemWindow.show();
        this._itemWindow.activate();
    };

    Scene_Item.prototype.selectNextActorForItem = function() {
        if (this._multiTargetMode) return; // No navigation in multi-target mode

        if (this._selectedActorIndex < this._actorWindows.length - 1) {
            SoundManager.playCursor();

            // Deselect current
            this._actorWindows[this._selectedActorIndex].setSelected(false);
            this._actorWindows[this._selectedActorIndex].deactivate();

            // Select next
            this._selectedActorIndex++;
            this._actorWindows[this._selectedActorIndex].setSelected(true);
            this._actorWindows[this._selectedActorIndex].activate();
        }
    };

    Scene_Item.prototype.selectPreviousActorForItem = function() {
        if (this._multiTargetMode) return; // No navigation in multi-target mode

        if (this._selectedActorIndex > 0) {
            SoundManager.playCursor();

            // Deselect current
            this._actorWindows[this._selectedActorIndex].setSelected(false);
            this._actorWindows[this._selectedActorIndex].deactivate();

            // Select previous
            this._selectedActorIndex--;
            this._actorWindows[this._selectedActorIndex].setSelected(true);
            this._actorWindows[this._selectedActorIndex].activate();
        }
    };

    // Override actorWindowRect to position properly
    const _Scene_Item_actorWindowRect = Scene_Item.prototype.actorWindowRect;
    Scene_Item.prototype.actorWindowRect = function() {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            const wx = 0;
            const wy = this._categoryWindow.y + this._categoryWindow.height;
            const ww = Graphics.boxWidth;
            const wh = this._itemWindow.height;
            return new Rectangle(wx, wy, ww, wh);
        }
        return _Scene_Item_actorWindowRect.call(this);
    };


    //=============================================================================
    // Window_MenuCommand Overrides
    //=============================================================================

    const _Window_MenuCommand_makeCommandList = Window_MenuCommand.prototype.makeCommandList;
    Window_MenuCommand.prototype.makeCommandList = function() {
        // Clear the default list and build custom one
        this._list = [];
        this.makeCustomCommandList();
    };

    Window_MenuCommand.prototype.makeCustomCommandList = function() {
        const config = MenuManager.commandConfig;

        if (config.showItems) {
            this.addCommand(TextManager.item, "item", this.areMainCommandsEnabled());
        }
        if (config.showSkills) {
            this.addCommand(TextManager.skill, "skill", this.areMainCommandsEnabled());
        }
        if (config.showEquip) {
            this.addCommand(TextManager.equip, "equip", this.areMainCommandsEnabled());
        }
        if (config.showStatus) {
            this.addCommand(TextManager.status, "status", this.areMainCommandsEnabled());
        }
        if (config.showFormation) {
            this.addFormationCommand(); // Use built-in method
        }

        // Add custom commands
        config.customCommands.forEach(command => {
            if (command.name && command.symbol) {
                const enabled = command.enabled !== undefined ? command.enabled : true;
                this.addCommand(command.name, command.symbol, enabled);
            }
        });

        if (config.showOptions) {
            this.addCommand(TextManager.options, "options", true);
        }
        if (config.showSave) {
            this.addCommand(TextManager.save, "save", this.isSaveEnabled());
        }
        if (config.showGameEnd) {
            this.addCommand(TextManager.gameEnd, "gameEnd", true);
        }
    };

    const _Window_MenuCommand_processOk = Window_MenuCommand.prototype.processOk;
    Window_MenuCommand.prototype.processOk = function() {
        const symbol = this.currentSymbol();

        // Check if it's a custom command
        if (MenuManager.customCommandMap && MenuManager.customCommandMap[symbol]) {
            MenuManager.executeCustomCommand(symbol);
            return;
        }

        // Default processing
        _Window_MenuCommand_processOk.call(this);
    };

    Window_MenuCommand.prototype.itemTextAlign = function() {
        return "left";
    };

    //=============================================================================
    // Window_MenuStatus Overrides - Character Display Modes
    // Supports both Vertical List (default) and Horizontal List modes
    //=============================================================================

    const _Window_MenuStatus_refresh = Window_MenuStatus.prototype.refresh;
    Window_MenuStatus.prototype.refresh = function() {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            this.refreshHorizontal();
        } else {
            this.refreshVertical();
        }
        // This only gets called when window is created/updated, NOT on selection
    };

    Window_MenuStatus.prototype.refreshVertical = function() {
        // Use the original vertical layout
        _Window_MenuStatus_refresh.call(this);
    };

    // FIXED: Force full width utilization by overriding window padding
    Window_MenuStatus.prototype.refreshHorizontal = function() {
        this.contents.clear();
        const members = this.pendingMembers();
        if (members.length === 0) return;

        const maxVisible = this.maxVisibleItems();
        const visibleMembers = members.slice(0, maxVisible);
        const actualWidth = this.width - this.padding * 2;

        // Add spacing between boxes
        const boxSpacing = 8;
        const totalSpacing = boxSpacing * (visibleMembers.length - 1);
        const availableWidth = actualWidth - totalSpacing;
        const boxWidth = Math.floor(availableWidth / visibleMembers.length);

        const startX = -this.padding;
        const boxHeight = this.innerHeight;

        for (let i = 0; i < visibleMembers.length; i++) {
            const actor = visibleMembers[i];
            if (actor) {
                const x = startX + (i * (boxWidth + boxSpacing));

                // Draw box background
                this.drawActorBox(x, 0, boxWidth, boxHeight);

                // Draw the actor inside the box
                this.drawActorHorizontal(actor, x, 0, boxWidth);
            }
        }
    };

    Window_MenuStatus.prototype.drawActorBox = function(x, y, width, height) {
        // Draw box background
        const boxColor = 'rgba(0, 0, 0, 0.3)';
        this.contents.fillRect(x + 2, y + 2, width - 4, height - 4, boxColor);

        // Draw box border
        const borderColor = ColorManager.normalColor();
        this.contents.strokeRect(x + 2, y + 2, width - 4, height - 4, borderColor, 2);

        // Optional: Draw a subtle inner glow
        const glowColor = 'rgba(255, 255, 255, 0.1)';
        this.contents.strokeRect(x + 4, y + 4, width - 8, height - 8, glowColor, 1);
    };

    // NEW: Method specifically for drawing horizontal selection highlights
    Window_MenuStatus.prototype.drawItemBackgroundHorizontal = function(index, x, y, width) {
        if (index === this.index()) {
            // Draw selection background
            const rect = new Rectangle(x + 2, y + 2, width - 4, this.innerHeight - 4);
            const color1 = ColorManager.itemBackColor1();
            const color2 = ColorManager.itemBackColor2();

            // Draw gradient background
            this.contents.gradientFillRect(rect.x, rect.y, rect.width, rect.height, color1, color2, true);

            // Draw selection border
            this.contents.strokeRect(rect.x, rect.y, rect.width, rect.height, ColorManager.normalColor(), 2);
        }
    };

    Window_MenuStatus.prototype.drawActorHorizontal = function(actor, x, y, width) {
        if (!actor) {
            console.warn('drawActorHorizontal: Actor is null or undefined');
            return;
        }

        const config = MenuManager.statusConfig;
        let currentY = y;
        const centerX = x + Math.floor(width / 2);
        const padding = 2;

        const maxFaceSize = Math.min(config.faceSize, width - (padding * 2), Math.floor(width * 0.9));

        // Draw character sprite or face
        if (config.useCharacterSprites) {
            const spriteData = this.calculateSpriteSize(actor, config.spriteScale, config.maxSpriteSize);
            this.drawActorCharacterSprite(actor, centerX, currentY, spriteData);
            currentY += spriteData.displayHeight;
        } else if (config.showFace) {
            const faceX = centerX - Math.floor(maxFaceSize / 2);
            this.drawActorFace(actor, faceX, currentY, maxFaceSize, maxFaceSize);
            currentY += maxFaceSize + 3;
        }

        const originalFontSize = this.contents.fontSize;
        const compactFontSize = Math.max(18, Math.min(originalFontSize, width / 8));
        this.contents.fontSize = compactFontSize;
        const compactLineHeight = Math.floor(compactFontSize);

        // Draw name
        if (config.showName && actor.name) {
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(actor.name(), x + padding, currentY, width - (padding), 'center');
            currentY += compactLineHeight;
        }

        // Draw class
        if (config.showClass && actor.currentClass) {
            const classFontSize = Math.max(14, compactFontSize - 2);
            this.contents.fontSize = classFontSize;
            this.changeTextColor(ColorManager.textColor(6));

            // Use drawActorClass method to get subclass support
            this.drawActorClass(actor, x + padding, currentY, width - (padding * 2), 'center');
            currentY += Math.floor(classFontSize);
            this.contents.fontSize = compactFontSize;
        }

        // Draw level
        if (config.showLevel && actor.level !== undefined) {
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(`Lv.${actor.level}`, x + padding, currentY, width - (padding * 2), 'center');
            currentY += compactLineHeight;
        }

        // Gauges
        const barWidth = Math.min(width - (padding * 2), 80);
        const barX = centerX - Math.floor(barWidth / 2);
        const gaugeHeight = Math.floor(compactLineHeight * 0.9);

        // HP bar
        if (actor.hp !== undefined && actor.mhp !== undefined) {
            this.drawActorHpCustom(actor, barX, currentY, barWidth);
            currentY += gaugeHeight;
        }

        // MP bar
        if (actor.mp !== undefined && actor.mmp !== undefined) {
            this.drawActorMpCustom(actor, barX, currentY, barWidth);
            currentY += gaugeHeight;
        }

        // TP bar
        if (config.showTp && actor.tp !== undefined) {
            this.drawActorTpCustom(actor, barX, currentY, barWidth);
            currentY += gaugeHeight;
        }

        // Draw parameters
        if (config.showParams && actor.params) {
            const paramFontSize = Math.max(12, compactFontSize - 5);
            this.contents.fontSize = paramFontSize;
            this.changeTextColor(ColorManager.systemColor());
            const atk = actor.params && actor.params[2] !== undefined ? actor.params[2] : '?';
            const def = actor.params && actor.params[3] !== undefined ? actor.params[3] : '?';
            const atkDef = `ATK ${atk} / DEF ${def}`;
            this.drawText(atkDef, x + padding, currentY, width - (padding * 2), 'center');
        }

        // Reset font
        this.contents.fontSize = originalFontSize;
        this.changeTextColor(ColorManager.normalColor());
    };

    // NEW: Calculate sprite size based on scale
    Window_MenuStatus.prototype.calculateSpriteSize = function(actor, scale, maxSize) {
        console.log('=== Calculating sprite size ===');
        console.log('Actor:', actor.name());
        console.log('Scale:', scale);
        console.log('Max size:', maxSize);

        if (!actor._characterName) {
            // Return default size for actors without sprites
            return {
                displayWidth: 48,
 displayHeight: 48,
 scale: scale
            };
        }

        try {
            const bitmap = ImageManager.loadCharacter(actor._characterName);

            // Get the base frame size for this character
            const characterIndex = actor._characterIndex;
            const characterName = actor._characterName;

            // Detect sheet type based on filename
            const isBigCharacter = characterName.startsWith('!$');
            const isSingleCharacter = characterName.startsWith('$') || isBigCharacter;

            let baseFrameWidth, baseFrameHeight;

            if (bitmap.isReady()) {
                if (isSingleCharacter) {
                    // $ or !$ sheets - entire sheet is one character
                    baseFrameWidth = bitmap.width / 3;   // 3 frames per direction
                    baseFrameHeight = bitmap.height / 4; // 4 directions
                } else {
                    // Regular sheet - 8 characters (4x2 grid)
                    const charactersPerRow = 4;
                    const charactersPerCol = 2;
                    const characterSectionWidth = bitmap.width / charactersPerRow;
                    const characterSectionHeight = bitmap.height / charactersPerCol;
                    baseFrameWidth = characterSectionWidth / 3;  // 3 frames per row
                    baseFrameHeight = characterSectionHeight / 4; // 4 rows per character
                }
            } else {
                // Use standard RPG Maker frame sizes as fallback
                if (isSingleCharacter) {
                    baseFrameWidth = 144; // Standard $character frame width
                    baseFrameHeight = 192; // Standard $character frame height
                } else {
                    baseFrameWidth = 36;  // Standard character frame width
                    baseFrameHeight = 48; // Standard character frame height
                }
            }

            // Calculate scaled dimensions
            let scaledWidth = Math.floor(baseFrameWidth * scale);
            let scaledHeight = Math.floor(baseFrameHeight * scale);

            // Apply maximum size constraint while preserving aspect ratio
            const aspectRatio = baseFrameWidth / baseFrameHeight;
            if (scaledWidth > maxSize || scaledHeight > maxSize) {
                if (aspectRatio > 1) {
                    // Wider than tall
                    scaledWidth = maxSize;
                    scaledHeight = Math.floor(maxSize / aspectRatio);
                } else {
                    // Taller than wide
                    scaledHeight = maxSize;
                    scaledWidth = Math.floor(maxSize * aspectRatio);
                }
            }

            console.log('Base frame size:', baseFrameWidth, 'x', baseFrameHeight);
            console.log('Scaled size:', scaledWidth, 'x', scaledHeight);
            console.log('Aspect ratio:', aspectRatio);

            return {
                displayWidth: scaledWidth,
 displayHeight: scaledHeight,
 baseFrameWidth: baseFrameWidth,
 baseFrameHeight: baseFrameHeight,
 scale: scale
            };

        } catch (error) {
            console.error('Error calculating sprite size:', error);
            // Return safe fallback
            const fallbackSize = Math.min(48 * scale, maxSize);
            return {
                displayWidth: fallbackSize,
 displayHeight: fallbackSize,
 scale: scale
            };
        }
    };

    // NEW: Draw animated character sprite with improved debugging
    Window_MenuStatus.prototype.drawActorCharacterSprite = function(actor, centerX, y, spriteData) {
        console.log('=== Attempting to draw character sprite with scaling ===');
        console.log('Actor:', actor.name());
        console.log('Character name:', actor._characterName);
        console.log('Character index:', actor._characterIndex);
        console.log('Position:', centerX, y);
        console.log('Sprite data:', spriteData);

        if (!actor._characterName) {
            console.warn('Actor has no character sprite:', actor.name());
            // Draw a placeholder rectangle
            this.contents.fillRect(centerX - spriteData.displayWidth/2, y, spriteData.displayWidth, spriteData.displayHeight, 'rgba(255, 0, 0, 0.3)');
            this.drawText('No Sprite', centerX - 30, y + spriteData.displayHeight/2, 60, 'center');
            return;
        }

        try {
            const bitmap = ImageManager.loadCharacter(actor._characterName);
            console.log('Bitmap loaded:', bitmap);
            console.log('Bitmap ready:', bitmap.isReady());

            if (bitmap.isReady()) {
                this.drawCharacterSpriteImmediateScaled(bitmap, actor, centerX, y, spriteData);
            } else {
                console.log('Bitmap not ready, adding load listener');
                bitmap.addLoadListener(() => {
                    console.log('Bitmap loaded via listener');
                    this.drawCharacterSpriteImmediateScaled(bitmap, actor, centerX, y, spriteData);
                });
            }
        } catch (error) {
            console.error('Error loading character sprite:', error);
            // Draw error placeholder
            this.contents.fillRect(centerX - spriteData.displayWidth/2, y, spriteData.displayWidth, spriteData.displayHeight, 'rgba(255, 0, 0, 0.3)');
            this.drawText('Error', centerX - 20, y + spriteData.displayHeight/2, 40, 'center');
        }
    };

    Window_MenuStatus.prototype.drawCharacterSpriteImmediateScaled = function(bitmap, actor, centerX, y, spriteData) {
        const characterIndex = actor._characterIndex;
        const animationData = MenuManager.getSpriteAnimationFrame(actor.actorId());
        const characterName = actor._characterName;

        // Detect sheet type
        const isBigCharacter = characterName.startsWith('!$');
        const isSingleCharacter = characterName.startsWith('$') || isBigCharacter;

        let frameWidth, frameHeight, baseSectionX, baseSectionY;

        if (isSingleCharacter) {
            frameWidth = bitmap.width / 3;
            frameHeight = bitmap.height / 4;
            baseSectionX = 0;
            baseSectionY = 0;
        } else {
            const charactersPerRow = 4;
            const charactersPerCol = 2;
            const characterSectionWidth = bitmap.width / charactersPerRow;
            const characterSectionHeight = bitmap.height / charactersPerCol;
            frameWidth = characterSectionWidth / 3;
            frameHeight = characterSectionHeight / 4;

            const charCol = characterIndex % charactersPerRow;
            const charRow = Math.floor(characterIndex / charactersPerRow);
            baseSectionX = charCol * characterSectionWidth;
            baseSectionY = charRow * characterSectionHeight;
        }

        // Get direction index
        let directionIndex = 0;
        switch(animationData.direction) {
            case 2: directionIndex = 0; break; // down
            case 4: directionIndex = 1; break; // left
            case 8: directionIndex = 2; break; // up
            case 6: directionIndex = 3; break; // right
            default: directionIndex = 0; break;
        }

        // Calculate source coordinates
        const frameX = animationData.walkFrame;
        const frameY = directionIndex;
        const finalSX = baseSectionX + (frameX * frameWidth);
        const finalSY = baseSectionY + (frameY * frameHeight);

        // Calculate display size maintaining aspect ratio
        const aspectRatio = frameWidth / frameHeight;
        let drawWidth = spriteData.displayWidth;
        let drawHeight = spriteData.displayHeight;

        // Apply max size constraint while maintaining aspect ratio
        if (drawWidth > spriteData.maxSpriteSize || drawHeight > spriteData.maxSpriteSize) {
            if (aspectRatio > 1) {
                drawWidth = spriteData.maxSpriteSize;
                drawHeight = Math.floor(spriteData.maxSpriteSize / aspectRatio);
            } else {
                drawHeight = spriteData.maxSpriteSize;
                drawWidth = Math.floor(spriteData.maxSpriteSize * aspectRatio);
            }
        }

        // Center the sprite horizontally and align to top
        const finalDrawX = centerX - Math.floor(drawWidth / 2);
        const finalDrawY = y; // Align to top instead of centering vertically

        // Draw the sprite
        this.contents.blt(bitmap, finalSX, finalSY, frameWidth, frameHeight, finalDrawX, finalDrawY, drawWidth, drawHeight);
    };

    Window_MenuStatus.prototype.maxVisibleItems = function() {
        // For horizontal mode, limit based on available width and party size
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            const minWidth = 90; // Reduced minimum width per character for readability
            const maxMembers = Math.floor(this.innerWidth / minWidth);
            const partySize = $gameParty.allMembers().length;
            return Math.min(maxMembers, partySize, 8); // Max 8 characters horizontally
        }
        return Window_Selectable.prototype.maxVisibleItems.call(this);
    };

    Window_MenuStatus.prototype.pendingMembers = function() {
        return $gameParty.allMembers().filter(actor => actor);
    };

    //=============================================================================
    // Selection and Cursor Behavior for Horizontal Mode
    //=============================================================================

    const _Window_MenuStatus_maxCols = Window_MenuStatus.prototype.maxCols;
    Window_MenuStatus.prototype.maxCols = function() {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            return Math.min(this.pendingMembers().length, this.maxVisibleItems());
        }
        return _Window_MenuStatus_maxCols.call(this);
    };

    const _Window_MenuStatus_itemRect = Window_MenuStatus.prototype.itemRect;
    Window_MenuStatus.prototype.itemRect = function(index) {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            const members = this.pendingMembers();
            const maxVisible = this.maxVisibleItems();
            const visibleMembers = members.slice(0, maxVisible);

            if (index >= visibleMembers.length) {
                return new Rectangle(0, 0, 0, 0);
            }

            const actualWidth = this.width - this.padding * 2;
            const boxSpacing = 8;
            const totalSpacing = boxSpacing * (visibleMembers.length - 1);
            const availableWidth = actualWidth - totalSpacing;
            const boxWidth = Math.floor(availableWidth / visibleMembers.length);
            const startX = 0;

            const rect = new Rectangle();
            rect.x = startX + (index * (boxWidth + boxSpacing));
            rect.y = 0;
            rect.width = boxWidth;
            rect.height = this.innerHeight;

            return rect;
        }
        return _Window_MenuStatus_itemRect.call(this, index);
    };

    const _Window_MenuStatus_cursorDown = Window_MenuStatus.prototype.cursorDown;
    Window_MenuStatus.prototype.cursorDown = function(wrap) {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            // In horizontal mode, down arrow does nothing or can wrap to first item
            if (wrap) {
                this.select(0);
            }
            return;
        }
        _Window_MenuStatus_cursorDown.call(this, wrap);
    };

    const _Window_MenuStatus_cursorUp = Window_MenuStatus.prototype.cursorUp;
    Window_MenuStatus.prototype.cursorUp = function(wrap) {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            // In horizontal mode, up arrow does nothing or can wrap to last item
            if (wrap) {
                this.select(this.maxItems() - 1);
            }
            return;
        }
        _Window_MenuStatus_cursorUp.call(this, wrap);
    };

    // IMPROVED: Cursor movement with sound feedback
    const _Window_MenuStatus_cursorRight = Window_MenuStatus.prototype.cursorRight;
    Window_MenuStatus.prototype.cursorRight = function(wrap) {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            const index = this.index();
            const maxIndex = this.maxItems() - 1;
            const nextIndex = index < maxIndex ? index + 1 : (wrap ? 0 : maxIndex);

            if (nextIndex !== index) {
                this.select(nextIndex);
            }
            return;
        }
        _Window_MenuStatus_cursorRight.call(this, wrap);
    };

    const _Window_MenuStatus_cursorLeft = Window_MenuStatus.prototype.cursorLeft;
    Window_MenuStatus.prototype.cursorLeft = function(wrap) {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            const index = this.index();
            const maxIndex = this.maxItems() - 1;
            const prevIndex = index > 0 ? index - 1 : (wrap ? maxIndex : 0);

            if (prevIndex !== index) {
                this.select(prevIndex);
            }
            return;
        }
        _Window_MenuStatus_cursorLeft.call(this, wrap);
    };

    // Override the selection drawing to properly highlight in horizontal mode
    const _Window_MenuStatus_drawItemBackground = Window_MenuStatus.prototype.drawItemBackground;
    Window_MenuStatus.prototype.drawItemBackground = function(index) {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            if (index === this.index()) {
                const rect = this.itemRect(index);
                // Draw a subtle background highlight
                const color = ColorManager.itemBackColor1();
                this.contents.paintOpacity = 64;
                this.contents.fillRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, color);
                this.contents.paintOpacity = 255;
            }
            return;
        }
        _Window_MenuStatus_drawItemBackground.call(this, index);
    };

    // FIXED: Proper cursor handling in horizontal mode
    const _Window_MenuStatus_refreshCursor = Window_MenuStatus.prototype.refreshCursor;
    Window_MenuStatus.prototype.refreshCursor = function() {
        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            if (this._cursorSprite) {
                this._cursorSprite.visible = true;
            }
            const rect = this.itemRect(this.index());
            this.setCursorRect(rect.x, rect.y, rect.width, rect.height);
            return;
        }
        _Window_MenuStatus_refreshCursor.call(this);
    };

    const _Window_MenuStatus_select = Window_MenuStatus.prototype.select;
    Window_MenuStatus.prototype.select = function(index) {
        _Window_MenuStatus_select.call(this, index);
        // That's it. Cursor handles itself.
    };

    Window_MenuStatus.prototype.redrawItem = function(index) {
        if (index < 0) return;

        const rect = this.itemRect(index);
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        const actor = this.actor(index);
        if (actor) {
            const members = this.pendingMembers();
            const maxVisible = this.maxVisibleItems();
            const visibleMembers = members.slice(0, maxVisible);
            const actualWidth = this.width - this.padding * 2;
            const memberWidth = Math.floor(actualWidth / visibleMembers.length);
            const startX = -this.padding;
            const x = startX + (index * memberWidth);

            this.drawItemBackgroundHorizontal(index, x, 0, memberWidth);
            this.drawActorHorizontal(actor, x, 0, memberWidth);
        }
    };

    //=============================================================================
    // Window_ContextControlPanel - Dynamic Context-Sensitive Control Panel
    //=============================================================================

    function Window_ContextControlPanel() {
        this.initialize(...arguments);
    }

    Window_ContextControlPanel.prototype = Object.create(Window_Selectable.prototype);
    Window_ContextControlPanel.prototype.constructor = Window_ContextControlPanel;

    Window_ContextControlPanel.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._mode = 'default'; // default, equipment, item, skill
        this._actor = null;
        this._slotId = 0;
        this._item = null;
        this._data = [];
        this.refresh();
        this.deactivate();
    };

    Window_ContextControlPanel.prototype.setMode = function(mode, data) {
        this._mode = mode;

        switch(mode) {
            case 'equipment':
                this._actor = data.actor;
                this._slotId = data.slotId;
                break;
            case 'item':
            case 'skill':
                this._item = data;
                break;
            case 'default':
            default:
                // Variable HUD mode
                break;
        }

        this.refresh();
        this.select(0);
    };

    Window_ContextControlPanel.prototype.maxCols = function() {
        return 1;
    };

    Window_ContextControlPanel.prototype.maxItems = function() {
        return this._data ? this._data.length : 0;
    };

    Window_ContextControlPanel.prototype.item = function() {
        return this.itemAt(this.index());
    };

    Window_ContextControlPanel.prototype.itemAt = function(index) {
        return this._data && index >= 0 ? this._data[index] : null;
    };

    Window_ContextControlPanel.prototype.isCurrentItemEnabled = function() {
        const item = this.item();
        if (!item) return false;

        switch(this._mode) {
            case 'equipment':
                return item.enabled;
            case 'item':
            case 'skill':
                return true;
            default:
                return false;
        }
    };

    Window_ContextControlPanel.prototype.makeItemList = function() {
        this._data = [];
        // Only variable HUD mode now - no equipment list
    };

    Window_ContextControlPanel.prototype.makeEquipmentList = function() {
        // Empty - no longer used
    };

    Window_ContextControlPanel.prototype.makeItemActionList = function() {
        this._data.push({ type: 'command', symbol: 'use', name: 'Use Item', enabled: true });
        this._data.push({ type: 'command', symbol: 'discard', name: 'Discard', enabled: true });
    };

    Window_ContextControlPanel.prototype.makeSkillActionList = function() {
        this._data.push({ type: 'command', symbol: 'use', name: 'Use Skill', enabled: true });
    };

    Window_ContextControlPanel.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        if (!item) return;

        const rect = this.itemLineRect(index);

        switch(item.type) {
            case 'command':
                this.drawCommandItem(item, rect);
                break;
            case 'equipment':
                this.drawEquipmentItem(item, rect);
                break;
        }
    };

    Window_ContextControlPanel.prototype.drawCommandItem = function(item, rect) {
        this.changePaintOpacity(item.enabled);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(item.name, rect.x + 12, rect.y, rect.width - 12, 'left');
        this.changePaintOpacity(true);
    };

    Window_ContextControlPanel.prototype.drawEquipmentItem = function(item, rect) {
        const iconBoxWidth = ImageManager.iconWidth + 4;

        this.changePaintOpacity(item.enabled);
        this.drawIcon(item.data.iconIndex, rect.x, rect.y + 2);
        this.drawText(item.data.name, rect.x + iconBoxWidth, rect.y, rect.width - iconBoxWidth);
        this.changePaintOpacity(true);
    };

    Window_ContextControlPanel.prototype.refresh = function() {
        this.contents.clear();
        // Always draw variable HUD
        this.drawVariableHUD();
    };

    Window_ContextControlPanel.prototype.drawVariableHUD = function() {
        this.contents.clear();

        const config = MenuManager.controlPanelConfig;
        if (!config || !config.variableDisplays || config.variableDisplays.length === 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('Variables', 0, 0, this.innerWidth, 'center');
            return;
        }

        let y = 12;
        const lineHeight = this.lineHeight();
        const originalFontSize = this.contents.fontSize;

        // Title
        this.changeTextColor(ColorManager.textColor(6));
        this.drawText('Reputation', 0, y, this.innerWidth, 'center');
        y += lineHeight + 8;

        // Draw each variable
        for (const varDisplay of config.variableDisplays) {
            const varId = varDisplay.variableId;
            const label = varDisplay.label || $dataSystem.variables[varId] || `Variable ${varId}`;
            const icon = varDisplay.icon || 0;
            const value = $gameVariables.value(varId);

            let xOffset = 12;

            // Draw icon if specified (separate from label)
            if (icon > 0) {
                this.drawIcon(icon, xOffset, y + 2);
                xOffset += ImageManager.iconWidth + 4;
            }

            const labelText = label + ':';
            const valueText = value.toString();

            // Measure value at smaller size
            const valueFontSize = originalFontSize - 4; // Make values 4px smaller
            this.contents.fontSize = valueFontSize;
            const valueWidth = this.textWidth(valueText) + 12;

            // Calculate available space for label
            const availableLabelWidth = this.innerWidth - xOffset - valueWidth - 8;

            // Count inline icon codes in the label
            const iconMatches = labelText.match(/\\i\[\d+\]/gi);
            const iconCount = iconMatches ? iconMatches.length : 0;
            const iconWidth = iconCount * ImageManager.iconWidth;

            // Strip control codes for text measurement
            this.contents.fontSize = originalFontSize;
            const strippedLabel = labelText
            .replace(/\\i\[\d+\]/gi, '')
            .replace(/\\c\[\d+\]/gi, '')
            .replace(/\\n\[\d+\]/gi, 'XX');

            // Measure stripped label and add icon widths
            const textWidth = this.textWidth(strippedLabel);
            const fullLabelWidth = textWidth + iconWidth;

            // Calculate scaled font size
            let scaledFontSize = originalFontSize;
            if (fullLabelWidth > availableLabelWidth) {
                const scale = availableLabelWidth / fullLabelWidth;
                scaledFontSize = Math.floor(originalFontSize * scale);
                scaledFontSize = Math.max(scaledFontSize, 10);
            }

            // Set font size directly
            this.contents.fontSize = scaledFontSize;

            // Draw label using drawTextEx for control code support
            this.changeTextColor(ColorManager.systemColor());
            const textState = this.createTextState(labelText, xOffset, y, availableLabelWidth * 2);
            textState.drawing = true;
            this.processAllText(textState);

            // Draw value with smaller font
            this.contents.fontSize = valueFontSize;
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(valueText, this.innerWidth - valueWidth + 4, y, valueWidth - 8, 'right');

            y += lineHeight;
            if (y > this.innerHeight - lineHeight) break;
        }

        this.contents.fontSize = originalFontSize;
    };

    Window_ContextControlPanel.prototype.updateHelp = function() {
        if (this._mode === 'equipment') {
            // Could show equipment help here
        }
    };

    Window_ContextControlPanel.prototype.playOkSound = function() {
        if (this.isCurrentItemEnabled()) {
            Window_Selectable.prototype.playOkSound.call(this);
        } else {
            this.playBuzzerSound();
        }
    };


    //=============================================================================
    // Window_MenuActor - Individual Actor Display
    //=============================================================================

    function Window_MenuActor() {
        this.initialize(...arguments);
    }

    Window_MenuActor.prototype = Object.create(Window_StatusBase.prototype);
    Window_MenuActor.prototype.constructor = Window_MenuActor;

    Window_MenuActor.prototype.initialize = function(rect, actor) {
        Window_StatusBase.prototype.initialize.call(this, rect);
        this._actor = actor;
        this._isSelected = false;
        this._pulsePhase = 0; // For pulsating effect
        this.deactivate();

        this.opacity = 160;
        this.contentsOpacity = 180;
        this.refresh();
    };

    Window_MenuActor.prototype.update = function() {
        Window_StatusBase.prototype.update.call(this);

        if (this._isSelected) {
            this.updatePulseEffect();
        }
    };

    Window_MenuActor.prototype.updatePulseEffect = function() {
        // Pulsate between 220-255 opacity
        this._pulsePhase += 0.15;
        const pulse = Math.sin(this._pulsePhase) * 0.5 + 0.5; // 0 to 1
        this.opacity = 220 + (pulse * 35);
        this.contentsOpacity = 230 + (pulse * 25);
    };

    Window_MenuActor.prototype.maxItems = function() {
        return 1;
    };

    Window_MenuActor.prototype.setSelected = function(selected) {
        if (this._isSelected !== selected) {
            this._isSelected = selected;
            this.updateOpacity();
        }
    };

    Window_MenuActor.prototype.updateOpacity = function() {
        if (this._isSelected) {
            this.opacity = 255;
            this.contentsOpacity = 255;
            this._pulsePhase = 0; // Reset pulse
        } else {
            this.opacity = 140; // Much more transparent when not selected
            this.contentsOpacity = 160;
        }
    };

    Window_MenuActor.prototype.actor = function() {
        return this._actor;
    };

    Window_MenuActor.prototype.refresh = function() {
        this.contents.clear();
        if (this._actor) {
            this.drawActorContent(this._actor, 0, 0, this.innerWidth);
        }
    };

    Window_MenuActor.prototype.drawActorContent = function(actor, x, y, width) {
        const config = MenuManager.statusConfig;
        let currentY = y + 8;
        const centerX = x + Math.floor(width / 2);
        const padding = 2;

        const maxFaceSize = Math.min(config.faceSize, width - (padding * 2), Math.floor(width * 0.9));

        // Draw character sprite or face
        if (config.useCharacterSprites) {
            const spriteData = this.calculateSpriteSize(actor, config.spriteScale, config.maxSpriteSize);
            this.drawActorCharacterSprite(actor, centerX, currentY, spriteData);
            currentY += spriteData.displayHeight + 2;
        } else if (config.showFace) {
            const faceX = centerX - Math.floor(maxFaceSize / 2);
            this.drawActorFace(actor, faceX, currentY, maxFaceSize, maxFaceSize);
            currentY += maxFaceSize + 2;
        }

        // Compact font settings
        const originalFontSize = this.contents.fontSize;
        const compactFontSize = Math.max(16, Math.min(originalFontSize, width / 8));
        this.contents.fontSize = compactFontSize;
        const compactLineHeight = Math.floor(compactFontSize * 1.2);

        // Name
        if (config.showName && actor.name) {
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(actor.name(), x + padding, currentY, width - (padding * 2), 'center');
            currentY += compactLineHeight;
        }

        // Class
        if (config.showClass && actor.currentClass) {
            const classFontSize = Math.max(16, compactFontSize - 2);
            this.contents.fontSize = classFontSize;
            this.changeTextColor(ColorManager.textColor(6));

            // Use drawActorClass method to get subclass support
            this.drawActorClass(actor, x + padding, currentY, width - (padding * 2), 'center');
            currentY += Math.floor(classFontSize * 1.8);
            this.contents.fontSize = compactFontSize;
        }

        // Level
        if (config.showLevel && actor.level !== undefined) {
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(`Lv.${actor.level}`, x + padding, currentY, width - (padding * 2), 'center');
            currentY += compactLineHeight;
        }

        // Compact gauges
        const barWidth = Math.min(width - (padding * 2), 130);
        const barX = centerX - Math.floor(barWidth / 2);
        const gaugeHeight = Math.floor(compactLineHeight * 0.85);

        if (actor.hp !== undefined && actor.mhp !== undefined) {
            this.drawActorHpCustom(actor, barX, currentY, barWidth);
            currentY += gaugeHeight;
        }

        // MP bar
        if (actor.mp !== undefined && actor.mmp !== undefined) {
            this.drawActorMpCustom(actor, barX, currentY, barWidth);
            currentY += gaugeHeight;
        }

        // TP bar
        if (config.showTp && actor.tp !== undefined) {
            this.drawActorTpCustom(actor, barX, currentY, barWidth);
            currentY += gaugeHeight;
        }

        // Parameters
        if (config.showParams && actor.params) {
            currentY += 1;
            const paramFontSize = Math.max(11, compactFontSize - 5);
            this.contents.fontSize = paramFontSize;
            this.changeTextColor(ColorManager.systemColor());
            const atk = actor.params && actor.params[2] !== undefined ? actor.params[2] : '?';
            const def = actor.params && actor.params[3] !== undefined ? actor.params[3] : '?';
            const atkDef = `${atk}/${def}`;
            this.drawText(atkDef, x + padding, currentY, width - (padding * 2), 'center');
        }

        // Reset font
        this.contents.fontSize = originalFontSize;
        this.changeTextColor(ColorManager.normalColor());
    };

    const _Window_MenuActor_deactivate = Window_MenuActor.prototype.deactivate;
    Window_MenuActor.prototype.deactivate = function() {
        _Window_MenuActor_deactivate.call(this);
        this.setSelected(false);
    };

    // Copy the sprite methods from Window_MenuStatus
    Window_MenuActor.prototype.calculateSpriteSize = Window_MenuStatus.prototype.calculateSpriteSize;
    Window_MenuActor.prototype.drawActorCharacterSprite = Window_MenuStatus.prototype.drawActorCharacterSprite;
    Window_MenuActor.prototype.drawCharacterSpriteImmediateScaled = Window_MenuStatus.prototype.drawCharacterSpriteImmediateScaled;


    //=============================================================================
    // Window Positioning and Sizing Overrides - Updated for Independent Positioning
    //=============================================================================

    Scene_Menu.prototype.commandWindowRect = function() {
        return MenuManager.getMenuRect();
    };

    Scene_Menu.prototype.statusWindowRect = function() {
        // Debug logging for troubleshooting
        if (MenuManager.isIndependentPositioning()) {
            console.log('=== Status Window Positioning Debug ===');
            console.log('Independent positioning enabled');
            console.log('Graphics.boxWidth:', Graphics.boxWidth);
            console.log('Graphics.boxHeight:', Graphics.boxHeight);
            MenuManager.debugPositioning();
        }

        // If independent positioning is enabled, use ONLY the independent rect
        if (MenuManager.isIndependentPositioning()) {
            const independentRect = MenuManager.getStatusRect();
            if (independentRect) {
                console.log('Using independent rect:', independentRect);
                console.log('Status window will be positioned at:', independentRect.x, independentRect.y);
                console.log('Status window size:', independentRect.width, 'x', independentRect.height);

                // Force the window to use the FULL screen width with no margins
                const fullWidthRect = new Rectangle(0, independentRect.y, Graphics.boxWidth, independentRect.height);
                console.log('FORCING full width rect:', fullWidthRect);
                return fullWidthRect;
            }
            // If independent positioning is enabled but failed, create a fallback that's still independent
            console.warn('Independent positioning failed, using safe independent fallback');
            return new Rectangle(400, 100, 400, 300); // Safe independent position
        }

        // Original linked positioning logic (only when independent positioning is disabled)
        console.log('Using linked positioning (independent positioning disabled)');
        const commandRect = this.commandWindowRect();

        if (MenuManager.statusConfig.displayMode === 'horizontal') {
            // For horizontal mode, make the status window wider and calculate optimal height
            const ww = Graphics.boxWidth - commandRect.width;
            const partySize = $gameParty.allMembers().length;

            // Calculate required height based on content - use scaled sprite size
            const baseHeight = 40; // Padding
            let imageHeight = 0;

            if (MenuManager.statusConfig.useCharacterSprites) {
                imageHeight = MenuManager.statusConfig.maxSpriteSize || 144;
            } else if (MenuManager.statusConfig.showFace) {
                const faceSize = MenuManager.statusConfig.faceSize || 144;
                imageHeight = Math.min(faceSize, 100);
            }

            const textLines = (MenuManager.statusConfig.showName ? 1 : 0) +
            (MenuManager.statusConfig.showClass ? 1 : 0) +
            (MenuManager.statusConfig.showLevel ? 1 : 0) +
            (MenuManager.statusConfig.showParams ? 1 : 0) + 2; // HP/MP bars
            const textHeight = textLines * 28; // Approximate line height

            const calculatedHeight = baseHeight + imageHeight + textHeight + 20;
            const wh = Math.min(calculatedHeight, Graphics.boxHeight - commandRect.y, 350);
            const wx = commandRect.x + commandRect.width;
            const wy = commandRect.y;

            return new Rectangle(wx, wy, ww, wh);
        } else {
            // Original vertical layout
            const ww = Graphics.boxWidth - commandRect.width;
            const wh = commandRect.height;
            const wx = commandRect.x + commandRect.width;
            const wy = commandRect.y;
            return new Rectangle(wx, wy, ww, wh);
        }
    };

    Scene_Menu.prototype.goldWindowRect = function() {
        console.log('=== goldWindowRect called ===');
        console.trace(); // This will show the call stack

        if (MenuManager.isIndependentPositioning()) {
            const rect = MenuManager.getGoldRect();
            console.log('Returning independent rect:', rect);
            return rect;
        }

        const ww = this.goldWindowWidth();
        const wh = this.calcWindowHeight(1, true);
        const wx = Graphics.boxWidth - ww;
        const wy = this.mainAreaBottom() - wh;
        console.log('Returning default rect:', wx, wy, ww, wh);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Menu.prototype.goldWindowWidth = function() {
        return 240;
    };

    //=============================================================================
    // Window_CustomGold - Independent Gold Display
    //=============================================================================

    function Window_CustomGold() {
        this.initialize(...arguments);
    }

    Window_CustomGold.prototype = Object.create(Window_Base.prototype);
    Window_CustomGold.prototype.constructor = Window_CustomGold;

    Window_CustomGold.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_CustomGold.prototype.refresh = function() {
        this.contents.clear();
        const iconSettings = MenuManager.getGoldIconSettings();

        // Calculate rect manually instead of using itemLineRect
        const x = 0;
        const y = 0;
        const width = this.innerWidth;
        const height = this.innerHeight;

        const iconIndex = iconSettings.iconIndex;
        const iconPosition = iconSettings.position;
        const showCurrency = iconSettings.showCurrency;
        const currencyFormat = iconSettings.currencyFormat;
        const iconSize = 32;
        const iconPadding = 6;

        const goldAmount = $gameParty.gold();
        const currencyName = $dataSystem.currencyUnit || 'G';
        let displayText;

        if (showCurrency) {
            switch (currencyFormat) {
                case 'currency_amount':
                    displayText = `${currencyName}: ${goldAmount}`;
                    break;
                case 'amount_only':
                    displayText = goldAmount.toString();
                    break;
                case 'amount_currency':
                default:
                    displayText = `${goldAmount} ${currencyName}`;
                    break;
            }
        } else {
            displayText = goldAmount.toString();
        }

        const textWidth = this.textSizeEx(displayText).width;
        const totalContentWidth = (iconIndex > 0 ? iconSize + iconPadding : 0) + textWidth;
        const startX = Math.max(x, x + (width - totalContentWidth) / 2);

        let iconX, textX;
        if (iconIndex > 0) {
            if (iconPosition === 'left') {
                iconX = startX;
                textX = iconX + iconSize + iconPadding;
            } else {
                textX = startX;
                iconX = textX + textWidth + iconPadding;
            }
            this.drawIcon(iconIndex, iconX, y + 2);
        } else {
            textX = startX;
        }

        this.changeTextColor(ColorManager.normalColor());
        this.drawTextEx(displayText, textX, y, width - textX);
    };

    Window_CustomGold.prototype.value = function() {
        return $gameParty.gold();
    };

    Window_CustomGold.prototype.currencyUnit = function() {
        return TextManager.currencyUnit;
    };

    Window_CustomGold.prototype.open = function() {
        this.refresh();
        Window_Base.prototype.open.call(this);
    };

    //=============================================================================
    // Font and UI Customization
    //=============================================================================

    const _Window_Base_resetFontSettings = Window_Base.prototype.resetFontSettings;
    Window_Base.prototype.resetFontSettings = function() {
        _Window_Base_resetFontSettings.call(this);

        // Apply custom font settings in menu scenes
        if (SceneManager._scene instanceof Scene_Menu ||
            SceneManager._scene instanceof Scene_Item ||
            SceneManager._scene instanceof Scene_Skill ||
            SceneManager._scene instanceof Scene_Equip ||
            SceneManager._scene instanceof Scene_Status) {

            this.applyCustomFontSettings();
            }
    };

    Window_Base.prototype.applyCustomFontSettings = function() {
        if (!MenuManager.uiConfig) return;

        try {
            const fontFace = MenuManager.getEffectiveFontFace();
            const fontSize = MenuManager.uiConfig.fontSize || 28;

            // Apply font settings
            this.contents.fontFace = fontFace;
            this.contents.fontSize = fontSize;

            // Debug: verify font application
            console.log(`Applied font: ${fontFace}, size: ${fontSize}`);

            // Force redraw if content exists
            if (this.contents && this._allTextHeight) {
                this.refresh();
            }
        } catch (error) {
            console.warn('Error applying custom font settings:', error);
            // Fallback to default
            this.contents.fontFace = 'GameFont';
            this.contents.fontSize = 28;
        }
    };

    //=============================================================================
    // Custom Gauge Drawing with Chamfered Corners
    //=============================================================================

    Window_Base.prototype.drawActorHpCustom = function(actor, x, y, width) {
        width = width || 186;
        const rate = actor.hpRate();
        const colors = MenuManager.getGaugeColors(rate, MenuManager.uiConfig.hpGaugeColors);
        this.drawGaugeWithChamfer(x, y, width, rate, colors.color1, colors.color2);

        this.drawGaugeLabel(x, y, width, TextManager.hpA, actor.hp, actor.mhp);
    };

    Window_Base.prototype.drawActorMpCustom = function(actor, x, y, width) {
        width = width || 186;
        const rate = actor.mpRate();
        const colors = MenuManager.getGaugeColors(rate, MenuManager.uiConfig.mpGaugeColors);
        this.drawGaugeWithChamfer(x, y, width, rate, colors.color1, colors.color2);

        this.drawGaugeLabel(x, y, width, TextManager.mpA, actor.mp, actor.mmp);
    };

    Window_Base.prototype.drawActorTpCustom = function(actor, x, y, width) {
        width = width || 186;
        const rate = actor.tpRate();
        const colors = MenuManager.getGaugeColors(rate, MenuManager.uiConfig.tpGaugeColors);
        this.drawGaugeWithChamfer(x, y, width, rate, colors.color1, colors.color2);

        this.drawGaugeLabel(x, y, width, TextManager.tpA, actor.tp);
    };

    Window_Base.prototype.drawGaugeLabel = function(x, y, width, label, current, max) {
        const gaugeHeight = 12;
        const originalFontSize = this.contents.fontSize;
        const gaugeFontSize = Math.max(10, originalFontSize - 4); // Smaller font for gauges
        this.contents.fontSize = gaugeFontSize;

        const labelY = y + Math.floor((gaugeHeight - gaugeFontSize) / 2) - 1;

        // Setup outline for better readability
        const originalOutlineWidth = this.contents.outlineWidth;
        const originalOutlineColor = this.contents.outlineColor;
        this.contents.outlineWidth = 3;
        this.contents.outlineColor = 'rgba(0, 0, 0, 0.8)';

        // Draw label on the left
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(label, x + 4, labelY, 40, 'left');

        // Draw values on the right
        let valueText;
        if (max !== undefined) {
            // For HP/MP: show "150/200" format
            valueText = `${current}/${max}`;
        } else {
            // For TP: show "50" format
            valueText = `${current}`;
        }
        this.drawText(valueText, x + width - 60, labelY, 56, 'right');

        // Restore original settings
        this.contents.fontSize = originalFontSize;
        this.contents.outlineWidth = originalOutlineWidth;
        this.contents.outlineColor = originalOutlineColor;
    };

    Window_Base.prototype.drawGaugeWithChamfer = function(x, y, width, rate, color1, color2) {
        const gaugeHeight = 12;
        const fillW = Math.floor((width - 2) * rate);
        const fillH = gaugeHeight - 2;
        const color0 = ColorManager.gaugeBackColor();
        const chamferSize = MenuManager.uiConfig.gaugeChamferSize || 12;

        // Draw background with chamfered corners
        this.drawChamferedRect(x, y, width, gaugeHeight, color0, chamferSize);

        // Draw filled gauge with chamfered corners
        if (fillW > 0) {
            this.drawChamferedGradientRect(x + 1, y + 1, fillW, fillH, color1, color2, chamferSize);
        }
    };

    Window_Base.prototype.drawChamferedRect = function(x, y, width, height, color, chamferSize) {
        const context = this.contents.context;
        context.save();
        context.fillStyle = color;
        context.beginPath();

        context.moveTo(x + chamferSize, y);
        context.lineTo(x + width, y);
        context.lineTo(x + width, y + height - chamferSize);
        context.lineTo(x + width - chamferSize, y + height);
        context.lineTo(x, y + height);
        context.lineTo(x, y + chamferSize);
        context.lineTo(x + chamferSize, y);

        context.closePath();
        context.fill();
        context.restore();
    };

    Window_Base.prototype.drawChamferedGradientRect = function(x, y, width, height, color1, color2, chamferSize) {
        const context = this.contents.context;
        context.save();

        const gradient = context.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        context.fillStyle = gradient;

        const innerChamfer = Math.max(1, chamferSize - 2);

        context.beginPath();
        context.moveTo(x + innerChamfer, y);
        context.lineTo(x + width, y);
        context.lineTo(x + width, y + height - innerChamfer);
        context.lineTo(x + width - innerChamfer, y + height);
        context.lineTo(x, y + height);
        context.lineTo(x, y + innerChamfer);
        context.lineTo(x + innerChamfer, y);

        context.closePath();
        context.fill();
        context.restore();
    };

    function Window_MenuInfo() {
        this.initialize(...arguments);
    }

    Window_MenuInfo.prototype = Object.create(Window_Selectable.prototype);
    Window_MenuInfo.prototype.constructor = Window_MenuInfo;

    Window_MenuInfo.prototype.initialize = function(rect) {
        this._currentMode = 'default';
        this._currentData = null;
        this._equipSlots = [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.deactivate();
        this.deselect();
        this.refresh();
    };

    Window_MenuInfo.prototype.activate = function() {
        Window_Selectable.prototype.activate.call(this);
        if (this._currentMode === 'actorEquip' && this._equipSlots.length > 0) {
            this.select(0);
        }
    };

    Window_MenuInfo.prototype.deactivate = function() {
        Window_Selectable.prototype.deactivate.call(this);
        this.deselect();
    };

    Window_MenuInfo.prototype.maxCols = function() {
        return 1;
    };

    Window_MenuInfo.prototype.maxItems = function() {
        return this._currentMode === 'actorEquip' ? this._equipSlots.length : 0;
    };

    Window_MenuInfo.prototype.item = function() {
        return this._equipSlots[this.index()];
    };

    Window_MenuInfo.prototype.isCurrentItemEnabled = function() {
        return this._currentMode === 'actorEquip';
    };

    Window_MenuInfo.prototype.setMode = function(mode, data) {
        if (this._currentMode !== mode || this._currentData !== data) {
            this._currentMode = mode;
            this._currentData = data;
            this.refresh();
        }
    };

    Window_MenuInfo.prototype.refresh = function() {
        this.contents.clear();

        switch (this._currentMode) {
            case 'actor':
                this.drawActorInfo();
                break;
            case 'actorEquip':
                this.drawActorEquipInfo();
                break;
            case 'item':
                this.drawItemInfo();
                break;
            case 'skill':
                this.drawSkillInfo();
                break;
            default:
                this.drawDefaultInfo();
                break;
        }
    };

    Window_MenuInfo.prototype.drawDefaultInfo = function() {
        const config = MenuManager.infoWindowConfig;

        if (config.showMinimap) {
            this.drawMinimap();
        } else {
            // Draw default text centered
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(config.defaultText, 0, 0, this.innerWidth, 'center');

            // Draw current map name
            if ($gameMap.displayName()) {
                this.changeTextColor(ColorManager.normalColor());
                this.drawText($gameMap.displayName(), 0, this.lineHeight(), this.innerWidth, 'center');
            }

            // Draw party gold
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('Party Gold:', 20, this.lineHeight() * 3, 120);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText($gameParty.gold(), 140, this.lineHeight() * 3, 120, 'right');
        }
    };

    Window_MenuInfo.prototype.drawMinimap = function() {
        // Placeholder for minimap - this is a complex feature
        // Get the actual map name from MapInfos.json rather than the display name
        const mapId = $gameMap.mapId();
        const mapInfo = $dataMapInfos && $dataMapInfos[mapId];
        const mapName = (mapInfo && mapInfo.name) ? mapInfo.name : 'Unknown Area';

        // Calculate text widths for positioning
        const minimapText = 'Minimap - ';
        const minimapWidth = this.textWidth(minimapText);
        const mapNameWidth = this.textWidth(mapName);
        const totalWidth = minimapWidth + mapNameWidth;

        // Center the combined text
        const startX = Math.floor((this.innerWidth - totalWidth) / 2);

        // Draw "Minimap - " in system color
        this.changeTextColor(ColorManager.textColor(6));
        this.drawText(minimapText, startX, 0, minimapWidth, 'left');

        // Draw map name in normal color
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(mapName, startX + minimapWidth, 0, mapNameWidth, 'left');
    };

    Window_MenuInfo.prototype.itemRect = function(index) {
        if (this._currentMode !== 'actorEquip' || !this._equipSlots[index]) {
            return new Rectangle(0, 0, 0, 0);
        }

        const slot = this._equipSlots[index];
        const padding = 20;
        const totalWidth = this.innerWidth - padding * 3;
        const leftColumnWidth = Math.floor(totalWidth * 2 / 3);

        return new Rectangle(
            padding - 4,
            slot.y - 2,
            leftColumnWidth + 8,
            this.lineHeight()
        );
    };

    Window_MenuInfo.prototype.drawActorInfo = function() {
        const actor = this._currentData;
        if (!actor) return;

        let y = 0;

        // Actor name
        this.changeTextColor(ColorManager.hpColor(actor));
        this.drawText(actor.name(), 0, y, this.innerWidth, 'center');
        y += this.lineHeight();

        // Class
        this.changeTextColor(ColorManager.systemColor());
        this.drawText('Class:', 20, y, 80);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(actor.currentClass().name, 100, y, this.innerWidth - 120);
        y += this.lineHeight();

        // Level
        this.changeTextColor(ColorManager.systemColor());
        this.drawText('Level:', 20, y, 80);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(actor.level, 100, y, 60);
        y += this.lineHeight();

        // Stats
        const params = ['HP', 'MP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'];
        for (let i = 0; i < 4; i++) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(params[i] + ':', 20, y, 60);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(actor.param(i), 80, y, 60, 'right');
            y += this.lineHeight() * 0.8;
        }
    };

    Window_MenuInfo.prototype.drawActorEquipInfo = function() {
        const actor = this._currentData;
        if (!actor) return;

        // Clear equipment slots array
        this._equipSlots = [];

        let y = 0;
        const lineHeight = this.lineHeight();
        const iconSize = ImageManager.iconWidth;
        const padding = 20;

        // Header - CENTERED
        this.changeTextColor(ColorManager.textColor(0));
        const headerText = actor.name() + ' - Equipment';
        this.drawText(headerText, 0, y, this.innerWidth, 'center');
        y += lineHeight + 4;

        // Split into two columns: Equipment (2/3) and Stats (1/3)
        const totalWidth = this.innerWidth - padding * 3;
        const leftColumnWidth = Math.floor(totalWidth * 2 / 3);
        const rightColumnWidth = totalWidth - leftColumnWidth;
        const leftX = padding;
        const rightX = padding * 2 + leftColumnWidth;

        // === LEFT COLUMN: EQUIPMENT (2/3 width) ===
        let leftY = y;
        this.changeTextColor(ColorManager.textColor(6));
        this.drawText('Equipment', leftX, leftY, leftColumnWidth, 'left');
        leftY += lineHeight;

        const equips = actor.equips();
        const equipSlots = actor.equipSlots();

        for (let i = 0; i < equipSlots.length; i++) {
            const slotId = equipSlots[i];
            const equip = equips[i];
            const slotName = $dataSystem.equipTypes[slotId] || 'Unknown';

            // Store slot info for selection BEFORE drawing
            this._equipSlots.push({
                slotId: i,
                slotName: slotName,
                item: equip,
                y: leftY  // Store current Y position
            });

            // Highlight if this is the selected slot
            if (this.active && typeof this._index === 'number' && this._index === i) {
                const rect = new Rectangle(leftX - 4, leftY - 2, leftColumnWidth + 8, lineHeight);
                const color = ColorManager.itemBackColor1();
                this.contents.paintOpacity = 48;
                this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, color);
                this.contents.paintOpacity = 255;
            }

            // Draw slot name
            this.changeTextColor(ColorManager.systemColor());
            this.contents.fontSize = this.contents.fontSize - 2;
            this.drawText(slotName + ':', leftX, leftY, 100);
            this.resetFontSettings();

            if (equip) {
                // Draw equipment icon and name
                const iconX = leftX + 105;
                const textX = iconX + iconSize + 4;
                const availableWidth = leftColumnWidth - 105 - iconSize - 4;

                this.drawIcon(equip.iconIndex, iconX, leftY + 2);
                this.changeTextColor(ColorManager.normalColor());
                this.drawText(equip.name, textX, leftY, availableWidth);
            } else {
                // Draw "Empty" text
                this.changeTextColor(ColorManager.textColor(7));
                this.drawText('- Empty -', leftX + 105, leftY, leftColumnWidth - 105);
            }

            leftY += lineHeight;

            if (leftY > this.innerHeight - lineHeight) break;
        }

        // === RIGHT COLUMN: CHARACTER STATS ===
        let rightY = y;
        this.changeTextColor(ColorManager.textColor(6));
        this.drawText('Stats', rightX, rightY, rightColumnWidth, 'left');
        rightY += lineHeight;

        const statLabelWidth = 100;

        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = this.contents.fontSize - 2;
        this.drawText($dataSystem.terms.basic[2] + ':', rightX, rightY, statLabelWidth);
        this.changeTextColor(ColorManager.normalColor());
        const hpText = actor.hp + '/' + actor.mhp;
        this.drawText(hpText, rightX + statLabelWidth, rightY, rightColumnWidth - statLabelWidth, 'left');
        this.resetFontSettings();
        rightY += lineHeight * 0.9;

        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = this.contents.fontSize - 2;
        this.drawText($dataSystem.terms.basic[4] + ':', rightX, rightY, statLabelWidth);
        this.changeTextColor(ColorManager.normalColor());
        const mpText = actor.mp + '/' + actor.mmp;
        this.drawText(mpText, rightX + statLabelWidth, rightY, rightColumnWidth - statLabelWidth, 'left');
        this.resetFontSettings();
        rightY += lineHeight * 0.9;

        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = this.contents.fontSize - 2;
        this.drawText($dataSystem.terms.basic[6] + ':', rightX, rightY, statLabelWidth);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(Math.floor(actor.tp), rightX + statLabelWidth, rightY, rightColumnWidth - statLabelWidth, 'left');
        this.resetFontSettings();
        rightY += lineHeight + 2;

        this.changeTextColor(ColorManager.textColor(6));
        this.drawText('Parameters', rightX, rightY, rightColumnWidth, 'left');
        rightY += lineHeight * 0.85;

        const params = [
            { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }
        ];

        const paramLabelWidth = 100;

        for (const param of params) {
            const paramName = $dataSystem.terms.params[param.id];

            this.changeTextColor(ColorManager.systemColor());
            this.contents.fontSize = this.contents.fontSize - 3;
            this.drawText(paramName + ':', rightX, rightY, paramLabelWidth);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(actor.param(param.id), rightX + paramLabelWidth, rightY, rightColumnWidth - paramLabelWidth, 'left');
            this.resetFontSettings();
            rightY += lineHeight * 0.7;

            if (rightY > this.innerHeight - lineHeight * 1.5) break;
        }
        leftY += lineHeight;  // Increment AFTER everything
    };

    Window_MenuInfo.prototype.drawItemInfo = function() {
        const item = this._currentData;
        if (!item) return;

        let y = 0;

        // Item name
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(item.name, 0, y, this.innerWidth, 'center');
        y += this.lineHeight();

        // Description (word wrap)
        this.changeTextColor(ColorManager.normalColor());
        this.drawTextEx(item.description, 20, y, this.innerWidth - 40);
        y += this.lineHeight() * 2;

        // Price
        if (item.price > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('Price:', 20, y, 80);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(item.price + ' ' + TextManager.currencyUnit, 100, y, this.innerWidth - 120);
        }
    };

    Window_MenuInfo.prototype.drawSkillInfo = function() {
        const skill = this._currentData;
        if (!skill) return;

        let y = 0;

        // Skill name
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(skill.name, 0, y, this.innerWidth, 'center');
        y += this.lineHeight();

        // Description
        this.changeTextColor(ColorManager.normalColor());
        this.drawTextEx(skill.description, 20, y, this.innerWidth - 40);
        y += this.lineHeight() * 2;

        // Costs
        if (skill.mpCost > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('MP Cost:', 20, y, 80);
            this.changeTextColor(ColorManager.mpCostColor());
            this.drawText(skill.mpCost, 100, y, 60);
            y += this.lineHeight() * 0.8;
        }

        if (skill.tpCost > 0) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('TP Cost:', 20, y, 80);
            this.changeTextColor(ColorManager.tpCostColor());
            this.drawText(skill.tpCost, 100, y, 60);
        }
    };

    //=============================================================================
    // Plugin Initialization
    //=============================================================================

    const _Scene_Boot_onDatabaseLoaded = Scene_Boot.prototype.onDatabaseLoaded;
    Scene_Boot.prototype.onDatabaseLoaded = function() {
        _Scene_Boot_onDatabaseLoaded.call(this);
        MenuManager.initialize();
    };

})();
