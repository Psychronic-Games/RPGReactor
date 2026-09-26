'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_CscaGameoverOptions.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_CscaGameoverOptions.params.js'));

const SCRIPT = `module CSCA_GAMEOVER_OPTIONS
  GAMEOVER_MUSIC = 0 # Variable ID.
  GAMEOVER_IMAGE = 0 # Variable ID.
  TITLE = "Main Menu" # Text shown for the command that brings you back to the title.
  LOAD = "Load" # Text shown for load command.
  QUIT = "Quit" # Text shown for command that exits the game.
end # Don't touch this or anything below.
class Window_CSCA_GameoverCommand < Window_Command
end`;

test('CSCA Game Over Options: detected, settings from the game\'s copy', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('cscaGameoverOptions'));
    assert.deepEqual(extract({ constants: C.scriptConstants([SCRIPT]) }), { titleText: 'Main Menu', loadText: 'Load', quitText: 'Quit', musicVariable: '0', imageVariable: '0' });
    const p = extract({ constants: C.scriptConstants([SCRIPT.replace('GAMEOVER_IMAGE = 0', 'GAMEOVER_IMAGE = 12')]) });
    assert.equal(p.imageVariable, '12');
});

function load(parameters = {}, { saves = false, vars = {} } = {}) {
    const log = [];
    function Rectangle(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); }
    function Window_Command() {}
    Window_Command.prototype.initialize = function(rect) {
        Object.assign(this, { rect, _list: [], _handlers: {}, openness: 255 });
        this.makeCommandList();
    };
    Window_Command.prototype.addCommand = function(name, symbol, enabled = true) { this._list.push({ name, symbol, enabled }); };
    Window_Command.prototype.setHandler = function(symbol, fn) { this._handlers[symbol] = fn; };
    Window_Command.prototype.open = function() { this.openness = 255; log.push('open'); };
    Window_Command.prototype.close = function() { this._closing = true; log.push('close'); };
    Window_Command.prototype.isClosed = function() { return this.openness === 0; };
    function Scene_Base() {}
    Scene_Base.prototype.update = function() {};
    Scene_Base.prototype.stop = function() { log.push('base stop'); };
    Scene_Base.prototype.terminate = function() { log.push('base terminate'); };
    Scene_Base.prototype.isBusy = function() { return !!this.busy; };
    Scene_Base.prototype.createWindowLayer = function() {};
    Scene_Base.prototype.addWindow = function() {};
    Scene_Base.prototype.fadeOutAll = function() { log.push('fade all'); this.busy = true; };
    Scene_Base.prototype.startFadeOut = function(d) { log.push('fade out ' + d); };
    Scene_Base.prototype.fadeSpeed = function() { return 24; };
    function Scene_Gameover() {}
    Scene_Gameover.prototype = Object.create(Scene_Base.prototype);
    Scene_Gameover.prototype.create = function() { this.playGameoverMusic(); this.createBackground(); };
    Scene_Gameover.prototype.playGameoverMusic = function() { log.push('me db'); };
    Scene_Gameover.prototype.createBackground = function() { this._backSprite = { bitmap: 'GameOver' }; };
    Scene_Gameover.prototype.gotoTitle = function() { log.push('title'); };
    Scene_Gameover.prototype.stop = function() { log.push('stop fade all'); };
    Scene_Gameover.prototype.terminate = function() { log.push('stop all audio'); };
    function Scene_Load() {}
    const ctx = {
        window: {}, Rectangle, Window_Command, Scene_Base, Scene_Gameover, Scene_Load,
        PluginManager: { parameters: () => Object.assign(extract({ constants: C.scriptConstants([SCRIPT]) }), parameters) },
        Graphics: { boxWidth: 640, boxHeight: 480 },
        $gameSystem: { windowPadding: () => 12 },
        $gameVariables: { value: (id) => vars[id] || 0 },
        DataManager: { isAnySavefileExists: () => saves },
        AudioManager: { playMe: (me) => log.push('me ' + me.name) },
        ImageManager: { loadSystem: (name) => name },
        SceneManager: { push: (c) => log.push('push ' + (c === Scene_Load ? 'load' : '?')), exit: () => log.push('exit') }
    };
    vm.runInNewContext(source, ctx);
    const scene = new ctx.Scene_Gameover();
    scene.create();
    return { ctx, log, scene, w: scene._commandWindow };
}

test('CSCA Game Over Options: the commands, their window, and opening after the fade', () => {
    const { log, scene, w } = load();
    assert.deepEqual(w._list.map(c => [c.name, c.symbol, c.enabled]), [['Load', 'load', false], ['Main Menu', 'title', true], ['Quit', 'shutdown', true]]);
    assert.deepEqual([w.rect.x, w.rect.y, w.rect.width, w.rect.height], [240, 336, 160, 96]);
    assert.equal(w.openness, 0);
    scene.busy = true;
    scene.update();
    assert.ok(!log.includes('open'), 'waits for the fade in');
    scene.busy = false;
    scene.update();
    scene.update();
    assert.deepEqual(log.filter(l => l === 'open'), ['open']);
    w._handlers.title();
    assert.ok(log.includes('title'));
    assert.equal(load({}, { saves: true }).w._list[0].enabled, true);
});

test('CSCA Game Over Options: load and quit wait for the window to close', () => {
    const { log, scene, w } = load({}, { saves: true });
    scene.update();
    w._handlers.load();
    scene.update();
    assert.ok(!log.includes('push load'));
    w.openness = 0;
    scene.update();
    assert.ok(log.includes('push load'));
    log.length = 0;
    scene.stop();
    scene.terminate();
    assert.deepEqual(log, ['base stop', 'fade out 24', 'base terminate'], 'a quick fade to the load screen, the music playing on');

    const quit = load();
    quit.scene.update();
    quit.w._handlers.shutdown();
    quit.w.openness = 0;
    quit.scene.update();
    assert.ok(quit.log.includes('fade all'));
    assert.ok(!quit.log.includes('exit'));
    quit.scene.busy = false;
    quit.scene.update();
    assert.equal(quit.log.filter(l => l === 'exit').length, 1);
    quit.log.length = 0;
    quit.scene.stop();
    assert.deepEqual(quit.log, ['stop fade all']);
});

test('CSCA Game Over Options: variables pick the music and the picture', () => {
    const plain = load({ musicVariable: '5', imageVariable: '6' });
    assert.deepEqual(plain.log, ['me db']);
    assert.equal(plain.scene._backSprite.bitmap, 'GameOver');
    const set = load({ musicVariable: '5', imageVariable: '6' }, { vars: { 5: 3, 6: 2 } });
    assert.deepEqual(set.log, ['me db', 'me Gameover3']);
    assert.equal(set.scene._backSprite.bitmap, 'GameOver2');
});
