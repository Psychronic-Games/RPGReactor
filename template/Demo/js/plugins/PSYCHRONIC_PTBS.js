/*:
 * @target MZ
 * @plugindesc v1.0.4 - Psychronic Tactical Battle System (PTBS) with Win Condition Editor
 *
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * ----------------------------------------------------------------------------
 *  ABOUT THIS PLUGIN
 * ----------------------------------------------------------------------------
 * The Psychronic Tactical Battle System (PTBS) replaces the default battle
 * scene with a grid-based, turn-based tactical battle environment directly
 * on your map. Characters (actors, enemies, or events) can be set up with
 * "PTBS_Actor" or "PTBS_Enemy" tags in their event pages. When active,
 * normal map movement is blocked, and you control "battlers" with commands
 * for movement, attacks, skills, and items—all displayed directly on the map.
 *
 * NEW in v1.0.4:
 *  - Items can now be used in the same manner as skills (tile-targeting,
 *    AoE, and custom action sequences).
 *  - Advanced projectile animations with custom arcs, spin, and images.
 *  - New plugin commands for win conditions: AddWinCondition, ClearWinConditions,
 *    and SetWinConditions.
 *  - **Win Condition Editor:** Win conditions can now be configured via a
 *    GUI drop-down menu. You may select from options such as:
 *      • Defeat All Enemies
 *      • Switch Condition (a specific switch must be ON/OFF)
 *      • Variable Condition (a game variable must be equal to, above, or below a value)
 *      • Turn Count Condition (a minimum number of turns must have elapsed)
 *  - New action sequence commands for image manipulation:
 *      • imageMove / imageMoveRelative
 *      • aimImage / releaseAim
 *
 * ----------------------------------------------------------------------------
 *  HOW TO USE
 * ----------------------------------------------------------------------------
 * 1) Plugin Parameters:
 *    - Movement Speed: Adjust the speed at which battlers step-walk on the grid.
 *      (Range: 1 = slowest, 6 = fastest; Default: 4)
 *
 * 2) Activating / Deactivating PTBS:
 *    - Use the following plugin commands to control the system:
 *         PTBS_Activate  → Activates PTBS.
 *         PTBS_Deactivate → Deactivates PTBS.
 *
 * 3) Setting Up Battlers on the Map:
 *    - To make an event function as a tactical battler, include a comment on the
 *      event page such as:
 *          PTBS_Actor: X
 *       or
 *          PTBS_Enemy: Y
 *      where X is the Actor ID (from the database) and Y is the Enemy ID.
 *      (Actors not already in the party will be added automatically.)
 *
 * 4) Note Tags for Skills/Items:
 *    - In the “Notes” field for a skill or item, wrap your PTBS setup in a
 *      <PTBS> … </PTBS> block.
 *    - Common tags include:
 *         scope: circle(3,0)       → Range: Circle shape with max = 3, min = 0
 *         aoe: circle(2,0)         → AoE: Circle with radius 2, minRadius = 0
 *         scope_select: enemies/allies/all
 *         action sequences: Use one or more blocks of the form:
 *             <action sequence: [sequenceName]>
 *                command1, command2, command3, …
 *             </action sequence>
 *
 * ----------------------------------------------------------------------------
 *  EXAMPLES OF SKILL / ITEM NOTE TAGS
 * ----------------------------------------------------------------------------
 *
 * (A) Melee Attack (Default Attack):
 * --------------------------------------
 * <PTBS>
 * scope: circle(1,1)         // Range: exactly 1 tile away (Circle, max=1, min=1)
 * scope_select: enemies      // Only valid on enemy targets
 *
 * <action sequence: execute>
 *   moveForward(1,8),         // Move forward 1 tile; wait 8 frames
 *   playAnimation(1, target), // Play animation #1 on the target
 *   shake(1,15),              // Shake the target with power 1; wait 15 frames
 *   applyActionEffect,        // Apply damage or healing
 *   moveBackward(1,8)         // Move back to original position; wait 8 frames
 * </action sequence>
 * </PTBS>
 *
 * (B) Fireball (AoE Skill):
 * -----------------------------
 * <PTBS>
 * scope: circle(3,0)         // Up to 3 tiles away
 * scope_select: enemies
 * aoe: circle(2,0)           // AoE: Circle with radius 2, minRadius = 0
 *
 * <action sequence: prepare>
 *   balloon(user, 1),         // Show balloon #1 over the user
 *   wait(30)                  // Wait 30 frames
 * </action sequence>
 *
 * <action sequence: execute>
 *   playAnimation(52, all targets, wait), // Play animation #52 on all targets; wait until finished
 *   shake(1,10),                          // Shake each target (power 1; wait 10 frames)
 *   applyActionEffect                     // Apply the effect (damage/healing)
 * </action sequence>
 * </PTBS>
 *
 * (C) Healing Potion (Item):
 * ------------------------------
 * <PTBS>
 * scope: circle(1,0)         // Within 1 tile
 * scope_select: allies       // Only valid on allies
 * aoe: circle(0,0)           // Single-target effect
 *
 * <action sequence: execute>
 *   playAnimation(41, target),  // Play animation #41 on the target
 *   applyActionEffect            // Heals the target
 * </action sequence>
 * </PTBS>
 *
 * ----------------------------------------------------------------------------
 *  ACTION SEQUENCES & AVAILABLE COMMANDS
 * ----------------------------------------------------------------------------
 * PTBS supports custom action sequences defined within the <PTBS> note block.
 * If a skill or item does not have any action sequences, a default sequence is used:
 *    moveForward → playAnimation → applyActionEffect → moveBackward.
 *
 * The following commands are available (separated by commas):
 *
 * • balloon(subject, balloonId)
 *     - Displays a balloon icon (by balloonId) over the specified subject.
 *     - Example: balloon(user, 2)
 *
 * • wait(duration)
 *     - Pauses the action sequence for the specified number of frames.
 *     - Example: wait(30)
 *
 * • moveForward(distance, waitFrames)
 *     - Moves the subject forward (in its current facing) by the given number
 *       of tiles and then waits the specified frames.
 *     - Example: moveForward(1,8)
 *
 * • moveBackward(distance, waitFrames)
 *     - Moves the subject backward relative to its facing direction and waits.
 *     - Example: moveBackward(1,8)
 *
 * • playAnimation(animId, targetType [, wait])
 *     - Plays the specified animation on the target(s).
 *       targetType can be: "target", "all targets", or "user".
 *       Append "wait" to pause until the animation is finished.
 *     - Example: playAnimation(1, target)
 *
 * • shake(power, waitFrames)
 *     - Shakes the target event with the specified power and for the specified frames.
 *     - Example: shake(2,15)
 *
 * • applyActionEffect
 *     - Applies the skill’s or item’s effect (damage, healing, etc.) to the target(s).
 *
 * • projectile()
 *     - Fires a projectile as configured by a <PTBS_Projectile> note block.
 *
 * • icon(...)
 *     - Displays or manipulates an overhead icon. (Customize via code as needed.)
 *
 * • se(name, volume, pitch, pan)
 *     - Plays a sound effect.
 *     - Example: se("Slash2", 90, 100, 0)
 *
 * • direction(subject, "behind" / "target" / direction)
 *     - Adjusts the subject’s facing direction. For example, "behind" flips the facing.
 *     - Example: direction(user, "behind")
 *
 * • switch(switchId, "on"/"off"/"toggle")
 *     - Directly sets a game switch.
 *     - Example: switch(10, "toggle")
 *
 * • imageMove(subject, iconIndex, targetX, targetY, targetOpacity, angle, spin, frames)
 *     - Tweens an icon (or picture) from its current offset to a new absolute offset,
 *       adjusting opacity, angle, and spin over the specified number of frames.
 *     - Example: imageMove(user, 1, -20, 0, 255, 90, 0, 10)
 *
 * • imageMoveRelative(subject, iconIndex, dx, dy, newOpacity, angleDelta, spinDelta, frames)
 *     - Adjusts the current icon’s offset by a relative amount (dx,dy) and changes its
 *       opacity, angle, and spin by the specified deltas over the given duration.
 *     - Example: imageMoveRelative(user, 1, 10, 0, 255, 45, 0, 15)
 *
 * • aimImage(subject, iconSlot, target, duration)
 *     - Smoothly rotates the icon in the specified slot so that it "aims" toward the target.
 *     - Example: aimImage(user, 1, target, 30)
 *
 * • releaseAim(subject, iconSlot, duration)
 *     - Returns the icon’s rotation to its default idle orientation over the specified duration.
 *     - Example: releaseAim(user, 1, 30)
 *
 * ----------------------------------------------------------------------------
 *  PLUGIN COMMANDS
 * ----------------------------------------------------------------------------
 * In addition to action sequence commands, the following plugin commands are available:
 *
 * • PTBS_Activate
 *     - Activates the tactical battle system.
 *
 * • PTBS_Deactivate
 *     - Deactivates the tactical battle system.
 *
 * • AddWinCondition (argument: winCondition)
 *     - Adds a win condition to the battle.
 *     - The win condition is configured via the GUI.
 *
 * • SetWinConditions (argument: winConditions)
 *     - Replaces current win conditions with a new list configured via the GUI.
 *
 * • ClearWinConditions
 *     - Removes all win conditions from the battle.
 *
 * ----------------------------------------------------------------------------
 *  PROJECTILES: USING <PTBS_Projectile>
 * ----------------------------------------------------------------------------
 * PTBS can fire a projectile sprite from the user to the target, optionally applying
 * an arc, spin, or playing a sound effect (SE).
 *
 * 1) In the note block for a skill or item, add:
 *    <PTBS_Projectile: before>
 *      image: icon 64          // "icon 64" uses icon #64 from the IconSet (or specify a filename)
 *      duration: 20            // Total flight time (in frames)
 *      se: Bow3                // Sound effect to play at launch
 *      arc: 30                 // Height of the projectile’s arc (if > 0, the projectile will arc)
 *      spin: 8                 // Rotation speed in degrees per frame
 *      start: 0, -16           // Pixel offset from the user's tile where the projectile starts
 *    </PTBS_Projectile>
 *
 *    - The "timing" (before/after) indicates whether the projectile launches
 *      before or after applyActionEffect.
 *
 * 2) In your action sequence, include the command:
 *      projectile(),
 *    typically followed by applyActionEffect.
 *
 * ----------------------------------------------------------------------------
 *  WIN CONDITION GUI STRUCTURE
 * ----------------------------------------------------------------------------
 * The following structured parameters define win conditions for PTBS.
 *
 * @param BlockedRegions
 * @text Blocked Movement Regions
 * @desc List of region IDs that block battler movement in PTBS battles. Separate with commas (e.g., 1, 2, 3).
 * @type number[]
 * @default ["250", "251"]
 *
 * @param FrontDamageMultiplier
 * @text Front Damage Multiplier
 * @desc Damage multiplier when attacking a battler from the front.
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @param SideDamageMultiplier
 * @text Side Damage Multiplier
 * @desc Damage multiplier when attacking a battler from the side.
 * @type number
 * @decimals 2
 * @default 1.50
 *
 * @param BackDamageMultiplier
 * @text Back Damage Multiplier
 * @desc Damage multiplier when attacking a battler from the back.
 * @type number
 * @decimals 2
 * @default 2.00
 *
 * @command PTBS_StartBattle
 * @text Start PTBS Battle
 * @desc Starts a tactical battle, pausing the current event.
 *
 * @arg victorySwitch
 * @type switch
 * @text Victory Switch (Global)
 * @desc The global switch to turn ON upon winning the battle. 0 for none.
 * @default 0
 *
 * @arg victorySelfSwitch
 * @type select
 * @option None
 * @value ""
 * @option A
 * @option B
 * @option C
 * @option D
 * @text Victory Self-Switch
 * @desc The self-switch (A, B, C, or D) to turn ON upon winning.
 * @default ""
 *
 * @arg victorySelfSwitchEventId
 * @type number
 * @min 1
 * @text Victory Self-Switch Event ID
 * @desc The ID of the event to which the victory self-switch belongs.
 * @default 1
 *
 * @arg defeatSwitch
 * @type switch
 * @text Defeat Switch (Global)
 * @desc The global switch to turn ON upon losing the battle.  0 for none.
 * @default 0
 *
 * @arg defeatSelfSwitch
 * @type select
 * @option None
 * @value ""
 * @option A
 * @option B
 * @option C
 * @option D
 * @text Defeat Self-Switch
 * @desc The self-switch (A, B, C, or D) to turn ON upon losing.
 * @default ""
 *
 * @arg defeatSelfSwitchEventId
 * @type number
 * @min 1
 * @text Defeat Self-Switch Event ID
 * @desc The ID of the event to which the defeat self-switch belongs.
 * @default 1
 *
 * @command PTBS_RecoverBattlers
 * @text Recover PTBS Battlers
 * @desc Restore HP/MP and/or remove states for certain battlers (ally, enemy, neutral, etc.)
 *
 * @arg faction
 * @type select
 * @option All Factions
 * @value all
 * @option Allies Only
 * @value ally
 * @option Enemies Only
 * @value enemy
 * @option Neutral Faction
 * @value neutral
 * @text Faction to Recover
 * @desc Which faction’s battlers to recover?
 * @default all
 *
 * @arg recoverHp
 * @type boolean
 * @default true
 * @text Recover HP
 * @desc If ON, fully heal HP for the selected faction's battlers.
 *
 * @arg recoverMp
 * @type boolean
 * @default true
 * @text Recover MP
 * @desc If ON, fully restore MP for actors in the selected faction.
 *
 * @arg removeStates
 * @type boolean
 * @default false
 * @text Remove Negative States
 * @desc If ON, remove negative or KO states from the selected faction's battlers.
 *
 * @command setWinConditions
 * @text Set Win Conditions
 * @desc Adds multiple victory conditions to this battle.
 *
 * @arg conditions
 * @text Win Conditions List
 * @type select[]
 * @option {"type":"defeatEnemies"}
 * @option {"type":"switch","switchId":1,"switchState":true}
 * @option {"type":"variable","variableId":1,"comparison":"==","value":0}
 * @option {"type":"turns","turnCount":1}
 * @desc A list of win conditions. Battle ends when ANY condition is met.
 * @default []
 *
 * @command PTBS_SetCursorPosition
 * @text Set Cursor Position
 * @desc Moves the PTBS cursor to a specific X,Y position on the map.
 *
 * @arg x
 * @type number
 * @min 0
 * @text X Coordinate
 * @desc X coordinate to move the cursor to
 * @default 0
 *
 * @arg y
 * @type number
 * @min 0
 * @text Y Coordinate
 * @desc Y coordinate to move the cursor to
 * @default 0
 *
 * @arg centerCamera
 * @type boolean
 * @text Center Camera
 * @desc If true, centers the camera on the cursor position
 * @default true
 *
 * @command PTBS_SetCursorToEvent
 * @text Set Cursor To Event
 * @desc Moves the PTBS cursor to a specific event's position.
 *
 * @arg eventId
 * @type number
 * @min 1
 * @text Event ID
 * @desc ID of the event to move the cursor to
 * @default 1
 *
 * @arg centerCamera
 * @type boolean
 * @text Center Camera
 * @desc If true, centers the camera on the event
 * @default true
 *
 * @arg centerSpeed
 * @ type numb*er
 * @min 1
 * @max 10
 * @decimals 1
 * @text Camera Movement Speed
 * @desc How fast the camera moves to center (1 = slow, 10 = fast)
 * @default 4
 *
 * @command PTBS_ReleaseCameraLock
 * @ text Release Camera Lock                                                  *
 * @desc Releases any camera lock established by the SetCursorToEvent command.
 *
 * @command PTBS_HideUI
 * @text Hide PTBS UI
 * @desc Hides all PTBS battle UI elements during a battle.
 *
 * @command PTBS_ShowUI
 * @text Show PTBS UI
 * @desc Shows all PTBS battle UI elements during a battle.
 *
 */

/*~struct~SwitchCondition:
 * @param switchId
 * @text Switch ID
 * @type switch
 * @desc Which switch to check
 * @default 1
 *
 * @param state
 * @text Switch Must Be
 * @type boolean
 * @desc Required switch state (ON = true, OFF = false)
 * @default true
 */

/*~struct~VariableCondition:
 * @param variableId
 * @text Variable ID
 * @type variable
 * @desc Which variable to check
 * @default 1
 *
 * @param operator
 * @text Comparison
 * @type select
 * @option Equal to
 * @value ==
 * @option Greater than or equal
 * @value >=
 * @option Less than or equal
 * @value <=
 * @default ==
 *
 * @param value
 * @text Target Value
 * @type number
 * @desc Target value for variable comparison
 * @default 0
 */

/*~struct~TurnCondition:
 * @param count
 * @text Required Turns
 * @type number
 * @min 1
 * @desc Number of turns that must pass
 * @default 1
 */

(() => {

    //----------------------------------------------------------------------------
    // Plugin Parameters
    //----------------------------------------------------------------------------
    const pluginName = "PSYCHRONIC_PTBS";
    const parameters = PluginManager.parameters(pluginName);
    const paramMoveSpeed = Number(parameters["moveSpeed"] || 4);
    const paramBlockedRegions = JSON.parse(parameters['BlockedRegions'] || '["250", "251"]').map(Number);
    const paramFrontDamageMultiplier = Number(parameters['FrontDamageMultiplier'] || 1.0);
    const paramSideDamageMultiplier = Number(parameters['SideDamageMultiplier'] || 1.5);
    const paramBackDamageMultiplier = Number(parameters['BackDamageMultiplier'] || 2.0);

    //----------------------------------------------------------------------------
    // Plugin Commands
    //----------------------------------------------------------------------------

    PluginManager.registerCommand(pluginName, "PTBS_StartBattle", args => {
        // 1. Pause Autorun (your existing code, which is correct)
        if ($gameMap._interpreter && $gameMap._interpreter.isRunning()) {
            const eventId = $gameMap._interpreter.eventId();
            const event = $gameMap.event(eventId);

            if (event && event.page() && event.page().trigger === 3) { // Autorun check
                PTBS_Manager._pausedEventData = {
                    eventId: eventId,
                    list: JSON.parse(JSON.stringify($gameMap._interpreter._list)), // Deep copy
                                  index: $gameMap._interpreter._index,
                                  indent: $gameMap._interpreter._indent,
                                  pageId: event.findProperPageIndex()
                };
                $gameMap._interpreter._waitMode = "ptbsPause";
            }
        }

        // 2. Activate PTBS (with proper initialization checks!)
        PTBS_Manager.initialize(); // Make SURE it's initialized.
        PTBS_Manager.activate();


        // 3. Store the win/defeat switch settings.  Important: Parse them!
        PTBS_Manager.victorySwitch = parseInt(args.victorySwitch) || 0;  // 0 means no switch
        PTBS_Manager.victorySelfSwitch = args.victorySelfSwitch || "";  // "" means no self-switch
        PTBS_Manager.victorySelfSwitchEventId = parseInt(args.victorySelfSwitchEventId) || 0; //default of 0.
        PTBS_Manager.defeatSwitch = parseInt(args.defeatSwitch) || 0;
        PTBS_Manager.defeatSelfSwitch = args.defeatSelfSwitch || "";
        PTBS_Manager.defeatSelfSwitchEventId = parseInt(args.defeatSelfSwitchEventId) || 0;

        // 4. Set any win conditions if you still use them.  This is now OPTIONAL
        if (args.conditions) { // Assuming you still have a 'conditions' argument.
            try {
                let conditions;
                if (typeof args.conditions === 'string') {
                    const parsed = JSON.parse(args.conditions);
                    conditions = parsed.map(condStr => {
                        if (typeof condStr === 'string') {
                            return JSON.parse(condStr);
                        }
                        return condStr;
                    });
                } else {
                    conditions = [args.conditions];
                }
                PTBS_Manager.setConditions(conditions);
            } catch (e) {
                console.error("Error parsing win conditions:", e);
                console.error("Original args were:", args);
            }
        }
        if ($gameMap._interpreter) {
            // Wait 20 frames automatically, so the event won't keep going immediately
            $gameMap._interpreter.wait(20);
        }
    });


    PluginManager.registerCommand(pluginName, "setWinConditions", args => {
        try {
            let conditions;
            if (typeof args.conditions === 'string') {
                const parsed = JSON.parse(args.conditions);
                conditions = parsed.map(condStr => {
                    if (typeof condStr === 'string') {
                        return JSON.parse(condStr);
                    }
                    return condStr;
                });
            } else {
                conditions = [args.conditions];
            }
            PTBS_WinManager.setConditions(conditions);
        } catch (e) {
            console.error("Error parsing win conditions:", e);
            console.error("Original args were:", args);
        }
    });

    PluginManager.registerCommand(pluginName, "PTBS_RecoverBattlers", args => {
        const params = {
            faction: args.faction || "all",
            recoverHp: args.recoverHp === "true",
            recoverMp: args.recoverMp === "true",
            removeStates: args.removeStates === "true"
        };

        PTBS_Manager.recoverBattlers(params);
    });

    PluginManager.registerCommand(pluginName, "PTBS_HideUI", args => {
        if (PTBS_Manager.isActive() && SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.hidePTBSWindows();
        }
    });

    PluginManager.registerCommand(pluginName, "PTBS_ShowUI", args => {
        if (PTBS_Manager.isActive() && SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.showPTBSWindows();
        }
    });

    PluginManager.registerCommand(pluginName, "PTBS_SetCursorPosition", args => {
        // Get x and y coordinates from args
        const x = Number(args.x || 0);
        const y = Number(args.y || 0);

        // Set cursor position if Scene_Map is active
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene.cursorSet(x, y);

            // Optionally center camera on cursor
            if (args.centerCamera === "true") {
                SceneManager._scene.centerCameraOnCursor();
            }
        }
    });

    PluginManager.registerCommand(pluginName, "PTBS_SetCursorToEvent", args => {
        const eventId = Number(args.eventId || 0);
        if (eventId <= 0) return;

        const event = $gameMap.event(eventId);
        if (!event) return;

        if (SceneManager._scene instanceof Scene_Map) {
            // Set cursor position
            SceneManager._scene.cursorSet(event.x, event.y);

            // Center camera if requested
            if (args.centerCamera === "true") {
                const transitionSpeed = Number(args.transitionSpeed || 4) / 100;

                // Calculate target position
                const tx = event.x;
                const ty = event.y;
                const halfW = Math.floor($gameMap.screenTileX() / 2);
                const halfH = Math.floor($gameMap.screenTileY() / 2);

                let targetX = tx - halfW;
                let targetY = ty - halfH;

                targetX = Math.max(0, targetX);
                targetX = Math.min(targetX, $gameMap.width() - $gameMap.screenTileX());

                targetY = Math.max(0, targetY);
                targetY = Math.min(targetY, $gameMap.height() - $gameMap.screenTileY());

                // Set permanent lock for plugin command
                PTBS_Manager._cameraControlMode = "event_locked";
                PTBS_Manager._permanentLock = true;

                // Create transition data
                PTBS_Manager._cameraTransitionData = {
                    startX: $gameMap.displayX(),
                                  startY: $gameMap.displayY(),
                                  targetX: targetX,
                                  targetY: targetY,
                                  speed: transitionSpeed,
                                  progress: 0
                };

                // Store final position
                PTBS_Manager._forcedCameraX = targetX;
                PTBS_Manager._forcedCameraY = targetY;
            }
        }
    });

    // Add new plugin command to release camera lock
    PluginManager.registerCommand(pluginName, "PTBS_ReleaseCameraLock", args => {
        PTBS_Manager._permanentLock = false;
        PTBS_Manager._cameraControlMode = "auto";
    });

    //----------------------------------------------------------------------------
    // Add fillPolygon method to Bitmap (for drawing arrows or polygons)
    //----------------------------------------------------------------------------
    if (!Bitmap.prototype.fillPolygon) {
        Bitmap.prototype.fillPolygon = function(points, color) {
            if (points.length < 3) return;
            const ctx = this.context;
            ctx.save();
            ctx.beginPath();
            ctx.fillStyle = color;
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            this._baseTexture.update();
        };
    }

    function fillTrendyBar(ctx, x, y, w, h, cut, fillStyle) {
        ctx.save();
        ctx.beginPath();
        // top-left corner is offset by "cut"
        ctx.moveTo(x + cut, y);
        // top-right
        ctx.lineTo(x + w, y);
        // right side down to bottom minus cut
        ctx.lineTo(x + w, y + h - cut);
        // diagonal corner
        ctx.lineTo(x + w - cut, y + h);
        // bottom-left
        ctx.lineTo(x, y + h);
        // up the left side
        ctx.lineTo(x, y + cut);
        ctx.closePath();

        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.restore();
    }

    function defaultAimAngleForDirection(direction) {
        // Adjust these values to match how your cannon image is drawn.
        // For instance, if your cannon image is drawn so that its “up” orientation is 90°,
        // then you might want:
        //   Facing Up (8):    90°
        //   Facing Right (6): 180°
        //   Facing Down (2):  270°
        //   Facing Left (4):  0°  (or 360°)
        switch (direction) {
            case 2: return 180;
            case 4: return 270;
            case 6: return 270;
            case 8:
            default: return 0;
        }
    }

    function eventHasPTBSEventTag(event) {
        if (!event || !event.event()) return false;
        // You can simply check the entire event note.
        return /<PTBS EVENT>/i.test(event.event().note);
    }


    //----------------------------------------------------------------------------
    // PTBS_Manager
    //   - Manages overall PTBS: states, updates, turn order, etc.
    //----------------------------------------------------------------------------
    class PTBS_Manager {
        //Initialize Conditions
        //in PTBS_Manager
        static initialize() {
            if (this._initialized) return;

            // Clear any lingering event states on the map
            if ($gameMap) {
                $gameMap.events().forEach(event => {
                    event._starting = false;
                    if (event._interpreter) {
                        event._interpreter.clear();
                        event._interpreter = null;
                    }
                    if (event._ptbsEventCheckInterval) {
                        clearInterval(event._ptbsEventCheckInterval);
                        event._ptbsEventCheckInterval = null;
                    }
                });
            }

            this._active = false;
            this._initialized = true;
            this._battlers = [];
            this._turnOrder = [];
            this._currentTurnIndex = 0;
            this._selectedBattler = null;
            this._grid = null;
            this._state = "idle";
            this._skillAction = null;
            this._itemAction = null;
            this._processingEventCollision = false;
            this._eventCollisionResolved   = true;
            this._storedTurnIndex = null;
            this._storedBattler = null;
            this._pausedEventData = null;
            this._eventCheckInterval = null;
            this._inEventSequence = false;
            this._processingTurnEnd = false;
            this._processingAI = false;
            this._aiDecisionTimeout = null;
            this._uiInitialized = false;
            this._activeAutorunPTBSEvent = false;
            this._blockedRegionsMap = null;
            this._cameraControlMode = "auto";
            this._cameraTransitionData = null;
            this._forcedCameraX = undefined;
            this._forcedCameraY = undefined;
            this._permanentLock = false; // New flag for plugin command locks
            this._cursorScrollThreshold = 4; // Tiles away from battler before cursor takes control
            this._scrollSmoothness = 0.08; // Lower = smoother but slower (0.05-0.15 is good)
this._sharedAnimations = {};
this._conditions = [{
    type: "defeatEnemies"
}];
        }
        static isActive() { return this._active; }
        static state() { return this._state; }

        static activate() {
            // Always re-initialize to ensure clean state
            PTBS_Manager.initialize();
            this._active = true; // Set active *after* initialization

            // Setup battlers, grid, etc.
            this.setup();

            // Run any battle-start sequences
            this.runBattleStartSequences();

            // Choose the first valid battler to start the turn order
            this.selectNextValidBattler();

            // Initialize UI if we're on the map scene
            if (SceneManager._scene instanceof Scene_Map) {
                const scene = SceneManager._scene;
                if (!scene._uiInitialized) {
                    scene._uiInitialized = true;
                    scene.createPTBSStatusWindow();
                    scene.createPTBSCommandWindow();
                    scene.createPTBSHoverWindow();
                    scene.createPTBSTurnOrderWindow();
                    scene.createPTBSGridSprite();
                    scene.createPTBSPathPreview();
                    scene.createPTBSCursor();
                    scene.createPTBSAttackGridSprite();
                    scene.createPTBSSkillGridSprite();
                    scene.createPTBSItemGridSprite();
                    scene.createPTBSAoeGridSprite();
                    scene.createPTBSSkillWindow();
                    scene.createPTBSItemHelpWindow();
                    scene.createPTBSItemWindow();
                }
                // scene.showPTBSWindows();
            }
        }

        static deactivate() {
            // 1. Hide all PTBS UI windows on the map.
            if (SceneManager._scene && typeof SceneManager._scene.hidePTBSWindows === "function") {
                SceneManager._scene.hidePTBSWindows();
            }

            // 2. Clear battler-specific states (such as move queues, action sequences, and related temporary properties)
            if (this._battlers && this._battlers.length > 0) {
                this._battlers.forEach(battler => {
                    if (battler) {
                        battler._moveQueue = null;
                        battler._actionSequence = null;
                        battler._actionSequenceIndex = 0;
                        battler._actionSequenceWait = 0;
                        battler._hasAttacked = false;
                        battler._actionPoints = 0; // Reset AP
                        battler._remainingMovePoints = 0; // Reset movement points
                        battler._actionSequenceTargets = 0; // Reset targets
                        battler._homeTileX = null; // Reset home tile X
                        battler._homeTileY = null; // Reset home tile Y
                        battler._pixelOffsetX = 0; // Reset pixel offset X
                        battler._pixelOffsetY = 0; // Reset pixel offset Y
                        battler._pixelMoveData = null; // Reset pixel move data
                        battler._loopedStatesAnimIds = 0; // Reset looped animation IDs
                        battler._icons = {}; // Reset icons
                    }
                });
            }

            // 3. Cancel any active intervals or timers (for example, those used to check event collisions)
            if (this._eventCheckInterval) {
                clearInterval(this._eventCheckInterval);
                this._eventCheckInterval = null;
            }

            // (If you have other timers or intervals, cancel them here as well.)

            // 4. Reset the map interpreter’s wait mode so that normal map event processing can resume.
            if ($gameMap._interpreter) {
                $gameMap._interpreter._waitMode = "";
            }

            // 5. Clear all internal PTBS_Manager state variables.
            this._active = false;
            this._initialized = false; // Reset initialized flag
            this._battlers = [];
            this._turnOrder = [];
            this._turnCount = 0;
            this._currentTurnIndex = 0; // Reset turn index
            this._selectedBattler = null;
            this._grid = null;
            this._state = "idle";
            this._skillAction = null;
            this._itemAction = null;
            this._processingEventCollision = false;
            this._eventCollisionResolved = true;
            this._storedTurnIndex = null;
            this._storedBattler = null;
            this._pausedEventData = null;
            $gameMap._interpreter._waitMode = "";
            this._inEventSequence = false;
            this._processingTurnEnd = false;
            this._processingAI = false;
            this._aiDecisionTimeout = null;

            // 6. Clear any flags or temporary data related to the battle
            this._victoryProcessed = false; // Reset victory flag
            this._victoryProcessing = false; // Reset victory processing flag
            this.victorySwitch = 0;
            this.victorySelfSwitch = "";
            this.victorySelfSwitchEventId = 0;
            this.defeatSwitch = 0;
            this.defeatSelfSwitch = "";
            this.defeatSelfSwitchEventId = 0;
            SceneManager._scene.clearAllGridsAndState();
            PTBS_WinManager.clearConditions();
            $gameTroop.clear();
            this._deactivating = false; // Reset deactivating flag

        }

        static isAutomaticEvent(interpreter) {
            if (!interpreter._eventId) return false;
            const event = $gameMap.event(interpreter._eventId);
            if (!event) return false;

            const page = event.page();
            if(!page) return false;
            const trigger = page ? page.trigger : -1;

            // Autorun (3) and DOES NOT have <PTBS EVENT>
            return page && (trigger === 3) && !eventHasPTBSEventTag(event);
        }

        // Setup
        static setup() {
            this._active = true;
            this._battlers = this.identifyBattlerEvents();
            this._grid = this.createMapGrid();
            this.buildBlockedRegionsMap(); // Precompute blocked regions

            this._battlers.forEach(b => b.calculateSpeed());
            this._battlers.sort((a, b) => b.speed() - a.speed());
            this._turnOrder = [...this._battlers];
            this._currentTurnIndex = 0;

            this.runBattleStartSequences();
            $gameMap.events().forEach(event => {
                if (event.page() && event.page().trigger === 3 && eventHasPTBSEventTag(event) && !event._erased) {
                    event.start();
                }
            });

            this.selectNextValidBattler();
        }


        static buildBlockedRegionsMap() {
            const width = $gameMap.width();
            const height = $gameMap.height();
            this._blockedRegionsMap = new Set();
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (paramBlockedRegions.includes($gameMap.regionId(x, y))) {
                        this._blockedRegionsMap.add(y * width + x);
                    }
                }
            }
        }

        // Reset
        static reset() {
            this._initialized = false;
            this._battlers = [];
            this._turnOrder = [];
            this._currentTurnIndex = 0;
            this._selectedBattler = null;
            this._grid = null;
            this._state = "idle";
            this._skillAction = null;
            // [ITEM STUFF]
            this._itemAction = null;
        }

        static recoverBattlers({ faction = "all", recoverHp = true, recoverMp = true, removeStates = false }) {

            // Recover party members
            if (faction === "all" || faction === "ally") {
                $gameParty.members().forEach(actor => {
                    if (recoverHp) {
                        actor.setHp(actor.mhp);
                    }
                    if (recoverMp) {
                        actor.setMp(actor.mmp);
                    }
                    if (removeStates) {
                        actor.clearStates();
                    }
                });
            }

            // Recover enemies
            if (faction === "all" || faction === "enemy") {
                $gameTroop.members().forEach(enemy => {
                    if (recoverHp) {
                        enemy.setHp(enemy.mhp);
                    }
                    if (recoverMp) {
                        enemy.setMp(enemy.mmp);
                    }
                    if (removeStates) {
                        enemy.clearStates();
                    }
                });
            }

            // Re-initialize PTBS battlers if we're starting a new battle
            if (PTBS_Manager.isActive()) {
                PTBS_Manager.setup();
            }
        }

        static numericDirectionToString(direction) {
            switch (direction) {
                case 2: return "down";
                case 4: return "left";
                case 6: return "right";
                case 8: return "up";
                default: return "down";
            }
        }

        // Identify events with PTBS_Actor or PTBS_Enemy
        static identifyBattlerEvents() {
            const battlers = [];
            $gameMap.events().forEach(event => {
                if (!event || !event.event()) return;

                const page = event.findProperPageIndex() >= 0 ? event.event().pages[event.findProperPageIndex()] : null;
                if (!page) return;

                let actorId = null;
                let partyActorId = null;
                let enemyId = null;

                page.list.forEach(cmd => {
                    if (cmd.code === 108 || cmd.code === 408) {
                        cmd.parameters.forEach(param => {
                            if (/PTBS_Actor:\s*(\d+)/i.test(param)) {
                                actorId = Number(RegExp.$1);
                            } else if (/PTBS_PartyActor:\s*(\d+)/i.test(param)) {
                                partyActorId = Number(RegExp.$1);
                            } else if (/PTBS_Enemy:\s*(\d+)/i.test(param)) {
                                enemyId = Number(RegExp.$1);
                            }
                        });
                    }
                });

                if (partyActorId) {
                    const actor = $gameActors.actor(partyActorId);
                    if (!actor) {
                        console.warn(`Actor ID ${partyActorId} not found in $gameActors`);
                        return;
                    }
                    if (!$gameParty.members().some(a => a.actorId() === partyActorId)) {
                        $gameParty.addActor(partyActorId);
                    }
                    const dbEntry = $dataActors[partyActorId];
                    if (dbEntry) {
                        battlers.push(new PTBS_Battler(event, dbEntry, actor, null));
                    }
                } else if (actorId) {
                    const actorData = $dataActors[actorId];
                    if (actorData) {
                        const newActor = new Game_Actor(actorId);
                        newActor.setup(actorId);
                        battlers.push(new PTBS_Battler(event, actorData, newActor, null));
                    }
                } else if (enemyId) {
                    const enemyData = $dataEnemies[enemyId];
                    if (enemyData) {
                        const newEnemy = new Game_Enemy(enemyId, 0, 0);
                        $gameTroop._enemies.push(newEnemy);
                        $gameTroop.makeUniqueNames(newEnemy);
                        battlers.push(new PTBS_Battler(event, enemyData, null, enemyId));
                    }
                }
            });
            return battlers.filter(b => b && b.event()); // Filter out invalid battlers
        }

        static refreshBattlersOnSwitchChange(switchId) {
            if (!this._active) return;

            const currentBattlerStates = this._battlers.map(battler => ({
                eventId: battler.event().eventId(),
                                                                        x: battler.event().x,
                                                                        y: battler.event().y,
                                                                        hp: battler.currentHP(),
                                                                        mp: battler.currentMP(),
                                                                        tp: battler.currentTP(),
                                                                        ap: battler.actionPoints(),
                                                                        moved: battler.moved,
                                                                        hasAttacked: battler.hasAttacked,
                                                                        remainingMovePoints: battler._remainingMovePoints
            }));

            const currentBattlerIds = new Set(this._battlers.map(b => b.event().eventId()));
            const newBattlers = this.identifyBattlerEvents();

            this._battlers = newBattlers.filter(newBattler => {
                const eventId = newBattler.event().eventId();
                const wasBattler = currentBattlerIds.has(eventId);
                return wasBattler || !this._battlers.some(b => b.event().eventId() === eventId);
            });

            this._battlers.forEach(battler => {
                const state = currentBattlerStates.find(s => s.eventId === battler.event().eventId());
                if (state) {
                    battler.event().locate(state.x, state.y);
                    if (battler._actor) {
                        battler._actor.setHp(state.hp);
                        battler._actor.setMp(state.mp);
                        battler._actor.setTp(state.tp);
                    } else if (battler._enemy) {
                        battler._enemy.setHp(state.hp);
                        battler._enemy.setMp(state.mp);
                        battler._enemy.setTp(state.tp);
                    }
                    battler._actionPoints = state.ap;
                    battler._moved = state.moved;
                    battler._hasAttacked = state.hasAttacked;
                    battler._remainingMovePoints = state.remainingMovePoints;
                } else {
                    battler.calculateSpeed();
                    battler._remainingMovePoints = Number(battler._ptbsData.move_points || 3);
                    battler._actionPoints = Number(battler._ptbsData.action_points || 1);
                }
            });

            this.updateTurnOrder();

            if (SceneManager._scene) {
                // Initialize UI if not already done
                if (!SceneManager._scene._uiInitialized) {
                    SceneManager._scene._uiInitialized = true;
                    SceneManager._scene.createPTBSStatusWindow();
                    SceneManager._scene.createPTBSCommandWindow();
                    SceneManager._scene.createPTBSHoverWindow();
                    SceneManager._scene.createPTBSTurnOrderWindow();
                    SceneManager._scene.createPTBSGridSprite();
                    SceneManager._scene.createPTBSPathPreview();
                    SceneManager._scene.createPTBSCursor();
                    SceneManager._scene.createPTBSAttackGridSprite();
                    SceneManager._scene.createPTBSSkillGridSprite();
                    SceneManager._scene.createPTBSItemGridSprite();
                    SceneManager._scene.createPTBSAoeGridSprite();
                    SceneManager._scene.createPTBSSkillWindow();
                    SceneManager._scene.createPTBSItemHelpWindow();
                    SceneManager._scene.createPTBSItemWindow();
                }

                if (SceneManager._scene._ptbsTurnOrderWindow) {
                    SceneManager._scene._ptbsTurnOrderWindow.refresh();
                }
                if (SceneManager._scene._ptbsStatusWindow && this._selectedBattler) {
                    SceneManager._scene._ptbsStatusWindow.setBattler(this._selectedBattler);
                }
                SceneManager._scene.refreshPTBSGrid();
                SceneManager._scene.refreshPTBSAttackGrid();
                SceneManager._scene.refreshPTBSSkillGrid();
                SceneManager._scene.refreshPTBSItemGrid();
                SceneManager._scene.refreshPTBSAoeGrid();
            }
        }

        static updateTurnOrder(){
            // Preserve current turn index if possible
            const currentBattler = this._turnOrder[this._currentTurnIndex];
            this._turnOrder = [...this._battlers];
            this._turnOrder.sort((a, b) => b.speed() - a.speed());

            // Reset turn index to the current battler or next valid one
            if (currentBattler && this._turnOrder.includes(currentBattler)) {
                this._currentTurnIndex = this._turnOrder.indexOf(currentBattler);
            } else {
                this.selectNextValidBattler();
            }
        }

        // Create passability grid
        static createMapGrid() {
            const w = $gameMap.width();
            const h = $gameMap.height();
            const grid = [];
            for (let y = 0; y < h; y++) {
                grid[y] = [];
                for (let x = 0; x < w; x++) {
                    const passable = $gameMap.isPassable(x, y, 2);
                    grid[y][x] = { x, y, passable };
                }
            }
            return grid;
        }

        // Completely updated camera control system
        static updateCameraControl() {
            if (!this.isActive()) return;

            // Highest priority: ongoing transition
            if (this._cameraTransitionData) {
                const data = this._cameraTransitionData;

                // Update transition progress
                data.progress = Math.min(1, data.progress + data.speed);

                // Calculate interpolated position
                const currentX = data.startX + (data.targetX - data.startX) * data.progress;
                const currentY = data.startY + (data.targetY - data.startY) * data.progress;

                // Apply position
                $gameMap.setDisplayPos(currentX, currentY);

                // Check if transition is complete
                if (data.progress >= 1) {
                    this._cameraTransitionData = null;
                }

                return; // Skip other camera updates during transition
            }

            // Second priority: permanent lock from plugin command
            if (this._permanentLock && this._cameraControlMode === "event_locked") {
                if (this._forcedCameraX !== undefined && this._forcedCameraY !== undefined) {
                    $gameMap.setDisplayPos(this._forcedCameraX, this._forcedCameraY);
                }
                return; // Skip other updates when permanently locked
            }

            // Third priority: normal camera control modes
            switch (this._cameraControlMode) {
                case "event_locked":
                    // Fixed position that was set but not permanently locked
                    if (this._forcedCameraX !== undefined && this._forcedCameraY !== undefined) {
                        $gameMap.setDisplayPos(this._forcedCameraX, this._forcedCameraY);
                    }
                    break;

                case "cursor":
                    this.updateCursorScrolling();
                    break;

                case "auto":
                default:
                    this.updateBattlerScrolling();
                    break;
            }
        }

        static updateCursorScrolling() {
            const scene = SceneManager._scene;
            if (!scene || !scene._cursor) return;

            // Get current cursor position
            const cursorX = scene._cursorX;
            const cursorY = scene._cursorY;

            // Calculate target camera position
            const halfW = Math.floor($gameMap.screenTileX() / 2);
            const halfH = Math.floor($gameMap.screenTileY() / 2);

            let targetX = cursorX - halfW;
            let targetY = cursorY - halfH;

            targetX = Math.max(0, targetX);
            targetX = Math.min(targetX, $gameMap.width() - $gameMap.screenTileX());

            targetY = Math.max(0, targetY);
            targetY = Math.min(targetY, $gameMap.height() - $gameMap.screenTileY());

            // Move camera with proper smoothing
            const currentX = $gameMap.displayX();
            const currentY = $gameMap.displayY();
            const dx = targetX - currentX;
            const dy = targetY - currentY;

            $gameMap.setDisplayPos(
                currentX + dx * this._scrollSmoothness,
                currentY + dy * this._scrollSmoothness
            );
        }

        // Split battler scrolling into its own method
        static updateBattlerScrolling() {
            const battler = this.selectedBattler();
            if (!battler || !battler.event()) return;

            // Get current battler position
            const tx = battler.event().x;
            const ty = battler.event().y;

            // Check if cursor is far from battler
            const scene = SceneManager._scene;
            if (scene && scene._cursor) {
                const cursorX = scene._cursorX;
                const cursorY = scene._cursorY;
                const distance = Math.abs(cursorX - tx) + Math.abs(cursorY - ty);

                // If cursor is far enough, switch to cursor-based scrolling
                if (distance > this._cursorScrollThreshold && !$gameMessage.isBusy()) {
                    this._cameraControlMode = "cursor";
                    return this.updateCursorScrolling();
                }
            }

            // Otherwise, continue with battler-centered scrolling
            const halfW = Math.floor($gameMap.screenTileX() / 2);
            const halfH = Math.floor($gameMap.screenTileY() / 2);

            let targetX = tx - halfW;
            let targetY = ty - halfH;

            targetX = Math.max(0, targetX);
            targetX = Math.min(targetX, $gameMap.width() - $gameMap.screenTileX());

            targetY = Math.max(0, targetY);
            targetY = Math.min(targetY, $gameMap.height() - $gameMap.screenTileY());

            // Move camera with proper smoothing
            const currentX = $gameMap.displayX();
            const currentY = $gameMap.displayY();
            const dx = targetX - currentX;
            const dy = targetY - currentY;

            $gameMap.setDisplayPos(
                currentX + dx * this._scrollSmoothness,
                currentY + dy * this._scrollSmoothness
            );
        }

        static centerCameraOnCurrentBattler(){
            const battler = this.selectedBattler();
            if (battler && battler.event()) {
                const tx = battler.event().x;
                const ty = battler.event().y;
                const halfW = Math.floor($gameMap.screenTileX() / 2);
                const halfH = Math.floor($gameMap.screenTileY() / 2);

                let targetX = tx - halfW;
                let targetY = ty - halfH;

                targetX = Math.max(0, targetX);
                targetX = Math.min(targetX, $gameMap.width() - $gameMap.screenTileX());

                targetY = Math.max(0, targetY);
                targetY = Math.min(targetY, $gameMap.height() - $gameMap.screenTileY());

                $gameMap.setDisplayPos(targetX, targetY);
            }

        }

        // The big update
        static update() {
            PTBS_ProjectileManager.update();

            // Exit early if PTBS isn't active, victory is processed, or deactivation is in progress
            if (!this._active || this._victoryProcessed || this._deactivating) return;

            // Check win conditions only once per turn, not every frame
            if (!this._winConditionCheckedThisTurn && PTBS_WinManager.checkWinConditions()) {
                if (!this._victoryProcessing) {
                    this._victoryProcessing = true;
                    this.handleVictory();
                }
                return;
            }

            // Handle event collision resolution only when resolved
            if (this._eventCollisionResolved) {
                this._eventCollisionResolved = false;
                this._processingEventCollision = false;
                this._storedTurnIndex = null;
                this._storedBattler = null;

                const currentBattler = this._turnOrder[this._currentTurnIndex];
                if (currentBattler && currentBattler.currentHP() > 0) {
                    this.selectBattler(currentBattler);
                    if (!PTBS_AI.isControlledByAI(currentBattler)) {
                        this._state = "command";
                        // Defer UI updates to Scene_Map to avoid redundant calls here
                        if (SceneManager._scene && SceneManager._scene._ptbsCommandWindow) {
                            SceneManager._scene._ptbsCommandWindow.open();
                            SceneManager._scene._ptbsCommandWindow.activate();
                        }
                    } else {
                        this.endCurrentTurn(); // AI battlers end turn immediately
                    }
                } else {
                    this.endCurrentTurn(); // Skip dead battlers
                }
                return; // Exit after handling collision to avoid overlap with other updates
            }

            // Update walking state only when active
            if (this._state === "walk") {
                this.updateWalking();
            }

            // Update action sequence only when active
            if (this._state === "actionSequence") {
                this.updateActionSequence();
            }

            // Update battlers with throttling based on changes
            const scene = SceneManager._scene;
            for (const battler of this._battlers) {
                // Update pixel movement only if active
                if (battler._pixelMoveData) {
                    this.updatePixelMove(battler);
                }

                // Update direction only if it changed
                const currentDir = battler.event().direction();
                if (battler._lastDir !== currentDir) {
                    battler.updateDirectionIfChanged();
                }

                // Update state animations only if they exist
                if (battler._loopedStatesAnimIds && battler._loopedStatesAnimIds.length > 0) {
                    battler.updateStateLoopAnimations();
                }

                // Check for death of selected battler and end turn if necessary
                if (battler === this._selectedBattler && battler.currentHP() <= 0) {
                    this.endCurrentTurn();
                    break; // Exit loop after ending turn to avoid multiple turn ends
                }
            }

            // Update camera control based on current mode
            this.updateCameraControl();

            // Reset win condition check flag for next turn (set in endCurrentTurn)
            // Note: This is handled in endCurrentTurn, not here, to align with turn cycle
        }

        static handleVictory() {

            // Mark the battle as finished so that no further updates occur.
            //this._active = false; //Moved to deactivate.
            this._victoryProcessed = true;

            // Clear any UI elements first.
            if (SceneManager._scene) {
                SceneManager._scene.clearAllGridsAndState();
                SceneManager._scene.hidePTBSWindows();
            }

            // **CRITICAL CHANGE:** Clear paused event data on DEACTIVATE.
            this._pausedEventData = null;

            // Reset internal state.
            this._state = "idle";
            this._skillAction = null;
            this._itemAction = null;
            this._selectedBattler = null;

            //this._uiInitialized = false; Removed and handled in Scene_Map.

            // --- VICTORY SWITCH LOGIC ---
            if (this.victorySwitch > 0) {
                $gameSwitches.setValue(this.victorySwitch, true);
            }

            if (this.victorySelfSwitch && this.victorySelfSwitchEventId > 0) {
                const key = [$gameMap.mapId(), this.victorySelfSwitchEventId, this.victorySelfSwitch];
                $gameSelfSwitches.setValue(key, true);
            }
            // --- END VICTORY SWITCH LOGIC ---
            // Deactivate PTBS *after* clearing UI
            this.deactivate();

            // Optionally, transition out of the battle scene.
            SceneManager.goto(Scene_Map);
        }

        static checkDefeatConditions() {  // Remove the deadBattler argument
            // Determine the player's faction.  Assume the first *actor* in the list
            // is on the player's side.  This is a reasonable assumption.
            const playerBattler = this._battlers.find(b => b._actor);

            // If there are NO player battlers at all, that's a defeat.
            if (!playerBattler) {
                this.handleDefeat();
                return; // Early exit
            }

            const playerFaction = playerBattler._faction;
            // Check if ALL battlers of the player's faction are dead.
            const allPlayerBattlersDead = this._battlers.every(b => {
                if (b._faction === playerFaction) {
                    return b.currentHP() <= 0;
                }
                return true; // Ignore non-player-faction battlers
            });


            if (allPlayerBattlersDead) {
                this.handleDefeat();
            }
        }

        static handleDefeat() {
            // --- DEFEAT SWITCH LOGIC ---
            if (this.defeatSwitch > 0) {
                $gameSwitches.setValue(this.defeatSwitch, true);
            }

            if (this.defeatSelfSwitch && this.defeatSelfSwitchEventId > 0) {
                const key = [$gameMap.mapId(), this.defeatSelfSwitchEventId, this.defeatSelfSwitch];
                $gameSelfSwitches.setValue(key, true);
            }

            // --- END DEFEAT SWITCH ---

            // Deactivate PTBS
            this.deactivate();
        }


        static updateWalking() {
            const b = this._selectedBattler;
            if (!b) return;

            if (b._moveQueue && b._moveQueue.length > 0 && !b.isMoving()) {
                const dir = b._moveQueue.shift();
                b.moveOneStep(dir);
            } else if (!b._moveQueue || b._moveQueue.length === 0) {
                // Movement has ended, but we should ensure the battler is fully stopped
                if (!b.isMoving()) {
                    // Only check for events or return to command mode when fully stopped
                    this.checkEventCollisions(b);
                }
            }
        }

        static isTileInMoveScope(x, y, battler, visited) {
            if (!$gameMap || !$gameMap.isValid(x, y)) return false;

            const key = y * $gameMap.width() + x;
            const visitedSet = (visited instanceof Set) ? visited : new Set(); // Safety check
            if (visitedSet.has(key)) return false;

            if (this._blockedRegionsMap && this._blockedRegionsMap.has(key)) return false;

            if (!battler || !battler.event()) return false;
            const direction = battler.event().direction();
            if (!$gameMap.isPassable(x, y, direction)) return false;

            const event = $gameMap.events().find(e => e.pos(x, y) && !e._erased && e !== battler._event);
            if (event) return false;

            const battlerThere = this._battlers.find(b => b !== battler && b._event.pos(x, y));
            if (battlerThere && battlerThere.isAlive()) return false;

            return true;
        }

        static checkEventCollisions(battler) {
            if (!battler || this._processingEventCollision) {
                // Prevent re-entry
                return;
            }

            // Additional check to ensure battler has completely stopped moving
            if (battler.isMoving()) {
                return;
            }

            const x = battler.event().x;
            const y = battler.event().y;
            const eventsHere = $gameMap.eventsXy(x, y);

            // Prioritize and refine the trigger check - ONLY Event Touch
            const triggerableEvent = eventsHere.find(event =>
            event.eventId() !== battler.event().eventId() && // Don't trigger on self
            event.isTriggerIn([2]) && // ONLY Event Touch trigger
            eventHasPTBSEventTag(event) &&  // MUST have the <PTBS EVENT> tag
            !event._erased  // Make SURE the event hasn't been erased
            );

            if (triggerableEvent) {
                this._storedTurnIndex = this._currentTurnIndex;
                this._storedBattler = this._selectedBattler;
                this._processingEventCollision = true; // Set the flag IMMEDIATELY

                if (SceneManager._scene) {
                    SceneManager._scene.hidePTBSWindows();
                }

                // Start the event - The modified Game_Event.prototype.start will handle the pause
                triggerableEvent.start();

                // Set up an interval to check when the event is finished
                if (!triggerableEvent._ptbsEventCheckInterval) { // Only set up one interval
                    triggerableEvent._ptbsEventCheckInterval = setInterval(() => {
                        if (!triggerableEvent._interpreter || !triggerableEvent._interpreter.isRunning()) {
                            clearInterval(triggerableEvent._ptbsEventCheckInterval);
                            triggerableEvent._ptbsEventCheckInterval = null;
                            this._eventCollisionResolved = true; // Signal that the collision has been resolved
                        }
                    }, 100); // Check every 100ms
                }
            } else {
                // Add this section to handle the different turn-end states
                if (battler.currentHP() <= 0) {  // Check if the battler died during movement
                    this._state = "idle";
                    this.endCurrentTurn();
                }
                else if (!battler._hasAttacked && battler._remainingMovePoints > 0) {
                    this._state = "command";
                } else if (!battler._hasAttacked) {
                    this._state = "command";
                } else {
                    this._state = "face";
                }

                if (this._state == "command") {
                    if (SceneManager._scene && SceneManager._scene._ptbsCommandWindow) {
                        // Ensure battler is completely stopped before showing command window
                        if (!battler.isMoving()) {
                            SceneManager._scene._ptbsCommandWindow.open();
                            SceneManager._scene._ptbsCommandWindow.activate();
                        }
                    }
                }
            }
        }



        static runBattleStartSequences() {
            for (const battler of this._battlers) {
                // 1) If there is an event-based <visual equip>, run them instantly:
                if (battler._ptbsData && battler._ptbsData.visualEquipSteps) {
                    for (const step of battler._ptbsData.visualEquipSteps) {
                        PTBS_Manager.doActionSequenceStep(battler, step);
                        battler._actionSequenceWait = 0;
                    }
                }

                // 2) If there is a weapon-based <visual equip>, also run them instantly:
                if (battler._weaponVisualEquipSteps && battler._weaponVisualEquipSteps.length > 0) {
                    for (const step of battler._weaponVisualEquipSteps) {
                        PTBS_Manager.doActionSequenceStep(battler, step);
                        battler._actionSequenceWait = 0;
                    }
                }

                battler.onDirectionChanged(battler.event().direction());

                // 3) Then run any <action sequence: battleStart>
                const startSeq = battler.getActionSequence("battleStart");
                if (startSeq && startSeq.length > 0) {
                    battler._actionSequence = [...startSeq];
                    battler._actionSequenceIndex = 0;
                    battler._actionSequenceWait = 0;
                }
            }
        }

        static updateActionSequence() {
            // Get the currently selected battler.
            const battler = this._selectedBattler;
            if (!battler) return;

            // If the battler is not in an action sequence, switch state (or end turn).
            if (!battler.isInActionSequence()) {
                if (PTBS_AI.isControlledByAI(battler)) {
                    this.endCurrentTurn();
                } else {
                    // For player battlers, switch to command mode if not already active.
                    if (!battler._commandModeActive) {
                        battler._commandModeActive = true;
                        this._state = "command";
                        // (Optionally open the command window here.)
                    }
                }
                return;
            }

            // Otherwise, the battler is in an action sequence.
            // Get the current step from the battler's sequence.
            const currentStep = battler._actionSequence[battler._actionSequenceIndex];
            let stepComplete = false;

            // SPECIAL HANDLING FOR PIXEL MOVE (or JUMP) STEPS:
            if (currentStep.type === "pixelMove" || currentStep.type === "jump") {
                // If this step has not yet been initialized, do so.
                if (!currentStep._pixelMoveInitialized) {
                    // Call your doPixelMove function (which creates a tween and sets _pixelMoveData).
                    this.doPixelMove(battler, currentStep);
                    currentStep._pixelMoveInitialized = true;
                    stepComplete = false; // Wait until the tween finishes.
                } else {
                    // Already initialized – check whether updatePixelMove has marked the step complete.
                    if (currentStep._pixelMoveDone) {
                        // Clean up our temporary flags.
                        delete currentStep._pixelMoveInitialized;
                        delete currentStep._pixelMoveDone;
                        stepComplete = true;
                    } else {
                        stepComplete = false;
                    }
                }
            } else {
                // For all other step types, process them using your normal command handler.
                // (doActionSequenceStep should return true when the step is complete.)
                stepComplete = this.doActionSequenceStep(battler, currentStep);
            }

            // If the current step is finished, advance the sequence.
            if (stepComplete) {
                battler._actionSequenceIndex++;
                // If we’ve processed all steps, end the turn (or switch to another state).
                if (battler._actionSequenceIndex >= battler._actionSequence.length) {
                    //If it is an enemy
                    if (PTBS_AI.isControlledByAI(battler)) {
                        this.endCurrentTurn();
                    } else {
                        // For player-controlled battlers, you might change to "face" state.
                        this._state = "face";
                        battler._actionSequence = null; //ADDED. Clear sequence.
                    }
                }
            }
        }




        static doIfDirectionCommand(battler, step) {
            // 1) The direction is stored in step.direction
            const desiredDirString = step.direction;  // e.g. "up" or "down" or "left" etc.
            let neededDir = 2;  // default is 'down'

            switch (desiredDirString.toLowerCase()) {
                case "up":    neededDir = 8; break;
                case "left":  neededDir = 4; break;
                case "right": neededDir = 6; break;
                case "down":  neededDir = 2; break;
            }

            // 2) Compare with the current direction
            const currentDir = battler.event().direction();
            if (currentDir === neededDir) {
                // 3) ifDirection means "only run the subCmd if facing neededDir"
                // The sub-command text is in step.subCmd:
                const subCmd = step.subCmd;
                // Then parse that sub-command into steps:
                const subSteps = parseActionSequenceSteps(subCmd);

                // 4) Insert them into the battler's action sequence
                if (subSteps && subSteps.length > 0) {
                    battler._actionSequence.splice(
                        battler._actionSequenceIndex + 1,
                        0,
                        ...subSteps
                    );
                }
            }

            // Return true to let the sequence proceed
            return true;
        }

        static transformOffsetsByDirection(offsetX, offsetY, direction) {
            let finalX = offsetX;
            let finalY = offsetY;

            switch (direction) {
                case 8: // Up (default, no transformation)
finalX = offsetX;
finalY = offsetY;
break;
                case 6: // Right (rotate 90° clockwise: X → Y, Y → -X)
finalX = -offsetY;
finalY = -offsetX;
break;
                case 2: // Down (rotate 180°: X → -X, Y → -Y)
finalX = -offsetX;
finalY = -offsetY;
break;
                case 4: // Left (rotate 270° clockwise: X → -Y, Y → X)
finalX = offsetY;
finalY = offsetX;
break;
                default:
                    console.warn(`Unknown direction ${direction}, using offsets as-is`);
            }

            return { x: finalX, y: finalY };
        }


        static doIconCommand(battler, step) {
            const args = step.args;
            if (!args || args.length < 2) {
                console.warn("icon command called with insufficient arguments:", args);
                return true; // Skip and continue the sequence
            }

            // "user", "target", etc.
            const subjectString = args[0];
            const subjectEvents = this.resolveSubjects(battler, subjectString);
            const subjectBattlers = [];
            for (const ev of subjectEvents) {
                const subBattler = PTBS_Manager._battlers.find(b => b && b.event() === ev);
                if (subBattler) subjectBattlers.push(subBattler);
            }

            // The second argument, e.g. "icon 86", "equip 1", "clear"
            const typeArg = args[1].toLowerCase();

            // If "clear", remove existing icon
            if (typeArg === "clear") {
                if (args.length < 3) {
                    console.warn("icon clear command missing index:", args);
                    return true;
                }
                const iconIndexToClear = args[2];
                for (const sb of subjectBattlers) {
                    sb.clearIcon(iconIndexToClear);
                }
                return true;
            }

            // We'll parse the rest of the arguments now
            let argPos = 2;

            // (A) The "iconIndex" in our code means the "slot" name for the icon
            //     So this could be "1" or "weaponIcon" or anything you want to identify it
            const iconIndex = args[argPos++] || "1";

            // (B) offsetX, offsetY, optional opacity, angle, spin, etc.
            const offsetX = Number(args[argPos++] || 0);
            const offsetY = Number(args[argPos++] || 0);

            let opacity = 255;
            if (argPos < args.length && !isNaN(Number(args[argPos]))) {
                opacity = Number(args[argPos++]);
            }

            let angleDeg = 0;
            if (argPos < args.length) {
                const angleArg = args[argPos];
                if (angleArg === "target") {
                    angleDeg = 0;
                    argPos++;
                } else if (!isNaN(Number(angleArg))) {
                    angleDeg = Number(angleArg);
                    argPos++;
                }
            }

            let spinSpeed = 0;
            if (argPos < args.length && !isNaN(Number(args[argPos]))) {
                spinSpeed = Number(args[argPos]);
                argPos++;
            }

            let aboveSubject = false;
            while (argPos < args.length) {
                if (args[argPos].toLowerCase() === "above") {
                    aboveSubject = true;
                }
                argPos++;
            }

            // Now let's handle "icon" vs "equip" vs other
            // We'll store a small "marker object" so we know how to finalize it per subject
            let equipSlot = null;
            let baseIconId = 0;

            if (typeArg.startsWith("icon")) {
                // e.g. "icon 84"
                const parts = args[1].split(" "); // ["icon","84"]
                if (parts.length >= 2) {
                    baseIconId = Number(parts[1]) || 0;
                }
            } else if (typeArg.startsWith("equip")) {
                // e.g. "equip 1"
                const parts = args[1].split(" "); // ["equip","1"]
                equipSlot = Number(parts[1]) || 0;
            }

            // Then for each subjectBattler, we actually finalize the iconId
            for (const sb of subjectBattlers) {
                let finalIconId = baseIconId; // default (in case it's an "icon X")

// If it's "equip N", we attempt to fetch from actor's equipment
if (equipSlot !== null && sb._actor) {
    const eqItem = sb._actor.equips()[equipSlot];
    if (eqItem && eqItem.iconIndex) {
        finalIconId = eqItem.iconIndex;
    } else {
        finalIconId = 0;  // fallback, or you could skip
    }
}

// Now build the iconData
const iconData = {
    iconId: finalIconId,
 offsetX: offsetX,
 offsetY: offsetY,
 opacity: opacity,
 angle: angleDeg,
 spin: spinSpeed,
 above: aboveSubject
};

sb.setIcon(iconIndex, iconData);
            }

            return true;
        }

        static doPictureCommand(battler, step) {
            const args = step.args;
            if (!args || args.length < 2) return true;

            const subjectString = args[0];
            const subjectEvents = this.resolveSubjects(battler, subjectString);
            const subjectBattlers = [];
            for (const ev of subjectEvents) {
                const subBattler = PTBS_Manager._battlers.find(b => b && b.event() === ev);
                if (subBattler) subjectBattlers.push(subBattler);
            }

            // The second argument is now the picture filename (e.g. "XT-1-Railgun")
            const basePictureName = args[1];

            // The third argument is a “slot” (like icon index) to store it under
            const pictureSlot = args[2] || "1";

            // Parse offsets and other parameters:
            let argPos = 3;
            const offsetX = Number(args[argPos++] || 0);
            const offsetY = Number(args[argPos++] || 0);
            let opacity = 255;
            if (argPos < args.length && !isNaN(Number(args[argPos]))) {
                opacity = Number(args[argPos++]);
            }
            let angleDeg = 0;
            if (argPos < args.length) {
                const angleArg = args[argPos];
                if (angleArg === "target") {
                    angleDeg = 0;
                    argPos++;
                } else if (!isNaN(Number(angleArg))) {
                    angleDeg = Number(angleArg);
                    argPos++;
                }
            }
            let spinSpeed = 0;
            if (argPos < args.length && !isNaN(Number(args[argPos]))) {
                spinSpeed = Number(args[argPos]);
                argPos++;
            }
            let aboveSubject = false;
            while (argPos < args.length) {
                if (args[argPos].toLowerCase() === "above") {
                    aboveSubject = true;
                }
                argPos++;
            }

            // For each subject battler, store picture data.
            for (const sb of subjectBattlers) {
                const pictureData = {
                    pictureName: basePictureName,
 offsetX: offsetX,
 offsetY: offsetY,
 opacity: opacity,
 angle: angleDeg,
 spin: spinSpeed,
 above: aboveSubject
                };
                sb.setPicture(pictureSlot, pictureData);
            }
            return true;
        }




        static doimageMoveCommand(battler, step) {
            const args = step.args;
            if (!args || args.length < 5) {
                console.warn("imageMove command: insufficient args:", args);
                return true;
            }
            // subject, iconIndex, offsetX, offsetY, opacity, angleArg, spin, frames
            const subjectString = args[0];
            const iconIndex     = args[1];
            const targetX       = Number(args[2]) || 0;
            const targetY       = Number(args[3]) || 0;
            const targetOpacity = (args[4] !== undefined) ? Number(args[4]) : null;
            const angleArg      = args[5];  // might be "target" or "myManualFace"
            const targetSpin    = (args[6] !== undefined) ? Number(args[6]) : null;
            const frames        = (args[7] !== undefined) ? Number(args[7]) : 30;

            // Resolve the subject battlers
            const subjectEvents = this.resolveSubjects(battler, subjectString);
            const subjectBattlers = [];
            for (const ev of subjectEvents) {
                const subBattler = PTBS_Manager._battlers.find(b => b.event() === ev);
                if (subBattler) subjectBattlers.push(subBattler);
            }

            for (const sb of subjectBattlers) {
                const data = sb.getIconData(iconIndex);
                if (!data) continue;

                // A) Decide finalAngle using sb._ptbsFaceDir
                let finalAngle = data.angle || 0; // default
                // If angleArg is numeric, parse it
                if (angleArg !== undefined && !isNaN(Number(angleArg))) {
                    finalAngle = Number(angleArg);
                }


                // B) Current (start) values
                const startX       = data.offsetX;
                const startY       = data.offsetY;
                const startOpacity = (data.opacity !== undefined) ? data.opacity : 255;
                const startAngle   = (data.angle   !== undefined) ? data.angle   : 0;
                const startSpin    = (data.spin    !== undefined) ? data.spin    : 0;

                // C) If param is null, keep original
                const endOpacity = (targetOpacity !== null) ? targetOpacity : startOpacity;
                const endSpin    = (targetSpin !== null)    ? targetSpin    : startSpin;

                // D) Create (or update) the tween
                data._moveTween = {
                    framesLeft: frames,
 framesTotal: frames,

 startX,
 startY,
 endX: targetX,
 endY: targetY,

 startOpacity,
 endOpacity,

 startAngle,
 endAngle: finalAngle,
 startSpin,
 endSpin
                };
            }

            return true;
        }

        static doimageMoveRelativeCommand(battler, step) {
            const args = step.args;
            // Expecting something like: imageMoveRelative(user, iconIndex, dx, dy, opacity, angleDelta, spinDelta, frames)
            // e.g. imageMoveRelative(user, 1, -20, 0, 255, -90, 0, 10)
            // Where dx, dy, angleDelta, spinDelta are "additions" to the current offset/angle/spin, but opacity is absolute.

            if (!args || args.length < 5) {
                console.warn("imageMoveRelative command: insufficient args:", args);
                return true;
            }

            // 1) Parse the arguments
            const subjectString = args[0];        // e.g. "user"
            const iconIndex     = args[1];        // e.g. "1"
            const dx           = Number(args[2]) || 0;
            const dy           = Number(args[3]) || 0;
            const newOpacity   = (args[4] !== undefined) ? Number(args[4]) : null;
            let angleDelta     = (args[5] !== undefined) ? Number(args[5]) : 0;
            const spinDelta    = (args[6] !== undefined) ? Number(args[6]) : 0;
            const frames       = (args[7] !== undefined) ? Number(args[7]) : 30;

            // 2) Resolve the subject(s)
            const subjectEvents = this.resolveSubjects(battler, subjectString);
            const subjectBattlers = [];
            for (const ev of subjectEvents) {
                const subBattler = PTBS_Manager._battlers.find(b => b.event() === ev);
                if (subBattler) subjectBattlers.push(subBattler);
            }

            // 3) For each subject’s icon data, set up a tween from old -> new (relative)
            for (const sb of subjectBattlers) {
                const data = sb.getIconData(iconIndex);
                if (!data) continue; // No icon with that index

                // (A) Identify the subject’s facing direction
                //     If facing Down(2) or Right(6), invert the angleDelta
                const d = sb.event().direction();  // 2=Down,4=Left,6=Right,8=Up
                if (d === 2 || d === 6) {
                    angleDelta = -angleDelta;
                }

                // (B) Our "start" values
                const startX     = data.offsetX;
                const startY     = data.offsetY;
                const startAngle = data.angle   || 0;
                const startSpin  = data.spin    || 0;
                // opacity is not relative, so if user gave a newOpacity we’ll apply it directly
                // otherwise we keep the old one
                const startOpacity = (data.opacity !== undefined) ? data.opacity : 255;

                // (C) Our "end" values
                const endX       = startX + dx;
                const endY       = startY + dy;
                const endAngle   = startAngle + angleDelta;
                const endSpin    = startSpin + spinDelta;
                // For opacity, if newOpacity == null => keep current, else override
                const endOpacity = (newOpacity !== null) ? newOpacity : startOpacity;

                // (D) Create or update the tween
                data._moveTween = {
                    framesLeft:   frames,
 framesTotal:  frames,

 startX,       endX,
 startY,       endY,

 startAngle,   endAngle,
 startSpin,    endSpin,

 // We’re applying newOpacity as absolute, not relative
 startOpacity, endOpacity
                };
            }

            // Return true => we finished parsing the command so the action sequence
            // can move on if there's no waiting mechanism here
            return true;
        }

        static doPixelShake(battlerList, step) {
            // If we've already flagged the step as done, skip
            if (step._shakeDone) return true;

            // If no battlers found, just finish
            if (!battlerList || battlerList.length === 0) {
                step._shakeDone = true;
                return true;
            }

            let stillShaking = false;

            // For each battler we want to shake
            for (const b of battlerList) {
                // 1) If no existing shake data, initialize
                if (!b._pixelShakeData) {
                    b._pixelShakeData = {
                        framesTotal: step.duration,
 framesLeft:  step.duration,
 power:       step.power, // amplitude
 speed:       step.speed, // wiggle frequency
 originalX:   b._pixelOffsetX || 0,
 originalY:   b._pixelOffsetY || 0
                    };
                }
                const d = b._pixelShakeData;

                // 2) If still in mid-shake
                if (d.framesLeft > 0) {
                    d.framesLeft--;

                    const t = 1.0 - (d.framesLeft / d.framesTotal);
                    const angle = 2 * Math.PI * d.speed * t;
                    const offset = d.power * Math.sin(angle);

                    b._pixelOffsetX = d.originalX + offset;
                    b._pixelOffsetY = d.originalY;
                    stillShaking = true;
                } else {
                    // done shaking => reset
                    b._pixelOffsetX = d.originalX;
                    b._pixelOffsetY = d.originalY;
                    b._pixelShakeData = null;
                }
            }

            // 3) If no one is still shaking, mark step done
            if (!stillShaking) {
                step._shakeDone = true;
                // Add optional wait after finishing
                battlerList[0]._actionSequenceWait = step.wait || 0;
                return true;
            } else {
                // Still shaking => block sequence
                return false;
            }
        }

        //--------------------------------------------------
        // The Pixel Move Step: doPixelMove
        //--------------------------------------------------
        static doPixelMove(battler, step) {

            // If a tween is already active, simply return.
            if (battler._pixelMoveData) {
                return false;
            }

            // Parse arguments.
            // For example, step.args might be: ["user", "home", "30", "0", "map"]
            const args = step.args;
            const frames = Number(args[2]) || 15;
            const layer  = (args[4] || "map").toLowerCase();

            // Get the tile dimensions.
            const tileWidth  = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();

            // Compute the desired absolute pixel position for "home".
            let desiredX, desiredY;
            if (args[1].toLowerCase() === "home") {
                if (battler._homeTileX !== undefined && battler._homeTileY !== undefined) {
                    desiredX = battler._homeTileX * tileWidth + tileWidth / 2;
                    desiredY = battler._homeTileY * tileHeight + tileHeight - 6;
                } else {
                    // Fallback: use current event's absolute position.
                    desiredX = battler.event().x * tileWidth + tileWidth / 2;
                    desiredY = battler.event().y * tileHeight + tileHeight - 6;
                }
            } else {
                // For other destination keywords (if any), default to current event position.
                desiredX = battler.event().x * tileWidth + tileWidth / 2;
                desiredY = battler.event().y * tileHeight + tileHeight - 6;
            }

            // Compute the battler event's current absolute pixel position.
            // (Assuming battler.event().x and .y are in tile coordinates.)
            const currentX = battler.event().x * tileWidth + tileWidth / 2;
            const currentY = battler.event().y * tileHeight + tileHeight - 6;

            // Compute the target offset relative to the current event position.
            const targetOffsetX = desiredX - currentX;
            const targetOffsetY = desiredY - currentY;

            // Determine if this should be a jump (for a jump-type step).
            const isJump = (step.type === "jump");
            const arcHeight = isJump ? (Number(step.arc) || 24) : 0;

            // Initialize the tween data on the battler.
            battler._pixelMoveData = {
                startX: battler._pixelOffsetX || 0,
 startY: battler._pixelOffsetY || 0,
 endX: targetOffsetX,
 endY: targetOffsetY,
 framesTotal: frames,
 framesLeft: frames,
 layer: layer,
 isJump: isJump,
 arcHeight: arcHeight,
 stepRef: step
            };

            return false; // Indicate that the step is not finished yet.
        }

        //--------------------------------------------------
        // The Update Function: updatePixelMove
        //--------------------------------------------------
        static updatePixelMove(battler) {
            // If no tween data exists, nothing to do.
            if (!battler._pixelMoveData) return;

            const data = battler._pixelMoveData;

            // Decrement the remaining frames.
            data.framesLeft--;

            // Compute normalized progress t (0 at start, 1 when complete).
            const t = 1 - (data.framesLeft / data.framesTotal);

            // Interpolate X offset linearly.
            battler._pixelOffsetX = data.startX + (data.endX - data.startX) * t;

            // For Y, add a jump arc if specified.
            let jumpOffset = 0;
            if (data.isJump) {
                // Sine-based jump: at t=0 and t=1 offset is 0; maximum at t=0.5.
                jumpOffset = data.arcHeight * Math.sin(Math.PI * t);
            }
            battler._pixelOffsetY = data.startY + (data.endY - data.startY) * t - jumpOffset;

            // When the tween is complete...
            if (data.framesLeft <= 0) {
                battler._pixelOffsetX = data.endX;
                battler._pixelOffsetY = data.endY;
                battler._pixelMoveData = null;
                if (data.stepRef) {
                    data.stepRef._pixelMoveDone = true;
                }
            }
        }




        static doPixelMoveRelative(battler, step) {
            // If we already finished this step, skip:
            if (step._pixelMoveDone) return true;

            // 1) Parse out data from the step
            const subjectEvents = this.resolveSubjects(battler, step.subjectStr);
            if (!subjectEvents.length) return true;
            const subjectEvent = subjectEvents[0];

            const dirString = step.relDirStr.toLowerCase(); // "left", "right", "front", or "back"
            const frames    = step.frames;
            const distance  = step.distance;
            const layer     = step.layer;
            const isReturn  = false;

            // 2) Identify the battler's map direction (2/down, 4/left, 6/right, 8/up)
            const mapDir = subjectEvent.direction();

            // 3) Convert "left/right/front/back" into offsets in (x, y) **relative** to facing
            const [offsetX, offsetY] = this.relativeOffsets(mapDir, dirString, distance);

            // 4) We need the subject's current pixel offset (if any)
            const startX = battler._pixelOffsetX || 0;
            const startY = battler._pixelOffsetY || 0;

            // 5) The ending offset is just (startX + offsetX, startY + offsetY)
            const endX = startX + offsetX;
            const endY = startY + offsetY;

            // 6) Store movement data
            battler._pixelMoveData = {
                startX,
 startY,
 endX,
 endY,
 framesTotal: frames,
 framesLeft: frames,
 layer,
 stepRef: step,
 isReturn
            };

            // Return false => so the sequence will wait for movement
            return false;
        }

        static doPixelJump(battler, step) {

            // If we've already finished this jump, skip:
            if (step._pixelMoveDone) {
                return true;
            }

            const subjectEvents = this.resolveSubjects(battler, step.subjectStr);
            if (!subjectEvents.length) {
                console.warn("[doPixelJump] --> Could not resolve subject for jump");
                return true;
            }
            const subjectEvent = subjectEvents[0];

            // Convert to lowercase just in case
            const toStr = String(step.toStr || "").toLowerCase();

            let targetX, targetY;
            if (toStr.includes("target")) {
                const tEvents = this.resolveSubjects(battler, "target");
                if (!tEvents.length) {
                    console.warn("[doPixelJump] --> No 'target' found, returning");
                    return true;
                }
                const tEvent = tEvents[0];
                targetX = tEvent.screenX();
                targetY = tEvent.screenY();
            }
            else if (toStr.includes("home")) {
                if (battler._homeTileX != null && battler._homeTileY != null) {
                    const tw = $gameMap.tileWidth();
                    const th = $gameMap.tileHeight();
                    const scrollX = $gameMap.displayX() * tw;
                    const scrollY = $gameMap.displayY() * th;
                    targetX = battler._homeTileX * tw + tw/2 - scrollX;
                    targetY = battler._homeTileY * th + th - 6 - scrollY;
                } else {
                    console.warn("[doPixelJump] --> No home coords, returning");
                    return true;
                }
            }
            else {
                // (Optional) If you want to parse raw "x,y" or do nothing
                return true;
            }

            // Current position
            const currentX = subjectEvent.screenX() + (battler._pixelOffsetX || 0);
            const currentY = subjectEvent.screenY() + (battler._pixelOffsetY || 0);

            // Stop short if needed
            if (step.distance > 0) {
                const dx = targetX - currentX;
                const dy = targetY - currentY;
                const length = Math.sqrt(dx * dx + dy * dy);
                if (length > step.distance) {
                    const ratio = (length - step.distance) / length;
                    targetX = currentX + dx * ratio;
                    targetY = currentY + dy * ratio;
                }
            }

            // We'll store the pixelMoveData
            battler._pixelMoveData = {
                startX: battler._pixelOffsetX || 0,
 startY: battler._pixelOffsetY || 0,
 endX: (battler._pixelOffsetX || 0) + (targetX - currentX),
 endY: (battler._pixelOffsetY || 0) + (targetY - currentY),
 framesTotal: step.frames,
 framesLeft: step.frames,
 layer: step.layer,
 stepRef: step,
 isJump: true,    // used by updatePixelMove
 arcHeight: step.arc
            };

            return false;  // Wait for jump to finish
        }


        /**
         * Convert "left"/"right"/"front"/"back" + facing direction → (dx, dy)
         */
        static relativeOffsets(mapDir, relDirStr, distance) {
            let dx = 0;
            let dy = 0;

            // Step A: interpret "forward" or "back" as forward/back along mapDir
            if (relDirStr === "front") {
                if (mapDir === 2) {        // down
                    dy = distance;
                } else if (mapDir === 8) { // up
                    dy = -distance;
                } else if (mapDir === 6) { // right
                    dx = distance;
                } else if (mapDir === 4) { // left
                    dx = -distance;
                }
            }
            else if (relDirStr === "back") {
                if (mapDir === 2) {
                    dy = -distance;
                } else if (mapDir === 8) {
                    dy = distance;
                } else if (mapDir === 6) {
                    dx = -distance;
                } else if (mapDir === 4) {
                    dx = distance;
                }
            }
            // Step B: "left" / "right" means perpendicular to facing direction
            else if (relDirStr === "left") {
                if (mapDir === 2) {
                    dx = -distance;
                } else if (mapDir === 8) {
                    dx = distance;
                } else if (mapDir === 6) {
                    dy = distance;   // facing right => "left" is downward
                } else if (mapDir === 4) {
                    dy = -distance;  // facing left => "left" is upward
                }
            }
            else if (relDirStr === "right") {
                if (mapDir === 2) {
                    dx = distance;
                } else if (mapDir === 8) {
                    dx = -distance;
                } else if (mapDir === 6) {
                    dy = -distance;  // facing right => "right" is upward
                } else if (mapDir === 4) {
                    dy = distance;   // facing left => "right" is downward
                }
            }

            return [dx, dy];
        }

        /**
         * Convert "left"/"right"/"front"/"back" + facing direction → (dx, dy).
         * `distance` is how many pixels (or your chosen scale) to move in that direction.
         *
         * For example, if you're facing up (8), "front" means offsetY -= distance.
         * If you're facing left (4), then "left" means offsetY += distance, etc.
         */
        static relativeOffsets(mapDir, relDirStr, distance) {
            let dx = 0;
            let dy = 0;

            // Front/back stay the same
            if (relDirStr === "front") {
                if (mapDir === 2) {        // down
                    dy = distance;
                } else if (mapDir === 8) { // up
                    dy = -distance;
                } else if (mapDir === 6) { // right
                    dx = distance;
                } else if (mapDir === 4) { // left
                    dx = -distance;
                }
            }
            else if (relDirStr === "back") {
                if (mapDir === 2) {
                    dy = -distance;
                } else if (mapDir === 8) {
                    dy = distance;
                } else if (mapDir === 6) {
                    dx = -distance;
                } else if (mapDir === 4) {
                    dx = distance;
                }
            }
            // For left/right movements:
            // When facing down (2): left = -x, right = +x
            // When facing up (8): left = -x, right = +x
            // When facing right (6): left = +y, right = -y
            // When facing left (4): left = -y, right = +y
            else if (relDirStr === "right") {
                if (mapDir === 2) {
                    dx = -distance;
                } else if (mapDir === 8) {
                    dx = distance;  // Reversed when facing up
                } else if (mapDir === 6) {
                    dy = distance;
                } else if (mapDir === 4) {
                    dy = -distance;
                }
            }
            else if (relDirStr === "left") {
                if (mapDir === 2) {
                    dx = distance;
                } else if (mapDir === 8) {
                    dx = -distance;  // Reversed when facing up
                } else if (mapDir === 6) {
                    dy = -distance;
                } else if (mapDir === 4) {
                    dy = distance;
                }
            }

            return [dx, dy];
        }

        // [Utility to check if a target is valid for some “scope_select”]
        static isValidTarget(attacker, target, scopeSelect) {
            if (!attacker || !target || target.currentHP() <= 0) return false;

            // Get faction information
            const attackerFaction = (attacker._faction || "neutral").toLowerCase();
            const targetFaction = (target._faction || "neutral").toLowerCase();

            // Simple faction check (different factions can attack each other)
            const differentFactions = attackerFaction !== targetFaction;

            switch (scopeSelect.toLowerCase()) {
                case 'enemies':
                    const isValid = differentFactions;
                    return isValid;

                case 'allies':
                    const isAlly = !differentFactions;
                    return isAlly;

                case 'all':
                    return true;

                default:
                    return false;
            }
        }

        // Attack validations
        static isValidAttackTarget(x, y) {
            const attacker = this.selectedBattler();
            if (!attacker) return false;

            // Check if tile is in attack range
            const attackTiles = this.getAttackableTiles(attacker);
            if (!attackTiles.some(t => t.x === x && t.y === y)) {
                return false;
            }

            // Check if there's a target there
            const target = this.battlerAt(x, y);
            if (!target || target.currentHP() <= 0) return false;

            // Use the scope from attacker's attack settings
            const scope = attacker.getAttackScope();
            return this.isValidTarget(attacker, target, scope.scopeSelect);
        }

        // Skill validations
        static isValidSkillTarget(skill, x, y) {
            const attacker = this.selectedBattler();
            if (!attacker) return false;

            // Check if tile is in skill range
            const skillTiles = this.getSkillableTiles(attacker, skill);
            if (!skillTiles.some(t => t.x === x && t.y === y)) {
                return false;
            }

            // Get scope_select from skill’s note (or 'enemies' if not specified)
            const scopeSelect = this.getScopeSelectFromSkill(skill) || 'enemies';

            // For AOE
            const aoeData = this.parseAOEFromNotes(skill);
            if (aoeData.enabled) {
                // Get all tiles in AOE range
                const aoeTiles = this.getAOERange(skill, x, y);
                // Check if at least one valid target is in the AOE
                for (const tile of aoeTiles) {
                    const possibleTarget = this.battlerAt(tile.x, tile.y);
                    if (possibleTarget && this.isValidTarget(attacker, possibleTarget, scopeSelect)) {
                        return true;
                    }
                }
                return false;
            }

            // Single-target skill
            const target = this.battlerAt(x, y);
            return this.isValidTarget(attacker, target, scopeSelect);
        }

        static getScopeSelectFromSkill(skill) {
            if (!skill || !skill.note) return null;
            const match = skill.note.match(/<PTBS>[\s\S]*?scope_select\s*:\s*(\w+)[\s\S]*?<\/PTBS>/i);
            return match ? match[1].toLowerCase() : null;
        }

        // [ITEM STUFF] Add isValidItemTarget, very similar to isValidSkillTarget
        static isValidItemTarget(item, x, y) {
            const user = this.selectedBattler();
            if (!user) return false;

            // 1) Check item’s range
            const itemTiles = this.getItemableTiles(user, item);
            if (!itemTiles.some(t => t.x === x && t.y === y)) {
                return false;
            }

            // Instead, do the same "AOE check" you do for Skills:
            const scopeSelect = this.getScopeSelectFromItem(item) || "allies";
            const aoeData = this.parseAOEFromNotes(item);
            if (aoeData.enabled) {
                // We have an AOE region. Check if at least 1 valid target is inside it.
                const aoeTiles = this.getAOERange(item, x, y); // same method used for skills
                for (const tile of aoeTiles) {
                    const battler = this.battlerAt(tile.x, tile.y);
                    if (battler && this.isValidTarget(user, battler, scopeSelect)) {
                        return true;  // Found at least one valid target => we can place the item
                    }
                }
                return false; // No valid targets in that AOE region
            } else {
                // Non‐AOE item => fall back to single‐target check
                const singleTarget = this.battlerAt(x, y);
                if (!singleTarget || singleTarget.currentHP() <= 0) return false;
                return this.isValidTarget(user, singleTarget, scopeSelect);
            }
        }

        static doActionSequenceStep(battler, step) {
            // If we have an active wait time, decrement it and block sequence progress
            if (battler._actionSequenceWait > 0) {
                battler._actionSequenceWait--;
                return false;
            }

            switch (step.type) {
                case "direction": {
                    const args = step.args || [];
                    if (args.length < 2) return true;

                    const subjectString = args[0];  // e.g. "user"
                    const directionParam = args[1]; // e.g. "behind", "target", "up", etc.

                    const subjectEvents = this.resolveSubjects(battler, subjectString);
                    if (!subjectEvents.length) return true;

                    if (!step._directionChangeStarted) {
                        for (const ev of subjectEvents) {
                            // Handle direction change
                            if (directionParam === "behind") {
                                let d = ev.direction();
                                switch (d) {
                                    case 2: d = 8; break;  // down → up
                                    case 8: d = 2; break;  // up → down
                                    case 4: d = 6; break;  // left → right
                                    case 6: d = 4; break;  // right → left
                                }
                                ev.setDirection(d);
                            }
                            else if (directionParam === "target") {
                                if (step.target && step.target.event) {
                                    const targetEv = step.target.event();
                                    const newDir = this.directionToFace(ev, targetEv);
                                    ev.setDirection(newDir);
                                }
                            }
                            else {
                                let neededDir = 2; // default is "down"
                                switch (directionParam.toLowerCase()) {
                                    case "up":    neededDir = 8; break;
                                    case "left":  neededDir = 4; break;
                                    case "right": neededDir = 6; break;
                                    case "down":  neededDir = 2; break;
                                }
                                ev.setDirection(neededDir);
                            }
                        }
                        step._directionChangeStarted = true;
                        battler._actionSequenceWait = step.wait || 0;
                        return false;
                    }
                    step._directionChangeStarted = false;
                    return true;
                }

                                    case "pixelShake": {
                                        if (step._shakeDone) return true;

                                        if (!step._shakeStarted) {
                                            const events = this.resolveSubjects(battler, step.subjectStr);
                                            const targetBattlers = events
                                            .map(ev => this._battlers.find(bt => bt && bt.event() === ev))
                                            .filter(bt => bt);

                                            return this.doPixelShake(targetBattlers, step);
                                        }
                                        return false;
                                    }

                                    case "pixelMove": {
                                        if (step._pixelMoveDone) return true;

                                        if (!step._pixelMoveStarted) {
                                            step._pixelMoveStarted = true;
                                            return this.doPixelMove(battler, step);
                                        }
                                        return false;
                                    }

                                    case "jump": {
                                        if (step._pixelMoveDone) return true;

                                        if (!step._jumpStarted) {
                                            step._jumpStarted = true;
                                            return this.doPixelJump(battler, step);
                                        }
                                        return false;
                                    }

                                    case "moveRelative": {
                                        if (!step._moveStarted) {
                                            step._moveStarted = true;
                                            return this.doPixelMoveRelative(battler, step);
                                        }
                                        return false;
                                    }

                                    case "moveForward": {
                                        if (!step._moveStarted) {
                                            this.moveBattlerForward(battler, step.dir);
                                            step._moveStarted = true;
                                            battler._actionSequenceWait = step.wait || 0;
                                            return false;
                                        }
                                        step._moveStarted = false;
                                        return true;
                                    }

                                    case "moveBackward": {
                                        if (!step._moveStarted) {
                                            this.moveBattlerBackward(battler, step.dir);
                                            step._moveStarted = true;
                                            battler._actionSequenceWait = step.wait || 0;
                                            return false;
                                        }
                                        step._moveStarted = false;
                                        return true;
                                    }

                                    case "screenShake": {
                                        if (!step._shakeStarted) {
                                            $gameScreen.startShake(step.power, step.speed, step.duration);
                                            step._shakeStarted = true;
                                            battler._actionSequenceWait = step.wait || 0;
                                            return false;
                                        }
                                        step._shakeStarted = false;
                                        return true;
                                    }

                                    case "ifDirection":
                                        return this.doIfDirectionCommand(battler, step);

                                    case "icon":
                                        return this.doIconCommand(battler, step);

                                    case "picture":
                                        return this.doPictureCommand(battler, step);

                                    case "balloon": {
                                        if (!step._balloonStarted) {
                                            const subjects = this.resolveSubjects(battler, step.args[0]);
                                            subjects.forEach(ev => {
                                                $gameTemp.requestBalloon(ev, Number(step.args[1]));
                                            });
                                            step._balloonStarted = true;
                                            battler._actionSequenceWait = step.wait || 30;
                                            return false;
                                        }
                                        step._balloonStarted = false;
                                        return true;
                                    }

                                    case "imageMove":
                                        return this.doimageMoveCommand(battler, step);

                                    case "imageMoveRelative":
                                        return this.doimageMoveRelativeCommand(battler, step);

                                    case "aimImage": {
                                        // Expected format: aimImage(subject, iconSlot, target, duration)
                                        const args = step.args;
                                        const iconSlot = args[1] || "1";      // Which icon slot to aim
                                        const targetName = args[2] || "target";
                                        const duration = Number(args[3]) || 30; // Duration (in frames) of the tween

                                        // Resolve the target event using your existing function.
                                        const targetEvents = PTBS_Manager.resolveSubjects(battler, targetName);
                                        if (targetEvents.length > 0) {
                                            const targetEvent = targetEvents[0];
                                            const subjectEvent = battler.event();
                                            const sx = subjectEvent.screenX();
                                            const sy = subjectEvent.screenY();
                                            const tx = targetEvent.screenX();
                                            const ty = targetEvent.screenY();
                                            const dx = tx - sx;
                                            const dy = ty - sy;
                                            // Compute the absolute angle from subject to target.
                                            let computedAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                                            // Determine the "idle math angle" for the current direction.
                                            let idleMathAngle = 0;
                                            switch (subjectEvent.direction()) {
                                                case 8: idleMathAngle = -90; break;
                                                case 6: idleMathAngle = 0; break;
                                                case 2: idleMathAngle = 90; break;
                                                case 4: idleMathAngle = 180; break;
                                                default: idleMathAngle = -90; break;
                                            }
                                            // The relative offset (how far off from “straight ahead” the target is)
                                            let relativeAngle = computedAngle - idleMathAngle;
                                            // Now lock in the battler's current facing.
                                            const lockedDir = subjectEvent.direction();
                                            // Save it in the icon data so that even if the battler later turns,
                                            // the tween still returns to the correct idle angle.
                                            const iconData = battler.getIconData(iconSlot);
                                            if (iconData) {
                                                iconData._aimBaseDir = lockedDir;
                                                const baseAngle = defaultAimAngleForDirection(lockedDir);
                                                const targetAngle = baseAngle + relativeAngle;
                                                // Set up the tween.
                                                iconData._aimTween = {
                                                    framesLeft: duration,
 framesTotal: duration,
 startAngle: iconData.angle || baseAngle,
 endAngle: targetAngle
                                                };
                                            }
                                        }
                                        battler._actionSequenceWait = duration;
                                        return true;
                                    }

                                                case "releaseAim": {
                                                    // Expected format: releaseAim(subject, iconSlot, duration)
                                                    const args = step.args;
                                                    const iconSlot = args[1] || "1";
                                                    const duration = Number(args[2]) || 30;
                                                    const subjectEvent = battler.event();
                                                    const iconData = battler.getIconData(iconSlot);
                                                    if (iconData) {
                                                        // Use the stored base direction if available.
                                                        const baseDir = (iconData._aimBaseDir !== undefined)
                                                        ? iconData._aimBaseDir
                                                        : subjectEvent.direction();
                                                        const baseAngle = defaultAimAngleForDirection(baseDir);
                                                        iconData._aimTween = {
                                                            framesLeft: duration,
 framesTotal: duration,
 startAngle: iconData.angle || baseAngle,
 endAngle: baseAngle
                                                        };
                                                    }
                                                    battler._actionSequenceWait = duration;
                                                    return true;
                                                }

                                                case "playAnimation": {
                                                    const animId = step.animId;
                                                    const targetType = (step.targetType || "target").toLowerCase();
                                                    const rotationMode = step.rotationMode || "none";
                                                    const offsetX = step.offsetX || 0;
                                                    const offsetY = step.offsetY || 0;

                                                    let rotationAngle = 0;
                                                    let targets = [];

                                                    // Determine targets based on targetType
                                                    if (targetType === "user") {
                                                        targets = [battler.event()]; // User's event
                                                    } else if (targetType === "target") {
                                                        targets = this.resolveSubjects(battler, "target"); // First target
                                                    } else if (targetType === "all targets") {
                                                        targets = this.resolveSubjects(battler, "all targets"); // All targets
                                                    } else if (targetType === "area") {
                                                        // Get all targets and calculate intermediate tiles
                                                        const allTargetEvents = this.resolveSubjects(battler, "all targets");
                                                        if (allTargetEvents.length > 1) {
                                                            targets = this.calculateAreaTiles(allTargetEvents);
                                                        } else if (allTargetEvents.length === 1) {
                                                            targets = allTargetEvents; // Fallback to single target if only one
                                                        } else {
                                                            targets = []; // No targets, skip
                                                        }
                                                    } else {
                                                        console.warn(`Unknown targetType "${targetType}", defaulting to 'target'`);
                                                        targets = this.resolveSubjects(battler, "target");
                                                    }

                                                    // Calculate rotation based on mode
                                                    if (rotationMode === "direction") {
                                                        rotationAngle = this.getRotationAngle(battler.event().direction());
                                                    } else if (rotationMode === "aim" && targets.length > 0) {
                                                        const targetEvent = targets[0]; // Use first target for aiming
                                                        const userEvent = battler.event();
                                                        const dx = targetEvent.x - userEvent.x;
                                                        const dy = targetEvent.y - userEvent.y;
                                                        rotationAngle = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
                                                    }

                                                    if (!step._animationStarted) {
                                                        for (const ev of targets) {
                                                            this.playAnimationOn(animId, ev, false, rotationAngle, offsetX, offsetY);
                                                        }
                                                        step._animationStarted = true;
                                                        if (step.wait) {
                                                            const anim = $dataAnimations[animId];
                                                            battler._actionSequenceWait = anim.frames ? anim.frames.length * 4 : 30;
                                                        } else {
                                                            battler._actionSequenceWait = 0;
                                                        }
                                                        return false;
                                                    }

                                                    step._animationStarted = false;
                                                    return true;
                                                }


                                                case "projectile":
                                                    return this.fireProjectileThenApplyEffect(battler, step);

                                                case "applyActionEffect": {
                                                    if (!step._effectStarted) {
                                                        const action = step.action; // Game_Action from attemptAction
                                                        const subject = step.subject; // Attacker
                                                        const allTargets = subject._actionSequenceTargets || []; // All potential targets
                                                        const realTargets = allTargets.filter(t => !t._dummyTile); // Filter out dummy tiles

                                                        if (step.args && step.args[0] === "all targets") {
                                                            if (realTargets.length > 0) {
                                                                for (const oneTarget of realTargets) {
                                                                    const battlerObj = oneTarget._actor ?? oneTarget._enemy;
                                                                    if (!battlerObj) continue;

                                                                    // Store the current direction before action effect
                                                                    let originalDirection = oneTarget.event().direction();

                                                                    // Apply base action effect
                                                                    action.apply(battlerObj);
                                                                    const result = battlerObj.result();

                                                                    // Apply directional damage multiplier if there's HP damage
                                                                    if (result.hpDamage > 0) {
                                                                        const direction = oneTarget.getAttackDirection(step.attacker || subject);
                                                                        let multiplier;
                                                                        switch (direction) {
                                                                            case "front":
                                                                                multiplier = paramFrontDamageMultiplier;
                                                                                break;
                                                                            case "side":
                                                                                multiplier = paramSideDamageMultiplier;
                                                                                break;
                                                                            case "back":
                                                                                multiplier = paramBackDamageMultiplier;
                                                                                break;
                                                                            default:
                                                                                multiplier = 1.0; // Fallback
                                                                        }

                                                                        const baseDamage = result.hpDamage;
                                                                        const finalDamage = Math.round(baseDamage * multiplier);
                                                                        const damageAdjustment = finalDamage - baseDamage;



                                                                        // Apply additional damage adjustment
                                                                        if (oneTarget._actor) {
                                                                            oneTarget._actor.gainHp(-damageAdjustment);
                                                                        } else if (oneTarget._enemy) {
                                                                            oneTarget._enemy.gainHp(-damageAdjustment);
                                                                        }

                                                                        // Show damage popup with final damage
                                                                        if (SceneManager._scene && SceneManager._scene.spawnDamagePopup) {
                                                                            SceneManager._scene.spawnDamagePopup(oneTarget, finalDamage);
                                                                        }
                                                                    } else if (result.hpDamage < 0) {
                                                                        // Handle healing (no multiplier)
                                                                        if (SceneManager._scene && SceneManager._scene.spawnDamagePopup) {
                                                                            SceneManager._scene.spawnDamagePopup(oneTarget, result.hpDamage);
                                                                        }
                                                                    }

                                                                    // Check for death and handle it
                                                                    if (oneTarget.currentHP() <= 0) {
                                                                        oneTarget.handleDeath();
                                                                    }

                                                                    // Play animation if specified
                                                                    if (action.item().animationId > 0) {
                                                                        this.playAnimationOn(action.item().animationId, oneTarget.event());
                                                                    }

                                                                    // Trigger gotHit sequence if alive
                                                                    if (oneTarget.currentHP() > 0) {
                                                                        const gotHitSeq = oneTarget.getActionSequence("gotHit");
                                                                        if (gotHitSeq && gotHitSeq.length > 0) {
                                                                            oneTarget._actionSequence = gotHitSeq.slice();
                                                                            oneTarget._actionSequenceIndex = 0;
                                                                            oneTarget._actionSequenceWait = 0;
                                                                            this._state = "actionSequence";
                                                                        }
                                                                    }
                                                                }
                                                                subject._hasAttacked = true;
                                                            }
                                                        } else {
                                                            const t = step.target;
                                                            if (t && !t._dummyTile) {
                                                                const battlerObj = t._actor ?? t._enemy;
                                                                if (battlerObj) {
                                                                    // Store facing before action effect
                                                                    let originalDirection = t.event().direction();

                                                                    // Apply base action effect
                                                                    action.apply(battlerObj);
                                                                    const result = battlerObj.result();

                                                                    // Apply directional damage multiplier if there's HP damage
                                                                    if (result.hpDamage > 0) {
                                                                        const direction = t.getAttackDirection(step.attacker || subject);
                                                                        let multiplier;
                                                                        switch (direction) {
                                                                            case "front":
                                                                                multiplier = paramFrontDamageMultiplier;
                                                                                break;
                                                                            case "side":
                                                                                multiplier = paramSideDamageMultiplier;
                                                                                break;
                                                                            case "back":
                                                                                multiplier = paramBackDamageMultiplier;
                                                                                break;
                                                                            default:
                                                                                multiplier = 1.0; // Fallback
                                                                        }

                                                                        const baseDamage = result.hpDamage;
                                                                        const finalDamage = Math.round(baseDamage * multiplier);
                                                                        const damageAdjustment = finalDamage - baseDamage;



                                                                        // Apply additional damage adjustment
                                                                        if (t._actor) {
                                                                            t._actor.gainHp(-damageAdjustment);
                                                                        } else if (t._enemy) {
                                                                            t._enemy.gainHp(-damageAdjustment);
                                                                        }

                                                                        // Show damage popup with final damage
                                                                        if (SceneManager._scene && SceneManager._scene.spawnDamagePopup) {
                                                                            SceneManager._scene.spawnDamagePopup(t, finalDamage);
                                                                        }
                                                                    } else if (result.hpDamage < 0) {
                                                                        // Handle healing (no multiplier)
                                                                        if (SceneManager._scene && SceneManager._scene.spawnDamagePopup) {
                                                                            SceneManager._scene.spawnDamagePopup(t, result.hpDamage);
                                                                        }
                                                                    }

                                                                    // Check for death and handle it
                                                                    if (t.currentHP() <= 0) {
                                                                        t.handleDeath();
                                                                    }

                                                                    // Play animation if specified
                                                                    if (action.item().animationId > 0) {
                                                                        this.playAnimationOn(action.item().animationId, t.event());
                                                                    }

                                                                    subject._hasAttacked = true;

                                                                    // Restore facing after the action effect
                                                                    t.event().setDirection(originalDirection);

                                                                    // Trigger gotHit sequence if alive
                                                                    if (t.currentHP() > 0) {
                                                                        const gotHitSeq = t.getActionSequence("gotHit");
                                                                        if (gotHitSeq && gotHitSeq.length > 0) {
                                                                            t._actionSequence = gotHitSeq.slice();
                                                                            t._actionSequenceIndex = 0;
                                                                            t._actionSequenceWait = 0;
                                                                            this._state = "actionSequence";
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }

                                                        step._effectStarted = true;
                                                        battler._actionSequenceWait = step.wait || 15;
                                                        return false;
                                                    }
                                                    step._effectStarted = false;
                                                    return true;
                                                }

                                                case "wait": {
                                                    if (!step._waitStarted) {
                                                        step._waitStarted = true;
                                                        battler._actionSequenceWait = step.wait || 0;
                                                        return false;
                                                    }
                                                    step._waitStarted = false;
                                                    return true;
                                                }

                                                default:
                                                    return true;
            }
        }

        static getRotationAngle(direction) {
            let angle;
            switch (direction) {
                case 2: angle = 180; break; // Down
                case 4: angle = 270; break; // Left
                case 6: angle = 90; break;  // Right
                case 8: angle = 0; break;   // Up
                default: angle = 0;
            }
            return angle;
        }

        static fireProjectileThenApplyEffect(battler, step) {
            const subject = step.subject;
            const action = step.action;
            const targetBattlers = subject._actionSequenceTargets || [];

            // 1) If we already created a projectile and are waiting for it:
            //    Check if it finished.
            if (step._projectileCreated) {
                if (step._projectileDone) {
                    // Projectile just landed; move on to next step in sequence
                    return true;
                } else {
                    // Still flying; keep waiting
                    return false;
                }
            }

            // 2) Parse the <PTBS_Projectile> data from the skill/item (or weapon override).
            const itemOrSkill = action._ptbsWeaponOverride || action.item();
            const projData = itemOrSkill ? PTBS_ProjectileManager.parseProjectileData(itemOrSkill.note) : null;

            // If no <PTBS_Projectile> block, just apply effect immediately (no projectile flight).
            if (!projData) {
                this.applyEffectNow(battler, step);
                return true;
            }

            // 3) Identify the tile/battler we’re aiming at.
            //    We'll look at the *first* entry in _actionSequenceTargets.
            //    It might be a dummy "tile" object or a real battler object.
            const firstTarget = targetBattlers[0];
            if (!firstTarget) {
                // If your code never leaves this empty, you can skip this check.
                // But just in case:
                this.applyEffectNow(battler, step);
                return true;
            }

            // 4) Decide the final "targetPos" in map coordinates (tile-based).
            let targetPos;
            if (firstTarget._dummyTile) {
                // The user clicked an empty square, but wants to throw a grenade at (x, y).
                targetPos = { x: firstTarget._x, y: firstTarget._y };
            } else {
                // A real battler is the “first” target
                targetPos = {
                    x: firstTarget.event().x,
 y: firstTarget.event().y
                };
            }

            // 5) Compute our "startPos" in tile coordinates, factoring in any <startOffset> & pixel offset.
            const userEvent = subject.event();
            const startOffset = projData.startOffset || { x: 0, y: 0 };

            const tileW = $gameMap.tileWidth();
            const tileH = $gameMap.tileHeight();

            let startPos = {
                x: userEvent.x + (startOffset.x / tileW),
 y: userEvent.y + (startOffset.y / tileH)
            };

            // If you have any pixel offset from "pixelMove" steps, factor that in:
            if (subject._pixelOffsetX) {
                startPos.x += subject._pixelOffsetX / tileW;
            }
            if (subject._pixelOffsetY) {
                startPos.y += subject._pixelOffsetY / tileH;
            }

            const dx = targetPos.x - startPos.x;
            const dy = targetPos.y - startPos.y;

            const angleRadians = Math.atan2(dy, dx);

            let angleDegrees = Math.atan2(dy, dx) * (180 / Math.PI);

            angleDegrees += projData.angleOffset;

            projData.initialAngle = angleDegrees;

            // 7) Create the projectile & specify a callback for when it lands
            PTBS_ProjectileManager.createProjectile(projData, startPos, targetPos, () => {
                step._projectileDone = true;  // So we can proceed in the action sequence next frame
            });

            // Mark that we’ve created the projectile
            step._projectileCreated = true;
            step._projectileDone = false;

            // Return false => "pause" the action sequence until projectile flight is done
            return false;
        }



        static applyEffectNow(battler, step) {
            // 1) Extract the action & subject
            const action = step.action;     // The Game_Action
            const subject = step.subject;   // The PTBS_Battler using this action

            // 2) Get every target from subject._actionSequenceTargets
            const finalTargets = subject._actionSequenceTargets || [];

            // 3) Filter out dummy tiles (used as click-locations)
            const realTargets = finalTargets.filter(t => !t._dummyTile);

            // 4) Apply the effect to each real target
            for (const oneTarget of realTargets) {
                // Apply skill/item damage or healing
                const battlerObj = oneTarget._actor ?? oneTarget._enemy;
                action.apply(battlerObj);

                // Show popups if HP changed
                const result = battlerObj.result();
                if (SceneManager._scene && SceneManager._scene.spawnDamagePopup) {
                    if (result.hpDamage !== 0) {
                        SceneManager._scene.spawnDamagePopup(oneTarget, result.hpDamage);
                    }
                }

                // If target died, handle removing or replacing event with corpse
                if (oneTarget.currentHP() <= 0) {
                    oneTarget.handleDeath();
                }

                // Make them face the user
                const newDir = PTBS_Manager.directionToFace(oneTarget.event(), subject.event());
                oneTarget.event().setDirection(newDir);

                // If the item/skill has an animation ID
                if (action.item().animationId > 0) {
                    this.playAnimationOn(action.item().animationId, oneTarget.event());
                }

                // If still alive, optionally run "gotHit" sequence
                if (oneTarget.currentHP() > 0) {
                    const gotHitSeq = oneTarget.getActionSequence("gotHit");
                    if (gotHitSeq && gotHitSeq.length > 0) {
                        oneTarget._actionSequence = gotHitSeq.slice();
                        oneTarget._actionSequenceIndex = 0;
                        oneTarget._actionSequenceWait = 0;
                        PTBS_Manager._state = "actionSequence";
                    }
                }
            }

            // 5) Mark subject as having used an action
            subject._hasAttacked = true;

            // 6) Respect any wait time from the step
            battler._actionSequenceWait = step.wait;

            // Return true => we finished
            return true;
        }



        // Move forward/back
        static moveBattlerForward(battler, dir) {
            switch (dir) {
                case 2: battler.event().jump(0, 1);  break;
                case 8: battler.event().jump(0, -1); break;
                case 4: battler.event().jump(-1, 0); break;
                case 6: battler.event().jump(1, 0);  break;
            }
        }
        static moveBattlerBackward(battler, dir) {
            const oldFix = battler.event().isDirectionFixed();
            battler.event().setDirectionFix(true);
            switch (dir) {
                case 2: battler.event().jump(0, -1); break;
                case 8: battler.event().jump(0, 1);  break;
                case 4: battler.event().jump(1, 0);  break;
                case 6: battler.event().jump(-1, 0); break;
            }
            setTimeout(() => {
                battler.event().setDirectionFix(oldFix);
            }, 200);
        }

        // Shake event
        static shakeEvent(event, power = 1) {
            event.jump(0, -power);
            setTimeout(() => event.jump(0, power), 150);
        }

        // balloon command
        static doBalloonCommand(battler, step) {
            if (!step.args || step.args.length < 2) {
                console.error("Balloon command missing args:", step);
                return;
            }
            const subjects = step.args[0];
            const balloonId = Number(step.args[1]) || 1;
            const evs = this.resolveSubjects(battler, subjects);
            for (const ev of evs) {
                if (ev) {
                    $gameTemp.requestBalloon(ev, balloonId);
                }
            }
            battler._actionSequenceWait = step.wait || 30;
        }

        // direction
        static doDirectionCommand(battler, step) {
            const subjects = step.args[0];
            const dirType  = step.args[1];
            const evs = this.resolveSubjects(battler, subjects);
            for (const ev of evs) {
                if (dirType === "behind") {
                    let d = ev.direction();
                    if (d === 2) d = 8;
                    else if (d === 8) d = 2;
                    else if (d === 4) d = 6;
                    else if (d === 6) d = 4;
                    ev.setDirection(d);
                }
                // Additional logic for left/right/home, etc.
            }
            battler._actionSequenceWait = step.wait;
        }

        // se command
        static doSECommand(battler, step) {
            const mode   = step.args[0] || "play";
            const name   = step.args[1] || "";
            const volume = Number(step.args[2]) || 90;
            const pitch  = Number(step.args[3]) || 100;
            const pan    = Number(step.args[4]) || 0;
            if (mode === "play") {
                AudioManager.playSe({name, volume, pitch, pan});
            }
            battler._actionSequenceWait = step.wait;
        }

        // switch command
        static doSwitchCommand(battler, step) {
            const switchId = Number(step.args[0]) || 1;
            const stype    = step.args[1] || "on";
            if (stype === "on") {
                $gameSwitches.setValue(switchId, true);
            } else if (stype === "off") {
                $gameSwitches.setValue(switchId, false);
            } else if (stype === "toggle") {
                const old = $gameSwitches.value(switchId);
                $gameSwitches.setValue(switchId, !old);
            }
            battler._actionSequenceWait = step.wait;
        }

        // resolve "user", "target", "all targets", etc.
        static resolveSubjects(battler, subjectString) {
            if (!battler) return [];

            switch (subjectString.toLowerCase()) {
                case "user":
                    return [battler.event()];

                case "target": {
                    // If the step specifically has "step.target", use that
                    const currentStep = battler._actionSequence &&
                    battler._actionSequence[battler._actionSequenceIndex];
                    if (currentStep && currentStep.target) {
                        return [currentStep.target.event()];
                    }
                    // Otherwise, fallback to first real target in battler._actionSequenceTargets
                    if (battler._actionSequenceTargets && battler._actionSequenceTargets.length > 0) {
                        // In case skill had an AoE, we can pick the first non‐dummy
                        const real = battler._actionSequenceTargets.find(t => !t._dummyTile);
                        if (real) return [real.event()];
                    }
                    return [];
                }

                case "all targets":
                    if (battler._actionSequenceTargets && battler._actionSequenceTargets.length > 0) {
                        return battler._actionSequenceTargets.map(t => t.event());
                    }
                    return [];

                default:
                    // fallback => just return the user event
                    return [battler.event()];
            }
        }

        static calculateAreaTiles(targetEvents) {
            if (targetEvents.length < 2) return targetEvents; // Need at least 2 targets

            const tiles = [];
            const seen = new Set(); // Avoid duplicates

            // Simple approach: Connect consecutive targets with straight lines
            for (let i = 0; i < targetEvents.length - 1; i++) {
                const start = targetEvents[i];
                const end = targetEvents[i + 1];
                const lineTiles = this.getLineTiles(start.x, start.y, end.x, end.y);
                for (const tile of lineTiles) {
                    const key = `${tile.x},${tile.y}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        // Create a dummy event-like object for animation playback
                        const dummyEvent = {
                            x: tile.x,
 y: tile.y,
 screenX: () => $gameMap.adjustX(tile.x) * $gameMap.tileWidth(),
 screenY: () => $gameMap.adjustY(tile.y) * $gameMap.tileHeight(),
 direction: () => 8 // Default direction (up), adjust if needed
                        };
                        tiles.push(dummyEvent);
                    }
                }
            }

            return tiles;
        }

        static getLineTiles(x1, y1, x2, y2) {
            // Bresenham's line algorithm (simplified)
            const tiles = [];
            let dx = Math.abs(x2 - x1);
            let dy = Math.abs(y2 - y1);
            let sx = x1 < x2 ? 1 : -1;
            let sy = y1 < y2 ? 1 : -1;
            let err = dx - dy;

            let x = x1;
            let y = y1;

            while (true) {
                tiles.push({ x, y });
                if (x === x2 && y === y2) break;
                const e2 = 2 * err;
                if (e2 > -dy) {
                    err -= dy;
                    x += sx;
                }
                if (e2 < dx) {
                    err += dx;
                    y += sy;
                }
            }

            return tiles;
        }


        // face-direction helper
        static directionToFace(eventA, eventB) {
            const dx = eventB.x - eventA.x;
            const dy = eventB.y - eventA.y;
            if (Math.abs(dx) > Math.abs(dy)) {
                return dx > 0 ? 6 : 4;
            } else {
                return dy > 0 ? 2 : 8;
            }
        }

        // Turn order
        static nextTurn() {
            this._currentTurnIndex++;
            if (this._currentTurnIndex >= this._turnOrder.length) {
                this._currentTurnIndex = 0;
            }
            this.selectNextValidBattler();
        }

        static selectNextValidBattler() {
            let tries = 0;
            while (tries < this._turnOrder.length) {
                const next = this._turnOrder[this._currentTurnIndex];
                if (next && next.currentHP() > 0) {
                    this.selectBattler(next);
                    return;
                } else {
                    this._currentTurnIndex++;
                    if (this._currentTurnIndex >= this._turnOrder.length) {
                        this._currentTurnIndex = 0;
                    }
                }
                tries++;
            }
            console.warn("No living battlers found. PTBS end?");
        }

        static selectBattler(battler) {
            if (!battler || !battler.event()) {
                console.warn("Invalid battler in selectBattler:", battler);
                this.selectNextValidBattler();
                return;
            }

            // Clear any existing AI flags
            if (this._processingAI) {
                clearTimeout(this._aiDecisionTimeout);
                this._processingAI = false;
            }

            this._selectedBattler = battler;

            // Highlight the selected battler...
            const key = [$gameMap.mapId(), battler.event().eventId(), 'A'];
            $gameSelfSwitches.setValue(key, true);

            battler.startTurn();

            // --- Here is where we skip AI if a PTBS autorun event is running ---
            if (PTBS_AI.isControlledByAI(battler)) {
                if (this._activeAutorunPTBSEvent) {
                    // Do NOT set up the AI. Just return; the turn won't proceed until event finishes.
                    return;
                }

                // Otherwise, proceed as normal:
                this._processingAI = true;
                this._aiDecisionTimeout = setTimeout(() => {
                    if (this._processingAI) {
                        PTBS_AI.performAction(battler);
                        this._processingAI = false;
                    }
                }, 1000);
            } else {
                // For player-controlled battlers, set the state to "command"
                this._state = "command";
            }

            // Refresh turn order UI, center camera, etc.
            if (SceneManager._scene && SceneManager._scene._ptbsTurnOrderWindow) {
                SceneManager._scene._ptbsTurnOrderWindow.refresh();
            }

            // Center camera on active battler
            if (SceneManager._scene && SceneManager._scene.centerCameraOnBattler) {
                SceneManager._scene.centerCameraOnBattler(battler);
            }

            // IMPORTANT: Always set cursor to the active battler's position
            // This ensures cursor is properly positioned at turn start
            if (SceneManager._scene && SceneManager._scene.cursorSet) {
                SceneManager._scene.cursorSet(battler.event().x, battler.event().y);
                SceneManager._scene._cursorAlreadyPositioned = true; // Flag to prevent reset
            }

            // NEW: Return to auto camera control when selecting a new battler
            this._cameraControlMode = "auto";
            this._cameraTransitionData = null;
        }

        static currentBattler() {
            return this._turnOrder[this._currentTurnIndex];
        }
        static selectedBattler() {
            return this._selectedBattler;
        }

        static startMoveSelection() {
            this._state = "move";
        }
        static startAttackSelection() {
            this._state = "attack";

            // Clear any existing attack cache
            if (SceneManager._scene && SceneManager._scene instanceof Scene_Map) {
                SceneManager._scene.invalidateAttackTilesCache();
            }
        }
        static startSkillSelection(action) {
            this._skillAction = action;
            this._state = "skill";
        }
        // [ITEM STUFF]
        static startItemSelection(action) {
            this._itemAction = action;
            this._state = "item";
        }

        static isBattlerEvent(event) {
            if (!event || !event.event()) return false;
            return /<PTBS_(Actor|Enemy):/i.test(event.event().note);
        }


        static endCurrentTurn() {
            // Prevent re-entry
            if (this._processingTurnEnd) return;
            this._processingTurnEnd = true;

            const battler = this._selectedBattler;
            if (battler) {
                // Clears Command Mode Active
                battler._commandModeActive = false;
                // Get all events on the battler's tile
                const eventsHere = $gameMap.eventsXy(battler.event().x, battler.event().y);
                // Use your existing trigger-check (which should check for <PTBS EVENT> in the note)
                const triggerableEvent = eventsHere.find(event => event.checkPTBSEventTrigger());

                if (triggerableEvent) {
                    // Determine if this event is a battler event (has a battler tag) or not.
                    const isBattlerEvt = PTBS_Manager.isBattlerEvent(triggerableEvent);

                    // Hide the PTBS windows so the event can run unobstructed.
                    if (SceneManager._scene) {
                        SceneManager._scene.hidePTBSWindows();
                    }

                    // Start the event.
                    triggerableEvent.start();

                    // Set up an interval to check when the event's interpreter is finished.
                    if (!triggerableEvent._ptbsEventCheckInterval) {
                        let checkCount = 0;
                        triggerableEvent._ptbsEventCheckInterval = setInterval(() => {
                            if (!triggerableEvent._interpreter || !triggerableEvent._interpreter.isRunning()) {
                                clearInterval(triggerableEvent._ptbsEventCheckInterval);
                                triggerableEvent._ptbsEventCheckInterval = null;

                                // For non-battler events, force the event to stop re-triggering.
                                if (!isBattlerEvt) {
                                    // Set self switch A ON so that the event is considered erased.
                                    $gameSelfSwitches.setValue([$gameMap.mapId(), triggerableEvent.eventId(), 'A'], true);
                                }

                                // Reset PTBS state and move on to the next turn.
                                this._state = "idle";
                                // Removed nextTurn() here, will be called right after
                                if (SceneManager._scene) {
                                    SceneManager._scene.showPTBSWindows();
                                }
                            } else if (checkCount > 300) { // 30 sec timeout
                                clearInterval(this._ptbsEventCheckInterval);
                                this._ptbsEventCheckInterval = null;
                            }
                        }, 100);
                    }
                } else {
                    // If no event was triggered on this tile, simply move on.
                    this._state = "idle";
                    // Removed nextTurn() here, will be called right after
                }
            } else {
                // If there is no selected battler (which ideally shouldn't happen), just advance.
                this._state = "idle";
                // Removed nextTurn() here
            }

            // Reset all caches in Scene_Map for performance
            if (SceneManager._scene && SceneManager._scene instanceof Scene_Map) {
                // Clear move tiles cache
                SceneManager._scene.invalidateMoveTilesCache();
                // Clear path cache
                SceneManager._scene._pathCache = null;
                // Clear attack tiles cache
                SceneManager._scene.invalidateAttackTilesCache();
                // Reset cursor move flag
                SceneManager._scene._cursorMoved = false;
                // Ensure we reset the mouse position tracking
                SceneManager._scene._lastMouseUpdateTime = 0;
                // Clear any path preview timer
                if (SceneManager._scene._pathPreviewTimer) {
                    clearTimeout(SceneManager._scene._pathPreviewTimer);
                    SceneManager._scene._pathPreviewTimer = null;
                }
                // Reset mouse movement tracking
                TouchInput._mouseMovedTime = 0;
            }

            // Reset win condition check flag for next turn
            this._winConditionCheckedThisTurn = false;

            // Call nextTurn() after all conditions are met
            this.nextTurn();
            this._processingTurnEnd = false;
        }

        applyStateTurnEndEffects() {
            if (this._actor) {
                // The built-in method that applies poison damage, regen, updates state turns, etc.
                this._actor.onTurnEnd();
                this._actor.result();  // Clear any leftover results as needed
            } else if (this._enemy) {
                this._enemy.onTurnEnd();
                this._enemy.result();
            }
        }

        // BFS for move
        static attemptMoveTo(x, y) {
            if (!this._selectedBattler) return;
            const b = this._selectedBattler;
            const startX = b.event().x;
            const startY = b.event().y;

            const moveQueue = this.buildMoveQueue(startX, startY, x, y);
            const movementCost = moveQueue.length;

            if (movementCost > b._remainingMovePoints) return;

            // Set cursor to destination for visual clarity
            if (SceneManager._scene && SceneManager._scene.cursorSet) {
                SceneManager._scene.cursorSet(x, y);
            }

            const eventsAtDest = $gameMap.eventsXy(x, y);
            const ptbsEvent = eventsAtDest.find(event =>
            event.isTriggerIn([2]) && eventHasPTBSEventTag(event) && !event._erased
            );

            if (ptbsEvent) {
                b._moveQueue = moveQueue;
                b._remainingMovePoints -= movementCost;
                this._state = "walk";

                const checkMovement = setInterval(() => {
                    if (!b._moveQueue || b._moveQueue.length === 0) {
                        clearInterval(checkMovement);
                        ptbsEvent.start();
                        const checkEvent = setInterval(() => {
                            if (!ptbsEvent._interpreter || !ptbsEvent._interpreter.isRunning()) {
                                clearInterval(checkEvent);
                                this._eventCollisionResolved = true;
                                this._state = "command";
                                if (SceneManager._scene) {
                                    SceneManager._scene.showPTBSWindows();
                                    SceneManager._scene._ptbsCommandWindow.open();
                                    SceneManager._scene._ptbsCommandWindow.activate();
                                }
                            }
                        }, 100);
                    }
                }, 100);
            } else {
                b._moveQueue = moveQueue;
                b._remainingMovePoints -= movementCost;
                this._state = "walk";
            }
        }

        static buildMoveQueue(cx, cy, tx, ty) {
            const battler = this.selectedBattler();
            if (!battler) return [];

            const width = $gameMap.width();
            const height = $gameMap.height();
            const visited = new Set(); // Explicitly a Set
            const parent = new Map();
            const queue = [];
            queue.push({ x: cx, y: cy });
            visited.add(cy * width + cx);

            const dirs = [
                { dx: 0, dy: -1, dir: 8 },
 { dx: 1, dy: 0, dir: 6 },
 { dx: 0, dy: 1, dir: 2 },
 { dx: -1, dy: 0, dir: 4 }
            ];

            let found = false;
            while (queue.length > 0) {
                const c = queue.shift();
                if (c.x === tx && c.y === ty) {
                    found = true;
                    break;
                }
                for (const d of dirs) {
                    const nx = c.x + d.dx;
                    const ny = c.y + d.dy;
                    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                    const key = ny * width + nx;
                    if (!visited.has(key) && this.isTileInMoveScope(nx, ny, battler, visited)) {
                        visited.add(key);
                        parent.set(key, { px: c.x, py: c.y, dir: d.dir });
                        queue.push({ x: nx, y: ny });
                    }
                }
            }

            if (!found) return [];

            const path = [];
            let ck = ty * width + tx;
            while (ck !== cy * width + cx) {
                const par = parent.get(ck);
                if (!par) return [];
                path.push(par.dir);
                ck = par.py * width + par.px;
            }
            path.reverse();
            return path;
        }


        static computeMovableTiles(battler) {
            if (!battler || !battler.event()) return [];

            const movePoints = battler._remainingMovePoints;
            const startX = battler.event().x;
            const startY = battler.event().y;
            const result = [];

            const visited = new Set();
            const queue = [{ x: startX, y: startY, cost: 0 }];
            visited.add(startY * $gameMap.width() + startX);

            while (queue.length > 0) {
                const current = queue.shift();

                if (current.x !== startX || current.y !== startY) {
                    result.push({ x: current.x, y: current.y });
                }

                if (current.cost >= movePoints) continue;

                const directions = [
                    { dx: 0, dy: -1 }, // up
 { dx: 1, dy: 0 },  // right
 { dx: 0, dy: 1 },  // down
 { dx: -1, dy: 0 }  // left
                ];

                for (const dir of directions) {
                    const nextX = current.x + dir.dx;
                    const nextY = current.y + dir.dy;
                    const key = nextY * $gameMap.width() + nextX;

                    if (nextX < 0 || nextY < 0 || nextX >= $gameMap.width() || nextY >= $gameMap.height()) {
                        continue;
                    }

                    if (visited.has(key)) continue;

                    if (this.isTileInMoveScope(nextX, nextY, battler, visited)) {
                        queue.push({ x: nextX, y: nextY, cost: current.cost + 1 });
                        visited.add(key);
                    }
                }
            }

            return result;
        }

        // Replace old getMovableTiles (if it still exists) with a redirect
        static getMovableTiles(battler) {
            return battler ? battler.getMovableTiles() : [];
        }

        // Attack tiles
        static getAttackableTiles(battler) {
            const scope = battler.getAttackScope();
            const bx = battler.event().x;
            const by = battler.event().y;
            const tiles = [];

            if (scope.shape === "circle") {
                for (let y = 0; y < this._grid.length; y++) {
                    for (let x = 0; x < this._grid[y].length; x++) {
                        const dx = Math.abs(x - bx);
                        const dy = Math.abs(y - by);
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist <= scope.max && dist >= scope.min) {
                            tiles.push({ x, y });
                        }
                    }
                }
            } else if (scope.shape === "line") {
                const max = scope.max || 1;
                const min = scope.min || 0;
                for (let i = min; i <= max; i++) {
                    if (i === 0) {
                        tiles.push({ x: bx, y: by }); // Include center if min is 0
                        continue;
                    }
                    // Up
                    if (by - i >= 0) tiles.push({ x: bx, y: by - i });
                    // Down
                    if (by + i < this._grid.length) tiles.push({ x: bx, y: by + i });
                    // Left
                    if (bx - i >= 0) tiles.push({ x: bx - i, y: by });
                    // Right
                    if (bx + i < this._grid[0].length) tiles.push({ x: bx + i, y: by });
                }
            }
            return tiles;
        }

        // Skill tiles
        static getSkillableTiles(battler, skill) {
            const scopeData = this.parseScopeFromSkill(skill);
            const bx = battler.event().x;
            const by = battler.event().y;
            const shape = scopeData.shape;
            const maxRange = scopeData.max;
            const minRange = scopeData.min;
            const tiles = [];

            if (shape === "circle") {
                for (let yy = 0; yy < this._grid.length; yy++) {
                    for (let xx = 0; xx < this._grid[yy].length; xx++) {
                        const dx = Math.abs(xx - bx);
                        const dy = Math.abs(yy - by);
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist <= maxRange && dist >= minRange) {
                            tiles.push({ x: xx, y: yy });
                        }
                    }
                }
            } else if (shape === "line") {
                // Cross pattern in all 4 directions
                for (let i = minRange; i <= maxRange; i++) {
                    if (i === 0) {
                        tiles.push({ x: bx, y: by }); // Include center if minRange is 0
                        continue;
                    }
                    // Up
                    if (by - i >= 0) tiles.push({ x: bx, y: by - i });
                    // Down
                    if (by + i < this._grid.length) tiles.push({ x: bx, y: by + i });
                    // Left
                    if (bx - i >= 0) tiles.push({ x: bx - i, y: by });
                    // Right
                    if (bx + i < this._grid[0].length) tiles.push({ x: bx + i, y: by });
                }
            }
            return tiles;
        }

        static parseScopeFromSkill(skill) {
            const defaults = { shape: 'circle', max: 3, min: 0 }; // Existing defaults
            if (!skill || !skill.note) return defaults;
            const blockMatch = skill.note.match(/<PTBS>[\s\S]*?scope\s*:\s*(\w+)\s*\(([^)]*)\)[\s\S]*?<\/PTBS>/i);
            if (!blockMatch) return defaults;
            const shape = blockMatch[1].toLowerCase();
            const params = blockMatch[2].split(',').map(n => parseInt(n.trim()));
            return {
                shape: shape,
                max: params[0] ?? defaults.max,
                min: params[1] ?? defaults.min
            };
        }

        // [ITEM STUFF] parseScopeFromItem
        static parseScopeFromItem(item) {
            const forcedDefaults = { shape: 'circle', max: 1, min: 0 };
            if (!item || !item.note) return forcedDefaults;
            const blockMatch = item.note.match(/<PTBS>[\s\S]*?scope\s*:\s*(\w+)\s*\(([^)]*)\)[\s\S]*?<\/PTBS>/i);
            if (!blockMatch) return forcedDefaults;
            const shape = blockMatch[1].toLowerCase();
            const params = blockMatch[2].split(',').map(n => parseInt(n.trim()));
            return {
                shape: shape,
                max: params[0] ?? forcedDefaults.max,
                min: params[1] ?? forcedDefaults.min
            };
        }

        // [ITEM STUFF] If you want scope_select from item
        static getScopeSelectFromItem(item) {
            if (!item || !item.note) return null;
            const match = item.note.match(/<PTBS>[\s\S]*?scope_select\s*:\s*(\w+)[\s\S]*?<\/PTBS>/i);
            return match ? match[1].toLowerCase() : null;
        }

        // [ITEM STUFF] itemable tiles
        static getItemableTiles(battler, item) {
            const scopeData = this.parseScopeFromItem(item);
            const bx = battler.event().x;
            const by = battler.event().y;
            const shape = scopeData.shape;
            const maxRange = scopeData.max;
            const minRange = scopeData.min;
            const tiles = [];

            if (shape === "circle") {
                for (let yy = 0; yy < this._grid.length; yy++) {
                    for (let xx = 0; xx < this._grid[yy].length; xx++) {
                        const dx = Math.abs(xx - bx);
                        const dy = Math.abs(yy - by);
                        const dist = Math.abs(dx) + Math.abs(dy);
                        if (dist <= maxRange && dist >= minRange) {
                            tiles.push({ x: xx, y: yy });
                        }
                    }
                }
            } else if (shape === "line") {
                // Cross pattern in all 4 directions
                for (let i = minRange; i <= maxRange; i++) {
                    if (i === 0) {
                        tiles.push({ x: bx, y: by }); // Include center if minRange is 0
                        continue;
                    }
                    // Up
                    if (by - i >= 0) tiles.push({ x: bx, y: by - i });
                    // Down
                    if (by + i < this._grid.length) tiles.push({ x: bx, y: by + i });
                    // Left
                    if (bx - i >= 0) tiles.push({ x: bx - i, y: by });
                    // Right
                    if (bx + i < this._grid[0].length) tiles.push({ x: bx + i, y: by });
                }
            }
            return tiles;
        }

        // AOE
        // AOE from notes (used by both skills & items in attemptAction)
        static parseAOEFromNotes(skillOrItem) {
            // Default to a single-target effect (circle with radius 0) if no AoE is specified
            const forcedDefaults = {
                shape: 'circle',
                radius: 0,
                minRadius: 0,
                enabled: false
            };

            // Return defaults if no skill/item or no note exists
            if (!skillOrItem || !skillOrItem.note) {
                return forcedDefaults;
            }

            // Match the AoE tag within the <PTBS> block
            const match = skillOrItem.note.match(/<PTBS>[\s\S]*?aoe\s*:\s*(\w+)\s*\(([^)]*)\)[\s\S]*?<\/PTBS>/i);
            if (!match) {
                // No AoE tag found, return defaults
                return forcedDefaults;
            }

            // Extract shape and parameters
            const shape = match[1].toLowerCase();
            const params = match[2].split(',').map(n => parseInt(n.trim()));

            // Return parsed AoE data
            return {
                shape: shape,                    // "circle", "line", etc.
                radius: params[0] ?? forcedDefaults.radius,     // Max radius or length
                minRadius: params[1] ?? forcedDefaults.minRadius, // Min radius or length
                enabled: true                    // AoE is enabled since the tag exists
            };
        }

        static getAOEPattern(radius, minRadius) {
            // Ensure _aoePatternCache is defined:
            if (!this._aoePatternCache) {
                this._aoePatternCache = new Map();
            }
            const key = `${radius}_${minRadius}`;
            if (this._aoePatternCache.has(key)) {
                return this._aoePatternCache.get(key);
            }
            const pattern = [];
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const dist = Math.abs(dx) + Math.abs(dy);
                    if (dist <= radius && dist >= minRadius) {
                        pattern.push({ dx, dy });
                    }
                }
            }
            this._aoePatternCache.set(key, pattern);
            return pattern;
        }

        static getAOERange(skill, centerX, centerY) {
            const aoeData = this.parseAOEFromNotes(skill);
            if (!aoeData.enabled) return [{ x: centerX, y: centerY }];

            const battler = PTBS_Manager.selectedBattler();
            const bx = battler ? battler.event().x : centerX; // Fallback to center if no battler
            const by = battler ? battler.event().y : centerY;
            const tiles = [];
            const mapW = $gameMap.width();
            const mapH = $gameMap.height();

            if (aoeData.shape === "circle") {
                const pattern = this.getAOEPattern(aoeData.radius, aoeData.minRadius);
                for (const { dx, dy } of pattern) {
                    const x = centerX + dx;
                    const y = centerY + dy;
                    if (x >= 0 && x < mapW && y >= 0 && y < mapH) {
                        tiles.push({ x, y });
                    }
                }
            } else if (aoeData.shape === "line") {
                const max = aoeData.radius;
                const min = aoeData.minRadius;
                // Calculate direction from battler to selected tile
                const dx = centerX - bx;
                const dy = centerY - by;
                let direction;

                // Determine primary direction (up, down, left, right)
                if (Math.abs(dx) > Math.abs(dy)) {
                    direction = dx > 0 ? 6 : 4; // Right (6) or Left (4)
                } else {
                    direction = dy > 0 ? 2 : 8; // Down (2) or Up (8)
                }

                // Generate line in the calculated direction
                switch (direction) {
                    case 8: // Up
                        for (let i = min; i <= max; i++) {
                            const y = centerY - i;
                            if (y >= 0) tiles.push({ x: centerX, y });
                        }
                        break;
                    case 2: // Down
                        for (let i = min; i <= max; i++) {
                            const y = centerY + i;
                            if (y < mapH) tiles.push({ x: centerX, y });
                        }
                        break;
                    case 4: // Left
                        for (let i = min; i <= max; i++) {
                            const x = centerX - i;
                            if (x >= 0) tiles.push({ x, y: centerY });
                        }
                        break;
                    case 6: // Right
                        for (let i = min; i <= max; i++) {
                            const x = centerX + i;
                            if (x < mapW) tiles.push({ x, y: centerY });
                        }
                        break;
                }
                // Include the center tile if minRadius is 0
                if (min === 0 && !tiles.some(t => t.x === centerX && t.y === centerY)) {
                    tiles.push({ x: centerX, y: centerY });
                }
            }
            return tiles;
        }

        static getTargetsInAOE(centerX, centerY, skill) {
            const aoeTiles = this.getAOERange(skill, centerX, centerY);
            const targets = [];

            for (const tile of aoeTiles) {
                const battler = this.battlerAt(tile.x, tile.y);
                if (battler && battler.currentHP() > 0) {
                    targets.push(battler);
                }
            }

            return targets;
        }

        /**
         * readAPConsumption(skillOrItem)
         * ------------------------------
         * Looks in <PTBS> note for "ap_consumption: N".
         * Returns the numeric cost, or 1 if not found.
         */
        static readAPConsumption(skillOrItem) {
            if (!skillOrItem || !skillOrItem.note) return 1;

            const blockMatch = skillOrItem.note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
            if (!blockMatch) return 1;

            const inner = blockMatch[1];
            const match = inner.match(/ap_consumption\s*:\s*([+-]?\d+)/i);
            if (match) {
                return Number(match[1]) || 1;
            }
            return 1;
        }

        // -----------------------------------------------------------------------------
        // PTBS_Manager.attemptAction
        // -----------------------------------------------------------------------------

        static attemptAction(battler, action, x, y) {
            // 1) Store the battler's starting position for return moves
            battler._homeTileX = battler.event().x;
            battler._homeTileY = battler.event().y;
            battler._homeDirection = battler.event().direction(); // Add this line

            // 2) Extract the skill/item from the Game_Action
            const skillOrItem = action.item();

            // Clear any AP cost previews
            if (SceneManager._scene) {
                SceneManager._scene._ptbsStatusWindow.setPreviewAPCost(0);
                SceneManager._scene.hideOverheadAPCost();
            }

            // 3) Check and deduct both AP and MP costs
            const apCost = this.readAPConsumption(skillOrItem);
            if (battler._actionPoints < apCost) {
                return;
            }

            // Check MP cost for skills
            if (skillOrItem.mpCost > 0 && battler._actor) {
                if (battler._actor.mp < skillOrItem.mpCost) {
                    return;
                }
                battler._actor.gainMp(-skillOrItem.mpCost);
            }

            battler._actionPoints -= apCost;

            // 4) Create "dummyTile" for AoE logic
            const dummyTile = {
                _dummyTile: true,
                _x: x,
                _y: y,
                event() { return null; },
                currentHP() { return 999; }
            };

            // 5) Determine AoE targets
            const aoeTargets = this.getTargetsInAOE(x, y, skillOrItem);
            const finalTargets = [dummyTile, ...aoeTargets];

            // 6) Face first real target if it exists
            const firstRealTarget = aoeTargets[0] || null;

            if (firstRealTarget) {
                if (!(action.isItem() && firstRealTarget.event().eventId() === battler.event().eventId())) {
                    const faceDir = this.directionToFace(battler.event(), firstRealTarget.event());
                    battler.event().setDirection(faceDir);
                }
            }

            // 7) Save targets for action sequence steps
            battler._actionSequenceTargets = finalTargets;

            // 8) Check for weapon override if Attack (ID=1)
            let skillSequences = null;
            if (skillOrItem.id === 1 && battler._actor) {
                const w = battler._actor.weapons()[0];
                if (w) {
                    const weaponSeq = parseSkillBlock(w);
                    if (weaponSeq && weaponSeq.execute && weaponSeq.execute.length > 0) {
                        skillSequences = weaponSeq;
                        action._ptbsWeaponOverride = w;
                    }
                }
            }

            // 9) Otherwise parse the skill/item note
            if (!skillSequences) {
                skillSequences = parseSkillBlock(skillOrItem);
            }

            // Show skill popup if it's not a basic attack
            if (skillOrItem.id !== 1) {
                if (SceneManager._scene && SceneManager._scene.spawnSkillPopup) {
                    SceneManager._scene.spawnSkillPopup(battler, action);
                }
            }

            // 10) Build combined sequence array
            let finalSequence = [];
            if (skillSequences) {
                if (skillSequences.prepare)  finalSequence.push(...skillSequences.prepare);
                if (skillSequences.movement) finalSequence.push(...skillSequences.movement);
                if (skillSequences.execute)  finalSequence.push(...skillSequences.execute);

                // Add return sequence or fallback
                if (!skillSequences.return || skillSequences.return.length === 0) {
                    finalSequence.push({
                        type: "pixelMove",
                        args: ["user", "home", "30", "0", "map"],
                        wait: 0
                    });
                } else {
                    finalSequence.push(...skillSequences.return);
                }

                if (skillSequences.finish)   finalSequence.push(...skillSequences.finish);
            }

            // 11) Fallback sequence if needed
            if (finalSequence.length <= 0) {
                const animId = skillOrItem.animationId || 1;
                finalSequence = [
                    {
                        type: "playAnimation",
                        animId,
                        target: firstRealTarget,
                        wait: 0
                    },
                    {
                        type: "shake",
                        subjectStr: "target",
                        power: 1,
                        speed: 8,
                        duration: 20,
                        wait: 0
                    },
                    {
                        type: "applyActionEffect",
                        action,
                        subject: battler,
                        target: firstRealTarget,
                        wait: 0
                    },
                    {
                        type: "pixelMove",
                        args: ["user", "home", "30", "0", "map"],
                        wait: 0
                    }
                ];
                // Add this after returning to home position:
                if (battler._homeDirection) {
                    finalSequence.push({
                        type: "direction",
                        args: ["user", this.numericDirectionToString(battler._homeDirection)],
                                       wait: 0
                    });
                }
            }

            // 12) Set references in steps and store attacker for directional damage
            const realTargets = aoeTargets.filter(t => !t._dummyTile);
            const singleTarget = (realTargets.length === 1) ? realTargets[0] : null;

            for (const step of finalSequence) {
                if (["applyActionEffect", "pixelShake", "playAnimation",
                    "projectile", "jump", "moveRelative"].includes(step.type)) {
                    step.subject = battler;
                step.action = action;
                if (singleTarget) step.target = singleTarget;
                // Store attacker for directional damage calculation later
                step.attacker = battler; // Added for directional damage
                    }
            }

            // 13) Assign sequence and start
            battler._actionSequence = finalSequence;
            battler._actionSequenceIndex = 0;
            battler._actionSequenceWait = 0;
            this._state = "actionSequence";

            if (battler.currentHP() <= 0) {
                battler._actionSequence = null;
                this.endCurrentTurn();
            }

            // 14) Clear UI elements
            if (SceneManager._scene) {
                if (SceneManager._scene.refreshPTBSAttackGrid) SceneManager._scene.refreshPTBSAttackGrid();
                if (SceneManager._scene.refreshPTBSSkillGrid) SceneManager._scene.refreshPTBSSkillGrid();
                if (SceneManager._scene.refreshPTBSItemGrid) SceneManager._scene.refreshPTBSItemGrid();
            }
        }

        static calculateSkillDamage(user, target, skill) {
            const a = user._actor || user._enemy;
            const b = target._actor || target._enemy;
            const v = $gameVariables._data;
            return Math.max(eval(skill.damage.formula), 0); // Default RPG Maker damage formula
        }

        static battlerAt(x,y) {
            return this._battlers.find(b=>b.currentHP()>0 && b.event().x===x && b.event().y===y);
        }

        static buildSequenceWithContext(rawSteps, action, subject, finalTargets) {
            // Find the first real battler in the finalTargets array (ignoring dummyTile)
            const firstRealTarget = finalTargets.find(t => !t._dummyTile) || null;

            const finalSteps = [];
            for (const step of rawSteps) {
                // clone the step
                const newStep = { ...step };

                if (newStep.type === "applyActionEffect") {
                    // applyActionEffect might be single or all‐targets
                    newStep.action  = action;
                    newStep.subject = subject;

                    // Only set single “target” if the user wrote e.g. `applyActionEffect,`
                    // in which case it’s probably single-target
                    // If they wrote “applyActionEffect(all targets)”, you might skip
                    // so that doActionSequenceStep sees step.args[0] === "all targets"
                    if (!newStep.args || newStep.args[0] !== "all targets") {
                        newStep.target = firstRealTarget;
                    }
                }
                else if (["pixelMove","jump","moveRelative","moveForward","moveBackward","shakeTarget","playAnimation"].includes(newStep.type)) {
                    // these typically want a single real “target”
                    if (!newStep.target) {
                        newStep.target = firstRealTarget;
                    }
                    // also store references
                    newStep.action  = action;
                    newStep.subject = subject;

                    // If it’s moveForward or moveBackward, set “dir” from user’s current facing
                    if (newStep.type === "moveForward" || newStep.type === "moveBackward") {
                        newStep.dir = subject.event().direction();
                    }
                }
                else if (newStep.type === "projectile") {
                    // This is typically the step that does “projectile(), applyActionEffect”
                    // to the entire AoE
                    newStep.action  = action;
                    newStep.subject = subject;
                }

                finalSteps.push(newStep);
            }
            return finalSteps;
        }


        static playAnimationOn(animationId, event, mirror = false, rotation = 0, offsetX = 0, offsetY = 0) {
            if (!event || animationId <= 0) return;

            const animation = $dataAnimations[animationId];
            if (!animation) return;

            const direction = event.direction();
            const transformedOffsets = this.transformOffsetsByDirection(offsetX, offsetY, direction);
            const finalOffsetX = transformedOffsets.x;
            const finalOffsetY = transformedOffsets.y;

            const wrapperSprite = new Sprite();
            wrapperSprite.x = event.screenX() + finalOffsetX;
            wrapperSprite.y = event.screenY() + finalOffsetY;
            wrapperSprite.anchor.x = 0.5;
            wrapperSprite.anchor.y = 0.5;
            wrapperSprite.rotation = (rotation * Math.PI) / 180;

            const scene = SceneManager._scene;
            const spriteset = scene._spriteset;

            let animationSprite;

            if (animation.effectName) {
                // Effekseer (MZ-style) animation
                animationSprite = new Sprite_Animation();
                animationSprite.setup([wrapperSprite], animation, mirror, 0);
                animationSprite._rotationAngle = rotation;
                spriteset._effectsContainer.addChild(animationSprite);

                const originalOnEnd = animationSprite.onEnd;
                animationSprite.onEnd = function() {
                    originalOnEnd.call(this);
                    if (wrapperSprite.parent) {
                        wrapperSprite.parent.removeChild(wrapperSprite);
                    }
                    if (animationSprite.parent) {
                        animationSprite.parent.removeChild(animationSprite);
                    }
                };
            } else {
                // MV-style animation
                animationSprite = new Sprite_AnimationMV();
                animationSprite.setup([wrapperSprite], animation, mirror, 0);
                spriteset._tilemap.addChild(animationSprite);

                const originalUpdate = animationSprite.update;
                animationSprite.update = function() {
                    originalUpdate.call(this);
                    if (this._duration <= 0) {
                        if (wrapperSprite.parent) {
                            wrapperSprite.parent.removeChild(wrapperSprite);
                        }
                        if (this.parent) {
                            this.parent.removeChild(this);
                        }
                    }
                };
            }

            scene.addChild(wrapperSprite);
        }

        static faceDirection(dir) {
            if(!this._selectedBattler) return;
            this._selectedBattler.event().setDirection(dir);
            this.endCurrentTurn();
        }
    }

    class PTBS_WinManager {
        static initialize() {
            // Default win condition is "Defeat All Enemies"
            this._conditions = [
                { type: "defeatEnemies" }
            ];
        }

        // Replace the current conditions completely
        static setConditions(conditions) {
            this._conditions = conditions.map(cond => {
                if (cond.type === 'switch') {
                    return {
                        ...cond,
                        switchState: cond.switchState === true || cond.switchState === 'true'
                    };
                }
                return cond;
            });
            this._lastUpdate = Date.now();
        }

        // Add one condition (so you can add them mid-battle)
        static addCondition(condition) {
            this._conditions.push(condition);
        }

        // Remove all conditions
        static clearConditions() {
            this._conditions = [];
        }

        // Call this every update – if any condition is met, return true
        static checkWinConditions() {
            if (!this._conditions || !Array.isArray(this._conditions)) {
                return false;
            }


            for (const cond of this._conditions) {
                if (!cond || typeof cond !== 'object') {
                    continue;
                }

                if (cond.type === "defeatEnemies") {
                    // First, get the player's faction - we'll consider the first actor's faction as the "player side"
                    const playerBattlers = PTBS_Manager._battlers.filter(b => b._actor);
                    if (!playerBattlers.length) {
                        continue;
                    }

                    const playerFaction = (playerBattlers[0]._faction || "neutral").toLowerCase();

                    // Find all battlers of opposing factions
                    const enemyBattlers = PTBS_Manager._battlers.filter(b => {
                        const battlerFaction = (b._faction || "neutral").toLowerCase();
                        return battlerFaction !== playerFaction;
                    });

                    if (enemyBattlers.length > 0) {
                        const allDead = enemyBattlers.every(b => b.currentHP() <= 0);

                        if (allDead) return true;
                    }
                    continue;
                }

                else if (cond.type === "switch") {
                    const switchId = cond.switchId;
                    if (!switchId) {
                        continue;
                    }

                    // Ensure we're comparing booleans
                    const desiredState = Boolean(cond.switchState);
                    const currentValue = Boolean($gameSwitches.value(switchId));

                    if (currentValue === desiredState) {
                        return true;
                    } else {

                    }
                }

                else if (cond.type === "variable") {
                    const varId = cond.variableId;
                    const targetValue = cond.value;
                    const operator = cond.operator || "==";
                    const currentValue = $gameVariables.value(varId);

                    if ((operator === "==" && currentValue === targetValue) ||
                        (operator === ">=" && currentValue >= targetValue) ||
                        (operator === "<=" && currentValue <= targetValue)) {
                        return true;
                        }
                }

                else if (cond.type === "turns") {
                    const requiredTurns = cond.turnCount;
                    const currentTurns = PTBS_Manager._turnCount || 0;
                    if (currentTurns >= requiredTurns) return true;
                }
            }

            return false;
        }
    }

    class Scene_WinConditionConfig extends Scene_MenuBase {
        create() {
            super.create();
            this.createWinConditionListWindow();
            this.createHelpWindow();
        }

        createWinConditionListWindow() {
            // Full‐screen window for listing current win conditions
            const rect = new Rectangle(0, 0, Graphics.width, Graphics.height);
            this._winCondListWindow = new Window_WinConditionList(rect);
            this.addWindow(this._winCondListWindow);
            // Set handlers for when the user wants to add a new condition or confirm/cancel.
            this._winCondListWindow.setHandler("add", this.commandAdd.bind(this));
            this._winCondListWindow.setHandler("confirm", this.commandConfirm.bind(this));
            this._winCondListWindow.setHandler("cancel", this.popScene.bind(this));
        }

        createHelpWindow() {
            // A small help window (optional) at the bottom
            const rect = new Rectangle(0, Graphics.height - 100, Graphics.width, 100);
            this._winCondHelpWindow = new Window_Help(rect);
            this.addWindow(this._winCondHelpWindow);
            this._winCondHelpWindow.setText("Use A to add a win condition, and OK to confirm.");
        }

        commandAdd() {
            // Push a new scene that lets the user choose a win condition type.
            SceneManager.push(Scene_AddWinCondition);
        }

        commandConfirm() {
            // When confirmed, pass the conditions to PTBS_WinManager and pop back to the map.
            PTBS_WinManager.setConditions(this._winCondListWindow.winConditions());
            this.popScene();
        }
    }

    class Window_WinConditionList extends Window_Selectable {
        initialize(rect) {
            super.initialize(rect);
            this._winConditions = []; // Array to hold win condition objects
            this.refresh();
        }

        winConditions() {
            return this._winConditions;
        }

        refresh() {
            this.contents.clear();
            // Draw a header:
            this.drawText("Configure Win Conditions", 0, 0, this.contentsWidth(), "center");
            // List each win condition:
            for (let i = 0; i < this._winConditions.length; i++) {
                const cond = this._winConditions[i];
                const y = 40 + i * 30;
                this.drawText(this.conditionText(cond), 0, y, this.contentsWidth());
            }
            // At the bottom, show instructions
            this.drawText("Press A to add, Enter to confirm, Esc to cancel.", 0, this.contentsHeight() - 30, this.contentsWidth(), "center");
        }

        conditionText(cond) {
            switch (cond.type) {
                case "defeatEnemies": return "Defeat All Enemies";
                case "switch":       return `Switch ${cond.switchId} = ${cond.switchState ? "ON" : "OFF"}`;
                case "variable":     return `Variable ${cond.variableId} ${cond.variableOperator} ${cond.variableValue}`;
                case "turns":        return `After ${cond.turnCount} Turns`;
                default:             return "";
            }
        }

        addCondition(cond) {
            this._winConditions.push(cond);
            this.refresh();
        }

        // Make A button trigger "add"
        processOk() {
            if (this.isHandled("add")) {
                this.callHandler("add");
            } else {
                super.processOk();
            }
        }

        update() {
            super.update();
            if (Input.isTriggered("ok")) {
                this.callHandler("confirm");
            } else if (Input.isTriggered("cancel")) {
                this.callHandler("cancel");
            } else if (Input.isTriggered("a")) {
                this.callHandler("add");
            }
        }
    }

    function Window_SkillPopup() {
        this.initialize(...arguments);
    }

    Window_SkillPopup.prototype = Object.create(Window_Base.prototype);
    Window_SkillPopup.prototype.constructor = Window_SkillPopup;

    Window_SkillPopup.prototype.initialize = function(x, y, width, height) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
        this.x = x;
        this.y = y;
        this.opacity = 255;
        this.contentsOpacity = 255;
        this.backOpacity = 192;
        this.padding = 5;

        // Move the window's origin to its center
        this.anchor = new Point(0.5, 0.5);
        this.move(x, y, width, height);
    };

    Window_SkillPopup.prototype.setSkillName = function(name) {
        this.contents.clear();
        const textSize = this.textSizeEx(name);

        // Calculate center positions
        const x = Math.floor((this.contentsWidth() - textSize.width) / 2);
        const y = Math.floor((this.contentsHeight() - textSize.height) / 2);

        this.drawTextEx(name, x, y, this.contentsWidth());
    };


    class Scene_AddWinCondition extends Scene_MenuBase {
        create() {
            super.create();
            this.createTypeSelectionWindow();
        }

        createTypeSelectionWindow() {
            const rect = new Rectangle(0, 0, Graphics.width, Graphics.height);
            this._typeWindow = new Window_WinConditionType(rect);
            this.addWindow(this._typeWindow);
            this._typeWindow.setHandler("ok", this.onTypeOk.bind(this));
            this._typeWindow.setHandler("cancel", this.popScene.bind(this));
        }

        onTypeOk() {
            const type = this._typeWindow.currentSymbol();
            // Depending on type, you could open an additional window to let the user edit extra parameters.
            // For simplicity here, we create a default condition object.
            let condition = { type: type };
            if (type === "defeatEnemies") {
                // no extra info needed
            } else if (type === "switch") {
                condition.switchId = 1;
                condition.switchState = true;
            } else if (type === "variable") {
                condition.variableId = 1;
                condition.variableOperator = "==";
                condition.variableValue = 0;
            } else if (type === "turns") {
                condition.turnCount = 1;
            }
            // Add the condition to the list in the previous scene.
            // (Assumes Scene_WinConditionConfig is now the active scene after we pop back.)
            const configScene = SceneManager._scene.previousScene();
            if (configScene && configScene._winCondListWindow) {
                configScene._winCondListWindow.addCondition(condition);
            }
            this.popScene();
        }
    }

    class Window_WinConditionType extends Window_Command {
        initialize(rect) {
            super.initialize(rect);
        }

        makeCommandList() {
            this.addCommand("Defeat All Enemies", "defeatEnemies");
            this.addCommand("Switch Condition", "switch");
            this.addCommand("Variable Condition", "variable");
            this.addCommand("Turns Condition", "turns");
        }
    }


    //--------------------------------------------------------------------------
    // parseSkillBlock(item)
    //--------------------------------------------------------------------------
    function parseSkillBlock(item) {
        if (!item || !item.note) return null;
        const blockRegex = /<PTBS>([\s\S]*?)<\/PTBS>/i;
        const match = item.note.match(blockRegex);
        if (!match) return null;

        const sections = ["battleStart","turnStart","prepare","movement","execute","effect","return","finish","evasion"];
        const result = {};
        for (const s of sections) {
            result[s] = [];
        }

        const entireBlock = match[1];
        for (const s of sections) {
            const re = new RegExp(`<action sequence:\\s*${s}\\s*>((?:(?!<\/action sequence>)[\\s\\S])+)</action sequence>`, "i");
            const mm = entireBlock.match(re);
            if (mm) {
                result[s] = parseActionSequenceSteps(mm[1].trim());
            }
        }
        return result;
    }

    function parseVisualEquipFromItem(note) {
        // We'll return an array of steps (each step is an object), or null if none found
        if (!note) return null;

        // Look for <PTBS> ... </PTBS>
        const blockMatch = note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
        if (!blockMatch) return null;
        const ptbsBlock = blockMatch[1];

        // Inside that block, look for <visual equip> ... </visual equip>
        const veMatch = ptbsBlock.match(/<visual equip>([\s\S]*?)<\/visual equip>/i);
        if (!veMatch) return null;

        // We have a chunk of text that might look like:
        //   icon (user, equip 0, 1, offsetX, offsetY, ...)
        // We'll parse it using your existing parseActionSequenceSteps function:
        const stepsText = veMatch[1].trim();
        const steps = parseActionSequenceSteps(stepsText);
        return steps && steps.length > 0 ? steps : null;
    }

    function parseVisualEquipWithDirections(note) {
        // 1) Look for <PTBS> ... </PTBS>
        const blockMatch = note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
        if (!blockMatch) return null;
        const ptbsBlock = blockMatch[1];

        // 2) Inside that, find <visual equip> ... </visual equip>
        const veMatch = ptbsBlock.match(/<visual equip>([\s\S]*?)<\/visual equip>/i);
        if (!veMatch) return null;
        const linesText = veMatch[1].trim();

        // 3) We'll store them in a dictionary: { down: [], up: [], left: [], right: [] }
        const map = { down: [], up: [], left: [], right: [] };

        // 4) Split into lines
        const lines = linesText.split(/\r?\n/);
        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Expect a pattern like  "down: icon(...)" or "up: icon(...)"
            const match = line.match(/^(\w+)\s*:\s*(.*)$/);
            if (match) {
                const dirKey = match[1].toLowerCase();  // e.g. "down"
                const cmdStr = match[2].trim();         // e.g. "icon(user, equip 0, 1, 0, 0, 255, 0)"

                // Parse that line with parseActionSequenceSteps(...)
                const steps = parseActionSequenceSteps(cmdStr);
                if (map[dirKey]) {
                    map[dirKey] = steps;
                }
            }
        }

        return map;
    }


    //--------------------------------------------------------------------------
    // parseActionSequenceSteps
    //--------------------------------------------------------------------------
    function parseActionSequenceSteps(seqBody) {
        // First, split the sequence text into comma-separated commands (watching for parentheses)
        const commands = [];
        let currentCommand = '';
        let parenCount = 0;

        for (let i = 0; i < seqBody.length; i++) {
            const char = seqBody[i];
            if (char === '(') parenCount++;
            if (char === ')') parenCount--;

            // If we see a comma at "parenthesis depth 0", that's the boundary for a new command
            if (char === ',' && parenCount === 0) {
                commands.push(currentCommand.trim());
                currentCommand = '';
            } else {
                currentCommand += char;
            }
        }
        // Push the last command (if any)
        if (currentCommand.trim()) {
            commands.push(currentCommand.trim());
        }

        // Now parse each command into a step object
        const steps = [];
        for (const cmd of commands) {

            // 1) If it's a function-call style, e.g. "something(...)"
            const funcMatch = cmd.match(/^(\w+)\s*\((.*)\)$/);
            if (funcMatch) {
                const stepName = funcMatch[1];       // e.g. "balloon", "icon", "moveForward", etc.
                const argString = funcMatch[2] || ''; // everything inside the parentheses
                const args = argString.split(',').map(arg => arg.trim());

                switch (stepName) {
                    case "balloon":
                        steps.push({ type: "balloon", args: args, wait: 0 });
                        break;

                    case "icon":
                        steps.push({ type: "icon", args: args, wait: 0 });
                        break;

                    case "picture":
                        steps.push({ type: "picture", args: args, wait: 0 });
                        break;

                    case "imageMove":
                        steps.push({ type: "imageMove", args: args, wait: 0 });
                        break;

                    case "imageMoveRelative":
                        steps.push({ type: "imageMoveRelative", args: args, wait: 0 });
                        break;

                    case "wait":
                        steps.push({ type: "wait", wait: Number(args[0]) || 0 });
                        break;

                    case "move":
                        // e.g. move(user, target, frames, distance, layer)
                        steps.push({ type: "pixelMove", args: args, wait: 0 });
                        break;

                        // Inside parseActionSequenceSteps(seqBody) ...
                    case "jump": {
                        // e.g. jump(user, target, 30, 48, 32, "front")
                        const [subject, toStr, framesStr, distanceStr, arcStr, layerStr] = args;
                        const frames   = Number(framesStr)   || 30;
                        const distance = Number(distanceStr) || 0;
                        const arc      = Number(arcStr)      || 24;
                        const layer    = layerStr || "front";
                        steps.push({
                            type: "jump",
                            subjectStr: subject,
                            toStr: toStr,
                            frames: frames,
                            distance: distance,
                            arc: arc,
                            layer: layer,
                            wait: 0
                        });
                        break;
                    }

                    case "moveRelative": {
                        // Parse out the arguments
                        const [subject, relDir, frames, distance, layer] = args;
                        steps.push({
                            type: "moveRelative",
                            subjectStr: subject || "user",
                            relDirStr: relDir || "front",
                            frames: Number(frames) || 30,
                                   distance: Number(distance) || 48,
                                   layer: layer || "front",
                                   wait: 0
                        });
                        break;
                    }

                    case "moveForward":
                        steps.push({
                            type: "moveForward",
                            distance: Number(args[0]) || 1,
                                   wait: Number(args[1]) || 5
                        });
                        break;

                    case "moveBackward":
                        steps.push({
                            type: "moveBackward",
                            distance: Number(args[0]) || 1,
                                   wait: Number(args[1]) || 5
                        });
                        break;

                    case "playAnimation": {
                        const animId = Number(args[0]) || 1;
                        let targetType = String(args[1] || "target").toLowerCase();
                        let rotationMode = "none";
                        let wait = false;
                        let offsetX = 0;
                        let offsetY = 0;

                        let argIndex = 2;
                        if (args[argIndex] === "direction" || args[argIndex] === "aim") {
                            rotationMode = args[argIndex];
                            argIndex++;
                        }
                        if (args[argIndex] === "wait") {
                            wait = true;
                            argIndex++;
                        }
                        if (argIndex < args.length) offsetX = Number(args[argIndex++]) || 0;
                        if (argIndex < args.length) offsetY = Number(args[argIndex++]) || 0;

                        steps.push({
                            type: "playAnimation",
                            animId,
                            targetType,
                            rotationMode,
                            wait,
                            offsetX,
                            offsetY
                        });
                        break;
                    }
                    case "shake": {
                        // e.g. shake(user, 2, 10, 30, 15)
                        // or    shake(target, 1, 8, 20)
                        let subjectStr = "target";  // fallback
                        let power    = 1;
                        let speed    = 8;
                        let duration = 20;
                        let wait     = 0;

                        // If user typed: shake(user, 2,10,20,5) => that’s 5 args
                        // We'll parse the 1st arg to see if it's "user"/"target"/"all targets" or just a number.
                        if (args.length > 0) {
                            const firstArg = args[0].toLowerCase();
                            if (["user","target","all targets"].includes(firstArg)) {
                                subjectStr = firstArg;
                                power      = Number(args[1] || 1);
                                speed      = Number(args[2] || 8);
                                duration   = Number(args[3] || 20);
                                wait       = Number(args[4] || 0);
                            } else {
                                // No subject => treat 1st as power
                                power    = Number(args[0] || 1);
                                speed    = Number(args[1] || 8);
                                duration = Number(args[2] || 20);
                                wait     = Number(args[3] || 0);
                            }
                        }

                        steps.push({
                            type: "pixelShake",
                            subjectStr,
                            power,
                            speed,
                            duration,
                            wait
                        });
                        break;
                    }


                    case "shakeScreen": {
                        // e.g. shakeScreen(power, speed, duration, waitFrames)
                        // parse each argument
                        const power    = Number(args[0]) || 5;
                        const speed    = Number(args[1]) || 5;
                        const duration = Number(args[2]) || 30;
                        const wait     = Number(args[3]) || 0;

                        steps.push({
                            type: "screenShake",
                            power: power,
                            speed: speed,
                            duration: duration,
                            wait: wait
                        });
                        break;
                    }

                    // --------------------------------------
                    // NEW: ifDirection(...) support
                    // e.g. ifDirection(down, icon(user, icon 86, 1, -15, 20, 255, 140, 0, above))
                    // --------------------------------------
                    case "ifDirection": {
                        // We parse the direction from argString up to the first comma
                        const commaIdx = argString.indexOf(',');
                        if (commaIdx >= 0) {
                            const dirStr = argString.substring(0, commaIdx).trim();       // e.g. "down"
                            const subCmdStr = argString.substring(commaIdx + 1).trim();   // e.g. "icon(user, icon 86, ...)"
                            steps.push({
                                type: "ifDirection",
                                direction: dirStr,
                                subCmd: subCmdStr,  // we can parse this subCmd later
                                wait: 0
                            });
                        } else {
                            // invalid format, but you could gracefully handle
                            console.warn("ifDirection(...) format error: " + cmd);
                        }
                        break;
                    }

                    default:
                        // Catch-all for unknown function calls
                        steps.push({ type: stepName, args: args, wait: 0 });
                        break;
                }
            }

            // 2) If it's exactly "applyActionEffect" or "applyActionEffect()" => known step
            else if (cmd === "applyActionEffect" || cmd === "applyActionEffect()") {
                steps.push({ type: "applyActionEffect", wait: 0 });
            }

            // --------------------------------------
            // NEW: "repeat" command (no parentheses)
            // e.g. just the word "repeat"
            // --------------------------------------
            else if (cmd.toLowerCase() === "repeat") {
                steps.push({ type: "repeat", wait: 0 });
            }

            // 3) Otherwise, treat it as a generic step with no parentheses
            else {
                // e.g. "someCustomStep"
                steps.push({ type: cmd, wait: 0 });
            }
        }

        return steps;
    }

    function buildFullSequence(skillSequences, action, battler, aoeTargets) {
        const finalSeq = [];
        if (skillSequences.prepare)  finalSeq.push(...skillSequences.prepare);
        if (skillSequences.movement) finalSeq.push(...skillSequences.movement);
        if (skillSequences.execute)  finalSeq.push(...skillSequences.execute);
        if (skillSequences.return)   finalSeq.push(...skillSequences.return);
        if (skillSequences.finish)   finalSeq.push(...skillSequences.finish);
        return finalSeq;
    }

    // -----------------------------------------------------------------------------
    // PTBS_Battler
    // -----------------------------------------------------------------------------
    class PTBS_Battler {
        constructor(event, dbEntry, actorInstance, enemyId) {
            this._event = event;
            this._actor = null;
            this._enemy = null;

            this._moveQueue = null;
            this._moved = false;
            this._hasAttacked = false;

            // For pixel-based steps
            this._pixelOffsetX = 0;
            this._pixelOffsetY = 0;
            this._pixelMoveData = null;

            this._actionSequence = null;
            this._actionSequenceIndex = 0;
            this._actionSequenceWait = 0;
            this._loopedStatesAnimIds = [];

            // If it's an actor event with a cloned instance
            if (actorInstance) {
                this._actor = actorInstance;
            } else if (enemyId) {
                // Enemy case
                this._enemy = new Game_Enemy(enemyId, 0, 0);
                $gameTroop._enemies.push(this._enemy);
                $gameTroop.makeUniqueNames(this._enemy);

                // Extract skills from enemy actions in the database
                const dataEnemy = $dataEnemies[enemyId];
                if (dataEnemy && dataEnemy.actions) {
                    // The actions array contains objects with { skillId, conditionType, conditionParam, rating }
                    this._enemySkillIds = dataEnemy.actions
                    .filter(a => a.skillId !== 1 && a.skillId > 0) // Filter out basic attack and invalid IDs
                    .map(a => a.skillId)
                    .filter((id, i, arr) => arr.indexOf(id) === i); // Remove duplicates

                    // Also store the full action patterns for AI decision making
                    this._actionPatterns = dataEnemy.actions.map(action => ({
                        skillId: action.skillId,
                        conditionType: action.conditionType,
                        conditionParam: action.conditionParam,
                        rating: action.rating
                    }));
                } else {
                    this._enemySkillIds = [];
                    this._actionPatterns = [];
                }
            }

            const note = dbEntry.note || "";
            this._ptbsData = this.parsePTBSNotes(note);

            this._faction = this._ptbsData.faction || "neutral";
            this._aiPattern = this._ptbsData.ai_pattern || "none";
            this._movePoints = Number(this._ptbsData.move_points || 3);
            this._actionPoints = Number(this._ptbsData.action_points || 1);
            this._corpseSprite = this._ptbsData.corpse_sprite || "";
            this._turnOrderSprite = this._ptbsData.turn_order_sprite || "";

            this._attackScope = {
                shape: "circle",
                max: 1,
                min: 1,
                scopeSelect: "enemies"
            };

            this._speed = 0;
            this._icons = {};
            this._event.setMoveSpeed(paramMoveSpeed);

            this._visualEquipByDir = parseVisualEquipWithDirections(note) || null;

            if (this._actor) {
                const w = this._actor.weapons()[0];
                if (w && w.note) {
                    this._weaponVisualEquipByDir = parseVisualEquipWithDirections(w.note) || null;
                } else {
                    this._weaponVisualEquipByDir = null;
                }
            }

            this.updateAttackScopeFromWeapon();
            this._lastDir = this._event.direction();
            this._movableTilesCache = null; // Cached movable tiles
            this._cacheKey = null; // Key to invalidate cache (position + move points)
        }

        applyStateTurnEndEffects() {
            if (this._actor) {
                // The built-in method that applies poison damage, regen, updates state turns, etc.
                this._actor.onTurnEnd();
                this._actor.result();  // Clear any leftover results as needed
            } else if (this._enemy) {
                this._enemy.onTurnEnd();
                this._enemy.result();
            }
        }

        // -------------------------------------------------------------------------
        // updateStateLoopAnimations()
        //   - Checks all active states (or weapon notes) for "looping_animation: X"
        //   - Stores them in this._loopedStatesAnimIds.
        // -------------------------------------------------------------------------
        updateStateLoopAnimations() {
            const animIds = [];

            // Only collect animations if the battler is alive
            if (this.currentHP() > 0) {
                // For Actors - get states from actor object
                if (this._actor) {
                    const states = this._actor.states();
                    for (const state of states) {
                        const animId = parseLoopingAnimationId(state.note);
                        if (animId > 0) {
                            animIds.push(animId);
                        }
                    }

                    // Optionally check if weapon provides a looping animation
                    const weapon = this._actor.weapons()[0];
                    if (weapon) {
                        const weaponAnimId = parseLoopingAnimationId(weapon.note);
                        if (weaponAnimId > 0) {
                            animIds.push(weaponAnimId);
                        }
                    }
                }
                // For Enemies - get states from enemy object
                else if (this._enemy) {
                    const states = this._enemy.states();
                    for (const state of states) {
                        const animId = parseLoopingAnimationId(state.note);
                        if (animId > 0) {
                            animIds.push(animId);
                        }
                    }
                }
            }

            // Save the list of animation IDs to play
            this._loopedStatesAnimIds = animIds;
        }



        // -------------------------------------------------------------------------
        // parsePTBSNotes(note)
        // Reads <PTBS> ... </PTBS> from the event (actor/enemy) note, including
        // potential action sequences, scope, etc.
        // -------------------------------------------------------------------------
        parsePTBSNotes(note) {
            // Initialize with defaults:
            const data = {
                actionSequences: {},
                base_ap: 1,
                move_points: 3,
                corpse_sprite: "",
                faction: "neutral"   // default to neutral
            };

            // Look for <PTBS>...</PTBS> block
            const blockMatch = note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
            if (!blockMatch) return data;

            const block = blockMatch[1];

            // Parse faction (new code)
            const factionMatch = block.match(/faction\s*:\s*(\w+)/i);
            if (factionMatch) {
                data.faction = factionMatch[1].toLowerCase();
            }

            // Parse ai_pattern from the note block.
            const aiMatch = block.match(/ai_pattern\s*:\s*(\w+)/i);
            if (aiMatch) {
                data.ai_pattern = aiMatch[1].toLowerCase();
            }

            // Parse corpse sprite
            const corpseMatch = block.match(/corpse_sprite\s*:\s*([^,\r\n]+)/i);
            if (corpseMatch) {
                data.corpse_sprite = corpseMatch[1].trim();
            }

            // Parse base_ap
            const baseMatch = block.match(/base_ap\s*:\s*([+-]?\d+)/i);
            if (baseMatch) {
                data.base_ap = Number(baseMatch[1]) || 1;
            }

            // Parse move_points
            const movMatch = block.match(/move_points\s*:\s*(\d+)/i);
            if (movMatch) {
                data.move_points = Number(movMatch[1]) || 3;
            }

            // Parse action sequences...
            const reSeq = /<action sequence:\s*(\w+)\s*>((?:(?!<\/action sequence>)[\s\S])+)<\/action sequence>/gi;
            let seqMatch;
            while ((seqMatch = reSeq.exec(block)) !== null) {
                const seqName = seqMatch[1].trim();
                const seqBody = seqMatch[2].trim();
                const steps = parseActionSequenceSteps(seqBody);
                data.actionSequences[seqName] = steps;
            }

            return data;
        }

        // -------------------------------------------------------------------------
        // updateDirectionIfChanged()
        // Called each frame by PTBS_Manager (or similar) to see if direction changed.
        // -------------------------------------------------------------------------
        updateDirectionIfChanged() {
            const currentDir = this._event.direction();
            if (currentDir !== this._lastDir) {
                this._lastDir = currentDir;
                this.onDirectionChanged(currentDir);
            }
        }

        // -------------------------------------------------------------------------
        // onDirectionChanged(newDir)
        // Clears old icons, then runs the direction-based steps from
        // _visualEquipByDir and _weaponVisualEquipByDir for e.g. "down", "up", etc.
        // -------------------------------------------------------------------------
        onDirectionChanged(newDir) {
            // 1) Clear old icons
            this.clearAllIcons();

            // 2) Convert numeric direction => "down"/"up"/"left"/"right"
            let dirKey = "down";
            if (newDir === 8) dirKey = "up";
            else if (newDir === 4) dirKey = "left";
            else if (newDir === 6) dirKey = "right";

            // 3) If the event’s <visual equip> had lines for that direction, run them
            if (this._visualEquipByDir && this._visualEquipByDir[dirKey]) {
                const steps = this._visualEquipByDir[dirKey];
                for (const step of steps) {
                    PTBS_Manager.doActionSequenceStep(this, step);
                    this._actionSequenceWait = 0; // no wait
                }
            }

            // 4) If the weapon also has lines for that direction, run them
            if (this._weaponVisualEquipByDir && this._weaponVisualEquipByDir[dirKey]) {
                const steps = this._weaponVisualEquipByDir[dirKey];
                for (const step of steps) {
                    PTBS_Manager.doActionSequenceStep(this, step);
                    this._actionSequenceWait = 0;
                }
            }
        }

        getAttackDirection(attacker) {
            const targetDir = this._event.direction(); // 2=down, 4=left, 6=right, 8=up
            const attackerX = attacker._event.x;
            const attackerY = attacker._event.y;
            const targetX = this._event.x;
            const targetY = this._event.y;

            // Determine relative position
            const dx = attackerX - targetX;
            const dy = attackerY - targetY;

            // Convert to direction attacker is coming from
            let attackDir;
            if (dx === 0 && dy > 0) attackDir = 2; // Attacker below (target facing down)
            else if (dx === 0 && dy < 0) attackDir = 8; // Attacker above (target facing up)
            else if (dx > 0 && dy === 0) attackDir = 6; // Attacker right (target facing right)
            else if (dx < 0 && dy === 0) attackDir = 4; // Attacker left (target facing left)
            else {
                // Diagonal or adjacent, approximate based on dominant axis
                if (Math.abs(dx) > Math.abs(dy)) {
                    attackDir = dx > 0 ? 6 : 4;
                } else {
                    attackDir = dy > 0 ? 2 : 8;
                }
            }

            // Compare with target's facing
            if (attackDir === targetDir) return "front";
            if ((attackDir === 2 && targetDir === 8) || (attackDir === 8 && targetDir === 2) ||
                (attackDir === 4 && targetDir === 6) || (attackDir === 6 && targetDir === 4)) return "back";
            return "side";
        }

        getMovableTiles() {
            const currentX = this.event().x;
            const currentY = this.event().y;
            const movePoints = this._remainingMovePoints; // Single declaration
            const cacheKey = `${currentX},${currentY},${movePoints}`;

            if (this._cacheKey === cacheKey && this._movableTilesCache) {
                return this._movableTilesCache;
            }

            const startX = this.event().x;
            const startY = this.event().y;
            const result = [];

            const visited = new Set();
            const queue = [{ x: startX, y: startY, cost: 0 }];
            visited.add(startY * $gameMap.width() + startX);

            while (queue.length > 0) {
                const current = queue.shift();

                if (current.x !== startX || current.y !== startY) {
                    result.push({ x: current.x, y: current.y });
                }

                if (current.cost >= movePoints) continue;

                const directions = [
                    { dx: 0, dy: -1 }, // up
                    { dx: 1, dy: 0 },  // right
                    { dx: 0, dy: 1 },  // down
                    { dx: -1, dy: 0 }  // left
                ];

                for (const dir of directions) {
                    const nextX = current.x + dir.dx;
                    const nextY = current.y + dir.dy;
                    const key = nextY * $gameMap.width() + nextX;

                    if (nextX < 0 || nextY < 0 || nextX >= $gameMap.width() || nextY >= $gameMap.height()) {
                        continue;
                    }

                    if (visited.has(key)) continue;

                    if (PTBS_Manager.isTileInMoveScope(nextX, nextY, this, visited)) {
                        queue.push({ x: nextX, y: nextY, cost: current.cost + 1 });
                        visited.add(key);
                    }
                }
            }

            this._movableTilesCache = result;
            this._cacheKey = cacheKey;
            return result;
        }


        // -------------------------------------------------------------------------
        // clearAllIcons()
        // Removes any icons that were previously set, so we can re-apply new offset.
        // -------------------------------------------------------------------------
        clearAllIcons() {
            // if this._icons is { "1": {..}, "weaponIcon": {..}, ...}
            // we can remove them one by one:
            for (const key in this._icons) {
                this.clearIcon(key);
            }
        }

        // -------------------------------------------------------------------------
        // setIcon / clearIcon / getIconData
        // (For the 2-sprite icon approach)
        // -------------------------------------------------------------------------
        setIcon(iconIndex, iconData) {
            this._icons[iconIndex] = iconData;
        }
        clearIcon(iconIndex) {
            delete this._icons[iconIndex];
        }
        getIconData(iconIndex) {
            return this._icons[iconIndex];
        }
        getAllIcons() {
            // Return an array of { index, data }
            return Object.entries(this._icons).map(([idx, data]) => {
                return { index: idx, data: data };
            });
        }

        setPicture(pictureSlot, pictureData) {
            // You could either store pictures in the same _icons dictionary
            // by checking for a property like pictureName
            this._icons[pictureSlot] = pictureData;
        }
        clearPicture(pictureSlot) {
            delete this._icons[pictureSlot];
        }
        getPictureData(pictureSlot) {
            return this._icons[pictureSlot];
        }

        currentTile() {
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            // Round the pixel offset divided by tile size and add to the base tile coordinate.
            const tileX = this.event().x + Math.round((this._pixelOffsetX || 0) / tw);
            const tileY = this.event().y + Math.round((this._pixelOffsetY || 0) / th);
            return { x: tileX, y: tileY };
        };

        // -------------------------------------------------------------------------
        // startTurn
        // Called when it becomes this battler’s turn
        // -------------------------------------------------------------------------
        startTurn() {
            this._moved = false;
            this._hasAttacked = false;
            this._actionPoints = Number(this._ptbsData.action_points || 1);
            this._moveQueue = null;
            this._actionSequence = null;
            this._actionSequenceIndex = 0;
            this._actionSequenceWait = 0;
            this._commandModeActive = false;
            this._remainingMovePoints = Number(this._ptbsData.move_points || 3);

            // Re-check if weapon changed
            this.updateAttackScopeFromWeapon();

            this._maxAP = this.calculateTotalAP();

            this._actionPoints = this._maxAP;

            // Re-parse weapon’s <visual equip> if needed
            if (this._actor) {
                const w = this._actor.weapons()[0];
                if (w && w.note) {
                    this._weaponVisualEquipByDir = parseVisualEquipWithDirections(w.note) || null;
                } else {
                    this._weaponVisualEquipByDir = null;
                }
                this._movableTilesCache = null; // Invalidate cache at turn start
                this._cacheKey = null;
            }

            // If there's a "turnStart" sequence in <PTBS>, run it
            const seq = this.getActionSequence("turnStart");
            if (seq && seq.length > 0) {
                this._actionSequence = seq.slice(); // clone
                this._actionSequenceIndex = 0;
                this._actionSequenceWait = 0;
                PTBS_Manager._state = "actionSequence";
            }
        }

        // -------------------------------------------------------------------------
        // getActionSequence
        // -------------------------------------------------------------------------
        getActionSequence(seqName) {
            if (this._ptbsData && this._ptbsData.actionSequences) {
                return this._ptbsData.actionSequences[seqName] || null;
            }
            return null;
        }

        // -------------------------------------------------------------------------
        // updateAttackScopeFromWeapon
        //  Reads any <PTBS>... scope: shape(...) from the current weapon note
        // -------------------------------------------------------------------------
        updateAttackScopeFromWeapon() {
            if (!this._actor) {
                // If enemy, read from event note or keep default
                const sc = this.parseScopeFromNote(this._ptbsData);
                if (sc) this._attackScope = sc;
                return;
            }
            const w = this._actor.weapons()[0];
            if (!w) {
                this._attackScope = { shape: "circle", max: 1, min: 1, scopeSelect: "enemies" };
                return;
            }
            const sc = this.parseScopeBlock(w.note);
            this._attackScope = sc;
        }

        // parseScopeBlock (for a weapon note)
        parseScopeBlock(note) {
            let result = { shape: "circle", max: 1, min: 1, scopeSelect: "enemies" };
            const blockMatch = note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
            if (!blockMatch) return result;

            const block = blockMatch[1];
            const selMatch = block.match(/scope_select\s*:\s*(\w+)/i);
            if (selMatch) {
                result.scopeSelect = selMatch[1].toLowerCase();
            }
            const scopeMatch = block.match(/scope\s*:\s*(\w+)\(([^)]*)\)/i);
            if (scopeMatch) {
                const shape = scopeMatch[1].toLowerCase();
                const params = scopeMatch[2].split(",").map(s => Number(s.trim()));
                result.shape = shape;
                if (params.length === 1) {
                    result.max = params[0];
                    result.min = 1;
                } else if (params.length === 2) {
                    result.max = params[0];
                    result.min = params[1];
                }
            }
            return result;
        }

        // parseScopeFromNote (enemy/fallback note)
        parseScopeFromNote(ptbsData) {
            const shapeLine = ptbsData["scope"] || "";
            const selLine   = ptbsData["scope_select"] || "";
            let res = {
                shape: "circle",
                max: 1,
                min: 1,
                scopeSelect: "enemies"
            };
            if (selLine) {
                res.scopeSelect = selLine.toLowerCase();
            }
            const m = shapeLine.match(/(\w+)\(([^)]*)\)/);
            if (m) {
                const shape = m[1].toLowerCase();
                const params = m[2].split(",").map(s => Number(s.trim()));
                res.shape = shape;
                if (params.length === 1) {
                    res.max = params[0];
                    res.min = 1;
                } else if (params.length === 2) {
                    res.max = params[0];
                    res.min = params[1];
                }
            }
            return res;
        }

        // -------------------------------------------------------------------------
        // HP/MP/TP, speed, etc.
        // -------------------------------------------------------------------------
        calculateSpeed() {
            if (this._actor) {
                this._speed = this._actor.agi;
            } else if (this._enemy) {
                this._speed = this._enemy.param(6);
            }
        }
        speed() {
            return this._speed;
        }

        event() {
            return this._event;
        }

        displayName() {
            if (this._actor) return this._actor.name();
            if (this._enemy) return this._enemy.name();
            return "Unknown Battler";
        }

        turnOrderSpriteTag() {
            return this._turnOrderSprite;
        }

        isMoving() {
            return this._event.isMoving();
        }

        moveOneStep(dir) {
            this._event.setDirection(dir);
            this._event.moveStraight(dir);
        }

        moveTo(x, y) {
            this._event.locate(x, y);
            this._moved = true;
            this._movableTilesCache = null; // Invalidate cache on move
            this._cacheKey = null;
        }

        get moved() {
            return this._moved;
        }

        get hasAttacked() {
            return this._hasAttacked;
        }

        isInActionSequence() {
            return this._actionSequence && this._actionSequenceIndex < this._actionSequence.length;
        }

        currentHP() {
            if (this._actor) return this._actor.hp;
            if (this._enemy) return this._enemy.hp;
            return 0;
        }
        currentMP() {
            if (this._actor) return this._actor.mp;
            if (this._enemy) return this._enemy.mp;
            return 0;
        }
        currentTP() {
            if (this._actor) return this._actor.tp;
            if (this._enemy) return this._enemy.tp;
            return 0;
        }

        getMaxMP() {
            if (this._actor) {
                return this._actor.mmp;
            } else if (this._enemy) {
                return this._enemy.param(1); // Parameter 1 is MP in RPG Maker
            }
            return 0;
        }

        actionPoints() {
            return this._actionPoints;
        }

        maxAP() {
            // If we store it in startTurn:
            return this._maxAP || 1;
        }

        calculateTotalAP() {
            let base = this._ptbsData.base_ap || 1;  // fallback if none
            let eqBonus = 0;
            let stateBonus = 0;

            // If Actor => read from each piece of equipment
            if (this._actor) {
                const equips = this._actor.equips();
                for (const item of equips) {
                    if (item && item.note) {
                        eqBonus += readItemAPModifier(item.note);
                    }
                }

                // Then from each active state
                const states = this._actor.states();
                for (const st of states) {
                    if (st && st.note) {
                        stateBonus += readItemAPModifier(st.note);
                    }
                }
            }
            // If Enemy => can do the same for enemy states:
            else if (this._enemy) {
                const states = this._enemy.states();
                for (const st of states) {
                    if (st && st.note) {
                        stateBonus += readItemAPModifier(st.note);
                    }
                }
            }

            return base + eqBonus + stateBonus;
        }

        showDamageResults() {
            if (this._actor) this._actor.clearResult();
            if (this._enemy) this._enemy.clearResult();
        }

        handleDeath() {
            // If a corpse sprite is specified in the battler's data, use it.
            if (this._corpseSprite) {
                const parts = this._corpseSprite.split(',');
                const spriteName = parts[0].trim();
                const spriteIndex = parts.length > 1 ? Number(parts[1]) : 0;

                this._event.setImage(spriteName, spriteIndex); // Change the event's image.
                this._event.setThrough(true);               // Make the event passable.
                this._event.setPriorityType(0);            // Set priority to "Below Characters".
                this._event.setDirectionFix(true);         // Prevent the corpse from rotating.

                // Clear any active icons or animations
                this._icons = {};
                if (this._loopedStatesAnimIds) {
                    this._loopedStatesAnimIds = [];
                }
            }
            // If no corpse sprite is specified, just make the event transparent.
            else {
                this._event.setOpacity(0);                  // Make the event invisible.
                this._event.setThrough(true);               // Make the event passable.
                this._icons = {}; //Clear any leftover icon data.
                if (this._loopedStatesAnimIds) {
                    this._loopedStatesAnimIds = [];
                }
            }

            // --- NEW: Check for defeat condition ---
            PTBS_Manager.checkDefeatConditions(this); // Pass the *dead* battler object.
        }

        getAttackScope() {
            return this._attackScope;
        }
    }

    class PTBS_AI {
        // Returns true if the battler’s PTBS data indicates AI control.
        static isControlledByAI(battler) {
            // Check if the battler is an enemy (enemies should be AI-controlled by default)
            if (battler._enemy) {
                // Only check AI pattern if explicitly set to "player" to override default enemy behavior
                if (battler._ptbsData && battler._ptbsData.ai_pattern &&
                    battler._ptbsData.ai_pattern.toLowerCase() === "player") {
                return false;
                    }
                    return true;
            }

            // For actors, check if AI pattern is set (anything except "player" means AI controlled)
            if (battler._actor) {
                if (battler._ptbsData && battler._ptbsData.ai_pattern) {
                    return battler._ptbsData.ai_pattern.toLowerCase() !== "player";
                }
            }

            // Default: actors are player-controlled, enemies are AI-controlled
            return !!battler._enemy;
        }
        // Main decision dispatcher.
        static decideAction(battler) {
            // First, see if we can use any skill
            const bestSkillDecision = this.decideBestSkillAction(battler);
            if (bestSkillDecision) {
                return bestSkillDecision;
            }

            // If no skill available or suitable, try a basic attack
            const enemy = this.findNearestEnemy(battler);
            if (enemy) {
                const enemyEv = enemy.event();
                if (PTBS_Manager.isValidAttackTarget(enemyEv.x, enemyEv.y)) {
                    return { type: "attack", target: enemy };
                }
            }

            // Otherwise, make a move toward an enemy or fall back to default pattern
            const pattern = (battler._ptbsData.ai_pattern || "").toLowerCase();
            if (pattern === "ranged_fighter") {
                return this.decideRangedAction(battler);
            } else {
                return this.decideMeleeAction(battler);
            }
        }

        static battlerAt(x, y) {
            const result = this._battlers.find(b =>
            b.currentHP() > 0 &&
            b.event().x === x &&
            b.event().y === y
            );

            return result;
        }

        // --- Skill Decision ---
        // Loop through all usable skills and evaluate candidate move positions.
        static decideBestSkillAction(battler) {

            let skills = [];

            // Get skills from either actor or enemy
            if (battler._actor) {
                skills = battler._actor.skills().filter(skill => battler._actor.canUse(skill));
            } else if (battler._enemy) {
                // For enemies, use the cached skill IDs we extracted during battler creation
                if (battler._enemySkillIds && battler._enemySkillIds.length > 0) {

                    // Convert skill IDs to actual skill objects
                    const skillObjects = battler._enemySkillIds
                    .map(id => $dataSkills[id])
                    .filter(skill => !!skill); // Ensure skill exists

                    // Filter skills that the enemy can use based on MP/TP costs
                    skills = skillObjects.filter(skill => {
                        const hasEnoughMP = battler._enemy.mp >= (skill.mpCost || 0);
                        const hasEnoughTP = battler._enemy.tp >= (skill.tpCost || 0);

                        return hasEnoughMP && hasEnoughTP;
                    });

                    // If no skills are usable after MP/TP check, but enemy has skills defined,
                    // consider allowing one skill anyway (optional - for testing)
                    if (skills.length === 0 && skillObjects.length > 0) {
                        skills = [skillObjects[0]];
                    }
                } else {
                }
            }

            if (!skills || skills.length === 0) {
                return null;
            }

            const movableTiles = PTBS_Manager.getMovableTiles(battler);
            if (!movableTiles || movableTiles.length === 0) {
                return null;
            }

            let bestDecision = null;
            let bestScore = -Infinity;

            // For each skill...
            for (const skill of skills) {

                const skillTiles = PTBS_Manager.getSkillableTiles(battler, skill);

                // Only consider movable tiles that are also within the skill's range.
                const validTiles = movableTiles.filter(tile =>
                skillTiles.some(t => t.x === tile.x && t.y === tile.y)
                );

                for (const tile of validTiles) {
                    // Get all targets in the AoE if centered at this tile.
                    const targets = PTBS_Manager.getTargetsInAOE(tile.x, tile.y, skill);

                    let validTargetCount = 0;
                    let totalEstimatedDamage = 0;

                    // Use the skill's scopeSelect if available (default to "enemies").
                    const scopeSelect = PTBS_Manager.getScopeSelectFromSkill(skill) || "enemies";

                    for (const target of targets) {
                        // Skip if target is self.
                        if (target.event() && target.event().eventId() === battler.event().eventId()) continue;

                        // Skip if target's faction equals battler's.
                        const attackerFaction = (battler._faction || "neutral").toLowerCase();
                        const targetFaction = (target._faction || "neutral").toLowerCase();

                        if (attackerFaction === targetFaction) continue;

                        // Check if target is valid for this skill's scope
                        if (PTBS_Manager.isValidTarget(battler, target, scopeSelect)) {
                            validTargetCount++;
                            const dmg = this.estimateSkillDamage(skill, battler, target);
                            let flankBonus = this.isTileFlanking(tile, target.event()) ? 5 : 0;
                            totalEstimatedDamage += (dmg + flankBonus);
                        }
                    }

                    // Calculate score based on damage potential and target count
                    const score = totalEstimatedDamage * validTargetCount;

                    // Update best decision if this is better
                    if (score > bestScore && validTargetCount > 0) {
                        bestScore = score;
                        bestDecision = {
                            type: "move_and_skill",
                            skill: skill,
                            moveTile: tile,
                            target: targets.find(t =>
                            t.event() &&
                            t.event().eventId() !== battler.event().eventId() &&
                            ((t._faction || "neutral").toLowerCase() !== (battler._faction || "neutral").toLowerCase()) &&
                            PTBS_Manager.isValidTarget(battler, t, scopeSelect)
                            )
                        };
                    }
                }
            }

            return bestDecision;
        }

        // A simple damage estimator. Replace this with your real damage formula.
        static estimateSkillDamage(skill, battler, target) {
            // Basic implementation that uses the battler's attack power
            let attackPower = 0;

            if (battler._actor) {
                attackPower = battler._actor.atk;
            } else if (battler._enemy) {
                attackPower = battler._enemy.param(2); // param(2) is Attack for enemies
            }

            // Add skill power and multiply by a factor based on skill (could be more complex)
            const skillPower = skill.damage.formula ? skill.damage.formula : 0;
            const baseDamage = attackPower + (typeof skillPower === 'number' ? skillPower : 0);

            // Multiply by a factor based on skill's properties, or use a multiplier of 1.0-2.0
            // depending on the skill's relative ID (higher ID skills tend to be stronger)
            const skillMultiplier = 1.0 + (Math.min(skill.id, 10) / 10); // Max 2.0 multiplier

            const estimatedDamage = baseDamage * skillMultiplier;

            return estimatedDamage;
        }
        // --- Melee Decision ---
        static decideMeleeAction(battler) {
            const enemy = this.findNearestEnemy(battler);
            if (!enemy) return { type: "endTurn" };

            const enemyEv = enemy.event();
            if (PTBS_Manager.isValidAttackTarget(enemyEv.x, enemyEv.y)) {
                return { type: "attack", target: enemy };
            }
            const movableTiles = PTBS_Manager.getMovableTiles(battler);
            if (movableTiles.length === 0) return { type: "endTurn" };

            const candidateTiles = movableTiles.filter(tile =>
            PTBS_Manager.isValidAttackTarget(tile.x, tile.y)
            );
            let bestTile = null;
            let bestScore = -Infinity;
            for (const tile of candidateTiles) {
                let score = - (Math.abs(tile.x - enemyEv.x) + Math.abs(tile.y - enemyEv.y));
                if (this.isTileFlanking(tile, enemyEv)) {
                    score += 10;
                }
                if (score > bestScore) {
                    bestScore = score;
                    bestTile = tile;
                }
            }
            if (bestTile) {
                return { type: "move_and_attack", target: enemy, moveTile: bestTile };
            }
            // Fallback: move closer.
            let bestTileFallback = null;
            let minDist = Infinity;
            for (const tile of movableTiles) {
                const d = Math.abs(tile.x - enemyEv.x) + Math.abs(tile.y - enemyEv.y);
                if (d < minDist) {
                    minDist = d;
                    bestTileFallback = tile;
                }
            }
            if (bestTileFallback) {
                return { type: "move", target: enemy, moveTile: bestTileFallback };
            }
            return { type: "endTurn" };
        }

        // --- Ranged Decision ---
        static decideRangedAction(battler) {
            const enemy = this.findNearestEnemy(battler);
            if (!enemy) return { type: "endTurn" };

            const enemyEv = enemy.event();
            const currentX = battler.event().x;
            const currentY = battler.event().y;
            const dx = enemyEv.x - currentX;
            const dy = enemyEv.y - currentY;
            const currentDist = Math.abs(dx) + Math.abs(dy);
            const minRange = 2;
            const maxRange = 4;

            if (
                currentDist >= minRange &&
                currentDist <= maxRange &&
                PTBS_Manager.isValidAttackTarget(enemyEv.x, enemyEv.y)
            ) {
                return { type: "attack", target: enemy };
            } else {
                const movableTiles = PTBS_Manager.getMovableTiles(battler);
                if (movableTiles.length === 0) return { type: "endTurn" };
                let bestTile = null;
                let bestScore = -Infinity;
                for (const tile of movableTiles) {
                    const tileDist = Math.abs(tile.x - enemyEv.x) + Math.abs(tile.y - enemyEv.y);
                    let score;
                    if (currentDist > maxRange) {
                        score = -tileDist;
                    } else if (currentDist < minRange) {
                        score = tileDist;
                    } else {
                        const desired = (minRange + maxRange) / 2;
                        score = -Math.abs(tileDist - desired);
                    }
                    if (score > bestScore) {
                        bestScore = score;
                        bestTile = tile;
                    }
                }
                if (bestTile) {
                    return { type: "move", target: enemy, moveTile: bestTile };
                }
            }
            return { type: "endTurn" };
        }

        // --- Helper: Flanking Check ---
        // Returns true if the candidate tile is “behind” the enemy relative to its facing.
        static isTileFlanking(tile, enemyEv) {
            const enemyDir = enemyEv.direction(); // 2: down, 4: left, 6: right, 8: up
            if (enemyDir === 2 && tile.y < enemyEv.y) return true;
            if (enemyDir === 8 && tile.y > enemyEv.y) return true;
            if (enemyDir === 4 && tile.x > enemyEv.x) return true;
            if (enemyDir === 6 && tile.x < enemyEv.x) return true;
            return false;
        }

        // --- Helper: Find the Nearest Enemy ---
        // Now explicitly skips any battler with the same event ID and the same faction.
        static findNearestEnemy(battler) {
            const myFaction = (battler._faction || "neutral").toLowerCase();
            let nearest = null;
            let minDist = Infinity;
            for (const other of PTBS_Manager._battlers) {
                if (other === battler) continue;
                if (!other.event() || !battler.event()) continue;
                if (other.event().eventId() === battler.event().eventId()) continue;
                if (other.currentHP() <= 0) continue;
                const otherFaction = (other._faction || "neutral").toLowerCase();
                if (otherFaction === myFaction) continue;
                const dx = other.event().x - battler.event().x;
                const dy = other.event().y - battler.event().y;
                const d = Math.abs(dx) + Math.abs(dy);
                if (d < minDist) {
                    minDist = d;
                    nearest = other;
                }
            }
            return nearest;
        }

        // --- Action Execution ---
        // Issues commands based on the decision.
        // (Note: In a production system you should replace setTimeout with callbacks tied to movement completion.)
        // In PTBS_AI class
        static performAction(battler) {
            const decision = this.decideAction(battler);

            switch (decision.type) {
                case "move_and_skill": {
                    // First position cursor at movement destination
                    if (SceneManager._scene && SceneManager._scene.cursorSet) {
                        SceneManager._scene.cursorSet(decision.moveTile.x, decision.moveTile.y);
                        // Force camera to follow cursor
                        SceneManager._scene.centerCameraOnCursor();
                    }

                    // Attempt the move
                    PTBS_Manager.attemptMoveTo(decision.moveTile.x, decision.moveTile.y);

                    // Use a timer with a delay to ensure movement completes before skill use
                    setTimeout(() => {
                        if (decision.skill) {
                            let action;
                            if (battler._actor) {
                                action = new Game_Action(battler._actor);
                            } else if (battler._enemy) {
                                action = new Game_Action(battler._enemy);
                            }

                            action.setSkill(decision.skill.id);

                            // Position cursor at target before using skill
                            if (decision.target && SceneManager._scene && SceneManager._scene.cursorSet) {
                                SceneManager._scene.cursorSet(decision.target.event().x, decision.target.event().y);
                                // Force camera to follow cursor
                                SceneManager._scene.centerCameraOnCursor();
                            }

                            PTBS_Manager.attemptAction(
                                battler,
                                action,
                                decision.target.event().x,
                                                       decision.target.event().y
                            );
                        }
                    }, 1000);
                    break;
                }

                case "move_and_attack": {
                    // Position cursor at movement destination
                    if (SceneManager._scene && SceneManager._scene.cursorSet) {
                        SceneManager._scene.cursorSet(decision.moveTile.x, decision.moveTile.y);
                        // Force camera to follow cursor
                        SceneManager._scene.centerCameraOnCursor();
                    }

                    PTBS_Manager.attemptMoveTo(decision.moveTile.x, decision.moveTile.y);

                    setTimeout(() => {
                        let action;
                        if (battler._actor) {
                            action = new Game_Action(battler._actor);
                        } else if (battler._enemy) {
                            action = new Game_Action(battler._enemy);
                        }

                        action.setSkill(1); // default attack skill

                        // Position cursor at target before attacking
                        if (decision.target && SceneManager._scene && SceneManager._scene.cursorSet) {
                            SceneManager._scene.cursorSet(decision.target.event().x, decision.target.event().y);
                            // Force camera to follow cursor
                            SceneManager._scene.centerCameraOnCursor();
                        }

                        PTBS_Manager.attemptAction(
                            battler,
                            action,
                            decision.target.event().x,
                                                   decision.target.event().y
                        );
                    }, 1000);
                    break;
                }

                case "attack": {
                    let action;
                    if (battler._actor) {
                        action = new Game_Action(battler._actor);
                    } else if (battler._enemy) {
                        action = new Game_Action(battler._enemy);
                    }

                    action.setSkill(1);

                    // Position cursor at target
                    if (decision.target && SceneManager._scene && SceneManager._scene.cursorSet) {
                        SceneManager._scene.cursorSet(decision.target.event().x, decision.target.event().y);
                        // Force camera to follow cursor
                        SceneManager._scene.centerCameraOnCursor();
                    }

                    PTBS_Manager.attemptAction(
                        battler,
                        action,
                        decision.target.event().x,
                                               decision.target.event().y
                    );
                    break;
                }

                case "move": {
                    // Position cursor at movement destination
                    if (decision.moveTile && SceneManager._scene && SceneManager._scene.cursorSet) {
                        SceneManager._scene.cursorSet(decision.moveTile.x, decision.moveTile.y);
                        // Force camera to follow cursor
                        SceneManager._scene.centerCameraOnCursor();
                    }

                    PTBS_Manager.attemptMoveTo(decision.moveTile.x, decision.moveTile.y);

                    setTimeout(() => {
                        PTBS_Manager.endCurrentTurn();
                    }, 1000);
                    break;
                }

                default: {
                    PTBS_Manager.endCurrentTurn();
                    break;
                }
            }
        }
    }

    // readItemAPModifier function here
    function readItemAPModifier(note) {
        const blockMatch = note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
        if (!blockMatch) return 0;

        const inner = blockMatch[1];
        const apRegex = /ap\s*:\s*([+-]\d+)/i;
        const match = inner.match(apRegex);
        if (match) {
            return Number(match[1]) || 0;
        }
        return 0;
    }

    // A small helper that looks for "looping_animation: NUMBER" inside a <PTBS> block
    function parseLoopingAnimationId(note) {
        if (!note) return 0;

        const blockMatch = note.match(/<PTBS>([\s\S]*?)<\/PTBS>/i);
        if (!blockMatch) return 0;

        const inner = blockMatch[1];
        // Look for "loop_animation: 123" or "looping_animation: 123"
        const animMatch = inner.match(/loop(?:ing)?_animation\s*:\s*(\d+)/i);
        if (animMatch) {
            return Number(animMatch[1]) || 0;
        }
        return 0;
    }


    // -----------------------------------------------------------------------------
    // Projectile Manager for PTBS
    // -----------------------------------------------------------------------------
    class PTBS_ProjectileManager {
        static initialize() {
            this._projectiles = [];
            this._activeProjectile = null;
            this._projectileSprite = null;
            this._completionCallback = null;
        }

        static update() {
            // If a projectile is currently “in flight,” update it each frame
            if (this._activeProjectile) {
                this._activeProjectile.update();
                if (this._activeProjectile.isComplete()) {
                    // Once it’s complete, call the onComplete callback
                    if (this._completionCallback) {
                        this._completionCallback();
                    }
                    this._activeProjectile.destroy();
                    this._activeProjectile = null;
                    this._completionCallback = null;
                }
            }
        }

        /* Create the projectile and store callback to run once it finishes
         * @param {object} params - projectile config from <PTBS_Projectile> note
         * @param {object} startPos - {x, y} in map-coordinates
         * @param {object} targetPos - {x, y} in map-coordinates
         * @param {function} onComplete - callback after it lands
         */
        static createProjectile(params, startPos, targetPos, onComplete) {
            this._activeProjectile = new PTBS_Projectile(params, startPos, targetPos);
            this._completionCallback = onComplete;
        }

        /* Parse <PTBS_Projectile: before> ... </PTBS_Projectile> note data
         */
        static parseProjectileData(noteTag) {
            const data = {
                timing: "before",
                image: "",
                imageIsIcon: false,  // <--- we’ll fill this in below
                duration: 15,
                se: "",
                arc: 0,
                spin: 0,
                startOffset: { x: 0, y: 0 },
                angleOffset: 0       // <--- default 0
            };

            const match = noteTag.match(/<PTBS_Projectile:\s*(\w+)>([\s\S]*?)<\/PTBS_Projectile>/i);
            if (!match) return data;

            data.timing = match[1].toLowerCase();
            const body = match[2];

            const imageMatch = body.match(/image:\s*([^\r\n]+)/i);
            if (imageMatch) {
                data.image = imageMatch[1].trim();
                // If it starts with "icon ", we treat it as an icon:
                if (/^icon\s+\d+/i.test(data.image)) {
                    data.imageIsIcon = true;
                    // We want to fix icons by e.g. -45 degrees so that
                    // code’s “0 deg” effectively becomes their up-left look, etc.
                    data.angleOffset = -45;
                    // (Adjust +45 or -45 to match exactly how your icons are drawn.)
                } else {
                    data.imageIsIcon = false;
                    // For pictures, keep angleOffset = 0
                    // so “0 deg” in code lines up with “up” in the artwork
                    data.angleOffset = 90;
                }
            }

            const durationMatch = body.match(/duration:\s*(\d+)/i);
            if (durationMatch) {
                data.duration = parseInt(durationMatch[1]);
            }

            const seMatch = body.match(/se:\s*([^\r\n]+)/i);
            if (seMatch) {
                data.se = seMatch[1].trim();
            }

            const arcMatch = body.match(/arc:\s*(\d+)/i);
            if (arcMatch) {
                data.arc = parseInt(arcMatch[1]);
            }

            const spinMatch = body.match(/spin:\s*(\d+)/i);
            if (spinMatch) {
                data.spin = parseInt(spinMatch[1]);
            }

            const startMatch = body.match(/start:\s*([-\d.]+)\s*,\s*([-\d.]+)/i);
            if (startMatch) {
                data.startOffset.x = parseFloat(startMatch[1]);
                data.startOffset.y = parseFloat(startMatch[2]);
            }

            return data;
        }
    }


    // -----------------------------------------------------------------------------
    // PTBS_Projectile
    // -----------------------------------------------------------------------------
    // 1. Update the PTBS_Projectile class sprite setup:
    // Add this complete PTBS_Projectile class implementation:
    class PTBS_Projectile {

        constructor(params, startPos, targetPos) {
            this._params = params;
            this._startPos = { ...startPos };
            this._targetPos = { ...targetPos };
            this._currentPos = { ...startPos };
            this._progress = 0;
            this._sprite = null;
            this._duration = params.duration || 15;
            this._hasPlayedSE = false;

            // Store the baseAngle from the user's facing direction
            this._baseAngle = params.initialAngle || 0;

            // If you also want the projectile to spin each frame, store spin:
            this._spin = params.spin || 0;

            // We'll keep a running "rotation" in degrees
            this._rotationSoFar = 0;

            // Important: Apply correct rotation immediately
            this._initialRotationApplied = false;

            this.setupSprite();
        }

        setupSprite() {
            this._sprite = new Sprite();

            // 1) If the projectile uses an icon
            if (this._params.image.toLowerCase().startsWith("icon ")) {
                const iconString = this._params.image;  // e.g. "icon 64"
                const parts = iconString.split(" ");
                const iconId = Number(parts[1]) || 0;
                const iconset = ImageManager.loadSystem("IconSet");

                iconset.addLoadListener(() => {
                    this._sprite.bitmap = iconset;
                    const sx = (iconId % 16) * 32;
                    const sy = Math.floor(iconId / 16) * 32;
                    this._sprite.setFrame(sx, sy, 32, 32);
                    this._sprite.anchor.set(0.5, 0.5);

                    // Apply initial rotation immediately once the bitmap is loaded
                    this._sprite.rotation = this._baseAngle * (Math.PI / 180);
                    this._initialRotationApplied = true;

                    this.updateSpritePosition();
                });
            } else {
                // 2) Otherwise, treat `image:` as a filename in some folder.
                //    For example, let's load from img/pictures.
                const filename = this._params.image;
                const bitmap = ImageManager.loadPicture(filename);

                bitmap.addLoadListener(() => {
                    this._sprite.bitmap = bitmap;
                    this._sprite.anchor.set(0.5, 0.5);

                    // Apply initial rotation immediately once the bitmap is loaded
                    this._sprite.rotation = this._baseAngle * (Math.PI / 180);
                    this._initialRotationApplied = true;

                    this.updateSpritePosition();
                });
            }

            const tilemap = SceneManager._scene?._spriteset?._tilemap;
            if (tilemap) {
                tilemap.addChild(this._sprite);
            }
        }

        update() {
            if (!this._hasPlayedSE && this._params.se) {
                AudioManager.playSe({ name: this._params.se, volume:90, pitch:100, pan:0 });
                this._hasPlayedSE = true;
            }

            // If we haven't applied initial rotation yet (bitmap might not be loaded)
            // and the sprite exists, try to apply it now
            if (!this._initialRotationApplied && this._sprite && this._sprite.bitmap) {
                this._sprite.rotation = this._baseAngle * (Math.PI / 180);
                this._initialRotationApplied = true;
            }

            // 1) Progress from 0..duration
            this._progress = Math.min(this._progress + 1, this._duration);
            const t = this._progress / this._duration;

            // 2) Interpolate position
            const dx = this._targetPos.x - this._startPos.x;
            const dy = this._targetPos.y - this._startPos.y;
            this._currentPos.x = this._startPos.x + dx * t;
            this._currentPos.y = this._startPos.y + dy * t;

            // Optionally apply arc
            let arcOffset = 0;
            if (this._params.arc > 0) {
                arcOffset = this._params.arc * Math.sin(Math.PI * t);
            }
            this._currentPos.y -= arcOffset;

            // 3) Rotation - but only apply additional spin if initial rotation worked
            if (this._initialRotationApplied) {
                this._rotationSoFar += (this._params.spin || 0);
                const rotationDeg = this._baseAngle + this._rotationSoFar;
                this._sprite.rotation = rotationDeg * (Math.PI / 180);
            }

            // 4) Update sprite position on-screen
            this.updateSpritePosition();

            if (this._progress >= this._duration) {
                // end of flight
                if (this._onComplete) this._onComplete();
                this.destroy();
            }
        }



        updateSpritePosition() {
            if (!this._sprite) return;

            // Convert tile coords to screen coords
            const tw = $gameMap.tileWidth();
            const th = $gameMap.tileHeight();
            const scrollX = $gameMap.displayX() * tw;
            const scrollY = $gameMap.displayY() * th;

            const screenX = this._currentPos.x * tw - scrollX;
            const screenY = this._currentPos.y * th - scrollY;

            this._sprite.x = screenX;
            this._sprite.y = screenY;
        }

        isComplete() {
            return this._progress >= this._duration;
        }

        destroy() {
            if (this._sprite && this._sprite.parent) {
                this._sprite.parent.removeChild(this._sprite);
                this._sprite = null;
            }
        }
    }
    //----------------------------------------------------------------------------
    // Scene_Map: Overridden parts for PTBS UI, grid, skill usage, item usage
    //----------------------------------------------------------------------------

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        this._ptbsSkillWindowCreated = false;

        // Create an empty array for popups
        this._damagePopups = [];
        // Show PTBS Windows *after* everything else is initialized.
        if (PTBS_Manager.isActive()) {

            //Create the windows.
            this.createPTBSStatusWindow();
            this.createPTBSCommandWindow();
            this.createPTBSHoverWindow();
            this.createPTBSTurnOrderWindow();
            this.createPTBSGridSprite();
            this.createPTBSPathPreview();
            this.createPTBSCursor();
            this.createPTBSAttackGridSprite();
            this.createPTBSSkillGridSprite();
            this.createPTBSItemGridSprite();
            this.createPTBSAoeGridSprite();
            this.createPTBSSkillWindow();
            this.createPTBSItemHelpWindow();
            this.createPTBSItemWindow();
            //  this.showPTBSWindows();
        }
    };

    Scene_Map.prototype.hidePTBSWindows = function() {
        // Set a flag so we know UI is hidden
        this._ptbsUIManuallyHidden = true;

        // Just change opacity of all windows without modifying their state
        const windowList = [
            this._ptbsStatusWindow,
            this._ptbsCommandWindow,
            this._ptbsTurnOrderWindow,
            this._ptbsSkillWindow,
            this._ptbsItemWindow,
            this._ptbsHoverWindow,
            this._ptbsSkillHelpWindow,
            this._ptbsItemHelpWindow
        ];

        // Hide all windows by setting opacity to 0
        for (const window of windowList) {
            if (window) {
                window._invisibleBackup = {
                    visible: window.visible,
                    opacity: window.opacity,
                    contentsOpacity: window.contentsOpacity,
                    backOpacity: window.backOpacity
                };

                window.opacity = 0;
                window.contentsOpacity = 0;
                window.backOpacity = 0;
            }
        }

        // Hide grids by setting opacity to 0
        const gridList = [
            this._ptbsGridSprite,
            this._ptbsAttackGridSprite,
            this._ptbsSkillGridSprite,
            this._ptbsItemGridSprite,
            this._ptbsAoeGridSprite,
            this._cursor
        ];

        for (const grid of gridList) {
            if (grid) {
                grid._backupOpacity = grid.opacity;
                grid.opacity = 0;
            }
        }

    };

    Scene_Map.prototype.showPTBSWindows = function() {
        // Clear the hidden flag
        this._ptbsUIManuallyHidden = false;

        // Restore window opacities
        const windowList = [
            this._ptbsStatusWindow,
            this._ptbsCommandWindow,
            this._ptbsTurnOrderWindow,
            this._ptbsSkillWindow,
            this._ptbsItemWindow,
            this._ptbsHoverWindow,
            this._ptbsSkillHelpWindow,
            this._ptbsItemHelpWindow
        ];

        for (const window of windowList) {
            if (window) {
                if (window._invisibleBackup) {
                    window.opacity = window._invisibleBackup.opacity;
                    window.contentsOpacity = window._invisibleBackup.contentsOpacity;
                    window.backOpacity = window._invisibleBackup.backOpacity;
                    window._invisibleBackup = null;
                } else {
                    // Default values if no backup
                    window.opacity = 255;
                    window.contentsOpacity = 255;
                    window.backOpacity = 192;
                }
            }
        }

        // Restore grid opacities
        const gridList = [
            this._ptbsGridSprite,
            this._ptbsAttackGridSprite,
            this._ptbsSkillGridSprite,
            this._ptbsItemGridSprite,
            this._ptbsAoeGridSprite,
            this._cursor
        ];

        for (const grid of gridList) {
            if (grid) {
                if (grid._backupOpacity !== undefined) {
                    grid.opacity = grid._backupOpacity;
                    grid._backupOpacity = undefined;
                } else {
                    grid.opacity = 255;
                }
            }
        }

    };


    Scene_Map.prototype.showPTBSWindows = function() {
        // Clear the hidden flag
        this._ptbsUIManuallyHidden = false;

        // Restore window opacities
        const windowList = [
            this._ptbsStatusWindow,
            this._ptbsCommandWindow,
            this._ptbsTurnOrderWindow,
            this._ptbsSkillWindow,
            this._ptbsItemWindow,
            this._ptbsHoverWindow,
            this._ptbsSkillHelpWindow,
            this._ptbsItemHelpWindow
        ];

        for (const window of windowList) {
            if (window) {
                if (window._invisibleBackup) {
                    window.opacity = window._invisibleBackup.opacity;
                    window.contentsOpacity = window._invisibleBackup.contentsOpacity;
                    window.backOpacity = window._invisibleBackup.backOpacity;
                    window._invisibleBackup = null;
                } else {
                    // Default values if no backup
                    window.opacity = 255;
                    window.contentsOpacity = 255;
                    window.backOpacity = 192;
                }
            }
        }

        // Restore grid opacities
        const gridList = [
            this._ptbsGridSprite,
            this._ptbsAttackGridSprite,
            this._ptbsSkillGridSprite,
            this._ptbsItemGridSprite,
            this._ptbsAoeGridSprite,
            this._cursor
        ];

        for (const grid of gridList) {
            if (grid) {
                if (grid._backupOpacity !== undefined) {
                    grid.opacity = grid._backupOpacity;
                    grid._backupOpacity = undefined;
                } else {
                    grid.opacity = 255;
                }
            }
        }

    };

    // [ITEM STUFF] Create the PTBSAoeGridSprite (already in code):
    Scene_Map.prototype.createPTBSAoeGridSprite = function() {
        this._ptbsAoeGridSprite = new Sprite();
        this._spriteset._tilemap.addChild(this._ptbsAoeGridSprite);
    };
    Scene_Map.prototype.refreshPTBSAoeGrid = function() {
        // Clear existing AoE sprites
        this._ptbsAoeGridSprite.removeChildren();

        // Only show AoE overlay if in "skill" or "item" mode with a valid action
        const st = PTBS_Manager.state();
        const skillAction = PTBS_Manager._skillAction;
        const itemAction = PTBS_Manager._itemAction;
        if (st !== "skill" && st !== "item") return;

        let action = null;
        if (st === "skill" && skillAction) action = skillAction;
        else if (st === "item" && itemAction) action = itemAction;
        if (!action) return;

        const b = PTBS_Manager.selectedBattler();
        if (!b) return;

        // Get selectable tiles for scope
        let tileList = [];
        if (st === "skill") {
            tileList = PTBS_Manager.getSkillableTiles(b, action.item());
        } else {
            tileList = PTBS_Manager.getItemableTiles(b, action.item());
        }

        const cx = this._cursorX;
        const cy = this._cursorY;

        // If cursor isn’t on a valid tile, don’t show AoE
        if (!tileList.some(t => t.x === cx && t.y === cy)) return;

        // Rotate battler to face the selected tile
        const dx = cx - b.event().x;
        const dy = cy - b.event().y;
        let direction;
        if (Math.abs(dx) > Math.abs(dy)) {
            direction = dx > 0 ? 6 : 4; // Right or Left
        } else {
            direction = dy > 0 ? 2 : 8; // Down or Up
        }
        b.event().setDirection(direction);

        // Generate and display AoE tiles
        const aoeTiles = PTBS_Manager.getAOERange(action.item(), cx, cy);
        const fillColor = "rgba(255,255,0,0.5)"; // Yellow for AoE
        const tw = $gameMap.tileWidth();
        const th = $gameMap.tileHeight();

        if (!this._aoeTileBitmap) {
            this._aoeTileBitmap = new Bitmap(tw, th);
        }
        this._aoeTileBitmap.clear();
        this._aoeTileBitmap.fillRect(0, 0, tw, th, fillColor);

        for (const tile of aoeTiles) {
            const s = new Sprite(this._aoeTileBitmap);
            s.x = tile.x * tw;
            s.y = tile.y * th;
            this._ptbsAoeGridSprite.addChild(s);
        }
    };


    Scene_Map.prototype.createPTBSHoverWindow = function() {
        const w = 250;
        const h = 150;
        const x = Graphics.width - w - 10;
        const y = Graphics.height - h - 10;
        const rect = new Rectangle(x, y, w, h);
        this._ptbsHoverWindow = new PTBS_HoverWindow(rect);
        this.addWindow(this._ptbsHoverWindow);
        this._ptbsHoverWindow.hide();
    };

    Scene_Map.prototype.createPTBSTurnOrderWindow = function() {
        const sw = Graphics.width;
        const rect = new Rectangle(sw - 60, 0, 60, 300);
        this._ptbsTurnOrderWindow = new PTBS_TurnOrderBoxWindow(rect);
        this.addWindow(this._ptbsTurnOrderWindow);
    };

    Scene_Map.prototype.centerCameraOnBattler = function(battler) {
        const tx = battler.event().x;
        const ty = battler.event().y;
        const halfW = $gameMap.screenTileX() / 2;
        const halfH = $gameMap.screenTileY() / 2;

        let targetX = tx - halfW;
        let targetY = ty - halfH;
        targetX = Math.max(0, Math.min(targetX, $gameMap.width()  - $gameMap.screenTileX()));
        targetY = Math.max(0, Math.min(targetY, $gameMap.height() - $gameMap.screenTileY()));
        this._cameraTargetX = targetX;
        this._cameraTargetY = targetY;
    };

    Scene_Map.prototype.centerCameraOnCursor = function(immediate = false) {
        if (!this._cursor) return;

        const tx = this._cursorX;
        const ty = this._cursorY;
        const halfW = $gameMap.screenTileX() / 2;
        const halfH = $gameMap.screenTileY() / 2;

        let targetX = tx - halfW;
        let targetY = ty - halfH;
        targetX = Math.max(0, Math.min(targetX, $gameMap.width() - $gameMap.screenTileX()));
        targetY = Math.max(0, Math.min(targetY, $gameMap.height() - $gameMap.screenTileY()));

        this._cameraTargetX = targetX;
        this._cameraTargetY = targetY;

        // If immediate is true, set position directly
        if (immediate) {
            $gameMap.setDisplayPos(targetX, targetY);
        }
    };


    Scene_Map.prototype.updateCamera = function() {
        // Don't update camera if PTBS is not active
        if (!PTBS_Manager.isActive()) return;

        // Let PTBS_Manager handle all camera control
        // We're not using this method anymore to avoid conflicts
    };

        Scene_Map.prototype.createPTBSStatusWindow = function() {
            const w = 250;
            const h = 150;
            const x = 10;
            const y = Graphics.height - h - 10;
            const rect = new Rectangle(x, y, w, h);
            this._ptbsStatusWindow = new PTBS_StatusWindow(rect);
            this.addWindow(this._ptbsStatusWindow);
            this._ptbsStatusWindow.hide();
        };

        // Modify Scene_Map's spawnSkillPopup to handle estimated command code width
        Scene_Map.prototype.spawnSkillPopup = function(battler, action) {
            let displayName;

            if (action.isAttack()) {
                // Handle default attack - check if there's a weapon equipped
                if (battler._actor) {
                    const weapon = battler._actor.weapons()[0];
                    // Add a proper fallback when no weapon is equipped
                    displayName = weapon ?
                    "\\i[" + weapon.iconIndex + "]" + weapon.name :
                    "\\i[76]Attack"; // Use a default attack icon (76 or whatever icon you prefer)
                } else {
                    displayName = "\\i[76]Attack"; // For enemies
                }
            } else {
                // Handle skills and items as before
                const item = action.item();
                displayName = "\\i[" + item.iconIndex + "]" + item.name;
            }

            const ev = battler.event();

            // Rest of the existing popup creation code...
            const tempWindow = new Window_Base(new Rectangle(0, 0, 1000, 1000));
            const textSize = tempWindow.textSizeEx(displayName);
            tempWindow.destroy();

            const windowWidth = Math.max(textSize.width + 48, 120);
            const windowHeight = Math.max(textSize.height + 32, 48);

            const x = ev.screenX() - (windowWidth / 2);
            const y = ev.screenY() - 120;

            const popup = new Window_SkillPopup(x, y, windowWidth, windowHeight);
            popup.setSkillName(displayName);

            const popupData = {
                window: popup,
                dx: 0,
                dy: -0.5,
                age: 0,
                maxAge: 60
            };

            this.addChild(popup);

            if (!this._skillPopups) {
                this._skillPopups = [];
            }
            this._skillPopups.push(popupData);
        };


        // Add a method to update the skill popups
        Scene_Map.prototype.updateSkillPopups = function() {
            if (!this._skillPopups) return;

            for (const popup of this._skillPopups) {
                popup.age++;

                // Move window
                popup.window.x += popup.dx;
                popup.window.y += popup.dy;

                // Fade out near the end
                if (popup.age > popup.maxAge - 15) {
                    const fadeRatio = (popup.maxAge - popup.age) / 15;
                    popup.window.opacity = 255 * fadeRatio;
                    popup.window.contentsOpacity = 255 * fadeRatio;
                    popup.window.backOpacity = 192 * fadeRatio;
                }
            }

            // Remove completed popups - fixed removal method
            this._skillPopups = this._skillPopups.filter(p => {
                if (p.age >= p.maxAge) {
                    if (p.window.parent) {
                        p.window.parent.removeChild(p.window);
                    }
                    return false;
                }
                return true;
            });
        };


        // PTBS_SkillWindow
        class PTBS_SkillWindow extends Window_Selectable {
            initialize(rect) {
                this._lastRefreshTime = 0;
                super.initialize(rect);
                this._actor = null;
                this._enemy = null;
                this._data = [];
                this._needsListUpdate = true;
                this.openness = 0;
                this._helpWindow = null;
                // Set a smaller base font size for the entire window
                this.contents.fontSize = 18; // Reduced from default
            }

            markListForUpdate() {
                this._needsListUpdate = true;
            }

            setHelpWindow(helpWindow) {
                this._helpWindow = helpWindow;
            }

            select(index) {
                if (index === this._index) return;
                if (index === -1) {
                    this.deselect();
                    return;
                }
                super.select(index);
                this.updateHelp();
            }

            deselect() {
                this._index = -1;
                this._stayCount = 0;
                this.refresh();
                if (this._helpWindow) {
                    this._helpWindow.clear();
                }
            }

            updateHelp() {
                if (this._helpWindow) {
                    const skill = this.item();
                    if (skill) {
                        this._helpWindow.show();
                        this._helpWindow.setText(skill.description || "No description available");
                    }
                }
            }

            maxCols() {
                return 2;
            }

            numVisibleRows() {
                return 3;
            }

            isEnabled(skill) {
                if (!skill) return false;
                if (this._actor) {
                    return this._actor.canPaySkillCost(skill);
                } else if (this._enemy) {
                    return true;
                }
                return false;
            }

            setActor(actor) {
                if (this._actor !== actor) {
                    this._actor = actor;
                    this._enemy = null;
                    this.markListForUpdate();
                    this.refresh();
                }
            }

            setEnemy(enemy) {
                if (this._enemy !== enemy) {
                    this._actor = null;
                    this._enemy = enemy;
                    this.markListForUpdate();
                    this.refresh();
                }
            }

            maxItems() {
                return this._data ? this._data.length : 0;
            }

            item() {
                const result = this._data && this.index() >= 0 ? this._data[this.index()] : null;
                return result;
            }

            makeItemList() {
                if (this._actor) {
                    let skills = this._actor.skills();

                    if (this._actor.currentClass()) {
                        const classSkills = this._actor.currentClass().learnings.map(learning => {
                            if (this._actor.level >= learning.level) {
                                return $dataSkills[learning.skillId];
                            }
                            return null;
                        }).filter(skill => skill !== null);

                        skills = [...new Set([...skills, ...classSkills])];
                    }

                    this._data = skills.filter(skill => skill && skill.id !== 1);
                } else if (this._enemy) {
                    const battler = PTBS_Manager.selectedBattler();
                    if (battler && battler._enemySkillIds) {
                        this._data = battler._enemySkillIds
                        .map(id => $dataSkills[id])
                        .filter(s => !!s && s.id !== 1);
                    } else {
                        this._data = [];
                    }
                } else {
                    this._data = [];
                }

                this._needsListUpdate = false;
            }

            refresh() {
                const currentTime = Date.now();
                if (currentTime - this._lastRefreshTime < 100) return;
                this._lastRefreshTime = currentTime;

                const oldIndex = this.index();

                if (this._needsListUpdate) {
                    this.makeItemList();
                }

                this.createContents();
                super.refresh();

                if (oldIndex >= 0 && oldIndex < this._data.length) {
                    this.select(oldIndex);
                }
            }

            activate() {
                this._active = true;
                super.activate();
            }

            deactivate() {
                this._active = false;
                super.deactivate();
            }

            drawItem(index) {
                const skill = this._data[index];
                if (!skill) return;

                const rect = this.itemLineRect(index);
                const enabled = this.isEnabled(skill);

                const originalFontSize = this.contents.fontSize;

                // Allocate more space for cost text
                const costWidth = 120;
                const nameWidth = rect.width - costWidth - ImageManager.iconWidth - 4;

                const skillNameWidth = this.textWidth(skill.name);
                if (skillNameWidth > nameWidth) {
                    const scaleFactor = nameWidth / skillNameWidth;
                    this.contents.fontSize = Math.max(14, Math.floor(originalFontSize * scaleFactor));
                }

                this.changePaintOpacity(enabled);

                this.drawIcon(skill.iconIndex, rect.x, rect.y + 2);

                this.drawText(
                    skill.name,
                    rect.x + ImageManager.iconWidth + 4,
                    rect.y,
                    nameWidth,
                    'left'
                );

                this.changePaintOpacity(true);

                // Handle cost display with proper spacing and colors
                if (this._actor) {
                    this.contents.fontSize = 14;

                    // Get database terms
                    const mpTerm = TextManager.mpA;
                    const tpTerm = TextManager.tpA;

                    const hasMpCost = skill.mpCost > 0;
                    const hasTpCost = skill.tpCost > 0;

                    if (hasMpCost && hasTpCost) {
                        // Both MP and TP costs - draw them side by side with spacing
                        const totalCostWidth = costWidth - 5; // Reserve space for padding
                        const mpTextWidth = Math.floor(totalCostWidth * 0.5);
                        const tpTextWidth = totalCostWidth - mpTextWidth;

                        // Draw MP cost
                        if (this._actor.mp >= skill.mpCost) {
                            this.changeTextColor(ColorManager.mpCostColor());
                        } else {
                            this.changeTextColor(ColorManager.deathColor());
                        }

                        this.drawText(
                            `${skill.mpCost} ${mpTerm}`,
                            rect.x + rect.width - costWidth,
                            rect.y,
                            mpTextWidth,
                            'left'
                        );

                        // Draw TP cost
                        if (this._actor.tp >= skill.tpCost) {
                            // Use proper green color for TP
                            this.changeTextColor(ColorManager.tpCostColor());
                        } else {
                            this.changeTextColor(ColorManager.deathColor());
                        }

                        this.drawText(
                            `${skill.tpCost} ${tpTerm}`,
                            rect.x + rect.width - costWidth + mpTextWidth + 5, // Add spacing
                            rect.y,
                            tpTextWidth,
                            'left'
                        );
                    } else if (hasMpCost) {
                        // MP cost only
                        if (this._actor.mp >= skill.mpCost) {
                            this.changeTextColor(ColorManager.mpCostColor());
                        } else {
                            this.changeTextColor(ColorManager.deathColor());
                        }

                        this.drawText(
                            `${skill.mpCost} ${mpTerm}`,
                            rect.x + rect.width - costWidth,
                            rect.y,
                            costWidth,
                            'right'
                        );
                    } else if (hasTpCost) {
                        // TP cost only
                        if (this._actor.tp >= skill.tpCost) {
                            this.changeTextColor(ColorManager.tpCostColor());
                        } else {
                            this.changeTextColor(ColorManager.deathColor());
                        }

                        this.drawText(
                            `${skill.tpCost} ${tpTerm}`,
                            rect.x + rect.width - costWidth,
                            rect.y,
                            costWidth,
                            'right'
                        );
                    }

                    this.resetTextColor();
                }

                this.contents.fontSize = originalFontSize;
            }

            meetsResourceRequirements(skill) {
                if (!this._actor || !skill) return false;

                const hasSufficientMP = skill.mpCost <= this._actor.mp;
                const hasSufficientTP = skill.tpCost <= this._actor.tp;

                return hasSufficientMP && hasSufficientTP;
            }

            isOkEnabled() {
                const skill = this.item();
                return skill && this.isEnabled(skill);
            }
        }

        Scene_Map.prototype.createPTBSSkillWindow = function() {

            if (this._ptbsSkillWindowCreated) return; // Check the flag
            this._ptbsSkillWindowCreated = true; // Set the flag


            // Create help window first
            this.createPTBSSkillHelpWindow();

            const ww = 720;
            const wh = 150;
            const wx = (Graphics.width - ww) / 2;
            const wy = Graphics.height - wh - 10;
            const rect = new Rectangle(wx, wy, ww, wh);

            this._ptbsSkillWindow = new PTBS_SkillWindow(rect);

            this._ptbsSkillWindow.setHelpWindow(this._ptbsSkillHelpWindow);

            // Make sure we have the handler methods first
            const okHandler = this.onPTBSSkillOk ? this.onPTBSSkillOk.bind(this) : null;
            const cancelHandler = this.onPTBSSkillCancel ? this.onPTBSSkillCancel.bind(this) : null;

            // Only set handlers if they exist
            if (okHandler) {
                this._ptbsSkillWindow.setHandler("ok", okHandler);
            }
            if (cancelHandler) {
                this._ptbsSkillWindow.setHandler("cancel", cancelHandler);
            }

            this.addWindow(this._ptbsSkillWindow);
        };


        Scene_Map.prototype.createPTBSSkillHelpWindow = function() {
            const width = 1260;
            const height = 100;
            const x = (Graphics.width - width) / 2;
            const y = Graphics.height - height - 170;
            const rect = new Rectangle(x, y, width, height);

            this._ptbsSkillHelpWindow = new Window_Help(rect);
            this._ptbsSkillHelpWindow._id = "MAIN_HELP"; // Add ID for tracking
            this._ptbsSkillHelpWindow.hide();
            this.addWindow(this._ptbsSkillHelpWindow);
        };

        Scene_Map.prototype.onPTBSSkill = function() {
            // Store that we're in skill selection mode
            this._inSkillSelection = true;

            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();

            // Show help window
            if (this._ptbsSkillHelpWindow) {
                this._ptbsSkillHelpWindow.show();
            }

            // Clear ALL targeting grids and reset PTBS actions
            this.clearAllTargetingGrids();
            PTBS_Manager._skillAction = null;
            PTBS_Manager._itemAction = null;

            const battler = PTBS_Manager.selectedBattler();
            if (!battler) return;

            // Prepare skill window and explicitly mark list for update
            if (battler._actor) {
                this._ptbsSkillWindow.setActor(battler._actor);
            } else if (battler._enemy) {
                this._ptbsSkillWindow.setEnemy(battler._enemy);
            }

            // Force list update before opening
            this._ptbsSkillWindow.markListForUpdate();
            this._ptbsSkillWindow.refresh();
            this._ptbsSkillWindow.open();
            this._ptbsSkillWindow.activate();
            this._ptbsSkillWindow.select(0);

            // Important: Set PTBS state
            PTBS_Manager._state = "skill";
        };


        Scene_Map.prototype.onPTBSSkillOk = function() {
            const skill = this._ptbsSkillWindow.item();

            // Clear skill selection mode
            this._inSkillSelection = false;

            this._ptbsSkillWindow.close();
            this._ptbsSkillWindow.deactivate();
            this._ptbsSkillHelpWindow.hide();

            if (skill && this._ptbsSkillWindow.isEnabled(skill)) {
                const user = PTBS_Manager.selectedBattler();
                let action;
                if (user._actor) {
                    action = new Game_Action(user._actor);
                } else if (user._enemy) {
                    action = new Game_Action(user._enemy);
                }
                action.setSkill(skill.id);

                PTBS_Manager.startSkillSelection(action);
                this.refreshPTBSSkillGrid();
            }
        };

        // Update onPTBSSkillCancel to use our new helper:
        Scene_Map.prototype.onPTBSSkillCancel = function() {
            this._inSkillSelection = false;

            // Store current cursor position before closing windows
            const cursorX = this._cursorX;
            const cursorY = this._cursorY;

            // Clear windows
            this._ptbsSkillWindow.close();
            this._ptbsSkillWindow.deactivate();
            this._ptbsSkillHelpWindow.hide();

            // Clear ALL grids and reset state
            this.clearAllGridsAndState();

            // Reset PTBS state
            PTBS_Manager._state = "command";

            // Return to command window
            PTBS_Manager.selectedBattler()._hasAttacked = false;
            this._ptbsCommandWindow.open();
            this._ptbsCommandWindow.activate();
            this._ptbsCommandWindow.select(0);

            // Restore cursor position (important)
            this.cursorSet(cursorX, cursorY);
            this._cursorAlreadyPositioned = true;
        };

        // In onPTBSSkill (when first opening skill menu)
        Scene_Map.prototype.onPTBSSkill = function() {
            // Store that we're in skill selection mode
            this._inSkillSelection = true;

            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();

            // Show help window
            if (this._ptbsSkillHelpWindow) {
                this._ptbsSkillHelpWindow.show();
            }

            // Clear ALL targeting grids and reset PTBS actions
            this.clearAllTargetingGrids();
            PTBS_Manager._skillAction = null;
            PTBS_Manager._itemAction = null;

            const battler = PTBS_Manager.selectedBattler();
            if (!battler) return;

            // Prepare skill window
            if (battler._actor) {
                this._ptbsSkillWindow.setActor(battler._actor);
            } else if (battler._enemy) {
                this._ptbsSkillWindow.setEnemy(battler._enemy);
            }

            this._ptbsSkillWindow.refresh();
            this._ptbsSkillWindow.open();
            this._ptbsSkillWindow.activate();
            this._ptbsSkillWindow.select(0);

            // Important: Set PTBS state
            PTBS_Manager._state = "skill";
        };


        // Create a helper to clear ALL grids and reset state:
        Scene_Map.prototype.clearAllGridsAndState = function() {
            // Store cursor position
            const cursorX = this._cursorX;
            const cursorY = this._cursorY;

            // Clear all grid sprites
            if (this._ptbsGridSprite) {
                this._ptbsGridSprite.removeChildren();
            }
            if (this._ptbsAttackGridSprite) {
                this._ptbsAttackGridSprite.removeChildren();
            }
            if (this._ptbsSkillGridSprite) {
                this._ptbsSkillGridSprite.removeChildren();
            }
            if (this._ptbsItemGridSprite) {
                this._ptbsItemGridSprite.removeChildren();
            }
            if (this._ptbsAoeGridSprite) {
                this._ptbsAoeGridSprite.removeChildren();
            }

            // Reset UI initialization flag
            this._uiInitialized = false;

            // Clear any stored states
            this._inSkillSelection = false;
            this._inItemSelection = false;
            this._cursorMoved = false;

            // Don't reset cursor position here
            this._ptbsSkillWindowCreated = false;

            // Restore cursor position
            if (cursorX !== undefined && cursorY !== undefined) {
                this._cursorX = cursorX;
                this._cursorY = cursorY;
                this.updateCursorPosition();
            }
        };

        Scene_Map.prototype.initializeDamagePopups = function() {
            this._damagePopups = [];
        };

        Scene_Map.prototype.spawnDamagePopup = function(battler, hpDelta) {
            const ev = battler.event();
            const x = ev.screenX();
            const y = ev.screenY() - 40; // a bit above the battler
            const isHeal = (hpDelta < 0);
            const amount = Math.abs(hpDelta);

            const text = isHeal ? `+${amount}` : `-${amount}`;

            // Create a small bitmap
            const bmp = new Bitmap(64, 32);
            // Match the game’s main font:
            bmp.fontFace = $gameSystem.mainFontFace();
            bmp.fontSize = 24; // Adjust as desired

            bmp.outlineColor = "#000000";
            bmp.outlineWidth = 3;
            bmp.textColor = isHeal ? "#00ff00" : "#ff0000";
            bmp.drawText(text, 0, 0, 64, 32, "center");

            // Create the sprite
            const spr = new Sprite(bmp);
            spr.anchor.x = 0.5;
            spr.anchor.y = 1.0;
            spr.x = x;
            spr.y = y;
            spr.z = 9999;

            const popupData = {
                sprite: spr,
                dx: 0,
                dy: -0.5,
                age: 0,
                maxAge: 60
            };

            this._spriteset._tilemap.addChild(spr);
            this._damagePopups.push(popupData);
        };


        class PTBS_ItemWindow extends Window_ItemList {
            initialize(rect) {
                this._lastRefreshTime = 0;  // Add refresh limiter
                this._needsListUpdate = true; // New flag to track if list needs rebuilding
                super.initialize(rect);
                this.openness = 0;
            }

            // Add a dedicated method to track when list needs updating
            markListForUpdate() {
                this._needsListUpdate = true;
            }

            includes(item) {
                return DataManager.isItem(item) && item.occasion !== 3;
            }

            maxCols() {
                return 2;
            }

            numVisibleRows() {
                return 3;
            }

            isEnabled(item) {
                return !!item;
            }

            refresh() {
                // Prevent multiple refreshes in the same frame
                const currentTime = Date.now();
                if (currentTime - this._lastRefreshTime < 100) return;
                this._lastRefreshTime = currentTime;

                const oldIndex = this.index();

                // Only rebuild list if needed
                if (this._needsListUpdate) {
                    this.makeItemList();
                    this._needsListUpdate = false;
                }

                this.createContents();
                super.refresh();

                if (oldIndex >= 0 && oldIndex < this._data.length) {
                    this.select(oldIndex);
                }
            }

            activate() {
                this._active = true;
                super.activate();
            }

            select(index) {
                if (index === this._index) return; // Skip if index hasn't changed
                if (index === -1) {
                    this.deselect();
                    return;
                }
                super.select(index);
                this.updateHelp(); // Only update help on actual change
            }


            // Add this new method
            deselect() {
                this._index = -1;
                this._stayCount = 0;
                this.refresh();
                if (this._helpWindow) {
                    this._helpWindow.clear();
                }
            }

            deactivate() {
                this._active = false;
                super.deactivate();
            }

            drawItem(index) {
                const item = this._data[index];
                if (!item) return;
                const rect = this.itemLineRect(index);

                const originalFontSize = this.contents.fontSize;
                this.contents.fontSize = 18;
                const qty = $gameParty.numItems(item);
                const qtyText = String(qty);
                const qtyFieldWidth = 24;
                this.resetTextColor();
                this.drawText(qtyText + " x", rect.x, rect.y, qtyFieldWidth, "center");

                let x = rect.x + qtyFieldWidth + 4;
                this.drawIcon(item.iconIndex, x, rect.y);
                x += ImageManager.iconWidth + 4;

                const availableWidth = rect.width - (x - rect.x);
                const text = item.name;
                const textWidth = this.textWidthEx(text);

                if (textWidth > availableWidth) {
                    this.contents.fontSize = Math.floor(originalFontSize * (availableWidth / textWidth));
                }

                const originalResetFontSettings = Window_Base.prototype.resetFontSettings;
                Window_Base.prototype.resetFontSettings = function() {};

                this.drawTextEx(text, x, rect.y, availableWidth);

                Window_Base.prototype.resetFontSettings = originalResetFontSettings;
                this.contents.fontSize = originalFontSize;
            }
        }




        // Create the PTBS_ItemWindow
        Scene_Map.prototype.createPTBSItemWindow = function() {
            const ww = 720;
            const wh = 150;
            const wx = (Graphics.width - ww) / 2;
            const wy = Graphics.height - wh - 10;
            const rect = new Rectangle(wx, wy, ww, wh);

            this._ptbsItemWindow = new PTBS_ItemWindow(rect);

            this._ptbsItemWindow.setHandler("ok",     this.onPTBSItemOk.bind(this));
            this._ptbsItemWindow.setHandler("cancel", this.onPTBSItemCancel.bind(this));

            // Tell the item window which help window to use
            this._ptbsItemWindow.setHelpWindow(this._ptbsItemHelpWindow);

            // Add to the scene, still hidden at first
            this.addWindow(this._ptbsItemWindow);
        };


        Scene_Map.prototype.createPTBSItemHelpWindow = function() {
            const width = 1260;
            const height = 90;
            const x = (Graphics.width - width) / 2;
            const y = Graphics.height - height - 170;
            const rect = new Rectangle(x, y, width, height);

            this._ptbsItemHelpWindow = new Window_Help(rect);
            this._ptbsItemHelpWindow.setText("");
            this.addWindow(this._ptbsItemHelpWindow);

            // Hide it right away so it's not always visible:
            this._ptbsItemHelpWindow.hide();
        };


        // 2) Show help window in onPTBSItem() when opening the items
        Scene_Map.prototype.onPTBSItem = function() {
            // Store that we're in item selection mode
            this._inItemSelection = true;

            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();

            // Show help window first
            if (this._ptbsItemHelpWindow) {
                this._ptbsItemHelpWindow.show();
            }

            // Clear ALL grids before showing item window
            this.clearAllTargetingGrids();

            // Force list update before showing
            this._ptbsItemWindow.markListForUpdate();
            this._ptbsItemWindow.refresh();
            this._ptbsItemWindow.open();
            this._ptbsItemWindow.activate();
            this._ptbsItemWindow.select(0);

            // Set PTBS state
            PTBS_Manager._state = "item";
        };

        // 3) Hide help window on OK
        Scene_Map.prototype.onPTBSItemOk = function() {
            const item = this._ptbsItemWindow.item();

            // Clear item selection mode
            this._inItemSelection = false;

            this._ptbsItemWindow.close();
            this._ptbsItemWindow.deactivate();
            this._ptbsItemHelpWindow.hide();

            if (item) {
                const user = PTBS_Manager.selectedBattler();
                let action;
                if (user._actor) {
                    action = new Game_Action(user._actor);
                } else if (user._enemy) {
                    action = new Game_Action(user._enemy);
                }
                action.setItem(item.id);

                PTBS_Manager.startItemSelection(action);
                this.refreshPTBSItemGrid();

                // Show overhead AP cost if applicable
                const cost = PTBS_Manager.readAPConsumption(item);
                this._ptbsStatusWindow.setPreviewAPCost(cost);
                this.showOverheadAPCost(user, cost);

                // Mark item list for update after using an item
                this._ptbsItemWindow.markListForUpdate();
            }
        };

        Scene_Map.prototype.onPTBSItemCancel = function() {
            this._inItemSelection = false;

            this._ptbsItemWindow.close();
            this._ptbsItemWindow.deactivate();
            this._ptbsItemHelpWindow.hide();

            // Clear ALL targeting grids
            if (this._ptbsAoeGridSprite) {
                this._ptbsAoeGridSprite.removeChildren();
            }
            if (this._ptbsSkillGridSprite) {
                this._ptbsSkillGridSprite.removeChildren();
            }
            if (this._ptbsAttackGridSprite) {
                this._ptbsAttackGridSprite.removeChildren();
            }
            if (this._ptbsItemGridSprite) {
                this._ptbsItemGridSprite.removeChildren();
            }

            // Remove overhead cost & revert AP display
            this._ptbsStatusWindow.setPreviewAPCost(0);
            this.hideOverheadAPCost();

            // Return to command window and reset PTBS state
            PTBS_Manager.selectedBattler()._hasAttacked = false;
            PTBS_Manager._state = "command";
            this._ptbsCommandWindow.open();
            this._ptbsCommandWindow.activate();
            this._ptbsCommandWindow.select(0);

            // Clear action references in PTBS_Manager
            PTBS_Manager._skillAction = null;
            PTBS_Manager._itemAction = null;
        };

        Scene_Map.prototype.createPTBSCommandWindow = function() {
            // A narrower width so it looks tidy:
            const windowWidth = 180;

            // Let the engine compute an appropriate height for 5 rows at your lineHeight:
            // fittingHeight(5) uses the lineHeight() logic from your Window_Command
            const windowHeight = this._ptbsFittingHeightFor5Commands();

            // Now build the rectangle
            const rect = new Rectangle(0, 0, windowWidth, windowHeight);

            this._ptbsCommandWindow = new PTBS_CommandWindow(rect);

            // (1) Set a smaller font from the beginning:
            this._ptbsCommandWindow.contents.fontSize = 24;

            // (2) Define your commands (Move/Attack/Skill/Item/EndTurn).
            // Usually, you do that in makeCommandList() inside the window,
            // or you can do it manually then call .refresh().

            // (3) Hook up command handlers:
            this._ptbsCommandWindow.setHandler("move",    this.onPTBSMove.bind(this));
            this._ptbsCommandWindow.setHandler("attack",  this.onPTBSAttack.bind(this));
            this._ptbsCommandWindow.setHandler("skill",   this.onPTBSSkill.bind(this));
            this._ptbsCommandWindow.setHandler("item",    this.onPTBSItem.bind(this));
            this._ptbsCommandWindow.setHandler("endTurn", this.onPTBSEndTurn.bind(this));

            // (4) Finally, refresh so everything is drawn with the correct font from the start
            this._ptbsCommandWindow.refresh();

            // Add directly to the scene (not the WindowLayer) so the command
            // window is never clipped by the stencil masks of other PTBS windows
            // (turn-order, hover, status) when their screen areas overlap.
            this.addChild(this._ptbsCommandWindow);
            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();
        };

        /**
         * Helper function that "fakes" the engine's .fittingHeight(rows) for your custom window.
         * This ensures the window is tall enough for 5 lines at lineHeight()=22 + the usual padding.
         */
        Scene_Map.prototype._ptbsFittingHeightFor5Commands = function() {
            // The Window_Command uses: itemHeight = lineHeight + some padding, etc.
            // A simpler approach: we guess each line is ~ lineHeight(22) + 8 for extra spacing.
            // Then add standard window padding * 2 (top & bottom).
            const lineH = 30;         // match our custom lineHeight
            const rowSpacing = 8;     // the built-in "extra" in itemHeight() from Window_Selectable
            const rows = 5;

            const totalItemHeight = (lineH + rowSpacing) * rows;
            const totalPadding    = this._ptbsCommandWindow ? this._ptbsCommandWindow.padding * 2 : 36;

            return totalItemHeight + totalPadding;
        };

        Scene_Map.prototype.updatePTBSUI = function() {
            // Exit early if PTBS isn't active
            if (!PTBS_Manager.isActive()) {
                // Hide all UI elements only if they exist and weren't already hidden
                if (this._ptbsStatusWindow && this._ptbsStatusWindow.visible) this._ptbsStatusWindow.hide();
                if (this._ptbsCommandWindow && this._ptbsCommandWindow.visible) {
                    this._ptbsCommandWindow.close();
                    this._ptbsCommandWindow.deactivate();
                }
                if (this._ptbsTurnOrderWindow && this._ptbsTurnOrderWindow.visible) this._ptbsTurnOrderWindow.hide();
                if (this._ptbsSkillWindow && this._ptbsSkillWindow.visible) {
                    this._ptbsSkillWindow.close();
                    this._ptbsSkillWindow.deactivate();
                }
                if (this._ptbsItemWindow && this._ptbsItemWindow.visible) {
                    this._ptbsItemWindow.close();
                    this._ptbsItemWindow.deactivate();
                }
                if (this._ptbsHoverWindow && this._ptbsHoverWindow.visible) this._ptbsHoverWindow.hide();
                if (this._ptbsSkillHelpWindow && this._ptbsSkillHelpWindow.visible) this._ptbsSkillHelpWindow.hide();
                if (this._ptbsItemHelpWindow && this._ptbsItemHelpWindow.visible) this._ptbsItemHelpWindow.hide();
                return;
            }

            // NEW: If manually hidden, don't try to update/show windows
            if (this._ptbsUIManuallyHidden) {
                return;
            }

            // Recreate missing windows only once
            if (!this._uiInitialized) {
                if (!this._ptbsStatusWindow) this.createPTBSStatusWindow();
                if (!this._ptbsCommandWindow) this.createPTBSCommandWindow();
                if (!this._ptbsTurnOrderWindow) this.createPTBSTurnOrderWindow();
                if (!this._ptbsSkillWindow) this.createPTBSSkillWindow();
                if (!this._ptbsItemWindow) this.createPTBSItemWindow();
                if (!this._ptbsHoverWindow) this.createPTBSHoverWindow();
                this._uiInitialized = true; // Mark as initialized to prevent repeated creation
            }

            const battler = PTBS_Manager.selectedBattler();
            if (!battler) return; // No battler selected, skip updates

            // Track last battler HP and AP to detect changes
            const currentHP = battler.currentHP();
            const currentAP = battler.actionPoints();

            // Refresh status window only if battler or stats changed
            if (this._ptbsStatusWindow._battler !== battler || this._lastBattlerHP !== currentHP || this._lastBattlerAP !== currentAP) {
                this._ptbsStatusWindow.show();
                this._ptbsStatusWindow.setBattler(battler);
                this._lastBattlerHP = currentHP;
                this._lastBattlerAP = currentAP;
            }

            // Refresh turn order window only on turn index change
            const currentTurnIndex = PTBS_Manager._currentTurnIndex;
            if (this._lastTurnIndex !== currentTurnIndex) {
                this._ptbsTurnOrderWindow.show();
                this._ptbsTurnOrderWindow.refresh();
                this._lastTurnIndex = currentTurnIndex;

                // NEW: Reset cursor positioning flag when turn changes
                this._cursorAlreadyPositioned = false;
            }

            // Update hover window every frame (lightweight operation)
            this._ptbsHoverWindow.show();
            this.updateHoverWindow();

            // Handle command window based on state
            const state = PTBS_Manager.state();
            if (state === "command" && !this._inSkillSelection && !this._inItemSelection) {
                if (!PTBS_AI.isControlledByAI(battler)) {
                    this._ptbsCommandWindow.open();
                    this._ptbsCommandWindow.activate();
                    this.positionPTBSCommandWindow();
                }
            } else {
                this._ptbsCommandWindow.close();
                this._ptbsCommandWindow.deactivate();
            }

            // Handle skill window visibility and activation
            if (state === "skill" && this._ptbsSkillWindow) {
                this._ptbsSkillWindow.show();
                // Refresh only if battler or skill list changed (handled in PTBS_SkillWindow.refresh)
                this._ptbsSkillWindow.refresh();

                if (this._inSkillSelection) {
                    this._ptbsSkillWindow.open();
                    this._ptbsSkillWindow.activate();
                    if (this._ptbsSkillHelpWindow) this._ptbsSkillHelpWindow.show();
                }
            } else if (this._ptbsSkillWindow && this._ptbsSkillWindow.visible && !this._inSkillSelection && state !== "skill") {
                this._ptbsSkillWindow.close();
                this._ptbsSkillWindow.deactivate();
                if (this._ptbsSkillHelpWindow) this._ptbsSkillHelpWindow.hide();
            }

            // Handle item window visibility and activation
            if (state === "item" && this._ptbsItemWindow) {
                this._ptbsItemWindow.show();
                // Refresh only if inventory changed (handled in PTBS_ItemWindow.refresh)
                this._ptbsItemWindow.refresh();

                if (this._inItemSelection) {
                    this._ptbsItemWindow.open();
                    this._ptbsItemWindow.activate();
                    if (this._ptbsItemHelpWindow) this._ptbsItemHelpWindow.show();
                }
            } else if (this._ptbsItemWindow && this._ptbsItemWindow.visible && !this._inItemSelection && state !== "item") {
                this._ptbsItemWindow.close();
                this._ptbsItemWindow.deactivate();
                if (this._ptbsItemHelpWindow) this._ptbsItemHelpWindow.hide();
            }

            // Refresh grids only when state or cursor position changes
            if (this._lastState !== state || this._cursorMoved) {
                if (state === "move") {
                    this.refreshPTBSGrid();
                } else if (state === "attack") {
                    this.refreshPTBSAttackGrid();
                } else if (state === "skill") {
                    this.refreshPTBSSkillGrid();
                } else if (state === "item") {
                    this.refreshPTBSItemGrid();
                }
                this._lastState = state;
                this._cursorMoved = false; // Reset cursor movement flag
            }

            // Initialize cursor position only once per battler selection
            if (this._cursor && !this._cursorAlreadyPositioned && battler) {
                this.cursorSet(battler.event().x, battler.event().y);
                this._cursorAlreadyPositioned = true;
            }
        };

        Scene_Map.prototype.positionPTBSCommandWindow = function() {
            const battler = PTBS_Manager.selectedBattler();
            if (!battler) return;
            const battlerScreenX = battler.event().screenX();
            const battlerScreenY = battler.event().screenY();
            const windowWidth  = this._ptbsCommandWindow.width;
            const windowHeight = this._ptbsCommandWindow.height;
            const margin = 48;

            // Position above the battler, then hard clamp to screen bounds.
            // No conditional flipping — just a smooth clamp so the window is
            // always 100% on-screen and never has invisible off-screen area.
            let x = battlerScreenX - windowWidth / 2;
            let y = battlerScreenY - windowHeight - margin;

            x = Math.max(0, Math.min(Graphics.width  - windowWidth,  x));
            y = Math.max(0, Math.min(Graphics.height - windowHeight, y));

            this._ptbsCommandWindow.move(x, y, windowWidth, windowHeight);
        };

        // Add this new method to Scene_Map to handle all cancel/escape input for PTBS:
        Scene_Map.prototype.handlePTBSCancel = function() {
            // Allow cancelling the direction selection phase
            if (PTBS_Manager.state() === "face") {
                PTBS_Manager._state = "command";

                // Remove facing arrows if they exist
                if (this._facingArrowsSprite) {
                    if (this._facingArrowsSprite.parent) {
                        this._facingArrowsSprite.parent.removeChild(this._facingArrowsSprite);
                    }
                    this._facingArrowsSprite = null;
                }

                // Return to command window
                if (this._ptbsCommandWindow) {
                    this._ptbsCommandWindow.open();
                    this._ptbsCommandWindow.activate();
                    this._ptbsCommandWindow.select(0);
                }
                return true;
            }

            if (PTBS_Manager.state() === "move") {
                PTBS_Manager._state = "command";
                this.refreshPTBSGrid();
                if (this._ptbsCommandWindow) {
                    this._ptbsCommandWindow.open();
                    this._ptbsCommandWindow.activate();
                    this._ptbsCommandWindow.select(0);
                }
                return true;
            }

            if (this._ptbsSkillWindow && this._ptbsSkillWindow.active) {
                this.onPTBSSkillCancel();
                return true;
            }

            if (this._ptbsItemWindow && this._ptbsItemWindow.active) {
                this.onPTBSItemCancel();
                return true;
            }

            // If we are already in the command state and the user hits cancel again,
            // show the custom pause menu.
            if (PTBS_Manager.state() === "command") {
                // Hide command window before opening pause menu.
                if (this._ptbsCommandWindow) {
                    this._ptbsCommandWindow.close();
                    this._ptbsCommandWindow.deactivate();
                }
                // Set a custom state so updatePTBSUI does not re-open the command window.
                PTBS_Manager._state = "pause";
                if (this._ptbsPauseWindow) {
                    this._ptbsPauseWindow.open();
                    this._ptbsPauseWindow.activate();
                    return true;
                }
            }

            // (Any other state you want to catch and revert to command)
            if (["attack", "skill", "item"].includes(PTBS_Manager.state())) {
                if (PTBS_Manager.selectedBattler()) {
                    PTBS_Manager.selectedBattler()._hasAttacked = false;
                }
                PTBS_Manager._state = "command";
                this.clearAllGridsAndState();
                if (this._ptbsCommandWindow) {
                    this._ptbsCommandWindow.open();
                    this._ptbsCommandWindow.activate();
                    this._ptbsCommandWindow.select(0);
                }
                return true;
            }

            // If none of these cases match, return false.
            return false;
        };

        Scene_Map.prototype.onPTBSMove = function() {
            PTBS_Manager.startMoveSelection();
            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();
            this.refreshPTBSGrid();
            this.updatePathPreview();
        };
        Scene_Map.prototype.onPTBSAttack = function() {
            PTBS_Manager.startAttackSelection();
            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();
            this.refreshPTBSAttackGrid();

            // Clear any existing preview first
            this._ptbsStatusWindow.setPreviewAPCost(0);
            this.hideOverheadAPCost();

            // Then show the attack cost preview
            const defaultAttackSkill = $dataSkills[1];
            const cost = PTBS_Manager.readAPConsumption(defaultAttackSkill);
            this._ptbsStatusWindow.setPreviewAPCost(cost);
            this.showOverheadAPCost(PTBS_Manager.selectedBattler(), cost);

            // NEW: Find and select nearest enemy in attack range
            this.selectNearestEnemyInAttackRange();
        };

        // Add this new method to Scene_Map
        Scene_Map.prototype.selectNearestEnemyInAttackRange = function() {
            const battler = PTBS_Manager.selectedBattler();
            if (!battler) return;

            const attackableTiles = PTBS_Manager.getAttackableTiles(battler);
            if (!attackableTiles || attackableTiles.length === 0) return;

            let nearestEnemy = null;
            let shortestDistance = Infinity;

            // Check each attackable tile for enemies
            for (const tile of attackableTiles) {
                const enemyBattler = PTBS_Manager.battlerAt(tile.x, tile.y);
                if (enemyBattler &&
                    PTBS_Manager.isValidAttackTarget(tile.x, tile.y) &&
                    enemyBattler.currentHP() > 0) {

                    // Calculate Manhattan distance
                    const distance = Math.abs(battler.event().x - tile.x) +
                    Math.abs(battler.event().y - tile.y);

                if (distance < shortestDistance) {
                    shortestDistance = distance;
                    nearestEnemy = enemyBattler;
                }
                    }
            }

            // If we found an enemy, position cursor on it
            if (nearestEnemy) {
                this.cursorSet(nearestEnemy.event().x, nearestEnemy.event().y);
            }
        };


        Scene_Map.prototype.onPTBSEndTurn = function() {
            this._ptbsCommandWindow.close();
            this._ptbsCommandWindow.deactivate();
            PTBS_Manager._state = "face";

            // Clear any active grids
            this.refreshPTBSAttackGrid();
            this.refreshPTBSSkillGrid();
            if (this._ptbsItemGridSprite) {
                this._ptbsItemGridSprite.removeChildren();
            }

            // Center cursor on the current battler
            const battler = PTBS_Manager.selectedBattler();
            if (battler && battler.event()) {
                this.cursorSet(battler.event().x, battler.event().y);
            }
        };

        Scene_Map.prototype.updateHoverWindow = function() {
            // ADD THIS CHECK:  If the window doesn't exist, do nothing.
            if (!this._ptbsHoverWindow) {
                return;
            }

            // If PTBS isn't active, hide the hover window and (optionally) close command UI
            if (!PTBS_Manager.isActive()) {
                this._ptbsHoverWindow.hide();
                this._ptbsCommandWindow.close();
                this._ptbsCommandWindow.deactivate();
                return;
            }

            // Identify whichever battler (if any) is under the mouse/cursor
            const hoveredBattler = PTBS_Manager.battlerAt(this._cursorX, this._cursorY);

            // If found a valid battler => show the hover window for them
            if (hoveredBattler) {
                this._ptbsHoverWindow.show();
                this._ptbsHoverWindow.setBattler(hoveredBattler);
            } else {
                // Otherwise, hide it
                this._ptbsHoverWindow.hide();
            }
        };

        Scene_Map.prototype.createPTBSGridSprite = function() {
            this._ptbsGridSprite = new Sprite();
            this._spriteset._tilemap.addChild(this._ptbsGridSprite);
        };

        const _Scene_Map_refreshPTBSGrid = Scene_Map.prototype.refreshPTBSGrid;
        Scene_Map.prototype.refreshPTBSGrid = function() {
            // Clear existing cache before refreshing grid
            this.invalidateMoveTilesCache();
            this._pathCache = null;

            // Clear existing tiles
            this._ptbsGridSprite.removeChildren();

            // Exit early if not in move state
            if (PTBS_Manager.state() !== "move") return;

            const b = PTBS_Manager.selectedBattler();
            if (!b) return;

            // Position the grid based on scroll position
            const scrollX = $gameMap.displayX() * $gameMap.tileWidth();
            const scrollY = $gameMap.displayY() * $gameMap.tileHeight();
            this._ptbsGridSprite.x = -scrollX;
            this._ptbsGridSprite.y = -scrollY;

            // Get the movable tiles and cache the result
            const tiles = b.getMovableTiles();

            // Create reusable tile bitmap to improve performance
            if (!this._moveTileBitmap) {
                this._moveTileBitmap = new Bitmap($gameMap.tileWidth(), $gameMap.tileHeight());
                this._moveTileBitmap.fillRect(0, 0, $gameMap.tileWidth(), $gameMap.tileHeight(), "rgba(0,120,255,0.3)");
            }

            // Add tiles to the grid
            for (const tile of tiles) {
                // Use a shared bitmap instead of creating a new one for each tile
                const s = new Sprite(this._moveTileBitmap);
                s.x = tile.x * $gameMap.tileWidth();
                s.y = tile.y * $gameMap.tileHeight();
                s._gridX = tile.x;
                s._gridY = tile.y;
                this._ptbsGridSprite.addChild(s);

                // Build a quick lookup cache for valid moves
                if (!this._validMoveTilesCache) {
                    this._validMoveTilesCache = {};
                }
                this._validMoveTilesCache[`${tile.x},${tile.y}`] = true;
            }
        };

        Scene_Map.prototype.createPTBSPathPreview = function() {
            this._ptbsPathSprite = new Sprite();
            this._spriteset._tilemap.addChild(this._ptbsPathSprite);
        };

        Scene_Map.prototype.updatePathPreview = function() {
            if (!this._ptbsPathSprite) return;

            this._ptbsPathSprite.removeChildren();
            if (PTBS_Manager.state() !== "move") return;

            const b = PTBS_Manager.selectedBattler();
            if (!b) return;

            // Only calculate path if cursor is on valid move tile
            // This check is lightweight
            if (!this.isCursorOnValidMoveTile()) return;

            // Cache path calculations
            const cacheKey = `${b.event().x},${b.event().y}_${this._cursorX},${this._cursorY}`;
            if (this._pathCache && this._pathCache.key === cacheKey) {
                // Use cached path
                this.drawPathFromCache(this._pathCache.path);
                return;
            }

            // Calculate new path
            const queue = PTBS_Manager.buildMoveQueue(b.event().x, b.event().y, this._cursorX, this._cursorY);

            // Cache it
            this._pathCache = {
                key: cacheKey,
                path: queue
            };

            this.drawPathFromCache(queue);
        };

        Scene_Map.prototype.drawPathFromCache = function(queue) {
            const b = PTBS_Manager.selectedBattler();
            let tx = b.event().x, ty = b.event().y;

            for (const dir of queue) {
                if (dir === 6) tx++;
                else if (dir === 4) tx--;
                else if (dir === 2) ty++;
                else if (dir === 8) ty--;

                const s = new Sprite();
                s.bitmap = this.getPathTileBitmap();
                const px = $gameMap.adjustX(tx) * $gameMap.tileWidth();
                const py = $gameMap.adjustY(ty) * $gameMap.tileHeight();
                s.x = px;
                s.y = py;
                this._ptbsPathSprite.addChild(s);
            }
        };

        Scene_Map.prototype.getPathTileBitmap = function() {
            if (!this._pathTileBitmap) {
                this._pathTileBitmap = new Bitmap($gameMap.tileWidth(), $gameMap.tileHeight());
                this._pathTileBitmap.fillRect(0, 0, $gameMap.tileWidth(), $gameMap.tileHeight(), "rgba(0,255,0,0.3)");
            }
            return this._pathTileBitmap;
        };

        // Optimize the tile checking by caching
        Scene_Map.prototype.isCursorOnValidMoveTile = function() {
            const b = PTBS_Manager.selectedBattler();
            if (!b) return false;

            // Use the cache
            if (!this._validMoveTilesCache) {
                this._validMoveTilesCache = {};
                const tiles = b.getMovableTiles();
                for (const tile of tiles) {
                    this._validMoveTilesCache[`${tile.x},${tile.y}`] = true;
                }
            }

            return !!this._validMoveTilesCache[`${this._cursorX},${this._cursorY}`];
        };



        // Call this when needed to reset the cache
        Scene_Map.prototype.invalidateMoveTilesCache = function() {
            this._validMoveTilesCache = null;
        };

        Scene_Map.prototype.createPTBSAttackGridSprite = function() {
            this._ptbsAttackGridSprite = new Sprite();
            this._spriteset._tilemap.addChild(this._ptbsAttackGridSprite);
        };

        Scene_Map.prototype.refreshPTBSAttackGrid = function() {
            // Clear existing grid
            this._ptbsAttackGridSprite.removeChildren();

            // Exit early if not in attack state
            if (PTBS_Manager.state() !== "attack") return;

            const b = PTBS_Manager.selectedBattler();
            if (!b) return;

            // Position the grid based on scroll position
            const scrollX = $gameMap.displayX() * $gameMap.tileWidth();
            const scrollY = $gameMap.displayY() * $gameMap.tileHeight();
            this._ptbsAttackGridSprite.x = -scrollX;
            this._ptbsAttackGridSprite.y = -scrollY;

            // Create reusable attack tile bitmap if needed
            if (!this._attackTileBitmap) {
                this._attackTileBitmap = new Bitmap($gameMap.tileWidth(), $gameMap.tileHeight());
                this._attackTileBitmap.fillRect(0, 0, $gameMap.tileWidth(), $gameMap.tileHeight(), "rgba(255,0,0,0.3)");
            }

            // Cache attack tiles calculation
            if (!this._attackTilesCache || this._attackTilesCacheKey !== b.event().eventId()) {
                this._attackTilesCache = PTBS_Manager.getAttackableTiles(b);
                this._attackTilesCacheKey = b.event().eventId();

                // Also build a lookup object for quick validation
                this._validAttackTilesCache = {};
                for (const tile of this._attackTilesCache) {
                    this._validAttackTilesCache[`${tile.x},${tile.y}`] = true;
                }
            }

            // Add tiles to grid using cached result
            for (const tile of this._attackTilesCache) {
                // Use shared bitmap instead of creating new ones
                const s = new Sprite(this._attackTileBitmap);
                s.x = tile.x * $gameMap.tileWidth();
                s.y = tile.y * $gameMap.tileHeight();
                s._gridX = tile.x;
                s._gridY = tile.y;
                this._ptbsAttackGridSprite.addChild(s);
            }
        };

        Scene_Map.prototype.createPTBSSkillGridSprite = function() {
            this._ptbsSkillGridSprite = new Sprite();
            this._spriteset._tilemap.addChild(this._ptbsSkillGridSprite);
        };

        Scene_Map.prototype.refreshPTBSSkillGrid = function() {
            const currentState = PTBS_Manager.state();
            const skillAction = PTBS_Manager._skillAction;
            const battler = PTBS_Manager.selectedBattler();

            // Cache key based on state, action, and battler position
            const cacheKey = `${currentState}-${skillAction?.item().id}-${battler?.event().x},${battler?.event().y}`;
            if (this._lastSkillGridCacheKey === cacheKey) return;

            this._ptbsSkillGridSprite.removeChildren();
            if (currentState !== "skill" || !skillAction || !battler) {
                this._lastSkillGridCacheKey = cacheKey;
                return;
            }

            const skill = skillAction.item();
            const scopeData = PTBS_Manager.parseScopeFromSkill(skill);
            const scrollX = $gameMap.displayX() * $gameMap.tileWidth();
            const scrollY = $gameMap.displayY() * $gameMap.tileHeight();
            this._ptbsSkillGridSprite.x = -scrollX;
            this._ptbsSkillGridSprite.y = -scrollY;

            let tiles = PTBS_Manager.getSkillableTiles(battler, skill);
            if (scopeData.shape === "circle" && scopeData.max === 0 && scopeData.min === 0) {
                tiles = [{ x: battler.event().x, y: battler.event().y }];
            }

            for (const tile of tiles) {
                const s = new Sprite(this._skillTileBitmap || (this._skillTileBitmap = new Bitmap($gameMap.tileWidth(), $gameMap.tileHeight())));
                s.bitmap.fillRect(0, 0, $gameMap.tileWidth(), $gameMap.tileHeight(), "rgba(180,0,180,0.3)");
                s.x = tile.x * $gameMap.tileWidth();
                s.y = tile.y * $gameMap.tileHeight();
                s._gridX = tile.x;
                s._gridY = tile.y;
                this._ptbsSkillGridSprite.addChild(s);
            }

            this._lastSkillGridCacheKey = cacheKey; // Update cache key
        };

        // And let's add a explicit cleanup method:
        Scene_Map.prototype.clearAllTargetingGrids = function() {
            if (this._ptbsSkillGridSprite) {
                this._ptbsSkillGridSprite.removeChildren();
            }
            if (this._ptbsAoeGridSprite) {
                this._ptbsAoeGridSprite.removeChildren();
            }
            if (this._ptbsAttackGridSprite) {
                this._ptbsAttackGridSprite.removeChildren();
            }
            if (this._ptbsItemGridSprite) {
                this._ptbsItemGridSprite.removeChildren();
            }
        };

        // [ITEM STUFF] create + refresh item grid
        Scene_Map.prototype.createPTBSItemGridSprite = function() {
            this._ptbsItemGridSprite = new Sprite();
            this._spriteset._tilemap.addChild(this._ptbsItemGridSprite);
        };
        Scene_Map.prototype.refreshPTBSItemGrid = function() {
            this._ptbsItemGridSprite.removeChildren();
            if (PTBS_Manager.state() !== "item") return;
            const b = PTBS_Manager.selectedBattler();
            if (!b) return;
            if (!PTBS_Manager._itemAction) return;

            const scrollX = $gameMap.displayX() * $gameMap.tileWidth();
            const scrollY = $gameMap.displayY() * $gameMap.tileHeight();
            this._ptbsItemGridSprite.x = -scrollX;
            this._ptbsItemGridSprite.y = -scrollY;

            const tiles = PTBS_Manager.getItemableTiles(b, PTBS_Manager._itemAction.item());
            for (const tile of tiles) {
                const s = new Sprite();
                s.bitmap = new Bitmap($gameMap.tileWidth(), $gameMap.tileHeight());
                // If you want it “red like attacks”:
                s.bitmap.fillRect(0, 0, $gameMap.tileWidth(), $gameMap.tileHeight(), "rgba(255,0,0,0.3)");
                s.x = tile.x * $gameMap.tileWidth();
                s.y = tile.y * $gameMap.tileHeight();
                s._gridX = tile.x;
                s._gridY = tile.y;
                this._ptbsItemGridSprite.addChild(s);
            }
        };


        Scene_Map.prototype.updatePTBSGridPositions = function() {
            if (PTBS_Manager.isActive()) {
                const scrollX = $gameMap.displayX() * $gameMap.tileWidth();
                const scrollY = $gameMap.displayY() * $gameMap.tileHeight();
                if (this._ptbsGridSprite) {
                    this._ptbsGridSprite.x = -scrollX;
                    this._ptbsGridSprite.y = -scrollY;
                }
                if (this._ptbsAttackGridSprite) {
                    this._ptbsAttackGridSprite.x = -scrollX;
                    this._ptbsAttackGridSprite.y = -scrollY;
                }
                if (this._ptbsSkillGridSprite) {
                    this._ptbsSkillGridSprite.x = -scrollX;
                    this._ptbsSkillGridSprite.y = -scrollY;
                }
                if (this._ptbsItemGridSprite) {
                    this._ptbsItemGridSprite.x = -scrollX;
                    this._ptbsItemGridSprite.y = -scrollY;
                }
                if (this._ptbsAoeGridSprite) {
                    this._ptbsAoeGridSprite.x = -scrollX;
                    this._ptbsAoeGridSprite.y = -scrollY;
                }
            }
        };

        Scene_Map.prototype.createPTBSCursor = function() {
            this._cursor = new Sprite();
            this._cursor.bitmap = new Bitmap($gameMap.tileWidth(), $gameMap.tileHeight());
            this._cursor.bitmap.fillRect(0, 0, $gameMap.tileWidth(), $gameMap.tileHeight(), "rgba(255,215,0,0.5)");
            this._cursorX = 0;
            this._cursorY = 0;
            this._spriteset._tilemap.addChild(this._cursor);
            this._cursorPulse = 0;
            this._cursorPulseDir = 1;
            this.updateCursorPosition();
        };

        const _Scene_Map_update = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            PTBS_ProjectileManager.update();
            _Scene_Map_update.call(this);

            if (this._skillPopups) {
                this.updateSkillPopups();
            }

            if (PTBS_Manager.isActive()) {
                PTBS_Manager.update();
                this.updateCursorMovement();
                this.updateMouseHoverForPTBS();

                if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
                    if (this.handlePTBSCancel()) return;
                }

                if (["move", "attack", "skill", "item"].includes(PTBS_Manager.state())) {
                    if (this._cursorMoved) this.centerCameraOnCursor();
                } else if (PTBS_Manager.selectedBattler()) {
                    this.centerCameraOnBattler(PTBS_Manager.selectedBattler());
                }

                this.updateCamera();
                this.updateCursorPosition();
                this.updateCursorPulsation();
                this.updatePTBSUI();
                this.updatePTBSGridPositions();
                this.updatePathPreview();
                this.updateHoverWindow();
                this.checkCursorOK();
                this.updateFacing();

                this.updateTouchForMove();
                this.updateTouchForAttack();
                this.updateTouchForSkill();
                this.updateTouchForItem();

                // Only refresh AOE grid if not manually hidden
                if ((PTBS_Manager.state() === "skill" || PTBS_Manager.state() === "item") && !this._ptbsUIManuallyHidden) {
                    this.refreshPTBSAoeGrid();
                } else if (this._ptbsAoeGridSprite) {
                    this._ptbsAoeGridSprite.removeChildren();
                }
            }

            this.updateDamagePopups();
        };

        Scene_Map.prototype.updateMouseHoverForPTBS = function() {
            if (!PTBS_Manager.isActive() || TouchInput.mousePressed) return;

            // Prevent cursor movement when skill or item windows are active
            if (this._ptbsSkillWindow && this._ptbsSkillWindow.active && this._ptbsSkillWindow.visible) return;
            if (this._ptbsItemWindow && this._ptbsItemWindow.active && this._ptbsItemWindow.visible) return;

            if (PTBS_Manager.state() === "face" && !this._faceModeInitialized) {
                const battler = PTBS_Manager.selectedBattler();
                if (battler && battler.event()) {
                    this.cursorSet(battler.event().x, battler.event().y);
                    this._faceModeInitialized = true;
                }
            }

            // Reset the flag when leaving face mode
            if (PTBS_Manager.state() !== "face") {
                this._faceModeInitialized = false;
            }

            // Check if mouse is actually moving by comparing timestamps
            const isMouseMoving = TouchInput._mouseMovedTime &&
            (Date.now() - TouchInput._mouseMovedTime < 150);

            if (!isMouseMoving) return; // Exit if mouse isn't moving

            // Throttle updates to reduce performance impact
            if (!this._lastMouseUpdateTime || Date.now() - this._lastMouseUpdateTime > 50) {
                const mouseX = TouchInput.x;
                const mouseY = TouchInput.y;

                // Check if mouse is on screen
                if (mouseX < 0 || mouseX >= Graphics.width || mouseY < 0 || mouseY >= Graphics.height) {
                    return; // Mouse is off-screen, don't update cursor
                }

                // Convert to map coordinates
                const tileX = Math.floor($gameMap.canvasToMapX(mouseX));
                const tileY = Math.floor($gameMap.canvasToMapY(mouseY));

                // Only process if mouse has moved to a different tile
                if ($gameMap.isValid(tileX, tileY) && (tileX !== this._cursorX || tileY !== this._cursorY)) {
                    if (PTBS_Manager.state() === "face") {
                        this.updateFacingDirectionByMouse(mouseX, mouseY);
                    } else {
                        this.cursorSet(tileX, tileY);
                        this._cursorMoved = true;

                        // Delay heavy path computations
                        if (this._pathPreviewTimer) {
                            clearTimeout(this._pathPreviewTimer);
                        }
                        this._pathPreviewTimer = setTimeout(() => {
                            this.updatePathPreview();
                            this._pathPreviewTimer = null;
                        }, 100);
                    }
                }
                this._lastMouseUpdateTime = Date.now();
            }
        };

        const _Scene_Map_update_stateTracks = Scene_Map.prototype.update;
        Scene_Map.prototype.update = function() {
            // Track state changes
            const previousState = this._lastPTBSState;
            const currentState = PTBS_Manager.state();

            _Scene_Map_update_stateTracks.call(this);

            // Detect state change to face mode
            if (PTBS_Manager.isActive() && previousState !== currentState) {
                // Just entered face mode
                if (currentState === "face" && previousState !== "face") {
                    const battler = PTBS_Manager.selectedBattler();
                    if (battler && battler.event()) {
                        this.cursorSet(battler.event().x, battler.event().y);
                    }
                }
                this._lastPTBSState = currentState;
            }
        };

        Scene_Map.prototype.updateFacingDirectionByMouse = function(mouseX, mouseY) {
            const battler = PTBS_Manager.selectedBattler();
            if (!battler) return;

            // Get the battler's screen position
            const event = battler.event();
            const battlerScreenX = event.screenX();
            const battlerScreenY = event.screenY();

            // Calculate angle between battler and mouse
            const dx = mouseX - battlerScreenX;
            const dy = mouseY - battlerScreenY;

            // Only change direction if mouse is moved far enough from battler
            const minDistance = 30; // Minimum pixel distance to trigger direction change
            if (Math.abs(dx) < minDistance && Math.abs(dy) < minDistance) return;

            // Determine direction based on angle
            let direction;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            // Convert angle to direction (8=up, 6=right, 2=down, 4=left)
            if (angle < -135 || angle > 135) {
                direction = 4; // left
            } else if (angle < -45) {
                direction = 8; // up
            } else if (angle < 45) {
                direction = 6; // right
            } else {
                direction = 2; // down
            }

            // Set the direction
            battler.event().setDirection(direction);

            // Update the arrow sprite highlight if it exists
            if (this._facingArrowsSprite && this._facingArrowsSprite.bitmap) {
                this.drawFourArrows(this._facingArrowsSprite.bitmap, direction);
            }

            // In face mode, ensure cursor stays on battler
            if (PTBS_Manager.state() === "face") {
                this.cursorSet(battler.event().x, battler.event().y);
            }
        };

        /**
         * A simple system for showing floating text popups (e.g. damage/heal).
         * We assume you store them in this._damagePopups = [].
         */
        Scene_Map.prototype.updateDamagePopups = function() {
            // If you haven't initialized the array yet, skip
            if (!this._damagePopups) return;

            for (const popup of this._damagePopups) {
                popup.age++;

                // Move it upward
                popup.sprite.x += popup.dx;
                popup.sprite.y += popup.dy;

                // Fade out near the end
                if (popup.age > popup.maxAge - 10) {
                    popup.sprite.opacity = 255 * (popup.maxAge - popup.age) / 10;
                }
            }

            // Remove any that are fully done
            this._damagePopups = this._damagePopups.filter(p => {
                if (p.age >= p.maxAge) {
                    // remove its sprite from parent
                    if (p.sprite.parent) {
                        p.sprite.parent.removeChild(p.sprite);
                    }
                    return false; // This means it's removed from the array
                }
                return true;
            });
        };

        // 1. First, modify the Show/Hide AP cost methods to use character-relative positioning
        Scene_Map.prototype.showOverheadAPCost = function(battler, cost) {
            const ev = battler.event();
            const sprite = this._spriteset._characterSprites.find(s => s._character === ev);
            if (!sprite) return;

            if (!sprite._apCostSprite) {
                sprite._apCostSprite = new Sprite();
                sprite._apCostSprite.bitmap = new Bitmap(80, 24);
                sprite._apCostSprite.anchor.set(0.5, 1);
                sprite.addChild(sprite._apCostSprite);
            }

            const bmp = sprite._apCostSprite.bitmap;
            bmp.clear();
            bmp.fontFace = $gameSystem.mainFontFace();
            bmp.fontSize = 20;
            bmp.outlineColor = "#000000";
            bmp.outlineWidth = 3;
            bmp.drawText(`AP: ${cost}`, 0, 0, bmp.width, bmp.height, "center");

            // Position relative to character sprite
            sprite._apCostSprite.y = -75; // Adjust this value to position above character
            sprite._apCostSprite.visible = true;
        };

        Scene_Map.prototype.hideOverheadAPCost = function() {
            // Hide AP cost sprite on all character sprites
            if (this._spriteset && this._spriteset._characterSprites) {
                for (const sprite of this._spriteset._characterSprites) {
                    if (sprite._apCostSprite) {
                        sprite._apCostSprite.visible = false;
                    }
                }
            }
        };


        Scene_Map.prototype.updateCursorPulsation = function() {
            if (!this._cursor) return;
            const speed = 0.02;
            if (this._cursorPulseDir > 0) {
                this._cursorPulse += speed;
                if (this._cursorPulse >= 0.5) {
                    this._cursorPulseDir = -1;
                }
            } else {
                this._cursorPulse -= speed;
                if (this._cursorPulse <= 0) {
                    this._cursorPulseDir = 1;
                }
            }
            const base = 0.3, max = 0.8;
            const alpha = base + (max - base) * Math.abs(this._cursorPulse);
            this._cursor.opacity = alpha * 255;
        };

        Scene_Map.prototype.mapToScreen = function(mapX, mapY) {
            const displayX = $gameMap.displayX();
            const displayY = $gameMap.displayY();
            const tileWidth = $gameMap.tileWidth();
            const tileHeight = $gameMap.tileHeight();
            const screenX = Math.round((mapX - displayX) * tileWidth);
            const screenY = Math.round((mapY - displayY) * tileHeight);
            return { x: screenX, y: screenY };
        };

        Scene_Map.prototype.updateCursorPosition = function() {
            if (!this._cursor) return;
            const screenPos = this.mapToScreen(this._cursorX, this._cursorY);
            this._cursor.x = screenPos.x;
            this._cursor.y = screenPos.y;
        };

        Scene_Map.prototype.cursorSet = function(x, y) {
            // Ensure coordinates are valid integers
            x = Math.max(0, Math.min(Math.floor(x), $gameMap.width() - 1));
            y = Math.max(0, Math.min(Math.floor(y), $gameMap.height() - 1));

            this._cursorX = x;
            this._cursorY = y;
            this.updateCursorPosition();

            // Flag to track that cursor was manually positioned
            this._cursorManuallyPositioned = true;
        };

        Scene_Map.prototype.updateTouchForMove = function() {
            if (PTBS_Manager.state() !== "move") return;
            if (TouchInput.isTriggered()) {
                const mx = TouchInput.x;
                const my = TouchInput.y;
                for (const child of this._ptbsGridSprite.children) {
                    const localX = mx - (this._ptbsGridSprite.x + child.x);
                    const localY = my - (this._ptbsGridSprite.y + child.y);
                    if (localX >= 0 && localY >= 0 && localX < child.width && localY < child.height) {
                        PTBS_Manager.selectedBattler()._moved = true;
                        PTBS_Manager.attemptMoveTo(child._gridX, child._gridY);
                        this.refreshPTBSGrid();
                        this.updatePathPreview();
                        return;
                    }
                }
            }
        };

        Scene_Map.prototype.updateTouchForAttack = function() {
            if (PTBS_Manager.state() !== "attack") return;
            if (TouchInput.isTriggered()) {
                const mx = TouchInput.x;
                const my = TouchInput.y;
                for (const child of this._ptbsAttackGridSprite.children) {
                    const localX = mx - (this._ptbsAttackGridSprite.x + child.x);
                    const localY = my - (this._ptbsAttackGridSprite.y + child.y);
                    if (localX >= 0 && localY >= 0 && localX < child.width && localY < child.height) {
                        if (PTBS_Manager.isValidAttackTarget(child._gridX, child._gridY)) {
                            const subject = PTBS_Manager.selectedBattler();
                            let action = null;
                            if (subject._actor) {
                                action = new Game_Action(subject._actor);
                                action.setSkill(1);
                            } else if (subject._enemy) {
                                action = new Game_Action(subject._enemy);
                                action.setSkill(1);
                            }
                            PTBS_Manager.attemptAction(subject, action, child._gridX, child._gridY);
                        }
                        return;
                    }
                }
            }
        };

        Scene_Map.prototype.updateTouchForSkill = function() {
            if (PTBS_Manager.state() !== "skill") return;
            if (!PTBS_Manager._skillAction) return;
            if (TouchInput.isTriggered()) {
                const mx = TouchInput.x;
                const my = TouchInput.y;
                for (const child of this._ptbsSkillGridSprite.children) {
                    const localX = mx - (this._ptbsSkillGridSprite.x + child.x);
                    const localY = my - (this._ptbsSkillGridSprite.y + child.y);
                    if (localX >= 0 && localY >= 0 && localX < child.width && localY < child.height) {
                        if (PTBS_Manager.isValidSkillTarget(PTBS_Manager._skillAction.item(), child._gridX, child._gridY)) {
                            const subject = PTBS_Manager.selectedBattler();
                            const action = PTBS_Manager._skillAction;
                            PTBS_Manager.attemptAction(subject, action, child._gridX, child._gridY);
                        }
                        return;
                    }
                }
            }
        };

        Scene_Map.prototype.updateTouchForItem = function() {
            // 1) Make sure we’re actually in "item" state:
            if (PTBS_Manager.state() !== "item") return;

            // 2) Make sure there’s an active "item action"
            if (!PTBS_Manager._itemAction) return;

            // 3) If the player taps/clicks on the screen:
            if (TouchInput.isTriggered()) {
                const mx = TouchInput.x;
                const my = TouchInput.y;

                // 4) Check against all item-grid tiles
                for (const child of this._ptbsItemGridSprite.children) {
                    // Convert mouse screen coords to local tile coords
                    const localX = mx - (this._ptbsItemGridSprite.x + child.x);
                    const localY = my - (this._ptbsItemGridSprite.y + child.y);

                    // 5) If the touch is within this tile’s rectangle
                    if (localX >= 0 && localY >= 0 && localX < child.width && localY < child.height) {
                        // 6) Validate whether this is a valid item target
                        if (PTBS_Manager.isValidItemTarget(PTBS_Manager._itemAction.item(), child._gridX, child._gridY)) {
                            // 7) Use the item
                            const subject = PTBS_Manager.selectedBattler();
                            const action = PTBS_Manager._itemAction;
                            PTBS_Manager.attemptAction(subject, action, child._gridX, child._gridY);
                        }
                        return; // Stop after handling first tile
                    }
                }
            }
        };

        Scene_Map.prototype.updateCursorMovement = function() {
            // Don't move cursor when skill/item windows are active
            if (this._ptbsSkillWindow?.active || this._ptbsItemWindow?.active) {
                this._cursorMoved = false;
                return;
            }

            // Only move cursor during valid action states
            if (!["move","attack","skill","item"].includes(PTBS_Manager.state())) {
                this._cursorMoved = false;
                return;
            }

            const oldX = this._cursorX;
            const oldY = this._cursorY;
            if (Input.isTriggered("up")) {
                this._cursorY = Math.max(0, oldY - 1);
            } else if (Input.isTriggered("down")) {
                this._cursorY = Math.min($gameMap.height() - 1, oldY + 1);
            } else if (Input.isTriggered("left")) {
                this._cursorX = Math.max(0, oldX - 1);
            } else if (Input.isTriggered("right")) {
                this._cursorX = Math.min($gameMap.width() - 1, oldX + 1);
            } else {
                this._cursorMoved = false;
                return;
            }

            this._cursorMoved = (this._cursorX !== oldX || this._cursorY !== oldY);

            // When cursor moves, enable cursor scrolling
            if (this._cursorMoved && PTBS_Manager._cursorScrollEnabled) {
                PTBS_Manager._cameraControlMode = "cursor";
            }
        };

        // Then update the checkCursorOK method in Scene_Map:
        Scene_Map.prototype.checkCursorOK = function() {
            // Skip processing if skill or item windows are active
            if ((this._ptbsSkillWindow && this._ptbsSkillWindow.active) ||
                (this._ptbsItemWindow && this._ptbsItemWindow.active)) {
                return;
                }

                // Handle keyboard "OK" button press
                if (Input.isTriggered("ok")) {
                    this.processActionAtCursorPosition(this._cursorX, this._cursorY);
                }

                // Handle mouse click
                if (TouchInput.isTriggered() && PTBS_Manager.isActive()) {
                    const mouseX = TouchInput.x;
                    const mouseY = TouchInput.y;
                    const tileX = Math.floor($gameMap.canvasToMapX(mouseX));
                    const tileY = Math.floor($gameMap.canvasToMapY(mouseY));

                    if ($gameMap.isValid(tileX, tileY)) {
                        // First update cursor position to where mouse clicked
                        this.cursorSet(tileX, tileY);
                        // Then process the action at that position
                        this.processActionAtCursorPosition(tileX, tileY);

                        // Additionally handle facing mode
                        if (PTBS_Manager.state() === "face") {
                            this.updateFacingDirectionByMouse(mouseX, mouseY);
                            PTBS_Manager.endCurrentTurn();
                        }
                    }
                }
        };

        Scene_Map.prototype.processActionAtCursorPosition = function(x, y) {
            if (PTBS_Manager.state() === "move") {
                if (this.isCursorOnValidMoveTile()) {
                    PTBS_Manager.selectedBattler()._moved = true;
                    PTBS_Manager.attemptMoveTo(x, y);
                    this.refreshPTBSGrid();
                    this.updatePathPreview();
                }
            } else if (PTBS_Manager.state() === "attack") {
                if (this.isCursorOnValidAttackTile() && PTBS_Manager.isValidAttackTarget(x, y)) {
                    const subject = PTBS_Manager.selectedBattler();
                    let action = null;
                    if (subject._actor) {
                        action = new Game_Action(subject._actor);
                        action.setSkill(1);
                    } else if (subject._enemy) {
                        action = new Game_Action(subject._enemy);
                        action.setSkill(1);
                    }
                    PTBS_Manager.attemptAction(subject, action, x, y);
                }
            } else if (PTBS_Manager.state() === "skill") {
                const action = PTBS_Manager._skillAction;
                if (!action) return;

                const tiles = PTBS_Manager.getSkillableTiles(PTBS_Manager.selectedBattler(), action.item());
                if (tiles.some(t => t.x === x && t.y === y) &&
                    PTBS_Manager.isValidSkillTarget(action.item(), x, y)) {
                    PTBS_Manager.attemptAction(PTBS_Manager.selectedBattler(), action, x, y);
                    }
            } else if (PTBS_Manager.state() === "item") {
                const action = PTBS_Manager._itemAction;
                if (!action) return;

                const tiles = PTBS_Manager.getItemableTiles(PTBS_Manager.selectedBattler(), action.item());
                if (tiles.some(t => t.x === x && t.y === y) &&
                    PTBS_Manager.isValidItemTarget(action.item(), x, y)) {
                    PTBS_Manager.attemptAction(PTBS_Manager.selectedBattler(), action, x, y);
                    }
            }
        };


        // Optimize attack tile checking
        Scene_Map.prototype.isCursorOnValidAttackTile = function() {
            const b = PTBS_Manager.selectedBattler();
            if (!b) return false;

            // Use cached lookup
            if (this._validAttackTilesCache) {
                return !!this._validAttackTilesCache[`${this._cursorX},${this._cursorY}`];
            }

            // Fallback to original logic if no cache
            const tiles = PTBS_Manager.getAttackableTiles(b);
            return tiles.some(t => t.x === this._cursorX && t.y === this._cursorY);
        };

        // Invalidate attack tiles cache when needed
        Scene_Map.prototype.invalidateAttackTilesCache = function() {
            this._attackTilesCache = null;
            this._attackTilesCacheKey = null;
            this._validAttackTilesCache = null;
        };

        Scene_Map.prototype.updateFacing = function() {
            // 1) If we're not in "face" mode, remove facingArrowsSprite if it exists and return
            if (PTBS_Manager.state() !== "face") {
                if (this._facingArrowsSprite) {
                    this.removeChild(this._facingArrowsSprite);
                    this._facingArrowsSprite = null;
                }
                return;
            }

            // 2) If we haven't created the arrow sprite yet, do so
            if (!this._facingArrowsSprite) {
                this._facingArrowsSprite = new Sprite();
                this._facingArrowsSprite.bitmap = new Bitmap(48, 48);

                // Let's highlight the current direction (if any) in gold
                const b = PTBS_Manager.selectedBattler();
                if (b) {
                    // If we want to highlight the current direction
                    // we can read b.event().direction() or b._ptbsFaceDir
                    const currentMapDir = b.event().direction(); // 2/4/6/8
                    this.drawFourArrows(this._facingArrowsSprite.bitmap, currentMapDir);
                }

                this.addChild(this._facingArrowsSprite);

                // Position it near the battler
                const battler = PTBS_Manager.selectedBattler();
                if (battler) {
                    const x = $gameMap.adjustX(battler.event().x) * $gameMap.tileWidth();
                    const y = $gameMap.adjustY(battler.event().y) * $gameMap.tileHeight() - 48;
                    this._facingArrowsSprite.x = x;
                    this._facingArrowsSprite.y = y;
                }
            }

            // 3) Check input for up/down/left/right
            let faceDirString = null;  // "up","down","left","right"

            if (Input.isTriggered("up"))    faceDirString = "up";
            else if (Input.isTriggered("down"))  faceDirString = "down";
            else if (Input.isTriggered("left"))  faceDirString = "left";
            else if (Input.isTriggered("right")) faceDirString = "right";

            // 4) If we got a faceDirString, store it in the battler, and optionally set the sprite direction
            if (faceDirString) {
                const b = PTBS_Manager.selectedBattler();
                if (b) {
                    // (A) Store your custom property
                    b._ptbsFaceDir = faceDirString;

                    // (B) Also set the map event direction if you want
                    // e.g. "down" => dir=2, "left" => dir=4, "right" => dir=6, "up" => dir=8
                    let mapDir = 2; // default down
                    switch (faceDirString) {
                        case "up":    mapDir = 8; break;
                        case "left":  mapDir = 4; break;
                        case "right": mapDir = 6; break;
                        case "down":  mapDir = 2; break;
                    }
                    b.event().setDirection(mapDir);

                    // (C) Redraw the arrow sprite highlight
                    this.drawFourArrows(this._facingArrowsSprite.bitmap, mapDir);
                }
            }

            // 5) Check for cancel input
            if (Input.isTriggered("cancel") || TouchInput.isCancelled()) {
                this.handlePTBSCancel();
                return;
            }

            // 6) If player presses OK, we confirm the facing and end the face mode
            if (Input.isTriggered("ok") && !this._okProcessed) {
                PTBS_Manager.endCurrentTurn();
            }
        };


        Scene_Map.prototype.drawFourArrows = function(bitmap, highlightDir) {
            bitmap.clear();
            const w = bitmap.width, h = bitmap.height;
            const upColor    = (highlightDir === 8) ? "gold" : "white";
            const downColor  = (highlightDir === 2) ? "gold" : "white";
            const leftColor  = (highlightDir === 4) ? "gold" : "white";
            const rightColor = (highlightDir === 6) ? "gold" : "white";

            // Up
            bitmap.fillPolygon([
                {x: w/2,     y: 4},
                {x: w/2 - 6, y: 14},
                {x: w/2 + 6, y: 14}
            ], upColor);
            // Down
            bitmap.fillPolygon([
                {x: w/2,     y: h-4},
                {x: w/2 - 6, y: h-14},
                {x: w/2 + 6, y: h-14},
            ], downColor);
            // Left
            bitmap.fillPolygon([
                {x: 4,  y: h/2},
                {x: 14, y: h/2 - 6},
                {x: 14, y: h/2 + 6},
            ], leftColor);
            // Right
            bitmap.fillPolygon([
                {x: w-4,  y: h/2},
                {x: w-14, y: h/2 - 6},
                {x: w-14, y: h/2 + 6},
            ], rightColor);
        };

        // PTBS_CommandWindow
        class PTBS_CommandWindow extends Window_Command {
            initialize(rect) {
                super.initialize(rect);
                this.refresh();
            }

            // Row logic, etc. if you have a custom lineHeight:
            numVisibleRows() { return 5; }
            lineHeight() { return 32; }

            // This is your built-in addCommand calls
            makeCommandList() {
                // The "symbol" argument is what we can match in _cmdIcons below
                this.addCommand("Move",    "move",    true);
                this.addCommand("Attack",  "attack",  true);
                this.addCommand("Skill",   "skill",   true);
                this.addCommand("Item",    "item",    true);
                this.addCommand("End Turn","endTurn", true);
            }

            // (A) Put a small icon dictionary here
            _cmdIcons() {
                return {
                    move: 587,      // or whichever icon index you like
                    attack: 588,
                    skill: 578,
                    item: 595,
                    endTurn: 573
                };
            }

            // (B) Override drawItem to show the icon + text
            drawItem(index) {
                const rect = this.itemLineRect(index);
                const cmd = this._list[index]; // { name, symbol, enabled, ext } object
                if (!cmd) return;

                // Our dictionary is by symbol
                const iconId = this._cmdIcons()[cmd.symbol];
                if (iconId) {
                    // Draw icon on the left
                    this.drawIcon(iconId, rect.x, rect.y + (rect.height - ImageManager.iconHeight) / 2);
                    // Draw text after the icon; ensure the command name is a string
                    const textX = rect.x + ImageManager.iconWidth + 4;
                    this.drawTextEx(String(cmd.name || ""), textX, rect.y, rect.width - (ImageManager.iconWidth + 4));
                } else {
                    // If no icon found, just draw the text
                    this.drawTextEx(String(cmd.name || ""), rect.x, rect.y, rect.width);
                }
            }
        }


        class PTBS_StatusWindow extends Window_Base {
            initialize(rect) {
                super.initialize(rect);
                this._battler = null;
                this._lastPattern   = -1;
                this._lastCharName  = "";
                this._lastCharIndex = -1;
                this._lastHP = -1;
                this._lastMP = -1;
                this._lastTP = -1;
                this._lastAP = -1;
            }

            update() {
                super.update();
                if (!this._battler) return;
                const ev = this._battler.event();
                if (!ev) return;

                // Check stepping frame
                const currentPattern = ev.pattern();
                const chName  = ev.characterName();
                const chIndex = ev.characterIndex();

                const hp = this._battler.currentHP?.() ?? 0;
                const mp = this._battler.currentMP?.() ?? 0;
                const tp = this._battler.currentTP?.() ?? 0;
                const ap = this._battler.actionPoints?.() ?? 0;

                if (
                    currentPattern !== this._lastPattern ||
                    chName        !== this._lastCharName ||
                    chIndex       !== this._lastCharIndex ||
                    hp            !== this._lastHP ||
                    mp            !== this._lastMP ||
                    tp            !== this._lastTP ||
                    ap            !== this._lastAP
                ) {
                    this._lastPattern   = currentPattern;
                    this._lastCharName  = chName;
                    this._lastCharIndex = chIndex;
                    this._lastHP = hp;
                    this._lastMP = mp;
                    this._lastTP = tp;
                    this._lastAP = ap;

                    this.refresh();
                }
            }

            setBattler(battler) {
                if (this._battler !== battler) {
                    this._battler = battler;
                    this._lastPattern   = -1;
                    this._lastCharName  = "";
                    this._lastCharIndex = -1;
                    this._lastHP = -1;
                    this._lastMP = -1;
                    this._lastTP = -1;
                    this._lastAP = -1;
                    this.refresh();
                }
            }

            refresh() {
                this.contents.clear();
                if (!this._battler) return;

                const spriteAreaWidth = Math.floor(this.contentsWidth() * 0.4);
                const spriteAreaHeight = this.contentsHeight();
                this.drawBattlerSprite(this._battler.event(), 0, 0, spriteAreaWidth, spriteAreaHeight);

                const textX = spriteAreaWidth + 4;
                const usableWidth = this.contentsWidth() - textX - 4;
                const lineH = Math.floor(this.contentsHeight() / 5);
                this.contents.fontSize = Math.max(14, lineH - 6);

                let lineY = -8;

                // (A) Name
                const name = this._battler.displayName?.() || "???";
                this.drawText(name, textX, lineY, usableWidth, 'center');
                lineY += lineH;

                // (B) HP
                const hp  = this._battler.currentHP?.() ?? 0;
                const mhp = this.getMaxHP(this._battler);
                const hpRate = hp / Math.max(1, mhp);

                // pick colors
                let color1 = "#ff4444";
                let color2 = "#ff0000";
                if (hpRate >= 0.7) {
                    // green
                    color1 = "#80ff80";
                    color2 = "#00ff00";
                } else if (hpRate >= 0.3) {
                    // yellow
                    color1 = "#ffcc00";
                    color2 = "#ff9900";
                }

                // call your unified gauge method:
                this.drawPTBSParamGauge(
                    textX, lineY, usableWidth,
                    hpRate,          // fill ratio
                    "hp",            // parameter ID
                    `${hp}/${mhp}`,  // numeric text
                    color1,
                    color2
                );
                lineY += lineH;

                // (C) MP - Show for both actors and enemies
                const mp = this._battler.currentMP();
                const mmp = this._battler.getMaxMP ? this._battler.getMaxMP() :
                (this._battler._actor ? this._battler._actor.mmp :
                (this._battler._enemy ? this._battler._enemy.param(1) : 0));

                const mpRate = mp / Math.max(mmp, 1);
                this.drawPTBSParamGauge(
                    textX, lineY, usableWidth,
                    mpRate,
                    "mp",
                    `${mp}/${mmp}`,
                    ColorManager.mpGaugeColor1(),
                                        ColorManager.mpGaugeColor2()
                );
                lineY += lineH;

                // (D) TP - Show for both actors and enemies
                const tp = this._battler.currentTP();
                const tpRate = tp / 100.0;
                this.drawPTBSParamGauge(
                    textX, lineY, usableWidth,
                    tpRate,
                    "tp",
                    `${tp}/100`,
                    ColorManager.tpGaugeColor1(),
                                        ColorManager.tpGaugeColor2()
                );
                lineY += lineH;

                // (E) AP as segmented gauge (custom parameter - keep "AP" as label)
                const currentAP = this._battler.actionPoints?.() ?? 0;
                const maxAP = this._battler.maxAP();
                const preview = this._previewCost || 0;  // fallback 0 if not set

                this.drawPTBSSegmentedAP(
                    currentAP, maxAP,
                    textX, lineY, usableWidth, lineH,
                    preview
                );

                // Draw state icons in the lower left corner
                this.drawBattlerStateIcons(5, this.height - 60);
            }

            // Add this new method to PTBS_StatusWindow
            drawBattlerStateIcons(x, y) {
                if (!this._battler) return;

                const iconWidth = ImageManager.iconWidth;
                const iconHeight = ImageManager.iconHeight;
                const battlerObj = this._battler._actor || this._battler._enemy;

                if (!battlerObj) return;

                // Get all states (active only)
                const states = battlerObj.states();
                if (!states || states.length === 0) return;

                // Draw up to 4 state icons in a row
                for (let i = 0; i < Math.min(states.length, 4); i++) {
                    const state = states[i];
                    const iconIndex = state.iconIndex;
                    if (iconIndex > 0) {
                        this.drawIcon(iconIndex, x + i * iconWidth, y);
                    }
                }
            }

            getMaxHP(battler) {
                if (battler._actor) return battler._actor.mhp;
                if (battler._enemy) return battler._enemy.param(0);
                return 1;
            }

            // Inside PTBS_StatusWindow
            setPreviewAPCost(cost) {
                // We'll store it in a property so we can pass it to drawPTBSSegmentedAP
                if (this._previewCost !== cost) {
                    this._previewCost = cost;
                    this.refresh(); // re-draw
                }
            }

            // Just like in your code
            drawBattlerSprite(event, dx, dy, boxW, boxH) {
                const chName  = event.characterName();
                const chIndex = event.characterIndex();
                if (!chName) return;

                const bitmap = ImageManager.loadCharacter(chName);
                if (!bitmap.isReady()) return;

                const pattern = event.pattern();
                const big = ImageManager.isBigCharacter(chName);

                let frameW, frameH, sx, sy;
                if (big) {
                    frameW = bitmap.width / 3;
                    frameH = bitmap.height / 4;
                    sx     = pattern * frameW;
                    sy     = 0; // always "down" row
                } else {
                    frameW = bitmap.width / 12;
                    frameH = bitmap.height / 8;
                    const colBase = (chIndex % 4) * 3;
                    const rowBase = Math.floor(chIndex / 4) * 4;
                    sx = (colBase + pattern) * frameW;
                    sy = rowBase * frameH;
                }

                // Optionally auto-trim
                const bounds = this.scanSpriteBounds(bitmap, sx, sy, frameW, frameH);
                if (bounds) {
                    sx += bounds.x;
                    sy += bounds.y;
                    frameW = bounds.width;
                    frameH = bounds.height;
                }

                // scaled blt
                this.drawSpriteScaled(bitmap, sx, sy, frameW, frameH, dx, dy, boxW, boxH);
            }

            // Crop transparent pixels
            scanSpriteBounds(bitmap, sx, sy, sw, sh) {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width  = sw;
                tempCanvas.height = sh;
                const ctx = tempCanvas.getContext("2d");
                ctx.drawImage(bitmap._canvas || bitmap._image, sx, sy, sw, sh, 0, 0, sw, sh);

                const imgData = ctx.getImageData(0, 0, sw, sh).data;
                let minX = sw, maxX = 0, minY = sh, maxY = 0;
                let found = false;

                for (let py = 0; py < sh; py++) {
                    for (let px = 0; px < sw; px++) {
                        const i = (py * sw + px) * 4;
                        if (imgData[i + 3] > 0) {
                            found = true;
                            if (px < minX) minX = px;
                            if (px > maxX) maxX = px;
                            if (py < minY) minY = py;
                            if (py > maxY) maxY = py;
                        }
                    }
                }
                if (!found) {
                    return null;
                }
                return {
                    x:      minX,
                    y:      minY,
                    width:  maxX - minX + 1,
                    height: maxY - minY + 1
                };
            }

            // Draw sub-rectangle of `bitmap` scaled to (boxW x boxH)
            drawSpriteScaled(bitmap, sx, sy, sw, sh, dx, dy, boxW, boxH) {
                const scaleX = boxW / sw;
                const scaleY = boxH / sh;
                const scale  = Math.min(scaleX, scaleY);

                const finalW = Math.floor(sw * scale);
                const finalH = Math.floor(sh * scale);
                const offsetX = dx + Math.floor((boxW - finalW) / 2);
                const offsetY = dy + Math.floor((boxH - finalH) / 2);

                this.contents.blt(bitmap, sx, sy, sw, sh, offsetX, offsetY, finalW, finalH);
            }
        }

        // PTBS_TurnOrderBoxWindow
        class PTBS_TurnOrderBoxWindow extends Window_Base {
            initialize(rect) {
                const x = 0;
                const y = 0;
                const width = Graphics.width;
                const boxSize = 32;
                const spacing = 4;
                const height = (boxSize + spacing) * 2 + spacing;
                super.initialize(new Rectangle(x, y, width, height));
                this.opacity = 0;
                this._padding = spacing;
                this._animationCount = 0;
                this._currentFrame = 0;
                this._frameDelay = 15;
                this._boxSize = boxSize;
                this._spacing = spacing;
                this._boxesPerRow = Math.floor((Graphics.width - spacing) / (boxSize + spacing));
                this._contentBoundsCache = new Map();
                this._spriteCache = new Map();
            }

            update() {
                super.update();
                if (PTBS_Manager.isActive()) {
                    this._animationCount++;
                    if (this._animationCount >= this._frameDelay) {
                        this._animationCount = 0;
                        this._currentFrame = (this._currentFrame + 1) % 3;
                        this.refresh();
                    }
                }
            }

            refresh() {
                this.contents.clear();
                if (!PTBS_Manager.isActive()) return;
                const order = PTBS_Manager._turnOrder;
                for (let i = 0; i < order.length; i++) {
                    const row = Math.floor(i / this._boxesPerRow);
                    const col = i % this._boxesPerRow;
                    const x = col * (this._boxSize + this._spacing);
                    const y = row * (this._boxSize + this._spacing);
                    this.drawBox(order[i], i, x, y);
                }
            }

            drawBox(battler, index, x, y) {
                let bgColor = "rgba(0,0,0,0.5)";
                if (index === PTBS_Manager._currentTurnIndex) {
                    bgColor = "rgba(255,215,0,0.3)";
                } else if (battler._faction === "enemy") {
                    bgColor = "rgba(255,0,0,0.3)";
                } else {
                    bgColor = "rgba(0,255,0,0.3)";
                }

                this.contents.fillRect(x, y, this._boxSize, this._boxSize, bgColor);
                this.contents.fillRect(x+1, y+1, this._boxSize-2, this._boxSize-2, "rgba(0,0,0,0.1)");
                this.contents.strokeRect(x, y, this._boxSize, this._boxSize, "rgba(255,255,255,0.5)");

                // Save context for greyscale effect
                const ctx = this.contents.context;
                ctx.save();

                // If battler is dead, set up greyscale filter
                if (battler.currentHP() <= 0) {
                    ctx.filter = 'grayscale(100%) opacity(50%)';
                }

                // Draw the battler sprite
                this.drawBattlerSquare(battler, x, y);

                // Restore context
                ctx.restore();
            }

            getCacheKey(battler, frame) {
                const ev = battler.event();
                return `${ev.characterName()}_${ev.characterIndex()}_${frame}`;
            }

            drawBattlerSquare(battler, x, y) {
                const tag = battler.turnOrderSpriteTag();
                if (tag) {
                    if (tag.startsWith("faceset ")) {
                        const faceData = tag.replace("faceset", "").trim();
                        const parts = faceData.split("-");
                        const faceName = parts[0].trim();
                        const faceIndex = parts[1] ? Number(parts[1]) : 0;
                        this.drawFace(faceName, faceIndex, x, y, this._boxSize, this._boxSize);
                    } else if (tag.startsWith("icon ")) {
                        const iconId = Number(tag.replace("icon", "").trim());
                        this.drawBoxIcon(iconId, x, y);
                    } else {
                        this.drawText("?", x+16, y+16, 16, "center");
                    }
                    return;
                }

                const cacheKey = this.getCacheKey(battler, this._currentFrame);
                const cachedSprite = this._spriteCache.get(cacheKey);
                if (cachedSprite) {
                    this.contents.blt(cachedSprite, 0, 0, this._boxSize, this._boxSize, x, y);
                    return;
                }
                const ev = battler.event();
                const chName = ev.characterName();
                if (!chName) {
                    this.drawText("?", x+16, y+16, 16, "center");
                    return;
                }
                const bitmap = ImageManager.loadCharacter(chName);
                if (!bitmap.isReady()) {
                    bitmap.addLoadListener(() => this.refresh());
                    return;
                }
                const finalSprite = this.createBattlerSprite(battler, bitmap);
                if (finalSprite) {
                    this._spriteCache.set(cacheKey, finalSprite);
                    this.contents.blt(finalSprite, 0, 0, this._boxSize, this._boxSize, x, y);
                }
            }

            createBattlerSprite(battler, bitmap) {
                const ev = battler.event();
                const chIndex = ev.characterIndex();
                const big = ImageManager.isBigCharacter(ev.characterName());
                let sFrameX = 0, sFrameY = 0;
                let sFrameW, sFrameH;

                if (big) {
                    sFrameW = bitmap.width / 3;
                    sFrameH = bitmap.height / 4;
                    sFrameX = this._currentFrame * sFrameW;
                    sFrameY = 0;
                } else {
                    const frameW = bitmap.width / 12;
                    const frameH = bitmap.height / 8;
                    const colBase = (chIndex % 4) * 3;
                    const rowBase = Math.floor(chIndex / 4) * 4;
                    sFrameX = (colBase + this._currentFrame) * frameW;
                    sFrameY = rowBase * frameH;
                    sFrameW = frameW;
                    sFrameH = frameH;
                }
                const boundsKey = `${ev.characterName()}_${chIndex}_${sFrameX}_${sFrameY}`;
                let bounds = this._contentBoundsCache.get(boundsKey);
                if (!bounds) {
                    bounds = this.getContentBounds(bitmap, sFrameX, sFrameY, sFrameW, sFrameH);
                    if (bounds) {
                        this._contentBoundsCache.set(boundsKey, bounds);
                    }
                }
                if (bounds) {
                    sFrameX += bounds.x;
                    sFrameY += bounds.y;
                    sFrameW = bounds.width;
                    sFrameH = bounds.height;
                }
                const aspect = sFrameW / sFrameH;
                let targetW, targetH;
                if (aspect >= 1) {
                    targetW = this._boxSize;
                    targetH = Math.floor(this._boxSize / aspect);
                } else {
                    targetH = this._boxSize;
                    targetW = Math.floor(this._boxSize * aspect);
                }
                const dx = Math.floor((this._boxSize - targetW) / 2);
                const dy = Math.floor((this._boxSize - targetH) / 2);
                const temp = new Bitmap(this._boxSize, this._boxSize);
                temp.blt(bitmap, sFrameX, sFrameY, sFrameW, sFrameH, dx, dy, targetW, targetH);
                return temp;
            }

            drawBoxIcon(iconId, x, y) {
                const iconset = ImageManager.loadSystem("IconSet");
                if (!iconset.isReady()) {
                    iconset.addLoadListener(() => this.refresh());
                    return;
                }
                const ix = iconId % 16 * 32;
                const iy = Math.floor(iconId / 16) * 32;
                this.contents.blt(iconset, ix, iy, 32, 32,
                                  x + (this._boxSize - 32)/2,
                                  y + (this._boxSize - 32)/2);
            }

            getContentBounds(bitmap, x, y, width, height) {
                const temp = document.createElement('canvas');
                const ctx = temp.getContext('2d');
                temp.width = width;
                temp.height = height;
                ctx.drawImage(bitmap._canvas || bitmap._image, x, y, width, height, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                let minX = width, minY = height, maxX = 0, maxY = 0;
                let found = false;
                for (let py = 0; py < height; py++) {
                    for (let px = 0; px < width; px++) {
                        const idx = (py * width + px) * 4;
                        if (data[idx+3] > 0) {
                            minX = Math.min(minX, px);
                            minY = Math.min(minY, py);
                            maxX = Math.max(maxX, px);
                            maxY = Math.max(maxY, py);
                            found = true;
                        }
                    }
                }
                return found ? {
                    x: minX,
                    y: minY,
                    width: maxX - minX + 1,
                    height: maxY - minY + 1
                } : null;
            }
        }

        const _Window_Base_drawFace = Window_Base.prototype.drawFace;
        Window_Base.prototype.drawFace = function(faceName, faceIndex, x, y, dw, dh) {
            dw = dw || ImageManager.faceWidth;
            dh = dh || ImageManager.faceHeight;
            const bitmap = ImageManager.loadFace(faceName);
            const pw = ImageManager.faceWidth;
            const ph = ImageManager.faceHeight;
            const sx = (faceIndex % 4) * pw;
            const sy = Math.floor(faceIndex / 4) * ph;
            bitmap.addLoadListener(() => {
                this.contents.blt(bitmap, sx, sy, pw, ph, x, y, dw, dh);
            });
        };

        // -----------------------------------------------------------------------------
        // Window_Base.prototype.drawPTBSParamGauge
        // A single function to handle all the corner-cut gauge drawing.
        // -----------------------------------------------------------------------------
        Window_Base.prototype.drawPTBSParamGauge = function(
            x,         // left X
            y,         // top Y
            width,     // total gauge width
            rate,      // 0..1 fill ratio
            paramId,   // "hp", "mp", or "tp"
            valueText, // e.g. "123/456"
            color1,
            color2
        ) {
            // Get the proper term from the database
            let label;
            switch (paramId.toLowerCase()) {
                case "hp":
                    label = TextManager.hpA; // Use HP abbreviation
                    break;
                case "mp":
                    label = TextManager.mpA; // Use MP abbreviation
                    break;
                case "tp":
                    label = TextManager.tpA; // Use TP abbreviation
                    break;
                default:
                    label = paramId.toUpperCase(); // Fallback
            }

            // Decide space for label vs. gauge
            const labelW = Math.floor(width * 0.15);
            const gaugeW = Math.floor(width * 0.80);
            const gaugeX = x + labelW + 2;

            // Draw label on the left
            this.drawText(label, x, y, labelW, "right");

            // A "lineHeight" + smaller gauge
            const lineH   = this.lineHeight();
            const gaugeH  = Math.max(6, Math.floor(lineH * 0.45));
            const offsetY = Math.floor((lineH - gaugeH) / 2);

            // 1) Background "corner cut" bar
            const ctx   = this.contents.context;
            const bgCol = ColorManager.gaugeBackColor();

            const GAUGE_CORNER_CUT = 15;

            fillTrendyBar(ctx, gaugeX, y + offsetY, gaugeW, gaugeH, GAUGE_CORNER_CUT, bgCol);

            // 2) Filled portion
            const fillW = Math.floor(gaugeW * rate);
            if (fillW > 0) {
                const grad = ctx.createLinearGradient(gaugeX, 0, gaugeX + fillW, 0);
                grad.addColorStop(0, color1);
                grad.addColorStop(1, color2);
                fillTrendyBar(ctx, gaugeX, y + offsetY, fillW, gaugeH, GAUGE_CORNER_CUT, grad);
            }

            // 3) Text in the center
            this.drawText(valueText, gaugeX, y, gaugeW, "center");
        };

        Window_Base.prototype.textWidthEx = function(text) {
            let result = 0;
            const iconRegex = /\\i\[(\d+)\]/g;
            let lastIndex = 0;
            let match;
            while ((match = iconRegex.exec(text)) !== null) {
                // Measure the text before the icon escape.
                const precedingText = text.substring(lastIndex, match.index);
                result += this.contents.measureTextWidth(precedingText);
                // Add the width of the icon.
                result += ImageManager.iconWidth;
                lastIndex = match.index + match[0].length;
            }
            // Measure any text after the last escape code.
            result += this.contents.measureTextWidth(text.substring(lastIndex));
            return result;
        };

        Window_Base.prototype.drawPTBSSegmentedAP = function(
            currentAP,
            maxAP,
            x,
            y,
            totalWidth,
            lineHeight,
            previewCost = 0
        ) {
            // (A) Label
            const labelW = Math.floor(totalWidth * 0.15);
            const gaugeW = Math.floor(totalWidth * 0.80);
            this.drawText("AP", x, y, labelW, "right");

            // (B) Segment area
            const gap = -6;
            const segCount = maxAP > 0 ? maxAP : 1;
            const gaugeH = Math.max(6, Math.floor(lineHeight * 0.45));
            const offsetY = y + Math.floor((lineHeight - gaugeH) / 2);

            const ctx = this.contents.context;
            const segWidth = Math.floor((gaugeW - gap * (segCount - 1)) / segCount);

            // (C) Draw each segment
            for (let i = 0; i < segCount; i++) {
                // Calculate X for each segment
                const segX = x + labelW + 2 + i * (segWidth + gap);

                // Background
                fillTrendyBar(ctx, segX, offsetY, segWidth, gaugeH, 10, ColorManager.gaugeBackColor());

                // If the user actually _has_ an AP for this segment, fill gold
                // UNLESS we also want to blink it red for a “preview.”
                if (i < currentAP) {
                    // If i < previewCost => blink it in red
                    if (i < previewCost) {
                        // e.g. pulse a red or something
                        const red1 = "#ff4444";
                        const red2 = "#ff0000";
                        // If you want an actual “blinking” effect, do a time-based alpha
                        // or color shift. For now, let's do a simple red gradient:
                        const grad = ctx.createLinearGradient(segX, 0, segX + segWidth, 0);
                        grad.addColorStop(0, red1);
                        grad.addColorStop(1, red2);
                        fillTrendyBar(ctx, segX, offsetY, segWidth, gaugeH, 10, grad);
                    } else {
                        // Normal gold
                        const grad = ctx.createLinearGradient(segX, 0, segX + segWidth, 0);
                        grad.addColorStop(0, "#ffd700"); // gold
                        grad.addColorStop(1, "#daa520"); // goldenrod
                        fillTrendyBar(ctx, segX, offsetY, segWidth, gaugeH, 10, grad);
                    }
                }
            }
        };

        // Also be sure you have your fillTrendyBar(...) helper in scope:
        function fillTrendyBar(ctx, x, y, w, h, cut, fillStyle) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x + cut, y);         // top‐left corner + cut
            ctx.lineTo(x + w, y);          // top edge → top‐right
            ctx.lineTo(x + w, y + h - cut); // right edge → bottom‐right corner
            ctx.lineTo(x + w - cut, y + h); // diagonal corner at lower-right
            ctx.lineTo(x, y + h);          // bottom edge
            ctx.lineTo(x, y + cut);        // up the left edge
            ctx.closePath();
            ctx.fillStyle = fillStyle;
            ctx.fill();
            ctx.restore();
        }

        // -----------------------------------------------------------------------------
        // PTBS_HoverWindow
        //   Shows a small status hover for whatever battler is under the cursor.
        //   Uses the unified drawPTBSParamGauge(...) for HP/MP/TP.
        //   Retains a separate drawSegmentedAPGauge(...) for AP segments.
        // -----------------------------------------------------------------------------
        class PTBS_HoverWindow extends Window_Base {
            initialize(rect) {
                super.initialize(rect);
                this._battler = null;

                // Track last drawn data so we only refresh when needed
                this._lastPattern   = -1;
                this._lastCharName  = "";
                this._lastCharIndex = -1;
                this._lastHP = -1;
                this._lastMP = -1;
                this._lastTP = -1;
                this._lastAP = -1;
            }

            /**
             * Assigns which PTBS_Battler to show in this hover window.
             */
            setBattler(battler) {
                if (this._battler !== battler) {
                    this._battler = battler;

                    // Force a redraw on the next frame
                    this._lastPattern   = -1;
                    this._lastCharName  = "";
                    this._lastCharIndex = -1;
                    this._lastHP = -1;
                    this._lastMP = -1;
                    this._lastTP = -1;
                    this._lastAP = -1;

                    this.refresh();
                }
            }

            /**
             * Checks if the sprite frame or HP/MP/TP/AP changed. If so, redraws.
             */
            update() {
                super.update();
                if (!this._battler) return;

                const ev = this._battler.event();
                if (!ev) return;

                // Grab current stepping frame & character info
                const currentPattern = ev.pattern(); // 0..2
                const chName  = ev.characterName();
                const chIndex = ev.characterIndex();

                // Battler stats
                const hp = this._battler.currentHP?.() ?? 0;
                const mp = this._battler.currentMP?.() ?? 0;
                const tp = this._battler.currentTP?.() ?? 0;
                const ap = this._battler.actionPoints?.() ?? 0;

                // Compare to last known
                if (
                    currentPattern !== this._lastPattern ||
                    chName        !== this._lastCharName ||
                    chIndex       !== this._lastCharIndex ||
                    hp            !== this._lastHP ||
                    mp            !== this._lastMP ||
                    tp            !== this._lastTP ||
                    ap            !== this._lastAP
                ) {
                    // Something changed, so redraw:
                    this._lastPattern   = currentPattern;
                    this._lastCharName  = chName;
                    this._lastCharIndex = chIndex;
                    this._lastHP = hp;
                    this._lastMP = mp;
                    this._lastTP = tp;
                    this._lastAP = ap;

                    this.refresh();
                }
            }

            /**
             * Draws the hover window contents: actor/enemy sprite + HP/MP/TP + AP segments.
             */
            refresh() {
                this.contents.clear();
                if (!this._battler) return;

                // same ratio for sprite area
                const spriteAreaWidth = Math.floor(this.contentsWidth() * 0.4);
                const spriteAreaHeight = this.contentsHeight();
                this.drawBattlerSprite(this._battler.event(), 0, 0, spriteAreaWidth, spriteAreaHeight);

                const textX = spriteAreaWidth + 4;
                const usableWidth = this.contentsWidth() - textX - 4;
                // same lineHeight logic
                const lineH = Math.floor(this.contentsHeight() / 5);
                this.contents.fontSize = Math.max(14, lineH - 6);
                let lineY = -8;

                // Name
                const name = this._battler.displayName?.() || "???";
                this.drawText(name, textX, lineY, usableWidth, "center");
                lineY += lineH;

                // HP
                const hp = this._battler.currentHP();
                const mhp = this.getMaxHP(this._battler);
                const hpRate = hp / Math.max(mhp, 1);

                // replicate the "≥70% => green, ≥30% => yellow, else => red"
                let color1 = "#ff4444", color2 = "#ff0000";
                if (hpRate >= 0.7) {
                    color1 = "#80ff80";
                    color2 = "#00ff00";
                } else if (hpRate >= 0.3) {
                    color1 = "#ffcc00";
                    color2 = "#ff9900";
                }

                this.drawPTBSParamGauge(
                    textX, lineY, usableWidth,
                    hpRate,
                    "hp",
                    `${hp}/${mhp}`,
                    color1,
                    color2
                );
                lineY += lineH;

                // MP - Show for both actors and enemies
                const mp = this._battler.currentMP();
                const mmp = this._battler.getMaxMP ? this._battler.getMaxMP() :
                (this._battler._actor ? this._battler._actor.mmp :
                (this._battler._enemy ? this._battler._enemy.param(1) : 0));

                const mpRate = mp / Math.max(mmp, 1);
                this.drawPTBSParamGauge(
                    textX, lineY, usableWidth,
                    mpRate,
                    "mp",
                    `${mp}/${mmp}`,
                    ColorManager.mpGaugeColor1(),
                                        ColorManager.mpGaugeColor2()
                );
                lineY += lineH;

                // TP - Show for both actors and enemies
                const tp = this._battler.currentTP();
                const tpRate = tp / 100.0;
                this.drawPTBSParamGauge(
                    textX, lineY, usableWidth,
                    tpRate,
                    "tp",
                    `${tp}/100`,
                    ColorManager.tpGaugeColor1(),
                                        ColorManager.tpGaugeColor2()
                );
                lineY += lineH;

                // AP
                const currentAP = this._battler.actionPoints?.() ?? 0;
                const maxAP = this._battler.maxAP();
                this.drawPTBSSegmentedAP(currentAP, maxAP, textX, lineY, usableWidth, lineH);

                // Draw state icons in the lower left corner
                this.drawBattlerStateIcons(5, this.height - 60);
            }

            // Add the state icon drawing method to PTBS_HoverWindow
            drawBattlerStateIcons(x, y) {
                if (!this._battler) return;

                const iconWidth = ImageManager.iconWidth;
                const iconHeight = ImageManager.iconHeight;
                const battlerObj = this._battler._actor || this._battler._enemy;

                if (!battlerObj) return;

                // Get all states (active only)
                const states = battlerObj.states();
                if (!states || states.length === 0) return;

                // Draw up to 4 state icons in a row
                for (let i = 0; i < Math.min(states.length, 4); i++) {
                    const state = states[i];
                    const iconIndex = state.iconIndex;
                    if (iconIndex > 0) {
                        this.drawIcon(iconIndex, x + i * iconWidth, y);
                    }
                }
            }

            /**
             * Draws the event's current stepping frame in a scaled box.
             * (Similar to PTBS_StatusWindow logic.)
             */
            drawBattlerSprite(event, dx, dy, boxW, boxH) {
                const chName  = event.characterName();
                const chIndex = event.characterIndex();
                if (!chName) return;

                const bitmap = ImageManager.loadCharacter(chName);
                if (!bitmap.isReady()) return;

                const pattern = event.pattern(); // 0..2
                const big = ImageManager.isBigCharacter(chName);

                let frameW, frameH, sx, sy;
                if (big) {
                    // big sprite => 3 columns, 4 rows total
                    frameW = bitmap.width / 3;
                    frameH = bitmap.height / 4;
                    sx = pattern * frameW;
                    sy = 0; // always the "down" row for simplicity
                } else {
                    frameW = bitmap.width / 12;
                    frameH = bitmap.height / 8;
                    const colBase = (chIndex % 4) * 3;
                    const rowBase = Math.floor(chIndex / 4) * 4;
                    sx = (colBase + pattern) * frameW;
                    sy = (rowBase + 0) * frameH; // "down" row
                }

                // auto‐trim empty space
                const bounds = this.scanSpriteBounds(bitmap, sx, sy, frameW, frameH);
                if (bounds) {
                    sx += bounds.x;
                    sy += bounds.y;
                    frameW = bounds.width;
                    frameH = bounds.height;
                }

                this.drawSpriteScaled(bitmap, sx, sy, frameW, frameH, dx, dy, boxW, boxH);
            }

            /**
             * Quickly scans a sub-rectangle for non‐transparent pixels to auto‐trim.
             */
            scanSpriteBounds(bitmap, sx, sy, sw, sh) {
                const source = bitmap._canvas || bitmap._image;
                if (!source) return null;

                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = sw;
                tempCanvas.height = sh;
                const ctx = tempCanvas.getContext("2d");
                ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

                const data = ctx.getImageData(0, 0, sw, sh).data;
                let minX = sw, maxX = 0, minY = sh, maxY = 0;
                let found = false;

                for (let py = 0; py < sh; py++) {
                    for (let px = 0; px < sw; px++) {
                        const i = (py * sw + px) * 4;
                        if (data[i+3] > 0) {
                            found = true;
                            if (px < minX) minX = px;
                            if (px > maxX) maxX = px;
                            if (py < minY) minY = py;
                            if (py > maxY) maxY = py;
                        }
                    }
                }

                if (!found) return null;
                return {
                    x:      minX,
                    y:      minY,
                    width:  maxX - minX + 1,
                    height: maxY - minY + 1
                };
            }

            /**
             * Blits a trimmed sub‐rectangle of `bitmap` into (dx,dy) scaled to (boxW x boxH).
             */
            drawSpriteScaled(bitmap, sx, sy, sw, sh, dx, dy, boxW, boxH) {
                const scaleX = boxW / sw;
                const scaleY = boxH / sh;
                const scale = Math.min(scaleX, scaleY);

                const finalW = Math.floor(sw * scale);
                const finalH = Math.floor(sh * scale);
                const offsetX = dx + Math.floor((boxW - finalW) / 2);
                const offsetY = dy + Math.floor((boxH - finalH) / 2);

                this.contents.blt(bitmap, sx, sy, sw, sh, offsetX, offsetY, finalW, finalH);
            }

            /**
             * Get the max HP from actor or enemy
             */
            getMaxHP(battler) {
                if (battler._actor) {
                    return battler._actor.mhp;
                } else if (battler._enemy) {
                    // param(0) = max HP
                    return battler._enemy.param(0);
                }
                return 1;
            }
        }


        // DataManager
        const _DataManager_createGameObjects = DataManager.createGameObjects;
        DataManager.createGameObjects = function() {
            _DataManager_createGameObjects.call(this);
            //  PTBS_Manager.initialize();
        };

        // Game_Player - block normal movement if PTBS is active
        const _Game_Player_canMove = Game_Player.prototype.canMove;
        Game_Player.prototype.canMove = function() {
            if (PTBS_Manager.isActive()) {
                return false;
            }
            return _Game_Player_canMove.call(this);
        };

        const _Game_Player_updateScroll = Game_Player.prototype.updateScroll;
        Game_Player.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
            if (PTBS_Manager.isActive()) {
                return; // Disable player scrolling completely
            }
            _Game_Player_updateScroll.call(this, lastScrolledX, lastScrolledY);
        };

        // First we have the existing Game_Event update override
        const _Game_Event_update = Game_Event.prototype.update;
        Game_Event.prototype.update = function() {
            _Game_Event_update.call(this);
        };

        const _Game_Event_start = Game_Event.prototype.start;
        Game_Event.prototype.start = function() {
            if (this._starting || this._processingPTBS) return;

            if (PTBS_Manager.isActive() && eventHasPTBSEventTag(this)) {
                this._starting = true;
                this._processingPTBS = true;

                if ($gameMap._interpreter) {
                    $gameMap._interpreter._waitMode = ""; // Release any PTBS pause
                }

                // Set the flag if this is an autorun event (trigger === 3)
                if (this.page().trigger === 3) {
                    PTBS_Manager._activeAutorunPTBSEvent = true;
                }

                const interpreter = new Game_Interpreter();
                interpreter.setup(this.list(), this._eventId);
                this._interpreter = interpreter;

                this._interpreter.update();

                if (!this._ptbsEventCheckInterval) {
                    this._ptbsEventCheckInterval = setInterval(() => {
                        if (!this._interpreter || !this._interpreter.isRunning()) {
                            clearInterval(this._ptbsEventCheckInterval);
                            this._ptbsEventCheckInterval = null;

                            // Mark event done
                            PTBS_Manager._activeAutorunPTBSEvent = false;

                            // Resume the turn or AI
                            const current = PTBS_Manager.selectedBattler();
                            if (current && PTBS_AI.isControlledByAI(current)) {
                                PTBS_AI.performAction(current);
                            } else {
                                PTBS_Manager._state = "command"; // let player act
                            }

                            this._starting = false;
                            this._processingPTBS = false;
                        }
                    }, 100);
                }
            } else {
                _Game_Event_start.call(this);
            }
        };

        Game_Event.prototype.checkPTBSEventTrigger = function() {
            if (!this.isTriggerIn([1, 2]) || this._erased) return false;
            if (!eventHasPTBSEventTag(this)) return false;

            // Check if any battler is on this event's tile
            const battlers = PTBS_Manager._battlers;
            for (const battler of battlers) {
                if (battler.event().x === this.x && battler.event().y === this.y) {
                    return true;
                }
            }
            return false;
        };

        const _Game_Event_clearStartingFlag = Game_Event.prototype.clearStartingFlag;
        Game_Event.prototype.clearStartingFlag = function() {
            _Game_Event_clearStartingFlag.call(this);
        };

        // Game_Event - disable autonomous movement if PTBS is active (unless forced)
        const _Game_Event_updateRoutineMove = Game_Event.prototype.updateRoutineMove;
        Game_Event.prototype.updateRoutineMove = function() {
            if (PTBS_Manager.isActive() && !this._moveRouteForcing) {
                return;
            }
            _Game_Event_updateRoutineMove.call(this);
        };

        // PTBS Pause Menu Addon (optional)
        (() => {
            const _Scene_Map_isMenuEnabled = Scene_Map.prototype.isMenuEnabled;
            Scene_Map.prototype.isMenuEnabled = function() {
                if (PTBS_Manager.isActive()) {
                    return false;
                }
                return _Scene_Map_isMenuEnabled.call(this);
            };

            class Window_PTBSBattlePauseCommand extends Window_Command {
                initialize(rect) {
                    super.initialize(rect);
                    this.openness = 0;
                    this.deactivate();
                }
                makeCommandList() {
                    this.addCommand("Resume Game", "resume");
                    this.addCommand("Save Game",   "save");
                    this.addCommand("End Game",    "end");
                }
            }

            const _Scene_Map_createAllWindows_PAUSEPATCH = Scene_Map.prototype.createAllWindows;
            Scene_Map.prototype.createAllWindows = function() {
                _Scene_Map_createAllWindows_PAUSEPATCH.call(this);
                this.createPTBSPauseWindow();
            };

            Scene_Map.prototype.createPTBSPauseWindow = function() {
                const ww = 220, wh = this.calcWindowHeight(3, true);
                const wx = (Graphics.width - ww) / 2;
                const wy = (Graphics.height - wh) / 2;
                const rect = new Rectangle(wx, wy, ww, wh);
                this._ptbsPauseWindow = new Window_PTBSBattlePauseCommand(rect);
                this._ptbsPauseWindow.setHandler("resume", this.commandPTBSPause_Resume.bind(this));
                this._ptbsPauseWindow.setHandler("save",   this.commandPTBSPause_Save.bind(this));
                this._ptbsPauseWindow.setHandler("end",    this.commandPTBSPause_End.bind(this));
                // **Add this line:**
                this._ptbsPauseWindow.setHandler("cancel", this.commandPTBSPause_Resume.bind(this));
                this.addWindow(this._ptbsPauseWindow);
            };

            Scene_Map.prototype.commandPTBSPause_Resume = function() {
                // When resuming, change back to command state.
                PTBS_Manager._state = "command";
                this._ptbsPauseWindow.close();
                this._ptbsPauseWindow.deactivate();
                if (PTBS_Manager.state() === "command") {
                    this._ptbsCommandWindow.open();
                    this._ptbsCommandWindow.activate();
                    this._ptbsCommandWindow.select(0);
                }
            };

            Scene_Map.prototype.commandPTBSPause_Save = function() {
                SceneManager.push(Scene_Save);
                this._ptbsPauseWindow.close();
                this._ptbsPauseWindow.deactivate();
                if (PTBS_Manager.state() === "command") {
                    this._ptbsCommandWindow.open();
                    this._ptbsCommandWindow.activate();
                    this._ptbsCommandWindow.select(0);
                }
            };

            Scene_Map.prototype.commandPTBSPause_End = function() {
                location.reload();
            };



            const _Sprite_Character_updatePosition = Sprite_Character.prototype.updatePosition;
            Sprite_Character.prototype.updatePosition = function() {
                _Sprite_Character_updatePosition.call(this);

                // If PTBS is active and this character is a PTBS battler, apply the pixel offset
                if (PTBS_Manager.isActive()) {
                    const ev = this._character;
                    const battler = PTBS_Manager._battlers.find(b => b.event() === ev);
                    if (battler && battler._pixelOffsetX !== undefined) {
                        this.x += battler._pixelOffsetX;
                        this.y += battler._pixelOffsetY;
                    }
                }
            };
            /******************************************************************************
             * PTBS - ICON RENDERING PATCH (TWO SPRITE APPROACH + tween)
             ******************************************************************************/
            // Step A: Save the original initMembers
            const _Sprite_Character_initMembers = Sprite_Character.prototype.initMembers;
            Sprite_Character.prototype.initMembers = function() {
                _Sprite_Character_initMembers.call(this);
                // A dictionary of all currently active "loop animations"
                // keyed by animationId => the Sprite_Animation instance
                this._loopAnimations = {};

                // If you’re also doing overhead icons in this same place:
                this._iconPairs = {};
            };

            // Step B: Hook into update
            const _Sprite_Character_update = Sprite_Character.prototype.update;
            Sprite_Character.prototype.update = function() {
                // First, run the base update
                _Sprite_Character_update.call(this);

                // If PTBS is active, manage looping animations
                if (PTBS_Manager.isActive()) {
                    this.updateLoopingStateAnimations();

                    // Also optional overhead icons:
                    this.updateTwoSpriteIcons();
                } else {
                    // PTBS not active => remove all loop animations
                    this.clearAllLoopAnimations();
                    // Also remove overhead icons if relevant:
                    this.cleanupAllIconPairs();
                }
            };


            //--------------------------------------------------------------------------
            // Looping State Animations
            //--------------------------------------------------------------------------

            /**
             * createLoopAnimation(animationId)
             * Creates or re-creates a looping animation (either MV or MZ style) for this character.
             * Returns the sprite instance (or null).
             */

            // Modify the Sprite_Character.createLoopAnimation method
            Sprite_Character.prototype.createLoopAnimation = function(animationId) {
                // Check if this animation already exists in the shared pool
                if (PTBS_Manager._sharedAnimations[animationId]) {
                    // Add this sprite as a target
                    PTBS_Manager._sharedAnimations[animationId].addTarget(this);
                    // Store reference to shared animation
                    this._loopAnimations[animationId] = PTBS_Manager._sharedAnimations[animationId];
                    return PTBS_Manager._sharedAnimations[animationId];
                }

                const dataAnim = $dataAnimations[animationId];
                if (!dataAnim) return null;

                const scene = SceneManager._scene;
                const spriteset = scene && scene._spriteset;
                if (!spriteset) return null;

                let sprite;

                // Handle MV-style animations
                if (!dataAnim.effectName) {
                    sprite = new Sprite();
                    sprite.anchor.x = 0.5;
                    sprite.anchor.y = 0.5;
                    sprite.z = 8;

                    const container = spriteset._tilemap;
                    if (!container) return null;
                    container.addChild(sprite);

                    sprite._animationId = animationId;
                    sprite._targets = [this];
                    sprite._animationData = dataAnim;
                    sprite._individualSprites = {};

                    // Create individual animations for each target
                    sprite._createIndividualAnimations = function() {
                        // Clear previous animations
                        for (const key in this._individualSprites) {
                            if (this._individualSprites[key].parent) {
                                this._individualSprites[key].parent.removeChild(this._individualSprites[key]);
                            }
                        }
                        this._individualSprites = {};

                        // Create a new animation for each target
                        for (const target of this._targets) {
                            const anim = new Sprite_AnimationMV();
                            anim.setup([target], dataAnim, false, 0);
                            container.addChild(anim);

                            // Make it loop
                            anim._maxDuration = anim._duration;
                            const _origUpdate = anim.update;
                            anim.update = function() {
                                _origUpdate.call(this);
                                if (this._duration <= 0) {
                                    this._duration = this._maxDuration;
                                    this._frameIndex = 0;
                                }
                            };

                            // Store with target's ID as key
                            const targetId = target._character._eventId || 'player';
                            this._individualSprites[targetId] = anim;
                        }
                    };

                    // Define target management methods
                    sprite.addTarget = function(target) {
                        if (!this._targets.includes(target)) {
                            this._targets.push(target);
                            // Create an individual animation for the new target
                            const targetId = target._character._eventId || 'player';
                            const anim = new Sprite_AnimationMV();
                            anim.setup([target], dataAnim, false, 0);
                            container.addChild(anim);

                            // Make it loop
                            anim._maxDuration = anim._duration;
                            const _origUpdate = anim.update;
                            anim.update = function() {
                                _origUpdate.call(this);
                                if (this._duration <= 0) {
                                    this._duration = this._maxDuration;
                                    this._frameIndex = 0;
                                }
                            };

                            this._individualSprites[targetId] = anim;
                        }
                    };

                    sprite.removeTarget = function(target) {
                        const index = this._targets.indexOf(target);
                        if (index >= 0) {
                            // Remove the individual animation for this target
                            const targetId = target._character._eventId || 'player';
                            if (this._individualSprites[targetId] && this._individualSprites[targetId].parent) {
                                this._individualSprites[targetId].parent.removeChild(this._individualSprites[targetId]);
                                delete this._individualSprites[targetId];
                            }

                            // Remove from targets list
                            this._targets.splice(index, 1);
                            return this._targets.length === 0;
                        }
                        return false;
                    };

                    sprite.update = function() {
                        Sprite.prototype.update.call(this);
                        // Nothing else needed for MV animations
                    };

                    // Create initial animations
                    sprite._createIndividualAnimations();
                }
                // Handle MZ/Effekseer animations
                else {
                    // Create a wrapper sprite
                    sprite = new Sprite();
                    sprite.anchor.x = 0.5;
                    sprite.anchor.y = 0.5;
                    sprite.z = 8;

                    const container = spriteset._effectsContainer;
                    if (!container) return null;
                    container.addChild(sprite);

                    // Setup the shared animation data
                    sprite._animationId = animationId;
                    sprite._targets = [this];
                    sprite._animationData = dataAnim;
                    sprite._effectsContainer = container;
                    sprite._individualSprites = {};

                    // Method to create individual animations for each target
                    sprite._createIndividualAnimations = function() {
                        // Clear previous animations
                        for (const key in this._individualSprites) {
                            if (this._individualSprites[key].parent) {
                                this._individualSprites[key].parent.removeChild(this._individualSprites[key]);
                            }
                        }
                        this._individualSprites = {};

                        // Create a new animation for each target
                        for (const target of this._targets) {
                            const anim = new Sprite_Animation();
                            anim.setup([target], this._animationData, false, 0);
                            this._effectsContainer.addChild(anim);

                            // Store with target's ID as key
                            const targetId = target._character._eventId || 'player';
                            this._individualSprites[targetId] = anim;
                        }

                        this._animationStartTime = Date.now();
                        this._estimatedDuration = 60;
                    };

                    // Define target management methods
                    sprite.addTarget = function(target) {
                        if (!this._targets.includes(target)) {
                            this._targets.push(target);
                            // Create an individual animation for the new target
                            const targetId = target._character._eventId || 'player';
                            const anim = new Sprite_Animation();
                            anim.setup([target], this._animationData, false, 0);
                            this._effectsContainer.addChild(anim);
                            this._individualSprites[targetId] = anim;
                        }
                    };

                    sprite.removeTarget = function(target) {
                        const index = this._targets.indexOf(target);
                        if (index >= 0) {
                            // Remove the individual animation for this target
                            const targetId = target._character._eventId || 'player';
                            if (this._individualSprites[targetId]) {
                                if (this._individualSprites[targetId].parent) {
                                    this._individualSprites[targetId].parent.removeChild(this._individualSprites[targetId]);
                                }
                                delete this._individualSprites[targetId];
                            }

                            // Remove from targets list
                            this._targets.splice(index, 1);
                            return this._targets.length === 0;
                        }
                        return false;
                    };

                    // Update method to manage animation lifecycle
                    sprite.update = function() {
                        Sprite.prototype.update.call(this);

                        // Check if enough time has passed to recreate animations
                        const elapsed = Date.now() - this._animationStartTime;
                        const frameDuration = 1000 / 60;

                        if (elapsed > this._estimatedDuration * frameDuration) {
                            this._createIndividualAnimations();
                        }
                    };

                    // Create initial animations
                    sprite._createIndividualAnimations();
                }

                // Register in the shared pool
                PTBS_Manager._sharedAnimations[animationId] = sprite;

                // Store in this character's reference
                this._loopAnimations[animationId] = sprite;
                return sprite;
            };

            // Update the removeLoopAnimation method to handle shared animations
            Sprite_Character.prototype.removeLoopAnimation = function(animationId) {
                const sprite = this._loopAnimations[animationId];
                if (sprite) {
                    // Remove this sprite as target
                    if (sprite.removeTarget && sprite.removeTarget(this)) {
                        // If no targets remain, remove from shared pool
                        delete PTBS_Manager._sharedAnimations[animationId];
                        if (sprite.parent) {
                            sprite.parent.removeChild(sprite);
                        }
                    }
                    delete this._loopAnimations[animationId];
                }
            };

            // We also need to modify clearAllLoopAnimations to handle shared animations
            Sprite_Character.prototype.clearAllLoopAnimations = function() {
                for (const animIdStr in this._loopAnimations) {
                    this.removeLoopAnimation(Number(animIdStr));
                }
                this._loopAnimations = {};
            };

            // And update the updateLoopingStateAnimations to handle cleanup better

            /**
             * updateLoopingStateAnimations()
             * - Checks the PTBS_Battler for any "looping_animation" states,
             *   creates them if they're missing, and removes old ones if not needed.
             */
            Sprite_Character.prototype.updateLoopingStateAnimations = function() {
                // If PTBS isn't active, remove everything
                if (!PTBS_Manager.isActive()) {
                    this.clearAllLoopAnimations();
                    return;
                }

                // Find the PTBS_Battler for this character
                const ev = this._character;
                const battler = PTBS_Manager._battlers.find(b => b && b.event() === ev);
                if (!battler) {
                    this.clearAllLoopAnimations();
                    return;
                }

                // Check if battler is dead - if so, remove all animations
                if (battler.currentHP() <= 0) {
                    this.clearAllLoopAnimations();
                    return;
                }

                // Update the battler's state animations list
                battler.updateStateLoopAnimations();

                // Get the list of animation IDs we should be playing
                const desiredAnims = battler._loopedStatesAnimIds || [];

                // Create any new animations that aren't active yet
                for (const animId of desiredAnims) {
                    if (!this._loopAnimations[animId]) {
                        this.createLoopAnimation(animId);
                    }
                }

                // Remove any animations that are no longer needed
                for (const animIdStr in this._loopAnimations) {
                    const animId = Number(animIdStr);
                    if (!desiredAnims.includes(animId)) {
                        this.removeLoopAnimation(animId);
                    }
                }

                // Position all animations above the character
                this.positionLoopAnimations();
            };

            const _Sprite_Character_removeAnimation = Sprite_Character.prototype.removeAnimation;
            Sprite_Character.prototype.removeAnimation = function() {
                // Only call the original method if we don't use custom loop animations
                if (!PTBS_Manager.isActive() || !this._loopAnimations) {
                    _Sprite_Character_removeAnimation.call(this);
                }
                // Otherwise, don't remove animations - we'll manage them ourselves
            };


            /**
             * removeLoopAnimation(animationId)
             * Removes one loop animation sprite from the parent container.
             */
            Sprite_Character.prototype.removeLoopAnimation = function(animationId) {
                const sprite = this._loopAnimations[animationId];
                if (sprite && sprite.parent) {
                    sprite.parent.removeChild(sprite);
                }
                delete this._loopAnimations[animationId];
            };

            /**
             * clearAllLoopAnimations()
             * Removes all looped animations from the scene.
             */
            Sprite_Character.prototype.clearAllLoopAnimations = function() {
                for (const animIdStr in this._loopAnimations) {
                    this.removeLoopAnimation(Number(animIdStr));
                }
                this._loopAnimations = {};
            };

            /**
             * positionLoopAnimations()
             * If you want to keep them above the character’s head, for example.
             */
            Sprite_Character.prototype.positionLoopAnimations = function() {
                for (const animIdStr in this._loopAnimations) {
                    const sprite = this._loopAnimations[animIdStr];
                    if (!sprite) continue;

                    // Position animation directly above character
                    if (sprite instanceof Sprite_AnimationMV) {
                        sprite.x = 0;
                        sprite.y = -this.height;
                        sprite.visible = true;
                    } else {
                        // For Effekseer animations, we need to update their position each frame
                        // Get the screen coordinates of this character
                        const screenX = this.x;
                        const screenY = this.y - this.height;

                        // Update sprite position
                        sprite.x = screenX;
                        sprite.y = screenY;
                        sprite.visible = true;

                        // If there's a handle, update its position too
                        if (sprite._handle && sprite._handle.exists) {
                            sprite.updateEffectGeometry();
                        }
                    }
                }
            };

            /**
             * Sprite_Character.prototype.updateTwoSpriteIcons
             *
             * - Finds the PTBS battler for this event.
             * - Gathers the icons from battler.getAllIcons().
             * - Creates/updates a pair of sprites (front + behind) for each icon.
             * - Applies “idle bobbing” if the battler is idle.
             * - Cleans up icons that are no longer active.
             */

            Sprite_Character.prototype.updateTwoSpriteIcons = function() {
                // 1) If PTBS isn’t active, remove any icon/picture sprites.
                if (!PTBS_Manager.isActive()) {
                    this.cleanupAllIconPairs();
                    return;
                }

                // 2) Find the PTBS battler associated with this character.
                const ev = this._character;
                const battler = PTBS_Manager._battlers.find(b => b && b.event() === ev);
                if (!battler) {
                    this.cleanupAllIconPairs();
                    return;
                }

                // 3) Get all “icon data” from the battler.
                //    This data may represent either an icon (with property "iconId")
                //    or a picture (with property "pictureName").
                const icons = battler.getAllIcons();

                // 4) For each icon data entry, update or create a pair of sprites.
                for (const { index, data } of icons) {
                    // Create a new pair if one doesn’t exist for this slot.
                    if (!this._iconPairs[index]) {
                        this.createTwoSpriteIconPair(index, data);
                    }
                    const iconPair = this._iconPairs[index];
                    if (!iconPair) continue;

                    // (A) Ensure a bobbing counter is present (for idle animation).
                    if (data._bobCounter === undefined) {
                        data._bobCounter = 0;
                    }

                    // (B) Determine whether this battler is “idle” (and should bob).
                    let isIdle = !battler.isInActionSequence();
                    if (battler === PTBS_Manager.selectedBattler()) {
                        if (["move", "attack", "skill", "item"].includes(PTBS_Manager.state())) {
                            isIdle = false;
                        }
                    }
                    if (isIdle) {
                        data._bobCounter++;
                        const amplitude = 1;
                        const speed = 0.15;
                        data._idleBobOffset = amplitude * Math.sin(data._bobCounter * speed);
                    } else {
                        data._idleBobOffset = 0;
                    }

                    // (C) Update any move tween (from imageMove/imageMoveRelative commands).
                    if (data._moveTween) {
                        const tw = data._moveTween;
                        tw.framesLeft = Math.max(0, tw.framesLeft - 1);
                        const t = 1 - (tw.framesLeft / tw.framesTotal);
                        data.offsetX = tw.startX + (tw.endX - tw.startX) * t;
                        data.offsetY = tw.startY + (tw.endY - tw.startY) * t;
                        data.angle   = tw.startAngle + (tw.endAngle - tw.startAngle) * t;
                        data.spin    = tw.startSpin  + (tw.endSpin  - tw.startSpin)  * t;
                        data.opacity = tw.startOpacity + (tw.endOpacity - tw.startOpacity) * t;
                        if (tw.framesLeft <= 0) {
                            data._moveTween = null;
                        }
                    }

                    // (NEW) Update any aiming tween for smooth rotation.
                    if (data._aimTween) {
                        const tween = data._aimTween;
                        tween.framesLeft = Math.max(0, tween.framesLeft - 1);
                        const t = 1 - (tween.framesLeft / tween.framesTotal);
                        data.angle = tween.startAngle + (tween.endAngle - tween.startAngle) * t;
                        if (tween.framesLeft <= 0) {
                            data._aimTween = null;
                        }
                    }

                    // (D) Apply any cumulative spin (if desired).
                    if (typeof data.spin === "number" && data.spin !== 0) {
                        data.angle += data.spin;
                    }

                    // (E) Load the appropriate graphic resource.
                    //     If data.pictureName exists, treat it as a picture;
                    //     otherwise, assume it’s an icon from the IconSet.
                    if (data.pictureName) {
                        const bitmap = ImageManager.loadPicture(data.pictureName);
                        if (bitmap.isReady()) {
                            this.updateIconPairBitmaps(iconPair, data, bitmap, true);
                        } else {
                            bitmap.addLoadListener(() => {
                                this.updateIconPairBitmaps(iconPair, data, bitmap, true);
                            });
                        }
                    } else {
                        const iconset = ImageManager.loadSystem("IconSet");
                        if (iconset.isReady()) {
                            this.updateIconPairBitmaps(iconPair, data, iconset, false);
                        } else {
                            iconset.addLoadListener(() => {
                                this.updateIconPairBitmaps(iconPair, data, iconset, false);
                            });
                        }
                    }

                    // (F) Update the positions (applying offsets, rotation, bobbing, etc.).
                    this.updateIconPairPositions(iconPair, data, ev.direction());

                    // (G) Show the “behind” sprite when facing up or left,
                    //     and the “front” sprite otherwise.
                    const behindVisible = (ev.direction() === 4 || ev.direction() === 8);
                    iconPair.behindSprite.visible = behindVisible;
                    iconPair.frontSprite.visible  = !behindVisible;
                }

                // 5) Remove any icon pairs that are no longer active.
                const activeIndexes = icons.map(i => i.index);
                for (const key of Object.keys(this._iconPairs)) {
                    if (!activeIndexes.includes(key)) {
                        this.destroyTwoSpriteIconPair(key);
                    }
                }
            };




            /** Creates two sprites (front + behind) for a new icon */
            Sprite_Character.prototype.createTwoSpriteIconPair = function(index, data) {
                // 1) front-sprite
                const frontSprite = new Sprite();
                frontSprite.anchor.set(0.5, 0.5);
                this.addChild(frontSprite);

                // 2) behind-sprite in tilemap
                const behindSprite = new Sprite();
                behindSprite.anchor.set(0.5, 0.5);
                const tilemap = SceneManager._scene && SceneManager._scene._spriteset._tilemap;
                if (tilemap) {
                    tilemap.addChild(behindSprite);
                }

                this._iconPairs[index] = {
                    frontSprite,
                    behindSprite,
                    iconData: data
                };
            };

            /** Removes the two sprite pair for a specific icon index. */
            Sprite_Character.prototype.destroyTwoSpriteIconPair = function(index) {
                const iconPair = this._iconPairs[index];
                if (!iconPair) return;

                // remove front
                if (iconPair.frontSprite && iconPair.frontSprite.parent) {
                    iconPair.frontSprite.parent.removeChild(iconPair.frontSprite);
                }
                // remove behind
                if (iconPair.behindSprite && iconPair.behindSprite.parent) {
                    iconPair.behindSprite.parent.removeChild(iconPair.behindSprite);
                }
                delete this._iconPairs[index];
            };

            /** Removes *all* icon pairs (used when PTBS becomes inactive). */
            Sprite_Character.prototype.cleanupAllIconPairs = function() {
                for (const key in this._iconPairs) {
                    this.destroyTwoSpriteIconPair(key);
                }
                this._iconPairs = {};
            };

            /** Set up the sprites’ bitmaps and icon frames. */
            Sprite_Character.prototype.updateIconPairBitmaps = function(iconPair, data, bitmap, isPicture) {
                if (isPicture) {
                    // For pictures, simply use the full bitmap.
                    iconPair.frontSprite.bitmap = bitmap;
                    iconPair.behindSprite.bitmap = bitmap;
                    // Display the full image by setting the frame to cover the entire bitmap.
                    iconPair.frontSprite.setFrame(0, 0, bitmap.width, bitmap.height);
                    iconPair.behindSprite.setFrame(0, 0, bitmap.width, bitmap.height);
                } else {
                    // For icons, use the system IconSet and crop to the proper frame.
                    iconPair.frontSprite.bitmap = bitmap;
                    iconPair.behindSprite.bitmap = bitmap;
                    const iconId = data.iconId || 0;
                    const sx = (iconId % 16) * 32;
                    const sy = Math.floor(iconId / 16) * 32;
                    iconPair.frontSprite.setFrame(sx, sy, 32, 32);
                    iconPair.behindSprite.setFrame(sx, sy, 32, 32);
                }
            };


            /**
             * Positions (and rotates) the two sprites for a given icon data.
             * We also factor in the new `data._idleBobOffset`.
             */
            Sprite_Character.prototype.updateIconPairPositions = function(iconPair, data, direction) {
                // Combine base offsets + any directional offset
                // plus the new "idle bob" offset
                const finalOffsetX = (data.offsetX || 0) + (data._dirOffX || 0);
                const finalOffsetY = (data.offsetY || 0) + (data._dirOffY || 0) + (data._idleBobOffset || 0);

                // FRONT sprite
                const fSprite = iconPair.frontSprite;
                fSprite.x = finalOffsetX;
                // a typical formula is "this.y - (this.height * 0.5)" but we
                // do that in the higher-level code. Your code might differ slightly.
                fSprite.y = -(this.height * 0.5) + finalOffsetY;
                fSprite.rotation = (data.angle || 0) * (Math.PI / 180);
                fSprite.opacity  = data.opacity !== undefined ? data.opacity : 255;

                // (Optional) If you want to flip horizontally when facing right, for example:
                // (This is just an example condition.)
                if (direction === 6) { // 6 = right
                    fSprite.scale.y = -1;
                } else {
                    fSprite.scale.y = 1;
                }

                // BEHIND sprite (drawn on the tilemap)
                // position it in full map coords:
                const bSprite = iconPair.behindSprite;
                bSprite.x = this.x + finalOffsetX;
                bSprite.y = this.y - (this.height * 0.5) + finalOffsetY;
                bSprite.rotation = fSprite.rotation;
                bSprite.opacity  = fSprite.opacity;

                // Make sure behind sprite’s scale matches the front sprite
                bSprite.scale.x = fSprite.scale.x;
                bSprite.scale.y = fSprite.scale.y;
            };

            const _Game_Interpreter_update = Game_Interpreter.prototype.update;
            Game_Interpreter.prototype.update = function() {
                if (PTBS_Manager.isActive()) {
                    if (this === $gameMap._interpreter) {
                        const event = this._eventId ? $gameMap.event(this._eventId) : null;
                        if (event && event.page() && event.page().trigger === 3) { // Autorun check
                            if (eventHasPTBSEventTag(event)) {
                                // Allow autorun events with <PTBS EVENT> to proceed
                                _Game_Interpreter_update.call(this);
                                return;
                            } else {
                                // Block other autorun events during PTBS
                                return;
                            }
                        }
                    }
                } else {
                    // Resume paused autorun events after PTBS ends
                    if (PTBS_Manager._pausedEventData && PTBS_Manager._pausedEventData.eventId === this._eventId) {
                            return; // Let deactivate() handle restoration
                    }
                }
                _Game_Interpreter_update.call(this);
            };

            const _Game_Interpreter_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
            Game_Interpreter.prototype.updateWaitMode = function() {
                if (this._waitMode === "ptbsPause") {
                    if (PTBS_Manager.isActive()) {
                        return true;
                    } else {
                        this._waitMode = "";
                    }
                }
                return _Game_Interpreter_updateWaitMode.call(this);
            };


            // Save the original update method.
            const _Game_Player_update = Game_Player.prototype.update;
            Game_Player.prototype.update = function(sceneActive) {
                _Game_Player_update.call(this, sceneActive);
                // If PTBS is active, force check for touch events
                if (PTBS_Manager.isActive()) {
                    this.checkEventTriggerTouchForced();
                }
            };

            // Create a forced version that bypasses the canMove() check
            Game_Player.prototype.checkEventTriggerTouchForced = function() {
                if ($gameMap.isEventRunning()) return;  // Don't trigger while another event is running

                const events = $gameMap.eventsXy(this.x, this.y);
                for (const event of events) {
                    if (event.isTriggerIn([2]) && !event._erased && eventHasPTBSEventTag(event)) {
                        event.start();
                        return; // Stop after starting ONE event
                    }
                }
            };

            const _Sprite_Animation_prototype_updateEffectGeometry = Sprite_Animation.prototype.updateEffectGeometry;
            Sprite_Animation.prototype.updateEffectGeometry = function() {
                _Sprite_Animation_prototype_updateEffectGeometry.call(this);

                if (this._rotationAngle !== undefined && this._handle) {
                    // Get the base rotation from the database (in degrees)
                    const baseRotation = this._animation.rotation?.z || 0;

                    // Get the battler's direction rotation from the action sequence (in degrees)
                    const directionRotation = this._rotationAngle;

                    // Convert RPG Maker direction to Effekseer's system
                    let effekseerDirection;
                    switch (directionRotation) {
                        case 0:   // Up
                            effekseerDirection = 0; // Effekseer up
                            break;
                        case 90:  // Right
                            effekseerDirection = 270;  // FIXED: Effekseer right uses 270 degrees
                            break;
                        case 180: // Down
                            effekseerDirection = 180;   // Effekseer down
                            break;
                        case 270: // Left
                            effekseerDirection = 90; // FIXED: Effekseer left uses 90 degrees
                            break;
                        default:
                            effekseerDirection = directionRotation; // Fallback
                    }

                    // Final rotation is just the Effekseer direction
                    // No need for complex sign flipping since we've already mapped the directions correctly
                    const totalRotation = effekseerDirection + baseRotation;
                    const normalizedRotation = (totalRotation + 360) % 360; // Ensure positive

                    // Convert to radians
                    const rad = (normalizedRotation * Math.PI) / 180;

                    // Apply Z rotation only
                    this._handle.setRotation(0, 0, rad);
                }
            };

            const _Game_Switches_setValue = Game_Switches.prototype.setValue;
            Game_Switches.prototype.setValue = function(switchId, value) {
                _Game_Switches_setValue.call(this, switchId, value);
                // Call onChange directly with the switchId
                this.onChange(switchId);
            };

            const _Game_Switches_onChange = Game_Switches.prototype.onChange;
            Game_Switches.prototype.onChange = function(switchId) {
                _Game_Switches_onChange.call(this);
                if (PTBS_Manager.isActive()) {
                    PTBS_Manager.refreshBattlersOnSwitchChange(switchId);
                }
            };

            // Add to TouchInput initialization or extend the existing method
            const _TouchInput_initialize = TouchInput.initialize;
            TouchInput.initialize = function() {
                _TouchInput_initialize.call(this);
                this._mouseMovedTime = 0;
            };

            // Add mouse movement tracking
            const _TouchInput_onMouseMove = TouchInput._onMouseMove;
            TouchInput._onMouseMove = function(event) {
                _TouchInput_onMouseMove.call(this, event);
                this._mouseMovedTime = Date.now();
            };

            const _TouchInput_update = TouchInput.update;
            TouchInput.update = function() {
                _TouchInput_update.call(this);

                // Reset mouse moved time after a certain period of inactivity
                if (this._mouseMovedTime && Date.now() - this._mouseMovedTime > 500) {
                    this._mouseMovedTime = 0;
                }
            };

            // Convert screen X coordinate to map X coordinate
            Game_Map.prototype.canvasToMapX = function(x) {
                const tileWidth = this.tileWidth();
                const originX = this._displayX * tileWidth;
                return (originX + x) / tileWidth;
            };

            // Convert screen Y coordinate to map Y coordinate
            Game_Map.prototype.canvasToMapY = function(y) {
                const tileHeight = this.tileHeight();
                const originY = this._displayY * tileHeight;
                return (originY + y) / tileHeight;
            };

            const _Game_Map_scrollDistance = Game_Map.prototype.scrollDistance;
            Game_Map.prototype.scrollDistance = function() {
                if (PTBS_Manager.isActive()) {
                    return 1; // Use a constant small value for predictable scrolling
                }
                return _Game_Map_scrollDistance.call(this);
            };





        })();

})();
