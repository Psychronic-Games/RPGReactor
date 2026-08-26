'use strict';
// Baseline interface records for a project's stock scenes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const Stock = require('../src/utils/StockInterfaces.js');
const demoSystem = JSON.parse(read('template/Demo/data/System.json'));

test('build lays out Title, Main Menu and Game End with the stock window math', () => {
    const records = Stock.build({ system: demoSystem });
    assert.deepStrictEqual(records.map(r => [r.id, r.name, r.stock]), [[1, 'Title Screen', 'title'], [2, 'Main Menu', 'menu'], [3, 'Game End', 'gameEnd']]);
    const [title, menu, gameEnd] = records;
    const box = record => record.nodes.find(n => n.type === 'box' && n.name === 'Commands');
    // 1280x720 with a 1280x720 UI area: title command 240x132 at ((1280-240)/2, 720-132-96)
    assert.deepStrictEqual([box(title).x, box(title).y, box(title).width, box(title).height], [520, 492, 240, 132]);
    // Main menu: commands on the right above a one-line gold window, party area on the left
    assert.deepStrictEqual([box(menu).x, box(menu).y, box(menu).width, box(menu).height], [1040, 52, 240, 668 - 60]);
    const gold = menu.nodes.find(n => n.name === 'Gold' && n.type === 'box');
    assert.deepStrictEqual([gold.x, gold.y, gold.width, gold.height], [1040, 660, 240, 60]);
    const party = menu.nodes.find(n => n.name === 'Party');
    assert.deepStrictEqual([party.x, party.y, party.width, party.height], [0, 52, 1040, 668]);
    assert.deepStrictEqual([box(gameEnd).x, box(gameEnd).y, box(gameEnd).width, box(gameEnd).height], [520, 312, 240, 96]);
});

test('buttons carry the project terms and the stock command actions', () => {
    const system = JSON.parse(JSON.stringify(demoSystem));
    system.terms.commands[4] = 'Inventory';
    system.menuCommands = [true, false, true, true, true, true];
    const [title, menu, gameEnd] = Stock.build({ system });
    const buttons = record => record.nodes.filter(n => n.type === 'button');
    assert.deepStrictEqual(buttons(menu).map(b => b.text), ['Inventory', 'Equip', 'Status', 'Save', 'Options', 'Game End'], 'a disabled menu command is left out');
    assert.deepStrictEqual(buttons(menu).map(b => b.action.type === 'scene' ? b.action.scene : b.action.type), ['item', 'equip', 'status', 'save', 'options', 'gameEnd']);
    assert.strictEqual(buttons(menu).find(b => b.text === 'Save').enabled.script, '$gameSystem.isSaveEnabled()');
    assert.strictEqual(menu.firstFocus, buttons(menu)[0].id);
    for (const button of buttons(menu)) assert.strictEqual(button.parent, menu.nodes.find(n => n.name === 'Commands').id);
    const [newGame, cont, options] = buttons(title);
    assert.match(newGame.action.script, /setupNewGame[\s\S]*goto\(Scene_Map\)/);
    assert.deepStrictEqual([cont.action.scene, cont.enabled.type, cont.enabled.script], ['load', 'script', 'DataManager.isAnySavefileExists()']);
    assert.strictEqual(options.action.scene, 'options');
    assert.strictEqual(title.background, 'none');
    assert.strictEqual(title.cancel.type, 'none');
    assert.deepStrictEqual(buttons(gameEnd).map(b => [b.text, b.action.type === 'scene' ? b.action.scene : b.action.type]), [['To Title', 'title'], ['Cancel', 'close']]);
});

test('the party area uses party faces and party codes, slots past the first gated on party size', () => {
    const [, menu] = Stock.build({ system: demoSystem });
    const faces = menu.nodes.filter(n => n.type === 'image');
    assert.strictEqual(faces.length, 4);
    assert.deepStrictEqual(faces.map(f => [f.source, f.index]), [['partyFace', 0], ['partyFace', 1], ['partyFace', 2], ['partyFace', 3]]);
    assert.strictEqual(faces[0].visible.type, 'always');
    assert.deepStrictEqual([faces[1].visible.type, faces[1].visible.script], ['script', '$gameParty.size() > 1']);
    const texts = menu.nodes.filter(n => n.type === 'text').map(n => n.text);
    assert.ok(texts.includes('\\P[1]') && texts.includes('\\PCLASS[4]'));
    assert.ok(texts.some(t => /^HP \\PHP\[1\]\/\\PMHP\[1\]$/.test(t)), 'HP uses the abbreviation from Terms');
    assert.ok(texts.includes('\\GOLD \\G'));
});

test('missing system data falls back to MZ defaults without throwing', () => {
    const records = Stock.build({});
    assert.strictEqual(records.length, 3);
    const box = records[0].nodes.find(n => n.type === 'box');
    assert.deepStrictEqual([box.x, box.y], [(816 - 240) / 2, 624 - 132 - 96]);
    assert.strictEqual(records[1].nodes.filter(n => n.type === 'button').map(b => b.text)[0], 'Item');
});

test('runtime and editor understand party faces and party codes', () => {
    const runtime = read('runtime/reactor_ui.js');
    assert.match(runtime, /"icon", "partyFace"\]/);
    assert.match(runtime, /case "partyFace": \{[\s\S]*ImageManager\.loadFace\(member\.faceName\(\)\)/);
    assert.match(runtime, /member \? member\.faceIndex\(\) : node\.index/);
    assert.match(runtime, /convertEscapeCharacters\(ReactorUI\.convertPartyCodes\(node\.text\)\)/);
    assert.match(runtime, /\\\\GOLD/);
    assert.match(runtime, /PLV\|PCLASS\|PHP\|PMHP\|PMP\|PMMP\|PTP/);
    const editor = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    assert.match(editor, /\['partyFace', tt\('Party face'\)\]/);
    assert.match(editor, /startingMember\(node\.index\)/);
    assert.match(editor, /startingStat\(code\.toUpperCase\(\), Number\(n\) - 1\)/);
    assert.match(read('editor/index.html'), /src\/utils\/StockInterfaces\.js/);
    assert.match(read('editor/src/DatabaseManager.js'), /RRStockInterfaces\.build\(loaded\)/);
});

test('convertPartyCodes resolves slots and leaves stock codes alone', () => {
    const vm = require('vm');
    const members = [
        { level: 7, hp: 120, mhp: 150, mp: 10, mmp: 30, tp: 5, currentClass: () => ({ name: 'Hero' }), faceName: () => 'Actor1', faceIndex: () => 2 }
    ];
    const ctx = {
        window: {}, console, location: { search: '' }, document: { createElement: () => ({}) }, $gameParty: { members: () => members, gold: () => 321 },
        Graphics: {}, PIXI: {}, SceneManager: {}, DataManager: {}, Scene_Boot: function() {}, Scene_Base: function() {},
        Scene_Map: function() {}, Scene_Title: function() {}, Window_Base: function() {}, Window_Selectable: function() {},
        Window_Command: function() {}, Sprite: function() {}, Rectangle: function(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; },
        Bitmap: function() {}, ImageManager: {}, Input: {}, TouchInput: {}, PluginManager: { registerCommand() {} }, Game_Interpreter: function() {},
        ColorManager: {}, Utils: { isNwjs: () => false, isOptionValid: () => false }, ConfigManager: {}, SoundManager: {}, AudioManager: {}, Point: function() {}
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    for (const k of ['Scene_Base', 'Scene_Map', 'Scene_Title', 'Scene_Boot', 'Window_Base', 'Window_Selectable', 'Window_Command', 'Sprite', 'Game_Interpreter']) ctx[k].prototype = {};
    vm.createContext(ctx);
    try { vm.runInContext(read('runtime/reactor_ui.js'), ctx); } catch (e) { /* load-time hooks may need more of the engine; the functions below exist regardless */ }
    const UI = ctx.ReactorUI || ctx.window.ReactorUI;
    assert.ok(UI && typeof UI.convertPartyCodes === 'function', 'ReactorUI.convertPartyCodes is defined');
    assert.strictEqual(UI.convertPartyCodes('\\GOLD \\G'), '321 \\G');
    assert.strictEqual(UI.convertPartyCodes('Lv \\PLV[1] \\PCLASS[1] HP \\PHP[1]/\\PMHP[1] MP \\PMP[1]/\\PMMP[1] \\PTP[1]'), 'Lv 7 Hero HP 120/150 MP 10/30 5');
    assert.strictEqual(UI.convertPartyCodes('\\P[2] \\PLV[2]'), '\\P[2] ', 'an empty slot reads as nothing; \\P stays for the stock converter');
    assert.strictEqual(UI.convertPartyCodes('\\\\GOLD'), '\\\\GOLD', 'an escaped backslash is not a code');
});
