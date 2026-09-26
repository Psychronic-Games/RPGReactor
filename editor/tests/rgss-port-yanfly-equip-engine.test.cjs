'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_YanflyEquipEngine.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_YanflyEquipEngine.params.js'));

// The settings block of Dreamwalker's copy.
const SCRIPT = `$imported = {} if $imported.nil?
$imported["YEA-AceEquipEngine"] = true
module YEA
  module EQUIP
    DEFAULT_BASE_SLOTS = [0,1,2,3,4]
    TYPES ={
    # TypeID => ["Type Name", Removable?, Optimize?],
           0 => ["Weapon",        true,       true],
           1 => ["Empty",         true,       true],
           2 => ["Cybernetic",    true,       false],
           3 => ["Armour",        true,       true],
           4 => ["Gear",          true,       false],
    } # Do not remove this.
    COMMAND_LIST =[
      :equip,
      :optimize,
      :skills,
      :clear,
    # :custom1,
    # :custom2,
    ] # Do not remove this.
    CUSTOM_EQUIP_COMMANDS ={
    # :command => ["Display Name", EnableSwitch, ShowSwitch, Handler Method],
      :custom1 => [ "Custom Name",            0,          0, :command_name1],
      :custom2 => [ "Custom Text",            0,          0, :command_name2],
      :skills =>  [ "Toggle Skills",          0,          0, :command_learning],
    } # Do not remove this.
    STATUS_FONT_SIZE = 18
    REMOVE_EQUIP_ICON = 517
    REMOVE_EQUIP_TEXT = ""
    NOTHING_ICON = 0
    NOTHING_TEXT = ""
  end # EQUIP
end # YEA`;
const LIMITS = `$imported["YEA-AdjustLimits"] = true
module YEA
  module LIMIT
    EQUIP_FONT = 18
  end
end
class Window_EquipStatus < Window_Base
  def draw_param_name(dx, dy, param_id)
    contents.font.size = YEA::LIMIT::EQUIP_FONT
  end
end`;

test('Equip Engine: detected, settings from the game copy with types counted from 1', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('yeaEquipEngine'));
    assert.ok(!C.scriptFamilies(['class Scene_Equip < Scene_MenuBase\nend']).has('yeaEquipEngine'));
    const scripts = [SCRIPT, LIMITS];
    const p = extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.equal(p.defaultSlots, '[1,2,3,4,5]');
    assert.deepEqual(JSON.parse(p.types)[3], { name: 'Cybernetic', removable: true, optimize: false });
    assert.deepEqual(Object.keys(JSON.parse(p.types)), ['1', '2', '3', '4', '5']);
    assert.deepEqual(JSON.parse(p.commands), [{ symbol: 'equip' }, { symbol: 'optimize' },
        { symbol: 'skills', text: 'Toggle Skills', enable: 0, show: 0, handler: 'commandLearning' }, { symbol: 'clear' }]);
    assert.equal(p.removeIcon, '517');
    assert.equal(p.statusFontSize, '18');
    assert.equal(p.statusRows, 'adjustLimits');
    assert.equal(p.limitsFontSize, '18');
    // Adjust Limits placed before the engine is overwritten by it.
    assert.equal(extract({ scripts: [LIMITS, SCRIPT], constants: C.scriptConstants([LIMITS, SCRIPT]) }).statusRows, 'engine');
});

test('Equip Engine: Ruby calls to the stock equipment methods still translate', () => {
    const js = C.ruby('SceneManager.call(Scene_Equip)', 'statement', { families: new Set(['yeaEquipEngine']) });
    assert.match(js, /Scene_Equip/);
});

/** The plugin over a small MZ-shaped runtime: actors, items, party, interpreter. */
function load(parameters = {}, db = {}) {
    const extractParams = extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) });
    function Game_Item() { this._isWeapon = false; this._id = 0; }
    Game_Item.prototype.isNull = function() { return !this._id; };
    Game_Item.prototype.object = function() { return this._id ? (this._isWeapon ? ctx.$dataWeapons : ctx.$dataArmors)[this._id] : null; };
    Game_Item.prototype.setObject = function(item) { this._isWeapon = !!(item && item.wtypeId !== undefined); this._id = item ? item.id : 0; };
    Game_Item.prototype.setEquip = function(isWeapon, id) { this._isWeapon = isWeapon; this._id = id; };
    function Game_Actor(id) { this._actorId = id; this._states = []; this._dual = false; }
    Object.assign(Game_Actor.prototype, {
        actor() { return ctx.$dataActors[this._actorId]; },
        currentClass() { return ctx.$dataClasses[this.actor().classId]; },
        isDualWield() { return this._dual; },
        states() { return this._states; },
        refresh() {},
        isEquipTypeLocked() { return false; },
        isEquipTypeSealed() { return false; },
        canEquip(item) { return !this.isEquipTypeSealed(item.etypeId); },
        equips() { return this._equips.map(i => i.object()); },
        isEquipChangeOk(slotId) { return !this.isEquipTypeLocked(this.equipSlots()[slotId]) && !this.isEquipTypeSealed(this.equipSlots()[slotId]); },
        changeEquip(slotId, item) {
            if (item && !ctx.$gameParty.hasItem(item)) return;
            ctx.$gameParty.gain(this.equips()[slotId], 1);
            ctx.$gameParty.gain(item, -1);
            if (!item || this.equipSlots()[slotId] === item.etypeId) this._equips[slotId].setObject(item);
        },
        forceChangeEquip(slotId, item) { this._equips[slotId].setObject(item); },
        clearEquipments() { for (let i = 0; i < this.equipSlots().length; i++) if (this.isEquipChangeOk(i)) this.changeEquip(i, null); }
    });
    const held = new Map();
    const $gameParty = {
        hasItem: (item) => (held.get(item) || 0) > 0,
        gain: (item, n) => { if (item) held.set(item, (held.get(item) || 0) + n); },
        equipItems: () => [...held].filter(([item, n]) => n > 0).map(([item]) => item).sort((a, b) => (a.wtypeId !== undefined) === (b.wtypeId !== undefined) ? a.id - b.id : a.wtypeId !== undefined ? -1 : 1)
    };
    const cls = () => { function K() {} return K; };
    const [Window_Base, Window_Selectable, Window_StatusBase, Window_EquipStatus, Window_EquipCommand, Window_EquipSlot, Window_EquipItem, Scene_Equip] = Array.from({ length: 8 }, cls);
    Window_EquipCommand.prototype.processOk = function() {};
    for (const m of ['createCommandWindow', 'refreshActor', 'commandOptimize', 'commandClear', 'onSlotOk', 'onItemOk']) Scene_Equip.prototype[m] = function() {};
    function Game_Interpreter() {}
    const ctx = {
        Game_Actor, Game_Item, Game_Interpreter, Window_Base, Window_Selectable, Window_StatusBase, Window_EquipStatus, Window_EquipCommand, Window_EquipSlot, Window_EquipItem, Scene_Equip,
        TextManager: {}, ColorManager: {}, ImageManager: {}, Graphics: {}, Rectangle: function() {}, window: {}, $gameParty, $gameTemp: {},
        DataManager: { isDatabaseLoaded: () => true, isWeapon: (i) => !!i && i.wtypeId !== undefined, isArmor: (i) => !!i && i.atypeId !== undefined },
        $dataSystem: { equipTypes: ['', 'Weapon', '', 'Modification', 'Armor', 'Gear'] },
        $dataActors: db.actors || [null], $dataClasses: db.classes || [null], $dataWeapons: db.weapons || [null], $dataArmors: db.armors || [null], $dataStates: [null],
        PluginManager: { parameters: (name) => (name === 'RR_YanflyEquipEngine' ? Object.assign({}, extractParams, parameters) : {}) }
    };
    ctx.$gameActors = { actor: (id) => ctx.actors[id] };
    vm.runInNewContext(source, ctx);
    ctx.DataManager.isDatabaseLoaded();
    const actor = (id, equips = []) => {
        const a = new Game_Actor(id);
        a.initEquips(equips.length ? equips : ctx.$dataActors[id].equips);
        return a;
    };
    return { ctx, actor, held };
}

const weapon = (id, params = [0, 0, 0, 0, 0, 0, 0, 0], note = '') => ({ id, wtypeId: 1, etypeId: 1, params, note, name: 'W' + id });
const armor = (id, etypeId, params = [0, 0, 0, 0, 0, 0, 0, 0], note = '') => ({ id, atypeId: 1, etypeId, params, note, name: 'A' + id });

test('Equip Engine: slots from the actor note, then the class note, then the default', () => {
    const db = {
        actors: [null,
            { id: 1, classId: 1, note: '', equips: [0, 0, 0, 0, 0] },
            // Beany's note: one line "equip type: 1" — type 1 is both one of the first five and in the settings, so it is listed twice.
            { id: 2, classId: 1, note: '<command list>\r\n"SKILL 3"\r\n</command list>\r\n\r\n<equip slots>\r\nequip type: 1\r\n</equip slots>\r\n', equips: [0, 0, 0, 0, 0] },
            { id: 3, classId: 2, note: '', equips: [0, 0, 0, 0, 0] }],
        classes: [null, { id: 1, note: '' }, { id: 2, note: '<equip slots>\nWeapon\nHeadgear\nBody\nArmour\nAccessory\nGear\nCyber netic\n</equip slots>' }]
    };
    const { actor } = load({}, db);
    assert.deepEqual([...actor(1).equipSlots()], [1, 2, 3, 4, 5]);
    assert.deepEqual([...actor(2).equipSlots()], [2, 2]);
    assert.deepEqual([...actor(3).equipSlots()], [1, 3, 4, 4, 5, 5, 3]);
    const dual = actor(1);
    dual._dual = true;
    assert.deepEqual([...dual.equipSlots()], [1, 1, 3, 4, 5]);
});

test('Equip Engine: starting equipment goes by type to the first empty slot, then <starting gear>', () => {
    const db = {
        actors: [null, { id: 1, classId: 1, note: '<equip slots>\nshield\nshield\n</equip slots>\n<starting gear: 7>', equips: [3, 6, 0, 0, 0] }],
        classes: [null, { id: 1, note: '' }],
        weapons: [null, weapon(1), weapon(2), weapon(3)],
        armors: [null, armor(1, 2), armor(2, 2), armor(3, 2), armor(4, 2), armor(5, 2), armor(6, 2), armor(7, 2)]
    };
    const { actor } = load({}, db);
    const a = actor(1);
    // The weapon (index 0) has no weapon slot and is skipped; shield 6 takes slot 0, gear 7 slot 1.
    assert.deepEqual([...a.equips().map(e => e && e.id)], [6, 7]);
});

test('Equip Engine: <fixed equip> and <sealed equip> use the original numbering, from states and equipment too', () => {
    const db = {
        actors: [null, { id: 1, classId: 1, note: '<fixed equip: 4>', equips: [1, 0, 0, 0, 0] }],
        classes: [null, { id: 1, note: '<sealed equip: 0, 2>' }],
        weapons: [null, weapon(1, undefined, '<sealed equip: 3>')],
        armors: [null]
    };
    const { actor } = load({}, db);
    const a = actor(1);
    assert.equal(a.isEquipTypeLocked(5), true);       // tag 4 = accessory
    assert.equal(a.isEquipTypeSealed(1), false);      // tag 0 is ignored
    assert.equal(a.isEquipTypeSealed(3), true);
    assert.equal(a.isEquipTypeSealed(4), true);       // from the weapon worn
    a._states = [{ note: '<fixed equip: 1>' }];
    assert.equal(a.isEquipTypeLocked(2), true);
    assert.equal(a.isEquipChangeOk(1), false);
});

test('Equip Engine: <equip type> sets an armor type; unknown names leave it', () => {
    const db = { actors: [null], classes: [null], weapons: [null],
        armors: [null, armor(1, 2, undefined, '<equip type: 3>'), armor(2, 2, undefined, '<equip type: Gear>'), armor(3, 4, undefined, '<equip type: 0>'), armor(4, 4, undefined, '<equip type: Nope>')] };
    const { ctx } = load({}, db);
    assert.deepEqual([...ctx.$dataArmors.slice(1).map(a => a.etypeId)], [4, 5, 2, 4]);
});

test('Equip Engine: Optimize leaves types marked so, and picks by the Ace measure', () => {
    const W = [null,
        weapon(1, [0, 0, 7, 0, 0, 0, 0, 0]),   // 7 + 7 = 14 (a plain sum would pick weapon 2)
        weapon(2, [0, 0, 0, 0, 0, 0, 12, 0]),  // 12
        weapon(3, [0, 0, 0, 0, 0, 0, -20, 0])];
    const A = [null, armor(1, 3, [0, 0, 9, 0, 0, 0, 0, 0]), armor(2, 3), armor(3, 4, [0, 0, 0, 2, 0, 0, 0, 0]), armor(4, 4, [0, 0, 0, 0, 0, 0, 3, 0])];
    const db = { actors: [null, { id: 1, classId: 1, note: '', equips: [3, 0, 2, 0, 0] }], classes: [null, { id: 1, note: '' }], weapons: W, armors: A };
    const { actor, ctx } = load({}, db);
    const a = actor(1);
    for (const item of [W[1], W[2], A[1], A[3], A[4]]) ctx.$gameParty.gain(item, 1);
    a.optimizeEquipments();
    // Slot 2 (Cybernetic, type 3) keeps armor 2 although armor 1 measures higher; weapon and armor measured with atk or def twice.
    assert.deepEqual([...a.equips().map(e => e && e.id)], [1, null, 2, 3, null]);
    a.clearEquipments();
    assert.deepEqual([...a.equips().map(e => e && e.id)], [null, null, null, null, null]);
});

test('Equip Engine: a type that is not removable keeps its piece, and the list has no empty entry', () => {
    const db = { actors: [null, { id: 1, classId: 1, note: '', equips: [1, 0, 0, 0, 0] }], classes: [null, { id: 1, note: '' }], weapons: [null, weapon(1)], armors: [null] };
    const types = '{"1":{"name":"Weapon","removable":false,"optimize":true}}';
    const { actor, ctx } = load({ types }, db);
    const a = actor(1);
    a.changeEquip(0, null);
    assert.equal(a.equips()[0].id, 1);
    const list = new ctx.Window_EquipItem();
    list._actor = a;
    list._slotId = 0;
    assert.equal(list.includes(null), false);
    list._slotId = 1;                          // a type missing from the settings is removable
    assert.equal(list.includes(null), true);
    assert.equal(list.includes(ctx.$dataWeapons[1]), false);
});

test('Equip Engine: Change Equipment fills the first empty slot of the type; None empties the slot numbered by the type', () => {
    const db = { actors: [null, { id: 1, classId: 1, note: '<equip slots>\nweapon\ngear\ngear\n</equip slots>', equips: [0, 0, 0, 0, 9] }],
        classes: [null, { id: 1, note: '' }], weapons: [null], armors: Object.assign([null], { 9: armor(9, 5), 10: armor(10, 5) }) };
    const { actor, ctx } = load({}, db);
    const a = actor(1);
    ctx.actors = { 1: a };
    ctx.$gameParty.gain(ctx.$dataArmors[10], 1);
    const run = (p) => ctx.Game_Interpreter.prototype.command319.call({}, p);
    run([1, 5, 10]);
    assert.deepEqual([...a.equips().map(e => e && e.id)], [null, 9, 10]);
    run([1, 2, 0]);                            // type 2 → slot 1
    assert.deepEqual([...a.equips().map(e => e && e.id)], [null, null, 10]);
});

test('Equip Engine: the command list follows the settings; the chosen command is remembered', () => {
    const { ctx } = load({}, { actors: [null], classes: [null], weapons: [null], armors: [null] });
    const added = [];
    const w = new ctx.Window_EquipCommand();
    w.addCommand = (text, symbol, enabled = true) => added.push([text, symbol, enabled]);
    w.index = () => 2;
    Object.assign(ctx.TextManager, { equip2: 'Equip', optimize: 'Optimize', clear: 'Remove All' });
    w.makeCommandList();
    assert.deepEqual(added, [['Equip', 'equip', true], ['Optimize', 'optimize', true], ['Toggle Skills', 'skills', true], ['Remove All', 'clear', true]]);
    w.processOk();
    assert.equal(ctx.$gameTemp._rrSceneEquipIndex, 2);
});
