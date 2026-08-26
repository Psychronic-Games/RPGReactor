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
        Scene_MenuBase: stub(),
        Scene_Boot: stub(),
        Scene_Map: stub(),
        DataManager: { isTitleSkip: () => false },
        PluginManager: { _commands: {}, registerCommand(plugin, name, fn) { this._commands[plugin + ':' + name] = fn; } },
        SceneManager: { _stack: [], push() {}, prepareNextScene() {} },
        $gameSwitches: { value: id => id === 7 },
        $gameVariables: { value: id => (id === 3 ? 42 : 0) },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('runtime/reactor_ui.js'), sandbox);
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

test('conditions read switches and variables, and scripts that throw read as false', () => {
    const { ReactorUI } = loadRuntimeUI();
    const evaluate = raw => ReactorUI.evaluateCondition(ReactorUI.normalizeCondition(raw), null);
    assert.equal(evaluate({ type: 'always' }), true);
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

test('the editor owns UserInterfaces.json as a database file that older projects may lack', () => {
    const manager = read('editor/src/DatabaseManager.js');
    assert.match(manager, /\['userInterfaces', 'UserInterfaces\.json'\]/);
    assert.match(manager, /loaded\.userInterfaces = \[null\]/, 'an absent file reads as the null-slot array');
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
    assert.match(ui, /userInterfaces: \{ name: 'New Interface', mode: 'scene', background: 'blur', cancel: \{ type: 'close' \}, firstFocus: 0, nodes: \[\], note: '' \}/);
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
    const runtimeActions = runtimeSource.match(/"none", "close", "closeAll", "callInterface", "commonEvent", "scene",\s*"pluginCommand", "switch", "variable", "script"/);
    assert.ok(runtimeActions, 'runtime action list');
    assert.match(editorSource, /\['none', 'close', 'closeAll', 'callInterface', 'commonEvent', 'scene', 'pluginCommand', 'switch', 'variable', 'script'\]/);
    assert.match(runtimeSource, /NODE_TYPES = \["box", "image", "text", "button"\]/);
    assert.match(editorSource, /NODE_TYPES\(\) \{ return \['box', 'image', 'text', 'button'\]; \}/);
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
