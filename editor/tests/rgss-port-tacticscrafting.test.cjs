const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));
// Values made in the vm context compare across realms once copied.
const plain = (v) => JSON.parse(JSON.stringify(v));

// Snippets of the game's copies of the scripts (Dreamwalker).
const CRAFTING = `$imported ||= {}
$imported["BubsTOCrafting"] = 2.04
module Bubs
  module TOCrafting
  INGREDIENTS_HEADER_TEXT = "Components" # Header text
  INGREDIENTS_PAGE_SIZE = 6 # 6 is recommended for 640x480 resolutions
  NOT_ENOUGH_INGREDIENTS_COLOR = 10 # Windowskin color index, default 10 (red)
  INGREDIENTS_VIEW_MORE_FOOTER_TEXT = "More Parts →"
  CRAFTING_FEE_PRICE_RATE = 10
  USE_GOLD_WINDOW = true
  GOLD_WINDOW_ICON_INDEX = 424 # Icon Index number
  GOLD_WINDOW_TEXT = "Zenar"
  RECIPEBOOK_PICTURES_DIRECTORY = "Graphics/Pictures/"
  CRAFTING_RESULT_SE = [   "682915__qleq__wheel-dismantling",     100,   100]
  NEXT_INGREDIENT_PAGE_BUTTON = :RIGHT
  end # module TOCrafting
end # module Bubs
class Game_Interpreter
  def call_tocrafting_scene(*args)
    SceneManager.call(Scene_TOCrafting)
    SceneManager.scene.prepare(args)
  end
end`;
const INFO_PAGES = `$imported["BubsInfoPages"] = 1.01
module Bubs
  module InfoPages
  PAGE_BUTTONS = {
    :next_info_page     => :SHIFT,
    :prev_info_page     => :SHIFT,
  } # <- Do not delete.
  PAGE_BUTTON_ICONS = {
    :next_info_page     => 0, # Next Info Page Button Icon Index
    :prev_info_page     => 0, # Previous Info Page Button Icon Index
  } # <- Do not delete.
  NORMAL_FOOTER_TEXT                = ""
  ACTOR_ICONS = {
  # actor_id => icon_index,
           1 => 16,
           2 => 16,
  } # <- Do not delete.
  PAGE_CHANGE_SE = ["Cursor",     80,   100]
  end
end`;
const DISMANTLE = `$imported = {} if $imported.nil?
$imported["BubsDismantle"] = true
module Bubs
  module Dismantle
  DISMANTLE_COMMAND_TEXT = "Dismantle"
  SHOP_CATEGORIES = [:items, :weapons, :armors]
  DEFAULT_DISMANTLE_CHANCE = 100 # (%)
  SHOW_DISMANTLE_CHANCE = false
  DEFAULT_DISMANTLE_FEE = 10
  DISMANTLE_FEE_TEXT = "Cost" # Dismantle Gold Fee Text
  DISMANTLABLE_ITEMS_LIST_TEXT = "Parts" # Items List Text
  DISMANTLABLE_COUNTER_TEXT    = "Dismantled Count" # Dismantle Counter Text
  RESULTS_HEADER_TEXT          = "You Received" # Results Header Window Text
  DISMANTLE_SE = [  "682915__qleq__wheel-dismantling",     100,   100]
  end # module Dismantle
end # module Bubs`;
const QUANTITY = `module Bubs
  module Dismantle
    LOW_GOLD = "Not Enough Gold"
  end
end
class Window_DismantleNumber < Window_Selectable
end`;
const CORE = `module YEA\n  module CORE\n    FONT_SIZE = 18\n  end\nend\nFont.default_size = YEA::CORE::FONT_SIZE`;
const SCRIPTS = [CORE, INFO_PAGES, CRAFTING, DISMANTLE, QUANTITY];

test('crafting and dismantle: detected, and their calls reach the ports', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    assert.ok(fam.has('bubsTOCrafting') && fam.has('bubsDismantle'));
    const ctx = { constants: {}, families: fam };
    assert.equal(C.ruby('call_tocrafting_scene', 'statement', ctx), 'this.rrCallTOCrafting?.();');
    assert.equal(C.ruby('call_tocrafting_scene(:smithing, :Ammo)', 'statement', ctx), 'this.rrCallTOCrafting?.("smithing", "Ammo");');
    assert.equal(C.ruby('SceneManager.call(Scene_DismantleShop)', 'statement', ctx),
        '((s) => s && SceneManager.push(s))((typeof Scene_RRDismantleShop === "function" ? Scene_RRDismantleShop : null));');
    assert.match(C.ruby('SceneManager.call(Scene_TOCrafting)', 'statement', ctx), /Scene_RRTOCrafting/);
    assert.equal(C.ruby('remove_dismantle_mask(:item, 5)', 'statement', ctx), 'this.rrRemoveDismantleMask?.("item", 5);');
    assert.equal(C.ruby('get_dismantle_count(:weapon, 3)', 'expression', ctx), '(this.rrDismantleCount?.("weapon", 3) ?? null)');
});

test('settings come from the game\'s copies, with the info pages and the quantity add-on', () => {
    const constants = C.scriptConstants(SCRIPTS);
    const craft = params('RR_TacticsCrafting').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([craft.feeRate, craft.goldIcon, craft.goldText, craft.nextPageButton, craft.coverFolder, craft.moreFooter],
        ['10', '424', 'Zenar', 'right', 'img/pictures/', 'More Parts →']);
    assert.deepEqual(JSON.parse(craft.craftSe), { name: '682915__qleq__wheel-dismantling', volume: 100, pitch: 100 });
    assert.deepEqual(JSON.parse(craft.pageKeys), ['shift', 'shift']);
    assert.deepEqual(JSON.parse(craft.actorIcons), { 1: 16, 2: 16 });
    assert.deepEqual(JSON.parse(craft.pageSe), { name: 'Cursor', volume: 80, pitch: 100 });
    const dis = params('RR_DismantleItems').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([dis.fee, dis.feeText, dis.partsText, dis.counterText, dis.quantity, dis.lowGoldText, dis.rgssFontSize, dis.showChance],
        ['10', 'Cost', 'Parts', 'Dismantled Count', 'true', 'Not Enough Gold', '18', 'false']);
    assert.deepEqual(JSON.parse(dis.categories), ['item', 'weapon', 'armor']);
    assert.equal(params('RR_DismantleItems').extract({ scripts: [DISMANTLE], constants: C.scriptConstants([DISMANTLE]) }).quantity, 'false');
});

/** Just enough of the engine for the ports to load and run their rules. */
function engine(pluginName, parameters, db) {
    const cls = () => { const F = function() {}; F.prototype = {}; return F; };
    const Window_Base = cls(), Window_Selectable = cls(), Window_Command = cls(), Window_HorzCommand = cls(), Window_Gold = cls(), Window_ItemList = cls();
    for (const W of [Window_Selectable, Window_Command, Window_HorzCommand, Window_Gold, Window_ItemList]) W.prototype = Object.create(Window_Base.prototype);
    const Scene_MenuBase = cls(), Scene_Map = cls();
    const Game_Interpreter = cls();
    const party = {
        _items: new Map(), _gold: 0, _members: [],
        numItems(o) { return this._items.get(o) || 0; },
        maxItems() { return 99; },
        hasItem(o) { return this.numItems(o) > 0; },
        gainItem(o, n) { this._items.set(o, Math.max(0, Math.min(99, this.numItems(o) + n))); },
        loseItem(o, n) { this.gainItem(o, -n); },
        gold() { return this._gold; }, loseGold(n) { this._gold -= n; }, members() { return this._members; },
        setLastItem(o) { this._last = o; }, lastItem() { return this._last; }
    };
    const played = [];
    const ctx = {
        PluginManager: { parameters: (name) => (name === pluginName ? parameters : {}) },
        Window_Base, Window_Selectable, Window_Command, Window_HorzCommand, Window_Gold, Window_ItemList, Scene_MenuBase, Scene_Map, Game_Interpreter,
        DataManager: { isItem: (o) => db.items.includes(o), isWeapon: (o) => db.weapons.includes(o), isArmor: (o) => db.armors.includes(o) },
        AudioManager: { playSe: (se) => played.push(se) }, SoundManager: { playBuzzer() { played.push('buzzer'); } },
        $dataItems: db.items, $dataWeapons: db.weapons, $dataArmors: db.armors, $gameParty: party, $gameSystem: {},
        $gameActors: { actor: (id) => ({ id }) }, $gameTemp: {}, window: {}, Math: Object.create(Math)
    };
    vm.runInNewContext(plugin(pluginName), ctx);
    return { ctx, party, played };
}

test('crafting: notes read as the original read them, and a craft takes sets of components and the fee', () => {
    const items = [null];
    const add = (id, name, price, note) => { items[id] = { id, name, price, note, iconIndex: 0 }; return items[id]; };
    add(1, 'Wire', 0, '');
    add(2, 'Case', 0, '');
    add(3, 'Caliper', 0, '');
    // A closing tag written as an opening one keeps the block open; lines that name nothing it knows do nothing.
    const grenade = add(8, 'Frag Grenade', 100, '<ingredients>\r\nitem: 1\r\nitem: 2 x2\r\n<ingredients>\r\n<aoe radius: 100>\r\nwait: 20\r\neval: WolfPad.vibrate(1, 1, 60, 0)');
    const shells = add(9, 'Shells', 0, '<ingredients>\r\nitem: 2\r\ntool: item 3\r\n</ingredients>\r\n\r\n<craft result>\r\namount: 5\r\n</craft result>');
    const book = add(10, 'Blueprints', 5000, '<recipebook>\r\n\nitem: 8, 9\r\ncategory: Ammo\r\n\n</recipebook>');
    const { ctx, party, played } = engine('RR_TacticsCrafting', { feeRate: '10', craftSe: '{"name":"wheel","volume":100,"pitch":100}' }, { items, weapons: [null], armors: [null] });
    const scene = ctx.window.Scene_RRTOCrafting;
    const data = scene.craftData;
    assert.deepEqual(plain(data(book).recipes.map(o => o.id)), [8, 9]);
    assert.equal(data(book).category, 'Ammo');
    assert.deepEqual(plain(data(grenade).ingredients.map(o => o.id)), [1, 2, 2]);
    assert.equal(data(grenade).fee, 10);   // a tenth of the price
    assert.deepEqual(plain([data(shells).amount, data(shells).tools.map(o => o.id)]), [5, [3]]);

    party._gold = 25;
    party.gainItem(items[1], 5); party.gainItem(items[2], 5);
    const self = Object.assign(Object.create(scene.prototype), { _item: grenade });
    assert.equal(self.maxCraft(), 2);   // two sets of Case x2, and 25 gold for two fees
    self.doCrafting(grenade, 2);
    assert.deepEqual([party.numItems(items[1]), party.numItems(items[2]), party.numItems(grenade), party._gold], [3, 1, 2, 5]);
    assert.deepEqual(plain(played.map(s => s.name)), ['wheel']);
    // A result made five at a time: the count is items, the components are taken per set.
    self._item = shells;
    self.doCrafting(shells, 5);
    assert.deepEqual([party.numItems(items[2]), party.numItems(shells)], [0, 5]);
});

test('dismantle: parts come with their chance, counts are kept with the save, and a fee the party lacks stops it', () => {
    const items = [null];
    const add = (id, name, note) => { items[id] = { id, name, note, iconIndex: 0, itypeId: 1 }; return items[id]; };
    add(161, 'Common Parts', '');
    add(4, 'Fabric', '');
    const rare = add(162, 'Rare Parts', '<dismantle>\r\nitem: 161\r\nitem: 161\r\nitem: 4, 25%\r\nfee: 30\r\n</dismantle>\r\n\r\n<ingredients>\r\nitem: 161 x5\r\n</ingredients>');
    const { ctx, party, played } = engine('RR_DismantleItems', { fee: '10', chance: '100', quantity: 'true', se: '{"name":"wheel","volume":100,"pitch":100}' },
        { items, weapons: [null], armors: [null] });
    const Scene = ctx.window.Scene_RRDismantleShop;
    const recipe = Scene.recipe(rare);
    assert.deepEqual(plain(recipe.parts.map(p => [p.item.id, p.chance])), [[161, 100], [161, 100], [4, 25]]);
    assert.equal(recipe.fee, 30);
    assert.equal(Scene.recipe(items[161]).parts.length, 0);

    const stub = () => ({ show() {}, hide() {}, open() {}, activate() {}, select() {}, refresh() {}, setItems(g) { this.items = g; }, fittingRows: () => 1 });
    const self = Object.assign(Object.create(Scene.prototype), {
        _item: rare, _numberWindow: { number: 2 }, _lowGoldWindow: stub(), _resultsWindow: stub(), _resultsHeaderWindow: stub(),
        _goldWindow: stub(), _infoWindow: stub(), _helpWindow: stub(), _itemWindow: stub(), refreshAll() {}
    });
    ctx.Window_Base.prototype.fittingHeight = () => 48;
    party.gainItem(rare, 3);
    party._gold = 50;   // two cost 60
    self.processDismantle();
    assert.deepEqual([party.numItems(rare), played.at(-1)], [3, 'buzzer']);
    party._gold = 100;
    const rolls = [0.1, 0.5, 0.3, 0.1, 0.5, 0.2];   // the Fabric comes on the second go only
    ctx.Math.random = () => rolls.shift();
    self.processDismantle();
    assert.deepEqual([party.numItems(rare), party.numItems(items[161]), party.numItems(items[4]), party._gold], [1, 4, 1, 40]);
    assert.deepEqual(plain(self._resultsWindow.items.map(o => o.id)), [161, 161, 161, 161, 4]);
    const it = new ctx.Game_Interpreter();
    assert.deepEqual([it.rrDismantleCount('item', 162), it.rrAllDismantleCount(), it.rrDismantleCount('item', 999)], [2, 2, null]);
    assert.deepEqual(plain(ctx.$gameSystem._rrDismantle.counts.item), { 162: 2 });
});
