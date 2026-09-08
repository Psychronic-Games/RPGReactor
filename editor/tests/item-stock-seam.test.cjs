/**
 * "Can this battler use the item" and "is there any left" are separate questions.
 *
 * `meetsItemConditions` used to fuse them, so a plugin that prepays or waives an
 * item's cost had no way to drop the stock check alone: it had to replace
 * `meetsItemConditions` or `Game_Action.isValid` and reimplement the condition
 * chain, which silently drops any condition added to that chain later.
 * `hasItemStock` is the seam. Overriding it waives stock and nothing else --
 * including conditions a third party has aliased onto `meetsItemConditions`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime/reactor_objects.js'), 'utf8');

/** One shipped `Game_BattlerBase.prototype.<name> = function ... };` verbatim. */
function methodSource(klass, name) {
    const head = `${klass}.prototype.${name} = function(`;
    const start = objectsSource.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${klass}.prototype.${name}`);
    const end = objectsSource.indexOf('\n};\n', start);
    return objectsSource.slice(start, end + 4);
}

/**
 * A battler carrying the shipped usability methods, over a party whose stock and
 * a battler whose mobility the caller controls.
 */
function battlerFor({ inStock = true, canMove = true, inBattle = true } = {}) {
    const context = {
        Game_BattlerBase: function() {},
        Game_Action: function() {},
        DataManager: { isSkill: () => false, isItem: () => true },
        $gameParty: { inBattle: () => inBattle, hasItem: () => inStock },
        console,
    };
    vm.runInNewContext([
        methodSource('Game_BattlerBase', 'isOccasionOk'),
        methodSource('Game_BattlerBase', 'meetsUsableItemConditions'),
        methodSource('Game_BattlerBase', 'meetsItemConditions'),
        methodSource('Game_BattlerBase', 'hasItemStock'),
        methodSource('Game_BattlerBase', 'canUse'),
        methodSource('Game_Action', 'isValid'),
        'Game_BattlerBase.prototype.canMove = function() { return this._canMove !== false; };',
        'Game_BattlerBase.prototype.meetsSkillConditions = function() { return true; };',
        'Game_Action.prototype.item = function() { return this._item; };',
        'Game_Action.prototype.subject = function() { return this._subject; };',
    ].join('\n'), context);
    const battler = new context.Game_BattlerBase();
    battler._canMove = canMove;
    return { battler, context };
}

const potion = { occasion: 0 };

test('the stock check is reached through hasItemStock, not $gameParty directly', () => {
    assert.ok(
        /hasItemStock\(item\)/.test(methodSource('Game_BattlerBase', 'meetsItemConditions')),
        'meetsItemConditions delegates the stock question');
    assert.ok(
        /\$gameParty\.hasItem\(item\)/.test(methodSource('Game_BattlerBase', 'hasItemStock')),
        'hasItemStock is the one that asks the party');
});

test('default behaviour is unchanged: stock still gates usability', () => {
    assert.equal(battlerFor({ inStock: true }).battler.meetsItemConditions(potion), true);
    assert.equal(battlerFor({ inStock: false }).battler.meetsItemConditions(potion), false);
});

test('the other conditions are unaffected by the split', () => {
    assert.equal(battlerFor({ canMove: false }).battler.meetsItemConditions(potion), false,
        'a battler who cannot move still cannot use an item');
    assert.equal(battlerFor().battler.meetsItemConditions({ occasion: 2 }), false,
        'a menu-only item is still refused in battle');
});

test('overriding hasItemStock alone waives stock and nothing else', () => {
    const { battler } = battlerFor({ inStock: false });
    battler.hasItemStock = () => true;

    assert.equal(battler.meetsItemConditions(potion), true,
        'the prepaid item is usable with an empty bag');

    battler._canMove = false;
    assert.equal(battler.meetsItemConditions(potion), false,
        'waiving stock does not waive can-move');
    battler._canMove = true;
    assert.equal(battler.meetsItemConditions({ occasion: 2 }), false,
        'waiving stock does not waive occasion');
});

test('a condition aliased onto meetsItemConditions by a plugin still runs', () => {
    // Stands in for VisuMZ_1_ItemsEquipsCore, which aliases meetsItemConditions
    // and adds its switch and JS notetag conditions on top of the engine's.
    const { battler, context } = battlerFor({ inStock: false });
    const engineMeets = context.Game_BattlerBase.prototype.meetsItemConditions;
    context.Game_BattlerBase.prototype.meetsItemConditions = function(item) {
        if (!engineMeets.call(this, item)) return false;
        return item.pluginConditionOk !== false;
    };
    battler.hasItemStock = () => true;

    assert.equal(battler.meetsItemConditions({ occasion: 0, pluginConditionOk: true }), true,
        'stock waived, plugin condition met');
    assert.equal(battler.meetsItemConditions({ occasion: 0, pluginConditionOk: false }), false,
        'the plugin condition is still consulted -- this is what replacing the chain lost');
});

test('Game_Action.isValid reaches the seam through canUse', () => {
    const { battler, context } = battlerFor({ inStock: false });
    const action = new context.Game_Action();
    action._item = potion;
    action._subject = battler;

    assert.equal(action.isValid(), false, 'out of stock, so not valid');
    battler.hasItemStock = () => true;
    assert.equal(action.isValid(), true, 'the override reaches all the way up to isValid');
});
