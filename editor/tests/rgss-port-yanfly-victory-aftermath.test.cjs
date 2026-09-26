'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_YanflyVictoryAftermath.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_YanflyVictoryAftermath.params.js'));

// The settings block of Dreamwalker's copy.
const SCRIPT = `$imported = {} if $imported.nil?
$imported["YEA-VictoryAftermath"] = true
module YEA
  module VICTORY_AFTERMATH
    VICTORY_BGM  = RPG::BGM.new("", 100, 100)    # Victory BGM
    VICTORY_TICK = RPG::SE.new("GUI_click_05", 100, 100)  # EXP ticking SFX
    LEVEL_SOUND  = RPG::SE.new("Level_Up_v1", 100, 100)         # Level Up SFX
    SKILLS_TEXT  = "New Skills"                        # New skills text title.
    SKIP_AFTERMATH_SWITCH  = 0  # If switch on, skip aftermath. 0 to disable.
    SKIP_MUSIC_SWITCH      = 0  # If switch on, skip music. 0 to disable.
    AFTERMATH_COMMON_EVENT = 0  # Runs common event after battle. 0 to disable.
    TOP_TEAM         = "%s's party"          # Team name used.
    TOP_VICTORY_TEXT = "%s is victorious"   # Text used to display victory.
    TOP_LEVEL_UP     = "%s has leveled up"  # Text used to display level up.
    TOP_SPOILS       = "Loot"              # Text used for spoils.
    VICTORY_EXP  = "+%s EXP"      # Text used to display EXP.
    EXP_PERCENT  = "%1.2f%%"     # The way EXP percentage will be displayed.
    LEVELUP_TEXT = "LEVEL UP!"   # Text to replace percentage when leveled.
    MAX_LVL_TEXT = "MAX LEVEL"   # Text to replace percentage when max level.
    FONTSIZE_EXP = 18            # Font size used for EXP.
    EXP_TICKS    = 15            # Ticks to full EXP
    EXP_GAUGE1   = 26            # "Window" skin text colour for gauge.
    EXP_GAUGE2   = 27            # "Window" skin text colour for gauge.
    LEVEL_GAUGE1 = 13            # "Window" skin text colour for leveling.
    LEVEL_GAUGE2 = 5             # "Window" skin text colour for leveling.
    HEADER_TEXT = "\\e>\\eC[6]%s\\eC[0]\\e<\\n"  # Always at start of messages.
    FOOTER_TEXT = ""                        # Always at end of messages.
    VICTORY_QUOTES ={
    # :type   => Quotes
      :win    => [ # Occurs as initial victory quote.
                   'Victory...',
                 ],# Do not remove this.
      :level  => [ # Occurs as initial victory quote.
                   'Level Up!',
                 ],# Do not remove this.
      :drops  => [ # Occurs as initial victory quote.
                   'The enemy dropped something...',
                 ],# Do not remove this.
    } # Do not remove this.
  end # VICTORY_AFTERMATH
end # YEA`;
const EQUIP_LEARNING = `$imported["YES-EquipmentLearning"] = true
module YES
  module EQUIPMENT_LEARNING
    VICTORY_AFTERMATH = "+%s%s"
    VICTORY_AFTERMATH_QUOTES = { # Start.
      :el_learn => ["" # Occurs when actor has learnt skills from Equipments.
                   ],# Do not remove this.
    } # End.
  end
end`;
const CORE = `module YEA
  module CORE
    FONT_SIZE = 18
  end
end
Font.default_size = YEA::CORE::FONT_SIZE`;

test('Victory Aftermath: detected; settings, sounds and quotes from the game copy', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('yeaVictoryAftermath'));
    assert.ok(!C.scriptFamilies(['module BattleManager\n  def self.process_victory\n  end\nend']).has('yeaVictoryAftermath'));
    const scripts = [CORE, SCRIPT, EQUIP_LEARNING];
    const p = extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.deepEqual(JSON.parse(p.victoryBgm), { name: '', volume: 100, pitch: 100 });
    assert.deepEqual(JSON.parse(p.victoryTick), { name: 'GUI_click_05', volume: 100, pitch: 100 });
    assert.deepEqual(JSON.parse(p.levelSound), { name: 'Level_Up_v1', volume: 100, pitch: 100 });
    assert.equal(p.topVictory, '%s is victorious');
    assert.equal(p.expPercent, '%1.2f%%');
    assert.equal(p.expGauge1, '26');
    assert.equal(p.headerText, '\\>\\C[6]%s\\C[0]\\<\n');
    assert.deepEqual(JSON.parse(p.quotes), { win: ['Victory...'], level: ['Level Up!'], drops: ['The enemy dropped something...'], el_learn: [''] });
    assert.equal(p.rgssFontSize, '18');
    // Without Equipment Learning there are no el_learn quotes.
    assert.equal(JSON.parse(extract({ scripts: [SCRIPT] }).quotes).el_learn, undefined);
});

/** The plugin over a small MZ-shaped battle: actors, party, troop, message, scene and BattleManager. */
function load(parameters = {}) {
    const extracted = extract({ scripts: [CORE, SCRIPT, EQUIP_LEARNING], constants: C.scriptConstants([CORE, SCRIPT, EQUIP_LEARNING]) });
    const log = [];
    const cls = (base) => { function K() { this.initialize && this.initialize(...arguments); } if (base) K.prototype = Object.create(base.prototype); return K; };
    const Window_Base = cls();
    Object.assign(Window_Base.prototype, {
        initialize(rect) { this.rect = rect; this.visible = true; this.openness = 255; this.innerWidth = rect ? rect.width - 24 : 0; this.innerHeight = rect ? rect.height - 24 : 0; this.contents = { clear() {}, blt() {}, fontSize: 24 }; this.texts = []; },
        lineHeight() { return 24; }, resetFontSettings() {}, changeTextColor() {}, drawText(t) { this.texts.push(String(t)); },
        open() { this.openness = 255; }, close() { this.openness = 0; }, show() { this.visible = true; }, hide() { this.visible = false; },
        isOpen() { return this.openness >= 255; }, update() {}, rrAceGauge() {}, rrAceDrawItemName(item) { this.texts.push(item.name); },
        rrAceDrawCurrencyValue(v) { this.texts.push('gold ' + v); }
    });
    const Window_Selectable = cls(Window_Base);
    Object.assign(Window_Selectable.prototype, {
        itemHeight() { return 24; }, itemRect(i) { return { x: 0, y: i * 24, width: 100, height: 24 }; },
        refresh() { this.texts = []; for (let i = 0; i < this.maxItems(); i++) this.drawItem(i); },
        select(i) { this._index = i; }, deselect() { this._index = -1; }, activate() { this.active = true; }, deactivate() { this.active = false; }
    });
    const Scene_Battle = cls();
    Scene_Battle.prototype.createAllWindows = function() {};
    Scene_Battle.prototype.addWindow = function() {};
    Scene_Battle.prototype.calcWindowHeight = (n) => n * 24 + 24;
    const learnings = { 2: [7] };
    function Game_Actor(id, name) { this._actorId = id; this._name = name; this.level = 1; this._exp = 0; this._skills = []; }
    Object.assign(Game_Actor.prototype, {
        actor() { return ctx.$dataActors[this._actorId]; }, currentClass() { return ctx.$dataClasses[1]; },
        name() { return this._name; }, faceName() { return 'face' + this._actorId; }, faceIndex() { return 0; },
        currentExp() { return this._exp; }, currentLevelExp() { return (this.level - 1) * 100; }, nextLevelExp() { return this.level * 100; },
        isMaxLevel() { return false; }, finalExpRate() { return 1; }, paramBase(i) { return this.level * 10 + i; },
        skills() { return this._skills.map(id => ctx.$dataSkills[id]); },
        changeExp(exp, show) {
            this._exp = exp;
            log.push(this._name + ' exp ' + exp + (show ? ' shown' : ''));
            while (this._exp >= this.nextLevelExp()) { this.level++; for (const id of learnings[this.level] || []) this._skills.push(id); }
        }
    });
    const messages = [];
    const ctx = {
        Window_Base, Window_Selectable, Scene_Battle, Game_Actor, Rectangle: function(x, y, width, height) { Object.assign(this, { x, y, width, height }); },
        Graphics: { boxWidth: 640, boxHeight: 480 }, ColorManager: { textColor() {}, powerUpColor() {}, systemColor() {}, normalColor() {}, paramchangeTextColor() {} },
        TextManager: { level: 'Level', param: (i) => 'P' + i, currencyUnit: 'G' },
        ImageManager: { loadFace: () => ({ isReady: () => true }) },
        AudioManager: { playSe: (s) => log.push('se ' + s.name), playMe: (m) => log.push('me ' + m.name), stopBgm: () => log.push('stop bgm'), playBgm: (b) => log.push('bgm ' + b.name) },
        DataManager: { isItem: (i) => i.kind === 'item', isWeapon: (i) => i.kind === 'weapon', isArmor: (i) => i.kind === 'armor' },
        $dataActors: [null, { note: '<win quotes>\r\nThey didn\'t\r\neven stand a chance.\r\n[New Quote]\r\nNot even close.\r\n</win quotes>' }, { note: '' }],
        $dataClasses: [null, { note: '<level quotes>\nClass level quote\n</level quotes>' }],
        $dataSkills: [null, null, null, null, null, null, null, { id: 7, name: 'Seven' }, { id: 8, name: 'Eight' }],
        $plugins: [], $gameSwitches: { _on: {}, value(id) { return !!this._on[id]; } },
        $gameSystem: { mainFontSize: () => 24, victoryMe: () => ({ name: 'victory' }) },
        $gameTemp: { reserveCommonEvent: (id) => log.push('common event ' + id) },
        $gameMessage: { _busy: false, isBusy() { return this._busy; }, setFaceImage(n) { this._face = n; }, add(t) { messages.push([this._face, t]); this._busy = true; } },
        Math: Object.assign(Object.create(Math), { randomInt: () => 0 }),
        window: {},
        PluginManager: { parameters: (name) => (name === 'RR_YanflyVictoryAftermath' ? Object.assign({}, extracted, parameters) : {}) }
    };
    const jay = new Game_Actor(1, 'Jay'), jason = new Game_Actor(2, 'Jason');
    jason._exp = 95;
    const items = [{ id: 3, kind: 'weapon', name: 'Typhon' }, { id: 5, kind: 'item', name: 'Rounds' }, { id: 2, kind: 'item', name: 'Medkit' }, { id: 5, kind: 'item', name: 'Rounds' }];
    items[3] = items[1];
    ctx.$gameParty = {
        allMembers: () => [jay, jason], battleMembers: () => [jay, jason], randomTarget: () => jay,
        removeBattleStates() {}, performVictory() {}, gainGold: (g) => log.push('gold ' + g), gainItem: (i) => log.push('item ' + i.name)
    };
    ctx.$gameTroop = { expTotal: () => 10 };
    ctx.SceneManager = {};
    const BattleManager = {
        _phase: 'turn', setup() {}, cancelActorInput() {}, playVictoryMe() { ctx.AudioManager.playMe(ctx.$gameSystem.victoryMe()); },
        makeRewards() { this._rewards = { exp: 10, gold: 270, items }; },
        gainExp() { log.push('mz gainExp'); }, gainGold() { ctx.$gameParty.gainGold(this._rewards.gold); }, gainDropItems() { log.push('mz drops'); },
        replayBgmAndBgs() { log.push('replay'); }, updateBattleEnd() { log.push('pop'); this._phase = ''; },
        endBattle(result) { this._phase = 'battleEnd'; log.push('end ' + result); }
    };
    ctx.BattleManager = BattleManager;
    vm.runInNewContext(source, ctx);
    const scene = new Scene_Battle();
    Object.setPrototypeOf(scene, ctx.Scene_Battle.prototype);
    scene.createAllWindows();
    ctx.SceneManager._scene = scene;
    // A battle frame: the end phase runs while no message shows; the player closes each message.
    const frames = (n = 40) => { for (let i = 0; i < n && BattleManager._phase === 'battleEnd'; i++) { if (!ctx.$gameMessage._busy) BattleManager.updateBattleEnd(); } };
    const closeMessage = () => { ctx.$gameMessage._busy = false; };
    return { ctx, log, messages, scene, jay, jason, BattleManager, frames, closeMessage };
}

test('Victory Aftermath: quotes come from the actor note, then the class note, then the defaults; lines run together', () => {
    const { jay, jason } = load();
    assert.deepEqual([...jay.rrVictoryQuotes('win')], ["They didn'teven stand a chance.", 'Not even close.']);
    assert.deepEqual([...jason.rrVictoryQuotes('win')], ['Victory...']);
    assert.deepEqual([...jason.rrVictoryQuotes('level')], ['Class level quote']);
    assert.deepEqual([...jay.rrVictoryQuotes('drops')], ['The enemy dropped something...']);
    assert.deepEqual([...jay.rrVictoryQuotes('el_learn')], ['']);
});

test('Victory Aftermath: the pages in order, each waiting for its quote; level ups and Equipment Learning pages follow the EXP', () => {
    const t = load();
    const { ctx, log, messages, scene, BattleManager, frames, closeMessage } = t;
    // Equipment Learning wraps the EXP step and reports a change of skills after it.
    const gainExp = BattleManager.gainExp;
    BattleManager.gainExp = function() { gainExp.call(this); this.rrShowVictoryElLearn(t.jason, [], [ctx.$dataSkills[8]]); };
    BattleManager.processVictory();
    assert.deepEqual(log.slice(0, 2), ['me victory', 'stop bgm']);
    assert.equal(BattleManager._phase, 'battleEnd');
    frames();
    assert.equal(scene._rrVictoryTitle.texts.pop(), "Jay's party is victorious");
    assert.equal(scene._rrVictoryExpBack.isOpen(), true);
    assert.deepEqual(messages.pop(), ['face1', "\\>\\C[6]Jay\\C[0]\\<\nThey didn'teven stand a chance."]);
    closeMessage();
    frames();
    // Jason (95 + 10) reached level 2 and learned skill 7; EXP in battle shows no level-up message.
    assert.ok(log.includes('Jason exp 105') && !log.some(l => l.endsWith('shown')));
    assert.equal(scene._rrVictoryTitle.texts.pop(), 'Jason has leveled up');
    assert.equal(scene._rrVictoryExpFront.visible, false);
    assert.deepEqual([...scene._rrVictorySkills.texts], ['Seven']);
    assert.ok(log.includes('se Level_Up_v1'));
    assert.deepEqual(messages.pop(), ['face2', '\\>\\C[6]Jason\\C[0]\\<\nClass level quote']);
    closeMessage();
    frames();
    assert.equal(scene._rrVictoryTitle.texts.pop(), 'Jason has unlocked new Equip Skills!');
    assert.deepEqual(messages.pop(), ['face2', '\\>\\C[6]Jason\\C[0]\\<\n']);
    closeMessage();
    frames();
    // Spoils: the gold, then items by id, then weapons, each counted.
    assert.equal(scene._rrVictoryTitle.texts.pop(), 'Loot');
    const spoils = scene._rrVictorySpoils;
    assert.deepEqual([...spoils._data.map(i => i && i.name)], [null, 'Medkit', 'Rounds', 'Typhon']);
    assert.deepEqual([...spoils._data.slice(1).map(i => spoils._rrGoods.get(i))], [1, 2, 1]);
    assert.equal(spoils._index, 0);
    assert.ok(log.includes('gold 270') && log.includes('item Typhon'));
    assert.deepEqual(messages.pop(), ['face1', '\\>\\C[6]Jay\\C[0]\\<\nThe enemy dropped something...']);
    closeMessage();
    frames(10);
    assert.equal(scene._rrVictoryTitle.openness, 0);
    assert.ok(!log.includes('end 0'), 'the windows close for 16 frames first');
    frames(20);
    assert.deepEqual(log.slice(-3), ['replay', 'end 0', 'pop']);
});

test('Victory Aftermath: the EXP gauge fills in ticks after 30 frames, and says LEVEL UP! when full', () => {
    const { scene, BattleManager, jay, jason } = load();
    BattleManager.makeRewards();
    scene.rrShowVictoryDisplayExp();
    const front = scene._rrVictoryExpFront;
    assert.equal(front._rrExpTotal, 10);
    front.texts = [];
    for (let i = 0; i < 29; i++) front.update();
    assert.equal(front._rrTicks, 0);
    front.update();
    assert.equal(front._rrTicks, 1);
    assert.deepEqual([...front.texts], ['0.00%', '95.00%']);
    for (let i = 0; i < 4 * 7; i++) front.update();
    assert.equal(front._rrTicks, 8);
    // Jay: 10 × 8 / 15 = 5 of 100; Jason: 95 + 5 is full.
    assert.deepEqual([...front.texts.slice(-2)], ['5.00%', 'LEVEL UP!']);
    jay._exp = 100;
    jason._exp = 100;
    for (let i = 0; i < 40; i++) front.update();
    assert.equal(front._rrTicks, 8, 'every gauge full: no more ticks');
});

test('Victory Aftermath: the skip switch gives the rewards with no screens or music; the common event follows any battle but a defeat', () => {
    const t = load({ skipAftermathSwitch: '5', commonEvent: '9' });
    t.ctx.$gameSwitches._on[5] = true;
    t.BattleManager.processVictory();
    t.frames(40);
    assert.ok(!t.log.some(l => l.startsWith('me ')));
    assert.equal(t.messages.length, 0);
    assert.ok(t.log.includes('Jay exp 10') && t.log.includes('gold 270') && t.log.includes('item Typhon'));
    assert.deepEqual(t.log.slice(-4), ['replay', 'end 0', 'common event 9', 'pop']);
    t.BattleManager.endBattle(2);
    assert.notEqual(t.log[t.log.length - 1], 'common event 9');
    t.BattleManager.endBattle(1);
    assert.equal(t.log[t.log.length - 1], 'common event 9');
});
