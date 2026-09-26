'use strict';
// Port of Yami's Battle Symphony (with Enemy Charset, Visual Effect, Holder Battlers, Fancy Death, Battler
// Orientation and the durability damage scale folded in) and Soulpour's Animated Battlers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const arr = (v) => (Array.isArray(v) ? Array.from(v, arr) : v);
const same = (actual, expected, ...message) => assert.deepEqual(arr(actual), expected, ...message);
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// The scripts' own settings, as the game carries them (abridged).
const SYMPHONY = `$imported = {} if $imported.nil?
$imported["YES-BattleSymphony"] = true
module SYMPHONY
  module View
    EMPTY_VIEW = false
    PARTY_DIRECTION = 4
    ACTORS_POSITION = { # Begin.
      0 =>  [480, 234],
      1 =>  [428, 254],
    } # End.
  end # View
  module Visual
    WEAPON_ICON_NON_CHARSET = false
    DISABLE_AUTO_MOVE_POSE = true
    BATTLER_SHADOW = false
    ENEMY_ATTACK_ANIMATION = 0
  end # Visual
  module Fixes
    AUTO_IMMORTAL_OFF = true
    ALWAYS_COUNTER = false
  end # Fixes
end # SYMPHONY
module SYMPHONY
  module DEFAULT_ACTIONS
    MAGIC_SETUP =[
      ["MESSAGE"],
      ["MOVE USER", ["FORWARD", "WAIT"]],
    ] # Do not remove this.
    COUNTER_ACTION = [

      ["SKILL ANIMATION", ["USER", "WAIT", "if attack"]],
      #["AUTO SYMPHONY", ["SKILL FULL COUNTER"]],
      ["ATTACK EFFECT", ["WHOLE"]],
    ] # Do not remove this.
  end # DEFAULT_ACTIONS
end # SYMPHONY
module SYMPHONY
  AUTO_SYMPHONY = { # Start
    "RETURN ORIGIN" => [
      ["STANCE", ["USER", "ORIGIN"]],
      ["MOVE USER", ["ORIGIN", "WAIT"]],
    ], # end RETURN ORIGIN
    "ATTACK FULL" => [
      ["ATTACK EFFECT", ["COUNTER CHECK"]],
      ["SKILL ANIMATION", ["WAIT"]],
      ["ATTACK EFFECT", ["WHOLE"]],
      ["MOVE TARGETS", ["BACKWARD"]],
    ], # end ATTACK FULL
    "SKILL FULL" => [
      ["SKILL EFFECT", ["COUNTER CHECK"]],
      ["SKILL ANIMATION", ["WAIT"]],
      ["SKILL EFFECT", ["WHOLE"]],
    ], # end SKILL FULL
  } # Do not remove this.
end # SYMPHONY`;
const VISUAL = `$imported = {} if $imported.nil?
$imported["BattleSymphony-VisualEffect"] = true
module SYMPHONY
  VE_AUTO_SYMPHONY = {
    "HIDE NONFOCUS" => [
      ["VANISH", ["NOT FOCUS", "TRUE"]],
      ["WAIT", [32]],
    ], # end HIDE NONFOCUS
  } # Do not remove this.
  AUTO_SYMPHONY.merge!(VE_AUTO_SYMPHONY)
end # SYMPHONY`;
const CHARSET = '$imported["BattleSymphony-EnemyCharset"] = true';
const HOLDERS = '$imported["BattleSymphony-HB"] = true';
const FANCY = '$imported["YN-FancyDeath"] = true';
const ORIENTATION = 'class Scene_Battle < Scene_Base\n  def action_set_battler_facing\n  end\nend';
const DURABILITY = '$imported[:YAMI_DamageDurability] = true\n  def action_damage_change_by_durability\n  end';
const SOULPOUR = `module Soulpour
  module AnimatedBattlers
    BREATH_SPEED = 3                      # Speed of the Enemy's Breathing
    BREATH_EFFECT_ENEMY_ID = [118,159,115]  # List of Enemy IDs who Breath
    FLOAT_EFFECT_ENEMY_ID = [108]  # List of Enemy IDs who Float
    MOVESIDE_EFFECT_ENEMY_ID = [112,115, 108] # List of Enemy IDs who moves sidewards
    STATES_CANCEL_EFFECT = [] # States Cancel Effect
  end
end`;

test('the families detect their scripts and install in the game\'s order', () => {
    const found = C.scriptFamilies([SYMPHONY, SOULPOUR]);
    assert.ok(found.has('yamiBattleSymphony'));
    assert.ok(found.has('soulpourAnimatedBattlers'));
    assert.ok(!C.scriptFamilies([VISUAL, CHARSET]).has('yamiBattleSymphony'));
    for (const key of ['yamiBattleSymphony', 'soulpourAnimatedBattlers']) {
        const family = C.FAMILIES.find(f => f.key === key);
        assert.ok(fs.existsSync(path.join(legacy, 'plugins', family.plugin + '.js')));
        assert.ok(!family.event && !family.route);
    }
});

test('settings, lists and add-ons are read from the game\'s copies', () => {
    const scripts = [SYMPHONY, VISUAL, CHARSET, HOLDERS, FANCY, ORIENTATION, DURABILITY];
    const out = params('RR_BattleSymphony').extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.equal(out.partyDirection, '4');
    assert.equal(out.disableAutoMovePose, 'true');
    assert.equal(out.autoImmortalOff, 'true');
    assert.equal(out.alwaysCounter, 'false');
    same(JSON.parse(out.actorsPosition), { 0: [480, 234], 1: [428, 254] });
    const lists = JSON.parse(out.defaultActions);
    same(lists.MAGIC_SETUP, [['MESSAGE'], ['MOVE USER', ['FORWARD', 'WAIT']]]);
    // The commented-out line is not part of the list.
    same(lists.COUNTER_ACTION, [['SKILL ANIMATION', ['USER', 'WAIT', 'if attack']], ['ATTACK EFFECT', ['WHOLE']]]);
    const auto = JSON.parse(out.autoSymphony);
    same(Object.keys(auto), ['RETURN ORIGIN', 'ATTACK FULL', 'SKILL FULL', 'HIDE NONFOCUS']);
    same(auto['HIDE NONFOCUS'], [['VANISH', ['NOT FOCUS', 'TRUE']], ['WAIT', [32]]]);
    for (const key of ['enemyCharset', 'visualEffect', 'holdersBattler', 'fancyDeath', 'orientation', 'durabilityScale']) assert.equal(out[key], 'true', key);
    const bare = params('RR_BattleSymphony').extract({ scripts: [SYMPHONY], constants: C.scriptConstants([SYMPHONY]) });
    for (const key of ['enemyCharset', 'visualEffect', 'holdersBattler', 'fancyDeath', 'orientation', 'durabilityScale']) assert.equal(bare[key], 'false', key);
    same(params('RR_SoulpourAnimatedBattlers').extract({ scripts: [SOULPOUR] }), {
        breathSpeed: '3', breathEnemies: '[118,159,115]', floatEnemies: '[108]', movesideEnemies: '[112,115,108]', cancelStates: '[]'
    });
});

//-----------------------------------------------------------------------------
// A small battle world: the MZ classes the port wraps, enough to run its sequences
//-----------------------------------------------------------------------------
function world({ skills = [], items = [], animations = [], weapons = [], enemies = [], extraParams = {} } = {}) {
    const ctx = { console: { log() {}, warn() {}, error: console.error } };
    const scripts = [SYMPHONY, VISUAL, CHARSET, HOLDERS, FANCY, ORIENTATION, DURABILITY];
    const symParams = Object.assign(params('RR_BattleSymphony').extract({ scripts, constants: C.scriptConstants(scripts) }), extraParams);
    vm.createContext(ctx);
    ctx.window = ctx;
    ctx.params = { RR_BattleSymphony: symParams };
    vm.runInContext(`
        var PluginManager = { parameters: (n) => params[n] || {} };
        var Graphics = { width: 640, height: 480, frameCount: 0 };
        var Input = { pressed: {}, isPressed(k) { return !!this.pressed[k]; } };
        var SoundManager = { playBossCollapse2() {} };
        var ImageManager = { loadCharacter: (n) => ({ name: n, isReady: () => true, width: 96, height: 128 }), loadSystem: (n) => ({ name: n }), loadEnemy: (n) => ({ name: n }) };
        var DataManager = { isSkill: (o) => !!o && o._kind === 'skill', isItem: (o) => !!o && o._kind === 'item' };
        var $dataSkills = [], $dataItems = [], $dataAnimations = [], $dataWeapons = [], $dataArmors = [], $dataEnemies = [], $dataStates = [];
        function Sprite() {} Sprite.prototype.initialize = function() { this.children = []; this.anchor = { x: 0, y: 0 }; this.scale = { x: 1, y: 1 }; this.x = 0; this.y = 0; this.opacity = 255; };
        Sprite.prototype.update = function() {}; Sprite.prototype.setFrame = function(x, y, w, h) { this._frame = { x, y, width: w, height: h }; };
        Sprite.prototype.addChild = function(c) { this.children.push(c); c.parent = this; }; Sprite.prototype.removeChild = function(c) { this.children.splice(this.children.indexOf(c), 1); c.parent = null; };
        Sprite.prototype.destroy = function() {}; Sprite.prototype.setBlendColor = function(c) { this._blend = c; };
        function Sprite_Battler() {} Sprite_Battler.prototype = Object.create(Sprite.prototype);
        Object.assign(Sprite_Battler.prototype, { setBattler(b) { this._battler = b; }, updateMain() {}, isMoving() { return false; }, mainSprite() { return this; }, updatePosition() {}, updateFrame() {}, updateBitmap() {} });
        function Sprite_Enemy() {} Sprite_Enemy.prototype = Object.create(Sprite_Battler.prototype);
        Object.assign(Sprite_Enemy.prototype, { initialize(b) { Sprite.prototype.initialize.call(this); this.setBattler(b); this._enemy = b; this._appeared = true; this._effectType = null; }, update() {}, setupEffect() {}, startEffect(e) { this._effectType = e; this._effectDuration = 16; if (e === 'disappear') this._appeared = false; if (e === 'appear') this._appeared = true; }, loadBitmap() {} });
        function Sprite_Actor() {} Sprite_Actor.prototype = Object.create(Sprite_Battler.prototype);
        Object.assign(Sprite_Actor.prototype, { setBattler() {}, updateMain() {}, updateBitmap() {}, updateFrame() {}, updatePosition() {}, startEntryMotion() {}, moveToStartPosition() {}, updateMotion() {}, startMove() {}, update() {}, isEffecting() { return false; } });
        function Sprite_AnimationMV() {}
        function Spriteset_Battle() {} Object.assign(Spriteset_Battle.prototype, { createActors() {}, animationBaseDelay() { return 8; }, animationNextDelay() { return 12; }, animationShouldMirror() { return true; }, update() {},
            battlerSprites() { return this.sprites; }, findTargetSprite(b) { return this.sprites.find(s => s._battler === b); }, isAnimationPlaying() { return this.animations > 0; }, isEffecting() { return false; } });
        function Game_Screen() {} Object.assign(Game_Screen.prototype, { clear() {}, update() {}, startFlash(c, d) { this.flash = [c, d]; }, startShake(p, s, d) { this.shake = [p, s, d]; }, startTint() {}, startFadeOut() {}, startFadeIn() {}, changeWeather() {} });
        function Game_Variables() { this.v = {}; } Game_Variables.prototype.value = function(i) { return this.v[i] || 0; };
        function Game_Switches() {} Game_Switches.prototype.value = function() { return false; };
        function Game_ActionResult() { this.clear(); }
        Game_ActionResult.prototype.clear = function() { this.used = false; this.missed = false; this.evaded = false; this.critical = false; this.success = false; this.hpDamage = 0; this.mpDamage = 0; this.tpDamage = 0; };
        Game_ActionResult.prototype.isHit = function() { return this.used && !this.missed && !this.evaded; };
        function Game_BattlerBase() {} Game_BattlerBase.prototype.stateResistSet = function() { return []; };
        function Game_Battler() {} Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
        Object.assign(Game_Battler.prototype, { init(hp) { this.hp = hp; this.mhp = 100; this._result = new Game_ActionResult(); this._actions = []; this._states = []; this._hidden = false; this._effect = null; },
            result() { return this._result; }, isDead() { return this.hp <= 0; }, isAlive() { return this.hp > 0; }, isAppeared() { return !this._hidden; }, isHidden() { return this._hidden; },
            canMove() { return true; }, deathStateId() { return 1; }, onBattleStart() {}, onBattleEnd() {}, addState() {}, refresh() {}, requestEffect(e) { this._effect = e; },
            isEffectRequested() { return !!this._effect; }, effectType() { return this._effect; }, clearEffect() { this._effect = null; }, performCollapse() { this.collapsed = (this.collapsed || 0) + 1; },
            currentAction() { return this._actions[0] || null; }, friendsUnit() { return this.isActor() ? $gameParty : $gameTroop; }, opponentsUnit() { return this.isActor() ? $gameTroop : $gameParty; },
            isStateAffected(id) { return this._states.includes(id); }, attackTimesAdd() { return 0; }, isConfused() { return false; }, useItem(item) { this.used = item; } });
        function Game_Actor(id, hp) { this.init(hp); this._actorId = id; } Game_Actor.prototype = Object.create(Game_Battler.prototype);
        Object.assign(Game_Actor.prototype, { isActor: () => true, isEnemy: () => false, actorId() { return this._actorId; }, actor() { return { note: '' }; }, currentClass() { return { note: '' }; },
            index() { return $gameParty.battleMembers().indexOf(this); }, weapons() { return this._weapons || []; }, equips() { return this._equips || []; }, isDualWield() { return false; },
            characterName() { return '$jay'; }, characterIndex() { return 0; }, attackAnimationId1() { return 1; }, attackAnimationId2() { return 0; }, isSpriteVisible() { return false; }, performDamage() {}, performCollapse() {} });
        function Game_Enemy(enemyId, x, y, hp) { this.init(hp === undefined ? 10 : hp); this.setup(enemyId, x, y); } Game_Enemy.prototype = Object.create(Game_Battler.prototype);
        Object.assign(Game_Enemy.prototype, { setup(id, x, y) { this._enemyId = id; this._screenX = x; this._screenY = y; }, isActor: () => false, isEnemy: () => true, enemy() { return $dataEnemies[this._enemyId]; }, enemyId() { return this._enemyId; },
            index() { return $gameTroop.members().indexOf(this); }, name() { return 'E' + this._enemyId; } });
        function Game_Action(subject) { this._subject = subject; this._item = null; }
        Object.assign(Game_Action.prototype, { item() { return this._item; }, setSkill(id) { this._item = $dataSkills[id]; }, setItem(id) { this._item = $dataItems[id]; }, setAttack() { this.setSkill(1); },
            isAttack() { return this._item === $dataSkills[1]; }, isGuard() { return false; }, itemCnt() { return 0; }, itemMrf() { return 0; }, makeDamageValue() { return 10; }, executeDamage(t, v) { t.hp -= v; t.result().hpDamage = v; },
            applyItemEffect() {}, applyItemUserEffect() {}, applyGlobal() { this.globalApplied = true; }, isForOpponent() { return true; }, isForOne() { return true; } });
        function Scene_Battle() {} Scene_Battle.prototype.update = function() {};
        var BattleManager = { startAction() {}, update() {}, processVictory() {}, processDefeat() {}, applySubstitute(t) { return t; }, invokeCounterAttack() {}, invokeMagicReflection() {},
            invokeAction(subject, target) {
                const r = target.result(); r.clear(); r.used = true;
                if (Math.random() < this._action.itemCnt(target)) return this.invokeCounterAttack(subject, target);
                r.success = true; const v = this._action.makeDamageValue(target, false); this._action.executeDamage(target, v); (this.hits = this.hits || []).push([subject, target]);
            } };
        var SceneManager = { _scene: null };
        var $gameTemp = { _animationQueue: [], requestAnimation(t, id, m) { (this.requests = this.requests || []).push([t, id, m]); } };
        var $gameScreen = new Game_Screen();
        var $gameVariables = new Game_Variables(), $gameSwitches = new Game_Switches();
        var $gameParty = { list: [], inBattle: () => true, battleMembers() { return this.list; }, aliveMembers() { return this.list.filter(b => b.isAlive()); }, substituteBattler() { return null; }, maxBattleMembers: () => 4 };
        var $gameTroop = { list: [], members() { return this.list; }, aliveMembers() { return this.list.filter(b => b.isAlive()); }, substituteBattler() { return null; } };
    `, ctx);
    Object.assign(ctx.$dataSkills, skills);
    Object.assign(ctx.$dataItems, items);
    Object.assign(ctx.$dataAnimations, animations);
    Object.assign(ctx.$dataWeapons, weapons);
    Object.assign(ctx.$dataEnemies, enemies);
    vm.runInContext(plugin('RR_BattleSymphony'), ctx);
    vm.runInContext(`
        var scene = new Scene_Battle(); SceneManager._scene = scene;
        scene._logWindow = { busy: 0, isBusy() { return this.busy-- > 0; }, displayAction(s, i) { this.shown = [s, i]; this.busy = 2; }, displayCounter(t) { this.counter = t; }, displayActionResults() {}, displayReflection() {} };
        scene._statusWindow = { refresh() {} };
        scene._spriteset = new Spriteset_Battle(); scene._spriteset.sprites = []; scene._spriteset.animations = 0;
        scene._spriteset._battleField = new Sprite(); scene._spriteset._battleField.initialize();
        BattleManager._logWindow = scene._logWindow;
        function addSprite(b) { const s = new (b.isActor() ? Sprite_Actor : Sprite_Enemy)(); if (b.isEnemy()) s.initialize(b); else { Sprite.prototype.initialize.call(s); s._battler = b; } s._rrSymCw = 32; s._rrSymCh = 48; scene._spriteset.sprites.push(s); scene._spriteset._battleField.addChild(s); return s; }
        // Runs a generator to its end, counting the frames it waited; each frame steps the battlers' moves.
        function drive(gen, limit = 2000) { let frames = 0; for (;;) { const r = gen.next(); if (r.done) return frames; frames++; for (const b of $gameParty.list.concat($gameTroop.list)) b.rrSymUpdateVisual(); if (frames > limit) throw new Error('never ended'); } }
    `, ctx);
    return ctx;
}
const run = (ctx, js) => vm.runInContext(js, ctx);
const skill = (id, note = '', extra = {}) => Object.assign({ id, _kind: 'skill', name: 'S' + id, note, hitType: 1, scope: 1, animationId: 0, repeats: 1, iconIndex: 10 + id }, extra);

test('note blocks replace the default lists; an unclosed block keeps taking lines', () => {
    const skills = [null,
        skill(1),
        skill(2, '<setup action>\nicon create: user, item, hand\n<\\setup action>\n<whole action>\nmove user: target, mid, wait\n  autosymphony: skill full\n<\\whole action>\n<effect condition: 1>\na.state?(4)', { hitType: 0 }),
        skill(3, '<target action>\nif user.actor? == true\nwait 60\nend\n</target action>', { hitType: 0 })];
    const ctx = world({ skills });
    run(ctx, `var a = new Game_Actor(1, 50), t = new Game_Enemy(0, 100, 200); $gameParty.list = [a]; $gameTroop.list = [t]; addSprite(a); addSprite(t);
        a.onBattleStart(); t.onBattleStart(); var act = new Game_Action(a); act.setSkill(2); drive(scene.rrSymUseItem(a, act, [t])); 0`);
    const read = JSON.parse(run(ctx, 'JSON.stringify($dataSkills[2]._rrSymphony)'));
    same(read.setup.map(e => e[0]), ['icon create', '<\\setup action>', 'move user', 'autosymphony', '<\\whole action>', '<effect condition', 'a.state?(4)']);
    same(read.setup[2][1], ['TARGET', 'MID', 'WAIT']);
    same(read.setup[3][1], ['SKILL FULL']);
    same(read.whole, []);
    same(read.target, []);
    // Skill 3 keeps the magic defaults outside its one block; a physical skill takes the physical ones.
    run(ctx, 'var act3 = new Game_Action(a); act3.setSkill(3); drive(scene.rrSymUseItem(a, act3, [t])); var act1 = new Game_Action(a); act1.setSkill(1); drive(scene.rrSymUseItem(a, act1, [t])); 0');
    const three = JSON.parse(run(ctx, 'JSON.stringify($dataSkills[3]._rrSymphony)'));
    same(three.setup, [['MESSAGE'], ['MOVE USER', ['FORWARD', 'WAIT']]]);
    same(three.target.map(e => e[0]), ['if user.actor? == true', 'wait 60', 'end']);
    assert.equal(run(ctx, '$dataSkills[1]._rrSymphony.target[0][0]'), 'IMMORTAL');
});

test('if ... end blocks, values with if/unless, and the nested-if slip', () => {
    const ctx = world({ skills: [null, skill(1)] });
    run(ctx, `var a = new Game_Actor(1, 50), e = new Game_Enemy(0, 100, 200); $gameParty.list = [a]; $gameTroop.list = [e]; addSprite(a); addSprite(e);
        a.onBattleStart(); e.onBattleStart(); scene._rrSym = { condition: [] };
        var log = []; const _d = scene.rrSymDispatch; scene.rrSymDispatch = function* () { log.push(this._rrSym.action); yield* _d.call(this); };
        function perform(user, list) { log = []; scene._rrSym.subject = user; scene._rrSym.act = new Game_Action(user); scene._rrSym.act.setSkill(1); drive(scene.rrSymPerform(list, [e === user ? a : e])); return log.filter(x => x.startsWith('MARK')); }`);
    const list = JSON.stringify([
        ['if user.actor? == true', [null]], ['MARK actor', [null]], ['end', [null]],
        ['if user.actor? == false', [null]], ['MARK enemy', [null]], ['end', [null]],
        ['MARK attack', ['if attack']], ['MARK not attack', ['unless attack']]]);
    same(run(ctx, `perform(a, ${list})`), ['MARK ACTOR', 'MARK ATTACK']);
    same(run(ctx, `perform(e, ${list})`), ['MARK ENEMY', 'MARK ATTACK']);
    // An if inside a false if is skipped, so its end closes the outer block and what follows runs.
    const nested = JSON.stringify([['if user.actor?', [null]], ['if user.equips[1]', [null]], ['MARK inner', [null]], ['end', [null]], ['MARK between', [null]], ['end', [null]], ['MARK after', [null]]]);
    same(run(ctx, `perform(e, ${nested})`), ['MARK BETWEEN', 'MARK AFTER']);
    // A condition Ruby could not evaluate is false.
    same(run(ctx, `perform(a, ${JSON.stringify([['if result.critical == true', [null]], ['MARK crit', [null]], ['end', [null]]])})`), []);
    // Equipment, weapon types and game variables.
    run(ctx, 'a._equips = [{ wtypeId: 4, durability: 80 }, null]; $gameVariables.v[13] = 1; 0');
    same(run(ctx, `perform(a, ${JSON.stringify([
        ['if user.actor? && user.equips[0] && user.equips[0].wtype_id == 4', [null]], ['MARK w4', [null]], ['end', [null]],
        ['if user.actor? && user.equips[1] && user.equips[1].wtype_id == 4', [null]], ['MARK w4b', [null]], ['end', [null]],
        ['if user.actor? && user.equips[0] && user.equips[0].durability <= 90', [null]], ['MARK worn', [null]], ['end', [null]],
        ['if $game_variables[13] == 1', [null]], ['MARK v', [null]], ['end', [null]]])})`), ['MARK W4', 'MARK WORN', 'MARK V']);
});

test('lines the original read otherwise: "wait 60" without a colon, "wait for animation", auto symphonies by name', () => {
    const ctx = world({ skills: [null, skill(1)], animations: [null, { id: 1, frames: [[]], position: 1 }] });
    run(ctx, `var a = new Game_Actor(1, 50), e = new Game_Enemy(0, 100, 200); $gameParty.list = [a]; $gameTroop.list = [e]; addSprite(a); addSprite(e);
        a.onBattleStart(); e.onBattleStart(); scene._rrSym = { condition: [], subject: a, act: new Game_Action(a) }; scene._rrSym.act.setSkill(1); 0`);
    assert.equal(run(ctx, `drive(scene.rrSymPerform([['WAIT 60', [null]]], [e]))`), 0);
    assert.equal(run(ctx, `drive(scene.rrSymPerform([['wait', ['20']]], [e]))`), 20);
    // Waits skippable by holding a key keep their first half.
    assert.equal(run(ctx, `Input.pressed.ok = true; const n = drive(scene.rrSymPerform([['wait', ['12', 'skip']]], [e])); Input.pressed.ok = false; n`), 6);
    assert.equal(run(ctx, `drive(scene.rrSymPerform([['wait for animation', [null]]], [e]))`), 0);
    // "hide nonfocus" as a line runs the AutoSymphony: the others vanish, then 32 frames.
    run(ctx, 'var o = new Game_Enemy(0, 50, 150); $gameTroop.list.push(o); addSprite(o); o.onBattleStart(); 0');
    assert.equal(run(ctx, `drive(scene.rrSymPerform([['hide nonfocus', [null]]], [e]))`), 32);
    assert.equal(run(ctx, 'RRBattleSymphony.visual(o).vanishing'), true);
    assert.equal(run(ctx, 'RRBattleSymphony.visual(e).vanishing'), false);
    assert.equal(run(ctx, 'RRBattleSymphony.visual(a).vanishing'), false);
    assert.equal(run(ctx, 'scene._spriteset.findTargetSprite(o)._effectType'), 'disappear');
});

test('moves: forward along the facing, to a target\'s body, back to the origin; the wait lasts a frame past arrival', () => {
    const ctx = world({ skills: [null, skill(1)] });
    run(ctx, `var a = new Game_Actor(1, 50), e = new Game_Enemy(0, 232, 280); $gameParty.list = [a]; $gameTroop.list = [e]; addSprite(a); addSprite(e);
        a.onBattleStart(); e.onBattleStart(); scene._rrSym = { condition: [], subject: a, act: new Game_Action(a) }; scene._rrSym.act.setSkill(1); 0`);
    same(run(ctx, '[a._screenX, a._screenY, e._screenX, e._screenY]'), [480, 234, 232, 280]);
    // 16 pixels left in 8 frames (2 a frame), and one frame more before the wait ends.
    assert.equal(run(ctx, `drive(scene.rrSymPerform([['move user', ['forward', 'wait']]], [e]))`), 9);
    same(run(ctx, '[a._screenX, a._screenY]'), [464, 234]);
    // To the target's body: beside it (the mover's origin is right of it), level with its middle.
    run(ctx, `drive(scene.rrSymPerform([['move user', ['target', 'body', 'wait']]], [e]))`);
    same(run(ctx, '[a._screenX, a._screenY]'), [232 + 16 + 16, 280 - 24 + 48 - 24]);
    assert.equal(run(ctx, 'RRBattleSymphony.visual(a).pose'), 'left');
    run(ctx, `drive(scene.rrSymPerform([['move user', ['origin', 'wait']]], [e]))`);
    same(run(ctx, '[a._screenX, a._screenY]'), [480, 234]);
    // Moving back to the right turned the actor around; breaking the pose faces the party direction again.
    assert.equal(run(ctx, 'RRBattleSymphony.visual(a).pose'), 'right');
    run(ctx, `drive(scene.rrSymPerform([['pose', ['user', 'break']]], [e]))`);
    assert.equal(run(ctx, 'RRBattleSymphony.visual(a).pose'), 'left');
    assert.equal(run(ctx, 'RRBattleSymphony.visual(e).pose'), 'right');
    // A jump arcs and lands where it was going.
    run(ctx, `drive(scene.rrSymPerform([['jump arc 24 user', ['target', 'mid', '5', 'wait']]], [e]))`);
    same(run(ctx, '[a._screenX, Math.round(a._screenY)]'), [264, 280]);
});

test('one skill: the costs after the setup lines, the effect through the battle flow, counters in their own list', () => {
    const skills = [null, skill(1, '', { animationId: -1 }), null, null, null, skill(5, '<whole action>\nskill effect: whole\ndamage change durability scale: 50%\n</whole action>', { hitType: 0, animationId: 3 })];
    const ctx = world({ skills, animations: [null, { id: 1, frames: [[]], position: 1 }] });
    run(ctx, `var a = new Game_Actor(1, 50), e = new Game_Enemy(0, 232, 280); $gameParty.list = [a]; $gameTroop.list = [e]; addSprite(a); addSprite(e);
        a.onBattleStart(); e.onBattleStart(); 0`);
    // The physical defaults: forward, to the target, the attack animation (the actor's weapon's), the hit, back home.
    run(ctx, 'var act = new Game_Action(a); act.setSkill(1); BattleManager._action = act; var frames = drive(scene.rrSymUseItem(a, act, [e])); 0');
    assert.equal(run(ctx, 'a.used === $dataSkills[1] && act.globalApplied'), true);
    assert.equal(run(ctx, 'e.hp'), 0);
    same(run(ctx, 'BattleManager.hits.map(h => [h[0] === a, h[1] === e])'), [[true, true]]);
    same(run(ctx, '$gameTemp.requests.map(r => r[1])'), [1]);
    assert.equal(run(ctx, 'e.collapsed'), 1);
    same(run(ctx, '[a._screenX, a._screenY]'), [480, 234]);
    // A result not set to calculate keeps its hit flags through a clear.
    run(ctx, 'scene.rrSymEndAction(); e.hp = 30; e.result().used = true; e.result().success = true; e.result()._rrSymCalc = false; e.result().clear(); 0');
    assert.equal(run(ctx, 'e.result().success'), true);
    // Durability scale asks the durability port for the ratio.
    run(ctx, `a.rrDurabilityDamageRatio = (r) => r / 2; Game_ActionResult.prototype.rrSetDamageRatio = function(r) { this.ratio = r; };
        var act2 = new Game_Action(a); act2.setSkill(5); BattleManager._action = act2; drive(scene.rrSymUseItem(a, act2, [e])); 0`);
    assert.equal(run(ctx, 'e.result().ratio'), 25);
    // A counter: the check marks the target, the hit is replaced by the counter list played by the target.
    run(ctx, `scene.rrSymEndAction(); e.hp = 30; a.hp = 50; BattleManager.hits = []; 0`);
    run(ctx, `var counterSeen = []; const _cp = scene.rrSymCounterAttack; scene.rrSymCounterAttack = function* (t, i) { counterSeen.push(t === e); yield* _cp.call(this, t, i); };
        var real = Game_Action.prototype.itemCnt; Game_Action.prototype.itemCnt = function(t) { return t.result()._rrSymCheckCounter ? 1 : 0; };
        var act3 = new Game_Action(a); act3.setSkill(1); BattleManager._action = act3; drive(scene.rrSymUseItem(a, act3, [e])); Game_Action.prototype.itemCnt = real; 0`);
    same(run(ctx, 'counterSeen'), [true]);
    assert.equal(run(ctx, 'scene._logWindow.counter === e'), true);
    // The counter list's attack effect hit the attacker.
    same(run(ctx, 'BattleManager.hits.map(h => [h[0] === e, h[1] === a])'), [[true, true]]);
    assert.equal(run(ctx, 'e.hp'), 30);
});

test('icons: a weapon icon on a charset enemy follows its hand; a thrown item arcs to the target', () => {
    const weapons = [null, { id: 1, iconIndex: 147 }];
    const enemies = [{ id: 0, note: '<battler set: CLF, 1>\n<Weapon 1:1>' }, { id: 1, note: '<holders battler: holder4>' }];
    const items = [null, { id: 1, _kind: 'item', note: '', scope: 1, iconIndex: 230, animationId: 0, repeats: 1 }];
    const ctx = world({ skills: [null, skill(1)], weapons, enemies, items });
    run(ctx, `var a = new Game_Actor(1, 50), e = new Game_Enemy(0, 232, 280), h = new Game_Enemy(1, 150, 250); $gameParty.list = [a]; $gameTroop.list = [e, h];
        addSprite(a); addSprite(e); addSprite(h); a.onBattleStart(); e.onBattleStart(); h.onBattleStart(); 0`);
    same(run(ctx, '[e._rrCharsetName, e._rrCharsetIndex, e.rrSymUseCharset(), h.rrSymUseCharset(), h.rrSymUseHb()]'), ['CLF', 1, true, false, true]);
    run(ctx, 'scene._rrSym = { condition: [], subject: e, act: new Game_Action(e) }; scene._rrSym.act.setSkill(1); drive(scene.rrSymPerform([["icon create", ["user", "weapon", "hand2"]], ["icon effect", ["user", "weapon", "angle", "45"]]], [a])); 0');
    const icon = run(ctx, 'var ic = RRBattleSymphony.visual(e).icons.get(":weapon1"); ic.update(); JSON.stringify({ x: ic.rx, y: ic.ry, ox: ic.rox, angle: ic.rangle, mirror: ic.rmirror, frame: ic._frame })');
    // Facing right: mirrored, the hand on the other side, the angle turned.
    same(JSON.parse(icon), { x: 232 - 6, y: 280 - 16, ox: 0, angle: -45, mirror: true, frame: { x: 3 * 24, y: 9 * 24, width: 24, height: 24 } });
    // A holder battler shows no weapon icons.
    run(ctx, 'scene._rrSym.subject = h; drive(scene.rrSymPerform([["icon create", ["user", "weapon"]]], [a])); 0');
    assert.equal(run(ctx, 'RRBattleSymphony.visual(h).icons.size'), 0);
    // An item thrown by the actor lands at the target's middle.
    run(ctx, `scene._rrSym.subject = a; scene._rrSym.act = new Game_Action(a); scene._rrSym.act.setItem(1);
        drive(scene.rrSymPerform([["icon create", ["user", "item", "hand"]], ["icon throw user", ["targets", "item", "30", "20", "wait"]]], [e])); 0`);
    // It lands short of the middle: the throw measured its arc from where the icon was last placed (the battler's
    // middle, before its hand was chosen), as the original did when both lines ran in one frame.
    const d = 248, y1 = 38, h = -150, a = (2 * y1 - 4 * h) / (d * d), b = (y1 - a * d * d) / d, x = 242;
    same(run(ctx, 'var it = RRBattleSymphony.visual(a).icons.get(":item"); [it.rx, it.ry]'), [232, Math.trunc(218 + a * x * x + b * x)]);
    // A fade-out does not hold a wait, and the action's end clears the icons.
    assert.equal(run(ctx, 'drive(scene.rrSymPerform([["icon", ["user", "item", "fade out", "wait"]]], [e]))'), 0);
    run(ctx, 'scene.rrSymEndAction(); 0');
    assert.equal(run(ctx, 'RRBattleSymphony.visual(a).icons.size + RRBattleSymphony.visual(e).icons.size'), 0);
});

test('immortal targets live through their damage until the flag is dropped, then collapse', () => {
    const ctx = world({ skills: [null, skill(1)] });
    run(ctx, `var a = new Game_Actor(1, 50), e = new Game_Enemy(0, 232, 280, 5); $gameParty.list = [a]; $gameTroop.list = [e]; addSprite(a); addSprite(e);
        a.onBattleStart(); e.onBattleStart(); scene._rrSym = { condition: [], subject: a, act: new Game_Action(a) }; scene._rrSym.act.setSkill(1); 0`);
    run(ctx, 'drive(scene.rrSymPerform([["immortal", ["targets", "true"]]], [e])); 0');
    same(run(ctx, 'e.stateResistSet()'), [1]);
    run(ctx, 'drive(scene.rrSymPerform([["immortal", ["targets", "false"]]], [e])); 0');
    same(run(ctx, 'e.stateResistSet()'), []);
    // The flag is left on a battler already fallen, as the original skipped the dead.
    run(ctx, 'RRBattleSymphony.visual(e).immortal = true; e.hp = 0; drive(scene.rrSymPerform([["immortal", ["targets", "false"]]], [e])); 0');
    assert.equal(run(ctx, 'RRBattleSymphony.visual(e).immortal'), true);
});

test('side view setup: animations start at once and unturned; a counter needs the check and a battler that can move', () => {
    const ctx = world({ skills: [null, skill(1)] });
    assert.equal(run(ctx, 'Spriteset_Battle.prototype.animationBaseDelay.call({})'), 0);
    assert.equal(run(ctx, 'Spriteset_Battle.prototype.animationNextDelay.call({})'), 0);
    assert.equal(run(ctx, 'Spriteset_Battle.prototype.animationShouldMirror.call({}, new Game_Actor(1, 5))'), false);
    run(ctx, 'var t = new Game_Enemy(0, 0, 0); var act = new Game_Action(new Game_Actor(1, 5)); 0');
    assert.equal(run(ctx, 'act.itemCnt(t)'), 0);
    assert.equal(run(ctx, 'Game_Action.prototype.makeDamageValue.call(act, t, false)'), 0);
    run(ctx, 't.result().rrSymSet("dmg"); 0');
    assert.equal(run(ctx, 'Game_Action.prototype.makeDamageValue.call(act, t, false)'), 10);
    assert.equal(run(ctx, 'Game_Actor.prototype.isSpriteVisible.call(new Game_Actor(1, 5))'), true);
});

test('Animated Battlers: every enemy stands 5 pixels left, listed ones breathe, float and sway', () => {
    const ctx = { console, Math: Object.create(Math) };
    ctx.Math.randomInt = () => 0;
    vm.createContext(ctx);
    ctx.params = { breathSpeed: '3', breathEnemies: '[2]', floatEnemies: '[3]', movesideEnemies: '[3]', cancelStates: '[9]' };
    vm.runInContext(`
        var PluginManager = { parameters: () => params };
        function Game_Battler() {} Object.assign(Game_Battler.prototype, { addState(id) { this._states.push(id); }, removeState(id) { this._states = this._states.filter(s => s !== id); } });
        function Game_Enemy() {} Game_Enemy.prototype = Object.create(Game_Battler.prototype);
        Object.assign(Game_Enemy.prototype, { initialize(id) { this._enemyId = id; this._states = []; }, isEnemy: () => true, screenX() { return 200; }, screenY() { return 300; } });
        function Sprite_Enemy() {} Object.assign(Sprite_Enemy.prototype, { initialize(b) { this._battler = b; this.anchor = { x: 0.5, y: 1 }; this.scale = { x: 1, y: 1 }; this._frame = { width: 40, height: 60 }; }, update() {} });
    `, ctx);
    vm.runInContext(plugin('RR_SoulpourAnimatedBattlers'), ctx);
    const r = vm.runInContext(`
        const make = (id) => { const e = new Game_Enemy(); e.initialize(id); const s = new Sprite_Enemy(); s.initialize(e); return [e, s]; };
        const [e1, s1] = make(1); s1.update();
        const [e2, s2] = make(2); s2.update();
        const [e3, s3] = make(3); for (let i = 0; i < 5; i++) s3.update();
        e3.addState(9); const sway = e3._rrMoveside; e3.removeState(9);
        JSON.stringify({ ax: s1.anchor.x, ay: s1.anchor.y, zoom: s2.scale.y, breath: [s2._rrZoomY > 0.9, s2._rrZoomY < 1.1], ay3: s3.anchor.y, off3: s3._rrOxOffset, sway, back: e3._rrMoveside });
    `, ctx);
    const out = JSON.parse(r);
    assert.equal(out.ax, 25 / 40);
    assert.equal(out.ay, 1);
    // 1 + 200/1000 - 300/1000 = 0.9 at the start, then one step up.
    assert.ok(Math.abs(out.zoom - (0.9 + 0.003)) < 1e-9);
    assert.equal(out.ay3, 62 / 60);
    assert.equal(out.off3, 7);
    assert.equal(out.sway, false);
    assert.equal(out.back, true);
});
