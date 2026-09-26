const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_NeonLockpick.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_NeonLockpick.params.js'));

// The settings and hooks of Dreamwalker's copy of the script (v1.2.1, Roninator2's broken-lock edit).
const SCRIPT = `$imported ||= {}
$imported["CP_LOCKPICK"] = 1.1
module CP
module LOCKPICK
module SETTINGS
PICK_ITEM = 19
USE_G_PICK = false
G_PICK_ITEM = 0
VARIABLE = 100
LOCK_SOUND = "GUI_click_01"
LOCK_VOLUME = 100
LOCK_PITCH = 100
UNLOCK_SOUND = "Open1"
UNLOCK_VOLUME = 100
UNLOCK_PITCH = 100
BREAK_SOUND = "GUI_click_06"
BREAK_VOLUME = 100
BREAK_PITCH = 200
BREAK_PICK_SWITCH = 55
BREAK_PICKS = true
LOCK_DURABILITY = 200
PICK_DURABILITY = 100
BROKEN = "You have broken the lock."
SHOW_REMAINING = true
ITEM_NAME = "Lockpicks:"
end
module LOCK
X_OFFSET = 0
Y_OFFSET = 0
GRAPHIC = "Lock"
end
module PICK
X_OFFSET = 0
Y_OFFSET = 30
GRAPHIC = "Pick"
end
module KEY
X_OFFSET = 0
Y_OFFSET = -20
GRAPHIC = "Key"
end
end
end
class Lockpick < Scene_MenuBase
  def self.start(diffi, door_var = nil)
    SceneManager.call(Lockpick)
    SceneManager.scene.prepare(diffi, door_var)
    Fiber.yield
  end
  def pick_dura
    @wobble = rand(5) - 2
    WolfPad.vibrate(0.5, 0.5, 10, 0) #Shake controller
  end
  def change_pick  ## Removes a pick and prepares to change it.
    itemnum = CP::LOCKPICK::SETTINGS::PICK_ITEM
    $game_party.lose_item($data_items[itemnum], 1)
        $game_variables[12] -= 1
  end
  def new_pick
  end
end`;

test('Neon Black lockpicking: detected, Lockpick.start translated, settings read', () => {
    const fam = C.scriptFamilies([SCRIPT, '$imported["CSCA-Difficulty"] = true']);
    assert.ok(fam.has('neonLockpick'));
    assert.ok(!C.scriptFamilies(['class Lock < Scene_Base\nend']).has('neonLockpick'));
    const ctx = { constants: C.scriptConstants([SCRIPT]), families: fam };
    assert.equal(C.ruby('Lockpick.start(10)', 'statement', ctx), 'this.rrLockpickStart?.(10);');
    assert.equal(C.ruby('Lockpick.start(4, 12)', 'statement', ctx), 'this.rrLockpickStart?.(4, 12);');
    assert.equal(C.ruby('if $csca.difficulty == 1; Lockpick.start(5); end', 'statement', ctx),
        'if ((($gameSystem.rrCsca?.()?.difficulty ?? 0) === 1)) { this.rrLockpickStart?.(5); }');

    const p = extract({ scripts: [SCRIPT], constants: ctx.constants });
    assert.deepEqual([p.pickItem, p.goldPickItem, p.useGoldPick, p.variable, p.breakPickSwitch, p.breakPicks, p.lockDurability, p.pickDurability],
        ['19', '0', 'false', '100', '55', 'true', '200', '100']);
    assert.deepEqual([p.brokenText, p.showRemaining, p.itemName, p.countVariable, p.vibrate], ['You have broken the lock.', 'true', 'Lockpicks:', '12', 'true']);
    assert.deepEqual(JSON.parse(p.sounds).break, { name: 'GUI_click_06', volume: 100, pitch: 200 });
    assert.deepEqual(JSON.parse(p.graphics).pick, { name: 'Pick', x: 0, y: 30 });
});

/** The plugin in a small stand-in engine: `press` holds buttons, `frame()` runs one scene update. */
function load(overrides = {}) {
    const params = Object.assign(extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) }), overrides);
    const vars = {}, switches = {}, se = [], log = [];
    const pressed = new Set(), triggered = new Set();
    let rand = 0;
    class Bitmap { constructor(name) { this.name = name; this.width = name === 'Pick' ? 24 : name === 'Key' ? 24 : 221; this.height = name === 'Pick' ? 290 : name === 'Key' ? 107 : 224; } addLoadListener(f) { f(this); } }
    class Sprite {
        constructor(bitmap) { this.bitmap = bitmap; this.x = 0; this.y = 0; this.rotation = 0; this.anchor = { x: 0, y: 0 }; this.children = []; }
        addChild(c) { this.children.push(c); }
        addChildAt(c, i) { this.children.splice(i, 0, c); }
        removeChild(c) { this.children = this.children.filter(x => x !== c); }
        destroy() { this.destroyed = true; }
    }
    function Window_Base() {}
    Window_Base.prototype.fittingHeight = (n) => n * 24 + 24;
    Window_Base.prototype.initialize = function(rect) { this.rect = rect; this.innerWidth = rect.width - 24; this.contents = { clear() {} }; this.drawn = []; };
    Window_Base.prototype.textWidth = (t) => t.length * 8;
    Window_Base.prototype.changeTextColor = function() {};
    Window_Base.prototype.drawText = function(t, x) { this.drawn.push([String(t), x]); };
    function Scene_MenuBase() {}
    Scene_MenuBase.prototype.initialize = function() {};
    Scene_MenuBase.prototype.create = function() { this.children = []; this._windowLayer = { windows: [] }; this.children.push(this._windowLayer); };
    Scene_MenuBase.prototype.addChildAt = function(c, i) { this.children.splice(i, 0, c); };
    Scene_MenuBase.prototype.addWindow = function(w) { this._windowLayer.windows.push(w); };
    Scene_MenuBase.prototype.update = function() {};
    Scene_MenuBase.prototype.popScene = function() { log.push('pop'); };
    function Game_Interpreter() {}
    Game_Interpreter.prototype.wait = function(n) { this.waited = n; };
    const items = { 19: { id: 19 } };
    const party = { n: 3, hasItem(item) { return item === items[19] && this.n > 0; }, numItems() { return this.n; }, loseItem(item, k) { if (item === items[19]) this.n = Math.max(this.n - k, 0); } };
    const ctx = {
        PluginManager: { parameters: () => params }, Game_Interpreter, Window_Base, Scene_MenuBase, Sprite,
        DataManager: { createGameObjects() {} }, Rectangle: function(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); },
        Graphics: { width: 640, height: 480, boxHeight: 480 }, ColorManager: { normalColor() {}, systemColor() {} },
        ImageManager: { loadPicture: (n) => new Bitmap(n) },
        Input: { isTriggered: (b) => triggered.has(b), isPressed: (b) => pressed.has(b) },
        AudioManager: { playSe: (s) => se.push(s.name + ':' + s.pitch) }, SoundManager: { playCancel: () => se.push('cancel') },
        SceneManager: { push: (s) => log.push('push ' + s.name), prepareNextScene: (...a) => log.push('prepare ' + a.join(',')) },
        $gameVariables: { value: (id) => vars[id] || 0, setValue: (id, v) => { vars[id] = v; } },
        $gameSwitches: { value: (id) => !!switches[id], setValue: (id, v) => { switches[id] = v; } },
        $gameParty: party, $dataItems: items, $gameMessage: { add: (t) => log.push('message ' + t) },
        Math: Object.assign(Object.create(Math), { randomInt: (n) => Math.min(rand, n - 1) })
    };
    ctx.window = ctx;
    vm.runInNewContext(source, ctx);
    const open = (diffi, doorVar, zone) => {
        const scene = new ctx.Scene_RRLockpick();
        scene.prepare(diffi, doorVar);
        if (zone !== undefined) scene._zone = zone;
        scene.create();
        return scene;
    };
    const frame = (scene, { trigger = [], press = [] } = {}) => {
        triggered.clear(); pressed.clear();
        for (const b of trigger) { triggered.add(b); pressed.add(b); }
        for (const b of press) pressed.add(b);
        scene.update();
    };
    return { ctx, vars, switches, se, log, party, open, frame, setRand: (r) => { rand = r; } };
}

test('Lockpick.start opens the screen for the event to wait on; a lock already broken reports 4 at once', () => {
    const t = load();
    t.ctx.DataManager.createGameObjects();
    assert.equal(t.switches[55], true, 'BREAK_PICKS switches its switch on at a new game');
    const it = new t.ctx.Game_Interpreter();
    it.rrLockpickStart(10);
    assert.deepEqual(t.log, ['push Scene_RRLockpick', 'prepare 10,']);
    t.log.length = 0;
    t.vars[7] = -1;
    it.rrLockpickStart(3, 7);
    assert.deepEqual(t.log, ['message You have broken the lock.']);
    assert.deepEqual([t.vars[100], t.vars[7], it.waited], [4, -1, 1]);
});

test('the pick in the spot lets the key turn to 90 while OK is held, then the screen holds 20 frames and closes with 1', () => {
    const t = load();
    const s = t.open(3, null, 90);
    assert.deepEqual([s._door, s._haspicks, s._maxTurn], [200, true, 90]);
    assert.deepEqual(s._windowLayer.windows[0].drawn, [['3', 4 + 80 + 2], ['Lockpicks:', 4]]);
    const [lock, pick, key] = s._field.children;
    assert.deepEqual([pick.bitmap.name, pick.y, pick.anchor.y], ['Pick', 270, 12 / 290], 'the pick turns about a point a half-width down');
    assert.deepEqual([lock.x, lock.y, key.y], [320, 240, 220]);
    // OK held from before the screen opened does not turn the key.
    t.frame(s, { press: ['ok'] });
    assert.equal(s._keyRotation, 0);
    t.frame(s, { trigger: ['ok'] });
    assert.deepEqual(t.se, ['GUI_click_01:100']);
    for (let i = 0; i < 44; i++) t.frame(s, { press: ['ok'] });
    assert.equal(s._keyRotation, 88);
    assert.ok(Math.abs(key.rotation - 88 * Math.PI / 180) < 1e-9, 'the key turns clockwise');
    t.frame(s, { press: ['ok'] });
    assert.deepEqual([t.vars[100], t.se.at(-1)], [1, 'Open1:100']);
    for (let i = 0; i < 19; i++) t.frame(s);
    assert.deepEqual(t.log, [], 'the unlocked key shows for 20 frames');
    t.frame(s);
    assert.deepEqual(t.log, ['pop']);
});

test('off the spot the key stops short; straining wears the pick, which snaps, costs an item and wears the lock', () => {
    const t = load();
    const s = t.open(9, null, 90);
    // Right (or D) moves the pick 2 a frame; each step past 4 either side takes the difficulty off the turn.
    t.frame(s, { press: ['rgssZ'] });
    t.frame(s, { press: ['right'] });
    t.frame(s, { press: ['right'] });
    t.frame(s, { press: ['right'] });
    assert.deepEqual([s._pickRotation, s._maxTurn], [98, 90 - 4 * 9]);
    t.frame(s, { press: ['left', 'rgssX'] });
    assert.equal(s._pickRotation, 96);
    assert.equal(s._maxTurn, 72);
    t.frame(s, { trigger: ['ok'] });
    for (let i = 0; i < 36; i++) t.frame(s, { press: ['ok'] });
    assert.equal(s._keyRotation, 72);
    t.setRand(4);
    const pick = s._pickSprite;
    // 100 durability less 9 a frame: the 12th frame at the stop snaps it.
    for (let i = 0; i < 11; i++) t.frame(s, { press: ['ok'] });
    assert.equal(s._durability, 1);
    assert.ok(Math.abs(pick.rotation - (-(96 - 90 + 2) * Math.PI / 180)) < 1e-9, 'the pick shakes');
    t.frame(s, { press: ['ok'] });
    assert.deepEqual([t.se.at(-1), pick.y], ['GUI_click_06:200', 273]);
    for (let i = 0; i < 4; i++) t.frame(s, { press: ['ok'] });
    assert.equal(pick.y, 285, 'it drops 15 px over five frames');
    for (let i = 0; i < 10; i++) t.frame(s, { press: ['ok'] });
    assert.equal(t.party.n, 3, 'held for 10 frames before it is lost');
    t.frame(s, { press: ['ok'] });
    assert.deepEqual([t.party.n, t.vars[12], s._door, s._keyRotation, s._pickRotation], [2, -1, 200 - 27, 0, 90]);
    assert.ok(pick.destroyed && s._pickSprite !== pick && s._field.children[1] === s._pickSprite);
    assert.deepEqual(s._windowLayer.windows[0].drawn.slice(-2), [['2', 86], ['Lockpicks:', 4]]);
    for (let i = 0; i < 10; i++) t.frame(s, { press: ['ok'] });
    assert.equal(s._routine, null, 'a new pick is ready after 10 frames');
});

test('the last pick snapping ends with 3; the lock wearing out ends with 4 and the message; cancel is 2', () => {
    let t = load();
    t.party.n = 1;
    let s = t.open(9, null, 0);
    s._pickRotation = 180; s.keyMath();
    t.frame(s, { trigger: ['ok'] });
    for (let i = 0; i < 12 + 15 + 1; i++) t.frame(s, { press: ['ok'] });
    assert.deepEqual([t.vars[100], t.party.n, t.log], [3, 0, ['pop']]);

    t = load({ lockDurability: '20' });
    s = t.open(9, 5, 0);
    assert.equal(s._door, 0, 'a lock variable holding 0 is taken as it is');
    s = t.open(9, null, 0);
    s._pickRotation = 180; s.keyMath();
    t.frame(s, { trigger: ['ok'] });
    for (let i = 0; i < 12 + 15 + 1; i++) t.frame(s, { press: ['ok'] });
    assert.equal(s._door, -1);
    assert.deepEqual([t.vars[100], t.party.n, t.log], [4, 3, ['message You have broken the lock.', 'pop']], 'the broken lock keeps the pick');

    t = load();
    t.vars[8] = 150;
    s = t.open(3, 8, 0);
    t.frame(s, { trigger: ['cancel'] });
    assert.deepEqual([t.vars[100], t.vars[8], t.se, t.log], [2, 150, ['cancel'], ['pop']]);

    t = load();
    t.party.n = 0;
    s = t.open(3, null, 0);
    assert.equal(s._pickSprite, undefined, 'no pick is drawn without one');
    t.frame(s, { trigger: ['ok'] });
    assert.deepEqual([t.vars[100], t.se], [3, []]);
});
