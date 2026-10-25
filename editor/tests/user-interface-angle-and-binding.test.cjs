'use strict';
// A node's Angle (turned about its center, in the game and on the canvas alike)
// and the notice for a record laid out as a stock screen the game does not use yet.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const runtimeSource = fs.readFileSync(path.join(root, 'runtime', 'reactor_ui.js'), 'utf8');
const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');

function runtime() {
    class Base { initialize() {} }
    const stub = () => { const C = function() {}; C.prototype = Object.create(Base.prototype); return C; };
    const sandbox = {
        console, setTimeout, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' },
        require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true }, Graphics: { width: 320, height: 180, boxWidth: 320, boxHeight: 180 },
        Window_Base: stub(), Window_Selectable: stub(), Scene_MenuBase: stub(), Scene_Boot: stub(), Scene_Map: stub(),
        Scene_Title: stub(), Scene_Menu: stub(), Scene_Status: stub(), Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(),
        DataManager: { isTitleSkip: () => false }, ConfigManager: {},
        PluginManager: { registerCommand() {} }, SceneManager: { _stack: [], push() {}, goto() {}, prepareNextScene() {} },
        $dataSystem: { variables: [], versionId: 1 }, $gameSystem: {}, $gameMap: {}, $gamePlayer: {},
        $gameSwitches: { value: () => false }, $gameVariables: { value: () => 0 },
        $gameActors: { actor: () => null }, $gameParty: { members: () => [], allItems: () => [], inBattle: () => false },
        Input: { isPressed: () => false }, TouchInput: { isPressed: () => false, x: 0, y: 0 },
        ColorManager: { textColor: value => String(value) }, SoundManager: { playCursor() {} },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(runtimeSource, sandbox);
    return sandbox;
}

function editorWith(system = {}, interfaces = []) {
    const manager = {
        data: { system: Object.assign({ advanced: { screenWidth: 800, screenHeight: 600 } }, system), userInterfaces: interfaces },
        getSystem() { return this.data.system; }, getUserInterfaces() { return interfaces.filter(Boolean); }, getCommonEvents() { return []; }, mutationGeneration: 0
    };
    const editor = new Editor(manager);
    editor._t = value => value;
    return editor;
}

test('the game keeps an Angle on nodes that turn, clamped, and none on the rest', () => {
    const ui = runtime().ReactorUI;
    assert.equal(ui.normalizeNode({ type: 'button', angle: 33.4 }).angle, 33);
    assert.equal(ui.normalizeNode({ type: 'image', angle: 400 }).angle, 180);
    assert.equal(ui.normalizeNode({ type: 'text', angle: -400 }).angle, -180);
    assert.equal(ui.normalizeNode({ type: 'button' }).angle, 0);
    assert.equal(ui.normalizeNode({ type: 'list', angle: 30 }).angle, 0, 'a list keeps its rows square');
    assert.deepEqual([...ui.TURNABLE_TYPES], Editor.TURNABLE_TYPES, 'the editor turns the same nodes as the game');
});

test('a turned window turns about its center while its layout corner stays put', () => {
    const sandbox = runtime();
    const node = sandbox.ReactorUI.normalizeNode({ type: 'button', fill: 'none', angle: 30 });
    const window = Object.create(sandbox.Window_ReactorUINode.prototype);
    Object.assign(window, {
        _uiNode: node, _uiEnabled: true, _uiFocused: false, _uiPressed: false, _uiLayoutX: 100, _uiLayoutY: 50,
        x: 100, y: 50, width: 200, height: 40, rotation: 0, scale: { x: 1, y: 1 },
        pivot: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } }
    });
    window.syncVisualState();
    assert.deepEqual([window.pivot.x, window.pivot.y, window.x, window.y], [100, 20, 200, 70]);
    assert.ok(Math.abs(window.rotation - Math.PI / 6) < 1e-9);
    window.syncVisualState();
    assert.deepEqual([window.x, window.y], [200, 70], 'syncing again does not drift');
    node.angle = 0;
    window.syncVisualState();
    assert.deepEqual([window.pivot.x, window.pivot.y, window.x, window.y, window.rotation], [0, 0, 100, 50, 0]);

    // Built before the layout corner is recorded: the corner read back excludes the turn.
    const fresh = Object.create(sandbox.Window_ReactorUINode.prototype);
    Object.assign(fresh, {
        _uiNode: sandbox.ReactorUI.normalizeNode({ type: 'box', fill: 'none', angle: 90 }), _uiEnabled: true,
        x: 10, y: 20, width: 60, height: 30, rotation: 0, scale: { x: 2, y: 2 },
        pivot: { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } }
    });
    fresh.syncVisualState();
    assert.deepEqual([fresh.x, fresh.y], [70, 50], 'a fitted record turns about its scaled center');
    assert.deepEqual([fresh.x - fresh._uiTurnX, fresh.y - fresh._uiTurnY], [10, 20]);
    assert.match(runtimeSource, /window\._uiLayoutX = window\.x - \(window\._uiTurnX \|\| 0\)/);
});

test('the editor saves an Angle only where it turns a node', () => {
    const editor = editorWith();
    const record = editor.normalizeInterface({ id: 1, mode: 'scene', nodes: [
        { id: 1, type: 'button', angle: 35 }, { id: 2, type: 'button', angle: 0 }, { id: 3, type: 'list', angle: 20 }, { id: 4, type: 'image', angle: -999 }] });
    assert.deepEqual(record.nodes.map(node => node.angle), [35, undefined, undefined, -180]);
    assert.equal('angle' in record.nodes[1], false, 'an unturned node saves as before');
});

test('the canvas picks, and resizes, a turned node in its own frame', () => {
    const editor = editorWith();
    editor.current = editor.normalizeInterface({ id: 1, mode: 'scene', coordinateSpace: 'screen', design: { width: 800, height: 600 },
        nodes: [{ id: 1, type: 'button', x: 100, y: 100, width: 200, height: 40, angle: 90 }] });
    const node = editor.current.nodes[0];
    const rects = editor.rects();
    const rect = rects.get(1);
    // Turned a quarter, the button stands 40 wide and 200 tall about its center (200, 120).
    assert.equal(editor.nodeAt(rects, { x: 200, y: 200 }), node, 'inside the turned button');
    assert.equal(editor.nodeAt(rects, { x: 280, y: 120 }), null, 'where only the unturned button would be');
    assert.equal(editor.handleAt(rect, { x: 200, y: 20 }, node), 'w', 'the west handle turned to the top');
    assert.equal(editor.handleAt(rect, { x: 220, y: 20 }, node), 'nw');
    assert.equal(editor.handleAt(rect, { x: 200, y: 20 }), null, 'without the node the handle is not there');

    // Drag the east handle (turned to the bottom) 40 px further down: the west handle stays where it is.
    const drag = { handle: 'e', origin: { x: node.x, y: node.y, width: node.width, height: node.height }, rect };
    const west = rectNow => editor.turnedPoint(node, rectNow, { x: rectNow.x, y: rectNow.y + rectNow.height / 2 });
    const before = west(rect);
    editor.resizeTurned(node, drag, 0, 40, value => Math.round(value));
    assert.equal(node.width, 240);
    const after = west(editor.rects().get(1));
    assert.deepEqual([Math.round(after.x), Math.round(after.y)], [Math.round(before.x), Math.round(before.y)]);
});

test('a record laid out as a stock screen says the game still shows its own until it is used', () => {
    const records = [null, { id: 1, mode: 'scene', roles: ['title'], nodes: [] }, { id: 2, mode: 'scene', roles: ['title'], nodes: [] }];
    const editor = editorWith({}, records);
    editor.current = records[1];
    assert.equal(editor.unboundStockRole()[0], 'title');
    assert.match(editor.unboundNoticeMarkup(), /The game still shows its own Title Screen\./);
    assert.doesNotMatch(editor.unboundNoticeMarkup(), /<button/, 'Use As is the one place the screen is chosen');

    assert.equal(editor.setReplacementRole('title', true), true, 'Use As binds the role');
    assert.equal(editor.replacementSystem().reactorTitleInterfaceId, 1);
    assert.equal(editor.unboundStockRole(), null);
    assert.equal(editor.unboundNoticeMarkup(), '');

    editor.current = records[2];
    assert.equal(editor.unboundStockRole(), null, 'another record already replaces the title');
    editor.replacementSystem().reactorTitleInterfaceId = 9;
    assert.equal(editor.unboundStockRole()[0], 'title', 'a binding to a missing record replaces nothing');

    editor.current = { id: 3, mode: 'scene', roles: [], nodes: [] };
    assert.equal(editor.unboundStockRole(), null, 'an interface of its own, called by command, is not a stock screen');
    editor.current = { id: 4, mode: 'overlay', roles: ['menu'], nodes: [] };
    assert.equal(editor.unboundStockRole(), null, 'an overlay cannot replace a scene');
});

test('the stock title note names the control that binds it', () => {
    const Stock = require('../src/utils/StockInterfaces.js');
    assert.match(Stock.buildOne('title', {}).note, /in Use As/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'editor', 'src', 'utils', 'StockInterfaces.js'), 'utf8'), /System 1/);
});

test('a personal button in an interface with no party panel goes to the menu actor instead of buzzing', () => {
    const sandbox = runtime();
    const calls = [];
    sandbox.SoundManager.playBuzzer = () => calls.push('buzzer');
    sandbox.$gameParty.size = () => 2;
    sandbox.$gameSystem.isFormationEnabled = () => true;
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    Object.assign(scene, { _nodeWindows: [], _actorSelection: null, runAction: action => calls.push('run ' + action.scene), updateConditions() {} });
    scene.beginActorSelection(sandbox.ReactorUI.normalizeAction({ type: 'scene', scene: 'item', chooseActor: true }));
    assert.deepEqual(calls, ['run item']);
    assert.equal(scene._actorSelection, null);
    calls.length = 0;
    scene.beginActorSelection(sandbox.ReactorUI.normalizeAction({ type: 'formation' }));
    scene.beginActorSelection(sandbox.ReactorUI.normalizeAction({ type: 'scene', scene: 'item' }), { item: {} });
    assert.deepEqual(calls, ['buzzer', 'buzzer'], 'Formation and a target for an item still need a panel');
});

test('a meter or digit picture that fails to load redraws its part with the drawn fallback', async () => {
    const ui = runtime().ReactorUI;
    const listeners = [];
    let state = 'loading';
    const bitmap = { isReady: () => state === 'ready', isError: () => state === 'error', addLoadListener: fn => listeners.push(fn) };
    let redraws = 0;
    assert.equal(ui.whenReady(bitmap, () => redraws++), false);
    state = 'error';
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(redraws, 1, 'an error calls no load listener, so the part is told to redraw');
    assert.equal(ui.softFailed(bitmap), true);
    assert.equal(ui.softFailed({ isError: () => false, _degradedToBlank: true }), true, 'a blank stand-in for a missing file is not art');
});

test('a record with its own Close button gets no touch Back button over it', () => {
    const sandbox = runtime();
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._role = 'item';
    scene._interface = { nodes: [{ type: 'button', action: { type: 'close' } }] };
    assert.equal(scene.needsCancelButton(), false);
    scene._interface = { nodes: [{ type: 'button', action: { type: 'scene' } }] };
    assert.equal(scene.needsCancelButton(), true, 'with no Close button of its own, the touch Back button stays');
    scene._role = 'title';
    assert.equal(scene.needsCancelButton(), false);
});
