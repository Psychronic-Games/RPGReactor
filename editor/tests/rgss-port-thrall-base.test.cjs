// Thrall (VX) base ports: RR_VxCompat's VX windows and rrVx drawing, the game's key configuration
// (Key Module, Gamepad Module, Read Controls), Discovery Title Screen with Thrall's title, Basic Window Resizer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));
// Values made in a vm context fail strict equality across realms: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

// Snippets of Thrall's own sections.
const WINDOW_BASE = 'class Window_Base < Window\n  #--\n  # * Constants\n  #--\n  WLH = 24                  # Window Line Height\n  def initialize(x, y, width, height)\n  end\nend';
const KEY_MODULE = 'module Keys\n  CANCEL              = 0x03 # Control-Break Processing\n  ESCAPE              = 0x1B # Esc Key\n  SPACE               = 0x20 # Space Bar Key\n  LEFT                = 0x25 # Left Arrow Key\n  UP                  = 0x26 # Up Arrow Key\n  RIGHT               = 0x27 # Right Arrow Key\n  DOWN                = 0x28 # Down Arrow Key\n  A                   = 0x41 # A Key\n  C                   = 0x43 # C Key\n  D                   = 0x44 # D Key\n  Q                   = 0x51 # Q Key\n  S                   = 0x53 # S Key\n  W                   = 0x57 # W Key\n  X                   = 0x58 # X Key\n  Z                   = 0x5A # Z Key\n  ANYKEY              = 0x100 # Any Key\n  begin\n    @unpack_string = \'B\' * 256\n  end\nend';
const GAMEPAD = 'module Gamepad\n  def self.press?(button)\n    if Keys.press?($game_system.controls[button])\n      $game_switches[59] = false if $game_switches[59]\n      return true\n    end\n  end\n  def self.confirm\n    return 2\n  end\n  def self.compare\n    return 5\n  end\n  def self.sort\n    return 6\n  end\nend';
const READ_CONTROLS = 'module Config\n  def self.read_input_A\n    #Check system controls\n    if $game_switches[59]\n      button = [$game_system.controls_g[0]]\n    else\n      button = $game_system.controls[0]\n    end\n    icon = find_button(button[0])\n    return icon\n  end\n  def self.find_button(button)\n    case button\n    when Input::C\n      if $game_switches[60]\n        return 186\n      else\n        return 178\n      end\n    end\n  end\nend';
const GAME_SYSTEM = 'class Game_System\n  def initialize\n    @controls = [[Keys::C],[Keys::X,Keys::ESCAPE],[Keys::Z,Keys::SPACE],\n    [Keys::A],[Keys::S],[Keys::Q],[Keys::W],[Keys::D],[Keys::UP],[Keys::LEFT],\n    [Keys::DOWN],[Keys::RIGHT]]\n    @controls_g = [Input::C,Input::B,Input::A,Input::Y,Input::Z,Input::X,\n    Input::L,Input::R,Input::UP,Input::LEFT,Input::DOWN,Input::RIGHT]\n  end\nend';
const SCENE_TITLE = 'class Scene_Title < Scene_Base\n  def create_game_objects\n    # Load Config\n    file = File.open("Data/ConfigVar.rvdata", "rb")\n    temp = Marshal.load(file)\n    file.close\n    vars = [9,10,87,90]\n    for i in vars\n      $game_variables[i] = temp[i]\n    end\n    file = File.open("Data/ConfigSwi.rvdata", "rb")\n    temp = Marshal.load(file)\n    file.close\n    switches = [7,11]\n    for i in switches\n      $game_switches[i] = temp[i]\n    end\n    case $game_variables[87]\n    when 0\n      Font.default_name = "Eagle Lake"\n      Font.default_size = 20\n    when 1\n      Font.default_name = "Roboto"\n      Font.default_size = 18\n    end\n    case $game_variables[90]\n    when 1\n      Resolution.resize(760,600)\n    when 2\n      Resolution.resize(912,720)\n    end\n  end\n  def check_newgame\n    @newgame_enabled = (Dir.glob(\'Save*.rvdata\').size < 4)\n  end\nend';
const DISCOVERY = 'module Rekx\n  module CustomTitle\n    FALLING = true\n    NEW_GAME_GRAPHICS = ["new_game","new_game_off","new_game_disabled"]\n    CONTINUE_GRAPHICS = ["continue","continue_off","continue_disabled"]\n    ERASE_GRAPHICS = ["erase","erase_off","erase_disabled"]\n    SHUTDOWN_GRAPHICS = ["exit","exit_off"]\n    SETTINGS_GRAPHICS = ["settings","settings_off"]\n    STYLE = 2 # 1 or 2\n    PLACEMENT = 1\n    SLIDE_SPEED = 3\n    ALLOW_SLIDE = true\n    TITLE_X = 0\n    TITLE_Y = 0\n    # New Game Offset, Continue Offset, Exit Offset\n    COMMAND_X = [0,0,0,0,0]\n    COMMAND_Y = [0,0,0,0,0]\n    COMMAND_OPA = 255    \n  end\nend\nclass Scene_Title < Scene_Base\n  def start\n    @nBgImage = "title_bg"\n    @nfall1 = "fall1"\n    @nfall2 = "fall2"\n    @ntitle = "title_image"\n  end\nend';
const RESIZER = "class Resolution\n  SWPO = Win32API.new 'user32', 'SetWindowPos', ['l','i','i','i','i','i','p'], 'i'\n  def self.resize(width,height,noMove=false)\n  end\nend";
const SCRIPTS = [WINDOW_BASE, GAME_SYSTEM, SCENE_TITLE, KEY_MODULE, GAMEPAD, READ_CONTROLS, DISCOVERY, RESIZER];

// Ruby Marshal for the config files: arrays of small integers, and a Game_Variables / Game_Switches object.
function marshal(value) {
    const out = [4, 8];
    const int = (n) => { if (n === 0) out.push(0); else if (n > 0 && n < 123) out.push(n + 5); else if (n > 0 && n < 256) out.push(1, n); else out.push(2, n & 255, n >> 8); };
    const sym = (s) => { out.push(0x3a); int(s.length); for (const c of s) out.push(c.charCodeAt(0)); };
    const put = (v) => {
        if (v === null) out.push(0x30); else if (v === true) out.push(0x54); else if (v === false) out.push(0x46);
        else if (typeof v === 'number') { out.push(0x69); int(v); }
        else if (Array.isArray(v)) { out.push(0x5b); int(v.length); v.forEach(put); }
        else { out.push(0x6f); sym(v.cls); int(1); sym('@data'); put(v.data); }
    };
    put(value);
    return Buffer.from(out);
}

test('the families find Thrall\'s scripts, and RR_VxCompat installs before the ports', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of ['vxBase', 'thrallKeys', 'thrallTitle', 'basicWindowResizer']) assert.ok(fam.has(key), key);
    // VX Ace's Window_Base has no WLH: an Ace game does not get the VX base.
    assert.ok(!C.scriptFamilies(['class Window_Base < Window\n  def line_height\n    return 24\n  end\nend']).has('vxBase'));
    const vx = C.FAMILIES.find(f => f.key === 'vxBase');
    vx.detect.lastIndex = 0;
    assert.equal(vx.detect.exec(SCRIPTS.join('\n')).index, 0, 'matched at the start of the scripts');
});

test('events\' calls into the key scripts and the resizer translate', () => {
    const ctx = { constants: {}, families: new Set(['thrallKeys', 'basicWindowResizer']) };
    assert.equal(C.ruby('$game_variables[97] = Config.read_input_Y', 'statement', ctx), '$gameVariables.setValue(97, ($gameSystem.rrReadInput?.(6) ?? 854));');
    assert.equal(C.ruby('$game_variables[98] = Config.read_input_B', 'statement', ctx), '$gameVariables.setValue(98, ($gameSystem.rrReadInput?.(1) ?? 854));');
    assert.equal(C.ruby('Gamepad.trigger?(Gamepad.confirm)', 'expression', ctx), '(Input.rrGamepadTriggered?.(2) ?? false)');
    assert.equal(C.ruby('Keys.press?(65)', 'expression', ctx), '(Input.rrKeyPressed?.(65) ?? false)');
    assert.equal(C.ruby('Resolution.resize(760,600)', 'statement', ctx), 'Graphics.rrResolutionResize?.(760, 600);');
});

test('settings come from the game: controls, config files, title constants, fonts and sizes', () => {
    // With no file reader the controls are Game_System's defaults.
    const bare = params('RR_ThrallKeys').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(bare.controls), [[67], [88, 27], [90, 32], [65], [83], [81], [87], [68], [38], [37], [40], [39]]);
    assert.deepEqual(JSON.parse(bare.controlsGamepad), [13, 12, 11, 15, 16, 14, 17, 18, 8, 4, 2, 6]);
    assert.deepEqual([bare.deviceSwitch, bare.glyphSwitch, bare.configVariables], ['59', '60', undefined]);
    // The shipped config files win, and only the ids the title loads are kept.
    const vars = []; vars[9] = 100; vars[10] = 3; vars[87] = 1; vars[50] = 7;
    const sws = []; sws[7] = true; sws[11] = false;
    const files = {
        'Data/ConfigKey.rvdata': marshal([[67], [88, 27], [13], [65], [83], [81], [87], [68], [38], [37], [40], [39]]),
        'Data/ConfigCon.rvdata': marshal([13, 12, 11, 15, 16, 14, 17, 18, 8, 4, 2, 6]),
        'Data/ConfigVar.rvdata': marshal({ cls: 'Game_Variables', data: Array.from({ length: 91 }, (_, i) => (vars[i] === undefined ? null : vars[i])) }),
        'Data/ConfigSwi.rvdata': marshal({ cls: 'Game_Switches', data: Array.from({ length: 12 }, (_, i) => (sws[i] === undefined ? null : sws[i])) })
    };
    const keys = params('RR_ThrallKeys').extract({ scripts: SCRIPTS, read: (rel) => files[rel] || null });
    assert.deepEqual(JSON.parse(keys.controls)[2], [13]);
    assert.deepEqual(JSON.parse(keys.configVariables), { 9: 100, 10: 3, 87: 1, 90: 0 });
    assert.deepEqual(JSON.parse(keys.configSwitches), { 7: true, 11: false });

    const title = params('RR_ThrallTitle').extract({ scripts: SCRIPTS });
    assert.deepEqual([title.falling, title.style, title.placement, title.slideSpeed, title.maxSaves, title.background, title.logo], ['true', '2', '1', '3', '4', 'title_bg', 'title_image']);
    assert.deepEqual(JSON.parse(title.commands)[3], ['settings', 'settings_off']);
    assert.deepEqual(JSON.parse(title.fonts), [['', 20, 0], ['Roboto-Regular.ttf', 18, 15]]);
    assert.deepEqual([title.fontVariable, title.sizeVariable, JSON.parse(title.sizes)], ['87', '90', [null, [760, 600], [912, 720]]]);

    assert.deepEqual(params('RR_VxCompat').extract({ scripts: SCRIPTS }), { fontSize: '20' });
    assert.deepEqual(params('RR_VxCompat').extract({ scripts: ['Font.default_size = 20\nFont.default_shadow = false', 'Font.default_size = 18'] }), { fontSize: '20', textShadow: 'false' });
});

/** A context with just enough of MZ for RR_VxCompat's windows. */
function vxContext() {
    const calls = [];
    const contents = {
        paintOpacity: 255, textColor: '', fontSize: 12.2,
        drawText: (text, x, y, w, h, align) => calls.push(['text', text, x, y, w, h, align, contents.textColor, contents.paintOpacity]),
        fillRect: (x, y, w, h, c) => calls.push(['fill', x, y, w, h, c]),
        gradientFillRect: (x, y, w, h, c1, c2) => calls.push(['gradient', x, y, w, h, c1, c2]),
        blt: (b, sx, sy, sw, sh, dx, dy) => calls.push(['blt', b.name, sx, sy, sw, sh, dx, dy, contents.paintOpacity]),
        measureTextWidth: (t) => String(t).length * 6
    };
    function Rectangle(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
    function Window_Base() { this.contents = contents; this.innerWidth = 416; }
    Window_Base.prototype.lineHeight = () => 24;
    Window_Base.prototype.changeTextColor = function(c) { this.contents.textColor = c; };
    Window_Base.prototype.textWidth = function(t) { return this.contents.measureTextWidth(t); };
    function Window_Selectable() { Window_Base.call(this); this._cols = 1; }
    Window_Selectable.prototype = Object.create(Window_Base.prototype);
    Object.assign(Window_Selectable.prototype, { maxCols() { return this._cols; }, itemHeight() { return 24; }, scrollBaseX: () => 0, scrollBaseY: () => 0 });
    function Window_Command() { Window_Selectable.call(this); }
    Window_Command.prototype = Object.create(Window_Selectable.prototype);
    function Window_Message() {}
    const bitmap = (name) => ({ name, width: 288, height: 256, isReady: () => true });
    const ctx = {
        PluginManager: { parameters: () => ({ fontSize: '20' }) }, Rectangle, Window_Base, Window_Selectable, Window_Command, Window_Message,
        Game_Map: function() {}, Spriteset_Battle: function() {}, Scene_Battle: function() {}, Game_System: function() {},
        DataManager: { onLoad() {} }, BattleManager: {}, SceneManager: { onSceneTerminate() {} },
        ColorManager: { textColor: (n) => '#c' + n },
        ImageManager: { iconWidth: 24, iconHeight: 24, loadSystem: bitmap, loadFace: bitmap, loadCharacter: bitmap, isBigCharacter: (n) => /^[!$]*\$/.test(n) },
        TextManager: { levelA: 'Lv', hpA: 'HP', mpA: 'MP', currencyUnit: 'G', param: (id) => 'P' + id },
        $gameSystem: { mainFontSize: () => 12.2 }, $gameMessage: { faceName: () => '' }
    };
    ctx.window = ctx;
    ctx.$gameSystem.rrVxDefaultFontSize = () => 20;
    vm.runInNewContext(plugin('RR_VxCompat'), ctx);
    return { ctx, calls, contents };
}

test('VX windows: rows from the left edge 32 apart, left-aligned commands, Ruby font sizes', () => {
    const { ctx } = vxContext();
    const w = new ctx.Window_Selectable();
    w._cols = 2;
    // VX: width = (contents.width + @spacing) / column_max - @spacing, x = index % column_max * (width + @spacing)
    assert.deepEqual({ ...w.itemRect(3) }, { x: 224, y: 24, width: 192, height: 24 });
    assert.equal(new ctx.Window_Command().itemTextAlign(), 'left');
    assert.equal(w.itemPadding(), 4);
    assert.equal(w.translucentOpacity(), 128);
    assert.equal(new ctx.Window_Base().rrVxFontSize(20), 12.2);
    assert.equal(new ctx.Window_Base().rrVxFontSize(10), 6.1);
    assert.equal(ctx.Window_Message.prototype.newLineX.call({ innerWidth: 576 }, {}), 0);
});

test('VX drawing: HP with its gauge 6 px tall at y + 16, names, levels, items, faces', () => {
    const { ctx, calls } = vxContext();
    const w = new ctx.Window_Base();
    const actor = { hp: 20, mhp: 100, mp: 0, mmp: 0, level: 7, name: () => 'Mel', currentClass: () => ({ name: 'Elementalist' }), states: () => [{ iconIndex: 3 }, { iconIndex: 4 }, { iconIndex: 5 }, { iconIndex: 6 }, { iconIndex: 7 }], param: (id) => id * 10, faceName: () => 'Face', faceIndex: () => 5 };
    w.rrVxDrawActorHp(actor, 10, 24);
    assert.deepEqual(calls.slice(0, 3), [['fill', 10, 40, 120, 6, '#c19'], ['gradient', 10, 40, 24, 6, '#c20', '#c21'], ['text', 'HP', 10, 24, 30, 24, 'left', '#c16', 255]]);
    // 20 of 100 is a crisis (under a quarter): the value in crisis colour, the max in normal colour.
    assert.deepEqual(calls.slice(3).map(c => [c[1], c[2], c[4], c[7]]), [['20', 31, 44, '#c17'], ['/', 75, 11, '#c0'], ['100', 86, 44, '#c0']]);
    calls.length = 0;
    w.rrVxDrawActorMp(actor, 0, 0, 100);
    assert.deepEqual(calls[1], ['gradient', 0, 16, 0, 6, '#c22', '#c23'], 'an empty MP bar (max 0 counts as 1)');
    assert.deepEqual(calls.slice(3).map(c => [c[1], c[2]]), [['0', 56]], 'under 120 wide: the value alone');
    calls.length = 0;
    actor.hp = 0;
    w.rrVxDrawActorName(actor, 0, 0);
    assert.deepEqual(calls[0], ['text', 'Mel', 0, 0, 108, 24, 'left', '#c18', 255], 'knocked out');
    calls.length = 0;
    w.rrVxDrawActorLevel(actor, 0, 0);
    assert.deepEqual(calls.map(c => [c[1], c[2], c[4], c[6]]), [['Lv', 0, 32, 'left'], ['7', 32, 24, 'right']]);
    calls.length = 0;
    w.rrVxDrawActorState(actor, 0, 0, 96);
    assert.equal(calls.length, 4, 'four icons fit in 96');
    calls.length = 0;
    w.rrVxDrawItemName({ iconIndex: 17, name: 'Grape' }, 0, 0, false);
    assert.deepEqual(calls, [['blt', 'IconSet', 24, 24, 24, 24, 0, 0, 128], ['text', 'Grape', 24, 0, 172, 24, 'left', '#c0', 128]]);
    calls.length = 0;
    w.rrVxDrawActorFace(actor, 4, 4, 80);
    assert.deepEqual(calls, [['blt', 'Face', 104, 104, 80, 80, 4, 4, 255]]);
    calls.length = 0;
    w.rrVxDrawActorParameter(actor, 0, 0, 2);
    assert.deepEqual(calls.map(c => c[1]), ['P4', '40'], 'Spirit is MZ\'s M.Attack');
    // The game's own colours replace VX's through the rrVx methods.
    w.rrVxSystemColor = () => '#mine';
    calls.length = 0;
    w.rrVxDrawActorLevel(actor, 0, 0);
    assert.equal(calls[0][7], '#mine');
});

/** RR_ThrallKeys over a small Input with MZ's repeat rule. */
function keysContext(parameters = {}) {
    const switches = [], variables = [];
    const Input = {
        keyMapper: { 9: 'tab', 13: 'ok', 16: 'shift', 17: 'control', 27: 'escape', 32: 'ok', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 65: 'rgssX', 81: 'pageup', 87: 'pagedown', 88: 'escape', 90: 'ok', 120: 'debug' },
        gamepadMapper: { 0: 'ok', 1: 'cancel', 2: 'shift', 3: 'menu', 4: 'pageup', 5: 'pagedown', 12: 'up', 13: 'down', 14: 'left', 15: 'right' },
        _gamepadStates: [], _current: {},
        _onKeyDown(e) { const n = this.keyMapper[e.keyCode]; if (n) this._current[n] = true; },
        _onKeyUp(e) { const n = this.keyMapper[e.keyCode]; if (n) this._current[n] = false; },
        clear() {}, update() { this._updateDirection(); }, isPressed(n) { return !!this._current[n]; }
    };
    let saved = 0;
    const ConfigManager = { makeData: () => ({}), applyData() {}, save() { saved++; } };
    function Game_System() {}
    Game_System.prototype.onAfterLoad = function() {};
    function Scene_Boot() {}
    Scene_Boot.prototype.start = function() {};
    const ctx = {
        PluginManager: { parameters: () => parameters }, Input, ConfigManager, Game_System, Scene_Boot,
        DataManager: { createGameObjects() { ctx.$gameSystem = new Game_System(); }, extractSaveContents() {} },
        $gameSwitches: { _data: switches, value: (id) => !!switches[id], setValue: (id, v) => { switches[id] = v; } },
        $gameVariables: { _data: variables, value: (id) => variables[id] || 0, setValue: (id, v) => { variables[id] = v; } }
    };
    vm.runInNewContext(plugin('RR_ThrallKeys'), ctx);
    ctx.DataManager.createGameObjects();
    return { ctx, Input, switches, variables, saved: () => saved };
}

test('keys: the game\'s configuration replaces MZ\'s, and nothing else confirms', () => {
    const { Input } = keysContext();
    const named = (name) => Object.keys(Input.keyMapper).filter(k => Input.keyMapper[k] === name).map(Number).sort((a, b) => a - b);
    assert.deepEqual(named('ok'), [32, 90], 'Z and Space; not Enter');
    assert.deepEqual(named('escape'), [27, 88], 'X and Escape cancel (and call the menu)');
    assert.deepEqual([named('shift'), named('pageup'), named('pagedown'), named('rgssX'), named('rgssY'), named('rgssZ')], [[67], [65], [83], [81], [87], [68]]);
    assert.deepEqual([Input.keyMapper[9], Input.keyMapper[17], Input.keyMapper[120]], ['tab', 'control', 'debug'], 'keys the game does not configure stay');
    assert.deepEqual({ ...Input.gamepadMapper }, { 0: 'ok', 1: 'escape', 2: 'shift', 3: 'rgssX', 4: 'pageup', 5: 'pagedown', 8: 'rgssY', 9: 'rgssZ', 12: 'up', 13: 'down', 14: 'left', 15: 'right' });
    assert.deepEqual([Input.keyRepeatWait, Input.keyRepeatInterval], [16, 4]);
});

test('keys: raw key states repeat as the Key Module did; directions prefer down, left, right, up', () => {
    const { ctx, Input, switches } = keysContext();
    switches[59] = true;
    Input._onKeyDown({ keyCode: 90, key: 'z' });
    const repeats = [];
    for (let f = 0; f < 30; f++) {
        Input.update();
        if (f === 0) {
            assert.ok(Input.rrKeyTriggered(90) && Input.rrKeyTriggered([1, 90]) && Input.rrKeyPressed(256));
            assert.ok(Input.rrGamepadTriggered(2), 'confirm');
            assert.equal(Input.rrKeyCharacter(), 'z');
            assert.equal(switches[59], false, 'the keyboard is in use');
        }
        if (Input.rrKeyRepeated(90)) repeats.push(f);
    }
    assert.deepEqual(repeats, [0, 16, 20, 24, 28]);
    Input._onKeyUp({ keyCode: 90 });
    Input.update();
    assert.ok(Input.rrKeyReleased(90) && !Input.rrKeyPressed(90));
    // A pad button counts while no key is held, and says the gamepad is in use.
    Input._gamepadStates = [[true]];
    Input.update();
    assert.ok(Input.rrGamepadTriggered(2) && switches[59] === true);
    Input._onKeyDown({ keyCode: 67 });
    Input.update();
    assert.ok(!Input.rrGamepadPressed(2), 'not while a key is held');
    Input._current = { down: true, left: true, up: true };
    Input.update();
    assert.deepEqual([Input._dir4, Input._dir8], [2, 1]);
    void ctx;
});

test('Read Controls: the icon of a control\'s first key, or its pad button', () => {
    const { ctx, switches } = keysContext();
    const sys = ctx.$gameSystem;
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => sys.rrReadInput(i)), [819, 840, 842, 817, 835, 833, 839, 820]);
    switches[59] = true;
    assert.deepEqual([sys.rrReadInput(2), sys.rrReadInput(0), sys.rrReadInput(7)], [176, 178, 183]);
    switches[60] = true;
    assert.equal(sys.rrReadInput(2), 184, 'PlayStation glyphs');
    sys.rrSetControls([[49], [27], [32], [65], [83], [81], [87], [68], [38], [37], [40], [39]]);
    switches[59] = false;
    assert.equal(sys.rrReadInput(0), 843, 'the 1 key');
});

test('the config: loaded into every game, saved from the game\'s options', () => {
    const { ctx, Input, variables, switches, saved } = keysContext({ configVariables: '{"9":100,"87":1}', configSwitches: '{"11":true}' });
    assert.deepEqual([variables[9], variables[87], switches[11]], [100, 1, true], 'a new game starts with the config');
    variables[87] = 0;
    ctx.$gameSystem.rrSetControls([[67], [88, 27], [13], [65], [83], [81], [87], [68], [38], [37], [40], [39]]);
    assert.equal(Input.keyMapper[13], 'ok', 'Enter confirms once the player sets it');
    assert.equal(Input.keyMapper[90], undefined);
    ctx.ConfigManager.rrThrallSaveConfig();
    assert.equal(saved(), 1);
    const data = ctx.ConfigManager.makeData();
    assert.deepEqual([data.rrThrallConfig.variables[87], data.rrThrallConfig.controls[2]], [0, [13]]);
    // The next session reads it back.
    const next = keysContext({ configVariables: '{"9":100,"87":1}' });
    next.ctx.ConfigManager.applyData(JSON.parse(JSON.stringify(data)));
    next.ctx.DataManager.createGameObjects();
    assert.deepEqual([next.variables[87], next.Input.keyMapper[13]], [0, 'ok']);
});

test('the title: commands placed and slid as Discovery Title Screen did, the font by the accessibility variable', () => {
    function Sprite(bitmap) { this.bitmap = bitmap || null; this.x = 0; this.y = 0; this.children = []; }
    Object.defineProperty(Sprite.prototype, 'width', { get() { return this.bitmap ? this.bitmap.width : 0; } });
    Sprite.prototype.addChild = function(...c) { this.children.push(...c); };
    function TilingSprite(bitmap) { Sprite.call(this, bitmap); this.origin = { x: 0, y: 0 }; }
    TilingSprite.prototype = Object.create(Sprite.prototype);
    TilingSprite.prototype.move = function() {};
    function Scene_Title() { this.children = []; }
    Scene_Title.prototype = { addChild(c) { this.children.push(c); }, start() {}, update() {}, isBusy: () => false, calcWindowHeight: (n) => n * 24 + 32, addWindow() {} };
    function Window_Command() {}
    function Game_System() {}
    Game_System.prototype.mainFontFace = () => 'rmmz-mainfont';
    Game_System.prototype.mainFontSize = () => 12.2;
    Game_System.prototype.rrVxDefaultFontSize = () => 20;
    const variables = [];
    const ctx = {
        PluginManager: { parameters: () => ({}) }, Sprite, TilingSprite, Scene_Title, Window_Command, Game_System, Scene_Boot: function() {},
        Graphics: { width: 608, height: 480 }, DataManager: { _globalInfo: [null, { t: 1 }], PLAYTEST_CHECKPOINT_ID: 99 },
        ImageManager: { loadPicture: (name) => ({ name, width: name === 'title_image' ? 299 : 192 }) },
        $gameVariables: { value: (id) => variables[id] || 0 }, $dataSystem: { advanced: { fallbackFonts: 'Verdana' } }
    };
    ctx.globalThis = ctx;
    ctx.Scene_Boot.prototype = { loadGameFonts() {} };
    vm.runInNewContext(plugin('RR_ThrallTitle'), ctx);
    const scene = new Scene_Title();
    scene.createBackground();
    assert.deepEqual([scene._rrContinueEnabled, scene._rrNewGameEnabled], [true, true]);
    let index = 1;
    scene._commandWindow = { index: () => index };
    scene.rrLayOut();
    assert.deepEqual(plain(scene._rrCommands.map(s => [s.x, s.y])), [[74, 288], [74, 318], [74, 348], [74, 378], [74, 408]]);
    assert.deepEqual([scene._rrLogo.x, scene._rrLogo.y], [155, 3]);
    assert.deepEqual(plain(scene._rrCommands.map(s => s.bitmap.name)), ['new_game_off', 'continue', 'erase_off', 'settings_off', 'exit_off']);
    for (let f = 0; f < 20; f++) scene.rrSlide(index);
    assert.deepEqual(plain(scene._rrCommands.map(s => s.x)), [27, 67, 27, 27, 27], 'the selected command out to 67, the others back to 27');
    index = 0;
    scene.rrSlide(index);
    assert.deepEqual(plain(scene._rrCommands.map(s => s.x)), [30, 64, 27, 27, 27], 'three pixels a frame');
    // Every slot taken: New Game is disabled.
    ctx.DataManager._globalInfo = [null, 1, 1, 1, 1];
    const full = new Scene_Title();
    full.createBackground();
    full._commandWindow = { index: () => 1 };
    full.rrLayOut();
    assert.equal(full._rrCommands[0].bitmap.name, 'new_game_disabled');

    const sys = new Game_System();
    assert.deepEqual(plain([sys.mainFontFace(), sys.mainFontSize(), sys.rrVxDefaultFontSize()]), ['rmmz-mainfont', 12.2, 20]);
    variables[87] = 1;
    assert.deepEqual(plain([sys.mainFontFace(), sys.mainFontSize(), sys.rrVxDefaultFontSize()]), ['rr-thrall-font-1, Verdana', 15, 18]);
});

test('a VX battle runs on a screen of its own, and the map\'s comes back when it ends', () => {
    const { ctx } = vxContext();
    const mapScreen = { name: 'map', tone: () => [-60, -48, -36, 96] };
    ctx.Game_Screen = function() { this.name = 'battle'; };
    ctx.$gameTemp = {};
    ctx.$gameScreen = mapScreen;
    let spritesetSaw = null;
    ctx.Scene_Battle.prototype.createSpriteset = function() { spritesetSaw = ctx.$gameScreen.name; };
    // RR_VxCompat wrapped the stub it saw when it loaded; load it again over this one.
    vm.runInNewContext(plugin('RR_VxCompat'), ctx);
    const scene = new ctx.Scene_Battle();
    scene.createSpriteset();
    assert.equal(spritesetSaw, 'battle', 'the battle\'s sprites are made on the fresh screen');
    assert.equal(ctx.$gameTemp._rrMapScreen, mapScreen, 'the map\'s screen stays readable (the floor takes its tint)');
    ctx.SceneManager._scene = scene;
    ctx.SceneManager.onSceneTerminate();
    assert.equal(ctx.$gameScreen, mapScreen);
    assert.equal(ctx.$gameTemp._rrMapScreen, null);
});
