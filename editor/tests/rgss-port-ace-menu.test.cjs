'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const R = require(path.join(legacy, 'RgssImporter.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');

const MENU = `$imported["YEA-AceMenuEngine"] = true
module YEA
  module MENU
    COMMAND_WINDOW_ALIGN = 1
    MAIN_MENU_ALIGN = 0
    MAIN_MENU_RIGHT = false
    MAIN_MENU_ROWS  = 11
    DRAW_TP_GAUGE   = true
    DRAW_MP_GAUGE   = true
    COMMANDS =[
       :item,         # Opens up the item menu.
       :status,
       :quest,
       :help,
       :event_2,
       :game_end,
       :save,
       :quit,
    ]
    COMMON_EVENT_COMMANDS ={
      :event_2 => [   "Battle Mode",            5,          6,        30],
    }
    CUSTOM_COMMANDS ={
      :quest =>        ["Missions",            0,          0,     :command_quest],
      :quit =>         ["Quit",                0,          0,     :command_quit],
    }
  end
end`;

test('Menu Engine: the command table, alignments and the battle engine swap come from the game', () => {
    const scripts = [MENU, '$imported["YEA-BattleEngine"] = true'];
    const p = require(path.join(legacy, 'plugins', 'RR_YanflyMenu.params.js')).extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.deepEqual(JSON.parse(p.commands), [
        { symbol: 'item', kind: 'main' }, { symbol: 'status', kind: 'main' },
        { symbol: 'quest', kind: 'custom', text: 'Missions', enable: 0, show: 0, handler: 'command_quest' },
        { symbol: 'event_2', kind: 'common', text: 'Battle Mode', enable: 5, show: 6, commonEvent: 30 },
        { symbol: 'game_end', kind: 'main' }, { symbol: 'save', kind: 'main' },
        { symbol: 'quit', kind: 'custom', text: 'Quit', enable: 0, show: 0, handler: 'command_quit' }
    ]);
    assert.equal(p.commandAlign, 'center');
    assert.equal(p.menuAlign, 'left');
    assert.equal(p.menuRows, '11');
    assert.equal(p.tpFirst, 'true');
});

test('ports install in the order of the game\'s scripts, after the Ace base', () => {
    const dest = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rr-order-'));
    try {
        const scripts = ['$imported["YEA-CoreEngine"] = true', 'module Soul_Icons\n  HP_Icon = 20\nend', MENU];
        const families = C.scriptFamilies(scripts);
        families.basePlugins = ['RR_AceCompat'];
        const names = R.installPlugins(dest, families, C.scriptConstants(scripts), scripts, [], () => {}).map(p => p.name);
        assert.deepEqual(names, ['RR_AceCompat', 'RR_YanflyCore', 'RR_StatusIcons', 'RR_YanflyMenu']);
    } finally { fs.rmSync(dest, { recursive: true, force: true }); }
});

test('equipment types count from 1: weapons are type 1, and lock and seal equip shift with them', () => {
    const db = C.database({ weapons: [null, { id: 1, etype_id: 0, features: [] }], armors: [null, { id: 1, etype_id: 2, features: [] }],
        classes: [null, { id: 1, features: [{ code: 54, data_id: 0, value: 0 }, { code: 55, data_id: 1, value: 0 }, { code: 51, data_id: 3, value: 0 }] }] }, {});
    assert.equal(db.weapons[1].etypeId, 1);
    assert.equal(db.armors[1].etypeId, 3);
    assert.deepEqual(db.classes[1].traits.map(t => t.dataId), [1, 2, 3]);
});

test('Parameter Tables: class and enemy CSVs become database stats', () => {
    const csv = 'Sentinel,MHP,MMP,ATK,DEF,MAT,MDF,AGI,LUK\r\n1,10,10,2,1,2,1,1,1\r\n2,11,12,3,2,3,2,2,2\r\n';
    const files = { 'Data/Params/class2.csv': csv, 'Data/Params/enemy1.csv': csv, 'Data/Params/actor1.csv': csv };
    const db = { classes: [null, { id: 1, params: 'kept' }, { id: 2 }], enemies: [null, { id: 1, params: [] }], actors: [null, { id: 1 }] };
    const skipped = [];
    const script = '$imported["TH_ParamTables"] = true';
    const n = R.applyParamTables(db, script, { 'TH::Param_Tables::Param_Directory': 'Data/Params' }, (rel) => (files[rel] ? Buffer.from(files[rel]) : null), skipped);
    assert.equal(n, 2);
    assert.equal(db.classes[1].params, 'kept');
    assert.deepEqual(db.classes[2].params[0].slice(0, 4), [0, 10, 11, 0]);
    assert.equal(db.classes[2].params[1][2], 12);
    assert.equal(db.classes[2].params[0].length, 100);
    assert.deepEqual(db.enemies[1].params, [10, 10, 2, 1, 2, 1, 1, 1]);
    assert.equal(skipped.length, 1);
    assert.equal(R.applyParamTables(db, '', {}, () => null), 0);
});

/** Window_Base with a recording contents bitmap, the ports loaded on top in order. */
function windows(parameters, ...names) {
    const calls = [];
    const contents = {
        width: 448, fontSize: 18, paintOpacity: 255,
        fillRect: (...a) => calls.push(['fill', ...a]), gradientFillRect: (...a) => calls.push(['gradient', ...a]), clearRect() {}
    };
    function Window_Base() { this.contents = contents; }
    Object.assign(Window_Base.prototype, {
        lineHeight: () => 24, textWidth: (t) => String(t).length * 8,
        drawText: (t, x, y, w, a) => calls.push(['text', String(t), x, y, w, a]), drawIcon: (n, x, y) => calls.push(['icon', n, x, y]),
        changeTextColor() {}, resetTextColor() {}, changePaintOpacity() {}, resetFontSettings() {}, drawActorFace() {}, drawCurrencyValue() {}
    });
    function Window_Selectable() {}
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    function Window_Command() {}
    Window_Command.prototype = Object.create(Window_Selectable.prototype);
    function Window_HorzCommand() {}
    Window_HorzCommand.prototype = Object.create(Window_Command.prototype);
    function Window_MenuCommand() {}
    Window_MenuCommand.prototype = Object.create(Window_Command.prototype);
    const colour = (n) => '#' + n;
    const ctx = vm.createContext({
        Window_Base, Window_Selectable, Window_Command, Window_HorzCommand, Window_MenuCommand,
        Window_Gold: function() {}, Window_MenuStatus: function() {}, Window_ItemList: function() {},
        Scene_Menu: function() {}, Scene_Item: function() {}, Scene_Battle: function() {}, Scene_Load: function() {},
        Window_BattleLog: function() {}, Window_BattleStatus: function() {}, Rectangle: function(x, y, width, height) { Object.assign(this, { x, y, width, height }); },
        Game_Actor: function() {}, Game_BattlerBase: function() {}, Game_Party: function() {}, Game_Event: function() {}, Game_Troop: function() {},
        DataManager: { isDatabaseLoaded: () => true },
        PluginManager: { parameters: (name) => parameters[name] || {} },
        ColorManager: new Proxy({ textColor: colour }, { get: (t, k) => t[k] || (() => k) }),
        TextManager: { hp: 'Health Points', hpA: 'HP', mpA: 'MP', tpA: 'TP', levelA: 'LV', currencyUnit: 'G', param: (i) => 'P' + i },
        Graphics: { boxWidth: 640, boxHeight: 480 }, $gameSystem: { mainFontSize: () => 18 }
    });
    // Classes the plugins extend but these tests do not draw with.
    for (const name of ['Spriteset_Battle', 'Sprite_Battleback', 'Window_ActorCommand', 'Window_PartyCommand', 'Window_BattleEnemy', 'Window_BattleActor', 'Window_Help', 'BattleManager'])
        if (!(name in ctx)) ctx[name] = function() {};
    for (const name of names) vm.runInContext(plugin(name), ctx);
    return { win: new Window_Base(), calls, ctx };
}

const actor = { hp: 10, mhp: 100, mp: 10, mmp: 10, tp: 0, level: 1, hpRate: () => 0.1, mpRate: () => 1, tpRate: () => 0, maxTp: () => 100, name: () => 'Jay', currentClass: () => ({ name: 'Ranger' }), allIcons: () => [] };

test('Core, HP colours and icons stack as the scripts did: icons label the gauges, the full HP term decides whether max fits', () => {
    const core = { colours: '{}', groupDigits: 'true', gaugeHeight: '16', gaugeOutline: 'false' };
    const { win, calls } = windows({ RR_YanflyCore: core, RR_StatusIcons: { hpIcon: '20', mpIcon: '4258', tpIcon: '48' } }, 'RR_AceCompat', 'RR_YanflyCore', 'RR_HpColorController', 'RR_StatusIcons');
    win.rrAceDrawActorHp(actor, 120, 24);
    assert.deepEqual(calls.find(c => c[0] === 'icon'), ['icon', 20, 120, 24]);
    // A 16-pixel gauge ending 2 above the line's foot.
    assert.deepEqual(calls.find(c => c[0] === 'fill').slice(1, 5), [120, 30, 124, 16]);
    // "10/100" plus "Health Points" is wider than 124, so only the current value is drawn.
    assert.deepEqual(calls.filter(c => c[0] === 'text').map(c => c[1]), ['10']);
    calls.length = 0;
    win.rrAceDrawActorHp(actor, 120, 24, 300);
    assert.deepEqual(calls.filter(c => c[0] === 'text').map(c => c[1]), ['/100', '10']);
    assert.equal(win.rrAceGroup(1234567), '1,234,567');
});

test('Rbahamut EXP: the party row puts HP, MP, TP and EXP one under another at fractions of a line', () => {
    const { win, calls } = windows({}, 'RR_AceCompat', 'RR_RbahamutExp');
    const a = Object.assign({}, actor, { isMaxLevel: () => false, currentLevelExp: () => 0, nextLevelExp: () => 90, currentExp: () => 0 });
    win.rrAceDrawActorSimpleStatus(a, 108, 12);
    const texts = calls.filter(c => c[0] === 'text');
    assert.deepEqual(texts.find(c => c[1] === 'Jay').slice(2, 4), [108, 4]);
    assert.deepEqual(texts.find(c => c[1] === 'EXP').slice(2, 4), [109, 76]);
    assert.deepEqual(texts.find(c => c[1] === '90').slice(2, 4), [109 + 112 - 72, 76]);
});

test('Customizable Item Menu: categories with icons, names from database terms, descriptions for the help', () => {
    const script = `MA_CUSTOM_ITEM_MENU = {
description_at_top: true,
description_lines: 1,
custom_categories: [:aid, :weapon, :all],
category_vocab: {
  :all =>      "All Items",
  :aid =>      "Aid Items",
  :weapon =>   :"Vocab::weapon",
},
category_icons: {
  :aid =>     5279,
  :weapon =>   3916,
},
category_descriptions: {
  :aid =>      "Aid and Consumable Items",
},
}
class Window_MACIM_ItemIconCategory < Window_MA_IconHorzCommand
end`;
    assert.ok(C.scriptFamilies([script]).has('maCustomItemMenu'));
    const p = require(path.join(legacy, 'plugins', 'RR_CustomItemMenu.params.js')).extract({ scripts: [script] });
    assert.deepEqual(JSON.parse(p.categories), [
        { symbol: 'aid', name: 'Aid Items', icon: 5279, description: 'Aid and Consumable Items' },
        { symbol: 'weapon', term: 'weapon', icon: 3916, description: '' },
        { symbol: 'all', name: 'All Items', icon: 0, description: '' }
    ]);
    assert.equal(p.helpLines, '1');
    assert.equal(p.helpAtTop, 'true');
});

test('Extra Param Formulas: Ruby arithmetic, whole numbers divide to whole numbers', () => {
    const script = `$imported["YEA-ExtraParamFormulas"] = true
module YEA
  module XPARAM
    FORMULA ={
      :hit_n_value => "(atk + luk) / 2",
      :hit_formula => "(n / (100.0 + n)) * 0.250 + 0.050 + base_hit * 2/3",
      :cev_n_value => "(agi * luk) / 2",
      :cev_formula => "n / 200.0",
      :grd_n_value => "(self.def + mdf) / 2",
      :grd_formula => "(n / (256.0 + n)) * 0.333 + 0.000 + base_grd",
    }
  end
end`;
    const p = require(path.join(legacy, 'plugins', 'RR_YanflyExtraParamFormulas.params.js')).extract({ scripts: [script] });
    assert.deepEqual(JSON.parse(p.formulas).hit, ['(atk + luk) / 2', '(n / (100.0 + n)) * 0.250 + 0.050 + base_hit * 2/3']);
    function Game_BattlerBase() {}
    Object.defineProperties(Game_BattlerBase.prototype, {
        hit: { get() { return 1; }, configurable: true }, cev: { get() { return 0; }, configurable: true }, grd: { get() { return 1; }, configurable: true }
    });
    Game_BattlerBase.prototype.param = function(id) { return [10, 10, 6, 3, 2, 3, 1, 3][id]; };
    const ctx = vm.createContext({ Game_BattlerBase, PluginManager: { parameters: () => p } });
    vm.runInContext(plugin('RR_YanflyExtraParamFormulas'), ctx);
    const b = new Game_BattlerBase();
    // The shipped game's Attributes page: Hit 72.63%, Crit-Eva 0.50%, Guard Rate 100.39%.
    assert.equal((b.hit * 100).toFixed(2), '72.63');
    assert.equal((b.cev * 100).toFixed(2), '0.50');
    assert.equal((b.grd * 100).toFixed(2), '100.39');
});

test('Status Menu: commands with their handlers and pages, colours, property columns and help placement', () => {
    const script = `$imported["YEA-StatusMenu"] = true
module YEA
  module STATUS
    COMMANDS =[
      [ :custom2,        "Equipment"],
      [ :parameters,        "Traits"],
      [ :rename,     "Rename"],
    ]
    CUSTOM_STATUS_COMMANDS ={
      :custom2 => [           0,          0, :command_name2, :draw_custom2],
    }
    PARAMETERS_VOCAB = "Traits"
    PARAM_COLOUR ={
            2 => [ :atk, Color.new(0, 0, 0), Color.new(128, 255, 128)],
    }
    PROPERTIES_FONT_SIZE = 18
    PROPERTIES_COLUMN1 =[
      [:hit, "Hit"],
    ]
  end
end`;
    const scripts = [script, '$imported["YEA-AceMenuEngine"] = true\nmodule YEA\n  module MENU\n    HELP_WINDOW_LOCATION = 1\n  end\nend'];
    assert.ok(C.scriptFamilies(scripts).has('yeaStatusMenu'));
    const p = require(path.join(legacy, 'plugins', 'RR_YanflyStatusMenu.params.js')).extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.deepEqual(JSON.parse(p.commands), [
        { symbol: 'custom2', text: 'Equipment', enable: 0, show: 0, handler: 'command_name2', draw: 'draw_custom2' },
        { symbol: 'parameters', text: 'Traits' }, { symbol: 'rename', text: 'Rename' }
    ]);
    assert.deepEqual(JSON.parse(p.paramColours), { 2: [[0, 0, 0], [128, 255, 128]] });
    assert.deepEqual(JSON.parse(p.properties), [[['hit', 'Hit']], [], []]);
    assert.equal(p.helpLocation, 'middle');
});

test('Item Rarity: the colour table comes from the game', () => {
    const script = '$imported[:TH_ItemRarity] = true\nmodule TH\n  module Item_Rarity\n    Colour_Map = {\n      1 => [255,255,255], #Common\n      2 => [0,148,255  ], #Rare\n    }\n  end\nend';
    assert.ok(C.scriptFamilies([script]).has('himeItemRarity'));
    assert.deepEqual(JSON.parse(require(path.join(legacy, 'plugins', 'RR_HimeItemRarity.params.js')).extract({ scripts: [script] }).colours), { 1: [255, 255, 255], 2: [0, 148, 255] });
});

test('Large Troops: a child troop joins its parent with its pages renumbered', () => {
    const page = (list) => ({ conditions: {}, list, span: 0 });
    const db = { troops: [null,
        { id: 1, members: [{ enemyId: 1 }, { enemyId: 2 }], pages: [page([{ code: 0, parameters: [] }])] },
        { id: 2, members: [{ enemyId: 3 }], pages: [page([{ code: 108, parameters: ['<parent troop: 1>'] }, { code: 331, parameters: [0, 0, 0, 10] }, { code: 339, parameters: [0, 0, 1, -1] }, { code: 0, parameters: [] }])] }
    ] };
    assert.equal(R.applyLargeTroops(db, '$imported["TH_LargeTroops"] = true'), 1);
    assert.deepEqual(db.troops[1].members.map(m => m.enemyId), [1, 2, 3]);
    assert.equal(db.troops[1].pages.length, 2);
    assert.deepEqual(db.troops[1].pages[1].list[1].parameters, [2, 0, 0, 10]);
    assert.deepEqual(db.troops[1].pages[1].list[2].parameters, [0, 2, 1, -1]);
    assert.equal(R.applyLargeTroops(db, ''), 0);
});

test('party equipment utilities translate into the events', () => {
    const script = 'class Game_Party < Game_Unit\n  def unequip_all\n  end\n  def unequip_actor(actor_id)\n  end\nend';
    assert.ok(C.scriptFamilies([script]).has('partyEquipUtilities'));
    const ctx = { families: new Set(['partyEquipUtilities']) };
    assert.match(C.ruby('$game_party.unequip_all', 'statement', ctx), /changeEquip\(t - 1, null\)/);
});
