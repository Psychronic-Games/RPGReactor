// Thrall (VX) systems ports: Module_Loot and Game_Temp's loot generator with Strak's Loot Table (RR_ThrallLoot),
// Game_System's lists and the Job Board (RR_ThrallJobBoard), the Guide (RR_ThrallGuide) and the Feature Shop
// (RR_ThrallFeatureShop): the families find the game's scripts, the events' calls translate, the settings come
// from the scripts, and the plugins' rules run on a small stand-in of MZ.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));
// Values made in a vm context fail strict equality across realms: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ---- snippets of Thrall's own sections (CRLF, as the game's are) ----------------------------------------------
const crlf = (s) => s.replace(/\n/g, '\r\n');
const MODULE_LOOT = crlf(`module LOOT
  # LOOT ID'S
  UNIQUE_WEAPONS = [514,515,516,517,518,519,520,521,522,523]
  UNIQUE_ARMORS = [480,481,482,483,484,485,486,487]
  UNIQUE_ITEMS = [167,144,166]
  PAIN_ITEMS = [173,174]
  LEG_PAIN_ITEMS = [173,173,174,
  174]
  C_SWORDS = [442,443]
  U_SWORDS = [339,340]
  R_SWORDS = [244,245]
  E_SWORDS = [170]
  L_SWORDS = [152]
  M_SWORDS = [147]
  C_SHIELD = [309]
  U_SHIELD = [292]
  R_SHIELD = [271]
  E_SHIELD = [259]
  L_SHIELD = [256]
  M_SHIELD = [255]
  C_ITEMS = [141,141,147]
  U_ITEMS = [142]
  R_ITEMS = [143]
  E_ITEMS = [145]
  L_ITEMS = [162]
  UW_PREFIX = ["Fierce","Swift","Long","Keen","Fiery","Icy","Static",
    "Weakening","Heavy","Light","Serrated","Double"]
  RW_PREFIX = ["Violent","Hot"]
  RW_FIRE_PREFIX = ["Hot"]
  RW_ICE_PREFIX = ["Cold"]
  RW_SHOCK_PREFIX = ["Amped"]
  RW_WEAK_PREFIX = ["Crippling"]
  UA_PREFIX = ["Healthy","Tough"]
end`);
const GAME_TEMP = crlf(`class Game_Temp
  def generate_loot (iterations, drop_rate, level, force_type = 0)
    drop_items = []
    return drop_items
  end

  def generate_prefix (drop, source, rarity)
    trinket = false
    if drop.is_a?(RPG::Weapon)
      case prefix #DMG +15%
      when "Fierce","Vicious","Vital","Sharp","Hot",
        "Cold"
        atk_mod += 15
        price_mod += 15
      end
      case prefix #DMG +30%
      when "Violent","Pure"
        atk_mod += 30
      end
      if prefix == "Destroying" #DMG +45%
        atk_mod += 45
      end
      case prefix #DEX +15%
      when "Swift"
        drop.agi = drop.agi + ((drop.agi*15)/100)
      end
      if prefix == "Blinding"#DEX +45%
        price_mod += 45
      end
      case prefix #ACC +10%
      when "Long"
        drop.hit = drop.hit + 10
      end
      case prefix #CRIT +5%
      when "Keen","Sharp"
        drop.spi = drop.spi + 5
      end
      case prefix #Elements
      when "Fiery","Hot"
        drop.element_set = drop.element_set + $data_weapons[501].element_set
        unless exempt.include?(source.name)
          if drop.element_set.include?(1)
            drop.animation_id = 8
          end
        end
      when "Icy","Cold"
        atk_mod -= 15
      when "Static","Amped"
        atk_mod -= 15
      when "Weakening","Crippling"
        atk_mod -= 15
      end
      case prefix #Accessories
      when "Heavy"
        drop.note = source.note + "HEAVY"
      when "Light"
        drop.fast_attack = true
      when "Double"
        atk_mod -= 40
      when "Serrated"
        drop.critical_bonus = true
      end
      drop.name = (prefix + " " + source.name)
    else #Armor Prefixes
      case prefix #DEF+20%
      when "Tough"
        drop.def = drop.def + ((drop.def*20)/100)
      end
      case prefix #HP+20%
      when "Healthy"
        drop.atk = drop.atk + ((drop.atk*20)/100)
      end
      case prefix #Elements
      when "Fireproof"
      when "Insulated"
      when "Grounded"
      when "Stable"
      end
      case prefix #Accessories
      when "Healing"
      when "Cooling"
      when "Lucky"
      when "Learned"
      when "Spiked"
      end
    end
    return drop
  end
end`);
const GAME_SYSTEM = crlf(`class Game_System
  attr_accessor :accepted_jobs            # a list of accepted jobs
  def generate_jobs(iterations, locations)
    max_floors = [5,7,7,9]
    dungeon_level = [6,13,13,18]
    icons = [8,229,232,235,230,233,236,231,234,237]
  end
  def job_detail(x)
    case x
    when 1 # 1 - 100 : Main Missions
      text = "Kill the Vampires in the Hollow Keep"
    when 204..213
      text = "Deliver the requested "
    when 301 # 301 - 400 : Locations
      text = "Bloodstone Mine "
    when 401..500 # 401 - 500 : Floors
      text = (x-400).to_s + "F"
    when 501 # 501 - 600 : Job Titles
      text = "Kill"
    else
      text = ""
    end
    return text
  end
  def get_job_index(dungeon)
    return 0
  end
  def get_cleared_index
    return 0
  end
end`);
const JOB_BOARD = crlf(`class Window_Job_Details < Window_Base
  def refresh (index, jobs, wind)
        icons = [145,158,164,165,166,167,144,148,159,168]
  end
end
class Scene_JobBoard < Scene_Base
end`);
const GUIDE_CONFIG = crlf(`module GuideData
  CATEGORIES = [:combat, :world, :status, :enemies, :loot]
  LIST_WIDTH = 184          # The width, in pixels, of the left-hand windows
  ICONS = {
    :combat => 298,
    :world => 9,
    :status => 1,
    :enemies => 5,
    :loot => 13,
  }
  VOCAB_HELP_GENERAL = "Use the horizontal directional keys to switch categories"
  VOCAB_HELP_SELECTED = "Use the vertical directional keys to scroll up and down"
  HELP_ALIGNMENT = 1
  def self.guide_data (id)
    name = ""
    parags = []
    icon_index = 0
    custom_categories = []
    auto_reveal = false
    case id
    when 1
      name = "Actions"
      parags[0] = "Guide1"
      icon_index = 298
      custom_categories.push (:combat)
      auto_reveal = [true]
    when 2
      name = "Hidden"
      parags[0] = "Guide2"
      icon_index = 10
      custom_categories.push (:combat)
      auto_reveal = [false]
    when 212
      name = " Weapon Prefixes"
      parags = ["text","Uncommon Weapon Prefixes",
      "Double: MULTI","Fierce: DMG: +15%"]
      icon_index = 229
      custom_categories.push (:loot)
      auto_reveal = [true,true,false,
      false]
    when 216
      name = "Thrall"
      parags[0] = "Guide209"
      icon_index = 864
      custom_categories.push (:enemies)
      auto_reveal = [false]
    end
    return name, parags, icon_index, custom_categories, auto_reveal, skill_id
  end
end`);
const GUIDE_IMPL = crlf(`class Game_Guides
end
class Game_Party
  alias modalg_qst_jrnl_party_init_guides initialize
  def initialize
    modalg_qst_jrnl_party_init_guides
    @guides = Game_Guides.new
    for i in 1..144
      @name, @parags, @icon_index, @custom_categories, @auto_reveal = GuideData.guide_data (i)
    end
    for i in 216..217
    end
  end
  def refresh
  end
end`);
const FEATURE_SHOP = crlf(`module STRAK
  module APPRAISE
    STORAGE = [
    [765,0,"ITEM Backpack 1","Increases Item Backpack capacity to 12",200,26],
    [765,0,"ITEM Backpack 2","Increases Item Backpack capacity to 14",400,26]
    ]
    ENEMIES = [
    [864,0,"Thrall","Learn more information about Thralls",50,216]
    ]
    UW_PREFIX = ["Double","Fierce","Fiery","Heavy","Icy","Keen","Light","Long",
    "Serrated","Static","Swift","Weakening"]
    W_NAMES = ["Helios","Zangetsu"]
    W_ID = [145,146]
    LW = [147,152]
  end
end
class Window_Description < Window_Base
end
class Scene_Appraise < Scene_Base
end`);
const SCRIPTS = [MODULE_LOOT, GAME_TEMP, GAME_SYSTEM, JOB_BOARD, GUIDE_CONFIG, GUIDE_IMPL, FEATURE_SHOP];
const FAMILIES = ['thrallLoot', 'thrallJobBoard', 'thrallGuide', 'thrallFeatureShop'];

test('the families find Thrall\'s systems scripts, in the game\'s script order', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of FAMILIES) assert.ok(fam.has(key), key);
    // Another game's Game_System or guide has none of these.
    const other = C.scriptFamilies(['class Game_System\n  def initialize\n  end\nend', 'module QuestData\n  def self.quest_data (id)\n  end\nend']);
    for (const key of FAMILIES) assert.ok(!other.has(key), key);
});

test('the events\' calls into the loot, the jobs, the guide and the shops translate', () => {
    const ctx = { constants: C.scriptConstants(SCRIPTS), families: new Set(FAMILIES) };
    const js = (src) => C.ruby(src, 'statement', ctx);
    const ex = (src) => C.ruby(src, 'expression', ctx);
    // A chest: the loot generated for the party's average level, then the table.
    assert.equal(js('lvls = [lvl]\n$game_temp.generate_loot(1,chance,lvls,2)'.replace('[lvl]', '[5]').replace('chance', '[9000]')),
        'var lvls = [5];\n($gameTemp.rrGenerateLoot?.(1, [9000], lvls, 2) ?? []);');
    assert.equal(js('$scene = Scene_LootTable.new'), '(typeof Scene_RRThrallLootTable === "function" && SceneManager.push(Scene_RRThrallLootTable));');
    assert.equal(ex('$game_temp.in_battle'), '$gameParty.inBattle()');
    // Jobs: Fast Travel and the dungeons read the same list.
    assert.equal(js('i = $game_system.get_job_index(301)\njob = $game_system.accepted_jobs[i]\njob[5] = true'),
        'var i = ($gameSystem.rrGetJobIndex?.(301) ?? 0);\nvar job = ($gameSystem.rrAcceptedJobs?.() ?? [])[i];\njob[5] = true;');
    assert.equal(ex('$game_system.check_floor(302)'), '($gameSystem.rrCheckFloor?.(302) ?? false)');
    assert.equal(ex('$game_system.accepted_jobs.size > 6'), '(($gameSystem.rrAcceptedJobs?.() ?? []).length > 6)');
    const del = js('for job in $game_system.accepted_jobs.dup\n if job[0] == 2\n  $game_system.accepted_jobs.delete(job)\n end\nend');
    assert.match(del, /^for \(var job of /);
    assert.ok(js('job = [2,301,0,0,0,false]\n$game_system.accepted_jobs.push(job)'));
    assert.equal(js('$game_system.generate_jobs(9, loc)'.replace('loc', '4')), '$gameSystem.rrGenerateJobs?.(9, 4);');
    // Blackjack, tutorials, the save stamps.
    assert.ok(js('deck = $game_system.deck\nc = deck[rand(deck.size)]\n$game_system.hand_1.push(c)\n$game_system.deck.delete(c)'));
    assert.equal(js('$game_system.hand_1 = []'), '$gameSystem.rrSetList?.("Hand1", []);');
    assert.equal(js('$game_system.tutorials[4] = true'), '($gameSystem.rrTutorials?.() ?? [])[4] = true;');
    assert.equal(ex('$game_system.tutorials[0] == false'), '(($gameSystem.rrTutorials?.() ?? [])[0] === false)');
    assert.equal(ex('$game_system.version_id != $data_system.version_id'), '($gameSystem.versionId() !== $dataSystem.versionId)');
    assert.equal(ex('$game_system.validator != $game_system.time_check'), '(($gameSystem.rrValidator?.() ?? 0) !== ($gameSystem.rrTimeCheck?.() ?? 0))');
    assert.equal(ex('$game_system.weapon_list.size > 0'), '(($gameSystem.rrWeaponList?.() ?? []).length > 0)');
    // The guide and the shops.
    assert.equal(js('reveal_guide(210)'), '$gameParty.rrRevealGuide?.(210);');
    assert.equal(js('$game_party.guides[210].auto_reveal[3] = true'), '(($gameParty.rrGuides?.() ?? [])[210]?.auto_reveal ?? [])[3] = true;');
    assert.equal(js('$scene = Scene_Guide.new'), '(typeof Scene_RRThrallGuide === "function" && (SceneManager.push(Scene_RRThrallGuide), SceneManager.prepareNextScene(undefined, undefined)));');
    assert.equal(js('$scene = Scene_Appraise.new(1)'), '(typeof Scene_RRThrallAppraise === "function" && (SceneManager.push(Scene_RRThrallAppraise), SceneManager.prepareNextScene(1)));');
    assert.equal(js('$scene = Scene_JobBoard.new'), '(typeof Scene_RRThrallJobBoard === "function" && SceneManager.push(Scene_RRThrallJobBoard));');
    // With the plugins off a list call does nothing and breaks nothing.
    const off = new Function('$gameSystem', js('$game_system.accepted_jobs.push([1])\n$game_system.tutorials[2] = true'));
    assert.doesNotThrow(() => off({}));
});

test('settings come from the scripts: loot tables, prefix bonuses, job texts, guides, shop tables', () => {
    const loot = params('RR_ThrallLoot').extract({ scripts: SCRIPTS });
    const tables = JSON.parse(loot.lootTables);
    assert.deepEqual(tables.LEG_PAIN_ITEMS, [173, 173, 174, 174]);
    assert.equal(tables.UW_PREFIX.length, 12);
    const wp = JSON.parse(loot.weaponPrefixes), ap = JSON.parse(loot.armorPrefixes);
    assert.deepEqual(wp['DMG+15%'], ['Fierce', 'Vicious', 'Vital', 'Sharp', 'Hot', 'Cold'], 'a when list over two lines');
    assert.deepEqual([wp['DMG+45%'], wp['DEX+45%']], [['Destroying'], ['Blinding']]);
    assert.deepEqual(wp.Elements, [['Fiery', 'Hot'], ['Icy', 'Cold'], ['Static', 'Amped'], ['Weakening', 'Crippling']], 'nested ifs inside a when do not end the case');
    assert.deepEqual(wp.Accessories, [['Heavy'], ['Light'], ['Double'], ['Serrated']]);
    assert.deepEqual([ap['DEF+20%'], ap['HP+20%'], ap.Accessories.length], [['Tough'], ['Healthy'], 5]);

    const jobs = params('RR_ThrallJobBoard').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(jobs.jobDetails), [[1, 1, 'Kill the Vampires in the Hollow Keep'], [204, 213, 'Deliver the requested '], [301, 301, 'Bloodstone Mine '], [401, 500, null], [501, 501, 'Kill']]);
    assert.deepEqual([jobs.maxFloors, jobs.dungeonLevels, jobs.deliveryIcons], ['5,7,7,9', '6,13,13,18', '145,158,164,165,166,167,144,148,159,168']);

    const guide = params('RR_ThrallGuide').extract({ scripts: SCRIPTS });
    const g = JSON.parse(guide.guides);
    assert.deepEqual(g['1'], ['Actions', ['Guide1'], 298, ['combat'], [true]]);
    assert.deepEqual(g['212'], [' Weapon Prefixes', ['text', 'Uncommon Weapon Prefixes', 'Double: MULTI', 'Fierce: DMG: +15%'], 229, ['loot'], [true, true, false, false]]);
    assert.deepEqual([guide.categories, JSON.parse(guide.categoryIcons).enemies, guide.listWidth, guide.helpAlignment, guide.startGuides], ['combat,world,status,enemies,loot', 5, '184', '1', '1-144,216-217']);

    const shop = JSON.parse(params('RR_ThrallFeatureShop').extract({ scripts: SCRIPTS }).tables);
    assert.deepEqual(shop.STORAGE[1], [765, 0, 'ITEM Backpack 2', 'Increases Item Backpack capacity to 14', 400, 26]);
    assert.deepEqual([shop.W_NAMES, shop.LW, shop.UW_PREFIX.length], [['Helios', 'Zangetsu'], [147, 152], 12]);
});

// ---- a small MZ ------------------------------------------------------------------------------------------
function weapon(id, o = {}) {
    return Object.assign({ id, name: '', iconIndex: 0, description: '', note: '', price: 0, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], etypeId: 1, wtypeId: 1, animationId: 0 }, o);
}
function armor(id, o = {}) {
    return Object.assign({ id, name: '', iconIndex: 0, description: '', note: '', price: 0, params: [0, 0, 0, 0, 0, 0, 0, 0], traits: [], etypeId: 2, atypeId: 1 }, o);
}
function usable(id, o = {}) {
    return Object.assign({ id, name: '', iconIndex: 0, description: '', note: '', price: 0, effects: [], damage: { type: 0, elementId: 0, formula: '0', variance: 20, critical: false },
        scope: 0, occasion: 0, speed: 0, successRate: 100, repeats: 1, hitType: 0, animationId: 0, consumable: true }, o);
}

/** MZ classes and globals enough for the four plugins; `random` gives Math.random's values in turn. */
function mz({ random = [], parameters = {} } = {}) {
    const W = [null], A = [null], I = [null];
    for (let i = 1; i <= 530; i++) W.push(weapon(i));
    for (let i = 1; i <= 495; i++) A.push(armor(i));
    for (let i = 1; i <= 200; i++) I.push(usable(i));
    const el = (ids, code = 31) => ids.map(e => ({ code, dataId: e, value: 0 }));
    // Sources: a sword (type 1) of each rarity, the marker entries the prefixes and favourites copy from.
    W[442] = weapon(442, { name: 'Sword', iconIndex: 283, params: [0, 0, 10, 0, 0, 0, 0, 0], traits: el([1, 14]).concat([{ code: 22, dataId: 0, value: 0 }]) });
    W[443] = weapon(443, { name: 'Edge', iconIndex: 284, params: [0, 0, 10, 0, 0, 0, 0, 0], traits: el([1, 14]) });
    W[339] = weapon(339, { name: 'Blade', iconIndex: 290, params: [0, 0, 10, 0, 0, 0, 0, 0], traits: el([1, 13]) });
    W[340] = W[339];
    W[244] = weapon(244, { name: 'Edge', iconIndex: 254, params: [0, 0, 10, 0, 0, 0, 0, 0], price: 50, traits: el([1, 12]) });
    W[501] = weapon(501, { name: 'BURN', traits: el([6]).concat([{ code: 32, dataId: 2, value: 0.5 }]) });
    W[527] = weapon(527, { name: 'FAVORITE', traits: el([18]) });
    W[528] = weapon(528, { name: 'PERFECT', traits: el([23]) });
    A[309] = armor(309, { name: 'Buckler', iconIndex: 461, params: [0, 0, 100, 100, 100, 100, 0, 0], traits: el([14], 11), etypeId: 2 });
    A[491] = armor(491, { name: 'FAVORITE', traits: el([18], 11) });
    I[141] = usable(141, { name: 'Grape', iconIndex: 146, price: 20, description: 'Restores 35% HP', effects: [{ code: 11, dataId: 0, value1: 0.35, value2: 0 }] });
    I[147] = I[141];
    I[166] = usable(166, { name: 'Gold', iconIndex: 8, price: 5 });
    const vars = [], sws = [];
    const queue = random.slice();
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    const drawn = [];
    const contents = () => ({ width: 0, height: 0, fontSize: 12, textColor: '', clear() {}, drawText: (t, x, y) => drawn.push(['text', String(t), x, y]), blt() {}, destroy() {}, measureTextWidth: (t) => String(t).length * 6 });
    function Window_Base() { this.initialize(...arguments); }
    Window_Base.prototype.initialize = function(rect) {
        Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, active: false, opacity: 255, origin: { x: 0, y: 0 } });
        this.updatePadding();
        this.contents = contents();
        this.contents.width = this.innerWidth; this.contents.height = this.innerHeight;
    };
    Object.defineProperty(Window_Base.prototype, 'innerWidth', { get() { return this.width - this.padding * 2; } });
    Object.defineProperty(Window_Base.prototype, 'innerHeight', { get() { return this.height - this.padding * 2; } });
    Object.assign(Window_Base.prototype, {
        updatePadding() { this.padding = 12; }, lineHeight: () => 36, changeTextColor(c) { this.contents.textColor = c; }, resetFontSettings() {}, createContents() {},
        textWidth(t) { return String(t).length * 6; }, drawIcon: (i, x, y) => drawn.push(['icon', i, x, y]), drawItemName: (item, x, y) => drawn.push(['name', item.name, x, y])
    });
    function Window_Selectable() { this.initialize(...arguments); }
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Selectable.prototype, {
        initialize(rect) { Window_Base.prototype.initialize.call(this, rect); this._index = -1; },
        index() { return this._index; }, select(i) { this._index = i; }, deselect() { this._index = -1; }, activate() { this.active = true; }, deactivate() { this.active = false; },
        maxItems: () => 0, maxCols: () => 1, ensureCursorVisible() {}, scrollTo() {},
        itemRect(i) { return new Rectangle(0, i * 24, this.innerWidth, 24); },
        refresh() { for (let i = 0; i < this.maxItems(); i++) this.drawItem(i); }, drawItem() {}
    });
    function Scene_Base() {}
    function Scene_MenuBase() { this.initialize(...arguments); }
    Scene_MenuBase.prototype = Object.create(Scene_Base.prototype);
    Object.assign(Scene_MenuBase.prototype, { initialize() { this._windows = []; }, create() {}, update() {}, addWindow(w) { this._windows.push(w); } });
    function Scene_Map() {}
    function Scene_Boot() {}
    Scene_Boot.prototype.start = function() {};
    function Scene_Title() {}
    Scene_Title.prototype.start = function() {};
    function Game_Temp() {}
    function Game_System() { this.initialize(); }
    Game_System.prototype.initialize = function() { this._versionId = 1; };
    Game_System.prototype.versionId = function() { return this._versionId; };
    Game_System.prototype.mainFontSize = function() { return 12.2; };
    function Game_Item() { this._obj = null; }
    Game_Item.prototype.setObject = function(o) { this._obj = o; };
    Game_Item.prototype.object = function() { return this._obj; };
    function Game_Actor(id) { this._actorId = id; this.level = 10; this._equips = [new Game_Item(), new Game_Item()]; this._skills = []; this.hp = 100; this.mhp = 100; }
    Game_Actor.prototype.equips = function() { return this._equips.map(e => e.object()); };
    Game_Actor.prototype.isLearnedSkill = function(id) { return this._skills.includes(id); };
    Game_Actor.prototype.param = function() { return 10; };
    Game_Actor.prototype.turnEndOnMap = function() { this.mapTurn = true; };
    function Game_Party() { this.initialize(); }
    Game_Party.prototype.initialize = function() { this._gold = 0; this._items = {}; this._weapons = {}; this._armors = {}; this._members = []; };
    const bucket = (p, o) => (W.includes(o) ? p._weapons : A.includes(o) ? p._armors : p._items);
    Object.assign(Game_Party.prototype, {
        numItems(o) { return bucket(this, o)[o.id] || 0; }, gainItem(o, n) { const b = bucket(this, o); b[o.id] = (b[o.id] || 0) + n; }, loseItem(o, n) { this.gainItem(o, -n); },
        gold() { return this._gold; }, gainGold(n) { this._gold += n; }, members() { return this._members; }, inBattle: () => false,
        weapons() { return Object.keys(this._weapons).filter(k => this._weapons[k] > 0).map(k => W[k]); }, armors() { return Object.keys(this._armors).filter(k => this._armors[k] > 0).map(k => A[k]); }
    });
    const actors = [null, new Game_Actor(1), new Game_Actor(2), new Game_Actor(3), new Game_Actor(4)];
    const se = [];
    const ctx = {
        PluginManager: { parameters: (name) => parameters[name] || {} }, Rectangle, Window_Base, Window_Selectable, Scene_Base, Scene_MenuBase, Scene_Map, Scene_Boot, Scene_Title,
        Game_Temp, Game_System, Game_Party, Game_Actor, Game_Item, Proxy, JSON, Bitmap: function(w, h) { Object.assign(this, contents(), { width: w, height: h }); },
        DataManager: {
            isWeapon: (o) => W.includes(o), isArmor: (o) => A.includes(o), isItem: (o) => I.includes(o), isSkill: () => false,
            setupNewGame() {}, makeSaveContents: () => ({}), extractSaveContents() {}, extractMetadata(d) { d.meta = {}; }
        },
        SceneManager: { _stack: [Scene_Map], pop() { this.popped = true; }, goto(s) { this.went = s; }, push(s) { this.pushed = s; }, prepareNextScene() {} },
        SoundManager: { playCursor: () => se.push('cursor'), playOk: () => se.push('ok'), playCancel: () => se.push('cancel'), playBuzzer: () => se.push('buzzer'), playShop: () => se.push('shop') },
        AudioManager: { playSe: (s) => se.push('se:' + s.name) },
        Input: { pressed: new Set(), rrGamepadTriggered(i) { return this.pressed.has(i); }, rrGamepadPressed(i) { return this.pressed.has(i); }, isTriggered: () => false, isPressed: () => false },
        ImageManager: { loadSystem: (n) => ({ name: n }), loadPicture: (n) => ({ name: n, width: 784, height: 600, isReady: () => true }) },
        ColorManager: { textColor: (n) => '#c' + n, normalColor: () => '#c0', systemColor: () => '#c16', powerUpColor: () => '#c24', powerDownColor: () => '#c25' },
        $dataWeapons: W, $dataArmors: A, $dataItems: I, $dataStates: [null, { iconIndex: 1 }, { iconIndex: 2 }], $dataSystem: { versionId: 1 },
        $gameVariables: { value: (id) => vars[id] || 0, setValue: (id, v) => { vars[id] = v; } },
        $gameSwitches: { value: (id) => !!sws[id], setValue: (id, v) => { sws[id] = v; } },
        $gameActors: { actor: (id) => actors[id] || null }, $gameTroop: { clear() { this.cleared = true; } },
        Graphics: { width: 608, height: 480 }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext('Math.random = () => (__queue.length ? __queue.shift() : 0);', Object.assign(ctx, { __queue: queue }));
    ctx.$gameSystem = new Game_System();
    ctx.$gameTemp = new Game_Temp();
    ctx.$gameParty = new Game_Party();
    return { ctx, vars, sws, actors, se, drawn, queue, W, A, I, run: (src) => vm.runInContext(src, ctx) };
}
/** Math.random values for rand(n) to give `k`. */
const r = (k, n) => (k + 0.5) / n;
const lootParams = () => {
    const p = params('RR_ThrallLoot').extract({ scripts: SCRIPTS });
    return { RR_ThrallLoot: p };
};

test('generate_loot: a common sword rolled from its level, its type taken off the pity list', () => {
    // force_type 2 (weapon), rate 900000: rand gives 450000 (common). Rolls: the sword, then atk 10 + rand(6), the level
    // multiplier 1 + rand(2), the variance rand(21) - 10; the same for agi; hit ± rand(11) - rand(11).
    const random = [r(450000, 900000), r(0, 2), r(5, 6), r(1, 2), r(20, 21), r(5, 6), r(0, 2), r(0, 21), r(10, 11), r(0, 11)];
    const { ctx, W, run } = mz({ random, parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), ctx);
    run('Scene_Boot.prototype.start.call({})');
    W[37].name = 'Old loot';
    const drops = run('$gameTemp.rrGenerateLoot(1, [900000], [5], 2)');
    assert.equal(drops.length, 1);
    const d = W[37];
    // atk = (15 + 5*2) * 2 = 50, +10% = 55, + source 10% = 60; agi = 15 + 5*1 = 20, -10% = 18, +0%.
    assert.deepEqual([d.name, d.iconIndex, d.description, d.params[2], d.params[6]], ['Sword', 283, '5', 60, 18]);
    // hit = 95 + (rand(11) - rand(11)) = 95 + 10 - 0; price = (60 + 18) * 5 * (spi 0 + hit 105) / 100.
    assert.equal(d.price, Math.floor(78 * 5 * 105 / 100));
    assert.deepEqual(plain(drops[0].element_set), [1, 14]);
    assert.deepEqual(plain(run('$gameSystem._rrWeaponTypes')), [1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5], 'one sword off the pity list');
    assert.ok(d.traits.some(t => t.code === 31 && t.dataId === 14), 'the MZ record follows the VX fields');
});

test('generate_loot: a rare weapon takes a prefix and its bonuses; a shop item rolls gold', () => {
    // Rare (rand 5000 of 9000), sword 244, atk and agi rolls, hit; then the prefix: not a trinket, "Violent" (DMG +30%).
    const random = [r(5000, 9000), r(0, 2), r(0, 6), r(10, 21), r(0, 6), r(10, 21), r(5, 11), r(5, 11), r(99, 100), r(0, 2)];
    const { ctx, W, vars, run } = mz({ random, parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), ctx);
    vars[81] = 1;   // swords only
    run('$gameTemp.rrGenerateLoot(1, [9000], [1], 2)');
    const d = W[37];
    assert.equal(d.name, 'Violent Edge');
    // atk 10 + 1*2 = 12, *2 = 24, +0%, +10% = 26, then +30% = 33.
    assert.equal(d.params[2], 33);
    assert.equal(plain(run('$gameSystem._rrWeaponTypes')).length, 15, 'a forced type leaves the pity list');

    // A dropped item: one in four common drops is gold, worth level x 1-10 x 5, named by its value.
    const drop = mz({ random: [r(500000, 900000), r(0, 4), r(3, 10)], parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), drop.ctx);
    drop.run('$gameTemp.rrGenerateLoot(1, [900000], [4], 1)');
    assert.deepEqual([drop.I[31].name, drop.I[31].price], ['16 Gold', 80]);
    // The item shop (variable 3 = 5) stocks from slot 101 and never gold: a Grape at its price times the level.
    const shop = mz({ random: [r(500000, 900000), r(0, 3)], parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), shop.ctx);
    shop.vars[3] = 5;
    shop.run('$gameTemp.rrGenerateLoot(1, [900000], [4])');
    assert.deepEqual([shop.I[101].name, shop.I[101].price, shop.I[101].description], ['Grape', 80, 'Restores 35% HP']);
    assert.ok(shop.I[101].effects.some(e => e.code === 11 && e.value1 === 0.35), 'its effects follow');
});

test('the database the loot is written into is saved with the game and put back on load', () => {
    const { ctx, W, run } = mz({ parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), ctx);
    run('Scene_Boot.prototype.start.call({})');
    run('RRThrallVx.lootCopy("weapon", 1, $dataWeapons[442])');
    run('RRThrallVx.lootToggleFavorite($dataWeapons[1])');
    assert.deepEqual(plain(run('RRThrallVx.lootRecord("weapon", 1).element_set')), [1, 14, 18]);
    const saved = run('DataManager.makeSaveContents()').rrThrallItems;
    assert.deepEqual(Object.keys(saved.weapon), ['1'], 'only what changed');
    run('Scene_Title.prototype.start.call({})');
    assert.equal(W[1].name, '', 'the title reloads the database');
    run('DataManager.extractSaveContents({ rrThrallItems: ' + JSON.stringify(saved) + ' })');
    assert.equal(W[1].name, 'Sword');
    assert.ok(run('RRThrallVx.lootIsFavorite($dataWeapons[1])'));
});

test('the sort orders, Thrall\'s has_item? and the map turn', () => {
    const { ctx, W, A, actors, run } = mz({ parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), ctx);
    run('RRThrallVx.lootCopy("weapon", 2, $dataWeapons[339]); RRThrallVx.lootCopy("weapon", 3, $dataWeapons[442]); RRThrallVx.lootCopy("weapon", 4, $dataWeapons[244])');
    const names = (list) => plain(list).map(x => x.name);
    // Rarity first (12 rare, 13 uncommon, 14 common), then type; by type it is the same here (all swords).
    assert.deepEqual(names(run('RRThrallVx.lootSortWeapons([$dataWeapons[2], $dataWeapons[3], $dataWeapons[4]], 0)')), ['Edge', 'Blade', 'Sword']);
    assert.equal(run('RRThrallVx.lootRarity($dataWeapons[2])'), 13);
    // Armour worn by actor 3 (not in the party) counts as held with equipment.
    actors[3]._equips[1].setObject(A[309]);
    assert.ok(run('$gameParty.isAnyMemberEquipped($dataArmors[309])'));
    assert.ok(!run('RRThrallVx.lootPartyHasItem($dataArmors[309], true)'));
    actors[1].turnEndOnMap();
    assert.ok(!actors[1].mapTurn, 'no poison or regeneration on the map');
    assert.equal(W.length, 531);
});

test('the Loot Table moves loot into the backpack, buys in a shop, and salvages what is left', () => {
    const { ctx, W, A, vars, se, run } = mz({ parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), ctx);
    run('Scene_Boot.prototype.start.call({})');
    vars[5] = 10; vars[6] = 10; vars[26] = 10;
    run('RRThrallVx.lootCopy("weapon", 37, $dataWeapons[442]); RRThrallVx.lootCopy("armor", 47, $dataArmors[309])');
    const scene = run('new Scene_RRThrallLootTable()');
    scene.create();
    assert.deepEqual(plain(scene._loot).map(x => x.name), ['Sword', 'Buckler'], 'weapons, then armours');
    assert.equal(vars[4], 2);
    // Confirm on the sword: into weapon slot 1, the loot slot emptied.
    ctx.Input.pressed = new Set([2]);
    scene.update();
    assert.deepEqual([W[1].name, ctx.$gameParty.numItems(W[1]), W[37].name], ['Sword', 1, '']);
    assert.equal(scene._backpack, 1);
    assert.equal(se.pop(), 'se:Loot');
    // Cancel with loot left: the salvage prompt; confirm salvages it (a common piece is 1 material) and leaves.
    ctx.Input.pressed = new Set([1]);
    scene.update();
    assert.ok(scene._confirmWindow.active);
    ctx.Input.pressed = new Set([2]);
    scene.update();
    assert.equal(vars[89], 1);
    assert.ok(ctx.SceneManager.popped, 'back to the map');
    assert.equal(A[47].name, '', 'leaving empties the loot slots');

    // The armour shop: buying costs the price; no gold, no sale.
    const shop = mz({ parameters: lootParams() });
    vm.runInContext(plugin('RR_ThrallLoot'), shop.ctx);
    shop.vars[3] = 4; shop.vars[6] = 10;
    shop.run('RRThrallVx.lootCopy("armor", 122, $dataArmors[309]); $dataArmors[122].price = 300');
    const s2 = shop.run('new Scene_RRThrallLootTable()');
    s2.create();
    assert.equal(s2._backpack, 0);
    shop.ctx.Input.pressed = new Set([2]);
    s2.update();
    assert.equal(shop.se.pop(), 'buzzer');
    shop.ctx.$gameParty._gold = 500;
    s2.update();
    assert.deepEqual([shop.A[1].name, shop.ctx.$gameParty.gold(), shop.se.pop()], ['Buckler', 200, 'shop']);
});

test('Game_System\'s jobs: texts, the floor\'s job, cleared jobs, a generated board', () => {
    const p = params('RR_ThrallJobBoard').extract({ scripts: SCRIPTS });
    // generate_jobs: type 201 (rand 0), location 301, floor 3 (rand 2), reward roll 10 (money or uncommon: icon 229).
    const { ctx, vars, run } = mz({ random: [r(0, 4), r(0, 2), r(2, 5), r(10, 20), r(1, 4)], parameters: { RR_ThrallJobBoard: p } });
    vm.runInContext(plugin('RR_ThrallJobBoard'), ctx);
    ctx.$gameSystem = new ctx.Game_System();
    const sys = ctx.$gameSystem;
    assert.deepEqual([sys.rrJobDetail(1), sys.rrJobDetail(207), sys.rrJobDetail(403), sys.rrJobDetail(999)], ['Kill the Vampires in the Hollow Keep', 'Deliver the requested ', '3F', '']);
    assert.deepEqual(plain(sys.rrTutorials()), [false, false, false, false, false, false, false, false, false]);
    ctx.$gameParty._members = [{ level: 4 }, { level: 9 }];
    sys.rrGenerateJobs(1, 2);
    assert.deepEqual(plain(sys.rrJobs()), [[201, 301, 403, 229, 6, false]], 'level: the dungeon\'s 6, under the party\'s 6');
    sys.rrAcceptedJobs().push([2, 301, 0, 0, 0, false], [201, 302, 404, 8, 5, false]);
    vars[16] = 4;
    assert.deepEqual([sys.rrCheckFloor(302), sys.rrGetJobIndex(302), sys.rrCheckFloor(301), sys.rrGetJobIndex(301)], [true, 1, false, 0]);
    assert.ok(!sys.rrCheckCleared());
    sys.rrAcceptedJobs()[1][5] = true;
    assert.deepEqual([sys.rrCheckCleared(), sys.rrGetClearedIndex(), sys.rrCheckFloor(302)], [true, 1, false]);
    // An event's own Ruby, translated, runs on the same list: Array#delete takes every equal job.
    const js = C.ruby('job = [2,301,0,0,0,false]\n$game_system.accepted_jobs.push(job)\nfor job in $game_system.accepted_jobs.dup\n if job[0] == 2\n  $game_system.accepted_jobs.delete(job)\n end\nend',
        'statement', { constants: {}, families: new Set(FAMILIES) });
    run(js);
    assert.deepEqual(plain(sys.rrAcceptedJobs()).map(j => j[0]), [201]);
    run(C.ruby('$game_system.deck = ["2 1","2 2"]\nc = $game_system.deck[0]\n$game_system.hand_1.push(c)\n$game_system.deck.delete(c)', 'statement', { constants: {}, families: new Set(FAMILIES) }));
    assert.deepEqual([plain(sys.rrDeck()), plain(sys.rrHand1())], [['2 2'], ['2 1']]);
});

test('the guide: a new game\'s guides, made and revealed on first use, prefixes found', () => {
    const p = params('RR_ThrallGuide').extract({ scripts: SCRIPTS });
    const { ctx, run } = mz({ parameters: { RR_ThrallGuide: p } });
    vm.runInContext(plugin('RR_ThrallGuide'), ctx);
    const party = new ctx.Game_Party();
    ctx.$gameParty = party;
    const book = party.rrGuideBook();
    assert.deepEqual(plain(book._idSort), [1], 'guide 2 starts hidden (auto_reveal [false])');
    assert.ok(!party.rrGuideRevealed(212));
    // $game_party.guides[212].auto_reveal[3] = true: asking for the guide reveals it.
    run(C.ruby('$game_party.guides[212].auto_reveal[3] = true', 'statement', { constants: {}, families: new Set(FAMILIES) }));
    assert.ok(party.rrGuideRevealed(212));
    assert.ok(party.rrPrefixRevealed(212, 3) && !party.rrPrefixRevealed(212, 2));
    party.rrRevealGuide(2);
    assert.deepEqual(plain(book._idSort), [1, 2, 212], 'kept in id order');
    assert.deepEqual(plain(book.categoryList('combat')).map(g => g.name), ['Actions', 'Hidden']);
    // The info window lists the prefixes found so far and counts them.
    ctx.Graphics = { width: 608, height: 480 };
    const info = new ctx.Window_RRThrallGuideInfo();
    info.refresh(book.get(212));
    assert.equal(info.contents.height, 96 + 24, 'one prefix line found');
});

test('the feature shop: the next upgrades, and appraisal against the guide', () => {
    const shopParams = params('RR_ThrallFeatureShop').extract({ scripts: SCRIPTS });
    const { ctx, W, vars, run } = mz({ parameters: { RR_ThrallFeatureShop: shopParams, RR_ThrallGuide: params('RR_ThrallGuide').extract({ scripts: SCRIPTS }), RR_ThrallLoot: lootParams().RR_ThrallLoot } });
    for (const name of ['RR_ThrallLoot', 'RR_ThrallJobBoard', 'RR_ThrallGuide', 'RR_ThrallFeatureShop']) vm.runInContext(plugin(name), ctx);
    ctx.$gameSystem = new ctx.Game_System();
    ctx.$gameParty = new ctx.Game_Party();
    vars[26] = 12;
    const upgrades = run('new Scene_RRThrallAppraise()');
    upgrades.prepare(0);
    upgrades.create();
    assert.deepEqual(plain(upgrades._data).map(x => x[2]), ['ITEM Backpack 2'], 'the item backpack at 12: its next size');
    // Appraisal: an uncommon "Fierce Blade" whose prefix the guide has not listed.
    run('RRThrallVx.lootCopy("weapon", 5, $dataWeapons[339]); $dataWeapons[5].name = "Fierce Blade"; $gameParty.gainItem($dataWeapons[5], 1)');
    const appraise = run('new Scene_RRThrallAppraise()');
    appraise.prepare(1);
    appraise.create();
    assert.deepEqual(plain(appraise._data).map(x => x.name), ['Fierce Blade']);
    ctx.$gameParty._gold = 60;
    ctx.Input.pressed = new Set([2]);
    appraise.update();
    assert.ok(ctx.$gameParty.rrPrefixRevealed(212, 3), 'Fierce is the second uncommon prefix: line 3');
    assert.equal(ctx.$gameParty.gold(), 10);
    assert.deepEqual(plain(appraise._data), [null], 'nothing left: a blank entry, as the original');
    assert.equal(W[5].name, 'Fierce Blade');
});
