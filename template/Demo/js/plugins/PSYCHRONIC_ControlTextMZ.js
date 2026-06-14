/*:
 * @plugindesc v1.1.0 Replaces \i[n] with icons and \c[n] with color coding in menus and descriptions.
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help
 * ============================================================================
 * Introduction
 * ============================================================================
 *
 * This plugin allows you to use \i[n] to display icons and \c[n] to apply color
 * coding in menus and item descriptions. For example, \i[502] will show icon
 * index 502, and \c[1] will change the text color to color index 1.
 *
 * ============================================================================
 * How to Use
 * ============================================================================
 *
 * 1. Place this plugin in your project's js/plugins/ folder.
 * 2. Add it to your project via the Plugin Manager in RPG Maker MZ.
 * 3. Use \i[n] in item descriptions or other database text fields to show icons.
 * 4. Use \c[n] to apply color coding to text.
 *
 * Example:
 * - Item Description: "Restores 100 HP \i[502] \c[1]Boosts Strength\c[0]"
 *   - Shows icon 502 and "Boosts Strength" in color index 1, with normal color afterward.
 *
 * ============================================================================
 * Compatibility
 * ============================================================================
 *
 * This plugin now includes comprehensive MV-compatibility shims for plugins
 * that use MV-style method calls. This means you can use MV-style plugins
 * without FOSSIL.
 *
 * Compatible with:
 * - MegaSaveMZ and other plugins using MV-style methods
 * - MenuManagerMZ and other menu plugins
 * - MegaEquipMZ and equipment plugins
 * - Plugins that call this.textColor(), this.standardFontSize(), etc.
 * - Plugins that call this.drawActorFace(), this.drawActorName(), etc.
 *
 * MV Compatibility Methods Added:
 * - textColor(), standardFontSize(), standardFontFace(), textPadding()
 * - drawActorCharacter(), drawActorClass(), drawActorFace(), drawActorIcons()
 * - drawActorLevel(), drawActorName(), drawActorNickname(), drawActorSimpleStatus()
 * - drawActorHp(), drawActorMp(), drawActorTp()
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 *
 * Free to use for both commercial and non-commercial projects. Credit Psychronic
 * if you wish, but it's not required. You may modify and distribute this plugin
 * freely.
 *
 * ============================================================================
 * Changelog
 * ============================================================================
 *
 * Version 1.1.0:
 * - MAJOR REWRITE: Now uses smart drawText override instead of drawItemName overrides
 * - drawText automatically detects escape codes and uses drawTextEx when needed
 * - Fixed equipment window compatibility completely
 * - Much simpler and more reliable approach
 * - Removed all specific window overrides (drawItemName, etc.)
 *
 * Version 1.0.9:
 * - Fixed equipment window compatibility - items now show up properly
 * - Fixed Window_EquipItem drawing by adding proper error handling
 * - Improved Window_ItemList override to be less aggressive
 * - Better handling of items without iconIndex property
 *
 * Version 1.0.8:
 * - Added comprehensive actor drawing method compatibility (MV → MZ)
 * - Fixed MenuManagerMZ compatibility - drawActorFace and related methods now work
 * - Added 10+ actor drawing methods that redirect to Window_StatusBase
 * - Added Window_Command.drawItem override to support \i[n] and \c[n] in menu options
 * - Now acts as a full FOSSIL replacement for most MV plugins
 *
 * Version 1.0.7:
 * - CRITICAL FIX: Removed processDrawIcon override that was breaking text measurement
 * - Fixed MegaSave compatibility - variable names and options now display correctly
 * - Now uses MZ's native processDrawIcon which respects textState.drawing flag
 *
 * Version 1.0.6:
 * - Added MV-compatibility shim for plugins using MV-style method calls
 * - Added textColor(), standardFontSize(), standardFontFace(), textPadding() methods
 * - Now works with MegaSaveMZ and other MV-style plugins without FOSSIL
 *
 * Version 1.0.5:
 * - Removed aggressive drawText and Window_Help overrides for better compatibility
 * - Fixed conflicts with other plugins like MegaSave
 * - Made the plugin less invasive while maintaining escape code functionality
 *
 * Version 1.0.4:
 * - Fixed itemPadding error by using itemPadding() instead of textPadding()
 *
 * Version 1.0.3:
 * - Fixed textColor error by using ColorManager.textColor instead of this.textColor
 *
 * Version 1.0.2:
 * - Fixed skill icon display issue in skill lists
 * - Improved Window_Selectable override to properly handle base icons
 *
 * Version 1.0.1:
 * - Fixed infinite loop issue in text processing
 * - Improved compatibility with existing RPG Maker MZ systems
 *
 * Version 1.0.0:
 * - Initial release with icon and color code processing.
 */

(function() {
    'use strict';

    //=============================================================================
    // MV Compatibility Shim
    // These methods exist in RPG Maker MV but not MZ - adding them for compatibility
    //=============================================================================

    // Add textColor as an instance method (MV style) if it doesn't exist
    if (!Window_Base.prototype.textColor) {
        Window_Base.prototype.textColor = function(n) {
            return ColorManager.textColor(n);
        };
    }

    // Add standardFontSize as an instance method (MV style) if it doesn't exist
    if (!Window_Base.prototype.standardFontSize) {
        Window_Base.prototype.standardFontSize = function() {
            return $gameSystem.mainFontSize();
        };
    }

    // Add standardFontFace as an instance method (MV style) if it doesn't exist
    if (!Window_Base.prototype.standardFontFace) {
        Window_Base.prototype.standardFontFace = function() {
            return $gameSystem.mainFontFace();
        };
    }

    // Add textPadding as an instance method (MV style) if it doesn't exist
    if (!Window_Base.prototype.textPadding) {
        Window_Base.prototype.textPadding = function() {
            return this.itemPadding();
        };
    }

    // Add actor drawing methods (MV style) - these were moved to Window_StatusBase in MZ
    // In MV, these were all on Window_Base, so we redirect to Window_StatusBase for compatibility
    if (!Window_Base.prototype.drawActorCharacter) {
        Window_Base.prototype.drawActorCharacter = function(actor, x, y) {
            Window_StatusBase.prototype.drawActorCharacter.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorClass) {
        Window_Base.prototype.drawActorClass = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorClass.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorFace) {
        Window_Base.prototype.drawActorFace = function(actor, x, y, width, height) {
            Window_StatusBase.prototype.drawActorFace.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorIcons) {
        Window_Base.prototype.drawActorIcons = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorIcons.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorLevel) {
        Window_Base.prototype.drawActorLevel = function(actor, x, y) {
            Window_StatusBase.prototype.drawActorLevel.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorName) {
        Window_Base.prototype.drawActorName = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorName.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorNickname) {
        Window_Base.prototype.drawActorNickname = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorNickname.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorSimpleStatus) {
        Window_Base.prototype.drawActorSimpleStatus = function(actor, x, y) {
            Window_StatusBase.prototype.drawActorSimpleStatus.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorHp) {
        Window_Base.prototype.drawActorHp = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorHp.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorMp) {
        Window_Base.prototype.drawActorMp = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorMp.apply(this, arguments);
        };
    }

    if (!Window_Base.prototype.drawActorTp) {
        Window_Base.prototype.drawActorTp = function(actor, x, y, width) {
            Window_StatusBase.prototype.drawActorTp.apply(this, arguments);
        };
    }

    //=============================================================================
    // Control Text Plugin - Escape Code Processing
    //=============================================================================

    // Hook into the existing escape character processing system
    const _Window_Base_processEscapeCharacter = Window_Base.prototype.processEscapeCharacter;
    Window_Base.prototype.processEscapeCharacter = function(code, textState) {
        switch (code) {
            case 'I':
                // Use the existing processDrawIcon method - don't override it!
                this.processDrawIcon(this.obtainEscapeParam(textState), textState);
                break;
            case 'C':
                this.changeTextColor(ColorManager.textColor(this.obtainEscapeParam(textState)));
                break;
            default:
                _Window_Base_processEscapeCharacter.call(this, code, textState);
                break;
        }
    };

    // NOTE: We do NOT override processDrawIcon - MZ's version handles textState.drawing correctly!

    // Override obtainEscapeParam to handle our format [n]
    const _Window_Base_obtainEscapeParam = Window_Base.prototype.obtainEscapeParam;
    Window_Base.prototype.obtainEscapeParam = function(textState) {
        const arr = /^\[(\d+)\]/.exec(textState.text.slice(textState.index));
        if (arr) {
            textState.index += arr[0].length;
            return parseInt(arr[1]);
        } else {
            // Fallback to original method for other formats
            return _Window_Base_obtainEscapeParam.call(this, textState);
        }
    };

    //=============================================================================
    // Smart drawText Override
    // Automatically uses drawTextEx when escape codes are detected
    //=============================================================================

    const _Window_Base_drawText = Window_Base.prototype.drawText;
    Window_Base.prototype.drawText = function(text, x, y, maxWidth, align) {
        // Convert text to string if it isn't already
        const textStr = String(text);

        // Check if text contains our escape codes
        if (textStr.includes('\\i[') || textStr.includes('\\c[')) {
            // Use drawTextEx for text with escape codes
            // We need to handle alignment manually for drawTextEx
            const textWidth = this.textSizeEx(textStr).width;
            let drawX = x;

            if (align === 'center') {
                drawX = x + Math.floor((maxWidth - textWidth) / 2);
            } else if (align === 'right') {
                drawX = x + maxWidth - textWidth;
            }

            this.drawTextEx(textStr, drawX, y, maxWidth);
        } else {
            // Use original drawText for normal text (better performance)
            _Window_Base_drawText.call(this, text, x, y, maxWidth, align);
        }
    };

    // Override Window_Command.drawItem to support escape codes in menu options
    const _Window_Command_drawItem = Window_Command.prototype.drawItem;
    Window_Command.prototype.drawItem = function(index) {
        const commandName = this.commandName(index);

        // Check if command name contains escape codes
        if (typeof commandName === 'string' && (commandName.includes('\\i[') || commandName.includes('\\c['))) {
            const rect = this.itemLineRect(index);
            const align = this.itemTextAlign();
            this.resetTextColor();
            this.changePaintOpacity(this.isCommandEnabled(index));

            // Use drawTextEx for commands with escape codes
            const textWidth = this.textSizeEx(commandName).width;
            let x = rect.x;

            // Handle alignment for escape codes
            if (align === 'center') {
                x = rect.x + Math.floor((rect.width - textWidth) / 2);
            } else if (align === 'right') {
                x = rect.x + rect.width - textWidth;
            }

            this.drawTextEx(commandName, x, rect.y, rect.width);
        } else {
            // Use original method for commands without escape codes
            _Window_Command_drawItem.call(this, index);
        }
    };

    Window_ActorCommand.prototype.refresh = function() {
        this.contents.clear(); // Ensure bitmap is cleared before redraw
        Window_Command.prototype.refresh.call(this);
    };

})();
