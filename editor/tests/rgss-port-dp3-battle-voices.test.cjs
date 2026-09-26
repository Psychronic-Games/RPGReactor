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

const ENEMY_SCRIPT = `($diamondandplatinum3_scripts ||= {})[:EnemyBattleVoices] = true
module DiamondandPlatinum3
module EnemyBattleVoices
  FOLDER_DIRECTORY_NAME = "battle_chatter"
  EVENT_SWITCH_ID = 0
  SILENCE_STATES = []
  SKILLS_NOT_TO_PLAY_VOICE_FOR = []
  VOICE_FREQUENCY = 25
  PLAY_MULTIPLE_VOICES_FOR_MULTIPLE_HITS = false
  ENEMY_ATTACKING = { # <= Do Not Touch This Line
    # Rat
    1 => ["rat_attack", 100, 100, 0,],
    111 => ["attack25", 100, 85, 0,],
  }; USING_SKILLS = { # <= Do Not Touch This Line
    3 => [
    "infiltrator_attack1", 100, 100, 0,
    "infiltrator_attack7", 100, 100, 0,
    ],
  }; MISSED_ACTOR_TARGET = { # <= Do Not Touch This Line
    1 => ["rat_miss", 100, 100, 0,],
  }; DODGED_ACTOR_ATTACK = { # <= Do Not Touch This Line
    1 => ["rat_dodge", 100, 100, 0,],
  }; LITTLE_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 15 ,
  }; SIGNIFICANT_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 35 ,
  }; HEAVY_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 50 ,
  }; MASSIVE_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 65 ,
  }; DEFAULT_DAMAGE = { # <= Do Not Touch This Line
    1 => ["rat_hurt", 100, 100, 0,],
  }; HP_MP_RESTORE = { # <= Do Not Touch This Line
    1 => ["rat_death", 100, 100, 0,],
    :self_heal_speak  =>  true ,
  }; DEATH_VOICE = { # <= Do Not Touch This Line
    1 => ["rat_death", 100, 100, 0,],
};    # End Of Editable Region           ////            ==
  CURRENT_VERSION = 1.0
end
end`;

const ACTOR_SCRIPT = `($diamondandplatinum3_scripts ||= {})[:BattleVoices] = true
module DiamondandPlatinum3
module BattleVoices
  FOLDER_DIRECTORY_NAME = "battle_chatter"
  EVENT_SWITCH_ID = 0
  SILENCE_STATES = []
  SKILLS_NOT_TO_PLAY_VOICE_FOR = []
  VOICE_FREQUENCY = 100
  PLAY_MULTIPLE_VOICES_FOR_MULTIPLE_HITS = true
  TOO_MANY_ENEMIES = {  # <= Do Not Touch This Line
    :ratio => 2 ,
    1 => [],
    5 => [
    "droid_beeps_01", 100, 100, 0,
    "droid_beeps_02", 100, 100, 0,
    ],
  }; PARTY_NEEDS_HEALING = { # <= Do Not Touch This Line
    :ratio => 40 ,
    2 => [],
  }; VERY_WEAK_ENEMIES = { # <= Do Not Touch This Line
    :ratio => 40 ,
  }; WEAK_ENEMIES = { # <= Do Not Touch This Line
    :ratio => 80 ,
  }; EQUAL_ENEMIES = { # <= Do Not Touch This Line
    1 => ["even", 100, 100, 0],
  }; STRONG_ENEMIES = { # <= Do Not Touch This Line
    :ratio => 120 ,
  }; VERY_STRONG_ENEMIES = { # <= Do Not Touch This Line
    :ratio => 160 ,
  }; LITTLE_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 15 ,
    1 => [],
  }; SIGNIFICANT_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 35 ,
    1 => [],
  }; HEAVY_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 50 ,
    1 => [],
  }; MASSIVE_DAMAGE = { # <= Do Not Touch This Line
    :ratio => 65 ,
    1 => ["ouch_big", 90, 100, 0],
  }; DEFAULT_DAMAGE = { # <= Do Not Touch This Line
    1 => ["ouch", 100, 100, 0],
  }; DEATH_VOICE = { # <= Do Not Touch This Line
    4 => ["beany_death", 100, 100, 0,],
  }; REVIVED_VOICE = { # <= Do Not Touch This Line
    1 => ["back", 100, 100, 0],
  }; LEVELUP_VICTORY = { # <= Do Not Touch This Line
    1 => ["level", 100, 100, 12],
  }; NORMAL_VICTORY = { # <= Do Not Touch This Line
    1 => ["won", 100, 100, 0],
#=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
};    # End Of Editable Region           ////            ==
  CURRENT_VERSION = 2.6
end
end`;

const BREAKING_SCRIPT = `module DP3_PartyDyingBGM
                    #   Filename,           Volume   Pitch ]
  DyingBGM        = [ "Miguel - Survival",    100,     100  ]
  EntirePartyHP   = true
  HP_Percentage   = 50
  PrintBreakingPoint = false
end # of Editable Region`;

const RULES_SCRIPT = `$imported = {} if $imported.nil?
$imported["TH_BattleRules"] = true
module TH
  module Battle_Rules
    Default_Victory_Rules = {
      "$game_troop.all_dead?" => "All enemies defeated"
    }
    Default_Defeat_Rules = {
      "$game_party.all_dead?" => "All allies defeated"
    }
  end
end`;

test('D&P3 voices, Breaking Point, Battle Rules: detected; the voice-folder call translates', () => {
    const families = C.scriptFamilies([ENEMY_SCRIPT, ACTOR_SCRIPT, BREAKING_SCRIPT, RULES_SCRIPT]);
    for (const key of ['dp3EnemyVoices', 'dp3ActorVoices', 'dp3BreakingPoint', 'himeBattleRules']) assert.ok(families.has(key), key);
    assert.ok(!C.scriptFamilies([ENEMY_SCRIPT]).has('dp3ActorVoices'));
    const js = C.ruby('set_actor_voice_name(3, "Terence")', 'statement', { families: new Set(['dp3ActorVoices']) });
    assert.match(js, /this\.rrSetActorVoiceName\?\.\(3, "Terence"\)/);
});

test('D&P3 voices: settings and voice hashes come from the game copy', () => {
    const e = params('RR_DP3EnemyVoices').extract({ scripts: [ACTOR_SCRIPT, ENEMY_SCRIPT] });
    assert.equal(e.folder, 'battle_chatter');
    assert.equal(e.frequency, '25');
    assert.equal(e.multipleHits, undefined);
    const ev = JSON.parse(e.voices);
    assert.deepEqual(ev.ENEMY_ATTACKING, { 1: ['rat_attack', 100, 100, 0], 111: ['attack25', 100, 85, 0] });
    assert.deepEqual(ev.USING_SKILLS[3], ['infiltrator_attack1', 100, 100, 0, 'infiltrator_attack7', 100, 100, 0]);
    assert.deepEqual(ev.LITTLE_DAMAGE, { ratio: 15 });
    assert.equal(ev.HP_MP_RESTORE.self_heal_speak, true);
    const a = params('RR_DP3ActorVoices').extract({ scripts: [ENEMY_SCRIPT, ACTOR_SCRIPT] });
    assert.equal(a.frequency, '100');
    assert.equal(a.multipleHits, 'true');
    const av = JSON.parse(a.voices);
    assert.deepEqual(av.TOO_MANY_ENEMIES, { ratio: 2, 1: [], 5: ['droid_beeps_01', 100, 100, 0, 'droid_beeps_02', 100, 100, 0] });
    assert.deepEqual(av.DEATH_VOICE, { 4: ['beany_death', 100, 100, 0] });
});

// A small battle world: battlers, actions, the battle manager and the scene.
function world(names, parameters) {
    const log = [];
    const cls = (proto = {}, parent) => { function K() {} if (parent) K.prototype = Object.create(parent.prototype); Object.assign(K.prototype, proto); return K; };
    const Game_BattlerBase = cls({
        die() { this._hp = 0; log.push('die ' + this._name); },
        states() { return this._states || []; }, param(id) { return (this._params || [])[id] || 0; },
        isStateAffected(id) { return (this._stateIds || []).includes(id); }, deathStateId() { return 1; },
        isAlive() { return this._hp > 0; }, isActor() { return false; }, isEnemy() { return false; }
    });
    Object.defineProperty(Game_BattlerBase.prototype, 'hp', { get() { return this._hp; } });
    Object.defineProperty(Game_BattlerBase.prototype, 'mp', { get() { return this._mp || 0; } });
    Object.defineProperty(Game_BattlerBase.prototype, 'mhp', { get() { return this._mhp; } });
    const Game_Battler = cls({
        useItem(item) { log.push('use ' + item.id); }, onDamage(v) { log.push('onDamage ' + v); },
        removeState(id) { this._stateIds = (this._stateIds || []).filter(s => s !== id); if (id === 1) this._hp = 1; },
        result() { return this._result || { isHit: () => true }; }, attackSkillId() { return 1; }, name() { return this._name; }
    }, Game_BattlerBase);
    const Game_Enemy = cls({ isEnemy() { return true; }, enemyId() { return this._enemyId; }, enemy() { return { name: this._name }; } }, Game_Battler);
    const Game_Actor = cls({
        isActor() { return true; }, actorId() { return this._actorId; },
        changeExp(exp) { this._exp = exp; if (exp >= 100) this._level = 2; }
    }, Game_Battler);
    const battler = (K, o) => Object.assign(new K(), o);
    const Game_Action = cls({
        subject() { return this._subject; },
        apply(target) { target._result = this._result; },
        executeDamage(target, value) { target._hp -= value; },
        itemEffectRecoverHp(target) { target._hp += 10; }, itemEffectRecoverMp() {}
    });
    const Scene_Battle = cls({ start() { log.push('start'); }, update() {} });
    const Window_BattleLog = cls({ showNormalAnimation(targets, id) { log.push('anim ' + id); } });
    const Game_Interpreter = cls({});
    const BattleManager = {
        setup() {}, isBusy() { return false; }, processEscape() { return this._escapes; }, processVictory() { this._phase = 'battleEnd'; },
        processDefeat() { this._phase = 'battleEnd'; },
        invokeNormalAction(subject, target) { this._action.apply(target); }, invokeMagicReflection(subject) { this._action.apply(subject); }
    };
    const ctx = {
        Game_BattlerBase, Game_Battler, Game_Enemy, Game_Actor, Game_Action, Scene_Battle, Window_BattleLog, Game_Interpreter, BattleManager, console,
        SceneManager: { _scene: null }, $gameSwitches: { value: () => false }, $gameSystem: {},
        $dataSkills: [null, { id: 1, note: '' }, { id: 2, note: '~EnemyVoice: 3, "boom"\r\n~EnemyVoice: 31, "medic1", 90, 110, 0\r\n~EnemyVoice: 3, "boom2", 80' }, { id: 3, note: '' }],
        $dataItems: [null, { id: 1, note: '~ActorVoice: 1, "potion"' }], $dataAnimations: [null, { id: 1 }],
        DataManager: { isSkill: (i) => !!i && i.kind === 'skill', isItem: (i) => !!i && i.kind === 'item' },
        AudioManager: { playSe: (se) => log.push(`SE ${se.name} ${se.volume} ${se.pitch}`) },
        Math: Object.assign(Object.create(Math), { randomInt: (n) => 0 }),
        PluginManager: { parameters: () => parameters }
    };
    ctx.$gameActors = { actor: (id) => ctx.actors[id] || null };
    ctx.$gameParty = { battleMembers: () => ctx.party, members: () => ctx.party };
    ctx.$gameTroop = { members: () => ctx.troop, turnCount: () => ctx.turns || 1 };
    for (const name of names) vm.runInNewContext(plugin(name), ctx);
    ctx.SceneManager._scene = new Scene_Battle();
    return { ctx, log, battler };
}

const enemyParams = (over = {}) => Object.assign(params('RR_DP3EnemyVoices').extract({ scripts: [ENEMY_SCRIPT] }), { frequency: '100' }, over);

test('Enemy voices: attack, skill (note lines first), damage tiers, death, heal, miss and dodge', () => {
    const { ctx, log, battler } = world(['RR_DP3EnemyVoices'], enemyParams());
    const rat = battler(ctx.Game_Enemy, { _enemyId: 1, _name: 'Rat', _hp: 100, _mhp: 100 });
    const inf = battler(ctx.Game_Enemy, { _enemyId: 3, _name: 'Infiltrator', _hp: 100, _mhp: 100 });
    rat.useItem({ kind: 'skill', id: 1 });
    inf.useItem({ kind: 'skill', id: 3 });           // no note line: USING_SKILLS
    inf.useItem({ kind: 'skill', id: 2 });           // note lines for enemy 3 only, randomInt 0 picks the first
    rat.useItem({ kind: 'skill', id: 3 });           // no USING_SKILLS list for the rat: silent
    assert.deepEqual(log.filter(l => l.startsWith('SE')), ['SE battle_chatter/Rat/rat_attack 100 100', 'SE battle_chatter/Infiltrator/infiltrator_attack1 100 100', 'SE battle_chatter/Infiltrator/boom 100 100']);
    log.length = 0;
    // Damage the rat survives: 10% plays DEFAULT_DAMAGE; 20% picks LITTLE_DAMAGE, which has no lists: silent.
    rat._hp = 90; rat.onDamage(10);
    rat._hp = 70; rat.onDamage(20);
    rat._hp = 0; rat.onDamage(70);                   // lethal: no damage line
    rat.die();
    assert.deepEqual(log, ['SE battle_chatter/Rat/rat_hurt 100 100', 'onDamage 10', 'onDamage 20', 'onDamage 70', 'SE battle_chatter/Rat/rat_death 100 100', 'die Rat']);
    log.length = 0;
    const actor = battler(ctx.Game_Actor, { _actorId: 1, _name: 'Jay', _hp: 50, _mhp: 50 });
    const action = (subject, hit) => Object.assign(new ctx.Game_Action(), { _subject: subject, _result: { isHit: () => hit } });
    ctx.BattleManager._action = action(rat, false);
    ctx.BattleManager.invokeNormalAction(rat, actor);  // the rat missed the actor
    ctx.BattleManager._action = action(actor, false);
    ctx.BattleManager.invokeNormalAction(actor, rat);  // the rat dodged
    action(actor, false).apply(rat);                   // outside the battle flow (a counter): nothing
    const heal = action(inf, true);
    rat._hp = 50; heal.executeDamage(rat, -20);        // healed by another enemy
    action(actor, true).executeDamage(rat, -5);        // healed by an actor: nothing
    assert.deepEqual(log, ['SE battle_chatter/Rat/rat_miss 100 100', 'SE battle_chatter/Rat/rat_dodge 100 100', 'SE battle_chatter/Rat/rat_death 100 100']);
});

test('Enemy voices: the frequency roll, the mute switch and silencing states hold every line back', () => {
    const { ctx, log, battler } = world(['RR_DP3EnemyVoices'], enemyParams({ frequency: '25', silenceStates: '[4]', switchId: '7' }));
    const rat = battler(ctx.Game_Enemy, { _enemyId: 1, _name: 'Rat', _hp: 100, _mhp: 100 });
    ctx.Math.randomInt = () => 30;                   // rolls 30 of 100: over 25
    rat.die();
    ctx.Math.randomInt = () => 0;
    rat._states = [{ id: 4 }];
    rat.die();
    rat._states = [];
    ctx.$gameSwitches.value = (id) => id === 7;
    rat.die();
    ctx.$gameSwitches.value = () => false;
    rat.die();
    assert.deepEqual(log.filter(l => l.startsWith('SE')), ['SE battle_chatter/Rat/rat_death 100 100']);
});

test('Enemy voices: a line with a wait holds the battle that many frames', () => {
    const p = enemyParams();
    const v = JSON.parse(p.voices); v.DEATH_VOICE[1] = ['rat_death', 100, 100, 3];
    const { ctx, battler } = world(['RR_DP3EnemyVoices'], Object.assign(p, { voices: JSON.stringify(v) }));
    battler(ctx.Game_Enemy, { _enemyId: 1, _name: 'Rat', _hp: 1, _mhp: 1 }).die();
    const busy = [];
    for (let i = 0; i < 4; i++) { busy.push(ctx.BattleManager.isBusy()); ctx.SceneManager._scene.update(); }
    assert.deepEqual(busy, [true, true, true, false]);
});

const actorParams = () => params('RR_DP3ActorVoices').extract({ scripts: [ACTOR_SCRIPT] });

test('Actor voices: battle start falls through tables with no line; damage falls to the next table with one', () => {
    const { ctx, log, battler } = world(['RR_DP3ActorVoices'], actorParams());
    const jay = battler(ctx.Game_Actor, { _actorId: 1, _name: 'Jay', _hp: 100, _mhp: 100, _params: [0, 0, 10, 10, 10, 10] });
    ctx.actors = { 1: jay };
    ctx.party = [jay];
    ctx.troop = [1, 2, 3, 4].map(i => battler(ctx.Game_Enemy, { _enemyId: i, _name: 'Rat', _hp: 5, _mhp: 5, _params: [0, 0, 10, 10, 10, 10] }));
    ctx.SceneManager._scene.start();                  // 4 > 1 + 2 enemies, but Jay has no TOO_MANY line: on to EQUAL
    assert.deepEqual(log, ['SE battle_chatter/Jay/even 100 100', 'start']);
    log.length = 0;
    jay._hp = 20; jay.onDamage(80);                   // 80% > 65%: MASSIVE
    jay._hp = 10; jay.onDamage(20);                   // 20% > 15%: LITTLE has an empty list for Jay, so DEFAULT
    assert.deepEqual(log, ['SE battle_chatter/Jay/ouch_big 90 100', 'onDamage 80', 'SE battle_chatter/Jay/ouch 100 100', 'onDamage 20']);
    log.length = 0;
    ctx.$gameSystem._rrActorVoiceNames = [];
    new ctx.Game_Interpreter().rrSetActorVoiceName(1, 'Hero');
    jay.useItem({ kind: 'item', id: 1 });             // the item's note line, default volume 80
    assert.deepEqual(log, ['SE battle_chatter/Hero/potion 80 100', 'use 1']);
});

test('Actor voices: revival speaks, but not after the battle is lost; level-up waits twice its frames', () => {
    const { ctx, log, battler } = world(['RR_DP3ActorVoices'], actorParams());
    const jay = battler(ctx.Game_Actor, { _actorId: 1, _name: 'Jay', _hp: 0, _mhp: 100, _stateIds: [1], _level: 1 });
    ctx.actors = { 1: jay };
    ctx.party = [jay];
    jay.removeState(1);
    ctx.BattleManager.processDefeat();
    jay._stateIds = [1];
    jay.removeState(1);
    assert.deepEqual(log, ['SE battle_chatter/Jay/back 100 100']);
    ctx.BattleManager.setup();
    log.length = 0;
    jay.changeExp(100);
    assert.deepEqual(log, ['SE battle_chatter/Jay/level 100 100']);
    assert.equal(ctx.BattleManager._rrDp3VoiceWait, 24);
});

test('Actor voices: attack and skill lines come from the log window animation, per target', () => {
    const { ctx, log, battler } = world(['RR_DP3ActorVoices'], actorParams());
    const jay = battler(ctx.Game_Actor, { _actorId: 1, _name: 'Jay', _hp: 100, _mhp: 100 });
    const rats = [1, 2].map(i => battler(ctx.Game_Enemy, { _enemyId: i, _name: 'Rat', _hp: 5, _mhp: 5 }));
    ctx.actors = { 1: jay };
    ctx.BattleManager._subject = jay;
    ctx.BattleManager._action = { item: () => ({ kind: 'item', id: 1 }) };
    new ctx.Window_BattleLog().showNormalAnimation([jay, ...rats], 1, false);
    assert.deepEqual(log, ['SE battle_chatter/Jay/potion 80 100', 'SE battle_chatter/Jay/potion 80 100', 'anim 1']);
});

test('Breaking Point: settings from the game copy; the dying music swaps in and out, each resuming', () => {
    const p = params('RR_DP3BreakingPoint').extract({ scripts: [BREAKING_SCRIPT] });
    assert.deepEqual(p, { dyingBgm: '{"name":"Miguel - Survival","volume":100,"pitch":100}', entireParty: 'true', percentage: '50' });
    const log = [];
    let current = { name: 'Battle1', volume: 90, pitch: 100, pan: 0 }, pos = 0;
    const AudioManager = {
        saveBgm: () => Object.assign({}, current, { pos }),
        playBgm: (b, at) => { log.push(`${b.name} ${b.volume} @${at || 0}`); current = { name: b.name, volume: b.volume, pitch: b.pitch, pan: b.pan }; pos = at || 0; }
    };
    function Scene_Battle() {}
    Scene_Battle.prototype.start = function() {};
    Scene_Battle.prototype.update = function() {};
    const actors = [{ hp: 100, mhp: 100 }, { hp: 100, mhp: 100 }];
    const ctx = { Scene_Battle, AudioManager, BattleManager: { _phase: 'turn' }, $gameParty: { battleMembers: () => actors }, PluginManager: { parameters: () => p } };
    vm.runInNewContext(plugin('RR_DP3BreakingPoint'), ctx);
    const scene = new Scene_Battle();
    scene.start();
    scene.update();
    pos = 12;
    actors[0].hp = 0; actors[1].hp = 99;              // 99 < 100: dying
    scene.update(); scene.update();
    pos = 5;
    actors[1].hp = 100;                               // 100 is not below 100: back
    scene.update();
    pos = 30;
    actors[1].hp = 10;
    scene.update();
    ctx.BattleManager._phase = 'battleEnd';
    actors[1].hp = 100;
    scene.update();
    assert.deepEqual(log, ['Miguel - Survival 100 @0', 'Battle1 90 @12', 'Miguel - Survival 100 @5']);
});

test('Battle Rules: defaults and every rule condition of the game translated at import', () => {
    const M = { note: '<victory rule: add>\r\ncond: $game_switches[4]\r\n</victory rule>' };
    const troop = { pages: [{ list: [{ code: 108, parameters: ['<victory rule: set>'] }, { code: 408, parameters: ['cond: $game_troop.members[0].dead?'] },
        { code: 408, parameters: ['desc: Defeat the commander'] }, { code: 408, parameters: ['</victory rule>'] }, { code: 108, parameters: ['<defeat rule: add>'] },
        { code: 408, parameters: ['cond: BattleManager.mystery?'] }, { code: 408, parameters: ['</defeat rule>'] }] }] };
    const R = require(path.join(legacy, 'RubyMarshal.js'));
    const load = R.load;
    R.load = (b) => b;                                // the files below are handed over already read
    try {
        const files = { 'Data/Troops.rvdata2': [null, troop], 'Data/MapInfos.rvdata2': { 5: {} }, 'Data/Map005.rvdata2': Object.assign({ events: {} }, M) };
        const p = params('RR_HimeBattleRules').extract({ scripts: [RULES_SCRIPT], constants: {}, read: (rel) => files[rel] || null });
        assert.deepEqual(JSON.parse(p.defaultVictory), [['$game_troop.all_dead?', 'All enemies defeated']]);
        assert.deepEqual(JSON.parse(p.conditions), {
            '$game_troop.all_dead?': '$gameTroop.isAllDead()', '$game_party.all_dead?': '$gameParty.isAllDead()',
            '$game_troop.members[0].dead?': '$gameTroop.members()[0].isDead()', 'BattleManager.mystery?': null, '$game_switches[4]': '$gameSwitches.value(4)'
        });
    } finally { R.load = load; }
    // Each line splits at every colon: the value stops at a second one; an indented name is not a name.
    assert.deepEqual(params('RR_HimeBattleRules').ruleConditions('<victory rule: set>\r\ncond: a ? b : c\r\n</victory rule><defeat rule: add>\r\ndesc: y\r\n  cond: x\r\n</defeat rule>'), [' a ? b ', 'true']);
});

test('Battle Rules: set rules replace the wider ones, add rules join as groups, defeat first', () => {
    const conditions = { 'A': 'flags.a', 'B': 'flags.b', 'C': 'flags.c', 'X': null };
    const log = [];
    function Game_Interpreter() {}
    Game_Interpreter.prototype.command301 = function() { log.push('301'); return true; };
    const BattleManager = {
        _phase: 'turn', setup() {}, isBattleTest: () => false, processPartyEscape() { log.push('escape'); },
        processVictory() { log.push('victory'); this._phase = 'battleEnd'; }, processDefeat() { log.push('defeat'); this._phase = 'battleEnd'; },
        updateBattleEnd() { log.push('pop'); }
    };
    const comment = (kind, type, cond, group) => [{ code: 108, parameters: [`<${kind} rule: ${type}>`] }, { code: 408, parameters: ['cond: ' + cond] },
        ...(group ? [{ code: 408, parameters: ['group: ' + group] }] : []), { code: 408, parameters: [`</${kind} rule>`] }];
    const troop = { pages: [{ list: [...comment('victory', 'set', 'A'), ...comment('victory', 'set', 'B', 2)] }] };
    const page = { list: comment('victory', 'add', 'C') };
    const flags = { a: false, b: false, c: false, dead: false };
    const ctx = {
        flags, console: { warn: (...a) => log.push('warn ' + a[1]) }, Game_Interpreter, BattleManager,
        $dataMap: { note: '<defeat rule: set>\r\ncond: X\r\n</defeat rule>' }, $gameTemp: {}, $gameMap: { event: (id) => (id === 3 ? { page: () => page } : undefined) },
        $gameTroop: { troop: () => troop }, $gameParty: { isEscaped: () => false, isAllDead: () => flags.dead, reviveBattleMembers() { log.push('revive'); } },
        SceneManager: { pop() { log.push('scene pop'); }, goto() { log.push('gameover'); } }, Scene_Gameover: function() {},
        PluginManager: { parameters: () => Object.assign(params('RR_HimeBattleRules').extract({ scripts: [RULES_SCRIPT] }), { conditions: JSON.stringify(conditions) }) }
    };
    vm.runInNewContext(plugin('RR_HimeBattleRules'), ctx);
    const interp = new Game_Interpreter();
    interp._eventId = 3;
    interp.command301([]);
    BattleManager.setup(1);
    // The map's untranslated defeat rule replaces the default and is never met.
    assert.ok(log.includes('warn X'));
    assert.equal(BattleManager.checkBattleEnd(), false);
    flags.dead = true;                                // every actor down no longer loses
    assert.equal(BattleManager.checkBattleEnd(), false);
    flags.c = true;                                   // the event's added group wins
    assert.equal(BattleManager.checkBattleEnd(), true);
    assert.deepEqual(log.filter(l => l === 'victory'), ['victory']);
    // Group 1 (A) or group 2 (B) of the troop's set rules.
    Object.assign(flags, { c: false, b: true });
    BattleManager._phase = 'turn';
    assert.equal(BattleManager.checkBattleEnd(), true);
    // The event's rules stay for the next battle, which no event started.
    Object.assign(flags, { b: false, c: true });
    BattleManager._phase = 'turn';
    BattleManager.setup(1);
    assert.equal(BattleManager.checkBattleEnd(), true);
    assert.deepEqual(log.filter(l => l === 'victory').length, 3);
});

test('Battle Rules: a defeat by rule with the party standing is still a defeat', () => {
    const log = [];
    const BattleManager = {
        _phase: 'turn', setup() {}, isBattleTest: () => false, _canLose: false,
        processDefeat() { log.push('defeat'); this._phase = 'battleEnd'; }, processVictory() { log.push('victory'); }, updateBattleEnd() { log.push('pop'); }
    };
    const ctx = {
        console, BattleManager, Game_Interpreter: function() {}, $dataMap: { note: '<defeat rule: set>\r\ncond: $game_switches[2]\r\n</defeat rule>' }, $gameTemp: {},
        $gameMap: { event: () => undefined }, $gameTroop: { troop: () => ({ pages: [] }), isAllDead: () => false },
        $gameSwitches: { value: (id) => id === 2 }, $gameParty: { isEscaped: () => false, isAllDead: () => false },
        SceneManager: { pop() { log.push('scene pop'); }, goto() { log.push('gameover'); } }, Scene_Gameover: function() {},
        PluginManager: { parameters: () => ({ conditions: JSON.stringify({ '$game_switches[2]': '$gameSwitches.value(2)' }) }) }
    };
    ctx.Game_Interpreter.prototype.command301 = () => true;
    vm.runInNewContext(plugin('RR_HimeBattleRules'), ctx);
    BattleManager.setup(1);
    assert.equal(BattleManager.checkBattleEnd(), true);
    BattleManager.updateBattleEnd();
    assert.deepEqual(log, ['defeat', 'gameover']);
});
