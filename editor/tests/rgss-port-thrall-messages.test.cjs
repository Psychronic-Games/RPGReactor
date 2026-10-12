'use strict';
// Thrall's message scripts: STR22 MWEXT++ (with the game's edits), Message Queue, Paragraph Formatter, Dialog System.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));

// Snippets of the game's own sections (the customisation section, the core's Thrall edits, STR11b, the queue).
const MWEXT_EDIT = `class Window_Message < Window_Selectable
  WINDOW_RECT  = Rect.new(0, 0, 608, 128)
  BTMESMODE    = 1        # 0 = 通常　1 = STR11b(XP風バトル)モード
  FADE_TYPE    = 1        # 0 = 縦に開閉(デフォルト) 1 = 透明度変化
  S_WINDOW     = true     # スリムウィンドウを有効にする
  S_WINDOW_W   = 10       # 縮めるウィンドウの横幅(pixel)
  S_WINDOW_H   = 12       # 縮めるウィンドウの縦幅(pixel)
  N_WINDOW_ED  = true     # 縁取り
  N_WINDOW_CO  = Color.new(255,255,255) # 通常カラー
  N_WINDOW_CE  = Color.new( 64, 32,128) # 縁取りカラー
  N_WINDOW_WH  = [10, 6]  # 幅,高さ修正[幅, 高さ]
  N_WINDOW_XY  = [0,-14]  # XY座標修正[X, Y]
  P_WINDOW     = 2        # ポーズサイン位置 0 = 中央下　1 = 右下
  FACE_SIZE    = [96, 16] # サイズ[幅, 高さ]
  MESBACK_VA   = 25       # ◆指定した変数の値でメッセージバックが
  MESBACK_LIST = {0 => "MessageBack", # デフォルト
                  1 => "",
                  2 => "",
                  }
  MESMOVE      = 14       # ◆
  WLH          = 24       # 行間
  EDGE_COLOR = {0 => Color.new( 64, 32,128),   # 青
                4 => Color.new(64,32,128,128), # うっすらブルー
                }
  F_WAIT = 0           # 文章終了時のウェイト　VXデフォルトの値は 10
  PSID = 15             # ◆
  SSID = 16            # ◆
  FSID = 17            # ◆
  MACRO = { 0 => "\\\\c[1]\\\\f",                   # カラー1番、縁取り切り替え
            2 => "を手に入れた！",              # 手に入れた。
            }
  A_N_WINDOW = {"Actor1_0" => "ラルフ",
                "Actor1_4" => "Actor[5]",
                }
  def initialize_vocab
  @vo={0 => Vocab::ShopBuy,     1 => Vocab::ShopSell,    2 => Vocab::ShopCancel,
      33 => Vocab::game_end,   34 => Vocab::gold,       35 => "はにゃーん！",
    }
  end
  STR22011 = 48          # Fadetype=1_Speed
  STR22900 = [640,480]   # Screen
end`;
const MWEXT_CORE = `class Window_Message < Window_Selectable
  def y=(a)
    super
    case @position
    when 0  # Top
      @name_d_window.y = a + N_WINDOW_XY[1] + 133
    end
  end
end
class Game_Map
  def map_name_strextpp
  end
end
class Game_Player < Game_Character
  def move_by_input
    case Input.dir8
    when 2;  $game_switches[51] ? move_right : move_down
    end
  end
end`;
const STR11B = `class Window_BattleMessage < Window_Message
  TEXT_B_COLOR = [Color.new(0,0,0,224), Color.new(0,0,0,196)]
  BTWIDTH   = 608       # Message Width
  MOVE      = true      # Smooth resize of lines
  SPEED     = 1         # Resize Speed
  W_OPACITY = 96        # Transparency　1~255
  N_WINDOW  = false     # Window is not converted transparent
end`;
const QUEUE = `module Marc
  module Queue
    SWITCH = 6 #Enable Switch
    ENABLED = true
    ALIGNMENT = 1
    BACKGROUND = Color.new(0, 0, 0, 128)
    FADE_STEP = 8
    WAIT = 120
    REMOVE_DUPLICATES = true
  end
end
class Marc_Queue < Sprite_Base
end`;
const MAIN = 'begin\n  Graphics.resize_screen(608,480)\n  Font.default_name = ["Eagle Lake"]\n  Font.default_size = 20\nend';
const GOLD = 'class Window_Message < Window_Selectable\n  def create_gold_window\n    @gold_window = Window_Gold.new(448, 0)\n  end\nend';

test('Thrall messages: the families find the game\'s scripts and translate its message calls', () => {
    const scripts = [MWEXT_EDIT, MWEXT_CORE, STR11B, QUEUE, 'class Dialog\n  STARTING_Z_VALUE = 1500 # Default value is 1500\nend',
        'class Bitmap\n  def draw_paragraph (x, y, max_width, max_height, string)\n  end\nend\nmodule Paragrapher\n  class Formatter\n  end\nend'];
    const fam = C.scriptFamilies(scripts);
    for (const key of ['thrallMessages', 'thrallMessageQueue', 'thrallDialog', 'thrallParagraph']) assert.ok(fam.has(key), key);
    // The stock MWEXT++ without Thrall's edit is not this port.
    assert.ok(!C.scriptFamilies([MWEXT_EDIT]).has('thrallMessages'));
    const ctx = { constants: {}, families: fam };
    assert.equal(C.ruby('$game_message.maxlineex = 100', 'statement', ctx), '$gameMessage.rrSetMaxLineEx?.(100);');
    assert.equal(C.ruby('$game_message.xywh.set(240, 176, 64, 64)', 'statement', ctx), '$gameMessage.rrSetXywh?.(240, 176, 64, 64);');
    assert.equal(C.ruby('$game_variables[3] = $game_message.maxlineex', 'statement', ctx), '$gameVariables.setValue(3, ($gameMessage.rrMaxLines?.() ?? 4));');
    // The dungeon floor note (CommonEvents): the banner's queue.
    assert.equal(C.ruby('f = "Floor " + $game_variables[16].to_s\n$game_map.queue.push(f)', 'statement', ctx),
        'var f = ("Floor " + String($gameVariables.value(16)));\n($gameMap.rrMessageQueue?.() ?? []).push(f);');
});

test('Thrall messages: settings come from the customisation section, the core, STR11b, Window_Message and Main', () => {
    const p = params('RR_ThrallMessages').extract({ scripts: [MWEXT_EDIT, MWEXT_CORE, STR11B, GOLD, MAIN], constants: {} });
    assert.equal(p.windowRect, '0,0,608,128');
    assert.equal(p.screen, '640,480');
    assert.deepEqual([p.battleMode, p.fadeType, p.fadeSpeed, p.slimWindow, p.slimSize], ['1', '1', '48', 'true', '10,12']);
    assert.deepEqual([p.nameColor, p.nameEdgeColor, p.nameSize, p.nameOffset], ['255,255,255', '64,32,128', '10,6', '0,-14']);
    assert.deepEqual([p.pausePlace, p.faceSize, p.backVariable, p.moveSwitch, p.lineHeight], ['2', '96,16', '25', '14', '24']);
    assert.deepEqual(JSON.parse(p.backImages), { 0: 'MessageBack', 1: '', 2: '' });
    assert.deepEqual(JSON.parse(p.edgeColors), { 0: [64, 32, 128, 255], 4: [64, 32, 128, 128] });
    assert.deepEqual([p.noSkipSwitch, p.noDashSwitch, p.noDoubleSwitch, p.endWait], ['15', '16', '17', '0']);
    assert.deepEqual(JSON.parse(p.macros), { 0: '\\c[1]\\f', 2: 'を手に入れた！' });
    assert.deepEqual(JSON.parse(p.autoNames), { Actor1_0: 'ラルフ', Actor1_4: 'Actor[5]' });
    assert.deepEqual(JSON.parse(p.vocabExtra), { 35: 'はにゃーん！' });
    assert.deepEqual([p.rotateSwitch, p.goldX, p.fontSize], ['51', '448', '20']);
    assert.deepEqual(JSON.parse(p.battleBand), { colors: [[0, 0, 0, 224], [0, 0, 0, 196]], width: 608, step: 96, speed: 1, move: true });
    const q = params('RR_ThrallMessageQueue').extract({ scripts: [QUEUE] });
    assert.deepEqual(q, { switchId: '6', enabled: 'true', alignment: '1', background: '0,0,0,128', fadeStep: '8', wait: '120', removeDuplicates: 'true' });
});

/** The engine classes the message port touches, small enough to run the port's own logic. */
function messageContext(settings = {}) {
    const fn = () => function() {};
    const classes = {};
    for (const name of ['Game_Message', 'Game_Interpreter', 'Scene_Battle', 'Game_Map', 'Game_Player', 'Window_Base', 'Window_Message', 'Window_ChoiceList', 'Window_NumberInput', 'Sprite', 'Bitmap', 'Rectangle']) classes[name] = fn();
    const GM = classes.Game_Message.prototype;
    GM.initialize = function() { this.clear(); };
    GM.clear = function() { this._texts = []; this._choices = []; this._faceName = ''; this._faceIndex = 0; this._background = 0; this._positionType = 2; this._numInputVariableId = 0; };
    GM.add = function(t) { this._texts.push(t); };
    GM.isBusy = function() { return this._texts.length > 0 || this._choices.length > 0; };
    GM.setFaceImage = function(n, i) { this._faceName = n; this._faceIndex = i; };
    GM.setBackground = function(b) { this._background = b; };
    GM.setPositionType = function(p) { this._positionType = p; };
    GM.setSpeakerName = function() {};
    GM.faceName = function() { return this._faceName; };
    GM.faceIndex = function() { return this._faceIndex; };
    // MZ's escape conversion, enough of it: \\ to ESC, \V, \N, \G as the currency unit.
    classes.Window_Message.prototype.convertEscapeCharacters = function(text) {
        text = text.replace(/\\/g, '\x1b').replace(/\x1b\x1b/g, '\\');
        text = text.replace(/\x1bV\[(\d+)\]/gi, (m, n) => $gameVariables.value(Number(n)));
        return text.replace(/\x1bG/gi, 'Gold');
    };
    const switches = {}, variables = { 97: 819 };
    const ctx = {
        PluginManager: { parameters: () => settings },
        Input: { dir8: 0 },
        $gameSwitches: { value: (id) => !!switches[id], setValue: (id, v) => { switches[id] = v; } },
        $gameVariables: { value: (id) => variables[id] || 0, setValue: (id, v) => { variables[id] = v; } },
        $gameSystem: { mainFontSize: () => 12.2, mainFontFace: () => 'Eagle Lake' },
        ImageManager: { loadSystem: () => ({}) },
        ...classes
    };
    vm.createContext(ctx);
    vm.runInContext(`Game_Interpreter.prototype.setupChoices = function(p) { $gameMessage._choices = p[0].slice(); };
        Game_Interpreter.prototype.setupNumInput = function(p) { $gameMessage._numInputVariableId = p[0]; };
        Game_Interpreter.prototype.setWaitMode = function(m) { this._waitMode = m; };`, ctx);
    vm.runInContext(plugin('RR_ThrallMessages'), ctx);
    vm.runInContext('var $gameMessage = new Game_Message(); Game_Message.prototype.initialize.call($gameMessage);', ctx);
    return { ctx, switches, variables };
}

const cmd = (code, parameters, indent = 0) => ({ code, indent, parameters });

test('Thrall messages: a Show Text takes its choices only when they fit in maxlineex lines, as MWEXT++ allowed', () => {
    const { ctx } = messageContext();
    const run = (list, max) => {
        vm.runInContext('Game_Message.prototype.initialize.call($gameMessage)', ctx);
        if (max) ctx.$gameMessage.rrSetMaxLineEx(max);
        const it = new ctx.Game_Interpreter();
        Object.assign(it, { _list: list, _index: 0, _eventId: 7 });
        assert.equal(it.command101(list[0].parameters), true);
        it._index++;   // executeCommand's step
        return it;
    };
    const withWho = [cmd(101, ['', 0, 0, 2, '']), cmd(401, ['With who?']), cmd(102, [['Everyone', 'Mel', 'Brutus', 'Damien'], -2, 0, 2, 0]), cmd(402, [0, 'Everyone'])];
    // Four lines: one of text and four choices do not fit; the choices come as their own message next.
    let it = run(withWho);
    assert.deepEqual([[...ctx.$gameMessage._texts], ctx.$gameMessage._choices.length, it._index], [['With who?'], 0, 2]);
    // The event first set $game_message.maxlineex = 100: one window of five lines.
    it = run(withWho, 100);
    assert.deepEqual([ctx.$gameMessage._choices.length, it._index, ctx.$gameMessage._rrEventId], [4, 3, 7]);
    // \NEXT carries the next Show Text into the same window (its face and settings are the first's).
    it = run([cmd(101, ['Faceset 1', 3, 0, 2, '']), cmd(401, ['One.\\NEXT']), cmd(101, ['Faceset 1', 1, 1, 1, '']), cmd(401, ['Two.']), cmd(101, ['', 0, 0, 2, '']), cmd(401, ['Three.'])], 8);
    assert.deepEqual([[...ctx.$gameMessage._texts], ctx.$gameMessage._faceIndex, it._index], [['One.\\NEXT', 'Two.'], 3, 4]);
    // A number input takes a line of its own (the window grows by it).
    it = run([cmd(101, ['', 0, 0, 2, '']), cmd(401, ['How much gold would you like to store?\\G']), cmd(103, [29, 7])]);
    assert.deepEqual([[...ctx.$gameMessage._texts], ctx.$gameMessage._numInputVariableId, it._index], [['How much gold would you like to store?\\G', ''], 29, 3]);
});

test('Thrall messages: the script\'s codes become codes the window reads; VX\'s \\G is the gold window', () => {
    const { ctx } = messageContext({ macros: '{"2":"を手に入れた！"}' });
    const w = new ctx.Window_Message();
    const conv = (s) => w.convertEscapeCharacters(s);
    assert.equal(conv('Take this with you.\\na[Lucille]'), 'Take this with you.\x1bRRNA[Lucille]');
    assert.equal(conv('\\al[1]This item cannot be used here.'), '\x1bRRAL[1]This item cannot be used here.');
    assert.equal(conv('Press and hold \\ic[\\v[97]] to skip dialogue.'), 'Press and hold \x1bRRIC[819] to skip dialogue.');
    assert.equal(conv('How much do you want to play for?\\G\\na[Soldier]'), 'How much do you want to play for?\x1b$\x1bRRNA[Soldier]');
    assert.equal(conv('\\Edge\\B\\Bold'), '\x1bRREDGE[]dge\x1bRRB[]\x1bRRB[]old');
    assert.equal(conv('Key\\M[2]\\NEXT'), 'Keyを手に入れた！');
    // Only the first \NA names the speaker; a second one is printed, as the script left it.
    assert.equal(conv('\\na[Mel]Hi\\na[Lionel]'), '\x1bRRNA[Mel]Hi\\na[Lionel]');
    // A name with a space is not a \NA the script read: it prints.
    assert.equal(conv('\\na[Old Man]'), '\\na[Old Man]');
    assert.equal(conv('\\sw[12,rv]\\va[3,-5]\\spix[4]'), '\x1bRRSW[12,2]\x1bRRVA[3,-5]\x1bRRSPIX[4]');
});

test('Thrall messages: the look-ahead measures each line for its alignment and reads the name', () => {
    const { ctx } = messageContext();
    const w = new ctx.Window_Message();
    w.contents = { measureTextWidth: (s) => s.length * 10 };
    w._rrFace = { scale: { x: 1 } };
    w._rrAligns = [0, 0, 0, 0, 0];
    const scan = w.rrPrescan(w.convertEscapeCharacters('\\al[1]Take a moment\\ic[3]\nAction Skills\\na[Brutus]'), 4);
    assert.deepEqual([...scan.widths.slice(0, 2)], [13 * 10 + 24, 13 * 10]);
    assert.deepEqual([[...scan.heights], scan.name, [...w._rrAligns.slice(0, 2)]], [[24, 24], 'Brutus', [1, 0]]);
    // Centred in the window's width less 32 (576 in a 608 window, 608 in battle's 640).
    w._rrWidths = scan.widths;
    w.width = 608;
    assert.equal(w.rrAlignOffset(0, 0), Math.floor((576 - 154) / 2));
    w.width = 640;
    assert.equal(w.rrAlignOffset(0, 0), Math.floor((608 - 154) / 2));
    // Lines past maxlineex are not measured: the window holds four.
    assert.equal(w.rrPrescan('a\nb\nc\nd\ne\nf', 4).heights.length, 4);
});

test('Thrall messages: switch 51 turns the arrow keys a quarter, and diagonals move diagonally', () => {
    const { ctx, switches } = messageContext();
    const moves = [];
    ctx.Game_Player.prototype.moveDiagonally = (h, v) => moves.push(['d', h, v]);
    vm.runInContext('Game_Player.prototype.moveStraight = function(d) { this.moves.push(["s", d]); }', ctx);
    const p = new ctx.Game_Player();
    p.moves = moves;
    ctx.Input.dir8 = 2;
    assert.equal(p.getInputDirection(), 2);
    switches[51] = true;
    assert.deepEqual([2, 4, 6, 8, 1, 3, 7, 9].map(d => { ctx.Input.dir8 = d; return p.getInputDirection(); }), [6, 2, 8, 4, 3, 9, 1, 7]);
    p.executeMove(9);
    assert.deepEqual(moves, [['d', 6, 8]]);
});

test('Message Queue: one note at a time fades in, stays WAIT frames, fades out; duplicates go', () => {
    const drawn = [];
    function Sprite() {}
    Sprite.prototype.initialize = function() { this._alpha = 1; };
    Object.defineProperty(Sprite.prototype, 'opacity', { get() { return this._alpha * 255; }, set(v) { this._alpha = Math.min(255, Math.max(0, v)) / 255; } });
    function Bitmap() { this.destroy = () => {}; this.fillRect = () => {}; this.drawText = (t) => drawn.push(t); }
    const map = {};
    function Game_Map() {}
    function Game_Switches() {}
    Game_Switches.prototype.initialize = function() { this._data = []; };
    function Spriteset_Map() {}
    Spriteset_Map.prototype.createUpperLayer = () => {};
    Spriteset_Map.prototype.update = () => {};
    const ctx = {
        PluginManager: { parameters: () => ({ wait: '20', fadeStep: '8' }) }, Sprite, Bitmap, Game_Map, Game_Switches, Spriteset_Map,
        Graphics: { width: 608 }, $gameSystem: { mainFontFace: () => 'x', mainFontSize: () => 12 }, window: {}
    };
    vm.runInNewContext(plugin('RR_ThrallMessageQueue'), ctx);
    const sw = new Game_Switches();
    sw.initialize();
    assert.equal(sw._data[6], true);
    ctx.$gameMap = Object.assign(new Game_Map(), map);
    const queue = ctx.$gameMap.rrMessageQueue();
    queue.push('Floor 3', 'Floor 3', 'Found a key.');
    const banner = new ctx.window.Sprite_RRMessageQueue();
    banner.update();
    assert.deepEqual([[...queue], drawn, banner.opacity], [['Floor 3', 'Found a key.'], ['Floor 3'], 8]);
    for (let i = 0; i < 19; i++) banner.update();
    assert.ok(Math.abs(banner.opacity - 160) < 1e-6);
    let frames = 0;
    while (queue.length === 2 && frames < 100) { banner.update(); frames++; }
    // 160 / 8 frames of fading out, then the next note.
    assert.deepEqual([frames, [...queue]], [20, ['Found a key.']]);
    banner.update();
    assert.deepEqual(drawn, ['Floor 3', 'Found a key.']);
});

test('Paragraph Formatter: lines break at words, the rest of a line spread between its letters', () => {
    const ctx = { Bitmap: function() {}, window: {} };
    ctx.Bitmap.prototype = {};
    vm.runInNewContext(plugin('RR_ThrallParagraph'), ctx);
    const bitmap = { measureTextWidth: (s) => s.length * 10 };
    const f = ctx.window.RRParagrapher.format('one two three four', bitmap, 100);
    assert.deepEqual([...f.lines.map(l => l.join(''))], ['one two', 'three four']);
    // "one two": 70 px of 100, 30 px over its 6 gaps; the last line is not stretched.
    assert.deepEqual([...f.blank], [5, 0]);
    const g = ctx.window.RRParagrapher.format('a\nbc', bitmap, 100);
    assert.deepEqual([[...g.lines.map(l => l.join(''))], [...g.blank]], [['a', 'bc'], [0, 0]]);
});
