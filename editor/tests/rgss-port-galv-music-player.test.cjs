'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_GalvMusicPlayer.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_GalvMusicPlayer.params.js'));

const SCRIPT = `$imported = {} if $imported.nil?
$imported["Music_Player"] = true
module Galv_Music_Player
  AUDIO_FOLDER = "Audio/BGM/"
  MAP_BGM_SWITCH = 0
  ADD_TO_MENU = false
  MENU_VOCAB = "Music"
  ENABLE_MENU_SWITCH = 0
  MUSIC_ICON = 4550
  BATTLE_BGM_ICON = 52
  VEHICLE_BGM_ICON = 0
    BOAT_ICON = 0
    SHIP_ICON = 0
    AIRSHIP_ICON = 0
  OPTIONS_WIDTH = 280
  PLAY_SELECTED = "Play track"
  SET_BATTLE = "Set as battle music"
  SET_VEHICLE = "-"
  STOP_MUSIC = "Stop music"
end
class Scene_MusicPlayer < Scene_MenuBase
end
class Window_Music_Options < Window_Command
  def make_command_list
    add_command(Galv_Music_Player::PLAY_SELECTED, :play_track)
    add_command(Galv_Music_Player::STOP_MUSIC, :stop_music)
    add_command(Galv_Music_Player::SET_BATTLE, :set_battle_music)
   #add_command(Galv_Music_Player::RESTORE_DEFAULTS, :restore_defaults)
   #add_command(Galv_Music_Player::SET_VEHICLE, :set_vehicle_music)

  end
end`;

test('Galv Music Player: detected; the scene and the four calls translate', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('galvMusicPlayer'));
    const ctx = { constants: C.scriptConstants([SCRIPT]), families: new Set(['galvMusicPlayer']) };
    assert.match(C.ruby('SceneManager.call(Scene_MusicPlayer)', 'statement', ctx), /SceneManager\.push\(s\)\)\(\(typeof Scene_RRMusicPlayer === "function"/);
    assert.equal(C.ruby('add_music("Battle1")', 'statement', ctx), 'this.rrAddMusic?.("Battle1");');
    assert.equal(C.ruby('know_music?("Battle1")', 'expression', ctx), '(this.rrKnowMusic?.("Battle1") ?? false)');
    assert.equal(C.ruby('play_last', 'statement', ctx), 'this.rrPlayLast?.();');
    assert.equal(C.ruby('restore_bgm', 'statement', ctx), 'this.rrRestoreBgm?.();');
});

test('Galv Music Player: settings, and the options the game left in its list', () => {
    const p = extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) });
    assert.equal(p.fromFolder, 'true');
    assert.equal(p.musicIcon, '4550');
    assert.equal(p.battleBgmIcon, '52');
    assert.equal(p.optionsWidth, '280');
    assert.equal(p.addToMenu, 'false');
    assert.deepEqual(JSON.parse(p.commands), ['play_track', 'stop_music', 'set_battle_music']);
    assert.equal(JSON.parse(p.vocab).PLAY_SELECTED, 'Play track');
});

/** The plugin over window, scene and audio stubs; the music folder holds `files`. */
function load(files, parameters = {}) {
    const played = [];
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    function Window_Base() {}
    Window_Base.prototype.initialize = function(rect) { Object.assign(this, rect, { texts: [], icons: [], _handlers: {} }); this.contents = { drawText: (t, x, y, w, h) => this.texts.push([t, x, y, w]), clear() {} }; };
    Window_Base.prototype.drawIcon = function(i, x, y) { this.icons.push([i, x, y]); };
    Window_Base.prototype.resetTextColor = function() {};
    function Window_Selectable() {}
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Selectable.prototype, {
        refresh() { this.texts = []; this.icons = []; for (let i = 0; i < this.maxItems(); i++) this.drawItem(i); },
        itemRect(i) { return new Rectangle(i % 2 ? 324 : 0, Math.floor(i / 2) * 24, 292, 24); },
        select(i) { this._index = i; }, index() { return this._index; }, activate() { this.active = true; }, deactivate() { this.active = false; },
        setHandler(k, f) { this._handlers[k] = f; }, processOk() { this._handlers.ok(); }, hide() { this.visible = false; }, show() { this.visible = true; }
    });
    function Window_Command() {}
    Window_Command.prototype = Object.create(Window_Selectable.prototype);
    Window_Command.prototype.initialize = function(rect) { Window_Base.prototype.initialize.call(this, rect); this._list = []; this.makeCommandList(); };
    Window_Command.prototype.addCommand = function(name, symbol) { this._list.push({ name, symbol }); };
    Window_Command.prototype.currentSymbol = function() { return this._list[this._index].symbol; };
    function Scene_MenuBase() {}
    Scene_MenuBase.prototype.initialize = function() {};
    Scene_MenuBase.prototype.create = function() {};
    Scene_MenuBase.prototype.addWindow = function() {};
    Scene_MenuBase.prototype.popScene = function() {};
    function noop() {}
    noop.prototype = {};
    const ctx = {
        Rectangle, Window_Base, Window_Selectable, Window_Command, Scene_MenuBase, window: {}, Game_Interpreter: noop,
        Game_System: function() {}, Game_Map: function() {}, Game_Vehicle: function() {}, Window_MenuCommand: noop, Scene_Menu: noop,
        PluginManager: { parameters: () => Object.assign(extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) }), parameters) },
        Graphics: { boxWidth: 640, boxHeight: 480 },
        Utils: { isNwjs: () => true },
        process: { mainModule: { filename: '/game/index.html' } },
        require: (m) => (m === 'fs' ? { readdirSync: () => files.map(name => ({ name, isFile: () => true })) } : require(m)),
        $dataSystem: { boat: { bgm: { name: 'Ship1' } }, ship: { bgm: { name: '' } }, airship: { bgm: { name: '' } }, battleBgm: { name: 'Battle1' } },
        $gameSwitches: { value: () => false },
        $gameParty: { inBattle: () => false },
        $dataMap: { autoplayBgm: true, bgm: { name: 'Town', volume: 90, pitch: 100 } },
        AudioManager: { playBgm: (b) => played.push('play ' + b.name + ' ' + b.volume + '/' + b.pitch), stopBgm: () => played.push('stop') },
        SoundManager: { playBuzzer: () => played.push('buzzer') }
    };
    ctx.Game_System.prototype.initialize = function() { this._battleBgm = null; };
    ctx.Game_System.prototype.battleBgm = function() { return this._battleBgm || ctx.$dataSystem.battleBgm; };
    ctx.Game_System.prototype.setBattleBgm = function(v) { this._battleBgm = v; };
    ctx.Game_Map.prototype.autoplay = function() {};
    ctx.Game_Vehicle.prototype.getOn = function() {};
    vm.runInNewContext(source, ctx);
    ctx.$gameSystem = new ctx.Game_System();
    ctx.$gameSystem.initialize();
    ctx.$gameMap = new ctx.Game_Map();
    return { ctx, played };
}

test('Galv Music Player: a new game lists the music folder in Windows order, one entry per track', () => {
    const { ctx } = load(['the_night.ogg', 'Miguel - Aerius.ogg', 'Miguel & DNS - Train.ogg', 'REAL.ogg', 'Miguel - Aerius.m4a', 'A_Cyborg.ogg']);
    assert.deepEqual(Array.from(ctx.$gameSystem.rrMusicList()), ['A_Cyborg', 'Miguel & DNS - Train', 'Miguel - Aerius', 'REAL', 'the_night']);
    assert.deepEqual(Array.from(load(['a.ogg'], { fromFolder: 'false' }).ctx.$gameSystem.rrMusicList()), []);
});

test('Galv Music Player: the screen lists two columns, the options play, stop and set the battle music', () => {
    const { ctx, played } = load(['Battle1.ogg', 'Ship1.ogg', 'Town.ogg']);
    const scene = new ctx.window.Scene_RRMusicPlayer();
    scene.create();
    const list = scene._musicWindow, options = scene._musicOptionWindow;
    assert.deepEqual(list.texts.map(t => [t[0], t[1], t[2], t[3]]), [['Battle1', 30, 0, 238], ['Ship1', 354, 0, 238], ['Town', 30, 24, 238]]);
    // The battle music has its icon; the boat's track has the boat's (0 here); the rest the note.
    assert.deepEqual(list.icons.map(i => i[0]), [52, 0, 4550]);
    assert.deepEqual([options.x, options.y, options.width, options.height], [180, 336, 280, 96]);
    assert.deepEqual(options._list.map(c => c.name), ['Play track', 'Stop music', 'Set as battle music']);
    list.select(2); list.processOk();
    assert.equal(options.visible, true);
    options.select(0); options._handlers.ok();
    assert.deepEqual(played, ['play Town 100/100']);
    list.processOk(); options.select(1); options._handlers.ok();
    assert.deepEqual(played.slice(1), ['stop', 'play Town 90/100'], 'the map music comes back');
    list.processOk(); options.select(2); options._handlers.ok();
    assert.equal(ctx.$gameSystem.battleBgm().name, 'Town');
    assert.deepEqual(list.icons.map(i => i[0]), [4550, 0, 52]);
});

test('Galv Music Player: the event calls', () => {
    const { ctx, played } = load(['A.ogg']);
    const i = new ctx.Game_Interpreter();
    i.rrAddMusic('B'); i.rrAddMusic('B');
    assert.deepEqual(Array.from(ctx.$gameSystem.rrMusicList()), ['A', 'B']);
    assert.equal(i.rrKnowMusic('B'), true);
    assert.equal(i.rrKnowMusic('C'), false);
    ctx.$gameSystem._rrLastTrack = 'A';
    i.rrPlayLast();
    assert.deepEqual(played, ['play A 100/100']);
    ctx.$gameSystem.setBattleBgm({ name: 'Boss' });
    i.rrRestoreBgm();
    assert.equal(ctx.$gameSystem.battleBgm().name, 'Battle1', 'with nothing chosen, the game\'s own battle music');
});
