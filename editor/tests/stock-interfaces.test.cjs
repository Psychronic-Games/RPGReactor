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

test('build preserves stable ids and appends Options, Save, and Load deterministically', () => {
    const records = Stock.build({ system: demoSystem });
    assert.deepStrictEqual(records.map(r => [r.id, r.name, r.stock]), [
        [1, 'Title Screen', 'title'], [2, 'Main Menu', 'menu'], [3, 'Game End', 'gameEnd'], [4, 'Status', 'status'],
        [5, 'Options', 'options'], [6, 'Save', 'save'], [7, 'Load', 'load']
    ]);
    const [title, menu, gameEnd, status] = records;
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
    assert.strictEqual(status.nodes.find(node => node.name === 'Actor summary').y, 52);
});

test('unequal screen and UI-area dimensions stay in physical pixels with the stock 8px margin', () => {
    const system = JSON.parse(JSON.stringify(demoSystem));
    system.advanced.screenWidth = 1280;
    system.advanced.screenHeight = 720;
    system.advanced.uiAreaWidth = 1264;
    system.advanced.uiAreaHeight = 704;
    const [title, menu] = Stock.build({ system });
    const commands = record => record.nodes.find(node => node.type === 'box' && node.name === 'Commands');
    assert.deepStrictEqual([title.coordinateSpace, commands(title).x, commands(title).y], ['screen', 520, 484]);
    assert.deepStrictEqual([commands(menu).x, commands(menu).y, commands(menu).width], [1032, 60, 240]);
    const party = menu.nodes.find(node => node.name === 'Party');
    assert.deepStrictEqual([party.x, party.y, party.width, party.height], [8, 60, 1024, 652]);
    assert.strictEqual(commands(menu).x + commands(menu).width, 1272, 'the UI area ends 8px before the physical right edge');
});

test('buttons carry the project terms and the stock command actions', () => {
    const system = JSON.parse(JSON.stringify(demoSystem));
    system.terms.commands[4] = 'Inventory';
    system.menuCommands = [true, false, true, true, true, true];
    const [title, menu, gameEnd] = Stock.build({ system });
    const buttons = record => record.nodes.filter(n => n.type === 'button');
    assert.deepStrictEqual(buttons(menu).map(b => b.text), ['Inventory', 'Equip', 'Status', 'Options', 'Save', 'Game End']);
    assert.deepStrictEqual(buttons(menu).map(b => b.action.type === 'scene' ? b.action.scene : b.action.type), ['item', 'personalEquip', 'personalStatus', 'options', 'save', 'gameEnd']);
    assert.strictEqual(buttons(menu).find(b => b.text === 'Inventory').enabled.script, '$gameParty.exists()');
    assert.strictEqual(buttons(menu).some(b => b.text === 'Formation'), false, 'Formation is omitted until its workflow exists');
    assert.strictEqual(buttons(menu).find(b => b.text === 'Save').enabled.script, '!DataManager.isEventTest() && $gameSystem.isSaveEnabled()');
    assert.strictEqual(menu.firstFocus, buttons(menu)[0].id);
    for (const button of buttons(menu)) assert.strictEqual(button.parent, menu.nodes.find(n => n.name === 'Commands').id);
    const [newGame, cont, options] = buttons(title);
    assert.strictEqual(newGame.action.type, 'titleNewGame');
    assert.deepStrictEqual([cont.action.type, cont.enabled.type, cont.enabled.script], ['titleContinue', 'saveExists', '']);
    assert.strictEqual(options.action.type, 'titleOptions');
    assert.strictEqual(title.background, 'none');
    assert.deepStrictEqual(title.nodes.filter(node => node.type === 'image').map(node => [node.source, node.file]),
        [['title1', system.title1Name], ['title2', system.title2Name]].filter(([, file]) => file), 'the bindable title baseline carries the project title art');
    assert.strictEqual(title.cancel.type, 'none');
    assert.strictEqual(title.firstFocus, newGame.id, 'title focus follows the generated New Game id after optional art/title nodes');
    assert.deepStrictEqual(buttons(gameEnd).map(b => [b.text, b.action.type]), [['To Title', 'gameEndToTitle'], ['Cancel', 'close']]);
});

test('Title baseline follows optDrawTitle and the stock 48px title draw baseline', () => {
    const system = JSON.parse(JSON.stringify(demoSystem));
    system.optDrawTitle = true;
    const title = Stock.build({ system })[0];
    const gameTitle = title.nodes.find(node => node.name === 'Game title');
    assert.deepStrictEqual([gameTitle.x, gameTitle.y, gameTitle.width, gameTitle.height, gameTitle.fontSize], [20, 163, 1240, 0, 72]);
    system.optDrawTitle = false;
    const hidden = Stock.build({ system })[0];
    assert.strictEqual(hidden.nodes.some(node => node.name === 'Game title'), false);
    assert.strictEqual(hidden.firstFocus, hidden.nodes.find(node => node.type === 'button' && /New Game/i.test(node.text)).id);
});

test('the Main Menu publishes selectedActor and binds personal actions and details to it', () => {
    const [, menu] = Stock.build({ system: demoSystem });
    const party = menu.nodes.find(node => node.type === 'list' && node.dataSource === 'party');
    assert.deepStrictEqual([party.contextName, party.rowText, party.action.type], ['selectedActor', '{name}  Lv {level}', 'none']);
    const faces = menu.nodes.filter(n => n.type === 'image');
    assert.strictEqual(faces.length, 1);
    assert.deepStrictEqual([faces[0].source, faces[0].actorSource, faces[0].actorContextName], ['partyFace', 'context', 'selectedActor']);
    const detail = menu.nodes.filter(node => node.actorContextName === 'selectedActor');
    assert.ok(detail.some(node => node.type === 'text' && node.text === '{actor.name}'));
    assert.deepStrictEqual(detail.filter(node => node.type === 'gauge').map(node => node.gauge), ['hp', 'mp', 'exp']);
    for (const type of ['personalSkill', 'personalEquip', 'personalStatus']) {
        const button = menu.nodes.find(node => node.type === 'button' && node.action.type === type);
        assert.strictEqual(button.action.contextName, 'selectedActor');
        assert.strictEqual(button.enabled.script, 'return !!scene.context("selectedActor");');
    }
    assert.ok(menu.nodes.some(node => node.type === 'text' && node.text === '\\GOLD \\G'));
});

test('Status is a read-only menu-actor baseline with complete actor data and paging', () => {
    const status = Stock.build({ system: demoSystem })[3];
    const actorNodes = status.nodes.filter(node => node.actorSource === 'menuActor');
    assert.ok(actorNodes.some(node => node.type === 'image' && node.source === 'partyFace'));
    const text = actorNodes.filter(node => node.type === 'text').map(node => node.text).join('\n');
    for (const token of ['{actor.name}', '{actor.nickname}', '{actor.class}', '{actor.level}', '{actor.profile}', '{actor.totalExp}', '{actor.nextRequiredExp}']) {
        assert.ok(text.includes(token), token);
    }
    assert.deepStrictEqual(actorNodes.filter(node => node.type === 'gauge').map(node => node.gauge), ['hp', 'mp', 'tp', 'exp']);
    assert.deepStrictEqual(status.nodes.filter(node => node.type === 'list').map(node => [node.dataSource, node.action.type]), [
        ['actorParameters', 'none'], ['actorEquipment', 'none'], ['actorStates', 'none']
    ]);
    assert.deepStrictEqual(status.nodes.filter(node => node.type === 'button').map(node => node.action.type), ['previousMenuActor', 'nextMenuActor', 'close']);
    assert.strictEqual(status.cancel.type, 'close');
});

test('Options, Save, and Load baselines use typed sources and semantic actions only', () => {
    const records = Stock.build({ system: demoSystem });
    const [options, save, load] = records.slice(4);
    assert.deepStrictEqual(records.map(record => record.roles), records.map(record => [record.stock]));
    const optionsList = options.nodes.find(node => node.type === 'list');
    assert.deepStrictEqual([options.id, optionsList.dataSource, optionsList.rowText, optionsList.action.type],
        [5, 'options', '{name}  {valueText}', 'optionChange']);
    const saveList = save.nodes.find(node => node.type === 'list');
    const loadList = load.nodes.find(node => node.type === 'list');
    assert.deepStrictEqual([save.id, saveList.dataSource, saveList.includeAutosave, saveList.action.type], [6, 'saveSlots', false, 'saveSlot']);
    assert.deepStrictEqual([load.id, loadList.dataSource, loadList.includeAutosave, loadList.action.type], [7, 'saveSlots', true, 'loadSlot']);
    for (const record of [options, save, load]) {
        assert.equal(record.nodes.some(node => node.action && node.action.type === 'script'), false);
    }
    const detail = load.nodes.filter(node => node.type === 'text').map(node => node.text).join(' ');
    for (const token of ['{context.name}', '{context.title}', '{context.playtime}', '{context.date}', '{context.partyCharacters}']) {
        assert.match(detail, new RegExp(token.replace(/[{}]/g, '\\$&')));
    }
});

test('missing system data falls back to MZ defaults without throwing', () => {
    const records = Stock.build({});
    assert.strictEqual(records.length, 7);
    const box = records[0].nodes.find(n => n.type === 'box');
    assert.deepStrictEqual([box.x, box.y], [(816 - 240) / 2, 624 - 132 - 96]);
    assert.strictEqual(records[1].nodes.filter(n => n.type === 'button').map(b => b.text)[0], 'Item');
});

test('tracked Demo carries all generated records without opting into replacements', () => {
    const demo = JSON.parse(read('template/Demo/data/UserInterfaces.json'));
    const generated = Stock.build({ system: demoSystem });
    for (const record of generated) assert.deepStrictEqual(demo[record.id], record);
    assert.strictEqual(Object.keys(demoSystem).some(key => /^reactor(?:Title|Menu|Status|GameEnd|Options|Save|Load)InterfaceId$/.test(key)), false);
});

test('runtime and editor understand party faces and party codes', () => {
    const runtime = read('runtime/reactor_ui.js');
    assert.match(runtime, /"icon", "partyFace", "title1", "title2"\]/);
    assert.match(runtime, /case "partyFace": \{[\s\S]*ImageManager\.loadFace\(member\.faceName\(\)\)/);
    assert.match(runtime, /member \? member\.faceIndex\(\) : node\.index/);
    assert.match(runtime, /Window_ReactorUINode\.prototype\.convertEscapeCharacters = function\(text\)/);
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
