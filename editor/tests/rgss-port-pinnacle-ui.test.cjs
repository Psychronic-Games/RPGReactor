// Pinnacle - The Five Kingdoms (VX Ace), the menus and the kingdom: the title (RR_PinnacleTitle), the menus and
// windows (RR_PinnacleWindows), the kingdom layer (RR_PinnacleKingdom), H87 Options (RR_H87Options), Szyu's
// Crafting (RR_SzyuCrafting), Molegato's quests (RR_MolegatoQuests), Theo's window backgrounds, Nelderson's menu
// animation and Zeus81's Fullscreen++. The families find the game's scripts, the events' calls translate, the
// settings come from the scripts, and the plugins' rules run on a small stand-in of MZ.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));
const plain = (v) => JSON.parse(JSON.stringify(v));
const crlf = (s) => s.replace(/\n/g, '\r\n');

// ---- snippets of the game's own sections (CRLF, as the game's are) ----------------------------------------------
const TROOP = crlf(`module Troop

  def self.troop_data
      {
    125 => [30, "Troop1ANIM", 0],
    126 => [31, "Troop1ANIM", 1],
    132 => [37, "Troop2ANIM", 0],
    }
  end

  def self.troop_nameflag
    [0,1,1,2,0,2, #0-5
     4,2] #6-7
   end

   def self.faction_names
   {0=>["[3545","Enemy"],
   1=>["[3546", "Beasts"],
   }
   end
end`);
const GAME_PARTY = crlf(`class Game_Party < Game_Unit
  attr_accessor :party_mode
  attr_accessor :daily_income
  attr_accessor :story
  def initialize
    super
    @gold = 0
    @saved_troops = []
    @name = "Gruppo di"
    @daily_income = []
    @story = []
  end
  def max_battle_members
    return 4
  end
  def leader
    $game_actors[1]
 #   battle_members[0]
  end
  def remove_actor(actor_id,remove_commander = true)
    @actors.delete(actor_id)
    lose_item($data_armors[actor_id+100],1, true) if remove_commander
  end
  def max_item_number(item)
    return 999
  end
end`);
const WINDOW_BASE = crlf(`class Window_Base < Window
    def draw_actor_affection(actor, x, y, width = 124)
    return unless actor.actor?
  end
  def draw_centered_actor_graphic(actor,x,y)
    return unless actor
  end
  def draw_actor_skills(actor,x,y)
    draw_icon(368,x,y)
  end
end`);
const SCENE_TITLE = crlf(`class Scene_Title < Scene_Base
  def create_command_window
    @command_window = Window_TitleCommand.new
    @command_window.back_opacity = 25
    @command_window.set_handler(:tutorial, method(:command_tutorial))
  end
  def command_tutorial
    DataManager.setup_new_game(43,1,1)
    close_command_window
  end
end`);
const TITLE_COMMAND = crlf(`class Window_TitleCommand < Window_Command
  def initialize
    super(0, 0)
    self.windowskin = Cache.system("Empty")
    open
  end
  def draw_item(index)
     contents.font.name = "Javanese Text"
     contents.font.size = 50
     shadow_rect = item_rect_for_text(index)
     shadow_rect.x -= 3
     super
  end
  def item_height
    return 35
  end
  def make_command_list
    add_command("[2", :new_game)
    add_command(Vocab::continue, :continue, continue_enabled)
    add_command("TUTORIAL", :tutorial)
    add_command(H87Options::OPTION_COMMAND, :options, true)
    add_command(Vocab::shutdown, :shutdown)
  end
end`);
const H87 = crlf(`$imported = {} if $imported == nil
$imported["H87_Options"] = true
module H87Options
  OPTION_COMMAND = "[4"
  OFF_BAR = "OFF"
  TOGGLE_SOUND = "Switch2"
  SHOW_ON_TITLE = true
  SHOW_ON_MENU = true
  ELEMENTS = [
  {:type => :separator, :text => "[7"},
   {:type => :variable, :text => "[8", :var => :fasttext,
       :help => "[18",
       :values => ["[10", "[11"] },
       {:type => :separator, :text => "[12"},
        {:type => :bar, :text => "[13", :var => :musicvolume, :max => 5, :color => 8,
       :help => "[20"},
           {:type => :separator, :text => "[15"},
    {:type => :variable, :var => :language,
       :help => "[22",
       :values => ["[16", "[17"] },
     ] #NON CANCELLARE QUESTA PARENTESI!
end
class Window_MenuCommand < Window_Command
  alias h87options_aoc add_original_commands unless $@
  def add_original_commands
    h87options_aoc
    if H87Options::SHOW_ON_MENU
      add_command("[50", :options, true)
    end
  end
end`);
const UNIVERSAL = crlf(`module H87_ModConfig
  SETTINGNAME = "game_settings.rvdata2"
end`);
const SZYU = crlf(`INGREDIENTS_TERM = "[122"
CUSTOM_CRAFT_SOUNDS_BY_CAT = ["Saint5", "Bell2"]
CUSTOM_CRAFT_SOUNDS_BY_TYPE = ["Equip3", "Sword2", "Equip1"]
CRAFTING_IN_MENU = true
MENU_CRAFTING_VOCAB = "[1142"
CRAFTING_ITEM_STATUS ={
      :empty      => "-",     # Text used when nothing is shown.
      :tp_gain    => "TP gain", # Text used for TP Gain.
    }
class Scene_Crafting < Scene_ItemBase
end
class Window_CraftingCategory < Window_HorzCommand
  def make_command_list
    add_command(Vocab::item,     :item)
    add_command(Vocab::weapon,   :weapon)
    add_command("[191", :troops)
  end
end
class Window_CraftingIngredients < Window_Selectable
  def draw_ingredients
    if !@item.is_a?(RPG::Item) or is_troop
      draw_text(0,contents_height - 24, 160, line_height, "[127")
    end
  end
end
class Window_MenuCommand < Window_Command
  def add_main_commands
    add_crafting_menu_entry
    add_command(MENU_CRAFTING_VOCAB, :crafting, $game_switches[7]) if CRAFTING_IN_MENU
  end
end
class RPG::BaseItem
  def load_crafting_notetags_sz
  end
end`);
const DIARIO = crlf(`$imported['Molegato-VarQuests'] = true
module MOLEGATO_QUESTS
  CATEGORIES = [236, 121]
  COLOR_ACTIVE=3
  QUEST_DATA=[
  #name               #var. #icon #image        #description
  ["[2651"     ,1    ,236    ,"Tutorial1"     ,"just another quest",
  "[2717
[2718"],
  ["[2676"     ,1    ,121    ,""     ,"just another quest",
  "[2781"],
  ]
end
class Window_QuestCat < Window_Base
  def cat_names
   {236 => "[2646", 121 => "[2647"}
  end
end`);
const THEO = crlf(`module Theo
    DisplayWindowName = false
  WindowList = {
#    Window_MenuStatus => 'MenuStatus',
    Window_ItemList => 'ItemList',
    Window_SaveFile => 'SaveFile'
  } # <-- Don't remove this
end
class Window_Base
  def initialize(*args)
    if Theo::WindowList[self.class]
      @back_img = Sprite.new
    end
  end
end`);
const NEL = crlf(`module NEL
 TRANS_SPEED = {
  :gold =>  25,
  :command => 50,
  :actor => 50
  }
end
class Scene_Menu < Scene_MenuBase
 def create_command_window
	nel_cre_comm_win
	dir = 1 # (rand(4)+ 1).round
	dir *= 2
 end
 def perform_nel_transition
 end
end`);
const SCENE_MENU = crlf(`class Scene_Menu < Scene_MenuBase
  def command_create
    $game_temp.reserve_common_event(8)
    SceneManager.return
  end
  def command_story
    $game_temp.reserve_common_event(170)
    SceneManager.return
  end
  def on_personal_ok
    case @command_window.current_symbol
    when :disband
      $game_temp.reserve_common_event(9)
    when :expand
      $game_temp.reserve_common_event(10)
    when :rename
      SceneManager.scene.prepare(@actor.actor_id, 12)
    end
  end
end`);
const SHOP_BUY = crlf(`class Window_ShopBuy < Window_Selectable
  def price(item)
    array = ["Doralba", "Valgioiosa", "Logonia", "Letharia", "Vetusia", "Fuori"]
    home = array.index($game_actors[1].homeland)
    doralba_prices = [110,115,150,180,150,120]
    valgioiosa_prices = [115,110,165,180,180,120]
    case item
    when $data_items[155] #Monete doralba
      doralba_prices[home]
    when $data_items[156] #Monete valgioiosa
      valgioiosa_prices[home]
    else
      @price[item]
    end
  end
end`);
const ZEUS = crlf(`($imported ||= {})[:Zeus_Fullscreen] = __FILE__
module Graphics
  class << self
    def update_fullscreen
      if 1 == @F11 = Zeus::DLL.User32.GetAsyncKeyState(116)[15] == 1 ? @F11==0 ? 1 : 2 : 0
      end
    end
  end
end`);
// Hime's Choice Options, which the game carries for hide_choice.
const HIME = '$imported["TH_ChoiceOptions"] = true';
const SCRIPTS = [HIME, TROOP, GAME_PARTY, WINDOW_BASE, SCENE_TITLE, TITLE_COMMAND, DIARIO, SZYU, THEO, UNIVERSAL, H87, NEL, SCENE_MENU, SHOP_BUY, ZEUS];
const families = C.scriptFamilies(SCRIPTS);
const ctx = { constants: C.scriptConstants(SCRIPTS), families };
const rb = (src) => C.ruby(src, 'statement', ctx);

test('the families find the game\'s scripts, and no other game\'s', () => {
    for (const k of ['pinnacleKingdom', 'pinnacleWindows', 'pinnacleTitle', 'h87Options', 'szyuCrafting', 'molegatoQuests', 'theoWindowBackground', 'neldersonAnimatedMenu', 'zeusFullscreen']) assert.ok(families.has(k), k);
    const other = C.scriptFamilies(['class Scene_Crafting < Scene_Base\n# Determine Crafting Cost', 'module Theo\nend', 'class Game_Party\n  attr_accessor :story\nend']);
    for (const k of ['szyuCrafting', 'theoWindowBackground', 'pinnacleKingdom']) assert.ok(!other.has(k), k);
});

test('the story, the buildings, the stalls and the armies: the events\' calls translate', () => {
    assert.equal(rb('$game_party.story.push("[3889")'), '$gameParty.rrStory().push("[3889");');
    assert.equal(rb('$game_party.story = []'), '$gameParty.rrSetStory([]);');
    assert.equal(rb('$game_party.story[-1] += ("\\n[3880")'), '$gameParty.rrStory()[-(1)] = $gameParty.rrStory()[-(1)] + ("\\n[3880");');
    assert.match(rb('if $game_party.daily_income.include?(["[3777", [1,5]])\n hide_choice(3, "true")\nend'), /RRPinnacleKingdom\.includes\(\$gameParty\.rrDailyIncome\(\), \["\[3777", \[1, 5\]\]\)/);
    assert.equal(rb('$game_party.daily_income.push(building)'.replace('building', '["[3797"]')), '$gameParty.rrDailyIncome().push(["[3797"]);');
    assert.equal(rb('$game_party.shops = [] unless $game_party.shops'), 'if (!($gameParty.rrShops())) { $gameParty.rrSetShops([]); }');
    assert.equal(rb('hide_choice(1,"total_production(151)<2")'), 'this.rrChoiceOption?.("hidden", 1, (((window.RRPinnacleKingdom?.totalProduction(151) ?? null) < 2)));');
    assert.match(rb('actor.change_class(troop_class(item_used))'.replace(/actor|item_used/g, (m) => (m === 'actor' ? '$game_actors[69]' : '125'))), /\$gameActors\.actor\(69\)\.changeClass\(window\.RRPinnacleKingdom\?\.troopData\(\)\[125\]\?\.\[0\], !!undefined\)/);
    assert.equal(rb('$game_variables[12] = DataManager.lookup_loc_text($game_variables[12])'), '$gameVariables.setValue(12, (window.RRKeyedText ? RRKeyedText.resolve($gameVariables.value(12)) : $gameVariables.value(12)));');
    assert.equal(rb('$game_map.localize_maplines($game_map.map_id)'), 'void 0;');
    // A stall paid in a resource: the scene the call just made gets its goods.
    assert.equal(rb('SceneManager.call(Scene_Shop)\nSceneManager.scene.prepare($game_party.shops[2], true)'), '((s) => s && SceneManager.push(s))(Scene_Shop);\nSceneManager.rrScene()?.prepare?.($gameParty.rrShops()[2], true);');
    // Ruby's Array#delete (the stalls' random stock).
    const js = rb('armors = [26,27,28]\narmors.delete(27)\n$game_variables[1] = armors.size');
    const vars = [];
    vm.runInNewContext(js, { window: {}, $gameVariables: { setValue: (i, v) => { vars[i] = v; } } });
    assert.equal(vars[1], 2, 'without the plugin as well');
});

test('crafting, the settings and the guide: their calls translate', () => {
    assert.equal(rb('$data_items[191].add_recipe("i: 127 - 131")'), 'window.RRSzyuCrafting?.addRecipe($dataItems[191], "i: 127 - 131");');
    assert.equal(rb('DataManager.load_crafting_item_notetags'), 'DataManager.rrLoadCraftingNotetags?.();');
    assert.equal(rb('$game_settings[:anim] += 1'), '(window.$gameSettings || {})["anim"] = (window.$gameSettings || {})["anim"] + (1);');
    assert.equal(rb('SceneManager.call(Scene_Quests)'), '((s) => s && SceneManager.push(s))((typeof Scene_RRMolegatoQuests === "function" ? Scene_RRMolegatoQuests : null));');
    // DataManager's stock call still works beside the families' own.
    assert.equal(C.ruby('DataManager.save_file_exists?', 'expression', ctx), 'DataManager.isAnySavefileExists()');
});

test('settings come from the game\'s scripts', () => {
    const k = params('RR_PinnacleKingdom').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(k.troopData), { 125: [30, 'Troop1ANIM', 0], 126: [31, 'Troop1ANIM', 1], 132: [37, 'Troop2ANIM', 0] });
    assert.deepEqual(JSON.parse(k.troopNameflag), [0, 1, 1, 2, 0, 2, 4, 2]);
    assert.deepEqual(JSON.parse(k.factionNames), { 0: ['[3545', 'Enemy'], 1: ['[3546', 'Beasts'] });
    assert.deepEqual([k.maxBattleMembers, k.maxItems, k.leaderActor, k.partyName, k.commanderOffset], ['4', '999', '1', 'Gruppo di', '100']);

    const t = params('RR_PinnacleTitle').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(t.commands), [['[2', 'new_game'], ['', 'continue'], ['TUTORIAL', 'tutorial'], ['[4', 'options'], ['', 'shutdown']]);
    assert.deepEqual([t.tutorialStart, t.backOpacity, t.windowskin, t.itemHeight, t.shadowOffset], ['[43,1,1]', '25', 'Empty', '35', '3']);

    const h = params('RR_H87Options').extract({ scripts: SCRIPTS });
    assert.equal(JSON.parse(h.elements).length, 6);
    assert.deepEqual(JSON.parse(h.elements)[3], { type: 'bar', text: '[13', var: 'musicvolume', max: 5, color: 8, help: '[20' });
    assert.deepEqual([h.command, h.menuCommand, h.offBar, h.toggleSound], ['[4', '[50', 'OFF', 'Switch2']);

    const s = params('RR_SzyuCrafting').extract({ scripts: SCRIPTS });
    assert.deepEqual([s.ingredientsTerm, s.menuCommand, s.menuSwitch, s.inMenu, s.detailsHint], ['[122', '[1142', '7', 'true', '[127']);
    assert.deepEqual(JSON.parse(s.categories), [['', 'item'], ['', 'weapon'], ['[191', 'troops']]);
    assert.deepEqual(JSON.parse(s.status), { empty: '-', tp_gain: 'TP gain' });

    const q = params('RR_MolegatoQuests').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(q.categories), [236, 121]);
    assert.deepEqual(JSON.parse(q.categoryNames), { 236: '[2646', 121: '[2647' });
    assert.deepEqual(JSON.parse(q.quests)[0], ['[2651', 1, 236, 'Tutorial1', 'just another quest', '[2717\r\n[2718']);

    assert.deepEqual(JSON.parse(params('RR_TheoWindowBackground').extract({ scripts: SCRIPTS }).windows), { Window_ItemList: 'ItemList', Window_SaveFile: 'SaveFile' });
    assert.deepEqual(params('RR_NeldersonAnimatedMenu').extract({ scripts: SCRIPTS }), { goldSpeed: '25', commandSpeed: '50', actorSpeed: '50', direction: '2' });
    assert.deepEqual(params('RR_ZeusFullscreen').extract({ scripts: SCRIPTS }), { keyCode: '116' });

    const w = params('RR_PinnacleWindows').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(w.commonEvents), { story: 170, create: 8, disband: 9, expand: 10 });
    assert.equal(w.renameLength, '12');
    assert.equal(w.troopIcon, '368');
    assert.deepEqual(JSON.parse(w.homelandPrices).coins, { 155: [110, 115, 150, 180, 150, 120], 156: [115, 110, 165, 180, 180, 120] });
});

test('the shipped settings file is a first run\'s settings', () => {
    // Marshal of H87_Settings with @settings = { :musicvolume => 2 }.
    const bytes = Buffer.from([4, 8, 0x6f, 0x3a, 0x11, ...Buffer.from('H87_Settings'), 0x06, 0x3a, 0x0e, ...Buffer.from('@settings'), 0x7b, 0x06, 0x3a, 0x10, ...Buffer.from('musicvolume'), 0x69, 0x07]);
    const h = params('RR_H87Options').extract({ scripts: SCRIPTS, read: (rel) => (rel === 'game_settings.rvdata2' ? bytes : null) });
    assert.deepEqual(JSON.parse(h.defaults), { musicvolume: 2 });
});

// ---- a small stand-in of MZ ----------------------------------------------------------------------------------
function mz(parameters = {}) {
    const ctx = {};
    ctx.window = ctx;
    ctx.PluginManager = { parameters: (name) => parameters[name] || {} };
    const klass = (name, parent) => {
        const f = { [name]: function(...args) { if (this.initialize) this.initialize(...args); } }[name];
        if (parent) { f.prototype = Object.create(parent.prototype); f.prototype.constructor = f; }
        ctx[name] = f;
        return f;
    };
    const items = [null], armors = [null], weapons = [null];
    for (let i = 1; i <= 200; i++) { items.push({ id: i, name: 'I' + i, note: '', iconIndex: i, itypeId: 1, consumable: true, damage: { type: 0 }, effects: [], price: 10 }); armors.push({ id: i, name: 'A' + i, note: '', iconIndex: i }); weapons.push({ id: i, name: 'W' + i, note: '', iconIndex: i }); }
    Object.assign(ctx, { $dataItems: items, $dataArmors: armors, $dataWeapons: weapons, $dataClasses: [], $dataSkills: [], $dataStates: [] });
    ctx.DataManager = {
        isItem: (o) => items.includes(o), isWeapon: (o) => weapons.includes(o), isArmor: (o) => armors.includes(o), isSkill: () => false,
        setupNewGame() {}, makeSavefileInfo: () => ({}), isDatabaseLoaded: () => true, makeSaveContents: () => ({}), extractSaveContents() {}
    };
    const Base = klass('Window_Base');
    Base.prototype.initialize = function() {};
    const Selectable = klass('Window_Selectable', Base);
    klass('Window_Command', Selectable);
    klass('Window_HorzCommand', ctx.Window_Command);
    klass('Window_MenuCommand', ctx.Window_Command);
    ctx.Window_MenuCommand.prototype.addMainCommands = function() {};
    ctx.Window_MenuCommand.prototype.addOriginalCommands = function() {};
    const SceneBase = klass('Scene_Base');
    klass('Scene_MenuBase', SceneBase);
    klass('Scene_ItemBase', ctx.Scene_MenuBase);
    klass('Scene_Menu', ctx.Scene_MenuBase);
    ctx.Scene_Menu.prototype.createCommandWindow = function() { this._commandWindow = { setHandler() {} }; };
    klass('Scene_Load');
    klass('Game_System');
    const party = klass('Game_Party');
    party.prototype.initialize = function() { this._actors = []; this._items = {}; this._armors = {}; this.lost = []; };
    party.prototype.consumeItem = function() {};
    party.prototype.removeActor = function(id) { this._actors = this._actors.filter(a => a !== id); };
    party.prototype.loseItem = function(item, n, equip) { this.lost.push([item.id, n, !!equip]); };
    party.prototype.members = function() { return []; };
    klass('Game_Player');
    ctx.SceneManager = { _scene: null, _nextScene: null };
    return ctx;
}

test('the kingdom: story[-1] is the last line, buildings compare as Ruby compares them, a leaving actor takes their commander', () => {
    const ctx = mz({ RR_PinnacleKingdom: { troopData: '{"125":[30,"Troop1ANIM",0]}' } });
    vm.runInNewContext(plugin('RR_PinnacleKingdom'), ctx);
    const party = new ctx.Game_Party();
    ctx.$gameParty = party;
    party.rrStory().push('[3889');
    party.rrStory().push('[3890');
    vm.runInNewContext('$gameParty.rrStory()[-(1)] = $gameParty.rrStory()[-(1)] + "\\n[3878";', ctx);
    assert.deepEqual(plain(party._rrStory), ['[3889', '[3890\n[3878']);
    party.rrSetDailyIncome([['[3778', [null, 100], [151, 1]], ['[3796', [152, 8], [162, 2]]]);
    assert.ok(ctx.RRPinnacleKingdom.includes(party.rrDailyIncome(), ['[3778', [null, 100], [151, 1]]));
    assert.ok(!ctx.RRPinnacleKingdom.includes(party.rrDailyIncome(), ['[3778', [null, 100]]));
    // A day's yield: gold apart, items by id; an item no building makes is nil.
    assert.deepEqual([ctx.RRPinnacleKingdom.totalProduction(0), ctx.RRPinnacleKingdom.totalProduction(151), ctx.RRPinnacleKingdom.totalProduction(999)], [100, 1, null]);
    assert.equal(party.rrShops(), null, 'the stalls start nil, as the game\'s initialize left them');
    party._actors = [5, 69];
    party.removeActor(5);
    assert.deepEqual(plain(party.lost), [[105, 1, true]]);
    party.removeActor(69, false);
    assert.deepEqual(plain(party.lost), [[105, 1, true]], 'switching parties keeps the commander');
    assert.equal(party.name(), 'Gruppo di');
    assert.equal(party.maxBattleMembers(), 4);
    assert.equal(ctx.RRPinnacleKingdom.troopData()[125][0], 30);
    ctx.SceneManager._scene = 'running';
    assert.equal(ctx.SceneManager.rrScene(), 'running');
    ctx.SceneManager._nextScene = 'called';
    assert.equal(ctx.SceneManager.rrScene(), 'called');
});

test('H87 Options: shared settings, wrapping choices, bars that stop, volumes capped, the language hidden', () => {
    const h87 = params('RR_H87Options').extract({ scripts: SCRIPTS });
    const ctx = mz({ RR_H87Options: Object.assign({}, h87, { defaults: '{"fasttext":0,"musicvolume":2,"language":0}' }) });
    let saved = 0;
    ctx.ConfigManager = { makeData: () => ({}), applyData() {}, save: () => { saved++; } };
    ctx.AudioManager = {};
    ctx.Promise = Promise;
    ctx.Input = { isPressed: () => false };
    ctx.RRKeyedText = { language: () => 'Eng', resolve: (t) => t };
    vm.runInNewContext(plugin('RR_H87Options'), ctx);
    ctx.ConfigManager.applyData({});
    const S = ctx.$gameSettings;
    assert.equal(S.musicvolume, 2);
    assert.equal(S.language, 1, 'the language is the one the import wrote');
    assert.equal(ctx.AudioManager.bgmVolume, 100);
    S.musicvolume = 4;
    assert.equal(ctx.AudioManager.bgmVolume, 200);
    const buffer = {};
    ctx.AudioManager.updateBufferParameters(buffer, 200, { volume: 90, pitch: 100, pan: 0 });
    assert.equal(buffer.volume, 1, 'never louder than the sound asks');
    ctx.AudioManager.updateBufferParameters(buffer, 50, { volume: 90, pitch: 100, pan: 0 });
    assert.equal(buffer.volume, 0.45);
    const list = ctx.RRH87Options.optionList(true);
    assert.deepEqual(plain(list.map(o => o.name)), ['[7', '[8', '[12', '[13'], 'the language and its empty section are left out');
    const fast = list[1], bar = list[3];
    fast.increment(); assert.equal(S.fasttext, 1);
    fast.increment(); assert.equal(S.fasttext, 0, 'a choice steps round');
    fast.decrement(); assert.equal(S.fasttext, 1);
    S.musicvolume = 5;
    assert.equal(bar.canIncrement(), false, 'a full bar goes no further');
    S.musicvolume = 0;
    assert.equal(bar.canDecrement(), false);
    ctx.$gameSettings.dash = 1;
    assert.equal(ctx.Game_Player.prototype.isDashButtonPressed(), true);
    return new Promise(r => setTimeout(r, 0)).then(() => assert.ok(saved > 0, 'a change is saved'));
});

test('Szyu\'s crafting: notes, recipe books, adding a range stops at one already there', () => {
    const ctx = mz({ RR_SzyuCrafting: params('RR_SzyuCrafting').extract({ scripts: SCRIPTS }) });
    ctx.TextManager = {};
    ctx.$dataItems[125].note = '<ingredients>\r\ni: 1x151\r\nc: 5\r\n</ingredients>';
    ctx.$dataItems[191].note = '<recipe book>\r\n<recipes>\r\nw:1-2\r\ni: 125-126\r\n</recipes>';
    vm.runInNewContext(plugin('RR_SzyuCrafting'), ctx);
    ctx.DataManager.rrLoadCraftingNotetags();
    const book = ctx.$dataItems[191];
    assert.deepEqual(plain(book._rrRecipes.map(r => r.name)), ['I125', 'I126', 'W1', 'W2'], 'items before weapons, by id');
    assert.deepEqual(plain(ctx.$dataItems[125]._rrIngredients.map(([o, n]) => [o && o.id, n])), [[151, 1], [null, 5]]);
    ctx.$gameParty = { numItems: (o) => (o.id === 151 ? 1 : 0), gold: () => 4 };
    assert.equal(ctx.RRSzyuCrafting.matches(ctx.$dataItems[125]), false, 'four gold of five');
    ctx.$gameParty.gold = () => 5;
    assert.equal(ctx.RRSzyuCrafting.matches(ctx.$dataItems[125]), true);
    ctx.RRSzyuCrafting.addRecipe(book, 'i: 127 - 128');
    assert.deepEqual(plain(book._rrRecipes.map(r => r.id)), [125, 126, 127, 128, 1, 2]);
    ctx.RRSzyuCrafting.addRecipe(book, 'i: 126 - 129');
    assert.ok(!book._rrRecipes.includes(ctx.$dataItems[129]), 'the game stopped at 126, already there');
    // Reading the notes again drops what was added (the game's events do it).
    ctx.DataManager.rrLoadCraftingNotetags();
    assert.equal(book._rrRecipes.length, 4);
    const contents = ctx.DataManager.makeSaveContents();
    assert.deepEqual(plain(contents.rrRecipeBooks), { 191: [['i', 125], ['i', 126], ['w', 1], ['w', 2]] });
});

test('the title, the menus and the other ports load on the stand-in', () => {
    for (const name of ['RR_TheoWindowBackground', 'RR_ZeusFullscreen', 'RR_NeldersonAnimatedMenu', 'RR_MolegatoQuests']) {
        const ctx = mz();
        ctx.SceneManager.onKeyDown = () => {};
        ctx.Graphics = {};
        vm.runInNewContext(plugin(name), ctx);
    }
    // F5 is the full-screen key, Shift+F5 the stretch.
    const ctx = mz();
    const calls = [];
    ctx.SceneManager.onKeyDown = () => calls.push('reload');
    ctx.Graphics = { _switchFullScreen: () => calls.push('full'), _switchStretchMode: () => calls.push('stretch') };
    vm.runInNewContext(plugin('RR_ZeusFullscreen'), ctx);
    const key = (keyCode, shiftKey = false) => ctx.SceneManager.onKeyDown({ keyCode, shiftKey, preventDefault() {} });
    key(116); key(116, true); key(119);
    assert.deepEqual(calls, ['full', 'stretch', 'reload']);
});

// ---- the windows: a stand-in with every window and scene class the port changes --------------------------------
function windowsContext() {
    const ctx = mz({ RR_PinnacleWindows: params('RR_PinnacleWindows').extract({ scripts: SCRIPTS }) });
    const names = ['Window_StatusBase', 'Window_Help', 'Window_Gold', 'Window_MenuStatus', 'Window_Status', 'Window_ItemCategory', 'Window_ItemList', 'Window_EventItem', 'Window_SkillType',
        'Window_SkillStatus', 'Window_SkillList', 'Window_EquipCommand', 'Window_EquipSlot', 'Window_EquipItem', 'Window_EquipStatus', 'Window_ShopBuy', 'Window_ShopStatus', 'Window_GameEnd',
        'Window_TitleCommand', 'Scene_Status', 'Scene_Item', 'Scene_Skill', 'Scene_Equip', 'Scene_Shop', 'Scene_File', 'Scene_GameEnd', 'Scene_Name'];
    for (const n of names) {
        const f = { [n]: function(...args) { if (this.initialize) this.initialize(...args); } }[n];
        f.prototype = Object.create((/Scene/.test(n) ? ctx.Scene_MenuBase : ctx.Window_Selectable).prototype);
        f.prototype.constructor = f;
        ctx[n] = f;
    }
    ctx.Window_Command.prototype.drawItem = function() {};
    ctx.Window_ItemCategory.prototype.makeCommandList = function() {};
    ctx.Window_Help.prototype.setText = function(t) { this.text = t; };
    ctx.Window_Help.prototype.refresh = function() {};
    ctx.Window_ShopBuy.prototype.price = function() { return 77; };
    ctx.Window_Base.prototype.convertEscapeCharacters = function(t) { return String(t).replace(/\\/g, '\x1b').replace(/\x1bG/gi, 'G'); };
    ctx.Scene_Shop.prototype.prepare = function(goods, only) { this._goods = goods; this._purchaseOnly = only; };
    ctx.TextManager = { currencyUnit: 'Minas' };
    ctx.ImageManager = { loadSystem: () => ({ isReady: () => true, addLoadListener() {} }) };
    ctx.SceneManager = { _scene: null };
    ctx.$gameSystem = { mainFontSize: () => 18.3 };
    return ctx;
}

test('the windows: the game\'s escape codes, item categories, skill types, coin prices, a stall paid in a resource', () => {
    const ctx = windowsContext();
    vm.runInNewContext(plugin('RR_PinnacleWindows'), ctx);
    const actor = (gender, note = '') => ({ _gender: gender, actor: () => ({ note }) });
    const heroes = { 1: actor(2), 2: { actor: () => ({ note: 'male\nwarrior' }) }, 3: { actor: () => ({ note: '' }) } };
    ctx.$gameActors = { actor: (id) => heroes[id] };
    ctx.$gameParty = { numItems: (o) => (o.id === 161 ? 9 : 0) };
    const w = new ctx.Window_Base();
    const conv = (t) => w.convertEscapeCharacters(t);
    assert.equal(conv('\\r[1]<He was|She was|They were> saved'), 'She was saved');
    assert.equal(conv('\\R[2]<sir|madam|friend>'), 'sir', 'a note that starts "male"');
    assert.equal(conv('\\R[3]<sir|madam|friend>'), 'friend');
    assert.equal(conv('Have \\s{$game_party.item_number($data_items[161])} bones'), 'Have 9 bones');
    assert.equal(conv('Paid \\G'), 'Paid  Minas', 'a space before the currency');

    // Items: weapons and armor are Gear; consumable key items Resources (drains are Troops); the rest Important.
    const list = new ctx.Window_ItemList();
    const I = ctx.$dataItems;
    Object.assign(I[150], { itypeId: 2, consumable: true });
    Object.assign(I[125], { itypeId: 2, consumable: true, damage: { type: 5 } });
    Object.assign(I[191], { itypeId: 2, consumable: false });
    Object.assign(I[12], { tpGain: 10 });
    Object.assign(I[13], { iconIndex: 0 });
    const shown = (category, items) => { list._category = category; return items.filter(i => list.includes(i)).map(i => i.id); };
    assert.deepEqual(plain(shown('item', [I[1], I[12], I[13], I[150]])), [1], 'no TP-10 items, no iconless ones, no key items');
    assert.deepEqual(plain(shown('weapon', [ctx.$dataWeapons[1], ctx.$dataArmors[2], I[1]])), [1, 2]);
    assert.deepEqual(plain(shown('armor', [I[150], I[125], I[191]])), [150]);
    assert.deepEqual(plain(shown('troops', [I[150], I[125], I[191]])), [125]);
    assert.deepEqual(plain(shown('keyItem', [I[150], I[125], I[191]])), [191]);
    assert.ok(ctx.Window_EventItem.prototype.includes(I[125]) && !ctx.Window_EventItem.prototype.includes(I[150]), 'Select Key Item picks troops');

    // Skills: the class's types, the learned skills' other types greyed, Passives last.
    ctx.$dataSkills = [null, { id: 1, stypeId: 1 }, { id: 2, stypeId: 3 }, { id: 3, stypeId: 8 }, { id: 4, stypeId: 2 }];
    ctx.$dataSystem = { skillTypes: ['', 'Magic', 'Special', 'Archery', '', '', '', 'Passives', 'Hidden'] };
    ctx.RRKeyedText = { resolve: (t) => (t === '[44' ? 'Passives' : t) };
    const types = new ctx.Window_SkillType();
    types._actor = { addedSkillTypes: () => [2, 1], skills: () => [ctx.$dataSkills[1], ctx.$dataSkills[2], ctx.$dataSkills[3]], addedSkills: () => [4] };
    const commands = [];
    types.addCommand = (name, symbol, enabled, ext) => commands.push([name, enabled, ext]);
    types.makeCommandList();
    assert.deepEqual(plain(commands), [['Magic', true, 1], ['Special', true, 2], ['Archery', false, 3], ['Passives', true, 7]]);

    // A kingdom's coin costs what the hero's homeland pays; other goods their own price.
    heroes[1].rrHomeland = () => 'Valgioiosa';
    ctx.DataManager.isItem = (o) => I.includes(o);
    assert.equal(ctx.Window_ShopBuy.prototype.price(I[155]), 115);
    assert.equal(ctx.Window_ShopBuy.prototype.price(I[156]), 110);
    assert.equal(ctx.Window_ShopBuy.prototype.price(I[1]), 77);
    heroes[1].rrHomeland = () => '';
    assert.equal(ctx.Window_ShopBuy.prototype.price(I[155]), 77, 'no homeland: the database price');

    // A stall paid in a resource takes the resource, not gold.
    const scene = new ctx.Scene_Shop();
    scene.prepare([[0, 136, 1, 3]], true, 151);
    const spent = [];
    ctx.$gameParty = { loseItem: (o, n) => spent.push(['item', o.id, n]), loseGold: (n) => spent.push(['gold', n]), gainItem: (o, n) => spent.push(['gain', o.id, n]) };
    scene._item = I[136];
    scene.buyingPrice = () => 3;
    scene.doBuy(2);
    assert.deepEqual(plain(spent), [['item', 151, 6], ['gain', 136, 2]]);
});
