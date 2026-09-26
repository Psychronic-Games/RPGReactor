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
const INSTANCE = `$imported = {} if $imported.nil?
$imported["TH_InstanceItems"] = true
module TH
  module Instance_Items
    Enable_Items = false
    Enable_Weapons = true
    Enable_Armors = true
  end
end`;
const LEVELS = `module TH_Instance
  module Equip
    Default_Max_Level = 100
    Level_Prefix = ' [+%s]'
    Default_Mult_Bonus = 1.5
    Default_Mult_Price = 2
    Default_Can_Level = true
  end
end
module Selchar
  Param = ['mhp','mmp','atk','def','mat','mdf','agi','luk','mtp']
end
$imported = {} if $imported.nil?
$imported[:Sel_Equip_Leveling_Base] = true`;
const UPGRADE = `module TH_Instance
  module Scene_EquipUpgrade
    Vocab = "Upgrade"
    No_Selected_Item = "Select an item you wish to upgrade"
    Selected_Item = "Upgrade Price: "
    Can_Not_Upgrade = "Max Upgrade"
    SE = ['Hammer',100,100]
    Price_Mod = 0.25
    Window_Params = [0,1,2,3,4,5,6,7] #Shows offensive stats first, then defensive
  end
end
$imported[:Sel_Equip_Upgrade_Scene1] = true`;
const WEAPON = `module TH_Instance
  module Weapon
    Default_Durability = 100
    Default_Durability_Cost = 1
    Destroy_Broken_Weapon = false
    Durability_Setting = true
    Dur_Suf = ' [%s%%]'
  end
end
$imported[:Sel_Weapon_Durability] = true`;
const ARMOR = `module TH_Instance
  module Armor
    Default_Durability = 100
    Default_Durability_Damage = 1
    Durability_Reduce_Rate = 1
    Destroy_Broken_Armor = true
    Durability_Setting = false
    Dur_Suf = ' [%s%%]'
  end
end
$imported[:Sel_Armor_Durability] = true`;
const REPAIR = `module TH_Instance
  module Scene_Repair
    Vocab = "Repair"
    No_Selected_Item = "Select item that needs repairs."
    Selected_Item = "Repair Cost: "
    Can_Not_Repair = "Max Durability"
    SE = ['Hammer',100,100]
    Price_Mod = 1.0
  end
end
$imported[:Sel_Equip_Dura_Repair] = true`;
const ARMTHRIFT = '$imported[:Sel_Wep_Dura_Armthrift] = true';
const YAMI = '$imported[:YAMI_DamageDurability] = true';
const SCRIPTS = [INSTANCE, LEVELS, UPGRADE, WEAPON, ARMOR, REPAIR, ARMTHRIFT, YAMI];

test('instance items, levels and durability: detected, and their calls reach the ports', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of ['himeInstanceItems', 'selcharEquipLevels', 'selcharDurability']) assert.ok(fam.has(key), key);
    const ctx = { constants: {}, families: fam };
    assert.equal(C.ruby('SceneManager.call(Scene_RepairEquip)', 'statement', ctx),
        '((s) => s && SceneManager.push(s))((typeof Scene_RRRepairEquip === "function" ? Scene_RRRepairEquip : null));');
    assert.match(C.ruby('SceneManager.call(Scene_EquipUpgrade)', 'statement', ctx), /Scene_RREquipUpgrade/);
    assert.equal(C.ruby('$game_party.leader.weapons[0].level_up', 'statement', ctx), 'window.RRSelcharLevels?.levelUp($gameParty.leader().weapons()[0]);');
    assert.equal(C.ruby('$game_party.leader.weapons[0].repair', 'statement', ctx), 'window.RRSelcharDurability?.repair($gameParty.leader().weapons()[0]);');
    assert.equal(C.ruby('$game_party.leader.equips[0].durability < 50', 'expression', ctx), '($gameParty.leader().equips()[0].durability < 50)');
    assert.equal(C.ruby('InstanceManager.get_instance($data_weapons[3])', 'expression', ctx), '(window.RRInstanceItems?.getInstance($dataWeapons[3]) ?? $dataWeapons[3])');
    assert.equal(C.ruby('$game_party.leader.instance_weapons_include?(21)', 'expression', ctx), '($gameParty.leader().rrInstanceWeaponsInclude?.(21) ?? false)');
});

test('settings come from the game\'s copies', () => {
    const constants = C.scriptConstants(SCRIPTS);
    assert.deepEqual(params('RR_HimeInstanceItems').extract({ scripts: SCRIPTS, constants }), { enableItems: 'false', enableWeapons: 'true', enableArmors: 'true' });
    const lv = params('RR_SelcharEquipLevels').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([lv.maxLevel, lv.levelFormat, lv.multBonus, lv.multPrice, lv.canLevel, lv.upgradeScene, lv.priceMod, lv.upgradeText],
        ['100', ' [+%s]', '1.5', '2', 'true', 'true', '0.25', 'Upgrade']);
    assert.deepEqual(JSON.parse(lv.se), { name: 'Hammer', volume: 100, pitch: 100 });
    assert.deepEqual(JSON.parse(lv.windowParams), [0, 1, 2, 3, 4, 5, 6, 7]);
    const du = params('RR_SelcharDurability').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([du.weapons, du.weaponSetting, du.weaponDestroy, du.weaponSuffix, du.armors, du.armorSetting, du.armorDestroy, du.armorRate],
        ['true', 'true', 'false', ' [%s%%]', 'true', 'false', 'true', '1']);
    assert.deepEqual([du.repairScene, du.repairText, du.fullText, du.repairPriceMod, du.armthrift], ['true', 'Repair', 'Max Durability', '1', 'true']);
    assert.equal(params('RR_SelcharDurability').extract({ scripts: [INSTANCE, WEAPON], constants: {} }).armors, 'false');
});

// Just enough of MZ's objects, written as MZ writes them, for the ports to run their rules.
const ENGINE = `
function cls(base) { const F = function() { if (this.initialize) this.initialize(...arguments); }; F.prototype = Object.create(base ? base.prototype : Object.prototype); F.prototype.constructor = F; return F; }
var Window_Base = cls(), Window_Selectable = cls(Window_Base), Window_HorzCommand = cls(Window_Selectable), Window_ItemList = cls(Window_Selectable), Window_Gold = cls(Window_Base), Scene_MenuBase = cls();
Window_Base.prototype.rrAceDrawItemNumber = function(rect, item) { drawn.push(item.name); };
Window_ItemList.prototype.drawItemNumber = function(item) { drawn.push(item.name); };
var DataManager = {
    isItem: (o) => !!o && $dataItems.includes(o), isWeapon: (o) => !!o && $dataWeapons.includes(o), isArmor: (o) => !!o && $dataArmors.includes(o), isSkill: (o) => !!o && $dataSkills.includes(o),
    onLoad() {}, createGameObjects() { $gameSystem = {}; $gameParty = new Game_Party(); }, extractSaveContents(c) { $gameSystem = c.system; $gameParty = c.party; }
};
var Game_Item = cls();
Game_Item.prototype.initialize = function() { this._dataClass = ''; this._itemId = 0; };
Game_Item.prototype.object = function() { return this._dataClass === 'weapon' ? $dataWeapons[this._itemId] : this._dataClass === 'armor' ? $dataArmors[this._itemId] : null; };
Game_Item.prototype.setObject = function(item) { this._dataClass = DataManager.isWeapon(item) ? 'weapon' : DataManager.isArmor(item) ? 'armor' : ''; this._itemId = item ? item.id : 0; };
Game_Item.prototype.setEquip = function(isWeapon, itemId) { this._dataClass = isWeapon ? 'weapon' : 'armor'; this._itemId = itemId; };
var Game_Battler = cls();
var Game_Actor = cls(Game_Battler);
Object.assign(Game_Actor.prototype, {
    initialize(name) { this._name = name; this._skills = []; },
    isActor() { return true; }, name() { return this._name; }, refresh() {},
    equipSlots() { return [1, 2, 3, 4, 5]; },
    initEquips(equips) {
        const slots = this.equipSlots();
        this._equips = slots.map(() => new Game_Item());
        equips.forEach((id, j) => this._equips[j].setEquip(slots[j] === 1, id));
    },
    equips() { return this._equips.map(item => item.object()); },
    weapons() { return this.equips().filter(item => item && DataManager.isWeapon(item)); },
    armors() { return this.equips().filter(item => item && DataManager.isArmor(item)); },
    hasWeapon(weapon) { return this.weapons().includes(weapon); },
    hasArmor(armor) { return this.armors().includes(armor); },
    canEquip(item) { return !!item; },
    changeEquip(slotId, item) {
        if (this.tradeItemWithParty(item, this.equips()[slotId]) && (!item || this.equipSlots()[slotId] === item.etypeId)) { this._equips[slotId].setObject(item); this.refresh(); }
    },
    tradeItemWithParty(newItem, oldItem) {
        if (newItem && !$gameParty.hasItem(newItem)) return false;
        $gameParty.gainItem(oldItem, 1);
        $gameParty.loseItem(newItem, 1);
        return true;
    },
    discardEquip(item) { const i = this.equips().indexOf(item); if (i >= 0) this._equips[i].setObject(null); },
    traitObjects() { return [...this.equips().filter(Boolean)]; },
    skills() { return this._skills; }
});
var Game_Party = cls();
Object.assign(Game_Party.prototype, {
    initialize() { this._gold = 0; this._members = []; this.initAllItems(); },
    initAllItems() { this._items = {}; this._weapons = {}; this._armors = {}; },
    itemContainer(item) { return !item ? null : DataManager.isItem(item) ? this._items : DataManager.isWeapon(item) ? this._weapons : DataManager.isArmor(item) ? this._armors : null; },
    numItems(item) { const c = this.itemContainer(item); return c ? c[item.id] || 0 : 0; },
    maxItems() { return 99; },
    hasItem(item) { return this.numItems(item) > 0; },
    items() { return Object.keys(this._items).map(id => $dataItems[id]); },
    weapons() { return Object.keys(this._weapons).map(id => $dataWeapons[id]); },
    armors() { return Object.keys(this._armors).map(id => $dataArmors[id]); },
    allItems() { return this.items().concat(this.weapons(), this.armors()); },
    gainItem(item, amount) {
        const container = this.itemContainer(item);
        if (!container) return;
        container[item.id] = Math.min(Math.max(this.numItems(item) + amount, 0), this.maxItems(item));
        if (container[item.id] === 0) delete container[item.id];
    },
    loseItem(item, amount, includeEquip) { this.gainItem(item, -amount, includeEquip); },
    members() { return this._members; }, gold() { return this._gold; }, loseGold(n) { this._gold -= n; }
});
var Game_Action = cls();
Object.assign(Game_Action.prototype, {
    initialize(subject, item) { this._subject = subject; this._item = item; },
    subject() { return this._subject; }, item() { return this._item; },
    executeDamage(target, value) { executed.push(value); }
});
`;

function engine() {
    const w = (id, name, note = '', extra = {}) => Object.assign({ id, name, note, wtypeId: 1, etypeId: 1, params: [0, 0, 10, 0, 3, 0, 0, 0], price: 100, traits: [], iconIndex: 1, description: '', meta: {} }, extra);
    const a = (id, name, etypeId, note = '', extra = {}) => Object.assign({ id, name, note, atypeId: 1, etypeId, params: [0, 0, 0, 5, 0, 0, 0, 0], price: 200, traits: [], iconIndex: 2, description: '', meta: {} }, extra);
    const ctx = {
        $dataItems: [null], $dataSkills: [null, { id: 1, note: '', damage: { elementId: -1 } }, { id: 2, note: '<durability damage: 10>\r\n<durability cost: 60>', damage: { elementId: 1 } }],
        $dataWeapons: [null, w(1, 'Wyvern'), w(2, 'Stick', '<set durability>'), w(3, 'Broken Pipe'), w(4, 'Pipe', '<broken weapon change: 3>\r\n<max durability: 10>')],
        $dataArmors: [null, a(1, 'Desert Camo', 4, '<set durability>\r\n<item rarity: 1>'), a(2, 'Sentinel Beret', 5, '<item rarity: 1>\r\n'), a(3, 'Titanium Frame', 3, '<armthrift rate: 1.0>')],
        $dataSystem: { elements: ['', 'Fire'] },
        $gameSystem: {}, $gameParty: null, $gameMessage: { texts: [], add(t) { this.texts.push(t); } },
        SceneManager: { _scene: { _logWindow: { lines: [], addText(t) { this.lines.push(t); } } } },
        AudioManager: { played: [], playSe(se) { this.played.push(se.name); }, stopSe() {} },
        drawn: [], executed: [], Math: Object.create(Math)
    };
    vm.createContext(ctx);
    ctx.window = ctx;
    vm.runInContext(ENGINE, ctx);
    const values = (name) => params(name).extract({ scripts: SCRIPTS, constants: C.scriptConstants(SCRIPTS) });
    const all = { RR_HimeInstanceItems: values('RR_HimeInstanceItems'), RR_SelcharEquipLevels: values('RR_SelcharEquipLevels'), RR_SelcharDurability: values('RR_SelcharDurability') };
    ctx.PluginManager = { parameters: (name) => all[name] || {} };
    for (const name of Object.keys(all)) vm.runInContext(plugin(name), ctx);
    ctx.DataManager.onLoad(ctx.$dataWeapons);
    ctx.DataManager.onLoad(ctx.$dataArmors);
    ctx.DataManager.onLoad(ctx.$dataItems);
    ctx.DataManager.createGameObjects();
    const actor = new ctx.Game_Actor('Jay');
    ctx.$gameParty._members.push(actor);
    return { ctx, actor };
}

test('starting equipment becomes copies, named with their level and durability as the game showed them', () => {
    const { ctx, actor } = engine();
    actor.initEquips([1, 0, 0, 1, 2]);
    const names = plain(actor.equips().map(o => o && o.name));
    assert.deepEqual(names, ['Wyvern [+1] [100%]', null, null, 'Desert Camo [+1] [100%]', 'Sentinel Beret [+1]']);
    const wyvern = actor.equips()[0];
    assert.deepEqual([wyvern.id, wyvern.templateId, wyvern.level, wyvern.durability], [5, 1, 1, 100]);
    assert.equal(ctx.$dataWeapons[5], wyvern);
    assert.equal(ctx.$dataWeapons[1].name, 'Wyvern');   // the database entry is untouched
    assert.deepEqual(plain(Object.keys(ctx.$gameSystem._rrInstances.armor)), ['4', '5']);
    // Conditional Branch › Actor › Weapon goes by the database entry.
    assert.ok(actor.hasWeapon(ctx.$dataWeapons[1]));
    assert.ok(!actor.hasWeapon(ctx.$dataWeapons[2]));
});

test('gaining makes copies; losing and equipping go by the database entry', () => {
    const { ctx, actor } = engine();
    actor.initEquips([0, 0, 0, 0, 0]);
    const party = ctx.$gameParty, sword = ctx.$dataWeapons[1];
    party.gainItem(sword, 2);
    const [a, b] = party.weapons();
    assert.deepEqual([a.id, b.id, a.templateId, party.numItems(sword), party.numItems(a)], [5, 6, 1, 2, 1]);
    // Only a database entry draws its count in a list.
    const w = new ctx.Window_ItemList();
    w.rrAceDrawItemNumber({}, a);
    w.rrAceDrawItemNumber({}, sword);
    w.drawItemNumber(b);
    assert.deepEqual(plain(ctx.drawn), ['Wyvern']);
    // Change Equipment with the database entry wears the first copy held.
    actor.changeEquip(0, sword);
    assert.equal(actor.equips()[0], a);
    assert.deepEqual(plain(party.weapons().map(o => o.id)), [6]);
    assert.equal(party.numItems(sword), 1);
    // Taking it off puts that copy back, last in the list.
    actor.changeEquip(0, null);
    assert.deepEqual(plain(party.weapons().map(o => o.id)), [6, 5]);
    // Losing by the entry takes the first copy; losing a copy takes that one.
    party.loseItem(sword, 1);
    assert.deepEqual(plain(party.weapons().map(o => o.id)), [5]);
    party.loseItem(a, 1);
    assert.deepEqual([party.weapons().length, party.numItems(sword)], [0, 0]);
    // With Include Equipment, one worn by a member goes when the bag has none (the leader first, then the next).
    const second = new ctx.Game_Actor('Kai');
    party._members.unshift(second);
    second.initEquips([0, 0, 0, 0, 0]);
    party.gainItem(sword, 1);
    actor.changeEquip(0, sword);
    party.loseItem(sword, 1, true);
    assert.equal(actor.equips()[0], null);
});

test('a level up raises the parameters, price and name; the upgrade price is a share of the price', () => {
    const { ctx } = engine();
    const L = ctx.RRSelcharLevels, party = ctx.$gameParty;
    party.gainItem(ctx.$dataWeapons[2], 1);   // no durability
    const stick = party.weapons()[0];
    assert.equal(stick.name, 'Stick [+1]');
    assert.equal(L.upgradePrice(stick), 25);
    L.levelUp(stick);
    L.levelUp(stick);
    assert.deepEqual(plain([stick.name, stick.params[2], stick.params[4], stick.price, stick.level]), ['Stick [+3]', 22, 6, 400, 3]);
    L.levelDown(stick);
    assert.deepEqual(plain([stick.name, stick.params[2], stick.price]), ['Stick [+2]', 15, 200]);
    assert.equal(L.nextParam(stick, 2, stick.params[2]), 22);
});

test('skills that hit wear the user\'s weapon and the target\'s armor; at 0 they break', () => {
    const { ctx, actor } = engine();
    actor.initEquips([1, 0, 0, 1, 0]);
    const enemy = { isActor: () => false };
    const attack = ctx.$dataSkills[1], heavy = ctx.$dataSkills[2];
    const wyvern = actor.equips()[0], camo = actor.equips()[3];
    new ctx.Game_Action(actor, attack).executeDamage(enemy, 10);
    assert.deepEqual([wyvern.durability, wyvern.name, ctx.executed.length], [99, 'Wyvern [+1] [99%]', 1]);
    assert.equal(wyvern.price, 99);
    new ctx.Game_Action(enemy, heavy).executeDamage(actor, 10);
    assert.deepEqual([camo.durability, camo.name], [90, 'Desert Camo [+1] [90%]']);
    // A weapon at 0 comes off, stays in the bag broken, and cannot be worn.
    new ctx.Game_Action(actor, heavy).executeDamage(enemy, 10);
    new ctx.Game_Action(actor, heavy).executeDamage(enemy, 10);
    assert.deepEqual([wyvern.durability, wyvern.name, wyvern.price, actor.equips()[0]], [0, 'Wyvern [+1] [0%]', 2, null]);
    assert.deepEqual(plain(ctx.$gameMessage.texts), ["Jay's Wyvern [+1] broke!"]);
    assert.deepEqual(plain(ctx.AudioManager.played), ['Break']);
    assert.ok(ctx.$gameParty.weapons().includes(wyvern));
    assert.equal(actor.canEquip(wyvern), false);
    assert.equal(actor.canEquip(ctx.$dataWeapons[1]), true);
    // Repair: the price it lost, all of it when broken.
    const D = ctx.RRSelcharDurability;
    assert.deepEqual([D.canRepair(wyvern), D.repairPrice(wyvern)], [true, 100]);
    D.repair(wyvern);
    assert.deepEqual([wyvern.durability, wyvern.name, D.repairPrice(wyvern), D.canRepair(wyvern)], [100, 'Wyvern [+1] [100%]', 0, false]);
    // An armor at 0 is thrown away, with a line in the battle log.
    for (let i = 0; i < 9; i++) new ctx.Game_Action(enemy, heavy).executeDamage(actor, 10);
    assert.equal(actor.equips()[3], null);
    assert.ok(!ctx.$gameParty.armors().includes(camo));
    assert.deepEqual(plain(ctx.SceneManager._scene._logWindow.lines), ["Jay's Desert Camo [+1] broke!"]);
});

test('a broken weapon with <broken weapon change> turns into a copy of that weapon; armthrift spares the weapon', () => {
    const { ctx, actor } = engine();
    actor.initEquips([4, 0, 0, 0, 0]);
    const pipe = actor.equips()[0];
    assert.equal(pipe.name, 'Pipe [+1] [10%]');
    new ctx.Game_Action(actor, ctx.$dataSkills[2]).executeDamage({ isActor: () => false }, 1);
    assert.deepEqual(plain(ctx.$gameParty.weapons().map(o => [o.templateId, o.name])), [[3, 'Broken Pipe [+1] [100%]']]);
    actor.initEquips([1, 0, 3, 0, 0]);   // Titanium Frame: <armthrift rate: 1.0>
    ctx.Math.random = () => 0.99;
    new ctx.Game_Action(actor, ctx.$dataSkills[1]).executeDamage({ isActor: () => false }, 1);
    assert.equal(actor.equips()[0].durability, 100);
    // Battle Symphony's durability scale came out 0 with a durability weapon in hand.
    assert.equal(actor.rrDurabilityDamageRatio(150), 0);
});

test('copies are kept with the save and put back into the tables when it loads', () => {
    const { ctx, actor } = engine();
    actor.initEquips([1, 0, 0, 1, 2]);
    ctx.$gameParty.gainItem(ctx.$dataWeapons[2], 1);
    ctx.RRSelcharLevels.levelUp(ctx.$gameParty.weapons()[0]);
    const saved = JSON.stringify({ system: ctx.$gameSystem, party: ctx.$gameParty, equips: actor._equips });
    // A new game drops the copies from the tables.
    ctx.DataManager.createGameObjects();
    assert.equal(ctx.$dataWeapons.length, 5);
    const contents = JSON.parse(saved);
    contents.party = Object.assign(new ctx.Game_Party(), contents.party);
    ctx.DataManager.extractSaveContents(contents);
    assert.deepEqual(plain(ctx.$dataWeapons.slice(5).map(o => o.name)), ['Wyvern [+1] [100%]', 'Stick [+2]']);
    assert.deepEqual(plain(ctx.$dataArmors.slice(4).map(o => o.name)), ['Desert Camo [+1] [100%]', 'Sentinel Beret [+1]']);
    assert.deepEqual(plain(ctx.$gameParty.weapons().map(o => o.name)), ['Stick [+2]']);
    assert.equal(ctx.$gameParty.weapons()[0], ctx.$gameSystem._rrInstances.weapon[6]);
    // The next copy takes the next id.
    ctx.$gameParty.gainItem(ctx.$dataWeapons[1], 1);
    assert.equal(ctx.$gameParty.weapons()[1].id, 7);
});
