const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const runtime = path.resolve(__dirname, '..', '..', 'runtime');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

/** The block of a runtime file that starts at `marker` and ends with its IIFE. */
function runtimeBlock(file, marker) {
    const src = fs.readFileSync(path.join(runtime, file), 'utf8');
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${file} has ${marker}`);
    const end = src.indexOf('\n})();', start);
    return src.slice(start, end + 6);
}

test('a font the game names but does not ship is the Windows font every player had', () => {
    assert.deepEqual(C.chooseFont(['Arial'], []), { family: 'Arial', fallbacks: ['Liberation Sans', 'Arimo', 'Helvetica'], scale: 0.8951 });
    // The first name RGSS would find wins: a shipped file before a later system font, a system font before a later file.
    assert.deepEqual(C.chooseFont(['Cardo', 'Arial'], ['Cardo.ttf']), { file: 'Cardo.ttf' });
    assert.equal(C.chooseFont(['Arial', 'Cardo'], ['Cardo.ttf']).family, 'Arial');
    assert.equal(C.chooseFont(['Nonesuch'], []), null);
    assert.deepEqual(C.chooseFont(['VL Gothic'], ['VL-Gothic-Regular.ttf', 'VL-PGothic-Regular.ttf']), { file: 'VL-Gothic-Regular.ttf' });
});

test('script families in DOTP: pictures, word wrap, message window, core colours, version stamp', () => {
    const scripts = [
        'module Tsuki\n  module Picture_Wrapper\n  end\nend\nclass Game_Interpreter\n  def make_pic(index, name, opacity=255, x=0, y=0, origin=1, fixed=false)\n  end\nend',
        'module KZIsAwesome\n  module WordWrap\n    DEFAULT_WORDWRAP = true\n    DEFAULT_RIGHT_MARGIN = 4\n  end\nend',
        '$imported["YEA-MessageSystem"] = true',
        'if $imported["YEA-CoreEngine"]\nend',   // a script that only asks for it comes first
        '$imported["YEA-CoreEngine"] = true\nmodule YEA\n  module CORE\n    COLOURS ={\n      :normal     =>  0,\n      :system     =>  8,   # Default: 16\n    }\n    TRANSPARENCY = 120\n    GROUP_DIGITS = true\n  end\nend',
        'FLAVORTEXT   = "(c) ACME "\nVERSION   = "V1.8"\nVFONT_SIZE = 12\nFile.exist?("System/Version.vmdt")\nclass Window_Version < Window_Base\nend'
    ];
    const fam = C.scriptFamilies(scripts);
    for (const key of ['himePictureWrapper', 'kzWordWrap', 'yeaMessageWindow', 'yeaCore', 'vlueVersionNumber']) assert.ok(fam.has(key), key);
    const ctx = { constants: {}, families: fam };
    assert.equal(C.ruby('make_pic(200, "black", 0, 320, 240, "center")', 'statement', ctx), 'this.rrMakePic?.(200, "black", 0, 320, 240, "center");');
    assert.equal(C.ruby('fade_pic(200, 255, 10, 0)', 'statement', ctx), 'this.rrFadePic?.(200, 255, 10, 0);');

    const core = params('RR_YanflyCore').extract({ scripts, constants: C.scriptConstants(scripts) });
    assert.deepEqual([JSON.parse(core.colours), core.transparency, core.groupDigits], [{ normal: 0, system: 8 }, '120', 'true']);
    const wrap = params('RR_WordWrap').extract({ constants: C.scriptConstants(scripts) });
    assert.deepEqual([wrap.wordwrap, wrap.rightMargin], ['true', '4']);
    // The build number is the shipped file's, plus the start the script counts before drawing it.
    const marshalInt = Buffer.from([4, 8, 0x69, 2, 0x6a, 0xab]);   // 43882
    const version = params('RR_VersionNumber').extract({ scripts, constants: {}, read: (rel) => (rel === 'System/Version.vmdt' ? marshalInt : null) });
    assert.deepEqual([version.flavor, version.version, version.build], ['(c) ACME ', 'V1.8', '43883']);
    const message = params('RR_YanflyMessage').extract({ constants: { 'YEA::MESSAGE::VARIABLE_ROWS': 18, 'YEA::MESSAGE::MESSAGE_WINDOW_FONT_NAME': ['Arial'], 'YEA::MESSAGE::MESSAGE_WINDOW_FONT_SIZE': 18, 'YEA::MESSAGE::MESSAGE_WINDOW_FONT_BOLD': true } });
    assert.deepEqual([message.rowsVariable, message.fontSize, message.bold], ['18', '16.1', 'true']);
    assert.match(message.fontFace, /^Arial, "Liberation Sans"/);
});

test('picture wrapper calls change one target each, and a 0 passed for "wait" waits, as Ruby reads it', () => {
    function Game_Picture() { Object.assign(this, { _name: '', _x: 0, _y: 0, _scaleX: 100, _scaleY: 100, _opacity: 255, _targetX: 0, _targetY: 0, _targetScaleX: 100, _targetScaleY: 100, _targetOpacity: 255, _duration: 0, _angle: 0 }); }
    Game_Picture.prototype.tint = function(tone, duration) { this._tone = tone; this._toneDuration = duration; };
    function Game_Interpreter() { this.waited = 0; }
    Game_Interpreter.prototype.wait = function(n) { this.waited += n; };
    function Sprite_Picture() {}
    const $gameScreen = { _pictures: [], realPictureId: (id) => id };
    const ctx = { Game_Picture, Game_Interpreter, Sprite_Picture, $gameScreen, $gameMap: {}, window: {} };
    vm.runInNewContext(plugin('RR_HimePictures'), ctx);
    const it = new Game_Interpreter();
    it.rrMakePic(200, 'Black', 0, 320, 240, 'center');
    const p = $gameScreen._pictures[200];
    assert.deepEqual([p._name, p._opacity, p._x, p._y, p._origin], ['Black', 0, 320, 240, 1]);
    it.rrZoomPic(200, 150, 150, 20);
    it.rrFadePic(200, 255, 10, 0);
    assert.equal(it.waited, 10, 'fade_pic(…, 10, 0) waits its 10 frames');
    assert.deepEqual([p._targetOpacity, p._targetScaleX, p._duration], [255, 150, 10], 'the fade kept the zoom target');
    it.rrMovePic(200, 10, 10, 5, false);
    assert.equal(it.waited, 10, 'false does not wait');
    it.rrMakePic(3, 'x', 255, 0, 0, 0);
    assert.equal($gameScreen._pictures[3]._origin, 0);
});

test('word wrap breaks at the word that would cross the right edge and collapses spaces', () => {
    function Window_Base() {}
    Object.assign(Window_Base.prototype, {
        textWidth: (t) => t.length * 10,
        contentsWidth: () => 100,
        obtainEscapeParam: () => 0,
        flushTextState(ts) { if (ts.buffer) { ts.drawn.push([ts.y, ts.buffer]); ts.x += this.textWidth(ts.buffer); ts.buffer = ''; } },
        processNewLine(ts) { ts.x = ts.startX; ts.y += 1; },
        processCharacter(ts) { const c = ts.text[ts.index++]; if (c === '\n') { this.flushTextState(ts); this.processNewLine(ts); } else ts.buffer += c; },
        processEscapeCharacter() {}
    });
    const ctx = { Window_Base, PluginManager: { parameters: () => ({}) }, ImageManager: { iconWidth: 32 } };
    vm.runInNewContext(plugin('RR_WordWrap'), ctx);
    const run = (text) => {
        const ts = { text, index: 0, x: 0, y: 0, startX: 0, buffer: '', drawn: [] };
        const w = new Window_Base();
        while (ts.index < ts.text.length) w.processCharacter(ts);
        w.flushTextState(ts);
        const byLine = {};
        for (const [y, s] of ts.drawn) byLine[y] = (byLine[y] || '') + s;
        return Object.values(byLine);
    };
    assert.deepEqual(run('aaa bbb ccc ddd'), ['aaa bbb', 'ccc ddd']);
    // Collapsing drops a space after a space, then counts the dropped one as the last character, as
    // KilloZapit's does: two spaces become one, three become two.
    assert.deepEqual(run('aaa  bbb'), ['aaa bbb']);
    assert.deepEqual(run('aaa   bbb'), ['aaa  bbb']);
    assert.deepEqual(run('aaaa bbbb cc'), ['aaaa bbbb', 'cc']);
});

test('Yanfly message rows: past four, the next Show Text continues the same window', () => {
    function Game_Interpreter(list) { this._list = list; this._index = 0; }
    Object.assign(Game_Interpreter.prototype, {
        nextEventCode() { const c = this._list[this._index + 1]; return c ? c.code : 0; },
        currentCommand() { return this._list[this._index]; },
        setWaitMode(m) { this.mode = m; }
    });
    const message = () => ({ _texts: [], isBusy: () => false, setFaceImage() {}, setBackground() {}, setPositionType() {}, setSpeakerName() {}, add(t) { this._texts.push(t); } });
    const vars = { 18: 13 };
    const ctx = { Game_Interpreter, Window_Message: function() {}, PluginManager: { parameters: () => ({ rowsVariable: '18' }) }, $gameVariables: { value: (id) => vars[id] || 0 }, Graphics: { boxWidth: 640 }, Window: { defaultMargin: () => 0 } };
    ctx.Window_Message.prototype = { resetFontSettings() {}, newPage() {} };
    vm.runInNewContext(plugin('RR_YanflyMessage'), ctx);
    const list = [{ code: 101, parameters: [] }, { code: 401, parameters: ['one'] }, { code: 101, parameters: [] }, { code: 401, parameters: ['two'] }, { code: 0, parameters: [] }];
    ctx.$gameMessage = message();
    const it = new Game_Interpreter(list);
    it.command101([]);
    assert.deepEqual(ctx.$gameMessage._texts, ['one', 'two']);
    vars[18] = 4;
    ctx.$gameMessage = message();
    const four = new Game_Interpreter(list);
    four.command101([]);
    assert.deepEqual(ctx.$gameMessage._texts, ['one'], 'four rows or fewer: each Show Text is its own window');
});

test('the old engines\' title Shut Down and plain list items are switched on by imported data only', () => {
    function Window_TitleCommand() { this._list = []; }
    Window_TitleCommand.prototype.makeCommandList = function() { this._list.push({ symbol: 'newGame' }, { symbol: 'continue' }, { symbol: 'options' }); };
    Window_TitleCommand.prototype.addCommand = function(name, symbol) { this._list.push({ name, symbol }); };
    const title = runtimeBlock('reactor_windows.js', "// The title's Shut Down command of RPG Maker XP");
    const make = (dataSystem, nwjs = true) => {
        const ctx = { Window_TitleCommand, $dataSystem: dataSystem, Utils: { isNwjs: () => nwjs } };
        const W = function() { this._list = []; };
        W.prototype = Object.create(Window_TitleCommand.prototype);
        ctx.Window_TitleCommand = W;
        vm.runInNewContext(title, ctx);
        const w = new W(); w.makeCommandList();
        return w._list.map(c => c.symbol);
    };
    assert.deepEqual(make({}), ['newGame', 'continue', 'options'], 'an MZ project keeps its title');
    assert.deepEqual(make({ rrTitleShutdown: 'Quit' }), ['newGame', 'continue', 'shutdown', 'options']);
    assert.deepEqual(make({ rrTitleShutdown: 'Quit' }, false), ['newGame', 'continue', 'options'], 'a browser cannot shut the game');

    const plain = runtimeBlock('reactor_windows.js', '// The older engines draw no bar behind each item');
    function Window_Selectable() {}
    let drawn = 0;
    Window_Selectable.prototype.drawItemBackground = () => { drawn++; };
    for (const [system, expected] of [[{}, 1], [{ rrNoItemBackgrounds: true }, 0]]) {
        drawn = 0;
        const S = function() {};
        S.prototype.drawItemBackground = Window_Selectable.prototype.drawItemBackground;
        vm.runInNewContext(plain, { Window_Selectable: S, $dataSystem: system });
        new S().drawItemBackground(0);
        assert.equal(drawn, expected);
    }
});

test('the picture limit rises to the highest picture an imported event uses', () => {
    const P = require(path.join(legacy, 'ProjectFiles.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-piclimit-'));
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        fs.writeFileSync(path.join(dir, 'data', 'System.json'), JSON.stringify({ advanced: { picturesUpperLimit: 100 } }));
        fs.writeFileSync(path.join(dir, 'data', 'Map001.json'), JSON.stringify({ events: [null, { pages: [{ list: [
            { code: 231, parameters: [120, 'a', 0, 0, 0, 0, 100, 100, 255, 0] },
            { code: 355, parameters: ['this.rrMakePic?.(205, "b", 0, 0, 0, 1);'] }] }] }] }));
        assert.equal(P.raisePictureLimit(dir), 205);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'data', 'System.json'), 'utf8')).advanced.picturesUpperLimit, 205);
        assert.equal(P.raisePictureLimit(dir), 0, 'never lowered, never rewritten');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Victor Engine lights: the shade, map lights and lanterns come from the map note', () => {
    const stub = () => function() {};
    const ctx = {};
    for (const name of ['Game_Screen', 'Game_Map', 'Game_CharacterBase', 'Game_Event', 'Game_Player', 'Game_Interpreter', 'Sprite', 'Spriteset_Base', 'Spriteset_Map']) ctx[name] = stub();
    Object.assign(ctx.Game_Map.prototype, { setup() {} });
    Object.assign(ctx.Game_CharacterBase.prototype, { update() {} });
    Object.assign(ctx.Game_Event.prototype, { clearStartingFlag() {} });
    Object.assign(ctx.Game_Player.prototype, { performTransfer() {} });
    Object.assign(ctx.Game_Interpreter.prototype, { command108() { return true; } });
    Object.assign(ctx.Spriteset_Base.prototype, { createPictures() {} });
    Object.assign(ctx.Spriteset_Map.prototype, { update() {} });
    ctx.PluginManager = { parameters: () => ({ actorIndexFromZero: 'true' }) };
    vm.runInNewContext(plugin('RR_VictorLights'), ctx);
    ctx.$gameScreen = new ctx.Game_Screen();
    const player = new ctx.Game_CharacterBase();
    player.direction = () => 2;
    ctx.$gamePlayer = Object.assign(player, { followers: () => ({ visibleFollowers: () => [] }) });
    const map = new ctx.Game_Map();
    map._vehicles = [];
    map.rrVeSetupAll('<create shade>\nopacity: 200\nred: 30\n</create shade>\n<map light>\nid: 5\nname: "torch"\nmap x: 3\nmap y: 4\nzoom: 150\n</map light>\n<actor lantern 1: 255>');
    const state = ctx.$gameScreen.rrVeState();
    assert.deepEqual([state.shade.visible, state.shade.opacity, state.shade.blend, [...state.shade.color]], [true, 200, 2, [225, 255, 255]], 'subtract: 255 minus each tone');
    assert.deepEqual([state.lights[5].name, state.lights[5].zoom, { ...state.lights[5].info }], ['torch', 150, { x: 3, y: 4 }]);
    assert.deepEqual([state.lights.AL0.name, state.lights.AL0.y], ['lantern_down', 64], 'the player\'s lantern faces the way they do');
    const params = require(path.join(legacy, 'plugins', 'RR_VictorLights.params.js')).extract({ scripts: ['class Game_LightBitmap\n  def set_target\n    n = @light.info[:actor] == 0 ? 0 : @light.info[:actor] - 0 # <<<< changed line\n  end\nend'] });
    assert.equal(params.actorIndexFromZero, 'true');
});

test('CSCA difficulty: its scene and $csca translate, and the Hide Encounter Rate add-on is read', () => {
    const base = '$imported["CSCA-Difficulty"] = true\nmodule CSCA\n  module DIFFICULTY\n    DIFFICULTIES = []\n    HEADER = "Pick"\n    ENCRATE = "Encounter Rate: "\n    DIFFICULTIES[0] = {\n    :name => "Easy",\n    :enemyexp => 100,\n    :enemygold => 100,\n    :encrate => 100,\n    :enemystats => 80,\n    :descr => ["One", "Two"]\n    }\n  end\nend\nclass CSCA_Window_DifficultyInfo < Window_Base\n  def draw_info(difficulty)\n    draw_text(0,h,w,h,CSCA::DIFFICULTY::ENCRATE)\n  end\nend';
    const hide = 'class CSCA_Window_DifficultyInfo < Window_Base\n  def draw_info(difficulty)\n    draw_text(0,h,w,h,CSCA::DIFFICULTY::ENEMYSTATS)\n  end\nend\n';
    const constants = C.scriptConstants([base]);
    const plain = params('RR_CscaDifficulty').extract({ scripts: [base], constants });
    assert.deepEqual([plain.header, plain.showEncounterRate, JSON.parse(plain.difficulties)], ['Pick', 'true', [{ name: 'Easy', enemyexp: 100, enemygold: 100, encrate: 100, enemystats: 80, descr: ['One', 'Two'] }]]);
    assert.equal(params('RR_CscaDifficulty').extract({ scripts: [base, hide], constants }).showEncounterRate, 'false');
    const ctx = { constants: {}, families: C.scriptFamilies([base]) };
    assert.equal(C.ruby('SceneManager.call(CSCA_Scene_DifficultySelect)', 'statement', ctx), '((s) => s && SceneManager.push(s))((typeof Scene_RRCscaDifficulty === "function" ? Scene_RRCscaDifficulty : null));');
    assert.equal(C.ruby('$csca.difficulty == 1', 'expression', ctx), '(($gameSystem.rrCsca?.()?.difficulty ?? 0) === 1)');
    assert.equal(C.ruby('SceneManager.call(Scene_Menu)', 'statement', ctx), 'SceneManager.push(Scene_Menu);', 'a stock scene is unchanged');
});

test('MapName Plus+ settings, and the older engines\' window, touch and fade conventions', () => {
    const mapName = 'module ACE\n  module MAPNAME\n    NAME_ALIGN = 2\n    FONT_SIZE = 24\n    FONT_TYPE = \'Arial\'\n  end\nend\nclass Window_MapName < Window_Base\n  def update_fadein\n  end\nend';
    assert.ok(C.scriptFamilies([mapName]).has('mapNamePlus'));
    assert.deepEqual(params('RR_MapNamePlus').extract({ constants: C.scriptConstants([mapName]) }), { align: 'right', fontFace: 'Arial, "Liberation Sans", Arimo, Helvetica, sans-serif', fontSize: '21.5' });

    const lists = runtimeBlock('reactor_windows.js', '// RPG Maker XP, VX and VX Ace window metrics');
    for (const [system, height, spacing] of [[{}, 32, 4], [{ rrRgssWindows: true }, 24, 0]]) {
        function Window_Selectable() {}
        Object.assign(Window_Selectable.prototype, { itemHeight: () => 32, rowSpacing: () => 4, lineHeight: () => 24 });
        vm.runInNewContext(lists, { Window_Selectable, $dataSystem: system });
        const w = new Window_Selectable();
        assert.deepEqual([w.itemHeight(), w.rowSpacing()], [height, spacing]);
    }
    const scenes = fs.readFileSync(path.join(runtime, 'reactor_scenes.js'), 'utf8');
    assert.match(scenes, /if \(\$dataSystem && \$dataSystem\.rrMapNameStays\) return;/);
    assert.match(scenes, /\$dataSystem\.rrTouchUiOff && !ConfigManager\._rrTouchUiSaved\) ConfigManager\.touchUI = false/);
    assert.match(scenes, /return ace\(\) \? 30 : _fadeSpeed\.call\(this\);/);
    assert.match(scenes, /\$dataSystem && \$dataSystem\.rrRgssWindows \? 0 : Window\.defaultMargin\(\) \* 2/, 'an Ace message window is exactly its lines tall');
    const compat = fs.readFileSync(path.join(runtime, 'libs', 'pixi_compat.js'), 'utf8');
    assert.match(compat, /blendModesMap\.subtract = \[gl\.ONE, gl\.ONE, gl\.ZERO, gl\.ONE, gl\.FUNC_REVERSE_SUBTRACT, gl\.FUNC_ADD\]/, 'v8 regains the subtract blend');
});

test('DOTP\'s document reader, eventing tuning, fog, hover labels and system options are read and translated', () => {
    const doc = 'module DocumentReader\n  MOVE_SPEED  = 8\n  ICON_Q      = 2972\n  ICON_X      = 2991\n  HUD_LINES = [\n    [\n      [ICON_Q,      "Prev"],\n      [ICON_X,      "Exit"]\n    ]\n  ]\nend\ndef doc_reader(filename)\nend\nclass Scene_DocumentReader < Scene_Base\nend';
    const vlue = 'EVENTING_USE_DIR8 = false\nclass Game_CharacterBase\nend';
    const fog = '($imported ||={})[:Theo_FogScreen] = true\nmodule THEO\n  module Fog\n    BattleFog = true\n    List = {\n      "fog4"   => ["fog4",   128,    20,     1,      0.5,    0.5],\n    }\n    def self.custom_fogs\n      fog = fog_data["fog4"]\n      fog.blend_type = 2\n    end\n  end\nend';
    const fam = C.scriptFamilies([doc, vlue, fog, '($imported ||= {})[:Theo_InteractNotif] = true']);
    for (const key of ['documentReader', 'vlueEventing', 'theoFog', 'theoInteract']) assert.ok(fam.has(key), key);
    const settings = JSON.parse(params('RR_DocumentReader').extract({ scripts: [doc], constants: C.scriptConstants([doc]) }).settings);
    assert.deepEqual(settings.hudLines, [[[2972, 'Prev'], [2991, 'Exit']]]);
    const ctx = { constants: {}, families: fam };
    assert.equal(C.ruby('doc_reader("controls")', 'statement', ctx), 'this.rrDocReader?.("controls");');
    assert.equal(C.ruby('add_fog("fog2", 5)', 'statement', ctx), 'this.rrTheoAddFog?.("fog2", 5);');
    const route = Object.assign({}, ctx, { self: 'character' });
    assert.equal(C.ruby('if $game_switches[45] == true;flash(Color.new(0,255,255255),30);end', 'statement', route), 'if (($gameSwitches.value(45) === true)) { this.rrVlueFlash?.([0, 255, 255255, 255], 30); }');
    assert.deepEqual(JSON.parse(params('RR_TheoFog').extract({ scripts: [fog], constants: C.scriptConstants([fog]) }).fogs).fog4, { name: 'fog4', opacity: 128, speedX: 20, speedY: 1, zoomX: 0.5, zoomY: 0.5, blend: 2 });

    const options = '$imported["YEA-SystemOptions"] = true\nmodule YEA\n  module SYSTEM\n    COMMANDS =[\n      :switch_3,\n      :variable_5,\n      :volume_bgm,\n      :mouse,\n    ]\n    CUSTOM_SWITCHES ={\n      :switch_3  => [ 45, "Help Options", "OFF", "ON",\n                     "Highlights."\n                    ],\n    }\n    CUSTOM_VARIABLES ={\n      :variable_5 => [ 8, "Window Opacity", 0, 0, 0, 255,\n                      "How visible."\n                     ],\n    }\n    COMMAND_VOCAB ={\n      :volume_bgm => ["Music Volume", 0, 0,\n                      "Change the volume.\\n" +\n                      "Hold SHIFT."\n                     ],\n      :mouse  => ["Toggle Mouse", "None", "None", "Mouse."],\n    }\n  end\nend';
    const read = params('RR_YanflySystemOptions').extract({ scripts: [options, '($imported ||= {})[:Theo_GlobalOption] = true'], constants: {} });
    assert.equal(read.global, 'true');
    assert.deepEqual(JSON.parse(read.commands).map(c => [c.kind, c.id || c.type, c.name]), [['switch', 45, 'Help Options'], ['variable', 8, 'Window Opacity'], ['volume', 'bgm', 'Music Volume'], ['action', 'mouse', 'Toggle Mouse']]);
    assert.equal(JSON.parse(read.commands)[2].help, 'Change the volume.\nHold SHIFT.', 'Ruby strings joined with + and \\n read as Ruby does');
    assert.deepEqual(params('RR_WindowOpacity').extract({ scripts: [options], constants: { 'MK_WIN_OPA::OPACITY_OPTION_VAR_ID': 8 } }), { variable: '8', opacity: '200' });
});

test('an imported system picture spelled otherwise replaces the skeleton\'s, and A, S and D are buttons', () => {
    const R = require(path.join(legacy, 'RgssImporter.js'));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-twin-'));
    try {
        fs.mkdirSync(path.join(dir, 'img', 'system'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'img', 'system', 'IconSet.png'), 'mz');
        assert.equal(R.systemTwin(path.join(dir, 'img', 'system', 'iconset.png')), path.join(dir, 'img', 'system', 'IconSet.png'));
        assert.equal(R.systemTwin(path.join(dir, 'img', 'system', 'Balloon.png')), path.join(dir, 'img', 'system', 'Balloon.png'));
        assert.equal(R.systemTwin(path.join(dir, 'img', 'pictures', 'iconset.png')), path.join(dir, 'img', 'pictures', 'iconset.png'), 'only system pictures');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    assert.deepEqual(C.commands([{ code: 111, indent: 0, parameters: [11, 'X'] }], {})[0].parameters, [11, 'rgssX', 0]);
    const scenes = fs.readFileSync(path.join(runtime, 'reactor_scenes.js'), 'utf8');
    assert.match(scenes, /Object\.assign\(Input\.keyMapper, \{ 65: "rgssX", 83: "rgssY", 68: "rgssZ" \}\)/);
    assert.match(scenes, /Object\.assign\(Input\.gamepadMapper, \{ 6: "rgssL2", 7: "rgssR2" \}\)/);
});

test('CSCA quests become Reactor quests: tables resolved as Ruby leaves them, steps hidden until reached', () => {
    const script = 'module CSCA\n  module QUESTS\n    DESCRIPTION, STEP, QUEST, REWARD = [], [], [], []\n    CURRENCY_NAME = "Zenar"\n    DESCRIPTION[0] = ["Line one",\n                      "line two."]\n    REWARD[4] =   [2000, 0, :gold]\n    REWARD[100] = [1,"ENA Reputation",:string]\n    STEP[0] = ["Find a way in.",\n               "Win."]\n    REWARD[4] = [35, 0,    :exp]\n    QUEST[0] = {\n    :symbol => :atlas01,\n    :name => "Operation Midnight",\n    :description => DESCRIPTION[0],\n    :location => "ATLAS",\n    :questgiver => "Nikriontra",\n    :difficulty => "Main Mission",\n    :steps => STEP[0],\n    :rewards => [REWARD[4], REWARD[100], REWARD[7]],\n    :auto_earn_reward => true\n    }\n  end\nend\nclass CSCA_Quest\nend';
    const constants = C.scriptConstants([script]);
    const P = params('RR_CscaQuests');
    const [record] = P.records([script], constants, {});
    assert.deepEqual([record.key, record.name, record.category, record.description, record.objectives, record.rewards],
        ['atlas01', 'Operation Midnight', 'Main Mission', 'Line one\nline two.', [{ text: 'Find a way in.', hidden: true }, { text: 'Win.', hidden: true }], ['35 EXP', 'ENA Reputation 1']]);
    assert.deepEqual(JSON.parse(P.extract({ scripts: [script], constants }).quests), [{ key: 'atlas01', steps: 2, autoEarn: true, rewards: [{ amount: 35, id: 0, type: 'exp' }] }], 'text rewards are never paid');
    const ctx = { constants, families: C.scriptFamilies([script]) };
    assert.equal(C.ruby('set_quest_progress(:atlas01, 1)', 'statement', ctx), 'this.rrCscaQuestProgress?.("atlas01", 1);');
    assert.equal(C.ruby('quest_progress(:atlas01) == 0', 'expression', ctx), '((this.rrCscaQuestState?.("atlas01", "progress") ?? 0) === 0)');
});

test('the Ruby translator: parallel assignment, block comments, a game\'s own modules and scene classes', () => {
    const T = require(path.join(legacy, 'RubyTranspiler.js'));
    const o = { self: 'interpreter', constants: {}, calls: {}, ivars: {} };
    const first = T.transpile('$game_variables[52],$game_variables[53] = [3, 4]', o);
    assert.match(first, /^const (_m\d+) = \[3, 4\]; \$gameVariables\.setValue\(52, \(Array\.isArray\(\1\) \? \1\[0\] : \1\)\); \$gameVariables\.setValue\(53, \(Array\.isArray\(\1\) \? \1\[1\] : null\)\);$/);
    assert.notEqual(/_m\d+/.exec(T.transpile('a, b = 1, 2', o))[0], /_m\d+/.exec(first)[0], 'each parallel assignment names its own temporary');
    assert.equal(T.transpile('=begin\nnot ruby at all (\n=end\n$game_variables[1] = 2', o), '$gameVariables.setValue(1, 2);');
    const mods = Object.assign({}, o, { modules: { WolfPad: { 'plugged_in?': ['pad()', 'bool'] } }, classes: { CSCA_Scene_X: 'Scene_RRX' } });
    assert.equal(T.transpileExpression('WolfPad.plugged_in? == false', mods), '(pad() === false)');
    assert.equal(T.transpile('WolfPad.rumble', mods), null, 'a module call no family ports stays untranslated');
    assert.equal(T.transpile('SceneManager.call(CSCA_Scene_X)', mods), '((s) => s && SceneManager.push(s))((typeof Scene_RRX === "function" ? Scene_RRX : null));');
});

test('Hime choices: following Show Choices merge and choice options map the picked row back to its branch', () => {
    function Game_Interpreter() {}
    Game_Interpreter.prototype.setupChoices = function(params) { ctx.$gameMessage.setChoices(params[0].slice(), 0, params[1] < params[0].length ? params[1] : -2); };
    function Game_Message() { this._choices = []; }
    Object.assign(Game_Message.prototype, { clear() {}, setChoices(c, d, x) { this._choices = c; this._choiceDefaultType = d; this._choiceCancelType = x; }, setChoiceCallback(f) { this.cb = f; }, choices() { return this._choices; } });
    function Window_ChoiceList() {}
    Object.assign(Window_ChoiceList.prototype, { makeCommandList() {}, drawItem() {}, resetTextColor() {} });
    const ctx = { Game_Interpreter, Game_Message, Window_ChoiceList, PluginManager: { parameters: () => ({}) } };
    vm.runInNewContext(plugin('RR_HimeChoices'), ctx);
    ctx.$gameMessage = new Game_Message();
    const it = new Game_Interpreter();
    it._indent = 0; it._index = 0; it._branch = {};
    it._list = [
        { code: 102, indent: 0, parameters: [['A', 'B'], -1] }, { code: 402, indent: 0, parameters: [0, 'A'] }, { code: 0, indent: 1, parameters: [] },
        { code: 402, indent: 0, parameters: [1, 'B'] }, { code: 0, indent: 1, parameters: [] }, { code: 404, indent: 0, parameters: [] },
        { code: 102, indent: 0, parameters: [['C'], -2] }, { code: 402, indent: 0, parameters: [0, 'C'] }, { code: 0, indent: 1, parameters: [] },
        { code: 403, indent: 0, parameters: [] }, { code: 0, indent: 1, parameters: [] }, { code: 404, indent: 0, parameters: [] }, { code: 0, indent: 0, parameters: [] }];
    it.rrChoiceOption('hidden', 2, true);
    it.rrChoiceOption('condition', 3, true);
    it.setupChoices(it._list[0].parameters);
    assert.deepEqual([...ctx.$gameMessage._choices], ['A', 'C'], 'B hidden; the second command\'s C joined');
    assert.deepEqual([...ctx.$gameMessage._rrChoiceEnabled], [true, false]);
    assert.equal(it._list[6].parameters[0], 0 + 2, 'the joined When branch counts on from the first command\'s choices');
    assert.equal(it._list.filter(c => c.code === 102).length, 1);
    ctx.$gameMessage.cb(1);
    assert.equal(it._branch[0], 2, 'the second visible row is choice C, branch 2');
    assert.equal(ctx.$gameMessage._choiceCancelType, -2, 'the joined command\'s cancel branch carries over');
});

test('toasts, mail and the choice display mode read their settings from the game', () => {
    const constants = { 'CSCA::QUESTS::SHOW_COMPLETE_TOAST': true, 'CSCA::QUESTS::QUEST_COMPLETE_SOUND': 'victory', 'CSCA::QUESTS::COLOR_COMPLETED': 24, 'CSCA::QUESTS::QUEST_START_SOUND': 'started', 'CSCA::QUESTS::COLOR_STARTED': 27 };
    const scripts = ['class CSCA_Quest\n  def complete_quest\n    $csca.reserve_toast([:quest_complete, self])\n  end\nend', 'alias :csca_qsys_extended_refresh :refresh'];
    const q = JSON.parse(params('RR_CscaToasts').extract({ scripts, constants }).quests);
    assert.deepEqual([q.started, q.complete, q.completeTwice], [{ show: true, me: 'started', color: 27 }, { show: true, se: 'victory', color: 24 }, true], 'both quest scripts reserve a completion');
    const mail = params('RR_MailSystem').extract({ scripts: ['alias mail_toast_add_mail_original add_mail\n    Audio.me_play("Audio/SE/radio", 100, 100)'], constants: { 'MAIL_SYSTEM::MENU_NAME': 'Comms' } });
    assert.deepEqual(mail, { menuName: 'Comms', toast: 'true', toastSound: 'radio' });
    const mode = params('RR_ChoiceDisplayMode').extract({ scripts: ['$imported[:TH_HMSChoiceDisplayMode] = true\n    @choice_display_mode = :embed', 'alias final_fix_update_placement update_placement\n    self.height = fitting_height(3)'], constants: { 'TH::Choice_Display_Mode::Indent': 36 } });
    assert.deepEqual(mode, { mode: 'embed', indent: '36', rows: '3' });
    assert.ok(C.scriptFamilies(['$imported["CSCA-ToastManager"] = true', 'module MAIL_SYSTEM\nend\ndef add_mail(sender, title, body, attachments = [])\nend']).has('mailSystem'));
});
