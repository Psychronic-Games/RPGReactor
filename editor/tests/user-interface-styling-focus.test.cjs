'use strict';
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
    const SceneMenuBase = stub();
    const sandbox = {
        console, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' },
        require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true }, Graphics: { width: 320, height: 180, boxWidth: 320, boxHeight: 180 },
        Window_Base: stub(), Window_Selectable: stub(), Scene_MenuBase: SceneMenuBase, Scene_Boot: stub(), Scene_Map: stub(),
        Scene_Title: stub(), Scene_Menu: stub(), Scene_Status: stub(), Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(),
        DataManager: { isTitleSkip: () => false }, ConfigManager: {},
        PluginManager: { registerCommand() {} }, SceneManager: { _stack: [], push() {}, goto() {}, prepareNextScene() {} },
        $dataSystem: { variables: [], versionId: 1 }, $gameSystem: {}, $gameMap: {}, $gamePlayer: {},
        $gameSwitches: { _on: true, value() { return this._on; } }, $gameVariables: { value: () => 0 },
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

function focusWindow(id, x, y, visible = true) {
    return {
        x, y, width: 20, height: 20, visible, _focused: false,
        node: () => ({ id, type: 'button' }), isFocusable: () => true,
        setFocused(value) { this._focused = value; }, setPressed() {}, isEnabled: () => true
    };
}

test('directional overrides prefer a valid target and otherwise use geometric fallback', () => {
    const { ReactorUI, Scene_ReactorUI } = runtime();
    const current = focusWindow(1, 0, 0);
    current.node = () => ({ id: 1, type: 'button', focusRight: 2 });
    const explicit = focusWindow(2, 200, 0, false);
    const nearest = focusWindow(3, 40, 0);
    const scene = Object.create(Scene_ReactorUI.prototype);
    scene._nodeWindows = [current, explicit, nearest];
    scene._focusIndex = 0;
    scene.moveFocus('right');
    assert.equal(scene.focusedWindow(), nearest, 'hidden override falls back to geometry');
    scene.setFocus(0);
    explicit.visible = true;
    scene.moveFocus('right');
    assert.equal(scene.focusedWindow(), explicit, 'valid override wins even when it is farther away');
    assert.deepEqual([ReactorUI.normalizeNode({ type: 'button' }).focusUp, ReactorUI.normalizeNode({ type: 'list' }).focusRight], [0, 0]);
});

test('typography normalization and Bitmap settings cover every authored field', () => {
    const sandbox = runtime();
    const node = sandbox.ReactorUI.normalizeNode({ type: 'text', fontFace: 'Alegreya', fontBold: 1, fontItalic: true,
        outline: true, outlineColor: '#123456', outlineWidth: 7, letterSpacing: 4 });
    assert.deepEqual([node.fontFace, node.fontBold, node.fontItalic, node.outlineColor, node.outlineWidth, node.letterSpacing],
        ['Alegreya', true, true, '#123456', 7, 4]);
    sandbox.Window_Base.prototype.resetFontSettings = function() {
        Object.assign(this.contents, { fontFace: 'GameFont', fontSize: 26, fontBold: false, fontItalic: false,
            outlineColor: '#000000', outlineWidth: 3 });
    };
    const win = Object.create(sandbox.Window_ReactorUINode.prototype);
    win._uiNode = node; win._uiFontScale = 1; win._uiEnabled = true; win._uiFocused = false; win._uiPressed = false;
    win.contents = { context: { letterSpacing: '0px', textLetterSpacing: '0px' } };
    win.changeTextColor = color => { win.color = color; };
    win.resetFontSettings();
    assert.deepEqual([win.contents.fontFace, win.contents.fontBold, win.contents.fontItalic, win.contents.outlineColor,
        win.contents.outlineWidth, win.contents.context.letterSpacing], ['Alegreya', true, true, '#123456', 7, '4px']);
    assert.equal(sandbox.ReactorUI.normalizeNode({ type: 'button', outline: false, outlineWidth: 9 }).outlineWidth, 0,
        'legacy outline=false remains authoritative');
});

test('nine-slice segment math matches the editor and clamps undersized destinations', () => {
    const { ReactorUI } = runtime();
    const insets = { left: 30, top: 20, right: 30, bottom: 20 };
    const actual = ReactorUI.nineSliceSegments(100, 80, 40, 20, insets);
    const editor = Editor.nineSliceSegments(100, 80, 40, 20, insets);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), editor);
    assert.equal(actual.length, 4, 'the zero-sized center is omitted when borders consume the destination');
    assert.equal(Math.max(...actual.map(part => part.dx + part.dw)), 40);
    assert.equal(Math.max(...actual.map(part => part.dy + part.dh)), 20);
    assert.equal(ReactorUI.normalizeNode({ type: 'image', source: 'face', nineSlice: true }).nineSlice, false);
    assert.equal(ReactorUI.normalizeNode({ type: 'image', source: 'system', nineSlice: true }).nineSlice, true);
});

test('sparse visual states inherit base values and input resolves one pressed state', () => {
    const sandbox = runtime();
    const base = sandbox.ReactorUI.normalizeNode({ type: 'button' });
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.ReactorUI.controlStyle(base, 'disabled'))), {
        fillColor: '', textColor: '', borderColor: '', opacity: '', offsetX: 0, offsetY: 0
    });
    const node = sandbox.ReactorUI.normalizeNode({ type: 'button', focusedFillColor: '#112233', focusedTextColor: '#ffffff',
        focusedBorderColor: '#abcdef', focusedOpacity: 220, pressedOffsetX: 2, pressedOffsetY: 3, pressedOpacity: 180,
        disabledFillColor: '#222222', disabledTextColor: '#777777', disabledOpacity: 90 });
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.ReactorUI.controlStyle(node, 'pressed'))),
        { fillColor: '', textColor: '', borderColor: '', opacity: 180, offsetX: 2, offsetY: 3 });
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    const states = [];
    const focused = focusWindow(1, 0, 0);
    focused.setPressed = value => states.push(value);
    focused.containsPoint = () => false;
    scene._nodeWindows = [focused]; scene._focusIndex = 0;
    sandbox.Input.isPressed = key => key === 'ok';
    scene.updateControlStates();
    assert.deepEqual(states, [true], 'keyboard/gamepad OK drives the same pressed flag used by pointer input');
});

test('close transitions lock input, complete once, and ignore reentrant close requests', () => {
    const { Scene_ReactorUI } = runtime();
    const scene = Object.create(Scene_ReactorUI.prototype);
    scene._interface = { openTransition: 'fade', closeTransition: 'fade', transitionDuration: 3 };
    scene._transitionPhase = 'opening'; scene._transitionFrame = 0; scene._closing = false; scene._closeCallback = null;
    scene._nodeWindows = []; scene._focusIndex = -1; scene.isActive = () => true;
    assert.equal(scene.acceptsInput(), false);
    for (let i = 0; i < 3; i++) scene.updateInterfaceTransition();
    assert.equal(scene.acceptsInput(), true);
    let closed = 0;
    assert.equal(scene.beginCloseTransition(() => { closed++; }), true);
    assert.equal(scene.beginCloseTransition(() => { closed += 10; }), false);
    scene.updateInterfaceTransition(); scene.updateInterfaceTransition();
    assert.equal(closed, 0);
    scene.updateInterfaceTransition();
    assert.equal(closed, 1);
});

test('overlay visibility fades over its configured duration and never becomes focusable', () => {
    const sandbox = runtime();
    const originalCreate = sandbox.Scene_ReactorUI.prototype.createNodes;
    sandbox.Scene_ReactorUI.prototype.createNodes = function() {
        const node = { id: 1, type: 'box', visible: sandbox.ReactorUI.normalizeCondition({ type: 'always' }) };
        this._nodeWindows.push({ visible: true, _uiTransitionAlpha: 1, node: () => node, setEnabled() {}, syncVisualState() {} });
    };
    const record = sandbox.ReactorUI.normalizeInterface({ id: 4, mode: 'overlay', visible: { type: 'switch', id: 1 },
        openTransition: 'fade', closeTransition: 'fade', transitionDuration: 2, nodes: [] });
    const overlay = sandbox.ReactorUI.createOverlay({ addWindow() {} }, record);
    assert.equal(overlay.canFocus(), false);
    sandbox.$gameSwitches._on = false;
    overlay.update();
    assert.equal(overlay._visibilityAlpha, 0.5);
    assert.equal(overlay._nodeWindows[0].visible, true, 'the window remains visible during the fade');
    overlay.update();
    assert.equal(overlay._visibilityAlpha, 0);
    assert.equal(overlay._nodeWindows[0].visible, false);
    sandbox.Scene_ReactorUI.prototype.createNodes = originalCreate;
});

test('editor validates focus references, exposes named choices, and keeps legacy aliases intact', () => {
    const editor = new Editor({ data: { system: { advanced: {} } } });
    editor._t = value => value;
    const record = editor.normalizeInterface({ coordinateSpace: 'screen', nodes: [
        { id: 1, type: 'button', name: 'Start', focusUp: 1, focusDown: 2, focusLeft: 99, focusRight: 3 },
        { id: 2, type: 'text', name: 'Not a control' },
        { id: 3, type: 'list', name: 'Choices' }
    ] });
    editor.current = record;
    assert.deepEqual([record.nodes[0].focusUp, record.nodes[0].focusDown, record.nodes[0].focusLeft, record.nodes[0].focusRight], [0, 0, 0, 3]);
    assert.deepEqual(editor.focusOptions(record.nodes[0]), [['0', 'Automatic'], ['3', 'Choices']]);
    const raw = { type: 'button', outline: false, highlightColor: '#334455', focusedTextColor: '#abcdef', disabledOpacity: 160 };
    const before = JSON.stringify(raw);
    const normalized = runtime().ReactorUI.normalizeNode(raw);
    assert.equal(JSON.stringify(raw), before, 'runtime normalization does not rewrite source records');
    assert.deepEqual([normalized.highlightColor, normalized.focusedTextColor, normalized.disabledOpacity, normalized.outlineWidth],
        ['#334455', '#abcdef', 160, 0]);
    const source = fs.readFileSync(path.join(root, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
    for (const control of ['p-focusUp', 'p-focusDown', 'p-focusLeft', 'p-focusRight', 'p-nineSlice', 'p-fontFace', 'p-previewState']) assert.ok(source.includes(control), control);
    assert.ok(source.indexOf("this.group(tt('Appearance'))") < source.indexOf("this.group(tt('Navigation'))"));
});

test('every new roadmap label and hint is hand-authored in all 17 locales', () => {
    const source = fs.readFileSync(path.join(root, 'editor', 'src', 'I18nDeepTranslations.js'), 'utf8');
    const context = {};
    vm.runInNewContext(source + '\nthis.deep = globalThis.RR_DEEP_TEXT_TRANSLATIONS;', context);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const phrases = ['Automatic', 'Transition in', 'Transition out', 'Slide left',
        'Input stays locked while an interface opens; closing completes before leaving.', 'Appearance', 'Font face', 'Game font',
        'Blank uses the game font.', 'Bold', 'Italic', 'Outline color', 'Outline width', 'Letter spacing', 'Nine-slice',
        'Keeps image borders unscaled; available for Picture and System images.', 'Blank state values inherit the base appearance.',
        'Focused', 'Inherit', 'Disabled', 'Navigation', 'Automatic uses geometric navigation; invalid targets safely fall back to it.'];
    assert.deepEqual(Object.keys(context.deep).sort(), locales.slice().sort());
    for (const locale of locales) for (const phrase of phrases) {
        assert.equal(typeof context.deep[locale][phrase], 'string', `${locale}: ${phrase}`);
        assert.ok(context.deep[locale][phrase].length > 0, `${locale}: ${phrase} is not blank`);
    }
});
