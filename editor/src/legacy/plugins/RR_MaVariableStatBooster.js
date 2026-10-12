/*:
 * @target MZ
 * @plugindesc Variable Stat Booster for Enemies (VX), for imported games
 * @author modern algebra (rmrk.net); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_MaVariableStatBooster.js
 *
 * Enemies' stats are a percentage of their database value, each stat from a
 * variable of its own: a variable at 120 makes the stat 120%. An enemy's
 * note \BOOSTn[v] reads stat n from variable v instead. As in the script, a
 * variable at 0 (or below) leaves the stat at 1.
 *
 * The stats follow the variables at every moment, as the script read them:
 * an enemy made while a variable was 0 starts with 1 HP until an event gives
 * it its new maximum.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param stats
 * @text Boosted stats
 * @desc maxhp, maxmp, atk, def, spi, agi, hit, eva, gold, exp, in order.
 * @default ["maxhp","maxmp","atk","def","spi","agi","exp"]
 *
 * @param variables
 * @text Variables
 * @desc One variable for each stat above (or one for all).
 * @default [40,41,42,43,44,45,46]
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_MaVariableStatBooster');
    const json = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : v; } catch (_) { return d; } };
    const STATS = json(P.stats, ['maxhp', 'maxmp', 'atk', 'def', 'spi', 'agi', 'exp']);
    const VARS = json(P.variables, [40, 41, 42, 43, 44, 45, 46]);
    const varFor = (enemy, index) => {
        const m = new RegExp('\\\\BOOST' + index + '\\[(\\d+)\\]', 'i').exec((enemy && enemy.note) || '');
        if (m) return Number(m[1]);
        return Array.isArray(VARS) ? VARS[index] : VARS;
    };
    /** The boosted value: var% of the stat, 1 when that comes to nothing. */
    const boost = (enemyData, stat, value) => {
        const index = STATS.indexOf(stat);
        if (index < 0) return value;
        const id = varFor(enemyData, index);
        let v = $gameVariables ? Number($gameVariables.value(id)) : NaN;
        v = (v * value) / 100;
        if (!Number.isFinite(v) || v <= 0) v = 1;
        return Math.trunc(v);
    };
    window.RRMaVariableStatBooster = { boost, STATS };
    const VX = window.RRThrallVx;
    const KEYS = ['maxhp', 'maxmp', 'atk', 'def', 'spi', 'agi'];
    if (VX && Game_Enemy.prototype.rrVxEnemyStat) {
        const _stat = Game_Enemy.prototype.rrVxEnemyStat;
        Game_Enemy.prototype.rrVxEnemyStat = function(i) { return boost(this.enemy(), KEYS[i], _stat.call(this, i)); };
        const _exp = Game_Enemy.prototype.rrVxExp;
        Game_Enemy.prototype.rrVxExp = function() { return boost(this.enemy(), 'exp', _exp.call(this)); };
        const _gold = Game_Enemy.prototype.rrVxGold;
        Game_Enemy.prototype.rrVxGold = function() { return boost(this.enemy(), 'gold', _gold.call(this)); };
        const _hit = Game_Enemy.prototype.rrVxHit;
        Game_Enemy.prototype.rrVxHit = function() { return boost(this.enemy(), 'hit', _hit.call(this)); };
        const _eva = Game_Enemy.prototype.rrVxEva;
        Game_Enemy.prototype.rrVxEva = function() { return boost(this.enemy(), 'eva', _eva.call(this)); };
    } else {
        // Without the VX battle rules: MZ's parameters (spirit is both magic stats) and rewards.
        const PARAM = { 0: 'maxhp', 1: 'maxmp', 2: 'atk', 3: 'def', 4: 'spi', 5: 'spi', 6: 'agi' };
        const _paramBase = Game_Enemy.prototype.paramBase;
        Game_Enemy.prototype.paramBase = function(paramId) { return PARAM[paramId] ? boost(this.enemy(), PARAM[paramId], _paramBase.call(this, paramId)) : _paramBase.call(this, paramId); };
        const _exp = Game_Enemy.prototype.exp;
        Game_Enemy.prototype.exp = function() { return boost(this.enemy(), 'exp', _exp.call(this)); };
        const _gold = Game_Enemy.prototype.gold;
        Game_Enemy.prototype.gold = function() { return boost(this.enemy(), 'gold', _gold.call(this)); };
    }
})();
