/*:
 * @target MZ
 * @plugindesc Psychronic Battle Engine (Event-Driven Fixed with Projectiles and Actor Positioning)
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @param actorBattlerSettings
 * @text Actor Battler Settings
 * @type struct<BattlerSettings>
 * @default {"type":"SV","charsetSpeed":"12"}
 *
 * @param enemyBattlerSettings
 * @text Enemy Battler Settings
 * @type struct<BattlerSettings>
 * @default {"type":"SV","charsetSpeed":"12"}
 *
 * @param battleOrientation
 * @text Battle Orientation
 * @type select
 * @option Horizontal
 * @option Vertical
 * @default Horizontal
 *
 * @param actorPositions
 * @text Actor Positions
 * @type struct<ActorPositions>
 * @default {"actor1X":"450","actor1Y":"545","actor2X":"620","actor2Y":"545","actor3X":"790","actor3Y":"545","actor4X":"960","actor4Y":"545","actor5X":"1130","actor5Y":"545","actor6X":"110","actor6Y":"545","actor7X":"280","actor7Y":"545","actor8X":"450","actor8Y":"395"}
 *
 * @param enableCustomPositions
 * @text Enable Custom Actor Positions
 * @type boolean
 * @default true
 * @desc Enable custom actor positioning. If false, uses default MZ positioning.
 *
 * @param stateOverlaySpeed
 * @text State Overlay Animation Speed
 * @type number
 * @min 1
 * @max 100
 * @default 4
 * @desc Animation speed multiplier for state overlays (poison, etc.). Lower = faster.
 *
 * @param enableActorEscape
 * @text Enable Actor Escape Command
 * @type boolean
 * @default true
 * @desc Add an Escape command to the actor command window during battle.
 *
 * @param escapeCommandText
 * @text Escape Command Text
 * @type string
 * @default Escape
 * @desc The text to display for the escape command.
 *
 * @param enemyStateDisplay
 * @text Enemy State Display
 * @type select
 * @option None
 * @option Icons Only
 * @option Animations Only
 * @option Both
 * @default Icons Only
 * @desc How to display states on enemies: icons, animations, both, or none.
 *
 * @param enemyStateIconOffsetX
 * @text Enemy State Icon Offset X
 * @type number
 * @min -500
 * @max 500
 * @default 0
 * @desc X position offset for enemy state icons.
 *
 * @param enemyStateIconOffsetY
 * @text Enemy State Icon Offset Y
 * @type number
 * @min -500
 * @max 500
 * @default 0
 * @desc Y position offset for enemy state icons.
 *
 * @param enemyStateAnimOffsetX
 * @text Enemy State Animation Offset X
 * @type number
 * @min -500
 * @max 500
 * @default 0
 * @desc X position offset for enemy state animations/overlays.
 *
 * @param enemyStateAnimOffsetY
 * @text Enemy State Animation Offset Y
 * @type number
 * @min -500
 * @max 500
 * @default 0
 * @desc Y position offset for enemy state animations/overlays.
 *
 * @param damageFontSize
 * @text Damage Popup Font Size
 * @type number
 * @min 16
 * @max 72
 * @default 32
 * @desc Font size for damage popups.
 *
 * @param damageDigitWidth
 * @text Damage Digit Width Multiplier
 * @type number
 * @decimals 2
 * @min 0.5
 * @max 2.0
 * @default 1.0
 * @desc Width multiplier for each digit (1.0 = auto, higher = more spacing).
 *
 * @param damageOutlineWidth
 * @text Damage Outline Width
 * @type number
 * @min 0
 * @max 10
 * @default 5
 * @desc Outline width for damage numbers (0 = no outline).
 *
 * @param damagePopupDuration
 * @text Damage Popup Duration
 * @type number
 * @min 30
 * @max 180
 * @default 90
 * @desc How long damage popups stay visible (in frames).
 *
 * @param hpDamageColor
 * @text HP Damage Color
 * @type string
 * @default #ffffff
 * @desc Color for HP damage (hex code, e.g., #ffffff for white).
 *
 * @param hpHealColor
 * @text HP Heal Color
 * @type string
 * @default #80ff80
 * @desc Color for HP recovery (hex code, e.g., #80ff80 for green).
 *
 * @param mpDamageColor
 * @text MP Damage Color
 * @type string
 * @default #ffffff
 * @desc Color for MP damage (hex code, e.g., #ffffff for white).
 *
 * @param mpHealColor
 * @text MP Heal Color
 * @type string
 * @default #80b0ff
 * @desc Color for MP recovery (hex code, e.g., #80b0ff for blue).
 *
 * @param damagePopupOffsetX
 * @text Damage Popup Offset X
 * @type number
 * @min -500
 * @max 500
 * @default 0
 * @desc X position offset for damage popups (relative to battler).
 *
 * @param damagePopupOffsetY
 * @text Damage Popup Offset Y
 * @type number
 * @min -500
 * @max 500
 * @default -40
 * @desc Y position offset for damage popups (relative to battler, negative = above).
 *
 */

/*~struct~BattlerSettings:
 * @param type
 * @text Type
 * @type select
 * @option Static
 * @option SV
 * @option Charset
 * @default SV
 *
 * @param charsetSpeed
 * @text Charset Speed
 * @type number
 * @min 1
 * @default 12
 * @desc Frame speed for charset battlers. Only applies if Type is Charset.
 */

/*~struct~ActorPositions:
 * @param actor1X
 * @text Actor 1 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 450
 * @desc X coordinate for Actor 1 in battle
 *
 * @param actor1Y
 * @text Actor 1 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 1 in battle
 *
 * @param actor2X
 * @text Actor 2 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 620
 * @desc X coordinate for Actor 2 in battle
 *
 * @param actor2Y
 * @text Actor 2 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 2 in battle
 *
 * @param actor3X
 * @text Actor 3 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 790
 * @desc X coordinate for Actor 3 in battle
 *
 * @param actor3Y
 * @text Actor 3 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 3 in battle
 *
 * @param actor4X
 * @text Actor 4 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 960
 * @desc X coordinate for Actor 4 in battle
 *
 * @param actor4Y
 * @text Actor 4 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 4 in battle
 *
 * @param actor5X
 * @text Actor 5 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 1130
 * @desc X coordinate for Actor 5 in battle
 *
 * @param actor5Y
 * @text Actor 5 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 5 in battle
 *
 * @param actor6X
 * @text Actor 6 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 110
 * @desc X coordinate for Actor 6 in battle
 *
 * @param actor6Y
 * @text Actor 6 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 6 in battle
 *
 * @param actor7X
 * @text Actor 7 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 280
 * @desc X coordinate for Actor 7 in battle
 *
 * @param actor7Y
 * @text Actor 7 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 545
 * @desc Y coordinate for Actor 7 in battle
 *
 * @param actor8X
 * @text Actor 8 X Position
 * @type number
 * @min 0
 * @max 2000
 * @default 450
 * @desc X coordinate for Actor 8 in battle
 *
 * @param actor8Y
 * @text Actor 8 Y Position
 * @type number
 * @min 0
 * @max 2000
 * @default 395
 * @desc Y coordinate for Actor 8 in battle
 *
 */

(function() {
    const pluginName = "PSYCHRONIC_BattleEngineMZ";
    const params = PluginManager.parameters(pluginName);
    const actorSettings = JSON.parse(params.actorBattlerSettings || '{}');
    const enemySettings = JSON.parse(params.enemyBattlerSettings || '{}');
    const actorBattlerType = actorSettings.type || 'SV';
    const enemyBattlerType = enemySettings.type || 'SV';
    const actorCharsetSpeed = Number(actorSettings.charsetSpeed) || 12;
    const enemyCharsetSpeed = Number(enemySettings.charsetSpeed) || 12;
    const battleOrientation = params.battleOrientation || 'Horizontal';
    const enableCustomPositions = params.enableCustomPositions === 'true';
    const stateOverlaySpeed = Number(params.stateOverlaySpeed) || 4;

    // Parse actor positions
    const actorPositionsData = JSON.parse(params.actorPositions || '{}');
    const actorPositions = {
        1: { x: Number(actorPositionsData.actor1X) || 450, y: Number(actorPositionsData.actor1Y) || 545 },
 2: { x: Number(actorPositionsData.actor2X) || 620, y: Number(actorPositionsData.actor2Y) || 545 },
 3: { x: Number(actorPositionsData.actor3X) || 790, y: Number(actorPositionsData.actor3Y) || 545 },
 4: { x: Number(actorPositionsData.actor4X) || 960, y: Number(actorPositionsData.actor4Y) || 545 },
 5: { x: Number(actorPositionsData.actor5X) || 1130, y: Number(actorPositionsData.actor5Y) || 545 },
 6: { x: Number(actorPositionsData.actor6X) || 110, y: Number(actorPositionsData.actor6Y) || 545 },
 7: { x: Number(actorPositionsData.actor7X) || 280, y: Number(actorPositionsData.actor7Y) || 545 },
 8: { x: Number(actorPositionsData.actor8X) || 450, y: Number(actorPositionsData.actor8Y) || 395 }
    };

    // Debug counters and tracking
    let stepBackCallCount = 0;
    let lastResetTime = Date.now();
    const callSources = new Map();
    const MAX_CALLS_PER_SECOND = 10; // Threshold for spam detection
    const enableActorEscape = params.enableActorEscape === 'true';
    const escapeCommandText = params.escapeCommandText || 'Escape';

    // Enemy state display parameters
    const enemyStateDisplay = params.enemyStateDisplay || 'Icons Only';
    const enemyStateIconOffsetX = Number(params.enemyStateIconOffsetX) || 0;
    const enemyStateIconOffsetY = Number(params.enemyStateIconOffsetY) || 0;
    const enemyStateAnimOffsetX = Number(params.enemyStateAnimOffsetX) || 0;
    const enemyStateAnimOffsetY = Number(params.enemyStateAnimOffsetY) || 0;

    // Damage popup parameters
    const damageFontSize = Number(params.damageFontSize) || 32;
    const damageDigitWidth = Number(params.damageDigitWidth) || 1.0;
    const damageOutlineWidth = Number(params.damageOutlineWidth) || 5;
    const damagePopupDuration = Number(params.damagePopupDuration) || 90;
    const hpDamageColor = params.hpDamageColor || '#ffffff';
    const hpHealColor = params.hpHealColor || '#80ff80';
    const mpDamageColor = params.mpDamageColor || '#ffffff';
    const mpHealColor = params.mpHealColor || '#80b0ff';
    const damagePopupOffsetX = Number(params.damagePopupOffsetX) || 0;
    const damagePopupOffsetY = Number(params.damagePopupOffsetY) !== undefined ? Number(params.damagePopupOffsetY) : -40;

    // ===== STATE ANIMATION ROW NOTETAG PROCESSING =====

    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        if (!DataManager._psychronicBattleEngineLoaded) {
            this.processPsychronicBattleEngineNotetags();
            DataManager._psychronicBattleEngineLoaded = true;
        }
        return true;
    };

    DataManager.processPsychronicBattleEngineNotetags = function() {
        // Process State notetags for custom animation rows
        for (let i = 1; i < $dataStates.length; i++) {
            if ($dataStates[i]) {
                this.processStateAnimationRow($dataStates[i]);
            }
        }
    };

    DataManager.processStateAnimationRow = function(state) {
        state.customAnimationRow = null;

        const notedata = state.note.split(/[\r\n]+/);
        for (let i = 0; i < notedata.length; i++) {
            const line = notedata[i];
            // Check for <animationRow: X>
            if (line.match(/<animationRow:\s*(\d+)>/i)) {
                state.customAnimationRow = parseInt(RegExp.$1);
                break;
            }
        }
    };

    // Override stateOverlayIndex to check for custom animation rows
    const _Game_BattlerBase_stateOverlayIndex = Game_BattlerBase.prototype.stateOverlayIndex;
    Game_BattlerBase.prototype.stateOverlayIndex = function() {
        const states = this.states();
        if (states.length > 0) {
            const state = states[0];
            // Check for custom animation row first
            if (state.customAnimationRow !== null && state.customAnimationRow !== undefined) {
                console.log(`🎨 Using custom animation row ${state.customAnimationRow} for state ${state.name}`);
                return state.customAnimationRow;
            }
            // Fall back to default overlay property
            if (state.overlay > 0) {
                console.log(`🎨 Using default overlay ${state.overlay} for state ${state.name}`);
            }
            return state.overlay;
        }
        return 0;
    };

    // ===== THROWABLE PROJECTILE SYSTEM =====

    function parseThrowObjectData(item) {
        if (!item || !item.note) return null;

        const noteData = item.note;
        const throwRegex = /<throw\s+object:\s*(\w+)>([\s\S]*?)<\/throw\s+object>/gi;
        const projectiles = new Map();
        let match;

        while ((match = throwRegex.exec(noteData)) !== null) {
            const identifier = match[1].toLowerCase();
            const content = match[2];

            const throwData = {
                identifier: identifier,
                image: null,
                duration: 30,
                speed: 60,
                arc: 0,
                spin: 0,
                start: { x: 0, y: 0 },
                se: null
            };

            const lines = content.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                if (trimmed.startsWith('image:')) {
                    const imageMatch = trimmed.match(/image:\s*icon\s+(\d+)/i);
                    if (imageMatch) {
                        throwData.image = parseInt(imageMatch[1]);
                    }
                } else if (trimmed.startsWith('duration:')) {
                    const durationMatch = trimmed.match(/duration:\s*(\d+)/);
                    if (durationMatch) {
                        throwData.duration = parseInt(durationMatch[1]);
                    }
                } else if (trimmed.startsWith('speed:')) {
                    const speedMatch = trimmed.match(/speed:\s*(\d+)/);
                    if (speedMatch) {
                        throwData.speed = parseInt(speedMatch[1]);
                    }
                } else if (trimmed.startsWith('arc:')) {
                    const arcMatch = trimmed.match(/arc:\s*(-?\d+)/);
                    if (arcMatch) {
                        throwData.arc = parseInt(arcMatch[1]);
                    }
                } else if (trimmed.startsWith('spin:')) {
                    const spinMatch = trimmed.match(/spin:\s*(-?\d+)/);
                    if (spinMatch) {
                        throwData.spin = parseInt(spinMatch[1]);
                    }
                } else if (trimmed.startsWith('start:')) {
                    const startMatch = trimmed.match(/start:\s*(-?\d+),\s*(-?\d+)/);
                    if (startMatch) {
                        throwData.start.x = parseInt(startMatch[1]);
                        throwData.start.y = parseInt(startMatch[2]);
                    }
                } else if (trimmed.startsWith('se:')) {
                    const seMatch = trimmed.match(/se:\s*play,\s*([^,]+),\s*(\d+),\s*(\d+),\s*(-?\d+)/);
                    if (seMatch) {
                        throwData.se = {
                            name: seMatch[1].trim(),
 volume: parseInt(seMatch[2]),
 pitch: parseInt(seMatch[3]),
 pan: parseInt(seMatch[4])
                        };
                    }
                }
            }

            projectiles.set(identifier, throwData);
        }

        return projectiles.size > 0 ? projectiles : null;
    }

    class BattleTimingManager {
        constructor() {
            this.config = {
                frameRate: 60,
                frameToMs: 16.67,
                sequenceDelay: {
                    normal: 1,
                    victory: 1,
                    entry: 1,
                    collapse: 1
                },
                commandDelay: {
                    motion: 1,
                    direction: 1,
                    wait: null,
                    move: null,
                    animation: 100,
                    icon: 1,
                    opacity: null,
                    jump: null,
                    se: 1,
                    execute: 30
                },
                movement: {
                    defaultFrames: 40,
                        stepFrames: 25,
                        returnFrames: 40,
                        jumpFrames: 30
                },
                waiting: {
                    stillThreshold: 0.3,
                    checkInterval: 16,
                    maxWaitTime: 3000,
                    requiredStillFrames: 5
                }
            };
        }

        framesToMs(frames) {
            return Math.max(frames * this.config.frameToMs, this.config.frameToMs);
        }

        getSequenceDelay(sequenceType, isLooping = false) {
            if (isLooping && (sequenceType === 'victory' || sequenceType === 'entry')) {
                return this.config.sequenceDelay[sequenceType] || this.config.sequenceDelay.normal;
            }
            return this.config.sequenceDelay.normal;
        }

        getCommandDelay(commandType, customFrames = null, sequenceType = 'normal') {
            const baseDelay = this.config.commandDelay[commandType];

            if (baseDelay === null && customFrames !== null) {
                return this.framesToMs(customFrames);
            }

            if (sequenceType === 'victory' || sequenceType === 'entry') {
                return Math.max(baseDelay || this.config.sequenceDelay.normal,
                                this.config.sequenceDelay[sequenceType]);
            }

            return baseDelay || this.config.sequenceDelay.normal;
        }

        executeWithDelay(executeFunction, commandType, options = {}) {
            const {
                customFrames = null,
                sequenceType = 'normal',
                isLooping = false,
                callback = () => {}
            } = options;

            executeFunction();

            let delay;
            if (commandType === 'wait' && customFrames) {
                delay = this.framesToMs(customFrames);
            } else {
                delay = this.getCommandDelay(commandType, customFrames, sequenceType);
            }

            if (isLooping && (sequenceType === 'victory' || sequenceType === 'entry')) {
                delay = Math.max(delay, this.getSequenceDelay(sequenceType, true));
            }

            setTimeout(callback, delay);
        }

        waitForMovementComplete(sprites, callback, maxWaitOverride = null) {
            const config = this.config.waiting;
            const maxWait = maxWaitOverride || config.maxWaitTime;
            let elapsed = 0;

            const spriteStates = sprites.map(sprite => ({
                sprite: sprite,
                lastX: sprite.x,
                lastY: sprite.y,
                stillFrames: 0,
                isStill: false,
                positionHistory: [],
                maxVelocity: 0
            }));

            const checkMovements = () => {
                elapsed += config.checkInterval;
                let allComplete = true;

                for (const state of spriteStates) {
                    if (state.isStill) continue;

                    const deltaX = Math.abs(state.sprite.x - state.lastX);
                    const deltaY = Math.abs(state.sprite.y - state.lastY);
                    const totalMovement = deltaX + deltaY;

                    state.positionHistory.push({
                        x: state.sprite.x,
                        y: state.sprite.y,
                        time: elapsed
                    });

                    if (state.positionHistory.length > 10) {
                        state.positionHistory.shift();
                    }

                    if (state.positionHistory.length >= 5) {
                        const recent = state.positionHistory.slice(-5);
                        let maxRecentVelocity = 0;

                        for (let i = 1; i < recent.length; i++) {
                            const vDeltaX = recent[i].x - recent[i-1].x;
                            const vDeltaY = recent[i].y - recent[i-1].y;
                            const velocity = Math.sqrt(vDeltaX * vDeltaX + vDeltaY * vDeltaY);
                            maxRecentVelocity = Math.max(maxRecentVelocity, velocity);
                        }
                        state.maxVelocity = maxRecentVelocity;
                    }

                    if (totalMovement < config.stillThreshold) {
                        state.stillFrames++;
                    } else {
                        state.stillFrames = 0;
                        state.lastX = state.sprite.x;
                        state.lastY = state.sprite.y;
                    }

                    const spriteReportsNotMoving = !state.sprite.isMoving || !state.sprite.isMoving();
                    const hasBeenStill = state.stillFrames >= config.requiredStillFrames;
                    const internalDurationComplete = !state.sprite._movementDuration || state.sprite._movementDuration <= 0;
                    const velocityTrendStable = state.maxVelocity < config.stillThreshold / 2;

                    state.isStill = spriteReportsNotMoving && hasBeenStill && internalDurationComplete && velocityTrendStable;

                    if (!state.isStill) {
                        allComplete = false;
                    }
                }

                if (allComplete || elapsed >= maxWait) {
                    this.ensureMovementsStopped(sprites);
                    callback();
                } else {
                    setTimeout(checkMovements, config.checkInterval);
                }
            };

            checkMovements();
        }

        ensureMovementsStopped(sprites) {
            sprites.forEach(sprite => {
                if (sprite._movementDuration) {
                    sprite._movementDuration = 0;
                }
                if (sprite._targetOffsetX !== undefined && sprite._targetOffsetY !== undefined) {
                    sprite.x = sprite._homeX + sprite._targetOffsetX;
                    sprite.y = sprite._homeY + sprite._targetOffsetY;
                }
            });
        }

        adjustGlobalSpeed(multiplier) {
            this.config.frameToMs = (1000 / this.config.frameRate) * multiplier;

            Object.keys(this.config.sequenceDelay).forEach(key => {
                if (key !== 'normal') {
                    this.config.sequenceDelay[key] = Math.max(1,
                                                              Math.round(this.config.sequenceDelay[key] * multiplier));
                }
            });

            Object.keys(this.config.commandDelay).forEach(key => {
                if (this.config.commandDelay[key] && typeof this.config.commandDelay[key] === 'number') {
                    this.config.commandDelay[key] = Math.max(1,
                                                             Math.round(this.config.commandDelay[key] * multiplier));
                }
            });
        }
    }

    const _Window_ActorCommand_makeCommandList = Window_ActorCommand.prototype.makeCommandList;
Window_ActorCommand.prototype.makeCommandList = function() {
    _Window_ActorCommand_makeCommandList.call(this);

    // Add escape command if enabled
    if (enableActorEscape && this._actor) {
        this.addEscapeCommand();
    }
};

Window_ActorCommand.prototype.addEscapeCommand = function() {
    // Only add escape if battle allows escaping
    const canEscape = BattleManager.canEscape();
    this.addCommand(escapeCommandText, "escape", canEscape);
};

    window.$battleTiming = new BattleTimingManager();

    const _Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        const item = this.item();

        // Special handling for revival items (scope 9 and 10)
        if (item && (item.scope === 9 || item.scope === 10)) {
            if (item.scope === 9) {
                // One Ally (Dead) - return the dead target if valid
                const target = $gameParty.members()[this._targetIndex];
                if (target && target.isDead()) {
                    return [target];
                }
                return [];
            } else if (item.scope === 10) {
                // All Allies (Dead) - return all dead party members
                return $gameParty.deadMembers();
            }
        }

        // Use default targeting for all other cases
        return _Game_Action_makeTargets.call(this);
    };

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        const wasDead = target.isDead();
        _Game_Action_apply.call(this, target);
        if (wasDead && !target.isDead() && target._sprite) {
            const sprite = target._sprite;

            // Reset visual state
            sprite.opacity = 255;
            sprite.visible = true;

            // Reset rotation
            sprite.rotation = 0;
            if (sprite._mainSprite) {
                sprite._mainSprite.rotation = 0;
                // Restore proper anchor for charset battlers
                sprite._mainSprite.anchor.x = 0.5;
                sprite._mainSprite.anchor.y = 1;
            } else {
                // Restore proper anchor for regular sprites
                sprite.anchor.x = 0.5;
                sprite.anchor.y = 1;
            }

            // Reset position offsets
            sprite._offsetX = 0;
            sprite._offsetY = 0;
            sprite._targetOffsetX = 0;
            sprite._targetOffsetY = 0;

            // Reset movement state
            sprite._movementDuration = 0;
            sprite._targetX = 0;
            sprite._targetY = 0;

            // Restore proper home position from original screen positions
            if (target.isActor()) {
                const partyIndex = $gameParty.battleMembers().indexOf(target);
                if (partyIndex >= 0 && enableCustomPositions) {
                    const posKey = partyIndex + 1;
                    const pos = actorPositions[posKey];
                    if (pos) {
                        // Restore the correct home position for actors
                        sprite._homeX = pos.x;
                        sprite._homeY = pos.y;
                        sprite._targetHomeX = pos.x;
                        sprite._targetHomeY = pos.y;
                        console.log(`📍 Restored ${target.name()} home position to (${pos.x}, ${pos.y})`);
                    }
                }
            } else if (target.isEnemy()) {
                // Restore enemy home position from their screen position
                const homeX = target.screenX();
                const homeY = target.screenY();
                sprite._homeX = homeX;
                sprite._homeY = homeY;
                console.log(`📍 Restored ${target.name()} home position to (${homeX}, ${homeY})`);
            }

            // Move back to home position immediately
            if (sprite._homeX !== undefined && sprite._homeY !== undefined) {
                sprite.x = sprite._homeX;
                sprite.y = sprite._homeY;
            }

            // Reset motion state flags
            sprite._motion = null;
            sprite._motionCount = 0;

            // Clear all pictures and icons
            clearAllBattlerPictures(target);
            clearAllBattlerIcons(target);

            // Reset collapse flags
            if (sprite._collapsed !== undefined) {
                sprite._collapsed = false;
                sprite._collapsing = false;
                sprite._collapseTimer = 0;
                sprite._collapseDuration = 0;
                sprite._collapseScheduled = false;
            }

            // Reset stepping flags to prevent unwanted stepForward/stepBack calls
            sprite._isSteppingForward = false;
            sprite._isSteppingBack = false;
            sprite._originalHomeX = undefined;
            sprite._originalHomeY = undefined;

            // For actors, reset the homeX/homeY properties (not just _homeX/_homeY)
            if (target.isActor() && sprite._homeX !== undefined && sprite._homeY !== undefined) {
                sprite.homeX = sprite._homeX;
                sprite.homeY = sprite._homeY;
            }

            // Reset motion to wait/idle
            if (sprite.refreshMotion) {
                sprite.refreshMotion();
            } else if (sprite.startMotion) {
                sprite.startMotion('wait');
            }

            console.log(`✨ ${target.name()} revived - all visual effects reset`);
        }
    };

    // Add this utility function near the top of your plugin, after the parseThrowObjectData function (around line 100)
    function getActionAnimationId(action, subject) {
        let animationId = 0;

        // Priority 1: Item animation takes precedence for all actions
        const item = action.item();
        if (item && item.animationId > 0) {
            animationId = item.animationId;
            return animationId;
        }

        // Priority 2: For attacks specifically, check weapon and attack skill animations
        if (action.isAttack()) {
            if (subject.isActor()) {
                // Check for weapon animation first
                const weapon = subject.weapons()[0];
                if (weapon && weapon.animationId > 0) {
                    animationId = weapon.animationId;
                    return animationId;
                }

                // Check attack skill animation
                const attackSkill = $dataSkills[subject.attackSkillId()];
                if (attackSkill && attackSkill.animationId > 0) {
                    animationId = attackSkill.animationId;
                    return animationId;
                }

                // Default attack animation for actors (only for attacks)
                animationId = 1;
                return animationId;
            } else {
                // Enemy attack animations
                const attackSkill = $dataSkills[subject.attackSkillId()];
                if (attackSkill && attackSkill.animationId > 0) {
                    animationId = attackSkill.animationId;
                } else {
                    animationId = 1; // Default attack animation
                }
                return animationId;
            }
        }

        return 0;
    }

    class UnifiedAnimationHandler {
        static playActionAnimation(action, subject, targets, options = {}) {
            const animationId = getActionAnimationId(action, subject);

            console.log(`🎬 UnifiedAnimationHandler - Animation ID: ${animationId}, Targets: ${targets.length}`);

            if (animationId > 0 && targets && targets.length > 0) {
                // Filter to valid targets (just check they exist, vanilla MZ handles sprite lookup)
                const validTargets = targets.filter(target => target);

                if (validTargets.length === 0) {
                    console.log(`⚠️ No valid targets for animation`);
                    return false;
                }

                // Check if we can play this animation
                if (canPlayAnimation(validTargets[0], animationId, options)) {
                    console.log(`✅ Playing animation ${animationId} on ${validTargets.length} targets`);
                    $gameTemp.requestAnimation(validTargets, animationId, false);
                    return true;
                } else {
                    console.log(`⚠️ Animation ${animationId} blocked by duplicate prevention`);
                    return false;
                }
            }

            console.log(`⚠️ No animation to play (ID: ${animationId})`);
            return false;
        }
    }

    // Add this global utility function after the UnifiedAnimationHandler class
    function canApplyActionToTarget(action, target) {
        if (!action || !target) {
            console.log(`❌ Invalid action or target: action=${!!action}, target=${!!target}`);
            return false;
        }

        const subject = action.subject();
        const item = action.item();

        if (!item) {
            console.log(`✅ No item specified, allowing target ${target.name()}`);
            return target.isAlive(); // Default behavior for actions without items
        }

        const scope = item.scope;
// [silenced]         console.log(`🔍 Checking target validation: ${subject.name()} (${subject.isActor() ? 'Actor' : 'Enemy'}) -> ${target.name()} (${target.isActor() ? 'Actor' : 'Enemy'}), Scope: ${scope}`);

        // Handle dead targets
        if (target.isDead()) {
            // Only revival items (scope 9 and 10) can target dead allies
            if (scope === 9 || scope === 10) {
                const result = target.isActor(); // Revival only works on dead actors
                console.log(`💀 Dead target, revival scope: ${result}`);
                return result;
            }
            console.log(`💀 Dead target, non-revival action: false`);
            return false; // Dead targets can't receive other actions
        }

        // Handle living targets based on scope
        if (target.isAlive()) {
            let result = false;

            switch (scope) {
                case 1: // One Enemy
                case 2: // All Enemies
                case 3: // One Random Enemy
                    // "Enemy" means enemy of the subject
                    // If subject is actor, enemy = actual enemy
                    // If subject is enemy, enemy = actor
                    result = subject.isActor() ? target.isEnemy() : target.isActor();
// [silenced]                     console.log(`⚔️ Enemy scope - Subject is ${subject.isActor() ? 'Actor' : 'Enemy'}, Target is ${target.isActor() ? 'Actor' : 'Enemy'}: ${result}`);
                    break;

                case 7: // One Ally
                case 8: // All Allies
                    // "Ally" means ally of the subject
                    // If subject is actor, ally = actor
                    // If subject is enemy, ally = enemy
                    result = subject.isActor() ? target.isActor() : target.isEnemy();
                    console.log(`🤝 Ally scope - Subject is ${subject.isActor() ? 'Actor' : 'Enemy'}, Target is ${target.isActor() ? 'Actor' : 'Enemy'}: ${result}`);
                    break;

                case 11: // The User
                    result = subject === target;
                    console.log(`👤 User scope - Same battler: ${result}`);
                    break;

                case 9: // One Ally (Dead)
                case 10: // All Allies (Dead)
// Living targets can't receive revival
result = false;
console.log(`💀 Revival scope on living target: ${result}`);
break;

                case 0: // None
                    result = false;
                    console.log(`🚫 No target scope: ${result}`);
                    break;

                default:
                    // Unknown scope, allow for safety but log it
                    result = true;
                    console.log(`❓ Unknown scope ${scope}, allowing for safety: ${result}`);
                    break;
            }

            return result;
        }

        console.log(`❌ Target is neither alive nor dead - this shouldn't happen`);
        return false;
    }

    // Add this shared motion handler class
    class BattlerMotionHandler {
        static getMotionSpeed(sprite) {
            if (sprite._charsetBattler) {
                // Determine if this is an actor or enemy sprite
                const isActor = sprite._actor !== undefined;
                return isActor ? actorCharsetSpeed : enemyCharsetSpeed;
            }
            return 12; // Default for SV battlers
        }

        static updateJumpArc(sprite) {
            if (sprite._jumpActive && sprite._jumpBaseY !== undefined) {
                const elapsed = performance.now() - sprite._jumpStartTime;
                const progress = Math.min(elapsed / sprite._jumpDuration, 1);

                // Calculate parabolic arc offset
                const arcProgress = 4 * progress * (1 - progress);
                const arcOffset = sprite._jumpArcHeight * arcProgress;

                // Apply arc offset to current Y position
                const currentMovementY = sprite.y;
                sprite.y = currentMovementY - arcOffset;
            }
        }

        static startMotion(sprite, motionType) {
            const newMotion = sprite.constructor.MOTIONS[motionType];
            if (sprite._motion !== newMotion) {
                sprite._motion = newMotion;
                sprite._motionCount = 0;
                sprite._idleCompleted = false;
                sprite._forcedDirection = null;

                if (sprite._charsetBattler) {
                    if (motionType === 'walk') {
                        sprite._pattern = 0;
                    } else if (motionType === 'idle' || motionType === 'wait' || motionType === 'reset') {
                        sprite._pattern = 1;
                        if (motionType === 'idle') sprite._idleCompleted = true;
                    } else {
                        sprite._pattern = 1;
                    }
                } else {
                    sprite._pattern = 0;
                }
            }
        }

        static updateMotion(sprite) {
            if (!sprite._motion) return;

            const isWalking = sprite._motion.index === 0;
            const isIdle = sprite._motion.index === 18;
            const isLooping = sprite._motion.loop;
            const motionSpeed = this.getMotionSpeed(sprite);

            if (isWalking && !isIdle) {
                if (++sprite._motionCount >= motionSpeed) {
                    sprite._pattern = (sprite._pattern + 1) % 3;
                    sprite._motionCount = 0;
                }
            } else if (isIdle) {
                // FIXED: Idle should stay on middle frame and not animate
                if (!sprite._idleCompleted) {
                    sprite._pattern = 1; // Force middle frame
                    sprite._idleCompleted = true;
                }
                // Don't increment motion count or pattern for idle
            } else if (sprite._motion.index === 1) { // wait motion
                // FIXED: Wait motion should also stay on middle frame for charset battlers
                if (sprite._charsetBattler) {
                    sprite._pattern = 1; // Force middle frame for wait
                } else {
                    // For SV battlers, allow wait motion to animate normally
                    if (!isLooping && sprite._pattern < 2) {
                        if (++sprite._motionCount >= motionSpeed) {
                            sprite._pattern++;
                            sprite._motionCount = 0;
                        }
                    } else if (isLooping) {
                        if (++sprite._motionCount >= motionSpeed) {
                            sprite._pattern = (sprite._pattern + 1) % 3;
                            sprite._motionCount = 0;
                        }
                    } else {
                        sprite._pattern = 2;
                        sprite._motionCount = 0;
                    }
                }
            } else {
                if (!isLooping && sprite._pattern < 2) {
                    if (++sprite._motionCount >= motionSpeed) {
                        sprite._pattern++;
                        sprite._motionCount = 0;
                    }
                } else if (isLooping) {
                    if (++sprite._motionCount >= motionSpeed) {
                        sprite._pattern = (sprite._pattern + 1) % 3;
                        sprite._motionCount = 0;
                    }
                } else {
                    sprite._pattern = 2;
                    sprite._motionCount = 0;
                }
            }
        }

        static updateFrame(sprite) {
            const targetSprite = sprite._mainSprite || sprite;
            const bitmap = targetSprite.bitmap;

            // Enhanced bitmap validation
            if (!bitmap || !bitmap.isReady()) {
                return;
            }

            // CRITICAL FIX: Additional check for bitmap dimensions
            // Sometimes bitmap.isReady() returns true but width/height aren't available yet
            if (bitmap.width === undefined || bitmap.width === 0 ||
                bitmap.height === undefined || bitmap.height === 0) {
                return;
                }

                if (sprite._svBattler) {
                    // This logic is for SV Enemies. SV Actors are handled by the original engine code.
                    const motionIndex = sprite._motion ? sprite._motion.index : 1;
                    const pattern = sprite._pattern || 0;
                    const cw = bitmap.width / 9;
                    const ch = bitmap.height / 6;
                    const cx = Math.floor(motionIndex / 6) * 3 + pattern;
                    const cy = motionIndex % 6;
                    targetSprite.setFrame(cx * cw, cy * ch, cw, ch);
                } else if (sprite._charsetBattler) {
                    const frameData = updateCharsetFrame(sprite, bitmap);
                    if (frameData) {
                        targetSprite.setFrame(frameData.x, frameData.y, frameData.width, frameData.height);
                    }
                } else { // Static Battler
                    targetSprite.setFrame(0, 0, bitmap.width, bitmap.height);
                }
        }
    }

    // ===== BATTLE CLEANUP MANAGER =====
    class BattleCleanupManager {
        static performFullBattleCleanup() {
            console.log("🧹 Performing full battle cleanup...");

            this.resetGlobalFlags();
            this.cleanupActionSequenceManager();
            this.cleanupAllBattlers();
            this.cleanupAllSprites();
            this.resetAnimationTracking();
            this.resetDebugCounters();
            this.clearTimers();

            console.log("✅ Battle cleanup completed");
        }

        static resetGlobalFlags() {
            // Reset the main global flag that controls battle flow
            window.actionSequenceInProgress = false;

            // Reset any battle manager flags
            if (BattleManager._isStartingCustomSequence) {
                BattleManager._isStartingCustomSequence = false;
            }
        }

        static cleanupActionSequenceManager() {
            if (window.$actionSequenceManager) {
                // Stop all running sequences immediately
                $actionSequenceManager.isPlaying = false;
                $actionSequenceManager.currentSequence = null;
                $actionSequenceManager.currentStep = null;
                $actionSequenceManager.stepExecuted = false;

                // Specifically clear victory sequences
                const victorySequences = [];
                for (const [sequenceId, seqData] of $actionSequenceManager.specialSequences) {
                    if (sequenceId.startsWith('victory_')) {
                        victorySequences.push(sequenceId);
                    }
                }

                victorySequences.forEach(id => {
                    console.log(`🧹 Cleaning up victory sequence: ${id}`);
                    $actionSequenceManager.specialSequences.delete(id);
                });

                // Clear all remaining special sequences
                $actionSequenceManager.specialSequences.clear();

                console.log("🎬 ActionSequenceManager cleaned up");
            }
        }

        static cleanupAllBattlers() {
            // Clean up party members
            $gameParty.allMembers().forEach(actor => {
                this.cleanupBattler(actor);
            });

            // Clean up enemies
            $gameTroop.members().forEach(enemy => {
                this.cleanupBattler(enemy);
            });
        }

        static cleanupBattler(battler) {
            if (!battler) return;

            // Clear custom icons (Map object)
            if (battler._actionIcons && battler._actionIcons instanceof Map) {
                for (const [index, iconSprite] of battler._actionIcons) {
                    if (iconSprite && iconSprite.parent) {
                        iconSprite.parent.removeChild(iconSprite);
                    }
                }
                battler._actionIcons.clear();
            }

            // Clear custom pictures (Map object)
            if (battler._actionPictures && battler._actionPictures instanceof Map) {
                for (const [id, pictureSprite] of battler._actionPictures) {
                    if (pictureSprite && pictureSprite.parent) {
                        pictureSprite.parent.removeChild(pictureSprite);
                    }
                }
                battler._actionPictures.clear();
            }

            // Reset sprite reference
            battler._sprite = null;
        }

        static cleanupAllSprites() {
            // Clean up actor sprites
            if (SceneManager._scene && SceneManager._scene._spriteset) {
                const spriteset = SceneManager._scene._spriteset;

                if (spriteset._actorSprites) {
                    spriteset._actorSprites.forEach(sprite => {
                        this.cleanupSprite(sprite);
                    });
                }

                if (spriteset._enemySprites) {
                    spriteset._enemySprites.forEach(sprite => {
                        this.cleanupSprite(sprite);
                    });
                }
            }
        }

        static cleanupSprite(sprite) {
            if (!sprite) return;

            // Reset movement flags
            sprite._isSteppingBack = false;
            sprite._isSteppingForward = false;
            sprite._movementDuration = 0;

            // Reset jump states
            sprite._jumpActive = false;
            sprite._jumpBaseY = undefined;
            sprite._jumpArcHeight = undefined;
            sprite._jumpStartTime = undefined;
            sprite._jumpDuration = undefined;

            // Reset motion states
            sprite._motion = null;
            sprite._motionCount = 0;
            sprite._pattern = 0;
            sprite._idleCompleted = false;

            // Reset forced states
            sprite._forcedDirection = null;
            sprite._forcedRow = undefined;
            sprite._forcedColumn = undefined;

            // Reset collapse states
            sprite._collapsing = false;
            sprite._collapsed = false;
            sprite._collapseTimer = 0;
            sprite._collapseBaseY = undefined;
            sprite._collapseScheduled = false;
            sprite._collapseDuration = 0;

            // FIXED: Don't reset positions if we're escaping
            if (!$gameTemp._isEscapingBattle) {
                // Reset to home position
                if (sprite._homeX !== undefined && sprite._homeY !== undefined) {
                    sprite.x = sprite._homeX;
                    sprite.y = sprite._homeY;
                    sprite._offsetX = 0;
                    sprite._offsetY = 0;
                    sprite._targetOffsetX = 0;
                    sprite._targetOffsetY = 0;
                }
            }

            // Reset visual properties
            sprite.opacity = 255;
            sprite.visible = true;
            sprite.rotation = 0;
            sprite.setColorTone([0, 0, 0, 0]);

            // Reset anchor points to default
            if (sprite.anchor) {
                sprite.anchor.x = 0.5;
                sprite.anchor.y = 1;
            }

            // Reset main sprite for charset battlers
            if (sprite._mainSprite) {
                sprite._mainSprite.opacity = 255;
                sprite._mainSprite.visible = true;
                sprite._mainSprite.rotation = 0;
                if (sprite._mainSprite.anchor) {
                    sprite._mainSprite.anchor.x = 0.5;
                    sprite._mainSprite.anchor.y = 1;
                }
            }
        }

        static resetAnimationTracking() {
            if (window.globalAnimationTracker) {
                globalAnimationTracker.clear();
            }
        }

        static resetDebugCounters() {
            window.stepBackCallCount = 0;
            window.lastResetTime = Date.now();
            if (window.callSources) {
                callSources.clear();
            }
        }

        static clearTimers() {
            // Clear any remaining timeouts/intervals that might be running
            // Note: This is a basic implementation - you might need to track specific timers
            // if you have long-running ones that need to be cleared
        }
    }

    // Make it globally accessible
    window.BattleCleanupManager = BattleCleanupManager;


    function updateCharsetFrame(sprite, bitmap) {
        // SAFETY CHECK: Ensure bitmap has valid dimensions
        if (!bitmap || bitmap.width === undefined || bitmap.width === 0 ||
            bitmap.height === undefined || bitmap.height === 0) {
            console.log(`⚠️ updateCharsetFrame called with invalid bitmap`);
        return null;
            }

            let frameWidth = bitmap.width / 3;
            let frameHeight = bitmap.height / 4;

            // Determine direction - check for forced frame first
            let row, col;

            if (sprite._forcedRow !== undefined && sprite._forcedColumn !== undefined) {
                // Use forced frame values
                row = sprite._forcedRow;
                col = sprite._forcedColumn;
            } else {
                // Use normal motion-based direction and pattern
                if (sprite._forcedDirection) {
                    switch (sprite._forcedDirection) {
                        case 'down': row = 0; break;
                        case 'left': row = 1; break;
                        case 'right': row = 2; break;
                        case 'up': row = 3; break;
                        default: row = 0;
                    }
                } else {
                    // Use normal motion-based direction
                    const isWalking = sprite._motion && sprite._motion.index === 0; // walk motion

                    if (isWalking && battleOrientation === 'Vertical') {
                        row = 3; // Both actors and enemies move up when walking in vertical mode
                    } else if (isWalking) {
                        row = 2; // Both actors and enemies move right when walking in horizontal mode
                    } else {
                        // Idle/other motions use default facing
                        const isEnemy = sprite._enemy !== undefined;
                        if (isEnemy) {
                            row = (battleOrientation === 'Vertical') ? 0 : 1; // down or left for enemies
                        } else {
                            row = (battleOrientation === 'Vertical') ? 3 : 1; // up or left for actors
                        }
                    }
                }

                col = sprite._pattern;
            }

            // Handle character index for actors (big character check)
            if (sprite._actor && !sprite._isBigCharacter) {
                frameWidth = bitmap.width / 12;
                frameHeight = bitmap.height / 8;
                const blockX = (sprite._actor.characterIndex() % 4) * 3;
                const blockY = Math.floor(sprite._actor.characterIndex() / 4) * 4;
                col = blockX + col;
                row = blockY + row;
            }

            return {
                x: col * frameWidth,
 y: row * frameHeight,
 width: frameWidth,
 height: frameHeight
            };
    }

    class ZIndexManager {
        static LAYER_OFFSETS = {
            'below': -10000,
            'normal': 0,
            'above': 10000
        };

        static SPRITE_TYPE_OFFSETS = {
            'enemy': 0,
            'actor': 1,
            'icon': 2,
            'picture': 3,
            'projectile': 4,
            'damage': 5,
            'animation': 50000  // Always render animations on top of everything
        };

        // Calculate Z-index based on Y position, sprite type, and layer
        static calculateZIndex(yPosition, spriteType = 'normal', layer = 'normal') {
            const baseZ = Math.floor(yPosition);
            const layerOffset = this.LAYER_OFFSETS[layer] || 0;
            const typeOffset = this.SPRITE_TYPE_OFFSETS[spriteType] || 0;

            return baseZ + layerOffset + typeOffset;
        }

        // Update sprite Z-index and trigger container resorting
        static updateSpriteZIndex(sprite, spriteType = 'normal', layer = 'normal') {
            if (!sprite || sprite.y === undefined) return;

            // CRITICAL: Never update Z-index for animation sprites - they always stay on top
            const spriteClassName = sprite.constructor.name;
            if (spriteClassName === 'Sprite_Animation' || spriteClassName === 'Sprite_AnimationMV') {
                return;
            }

            // CRITICAL: Never update Z-index for pictures with fixed layers
            if (sprite instanceof Sprite_ActionPicture) {
                const pictureLayer = ZIndexManager.normalizeLayer(sprite.pictureData.layer);
                if (pictureLayer !== 'normal') {
                    return; // Don't touch Z-index for 'above' or 'below' layer pictures
                }
            }

            const newZIndex = this.calculateZIndex(sprite.y, spriteType, layer);

            // Only update if Z-index actually changed
            if (sprite.zIndex !== newZIndex) {
                sprite.zIndex = newZIndex;
                this.requestContainerSort(sprite);
            }
        }

        // Force container to resort children
        static requestContainerSort(sprite) {
            if (sprite.parent && sprite.parent.sortableChildren) {
                sprite.parent.sortDirty = true;
            }
        }

        // Get the layer name from layer parameter (handles both string and boolean inputs)
        static normalizeLayer(layer) {
            if (layer === 'above' || layer === true) return 'above';
            if (layer === 'below' || layer === false) return 'below';
            return 'normal';
        }
    }

    // Add this shared action executor class
    class ActionExecutor {
        static invoke(action, targets) {
            const subject = action.subject();

            action.applyGlobal();

            const validTargets = [];
            for (let i = 0; i < targets.length; i++) {
                const target = targets[i];
                if (target && canApplyActionToTarget(action, target)) {
                    validTargets.push(target);
                }
            }

            if (validTargets.length === 0) {
                subject.performActionEnd();
                return;
            }

            // Store HP/MP before action
            const targetsBeforeAction = validTargets.map(target => ({
                target: target,
                hpBefore: target.hp,
                mpBefore: target.mp,
                wasAlive: target.isAlive()
            }));

            for (const target of validTargets) {
                action.apply(target);
                target.startDamagePopup();
                target.performActionEnd();
            }

            subject.performActionEnd();

            // Check for healing and play recovery sound
            let anyHealing = false;

            targetsBeforeAction.forEach(targetData => {
                const target = targetData.target;
                const hpChange = target.hp - targetData.hpBefore;
                const mpChange = target.mp - targetData.mpBefore;
                const nowDead = target.isDead();
                const justDied = targetData.wasAlive && nowDead;

                // Track if any healing occurred
                if (hpChange > 0 || mpChange > 0) {
                    anyHealing = true;
                }

                // Trigger damage sequence for living targets that took damage
                if (!nowDead && (hpChange < 0 || mpChange < 0)) {
                    const damageSequence = BattleManager.getCustomDamageSequence(target);
                    if (damageSequence && damageSequence.length > 0) {
                        setTimeout(() => {
                            BattleManager.executeCustomSequence(target, damageSequence, 'damage');
                        }, 100);
                    }
                }

                // Trigger collapse sequence for targets that just died
                if (justDied) {
                    setTimeout(() => {
                        target.performCollapse();
                    }, 300);
                }
            });

            // Play recovery sound if any healing occurred
            if (anyHealing) {
                // Try multiple approaches to find and play recovery sound

                // Approach 1: Try common recovery sound indices
                const recoveryIndices = [14, 16, 22, 23]; // Common locations for recovery sound
                let soundPlayed = false;

                for (const index of recoveryIndices) {
                    if (!soundPlayed && $dataSystem.sounds[index] && $dataSystem.sounds[index].name) {
                        const sound = $dataSystem.sounds[index];
                        // Check if this looks like a recovery sound (common names)
                        if (sound.name.toLowerCase().includes('recovery') ||
                            sound.name.toLowerCase().includes('heal') ||
                            sound.name.toLowerCase().includes('item') ||
                            index === 22) { // Index 22 is often use item sound

                                console.log(`Playing recovery sound from index ${index}: ${sound.name}`);
                                AudioManager.playSe(sound);
                                soundPlayed = true;
                                break;
                            }
                    }
                }

                // Approach 2: If no recovery sound found, use item use sound
                if (!soundPlayed) {
                    // Try to find item use sound
                    if ($dataSystem.sounds[22] && $dataSystem.sounds[22].name) {
                        console.log(`Playing item use sound: ${$dataSystem.sounds[22].name}`);
                        AudioManager.playSe($dataSystem.sounds[22]);
                        soundPlayed = true;
                    }
                }

                // Approach 3: Manual fallback - you can customize this
                if (!soundPlayed) {
                    // Play a generic recovery sound
                    AudioManager.playSe({
                        name: "Recovery", // or whatever your recovery sound file is named
                        volume: 90,
                        pitch: 100,
                        pan: 0
                    });
                    console.log("Playing fallback recovery sound");
                }
            }
        }

        static execute(action, targets, options = {}) {
            const {
                playAnimation = true,
 effectDelay = 0,
 showDamage = true
            } = options;

            const subject = action.subject();

            console.log(`⚔️ ActionExecutor.execute - Subject: ${subject.name()}`);

            // Apply the action effects
            if (effectDelay > 0) {
                setTimeout(() => {
                    this.invoke(action, targets);
                }, effectDelay);
            } else {
                this.invoke(action, targets);
            }

            // Handle animation if requested
            if (playAnimation) {
                const animationId = getActionAnimationId(action, subject);
                if (animationId > 0 && targets.length > 0) {
// [silenced]                     console.log(`🎬 Playing animation ${animationId} on ${targets.length} targets`);

                    // Use the unified animation handler
                    UnifiedAnimationHandler.playActionAnimation(action, subject, targets, {
                        allowOverride: true,
                        customSequence: true
                    });
                }
            }
        }

        static handleEnemyCollapse(enemy) {
            if (SoundManager && SoundManager.playEnemyCollapse) {
                SoundManager.playEnemyCollapse();
            }
            if (enemy._sprite) {
                if (enemy._sprite.startMotion) {
                    enemy._sprite.startMotion('dying');
                }
                setTimeout(() => {
                    if (enemy.performCollapse) {
                        enemy.performCollapse();
                    }
                }, 200);
            }
        }
    }

    // Override the animationWait method which controls the timing
    const _Sprite_StateOverlay_animationWait = Sprite_StateOverlay.prototype.animationWait;
    Sprite_StateOverlay.prototype.animationWait = function() {
        // Calculate wait frames: lower values = faster animation
        // Default is 8 frames, so plugin parameter controls the speed
        const baseWait = stateOverlaySpeed;

        // Debug log (only log once per sprite to avoid spam)
        if (!this._waitLogged && this._battler) {
// [silenced]             console.log(`⏱️ State overlay animation speed for ${this._battler.name()}: ${baseWait} frames/wait (parameter: ${stateOverlaySpeed})`);
            this._waitLogged = true;
        }

        return baseWait;
    };

    // Projectile Sprite Class
    class Sprite_Projectile extends Sprite {
        constructor(throwData, startX, startY, targetX, targetY) {
            super();
            this.throwData = throwData;
            this.startX = startX;
            this.startY = startY;
            this.targetX = targetX;
            this.targetY = targetY;
            this.currentFrame = 0;
            this.totalFrames = throwData.duration;
            this._lastUpdateTime = performance.now();
            this.completed = false;

            this.initializeBitmap();
            this.setupPosition();
            this.calculateTrajectory();
        }

        initializeBitmap() {
            if (this.throwData.image) {
                // Load icon bitmap
                this.bitmap = ImageManager.loadSystem('IconSet');
                this.setupIconFrame();
            }
        }

        setupIconFrame() {
            const iconIndex = this.throwData.image;
            const iconSize = 32;
            const cols = 16;

            const sx = (iconIndex % cols) * iconSize;
            const sy = Math.floor(iconIndex / cols) * iconSize;

            this.setFrame(sx, sy, iconSize, iconSize);
            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
        }

        setupPosition() {
            this.x = this.startX + this.throwData.start.x;
            this.y = this.startY + this.throwData.start.y;
            this.initialX = this.x;
            this.initialY = this.y;
        }

        calculateTrajectory() {
            this.deltaX = this.targetX - this.initialX;
            this.deltaY = this.targetY - this.initialY;
            this.distance = Math.sqrt(this.deltaX * this.deltaX + this.deltaY * this.deltaY);

            // Calculate arc trajectory
            this.arcHeight = this.throwData.arc;
        }

        update() {
            super.update();

            if (this.completed) return;

            // Delta time calculation for smooth animation
            const now = performance.now();
            const deltaTime = now - this._lastUpdateTime;
            this._lastUpdateTime = now;
            const frameMultiplier = Math.min(deltaTime / 16.67, 2); // Cap at 2x to prevent huge jumps

            this.currentFrame += frameMultiplier;
            const progress = this.currentFrame / this.totalFrames;

            if (progress >= 1.0) {
                this.completed = true;
                this.x = this.targetX;
                this.y = this.targetY;
                this.onComplete();
                return;
            }

            // Linear interpolation for X and Y
            this.x = this.initialX + (this.deltaX * progress);
            this.y = this.initialY + (this.deltaY * progress);

            // Add arc (parabolic curve)
            if (this.arcHeight !== 0) {
                const arcProgress = 4 * progress * (1 - progress); // Parabolic curve
                this.y -= this.arcHeight * arcProgress;
            }

            // Add spin rotation with delta time
            if (this.throwData.spin !== 0) {
                this.rotation += (this.throwData.spin * Math.PI / 180) * (frameMultiplier / 60);
            }
        }

        onComplete() {
            // Remove self from parent after a brief delay
            setTimeout(() => {
                if (this.parent) {
                    this.parent.removeChild(this);
                }
            }, 100);
        }
    }

    // Enemy MOTIONS (same as actor for compatibility)
    Sprite_Enemy.MOTIONS = {
        walk: { index: 0, loop: true },
 wait: { index: 1, loop: true },
 chant: { index: 2, loop: true },
 guard: { index: 3, loop: true },
 damage: { index: 4, loop: false },
 evade: { index: 5, loop: false },
 thrust: { index: 6, loop: false },
 swing: { index: 7, loop: false },
 missile: { index: 8, loop: false },
 skill: { index: 9, loop: false },
 spell: { index: 10, loop: false },
 item: { index: 11, loop: false },
 escape: { index: 12, loop: true },
 victory: { index: 13, loop: true },
 dying: { index: 14, loop: true },
 abnormal: { index: 15, loop: true },
 sleep: { index: 16, loop: true },
 dead: { index: 17, loop: true },
 idle: { index: 18, loop: false }  // New idle motion with non-looping behavior
    };

    Sprite_Actor.MOTIONS = Sprite_Enemy.MOTIONS;

    // Enemy modifications
    const _Sprite_Enemy_initMembers = Sprite_Enemy.prototype.initMembers;
    Sprite_Enemy.prototype.initMembers = function() {
        // Call parent but skip default createStateIconSprite (we'll create it conditionally)
        Sprite_Battler.prototype.initMembers.call(this);
        this._enemy = null;
        this._appeared = false;
        this._battlerName = null;
        this._battlerHue = 0;
        this._effectType = null;
        this._effectDuration = 0;
        this._shake = 0;

        // Always create sprites for compatibility, but control visibility
        this.createStateIconSprite();
        this.createStateOverlaySprite();

        // Store visibility preferences
        const showIcons = (enemyStateDisplay === 'Icons Only' || enemyStateDisplay === 'Both');
        const showAnims = (enemyStateDisplay === 'Animations Only' || enemyStateDisplay === 'Both');
        this._stateIconSprite.visible = showIcons;
        this._stateSprite.visible = showAnims;

        // Add custom battler type properties
        this._battlerType = enemyBattlerType;
        this._svBattler = this._battlerType === 'SV';
        this._charsetBattler = this._battlerType === 'Charset';
        this._motion = null;
        this._motionCount = 0;
        this._pattern = 0;
        this._isSteppingBack = false;

        // Use the same movement properties as actors
        this._movementDuration = 0;
        this._offsetX = 0;
        this._offsetY = 0;
        this._targetOffsetX = 0;
        this._targetOffsetY = 0;
    };

    Sprite_Enemy.prototype.loadBitmap = function() {
        const name = this._enemy.battlerName();
        const hue = this._enemy.battlerHue();
        this.bitmap = ImageManager.loadSvEnemy(name, hue);
    };

    // Create state overlay sprite for enemies (like actors have)
    Sprite_Enemy.prototype.createStateOverlaySprite = function() {
        this._stateSprite = new Sprite_StateOverlay();
        this.addChild(this._stateSprite);
    };

    const _Sprite_Enemy_setBattler = Sprite_Enemy.prototype.setBattler;
    Sprite_Enemy.prototype.setBattler = function(battler) {
        _Sprite_Enemy_setBattler.call(this, battler);

        // Reset collapse state for new/revived battlers
        if (battler && !battler.isDead()) {
            this._collapsing = false;
            this._collapsed = false;
            this._collapseTimer = 0;
            this._collapseBaseY = undefined;
            this.opacity = 255;
            this.visible = true;

            // Reset scale
            const originalScaleX = this._charsetBattler && battleOrientation !== 'Vertical' ? -1 : 1;
            this.scale.x = originalScaleX;
            this.scale.y = 1;

            // Initialize to wait motion to prevent race condition
            if (this.startMotion) {
                this.startMotion('wait');
            }
        }

        if (battler) {
            battler._sprite = this;

            // CRITICAL FIX: Initialize home position for enemies
            // Set home position based on current position when battler is set
            if (this.x !== undefined && this.y !== undefined) {
                this._homeX = this.x;
                this._homeY = this.y;
            }

            // Setup state overlay sprite if it exists
            if (this._stateSprite) {
                this._stateSprite.setup(battler);

                // Ensure visibility is set correctly based on plugin parameters
                const showAnims = (enemyStateDisplay === 'Animations Only' || enemyStateDisplay === 'Both');
                this._stateSprite.visible = showAnims;

// [silenced]                 console.log(`🎭 Enemy ${battler.name()} state overlay setup - visible: ${showAnims}, overlayIndex: ${battler.stateOverlayIndex()}`);
            }
        }
    };

    // Enhanced position setup for enemies during battle initialization
    const _Sprite_Enemy_setPosition = Sprite_Enemy.prototype.setPosition || function(x, y) {
        this.x = x;
        this.y = y;
    };

    Sprite_Enemy.prototype.setPosition = function(x, y) {
        _Sprite_Enemy_setPosition.call(this, x, y);

        // Set home position when position is established
        this._homeX = x;
        this._homeY = y;

        console.log(`🏠 Enemy ${this._enemy?.name()} home position set: (${this._homeX}, ${this._homeY})`);
    };

    Sprite_Enemy.prototype.setHome = function(x, y) {
        this._homeX = x;
        this._homeY = y;
        this.x = x;
        this.y = y;
    };

    Sprite_Enemy.prototype.startMotion = function(motionType) {
        BattlerMotionHandler.startMotion(this, motionType);
    };

    Sprite_Enemy.prototype.refreshMotion = function() {
        const enemy = this._enemy;
        if (enemy) {
            const stateMotion = enemy.stateMotionIndex();

            // Trigger standard collapse when enemy dies
            if (stateMotion === 3 && !this._collapsed && !this._collapseDuration) {
                this.startCollapse();
                return;
            }

            // Don't change motion if collapsed
            if (this._collapsed) {
                return;
            }

            if (stateMotion === 3) {
                this.startMotion('dead');
            } else if (stateMotion === 2) {
                this.startMotion('sleep');
            } else if (stateMotion === 1) {
                this.startMotion('abnormal');
            } else {
                this.startMotion('wait');
            }
        }
    };

    Sprite_Enemy.prototype.startCollapse = function(delay = 800) {
        // Prevent multiple collapses
        if (this._collapsed || this._collapseDuration > 0 || this._collapseScheduled) {
            console.log(`🚫 Blocked duplicate collapse for ${this._enemy?.name()}`);
            return;
        }

        // Don't start new collapse sequences during victory or end phases
        if (BattleManager._phase === 'victory' ||
            BattleManager._phase === 'battleEnd' ||
            BattleManager._phase === 'aborting') {
            console.log(`🚫 Blocked collapse for ${this._enemy?.name()} during ${BattleManager._phase} phase`);
        return;
            }

            // Prevent multiple collapse scheduling
            this._collapseScheduled = true;

            // Schedule the actual collapse after the specified delay
            setTimeout(() => {
                // Double-check that collapse is still needed and battle phase hasn't changed
                if (this._collapsed || this._collapseDuration > 0) {
                    this._collapseScheduled = false;
                    return;
                }

                if (BattleManager._phase === 'victory' ||
                    BattleManager._phase === 'battleEnd' ||
                    BattleManager._phase === 'aborting') {
                    console.log(`🚫 Cancelled scheduled collapse for ${this._enemy?.name()} - battle ending`);
                this._collapseScheduled = false;
                return;
                    }

                    this._effectType = "collapse";
                    this._collapseDuration = 80;
                    this._collapseScheduled = false;

                    // Play enemy collapse sound
                    if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[11]) {
                        const collapseSound = $dataSystem.sounds[11];
                        if (collapseSound.name && collapseSound.name.length > 0) {
                            AudioManager.playSe(collapseSound);
                        }
                    }

                    // Clear any action icons associated with this enemy
                    if (this._enemy._actionIcons) {
                        clearAllBattlerIcons(this._enemy);
                    }
            }, delay);
    };

    Sprite_Enemy.prototype.updateCollapse = function() {
        if (this._collapseDuration > 0) {
            this._collapseDuration--;

            const duration = this._collapseDuration;
            const progress = (32 - duration) / 32;

            // Red tint effect
            const redTint = Math.floor(255 * progress);
            this.setColorTone([redTint, -redTint/2, -redTint/2, 0]);

            // Fade out
            this.opacity = 255 * (duration / 32);

            if (this._collapseDuration === 0) {
                this._collapsed = true;
                this.visible = false;
                this.opacity = 0;
                this.setColorTone([0, 0, 0, 0]);
            }
        }
    };

    // ===== MOG TREASURE POPUP COMPATIBILITY =====
    // Initialize enemy sprite with proper _effectDuration
    const _Sprite_Enemy_setBattler_compat = Sprite_Enemy.prototype.setBattler;
    Sprite_Enemy.prototype.setBattler = function(battler) {
        _Sprite_Enemy_setBattler_compat.call(this, battler);

        // Initialize _effectDuration to prevent early treasure popup
        // Set to a non-zero value so MOG plugin doesn't trigger at battle start
        if (!this._effectDuration) {
            this._effectDuration = 1;
        }
        this._effectType = null;
    };

    // Update _effectDuration when collapse starts
    const _Sprite_Enemy_startCollapse_compat = Sprite_Enemy.prototype.startCollapse;
    Sprite_Enemy.prototype.startCollapse = function(delay = 800) {
        // Prevent duplicate collapse calls
        if (this._collapsed || this._collapseDuration > 0 || this._collapseScheduled) {
            return;
        }

        // Call original custom collapse
        _Sprite_Enemy_startCollapse_compat.call(this, delay);

        // Set _effectType and _effectDuration for MOG compatibility
        this._effectType = "collapse";
        this._effectDuration = 80; // Match your collapse duration
    };

    // Only set _effectDuration to 0 when collapse is truly complete
    const _Sprite_Enemy_updateCollapse_compat = Sprite_Enemy.prototype.updateCollapse;
    Sprite_Enemy.prototype.updateCollapse = function() {
        // Only update collapse if we're actually collapsing
        if (this._collapseDuration > 0 || this._effectType === "collapse") {
            _Sprite_Enemy_updateCollapse_compat.call(this);

            // Sync _effectDuration with _collapseDuration
            if (this._collapseDuration !== undefined && this._collapseDuration > 0) {
                this._effectDuration = this._collapseDuration;
            } else if (this._collapsed && this._effectType === "collapse") {
                // Only set to 0 when collapse is truly complete
                this._effectDuration = 0;
            }
        } else if (!this._effectDuration || this._effectDuration === 0) {
            // Prevent _effectDuration from being 0 when not collapsing
            this._effectDuration = 1;
        }
    };

    // Add the checkTreasurePopup method if MOG plugin is loaded
    if (Imported.MOG_TrPopUpBattle) {
        Sprite_Enemy.prototype.checkTreasurePopup = function() {
            this._enemy._treasure.item = this._enemy.makeDropItems();
            this._enemy._treasure.checked = true;
            if (this._enemy._treasure.item && this._enemy._treasure.item.length > 0) {
                this._enemy._treasure.needPopup = true;
                $gameTemp._trBatNeedPopUp = true;
            }
        };
    }

    Sprite_Enemy.prototype.onCollapseComplete = function() {
        this.visible = false;

        if (this._enemy._actionIcons) {
            clearAllBattlerIcons(this._enemy);
        }
    };

    const _Sprite_Enemy_update = Sprite_Enemy.prototype.update;
    Sprite_Enemy.prototype.update = function() {
        _Sprite_Enemy_update.call(this);
        if (this._enemy) { // Ensure battler exists
            this.updateMove();

            // Apply the offset to the home position to get the final screen position
            if (this._homeX !== undefined) {
                this.x = this._homeX + this._offsetX;
                this.y = this._homeY + this._offsetY;
            }

            // Use shared motion handler
            BattlerMotionHandler.updateMotion(this);

            // Add collapse functionality to existing update
            this.updateCollapse();

            // Check if enemy should start collapsing
            if (this._enemy.isDead() && !this._collapsing && !this._collapsed) {
                this.refreshMotion();
            }

            // Keep existing jump arc update
            BattlerMotionHandler.updateJumpArc(this);
        }
    };

    const _Sprite_Enemy_updateFrame = Sprite_Enemy.prototype.updateFrame;
    Sprite_Enemy.prototype.updateFrame = function() {
        // SAFETY CHECK: Don't update frame if bitmap isn't ready
        if (!this.bitmap || !this.bitmap.isReady() ||
            this.bitmap.width === undefined || this.bitmap.width === 0) {
            return;
            }

            _Sprite_Enemy_updateFrame.call(this); // Updates bitmap
            BattlerMotionHandler.updateFrame(this); // Unified logic
    };

    Sprite_Enemy.prototype.startMove = function(x, y, duration) {
        // This now works with offsets, just like Sprite_Actor
        if (this._targetOffsetX !== x || this._targetOffsetY !== y) {
            this._targetOffsetX = x;
            this._targetOffsetY = y;
            this._movementDuration = duration;
            if (duration === 0) {
                this._offsetX = x;
                this._offsetY = y;
            }
// [silenced]             console.log(`🎯 Enemy ${this._enemy?.name()} starting move with offset (${x}, ${y}) for ${duration} frames.`);
        }
    };

    Sprite_Enemy.prototype.updateMove = function() {
        // This now updates the offsets, just like Sprite_Actor
        if (this._movementDuration > 0) {
            const d = this._movementDuration;
            this._offsetX = (this._offsetX * (d - 1) + this._targetOffsetX) / d;
            this._offsetY = (this._offsetY * (d - 1) + this._targetOffsetY) / d;
            this._movementDuration--;
        }
    };

    Sprite_Enemy.prototype.isMoving = function() {
        return this._movementDuration > 0;
    };

    // Enhance Game_Enemy collapse triggering
    const _Game_Enemy_performCollapse = Game_Enemy.prototype.performCollapse;
    Game_Enemy.prototype.performCollapse = function() {
        _Game_Enemy_performCollapse.call(this);

        if (this._sprite && this._sprite.startCollapse) {
            this._sprite.startCollapse();
        }
    };

    // Monitor HP changes to trigger collapse
    const _Game_Enemy_refresh = Game_Enemy.prototype.refresh;
    Game_Enemy.prototype.refresh = function() {
        // Completely block enemy refresh during victory and battle end phases
        if (BattleManager._phase === 'victory' ||
            BattleManager._phase === 'battleEnd' ||
            BattleManager._phase === 'aborting') {
            console.log(`🚫 Blocked enemy refresh for ${this.name()} during ${BattleManager._phase} phase`);
        return;
            }

            const wasAlive = !this.isDead();
            _Game_Enemy_refresh.call(this);

            // Don't trigger collapse if already collapsed
            if (this._sprite && (this._sprite._collapsed || this._sprite._collapseDuration > 0 || this._sprite._collapseScheduled)) {
                return;
            }

            if (wasAlive && this.isDead()) {
                console.log(`💀 Enemy ${this.name()} died - triggering collapse sequence`);
                const collapseSequence = BattleManager.getCustomCollapseSequence(this);
                if (collapseSequence && collapseSequence.length > 0) {
                    setTimeout(() => {
                        BattleManager.executeCustomSequence(this, collapseSequence, 'collapse');
                    }, 200);
                } else {
                    this.performCollapse();
                }
            }
    };

    // ===== IMPROVED DAMAGE POPUP SYSTEM =====

    // Override initialize to set custom duration
    const _Sprite_Damage_initialize = Sprite_Damage.prototype.initialize;
    Sprite_Damage.prototype.initialize = function() {
        _Sprite_Damage_initialize.call(this);
        this._duration = damagePopupDuration; // Use custom duration parameter
    };

    // Override font size
    Sprite_Damage.prototype.fontSize = function() {
        return damageFontSize;
    };

    // Override outline width
    Sprite_Damage.prototype.outlineWidth = function() {
        return damageOutlineWidth;
    };

    // Override damage color to use custom colors
    Sprite_Damage.prototype.damageColor = function() {
        // Color types: 0 = HP damage, 1 = HP heal, 2 = MP damage, 3 = MP heal
        switch (this._colorType) {
            case 0:
                return hpDamageColor;
            case 1:
                return hpHealColor;
            case 2:
                return mpDamageColor;
            case 3:
                return mpHealColor;
            default:
                return '#ffffff';
        }
    };

    // Improved digit creation with better spacing and sizing
    Sprite_Damage.prototype.createDigits = function(value) {
        const string = Math.abs(value).toString();
        const h = this.fontSize();
        // Improved width calculation - use multiplier and add extra padding
        const baseWidth = Math.floor(h * 0.75);
        const w = Math.ceil(baseWidth * damageDigitWidth + 8); // Add 8px padding
        // Add extra height padding to prevent clipping
        const heightWithPadding = h + 12;

        for (let i = 0; i < string.length; i++) {
            const sprite = this.createChildSprite(w, heightWithPadding);
            // Center the text within the wider sprite, with slight offset from top
            sprite.bitmap.drawText(string[i], 0, 6, w, heightWithPadding, "center");
            // Apply relative positioning for multiple digits PLUS offset
            sprite.x = (i - (string.length - 1) / 2) * w + damagePopupOffsetX;
            sprite.dy = 0; // All digits start together
        }
    };

    // Improved Miss text
    Sprite_Damage.prototype.createMiss = function() {
        const h = this.fontSize();
        const w = Math.floor(h * 3.5); // Slightly wider
        const heightWithPadding = h + 12;
        const sprite = this.createChildSprite(w, heightWithPadding);
        sprite.bitmap.drawText("Miss", 0, 6, w, heightWithPadding, "center");
        // Apply X offset for Miss text
        sprite.x = damagePopupOffsetX;
        sprite.dy = 0;
    };

    // Override bitmap creation for better rendering
    const _Sprite_Damage_createBitmap = Sprite_Damage.prototype.createBitmap;
    Sprite_Damage.prototype.createBitmap = function(width, height) {
        const bitmap = _Sprite_Damage_createBitmap.call(this, width, height);
        // Ensure smooth rendering
        bitmap.smooth = true;
        return bitmap;
    };

    // Override createChildSprite to apply custom Y offset (X is applied in createDigits/createMiss)
    Sprite_Damage.prototype.createChildSprite = function(width, height) {
        const sprite = new Sprite();
        sprite.bitmap = this.createBitmap(width, height);
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 1;
        // Apply Y offset from plugin parameter
        sprite.y = damagePopupOffsetY;
        sprite.ry = sprite.y;
        sprite._bounceCount = 0; // Track number of bounces
        this.addChild(sprite);
        return sprite;
    };

    // Override updateChild to add upward slide animation
    Sprite_Damage.prototype.updateChild = function(sprite) {
        // Only bounce once at the start, then smoothly slide upward
        if (sprite._bounceCount < 1) {
            // Reduced bounce physics (initial impact)
            sprite.dy += 0.3; // Reduced from 0.5 for gentler bounce
            sprite.ry += sprite.dy;
            if (sprite.ry >= 0) {
                sprite.ry = 0;
                sprite.dy *= -0.4; // Reduced from -0.6 for smaller bounce
                sprite._bounceCount++;
            }
        } else {
            // After first bounce, slide smoothly upward at slower speed
            sprite.ry -= 0.8; // Reduced from 1.5 for subtler upward motion
        }

        sprite.y = Math.round(sprite.ry);
        sprite.setBlendColor(this._flashColor);
    };

    const _Sprite_Battler_setupDamagePopup = Sprite_Battler.prototype.setupDamagePopup;
    Sprite_Battler.prototype.setupDamagePopup = function() {
        _Sprite_Battler_setupDamagePopup.call(this);
        if (this._damages && this._damages.length > 0) {
            const latestDamageSprite = this._damages[this._damages.length - 1];
            if (latestDamageSprite) {
                // Set above animations (which use z-index 100000)
                latestDamageSprite.zIndex = 150000;
// [silenced]                 console.log(`💥 Damage popup created with z-index: ${latestDamageSprite.zIndex}`);
            }
        }
    };

    // Actor modifications
    const _Sprite_Actor_initMembers = Sprite_Actor.prototype.initMembers;
    Sprite_Actor.prototype.initMembers = function() {
        _Sprite_Actor_initMembers.call(this);
        this._battlerType = actorBattlerType;
        this._svBattler = this._battlerType === 'SV';
        this._charsetBattler = this._battlerType === 'Charset';
        this._motionCount = 0;
        this._pattern = 0;
        this._isSteppingBack = false; // Add flag to prevent repeated stepping
        if (this._charsetBattler) {
            this.scale.x = 1;
        }
    };

    const _Sprite_Actor_updateBitmap = Sprite_Actor.prototype.updateBitmap;
    Sprite_Actor.prototype.updateBitmap = function() {
        if (this._charsetBattler) {
            const name = this._actor.characterName();
            if (this._battlerName !== name) {
                this._battlerName = name;
                this._mainSprite.bitmap = ImageManager.loadCharacter(name);
                this._isBigCharacter = (name.indexOf('$') === 0);
            }
            return;
        }
        _Sprite_Actor_updateBitmap.call(this); // for SV and Static (static uses SV load but full frame)
    };

    const _Sprite_Actor_updateShadow = Sprite_Actor.prototype.updateShadow;
    Sprite_Actor.prototype.updateShadow = function() {
        if (this._svBattler) {
            _Sprite_Actor_updateShadow.call(this);
        } else {
            this._shadowSprite.visible = false;
        }
    };

    const _Sprite_Actor_setupWeaponAnimation = Sprite_Actor.prototype.setupWeaponAnimation;
    Sprite_Actor.prototype.setupWeaponAnimation = function() {
        if (this._svBattler) {
            _Sprite_Actor_setupWeaponAnimation.call(this);
        }
    };

    // Override refreshMotion to prevent motion reset during command input
    const _Sprite_Actor_refreshMotion = Sprite_Actor.prototype.refreshMotion;
    Sprite_Actor.prototype.refreshMotion = function() {
        // Don't reset motion during command input
        if (this._isInputing) {
            return;
        }
        _Sprite_Actor_refreshMotion.call(this);
    };

    const _Sprite_Actor_updateMotion = Sprite_Actor.prototype.updateMotion;
    Sprite_Actor.prototype.updateMotion = function() {
        // During command input, preserve the motion but allow it to animate
        if (this._isInputing && this._motion) {
            const preservedMotion = this._motion;

            if (this._svBattler) {
                _Sprite_Actor_updateMotion.call(this);
            } else {
                // Use shared motion handler for charset and static battlers
                BattlerMotionHandler.updateMotion(this);
            }

            // Restore the motion if it was changed
            this._motion = preservedMotion;
            return;
        }

        if (this._svBattler) {
            _Sprite_Actor_updateMotion.call(this);
        } else {
            // Use shared motion handler for charset and static battlers
            BattlerMotionHandler.updateMotion(this);
        }
    };

    // FIXED: Single updateFrame definition with proper motion detection
    const _Sprite_Actor_updateFrame = Sprite_Actor.prototype.updateFrame;
    Sprite_Actor.prototype.updateFrame = function() {
        if (this._svBattler) {
            // Let original MZ code handle complex SV actor frames (main body, weapon, etc.)
            _Sprite_Actor_updateFrame.call(this);
            return;
        }
        Sprite_Battler.prototype.updateFrame.call(this);
        // Use our unified handler for non-SV actors
        BattlerMotionHandler.updateFrame(this);
    };

    const _Sprite_Actor_update = Sprite_Actor.prototype.update;
    Sprite_Actor.prototype.update = function() {
        _Sprite_Actor_update.call(this);

        // Update Z-index when position changes
        ZIndexManager.updateSpriteZIndex(this, 'actor', 'normal');

        BattlerMotionHandler.updateJumpArc(this);
    };

    const _Sprite_Actor_startMove = Sprite_Actor.prototype.startMove;
    Sprite_Actor.prototype.startMove = function(x, y, duration) {
        // Always use the x,y movement as provided - don't modify for battle orientation here
        _Sprite_Actor_startMove.call(this, x, y, duration);
    };

    // Extend Sprite_Actor to store home position and add movement tracking
    const _Sprite_Actor_setHome = Sprite_Actor.prototype.setHome;
    Sprite_Actor.prototype.setHome = function(x, y) {
        _Sprite_Actor_setHome.call(this, x, y);
        this.homeX = x;
        this.homeY = y;
    };

    // Add method to check if sprite is moving
    Sprite_Actor.prototype.isMoving = function() {
        return this._movementDuration > 0;
    };

    // Enhanced Actor Sprite Setup with Vertical Mode Z-Order
    const _Sprite_Actor_setBattler = Sprite_Actor.prototype.setBattler;
    Sprite_Actor.prototype.setBattler = function(battler) {
        const previousBattler = this._actor;
        _Sprite_Actor_setBattler.call(this, battler);
        if (battler) {
            battler._sprite = this; // Keep for action sequences

            // Only initialize motion when battler first set or changes, not every frame
            if (previousBattler !== battler && !battler.isDead() && this.startMotion) {
                this.startMotion('wait');
            }
        }
    };

    const _Sprite_Actor_setActorHome = Sprite_Actor.prototype.setActorHome;
    Sprite_Actor.prototype.setActorHome = function(index) {
        if (enableCustomPositions) {
            const posKey = index + 1;
            const pos = actorPositions[posKey];
            if (pos) {
                this.setHome(pos.x, pos.y);
            } else {
                // Fall back to default positioning
                _Sprite_Actor_setActorHome.call(this, index);
            }
        } else {
            // Fall back to default positioning if custom is disabled
            _Sprite_Actor_setActorHome.call(this, index);
        }

        // After home position is set, handle entry positioning if needed
        if (this._needsEntryPositioning) {
            this._needsEntryPositioning = false;

            // Position sprite off-screen using the offset system
            // Sprite position = _homeX + _offsetX, _homeY + _offsetY
// [silenced]             console.log(`Battle Orientation: ${battleOrientation}`);
            if (battleOrientation === 'Vertical') {
                // Start at bottom of screen - set offset to position sprite below
                this._offsetX = 0;
                this._offsetY = (Graphics.height + 100) - this._homeY;
// [silenced]                 console.log(`Vertical mode: Actor offset to (${this._offsetX}, ${this._offsetY}), will display at (${this._homeX + this._offsetX}, ${this._homeY + this._offsetY}), home at (${this._homeX}, ${this._homeY})`);
            } else {
                // Start at right of screen - set offset to position sprite to the right
                this._offsetX = (Graphics.width + 100) - this._homeX;
                this._offsetY = 0;
                console.log(`Horizontal mode: Actor offset to (${this._offsetX}, ${this._offsetY}), will display at (${this._homeX + this._offsetX}, ${this._homeY + this._offsetY}), home at (${this._homeX}, ${this._homeY})`);
            }
        }
    };

    // FIXED: Override updateTargetPosition to prevent automatic stepForward during entry
    const _Sprite_Actor_updateTargetPosition = Sprite_Actor.prototype.updateTargetPosition;
    Sprite_Actor.prototype.updateTargetPosition = function() {
        // Disable automatic positioning during entry sequences
        if (this._blockDefaultPositioning) {
            return;
        }

        if (this._charsetBattler) {
            // For charset battlers, disable the automatic target position system
            // that's causing constant stepForward calls. We'll handle positioning manually
            // through our action sequences instead.
            return;
        }
        // Use default behavior for SV battlers (only after entry completes)
        _Sprite_Actor_updateTargetPosition.call(this);
    };

    // FIXED: Improved stepForward with better state management
    const _Sprite_Actor_stepForward = Sprite_Actor.prototype.stepForward;
    Sprite_Actor.prototype.stepForward = function() {
        // Prevent multiple step forwards
        if ($gameTemp._isEscapingBattle) {
            return;
        }

        // Prevent multiple step forwards
        if (this._isSteppingForward || $actionSequenceManager.isSequencePlaying()) {
            return;
        }

        this._isSteppingForward = true;
        // Store the original home position before stepping forward
        this._originalHomeX = this.homeX;
        this._originalHomeY = this.homeY;

        if (battleOrientation === 'Vertical') {
            // Step up in vertical mode
            this.startMove(0, -48, 12);
        } else {
            // Use default behavior (step right in horizontal mode)
            _Sprite_Actor_stepForward.call(this);
        }

        // Reset the flag after movement completes
        setTimeout(() => {
            this._isSteppingForward = false;
        }, 200);
    };

    // ENHANCED DEBUG VERSION: Comprehensive stepBack debugging
    const _Sprite_Actor_stepBack = Sprite_Actor.prototype.stepBack;
    Sprite_Actor.prototype.stepBack = function() {
        if ($gameTemp._isEscapingBattle) {
            return;
        }

        stepBackCallCount++;
        const currentTime = Date.now();

        // Generate detailed stack trace
        const stack = new Error().stack;
        const stackLines = stack.split('\n');

        // Find the calling function (skip this function and Error constructor)
        let callingFunction = 'unknown';
        for (let i = 2; i < Math.min(stackLines.length, 10); i++) {
            const line = stackLines[i].trim();
            if (line && !line.includes('stepBack') && !line.includes('Error')) {
                // Extract function name and location
                const match = line.match(/at\s+(?:(\w+\.?\w*)\s+\()?(.+?):(\d+):(\d+)/);
                if (match) {
                    const [, funcName, fileName, lineNum] = match;
                    const shortFileName = fileName.split('/').pop();
                    callingFunction = `${funcName || 'anonymous'}@${shortFileName}:${lineNum}`;
                }
                break;
            }
        }

        // Track call sources
        const currentCount = callSources.get(callingFunction) || 0;
        callSources.set(callingFunction, currentCount + 1);

        // Check all our existing conditions
        const conditions = {
            '_isSteppingBack': this._isSteppingBack,
            'actionSequenceManager.isSequencePlaying()': $actionSequenceManager?.isSequencePlaying() || false,
                                         'BattleManager._isStartingCustomSequence': BattleManager._isStartingCustomSequence || false,
                                         'actor has currentAction': this._actor?.currentAction() ? true : false,
                                         'BattleManager.isBusy()': BattleManager.isBusy ? BattleManager.isBusy() : 'unknown',
                                         'BattleManager._phase': BattleManager._phase || 'unknown'
        };

        // Check if we're about to start a custom action sequence
        const battler = this._actor;
        if (battler && battler.currentAction()) {
            const action = battler.currentAction();
            if (BattleManager.shouldUseActionSequence && BattleManager.shouldUseActionSequence(action)) {
                return;
            }
        }

        // Check if BattleManager is starting a custom sequence
        if (BattleManager._isStartingCustomSequence) {
            return;
        }

        // If we get here, allow the stepBack but log it
        this._isSteppingBack = true;

        if (battleOrientation === 'Vertical') {
            this.startMove(0, 48, 12);
        } else {
            _Sprite_Actor_stepBack.call(this);
        }

        // Restore the original home position after stepping back
        if (this._originalHomeX !== undefined && this._originalHomeY !== undefined) {
            this.homeX = this._originalHomeX;
            this.homeY = this._originalHomeY;
        }

        // Reset the flag after movement completes
        setTimeout(() => {
            this._isSteppingBack = false;
        }, 200);
    };

    const _Sprite_Actor_startMotion = Sprite_Actor.prototype.startMotion;
    Sprite_Actor.prototype.startMotion = function(motionType) {
        // During command input, only block changes away from walk motion
        if (this._isInputing && this._motion) {
            const currentMotion = this._motion.index;
            const walkMotionIndex = 0; // walk motion is index 0

            // If current motion is walk, don't allow changing to anything else
            if (currentMotion === walkMotionIndex && motionType !== 'walk') {
                return;
            }
        }

        // Our handler sets the generic motion state
        BattlerMotionHandler.startMotion(this, motionType);
        // The original call is still needed for SV-Actor specific logic (like weapon sprites)
        if (this._svBattler) {
            _Sprite_Actor_startMotion.call(this, motionType);
        }
    };

    const _Game_Actor_refresh = Game_Actor.prototype.refresh;
    Game_Actor.prototype.refresh = function() {
        const wasAlive = !this.isDead();
        _Game_Actor_refresh.call(this);

        if (wasAlive && this.isDead()) {
            // Check for custom collapse sequence
            const collapseSequence = BattleManager.getCustomCollapseSequence(this);
            if (collapseSequence && collapseSequence.length > 0) {
                setTimeout(() => {
                    BattleManager.executeCustomSequence(this, collapseSequence, 'collapse');
                }, 200);
            } else {
                this.performCollapse();
            }
        }
    };

    // ===== EVENT-DRIVEN ACTION SEQUENCE SYSTEM =====
    'use strict';

    // EVENT-DRIVEN ActionSequenceManager - Fixed timing for victory sequences
    class ActionSequenceManager {
        constructor() {
            this.currentSequence = null;
            this.isPlaying = false;
            this.currentStep = null;
            this.stepExecuted = false;
            this.specialSequences = new Map();
        }

        startSequence(sequence, allowMultiple = false, sequenceId = null) {
            if (allowMultiple || !this.isPlaying) {
                if (allowMultiple && sequenceId) {
                    this.specialSequences.set(sequenceId, {
                        sequence: [...sequence],
                        currentStep: null,
                        stepExecuted: false,
                        sequenceType: this.extractSequenceType(sequenceId)
                    });
                    this.executeSpecialSequence(sequenceId);
                } else {
                    if (this.isPlaying) {
                        return;
                    }
                    this.currentSequence = [...sequence];
                    this.isPlaying = true;
                    this.stepExecuted = false;
                    this.executeNextStep();
                }
            }
        }

        extractSequenceType(sequenceId) {
            if (sequenceId.startsWith('victory_')) return 'victory';
            if (sequenceId.startsWith('entry_')) return 'entry';
            return 'normal';
        }

        getSpecialSequenceDelay(sequenceType) {
            return 1;
        }

        executeSpecialSequence(sequenceId) {
            const seqData = this.specialSequences.get(sequenceId);
            if (!seqData || seqData.stepExecuted) return;

            // Check if victory sequences should continue
            if (sequenceId.startsWith('victory_') && !BattleManager.isBattleActive()) {
                console.log(`🎬 Stopping victory sequence ${sequenceId} - battle ended`);
                this.specialSequences.delete(sequenceId);
                return;
            }

            if (!seqData.sequence || seqData.sequence.length === 0) {
                this.specialSequences.delete(sequenceId);
                return;
            }

            // For victory and entry sequences, check if this is a looping CustomSequenceStep
            const isLoopingSequence = (seqData.sequenceType === 'victory' || seqData.sequenceType === 'entry') &&
            seqData.sequence.length === 1 &&
            seqData.sequence[0].isLooping;

            if (isLoopingSequence) {
                // Don't shift for looping sequences - reuse the same step
                seqData.currentStep = seqData.sequence[0];
            } else {
                // Normal behavior for non-looping sequences
                seqData.currentStep = seqData.sequence.shift();
            }

            seqData.stepExecuted = true;

            seqData.currentStep.execute(() => {
                seqData.stepExecuted = false;
                seqData.currentStep = null;
                const delay = this.getSpecialSequenceDelay(seqData.sequenceType);
                setTimeout(() => this.executeSpecialSequence(sequenceId), delay);
            });
        }

        executeNextStep() {
            if (this.stepExecuted) return;

            if (!this.currentSequence || this.currentSequence.length === 0) {
                this.endSequence();
                return;
            }

            this.currentStep = this.currentSequence.shift();
            this.stepExecuted = true;

            this.currentStep.execute(() => {
                this.stepExecuted = false;
                this.currentStep = null;
                this.executeNextStep();
            });
        }

        endSequence() {
            this.currentSequence = null;
            this.isPlaying = false;
            this.currentStep = null;
            this.stepExecuted = false;

            BattleManager.actionSequenceFinished();
        }

        isSequencePlaying() {
            return this.isPlaying || this.specialSequences.size > 0;
        }
    }

    // Global action sequence manager
    window.$actionSequenceManager = new ActionSequenceManager();

    // EVENT-DRIVEN Action Sequence Steps
    class ActionStep {
        constructor() {
            this.executed = false;
            this.completed = false;
            this.callback = null;
        }

        execute(callback) {
            if (this.executed) {
                return;
            }

            this.executed = true;
            this.callback = callback;
            this.perform();
        }

        complete() {
            if (this.completed) return; // Prevent double completion

            this.completed = true;
            if (this.callback) {
                const cb = this.callback;
                this.callback = null; // Clear to prevent re-execution
                cb();
            }
        }
    }

    // EVENT-DRIVEN Movement Step
    class MoveToTargetStep extends ActionStep {
        constructor(subject, target, duration = 40) {
            super();
            this.subject = subject;
            this.target = target;
            this.duration = duration;
            this.moveStarted = false;
        }

        perform() {
            if (this.moveStarted) return;

            const subjectSprite = this.subject._sprite;
            const targetSprite = this.target._sprite;

            // Enhanced debugging for enemy movement
            console.log(`🎯 MoveToTarget Debug:`);
            console.log(`  Subject: ${this.subject.name()} (${this.subject.isActor() ? 'Actor' : 'Enemy'})`);
            console.log(`  Subject sprite exists: ${!!subjectSprite}`);
            if (subjectSprite) {
                console.log(`  Subject home: (${subjectSprite._homeX}, ${subjectSprite._homeY})`);
                console.log(`  Subject current: (${subjectSprite.x}, ${subjectSprite.y})`);
            }
            console.log(`  Target: ${this.target.name()} (${this.target.isActor() ? 'Actor' : 'Enemy'})`);
            console.log(`  Target sprite exists: ${!!targetSprite}`);
            if (targetSprite) {
                console.log(`  Target position: (${targetSprite.x}, ${targetSprite.y})`);
            }

            if (!subjectSprite || !targetSprite) {
                console.log(`❌ Missing sprites - Subject: ${!!subjectSprite}, Target: ${!!targetSprite}`);
                this.complete();
                return;
            }

            // Call original method
            _MoveToTargetStep_perform.call(this);
        }
    }

    // Global animation tracking to prevent duplicates across the entire system
    const globalAnimationTracker = new Map();

    function canPlayAnimation(target, animationId, options = {}) {
        // If allowOverride is true, skip duplicate checking entirely
        if (options.allowOverride) {
            return true;
        }

        const key = `${target._battlerId || target._enemyId}_${animationId}`;
        const now = Date.now();
        const lastPlayed = globalAnimationTracker.get(key);

        // Reduced time window for custom sequences (500ms instead of 2000ms)
        const timeWindow = options.customSequence ? 500 : 2000;

        if (lastPlayed && (now - lastPlayed) < timeWindow) {
            return false;
        }

        globalAnimationTracker.set(key, now);
        return true;
    }

    class ExecuteActionStep extends ActionStep {
        constructor(action, targets) {
            super();
            this.action = action;
            this.targets = targets;
            this.actionExecuted = false;
            this.stepId = `execute_${Date.now()}_${Math.random()}`;
        }

        perform() {
            if (this.actionExecuted) {
                console.log(`⚠️ ExecuteActionStep ${this.stepId} already executed, skipping`);
                this.complete();
                return;
            }

            this.actionExecuted = true;

            if (!this.targets || this.targets.length === 0) {
                console.log(`⚠️ ExecuteActionStep ${this.stepId} has no valid targets`);
                this.complete();
                return;
            }

            try {
                const subject = this.action.subject();
                console.log(`🎯 ExecuteActionStep ${this.stepId} - ${subject.name()} using ${this.action.item().name} on ${this.targets.length} targets`);

                // Filter targets to only those that can receive this action
                const validTargets = this.targets.filter(target => canApplyActionToTarget(this.action, target));

                if (validTargets.length === 0) {
                    console.log(`⚠️ No valid targets for action`);
                    this.complete();
                    return;
                }

                console.log(`✅ ${validTargets.length} valid targets found`);

                // Execute the action with proper damage application
                ActionExecutor.execute(this.action, validTargets, {
                    playAnimation: true,
                    effectDelay: 0,
                    showDamage: true
                });

                // Wait for animation and damage effects to complete
                setTimeout(() => {
                    console.log(`✅ ExecuteActionStep ${this.stepId} completed`);
                    this.complete();
                }, 100);

            } catch (e) {
                console.error(`❌ Error executing action step ${this.stepId}:`, e);
                this.complete(); // Fail gracefully
            }
        }
    }

    // EVENT-DRIVEN Return Home Step
    class ReturnHomeStep extends ActionStep {
        constructor(subject, duration = 40) {
            super();
            this.subject = subject;
            this.duration = duration;
            this.returnStarted = false;
        }

        perform() {
            if (this.returnStarted) return;

            const subjectSprite = this.subject._sprite;
            if (!subjectSprite) {
                this.complete();
                return;
            }

            this.returnStarted = true;

            // Return to home (offset 0,0)
            subjectSprite.startMove(0, 0, this.duration);

            // Completion timing
            const expectedDuration = Math.max(this.duration * 16.67, 100);
            setTimeout(() => {
                subjectSprite._movementDuration = 0; // Force stop
                subjectSprite.x = subjectSprite._homeX;
                subjectSprite.y = subjectSprite._homeY;
                this.complete();
            }, expectedDuration);
        }
    }

    // INSTANT Motion Step (no timing issues)
    class SetMotionStep extends ActionStep {
        constructor(subject, motionType) {
            super();
            this.subject = subject;
            this.motionType = motionType;
            this.motionSet = false;
        }

        perform() {
            if (this.motionSet) return;
            this.motionSet = true;

            const subjectSprite = this.subject._sprite;
            if (subjectSprite && subjectSprite.startMotion) {
                subjectSprite.startMotion(this.motionType);
            }

            // Immediate completion for motion changes
            setTimeout(() => this.complete(), 1);
        }
    }

    // PRECISE Wait Step (no frame polling)
    class WaitStep extends ActionStep {
        constructor(frames) {
            super();
            this.frames = frames;
            this.waitStarted = false;
        }

        perform() {
            if (this.waitStarted) return;
            this.waitStarted = true;

            const duration = $battleTiming.framesToMs(this.frames);
            setTimeout(() => this.complete(), duration);
        }
    }

    // Action sequence note tag parser
    function parseActionSequenceData(item, sequenceType) {
        if (!item || !item.note) return null;

        const noteData = item.note;
        const sequenceRegex = new RegExp(`<action\\s+sequence:\\s*${sequenceType}>([\\s\\S]*?)<\\/action\\s+sequence>`, 'i');
        const match = noteData.match(sequenceRegex);

        if (match) {
            const content = match[1].trim();
            if (content) {
                return parseSequenceCommands(content);
            }
        }

        return null;
    }

    // Parse sequence commands from note tag content
    function parseSequenceCommands(content) {
        const lines = content.split('\n');
        const commands = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue; // Skip empty lines and comments

            const command = parseSequenceCommand(trimmed);
            if (command) {
                commands.push(command);
            }
        }

        return commands;
    }

    // Parse individual sequence command
    function parseSequenceCommand(commandLine) {
        // Remove any leading/trailing whitespace and normalize
        const line = commandLine.trim().toLowerCase();
        const originalLine = commandLine.trim(); // Keep original case for some commands

        // Direction commands
        if (line.startsWith('direction:')) {
            const dirData = line.replace('direction:', '').trim();
            const parts = dirData.split(',').map(p => p.trim());
            if (parts.length >= 2) {
                return {
                    type: 'direction',
                    target: parts[0], // user, subject
                    direction: parts[1] // up, down, left, right
                };
            }
        }

        // ENHANCED: Motion commands with better parameter handling
        if (line.startsWith('motion:')) {
            const motionData = line.replace('motion:', '').trim();
            const parts = motionData.split(',').map(p => p.trim());

            if (parts.length >= 3) {
                // Format: motion: user, motionType, frame, duration
                return {
                    type: 'motion',
                    target: parts[0] || 'user',
                    motion: parts[1] || 'wait',
                    frame: parseInt(parts[2]) || 1,
                                         duration: parseInt(parts[3]) || 60
                };
            } else if (parts.length >= 2) {
                // Format: motion: user, motionType
                return {
                    type: 'motion',
                    target: parts[0] || 'user',
                    motion: parts[1] || parts[0]
                };
            } else {
                // Format: motion: motionType
                return {
                    type: 'motion',
                    target: 'user',
                    motion: parts[0] || 'wait'
                };
            }
        }

        // Enhanced wait commands
        if (line.startsWith('wait:')) {
            const waitData = line.replace('wait:', '').trim();
            const parts = waitData.split(',').map(p => p.trim());
            if (parts.length >= 2) {
                const target = parts[0]; // user, subject
                const value = parts[1];
                if (value === 'move') {
                    return { type: 'wait_move', target: target };
                } else {
                    const frames = parseInt(value) || 12;
                    return { type: 'wait', target: target, frames: frames };
                }
            } else {
                // Simple wait command
                const frames = parseInt(waitData) || 12;
                return { type: 'wait', frames: frames };
            }
        }

        if (line.startsWith('throw:')) {
            const throwData = line.replace('throw:', '').trim();
            const parts = throwData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                // Determine target mode based on the target string
                let targetMode = 'default';
                const targetString = parts[1].toLowerCase();

                if (targetString === 'all targets') {
                    targetMode = 'individual';
                } else if (targetString === 'area targets') {
                    targetMode = 'area';
                }

                return {
                    type: 'throw',
                    projectile: parts[0],
                    target: parts[1],
                    targetMode: targetMode
                };
            }
        }

        if (line.startsWith('shake:')) {
            const shakeData = line.replace('shake:', '').trim();
            const parts = shakeData.split(',').map(p => p.trim());

            if (parts.length >= 3) {
                const power = parseInt(parts[0]) || 5;
                const speed = parseInt(parts[1]) || 5;
                const duration = parseInt(parts[2]) || 60;

                return {
                    type: 'shake',
                    power: power,
                    speed: speed,
                    duration: duration
                };
            } else if (parts.length >= 1) {
                // Support simplified format with just power
                const power = parseInt(parts[0]) || 5;
                return {
                    type: 'shake',
                    power: power,
                    speed: 5, // Default speed
                    duration: 60 // Default duration
                };
            }
        }

        if (line.startsWith('pose:')) {
            const poseData = line.replace('pose:', '').trim();
            const parts = poseData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                const target = parts[0]; // user, subject
                const poseAction = parts[1]; // clear, reset, etc.

                return {
                    type: 'pose',
                    target: target,
                    action: poseAction
                };
            }
        }

        // Rotate commands
        if (line.startsWith('rotate:')) {
            const rotateData = line.replace('rotate:', '').trim();
            const parts = rotateData.split(',').map(p => p.trim());

            if (parts.length >= 3) {
                const target = parts[0]; // user, subject
                const angle = parseInt(parts[1]) || 0; // degrees
                const frames = parseInt(parts[2]) || 30; // duration in frames
                const anchor = parts.length >= 4 ? parts[3] : 'center'; // center, top, bottom

                return {
                    type: 'rotate',
                    target: target,
                    angle: angle,
                    frames: frames,
                    anchor: anchor
                };
            }
        }

        // Frame commands (for charset sprites)
        if (line.startsWith('frame:')) {
            const frameData = line.replace('frame:', '').trim();
            const parts = frameData.split(',').map(p => p.trim());

            if (parts.length >= 3) {
                const target = parts[0]; // user, subject
                const row = Math.max(0, (parseInt(parts[1]) || 1) - 1); // Convert 1-based to 0-based
                const column = Math.max(0, (parseInt(parts[2]) || 1) - 1); // Convert 1-based to 0-based

                return {
                    type: 'frame',
                    target: target,
                    row: row,
                    column: column
                };
            }
        }

        // ENHANCED: Movement commands with better distance and Z-order parsing
        if (line.startsWith('move:')) {
            const moveData = line.replace('move:', '').trim();
            const parts = moveData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                const target = parts[0]; // user, subject
                const moveType = parts[1];

                if (moveType === 'to target' && parts.length >= 3) {
                    const frames = parseInt(parts[2]) || 40;
                    let xOffset = 0; // default X offset
                    let yOffset = 0; // default Y offset
                    let zOrder = 'normal';

                    // NEW: Parse separate X and Y offsets
                    if (parts.length >= 4) {
                        // Check if we have the new format with X and Y offsets
                        const param3 = parts[3].trim();
                        const param4 = parts.length >= 5 ? parts[4].trim() : '';
                        const param5 = parts.length >= 6 ? parts[5].trim() : '';

                        // Detect if using new format (X, Y offsets) or old format (single distance)
                        const hasNumericParam4 = param4 !== '' && !isNaN(parseInt(param4));

                        if (hasNumericParam4 || parts.length >= 5) {
                            // NEW FORMAT: move: user, to target, frames, xOffset, yOffset, zOrder
                            xOffset = parseInt(param3) || 0;
                            yOffset = parseInt(param4) || 0;

                            // Parse Z-order from remaining parameters
                            if (param5 && (param5.includes('front') || param5.includes('back') || param5.includes('normal'))) {
                                zOrder = param5;
                            } else if (param4 && !hasNumericParam4 && (param4.includes('front') || param4.includes('back') || param4.includes('normal'))) {
                                zOrder = param4;
                                yOffset = 0; // Reset Y offset if param4 was actually Z-order
                            }
                        } else {
                            // OLD FORMAT: move: user, to target, frames, distance/zOrder
                            // Maintain backwards compatibility
                            const distanceMatch = param3.match(/(-?\d+)\s*(front|back|normal)?/);
                            if (distanceMatch) {
                                const distance = parseInt(distanceMatch[1]) || 80;
                                zOrder = distanceMatch[2] || 'normal';

                                // Convert single distance to appropriate offset based on battle orientation
                                // This maintains the current behavior for old commands
                                if (battleOrientation === 'Vertical') {
                                    yOffset = distance; // In vertical mode, offset is Y axis
                                    xOffset = 0;
                                } else {
                                    xOffset = distance; // In horizontal mode, offset is X axis
                                    yOffset = 0;
                                }
                            } else if (param3.includes('front')) {
                                zOrder = 'front';
                            } else if (param3.includes('back')) {
                                zOrder = 'back';
                            } else {
                                const distanceValue = parseInt(param3);
                                if (!isNaN(distanceValue)) {
                                    if (battleOrientation === 'Vertical') {
                                        yOffset = distanceValue;
                                        xOffset = 0;
                                    } else {
                                        xOffset = distanceValue;
                                        yOffset = 0;
                                    }
                                }
                            }
                        }
                    }

                    return {
                        type: 'move',
                        target: target,
                        destination: 'target',
                        frames: frames,
                        xOffset: xOffset,
                        yOffset: yOffset,
                        zOrder: zOrder
                    };
                } else if (moveType === 'to home') {
                    return {
                        type: 'move',
                        target: target,
                        destination: 'home',
                        frames: parseInt(parts[2]) || 40
                    };
                } else if (moveType === 'forward' && parts.length >= 3) {
                    const frames = parseInt(parts[2]) || 40;
                    const distance = parts.length >= 4 ? parseInt(parts[3]) : 48;

                    return {
                        type: 'move',
                        target: target,
                        destination: 'forward',
                        frames: frames,
                        distance: distance
                    };
                } else if (moveType === 'backward' && parts.length >= 3) {
                    const frames = parseInt(parts[2]) || 40;
                    const distance = parts.length >= 4 ? parseInt(parts[3]) : 48;

                    return {
                        type: 'move',
                        target: target,
                        destination: 'backward',
                        frames: frames,
                        distance: distance
                    };
                }}
                // Fallback to simple move commands
                if (moveData === 'target' || moveData === 'to target') {
                    return { type: 'move', target: 'target' };
                } else if (moveData === 'home' || moveData === 'to home') {
                    return { type: 'move', target: 'home' };
                }
        }

        // SE (Sound Effect) commands
        if (line.startsWith('se:')) {
            const seData = originalLine.replace(/^se:\s*/i, '').trim();
            const parts = seData.split(',').map(p => p.trim());

            if (parts.length >= 2 && parts[0].toLowerCase() === 'play') {
                return {
                    type: 'se',
                    name: parts[1],
                    volume: parts.length >= 3 ? parseInt(parts[2]) || 90 : 90,
                                         pitch: parts.length >= 4 ? parseInt(parts[3]) || 100 : 100,
                                         pan: parts.length >= 5 ? parseInt(parts[4]) || 0 : 0
                };
            }
        }

        if (line.startsWith('balloon:')) {
            const balloonData = line.replace('balloon:', '').trim();
            const parts = balloonData.split(',').map(p => p.trim());
            if (parts.length >= 2) {
                const target = parts[0];
                const balloonId = parseInt(parts[1]);
                if (!isNaN(balloonId)) {
                    return { type: 'balloon', target: target, id: balloonId };
                }
            }
        }

        // Enhanced animation commands
        if (line.startsWith('animation:')) {
            const animData = line.replace('animation:', '').trim();
            const parts = animData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                const target = parts[0]; // user, subject
                const animValue = parts[1];

                if (animValue === 'weapon' || animValue === 'action') {
                    return { type: 'animation', target: target, source: animValue };
                } else {
                    const animId = parseInt(animValue);
                    if (!isNaN(animId)) {
                        return { type: 'animation', target: target, id: animId };
                    }
                }
            } else {
                // Fallback to original format
                if (animData === 'weapon' || animData === 'action') {
                    return { type: 'animation', source: animData };
                } else {
                    const animId = parseInt(animData);
                    if (!isNaN(animId)) {
                        return { type: 'animation', id: animId };
                    }
                }
            }
        }

        // Icon commands
        if (line.startsWith('icon:')) {
            const iconData = originalLine.replace(/^icon:\s*/i, '').trim();
            const parts = iconData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                return {
                    type: 'icon',
                    target: parts[0], // user, subject
                    iconType: parts[1], // equip 1, icon X, clear
                    frame: parts[2] ? parseInt(parts[2]) : 1,
                                         x: parts[3] ? parseInt(parts[3]) : 0,
                                         y: parts[4] ? parseInt(parts[4]) : 0,
                                         opacity: parts[5] ? parseInt(parts[5]) : 255,
                                         rotation: parts[6] ? parseInt(parts[6]) : 0, // Static rotation angle
                                         spin: parts[7] ? parseInt(parts[7]) : 0, // Continuous spin speed (optional 8th parameter)
                layer: parts[8] || 'normal' // above, below, normal (moved to 9th parameter)
                };
            }
        }

        // Enhanced opacity commands
        if (line.startsWith('opacity:')) {
            const opData = line.replace('opacity:', '').trim();
            const parts = opData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                const target = parts[0]; // user, subject
                const value = parseInt(parts[1]);
                const frames = parts.length >= 3 ? parseInt(parts[2]) : 30; // Default to 30 frames if not specified

                if (!isNaN(value)) {
                    return {
                        type: 'opacity',
                        target: target,
                        value: value,
                        frames: frames
                    };
                }
            }
        }

        // ENHANCED: Jump commands with proper parameter validation
        if (line.startsWith('jump:')) {
            const jumpData = line.replace('jump:', '').trim();
            const parts = jumpData.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                const target = parts[0]; // user, subject
                const destination = parts[1]; // to target, to home, etc.

                if (destination === 'to target' && parts.length >= 3) {
                    const frames = parseInt(parts[2]) || 30;
                    let xOffset = 0;
                    let yOffset = 0;
                    let arcHeight = 60; // default arc height
                    let zOrder = 'normal';

                    // Parse offsets and arc height
                    if (parts.length >= 4) {
                        xOffset = parseInt(parts[3]) || 0;
                    }
                    if (parts.length >= 5) {
                        yOffset = parseInt(parts[4]) || 0;
                    }
                    if (parts.length >= 6) {
                        arcHeight = parseInt(parts[5]) || 60;
                    }
                    if (parts.length >= 7) {
                        const zOrderParam = parts[6].trim();
                        if (zOrderParam.includes('front') || zOrderParam.includes('back') || zOrderParam.includes('normal')) {
                            zOrder = zOrderParam;
                        }
                    }

                    return {
                        type: 'jump',
                        target: target,
                        destination: 'target',
                        frames: frames,
                        xOffset: xOffset,
                        yOffset: yOffset,
                        arcHeight: arcHeight,
                        zOrder: zOrder
                    };
                } else if (destination === 'to home') {
                    const frames = parseInt(parts[2]) || 30;
                    let arcHeight = 60;

                    if (parts.length >= 4) {
                        arcHeight = parseInt(parts[3]) || 60;
                    }

                    return {
                        type: 'jump',
                        target: target,
                        destination: 'home',
                        frames: frames,
                        arcHeight: arcHeight
                    };
                } else {
                    // Legacy format support: jump: user, height, frames
                    const height = parseInt(parts[1]) || 60;
                    const frames = parseInt(parts[2]) || 30;

                    return {
                        type: 'jump',
                        target: target,
                        height: height,
                        frames: frames,
                        timing: 'normal'
                    };
                }
            }
        }

        // Picture commands
        if (line.startsWith('picture:')) {
            const picData = originalLine.replace(/^picture:\s*/i, '').trim();
            const parts = picData.split(',').map(p => p.trim());

            if (parts.length >= 3) {
                const result = {
                    type: 'picture',
                    target: parts[0], // user, subject
                    action: parts[1], // clear, show, move
                    id: parseInt(parts[2]) || 1
                };

                // Parse additional parameters based on action
                if (parts[1] === 'show') {
                    result.filename = parts[3] || `Picture${result.id}`;
                    result.x = parts.length >= 5 ? parseInt(parts[4]) : 0;
                    result.y = parts.length >= 6 ? parseInt(parts[5]) : 0;
                    result.opacity = parts.length >= 7 ? parseInt(parts[6]) : 255;
                    result.blendMode = parts.length >= 8 ? parseInt(parts[7]) : 0;
                    result.scaleX = parts.length >= 9 ? parseInt(parts[8]) : 100;
                    result.scaleY = parts.length >= 10 ? parseInt(parts[9]) : 100;
                    result.layer = parts.length >= 11 ? parts[10] : 'normal';
                } else if (parts[1] === 'move') {
                    result.x = parts.length >= 4 ? parseInt(parts[3]) : undefined;
                    result.y = parts.length >= 5 ? parseInt(parts[4]) : undefined;
                    result.opacity = parts.length >= 6 ? parseInt(parts[5]) : undefined;
                    result.blendMode = parts.length >= 7 ? parseInt(parts[6]) : undefined;
                    result.scaleX = parts.length >= 8 ? parseInt(parts[7]) : undefined;
                    result.scaleY = parts.length >= 9 ? parseInt(parts[8]) : undefined;
                }

                return result;
            }
        }

        // Conditional commands
        if (line.startsWith('if:')) {
            const condition = originalLine.replace(/^if:\s*/i, '').trim();
            return {
                type: 'conditional',
                subtype: 'if',
                condition: condition
            };
        }

        if (line === 'else') {
            return {
                type: 'conditional',
                subtype: 'else'
            };
        }

        if (line === 'end') {
            return {
                type: 'conditional',
                subtype: 'end'
            };
        }

        // Action effect commands
        if (line.startsWith('action:')) {
            const actionData = line.replace('action:', '').trim();
            if (actionData === 'all targets, effect') {
                return { type: 'action_effect', targets: 'all' };
            }
        }

        // Effect execution
        if (line === 'execute action' || line === 'action') {
            return { type: 'execute' };
        }

        console.log(`⚠️ Unknown sequence command: ${commandLine}`);
        return null;
    }

    // Get action sequence with priority system
    function getActionSequence(action, battler, sequenceType) {
        const sources = [];

        // Priority 1: Skill/Item
        const item = action.item();
        if (item) {
            sources.push(item);
        }

        // Priority 2: Weapon (for actors)
        if (battler.isActor() && action.isAttack()) {
            const weapons = battler.weapons();
            if (weapons.length > 0) {
                sources.push(weapons[0]);
            }
        }

        // Priority 3: Class (for actors)
        if (battler.isActor()) {
            const currentClass = $dataClasses[battler.currentClass().id];
            if (currentClass) {
                sources.push(currentClass);
            }
        }

        // Priority 4: Actor/Enemy
        const battlerData = battler.isActor() ? $dataActors[battler.actorId()] : battler.enemy();
        if (battlerData) {
            sources.push(battlerData);
        }

        // Find first source with the sequence
        for (const source of sources) {
            const sequence = parseActionSequenceData(source, sequenceType);
            if (sequence && sequence.length > 0) {
                return sequence;
            }
        }

        return null;
    }

    // Icon Sprite Management System
    class Sprite_ActionIcon extends Sprite {
        constructor(iconData, battler) {
            super();
            this.iconData = iconData;
            this.battler = battler;
            this.iconIndex = iconData.index;
            this._lastUpdateTime = performance.now();
            this.setupIcon();
            this.setupPosition();
            this.setupRotationAndSpin();
        }

        setupIcon() {
            // Load the icon bitmap
            this.bitmap = ImageManager.loadSystem('IconSet');

            // Determine which icon to show
            let iconId = 0;

            if (this.iconData.iconType === 'action') {
                const action = this.battler.currentAction();
                if (action && action.item()) {
                    iconId = action.item().iconIndex;
                }
            } else if (this.iconData.iconType.startsWith('icon ')) {
                iconId = parseInt(this.iconData.iconType.replace('icon ', ''));
            } else if (this.iconData.iconType.startsWith('equip ')) {
                const slotId = parseInt(this.iconData.iconType.replace('equip ', ''));
                if (this.battler.isActor() && this.battler._equips && this.battler._equips[slotId - 1]) {
                    const item = this.battler._equips[slotId - 1].object();
                    if (item) {
                        iconId = item.iconIndex;
                    }
                }
            } else if (this.iconData.iconType === 'shield') {
                if (this.battler.isActor()) {
                    const shields = this.battler.weapons().filter(weapon =>
                    weapon.etypeId === 2
                    );
                    if (shields.length > 0) {
                        iconId = shields[0].iconIndex;
                    }
                }
            }

            const iconSize = 32;
            const cols = 16;
            const sx = (iconId % cols) * iconSize;
            const sy = Math.floor(iconId / cols) * iconSize;

            this.setFrame(sx, sy, iconSize, iconSize);
            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
            this.opacity = this.iconData.opacity || 255;
        }

        setupPosition() {
            const battlerSprite = this.battler._sprite;
            if (battlerSprite) {
                this.x = battlerSprite.x + (this.iconData.x || 0);
                this.y = battlerSprite.y + (this.iconData.y || 0);

                // Use unified Z-index system
                const layer = ZIndexManager.normalizeLayer(this.iconData.layer);
                ZIndexManager.updateSpriteZIndex(this, 'icon', layer);
            }
        }

        setupRotationAndSpin() {
            const staticRotation = this.iconData.rotation || 0;
            this.rotation = (staticRotation * Math.PI / 180);

            const spinSpeed = this.iconData.spin || 0;
            this.spinSpeed = (spinSpeed * Math.PI / 180) / 60;

            const maxSpinSpeed = Math.PI / 20;
            if (Math.abs(this.spinSpeed) > maxSpinSpeed) {
                this.spinSpeed = Math.sign(this.spinSpeed) * maxSpinSpeed;
            }
        }

        updateIconData(newIconData) {
            const oldData = this.iconData;
            const oldZIndex = this.zIndex;
            const oldIconType = this.iconData.iconType; // Store the old icon type

            this.iconData = newIconData;

            // Update position and z-index
            this.setupPosition();

            // Update opacity
            if (newIconData.opacity !== undefined && newIconData.opacity !== oldData.opacity) {
                this.opacity = newIconData.opacity;
            }

            // Update rotation and spin
            if (newIconData.rotation !== oldData.rotation || newIconData.spin !== oldData.spin) {
                this.setupRotationAndSpin();
            }

            // CRITICAL FIX: Update the visual icon if the icon type has changed
            if (newIconData.iconType !== oldIconType) {
                this.setupIcon();
                console.log(`Updated icon visual from ${oldIconType} to ${newIconData.iconType}`);
            }

            // Force proper repositioning if z-index changed
            if (oldZIndex !== this.zIndex) {
                this.repositionInContainer();
            }
        }

        // NEW: Reliable container repositioning method
        repositionInContainer() {
            if (!this.parent) {
                console.log(`⚠️ Icon has no parent container`);
                return;
            }

            const container = this.parent;

            // Remove from current position
            const currentIndex = container.getChildIndex(this);
            container.removeChildAt(currentIndex);

            // Find correct position based on z-index comparison
            let targetIndex = 0;

            for (let i = 0; i < container.children.length; i++) {
                const child = container.children[i];
                const childZ = this.getChildZIndex(child);

                if (this.zIndex > childZ) {
                    targetIndex = i + 1;
                } else {
                    break;
                }
            }

            // Insert at target position
            container.addChildAt(this, targetIndex);

            // Only log repositioning if it's significant (more than 2 positions)
            if (Math.abs(currentIndex - targetIndex) > 2) {
                console.log(`🔄 Repositioned icon from index ${currentIndex} to ${targetIndex} (z-index: ${this.zIndex})`);
            }
        }

        // Helper method to get z-index with fallback
        getChildZIndex(child) {
            if (child.zIndex !== undefined) {
                return child.zIndex;
            }

            // Fallback z-index based on sprite type
            if (child.constructor.name === 'Sprite_Enemy') {
                return 0;
            } else if (child.constructor.name === 'Sprite_Actor') {
                return 1;
            }

            return 0; // Default fallback
        }

        // Debug method to log container child order
        debugContainerOrder() {
            if (true) return; /* [silenced] container-order dump */

            const children = this.parent.children;
// [silenced]             console.log(`🔍 Container order after repositioning:`);

            children.forEach((child, index) => {
                const zIndex = this.getChildZIndex(child);
                const type = child.constructor.name;
                const isThisIcon = child === this;
                const marker = isThisIcon ? ' ← THIS ICON' : '';

                console.log(`  ${index}: ${type} (z: ${zIndex})${marker}`);
            });
        }

        update() {
            super.update();

            const now = performance.now();
            const deltaTime = now - this._lastUpdateTime;
            this._lastUpdateTime = now;

            // Update position to follow battler smoothly
            const battlerSprite = this.battler._sprite;
            if (battlerSprite) {
                const oldY = this.y;
                this.x = battlerSprite.x + (this.iconData.x || 0);
                this.y = battlerSprite.y + (this.iconData.y || 0);

                // Only update Z-index when Y position changes significantly (> 1 pixel)
                // AND when no animations are playing (to prevent jitter from container reordering)
                // This prevents unnecessary render order changes that cause jitter
                const hasActiveAnimations = this.parent && this.parent.children.some(child =>
                    child.constructor.name === 'Sprite_Animation' ||
                    child.constructor.name === 'Sprite_AnimationMV'
                );

                if (Math.abs(this.y - oldY) > 1 && !hasActiveAnimations) {
                    const layer = ZIndexManager.normalizeLayer(this.iconData.layer);
                    ZIndexManager.updateSpriteZIndex(this, 'icon', layer);
                }
            }

            // Apply continuous spin only if spin speed is set
            if (this.spinSpeed !== 0) {
                const frameMultiplier = Math.min(deltaTime / 16.67, 2);
                this.rotation += this.spinSpeed * frameMultiplier;

                while (this.rotation > Math.PI * 2) this.rotation -= Math.PI * 2;
                while (this.rotation < -Math.PI * 2) this.rotation += Math.PI * 2;
            }
        }

        destroy() {
            if (this.parent) {
                this.parent.removeChild(this);
            }
        }
    }

    // Simplified Sprite_ActionPicture class that doesn't worry about Z-index
    class Sprite_ActionPicture extends Sprite {
        constructor(pictureData, battler) {
            super();
            this.pictureData = pictureData;
            this.battler = battler;
            this.pictureId = pictureData.id;

            this.setupPicture();
            this.setupPosition();

            console.log(`Created picture ${pictureData.filename} with layer '${pictureData.layer}'`);
        }

        setupPicture() {
            if (this.pictureData.filename) {
                this.bitmap = ImageManager.loadPicture(this.pictureData.filename);
            }

            this.anchor.x = 0.5;
            this.anchor.y = 0.5;
            this.opacity = this.pictureData.opacity || 255;
            this.blendMode = this.pictureData.blendMode || 0;

            const scaleX = (this.pictureData.scaleX || 100) / 100;
            const scaleY = (this.pictureData.scaleY || 100) / 100;
            this.scale.set(scaleX, scaleY);
        }

        setupPosition() {
            const battlerSprite = this.battler._sprite;
            if (battlerSprite) {
                this.x = battlerSprite.x + (this.pictureData.x || 0);
                this.y = battlerSprite.y + (this.pictureData.y || 0);
            }
        }

        update() {
            super.update();

            // Update position to follow battler
            const battlerSprite = this.battler._sprite;
            if (battlerSprite) {
                this.x = battlerSprite.x + (this.pictureData.x || 0);
                this.y = battlerSprite.y + (this.pictureData.y || 0);
            }
        }

        updatePictureData(newPictureData) {
            const oldLayer = this.pictureData.layer;
            this.pictureData = newPictureData;

            this.setupPosition();
            this.opacity = newPictureData.opacity || 255;
            this.blendMode = newPictureData.blendMode || 0;

            const scaleX = (newPictureData.scaleX || 100) / 100;
            const scaleY = (newPictureData.scaleY || 100) / 100;
            this.scale.set(scaleX, scaleY);

            // If layer changed, move to different container
            if (oldLayer !== newPictureData.layer) {
                const oldParent = this.parent;
                const newContainer = getLayerContainer(newPictureData.layer);

                if (oldParent && newContainer && oldParent !== newContainer) {
                    oldParent.removeChild(this);
                    newContainer.addChild(this);
                    console.log(`Moved picture from ${getContainerName(oldLayer)} to ${getContainerName(newPictureData.layer)}`);
                }
            }
        }

        destroy() {
            if (this.parent) {
                this.parent.removeChild(this);
            }
        }
    }

    // 2. ADD PICTURE MANAGEMENT FUNCTIONS
    // Add these functions after the icon management functions:

    function addBattlerPicture(battler, pictureData) {
        // Initialize _actionPictures as Map if it doesn't exist - MUST be first
        if (!battler._actionPictures || !(battler._actionPictures instanceof Map)) {
            battler._actionPictures = new Map();
        }

        // Check if picture with same ID already exists
        if (battler._actionPictures.has(pictureData.id)) {
            const existingPicture = battler._actionPictures.get(pictureData.id);

            if (!pictureData.layer && existingPicture.pictureData.layer) {
                pictureData.layer = existingPicture.pictureData.layer;
            }

            existingPicture.updatePictureData(pictureData);
            return;
        }

        // Create new picture sprite
        const pictureSprite = new Sprite_ActionPicture(pictureData, battler);
        battler._actionPictures.set(pictureData.id, pictureSprite);

        // Get the correct container based on layer
        const targetContainer = getLayerContainer(pictureData.layer);

        if (targetContainer) {
            targetContainer.addChild(pictureSprite);
            console.log(`Added picture ${pictureData.filename} to ${getContainerName(pictureData.layer)} container`);
        } else {
            console.error(`Failed to find container for layer: ${pictureData.layer}`);
        }
    }

    // Get the appropriate container for each layer
    function getLayerContainer(layer) {
        const scene = SceneManager._scene;
        if (!scene || !scene._spriteset) {
            return null;
        }

        const spriteset = scene._spriteset;
        const normalizedLayer = ZIndexManager.normalizeLayer(layer);

        switch (normalizedLayer) {
            case 'below':
                // Add below battlefield
                return spriteset._battleField || spriteset._baseSprite;

            case 'above':
                // Create or get the above layer container
                if (!spriteset._aboveLayer) {
                    spriteset._aboveLayer = new Sprite();
                    spriteset._aboveLayer.z = 99999; // Very high Z to ensure it's on top

                    // Add the above layer to the main spriteset, not the battlefield
                    if (spriteset._pictureContainer) {
                        // Add after picture container if it exists
                        const pictureIndex = spriteset.children.indexOf(spriteset._pictureContainer);
                        spriteset.addChildAt(spriteset._aboveLayer, pictureIndex + 1);
                    } else {
                        // Add as the last child to ensure it renders on top
                        spriteset.addChild(spriteset._aboveLayer);
                    }

                    console.log('Created above layer container');
                }
                return spriteset._aboveLayer;

            case 'normal':
            default:
                // Use battlefield for normal layer
                return spriteset._battleField;
        }
    }

    // Helper function to get container name for logging
    function getContainerName(layer) {
        const normalizedLayer = ZIndexManager.normalizeLayer(layer);
        switch (normalizedLayer) {
            case 'below': return 'below/battlefield';
            case 'above': return 'above';
            case 'normal': return 'normal/battlefield';
            default: return 'unknown';
        }
    }

    function removeBattlerPicture(battler, pictureId) {
        // FIXED: Check instanceof Map
        if (battler._actionPictures && battler._actionPictures instanceof Map && battler._actionPictures.has(pictureId)) {
            const pictureSprite = battler._actionPictures.get(pictureId);

            // Remove from whichever container it's in
            if (pictureSprite.parent) {
                pictureSprite.parent.removeChild(pictureSprite);
            }

            battler._actionPictures.delete(pictureId);
            console.log(`Removed picture ${pictureId} from ${battler.name()}`);
        }
    }

    function clearAllBattlerPictures(battler) {
        // FIXED: Check instanceof Map
        if (battler._actionPictures && battler._actionPictures instanceof Map) {
            for (const [id, pictureSprite] of battler._actionPictures) {
                if (pictureSprite.parent) {
                    pictureSprite.parent.removeChild(pictureSprite);
                }
            }
            battler._actionPictures.clear();
            console.log(`Cleared all pictures from ${battler.name()}`);
        }
    }



    // ===== ENHANCED ICON MANAGEMENT WITH Z-LAYER PRESERVATION =====
    function addBattlerIcon(battler, iconData) {
        // Initialize _actionIcons as Map if it doesn't exist - MUST be first
        if (!battler._actionIcons || !(battler._actionIcons instanceof Map)) {
            battler._actionIcons = new Map();
        }

        // Check if icon with same index already exists
        if (battler._actionIcons.has(iconData.index)) {
            const existingIcon = battler._actionIcons.get(iconData.index);

            // Preserve layer information during updates if not specified
            if (!iconData.layer && existingIcon.iconData.layer) {
                iconData.layer = existingIcon.iconData.layer;
            }

            existingIcon.updateIconData(iconData);
// [silenced]             console.log(`🔄 Updated existing icon ${iconData.iconType} (index ${iconData.index})`);
            return;
        }

        // Create new icon sprite
        const iconSprite = new Sprite_ActionIcon(iconData, battler);
        battler._actionIcons.set(iconData.index, iconSprite);

        // Add to battlefield with proper initial positioning
        const battleField = SceneManager._scene._spriteset._battleField;
        if (battleField) {
            // Find correct insertion position
            let insertIndex = 0;

            for (let i = 0; i < battleField.children.length; i++) {
                const child = battleField.children[i];
                const childZ = iconSprite.getChildZIndex(child);

                if (iconSprite.zIndex > childZ) {
                    insertIndex = i + 1;
                } else {
                    break;
                }
            }

            // Insert at calculated position
            battleField.addChildAt(iconSprite, insertIndex);

// [silenced]             console.log(`✅ Added icon ${iconData.iconType} at position ${insertIndex} with z-index ${iconSprite.zIndex}`);

            // Debug initial positioning
            iconSprite.debugContainerOrder();
        }
    }

    function removeBattlerIcon(battler, index) {
        // FIXED: Check instanceof Map
        if (battler._actionIcons && battler._actionIcons instanceof Map && battler._actionIcons.has(index)) {
            const iconSprite = battler._actionIcons.get(index);
            if (iconSprite.parent) {
                iconSprite.parent.removeChild(iconSprite);
            }
            battler._actionIcons.delete(index);
// [silenced]             console.log(`✅ Removed icon index ${index} from ${battler.name()}`);
        }
    }

    function clearAllBattlerIcons(battler) {
        // FIXED: Check if it's actually a Map before iterating
        if (battler._actionIcons && battler._actionIcons instanceof Map) {
            for (const [index, iconSprite] of battler._actionIcons) {
                if (iconSprite.parent) {
                    iconSprite.parent.removeChild(iconSprite);
                }
            }
            battler._actionIcons.clear();
// [silenced]             console.log(`✅ Cleared all icons from ${battler.name()}`);
        }
    }

    // ENHANCED: CustomSequenceStep with proper phase completion detection and animation control
    class CustomSequenceStep extends ActionStep {
        constructor(commands, subject, action, targets, phaseName = 'unknown', isLooping = false) {
            super();
            this.commands = commands || [];
            this.subject = subject;
            this.action = action;
            this.targets = targets;
            this.phaseName = phaseName;
            this.currentCommandIndex = 0;
            this.sequenceStarted = false;
            this.phaseCompleted = false;
            this.pendingMovements = new Set();
            this.isLooping = isLooping;
            this.originalCommands = [...commands];
            this.loopCount = 0;
        }

        perform() {
            if (this.sequenceStarted) {
                return;
            }
            this.sequenceStarted = true;
            this.loopCount = 0; // Initialize loop counter

            // MODIFICATION: The special handling for looping sequences has been removed.
            // The previous logic caused the first loop of the victory sequence to run at a
            // different speed because it followed a different execution path.
            // This revised method ensures the first run and all subsequent loops
            // are executed identically, fixing the "super speed" issue.
            this.executeNextCommand();
        }

        executeNextCommand() {
            if (this.currentCommandIndex >= this.commands.length) {
                if (this.isLooping && (this.phaseName === 'victory' || this.phaseName === 'entry')) {
                    // Only stop if we're no longer in a battle scene at all
                    const scene = SceneManager._scene;
                    if (!(scene instanceof Scene_Battle)) {
                        console.log(`🎬 ${this.phaseName} sequence stopped - no longer in battle scene`);
                        this.complete();
                        return;
                    }

                    // Continue looping - reset to beginning
                    this.currentCommandIndex = 0;
                    this.commands = [...this.originalCommands];
                    this.loopCount++;

                    console.log(`🔄 ${this.phaseName} sequence loop ${this.loopCount} starting for ${this.subject.name()}`);

                    setTimeout(() => this.executeNextCommand(), 500);
                    return;
                }

                if (!this.phaseCompleted) {
                    this.phaseCompleted = true;
                }
                this.complete();
                return;
            }

            const command = this.commands[this.currentCommandIndex];
            this.currentCommandIndex++;

            this.executeCommand(command, () => {
                // Use immediate execution for victory sequences to avoid long delays
                const delay = this.isLooping && this.phaseName === 'victory' ? 1 : $battleTiming.getSequenceDelay(this.phaseName, this.isLooping);
                setTimeout(() => this.executeNextCommand(), delay);
            });
        }

        executeCommand(command, callback) {
            const resolveTarget = (targetType) => {
                if (targetType === 'user' || targetType === 'subject') {
                    return this.subject;
                }
                return this.subject;
            };

            switch (command.type) {
                case 'direction':
                    $battleTiming.executeWithDelay(() => {
                        const directionTarget = resolveTarget(command.target);
                        const directionSprite = directionTarget._sprite;
                        if (directionSprite && directionSprite._charsetBattler) {
                            directionSprite._forcedDirection = command.direction;
                            directionSprite.updateFrame();
                        }
                    }, 'direction', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'rotate':
                    const rotateTarget = resolveTarget(command.target);
                    const rotateSprite = rotateTarget._sprite;
                    if (rotateSprite) {
                        this.executeRotation(rotateSprite, command, callback);
                    } else {
                        $battleTiming.executeWithDelay(() => {}, 'wait', {
                            customFrames: 1,
                            callback: callback
                        });
                    }
                    break;

                case 'frame':
                    $battleTiming.executeWithDelay(() => {
                        const frameTarget = resolveTarget(command.target);
                        const frameSprite = frameTarget._sprite;

                        if (frameSprite && frameSprite._charsetBattler) {
                            // Force specific frame for charset battlers
                            frameSprite._forcedRow = command.row;
                            frameSprite._forcedColumn = command.column;
                            frameSprite._pattern = command.column;

                            // Update the frame immediately
                            BattlerMotionHandler.updateFrame(frameSprite);
                        }
                    }, 'motion', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'motion':
                    $battleTiming.executeWithDelay(() => {
                        const motionTarget = resolveTarget(command.target);
                        const motionSprite = motionTarget._sprite;
                        if (motionSprite && motionSprite.startMotion) {
                            let motionType = command.motion;
                            if (motionType === 'reset') {
                                motionType = 'wait';
                            } else if (!isNaN(parseInt(motionType))) {
                                const motionIndex = parseInt(motionType);
                                const motionNames = ['walk', 'wait', 'chant', 'guard', 'damage', 'evade', 'thrust', 'swing', 'missile', 'skill', 'spell', 'item'];
                                motionType = motionNames[motionIndex] || 'wait';
                            }
                            motionSprite.startMotion(motionType);
                        }
                    }, 'motion', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'throw':
                    $battleTiming.executeWithDelay(() => {
                        this.executeThrowCommand(command, () => {});
                    }, 'wait', {
                        customFrames: 1,
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'shake':
                    $battleTiming.executeWithDelay(() => {
                        // Use RPG Maker MZ's built-in screen shake functionality
                        $gameScreen.startShake(command.power, command.speed, command.duration);
                        console.log(`📳 Screen shake started: Power=${command.power}, Speed=${command.speed}, Duration=${command.duration}`);
                    }, 'wait', {
                        customFrames: 1,
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'wait':
                    $battleTiming.executeWithDelay(() => {}, 'wait', {
                        customFrames: command.frames || 1,
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'wait_move':
                    const moveTarget = resolveTarget(command.target);
                    const moveSprite = moveTarget._sprite;
                    if (moveSprite && moveSprite.isMoving && moveSprite.isMoving()) {
                        this.waitForSpecificMovementComplete(moveSprite, callback);
                    } else {
                        $battleTiming.executeWithDelay(() => {}, 'wait', {
                            customFrames: 1,
                            callback: callback
                        });
                    }
                    break;

                case 'move':
                    this.executeMovement(command, callback);
                    break;

                case 'pose':
                    $battleTiming.executeWithDelay(() => {
                        const poseTarget = resolveTarget(command.target);
                        const poseSprite = poseTarget._sprite;

                        if (poseSprite) {
                            if (command.action === 'clear' || command.action === 'reset') {
                                // Reset to idle/wait motion and clear any forced directions/frames
                                poseSprite._forcedDirection = null;
                                poseSprite._forcedRow = undefined;
                                poseSprite._forcedColumn = undefined;

                                // Reset anchor points to original values
                                const spritesToReset = this.getSpritesForRotation(poseSprite);
                                spritesToReset.forEach(spriteData => {
                                    if (spriteData.originalAnchorX !== undefined && spriteData.originalAnchorY !== undefined) {
                                        spriteData.sprite.anchor.x = spriteData.originalAnchorX;
                                        spriteData.sprite.anchor.y = spriteData.originalAnchorY;
                                    }
                                    // Reset rotation as well
                                    spriteData.sprite.rotation = 0;
                                });

                                // Clear all pictures and icons
                                clearAllBattlerPictures(poseTarget);
                                clearAllBattlerIcons(poseTarget);

                                if (poseSprite.startMotion) {
                                    poseSprite.startMotion('wait');
                                }
                                // Update frame to reflect changes
                                if (poseSprite._charsetBattler) {
                                    BattlerMotionHandler.updateFrame(poseSprite);
                                }
                            }
                        }
                    }, 'motion', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'animation':
                    $battleTiming.executeWithDelay(() => {
                        this.executeAnimation(command, () => {});
                    }, 'animation', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'icon':
                    $battleTiming.executeWithDelay(() => {
                        const iconTarget = resolveTarget(command.target);
                        if (command.iconType === 'clear') {
                            removeBattlerIcon(iconTarget, command.frame);
                        } else {
                            const iconData = {
                                iconType: command.iconType,
                                index: command.frame,
                                x: command.x,
                                y: command.y,
                                opacity: command.opacity,
                                rotation: command.rotation || 0,
                                spin: command.spin || 0,
                                layer: command.layer
                            };
                            addBattlerIcon(iconTarget, iconData);
                        }
                    }, 'icon', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'picture':
                    $battleTiming.executeWithDelay(() => {
                        const pictureTarget = resolveTarget(command.target);

                        if (command.action === 'clear') {
                            if (command.id === 0) {
                                // Clear all pictures
                                clearAllBattlerPictures(pictureTarget);
                            } else {
                                // Clear specific picture
                                removeBattlerPicture(pictureTarget, command.id);
                            }
                        } else if (command.action === 'show') {
                            // Show new picture
                            const pictureData = {
                                id: command.id,
                                filename: command.filename || `Picture${command.id}`, // Default filename
                                x: command.x || 0,
                                y: command.y || 0,
                                opacity: command.opacity !== undefined ? command.opacity : 255,
                                blendMode: command.blendMode || 0,
                                scaleX: command.scaleX || 100,
                                scaleY: command.scaleY || 100,
                                layer: command.layer || 'normal'
                            };
                            addBattlerPicture(pictureTarget, pictureData);
                        } else if (command.action === 'move') {
                            // Move/modify existing picture
                            if (pictureTarget._actionPictures && pictureTarget._actionPictures.has(command.id)) {
                                const existingPicture = pictureTarget._actionPictures.get(command.id);
                                const newData = Object.assign({}, existingPicture.pictureData, {
                                    x: command.x !== undefined ? command.x : existingPicture.pictureData.x,
                                    y: command.y !== undefined ? command.y : existingPicture.pictureData.y,
                                    opacity: command.opacity !== undefined ? command.opacity : existingPicture.pictureData.opacity,
                                    scaleX: command.scaleX !== undefined ? command.scaleX : existingPicture.pictureData.scaleX,
                                    scaleY: command.scaleY !== undefined ? command.scaleY : existingPicture.pictureData.scaleY
                                });
                                existingPicture.updatePictureData(newData);
                            }
                        }
                    }, 'wait', {
                        customFrames: 1,
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'balloon':
                    $battleTiming.executeWithDelay(() => {
                        const targetType = command.target.toLowerCase();
                        let balloonTargets = [];

                        if (targetType === 'all targets') {
                            balloonTargets = this.targets || [];
                        } else if (targetType === 'user' || targetType === 'subject') {
                            balloonTargets = [this.subject];
                        } else if (targetType === 'target' && this.targets && this.targets.length > 0) {
                            balloonTargets = [this.targets[0]];
                        } else {
                            balloonTargets = [this.subject];
                        }

                        for (const balloonTarget of balloonTargets) {
                            if (balloonTarget && balloonTarget._sprite) {
// [silenced]                                 console.log(`🎈 Requesting balloon ${command.id} for ${balloonTarget.name()}`);
                                $gameTemp.requestBalloon(balloonTarget, command.id);
                            }
                        }
                        if (balloonTargets.length === 0) {
                            console.log(`⚠️ No valid targets found for balloon command`);
                        }
                    }, 'wait', {
                        customFrames: 1,
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                case 'opacity':
                    const opacityTarget = this.resolveTargetForOpacity(command.target);
                    const opacitySprite = opacityTarget?._sprite;
                    if (opacitySprite) {
                        this.executeOpacityChange(opacitySprite, command, callback);
                    } else {
                        $battleTiming.executeWithDelay(() => {}, 'opacity', {
                            customFrames: 3,
                            callback: callback
                        });
                    }
                    break;

                case 'jump':
                    const jumpTarget = resolveTarget(command.target);
                    const jumpSprite = jumpTarget._sprite;
                    if (jumpSprite) {
                        this.executeJump(jumpSprite, command, callback);
                    } else {
                        $battleTiming.executeWithDelay(() => {}, 'jump', {
                            customFrames: 1,
                            callback: callback
                        });
                    }
                    break;

                case 'action_effect':
                case 'execute':
                    this.executeActionWithMovementCheck(command, callback);
                    break;

                case 'se':
                    $battleTiming.executeWithDelay(() => {
                        AudioManager.playSe({
                            name: command.name,
                            volume: command.volume,
                            pitch: command.pitch,
                            pan: command.pan
                        });
                    }, 'se', {
                        sequenceType: this.phaseName,
                        isLooping: this.isLooping,
                        callback: callback
                    });
                    break;

                default:
                    $battleTiming.executeWithDelay(() => {}, 'wait', {
                        customFrames: 1,
                        callback: callback
                    });
                    break;
            }
        }

        executeRotation(sprite, command, callback) {
            const targetAngle = (command.angle * Math.PI / 180); // Convert to radians
            const frames = command.frames || 30;
            const duration = frames * 16.67; // Convert to milliseconds
            const anchor = (command.anchor || 'center').toLowerCase();

            const startTime = performance.now();
            const initialRotation = sprite.rotation || 0;
            const angleDifference = targetAngle - initialRotation;

            // Get all sprites to rotate (main sprite + associated icons)
            const spritesToRotate = this.getSpritesForRotation(sprite);

            // Determine anchor point values based on specified anchor
            let anchorX, anchorY;
            switch (anchor) {
                case 'top':
                    anchorX = 0.5;
                    anchorY = 0;
                    break;
                case 'bottom':
                    anchorX = 0.5;
                    anchorY = 1;
                    break;
                case 'center':
                case 'centre': // Support British spelling
                default:
                    anchorX = 0.5;
                    anchorY = 0.5;
                    break;
            }

            // Set anchor points for rotation
            spritesToRotate.forEach(spriteData => {
                const targetSprite = spriteData.sprite;

                // Store original anchor if not already stored
                if (spriteData.originalAnchorX === undefined) {
                    spriteData.originalAnchorX = targetSprite.anchor.x;
                    spriteData.originalAnchorY = targetSprite.anchor.y;
                }

                // Set anchor based on command
                targetSprite.anchor.x = anchorX;
                targetSprite.anchor.y = anchorY;
            });

            const updateRotation = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Apply rotation to all associated sprites
                spritesToRotate.forEach(spriteData => {
                    const newRotation = spriteData.initialRotation + (angleDifference * progress);
                    spriteData.sprite.rotation = newRotation;
                });

                if (progress >= 1) {
                    // Ensure final rotation is exact
                    spritesToRotate.forEach(spriteData => {
                        spriteData.sprite.rotation = targetAngle;

                        // Restore original anchor points after rotation completes
                        if (spriteData.originalAnchorX !== undefined && spriteData.originalAnchorY !== undefined) {
                            spriteData.sprite.anchor.x = spriteData.originalAnchorX;
                            spriteData.sprite.anchor.y = spriteData.originalAnchorY;
                        }
                    });
                    callback();
                } else {
                    requestAnimationFrame(updateRotation);
                }
            };

            requestAnimationFrame(updateRotation);
        }

        getSpritesForRotation(mainSprite) {
            const spritesToRotate = [];

            // Add the main sprite (or its _mainSprite for charset battlers)
            if (mainSprite._charsetBattler && mainSprite._mainSprite) {
                spritesToRotate.push({
                    sprite: mainSprite._mainSprite,
                    initialRotation: mainSprite._mainSprite.rotation || 0,
                    originalAnchorX: mainSprite._mainSprite.anchor.x,
                    originalAnchorY: mainSprite._mainSprite.anchor.y
                });
            } else {
                spritesToRotate.push({
                    sprite: mainSprite,
                    initialRotation: mainSprite.rotation || 0,
                    originalAnchorX: mainSprite.anchor.x,
                    originalAnchorY: mainSprite.anchor.y
                });
            }

            // Add associated icons if they exist
            const battler = this.findBattlerForSprite(mainSprite);

            // FIXED: Add proper defensive checks
            if (battler && battler._actionIcons && battler._actionIcons instanceof Map) {
                for (const [index, iconSprite] of battler._actionIcons) {
                    spritesToRotate.push({
                        sprite: iconSprite,
                        initialRotation: iconSprite.rotation || 0,
                        originalAnchorX: iconSprite.anchor.x,
                        originalAnchorY: iconSprite.anchor.y
                    });
                }
            }

            return spritesToRotate;
        }

        executeActionWithMovementCheck(command, callback) {
            const allSprites = this.getAllRelevantSprites();
            const movingSprites = allSprites.filter(sprite => {
                if (!sprite || !sprite.isMoving) return false;

                const hasMovementDuration = sprite._movementDuration && sprite._movementDuration > 0;
                const reportedAsMoving = sprite.isMoving();
                const hasTargetOffset = sprite._targetOffsetX !== undefined &&
                (Math.abs(sprite.x - (sprite._homeX + sprite._targetOffsetX)) > 0.1 ||
                Math.abs(sprite.y - (sprite._homeY + sprite._targetOffsetY)) > 0.1);

                return hasMovementDuration || reportedAsMoving || hasTargetOffset;
            });

            if (movingSprites.length > 0) {
                this.waitForAllMovementsComplete(movingSprites, () => {
                    this.executeActionCommand(command, callback);
                });
            } else {
                this.executeActionCommand(command, callback);
            }
        }

        getAllRelevantSprites() {
            const sprites = [];

            if (this.subject && this.subject._sprite) {
                sprites.push(this.subject._sprite);
            }

            if (this.targets) {
                for (const target of this.targets) {
                    if (target && target._sprite) {
                        sprites.push(target._sprite);
                    }
                }
            }

            return sprites;
        }

        findBattlerForSprite(sprite) {
            if (this.subject && this.subject._sprite === sprite) {
                return this.subject;
            }

            if (this.targets) {
                for (const target of this.targets) {
                    if (target && target._sprite === sprite) {
                        return target;
                    }
                }
            }

            return null;
        }

        waitForAllMovementsComplete(sprites, callback) {
            $battleTiming.waitForMovementComplete(sprites, callback);
        }

        ensureAllMovementsStopped(sprites) {
            $battleTiming.ensureMovementsStopped(sprites);
        }

        executeActionCommand(command, callback) {
            if (command.type === 'action_effect' || command.type === 'execute') {
                this.executeAction(callback);
            } else {
                // Handle other action command types if needed
                setTimeout(callback, 16);
            }
        }

        executeMovement(command, callback) {
            const moveTarget = command.target ?
            (command.target === 'user' || command.target === 'subject' ? this.subject : this.subject) :
            this.subject;
            const moveSprite = moveTarget._sprite;

            if (!moveSprite) {
                setTimeout(callback, 16);
                return;
            }

            const duration = command.frames || 40;
            this.pendingMovements.add(moveSprite);

            switch (command.destination || command.target) {
                case 'target':
                    if (this.targets && this.targets.length > 0) {
                        const target = this.targets[0];
                        const targetSprite = target._sprite;
                        if (targetSprite) {
                            const xOffset = command.xOffset !== undefined ? command.xOffset : 0;
                            const yOffset = command.yOffset !== undefined ? command.yOffset : 0;

                            const targetX = targetSprite.x + xOffset;
                            const targetY = targetSprite.y + yOffset;

                            const targetOffsetX = targetX - moveSprite._homeX;
                            const targetOffsetY = targetY - moveSprite._homeY;

                            moveSprite.startMove(targetOffsetX, targetOffsetY, duration);

                            this.waitForSpecificMovementComplete(moveSprite, () => {
                                this.pendingMovements.delete(moveSprite);
                                callback();
                            });
                        } else {
                            this.pendingMovements.delete(moveSprite);
                            setTimeout(callback, 16);
                        }
                    } else {
                        this.pendingMovements.delete(moveSprite);
                        setTimeout(callback, 16);
                    }
                    break;

                case 'home':
                    moveSprite.startMove(0, 0, duration);
                    this.waitForSpecificMovementComplete(moveSprite, () => {
                        this.pendingMovements.delete(moveSprite);
                        callback();
                    });
                    break;

                case 'forward':
                    const forwardDistance = command.distance || 48;
                    const isEnemyMovingForward = moveTarget.isEnemy && moveTarget.isEnemy();

                    if (battleOrientation === 'Vertical') {
                        // In vertical mode: forward = up for actors, down for enemies
                        if (isEnemyMovingForward) {
                            moveSprite.startMove(0, forwardDistance, duration); // Enemy moves down (towards actors)
                        } else {
                            moveSprite.startMove(0, -forwardDistance, duration); // Actor moves up (towards enemies)
                        }
                    } else {
                        // In horizontal mode: forward = right for actors, left for enemies
                        if (isEnemyMovingForward) {
                            moveSprite.startMove(-forwardDistance, 0, duration); // Enemy moves left (towards actors)
                        } else {
                            moveSprite.startMove(forwardDistance, 0, duration); // Actor moves right (towards enemies)
                        }
                    }
                    this.waitForSpecificMovementComplete(moveSprite, () => {
                        this.pendingMovements.delete(moveSprite);
                        callback();
                    });
                    break;

                case 'backward':
                    const backwardDistance = command.distance || 48;
                    const isEnemyMovingBackward = moveTarget.isEnemy && moveTarget.isEnemy();

                    if (battleOrientation === 'Vertical') {
                        // In vertical mode: backward = down for actors, up for enemies
                        if (isEnemyMovingBackward) {
                            moveSprite.startMove(0, -backwardDistance, duration); // Enemy moves up (away from actors)
                        } else {
                            moveSprite.startMove(0, backwardDistance, duration); // Actor moves down (away from enemies)
                        }
                    } else {
                        // In horizontal mode: backward = left for actors, right for enemies
                        if (isEnemyMovingBackward) {
                            moveSprite.startMove(backwardDistance, 0, duration); // Enemy moves right (away from actors)
                        } else {
                            moveSprite.startMove(-backwardDistance, 0, duration); // Actor moves left (away from enemies)
                        }
                    }
                    this.waitForSpecificMovementComplete(moveSprite, () => {
                        this.pendingMovements.delete(moveSprite);
                        callback();
                    });
                    break;

                case 'step_forward':
                    if (moveSprite.stepForward) {
                        moveSprite.stepForward();
                    }
                    setTimeout(callback, 500);
                    break;

                case 'step_back':
                    if (moveSprite.stepBack) {
                        moveSprite.stepBack();
                    }
                    setTimeout(callback, 500);
                    break;

                default:
                    this.pendingMovements.delete(moveSprite);
                    setTimeout(callback, 100);
                    break;
            }
        }

        waitForSpecificMovementComplete(sprite, callback) {
            $battleTiming.waitForMovementComplete([sprite], callback);
        }

        ensureMovementStopped(sprite) {
            $battleTiming.ensureMovementsStopped([sprite]);
        }

        executeAnimation(command, callback) {
            const animTarget = command.target ?
            (command.target === 'user' || command.target === 'subject' ? this.subject :
            this.targets && this.targets.length > 0 ? this.targets[0] : this.subject) :
            (this.targets && this.targets.length > 0 ? this.targets[0] : this.subject);

            let animationId = 0;

            if (command.source === 'weapon' || command.source === 'action') {
                if (command.source === 'action') {
                    animationId = getActionAnimationId(this.action, this.subject);
                } else if (command.source === 'weapon' && this.subject.isActor()) {
                    const weapon = this.subject.weapons()[0];
                    if (weapon && weapon.animationId > 0) {
                        animationId = weapon.animationId;
                    }
                }

                if (animationId > 0) {
                    UnifiedAnimationHandler.playActionAnimation(this.action, this.subject, [animTarget], {
                        preventDuplicates: false,
                        allowOverride: true,
                        context: 'custom_animation_command',
                        phase: this.phaseName
                    });
                }
            } else if (command.id) {
                animationId = command.id;

                if (canPlayAnimation(animTarget, animationId, { allowOverride: true })) {
                    // Use FOSSIL's method if available, otherwise use vanilla MZ method
                    if (animTarget.startAnimation && typeof animTarget.startAnimation === 'function') {
                        animTarget.startAnimation(animationId, false, 0);
                    } else {
                        $gameTemp.requestAnimation([animTarget], animationId, false);
                    }
                }
            }

            setTimeout(callback, 100);
        }

        executeAction(callback) {
            try {
                console.log(`🎯 ${this.phaseName}: Invoking action.`);
                const subject = this.action.subject();

                // Show the skill animation on the targets
                UnifiedAnimationHandler.playActionAnimation(this.action, subject, this.targets, { allowOverride: true });

                // A short delay to let the animation start before applying effects
                setTimeout(() => {
                    ActionExecutor.invoke(this.action, this.targets);

                    // Continue immediately after effects are applied, don't wait for animations
                    setTimeout(callback, 200);
                }, 100);

            } catch (e) {
                console.error(`Error in ${this.phaseName} executeAction:`, e);
                setTimeout(callback, 30);
            }
        }

        playUnifiedActionAnimation(subject) {
            const animationId = getActionAnimationId(this.action, subject);

            if (animationId > 0 && this.targets && this.targets.length > 0) {
                $gameTemp.requestAnimation(this.targets, animationId, false);
                return true;
            }

            return false;
        }

        applyDamage(callback) {
            for (const target of this.targets) {
                if (target && target.isAlive()) {
                    this.action.apply(target);
                }
            }

            setTimeout(callback, 200);
        }

        showDamage(callback) {
            for (const target of this.targets) {
                if (target) {
                    target.startDamagePopup();
                    target.performActionEnd();
                }
            }

            setTimeout(callback, 800);
        }

        executeJump(sprite, command, callback) {
            if (command.destination) {
                this.executeJumpMovement(sprite, command, callback);
            } else {
                this.executeLegacyJump(sprite, command, callback);
            }
        }

        executeJumpMovement(sprite, command, callback) {
            const frames = command.frames || 30;
            const arcHeight = command.arcHeight || 60;

            if (command.destination === 'target' && this.targets && this.targets.length > 0) {
                const target = this.targets[0];
                const targetSprite = target._sprite;

                if (targetSprite) {
                    const xOffset = command.xOffset || 0;
                    const yOffset = command.yOffset || 0;

                    const targetX = targetSprite.x + xOffset;
                    const targetY = targetSprite.y + yOffset;

                    const targetOffsetX = targetX - sprite._homeX;
                    const targetOffsetY = targetY - sprite._homeY;

                    sprite.startMove(targetOffsetX, targetOffsetY, frames);
                    this.addJumpArcToMovement(sprite, arcHeight, frames, callback);
                } else {
                    setTimeout(callback, 100);
                }
            } else if (command.destination === 'home') {
                // Move to home position (offset 0, 0)
// [silenced]                 console.log(`🏠 Move to home: sprite at (${sprite.x}, ${sprite.y}), home at (${sprite._homeX}, ${sprite._homeY})`);
                sprite.startMove(0, 0, frames);
                this.addJumpArcToMovement(sprite, arcHeight, frames, callback);
            } else {
                setTimeout(callback, 100);
            }
        }

        executeLegacyJump(sprite, command, callback) {
            const height = command.height || 60;
            const frames = command.frames || 30;

            this.addJumpArcToMovement(sprite, height, frames, callback);
        }

        addJumpArcToMovement(sprite, arcHeight, frames, callback) {
            const duration = frames * 16.67;
            const startTime = performance.now();
            const baseY = sprite.y;

            sprite._jumpBaseY = baseY;
            sprite._jumpArcHeight = arcHeight;
            sprite._jumpStartTime = startTime;
            sprite._jumpDuration = duration;
            sprite._jumpActive = true;

            const updateJumpArc = () => {
                if (!sprite._jumpActive) {
                    callback();
                    return;
                }

                const elapsed = performance.now() - sprite._jumpStartTime;
                const progress = Math.min(elapsed / sprite._jumpDuration, 1);

                if (progress >= 1) {
                    sprite._jumpActive = false;
                    sprite._jumpBaseY = undefined;
                    sprite._jumpArcHeight = undefined;
                    sprite._jumpStartTime = undefined;
                    sprite._jumpDuration = undefined;
                    callback();
                } else {
                    requestAnimationFrame(updateJumpArc);
                }
            };

            requestAnimationFrame(updateJumpArc);
        }

        resolveTargetForOpacity(targetType) {
            let target;
            if (targetType === 'user' || targetType === 'subject') {
                target = this.subject;
            } else if (targetType === 'target' && this.targets && this.targets.length > 0) {
                target = this.targets[0];
            } else {
                target = this.subject;
            }

            return target;
        }

        executeOpacityChange(sprite, command, callback) {
            const targetOpacity = command.value !== undefined ? command.value : 255;
            const frames = Math.max(command.frames || 1, 1);
            const duration = frames * 16.67;

            const spriteInfo = this.analyzeSpriteStructure(sprite);
            const spritesToModify = this.getSpritesForOpacityChange(sprite);

            if (spritesToModify.length === 0) {
                setTimeout(callback, 50);
                return;
            }

            const initialStates = spritesToModify.map(spriteData => ({
                sprite: spriteData.sprite,
                name: spriteData.name,
                initialOpacity: spriteData.sprite.opacity,
                initialVisible: spriteData.sprite.visible
            }));

            const startTime = performance.now();

            const updateOpacity = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);

                initialStates.forEach(state => {
                    const newOpacity = state.initialOpacity + (targetOpacity - state.initialOpacity) * progress;
                    state.sprite.opacity = newOpacity;

                    if (targetOpacity > 0) {
                        state.sprite.visible = true;
                    }
                });

                if (progress >= 1) {
                    initialStates.forEach(state => {
                        state.sprite.opacity = targetOpacity;
                        if (targetOpacity === 0) {
                            state.sprite.visible = false;
                        } else {
                            state.sprite.visible = true;
                        }
                    });

                    callback();
                } else {
                    requestAnimationFrame(updateOpacity);
                }
            };

            requestAnimationFrame(updateOpacity);
        }

        analyzeSpriteStructure(sprite) {
            const info = {
                type: sprite?.constructor.name,
                hasMainSprite: !!sprite?._mainSprite,
                isCharset: !!sprite?._charsetBattler,
                isSV: !!sprite?._svBattler,
                opacity: sprite?.opacity,
                visible: sprite?.visible,
                mainSpriteOpacity: sprite?._mainSprite?.opacity,
                mainSpriteVisible: sprite?._mainSprite?.visible
            };

            return info;
        }

        getSpritesForOpacityChange(sprite) {
            const spritesToModify = [];

            if (!sprite) {
                return spritesToModify;
            }

            if (sprite._charsetBattler && sprite._mainSprite) {
                spritesToModify.push({
                    sprite: sprite._mainSprite,
                    name: 'mainSprite'
                });
                spritesToModify.push({
                    sprite: sprite,
                    name: 'wrapperSprite'
                });
            } else if (sprite._svBattler) {
                spritesToModify.push({
                    sprite: sprite,
                    name: 'svSprite'
                });
            } else {
                spritesToModify.push({
                    sprite: sprite,
                    name: 'directSprite'
                });
            }

            return spritesToModify;
        }

        executeThrowCommand(command, callback) {
            let projectileMap = null;

            const item = this.action.item();
            projectileMap = parseThrowObjectData(item);

            if ((!projectileMap || projectileMap.size === 0) && this.action.isAttack() && this.subject.isActor()) {
                const weapons = this.subject.weapons();
                if (weapons.length > 0) {
                    const weapon = weapons[0];
                    projectileMap = parseThrowObjectData(weapon);
                }
            }

            if (!projectileMap || !projectileMap.has(command.projectile)) {
                console.log(`⚠️ Projectile '${command.projectile}' not found`);
                return;
            }

            const throwData = projectileMap.get(command.projectile);
            const targets = this.resolveThrowTargets(command.target);

            if (targets.length === 0) {
                console.log(`⚠️ No valid targets for throw command`);
                return;
            }

            // Safely pass targetMode, defaulting to 'default' if undefined
            const targetMode = command.targetMode || 'default';
            const throwStep = new ThrowProjectileStep(this.subject, this.action, targets, throwData, targetMode);
            throwStep.perform();

// [silenced]             console.log(`🎯 Fired projectile '${command.projectile}' at ${targets.length} targets using '${targetMode}' mode`);
        }

        resolveThrowTargets(targetType) {
            switch (targetType.toLowerCase()) {
                case 'all targets':
                case 'area targets':
                    return this.targets || [];
                case 'user':
                case 'subject':
                    return [this.subject];
                case 'target':
                    return this.targets && this.targets.length > 0 ? [this.targets[0]] : [];
                default:
                    return this.targets || [];
            }
        }

    }

    // Throw Projectile Action Step
    // Replace the ThrowProjectileStep class constructor and calculateTargetPositions method
    class ThrowProjectileStep extends ActionStep {
        constructor(subject, action, targets, throwData, targetMode = 'default') {
            super();
            this.subject = subject;
            this.action = action;
            this.targets = targets;
            this.throwData = throwData;
            this.targetMode = targetMode; // Now safely defaults to 'default'
            this.projectilesLaunched = false;
        }

        perform() {
            if (this.projectilesLaunched) {
                this.complete();
                return;
            }

            this.projectilesLaunched = true;

            const subjectSprite = this.subject._sprite;
            if (!subjectSprite) {
// [silenced]                 console.log("No subject sprite for projectile");
                this.complete();
                return;
            }

            // Play sound effect if specified
            if (this.throwData.se) {
                AudioManager.playSe({
                    name: this.throwData.se.name,
                    volume: this.throwData.se.volume,
                    pitch: this.throwData.se.pitch,
                    pan: this.throwData.se.pan
                });
            }

            // Calculate target positions and launch projectiles
            const targetPositions = this.calculateTargetPositions();
            this.launchProjectiles(subjectSprite, targetPositions);

            // Complete after projectile duration
            setTimeout(() => {
                this.complete();
            }, this.throwData.duration * 16.67); // Convert frames to ms
        }

        calculateTargetPositions() {
            const positions = [];

            if (this.targets.length === 0) {
                return positions;
            }

            if (this.targets.length === 1) {
                // Single target - always throw directly to it
                const targetSprite = this.targets[0]._sprite;
                if (targetSprite) {
                    positions.push({ x: targetSprite.x, y: targetSprite.y });
                }
            } else {
                // Multiple targets - behavior depends on target mode
                if (this.targetMode === 'individual') {
                    // Throw separate projectiles to each target ("all targets")
                    console.log(`🎯 Individual targeting mode: throwing to ${this.targets.length} separate targets`);
                    for (const target of this.targets) {
                        const targetSprite = target._sprite;
                        if (targetSprite) {
                            positions.push({ x: targetSprite.x, y: targetSprite.y });
                        }
                    }
                } else if (this.targetMode === 'area') {
                    // Throw to average position of all targets ("area targets")
                    console.log(`🎯 Area targeting mode: calculating center point of ${this.targets.length} targets`);
                    let avgX = 0, avgY = 0, validTargets = 0;

                    for (const target of this.targets) {
                        const targetSprite = target._sprite;
                        if (targetSprite) {
                            avgX += targetSprite.x;
                            avgY += targetSprite.y;
                            validTargets++;
                        }
                    }

                    if (validTargets > 0) {
                        positions.push({
                            x: avgX / validTargets,
                            y: avgY / validTargets
                        });
                    }
                } else {
                    // Default mode - use original behavior based on action scope
                    console.log(`🎯 Default targeting mode: using scope-based behavior`);
                    const item = this.action.item();
                    const scope = item.scope;

                    if (scope === 2 || scope === 8 || scope === 10) { // All enemies, all allies, all allies (dead)
                        // Calculate average position for group-targeting skills
                        let avgX = 0, avgY = 0, validTargets = 0;

                        for (const target of this.targets) {
                            const targetSprite = target._sprite;
                            if (targetSprite) {
                                avgX += targetSprite.x;
                                avgY += targetSprite.y;
                                validTargets++;
                            }
                        }

                        if (validTargets > 0) {
                            positions.push({
                                x: avgX / validTargets,
                                y: avgY / validTargets
                            });
                        }
                    } else {
                        // Individual targeting for other scopes
                        for (const target of this.targets) {
                            const targetSprite = target._sprite;
                            if (targetSprite) {
                                positions.push({ x: targetSprite.x, y: targetSprite.y });
                            }
                        }
                    }
                }
            }

            return positions;
        }

        launchProjectiles(subjectSprite, targetPositions) {
            const battleField = SceneManager._scene._spriteset._battleField;
            if (!battleField) {
                console.log("No battlefield found for projectiles");
                return;
            }

            for (const targetPos of targetPositions) {
                const projectile = new Sprite_Projectile(
                    this.throwData,
                    subjectSprite.x,
                    subjectSprite.y,
                    targetPos.x,
                    targetPos.y
                );

                // Add projectile to battlefield with high z-index
                projectile.z = 999;
                battleField.addChild(projectile);

// [silenced]                 console.log(`🎯 Launched projectile from (${subjectSprite.x}, ${subjectSprite.y}) to (${targetPos.x}, ${targetPos.y})`);
            }
        }
    }

    // ===== EVENT-DRIVEN BATTLE MANAGER INTEGRATION =====

    // Global flag to prevent re-entry
    let actionSequenceInProgress = false;

    // SINGLE-FIRE Battle Manager Integration
    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        const subject = this._subject;
        if (!subject) {
            return;
        }
        const action = subject.currentAction();
        if (action) {
            // Trigger "inputed" sequence when actor finishes command input and is about to act
            // Execute this synchronously by directly applying the commands
            if (subject.isActor()) {
                const inputedSequence = this.getCustomSequence(subject, 'inputed');
                if (inputedSequence && inputedSequence.length > 0) {
// [silenced]                     console.log(`✅ Executing inputed sequence for ${subject.name()}`);
                    const sprite = subject._sprite;

                    // Clear inputing flag
                    if (sprite) sprite._isInputing = false;

                    // Execute inputed commands directly (picture clear, move home, direction)
                    inputedSequence.forEach(cmd => {
                        if (cmd.type === 'picture' && cmd.action === 'clear') {
                            clearAllBattlerPictures(subject);
                        } else if (cmd.type === 'move' && cmd.location === 'home') {
                            if (sprite && sprite._homeX !== undefined && sprite._homeY !== undefined) {
                                sprite.x = sprite._homeX;
                                sprite.y = sprite._homeY;
                                sprite._offsetX = 0;
                                sprite._offsetY = 0;
                            }
                        } else if (cmd.type === 'direction' && sprite && sprite._charsetBattler) {
                            sprite._forcedDirection = cmd.direction;
                            if (sprite.updateFrame) sprite.updateFrame();
                        } else if (cmd.type === 'motion' && sprite && sprite.startMotion) {
                            sprite.startMotion(cmd.motionType || 'wait');
                        }
                    });
                }
            }

            if (this.shouldUseActionSequence(action)) {
                // This is now the ONLY path for custom sequences for both actors and enemies.
                this.startCustomActionSequence(action);
            } else {
                // Fallback to default engine behavior if no custom sequence tags are found.
                _BattleManager_startAction.call(this);
            }
        }
    };

    // Prevent normal action processing while sequence is playing
    const _BattleManager_updateAction = BattleManager.updateAction;
    BattleManager.updateAction = function() {
        if (actionSequenceInProgress) {
            // Don't process any other battle actions while sequence is playing
            return;
        }
        _BattleManager_updateAction.call(this);
    };

    // TARGETED blocking - only block during actual action phase
    const _BattleManager_processTurn = BattleManager.processTurn;
    BattleManager.processTurn = function() {
        if (actionSequenceInProgress && this._phase === 'action') {
            return; // Block turn processing only during action phase
        }
        _BattleManager_processTurn.call(this);
    };

    // Only block command selection during action sequences, not during setup
    const _BattleManager_selectNextCommand = BattleManager.selectNextCommand;
    BattleManager.selectNextCommand = function() {
        if (actionSequenceInProgress && this._phase === 'action') {
            return false; // Block command selection only during action phase
        }
        return _BattleManager_selectNextCommand.call(this);
    };

    // Prevent any default action processing from interfering
    const _BattleManager_invokeAction = BattleManager.invokeAction;
    BattleManager.invokeAction = function(subject, target) {
        // Only call default invokeAction if we're not running a custom sequence
        if (!actionSequenceInProgress) {
            _BattleManager_invokeAction.call(this, subject, target);
        } else {
        }
    };

    // BLOCK default weapon animations during custom sequences
    const _Sprite_Actor_setupWeaponAnimation_original = Sprite_Actor.prototype.setupWeaponAnimation;
    Sprite_Actor.prototype.setupWeaponAnimation = function() {
        if (actionSequenceInProgress) {
            return;
        }
        if (this._svBattler) {
            _Sprite_Actor_setupWeaponAnimation_original.call(this);
        }
    };

    const _Spriteset_Battle_createLowerLayer = Spriteset_Battle.prototype.createLowerLayer;
    Spriteset_Battle.prototype.createLowerLayer = function() {
        _Spriteset_Battle_createLowerLayer.call(this);

        if (this._battleField) {
            this._battleField.sortableChildren = true;

            // FIXED: Ensure battlefield sorts children immediately when z-index changes
            const originalAddChild = this._battleField.addChild;
            this._battleField.addChild = function(child) {
                const result = originalAddChild.call(this, child);
                if (this.sortableChildren && child.zIndex !== undefined) {
                    this.sortDirty = true;
                }
                return result;
            };
        }
    };

    // ===== ENEMY STATE DISPLAY - UPDATE POSITIONS =====

    // Override updateStateSprite to apply position offsets and update overlay
    const _Sprite_Enemy_updateStateSprite = Sprite_Enemy.prototype.updateStateSprite;
    Sprite_Enemy.prototype.updateStateSprite = function() {
        // Update state icon position with offset
        if (this._stateIconSprite) {
            _Sprite_Enemy_updateStateSprite.call(this);
            this._stateIconSprite.x += enemyStateIconOffsetX;
            this._stateIconSprite.y += enemyStateIconOffsetY;
        }

        // Update state overlay position with offset (similar to actors)
        if (this._stateSprite) {
            this._stateSprite.x = enemyStateAnimOffsetX;
            this._stateSprite.y = enemyStateAnimOffsetY;
        }
    };

    const _Spriteset_Battle_createEnemies = Spriteset_Battle.prototype.createEnemies;
    Spriteset_Battle.prototype.createEnemies = function() {
        _Spriteset_Battle_createEnemies.call(this);

        this._enemySprites.forEach((sprite, index) => {
            // Initialize with unified Z-index system
            ZIndexManager.updateSpriteZIndex(sprite, 'enemy', 'normal');

            // Enemies start at their home positions immediately (no entry animation)
            if (sprite._enemy) {
                const homeX = sprite._enemy.screenX();
                const homeY = sprite._enemy.screenY();
                sprite._homeX = homeX;
                sprite._homeY = homeY;
                sprite.x = homeX;
                sprite.y = homeY;

// [silenced]                 console.log(`🏠 Enemy ${sprite._enemy.name()} initialized at home: (${homeX}, ${homeY})`);
            }
        });
    };

    const _Spriteset_Battle_createActors = Spriteset_Battle.prototype.createActors;
    Spriteset_Battle.prototype.createActors = function() {
        _Spriteset_Battle_createActors.call(this);

        this._actorSprites.forEach(sprite => {
            // Initialize with unified Z-index system
            ZIndexManager.updateSpriteZIndex(sprite, 'actor', 'normal');

            // Mark that this sprite needs entry positioning (will be done in setActorHome)
            sprite._needsEntryPositioning = true;

            // Block default RPG Maker positioning during entry
            sprite._blockDefaultPositioning = true;
        });
    };

    // Override the animation request to add our tracking
    // Only override if the method exists (e.g., when FOSSIL.js is enabled)
    const _Game_Battler_startAnimation = Game_Battler.prototype.startAnimation;
    if (_Game_Battler_startAnimation) {
        Game_Battler.prototype.startAnimation = function(animationId, mirror, delay) {
            if (animationId === undefined || animationId === null || animationId < 0) {
                return;
            }

            _Game_Battler_startAnimation.call(this, animationId, mirror, delay);
        };
    }

    const _Game_Battler_refresh = Game_Battler.prototype.refresh;
    Game_Battler.prototype.refresh = function() {
        _Game_Battler_refresh.call(this);
        // Don't trigger sprite reinitialization during action sequences
        if ($actionSequenceManager && $actionSequenceManager.isSequencePlaying()) {
            return;
        }
    };

    BattleManager.getCustomCollapseSequence = function(battler) {
        // Create a mock action for collapse sequence detection
        const mockAction = {
            item: () => battler.isActor() ? $dataActors[battler.actorId()] : battler.enemy(),
                                         subject: () => battler,
                                         isAttack: () => false,
                                         targetsForOpponents: () => [],
                                         makeTargets: () => [battler]
        };

        return getActionSequence(mockAction, battler, 'collapse');
    };

    // Enhanced battler death to trigger collapse sequences
    const _Game_Battler_performCollapse = Game_Battler.prototype.performCollapse;
    Game_Battler.prototype.performCollapse = function() {
        // Only handle default collapse behavior here
        // Custom collapse sequences are handled by Game_Enemy_refresh
        _Game_Battler_performCollapse.call(this);
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
// [silenced]         console.log("🎬 BattleManager.endAction - Phase:", this._phase);
        return _BattleManager_endAction.call(this);
    };

    // Ensure animation sprites always render on top
    const _Spriteset_Base_createAnimationSprite = Spriteset_Base.prototype.createAnimationSprite;
    Spriteset_Base.prototype.createAnimationSprite = function(targets, animation, mirror, delay) {
        _Spriteset_Base_createAnimationSprite.call(this, targets, animation, mirror, delay);

        // Set very high z-index for the animation sprite that was just created
        const animSprite = this._animationSprites[this._animationSprites.length - 1];
        if (animSprite) {
            // Use the animation type offset (50000) plus a high base to ensure it's always on top
            animSprite.zIndex = 100000;
            if (animSprite.parent && animSprite.parent.sortableChildren) {
                animSprite.parent.sortDirty = true;
            }
        }
    };

    // Also ensure the damage container is properly sorted
    const _Spriteset_Battle_update = Spriteset_Battle.prototype.update;
    Spriteset_Battle.prototype.update = function() {
        _Spriteset_Battle_update.call(this);
        // Periodically verify container order
        if (this._battleField && this._battleField.children) {
            if (!this._sortCheckCounter) this._sortCheckCounter = 0;
            this._sortCheckCounter++;

            // Check every 60 frames (1 second at 60fps)
            if (this._sortCheckCounter >= 60) {
                this._sortCheckCounter = 0;

                // Quick verification if container is properly ordered
                let needsSort = false;
                const children = this._battleField.children;

                for (let i = 1; i < children.length; i++) {
                    const prevZ = children[i-1].z || children[i-1]._defaultZ || 0;
                    const currZ = children[i].z || children[i]._defaultZ || 0;

                    if (prevZ > currZ) {
                        needsSort = true;
// [silenced]                         console.log(`🔍 Container order issue detected: ${children[i-1].constructor.name} (z=${prevZ}) before ${children[i].constructor.name} (z=${currZ})`);
                        break;
                    }
                }
            }
        }
    };


    BattleManager.shouldUseActionSequence = function(action) {
        // Check for custom action sequences first
        const subject = action.subject();
        const sequenceTypes = ['prepare', 'movement', 'execute', 'effect', 'return', 'finish'];

        for (const seqType of sequenceTypes) {
            const customSequence = getActionSequence(action, subject, seqType);
            if (customSequence && customSequence.length > 0) {
// [silenced]                 console.log(`🎯 Found custom ${seqType} sequence for ${action.item().name}`);
                return true;
            }
        }

        // Check for projectile note tags - FIXED to check weapons too
        let throwDataList = null;

        // First check the action item itself
        const item = action.item();
        throwDataList = parseThrowObjectData(item);

        // For weapon attacks, also check the weapon for projectile data
        if ((!throwDataList || throwDataList.length === 0) && action.isAttack() && subject.isActor()) {
            const weapons = subject.weapons();
            if (weapons.length > 0) {
                const weapon = weapons[0];
                throwDataList = parseThrowObjectData(weapon);
                if (throwDataList && throwDataList.length > 0) {
                    console.log(`🎯 Found ${throwDataList.length} weapon projectile(s) in ${weapon.name}`);
                }
            }
        }

        if (throwDataList && throwDataList.length > 0) {
            console.log(`🎯 Found ${throwDataList.length} projectile(s) in ${item.name}`);
            return true; // Use custom sequence for any action with projectiles
        }

        // Use sequences for attacks on opponents
        return action.isAttack() &&
        action.targetsForOpponents().length > 0;
    };

    BattleManager.hasCustomActionSequences = function(action, subject) {
        // Check standard sequence types first
        const standardTypes = ['prepare', 'movement', 'execute', 'effect', 'return', 'finish'];

        for (const seqType of standardTypes) {
            const customSequence = getActionSequence(action, subject, seqType);
            if (customSequence && customSequence.length > 0) {
                return true;
            }
        }

        // Also check for extended sequence types that might be relevant to the current battle state
        const extendedTypes = ['entry', 'inputing', 'inputed', 'damage', 'collapse', 'victory'];

        for (const seqType of extendedTypes) {
            const customSequence = getActionSequence(action, subject, seqType);
            if (customSequence && customSequence.length > 0) {
                return true;
            }
        }

        return false;
    };

    BattleManager.startCustomActionSequence = function(action) {
        if ($actionSequenceManager.isSequencePlaying()) {
            return;
        }
        const subject = action.subject();
        // ... many lines of setup ...
        $actionSequenceManager.startSequence(sequence);
    };

    // WITH this final, clean version
    BattleManager.startCustomActionSequence = function(action) {
        const subject = action.subject();
        const targets = action.makeTargets();

        // Block if a sequence is already playing to prevent overlaps.
        if ($actionSequenceManager.isSequencePlaying()) {
            return;
        }

        // Set the global flag to pause the BattleManager's turn flow.
        actionSequenceInProgress = true;
        this._phase = "action";

        // Build the full sequence of steps from the notetags.
        const sequence = this.buildCustomActionSequence(action, subject, targets);

        // Start the sequence manager.
        $actionSequenceManager.startSequence(sequence);
    };

    // MODIFY EXISTING: Replace buildCustomActionSequence method in BattleManager
    BattleManager.buildCustomActionSequence = function(action, subject, targets) {
        const sequence = [];
        const sequenceTypes = ['prepare', 'movement', 'execute', 'effect', 'return', 'finish'];
        const item = action.item();

        const itemName = item ? item.name : (subject.isActor() && subject.weapons()[0] ? subject.weapons()[0].name : 'Unknown');
// [silenced]         console.log(`🎬 Building optimized custom sequence for ${itemName} with ${sequenceTypes.length} phases`);

        for (let phaseIndex = 0; phaseIndex < sequenceTypes.length; phaseIndex++) {
            const seqType = sequenceTypes[phaseIndex];

            // Check for custom sequence commands for this phase
            const customCommands = getActionSequence(action, subject, seqType);

            if (customCommands && customCommands.length > 0) {
                const customStep = new CustomSequenceStep(customCommands, subject, action, targets, seqType);
                sequence.push(customStep);
            } else {
                const defaultSteps = this.getDefaultSequenceForPhase(seqType, action, subject, targets);
                sequence.push(...defaultSteps);
            }

            // OPTIMIZED: Only add minimal delays where absolutely necessary
            if (seqType === 'movement' && phaseIndex < sequenceTypes.length - 1) {
                const nextPhase = sequenceTypes[phaseIndex + 1];
                if (nextPhase === 'execute') {
                    sequence.push(new WaitStep(2));
                }
            }
        }

        return sequence;
    };

    BattleManager.getDefaultSequenceForPhase = function(phase, action, subject, targets) {
        const sequence = [];

        switch (phase) {
            case 'prepare':
                sequence.push(new WaitStep(1));
                break;

            case 'movement':
                if (action.isAttack() && targets.length > 0) {
                    sequence.push(new SetMotionStep(subject, 'walk'));
                    sequence.push(new MoveToTargetStep(subject, targets[0], $battleTiming.config.movement.stepFrames));
                }
                break;

            case 'execute':
                if (action.isAttack()) {
                    sequence.push(new SetMotionStep(subject, 'swing'));
                } else {
                    sequence.push(new SetMotionStep(subject, 'skill'));
                }
                sequence.push(new WaitStep(8));

                // Use regular ExecuteActionStep (projectiles handled separately)
                sequence.push(new ExecuteActionStep(action, targets));
                break;

            case 'effect':
                sequence.push(new WaitStep(5));
                break;

            case 'return':
                if (action.isAttack() && targets.length > 0) {
                    sequence.push(new SetMotionStep(subject, 'walk'));
                    sequence.push(new ReturnHomeStep(subject, $battleTiming.config.movement.returnFrames));
                }
                break;

            case 'finish':
                sequence.push(new SetMotionStep(subject, 'wait'));
                sequence.push(new WaitStep(2));
                break;
        }

        return sequence;
    };

    BattleManager.startBasicActionSequence = function(action) {
        // Prevent multiple sequences from running
        if ($actionSequenceManager.isSequencePlaying()) {
            console.log("Action sequence already playing, skipping");
            return;
        }

        const subject = action.subject();
        const targets = action.makeTargets();

        if (targets.length === 0) {
            this.endAction();
            return;
        }

        const target = targets[0]; // For single target attacks

        console.log(`🎬 Starting action sequence for ${subject.name()} attacking ${target.name()}`);

        // Store the ACTUAL home position (not the current stepped-forward position)
        const subjectSprite = subject._sprite;
        if (subjectSprite) {
            // Use the sprite's actual home coordinates, not current position
            subjectSprite._originalHomeX = subjectSprite._homeX;
            subjectSprite._originalHomeY = subjectSprite._homeY;
            console.log(`Stored original home position: (${subjectSprite._homeX}, ${subjectSprite._homeY})`);
            console.log(`Current position: (${subjectSprite.x}, ${subjectSprite.y})`);
        }

        // Mimic core behavior
        subject.useItem(action.item());
        action.applyGlobal();
        this.refreshStatus();
        this._logWindow.displayAction(subject, action.item());
        subject.performActionStart(action);

        // Set phase to action to prevent turn advancement
        this._phase = "action";

        // Create SINGLE ExecuteActionStep
        const executeStep = new ExecuteActionStep(action, targets);
        console.log(`🎯 Created ExecuteActionStep with ID: ${executeStep.stepId}`);

        // Create action sequence - no need to step back first, start from current position
        const sequence = [
            new SetMotionStep(subject, 'walk'),
                                         new MoveToTargetStep(subject, target, $battleTiming.config.movement.stepFrames),
                                         new SetMotionStep(subject, 'swing'),
                                         new WaitStep(Math.round($battleTiming.config.movement.stepFrames * 0.75)),
                                         executeStep,
                                         new WaitStep(10),
                                         new SetMotionStep(subject, 'walk'),
                                         new ReturnHomeStep(subject, $battleTiming.config.movement.returnFrames),
                                         new SetMotionStep(subject, 'wait'),
                                         new WaitStep(15)
        ];
        console.log(`🎬 Sequence created with ${sequence.length} steps`);

        // Start the sequence
        $actionSequenceManager.startSequence(sequence);
    };

    BattleManager.buildProjectileSequence = function(subject, action, targets, primaryTarget, throwDataList) {
        const sequence = [];

        // Separate projectiles by timing
        const beforeProjectiles = throwDataList.filter(data => data.timing === 'before');
        const duringProjectiles = throwDataList.filter(data => data.timing === 'during');
        const afterProjectiles = throwDataList.filter(data => data.timing === 'after');

        // Basic movement to target (if attack requires it)
        if (action.isAttack()) {
            sequence.push(new SetMotionStep(subject, 'walk'));
            sequence.push(new MoveToTargetStep(subject, primaryTarget, 40));
        }

        // BEFORE projectiles
        for (const throwData of beforeProjectiles) {
            sequence.push(new ThrowProjectileStep(subject, action, targets, throwData));
            sequence.push(new WaitStep(5)); // Brief pause between projectiles
        }

        // Attack motion
        if (action.isAttack()) {
            sequence.push(new SetMotionStep(subject, 'swing'));
            sequence.push(new WaitStep(10));
        } else {
            sequence.push(new SetMotionStep(subject, 'skill'));
            sequence.push(new WaitStep(10));
        }

        // DURING projectiles (at start of action execution)
        for (const throwData of duringProjectiles) {
            sequence.push(new ThrowProjectileStep(subject, action, targets, throwData));
        }

        // Execute the main action
        const executeStep = new ExecuteActionStep(action, targets);
        sequence.push(executeStep);
        sequence.push(new WaitStep(20)); // Wait for damage processing

        // AFTER projectiles
        for (const throwData of afterProjectiles) {
            sequence.push(new ThrowProjectileStep(subject, action, targets, throwData));
            sequence.push(new WaitStep(5));
        }

        // Return movement (if needed)
        if (action.isAttack()) {
            sequence.push(new SetMotionStep(subject, 'walk'));
            sequence.push(new ReturnHomeStep(subject, 40));
        }

        // Final state
        sequence.push(new SetMotionStep(subject, 'wait'));
        sequence.push(new WaitStep(15));

        return sequence;
    };

    // CLEAN Sequence Completion
    BattleManager.actionSequenceFinished = function() {
// [silenced]         console.log("🎯 Action sequence finished, clearing flag");
        actionSequenceInProgress = false;

        // Clean up subject state
        if (this._subject && this._subject._sprite) {
            const sprite = this._subject._sprite;
            sprite._isSteppingBack = false;
            sprite._isSteppingForward = false;
        }

        // Proceed with normal action end
        this.endAction();
    };

    // Monitor Scene_Battle updates that might be causing the calls
    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);
    };

    // Add helper function to create custom sequences
    window.createActionSequence = function(subject, action, targets) {
        const target = targets[0];
        return [
            new SetMotionStep(subject, 'walk'),
                                         new MoveToTargetStep(subject, target, 40), // 40 frames to reach target
                                         new SetMotionStep(subject, 'swing'),
                                         new WaitStep(10),
                                         new ExecuteActionStep(action, targets),
                                         new WaitStep(30),
                                         new SetMotionStep(subject, 'walk'),
                                         new ReturnHomeStep(subject, 40), // 40 frames to return home
                                         new SetMotionStep(subject, 'wait'),
                                         new WaitStep(15)
        ];
    };

    // Export classes for custom sequences
    window.ActionStep = ActionStep;
    window.MoveToTargetStep = MoveToTargetStep;
    window.ExecuteActionStep = ExecuteActionStep;
    window.ReturnHomeStep = ReturnHomeStep;
    // Hook into Scene_Battle to trigger "inputing" sequence when actor command window opens
    const _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        _Scene_Battle_startActorCommandSelection.call(this);

        // Trigger "inputing" sequence for the active actor
        const actor = BattleManager.actor();
        if (actor && actor._sprite) {
            const inputingSequence = BattleManager.getCustomSequence(actor, 'inputing');
            if (inputingSequence && inputingSequence.length > 0) {
                // Set flag to prevent motion refresh from overriding
                actor._sprite._isInputing = true;

                BattleManager.executeCustomSequence(actor, inputingSequence, 'inputing');
            }
        }
    };

    window.WaitStep = WaitStep;
    window.SetMotionStep = SetMotionStep;
    window.Sprite_Projectile = Sprite_Projectile;
    window.ThrowProjectileStep = ThrowProjectileStep;
    window.CustomSequenceStep = CustomSequenceStep;
    window.ActionExecutor = ActionExecutor;
    window.UnifiedAnimationHandler = UnifiedAnimationHandler;
    window.parseThrowObjectData = parseThrowObjectData;
    window.parseActionSequenceData = parseActionSequenceData;
    window.getActionSequence = getActionSequence;

    window.debugZIndexes = function() {
        const battleField = SceneManager._scene._spriteset._battleField;
        if (battleField) {
            console.log("=== BATTLEFIELD Z-INDEX DEBUG ===");
            battleField.children.forEach((child, index) => {
                const name = child.constructor.name;
                const zIndex = child.zIndex || 'undefined';
                const layer = child.pictureData ? child.pictureData.layer : 'N/A';
                console.log(`${index}: ${name} - Z:${zIndex} - Layer:${layer}`);
            });
        }
    };

    const _BattleManager_startBattle = BattleManager.startBattle;
    BattleManager.startBattle = function() {
        _BattleManager_startBattle.call(this);

        // Restore MOG Battle HUD visibility
        $gameSystem._bhud_visible = true;

        // Clear escape flag
        $gameTemp._isEscapingBattle = false;

        // Ensure all UI windows are visible for the new battle
        setTimeout(() => {
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Battle) {
                if (scene._statusWindow) scene._statusWindow.show();
                if (scene._partyCommandWindow) scene._partyCommandWindow.show();
                if (scene._logWindow) scene._logWindow.show();
                // Don't show command windows yet - they'll appear when needed
            }

            // Trigger entry sequences for all party members and enemies at battle start
            this.triggerEntrySequences(); // Handles Actors
            this.triggerEnemyEntrySequences(); // Handles Enemies
        }, 100);
    };

    BattleManager.triggerEnemyEntrySequences = function() {
        const enemies = $gameTroop.aliveMembers();

        for (let i = 0; i < enemies.length; i++) {
            const enemy = enemies[i];

            // Only check for custom entry sequences - no default entry animation
            const entrySequence = this.getCustomSequence(enemy, 'entry');

            if (entrySequence && entrySequence.length > 0) {
// [silenced]                 console.log(`🎬 Triggering entry sequence for ${enemy.name()}`);
                this.executeCustomSequence(enemy, entrySequence, 'entry');
            }
        }
    };

    BattleManager.triggerEntrySequences = function() {
        const actors = $gameParty.battleMembers();

        for (let i = 0; i < actors.length; i++) {
            const actor = actors[i];
            const sprite = actor._sprite;

            if (!sprite) continue;

            const entrySequence = this.getCustomSequence(actor, 'entry');

            if (entrySequence && entrySequence.length > 0) {
// [silenced]                 console.log(`🎬 ENTRY START for ${actor.name()}: sprite at (${sprite.x}, ${sprite.y}), home at (${sprite._homeX}, ${sprite._homeY}), orientation=${battleOrientation}`);
                this.executeCustomSequence(actor, entrySequence, 'entry');

                // Re-enable default positioning after custom entry sequence completes
                // Use a generous timeout to ensure the sequence has finished
                setTimeout(() => {
                    if (sprite) {
                        sprite._blockDefaultPositioning = false;
                    }
                }, 3000);
            } else {
                // Default entry animation - move from current position to home position
                const targetOffsetX = sprite._homeX - sprite.x;
                const targetOffsetY = sprite._homeY - sprite.y;
                console.log(`${actor.name()} default entry: current=(${sprite.x}, ${sprite.y}), home=(${sprite._homeX}, ${sprite._homeY})`);
                console.log(`${actor.name()} calculated offsets: X=${targetOffsetX}, Y=${targetOffsetY}`);

                const delay = i * 100;
                const moveDuration = 40; // frames
                const moveTime = Math.ceil(moveDuration * 16.67); // Convert frames to ms (more accurate)

                setTimeout(() => {
                    if (sprite.startMotion) sprite.startMotion('walk');
                    sprite.startMove(targetOffsetX, targetOffsetY, moveDuration);

                    // Wait for movement to complete, then reset to wait motion
                    setTimeout(() => {
                        sprite._homeX = sprite._homeX; // Ensure home stays correct
                        sprite._homeY = sprite._homeY;
                        sprite._offsetX = 0;
                        sprite._offsetY = 0;
                        sprite._targetOffsetX = 0;
                        sprite._targetOffsetY = 0;
                        sprite._movementDuration = 0; // Ensure movement is complete
                        if (sprite.startMotion) sprite.startMotion('wait');

                        // Re-enable default positioning after entry completes
                        sprite._blockDefaultPositioning = false;
                    }, moveTime + 100);
                }, delay);
            }
        }
    };



    BattleManager.getCustomSequence = function(battler, sequenceType) {
        // Create a complete mock action for sequence detection
        const mockAction = {
            item: () => battler.isActor() ? $dataActors[battler.actorId()] : battler.enemy(),
                                         subject: () => battler,
                                         isAttack: () => false, // Entry/victory/collapse sequences are not attacks
                                         targetsForOpponents: () => [], // These sequences don't target opponents
                                         makeTargets: () => [battler] // Return the battler as the target
        };

        return getActionSequence(mockAction, battler, sequenceType);
    };

    BattleManager.getCustomDamageSequence = function(battler) {
        // Create a mock action for damage sequence detection
        const mockAction = {
            item: () => battler.isActor() ? $dataActors[battler.actorId()] : battler.enemy(),
                                         subject: () => battler,
                                         isAttack: () => false,
                                         targetsForOpponents: () => [],
                                         makeTargets: () => [battler]
        };

        return getActionSequence(mockAction, battler, 'damage');
    };

    // Override executeCustomSequence to allow damage sequences to run in parallel
    const _BattleManager_executeCustomSequence_original = BattleManager.executeCustomSequence;
    BattleManager.executeCustomSequence = function(battler, commands, sequenceType, isLooping = false, defaultTargets = []) {
        // Allow these sequence types to run in parallel (but NOT inputed - it needs to be synchronous)
        if (sequenceType === 'damage' || sequenceType === 'collapse' || sequenceType === 'entry' || sequenceType === 'victory' || sequenceType === 'movement' || sequenceType === 'inputing') {
            const sequenceId = `${sequenceType}_${battler.index()}_${battler.name()}_${Date.now()}`;
            const targets = defaultTargets.length > 0 ? defaultTargets : [battler];
            const customStep = new CustomSequenceStep(commands, battler, null, targets, sequenceType, isLooping);
            $actionSequenceManager.startSequence([customStep], true, sequenceId);
            return;
        }

        // Use original method for other sequence types (only if it exists)
        if (_BattleManager_executeCustomSequence_original) {
            _BattleManager_executeCustomSequence_original.call(this, battler, commands, sequenceType, isLooping, defaultTargets);
        } else {
            console.warn(`⚠️ Unhandled sequence type: ${sequenceType}`);
        }
    };

    const _BattleManager_processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function() {
        console.log("🎊 Victory processing started - triggering victory sequences");

        // Set phase to victory immediately
        this._phase = 'victory';

        // Trigger victory sequences FIRST, before any other victory processing
        this.triggerVictorySequences();

        // Wait a moment for sequences to start, then continue with normal victory
        setTimeout(() => {
            _BattleManager_processVictory.call(this);
        }, 200); // Give victory sequences time to start
    };

    const _BattleManager_processDefeat = BattleManager.processDefeat;
    BattleManager.processDefeat = function() {
        console.log("💀 Party defeated - preserving sprite states");

        // Set phase to defeat
        this._phase = 'defeat';

        // Call original defeat processing
        _BattleManager_processDefeat.call(this);

        // DON'T clean up sprites here - they should stay in defeated poses
        // Cleanup will happen when the scene terminates
    };

    const _BattleManager_processAbort = BattleManager.processAbort;
    BattleManager.processAbort = function() {
        _BattleManager_processAbort.call(this);

        // Clean up on abort
        BattleCleanupManager.performFullBattleCleanup();
    };

    // Add escape command handler to Scene_Battle
    const _Scene_Battle_createActorCommandWindow = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function() {
        _Scene_Battle_createActorCommandWindow.call(this);
        this._actorCommandWindow.setHandler("escape", this.commandEscape.bind(this));
    };

    Scene_Battle.prototype.commandEscape = function() {
        BattleManager.processEscape();
        this._actorCommandWindow.close();
    };

    // Escape processing in BattleManager
    BattleManager.processEscape = function() {
        const escapeRatio = 0.5 * $gameParty.agility() / $gameTroop.agility();

        if (Math.random() < escapeRatio) {
            console.log("🏃 Escape successful!");

            // Play escape sound effect from database
            if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[8]) {
                const escapeSound = $dataSystem.sounds[8];
                if (escapeSound.name && escapeSound.name.length > 0) {
                    AudioManager.playSe(escapeSound);
                }
            }

            // Hide MOG Battle HUD
            $gameSystem._bhud_visible = false;

            // Set global escape flag to prevent position resets
            $gameTemp._isEscapingBattle = true;

            // Hide all battle UI windows
            const scene = SceneManager._scene;
            if (scene instanceof Scene_Battle) {
                if (scene._statusWindow) scene._statusWindow.hide();
                if (scene._partyCommandWindow) scene._partyCommandWindow.hide();
                if (scene._actorCommandWindow) scene._actorCommandWindow.hide();
                if (scene._skillWindow) scene._skillWindow.hide();
                if (scene._itemWindow) scene._itemWindow.hide();
                if (scene._actorWindow) scene._actorWindow.hide();
                if (scene._enemyWindow) scene._enemyWindow.hide();
                if (scene._logWindow) scene._logWindow.hide();
                if (scene._helpWindow) scene._helpWindow.hide();
            }

            this._phase = 'aborting';

            // Trigger escape animations
            const actors = $gameParty.battleMembers();
            for (let i = 0; i < actors.length; i++) {
                const actor = actors[i];
                const sprite = actor._sprite;
                if (!sprite) continue;

                const escapeSequence = this.getCustomSequence(actor, 'escape');
                if (escapeSequence && escapeSequence.length > 0) {
                    this.executeCustomSequence(actor, escapeSequence, 'escape');
                } else {
                    // Default escape animation
                    setTimeout(() => {
                        // Use walk motion for charset battlers, escape for others
                        if (sprite.startMotion) {
                            sprite.startMotion(sprite._charsetBattler ? 'walk' : 'escape');
                        }

                        let targetOffsetX, targetOffsetY;
                        if (battleOrientation === 'Vertical') {
                            // Escape downward off screen
                            targetOffsetX = 0;
                            targetOffsetY = Graphics.height - sprite._homeY + 300;
                        } else {
                            // Escape right off screen
                            targetOffsetX = Graphics.width - sprite._homeX + 300;
                            targetOffsetY = 0;
                        }

                        // Faster escape - 35 frames instead of 60
                        sprite.startMove(targetOffsetX, targetOffsetY, 35);

                        console.log(`🏃 ${actor.name()} escaping ${battleOrientation === 'Vertical' ? 'down' : 'right'}`);
                    }, i * 50);
                }
            }

            setTimeout(() => this.processAbort(), 1500);
        } else {
            console.log("❌ Escape failed!");

            // Play buzzer sound for failed escape
            if ($dataSystem && $dataSystem.sounds && $dataSystem.sounds[3]) {
                const buzzerSound = $dataSystem.sounds[3];
                if (buzzerSound.name && buzzerSound.name.length > 0) {
                    AudioManager.playSe(buzzerSound);
                }
            }

            this._logWindow.clear();
            this._logWindow.addText("Failed to escape!");
            setTimeout(() => {
                this.endTurn();
                this.selectNextCommand();
            }, 1000);
        }
    };

    // Hide item window when selecting targets, show it again if backing out
    const _Scene_Battle_onItemOk = Scene_Battle.prototype.onItemOk;
    Scene_Battle.prototype.onItemOk = function() {
        _Scene_Battle_onItemOk.call(this);

        // Hide the item window when moving to target selection
        if (this._itemWindow) {
            this._itemWindow.hide();
        }
    };

    const _Scene_Battle_onSkillOk = Scene_Battle.prototype.onSkillOk;
    Scene_Battle.prototype.onSkillOk = function() {
        _Scene_Battle_onSkillOk.call(this);

        // Hide the skill window when moving to target selection
        if (this._skillWindow) {
            this._skillWindow.hide();
        }
    };

    const _Scene_Battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
    Scene_Battle.prototype.onEnemyCancel = function() {
        _Scene_Battle_onEnemyCancel.call(this);

        // Show the item window again if backing out from enemy selection
        if (this._enemyWindow.active && this._itemWindow && !this._itemWindow.visible) {
            this._itemWindow.show();
            this._itemWindow.activate();
        }

        // Show the skill window again if backing out from enemy selection
        if (this._enemyWindow.active && this._skillWindow && !this._skillWindow.visible) {
            this._skillWindow.show();
            this._skillWindow.activate();
        }
    };

    const _Scene_Battle_onActorCancel = Scene_Battle.prototype.onActorCancel;
    Scene_Battle.prototype.onActorCancel = function() {
        // Reset motion to wait when canceling command input
        const actor = BattleManager.actor();
        if (actor && actor._sprite) {
            actor._sprite._isInputing = false; // Clear flag
            if (actor._sprite.startMotion) {
                actor._sprite.startMotion('wait');
            }
        }

        _Scene_Battle_onActorCancel.call(this);

        // Show the item window again if backing out from actor selection
        if (this._actorWindow.active && this._itemWindow && !this._itemWindow.visible) {
            this._itemWindow.show();
            this._itemWindow.activate();
        }

        // Show the skill window again if backing out from actor selection
        if (this._actorWindow.active && this._skillWindow && !this._skillWindow.visible) {
            this._skillWindow.show();
            this._skillWindow.activate();
        }
    };




    // Also clean up when leaving battle scene
    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        // Ensure cleanup happens when scene terminates
        BattleCleanupManager.performFullBattleCleanup();

        // Clear the escape flag
        $gameTemp._isEscapingBattle = false;

        _Scene_Battle_terminate.call(this);
    };

    // Add this method to BattleManager
    BattleManager.isBattleActive = function() {
        // Battle is active if we're in Scene_Battle
        const scene = SceneManager._scene;
        if (!(scene instanceof Scene_Battle)) {
            return false;
        }

        // During victory phase, sequences should continue until we actually leave the scene
        if (this._phase === 'victory') {
            return true;
        }

        // Block only when actually transitioning out or aborted
        if (this._phase === 'battleEnd' || this._phase === 'aborting') {
            return false;
        }

        return true;
    };

    BattleManager.triggerVictorySequences = function() {
        const actors = $gameParty.battleMembers();

        // Trigger all victory sequences simultaneously without timer
        for (const actor of actors) {
            if (actor.isAlive()) {
                const victorySequence = this.getCustomSequence(actor, 'victory');
                if (victorySequence && victorySequence.length > 0) {
                    console.log(`🎬 Triggering victory sequence for ${actor.name()}`);
                    // Execute with looping enabled - will automatically stop when battle ends
                    this.executeCustomSequence(actor, victorySequence, 'victory', true);
                }
            }
        }
    };

    // Monitor phase changes for debugging
    const _BattleManager_changePhase = BattleManager.changePhase;
    BattleManager.changePhase = function(phase) {
        console.log(`🎬 Phase change: ${this._phase} → ${phase}`);
        _BattleManager_changePhase.call(this, phase);
    };

    // Enhanced Battle End Detection - Scene Transition Override
    const _SceneManager_goto = SceneManager.goto;
    SceneManager.goto = function(sceneClass) {
        // If transitioning away from battle, stop all victory sequences immediately
        if (this._scene instanceof Scene_Battle && sceneClass !== Scene_Battle) {
            if (window.$actionSequenceManager) {
                const victorySequences = [];
                for (const [sequenceId] of $actionSequenceManager.specialSequences) {
                    if (sequenceId.startsWith('victory_')) {
                        victorySequences.push(sequenceId);
                    }
                }

                victorySequences.forEach(id => {
                    console.log(`🎬 Scene transition stopping victory sequence: ${id}`);
                    $actionSequenceManager.specialSequences.delete(id);
                });
            }
        }

        _SceneManager_goto.call(this, sceneClass);
    };

    // Add debug function for testing projectiles
    window.testProjectile = function(iconId = 404) {
        const testData = {
            timing: 'before',
            image: iconId,
            duration: 60,
            speed: 80,
            arc: 50,
            spin: 5,
            start: { x: 0, y: -20 },
            se: null
        };

        const battleField = SceneManager._scene._spriteset._battleField;
        if (battleField) {
            const projectile = new Sprite_Projectile(testData, 400, 300, 600, 200);
            projectile.z = 999;
            battleField.addChild(projectile);
            console.log("🎯 Test projectile launched!");
        } else {
            console.log("❌ No battlefield available for test");
        }
    };

    // Add debug function to test note tag parsing
    window.testNoteTagParsing = function(itemId, isWeapon = false, isSkill = false) {
        let item;
        if (isWeapon) {
            item = $dataWeapons[itemId];
        } else if (isSkill) {
            item = $dataSkills[itemId];
        } else {
            item = $dataItems[itemId];
        }

        if (!item) {
            console.log(`❌ Item not found: ID ${itemId}`);
            return;
        }

        console.log(`🔍 Testing note tags for: ${item.name}`);
        console.log(`📝 Note content:`, item.note);

        const throwData = parseThrowObjectData(item);
        if (throwData) {
            console.log(`✅ Found ${throwData.length} projectile definition(s):`);
            throwData.forEach((data, index) => {
                console.log(`  Projectile ${index + 1}:`, data);
            });
        } else {
            console.log("❌ No projectile data found in note tags");
        }
    };

    // Add debug function to test custom action sequences
    window.testCustomActionSequences = function(itemId, isWeapon = false, isSkill = false) {
        let item;
        if (isWeapon) {
            item = $dataWeapons[itemId];
        } else if (isSkill) {
            item = $dataSkills[itemId];
        } else {
            item = $dataItems[itemId];
        }

        if (!item) {
            console.log(`❌ Item not found: ID ${itemId}`);
            return;
        }

        console.log(`🔍 Testing custom action sequences for: ${item.name}`);
        console.log(`📝 Note content:`, item.note);

        const sequenceTypes = ['prepare', 'movement', 'execute', 'effect', 'return', 'finish'];
        let foundSequences = 0;

        for (const seqType of sequenceTypes) {
            const sequence = parseActionSequenceData(item, seqType);
            if (sequence && sequence.length > 0) {
                foundSequences++;
                console.log(`✅ Found ${seqType} sequence with ${sequence.length} commands:`);
                sequence.forEach((cmd, index) => {
                    console.log(`  Command ${index + 1}: ${cmd.type}`, cmd);
                });
            }
        }

        if (foundSequences === 0) {
            console.log("❌ No custom action sequences found in note tags");
        } else {
            console.log(`✅ Total custom sequences found: ${foundSequences}`);
        }

        // Also check for projectiles
        const throwData = parseThrowObjectData(item);
        if (throwData) {
            console.log(`✅ Also found ${throwData.length} projectile definition(s)`);
        }
    };

})();
