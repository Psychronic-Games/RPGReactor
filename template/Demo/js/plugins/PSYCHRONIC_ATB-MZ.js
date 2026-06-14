/*:
 * @plugindesc ATB Visual Bar v1.4 - Visual overlay for TPB battles with improved skill icons
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_ATB-MZ.js
 *
 * Adds a visual ATB bar that shows battler turn progress.
 * Works with RPG Maker MZ's built-in "Time Progress (Wait)" battle system.
 *
 * Set your battle system to "Time Progress (Wait)" in the database.
 * Use <atb icon: X> in actor or enemy notes to set a custom icon (X is the icon index from IconSet).
 *
 * @param atbBarImage
 * @text ATB Bar Image
 * @type file
 * @dir img/system/
 * @default atb_bar
 * @desc The image file for the ATB bar (in img/system/).
 *
 * @param barX
 * @text Bar X Position
 * @type number
 * @default 0
 * @desc X position of the ATB bar on the screen.
 *
 * @param barY
 * @text Bar Y Position
 * @type number
 * @default 0
 * @desc Y position of the ATB bar on the screen.
 *
 * @param iconStartX
 * @text Icon Start X
 * @type number
 * @default 32
 * @desc X position where icons start (relative to bar).
 *
 * @param iconStartY
 * @text Icon Start Y
 * @type number
 * @default 16
 * @desc Y position where icons start (relative to bar).
 *
 * @param iconEndX
 * @text Icon End X
 * @type number
 * @default 752
 * @desc X position where icons finish (relative to bar).
 *
 * @param iconEndY
 * @text Icon End Y
 * @type number
 * @default 16
 * @desc Y position where icons finish (relative to bar).
 *
 * @param actionIconX
 * @text Action Icon X
 * @type number
 * @default 400
 * @desc X position where battler icon moves during their action.
 *
 * @param actionIconY
 * @text Action Icon Y
 * @type number
 * @default 16
 * @desc Y position where battler icon moves during their action.
 *
 * @param skillIconX
 * @text Skill/Item Icon X
 * @type number
 * @default 400
 * @desc X position where skill/item icon is displayed during action.
 *
 * @param skillIconY
 * @text Skill/Item Icon Y
 * @type number
 * @default 200
 * @desc Y position where skill/item icon is displayed during action.
 *
 * @param skillNameX
 * @text Skill/Item Name X
 * @type number
 * @default 350
 * @desc X position where skill/item name is displayed during action.
 *
 * @param skillNameY
 * @text Skill/Item Name Y
 * @type number
 * @default 250
 * @desc Y position where skill/item name is displayed during action.
 *
 * @param headOffsetY
 * @text Head Offset Y
 * @type number
 * @default 8
 * @desc Vertical offset (pixels) for the 32x32 head window in !$/$ enemy sprites.
 *
 * @param actorIconBackground
 * @text Actor Icon Background
 * @type file
 * @dir img/system/
 * @default
 * @desc Background image for actor icons (in img/system/). Leave blank for none.
 *
 * @param enemyIconBackground
 * @text Enemy Icon Background
 * @type file
 * @dir img/system/
 * @default
 * @desc Background image for enemy icons (in img/system/). Leave blank for none.
 *
 * @param skipPartyMenu
 * @text Skip Party Command Menu
 * @type boolean
 * @default false
 * @desc If true, skips the party command menu (Fight/Escape) at battle start and proceeds to combat.
 *
 * @param hideBattleLog
 * @text Hide Battle Log
 * @type boolean
 * @default false
 * @desc If true, hides the battle log window during battles.
 *
 * @param showOnlyInTpb
 * @text Show Only in TPB
 * @type boolean
 * @default true
 * @desc Only show the ATB bar during Time Progress battles.
 *
 * @param showSkillIcons
 * @text Show Skill Icons
 * @type boolean
 * @default true
 * @desc Show skill/item icons during actions.
 *
 * @param showSkillNames
 * @text Show Skill Names
 * @type boolean
 * @default true
 * @desc Show skill/item names during actions.
 *
 * @param skillNameFontSize
 * @text Skill Name Font Size
 * @type number
 * @default 24
 * @desc Font size for skill/item names.
 *
 * @param skillNameMaxWidth
 * @text Skill Name Max Width
 * @type number
 * @default 250
 * @desc Maximum width for skill/item names. Text will shrink to fit if too long.
 *
 * @param skillNameAlign
 * @text Skill Name Alignment
 * @type select
 * @option left
 * @option center
 * @option right
 * @default left
 * @desc Text alignment for skill/item names.
 *
 * @param subjectHighlightColor1
 * @text Subject Highlight Color 1
 * @type string
 * @default 100,100,100,0
 * @desc Primary color for current subject highlight (R,G,B,Gray format).
 *
 * @param subjectHighlightColor2
 * @text Subject Highlight Color 2
 * @type string
 * @default 150,150,150,0
 * @desc Secondary color for current subject highlight pulse (R,G,B,Gray format).
 *
 * @param targetHighlightColor1
 * @text Target Highlight Color 1
 * @type string
 * @default 0,100,200,0
 * @desc Primary color for selected target highlight (R,G,B,Gray format).
 *
 * @param targetHighlightColor2
 * @text Target Highlight Color 2
 * @type string
 * @default 50,150,255,0
 * @desc Secondary color for selected target highlight pulse (R,G,B,Gray format).
 *
 * @param pulseDuration
 * @text Pulse Duration
 * @type number
 * @default 60
 * @desc Duration of highlight pulse cycle in frames (60 = 1 second).
 *
 * @param enableDebug
 * @text Enable Debug
 * @type boolean
 * @default false
 * @desc Enable console debug messages for troubleshooting.
 */

(function() {
    'use strict';

    // Plugin parameters
    const parameters = PluginManager.parameters('PSYCHRONIC_ATB-MZ');
    const atbBarImage = String(parameters['atbBarImage'] || 'atb_bar');
    const barX = Number(parameters['barX'] || 0);
    const barY = Number(parameters['barY'] || 0);
    const iconStartX = Number(parameters['iconStartX'] || 32);
    const iconStartY = Number(parameters['iconStartY'] || 16);
    const iconEndX = Number(parameters['iconEndX'] || 752);
    const iconEndY = Number(parameters['iconEndY'] || 16);
    const actionIconX = Number(parameters['actionIconX'] || 400);
    const actionIconY = Number(parameters['actionIconY'] || 16);
    const skillIconX = Number(parameters['skillIconX'] || 400);
    const skillIconY = Number(parameters['skillIconY'] || 200);
    const skillNameX = Number(parameters['skillNameX'] || 350);
    const skillNameY = Number(parameters['skillNameY'] || 250);
    const headOffsetY = Number(parameters['headOffsetY'] || 8);
    const actorIconBackground = String(parameters['actorIconBackground'] || '');
    const enemyIconBackground = String(parameters['enemyIconBackground'] || '');
    const skipPartyMenu = String(parameters['skipPartyMenu'] || 'false') === 'true';
    const hideBattleLog = String(parameters['hideBattleLog'] || 'false') === 'true';
    const showOnlyInTpb = String(parameters['showOnlyInTpb'] || 'true') === 'true';
    const showSkillIcons = String(parameters['showSkillIcons'] || 'true') === 'true';
    const showSkillNames = String(parameters['showSkillNames'] || 'true') === 'true';
    const skillNameFontSize = Number(parameters['skillNameFontSize'] || 24);
    const skillNameMaxWidth = Number(parameters['skillNameMaxWidth'] || 250);
    const skillNameAlign = String(parameters['skillNameAlign'] || 'left');
    const subjectHighlightColor1 = String(parameters['subjectHighlightColor1'] || '100,100,100,0').split(',').map(n => Number(n.trim()));
    const subjectHighlightColor2 = String(parameters['subjectHighlightColor2'] || '150,150,150,0').split(',').map(n => Number(n.trim()));
    const targetHighlightColor1 = String(parameters['targetHighlightColor1'] || '0,100,200,0').split(',').map(n => Number(n.trim()));
    const targetHighlightColor2 = String(parameters['targetHighlightColor2'] || '50,150,255,0').split(',').map(n => Number(n.trim()));
    const pulseDuration = Number(parameters['pulseDuration'] || 60);
    const enableDebug = String(parameters['enableDebug'] || 'false') === 'true';

    const travelDistanceX = iconEndX - iconStartX;
    const travelDistanceY = iconEndY - iconStartY;

    // Debug logging function
    function debugLog(message) {
        if (enableDebug) {
            console.log('[ATB Plugin] ' + message);
        }
    }

    // Color interpolation function for pulsing effects
    function interpolateColors(color1, color2, factor) {
        const result = [];
        for (let i = 0; i < 4; i++) {
            result[i] = Math.round(color1[i] + (color2[i] - color1[i]) * factor);
        }
        return result;
    }

    // Get pulsing color based on frame count
    function getPulsingColor(color1, color2, frameCount, duration) {
        const cycle = frameCount % duration;
        const factor = (Math.sin((cycle / duration) * Math.PI * 2) + 1) / 2; // Smooth sine wave between 0-1
        return interpolateColors(color1, color2, factor);
    }

    // ATB Bar Window - purely visual, doesn't affect game logic
    function Window_ATBBar() {
        this.initialize.apply(this, arguments);
    }

    Window_ATBBar.prototype = Object.create(Window_Base.prototype);
    Window_ATBBar.prototype.constructor = Window_ATBBar;

    Window_ATBBar.prototype.initialize = function() {
        const rect = new Rectangle(barX, barY, 816, 64);
        Window_Base.prototype.initialize.call(this, rect);
        this._battlers = [];
        this._sprites = {};
        this._backgroundSprites = {};
        this._skillIconSprite = null;
        this._skillNameSprite = null;
        this._skillNameIconSprite = null; // New sprite for icons in skill names
        this._currentSubject = null;
        this._currentActionKey = null; // Track specific actions instead of just subjects
        this._storedActionData = null; // Store action data before it gets cleared
        this._selectedTarget = null; // Track currently selected target for highlighting
        this._selectedTargets = []; // Track multiple selected targets for highlighting
        this._originalZValues = {}; // Store original z-index values for sprites
        this._lastActionCheck = 0;
        this.opacity = 0;
        this.frameVisible = false;
        this.padding = 0;
        this.loadBarImage();

        debugLog('ATB Bar initialized');
        debugLog('Skill icon position: ' + skillIconX + ', ' + skillIconY);
        debugLog('Skill name position: ' + skillNameX + ', ' + skillNameY);
        debugLog('Show skill icons: ' + showSkillIcons);
        debugLog('Show skill names: ' + showSkillNames);
        debugLog('Skill name font size: ' + skillNameFontSize);
        debugLog('Skill name max width: ' + skillNameMaxWidth);
        debugLog('Skill name alignment: ' + skillNameAlign);
        debugLog('Subject highlight colors: [' + subjectHighlightColor1 + '] <-> [' + subjectHighlightColor2 + ']');
        debugLog('Target highlight colors: [' + targetHighlightColor1 + '] <-> [' + targetHighlightColor2 + ']');
        debugLog('Pulse duration: ' + pulseDuration + ' frames');
    };

    Window_ATBBar.prototype.loadBarImage = function() {
        this._barBitmap = ImageManager.loadSystem(atbBarImage);
        this._barBitmap.addLoadListener(() => {
            this.adjustWindowSize();
            this.refresh();
        });
    };

    Window_ATBBar.prototype.adjustWindowSize = function() {
        if (!this._barBitmap || !this._barBitmap.isReady()) return;
        this.move(barX, barY, this._barBitmap.width, this._barBitmap.height);
        if (this.contents) this.contents.destroy();
        this.contents = new Bitmap(this._barBitmap.width, this._barBitmap.height);
    };

    Window_ATBBar.prototype.shouldShow = function() {
        if (!showOnlyInTpb) return true;
        return BattleManager.isTpb();
    };

    Window_ATBBar.prototype.createBattlerSprites = function() {
        if (!this.shouldShow()) return;

        // Clear existing sprites
        this.clearAllSprites();

        // Create new sprites for all battlers (alive and dead, we'll handle visibility in updateSpritePosition)
        this._battlers = $gameParty.battleMembers().concat($gameTroop.aliveMembers().concat($gameTroop.deadMembers()));

        for (let battler of this._battlers) {
            if (!battler) continue;

            const sprite = new Sprite();
            sprite._battler = battler;
            sprite._battlerId = battler.isActor() ? 'actor_' + battler.actorId() : 'enemy_' + battler.index();

            // Create background sprite
            const bgSprite = new Sprite();
            bgSprite._battler = battler;
            bgSprite._battlerId = sprite._battlerId;
            this.loadBackgroundIcon(battler, bgSprite);
            this._backgroundSprites[sprite._battlerId] = bgSprite;
            this.addChild(bgSprite);

            this.loadBattlerIcon(battler, sprite);
            this._sprites[sprite._battlerId] = sprite;
            this.addChild(sprite);

            // Store original z-index values (based on progress for natural layering)
            const progress = battler.tpbChargeTime();
            const baseZIndex = Math.floor(progress * 100); // 0-100 based on progress
            sprite.z = baseZIndex;
            bgSprite.z = baseZIndex - 1;

            this._originalZValues[sprite._battlerId] = {
                sprite: baseZIndex,
                background: baseZIndex - 1
            };

            // If battler was just revived, reset their TPB charge to 0
            if (battler.isAlive() && battler.tpbChargeTime() === 1) {
                battler._tpbChargeTime = 0;
                debugLog('Reset TPB charge for revived battler: ' + battler.name());
            }

            this.updateSpritePosition(sprite);
        }

        // Create skill display sprites
        this.createSkillSprites();

        debugLog('Created battler sprites for ' + this._battlers.length + ' battlers');
    };

    Window_ATBBar.prototype.clearAllSprites = function() {
        // Clear existing sprites
        for (let id in this._sprites) {
            const sprite = this._sprites[id];
            if (sprite && sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
        }
        this._sprites = {};

        // Clear existing background sprites
        for (let id in this._backgroundSprites) {
            const sprite = this._backgroundSprites[id];
            if (sprite && sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
        }
        this._backgroundSprites = {};

        // Clear original z-values tracking
        this._originalZValues = {};

        // Clear skill sprites
        if (this._skillIconSprite && this._skillIconSprite.parent) {
            this._skillIconSprite.parent.removeChild(this._skillIconSprite);
            this._skillIconSprite = null;
        }

        if (this._skillNameSprite && this._skillNameSprite.parent) {
            this._skillNameSprite.parent.removeChild(this._skillNameSprite);
            this._skillNameSprite = null;
        }

        if (this._skillNameIconSprite && this._skillNameIconSprite.parent) {
            this._skillNameIconSprite.parent.removeChild(this._skillNameIconSprite);
            this._skillNameIconSprite = null;
        }
    };

    Window_ATBBar.prototype.createSkillSprites = function() {
        debugLog('Creating skill sprites...');

        // Create skill icon sprite
        if (showSkillIcons) {
            this._skillIconSprite = new Sprite();
            this._skillIconSprite.x = skillIconX;
            this._skillIconSprite.y = skillIconY;
            this._skillIconSprite.visible = false;
            this._skillIconSprite.z = 1000; // High z-index to ensure visibility
            this.addChild(this._skillIconSprite);
            debugLog('Skill icon sprite created at ' + skillIconX + ', ' + skillIconY);
        }

        // Create skill name sprite
        if (showSkillNames) {
            this._skillNameSprite = new Sprite();
            this._skillNameSprite.x = skillNameX;
            this._skillNameSprite.y = skillNameY;
            this._skillNameSprite.visible = false;
            this._skillNameSprite.z = 1000; // High z-index to ensure visibility
            this.addChild(this._skillNameSprite);
            debugLog('Skill name sprite created at ' + skillNameX + ', ' + skillNameY);

            // Create skill name icon sprite (for icons within skill names)
            this._skillNameIconSprite = new Sprite();
            this._skillNameIconSprite.visible = false;
            this._skillNameIconSprite.z = 1001; // Slightly higher than name sprite
            this.addChild(this._skillNameIconSprite);
            debugLog('Skill name icon sprite created');
        }
    };

    Window_ATBBar.prototype.showSkillInfo = function(item) {
        if (!item) {
            debugLog('showSkillInfo called with no item');
            return;
        }

        debugLog('Showing skill info for: ' + item.name + ' (icon: ' + item.iconIndex + ')');

        // Show skill icon
        if (showSkillIcons && this._skillIconSprite) {
            let iconIndex = item.iconIndex || 0;

            // Fallback for basic attacks which might not have an icon
            if (iconIndex === 0 && (item.name === 'Attack' || item.id === 1)) {
                iconIndex = 76; // Default sword icon for attacks
                debugLog('Using fallback attack icon: ' + iconIndex);
            }

            const bitmap = ImageManager.loadSystem('IconSet');

            this._skillIconSprite.bitmap = bitmap;
            const pw = 32, ph = 32;
            const sx = (iconIndex % 16) * pw;
            const sy = Math.floor(iconIndex / 16) * ph;
            this._skillIconSprite.setFrame(sx, sy, pw, ph);

            // Ensure proper positioning relative to the window
            this._skillIconSprite.x = skillIconX;
            this._skillIconSprite.y = skillIconY;
            this._skillIconSprite.visible = true;
            this._skillIconSprite.opacity = 255;

            debugLog('Skill icon displayed at: ' + this._skillIconSprite.x + ', ' + this._skillIconSprite.y + ' with icon: ' + iconIndex);
        }

        // Show skill name (with icon parsing)
        if (showSkillNames && this._skillNameSprite) {
            if (this._skillNameSprite.bitmap) {
                this._skillNameSprite.bitmap.destroy();
            }

            // Parse skill name for icon codes - try multiple patterns
            let skillName = item.name;
            let nameIcon = null;
            let iconAtStart = false;

            debugLog('Original skill name: "' + skillName + '"');

            // Try different regex patterns to catch various formats
            let iconMatch = skillName.match(/\\i\[(\d+)\]/i); // Standard format
            if (!iconMatch) {
                iconMatch = skillName.match(/\\\i\[(\d+)\]/i); // Double backslash
            }
            if (!iconMatch) {
                iconMatch = skillName.match(/\\\\i\[(\d+)\]/i); // Escaped backslashes
            }
            if (!iconMatch) {
                iconMatch = skillName.match(/\[(\d+)\]/); // Just [number] format
            }

            if (iconMatch) {
                nameIcon = parseInt(iconMatch[1], 10);
                const iconIndex = skillName.indexOf(iconMatch[0]);
                iconAtStart = iconIndex <= 2; // Icon is at or near the beginning

                // Remove the icon code with various patterns
                skillName = skillName.replace(/\\i\[\d+\]/gi, '');
                skillName = skillName.replace(/\\\i\[\d+\]/gi, '');
                skillName = skillName.replace(/\\\\i\[\d+\]/gi, '');
                skillName = skillName.replace(/\[\d+\]/g, '');
                skillName = skillName.trim();
                debugLog('Found icon code: ' + nameIcon + ', at start: ' + iconAtStart + ', cleaned name: "' + skillName + '"');
            } else {
                debugLog('No icon code found in skill name: "' + skillName + '"');
            }

            // Calculate optimal font size to fit within max width
            let finalFontSize = skillNameFontSize;
            let textWidth = 0;

            // Use a more reliable method to measure text width
            if (skillName.length > 0) {
                // Estimate width first (rough calculation)
                let estimatedWidth = skillName.length * (skillNameFontSize * 0.6); // Rough estimation

                // If estimated width exceeds max, calculate precise scaling
                if (estimatedWidth > skillNameMaxWidth) {
                    finalFontSize = Math.max(8, Math.floor(skillNameMaxWidth / (skillName.length * 0.6)));
                    debugLog('Estimated width (' + estimatedWidth + ') exceeds max (' + skillNameMaxWidth + '), scaling to font size: ' + finalFontSize);
                }

                // Create test bitmap to measure actual width with final font size
                const testBitmap = new Bitmap(skillNameMaxWidth + 100, 50);
                testBitmap.fontSize = finalFontSize;
                testBitmap.outlineWidth = 4;
                textWidth = testBitmap.measureTextWidth(skillName);
                testBitmap.destroy();

                // Fine-tune if still too wide
                while (textWidth > skillNameMaxWidth && finalFontSize > 8) {
                    finalFontSize--;
                    const fineBitmap = new Bitmap(skillNameMaxWidth + 100, 50);
                    fineBitmap.fontSize = finalFontSize;
                    fineBitmap.outlineWidth = 4;
                    textWidth = fineBitmap.measureTextWidth(skillName);
                    fineBitmap.destroy();
                }
            }

            debugLog('Final font size: ' + finalFontSize + ', text width: ' + textWidth + ', max width: ' + skillNameMaxWidth);

            // Create final text bitmap with calculated font size
            const bitmap = new Bitmap(skillNameMaxWidth + 50, 50);
            bitmap.fontSize = finalFontSize;
            bitmap.textColor = '#ffffff';
            bitmap.outlineColor = '#000000';
            bitmap.outlineWidth = 4;

            // Draw text with specified alignment
            bitmap.drawText(skillName, 0, 0, skillNameMaxWidth, 50, skillNameAlign);

            this._skillNameSprite.bitmap = bitmap;
            this._skillNameSprite.x = skillNameX;
            this._skillNameSprite.y = skillNameY;
            this._skillNameSprite.visible = true;
            this._skillNameSprite.opacity = 255;

            // Show icon from skill name if found
            if (nameIcon !== null && this._skillNameIconSprite) {
                const iconBitmap = ImageManager.loadSystem('IconSet');
                this._skillNameIconSprite.bitmap = iconBitmap;

                const pw = 32, ph = 32;
                const sx = (nameIcon % 16) * pw;
                const sy = Math.floor(nameIcon / 16) * ph;
                this._skillNameIconSprite.setFrame(sx, sy, pw, ph);

                // Position icon based on where it appeared in original text and alignment
                let iconX = skillNameX;

                if (iconAtStart) {
                    // Icon at start: place before text area
                    iconX = skillNameX - 36; // 32px icon + 4px spacing
                } else {
                    // Icon at end: position based on alignment
                    if (skillNameAlign === 'center') {
                        iconX = skillNameX + (skillNameMaxWidth / 2) + (textWidth / 2) + 4;
                    } else if (skillNameAlign === 'right') {
                        iconX = skillNameX + skillNameMaxWidth + 4;
                    } else { // left alignment
                        iconX = skillNameX + textWidth + 4;
                    }
                }

                this._skillNameIconSprite.x = iconX;
                this._skillNameIconSprite.y = skillNameY + (50 - 32) / 2; // Center vertically
                this._skillNameIconSprite.visible = true;
                this._skillNameIconSprite.opacity = 255;

                debugLog('Skill name icon displayed: ' + nameIcon + ' at ' + this._skillNameIconSprite.x + ', ' + this._skillNameIconSprite.y + ' (at start: ' + iconAtStart + ', align: ' + skillNameAlign + ')');
            } else if (this._skillNameIconSprite) {
                this._skillNameIconSprite.visible = false;
            }

            debugLog('Skill name displayed: "' + skillName + '" at ' + this._skillNameSprite.x + ', ' + this._skillNameSprite.y + ', font size: ' + finalFontSize + ', alignment: ' + skillNameAlign);
        }
    };

    Window_ATBBar.prototype.hideSkillInfo = function() {
        debugLog('Hiding skill info');

        if (this._skillIconSprite) {
            this._skillIconSprite.visible = false;
        }

        if (this._skillNameSprite) {
            this._skillNameSprite.visible = false;
            if (this._skillNameSprite.bitmap) {
                this._skillNameSprite.bitmap.destroy();
                this._skillNameSprite.bitmap = null;
            }
        }

        if (this._skillNameIconSprite) {
            this._skillNameIconSprite.visible = false;
        }
    };

    Window_ATBBar.prototype.loadBattlerIcon = function(battler, sprite) {
        // Check for custom ATB icon in note tag
        let iconIndex = null;
        const note = battler.isActor() ? $dataActors[battler.actorId()].note : $dataEnemies[battler.enemyId()].note;
        const match = note.match(/<atb icon:\s*(\d+)>/i);
        if (match) {
            iconIndex = parseInt(match[1], 10);
        }

        if (iconIndex !== null) {
            // Use custom icon from note tag
            this.loadFallbackIcon(sprite, iconIndex);
        } else if (battler.isActor()) {
            if (battler._faceName) {
                const bitmap = ImageManager.loadFace(battler._faceName);
                bitmap.addLoadListener(() => {
                    sprite.bitmap = bitmap;
                    const fw = 144, fh = 144;
                    const sx = (battler._faceIndex % 4) * fw;
                    const sy = Math.floor(battler._faceIndex / 4) * fh;
                    sprite.setFrame(sx, sy, fw, fh);
                    sprite.scale.set(32 / fw, 32 / fh);
                });
            } else {
                this.loadFallbackIcon(sprite, 84); // Default actor icon
            }
        } else {
            // Try loading enemy sprite from sv_enemies, enemies, or characters folder
            const enemy = $dataEnemies[battler.enemyId()];
            if (enemy && enemy.battlerName) {
                // First try sv_enemies
                let bitmap = ImageManager.loadSvEnemy(enemy.battlerName);
                bitmap.addLoadListener(() => {
                    if (bitmap.width > 0 && bitmap.height > 0) {
                        // sv_enemies sprite found
                        this.setEnemySpriteFrame(sprite, bitmap, enemy.battlerName);
                    } else {
                        // Try enemies folder
                        bitmap = ImageManager.loadEnemy(enemy.battlerName);
                        bitmap.addLoadListener(() => {
                            if (bitmap.width > 0 && bitmap.height > 0) {
                                // enemies sprite found
                                this.setEnemySpriteFrame(sprite, bitmap, enemy.battlerName);
                            } else {
                                // Try characters folder for walking sprites
                                bitmap = ImageManager.loadCharacter(enemy.battlerName);
                                bitmap.addLoadListener(() => {
                                    if (bitmap.width > 0 && bitmap.height > 0) {
                                        // character sprite found
                                        this.setEnemySpriteFrame(sprite, bitmap, enemy.battlerName);
                                    } else {
                                        // Fallback to default icon
                                        this.loadFallbackIcon(sprite, 1);
                                    }
                                });
                            }
                        });
                    }
                });
            } else {
                this.loadFallbackIcon(sprite, 1); // Fallback if no battler sprite
            }
        }
    };

    Window_ATBBar.prototype.loadBackgroundIcon = function(battler, sprite) {
        const imageName = battler.isActor() ? actorIconBackground : enemyIconBackground;
        if (!imageName) {
            sprite.visible = false;
            return;
        }
        const bitmap = ImageManager.loadSystem(imageName);
        bitmap.addLoadListener(() => {
            sprite.bitmap = bitmap;
            sprite.setFrame(0, 0, bitmap.width, bitmap.height);
            sprite.visible = true;
        });
    };

    Window_ATBBar.prototype.setEnemySpriteFrame = function(sprite, bitmap, battlerName) {
        sprite.bitmap = bitmap;
        const isSingleCharacter = battlerName.startsWith('!$') || battlerName.startsWith('$');

        if (isSingleCharacter) {
            // Standard RPG Maker MZ character sprite sheet: 4 rows (directions), 3 columns (frames)
            const frameWidth = bitmap.width / 3; // 3 frames per row
            const frameHeight = bitmap.height / 4; // 4 directions (down, left, right, up)
// Center-down frame: middle frame (index 1) of top row (down direction)
const sx = frameWidth; // Middle frame (1 * frameWidth)
const sy = 0; // Top row (down direction)
// Calculate 32x32 window centered on the head (upper part of frame)
const headCenterX = sx + frameWidth / 2;
const headCenterY = sy + frameHeight / 4 + headOffsetY; // Adjustable offset for head
const windowX = Math.max(0, headCenterX - 16); // Center 32x32 window on head
const windowY = Math.max(0, headCenterY - 16);
sprite.setFrame(windowX, windowY, 32, 32);
sprite.scale.set(1, 1); // No scaling, using native 32x32 window
        } else {
            // Use full sprite (scaled to 32x32)
            const fw = bitmap.width, fh = bitmap.height;
            sprite.setFrame(0, 0, fw, fh);
            sprite.scale.set(32 / fw, 32 / fh);
        }
    };

    Window_ATBBar.prototype.loadFallbackIcon = function(sprite, iconIndex) {
        const bitmap = ImageManager.loadSystem('IconSet');
        bitmap.addLoadListener(() => {
            sprite.bitmap = bitmap;
            const pw = 32, ph = 32;
            const sx = (iconIndex % 16) * pw;
            const sy = Math.floor(iconIndex / 16) * ph;
            sprite.setFrame(sx, sy, pw, ph);
        });
    };

    Window_ATBBar.prototype.setHighlightZIndex = function(battlerId, highlighted) {
        const sprite = this._sprites[battlerId];
        const bgSprite = this._backgroundSprites[battlerId];

        if (!sprite || !this._originalZValues[battlerId]) return;

        if (highlighted) {
            // Move to top layer - background first, then main sprite
            if (bgSprite) {
                bgSprite.z = 1000; // Background at high z but lower than main sprite
                if (bgSprite.parent) {
                    const bgParent = bgSprite.parent;
                    bgParent.removeChild(bgSprite);
                    bgParent.addChild(bgSprite);
                }
            }

            sprite.z = 1001; // Main sprite above background
            if (sprite.parent) {
                const parent = sprite.parent;
                parent.removeChild(sprite);
                parent.addChild(sprite); // Add after background to ensure it's on top
            }

            debugLog('Set highlight z-index for ' + battlerId + ' - bg: 1000, sprite: 1001');
        } else {
            // Restore original z-values and positions
            sprite.z = this._originalZValues[battlerId].sprite;
            if (bgSprite) {
                bgSprite.z = this._originalZValues[battlerId].background;
            }

            // Force restoration by rebuilding sprite order based on z-index
            this.restoreSpriteOrder(battlerId);

            debugLog('Restored original z-index for ' + battlerId + ' - bg: ' +
            (bgSprite ? bgSprite.z : 'none') + ', sprite: ' + sprite.z);
        }
    };

    Window_ATBBar.prototype.restoreSpriteOrder = function(battlerId) {
        const sprite = this._sprites[battlerId];
        const bgSprite = this._backgroundSprites[battlerId];

        if (!sprite) return;

        // Remove and re-add sprites in proper order based on their z-values
        if (bgSprite && bgSprite.parent) {
            const bgParent = bgSprite.parent;
            bgParent.removeChild(bgSprite);

            // Find correct insertion point based on z-index
            let insertIndex = 0;
            for (let i = 0; i < bgParent.children.length; i++) {
                if (bgParent.children[i].z > bgSprite.z) {
                    insertIndex = i;
                    break;
                }
                insertIndex = i + 1;
            }
            bgParent.addChildAt(bgSprite, insertIndex);
        }

        if (sprite.parent) {
            const parent = sprite.parent;
            parent.removeChild(sprite);

            // Find correct insertion point based on z-index
            let insertIndex = 0;
            for (let i = 0; i < parent.children.length; i++) {
                if (parent.children[i].z > sprite.z) {
                    insertIndex = i;
                    break;
                }
                insertIndex = i + 1;
            }
            parent.addChildAt(sprite, insertIndex);
        }
    };

    Window_ATBBar.prototype.updateSpritePosition = function(sprite) {
        if (!sprite._battler) {
            sprite.visible = false;
            const bgSprite = this._backgroundSprites[sprite._battlerId];
            if (bgSprite) bgSprite.visible = false;
            return;
        }

        if (!sprite._battler.isAlive()) {
            // Hide dead battler sprites
            sprite.visible = false;
            const bgSprite = this._backgroundSprites[sprite._battlerId];
            if (bgSprite) bgSprite.visible = false;
            // Restore normal z-index for dead battlers
            this.setHighlightZIndex(sprite._battlerId, false);
            debugLog('Hiding dead battler: ' + sprite._battler.name());
            return;
        }

        // Show alive battler sprites
        const isActing = sprite._battler === BattleManager._subject &&
        (BattleManager._phase === "action" || BattleManager._phase === "turn");
        const isSelected = sprite._battler === this._selectedTarget;
        const isSubject = sprite._battler === BattleManager._subject;

        // Determine if this sprite should be highlighted (and thus on top layer)
        const isSelectedTarget = this._selectedTargets.includes(sprite._battler);
        const shouldHighlight = isSubject || isSelectedTarget;

        if (isActing) {
            // Move to action position
            sprite.x = actionIconX;
            sprite.y = actionIconY;
            sprite.visible = true;

            // Use pulsing subject highlight during action
            const pulsingColor = getPulsingColor(subjectHighlightColor1, subjectHighlightColor2, Graphics.frameCount, pulseDuration);
            sprite.setColorTone(pulsingColor);
        } else {
            // Normal TPB position
            const progress = sprite._battler.tpbChargeTime();
            sprite.x = iconStartX + (progress * travelDistanceX);
            sprite.y = iconStartY + (progress * travelDistanceY);
            sprite.visible = true;

            // Apply appropriate color tone based on state with pulsing effects
            if (isSubject) {
                // Current subject gets pulsing highlight
                const pulsingColor = getPulsingColor(subjectHighlightColor1, subjectHighlightColor2, Graphics.frameCount, pulseDuration);
                sprite.setColorTone(pulsingColor);
            } else if (isSelectedTarget) {
                // Selected target gets pulsing target highlight
                const pulsingColor = getPulsingColor(targetHighlightColor1, targetHighlightColor2, Graphics.frameCount, pulseDuration);
                sprite.setColorTone(pulsingColor);
            } else {
                // Normal battlers have no highlight
                sprite.setColorTone([0, 0, 0, 0]);
            }
        }

        // Update z-index based on highlight status
        this.setHighlightZIndex(sprite._battlerId, shouldHighlight);

        // Update background sprite position (center-aligned with main icon)
        const bgSprite = this._backgroundSprites[sprite._battlerId];
        if (bgSprite && bgSprite.bitmap) {
            const bgWidth = bgSprite.bitmap.width;
            const bgHeight = bgSprite.bitmap.height;
            bgSprite.x = sprite.x - (bgWidth - 32) / 2; // Center background horizontally
            bgSprite.y = sprite.y - (bgHeight - 32) / 2; // Center background vertically
            bgSprite.visible = sprite.visible;
            bgSprite.setColorTone(sprite.getColorTone());
        }
    };

    Window_ATBBar.prototype.setSelectedTarget = function(target) {
        // For single target selection, convert to array format
        this.setSelectedTargets(target ? [target] : []);
    };

    Window_ATBBar.prototype.setSelectedTargets = function(targets) {
        // Clear previous target highlights
        for (let oldTarget of this._selectedTargets) {
            const oldId = oldTarget.isActor() ? 'actor_' + oldTarget.actorId() : 'enemy_' + oldTarget.index();
            this.setHighlightZIndex(oldId, false);
            debugLog('Clearing highlight for: ' + oldId);
        }

        // Set new targets
        this._selectedTargets = targets || [];
        this._selectedTarget = this._selectedTargets.length > 0 ? this._selectedTargets[0] : null; // Keep backwards compatibility

        // Set new target highlights
        for (let target of this._selectedTargets) {
            const newId = target.isActor() ? 'actor_' + target.actorId() : 'enemy_' + target.index();
            debugLog('Setting highlight for: ' + newId + ' (' + target.name() + ')');
            debugLog('Available sprites: ' + Object.keys(this._sprites).join(', '));

            if (this._sprites[newId]) {
                this.setHighlightZIndex(newId, true);
                debugLog('Successfully highlighted: ' + newId);
            } else {
                debugLog('ERROR: Sprite not found for: ' + newId);
            }
        }

        debugLog('Selected targets changed to: ' + this._selectedTargets.map(t => t.name()).join(', '));
    };

    Window_ATBBar.prototype.clearSelectedTarget = function() {
        this.setSelectedTargets([]);
    };

    Window_ATBBar.prototype.updateItemTargets = function() {
        const scene = SceneManager._scene;
        if (!scene) return;

        let targets = [];
        let item = null;

        // Check if we have a selected item from the item window
        if (scene._itemWindow && scene._itemWindow.item()) {
            item = scene._itemWindow.item();
        }

        if (!item) {
            this.clearSelectedTarget();
            return;
        }

        // Create action to analyze item scope
        const action = new Game_Action(BattleManager.actor());
        action.setItem(item.id);

        debugLog('Analyzing item: ' + item.name + ', scope: ' + item.scope + ', isForOpponent: ' + action.isForOpponent() + ', isForFriend: ' + action.isForFriend() + ', isForAll: ' + action.isForAll());

        // Determine targets based on current active window and item scope
        if (scene._enemyWindow && scene._enemyWindow.active && scene._enemyWindow.visible) {
            // We're in enemy selection mode
            if (action.isForOpponent()) {
                if (action.isForAll()) {
                    // Target all enemies
                    targets = $gameTroop.aliveMembers();
                    debugLog('Item targets all enemies: ' + targets.length + ' enemies');
                } else {
                    // Target selected enemy
                    const enemy = scene._enemyWindow.enemy();
                    if (enemy) {
                        targets = [enemy];
                        debugLog('Item targets single enemy: ' + enemy.name());
                    }
                }
            }
        } else if (scene._actorWindow && scene._actorWindow.active && scene._actorWindow.visible) {
            // We're in actor selection mode
            if (action.isForFriend()) {
                if (action.isForAll()) {
                    // Target all allies
                    targets = $gameParty.aliveMembers();
                    debugLog('Item targets all allies: ' + targets.length + ' allies');
                } else {
                    // Target selected ally
                    const actor = scene._actorWindow.actor();
                    if (actor) {
                        targets = [actor];
                        debugLog('Item targets single ally: ' + actor.name());
                    }
                }
            }
        }

        // Set the targets
        this.setSelectedTargets(targets);
    };

    Window_ATBBar.prototype.update = function() {
        Window_Base.prototype.update.call(this);

        // MODIFIED: Also hide during victory phase
        if (!this.shouldShow() || BattleManager.isBattleEnd() || BattleManager._phase === "victory") {
            this.visible = false;
            this.hideSkillInfo();
            return;
        }

        this.visible = true;

        // Check for battler state changes (death/revival) every 10 frames
        if (Graphics.frameCount % 10 === 0) {
            this.checkBattlerStateChanges();
        }

        // Update z-indexes based on progress every 30 frames for performance
        if (Graphics.frameCount % 30 === 0) {
            this.updateProgressBasedZIndex();
        }

        // Update all sprite positions based on current TPB values
        for (let battler of this._battlers) {
            if (!battler) continue;
            const id = battler.isActor() ? 'actor_' + battler.actorId() : 'enemy_' + battler.index();
            const sprite = this._sprites[id];
            if (sprite) this.updateSpritePosition(sprite);
        }

        // Check for action changes more frequently during action phases
        const isActionPhase = BattleManager._phase === "action" ||
        BattleManager._phase === "turn" ||
        BattleManager._phase === "actionStart" ||
        BattleManager._action !== null;

        // Update skill display more frequently during actions, less frequently otherwise
        const updateInterval = isActionPhase ? 1 : 5;
        if (Graphics.frameCount % updateInterval === 0) {
            this.updateSkillDisplay();
        }

        // Remove automatic item target updates - only do them when explicitly needed
    };

    Window_ATBBar.prototype.checkBattlerStateChanges = function() {
        const currentBattlers = $gameParty.battleMembers().concat($gameTroop.aliveMembers().concat($gameTroop.deadMembers()));
        let needsRefresh = false;

        // Check if any battlers have been revived
        for (let battler of currentBattlers) {
            if (!battler) continue;
            const id = battler.isActor() ? 'actor_' + battler.actorId() : 'enemy_' + battler.index();

            // If battler is alive but we don't have a sprite, or sprite is not visible when it should be
            if (battler.isAlive() && (!this._sprites[id] || !this._sprites[id].visible)) {
                debugLog('Detected revival/new battler: ' + battler.name() + ', refreshing sprites');
                needsRefresh = true;
                break;
            }
        }

        if (needsRefresh) {
            this.createBattlerSprites();
        }
    };

    Window_ATBBar.prototype.updateProgressBasedZIndex = function() {
        // Update z-indexes based on current TPB progress for natural layering
        for (let battlerId in this._sprites) {
            const sprite = this._sprites[battlerId];
            const bgSprite = this._backgroundSprites[battlerId];

            if (sprite && sprite._battler && sprite._battler.isAlive()) {
                const progress = sprite._battler.tpbChargeTime();
                const baseZIndex = Math.floor(progress * 100); // 0-100 based on progress

                // Only update if not currently highlighted
                const isHighlighted = sprite._battler === BattleManager._subject || sprite._battler === this._selectedTarget;

                if (!isHighlighted) {
                    sprite.z = baseZIndex;
                    if (bgSprite) bgSprite.z = baseZIndex - 1;

                    // Update stored original values
                    this._originalZValues[battlerId] = {
                        sprite: baseZIndex,
 background: baseZIndex - 1
                    };
                }
            }
        }
    };

    Window_ATBBar.prototype.updateSkillDisplay = function() {
        const currentSubject = BattleManager._subject;

        // More comprehensive phase checking
        const isActionPhase = BattleManager._phase === "action" ||
        BattleManager._phase === "turn" ||
        BattleManager._phase === "actionStart" ||
        BattleManager._action !== null;

        debugLog('Update check - Subject: ' + (currentSubject ? currentSubject.name() : 'none') +
        ', Phase: ' + BattleManager._phase +
        ', Action Phase: ' + isActionPhase +
        ', Stored Action: ' + (this._storedActionData ? this._storedActionData.name : 'none'));

        // If we're in an action phase and have a subject, show the stored action
        if (currentSubject && isActionPhase && this._storedActionData) {
            const actionKey = currentSubject.name() + '_' + this._storedActionData.id + '_' + (this._storedActionData.etypeId || 'skill');

            debugLog('Action key: ' + actionKey + ', Current key: ' + (this._currentActionKey || 'none'));

            // Show skill info if this is a new action or we're not currently showing anything
            if (actionKey !== this._currentActionKey || !this._skillIconSprite?.visible) {
                this._currentActionKey = actionKey;
                this._currentSubject = currentSubject;
                this.showSkillInfo(this._storedActionData);
                debugLog('Showing skill info for: ' + this._storedActionData.name);
            }
        } else if (!isActionPhase || !currentSubject) {
            // Hide skill info and reset tracking when not in action phase
            if (this._currentActionKey || this._skillIconSprite?.visible) {
                this._currentActionKey = null;
                this._currentSubject = null;
                this._storedActionData = null;
                this.hideSkillInfo();
                debugLog('Hiding skill info - no valid action phase');
            }
        }
    };

    Window_ATBBar.prototype.refresh = function() {
        if (!this.contents) return;
        this.contents.clear();

        if (this._barBitmap && this._barBitmap.isReady()) {
            this.contents.blt(this._barBitmap, 0, 0, this._barBitmap.width, this._barBitmap.height,
                              0, 0, this._barBitmap.width, this._barBitmap.height);
        } else {
            // Draw a simple bar if no image
            this.contents.fillRect(0, 0, this.contents.width, this.contents.height, '#333333');
            this.contents.fillRect(2, 2, this.contents.width - 4, this.contents.height - 4, '#111111');
        }
    };

    // Scene_Battle modifications - add the visual bar
    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        this.createATBBarWindow();
    };

    Scene_Battle.prototype.createATBBarWindow = function() {
        this._atbBarWindow = new Window_ATBBar();
        this.addChild(this._atbBarWindow); // Ensure window is added to scene
        debugLog('ATB Bar Window added to scene');
    };

    // Add debugging method to help monitor BattleManager changes
    Scene_Battle.prototype.debugBattleManager = function() {
        if (enableDebug) {
            const originalUpdate = BattleManager.update;
            BattleManager.update = function(timeActive) {
                const oldPhase = this._phase;
                const oldAction = this._action;
                const oldSubject = this._subject;

                originalUpdate.call(this, timeActive);

                if (oldPhase !== this._phase || oldAction !== this._action || oldSubject !== this._subject) {
                    debugLog('BattleManager change - Phase: ' + oldPhase + ' -> ' + this._phase +
                    ', Action: ' + (oldAction ? 'yes' : 'no') + ' -> ' + (this._action ? 'yes' : 'no') +
                    ', Subject: ' + (oldSubject ? oldSubject.name() : 'none') + ' -> ' + (this._subject ? this._subject.name() : 'none'));
                }
            };
        }
    };

    const _Scene_Battle_start = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        _Scene_Battle_start.call(this);
        if (this._atbBarWindow) {
            this._atbBarWindow.createBattlerSprites();
            this._atbBarWindow.refresh();
            debugLog('ATB Bar Window started');
        }

        // Add debugging for battle manager
        this.debugBattleManager();
    };

    // Hook into target selection system
    const _Window_BattleEnemy_select = Window_BattleEnemy.prototype.select;
    Window_BattleEnemy.prototype.select = function(index) {
        _Window_BattleEnemy_select.call(this, index);

        // Update ATB bar highlight based on selected enemy
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            const enemy = this.enemy();
            SceneManager._scene._atbBarWindow.setSelectedTarget(enemy);
        }
    };

    const _Window_BattleEnemy_hide = Window_BattleEnemy.prototype.hide;
    Window_BattleEnemy.prototype.hide = function() {
        _Window_BattleEnemy_hide.call(this);

        // Clear ATB bar highlight when enemy selection window closes
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            SceneManager._scene._atbBarWindow.clearSelectedTarget();
        }
    };

    // Hook into actor selection as well
    const _Window_BattleActor_select = Window_BattleActor.prototype.select;
    Window_BattleActor.prototype.select = function(index) {
        _Window_BattleActor_select.call(this, index);

        // Update ATB bar highlight based on selected actor
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            const actor = this.actor();
            SceneManager._scene._atbBarWindow.setSelectedTarget(actor);
        }
    };

    const _Window_BattleActor_hide = Window_BattleActor.prototype.hide;
    Window_BattleActor.prototype.hide = function() {
        _Window_BattleActor_hide.call(this);

        // Clear ATB bar highlight when actor selection window closes
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            SceneManager._scene._atbBarWindow.clearSelectedTarget();
        }
    };

    // Enhanced targeting system with multi-target support and null checks
    const _Window_BattleEnemy_select_Enhanced = Window_BattleEnemy.prototype.select;
    Window_BattleEnemy.prototype.select = function(index) {
        _Window_BattleEnemy_select_Enhanced.call(this, index);

        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            debugLog('Enemy window - index: ' + index + ', active: ' + this.active + ', visible: ' + this.visible);

            // Only process if window is active and visible with a valid index
            if (!this.active || !this.visible || index < 0) {
                SceneManager._scene._atbBarWindow.clearSelectedTarget();
                return;
            }

            // Check if this is for an item with special targeting
            const scene = SceneManager._scene;
            if (scene._itemWindow && scene._itemWindow.item()) {
                const item = scene._itemWindow.item();
                const currentActor = BattleManager.actor();

                // Ensure we have a valid actor before creating Game_Action
                if (!currentActor) {
                    debugLog('No current actor available for item analysis');
                    const enemy = this.enemy();
                    SceneManager._scene._atbBarWindow.setSelectedTarget(enemy);
                    return;
                }

                const action = new Game_Action(currentActor);
                action.setItem(item.id);

                let targets = [];
                if (action.isForOpponent()) {
                    if (action.isForAll()) {
                        // Item affects all enemies
                        targets = $gameTroop.aliveMembers();
                        debugLog('Item "' + item.name + '" targets all enemies: ' + targets.length);
                    } else {
                        // Item affects single enemy
                        const enemy = this.enemy();
                        if (enemy) targets = [enemy];
                        debugLog('Item "' + item.name + '" targets single enemy: ' + (enemy ? enemy.name() : 'none'));
                    }
                    scene._atbBarWindow.setSelectedTargets(targets);
                    return;
                }
            }

            // Regular single enemy targeting
            const enemy = this.enemy();
            debugLog('Regular enemy selection: ' + (enemy ? enemy.name() : 'null'));
            SceneManager._scene._atbBarWindow.setSelectedTarget(enemy);
        }
    };

    const _Window_BattleActor_select_Enhanced = Window_BattleActor.prototype.select;
    Window_BattleActor.prototype.select = function(index) {
        _Window_BattleActor_select_Enhanced.call(this, index);

        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            debugLog('Actor window - index: ' + index + ', active: ' + this.active + ', visible: ' + this.visible);

            // Only process if window is active and visible with a valid index
            if (!this.active || !this.visible || index < 0) {
                SceneManager._scene._atbBarWindow.clearSelectedTarget();
                return;
            }

            // Check if this is for an item with special targeting
            const scene = SceneManager._scene;
            if (scene._itemWindow && scene._itemWindow.item()) {
                const item = scene._itemWindow.item();
                const currentActor = BattleManager.actor();

                // Ensure we have a valid actor before creating Game_Action
                if (!currentActor) {
                    debugLog('No current actor available for item analysis');
                    // Fallback to regular single actor targeting
                    let actor = this.actor();
                    if (!actor && index >= 0) {
                        const partyMembers = $gameParty.allMembers();
                        if (index < partyMembers.length) {
                            actor = partyMembers[index];
                        }
                    }
                    SceneManager._scene._atbBarWindow.setSelectedTarget(actor);
                    return;
                }

                const action = new Game_Action(currentActor);
                action.setItem(item.id);

                let targets = [];
                if (action.isForFriend()) {
                    if (action.isForAll()) {
                        // Item affects all allies
                        targets = $gameParty.aliveMembers();
                        debugLog('Item "' + item.name + '" targets all allies: ' + targets.length);
                    } else {
                        // Item affects single ally
                        let actor = this.actor();

                        // Fallback if actor() returns null
                        if (!actor && index >= 0) {
                            const partyMembers = $gameParty.allMembers();
                            if (index < partyMembers.length) {
                                actor = partyMembers[index];
                            }
                        }

                        if (actor) targets = [actor];
                        debugLog('Item "' + item.name + '" targets single ally: ' + (actor ? actor.name() : 'none'));
                    }
                    scene._atbBarWindow.setSelectedTargets(targets);
                    return;
                }
            }

            // Regular single actor targeting
            let actor = this.actor();

            // Fallback if actor() returns null
            if (!actor && index >= 0) {
                const partyMembers = $gameParty.allMembers();
                if (index < partyMembers.length) {
                    actor = partyMembers[index];
                }
            }

            debugLog('Regular actor selection: ' + (actor ? actor.name() : 'null'));
            SceneManager._scene._atbBarWindow.setSelectedTarget(actor);
        }
    };

    const _Window_BattleEnemy_hide_Simple = Window_BattleEnemy.prototype.hide;
    Window_BattleEnemy.prototype.hide = function() {
        _Window_BattleEnemy_hide_Simple.call(this);

        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            SceneManager._scene._atbBarWindow.clearSelectedTarget();
        }
    };

    const _Window_BattleActor_hide_Simple = Window_BattleActor.prototype.hide;
    Window_BattleActor.prototype.hide = function() {
        _Window_BattleActor_hide_Simple.call(this);

        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            SceneManager._scene._atbBarWindow.clearSelectedTarget();
        }
    };

    // Hook into skill target selection to ensure it works for both skills and items
    const _Window_BattleSkill_select = Window_BattleSkill.prototype.select;
    Window_BattleSkill.prototype.select = function(index) {
        _Window_BattleSkill_select.call(this, index);

        // Clear any existing target highlights when skill selection changes
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            SceneManager._scene._atbBarWindow.clearSelectedTarget();
        }
    };

    const _Window_BattleSkill_hide = Window_BattleSkill.prototype.hide;
    Window_BattleSkill.prototype.hide = function() {
        _Window_BattleSkill_hide.call(this);

        // Clear ATB bar highlight when skill window closes
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            SceneManager._scene._atbBarWindow.clearSelectedTarget();
        }
    };

    // Also hook into scene battle to clear selection when returning to command selection
    const _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
    Scene_Battle.prototype.startActorCommandSelection = function() {
        _Scene_Battle_startActorCommandSelection.call(this);

        // Clear target selection when returning to actor command menu
        if (this._atbBarWindow) {
            this._atbBarWindow.clearSelectedTarget();
        }
    };

    const _Scene_Battle_startPartyCommandSelection_Updated = Scene_Battle.prototype.startPartyCommandSelection;
    Scene_Battle.prototype.startPartyCommandSelection = function() {
        if (skipPartyMenu) {
            // Automatically select "Fight" and proceed to actor selection
            BattleManager.selectNextCommand();
            this.startActorCommandSelection();
        } else {
            // Original behavior
            _Scene_Battle_startPartyCommandSelection_Updated.call(this);
        }

        // Clear target selection when returning to party command menu
        if (this._atbBarWindow) {
            this._atbBarWindow.clearSelectedTarget();
        }
    };

    // Hook into BattleManager to capture action data before it's cleared
    const _BattleManager_startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        // Store action data in our ATB window before the action starts
        if (this._subject && this._action && SceneManager._scene._atbBarWindow) {
            const actionItem = this._action.item();
            if (actionItem) {
                SceneManager._scene._atbBarWindow._storedActionData = actionItem;
                debugLog('Stored action data for: ' + actionItem.name + ' (icon: ' + actionItem.iconIndex + ')');
            }
        }

        _BattleManager_startAction.call(this);
    };

    // Additional hook for when actions are set up
    const _BattleManager_processTurn = BattleManager.processTurn;
    BattleManager.processTurn = function() {
        // Also try to capture action data during processTurn
        if (this._subject && this._subject.currentAction() && SceneManager._scene._atbBarWindow) {
            const actionItem = this._subject.currentAction().item();
            if (actionItem && !SceneManager._scene._atbBarWindow._storedActionData) {
                SceneManager._scene._atbBarWindow._storedActionData = actionItem;
                debugLog('Stored action data during processTurn for: ' + actionItem.name + ' (icon: ' + actionItem.iconIndex + ')');
            }
        }

        _BattleManager_processTurn.call(this);
    };

    const _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        _BattleManager_endAction.call(this);

        // Clear stored action data after action ends
        if (SceneManager._scene && SceneManager._scene._atbBarWindow) {
            // Don't clear immediately - let it persist a bit into the turn phase
            setTimeout(() => {
                if (SceneManager._scene && SceneManager._scene._atbBarWindow && this._phase !== 'action') {
                    SceneManager._scene._atbBarWindow._storedActionData = null;
                    debugLog('Cleared stored action data');
                }
            }, 100);
        }
    };

    // Hide battle log if enabled
    if (hideBattleLog) {
        const _Scene_Battle_createLogWindow = Scene_Battle.prototype.createLogWindow;
        Scene_Battle.prototype.createLogWindow = function() {
            _Scene_Battle_createLogWindow.call(this);
            this._logWindow.visible = false;
            this._logWindow.opacity = 0;
        };

        // Also override methods that would show the log
        const _Window_BattleLog_addText = Window_BattleLog.prototype.addText;
        Window_BattleLog.prototype.addText = function(text) {
            // Don't add text if battle log is hidden
            if (hideBattleLog) return;
            _Window_BattleLog_addText.call(this, text);
        };

        const _Window_BattleLog_show = Window_BattleLog.prototype.show;
        Window_BattleLog.prototype.show = function() {
            // Don't show if battle log is hidden
            if (hideBattleLog) return;
            _Window_BattleLog_show.call(this);
        };
    }

})();
