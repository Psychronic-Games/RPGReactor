// Pinnacle - The Five Kingdoms (VX Ace), its battles: GubiD's Tactical Battle System as the game set it up and edited
// it (RR_PinnacleGtbs, …Battlers, …Windows, …Sprites, …Scene), Victor's Damage Popup (RR_VictorDamagePopup) and the
// game's battle-side edits of the stock scripts. The families find the game's scripts, the events' calls translate,
// the settings come from the scripts, and the battle rules run on a small stand-in of MZ.
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
const sorted = (list) => plain(list).map(String).sort();

// ---- snippets of the game's own sections (CRLF, as the game's are) ----------------------------------------------
const SCENE = crlf(`class Scene_Battle_TBS < Scene_Base
  def prepare_GTBS
    @phase = 0
  end
  def cursor_move(x, y)
  end
end`);
const GENERAL = crlf(`module GTBS
  def self.font
    return Font.default_name
  end
  VIC_COM = 2
  FAIL_COM = 1
  TEAM_THROUGH = true
  REMOVE_DEAD = 2
end`);
const INTERFACE = crlf(`module GTBS
  WAIT_CONFIRM = true
  Force_Wait = true
  PREVIEW_DAMAGE = true
  RED = Color.new(255,0,0,255)
  BLUE = Color.new(0,0,255,255)
  class Gtbs_Color
    attr_reader :name, :color
    def initialize(name, color)
      @name = name
      @color = color
    end
  end
  #Now Reassign colors and add to Colors array
  Colors = [
    RED = Gtbs_Color.new('RED', RED ),
    BLUE = Gtbs_Color.new('BLUE' , BLUE),
  ]
  ANIM_TILES = false
end`);
const MUSIC = crlf(`module GTBS
  def self.placing_music
    "Battle-placing"
  end
end`);
const VOCAB = crlf(`module Vocab_GTBS
    Place_Message = "[203"
    Reach_Condition = "Raggiungi la meta %d, %d"
    Defeat_All =  'Sconfiggi tutti i nemici'
    Level_Up = "Lvl %1$s"
    Yes, No = "[217", "[26"
end`);
const TERRAIN = crlf(`module Terrain_Effects

  def self.terrain_name
   {0 => "[83", 1=> "[84", 2=>"[85", 3 => "[86", 4 => "[87",
    5 => "[88", 6=> "[89",
    7 => "[90", 8=>"[91", 9=>"[92", 10 =>"[93", 11=>"[94", 12=>"[95", 13=>"[85", 17 => "[96", 63 => "[83"}
  end

  def self.terrain_effects_def
   {0 => 0, 1 =>0, 2=>0,3=>0, 4 => 0,5 => 2, 6 => 0, 7=>0,8=>0,
   9=> 0, 10=> 1, 11=>0, 12=>0, 13=>0,17 => 0, 63 => 0}
  end

 def self.terrain_effects_eva
   {0 => 0, 1=>0, 2=>0,3=>0, 4 => 0, 5 => 0.2, 6 => 0, 7=>0.10,8=>0}
  end
end`);
const FONT = 'Font.default_name = ["Typori", "Font2", "Font3", "Font4"] \r\nFont.default_size = 22';
const VE_POPUP = crlf(`module Victor_Engine
  VE_DAMAGE_DISPLAY = :text
  VE_MISS_TEXT    = "[197"     # Miss text
  VE_CRT_TEXT     = "[36" # Critical text   (only if CTR_POP = true)
  VE_STATE_REMOVE = "-%s"      # Remove state text (use %s to show state name)
  VE_DAMAGE_TEXTS = {
    # Type      [ Red, Green, Blue, Size, Wait, Bold, Italic, Font],
    default:    [ 0,   0,  0,   8,   50, true,  false, Font.default_name],
    hp_damage:  [ 255,   255,  255,   32,   50, true,  false, Font.default_name],
    crt_damage: [ 255,    96,    0,   36,   50, true,  false, Font.default_name],
  } # Don't remove
end
$imported ||= {}
$imported[:ve_damage_pop] = 1.09`);
const SCRIPTS = [FONT, VE_POPUP, GENERAL, INTERFACE, MUSIC, VOCAB, TERRAIN, SCENE];
const families = C.scriptFamilies(SCRIPTS);
const ctx = { constants: C.scriptConstants(SCRIPTS), families };
const rb = (src) => C.ruby(src, 'statement', ctx);
const ex = (src) => C.ruby(src, 'expression', ctx);

test('the families find the game\'s battle system and damage popups, and no other game\'s', () => {
    assert.ok(families.has('pinnacleGtbs'));
    assert.ok(families.has('veDamagePopup'));
    // A GTBS without the game's Scene_Battle_TBS#prepare_GTBS is another game's.
    const other = C.scriptFamilies(['class Scene_Battle_TBS < Scene_Base\n  def start\n  end\nend', 'module Victor_Engine\nend']);
    assert.ok(!other.has('pinnacleGtbs'));
    assert.ok(!other.has('veDamagePopup'));
});

test('the events\' calls into the battle translate', () => {
    assert.equal(rb('SceneManager.scene.cursor_move(17, 11)\nSceneManager.scene.update_screen'),
        '(SceneManager._nextScene || SceneManager._scene)?.cursorMove?.(17, 11);\n(SceneManager._nextScene || SceneManager._scene)?.updateScreen?.();');
    assert.equal(rb('scene = SceneManager.scene\nscene.set_character("actor", 5, 18, 17)'),
        'var scene = (SceneManager._nextScene || SceneManager._scene);\nscene?.setCharacter?.("actor", 5, 18, 17);');
    assert.equal(rb('scene = SceneManager.scene\nscene.end_battle(0)'), 'var scene = (SceneManager._nextScene || SceneManager._scene);\nscene?.endBattle?.(0);');
    assert.equal(rb("tbs_victory('reach', [0,0])"), 'this.rrTbsVictory?.("reach", [0, 0]);');
    assert.equal(rb('tbs_failure("death", 51)'), 'this.rrTbsFailure?.("death", 51);');
    assert.equal(rb('force_player_turn'), 'this.rrForcePlayerTurn?.();');
    assert.equal(rb('switch_to_troops_party'), 'this.rrSwitchToTroopsParty?.();');
    assert.equal(rb('SceneManager.scene.dispose_character($game_troop.members[2])'),
        '(SceneManager._nextScene || SceneManager._scene)?.disposeCharacter?.($gameTroop.members()[2]);');
    assert.equal(rb('SceneManager.scene.cursor_moveto($game_actors[10])'), '(SceneManager._nextScene || SceneManager._scene)?.cursorMoveto?.($gameActors.actor(10));');
    assert.equal(ex('SceneManager.scene.active_battler == $game_actors[2]'), '(((SceneManager._nextScene || SceneManager._scene)?.activeBattler?.() ?? null) === $gameActors.actor(2))');
    assert.equal(ex('$game_actors[$game_variables[1]].is_army?'), '($gameActors.actor($gameVariables.value(1)).isArmy?.() ?? false)');
    // A troop page pushes units back while the tile behind is free.
    assert.equal(rb('actor = $game_troop.members[4]\n3.times do\nactor.knock_back(2) if actor.can_occupy?([actor.x,actor.y+1])\nend'),
        'var actor = $gameTroop.members()[4];\nfor (let _i = 0; _i < 3; _i++) { if ((actor.tbsCanOccupy?.([actor.x, (actor.y + 1)]) ?? false)) { actor.tbsKnockBack?.(2); } };');
});

test('the skills\' damage formulas reach the unit rules', () => {
    const f = (src) => C.ruby(src, 'formula', ctx);
    assert.equal(f('b.tele_to_closest_loc(a.x,a.y);0'), 'b.tbsTeleToClosestLoc?.(a.x, a.y);\n0');
    assert.equal(f('(a.atk - b.def) * b.flying_unit_effectiveness'), '((a.atk - b.def) * b.tbsFlyingUnitEffectiveness())');
    assert.equal(f('(a.atk - b.def) + a.terrain_def + a.terrain_eva/10'), '(((a.atk - b.def) + a.tbsTerrainDef()) + Math.floor(a.tbsTerrainEva() / 10))');
    assert.equal(f('a.perf_action = false'), 'a.perfAction = false');
    assert.equal(f('[a.atk - b.def, 1].max + (b.infantry_effectiveness - 1) * 2'), '(Math.max(...[(a.atk - b.def), 1]) + ((b.tbsInfantryEffectiveness() - 1) * 2))');
});

test('settings come from the game\'s scripts', () => {
    const config = JSON.parse(params('RR_PinnacleGtbs').extract({ scripts: SCRIPTS }).config);
    assert.equal(config.gtbs.VIC_COM, 2);
    assert.equal(config.gtbs.FAIL_COM, 1);
    assert.equal(config.gtbs.TEAM_THROUGH, true);
    assert.equal(config.gtbs.REMOVE_DEAD, 2);
    assert.equal(config.gtbs.Force_Wait, true);
    assert.equal(config.gtbs.ANIM_TILES, false);
    // RED is reassigned to a Gtbs_Color that keeps the colour it was.
    assert.deepEqual(config.colors, { RED: [255, 0, 0, 255], BLUE: [0, 0, 255, 255] });
    assert.equal(config.placingMusic, 'Battle-placing');
    assert.deepEqual([config.vocab.Place_Message, config.vocab.Level_Up, config.vocab.Yes, config.vocab.No], ['[203', 'Lvl %1$s', '[217', '[26']);
    assert.equal(config.terrain.names[17], '[96');
    assert.equal(config.terrain.def[5], 2);
    assert.equal(config.terrain.eva[7], 0.1);
    assert.equal(config.fontDefaultSize, 22);

    const ve = params('RR_VictorDamagePopup').extract({ scripts: SCRIPTS });
    const settings = JSON.parse(ve.settings);
    assert.equal(settings.VE_DAMAGE_DISPLAY, 'text');
    assert.equal(settings.VE_MISS_TEXT, '[197');
    assert.equal(settings.VE_STATE_REMOVE, '-%s');
    // Font.default_name in a row means the window's font.
    assert.deepEqual(settings.VE_DAMAGE_TEXTS.crt_damage, [255, 96, 0, 36, 50, true, false, null]);
    assert.equal(ve.defaultFontSize, '22');
});

// ---- a small stand-in of MZ ----------------------------------------------------------------------------------
const CLASSES = ['Game_Temp', 'Game_System', 'Game_Unit', 'Game_Troop', 'Game_Party', 'Game_ActionResult', 'Game_BattlerBase',
    'Game_Battler', 'Game_Actor', 'Game_Enemy', 'Game_Action', 'Game_Interpreter', 'Game_Item', 'Sprite', 'Sprite_Battler',
    'Window_Help', 'Window_ActorCommand', 'Window_Base', 'Window_Selectable', 'Window_ItemList', 'Window_SkillList', 'Window_Status',
    'Spriteset_Map', 'Scene_Message', 'Scene_Map', 'Scene_Battle'];
const PARENTS = { Game_Troop: 'Game_Unit', Game_Party: 'Game_Unit', Game_Battler: 'Game_BattlerBase', Game_Actor: 'Game_Battler', Game_Enemy: 'Game_Battler',
    Sprite_Battler: 'Sprite', Window_Selectable: 'Window_Base', Window_Help: 'Window_Base', Window_ActorCommand: 'Window_Selectable',
    Window_ItemList: 'Window_Selectable', Window_SkillList: 'Window_Selectable', Window_Status: 'Window_Selectable', Scene_Map: 'Scene_Message', Scene_Battle: 'Scene_Message' };
function mz(config = {}) {
    const g = {};
    g.window = g;
    g.PluginManager = { parameters: (name) => (name === 'RR_PinnacleGtbs' ? { config: JSON.stringify(config) } : {}) };
    for (const name of CLASSES) {
        const f = { [name]: function(...args) { if (this.initialize) this.initialize(...args); } }[name];
        const parent = PARENTS[name] && g[PARENTS[name]];
        if (parent) { f.prototype = Object.create(parent.prototype); f.prototype.constructor = f; } else f.prototype.initialize = function() {};
        g[name] = f;
    }
    g.Game_BattlerBase.TRAIT_ELEMENT_RATE = 11;
    g.Game_BattlerBase.FLAG_ID_PRESERVE_TP = 3;
    g.Game_ActionResult.prototype.clear = function() { this.critical = false; this.success = false; this.hpDamage = 0; this.mpDamage = 0; };
    g.Game_Item.prototype.initialize = function() { this._itemId = 0; this._isWeapon = false; };
    g.Game_Item.prototype.isNull = function() { return this._itemId === 0; };
    g.Game_Item.prototype.setEquip = function(isWeapon, itemId) { this._isWeapon = isWeapon; this._itemId = itemId; };
    g.ConfigManager = {};
    g.DataManager = { loadMapData() {}, onLoad() {} };
    g.SceneManager = { pushed: [], push(c) { this.pushed.push(c); }, goto(c) { this.pushed.push(c); } };
    g.BattleManager = { isBattleTest: () => false };
    g.$gameMap = { width: () => 20, height: () => 20, isValid: (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 };
    g.Math = Math;
    vm.createContext(g);
    for (const name of ['RR_PinnacleGtbs', 'RR_PinnacleGtbsBattlers', 'RR_VictorDamagePopup', 'RR_PinnacleGtbsWindows', 'RR_PinnacleGtbsSprites', 'RR_PinnacleGtbsScene']) {
        vm.runInContext(plugin(name), g, { filename: name + '.js' });
    }
    return g;
}

test('every plugin of the battle loads on top of the stock classes', () => {
    const g = mz();
    assert.equal(typeof g.RRGtbs, 'object');
    assert.equal(typeof g.Scene_Battle_TBS, 'function');
    assert.equal(typeof g.RRVictorDamage.Game_Damage, 'function');
    assert.equal(g.RRGtbs.inBattle(), false, 'no battle runs on the map');
});

test('parameters add their buffs and a tenth of their rate; element rates add up instead of multiplying', () => {
    const g = mz();
    const b = Object.create(g.Game_BattlerBase.prototype);
    Object.assign(b, { _buffs: [0, 0, 2, 0, 0, 0, 0, 0], paramBase: () => 10, paramPlus: () => 3, paramRate: () => 1.2 });
    assert.equal(b.param(2), 17, '10 + 3 + 2 buff points + (1.2 × 10 − 10)');
    b.paramRate = () => 0;
    b.paramBase = () => 2;
    assert.equal(b.param(1), 0, 'MMP stops at 0: 2 + 3 − 10');
    assert.equal(b.param(3), 1, 'every other parameter stops at 1');
    b.traitsWithId = () => [{ value: 1.5 }, { value: 1.5 }];
    assert.equal(b.elementRate(3), 2, 'two ×1.5 weaknesses: 1 + 0.5 + 0.5');
    b.traitsWithId = () => [];
    assert.equal(b.elementRate(3), 1);
});

test('a drain takes no more than the target has; a hit for 0 is not a critical', () => {
    const g = mz();
    const result = new g.Game_ActionResult();
    result.clear();
    assert.deepEqual([result.rrHpDrain, result.rrMpDrain, result.expGainAmt], [0, 0, '']);
    result.critical = true;
    g.RRGtbs.makeDamage(result, { hp: 5, mp: 3 }, 8, { damage: { type: 5 } });
    assert.deepEqual([result.hpDamage, result.rrHpDrain, result.success, result.critical], [8, 5, true, true]);
    const zero = new g.Game_ActionResult();
    zero.clear();
    zero.critical = true;
    g.RRGtbs.makeDamage(zero, { hp: 5, mp: 3 }, 0, { damage: { type: 1 } });
    assert.equal(zero.critical, false);
    const mp = new g.Game_ActionResult();
    mp.clear();
    g.RRGtbs.makeDamage(mp, { hp: 5, mp: 3 }, 9, { damage: { type: 2 } });
    assert.deepEqual([mp.mpDamage, mp.success], [3, true], 'MP damage stops at the MP there is');
});

test('weapon ranges reach the four sides of every tile a unit stands on, never the unit itself', () => {
    const g = mz();
    const unit = Object.create(g.Game_Battler.prototype);
    unit._tbsX = 5; unit._tbsY = 5;
    assert.deepEqual(sorted(unit.tbsCalcPosAttack(1, 0)), sorted([[5, 6], [5, 4], [4, 5], [6, 5]]));
    assert.deepEqual(sorted(unit.tbsCalcPosAttack(2, 1)), sorted([[5, 7], [5, 3], [3, 5], [7, 5]]), 'a bow with a minimum skips the adjacent tiles');
    unit.tbsUnitSize = () => 2;
    assert.deepEqual(sorted(unit.tbsCalcPosAttack(1, 0)), sorted([[5, 4], [4, 5], [4, 6], [5, 7], [6, 4], [7, 5], [6, 7], [7, 6]]));
    // Map edges cut the range.
    const corner = Object.create(g.Game_Battler.prototype);
    corner._tbsX = 0; corner._tbsY = 0;
    assert.deepEqual(sorted(corner.tbsCalcPosAttack(1, 0)), sorted([[0, 1], [1, 0]]));
});

test('spell ranges are a diamond less the diamond inside their minimum', () => {
    const g = mz();
    const unit = Object.create(g.Game_Battler.prototype);
    unit._tbsX = 5; unit._tbsY = 5;
    const ring = unit.tbsCalcPosSpell(2, 1);
    assert.equal(ring.length, 12);
    assert.ok(!ring.some(([x, y]) => x === 5 && y === 5), 'the caster\'s tile is left out by a minimum of 1');
    assert.ok(ring.every(([x, y]) => Math.abs(x - 5) + Math.abs(y - 5) <= 2));
    assert.equal(unit.tbsCalcPosSpell(2, 0).length, 13);
    assert.deepEqual(plain(unit.tbsCalcPosSpell(0, 0)), [[5, 5]]);
});

test('hits from behind count half again, from the side a fifth more, from the front by the target\'s guard', () => {
    const g = mz();
    const unit = (x, y, dir) => {
        const b = Object.create(g.Game_Battler.prototype);
        Object.assign(b, { _tbsX: x, _tbsY: y, _tbsDirection: dir, grd: 0.5, isStateAffected: () => false, hasSkill: () => false });
        return b;
    };
    const target = unit(5, 5, 2); // facing down
    assert.equal(target.tbsApplyDirection(100, unit(5, 6, 8)), 50, 'the attacker stands where the target looks');
    assert.equal(target.tbsApplyDirection(100, unit(5, 4, 2)), 150, 'the attacker stands behind it');
    assert.equal(target.tbsApplyDirection(100, unit(6, 5, 4)), 120);
    const backstabber = unit(5, 4, 2);
    backstabber.hasSkill = (id) => id === 144;
    assert.equal(target.tbsApplyDirection(100, backstabber), 200, 'skill 144 doubles a hit from behind');
});

test('starting equipment goes into the slot of its kind', () => {
    const g = mz();
    const actor = Object.create(g.Game_Actor.prototype);
    Object.assign(actor, { equipSlots: () => [1, 2, 4, 5, 5], isDualWield: () => false, releaseUnequippableItems() {}, refresh() {} });
    actor.initEquips([3, 0, 7, 8, 9]);
    // The list is read by kind: weapon, shield, head, body, accessory. These slots have no head; the body armour and
    // the accessory go to the slots of their kinds.
    assert.deepEqual(actor._equips.map(e => e._itemId), [3, 0, 8, 9, 0]);
});

test('formulas made of names and arithmetic keep their Ruby spelling and still reach the unit rules', () => {
    const g = mz();
    const b = Object.create(g.Game_Battler.prototype);
    b.tbsFlyingUnit = () => true;
    b.tbsTerrainDef = () => 2;
    b._tbsTilesMoved = 4;
    assert.equal(b.flying_unit_effectiveness, 2);
    assert.equal(b.terrain_def, 2);
    assert.equal(b.tiles_moved, 4);
    b.perfAction = false;
    assert.equal(b._tbsPerfAction, false);
    const a = { atk: 9 };
    const target = Object.assign(b, { def: 4 });
    assert.equal(vm.runInContext('(function(a, b) { return (a.atk - b.def) * b.flying_unit_effectiveness; })', g)(a, target), 10);
});

test('events set the battle\'s goal, its first turn and the enemies\' alliances; battles go to the grid while GTBS is on', () => {
    const g = mz();
    g.$gameTemp = {};
    g.$gameParty = null;
    g.$gameSystem = new g.Game_System();
    const interpreter = new g.Game_Interpreter();
    interpreter.rrTbsVictory('reach', [0, 0]);
    assert.deepEqual(plain(g.$gameTemp._tbsVictory), { condition: 'reach', val: [0, 0], common: null });
    interpreter.rrTbsFailure('death', 51);
    assert.deepEqual(plain(g.$gameTemp._tbsFailure), { condition: 'death', val: 51, common: null });
    interpreter.rrForceEnemyTurn();
    assert.equal(g.$gameTemp._tbsTurnStart, 'enemy');
    interpreter.rrFoeTeam('Bandits', 'beasts');
    interpreter.rrFoeTeam('bandits', 'beasts');
    assert.deepEqual(plain(g.$gameTemp._tbsFoeData), { bandits: ['beasts'] });
    g.SceneManager.push(g.Scene_Battle);
    assert.equal(g.SceneManager.pushed.pop(), g.Scene_Battle_TBS);
    interpreter.rrDisableTbs();
    g.SceneManager.push(g.Scene_Battle);
    assert.equal(g.SceneManager.pushed.pop(), g.Scene_Battle);
    interpreter.rrEnableTbs();
    assert.equal(g.$gameSystem.tbsEnabled(), true);
});

test('the army switcher trades the party for the saved army and back', () => {
    const g = mz();
    const party = { ids: [1, 5], members() { return this.ids.map(id => ({ actorId: () => id })); }, removeActor(id) { this.ids = this.ids.filter(i => i !== id); }, addActor(id) { this.ids.push(id); } };
    g.$gameParty = party;
    const store = { mode: null, saved: [], troops: [69, 70] };
    g.RRGtbs.party = Object.assign(g.RRGtbs.party || {}, {
        mode: () => store.mode, setMode: (m) => { store.mode = m; },
        saved: () => store.saved, setSaved: (v) => { store.saved = v; },
        troops: () => store.troops, setTroops: (v) => { store.troops = v; }
    });
    const interpreter = new g.Game_Interpreter();
    interpreter.rrSwitchToMainParty();
    assert.deepEqual(plain(party.ids), [69, 70]);
    assert.deepEqual(plain(store.saved), [1, 5]);
    interpreter.rrSwitchToMainParty();
    assert.deepEqual(plain(party.ids), [69, 70], 'already in that mode: nothing moves');
    interpreter.rrSwitchToTroopsParty();
    assert.deepEqual(plain(party.ids), [1, 5]);
    assert.deepEqual(plain(store.troops), [69, 70]);
});
