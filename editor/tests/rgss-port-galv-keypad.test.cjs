'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_GalvKeypad.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_GalvKeypad.params.js'));

const SCRIPT = `$imported = {} if $imported.nil?
$imported["Keypad"] = true
module Keypad
  KEYPAD_VAR = 20              # Variable that the keypad stores number in.
  MAX_NUM = 4                # Amount of numbers you can enter in the keypad.
  OK_SE = ["", 100, 100]  # OK sound effect. ["SE Name", volume, pitch]
end
class Scene_Keypad < Scene_MenuBase
end
class Game_Interpreter
  def keypad_input
    SceneManager.call(Scene_Keypad)
    wait(1)
  end
end`;

test('Galv Keypad: detected, keypad_input and the scene translate', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('galvKeypad'));
    assert.ok(!C.scriptFamilies(['class Scene_Map\nend']).has('galvKeypad'));
    const ctx = { constants: C.scriptConstants([SCRIPT]), families: new Set(['galvKeypad']) };
    assert.equal(C.ruby('keypad_input', 'statement', ctx), 'this.rrKeypadInput?.();');
    assert.match(C.ruby('SceneManager.call(Scene_Keypad)', 'statement', ctx), /Scene_RRKeypad/);
});

test('Galv Keypad: settings come from the game copy', () => {
    const scripts = ['module YEA\n  module CORE\n    FONT_SIZE = 18\n  end\nend\nFont.default_size = YEA::CORE::FONT_SIZE', SCRIPT.replace('OK_SE = [""', 'OK_SE = ["Beep"').replace('MAX_NUM = 4', 'MAX_NUM = 12')];
    const p = extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.deepEqual(p, { variable: '20', maxDigits: '12', okSe: '{"name":"Beep","volume":100,"pitch":100}', rgssFontSize: '18' });
    assert.equal(extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) }).okSe, '{"name":"","volume":100,"pitch":100}');
});

/** The plugin in a vm with small window, scene and input stubs. */
function load(parameters = {}) {
    const played = [], pops = [], vars = {};
    const pressed = { trig: new Set(), rep: new Set() };
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    const bitmap = () => ({ fontSize: 0, texts: [], clear() { this.texts = []; }, drawText(t, x, y, w, h, a) { this.texts.push({ t, x, y, w, h, a, size: this.fontSize }); }, measureTextWidth() { return 10; } });
    function Window_Base() {}
    Window_Base.prototype.initialize = function(rect) { Object.assign(this, { x: rect.x, y: rect.y, width: rect.width, height: rect.height, innerWidth: rect.width - 24, contents: bitmap(), contentsBack: bitmap(), active: false, _handlers: {} }); };
    Window_Base.prototype.lineHeight = () => 24;
    Window_Base.prototype.resetTextColor = function() {};
    Window_Base.prototype.textWidth = function(t) { return this.contents.measureTextWidth(t); };
    function Window_Selectable() {}
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    Window_Selectable.prototype.initialize = function(rect) { Window_Base.prototype.initialize.call(this, rect); this._index = -1; };
    Window_Selectable.prototype.index = function() { return this._index; };
    Window_Selectable.prototype.refresh = function() { this.paint(); };
    Window_Selectable.prototype.refreshCursor = function() { const r = this.itemRect(this._index); this.cursor = [r.x, r.y, r.width, r.height]; };
    Window_Selectable.prototype.setHandler = function(k, f) { this._handlers[k] = f; };
    Window_Selectable.prototype.callHandler = function(k) { this._handlers[k](); };
    Window_Selectable.prototype.activate = function() { this.active = true; };
    Window_Selectable.prototype.isOpenAndActive = function() { return this.active; };
    function Scene_MenuBase() {}
    Scene_MenuBase.prototype.initialize = function() {};
    Scene_MenuBase.prototype.create = function() {};
    Scene_MenuBase.prototype.addWindow = function() {};
    function Game_Interpreter() {}
    const ctx = {
        Rectangle, Window_Base, Window_Selectable, Scene_MenuBase, Game_Interpreter, window: {},
        PluginManager: { parameters: () => Object.assign({ variable: '20', maxDigits: '4', okSe: '{"name":"","volume":100,"pitch":100}', rgssFontSize: '18' }, parameters) },
        Graphics: { boxWidth: 640, boxHeight: 480 },
        $gameSystem: { mainFontSize: () => 16.1, lineHeight: () => 24, windowPadding: () => 12 },
        $gameVariables: { setValue: (id, v) => { vars[id] = v; } },
        SceneManager: { changing: false, push(s) { pops.push('push:' + s.name); }, pop() { pops.push('pop'); this.changing = true; }, isSceneChanging() { return this.changing; } },
        SoundManager: { playOk: () => played.push('ok'), playCancel: () => played.push('cancel'), playBuzzer: () => played.push('buzzer') },
        AudioManager: { playSe: (se) => played.push(se) },
        Input: { isTriggered: (k) => pressed.trig.has(k), isRepeated: (k) => pressed.rep.has(k) || pressed.trig.has(k) },
        TouchInput: { isTriggered: () => false, isCancelled: () => false }
    };
    vm.runInNewContext(source, ctx);
    const scene = new ctx.window.Scene_RRKeypad();
    scene.create();
    const pad = scene._padWindow, number = scene._numberWindow;
    const press = (k) => { pressed.trig = new Set([k]); pad.processHandling(); pressed.trig = new Set(); };
    return { ctx, scene, pad, number, press, played, pops, vars, Game_Interpreter };
}

test('Galv Keypad: windows sit where the original put them on a 640×480 screen', () => {
    const { pad, number } = load();
    assert.deepEqual([number.x, number.y, number.width, number.height], [227, 56, 185, 48]);
    assert.deepEqual([pad.x, pad.y, pad.width, pad.height], [227, 112, 185, 240]);
    assert.deepEqual(pad.cursor, [0, 0, 62, 62]);
    assert.deepEqual(pad.contents.texts.map(t => t.t), ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'OK', '0', 'X']);
    assert.deepEqual([pad.contents.texts[11].x, pad.contents.texts[11].y], [96, 144]);
    assert.ok(Math.abs(pad.contents.texts[0].size - 16.1 * 32 / 18) < 1e-9, 'size 32 scaled to the game font');
    // More than ten digits widens the box by 20 px a digit, centred on the pad.
    const wide = load({ maxDigits: '12' }).number;
    assert.deepEqual([wide.x, wide.width], [207, 225]);
});

test('Galv Keypad: the cursor wraps only on a fresh press', () => {
    const { pad } = load();
    pad._index = 9; pad.cursorDown(false); assert.equal(pad.index(), 9);
    pad.cursorDown(true); assert.equal(pad.index(), 0);
    pad.cursorUp(false); assert.equal(pad.index(), 0);
    pad.cursorUp(true); assert.equal(pad.index(), 9);
    pad.cursorLeft(true); pad._index = 0; pad.cursorLeft(true); assert.equal(pad.index(), 11);
    pad.cursorRight(false); assert.equal(pad.index(), 11);
    pad.cursorRight(true); assert.equal(pad.index(), 0);
    pad._index = 2; pad.cursorRight(false); assert.equal(pad.index(), 3, 'right runs on to the next row');
    pad._index = 8; pad.cursorDown(false); assert.equal(pad.index(), 11);
});

test('Galv Keypad: typing, the limit, OK and the variable', () => {
    const { pad, number, press, played, pops, vars } = load();
    for (let i = 0; i < 5; i++) press('ok');
    assert.equal(number.numeral(), '1111');
    assert.deepEqual(played, ['ok', 'ok', 'ok', 'ok', 'buzzer']);
    pad._index = 10; played.length = 0;
    press('cancel'); press('ok');
    assert.equal(number.numeral(), '1110');
    pad._index = 9; press('ok');
    assert.equal(vars[20], 1110);
    assert.deepEqual(pops, ['pop']);
    assert.deepEqual(played, ['cancel', 'ok'], 'no OK sound when the game gave it no name');
});

test('Galv Keypad: OK on nothing is 0; X and backing out are -1 with the cancel sound', () => {
    let k = load({ okSe: '{"name":"Beep","volume":80,"pitch":120}' });
    k.pad._index = 9; k.press('ok');
    assert.equal(k.vars[20], 0);
    assert.deepEqual(k.played.map(se => ({ ...se })), [{ name: 'Beep', volume: 80, pitch: 120, pan: 0 }]);
    k = load();
    k.pad._index = 11; k.press('ok');
    assert.deepEqual([k.vars[20], k.played, k.pops], [-1, ['cancel'], ['pop']]);
    k = load();
    k.press('ok'); k.press('cancel'); k.press('cancel');
    assert.deepEqual([k.vars[20], k.played, k.pops], [-1, ['ok', 'cancel', 'cancel'], ['pop']]);
    k.press('cancel');
    assert.deepEqual(k.pops, ['pop'], 'nothing more once the scene is leaving');
});

test('Galv Keypad: the script call opens the keypad', () => {
    const { Game_Interpreter, pops } = load();
    new Game_Interpreter().rrKeypadInput();
    assert.deepEqual(pops, ['push:Scene_RRKeypad']);
});
