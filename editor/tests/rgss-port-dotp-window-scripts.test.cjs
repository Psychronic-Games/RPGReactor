'use strict';
// Theo's Command Help Popup, Vlue's Special Window Effects and modern algebra's Global Text Codes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const read = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

const HELP = `($imported ||= {})[:Theo_CommandHelp] = true
module Theo
  module CmnHelp
    List = {
      "Items" => "Opens a list of items, categorised by item type.",
      "Manage" => "View or change certain aspect about a character",
    }
    Button   = :A   # The button pressed to execute the help window.
    ShowTime = 300    # How long it takes for the help window to be shown. (60 = 1 second)
  end
end`;
const WEFF = `WEFF_OPEN_STYLE = :slide
#Style to be used when scene closes:
WEFF_CLOSE_STYLE = :slide
#Speed of fade and slide styles in frames:
WEFF_SPEED = 5`;
const GTC = `$imported = {} unless $imported
$imported[:MAGlobalTextCodes] = true
MAGTC_MANUAL_CODES = false
MAGTC_RCODES = { # <- Do not touch
  0 => "\\\\i[112]\\\\c[14]New Game\\\\c[0]", # Example
  1 => "", # You can make as many of these as you want
  2 => "\\\\i[40]Blood Hound",
}`;

test('window scripts: detected, with their settings from the game copies', () => {
    const families = C.scriptFamilies([HELP, WEFF, GTC]);
    for (const key of ['theoCommandHelp', 'vlueWindowEffects', 'maGlobalTextCodes']) assert.ok(families.has(key), key);
    const scripts = ['Font.default_size = 18', HELP];
    const help = params('RR_TheoCommandHelp').extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.deepEqual(JSON.parse(help.list), { Items: 'Opens a list of items, categorised by item type.', Manage: 'View or change certain aspect about a character' });
    assert.deepEqual([help.button, help.showTime, help.rgssFontSize], ['shift', '300', '18']);
    assert.deepEqual(params('RR_VlueWindowEffects').extract({ scripts: [WEFF], constants: C.scriptConstants([WEFF]) }), { openStyle: 'slide', closeStyle: 'slide', speed: '5' });
    const gtc = params('RR_MaGlobalTextCodes').extract({ scripts: [GTC], constants: C.scriptConstants([GTC]) });
    assert.equal(gtc.manual, 'false');
    assert.deepEqual(JSON.parse(gtc.rcodes), { 0: '\\i[112]\\c[14]New Game\\c[0]', 1: '', 2: '\\i[40]Blood Hound' });
});

test('Command Help: the help button over a listed command opens the box in the middle, then it closes', () => {
    let pressed = null;
    const scene = { children: [], addChild(c) { this.children.push(c); c.parent = this; } };
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    function Window_Base() {}
    Object.assign(Window_Base.prototype, {
        initialize(rect) { this.padding = 12; this.move(rect.x, rect.y, rect.width, rect.height); this.openness = 255; },
        move(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h, innerWidth: w - 24 }); },
        fittingHeight: (n) => n * 24 + 24, createContents() { this.drawn = []; }, resetFontSettings() {},
        textWidth: (t) => t.length * 8, drawTextEx(t, x, y) { this.drawn.push([t, x, y]); },
        update() { if (this._opening) this.updateOpen(); if (this._closing) this.updateClose(); },
        open() { if (this.openness < 255) this._opening = true; this._closing = false; },
        close() { if (this.openness > 0) this._closing = true; this._opening = false; },
        isOpen() { return this.openness >= 255; }, isClosed() { return this.openness <= 0; }
    });
    let openness = [];
    const setOpenness = { get() { return this._o; }, set(v) { this._o = Math.min(Math.max(v, 0), 255); } };
    Object.defineProperty(Window_Base.prototype, 'openness', setOpenness);
    function Window_Command() {}
    Window_Command.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Command.prototype, {
        processHandling() {}, isOpenAndActive() { return this.active; }, index() { return this._index; },
        commandName(i) { return this._list[i]; }
    });
    const ctx = {
        Rectangle, Window_Base, Window_Command, window: {},
        PluginManager: { parameters: () => ({ list: JSON.stringify({ Items: 'Opens a list.' }), button: 'shift', showTime: '10', rgssFontSize: '18' }) },
        Input: { isTriggered: (k) => k === pressed },
        SceneManager: { _scene: scene },
        Graphics: { boxWidth: 640, boxHeight: 480 }
    };
    vm.runInNewContext(read('RR_TheoCommandHelp'), ctx);
    const w = new Window_Command();
    Object.assign(w, { _list: ['Items', 'Skills'], _index: 1, active: true });
    pressed = 'shift';
    w.processHandling();
    assert.equal(scene.children.length, 0, 'no help written for Skills');
    w._index = 0; w.active = false;
    w.processHandling();
    assert.equal(scene.children.length, 0, 'an inactive list shows none');
    w.active = true;
    w.processHandling();
    const box = scene.children[0];
    // "Opens a list." is 13 × 8 = 104 wide: 104 + 24 + 2; 18 + 36 tall; centred.
    assert.deepEqual([box.x, box.y, box.width, box.height], [(640 - 130) >> 1, (480 - 54) >> 1, 130, 54]);
    assert.deepEqual(box.drawn, [['Opens a list.', 0, 0]]);
    assert.equal(box.openness, 0);
    pressed = null;
    for (let i = 0; i < 12; i++) { box.update(); openness.push(box.openness); }
    // The window moves before the count is read (as the original's update did): opening starts the frame after,
    // 48 a frame, and closing the frame after the ten are up.
    assert.deepEqual(openness, [0, 48, 96, 144, 192, 240, 255, 255, 255, 255, 255, 207]);
});

/** Scene-manager hooks of the window effects over stub windows. */
function effects(style = 'slide', close = style) {
    function Window() {}
    const scene = { started: true, fading: 0, isStarted() { return this.started; }, isFading() { return this.fading > 0; }, updates: 0, update() { this.updates++; } };
    const SceneManager = {
        _scene: scene, onSceneStart() {}, updateScene() { this._scene.update(); }, isCurrentSceneBusy() { return false; }
    };
    vm.runInNewContext(read('RR_VlueWindowEffects'), { Window, SceneManager, Graphics: { boxWidth: 640, boxHeight: 480 }, PluginManager: { parameters: () => ({ openStyle: style, closeStyle: close, speed: '5' }) } });
    const make = (x, y, width, height) => Object.assign(new Window(), { x, y, width, height, contentsOpacity: 255, openness: 255, visible: true });
    return { scene, SceneManager, make };
}

test('Window Effects: windows slide in from the nearest edge over six frames, the screen waiting', () => {
    const { scene, SceneManager, make } = effects();
    scene._command = make(0, 0, 160, 192);      // tall: from the left
    scene._status = make(160, 0, 480, 480);     // not taller than wide, top half: from the top
    scene._gold = make(0, 432, 160, 48);        // bottom half: from the bottom
    SceneManager.onSceneStart();
    assert.deepEqual([scene._command.x, scene._status.y, scene._gold.y], [-160, -480, 480]);
    const frames = [];
    for (let i = 0; i < 7; i++) { SceneManager.updateScene(); frames.push([scene._command.x, scene._status.y, scene._gold.y]); }
    assert.deepEqual(frames, [[-128, -384, 471], [-96, -288, 462], [-64, -192, 453], [-32, -96, 444], [0, 0, 435], [0, 0, 426], [0, 0, 432]]);
    assert.equal(scene.updates, 1, 'the scene runs again only once the windows are in place');
});

test('Window Effects: a screen still fading in keeps running, with its windows held off screen', () => {
    const { scene, SceneManager, make } = effects();
    scene._w = make(0, 400, 640, 80);
    scene.fading = 2;
    SceneManager.onSceneStart();
    SceneManager.updateScene();
    assert.deepEqual([scene._w.y, scene.updates], [480, 1]);
    scene.fading = 0;
    SceneManager.updateScene();
    assert.deepEqual([scene._w.y, scene.updates], [464, 1]);
});

test('Window Effects: leaving, the windows slide out before the next screen; a wide low window keeps the original\'s speed from x', () => {
    const { scene, SceneManager, make } = effects();
    scene._command = make(0, 0, 160, 192);
    scene._gold = make(0, 432, 160, 48);
    scene._help = make(200, 300, 400, 72);
    const busy = [];
    for (let i = 0; i < 8; i++) {
        const b = SceneManager.isCurrentSceneBusy();
        busy.push(b);
        if (b) SceneManager.updateScene();
    }
    assert.deepEqual(busy, [true, true, true, true, true, true, false, false]);
    assert.equal(scene.updates, 0);
    assert.equal(scene._command.x, -160);
    // (480 − 0) / 5 = 96 a frame from 432: past 480 and straight back each frame, so the gold window stays.
    assert.equal(scene._gold.y, 432);
    // (480 − 200) / 5 = 56 a frame from 300: 356, 412, 468, 524 − 56 …, never quite settled; the last frame is what shows.
    assert.equal(scene._help.y, 468);
});

test('Global Text Codes: text of two characters or more is drawn with codes, keeping the font and its alignment', () => {
    const calls = [];
    function Window_Base() {}
    Object.assign(Window_Base.prototype, {
        drawText(text, x, y, w, align) { calls.push(['plain', text, x, y, w, align]); },
        resetFontSettings() { Object.assign(this.contents, { fontSize: 16, textColor: 'white' }); },
        convertEscapeCharacters(t) { return t.replace(/\\c\[\d+\]/g, ''); },
        textSizeEx(t) { this.resetFontSettings(); return { width: this.convertEscapeCharacters(t).length * 10 }; },
        drawTextEx(t, x, y, w) { this.resetFontSettings(); calls.push(['ex', this.convertEscapeCharacters(t), x, y, w, this.contents.textColor]); }
    });
    vm.runInNewContext(read('RR_MaGlobalTextCodes'), { Window_Base, PluginManager: { parameters: () => ({ manual: 'false', rcodes: JSON.stringify({ 2: 'Blood Hound' }) }) } });
    const w = new Window_Base();
    w.contents = { width: 300, fontSize: 20, textColor: 'blue', fontFace: 'x', fontBold: false, fontItalic: false, outlineColor: 'k', outlineWidth: 3 };
    w.drawText('X', 0, 0, 100);
    w.drawText(12, 0, 0, 100);
    w.drawText('\\c[2]Name', 0, 0, 100, 'center');
    w.drawText('\\r[2]\\*', 10, 24, 200, 'right');
    w.drawText('A long plain name', 0, 48, 40);
    assert.deepEqual(calls, [
        ['plain', 'X', 0, 0, 100, undefined],
        ['plain', 12, 0, 0, 100, undefined],
        ['ex', 'Name', 30, 0, 100, 'blue'],
        ['ex', 'Blood Hound', 100, 24, 200, 'blue'],
        ['ex', 'A long plain name', 0, 48, 40, 'blue']
    ]);
    // Outside such a drawing a reset is the window's own.
    w.resetFontSettings();
    assert.equal(w.contents.textColor, 'white');
});
