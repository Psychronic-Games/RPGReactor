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
