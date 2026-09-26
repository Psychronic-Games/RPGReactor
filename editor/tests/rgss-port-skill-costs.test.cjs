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
const CORE = '$imported = {} if $imported.nil?\n$imported["YEA-CoreEngine"] = true\nFont.default_size = 18';
const BATTLE = '$imported["YEA-BattleEngine"] = true';
const COST = `$imported["YEA-SkillCostManager"] = true
module YEA
  module SKILL_COST
    HP_COST_COLOUR = 21         # Colour used from "Window" skin.
    HP_COST_SIZE   = 18         # Font size used for HP costs.
    HP_COST_SUFFIX = " %sHP"     # Suffix used for HP costs.
    HP_COST_ICON   = 0          # Icon used for HP costs. Set 0 to disable.
    MP_COST_COLOUR = 23         # Colour used from "Window" skin. Default: 23
    MP_COST_SIZE   = 18         # Font size used for MP costs. Default: 24
    MP_COST_SUFFIX = " %sEN"     # Suffix used for MP costs. No suffix default.
    MP_COST_ICON   = 0          # Icon used for MP costs. Set 0 to disable.
    TP_COST_COLOUR = 2          # Colour used from "Window" skin. Default: 29
    TP_COST_SIZE   = 18         # Font size used for TP costs. Default: 24
    TP_COST_SUFFIX = " %sTP"     # Suffix used for TP costs. No suffix default.
    TP_COST_ICON   = 0          # Icon used for TP costs. Set 0 to disable.
    GOLD_COST_COLOUR = 6          # Colour used from "Window" skin.
    GOLD_COST_SIZE   = 18         # Font size used for Gold costs.
    GOLD_COST_SUFFIX = " %sƵ"   # Suffix used for Gold costs.
    GOLD_COST_ICON   = 0          # Icon used for Gold costs. Set 0 to disable.
  end # SKILL_COST
end # YEA`;
const RESTRICT = `$imported["YEA-SkillRestrictions"] = true
module YEA
  module SKILL_RESTRICT
    COOLDOWN_COLOUR = 8          # Colour used from "Window" skin.
    COOLDOWN_SIZE   = 20         # Font size used for cooldowns.
    COOLDOWN_SUFFIX = "%s"     # Suffix used for cooldowns.
    COOLDOWN_ICON   = 3036          # Icon used for cooldowns. Set 0 to disable.
    WARMUP_COLOUR   = 5          # Colour used from "Window" skin.
    WARMUP_SIZE     = 20         # Font size used for warmups.
    WARMUP_SUFFIX   = "%sWU"     # Suffix used for warmups.
    WARMUP_ICON     = 0          # Icon used for warmups. Set 0 to disable.
    LIMITED_COLOUR  = 8          # Colour used from "Window" skin.
    LIMITED_SIZE    = 16         # Font size used for used up.
    LIMITED_TEXT    = "Used"     # Text used for used up.
    LIMITED_ICON    = 0          # Icon used for used up. Set 0 to disable.
  end # SKILL_RESTRICT
end # YEA`;
// Both add-ons ship commented out with =begin … =end.
const RELOAD = `=begin
module YEA
  module REGEXP
    module SKILL
      RELOAD_SKILLS = /<(?:RELOAD_SKILL|reload skill):[ ]*(\\d+(?:\\s*,\\s*\\d+)*)>/i
    end
  end
end
=end`;
const MAG = `=begin
module YEA
  module REGEXP
    module BASEITEM
      MAG_SIZE = /<(?:MAG_SIZE|mag size):[ ]([\\+\\-]\\d+)>/i
    end
  end
end
class Game_BattlerBase
  def mag_bonus
  end
end
=end`;
const AMMO = `module MeowSAMMO #DO NOT REMOVE!!
  ICON = 5091 # Enter Icon ID for the first type of ammo
  ITEM = 13 # Enter Item ID for the first type of ammo
  ICON_2 = 5107 # Enter Icon ID for the second type of ammo
  ITEM_2 = 14 # Enter Item ID for the second type of ammo
  ICON_3 = 5075 # Enter Icon ID for the third type of ammo
  ITEM_3 = 15 # Enter Item ID for the third type of ammo
  ICON_4 = 5123 # Enter Icon ID for the fourth type of ammo
  ITEM_4 = 16 # Enter Item ID for the fourth type of ammo
  ICON_5 = 4051 # Enter Icon ID for the fifth type of ammo
  ITEM_5 = 17 # Enter Item ID for the fifth type of ammo
end`;
const WAR = `module YEA
  module WEAPON_ATTACK_REPLACE
    DEFAULT_ATTACK_SKILL_ID = 1
  end # WEAPON_ATTACK_REPLACE
end # YEA`;
const ICON = `class Window_ActorCommand < Window_Command
  alias amn_icon_windactorcmd_drawitem  draw_item
end`;
const SCRIPTS = [CORE, BATTLE, AMMO, WAR, COST, ICON, RESTRICT, RELOAD, MAG];

// Notes of the game's skills.
const SHOT = '<aoe cone: 1>\r\n\r\n<custom cost: 1x >\r\n<custom cost icon: 5091>\r\n<custom cost colour: 17>\r\n<custom cost size: 16>\r\n\r\n<custom cost requirement>\r\nactor? ? $game_party.item_number($data_items[13]) >= weapons.size : true \r\n</custom cost requirement>\r\n\r\n<custom cost perform>\r\n\r\nweapons.each do |w|; if w.wtype_id == 2; $game_party.lose_item($data_items[13], 1); $game_party.gain_item($data_items[178], 1); end; end if actor?\r\n\r\n</custom cost perform>\r\n\r\n<whole action>\r\n  wait: 30\r\n</whole action>';
const BURST = '<custom cost: 1x >\r\n<custom cost requirement>\r\nactor? ? $game_party.item_number($data_items[15]) >= weapons.size : true \r\n</custom cost requirement>\r\n<custom cost perform>\r\nweapons.each do |w|;\r\n  if w.wtype_id == 5;\r\n$game_party.lose_item(($data_items[15]), 1);\r\n$game_party.gain_item(($data_items[180]), 1); end; end if actor?\r\n</custom cost perform>';
const MORTAR = '<custom cost colour: 17>\r\n<custom cost size: 16>\r\n<custom cost requirement>\r\n$game_party.item_number($data_items[17])\r\n>=1\r\n</custom cost requirement>\r\n<custom cost perform>\r\n$game_party.lose_item(($data_items[17]), 1)\r\n</custom cost perform>';
const ODDS = '<custom cost: 1x >\r\n<custom cost icon: 20>\r\n<custom cost requirement>\r\nself.hp.odd?\r\n</custom cost requirement>\r\n<custom cost: Odd HP>';

test('the five scripts are detected, and battler calls in Script commands reach the ports', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of ['yanflySkillCost', 'yanflySkillRestrictions', 'meowAmmo', 'yanflyWeaponAttack', 'attackIcon']) assert.ok(fam.has(key), key);
    const ctx = { constants: C.scriptConstants(SCRIPTS), families: fam };
    assert.equal(C.ruby('$game_party.leader.cooldown?(5)', 'expression', ctx), '($gameParty.leader().rrCooldown?.(5) ?? 0)');
    assert.equal(C.ruby('$game_party.leader.set_cooldown(5, 3)', 'statement', ctx), '$gameParty.leader().rrSetCooldown?.(5, 3);');
    assert.equal(C.ruby('$game_party.update_restrictions', 'statement', ctx), '$gameParty.rrUpdateRestrictions?.();');
    assert.equal(C.ruby('$game_actors[1].attack_skill_id', 'expression', ctx), '$gameActors.actor(1).attackSkillId()');
});

test('the custom cost blocks translate with the battler as a', () => {
    const P = params('RR_YanflySkillCost');
    assert.equal(P.battlerRuby('actor? ? $game_party.item_number($data_items[13]) >= weapons.size : true'), 'a.actor? ? $game_party.item_number($data_items[13]) >= a.weapons.size : true');
    assert.equal(P.battlerRuby('self.hp.odd?'), 'a.hp.odd?');
    assert.equal(P.battlerRuby('weapons.each do |w|; if w.wtype_id == 2; end; end'), 'a.weapons.each do |w|; if w.wtype_id == 2; end; end');
    const out = P.customCosts([{ id: 15, note: SHOT }, { id: 17, note: BURST }, { id: 59, note: MORTAR }, { id: 158, note: ODDS }, { id: 3, note: '<custom cost: 1x >' }]);
    assert.deepEqual(Object.keys(out), ['15', '17', '59', '158']);
    assert.equal(out[15].requirement, '(a.isActor() ? ($gameParty.numItems($dataItems[13]) >= a.weapons().length) : true)');
    assert.match(out[15].perform, /^if \(a\.isActor\(\)\) \{ a\.weapons\(\)\.forEach\(\(w\) => \{\s*if \(\(w\.wtypeId === 2\)\) \{ \$gameParty\.loseItem\(\$dataItems\[13\], 1\); \$gameParty\.gainItem\(\$dataItems\[178\], 1\); \} \}\); \}$/);
    assert.match(out[17].perform, /w\.wtypeId === 5/);
    // Lines join with nothing between: "…[17])" + ">=1".
    assert.equal(out[59].requirement, '($gameParty.numItems($dataItems[17]) >= 1)');
    assert.equal(out[158].requirement, '(a.hp % 2 !== 0)');
    assert.equal(out[158].perform, '');
    // What the translator cannot read stays as Ruby.
    const odd = P.customCosts([{ id: 9, note: '<custom cost requirement>\r\n$game_system.some_script_call(3)\r\n</custom cost requirement>' }]);
    assert.equal(odd[9].requirement, null);
    assert.equal(odd[9].requirementRuby, '$game_system.some_script_call(3)');
});

test('<restrict eval> runs to the end of the note, as the script reads it', () => {
    const R = params('RR_YanflySkillRestrictions');
    assert.equal(R.restrictEval('<cooldown: 2>\r\n<restrict eval>\r\nhp < 10\r\n</restrict eval>\r\n<limited uses: 3>\r\nmore'), 'hp < 10more');
    assert.equal(R.restrictEval('<cooldown: 5>'), null);
    const evals = R.restrictEvals([{ id: 4, note: '<restrict eval>\r\nhp < mhp / 2\r\n</restrict eval>' }, { id: 5, note: '<restrict eval>\r\nhp < 5\r\n</restrict eval>\r\n<whole action>' }]);
    assert.equal(evals[4], '(a.hp < Math.floor(a.mhp / 2))');
    assert.deepEqual(evals[5], { ruby: 'hp < 5<whole action>' });
});

test('settings come from the game\'s copies', () => {
    const constants = C.scriptConstants(SCRIPTS);
    const cost = params('RR_YanflySkillCost').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([cost.mpColour, cost.mpSize, cost.mpSuffix, cost.tpColour, cost.hpColour, cost.goldSuffix, cost.tpAfterMp, cost.coreEngine, cost.rgssFontSize, cost.customCosts],
        ['23', '18', ' %sEN', '2', '21', ' %sƵ', 'true', 'true', '18', '{}']);
    const r = params('RR_YanflySkillRestrictions').extract({ scripts: SCRIPTS, constants });
    assert.deepEqual([r.cooldownColour, r.cooldownSuffix, r.cooldownIcon, r.warmupSuffix, r.limitedSize, r.limitedText, r.reloadAddon, r.magSizeAddon, r.rgssFontSize],
        ['8', '%s', '3036', '%sWU', '16', 'Used', 'false', 'false', '18']);
    // The add-ons count once they are live.
    const live = params('RR_YanflySkillRestrictions').extract({ scripts: [RESTRICT, RELOAD.replace(/=begin|=end/g, ''), MAG.replace(/=begin|=end/g, '')], constants });
    assert.deepEqual([live.reloadAddon, live.magSizeAddon], ['true', 'true']);
    assert.deepEqual(JSON.parse(params('RR_MeowAmmo').extract({ scripts: SCRIPTS, constants }).ammo), [[13, 5091], [14, 5107], [15, 5075], [16, 5123], [17, 4051]]);
    assert.deepEqual(params('RR_YanflyWeaponAttack').extract({ scripts: SCRIPTS, constants }), { defaultAttackSkillId: '1' });
});

// Just enough of MZ's objects, written as MZ writes them, for the ports to run their rules.
const ENGINE = `
function cls(base) { const F = function() { if (this.initialize) this.initialize(...arguments); }; F.prototype = Object.create(base ? base.prototype : Object.prototype); F.prototype.constructor = F; return F; }
class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
var ColorManager = { textColor: (n) => 'c' + n, normalColor: () => 'c0' };
var DataManager = { isSkill: (o) => !!o && $dataSkills.includes(o) };
var Game_BattlerBase = cls(), Game_Battler = cls(Game_BattlerBase), Game_Actor = cls(Game_Battler), Game_Enemy = cls(Game_Battler), Game_Unit = cls();
Object.assign(Game_BattlerBase.prototype, {
    initialize() { this.initMembers(); },
    initMembers() { this._hp = 100; this._mp = 20; this._tp = 60; this._states = []; this._result = { success: false }; },
    mcr: 1,
    setHp(n) { this._hp = n; }, maxTp() { return 100; }, states() { return this._states.map(id => $dataStates[id]); }, result() { return this._result; },
    skillMpCost(skill) { return Math.floor(skill.mpCost * this.mcr); }, skillTpCost(skill) { return skill.tpCost; },
    canPaySkillCost(skill) { return this._tp >= this.skillTpCost(skill) && this._mp >= this.skillMpCost(skill); },
    paySkillCost(skill) { this._mp -= this.skillMpCost(skill); this._tp -= this.skillTpCost(skill); },
    meetsSkillConditions(skill) { return this.canPaySkillCost(skill); }, canUse(skill) { return this.meetsSkillConditions(skill); },
    attackSkillId() { return 1; }
});
Object.defineProperties(Game_BattlerBase.prototype, { hp: { get() { return this._hp; } }, mp: { get() { return this._mp; } }, mhp: { get() { return 200; } }, mmp: { get() { return 50; } } });
Object.assign(Game_Battler.prototype, { onBattleStart() {}, onBattleEnd() {} });
Object.assign(Game_Actor.prototype, {
    initialize(weapons = []) { Game_BattlerBase.prototype.initialize.call(this); this._weapons = weapons; this._skills = []; },
    isActor() { return true; }, isEnemy() { return false; }, actor() { return $dataActors[1]; }, currentClass() { return $dataClasses[1]; },
    equips() { return this._weapons.map(id => $dataWeapons[id]); }, weapons() { return this.equips().filter(Boolean); }, skills() { return this._skills.map(id => $dataSkills[id]); }
});
Object.assign(Game_Enemy.prototype, { isActor() { return false; }, isEnemy() { return true; }, enemy() { return $dataEnemies[1]; } });
Object.assign(Game_Unit.prototype, { initialize(m) { this._m = m || []; }, members() { return this._m; } });
var Game_Action = cls();
Object.assign(Game_Action.prototype, { initialize(s, i) { this._s = s; this._i = i; }, subject() { return this._s; }, item() { return this._i; }, apply(target) { this.applyItemUserEffect(target); }, applyItemUserEffect() {} });
var BattleManager = { startTurn() { $gameTroop._turnCount++; } };
var Window_Base = cls(), Window_Selectable = cls(Window_Base), Window_SkillList = cls(Window_Selectable), Window_Command = cls(Window_Selectable), Window_ActorCommand = cls(Window_Command);
Object.assign(Window_Base.prototype, {
    initialize(rect) { this.calls = []; this.contents = { fontSize: 24, clear: () => this.calls.push(['clear']) }; this.rect = rect; },
    lineHeight() { return 24; }, contentsWidth() { return 616; }, textWidth(t) { return String(t).length * 10; }, update() {},
    changeTextColor(c) { this.calls.push(['color', c]); }, resetTextColor() {}, changePaintOpacity(o) { this.calls.push(['opacity', !!o]); }, resetFontSettings() { this.contents.fontSize = 24; },
    drawIcon(i, x, y) { this.calls.push(['icon', i, x, y]); }, drawText(t, x, y, w, a) { this.calls.push(['text', String(t), x, y, w, a || 'left', this.contents.fontSize]); },
    rrAceDrawItemName(item, x, y, enabled, width) { this.calls.push(['name', item.name, width]); }, rrAceGroup(n) { return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','); }
});
Object.assign(Window_SkillList.prototype, { itemAt(i) { return this._data[i]; }, itemRect() { return new Rectangle(0, 0, 292, 24); }, isEnabled(s) { return this._actor.canUse(s); }, drawItem() {} });
Object.assign(Window_Command.prototype, { itemLineRect() { return new Rectangle(4, 0, 112, 24); }, commandSymbol(i) { return this._list[i].symbol; }, commandName(i) { return this._list[i].name; },
    isCommandEnabled(i) { return this._list[i].enabled; }, itemTextAlign() { return 'center'; }, drawItem(i) { this.calls.push(['base', i]); } });
var Scene_Battle = cls();
Object.assign(Scene_Battle.prototype, { createAllWindows() { this._windowLayer = { children: ['log', 'msg'], addChildAt(w, i) { this.children.splice(i, 0, w); } }; this._messageWindow = 'msg'; }, calcWindowHeight(n) { return n * 24 + 24; } });
`;

function engine(extra = {}) {
    const skill = (id, note, more = {}) => Object.assign({ id, name: 'S' + id, note, mpCost: 0, tpCost: 0, stypeId: 1 }, more);
    const ctx = {
        $dataSkills: [null, skill(1, ''), skill(15, SHOT), skill(59, MORTAR), skill(158, ODDS), skill(60, '<gold cost: 1000>', { tpCost: 50 }), skill(122, '<mp cost: 20%>'),
            skill(168, '<cooldown: 5>'), skill(8, '<limited uses: 2>\r\n<warmup: 3>'), skill(9, '<restrict any switch: 4, 5>'), skill(10, '<restrict all switch: 4, 5>'), skill(11, '<hp cost: 30>\r\n<hp cost max: 20>'),
            skill(12, '<stype cooldown 1: -2>\r\n<skill cooldown 168: +1>'), skill(13, '<reload skill: 8>')],
        $dataItems: [], $dataWeapons: [null, { id: 1, name: 'Pistol', wtypeId: 2, iconIndex: 300, note: '<attack skill: 15>' }, { id: 2, name: 'Stick', wtypeId: 1, iconIndex: 301, note: '' }, { id: 3, name: 'Gloves', wtypeId: 1, iconIndex: 0, note: '<cooldown rate: 50%>\r\n<mag size: +1>' }],
        $dataActors: [null, { id: 1, note: '' }], $dataClasses: [null, { id: 1, note: '' }], $dataEnemies: [null, { id: 1, note: '<cooldown lock>', actions: [{ skillId: 168 }, { skillId: 168 }, { skillId: 1 }] }],
        $dataStates: [null, { id: 1, note: '<tp cost rate: 50%>' }],
        $gameSwitches: { _v: {}, value(id) { return !!this._v[id]; } }, $gameVariables: { _data: [] }, $gameSystem: { mainFontSize: () => 26 },
        $gameTroop: { _turnCount: 0, turnCount() { return this._turnCount; } }, Graphics: { boxWidth: 640 }, console: { warn() {} }
    };
    ctx.$dataSkills.forEach((s, i) => { if (s) ctx.$dataSkills[s.id] = s; if (s && s.id !== i) ctx.$dataSkills[i] = s; });
    vm.createContext(ctx);
    ctx.window = ctx;
    vm.runInContext(ENGINE, ctx);
    const bag = { 13: 3, 14: 0, 17: 1, 178: 0 };
    for (const id of Object.keys(bag)) ctx.$dataItems[id] = { id: Number(id), itypeId: 1, note: '' };
    ctx.$gameParty = Object.assign(new ctx.Game_Unit(), { _gold: 500, _battle: false, gold() { return this._gold; }, loseGold(n) { this._gold -= n; }, inBattle() { return this._battle; },
        numItems(item) { return bag[item.id] || 0; }, loseItem(item, n) { bag[item.id] = (bag[item.id] || 0) - n; }, gainItem(item, n) { bag[item.id] = (bag[item.id] || 0) + n; } });
    const constants = C.scriptConstants(SCRIPTS);
    const cost = params('RR_YanflySkillCost').extract({ scripts: SCRIPTS, constants });
    cost.customCosts = JSON.stringify(params('RR_YanflySkillCost').customCosts(ctx.$dataSkills.filter(Boolean)));
    const all = {
        RR_MeowAmmo: params('RR_MeowAmmo').extract({ scripts: SCRIPTS, constants }), RR_YanflyWeaponAttack: params('RR_YanflyWeaponAttack').extract({ scripts: SCRIPTS, constants }), RR_YanflySkillCost: cost,
        RR_AttackIcon: {}, RR_YanflySkillRestrictions: Object.assign(params('RR_YanflySkillRestrictions').extract({ scripts: SCRIPTS, constants }), extra)
    };
    ctx.PluginManager = { parameters: (name) => all[name] || {} };
    // Window_RRMeowAmmo is a class extending Window_Base; the context needs Window_Base as a binding.
    for (const name of Object.keys(all)) vm.runInContext(plugin(name), ctx);
    return { ctx, bag };
}

test('custom costs gate and pay; HP, gold and percentage costs as the script computes them', () => {
    const { ctx, bag } = engine();
    const S = (id) => ctx.$dataSkills.find(s => s && s.id === id);
    const jay = new ctx.Game_Actor([1]);
    // Handgun ammo: one per weapon held.
    assert.ok(jay.canUse(S(15)));
    jay.paySkillCost(S(15));
    assert.deepEqual([bag[13], bag[178]], [2, 1]);
    bag[13] = 0;
    assert.ok(!jay.canUse(S(15)));
    // An enemy pays nothing and needs nothing.
    const enemy = new ctx.Game_Enemy();
    assert.ok(enemy.canUse(S(15)));
    // Mortar's requirement reads the two lines as one.
    assert.ok(jay.canUse(S(59)));
    jay.paySkillCost(S(59));
    assert.equal(bag[17], 0);
    assert.ok(!jay.canUse(S(59)));
    // self.hp.odd?
    jay._hp = 101;
    assert.ok(jay.canUse(S(158)));
    jay._hp = 100;
    assert.ok(!jay.canUse(S(158)));
    // Gold: 1000 against the party's 500.
    assert.ok(!jay.canUse(S(60)));
    ctx.$gameParty._gold = 1200;
    jay.paySkillCost(S(60));
    assert.deepEqual([ctx.$gameParty._gold, jay._tp], [200, 10]);
    // 20% of max MP; a state halving TP costs; HP cost capped by <hp cost max>.
    assert.equal(jay.skillMpCost(S(122)), 10);
    jay._states = [1];
    assert.equal(jay.skillTpCost(S(60)), 25);
    assert.equal(jay.rrSkillHpCost(S(11)), 20);
    jay._hp = 20;
    assert.ok(!jay.canUse(S(11)));
    jay._hp = 21;
    jay.paySkillCost(S(11));
    assert.equal(jay._hp, 1);
});

test('skill lists draw MP, TP, HP, gold and the custom cost right to left', () => {
    const { ctx } = engine();
    const S = (id) => ctx.$dataSkills.find(s => s && s.id === id);
    const jay = new ctx.Game_Actor([1]);
    const w = new ctx.Window_SkillList();
    w._actor = jay;
    w._data = [S(60)];
    S(60).mpCost = 5;
    ctx.$gameParty._gold = 5000;
    w.drawItem(0);
    const texts = plain(w.calls.filter(c => c[0] === 'text'));
    // rect.width 292 - 4: " 5EN" first at the right, then " 50TP" left of it, then " 1,000Ƶ".
    assert.deepEqual(texts.map(t => [t[1], t[4], t[5]]), [[' 5EN', 288, 'right'], [' 50TP', 244, 'right'], [' 1,000Ƶ', 190, 'right']]);
    assert.equal(texts[0][6], 26);    // size 18 of the game's 18
    assert.deepEqual(plain(w.calls.find(c => c[0] === 'name')), ['name', 'S60', 264]);
    // The custom cost: its icon at the right, its text left of the icon, in its own size and colour.
    w.calls = [];
    w._data = [S(15)];
    w.drawItem(0);
    assert.deepEqual(plain(w.calls.filter(c => c[0] === 'icon' || c[0] === 'text' || c[0] === 'color')), [['color', 'c17'], ['icon', 5091, 264, 0], ['text', '1x ', 0, 0, 264, 'right', 26 * 16 / 18]]);
});

test('cooldowns, warmups, limited uses and switches hold skills back in battle', () => {
    const { ctx } = engine({ reloadAddon: 'true', magSizeAddon: 'true' });
    const S = (id) => ctx.$dataSkills.find(s => s && s.id === id);
    const jay = new ctx.Game_Actor([1, 3]);
    jay._skills = [168, 8, 1];
    const enemy = new ctx.Game_Enemy();
    ctx.$gameParty._m = [jay];
    ctx.$gameTroop.members = () => [enemy];
    ctx.$gameTroop.rrUpdateRestrictions = ctx.Game_Unit.prototype.rrUpdateRestrictions;
    // Out of battle nothing counts.
    jay.paySkillCost(S(168));
    assert.equal(jay.rrCooldown(168), 0);
    ctx.$gameParty._battle = true;
    jay.onBattleStart();
    // Cooldown 5 at the Gloves' 50%: 2 (dropping the half).
    jay.paySkillCost(S(168));
    assert.equal(jay.rrCooldown(168), 2);
    assert.ok(!jay.canUse(S(168)));
    ctx.BattleManager.startTurn();
    assert.deepEqual([jay.rrCooldown(168), ctx.$gameTroop.turnCount()], [1, 1]);
    ctx.BattleManager.startTurn();
    assert.ok(jay.canUse(S(168)));
    // An enemy with <cooldown lock> keeps its cooldowns.
    enemy.paySkillCost(S(168));
    ctx.BattleManager.startTurn();
    assert.equal(enemy.rrCooldown(168), 5);
    // Warmup 3: usable once the troop's turn count passes 3.
    ctx.$gameTroop._turnCount = 2;
    assert.ok(!jay.canUse(S(8)));
    ctx.$gameTroop._turnCount = 3;
    assert.ok(jay.canUse(S(8)));
    // Limited uses 2, plus one from the Gloves' mag size: counted per target.
    const act = new ctx.Game_Action(jay, S(8));
    act.apply(enemy); act.apply(enemy);
    assert.ok(jay.canUse(S(8)));
    act.apply(enemy);
    assert.ok(!jay.canUse(S(8)));
    // Reload refills it on a hit.
    new ctx.Game_Action(jay, S(13)).apply(jay);
    assert.equal(jay.rrTimesUsed(8), 0);
    // Cooldown changes land on the target.
    jay.rrSetCooldown(168, 4);
    new ctx.Game_Action(enemy, S(12)).apply(jay);
    assert.equal(jay.rrCooldown(168), 3);
    assert.equal(jay.result().success, true);
    // Everything starts over when the battle ends.
    jay.onBattleEnd();
    assert.deepEqual([jay.rrCooldown(168), jay.rrTimesUsed(8)], [0, 0]);
    // Switches hold back in and out of battle.
    ctx.$gameParty._battle = false;
    ctx.$gameSwitches._v[5] = true;
    assert.ok(!jay.canUse(S(9)));
    assert.ok(jay.canUse(S(10)));
    ctx.$gameSwitches._v[4] = true;
    assert.ok(!jay.canUse(S(10)));
});

test('a held-back skill shows why in place of its cost', () => {
    const { ctx } = engine();
    const S = (id) => ctx.$dataSkills.find(s => s && s.id === id);
    const jay = new ctx.Game_Actor([2]);
    jay._skills = [168];
    ctx.$gameParty._battle = true;
    jay.paySkillCost(S(168));
    const w = new ctx.Window_SkillList();
    w._actor = jay;
    w._data = [S(168)];
    w.drawItem(0);
    // The name at Ace's default width, the cooldown icon at the right and the turns left of it.
    assert.deepEqual(plain(w.calls.filter(c => ['name', 'icon', 'text'].includes(c[0]))), [['name', 'S168', null], ['icon', 3036, 264, 0], ['text', '5', 0, 0, 264, 'right', 26 * 20 / 18]]);
});

test('attack skill by weapon, the Attack icon and the ammo counters', () => {
    const { ctx, bag } = engine();
    assert.equal(new ctx.Game_Actor([1]).attackSkillId(), 15);
    assert.equal(new ctx.Game_Actor([2]).attackSkillId(), 1);   // a weapon without the tag: the default
    assert.equal(new ctx.Game_Actor([]).attackSkillId(), 1);
    ctx.$dataActors[1] = { id: 1, note: '<attack skill: 59>' };   // (notes are read once per record)
    assert.equal(new ctx.Game_Actor([]).attackSkillId(), 59);
    assert.equal(new ctx.Game_Enemy().attackSkillId(), 1);
    // Attack: the weapon's icon at full strength, the name moved past it and faint when disabled.
    const cmd = new ctx.Window_ActorCommand();
    cmd._actor = new ctx.Game_Actor([1]);
    cmd._list = [{ symbol: 'attack', name: 'Attack', enabled: false }, { symbol: 'skill', name: 'Tactic', enabled: true }];
    cmd.drawItem(0);
    cmd.drawItem(1);
    assert.deepEqual(plain(cmd.calls.filter(c => c[0] !== 'color')), [['opacity', true], ['icon', 300, 4, 0], ['opacity', false], ['text', 'Attack', 28, 0, 88, 'center', 24], ['opacity', true], ['base', 1]]);
    // Ammo: five rows at the right from y 100, under the message window, redrawn when a count changes.
    const scene = new ctx.Scene_Battle();
    scene.createAllWindows();
    const ammo = scene._rrAmmoWindow;
    assert.deepEqual(plain(scene._windowLayer.children.map(c => (typeof c === 'string' ? c : 'ammo'))), ['log', 'ammo', 'msg']);
    assert.deepEqual(plain([ammo.rect.x, ammo.rect.y, ammo.rect.width, ammo.rect.height, ammo.opacity]), [0, 100, 640, 168, 0]);
    assert.deepEqual(plain(ammo.calls.filter(c => c[0] === 'text').map(c => [c[1], c[3], c[4], c[5]])), [['3', 0, 592, 'right'], ['0', 24, 592, 'right'], ['0', 48, 592, 'right'], ['0', 72, 592, 'right'], ['1', 96, 592, 'right']]);
    ammo.calls = [];
    ammo.update();
    assert.equal(ammo.calls.length, 0);
    bag[14] = 7;
    ammo.update();
    assert.ok(ammo.calls.some(c => c[0] === 'text' && c[1] === '7' && c[3] === 24));
});
