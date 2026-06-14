/*:
 * @target MZ
 * @plugindesc Adds customizable lighting effects to events with various patterns and controls, featuring enhanced bloom effects for a more heavenly glow.
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_RaveLighting.js
 *
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * PSYCHRONIC_RaveLighting.js allows you to add dynamic and customizable
 * lighting effects to events within your RPG Maker MZ game. With support for
 * various light types and patterns, along with the ability to define custom
 * light behaviors, you can create immersive environments and atmospheres.
 *
 * This plugin provides THREE ways to add lights:
 * 1. Event Notes - Static lights defined in event note boxes
 * 2. Plugin Parameters - Configure a light that follows the player
 * 3. Plugin Commands - Dynamically add/remove lights during gameplay
 *
 * ============================================================================
 * Event Note Syntax (For Static Lights on Events)
 * ============================================================================
 *
 * To add a lighting effect to an event, use the following syntax in the
 * event's note box:
 *
 * [lightType] [required parameters] [optional offsetX offsetY] [ID]
 *
 * Components:
 * - lightType: The type of light (light, pulsate, flicker, flashlight,
 *              phase, fire, beam, or any custom type name)
 * - required parameters: Specific to each light type (see below)
 * - offsetX/offsetY: (OPTIONAL) Pixel offset from event position
 * - ID: Unique identifier for this light (used for on/off commands)
 *
 * ============================================================================
 * Light Types and Parameters
 * ============================================================================
 *
 * LIGHT (Standard circular light)
 * --------------------------------
 * Syntax: light [radius] [color] [offsetX] [offsetY] [ID]
 * Minimal: light [radius] [color] [ID]
 *
 * Example: light 300 #FFFFFF 1
 * Example with offset: light 300 #FFFFFF 0 -20 1
 *
 * Parameters:
 * - radius: Size in pixels (e.g., 300)
 * - color: Hex color code (e.g., #FFFFFF for white, #FF0000 for red)
 * - offsetX/Y: Optional position adjustment
 * - ID: Light identifier
 *
 * PULSATE (Growing/shrinking light)
 * ---------------------------------
 * Syntax: pulsate [color] [speed] [minRadius] [maxRadius] [offsetX] [offsetY] [ID]
 * Minimal: pulsate [color] [speed] [minRadius] [maxRadius] [ID]
 *
 * Example: pulsate #FF0000 0.5 250 350 2
 * Example with offset: pulsate #FF0000 0.5 250 350 10 0 2
 *
 * Parameters:
 * - color: Hex color code
 * - speed: How fast it pulsates (0.5 = moderate)
 * - minRadius: Smallest size in pixels
 * - maxRadius: Largest size in pixels
 * - offsetX/Y: Optional position adjustment
 * - ID: Light identifier
 *
 * FLICKER (Random opacity changes)
 * --------------------------------
 * Syntax: flicker [radius] [color] [interval] [offsetX] [offsetY] [ID]
 * Minimal: flicker [radius] [color] [interval] [ID]
 *
 * Example: flicker 300 #FFAA00 120 3
 * Example with offset: flicker 300 #FFAA00 120 0 15 3
 *
 * Parameters:
 * - radius: Size in pixels
 * - color: Hex color code
 * - interval: Frames between flicker changes (60 = 1 second at 60fps)
 * - offsetX/Y: Optional position adjustment
 * - ID: Light identifier
 *
 * FLASHLIGHT (Directional cone beam)
 * ----------------------------------
 * Syntax: flashlight [widthSquares] [lengthSquares] [color] [offsetX] [offsetY] [ID]
 * Minimal: flashlight [widthSquares] [lengthSquares] [color] [ID]
 *
 * Example: flashlight 8 12 #FFFFFF 4
 * Example with offset: flashlight 8 12 #FFFFFF 0 10 4
 *
 * Parameters:
 * - widthSquares: Cone width in map tiles (1 tile = 48 pixels)
 * - lengthSquares: Cone length in map tiles
 * - color: Hex color code
 * - offsetX/Y: Optional position adjustment (default Y is 24)
 * - ID: Light identifier
 *
 * NOTE: Flashlight faces the character's direction by default. Use the
 * "Set Flashlight Target" commands to make it track the player or an event.
 *
 * PHASE (Color-cycling light)
 * ---------------------------
 * Syntax: phase [radius] [speed] [color1] [color2] [...colors] [offsetX] [offsetY] [ID]
 * Minimal: phase [radius] [speed] [color1] [color2] [ID]
 *
 * Example: phase 300 20 #0000FF #FF0000 5
 * Example with 3 colors: phase 300 30 #FF0000 #00FF00 #0000FF 5
 * Example with offset: phase 300 20 #0000FF #FF0000 100 50 5
 *
 * Parameters:
 * - radius: Size in pixels
 * - speed: Frames per color transition (lower = faster)
 * - colors: Two or more hex color codes to cycle through
 * - offsetX/Y: Optional position adjustment
 * - ID: Light identifier
 *
 * FIRE (Realistic fire effect)
 * -----------------------------
 * Syntax: fire [radius] [color] [flickerSpeed] [minAlpha] [maxAlpha] [offsetX] [offsetY] [ID]
 * Minimal: fire [radius] [color] [ID]
 *
 * Example: fire 300 #FF6600 6
 * Example full: fire 300 #FF6600 2 0.5 0.9 0 0 6
 * Example with offset: fire 300 #FF6600 2 0.5 0.9 0 -10 6
 *
 * Parameters:
 * - radius: Size in pixels
 * - color: Hex color code (orange/red recommended for fire)
 * - flickerSpeed: How fast it flickers (2.0 = default)
 * - minAlpha: Minimum opacity 0.0-1.0 (0.5 = default)
 * - maxAlpha: Maximum opacity 0.0-1.0 (0.9 = default)
 * - offsetX/Y: Optional position adjustment
 * - ID: Light identifier
 *
 * BEAM (Directional light beam)
 * ------------------------------
 * Syntax: beam [width] [length] [opacity] [colorSpeed] [count] [spinRate] [colors...] [offsetX] [offsetY] [ID]
 * Minimal: beam [width] [length] [opacity] [colorSpeed] [count] [spinRate] [color] [ID]
 *
 * Example: beam 50 200 1.0 0 1 0 #FFFFFF 7
 * Example spinning: beam 50 200 1.0 0 3 2 #FFFFFF 7
 * Example with colors: beam 50 200 1.0 60 1 0 #FF0000 #00FF00 7
 * Example with offset: beam 50 200 1.0 0 1 0 #FFFFFF 0 10 7
 *
 * Parameters:
 * - width: Beam width in pixels
 * - length: Beam length in pixels
 * - opacity: 0.0-1.0 (1.0 = fully visible)
 * - colorSpeed: Frames for color cycling (0 = no color change)
 * - count: Number of beams (multiple beams spread evenly in circle)
 * - spinRate: Degrees per frame rotation (0 = faces character direction)
 * - colors: One or more hex color codes
 * - offsetX/Y: Optional position adjustment
 * - ID: Light identifier
 *
 * NOTE: Beam faces the character's direction by default. Use spinRate > 0
 * for spinning beams, or use "Set Beam Target" commands for tracking.
 *
 * ============================================================================
 * Player Light Configuration
 * ============================================================================
 *
 * In Plugin Parameters, find "Player Light Settings" to configure a light
 * that automatically follows the player:
 *
 * 1. Set "Enable Player Light" to true
 * 2. Choose a "Light Type" from the dropdown
 * 3. Set a "Light ID" (default 999) - use this ID with TurnOnLight/TurnOffLight
 * 4. Configure the settings for your chosen light type
 * 5. Only the settings matching your chosen type will be used
 *
 * The player light is created automatically when the game starts and follows
 * the player everywhere. You can turn it on/off using plugin commands:
 * - TurnOnLight with the Light ID you set
 * - TurnOffLight with the Light ID you set
 *
 * ============================================================================
 * Custom Light Types (Plugin Parameters)
 * ============================================================================
 *
 * Create reusable light combinations in Plugin Parameters under
 * "Custom Light Types":
 *
 * 1. Click "Custom Light Types" array
 * 2. Add a new entry and give it a unique Name (e.g., "Campfire")
 * 3. Add sub-lights using the appropriate arrays:
 *    - "Light Lights" for standard circular lights
 *    - "Pulsate Lights" for pulsating lights
 *    - "Flicker Lights" for flickering lights
 *    - "Flashlight Lights" for flashlight beams
 *    - "Phase Lights" for color-cycling lights
 *    - "Fire Lights" for fire effects
 *    - "Beam Lights" for beam lights
 * 4. Each sub-light has its own parameter fields - no syntax needed!
 *
 * Using Custom Lights in Event Notes:
 * Just type the name and ID: Campfire 1
 *
 * Using Custom Lights in Plugin Commands:
 * Use "Add Custom Light to Character" command with the custom light name
 *
 * Example: A "Campfire" custom light might have:
 * - Fire Lights array: One fire light (radius 250, orange color)
 * - Flicker Lights array: One flicker light (radius 300, yellow color)
 * Both lights will be applied together when you use "Campfire 1"
 *
 * NOTE: When using custom lights via plugin commands, sub-lights get
 * sequential IDs. If base ID is 100 and you have 3 sub-lights, they'll
 * use IDs 100, 101, and 102.
 *
 * ============================================================================
 * Plugin Commands - Dynamic Light Creation
 * ============================================================================
 *
 * Create lights during gameplay without using event notes!
 * All commands use Event ID: 0 = Player, 1+ = Event ID on current map
 *
 * BASIC LIGHT COMMANDS:
 * ---------------------
 * Add Light to Character
 * Add Pulsate Light to Character
 * Add Flicker Light to Character
 * Add Flashlight to Character
 * Add Phase Light to Character
 * Add Fire Light to Character
 * Add Beam Light to Character
 *
 * Each command shows parameter fields - just fill them in!
 * Much easier than remembering syntax!
 *
 * CUSTOM LIGHT COMMAND:
 * ---------------------
 * Add Custom Light to Character
 * - Event ID: Which character gets the light
 * - Custom Light Name: Name from your Plugin Parameters
 * - Light ID: Base ID (sub-lights use sequential IDs)
 *
 * MANAGEMENT COMMANDS:
 * --------------------
 * Remove Light from Character
 * - Removes a specific light by ID
 *
 * Remove All Lights from Character
 * - Clears all dynamic lights from a character
 *
 * TurnOnLight / TurnOffLight
 * - Toggle any light by ID (works for both static and dynamic lights)
 *
 * TRACKING COMMANDS (Beam):
 * -------------------------
 * Set Beam Target Player - Makes a beam track the player
 * Set Beam Target Event - Makes a beam track a specific event
 * Clear Beam Target - Stops beam tracking
 *
 * TRACKING COMMANDS (Flashlight):
 * -------------------------------
 * Set Flashlight Target Player - Makes flashlight track the player
 * Set Flashlight Target Event - Makes flashlight track a specific event
 * Clear Flashlight Target - Stops flashlight tracking
 *
 * ============================================================================
 * Usage Examples
 * ============================================================================
 *
 * EXAMPLE 1: Torch on the Wall (Event Note)
 * ------------------------------------------
 * In the event note box: flicker 280 #FF8800 90 1
 *
 * This creates a flickering orange torch light with:
 * - 280 pixel radius
 * - Orange color
 * - Flickers every 90 frames
 * - ID 1 (use TurnOnLight/TurnOffLight with ID 1)
 *
 * EXAMPLE 2: Police Car Siren (Event Note)
 * -----------------------------------------
 * In the event note box: phase 350 15 #0000FF #FF0000 2
 *
 * This creates a red/blue flashing light:
 * - 350 pixel radius
 * - Changes color every 15 frames (fast!)
 * - Cycles between blue and red
 * - ID 2
 *
 * EXAMPLE 3: Player Holding Lantern (Plugin Parameters)
 * ------------------------------------------------------
 * In Plugin Parameters > Player Light Settings:
 * - Enable: true
 * - Light Type: light
 * - Light ID: 999
 * - Light Settings > Radius: 400
 * - Light Settings > Color: #FFDD88
 * - Light Settings > Offset Y: -10
 *
 * In events, use plugin commands:
 * - TurnOnLight (ID: 999) when player gets lantern
 * - TurnOffLight (ID: 999) when player loses lantern
 *
 * EXAMPLE 4: Dynamic Flashlight (Plugin Command)
 * -----------------------------------------------
 * Plugin Command: Add Flashlight to Character
 * - Event ID: 0 (player)
 * - Light ID: 50
 * - Width: 8
 * - Length: 12
 * - Color: #FFFFFF
 * - Offset X: 0
 * - Offset Y: 0
 *
 * Then use: Set Flashlight Target Player (ID: 50)
 * Now an enemy's flashlight will always point at the player!
 *
 * EXAMPLE 5: Rotating Disco Ball (Event Note)
 * --------------------------------------------
 * In event note: beam 40 300 0.8 30 12 3 #FF0000 #00FF00 #0000FF 3
 *
 * This creates a spinning multi-colored disco effect:
 * - 40 pixel wide beams
 * - 300 pixel long beams
 * - 80% opacity
 * - Changes colors every 30 frames
 * - 12 beams in a circle
 * - Spins 3 degrees per frame
 * - Cycles through red, green, blue
 * - ID 3
 *
 * EXAMPLE 6: Campfire (Custom Light)
 * -----------------------------------
 * In Plugin Parameters > Custom Light Types:
 * - Name: Campfire
 * - Fire Lights: Add one entry
 *   - Radius: 250
 *   - Color: #FF6600
 *   - Flicker Speed: 2.5
 *   - Min Alpha: 0.6
 *   - Max Alpha: 0.95
 *   - Offset Y: -20
 * - Light Lights: Add one entry
 *   - Radius: 300
 *   - Color: #FFAA44
 *   - Offset Y: -20
 *
 * In event note: Campfire 1
 * Both lights apply at once for a realistic campfire!
 *
 * Or use Plugin Command: Add Custom Light to Character
 * - Event ID: 5
 * - Custom Light Name: Campfire
 * - Light ID: 100
 * This adds the campfire to event 5 (sub-lights use IDs 100 and 101)
 *
 * ============================================================================
 * Tips and Best Practices
 * ============================================================================
 *
 * COLOR CODES:
 * - Use hex color codes: #RRGGBB
 * - Common colors: #FFFFFF (white), #FF0000 (red), #00FF00 (green),
 *   #0000FF (blue), #FFFF00 (yellow), #FF00FF (magenta), #00FFFF (cyan)
 * - Warm light: #FFDD88 (candle), #FF8800 (torch), #FF6600 (fire)
 * - Cool light: #88CCFF (moonlight), #AAAAFF (magic)
 * - Use color picker tools online for perfect colors!
 *
 * LIGHT IDs:
 * - Each light needs a unique ID
 * - Use IDs consistently: 1-100 for static lights, 101-200 for dynamic, etc.
 * - Player light default ID: 999
 * - Use TurnOnLight/TurnOffLight commands to toggle lights by ID
 *
 * PERFORMANCE:
 * - More lights = more processing
 * - Use Light Buffer parameter to control when lights render
 * - Beam lights are more intensive than simple lights
 * - Test on your target hardware!
 *
 * OFFSETS:
 * - Offset X/Y moves light from event center
 * - Positive X = right, Negative X = left
 * - Positive Y = down, Negative Y = up
 * - Use for lights on walls, ceiling fixtures, etc.
 * - Example: offsetY -30 for ceiling light
 *
 * DARKNESS:
 * - Use "Change Screen Color Tone" event command with negative RGB values
 * - Example: R:-255, G:-255, B:-255 for pure darkness
 * - Lights will "cut through" the darkness
 * - Adjust "Darkness Gamma" parameter for darkness intensity
 *
 * TRACKING:
 * - Beam and Flashlight can track player or events
 * - Great for searchlights, enemy vision cones, spotlights
 * - Set target with plugin commands
 * - Clear target to return to normal direction-based rotation
 *
 * CUSTOM LIGHTS:
 * - Perfect for reusable complex effects
 * - Combine multiple light types for unique effects
 * - Name them descriptively: "Campfire", "StreetLamp", "MagicOrb"
 * - Build a library of lights for your game!
 *
 * ============================================================================
 * Notes
 * ============================================================================
 *
 * - Ensure unique IDs for each light to avoid conflicts
 * - Lights are visible only when their containing event is visible
 * - Dynamic lights (from plugin commands) persist until removed
 * - Event note lights are recreated when events reset
 * - Adjust lightBuffer and darknessGamma parameters to fine-tune performance
 * - All lights use additive blending for realistic light overlapping
 *
 * ============================================================================
 * Support
 * ============================================================================
 *
 * For support, updates, and more plugins, visit:
 * https://psychronic.itch.io
 *
 * ============================================================================
 * Changelog
 * ============================================================================
 *
 * Version 1.3.0:
 * - Added player light configuration
 * - Added plugin commands for dynamically creating lights
 * - Added plugin command to apply custom lights to characters
 * - No more syntax memorization needed!
 *
 * Version 1.2.0:
 * - Redesigned plugin parameters for easier custom light creation
 * - Separated parameters by light type for clarity
 * - No more manual syntax typing required
 *
 * Version 1.1.0:
 * - Added support for Custom Light Types.
 * - Enhanced documentation.
 *
 * Version 1.0.0:
 * - Initial release.
 *
 *
 * @param lightBuffer
 * @type number
 * @min 0
 * @default 350
 * @text Light Buffer Size
 * @desc Buffer area in pixels around the screen where lights remain active.
 *
 * @param darknessGamma
 * @type number
 * @decimals 2
 * @min 0
 * @default 0.1
 * @text Darkness Gamma
 * @desc Gamma correction value for darkness. Values >1 make darkness stronger.
 *
 * @param Player Light Settings
 * @type struct<PlayerLight>
 * @default {"Enabled":"false","Light Type":"light","Light Settings":"{}","Pulsate Settings":"{}","Flicker Settings":"{}","Flashlight Settings":"{}","Phase Settings":"{}","Fire Settings":"{}","Beam Settings":"{}"}
 * @text Player Light Settings
 * @desc Configure a light that follows the player.
 *
 * @param Custom Light Types
 * @type struct<CustomLight>[]
 * @default []
 * @text Custom Light Types
 * @desc Define custom (possibly multi) light types with their parameters.
 *
 * @command TurnOnLight
 * @text Turn On Light
 * @desc Turns on the light with the specified ID.
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 * @desc The unique ID of the light you wish to turn on.
 *
 * @command TurnOffLight
 * @text Turn Off Light
 * @desc Turns off the light with the specified ID.
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 * @desc The unique ID of the light you wish to turn off.
 *
 * @command SetBeamTargetPlayer
 * @text Set Beam Target Player
 * @desc Make a beam light track the player.
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @command SetBeamTargetEvent
 * @text Set Beam Target Event
 * @desc Make a beam light track a specific event on the map.
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg eventId
 * @type number
 * @default 1
 * @text Event ID
 * @desc The ID of the event to track.
 *
 * @command ClearBeamTarget
 * @text Clear Beam Target
 * @desc Removes any tracking from the specified beam light.
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @command SetFlashlightTargetPlayer
 * @text Set Flashlight Target Player
 * @desc Make a flashlight light track the player.
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @command SetFlashlightTargetEvent
 * @text Set Flashlight Target Event
 * @desc Make a flashlight light track a specific event on the map.
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg eventId
 * @type number
 * @default 1
 * @text Event ID
 *
 * @command ClearFlashlightTarget
 * @text Clear Flashlight Target
 * @desc Removes any tracking from the specified flashlight light.
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @command AddLightToCharacter
 * @text Add Light to Character
 * @desc Add a standard circular light to an event or player (event ID 0).
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 * @desc 0 = Player, 1+ = Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg radius
 * @type number
 * @min 1
 * @default 300
 * @text Radius
 *
 * @arg color
 * @type text
 * @default #FFFFFF
 * @text Color
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command AddPulsateToCharacter
 * @text Add Pulsate Light to Character
 * @desc Add a pulsating light to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg color
 * @type text
 * @default #FFFFFF
 * @text Color
 *
 * @arg speed
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 0.5
 * @text Speed
 *
 * @arg minRadius
 * @type number
 * @min 1
 * @default 250
 * @text Min Radius
 *
 * @arg maxRadius
 * @type number
 * @min 1
 * @default 350
 * @text Max Radius
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command AddFlickerToCharacter
 * @text Add Flicker Light to Character
 * @desc Add a flickering light to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg radius
 * @type number
 * @min 1
 * @default 300
 * @text Radius
 *
 * @arg color
 * @type text
 * @default #FFFFFF
 * @text Color
 *
 * @arg interval
 * @type number
 * @min 1
 * @default 120
 * @text Interval
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command AddFlashlightToCharacter
 * @text Add Flashlight to Character
 * @desc Add a flashlight cone to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg width
 * @type number
 * @min 1
 * @default 8
 * @text Width (squares)
 *
 * @arg length
 * @type number
 * @min 1
 * @default 12
 * @text Length (squares)
 *
 * @arg color
 * @type text
 * @default #FFFFFF
 * @text Color
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command AddPhaseToCharacter
 * @text Add Phase Light to Character
 * @desc Add a color-cycling phase light to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg radius
 * @type number
 * @min 1
 * @default 300
 * @text Radius
 *
 * @arg speed
 * @type number
 * @min 1
 * @default 60
 * @text Speed (frames)
 *
 * @arg colors
 * @type text[]
 * @default ["#FFFFFF","#FF0000"]
 * @text Colors
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command AddFireToCharacter
 * @text Add Fire Light to Character
 * @desc Add a flickering fire light to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg radius
 * @type number
 * @min 1
 * @default 300
 * @text Radius
 *
 * @arg color
 * @type text
 * @default #FF6600
 * @text Color
 *
 * @arg flickerSpeed
 * @type number
 * @decimals 2
 * @min 0.1
 * @default 2
 * @text Flicker Speed
 *
 * @arg minAlpha
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.5
 * @text Min Alpha
 *
 * @arg maxAlpha
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.9
 * @text Max Alpha
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command AddBeamToCharacter
 * @text Add Beam Light to Character
 * @desc Add a directional beam light to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 *
 * @arg width
 * @type number
 * @min 1
 * @default 50
 * @text Width (pixels)
 *
 * @arg length
 * @type number
 * @min 1
 * @default 200
 * @text Length (pixels)
 *
 * @arg opacity
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 1.0
 * @text Opacity
 *
 * @arg colorSpeed
 * @type number
 * @min 0
 * @default 0
 * @text Color Speed
 *
 * @arg count
 * @type number
 * @min 1
 * @default 1
 * @text Beam Count
 *
 * @arg spinRate
 * @type number
 * @decimals 2
 * @default 0
 * @text Spin Rate
 *
 * @arg colors
 * @type text[]
 * @default ["#FFFFFF"]
 * @text Colors
 *
 * @arg offsetX
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset X
 *
 * @arg offsetY
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @text Offset Y
 *
 * @command RemoveLightFromCharacter
 * @text Remove Light from Character
 * @desc Remove a specific light from an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 * @desc 0 = Player, 1+ = Event ID
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 * @desc The ID of the light to remove.
 *
 * @command RemoveAllLightsFromCharacter
 * @text Remove All Lights from Character
 * @desc Remove all dynamic lights from an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 * @desc 0 = Player, 1+ = Event ID
 *
 * @command AddCustomLightToCharacter
 * @text Add Custom Light to Character
 * @desc Add a custom light type (from plugin parameters) to an event or player.
 *
 * @arg eventId
 * @type number
 * @min 0
 * @default 0
 * @text Event ID
 * @desc 0 = Player, 1+ = Event ID
 *
 * @arg customLightName
 * @type text
 * @default
 * @text Custom Light Name
 * @desc The name of the custom light type defined in plugin parameters.
 *
 * @arg lightId
 * @type number
 * @default 1
 * @text Light ID
 * @desc Base ID for this custom light (sub-lights will use sequential IDs).
 *
 *
 */

/*~struct~PlayerLight:
 * @param Enabled
 * @type boolean
 * @default false
 * @text Enable Player Light
 * @desc Enable a light that follows the player.
 *
 * @param Light Type
 * @type select
 * @option light
 * @option pulsate
 * @option flicker
 * @option flashlight
 * @option phase
 * @option fire
 * @option beam
 * @default light
 * @text Light Type
 * @desc The type of light for the player.
 *
 * @param Light ID
 * @type number
 * @min 1
 * @default 999
 * @text Light ID
 * @desc Unique ID for the player's light (use for toggle commands).
 *
 * @param Light Settings
 * @type struct<LightSubLight>
 * @default {}
 * @text [LIGHT] Settings
 * @desc Settings for standard light type.
 *
 * @param Pulsate Settings
 * @type struct<PulsateSubLight>
 * @default {}
 * @text [PULSATE] Settings
 * @desc Settings for pulsate light type.
 *
 * @param Flicker Settings
 * @type struct<FlickerSubLight>
 * @default {}
 * @text [FLICKER] Settings
 * @desc Settings for flicker light type.
 *
 * @param Flashlight Settings
 * @type struct<FlashlightSubLight>
 * @default {}
 * @text [FLASHLIGHT] Settings
 * @desc Settings for flashlight type.
 *
 * @param Phase Settings
 * @type struct<PhaseSubLight>
 * @default {}
 * @text [PHASE] Settings
 * @desc Settings for phase light type.
 *
 * @param Fire Settings
 * @type struct<FireSubLight>
 * @default {}
 * @text [FIRE] Settings
 * @desc Settings for fire light type.
 *
 * @param Beam Settings
 * @type struct<BeamSubLight>
 * @default {}
 * @text [BEAM] Settings
 * @desc Settings for beam light type.
 */

/*~struct~CustomLight:
 * @param Name
 * @type text
 * @desc The name of the custom light type. Use this name in event notes.
 *
 * @param Light Lights
 * @type struct<LightSubLight>[]
 * @default []
 * @desc Standard circular lights.
 *
 * @param Pulsate Lights
 * @type struct<PulsateSubLight>[]
 * @default []
 * @desc Pulsating lights that grow and shrink.
 *
 * @param Flicker Lights
 * @type struct<FlickerSubLight>[]
 * @default []
 * @desc Flickering lights that change opacity.
 *
 * @param Flashlight Lights
 * @type struct<FlashlightSubLight>[]
 * @default []
 * @desc Cone-shaped flashlight beams.
 *
 * @param Phase Lights
 * @type struct<PhaseSubLight>[]
 * @default []
 * @desc Lights that cycle through multiple colors.
 *
 * @param Fire Lights
 * @type struct<FireSubLight>[]
 * @default []
 * @desc Flickering fire-like lights.
 *
 * @param Beam Lights
 * @type struct<BeamSubLight>[]
 * @default []
 * @desc Directional beam lights.
 */

/*~struct~LightSubLight:
 * @param Radius
 * @type number
 * @min 1
 * @default 300
 * @desc Radius of the light in pixels.
 *
 * @param Color
 * @type text
 * @default #FFFFFF
 * @desc Color of the light (hex format: #RRGGBB).
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

/*~struct~PulsateSubLight:
 * @param Color
 * @type text
 * @default #FFFFFF
 * @desc Color of the pulsating light.
 *
 * @param Speed
 * @type number
 * @decimals 2
 * @min 0.01
 * @default 0.5
 * @desc Speed of pulsation.
 *
 * @param Min Radius
 * @type number
 * @min 1
 * @default 250
 * @desc Minimum radius in pixels.
 *
 * @param Max Radius
 * @type number
 * @min 1
 * @default 350
 * @desc Maximum radius in pixels.
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

/*~struct~FlickerSubLight:
 * @param Radius
 * @type number
 * @min 1
 * @default 300
 * @desc Radius of the flickering light.
 *
 * @param Color
 * @type text
 * @default #FFFFFF
 * @desc Color of the flickering light.
 *
 * @param Interval
 * @type number
 * @min 1
 * @default 120
 * @desc Frames between flicker changes.
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

/*~struct~FlashlightSubLight:
 * @param Width
 * @type number
 * @min 1
 * @default 8
 * @desc Width of cone in tile squares (1 square = 48px).
 *
 * @param Length
 * @type number
 * @min 1
 * @default 12
 * @desc Length of cone in tile squares.
 *
 * @param Color
 * @type text
 * @default #FFFFFF
 * @desc Color of the flashlight beam.
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

/*~struct~PhaseSubLight:
 * @param Radius
 * @type number
 * @min 1
 * @default 300
 * @desc Radius of the phasing light.
 *
 * @param Speed
 * @type number
 * @min 1
 * @default 60
 * @desc Frames per color transition.
 *
 * @param Colors
 * @type text[]
 * @default ["#FFFFFF","#FF0000"]
 * @desc List of colors to cycle through (hex format).
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

/*~struct~FireSubLight:
 * @param Radius
 * @type number
 * @min 1
 * @default 300
 * @desc Radius of the fire light.
 *
 * @param Color
 * @type text
 * @default #FF6600
 * @desc Color of the fire light.
 *
 * @param Flicker Speed
 * @type number
 * @decimals 2
 * @min 0.1
 * @default 2
 * @desc Speed of the flickering effect.
 *
 * @param Min Alpha
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.5
 * @desc Minimum opacity (0.0 to 1.0).
 *
 * @param Max Alpha
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.9
 * @desc Maximum opacity (0.0 to 1.0).
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

/*~struct~BeamSubLight:
 * @param Width
 * @type number
 * @min 1
 * @default 50
 * @desc Width of the beam in pixels.
 *
 * @param Length
 * @type number
 * @min 1
 * @default 200
 * @desc Length of the beam in pixels.
 *
 * @param Opacity
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 1.0
 * @desc Opacity of the beam (0.0 to 1.0).
 *
 * @param Color Speed
 * @type number
 * @min 0
 * @default 0
 * @desc Frames for color transition. 0 = no transition.
 *
 * @param Count
 * @type number
 * @min 1
 * @default 1
 * @desc Number of beams to render.
 *
 * @param Spin Rate
 * @type number
 * @decimals 2
 * @default 0
 * @desc Degrees per frame to rotate. 0 = direction-based.
 *
 * @param Colors
 * @type text[]
 * @default ["#FFFFFF"]
 * @desc Colors for the beam (cycles if speed > 0).
 *
 * @param Offset X
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Horizontal offset in pixels from the event position.
 *
 * @param Offset Y
 * @type number
 * @min -9999
 * @max 9999
 * @default 0
 * @desc Vertical offset in pixels from the event position.
 */

var PsychronicRaveLighting = PsychronicRaveLighting || {};
PsychronicRaveLighting.parameters = PluginManager.parameters('PSYCHRONIC_RaveLighting');

const lightBuffer = Number(PsychronicRaveLighting.parameters['lightBuffer'] || 350);
const darknessGamma = Number(PsychronicRaveLighting.parameters['darknessGamma'] || 0.1);

PsychronicRaveLighting._beamSpriteStorage = new WeakMap();

/**
 * Builds a parameter string from structured plugin parameter fields
 */
function buildParameterString(baseType, params) {
    const offsetX = Number(params['Offset X'] || 0);
    const offsetY = Number(params['Offset Y'] || 0);

    let paramString = '';

    switch(baseType) {
        case 'light':
            const lightRadius = Number(params['Radius'] || 300);
            const lightColor = params['Color'] || '#FFFFFF';
            paramString = `${lightRadius} ${lightColor}`;
            break;

        case 'pulsate':
            const pulsateColor = params['Color'] || '#FFFFFF';
            const pulsateSpeed = Number(params['Speed'] || 0.5);
            const pulsateMin = Number(params['Min Radius'] || 250);
            const pulsateMax = Number(params['Max Radius'] || 350);
            paramString = `${pulsateColor} ${pulsateSpeed} ${pulsateMin} ${pulsateMax}`;
            break;

        case 'flicker':
            const flickerRadius = Number(params['Radius'] || 300);
            const flickerColor = params['Color'] || '#FFFFFF';
            const flickerInterval = Number(params['Interval'] || 120);
            paramString = `${flickerRadius} ${flickerColor} ${flickerInterval}`;
            break;

        case 'flashlight':
            const flashWidth = Number(params['Width'] || 8);
            const flashLength = Number(params['Length'] || 12);
            const flashColor = params['Color'] || '#FFFFFF';
            paramString = `${flashWidth} ${flashLength} ${flashColor}`;
            break;

        case 'phase':
            const phaseRadius = Number(params['Radius'] || 300);
            const phaseSpeed = Number(params['Speed'] || 60);
            let phaseColors = ['#FFFFFF', '#FF0000'];
            try {
                const colorsRaw = JSON.parse(params['Colors'] || '["#FFFFFF","#FF0000"]');
                if (Array.isArray(colorsRaw) && colorsRaw.length >= 2) {
                    phaseColors = colorsRaw;
                }
            } catch(e) {
                console.warn('Error parsing Phase Colors, using defaults');
            }
            paramString = `${phaseRadius} ${phaseSpeed} ${phaseColors.join(' ')}`;
            break;

        case 'fire':
            const fireRadius = Number(params['Radius'] || 300);
            const fireColor = params['Color'] || '#FF6600';
            const fireSpeed = Number(params['Flicker Speed'] || 2);
            const fireMinAlpha = Number(params['Min Alpha'] || 0.5);
            const fireMaxAlpha = Number(params['Max Alpha'] || 0.9);
            paramString = `${fireRadius} ${fireColor} ${fireSpeed} ${fireMinAlpha} ${fireMaxAlpha}`;
            break;

        case 'beam':
            const beamWidth = Number(params['Width'] || 50);
            const beamLength = Number(params['Length'] || 200);
            const beamOpacity = Number(params['Opacity'] || 1.0);
            const beamSpeed = Number(params['Color Speed'] || 0);
            const beamCount = Number(params['Count'] || 1);
            const beamSpin = Number(params['Spin Rate'] || 0);
            let beamColors = ['#FFFFFF'];
            try {
                const colorsRaw = JSON.parse(params['Colors'] || '["#FFFFFF"]');
                if (Array.isArray(colorsRaw) && colorsRaw.length > 0) {
                    beamColors = colorsRaw;
                }
            } catch(e) {
                console.warn('Error parsing Beam Colors, using defaults');
            }
            paramString = `${beamWidth} ${beamLength} ${beamOpacity} ${beamSpeed} ${beamCount} ${beamSpin} ${beamColors.join(' ')}`;
            break;

        default:
            return '';
    }

    paramString += ` ${offsetX} ${offsetY}`;
    return paramString.trim();
}

// Parse player light settings
PsychronicRaveLighting.playerLight = null;
(function() {
    try {
        const playerLightRaw = JSON.parse(PsychronicRaveLighting.parameters['Player Light Settings'] || '{}');
        const enabled = playerLightRaw['Enabled'] === 'true';

        if (enabled) {
            const lightType = (playerLightRaw['Light Type'] || 'light').toLowerCase();
            const lightId = Number(playerLightRaw['Light ID'] || 999);
            const settingsKey = lightType.charAt(0).toUpperCase() + lightType.slice(1) + ' Settings';

            let params = {};
            try {
                params = JSON.parse(playerLightRaw[settingsKey] || '{}');
            } catch(e) {
                console.warn('Error parsing player light settings');
            }

            const paramString = buildParameterString(lightType, params);
            if (paramString) {
                PsychronicRaveLighting.playerLight = {
                    type: lightType,
                    parameters: paramString,
                    lightId: lightId
                };
            }
        }
    } catch(e) {
        console.warn('Error parsing player light configuration:', e);
    }
})();

// Parse custom light types
PsychronicRaveLighting.customLightTypes = {};
(function() {
    const customLightTypesRaw = JSON.parse(PsychronicRaveLighting.parameters['Custom Light Types'] || '[]');

    customLightTypesRaw.forEach(raw => {
        try {
            const customLight = JSON.parse(raw);
            const name = (customLight['Name'] || '').trim().toLowerCase();
            let subLights = [];

            const lightTypes = [
                { key: 'Light Lights', type: 'light' },
                { key: 'Pulsate Lights', type: 'pulsate' },
                { key: 'Flicker Lights', type: 'flicker' },
                { key: 'Flashlight Lights', type: 'flashlight' },
                { key: 'Phase Lights', type: 'phase' },
                { key: 'Fire Lights', type: 'fire' },
                { key: 'Beam Lights', type: 'beam' }
            ];

            lightTypes.forEach(({ key, type }) => {
                if (customLight[key]) {
                    try {
                        const lightsArray = JSON.parse(customLight[key]);
                        lightsArray.forEach(lightRaw => {
                            const lightParams = JSON.parse(lightRaw);
                            const params = buildParameterString(type, lightParams);
                            if (params) {
                                subLights.push({ baseType: type, parameters: params });
                            }
                        });
                    } catch(e) {
                        console.warn(`Error parsing ${key}:`, e);
                    }
                }
            });

            if (name && subLights.length > 0) {
                PsychronicRaveLighting.customLightTypes[name] = subLights;
            }

        } catch (e) {
            console.warn(`PSYCHRONIC_RaveLighting: Error parsing custom light type: ${e}`);
        }
    });
})();

PsychronicRaveLighting._flickerPatterns = [
    0.25, 0.35, 0.20, 0.40, 0.30, 0.45, 0.15, 0.38, 0.28, 0.33,
0.22, 0.37, 0.18, 0.42, 0.32, 0.24, 0.17, 0.40, 0.27, 0.35,
0.19, 0.34, 0.23, 0.39, 0.29, 0.31, 0.16, 0.36, 0.26, 0.31
];

// Define ConfigManager property for lighting effects option
// This allows the lighting to be controlled via the options menu
// First, preserve any existing value that MegaOptions may have already set
const _existingLightingValue = ConfigManager.lightingEffects;

// Delete any existing property before defining our own
if (ConfigManager.hasOwnProperty('lightingEffects')) {
    delete ConfigManager.lightingEffects;
}

Object.defineProperty(ConfigManager, 'lightingEffects', {
    get: function() {
        return this._lightingEffects;
    },
    set: function(value) {
        this._lightingEffects = value;
    },
    configurable: true
});

// Restore the existing value if MegaOptions already set one
if (_existingLightingValue !== undefined) {
    ConfigManager._lightingEffects = _existingLightingValue;
}

// Hook into ConfigManager to save lightingEffects
const _ConfigManager_makeData_RaveLighting = ConfigManager.makeData;
ConfigManager.makeData = function() {
    const config = _ConfigManager_makeData_RaveLighting.call(this);
    config.lightingEffects = this.lightingEffects;
    return config;
};

// Hook into ConfigManager to load lightingEffects
const _ConfigManager_applyData_RaveLighting = ConfigManager.applyData;
ConfigManager.applyData = function(config) {
    _ConfigManager_applyData_RaveLighting.call(this, config);

    // Only load if the value exists in config
    // If it doesn't exist, MegaOptions will apply the default from the option definition
    if (config.lightingEffects !== undefined) {
        this.lightingEffects = config.lightingEffects;
    }
};

// Register all plugin commands
PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'TurnOnLight', args => {
    const lightId = Number(args.lightId);
    $gameSystem.turnOnLight(lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'TurnOffLight', args => {
    const lightId = Number(args.lightId);
    $gameSystem.turnOffLight(lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'SetBeamTargetPlayer', args => {
    const lightId = Number(args.lightId);
    $gameSystem.setBeamTracking(lightId, 'player', null);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'SetBeamTargetEvent', args => {
    const lightId = Number(args.lightId);
    const eventId = Number(args.eventId);
    $gameSystem.setBeamTracking(lightId, 'event', eventId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'ClearBeamTarget', args => {
    const lightId = Number(args.lightId);
    $gameSystem.setBeamTracking(lightId, 'none', null);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'SetFlashlightTargetPlayer', args => {
    const lightId = Number(args.lightId);
    $gameSystem.setFlashlightTracking(lightId, 'player', null);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'SetFlashlightTargetEvent', args => {
    const lightId = Number(args.lightId);
    const eventId = Number(args.eventId);
    $gameSystem.setFlashlightTracking(lightId, 'event', eventId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'ClearFlashlightTarget', args => {
    const lightId = Number(args.lightId);
    $gameSystem.setFlashlightTracking(lightId, 'none', null);
});

// Dynamic light creation commands
PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddLightToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Radius': args.radius,
        'Color': args.color,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('light', params);
    $gameSystem.addDynamicLight(eventId, 'light', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddPulsateToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Color': args.color,
        'Speed': args.speed,
        'Min Radius': args.minRadius,
        'Max Radius': args.maxRadius,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('pulsate', params);
    $gameSystem.addDynamicLight(eventId, 'pulsate', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddFlickerToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Radius': args.radius,
        'Color': args.color,
        'Interval': args.interval,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('flicker', params);
    $gameSystem.addDynamicLight(eventId, 'flicker', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddFlashlightToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Width': args.width,
        'Length': args.length,
        'Color': args.color,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('flashlight', params);
    $gameSystem.addDynamicLight(eventId, 'flashlight', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddPhaseToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Radius': args.radius,
        'Speed': args.speed,
        'Colors': args.colors,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('phase', params);
    $gameSystem.addDynamicLight(eventId, 'phase', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddFireToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Radius': args.radius,
        'Color': args.color,
        'Flicker Speed': args.flickerSpeed,
        'Min Alpha': args.minAlpha,
        'Max Alpha': args.maxAlpha,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('fire', params);
    $gameSystem.addDynamicLight(eventId, 'fire', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddBeamToCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    const params = {
        'Width': args.width,
        'Length': args.length,
        'Opacity': args.opacity,
        'Color Speed': args.colorSpeed,
        'Count': args.count,
        'Spin Rate': args.spinRate,
        'Colors': args.colors,
        'Offset X': args.offsetX,
        'Offset Y': args.offsetY
    };
    const paramString = buildParameterString('beam', params);
    $gameSystem.addDynamicLight(eventId, 'beam', paramString, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'RemoveLightFromCharacter', args => {
    const eventId = Number(args.eventId);
    const lightId = Number(args.lightId);
    $gameSystem.removeDynamicLight(eventId, lightId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'RemoveAllLightsFromCharacter', args => {
    const eventId = Number(args.eventId);
    $gameSystem.removeAllDynamicLights(eventId);
});

PluginManager.registerCommand('PSYCHRONIC_RaveLighting', 'AddCustomLightToCharacter', args => {
    const eventId = Number(args.eventId);
    const customLightName = (args.customLightName || '').trim().toLowerCase();
    let lightId = Number(args.lightId) || 1;

    // Look up the custom light definition
    const customLightDef = PsychronicRaveLighting.customLightTypes[customLightName];

    if (!customLightDef) {
        console.warn(`PSYCHRONIC_RaveLighting: Custom light "${customLightName}" not found!`);
        return;
    }

    // Add each sub-light from the custom light definition
    customLightDef.forEach((subLight, index) => {
        const subLightId = lightId + index;
        $gameSystem.addDynamicLight(eventId, subLight.baseType, subLight.parameters, subLightId);
    });
});

(function(){
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._activeLights = {};
        this._beamTracking = {};
        this._flashlightTracking = {};
        this._dynamicLights = {};
    };

    Game_System.prototype.turnOnLight = function(lightId) {
        this._activeLights[lightId] = true;
    };

    Game_System.prototype.turnOffLight = function(lightId) {
        this._activeLights[lightId] = false;

        const spriteset = SceneManager._scene && SceneManager._scene._spriteset;
        if (!spriteset) return;

        for (const ev of $gameMap.events()) {
            if (!ev._lights) continue;
            for (const cfg of ev._lights) {
                if (cfg._lightId === lightId && cfg._lightType === 'beam') {
                    const beamSprites = PsychronicRaveLighting._beamSpriteStorage.get(cfg);
                    if (!beamSprites) continue;
                    for (const spr of beamSprites) {
                        spr.visible = false;
                        if (spr.parent === spriteset._lightContainer) {
                            spriteset._lightContainer.removeChild(spr);
                        }
                    }
                }
            }
        }
    };

    Game_System.prototype.isLightOn = function(lightId) {
        return this._activeLights[lightId] !== false;
    };

    Game_System.prototype.setBeamTracking = function(lightId, trackType, trackId) {
        if (!this._beamTracking) this._beamTracking = {};
        this._beamTracking[lightId] = {type: trackType, id: trackId};
    };

    Game_System.prototype.getBeamTracking = function(lightId) {
        if (!this._beamTracking) this._beamTracking = {};
        return this._beamTracking[lightId] || {type:'none', id:null};
    };

    Game_System.prototype.setFlashlightTracking = function(lightId, trackType, trackId) {
        if (!this._flashlightTracking) this._flashlightTracking = {};
        this._flashlightTracking[lightId] = {type: trackType, id: trackId};
    };

    Game_System.prototype.getFlashlightTracking = function(lightId) {
        if (!this._flashlightTracking) this._flashlightTracking = {};
        return this._flashlightTracking[lightId] || {type:'none', id:null};
    };

    Game_System.prototype.addDynamicLight = function(eventId, lightType, parameters, lightId) {
        if (!this._dynamicLights) this._dynamicLights = {};
        if (!this._dynamicLights[eventId]) this._dynamicLights[eventId] = [];

        this._dynamicLights[eventId].push({
            type: lightType,
            parameters: parameters,
            lightId: lightId
        });

        // Force refresh the character's lights
        const character = eventId === 0 ? $gamePlayer : $gameMap.event(eventId);
        if (character) {
            character.refreshDynamicLights();
        }
    };

    Game_System.prototype.removeDynamicLight = function(eventId, lightId) {
        if (!this._dynamicLights || !this._dynamicLights[eventId]) return;

        this._dynamicLights[eventId] = this._dynamicLights[eventId].filter(light => light.lightId !== lightId);

        const character = eventId === 0 ? $gamePlayer : $gameMap.event(eventId);
        if (character) {
            character.refreshDynamicLights();
        }
    };

    Game_System.prototype.removeAllDynamicLights = function(eventId) {
        if (!this._dynamicLights) return;

        this._dynamicLights[eventId] = [];

        const character = eventId === 0 ? $gamePlayer : $gameMap.event(eventId);
        if (character) {
            character.refreshDynamicLights();
        }
    };

    Game_System.prototype.getDynamicLights = function(eventId) {
        if (!this._dynamicLights) this._dynamicLights = {};
        return this._dynamicLights[eventId] || [];
    };
})();

// Create shared parseLightTokens function
PsychronicRaveLighting.parseLightTokens = function(tokens) {
    const t = tokens[0];
    const config = {
        _lightType: t,
        _lightRadius: 0,
        _lightColor: '',
        _lightId: 1,
        _coneWidthSquares: 0,
        _coneLengthSquares: 0,
        _coneWidthPx: 0,
        _coneLengthPx: 0,
        _phaseColors: [],
        _phaseSpeed: 60,
        _phaseCurrentIndex: 0,
        _phaseTransitionProgress: 0,
        _flickerInterval: 120,
        _pulsateSpeed: 0.5,
        _pulsateMinRadius: 250,
        _pulsateMaxRadius: 350,
        _pulsateOffsetX: 0,
        _pulsateOffsetY: 0,
        _offsetX: 0,
        _offsetY: 0,
        _fireFlickerSpeed: 2,
        _fireMinAlpha: 0.3,
        _fireMaxAlpha: 0.6,
        _fireOffsetX: 0,
        _fireOffsetY: 0,
        _beamWidth: 0,
        _beamLength: 0,
        _beamOpacity: 1.0,
        _beamSpeed: 0,
        _beamNumberOfBeams: 1,
        _beamColors: [],
        _beamOffsetX: 0,
        _beamOffsetY: 0,
        _beamSpinRate: 0,
        _beamSpinRadians: 0,
        _lightOffsetX: 0,
        _lightOffsetY: 0
    };

    function parseOffsetsAndId(tokens, startIndex, config, offsetXKey, offsetYKey, idKey) {
        let endIndex = tokens.length - 1;
        let parsedCount = 0;
        let potentialId, potentialOffsetY, potentialOffsetX;

        if (endIndex >= startIndex) {
            let val = Number(tokens[endIndex]);
            if (!isNaN(val)) {
                potentialId = val;
                endIndex--;
                parsedCount++;
            }
        }

        if (endIndex >= startIndex) {
            let val = Number(tokens[endIndex]);
            if (!isNaN(val)) {
                potentialOffsetY = val;
                endIndex--;
                parsedCount++;
            }
        }

        if (endIndex >= startIndex) {
            let val = Number(tokens[endIndex]);
            if (!isNaN(val)) {
                potentialOffsetX = val;
                endIndex--;
                parsedCount++;
            }
        }

        if (idKey && potentialId != null) {
            config[idKey] = potentialId;
        }
        if (offsetXKey && potentialOffsetX != null) {
            config[offsetXKey] = potentialOffsetX;
        }
        if (offsetYKey && potentialOffsetY != null) {
            config[offsetYKey] = potentialOffsetY;
        }

        return {endIndex, parsedCount};
    }

    switch (t) {
        case 'beam':
            if (tokens.length >= 7) {
                config._beamWidth = Number(tokens[1]) || 50;
                config._beamLength = Number(tokens[2]) || 200;
                config._beamOpacity = Number(tokens[3]) || 1.0;
                config._beamSpeed = Number(tokens[4]) || 0;
                config._beamNumberOfBeams = Number(tokens[5]) || 1;
                let indexAfterBasics = 6;

                let potentialSpin = Number(tokens[indexAfterBasics]);
                if (!isNaN(potentialSpin) && !/^#[0-9A-Fa-f]{6}$/.test(tokens[indexAfterBasics])) {
                    config._beamSpinRate = potentialSpin;
                    indexAfterBasics++;
                }

                let colorStartIndex = indexAfterBasics;
                let {endIndex} = parseOffsetsAndId(tokens, colorStartIndex, config, '_beamOffsetX', '_beamOffsetY', '_lightId');

                for (let i = colorStartIndex; i <= endIndex; i++) {
                    if (/^#[0-9A-Fa-f]{6}$/.test(tokens[i])) {
                        config._beamColors.push(tokens[i]);
                    }
                }

                if (config._beamColors.length === 0) {
                    config._beamColors.push('#FFFFFF');
                }
            } else {
                config._beamWidth = 50;
                config._beamLength = 200;
                config._beamOpacity = 1.0;
                config._beamSpeed = 0;
                config._beamNumberOfBeams = 1;
                config._beamColors = ['#FFFFFF'];
                config._beamOffsetX = 0;
                config._beamOffsetY = 0;
                config._lightId = 1;
                config._beamSpinRate = 0;
            }
            break;

        case 'flashlight':
            if (tokens.length >= 4) {
                config._coneWidthSquares = Number(tokens[1]) || 8;
                config._coneLengthSquares = Number(tokens[2]) || 12;
                config._lightColor = /^#[0-9A-Fa-f]{6}$/.test(tokens[3]) ? tokens[3] : '#FFFFFF';

                if (tokens.length > 4) {
                    let startIndex = 4;
                    let {endIndex, parsedCount} = parseOffsetsAndId(tokens, startIndex, config, '_offsetX', '_offsetY', '_lightId');
                }

                if (isNaN(config._offsetX)) config._offsetX = 0;
                if (isNaN(config._offsetY)) config._offsetY = 24;
                config._coneWidthPx = config._coneWidthSquares * 48;
                config._coneLengthPx = config._coneLengthSquares * 48;
            } else {
                config._coneWidthSquares = 8;
                config._coneLengthSquares = 12;
                config._lightColor = '#FFFFFF';
                config._lightId = 1;
                config._offsetX = 0;
                config._offsetY = 24;
                config._coneWidthPx = 8*48;
                config._coneLengthPx = 12*48;
            }
            break;

        case 'phase':
            if (tokens.length >= 5) {
                config._lightRadius = Number(tokens[1]) || 300;
                config._phaseSpeed = Number(tokens[2]) || 60;

                let potentialIdIndex = tokens.length - 1;
                let potentialOffsetYIndex = tokens.length - 2;
                let potentialOffsetXIndex = tokens.length - 3;

                let potentialId = Number(tokens[potentialIdIndex]);
                let potentialOffsetY = Number(tokens[potentialOffsetYIndex]);
                let potentialOffsetX = Number(tokens[potentialOffsetXIndex]);

                let hasOffsets = (!isNaN(potentialOffsetX) && !isNaN(potentialOffsetY) && !isNaN(potentialId));

                let colorEndIndex;
                if (hasOffsets) {
                    config._offsetX = potentialOffsetX;
                    config._offsetY = potentialOffsetY;
                    config._lightId = potentialId;
                    colorEndIndex = tokens.length - 3;
                } else {
                    config._offsetX = 0;
                    config._offsetY = 0;
                    config._lightId = isNaN(potentialId) ? 1 : potentialId;
                    colorEndIndex = tokens.length - 1;
                }

                for (let i = 3; i < colorEndIndex; i++) {
                    if (/^#[0-9A-Fa-f]{6}$/.test(tokens[i])) {
                        config._phaseColors.push(tokens[i]);
                    }
                }

                if (config._phaseColors.length < 2) {
                    config._phaseColors = ['#FFFFFF','#FFFFFF'];
                }
            } else {
                config._lightRadius = 300;
                config._phaseSpeed = 60;
                config._phaseColors = ['#FFFFFF','#FFFFFF'];
                config._lightId = 1;
                config._offsetX = 0;
                config._offsetY = 0;
            }
            break;

        case 'pulsate':
            if (tokens.length >= 6) {
                config._lightColor = /^#[0-9A-Fa-f]{6}$/.test(tokens[1]) ? tokens[1] : '#FFFFFF';
                config._pulsateSpeed = Number(tokens[2]) || 0.5;
                config._pulsateMinRadius = Number(tokens[3]) || 250;
                config._pulsateMaxRadius = Number(tokens[4]) || 350;

                let remaining = tokens.slice(5);
                let potentialId = Number(remaining[remaining.length-1]);
                let potentialOffsetY = Number(remaining[remaining.length-2]);
                let potentialOffsetX = Number(remaining[remaining.length-3]);

                if (!isNaN(potentialOffsetX) && !isNaN(potentialOffsetY) && !isNaN(potentialId) && remaining.length >= 3) {
                    config._pulsateOffsetX = potentialOffsetX;
                    config._pulsateOffsetY = potentialOffsetY;
                    config._lightId = potentialId;
                } else {
                    config._pulsateOffsetX = 0;
                    config._pulsateOffsetY = 0;

                    if (!isNaN(potentialId)) {
                        config._lightId = potentialId;
                    } else {
                        config._lightId = 1;
                    }
                }
            } else {
                config._lightColor = '#FFFFFF';
                config._pulsateSpeed = 0.5;
                config._pulsateMinRadius = 250;
                config._pulsateMaxRadius = 350;
                config._pulsateOffsetX = 0;
                config._pulsateOffsetY = 0;
                config._lightId = 1;
            }
            break;

        case 'light':
            if (tokens.length >= 4) {
                config._lightRadius = Number(tokens[1]) || 300;
                config._lightColor = /^#[0-9A-Fa-f]{6}$/.test(tokens[2]) ? tokens[2] : '#FFFFFF';

                let potentialId = Number(tokens[tokens.length - 1]);
                let potentialOffsetY = Number(tokens[tokens.length - 2]);
                let potentialOffsetX = Number(tokens[tokens.length - 3]);

                if (!isNaN(potentialOffsetX) && !isNaN(potentialOffsetY) && !isNaN(potentialId) && tokens.length >= 5) {
                    config._lightOffsetX = potentialOffsetX;
                    config._lightOffsetY = potentialOffsetY;
                    config._lightId = potentialId;
                } else {
                    config._lightOffsetX = 0;
                    config._lightOffsetY = 0;
                    if (!isNaN(potentialId)) {
                        config._lightId = potentialId;
                    } else {
                        config._lightId = 1;
                    }
                }
            } else {
                config._lightRadius = 300;
                config._lightColor = '#FFFFFF';
                config._lightOffsetX = 0;
                config._lightOffsetY = 0;
                config._lightId = 1;
            }
            break;

        case 'flicker':
            if (tokens.length >= 5) {
                config._lightRadius = Number(tokens[1]) || 300;
                config._lightColor = /^#[0-9A-Fa-f]{6}$/.test(tokens[2]) ? tokens[2] : '#FFFFFF';
                config._flickerInterval = Number(tokens[3]) || 120;

                let remaining = tokens.slice(4);
                let potentialId = Number(remaining[remaining.length - 1]);
                let potentialOffsetY = Number(remaining[remaining.length - 2]);
                let potentialOffsetX = Number(remaining[remaining.length - 3]);

                if (!isNaN(potentialOffsetX) && !isNaN(potentialOffsetY) && !isNaN(potentialId) && remaining.length >= 3) {
                    config._flickerOffsetX = potentialOffsetX;
                    config._flickerOffsetY = potentialOffsetY;
                    config._lightId = potentialId;
                } else {
                    config._flickerOffsetX = 0;
                    config._flickerOffsetY = 0;
                    if (!isNaN(potentialId)) {
                        config._lightId = potentialId;
                    } else {
                        config._lightId = 1;
                    }
                }
            } else {
                config._lightRadius = 300;
                config._lightColor = '#FFFFFF';
                config._flickerInterval = 120;
                config._flickerOffsetX = 0;
                config._flickerOffsetY = 0;
                config._lightId = 1;
            }
            break;

        case 'fire':
            if (tokens.length >= 3) {
                config._lightRadius = parseFloat(tokens[1]);
                if (isNaN(config._lightRadius) || config._lightRadius <= 0) config._lightRadius = 300;
                config._lightColor = /^#[0-9A-Fa-f]{6}$/.test(tokens[2]) ? tokens[2] : '#FF6600';
                if (tokens.length >= 4) {
                    config._fireFlickerSpeed = parseFloat(tokens[3]);
                    if (isNaN(config._fireFlickerSpeed) || config._fireFlickerSpeed <= 0) config._fireFlickerSpeed = 2;
                } else {
                    config._fireFlickerSpeed = 2;
                }
                if (tokens.length >= 5) {
                    config._fireMinAlpha = parseFloat(tokens[4]);
                    if (isNaN(config._fireMinAlpha) || config._fireMinAlpha < 0 || config._fireMinAlpha > 1) config._fireMinAlpha = 0.5;
                } else {
                    config._fireMinAlpha = 0.5;
                }
                if (tokens.length >= 6) {
                    config._fireMaxAlpha = parseFloat(tokens[5]);
                    if (isNaN(config._fireMaxAlpha) || config._fireMaxAlpha < config._fireMinAlpha || config._fireMaxAlpha > 1) config._fireMaxAlpha = 0.9;
                } else {
                    config._fireMaxAlpha = 0.9;
                }

                let offsetIndex = 6;
                let neededTokens = tokens.length - offsetIndex;
                if (neededTokens >= 3) {
                    let offsetX = parseFloat(tokens[offsetIndex]);
                    let offsetY = parseFloat(tokens[offsetIndex+1]);
                    let idVal = parseInt(tokens[offsetIndex+2],10);
                    if (isNaN(idVal) || idVal <= 0) idVal = 1;
                    config._fireOffsetX = isNaN(offsetX)?0:offsetX;
                    config._fireOffsetY = isNaN(offsetY)?0:offsetY;
                    config._lightId = idVal;
                } else if (neededTokens === 2) {
                    let offsetX = parseFloat(tokens[offsetIndex]);
                    let offsetY = parseFloat(tokens[offsetIndex+1]);
                    config._fireOffsetX = isNaN(offsetX)?0:offsetX;
                    config._fireOffsetY = isNaN(offsetY)?0:offsetY;
                    config._lightId = 1;
                } else if (neededTokens === 1) {
                    let idVal = parseInt(tokens[offsetIndex],10);
                    if (isNaN(idVal) || idVal <= 0) idVal = 1;
                    config._fireOffsetX = 0;
                    config._fireOffsetY = 0;
                    config._lightId = idVal;
                } else {
                    config._fireOffsetX = 0;
                    config._fireOffsetY = 0;
                    config._lightId = 1;
                }
            } else {
                config._lightRadius = 300;
                config._lightColor = '#FF6600';
                config._fireFlickerSpeed = 2;
                config._fireMinAlpha = 0.5;
                config._fireMaxAlpha = 0.9;
                config._fireOffsetX = 0;
                config._fireOffsetY = 0;
                config._lightId = 1;
            }
            break;

            default:
                return null;
    }

    const offsetFields = ['_offsetX','_offsetY','_pulsateOffsetX','_pulsateOffsetY','_flickerOffsetX','_flickerOffsetY','_fireOffsetX','_fireOffsetY','_beamOffsetX','_beamOffsetY','_lightOffsetX','_lightOffsetY'];
    for (let field of offsetFields) {
        if (isNaN(config[field])) {
            config[field] = 0;
        }
    }

    if (isNaN(config._lightId) || config._lightId <= 0) {
        config._lightId = 1;
    }

    return config;
};

// Player light setup
(function() {
    const _Game_Player_refresh = Game_Player.prototype.refresh;
    Game_Player.prototype.refresh = function() {
        _Game_Player_refresh.call(this);
        this.setupPlayerLight();
        this.refreshDynamicLights();
    };

    Game_Player.prototype.setupPlayerLight = function() {
        if (!this._lights) this._lights = [];

        // Remove old player light if exists
        this._lights = this._lights.filter(light => light._isPlayerLight !== true);

        if (PsychronicRaveLighting.playerLight) {
            const pl = PsychronicRaveLighting.playerLight;
            const tokens = [pl.type, ...pl.parameters.split(/\s+/), pl.lightId.toString()];
            const config = PsychronicRaveLighting.parseLightTokens(tokens);
            if (config) {
                config._isPlayerLight = true;
                this._lights.push(config);
            }
        }
    };

    Game_Player.prototype.refreshDynamicLights = function() {
        if (!this._lights) this._lights = [];

        // Remove old dynamic lights
        this._lights = this._lights.filter(light => !light._isDynamic);

        // Add dynamic lights
        const dynamicLights = $gameSystem.getDynamicLights(0);
        dynamicLights.forEach(lightData => {
            const tokens = [lightData.type, ...lightData.parameters.split(/\s+/), lightData.lightId.toString()];
            const config = PsychronicRaveLighting.parseLightTokens(tokens);
            if (config) {
                config._isDynamic = true;
                this._lights.push(config);
            }
        });
    };
})();

(function() {
    const _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        this.extractLightData();
        this.refreshDynamicLights();
    };

    Game_Event.prototype.refreshDynamicLights = function() {
        if (!this._lights) this._lights = [];

        // Remove old dynamic lights
        this._lights = this._lights.filter(light => !light._isDynamic);

        // Add dynamic lights
        const dynamicLights = $gameSystem.getDynamicLights(this._eventId);
        dynamicLights.forEach(lightData => {
            const tokens = [lightData.type, ...lightData.parameters.split(/\s+/), lightData.lightId.toString()];
            const config = this.parseLightTokens(tokens);
            if (config) {
                config._isDynamic = true;
                this._lights.push(config);
            }
        });
    };

    Game_Event.prototype.extractLightData = function() {
        this._lights = [];
        const note = this.event().note.trim();
        if (!note) return;
        const tokens = note.split(/\s+/);
        if (tokens.length < 2) return;

        let typeName = tokens[0].toLowerCase();
        const remainder = tokens.slice(1);

        let subLightsDef = PsychronicRaveLighting.customLightTypes[typeName];
        if (!subLightsDef) {
            subLightsDef = [{ baseType: typeName, parameters: remainder.join(' ') }];
        }

        for (let i = 0; i < subLightsDef.length; i++) {
            const def = subLightsDef[i];
            const baseType = def.baseType;
            const params = def.parameters.trim();
            const combinedTokens = [baseType, ...params.split(/\s+/), ...remainder];
            const config = this.parseLightTokens(combinedTokens);
            if (config) this._lights.push(config);
        }
    };

    Game_Event.prototype.parseLightTokens = function(tokens) {
        return PsychronicRaveLighting.parseLightTokens(tokens);
    };
})();

(function() {
    const _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);
        if (SceneManager._scene instanceof Scene_Map) {
            this.updateLights();
        }
    };

    Sprite_Character.prototype.updateLights = function() {
        const character = this._character;
        if (!(character instanceof Game_Event) && !(character instanceof Game_Player)) return;

        const lights = character._lights || [];
        if (lights.length === 0) {
            this.hideAllLights();
            return;
        }

        const anyOn = lights.some(cfg => $gameSystem.isLightOn(cfg._lightId));
        if (!anyOn) {
            this.hideAllLights();
            return;
        }

        if (!this._multiLightSprites) {
            this._multiLightSprites = [];
        }

        const beamLights = lights.filter(l => l._lightType === 'beam' && $gameSystem.isLightOn(l._lightId));
        const normalLights = lights.filter(l => l._lightType !== 'beam' && $gameSystem.isLightOn(l._lightId));

        const normalCount = normalLights.length;
        while (this._multiLightSprites.length < normalCount) {
            const spr = new Sprite();
            spr.anchor.set(0.5,0.5);
            spr.blendMode = PIXI.BLEND_MODES.ADD;
            spr.visible = false;
            if (SceneManager._scene && SceneManager._scene._spriteset && SceneManager._scene._spriteset._lightContainer) {
                SceneManager._scene._spriteset._lightContainer.addChild(spr);
            }
            this._multiLightSprites.push(spr);
        }
        for (let i = normalCount; i < this._multiLightSprites.length; i++) {
            this._multiLightSprites[i].visible = false;
        }

        for (let i = 0; i < normalCount; i++) {
            const cfg = normalLights[i];
            const spr = this._multiLightSprites[i];
            this.updateSingleLightSprite(spr, cfg);
        }

        for (const cfg of lights) {
            if (cfg._lightType === 'beam' && (!$gameSystem.isLightOn(cfg._lightId) || beamLights.indexOf(cfg)===-1)) {
                if (cfg._beamSprites) {
                    for (const bs of cfg._beamSprites) {
                        bs.visible = false;
                    }
                }
            }
        }

        for (const cfg of beamLights) {
            this.updateBeamLight(cfg);
        }
    };

    Sprite_Character.prototype.hideAllLights = function() {
        if (this._multiLightSprites) {
            for (const spr of this._multiLightSprites) {
                spr.visible = false;
            }
        }
        const character = this._character;
        if (character && character._lights) {
            for (const cfg of character._lights) {
                if (cfg._beamSprites) {
                    for (const bs of cfg._beamSprites) {
                        bs.visible = false;
                    }
                }
            }
        }
    };

    Sprite_Character.prototype.updateSingleLightSprite = function(sprite, cfg) {
        const character = this._character;
        const sx = this.x;
        const sy = this.y;

        let radius = cfg._lightRadius || 300;
        if (cfg._lightType === 'flashlight') {
            radius = Math.max(cfg._coneWidthPx, cfg._coneLengthPx);
        } else if (cfg._lightType === 'beam') {
            return;
        } else if (cfg._lightType === 'pulsate') {
            radius = Math.max(cfg._pulsateMaxRadius, radius);
        }

        const screenLeft = -lightBuffer;
        const screenRight = Graphics.width + lightBuffer;
        const screenTop = -lightBuffer;
        const screenBottom = Graphics.height + lightBuffer;

        const isVisible = (sx + radius) >= screenLeft && (sx - radius) <= screenRight &&
        (sy + radius) >= screenTop && (sy - radius) <= screenBottom;

        if (!isVisible) {
            sprite.visible = false;
            return;
        }

        const fallbackTexture = PIXI.Texture.WHITE;

        function normalizeAngle(angle) {
            angle = angle % (2 * Math.PI);
            if (angle > Math.PI) angle -= 2 * Math.PI;
            if (angle < -Math.PI) angle += 2 * Math.PI;
            return angle;
        }

        function smoothRotate(sprite, targetAngle, rotationSpeed) {
            if (sprite._currentRotation == null) {
                sprite._currentRotation = targetAngle;
            }
            const current = normalizeAngle(sprite._currentRotation);
            const target = normalizeAngle(targetAngle);
            let diff = target - current;
            if (diff > Math.PI) diff -= 2 * Math.PI;
            if (diff < -Math.PI) diff += 2 * Math.PI;

            sprite._currentRotation += diff * rotationSpeed;
            sprite.rotation = normalizeAngle(sprite._currentRotation);
        }

        let baseTexture = PsychronicRaveLighting.getRadialTexture(cfg._lightRadius || 300);
        if (!baseTexture || !baseTexture.valid) {
            baseTexture = fallbackTexture;
        }

        sprite.texture = baseTexture;

        let color = cfg._lightColor || '#FFFFFF';
        let alpha = 1.0;
        let scaleX = 1.0;
        let scaleY = 1.0;

        const t = cfg._lightType;

        if (t === 'flashlight') {
            const flashTrack = $gameSystem.getFlashlightTracking(cfg._lightId);
            let targetAngle = 0;
            let directionBased = true;

            if (flashTrack.type !== 'none') {
                let targetX, targetY;
                if (flashTrack.type === 'player') {
                    targetX = $gamePlayer.screenX();
                    targetY = $gamePlayer.screenY() - 24;
                } else if (flashTrack.type === 'event') {
                    const ev = $gameMap.event(flashTrack.id);
                    if (ev) {
                        targetX = ev.screenX();
                        targetY = ev.screenY() - 24;
                    } else {
                        directionBased = true;
                    }
                }

                if (targetX != null && targetY != null) {
                    const dx = targetX - (sx + cfg._offsetX);
                    const dy = targetY - (sy + cfg._offsetY - 24);
                    targetAngle = Math.atan2(dy, dx) - Math.PI/2;
                    directionBased = false;
                }
            }

            if (directionBased) {
                const direction = character.direction();
                switch (direction) {
                    case 2: targetAngle = 0; break;
                    case 8: targetAngle = Math.PI; break;
                    case 4: targetAngle = Math.PI/2; break;
                    case 6: targetAngle = -Math.PI/2; break;
                }
            }

            let tex = PsychronicRaveLighting.getFlashlightTexture(cfg._coneWidthPx, cfg._coneLengthPx);
            if (!tex || !tex.valid) {
                tex = fallbackTexture;
            }
            sprite.texture = tex;
            sprite.anchor.set(0.5,0);
            sprite.x = sx + cfg._offsetX;
            sprite.y = sy + cfg._offsetY - 24;
            sprite.tint = this.colorToTint(color);

            const rotationSpeed = 0.2;
            smoothRotate(sprite, targetAngle, rotationSpeed);

        } else if (t === 'pulsate') {
            sprite.anchor.set(0.5,0.5);
            if (cfg._pulsateValue == null) cfg._pulsateValue = 0;
            if (cfg._pulsateDirection == null) cfg._pulsateDirection = 1;
            cfg._pulsateValue += cfg._pulsateSpeed * cfg._pulsateDirection;
            if (cfg._pulsateValue > (cfg._pulsateMaxRadius - cfg._pulsateMinRadius)) {
                cfg._pulsateValue = cfg._pulsateMaxRadius - cfg._pulsateMinRadius;
                cfg._pulsateDirection = -1;
            } else if (cfg._pulsateValue < 0) {
                cfg._pulsateValue = 0;
                cfg._pulsateDirection = 1;
            }
            const currentR = cfg._pulsateMinRadius + cfg._pulsateValue;
            const scale = currentR / cfg._pulsateMaxRadius;
            scaleX = scaleY = scale;
            sprite.x = sx + (cfg._pulsateOffsetX || 0);
            sprite.y = sy + (cfg._pulsateOffsetY || 0);
            sprite.rotation = 0;
            sprite.tint = this.colorToTint(color);

        } else if (t === 'flicker') {
            sprite.anchor.set(0.5,0.5);
            if (cfg._flickerFrameCounter == null) cfg._flickerFrameCounter = 0;
            if (cfg._flickerPatternIndex == null) cfg._flickerPatternIndex = 0;
            cfg._flickerFrameCounter++;
            if (cfg._flickerFrameCounter >= cfg._flickerInterval) {
                cfg._flickerFrameCounter = 0;
                cfg._flickerPatternIndex = (cfg._flickerPatternIndex+1) % PsychronicRaveLighting._flickerPatterns.length;
            }
            alpha = PsychronicRaveLighting._flickerPatterns[cfg._flickerPatternIndex];
            sprite.x = sx + (cfg._flickerOffsetX || 0);
            sprite.y = sy + (cfg._flickerOffsetY || 0);
            sprite.rotation = 0;
            sprite.tint = this.colorToTint(color);
        } else if (t === 'phase') {
            sprite.anchor.set(0.5,0.5);
            cfg._phaseTransitionProgress++;
            if (cfg._phaseTransitionProgress >= cfg._phaseSpeed) {
                cfg._phaseTransitionProgress = 0;
                cfg._phaseCurrentIndex = (cfg._phaseCurrentIndex+1) % cfg._phaseColors.length;
            }
            const tt = cfg._phaseTransitionProgress / cfg._phaseSpeed;
            const c1 = cfg._phaseColors[cfg._phaseCurrentIndex];
            const c2 = cfg._phaseColors[(cfg._phaseCurrentIndex+1)%cfg._phaseColors.length];
            color = this.interpolateColor(c1,c2,tt);
            sprite.x = sx + cfg._offsetX || 0;
            sprite.y = sy + cfg._offsetY || 0;
            sprite.rotation = 0;
            sprite.tint = this.colorToTint(color);

        } else if (t === 'fire') {
            sprite.anchor.set(0.5,0.5);
            if (cfg._fireFlickerFrameCounter == null) {
                cfg._fireFlickerFrameCounter = Math.random()*360;
            }
            cfg._fireFlickerFrameCounter += cfg._fireFlickerSpeed;
            if (cfg._fireFlickerFrameCounter >= 360) cfg._fireFlickerFrameCounter -= 360;
            const angle = cfg._fireFlickerFrameCounter * (Math.PI/180);
            let flickerAlpha = cfg._fireMinAlpha + (cfg._fireMaxAlpha - cfg._fireMinAlpha)*(0.6*Math.sin(angle) + 0.4*Math.sin(2*angle));
            flickerAlpha = Math.max(cfg._fireMinAlpha, Math.min(cfg._fireMaxAlpha, flickerAlpha));
            alpha = flickerAlpha;
            sprite.x = sx + (cfg._fireOffsetX || 0);
            sprite.y = sy + (cfg._fireOffsetY || 0);
            sprite.rotation = 0;
            sprite.tint = this.colorToTint(cfg._lightColor);

        } else {
            sprite.anchor.set(0.5,0.5);
            sprite.x = sx + (cfg._lightOffsetX || 0);
            sprite.y = sy + (cfg._lightOffsetY || 0);
            sprite.rotation = 0;
            sprite.tint = this.colorToTint(color);
        }

        sprite.alpha = alpha;
        sprite.scale.set(scaleX, scaleY);
        sprite.visible = true;

        if (!sprite.texture || !sprite.texture.valid) {
            sprite.texture = fallbackTexture;
        }
    };

    Sprite_Character.prototype.updateBeamLight = function(cfg) {
        const character = this._character;
        const sx = this.x;
        const sy = this.y;
        const fallbackTexture = PIXI.Texture.WHITE;

        let radius = Math.max(cfg._beamWidth, cfg._beamLength);
        const screenLeft = -lightBuffer;
        const screenRight = Graphics.width + lightBuffer;
        const screenTop = -lightBuffer;
        const screenBottom = Graphics.height + lightBuffer;

        const isVisible = (sx + radius) >= screenLeft && (sx - radius) <= screenRight &&
        (sy + radius) >= screenTop && (sy - radius) <= screenBottom;

        let beamSprites = PsychronicRaveLighting._beamSpriteStorage.get(cfg);

        if (!isVisible) {
            if (beamSprites) {
                for (const bs of beamSprites) {
                    bs.visible = false;
                }
            }
            return;
        }

        if (beamSprites) {
            const container = SceneManager._scene._spriteset._lightContainer;
            for (const bs of beamSprites) {
                if (!bs.parent) {
                    for (const bs2 of beamSprites) {
                        container.addChild(bs2);
                    }
                    break;
                }
            }
        } else {
            beamSprites = [];
            if (SceneManager._scene && SceneManager._scene._spriteset && SceneManager._scene._spriteset._lightContainer) {
                const c = SceneManager._scene._spriteset._lightContainer;
                for (let i = 0; i < cfg._beamNumberOfBeams; i++) {
                    const spr = new Sprite();
                    spr.anchor.set(0.5,0);
                    spr.blendMode = PIXI.BLEND_MODES.ADD;
                    spr.visible = true;
                    c.addChild(spr);
                    beamSprites.push(spr);
                }
            }
            PsychronicRaveLighting._beamSpriteStorage.set(cfg, beamSprites);
        }

        const color = this.getBeamColor(cfg);
        let texture = PsychronicRaveLighting.getBeamTexture(cfg._beamWidth, cfg._beamLength);
        if (!texture || !texture.valid) {
            texture = fallbackTexture;
        }

        const track = $gameSystem.getBeamTracking(cfg._lightId);
        let baseAngle = 0;
        let targetDist = null;

        if (track.type === 'player') {
            const px = $gamePlayer.screenX();
            const py = $gamePlayer.screenY() - 24;
            const dx = px - (sx + cfg._beamOffsetX);
            const dy = py - (sy + cfg._beamOffsetY);
            baseAngle = Math.atan2(dy, dx) - Math.PI/2;
            targetDist = Math.sqrt(dx*dx + dy*dy);
        } else if (track.type === 'event') {
            const ev = $gameMap.event(track.id);
            if (ev) {
                const evx = ev.screenX();
                const evy = ev.screenY() - 24;
                const dx = evx - (sx + cfg._beamOffsetX);
                const dy = evy - (sy + cfg._beamOffsetY);
                baseAngle = Math.atan2(dy, dx) - Math.PI/2;
                targetDist = Math.sqrt(dx*dx + dy*dy);
            } else {
                baseAngle = this.getBeamBaseAngle(cfg, character);
            }
        } else {
            baseAngle = this.getBeamBaseAngle(cfg, character);
        }

        const angleBetween = (2 * Math.PI) / cfg._beamNumberOfBeams;
        const rotationSpeed = 0.2;

        for (let i = 0; i < beamSprites.length; i++) {
            const spr = beamSprites[i];
            spr.texture = texture;
            spr.tint = this.colorToTint(color);
            spr.x = sx + cfg._beamOffsetX;
            spr.y = sy + cfg._beamOffsetY;
            spr.alpha = cfg._beamOpacity;
            spr.scale.set(1,1);
            spr.visible = true;

            const targetRotation = baseAngle + i * angleBetween;

            if (track.type !== 'none' && (track.type === 'player' || (track.type === 'event' && targetDist !== null))) {
                spr._currentRotation = targetRotation;
                spr.rotation = targetRotation;

                if (targetDist !== null) {
                    const actualLength = Math.min(targetDist, cfg._beamLength);
                    const scaleFactor = actualLength / cfg._beamLength;
                    spr.scale.y = scaleFactor;
                }
            } else if (cfg._beamSpinRate > 0 && track.type === 'none') {
                spr.rotation = targetRotation;
                spr._currentRotation = targetRotation;
            } else {
                if (spr._currentRotation == null) {
                    spr._currentRotation = targetRotation;
                }
                const current = this.normalizeAngle(spr._currentRotation);
                const target = this.normalizeAngle(targetRotation);
                let diff = target - current;
                if (diff > Math.PI) diff -= 2 * Math.PI;
                if (diff < -Math.PI) diff += 2 * Math.PI;

                spr._currentRotation += diff * rotationSpeed;
                spr.rotation = this.normalizeAngle(spr._currentRotation);
            }

            if (!spr.texture || !spr.texture.valid) {
                spr.texture = fallbackTexture;
            }
        }
    };

    Sprite_Character.prototype.getBeamBaseAngle = function(cfg, character) {
        const track = $gameSystem.getBeamTracking(cfg._lightId);
        if (cfg._beamSpinRate !== 0 && track.type === 'none') {
            if (!cfg._beamSpinRadiansPerFrame) {
                cfg._beamSpinRadiansPerFrame = cfg._beamSpinRate * Math.PI / 180;
            }
            if (cfg._beamCurrentSpinAngle == null) {
                cfg._beamCurrentSpinAngle = 0;
            }
            cfg._beamCurrentSpinAngle += cfg._beamSpinRadiansPerFrame;
            return cfg._beamCurrentSpinAngle;
        } else {
            const direction = character.direction();
            switch (direction) {
                case 2: return 0;
                case 8: return Math.PI;
                case 4: return Math.PI / 2;
                case 6: return -Math.PI / 2;
            }
            return 0;
        }
    };

    Sprite_Character.prototype.normalizeAngle = function(angle) {
        angle = angle % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        if (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    };

    Sprite_Character.prototype.getBeamColor = function(cfg) {
        if (cfg._beamSpeed > 0 && cfg._beamColors.length > 1) {
            const t = (Graphics.frameCount % cfg._beamSpeed)/cfg._beamSpeed;
            const c1 = cfg._beamColors[0];
            const c2 = cfg._beamColors[1];
            return this.interpolateColor(c1,c2,t);
        } else {
            return cfg._beamColors[0] || '#FFFFFF';
        }
    };

    Sprite_Character.prototype.interpolateColor = function(color1, color2, factor) {
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);
        const r = Math.round(c1.r + (c2.r-c1.r)*factor);
        const g = Math.round(c1.g + (c2.g-c1.g)*factor);
        const b = Math.round(c1.b + (c2.b-c1.b)*factor);
        return `#${this.componentToHex(r)}${this.componentToHex(g)}${this.componentToHex(b)}`;
    };

    Sprite_Character.prototype.hexToRgb = function(hex) {
        const bigint = parseInt(hex.slice(1),16);
        const r = (bigint>>16)&255;
        const g = (bigint>>8)&255;
        const b = bigint&255;
        return {r,g,b};
    };

    Sprite_Character.prototype.componentToHex = function(c) {
        const hex = c.toString(16);
        return hex.length===1? '0'+hex : hex;
    };

    Sprite_Character.prototype.colorToTint = function(color) {
        const rgb = this.hexToRgb(color);
        return (rgb.r<<16)+(rgb.g<<8)+(rgb.b);
    };
})();

(function() {
    PsychronicRaveLighting.textureCache = {};

    // A cached texture is "alive" if its underlying source still has a valid
    // drawable resource (HTMLCanvasElement / HTMLImageElement / etc.). On
    // PIXI v8, scene teardown / GC may destroy a TextureSource and set its
    // .resource to null, leaving our cache holding a stale Texture object
    // that no longer points at a drawable canvas. Re-querying that texture
    // and feeding it to ctx.drawImage() throws "The provided value is not of
    // type HTMLCanvasElement...". This helper detects that state so callers
    // can drop the stale entry and rebuild from scratch.
    PsychronicRaveLighting._isCachedTextureAlive = function(texture) {
        if (!texture) return false;
        const src = texture.source || (texture.baseTexture && texture.baseTexture.source);
        if (!src) return false;
        if (src.destroyed) return false;
        const res = src.resource;
        if (!res) return false;
        // Must be an actual drawable image source for ctx.drawImage to accept.
        if (typeof HTMLCanvasElement !== "undefined" && res instanceof HTMLCanvasElement) return true;
        if (typeof HTMLImageElement !== "undefined" && res instanceof HTMLImageElement) return true;
        if (typeof HTMLVideoElement !== "undefined" && res instanceof HTMLVideoElement) return true;
        if (typeof ImageBitmap !== "undefined" && res instanceof ImageBitmap) return true;
        if (typeof OffscreenCanvas !== "undefined" && res instanceof OffscreenCanvas) return true;
        return false;
    };

    PsychronicRaveLighting.getRadialTexture = function(radius) {
        const r = Math.max(radius,1);
        const key = `radial_${r}`;
        if (this._isCachedTextureAlive(this.textureCache[key])) {
            return this.textureCache[key];
        }

        const size = r*2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0,0,size,size);

        const baseTexture = PIXI.BaseTexture.from(canvas);
        baseTexture.update();
        const texture = new PIXI.Texture(baseTexture);
        this.textureCache[key] = texture;
        return texture;
    };

    PsychronicRaveLighting.getBeamTexture = function(width, length) {
        const w = Math.max(width,1);
        const l = Math.max(length,1);
        const key = `beam_${w}_${l}`;
        if (this._isCachedTextureAlive(this.textureCache[key])) {
            return this.textureCache[key];
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = l;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0,0,0,l);
        grad.addColorStop(0,'rgba(255,255,255,1)');
        grad.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0,0,w,l);

        const baseTexture = PIXI.BaseTexture.from(canvas);
        baseTexture.update();
        const texture = new PIXI.Texture(baseTexture);
        this.textureCache[key] = texture;
        return texture;
    };

    PsychronicRaveLighting.getFlashlightTexture = function(width, length) {
        const w = Math.max(width, 1);
        const l = Math.max(length, 1);
        const key = `flashlight_blurred_${w}_${l}`;
        if (this._isCachedTextureAlive(this.textureCache[key])) {
            return this.textureCache[key];
        }

        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = l;
        const offCtx = offCanvas.getContext('2d');

        const grad = offCtx.createLinearGradient(w/2, 0, w/2, l);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        offCtx.fillStyle = grad;
        offCtx.beginPath();
        offCtx.moveTo(w/2, 0);
        offCtx.lineTo(w, l);
        offCtx.lineTo(0, l);
        offCtx.closePath();
        offCtx.fill();

        const blurAmount = 8;
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = w;
        blurCanvas.height = l;
        const blurCtx = blurCanvas.getContext('2d');
        blurCtx.filter = `blur(${blurAmount}px)`;
        blurCtx.drawImage(offCanvas, 0, 0);

        const baseTexture = PIXI.BaseTexture.from(blurCanvas);
        baseTexture.update();
        const texture = new PIXI.Texture(baseTexture);
        this.textureCache[key] = texture;
        return texture;
    };
})();

// Rest of rendering code continues...
(function() {
    const _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
    Spriteset_Map.prototype.createLowerLayer = function() {
        _Spriteset_Map_createLowerLayer.call(this);

        this._toneBitmap = new Bitmap(Graphics.width, Graphics.height);
        this._toneSprite = new Sprite(this._toneBitmap);
        // Plain alpha-blended overlay (no MULTIPLY). The tone bitmap is drawn
        // with its color = tint color, alpha = tint magnitude. Light shapes
        // are punched out with destination-out so they reveal the unscathed
        // scene. Avoids v8's advanced-blend-mode pipeline entirely.
        this.addChild(this._toneSprite);

        this.createLightContainer();
    };

    Spriteset_Map.prototype.createLightContainer = function() {
        this._lightContainer = new PIXI.Container();
        this.addChild(this._lightContainer);
    };

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        this.preGenerateLightTextures();
    };

    Scene_Map.prototype.preGenerateLightTextures = function() {
        const beamParamsSet = new Set();
        const flashlightParamsSet = new Set();
        const radialParamsSet = new Set();

        // Include player lights
        if ($gamePlayer && $gamePlayer._lights) {
            $gamePlayer._lights.forEach(cfg => {
                this.addLightTextureToSets(cfg, beamParamsSet, flashlightParamsSet, radialParamsSet);
            });
        }

        $gameMap.events().forEach(event => {
            const lights = event._lights || [];
            lights.forEach(cfg => {
                this.addLightTextureToSets(cfg, beamParamsSet, flashlightParamsSet, radialParamsSet);
            });
        });

        radialParamsSet.forEach(radius => {
            PsychronicRaveLighting.getRadialTexture(radius);
        });

        beamParamsSet.forEach(key => {
            const [width, length] = key.split('_').map(Number);
            PsychronicRaveLighting.getBeamTexture(width, length);
        });

        flashlightParamsSet.forEach(key => {
            const [w, l] = key.split('_').map(Number);
            PsychronicRaveLighting.getFlashlightTexture(w, l);
        });
    };

    Scene_Map.prototype.addLightTextureToSets = function(cfg, beamParamsSet, flashlightParamsSet, radialParamsSet) {
        if (!cfg._lightType) return;
        switch(cfg._lightType) {
            case 'beam':
                const beamKey = `${cfg._beamWidth}_${cfg._beamLength}`;
                if (!beamParamsSet.has(beamKey)) {
                    beamParamsSet.add(beamKey);
                }
                break;
            case 'flashlight':
                const flashKey = `${cfg._coneWidthPx}_${cfg._coneLengthPx}`;
                if (!flashlightParamsSet.has(flashKey)) {
                    flashlightParamsSet.add(flashKey);
                }
                break;
            case 'light':
            case 'flicker':
            case 'pulsate':
            case 'phase':
            case 'fire':
            default:
                const radius = this.getBaseRadiusForLight(cfg);
                if (!radialParamsSet.has(radius)) {
                    radialParamsSet.add(radius);
                }
                break;
        }
    };

    Scene_Map.prototype.getBaseRadiusForLight = function(cfg) {
        let radius = 300;
        switch(cfg._lightType) {
            case 'light':
            case 'flicker':
                radius = cfg._lightRadius || 300;
                break;
            case 'pulsate':
                radius = cfg._pulsateMaxRadius || 350;
                break;
            case 'phase':
            case 'fire':
                radius = cfg._lightRadius || 300;
                break;
            default:
                break;
        }
        return Math.max(radius, 1);
    };

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);

        // Control light container visibility based on lighting effects option
        if (this._lightContainer) {
            this._lightContainer.visible = (ConfigManager.lightingEffects !== false);
        }

        this.updateToneOverlay();
    };

    Spriteset_Map.prototype.updateToneOverlay = function() {
        // Check if lighting effects are explicitly disabled in options
        // If false, clear the overlay completely (no darkness, no lights)
        // If undefined or true, proceed with lighting system
        if (ConfigManager.lightingEffects === false) {
            const ctx = this._toneBitmap.context;
            const width = this._toneBitmap.width;
            const height = this._toneBitmap.height;

            // Clear the entire overlay - this makes it transparent
            // So the map shows through normally without any lighting system
            ctx.clearRect(0, 0, width, height);
            this._toneBitmap._baseTexture.update();
            return;
        }

        // Lighting effects are enabled (true) or not set (undefined = default enabled)
        // Simplified tone-overlay model (alpha-composited, no MULTIPLY blend):
        //   alpha = max |tone channel| / 255   (so [0,0,0,0] -> 0, fully transparent)
        //   color: negative components -> black; positive-only -> that color
        // The light shapes are then punched out with destination-out below,
        // exactly as before, so they reveal the unscathed scene through the tint.
        const tone = $gameScreen.tone();
        const ctx = this._toneBitmap.context;
        const width = this._toneBitmap.width;
        const height = this._toneBitmap.height;
        ctx.clearRect(0, 0, width, height);

        // Lights cutting holes through the overlay only makes sense as a
        // darkness-piercing effect: night/twilight gets a dark or desaturated
        // overlay, and light sources reveal the unscathed scene through it.
        // For positive RGB tints ("brightness", e.g. white flash), the
        // overlay still draws so the tint color is visible -- but lights
        // shouldn't punch holes in it (that exposes the scene through
        // light-shaped windows in a wall of white). Gate the destination-out
        // pass below on this flag instead of skipping the overlay entirely.
        const hasNegativeChannel =
            tone[0] < 0 || tone[1] < 0 || tone[2] < 0;
        const hasGrayDarkening =
            tone[3] > 0 && tone[0] === 0 && tone[1] === 0 && tone[2] === 0;
        const allowLightHoles = hasNegativeChannel || hasGrayDarkening;

        const toneAlpha = Math.min(1, Math.max(
            Math.abs(tone[0]),
            Math.abs(tone[1]),
            Math.abs(tone[2]),
            Math.abs(tone[3])
        ) / 255);

        let rVal, gVal, bVal;
        if (tone[0] < 0 || tone[1] < 0 || tone[2] < 0) {
            // Any negative component = darkening tint -> black overlay
            rVal = 0;
            gVal = 0;
            bVal = 0;
        } else if (tone[3] > 0 && tone[0] === 0 && tone[1] === 0 && tone[2] === 0) {
            // Pure gray tint (no RGB shift) -> use mid-gray overlay
            rVal = 128;
            gVal = 128;
            bVal = 128;
        } else {
            // Positive RGB tint -> use those colors directly
            rVal = Math.max(0, Math.min(255, tone[0]));
            gVal = Math.max(0, Math.min(255, tone[1]));
            bVal = Math.max(0, Math.min(255, tone[2]));
        }

        if (toneAlpha > 0) {
            ctx.fillStyle = `rgba(${rVal},${gVal},${bVal},${toneAlpha})`;
            ctx.fillRect(0, 0, width, height);
        }

        if (!allowLightHoles) {
            // Positive RGB tint: overlay drawn (so tint color is visible), but
            // don't punch light holes through it.
            this._toneBitmap._baseTexture.update();
            return;
        }

        ctx.globalCompositeOperation = 'destination-out';

        const sprites = this._characterSprites;
        if (sprites) {
            for (const spr of sprites) {
                const ch = spr._character;
                if (ch && ch._lights && ch._lights.length > 0) {
                    for (const cfg of ch._lights) {
                        if (!$gameSystem.isLightOn(cfg._lightId)) continue;

                        let sx = spr.x;
                        let sy = spr.y;
                        let radius = cfg._lightRadius || 300;

                        if (cfg._lightType === 'phase') {
                            sx += cfg._offsetX;
                            sy += cfg._offsetY;
                        } else if (cfg._lightType === 'flashlight') {
                            sx += cfg._offsetX;
                            sy += (cfg._offsetY - 24);
                        } else if (cfg._lightType === 'fire') {
                            sx += cfg._fireOffsetX;
                            sy += cfg._fireOffsetY;
                        } else if (cfg._lightType === 'beam') {
                            sx += cfg._beamOffsetX;
                            sy += cfg._beamOffsetY;
                        } else if (cfg._lightType === 'pulsate') {
                            radius = Math.max(radius, cfg._pulsateMaxRadius);
                            sx += cfg._pulsateOffsetX;
                            sy += cfg._pulsateOffsetY;
                        } else if (cfg._lightType === 'light') {
                            sx += cfg._lightOffsetX || 0;
                            sy += cfg._lightOffsetY || 0;
                        } else if (cfg._lightType === 'flicker') {
                            sx += cfg._flickerOffsetX || 0;
                            sy += cfg._flickerOffsetY || 0;
                        }

                        if (cfg._lightType === 'flashlight') {
                            const flashTrack = $gameSystem.getFlashlightTracking(cfg._lightId);
                            let targetAngle = 0;
                            let directionBased = true;

                            if (flashTrack.type !== 'none') {
                                let targetX, targetY;
                                if (flashTrack.type === 'player') {
                                    targetX = $gamePlayer.screenX();
                                    targetY = $gamePlayer.screenY() - 24;
                                } else if (flashTrack.type === 'event') {
                                    const ev = $gameMap.event(flashTrack.id);
                                    if (ev) {
                                        targetX = ev.screenX();
                                        targetY = ev.screenY() - 24;
                                    } else {
                                        directionBased = true;
                                    }
                                }

                                if (targetX != null && targetY != null) {
                                    const dx = targetX - (sx + cfg._offsetX);
                                    const dy = targetY - (sy + cfg._offsetY - 24);
                                    targetAngle = Math.atan2(dy, dx) - Math.PI/2;
                                    directionBased = false;
                                }
                            }

                            if (directionBased) {
                                const direction = ch.direction();
                                switch (direction) {
                                    case 2: targetAngle = 0; break;
                                    case 4: targetAngle = Math.PI / 2; break;
                                    case 6: targetAngle = -Math.PI / 2; break;
                                    case 8: targetAngle = Math.PI; break;
                                }
                            }

                            if (cfg._smoothFlashlightAngle == null) {
                                cfg._smoothFlashlightAngle = targetAngle;
                            }

                            function normalizeAngle(angle) {
                                angle = angle % (2 * Math.PI);
                                if (angle > Math.PI) angle -= 2 * Math.PI;
                                if (angle < -Math.PI) angle += 2 * Math.PI;
                                return angle;
                            }

                            let current = normalizeAngle(cfg._smoothFlashlightAngle);
                            let diff = targetAngle - current;
                            if (diff > Math.PI) diff -= 2 * Math.PI;
                            if (diff < -Math.PI) diff += 2 * Math.PI;

                            const rotationSpeed = 0.2;
                            cfg._smoothFlashlightAngle += diff * rotationSpeed;

                            const coneWidth = cfg._coneWidthPx;
                            const coneLength = cfg._coneLengthPx;
                            const texture = PsychronicRaveLighting.getFlashlightTexture(coneWidth, coneLength);
                            const img = texture.baseTexture.resource.source;

                            ctx.save();
                            ctx.translate(sx, sy);
                            ctx.rotate(cfg._smoothFlashlightAngle);

                            ctx.translate(-coneWidth/2, 0);
                            ctx.drawImage(img, 0, 0);

                            ctx.restore();
                        } else if (cfg._lightType === 'beam') {
                            const beamWidth = cfg._beamWidth;
                            const beamLength = cfg._beamLength;
                            const beamCount = cfg._beamNumberOfBeams;
                            const beamTexture = PsychronicRaveLighting.getBeamTexture(beamWidth, beamLength);
                            const beamImg = beamTexture.baseTexture.resource.source;

                            let track = $gameSystem.getBeamTracking(cfg._lightId);
                            let baseAngle = 0;
                            let targetDist = null;

                            function normalizeAngle(angle) {
                                angle = angle % (2 * Math.PI);
                                if (angle > Math.PI) angle -= 2 * Math.PI;
                                if (angle < -Math.PI) angle += 2 * Math.PI;
                                return angle;
                            }

                            function getBeamBaseAngle(cfg, ch, track) {
                                if (track.type === 'none') {
                                    if (cfg._beamSpinRate > 0) {
                                        if (!cfg._beamSpinRadiansPerFrame) {
                                            cfg._beamSpinRadiansPerFrame = cfg._beamSpinRate * Math.PI/180;
                                        }
                                        if (cfg._beamCurrentSpinAngle == null) {
                                            cfg._beamCurrentSpinAngle = 0;
                                        }
                                        cfg._beamCurrentSpinAngle += cfg._beamSpinRadiansPerFrame;
                                        return cfg._beamCurrentSpinAngle;
                                    } else {
                                        const d = ch.direction();
                                        switch (d) {
                                            case 2: return 0;
                                            case 8: return Math.PI;
                                            case 4: return Math.PI/2;
                                            case 6: return -Math.PI/2;
                                        }
                                    }
                                }
                                return 0;
                            }

                            const originX = sx;
                            const originY = sy;

                            if (track.type === 'player') {
                                const px = $gamePlayer.screenX();
                                const py = $gamePlayer.screenY() - 24;
                                const dx = px - originX;
                                const dy = py - originY;
                                baseAngle = Math.atan2(dy, dx) - Math.PI/2;
                                targetDist = Math.sqrt(dx*dx + dy*dy);

                            } else if (track.type === 'event') {
                                const ev = $gameMap.event(track.id);
                                if (ev) {
                                    const evx = ev.screenX();
                                    const evy = ev.screenY() - 24;
                                    const dx = evx - originX;
                                    const dy = evy - originY;
                                    baseAngle = Math.atan2(dy, dx) - Math.PI/2;
                                    targetDist = Math.sqrt(dx*dx + dy*dy);
                                } else {
                                    baseAngle = getBeamBaseAngle(cfg, ch, track);
                                }
                            } else {
                                baseAngle = getBeamBaseAngle(cfg, ch, track);
                            }

                            const angleBetween = (2 * Math.PI) / beamCount;

                            for (let i = 0; i < beamCount; i++) {
                                const beamAngle = baseAngle + i * angleBetween;
                                ctx.save();
                                ctx.translate(originX, originY);
                                ctx.rotate(beamAngle);

                                let drawLength = beamLength;
                                if (targetDist !== null) {
                                    drawLength = Math.min(targetDist, beamLength);
                                }

                                const scaleFactor = drawLength / beamLength;
                                ctx.translate(-beamWidth/2, 0);
                                ctx.scale(1, scaleFactor);

                                ctx.drawImage(beamImg, 0, 0);

                                ctx.restore();
                            }

                        } else {
                            const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
                            grad.addColorStop(0, 'rgba(255,255,255,1)');
                            grad.addColorStop(1, 'rgba(255,255,255,0)');
                            ctx.fillStyle = grad;
                            ctx.beginPath();
                            ctx.arc(sx, sy, radius, 0, Math.PI*2);
                            ctx.fill();
                        }
                    }
                }
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        this._toneBitmap._baseTexture.update();
    };

    const _Spriteset_Base_updateBaseFilters = Spriteset_Base.prototype.updateBaseFilters;
    Spriteset_Base.prototype.updateBaseFilters = function() {
        // Tint (positive AND negative) is now applied entirely via the alpha-
        // composited _toneSprite overlay above the spriteset, so the base color
        // filter must stay neutral or it would double-tint the scene.
        this._baseColorFilter.setColorTone([0, 0, 0, 0]);
    };

    const _Screen_setTone = Screen.prototype.setTone;
    Screen.prototype.setTone = function() {
        _Screen_setTone.apply(this,arguments);
    };

    const _Spriteset_Map_destroy = Spriteset_Map.prototype.destroy;
    Spriteset_Map.prototype.destroy = function(options) {
        if (this._lightContainer) {
            this._lightContainer.removeChildren();
            this._lightContainer.destroy({children: true});
            this._lightContainer = null;
        }
        // The destroy({children:true}) above tears down every light sprite,
        // which in turn destroys the underlying texture sources -- including
        // the radial/beam/flashlight ones held by the class-level cache. On
        // PIXI v8 those sources strictly reject any further use (drawImage
        // throws "The provided value is not of type HTMLCanvasElement..."),
        // so we must drop the stale cache entries here and let the next scene
        // rebuild them from scratch.
        PsychronicRaveLighting.textureCache = {};
        _Spriteset_Map_destroy.call(this, options);
    };
})();
