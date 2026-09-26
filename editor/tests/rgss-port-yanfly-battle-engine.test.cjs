'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const yeaParams = require(path.join(legacy, 'plugins', 'RR_YanflyBattleEngine.params.js'));
const catbParams = require(path.join(legacy, 'plugins', 'RR_YamiClassicalATB.params.js'));

// The settings blocks of Dreamwalker's copies.
const YEA = `$imported = {} if $imported.nil?
$imported["YEA-BattleEngine"] = true
module YEA
  module BATTLE
    BLINK_EFFECTS      = true  # Blink sprite when damaged?
    FLASH_WHITE_EFFECT = true   # Flash enemy white when it starts an attack.
    SCREEN_SHAKE       = false  # Shake screen in battle?
    SKIP_PARTY_COMMAND = true   # Skips the Fight/Escape menu.
    AUTO_FAST          = true   # Causes message windows to not wait.
    ENEMY_ATK_ANI      = 0    # Sets default attack animation for enemies.
    HIDE_POPUP_SWITCH  = 0
    DEFAULT_BATTLE_SYSTEM = :catb #catb     # Default battle system set.
    BATTLESTATUS_NAME_FONT_SIZE = 18    # Font size used for name.
    BATTLESTATUS_TEXT_FONT_SIZE = 18    # Font size used for HP, MP, TP.
    BATTLESTATUS_NO_ACTION_ICON = 0   # No action icon.
    BATTLESTATUS_HPGAUGE_Y_PLUS = 8    # Y Location buffer used for HP gauge.
    BATTLESTATUS_CENTER_FACES   = false # Center faces for the Battle Status.
    HELP_TEXT_ALL_FOES        = "All Foes"
    HELP_TEXT_MANY_RANDOM_FOE = "%d Random Foes"
    ENABLE_POPUPS  = true     # Set this to false if you wish to disable them.
    FLASH_CRITICAL = true     # Sets critical hits to flash.
    POPUP_SETTINGS ={
      :offset     => -5,         # Height offset of a popup.
      :fade       => 50,          # Fade rate for each popup.
      :full       => 60,          # Frames before a popup fades.
      :hp_dmg     => "-%s ",      # SprintF for HP damage.
      :hp_heal    => "+%s ",      # SprintF for HP healing.
      :mp_dmg     => "-%s ENERGY",    # SprintF for MP damage.
      :mp_heal    => "+%s ENERGY",    # SprintF for MP healing.
      :drained    => "DRAIN!",     # Text display for draining HP/MP.
      :missed     => "MISS!",      # Text display for missed attack.
      :nulled     => "0",      # Text display for nulled attack.
      :add_state  => "+%s",      # SprintF for added states.
      :rem_state  => "-%s",      # SprintF for removed states.
      :weakpoint  => "WEAKNESS", # Appears if foe is weak to element.
    } # Do not remove this.
    DEFAULT = ["Arial"]
    POPUP_RULES ={
      # Type     => [ Zoom1, Zoom2, Sz, Bold, Italic, Red, Grn, Blu, Font]
      "DEFAULT"  => [   0.5,   1.0, 18,  true,  false, 255, 255, 255, DEFAULT],
      "CRITICAL" => [   0.5,   1.0, 100, true,  false, 255,  80,  80, DEFAULT],
      "HP_DMG"   => [   0.5,   1.0, 18,  true,  false, 255, 255, 255, DEFAULT],
      "BUFF"     => [   2.0,   1.0, 18,  true,  false, 255, 240, 100, ["Verdana", "Arial"]],
    } # Do not remove this.
    MSG_ENEMY_APPEARS  = false  # Message when enemy appears start of battle.
    MSG_CURRENT_STATE  = true  # Show which states has affected battler.
  end # BATTLE
end # YEA`;
const CATB = `$imported = {} if $imported.nil?
$imported["YSA-CATB"] = true
module YSA
  module CATB
    DEFAULT_FILL_TIME = 200 # Frames
    DEFAULT_WAIT      = :wait # :full, :semi, :quarter, :wait
    FILL_TIME_VARIABLE  = 1 # Change DEFAULT_FILL_TIME by variable.
    PAUSE_WHEN_ACTIVE_PARTY_COMMAND = true
    PREEMTIVE_ATB_ACTOR = 70
    PREEMTIVE_ATB_ENEMY = 0
    SURPRISE_ATB_ACTOR = 100
    SURPRISE_ATB_ENEMY = 70
    FORCE_ACTION_CLEAR_ATB = true
    DEFAULT_TURN          = :tick # :tick, :action
    TICK_COUNT            = 150    # Turn after TICK_COUNT
    TICK_COUNT_VARIABLE   = 16     # Change TICK_COUNT by variable.
    AFTER_ACTION          = 1      # Turn after AFTER_ACTION actions.
    AFTER_ACTION_VARIABLE  = 17     # Change AFTER_ACTION by variable.
    FORCE_ACTION_COUNT = false # Count force action as a turn action?
    GAUGE_COLOR1 = 14
    GAUGE_COLOR2 = 6
    CHARGE_COLOR1 = 18
    CHARGE_COLOR2 = 10
    ATB_GAUGE_Y_PLUS = 5
    ATB_PHRASE = "AGI"
    SHOW_ENEMY_ATB_GAUGE    = true  # Display Enemy HP Gauge?
    ENEMY_GAUGE_WIDTH      = 25    # How wide the enemy gauges are.
    ENEMY_GAUGE_HEIGHT     = 1     # How tall the enemy gauges are.
    ENEMY_ATB_GAUGE_COLOUR1 = 14     # Colour 1 for ATB.
    ENEMY_ATB_GAUGE_COLOUR2 = 6     # Colour 2 for ATB.
    ENEMY_BACKGAUGE_COLOUR = 15     # Gauge Back colour.
  end
end`;
const FONT = 'Font.default_size = 18';

test('Battle Engine and Classical ATB: detected from their $imported flags', () => {
    const families = C.scriptFamilies([YEA, CATB]);
    assert.ok(families.has('yeaBattleEngine'));
    assert.ok(families.has('ysaCatb'));
    assert.ok(!C.scriptFamilies(['class Scene_Battle < Scene_Base\nend']).has('yeaBattleEngine'));
});

test('Battle Engine and Classical ATB: script calls translate', () => {
    const families = new Set(['yeaBattleEngine', 'ysaCatb']);
    const st = (s) => C.ruby(s, 'statement', { families });
    const ex = (s) => C.ruby(s, 'expression', { families });
    assert.match(st('$game_system.set_battle_system(:catb)'), /\$gameSystem\.rrSetBattleSystem\?\.\("catb"\)/);
    assert.match(st('$game_system.set_catb_wait_type(:full)'), /\$gameSystem\.rrSetCatbWaitType\?\.\("full"\)/);
    assert.match(st('$game_system.set_catb_turn_type(:action)'), /\$gameSystem\.rrSetCatbTurnType\?\.\("action"\)/);
    assert.match(ex('$game_system.battle_system == :catb'), /\$gameSystem\.rrBattleSystem\?\.\(\) === "catb"/);
    assert.match(ex('BattleManager.btype?(:dtb)'), /BattleManager\.rrBtype\?\.\("dtb"\)/);
});

test('Battle Engine: settings from the game copy', () => {
    const scripts = [FONT, YEA];
    const p = yeaParams.extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.equal(p.battleSystem, 'catb');
    assert.equal(p.skipPartyCommand, 'true');
    assert.equal(p.screenShake, 'false');
    assert.equal(p.noActionIcon, '0');
    assert.equal(p.hpGaugeYPlus, '8');
    assert.equal(p.nameFontSize, '18');
    assert.equal(p.rgssFontSize, '18');
    const settings = JSON.parse(p.popupSettings);
    assert.equal(settings.mp_dmg, '-%s ENERGY');
    assert.equal(settings.fade, 50);
    const rules = JSON.parse(p.popupRules);
    assert.deepEqual(rules.DEFAULT, [0.5, 1, 18, true, false, 255, 255, 255, ['Arial']]);
    assert.equal(rules.CRITICAL[2], 100);
    assert.deepEqual(rules.BUFF.slice(0, 2), [2, 1]);
    assert.deepEqual(rules.BUFF[8], ['Verdana', 'Arial']);
    assert.equal(JSON.parse(p.helpTexts).allFoes, 'All Foes');
    assert.equal(JSON.parse(p.messages).enemyAppears, false);
    assert.equal(JSON.parse(p.messages).currentState, true);
});

test('Classical ATB: settings from the game copy', () => {
    const p = catbParams.extract({ scripts: [CATB], constants: C.scriptConstants([CATB]) });
    assert.equal(p.waitType, 'wait');
    assert.equal(p.turnType, 'tick');
    assert.equal(p.fillTime, '200');
    assert.equal(p.fillTimeVariable, '1');
    assert.equal(p.tickCount, '150');
    assert.equal(p.tickCountVariable, '16');
    assert.equal(p.afterActionVariable, '17');
    assert.equal(p.surpriseActor, '100');
    assert.equal(p.phrase, 'AGI');
    assert.equal(p.enemyGaugeWidth, '25');
    assert.equal(p.enemyBackColour, '15');
});

/** Both plugins over a small MZ-shaped battle runtime. */
function load(options = {}) {
    const scripts = [FONT, YEA, CATB];
    const constants = C.scriptConstants(scripts);
    const parameters = {
        RR_YanflyBattleEngine: Object.assign(yeaParams.extract({ scripts, constants }), options.yea || {}),
        RR_YamiClassicalATB: Object.assign(catbParams.extract({ scripts, constants }), options.catb || {})
    };
    const K = (parent) => { function Klass() {} if (parent) Klass.prototype = Object.create(parent.prototype); return Klass; };
    const Window_Base = K(), Window_Selectable = K(Window_Base), Window_Command = K(Window_Selectable);
    const classes = {
        Window_Base, Window_Selectable, Window_Command, Window_Help: K(Window_Base), Window_BattleLog: K(Window_Selectable),
        Window_StatusBase: K(Window_Selectable), Window_PartyCommand: K(Window_Command), Window_ActorCommand: K(Window_Command),
        Window_SkillList: K(Window_Selectable), Window_ItemList: K(Window_Selectable),
        Sprite: K(), Scene_Base: K(), Game_BattlerBase: K(), Game_Unit: K(), Game_Action: K(), Game_ActionResult: K(), Game_System: K(), Spriteset_Battle: K()
    };
    classes.Window_BattleStatus = K(classes.Window_StatusBase);
    classes.Window_BattleActor = K(classes.Window_BattleStatus);
    classes.Window_BattleEnemy = K(Window_Selectable);
    classes.Sprite_Battler = K(classes.Sprite);
    classes.Sprite_Actor = K(classes.Sprite_Battler);
    classes.Sprite_Enemy = K(classes.Sprite_Battler);
    classes.Scene_Battle = K(classes.Scene_Base);
    classes.Game_Battler = K(classes.Game_BattlerBase);
    classes.Game_Actor = K(classes.Game_Battler);
    classes.Game_Enemy = K(classes.Game_Battler);
    const B = classes.Game_Battler.prototype;
    Object.assign(B, {
        canMove() { return !this._stuck; }, isActor() { return false; }, isEnemy() { return false; }, isDead() { return false; }, isAlive() { return true; },
        currentAction() { return this._actions[0]; }, makeActions() { this._made = (this._made || 0) + 1; }, result() { return this._result; },
        states() { return (this._states || []).map(id => ctx.$dataStates[id]); }, onTurnEnd() { this._turnEnds = (this._turnEnds || 0) + 1; },
        buffIconIndex(level, paramId) { return 32 + paramId; }, isAutoBattle() { return false; }
    });
    classes.Game_Actor.prototype.isActor = function() { return true; };
    classes.Game_Enemy.prototype.isEnemy = function() { return true; };
    Object.assign(classes.Game_ActionResult.prototype, {
        clear() { Object.assign(this, { hpDamage: 0, mpDamage: 0, tpDamage: 0, critical: false, missed: false, evaded: false, success: false, used: false }); },
        isHit() { return this.used && !this.missed && !this.evaded; }
    });
    classes.Game_Action.prototype.clear = function() { this._item = null; };
    const variables = {};
    const BattleManager = { isTpb: () => false, isActiveTpb: () => false, startBattle() {}, allBattleMembers() { return ctx.members; },
        actor() { return this._currentActor || null; } };
    const scene = new classes.Scene_Battle();
    const ctx = Object.assign({}, classes, {
        window: {}, BattleManager, Graphics: { width: 640, height: 480, boxWidth: 640, boxHeight: 480 },
        Rectangle: function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); },
        Input: { keyMapper: {} }, SceneManager: { _scene: scene }, TextManager: { param: (id) => ['MHP', 'MMP', 'ATK'][id] },
        $gameSystem: new classes.Game_System(), $gameVariables: { value: (id) => variables[id] || 0 }, $gameSwitches: { value: () => false },
        $gameParty: { inBattle: () => true }, $gameTroop: { _turn: 0, turnCount() { return this._turn; }, increaseTurn() { this._turn++; } },
        $gameTemp: {}, $dataStates: [null, { id: 1, name: 'Dead', iconIndex: 1, note: '', message3: '' }, { id: 2, name: 'Sleep', iconIndex: 6, note: '<popup add: POSITIVE>\n<popup hide rem>', message3: ' is asleep.' }],
        PluginManager: { parameters: (name) => parameters[name] || {} }
    });
    ctx.$gameSystem.mainFontSize = () => 16.1;
    vm.runInNewContext(plugin('RR_YanflyBattleEngine'), ctx);
    vm.runInNewContext(plugin('RR_YamiClassicalATB'), ctx);
    return { ctx, variables, scene };
}

const battler = (ctx, Klass, agi, extra = {}) => {
    const b = new Klass();
    const result = new ctx.Game_ActionResult();
    result.clear();
    return Object.assign(b, { agi, _actions: [], _result: result, _states: [] }, extra);
};

test('Classical ATB: gauges fill in the fill time at average AGI, from the variable when it holds more than 0', () => {
    const { ctx, variables } = load();
    ctx.BattleManager._rrBattleType = 'catb';
    ctx.BattleManager._rrAverageAgi = 10;
    const fast = battler(ctx, ctx.Game_Actor, 20), even = battler(ctx, ctx.Game_Enemy, 10);
    let frames = 0;
    while (even.rrCatbValue() < 100000 && frames < 1000) { even.rrMakeCatbUpdate(); fast.rrMakeCatbUpdate(); frames++; }
    assert.equal(frames, 200);
    assert.equal(fast.rrCatbValue(), 100000);
    variables[1] = '50';
    even._rrCatb = 0;
    frames = 0;
    while (even.rrCatbValue() < 100000 && frames < 1000) { even.rrMakeCatbUpdate(); frames++; }
    assert.equal(frames, 50);
    // A battler that cannot move does not fill, and a full one that cannot move is emptied.
    even._stuck = true;
    even._rrCatb = 5;
    even.rrMakeCatbUpdate();
    assert.equal(even.rrCatbValue(), 5);
    even._rrCatb = 100000;
    even.rrMakeCatbAction();
    assert.equal(even.rrCatbValue(), 0);
});

test('Classical ATB: the average AGI and the preemptive and surprise starting values', () => {
    const { ctx } = load();
    ctx.BattleManager._rrBattleType = 'catb';
    const actor = battler(ctx, ctx.Game_Actor, 7), enemy = battler(ctx, ctx.Game_Enemy, 4);
    ctx.$gameParty.members = () => [actor];
    ctx.$gameTroop.members = () => [enemy];
    ctx.BattleManager._surprise = true;
    ctx.BattleManager.startBattle();
    assert.equal(ctx.BattleManager.rrAverageAgi(), 5);
    assert.equal(actor.rrCatbValue(), 100);
    assert.equal(enemy.rrCatbValue(), 70);
    assert.equal(actor._made, 1);
    ctx.BattleManager._surprise = false;
    ctx.BattleManager._preemptive = true;
    ctx.BattleManager.startBattle();
    assert.equal(actor.rrCatbValue(), 70);
    assert.equal(enemy.rrCatbValue(), 0);
});

test('Classical ATB: casting waits for the actor to choose; <charge rate> fills a second gauge', () => {
    const { ctx } = load();
    ctx.BattleManager._rrBattleType = 'catb';
    ctx.BattleManager._rrAverageAgi = 10;
    const actor = battler(ctx, ctx.Game_Actor, 10);
    const action = { _confirm: false, item: () => ({ note: '<charge rate: 50%>' }), rrConfirm() { return this._confirm; } };
    actor._actions = [action];
    actor._rrCatb = 100000;
    actor.rrMakeCtCatbUpdate();
    assert.equal(actor.rrCtCatbValue(), 0);
    action._confirm = true;
    actor.rrMakeCtCatbUpdate();
    assert.equal(actor.rrCtCatbValue(), 250);
    assert.equal(actor.rrChargeSkillDone(), false);
    action.item = () => ({ note: '' });
    actor.rrMakeCtCatbUpdate();
    assert.equal(actor.rrChargeSkillDone(), true);
});

test('Classical ATB: the gauges stop as the wait type says', () => {
    const { ctx, scene } = load();
    ctx.BattleManager._rrBattleType = 'catb';
    const w = (active) => ({ active });
    Object.assign(scene, { _partyCommandWindow: w(false), _actorCommandWindow: w(true), _skillWindow: w(false), _itemWindow: w(false), _actorWindow: w(false), _enemyWindow: w(false) });
    assert.equal(scene.rrCatbPause(), true);
    ctx.$gameSystem.rrSetCatbWaitType('quarter');
    assert.equal(!!scene.rrCatbPause(), false);
    scene._enemyWindow.active = true;
    assert.equal(!!scene.rrCatbPause(), true);
    ctx.$gameSystem.rrSetCatbWaitType('full');
    assert.equal(!!scene.rrCatbPause(), false);
    scene._partyCommandWindow.active = true;
    assert.equal(scene.rrCatbPause(), true);
});

test('Classical ATB: a turn ends every battler turn and counts the troop turn', () => {
    const { ctx, scene } = load();
    ctx.BattleManager._rrBattleType = 'catb';
    const a = battler(ctx, ctx.Game_Actor, 1), e = battler(ctx, ctx.Game_Enemy, 1);
    ctx.members = [a, e];
    let refreshed = 0;
    scene._statusWindow = { refresh: () => refreshed++ };
    ctx.BattleManager.rrCatbTurnEnd();
    assert.equal(a._turnEnds, 1);
    assert.equal(e._turnEnds, 1);
    assert.equal(ctx.$gameTroop.turnCount(), 1);
    assert.equal(refreshed, 1);
    assert.equal(a.turnCount(), 1);
    // Only turn-end states count down at turn end; action-end ones after an action.
    ctx.$dataStates[3] = { id: 3, autoRemovalTiming: 1 };
    ctx.$dataStates[4] = { id: 4, autoRemovalTiming: 2 };
    a._states = [3, 4];
    a._stateTurns = { 3: 2, 4: 2 };
    a.updateStateTurns();
    assert.deepEqual({ ...a._stateTurns }, { 3: 2, 4: 1 });
    a.rrUpdateStateActions();
    assert.deepEqual({ ...a._stateTurns }, { 3: 1, 4: 1 });
});

test('Classical ATB: the full-gauge list keeps actors and enemies apart', () => {
    const { ctx } = load();
    const M = ctx.BattleManager;
    M._rrBattleType = 'catb';
    M.rrMakeCatbActionOrders();
    const a = battler(ctx, ctx.Game_Actor, 1), e = battler(ctx, ctx.Game_Enemy, 1);
    assert.equal(M.rrMakeCatbAction(a), true);
    assert.equal(M.rrMakeCatbAction(a), false);
    M.rrMakeCatbAction(e);
    assert.deepEqual([...M.rrActionList('actor')], [a]);
    assert.deepEqual([...M.rrActionList('enemy')], [e]);
    assert.deepEqual([...M.rrActionList()], [a, e]);
    M._currentActor = a;
    a._rrCatb = 100000;
    a.rrClearCatb();
    assert.equal(M.actor(), null);
    assert.deepEqual([...M.rrActionList()], [e]);
});

test('Battle Engine: damage popups read the result, then clear it for the next effect', () => {
    const { ctx } = load();
    const user = battler(ctx, ctx.Game_Actor, 1), target = battler(ctx, ctx.Game_Enemy, 1);
    ctx.SceneManager._scene = new ctx.Scene_Battle();
    Object.assign(target._result, { hpDamage: 12, mpDamage: -3, critical: true, _rrHpDrain: 12 });
    target.rrMakeDamagePopups(user);
    assert.deepEqual(JSON.parse(JSON.stringify(user._rrPopups)), [['DRAIN!', 'DRAIN', []], ['+12 ', 'HP_HEAL', []]]);
    assert.deepEqual(JSON.parse(JSON.stringify(target._rrPopups)), [['-12 ', 'HP_DMG', ['critical']], ['+3 ENERGY', 'MP_HEAL', ['critical']]]);
    assert.equal(target._result.hpDamage, 0);
    target._result.hpDamage = -5;
    target.rrMakeDamagePopups(user);
    target._result.rrRestoreDamage();
    assert.equal(target._result.hpDamage, 7);
    assert.equal(target._result.mpDamage, -3);
});

test('Battle Engine: miss, element and state popups', () => {
    const { ctx } = load();
    const target = battler(ctx, ctx.Game_Enemy, 1);
    ctx.SceneManager._scene = new ctx.Scene_Battle();
    Object.assign(target._result, { used: true, success: true });
    target.rrMakeMissPopups(null, { damage: { type: 1 } });
    assert.deepEqual(JSON.parse(JSON.stringify(target._rrPopups)), [['0', 'DEFAULT', []]]);
    target._rrPopups = [];
    target.rrMakeRatePopup(2);
    target.rrMakeRatePopup(1);
    target.rrMakeStatePopup(2, 'add_state');
    target.rrMakeStatePopup(2, 'rem_state');
    target.rrMakeStatePopup(1, 'dur_state');
    assert.deepEqual(JSON.parse(JSON.stringify(target._rrPopups)), [['WEAKNESS', 'WEAK_ELE', ['weakness']], ['+Sleep', 'POSITIVE', ['state', 6]]]);
    // Not in battle: nothing.
    ctx.SceneManager._scene = {};
    target._rrPopups = [];
    target.rrMakeRatePopup(2);
    assert.deepEqual(target._rrPopups, []);
});

test('Battle Engine: the battle system is chosen by the plugin, Classical ATB adding its own', () => {
    const { ctx } = load();
    assert.equal(ctx.$gameSystem.rrBattleSystem(), 'catb');
    ctx.$gameSystem.rrSetBattleSystem('ftb');
    assert.equal(ctx.$gameSystem.rrBattleSystem(), 'dtb');
    ctx.$gameSystem.rrSetBattleSystem(':catb');
    ctx.BattleManager.rrInitBattleType();
    assert.equal(ctx.BattleManager.rrBtype('catb'), true);
    assert.equal(ctx.BattleManager.isTpb(), true);
    ctx.$gameSystem.rrSetBattleSystem('dtb');
    ctx.BattleManager.rrInitBattleType();
    assert.equal(ctx.BattleManager.isTpb(), false);
});

test('Battle Engine: status columns split the window across the party slots', () => {
    const { ctx } = load();
    ctx.$gameParty.maxBattleMembers = () => 4;
    const w = new ctx.Window_BattleStatus();
    Object.assign(w, { innerWidth: 488, innerHeight: 96 });
    const r = w.itemRect(2);
    assert.deepEqual([r.x, r.y, r.width, r.height], [244, 0, 122, 96]);
});
