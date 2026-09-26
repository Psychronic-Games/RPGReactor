'use strict';
// Dreamwalker's targeting scripts: Yanfly's Target Manager and Area of Effect, Target One Ally, Target Any,
// the Unified Enemy Cursor (cone areas, cursors and names), Mouse Enemy Select and the Big Boss HP Bar.
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
const TARGET = `$imported = {} if $imported.nil?
$imported["YEA-TargetManager"] = true
module YEA
  module TARGET
    RANDOM_REDIRECT = true
  end # TARGET
end # YEA`;
const AOE = `$imported = {} if $imported.nil?
$imported["YEA-AreaofEffect"] = true
module YEA
  module AOE
    DEFAULT_CIRCLE = "circle"    # Default circular AoE Image.
    CIRCULAR_BLEND = 1     # 0 - Normal; 1 - Additive; 2 - Subtractive
    DEFAULT_HEIGHT = 0.33
    DEFAULT_ENEMY_OFFSET_X =  0
    DEFAULT_ENEMY_OFFSET_Y = -8
    DEFAULT_SQUARE = "square"    # Default square AoE Image.
    SQUARISH_BLEND = 1     # 0 - Normal; 1 - Additive; 2 - Subtractive
  end # AOE
end # YEA`;
const ONE_ALLY = `class RPG::UsableItem < RPG::BaseItem
  def init_one_no_user
    @one_no_user = @note =~ /<one_ally_no_user>/i ? true : false
  end
end`;
const ANY = `module DataManager
    def self.load_notetags_any_target
    end
end`;
const CURSOR = `$imported = {} if $imported.nil?
$imported["Unified-Enemy-Cursor-AOE-Cone-Refactored"] = true
module BattleCursor
  FILENAME    = "cursor"   # Graphics/System/cursor.png
  OFFSET_X    = 0
  OFFSET_Y    = 0
  TEXT_OFFSET = -50
  Z           = 200
  BOB         = 0
  SLIDE_SPEED = 0.5
  NAME_WIDTH  = 200
  NAME_HEIGHT = 64

  CONE_USER_OFFSET_X = 0
  CONE_USER_OFFSET_Y = 0
end`;
const MOUSE = `module Mouse #Do not touch this line.
  module Selection #Do not touch this line.
    DEFAULT_ENEMY_OFFSET_X = 0
    DEFAULT_ENEMY_OFFSET_Y = -8
  end #Do not touch this line.
end #Do not touch this line.
class Scene_Battle < Scene_Base
  def enemySelectionSetup
  end
end`;
const BOSS = `module BIG_BOSS_HP_BAR
  ENABLE_SHAKE_WHEN_DAMAGED = true
  SHAKE_POWER               = 3
  SHAKE_DURATION            = 12

  BAR_WIDTH                 = 200
  BAR_HEIGHT                = 44
  BAR_X                     = (640 - BAR_WIDTH) / 2
  BAR_Y                     = 200 - 88

  WINDOW_HEIGHT             = 40
  NAME_BOLD                 = true
  BAR_BACK_COLOR            = Color.new(24,24,24,255)
  BAR_FRAME_COLOR           = Color.new(255,255,255,255)
  DEFAULT_BAR_COLOR1        = 2
  DEFAULT_BAR_COLOR2        = 10
end`;

test('families: each script is detected, in its own family', () => {
    const found = C.scriptFamilies([TARGET, AOE, ONE_ALLY, ANY, CURSOR, MOUSE, BOSS]);
    for (const key of ['yanflyTargetManager', 'yanflyAreaOfEffect', 'targetOneAlly', 'targetAnyAddOn', 'unifiedEnemyCursor', 'mouseEnemySelect', 'bigBossHpBar']) assert.ok(found.has(key), key);
    assert.ok(!C.scriptFamilies([TARGET]).has('yanflyAreaOfEffect'));
});

test('params: settings from the game copies, the boss bar sums worked out', () => {
    assert.deepEqual(params('RR_YanflyTargetManager').extract({ scripts: [TARGET] }), { randomRedirect: 'true' });
    assert.deepEqual(params('RR_YanflyAreaOfEffect').extract({ scripts: [AOE] }), {
        circleImage: 'circle', circleBlend: '1', defaultHeight: '0.33', enemyOffsetX: '0', enemyOffsetY: '-8', squareImage: 'square', squareBlend: '1'
    });
    const cursor = params('RR_UnifiedEnemyCursor').extract({ scripts: [CURSOR, 'Font.default_size = 18'] });
    assert.equal(cursor.filename, 'cursor');
    assert.equal(cursor.textOffset, '-50');
    assert.equal(cursor.slideSpeed, '0.5');
    assert.equal(cursor.bob, '0');
    assert.equal(cursor.rgssFontSize, '18');
    assert.deepEqual(params('RR_MouseEnemySelect').extract({ scripts: [MOUSE] }), { offsetX: '0', offsetY: '-8' });
    const boss = params('RR_BigBossHpBar').extract({ scripts: [BOSS] });
    assert.equal(boss.barX, '220');
    assert.equal(boss.barY, '112');
    assert.equal(boss.barBackColor, '[24,24,24,255]');
    assert.equal(boss.windowHeight, '40');
    assert.equal(boss.color2, '10');
    assert.equal(boss.hpFontSize, '16');     // not in the snippet: the script's default
});

//-----------------------------------------------------------------------------
// A small battle for the plugins to run in
//-----------------------------------------------------------------------------
const cls = (methods = {}, parent = null) => {
    function K() {}
    K.prototype = Object.create(parent ? parent.prototype : Object.prototype);
    Object.assign(K.prototype, methods);
    return K;
};
const unitOf = (members) => ({
    members: () => members,
    aliveMembers: () => members.filter(m => m.isAlive()),
    deadMembers: () => members.filter(m => !m.isAlive()),
    randomTarget() { return this.aliveMembers()[0] || null; },
    randomDeadTarget() { return this.deadMembers()[0] || null; },
    isAllDead() { return this.aliveMembers().length === 0; },
    smoothTarget(i) { const m = members[Math.max(i, 0)]; return m && m.isAlive() ? m : this.aliveMembers()[0]; }
});

function battle({ skills = [], items = [], plugins = [], parameters = {} } = {}) {
    const $dataSkills = [null, ...skills.map((s, i) => Object.assign({ id: i + 1, scope: 1, repeats: 1, note: '' }, s))];
    const $dataItems = [null, ...items.map((s, i) => Object.assign({ id: i + 1, scope: 1, repeats: 1, note: '' }, s))];
    const Game_BattlerBase = cls({ canUse: () => true, isConfused: () => false });
    const Game_Battler = cls({}, Game_BattlerBase);
    const Game_Actor = cls({ isActor: () => true, isEnemy: () => false }, Game_Battler);
    const Game_Enemy = cls({ isActor: () => false, isEnemy: () => true, screenX() { return this._x; }, screenY() { return this._y; } }, Game_Battler);
    for (const K of [Game_Actor, Game_Enemy]) {
        Object.assign(K.prototype, {
            name() { return this._name; }, isAlive() { return this._hp > 0; }, isDead() { return this._hp <= 0; }, index() { return this.friendsUnit().members().indexOf(this); },
            enemy() { return this._data; }, isAppeared() { return !this._hidden; }, isHidden() { return !!this._hidden; },
            get hp() { return this._hp; }, get mhp() { return this._mhp || 100; }
        });
    }
    const checks = {
        isForOpponent: [1, 2, 3, 4, 5, 6], isForFriend: [7, 8, 9, 10, 11], isForAll: [2, 8, 10], needsSelection: [1, 7, 9],
        isForOne: [1, 3, 7, 9, 11], isForUser: [11], isForDeadFriend: [9, 10], isForAliveFriend: [7, 8, 11], isForRandom: [3, 4, 5, 6]
    };
    const Game_Action = cls(Object.assign({
        clear() { this._item = null; this._targetIndex = -1; },
        item() { return this._item; }, subject() { return this._subject; }, setSkill(id) { this._item = $dataSkills[id]; }, setItem(id) { this._item = $dataItems[id]; },
        opponentsUnit() { return this._subject.isActor() ? ctx.$gameTroop : ctx.$gameParty; }, friendsUnit() { return this._subject.isActor() ? ctx.$gameParty : ctx.$gameTroop; },
        numTargets() { return this.isForRandom() ? this.item().scope - 2 : 0; }, numRepeats() { return this.item().repeats; }, confusionTarget() { return null; },
        testApply() { return true; },
        targetsForFriends() { return [this.friendsUnit().smoothTarget(this._targetIndex)]; },
        makeTargets() {
            let t = [];
            if (this.isForOpponent()) t = this.isForRandom() ? Array.from({ length: this.numTargets() }, () => this.opponentsUnit().randomTarget())
                : this.isForAll() ? this.opponentsUnit().aliveMembers() : [this.opponentsUnit().smoothTarget(this._targetIndex)];
            else if (this.isForFriend()) t = this.targetsForFriends();
            return this.repeatTargets(t);
        },
        repeatTargets(t) { const out = []; for (const b of t) if (b) for (let i = 0; i < this.numRepeats(); i++) out.push(b); return out; }
    }, Object.fromEntries(Object.entries(checks).map(([name, list]) => [name, function() { return list.includes(this.item().scope); }]))));
    const invoked = [];
    const Window_Selectable = cls({ isCurrentItemEnabled: () => true, processHandling() { this._handled = true; } });
    class Sprite { constructor(bitmap) { this.bitmap = bitmap; this.initialize(bitmap); } initialize() { this.anchor = { set() {} }; this.scale = { x: 1, y: 1 }; this.children = []; } update() {} addChild(c) { this.children.push(c); } addChildAt(c, i) { this.children.splice(i, 0, c); } }
    const scope = (item) => (item ? item.scope : 0);
    const RRYanflyBattleScope = {
        forOpponent: (i) => [1, 2, 3, 4, 5, 6].includes(scope(i)), forFriend: (i) => [7, 8, 9, 10, 11].includes(scope(i)), forAll: (i) => [2, 8, 10].includes(scope(i)),
        needSelection: (i) => [1, 7, 9].includes(scope(i)), forRandom: (i) => [3, 4, 5, 6].includes(scope(i)), forUser: (i) => scope(i) === 11,
        forDeadFriend: (i) => [9, 10].includes(scope(i)), numberOfTargets: (i) => ([3, 4, 5, 6].includes(scope(i)) ? scope(i) - 2 : 0)
    };
    const ctx = {
        PluginManager: { parameters: (name) => parameters[name] || {} },
        DataManager: { isDatabaseLoaded: () => true, isSkill: (i) => $dataSkills.includes(i), isItem: (i) => $dataItems.includes(i) },
        Game_BattlerBase, Game_Battler, Game_Actor, Game_Enemy, Game_Action, Game_Troop: cls(), Window_Selectable, Sprite, RRYanflyBattleScope,
        Window_BattleActor: cls({}, Window_Selectable), Window_BattleEnemy: cls({ enemy() { return this._enemies[this._index]; }, index() { return this._index; }, update() {} }, Window_Selectable),
        Window_BattleHelp: cls({ rrRefreshSpecialCase() {} }), Scene_Battle: cls({ onActorOk() { invoked.push('actorOk'); } }), Scene_Skill: cls({ useItem() { invoked.push('used'); } }),
        Spriteset_Battle: cls({ createLowerLayer() {} }), Scene_Base: cls(), Bitmap: cls(), SceneManager: { _scene: null }, ImageManager: {}, ColorManager: {},
        BattleManager: { invokeAction(subject, target) { invoked.push(target._name); }, actor: () => ctx._inputActor || null },
        SoundManager: { playBuzzer: () => invoked.push('buzzer'), playCursor: () => invoked.push('cursor') },
        Input: { update() {}, dir4: 0, dir8: 0, isRepeated: () => false }, TouchInput: { x: 0, y: 0 },
        Graphics: { width: 640, height: 480 }, PIXI: { BLEND_MODES: { NORMAL: 0, ADD: 1 } },
        Math: Object.assign(Object.create(Math), { randomInt: () => 0 }),
        $dataSkills, $dataItems, $gameTemp: {}, invoked
    };
    ctx.window = ctx;
    for (const name of plugins) vm.runInNewContext(plugin(name), ctx);
    ctx.DataManager.isDatabaseLoaded();
    const actor = (name, x, y, hp = 10) => Object.assign(Object.create(Game_Actor.prototype), { _name: name, _hp: hp, _x: x, _y: y, rrScreenX() { return this._x; }, rrScreenY() { return this._y; } });
    const enemy = (name, x, y, note = '', hp = 10) => Object.assign(Object.create(Game_Enemy.prototype), { _name: name, _hp: hp, _x: x, _y: y, _data: { note, name } });
    ctx.party = [actor('Jay', 500, 300), actor('Kim', 560, 300)];
    ctx.troop = [enemy('A', 100, 200), enemy('B', 160, 200), enemy('C', 400, 200)];
    ctx.$gameParty = Object.assign(unitOf(ctx.party), { battleMembers: () => ctx.party, maxBattleMembers: () => 4 });
    ctx.$gameTroop = Object.assign(Object.create(ctx.Game_Troop.prototype), unitOf(ctx.troop));
    for (const b of ctx.party) b.friendsUnit = () => ctx.$gameParty;
    for (const b of ctx.troop) b.friendsUnit = () => ctx.$gameTroop;
    ctx.action = (subject, id, kind = 'skill') => {
        const a = new Game_Action();
        a._subject = subject;
        a.clear();
        a._rrAlly = false;
        if (kind === 'skill') a.setSkill(id); else a.setItem(id);
        return a;
    };
    return ctx;
}
const names = (list) => list.map(b => b && b._name);

test('Target Manager: the notes set the scope, the hits and the total hits', () => {
    const ctx = battle({ plugins: ['RR_YanflyTargetManager'], skills: [
        { note: '<targets: everybody>' }, { note: '<targets: target all foes>' }, { note: '<target: 2 random foes>\n<total hits: 12>' },
        { note: '<targets: target 3 random allies>', scope: 7 }, { note: '<targets: all but user>' }, { scope: 4 }
    ] });
    const s = ctx.$dataSkills;
    assert.deepEqual([s[1].scope, s[2].scope, s[3].scope, s[4].scope, s[5].scope], ['everybody', 'target_all_foes', 3, 'target_random_allies', 'all_but_user']);
    assert.deepEqual([s[3]._rrRandomHits, s[3].repeats, s[4]._rrRandomHits, s[6]._rrRandomHits], [2, 12, 3, 2]);
    const jay = ctx.party[0];
    const a = (id) => ctx.action(jay, id);
    assert.deepEqual([a(1).isForOpponent(), a(1).isForFriend(), a(1).needsSelection()], [false, false, false]);
    assert.deepEqual([a(2).isForOpponent(), a(2).needsSelection(), a(2).isForAll()], [true, true, false]);
    assert.deepEqual([a(5).isForFriend(), a(5).isForAll(), a(5).isForAliveFriend()], [true, true, true]);
    assert.equal(a(4).numTargets(), 3);
    assert.equal(ctx.RRYanflyBattleScope.needSelection(s[4]), true);
    assert.equal(ctx.RRYanflyBattleScope.numberOfTargets(s[3]), 2);
});

test('Target Manager: custom targets, the chosen one first; -1 reads the last member; repeats come last', () => {
    const ctx = battle({ plugins: ['RR_YanflyTargetManager'], skills: [
        { note: '<targets: everybody>' }, { note: '<targets: target all foes>', repeats: 2 }, { note: '<targets: all but user>' }, { note: '<targets: target 1 random foes>' }
    ] });
    const jay = ctx.party[0];
    assert.deepEqual(names(ctx.action(jay, 1).makeTargets()), ['A', 'B', 'C', 'Jay', 'Kim']);
    const all = ctx.action(jay, 2);
    all._targetIndex = 1;
    assert.deepEqual(names(all.makeTargets()), ['B', 'B', 'A', 'A', 'C', 'C']);
    assert.deepEqual(names(ctx.action(jay, 3).makeTargets()), ['Kim']);
    const random = ctx.action(jay, 4);            // target -1: C, the last enemy; then the random one (A)
    assert.deepEqual(names(random.makeTargets()), ['C', 'A']);
    ctx.troop[2]._hp = 0;                         // C down: -1 falls to the first living
    assert.deepEqual(names(random.makeTargets()), ['A', 'A']);
});

test('Target Manager: a random hit on a fallen battler moves to a living one of its side', () => {
    const ctx = battle({ plugins: ['RR_YanflyTargetManager'], skills: [{ scope: 3 }, { scope: 1 }] });
    const [a, b] = ctx.troop;
    a._hp = 0;
    ctx.BattleManager._action = ctx.action(ctx.party[0], 1);
    ctx.BattleManager.invokeAction(ctx.party[0], a);
    ctx.BattleManager._action = ctx.action(ctx.party[0], 2);
    ctx.BattleManager.invokeAction(ctx.party[0], a);
    assert.deepEqual(ctx.invoked, [b._name, 'A']);
});

test('Target Any: opens on the database side, aims at the side chosen', () => {
    const ctx = battle({ plugins: ['RR_YanflyTargetManager', 'RR_TargetAnyAddOn'], items: [{ scope: 7, note: '<targets: any>' }], skills: [{ note: '<targets: any all>' }, { note: '<targets: any>' }] });
    const water = ctx.$dataItems[1], allSides = ctx.$dataSkills[1];
    assert.equal(water.scope, 'target_any');
    assert.equal(water._rrDefaultForFriend, true);
    assert.equal(allSides._rrDefaultForFriend, false);
    const jay = ctx.party[0];
    const use = ctx.action(jay, 1, 'item');
    assert.equal(use._rrAlly, true);
    assert.deepEqual([use.isForOpponent(), use.isForFriend(), use.needsSelection(), use.isForAll()], [true, true, true, false]);
    use._targetIndex = 1;
    assert.deepEqual(names(use.makeTargets()), ['Kim']);
    use.rrSetAlly(false);
    assert.deepEqual(names(use.makeTargets()), ['B']);
    const sweep = ctx.action(jay, 1);
    assert.deepEqual(names(sweep.makeTargets()), ['A', 'B', 'C']);
    sweep.rrSetAlly(true);
    assert.deepEqual(names(sweep.makeTargets()), ['Jay', 'Kim']);
    // An enemy's melee <targets: any> skill: target -1, the party's last member.
    assert.deepEqual(names(ctx.action(ctx.troop[0], 2).makeTargets()), ['Kim']);
});

test('Target One Ally: not on the user, not alone; enemies pick a random troop member', () => {
    const ctx = battle({ plugins: ['RR_TargetOneAlly'], skills: [{ scope: 7, note: '<one_ally_no_user>' }, { scope: 7 }] });
    const [jay, kim] = ctx.party;
    const skill = ctx.$dataSkills[1];
    assert.equal(jay.canUse(skill), true);
    kim._hp = 0;
    assert.equal(jay.canUse(skill), false);
    kim._hp = 10;
    const a = ctx.action(jay, 1);
    assert.equal(a.testApply(jay), false);
    assert.equal(a.testApply(kim), true);
    assert.equal(ctx.action(jay, 2).testApply(jay), true);
    const heal = ctx.action(ctx.troop[0], 1);     // the troop minus the user; randomInt gives the first
    assert.deepEqual(names(heal.targetsForFriends()), ['B']);
    ctx._inputActor = jay;
    jay.inputtingAction = () => a;
    const scene = new ctx.Scene_Battle();
    scene._actorWindow = { index: () => 0 };
    ctx.$gameParty.battleMembers = () => ctx.party;
    scene.onActorOk();
    scene._actorWindow = { index: () => 1 };
    scene.onActorOk();
    assert.deepEqual(ctx.invoked, ['buzzer', 'actorOk']);
});

test('Area of Effect: the ellipse and the row reach a hitbox; the area centres on the chosen enemy', () => {
    const ctx = battle({ plugins: ['RR_YanflyTargetManager', 'RR_YanflyAreaOfEffect'], skills: [{ note: '<aoe radius: 50>' }, { note: '<aoe row: 30>' }, { note: '<aoe column: 3>' }] });
    // Enemy images 40 × 40 (the sprite size stands in).
    for (const e of ctx.troop) { e.rrHitboxWidth = () => 40; e.rrHitboxHeight = () => 40; }
    const jay = ctx.party[0];
    const blast = ctx.action(jay, 1);
    blast._targetIndex = 0;
    // A at (100, 192) after its -8 offset; a = 51 × 1.125, b = 51 × 0.34. B's box starts at x 140: 40 px off.
    assert.equal(blast.rrInsideAoeCircle(ctx.troop[0], ctx.troop[1]), true);
    assert.equal(blast.rrInsideAoeCircle(ctx.troop[0], ctx.troop[2]), false);
    assert.deepEqual(names(blast.makeTargets()), ['A', 'B']);
    const row = ctx.action(jay, 2);
    row._targetIndex = 2;
    assert.deepEqual(names(row.makeTargets()), ['C', 'A', 'B']);
    const column = ctx.action(jay, 3);
    column._targetIndex = 1;
    assert.deepEqual(names(column.makeTargets()), ['B']);
    assert.equal(ctx.$dataSkills[3]._rrAoe.rectValue, 3);
    // Enemy notes: offsets and hitbox sizes.
    const tall = ctx.troop[2];
    tall._data = { name: 'C', note: '<hitbox height: 25>\n<offset x: +6>' };   // notes are read once per enemy
    delete tall.rrHitboxHeight;
    assert.equal(tall.rrHitboxHeight(), 25);
    assert.deepEqual(plain(tall.rrHitbox()), { x: 386, y: 167, width: 40, height: 25 });
});

test('Cone: inside the angle from the user towards the chosen enemy and within range', () => {
    const ctx = battle({ plugins: ['RR_YanflyTargetManager', 'RR_YanflyAreaOfEffect', 'RR_UnifiedEnemyCursor'], skills: [{ note: '<aoe cone: 50>\n<aoe range: 300>' }, { note: '<aoe cone: 1>\n<aoe range: 1000>' }] });
    const jay = ctx.party[0];                     // at (500, 300); no sprite, so the cone starts at its feet
    const [, b, c] = ctx.troop;
    const shot = ctx.action(jay, 1);
    assert.equal(shot.rrInsideAoeCone(jay, c, c), true);
    assert.equal(shot.rrInsideAoeCone(jay, c, b), false);       // 340 px away: past the range
    b._x = 250; b._y = 250;
    assert.equal(shot.rrInsideAoeCone(jay, b, b), true);
    shot._targetIndex = 2;
    assert.deepEqual(names(shot.makeTargets()), ['C']);
    const snipe = ctx.action(jay, 2);
    snipe._targetIndex = 0;
    assert.deepEqual(names(snipe.makeTargets()), ['A']);
});

test('Mouse Enemy Select: the box stands on the feet; the Area of Effect notes take over', () => {
    const ctx = battle({ plugins: ['RR_MouseEnemySelect'] });
    const e = ctx.troop[0];
    e._data.note = '<selectbox width: 30>\n<selectbox height: 50>';
    assert.deepEqual(plain(e.rrSelectbox()), { x: 85, y: 142, width: 30, height: 50 });
    ctx.RRYanflyAoe = { enemyNotes: () => ({ offsetX: 0, offsetY: -8, width: null, height: 20 }) };
    assert.deepEqual(plain(e.rrSelectbox()), { x: 85, y: 172, width: 30, height: 20 });
});

test('Big Boss HP Bar: the first living boss, else a fallen one still on the field; notes', () => {
    const ctx = battle({ plugins: ['RR_BigBossHpBar'] });
    const [a, b, c] = ctx.troop;
    b._data.note = '<boss hp bar>\n<boss bar name: The Big One >\n<boss bar color1: 5>';
    c._data.note = '<boss_hp_bar>';
    assert.equal(ctx.$gameTroop.rrBossBarEnemy(), b);
    b._hp = 0;
    assert.equal(ctx.$gameTroop.rrBossBarEnemy(), c);
    c._hp = 0;
    assert.equal(ctx.$gameTroop.rrBossBarEnemy(), b);
    assert.deepEqual(plain(ctx.RRBigBossHpBar.bossNotes(b._data)), { boss: true, name: 'The Big One', color1: 5, color2: 10 });
    assert.equal(ctx.RRBigBossHpBar.bossNotes(a._data).boss, false);
});
