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
    assert.match(runtimeSource, /NODE_TYPES = \["box", "image", "text", "button", "list", "gauge"\]/);
    assert.match(editorSource, /NODE_TYPES\(\) \{ return \['box', 'image', 'text', 'button', 'list', 'gauge'\]; \}/);
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
    assert.match(system2, /entry\.mode === 'overlay'/);
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
    assert.equal('reactorMenuInterfaceId' in system, false);
    assert.equal(editor.setReplacementRole('status', false), true, 'an existing invalid overlay reference can still be removed');
    assert.equal(system.reactorStatusInterfaceId, 0);
});

test('System 2 selector options include matching scene roles and expose invalid selected ids safely', () => {
    const previousWindow = global.window;
    const previousEscape = global.rrEscapeHtml;
    const previousDocument = global.document;
    global.window = {};
    global.rrEscapeHtml = value => String(value);
    global.document = { createElement: () => ({ className: '', innerHTML: '' }) };
    try {
        const System2 = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseSystem2Editor.js'));
        const manager = { getUserInterfaces: () => [
            { id: 1, name: 'Menu', mode: 'scene', roles: ['menu'] },
            { id: 2, name: 'HUD', mode: 'overlay' },
            { id: '3', name: 'Status', mode: 'scene', roles: ['status'] }
        ] };
        const editor = new System2(manager);
        const valid = editor.userInterfaceOptions(3, 'status');
        assert.match(valid, /value="0"/);
        assert.doesNotMatch(valid, /value="1"/);
        assert.match(valid, /value="3" selected/);
        assert.doesNotMatch(valid, /value="2"/);
        assert.match(editor.userInterfaceOptions(9, 'status'), /value="9" selected>\(Missing\) \/ \(incompatible\) #9/);
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
        '["title","menu","status","gameEnd","options","save","load"]',
        'Item, Skill, Equip, Shop, Name, and Battle are outside this replacement phase');
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
