/*:
 * @plugindesc v1.2 Adds class system to enemies (Minimal Interference)
 * @target MZ
 * @author Psychronic
 * @url https://psychronic.itch.io
 *
 * @help
 * Enemy Class Plugin
 * This plugin allows you to assign classes to enemies using note tags.
 *
 * Note Tag Usage:
 * <enemy class: ID> - Assigns class with specified ID to the enemy
 * Example: <enemy class: 21> - Gives the enemy class #21
 *
 * The enemy's parameters will be influenced by the class's parameters
 * and traits in addition to their base stats.
 *
 * Note: Class parameters are applied as if the enemy is level 1.
 * Traits from the class are added to the enemy's existing traits.
 * Enemy action patterns are preserved and unaffected by class assignment.
 */
(function() {
    'use strict';

    // Parse note tag for enemy class
    Game_Enemy.prototype.getEnemyClassId = function() {
        if (this._enemyClassId !== undefined) {
            return this._enemyClassId;
        }

        const enemy = $dataEnemies[this._enemyId];
        const note = enemy.note;
        const regex = /<enemy class:\s*(\d+)>/i;
        const match = note.match(regex);
        this._enemyClassId = match ? parseInt(match[1]) : 0;
        return this._enemyClassId;
    };

    // Get class object for the enemy
    Game_Enemy.prototype.getEnemyClass = function() {
        const classId = this.getEnemyClassId();
        return classId > 0 ? $dataClasses[classId] : null;
    };

    // Override paramBase to include class parameters
    const _Game_Enemy_paramBase = Game_Enemy.prototype.paramBase;
    Game_Enemy.prototype.paramBase = function(paramId) {
        let base = _Game_Enemy_paramBase.call(this, paramId);
        const enemyClass = this.getEnemyClass();
        if (enemyClass && enemyClass.params && enemyClass.params[paramId]) {
            // Get class parameter at level 1
            const classParam = enemyClass.params[paramId][1] || 0;
            // Add class parameter to base enemy parameter
            base += classParam;
        }
        return base;
    };

    // Override allTraits to include class traits without breaking the traits() method
    const _Game_Enemy_allTraits = Game_Enemy.prototype.allTraits;
    Game_Enemy.prototype.allTraits = function() {
        let traits = _Game_Enemy_allTraits.call(this);
        const enemyClass = this.getEnemyClass();
        if (enemyClass && enemyClass.traits) {
            traits = traits.concat(enemyClass.traits);
        }
        return traits;
    };

})();
