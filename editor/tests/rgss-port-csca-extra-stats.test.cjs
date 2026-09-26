'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_CscaExtraStats.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_CscaExtraStats.params.js'));

const SCRIPT = `module CSCA_EXTRA_STATS
  GOLDSPENT = 81 # Variable ID. Stores the amount of gold spent on items at shops.
  GOLDGAINED = 82 # Variable ID. Stores amount of gold made from selling to shops.
  ITEMSBOUGHT = 83 # Variable ID. Stores amount of items bought from shops.
  ITEMSSOLD = 84 # Variable ID. Stores amount of items sold to shops.
  DAMAGE_TAKEN = 85 # Variable ID. Stores damage dealt to actors.
  DAMAGE_DEALT = 86 # Variable ID. Stores damage dealt to enemies.
  ITEMS_USED = 87 # Variable ID. Stores amount of items used.
  LOOTED = 88 # Variable ID. Stores amount of gold looted from enemies.
end
$imported = {} if $imported.nil?
$imported["CSCA-ExtraStats"] = true`;

test('CSCA Extra Stats: detected, variable IDs from the game\'s copy', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('cscaExtraStats'));
    assert.deepEqual(extract({ constants: C.scriptConstants([SCRIPT]) }), { goldSpent: '81', goldGained: '82', itemsBought: '83', itemsSold: '84', damageTaken: '85', damageDealt: '86', itemsUsed: '87', looted: '88' });
});

function load() {
    const vars = {}, log = [];
    function Scene_Shop() {}
    Scene_Shop.prototype.doBuy = function(n) { log.push('buy ' + n); };
    Scene_Shop.prototype.doSell = function(n) { log.push('sell ' + n); };
    Scene_Shop.prototype.buyingPrice = function() { return 30; };
    Scene_Shop.prototype.sellingPrice = function() { return 15; };
    function Game_Action(hp) { this._hp = hp; }
    Game_Action.prototype.isHpEffect = function() { return this._hp; };
    Game_Action.prototype.executeDamage = function() { log.push('damage'); };
    function Scene_Item() {}
    Scene_Item.prototype.useItem = function() { log.push('used'); };
    const BattleManager = { startAction() { log.push('start'); }, gainGold() { log.push('gain'); } };
    const ctx = {
        Scene_Shop, Game_Action, Scene_Item, BattleManager,
        PluginManager: { parameters: () => extract({ constants: C.scriptConstants([SCRIPT]) }) },
        $gameVariables: { value: (id) => vars[id] || 0, setValue: (id, v) => { vars[id] = v; } },
        $gameTroop: { goldTotal: () => 120 },
        DataManager: { isItem: (item) => !!(item && item.item) }
    };
    vm.runInNewContext(source, ctx);
    return { ctx, vars, log };
}

test('CSCA Extra Stats: shop, damage, items used and loot add to their variables', () => {
    const { ctx, vars, log } = load();
    const shop = new ctx.Scene_Shop();
    shop.doBuy(3);
    shop.doSell(2);
    assert.deepEqual([vars[81], vars[82], vars[83], vars[84]], [90, 30, 3, 2]);
    const actor = { isActor: () => true }, enemy = { isActor: () => false };
    new ctx.Game_Action(true).executeDamage(enemy, 40);
    new ctx.Game_Action(true).executeDamage(actor, 12);
    new ctx.Game_Action(true).executeDamage(actor, -5);   // a heal lowers the damage taken
    new ctx.Game_Action(false).executeDamage(enemy, 99);  // MP damage is not counted
    assert.deepEqual([vars[85], vars[86]], [7, 40]);
    const item = { item: true }, skill = {};
    ctx.BattleManager._subject = { currentAction: () => ({ item: () => item }) };
    ctx.BattleManager.startAction();
    ctx.BattleManager._subject = { currentAction: () => ({ item: () => skill }) };
    ctx.BattleManager.startAction();
    new ctx.Scene_Item().useItem();
    assert.equal(vars[87], 2);
    ctx.BattleManager.gainGold();
    assert.equal(vars[88], 120);
    assert.deepEqual(log, ['buy 3', 'sell 2', 'damage', 'damage', 'damage', 'damage', 'start', 'start', 'used', 'gain']);
});
