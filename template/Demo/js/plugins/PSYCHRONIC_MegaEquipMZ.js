/*:
 * @target MZ
 * @plugindesc Adds Extra Functionality to Equipping in RPG Maker MZ.
 * @author Psychronic
 * @url https://psychronic.itch.io
 * @help PSYCHRONIC_MegaEquipMZ.js
 *
 * ============================================================================
 * Notetags
 * ============================================================================
 *
 * You can use the following notetags to change a class's equipment setup.
 *
 * Class Notetags:
 * <Equip Slot: x> Example: <Equip Slot: 1, 2, 3, 4, 5, 5, 5, 5>
 * <Equip Slot: x, x, x>
 * Changes this class's equipment slots to x. Using repeating numbers makes
 * it so that equipment type is duplicated and that the class can equip
 * multiple equipment of that type. To find the Equipment Type ID, go to your
 * database's Types tab and look for the ID type.
 *
 * If you don't like the above method for setting equipment slots, you can
 * use the following notetags instead:
 *
 * <Equip Slot> Example: <Equip Slot>
 * string Weapon
 * string Armor
 * string Accessory
 * string Accessory
 * </Equip Slot> </Equip Slot>
 * Replace 'string' with the Equipment type's name entry. This is case
 * sensitive so if the string does not match a name entry perfectly, the slot
 * will not be granted to the class. Multiple copies of a name entry would
 * mean the class can equip multiple equipment of that type. Everything works
 * the same as the previous notetag.
 *
 * Weapon and Armor Notetags:
 * <stat: +x>
 * <stat: -x>
 * Allows the piece of weapon or armor to gain or lose x amount of stat.
 * Replace "stat" with "hp", "mp", "atk", "def", "mat", "mdf", "agi", or
 * "luk" to alter that specific stat. This allows the piece of equipment
 * to go past the editor's default limitation so long as the maximum value
 * allows for it. Changes made here are ADDED to the editor's Parameter Changes.
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_MegaEquipMZ';

    //=============================================================================
    // DataManager
    //=============================================================================

    const DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!DataManager_isDatabaseLoaded.call(this)) return false;
        if (!DataManager._psychronicEquipLoaded) {
            this.processPsychronicEquipNotetags();
            DataManager._psychronicEquipLoaded = true;
        }
        return true;
    };

    DataManager.processPsychronicEquipNotetags = function() {
        // [silenced] console.log('=== MegaEquip: Processing Database Notetags ===');

        // Process Class notetags
        for (let i = 1; i < $dataClasses.length; i++) {
            if ($dataClasses[i]) {
                this.processClassEquipSlots($dataClasses[i]);
            }
        }

        // Process Weapon notetags
        let weaponCount = 0;
        for (let i = 1; i < $dataWeapons.length; i++) {
            if ($dataWeapons[i]) {
                this.processEquipmentStats($dataWeapons[i]);
                weaponCount++;
            }
        }

        // Process Armor notetags
        let armorCount = 0;
        for (let i = 1; i < $dataArmors.length; i++) {
            if ($dataArmors[i]) {
                this.processEquipmentStats($dataArmors[i]);
                armorCount++;
            }
        }
        // [silenced] console.log(`MegaEquip: Processed ${weaponCount} weapons and ${armorCount} armor pieces`);
        // [silenced] console.log('=== MegaEquip: Database Processing Complete ===');
    };


    DataManager.processClassEquipSlots = function(classData) {
        classData.customEquipSlots = null;

        const notedata = classData.note.split(/[\r\n]+/);
        let inEquipSlotBlock = false;
        let equipSlotNames = [];

        for (let i = 0; i < notedata.length; i++) {
            const line = notedata[i];

            // Check for numeric format: <Equip Slot: 1, 2, 3, 4, 5>
            if (line.match(/<Equip Slot:\s*(.+)>/i)) {
                const slotString = RegExp.$1;
                const slots = slotString.split(',').map(s => parseInt(s.trim()));
                classData.customEquipSlots = slots.filter(s => !isNaN(s) && s > 0);
                return; // Exit early if we found numeric format
            }

            // Check for string format start: <Equip Slot>
            if (line.match(/<Equip Slot>/i)) {
                inEquipSlotBlock = true;
                equipSlotNames = [];
                continue;
            }

            // Check for string format end: </Equip Slot>
            if (line.match(/<\/Equip Slot>/i)) {
                inEquipSlotBlock = false;
                // Convert equipment type names to IDs
                if (equipSlotNames.length > 0) {
                    classData.customEquipSlots = equipSlotNames.map(name => {
                        return this.getEquipTypeIdByName(name);
                    }).filter(id => id > 0);
                }
                return;
            }

            // Collect equipment type names
            if (inEquipSlotBlock) {
                const trimmedLine = line.trim();
                if (trimmedLine.length > 0) {
                    equipSlotNames.push(trimmedLine);
                }
            }
        }
    };

    DataManager.getEquipTypeIdByName = function(name) {
        const equipTypes = $dataSystem.equipTypes;
        for (let i = 1; i < equipTypes.length; i++) {
            if (equipTypes[i] === name) {
                return i;
            }
        }
        return 0; // Return 0 if not found
    };

    DataManager.processEquipmentStats = function(equipData) {
        equipData.customParams = [0, 0, 0, 0, 0, 0, 0, 0]; // hp, mp, atk, def, mat, mdf, agi, luk

        const notedata = equipData.note.split(/[\r\n]+/);
        const paramMap = {
            'hp': 0, 'mp': 1, 'atk': 2, 'def': 3,
            'mat': 4, 'mdf': 5, 'agi': 6, 'luk': 7
        };

        for (let i = 0; i < notedata.length; i++) {
            const line = notedata[i];

            // Match <stat: +x> or <stat: -x>
            if (line.match(/<(.+):\s*([+-]\d+)>/i)) {
                const stat = RegExp.$1.toLowerCase().trim();
                const value = parseInt(RegExp.$2);

                if (paramMap.hasOwnProperty(stat)) {
                    const paramIndex = paramMap[stat];
                    equipData.customParams[paramIndex] = value;
                }
            }
        }
    };

    //=============================================================================
    // Game_Actor
    //=============================================================================

    const Game_Actor_equipSlots = Game_Actor.prototype.equipSlots;
    Game_Actor.prototype.equipSlots = function() {
        const classData = this.currentClass();
        if (classData && classData.customEquipSlots && classData.customEquipSlots.length > 0) {
            return classData.customEquipSlots.slice(); // Return a copy
        }
        return Game_Actor_equipSlots.call(this);
    };

    // Override initEquips to properly handle custom equipment slots
    const Game_Actor_initEquips = Game_Actor.prototype.initEquips;
    Game_Actor.prototype.initEquips = function(equips) {
        const slots = this.equipSlots();
        const maxSlots = slots.length;

        // Initialize all slots as empty
        this._equips = [];
        for (let i = 0; i < maxSlots; i++) {
            this._equips[i] = new Game_Item();
        }

        // Place each equipment item in the correct slot
        for (let j = 0; j < equips.length; j++) {
            if (j >= maxSlots) break; // Don't exceed slot count

            const itemId = equips[j];
            if (itemId <= 0) continue;

            // Determine if this position expects a weapon or armor
            const slotType = slots[j];
            const isWeaponSlot = (slotType === 1);

            // Get the actual item
            const item = isWeaponSlot ? $dataWeapons[itemId] : $dataArmors[itemId];
            if (!item) continue;

            // Find the first empty slot that matches this item's type
            for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
                if (slots[slotIndex] === item.etypeId && !this._equips[slotIndex].object()) {
                    this._equips[slotIndex].setEquip(isWeaponSlot, itemId);
                    break;
                }
            }
        }

        this.releaseUnequippableItems(true);
        this.refresh();
    };


    //=============================================================================
    // Game_Actor - Fix equipment slot mismatches during load
    //=============================================================================

    // Override releaseUnequippableItems to fix equipment that's in wrong slots
    const Game_Actor_releaseUnequippableItems = Game_Actor.prototype.releaseUnequippableItems;
    Game_Actor.prototype.releaseUnequippableItems = function(forcing) {
        const slots = this.equipSlots();
        const equips = this.equips();

        // First, collect all equipped items that are in wrong slots
        const misplacedItems = [];
        for (let i = 0; i < equips.length; i++) {
            const item = equips[i];
            if (item && this.canEquip(item) && item.etypeId !== slots[i]) {
                // Item is equippable but in wrong slot type
                misplacedItems.push({ item: item, wrongSlot: i });
            }
        }

        // If we have misplaced items, try to relocate them before releasing
        if (misplacedItems.length > 0) {
            for (const {item, wrongSlot} of misplacedItems) {
                // Find correct slot for this item
                let correctSlot = -1;
                for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
                    if (slots[slotIndex] === item.etypeId && !equips[slotIndex]) {
                        correctSlot = slotIndex;
                        break;
                    }
                }

                if (correctSlot >= 0) {
                    // Move item to correct slot
                    this._equips[correctSlot].setObject(item);
                    this._equips[wrongSlot].setObject(null);
                }
            }
        }

        // Now run the normal release logic
        Game_Actor_releaseUnequippableItems.call(this, forcing);
    };

    //=============================================================================
    // Game_Actor - Equipment Parameter Calculation
    //=============================================================================

    // Override paramPlus to add both vanilla equipment stats AND custom notetag bonuses
    const Game_Actor_paramPlus = Game_Actor.prototype.paramPlus;
    Game_Actor.prototype.paramPlus = function(paramId) {
        // Start with base bonuses (buffs, states, etc) from Game_Battler
        let value = Game_Battler.prototype.paramPlus.call(this, paramId);

        // Add equipment bonuses (both vanilla params AND custom notetag params)
        const equips = this.equips();
        for (const item of equips) {
            if (item) {
                // Add vanilla equipment stat from database editor
                if (item.params && item.params[paramId] !== undefined) {
                    value += item.params[paramId];
                }
                // Add custom notetag bonus (if any)
                if (item.customParams && item.customParams[paramId]) {
                    value += item.customParams[paramId];
                }
            }
        }

        return value;
    };

})();
