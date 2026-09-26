const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.join(repoRoot, 'editor');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

/**
 * Loads runtime/reactor_ui.js against stubs for the engine classes it
 * extends, so the data half (normalize, layout, conditions) is testable.
 */
function loadRuntimeUI({ argv = [], search = '' } = {}) {
    class Base { initialize() {} }
    const stub = () => { const C = function() {}; C.prototype = Object.create(Base.prototype); return C; };
    const sceneCalls = [];
    const SceneTitle = stub();
    const SceneMenu = stub();
    const SceneStatus = stub();
    const SceneGameEnd = stub();
    const SceneOptions = stub();
    const SceneSave = stub();
    const SceneLoad = stub();
    const SceneMenuBase = stub();
    SceneMenuBase.prototype.updateActor = function() { this._actor = this.__sandbox.$gameParty.menuActor(); };
    SceneMenuBase.prototype.onActorChange = function() {};
    SceneMenuBase.prototype.nextActor = function() { this.__sandbox.$gameParty.makeMenuActorNext(); this.updateActor(); this.onActorChange(); };
    SceneMenuBase.prototype.previousActor = function() { this.__sandbox.$gameParty.makeMenuActorPrevious(); this.updateActor(); this.onActorChange(); };
    const sandbox = {
        console,
        location: { search },
        nw: { App: { argv } },
        process: { platform: 'linux' },
        require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true },
        Window_Base: stub(),
        Window_Selectable: stub(),
        Scene_MenuBase: SceneMenuBase,
        Scene_Boot: stub(),
        Scene_Map: stub(),
        Scene_Title: SceneTitle,
        Scene_Menu: SceneMenu,
        Scene_Status: SceneStatus,
        Scene_GameEnd: SceneGameEnd,
        Scene_Options: SceneOptions,
        Scene_Save: SceneSave,
        Scene_Load: SceneLoad,
        DataManager: { isTitleSkip: () => false },
        ConfigManager: { alwaysDash: false, commandRemember: false, touchUI: true, bgmVolume: 100, bgsVolume: 100, meVolume: 100, seVolume: 100, save() {} },
        PluginManager: { _commands: {}, registerCommand(plugin, name, fn) { this._commands[plugin + ':' + name] = fn; } },
        SceneManager: {
            _stack: [], _scene: null,
            push(scene) { sceneCalls.push(['push', scene]); },
            goto(scene) { sceneCalls.push(['goto', scene]); },
            prepareNextScene(...args) { sceneCalls.push(['prepare', ...args]); }
        },
        $dataSystem: { variables: [], versionId: 1, reactorTitleInterfaceId: 0, reactorMenuInterfaceId: 0, reactorStatusInterfaceId: 0,
            reactorGameEndInterfaceId: 0, reactorOptionsInterfaceId: 0, reactorSaveInterfaceId: 0, reactorLoadInterfaceId: 0 },
        $gameSystem: { savefileId: () => 1, setSavefileId() {}, onBeforeSave() {}, onAfterLoad() {}, versionId: () => 1 },
        $gameMap: { mapId: () => 1 },
        $gamePlayer: { x: 0, y: 0, direction: () => 2, reserveTransfer() {}, requestMapReload() {} },
        $gameSwitches: { value: id => id === 7 },
        $gameVariables: { _values: {}, value(id) { return id === 3 ? 42 : this._values[id] || 0; }, setValue(id, value) { this._values[id] = value; } },
        $gameActors: { actor: () => null },
        $gameParty: { members: () => [], allItems: () => [], inBattle: () => false, menuActor: () => null },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    SceneMenuBase.prototype.__sandbox = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('runtime/reactor_ui.js'), sandbox);
    sandbox.__sceneCalls = sceneCalls;
    return sandbox;
}

test('reactor_ui.js boots after the windows and before MV compatibility and plugins', () => {
    const main = read('runtime/reactor_main.js');
    const order = ['js/reactor_windows.js', 'js/reactor_ui.js', 'js/reactor_mv_compat.js', 'js/reactor_plugins.js']
        .map(name => main.indexOf(`"${name}"`));
    assert.ok(order.every(index => index >= 0), 'every script is in the manifest');
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(read('template/Demo/js/reactor_ui.js'), read('runtime/reactor_ui.js'), 'the Demo carries the same file');
});

test('the runtime registers the Call User Interface plugin command and loads the file optionally', () => {
    const source = read('runtime/reactor_ui.js');
    assert.match(source, /PluginManager\.registerCommand\(this\.PLUGIN_NAME, this\.COMMAND_NAME/);
    assert.match(source, /ReactorUI\.PLUGIN_NAME = "RPGReactor"/);
    assert.match(source, /ReactorUI\.COMMAND_NAME = "CallUserInterface"/);
    // Never a DataManager database file: a missing one would stall boot.
    assert.doesNotMatch(read('runtime/reactor_managers.js'), /UserInterfaces\.json/);
    assert.match(source, /fs\.existsSync\(full\)/);
    const sandbox = loadRuntimeUI();
    assert.equal(typeof sandbox.PluginManager._commands['RPGReactor:CallUserInterface'], 'function');
    assert.equal(sandbox.ReactorUI.isReady(), true);
    assert.equal(JSON.stringify(sandbox.$dataUserInterfaces), '[]');
});

test('records normalize to the whole shape and clamp what the editor could not have written', () => {
    const { ReactorUI } = loadRuntimeUI();
    const record = ReactorUI.normalizeInterface({
        id: 3, name: 'Menu', background: 'sparkle', cancel: { type: 'callInterface', id: 2 },
        nodes: [
            { id: 1, type: 'box', fill: 'gradient', fillOpacity: 999, radius: -5, color: 'red' },
            { id: 1, type: 'text', text: 'dup' },
            { id: 2, type: 'button', anchor: 'nowhere', action: { type: 'variable', id: 4, op: 'add', value: '5', andClose: 1 }, textColor: 40 },
            { id: 5, type: 'image', source: 'face', file: 'Actor1', index: 2, fit: 'contain' }
        ]
    });
    assert.equal(record.background, 'blur');
    assert.equal(record.cancel.type + ':' + record.cancel.id, 'callInterface:2');
    assert.equal(JSON.stringify(record.nodes.map(node => node.id)), '[1,2,5]', 'a duplicate id is dropped');
    const box = record.nodes[0];
    assert.equal([box.fillOpacity, box.radius, box.color].join(), '255,0,#000000');
    const button = record.nodes[1];
    assert.equal([button.anchor, button.textColor, button.action.op, button.action.value, button.action.andClose].join(),
        'topLeft,31,add,5,true');
    assert.equal(record.nodes[2].source, 'face');
    assert.equal(ReactorUI.normalizeNode({ type: 'text' }).fill, 'none');
});

test('anchored layout resolves against the parent the same way for every anchor', () => {
    const { ReactorUI } = loadRuntimeUI();
    const parent = { x: 100, y: 50, width: 400, height: 200 };
    const rect = (anchor, x = 0, y = 0) => ReactorUI.resolveRect({ anchor, x, y, width: 40, height: 20 }, parent);
    assert.equal([rect('topLeft').x, rect('topLeft').y].join(), '100,50');
    assert.equal([rect('center').x, rect('center').y].join(), '280,140');
    assert.equal([rect('bottomRight', -8, -4).x, rect('bottomRight', -8, -4).y].join(), '452,226');
    const measured = ReactorUI.resolveRect({ anchor: 'top', x: 0, y: 10, width: 0, height: 0 }, parent, { width: 60, height: 30 });
    assert.equal([measured.x, measured.y, measured.width, measured.height].join(), '270,60,60,30');
});

test('interfaces use physical screen pixels and legacy UI-area records preserve their rendered position', () => {
    const sandbox = loadRuntimeUI();
    sandbox.Graphics = { width: 1280, height: 720, boxWidth: 1264, boxHeight: 704 };
    const { ReactorUI } = sandbox;
    assert.deepEqual(JSON.parse(JSON.stringify(ReactorUI.screenMetrics())), {
        width: 1280, height: 720, boxWidth: 1264, boxHeight: 704, boxX: 8, boxY: 8
    });
    const legacy = ReactorUI.normalizeInterface({
        nodes: [
            { id: 1, type: 'box', anchor: 'topLeft', x: 0, y: 0, width: 100, height: 40 },
            { id: 2, type: 'box', anchor: 'bottomRight', x: 0, y: 0, width: 100, height: 40 }
        ]
    });
    assert.equal(legacy.coordinateSpace, 'screen');
    assert.equal(JSON.stringify(legacy.nodes.map(node => [node.x, node.y])), '[[8,8],[-8,-8]]', 'legacy UI-area roots keep their old physical locations');
    const authored = ReactorUI.normalizeInterface({ coordinateSpace: 'screen', nodes: [{ id: 1, type: 'box', x: 8, y: 8 }] });
    assert.deepEqual([authored.nodes[0].x, authored.nodes[0].y], [8, 8], 'screen records are not migrated again');
    const local = ReactorUI.windowRect(new sandbox.Rectangle(8, 8, 240, 60), { _windowLayer: { x: 8, y: 8 } });
    assert.deepEqual([local.x, local.y, local.width, local.height], [0, 0, 240, 60], 'WindowLayer origin is removed exactly once');

    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const editor = new Editor({ data: { system: { advanced: { screenWidth: 1280, screenHeight: 720, uiAreaWidth: 1264, uiAreaHeight: 704 } } } });
    assert.deepEqual(editor.screenSize(), { width: 1280, height: 720 }, 'the canvas is the physical screen');
    const record = editor.normalizeInterface({ nodes: [{ id: 1, type: 'box', x: 0, y: 0, width: 10, height: 10 }] });
    assert.deepEqual([record.coordinateSpace, record.nodes[0].x, record.nodes[0].y], ['screen', 8, 8]);
});

test('conditions read switches and variables, and scripts that throw read as false', () => {
    const sandbox = loadRuntimeUI();
    const { ReactorUI } = sandbox;
    sandbox.DataManager.isAnySavefileExists = () => true;
    const evaluate = raw => ReactorUI.evaluateCondition(ReactorUI.normalizeCondition(raw), null);
    assert.equal(evaluate({ type: 'always' }), true);
    assert.equal(evaluate({ type: 'saveExists' }), true);
    assert.equal(evaluate({ type: 'switch', id: 7, on: true }), true);
    assert.equal(evaluate({ type: 'switch', id: 7, on: false }), false);
    assert.equal(evaluate({ type: 'variable', id: 3, op: '>=', value: 42 }), true);
    assert.equal(evaluate({ type: 'variable', id: 3, op: '<', value: 42 }), false);
    assert.equal(evaluate({ type: 'script', script: 'return 1 + 1 === 2;' }), true);
    assert.equal(evaluate({ type: 'script', script: 'throw new Error("no");' }), false);
});

test('the boot option opens an interface from the query string or the launch line', () => {
    assert.equal(loadRuntimeUI({ search: '?test&rrui=4' }).ReactorUI.bootInterfaceId(), 4);
    assert.equal(loadRuntimeUI({ argv: ['--user-data-dir=/x', 'test&rrui=9'] }).ReactorUI.bootInterfaceId(), 9);
    assert.equal(loadRuntimeUI({ argv: ['test'] }).ReactorUI.bootInterfaceId(), 0);
});

test('Playtest Interface is a preview: black screen, no map, and closing the last interface ends the playtest', () => {
    const sandbox = loadRuntimeUI({ search: '?test&rrui=4' });
    const calls = [];
    sandbox.Scene_Base = { prototype: { start() { calls.push('base-start'); } } };
    sandbox.SoundManager = { preloadImportantSounds() { calls.push('sounds'); } };
    sandbox.AudioManager = { stopAll() { calls.push('audio-stop'); } };
    sandbox.DataManager.isBattleTest = () => false;
    sandbox.DataManager.isEventTest = () => false;
    sandbox.DataManager.setupNewGame = () => calls.push('new-game');
    sandbox.SceneManager.goto = scene => calls.push('goto:' + (scene ? scene.name : 'null'));
    sandbox.SceneManager.prepareNextScene = id => calls.push('prepare:' + id);
    sandbox.SceneManager.exit = () => calls.push('exit');
    sandbox.ScreenSprite = class { setBlack() { this.black = true; } };
    const boot = new sandbox.Scene_Boot();
    boot.resizeScreen = () => calls.push('resize');
    boot.updateDocumentTitle = () => {};
    boot.start();
    assert.deepEqual(calls, ['base-start', 'sounds', 'new-game', 'goto:Scene_ReactorUI', 'prepare:4', 'resize'],
        'the preview skips the title and the map entirely');
    assert.equal(sandbox.ReactorUI.isPreview(), true);

    const scene = new sandbox.Scene_ReactorUI();
    scene._interface = { background: 'blur' };
    const children = [];
    scene.addChild = child => children.push(child);
    scene.createBackground();
    assert.equal(children.length === 1 && children[0].black && children[0].opacity === 255, true, 'a preview background is plain black whatever the record says');

    calls.length = 0;
    scene.popScene = () => calls.push('pop');
    sandbox.SceneManager._stack = [sandbox.Scene_ReactorUI];
    scene.close();
    assert.deepEqual(calls, ['pop'], 'a sub-interface pops back to its caller');
    sandbox.SceneManager._stack = [];
    scene.close();
    assert.deepEqual(calls, ['pop', 'audio-stop', 'exit'], 'the root interface ends the playtest instead of continuing into the game');
    assert.equal(sandbox.ReactorUI.isPreview(), false);

    const source = read('runtime/reactor_ui.js');
    assert.doesNotMatch(source, /Scene_Map\.prototype\.start = function/, 'the preview no longer rides the map scene');
    assert.doesNotMatch(source, /DataManager\.isTitleSkip = function/);
    assert.match(source, /if \(ReactorUI\.isPreview\(\)\) ReactorUI\.endPreview\(\);\s*else SceneManager\.goto\(sceneClass\);/, 'the title action also ends a preview');
});

test('Fit text to size shrinks the font on both sides until the label fits, never below the shared floor', () => {
    const { ReactorUI, Window_ReactorUINode } = loadRuntimeUI();
    assert.equal(ReactorUI.normalizeNode({ type: 'text', fitText: 1 }).fitText, true);
    assert.equal(ReactorUI.normalizeNode({ type: 'button' }).fitText, false);
    assert.equal(ReactorUI.MIN_FONT_SIZE, 8);
    // A window whose measured text is proportional to the font scale: 400px wide at scale 1.
    const window = Object.create(Window_ReactorUINode.prototype);
    window.padding = 0;
    window.labelText = () => 'label';
    window.textSizeEx = function() { return { width: 400 * this._uiFontScale, height: 36 * this._uiFontScale }; };
    window._uiNode = { fitText: true, width: 200, height: 0, fontSize: 26 };
    const scale = window.applyFit();
    assert.ok(scale <= 0.5 && scale > 0.49, 'the width fits at half size: ' + scale);
    window._uiNode = { fitText: true, width: 0, height: 18, fontSize: 26 };
    assert.ok(window.applyFit() <= 0.5, 'a height-only node fits its height');
    window._uiNode = { fitText: false, width: 100, height: 10, fontSize: 26 };
    assert.equal(window.applyFit(), 1, 'off means the text draws at its size');
    window._uiNode = { fitText: true, width: 1, height: 1, fontSize: 26 };
    assert.ok(window.applyFit() >= 8 / 26 - 1e-9, 'the floor holds at the minimum font size');
    const runtime = read('runtime/reactor_ui.js');
    assert.match(runtime, /Window_ReactorUINode\.prototype\.drawLabel = function\(\) \{\s*const node = this\._uiNode;\s*this\.applyFit\(\);/);
    assert.match(runtime, /Window_ReactorUINode\.prototype\.measure = function\(\) \{\s*this\.applyFit\(\);/);
    assert.match(runtime, /size = Math\.max\(ReactorUI\.MIN_FONT_SIZE, Math\.round\(size \* this\._uiFontScale\)\)/);

    const editor = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    assert.match(editor, /static get MIN_FONT_SIZE\(\) \{ return 8; \}/);
    assert.match(editor, /wrap: false, fitText: false \}\);/, 'text nodes default fit off');
    assert.match(editor, /outline: true, fitText: false,/, 'button nodes default fit off');
    assert.match(editor, /this\.checkControl\('p-fitText', node\.fitText, tt\('Fit text to size'\)\)/);
    assert.match(editor, /node\.fitText = !!\(q\('p-fitText'\) && q\('p-fitText'\)\.checked\);/);
    assert.match(editor, /parseText\(node, scale = 1\)/);
    assert.match(editor, /return this\.measureRuns\(this\.layoutText\(node\)\);/, 'auto-size measures the fitted lines');
    assert.match(editor, /const lines = this\.layoutText\(node\);/, 'the canvas draws the fitted lines');
});

test('auto-sized dynamic Text asks the scene to remeasure and reposition when resolved text changes', () => {
    const sandbox = loadRuntimeUI();
    sandbox.Window_Base.prototype.update = function() {};
    const window = Object.create(sandbox.Window_ReactorUINode.prototype);
    let resolved = 'short';
    let layouts = 0;
    let refreshes = 0;
    window._uiNode = { type: 'text', width: 0, height: 0 };
    window._uiLastText = 'old';
    window._uiScene = { refreshNodeLayouts() { layouts++; } };
    window.currentText = () => resolved;
    window.refresh = () => { refreshes++; window._uiLastText = resolved; };
    window.update();
    assert.deepEqual([layouts, refreshes], [1, 1]);
    window.update();
    assert.deepEqual([layouts, refreshes], [1, 1], 'unchanged resolved content does no layout work');
    resolved = 'a much longer value';
    window.update();
    assert.deepEqual([layouts, refreshes], [2, 2]);

    sandbox.Graphics = { width: 400, height: 200, boxWidth: 400, boxHeight: 200 };
    const node = sandbox.ReactorUI.normalizeNode({ id: 1, type: 'text', anchor: 'center', width: 0, height: 0 });
    const moved = { x: 175, y: 90, width: 50, height: 20, node: () => node, move(x, y, width, height) { Object.assign(this, { x, y, width, height }); }, refresh() {} };
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._interface = { nodes: [node] };
    scene._nodeWindows = [moved];
    scene._windowLayer = { x: 0, y: 0 };
    scene.measureText = () => ({ width: 150, height: 20 });
    scene.refreshNodeLayouts();
    assert.deepEqual([moved.x, moved.y, moved.width, moved.height], [125, 90, 150, 20], 'a centered auto-sized node is repositioned around the same anchor');
});

test('the editor owns UserInterfaces.json as a database file that older projects may lack', () => {
    const manager = read('editor/src/DatabaseManager.js');
    assert.match(manager, /\['userInterfaces', 'UserInterfaces\.json'\]/);
    assert.match(manager, /loaded\.userInterfaces = \[null, \.\.\.stock\]/, 'an absent file reads as the null slot plus the stock baselines');
    assert.match(manager, /key === 'userInterfaces' && !this\.hasUserInterfaces\(\)/, 'no file is written for a project without interfaces');
    assert.match(read('editor/src/utils/DataLimits.js'), /userInterfaces: 9999/);
    assert.match(read('editor/src/ProjectManager.js'), /'UserInterfaces\.json': \[null\]/);
    assert.deepEqual(JSON.parse(read('template/Demo/data/UserInterfaces.json'))[0], null);
});

test('the database tab, template, and detail editor are registered', () => {
    const ui = read('editor/src/DatabaseEditorUI.js');
    assert.match(ui, /\{ name: 'User Interfaces', type: 'userInterfaces' \}/);
    assert.match(ui, /case 'userInterfaces':\s*data = this\.databaseManager\.getUserInterfaces\(\);/);
    assert.match(ui, /type === 'userInterfaces'\)\s*\{\s*this\.userInterfaceEditor\.showUserInterfaceDetail\(detailEl, entry\)/);
    assert.match(ui, /userInterfaces: \{ name: 'New Interface',[\s\S]*?coordinateSpace: 'screen', nodes: \[\], note: '' \}/);
    const html = read('editor/index.html');
    assert.ok(html.indexOf('src/database/DatabaseUserInterfaceEditor.js') < html.indexOf('src/DatabaseEditorUI.js'));
    assert.match(html, /data-db="userInterfaces" data-i18n="menu\.userInterfaces"/);
    assert.match(read('editor/src/UIManager.js'), /openDatabase\('userInterfaces'\)/);
    assert.match(read('editor/src/I18nManager.js'), /userInterfaces: 'menu\.userInterfaces'/);
});

test('the editor and runtime agree on anchors, node types, and action types', () => {
    const editorSource = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    const runtimeSource = read('runtime/reactor_ui.js');
    const anchorsIn = source => (source.match(/(topLeft|topRight|bottomLeft|bottomRight|center|top|bottom|left|right): \[/g) || []).map(m => m.split(':')[0]).sort();
    assert.deepEqual(anchorsIn(editorSource), anchorsIn(runtimeSource));
    for (const action of ['none', 'scene', 'setMenuActor', 'personalSkill', 'titleNewGame', 'gameEndToTitle', 'nextMenuActor']) {
        assert.ok(runtimeSource.includes(`"${action}"`), `runtime action ${action}`);
        assert.ok(editorSource.includes(`'${action}'`), `editor action ${action}`);
    }
    assert.match(runtimeSource, /NODE_TYPES = \["box", "image", "text", "button", "list", "gauge", "input", "battleWindow", "battleCursor"\]/);
    assert.match(editorSource, /NODE_TYPES\(\) \{ return \['box', 'image', 'text', 'button', 'list', 'gauge', 'input', 'battleWindow', 'battleCursor'\]; \}/);
    assert.match(runtimeSource, /IMAGE_SOURCES = \["picture", "system", "face", "character", "icon", "partyFace", "title1", "title2"\]/);
    assert.match(editorSource, /IMAGE_SOURCES\(\) \{ return \['picture', 'system', 'face', 'character', 'icon', 'partyFace', 'title1', 'title2'\]; \}/);
    assert.match(runtimeSource, /GAUGE_KINDS = \["hp", "mp", "tp", "exp"/);
    assert.match(editorSource, /GAUGE_KINDS\(\) \{ return \['hp', 'mp', 'tp', 'exp'/);
});

test('a gauge node normalizes to a party gauge by default and keeps its variable binding', () => {
    const { ReactorUI } = loadRuntimeUI();
    const gauge = ReactorUI.normalizeNode({ type: 'gauge' });
    assert.equal(gauge.fill, 'none');
    assert.deepEqual([gauge.gauge, gauge.index, gauge.variableId, gauge.max, gauge.label, gauge.showLabel, gauge.showValue], ['hp', 0, 1, 100, '', true, true]);
    const variable = ReactorUI.normalizeNode({ type: 'gauge', gauge: 'variable', variableId: 7, max: 50, label: 'Heat', showLabel: false, showValue: false });
    assert.deepEqual([variable.gauge, variable.variableId, variable.max, variable.label, variable.showLabel, variable.showValue], ['variable', 7, 50, 'Heat', false, false]);
    assert.equal(ReactorUI.normalizeNode({ type: 'gauge', gauge: 'xp' }).gauge, 'hp');
    assert.equal(ReactorUI.normalizeNode({ type: 'image', source: 'title1' }).source, 'title1');
    // The editor's default agrees with the runtime's on every gauge field.
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const fromEditor = Editor.defaultNode('gauge', 1);
    for (const key of ['gauge', 'index', 'variableId', 'max', 'label', 'showLabel', 'showValue', 'fill']) assert.equal(fromEditor[key], gauge[key], key);
    assert.deepEqual([fromEditor.width, fromEditor.height], [128, 24]);
});

test('party faces and gauges rebind to their current slot member and custom TP remains valid outside battle', () => {
    const sandbox = loadRuntimeUI();
    sandbox.Window_Base.prototype.update = function() {};
    const actor = (id, face, index) => ({ actorId: () => id, faceName: () => face, faceIndex: () => index });
    const a = actor(1, 'Actor1', 0);
    const b = actor(2, 'Actor2', 3);
    let members = [a, b];
    sandbox.$gameParty.members = () => members;

    const face = Object.create(sandbox.Window_ReactorUINode.prototype);
    face._uiNode = { type: 'image', source: 'partyFace', index: 0 };
    face._uiPartyFaceKey = '1|Actor1|0';
    face.requestBitmap = function() {
        const member = sandbox.ReactorUI.partyMember(0);
        this._uiPartyFaceKey = [member.actorId(), member.faceName(), member.faceIndex()].join('|');
        this.requested = member;
    };
    face.refresh = () => { face.refreshed = true; };

    const setups = [];
    const gauge = Object.create(sandbox.Window_ReactorUINode.prototype);
    gauge._uiNode = { type: 'gauge', gauge: 'hp', index: 0 };
    gauge._uiGauge = { setup(member, kind) { setups.push([member, kind]); } };
    gauge._uiGaugeBattler = a;
    members = [b, a];
    face.update();
    gauge.update();
    assert.equal(face.requested, b);
    assert.equal(face.refreshed, true);
    assert.deepEqual(setups, [[b, 'hp']]);

    function SpriteGauge() {}
    SpriteGauge.prototype.initialize = function() {};
    SpriteGauge.prototype.isValid = function() { return false; };
    sandbox.Sprite_Gauge = SpriteGauge;
    const GaugeClass = sandbox.ReactorUI.gaugeSpriteClass();
    const tp = Object.create(GaugeClass.prototype);
    tp._uiNode = { gauge: 'tp' };
    tp._statusType = 'tp';
    tp._battler = b;
    assert.equal(tp.isValid(), true);
    tp._battler = null;
    assert.equal(tp.isValid(), false);
});

test('List nodes normalize every fixed source and literal row without changing the database envelope', () => {
    const { ReactorUI } = loadRuntimeUI();
    const list = ReactorUI.normalizeNode({
        type: 'list', dataSource: 'literal', items: ['Alpha', { id: 'key', value: 9, text: 'Nine', enabled: false }],
        rowHeight: 2, category: 'bad', selectionVariableId: -4, selectionValue: 'bad'
    });
    assert.equal(list.type, 'list');
    assert.deepEqual([list.dataSource, list.category, list.rowHeight, list.selectionVariableId, list.selectionValue], ['literal', 'all', 24, 0, 'id']);
    assert.equal(JSON.stringify(list.items), JSON.stringify([
        { id: 1, value: 'Alpha', text: 'Alpha', enabled: true },
        { id: 'key', value: 9, text: 'Nine', enabled: false }
    ]));
    for (const source of ['party', 'inventory', 'skills', 'saveSlots', 'variableRange', 'literal']) {
        assert.equal(ReactorUI.normalizeNode({ type: 'list', dataSource: source }).dataSource, source);
    }
    const record = ReactorUI.normalizeInterface({ id: 1, mode: 'overlay', visible: { type: 'switch', id: 7 }, nodes: [{ id: 1, type: 'list' }] });
    assert.deepEqual([record.mode, record.visible.type, record.visible.id, record.nodes[0].type], ['overlay', 'switch', 7, 'list']);

    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const fromEditor = Editor.defaultNode('list', 1);
    assert.deepEqual([fromEditor.dataSource, fromEditor.rowHeight, fromEditor.selectionVariableId, fromEditor.selectionValue], ['literal', 36, 0, 'id']);
    const text = Editor.literalItemsText(Editor.parseLiteralItems('hero|17|Hero\n2|two|Second|disabled'));
    assert.equal(text, 'hero|17|Hero\n2|two|Second|disabled');
});

test('fixed List sources produce useful id, value, label, count, and enabled data', () => {
    const sandbox = loadRuntimeUI();
    const actor1 = { actorId: () => 3, name: () => 'Alicia', skills: () => [{ id: 8, name: 'Fire', iconIndex: 64, stypeId: 1 }], canUse: () => false };
    const actor2 = { actorId: () => 4, name: () => 'Bran' };
    const potion = { id: 1, name: 'Potion', iconIndex: 10, itypeId: 1, kind: 'item' };
    const key = { id: 2, name: 'Key', iconIndex: 11, itypeId: 2, kind: 'item' };
    const sword = { id: 1, name: 'Sword', iconIndex: 20, kind: 'weapon' };
    sandbox.$gameParty.members = () => [actor1, actor2];
    sandbox.$gameParty.allItems = () => [potion, key, sword];
    sandbox.$gameParty.numItems = item => item === potion ? 5 : 1;
    sandbox.$gameActors.actor = id => id === 3 ? actor1 : null;
    sandbox.DataManager.isItem = item => item.kind === 'item';
    sandbox.DataManager.isWeapon = item => item.kind === 'weapon';
    sandbox.DataManager.isArmor = () => false;
    sandbox.DataManager.maxSavefiles = () => 3;
    sandbox.DataManager.savefileInfo = id => id === 1 ? { playtime: '01:02:03' } : null;
    sandbox.TextManager = { autosave: 'Autosave', file: 'File' };
    sandbox.$dataSystem.variables[5] = 'Score';
    sandbox.$gameVariables._values[5] = 99;
    const rows = node => sandbox.ReactorUI.listRows(sandbox.ReactorUI.normalizeNode(Object.assign({ type: 'list' }, node)));
    assert.equal(JSON.stringify(rows({ dataSource: 'party' }).map(row => [row.id, row.text])), '[[3,"Alicia"],[4,"Bran"]]');
    assert.equal(rows({ dataSource: 'inventory', category: 'item' })[0].text, '\\I[10]Potion  x5');
    assert.equal(rows({ dataSource: 'inventory', category: 'keyItem' })[0].name, 'Key');
    assert.equal(rows({ dataSource: 'skills', actorMode: 'actor', actorId: 3 })[0].enabled, false);
    assert.equal(JSON.stringify(rows({ dataSource: 'saveSlots' }).map(row => [row.id, row.playtime])), '[[1,"01:02:03"],[2,""]]');
    assert.equal(rows({ dataSource: 'variableRange', rangeStart: 5, rangeEnd: 5 })[0].text, 'Score: 99');
    assert.equal(rows({ dataSource: 'literal', rowText: '{index}. {name}={value}', items: [{ id: 'a', value: 7, text: 'Choice' }] })[0].text, '1. Choice=7');
});

test('List confirmation stores the configured row id or value before its action', () => {
    const sandbox = loadRuntimeUI();
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    const order = [];
    scene.canFocus = () => true;
    scene.focusedWindow = () => null;
    scene.runAction = () => order.push(['action', sandbox.$gameVariables.value(12)]);
    const node = sandbox.ReactorUI.normalizeNode({ type: 'list', selectionVariableId: 12, selectionValue: 'value', action: { type: 'switch', id: 1 } });
    const window = { node: () => node, isEnabled: () => true, isCurrentItemEnabled: () => true, selectedRow: () => ({ id: 5, value: 'chosen' }) };
    scene.activateWindow(window);
    assert.deepEqual(order, [['action', 'chosen']]);
});

test('List input uses the engine selectable window for keyboard, gamepad, mouse, and touch', () => {
    const runtime = read('runtime/reactor_ui.js');
    assert.match(runtime, /Window_ReactorUIList\.prototype = Object\.create\(Window_Selectable\.prototype\)/);
    assert.match(runtime, /this\.setHandler\("ok", \(\) => this\._uiScene\.activateWindow\(this\)\)/);
    assert.match(runtime, /this\.setHandler\("cancel", \(\) => this\._uiScene\.cancelInterface\(true\)\)/);
    assert.match(runtime, /Window_Selectable\.prototype\.update\.call\(this\)/, 'Input and TouchInput stay in the engine implementation');
    assert.match(runtime, /window\.node\(\)\.type !== "list" && TouchInput\.isTriggered\(\)/, 'the scene does not double-handle List touches');
    assert.match(runtime, /direction === "down" \|\| direction === "up"/, 'vertical input stays in the focused scrolling list');
});

test('List no-fill painting and custom sounds do not stack with Window_Selectable defaults', () => {
    const sandbox = loadRuntimeUI();
    let stockBackgrounds = 0;
    sandbox.Window_Selectable.prototype.drawItemBackground = () => { stockBackgrounds++; };
    const fills = [];
    const list = Object.create(sandbox.Window_ReactorUIList.prototype);
    list._uiNode = { fill: 'none', highlightColor: '#ffffff', se: { name: 'Choice' } };
    list._uiFocused = true;
    list.index = () => 0;
    list.itemRect = () => ({ x: 0, y: 0, width: 100, height: 36 });
    list.contentsBack = { fillRect(...args) { fills.push(args); } };
    list.drawItemBackground(0);
    assert.deepEqual([stockBackgrounds, fills.length], [0, 1], 'transparent lists draw only their configured highlight');
    list._uiNode.fill = 'window';
    list.drawItemBackground(1);
    assert.equal(stockBackgrounds, 1, 'skin-filled lists retain the stock row background');

    let ok = 0;
    sandbox.SoundManager = { playOk() { ok++; } };
    list.playOkSound();
    assert.equal(ok, 0, 'a custom List SE suppresses the stock OK sound');
    list._uiNode.se = null;
    list.playOkSound();
    assert.equal(ok, 1, 'the default List sound still plays once');

    let cancel = 0;
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._interface = { cancel: { type: 'none' } };
    scene._nodeWindows = [];
    scene.runAction = () => {};
    sandbox.SoundManager.playCancel = () => { cancel++; };
    scene.cancelInterface(true);
    assert.equal(cancel, 0, 'Window_Selectable already played the List cancel sound');
    scene.cancelInterface(false);
    assert.equal(cancel, 1);

    let sceneActivations = 0;
    scene._focusIndex = 0;
    scene._nodeWindows = [{ node: () => ({ type: 'list' }) }];
    scene.activateFocused = () => { sceneActivations++; };
    sandbox.Input = { isTriggered: key => key === 'ok', isRepeated: () => false };
    sandbox.TouchInput = { isCancelled: () => false };
    scene.updateInput();
    assert.equal(sceneActivations, 0, 'the scene does not process a List OK trigger a second time');
});

test('System bindings route matching scene records and reject zero, missing, overlay, mismatched, and invalid records', () => {
    const sandbox = loadRuntimeUI();
    sandbox.$dataUserInterfaces = [null,
        { id: 1, name: 'Scene', mode: 'scene', roles: ['title', 'menu', 'status', 'gameEnd'], nodes: [] },
        { id: 2, name: 'HUD', mode: 'overlay', nodes: [] },
        { id: 99, name: 'Wrong id', mode: 'scene', nodes: [] },
        'not a record'];
    sandbox.$dataSystem.reactorTitleInterfaceId = 1;
    sandbox.$dataSystem.reactorMenuInterfaceId = 1;
    sandbox.$dataSystem.reactorStatusInterfaceId = 1;
    sandbox.$dataSystem.reactorGameEndInterfaceId = 1;
    sandbox.SceneManager.goto(sandbox.Scene_Title);
    sandbox.SceneManager.push(sandbox.Scene_Menu);
    sandbox.SceneManager.push(sandbox.Scene_Status);
    sandbox.SceneManager.push(sandbox.Scene_GameEnd);
    assert.deepEqual(sandbox.__sceneCalls.map(call => call[0] === 'prepare' ? call.slice(1) : [call[0], call[1] === sandbox.Scene_ReactorUI]), [
        ['goto', true], [1, 'title'], ['push', true], [1, 'menu'],
        ['push', true], [1, 'status'], ['push', true], [1, 'gameEnd']
    ]);

    sandbox.__sceneCalls.length = 0;
    sandbox.$dataSystem.reactorTitleInterfaceId = 2;
    sandbox.$dataSystem.reactorMenuInterfaceId = 0;
    sandbox.$dataSystem.reactorStatusInterfaceId = 3;
    sandbox.$dataSystem.reactorGameEndInterfaceId = 4;
    sandbox.SceneManager.goto(sandbox.Scene_Title);
    sandbox.SceneManager.push(sandbox.Scene_Menu);
    sandbox.SceneManager.push(sandbox.Scene_Status);
    sandbox.SceneManager.push(sandbox.Scene_GameEnd);
    assert.equal(sandbox.__sceneCalls[0][1], sandbox.Scene_Title);
    assert.equal(sandbox.__sceneCalls[1][1], sandbox.Scene_Menu);
    assert.equal(sandbox.__sceneCalls[2][1], sandbox.Scene_Status);
    assert.equal(sandbox.__sceneCalls[3][1], sandbox.Scene_GameEnd);
});

test('scene routing reinstalls around plugin replacements without recursion and preserves plugin calls', () => {
    const sandbox = loadRuntimeUI();
    sandbox.$dataUserInterfaces = [null, { id: 1, mode: 'scene', roles: ['title', 'status'], nodes: [] }];
    sandbox.$dataSystem.reactorTitleInterfaceId = 1;
    sandbox.$dataSystem.reactorStatusInterfaceId = 1;
    const previousGoto = sandbox.SceneManager.goto;
    const previousPush = sandbox.SceneManager.push;
    const pluginCalls = [];
    sandbox.SceneManager.goto = function(sceneClass) {
        pluginCalls.push(['goto', sceneClass]);
        return previousGoto.apply(this, arguments);
    };
    sandbox.SceneManager.push = function(sceneClass) {
        pluginCalls.push(['push', sceneClass]);
        return previousPush.apply(this, arguments);
    };
    assert.equal(sandbox.ReactorUI.sceneRoutingInstalled(), false);
    sandbox.ReactorUI.installSceneRouting();
    assert.equal(sandbox.ReactorUI.sceneRoutingInstalled(), true);
    sandbox.SceneManager.goto(sandbox.Scene_Title);
    sandbox.SceneManager.push(sandbox.Scene_Status);
    assert.deepEqual(pluginCalls, [['goto', sandbox.Scene_ReactorUI], ['push', sandbox.Scene_ReactorUI]]);
    assert.deepEqual(sandbox.__sceneCalls.filter(call => call[0] === 'prepare').map(call => call.slice(1)), [[1, 'title'], [1, 'status']]);
    const installedGoto = sandbox.SceneManager.goto;
    sandbox.ReactorUI.installSceneRouting();
    assert.equal(sandbox.SceneManager.goto, installedGoto, 'verification does not wrap its own wrapper');
    assert.match(read('runtime/reactor_main.js'), /ReactorUI\.installSceneRouting\(\);[\s\S]*SceneManager\.run\(Scene_Boot\)/);
});

test('replacement scenes keep title lifecycle and stock Game End to-title ordering', () => {
    const sandbox = loadRuntimeUI();
    const calls = [];
    sandbox.Scene_MenuBase.prototype.start = () => calls.push('base-start');
    sandbox.Scene_MenuBase.prototype.terminate = () => calls.push('base-terminate');
    sandbox.SceneManager.clearStack = () => calls.push('clear-stack');
    sandbox.SceneManager.snapForBackground = () => calls.push('snap');
    sandbox.AudioManager = {
        playBgm: value => calls.push('bgm:' + value.name), stopBgs: () => calls.push('stop-bgs'), stopMe: () => calls.push('stop-me')
    };
    sandbox.$dataSystem.titleBgm = { name: 'Theme' };
    const title = Object.create(sandbox.Scene_ReactorUI.prototype);
    title._interface = { nodes: [] };
    title._role = 'title';
    title.startFadeIn = () => calls.push('fade-in');
    title.fadeSpeed = () => 24;
    title.start();
    title.terminate();
    assert.deepEqual(calls, ['base-start', 'clear-stack', 'bgm:Theme', 'stop-bgs', 'stop-me', 'fade-in', 'base-terminate', 'snap']);

    calls.length = 0;
    const gameEnd = Object.create(sandbox.Scene_ReactorUI.prototype);
    gameEnd._closing = false;
    gameEnd.focusedWindow = () => null;
    gameEnd.fadeOutAll = () => calls.push('fade-out');
    sandbox.SceneManager.goto = () => calls.push('goto-title');
    sandbox.Window_TitleCommand = { initCommandPosition: () => calls.push('init-title-command') };
    gameEnd.runAction(sandbox.ReactorUI.normalizeAction({ type: 'gameEndToTitle' }));
    assert.deepEqual(calls, ['fade-out', 'goto-title', 'init-title-command']);
});

test('overlay records attach to Scene_Map, remain nonfocusable, and update from their visibility condition', () => {
    const runtime = read('runtime/reactor_ui.js');
    assert.match(runtime, /Scene_Map\.prototype\.createReactorUIOverlays/);
    assert.match(runtime, /record\.mode === "overlay"/);
    assert.match(runtime, /const shown = ReactorUI\.evaluateCondition\(this\._interface\.visible, scene\)/);
    assert.match(runtime, /focusInitial\(\) \{\}/);
    assert.match(runtime, /canFocus\(\) \{ return false; \}/);
    assert.doesNotMatch(runtime, /Scene_Map\.prototype\.start = function/);
});

test('System editors expose stock-default selectors for every bounded replacement role', () => {
    const system1 = read('editor/src/database/DatabaseSystem1Editor.js');
    const system2 = read('editor/src/database/DatabaseSystem2Editor.js');
    assert.match(system1, /system\.reactorTitleInterfaceId/);
    assert.match(system1, /Stock \(default\)/);
    assert.match(system2, /reactorMenuInterfaceId/);
    assert.match(system2, /reactorStatusInterfaceId/);
    assert.match(system2, /reactorGameEndInterfaceId/);
    assert.match(system2, /reactorOptionsInterfaceId/);
    assert.match(system2, /reactorSaveInterfaceId/);
    assert.match(system2, /reactorLoadInterfaceId/);
    assert.match(system2, /\(entry\.mode \|\| 'scene'\) === \(role === 'battle' \? 'battle' : 'scene'\)/);
    assert.match(system1, /if \(!record\.roles\.includes\('title'\)\) record\.roles\.push\('title'\)/);
    assert.match(read('runtime/reactor_ui.js'), /record\.roles \|\| \[\]\)\.includes\(role\)/);
});

test('Call User Interface is a Reactor plugin command with its own dialog', () => {
    const picker = read('editor/src/event/EventCommandPicker.js');
    assert.match(picker, /\{ name: 'Call User Interface', code: 357, reactor: 'CallUserInterface' \}/);
    const list = read('editor/src/event/EventCommandList.js');
    assert.match(list, /_reactorCommandEditor\(name\) \{[\s\S]*?'PlayModelAnimation'[\s\S]*?'CallUserInterface'/);
    // Editing dispatches on the command name, not on the plugin name alone.
    assert.match(list, /this\._reactorCommandEditor\(command\.parameters\[1\]\)/);
    const Editor = require(path.join(editorRoot, 'src', 'event', 'commands', 'CallUserInterfaceEditor.js'));
    assert.deepEqual(Editor.build(3, 2), {
        code: 357, indent: 2,
        parameters: ['RPGReactor', 'CallUserInterface', 'Call User Interface', { interfaceId: '3' }]
    });
    assert.match(read('editor/index.html'), /src\/event\/commands\/CallUserInterfaceEditor\.js/);
    assert.match(read('editor/src/PlaytestManager.js'), /playtestInterface\(projectPath, interfaceId\)[\s\S]*?`test&rrui=\$\{id\}`/);
});

test('changing a node parent or anchor keeps it where it is on the canvas', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
    assert.match(source, /const reparent = parent !== node\.parent && !this\.wouldCycle\(node\.id, parent\);/);
    assert.match(source, /node\.x = Math\.round\(before\.x - \(parentRect\.x \+ parentRect\.width \* ax - before\.width \* ax\)\);/);
    assert.match(source, /if \(reparent \|\| reanchor\) this\.syncPositionFields\(node\);/);
    // The preview draws with the project's own font and MZ's line metrics.
    assert.match(source, /new FontFace\(family, `url\("\$\{url\}"\)`\)/);
    assert.match(source, /baseline = Math\.round\(y \+ line\.height \/ 2 \+ run\.size \* 0\.35\)/);
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_ui.js'), 'utf8');
    assert.match(runtime, /ReactorUI\.compileScript = function\(source\)/);
    assert.match(runtime, /const stuck = cancel\.type === "none" && !this\._nodeWindows\.some/);
});

test('editor preview distinguishes GOLD from G, keeps escaped backslashes, and preserves captured hex text colors', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const instance = new Editor({ data: { system: { currencyUnit: 'Gil', advanced: { fontSize: 26 } }, actors: [] } });
    instance.ctx = { measureText(text) { return { width: text.length * 10 }; } };
    instance.skinColor = () => '#ffffff';
    instance.fontFamily = () => 'sans-serif';
    const lines = instance.parseText(Object.assign(Editor.defaultNode('text', 1), { text: '\\GOLD \\G \\\\GOLD' }));
    assert.equal(lines.flatMap(line => line.runs).map(run => run.text || '').join(''), '0 Gil \\GOLD');

    const captured = Editor.nodeFromElement({ kind: 'text', text: 'Plugin', x: 0, y: 0, textColor: '#12AbEf' }, 1, 0, { x: 0, y: 0 });
    assert.equal(captured.textColor, '#12AbEf');
    assert.equal(Editor.parseTextColor(captured.textColor), '#12abef');
    assert.match(instance.textColorControl('p-textColor', captured.textColor), /type="color"[^>]*value="#12AbEf"/);
    assert.equal(Editor.parseTextColor('17'), 17);
});

test('nodes draw parents-first, opacity cascades, text can wrap, and reorder carries a subtree', () => {
    const { ReactorUI } = loadRuntimeUI();
    const ordered = ReactorUI.orderNodes([
        { id: 10, parent: 9 }, { id: 1, parent: 0 }, { id: 9, parent: 1 }, { id: 2, parent: 1 }, { id: 3, parent: 99 }
    ]).map(node => node.id);
    assert.equal(JSON.stringify(ordered), '[1,9,10,2,3]', 'a child authored before its parent still draws after it; an orphan roots on the screen');
    assert.equal(ReactorUI.normalizeNode({ type: 'text', wrap: 1 }).wrap, true);
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_ui.js'), 'utf8');
    assert.match(runtime, /Window_ReactorUINode\.prototype\.wrapText = function\(text, width\)/);
    assert.match(runtime, /factor \*= opacityOf\(parent, trail\) \/ 255;/);
    assert.match(runtime, /const behind = -s\.forward - s\.sideways \* 2;/, 'wrap-around prefers the same row or column');

    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
    assert.match(source, /static orderNodes\(nodes\)/);
    assert.match(source, /entry\.nodes = DatabaseUserInterfaceEditor\.orderNodes\(entry\.nodes\);/);
    assert.match(source, /this\.current\.nodes = DatabaseUserInterfaceEditor\.orderNodes\(this\.current\.nodes\);/, 'moving a node re-establishes draw order');
    assert.match(source, /candidate\.type !== 'box' && candidate\.type !== 'image'/, 'images can parent');
    assert.match(source, /wrapRuns\(lines, maxWidth\)/);
    assert.match(source, /ctx\.globalAlpha = opacityOf\(node, new Set\(\)\);/);
});

test('authored ancestors control visibility even when a zero-sized parent has no runtime window', () => {
    const sandbox = loadRuntimeUI();
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    const parent = sandbox.ReactorUI.normalizeNode({ id: 1, type: 'box', width: 0, height: 0, visible: { type: 'never' } });
    const child = sandbox.ReactorUI.normalizeNode({ id: 2, parent: 1, type: 'button', width: 100, height: 40 });
    const childWindow = { node: () => child, visible: true, setEnabled() {}, isFocusable: () => true };
    scene._interface = { nodes: [parent, child] };
    scene._nodeWindows = [childWindow];
    scene._focusIndex = -1;
    scene.updateConditions();
    assert.equal(childWindow.visible, false);
    parent.visible = sandbox.ReactorUI.normalizeCondition({ type: 'always' });
    scene.updateConditions();
    assert.equal(childWindow.visible, true);
});

test('typed List rows have stable source-qualified identity and a complete context surface', () => {
    const sandbox = loadRuntimeUI();
    const item = { id: 1, name: 'Potion', description: 'Restores HP', iconIndex: 10, itypeId: 1, price: 50 };
    const weapon = { id: 1, name: 'Sword', description: 'Sharp', iconIndex: 20, price: 100 };
    sandbox.$gameParty.allItems = () => [item, weapon];
    sandbox.$gameParty.numItems = () => 2;
    sandbox.DataManager.isItem = value => value === item;
    sandbox.DataManager.isWeapon = value => value === weapon;
    sandbox.DataManager.isArmor = () => false;
    const rows = sandbox.ReactorUI.listRows(sandbox.ReactorUI.normalizeNode({ type: 'list', dataSource: 'inventory' }));
    assert.equal(JSON.stringify(rows.map(row => [row.key, row.kind, row.id])), '[["item:1","item",1],["weapon:1","weapon",1]]');
    for (const row of rows) {
        for (const field of ['key', 'kind', 'id', 'value', 'name', 'description', 'iconIndex', 'count', 'enabled', 'data']) {
            assert.ok(Object.hasOwn(row, field), `${row.key} has ${field}`);
        }
    }
    assert.equal(rows[0].data, item);
    assert.equal(sandbox.ReactorUI.formatListRow('{kind} {description} {iconIndex} {price}', rows[0]), 'item Restores HP 10 50');
});

test('List selection publishes its named context immediately and on reselection', () => {
    const sandbox = loadRuntimeUI();
    sandbox.Window_Selectable.prototype.select = function(index) { this._index = index; };
    sandbox.Window_Selectable.prototype.update = function() {};
    const contexts = new Map();
    const scene = { setContext(name, row) { if (row) contexts.set(name, row); else contexts.delete(name); } };
    const list = Object.create(sandbox.Window_ReactorUIList.prototype);
    list._uiScene = scene;
    list._uiNode = { contextName: 'hero' };
    list._uiRows = [{ key: 'actor:1', id: 1 }, { key: 'actor:2', id: 2 }];
    list.index = () => list._index;
    list.select(0);
    assert.equal(contexts.get('hero').key, 'actor:1');
    list.select(1);
    assert.equal(contexts.get('hero').key, 'actor:2');
    list.select(-1);
    assert.equal(contexts.has('hero'), false);

    const original = { actorId: () => 1, name: () => 'Hero' };
    const replacement = { actorId: () => 1, name: () => 'Hero' };
    let members = [original];
    sandbox.$gameParty.members = () => members;
    const node = sandbox.ReactorUI.normalizeNode({ type: 'list', dataSource: 'party', contextName: 'hero' });
    const refreshing = Object.create(sandbox.Window_ReactorUIList.prototype);
    refreshing.deactivate = function() {};
    refreshing._uiScene = scene;
    refreshing._uiNode = node;
    refreshing._uiRows = sandbox.ReactorUI.listRows(node, scene);
    refreshing._uiRowsSignature = sandbox.ReactorUI.listRowsSignature(refreshing._uiRows);
    refreshing._uiRefreshWait = 14;
    refreshing._index = 0;
    refreshing.index = () => refreshing._index;
    members = [replacement];
    refreshing.update();
    assert.equal(contexts.get('hero').data, replacement, 'an equivalent refreshed row still republishes current backing data');
});

test('actor bindings and actor tokens resolve fixed, variable, menu, and selected-context actors', () => {
    const sandbox = loadRuntimeUI();
    const actor = (id, name) => ({
        actorId: () => id, name: () => name, nickname: () => 'Nick', currentClass: () => ({ name: 'Mage' }), level: 7,
        profile: () => 'Profile', hp: 40, mhp: 50, mp: 20, mmp: 30, tp: 10, maxTp: () => 100,
        currentExp: () => 250, currentLevelExp: () => 200, nextLevelExp: () => 400, nextRequiredExp: () => 150,
        isMaxLevel: () => false, param: id => [50, 30, 12, 11, 14, 13, 15, 9][id]
    });
    const a = actor(3, 'Alicia');
    const b = actor(4, 'Bran');
    sandbox.$gameParty.members = () => [a];
    sandbox.$gameParty.menuActor = () => b;
    sandbox.$gameActors.actor = id => id === 3 ? a : id === 4 ? b : null;
    sandbox.$gameVariables._values[8] = 4;
    const scene = { context: name => name === 'picked' ? { kind: 'actor', id: 3, data: a } : null };
    const fixed = sandbox.ReactorUI.normalizeNode({ type: 'text', actorSource: 'actorId', actorId: 3 });
    const variable = sandbox.ReactorUI.normalizeNode({ type: 'text', actorSource: 'variable', actorVariableId: 8 });
    const menu = sandbox.ReactorUI.normalizeNode({ type: 'text', actorSource: 'menuActor' });
    const context = sandbox.ReactorUI.normalizeNode({ type: 'text', actorSource: 'context', actorContextName: 'picked' });
    assert.deepEqual([sandbox.ReactorUI.resolveActor(fixed, scene), sandbox.ReactorUI.resolveActor(variable, scene), sandbox.ReactorUI.resolveActor(menu, scene), sandbox.ReactorUI.resolveActor(context, scene)], [a, b, b, a]);
    assert.equal(sandbox.ReactorUI.resolveActorTokens('{actor.name} {actor.class} {actor.currentExp}/{actor.totalExp}/{actor.nextExp}/{actor.nextRequiredExp} {actor.atk}', fixed, scene),
        'Alicia Mage 50/250/400/150 12');
    assert.equal(sandbox.ReactorUI.normalizeNode({ type: 'list', actorMode: 'actor', actorId: 3 }).actorSource, 'actorId', 'legacy actorMode remains a binding shorthand');
});

test('actor parameter, equipment, and state Lists use the selected actor binding', () => {
    const sandbox = loadRuntimeUI();
    const sword = { id: 2, name: 'Sword', description: 'Blade', iconIndex: 16, price: 100 };
    const poison = { id: 5, name: 'Poison', iconIndex: 32, message3: 'Poisoned' };
    const burn = { id: 6, name: 'Burn', iconIndex: 33, description: 'Fire damage each turn.', message3: 'Burning' };
    const actor = { actorId: () => 3, param: id => id + 10, equips: () => [sword], equipSlots: () => [1], states: () => [poison, burn] };
    sandbox.$gameActors.actor = () => actor;
    sandbox.$dataSystem.equipTypes = ['', 'Weapon'];
    sandbox.TextManager = { param: id => 'Param ' + id };
    const rows = source => sandbox.ReactorUI.listRows(sandbox.ReactorUI.normalizeNode({ type: 'list', dataSource: source, actorSource: 'actorId', actorId: 3 }));
    assert.equal(JSON.stringify(rows('actorParameters').slice(0, 2).map(row => [row.key, row.paramName, row.paramValue])), '[["parameter:0","Param 0",10],["parameter:1","Param 1",11]]');
    assert.equal(JSON.stringify(rows('actorEquipment').map(row => [row.key, row.name, row.paramName])), '[["equipment:0","Sword","Weapon"]]');
    assert.equal(JSON.stringify(rows('actorStates').map(row => [row.key, row.description])), '[["state:5","Poisoned"],["state:6","Fire damage each turn."]]',
        'a state describes itself with its Description field, and falls back to its messages');
});

test('a gauge sprite keeps its label method against PIXI 8 own properties', () => {
    // PIXI 8's Container ctor sets an own "label" string. It shadows
    // Sprite_Gauge.prototype.label(), and Sprite_Gauge.redraw() calls
    // this.label() on every draw, so a labelled gauge threw and took the
    // scene with it - the stock Status screen showed only an error.
    const sandbox = loadRuntimeUI();
    function SpriteGauge() {}
    SpriteGauge.prototype.initialize = function() { this.label = 'Sprite'; this.name = 'Sprite'; };
    SpriteGauge.prototype.label = function() { return 'HP'; };
    sandbox.Sprite_Gauge = SpriteGauge;
    const Gauge = sandbox.ReactorUI.gaugeSpriteClass();
    const node = sandbox.ReactorUI.normalizeNode({ type: 'gauge', gauge: 'hp', showLabel: true });
    const sprite = new Gauge(node);
    assert.equal(typeof sprite.label, 'function', 'the PIXI-set own property no longer shadows the method');
    assert.equal(sprite.label(), 'HP');
    assert.equal(sprite._uiNode, node, 'the node the class sets itself survives the sweep');
});

test('EXP and variable gauges calculate their authored progress and maximums', () => {
    const sandbox = loadRuntimeUI();
    function SpriteGauge() {}
    SpriteGauge.prototype.initialize = function() {};
    SpriteGauge.prototype.isValid = function() { return true; };
    SpriteGauge.prototype.gaugeBackColor = () => '#000000';
    SpriteGauge.prototype.gaugeColor1 = () => '#111111';
    SpriteGauge.prototype.gaugeColor2 = () => '#222222';
    sandbox.Sprite_Gauge = SpriteGauge;
    const Gauge = sandbox.ReactorUI.gaugeSpriteClass();
    const actor = { currentExp: () => 250, currentLevelExp: () => 200, nextLevelExp: () => 400, isMaxLevel: () => false };
    const exp = Object.create(Gauge.prototype);
    exp._uiNode = sandbox.ReactorUI.normalizeNode({ type: 'gauge', gauge: 'exp', gaugeColor1: '#123456' });
    exp._battler = actor;
    assert.deepEqual([exp.currentValue(), exp.currentMaxValue(), exp.gaugeColor1()], [50, 200, '#123456']);
    actor.isMaxLevel = () => true;
    assert.deepEqual([exp.currentValue(), exp.currentMaxValue()], [1, 1]);
    const variable = Object.create(Gauge.prototype);
    variable._uiNode = sandbox.ReactorUI.normalizeNode({ type: 'gauge', gauge: 'variable', variableId: 3, max: 100, maxVariableId: 9 });
    sandbox.$gameVariables._values[3] = 30;
    sandbox.$gameVariables._values[9] = 60;
    assert.deepEqual([variable.currentValue(), variable.currentMaxValue()], [42, 60]);
});

test('semantic actions consume named actor context and clear resume state on goto actions', () => {
    const sandbox = loadRuntimeUI();
    const actor = { actorId: () => 3 };
    const selected = { kind: 'actor', id: 3, data: actor };
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._contexts = new Map([['hero', selected]]);
    scene._closing = false;
    scene.focusedWindow = () => null;
    let menuActor = null;
    sandbox.$gameParty.setMenuActor = value => { menuActor = value; };
    scene.runAction(sandbox.ReactorUI.normalizeAction({ type: 'setMenuActor', contextName: 'hero' }));
    assert.equal(menuActor, actor);
    sandbox.Scene_Status = function Scene_Status() {};
    let pushed = null;
    scene.pushScene = value => { pushed = value; };
    scene.runAction(sandbox.ReactorUI.normalizeAction({ type: 'personalStatus', contextName: 'hero' }));
    assert.equal(pushed, sandbox.Scene_Status);
    let setup = 0;
    sandbox.DataManager.setupNewGame = () => { setup++; };
    sandbox.ReactorUI._resumeStates.push({ stale: true });
    scene.fadeOutAll = () => {};
    scene.runAction(sandbox.ReactorUI.normalizeAction({ type: 'titleNewGame' }));
    assert.equal(setup, 1);
    assert.equal(sandbox.ReactorUI._resumeStates.length, 0);
    assert.equal(sandbox.__sceneCalls.at(-1)[1], sandbox.Scene_Map);
});

test('Status paging and semantic actor buttons update menuActor and refresh actor-bound nodes', () => {
    const sandbox = loadRuntimeUI();
    const actors = [{ id: 1 }, { id: 2 }, { id: 3 }];
    let index = 1;
    sandbox.$gameParty.menuActor = () => actors[index];
    sandbox.$gameParty.makeMenuActorPrevious = () => { index = (index + actors.length - 1) % actors.length; };
    sandbox.$gameParty.makeMenuActorNext = () => { index = (index + 1) % actors.length; };
    const refreshed = [];
    const list = { node: () => ({ type: 'list' }), _uiRefreshWait: 0 };
    const detail = { node: () => ({ type: 'text' }), refresh: () => refreshed.push(index) };
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene.__sandbox = sandbox;
    scene._role = 'status';
    scene._nodeWindows = [list, detail];
    scene._contexts = new Map();
    scene._closing = false;
    scene.focusedWindow = () => null;
    scene.runAction(sandbox.ReactorUI.normalizeAction({ type: 'previousMenuActor' }));
    assert.deepEqual([index, scene._actor, list._uiRefreshWait, refreshed.at(-1)], [0, actors[0], 14, 0]);
    scene.runAction(sandbox.ReactorUI.normalizeAction({ type: 'nextMenuActor' }));
    assert.deepEqual([index, scene._actor, refreshed.at(-1)], [1, actors[1], 1]);
    sandbox.Input = { isTriggered: key => key === 'pagedown', isRepeated: () => false };
    sandbox.TouchInput = { isCancelled: () => false };
    scene.updateInput();
    assert.deepEqual([index, scene._actor], [2, actors[2]], 'Page Down uses the same stock menu-actor lifecycle');
});

test('User Interfaces replacement controls assign and unassign System roles but cannot assign overlays', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const system = {};
    const manager = { data: { system }, getSystem: () => system, mutationGeneration: 0 };
    const editor = new Editor(manager);
    editor.current = { id: 7, mode: 'scene', roles: [] };
    assert.equal(editor.setReplacementRole('status', true), true);
    assert.equal(editor.setReplacementRole('gameEnd', true), true);
    assert.deepEqual([system.reactorStatusInterfaceId, system.reactorGameEndInterfaceId], [7, 7]);
    assert.deepEqual(editor.current.roles, ['status', 'gameEnd']);
    editor.current.mode = 'overlay';
    assert.equal(editor.setReplacementRole('menu', true), false);
    assert.equal(editor.dropUnfitReplacementRoles(), true, 'a presentation change drops bindings the game would ignore');
    assert.deepEqual([system.reactorStatusInterfaceId, system.reactorGameEndInterfaceId], [0, 0]);
    system.reactorStatusInterfaceId = 7;
    assert.equal('reactorMenuInterfaceId' in system, false);
    assert.equal(editor.setReplacementRole('status', false), true, 'an existing invalid overlay reference can still be removed');
    assert.equal(system.reactorStatusInterfaceId, 0);
});

test('System 2 lists every interface whose presentation fits the role, binds like Use As, and exposes invalid ids safely', () => {
    const previousWindow = global.window;
    const previousEscape = global.rrEscapeHtml;
    const previousDocument = global.document;
    global.window = {};
    global.rrEscapeHtml = value => String(value);
    global.document = { createElement: () => ({ className: '', innerHTML: '' }) };
    try {
        const System2 = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseSystem2Editor.js'));
        const records = [
            { id: 1, name: 'Menu', mode: 'scene', roles: ['menu'] },
            { id: 2, name: 'HUD', mode: 'overlay' },
            { id: '3', name: 'Status', mode: 'scene', roles: ['status'] },
            { id: 4, name: 'Battle HUD', mode: 'battle', roles: [] },
            { id: 5, name: 'Fresh', mode: 'scene' }
        ];
        const manager = { getUserInterfaces: () => records, getUserInterface: id => records.find(r => Number(r.id) === id) };
        const editor = new System2(manager);
        const valid = editor.userInterfaceOptions(3, 'status');
        assert.match(valid, /value="0"/);
        assert.match(valid, /value="1"/, 'a scene record is offered for any scene role, not only the ones it was tagged with');
        assert.match(valid, /value="3" selected/);
        assert.match(valid, /value="5"/);
        assert.doesNotMatch(valid, /value="2"/);
        assert.doesNotMatch(valid, /value="4"/, 'a battle HUD cannot be a scene');
        const battle = editor.userInterfaceOptions(0, 'battle');
        assert.match(battle, /value="4"/);
        assert.doesNotMatch(battle, /value="1"|value="5"/);
        assert.match(editor.userInterfaceOptions(4, 'menu'), /value="4" selected>\(Missing\) \/ \(incompatible\) #4/);
        assert.match(editor.userInterfaceOptions(9, 'status'), /value="9" selected>\(Missing\) \/ \(incompatible\) #9/);
        const system = {};
        editor.bindUserInterface(system, 'reactorShopInterfaceId', 'shop', 5);
        assert.equal(system.reactorShopInterfaceId, 5);
        assert.deepEqual([...records[4].roles], ['shop'], 'binding from System 2 tags the record so the game routes it');
        editor.bindUserInterface(system, 'reactorShopInterfaceId', 'shop', 0);
        assert.equal(system.reactorShopInterfaceId, 0);
        const section = editor.createCustomInterfacesSection({});
        assert.match(section.innerHTML, /reactorMenuInterfaceId/);
        assert.match(section.innerHTML, /reactorStatusInterfaceId/);
        assert.match(section.innerHTML, /reactorGameEndInterfaceId/);
        assert.match(section.innerHTML, /reactorOptionsInterfaceId/);
        assert.match(section.innerHTML, /reactorSaveInterfaceId/);
        assert.match(section.innerHTML, /reactorLoadInterfaceId/);
    } finally {
        global.window = previousWindow;
        global.rrEscapeHtml = previousEscape;
        global.document = previousDocument;
    }
});

test('resume snapshots preserve role, focus, List identity/top row, and contexts in one stack', () => {
    const sandbox = loadRuntimeUI();
    const row = { key: 'actor:3', kind: 'actor', id: 3 };
    const list = { node: () => ({ id: 7, type: 'list' }), selectedRow: () => row, index: () => 2, topRow: () => 1 };
    const button = { node: () => ({ id: 9, type: 'button' }) };
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._interfaceId = 4;
    scene._role = 'menu';
    scene._contexts = new Map([['hero', row]]);
    scene._nodeWindows = [list, button];
    scene.focusedWindow = () => button;
    scene.rememberForPush();
    const saved = sandbox.ReactorUI._resumeStates[0];
    assert.deepEqual([saved.interfaceId, saved.role, saved.focusedNodeId], [4, 'menu', 9]);
    assert.equal(JSON.stringify(saved.lists[0]), '{"nodeId":7,"key":"actor:3","index":2,"topRow":1}');
    assert.equal(new Map(saved.contexts).get('hero'), row);
    assert.equal('_resumeIds' in sandbox.ReactorUI || '_resumeRoles' in sandbox.ReactorUI, false);
});

test('editor normalization and starting-party preview match actor tokens and legacy Gauge records', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const params = Array.from({ length: 8 }, (_, id) => Array.from({ length: 100 }, (_, level) => id * 10 + level));
    const data = {
        system: { partyMembers: [1], variables: [], currencyUnit: 'G', advanced: { fontSize: 26 } },
        actors: [null, { id: 1, name: 'Harold', nickname: 'Hero', profile: 'Ready', classId: 1, initialLevel: 5, maxLevel: 99 }],
        classes: [null, { id: 1, name: 'Warrior', params, expParams: [30, 20, 30, 30], learnings: [] }]
    };
    const editor = new Editor({ data });
    editor.ctx = { measureText(text) { return { width: text.length * 10 }; } };
    editor.skinColor = () => '#ffffff';
    editor.fontFamily = () => 'sans-serif';
    const node = Object.assign(Editor.defaultNode('text', 1), { text: '{actor.name} {actor.class} {actor.level} {actor.hp} {actor.atk}', actorSource: 'actorId', actorId: 1 });
    assert.equal(editor.parseText(node).flatMap(line => line.runs).map(run => run.text || '').join(''), 'Harold Warrior 5 5 25');

    const old = editor.normalizeInterface({ coordinateSpace: 'screen', nodes: [{ id: 1, type: 'gauge', index: 2, showValue: false }, { id: 2, type: 'list', actorMode: 'actor', actorId: 1 }] });
    assert.deepEqual([old.nodes[0].actorSource, old.nodes[0].index, old.nodes[0].valueFormat], ['partySlot', 2, 'hidden']);
    assert.deepEqual([old.nodes[1].actorSource, old.nodes[1].actorId, old.nodes[1].contextName], ['actorId', 1, 'selection']);
});

test('options rows mirror MZ symbols and mutate booleans and volumes with stock wrapping', () => {
    const sandbox = loadRuntimeUI();
    sandbox.TextManager = {
        alwaysDash: 'Always Dash', commandRemember: 'Command Remember', touchUI: 'Touch UI',
        bgmVolume: 'BGM Volume', bgsVolume: 'BGS Volume', meVolume: 'ME Volume', seVolume: 'SE Volume'
    };
    const sounds = [];
    sandbox.SoundManager = { playCursor: () => sounds.push('cursor') };
    const node = sandbox.ReactorUI.normalizeNode({ type: 'list', dataSource: 'options', action: { type: 'optionChange' }, rowText: '{symbol}:{valueText}' });
    let rows = sandbox.ReactorUI.listRows(node);
    assert.equal(JSON.stringify(rows.map(row => [row.key, row.symbol])), JSON.stringify([
        ['option:alwaysDash', 'alwaysDash'], ['option:commandRemember', 'commandRemember'], ['option:touchUI', 'touchUI'],
        ['option:bgmVolume', 'bgmVolume'], ['option:bgsVolume', 'bgsVolume'], ['option:meVolume', 'meVolume'], ['option:seVolume', 'seVolume']
    ]));
    assert.equal(rows[0].text, 'alwaysDash:OFF');
    assert.equal(sandbox.ReactorUI.changeOption('alwaysDash', true, true), true);
    assert.equal(sandbox.ConfigManager.alwaysDash, true);
    sandbox.ConfigManager.bgmVolume = 100;
    assert.equal(sandbox.ReactorUI.changeOption('bgmVolume', true, true), true);
    assert.equal(sandbox.ConfigManager.bgmVolume, 0, 'OK wraps 100 to 0');
    sandbox.ConfigManager.bgmVolume = 100;
    assert.equal(sandbox.ReactorUI.changeOption('bgmVolume', true, false), false);
    assert.equal(sandbox.ConfigManager.bgmVolume, 100, 'right clamps without wrapping');
    assert.equal(sandbox.ReactorUI.changeOption('bgmVolume', false, false), true);
    assert.equal(sandbox.ConfigManager.bgmVolume, 80, 'left uses the stock 20 point step');
    assert.equal(sounds.length, 3, 'only actual changes play the cursor sound');

    delete sandbox.ConfigManager.touchUI;
    rows = sandbox.ReactorUI.listRows(node);
    assert.equal(rows.some(row => row.symbol === 'touchUI'), false, 'Touch UI is absent where the runtime has no setting');
});

test('custom Options saves ConfigManager on termination after pointer or directional changes', () => {
    const sandbox = loadRuntimeUI();
    let saves = 0;
    sandbox.ConfigManager.save = () => { saves++; };
    sandbox.Scene_MenuBase.prototype.terminate = function() {};
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._role = 'options';
    scene._optionsChanged = false;
    scene.terminate();
    assert.equal(saves, 1, 'a routed custom Options scene uses the stock termination lifecycle');

    const list = Object.create(sandbox.Window_ReactorUIList.prototype);
    list._uiScene = { _optionsChanged: false };
    list._uiNode = sandbox.ReactorUI.normalizeNode({ type: 'list', dataSource: 'options', action: { type: 'optionChange' } });
    list._uiRows = [{ key: 'option:alwaysDash', kind: 'option', symbol: 'alwaysDash' }];
    list.index = () => 0;
    list.select = () => {};
    list.refresh = () => {};
    list.changeOption(true, false);
    assert.equal(list._uiScene._optionsChanged, true, 'left/right marks a directly called interface for persistence too');
});

test('saveSlots expose declarative detail fields and mode-specific enabled state', () => {
    const sandbox = loadRuntimeUI();
    sandbox.TextManager = { autosave: 'Autosave', file: 'File' };
    sandbox.DataManager.maxSavefiles = () => 3;
    sandbox.DataManager.savefileInfo = id => id === 1 ? {
        title: 'Reactor Quest', playtime: '02:03:04', timestamp: 1787846400000,
        characters: [['Actor1', 0]], faces: [['Actor1', 2]]
    } : null;
    const rows = action => sandbox.ReactorUI.listRows(sandbox.ReactorUI.normalizeNode({
        type: 'list', dataSource: 'saveSlots', includeAutosave: true, action: { type: action },
        rowText: '{title}|{playtime}|{date}|{partyCharacters}|{partyFaces}|{existing}|{enabled}'
    }));
    const saves = rows('saveSlot');
    assert.equal(JSON.stringify(saves.map(row => [row.id, row.existing, row.enabled])), '[[0,false,false],[1,true,true],[2,false,true]]');
    assert.match(saves[1].text, /^Reactor Quest\|02:03:04\|.+\|Actor1\[0\]\|Actor1\[2\]\|true\|true$/);
    assert.equal(JSON.stringify(rows('loadSlot').map(row => [row.id, row.enabled])), '[[0,false],[1,true],[2,false]]');
    const text = sandbox.ReactorUI.resolveContextTokens('{context.title} {context.playtime} {context.existing}',
        { contextName: 'slot' }, { context: () => saves[1] });
    assert.equal(text, 'Reactor Quest 02:03:04 true');

    const list = Object.create(sandbox.Window_ReactorUIList.prototype);
    list._uiRows = [{ id: 1 }, { id: 2 }, { id: 4 }];
    sandbox.$gameSystem.savefileId = () => 4;
    list._uiNode = sandbox.ReactorUI.normalizeNode({ type: 'list', action: { type: 'saveSlot' } });
    assert.equal(list.initialIndex(), 2, 'Save starts on the current manual save ID');
    sandbox.DataManager.latestSavefileId = () => 2;
    list._uiNode = sandbox.ReactorUI.normalizeNode({ type: 'list', action: { type: 'loadSlot' } });
    assert.equal(list.initialIndex(), 1, 'Load starts on the latest existing save ID');
});

test('save slot action preserves stock order, duplicate guard, success, and failure behavior', async () => {
    const sandbox = loadRuntimeUI();
    const calls = [];
    let resolveSave;
    sandbox.$gameSystem.setSavefileId = id => calls.push('set:' + id);
    sandbox.$gameSystem.onBeforeSave = () => calls.push('before');
    sandbox.DataManager.saveGame = id => { calls.push('save:' + id); return new Promise(resolve => { resolveSave = resolve; }); };
    sandbox.SoundManager = { playSave: () => calls.push('sound-save'), playBuzzer: () => calls.push('buzzer') };
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._filePending = false;
    scene.popScene = () => calls.push('pop');
    const window = { deactivate: () => calls.push('deactivate'), activate: () => calls.push('activate') };
    scene.executeFileAction('saveSlot', { id: 4, enabled: true }, window);
    scene.executeFileAction('saveSlot', { id: 5, enabled: true }, window);
    assert.deepEqual(calls, ['deactivate', 'set:4', 'before', 'save:4'], 'pending work cannot activate a second slot');
    resolveSave();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['deactivate', 'set:4', 'before', 'save:4', 'sound-save', 'pop']);

    calls.length = 0;
    sandbox.console = Object.assign({}, console, { error: () => calls.push('error') });
    sandbox.DataManager.saveGame = () => Promise.reject(new Error('disk'));
    scene._filePending = false;
    scene.executeFileAction('saveSlot', { id: 2, enabled: true }, window);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['deactivate', 'set:2', 'before', 'error', 'buzzer', 'activate']);
    assert.equal(scene._filePending, false);
});

test('load slot action preserves stock transition, reload, after-load, resume clearing, and failure behavior', async () => {
    const sandbox = loadRuntimeUI();
    const calls = [];
    sandbox.DataManager.loadGame = id => { calls.push('load:' + id); return Promise.resolve(); };
    sandbox.SoundManager = { playLoad: () => calls.push('sound-load'), playBuzzer: () => calls.push('buzzer') };
    sandbox.$gameSystem.versionId = () => 1;
    sandbox.$dataSystem.versionId = 2;
    sandbox.$gameSystem.onAfterLoad = () => calls.push('after-load');
    sandbox.$gameMap.mapId = () => 7;
    Object.assign(sandbox.$gamePlayer, {
        x: 8, y: 9, direction: () => 4,
        reserveTransfer: (...args) => calls.push('transfer:' + args.join(',')), requestMapReload: () => calls.push('reload')
    });
    sandbox.SceneManager.goto = sceneClass => calls.push('goto:' + (sceneClass === sandbox.Scene_Map));
    sandbox.Scene_MenuBase.prototype.terminate = function() { calls.push('terminate'); };
    sandbox.ReactorUI._resumeStates.push({ interfaceId: 2 });
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._filePending = false;
    scene._role = 'load';
    scene._optionsChanged = false;
    scene._loadSuccess = false;
    scene.fadeOutAll = () => calls.push('fade');
    const window = { deactivate: () => calls.push('deactivate'), activate: () => calls.push('activate') };
    scene.executeFileAction('loadSlot', { id: 3, enabled: true }, window);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['deactivate', 'load:3', 'sound-load', 'fade', 'transfer:7,8,9,4,0', 'reload', 'goto:true']);
    assert.equal(sandbox.ReactorUI._resumeStates.length, 0);
    scene.terminate();
    assert.deepEqual(calls.slice(-2), ['terminate', 'after-load']);

    calls.length = 0;
    sandbox.console = Object.assign({}, console, { error: () => calls.push('error') });
    sandbox.DataManager.loadGame = () => Promise.reject(new Error('bad save'));
    scene._filePending = false;
    scene.executeFileAction('loadSlot', { id: 1, enabled: true }, window);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['deactivate', 'error', 'buzzer', 'activate']);
});

test('Options, Save, and Load routing requires matching roles and falls back safely', () => {
    const sandbox = loadRuntimeUI();
    assert.equal(JSON.stringify(Object.keys(sandbox.ReactorUI.REPLACEMENTS)),
        '["title","menu","status","gameEnd","options","save","load","item","skill","equip","shop","name"]',
        'Battle is a HUD over the stock battle scene, never a routed replacement');
    sandbox.$dataUserInterfaces = [null,
        { id: 1, mode: 'scene', roles: ['options'], nodes: [] },
        { id: 2, mode: 'scene', roles: ['save'], nodes: [] },
        { id: 3, mode: 'scene', roles: ['load'], nodes: [] },
        { id: 4, mode: 'overlay', roles: ['load'], nodes: [] }];
    sandbox.$dataSystem.reactorOptionsInterfaceId = 1;
    sandbox.$dataSystem.reactorSaveInterfaceId = 2;
    sandbox.$dataSystem.reactorLoadInterfaceId = 3;
    sandbox.SceneManager.push(sandbox.Scene_Options);
    sandbox.SceneManager.push(sandbox.Scene_Save);
    sandbox.SceneManager.push(sandbox.Scene_Load);
    assert.deepEqual(sandbox.__sceneCalls.filter(call => call[0] === 'prepare').map(call => call.slice(1)), [[1, 'options'], [2, 'save'], [3, 'load']]);

    sandbox.__sceneCalls.length = 0;
    sandbox.$dataSystem.reactorOptionsInterfaceId = 2;
    sandbox.$dataSystem.reactorSaveInterfaceId = 0;
    sandbox.$dataSystem.reactorLoadInterfaceId = 4;
    sandbox.SceneManager.push(sandbox.Scene_Options);
    sandbox.SceneManager.push(sandbox.Scene_Save);
    sandbox.SceneManager.push(sandbox.Scene_Load);
    assert.deepEqual(sandbox.__sceneCalls.map(call => call[1]), [sandbox.Scene_Options, sandbox.Scene_Save, sandbox.Scene_Load]);
});

test('script conditions accept stock expressions and explicit return bodies without changing action scripts', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    sandbox.$gameParty.exists = () => true;
    sandbox.DataManager.isEventTest = () => false;
    sandbox.$gameSystem.isSaveEnabled = () => true;
    const evaluate = script => ui.evaluateCondition({type:'script',script}, {});
    assert.equal(evaluate('$gameParty.exists()'), true);
    assert.equal(evaluate('!DataManager.isEventTest() && $gameSystem.isSaveEnabled();'), true);
    assert.equal(evaluate('return $gameParty.exists();'), true);
    assert.equal(evaluate('const allowed = $gameParty.exists(); return allowed;'), true);
    sandbox.$gameParty.exists = () => false;
    assert.equal(evaluate('$gameParty.exists()'), false, 'cached conditions read current state');
    assert.equal(ui.compileScript('$gameSystem.changed = true;')(), undefined, 'action scripts keep their statement semantics');
    assert.equal(sandbox.$gameSystem.changed, true);
});

test('personal commands pick an actor, constrain focus, cancel locally and restore their source before opening a scene', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const data = JSON.parse(read('template/Demo/data/Actors.json'));
    const actors = [1,2].map(id => ({actorId:()=>id, name:()=>data[id].name, level:data[id].initialLevel}));
    sandbox.$gameParty.members = () => actors;
    sandbox.$gameParty.menuActor = () => actors[0];
    sandbox.SoundManager = {playBuzzer(){ throw Error('Unexpected buzzer'); },playOk(){},playCancel(){}};
    const scene = new sandbox.Scene_ReactorUI();
    const action = ui.normalizeAction({type:'personalEquip',contextName:'hero'});
    scene._interface = {nodes:[{id:1,type:'button',action}]};
    scene.prepareActorContexts();
    assert.equal(ui.actorFromContext(scene,'hero'),actors[0], 'a missing list still provides an initial valid actor');
    const source = {node:()=>({id:1,type:'button',action}),visible:true,isFocusable:()=>true,isEnabled:()=>true,setFocused(){}};
    const other = {...source,node:()=>({id:3,type:'button'})};
    const picker = {node:()=>({id:2,type:'list',dataSource:'party',contextName:'hero'}),visible:true,
        isFocusable:()=>true,isEnabled:()=>true,maxItems:()=>2,setFocused(){},
        _uiRows:ui.listRows(ui.normalizeNode({type:'list',dataSource:'party'}),scene),
        selectedRow(){return scene.context('hero');},
        select(index){scene.setContext('hero',this._uiRows[index]);}};
    sandbox.$gameParty.setMenuActor = () => {};
    scene._nodeWindows=[source,picker,other]; scene._focusIndex=0;
    scene.activateWindow(source);
    assert.equal(scene.focusedWindow(),picker);
    assert.equal(scene.canFocus(other),false);
    picker.select(1);
    scene.cancelInterface();
    assert.equal(scene._closing,false);
    assert.equal(scene.focusedWindow(),source);
    assert.equal(ui.actorFromContext(scene,'hero'),actors[0]);
    scene.beginActorSelection(action); picker.select(1);
    let dispatched;
    scene.runAction = value => { dispatched=value; assert.equal(scene.focusedWindow(),source); };
    scene.endActorSelection(true);
    assert.equal(dispatched,action);
    assert.equal(ui.actorFromContext(scene,'hero'),actors[1]);
    assert.equal(scene.canFocus(other),true);
    action.chooseActor=false;
    scene.activateWindow(source);
    assert.equal(scene._actorSelection,null,'explicit opt-out executes immediately');
});

test('legacy Main Menu upgrades its Party section to one editable actor panel in editor and runtime', () => {
    const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');
    const sandbox=loadRuntimeUI();
    const old={stock:'menu',nodes:[
        {id:1,type:'box',name:'Party',x:240,y:8,width:800,height:600},
        {id:2,type:'image',name:'Selected face',parent:1},
        {id:3,type:'list',name:'Party members',parent:1},
        {id:4,type:'text',name:'Custom heading',parent:1},
        {id:5,type:'button',name:'Equip',action:{type:'personalEquip',contextName:'selectedActor'}}
    ]};
    const before=JSON.stringify(old);
    const editor=Editor.upgradeMenuActorPanel(old),runtime=sandbox.ReactorUI.upgradeMenuActorPanel(old);
    assert.equal(JSON.stringify(editor),JSON.stringify(runtime));
    assert.equal(JSON.stringify(old),before,'source data is not mutated during upgrade');
    assert.deepEqual(editor.map(node=>node.id),[1,4,5]);
    assert.deepEqual([editor[0].x,editor[0].y,editor[0].width,editor[0].height],[240,8,800,600]);
    assert.equal(editor[0].rowLayout,'actorPanel');
    assert.equal(Editor.upgradeMenuActorPanel({...old,nodes:editor}),editor,'upgrade is idempotent');
    assert.equal(Editor.upgradeMenuActorPanel({...old,stock:''}),old.nodes,'custom records are not rewritten');
});

test('Actor Panel element layout stays inside rows and keeps labels, values and bars separate', () => {
    const { ReactorUI: ui } = loadRuntimeUI();
    const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');
    for (const height of [192,240,400]) {
        const node=ui.normalizeNode({type:'list',rowLayout:'actorPanel',rowHeight:height});
        const layout=ui.actorPanelLayout(node,600,height,28);
        assert.deepEqual(JSON.parse(JSON.stringify(layout)),Editor.actorPanelLayout(node,600,height,28));
        for(const key of ['hp','mp','exp']) {
            assert.ok(layout[key+'Label'].y+layout[key+'Label'].height < layout[key].y);
            assert.ok(layout[key+'Value'].x>=layout[key+'Label'].x+layout[key+'Label'].width);
            assert.ok(layout[key].y+layout[key].height<=height-node.actorPadding);
        }
    }
    const overrides={hp:{x:20,y:120,width:170,height:12,shape:'chamfer',color:'#123456'},hpValue:{x:30,y:90,fontSize:18},unknown:{x:42}};
    const clean=ui.normalizeActorElements(overrides);
    assert.deepEqual(JSON.parse(JSON.stringify(clean)),Editor.normalizeActorElements(overrides));
    assert.equal(clean.unknown,undefined);
    const node=ui.normalizeNode({type:'list',rowLayout:'actorPanel',actorElements:overrides});
    const layout=ui.actorPanelLayout(node,600,240,28);
    assert.equal(layout.hp.height,12);assert.equal(layout.hp.shape,'chamfer');assert.equal(layout.hpValue.fontSize,18);
});

test('Formation upgrade is one-time, respects disabled System commands, and preserves authored nodes', () => {
    const {ReactorUI:ui}=loadRuntimeUI(), Editor=require('../src/database/DatabaseUserInterfaceEditor.js');
    const entry={stock:'menu',nodes:[{id:1,type:'box',name:'Commands'},
        {id:2,type:'button',parent:1,x:12,y:120,height:36,action:{type:'personalStatus'}},
        {id:3,type:'button',parent:1,y:156,height:36,action:{type:'scene',scene:'options'}},
        {id:4,type:'image',x:24,y:70}]};
    const nodes=ui.upgradeMenuFormation(entry,true,'Formation');
    assert.deepEqual(JSON.parse(JSON.stringify(nodes)),Editor.upgradeMenuFormation(entry,true,'Formation'));
    assert.equal(nodes.find(n=>n.action?.type==='formation').y,156);
    assert.equal(nodes.find(n=>n.id===3).y,192);assert.equal(entry.nodes[2].y,156);
    assert.deepEqual(JSON.parse(JSON.stringify(nodes.find(n=>n.id===4))),entry.nodes[3]);
    assert.equal(ui.upgradeMenuFormation(entry,false,'Formation'),entry.nodes);
    assert.equal(ui.upgradeMenuFormation({...entry,menuCommandVersion:2},true,'Formation'),entry.nodes);
});

test('Custom actor commands opt in to actor selection and prepare plugin scenes with the selected actor', () => {
    const sandbox=loadRuntimeUI(),ui=sandbox.ReactorUI;
    assert.equal(ui.isPersonalAction(ui.normalizeAction({type:'script'})),false);
    assert.equal(ui.isPersonalAction(ui.normalizeAction({type:'pluginCommand',actorFirst:true})),true);
    const actor={actorId:()=>2}, scene=Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._contexts=new Map([['selectedActor',{kind:'actor',id:2,data:actor}]]);
    scene.focusedWindow=()=>null;
    sandbox.Scene_TestPlugin=function(){};
    let pushed;
    scene.pushScene=(cls,args)=>{pushed={cls,args};};
    scene.runAction(ui.normalizeAction({type:'pluginScene',sceneClass:'Scene_TestPlugin',argsExpression:'[actor.actorId()]',contextName:'selectedActor'}));
    assert.equal(pushed.cls,sandbox.Scene_TestPlugin);assert.equal(pushed.args[0],2);
    scene.runAction(ui.normalizeAction({type:'script',script:'scene.chosen = actor.actorId();',contextName:'selectedActor'}));
    assert.equal(scene.chosen,2);
});

test('Formation disables confirmation for locked actors and when the game disables formation', () => {
    const sandbox=loadRuntimeUI();let locked=true,enabled=true;
    sandbox.$gameSystem={isFormationEnabled:()=>enabled};
    const row={enabled:true,data:{isFormationChangeOk:()=>!locked}};
    const list=Object.create(sandbox.Window_ReactorUIList.prototype);
    list._uiEnabled=true;list.selectedRow=()=>row;
    list._uiScene={_actorSelection:{action:{type:'formation'}}};
    assert.equal(list.isCurrentItemEnabled(),false);
    locked=false;assert.equal(list.isCurrentItemEnabled(),true);
    enabled=false;assert.equal(list.isCurrentItemEnabled(),false);
    list._uiScene._actorSelection=null;assert.equal(list.isCurrentItemEnabled(),true);
});

test('custom scripts and plugin commands that push scenes retain menu state without closing twice', () => {
    const sandbox=loadRuntimeUI(),ui=sandbox.ReactorUI;
    const actor={actorId:()=>2,name:()=> 'Carol Everson'};
    const scene=Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._contexts=new Map([['hero',{kind:'actor',id:2,data:actor}]]);
    scene.focusedWindow=()=>null;scene._closing=false;
    let remembered=0,closed=0,args;
    scene.rememberForPush=()=>remembered++;scene.close=()=>closed++;
    sandbox.SceneManager.push=()=>sandbox.SceneManager._stack.push(sandbox.Scene_ReactorUI);
    scene.runAction(ui.normalizeAction({type:'script',contextName:'hero',script:'SceneManager.push(Scene_Status);',andClose:true}));
    assert.equal(remembered,1);assert.equal(closed,0);assert.equal(scene._closing,true);
    scene._closing=false;sandbox.$gameMap._interpreter={};
    sandbox.PluginManager.callCommand=(_interpreter,_plugin,_command,values)=>{args=values;sandbox.SceneManager.push();};
    scene.runAction(ui.normalizeAction({type:'pluginCommand',contextName:'hero',args:{actorId:'{actor.id}',name:'{actor.name}'},andClose:true}));
    assert.deepEqual(JSON.parse(JSON.stringify(args)),{actorId:'2',name:'Carol Everson'});
    assert.equal(remembered,2);assert.equal(closed,0);assert.equal(scene._closing,true);
});

test('custom Actor Panel parts and States survive editor/runtime normalization',()=>{
    const Editor=require('../src/database/DatabaseUserInterfaceEditor.js');
    const ui=loadRuntimeUI().ReactorUI;
    const raw={states:{x:8,y:160,width:128,height:24,iconSize:20,iconGap:3},custom_1:{kind:'gauge',name:'Energy',gauge:'variable',variableId:4,maxVariableId:5,max:80,shape:'circular',thickness:6,x:32,y:40,width:80,height:80},custom_2:{kind:'label',text:'Energy: \\V[4]'},custom_3:{kind:'value',gauge:'atk',valueFormat:'current'},custom_4:{kind:'box',color:'#123456'}};
    assert.deepEqual(JSON.parse(JSON.stringify(ui.normalizeActorElements(raw))),Editor.normalizeActorElements(raw));
    const node=ui.normalizeNode({type:'list',source:'party',rowLayout:'actorPanel',actorLayoutVersion:2,actorFields:['name'],actorElements:raw});
    assert.ok(node.actorFields.includes('states'),'existing panels gain States');
    assert.equal(ui.normalizeNode({...node,actorFields:['name']}).actorFields.includes('states'),false,'explicitly disabled States remain off after save');
    const layout=ui.actorPanelLayout(node,600,256,24);
    assert.equal(layout.custom_1.shape,'circular');assert.equal(layout.custom_2.text,'Energy: \\V[4]');assert.equal(layout.states.iconSize,20);
    assert.deepEqual(JSON.parse(JSON.stringify(layout)),Editor.actorPanelLayout(node,600,256,24));
});

test('variable gauges resolve live values and status/variable changes invalidate Actor Panel display',()=>{
    const sandbox=loadRuntimeUI(),ui=sandbox.ReactorUI;
    sandbox.ColorManager={textColor:()=> '#ffffff'};
    sandbox.$gameVariables.setValue(4,30);sandbox.$gameVariables.setValue(5,120);
    const element={kind:'gauge',gauge:'variable',variableId:4,maxVariableId:5};
    let data=ui.actorGaugeData({},'variable',element);assert.equal(data.value,30);assert.equal(data.max,120);assert.equal(data.rate,.25);
    const actor={hp:100,mp:20,allIcons:()=>[12]},node={actorElements:{custom_1:element}},rows=[{data:actor}];
    const before=ui.actorPanelRevision(node,rows);sandbox.$gameVariables.setValue(4,60);
    assert.notEqual(ui.actorPanelRevision(node,rows),before);
    const after=ui.actorPanelRevision(node,rows);actor.allIcons=()=>[12,14];assert.notEqual(ui.actorPanelRevision(node,rows),after);
    sandbox.$gameVariables.setValue(5,0);data=ui.actorGaugeData({},'variable',element);assert.equal(data.rate,0,'zero maximum does not produce NaN or infinity');
});

test('circular gauge draws a bounded progress ring and reserves layout height',()=>{
    const ui=loadRuntimeUI().ReactorUI,arcs=[];
    const ctx={save(){},restore(){},createLinearGradient(){return{addColorStop(){}};},beginPath(){},arc(...args){arcs.push(args);},stroke(){}};
    ui.drawActorGauge(ctx,{x:0,y:0,width:80,height:80},{shape:'circular',thickness:8},.25,['#fff','#fff','#000']);
    assert.deepEqual(arcs[0],[40,40,36,0,Math.PI*2]);assert.deepEqual(arcs[1],[40,40,36,-Math.PI/2,0]);assert.equal(ctx.lineWidth,8);
    const node={actorFields:['hp','mp'],actorElements:{hp:{shape:'circular',width:80,height:80}}};
    const layout=ui.actorPanelLayout(node,500,300,24);assert.ok(layout.mpLabel.y>=layout.hp.y+80,'next gauge label follows the taller circle');
});


// --- Item, Skill, Equip and Shop workflows ------------------------------

/** A small party, inventory and database the workflow tests share. */
function workflowWorld(sandbox) {
    const items = [null,
        { id: 1, name: 'Potion', iconIndex: 176, itypeId: 1, price: 50, scope: 7, occasion: 0, description: 'Heals', etypeId: 0 },
        { id: 2, name: 'Key', iconIndex: 195, itypeId: 2, price: 0, scope: 0, occasion: 0, description: 'Opens', etypeId: 0 },
        { id: 3, name: 'Elixir', iconIndex: 177, itypeId: 1, price: 400, scope: 8, occasion: 0, description: 'All', etypeId: 0 },
        { id: 4, name: 'Scroll', iconIndex: 178, itypeId: 1, price: 30, scope: 0, occasion: 0, description: 'Calls', etypeId: 0 }];
    const weapons = [null, { id: 1, name: 'Sword', iconIndex: 97, price: 300, etypeId: 1 }, { id: 2, name: 'Axe', iconIndex: 98, price: 200, etypeId: 1 }];
    const armors = [null, { id: 1, name: 'Shield', iconIndex: 128, price: 100, etypeId: 2 }];
    const skills = [null, { id: 1, name: 'Heal', iconIndex: 72, stypeId: 1, scope: 7, mpCost: 5, description: 'Heal one' }, { id: 2, name: 'Fire', iconIndex: 64, stypeId: 2, scope: 1, mpCost: 4 }];
    Object.assign(sandbox, { $dataItems: items, $dataWeapons: weapons, $dataArmors: armors, $dataSkills: skills });
    sandbox.$dataSystem.itemCategories = [true, true, false, true];
    sandbox.$dataSystem.skillTypes = ['', 'Magic', 'Special'];
    sandbox.$dataSystem.equipTypes = ['', 'Weapon', 'Shield'];
    sandbox.TextManager = { item: 'Items', weapon: 'Weapons', armor: 'Armors', keyItem: 'Key Items', currencyUnit: 'G', param: id => ['MHP', 'MMP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK'][id] };
    sandbox.DataManager = Object.assign(sandbox.DataManager, {
        isItem: item => items.includes(item), isWeapon: item => weapons.includes(item), isArmor: item => armors.includes(item), isSkill: item => skills.includes(item)
    });
    const counts = new Map([[items[1], 3], [items[2], 1], [items[3], 1], [items[4], 2], [weapons[2], 1], [armors[1], 1]]);
    const log = [];
    const makeActor = (id, name, pha) => ({
        _id: id, hp: 50, mhp: 100, pha, equipsList: [weapons[1], null], atkBonus: 0,
        actorId() { return id; }, name() { return name; },
        skillTypes() { return [1, 2]; }, skills() { return [skills[1], skills[2]]; },
        canUse(item) { return item === skills[2] ? false : (skills.includes(item) || (counts.get(item) || 0) > 0); },
        skillMpCost(skill) { return skill.mpCost; }, skillTpCost() { return 0; },
        equipSlots() { return [1, 2]; }, equips() { return this.equipsList; },
        isEquipChangeOk(slot) { return slot !== 1 || id !== 2; },
        canEquip(item) { return item.etypeId === 1 || item.etypeId === 2; },
        changeEquip(slot, item) { log.push(['equip', id, slot, item && item.name]); this.equipsList[slot] = item; },
        forceChangeEquip(slot, item) { this.equipsList[slot] = item; },
        param(id) { return id === 2 ? 10 + (this.equipsList[0] ? this.equipsList[0].id * 5 : 0) : 1; },
        useItem(item) { log.push(['use', name, item.name]); if (counts.has(item)) counts.set(item, counts.get(item) - 1); },
        optimizeEquipments() { log.push(['optimize', id]); }, clearEquipments() { log.push(['clear', id]); }
    });
    const hero = makeActor(1, 'Hero', 1), mage = makeActor(2, 'Mage', 3);
    let gold = 500;
    Object.assign(sandbox.$gameParty, {
        members: () => [hero, mage], movableMembers: () => [hero, mage], menuActor: () => hero, setMenuActor() {},
        allItems: () => [...counts.keys()].filter(item => counts.get(item) > 0),
        numItems: item => counts.get(item) || 0, maxItems: () => 99, canUse: item => item !== items[2] && (counts.get(item) || 0) > 0,
        gold: () => gold, gainGold: n => { gold += n; }, loseGold: n => { gold -= n; },
        gainItem: (item, n) => counts.set(item, (counts.get(item) || 0) + n), loseItem: (item, n) => counts.set(item, (counts.get(item) || 0) - n)
    });
    sandbox.$gameActors = { actor: id => [null, hero, mage][id] || null };
    sandbox.$gameTemp = { _ce: 0, isCommonEventReserved() { return this._ce > 0; } };
    sandbox.JsonEx = { makeDeepCopy: actor => Object.assign(Object.create(Object.getPrototypeOf(actor)), actor, { equipsList: actor.equipsList.slice() }) };
    sandbox.Game_Action = class {
        constructor(user) { this.user = user; }
        setItemObject(item) { this.item = item; }
        isForFriend() { return [7, 8, 11].includes(this.item.scope); }
        isForAll() { return this.item.scope === 8; }
        isForUser() { return this.item.scope === 11; }
        testApply(target) { return target.hp < target.mhp; }
        numRepeats() { return 1; }
        apply(target) { log.push(['apply', this.item.name, target.name()]); target.hp = target.mhp; }
        applyGlobal() { if (this.item === items[4]) sandbox.$gameTemp._ce = 9; }
    };
    const sounds = [];
    sandbox.SoundManager = new Proxy({}, { get: (target, name) => () => sounds.push(String(name)) });
    return { items, weapons, armors, skills, hero, mage, counts, log, sounds, gold: () => gold };
}

/** A stand-in list window around real rows, enough for the scene's workflow code. */
function fakeList(sandbox, scene, raw) {
    const node = sandbox.ReactorUI.normalizeNode(Object.assign({ type: 'list' }, raw));
    const win = {
        node: () => node, visible: true, _uiRows: [], _uiRefreshWait: 0, _index: 0, active: false, fixed: false,
        isFocusable: () => true, isEnabled: () => true, setFocused(value) { this.focused = value; },
        maxItems() { return this._uiRows.length; }, index() { return this._index; },
        selectedRow() { return this._uiRows[this._index] || null; },
        select(index) { this._index = index; scene.setContext(node.contextName, this.selectedRow()); },
        isCurrentItemEnabled() { const row = this.selectedRow(); return !!row && row.enabled !== false; },
        activate() { this.active = true; }, deactivate() { this.active = false; },
        setCursorFixed(value) { this.fixed = value; }, refreshCursor() {}, refresh() {},
        reload() { this._uiRows = sandbox.ReactorUI.listRows(node, scene); return this; }
    };
    return win;
}

test('item categories, skill types, equipment slots and shop lists follow the list they filter on', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const world = workflowWorld(sandbox);
    const scene = new sandbox.Scene_ReactorUI();
    const rows = raw => ui.listRows(ui.normalizeNode(Object.assign({ type: 'list' }, raw)), scene);
    assert.deepEqual([...rows({ dataSource: 'itemCategories' }).map(row => row.id)], ['item', 'weapon', 'keyItem'], 'Armors is off in System');
    const items = { dataSource: 'inventory', filterContext: 'category', action: { type: 'use' } };
    assert.equal(rows(items).length, 0, 'nothing until a category is chosen');
    scene.setContext('category', rows({ dataSource: 'itemCategories' })[0]);
    const potions = rows(items);
    assert.deepEqual([...potions.map(row => row.name)], ['Potion', 'Elixir', 'Scroll']);
    scene.setContext('category', rows({ dataSource: 'itemCategories' })[2]);
    const keys = rows(items);
    assert.deepEqual([...keys.map(row => [row.name, row.enabled])].map(pair => [...pair]), [['Key', false]], 'a key item cannot be used from the menu');

    const types = rows({ dataSource: 'skillTypes', actorSource: 'menuActor' });
    assert.deepEqual([...types.map(row => row.name)], ['Magic', 'Special']);
    scene.setContext('type', types[0]);
    const magic = rows({ dataSource: 'skills', actorSource: 'menuActor', filterContext: 'type' });
    assert.deepEqual([...magic.map(row => [row.name, row.cost])].map(pair => [...pair]), [['Heal', '\\C[23]5\\C[0]']]);

    const slots = rows({ dataSource: 'actorEquipment', actorSource: 'menuActor' });
    assert.deepEqual([...slots.map(row => [row.slot, row.name, row.enabled])].map(entry => [...entry]), [[0, 'Sword', true], [1, 'Shield', true]], 'an empty slot is still a slot you can fill');
    scene.setContext('slot', slots[0]);
    const candidates = rows({ dataSource: 'equipCandidates', actorSource: 'menuActor', filterContext: 'slot' });
    assert.deepEqual([...candidates.map(row => [row.kind, row.id])].map(entry => [...entry]), [['weapon', 2], ['none', 0]], 'the slot\'s type only, and a row to take it off');

    scene._shopGoods = [[0, 1, 0, 0], [1, 1, 1, 450], [2, 1, 1, 900]];
    const goods = rows({ dataSource: 'shopGoods' });
    assert.deepEqual([...goods.map(row => [row.name, row.price, row.enabled])].map(entry => [...entry]), [['Potion', 50, true], ['Sword', 450, true], ['Shield', 900, false]],
        'the database price or the shop\'s own, and only what the party can afford');
    scene.setContext('sellCategory', rows({ dataSource: 'itemCategories' })[0]);
    const sell = rows({ dataSource: 'shopSell', filterContext: 'sellCategory' });
    assert.deepEqual([...sell.map(row => [row.name, row.price])].map(entry => [...entry]), [['Potion', 25], ['Elixir', 200], ['Scroll', 15]], 'half price');
});

test('equipment parameters compare against the candidate while the candidate list has focus', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const world = workflowWorld(sandbox);
    const scene = new sandbox.Scene_ReactorUI();
    const params = fakeList(sandbox, scene, { dataSource: 'actorParameters', actorSource: 'menuActor', compareContext: 'candidate' });
    const candidates = fakeList(sandbox, scene, { dataSource: 'equipCandidates', actorSource: 'menuActor', contextName: 'candidate' });
    scene._nodeWindows = [params, candidates];
    scene.setContext('candidate', { key: 'weapon:2', kind: 'weapon', slot: 0, data: world.weapons[2] });
    assert.equal(params.reload()._uiRows[2].newValue, '', 'no comparison while another list has focus');
    scene._focusIndex = 1;
    const atk = params.reload()._uiRows[2];
    assert.equal(atk.paramValue, 15);
    assert.equal(atk.newValue, '\\C[24]20\\C[0]', 'a rise draws in the power-up colour');
    assert.equal(atk.change, 5);
    assert.equal(world.hero.equipsList[0], world.weapons[1], 'the comparison never touches the real actor');
    params._uiRefreshWait = 0;
    scene.setContext('candidate', { key: 'weapon:2', kind: 'weapon', slot: 0, data: world.weapons[2] });
    assert.equal(params._uiRefreshWait, 0, 'the same row again changes nothing');
    scene.setContext('candidate', { key: 'equip:none', kind: 'none', slot: 0, data: null });
    assert.equal(params._uiRefreshWait, 15, 'a new candidate redraws the comparison at once');
});

test('Use picks a target in the party panel by scope, applies the item, and stays for another use', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const world = workflowWorld(sandbox);
    const scene = new sandbox.Scene_ReactorUI();
    scene._interface = { nodes: [] };
    scene.updateConditions = () => {};
    const list = fakeList(sandbox, scene, { dataSource: 'inventory', category: 'item', action: { type: 'use', contextName: 'target' }, contextName: 'item' }).reload();
    const panel = fakeList(sandbox, scene, { dataSource: 'party', rowLayout: 'actorPanel', contextName: 'target' }).reload();
    scene._nodeWindows = [list, panel];
    scene._focusIndex = 0;
    world.hero.hp = 10;
    world.mage.hp = 20;
    list.select(0);
    scene.activateWindow(list);
    assert.equal(scene.focusedWindow(), panel, 'a potion for one ally asks who');
    assert.equal(scene.isSelectingTarget(), true);
    panel.select(1);
    scene.activateWindow(panel);
    assert.deepEqual(world.log.slice(-2).map(entry => [...entry]), [['use', 'Mage', 'Potion'], ['apply', 'Potion', 'Mage']], 'the best-PHA member uses it on the one chosen');
    assert.equal(world.counts.get(world.items[1]), 2);
    assert.equal(scene.focusedWindow(), panel, 'the panel stays up for another use, as the stock screen does');
    scene.activateWindow(panel);
    assert.equal(world.sounds.at(-1), 'playBuzzer', 'a full-health target gains nothing');
    scene.cancelInterface(true);
    assert.equal(scene.focusedWindow(), list);
    assert.equal(scene.isSelectingTarget(), false);

    list.select(1);
    scene.activateWindow(list);
    assert.equal(panel._uiCursorAll, true, 'an item for everyone selects the whole party');
    world.hero.hp = 5;
    scene.activateWindow(panel);
    assert.deepEqual(world.log.slice(-2).map(entry => [...entry]), [['apply', 'Elixir', 'Hero'], ['apply', 'Elixir', 'Mage']]);
    scene.cancelInterface(true);
    assert.equal(panel._uiCursorAll, false);

    list.select(2);
    scene.activateWindow(list);
    assert.equal(scene.focusedWindow(), list, 'an item with no ally scope is used at once');
    assert.deepEqual(world.log.at(-1), ['use', 'Mage', 'Scroll']);
    assert.deepEqual(sandbox.__sceneCalls.at(-1), ['goto', sandbox.Scene_Map], 'and a common event it reserves runs on the map');
});

test('Equip puts the candidate in its slot and hands focus back; Back on a list goes where it says', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const world = workflowWorld(sandbox);
    const scene = new sandbox.Scene_ReactorUI();
    scene._interface = { nodes: [], cancel: ui.normalizeAction({ type: 'close' }) };
    const slots = fakeList(sandbox, scene, { id: 1, dataSource: 'actorEquipment', actorSource: 'menuActor', contextName: 'slot', action: { type: 'focusNode', id: 2 } }).reload();
    const candidates = fakeList(sandbox, scene, { id: 2, dataSource: 'equipCandidates', actorSource: 'menuActor', filterContext: 'slot', contextName: 'candidate', backFocus: 1, action: { type: 'equip' } });
    scene._nodeWindows = [slots, candidates];
    scene._focusIndex = 0;
    slots.select(0);
    candidates.reload();
    scene.activateWindow(slots);
    assert.equal(scene.focusedWindow(), candidates, 'a slot opens its candidates');
    scene.cancelInterface(true);
    assert.equal(scene.focusedWindow(), slots, 'Back returns to the slots instead of closing');
    assert.equal(scene._closing, false);
    scene.runAction(ui.normalizeAction({ type: 'focusNode', id: 2 }));
    candidates.select(0);
    scene.activateWindow(candidates);
    assert.deepEqual([...world.log.at(-1)], ['equip', 1, 0, 'Axe']);
    assert.equal(world.sounds.includes('playEquip'), true);
    assert.equal(scene.focusedWindow(), slots, 'focus returns to the slots after equipping');
    candidates.select(1);
    scene.activateWindow(candidates);
    assert.deepEqual([...world.log.at(-1)], ['equip', 1, 0, null], 'the empty row takes it off');
    scene.runAction(ui.normalizeAction({ type: 'equipOptimize', contextName: 'nobody' }));
    scene.runAction(ui.normalizeAction({ type: 'equipClear', contextName: 'nobody' }));
    assert.deepEqual(world.log.slice(-2).map(entry => [...entry]), [['optimize', 1], ['clear', 1]], 'Optimize and Clear fall back to the menu actor');
});

test('the shop takes Shop Processing goods as a second prepare and buys and sells through the number window', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const world = workflowWorld(sandbox);
    let numberWindow = null;
    sandbox.Window_ShopNumber = class {
        constructor(rect) { this.rect = rect; this.handlers = {}; numberWindow = this; }
        setup(item, max, price) { Object.assign(this, { item, max, price, value: 1 }); }
        setCurrencyUnit() {} show() {} activate() {} deactivate() {}
        setHandler(name, fn) { this.handlers[name] = fn; }
        number() { return this.value; }
    };
    const scene = new sandbox.Scene_ReactorUI();
    scene.addWindow = () => {};
    scene.calcWindowHeight = () => 200;
    scene.prepare(5, 'shop');
    scene.prepare([[0, 1, 0, 0], [1, 1, 1, 450]], true);
    assert.equal(scene.interfaceId(), 5, 'the goods do not replace the interface id');
    assert.equal(scene.isPurchaseOnly(), true);
    assert.equal(scene.shopGoods().length, 2);
    scene._interface = { nodes: [] };
    const goods = fakeList(sandbox, scene, { dataSource: 'shopGoods', action: { type: 'shopBuy' } }).reload();
    Object.assign(goods, { x: 0, y: 0, width: 400, height: 300 });
    scene._nodeWindows = [goods];
    scene._focusIndex = 0;
    goods.select(1);
    scene.activateWindow(goods);
    assert.equal(numberWindow.max, 1, 'no more than the gold covers');
    assert.equal(scene.acceptsInput(), false, 'the interface waits while the number window is up');
    numberWindow.handlers.ok();
    assert.equal(world.gold(), 50);
    assert.equal(world.counts.get(world.weapons[1]), 1);
    assert.equal(scene._quantityWindow, null);
    const sell = fakeList(sandbox, scene, { dataSource: 'shopSell', category: 'item', action: { type: 'shopSell' } }).reload();
    Object.assign(sell, { x: 0, y: 0, width: 400, height: 300 });
    sell.select(0);
    scene.activateWindow(sell);
    assert.equal(numberWindow.max, 3, 'sell up to what the party holds');
    numberWindow.value = 2;
    numberWindow.handlers.ok();
    assert.equal(world.gold(), 100);
    assert.equal(world.counts.get(world.items[1]), 1);
    assert.equal(sandbox.ReactorUI.REPLACEMENTS.shop.scene, 'Scene_Shop');
});


test('a Text Input reads and writes a variable or an actor name, clamps to its length, and Name Input prepares the actor', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const hero = { _name: 'Hero', _nick: 'Kid', actorId: () => 4, name() { return this._name; }, nickname() { return this._nick; },
        setName(v) { this._name = v; }, setNickname(v) { this._nick = v; } };
    sandbox.$gameActors = { actor: id => (id === 4 ? hero : null) };
    sandbox.$gameParty.menuActor = () => null;
    const field = ui.normalizeNode({ type: 'input', variableId: 9, maxLength: 5 });
    assert.deepStrictEqual([field.inputTarget, field.maxLength, field.mask, field.onScreenKeys, field.autoEdit, field.fill], ['variable', 5, false, false, false, 'window']);
    assert.strictEqual(ui.readInput(field, null), '', 'an unset variable reads as empty, not 0');
    ui.writeInput(field, null, 'SESAME OPEN');
    assert.strictEqual(sandbox.$gameVariables.value(9), 'SESAM', 'the stored text is cut to the maximum length');
    assert.strictEqual(ui.readInput(field, null), 'SESAM');

    const scene = new sandbox.Scene_ReactorUI();
    scene.prepare(12, 'name');
    scene.prepare(4, 8);
    assert.deepStrictEqual([scene.interfaceId(), scene.sceneActor(), scene.nameMaxLength()], [12, hero, 8], 'Name Input\'s (actorId, maxLength) arrive as a second prepare');
    const name = ui.normalizeNode({ type: 'input', inputTarget: 'actorName', actorSource: 'sceneActor', maxLength: 16 });
    assert.strictEqual(ui.readInput(name, scene), 'Hero');
    ui.writeInput(name, scene, 'Ralph');
    assert.strictEqual(hero.name(), 'Ralph');
    ui.writeInput(ui.normalizeNode({ type: 'input', inputTarget: 'actorNickname', actorSource: 'sceneActor' }), scene, 'Ace');
    assert.strictEqual(hero.nickname(), 'Ace');
    assert.strictEqual(sandbox.ReactorUI.REPLACEMENTS.name.scene, 'Scene_Name');
});

test('a Text Input edits a draft: Enter commits and runs the action, Escape leaves the value as it was', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const sounds = [];
    sandbox.SoundManager = new Proxy({}, { get: (target, name) => () => sounds.push(String(name)) });
    sandbox.Input = { clear() {} };
    const scene = new sandbox.Scene_ReactorUI();
    let ran = null;
    scene.runAction = action => { ran = action; };
    const node = ui.normalizeNode({ type: 'input', variableId: 11, maxLength: 8, action: { type: 'commonEvent', id: 5 } });
    // The editing half of the node window, without a canvas.
    const field = Object.create(sandbox.Window_ReactorUINode.prototype);
    Object.assign(field, { _uiNode: node, _uiScene: scene, node: () => node, refresh() {}, isEnabled: () => true, openDomInput() {}, closeDomInput() {} });
    sandbox.$gameVariables.setValue(11, 'old');
    scene.beginInput(field);
    assert.strictEqual(scene.acceptsInput(), false, 'the interface waits while the field has the keys');
    field.setDraft('opensesame');
    assert.strictEqual(field.inputValue(), 'opensesa', 'typing is held to the maximum length');
    scene.cancelInput(field);
    assert.strictEqual(sandbox.$gameVariables.value(11), 'old', 'Escape keeps what was stored');
    assert.strictEqual(ran, null);
    scene.beginInput(field);
    field.setDraft('0451');
    scene.commitInput(field);
    assert.strictEqual(sandbox.$gameVariables.value(11), '0451');
    assert.strictEqual(ran.type, 'commonEvent', 'the node\'s action runs after the text is stored, so an event can check it');
    assert.strictEqual(field.isEditing(), false);
});


// --- Battle HUD ------------------------------------------------------------

test('a Battle HUD binds from System, places stock battle windows, follows the acting actor and points the cursor at the target', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    sandbox.$dataUserInterfaces = [null, { id: 1, mode: 'battle', nodes: [] }, { id: 2, mode: 'scene', nodes: [] }];
    sandbox.$dataSystem.reactorBattleInterfaceId = 2;
    assert.strictEqual(ui.battleInterface(), null, 'a scene record is not a battle HUD');
    sandbox.$dataSystem.reactorBattleInterfaceId = 1;
    assert.strictEqual(ui.battleInterface().id, 1);
    assert.strictEqual(Object.keys(ui.REPLACEMENTS).includes('battle'), false, 'Scene_Battle is never routed away');

    const hero = { name: () => 'Hero' }, mage = { name: () => 'Mage' };
    const moved = [];
    const commandWindow = { x: 0, y: 0, width: 10, height: 10, visible: true, openness: 255, alpha: 1, opacity: 255,
        move(x, y, w, h) { moved.push([x, y, w, h]); Object.assign(this, { x, y, width: w, height: h }); }, createContents() {}, refresh() {} };
    const enemyWindow = Object.assign({}, commandWindow, { active: false, move() {}, enemy: () => ({ name: () => 'Slime', screenX: () => 300, screenY: () => 200 }) });
    const panel = { visible: true, x: 100, y: 500, padding: 12, _uiRows: [{ data: hero }, { data: mage }],
        node: () => ({ type: 'list', dataSource: 'party' }), itemRect: index => ({ x: index * 200, y: 0, width: 200, height: 120 }) };
    const scene = { _windowLayer: { x: 0, y: 0 }, _actorCommandWindow: commandWindow, _enemyWindow: enemyWindow, _spriteset: { _enemySprites: [] } };
    const hud = { _nodeWindows: [panel], _visibilityAlpha: 1, _interface: { hideStatusWindow: true } };
    hud.slotRect = actor => ui.battleSlotRect(hud, actor);
    assert.deepStrictEqual({ ...hud.slotRect(mage) }, { x: 312, y: 512, width: 200, height: 120 }, 'a row of the party panel in window-layer space');

    const node = ui.normalizeNode({ type: 'battleWindow', battleWindow: 'actorCommand', followActor: true, x: 10, y: -150, width: 180, height: 140,
        windowColumns: 2, fill: 'none', slideY: 30, slideDuration: 10 });
    const entry = { node, rect: new sandbox.Rectangle(0, 0, 180, 140) };
    let acting = mage;
    sandbox.BattleManager = { actor: () => acting };
    ui.placeBattleWindow(scene, hud, entry);
    assert.deepStrictEqual(moved[0], [0, 0, 180, 140], 'sized once to the node');
    assert.strictEqual(commandWindow.maxCols(), 2);
    assert.strictEqual(commandWindow.opacity, 0, 'no skin for Fill None');
    assert.deepStrictEqual([commandWindow.x, commandWindow.y], [322, 362 + 30], 'over the acting actor, sliding in');
    for (let i = 0; i < 10; i++) ui.placeBattleWindow(scene, hud, entry);
    assert.deepStrictEqual([commandWindow.x, commandWindow.y], [322, 362]);
    acting = null;
    ui.placeBattleWindow(scene, hud, entry);
    assert.deepStrictEqual([commandWindow.x, commandWindow.y], [322, 362], 'between actors it stays where it last followed');
    acting = hero;
    ui.placeBattleWindow(scene, hud, entry);
    assert.strictEqual(commandWindow.x, 122);
    const hidden = { node: ui.normalizeNode({ type: 'battleWindow', battleWindow: 'enemy', hideWindow: true }), rect: new sandbox.Rectangle(0, 0, 0, 0) };
    ui.placeBattleWindow(scene, hud, hidden);
    assert.strictEqual(enemyWindow.alpha, 0, 'hidden, but still the window that takes the input');

    const cursor = ui.normalizeNode({ type: 'battleCursor', enemyOffsetY: -10 });
    assert.strictEqual(ui.battleTarget(scene, hud, cursor), null, 'nothing to point at outside target selection');
    enemyWindow.active = true;
    assert.deepStrictEqual({ ...ui.battleTarget(scene, hud, cursor), battler: 'x' }, { battler: 'x', x: 300, y: 126 }, 'over the enemy, less its height and the offset');
    enemyWindow.active = false;
    scene._actorWindow = { active: true, index: () => 1, actor: () => mage };
    const ally = ui.battleTarget(scene, hud, cursor);
    assert.deepStrictEqual([ally.battler, ally.x, ally.y], [mage, 412, 512], 'over the ally\'s HUD row');
});

test('portrait reactions follow MOG: hurt shakes on frame 3, healing and acting zoom on frames 1 and 2, then low HP and fallen', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    sandbox.Graphics = { frameCount: 0 };
    const actor = { hp: 100, mhp: 100, isDead() { return this.hp <= 0; } };
    assert.deepStrictEqual({ ...ui.faceState(actor) }, { frame: 0, shake: 0, zoom: 1 });
    ui.faceEvent(actor, 'hurt');
    sandbox.Graphics.frameCount = 1;
    const hurt = ui.faceState(actor);
    assert.deepStrictEqual([hurt.frame, hurt.zoom, Math.abs(hurt.shake) <= 6], [3, 1, true]);
    ui.faceEvent(actor, 'act');
    sandbox.Graphics.frameCount = 36;
    for (let f = 2; f <= 36; f++) { sandbox.Graphics.frameCount = f; ui.faceState(actor); }
    const acting = ui.faceState(actor);
    assert.strictEqual(acting.frame, 2);
    assert.ok(acting.zoom > 1.2, 'at its largest halfway through');
    for (let f = 37; f <= 80; f++) { sandbox.Graphics.frameCount = f; ui.faceState(actor); }
    actor.hp = 20;
    assert.strictEqual(ui.faceState(actor).frame, 3, 'below 30% HP the hurt face stays');
    actor.hp = 0;
    assert.strictEqual(ui.faceState(actor).frame, 4);
    assert.strictEqual(ui.spritePortrait(ui.normalizeNode({ type: 'list', portraitMotion: true })), true);
    assert.strictEqual(ui.isSpriteElement({}, { kind: 'gauge', gauge: 'atb' }), true, 'the ATB bar redraws on its own, not with the row');
});

test('HUD pictures load softly by folder reference, and a two-row meter draws its damage trail under the value', () => {
    const sandbox = loadRuntimeUI(), ui = sandbox.ReactorUI;
    const loads = [];
    sandbox.Utils.encodeURI = value => encodeURIComponent(value);
    sandbox.Bitmap = { load: url => { const bitmap = { url, width: 65, height: 10, ready: !url.includes('Missing'), isReady() { return this.ready; }, isError() { return url.includes('Missing'); } }; loads.push(url); return bitmap; } };
    assert.strictEqual(ui.softImage('system/BattleHud_HP_Meter').url, 'img/system/BattleHud_HP_Meter.png');
    assert.strictEqual(ui.softImage('Hero Face').url, 'img/pictures/Hero%20Face.png', 'a bare name is a picture');
    ui.softImage('system/BattleHud_HP_Meter');
    assert.strictEqual(loads.length, 2, 'loaded once');
    const blits = [];
    const target = { blt: (...args) => blits.push(args.slice(1, 9)) };
    const box = { x: 10, y: 20, width: 130, height: 5 };
    assert.strictEqual(ui.drawImageMeter(target, box, 'system/BattleHud_HP_Meter', 0.5, () => {}, 2, 0.8), true);
    assert.deepStrictEqual(blits.map(args => [...args]), [[0, 5, 52, 5, 10, 20, 104, 5], [0, 0, 32, 5, 10, 20, 65, 5]],
        'the trail row at 80% first, then the meter row at 50%');
    assert.strictEqual(ui.drawImageMeter(target, box, 'system/Missing', 0.5, () => {}, 2, 0.5), false, 'a missing picture leaves the drawn gauge to the caller');
    assert.strictEqual(ui.drawImageNumber(target, box, 'system/Missing', '12', 'left', () => {}), false);
});
