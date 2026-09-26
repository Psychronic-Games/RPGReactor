/*:
 * @target MZ
 * @plugindesc Enemy Reinforcements and Large Troops (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeEnemyReinforcements.js
 *
 * Enemies join a battle in progress: a whole troop, or one member of a
 * troop, at the positions set in that troop (the new ones are drawn over
 * the others). A troop's members can be hidden again as a group, and events
 * can ask whether any of a troop's members is still standing.
 *   this.rrAddTroop(troopId)
 *   this.rrAddEnemy(troopId, memberNumber)
 *   this.rrRemoveTroop(troopId)
 *   this.rrTroopExists(troopId)
 * Reinforcements keep the troop's own positions: they are not moved onto
 * the larger screen as the battle's first troop is.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const _setup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _setup.call(this, troopId);
        for (const enemy of this._enemies) enemy.rrTroopId = troopId;
    };
    Game_Troop.prototype.rrAddMember = function(member, troopId) {
        const enemy = new Game_Enemy(member.enemyId, member.x, member.y);
        if (member.hidden) enemy.hide();
        enemy.rrTroopId = troopId;
        this._enemies.push(enemy);
        this.makeUniqueNames();
        return enemy;
    };
    const refresh = () => {
        const scene = SceneManager._scene;
        if (scene instanceof Scene_Battle && scene.rrRefreshEnemies) scene.rrRefreshEnemies();
    };
    Game_Troop.prototype.rrAddTroop = function(troopId) {
        const troop = $dataTroops[troopId];
        if (!troop) return;
        for (const member of troop.members) if (member && $dataEnemies[member.enemyId]) this.rrAddMember(member, troopId);
        refresh();
    };
    Game_Troop.prototype.rrAddEnemy = function(troopId, index) {
        const member = $dataTroops[troopId] && $dataTroops[troopId].members[index - 1];
        if (!member) return;
        this.rrAddMember(member, troopId);
        refresh();
    };
    Game_Troop.prototype.rrRemoveTroop = function(troopId) {
        for (const enemy of this._enemies) if (enemy.rrTroopId === troopId) enemy.hide();
    };

    Game_Interpreter.prototype.rrAddTroop = function(troopId) { $gameTroop.rrAddTroop(Number(troopId)); };
    Game_Interpreter.prototype.rrAddEnemy = function(troopId, index) { $gameTroop.rrAddEnemy(Number(troopId), Number(index)); };
    Game_Interpreter.prototype.rrRemoveTroop = function(troopId) { $gameTroop.rrRemoveTroop(Number(troopId)); };
    Game_Interpreter.prototype.rrTroopExists = function(troopId) {
        return $gameTroop.aliveMembers().some(enemy => enemy.rrTroopId === Number(troopId));
    };

    Spriteset_Battle.prototype.rrRefreshNewEnemies = function() {
        const known = this._enemySprites.map(sprite => sprite._battler);
        for (const enemy of $gameTroop.members()) {
            if (known.includes(enemy)) continue;
            const sprite = new Sprite_Enemy(enemy);
            this._enemySprites.push(sprite);
            this._battleField.addChild(sprite);
        }
    };
    Scene_Battle.prototype.rrRefreshEnemies = function() {
        this._spriteset.rrRefreshNewEnemies();
        this._enemyWindow.refresh();
    };
})();
