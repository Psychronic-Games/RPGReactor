//=============================================================================
// PSYCHRONIC_CoreCustomizerMZ.js
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v0.3] Customize Core Aspects of the RPG Maker MZ Engine
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_CoreCustomizerMZ.js
 *
 * @param mvAnimationSpeed
 * @text MV Animation Speed
 * @desc Controls the speed of MV/Classic style animations. Lower = faster, Higher = slower.
 * @type number
 * @min 1
 * @max 10
 * @default 4
 * @decimals 0
 *
 * @param effekseerAnimationSpeed
 * @text Effekseer Animation Speed
 * @desc Controls the speed of Effekseer style animations. Lower = faster, Higher = slower.
 * @type number
 * @min 1
 * @max 10
 * @default 4
 * @decimals 0
 *
 * @param disableMapLevelUp
 * @text Disable Map Level Up Messages
 * @desc Turn off level up notification messages that appear on the map (outside of battle).
 * @type boolean
 * @default false
 * @on Disable
 * @off Enable
 *
 * @param disableBattleLevelUp
 * @text Disable Battle Level Up Messages
 * @desc Turn off level up notification messages that appear during/after battles.
 * @type boolean
 * @default false
 * @on Disable
 * @off Enable
 *
 * @param escapeSuccessRate
 * @text Base Escape Success Rate
 * @desc Base multiplier for escape success rate. Default is 0.5 (50% of party agility / enemy agility).
 * @type number
 * @min 0
 * @max 2
 * @default 0.5
 * @decimals 2
 *
 * ============================================================================
 * Core Customizer MZ Plugin
 * ============================================================================
 *
 * This plugin allows you to customize various core aspects of RPG Maker MZ.
 *
 * MV Animation Speed:
 * - Controls MV/Classic style animations (those with frame-based data)
 * - Default value is 4 (normal speed)
 * - Lower numbers = faster animations
 * - Higher numbers = slower animations
 * - Range: 1 (very fast) to 10 (very slow)
 *
 * Effekseer Animation Speed:
 * - Controls Effekseer style animations (particle effects)
 * - Default value is 4 (normal speed)
 * - Lower numbers = faster animations
 * - Higher numbers = slower animations
 * - Range: 1 (very fast) to 10 (very slow)
 *
 * Disable Map Level Up Messages:
 * - When enabled, level up notifications will not appear on the map (outside battle)
 * - Applies to both battle EXP gains (after returning to map) and event commands
 * - Useful if you want to handle level up notifications through custom systems
 *
 * Disable Battle Level Up Messages:
 * - When enabled, level up notifications will not appear during/after battles
 * - Applies to battle EXP gains and victory screen level ups
 * - Useful if you have a custom victory screen or battle system
 *
 * Note: You can enable both options to completely disable all level up messages
 *
 * Base Escape Success Rate:
 * - Controls the initial success rate for escaping from battles
 * - Formula: (escapeSuccessRate * party agility) / enemy agility
 * - Default is 0.5 (vanilla RPG Maker MZ behavior)
 * - Higher values make escaping easier
 * - Lower values make escaping harder
 * - Each failed escape attempt increases success rate by 10%
 *
 * ============================================================================
 * Changelog
 * ============================================================================
 *
 * Version 0.3:
 * - Split level up notification control into separate Map and Battle options
 * - Players can now independently disable level ups on map, in battle, or both
 * - Fixed level up messages not being properly blocked
 *
 * Version 0.2:
 * - Added option to disable level up notifications on the map
 * - Added configurable base escape success rate
 *
 * Version 0.1:
 * - Initial release
 * - Added separate animation speed customization for MV and Effekseer types
 *
 * ============================================================================
 */

(() => {
    'use strict';

    // Get plugin name for parameter retrieval
    const pluginName = 'PSYCHRONIC_CoreCustomizerMZ';
    const parameters = PluginManager.parameters(pluginName);

    // Parse plugin parameters
    const mvAnimationSpeed = parseInt(parameters['mvAnimationSpeed'] || 4);
    const effekseerAnimationSpeed = parseInt(parameters['effekseerAnimationSpeed'] || 4);
    const disableMapLevelUp = parameters['disableMapLevelUp'] === 'true';
    const disableBattleLevelUp = parameters['disableBattleLevelUp'] === 'true';
    const escapeSuccessRate = parseFloat(parameters['escapeSuccessRate'] || 0.5);

    //=============================================================================
    // Animation Speed Customization
    //=============================================================================

    //-----------------------------------------------------------------------------
    // MV-Style Animation Speed Control (Sprite_AnimationMV)
    //-----------------------------------------------------------------------------

    // Override setupRate for MV animations to use our custom speed
    const _Sprite_AnimationMV_setupRate = Sprite_AnimationMV.prototype.setupRate;
    Sprite_AnimationMV.prototype.setupRate = function() {
        this._rate = mvAnimationSpeed;
    };

    //-----------------------------------------------------------------------------
    // Effekseer Animation Speed Control (Sprite_Animation) - Visual speed only
    //-----------------------------------------------------------------------------

    // Set Effekseer speed on handle creation - only control visual speed
    const _Sprite_Animation_updateEffectGeometry = Sprite_Animation.prototype.updateEffectGeometry;
    Sprite_Animation.prototype.updateEffectGeometry = function() {
        _Sprite_Animation_updateEffectGeometry.call(this);

        if (this._handle && this._animation) {
            // Calculate speed multiplier (4 is normal)
            const speedMultiplier = 4 / effekseerAnimationSpeed;
            const effectiveSpeed = (this._animation.speed / 100) * speedMultiplier;
            this._handle.setSpeed(effectiveSpeed);
        }
    };

    // For Effekseer animations, we only control the visual speed via the handle
    // and let timing events (flashes, sounds) run at normal frame rate to stay in sync

    //=============================================================================
    // Level Up Notification Control
    //=============================================================================

    // Override shouldDisplayLevelUp to check if level up messages are disabled
    const _Game_Actor_shouldDisplayLevelUp = Game_Actor.prototype.shouldDisplayLevelUp;
    Game_Actor.prototype.shouldDisplayLevelUp = function() {
        const inBattle = $gameParty.inBattle();

        // Check if level ups are disabled for current location
        if (inBattle && disableBattleLevelUp) {
            // [silenced] console.log('CoreCustomizer: Blocking battle level up message (shouldDisplayLevelUp)');
            return false;
        }
        if (!inBattle && disableMapLevelUp) {
            // [silenced] console.log('CoreCustomizer: Blocking map level up message (shouldDisplayLevelUp)');
            return false;
        }

        // Otherwise use default behavior
        return _Game_Actor_shouldDisplayLevelUp.call(this);
    };

    // Also override displayLevelUp to catch event commands that bypass shouldDisplayLevelUp
    const _Game_Actor_displayLevelUp = Game_Actor.prototype.displayLevelUp;
    Game_Actor.prototype.displayLevelUp = function(newSkills) {
        const inBattle = $gameParty.inBattle();

        // [silenced] console.log('CoreCustomizer: displayLevelUp called', { ... });

        // Check if level ups are disabled for current location
        if (inBattle && disableBattleLevelUp) {
            // [silenced] console.log('CoreCustomizer: Blocking battle level up message (displayLevelUp)');
            return;
        }
        if (!inBattle && disableMapLevelUp) {
            // [silenced] console.log('CoreCustomizer: Blocking map level up message (displayLevelUp)');
            return;
        }

        // Otherwise use default behavior
        _Game_Actor_displayLevelUp.call(this, newSkills);
    };

    //=============================================================================
    // Battle Escape Rate Customization
    //=============================================================================

    // Override makeEscapeRatio to use custom escape success rate
    BattleManager.makeEscapeRatio = function() {
        this._escapeRatio = (escapeSuccessRate * $gameParty.agility()) / $gameTroop.agility();
    };

    //=============================================================================
    // Debug and Utility Functions
    //=============================================================================

    // Add a way to check current animation speed settings
    window.getAnimationSpeed = function() {
        return {
            mvSpeed: mvAnimationSpeed,
            effekseerSpeed: effekseerAnimationSpeed,
            mvMultiplier: 4 / mvAnimationSpeed,
            effekseerMultiplier: 4 / effekseerAnimationSpeed
        };
    };

    // Add a way to test current animations
    window.getCurrentAnimations = function() {
        try {
            const scene = SceneManager._scene;
            if (!scene || !scene._spriteset) return [];

            const animations = scene._spriteset._animationSprites || [];
            return animations.filter(sprite => sprite && sprite.isPlaying()).map(sprite => ({
                type: sprite.constructor.name,
                frameIndex: sprite._frameIndex || 0,
                counter: sprite._customSpeedCounter || 0,
                rate: sprite._rate || 'N/A',
                name: sprite._animation ? sprite._animation.name : 'Unknown',
                isPlaying: sprite.isPlaying(),
                                                                                            speedSetting: sprite.constructor.name === 'Sprite_AnimationMV' ? mvAnimationSpeed : effekseerAnimationSpeed
            }));
        } catch (error) {
            console.error('Error getting current animations:', error);
            return [];
        }
    };

    // Debug function to identify animation types and their speed settings
    window.testAnimationType = function(animationId) {
        if ($dataAnimations && $dataAnimations[animationId]) {
            const anim = $dataAnimations[animationId];
            const isMV = !!anim.frames;
            const currentSpeed = isMV ? mvAnimationSpeed : effekseerAnimationSpeed;
            const multiplier = 4 / currentSpeed;

            // [silenced] console.log(`Animation ${animationId}: "${anim.name}"`);
            // [silenced] console.log(`Type: ${isMV ? 'MV Style (has frames)' : 'Effekseer (no frames)'}`);
            if (anim.displayType !== undefined) {
                // [silenced] console.log(`Display Type: ${anim.displayType}`);
            }
            // [silenced] console.log(`Speed Setting: ${currentSpeed} (${multiplier}x multiplier)`);
            // [silenced] console.log(`Will use: ${isMV ? 'MV' : 'Effekseer'} animation speed setting`);
            return anim;
        } else {
            // [silenced] console.log(`Animation ${animationId} not found`);
            return null;
        }
    };

    // Function to test both animation types with a specific skill/item
    window.testAnimationSpeeds = function() {
        const speeds = getAnimationSpeed();
        // [silenced] console.log('Current Animation Speed Settings:');
        // [silenced] console.log(`MV Animations: ${speeds.mvSpeed} (${speeds.mvMultiplier}x speed)`);
        // [silenced] console.log(`Effekseer Animations: ${speeds.effekseerSpeed} (${speeds.effekseerMultiplier}x speed)`);

        // Show some example animations if available
        if ($dataAnimations) {
            // [silenced] console.log('\nExample animations:');
            for (let i = 1; i <= Math.min(10, $dataAnimations.length - 1); i++) {
                if ($dataAnimations[i]) {
                    const anim = $dataAnimations[i];
                    const isMV = !!anim.frames;
                    // [silenced] console.log(`${i}: ${anim.name} (${isMV ? 'MV' : 'Effekseer'})`);
                }
            }
        }
    };

    // Function to check current escape ratio in battle
    window.getCurrentEscapeRatio = function() {
        if ($gameParty.inBattle() && BattleManager._escapeRatio !== undefined) {
            const ratio = BattleManager._escapeRatio;
            const percentage = Math.round(ratio * 100);
            // [silenced] console.log(`Current Escape Ratio: ${ratio.toFixed(4)} (${percentage}% chance)`);
            // [silenced] console.log(`Base Rate Setting: ${escapeSuccessRate}`);
            // [silenced] console.log(`Party Agility: ${$gameParty.agility()}`);
            // [silenced] console.log(`Troop Agility: ${$gameTroop.agility()}`);
            return ratio;
        } else {
            // [silenced] console.log('Not currently in battle');
            return null;
        }
    };

    // Function to check level up notification settings
    window.getLevelUpSettings = function() {
        // [silenced] console.log('Level Up Notification Settings:');
        // [silenced] console.log(`Map Level Up Messages: ${disableMapLevelUp ? 'DISABLED' : 'ENABLED'}`);
        // [silenced] console.log(`Battle Level Up Messages: ${disableBattleLevelUp ? 'DISABLED' : 'ENABLED'}`);
        // [silenced] console.log(`Currently in battle: ${$gameParty.inBattle()}`);
        return {
            mapDisabled: disableMapLevelUp,
            battleDisabled: disableBattleLevelUp,
            inBattle: $gameParty.inBattle()
        };
    };

    // Startup logging
    // [silenced] console.log(`Core Customizer MZ v0.3 loaded`);
    // [silenced] console.log(`MV Animation Speed: ${mvAnimationSpeed} (${mvAnimationSpeed < 4 ? 'faster' : mvAnimationSpeed > 4 ? 'slower' : 'normal'})`);
    // [silenced] console.log(`Effekseer Animation Speed: ${effekseerAnimationSpeed} (${effekseerAnimationSpeed < 4 ? 'faster' : effekseerAnimationSpeed > 4 ? 'slower' : 'normal'})`);
    // [silenced] console.log(`Map Level Up Messages: ${disableMapLevelUp ? 'DISABLED' : 'ENABLED'}`);
    // [silenced] console.log(`Battle Level Up Messages: ${disableBattleLevelUp ? 'DISABLED' : 'ENABLED'}`);
    // [silenced] console.log(`Base Escape Success Rate: ${escapeSuccessRate} (${escapeSuccessRate < 0.5 ? 'harder' : escapeSuccessRate > 0.5 ? 'easier' : 'normal'})`);
    // [silenced] console.log(`Use testAnimationSpeeds() to see current settings and example animations`);
    // [silenced] console.log(`Use getCurrentEscapeRatio() to check escape chance in battle`);
    // [silenced] console.log(`Use getLevelUpSettings() to check level up notification settings`);

})();
