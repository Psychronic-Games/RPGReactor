/*:
 * @target MZ
 * @plugindesc Adds Extra Functionality to Skills in RPG Maker MZ.
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_MegaSkillsMZ.js
 *
 * ============================================================================
 * MEGA SKILLS MZ - Enhanced Skills System
 * ============================================================================
 *
 * This plugin enhances the skill menu with better visuals, more information,
 * and improved user experience.
 *
 * Features:
 * - Color-coded skill types (Magic, Physical, Support, etc.)
 * - Enhanced skill descriptions displayed in menu
 * - Better cost display using database terminology (HP/MP/TP)
 * - Success rate and critical indicators
 * - Gradient backgrounds for categories
 * - Improved two-column layout
 * - Percentage-based costs (HP/MP/TP)
 *
 * ============================================================================
 * Notetags:
 * ============================================================================
 *
 * Skill Notetags:
 *
 * <HP Cost: x%>
 * - Skill costs x% of the user's max HP
 *
 * <MP Cost: x%>
 * - Skill costs x% of the user's max MP (overrides default MP cost)
 *
 * <TP Cost: x%>
 * - Skill costs x% of the user's max TP (overrides default TP cost)
 *
 * ============================================================================
 *
 * @param visualEnhancements
 * @text Visual Enhancements
 * @type boolean
 * @default true
 * @desc Enable enhanced visual display for skills
 *
 * @param showSuccessRate
 * @text Show Success Rate
 * @type boolean
 * @default true
 * @desc Display success rate percentage
 *
 * @param colorCodeTypes
 * @text Color Code Skill Types
 * @type boolean
 * @default true
 * @desc Color code skills based on their type
 *
 * @param magicSkillColor
 * @text Magic Skill Color
 * @type string
 * @default #4488ff
 * @desc Color for magic-type skills (hex format)
 *
 * @param physicalSkillColor
 * @text Physical Skill Color
 * @type string
 * @default #ff6644
 * @desc Color for physical-type skills (hex format)
 *
 * @param supportSkillColor
 * @text Support Skill Color
 * @type string
 * @default #44ff88
 * @desc Color for support-type skills (hex format)
 *
 * @param hpIcon
 * @text HP Cost Icon
 * @type number
 * @default 84
 * @desc Icon index to display before HP costs (0 = no icon)
 *
 * @param mpIcon
 * @text MP Cost Icon
 * @type number
 * @default 79
 * @desc Icon index to display before MP costs (0 = no icon)
 *
 * @param tpIcon
 * @text TP Cost Icon
 * @type number
 * @default 80
 * @desc Icon index to display before TP costs (0 = no icon)
 *
 * @param descriptionFontSize
 * @text Description Font Size
 * @type number
 * @default 14
 * @desc Font size for skill descriptions in the skill list
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MegaSkillsMZ';
    const parameters = PluginManager.parameters(pluginName);

    const visualEnhancements = parameters['visualEnhancements'] === 'true';
    const showSuccessRate = parameters['showSuccessRate'] === 'true';
    const colorCodeTypes = parameters['colorCodeTypes'] === 'true';
    const magicColor = parameters['magicSkillColor'] || '#4488ff';
    const physicalColor = parameters['physicalSkillColor'] || '#ff6644';
    const supportColor = parameters['supportSkillColor'] || '#44ff88';
    const hpIcon = parseInt(parameters['hpIcon']) || 0;
    const mpIcon = parseInt(parameters['mpIcon']) || 0;
    const tpIcon = parseInt(parameters['tpIcon']) || 0;
    const descriptionFontSize = parseInt(parameters['descriptionFontSize']) || 14;

    //=============================================================================
    // DataManager - Parse Skill Notetags
    //=============================================================================

    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        if (!this._megaSkillsLoaded) {
            this.processMegaSkillsNotetags($dataSkills);
            this._megaSkillsLoaded = true;
        }
        return true;
    };

    DataManager.processMegaSkillsNotetags = function(group) {
        for (let n = 1; n < group.length; n++) {
            const obj = group[n];
            if (!obj) continue;

            obj.hpCostPercent = 0;
            obj.mpCostPercent = 0;
            obj.tpCostPercent = 0;

            const notedata = obj.note.split(/[\r\n]+/);

            for (let i = 0; i < notedata.length; i++) {
                const line = notedata[i];

                if (line.match(/<HP Cost:\s*(\d+)%>/i)) {
                    obj.hpCostPercent = parseInt(RegExp.$1);
                }
                if (line.match(/<MP Cost:\s*(\d+)%>/i)) {
                    obj.mpCostPercent = parseInt(RegExp.$1);
                }
                if (line.match(/<TP Cost:\s*(\d+)%>/i)) {
                    obj.tpCostPercent = parseInt(RegExp.$1);
                }
            }
        }
    };

    //=============================================================================
    // Game_BattlerBase - Percentage Cost Calculation
    //=============================================================================

    // HP Cost - New function (doesn't exist in base MZ)
    Game_BattlerBase.prototype.skillHpCost = function(skill) {
        let cost = 0;
        if (skill.hpCostPercent > 0) {
            cost = Math.floor(this.mhp * skill.hpCostPercent / 100);
        }
        return cost;
    };

    const _Game_BattlerBase_skillMpCost = Game_BattlerBase.prototype.skillMpCost;
    Game_BattlerBase.prototype.skillMpCost = function(skill) {
        if (skill.mpCostPercent > 0) {
            return Math.floor(this.mmp * skill.mpCostPercent / 100);
        }
        return _Game_BattlerBase_skillMpCost.call(this, skill);
    };

    const _Game_BattlerBase_skillTpCost = Game_BattlerBase.prototype.skillTpCost;
    Game_BattlerBase.prototype.skillTpCost = function(skill) {
        if (skill.tpCostPercent > 0) {
            return Math.floor(this.maxTp() * skill.tpCostPercent / 100);
        }
        return _Game_BattlerBase_skillTpCost.call(this, skill);
    };

    //=============================================================================
    // ColorManager - HP Cost Color
    //=============================================================================

    if (!ColorManager.hpCostColor) {
        ColorManager.hpCostColor = function() {
            return this.textColor(18); // Orange color for HP costs
        };
    }

    //=============================================================================
    // Game_BattlerBase - Can Pay HP Cost Check
    //=============================================================================

    const _Game_BattlerBase_canPaySkillCost = Game_BattlerBase.prototype.canPaySkillCost;
    Game_BattlerBase.prototype.canPaySkillCost = function(skill) {
        if (!_Game_BattlerBase_canPaySkillCost.call(this, skill)) {
            return false;
        }
        // Make sure we can pay HP cost (and won't die from it)
        const hpCost = this.skillHpCost(skill);
        if (hpCost > 0 && this.hp <= hpCost) {
            return false;
        }
        return true;
    };

    //=============================================================================
    // Game_Battler - Pay HP Cost When Using Skill
    //=============================================================================

    const _Game_BattlerBase_paySkillCost = Game_BattlerBase.prototype.paySkillCost;
    Game_BattlerBase.prototype.paySkillCost = function(skill) {
        // Debug logging
        console.log("=== PAYING SKILL COST ===");
        console.log("Skill Name:", skill.name);
        console.log("Skill ID:", skill.id);
        console.log("mpCostPercent:", skill.mpCostPercent);
        console.log("Original MP Cost:", skill.mpCost);
        console.log("Calculated MP Cost:", this.skillMpCost(skill));
        console.log("Actor Current MP:", this._mp);
        console.log("Actor Max MP:", this.mmp);

        // Pay HP cost first
        const hpCost = this.skillHpCost(skill);
        if (hpCost > 0) {
            console.log("Paying HP Cost:", hpCost);
            this._hp -= hpCost;
        }

        // Pay MP and TP costs
        _Game_BattlerBase_paySkillCost.call(this, skill);

        console.log("Actor MP After:", this._mp);
        console.log("=========================");
    };

    //=============================================================================
    // Window_SkillList - Enhanced Display
    //=============================================================================

    const _Window_SkillList_initialize = Window_SkillList.prototype.initialize;
    Window_SkillList.prototype.initialize = function(rect) {
        _Window_SkillList_initialize.call(this, rect);
        this._itemHeight = 96; // Increased height for more info
    };

    Window_SkillList.prototype.itemHeight = function() {
        return this._itemHeight || 96;
    };

    // Enable two-column layout
    Window_SkillList.prototype.maxCols = function() {
        return 2;
    };

    // Complete override to prevent duplicate drawing
    Window_SkillList.prototype.drawItem = function(index) {
        const skill = this.itemAt(index);
        if (!skill) return;

        const rect = this.itemRect(index);

        if (!visualEnhancements) {
            // Fallback to basic drawing if enhancements disabled
            this.changePaintOpacity(this.isEnabled(skill));
            this.drawItemName(skill, rect.x, rect.y, rect.width);
            this.drawSkillCost(skill, rect.x, rect.y, rect.width);
            this.changePaintOpacity(1);
            return;
        }

        this.drawEnhancedSkill(skill, rect.x, rect.y, rect.width);
    };

    Window_SkillList.prototype.drawEnhancedSkill = function(skill, x, y, width) {
        const lineHeight = 24;
        const padding = 8;
        const defaultSize = $gameSystem.mainFontSize();

        // Clear the area first to prevent duplicate drawing
        this.contents.clearRect(x, y, width, this.itemHeight());

        // Draw background gradient based on skill type
        this.drawSkillBackground(skill, x, y, width, this.itemHeight());

        // Draw skill icon
        this.drawIcon(skill.iconIndex, x + padding, y + padding);

        // Draw skill name with color coding
        const nameX = x + padding + 40;
        const nameWidth = width - padding * 2 - 40 - 100;
        this.changeTextColor(this.getSkillTypeColor(skill));
        this.contents.fontSize = 22;
        this.drawText(skill.name, nameX, y + padding, nameWidth);
        this.resetTextColor();
        this.contents.fontSize = defaultSize;

        // Draw cost (MP/TP)
        this.drawSkillCost(skill, x + width - padding - 90, y + padding, 90);

        // Draw description
        this.changeTextColor(ColorManager.normalColor());
        const descY = y + padding + lineHeight + 4;
        const descText = '\\FS[' + descriptionFontSize + ']' + skill.description;
        this.drawTextEx(descText, nameX, descY, nameWidth + 100);

        // Draw success rate
        if (showSuccessRate && skill.successRate < 100) {
            const successY = y + padding + lineHeight * 2 + 4;
            this.contents.fontSize = 16;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText('Hit:', nameX, successY, 40);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText(skill.successRate + '%', nameX + 45, successY, 50);
            this.contents.fontSize = defaultSize;
        }

        // Draw additional info (Critical, element, etc.)
        const tagsY = y + padding + lineHeight * 2 + 8;
        const tagsX = showSuccessRate && skill.successRate < 100 ? nameX + 110 : nameX;
        this.drawSkillTags(skill, tagsX, tagsY);
    };

    Window_SkillList.prototype.drawSkillBackground = function(skill, x, y, width, height) {
        const color1 = this.getSkillTypeColor(skill);
        const color2 = 'rgba(0, 0, 0, 0)';

        // Create gradient
        const context = this.contents.context;
        const gradient = context.createLinearGradient(x, y, x + width, y);
        gradient.addColorStop(0, this.hexToRgba(color1, 0.15));
        gradient.addColorStop(0.5, this.hexToRgba(color1, 0.05));
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.02)');

        context.save();
        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);
        context.restore();

        // Draw border
        context.save();
        context.strokeStyle = this.hexToRgba(color1, 0.3);
        context.lineWidth = 1;
        context.strokeRect(x + 2, y + 2, width - 4, height - 4);
        context.restore();
    };

    Window_SkillList.prototype.drawSkillCost = function(skill, x, y, width) {
        const actor = this._actor;
        if (!actor) return;

        const defaultSize = $gameSystem.mainFontSize();
        this.contents.fontSize = 18;

        let yOffset = 0;
        const iconSize = 32;
        const iconPadding = 4;

        // HP Cost
        const hpCost = actor.skillHpCost(skill);
        if (hpCost > 0) {
            this.changeTextColor(ColorManager.hpCostColor());
            let hpText = hpCost + ' ' + TextManager.hp;
            if (skill.hpCostPercent > 0) {
                hpText = skill.hpCostPercent + '% ' + TextManager.hp;
            }

            // Draw icon if configured
            if (hpIcon > 0) {
                const textWidth = this.textWidth(hpText);
                const totalWidth = iconSize + iconPadding + textWidth;
                const startX = x + width - totalWidth;
                this.drawCostIcon(hpIcon, startX, y + yOffset);
                this.drawText(hpText, startX + iconSize + iconPadding, y + yOffset + 4, textWidth);
            } else {
                this.drawText(hpText, x, y + yOffset + 4, width, 'right');
            }
            yOffset += 24;
        }

        // MP Cost
        const mpCost = actor.skillMpCost(skill);
        if (mpCost > 0) {
            this.changeTextColor(ColorManager.mpCostColor());
            let mpText = mpCost + ' ' + TextManager.mp;
            if (skill.mpCostPercent > 0) {
                mpText = skill.mpCostPercent + '% ' + TextManager.mp;
            }

            // Draw icon if configured
            if (mpIcon > 0) {
                const textWidth = this.textWidth(mpText);
                const totalWidth = iconSize + iconPadding + textWidth;
                const startX = x + width - totalWidth;
                this.drawCostIcon(mpIcon, startX, y + yOffset);
                this.drawText(mpText, startX + iconSize + iconPadding, y + yOffset + 4, textWidth);
            } else {
                this.drawText(mpText, x, y + yOffset + 4, width, 'right');
            }
            yOffset += 24;
        }

        // TP Cost
        const tpCost = actor.skillTpCost(skill);
        if (tpCost > 0) {
            this.changeTextColor(ColorManager.tpCostColor());
            let tpText = tpCost + ' ' + TextManager.tp;
            if (skill.tpCostPercent > 0) {
                tpText = skill.tpCostPercent + '% ' + TextManager.tp;
            }

            // Draw icon if configured
            if (tpIcon > 0) {
                const textWidth = this.textWidth(tpText);
                const totalWidth = iconSize + iconPadding + textWidth;
                const startX = x + width - totalWidth;
                this.drawCostIcon(tpIcon, startX, y + yOffset);
                this.drawText(tpText, startX + iconSize + iconPadding, y + yOffset + 4, textWidth);
            } else {
                this.drawText(tpText, x, y + yOffset + 4, width, 'right');
            }
        }

        this.contents.fontSize = defaultSize;
        this.resetTextColor();
    };

    // Custom icon drawing to prevent bleeding
    Window_SkillList.prototype.drawCostIcon = function(iconIndex, x, y) {
        const bitmap = ImageManager.loadSystem("IconSet");
        const pw = ImageManager.iconWidth - 2; // Reduce by 2 pixels total (1 on each side)
const ph = ImageManager.iconHeight;
const sx = (iconIndex % 16) * ImageManager.iconWidth + 1; // Offset by 1 pixel to skip left edge
const sy = Math.floor(iconIndex / 16) * ImageManager.iconHeight;
// Draw with exact bounds to prevent bleeding
this.contents.blt(bitmap, sx, sy, pw, ph, x, y);
    };

    Window_SkillList.prototype.drawSkillTags = function(skill, x, y) {
        const defaultSize = $gameSystem.mainFontSize();
        this.contents.fontSize = 14;
        let tagX = x;

        // Critical
        if (skill.damage.critical) {
            this.changeTextColor('#ffff44');
            this.drawText('★CRIT', tagX, y, 60);
            tagX += 65;
        }

        // Element
        if (skill.damage.elementId > 0) {
            const elementName = $dataSystem.elements[skill.damage.elementId];
            if (elementName) {
                this.changeTextColor('#44ddff');
                this.drawText('◆' + elementName, tagX, y, 80);
            }
        }

        this.contents.fontSize = defaultSize;
        this.resetTextColor();
    };

    Window_SkillList.prototype.getSkillTypeColor = function(skill) {
        if (!colorCodeTypes) return ColorManager.normalColor();

        // Determine skill type based on properties
        if (skill.damage.type === 0) {
            return supportColor; // No damage = support
        } else if (skill.damage.type === 1 || skill.damage.type === 2) {
            // Check if physical or magical
            if (skill.damage.formula && skill.damage.formula.includes('atk')) {
                return physicalColor;
            } else {
                return magicColor;
            }
        }

        return ColorManager.normalColor();
    };

    Window_SkillList.prototype.hexToRgba = function(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    //=============================================================================
    // Window_SkillType - Enhanced Category Display
    //=============================================================================

    // Fix duplicate icon drawing from inline \i[x] codes
    Window_SkillType.prototype.drawIcon = function(iconIndex, x, y) {
        // Check if we're in measurement mode (textSizeEx uses temporary dummy bitmap)
        if (this.contents.width === 0 || (x === 0 && y <= 4)) {
            // Don't actually draw during measurement, just reserve the space
            return;
        }
        // Normal drawing for actual rendering
        Window_Base.prototype.drawIcon.call(this, iconIndex, x, y);
    };

    Window_SkillType.prototype.drawItem = function(index) {
        const rect = this.itemLineRect(index);

        // Clear the area first to prevent duplicates
        this.contents.clearRect(rect.x, rect.y, rect.width, rect.height);

        // Draw background for selected items
        if (this.isCommandEnabled(index) && index === this.index()) {
            const gradient = this.contents.context.createLinearGradient(
                rect.x, rect.y, rect.x + rect.width, rect.y
            );
            gradient.addColorStop(0, 'rgba(64, 128, 255, 0.2)');
            gradient.addColorStop(1, 'rgba(64, 128, 255, 0.05)');

            this.contents.context.save();
            this.contents.context.fillStyle = gradient;
            this.contents.context.fillRect(rect.x, rect.y, rect.width, rect.height);
            this.contents.context.restore();
        }

        // Draw the command name (which includes inline icon codes like \i[x])
        const commandName = this.commandName(index);

        this.resetTextColor();
        this.changePaintOpacity(this.isCommandEnabled(index));
        this.drawTextEx(commandName, rect.x + 4, rect.y, rect.width);
    };

})();
