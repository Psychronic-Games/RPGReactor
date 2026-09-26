'use strict';
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
const SHOP = `$imported = {} if $imported.nil?
$imported["YEA-ShopOptions"] = true
module YEA
  module SHOP
    COMMANDS =[
      :buy,          # Buys items from the shop. Default.
      :sell,         # Sells items top the shop. Default.
      :equip,        # Allows the player to change equipment inside the shop.
      :custom1,      # Custom Command 2.
      :custom3,      # Custom Command 2.
      :custom4,      # Custom Command 2.
      :custom5,
     #:cancel,       # Leaves the shop. Default.
    ] # Do not remove this.
    CUSTOM_SHOP_COMMANDS ={
    # :command => ["Display Name", EnableSwitch, ShowSwitch, Handler Method],
      :equip   => ["Equip",            0,          23,        :command_equip],
      :custom1 => ["Repair",           0,          24,        :command_name1],
      :custom3 => ["Hospital",         0,          26,        :command_name3],
      :custom4 => ["Dismantle",        0,          27,        :command_name4],
      :custom5 => ["Build",            0,          22,        :command_name5],
    } # Do not remove this.
    STATUS_FONT_SIZE = 18       # Font size used for data window.
    MAX_ICONS_DRAWN  = 10       # Maximum number of icons drawn for states.
    VOCAB_STATUS ={
      :empty      => "",          # Text used when nothing is shown.
      :hp_recover => "HP Recover",      # Text used for HP Recovery.
      :mp_recover => "EN Recover",      # Text used for MP Recovery.
      :applies    => "Inflicts",      # Text used for applied states and buffs.
    } # Do not remove this.
  end # SHOP
end # YEA
class Scene_Shop < Scene_MenuBase
  def command_name1
    $game_party.unequip_all
    SceneManager.call(Scene_RepairEquip)
  end
  def command_name3
    SceneManager.call(Scene_Hospital)
  end

  def command_name4
    SceneManager.call(Scene_DismantleShop)
  end
  def command_name5
    SceneManager.call(Scene_TOCrafting)
  end
end # Scene_Shop`;
const MUR = `module YEA
  module SHOP
    EXPARAM = {
      # HIT - HIT rate
      0 => "Hit Rate:",
      2 => "Crit Rate:",
    }
    SPSLOT = {
      0 => "None",
      1 => "Dual Wield"
    }
    ITEM_INFO = {
      :element_rate => "Element %s %s%%",
      :state_resist => "%s's resist",
      :parameter => "+ %s %s%%",
      :ex_parameter => "+ %s %s%%",
      :slot_type => "+Slot Type %s",
      :equip_armor => "Equips: %s",
    }
    COLOURS = {
      :green => [128, 255, 128],    # good usefulness
      :red => [245, 32, 32],         # bad usefulness
    }
  end
end
class Window_ShopData < Window_Base
  def draw_feature_param(param_id, dx, dy, dw)
  end
end`;
const CATEGORIES = `class Scene_Shop < Scene_MenuBase
  def create_buy_category_window
    @buy_category_window = Window_ShopCategory.new
  end
end`;
const ICONS = `#Shiggy - Icons for Actors in shop
class Window_ShopStatus < Window_Base
end
class Window_Base < Window
	def draw_actor_icon(actor,dx,dy,enabled = true )
		case actor.actor.id
		when 1
			index = 4849
		when 2
			index = 4848
		when 4
			index = 90
		end
		draw_icon(index,dx,dy,enabled)
	end
end`;
const RARITY = '$imported[:TH_ItemRarity] = true\nmodule TH\n  module Item_Rarity\n    Colour_Map = {\n      1 => [255,255,255], #Common\n      3 => [255,0,220  ], #Exotic\n    }\n  end\nend';
const OTHERS = `$imported["YEA-AdjustLimits"] = true
module YEA
  module LIMIT
    SHOP_FONT = 18      # Font size used for shop item costs.
  end
  module CORE
    FONT_SIZE = 18
  end
  module MENU
    HELP_WINDOW_LOCATION = 1     # 0-Top, 1-Middle, 2-Bottom.
  end
end
$imported["YEA-AceMenuEngine"] = true
Font.default_size = YEA::CORE::FONT_SIZE`;
const HOSPITAL = `$imported = {} if $imported.nil?
$imported["YES-Hospital"] = true
module YES
  module HOSPITAL
    HP_COST = 10       # Gold cost for each HP lost.
    MP_COST = 20      # Gold cost for each MP lost.
    STATE_COST = 15  # Default cost for each Removed State.
    NURSE_FACE = ["heal", 0]   # Setting for nurse face.
    NURSE_MESSAGE = [ # Setting for nurse greeting message.
      "\\\\C[17]Doctor\\\\C[0]\\nIf you are injured,\\you know where to find me.", # Message 1
      "\\\\C[17]Doctor\\\\C[0]\\nHello!", # Message 3
    ] # End Message.
    HELP_MESSAGE = { # Setting for texts in Help Window.
      :heal_one         => "Heals members individually.",
      :heal_all_treat   => "Healing all members will cost %d\\\\C[1]Ƶ.",
      :actor_treat      => "%s needs healing.",
    } # End Help.
    COMMAND_TEXT = { # Setting for commands text.
      :heal_one => "Heal One",
      :prize    => "Item Rebate",
    } # End Commands Text.
    COMMAND_ARRAY = [ # Setting for Commands.
      :heal_one,
      :heal_all,
      :prize,
      :exit,
    ] # End Commands
  end # HOSPITAL
end # YES
module YES
  def self.hospital
    SceneManager.call(Scene_Hospital)
  end
end # YES`;
const PRIZES = '$imported = {} if $imported.nil?\n$imported["YES-HospitalPrizes"] = true';
const SCRIPTS = [RARITY, OTHERS, SHOP, HOSPITAL, PRIZES, MUR, CATEGORIES, ICONS];

test('shop and hospital: detected, and the hospital is opened by its calls', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    assert.ok(fam.has('yeaShopOptions') && fam.has('yesHospital'));
    const ctx = { constants: C.scriptConstants(SCRIPTS), families: fam };
    assert.equal(C.ruby('YES.hospital', 'statement', ctx), '(typeof Scene_RRHospital === "function" && SceneManager.push(Scene_RRHospital));');
    assert.equal(C.ruby('SceneManager.call(Scene_Hospital)', 'statement', ctx),
        '((s) => s && SceneManager.push(s))((typeof Scene_RRHospital === "function" ? Scene_RRHospital : null));');
});

test('shop settings: commands with the screens their handlers opened, the add-ons, and the other scripts\' values', () => {
    // A scene a port gives a class of its own is called by that class.
    const ported = (name) => C.FAMILIES.reduce((found, f) => (f.classes && f.classes[name]) || found, name);
    const p = params('RR_YanflyShopOptions').extract({ scripts: SCRIPTS, constants: C.scriptConstants(SCRIPTS) });
    assert.deepEqual(JSON.parse(p.commands), [
        'buy', 'sell',
        { symbol: 'equip', text: 'Equip', enable: 0, show: 23, handler: 'command_equip', action: 'equip' },
        { symbol: 'custom1', text: 'Repair', enable: 0, show: 24, handler: 'command_name1', action: 'scene', scene: ported('Scene_RepairEquip'), unequip: true },
        { symbol: 'custom3', text: 'Hospital', enable: 0, show: 26, handler: 'command_name3', action: 'scene', scene: 'Scene_RRHospital', unequip: false },
        { symbol: 'custom4', text: 'Dismantle', enable: 0, show: 27, handler: 'command_name4', action: 'scene', scene: 'Scene_RRDismantleShop', unequip: false },
        { symbol: 'custom5', text: 'Build', enable: 0, show: 22, handler: 'command_name5', action: 'scene', scene: 'Scene_RRTOCrafting', unequip: false }
    ]);
    assert.deepEqual(JSON.parse(p.vocab), { empty: '', hp_recover: 'HP Recover', mp_recover: 'EN Recover', applies: 'Inflicts' });
    assert.deepEqual([p.statusFontSize, p.maxIcons, p.shopFontSize, p.rgssFontSize, p.helpLocation, p.itemFeatures, p.buyCategories],
        ['18', '10', '18', '18', 'middle', 'true', 'true']);
    const f = JSON.parse(p.featureText);
    assert.deepEqual([f.exparam, f.spslot, f.info.element_rate, f.colours.red], [{ 0: 'Hit Rate:', 2: 'Crit Rate:' }, { 0: 'None', 1: 'Dual Wield' }, 'Element %s %s%%', [245, 32, 32]]);
    assert.deepEqual(JSON.parse(p.actorIcons), { 1: 4849, 2: 4848, 4: 90 });
    assert.deepEqual(JSON.parse(p.rarityColours), { 1: [255, 255, 255], 3: [255, 0, 220] });
    // Yanfly's alone: no add-ons, no help place without the menu engine.
    const alone = params('RR_YanflyShopOptions').extract({ scripts: [SHOP], constants: C.scriptConstants([SHOP]) });
    assert.deepEqual([alone.itemFeatures, alone.buyCategories, alone.actorIcons, alone.helpLocation, alone.shopFontSize, alone.rarityColours], ['false', 'false', '', '', '0', '']);
});

test('hospital settings: prices, the nurse, texts as Ruby reads them, and the prizes add-on', () => {
    const p = params('RR_YamiHospital').extract({ scripts: SCRIPTS });
    assert.deepEqual([p.hpCost, p.mpCost, p.stateCost, p.prizes], ['10', '20', '15', 'true']);
    assert.deepEqual(JSON.parse(p.nurseFace), ['heal', 0]);
    // "\\y" in a Ruby double-quoted string is a plain y.
    assert.deepEqual(JSON.parse(p.nurseMessages), ['\\C[17]Doctor\\C[0]\nIf you are injured,you know where to find me.', '\\C[17]Doctor\\C[0]\nHello!']);
    assert.equal(JSON.parse(p.helpText).heal_all_treat, 'Healing all members will cost %d\\C[1]Ƶ.');
    assert.deepEqual(JSON.parse(p.commands), ['heal_one', 'heal_all', 'prize', 'exit']);
    assert.equal(params('RR_YamiHospital').extract({ scripts: [HOSPITAL] }).prizes, 'false');
});

/** Just enough of the engine for the ports to load and run their rules. */
function engine(pluginName, parameters, extra = {}) {
    const cls = (base) => { const F = function() {}; F.prototype = base ? Object.create(base.prototype) : {}; F.prototype.constructor = F; return F; };
    const Window_Base = cls(), Window_Scrollable = cls(Window_Base), Window_Selectable = cls(Window_Scrollable);
    const Window_Command = cls(Window_Selectable), Window_HorzCommand = cls(Window_Command), Window_ItemList = cls(Window_Selectable);
    const Window_ShopCommand = cls(Window_HorzCommand), Window_ShopBuy = cls(Window_Selectable), Window_ShopSell = cls(Window_ItemList);
    const Window_ShopNumber = cls(Window_Selectable), Window_ShopStatus = cls(Window_Base);
    const Scene_MenuBase = cls(), Scene_Shop = cls(Scene_MenuBase);
    const Game_Actor = cls(), Game_Party = cls(), Game_Interpreter = cls();
    Window_Base.prototype.fittingHeight = (n) => n * 24 + 24;
    Window_ShopCommand.prototype.makeCommandList = function() { this.stock = true; };
    Window_ShopNumber.prototype.processNumberChange = function() {};
    for (const m of ['prepare', 'create', 'activateSellWindow', 'commandBuy', 'onBuyCancel', 'onSellOk']) Scene_Shop.prototype[m] = function() {};
    const played = [];
    const ctx = Object.assign({
        PluginManager: { parameters: (name) => (name === pluginName ? parameters : {}) },
        Window_Base, Window_Scrollable, Window_Selectable, Window_Command, Window_HorzCommand, Window_ItemList, Window_ShopCommand, Window_ShopBuy,
        Window_ShopSell, Window_ShopNumber, Window_ShopStatus, Window_Help: cls(Window_Base), Window_Gold: cls(Window_Base), Window_MenuActor: cls(Window_Selectable),
        Scene_MenuBase, Scene_Shop, Game_Actor, Game_Party, Game_Interpreter, SceneManager: { _scene: null, push(s) { played.push(['push', s]); } },
        SoundManager: { playBuzzer() { played.push('buzzer'); }, playRecovery() { played.push('recovery'); }, playOk() {}, playCursor() {} },
        ColorManager: { normalColor: () => 'normal', systemColor: () => 'system', paramchangeTextColor: (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'normal') },
        TextManager: { buy: 'Buy', sell: 'Sell', cancel: 'Cancel', item: 'Items', weapon: 'Weapon', armor: 'Equipment', keyItem: 'Misc' },
        $gameSwitches: { _on: new Set(), value(id) { return this._on.has(id); } }, $gameTemp: {},
        DataManager: { isItem: (o) => !!o && o.kind === 'item', isWeapon: (o) => !!o && o.kind === 'weapon', isArmor: (o) => !!o && o.kind === 'armor' },
        window: {}, Math: Object.create(Math)
    }, extra);
    ctx.window = ctx;
    vm.runInNewContext(plugin(pluginName), ctx);
    return { ctx, played };
}

const SHOP_PARAMS = (() => {
    const p = params('RR_YanflyShopOptions').extract({ scripts: SCRIPTS, constants: C.scriptConstants(SCRIPTS) });
    return p;
})();

test('shop commands: shown by their switches, disabled when the screen they open is not in the project', () => {
    const { ctx } = engine('RR_YanflyShopOptions', SHOP_PARAMS, { Scene_RRDismantleShop: function() {}, Scene_RRHospital: function() {} });
    const w = Object.create(ctx.Window_ShopCommand.prototype);
    w.list = [];
    w.addCommand = function(name, symbol, enabled = true) { this.list.push([name, symbol, enabled]); };
    // Outside the shop the command window keeps its own list.
    w.makeCommandList();
    assert.equal(w.stock, true);
    ctx.SceneManager._scene = new ctx.Scene_Shop();
    [23, 24, 26, 27].forEach(s => ctx.$gameSwitches._on.add(s));
    w._purchaseOnly = true;
    w.makeCommandList();
    assert.deepEqual(plain(w.list), [['Buy', 'buy', true], ['Sell', 'sell', false], ['Equip', 'equip', true], ['Repair', 'custom1', false],
        ['Hospital', 'custom3', true], ['Dismantle', 'custom4', true]]);
    assert.equal(w.maxCols(), 1);
});

test('buy categories: goods listed by kind, key items apart from the rest', () => {
    const { ctx } = engine('RR_YanflyShopOptions', SHOP_PARAMS);
    const items = [null, { kind: 'item', itypeId: 1, price: 5 }, { kind: 'item', itypeId: 2, price: 7 }];
    const weapons = [null, { kind: 'weapon', price: 50 }];
    const w = Object.create(ctx.Window_ShopBuy.prototype);
    w.goodsToItem = (g) => [items, weapons][g[0]][g[1]];
    w._shopGoods = [[0, 1, 0, 0], [0, 2, 1, 9], [1, 1, 0, 0], [3, 1, 0, 0]];
    const list = (cat) => { w._category = cat; w.makeItemList(); return [w._data.length, w._price.slice()]; };
    assert.deepEqual(plain(list(undefined)), [0, []]);
    assert.deepEqual(plain(list('item')), [1, [5]]);
    assert.deepEqual(plain(list('keyItem')), [1, [9]]);
    assert.deepEqual(plain(list('weapon')), [1, [50]]);
});

test('data window: MUR\'s features in their colours, the item name further right in its rarity colour', () => {
    const { ctx } = engine('RR_YanflyShopOptions', SHOP_PARAMS, {
        $dataSystem: { elements: ['', 'Fire'], terms: { params: ['MHP', 'MMP'] }, equipTypes: ['', 'Weapon'], armorTypes: ['', 'Handgun Mod'] },
        $dataStates: [null, { name: 'Dead', restriction: 4 }], $dataSkills: []
    });
    ctx.rrItemRarity = (item) => item.rarity;
    const drawn = [];
    const w = Object.create(ctx.Window_RRShopData.prototype);
    Object.assign(w, {
        contents: { fillRect() {} }, innerWidth: 456, lineHeight: () => 24, textWidth: (t) => t.length * 8,
        changeTextColor(c) { this.colour = c; }, resetTextColor() { this.colour = 'normal'; }, changePaintOpacity(on) { this.faded = !on; },
        drawText(text, x, y, width) { drawn.push([String(text), x, y, width, this.colour, !!this.faded]); }, drawIcon(n, x, y, enabled) { drawn.push(['icon', n, x, enabled]); }
    });
    w._item = { traits: [{ code: 11, dataId: 1, value: 1.5 }, { code: 22, dataId: 2, value: -0.1 }, { code: 52, dataId: 1, value: 0 }, { code: 55, dataId: 1, value: 0 }] };
    for (let i = 0; i < 6; i++) w.drawFeatureParam(i, (i % 2) * 228, 96, 228);
    assert.deepEqual(plain(drawn.map(d => [d[0], d[4]])), [['Element Fire 150%', 'rgb(128,255,128)'], ['+ Crit Rate: -10%', 'rgb(245,32,32)'],
        ['Equips: Handgun Mod', 'rgb(128,255,128)'], ['+Slot Type Dual Wield', 'rgb(128,255,128)'], ['', 'rgb(128,255,128)'], ['', 'rgb(128,255,128)']]);
    drawn.length = 0;
    ctx.Window_Base.prototype.rrAceDrawItemName.call(w, { iconIndex: 7, name: 'Smoke', rarity: 3 }, 0, 0, false, 100);
    assert.deepEqual(plain(drawn), [['icon', 7, 0, false], ['Smoke', 26, 0, 100, 'rgb(255,0,220)', true]]);
});

/** A party of actors with HP, MP and states, as the hospital's rules read them. */
function hospital(extraParams = {}) {
    const p = Object.assign(params('RR_YamiHospital').extract({ scripts: SCRIPTS }), extraParams);
    const items = [null, { id: 1, kind: 'item', note: '<prize hp: 10>\n<prize max: 3>' }, { id: 2, kind: 'item', note: '<prize states: 1>' },
        { id: 3, kind: 'item', note: '<prize state 4: 2>\r\n<prize mp: 5>' }];
    const e = engine('RR_YamiHospital', p, { $dataItems: items, $dataWeapons: [null], $dataArmors: [null], ImageManager: { loadFace: () => ({}) } });
    const { ctx } = e;
    const party = Object.create(ctx.Game_Party.prototype);
    Object.assign(party, {
        _gold: 1000, _members: [], _items: new Map(),
        gold() { return this._gold; }, loseGold(n) { this._gold -= n; }, members() { return this._members; },
        maxItems() { return 99; }, numItems(o) { return this._items.get(o) || 0; }, gainItem(o, n) { this._items.set(o, this.numItems(o) + n); }
    });
    ctx.$gameParty = party;
    const actor = (hp, mp, states) => Object.assign(Object.create(ctx.Game_Actor.prototype), {
        _hp: hp, _mp: mp, mhp: 100, mmp: 50, _states: states.slice(),
        states() { return this._states.map(id => ({ id })); }, removeState(id) { this._states = this._states.filter(s => s !== id); }
    });
    party._members.push(actor(70, 50, [4]), actor(100, 45, []), actor(100, 50, []));
    return Object.assign(e, { party, items });
}

test('hospital: fees per HP, MP and state; healing pays for each member in turn', () => {
    const { party, played } = hospital();
    const [a, b, c] = party.members();
    assert.deepEqual([a.rrHospitalFee(), b.rrHospitalFee(), c.rrHospitalFee(), party.rrHospitalFee()], [30 * 10 + 15, 5 * 20, 0, 415]);
    assert.equal(party.rrHospitalAvailable(), true);
    party.rrHospitalRecover();
    assert.deepEqual([a._hp, a._mp, a._states.length, b._mp, party.gold()], [100, 50, 0, 50, 585]);
    // One sound for the party, then one for each member (a healthy one included).
    assert.deepEqual(plain(played), ['recovery', 'recovery', 'recovery', 'recovery']);
    assert.equal(party.rrHospitalAvailable(), false);
    played.length = 0;
    party.rrHospitalRecover();
    assert.deepEqual(plain(played), ['buzzer']);
    a._hp = 1;
    party._gold = 10;
    a.rrHospitalRecover();
    assert.equal(a._hp, 1);
    assert.deepEqual(plain(played), ['buzzer', 'buzzer']);
});

test('hospital prizes: counted as they are paid for, given out by the notes, <prize states> never read', () => {
    const { ctx, party, items } = hospital();
    const available = ctx.Scene_RRHospital.prizeAvailable;
    party.members()[0].rrHospitalRecover();   // 30 HP and state 4
    const store = party._rrHospitalPrize;
    assert.deepEqual(plain(store), { hp: 30, mp: 0, state: { 4: 1 }, states: 1, received: { item: {}, weapon: {}, armor: {} } });
    // Item 1: one per 10 HP, three at most; item 2's tag is never read; item 3 needs both its counts.
    assert.deepEqual([available(items[1]), available(items[2]), available(items[3])], [3, 0, 0]);
    store.hp = 80; store.mp = 12; store.state[4] = 5;
    assert.deepEqual([available(items[1]), available(items[3])], [3, 2]);
    party.rrClaimPrize(items[1]);
    assert.deepEqual([party.numItems(items[1]), available(items[1]), store.received.item[1]], [3, 0, 3]);
    party.rrClaimPrize(null);
});
