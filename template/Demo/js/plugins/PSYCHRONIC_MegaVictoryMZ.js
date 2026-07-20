/*:
 * @target MZ
 * @plugindesc Adds Extra Functionality to victory section of RPG Maker MZ.
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_MegaVictoryMZ.js
 *
 * ============================================================================
 * MEGA VICTORY MZ - Enhanced Victory Screen
 * ============================================================================
 *
 * This plugin completely overhauls the victory screen in RPG Maker MZ with
 * a modern, visually appealing two-stage display:
 *
 * Stage 1 - Experience Screen:
 * - Shows all party members with their portraits
 * - ANIMATED EXP bars that fill up based on gained experience
 * - Animated level-up notifications
 * - Optional level display toggle
 * - Advance manually with OK button
 *
 * Stage 2 - Rewards Screen:
 * - Shows items acquired during battle with descriptions
 * - Displays gold earned
 * - Uses enhanced visual styling similar to MegaItems
 * - Color-coded item types with gradient backgrounds
 * - Advance manually with OK button
 *
 * ============================================================================
 * Plugin Parameters
 * ============================================================================
 *
 * @param showLevels
 * @text Show Character Levels
 * @type boolean
 * @default true
 * @desc Show current level and level-up information
 *
 * @param showLevelProgress
 * @text Show Level Progress Bar
 * @type boolean
 * @default true
 * @desc Show visual progress bar to next level
 *
 * @param playLevelUpSound
 * @text Play Level Up Sound
 * @type boolean
 * @default true
 * @desc Play a sound effect when a character levels up
 *
 * @param levelUpSE
 * @text Level Up Sound Effect
 * @type file
 * @dir audio/se
 * @default Up4
 * @desc Sound effect to play on level up
 *
 * @param expAnimationSpeed
 * @text EXP Animation Speed
 * @type number
 * @min 1
 * @max 100
 * @default 30
 * @desc Speed of EXP bar animation (higher = faster)
 *
 * @param expBarColor1
 * @text EXP Bar Color 1
 * @type string
 * @default #44ff88
 * @desc Starting color for EXP bar gradient (hex format)
 *
 * @param expBarColor2
 * @text EXP Bar Color 2
 * @type string
 * @default #44aaff
 * @desc Ending color for EXP bar gradient (hex format)
 *
 * @param consumableColor
 * @text Consumable Item Color
 * @type string
 * @default #44ff88
 * @desc Color for consumable items (hex format)
 *
 * @param keyItemColor
 * @text Key Item Color
 * @type string
 * @default #ffaa44
 * @desc Color for key items (hex format)
 *
 * @param weaponColor
 * @text Weapon Color
 * @type string
 * @default #ff6644
 * @desc Color for weapons (hex format)
 *
 * @param armorColor
 * @text Armor Color
 * @type string
 * @default #4488ff
 * @desc Color for armor (hex format)
 *
 * @param descriptionFontSize
 * @text Description Font Size
 * @type number
 * @default 14
 * @desc Font size for item descriptions
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MegaVictoryMZ';
    const parameters = PluginManager.parameters(pluginName);

    const showLevels = parameters['showLevels'] !== 'false';
    const showLevelProgress = parameters['showLevelProgress'] !== 'false';
    const playLevelUpSound = parameters['playLevelUpSound'] !== 'false';
    const levelUpSE = parameters['levelUpSE'] || 'Up4';
    const expAnimationSpeed = parseInt(parameters['expAnimationSpeed']) || 30;
    const expBarColor1 = parameters['expBarColor1'] || '#44ff88';
    const expBarColor2 = parameters['expBarColor2'] || '#44aaff';
    const consumableColor = parameters['consumableColor'] || '#44ff88';
    const keyItemColor = parameters['keyItemColor'] || '#ffaa44';
    const weaponColor = parameters['weaponColor'] || '#ff6644';
    const armorColor = parameters['armorColor'] || '#4488ff';
    const descriptionFontSize = parseInt(parameters['descriptionFontSize']) || 14;

    //=============================================================================
    // BattleManager - Override Victory Processing
    //=============================================================================

    const _BattleManager_processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function() {
        console.log("🎊 MegaVictory: processVictory called");

        // Store current party state before gaining rewards
        this.storePreVictoryState();

        // Make rewards as normal
        this.makeRewards();

        // Play victory ME, then queue the saved map BGM to resume after it
        this.playVictoryMe();
        this.replayBgmAndBgs();

        // CRITICAL: Set phase to 'victory' to allow Battle Engine sequences
        this._phase = "victory";

        // CRITICAL: Manually trigger victory sequences if Battle Engine is present
        if (this.triggerVictorySequences) {
            console.log("🎊 MegaVictory: Triggering Battle Engine victory sequences");
            this.triggerVictorySequences();
        }

        // Signal that we want custom victory screens
        this._showCustomVictory = true;

        // Mark when victory screens should start showing
        this._victoryScreensReady = false;
    };

    BattleManager.storePreVictoryState = function() {
        this._preVictoryState = {
            actors: $gameParty.battleMembers().map(actor => ({
                actorId: actor.actorId(),
                                                             level: actor.level,
                                                             exp: actor.currentExp(),
                                                             currentLevelExp: actor.currentLevelExp()
            }))
        };
    };

    BattleManager.getPreVictoryData = function(actor) {
        return this._preVictoryState.actors.find(a => a.actorId === actor.actorId());
    };

    const _BattleManager_updateBattleEnd = BattleManager.updateBattleEnd;
    BattleManager.updateBattleEnd = function() {
        if (this._showCustomVictory) {
            // Let Scene_Battle handle the custom victory screens
            return;
        }
        _BattleManager_updateBattleEnd.call(this);
    };

    //=============================================================================
    // Scene_Battle - Custom Victory Screen Management
    //=============================================================================

    const _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);

        if (BattleManager._showCustomVictory && !this._victoryWindowsCreated) {
            // Wait a moment for victory sequences to start
            if (!BattleManager._victoryScreensReady) {
                // Give victory sequences time to initialize (1 second)
                if (!this._victoryDelayStarted) {
                    this._victoryDelayStarted = true;
                    setTimeout(() => {
                        BattleManager._victoryScreensReady = true;
                    }, 1000); // 1 second delay
                }
                return;
            }

            // Clear any buffered input from battle
            Input.clear();
            TouchInput.clear();

            this.createVictoryWindows();
            this._victoryWindowsCreated = true;
            this._victoryStage = 0; // 0 = EXP screen, 1 = Items screen
        }

        if (this._victoryWindowsCreated) {
            this.updateVictorySequence();
        }
    };

    Scene_Battle.prototype.createVictoryWindows = function() {
        // Completely clear and disable message system
        $gameMessage.clear();

        // Force clear any message callbacks
        if ($gameMessage._texts) {
            $gameMessage._texts = [];
        }
        if ($gameMessage._choices) {
            $gameMessage._choices = [];
        }

        // Disable message window completely
        if (this._messageWindow) {
            this._messageWindow.hide();
            this._messageWindow.close();
            this._messageWindow.deactivate();
            // Override its update to prevent it from processing
            this._messageWindow._savedUpdate = this._messageWindow.update;
            this._messageWindow.update = function() {};
        }
        if (this._logWindow) {
            this._logWindow.hide();
            this._logWindow.clear();
        }

        // ADDED: Hide ATB Bar during victory
        if (this._atbBarWindow) {
            this._atbBarWindow.visible = false;
            this._atbBarWindow.hideSkillInfo();
            console.log("🎊 Victory: Hiding ATB Bar");
        }

        // Gain rewards first
        BattleManager.gainRewards();

        // Create EXP window
        const expRect = this.victoryExpWindowRect();
        this._victoryExpWindow = new Window_VictoryExp(expRect);
        this._victoryExpWindow.setRewards(BattleManager._rewards);
        this.addWindow(this._victoryExpWindow);

        // Create rewards window (hidden initially)
        const rewardsRect = this.victoryRewardsWindowRect();
        this._victoryRewardsWindow = new Window_VictoryRewards(rewardsRect);
        this._victoryRewardsWindow.setRewards(BattleManager._rewards);
        this._victoryRewardsWindow.hide();
        this.addWindow(this._victoryRewardsWindow);
    };

    Scene_Battle.prototype.victoryExpWindowRect = function() {
        // Fixed height for single row layout
        const boxHeight = 140;
        const topPadding = 100; // For title
        const bottomPadding = 80; // INCREASED: More space for hint text on separate line

        const calculatedHeight = topPadding + boxHeight + bottomPadding;

        const ww = Graphics.boxWidth;
        const wh = Math.min(calculatedHeight, Graphics.boxHeight - 100);
        const wx = 0;
        const wy = 20; // CHANGED: Position at top of screen (with small margin)

return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.victoryRewardsWindowRect = function() {
        const ww = Graphics.boxWidth - 100;
        const wh = Graphics.boxHeight - 150;
        const wx = 50;
        const wy = 75;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Battle.prototype.updateVictorySequence = function() {
        if (this._victoryStage === 0) {
            // EXP Screen stage - wait for animation completion and player input
            if (this._victoryExpWindow.isAnimationComplete()) {
                if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                    SoundManager.playOk();
                    Input.clear();
                    TouchInput.clear();
                    this.advanceToRewardsScreen();
                }
            }
        } else if (this._victoryStage === 1) {
            // Rewards Screen stage - wait for player input
            if (Input.isTriggered('ok') || Input.isTriggered('cancel') || TouchInput.isTriggered()) {
                SoundManager.playOk();
                Input.clear();
                TouchInput.clear();
                this.finishVictory();
            }
        }
    };

    Scene_Battle.prototype.advanceToRewardsScreen = function() {
        this._victoryExpWindow.hide();
        this._victoryRewardsWindow.show();
        this._victoryRewardsWindow.refresh();
        this._victoryStage = 1;
    };

    Scene_Battle.prototype.finishVictory = function() {
        // Restore message window update if it was overridden
        if (this._messageWindow && this._messageWindow._savedUpdate) {
            this._messageWindow.update = this._messageWindow._savedUpdate;
            this._messageWindow._savedUpdate = null;
        }

        // Close victory windows
        this._victoryExpWindow.close();
        this._victoryRewardsWindow.close();

        // Clean up custom victory flag
        BattleManager._showCustomVictory = false;
        this._victoryWindowsCreated = false;

        // CRITICAL FIX: Call endBattle to trigger event callback for "If Victory" commands
        // This must be called before updateBattleEnd to set the branch correctly
        BattleManager.endBattle(0);  // 0 = victory

        // Now call the original updateBattleEnd to finish the battle
        _BattleManager_updateBattleEnd.call(BattleManager);
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        // Restore message window if needed
        if (this._messageWindow && this._messageWindow._savedUpdate) {
            this._messageWindow.update = this._messageWindow._savedUpdate;
            this._messageWindow._savedUpdate = null;
        }

        if (this._victoryExpWindow) {
            this._victoryExpWindow = null;
        }
        if (this._victoryRewardsWindow) {
            this._victoryRewardsWindow = null;
        }
        _Scene_Battle_terminate.call(this);
    };

    //=============================================================================
    // Window_VictoryExp - Experience Gained Display with Animation
    //=============================================================================

    function Window_VictoryExp() {
        this.initialize(...arguments);
    }

    Window_VictoryExp.prototype = Object.create(Window_Base.prototype);
    Window_VictoryExp.prototype.constructor = Window_VictoryExp;

    Window_VictoryExp.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._rewards = null;
        this._actorData = [];
        this._animating = true;
        this._levelUpPlayed = {};
    };

    Window_VictoryExp.prototype.setRewards = function(rewards) {
        this._rewards = rewards;
        this.prepareActorData();
        this.refresh();
    };

    Window_VictoryExp.prototype.prepareActorData = function() {
        const actors = $gameParty.battleMembers();

        for (const actor of actors) {
            const preData = BattleManager.getPreVictoryData(actor);

            this._actorData.push({
                actor: actor,
                startExp: preData.exp,
                startLevelExp: preData.currentLevelExp,
                endExp: actor.currentExp(),
                                 currentAnimExp: preData.exp,
                                 startLevel: preData.level,
                                 endLevel: actor.level
            });

            this._levelUpPlayed[actor.actorId()] = false;
        }
    };

    Window_VictoryExp.prototype.update = function() {
        Window_Base.prototype.update.call(this);

        if (this._animating) {
            this.updateExpAnimation();
        }
    };

    Window_VictoryExp.prototype.updateExpAnimation = function() {
        let allComplete = true;

        for (const data of this._actorData) {
            if (data.currentAnimExp < data.endExp) {
                // Calculate how much EXP to add this frame
                const remaining = data.endExp - data.currentAnimExp;
                const increment = Math.max(1, Math.ceil(remaining / expAnimationSpeed));

                data.currentAnimExp = Math.min(data.currentAnimExp + increment, data.endExp);

                // Check for level up during animation
                const actor = data.actor;

                // Calculate what level the animated EXP corresponds to
                let animLevel = data.startLevel;
                let tempExp = data.currentAnimExp;

                while (animLevel < actor.maxLevel() && tempExp >= actor.expForLevel(animLevel + 1)) {
                    animLevel++;

                    // Play level up sound when crossing level threshold
                    if (!this._levelUpPlayed[actor.actorId() + '_' + animLevel]) {
                        if (playLevelUpSound) {
                            AudioManager.playSe({
                                name: levelUpSE,
                                volume: 90,
                                pitch: 100,
                                pan: 0
                            });
                        }
                        this._levelUpPlayed[actor.actorId() + '_' + animLevel] = true;
                    }
                }

                allComplete = false;
            }
        }

        if (allComplete) {
            this._animating = false;
        }

        this.refresh();
    };

    Window_VictoryExp.prototype.isAnimationComplete = function() {
        return !this._animating;
    };

    Window_VictoryExp.prototype.refresh = function() {
        this.contents.clear();

        if (!this._rewards) return;

        let y = 20;

        // Draw title
        this.contents.fontSize = 32;
        this.changeTextColor(ColorManager.systemColor());
        const titleText = "VICTORY!";
        const titleWidth = this.contents.measureTextWidth(titleText);
        this.drawText(titleText, (this.contents.width - titleWidth) / 2, y, titleWidth);

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();

        y += 60;

        // Calculate layout for all party members in ONE ROW
        const members = this._actorData;
        const boxHeight = 120;
        const boxSpacing = 8;

        // Calculate box width to fit all members in one row
        const totalSpacing = boxSpacing * (members.length - 1);
        const availableWidth = this.contents.width - 40; // 20px padding on each side
        const boxWidth = Math.floor((availableWidth - totalSpacing) / members.length);

        // Calculate starting X to center the row
        const rowWidth = (boxWidth * members.length) + (boxSpacing * (members.length - 1));
        const startX = (this.contents.width - rowWidth) / 2;

        // Draw all actors in one row
        for (let i = 0; i < members.length; i++) {
            const data = members[i];
            const x = startX + (i * (boxWidth + boxSpacing));
            this.drawActorExpGain(data, x, y, boxWidth);
        }

        // Draw hint text if animation is complete
        if (this.isAnimationComplete()) {
            this.drawHintText();
        }
    };

    Window_VictoryExp.prototype.drawHintText = function() {
        const hintText = "Press OK to continue...";
        const y = this.contents.height - 40; // CHANGED: More padding from bottom
        this.contents.fontSize = 18;
        this.changeTextColor(ColorManager.systemColor());
        const textWidth = this.contents.measureTextWidth(hintText);
        this.drawText(hintText, (this.contents.width - textWidth) / 2, y, textWidth);
        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_VictoryExp.prototype.drawActorExpGain = function(data, x, y, width) {
        const actor = data.actor;
        const animExp = data.currentAnimExp;
        const startExp = data.startExp;
        const endExp = data.endExp;

        // Calculate current animated level
        let animLevel = data.startLevel;
        let tempExp = animExp;
        while (animLevel < actor.maxLevel() && tempExp >= actor.expForLevel(animLevel + 1)) {
            animLevel++;
        }

        const leveledUp = animLevel > data.startLevel;
        const height = 120;
        const padding = 8;

        // Draw box background and border (similar to menu style)
        this.drawActorBoxBackground(actor, x, y, width, height);

        // Draw actor face (centered)
        const faceName = actor.faceName();
        const faceIndex = actor.faceIndex();
        const faceSize = Math.min(80, width - 20); // Scaled down for compact display
        const faceX = x + Math.floor((width - faceSize) / 2);
        this.drawFace(faceName, faceIndex, faceX, y + padding, faceSize, faceSize);

        let currentY = y + padding + faceSize + 4;

        // Draw actor name (centered, compact)
        const nameX = x + padding;
        const nameWidth = width - padding * 2;
        this.changeTextColor(ColorManager.hpColor(actor));
        this.contents.fontSize = 18;
        this.drawText(actor.name(), nameX, currentY, nameWidth, 'center');
        currentY += 22;

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();

        // Draw level info (centered)
        if (showLevels) {
            const levelText = leveledUp ?
            `Lv.${animLevel} (UP!)` :
            `Lv.${animLevel}`;

            this.contents.fontSize = 16;
            if (leveledUp) {
                this.changeTextColor('#ffff44');
            } else {
                this.changeTextColor(ColorManager.systemColor());
            }
            this.drawText(levelText, nameX, currentY, nameWidth, 'center');
            currentY += 20;
            this.resetTextColor();
            this.contents.fontSize = $gameSystem.mainFontSize();
        }

        // Draw EXP gained (centered)
        const currentGained = Math.floor(animExp - startExp);
        const expText = `+${currentGained} EXP`;
        this.contents.fontSize = 16;
        this.changeTextColor('#44ff88');
        this.drawText(expText, nameX, currentY, nameWidth, 'center');
        currentY += 20;

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();

        // Draw progress bar (centered)
        if (showLevelProgress && !actor.isMaxLevel()) {
            const barWidth = Math.min(width - padding * 2, 100);
            const barX = x + Math.floor((width - barWidth) / 2);
            this.drawExpProgressBar(actor, animExp, animLevel, barX, currentY, barWidth);
        }
    };

    Window_VictoryExp.prototype.drawActorBoxBackground = function(actor, x, y, width, height) {
        const context = this.contents.context;

        // Get actor-specific color
        const color = ColorManager.hpColor(actor);

        // Create gradient background
        const gradient = context.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, this.hexToRgba(color, 0.15));
        gradient.addColorStop(0.5, this.hexToRgba(color, 0.05));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.02)');

        context.save();
        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);

        // Draw border
        context.strokeStyle = this.hexToRgba(color, 0.3);
        context.lineWidth = 2;
        context.strokeRect(x + 2, y + 2, width - 4, height - 4);

        // Optional: Draw inner glow
        context.strokeStyle = this.hexToRgba(color, 0.15);
        context.lineWidth = 1;
        context.strokeRect(x + 4, y + 4, width - 8, height - 8);

        context.restore();
    };

    Window_VictoryExp.prototype.drawExpProgressBar = function(actor, currentExp, currentLevel, x, y, width) {
        // Calculate EXP for current animated level
        const levelStartExp = actor.expForLevel(currentLevel);
        const levelEndExp = actor.expForLevel(currentLevel + 1);
        const currentLevelExp = currentExp - levelStartExp;
        const nextLevelExp = levelEndExp - levelStartExp;

        const rate = Math.min(1, currentLevelExp / nextLevelExp);

        const height = 16;
        const context = this.contents.context;

        // Draw background
        context.save();
        context.fillStyle = 'rgba(0, 0, 0, 0.3)';
        context.fillRect(x, y, width, height);

        // Draw progress
        const progressWidth = Math.floor(width * rate);
        const gradient = context.createLinearGradient(x, y, x + progressWidth, y);
        gradient.addColorStop(0, expBarColor1);
        gradient.addColorStop(1, expBarColor2);

        context.fillStyle = gradient;
        context.fillRect(x, y, progressWidth, height);

        // Draw border
        context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        context.lineWidth = 1;
        context.strokeRect(x, y, width, height);
        context.restore();

        // Draw text
        this.contents.fontSize = 14;
        this.changeTextColor('#ffffff');
        const expText = `${currentLevelExp} / ${nextLevelExp}`;
        this.drawText(expText, x, y, width, 'center');
        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_VictoryExp.prototype.hexToRgba = function(hex, alpha) {
        // Handle color codes that might not be hex
        if (!hex || !hex.startsWith('#')) {
            return `rgba(255, 255, 255, ${alpha})`;
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    //=============================================================================
    // Window_VictoryRewards - Items and Gold Display
    //=============================================================================

    function Window_VictoryRewards() {
        this.initialize(...arguments);
    }

    Window_VictoryRewards.prototype = Object.create(Window_Selectable.prototype);
    Window_VictoryRewards.prototype.constructor = Window_VictoryRewards;

    Window_VictoryRewards.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this._rewards = null;
        this._data = [];
    };

    Window_VictoryRewards.prototype.setRewards = function(rewards) {
        this._rewards = rewards;
        this.makeItemList();
        this.refresh();
    };

    Window_VictoryRewards.prototype.makeItemList = function() {
        if (!this._rewards) return;

        this._data = [];

        // Add gold as first entry
        if (this._rewards.gold > 0) {
            this._data.push({ type: 'gold', amount: this._rewards.gold });
        }

        // Add items
        for (const item of this._rewards.items) {
            this._data.push({ type: 'item', item: item });
        }
    };

    Window_VictoryRewards.prototype.maxItems = function() {
        return this._data.length;
    };

    Window_VictoryRewards.prototype.itemHeight = function() {
        return 115; // Match MegaItems height
    };

    Window_VictoryRewards.prototype.maxCols = function() {
        return 2;
    };

    Window_VictoryRewards.prototype.drawAllItems = function() {
        // Draw title first
        this.drawTitle();

        // Then draw items
        const topIndex = this.topIndex();
        const maxItems = this.maxVisibleItems();
        for (let i = 0; i < maxItems; i++) {
            const index = topIndex + i;
            if (index < this.maxItems()) {
                this.drawItemEntry(index);
            }
        }

        // Draw hint text
        this.drawHintText();
    };

    Window_VictoryRewards.prototype.drawTitle = function() {
        const y = 10;
        this.contents.fontSize = 28;
        this.changeTextColor(ColorManager.systemColor());
        const titleText = "REWARDS";
        const titleWidth = this.contents.measureTextWidth(titleText);
        this.drawText(titleText, (this.contents.width - titleWidth) / 2, y, titleWidth);

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_VictoryRewards.prototype.drawHintText = function() {
        const hintText = "Press OK to continue...";
        const y = this.contents.height - 30;
        this.contents.fontSize = 18;
        this.changeTextColor(ColorManager.systemColor());
        const textWidth = this.contents.measureTextWidth(hintText);
        this.drawText(hintText, (this.contents.width - textWidth) / 2, y, textWidth);
        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_VictoryRewards.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        rect.y += 60; // Offset for title
        return rect;
    };

    Window_VictoryRewards.prototype.drawItemEntry = function(index) {
        const entry = this._data[index];
        if (!entry) return;

        const rect = this.itemRect(index);

        if (entry.type === 'gold') {
            this.drawGoldEntry(entry, rect.x, rect.y, rect.width, rect.height);
        } else if (entry.type === 'item') {
            this.drawItemReward(entry.item, rect.x, rect.y, rect.width, rect.height);
        }
    };

    Window_VictoryRewards.prototype.drawGoldEntry = function(entry, x, y, width, height) {
        const padding = 8;

        // Clear area
        this.contents.clearRect(x, y, width, height);

        // Draw gold background
        const context = this.contents.context;
        const gradient = context.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.2)');
        gradient.addColorStop(0.5, 'rgba(255, 215, 0, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0.05)');

        context.save();
        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);

        context.strokeStyle = 'rgba(255, 215, 0, 0.4)';
        context.lineWidth = 2;
        context.strokeRect(x + 2, y + 2, width - 4, height - 4);
        context.restore();

        // Draw gold icon
        this.drawIcon(314, x + padding, y + padding);

        // Draw gold amount
        const textX = x + padding + 40;
        this.contents.fontSize = 24;
        this.changeTextColor('#ffd700');
        const goldText = `${entry.amount} ${TextManager.currencyUnit}`;
        this.drawText(goldText, textX, y + padding, width - textX);

        // Draw description
        this.contents.fontSize = 18;
        this.changeTextColor('#cccccc');
        this.drawText('Gold acquired from battle', textX, y + padding + 32, width - textX - padding);

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_VictoryRewards.prototype.drawItemReward = function(item, x, y, width, height) {
        const padding = 8;

        // Clear area
        this.contents.clearRect(x, y, width, height);

        // Draw item background (similar to MegaItems style)
        this.drawItemBackground(item, x, y, width, height);

        // Draw item icon
        this.drawIcon(item.iconIndex, x + padding, y + padding);

        // Draw item name
        const nameX = x + padding + 40;
        const nameWidth = width - padding * 2 - 40;
        this.changeTextColor(this.getItemTypeColor(item));
        this.contents.fontSize = 22;
        this.drawText(item.name, nameX, y + padding, nameWidth);

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();

        // Draw description - calculate width conservatively
        this.changeTextColor(ColorManager.normalColor());
        const descY = y + padding + 28;
        const descWidth = width - (nameX - x) - padding * 2;

        let description = item.description || '';
        if (!description || description.trim() === '') {
            description = 'No description available.';
        }

        this.drawScaledDescription(description, nameX, descY, descWidth);

        // Type indicator removed - color-coding on name and background is sufficient
    };

    Window_VictoryRewards.prototype.drawScaledDescription = function(description, x, y, maxWidth) {
        if (!description) return;

        const defaultSize = $gameSystem.mainFontSize();
        let fontSize = descriptionFontSize;
        const minFontSize = 8;
        const lineHeight = 24;
        const maxLines = 2;
        const maxHeight = lineHeight * maxLines;

        // Iteratively find the right font size
        let fits = false;
        while (!fits && fontSize >= minFontSize) {
            this.contents.fontSize = fontSize;
            const textWidth = this.contents.measureTextWidth(description);

            const estimatedLines = Math.ceil(textWidth / maxWidth);
            const estimatedHeight = estimatedLines * (fontSize + 4);

            if (estimatedLines <= maxLines && estimatedHeight <= maxHeight) {
                fits = true;
            } else {
                fontSize -= 1;
            }
        }

        this.contents.fontSize = defaultSize;

        // Draw with the calculated font size
        const descText = '\\FS[' + fontSize + ']' + description;
        this.drawTextEx(descText, x, y, maxWidth);
    };

    Window_VictoryRewards.prototype.drawItemBackground = function(item, x, y, width, height) {
        const color = this.getItemTypeColor(item);
        const context = this.contents.context;

        const gradient = context.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, this.hexToRgba(color, 0.15));
        gradient.addColorStop(0.5, this.hexToRgba(color, 0.05));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.02)');

        context.save();
        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);

        // Draw border
        context.strokeStyle = this.hexToRgba(color, 0.3);
        context.lineWidth = 1;
        context.strokeRect(x + 2, y + 2, width - 4, height - 4);
        context.restore();
    };

    Window_VictoryRewards.prototype.drawItemTypeIndicator = function(item, x, y) {
        this.contents.fontSize = 14;

        let typeText = '';
        let typeColor = '#ffffff';

        if (DataManager.isItem(item) && item.itypeId === 2) {
            typeText = '🔑 KEY';
            typeColor = keyItemColor;
        } else if (DataManager.isWeapon(item)) {
            typeText = '⚔️ WEAPON';
            typeColor = weaponColor;
        } else if (DataManager.isArmor(item)) {
            typeText = '🛡️ ARMOR';
            typeColor = armorColor;
        } else if (DataManager.isItem(item)) {
            typeText = '💊 ITEM';
            typeColor = consumableColor;
        }

        this.changeTextColor(typeColor);
        this.drawText(typeText, x, y, 150);

        this.resetTextColor();
        this.contents.fontSize = $gameSystem.mainFontSize();
    };

    Window_VictoryRewards.prototype.getItemTypeColor = function(item) {
        if (DataManager.isItem(item) && item.itypeId === 2) {
            return keyItemColor;
        } else if (DataManager.isWeapon(item)) {
            return weaponColor;
        } else if (DataManager.isArmor(item)) {
            return armorColor;
        } else if (DataManager.isItem(item)) {
            return consumableColor;
        }
        return ColorManager.normalColor();
    };

    Window_VictoryRewards.prototype.hexToRgba = function(hex, alpha) {
        if (!hex || !hex.startsWith('#')) {
            return `rgba(255, 255, 255, ${alpha})`;
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Export to global scope
    window.Window_VictoryExp = Window_VictoryExp;
    window.Window_VictoryRewards = Window_VictoryRewards;

})();
