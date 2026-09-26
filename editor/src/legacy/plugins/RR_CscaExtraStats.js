/*:
 * @target MZ
 * @plugindesc CSCA Extra Stats (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaExtraStats.js
 *
 * Keeps running totals in game variables, for the game's events and the
 * achievements to read:
 *   gold spent and earned at shops, items bought and sold there,
 *   HP damage taken by the party and dealt to enemies (a skill that restores
 *   HP counts as negative damage and lowers the total, as it did in the
 *   original), items used (in battle and from the menu), and gold looted
 *   from won battles.
 * No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param goldSpent
 * @type variable
 * @default 0
 *
 * @param goldGained
 * @type variable
 * @default 0
 *
 * @param itemsBought
 * @type variable
 * @default 0
 *
 * @param itemsSold
 * @type variable
 * @default 0
 *
 * @param damageTaken
 * @type variable
 * @default 0
 *
 * @param damageDealt
 * @type variable
 * @default 0
 *
 * @param itemsUsed
 * @type variable
 * @default 0
 *
 * @param looted
 * @type variable
 * @default 0
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CscaExtraStats');
    const V = {};
    for (const name of ['goldSpent', 'goldGained', 'itemsBought', 'itemsSold', 'damageTaken', 'damageDealt', 'itemsUsed', 'looted']) V[name] = Number(params[name]) || 0;
    // A total set to variable 0 is not kept.
    const add = (name, n) => { if (V[name] > 0) $gameVariables.setValue(V[name], $gameVariables.value(V[name]) + n); };

    const _doBuy = Scene_Shop.prototype.doBuy;
    Scene_Shop.prototype.doBuy = function(number) {
        _doBuy.call(this, number);
        add('itemsBought', number);
        add('goldSpent', number * this.buyingPrice());
    };
    const _doSell = Scene_Shop.prototype.doSell;
    Scene_Shop.prototype.doSell = function(number) {
        _doSell.call(this, number);
        add('itemsSold', number);
        add('goldGained', number * this.sellingPrice());
    };

    // The HP damage as rolled, before it is applied.
    const _executeDamage = Game_Action.prototype.executeDamage;
    Game_Action.prototype.executeDamage = function(target, value) {
        add(target.isActor() ? 'damageTaken' : 'damageDealt', this.isHpEffect() ? value : 0);
        _executeDamage.call(this, target, value);
    };

    // In battle an item action counts as it starts; from the menu, after it is used.
    const _startAction = BattleManager.startAction;
    BattleManager.startAction = function() {
        const action = this._subject && this._subject.currentAction();
        if (action && DataManager.isItem(action.item())) add('itemsUsed', 1);
        _startAction.call(this);
    };
    const _useItem = Scene_Item.prototype.useItem;
    Scene_Item.prototype.useItem = function() {
        _useItem.call(this);
        add('itemsUsed', 1);
    };

    const _gainGold = BattleManager.gainGold;
    BattleManager.gainGold = function() {
        add('looted', $gameTroop.goldTotal());
        _gainGold.call(this);
    };
})();
