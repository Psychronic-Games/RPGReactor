'use strict';
// RPG Maker 2000/2003 imports on screen: the menus and battle windows as the
// old engines laid them out (System.json rrLegacyWindows), pixel text at the
// font's own size on whole pixels, battle messages that name the battler,
// the runtime an import shipped with, and a moved player starting no touch
// events. Window code runs in a VM against stub classes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource, runtimeRoot } = require('./helpers/runtime-source.cjs');

const D = require('../src/legacy/LegacyDatabase.js');
const K = require('../src/legacy/LegacyConvert.js');
const I = require('../src/legacy/LegacyImporter.js');

/** A class whose prototype answers any method it lacks with a no-op. */
function stubClass(parent) {
    function C(...args) { if (this.initialize) this.initialize(...args); }
    const target = Object.create(parent ? parent.prototype : Object.prototype);
    C.prototype = new Proxy(target, { get: (t, k, r) => (k in t || typeof k !== 'string' ? Reflect.get(t, k, r) : function() {}) });
    return C;
}

class Rectangle { constructor(x = 0, y = 0, width = 0, height = 0) { Object.assign(this, { x, y, width, height }); } }

/** The 2000/2003 menu and battle block of reactor_windows.js, run against stubs, with `system` as $dataSystem. */
function loadWindows(system) {
    const src = fs.readFileSync(path.join(runtimeRoot, 'reactor_windows.js'), 'utf8');
    const start = src.indexOf('// RPG Maker 2000/2003 menus and battles');
    const end = src.indexOf('\n})();\n', start) + '\n})();'.length;
    assert.ok(start >= 0 && end > start, 'the legacy window block is locatable');
    const c = {};
    c.Window_Base = stubClass();
    c.Window_Selectable = stubClass(c.Window_Base);
    c.Window_Command = stubClass(c.Window_Selectable);
    c.Window_StatusBase = stubClass(c.Window_Selectable);
    for (const [name, parent] of [['Window_MenuCommand', 'Window_Command'], ['Window_MenuStatus', 'Window_StatusBase'], ['Window_MenuActor', 'Window_MenuStatus'],
        ['Window_BattleStatus', 'Window_StatusBase'], ['Window_BattleEnemy', 'Window_Selectable'], ['Window_BattleLog', 'Window_Base'], ['Window_ItemCategory', 'Window_Command'],
        ['Window_ItemList', 'Window_Selectable'], ['Window_SkillList', 'Window_Selectable'], ['Window_SkillStatus', 'Window_StatusBase'], ['Window_EquipItem', 'Window_ItemList'],
        ['Window_EquipStatus', 'Window_StatusBase'], ['Window_EquipSlot', 'Window_StatusBase'], ['Window_GameEnd', 'Window_Command'], ['Window_Help', 'Window_Base']]) c[name] = stubClass(c[parent]);
    c.Scene_MenuBase = stubClass();
    for (const name of ['Scene_Menu', 'Scene_Battle', 'Scene_ItemBase', 'Scene_GameEnd']) c[name] = stubClass(c.Scene_MenuBase);
    for (const name of ['Scene_Item', 'Scene_Skill', 'Scene_Equip']) c[name] = stubClass(c.Scene_ItemBase);
    c.Scene_Menu.prototype.calcWindowHeight = (rows) => rows * 16 + 16;
    c.Scene_Battle.prototype.calcWindowHeight = (rows) => rows * 16 + 16;
    c.Window_BattleLog.prototype.displayAction = function() { this.mz = true; };
    c.Window_BattleLog.prototype.push = function(...args) { this.pushed.push(args); };
    c.Window_BattleLog.prototype.addText = function(text) { this.shown = text; };
    c.Window_BattleLog.prototype.wait = function() { this.waited = (this.waited || 0) + 1; };
    Object.assign(c, {
        Rectangle, $dataSystem: system, Graphics: { boxWidth: 320, boxHeight: 240 },
        ColorManager: { textColor: n => `c${n}`, systemColor: () => 'mz-system', crisisColor: () => 'mz-crisis', deathColor: () => 'mz-death', normalColor: () => 'c0' },
        TextManager: { item: 'Item', skill: 'Skill', equip: 'Equip', save: 'Save', status: 'Status', formation: 'Order', gameEnd: 'Quit', levelA: 'L', hpA: 'HP', mpA: 'SP', expA: 'E', param: n => `p${n}` },
        DataManager: { isSkill: item => item.kind === 'skill' }, BattleManager: { displayStartMessages() {} },
        $gameTroop: { aliveMembers: () => [] }, $gameParty: {}, $gameMessage: { add() {} }
    });
    vm.runInNewContext(src.slice(start, end), c);
    return c;
}

test('the old engines\' main menu: an 88 px command column, the gold below it, the party beside', () => {
    const w2003 = loadWindows({ rrLegacyWindows: 2003, rrMenuCommands: [1, 3, 4, 6, 8] });
    const scene = new w2003.Scene_Menu();
    assert.deepEqual({ ...scene.commandWindowRect() }, { x: 0, y: 0, width: 88, height: 80 }, 'Item, Equip, Save and Quit: four lines');
    assert.deepEqual({ ...scene.goldWindowRect() }, { x: 0, y: 208, width: 88, height: 32 });
    assert.deepEqual({ ...scene.statusWindowRect() }, { x: 88, y: 0, width: 232, height: 240 });
    const commands = Object.assign(new w2003.Window_MenuCommand(), { list: [] });
    commands.addCommand = function(name, symbol) { this.list.push(symbol); };
    commands.makeCommandList();
    assert.deepEqual(commands.list, ['item', 'equip', 'save', 'gameEnd'], 'the game\'s list; Row and Wait have no place here');
    const w2000 = loadWindows({ rrLegacyWindows: 2000 });
    const plain = Object.assign(new w2000.Window_MenuCommand(), { list: [] });
    plain.addCommand = function(name, symbol) { this.list.push(symbol); };
    plain.makeCommandList();
    assert.deepEqual(plain.list, ['item', 'skill', 'equip', 'save', 'gameEnd']);
    const none = loadWindows({ rrLegacyWindows: 2003, rrMenuCommands: [] });
    assert.equal(new none.Scene_Menu().commandWindowRect().height, 48, 'a 2000 database on 2003: Item and Quit');
    const mz = loadWindows({});
    assert.equal(mz.ColorManager.systemColor(), 'mz-system', 'other projects keep their colors');
    assert.equal(w2003.ColorManager.systemColor(), 'c1');
});

test('lists: rows as wide as the window over its columns less 16, text at the row\'s edge', () => {
    const w = loadWindows({ rrLegacyWindows: 2000 });
    const list = Object.assign(new w.Window_ItemList(), { width: 320, maxCols: () => 2, itemHeight: () => 16, scrollBaseY: () => 0 });
    assert.deepEqual({ ...list.itemRect(3) }, { x: 156, y: 16, width: 152, height: 16 }, 'the cursor reaches 4 px past the text each side');
    assert.equal(list.itemPadding(), 4);
    const drawn = [];
    Object.assign(list, { itemAt: () => ({ name: 'Potion', iconIndex: 0 }), itemLineRect: () => new Rectangle(160, 16, 144, 16), isEnabled: () => true, needsNumber: () => true, changePaintOpacity() {}, resetTextColor() {}, drawText: (t, x, y, width, align) => drawn.push([String(t), x, width, align]) });
    w.$gameParty.numItems = () => 7;
    list.drawItem(3);
    assert.deepEqual(drawn, [['Potion', 160, 120, undefined], [':', 280, 6, undefined], ['7', 286, 18, 'right']], 'no icon gap; ":  7" in the last 24 px');
});

test('2003 battles: the enemy list beside the status row, commands over its edge, one notice line on top', () => {
    const w = loadWindows({ rrLegacyWindows: 2003 });
    const scene = new w.Scene_Battle();
    const rect = (name) => ({ ...scene[name]() });
    assert.deepEqual(rect('statusWindowRect'), { x: 104, y: 160, width: 216, height: 80 });
    assert.deepEqual(rect('enemyWindowRect'), { x: 0, y: 160, width: 104, height: 80 });
    assert.deepEqual(rect('actorCommandWindowRect'), { x: 28, y: 160, width: 76, height: 80 });
    assert.deepEqual(rect('partyCommandWindowRect'), { x: 0, y: 160, width: 76, height: 80 });
    assert.deepEqual(rect('logWindowRect'), { x: 0, y: 0, width: 320, height: 32 });
    const drawn = [];
    const status = Object.assign(new w.Window_BattleStatus(), {
        actor: () => ({ name: () => 'Talan', hp: 9, mhp: 40, states: () => [] }), itemRect: () => new Rectangle(-4, 16, 208, 16),
        resetTextColor() {}, changeTextColor(c) { this.color = c; }, drawText(t, x, y, width, align) { drawn.push([String(t), x, width, align, this.color]); }
    });
    status.drawItem(1);
    assert.deepEqual(drawn.map(d => d.slice(0, 4)), [['Talan', 0, 76, undefined], ['Normal', 80, 52, undefined], ['9', 132, 24, 'right']]);
    assert.equal(drawn[2][4], 'c4', 'a quarter or less is critical');
    const log = Object.assign(new w.Window_BattleLog(), { pushed: [], shown: null });
    const subject = { attackSkillId: () => 1, guardSkillId: () => 2 };
    log.displayAction(subject, { kind: 'skill', id: 7, name: 'Poison' });
    log.displayAction(subject, { kind: 'skill', id: 1, name: 'Attack' });
    assert.deepEqual(log.pushed, [['addNotice', 'Poison'], ['wait', 'Attack']], 'the skill by name; a plain attack by nothing');
    log.addText('Slime takes 8 damage');
    assert.equal(log.shown, null, 'no result lines');
    const w2000 = loadWindows({ rrLegacyWindows: 2000 });
    const scene2000 = new w2000.Scene_Battle();
    assert.deepEqual({ ...scene2000.statusWindowRect() }, { x: 76, y: 160, width: 244, height: 80 });
    assert.deepEqual({ ...scene2000.logWindowRect() }, { x: 0, y: 160, width: 320, height: 80 }, '2000 prints battle messages in the bottom row');
    const log2000 = Object.assign(new w2000.Window_BattleLog(), { shown: null });
    log2000.addText('Slime takes 8 damage');
    assert.equal(log2000.shown, 'Slime takes 8 damage');
});

test('2000/2003 text is drawn at the font\'s own size, on whole pixels, never squeezed', () => {
    const src = runtimeSource('reactor_core.js');
    const pick = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return src.slice(a, b + to.length); };
    const code = [pick('Bitmap.prototype.drawText = function', '\n};'), pick('Bitmap.prototype._makeFontNameText = function', '\n};'),
        pick('Bitmap.pixelText = function', '\n};'), pick('Bitmap.fixedFontSize = function', '\n};')].join('\n');
    const calls = [];
    const context = { measureText: (t) => ({ width: t.length * 6.5 }), save() {}, restore() {}, fillText: (t, x, y, w) => calls.push({ t, x, y, w, font: context.font }) };
    function Bitmap() {}
    const sandbox = { Bitmap, $dataSystem: null };
    vm.runInNewContext(code, sandbox);
    const bitmap = Object.assign(new Bitmap(), { context, _drawingContext: () => context, _touchUpload() {}, fontSize: 10, fontFace: 'RM2000', fontItalic: false, fontBold: false, outlineWidth: 0, _baseTexture: { update() {} },
        _drawTextOutline() {}, _drawTextBody(t, x, y, w) { context.fillText(t, x, y, w); } });
    sandbox.$dataSystem = { rrLegacyWindows: 2003, advanced: { fontSize: 13, pixelatedRendering: true } };
    bitmap.drawText('12345', 0, 0, 20, 16, 'right');
    assert.deepEqual(calls.pop(), { t: '12345', x: -12, y: 13, w: 0xffffffff, font: '13px RM2000' }, 'a gauge label\'s smaller size is the font\'s own; right-aligned from a whole pixel; overflowing, not squeezed');
    bitmap.drawText('ab', 2, 0, 10, 16, 'center');
    assert.equal(calls.pop().x, 1, 'centred from a whole pixel: 2 + (10 - 13) / 2 rounds to 1');
    sandbox.$dataSystem = { rrLegacyWindows: 2003, advanced: { fontSize: 13, pixelatedRendering: false } };
    bitmap.drawText('12345', 0, 0, 20, 16, 'right');
    assert.deepEqual(calls.pop(), { t: '12345', x: 20, y: 13, w: 0xffffffff, font: '13px RM2000' }, 'with Pixelated Rendering off, right-aligned at the given width, still not squeezed');
    bitmap.drawText('ab', 2, 0, 10, 16, 'center');
    assert.equal(calls.pop().x, 7, 'and centred in it');
    sandbox.$dataSystem = { advanced: {} };
    bitmap.drawText('12345', 0, 0, 20, 16, 'right');
    assert.deepEqual(calls.pop(), { t: '12345', x: 20, y: 12, w: 20, font: '10px RM2000' }, 'other projects draw as before');
});

test('imported battle messages name the battler, as the old engines printed them after the name', () => {
    const ids = (arr) => arr.map((r, i) => (r ? { id: i, ...r } : r));
    const db = {
        engine: 'RPG Maker 2000', runtime: 'RPG Maker 2003', actors: [null], classes: [null], attributes: [null], commonevents: [null], animations: [null],
        skills: ids([null, { name: 'Poison', type: 0, scope: 0, using_message1: ' uses poison' }, { name: 'Fire', type: 0, scope: 0, using_message1: 'casts %S Fire' }]),
        states: ids([null, { name: 'Dead', message_actor: ' falls', message_enemy: ' is slain' }, { name: 'Poison', color: 3, message_actor: 'is poisoned' }]),
        enemies: ids([null, { name: 'Slime' }]), troops: ids([null, { name: 'One', members: [null, { x: 10, y: 20 }], pages: [] }]), items: [null]
    };
    const out = D.convert(db, { start: {} }, {});
    assert.deepEqual([out.skills[1].message1, out.skills[2].message1], ['%1 uses poison', 'casts %1 Fire']);
    assert.deepEqual([out.states[1].message1, out.states[1].message2, out.states[2].message1], ['%1 falls', '%1 is slain', '%1 is poisoned'], 'a missing space is supplied');
    assert.equal(out.states[2].rrColor, 3, 'the state\'s own text color');
    assert.equal(out.troops[1].members[0].enemyId, 1, 'a member with the default enemy keeps it');
    const actor = { exp_base: 30, exp_inflation: 30, exp_correction: 0 };
    assert.deepEqual(D.expTable(actor, false, 3).slice(2), [60, 150]);
    const run2003 = D.convert({ ...db, actors: ids([null, { name: 'A', initial_level: 1, final_level: 3, ...actor }]) }, { start: {} }, {});
    assert.deepEqual(run2003.actors[1] && run2003.classes[1].expTable.slice(2, 4), [60, 150], 'a 2000 database on 2003\'s RPG_RT levels by 2003\'s curve');
});

test('the runtime an import shipped with decides its windows; Quit asks the game\'s question', () => {
    const base = { advanced: {}, titleCommandWindow: {} };
    assert.equal(K.systemJson(base, { system: {}, engine: 'RPG Maker 2000', runtime: 'RPG Maker 2003' }, null, null).rrLegacyWindows, 2003);
    const s2000 = K.systemJson(base, { system: {}, engine: 'RPG Maker 2000' }, null, null);
    assert.deepEqual([s2000.rrLegacyWindows, s2000.rrTouchUiOff], [2000, true], 'and no touch buttons');
    const terms = D.system(JSON.parse(JSON.stringify({ terms: { basic: [], commands: [], params: [], messages: {} } })), { terms: { exit_game_message: 'Leave?', yes: 'Sure', no: 'Nah', normal_status: 'Fine' }, system: { menu_commands: [1, 0, 4] } }, null, {});
    assert.deepEqual([terms.rrQuitMessage, terms.rrYes, terms.rrNo, terms.rrNormalStatus, terms.rrMenuCommands], ['Leave?', 'Sure', 'Nah', 'Fine', [1, 4]]);
});

test('RPG_RT.exe\'s version says which engine runs the game', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-rt-'));
    try {
        const exe = (version) => Buffer.concat([Buffer.alloc(64, 0x4d), Buffer.from('FileVersion\0', 'utf16le'), Buffer.alloc(2), Buffer.from(version + '\0', 'utf16le')]);
        fs.writeFileSync(path.join(root, 'RPG_RT.EXE'), exe('1.1.2.1'));
        assert.equal(I.runtimeEngine(root), 'RPG Maker 2003');
        fs.writeFileSync(path.join(root, 'RPG_RT.EXE'), exe('1.6.1.0'));
        assert.equal(I.runtimeEngine(root), 'RPG Maker 2000');
        fs.writeFileSync(path.join(root, 'RPG_RT.EXE'), Buffer.alloc(32));
        assert.equal(I.runtimeEngine(root), null, 'no version: the database decides');
        assert.equal(I.runtimeEngine(path.join(root, 'missing')), null);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a player moved by a route starts no touch events until the route\'s last step', () => {
    const src = fs.readFileSync(path.join(runtimeRoot, 'reactor_objects_legacy.js'), 'utf8');
    const c = { $dataSystem: { rrLegacyMotion: true }, Math, JSON, Number, String, Array, Set, WeakMap, Infinity };
    for (const name of ['Game_CharacterBase', 'Game_Character', 'Game_Player', 'Game_Event', 'Game_Interpreter', 'Game_Map', 'Game_Actor', 'Game_Variables']) c[name] = stubClass();
    for (const name of ['Input', 'BattleManager', 'SceneManager']) c[name] = {};
    const started = [];
    c.Game_Player.prototype.checkEventTriggerHere = (triggers) => started.push(['here', triggers]);
    c.Game_Player.prototype.checkEventTriggerTouch = (x, y) => started.push(['touch', x, y]);
    vm.runInNewContext(src, c);
    const route = { repeat: false, list: [{ code: 1 }, { code: 1 }, { code: 0 }] };
    const player = Object.assign(new c.Game_Player(), { _moveRoute: route, _moveRouteIndex: 1, isMoveRouteForcing: () => true });
    player.checkEventTriggerHere([1, 2]);
    player.checkEventTriggerTouch(3, 4);
    player.checkEventTriggerHere([0]);
    assert.deepEqual(started, [['here', [0]]], 'mid-route: no touch, an action button event still can');
    player._moveRouteIndex = 2;
    player.checkEventTriggerHere([1, 2]);
    assert.deepEqual(started.pop(), ['here', [1, 2]], 'the last step lands on the event that starts');
    c.$dataSystem = { rrLegacyMotion: false };
    player._moveRouteIndex = 0;
    player.checkEventTriggerTouch(1, 1);
    assert.deepEqual(started.pop(), ['touch', 1, 1], 'other projects as before');
});

test('animated chipset tiles keep their four frames and cycle them; water keeps the chipset\'s pace', () => {
    const chip = K.blank(480, 256);
    // Mark each animated tile's frame cell (column 3 + t, row 4 + f) with its own red value.
    for (let t = 0; t < 3; t++) for (let f = 0; f < 4; f++) {
        const i = (((4 + f) * 16) * 480 + (3 + t) * 16) * 4;
        chip.data[i] = 10 + t * 4 + f; chip.data[i + 3] = 255;
    }
    const { B } = K.chipsetToSheets(chip);
    for (let t = 0; t < 3; t++) K.animatedFrames(t).forEach((slot, f) => {
        const [c, r] = K.bcPos(slot);
        assert.equal(B.data[((r * 16) * B.width + c * 16) * 4], 10 + t * 4 + f, `tile ${t} frame ${f} at B slot ${slot}`);
    });
    const names = { A1: 'a1', A2: 'a2', B: 'b', C: 'c' };
    const slow = K.tilesetJson({ id: 1, animation_speed: 0, animation_type: 0 }, [], names);
    assert.deepEqual(slow.rrTileFrames[145], [145, 148, 149, 150]);
    assert.deepEqual({ ...slow.rrWater }, { step: 24, cycle: 4 });
    assert.deepEqual({ ...K.tilesetJson({ id: 2, animation_speed: 1, animation_type: 1 }, [], names).rrWater }, { step: 12, cycle: 3 }, 'fast, 1-2-3');

    const src = fs.readFileSync(path.join(runtimeRoot, 'reactor_core_display.js'), 'utf8');
    const pick = (from) => { const a = src.indexOf(from); return src.slice(a, src.indexOf('\n};\n', a) + 3); };
    function Tilemap() {}
    Tilemap.isTileA5 = () => false;
    vm.runInNewContext(pick('Tilemap.prototype.setTileAnimation = function') + pick('Tilemap.prototype._rrKeepUsedTileFrames = function') + pick('Tilemap.prototype.refresh = function') + pick('Tilemap.prototype._addNormalTile = function'), { Tilemap });
    const tilemap = Object.assign(new Tilemap(), { tileWidth: 16, tileHeight: 16, _mapData: [0, 146, 5], animationCount: 0 });
    tilemap.setTileAnimation(slow.rrTileFrames, slow.rrWater);
    assert.deepEqual(Object.keys(tilemap._rrTileFrames), ['146'], 'only the tiles the map uses');
    const drawn = [];
    const layer = { addRect: (set, sx, sy) => drawn.push([sx / 16, sy / 16]) };
    for (const count of [0, 6, 12, 18, 24]) { tilemap.animationCount = count; tilemap._addNormalTile(layer, 146, 0, 0); }
    assert.deepEqual(drawn, [146, 151, 152, 153, 146].map(id => [...K.bcPos(id)]), 'a frame every 6 game frames');
    const still = Object.assign(new Tilemap(), { _mapData: [0, 5] });
    still.setTileAnimation(slow.rrTileFrames, null);
    assert.equal(still._rrTileFrames, null, 'a map without them never repaints for them');
    // A tile put on the map after load (a 2000/2003 tile substitution rewrites the map's data, then refreshes) animates too.
    still._mapData[1] = 145;
    still.refresh();
    assert.deepEqual(Object.keys(still._rrTileFrames), ['145'], 'the changed map is asked again');
    assert.equal(still._needsRepaint, true);
    still._mapData[1] = 5;
    still.refresh();
    assert.equal(still._rrTileFrames, null, 'and a map that lost them stops repainting');
    const plain = Object.assign(new Tilemap(), { _mapData: [0, 145] });
    plain.refresh();
    assert.equal(plain._rrTileFrames, undefined, 'a tileset with no animation table pays nothing on refresh');
});

test('the 2003 enemy list beside the status row redraws when the living enemies or their names change, not every frame', () => {
    const c = loadWindows({ rrLegacyWindows: 2003 });
    const enemy = (name) => ({ alive: true, name() { return name; }, isAlive() { return this.alive; } });
    const slime = enemy('Slime A'), bat = enemy('Bat');
    c.$gameTroop = { members: () => [slime, bat], aliveMembers: () => [slime, bat].filter(e => e.isAlive()) };
    let refreshes = 0;
    c.Window_Selectable.prototype.refresh = function() { refreshes++; };
    c.Window_Selectable.prototype.select = function() {};
    const list = new c.Window_BattleEnemy();
    Object.assign(list, { active: false, visible: false, index: () => -1 });
    const scene = new c.Scene_Battle();
    Object.assign(scene, {
        _statusWindow: { visible: true, isOpen: () => true, x: 0 }, _enemyWindow: list, _skillWindow: { visible: false }, _itemWindow: { visible: false },
        _actorCommandWindow: {}, _actorWindow: {}
    });
    scene.updateStatusWindowPosition();
    scene.updateStatusWindowPosition();
    scene.updateStatusWindowPosition();
    assert.equal(refreshes, 1, 'drawn once while nothing changes');
    assert.deepEqual([...list._enemies], [slime, bat]);
    bat.alive = false;
    scene.updateStatusWindowPosition();
    assert.equal(refreshes, 2, 'a defeated enemy leaves the list');
    assert.deepEqual([...list._enemies], [slime]);
    slime.name = () => 'King Slime';
    scene.updateStatusWindowPosition();
    assert.equal(refreshes, 3, 'a transformed enemy is renamed');
});
