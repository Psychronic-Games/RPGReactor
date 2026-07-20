/*:
 * @target MZ
 * @plugindesc Adds Extra Functionality to Items in RPG Maker MZ.
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_MegaItemsMZ.js
 *
 * ============================================================================
 * MEGA ITEMS MZ - Enhanced Items System
 * ============================================================================
 *
 * This plugin enhances the item menu with better visuals, more information,
 * and improved user experience.
 *
 * Features:
 * - Color-coded item types (Consumable, Key Item, Equipment, etc.)
 * - Enhanced item descriptions displayed in menu
 * - Item quantity display
 * - Effect indicators (healing, buffs, etc.)
 * - Gradient backgrounds for categories
 * - Improved two-column layout
 * - Visual effect strength indicators
 *
 * ============================================================================
 *
 * @param visualEnhancements
 * @text Visual Enhancements
 * @type boolean
 * @default true
 * @desc Enable enhanced visual display for items
 *
 * @param colorCodeTypes
 * @text Color Code Item Types
 * @type boolean
 * @default true
 * @desc Color code items based on their type
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
 * @desc Font size for item descriptions in the item list
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MegaItemsMZ';
    const parameters = PluginManager.parameters(pluginName);

    const visualEnhancements = parameters['visualEnhancements'] === 'true';
    const colorCodeTypes = parameters['colorCodeTypes'] === 'true';
    const consumableColor = parameters['consumableColor'] || '#44ff88';
    const keyItemColor = parameters['keyItemColor'] || '#ffaa44';
    const weaponColor = parameters['weaponColor'] || '#ff6644';
    const armorColor = parameters['armorColor'] || '#4488ff';
    const descriptionFontSize = parseInt(parameters['descriptionFontSize']) || 14;

    //=============================================================================
    // Window_ItemList - Enhanced Display
    //=============================================================================

    // Fix duplicate icon drawing during measurement
    Window_ItemList.prototype.drawIcon = function(iconIndex, x, y) {
        // Check if we're in measurement mode (textSizeEx uses temporary dummy bitmap)
        if (this.contents.width === 0 || (x === 0 && y <= 4)) {
            // Don't actually draw during measurement, just reserve the space
            return;
        }
        // Normal drawing for actual rendering
        Window_Base.prototype.drawIcon.call(this, iconIndex, x, y);
    };

    const _Window_ItemList_initialize = Window_ItemList.prototype.initialize;
    Window_ItemList.prototype.initialize = function(rect) {
        _Window_ItemList_initialize.call(this, rect);
        this._itemHeight = 115; // Increased height for more info
    };

    Window_ItemList.prototype.itemHeight = function() {
        return this._itemHeight || 115;
    };

    // Enable two-column layout
    Window_ItemList.prototype.maxCols = function() {
        return 2;
    };

    // Complete override to prevent duplicate drawing
    const _Window_ItemList_drawItem = Window_ItemList.prototype.drawItem;
    Window_ItemList.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        if (!item) return;

        const rect = this.itemRect(index);

        if (!visualEnhancements) {
            _Window_ItemList_drawItem.call(this, index);
            return;
        }

        this.drawEnhancedItem(item, rect.x, rect.y, rect.width);
    };

    Window_ItemList.prototype.drawEnhancedItem = function(item, x, y, width) {
        const lineHeight = 24;
        const padding = 8;
        const defaultSize = $gameSystem.mainFontSize();

        // Validate dimensions
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || width <= 0) {
            return;
        }

        // Clear the area first to prevent duplicate drawing
        this.contents.clearRect(x, y, width, this.itemHeight());

        // Draw background gradient based on item type
        this.drawItemBackground(item, x, y, width, this.itemHeight());

        // Draw item icon
        this.drawIcon(item.iconIndex, x + padding, y + padding);

        // Draw item name with color coding
        const nameX = x + padding + 40;
        const nameWidth = width - padding * 2 - 40 - 80;
        this.changeTextColor(this.getItemTypeColor(item));
        this.contents.fontSize = 22;
        this.drawText(item.name, nameX, y + padding, nameWidth);

        // Measure name width for state icon positioning (while font is still at size 22)
        const nameTextWidth = this.contents.measureTextWidth(item.name);

        this.resetTextColor();
        this.contents.fontSize = defaultSize;

        // Draw state icons and effects right after the item name on the same line
        const stateIconX = nameX + nameTextWidth + 8;
        this.drawStateIconsAndEffects(item, stateIconX, y + padding);

        // Draw quantity
        this.drawItemQuantity(item, x + width - padding - 70, y + padding, 70);

        // Draw description - calculate width conservatively to prevent overflow
        this.changeTextColor(ColorManager.normalColor());
        const descY = y + padding + lineHeight + 4;
        // Use a very conservative width calculation to prevent any overflow
        const descWidth = width - (nameX - x) - padding * 3; // Remaining width with extra padding
        this.drawScaledDescription(item.description, nameX, descY, descWidth);

        // Draw key item indicator if needed
        const keyItemY = y + padding + lineHeight * 2 + 8;
        this.drawKeyItemIndicator(item, nameX, keyItemY);
    };

    Window_ItemList.prototype.drawItemBackground = function(item, x, y, width, height) {
        const color1 = this.getItemTypeColor(item);

        // Validate dimensions
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) {
            return;
        }

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

    Window_ItemList.prototype.drawScaledDescription = function(description, x, y, maxWidth) {
        if (!description) return;

        const defaultSize = $gameSystem.mainFontSize();
        let fontSize = descriptionFontSize;
        const minFontSize = 8; // Very small minimum to ensure it always fits
        const lineHeight = 24; // Approximate line height
        const maxLines = 2;
        const maxHeight = lineHeight * maxLines;

        // Iteratively find the right font size
        let fits = false;
        while (!fits && fontSize >= minFontSize) {
            this.contents.fontSize = fontSize;
            const textWidth = this.contents.measureTextWidth(description);

            // Estimate how many lines this will take
            const estimatedLines = Math.ceil(textWidth / maxWidth);
            const estimatedHeight = estimatedLines * (fontSize + 4); // fontSize + line spacing

            // Check if it fits in both dimensions
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

    Window_ItemList.prototype.drawItemQuantity = function(item, x, y, width) {
        const defaultSize = $gameSystem.mainFontSize();
        this.contents.fontSize = 18;

        // Show quantity for regular items (not key items)
        if (DataManager.isItem(item) && item.itypeId !== 2) {
            const quantity = $gameParty.numItems(item);
            this.changeTextColor(ColorManager.normalColor());
            this.drawText('×' + quantity, x, y + 4, width, 'right');
        }

        this.contents.fontSize = defaultSize;
        this.resetTextColor();
    };

    Window_ItemList.prototype.drawStateIconsAndEffects = function(item, x, y) {
        if (!item.effects || item.effects.length === 0) return;

        const defaultSize = $gameSystem.mainFontSize();
        let currentX = x;

        // First draw state icons
        for (const effect of item.effects) {
            // Add State - show state icon
            if (effect.code === Game_Action.EFFECT_ADD_STATE) {
                const state = $dataStates[effect.dataId];
                if (state && state.iconIndex > 0) {
                    this.drawIcon(state.iconIndex, currentX, y);
                    currentX += 36;
                }
            }
        }

        // Then draw effect text attributes
        this.contents.fontSize = 18;

        for (const effect of item.effects) {
            // HP Recovery
            if (effect.code === Game_Action.EFFECT_RECOVER_HP) {
                const hpRecover = Math.floor(effect.value1 * 100);
                if (hpRecover > 0) {
                    this.changeTextColor('#44ff44');
                    this.drawText('♥HP +' + hpRecover + '%', currentX, y + 4, 100);
                    currentX += 105;
                }
            }
            // MP Recovery
            if (effect.code === Game_Action.EFFECT_RECOVER_MP) {
                const mpRecover = Math.floor(effect.value1 * 100);
                if (mpRecover > 0) {
                    this.changeTextColor('#4488ff');
                    this.drawText('★MP +' + mpRecover + '%', currentX, y + 4, 100);
                    currentX += 105;
                }
            }
            // Remove State
            if (effect.code === Game_Action.EFFECT_REMOVE_STATE) {
                const state = $dataStates[effect.dataId];
                if (state) {
                    this.changeTextColor('#ffff44');
                    this.drawText('Cure', currentX, y + 4, 50);
                    currentX += 55;
                }
            }
        }

        this.contents.fontSize = defaultSize;
        this.resetTextColor();
    };

    Window_ItemList.prototype.drawKeyItemIndicator = function(item, x, y) {
        // Key Item indicator
        if (DataManager.isItem(item) && item.itypeId === 2) {
            const defaultSize = $gameSystem.mainFontSize();
            this.contents.fontSize = 14;
            this.changeTextColor('#ffaa44');
            this.drawText('🔑KEY', x, y, 60);
            this.contents.fontSize = defaultSize;
            this.resetTextColor();
        }
    };

    Window_ItemList.prototype.getItemTypeColor = function(item) {
        if (!colorCodeTypes) return ColorManager.normalColor();

        // Determine item type
        if (DataManager.isItem(item) && item.itypeId === 2) {
            return keyItemColor; // Key items have itypeId === 2
        } else if (DataManager.isWeapon(item)) {
            return weaponColor;
        } else if (DataManager.isArmor(item)) {
            return armorColor;
        } else if (DataManager.isItem(item)) {
            return consumableColor;
        }

        return ColorManager.normalColor();
    };

    Window_ItemList.prototype.hexToRgba = function(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    //=============================================================================
    // Window_ItemCategory - Enhanced Category Display
    //=============================================================================

    // Fix duplicate icon drawing from inline \i[x] codes
    Window_ItemCategory.prototype.drawIcon = function(iconIndex, x, y) {
        // Check if we're in measurement mode (textSizeEx uses temporary dummy bitmap)
        if (this.contents.width === 0 || (x === 0 && y <= 4)) {
            // Don't actually draw during measurement, just reserve the space
            return;
        }
        // Normal drawing for actual rendering
        Window_Base.prototype.drawIcon.call(this, iconIndex, x, y);
    };

    const _Window_ItemCategory_drawItem = Window_ItemCategory.prototype.drawItem;
    Window_ItemCategory.prototype.drawItem = function(index) {
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
