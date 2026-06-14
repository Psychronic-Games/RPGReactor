//=============================================================================
// PSYCHRONIC_AdvancedRotationMZ.js
//=============================================================================

/*:
 * @target MZ
 * @plugindesc v1.3 Advanced rotation system for events and pictures with continuous rotation support
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_AdvancedRotationMZ enhances RPG Maker MZ's rotation capabilities for events
 * and pictures with precise floating-point control and continuous rotation.
 *
 * Plugin Commands:
 *   RotatePicture <pictureId> <angle> <speed> <continuous>
 *   RotateEvent <eventId> <angle> <speed> <continuous>
 *   StopRotation <type> <id>
 *
 * Parameters:
 *   <pictureId/eventId>: Numeric ID of the target (positive or negative; 0 for current event)
 *   <angle>: Target angle in degrees (float, positive or negative)
 *   <speed>: Degrees per frame (float, positive or negative)
 *   <continuous>: 0 = one-time rotation, 1 = continuous
 *
 * Examples:
 *   RotatePicture 1 -90.5 0.25 0
 *   RotateEvent 2 -360 -1.5 1
 *   StopRotation Picture 1
 *
 * @command RotatePicture
 * @text Rotate Picture
 * @desc Rotates a picture with specified parameters
 * @arg pictureId
 * @type number
 * @text Picture ID
 * @desc ID of the picture to rotate (positive only, 1 or higher)
 * @default 1
 * @arg angle
 * @type number
 * @decimals 2
 * @text Angle
 * @desc Target angle in degrees (positive or negative)
 * @default 0
 * @min -3600
 * @max 3600
 * @arg speed
 * @type number
 * @decimals 2
 * @text Speed
 * @desc Degrees per frame (positive or negative)
 * @default 1
 * @min -3600
 * @max 3600
 * @arg continuous
 * @type boolean
 * @text Continuous
 * @desc 0 = one-time rotation, 1 = continuous
 * @default false
 *
 * @command RotateEvent
 * @text Rotate Event
 * @desc Rotates an event with specified parameters
 * @arg eventId
 * @type number
 * @text Event ID
 * @desc Event ID (0 for this event, positive or negative)
 * @default 0
 * @arg angle
 * @type number
 * @decimals 2
 * @text Angle
 * @desc Target angle in degrees (positive or negative)
 * @default 0
 * @min -3600
 * @max 3600
 * @arg speed
 * @type number
 * @decimals 2
 * @text Speed
 * @desc Degrees per frame (positive or negative)
 * @default 1
 * @min -3600
 * @max 3600
 * @arg continuous
 * @type boolean
 * @text Continuous
 * @desc 0 = one-time rotation, 1 = continuous
 * @default false
 *
 * @command StopRotation
 * @text Stop Rotation
 * @desc Stops rotation of specified object
 * @arg type
 * @type select
 * @option Picture
 * @option Event
 * @text Type
 * @desc Type of object to stop rotating
 * @default Picture
 * @arg id
 * @type number
 * @text ID
 * @desc ID of the object to stop (positive or negative)
 * @default 1
 */

(() => {
    "use strict";

    // Rotation Manager
    const RotationManager = {
        rotatingObjects: new Map(), // Map of objectID => { sprite, rotationData }

 addObject(type, id, sprite, rotationData) {
     const key = `${type}_${id}`;
     this.rotatingObjects.set(key, { sprite, rotationData });
 },

 removeObject(type, id) {
     const key = `${type}_${id}`;
     this.rotatingObjects.delete(key);
 },

 // Clear all rotating objects on scene/map change
 clear() {
     this.rotatingObjects.clear();
 },

 update() {
     // Create a new array from the entries to avoid modification during iteration
     const entries = [...this.rotatingObjects.entries()];

     for (const [key, { sprite, rotationData }] of entries) {
         // Check if sprite and scene are still valid
         if (!sprite || !sprite.parent || !SceneManager._scene._spriteset) {
             this.rotatingObjects.delete(key);
             continue;
         }

         try {
             // Update rotation logic
             if (rotationData.continuous) {
                 rotationData.currentAngle += rotationData.speed;
                 // Normalize to [-360, 360] range for continuous rotation
                 rotationData.currentAngle = rotationData.currentAngle % 360;
                 if (rotationData.currentAngle < -360) rotationData.currentAngle += 360;
                 if (rotationData.currentAngle > 360) rotationData.currentAngle -= 360;
             } else if (rotationData.timer < Math.abs(rotationData.angle / rotationData.speed)) {
                 const step = rotationData.speed;
                 rotationData.currentAngle += step;
                 rotationData.timer++;
                 // Stop exactly at target angle for non-continuous
                 if (rotationData.speed > 0 && rotationData.currentAngle >= rotationData.angle) {
                     rotationData.currentAngle = rotationData.angle;
                     rotationData.speed = 0;
                 } else if (rotationData.speed < 0 && rotationData.currentAngle <= rotationData.angle) {
                     rotationData.currentAngle = rotationData.angle;
                     rotationData.speed = 0;
                 }
             }

             // Apply rotation to sprite
             sprite.rotation = rotationData.currentAngle * Math.PI / 180;

             // Center the sprite (adjust position)
             const character = sprite._character || $gameScreen.picture(Number(key.split('_')[1]));
             if (character) {
                 const pw = sprite.bitmap ? sprite.bitmap.width / (sprite.patternWidth ? sprite.patternWidth() : 1) : 48;
                 const ph = sprite.bitmap ? sprite.bitmap.height / (sprite.patternHeight ? sprite.patternHeight() : 1) : 48;
                 sprite.anchor.x = 0.5;
                 sprite.anchor.y = 0.5;
                 sprite.x = character.screenX ? character.screenX() : character._x;
                 sprite.y = character.screenY ? character.screenY() - ph / 2 : character._y;
             }
         } catch (e) {
             console.warn(`Error updating rotation for ${key}:`, e);
             this.rotatingObjects.delete(key);
         }
     }
 }
    };

    // Register plugin commands
    PluginManager.registerCommand("PSYCHRONIC_AdvancedRotationMZ", "RotatePicture", args => {
        const pictureId = Number(args.pictureId);
        const picture = $gameScreen.picture(pictureId);
        if (picture && pictureId > 0) { // Picture IDs must be positive
            setupRotation("Picture", pictureId, picture, args);
        }
    });

    PluginManager.registerCommand("PSYCHRONIC_AdvancedRotationMZ", "RotateEvent", args => {
        const eventId = Number(args.eventId) || $gameMap._interpreter.eventId();
        const event = $gameMap.event(eventId);
        if (event) {
            setupRotation("Event", eventId, event, args);
        }
    });

    PluginManager.registerCommand("PSYCHRONIC_AdvancedRotationMZ", "StopRotation", args => {
        const type = args.type;
        const id = Number(args.id);
        stopRotation(type, id);
    });

    // Rotation setup function
    function setupRotation(type, id, object, args) {
        const rotationData = {
            angle: Number(args.angle),
 speed: Number(args.speed),
 continuous: args.continuous === "true" || Number(args.continuous) === 1,
 currentAngle: object._rotationData?.currentAngle || 0,
 timer: 0
        };

        object._rotationData = rotationData;

        // Get or create the sprite
        let sprite;
        if (!SceneManager._scene._spriteset) {
            // Delay if spriteset isn't ready
            setTimeout(() => setupRotation(type, id, object, args), 100);
            return;
        }

        if (type === "Picture") {
            sprite = SceneManager._scene._spriteset._pictureContainer.children.find(p => p._pictureId === id);
        } else if (type === "Event") {
            sprite = SceneManager._scene._spriteset._characterSprites.find(s => s._character === object);
        }

        if (sprite) {
            RotationManager.addObject(type, id, sprite, rotationData);
        } else {
            console.warn(`Sprite not found for ${type} ID ${id}`);
        }
    }

    // Stop rotation function
    function stopRotation(type, id) {
        const key = `${type}_${id}`;
        const data = RotationManager.rotatingObjects.get(key);
        if (data && data.sprite) {
            data.rotationData.continuous = false;
            data.rotationData.speed = 0;

            // Only reset sprite properties if sprite is still valid
            if (data.sprite.parent) {
                data.sprite.anchor.x = 0;
                data.sprite.anchor.y = 0;
                data.sprite.rotation = 0; // Reset rotation
            }

            RotationManager.removeObject(type, id);
        }
    }

    // Game_Picture enhancements
    const _Game_Picture_initBasic = Game_Picture.prototype.initBasic;
    Game_Picture.prototype.initBasic = function() {
        _Game_Picture_initBasic.call(this);
        this._rotationData = null;
    };

    // Game_Event enhancements
    const _Game_Event_initialize = Game_Event.prototype.initialize;
    Game_Event.prototype.initialize = function(mapId, eventId) {
        _Game_Event_initialize.call(this, mapId, eventId);
        this._rotationData = null;
    };

    // Hook into Scene_Map update
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (this._spriteset) {
            RotationManager.update();
        }
    };

    // Clear rotation data when scenes change
    const _SceneManager_goto = SceneManager.goto;
    SceneManager.goto = function(sceneClass) {
        RotationManager.clear();
        _SceneManager_goto.call(this, sceneClass);
    };

    // Additionally, handle map transfers
    const _Game_Player_performTransfer = Game_Player.prototype.performTransfer;
    Game_Player.prototype.performTransfer = function() {
        RotationManager.clear();
        _Game_Player_performTransfer.call(this);
    };
})();
