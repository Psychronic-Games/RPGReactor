'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_CscaAchievements.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_CscaAchievements.params.js'));

// The setup of Dreamwalker's copy, shortened to three achievements.
const SCRIPT = `module CSCA
  module ACHIEVEMENTS
    ACHIEVEMENT  = []
    DESCRIPTION  = []
    PROGRESS     = []
    REWARD       = []
    DESCRIPTION[0] = ["???"]
    DESCRIPTION[2] =
    ["You have completed all",
     "the ATLAS missions!"]
    DESCRIPTION[7] =
    ["You have reached the inventory",
     "limit for Handgun Rounds!"]
    PROGRESS[0] = [[:atlas01, :atlas02, :atlas03], 3, "Complete ATLAS Operations", :sqc]  # 10 max, tracks variable ID5.
    PROGRESS[3] = [62, 14,"Claymores Defused", :var]
    PROGRESS[7] = [13, 100, "Handgun Rounds", :item]
    REWARD[0] = [10000, 0, :gold] # 10,000 gold.
    ACHIEVEMENT[0] = {
    :symbol => :ach01,
    :name => "ATLAS Shrugged",
    :name_before_unlock => "???",
    :description => DESCRIPTION[2],
    :description_before_unlock => DESCRIPTION[0],
    :progress => PROGRESS[0],
    :reward => REWARD[0],
    :graphic => nil,
    :points => 0,
    :complete_icon => 3760,
    :incomplete_icon => 0
    }
    ACHIEVEMENT[1] = {
    :symbol => :ach03,
    :name => "Minesweeper",
    :name_before_unlock => "???",
    :description => DESCRIPTION[2],
    :description_before_unlock => DESCRIPTION[0],
    :progress => PROGRESS[3],
    :reward => REWARD[0],
    :graphic => nil,
    :points => 5,
    :complete_icon => 3760,
    :incomplete_icon => 0
    }
    ACHIEVEMENT[2] = {
    :symbol => :ach07,
    :name => "Plinker",
    :name_before_unlock => nil,
    :description => DESCRIPTION[7],
    :description_before_unlock => nil,
    :progress => PROGRESS[7],
    :reward => nil,
    :graphic => nil,
    :points => 2,
    :complete_icon => 3760,
    :incomplete_icon => 0
    }
    HEADER = "Achievements" # Text shown in the head window.
    TOTAL = "Total Achievements Unlocked: " # Text shown before total numbers.
    POINTS = "Score: " # Text shown before points numbers.
    USE_POINTS = false # Use the points system?
    PROGRESS = "Progress:" # Text above progress bar
    REWARD = "Reward: " # Text shown before the reward amount/name.
    UNLOCKED = "Achievement Unlocked!" # Text shown when achievement unlocked.
    NUMBERED = false # If true, numbers achieve list. If false, uses icons.
    CENTER = false # Center the description text ? True/false
    STOP_TRACK = true # Stop tracking achievement progress after earned?
    COLOR1 = 26 # Color1 of the progress gauge.
    COLOR2 = 27 # Color2 of the progress gauge.
    SOUND = "160710__rhafiko__bass-drum-snare" # SE Played when an achievement is earned. Set to nil to disable.
    POP_ALIGN = :middle # Alignment of Popup on map when achievement is earned.
  end
end
$imported ||= {}
$imported["CSCA-Achievements"] = true
class Game_Interpreter
  def earn_achievement(sym)
  end
end`;
const CORE = '$imported = {} if $imported.nil?\n$imported["CSCA-Core"] = true\n';
const STATS = 'module CSCA_EXTRA_STATS\n  LOOTED = 88\n  DAMAGE_DEALT = 86\nend\n';

test('CSCA Achievements: detected, and its calls and CSCA Core\'s translate', () => {
    const families = C.scriptFamilies([CORE, SCRIPT]);
    assert.ok(families.has('cscaAchievements'));
    assert.ok(families.has('cscaCore'));
    assert.ok(!C.scriptFamilies([CORE]).has('cscaAchievements'));
    const ctx = { families: new Set(['cscaAchievements', 'cscaCore']) };
    assert.equal(C.ruby('earn_achievement(:ach01)', 'statement', ctx), 'this.rrCscaEarnAchievement?.("ach01");');
    assert.match(C.ruby('SceneManager.call(CSCA_Scene_Achievements)', 'statement', ctx), /Scene_RRCscaAchievements/);
    assert.equal(C.ruby('$csca.achievements_earned >= 3', 'expression', ctx), '(($gameSystem.rrCsca?.()?.achievementsEarned ?? 0) >= 3)');
    assert.equal(C.ruby('$csca.achievement_total_points', 'expression', ctx), '($gameSystem.rrCsca?.()?.achievementTotalPoints ?? 0)');
    assert.equal(C.ruby('csca_v(5) > 2', 'expression', ctx), '($gameVariables.value(5) > 2)');
    assert.equal(C.ruby('csca_s(3)', 'expression', ctx), '$gameSwitches.value(3)');
});

test('CSCA Achievements: the list and settings come from the game\'s copy', () => {
    const scripts = [CORE, STATS, SCRIPT];
    const p = extract({ scripts, constants: C.scriptConstants(scripts) });
    const list = JSON.parse(p.achievements);
    assert.equal(list.length, 3);
    assert.deepEqual(list[0], {
        symbol: 'ach01', name: 'ATLAS Shrugged', nameBeforeUnlock: '???', description: ['You have completed all', 'the ATLAS missions!'],
        descriptionBeforeUnlock: ['???'], progress: { id: ['atlas01', 'atlas02', 'atlas03'], upper: 3, description: 'Complete ATLAS Operations', type: 'sqc' },
        reward: { amount: 10000, id: 0, type: 'gold' }, graphic: '', points: 0, completeIcon: 3760, incompleteIcon: 0
    });
    assert.equal(list[2].nameBeforeUnlock, null);
    assert.equal(list[2].reward, null);
    assert.deepEqual(list[1].progress, { id: 62, upper: 14, description: 'Claymores Defused', type: 'var' });
    // PROGRESS and REWARD are the tables for the hashes and the label strings afterwards.
    assert.equal(p.progressText, 'Progress:');
    assert.equal(p.rewardText, 'Reward: ');
    assert.equal(p.usePoints, 'false');
    assert.equal(p.stopTrack, 'true');
    assert.equal(p.sound, '160710__rhafiko__bass-drum-snare');
    assert.equal(p.popAlign, 'middle');
    assert.equal(JSON.parse(p.extraStats).loot, 88);
    assert.equal(extract({ scripts: [SCRIPT.replace('POP_ALIGN = :middle', 'POP_ALIGN = nil')] }).popAlign, '');
});

function load(parameters = {}) {
    const log = [];
    const base = () => { function K() { this.initialize && this.initialize(...arguments); } K.prototype.initialize = function() {}; return K; };
    const Window_Base = base(), Window_Selectable = base(), Scene_MenuBase = base();
    Object.setPrototypeOf(Window_Selectable.prototype, Window_Base.prototype);
    function Game_Interpreter() {}
    function Game_Map() {}
    Game_Map.prototype.update = function() { log.push('map update'); };
    function Scene_Map() {}
    Scene_Map.prototype.start = function() {};
    Scene_Map.prototype.update = function() {};
    const vars = { 62: 0 }, items = { 13: 0 };
    const csca = { questInfo: { completed: 0, failed: 0, list: {} } };
    const ctx = {
        window: {}, Window_Base, Window_Selectable, Scene_MenuBase, Game_Interpreter, Game_Map, Scene_Map,
        PluginManager: { parameters: () => Object.assign(extract({ scripts: [CORE, STATS, SCRIPT], constants: C.scriptConstants([CORE, STATS, SCRIPT]) }), parameters) },
        $gameSystem: { rrCsca: () => csca, playtime: () => 0, saveCount: () => 0, battleCount: () => 0 },
        $gameVariables: { value: (id) => vars[id] || 0 },
        $gameParty: { gold: () => ctx.gold, gainGold: (n) => { ctx.gold += n; log.push('gold ' + n); }, gainItem: (item, n) => log.push('item ' + item.id + ' ' + n), numItems: (item) => items[item.id] || 0, steps: () => 0 },
        $dataItems: [null, ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: 'Item' + (i + 1) }))],
        $dataWeapons: [], $dataArmors: [],
        AudioManager: { playSe: (se) => log.push(`se ${se.name}/${se.volume}/${se.pitch}`) },
        gold: 0
    };
    ctx.$gameMap = new Game_Map();
    vm.runInNewContext(source, ctx);
    return { ctx, log, csca, vars, items };
}

test('CSCA Achievements: a script call earns, pays, sounds and counts, again each time', () => {
    const { ctx, log, csca } = load();
    const i = new ctx.Game_Interpreter();
    i.rrCscaEarnAchievement('ach03');
    assert.equal(csca.achievements.ach03, true);
    assert.deepEqual(log, ['gold 10000', 'se 160710__rhafiko__bass-drum-snare/80/100']);
    assert.equal(csca.achievementsEarned, 1);
    assert.equal(csca.achievementTotalPoints, 5);
    assert.equal(ctx.$gameMap._rrAchEarned, true);
    assert.equal(ctx.$gameMap._rrAchDisplay, 'ach03');
    i.rrCscaEarnAchievement('ach03');
    assert.equal(ctx.gold, 20000, 'the original did not check that it was earned already');
    assert.equal(csca.achievementsEarned, 2);
    i.rrCscaEarnAchievement('nope');
    assert.equal(csca.achievementsEarned, 2);
});

test('CSCA Achievements: progress earns on the map when it reaches the goal', () => {
    const { ctx, log, csca, vars, items } = load();
    ctx.$gameMap.update(true);
    assert.deepEqual(log, ['map update']);
    vars[62] = 13;
    items[13] = 99;
    csca.questInfo.list = { atlas01: true, atlas02: true, atlas03: false };
    ctx.$gameMap.update(true);
    assert.equal(csca.achievementsEarned || 0, 0, 'nothing reached yet; a failed quest is listed false');
    vars[62] = 15;
    items[13] = 100;
    log.length = 0;
    ctx.$gameMap.update(true);
    assert.deepEqual(Object.keys(csca.achievements).sort(), ['ach03', 'ach07']);
    assert.deepEqual(log, ['gold 10000', 'se 160710__rhafiko__bass-drum-snare/80/100', 'se 160710__rhafiko__bass-drum-snare/80/100', 'map update'], 'checked before the map updates; Plinker has no reward');
    assert.equal(ctx.$gameMap._rrAchDisplay, 'ach07', 'the last one earned is shown');
    csca.questInfo.list.atlas03 = true;
    ctx.$gameMap.update(true);
    assert.equal(csca.achievements.ach01, true);
    log.length = 0;
    items[13] = 0;
    ctx.$gameMap.update(true);
    assert.deepEqual(log, ['map update'], 'an earned one is not checked again');
});
