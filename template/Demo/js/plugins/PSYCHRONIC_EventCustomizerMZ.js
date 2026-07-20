//=============================================================================
// PSYCHRONIC_EventCustomizerMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.8.0] Event Customizer
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_EventCustomizerMZ.js
 *
 * @param ---General---
 * @default
 *
 * @param enableDiagonalMovement
 * @text Enable Diagonal Movement
 * @desc Allow player to move diagonally by pressing two direction keys simultaneously
 * @type boolean
 * @default false
 *
 * @param blockedRegions
 * @text Blocked Regions
 * @desc Comma-separated list of region IDs that block movement (e.g., "120,121,122")
 * @type string
 * @default
 *
 * @param ---Event Detectors---
 * @default
 *
 * @param detectorConfigs
 * @text Detector Configurations
 * @desc Configure detector patterns for events
 * @type struct<DetectorConfig>[]
 * @default []
 */

/*~struct~DetectorConfig:
 * @param id
 * @text Detector ID
 * @desc Unique ID for this detector pattern
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @param pattern
 * @text Detection Pattern
 * @desc How the event behaves when detecting the player
 * @type select
 * @option Chase (Move toward player)
 * @value chase
 * @option Flee (Move away from player)
 * @value flee
 * @option Patrol + Chase (Random until close, then chase)
 * @value patrolChase
 * @option Freeze (Stop moving when player detected)
 * @value freeze
 * @default chase
 *
 * @param range
 * @text Detection Range
 * @desc Distance in tiles the event can detect the player
 * @type number
 * @min 1
 * @max 20
 * @default 5
 *
 * @param chaseRange
 * @text Chase Activation Range
 * @desc For Patrol+Chase: Distance to start chasing (0 = use detection range)
 * @type number
 * @min 0
 * @max 20
 * @default 3
 *
 * @param lineOfSight
 * @text Require Line of Sight
 * @desc Event must have clear view to detect player (no walls blocking)
 * @type boolean
 * @default false
 *
 * @param moveSpeed
 * @text Movement Speed
 * @desc Speed when moving (1=slowest, 6=fastest, 0=keep current)
 * @type number
 * @min 0
 * @max 6
 * @default 0
 *
 * @param loseSightDistance
 * @text Lose Sight Distance
 * @desc Stop chasing if player gets this far away (0=never lose sight)
 * @type number
 * @min 0
 * @max 30
 * @default 0
 */

/*:
 * @plugindesc Plugin Commands
 * @command bindPictureToEvent
 * @text Bind Picture to Event
 * @desc Bind a picture to follow an event's movement
 *
 * @arg pictureId
 * @text Picture ID
 * @desc ID of the picture to bind
 * @type number
 * @min 1
 * @max 100
 * @default 1
 *
 * @arg eventId
 * @text Event ID
 * @desc ID of the event to bind to (0 = this event)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg offsetX
 * @text Offset X
 * @desc Horizontal offset from event center (in pixels)
 * @type number
 * @min -999
 * @max 999
 * @default 0
 *
 * @arg offsetY
 * @text Offset Y
 * @desc Vertical offset from event center (in pixels)
 * @type number
 * @min -999
 * @max 999
 * @default 0
 *
 * @command unbindPicture
 * @text Unbind Picture
 * @desc Remove picture binding from event
 *
 * @arg pictureId
 * @text Picture ID
 * @desc ID of the picture to unbind
 * @type number
 * @min 1
 * @max 100
 * @default 1
 *
 * @command zoomSprite
 * @text Zoom Sprite
 * @desc Zoom a character sprite (proportional X/Y scaling)
 *
 * @arg targetId
 * @text Target ID
 * @desc Character ID (0=Player, 1-9999=Event, -1 to -10=Followers)
 * @type number
 * @min -10
 * @max 9999
 * @default 0
 *
 * @arg zoom
 * @text Zoom Scale
 * @desc Zoom percentage (1.0=100%, 0.5=50%, 2.0=200%, negative=flip)
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default 1.0
 *
 * @arg duration
 * @text Duration
 * @desc Animation duration in frames (0=instant)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @command zoomSpriteAdvanced
 * @text Zoom Sprite Advanced
 * @desc Zoom a character sprite with separate X/Y control
 *
 * @arg targetId
 * @text Target ID
 * @desc Character ID (0=Player, 1-9999=Event, -1 to -10=Followers)
 * @type number
 * @min -10
 * @max 9999
 * @default 0
 *
 * @arg zoomX
 * @text Zoom X Scale
 * @desc Horizontal zoom (1.0=100%, 0.5=50%, 2.0=200%, negative=flip)
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default 1.0
 *
 * @arg zoomY
 * @text Zoom Y Scale
 * @desc Vertical zoom (1.0=100%, 0.5=50%, 2.0=200%, negative=flip)
 * @type number
 * @decimals 2
 * @min -10
 * @max 10
 * @default 1.0
 *
 * @arg durationX
 * @text Duration X
 * @desc Horizontal animation duration in frames (0=instant)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg durationY
 * @text Duration Y
 * @desc Vertical animation duration in frames (0=instant)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @command rotateSprite
 * @text Rotate Sprite
 * @desc Rotate a character sprite by a relative amount with configurable pivot point
 *
 * @arg targetId
 * @text Target ID
 * @desc Character ID (0=Player, 1-9999=Event, -1 to -10=Followers)
 * @type number
 * @min -10
 * @max 9999
 * @default 0
 *
 * @arg rotation
 * @text Rotation
 * @desc Degrees to rotate (relative to current rotation, positive=clockwise)
 * @type number
 * @min -3600
 * @max 3600
 * @default 0
 *
 * @arg duration
 * @text Duration
 * @desc Animation duration in frames (0=instant)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg continuous
 * @text Continuous
 * @desc Make this a continuous rotation (ignores duration)
 * @type boolean
 * @default false
 *
 * @arg pivotX
 * @text Pivot X
 * @desc Horizontal pivot point (0.0=left, 0.5=center, 1.0=right)
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.5
 *
 * @arg pivotY
 * @text Pivot Y
 * @desc Vertical pivot point (0.0=top, 0.5=center, 1.0=bottom)
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 1.0
 *
 * @command rotateSpriteAbsolute
 * @text Rotate Sprite (Absolute)
 * @desc Set sprite to a specific rotation angle with configurable pivot point
 *
 * @arg targetId
 * @text Target ID
 * @desc Character ID (0=Player, 1-9999=Event, -1 to -10=Followers)
 * @type number
 * @min -10
 * @max 9999
 * @default 0
 *
 * @arg rotation
 * @text Rotation Angle
 * @desc Absolute rotation angle in degrees (0=normal, positive=clockwise)
 * @type number
 * @min -3600
 * @max 3600
 * @default 0
 *
 * @arg duration
 * @text Duration
 * @desc Animation duration in frames (0=instant)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg continuous
 * @text Continuous
 * @desc Make this a continuous rotation (ignores duration)
 * @type boolean
 * @default false
 *
 * @arg pivotX
 * @text Pivot X
 * @desc Horizontal pivot point (0.0=left, 0.5=center, 1.0=right)
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 0.5
 *
 * @arg pivotY
 * @text Pivot Y
 * @desc Vertical pivot point (0.0=top, 0.5=center, 1.0=bottom)
 * @type number
 * @decimals 2
 * @min 0
 * @max 1
 * @default 1.0
 *
 * @command setFollowerControl
 * @text Set Follower Control
 * @desc Set which character receives player movement routes (0=Player, 1+=Followers)
 *
 * @arg followerId
 * @text Follower ID
 * @desc Character to control (0=Player, 1=Follower 1, 2=Follower 2, etc.)
 * @type number
 * @min 0
 * @max 99
 * @default 0
 *
 * @command stopFollowerChase
 * @text Stop Follower Chase
 * @desc Stop followers from chasing the player
 *
 * @arg followerId
 * @text Follower ID
 * @desc Follower to stop (-1=All, 1=Follower 1, 2=Follower 2, etc.)
 * @type number
 * @min -1
 * @max 99
 * @default -1
 *
 * @command startFollowerChase
 * @text Start Follower Chase
 * @desc Resume followers chasing the player
 *
 * @arg followerId
 * @text Follower ID
 * @desc Follower to start (-1=All, 1=Follower 1, 2=Follower 2, etc.)
 * @type number
 * @min -1
 * @max 99
 * @default -1
 *
 * @command moveCameraToEvent
 * @text Move Camera to Event
 * @desc Smoothly move camera to center on a specific event
 *
 * @arg eventId
 * @text Event ID
 * @desc ID of the event to center camera on (0 = this event)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg duration
 * @text Duration
 * @desc Animation duration in frames (0=instant, 60=1 second)
 * @type number
 * @min 0
 * @max 600
 * @default 60
 *
 * @arg offsetX
 * @text Offset X
 * @desc Additional horizontal offset in tiles
 * @type number
 * @min -20
 * @max 20
 * @default 0
 *
 * @arg offsetY
 * @text Offset Y
 * @desc Additional vertical offset in tiles
 * @type number
 * @min -20
 * @max 20
 * @default 0
 *
 * @command moveCameraToPlayer
 * @text Move Camera to Player
 * @desc Smoothly move camera to center on the player
 *
 * @arg duration
 * @text Duration
 * @desc Animation duration in frames (0=instant, 60=1 second)
 * @type number
 * @min 0
 * @max 600
 * @default 60
 *
 * @arg offsetX
 * @text Offset X
 * @desc Additional horizontal offset in tiles
 * @type number
 * @min -20
 * @max 20
 * @default 0
 *
 * @arg offsetY
 * @text Offset Y
 * @desc Additional vertical offset in tiles
 * @type number
 * @min -20
 * @max 20
 * @default 0
 *
 * @command moveCameraToPosition
 * @text Move Camera to Position
 * @desc Smoothly move camera to specific coordinates
 *
 * @arg x
 * @text X Coordinate
 * @desc Target X coordinate in tiles
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg y
 * @text Y Coordinate
 * @desc Target Y coordinate in tiles
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg duration
 * @text Duration
 * @desc Animation duration in frames (0=instant, 60=1 second)
 * @type number
 * @min 0
 * @max 600
 * @default 60
 *
 * @command stopCameraAnimation
 * @text Stop Camera Animation
 * @desc Immediately stop any ongoing camera animation
 *
 * @command setCameraFollow
 * @text Set Camera Follow
 * @desc Set what the camera should follow (Player, Event, or None)
 *
 * @arg followType
 * @text Follow Type
 * @desc What the camera should follow
 * @type select
 * @option Player
 * @value player
 * @option Event
 * @value event
 * @option None (Manual Control)
 * @value none
 * @default player
 *
 * @arg eventId
 * @text Event ID (if following event)
 * @desc ID of event to follow (only used if Follow Type is Event)
 * @type number
 * @min 0
 * @max 999
 * @default 0
 *
 * @arg offsetX
 * @text Follow Offset X
 * @desc Horizontal offset from follow target in tiles
 * @type number
 * @min -20
 * @max 20
 * @default 0
 *
 * @arg offsetY
 * @text Follow Offset Y
 * @desc Vertical offset from follow target in tiles
 * @type number
 * @min -20
 * @max 20
 * @default 0
 *
 * @command restoreDefaultCamera
 * @text Restore Default Camera
 * @desc Restore RPG Maker's default camera behavior (following player)
 */

/*
 * Event Customizer Plugin
 *
 * This plugin allows you to customize various aspects of events on the map.
 *
 * Features:
 * - Always Update Movement: Events with the note tag <Always Update Movement>
 * will continue updating their movement even when off-screen.
 * - Custom Movement Scripts: Enhanced script commands for precise event movement.
 * - Picture Binding: Bind pictures to events so they move together automatically.
 * - Sprite Zooming: Scale character sprites with smooth animations.
 * - Sprite Rotation: Rotate sprites with configurable pivot points.
 * - Diagonal Movement: Optional 8-directional movement for the player character.
 * - Region Blocking: Designate specific regions as non-passable for all characters.
 * - Balloon Icons: Show balloon icons above characters using script commands.
 * - Follower Control: Redirect player commands to specific followers (FIXED).
 * - Follower Chase Control: Start/stop followers from chasing the player.
 * - Camera Control: Smooth camera movement and following system.
 *
 * Usage:
 * Add the note tag <Always Update Movement> to any event's note box to make
 * that event always update its movement, regardless of screen position.
 *
 * Use custom script commands in event Script calls:
 * LEFT: 30 - Move event 30 tiles to the left
 * RIGHT: 25 - Move event 25 tiles to the right
 * UP: 15 - Move event 15 tiles up
 * DOWN: 20 - Move event 20 tiles down
 * LOWER LEFT: 40 - Move diagonally lower left 40 tiles
 * LOWER RIGHT: 40 - Move diagonally lower right 40 tiles
 * UPPER LEFT: 40 - Move diagonally upper left 40 tiles
 * UPPER RIGHT: 40 - Move diagonally upper right 40 tiles
 * TELEPORT: 46, 24 - Instantly teleport event to coordinates (46, 24)
 * MOVE: 15, 31 - Move event to coordinates (15, 31) using pathfinding
 *
 * BALLOON COMMANDS:
 * BALLOON: 1 - Show balloon icon by ID (1-10)
 * BALLOON: EXCLAMATION - Show exclamation balloon
 * BALLOON: ! - Show exclamation balloon (shortcut)
 * BALLOON: QUESTION - Show question balloon
 * BALLOON: ? - Show question balloon (shortcut)
 * BALLOON: MUSIC NOTE - Show music note balloon
 * BALLOON: HEART - Show heart balloon
 * BALLOON: ANGER - Show anger balloon
 * BALLOON: SWEAT - Show sweat balloon
 * BALLOON: COBWEB - Show cobweb balloon
 * BALLOON: SILENCE - Show silence balloon
 * BALLOON: ... - Show silence balloon (shortcut)
 * BALLOON: LIGHT BULB - Show light bulb balloon
 * BALLOON: ZZZ - Show sleep balloon
 *
 * Balloon ID Reference:
 * 1 = Exclamation, 2 = Question, 3 = Music Note, 4 = Heart, 5 = Anger
 * 6 = Sweat, 7 = Cobweb, 8 = Silence, 9 = Light Bulb, 10 = Zzz
 *
 * Follower Control (COMPLETELY REWRITTEN):
 * Use the "Set Follower Control" plugin command to redirect player commands:
 * - Follower 0: Player (default)
 * - Follower 1+: Any number of followers
 * When a follower is selected, ALL commands targeting the player
 * (Set Movement Route, Show Animation, Show Balloon Icon, etc.)
 * will instead affect the selected follower.
 *
 * Follower Chase Control:
 * Use "Stop Follower Chase" and "Start Follower Chase" plugin commands to control
 * whether followers chase the player:
 * - Follower ID -1: All followers
 * - Follower ID 1+: Specific followers
 *
 * Camera Control:
 * Use camera plugin commands to control camera movement and following:
 * - Move Camera to Event: Pan camera to specific event with offset
 * - Move Camera to Player: Center camera on player with offset
 * - Move Camera to Position: Move to specific coordinates
 * - Stop Camera Animation: Halt ongoing camera movement
 * - Set Camera Follow: Make camera follow player, event, or disable following
 * Camera system works alongside default scroll map commands without interference.
 *
 * Use plugin commands to control character sprites:
 * - Bind Picture to Event: Link pictures to follow events
 * - Zoom Sprite: Scale sprites proportionally
 * - Zoom Sprite Advanced: Scale with separate X/Y control
 * - Rotate Sprite: Rotate with configurable pivot point (relative)
 * - Rotate Sprite Absolute: Set to specific angle with configurable pivot point
 * - Set Follower Control: Redirect player commands to followers
 * - Stop Follower Chase: Stop followers from chasing the player
 * - Start Follower Chase: Resume followers chasing the player
 * - Move Camera to Event: Pan camera to event
 * - Move Camera to Player: Center camera on player
 * - Move Camera to Position: Move camera to coordinates
 * - Stop Camera Animation: Stop camera movement
 * - Set Camera Follow: Control camera following behavior
 *
 * Script Commands:
 * stopFollowerChase(-1) - Stop all followers from chasing
 * startFollowerChase(2) - Resume follower 2 chasing the player
 * isFollowerChaseEnabled(0) - Check if first follower is chasing
 * moveCameraToEvent(5, 60, 0, 0) - Move camera to event 5 over 1 second
 * moveCameraToPlayer(120, 1, -1) - Move camera to player with offset
 * setCameraFollow('event', 3, 0, 0) - Follow event 3
 * stopCameraAnimation() - Stop camera movement
 *
 * Rotation Pivot Points:
 * - X: 0.0=left edge, 0.5=center, 1.0=right edge
 * - Y: 0.0=top edge, 0.5=center, 1.0=bottom edge
 * - Default (0.5, 1.0) = center horizontally, bottom vertically
 *
 * Diagonal Movement:
 * Enable "Enable Diagonal Movement" in plugin parameters to allow the player
 * to move diagonally by holding two direction keys simultaneously.
 *
 * Region Blocking:
 * Enter region IDs in the "Blocked Regions" parameter (comma-separated, e.g., "120,121,122")
 * to make those regions completely impassable for both players and events.
 * Blocked regions override normal terrain passability.
 *
 * Target IDs: 0=Player, 1-9999=Events, -1 to -10=Followers
 *
 * Note Tags:
 * <Always Update Movement> - Event will always update movement when off-screen
 *
 * Terms of Use:
 * Free for commercial and non-commercial use.
 *
 * @version 1.8.0
 * @since 1.0.0 - Initial Release
 * @since 1.0.3 - Fixed script evaluation by preprocessing movement routes
 * @since 1.0.4 - Preprocess autonomous custom move routes
 * @since 1.0.5 - Added diagonal movement support
 * @since 1.0.6 - Fixed movement by expanding routes instead of queuing
 * @since 1.1.0 - Added picture binding system and sprite zooming
 * @since 1.2.0 - Added sprite rotation system
 * @since 1.2.1 - Fixed sprite zoom/rotation persistence through menu navigation
 * @since 1.3.0 - Added optional diagonal movement for player character
 * @since 1.4.0 - Added region blocking system
 * @since 1.4.1 - Enhanced rotation with configurable pivot points (fixed positioning)
 * @since 1.5.0 - Added balloon icon support for movement script commands
 * @since 1.6.0 - Added follower control system for redirecting player movement routes
 * @since 1.7.0 - COMPLETELY REWRITTEN follower control using character() override, removed hard caps, fixed chase control
 * @since 1.8.0 - Added comprehensive camera control system with smooth animations and following, FIXED camera snapping issues
 */
(() => {
    'use strict';

    const pluginName = "PSYCHRONIC_EventCustomizerMZ";
    const parameters = PluginManager.parameters(pluginName);
    const enableDiagonalMovement = parameters['enableDiagonalMovement'] === 'true';

    // Parse blocked regions from parameter string
    const blockedRegionsParam = parameters['blockedRegions'] || '';
    const blockedRegions = new Set();
    if (blockedRegionsParam.trim()) {
        blockedRegionsParam.split(',').forEach(regionStr => {
            const regionId = parseInt(regionStr.trim());
            if (!isNaN(regionId) && regionId > 0 && regionId <= 255) {
                blockedRegions.add(regionId);
            }
        });
    }


    const detectorConfigsParam = parameters['detectorConfigs'] || '[]';
    const detectorConfigs = new Map();

    try {
        const configs = JSON.parse(detectorConfigsParam);
        for (const configStr of configs) {
            const config = JSON.parse(configStr);
            detectorConfigs.set(parseInt(config.id), {
                id: parseInt(config.id),
                                pattern: config.pattern || 'chase',
                                range: parseInt(config.range) || 5,
                                chaseRange: parseInt(config.chaseRange) || 3,
                                lineOfSight: config.lineOfSight === 'true',
                                moveSpeed: parseInt(config.moveSpeed) || 0,
                                loseSightDistance: parseInt(config.loseSightDistance) || 0
            });
        }
    } catch (e) {
        console.warn('Error parsing detector configs:', e);
    }

    //=============================================================================
    // Plugin Command Registration
    //=============================================================================



    PluginManager.registerCommand(pluginName, "bindPictureToEvent", args => {
        const pictureId = parseInt(args.pictureId);
        const eventId = parseInt(args.eventId);
        const offsetX = parseInt(args.offsetX);
        const offsetY = parseInt(args.offsetY);

        // Use current event if eventId is 0
        const targetEventId = eventId === 0 ? $gameMap._interpreter.eventId() : eventId;

        bindPictureToEvent(pictureId, targetEventId, offsetX, offsetY);
    });

    PluginManager.registerCommand(pluginName, "unbindPicture", args => {
        const pictureId = parseInt(args.pictureId);
        unbindPicture(pictureId);
    });

    PluginManager.registerCommand(pluginName, "zoomSprite", args => {
        const targetId = parseInt(args.targetId);
        const zoom = parseFloat(args.zoom);
        const duration = parseInt(args.duration);

        // Use proportional zoom for both X and Y
        spriteZoom(targetId, zoom, duration, zoom, duration);
    });

    PluginManager.registerCommand(pluginName, "zoomSpriteAdvanced", args => {
        const targetId = parseInt(args.targetId);
        const zoomX = parseFloat(args.zoomX);
        const zoomY = parseFloat(args.zoomY);
        const durationX = parseInt(args.durationX);
        const durationY = parseInt(args.durationY);

        spriteZoom(targetId, zoomX, durationX, zoomY, durationY);
    });

    PluginManager.registerCommand(pluginName, "rotateSprite", args => {
        const targetId = parseInt(args.targetId);
        const rotation = parseFloat(args.rotation);
        const duration = parseInt(args.duration);
        const continuous = args.continuous === 'true';
        const pivotX = parseFloat(args.pivotX || 0.5);
        const pivotY = parseFloat(args.pivotY || 1.0);

        rotateSprite(targetId, rotation, duration, continuous, false, pivotX, pivotY);
    });

    PluginManager.registerCommand(pluginName, "rotateSpriteAbsolute", args => {
        const targetId = parseInt(args.targetId);
        const rotation = parseFloat(args.rotation);
        const duration = parseInt(args.duration);
        const continuous = args.continuous === 'true';
        const pivotX = parseFloat(args.pivotX || 0.5);
        const pivotY = parseFloat(args.pivotY || 1.0);

        rotateSprite(targetId, rotation, duration, continuous, true, pivotX, pivotY);
    });

    PluginManager.registerCommand(pluginName, "setFollowerControl", args => {
        const followerId = parseInt(args.followerId);

        // Get the current interpreter to set its follower control target
        const interpreter = $gameMap._interpreter;
        if (interpreter) {
            interpreter.setFollowerControlTarget(followerId);
        } else {
            console.warn('No active interpreter found for setFollowerControl');
        }
    });

    PluginManager.registerCommand(pluginName, "stopFollowerChase", args => {
        const followerId = parseInt(args.followerId);
        stopFollowerChase(followerId);
    });

    PluginManager.registerCommand(pluginName, "startFollowerChase", args => {
        const followerId = parseInt(args.followerId);
        startFollowerChase(followerId);
    });

    PluginManager.registerCommand(pluginName, "moveCameraToEvent", args => {
        const eventId = parseInt(args.eventId);
        const duration = parseInt(args.duration);
        const offsetX = parseInt(args.offsetX);
        const offsetY = parseInt(args.offsetY);

        moveCameraToEvent(eventId, duration, offsetX, offsetY);
    });

    PluginManager.registerCommand(pluginName, "moveCameraToPlayer", args => {
        const duration = parseInt(args.duration);
        const offsetX = parseInt(args.offsetX);
        const offsetY = parseInt(args.offsetY);

        moveCameraToPlayer(duration, offsetX, offsetY);
    });

    PluginManager.registerCommand(pluginName, "moveCameraToPosition", args => {
        const x = parseInt(args.x);
        const y = parseInt(args.y);
        const duration = parseInt(args.duration);

        moveCameraToPosition(x, y, duration);
    });

    PluginManager.registerCommand(pluginName, "restoreDefaultCamera", args => {
        restoreDefaultCamera();
    });

    PluginManager.registerCommand(pluginName, "stopCameraAnimation", args => {
        stopCameraAnimation();
    });

    PluginManager.registerCommand(pluginName, "setCameraFollow", args => {
        const followType = args.followType || 'player';
        const eventId = parseInt(args.eventId) || 0;
        const offsetX = parseInt(args.offsetX) || 0;
        const offsetY = parseInt(args.offsetY) || 0;

        setCameraFollow(followType, eventId, offsetX, offsetY);
    });

    //=============================================================================
    // Game_Interpreter Extensions for Follower Control (COMPLETELY REWRITTEN)
    //=============================================================================

    // Store original Game_Interpreter methods
    const _Game_Interpreter_initialize = Game_Interpreter.prototype.initialize;
    const _Game_Interpreter_character = Game_Interpreter.prototype.character;

    /**
     * Initialize interpreter with follower control properties
     */
    Game_Interpreter.prototype.initialize = function(depth) {
        _Game_Interpreter_initialize.call(this, depth);
        this._followerControlTarget = 0; // 0 = Player, 1+ = Followers
    };

    /**
     * Override setupChild to inherit follower control target from parent
     */
    const _Game_Interpreter_setupChild = Game_Interpreter.prototype.setupChild;
    Game_Interpreter.prototype.setupChild = function(list, eventId) {
        _Game_Interpreter_setupChild.call(this, list, eventId);

        // Pass follower control target to child interpreter
        if (this._childInterpreter) {
            this._childInterpreter._followerControlTarget = this._followerControlTarget;
        }
    };

    /**
     * Override character method to redirect player targeting to selected follower
     * This is called by Set Movement Route, Show Animation, Show Balloon Icon, etc.
     */
    Game_Interpreter.prototype.character = function(param) {
        if ($gameParty.inBattle()) {
            return null;
        } else if (param < 0) {
            // param -1 = "Player" in event commands
            // Return the currently selected follower control target
            return this.getFollowerControlTarget();
        } else {
            // Use original method for events (param >= 0)
            return _Game_Interpreter_character.call(this, param);
        }
    };

    /**
     * Get the current follower control target character
     */
    Game_Interpreter.prototype.getFollowerControlTarget = function() {
        if (this._followerControlTarget === 0) {
            return $gamePlayer;
        } else {
            const followerIndex = this._followerControlTarget - 1;
            const follower = $gamePlayer._followers.follower(followerIndex);

            if (follower) {
                // Don't require an actor - just check if follower exists
                return follower;
            } else {
                console.warn(`Follower ${this._followerControlTarget} does not exist - only ${$gamePlayer._followers._data.length} followers available`);
                // Return player instead of null to avoid breaking movement routes
                return $gamePlayer;
            }
        }
    };

    /**
     * Set the follower control target for this interpreter
     */
    Game_Interpreter.prototype.setFollowerControlTarget = function(followerId) {
        this._followerControlTarget = followerId;

        // Also set it for any active child interpreter
        if (this._childInterpreter) {
            this._childInterpreter._followerControlTarget = followerId;
        }

        if (followerId === 0) {
        } else {
        }
    };

    //=============================================================================
    // Follower Control System (UPDATED TO USE CHARACTER METHOD OVERRIDE)
    //=============================================================================

    /**
     * Set which character receives player movement routes (UPDATED)
     */
    function setFollowerControl(followerId) {
        // Validate follower ID (remove hard cap, just check minimum)
        if (followerId < 0) {
            console.warn(`Invalid follower ID: ${followerId}. Must be 0 or higher.`);
            return;
        }

        // Check if follower exists (for non-player targets)
        if (followerId > 0) {
            const follower = $gamePlayer._followers.follower(followerId - 1);
            if (!follower || !follower.actor()) {
                console.warn(`Follower ${followerId} does not exist or has no actor.`);
                return;
            }
        }

        // Get the current interpreter and set its target
        const interpreter = $gameMap._interpreter;
        if (interpreter) {
            interpreter.setFollowerControlTarget(followerId);
        } else {
            console.warn('No active interpreter found for setFollowerControl');
        }
    }

    /**
     * Get the current control target character (DEPRECATED - use interpreter.getFollowerControlTarget())
     */
    function getCurrentControlTarget() {
        const interpreter = $gameMap._interpreter;
        return interpreter ? interpreter._followerControlTarget : 0;
    }

    /**
     * Get the character object for the current control target (DEPRECATED)
     */
    function getCurrentControlCharacter() {
        const interpreter = $gameMap._interpreter;
        return interpreter ? interpreter.getFollowerControlTarget() : $gamePlayer;
    }

    //=============================================================================
    // Follower Chase Control System (FIXED VERSION)
    //=============================================================================

    // Global storage for follower chase states
    let followerChaseStates = new Map(); // Maps follower index to chase enabled/disabled

    /**
     * Stop follower(s) from chasing the player (FIXED - no hard cap)
     */
    function stopFollowerChase(followerId) {
        if (followerId === -1) {
            // Stop all followers
            for (let i = 0; i < $gamePlayer._followers._data.length; i++) {
                followerChaseStates.set(i, false);
            }
        } else if (followerId >= 1) {
            // Stop specific follower
            const followerIndex = followerId - 1;
            const follower = $gamePlayer._followers.follower(followerIndex);
            if (follower) {
                followerChaseStates.set(followerIndex, false);
            } else {
                console.warn(`Follower ${followerId} does not exist`);
            }
        } else {
            console.warn(`Invalid follower ID: ${followerId}. Use -1 for all, or 1+ for specific followers.`);
        }
    }

    /**
     * Resume follower(s) chasing the player (FIXED - no hard cap)
     */
    function startFollowerChase(followerId) {
        if (followerId === -1) {
            // Start all followers
            for (let i = 0; i < $gamePlayer._followers._data.length; i++) {
                followerChaseStates.set(i, true);
            }
        } else if (followerId >= 1) {
            // Start specific follower
            const followerIndex = followerId - 1;
            const follower = $gamePlayer._followers.follower(followerIndex);
            if (follower) {
                followerChaseStates.set(followerIndex, true);
            } else {
                console.warn(`Follower ${followerId} does not exist`);
            }
        } else {
            console.warn(`Invalid follower ID: ${followerId}. Use -1 for all, or 1+ for specific followers.`);
        }
    }

    /**
     * Check if a follower should chase the player
     */
    function isFollowerChaseEnabled(followerIndex) {
        // Default to true if not set
        return followerChaseStates.get(followerIndex) !== false;
    }

    /**
     * Get all follower chase states for saving
     */
    function getFollowerChaseStates() {
        return Object.fromEntries(followerChaseStates);
    }

    /**
     * Set all follower chase states from save data
     */
    function setFollowerChaseStates(statesData) {
        if (statesData) {
            followerChaseStates = new Map(Object.entries(statesData).map(
                ([key, value]) => [parseInt(key), value]
            ));
        } else {
            followerChaseStates = new Map();
        }
    }

    //=============================================================================
    // Override Follower Chase Behavior
    //=============================================================================

    // Store original Game_Follower methods
    const _Game_Follower_chaseCharacter = Game_Follower.prototype.chaseCharacter;

    /**
     * Override chaseCharacter to respect chase control settings
     */
    Game_Follower.prototype.chaseCharacter = function(character) {
        // Get this follower's index in the followers array
        const followerIndex = $gamePlayer._followers._data.indexOf(this);

        // Check if this follower should chase
        if (followerIndex >= 0 && !isFollowerChaseEnabled(followerIndex)) {
            // Don't chase if disabled
            return;
        }

        // Use original chase behavior if enabled
        _Game_Follower_chaseCharacter.call(this, character);
    };

    //=============================================================================
    // Camera Control System
    //=============================================================================

    // Global storage for camera control data
    let cameraControlData = {
        isAnimating: false,
        startX: 0,
        startY: 0,
        targetX: 0,
        targetY: 0,
        duration: 0,
        remaining: 0,
        followType: 'none', // 'player', 'event', 'none' - START WITH 'none' to prevent conflicts
        followEventId: 0,
        followOffsetX: 0,
        followOffsetY: 0,
        wasFollowingBeforeAnimation: false,
        _originalFollowType: null
    };

    /**
     * Move camera to specific event
     */
    function moveCameraToEvent(eventId, duration = 60, offsetX = 0, offsetY = 0) {
        // Use current event if eventId is 0
        const targetEventId = eventId === 0 ? $gameMap._interpreter.eventId() : eventId;
        const event = $gameMap.event(targetEventId);

        if (!event) {
            console.warn(`Event ${targetEventId} not found for camera movement`);
            return;
        }

        const targetX = event._x + offsetX;
        const targetY = event._y + offsetY;

        moveCameraToPosition(targetX, targetY, duration);
    }

    /**
     * Move camera to player
     */
    function moveCameraToPlayer(duration = 60, offsetX = 0, offsetY = 0) {
        const targetX = $gamePlayer._x + offsetX;
        const targetY = $gamePlayer._y + offsetY;

        moveCameraToPosition(targetX, targetY, duration);
    }

    /**
     * Move camera to specific coordinates
     */
    function moveCameraToPosition(x, y, duration = 60) {
        cameraControlData.manuallyControlled = true;

        // Save current follow state and disable following during animation
        if (cameraControlData.followType !== 'none') {
            cameraControlData.wasFollowingBeforeAnimation = true;
        }

        // Temporarily disable following to prevent interference
        const originalFollowType = cameraControlData.followType;
        cameraControlData.followType = 'none';

        // Calculate centered display position (account for screen center)
        const centerX = x - $gameMap.screenTileX() / 2;
        const centerY = y - $gameMap.screenTileY() / 2;

        // Clamp to map boundaries
        const targetDisplayX = Math.max(0, Math.min(centerX, $gameMap.width() - $gameMap.screenTileX()));
        const targetDisplayY = Math.max(0, Math.min(centerY, $gameMap.height() - $gameMap.screenTileY()));

        if (duration === 0) {
            // Instant movement
            $gameMap.setDisplayPos(targetDisplayX, targetDisplayY);
            cameraControlData.isAnimating = false;

            // Restore follow type if it was following before
            if (cameraControlData.wasFollowingBeforeAnimation) {
                cameraControlData.followType = originalFollowType;
                cameraControlData.wasFollowingBeforeAnimation = false;
            }

        } else {
            // Animated movement
            cameraControlData.isAnimating = true;
            cameraControlData.startX = $gameMap._displayX;
            cameraControlData.startY = $gameMap._displayY;
            cameraControlData.targetX = targetDisplayX;
            cameraControlData.targetY = targetDisplayY;
            cameraControlData.duration = duration;
            cameraControlData.remaining = duration;
            cameraControlData._originalFollowType = originalFollowType; // Store for restoration
        }
    }

    /**
     * Stop camera animation
     */
    function stopCameraAnimation() {
        if (cameraControlData.isAnimating) {
            cameraControlData.isAnimating = false;
            cameraControlData.remaining = 0;

            // Restore follow type if it was following before animation
            if (cameraControlData.wasFollowingBeforeAnimation && cameraControlData._originalFollowType) {
                cameraControlData.followType = cameraControlData._originalFollowType;
                cameraControlData.wasFollowingBeforeAnimation = false;
                cameraControlData._originalFollowType = null;
            }

        }
    }

    /**
     * Set camera follow behavior
     */
    function setCameraFollow(followType, eventId = 1, offsetX = 0, offsetY = 0) {
        // Stop any current animation
        stopCameraAnimation();

        cameraControlData.followType = followType;
        cameraControlData.followEventId = eventId;
        cameraControlData.followOffsetX = offsetX;
        cameraControlData.followOffsetY = offsetY;
        cameraControlData.wasFollowingBeforeAnimation = false;

        // Mark as manually controlled if not following player normally
        if (followType !== 'player' || offsetX !== 0 || offsetY !== 0) {
            cameraControlData.manuallyControlled = true;
        } else {
            // Reset to normal behavior when following player with no offset
            cameraControlData.manuallyControlled = false;
        }

        switch (followType) {
            case 'player':
                if (offsetX === 0 && offsetY === 0) {
                } else {
                }
                break;
            case 'event':
                break;
            case 'none':
                cameraControlData.manuallyControlled = true;
                break;
            default:
                console.warn(`Unknown follow type: ${followType}`);
                break;
        }
    }

    /**
     * Update camera position during animations and following
     */
    function updateCameraControl() {
        // Handle camera animation
        if (cameraControlData.isAnimating && cameraControlData.remaining > 0) {
            const progress = 1 - (cameraControlData.remaining / cameraControlData.duration);

            // Smooth easing (ease-in-out)
            const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            const currentX = cameraControlData.startX +
            (cameraControlData.targetX - cameraControlData.startX) * easedProgress;
            const currentY = cameraControlData.startY +
            (cameraControlData.targetY - cameraControlData.startY) * easedProgress;

            $gameMap.setDisplayPos(currentX, currentY);
            cameraControlData.remaining--;

            // Animation finished
            if (cameraControlData.remaining === 0) {
                $gameMap.setDisplayPos(cameraControlData.targetX, cameraControlData.targetY);
                cameraControlData.isAnimating = false;

                // Restore follow type if it was following before animation
                if (cameraControlData.wasFollowingBeforeAnimation && cameraControlData._originalFollowType) {
                    cameraControlData.followType = cameraControlData._originalFollowType;
                    cameraControlData.wasFollowingBeforeAnimation = false;
                    cameraControlData._originalFollowType = null;
                }
            }
        }
        // Handle camera following (only when not animating)
        else if (!cameraControlData.isAnimating && cameraControlData.followType !== 'none') {
            updateCameraFollowing();
        }
    }

    /**
     * Update camera following behavior
     */
    function updateCameraFollowing() {
        let targetX, targetY;

        switch (cameraControlData.followType) {
            case 'player':
                targetX = $gamePlayer._realX + cameraControlData.followOffsetX;
                targetY = $gamePlayer._realY + cameraControlData.followOffsetY;
                break;

            case 'event':
                const event = $gameMap.event(cameraControlData.followEventId);
                if (event) {
                    targetX = event._realX + cameraControlData.followOffsetX;
                    targetY = event._realY + cameraControlData.followOffsetY;
                } else {
                    // Event not found, fall back to player
                    targetX = $gamePlayer._realX;
                    targetY = $gamePlayer._realY;
                    console.warn(`Follow event ${cameraControlData.followEventId} not found, following player instead`);
                }
                break;

            default:
                return; // No following
        }

        // Calculate centered display position
        const centerX = targetX - $gameMap.screenTileX() / 2;
        const centerY = targetY - $gameMap.screenTileY() / 2;

        // Get current camera position
        let currentX = $gameMap._displayX;
        let currentY = $gameMap._displayY;

        // Handle looping maps - calculate shortest path considering wrapping
        let newX = centerX;
        let newY = centerY;

        if ($gameMap.isLoopHorizontal()) {
            // Calculate wrapped distance
            const mapWidth = $gameMap.width();
            const dx1 = centerX - currentX;
            const dx2 = dx1 > 0 ? dx1 - mapWidth : dx1 + mapWidth;

            // Use the shorter distance
            if (Math.abs(dx2) < Math.abs(dx1)) {
                newX = currentX + dx2;
            } else {
                newX = currentX + dx1;
            }
        } else {
            // Clamp to map boundaries for non-looping horizontal
            newX = Math.max(0, Math.min(centerX, $gameMap.width() - $gameMap.screenTileX()));
        }

        if ($gameMap.isLoopVertical()) {
            // Calculate wrapped distance
            const mapHeight = $gameMap.height();
            const dy1 = centerY - currentY;
            const dy2 = dy1 > 0 ? dy1 - mapHeight : dy1 + mapHeight;

            // Use the shorter distance
            if (Math.abs(dy2) < Math.abs(dy1)) {
                newY = currentY + dy2;
            } else {
                newY = currentY + dy1;
            }
        } else {
            // Clamp to map boundaries for non-looping vertical
            newY = Math.max(0, Math.min(centerY, $gameMap.height() - $gameMap.screenTileY()));
        }

        // Always update to ensure smooth following (like RPG Maker's default behavior)
        $gameMap.setDisplayPos(newX, newY);
    }

    /**
     * Check if camera is currently being controlled by this system
     */
    function isCameraControlActive() {
        return cameraControlData.isAnimating ||
        (cameraControlData.manuallyControlled && cameraControlData.followType === 'none') ||
        (cameraControlData.followType === 'event') ||
        (cameraControlData.followType === 'player' &&
        (cameraControlData.followOffsetX !== 0 || cameraControlData.followOffsetY !== 0));
    }

    //=============================================================================
    // Override RPG Maker's Built-in Camera System
    //=============================================================================

    // Store original methods
    const _Game_Map_updateScroll = Game_Map.prototype.updateScroll;
    const _Game_Player_updateScroll = Game_Player.prototype.updateScroll;

    /**
     * Override Game_Map scrolling when camera control is active
     */
    Game_Map.prototype.updateScroll = function() {
        // Don't use RPG Maker's scroll system when our camera control is active
        if (isCameraControlActive()) {
            return;
        }

        // Use original scrolling behavior when camera control is inactive
        _Game_Map_updateScroll.call(this);
    };

    /**
     * Override Game_Player scrolling when camera control is active
     */
    Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
        // Only disable player scrolling when we're actively controlling the camera
        // AND we're in manual mode or following something other than the player normally
        if (cameraControlData.isAnimating ||
            (cameraControlData.manuallyControlled && cameraControlData.followType === 'none') ||
            cameraControlData.followType === 'event') {
            return;
            }

            // Use original player scroll behavior for normal operation
            _Game_Player_updateScroll.call(this, lastScrolledX, lastScrolledY);
    };

    function restoreDefaultCamera() {
        // Stop any current animation
        if (cameraControlData.isAnimating) {
            cameraControlData.isAnimating = false;
            cameraControlData.remaining = 0;
        }

        // Reset all camera control data to default state
        cameraControlData.followType = 'none';
        cameraControlData.followEventId = 0;
        cameraControlData.followOffsetX = 0;
        cameraControlData.followOffsetY = 0;
        cameraControlData.manuallyControlled = false;
        cameraControlData.wasFollowingBeforeAnimation = false;
        cameraControlData._originalFollowType = null;

        // Reset display positions to current location
        // This prevents any jarring jumps when switching back
        cameraControlData.startX = 0;
        cameraControlData.startY = 0;
        cameraControlData.targetX = 0;
        cameraControlData.targetY = 0;
        cameraControlData.duration = 0;

    }

    //=============================================================================
    // Picture Binding System
    //=============================================================================

    // Global storage for picture bindings
    let pictureBindings = new Map();

    /**
     * Bind a picture to an event
     */
    function bindPictureToEvent(pictureId, eventId, offsetX = 0, offsetY = 0) {
        const event = $gameMap.event(eventId);
        if (!event) {
            console.warn(`Event ${eventId} not found for picture binding`);
            return;
        }

        const picture = $gameScreen.picture(pictureId);
        if (!picture) {
            console.warn(`Picture ${pictureId} not found for binding`);
            return;
        }

        // Store the binding
        pictureBindings.set(pictureId, {
            eventId: eventId,
            offsetX: offsetX,
            offsetY: offsetY
        });

        // Immediately update picture position
        updateBoundPicturePosition(pictureId);

    }

    /**
     * Unbind a picture from its event
     */
    function unbindPicture(pictureId) {
        if (pictureBindings.has(pictureId)) {
            pictureBindings.delete(pictureId);
        }
    }

    /**
     * Update bound picture position based on its event's location
     */
    function updateBoundPicturePosition(pictureId) {
        const binding = pictureBindings.get(pictureId);
        if (!binding) return;

        const event = $gameMap.event(binding.eventId);
        const picture = $gameScreen.picture(pictureId);

        if (!event || !picture) {
            // Clean up invalid binding
            pictureBindings.delete(pictureId);
            return;
        }

        // Convert event position to screen coordinates
        const screenX = $gameMap.adjustX(event._realX) * $gameMap.tileWidth() + $gameMap.tileWidth() / 2;
        const screenY = $gameMap.adjustY(event._realY) * $gameMap.tileHeight() + $gameMap.tileHeight() / 2;

        // Apply offset and update picture position
        const newX = screenX + binding.offsetX;
        const newY = screenY + binding.offsetY;

        // Directly set picture position (bypassing the normal picture commands)
        picture._x = newX;
        picture._y = newY;
    }

    /**
     * Update all bound pictures
     */
    function updateAllBoundPictures() {
        for (const pictureId of pictureBindings.keys()) {
            updateBoundPicturePosition(pictureId);
        }
    }

    //=============================================================================
    // Sprite Zoom System (Fixed Version)
    //=============================================================================

    // Global storage for sprite zoom data - now keyed by targetId instead of sprite reference
    let spriteZoomData = new Map();

    /**
     * Main sprite zoom function
     */
    function spriteZoom(targetId, zoomX, durationX, zoomY = null, durationY = null) {
        // If zoomY not specified, use zoomX (proportional)
        if (zoomY === null) zoomY = zoomX;
        if (durationY === null) durationY = durationX;

        const sprite = findSpriteByTargetId(targetId);
        if (!sprite) {
            console.warn(`Sprite not found for target ID: ${targetId}`);
            return;
        }

        // Initialize or get zoom data by targetId
        if (!spriteZoomData.has(targetId)) {
            spriteZoomData.set(targetId, {
                baseScaleX: 1.0,
                baseScaleY: 1.0,
                targetScaleX: 1.0,
                targetScaleY: 1.0,
                currentScaleX: sprite.scale.x,
                currentScaleY: sprite.scale.y,
                durationX: 0,
                durationY: 0,
                remainingX: 0,
                remainingY: 0,
                targetId: targetId
            });
        }

        const zoomData = spriteZoomData.get(targetId);

        // Set new targets
        zoomData.targetScaleX = zoomX;
        zoomData.targetScaleY = zoomY;
        zoomData.durationX = Math.max(0, durationX);
        zoomData.durationY = Math.max(0, durationY);
        zoomData.remainingX = zoomData.durationX;
        zoomData.remainingY = zoomData.durationY;
        zoomData.currentScaleX = sprite.scale.x;
        zoomData.currentScaleY = sprite.scale.y;

        // If duration is 0, set immediately
        if (durationX === 0) {
            sprite.scale.x = zoomX;
            zoomData.currentScaleX = zoomX;
            zoomData.remainingX = 0;
        }

        if (durationY === 0) {
            sprite.scale.y = zoomY;
            zoomData.currentScaleY = zoomY;
            zoomData.remainingY = 0;
        }

    }

    /**
     * Apply stored zoom data to a sprite (used when sprites are recreated)
     */
    function applyStoredZoomToSprite(targetId) {
        const sprite = findSpriteByTargetId(targetId);
        const zoomData = spriteZoomData.get(targetId);

        if (!sprite || !zoomData) return;

        // Apply the current zoom state to the sprite
        sprite.scale.x = zoomData.currentScaleX;
        sprite.scale.y = zoomData.currentScaleY;
    }

    /**
     * Update all sprite zoom animations
     */
    function updateSpriteZooms() {
        for (const [targetId, zoomData] of spriteZoomData.entries()) {
            const sprite = findSpriteByTargetId(targetId);

            if (!sprite) {
                // Sprite not found, skip this frame
                continue;
            }

            // Ensure sprite has correct scale if it was recreated
            if (zoomData.remainingX === 0 && zoomData.remainingY === 0) {
                // No animation running, ensure sprite has correct final scale
                if (Math.abs(sprite.scale.x - zoomData.currentScaleX) > 0.001) {
                    sprite.scale.x = zoomData.currentScaleX;
                }
                if (Math.abs(sprite.scale.y - zoomData.currentScaleY) > 0.001) {
                    sprite.scale.y = zoomData.currentScaleY;
                }
            }

            let needsUpdate = false;

            // Update X scale animation
            if (zoomData.remainingX > 0) {
                const newScaleX = zoomData.currentScaleX +
                (zoomData.targetScaleX - zoomData.currentScaleX) *
                (1 / zoomData.remainingX);

                sprite.scale.x = newScaleX;
                zoomData.currentScaleX = newScaleX;
                zoomData.remainingX--;
                needsUpdate = true;

                if (zoomData.remainingX === 0) {
                    sprite.scale.x = zoomData.targetScaleX;
                    zoomData.currentScaleX = zoomData.targetScaleX;
                }
            }

            // Update Y scale animation
            if (zoomData.remainingY > 0) {
                const newScaleY = zoomData.currentScaleY +
                (zoomData.targetScaleY - zoomData.currentScaleY) *
                (1 / zoomData.remainingY);

                sprite.scale.y = newScaleY;
                zoomData.currentScaleY = newScaleY;
                zoomData.remainingY--;
                needsUpdate = true;

                if (zoomData.remainingY === 0) {
                    sprite.scale.y = zoomData.targetScaleY;
                    zoomData.currentScaleY = zoomData.targetScaleY;
                }
            }
        }
    }

    /**
     * Apply all stored zoom data to current sprites (called when sprites are recreated)
     */
    function applyAllStoredZoomData() {
        for (const targetId of spriteZoomData.keys()) {
            applyStoredZoomToSprite(targetId);
        }
    }

    //=============================================================================
    // Enhanced Sprite Rotation System with Fixed Pivot Points
    //=============================================================================

    // Global storage for sprite rotation data - enhanced with pivot support
    let spriteRotationData = new Map();

    /**
     * Enhanced rotate sprite function with pivot support
     */
    function rotateSprite(targetId, rotation, duration = 0, continuous = false, absolute = false, pivotX = 0.5, pivotY = 1.0) {
        const sprite = findSpriteByTargetId(targetId);
        if (!sprite) {
            console.warn(`Sprite not found for target ID: ${targetId}`);
            return;
        }

        // Initialize rotation data if not exists
        if (!spriteRotationData.has(targetId)) {
            spriteRotationData.set(targetId, {
                currentRotation: sprite.rotation,
                targetRotation: sprite.rotation,
                duration: 0,
                remaining: 0,
                continuousSpeed: 0,
                isContinuous: false,
                targetId: targetId,
                pivotX: 0.5,
                pivotY: 1.0
            });
        }

        const rotationData = spriteRotationData.get(targetId);

        // Update pivot point
        rotationData.pivotX = pivotX;
        rotationData.pivotY = pivotY;

        if (continuous) {
            // Set continuous rotation
            rotationData.isContinuous = true;
            rotationData.continuousSpeed = (rotation * Math.PI) / 180; // Convert to radians per frame
            rotationData.remaining = 0; // Stop any fixed rotation animation
        } else {
            // Stop continuous rotation
            rotationData.isContinuous = false;
            rotationData.continuousSpeed = 0;

            let targetRadians;
            if (absolute) {
                // Absolute rotation - set to specific angle
                targetRadians = (rotation * Math.PI) / 180;
            } else {
                // Relative rotation - add to current rotation
                const rotationRadians = (rotation * Math.PI) / 180;
                targetRadians = rotationData.currentRotation + rotationRadians;
            }

            // Set new target rotation
            rotationData.targetRotation = targetRadians;
            rotationData.duration = Math.max(0, duration);
            rotationData.remaining = rotationData.duration;

            // If duration is 0, set immediately
            if (duration === 0) {
                applyRotationWithPivot(sprite, targetRadians, pivotX, pivotY);
                rotationData.currentRotation = targetRadians;
                rotationData.remaining = 0;
            }

        }
    }

    /**
     * Apply rotation with custom pivot point using position offsets
     */
    function applyRotationWithPivot(sprite, rotation, pivotX, pivotY) {
        // Store base position (RPG Maker's intended position) when first rotating
        if (sprite._basePositionStored !== true) {
            sprite._baseSpriteX = sprite.x;
            sprite._baseSpriteY = sprite.y;
            sprite._basePositionStored = true;
        }

        // Get sprite dimensions
        const texture = sprite._frame || sprite.texture.frame;
        if (!texture) {
            sprite.rotation = rotation;
            return;
        }

        const spriteWidth = texture.width * sprite.scale.x;
        const spriteHeight = texture.height * sprite.scale.y;

        // RPG Maker default anchor is (0.5, 1.0) - center horizontally, bottom vertically
        const defaultAnchorX = 0.5;
        const defaultAnchorY = 1.0;

        // Calculate where the desired pivot point is relative to the default anchor point
        const pivotOffsetX = (pivotX - defaultAnchorX) * spriteWidth;
        const pivotOffsetY = (pivotY - defaultAnchorY) * spriteHeight;

        // Apply the rotation
        sprite.rotation = rotation;

        // Calculate position offset needed to rotate around the custom pivot
        if (rotation !== 0) {
            // When rotated, the pivot point moves. Calculate how much it moves.
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);

            // Calculate where the pivot point ends up after rotation
            const rotatedPivotX = pivotOffsetX * cos - pivotOffsetY * sin;
            const rotatedPivotY = pivotOffsetX * sin + pivotOffsetY * cos;

            // Adjust position so the pivot point stays in the same place
            sprite.x = sprite._baseSpriteX + (pivotOffsetX - rotatedPivotX);
            sprite.y = sprite._baseSpriteY + (pivotOffsetY - rotatedPivotY);
        } else {
            // No rotation, reset to base position
            sprite.x = sprite._baseSpriteX;
            sprite.y = sprite._baseSpriteY;
        }
    }

    /**
     * Enhanced sprite rotation update system with pivot offset calculations
     */
    function updateSpriteRotations() {
        for (const [targetId, rotationData] of spriteRotationData.entries()) {
            const sprite = findSpriteByTargetId(targetId);

            if (!sprite) {
                // Sprite not found, skip this frame
                continue;
            }

            if (!rotationData.isContinuous && rotationData.remaining === 0) {
                // No animation running, ensure sprite has correct final rotation and position
                if (Math.abs(sprite.rotation - rotationData.currentRotation) > 0.001) {
                    applyRotationWithPivot(sprite, rotationData.currentRotation, rotationData.pivotX, rotationData.pivotY);
                }
            }

            // Handle continuous rotation
            if (rotationData.isContinuous && rotationData.continuousSpeed !== 0) {
                rotationData.currentRotation += rotationData.continuousSpeed;
                applyRotationWithPivot(sprite, rotationData.currentRotation, rotationData.pivotX, rotationData.pivotY);

                // Normalize rotation to prevent overflow
                while (rotationData.currentRotation > Math.PI * 2) {
                    rotationData.currentRotation -= Math.PI * 2;
                }
                while (rotationData.currentRotation < -Math.PI * 2) {
                    rotationData.currentRotation += Math.PI * 2;
                }
            }
            // Handle fixed rotation animation
            else if (rotationData.remaining > 0) {
                const newRotation = rotationData.currentRotation +
                (rotationData.targetRotation - rotationData.currentRotation) *
                (1 / rotationData.remaining);

                applyRotationWithPivot(sprite, newRotation, rotationData.pivotX, rotationData.pivotY);
                rotationData.currentRotation = newRotation;
                rotationData.remaining--;

                if (rotationData.remaining === 0) {
                    applyRotationWithPivot(sprite, rotationData.targetRotation, rotationData.pivotX, rotationData.pivotY);
                    rotationData.currentRotation = rotationData.targetRotation;
                }
            }
        }
    }

    /**
     * Apply stored rotation data to a sprite
     */
    function applyStoredRotationToSprite(targetId) {
        const sprite = findSpriteByTargetId(targetId);
        const rotationData = spriteRotationData.get(targetId);

        if (!sprite || !rotationData) return;

        // Apply the current rotation with pivot using the new system
        applyRotationWithPivot(sprite, rotationData.currentRotation, rotationData.pivotX, rotationData.pivotY);
    }

    /**
     * Apply all stored rotation data to current sprites (called when sprites are recreated)
     */
    function applyAllStoredRotationData() {
        for (const targetId of spriteRotationData.keys()) {
            applyStoredRotationToSprite(targetId);
        }
    }

    //=============================================================================
    // Helper Functions for Common Pivot Points
    //=============================================================================

    /**
     * Convenience function to rotate around center
     */
    function rotateSpriteCenter(targetId, rotation, duration = 0, continuous = false, absolute = false) {
        rotateSprite(targetId, rotation, duration, continuous, absolute, 0.5, 0.5);
    }

    /**
     * Convenience function to rotate around top center
     */
    function rotateSpriteTop(targetId, rotation, duration = 0, continuous = false, absolute = false) {
        rotateSprite(targetId, rotation, duration, continuous, absolute, 0.5, 0.0);
    }

    /**
     * Convenience function to rotate around bottom center (default behavior)
     */
    function rotateSpriteBottom(targetId, rotation, duration = 0, continuous = false, absolute = false) {
        rotateSprite(targetId, rotation, duration, continuous, absolute, 0.5, 1.0);
    }

    // Make these functions globally available for script calls
    window.rotateSpriteCenter = rotateSpriteCenter;
    window.rotateSpriteTop = rotateSpriteTop;
    window.rotateSpriteBottom = rotateSpriteBottom;

    //=============================================================================
    // Sprite Finding Utility
    //=============================================================================

    /**
     * Find sprite object based on target ID
     */
    function findSpriteByTargetId(targetId) {
        const spritesetMap = SceneManager._scene._spriteset;
        if (!spritesetMap) return null;

        // Player (ID: 0)
        if (targetId === 0) {
            return spritesetMap._characterSprites?.find(sprite =>
            sprite._character === $gamePlayer
            );
        }

        // Followers (ID: -1, -2, -3)
        if (targetId < 0) {
            const followerIndex = Math.abs(targetId) - 1;
            const follower = $gamePlayer._followers._data[followerIndex];
            if (follower) {
                return spritesetMap._characterSprites?.find(sprite =>
                sprite._character === follower
                );
            }
        }

        // Events (ID: 1-9999)
        if (targetId > 0) {
            const event = $gameMap.event(targetId);
            if (event) {
                return spritesetMap._characterSprites?.find(sprite =>
                sprite._character === event
                );
            }
        }

        return null;
    }

    //=============================================================================
    // Event Movement Hooks
    //=============================================================================

    // Store original methods
    const _Game_Event_updateMove = Game_Event.prototype.updateMove;
    const _Game_Event_moveStraight = Game_Event.prototype.moveStraight;
    const _Game_Event_moveDiagonally = Game_Event.prototype.moveDiagonally;
    const _Game_Event_locate = Game_Event.prototype.locate;
    const _Game_Event_setPosition = Game_Event.prototype.setPosition;

    /**
     * Hook into event movement to update bound pictures
     */
    Game_Event.prototype.updateMove = function() {
        const wasMoving = this.isMoving();
        const oldRealX = this._realX;
        const oldRealY = this._realY;

        _Game_Event_updateMove.call(this);

        // Update bound pictures if position changed
        if (this._realX !== oldRealX || this._realY !== oldRealY) {
            updateBoundPicturesForEvent(this.eventId());
        }
    };

    /**
     * Hook into straight movement
     */
    Game_Event.prototype.moveStraight = function(d) {
        _Game_Event_moveStraight.call(this, d);
        updateBoundPicturesForEvent(this.eventId());
    };

    /**
     * Hook into diagonal movement
     */
    Game_Event.prototype.moveDiagonally = function(horz, vert) {
        _Game_Event_moveDiagonally.call(this, horz, vert);
        updateBoundPicturesForEvent(this.eventId());
    };

    /**
     * Hook into locate (teleport)
     */
    Game_Event.prototype.locate = function(x, y) {
        _Game_Event_locate.call(this, x, y);
        updateBoundPicturesForEvent(this.eventId());
    };

    /**
     * Hook into setPosition
     */
    Game_Event.prototype.setPosition = function(x, y) {
        _Game_Event_setPosition.call(this, x, y);
        updateBoundPicturesForEvent(this.eventId());
    };

    /**
     * Update bound pictures for a specific event
     */
    function updateBoundPicturesForEvent(eventId) {
        for (const [pictureId, binding] of pictureBindings.entries()) {
            if (binding.eventId === eventId) {
                updateBoundPicturePosition(pictureId);
            }
        }
    }

    //=============================================================================
    // Picture Management Hooks
    //=============================================================================

    // Store original methods
    const _Game_Screen_erasePicture = Game_Screen.prototype.erasePicture;
    const _Game_Screen_clearPictures = Game_Screen.prototype.clearPictures;

    /**
     * Hook into picture erasure to clean up bindings
     */
    Game_Screen.prototype.erasePicture = function(pictureId) {
        _Game_Screen_erasePicture.call(this, pictureId);
        // Clean up binding when picture is erased
        if (pictureBindings.has(pictureId)) {
            unbindPicture(pictureId);
        }
    };

    /**
     * Hook into clear all pictures
     */
    Game_Screen.prototype.clearPictures = function() {
        _Game_Screen_clearPictures.call(this);
        // Clear all bindings when all pictures are cleared
        pictureBindings.clear();
// [silenced]         console.log('All picture bindings cleared');
    };

    //=============================================================================
    // Sprite Initialization Hooks (Enhanced for Pivot Support)
    //=============================================================================

    // Store original methods
    const _Sprite_Character_initialize = Sprite_Character.prototype.initialize;
    const _Sprite_Character_setCharacter = Sprite_Character.prototype.setCharacter;
    const _Sprite_Character_updatePosition = Sprite_Character.prototype.updatePosition;

    /**
     * Hook sprite initialization to apply stored transformations immediately
     */
    Sprite_Character.prototype.initialize = function(character) {
        _Sprite_Character_initialize.call(this, character);

        // Apply any stored transformations for this character immediately
        this.applyStoredTransformations();
    };

    /**
     * Hook setCharacter to apply stored transformations when character changes
     */
    Sprite_Character.prototype.setCharacter = function(character) {
        _Sprite_Character_setCharacter.call(this, character);

        // Apply any stored transformations for this character immediately
        this.applyStoredTransformations();
    };

    /**
     * Hook updatePosition to update base position for rotation calculations
     */
    Sprite_Character.prototype.updatePosition = function() {
        // Call original position update first
        _Sprite_Character_updatePosition.call(this);

        // Update base position for rotation calculations if character moved
        const targetId = this.getTargetId();
        const rotationData = spriteRotationData.get(targetId);

        if (rotationData && rotationData.currentRotation !== 0) {
            // Character has rotation, update base position and reapply rotation
            this._baseSpriteX = this.x;
            this._baseSpriteY = this.y;
            this._basePositionStored = true;
            applyRotationWithPivot(this, rotationData.currentRotation, rotationData.pivotX, rotationData.pivotY);
        }
    };

    /**
     * Helper function to get target ID for this sprite
     */
    Sprite_Character.prototype.getTargetId = function() {
        if (!this._character) return null;

        if (this._character === $gamePlayer) {
            return 0;
        } else if (this._character._eventId !== undefined) {
            return this._character._eventId;
        } else if ($gamePlayer._followers && $gamePlayer._followers._data) {
            const followerIndex = $gamePlayer._followers._data.indexOf(this._character);
            if (followerIndex >= 0) {
                return -(followerIndex + 1);
            }
        }
        return null;
    };

    /**
     * Apply stored zoom and rotation data to this sprite
     */
    Sprite_Character.prototype.applyStoredTransformations = function() {
        if (!this._character) return;

        // Determine target ID based on character type
        const targetId = this.getTargetId();

        if (targetId !== null) {
            // Apply stored zoom data
            const zoomData = spriteZoomData.get(targetId);
            if (zoomData) {
                this.scale.x = zoomData.currentScaleX;
                this.scale.y = zoomData.currentScaleY;
            }

            // Apply stored rotation data (using new pivot system)
            const rotationData = spriteRotationData.get(targetId);
            if (rotationData) {
                applyRotationWithPivot(this, rotationData.currentRotation, rotationData.pivotX, rotationData.pivotY);
            }
        }
    };

    //=============================================================================
    // Scene Update Hook (Updated)
    //=============================================================================

    // Store original methods
    const _Scene_Map_update = Scene_Map.prototype.update;
    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    const _Scene_Map_start = Scene_Map.prototype.start;

    /**
     * Update all systems every frame
     */
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);

        // Update all bound pictures to handle camera movement
        if (pictureBindings.size > 0) {
            updateAllBoundPictures();
        }

        // Update sprite zoom animations
        if (spriteZoomData.size > 0) {
            updateSpriteZooms();
        }

        // Update sprite rotation animations
        if (spriteRotationData.size > 0) {
            updateSpriteRotations();
        }

        // Update camera control system
        if (cameraControlData) {
            updateCameraControl();
        }
    };

    /**
     * Apply stored data when returning to map scene
     */
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        // Apply stored data immediately (no delay)
        applyAllStoredZoomData();
        applyAllStoredRotationData();
    };

    /**
     * Clean up data when leaving map
     */
    Scene_Map.prototype.terminate = function() {
        _Scene_Map_terminate.call(this);
        // Note: We preserve sprite data when changing scenes
    };

    //=============================================================================
    // Save/Load Data Management (Updated)
    //=============================================================================

    // Store original methods
    const _Game_System_onBeforeSave = Game_System.prototype.onBeforeSave;
    const _Game_System_onAfterLoad = Game_System.prototype.onAfterLoad;

    /**
     * Save all custom data with save file
     */
    Game_System.prototype.onBeforeSave = function() {
        if (_Game_System_onBeforeSave) {
            _Game_System_onBeforeSave.call(this);
        }

        // Convert Maps to Objects for JSON serialization
        this._pictureBindings = Object.fromEntries(pictureBindings);
        this._spriteZoomData = Object.fromEntries(spriteZoomData);
        this._spriteRotationData = Object.fromEntries(spriteRotationData);
        this._followerChaseStates = getFollowerChaseStates();
        this._cameraControlData = cameraControlData;
        // Note: Follower control target is now per-interpreter, not global
    };

    /**
     * Restore all custom data from save file
     */
    Game_System.prototype.onAfterLoad = function() {
        if (_Game_System_onAfterLoad) {
            _Game_System_onAfterLoad.call(this);
        }

        // Restore picture bindings
        if (this._pictureBindings) {
            pictureBindings = new Map(Object.entries(this._pictureBindings).map(
                ([key, value]) => [parseInt(key), value]
            ));
        } else {
            pictureBindings = new Map();
        }

        // Restore sprite zoom data
        if (this._spriteZoomData) {
            spriteZoomData = new Map(Object.entries(this._spriteZoomData).map(
                ([key, value]) => [parseInt(key), value]
            ));
        } else {
            spriteZoomData = new Map();
        }

        // Restore sprite rotation data
        if (this._spriteRotationData) {
            spriteRotationData = new Map(Object.entries(this._spriteRotationData).map(
                ([key, value]) => [parseInt(key), value]
            ));
        } else {
            spriteRotationData = new Map();
        }

        // Restore follower chase states
        setFollowerChaseStates(this._followerChaseStates);

        // Restore camera control data
        if (this._cameraControlData) {
            cameraControlData = this._cameraControlData;
        } else {
            cameraControlData = {
                isAnimating: false,
                startX: 0,
                startY: 0,
                targetX: 0,
                targetY: 0,
                duration: 0,
                remaining: 0,
                followType: 'player',
                followEventId: 0,
                followOffsetX: 0,
                followOffsetY: 0,
                wasFollowingBeforeAnimation: false,
                _originalFollowType: null,
                manuallyControlled: false
            };
        }

        // Note: Follower control target is now per-interpreter, not global
    };

    //=============================================================================
    // Diagonal Movement System
    //=============================================================================

    if (enableDiagonalMovement) {
        // Store original methods
        const _Game_Player_getInputDirection = Game_Player.prototype.getInputDirection;

        /**
         * Override getInputDirection to handle diagonal movement
         */
        Game_Player.prototype.getInputDirection = function() {
            if (!this.canMove()) {
                return 0;
            }

            // Check for diagonal input combinations
            const input = Input;
            const left = input.isPressed('left');
            const right = input.isPressed('right');
            const up = input.isPressed('up');
            const down = input.isPressed('down');

            // Diagonal movements (if two directional keys are pressed)
            if (left && up) {
                return 7; // Upper Left
            } else if (right && up) {
                return 9; // Upper Right
            } else if (left && down) {
                return 1; // Lower Left
            } else if (right && down) {
                return 3; // Lower Right
            }

            // Fall back to original single-direction logic
            return _Game_Player_getInputDirection.call(this);
        };

        // Store original movement methods
        const _Game_Player_executeMove = Game_Player.prototype.executeMove;

        /**
         * Override executeMove to handle diagonal movement execution
         */
        Game_Player.prototype.executeMove = function(direction) {
            // Handle diagonal directions
            switch (direction) {
                case 1: // Lower Left
                    this.moveDiagonally(4, 2);
                    break;
                case 3: // Lower Right
                    this.moveDiagonally(6, 2);
                    break;
                case 7: // Upper Left
                    this.moveDiagonally(4, 8);
                    break;
                case 9: // Upper Right
                    this.moveDiagonally(6, 8);
                    break;
                default:
                    // Use original method for non-diagonal movement
                    _Game_Player_executeMove.call(this, direction);
                    break;
            }
        };

    }

    const _Game_Player_moveByInput_PathfindFix = Game_Player.prototype.moveByInput;

    Game_Player.prototype.moveByInput = function() {
        if (!this.isMoving() && this.canMove()) {
            if ($gameTemp.isDestinationValid()) {
                const destX = $gameTemp.destinationX();
                const destY = $gameTemp.destinationY();
                const distanceX = Math.abs(this.x - destX);
                const distanceY = Math.abs(this.y - destY);
                const totalDistance = distanceX + distanceY;

                // Clear destination if reached (within 1 tile)
                if (totalDistance === 0 || (enableDiagonalMovement && distanceX <= 1 && distanceY <= 1 && totalDistance <= 1)) {
                    $gameTemp.clearDestination();
                    return;
                }

                // Stuck detection - give up after 60 frames
                if (!this._destinationCheckCounter) {
                    this._destinationCheckCounter = 0;
                    this._lastDestCheckX = this.x;
                    this._lastDestCheckY = this.y;
                }

                if (this._lastDestCheckX === this.x && this._lastDestCheckY === this.y) {
                    this._destinationCheckCounter++;
                    if (this._destinationCheckCounter > 60) {
                        $gameTemp.clearDestination();
                        this._destinationCheckCounter = 0;
                        return;
                    }
                } else {
                    this._destinationCheckCounter = 0;
                    this._lastDestCheckX = this.x;
                    this._lastDestCheckY = this.y;
                }
            } else {
                this._destinationCheckCounter = 0;
            }
        }

        _Game_Player_moveByInput_PathfindFix.call(this);
    };

    if (enableDiagonalMovement) {
        const _Game_Character_findDirectionTo_DiagonalFix = Game_Character.prototype.findDirectionTo;

        Game_Character.prototype.findDirectionTo = function(goalX, goalY) {
            const distanceX = Math.abs(this.x - goalX);
            const distanceY = Math.abs(this.y - goalY);

            if (distanceX === 0 && distanceY === 0) {
                return 0;
            }

            if (distanceX <= 1 && distanceY <= 1 && (distanceX + distanceY) <= 1) {
                return 0;
            }

            const direction = _Game_Character_findDirectionTo_DiagonalFix.call(this, goalX, goalY);

            if (direction === 0 && distanceX <= 2 && distanceY <= 2) {
                if (this.x < goalX && this.y < goalY) {
                    if (this.canPassDiagonally(this.x, this.y, 6, 2)) return 3;
                } else if (this.x < goalX && this.y > goalY) {
                    if (this.canPassDiagonally(this.x, this.y, 6, 8)) return 9;
                } else if (this.x > goalX && this.y < goalY) {
                    if (this.canPassDiagonally(this.x, this.y, 4, 2)) return 1;
                } else if (this.x > goalX && this.y > goalY) {
                    if (this.canPassDiagonally(this.x, this.y, 4, 8)) return 7;
                }

                if (this.x < goalX && this.canPass(this.x, this.y, 6)) return 6;
                if (this.x > goalX && this.canPass(this.x, this.y, 4)) return 4;
                if (this.y < goalY && this.canPass(this.x, this.y, 2)) return 2;
                if (this.y > goalY && this.canPass(this.x, this.y, 8)) return 8;
            }

            return direction;
        };

    }



    const detectorStates = new Map();

    /**
     * Check if event has line of sight to player
     */
    function hasLineOfSight(event, targetX, targetY) {
        const x1 = event.x;
        const y1 = event.y;
        const x2 = targetX;
        const y2 = targetY;

        // Bresenham's line algorithm for raycasting
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        let currentX = x1;
        let currentY = y1;

        while (currentX !== x2 || currentY !== y2) {
            // Check if current tile blocks line of sight
            if (currentX !== x1 || currentY !== y1) { // Skip starting position
                // Check if tile is passable from all directions (not a wall)
                const region = $gameMap.regionId(currentX, currentY);
                if (blockedRegions.has(region)) {
                    return false;
                }
                // Check tile passability
                if (!$gameMap.checkPassage(currentX, currentY, 0x0f)) {
                    return false;
                }
            }

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                currentX += sx;
            }
            if (e2 < dx) {
                err += dx;
                currentY += sy;
            }
        }

        return true;
    }

    /**
     * Calculate distance between event and player
     */
    function getDistanceToPlayer(event) {
        return $gameMap.distance(event.x, event.y, $gamePlayer.x, $gamePlayer.y);
    }

    /**
     * Check if event can detect player
     */
    function canDetectPlayer(event, config) {
        const distance = getDistanceToPlayer(event);

        // Out of range
        if (distance > config.range) {
            return false;
        }

        // Check line of sight if required
        if (config.lineOfSight) {
            return hasLineOfSight(event, $gamePlayer.x, $gamePlayer.y);
        }

        return true;
    }

    /**
     * Check if event is touching player or followers
     */
    function checkDetectorCollision(event) {
        // Check if adjacent to player (within 1 tile, including diagonals)
        const distToPlayer = $gameMap.distance(event.x, event.y, $gamePlayer.x, $gamePlayer.y);
        if (distToPlayer <= 1) {
            return true;
        }

        // Check if adjacent to any visible follower
        for (const follower of $gamePlayer._followers._data) {
            if (follower.isVisible()) {
                const distToFollower = $gameMap.distance(event.x, event.y, follower.x, follower.y);
                if (distToFollower <= 1) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Trigger event interaction when collision occurs
     */
    function triggerDetectorEvent(event) {
        // Check if event should trigger
        if (event._trigger === 1 || event._trigger === 2) { // Event Touch or Player Touch
            // Start the event if not already running
            if (!$gameMap.isEventRunning() && !event.isStarting()) {
                event.start();
            }
        }
    }

    /**
     * Main detector method for events
     */

    Game_Event.prototype.detector = function(detectorId) {
        // Don't run detector if event is currently active or starting
        if (this.isStarting() || $gameMap.isEventRunning()) {
            return;
        }

        const config = detectorConfigs.get(detectorId);
        if (!config) {
            console.warn(`Detector ${detectorId} not found in configurations`);
            return;
        }

        const eventKey = `${$gameMap.mapId()}_${this._eventId}`;

        // Initialize state if needed
        if (!detectorStates.has(eventKey)) {
            detectorStates.set(eventKey, {
                isChasing: false,
                lastPlayerX: $gamePlayer.x,
                lastPlayerY: $gamePlayer.y,
                hasTriggered: false
            });
        }

        const state = detectorStates.get(eventKey);
        const distance = getDistanceToPlayer(this);

        // Check if we should lose sight
        if (config.loseSightDistance > 0 && distance > config.loseSightDistance) {
            state.isChasing = false;
        }

        // Set movement speed if configured
        if (config.moveSpeed > 0) {
            this.setMoveSpeed(config.moveSpeed);
        }

        // Check for collision BEFORE movement
        if (checkDetectorCollision(this) && !state.hasTriggered) {
            state.hasTriggered = true;
            triggerDetectorEvent(this);
            return; // Stop processing movement if triggered
        }

        // Execute pattern
        switch (config.pattern) {
            case 'chase':
                this.executeChasePattern(config, state);
                break;

            case 'flee':
                this.executeFleePattern(config, state);
                break;

            case 'patrolChase':
                this.executePatrolChasePattern(config, state);
                break;

            case 'freeze':
                this.executeFreezePattern(config, state);
                break;

            default:
                console.warn(`Unknown detector pattern: ${config.pattern}`);
        }

        // Check for collision AFTER movement
        if (checkDetectorCollision(this) && !state.hasTriggered) {
            state.hasTriggered = true;
            triggerDetectorEvent(this);
        }
    };

    const _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _Game_Event_update.call(this);

        // Don't process detector if event is running
        if (this.isStarting() || $gameMap.isEventRunning()) {
            return;
        }

        // Check if this event is using a detector
        const eventKey = `${$gameMap.mapId()}_${this._eventId}`;
        const state = detectorStates.get(eventKey);

        if (state && state.isChasing && !state.hasTriggered) {
            // Continuously check for collision while chasing
            if (checkDetectorCollision(this)) {
                state.hasTriggered = true;
                triggerDetectorEvent(this);
            }
        }

        // Reset triggered flag when not running and not near player anymore
        if (!this.isStarting() && !$gameMap.isEventRunning() && state && state.hasTriggered) {
            if (!checkDetectorCollision(this)) {
                state.hasTriggered = false;
            }
        }
    };


    /**
     * Chase Pattern - Move toward player
     */
    Game_Event.prototype.executeChasePattern = function(config, state) {
        if (canDetectPlayer(this, config)) {
            state.isChasing = true;
            const direction = this.findDirectionTo($gamePlayer.x, $gamePlayer.y);
            if (direction > 0) {
                this.moveStraight(direction);
            }
        } else {
            state.isChasing = false;
        }
    };

    /**
     * Flee Pattern - Move away from player
     */
    Game_Event.prototype.executeFleePattern = function(config, state) {
        if (canDetectPlayer(this, config)) {
            state.isChasing = true;
            // Get direction toward player, then reverse it
            const towardDirection = this.findDirectionTo($gamePlayer.x, $gamePlayer.y);
            if (towardDirection > 0) {
                const awayDirection = 10 - towardDirection; // Reverses direction
                if (this.canPass(this.x, this.y, awayDirection)) {
                    this.moveStraight(awayDirection);
                } else {
                    // If can't flee directly, try perpendicular directions
                    const perpendiculars = this.getPerpendicularDirections(awayDirection);
                    for (const dir of perpendiculars) {
                        if (this.canPass(this.x, this.y, dir)) {
                            this.moveStraight(dir);
                            break;
                        }
                    }
                }
            }
        } else {
            state.isChasing = false;
        }
    };

    /**
     * Patrol + Chase Pattern - Random movement until player is close, then chase
     */
    Game_Event.prototype.executePatrolChasePattern = function(config, state) {
        const distance = getDistanceToPlayer(this);
        const activationRange = config.chaseRange > 0 ? config.chaseRange : config.range;

        if (canDetectPlayer(this, config) && distance <= activationRange) {
            // Chase mode
            state.isChasing = true;
            const direction = this.findDirectionTo($gamePlayer.x, $gamePlayer.y);
            if (direction > 0) {
                this.moveStraight(direction);
            }
        } else {
            // Patrol mode - random movement
            state.isChasing = false;
            this.moveRandom();
        }
    };

    /**
     * Freeze Pattern - Stop moving when player is detected
     */
    Game_Event.prototype.executeFreezePattern = function(config, state) {
        if (canDetectPlayer(this, config)) {
            state.isChasing = true;
            // Do nothing - event freezes
        } else {
            state.isChasing = false;
            // Can move normally when not detecting
        }
    };

    /**
     * Get perpendicular directions for flee pattern
     */
    Game_Event.prototype.getPerpendicularDirections = function(direction) {
        switch (direction) {
            case 2: return [4, 6]; // Down -> Left/Right
            case 4: return [2, 8]; // Left -> Down/Up
            case 6: return [2, 8]; // Right -> Down/Up
            case 8: return [4, 6]; // Up -> Left/Right
            default: return [2, 4, 6, 8];
        }
    };

    /**
     * Check if event is currently chasing player (for conditional branches, etc.)
     */
    Game_Event.prototype.isChasing = function() {
        const eventKey = `${$gameMap.mapId()}_${this._eventId}`;
        const state = detectorStates.get(eventKey);
        return state ? state.isChasing : false;
    };

    /**
     * Override Game_Event.checkEventTriggerTouch to handle detector collisions
     * This ensures player touching detector events also triggers them
     */
    const _Game_Event_checkEventTriggerTouch = Game_Event.prototype.checkEventTriggerTouch;
    Game_Event.prototype.checkEventTriggerTouch = function(x, y) {
        // Call original method
        _Game_Event_checkEventTriggerTouch.call(this, x, y);

        // Check if this event is using a detector and player/follower stepped on it
        const eventKey = `${$gameMap.mapId()}_${this._eventId}`;
        const state = detectorStates.get(eventKey);

        if (state && state.isChasing) {
            if (this.x === x && this.y === y) {
                if (this._trigger === 1 || this._trigger === 2) { // Event Touch or Player Touch
                    if (!this.isJumping() && this.isNormalPriority()) {
                        this.start();
                    }
                }
            }
        }
    };

    /**
     * Reset detector state (useful when map transfers)
     */
    const _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        // Clear detector states for new map
        detectorStates.clear();
    };

    // Make functions globally available
    window.hasLineOfSight = hasLineOfSight;
    window.getDistanceToPlayer = getDistanceToPlayer;
    window.checkDetectorCollision = checkDetectorCollision;

    if (detectorConfigs.size > 0) {
    }

    //=============================================================================
    // Region Blocking System
    //=============================================================================

    if (blockedRegions.size > 0) {
        /**
         * Check if a region ID is blocked
         */
        function isRegionBlocked(regionId) {
            return blockedRegions.has(regionId);
        }

        /**
         * Check if movement to a specific tile is blocked by region
         */
        function isRegionBlockedAt(x, y) {
            if (!$gameMap) return false;
            const regionId = $gameMap.regionId(x, y);
            return isRegionBlocked(regionId);
        }

        // Store original methods
        const _Game_CharacterBase_canPass = Game_CharacterBase.prototype.canPass;

        /**
         * Override canPass to include region blocking
         */
        Game_CharacterBase.prototype.canPass = function(x, y, d) {
            // Get the destination coordinates
            const x2 = $gameMap.roundXWithDirection(x, d);
            const y2 = $gameMap.roundYWithDirection(y, d);

            // Check if destination tile has a blocked region, but allow passage if "through" or "debug through" is enabled
            if (isRegionBlockedAt(x2, y2) && !this.isThrough() && !this.isDebugThrough()) {
                return false;
            }

            // Use original passability check
            return _Game_CharacterBase_canPass.call(this, x, y, d);
        };

        // Store original method for passability checking
        const _Game_Map_checkPassage = Game_Map.prototype.checkPassage;

        /**
         * Override checkPassage to include region blocking
         */
        Game_Map.prototype.checkPassage = function(x, y, bit) {
            // Check region blocking first
            if (isRegionBlockedAt(x, y)) {
                return false;
            }

            // Use original passability check
            return _Game_Map_checkPassage.call(this, x, y, bit);
        };

    }

    //=============================================================================
    // Game_Event - Always Update Movement
    //=============================================================================

    // Store the original isNearTheScreen method
    const _Game_Event_isNearTheScreen = Game_Event.prototype.isNearTheScreen;

    /**
     * Override isNearTheScreen to check for Always Update Movement note tag
     */
    Game_Event.prototype.isNearTheScreen = function() {
        // Check cached value for better performance
        if (this.hasAlwaysUpdateMovementCached()) {
            return true; // Always return true to keep updating
        }
        // Otherwise, use the original method
        return _Game_Event_isNearTheScreen.call(this);
    };

    /**
     * Check if the event has the Always Update Movement note tag
     */
    Game_Event.prototype.hasAlwaysUpdateMovement = function() {
        if (!this.event()) {
            return false;
        }
        const note = this.event().note || '';
        return note.includes('<Always Update Movement>');
    };

    // Store the original refresh method
    const _Game_Event_refresh = Game_Event.prototype.refresh;

    /**
     * Override refresh to cache the Always Update Movement status
     */
    Game_Event.prototype.refresh = function() {
        _Game_Event_refresh.call(this);
        // Cache the always update movement status for performance
        this._alwaysUpdateMovement = this.hasAlwaysUpdateMovement();
    };

    /**
     * Optimized version that uses cached value
     */
    Game_Event.prototype.hasAlwaysUpdateMovementCached = function() {
        return this._alwaysUpdateMovement || false;
    };

    //=============================================================================
    // Movement Route Preprocessing - The Core Fix
    //=============================================================================

    // Store the original setMoveRoute method
    const _Game_Character_setMoveRoute = Game_Character.prototype.setMoveRoute;

    /**
     * Override setMoveRoute to preprocess custom movement commands
     */
    Game_Character.prototype.setMoveRoute = function(moveRoute) {
        const processedRoute = expandCustomMovementCommands(moveRoute);
        // Call the original method with the processed route
        _Game_Character_setMoveRoute.call(this, processedRoute);
    };

    // Override forceMoveRoute to preprocess custom movement commands
    const _Game_Character_forceMoveRoute = Game_Character.prototype.forceMoveRoute;

    /**
     * Override forceMoveRoute to preprocess custom movement commands
     */
    Game_Character.prototype.forceMoveRoute = function(moveRoute) {
        const processedRoute = expandCustomMovementCommands(moveRoute);
        // Call the original method with the processed route
        _Game_Character_forceMoveRoute.call(this, processedRoute);
    };

    /**
     * Expand custom movement commands into standard RPG Maker movement commands
     */
    function expandCustomMovementCommands(moveRoute) {
        if (!moveRoute || !moveRoute.list) {
            return moveRoute;
        }

        // Create a copy of the move route to avoid modifying the original
        const processedRoute = JSON.parse(JSON.stringify(moveRoute));
        const newList = [];

        // Process each command in the route
        for (let i = 0; i < processedRoute.list.length; i++) {
            const command = processedRoute.list[i];

            if (command.code === Game_Character.ROUTE_SCRIPT) {
                const script = command.parameters[0];
                const expandedCommands = parseCustomMovementScript(script);

                if (expandedCommands.length > 0) {
                    // Replace the script command with expanded movement commands
                    newList.push(...expandedCommands);
                } else {
                    // Keep the original script command if no custom syntax found
                    newList.push(command);
                }
            } else {
                // Keep non-script commands as-is
                newList.push(command);
            }
        }

        processedRoute.list = newList;
        return processedRoute;
    }

    /**
     * Parse custom movement script and return array of standard movement commands
     * (Enhanced version with balloon support)
     */
    function parseCustomMovementScript(script) {
        if (!script || typeof script !== 'string') {
            return [];
        }

        const trimmed = script.trim().toUpperCase();
        const commands = [];

        // === BALLOON PARSING ===

        // Parse BALLOON: X (numeric) or BALLOON: NAME (text alias)
        let match = trimmed.match(/^BALLOON\s*:?\s*(.+)\s*$/);
        if (match) {
            const balloonInput = match[1].trim().toUpperCase();
            let balloonId = getBalloonId(balloonInput);

            if (balloonId !== null) {
                // In RPG Maker MZ, balloons are requested through $gameTemp.requestBalloon
                // Use a script command to properly call it
                commands.push({
                    code: Game_Character.ROUTE_SCRIPT,
                    parameters: [`$gameTemp.requestBalloon(this, ${balloonId});`]
                });
                return commands;
            }
        }

        // === EXISTING PARSING ===

        // Parse LEFT: X or LEFT X
        match = trimmed.match(/^LEFT\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_LEFT, parameters: [] });
            }
            return commands;
        }

        // Parse RIGHT: X or RIGHT X
        match = trimmed.match(/^RIGHT\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_RIGHT, parameters: [] });
            }
            return commands;
        }

        // Parse UP: X or UP X
        match = trimmed.match(/^UP\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_UP, parameters: [] });
            }
            return commands;
        }

        // Parse DOWN: X or DOWN X
        match = trimmed.match(/^DOWN\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_DOWN, parameters: [] });
            }
            return commands;
        }

        // Parse LOWER LEFT: X
        match = trimmed.match(/^LOWER\s+LEFT\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_LOWER_L, parameters: [] });
            }
            return commands;
        }

        // Parse LOWER RIGHT: X
        match = trimmed.match(/^LOWER\s+RIGHT\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_LOWER_R, parameters: [] });
            }
            return commands;
        }

        // Parse UPPER LEFT: X
        match = trimmed.match(/^UPPER\s+LEFT\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_UPPER_L, parameters: [] });
            }
            return commands;
        }

        // Parse UPPER RIGHT: X
        match = trimmed.match(/^UPPER\s+RIGHT\s*:?\s*(\d+)\s*$/);
        if (match) {
            const count = parseInt(match[1]);
            for (let i = 0; i < count; i++) {
                commands.push({ code: Game_Character.ROUTE_MOVE_UPPER_R, parameters: [] });
            }
            return commands;
        }

        // Parse TELEPORT: X, Y
        match = trimmed.match(/^TELEPORT\s*:?\s*(\d+)\s*,\s*(\d+)\s*$/);
        if (match) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            // Create a script command that will teleport the event
            commands.push({
                code: Game_Character.ROUTE_SCRIPT,
                parameters: [`this.locate(${x}, ${y}); this.refresh();`]
            });
            return commands;
        }

        // Parse MOVE: X, Y (pathfinding)
        match = trimmed.match(/^MOVE\s*:?\s*(\d+)\s*,\s*(\d+)\s*$/);
        if (match) {
            const x = parseInt(match[1]);
            const y = parseInt(match[2]);
            // Create pathfinding commands
            const pathCommands = generatePathfindingCommands(x, y);
            return pathCommands;
        }

        // Return empty array if no custom syntax matched
        return [];
    }

    /**
     * Helper function to convert balloon input to balloon ID
     */
    function getBalloonId(input) {
        // Try parsing as number first
        const numericId = parseInt(input);
        if (!isNaN(numericId) && numericId >= 1 && numericId <= 10) {
            return numericId;
        }

        // Define balloon name mappings
        const balloonMap = {
            'EXCLAMATION': 1,
 '!': 1,
 'QUESTION': 2,
 '?': 2,
 'MUSIC NOTE': 3,
 'MUSIC': 3,
 'NOTE': 3,
 'HEART': 4,
 'ANGER': 5,
 'ANGRY': 5,
 'SWEAT': 6,
 'NERVOUS': 6,
 'COBWEB': 7,
 'SILENCE': 8,
 '...': 8,
 'LIGHT BULB': 9,
 'LIGHTBULB': 9,
 'BULB': 9,
 'IDEA': 9,
 'ZZZ': 10,
 'SLEEP': 10,
 'SLEEPING': 10
        };

        // Check if input matches any balloon name
        return balloonMap[input] || null;
    }

    /**
     * Generate pathfinding movement commands to reach target coordinates
     */
    function generatePathfindingCommands(targetX, targetY) {
        // This creates a script that will be executed to perform pathfinding
        const pathfindingScript = `
        (function() {
            const targetX = ${targetX};
            const targetY = ${targetY};
            const startX = this._x;
            const startY = this._y;

            // Simple pathfinding algorithm
            let currentX = startX;
            let currentY = startY;
            const maxSteps = 100;
            let steps = 0;

            while ((currentX !== targetX || currentY !== targetY) && steps < maxSteps) {
                let moved = false;
                steps++;

                const deltaX = targetX - currentX;
                const deltaY = targetY - currentY;

                // Try to move in the direction that reduces the largest distance
                if (Math.abs(deltaX) >= Math.abs(deltaY)) {
                    if (deltaX !== 0) {
                        const direction = deltaX > 0 ? 6 : 4; // Right or Left
                        if (this.canPass(currentX, currentY, direction)) {
                            this.moveStraight(direction);
                            currentX += (direction === 6 ? 1 : -1);
                            moved = true;
                        }
                    }
                    if (!moved && deltaY !== 0) {
                        const direction = deltaY > 0 ? 2 : 8; // Down or Up
                        if (this.canPass(currentX, currentY, direction)) {
                            this.moveStraight(direction);
                            currentY += (direction === 2 ? 1 : -1);
                            moved = true;
                        }
                    }
                } else {
                    if (deltaY !== 0) {
                        const direction = deltaY > 0 ? 2 : 8; // Down or Up
                        if (this.canPass(currentX, currentY, direction)) {
                            this.moveStraight(direction);
                            currentY += (direction === 2 ? 1 : -1);
                            moved = true;
                        }
                    }
                    if (!moved && deltaX !== 0) {
                        const direction = deltaX > 0 ? 6 : 4; // Right or Left
                        if (this.canPass(currentX, currentY, direction)) {
                            this.moveStraight(direction);
                            currentX += (direction === 6 ? 1 : -1);
                            moved = true;
                        }
                    }
                }

                if (!moved) break; // Stuck, can't reach target
            }
        }).call(this);
        `;

        return [{ code: Game_Character.ROUTE_SCRIPT, parameters: [pathfindingScript] }];
    }

    //=============================================================================
    // Handle Autonomous Movement Routes
    //=============================================================================

    // Store the original setupPage method
    const _Game_Event_setupPage = Game_Event.prototype.setupPage;

    /**
     * Override setupPage to preprocess autonomous movement routes
     */
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);

        // EXISTING: Process autonomous movement routes (moveType 3 = Custom)
        if (this._moveType === 3 && this._moveRoute) {
            this._moveRoute = expandCustomMovementCommands(this._moveRoute);
        }

        // NEW: Clear detector state when page changes
        const eventKey = `${$gameMap.mapId()}_${this._eventId}`;
        if (detectorStates.has(eventKey)) {
            const state = detectorStates.get(eventKey);
            state.hasTriggered = false;
            state.isChasing = false;
        }
    };

    //=============================================================================
    // Make functions globally available for script calls
    //=============================================================================

    window.stopFollowerChase = stopFollowerChase;
    window.startFollowerChase = startFollowerChase;
    window.isFollowerChaseEnabled = isFollowerChaseEnabled;
    window.moveCameraToEvent = moveCameraToEvent;
    window.moveCameraToPlayer = moveCameraToPlayer;
    window.moveCameraToPosition = moveCameraToPosition;
    window.stopCameraAnimation = stopCameraAnimation;
    window.setCameraFollow = setCameraFollow;
    window.isCameraControlActive = isCameraControlActive;
    window.restoreDefaultCamera = restoreDefaultCamera;

    // Intercept processMoveCommand to handle bare balloon names in
    // move route scripts (legacy Galv-style, e.g. just "SWEAT")
    const _balloonNameMap = {
        'EXCLAMATION': 1, '!': 1,
        'QUESTION': 2, '?': 2,
        'MUSIC NOTE': 3, 'MUSIC_NOTE': 3, 'MUSIC': 3, 'NOTE': 3,
        'HEART': 4,
        'ANGER': 5, 'ANGRY': 5,
        'SWEAT': 6, 'NERVOUS': 6,
        'COBWEB': 7,
        'SILENCE': 8, '...': 8,
        'LIGHT BULB': 9, 'LIGHT_BULB': 9, 'LIGHTBULB': 9, 'BULB': 9, 'IDEA': 9,
        'ZZZ': 10, 'SLEEP': 10, 'SLEEPING': 10
    };

    const _Game_Character_processMoveCommand = Game_Character.prototype.processMoveCommand;
    Game_Character.prototype.processMoveCommand = function(command) {
        if (command.code === Game_Character.ROUTE_SCRIPT) {
            const script = command.parameters[0];
            if (script && typeof script === 'string') {
                const balloonId = _balloonNameMap[script.trim().toUpperCase()];
                if (balloonId) {
                    $gameTemp.requestBalloon(this, balloonId);
                    return;
                }
            }
        }
        _Game_Character_processMoveCommand.call(this, command);
    };

    //=============================================================================
    // Plugin Information
    //=============================================================================

    if (enableDiagonalMovement) {
    } else {
    }
    if (blockedRegions.size > 0) {
    } else {
    }

})();
