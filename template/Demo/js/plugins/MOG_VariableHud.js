//=============================================================================
// MOG_VariableHud.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc (v1.2) Displays variables through Huds.
 * @author Moghunter
 * @url https://mogplugins.wordpress.com
 *
 * @param -> MAIN <<<<<<<<<<<<<<<<<<<<<<<
 * @desc
 *
 * @param Smart Fade
 * @desc Enable transparency on the hud when the hud is above the character.
 * @default true
 * @type boolean
 * @on Overlapping Character
 * @off Always Visible
 * @parent -> MAIN <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Auto Fade
 * @desc Hide the hud when the message window is active.
 * @default true
 * @type boolean
 * @on Window Message
 * @off Always Visible 
 * @parent -> MAIN <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Initial Visible
 * @desc Enable Hud at the start of the game.
 * @default true
 * @type boolean
 * @on Visible From Start
 * @off Hide
 * @parent -> MAIN <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc
 *  
 * @param Hud 1 Enable
 * @desc Enable Hud.
 * @default true
 * @type boolean
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 1 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 1 Variable ID
 * @desc Variable ID definition.
 * @default 30
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 1 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1)
 * @default 100
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 1 File Name
 * @desc Hud image name definition.
 * @default Hud_1
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Layout X
 * @desc X-axis position definition for the image.
 * @default 200
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 5
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Number X
 * @desc X-axis position definition for the number.
 * @default -7
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Number Y
 * @desc Y-axis position definition for the number.
 * @default 10
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Show Max Value
 * @desc Display the maximum value.
 * @default true
 * @type boolean
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 1 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 1 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 2 Enable
 * @desc Enable Hud.
 * @default true
 * @type boolean
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 2 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 2 Variable ID
 * @desc Variable ID definition.
 * @default 31
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 2 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 300
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 2 File Name
 * @desc Hud image name definition.
 * @default Hud_2
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Layout X
 * @desc X-axis position definition for the image.
 * @default 347
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 5
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Number X
 * @desc X-axis position definition for the number.
 * @default -7
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Number Y
 * @desc Y-axis position definition for the number.
 * @default 10
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Show Max Value
 * @desc Display the maximum value.
 * @default true
 * @type boolean
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 2 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 2 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 3 Enable
 * @desc Enable Hud.
 * @default true
 * @type boolean
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 3 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 3 Variable ID
 * @desc Variable ID definition.
 * @default 32
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 3 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 3 File Name
 * @desc Hud image name definition.
 * @default Hud_3
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 3 Layout X
 * @desc X-axis position definition for the image.
 * @default 490
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 5
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Number X
 * @desc X-axis position definition for the number.
 * @default -7
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Number Y
 * @desc Y-axis position definition for the number.
 * @default 10
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Show Max Value
 * @desc Display the maximum value.
 * @default true
 * @type boolean
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 3 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 3 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 4 Enable
 * @desc Enable Hud.
 * @default true
 * @type boolean
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 4 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 4 Variable ID
 * @desc Variable ID definition.
 * @default 33
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 4 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 4 File Name
 * @desc Hud image name definition.
 * @default Hud_4
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Layout X
 * @desc X-axis position definition for the image.
 * @default 730
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 230
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Number X
 * @desc X-axis position definition for the number.
 * @default -50
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Show Gauge
 * @desc Display the gauge.
 * @default true
 * @type boolean
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 20
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 4 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 63
 * @parent -> HUD 4 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 5 Enable
 * @desc Enable Hud.
 * @default true
 * @type boolean
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 5 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 5 Variable ID
 * @desc Variable ID definition.
 * @default 34
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 5 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 5 File Name
 * @desc Hud image name definition.
 * @default Hud_5
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Layout X
 * @desc X-axis position definition for the image.
 * @default 730
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 327
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Number X
 * @desc X-axis position definition for the number.
 * @default -50
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Show Gauge
 * @desc Display the gauge.
 * @default true
 * @type boolean
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 20
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 5 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 63
 * @parent -> HUD 5 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 6 Enable
 * @desc Enable Hud.
 * @default true
 * @type boolean
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 6 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 6 Variable ID
 * @desc Variable ID definition.
 * @default 35
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 6 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 6 File Name
 * @desc Hud image name definition.
 * @default Hud_6
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 6 Layout X
 * @desc X-axis position definition for the image.
 * @default 730
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 424
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Number X
 * @desc X-axis position definition for the number.
 * @default -50
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Show Gauge
 * @desc Display the gauge.
 * @default true
 * @type boolean
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 20
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 6 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 63
 * @parent -> HUD 6 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 7 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 7 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 7 Variable ID
 * @desc Variable ID definition.
 * @default 36
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 7 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 7 File Name
 * @desc Hud image name definition.
 * @default Hud_7
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Layout X
 * @desc X-axis position definition for the image.
 * @default 0
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 0
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 7 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 7 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 8 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 8 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 8 Variable ID
 * @desc Variable ID definition.
 * @default 37
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 8 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 8 File Name
 * @desc Hud image name definition.
 * @default Hud_8
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Layout X
 * @desc X-axis position definition for the image.
 * @default 50
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 50
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 8 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 8 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 9 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 9 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 9 Variable ID
 * @desc Variable ID definition.
 * @default 38
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 9 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 9 File Name
 * @desc Hud image name definition.
 * @default Hud_9
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Layout X
 * @desc X-axis position definition for the image.
 * @default 100
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 100
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 9 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 9 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 10 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 10 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 10 Variable ID
 * @desc Variable ID definition.
 * @default 39
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 10 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 10 File Name
 * @desc Hud image name definition.
 * @default Hud_10
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Layout X
 * @desc X-axis position definition for the image.
 * @default 150
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 150
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 10 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 10 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 10 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 11 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 11 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 11 Variable ID
 * @desc Variable ID definition.
 * @default 40
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 11 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 11 File Name
 * @desc Hud image name definition.
 * @default Hud_11
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Layout X
 * @desc X-axis position definition for the image.
 * @default 200
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 200
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 11 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 11 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 11 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 12 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 12 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 12 Variable ID
 * @desc Variable ID definition.
 * @default 41
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 12 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 12 File Name
 * @desc Hud image name definition.
 * @default Hud_12
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Layout X
 * @desc X-axis position definition for the image.
 * @default 250
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 250
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<<  
 *
 * @param Hud 12 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 12 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 12 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 12 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param
 * 
 * @param -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 13 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 13 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 13 Variable ID
 * @desc Variable ID definition.
 * @default 42
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 13 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 13 File Name
 * @desc Hud image name definition.
 * @default Hud_13
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Layout X
 * @desc X-axis position definition for the image.
 * @default 300
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 300
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 13 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param
 * 
 * @param -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 14 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 13 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 14 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 14 Variable ID
 * @desc Variable ID definition.
 * @default 43
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 14 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<< 
 * 
 * @param Hud 14 File Name
 * @desc Hud image name definition.
 * @default Hud_14
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 14 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Layout X
 * @desc X-axis position definition for the image.
 * @default 350
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 350
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 14 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 14 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 15 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 15 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 15 Variable ID
 * @desc Variable ID definition.
 * @default 44
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 15 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 15 File Name
 * @desc Hud image name definition.
 * @default Hud_15
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Layout X
 * @desc X-axis position definition for the image.
 * @default 400
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 400
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 15 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 15 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 16 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 16 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 16 Variable ID
 * @desc Variable ID definition.
 * @default 45
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 16 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 16 File Name
 * @desc Hud image name definition.
 * @default Hud_16
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<< 
 *
 * @param Hud 16 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Layout X
 * @desc X-axis position definition for the image.
 * @default 450
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 450
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 16 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 16 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 17 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 17 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 17 Variable ID
 * @desc Variable ID definition.
 * @default 46
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 17 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 17 File Name
 * @desc Hud image name definition.
 * @default Hud_17
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Layout X
 * @desc X-axis position definition for the image.
 * @default 500
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 500
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 17 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 17 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 18 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 18 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 18 Variable ID
 * @desc Variable ID definition.
 * @default 47
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 18 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 18 File Name
 * @desc Hud image name definition.
 * @default Hud_18
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Layout X
 * @desc X-axis position definition for the image.
 * @default 550
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 550
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 18 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 18 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 19 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 19 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 19 Variable ID
 * @desc Variable ID definition.
 * @default 48
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 19 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 19 File Name
 * @desc Hud image name definition.
 * @default Hud_19
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Layout X
 * @desc X-axis position definition for the image.
 * @default 600
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 550
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 19 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 19 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param
 * 
 * @param -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 * @desc 
 *
 * @param Hud 20 Enable
 * @desc Enable Hud.
 * @default false
 * @type boolean
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 20 Mode
 * @desc Display variable or item.
 * 0 - Variable    1 - Item
 * @default 0
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 20 Variable ID
 * @desc Variable ID definition.
 * @default 49
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 20 Maximum Value
 * @desc Variable maximum value definition.
 * *(Does not work for items -> Mode 1) 
 * @default 999999
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 * 
 * @param Hud 20 File Name
 * @desc Hud image name definition.
 * @default Hud_20
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Start Visible
 * @desc Start visible.
 * @default true
 * @type boolean
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Layout X
 * @desc X-axis position definition for the image.
 * @default 650
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Layout Y
 * @desc Y-axis position definition for the image.
 * @default 550
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Number X
 * @desc X-axis position definition for the number.
 * @default -10
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Number Y
 * @desc Y-axis position definition for the number.
 * @default 30
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Number Align
 * @desc Number alignment definition.
 * 0 - Left    1 - Center    2 - Right
 * @default 1
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Font Size
 * @desc Font size definition.
 * @default 18
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Show Max Value
 * @desc Display the maximum value.
 * @default false
 * @type boolean
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Show Gauge
 * @desc Display the gauge.
 * @default false
 * @type boolean
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Gauge X-Axis
 * @desc X-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @param Hud 20 Gauge Y-Axis
 * @desc Y-axis definition for the gauge.
 * @default 0
 * @parent -> HUD 20 <<<<<<<<<<<<<<<<<<<<<<<
 *
 * @command VariableHudVisibleField
 * @desc Show or hide all huds.
 * @text Show / Hide (All)
 *
 * @arg visible
 * @desc Show or hide all huds.
 * @text Visible
 * @default true
 * @type boolean
 *
 * @command VariableHudVisible
 * @desc Show or hide the hud.
 * @text Show / Hide (Index)
 *
 * @arg id
 * @desc Index definition (0..20)
 * @text Index
 * @default 0 
 * @type number
 * @min 0
 * @max 20
 * 
 * @arg visible
 * @desc Show or hide the hud.
 * @text Visible
 * @default true
 * @type boolean
 *
 * @command VariableHudMaxValue
 * @desc Set the variable maximum value.
 * @text Set Max Value
 *
 * @arg id
 * @desc Index definition (0..20)
 * @text Index
 * @default 0 
 * @type number
 * @min 0
 * @max 20
 * 
 * @arg maxvalue
 * @desc Set the variable maximum value.
 * @text Max Value
 * @default 100
 * @type number
 * @min 0
 * @max 999999999 
 *
 * @help  
 * =============================================================================
 * +++ MOG - Variable HUD (v1.2) +++
 * By Moghunter
 * https://mogplugins.wordpress.com
 * =============================================================================
 * Displays variables through Huds.
 *
 * =============================================================================
 * - REQUIRED FILES
 * =============================================================================
 * Save the images in the /img/variablehud/ folder
 * If the gauge function is enabled, you will need to have the gauge image.
 * This image should be named in the following way.
 *
 * -> FILE_NAME + _GAUGE.png
 *
 *
 * -> HUD1_GAUGE.png
 *
 *
 * =============================================================================
 * - PLUGIN COMMANDS
 * =============================================================================
 * To activate or deactivate the hud, use the commands below.
 *
 * show_variable_hud : HUD_ID
 * hide_variable_hud : HUD_ID
 *
 * EG
 *
 * show_variable_hud : 4
 * hide_variable_hud : 4
 *
 * =============================================================================
 * To set a maximum value for the variable during the game, use the command below.
 *
 * set_variable_max : VARIAVEL_ID : MAX_VALUE
 *
 * EG
 *
 * set_variable_max : 30 : 999
 *
 *
 * =============================================================================
 * * HISTORY
 * =============================================================================
 * (v1.2) Fixed the bug where the hud flickers in hide mode after exiting the menu.
 * (v1.1) Fix in the sort function related to encoding.       
 * 
 */

//=============================================================================
// ** PLUGIN PARAMETERS
//=============================================================================
　　var Imported = Imported || {};
　　Imported.MOG_VariableHud = true;
　　var Moghunter = Moghunter || {}; 

  　Moghunter.parameters = PluginManager.parameters('MOG_VariableHud');
    Moghunter.variableHud_smartFade = String(Moghunter.parameters['Smart Fade'] || "false");
	Moghunter.variableHud_FieldVisible = String(Moghunter.parameters['Initial Visible'] || "false");	
    Moghunter.variableHud_Max = 20;	Moghunter.variableHud_Visible = [];
	Moghunter.variableHud_VisibleInt = []; Moghunter.variableHud_VariableID = [];
	Moghunter.variableHud_ValueLimit = []; Moghunter.variableHud_FileName = [];
	Moghunter.variableHud_LayX = []; Moghunter.variableHud_LayY = [];
	Moghunter.variableHud_NumX = []; Moghunter.variableHud_NumY = [];
	Moghunter.variableHud_NumAlign = []; Moghunter.variableHud_NumFontSize = [];
	Moghunter.variableHud_Type = []; Moghunter.variableHud_ShowMax = [];
	Moghunter.variableHud_ShowGauge = []; Moghunter.variableHud_gaugeX = [];
	Moghunter.variableHud_gaugeY = []; Moghunter.variableHud_AutoFade = [];
	for (var i = 0; i < Moghunter.variableHud_Max; i++) {
		Moghunter.variableHud_Visible[i] = String(Moghunter.parameters['Hud ' + String(i + 1) + ' Enable'] || 'false');
		Moghunter.variableHud_VisibleInt[i] = String(Moghunter.parameters['Hud ' + String(i + 1) + ' Start Visible'] || 'true');
		Moghunter.variableHud_Type[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Mode'] || 0);
		Moghunter.variableHud_VariableID[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Variable ID'] || 1);
		Moghunter.variableHud_ValueLimit[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Maximum Value'] || 999);
        Moghunter.variableHud_FileName[i] = String(Moghunter.parameters['Hud ' + String(i + 1) + ' File Name'] || 'Hud_');
		Moghunter.variableHud_LayX[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Layout X'] || 0);
		Moghunter.variableHud_LayY[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Layout Y'] || 0);
		Moghunter.variableHud_NumX[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Number X'] || -7);
		Moghunter.variableHud_NumY[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Number Y'] || 10);
		Moghunter.variableHud_NumAlign[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Number Align'] || 1);
		Moghunter.variableHud_NumFontSize[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Font Size'] || 18);
		Moghunter.variableHud_ShowMax[i] = String(Moghunter.parameters['Hud ' + String(i + 1) + ' Show Max Value'] || 'true');
		Moghunter.variableHud_ShowGauge[i] = String(Moghunter.parameters['Hud ' + String(i + 1) + ' Show Gauge'] || 'false');
		Moghunter.variableHud_gaugeX[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Gauge X-Axis'] || 0);
		Moghunter.variableHud_gaugeY[i] = Number(Moghunter.parameters['Hud ' + String(i + 1) + ' Gauge Y-Axis'] || 0);
		Moghunter.variableHud_AutoFade[i] = String(Moghunter.parameters['Auto Fade'] || 'true');
	};	
	
//=============================================================================
// ■■■  PluginManager ■■■ 
//=============================================================================		
PluginManager.registerCommand('MOG_VariableHud', "VariableHudVisibleField", data => {
     var vis = String(data.visible) == "true" ? true : false;
	 $gameSystem._variableHudFieldVisisble = vis;
});
	
PluginManager.registerCommand('MOG_VariableHud', "VariableHudVisible", data => {
	var varID = Number(data.id);
	if ($gameSystem._variableHudData[varID]) {
		var vis = String(data.visible) == "true" ? true : false;
	    $gameSystem._variableHudData[varID].visible = vis;
	};
});

PluginManager.registerCommand('MOG_VariableHud', "VariableHudMaxValue", data => {
	var varID = Number(data.id);
	if ($gameSystem._variableHudData[varID]) {
		var maxValue = Math.min(Math.max(data.maxvalue, 0),99999999); 
	    $gameSystem._variableHudData[varID].maxValue = maxValue;
	};
});
	
//=============================================================================
// ** ImageManager
//=============================================================================	

//=============================
// ** Load Variable Hud
//=============================
ImageManager.loadVariableHud = function(filename) {
    return this.loadBitmap('img/variablehud/', filename, 0, true);
};	
	
//=============================================================================
// ** Game System
//=============================================================================	

//==============================
// * Initialize
//==============================
var _mog_variableHud_gsys_initialize = Game_System.prototype.initialize;
Game_System.prototype.initialize = function() {
	_mog_variableHud_gsys_initialize.call(this);
	this._variableHudData = [];
	this._variableHudVisible = true;
	this._variableHudFieldVisisble = String(Moghunter.variableHud_FieldVisible) === "true" ? true : false;
};

//=============================================================================
// ** Game Character Base 
//=============================================================================

//==============================
// * Screen RealX
//==============================
Game_CharacterBase.prototype.screen_realX = function() {
    return this.scrolledX() * $gameMap.tileWidth()
};

//==============================
// * Screen RealY
//==============================
Game_CharacterBase.prototype.screen_realY = function() {
    return this.scrolledY() * $gameMap.tileHeight()
};

//=============================================================================
// ** Scene Base
//=============================================================================

//==============================
// ** create Hud Field
//==============================
Scene_Base.prototype.createHudField = function() {
	this._hudField = new Sprite();
	this._hudField.z = 10;
	this.addChild(this._hudField);
};

//==============================
// ** sort MZ
//==============================
Scene_Base.prototype.sortMz = function() {
   this._hudField.children.sort((a, b) => a.z - b.z);
};	

//=============================================================================
// ** Scene Map
//=============================================================================	

//==============================
// ♦ ALIAS ♦  create Spriteset
//==============================
var _mog_VariableHud_sMap_createSpriteset = Scene_Map.prototype.createSpriteset;
Scene_Map.prototype.createSpriteset = function() {
	_mog_VariableHud_sMap_createSpriteset.call(this);
	if (!this._hudField) {this.createHudField()};
	this.createVariableHuds();
	this.sortMz();
};

//==============================
// ♦ ALIAS ♦  snapForBattleBackground
//==============================
var _mog_variableHud_scnMap_snapForBattleBackground = Scene_Map.prototype.snapForBattleBackground;
Scene_Map.prototype.snapForBattleBackground = function() {
	if (this._hudField && SceneManager.isNextScene(Scene_Battle)) {this._hudField.visible = false};
	_mog_variableHud_scnMap_snapForBattleBackground.call(this);
};

//==============================
// ♦ ALIAS ♦  Update
//==============================
var _mog_variableHud_scnMap_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    _mog_variableHud_scnMap_update.call(this);
	if (this._variableHudField) {this._variableHudField.visible = $gameSystem._variableHudFieldVisisble};
};

//==============================
// * create VariableHuds
//==============================
Scene_Map.prototype.createVariableHuds = function() {
	this._variableHudField = new Sprite();
	this._variableHudField.z = 10;
	this._hudField.addChild(this._variableHudField);	
	this._variableHud = [];
	for (var i = 0; i < Moghunter.variableHud_Max; i++) {
		if (!$gameSystem._variableHudData[i]) {
			 $gameSystem._variableHudData[i] = {}
		     var vis = String(Moghunter.variableHud_VisibleInt[i]) === "true" ? true : false;
			 $gameSystem._variableHudData[i].id = i;
			 $gameSystem._variableHudData[i].visible = vis;
			 $gameSystem._variableHudData[i].maxValue = Number(Moghunter.variableHud_ValueLimit[i]);			 
			 $gameSystem._variableHudData[i].showMax = String(Moghunter.variableHud_ShowMax[i]) == "true" ? true : false;			 
			 $gameSystem._variableHudData[i].gauge = String(Moghunter.variableHud_ShowGauge[i]) == "true" ? true : false;
			 $gameSystem._variableHudData[i].gaugeX = Number(Moghunter.variableHud_gaugeX[i]);
			 $gameSystem._variableHudData[i].gaugeY = Number(Moghunter.variableHud_gaugeY[i]);
			 $gameSystem._variableHudData[i].autoFade = String(Moghunter.variableHud_AutoFade[i]) == "true" ? true : false;
		};
		this._variableHud[i] = new VariableHud(i);
	    this._variableHud[i].z = 126;		
	    this._variableHudField.addChild(this._variableHud[i]);			
	};
};

//=============================================================================
// ** Variable Hud
//=============================================================================
function VariableHud() {
    this.initialize.apply(this, arguments);
};

VariableHud.prototype = Object.create(Sprite.prototype);
VariableHud.prototype.constructor = VariableHud;

//==============================
// * Initialize
//==============================
VariableHud.prototype.initialize = function(index) {
    Sprite.prototype.initialize.call(this);
	this._index = index;
	this._enabled = String(Moghunter.variableHud_Visible[this._index]) === "true" ? true : false;
	this._smartFade = String(Moghunter.variableHud_smartFade) === "true" ? true : false;
    if (this._enabled) {this.createSprites()};
	this.visible = false
};


//==============================
// * data Sys
//==============================
VariableHud.prototype.dataSys = function() {	
    return $gameSystem._variableHudData[this._index];
};

//==============================
// * Variable ID
//==============================
VariableHud.prototype.variableID = function() {	
    return Moghunter.variableHud_VariableID[this._index]
};

//==============================
// * max Value
//==============================
VariableHud.prototype.maxValue = function() {	
    return this.dataSys().maxValue;
};

//==============================
// * show Max
//==============================
VariableHud.prototype.showMax = function() {
   return this.dataSys().showMax;
};

//==============================
// * show Gauge 
//==============================
VariableHud.prototype.showGauge = function() {
   return this.dataSys().gauge;
};

//==============================
// * Type
//==============================
VariableHud.prototype.type = function() {
   return Moghunter.variableHud_Type[this._index];
};

//==============================
// * Number
//==============================
VariableHud.prototype.number = function() {
	return this.type() === 0 ? $gameVariables.value(this.variableID()) : $gameParty.numItems(this.item());
};

//==============================
// * item
//==============================
VariableHud.prototype.item = function() {
	return $dataItems[this.variableID()];
};

//==============================
// * Create Sprites
//==============================
VariableHud.prototype.createSprites = function() {
     this._variable = $gameVariables.value(this.variableID());
	 this._hud_size = [-1,0,0,0];
	 this.x = Number(Moghunter.variableHud_LayX[this._index]);
	 this.y = Number(Moghunter.variableHud_LayY[this._index]);
     this.createLayout();
	 if (this.showGauge()) {this.createGauge()};
	 this.createNumber();
	 this.refreshHud();
	 this._maxValue = this.maxValue();	
};

//==============================
// * Create Layout
//==============================
VariableHud.prototype.createLayout = function() {
	 var fileName = String(Moghunter.variableHud_FileName[this._index]);
     this._layout = new Sprite(ImageManager.loadVariableHud(fileName));
	 this.addChild(this._layout);
};

//==============================
// * Create Gauge
//==============================
VariableHud.prototype.createGauge = function() {
	 var fileName = String(Moghunter.variableHud_FileName[this._index] + "_gauge");
     this._gaugeImg = ImageManager.loadVariableHud(fileName)
	 this._gauge = new Sprite(this._gaugeImg);
	 this._gauge.x = this.dataSys().gaugeX;
	 this._gauge.y = this.dataSys().gaugeY;
	 this.addChild(this._gauge);
	 this.refreshGauge();
};

//==============================
// * refresh Gauge
//==============================
VariableHud.prototype.refreshGauge = function() {
    var wd = this._gaugeImg.width * this._variable / this.maxValue();
	var ch = this._gaugeImg.height;
	this._gauge.setFrame(0,0,wd,ch);
};

//==============================
// * Create Number
//==============================
VariableHud.prototype.createNumber = function() {
     this._number = new Sprite(new Bitmap(200,46));
	 this._number.x = Number(Moghunter.variableHud_NumX[this._index]);
	 this._number.y = Number(Moghunter.variableHud_NumY[this._index]);
	 this._number.bitmap.fontSize = Moghunter.variableHud_NumFontSize[this._index]
	 this.addChild(this._number);
};

//==============================
// * Refresh Number
//==============================
VariableHud.prototype.refreshNumber = function() {	
    this._number.bitmap.clear();	
 	var maxv = (Math.abs(this.maxValue()).toString().split("")); 
	var maxv2 = Number(maxv.length);
	var text = this.showMax() ? (this._variable).padZero(maxv2) + "/" + this.maxValue() : String(this._variable);
	this._number.bitmap.drawText(text,0,0,190,44,this.aligntype());
};

//==============================
// * Refresh Hud
//==============================
VariableHud.prototype.refreshHud = function() {
	if (this.type() === 0) {
		if (this.number() > this.maxValue()) {
			$gameVariables.setValue(this.variableID(), this.maxValue());
		};
	};
	this._variable = this.number();
	this._maxValue = this.maxValue();
	$gameSystem._variableHudData[this._index].needRefresh = false
	this.refreshNumber();
	if (this._gauge) {this.refreshGauge()};
};

//==============================
// * need Refresh Hud
//==============================
VariableHud.prototype.needRefreshHud = function() {
	if (this._variable != this.number()) {return true};
	if (this._maxValue != this.maxValue()) {return true};
	return false
};

//==============================
// * Align Type
//==============================
VariableHud.prototype.aligntype = function() {
   if (Moghunter.variableHud_NumAlign[this._index] === 0) {return "left"    
   } else if (Moghunter.variableHud_NumAlign[this._index] === 1) {return "center"
   } else {return "right"};
};

//==============================
// * Update
//==============================
VariableHud.prototype.update = function() {
    Sprite.prototype.update.call(this);
    if (this._enabled) {this.updateSprites()};
	if (this.needHide()) {
	    this.visible = false;
	} else {
	    this.visible = true;
	};
};

//==============================
// * Need Hide
//==============================
VariableHud.prototype.needHide = function() {
    if ($gameMessage.isBusy() && $gameSystem._variableHudData[this._index].autoFade) {return true};
	if ($gameSystem._variableHudData[this._index] && !$gameSystem._variableHudData[this._index].visible) {return true};
	if (Imported.MOG_ChronoEngine && $gameSystem.isChronoMode()) {return true};
	return false
};

//==============================
// * Need Fade
//==============================
VariableHud.prototype.needFade = function() {
	if (!this._smartFade) {return false};
    if (this._hud_size[0] === -1) {return false};
	if ($gamePlayer.screen_realX() < this._hud_size[0]) {return false};
	if ($gamePlayer.screen_realX() > this._hud_size[2]) {return false};
	if ($gamePlayer.screen_realY() < this._hud_size[1]) {return false};
	if ($gamePlayer.screen_realY() > this._hud_size[3]) {return false};	
    return true;
};

//==============================
// * get Data
//==============================
VariableHud.prototype.getData = function() {
	  this._hud_size[0] =  this.x - ($gameMap.tileWidth() / 2);
	  this._hud_size[1] =  this.y - ($gameMap.tileHeight() / 2);
	  this._hud_size[2] =  this.x + this._layout.bitmap.width;
	  this._hud_size[3] =  this.y + this._layout.bitmap.height;
};

//==============================
// * Update Visible
//==============================
VariableHud.prototype.updateVisible = function() {
	 if (this.needFade()) {
		 if (this.opacity > 90) {
			 this.opacity -= 10;
		     if (this.opacity < 90) {this.opacity = 90};
		 };
	 } else {
		 this.opacity += 10;
	 };
};

//==============================
// * Update Sprites
//==============================
VariableHud.prototype.updateSprites = function() {
    if (this.needRefreshHud()) {this.refreshHud()};
	if (this._layout.bitmap.isReady()) {
			this.visible = true;
		if (this._hud_size[0] === -1) {this.getData()};
	};
	this.updateVisible();
};