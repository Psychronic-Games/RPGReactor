'use strict';
// Ports of Dreamwalker's state and battle-effect scripts: Yanfly's Buff & State Manager, State Animations and
// Anti-Fail, Neon Black's State Graphics, Hime's State Rate Popups and Pre-Skill Effects, TheoAllen's State
// Damage Using Skill, Yami's Skill Effect Tags and "Battler Shakes when hit".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
// Arrays made inside the vm are another realm's: copied before a deep comparison.
const arr = (v) => (Array.isArray(v) ? Array.from(v, arr) : v);
const same = (actual, expected, message) => assert.deepEqual(arr(actual), expected, message);
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// The scripts' own opening lines (and settings), as the game carries them.
const SCRIPTS = {
    yeaBuffStateManager: `$imported = {} if $imported.nil?
$imported["YEA-Buff&StateManager"] = true
module YEA
  module BUFF_STATE_MANAGER
    SHOW_REMAINING_TURNS = true     # Show the turns remaining?
    TURNS_REMAINING_SIZE = 18       # Font size used for turns remaining.
    TURNS_REMAINING_Y    = -4       # Adjusts location of the text.
    DEFAULT_BUFF_LIMIT = 5     # Normal times you can buff a stat. Default: 2
    MAXIMUM_BUFF_LIMIT = 5     # Maximum times you can buff a stat. Default: 2
    BUFF_BOOST_FORMULA = "buff_level(param_id) * 0.25 + 1.0"
    REAPPLY_STATE_RULES = 2
  end # BUFF_STATE_MANAGER
end # YEA`,
    neonStateGraphics: `$imported ||= {}                                                              ##
$imported["Graphics_States"] = 1.3                                            ##`,
    yeaStateAnimations: `$imported = {} if $imported.nil?
$imported["YEA-StateAnimations"] = true
module YEA
  module STATE_ANIMATION
    PLAY_SOUND = false      # Play sounds for state animations?
    PLAY_FLASH = true      # Use screen flash for state animations?
    PLAY_ACTOR = true       # Play animations on the actor?
    ACTOR_ZOOM = 1       # Zoom level for animations on actors.
  end # STATE_ANIMATION
end # YEA`,
    himeStateRatePopups: `$imported = {} if $imported.nil?
$imported["TH_StateRatePopups"] = true`,
    theoStateSkillDamage: `($imported ||= {})[:Theo_StateSkillDamage] = true`,
    himePreSkillEffects: `$imported = {} if $imported.nil?
$imported[:TH_PreSkillEffects] = true`,
    yamiSkillEffectTags: `$imported = {} if $imported.nil?
$imported["BattleSymphony-SkillEffect"] = true`,
    yeaAntiFail: `$imported = {} if $imported.nil?
$imported["YEA-AntiFailMessage"] = true`,
    battlerShake: `class Sprite_Battler
  Shake_X_Max = 30      # Maximum X displacement
  Shake_Y_Max = 0     # Maximum Y displacement
  Shake_Diminish = true # Gradually lose the power overtime?

  alias blink2shake_init initialize
  alias blink2shake_start start_effect
  def update_blink
  end
end`
};
const BATTLE_ENGINE = `module YEA
  module BATTLE
    POPUP_SETTINGS ={
      :offset     => -5,         # Height offset of a popup.
      :resistant  => "RESISTS",    # Appears if foe is resistant to element.
      :immune     => "NO EFFECT",    # Appears if foe is immune to element.
    } # Do not remove this.
  end
end`;

test('each script is detected by its own family only, and no event calls are claimed', () => {
    for (const [key, script] of Object.entries(SCRIPTS)) {
        const found = C.scriptFamilies([script]);
        assert.ok(found.has(key), key);
        for (const other of Object.keys(SCRIPTS)) if (other !== key) assert.ok(!found.has(other), `${key} also matched ${other}`);
        const family = C.FAMILIES.find(f => f.key === key);
        assert.ok(fs.existsSync(path.join(legacy, 'plugins', family.plugin + '.js')), family.plugin);
        assert.ok(!family.event && !family.route);
    }
});

test('settings are read from the game\'s copies', () => {
    const scripts = Object.values(SCRIPTS).concat([BATTLE_ENGINE, 'Font.default_size = 18']);
    const constants = C.scriptConstants(scripts);
    same(params('RR_YanflyBuffStateManager').extract({ scripts, constants }), {
        showTurns: 'true', turnsSize: '18', turnsY: '-4', defaultBuffLimit: '5', maximumBuffLimit: '5',
        buffFormula: 'this.rrBuffLevel(paramId) * 0.25 + 1.0', reapplyRule: '2', rgssFontSize: '18'
    });
    same(params('RR_YanflyStateAnimations').extract({ scripts, constants }), { playSound: 'false', playFlash: 'true', playActor: 'true', actorZoom: '1', rate: '4' });
    const withCore = scripts.concat(['module YEA\n  module CORE\n    ANIMATION_RATE = 1\n  end\nend']);
    assert.equal(params('RR_YanflyStateAnimations').extract({ scripts: withCore, constants: C.scriptConstants(withCore) }).rate, '1');
    const zoomed = [SCRIPTS.yeaStateAnimations.replace('ACTOR_ZOOM = 1 ', 'ACTOR_ZOOM = 0.75 ')];
    assert.equal(params('RR_YanflyStateAnimations').extract({ scripts: zoomed, constants: C.scriptConstants(zoomed) }).actorZoom, '0.75');
    same(params('RR_HimeStateRatePopups').extract({ scripts, constants }), { immuneText: 'NO EFFECT', resistText: 'RESISTS' });
    same(params('RR_BattlerShake').extract({ scripts, constants }), { shakeX: '30', shakeY: '0', diminish: 'true' });
});

//-----------------------------------------------------------------------------
// A small battle world: the parts of MZ's battlers the ports reach
//-----------------------------------------------------------------------------
function world({ random = () => 0, states = [], skills = [], items = [] } = {}) {
    const ctx = { console };
    ctx.Math = Object.create(Math);
    ctx.Math.random = random;
    ctx.Math.randomInt = (n) => Math.floor(ctx.Math.random() * n);
    ctx.$dataStates = states;
    ctx.$dataSkills = skills;
    ctx.$dataItems = items;
    ctx.$dataAnimations = [];
    ctx.$gameParty = { inBattle: () => true, battleMembers: () => ctx.party || [] };
    ctx.$gameTroop = { members: () => ctx.troop || [] };
    ctx.$gameTemp = { reserved: [], reserveCommonEvent(id) { this.reserved.push(id); }, isCommonEventReserved() { return this.reserved.length > 0; }, requestAnimation() {} };
    ctx.$gamePlayer = { refreshes: 0, refresh() { this.refreshes++; } };
    ctx.PluginManager = { parameters: (name) => ctx.params[name] || {} };
    ctx.params = {};
    vm.createContext(ctx);
    vm.runInContext(`
        function Game_ActionResult() { this.clear(); }
        Game_ActionResult.prototype.clear = function() { this.used = false; this.success = false; this.addedStates = []; this.removedStates = []; this.addedBuffs = []; this.addedDebuffs = []; this.hpDamage = 0; };
        Game_ActionResult.prototype.isHit = function() { return true; };
        Game_ActionResult.prototype.isStateAdded = function(id) { return this.addedStates.includes(id); };
        Game_ActionResult.prototype.pushAddedState = function(id) { if (!this.isStateAdded(id)) this.addedStates.push(id); };
        Game_ActionResult.prototype.pushRemovedState = function(id) { this.removedStates.push(id); };
        Game_ActionResult.prototype.pushAddedBuff = function(id) { this.addedBuffs.push(id); };
        Game_ActionResult.prototype.pushAddedDebuff = function(id) { this.addedDebuffs.push(id); };

        function Game_BattlerBase() { this._hp = 100; this._states = []; this._stateTurns = {}; this._buffs = [0, 0, 0, 0, 0, 0, 0, 0]; this._buffTurns = [0, 0, 0, 0, 0, 0, 0, 0]; this._result = new Game_ActionResult(); this.rates = {}; }
        Game_BattlerBase.ICON_BUFF_START = 2880;
        Game_BattlerBase.ICON_DEBUFF_START = 2896;
        Object.assign(Game_BattlerBase.prototype, {
            isActor() { return false; }, isEnemy() { return false; }, isAlive() { return this._hp > 0; }, isDead() { return !this.isAlive(); },
            states() { return this._states.map(id => $dataStates[id]); }, isStateAffected(id) { return this._states.includes(id); },
            eraseState(id) { this._states = this._states.filter(s => s !== id); delete this._stateTurns[id]; },
            clearStates() { this._states = []; this._stateTurns = {}; },
            addNewState(id) { this._states.push(id); this._states.sort((a, b) => ($dataStates[b].priority || 0) - ($dataStates[a].priority || 0)); },
            resetStateCounts(id) { const s = $dataStates[id]; this._stateTurns[id] = s.minTurns + Math.randomInt(1 + Math.max(s.maxTurns - s.minTurns, 0)); },
            refresh() {}, stateRate(id) { return this.rates[id] === undefined ? 1 : this.rates[id]; },
            isStateResist() { return false; }, isStateRestrict() { return false; },
            paramBuffRate(id) { return this._buffs[id] * 0.25 + 1; },
            isBuffAffected(id) { return this._buffs[id] > 0; }, isDebuffAffected(id) { return this._buffs[id] < 0; },
            isMaxBuffAffected(id) { return this._buffs[id] === 2; }, isMaxDebuffAffected(id) { return this._buffs[id] === -2; },
            increaseBuff(id) { if (!this.isMaxBuffAffected(id)) this._buffs[id]++; }, decreaseBuff(id) { if (!this.isMaxDebuffAffected(id)) this._buffs[id]--; },
            eraseBuff(id) { this._buffs[id] = 0; this._buffTurns[id] = 0; },
            overwriteBuffTurns(id, turns) { if (this._buffTurns[id] < turns) this._buffTurns[id] = turns; },
            buffIconIndex(level, id) { return level > 0 ? Game_BattlerBase.ICON_BUFF_START + (level - 1) * 8 + id : level < 0 ? Game_BattlerBase.ICON_DEBUFF_START + (-level - 1) * 8 + id : 0; },
            result() { return this._result; }, clearResult() { this._result.clear(); }
        });
        function Game_Battler() { Game_BattlerBase.call(this); }
        Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
        Game_Battler.prototype.constructor = Game_Battler;
        Object.assign(Game_Battler.prototype, {
            isStateAddable(id) { return this.isAlive() && !!$dataStates[id] && !this.isStateResist(id); },
            addState(id) { if (this.isStateAddable(id)) { if (!this.isStateAffected(id)) { this.addNewState(id); this.refresh(); } this.resetStateCounts(id); this._result.pushAddedState(id); } },
            removeState(id) { if (this.isStateAffected(id)) { this.eraseState(id); this.refresh(); this._result.pushRemovedState(id); } },
            removeBuff(id) { this.eraseBuff(id); },
            onTurnEnd() { this.clearResult(); this.turnsEnded = (this.turnsEnded || 0) + 1; },
            attackStates() { return this._attackStates || []; }
        });
        function Game_Actor(id) { Game_Battler.call(this); this._actorId = id; this._equips = []; this._name = 'Hero'; this._faceName = 'hero'; this._faceIndex = 1; this._characterName = 'walker'; this._characterIndex = 2; }
        Game_Actor.prototype = Object.create(Game_Battler.prototype);
        Game_Actor.prototype.constructor = Game_Actor;
        Object.assign(Game_Actor.prototype, {
            isActor() { return true; }, actor() { return this._data || { note: '' }; }, currentClass() { return this._class || { note: '' }; }, equips() { return this._equips; },
            name() { return this._name; }, faceName() { return this._faceName; }, faceIndex() { return this._faceIndex; },
            characterName() { return this._characterName; }, characterIndex() { return this._characterIndex; }, battlerName() { return 'hero_sv'; }
        });
        function Game_Enemy(id) { Game_Battler.call(this); this._enemyId = id; }
        Game_Enemy.prototype = Object.create(Game_Battler.prototype);
        Game_Enemy.prototype.constructor = Game_Enemy;
        Object.assign(Game_Enemy.prototype, {
            isEnemy() { return true; }, enemy() { return this._data || { note: '' }; },
            battlerName() { return 'slime'; }, battlerHue() { return 0; }, originalName() { return 'Slime'; },
            name() { return this.originalName() + (this._plural ? this._letter : ''); }
        });

        function Game_Action(subject) { this._subject = subject; this._item = null; }
        Game_Action.EFFECT_COMMON_EVENT = 44;
        Object.assign(Game_Action.prototype, {
            subject() { return this._subject; }, item() { return this._item; }, setSkill(id) { this._item = $dataSkills[id]; }, setItem(id) { this._item = $dataItems[id]; },
            prepare() { this.prepared = (this.prepared || 0) + 1; }, isValid() { return true; },
            apply(target) { target.result().clear(); target.result().used = true; this.applyItemUserEffect(target); target.appliedBy = (target.appliedBy || []).concat([[this._subject, this._item && this._item.id]]); },
            applyItemUserEffect() {},
            itemEffectAddNormalState(target, effect) { if (Math.random() < effect.value1) { target.addState(effect.dataId); target.result().success = true; } },
            itemEffectAddAttackState(target, effect) { for (const id of this.subject().attackStates()) { if (Math.random() < effect.value1) { target.addState(id); target.result().success = true; } } },
            makeDamageValue() { return this._value; }
        });
        function Game_Interpreter() {}
        Game_Interpreter.prototype.command313 = function() { return true; };
        var DataManager = { onLoad() {} };
        var BattleManager = { endAction() { this.ended = (this.ended || 0) + 1; }, processTurn() { this.processed = (this.processed || 0) + 1; this._subject.removeCurrentAction(); } };
        function Scene_Battle() {}
        var SceneManager = { _scene: null };

        function Sprite() { this.x = 0; this.y = 0; this.opacity = 255; this.scale = { x: 1, y: 1 }; this.anchor = { x: 0, y: 0 }; this.children = []; this.visible = true; this.parent = null; this.height = 0; }
        Object.assign(Sprite.prototype, {
            addChild(c) { this.children.push(c); c.parent = this; return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; },
            update() {}, setHue(h) { this.hue = h; }, setFrame(x, y, w, h) { this.frame = [x, y, w, h]; },
            hide() { this.hidden = true; }, show() { this.hidden = false; }, setBlendColor(c) { this.blendColor = c.slice(); }
        });
        function Sprite_Battler() { Sprite.call(this); this._battler = null; }
        Sprite_Battler.prototype = Object.create(Sprite.prototype);
        Sprite_Battler.prototype.constructor = Sprite_Battler;
        Sprite_Battler.prototype.mainSprite = function() { return this; };
        Sprite_Battler.prototype.update = function() {};
        function Sprite_Enemy(battler) { Sprite_Battler.call(this); this._battler = battler; this._enemy = battler; this._effectDuration = 0; this._appeared = false; }
        Sprite_Enemy.prototype = Object.create(Sprite_Battler.prototype);
        Sprite_Enemy.prototype.constructor = Sprite_Enemy;
        Object.assign(Sprite_Enemy.prototype, {
            update() { this.x = 100; this.y = 200; if (this._effectDuration > 0) { this._effectDuration--; this.updateBlink(); } },
            startEffect(type) { if (type === 'blink') this._effectDuration = 20; },
            updateBlink() { this.opacity = this._effectDuration % 10 < 5 ? 255 : 0; },
            initVisibility() { this._appeared = this._enemy.isAlive(); this.visibilityRuns = (this.visibilityRuns || 0) + 1; }
        });
        function Sprite_Actor() { Sprite_Battler.call(this); }
        Sprite_Actor.prototype = Object.create(Sprite_Battler.prototype);
        Sprite_Actor.prototype.constructor = Sprite_Actor;
        var Graphics = { frameCount: 0, boxWidth: 640, boxHeight: 480 };
        var ImageManager = { loadAnimation: (name) => ({ name }) };
        var Window_Base = function() {};
        var Window_BattleLog = function() {};
        Window_BattleLog.prototype.push = function(...a) { (this.pushed || (this.pushed = [])).push(a); };
        Window_BattleLog.prototype.displayActionResults = function(subject, target) { this.push('results', subject, target); };
        var JsonEx = { makeDeepCopy: (o) => JSON.parse(JSON.stringify(o)) };
    `, ctx);
    ctx.load = (name, p = {}) => { ctx.params[name] = p; vm.runInContext(plugin(name), ctx); };
    ctx.run = (js) => vm.runInContext(js, ctx);
    return ctx;
}

//-----------------------------------------------------------------------------
// Buff & State Manager
//-----------------------------------------------------------------------------
const BSM = { defaultBuffLimit: '5', maximumBuffLimit: '5', buffFormula: 'this.rrBuffLevel(paramId) * 0.25 + 1.0', reapplyRule: '2' };

test('Buff & State Manager: buffs climb to the limit the notes allow, and a buff meeting a debuff clears it', () => {
    const ctx = world({ states: [null, { id: 1, note: '<max buff atk: -2>\n<max debuff all: +3>', priority: 1, minTurns: 1, maxTurns: 1, autoRemovalTiming: 2 }] });
    ctx.load('RR_YanflyBuffStateManager', BSM);
    const enemy = ctx.run('new Game_Enemy(1)');
    for (let i = 0; i < 7; i++) enemy.addBuff(2, 3);
    assert.equal(enemy._buffs[2], 5, 'default limit 5');
    assert.equal(enemy.paramBuffRate(2), 2.25);
    assert.equal(enemy.buffIconIndex(5, 2), 2880 + 8 + 2, 'buff icons stop at the second row');
    assert.equal(enemy.buffIconIndex(-1, 3), 2896 + 3);
    assert.equal(enemy.buffIconIndex(-3, 3), 2896 + 16 + 3, 'three levels down points two rows past, as the original did');
    enemy._states = [1];
    assert.equal(enemy.rrMaxBuffLimit(2), 3);
    assert.equal(enemy.rrBuffLevel(2), 3, 'a level above the lowered limit counts as the limit');
    assert.equal(enemy.isMaxBuffAffected(2), false, 'and it is not "at" the limit');
    assert.equal(enemy.rrMaxDebuffLimit(0), 5, 'the maximum limit caps the notes');
    enemy._states = [];
    enemy._buffs[4] = -2;
    enemy.addBuff(4, 5);
    assert.equal(enemy._buffs[4], 0, 'a buff on a debuffed stat clears it');
    assert.equal(enemy._buffTurns[4], 5);
    enemy._hp = 0;
    enemy.addDebuff(4, 5);
    assert.equal(enemy._buffs[4], 0, 'the dead take no buffs');
});

test('Buff & State Manager: a reapplied state keeps, resets or adds its turns by its rule; notes lengthen it', () => {
    const states = [null,
        { id: 1, note: '<reapply ignore>', priority: 1, minTurns: 3, maxTurns: 3, autoRemovalTiming: 2 },
        { id: 2, note: '<reapply reset>', priority: 1, minTurns: 3, maxTurns: 3, autoRemovalTiming: 2 },
        { id: 3, note: '', priority: 1, minTurns: 3, maxTurns: 3, autoRemovalTiming: 2 },
        { id: 4, note: '<state 3 turns: +2>', priority: 1, minTurns: 9, maxTurns: 9, autoRemovalTiming: 0 }];
    const ctx = world({ states });
    ctx.load('RR_YanflyBuffStateManager', BSM);
    const enemy = ctx.run('new Game_Enemy(1)');
    for (const id of [1, 2, 3]) enemy.addState(id);
    same([enemy._stateTurns[1], enemy._stateTurns[2], enemy._stateTurns[3]], [undefined, 3, 3], 'a new state under "ignore" gets no count at all');
    enemy._stateTurns = { 1: 1, 2: 1, 3: 1 };
    enemy._result.clear();
    for (const id of [1, 2, 3]) enemy.addState(id);
    same([enemy._stateTurns[1], enemy._stateTurns[2], enemy._stateTurns[3]], [1, 3, 4]);
    same(enemy._result.addedStates, [2, 3], '"ignore" reports nothing');
    enemy._data = { note: '<state 3 turns: -10>' };
    enemy.addState(4);
    enemy._stateTurns[3] = 0;
    enemy.addState(3);
    assert.equal(enemy._stateTurns[3], 0, '3 + 2 (state 4) - 10 (the enemy), never below 0');
});

test('Buff & State Manager: a skill\'s turn notes change turns left on its target in battle', () => {
    const states = [null, { id: 1, note: '', priority: 1, minTurns: 2, maxTurns: 2, autoRemovalTiming: 2 }, { id: 2, note: '', priority: 1, minTurns: 2, maxTurns: 2, autoRemovalTiming: 0 }];
    const skills = [null, { id: 1, scope: 1, note: '<state 1 turns: +2>\n<state 2 turns: -5>\n<buff atk turns: -9>' }, { id: 2, scope: 1, note: '<state 1 turns: -4>' }];
    const ctx = world({ states, skills });
    ctx.load('RR_YanflyBuffStateManager', BSM);
    const [user, target] = [ctx.run('new Game_Actor(1)'), ctx.run('new Game_Enemy(1)')];
    target.addState(1);
    target.addState(2);
    target._buffs[2] = 1;
    target._buffTurns[2] = 3;
    const action = ctx.run('(u) => { const a = new Game_Action(u); a.setSkill(1); return a; }')(user);
    action.applyItemUserEffect(target);
    assert.equal(target._stateTurns[1], 4);
    assert.equal(target._stateTurns[2], 2, 'a state that does not count down is left alone');
    assert.equal(target._buffs[2], 1, 'buff turns stop at 0, so the buff stays');
    assert.equal(target._buffTurns[2], 0);
    assert.equal(target.result().success, true);
    action.setSkill(2);
    action.applyItemUserEffect(target);
    assert.ok(!target.isStateAffected(1), 'run down to 0: removed');
});

//-----------------------------------------------------------------------------
// State Graphics
//-----------------------------------------------------------------------------
test('State Graphics: the highest-priority state with a change wins; actor lines before common ones; the walker follows', () => {
    const states = [null,
        { id: 1, priority: 50, note: 'face gfx["infiltrator" 0]\ncharacter gfx["CLF" 1]' },
        { id: 2, priority: 10, note: 'actor character gfx["cop" 3 1, 2]\ncharacter gfx["civilian" 2]\nname change["Ghost"]' },
        { id: 3, priority: 5, note: 'enemy battler gfx["ghoul" 120 7]\nbattler gfx["shadow" 0]\nenemy name change["Wraith" 7]' }];
    const ctx = world({ states });
    ctx.load('RR_NeonStateGraphics');
    const actor = ctx.run('new Game_Actor(1)');
    same([actor.characterName(), actor.characterIndex(), actor.faceName(), actor.name()], ['walker', 2, 'hero', 'Hero']);
    actor.addState(2);
    same([actor.characterName(), actor.characterIndex(), actor.name()], ['cop', 3, 'Ghost']);
    actor.addState(1);
    same([actor.characterName(), actor.characterIndex(), actor.faceName(), actor.faceIndex()], ['CLF', 1, 'infiltrator', 0], 'index 0 is kept');
    const other = ctx.run('new Game_Actor(5)');
    other.addState(2);
    assert.equal(other.characterName(), 'civilian');
    const enemy = ctx.run('new Game_Enemy(7)');
    enemy.addState(3);
    same([enemy.battlerName(), enemy.battlerHue(), enemy.name()], ['ghoul', 120, 'Wraith']);
    enemy._states = [];
    enemy._hp = 0;
    assert.equal(enemy.battlerName(), 'ghoul', 'kept through the collapse');
    const plain = ctx.run('new Game_Enemy(8)');
    plain.addState(3);
    same([plain.battlerName(), plain.name()], ['shadow', 'Slime']);
    ctx.run('new Game_Action(null)').apply(actor);
    ctx.run('new Game_Interpreter()').command313([]);
    assert.equal(ctx.$gamePlayer.refreshes, 2);
});

test('State Graphics: a changed graphic does not hide a battler that is still to appear', () => {
    const ctx = world();
    ctx.load('RR_NeonStateGraphics');
    const sprite = ctx.run('new Sprite_Enemy(new Game_Enemy(1))');
    sprite.initVisibility();
    assert.equal(sprite.visibilityRuns, 1);
    sprite._appeared = false;
    sprite.initVisibility();
    assert.equal(sprite.visibilityRuns, 1, 'alive and not shown yet: left alone');
    sprite._enemy._hp = 0;
    sprite.initVisibility();
    assert.equal(sprite.visibilityRuns, 2);
});

//-----------------------------------------------------------------------------
// State Animations
//-----------------------------------------------------------------------------
test('State Animations: the highest-priority state\'s animation loops over the battler, last frame shown twice', () => {
    const states = [null, { id: 1, priority: 10, note: '<state ani: 5>' }, { id: 2, priority: 90, note: 'no animation' }, { id: 3, priority: 50, note: '<state ani: 6>' }];
    const ctx = world({ states });
    const cell = (pattern) => [pattern, 10, -20, 100, 0, 0, 255, 1];
    ctx.$dataAnimations[5] = { id: 5, position: 1, animation1Name: 'Sleep', animation1Hue: 0, animation2Name: '', animation2Hue: 0, frames: [[cell(0)], [cell(1)], [cell(2)]], timings: [{ frame: 1, flashScope: 3, flashDuration: 2, flashColor: [0, 0, 0, 0] }] };
    ctx.$dataAnimations[6] = { id: 6, position: 0, animation1Name: 'Fear', animation1Hue: 40, animation2Name: '', animation2Hue: 0, frames: [[cell(3)]], timings: [] };
    ctx.load('RR_YanflyStateAnimations', { rate: '1', actorZoom: '1', playActor: 'true' });
    const enemy = ctx.run('new Game_Enemy(1)');
    enemy.addState(1);
    enemy.addState(2);
    assert.equal(enemy.rrStateAnimationId(), 5);
    const field = ctx.run('new Sprite()');
    const sprite = field.addChild(ctx.run('(e) => new Sprite_Enemy(e)')(enemy));
    sprite.height = 100;
    const frames = [], hidden = [];
    for (let i = 0; i < 8; i++) {
        sprite.update();
        const shown = sprite._rrStateAniLayer.rrCells[0];
        frames.push(shown.frame[0] / 192);
        hidden.push(!!sprite.hidden);
        if (i === 0) same([shown.x, shown.y, shown.blendMode, sprite._rrStateAniLayer.parent === field], [110, 130, 1, true], 'centred on the sprite, drawn beside it');
    }
    same(frames, [0, 1, 2, 2, 0, 1, 2, 2]);
    same(hidden, [false, true, false, false, false, true, false, false], 'frame 1 hides the target for 2 frames, every loop');
    enemy.addState(3);
    sprite.update();
    assert.equal(sprite._rrStateAni.id, 6, 'a higher-priority state takes over');
    assert.equal(sprite._rrStateAniLayer.rrCells[0].hue, 40);
    enemy.removeState(3);
    enemy.removeState(1);
    sprite.update();
    assert.equal(sprite._rrStateAni, null);
    assert.equal(field.children.length, 1, 'the layer is gone');
});

//-----------------------------------------------------------------------------
// State Rate Popups
//-----------------------------------------------------------------------------
test('State Rate Popups: a state that did not land on a resistant or immune target pops up, with its icon', () => {
    const states = [null, { id: 1, priority: 1, iconIndex: 12, note: '', minTurns: 1, maxTurns: 1 }, { id: 2, priority: 1, iconIndex: 0, note: '', minTurns: 1, maxTurns: 1 }];
    const ctx = world({ states, random: () => 0.99 });
    ctx.load('RR_HimeStateRatePopups', { immuneText: 'IMMUNE', resistText: 'RESIST' });
    const popups = [];
    ctx.Game_BattlerBase.prototype.rrCreatePopup = function(...a) { popups.push(a); };
    const target = ctx.run('new Game_Enemy(1)');
    const action = ctx.run('new Game_Action(new Game_Actor(1))');
    target.rates = { 1: 0.5, 2: 0 };
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 0.5 });
    target.rates[1] = 0;
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 0.5 });
    action.itemEffectAddNormalState(target, { dataId: 2, value1: 0.5 });
    target.rates[1] = 1;
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 0.5 });
    same(popups, [['RESIST', 'ADDSTATE', ['state', 12]], ['IMMUNE', 'ADDSTATE', ['state', 12]]]);
    ctx.Math.random = () => 0;
    target.rates[1] = 0.5;
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 1 });
    assert.equal(popups.length, 2, 'landed: no popup');
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 1 });
    assert.equal(popups.length, 3, 'already there: a popup');
    delete ctx.Game_BattlerBase.prototype.rrCreatePopup;
    target.rates[1] = 0;
    target.removeState(1);
    ctx.Math.random = () => 0.99;
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 1 });   // without the Battle Engine's popups, nothing
});

//-----------------------------------------------------------------------------
// State Damage Using Skill
//-----------------------------------------------------------------------------
test('State Damage Using Skill: at a turn\'s end the state\'s skill hurts the battler, used by who put the state on', () => {
    const states = [null, { id: 1, priority: 1, note: '<skill damage: 7>', minTurns: 3, maxTurns: 3 }, { id: 2, priority: 1, note: '<Skill_Damage:8>', minTurns: 3, maxTurns: 3 }];
    const skills = []; skills[7] = { id: 7, animationId: 0 }; skills[8] = { id: 8, animationId: 3 };
    const ctx = world({ states, skills });
    ctx.load('RR_TheoStateSkillDamage');
    const log = ctx.run('new Window_BattleLog()');
    ctx.BattleManager._logWindow = log;
    const [user, target] = [ctx.run('new Game_Enemy(2)'), ctx.run('new Game_Actor(1)')];
    const action = ctx.run('(u) => new Game_Action(u)')(user);
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 1 });
    target.addState(2);   // an event's state: nobody to use the skill
    target.onTurnEnd();
    same(target.appliedBy, [[user, 7]]);
    assert.equal(target.turnsEnded, 1, 'then the turn\'s own end');
    same(log.pushed.map(p => p[0]), ['rrPopupResult', 'results', 'rrWaitFrames']);
    assert.equal(log.pushed[2][1], 15);
    target.removeState(1);
    target.onTurnEnd();
    assert.equal(target.appliedBy.length, 1, 'a removed state forgets its user');
    target._hp = 0;
    action.itemEffectAddNormalState(target, { dataId: 1, value1: 1 });
    target.onTurnEnd();
    assert.equal(target.appliedBy.length, 1, 'the dead take none');
});

//-----------------------------------------------------------------------------
// Pre-Skill Effects
//-----------------------------------------------------------------------------
test('Pre-Skill Effects: tagged effects leave the list and run first; the action waits for their common event', () => {
    const skills = [null, { id: 1, note: '<pre skill effect: 2>', effects: [{ code: 21, dataId: 0 }, { code: 44, dataId: 20 }] },
        { id: 2, note: '<Pre-Skill Effect: 1>\n<pre_skill_effect: 3>', effects: [{ code: 44, dataId: 41 }, { code: 13, dataId: 0 }, { code: 11, dataId: 0 }] },
        { id: 3, note: '', effects: [{ code: 44, dataId: 5 }] }];
    const ctx = world({ skills });
    ctx.load('RR_HimePreSkillEffects');
    ctx.DataManager.onLoad(skills);
    same(skills[1].effects, [{ code: 21, dataId: 0 }]);
    same(skills[2].effects, [{ code: 13, dataId: 0 }]);
    same(ctx.DataManager.rrPreSkillEffects(skills[2]).map(e => e.code), [44, 11]);
    const subject = ctx.run('new Game_Actor(1)');
    const action = ctx.run('(u) => { const a = new Game_Action(u); a.setSkill(1); return a; }')(subject);
    subject.currentAction = () => action;
    subject.removeCurrentAction = () => { subject.currentAction = () => null; };
    ctx.BattleManager._subject = subject;
    ctx.BattleManager.processTurn();
    same(ctx.$gameTemp.reserved, [20]);
    assert.equal(ctx.BattleManager.processed, undefined, 'waits for the event');
    ctx.$gameTemp.reserved = [];
    ctx.BattleManager.processTurn();
    assert.equal(ctx.BattleManager.processed, 1, 'then goes on');
    const plain = ctx.run('(u) => { const a = new Game_Action(u); a.setSkill(3); return a; }')(subject);
    subject.currentAction = () => plain;
    ctx.BattleManager.processTurn();
    assert.equal(ctx.BattleManager.processed, 2);
    same(ctx.$gameTemp.reserved, []);
});

//-----------------------------------------------------------------------------
// Skill Effect Tags
//-----------------------------------------------------------------------------
test('Skill Effect Tags: add and remove state, damage change until the action ends', () => {
    const states = [null, { id: 1, priority: 1, note: '', minTurns: 1, maxTurns: 1 }, { id: 2, priority: 1, note: '', minTurns: 1, maxTurns: 1 }];
    const ctx = world({ states });
    ctx.load('RR_YamiSkillEffectTags');
    const scene = ctx.run('new Scene_Battle()');
    const [a, b, user] = [ctx.run('new Game_Enemy(1)'), ctx.run('new Game_Enemy(2)'), ctx.run('new Game_Actor(1)')];
    ctx.troop = [a, b];
    ctx.party = [user];
    assert.equal(scene.rrImportedSymphony('add state 1, 2', { targets: [a, a, b] }), true);
    same([a._states, b._states], [[1, 2], [1, 2]]);
    scene.rrImportedSymphony('REMOVE STATE 2', { targets: [a] });
    same(a._states, [1]);
    scene.rrImportedSymphony('damage change', { values: ['80%'], actionTargets: [a], subject: user });
    const action = ctx.run('new Game_Action(null)');
    action._value = 101;
    assert.equal(action.makeDamageValue(a), 80);
    assert.equal(action.makeDamageValue(b), 101);
    action._value = -101;
    assert.equal(action.makeDamageValue(a), -80, 'truncated toward zero');
    action._value = 101;
    scene.rrImportedSymphony('damage change', { values: ['0%'], actionTargets: [a], subject: user });
    assert.equal(action.makeDamageValue(a), 0);
    ctx.BattleManager.endAction();
    assert.equal(action.makeDamageValue(a), 101);
    user._hp = 0;
    scene.rrImportedSymphony('damage change', { values: ['50%'], actionTargets: [a], subject: user });
    assert.equal(action.makeDamageValue(a), 101, 'a fallen user changes nothing');
    assert.equal(scene.rrImportedSymphony('move user: forward', {}), false, 'other tags are not this add-on\'s');
});

//-----------------------------------------------------------------------------
// Anti-Fail and the hit shake
//-----------------------------------------------------------------------------
test('Anti-Fail: a tagged skill or item always succeeds on a target it hits', () => {
    const items = [null, { id: 1, note: '<anti fail>' }, { id: 2, note: '<ANTI_FAIL>' }, { id: 3, note: '' }];
    const ctx = world({ items });
    ctx.load('RR_YanflyAntiFail');
    const target = ctx.run('new Game_Enemy(1)');
    const action = ctx.run('new Game_Action(null)');
    for (const [id, expected] of [[1, true], [2, true], [3, false]]) {
        target.result().clear();
        action.setItem(id);
        action.applyItemUserEffect(target);
        assert.equal(target.result().success, expected, `item ${id}`);
    }
});

test('Battler shake: a blink becomes a rightward shake that dies away, fully visible', () => {
    const rolls = [0.99, 0.5, 0.99, 0.5];
    let r = 0;
    const ctx = world({ random: () => rolls[r++ % rolls.length] });
    ctx.load('RR_BattlerShake', { shakeX: '30', shakeY: '0', diminish: 'true' });
    const sprite = ctx.run('new Sprite_Enemy(new Game_Enemy(1))');
    sprite.startEffect('blink');
    const xs = [];
    for (let i = 0; i < 20; i++) { sprite.update(); xs.push(sprite.x - 100); assert.equal(sprite.y, 200); assert.equal(sprite.opacity, 255); }
    assert.equal(xs[0], Math.trunc(29 * 19 / 20));
    assert.equal(xs[19], 0);
    assert.ok(xs.every(x => x >= 0 && x < 30));
});
