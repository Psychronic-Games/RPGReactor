const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Four Dreamwalker ports: Vlue's Sleek Item Popup, Yanfly's Death Common Events, CSCA RegionSwitch and
// Neon Black's CP Terrain Tags.
const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

const POPUP = [
    '$imported = {} if $imported.nil?',
    '$imported[:Vlue_SleekPopup] = true',
    'PU_SOUND_EFFECT_GAIN = ["OK",100,100]',
    'PU_SOUND_EFFECT_LOSE = ["Cancel",100,50]',
    'PU_SOUND_GOLD_GAIN = ["shop",100,100]',
    'PU_SOUND_GOLD_LOSE = ["shop",100,50]',
    'PU_FADEIN_TIME = 5', 'PU_FADEOUT_TIME = 5', 'PU_DEFAULT_DURATION = 5',
    '$PU_AUTOMATIC_POPUP = true',
    'PU_DEFAULT_FONT_COLOR = Color.new(255,255,255,255)',
    'PU_COMPACT_MODE = true',
    'PU_GOLD_NAME = "Ƶ"', 'PU_GOLD_ICON = 3777', 'PU_SINGLE_LINE = true',
    'class Item_Popup < Window_Base', 'end'
].join('\n');
const RARITY = '$imported[:TH_ItemRarity] = true\nmodule TH\n  module Item_Rarity\n    Colour_Map = {\n      1 => [255,255,255], #Common\n      2 => [0,148,255  ], #Rare\n    }\n  end\nend';
const CORE = 'module YEA\n  module CORE\n    FONT_SIZE = 18\n  end\nend\nFont.default_size = YEA::CORE::FONT_SIZE';
const DEATH = '$imported["YEA-DeathCommonEvents"] = true\nmodule YEA\n  module DEATH_EVENTS\n    WIPE_OUT_EVENT = 0\n  end\nend';
const REGION = '$imported = {} if $imported.nil?\n$imported["CSCA-RegionSwitch"] = true\nclass Game_Map\nend';
const TERRAIN = 'module CP\nmodule TERRAIN\nDOWN_RIGHT = 16\nDOWN_LEFT  = 17\nCOVER = 18\nBLOCK = 63 # Default = 19\nBRIDGE = 20\nCATWALK = 21\nLOWER = 22\nUPPER = 23\nend\nend\n$imported = {} if $imported.nil?\n$imported["CP_TERRAIN"] = 1.1';

test('the four scripts are detected; popup and $PU_AUTOMATIC_POPUP translate', () => {
    const scripts = [POPUP, DEATH, REGION, TERRAIN];
    const families = C.scriptFamilies(scripts);
    for (const key of ['vlueItemPopup', 'yeaDeathCommonEvents', 'cscaRegionSwitch', 'cpTerrainTags']) assert.ok(families.has(key), key);
    const ctx = { constants: C.scriptConstants(scripts), families };
    assert.equal(C.ruby('popup(0,12,5)', 'statement', ctx), 'this.rrPopup?.(0, 12, 5);');
    assert.equal(C.ruby('$PU_AUTOMATIC_POPUP = false', 'statement', ctx), 'window.rrPuAutomaticPopup = false;');
    // CE 11 Random_Loot: the popup first, the gain (Yanfly Adjust Limits' interpreter method) after.
    const loot = C.ruby('item = [1, 2, 3,\n4].shuffle.first\npopup(0,item,1)', 'statement', ctx);
    assert.match(loot, /var item = .*\[1, 2, 3, 4\]\)\[0\];\nthis\.rrPopup\?\.\(0, item, 1\);/);
    assert.equal(C.scriptFamilies(['$imported["CSCA-Difficulty"] = true']).has('vlueItemPopup'), false);
});

test('settings are read from the scripts: sounds, gold, rarity colours and the default font size', () => {
    const scripts = [CORE, RARITY, POPUP, DEATH, TERRAIN];
    const constants = C.scriptConstants(scripts);
    const p = params('RR_VlueItemPopup').extract({ scripts, constants });
    assert.deepEqual(JSON.parse(p.goldLose), { name: 'shop', volume: '100', pitch: '50' });
    assert.deepEqual([p.goldName, p.goldIcon, p.compact, p.singleLine, p.automatic, p.fadeIn, p.rgssFontSize], ['Ƶ', '3777', 'true', 'true', 'true', '5', '18']);
    assert.deepEqual(JSON.parse(p.rarityColours), { 1: [255, 255, 255], 2: [0, 148, 255] });
    assert.equal(params('RR_VlueItemPopup').extract({ scripts: [POPUP], constants: {} }).rarityColours, '');
    assert.deepEqual(params('RR_DeathCommonEvents').extract({ constants }), { wipeOutEvent: '0' });
    assert.deepEqual(params('RR_NeonTerrainTags').extract({ constants }), { cover: '18', block: '63', bridge: '20', upper: '23' });
});

/** A small MZ for the popup: one map scene, a player at a screen spot, text 8 px a letter. */
function popupWorld(parameters = {}) {
    const played = [];
    function Rectangle(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); }
    function Bitmap(w, h) { this.width = w; this.height = h; this.fontSize = 16; this.drawn = []; }
    Bitmap.prototype.clear = function() { this.drawn = []; };
    function Window_Base() {}
    Window_Base.prototype.initialize = function(r) { this.move(r.x, r.y, r.width, r.height); this.createContents(); this.contentsOpacity = 255; };
    Window_Base.prototype.move = function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); };
    Window_Base.prototype.createContents = function() { this.contents = new Bitmap(this.width - 24, this.height - 24); this.resetFontSettings(); };
    Window_Base.prototype.resetFontSettings = function() { this.contents.fontSize = 16.1; this._color = 'normal'; };
    Window_Base.prototype.textWidth = function(t) { return Math.round(String(t).length * this.contents.fontSize / 2); };
    Window_Base.prototype.lineHeight = function() { return 24; };
    Window_Base.prototype.changeTextColor = function(c) { this._color = c; };
    Window_Base.prototype.resetTextColor = function() { this._color = 'normal'; };
    Window_Base.prototype.drawText = function(t, x, y, w) { this.contents.drawn.push(['text', t, x, y, w, this._color]); };
    Window_Base.prototype.drawIcon = function(i, x, y) { this.contents.drawn.push(['icon', i, x, y]); };
    Window_Base.prototype.destroy = function() { this.destroyed = true; };
    function Game_Interpreter() {}
    Game_Interpreter.prototype.operateValue = function(op, type, operand) { return op === 0 ? operand : -operand; };
    for (const n of [125, 126, 127, 128]) Game_Interpreter.prototype['command' + n] = function() { return true; };
    function Scene_Map() { this.children = []; this._windowLayer = { name: 'windows' }; this.children.push(this._windowLayer); }
    Scene_Map.prototype.update = function() {};
    Scene_Map.prototype.terminate = function() {};
    Scene_Map.prototype.addChildAt = function(c, i) { this.children.splice(i, 0, c); c.parent = this; };
    Scene_Map.prototype.addChild = function(c) { this.children.push(c); c.parent = this; };
    Scene_Map.prototype.removeChild = function(c) { this.children.splice(this.children.indexOf(c), 1); c.parent = null; };
    const ctx = {
        PluginManager: { parameters: () => Object.assign({ goldName: 'Ƶ', goldIcon: '3777', rgssFontSize: '18', rarityColours: '{"1":[255,255,255],"2":[0,148,255]}' }, parameters) },
        Window_Base, Rectangle, Game_Interpreter, Scene_Map,
        AudioManager: { playSe: (se) => played.push(se) }, ColorManager: { normalColor: () => 'normal' },
        $gameSystem: { mainFontSize: () => 16.1 }, $gamePlayer: { screenX: () => 336, screenY: () => 284 }, $gameTemp: {},
        $dataItems: [null, { name: 'Medkit', iconIndex: 7, note: '' }, { name: 'Ammo', iconIndex: 8, note: '<item rarity: 2>' }],
        $dataWeapons: [], $dataArmors: []
    };
    ctx.window = ctx;
    vm.runInNewContext(plugin('RR_VlueItemPopup'), ctx);
    return { ctx, played, scene: new Scene_Map(), it: new Game_Interpreter() };
}

test('a popup: sized as measured at 16, placed over the player, typed two frames a letter, 90 frames then gone', () => {
    const { ctx, played, scene, it } = popupWorld();
    it.rrPopup(0, 2, 3);
    assert.equal(played.length, 0, 'nothing sounds until the map shows it');
    scene.update();
    const w = scene.children[0];
    assert.ok(w instanceof ctx.Window_RRItemPopup, 'placed under the window layer');
    assert.deepEqual(JSON.parse(JSON.stringify(played)), [{ name: 'OK', volume: 100, pitch: 100, pan: 0 }]);
    // "Ammo" at 16/18 of 16.1 px is 4 × 7.16 ≈ 29 px; "+3" 14 px: 29 + 24 + 24 + 14 + 48.
    const nameW = Math.round(4 * (16.1 * 16 / 18) / 2), amountW = Math.round(2 * (16.1 * 16 / 18) / 2);
    assert.equal(w.width, nameW + 48 + amountW + 48);
    assert.equal(w.height, 48);
    assert.equal(w.x, 336 - Math.floor((w.width - 24) / 4) + 12 - Math.floor(w.width / 3));
    assert.equal(w.y, 284 - 80);
    assert.equal(w.contentsOpacity, 51, 'one fade-in step as it is made');
    assert.equal(w.contents.drawn.length, 0, 'the first letter comes on the second frame');
    scene.update();
    assert.equal(w.contentsOpacity, 102);
    const text = () => w.contents.drawn.find(d => d[0] === 'text' && d[2] === 24);
    assert.equal(text()[1], 'A   ');
    assert.equal(text()[5], 'rgba(0, 148, 255, 1)', 'the rarity colour');
    assert.deepEqual(w.contents.drawn.find(d => d[1] === '+3').slice(2, 4), [27 + Math.round(4 * 16.1 / 2), 0]);
    assert.deepEqual(w.contents.drawn.find(d => d[0] === 'icon'), ['icon', 8, 0, 0]);
    let frames = 2;
    while (scene.children.includes(w)) { scene.update(); frames++; }
    assert.equal(frames, 101, '96 frames shown, then five to fade');
    assert.ok(w.destroyed);
});

test('popups queue in order; compact hides a single one; losses are red and sound lower; gold is its own', () => {
    const { played, scene, it } = popupWorld();
    it.command126([1, 0, 0, 1]);          // gain 1 Medkit
    it.command125([1, 0, 50]);            // lose 50 gold
    it.rrPopup(0, 1, 2, 120, 0);          // a 0 for "nosound" is true in Ruby
    it.rrPopup(0, 99, 1);                 // no such item: nothing
    const seen = [];
    for (let i = 0; i < 400; i++) {
        scene.update();
        const w = scene.children.find(c => c.contents);
        if (w && !seen.includes(w)) seen.push(w);
    }
    assert.equal(seen.length, 3);
    assert.equal(seen[0].contents.drawn.filter(d => d[0] === 'text').length, 1, 'amount 1 is not drawn');
    assert.equal(seen[1]._item.name, 'Ƶ');
    assert.ok(seen[1].contents.drawn.some(d => d[1] === '-50' && d[5] === 'rgb(255, 0, 0)'));
    assert.deepEqual(played.map(s => [s.name, s.pitch]), [['OK', 100], ['shop', 50]]);
    assert.ok(seen[2].contents.drawn.some(d => d[1] === '+2'));
});

test('the automatic popup follows $PU_AUTOMATIC_POPUP, and a popup carries on after another scene', () => {
    const { ctx, scene, it } = popupWorld();
    ctx.rrPuAutomaticPopup = false;
    it.command126([1, 0, 0, 3]);
    scene.update();
    assert.equal(scene.children.length, 1);
    ctx.rrPuAutomaticPopup = true;
    it.command127([1, 0, 0, 1]);          // weapon 1 does not exist here: nothing
    it.command126([1, 0, 0, 3]);
    scene.update();
    const w = scene.children[0];
    for (let i = 0; i < 10; i++) scene.update();
    scene.terminate();
    assert.equal(w.visible, false);
    assert.equal(scene.children.includes(w), false);
    const next = new ctx.Scene_Map();
    next.update();
    assert.ok(next.children.includes(w) && w.visible);
    assert.equal(w._timer, 12, 'one more frame, not restarted');
});

test('death events: the tag on the enemy, or the actor before its class; the battle waits while one runs', () => {
    const log = [];
    function Game_Battler() {}
    function Game_Actor(a, c) { this._a = a; this._c = c; this.hp = 0; }
    Game_Actor.prototype = Object.create(Game_Battler.prototype);
    Game_Actor.prototype.actor = function() { return this._a; };
    Game_Actor.prototype.currentClass = function() { return this._c; };
    Game_Actor.prototype.isDead = function() { return this.hp <= 0; };
    Game_Actor.prototype.performCollapse = function() { log.push('collapse'); };
    function Game_Enemy(e) { this._e = e; this.hp = 0; }
    Game_Enemy.prototype = Object.create(Game_Battler.prototype);
    Game_Enemy.prototype.enemy = function() { return this._e; };
    Game_Enemy.prototype.isDead = function() { return this.hp <= 0; };
    Game_Enemy.prototype.performCollapse = function() { log.push('collapse'); };
    function Scene_Battle() {}
    function Window_BattleLog() {}
    Window_BattleLog.prototype.updateWait = function() { return false; };
    const reserved = [];
    let running = 0;
    const BattleManager = { update() { log.push('phase'); }, setup() {}, processDefeat() { log.push('defeat'); }, _spriteset: { isEffecting: () => false } };
    const ctx = {
        PluginManager: { parameters: () => ({ wipeOutEvent: '7' }) }, Game_Battler, Game_Actor, Game_Enemy, Scene_Battle, Window_BattleLog, BattleManager,
        SceneManager: { _scene: new Scene_Battle(), isSceneChanging: () => false },
        $gameTemp: { reserveCommonEvent: (id) => reserved.push(id) },
        $gameMessage: { isBusy: () => false },
        $gameParty: { isAllDead: () => true },
        $gameTroop: {
            isAllDead: () => false, isEventRunning: () => running > 0,
            updateInterpreter() { if (running > 0) running--; },
            setupBattleEvent() { if (reserved.length) { log.push('event ' + reserved.shift()); running = 2; } }
        }
    };
    vm.runInNewContext(plugin('RR_DeathCommonEvents'), ctx);
    const barrel = new Game_Enemy({ note: '<animation collapse: 101>\r\n<death event: 99>' });
    assert.equal(barrel.rrDeathEventId(), 99);
    assert.equal(new Game_Actor({ note: '' }, { note: '<DEATH_EVENT: 4>' }).rrDeathEventId(), 4);
    assert.equal(new Game_Actor({ note: '<death event: 5>' }, { note: '<death event: 4>' }).rrDeathEventId(), 5);
    assert.equal(new Game_Enemy({ note: '<death event:5>' }).rrDeathEventId(), 0, 'the space is required');
    barrel.performCollapse();
    assert.equal(new Window_BattleLog().updateWait(), true, 'the log holds');
    for (let i = 0; i < 3; i++) BattleManager.update();
    assert.deepEqual(log, ['collapse', 'event 99']);
    assert.equal(new Window_BattleLog().updateWait(), false);
    BattleManager.update();
    assert.deepEqual(log.slice(-1), ['phase']);
    // Party wiped: the wipe-out event first; still all dead after it, the battle is lost.
    BattleManager.processDefeat();
    assert.deepEqual(reserved, [7]);
    for (let i = 0; i < 5; i++) BattleManager.update();
    assert.ok(log.includes('defeat'));
    // Outside battle a collapse runs nothing.
    ctx.SceneManager._scene = {};
    new Game_Enemy({ note: '<death event: 99>' }).performCollapse();
    assert.equal(BattleManager._rrDeathEvent, false);
});

test('region switches: on while the player stands on the region, off elsewhere, read as Ruby reads the note', () => {
    const switches = {};
    let sets = 0;
    function Game_Map() {}
    Game_Map.prototype.update = function() {};
    Game_Map.prototype.regionId = function(x, y) { return x === 5 ? 61 : 0; };
    Game_Map.prototype.terrainTag = function(x) { return x === 7 ? 2 : 0; };
    const ctx = {
        Game_Map, $gamePlayer: { x: 5, y: 3 },
        $gameSwitches: { value: (id) => !!switches[id], setValue: (id, v) => { switches[id] = v; sets++; } },
        $dataMap: { note: '<add fog: fog>\r\n<actor lantern 1: 255>\r\n\r\n\r\n<csca_r: 61>\r\n\n<csca_s: 44>' }
    };
    vm.runInNewContext(plugin('RR_CscaRegionSwitch'), ctx);
    const map = new Game_Map();
    map.update(true);
    assert.equal(switches[44], true);
    map.update(true);
    assert.equal(sets, 1, 'set only when it changes');
    ctx.$gamePlayer.x = 6;
    map.update(true);
    assert.equal(switches[44], false);
    // Two tags on one line: the greedy match reads "2> <csca_ts: 9" for the terrain tags, which to_i makes [2].
    ctx.$dataMap = { note: '<csca_tt: 2> <csca_ts: 9>' };
    ctx.$gamePlayer.x = 7;
    map.update(true);
    assert.equal(switches[9], true);
});

test('terrain tags: block cells stop everything; cover lifts the ground tile above and is walkable', () => {
    // 3 × 1 map: cell 0 cover over tile 7548, cell 1 plain 7548, cell 2 block.
    const W = 3, H = 1;
    const data = new Array(W * H * 6).fill(0);
    data[0] = 7548; data[1] = 7548; data[2] = 1552;
    data[5 * W * H + 0] = 18; data[5 * W * H + 2] = 63;
    const flags = []; flags[0] = 0x10; flags[7548] = 0xe00; flags[1552] = 0;
    function Game_Map() {}
    Game_Map.prototype.setup = function() {};
    Game_Map.prototype.tilesetFlags = function() { return flags; };
    Game_Map.prototype.tileId = function(x, y, z) { return window.$dataMap.data[(z * H + y) * W + x] || 0; };
    Game_Map.prototype.regionId = function(x, y) { return this.tileId(x, y, 5); };
    Game_Map.prototype.tileEventsXy = function() { return []; };
    Game_Map.prototype.checkPassage = function() { return 'stock'; };
    function Game_Follower() { this.dir = 2; }
    Game_Follower.prototype.isMoving = function() { return false; };
    Game_Follower.prototype.setDirection = function(d) { this.dir = d; };
    Game_Follower.prototype.chaseCharacter = function() { this.chased = this.dir; };
    const DataManager = { onLoad() {}, extractSaveContents() {} };
    const window = { $dataMap: null };
    const ctx = { window, PluginManager: { parameters: () => ({ cover: '18', block: '63', bridge: '20', upper: '23' }) }, Game_Map, Game_Follower, DataManager };
    Object.defineProperty(ctx, '$dataMap', { get: () => window.$dataMap });
    Object.defineProperty(ctx, '$gameMap', { get: () => window.$gameMap });
    vm.runInNewContext(plugin('RR_NeonTerrainTags'), ctx);
    window.$dataMap = { width: W, height: H, data: data.slice(), events: [] };
    DataManager.onLoad(window.$dataMap);
    assert.deepEqual([window.$dataMap.data[0], window.$dataMap.data[2 * W]], [0, 7548], 'raised to the upper layer');
    const map = window.$gameMap = new Game_Map();
    map.setup(1);
    assert.equal(flags[7548], 0x10, 'the tileset flag changes for the session');
    assert.equal(map.checkPassage(2, 0, 0x0f), false, 'block');
    assert.equal(map.checkPassage(0, 0, 0x01), true, 'cover is walkable');
    assert.equal(map.checkPassage(1, 0, 0x01), true, 'elsewhere the tile keeps the passage it had when the map was set up');
    // A second map set up in the same session remembers the changed flag: its plain cells stop being walkable.
    window.$dataMap = { width: W, height: H, data: data.slice(), events: [] };
    DataManager.onLoad(window.$dataMap);
    map.setup(2);
    assert.equal(map.checkPassage(1, 0, 0x01), false);
    // Coming back from the menu reads the data again; it is raised again, the flags are left.
    window.$dataMap = { width: W, height: H, data: data.slice(), events: [] };
    DataManager.onLoad(window.$dataMap);
    assert.equal(window.$dataMap.data[2 * W], 7548);
    const follower = new Game_Follower();
    follower.chaseCharacter({ direction: () => 6 });
    assert.equal(follower.chased, 6, 'faces the leader first');
});
