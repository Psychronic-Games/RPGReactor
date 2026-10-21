// Thrall (VX) battle ports: the battler rules (RR_ThrallBattlers), Enu's Sideview 3.3 (RR_ThrallSideview), star's
// STR33 ATB with Thrall's battle screen (RR_ThrallATB), KGC Overdrive (RR_ThrallOverdrive), the Pain menu
// (RR_ThrallPain) and modern algebra's Variable Stat Booster (RR_MaVariableStatBooster).
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

// Snippets of the game's sections (016, 095/096, 098, 102, 106, 138, 139).
const GAME_BATTLER = 'class Game_Battler\n  def named_weapon_damage(attacker, damage)\n    minions = [21,22,23,24,25,\n      26,27]\n    return damage\n  end\nend';
const SIDEVIEW = 'class Sprite_Battler < Sprite_Base\n  def make_battler\n      names = ["$ThrallA","$ThrallB","$ThrallC","$ThrallD","$VampireC",\n        "$VampireD"]\n  end\nend';
const OVERDRIVE = 'module KGC\nmodule OverDrive\n  GAUGE_MAX = 1000\n  GAIN_RATE = [\n\t75,  # 0  Gained per attack.\n\t500,  # 1  Gained for taking damage.\n\t200,  # 2\n\t100,  # 3\n\t160,  # 4\n  25,  # 5\n\t50,  # 6\n  150,  # 7\n  ]  # ← No not remove these lines.\n  DEFAULT_ACTOR_DRIVE_TYPE = [0, 1, 6]\nend\nend\n$imported = {} if $imported == nil\n$imported["OverDrive"] = true\nclass Scene_Battle < Scene_Base\n  def gain_overdrive(unit, value)\n  end\nend';
const CTB = 'module STRRGSS2;module CTB\n  # > Game Variable to specify Wait Mode\n  WAIT_VA = 10         # 1-5000 Variable ID if you do not specify 0.\n  # > Game Variable to specify overall ATB Speed\n  CT_SPEED_VA = 9     # 1-5000 Variable ID if you do not specify 0.\n  CT_MAX       = 4096       # CT Maximum Value\n  CT_SPEED     = 30         # Gauge Speed\n  CT_CANCEL    = 20         # Canceled turn CT reduction (%)\n  # SE that plays when Actor Command window opens\n  COMMANDSE    = RPG::SE.new("Decision2", 80, 100) \n  ESCAPE_LOSS   = true       # Escape gauge decreases when not attempting escape.\n  W_RECT       = Rect.new(0, 352, 608, 128)\nend;end';
const FLEE = 'class Sprite_EscapeGauge < Sprite\n  ESCGAUGE_BC = [Color.new(0,0,0), Color.new(64,64,64)]\n  def make_list\n          back = Cache.system("queue_back")\n  end\nend';
const SBS_CONFIG = 'module N01\n  ANIME = {\n  "WAIT" => [ 0,  1,  15,   0,   0,  -1,   0, true,"" ],\n  }\n  ACTION = {\n  "NORMAL_ATTACK" => ["WAIT"],\n  }\nend\nclass Game_Actor < Game_Battler\n  def normal\n    case @actor_id\n    when 1\n      return "WAIT"\n    end\n    # Default action for all unassigned Actor IDs.\n    return "WAIT"\n  end\nend\nclass Skill\n  def extension\n    case @id\n    when 11 #Flurry\n      return ["COMPOUNDING"]\n    when 13,224 #Mach Speed, Throw\n      return ["NOEVADE"]\n#~     when 16 #Curse\n#~       return ["%DAMAGENOW/99"]\n    when 195 #Grape\n      return ["%DAMAGEMAX/-35"]\n    end\n    return ["NONE"]\n  end\nend';
const PAIN = 'class Window_Heat < Window_Selectable\nend\nclass Scene_Heat < Scene_Base\n  def start\n  end\nend';
const VSB = 'VSB_STAT_ARRAY = [:maxhp, :maxmp, :atk, :def, :spi, :agi, :exp]\n#\nVSB_BOOST_VARIABLE_ID = [40,41,42,43,44,45,46]\nclass Game_Enemy\nend';
const SCRIPTS = [GAME_BATTLER, SBS_CONFIG, SIDEVIEW, OVERDRIVE, CTB, FLEE, PAIN, VSB];

test('the families find Thrall\'s battle scripts, and the battler rules install before the ports built on them', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of ['thrallBattlers', 'thrallSideview', 'thrallOverdrive', 'thrallATB', 'thrallPain', 'maVariableStatBooster']) assert.ok(fam.has(key), key);
    const of = (key) => C.FAMILIES.find(f => f.key === key);
    assert.deepEqual(plain(of('thrallATB').requires), ['RR_ThrallBattlers', 'RR_ThrallSideview']);
    assert.deepEqual(plain(of('thrallSideview').requires), ['RR_ThrallBattlers']);
    assert.deepEqual(plain(of('thrallOverdrive').requires), ['RR_ThrallBattlers']);
    // Another VX game's stock Game_Battler does not install the rules.
    assert.ok(!C.scriptFamilies(['class Game_Battler\n  def make_attack_damage_value(attacker)\n  end\nend']).has('thrallBattlers'));
});

test('events\' calls into Thrall\'s battle scripts translate', () => {
    const ctx = { constants: {}, families: new Set(['thrallOverdrive', 'thrallBattlers', 'thrallPain']) };
    assert.equal(C.ruby('gain_actor_od_gauge(1, -500)', 'statement', ctx), 'this.rrGainActorOdGauge?.(1, -(500));');
    assert.equal(C.ruby('gain_enemy_od_gauge(-1, 1000)', 'statement', ctx), 'this.rrGainEnemyOdGauge?.(-(1), 1000);');
    assert.match(C.ruby('$game_variables[5] = get_actor_od_gauge(2)', 'statement', ctx), /\$gameVariables\.setValue\(5, \(this\.rrGetActorOdGauge\?\.\(2\) \?\? 0\)\);/);
    assert.equal(C.ruby('$game_actors[1].overdrive = 1000', 'statement', ctx), '$gameActors.actor(1).rrSetOverdrive?.(1000);');
    assert.equal(C.ruby('$game_actors[1].pain = 0', 'statement', ctx), '$gameActors.actor(1).rrSetPain?.(0);');
    assert.equal(C.ruby('$game_actors[1].animation_id = 180', 'statement', ctx), '$gameActors.actor(1).rrSetAnimationId?.(180);');
    assert.match(C.ruby('$scene = Scene_Heat.new', 'statement', ctx), /SceneManager\.goto\(Scene_ThrallHeat\)/);
});

test('settings come from the game: the ATB, the sideview tables, the overdrive gains, the boosted stats', () => {
    const atb = params('RR_ThrallATB').extract({ scripts: SCRIPTS });
    assert.equal(atb.WAIT_VA, '10');
    assert.equal(atb.CT_SPEED_VA, '9');
    assert.equal(atb.CT_MAX, '4096');
    assert.equal(atb.ESCAPE_LOSS, 'true');
    assert.deepEqual(JSON.parse(atb.W_RECT), [0, 352, 608, 128]);
    assert.deepEqual(JSON.parse(atb.COMMANDSE), { name: 'Decision2', volume: 80, pitch: 100, pan: 0 });
    assert.deepEqual(JSON.parse(atb.ESCGAUGE_BC), [[0, 0, 0, 255], [64, 64, 64, 255]]);

    const sbs = params('RR_ThrallSideview').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(sbs.anime).WAIT, [0, 1, 15, 0, 0, -1, 0, true, '']);
    assert.deepEqual(JSON.parse(sbs.action).NORMAL_ATTACK, ['WAIT']);
    const tables = JSON.parse(sbs.tables);
    assert.deepEqual(tables.actor.normal, { table: { 1: 'WAIT' }, default: 'WAIT' });
    // A commented-out `when` is not read.
    assert.deepEqual(tables.skill.extension.table, { 11: ['COMPOUNDING'], 13: ['NOEVADE'], 224: ['NOEVADE'], 195: ['%DAMAGEMAX/-35'] });
    assert.deepEqual(tables.skill.extension.default, ['NONE']);

    const od = params('RR_ThrallOverdrive').extract({ scripts: SCRIPTS, constants: { 'KGC::OverDrive::GAUGE_MAX': 1000 } });
    assert.deepEqual(JSON.parse(od.gainRate), [75, 500, 200, 100, 160, 25, 50, 150]);
    assert.deepEqual(JSON.parse(od.actorDriveType), [0, 1, 6]);
    assert.equal(od.gaugeMax, '1000');

    const vsb = params('RR_MaVariableStatBooster').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(vsb.stats), ['maxhp', 'maxmp', 'atk', 'def', 'spi', 'agi', 'exp']);
    assert.deepEqual(JSON.parse(vsb.variables), [40, 41, 42, 43, 44, 45, 46]);

    const battlers = params('RR_ThrallBattlers').extract({ scripts: SCRIPTS });
    assert.equal(battlers.minions, '21,22,23,24,25,26,27');
    assert.equal(battlers.vxData, '', 'no data files: the plugin rebuilds its records from the MZ database');
});

test('the VX records come from the game\'s data files when it ships them', { skip: !fs.existsSync(path.resolve(__dirname, '..', '..', 'template', 'Thrall', 'Data', 'Skills.rvdata')) && 'Thrall is not in template/' }, () => {
    const data = path.resolve(__dirname, '..', '..', 'template', 'Thrall');
    const read = (rel) => { try { return fs.readFileSync(path.join(data, rel)); } catch (_) { return null; } };
    const raw = params('RR_ThrallBattlers').vxData(read);
    assert.ok(raw && Object.keys(raw.skills).length > 100);
    // Armours keep their VX kind (0 shield … 3 accessory) first.
    assert.ok(Object.values(raw.armors).every(a => a[0] >= 0 && a[0] <= 3));
    // Troop members marked immortal in the database.
    assert.ok(raw.immortal.length > 0 && raw.immortal.every(s => /^\d+:\d+$/.test(s)));
});

// ---- the rules in a small MZ ------------------------------------------------------------------
const STATE = (id, over = {}) => Object.assign([0, 5, 0, 0, 100, 100, 100, 100, 0, [], []], over);
function world(pluginParams = {}) {
    const vars = {};
    const switches = {};
    const named = (list) => list.map((n, i) => (n == null ? null : Object.assign({ id: i, name: n, note: '', iconIndex: 0, description: '', traits: [] }, typeof n === 'object' ? n : { name: n })));
    const $dataSkills = named([null, 'Attack', { name: 'Omnislash', note: '<overdrive 1000>' }]);
    const $dataItems = named([null, 'Grape']);
    const $dataWeapons = named([null, 'Saria Sword', 'Twin Fang']);
    const $dataArmors = named([null, 'Camouflage Cloak', 'Old Cape']);
    const $dataStates = named([null, 'Incapacitated', 'Burn', 'Freeze', 'Poison', 'Shock']);
    const $dataEnemies = named([null, 'Slime']);
    const $dataActors = named([null, 'Mel']);
    const $dataClasses = named([null, 'Warrior']);
    const raw = {
        skills: { 1: [0, 100, 0, 20, 95, 1, 1, 0, 0, 1, 0, 1, [], [], []], 2: [500, 100, 0, 20, 100, 1, 1, 0, 0, 1, 0, 1, [], [], []] },
        items: { 1: [0, 0, 0, 0, 100, 7, 0, 0, 0, 0, 0, 0, [], [], [], 35, 0, 0, 0, 0, 0, 1] },
        weapons: { 1: [20, 0, 0, 0, 95, 1, 0, [1, 9], []], 2: [10, 0, 0, 0, 95, 1, 0, [32], []] },
        armors: { 1: [2, 0, 3, 0, 0, 0, 8, [], []], 2: [1, 0, 1, 0, 0, 0, 0, [], []] },
        states: { 1: STATE(1, { 0: 4, 8: 1 }), 2: STATE(2), 3: STATE(3), 4: STATE(4, { 8: 4 }), 5: STATE(5) },
        enemies: { 1: [200, 10, 30, 10, 10, 20, 95, 5, 12, 7, 0, [0, 0, 1], [0, 0, 1], '3333333', '3333', [[0, 0, 0, 0, 0, 0, 5]]] },
        classes: { 1: [0, '3333333', '3333', 0, ''] },
        actors: { 1: [1, 0] },
        immortal: ['3:0']
    };
    const P = Object.assign({ RR_ThrallBattlers: { vxData: JSON.stringify(raw), minions: '' } }, pluginParams);
    const events = [];
    class Game_BattlerBase {
        constructor() { this.initialize(...arguments); }
        initialize() { this.initMembers(); }
        initMembers() { this._hp = 1; this._mp = 0; this._tp = 0; this._hidden = false; this._paramPlus = [0, 0, 0, 0, 0, 0, 0, 0]; this._states = []; this._stateTurns = {}; this._buffs = []; }
        get hp() { return this._hp; }
        get mp() { return this._mp; }
        get mhp() { return this.param(0); }
        get mmp() { return this.param(1); }
        param(id) { return this.paramBase(id) + this._paramPlus[id]; }
        paramBase() { return 0; }
        maxTp() { return 100; }
        isStateAffected(id) { return this._states.includes(id); }
        isActor() { return false; }
        isEnemy() { return false; }
        isHidden() { return this._hidden; }
        clearStates() { this._states = []; this._stateTurns = {}; }
        refresh() {}
    }
    class Game_Battler extends Game_BattlerBase {}
    class Game_Actor extends Game_Battler {
        initialize(id) { super.initialize(); this._actorId = id; this._classId = 1; this._level = 1; this._skills = []; this._equips = []; this._name = 'Mel'; }
        setup() {}
        isActor() { return true; }
        actorId() { return this._actorId; }
        actor() { return $dataActors[this._actorId]; }
        name() { return this._name; }
        weapons() { return this._equips.filter(e => $dataWeapons.includes(e)); }
        armors() { return this._equips.filter(e => $dataArmors.includes(e)); }
        equips() { return this._equips.slice(); }
        skills() { return this._skills.map(id => $dataSkills[id]); }
        isLearnedSkill(id) { return this._skills.includes(id); }
        get level() { return this._level; }
        paramBase(id) { return [100, 20, 15, 10, 10, 10, 12, 0][id]; }
    }
    class Game_Enemy extends Game_Battler {
        initialize(id, x, y) { super.initialize(); this.setup(id, x, y); }
        setup(id) { this._enemyId = id; this._hp = this.mhp; this._mp = this.mmp; }
        isEnemy() { return true; }
        enemy() { return $dataEnemies[this._enemyId]; }
        enemyId() { return this._enemyId; }
        name() { return 'Slime'; }
        index() { return 0; }
        exp() { return 0; }
        gold() { return 0; }
    }
    class Game_Unit { members() { return []; } }
    class Game_Troop extends Game_Unit { setup() {} clear() {} meetsConditions() { return false; } }
    class Game_Party extends Game_Unit { members() { return this._members || []; } inBattle() { return false; } }
    const stub = (name) => { const F = { [name]: class { constructor() { if (this.initialize) this.initialize(...arguments); } } }[name]; return F; };
    const ctx = {
        console, Math, JSON,
        PluginManager: { parameters: (name) => P[name] || {} },
        DataManager: {
            onLoad() {}, isDatabaseLoaded: () => true,
            isSkill: (o) => $dataSkills.includes(o), isItem: (o) => $dataItems.includes(o), isWeapon: (o) => $dataWeapons.includes(o), isArmor: (o) => $dataArmors.includes(o)
        },
        Game_BattlerBase, Game_Battler, Game_Actor, Game_Enemy, Game_Unit, Game_Troop, Game_Party,
        Game_Action: stub('Game_Action'), Game_Interpreter: stub('Game_Interpreter'), Game_Temp: stub('Game_Temp'), Scene_Title: stub('Scene_Title'),
        Scene_Battle: stub('Scene_Battle'), Window_Base: stub('Window_Base'), Window_SkillList: stub('Window_SkillList'), Scene_Skill: stub('Scene_Skill'),
        Scene_ItemBase: stub('Scene_ItemBase'), BattleManager: {}, SceneManager: {}, SoundManager: {}, AudioManager: { playSe() {} },
        ReactorEvents: { emit: (name, data) => events.push([name, data.stateId]) },
        $dataSkills, $dataItems, $dataWeapons, $dataArmors, $dataStates, $dataEnemies, $dataActors, $dataClasses, $dataSystem: { elements: [] },
        $gameVariables: { value: (id) => vars[id] || 0, setValue: (id, v) => { vars[id] = v; } },
        $gameSwitches: { value: (id) => !!switches[id], setValue: (id, v) => { switches[id] = v; } },
        $gameParty: new Game_Party(), $gameTroop: new Game_Troop(), $gameTemp: {}, $gameMessage: { add() {} }
    };
    ctx.$gameActors = { _a: {}, actor(id) { return this._a[id] || (this._a[id] = new Game_Actor(id)); } };
    vm.createContext(ctx);
    vm.runInContext('var window = globalThis;', ctx);
    for (const name of ['RR_ThrallBattlers', 'RR_ThrallOverdrive', 'RR_MaVariableStatBooster']) vm.runInContext(plugin(name), ctx, { filename: name + '.js' });
    vm.runInContext('RRThrallVx.buildDatabase()', ctx);
    return { ctx, vars, switches, events, run: (code) => vm.runInContext(code, ctx) };
}

test('the VX records: an armour keeps its VX kind beside its own name and note', () => {
    const { run } = world();
    assert.deepEqual(plain(run('(() => { const a = RRThrallVx.armor(1); return [a.kind, a.isArmor(), a.name, a.auto_hp_recover, a.def]; })()')), [2, true, 'Camouflage Cloak', true, 3]);
    assert.deepEqual(plain(run('(() => { const w = RRThrallVx.weapon(2); return [w.kind, w.isWeapon(), w.name, w.element_set]; })()')), ['weapon', true, 'Twin Fang', [32]]);
    assert.equal(run('RRThrallVx.of($dataArmors[2]).name'), 'Old Cape');
    // Ruby integer arithmetic: division floors, modulo takes the divisor's sign.
    assert.deepEqual(plain(run('[RRThrallVx.idiv(-7, 2), RRThrallVx.imod(-7, 3), RRThrallVx.rdiv(7, 2), RRThrallVx.rdiv(7.0 + 0.5, 2)]')), [-4, 2, 3, 3.75]);
});

test('0 HP incapacitates, except an immortal battler; troop members marked immortal start so', () => {
    const { run, vars, events } = world();
    vars[40] = vars[41] = vars[42] = vars[43] = vars[44] = vars[45] = vars[46] = 100;
    run('var e = new Game_Enemy(1, 0, 0)');
    assert.equal(run('e.mhp'), 200);
    run('e.setHp(0)');
    assert.deepEqual(plain(run('[e.hp, e.isStateAffected(1), e.isDead()]')), [0, true, true]);
    assert.deepEqual(plain(events.at(-1)), ['stateAdded', 1]);
    run('e.setHp(50)');
    assert.deepEqual(plain(run('[e.hp, e.isStateAffected(1)]')), [50, false]);
    run('e._rrImmortal = true; e.setHp(0)');
    assert.deepEqual(plain(run('[e.hp, e.isStateAffected(1), e.isDead()]')), [0, false, false]);
    assert.ok(run('RRThrallVx.IMMORTAL.has("3:0")'));
});

test('Burn stacks to 5 and Freeze to 3; lifting one clears its stack', () => {
    const { run } = world();
    run('var e = new Game_Enemy(1, 0, 0)');
    run('for (let i = 0; i < 7; i++) e.addState(2); for (let i = 0; i < 4; i++) e.addState(3);');
    assert.deepEqual(plain(run('e.rrStatusMod()')).slice(0, 2), [5, 3]);
    run('e.removeState(2)');
    assert.deepEqual(plain(run('e.rrStatusMod()')).slice(0, 2), [0, 3]);
});

test('the stat booster: a variable gives the stat\'s percentage, 0 leaves 1 (as the script did)', () => {
    const { run, vars } = world();
    run('var e = new Game_Enemy(1, 0, 0)');
    assert.equal(run('e.mhp'), 1);
    vars[40] = 150;
    assert.equal(run('e.mhp'), 300);
    vars[42] = 50;
    assert.equal(run('e.rrVxEnemyStat(2)'), 15);
    vars[46] = 200;
    assert.equal(run('e.rrVxExp()'), 24);
});

test('overdrive: the gauge clamps to its maximum; element 32 on the weapon makes two gauges; events fill it', () => {
    const { run } = world();
    run('var a = $gameActors.actor(1); a._hp = 50; $gameParty._members = [a];');
    run('a.rrSetOverdrive(1500)');
    assert.equal(run('a.rrOverdrive()'), 1000);
    run('a._equips = [{ itemId: () => 2, isWeapon: () => true }]');
    assert.equal(run('a.rrMaxOverdrive()'), 2000);
    assert.equal(run('a.rrOverdriveMax()'), 2000);
    run('Game_Interpreter.prototype.rrGainActorOdGauge.call({}, 1, 700)');
    assert.equal(run('a.rrOverdrive()'), 1700);
    run('Game_Interpreter.prototype.rrGainActorOdGauge.call({}, 1, -5000)');
    assert.equal(run('a.rrOverdrive()'), 0);
    assert.deepEqual(plain(run('RRThrallVx.odData($dataSkills[2])')), { gain: 0, overdrive: true, cost: 1000, consumeAll: false, gainRate: 100 });
});
