'use strict';
// Braver 1.6.5's edits to rpg_managers.js and rpg_windows.js, and the rest of its rpg_objects.js and
// rpg_scenes.js ones, as additive shims in the compatibility layer: the hashed passcodes of the
// challenge hut (DataManager.encode), permanent states, the split skill costs, battle items, whole
// HP/MP/TP, spawn items, Battle Prep's leaving of the map, and the rest. A stock game keeps stock
// behaviour; Braver gets each one.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');

function installerSource() {
    const start = compat.indexOf('    var BRAVER_FAMILIAR_TROOPS = ');
    const end = compat.indexOf('\n    function installPromiseRejectionCompatibility', start);
    assert.ok(start >= 0 && end > start, 'the installer is locatable');
    return compat.slice(start, end);
}

function makeWorld({ braver = false } = {}) {
    const mk = () => function() {};
    const calls = [];
    const DataManager = {
        _databaseFiles: [{ name: '$dataActors', src: 'Actors.json' }],
        isBattleTest: () => true, isEventTest: () => false,
        loadDataFile(name, src) { calls.push(['load', name, src]); },
    };
    DataManager.loadDatabase = function() {
        for (const file of this._databaseFiles) this.loadDataFile(file.name, (this.isBattleTest() ? 'Test_' : '') + file.src);
    };
    const SceneManager = { next: null, isNextScene(c) { return this.next === c; }, onKeyDown(event) { calls.push(['key', event.keyCode]); } };
    const Game_BattlerBase = mk();
    Object.assign(Game_BattlerBase.prototype, {
        states() { return this._states.map(id => $dataStates[id]); },
        skillMpCost: skill => skill.mp, skillTpCost: skill => skill.tp,
        canPaySkillCost(skill) { return this._tp >= this.skillTpCost(skill) && this._mp >= this.skillMpCost(skill); },
        meetsUsableItemConditions(item) { return this.canMove() && this.isOccasionOk(item); },
        isOccasionOk: () => true,
        setHp(hp) { this._hp = hp; }, setMp(mp) { this._mp = mp; }, setTp(tp) { this._tp = tp; },
    });
    const Game_Battler = mk();
    Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
    Object.assign(Game_Battler.prototype, { gainHp(v) { this._hp += v; }, gainMp(v) { this._mp += v; }, gainTp(v) { this._tp += v; }, gainSilentTp(v) { this._tp += v; } });
    const Game_Action = mk();
    Game_Action.prototype.apply = function() {};
    Game_Action.prototype.executeDamage = function(target, value) { target.damage = value; };
    const Game_Actor = mk();
    Game_Actor.prototype.currentClass = () => ({ params: [[0, 10, 20, 30]] });
    Object.defineProperty(Game_Actor.prototype, 'level', { get() { return this._level + 1; } });
    Game_Actor.prototype.paramBase = function(paramId) { return this.currentClass().params[paramId][this._level]; };
    const Game_Party = mk();
    Game_Party.prototype.itemContainer = function() { return this._items; };
    Game_Party.prototype.gainItem = function(item, amount) {
        this._items[item.id] = (this._items[item.id] || 0) + amount;
        if (this._items[item.id] === 0) delete this._items[item.id];
    };
    const Game_Troop = mk();
    Game_Troop.prototype.setupBattleEvent = function() { if (this.page) this._interpreter.running = true; };
    const Window_BattleItem = mk();
    const Scene_Map = mk();
    Scene_Map.prototype.stop = function() { calls.push(['stop', SceneManager.isNextScene(Scene_Battle) ? 'battle' : 'other']); };
    Scene_Map.prototype.update = function() { calls.push(['update', SceneManager.isNextScene(Scene_Battle) ? 'battle' : 'other']); };
    const Scene_Battle = mk();
    Scene_Battle.prototype.onEnemyCancel = function() { calls.push(['stock-cancel']); };
    const Scene_ItemBase = mk();
    Scene_ItemBase.prototype.itemTargetActors = function() { return this.members; };
    Scene_ItemBase.prototype.applyItem = function() { for (const t of this.itemTargetActors()) calls.push(['apply', t.name]); };
    const Window_Selectable = mk();
    Window_Selectable.prototype.hitTest = () => -1;
    const Scene_MenuBase = mk();
    const $gameTemp = {};
    const $dataStates = [null, { id: 1 }, { id: 2 }, { id: 99 }];
    const BattleManager = {};
    const ConfigManager = {};
    const Graphics = {};
    const global = { DataManager, SceneManager, Game_BattlerBase, Game_Battler, Game_Action, Game_Actor, Game_Party, Game_Troop,
        Window_BattleItem, Scene_Map, Scene_Battle, Scene_ItemBase, Window_Selectable, Scene_MenuBase, $gameTemp, $dataStates,
        BattleManager, ConfigManager, Graphics };
    if (braver) global.Braver = {};
    Window_BattleItem.prototype.includes = function(item) {
        return global.$gameParty.canUse(item);
    };
    const ctx = { global, Object, Array, Math, String, ...global };
    vm.runInNewContext(installerSource() + '\ninstallModdedCorescriptCompatibility();', ctx);
    return { global, calls };
}

test('DataManager.encode is the SHA-256 Braver hashed its challenge passcodes with', () => {
    const { global } = makeWorld({ braver: true });
    const sha = text => crypto.createHash('sha256').update(text, 'latin1').digest('hex');
    for (const text of ['', 'abc', 'salt' + '00001234', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'q'.repeat(130), 'éÿ']) {
        assert.equal(global.DataManager.encode(text), sha(text), JSON.stringify(text).slice(0, 20));
    }
    assert.equal(global.DataManager.encode('€'), undefined, 'wider characters were never hashed');
    // The game's own table: a salt and the hash of salt + passcode, found by findIndex.
    const table = [null, ['s1', sha('s1' + '00004321')], ['s2', sha('s2' + '12345678')]];
    const input = '12345678';
    assert.equal(table.findIndex(x => x && x[1] === global.DataManager.encode(x[0] + input)), 2);
});

test('a game that defines its own encode keeps it', () => {
    const start = installerSource();
    const ctx = { global: {}, Object, Array, Math, String };
    ctx.global.DataManager = ctx.DataManager = { encode: () => 'own', loadDatabase() {}, _databaseFiles: [] };
    vm.runInNewContext(start + '\ninstallModdedCorescriptCompatibility();', ctx);
    assert.equal(ctx.DataManager.encode('x'), 'own');
});

test('permanent states come first; without the hook states are stock', () => {
    const { global } = makeWorld();
    const battler = new global.Game_BattlerBase();
    battler._states = [1, 2];
    assert.deepEqual(Array.from(battler.states(), s => s.id), [1, 2]);
    battler.addPermanentStatesToBattler = list => list.push(global.$dataStates[3]);
    assert.deepEqual(Array.from(battler.states(), s => s.id), [99, 1, 2]);
});

test('skill costs: the stock check, and a plugin that replaces the MP part is asked', () => {
    const { global } = makeWorld();
    const battler = new global.Game_BattlerBase();
    battler._mp = 5; battler._tp = 0;
    const skill = { mp: 10, tp: 0 };
    assert.equal(battler.canPaySkillCost(skill), false);
    const stockMp = global.Game_BattlerBase.prototype.canPaySkillMpCost;
    global.Game_BattlerBase.prototype.canPaySkillMpCost = function(s) { return this.payWithHp || stockMp.call(this, s); };
    battler.payWithHp = true;
    assert.equal(battler.canPaySkillCost(skill), true);
});

test('Braver lists battle items a battler that cannot move could use; a stock game does not change', () => {
    for (const braver of [false, true]) {
        const { global } = makeWorld({ braver });
        const battler = new global.Game_BattlerBase();
        battler.canMove = () => false;
        global.$gameParty = { canUse: item => battler.meetsUsableItemConditions(item) };
        const window = new global.Window_BattleItem();
        assert.equal(window.includes({}), braver, braver ? 'Braver' : 'stock');
        assert.equal(global.$gameTemp._skip_canMoveCheck, undefined, 'the flag is cleared');
    }
});

test('Braver keeps HP, MP, TP and damage whole; a stock game passes fractions through', () => {
    for (const braver of [false, true]) {
        const { global } = makeWorld({ braver });
        const battler = new global.Game_Battler();
        battler._hp = 10; battler._mp = 10; battler._tp = 0;
        battler.setHp(12.7); battler.gainMp(2.9); battler.gainSilentTp(1.5);
        const target = {};
        new global.Game_Action().executeDamage(target, 33.9);
        assert.deepEqual([battler._hp, battler._mp, battler._tp, target.damage], braver ? [12, 12, 1, 33] : [12.7, 12.9, 1.5, 33.9]);
    }
});

test('Braver reads the level through level(); spawn items used up stay at none', () => {
    const { global } = makeWorld({ braver: true });
    const actor = new global.Game_Actor();
    actor._level = 1;
    assert.equal(actor.paramBase(0), 20, 'level() is 2');
    const party = new global.Game_Party();
    party._items = { 7: 1, 8: 1 };
    party.gainItem({ id: 7 }, -1);
    assert.deepEqual(Object.keys(party._items), ['8'], 'without spawn items the stock delete');
    global.DataManager.isSpawnItem = item => item.id === 8;
    party.gainItem({ id: 8 }, -1);
    assert.equal(party._items[8], 0);
});

test('a troop page that starts marks the battle scripted', () => {
    const { global } = makeWorld({ braver: true });
    const troop = new global.Game_Troop();
    troop._interpreter = { running: false, isRunning() { return this.running; } };
    troop.setupBattleEvent();
    assert.equal(global.BattleManager._troopScriptedEvent, undefined);
    troop.page = true;
    troop.setupBattleEvent();
    assert.equal(global.BattleManager._troopScriptedEvent, true);
});

test('leaving the map for Battle Prep is leaving for a battle, inside the map scene only', () => {
    const { global, calls } = makeWorld({ braver: true });
    global.Scene_BattlePrep = global.Scene_BattlePrep || function Scene_BattlePrep() {};
    global.SceneManager.next = global.Scene_BattlePrep;
    const map = new global.Scene_Map();
    map.update(); map.stop();
    assert.deepEqual(calls.filter(c => c[0] === 'update' || c[0] === 'stop'), [['update', 'battle'], ['stop', 'battle']]);
    assert.equal(global.SceneManager.isNextScene(global.Scene_Battle), false, 'elsewhere Battle Prep is itself');
});

test('a party item reaches its user last; the battle skill command cancels back to its list; a cursor over everything takes any touch', () => {
    const { global, calls } = makeWorld({ braver: true });
    const scene = new global.Scene_ItemBase();
    const user = { name: 'user' };
    scene.members = [user, { name: 'b' }, { name: 'c' }];
    scene.user = () => user;
    scene.applyItem();
    assert.deepEqual(calls.filter(c => c[0] === 'apply').map(c => c[1]), ['b', 'c', 'user']);
    assert.equal(Object.prototype.hasOwnProperty.call(scene, 'itemTargetActors'), false, 'the scene is left as it was');
    const battle = new global.Scene_Battle();
    const shown = [];
    battle._actorCommandWindow = { currentSymbol: () => 'battleSkills' };
    battle._enemyWindow = { hide: () => shown.push('enemy hidden') };
    battle._skillWindow = { show: () => shown.push('skills shown'), activate: () => shown.push('skills active') };
    battle.onEnemyCancel();
    assert.deepEqual(shown, ['enemy hidden', 'skills shown', 'skills active']);
    battle._actorCommandWindow = { currentSymbol: () => 'attack' };
    battle.onEnemyCancel();
    assert.deepEqual(calls.at(-1), ['stock-cancel']);
    const window = new global.Window_Selectable();
    window.innerRect = { contains: () => true };
    window.index = () => 3;
    assert.equal(window.hitTest(5, 5), -1);
    window._cursorAll = true;
    assert.equal(window.hitTest(5, 5), 3);
});

test('a data file added without the test prefix loads under its own name; F5 follows the game\'s option, never on the error screen', () => {
    const { global, calls } = makeWorld({ braver: true });
    global.DataManager._databaseFiles.push({ name: '$dataQuests', src: 'Quests.json', loadWithoutPrefix: true });
    global.DataManager.loadDatabase();
    assert.deepEqual(calls.filter(c => c[0] === 'load'), [['load', '$dataActors', 'Test_Actors.json'], ['load', '$dataQuests', 'Quests.json']]);
    assert.equal(global.DataManager._databaseFiles.length, 2, 'the list is put back');
    global.SceneManager.onKeyDown({ keyCode: 116 });
    global.ConfigManager.optEnableF5ToReload = false;
    global.SceneManager.onKeyDown({ keyCode: 116 });
    global.Graphics._errorPrinter = { innerHTML: 'Game has encountered a bug' };
    global.SceneManager.onKeyDown({ keyCode: 116 });
    assert.deepEqual(calls.filter(c => c[0] === 'key').map(c => c[1]), [116, 116], 'refused once, while the game ran');
});
