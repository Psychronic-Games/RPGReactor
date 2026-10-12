// Thrall (VX) skill ports: Game_Actor's edits, Recharge Skills, Skill Teaching Equipment & Items, Shown Skills
// Fix, Deity's SkillTree with the Respec System, and the Trinket, Shard and Crafting scenes.
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

// Snippets of Thrall's own sections.
const GAME_ACTOR = 'class Game_Actor < Game_Battler\n  #GET MONSTER LEVELED STATS\n  def mon_atk\n     n = actor.parameters[2, @level]\n  end\n  def make_exp_list\n    @exp_list[1] = @exp_list[100] = 0\n    b = 130.0\n    n = 1.1\n  end\nend';
const RECHARGE = 'module RPG\nCLASS_RECHARGE_MODS = { # <- Do not touch.\n  1 => 0,\n  2 => 1.0,\n} # <- Do not touch.\nACTOR_RECHARGE_MODS = { # <- Do not touch.\n  1 => 0,\n  2 => -2,\n  3 => 0.5,\n} # <- Do not touch.\nend\nclass Game_Battler\n  def update_skill_recharge(turns = 1)\n    for i in @sc_turns_count.keys\n      @sc_turns_count[i] -= turns\n      if @sc_turns_count[i] <= 0\n        @sc_turns_count.delete (i)\n        Audio.se_play("Audio/SE/Recovery", 100, 100) if actor?\n      end\n    end\n  end\n  def update_single_skill_recharge(skill, turns)\n  end\nend';
const TEACHING = 'class RPG::BaseItem\n  def skill_ids\n    return if self.class == RPG::Skill\n    learn_skills = []\n    if self.class == RPG::Weapon\n      if self.element_set.include?(30)\n        for i in 220..224\n          learn_skills.push([i, 1])\n        end\n      end\n    end\n    return learn_skills\n  end\nend\nclass Game_Actor < Game_Battler\n  alias ma_skill_teaching_items_equipment_change change_equip\nend';
const SHOWN = '$imported = {} if $imported == nil\n$imported["ShownSkillsFix"] = true\nclass Window_Skill < Window_Selectable\n  def overdrive_skill?(obj)\n  end\nend';
const SKILLTREE = 'module Deity\n  module SkillTree\n    SLOT_COLOR1 = Color.new(224,224,224)\n    SLOT_COLOR2 = Color.new(16,16,16)\n    CURSOR_COLOR = Color.new(255,0,0)\n    LEARNED_SKILL_COLOR = Color.new(64,224,64)\n    SKILL_POINTS = "Skillpoints"\n    SKILL_COST = "Cost"\n    POINTS_LEVEL_RANGE = 1\n    LEVEL_UP_POINTS = 1\n  end\nend\nclass Window_SkillTree < Window_Base\n  def refresh(actor_id, skills)\n    #Draw Branch Names\n    case actor.class_id\n    when 1\n      text = "Witch"\n      self.contents.draw_text(0,274,80,24,text,1)\n      text = "Mage"\n      self.contents.draw_text(96,274,80,24,text,1)\n      text = "Monk"\n      self.contents.draw_text(192,274,80,24,text,1)\n    else\n      text = "Soldier"\n      self.contents.draw_text(0,274,80,24,text,1)\n      text = "Medic"\n      self.contents.draw_text(96,274,80,24,text,1)\n      text = "Paladin"\n      self.contents.draw_text(192,274,80,24,text,1)\n    end\n  end\nend\nclass Window_SkillTreeInfoLarge < Window_Base\n  def refresh(skill_id)\n      x = 272 * $game_variables[87]\n  end\nend\nclass Scene_SkillTree < Scene_Base\n  def return_scene\n    $scene = Scene_Menu.new(2)\n  end\nend';
const RESPEC = 'class Scene_Respec < Scene_Base\n  def respec\n    @actor.skill_points = @actor.level\n    case @actor.class_id\n    when 1 # Mel\n      for i in 62..94\n        @actor.forget_skill(i)\n      end\n    else # Lionel\n      for i in 95..126\n        @actor.forget_skill(i)\n      end\n    end\n  end\n  def update\n          cost = ($game_party.gold + $game_variables[28]) / 20\n            Audio.se_play("Audio/SE/Saint6", 80, 100)\n  end\nend';
const TRINKETS = 'module STRAK\n  module CABINET\n    TRINKETS = [\n    [1,912,70,"Glowing Charcoal","Grants +20% chance of finding FIRE weapons and armors when possible"],\n    [2,913,71,"Frozen Coral","Grants +20% chance of finding ICE weapons and armors when possible"]\n    ]\n    CHALLENGES = [\n    [1,161,20,70,"Pyro","Salvage 20 FIRE weapons or armors",912]\n    ]\n  end\nend\nclass Window_Trinket < Window_Selectable\n  def draw_item(index, menu_type)\n        draw_icon(862, rect.x, rect.y) if $game_variables[185] == item[0]\n  end\nend\nclass Scene_Trinket < Scene_Base\nend';
const SHARDS = 'class Window_Shard_Inventory < Window_Selectable\nend\nclass Scene_Shards < Scene_Base\nend';
const CRAFTING = 'class Scene_Crafting < Scene_Base\n  def update\n          #Determine Crafting Cost\n  end\nend';
const SCRIPTS = [GAME_ACTOR, TRINKETS, SHARDS, CRAFTING, TEACHING, SHOWN, RECHARGE, SKILLTREE, RESPEC];
const KEYS = ['thrallActor', 'thrallTrinkets', 'thrallShards', 'thrallCrafting', 'thrallSkillTeaching', 'thrallShownSkills', 'thrallRecharge', 'thrallSkillTree'];

test('the families find Thrall\'s skill scripts, in the game\'s order', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of KEYS) assert.ok(fam.has(key), key);
    // Another game's same-named scenes are not Thrall's.
    const other = C.scriptFamilies(['class Scene_Trinket < Scene_Base\nend', 'class Scene_Crafting < Scene_Base\nend', 'module Deity\n  module SkillTree\n  end\nend']);
    for (const key of KEYS) assert.ok(!other.has(key), key);
    const joined = SCRIPTS.join('\n');
    const at = (key) => { const f = C.FAMILIES.find(x => x.key === key); f.detect.lastIndex = 0; return f.detect.exec(joined).index; };
    assert.ok(at('thrallActor') < at('thrallSkillTeaching') && at('thrallSkillTeaching') < at('thrallRecharge') && at('thrallRecharge') < at('thrallSkillTree'));
});

test('events\' calls into the skill scripts translate', () => {
    const ctx = { constants: {}, families: new Set(KEYS) };
    const ruby = (src, kind = 'statement') => C.ruby(src, kind, ctx);
    assert.equal(ruby('for member in $game_party.members\n  member.overkill = 0\n  member.clear_skill_recharge\nend'),
        'for (var member of $gameParty.members()) { member.rrVxSetOverkill?.(0); member.rrClearSkillRecharge?.(); }');
    assert.equal(ruby('$scene = Scene_Trinket.new'), '(typeof Scene_RRThrallTrinkets === "function" && SceneManager.push(Scene_RRThrallTrinkets));');
    assert.equal(ruby('$scene = Scene_Shards.new'), '(typeof Scene_RRThrallShards === "function" && SceneManager.push(Scene_RRThrallShards));');
    assert.equal(ruby('$scene = Scene_Crafting.new'), '(typeof Scene_RRThrallCrafting === "function" && SceneManager.push(Scene_RRThrallCrafting));');
    assert.equal(ruby('$scene = Scene_Respec.new(1)'), '(typeof Scene_RRThrallRespec === "function" && SceneManager.push(Scene_RRThrallRespec));');
    assert.equal(ruby('$scene = Scene_SkillTree.new(0)'),
        '((typeof Scene_RRThrallSkillTree === "function" && SceneManager.push(Scene_RRThrallSkillTree)) && SceneManager.prepareNextScene(0));');
    // The "Adjust Monster Level" common event, which needs every line to carry over to keep its locals.
    const monster = ruby('m = $game_actors[5]\nm.change_level($game_variables[23], false)\n$game_variables[40] = m.base_maxhp*5\n$game_variables[42] = m.mon_atk\n' +
        'z = $game_variables[23] + 1\nz = 99 if z > 99\nx = m.exp_list[z]\ny = m.exp_list[$game_variables[23]]\nv = (x-y) / 15\n$game_variables[46] = (v * 3) / 4');
    assert.match(monster, /m\.changeLevel\(\$gameVariables\.value\(23\), !!\(false\)\);/);
    assert.match(monster, /\$gameVariables\.setValue\(40, \(\(m\.rrVxBaseMaxhp\?\.\(\) \?\? m\.paramBase\(0\)\) \* 5\)\);/);
    assert.match(monster, /\$gameVariables\.setValue\(42, \(m\.rrMonAtk\?\.\(\) \?\? 0\)\);/);
    assert.match(monster, /var x = \(m\.rrExpList\?\.\(\) \?\? \[\]\)\[z\];/);
    assert.match(monster, /var v = Math\.floor\(\(x - y\) \/ 15\);/);
    assert.equal(ruby('$game_variables[1] = $game_party.members[0].skill_points'), '$gameVariables.setValue(1, ($gameParty.members()[0].rrSkillPoints?.() ?? 0));');
});

test('settings come from the game: recharge modifiers keep Ruby\'s floats, the tree\'s terms and branches, the cabinet', () => {
    const r = params('RR_ThrallRecharge').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(r.classMods), { 1: '0', 2: '1.0' });
    assert.deepEqual(JSON.parse(r.actorMods), { 1: '0', 2: '-2', 3: '0.5' });
    assert.equal(r.readySe, 'Recovery');
    const t = params('RR_ThrallSkillTree').extract({ scripts: SCRIPTS });
    assert.deepEqual([t.slotColor1, t.cursorColor, t.learnedColor, t.skillPoints, t.skillCost, t.pointsLevelRange, t.levelUpPoints, t.pictureVariable, t.menuIndex],
        ['224,224,224', '255,0,0', '64,224,64', 'Skillpoints', 'Cost', '1', '1', '87', '2']);
    assert.deepEqual(JSON.parse(t.branches), { 1: ['Witch', 'Mage', 'Monk'], other: ['Soldier', 'Medic', 'Paladin'] });
    assert.deepEqual(JSON.parse(t.respecSkills), { 1: [62, 94], other: [95, 126] });
    assert.deepEqual([t.respecGoldVariable, t.respecSe], ['28', 'Saint6']);
    const c = params('RR_ThrallTrinkets').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(c.trinkets)[1], [2, 913, 71, 'Frozen Coral', 'Grants +20% chance of finding ICE weapons and armors when possible']);
    assert.deepEqual(JSON.parse(c.challenges), [[1, 161, 20, 70, 'Pyro', 'Salvage 20 FIRE weapons or armors', 912]]);
    assert.deepEqual([c.equippedIcon, c.trinketVariable], ['862', '185']);
});

/** Just enough of MZ for the actor-side ports. */
function world(pluginParams = {}) {
    const log = [];
    const skills = [];
    const note = (id) => ({ 62: '\\charge[15]\r\n<coords> 87,1 <coords_end>\r\n<costs> 0 <costs_end>', 65: '<hide skill>\r\n<coords> 9,61 <coords_end>\r\n<costs> 1 <costs_end>\r\n<skills> 62,63,64 <skills_end>',
        66: '<hide skill>\r\n<coords> 45,61 <coords_end>\r\n<skills> 62,63,64 <skills_end>', 67: '\\charge[4]', 95: '\\charge[15]', 30: '<hide skill>\n<overdrive 5>', 198: '<hide skill>',
        150: '\\refresh' })[id] || '';
    for (let id = 1; id <= 230; id++) skills[id] = { id, name: 'Skill ' + id, note: note(id), iconIndex: id, occasion: id === 70 ? 2 : 0, message1: 'Guide' + id, description: '' };
    const weapons = [null, { id: 1, name: 'Saria', note: '\\ls[44]\r\n\\ls[224]\r\n\\recharge[-2]', etypeId: 1, iconIndex: 1, params: [0, 0, 5, 0, 0, 0, 0, 0], traits: [] },
        { id: 2, name: 'Talent', note: '', etypeId: 1, iconIndex: 2, params: [0, 0, 1, 0, 0, 0, 0, 0], traits: [{ code: 31, dataId: 30 }] }];
    const armors = [null, { id: 1, name: 'Old Cape', note: '', etypeId: 4, iconIndex: 657, params: [0, 0, 0, 2, 0, 0, 0, 0], traits: [] }];
    const classes = [null, { id: 1, learnings: [62, 63, 64, 65, 66].map(skillId => ({ level: 1, skillId })), params: [[0, 450, 460], [0, 0, 0], [0, 10, 12], [0, 3, 4], [0, 5, 6], [0, 5, 6], [0, 7, 8]] }];
    const DataManager = { isSkill: (o) => skills.includes(o), isWeapon: (o) => weapons.includes(o), isArmor: (o) => armors.includes(o), isItem: () => false };
    function Game_BattlerBase() {}
    Object.assign(Game_BattlerBase.prototype, {
        meetsSkillConditions() { return true; }, isActor() { return false; }, states() { return []; }, isStateAffected(id) { return (this._states || []).includes(id); },
        canUse(skill) { return this.meetsSkillConditions(skill); }, isLearnedSkill(id) { return this._skills.includes(id); }
    });
    function Game_Battler() {}
    Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
    Game_Battler.prototype.useItem = function() {};
    function Game_Actor(id) { this.initialize(id); }
    Game_Actor.prototype = Object.create(Game_Battler.prototype);
    Object.assign(Game_Actor.prototype, {
        initialize(id) { this.setup(id); },
        setup(id) {
            Object.assign(this, { _actorId: id, _classId: 1, _level: 1, _name: 'Mel', _characterName: '$Mel', _skills: [], _states: [], _exp: { 1: 0 }, _hp: 100, _mp: 10 });
            this._equips = [weapons[1], null, null, null, null].map(o => ({ o, object() { return this.o; }, setObject(x) { this.o = x; } }));
            for (const l of classes[1].learnings) if (l.level <= this._level) this.learnSkill(l.skillId);
        },
        isActor() { return true; }, actorId() { return this._actorId; }, actor() { return { note: '<rrVxClass: 1>' }; }, currentClass() { return classes[this._classId]; },
        name() { return this._name; },
        learnSkill(id) { if (!this._skills.includes(id)) { this._skills.push(id); this._skills.sort((a, b) => a - b); } },
        forgetSkill(id) { const i = this._skills.indexOf(id); if (i >= 0) this._skills.splice(i, 1); },
        skills() { return this._skills.map(id => skills[id]); }, equips() { return this._equips.map(e => e.object()); }, armors() { return []; },
        changeEquip(slot, item) { this._equips[slot].setObject(item); }, levelUp() { this._level++; }, levelDown() { this._level--; },
        currentExp() { return this._exp[this._classId]; }, currentLevelExp() { return this.expForLevel(this._level); }, nextLevelExp() { return this.expForLevel(this._level + 1); },
        maxLevel() { return 99; }, findNewSkills() { return []; }, shouldDisplayLevelUp() { return true; }, performCollapse() {}, isDead() { return this._hp === 0; },
        setHp(v) { this._hp = v; }, characterName() { return this._characterName; }
    });
    Object.defineProperties(Game_Actor.prototype, {
        level: { get() { return this._level; } }, mhp: { get() { return 450; } }, mmp: { get() { return 10; } }, hp: { get() { return this._hp; } }
    });
    const actors = {};
    const $gameActors = { actor: (id) => actors[id] || (actors[id] = new Game_Actor(id)) };
    const party = [];
    function Window_Base() {}
    function Window_Selectable() {}
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    function Window_SkillList() {}
    Window_SkillList.prototype = Object.create(Window_Selectable.prototype);
    const Scene = function() {};
    Scene.prototype = { initialize() {}, create() {}, update() {} };
    const vars = {};
    const ctx = {
        log, Game_BattlerBase, Game_Battler, Game_Actor, Window_Base, Window_Selectable, Window_SkillList, DataManager, Rectangle: function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); },
        PluginManager: { parameters: (name) => pluginParams[name] || {} }, Scene_MenuBase: Scene, Scene_Boot: function() {}, Scene_Battle: function() {}, Scene_Menu: function() {}, Scene_Map: function() {},
        BattleManager: { endTurn() {} }, Game_Action: function() {}, $gameActors, $dataSkills: skills, $dataWeapons: weapons, $dataArmors: armors, $dataClasses: classes, $dataItems: [],
        $gameParty: { members: () => party, inBattle: () => false, menuActor: () => party[0] }, $gameVariables: { value: (id) => vars[id] || 0, setValue: (id, v) => { vars[id] = v; } },
        $gameTroop: { members: () => [] }, $gameSwitches: { value: () => false }, $gamePlayer: { refresh() {} }, $gameMessage: { newPage() { log.push('page'); }, add(t) { log.push(t); } },
        TextManager: { levelUp: '%1 is now %2 %3!', level: 'Level', obtainSkill: '%1 learned!' }, AudioManager: { playSe: (se) => log.push('se ' + se.name) },
        SoundManager: {}, ImageManager: {}, Input: {}, SceneManager: {}
    };
    ctx.Scene_Boot.prototype.start = function() {};
    ctx.Game_Action.prototype.testApply = function() { return false; };
    ctx.Game_Action.prototype.apply = function() {};
    // String#format, as MZ's core adds it.
    vm.createContext(ctx);
    vm.runInContext('String.prototype.format = function(...a) { return this.replace(/%([0-9]+)/g, (s, n) => a[Number(n) - 1]); }; var window = globalThis;', ctx);
    for (const name of ['RR_ThrallActor', 'RR_ThrallSkillTeaching', 'RR_ThrallShownSkills', 'RR_ThrallRecharge', 'RR_ThrallSkillTree']) vm.runInContext(plugin(name), ctx);
    vm.runInContext('Scene_Boot.prototype.start()', ctx);
    ctx.party = party;
    return ctx;
}

test('Game_Actor: one EXP curve, Change Level stops at 70, a skill point line with each level up, armour picks the graphic', () => {
    const w = world();
    const mel = w.$gameActors.actor(2);
    const list = mel.rrExpList();
    assert.deepEqual([list[1], list[2], list[3], list[4], list[100]], [0, 130, 273, 430, 0]);
    mel.changeLevel(90, false);
    assert.equal(mel.level, 70);
    assert.equal(mel.rrVxNextExpS(), list[71]);
    mel._exp[1] = 0; mel._level = 1;
    mel.changeExp(300, true);
    assert.equal(mel.level, 3);
    assert.deepEqual(w.log.slice(-3), ['page', 'Mel is now Level 3!', '\\.\\ic[173] Mel earned a Skill Point!']);
    // Cape icon 657 → armour digit from the defence (2 % 6 + 1), cape 1; the old digits go first.
    mel.changeEquip(3, w.$dataArmors[1]);
    assert.equal(mel.characterName(), '$Mel31');
    mel.changeEquip(3, null);
    assert.equal(mel.characterName(), '$Mel');
    assert.equal(w.Game_Actor.rrArmorCharacterName('$Mel12', null), '$Mel');
    assert.equal(mel.rrMonAtk(), 12);
});

test('Skill tree: no skills to start, a point a level, the notes place and price each skill', () => {
    const w = world();
    const mel = w.$gameActors.actor(2);
    // SkillTree clears the skills the class (and the starting weapon) taught at setup.
    assert.deepEqual(plain(mel._skills), []);
    assert.equal(mel.rrSkillPoints(), 1);
    mel.levelUp(); mel.levelUp();
    assert.deepEqual([mel.level, mel.rrSkillPoints()], [3, 3]);
    const [burst, , , augmented, activated] = w.RRThrallSkillTree.treeSkills(mel);
    assert.deepEqual(plain([burst.costs(), burst.place(), burst.conditions()]), [0, [87, 1], []]);
    assert.deepEqual(plain([augmented.costs(), augmented.place(), augmented.conditions()]), [1, [9, 61], ['62', '63', '64']]);
    assert.equal(activated.costs(), 1, 'no <costs>: 1');
    assert.equal(augmented.conditionsSuffused(), false);
    mel.learnSkill(63);
    assert.equal(augmented.conditionsSuffused(), true, 'any one of the skills it needs');
    // The game's up/down index arithmetic, for a 33-skill tree (class 1).
    const scene = Object.create(w.Scene_RRThrallSkillTree.prototype);
    Object.assign(scene, { _rrActor: mel, _skills: new Array(33).fill(burst) });
    const move = (dir, from) => { scene._index = from; scene[dir](); return scene._index; };
    assert.deepEqual([move('cursorDown', 0), move('cursorDown', 4), move('cursorDown', 30), move('cursorUp', 0), move('cursorUp', 3), move('cursorUp', 10)], [4, 10, 0, 30, 0, 4]);
});

test('Recharge: charge, modifiers, Rapid Fire, the per-action countdown and its sound, clearing', () => {
    const w = world({ RR_ThrallRecharge: { classMods: '{"1":"0"}', actorMods: '{"2":"1.0"}' } });
    const mel = w.$gameActors.actor(2);
    w.party.push(mel);
    mel.rrSetSkillRecharge(w.$dataSkills[62], 0);
    // 15 turns, Saria's \recharge[-2] (a weapon's adds), then one more for the turn it was used.
    assert.equal(mel.rrGetScTurns(w.$dataSkills[62]), 14);
    assert.equal(mel.canUse(w.$dataSkills[62]), false);
    mel.learnSkill(67);   // Rapid Fire
    mel.rrSetSkillRecharge(62, 0);
    assert.equal(mel.rrGetScTurns(62), 12);
    // Only an actor who knows a Burst skill counts every charge down.
    mel.rrSetSkillRecharge(95, 0);
    w.BattleManager.endTurn();
    assert.deepEqual(plain(mel.rrScTurns()), { 62: 12, 95: 12 });
    mel.learnSkill(62);
    w.BattleManager.endTurn();
    assert.deepEqual(plain(mel.rrScTurns()), { 62: 11, 95: 11 });
    mel.rrUpdateSkillRecharge(11);
    assert.deepEqual(plain(mel.rrScTurns()), {});
    assert.deepEqual(w.log.filter(x => x.startsWith('se')), ['se Recovery', 'se Recovery']);
    mel.rrSetSkillRecharge(62, 0);
    mel.rrClearSkillRecharge();
    assert.equal(mel.rrGetScTurns(62), 0);
});

test('Skill Teaching: equipment teaches its skills and takes them back; Talented weapons teach 220-224; the object-id quirk', () => {
    const w = world();
    const mel = w.$gameActors.actor(2);
    assert.deepEqual(plain(w.RRThrallSkillTeaching.skillIds(w.$dataWeapons[1])), [[44, 0], [224, 0]]);
    assert.deepEqual(plain(w.RRThrallSkillTeaching.skillIds(w.$dataWeapons[2])), [[220, 1], [221, 1], [222, 1], [223, 1], [224, 1]]);
    mel.changeEquip(0, w.$dataWeapons[2]);
    assert.deepEqual(plain(mel._skills), [220, 221, 222, 223, 224]);
    mel.changeEquip(0, w.$dataWeapons[1]);
    assert.deepEqual(plain(mel._skills), [44, 224]);
    // Learning 44 for real keeps it "taught" unless the actor knows skill 89 (44's object id).
    mel.learnSkill(44);
    mel.changeEquip(0, null);
    assert.deepEqual(plain(mel._skills), []);
});

test('Shown Skills: hidden skills stay out (overdrive when full, Resuscitate when someone is down); overdrive, weapon, then the rest', () => {
    const w = world();
    const mel = w.$gameActors.actor(2);
    mel._skills = [1, 30, 65, 198, 221];
    const win = Object.create(w.Window_SkillList.prototype);
    win._actor = mel;
    win.makeItemList();
    assert.deepEqual(win._data.map(s => s.id), [221, 1]);
    mel.rrOverdrive = () => 1000;
    mel._hp = 0;
    w.party.push(mel);
    win.makeItemList();
    assert.deepEqual(win._data.map(s => s.id), [30, 221, 1, 198]);
});
