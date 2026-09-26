'use strict';
// cremno's Screenshot taker, the game's own screenshot viewer (Scene_Custom) and Acezon's F12 Reset Fix.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const read = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_ScreenshotTaker.params.js'));

const TAKER = `module Screenshot
    KEY = :F5
    SE = 'photo'
    FORMAT = :png
    DIRECTORY = 'Graphics/Screenshots'
    FILENAME = 'Screenshot'
end
class << Graphics
  def update
    Input.trigger?(Screenshot::KEY) &&
      Graphics.snap_to_bitmap.save(Screenshot.filename) &&
        Screenshot.play_se
  end
end`;
const VIEWER = `class Scene_Custom < Scene_Base
  def load_backgrounds
    folder_path = "Graphics/Screenshots/"
  end
end`;
const F12 = `$imported = {} if $imported.nil?
$imported["Acezon-F12ResetFix"] = true`;

test('Screenshots: the three scripts are detected; Scene_Custom translates', () => {
    const families = C.scriptFamilies([TAKER, VIEWER, F12]);
    for (const key of ['screenshotTaker', 'screenshotViewer', 'acezonF12Reset']) assert.ok(families.has(key), key);
    const ctx = { constants: {}, families: new Set(['screenshotViewer']) };
    assert.match(C.ruby('SceneManager.call(Scene_Custom)', 'statement', ctx), /typeof Scene_RRScreenshots === "function"/);
});

test('Screenshots: the taker\'s settings; folders map to img/', () => {
    assert.deepEqual(extract({ scripts: [TAKER], constants: C.scriptConstants([TAKER]) }), { key: 'F5', se: 'photo', format: 'png', folder: 'img/Screenshots/', filename: 'Screenshot' });
    const other = TAKER.replace('KEY = :F5', 'KEY = :X').replace(':png', ':jpg').replace("'Graphics/Screenshots'", "'Graphics/Pictures'");
    assert.deepEqual(extract({ scripts: [other], constants: C.scriptConstants([other]) }), { key: 'rgssX', se: 'photo', format: 'jpg', folder: 'img/pictures/', filename: 'Screenshot' });
});

/** document with its keydown listeners, and a keydown by key code. */
function keyboard() {
    const listeners = [];
    const document = { addEventListener: (type, f) => { if (type === 'keydown') listeners.push(f); } };
    const press = (keyCode, extra = {}) => { const e = Object.assign({ keyCode, ctrlKey: false, altKey: false, repeat: false, preventDefault() {} }, extra); for (const f of listeners) f(e); return e; };
    return { document, press };
}

test('Screenshots: F5 saves the screen once, plays the sound and no longer reloads the game', () => {
    const { document, press } = keyboard();
    const written = [], played = [], log = [];
    const SceneManager = {
        _scene: {}, onKeyDown(e) { log.push('reload ' + e.keyCode); }, updateMain() { log.push('frame'); }
    };
    const ctx = {
        document, SceneManager, window: {},
        PluginManager: { parameters: () => ({ key: 'F5', se: 'photo', format: 'png', folder: 'img/Screenshots/', filename: 'Screenshot' }) },
        Bitmap: { snap: () => ({ canvas: { toDataURL: (type) => 'data:' + type + ';base64,AAAA' } }) },
        Utils: { isNwjs: () => true },
        process: { mainModule: { filename: '/game/index.html' } },
        Buffer,
        require: (m) => (m === 'fs' ? { mkdirSync() {}, writeFileSync: (p) => written.push(p) } : require(m)),
        AudioManager: { playSe: (se) => played.push(se.name + ' ' + se.volume) },
        Input: { isTriggered: () => false }, console
    };
    vm.runInNewContext(read('RR_ScreenshotTaker'), ctx);
    SceneManager.onKeyDown({ keyCode: 116 });
    SceneManager.onKeyDown({ keyCode: 119 });
    assert.deepEqual(log, ['reload 119'], 'F5 does not reach the reload');
    press(116);
    SceneManager.updateMain();
    SceneManager.updateMain();
    assert.equal(written.length, 1);
    assert.match(written[0], /^\/game\/img\/Screenshots\/Screenshot \(\d+\.\d{6}\)\.png$/);
    assert.deepEqual(played, ['photo 100']);
    press(116, { repeat: true });
    SceneManager.updateMain();
    assert.equal(written.length, 1, 'a held key takes one');
});

test('Screenshots: F12 starts the game again', () => {
    const { document, press } = keyboard();
    let reloads = 0;
    const ctx = { document, Utils: { isNwjs: () => true }, SceneManager: { reloadGame: () => reloads++ }, location: { reload() {} } };
    vm.runInNewContext(read('RR_AcezonF12Reset'), ctx);
    press(123);
    press(123, { ctrlKey: true });
    press(122);
    assert.equal(reloads, 1);
});

test('Screenshots: the viewer lists the folder in Windows order and steps round it with an unscaled click', () => {
    const played = [];
    let triggered = null;
    const addWindow = [];
    function Scene_Base() {}
    Object.assign(Scene_Base.prototype, {
        initialize() {}, create() {}, update() {}, isActive: () => true, addChild() {}, createWindowLayer() {},
        addWindow(w) { addWindow.push(w); }, popScene() { played.push('pop'); }
    });
    function Sprite(bitmap) { this.bitmap = bitmap; }
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    function Window_Base(rect) { Object.assign(this, rect); this.texts = []; this.contents = { drawText: (...a) => this.texts.push(a) }; }
    const AudioManager = { _seVolume: 40, playSe(se) { played.push(se.name + ' at ' + this._seVolume); } };
    const ctx = {
        Scene_Base, Sprite, Rectangle, Window_Base, AudioManager, window: {},
        PluginManager: { parameters: () => ({}) },
        Utils: { isNwjs: () => true },
        process: { mainModule: { filename: '/game/index.html' } },
        require: (m) => (m === 'fs' ? { existsSync: () => true, readdirSync: () => ['Screenshot (2).png', 'default.png', 'notes.txt', 'Upper.PNG'] } : require(m)),
        ImageManager: { loadBitmap: (folder, name) => folder + name, loadPicture: (name) => 'pictures/' + name },
        Bitmap: function() {},
        Input: { isTriggered: (k) => k === triggered },
        TouchInput: { isCancelled: () => false }
    };
    vm.runInNewContext(read('RR_ScreenshotViewer'), ctx);
    const scene = new ctx.window.Scene_RRScreenshots();
    scene.create();
    assert.deepEqual(scene._backgrounds.map(b => b.name), ['default', 'Screenshot (2)']);
    assert.equal(scene._background.bitmap, 'img/Screenshots/default');
    assert.equal(scene._vignette.bitmap, 'pictures/vignette');
    const w = addWindow[0];
    assert.deepEqual([w.x, w.y, w.width, w.height], [120, 410, 400, 60]);
    assert.deepEqual(w.texts[0], ['Press ← or → to view more photos', 0, 0, 376, 36, 'center']);
    triggered = 'left'; scene.update();
    assert.equal(scene._background.bitmap, 'img/Screenshots/Screenshot (2)');
    triggered = 'right'; scene.update(); scene.update();
    assert.equal(scene._background.bitmap, 'img/Screenshots/Screenshot (2)');
    assert.deepEqual(played, ['GUI_click_03 at 100', 'GUI_click_03 at 100', 'GUI_click_03 at 100']);
    assert.equal(AudioManager._seVolume, 40);
    triggered = 'cancel'; scene.update();
    assert.equal(played[3], 'pop');
});
