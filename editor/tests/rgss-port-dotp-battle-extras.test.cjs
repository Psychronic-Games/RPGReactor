'use strict';
// Dreamwalker's Equipment Learning, Follow-Up Skill, Steal Items (with its Skill Display popup add-on),
// Skill Display and Elemental Popups ports.
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

// Snippets of the game's copies.
const LEARNING = `$imported = {} if $imported.nil?
$imported["YES-EquipmentLearning"] = true
module YES
  module EQUIPMENT_LEARNING
    ICON   = 4266           # Icon index used to represent AP.
    VOCAB  = " Equip EXP"        # What AP will be called in your game.
    LEARN_TITLE = "Equip Skills"
    SHOW_GAUGE = true
    COLOR_GAUGE = { # Start.
      :color1 => 9,
      :color2 => 1,
    } # End.
    ENABLE_WINDOW = true # Enable Learning Window in Scene Equip.
    ENEMY_KILL = 1     # AP earned for the whole party.
    LEVEL_UP   = 5    # AP earned when leveling up!
    REQUIRE_AP  = 100   # AP required for learning skill.
    VICTORY_MESSAGE   = "%s has earned %s %s!"
    VICTORY_LEARN = "%s has unlocked new Equip Skills!"
    VICTORY_AFTERMATH = "+%s%s"
  end
end`;
const STEAL = `$imported = {} if $imported.nil?
$imported["YEA-StealItems"] = true
module YEA
  module STEAL
    STEAL_FAIL_TEXT    = "%s couldn't steal an item."         # Failed steal.
    STEAL_SUCCESS_TEXT = "%s steals \\ec[17]%s\\ec[0] from %s!" # Successful.
    STEAL_EMPTY_TEXT   = "%s has nothing left to steal."      # Emptied out.
    SNATCH_RATE_TEXT   = "%1.2f%%"      # Percentage display for steal rate.
    SNATCH_RATE_SIZE   = 18             # Font size used for rate text.
    STEAL_ITEM_SFX   = RPG::SE.new("Item3", 100, 100)    # Item stolen.
    STEAL_WEAPON_SFX = RPG::SE.new("Equip1", 100, 100)   # Weapon stolen.
    STEAL_ARMOUR_SFX = RPG::SE.new("Equip2", 100, 100)   # Armour stolen.
    STEAL_GOLD_SFX   = RPG::SE.new("Shop", 100, 100)     # Gold stolen.
    MAXIMUM_RATE = 0.9999
    MINIMUM_RATE = 0.0001
    STEAL_BONUS_RATE = "(user.luk/(512.0+user.luk))*0.3333"
    STEAL_LOWER_STATS = true
    GOLD_ICON = 3777
    GOLD_DESCRIPTION    = "Disregard Females. Steal currency."
    NOTHING_DESCRIPTION = "There is nothing to steal."
  end # STEAL
end # YEA`;
const POPUP_ADDON = `class Scene_Battle < Scene_Base
  alias steal_popup_apply_item_effects_nb apply_item_effects
  def show_steal_popup_nb(target, item)
  end
end`;
const DISPLAY = `$imported = {} if $imported.nil?
$imported["CP-SkillDisplay"] = true
class Window_BattleLog < Window_Selectable
  COUNTER = "Counter-Attack!"
  REFLECT = "Reflect"
  SUB = nil
  X_OFFSET = 0
  Y_OFFSET = 55
  BACK_COLOR = Color.new(0, 0, 0, 255)
  BACK_PIC = nil
  ACTION_SPEED = 0
end`;
const ELEMENTS = `$imported = {} if $imported.nil?
$imported["YEA-ElementalPopups"] = true
module YEA
  module ELEMENT_POPUPS
    DEFAULT = ["Arial"]
    COLOURS ={
    # ElementID => [ Zoom1, Zoom2, Sz, Bold, Italic, Red, Grn, Blu, Font]
              0 => [   3,      0, 25, true,  false, 255, 255, 255, DEFAULT], #None
              1 => [   3,      0, 25, true,  false, 255, 165, 0,   DEFAULT], #Thermal
              4 => [   3,      0, 25, true,  false, 255, 0, 0,     ["Verdana"]], #Bleed
    } # Do not remove this.
  end # ELEMENT_POPUPS
end # YEA`;
const FOLLOW = `$imported = {} if $imported.nil?
$imported["YEA-FollowUpSkill"] = true`;

// A class with the methods a plugin wraps at load time.
const cls = (methods = {}) => { function K() {} Object.assign(K.prototype, methods); return K; };

test('families: each script is detected; el_gain translates to the actor', () => {
    const found = C.scriptFamilies([LEARNING, STEAL, DISPLAY, ELEMENTS, FOLLOW]);
    for (const key of ['yamiEquipLearning', 'yanflySteal', 'neonSkillDisplay', 'yanflyElementalPopups', 'yanflyFollowUpSkill']) assert.ok(found.has(key), key);
    const js = C.ruby('$game_actors[3].el_gain(20)', 'statement', { families: new Set(['yamiEquipLearning']) });
    assert.match(js, /\$gameActors\.actor\(3\)\?\.rrElGain\?\.\(20\)/);
});

test('params: settings from the game copies', () => {
    const el = params('RR_YamiEquipLearning').extract({ scripts: [LEARNING, '$imported["YEA-VictoryAftermath"] = true'] });
    assert.equal(el.vocab, ' Equip EXP');
    assert.equal(el.gaugeColor1, '9');
    assert.equal(el.gaugeColor2, '1');
    assert.equal(el.levelUp, '5');
    assert.equal(el.aftermath, 'true');
    assert.equal(el.equipEngine, 'false');
    const st = params('RR_YanflySteal').extract({ scripts: [STEAL, POPUP_ADDON, 'Font.default_size = 18'] });
    assert.equal(st.successText, '%s steals \\c[17]%s\\c[0] from %s!');
    assert.equal(st.bonusRate, '((a.luk / (512 + a.luk)) * 0.3333)');
    assert.deepEqual(JSON.parse(st.sounds)[2], { name: 'Equip1', volume: 100, pitch: 100 });
    assert.equal(st.goldIcon, '3777');
    assert.equal(st.popups, 'true');
    assert.equal(st.defaultFontSize, '18');
    const sd = params('RR_NeonSkillDisplay').extract({ scripts: [DISPLAY] });
    assert.equal(sd.substituteText, 'null');
    assert.equal(sd.offsetY, '55');
    assert.equal(sd.backColor, '[0,0,0,255]');
    const ep = params('RR_YanflyElementalPopups').extract({ scripts: [ELEMENTS] });
    assert.deepEqual(JSON.parse(ep.rules), {
        ELEMENT_0: [3, 0, 25, true, false, 255, 255, 255, ['Arial']],
        ELEMENT_1: [3, 0, 25, true, false, 255, 165, 0, ['Arial']],
        ELEMENT_4: [3, 0, 25, true, false, 255, 0, 0, ['Verdana']]
    });
});

/** Equipment Learning loaded with small stand-ins for the engine; returns the context. */
function learning(extra = {}) {
    const skills = [null, { id: 1, note: '<el require: 10>', name: 'Fire' }, { id: 2, note: '', name: 'Ice' }];
    const weapon = { id: 1, note: '<el skill: 1>\n<el skill: 2>\n<el skill: 9>' };
    const cls1 = { id: 1, note: '' }, actor1 = { id: 1, note: '<el rate: 150%>' };
    function Game_Actor() { this._skills = []; this._level = 1; this._equips = [weapon]; }
    Object.assign(Game_Actor.prototype, {
        equips() { return this._equips; }, currentClass() { return cls1; }, actor() { return actor1; }, actorId() { return 1; },
        isLearnedSkill(id) { return this._skills.includes(id); }, learnSkill(id) { if (!this._skills.includes(id)) this._skills.push(id); },
        levelUp() { this._level++; }, skills() { return this._skills.map(id => skills[id]); }, name() { return 'Jay'; },
        finalExpRate() { return 1; }, currentExp() { return 90; }, expForLevel() { return 100; }, isMaxLevel() { return false; }, get level() { return this._level; }
    });
    const enemies = [{ enemy: () => ({ id: 1, note: '' }) }, { enemy: () => ({ id: 2, note: '<el gain: 3>' }) }];
    function Game_Enemy() {}
    function Game_Troop() {}
    const messages = [];
    const ctx = {
        PluginManager: { parameters: () => Object.assign({ enableWindow: 'false', aftermath: 'false' }, extra) },
        Game_Actor, Game_Enemy, Game_Troop, $dataSkills: skills, $dataItems: [null],
        TextManager: { obtainSkill: '%1 learned!' },
        $gameMessage: { add: (t) => messages.push(t), newPage: () => messages.push('--') },
        BattleManager: { setup() {}, gainExp() { for (const a of ctx.$gameParty.allMembers()) a.levelUp(); }, displayExp() {}, _rewards: { exp: 20 } },
        messages
    };
    ctx.window = ctx;
    vm.runInNewContext(`String.prototype.format = function(...a) { return this.replace(/%(\\d+)/g, (_, n) => a[n - 1]); };` + plugin('RR_YamiEquipLearning'), ctx);
    Object.setPrototypeOf(enemies[0], Game_Enemy.prototype);
    Object.setPrototypeOf(enemies[1], Game_Enemy.prototype);
    const troop = Object.create(Game_Troop.prototype);
    troop.deadMembers = () => enemies;
    troop.expTotal = () => 20;
    ctx.$gameTroop = troop;
    const actor = new Game_Actor();
    ctx.$gameParty = { allMembers: () => [actor] };
    ctx.actor = actor;
    return ctx;
}

test('Equipment Learning: points by the rate, learned at the requirement, capped; a level adds its points', () => {
    const { actor } = learning();
    assert.deepEqual(plain(actor.rrElSkills()), [1, 2, 9]);
    assert.equal(actor.rrElRate(), 150);
    const learned = actor.rrElGain(4);               // 4 × 150% = 6 each
    assert.equal(learned, false);
    assert.deepEqual(plain(actor.rrEquipLearning()), { 1: 6, 2: 6 });
    const second = actor.rrElGain(3);                // 6 + 5 (4.5 rounded) reaches Fire's 10
    assert.deepEqual(plain(second.map(s => s.name)), ['Fire']);
    assert.equal(actor.rrCurElp(1), 10);
    assert.equal(actor.rrPerElp(2), 11 / 100);
    actor.levelUp();                                 // 5 × 150% = 7.5 → 8
    assert.equal(actor.rrEquipLearning()[2], 19);
    assert.equal(actor.rrEquipLearning()[1], 10);    // learned skills stay at their requirement
});

test('Equipment Learning: the victory amount, and the reward messages without Victory Aftermath', () => {
    const ctx = learning();
    const { actor, BattleManager } = ctx;
    // Fallen enemies give 1 + 3; the battle's 20 EXP passes the next level (90 + 20 > 100): + 5; × 150%.
    assert.equal(actor.rrEquipExpGained(), 14);
    assert.equal(actor.rrEquipExpText(), '+14 Equip EXP');
    BattleManager.displayExp();
    BattleManager.gainExp();
    assert.equal(actor.rrEquipExpGained(), 14);      // kept from before the EXP was gained
    assert.deepEqual(ctx.messages, ['\\.Jay has earned 6  Equip EXP!', '--', 'Jay has unlocked new Equip Skills!', 'Fire learned!']);
    assert.deepEqual(plain(BattleManager.rrEquipLearnResults().map(r => r.learned.map(s => s.name))), [['Fire']]);
});

test('Equipment Learning: with Victory Aftermath the screen is told of any change of skills', () => {
    const ctx = learning({ aftermath: 'true' });
    const told = [];
    ctx.BattleManager.rrShowVictoryElLearn = (actor, before, learned) => told.push([before.length, learned.map(s => s.name)]);
    ctx.BattleManager.gainExp();
    assert.deepEqual(ctx.messages, []);
    assert.deepEqual(plain(told), [[0, ['Fire']]]);
});

/** Follow-Up Skill with a user whose skill hit; returns [user, action]. */
function followUp(note, { executing = true, queued = [] } = {}) {
    const skills = [null, { id: 1, note }, { id: 2, note: '' }];
    function Game_Action(subject) { this._subject = subject; this._targetIndex = -1; }
    Object.assign(Game_Action.prototype, {
        applyItemUserEffect() {}, subject() { return this._subject; }, item() { return this._item; },
        setSkill(id) { this._item = skills[id]; }, setTarget(i) { this._targetIndex = i; }, decideRandomTarget() { this._targetIndex = 'random'; }
    });
    const ctx = {
        Game_Battler: cls(), Game_Action, $dataSkills: skills, $dataStates: [null, {}, {}],
        $gameSwitches: { value: (id) => id === 5 }, DataManager: { isSkill: (i) => skills.includes(i) }, BattleManager: {}
    };
    ctx.window = ctx;
    vm.runInNewContext(plugin('RR_YanflyFollowUpSkill'), ctx);
    const user = Object.create(ctx.Game_Battler.prototype);
    user._actions = queued.slice();
    user.isStateAffected = (id) => id === 1;
    const action = new Game_Action(user);
    action.setSkill(1);
    action.setTarget(2);
    if (executing) ctx.BattleManager._action = action;
    return [user, action, ctx];
}

test('Follow-Up Skill: queued first after the action carried out, at its target; not twice', () => {
    const [user, action] = followUp('<follow up 2>');
    action.applyItemUserEffect({});
    assert.equal(user._actions.length, 1);
    assert.equal(user._actions[0]._item.id, 2);
    assert.equal(user._actions[0]._targetIndex, 2);
    action.applyItemUserEffect({});                  // a second target hit: the follow-up already waits
    assert.equal(user._actions.length, 1);
});

test('Follow-Up Skill: states, switches, the any-switch tag that is never checked, the chance', () => {
    assert.equal(followUp('<follow up 2>\n<follow up state: 2>')[0].rrMeetFollowUpRequirements({ id: 1, note: '<follow up 2>\n<follow up state: 2>' }, true), false);
    const run = (note) => { const [user, action] = followUp(note); action.applyItemUserEffect({}); return user._actions.length; };
    assert.equal(run('<follow up 2>\n<follow up any states: 2, 1>'), 1);
    assert.equal(run('<follow up 2>\n<follow up all switch: 5, 6>'), 0);
    assert.equal(run('<follow up 2>\n<follow up any switch: 6>'), 1);      // read, never checked
    assert.equal(run('<follow up 2: 0%>'), 0);
    assert.equal(run('<follow up eval>\nthis === this\n</follow up eval>\n<follow up 2>'), 1);
});

test('Follow-Up Skill: a counter queues after the user\'s next action, and nowhere with none', () => {
    const next = { _targetIndex: 4 };
    let [user, action] = followUp('<follow up 2>', { executing: false, queued: [next] });
    action.applyItemUserEffect({});
    assert.equal(user._actions[1]._targetIndex, 4);
    [user, action] = followUp('<follow up 2>', { executing: false });
    action.applyItemUserEffect({});
    assert.equal(user._actions.length, 0);
});

/** Steal Items with one enemy carrying `note`; returns the context. */
function steal(note, skillNote) {
    const items = [null, { id: 1, name: 'Potion', iconIndex: 10 }], weapons = [null, { id: 1, name: 'Knife', iconIndex: 20, params: [0, 0, 5, 0, 0, 0, 0, 0] }];
    const skills = [null, { id: 1, note: skillNote }];
    const enemyData = { id: 1, note };
    const log = [];
    // Game_Enemy < Game_Battler < Game_BattlerBase
    const BB = cls(), B = cls(), E = cls();
    Object.setPrototypeOf(B.prototype, BB.prototype);
    Object.setPrototypeOf(E.prototype, B.prototype);
    E.prototype.setup = function() {};
    const ctx = {
        PluginManager: { parameters: () => params('RR_YanflySteal').extract({ scripts: [STEAL, POPUP_ADDON] }) },
        Game_ActionResult: cls({ clearHitFlags() {} }), Game_BattlerBase: BB, Game_Battler: B, Game_Enemy: E, Game_Temp: cls(), Game_Action: cls({ applyItemUserEffect() {} }),
        Window_BattleLog: cls(), Window_Selectable: cls(), Scene_Battle: cls({ createAllWindows() {}, onEnemyOk() {} }),
        BattleManager: { applySubstitute: (t) => t, invokeNormalAction() {}, invokeMagicReflection() {} },
        DataManager: { isSkill: (o) => skills.includes(o), isItem: (o) => items.includes(o) },
        $dataEnemies: [null, enemyData], $dataItems: items, $dataWeapons: weapons, $dataArmors: [null], $dataSkills: skills,
        TextManager: { currencyUnit: 'G' }, $gameParty: { gained: [], gainItem(i, n) { this.gained.push(i.name + n); }, gainGold(n) { this.gained.push(n + 'G'); } },
        $gameTemp: null, log
    };
    ctx.window = ctx;
    vm.runInNewContext(plugin('RR_YanflySteal'), ctx);
    ctx.$gameTemp = new ctx.Game_Temp();
    const enemy = new ctx.Game_Enemy();
    Object.assign(enemy, { isActor: () => false, isEnemy: () => true, enemy: () => enemyData, name: () => 'Thug', states: () => [], addParam(i, v) { (this.lowered = this.lowered || [])[i] = v; } });
    enemy._result = { rrStolenItem: null };
    enemy.result = () => enemy._result;
    enemy.setup(1);
    const thief = new ctx.Game_Battler();
    Object.assign(thief, { isActor: () => true, luk: 0, actor: () => ({ note: '<steal rate: +10%>' }), currentClass: () => ({ note: '<steal item rate: +5%>' }), equips: () => [], states: () => [], name: () => 'Jay' });
    ctx.BattleManager._subject = thief;
    ctx.BattleManager._logWindow = { push: (...a) => log.push(a), rrAddPopLine() {} };
    Object.assign(ctx, { enemy, thief, skill: skills[1] });
    return ctx;
}

test('Steal Items: the chance adds the thief, the skill and the enemy, between the limits', () => {
    const ctx = steal('<steal I1: 50%>\n<steal G30: 20%>\n<steal rate: -5%>', '<steal>');
    const [potion, gold] = ctx.enemy.rrStealableItems();
    assert.equal(ctx.enemy.rrCalcStealRatio(ctx.thief, ctx.skill, potion).toFixed(4), (0.5 + 0.1 + 0.05 - 0.05).toFixed(4));
    assert.equal(ctx.enemy.rrCalcStealRatio(ctx.thief, ctx.skill, gold).toFixed(4), (0.2 + 0.1 - 0.05).toFixed(4));
    const high = steal('<steal I1: 150%>', '<steal>');
    assert.equal(high.enemy.rrCalcStealRatio(high.thief, high.skill, high.enemy.rrStealableItems()[0]), 0.9999);
});

test('Steal Items: skill notes read as the original did; "<steal: +x%>" is not a steal', () => {
    const notesOf = (n) => { const c = steal('', n); return plain(c.RRYanflySteal.notes(c.skill)); };
    assert.deepEqual(notesOf('<steal>'), { type: 'steal', rate: [0, 0, 0, 0, 0], kinds: [1, 2, 3, 4] });
    assert.deepEqual(notesOf('<snatch weapon: +20%>\n<snatch gold>'), { type: 'snatch', rate: [0, 0, 0.2, 0, 0], kinds: [2, 4] });
    assert.equal(notesOf('<steal: +10%>').type, null);
    assert.equal(notesOf('<whole action>\n<steal item>').type, 'steal');
});

test('Steal Items: a steal takes the thing, lowers a weapon\'s stats, logs and pops "Nothing to steal" after the last', () => {
    const ctx = steal('<steal W1: 99%>', '<steal>');
    const real = Math.random;
    try {
        Math.random = () => 0.5;
        ctx.enemy.rrExecuteStealEffect(ctx.thief, ctx.skill);
    } finally { Math.random = real; }
    assert.equal(ctx.enemy.result().rrStolenItem.dataId, 1);
    assert.equal(ctx.enemy.lowered[2], -5);
    ctx.BattleManager.rrApplyStealResults(ctx.enemy, ctx.skill);
    assert.deepEqual(plain(ctx.$gameParty.gained), ['Knife1']);
    assert.deepEqual(ctx.log.map(a => a[0]), ['rrPlaySe', 'addText', 'wait', 'wait', 'wait', 'rrBackOne', 'rrAddPopLine', 'wait']);
    assert.equal(ctx.log[1][1], 'Jay steals \\c[17]\\i[20]Knife\\c[0] from Thug!');
    assert.equal(ctx.log[6][1], 'Nothing to steal');
    assert.equal(ctx.enemy.rrStealableItems().length, 0);
});

test('Steal Items: a snatch tries only the thing picked for the thief', () => {
    const ctx = steal('<steal I1: 99%>\n<steal G30: 99%>', '<snatch>');
    const gold = ctx.enemy.rrStealableItems()[1];
    ctx.$gameTemp.rrSetSnatchTarget(ctx.thief, gold);
    const real = Math.random;
    try { Math.random = () => 0.5; ctx.enemy.rrExecuteStealEffect(ctx.thief, ctx.skill); } finally { Math.random = real; }
    assert.equal(ctx.enemy.result().rrStolenItem, gold);
    ctx.BattleManager.rrApplyStealResults(ctx.enemy, ctx.skill);
    assert.deepEqual(plain(ctx.$gameParty.gained), ['30G']);
    assert.deepEqual(plain(ctx.log.find(a => a[0] === 'rrAddPopArray')), ['rrAddPopArray', 3777, 'Stole 30 G']);
});

test('Skill Display: the line keeps the last text or item; empty and nameless ones are dropped', () => {
    const drawn = [];
    const W = cls({ initialize() {}, clear() {} });
    const ctx = {
        PluginManager: { parameters: () => params('RR_NeonSkillDisplay').extract({ scripts: [DISPLAY] }) },
        Scene_Battle: cls(), Window_BattleLog: W, Rectangle: function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); }
    };
    vm.runInNewContext(plugin('RR_NeonSkillDisplay'), ctx);
    const log = Object.create(W.prototype);
    Object.assign(log, { width: 640, padding: 12, contents: { width: 616, clear() {} }, contentsBack: { clear() {}, fillRect: (...a) => drawn.push(['fill', ...a]), gradientFillRect() {} },
        lineHeight: () => 24, textWidth: (t) => t.length * 10, drawText: (t) => drawn.push(['text', t]), drawIcon() {}, resetTextColor() {}, rrAceDrawItemName: (i) => drawn.push(['item', i.name]) });
    log.rrAddPopLine('');
    log.rrAddPopLine({ name: '' });
    assert.equal(log.rrPopWind().length, 0);
    log.rrAddPopLine('Steal failed');
    assert.deepEqual(drawn.filter(d => d[0] === 'text'), [['text', 'Steal failed']]);
    // The band is as wide as the text and centred on the whole window.
    assert.deepEqual(drawn.find(d => d[0] === 'fill').slice(1, 5), [(640 - 120) / 2 - 12, 0, 120, 24]);
    log.rrAddPopLine({ name: 'Mugging' });
    assert.deepEqual(drawn.slice(-1), [['item', 'Mugging']]);
    const pushed = [];
    log.push = (...a) => pushed.push(a);
    log.displaySubstitute({}, {});                  // SUB = nil: no line
    assert.deepEqual(pushed.map(a => a[0]), ['performSubstitute']);
});

test('Elemental Popups: the element of the skill, or the attack element that hurts most; unknown ones stay HP_DMG', () => {
    const made = [];
    const BB = cls({ rrCreatePopup(value, rule) { made.push([value, rule]); } });
    const ctx = {
        PluginManager: { parameters: () => params('RR_YanflyElementalPopups').extract({ scripts: [ELEMENTS] }) },
        Game_BattlerBase: BB, Game_Battler: cls(), Game_Action: cls({ apply(target) { target.rrCreatePopup(10, 'HP_DMG'); target.rrCreatePopup(3, 'MP_DMG'); } }),
        Scene_Boot: cls({ start() {} })
    };
    ctx.window = ctx;
    ctx.Game_Battler.prototype = Object.assign(Object.create(BB.prototype), ctx.Game_Battler.prototype);
    vm.runInNewContext(plugin('RR_YanflyElementalPopups'), ctx);
    const target = Object.create(ctx.Game_Battler.prototype);
    Object.assign(target, { _result: {}, result() { return this._result; }, elementRate: (id) => ({ 1: 1, 4: 2 })[id] || 1, elementsMaxRate: () => 2 });
    const user = { attackElements: () => [1, 4] };
    const action = Object.assign(Object.create(ctx.Game_Action.prototype), { subject: () => user, item: () => ({ damage: { elementId: -1 } }) });
    action.apply(target);
    assert.deepEqual(made, [[10, 'ELEMENT_4'], [3, 'MP_DMG']]);
    assert.equal(target.result().rrElementPopupRule, 'ELEMENT_4');
    assert.equal(target.rrElementPopupTag(user, { damage: { elementId: 3 } }), 'HP_DMG');
    assert.equal(target.rrElementPopupTag(user, { damage: { elementId: 1 } }), 'ELEMENT_1');
});
