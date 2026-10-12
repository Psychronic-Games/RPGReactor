'use strict';
// RGSS imports: settings a game makes in Main (screen size, default font), the
// whole-number window scale, and the Ruby events run that the translator now
// carries: for loops, VX's names for stats, sprintf, the VX timer, pictures by
// number, the map's tile table and the stock enemy calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const C = require('../src/legacy/RgssConvert.js');
const T = require('../src/legacy/RubyTranspiler.js');

const js = (ruby, constants = {}) => T.transpile(ruby, { self: 'interpreter', constants, calls: {}, ivars: {} });

test('Main sets the screen and the font, and the window opens at a whole-number scale', () => {
    const main = 'begin\n  Graphics.resize_screen(608,480)\n  Font.default_name = ["Eagle Lake"]\n  Font.default_size = 20\n  $scene = Scene_Title.new\nend';
    assert.deepEqual(C.screenSize([main], {}), [608, 480]);
    assert.deepEqual({ ...C.fontDefaults([main], {}) }, { name: ['Eagle Lake'], size: 20 });
    assert.deepEqual({ ...C.chooseFont(['Eagle Lake'], ['CinzelBold.ttf', 'EagleLake-Regular.ttf']) }, { file: 'EagleLake-Regular.ttf' });
    assert.deepEqual([C.windowScale(608, 480), C.windowScale(544, 416), C.windowScale(1280, 720)], [2, 2, 1]);
    for (const file of ['VxImporter.js', 'RgssImporter.js', 'XpImporter.js']) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', file), 'utf8');
        assert.match(src, /settingsScripts = \(mainAt >= 0 \? scripts\.slice\(0, mainAt \+ 1\)/, `${file} reads Main for settings`);
        assert.match(src, /sys\.advanced\.pixelatedRendering = true;/, `${file} enlarges with hard edges`);
        assert.doesNotMatch(src, /sw \* 1\.5/, `${file} no longer opens at 1.5x`);
    }
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'legacy', 'VxImporter.js'), 'utf8'), /scriptFamilies\(familyTexts\)/, 'VX families are found in stock sections too');
});

test('for loops, integer division and VX stat names', () => {
    assert.equal(js('$game_variables[24] = 0\nn = 0\nfor member in $game_party.members\n $game_variables[24] += member.level\n n += 1\nend\n$game_variables[24] /= n'),
        '$gameVariables.setValue(24, 0);\nvar n = 0;\nfor (var member of $gameParty.members()) { $gameVariables.setValue(24, $gameVariables.value(24) + (member.level)); n = n + (1); }\n'
        + '$gameVariables.setValue(24, ((x, y) => (Number.isInteger(x) && Number.isInteger(y) ? Math.floor(x / y) : x / y))($gameVariables.value(24), n));');
    assert.equal(js('for i in 1..3\n $game_variables[i] = i\nend'), 'for (var i of Array.from({ length: (3) - (1) + 1 }, (_, i) => (1) + i)) { $gameVariables.setValue(i, i); }');
    assert.equal(js('for m in $game_party.members\n x = m.maxhp\n x /= 10\n m.hp += x\nend'),
        'for (var m of $gameParty.members()) { var x = m.mhp; x = ((x, y) => (Number.isInteger(x) && Number.isInteger(y) ? Math.floor(x / y) : x / y))(x, 10); m.setHp(m.hp + (x)); }');
    assert.match(js('a = $game_party.members[0]\n$game_variables[1] = a.base_atk + a.spi'), /\(a\.paramBase\(2\) \+ a\.paramPlus\(2\)\) \+ \(?a\.mat/);
    // Ruby's sum of the loop's values is the same in JS.
    const run = new Function('$gameVariables', '$gameParty', js('$game_variables[1] = 0\nfor m in $game_party.members\n $game_variables[1] += m.level\nend\n$game_variables[1] /= 2'));
    const vars = { v: {}, value(i) { return this.v[i] || 0; }, setValue(i, x) { this.v[i] = x; } };
    run(vars, { members: () => [{ level: 3 }, { level: 4 }] });
    assert.equal(vars.v[1], 3, '7 / 2 is 3');
});

test('sprintf, Vocab constants and the message texts', () => {
    const code = js('for name in $game_troop.enemy_names\n  text = sprintf(Vocab::Emerge, name)\n  $game_message.texts.push(text)\nend', { 'Vocab::Emerge': '%s emerged!' });
    const texts = [];
    new Function('$gameTroop', '$gameMessage', code)({ enemyNames: () => ['Thrall', 'Bat'] }, { _texts: texts });
    assert.deepEqual(texts, ['Thrall emerged!', 'Bat emerged!']);
});

test('the VX timer, pictures by number, the tile table and the stock enemy calls', () => {
    assert.equal(js('$game_system.timer = 5 * Graphics.frame_rate'), '($gameTimer._frames = (5 * 60));');
    assert.equal(js('$game_system.timer_working = true'), '(true ? ($gameTimer._working = true) : $gameTimer.stop());');
    assert.equal(js('screen.pictures[2].show("a",0,1,2,100,100,255,0)'), '$gameScreen.showPicture(2, "a", 0, 1, 2, 100, 100, 255, 0);');
    assert.equal(js('$game_screen.pictures[3].erase'), '$gameScreen.erasePicture(3);');
    const erased = [];
    new Function('$gameScreen', js('x = 0\nfor p in screen.pictures\n x += 1\n next if x <= 5\n p.erase\nend'))({ erasePicture: (n) => erased.push(n) });
    assert.deepEqual(erased, Array.from({ length: 16 }, (_, i) => i + 5), 'VX lists [nil, picture 1 … 20]: the first five entries are skipped');
    assert.equal(js('v = $game_map.data[3,4,0]'), 'var v = $gameMap.tileId(3, 4, 0);');
    assert.equal(js('$game_troop.make_unique_names'), '$gameTroop.makeUniqueNames();');
    assert.equal(js('m = $game_troop.members[0]\nif m.hp <= 0\nm.immortal = false\nm.add_state(1)\nm.perform_collapse\nend'),
        'var m = $gameTroop.members()[0];\nif ((m.hp <= 0)) { (m._rrImmortal = false); m.addState(1); m.performCollapse(); }');
    assert.equal(js('e = $game_troop.members[0]\ne.transform(3) if e != nil'), 'var e = $gameTroop.members()[0];\nif ((e != null)) { e.transform(3); }');
});

test('a window frame keeps its corner ornaments, and VX\'s \\G opens the gold window', () => {
    const K = require('../src/legacy/LegacyConvert.js');
    const skin = K.blank(128, 128);
    const paint = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * 128 + x) * 4; skin.data[i] = v; skin.data[i + 3] = 255; } };
    paint(64, 0, 64, 64, 50);   // the frame cell: edges
    paint(64, 0, 16, 16, 200);  // its top-left corner ornament
    const out = C.windowSkin(skin, null);
    const at = (x, y) => out.data[(y * out.width + x) * 4];
    assert.deepEqual([at(96, 0), at(111, 15), at(111, 8)], [200, 200, 200], 'the whole 16 px corner, not overdrawn by the edges');
    assert.equal(at(120, 0), 50, 'the edge beside it');
    C.setContext({ messageCodes: { vxGold: true } });
    assert.equal(C.commands([{ code: 401, indent: 0, parameters: ['\\G gold, \\GOLD kept'] }], {})[0].parameters[0], '\\$ gold, \\GOLD kept');
    C.setContext({ messageCodes: {} });
    assert.equal(C.commands([{ code: 401, indent: 0, parameters: ['\\G'] }], {})[0].parameters[0], '\\G', 'VX Ace\'s \\G is the currency name');
});

test('arrays add and subtract as lists, strings split, and array constants read over several lines', () => {
    assert.equal(js('levels = []\nx = [3]\nlevels = levels + x'), 'var levels = [];\nvar x = [3];\nlevels = [...levels, ...x];');
    assert.deepEqual(new Function(`${js('a = [1, 2, 3, 2] - [2]')} return a;`)(), [1, 3]);
    assert.deepEqual(new Function(`${js('c = "2 14"\nn = c.split(/ /)')} return n;`)(), ['2', '14']);
    assert.deepEqual(new Function(`${js('n = "  2   1 ".split(" ")')} return n;`)(), ['2', '1'], 'split(" ") splits on runs of whitespace');
    assert.equal(new Function(`${js('x = 57\nx /= 10')} return x;`)(), 5, '/= after a name is division, not a regexp');
    const constants = C.scriptConstants(['module STRAK\n  module APPRAISE\n    EW_PREFIX = ["Absolute","Active",\n    "Ashen", # comment\n    "Barbed"]\n  end\nend']);
    assert.deepEqual(constants['STRAK::APPRAISE::EW_PREFIX'], ['Absolute', 'Active', 'Ashen', 'Barbed']);
    assert.equal(js('p = STRAK::APPRAISE::EW_PREFIX\n$game_variables[1] = p.size', constants), 'var p = ["Absolute","Active","Ashen","Barbed"];\n$gameVariables.setValue(1, p.length);');
});

test('RGSS frames: the skin\'s frame cell is kept, drawn with whole corners and repeated edges; windows open at 48 a frame', () => {
    const K = require('../src/legacy/LegacyConvert.js');
    const skin = K.blank(128, 128);
    for (let y = 0; y < 64; y++) for (let x = 64; x < 128; x++) { const i = (y * 128 + x) * 4; skin.data[i] = x; skin.data[i + 3] = 255; }
    const cell = C.frameCell(skin, 64);
    assert.deepEqual([cell.width, cell.height, cell.data[0], cell.data[(10 * 64 + 63) * 4]], [64, 64, 64, 127]);
    const display = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_core_display.js'), 'utf8');
    const start = display.indexOf('Window.prototype._refreshRgssFrame = function');
    const body = display.slice(start, display.indexOf('\n};\n', start) + 3);
    const blts = [];
    function Bitmap(w, h) { this.width = w; this.height = h; }
    Bitmap.prototype.blt = function(src, sx, sy, sw, sh, dx, dy) { blts.push([sx, sy, sw, sh, dx, dy]); };
    Bitmap.prototype.clear = () => {};
    Bitmap.prototype.destroy = () => {};
    function Sprite() { this.visible = true; }
    Sprite.prototype.setFrame = function() {}; Sprite.prototype.move = function() {};
    function Window() {}
    const ctx = { Window, Bitmap, Sprite, $dataSystem: { rrRgssFrames: ['Window'] }, ImageManager: { loadSystem: (n) => ({ name: n, isReady: () => true }) } };
    vm.runInNewContext(body, ctx);
    const parts = [new Sprite(), new Sprite()];
    const container = { children: [], addChildAt(c) { this.children.push(c); } };
    const frameSprite = { children: parts, parent: container };
    const win = Object.assign(new Window(), { _frameSprite: frameSprite, _windowskin: { _url: 'img/system/Window.png' }, _width: 100, _height: 64 });
    assert.equal(win._refreshRgssFrame(), true);
    assert.deepEqual(blts.filter(b => b[1] === 0 && b[3] === 16 && b[0] === 16).map(b => [b[2], b[4]]), [[32, 16], [32, 48], [4, 80]], 'the top edge: 32 px pieces from 16, the last cut to fit');
    assert.ok(parts.every(p => !p.visible) && win._rrFrameSprite.visible, 'MZ\'s stretched parts hidden');
    win._windowskin = { _url: 'img/system/Other.png' };
    assert.equal(win._refreshRgssFrame(), false, 'a skin without a kept cell keeps MZ\'s frame');
    assert.ok(parts.every(p => p.visible) && !win._rrFrameSprite.visible, 'switching to such a skin shows MZ\'s frame parts again');
    const windows = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_windows.js'), 'utf8');
    assert.match(windows, /if \(rgss\(\) && this\._opening\) this\.openness \+= 16;/);
});
