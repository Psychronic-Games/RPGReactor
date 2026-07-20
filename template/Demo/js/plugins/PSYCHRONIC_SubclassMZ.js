/*:
 * @target MZ
 * @plugindesc Adds possibility of Sub-Class for Actors with full trait support
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help PSYCHRONIC_SubclassMZ.js
 *
 * This plugin allows actors to have a subclass in addition to their main class.
 *
 * ============================================================================
 * How to Use
 * ============================================================================
 *
 * In the Notes field of an Actor, add:
 * <Subclass: X>
 *
 * Where X is the ID of the class you want as the subclass.
 *
 * Example: <Subclass: 54>
 *
 * IMPORTANT: After adding a subclass tag to an actor, you must either:
 * - Start a new game, OR
 * - Remove and re-add the actor to your party
 *
 * ============================================================================
 * Features
 * ============================================================================
 *
 * - Actor stats are averaged between main class and subclass
 * - Actor learns skills from both main class and subclass
 * - Actor can use skill types from both classes
 * - Actor can equip weapons/armor from both classes
 * - Element rates, state rates, and debuff rates are averaged
 * - Ex-parameters and Sp-parameters are averaged
 * - Attack elements and states are combined from both classes
 * - Special flags and party abilities are combined from both classes
 * - Subclass is displayed in menus alongside main class
 *
 * ============================================================================
 * Plugin Commands
 * ============================================================================
 *
 * Refresh Subclass - Forces an actor to refresh their subclass data
 *   actorId: The ID of the actor to refresh
 *
 * ============================================================================
 * Terms of Use
 * ============================================================================
 *
 * Free for commercial and non-commercial use.
 * Credit Psychronic if you use this plugin.
 *
 * @command refreshSubclass
 * @text Refresh Subclass
 * @desc Forces an actor to refresh their subclass data
 *
 * @arg actorId
 * @text Actor ID
 * @desc The ID of the actor to refresh
 * @type actor
 * @default 1
 */

(() => {
    'use strict';

    const pluginName = 'PSYCHRONIC_SubclassMZ';

    //=============================================================================
    // Plugin Commands
    //=============================================================================

    PluginManager.registerCommand(pluginName, 'refreshSubclass', args => {
        const actorId = parseInt(args.actorId);
        const actor = $gameActors.actor(actorId);
        if (actor) {
            actor.refreshSubclass();
            // [silenced] console.log(`Refreshed subclass for actor ${actor.name()}`);
        }
    });

    //=============================================================================
    // Game_Actor - Subclass System
    //=============================================================================

    // Store original methods
    const _Game_Actor_setup = Game_Actor.prototype.setup;
    const _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    const _Game_BattlerBase_paramRate = Game_BattlerBase.prototype.paramRate;
    const _Game_BattlerBase_xparamRate = Game_BattlerBase.prototype.xparamRate;
    const _Game_BattlerBase_sparamRate = Game_BattlerBase.prototype.sparamRate;
    const _Game_Actor_initSkills = Game_Actor.prototype.initSkills;
    const _Game_Actor_levelUp = Game_Actor.prototype.levelUp;
    const _Game_Actor_traitObjects = Game_Actor.prototype.traitObjects;

    // Get subclass ID from actor notes
    Game_Actor.prototype.subclassId = function() {
        if (this._subclassId === undefined) {
            const actor = this.actor();
            if (!actor) {
                this._subclassId = 0;
                return 0;
            }
            const note = actor.note || '';
            const match = note.match(/<Subclass:\s*(\d+)>/i);
            this._subclassId = match ? parseInt(match[1]) : 0;
        }
        return this._subclassId;
    };

    // Get subclass object
    Game_Actor.prototype.subclass = function() {
        const subclassId = this.subclassId();
        if (subclassId > 0 && $dataClasses[subclassId]) {
            return $dataClasses[subclassId];
        }
        return null;
    };

    // Get subclass name for display
    Game_Actor.prototype.subclassName = function() {
        const subclass = this.subclass();
        return subclass ? subclass.name : '';
    };

    // Force refresh subclass data
    Game_Actor.prototype.refreshSubclass = function() {
        this._subclassId = undefined;
        const subclassId = this.subclassId();
        // [silenced] console.log(`Force refreshed subclass for ${this.name()}: ${subclassId}`);

        // Refresh skills
        this._skills = [];
        this.initSkills();

        // Force HP/MP refresh
        this.recoverAll();
    };

    // Override setup to initialize subclass
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this._subclassId = undefined;
        const subclassId = this.subclassId();

        if (subclassId > 0) {
            // [silenced] console.log(`Setup complete for actor ${this.name()}, subclass: ${this.subclassName()}`);
        }
    };

    // Override traitObjects to include subclass
    Game_Actor.prototype.traitObjects = function() {
        const objects = _Game_Actor_traitObjects.call(this);
        const subclass = this.subclass();
        if (subclass) {
            // Insert subclass after main class but before equipment
            objects.splice(1, 0, subclass);
        }
        return objects;
    };

    // Override paramBase to average between main class and subclass
    Game_Actor.prototype.paramBase = function(paramId) {
        const mainValue = _Game_Actor_paramBase.call(this, paramId);

        const subclass = this.subclass();
        if (subclass) {
            const level = this._level;

            if (!subclass.params || !subclass.params[paramId]) {
                console.warn(`Subclass ${subclass.name} has no params for paramId ${paramId}`);
                return mainValue;
            }

            const subTable = subclass.params[paramId];

            if (level < 1 || level > 99) {
                console.warn(`Invalid level ${level} for actor ${this.name()}`);
                return mainValue;
            }

            const subValue = subTable[level] || 0;

            return Math.floor((mainValue + subValue) / 2);
        }

        return mainValue;
    };

    // Override paramRate to average trait multipliers (Max HP%, Max MP%, ATK%, etc.)
    Game_BattlerBase.prototype.paramRate = function(paramId) {
        const baseRate = _Game_BattlerBase_paramRate.call(this, paramId);

        if (this instanceof Game_Actor && this.subclass && this.subclass()) {
            const mainClass = this.currentClass();
            const subclass = this.subclass();

            let mainRate = 1.0;
            if (mainClass.traits) {
                for (const trait of mainClass.traits) {
                    if (trait.code === 21 && trait.dataId === paramId) {
                        mainRate *= trait.value;
                    }
                }
            }

            let subRate = 1.0;
            if (subclass.traits) {
                for (const trait of subclass.traits) {
                    if (trait.code === 21 && trait.dataId === paramId) {
                        subRate *= trait.value;
                    }
                }
            }

            const averagedRate = (mainRate + subRate) / 2;
            return averagedRate * (baseRate / this.classTraitRate(paramId));
        }

        return baseRate;
    };

    // Override xparamRate to average ex-parameters (hit rate, evasion, crit rate, etc.)
    Game_BattlerBase.prototype.xparamRate = function(xparamId) {
        const baseRate = _Game_BattlerBase_xparamRate.call(this, xparamId);

        if (this instanceof Game_Actor && this.subclass && this.subclass()) {
            const mainClass = this.currentClass();
            const subclass = this.subclass();

            let mainBonus = 0;
            if (mainClass.traits) {
                for (const trait of mainClass.traits) {
                    if (trait.code === 22 && trait.dataId === xparamId) {
                        mainBonus += trait.value;
                    }
                }
            }

            let subBonus = 0;
            if (subclass.traits) {
                for (const trait of subclass.traits) {
                    if (trait.code === 22 && trait.dataId === xparamId) {
                        subBonus += trait.value;
                    }
                }
            }

            const averagedBonus = (mainBonus + subBonus) / 2;
            const classBonus = this.classXparamBonus(xparamId);

            return baseRate - classBonus + averagedBonus;
        }

        return baseRate;
    };

    // Override sparamRate to average sp-parameters (aggro, guard effect, etc.)
    Game_BattlerBase.prototype.sparamRate = function(sparamId) {
        const baseRate = _Game_BattlerBase_sparamRate.call(this, sparamId);

        if (this instanceof Game_Actor && this.subclass && this.subclass()) {
            const mainClass = this.currentClass();
            const subclass = this.subclass();

            let mainRate = 1.0;
            if (mainClass.traits) {
                for (const trait of mainClass.traits) {
                    if (trait.code === 23 && trait.dataId === sparamId) {
                        mainRate *= trait.value;
                    }
                }
            }

            let subRate = 1.0;
            if (subclass.traits) {
                for (const trait of subclass.traits) {
                    if (trait.code === 23 && trait.dataId === sparamId) {
                        subRate *= trait.value;
                    }
                }
            }

            const averagedRate = (mainRate + subRate) / 2;
            const classRate = this.classSparamRate(sparamId);

            return (baseRate / classRate) * averagedRate;
        }

        return baseRate;
    };

    // Helper methods to get class-only trait values
    Game_Actor.prototype.classTraitRate = function(paramId) {
        const mainClass = this.currentClass();
        let rate = 1.0;
        if (mainClass.traits) {
            for (const trait of mainClass.traits) {
                if (trait.code === 21 && trait.dataId === paramId) {
                    rate *= trait.value;
                }
            }
        }
        return rate;
    };

    Game_Actor.prototype.classXparamBonus = function(xparamId) {
        const mainClass = this.currentClass();
        let bonus = 0;
        if (mainClass.traits) {
            for (const trait of mainClass.traits) {
                if (trait.code === 22 && trait.dataId === xparamId) {
                    bonus += trait.value;
                }
            }
        }
        return bonus;
    };

    Game_Actor.prototype.classSparamRate = function(sparamId) {
        const mainClass = this.currentClass();
        let rate = 1.0;
        if (mainClass.traits) {
            for (const trait of mainClass.traits) {
                if (trait.code === 23 && trait.dataId === sparamId) {
                    rate *= trait.value;
                }
            }
        }
        return rate;
    };

    // Override initSkills to include subclass skills
    Game_Actor.prototype.initSkills = function() {
        _Game_Actor_initSkills.call(this);

        const subclass = this.subclass();
        if (subclass) {
            const level = this._level;

            if (subclass.learnings) {
                for (const learning of subclass.learnings) {
                    if (learning.level <= level) {
                        this.learnSkill(learning.skillId);
                    }
                }
            }
        }
    };

    // Override levelUp to learn subclass skills
    Game_Actor.prototype.levelUp = function() {
        _Game_Actor_levelUp.call(this);

        const subclass = this.subclass();
        if (subclass) {
            const level = this._level;

            if (subclass.learnings) {
                for (const learning of subclass.learnings) {
                    if (learning.level === level) {
                        this.learnSkill(learning.skillId);
                    }
                }
            }
        }
    };

    //=============================================================================
    // DataManager - Refresh actors on load
    //=============================================================================

    const _DataManager_loadGame = DataManager.loadGame;
    DataManager.loadGame = function(savefileId) {
        const result = _DataManager_loadGame.call(this, savefileId);
        if (result) {
            $gameParty.allMembers().forEach(actor => {
                if (actor) {
                    actor._subclassId = undefined;
                    actor.subclassId();
                }
            });
        }
        return result;
    };

    //=============================================================================
    // Window_StatusBase - Display Subclass (Base for all status windows)
    //=============================================================================

    const _Window_StatusBase_drawActorClass = Window_StatusBase.prototype.drawActorClass;

    Window_StatusBase.prototype.drawActorClass = function(actor, x, y, width) {
        width = width || 168;

        if (actor.subclass && actor.subclass()) {
            const mainClassName = actor.currentClass().name;
            const subClassName = actor.subclass().name;
            const fullText = mainClassName + " " + subClassName;
            this.resetTextColor();
            this.drawText(fullText, x, y, width, 'center');
        } else {
            _Window_StatusBase_drawActorClass.call(this, actor, x, y, width);
        }
    };

    //=============================================================================
    // Window_Status - Display Subclass Details
    //=============================================================================

    const _Window_Status_drawBlock2 = Window_Status.prototype.drawBlock2;

    Window_Status.prototype.drawBlock2 = function(y) {
        _Window_Status_drawBlock2.call(this, y);

        if (this._actor && this._actor.subclass && this._actor.subclass()) {
            const lineHeight = this.lineHeight();
            const x = this.colSpacing() / 2;
            const width = this.innerWidth - x * 2;

            this.changeTextColor(ColorManager.systemColor());
            this.drawText("Subclass", x, y + lineHeight * 2, width, 'center');
            this.resetTextColor();
            this.drawText(this._actor.subclass().name, x + 160, y + lineHeight * 2, width - 160);
        }
    };

    //=============================================================================
    // Compatibility with Custom Menu Plugins
    //=============================================================================

    const _Window_Base_drawActorClass = Window_Base.prototype.drawActorClass;

    Window_Base.prototype.drawActorClass = function(actor, x, y, width) {
        width = width || 168;

        if (actor && actor.subclass && typeof actor.subclass === 'function' && actor.subclass()) {
            const mainClassName = actor.currentClass().name;
            const subClassName = actor.subclass().name;
            const fullText = mainClassName + " " + subClassName;
            this.changeTextColor(ColorManager.textColor(6));
            this.drawText(fullText, x, y, width, 'center');
        } else {
            _Window_Base_drawActorClass.call(this, actor, x, y, width);
        }
    };

})();
