'use strict';
// Database › User Interfaces: a picture as an element's look (fill "picture", a control's state pictures, a
// list's row pictures, a gauge's bar) and motion for an element (frames, idle motion, Appear, the focused
// look). The maths is one text in runtime/reactor_ui.js and editor/src/utils/InterfaceMotion.js; the game
// moves the node's own window by it and the editor's canvas draws from it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const runtimeSource = read('runtime/reactor_ui.js');
const Motion = require('../src/utils/InterfaceMotion.js');
const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');
const Unused = require('../build-scripts/unused-assets.cjs');

function runtime(globals = {}) {
    class Base { initialize() {} }
    const stub = () => { const C = function() {}; C.prototype = Object.create(Base.prototype); return C; };
    const sandbox = Object.assign({
        console, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' }, performance: { now: () => 0 },
        require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true, encodeURI: value => encodeURIComponent(value) }, Graphics: { width: 320, height: 180, boxWidth: 320, boxHeight: 180, frameCount: 0 },
        Window_Base: stub(), Window_Selectable: stub(), Scene_MenuBase: stub(), Scene_Boot: stub(), Scene_Map: stub(),
        Scene_Title: stub(), Scene_Menu: stub(), Scene_Status: stub(), Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(),
        DataManager: { isTitleSkip: () => false }, ConfigManager: {},
        PluginManager: { registerCommand() {} }, SceneManager: { _stack: [], push() {}, goto() {}, prepareNextScene() {} },
        $dataSystem: { variables: [], versionId: 1 }, $gameSystem: {}, $gameMap: {}, $gamePlayer: {},
        $gameSwitches: { value: () => true }, $gameVariables: { value: () => 0 },
        $gameActors: { actor: () => null }, $gameParty: { members: () => [], allItems: () => [], inBattle: () => false },
        Input: { isPressed: () => false }, TouchInput: { isPressed: () => false, x: 0, y: 0 },
        ColorManager: { textColor: value => String(value) }, SoundManager: { playCursor() {} },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    }, globals);
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(runtimeSource, sandbox);
    return sandbox;
}

/** A node window with only what placing and moving it reads. */
function nodeWindow(sandbox, raw, { width = 100, height = 40, layout = [10, 20] } = {}) {
    const win = Object.create(sandbox.Window_ReactorUINode.prototype);
    win._uiNode = sandbox.ReactorUI.normalizeNode(raw);
    win._uiEnabled = true; win._uiFocused = false; win._uiPressed = false;
    win._uiMotion = win._uiNode.motion ? sandbox.ReactorUI.motionState(win._uiNode) : null;
    win._uiPosed = !!win._uiMotion;
    win.width = width; win.height = height; win.x = layout[0]; win.y = layout[1]; win.rotation = 0; win.alpha = 1; win.visible = true;
    win.pivot = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
    win.scale = { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } };
    win._uiLayoutX = layout[0]; win._uiLayoutY = layout[1];
    return win;
}

const between = (text, name) => text.slice(text.indexOf('// <' + name + '>'), text.indexOf('// </' + name + '>'));

test('the game and the editor run one text of the picture and motion maths', () => {
    const game = between(runtimeSource, 'interface-motion').replace(/\r\n/g, '\n');
    const editor = between(read('editor/src/utils/InterfaceMotion.js'), 'interface-motion').replace(/\r\n/g, '\n');
    assert.ok(game.length > 5000 && game.includes('function interfaceMotionApi()'));
    assert.equal(editor.replace(/^ +/gm, ''), game.replace(/^ +/gm, ''), 'the block between the markers is the same text');
    assert.match(read('editor/index.html'), /<script src="src\/utils\/InterfaceMotion\.js"><\/script>/);
    assert.equal(Editor.motionApi(), Motion);
    // The runtime exposes the same functions, and both give the same pose.
    const { ReactorUI } = runtime();
    const m = { floatY: 8, floatPeriod: 60, pulseFrom: 90, pulseTo: 130, spin: 45, fadeFrom: 255, fadeTo: 100, appearX: -120, appearDuration: 24 };
    for (const age of [0, 1, 7, 30, 61, 400]) {
        assert.deepEqual({ ...ReactorUI.Motion.pose(ReactorUI.Motion.normalize(m, 'image', 'picture'), age, 0, -1, ReactorUI.Motion.newPose()) },
            Motion.pose(Motion.normalize(m, 'image', 'picture'), age, 0, -1, Motion.newPose()));
    }
});

test('every new setting is off by default, and an old record is read as before', () => {
    const { ReactorUI } = runtime();
    for (const type of ['box', 'image', 'text', 'button', 'list', 'gauge', 'input', 'battleWindow', 'battleCursor']) {
        const node = ReactorUI.normalizeNode({ type });
        assert.equal(node.motion, null, type);
        assert.deepEqual([node.fillImage, node.fillFit, node.focusedImage, node.pressedImage, node.disabledImage, node.rowImage, node.gaugeImage, node.gaugeBackImage],
            ['', 'stretch', '', '', '', '', '', ''], type);
        assert.notEqual(node.fill, 'picture');
    }
    // The Demo's own interfaces use none of it: no node moves and none is filled with a picture.
    const demo = JSON.parse(read('template/Demo/data/UserInterfaces.json'));
    let nodes = 0;
    for (const record of demo) {
        if (!record) continue;
        for (const node of ReactorUI.normalizeInterface(record).nodes) {
            nodes++;
            assert.equal(node.motion, null);
            assert.notEqual(node.fill, 'picture');
            assert.equal(node.fillImage + node.focusedImage + node.pressedImage + node.disabledImage + node.rowImage + node.gaugeImage + node.gaugeBackImage, '');
        }
    }
    assert.ok(nodes > 50);
    // The editor keeps the new settings out of a record that sets none (it saves as it did).
    const editor = Object.create(Editor.prototype);
    editor.screenMetrics = () => ({ width: 816, height: 624, boxX: 0, boxY: 0, boxWidth: 816, boxHeight: 624 });
    const record = editor.normalizeInterface({ id: 1, coordinateSpace: 'screen', nodes: [{ id: 1, type: 'box' }, { id: 2, type: 'button' }, { id: 3, type: 'image' }, { id: 4, type: 'list' }, { id: 5, type: 'gauge' }] });
    for (const node of record.nodes) {
        for (const key of ['motion', 'fillImage', 'fillFit', 'focusedImage', 'pressedImage', 'disabledImage', 'rowImage', 'gaugeImage', 'gaugeBackImage']) assert.ok(!(key in node), node.type + ' ' + key);
    }
    assert.ok(!('sliceLeft' in record.nodes[0]), 'a box has no slice borders until they are set');
});

test('picture settings are kept in range and only where they apply', () => {
    const { ReactorUI } = runtime();
    const box = ReactorUI.normalizeNode({ type: 'box', fill: 'picture', fillImage: '  system/Panel ', fillFit: 'slice', sliceLeft: 12, sliceTop: -4, sliceRight: 99999, focusedImage: 'Glow', rowImage: 'Row', gaugeImage: 'Bar' });
    assert.deepEqual([box.fill, box.fillImage, box.fillFit, box.sliceLeft, box.sliceTop, box.sliceRight], ['picture', 'system/Panel', 'slice', 12, 0, 9999]);
    assert.deepEqual([box.focusedImage, box.rowImage, box.gaugeImage], ['', '', ''], 'a box has no states, rows or bar');
    assert.equal(ReactorUI.normalizeNode({ type: 'box', fillFit: 'zoom' }).fillFit, 'stretch');
    // A picture fill belongs to box, button, list and input; any other type keeps its own default.
    for (const type of ['box', 'button', 'list', 'input']) assert.equal(ReactorUI.normalizeNode({ type, fill: 'picture' }).fill, 'picture', type);
    assert.equal(ReactorUI.normalizeNode({ type: 'text', fill: 'picture' }).fill, 'none');
    assert.equal(ReactorUI.normalizeNode({ type: 'gauge', fill: 'picture' }).fill, 'none');
    assert.equal(ReactorUI.normalizeNode({ type: 'fightUnit', fill: 'picture' }).fill, 'window');
    const button = ReactorUI.normalizeNode({ type: 'button', fill: 'picture', fillImage: 'Up', focusedImage: 'Over', pressedImage: 'Down', disabledImage: 'Off', rowImage: 'Row' });
    assert.deepEqual([button.focusedImage, button.pressedImage, button.disabledImage, button.rowImage], ['Over', 'Down', 'Off', '']);
    const list = ReactorUI.normalizeNode({ type: 'list', rowImage: 'Row', focusedImage: 'RowOn', pressedImage: 'Down', disabledImage: 'RowOff' });
    assert.deepEqual([list.rowImage, list.focusedImage, list.pressedImage, list.disabledImage], ['Row', 'RowOn', '', 'RowOff']);
    const gauge = ReactorUI.normalizeNode({ type: 'gauge', gaugeImage: 'system/Meter', gaugeBackImage: 'MeterBack' });
    assert.deepEqual([gauge.gaugeImage, gauge.gaugeBackImage], ['system/Meter', 'MeterBack']);
    // A state falls back: pressed to selected, every one to the normal picture.
    assert.deepEqual(['base', 'focused', 'pressed', 'disabled'].map(state => Motion.statePicture(button, state)), ['Up', 'Over', 'Down', 'Off']);
    const plain = { fillImage: 'Up', focusedImage: 'Over' };
    assert.deepEqual(['base', 'focused', 'pressed', 'disabled'].map(state => Motion.statePicture(plain, state)), ['Up', 'Over', 'Over', 'Up']);
    assert.deepEqual(['base', 'focused', 'disabled'].map(state => Motion.rowPicture(list, state)), ['Row', 'RowOn', 'RowOff']);
    assert.deepEqual(['base', 'focused', 'disabled'].map(state => Motion.rowPicture({ focusedImage: 'RowOn' }, state)), ['', 'RowOn', '']);
});

test('motion settings are kept in range, switched off where a node cannot do them, and stored only where set', () => {
    assert.equal(Motion.normalize(null, 'box'), null);
    assert.equal(Motion.normalize({}, 'box'), null);
    assert.equal(Motion.normalize({ floatX: 0, pulseFrom: 100, fadeTo: 255, floatPeriod: 30 }, 'box'), null, 'a period alone moves nothing');
    assert.equal(Motion.normalize({ floatY: 8 }, 'battleCursor'), null, 'the battle nodes have their own motion');
    assert.equal(Motion.normalize({ floatY: 8 }, 'fightUnit'), null);
    const wild = Motion.normalize({ floatX: 99999, floatY: -99999, floatPeriod: 0, floatOffset: -5, pulseFrom: 1, pulseTo: 9999, spin: 5000, swayAngle: -500, fadeFrom: -1, fadeTo: 999,
        appearX: 1e9, appearScale: -3, appearOpacity: 300, appearDuration: 0, appearDelay: 9999, focusScale: 1, focusX: 999, cols: 500, rows: 0, frameCount: 99999, fps: 1000, frameMode: 'sideways', driftX: 1e6 }, 'image', 'picture');
    assert.deepEqual([wild.floatX, wild.floatY, wild.floatPeriod, wild.floatOffset, wild.pulseFrom, wild.pulseTo, wild.spin, wild.swayAngle, wild.fadeFrom, wild.fadeTo],
        [2000, -2000, 2, 0, 10, 400, 1440, -180, 0, 255]);
    assert.deepEqual([wild.appearX, wild.appearScale, wild.appearOpacity, wild.appearDuration, wild.appearDelay], [4000, 0, 255, 1, 600]);
    assert.deepEqual([wild.cols, wild.rows, wild.frameCount, wild.fps, wild.frameMode, wild.driftX], [64, 1, 64, 60, 'loop', 2000]);
    assert.deepEqual([wild.focusScale, wild.focusX], [100, 0], 'an image takes no focus');
    assert.equal(Motion.normalize({ floatX: 'abc', floatY: 3.6 }, 'box').floatY, 4, 'whole numbers; a value that is not a number is the default');
    // A list is cut to its frame, which does not grow or turn: it floats, fades and appears by offset and opacity.
    const list = Motion.normalize({ spin: 90, swayAngle: 20, pulseFrom: 50, appearScale: 0, floatX: 5, fadeTo: 100 }, 'list');
    assert.deepEqual([list.spin, list.swayAngle, list.pulseFrom, list.appearScale, list.floatX, list.fadeTo], [0, 0, 100, 100, 5, 100]);
    assert.equal(Motion.normalize({ spin: 90 }, 'list'), null);
    // Frames and drift are an Image node's, of a whole-picture source.
    assert.equal(Motion.normalize({ cols: 4 }, 'box'), null);
    assert.equal(Motion.normalize({ cols: 4, driftX: 10 }, 'image', 'face'), null);
    assert.equal(Motion.normalize({ cols: 4 }, 'image', 'system').cols, 4);
    assert.equal(Motion.normalize({ cols: 4 }, 'image').cols, 4, 'an Image node without a source is a picture');
    // Focus is a button's and a text input's.
    assert.equal(Motion.normalize({ focusScale: 120 }, 'button').focusScale, 120);
    assert.equal(Motion.normalize({ focusScale: 120 }, 'box'), null);
    // Stored: only what differs from the default.
    assert.deepEqual(Motion.compact(Motion.normalize({ floatY: 8, floatPeriod: 120, cols: 1 }, 'box')), { floatY: 8 });
    assert.equal(Motion.compact(null), null);
    const editor = Editor.normalizePictureMotion({ type: 'button', fill: 'picture', fillImage: ' Up ', fillFit: 'stretch', focusedImage: '', sliceLeft: 8, sliceTop: 0,
        motion: { focusScale: 110, spin: 0, floatPeriod: 120 } }, 'button');
    assert.deepEqual(editor, { type: 'button', fill: 'picture', fillImage: 'Up', sliceLeft: 8, motion: { focusScale: 110 } });
    assert.deepEqual(Editor.normalizePictureMotion({ type: 'text', fill: 'picture', fillImage: 'Up', motion: { cols: 3 } }, 'text'), { type: 'text', fill: 'none' });
    const traits = Motion.traits(Motion.normalize({ cols: 2, driftX: 5, floatY: 3, appearScale: 50 }, 'image', 'picture'));
    assert.deepEqual(traits, { frames: true, drift: false, idle: true, appear: true, focus: false, centered: true, moves: true }, 'frames win over drift; a size change is about the center');
});

test('the pose at a given update: float, pulse, spin, sway, fade, Appear, leaving and focus', () => {
    const at = (raw, age, focus = 0, leave = -1, type = 'image') => Motion.pose(Motion.normalize(raw, type, 'picture'), age, focus, leave, Motion.newPose());
    const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message || ''} ${actual} ~ ${expected}`);
    // Float: a sine, whole pixels, from its place; the start offset shifts it.
    assert.deepEqual([0, 15, 30, 45, 60].map(age => at({ floatY: 20, floatPeriod: 60 }, age).dy), [0, 20, 0, -20, 0]);
    assert.deepEqual([0, 15].map(age => at({ floatX: 10, floatY: 20, floatPeriod: 60, floatOffset: 30 }, age).dx), [0, -10]);
    assert.equal(at({ floatY: 20, floatPeriod: 60 }, 5).dy, 10);
    // Pulse: from the first size to the second and back.
    [[0, 0.8], [15, 1.1], [30, 1.4], [60, 0.8]].forEach(([age, scale]) => near(at({ pulseFrom: 80, pulseTo: 140, pulsePeriod: 60 }, age).scale, scale, 'pulse at ' + age));
    // Spin: degrees a second, within a turn; Sway: a sine of degrees.
    near(at({ spin: 90 }, 15).turn, 22.5); near(at({ spin: 90 }, 60 * 5).turn, 90); near(at({ spin: -90 }, 20).turn, -30);
    near(at({ swayAngle: 30, swayPeriod: 60 }, 15).turn, 30); near(at({ swayAngle: 30, swayPeriod: 60 }, 45).turn, -30);
    near(at({ spin: 90, swayAngle: 30, swayPeriod: 60 }, 15).turn, 52.5, 'spin and sway add');
    // Fade: opacity between two values.
    [[0, 1], [30, 40 / 255], [15, (255 + 40) / 2 / 255]].forEach(([age, alpha]) => near(at({ fadeFrom: 255, fadeTo: 40, fadePeriod: 60 }, age).alpha, alpha, 'fade at ' + age));
    // Appear: from an offset, a size and an opacity, easing out over the duration after the delay.
    const appear = { appearX: -200, appearY: 80, appearScale: 0, appearOpacity: 0, appearDuration: 30, appearDelay: 10 };
    assert.deepEqual([at(appear, 0).dx, at(appear, 10).dx, at(appear, 0).dy], [-200, -200, 80]);
    near(at(appear, 0).scale, 0); near(at(appear, 0).alpha, 0);
    assert.equal(at(appear, 25).dx, -25, 'half way through, seven eighths of the way there');
    near(at(appear, 25).scale, 0.875); near(at(appear, 25).alpha, 0.875);
    assert.deepEqual([at(appear, 40).dx, at(appear, 40).dy, at(appear, 4000).dx], [0, 0, 0]);
    near(at(appear, 40).scale, 1); near(at(appear, 40).alpha, 1);
    // Leaving: Appear backward over the interface's closing transition, whatever its own duration.
    assert.equal(at(appear, 4000, 0, 0).dx, 0);
    assert.equal(at(appear, 4000, 0, 0.5).dx, -25);
    assert.equal(at(appear, 4000, 0, 1).dx, -200);
    near(at(appear, 4000, 0, 1).alpha, 0);
    assert.equal(at(appear, 12, 0, 0.5).dx, at(appear, 12).dx, 'it never comes further in than it had got');
    // Focus: toward a size and an offset as focus goes 0 to 1.
    const focus = { focusScale: 120, focusX: 4, focusY: -6 };
    near(at(focus, 100, 0, -1, 'button').scale, 1); near(at(focus, 100, 1, -1, 'button').scale, 1.2); near(at(focus, 100, 0.5, -1, 'button').scale, 1.1);
    assert.deepEqual([at(focus, 100, 1, -1, 'button').dx, at(focus, 100, 1, -1, 'button').dy], [4, -6]);
    // Everything together multiplies sizes and opacities and adds offsets and turns.
    const all = at({ floatY: 20, floatPeriod: 60, pulseFrom: 50, pulseTo: 50, appearScale: 50, appearDuration: 10, appearDelay: 100, fadeFrom: 128, fadeTo: 128, appearOpacity: 128, appearY: 7 }, 15);
    assert.equal(all.dy, 27); near(all.scale, 0.25); near(all.alpha, (128 / 255) * (128 / 255));
    // The same object is written into: nothing is made per update.
    const out = Motion.newPose(), m = Motion.normalize({ floatY: 20 }, 'box');
    assert.equal(Motion.pose(m, 3, 0, -1, out), out);
});

test('frames: which frame shows, its cell in the sheet, and where the picture stands in its box', () => {
    const run = (count, hold, mode, ages) => ages.map(age => Motion.frameAt(age, count, hold, mode));
    assert.deepEqual(run(4, 6, 'loop', [0, 5, 6, 12, 18, 24, 29]), [0, 0, 1, 2, 3, 0, 0]);
    assert.deepEqual(run(4, 6, 'once', [0, 6, 18, 24, 6000]), [0, 1, 3, 3, 3]);
    assert.deepEqual(run(4, 1, 'pingpong', [0, 1, 2, 3, 4, 5, 6, 7]), [0, 1, 2, 3, 2, 1, 0, 1]);
    assert.deepEqual(run(2, 1, 'pingpong', [0, 1, 2, 3]), [0, 1, 0, 1]);
    assert.deepEqual(run(1, 1, 'pingpong', [0, 5]), [0, 0]);
    assert.deepEqual(run(3, 7.5, 'loop', [7, 8, 15]), [0, 1, 2], 'a hold that is not a whole number of updates (8 frames a second)');
    // An Image node's sheet plays at frames a second; a frame count stops short of the sheet's end.
    const sheet = Motion.normalize({ cols: 4, rows: 2, fps: 10, frameCount: 5 }, 'image', 'picture');
    assert.equal(Motion.frameTotal(sheet), 5);
    assert.equal(Motion.frameTotal(Motion.normalize({ cols: 4, rows: 2 }, 'image', 'picture')), 8);
    assert.deepEqual([0, 6, 24, 30, 59].map(age => Motion.pose(sheet, age, 0, -1, Motion.newPose()).frame), [0, 1, 4, 0, 4]);
    // The Target Cursor steps its strip by the same function, as it always did.
    for (const [frames, speed, count] of [[4, 8, 100], [1, 8, 33], [6, 3, 1234], [60, 120, 7200]]) {
        assert.equal(Motion.frameAt(count, frames, speed, 'loop'), Math.floor(count / speed) % frames);
    }
    assert.match(runtimeSource, /const frame = Motion\.frameAt\(Graphics\.frameCount, node\.frames, node\.frameSpeed, "loop"\);/);
    // Cells read left to right, top to bottom.
    assert.deepEqual(Motion.frameRect(0, 4, 2, 192, 96, {}), { x: 0, y: 0, width: 48, height: 48 });
    assert.deepEqual(Motion.frameRect(5, 4, 2, 192, 96, {}), { x: 48, y: 48, width: 48, height: 48 });
    assert.deepEqual(Motion.frameRect(3, 4, 1, 130, 20, {}), { x: 96, y: 0, width: 32, height: 20 });
    // A frame stands in the box as a whole picture does, by the node's Fit.
    assert.deepEqual(Motion.fitRect('none', 48, 48, 200, 100, {}), { x: 0, y: 0, width: 48, height: 48 });
    assert.deepEqual(Motion.fitRect('stretch', 48, 48, 200, 100, {}), { x: 0, y: 0, width: 200, height: 100 });
    assert.deepEqual(Motion.fitRect('contain', 48, 48, 200, 100, {}), { x: 50, y: 0, width: 100, height: 100 });
    // Drift: pixels a second.
    const drift = Motion.pose(Motion.normalize({ driftX: 60, driftY: -30 }, 'image', 'picture'), 90, 0, -1, Motion.newPose());
    assert.deepEqual([drift.driftX, drift.driftY], [90, -45]);
});

test('a picture fill is cut into the same pieces by the game and the editor: stretched, inside, tiled, nine-sliced', () => {
    const { ReactorUI } = runtime();
    assert.deepEqual(Motion.pictureSegments(64, 64, 200, 100, 'stretch'), [{ sx: 0, sy: 0, sw: 64, sh: 64, dx: 0, dy: 0, dw: 200, dh: 100 }]);
    assert.deepEqual(Motion.pictureSegments(64, 32, 200, 200, 'contain'), [{ sx: 0, sy: 0, sw: 64, sh: 32, dx: 0, dy: 50, dw: 200, dh: 100 }]);
    const tiles = Motion.pictureSegments(32, 32, 80, 40, 'tile');
    assert.equal(tiles.length, 6);
    assert.deepEqual(tiles[2], { sx: 0, sy: 0, sw: 16, sh: 32, dx: 64, dy: 0, dw: 16, dh: 32 }, 'the last tile of a row is cut, not squeezed');
    assert.deepEqual(tiles[5], { sx: 0, sy: 0, sw: 16, sh: 8, dx: 64, dy: 32, dw: 16, dh: 8 });
    assert.equal(Motion.pictureSegments(1, 1, 800, 600, 'tile').length, 1, 'a picture that would repeat thousands of times is stretched');
    assert.deepEqual(Motion.pictureSegments(0, 10, 100, 100, 'tile'), []);
    assert.deepEqual(Motion.pictureSegments(10, 10, 0, 100, 'stretch'), []);
    const insets = { left: 16, top: 16, right: 16, bottom: 16 };
    const game = Motion.pictureSegments(64, 64, 240, 150, 'slice', insets, ReactorUI.nineSliceSegments);
    const editor = Motion.pictureSegments(64, 64, 240, 150, 'slice', insets, Editor.nineSliceSegments);
    assert.equal(game.length, 9);
    assert.deepEqual(JSON.parse(JSON.stringify(game)), editor);
    assert.deepEqual({ ...game[0] }, { sx: 0, sy: 0, sw: 16, sh: 16, dx: 0, dy: 0, dw: 16, dh: 16 }, 'a corner keeps its size');
    assert.deepEqual({ ...game[4] }, { sx: 16, sy: 16, sw: 32, sh: 32, dx: 16, dy: 16, dw: 208, dh: 118 });
    assert.equal(Motion.pictureSegments(64, 64, 240, 150, 'slice', { left: 0, top: 0, right: 0, bottom: 0 }, ReactorUI.nineSliceSegments).length, 1, 'no borders: stretched');
});

test('the game draws a picture fill once into the surface, by the control\'s state, and nothing for a missing file', () => {
    const loads = [];
    const sandbox = runtime({ Bitmap: { load: url => { const bitmap = { url, width: 96, height: 32, isReady: () => !/Loading|Missing/.test(url), isError: () => url.includes('Missing'), addLoadListener() {} }; loads.push(url); return bitmap; } } });
    const ui = sandbox.ReactorUI;
    sandbox.ImageManager = { _imageExtensions: ['.png', '.jpg', '.jpeg', '.webp'] };
    const surface = raw => {
        const win = nodeWindow(sandbox, raw);
        const blits = [], borders = [];
        win.contentsBack = { context: null, blt: (image, ...rest) => blits.push([image.url, ...rest]), set paintOpacity(value) { blits.push(['opacity', value]); } };
        win.contents = win.contentsBack;
        win.contentsWidth = () => 200; win.contentsHeight = () => 64;
        win.drawBorder = bitmap => borders.push(bitmap);
        win.blits = blits; win.borders = borders;
        return win;
    };
    const button = { type: 'button', fill: 'picture', fillOpacity: 200, fillImage: 'Up', focusedImage: 'system/Over', pressedImage: 'Down.JPG', disabledImage: 'OffMissing' };
    const base = surface(button);
    base.drawSurface();
    assert.deepEqual(base.blits, [['opacity', 200], ['img/pictures/Up.png', 0, 0, 96, 32, 0, 0, 200, 64], ['opacity', 255]], 'stretched over the surface at the fill opacity');
    assert.equal(base.padding, undefined);
    assert.equal(base.usesSkin(), false, 'a picture fill has no window skin or padding');
    const focused = surface(button); focused._uiFocused = true; focused.drawSurface();
    assert.equal(focused.blits[1][0], 'img/system/Over.png');
    const pressed = surface(button); pressed._uiFocused = true; pressed._uiPressed = true; pressed.drawSurface();
    assert.equal(pressed.blits[1][0], 'img/pictures/Down.JPG', 'a picture with its own extension is loaded as written');
    const disabled = surface(button); disabled._uiEnabled = false; disabled.drawSurface();
    assert.equal(disabled.blits[1][0], 'img/pictures/Up.png', 'a state whose file is missing shows the normal picture');
    // A missing normal picture draws nothing (and its border still), and never throws.
    const missing = surface({ type: 'box', fill: 'picture', fillImage: 'PanelMissing', borderWidth: 2 });
    missing.drawSurface();
    assert.deepEqual(missing.blits, []);
    assert.equal(missing.borders.length, 1);
    const unset = surface({ type: 'box', fill: 'picture' });
    unset.drawSurface();
    assert.deepEqual(unset.blits, []);
    // Tiled and nine-sliced fills blit their pieces.
    const tiled = surface({ type: 'box', fill: 'picture', fillImage: 'Up', fillFit: 'tile' }); tiled.drawSurface();
    assert.equal(tiled.blits.filter(entry => entry[0] !== 'opacity').length, 6);
    const sliced = surface({ type: 'box', fill: 'picture', fillImage: 'Up', fillFit: 'slice', sliceLeft: 8, sliceRight: 8, sliceTop: 8, sliceBottom: 8 }); sliced.drawSurface();
    assert.equal(sliced.blits.filter(entry => entry[0] !== 'opacity').length, 9);
    // A Selected picture is the focus mark: the skin cursor stays away.
    const mark = surface(button); mark._uiFocused = true; mark.setCursorRect = (...rect) => { mark.cursor = rect; }; mark.drawFocus();
    assert.deepEqual(mark.cursor, [0, 0, 0, 0]);
    const plain = surface({ type: 'button', fill: 'picture', fillImage: 'Up' }); plain._uiFocused = true; plain.setCursorRect = (...rect) => { plain.cursor = rect; }; plain.drawFocus();
    assert.deepEqual(plain.cursor, [0, 0, 200, 64], 'without one, the cursor marks the focus as before');
    // Every picture a record names is listed, so a scene can wait for them before it opens.
    assert.deepEqual([...ui.interfacePictures(ui.normalizeInterface({ id: 1, coordinateSpace: 'screen', nodes: [Object.assign({ id: 1 }, button), { id: 2, type: 'box', fill: 'color', fillImage: 'Unused' },
        { id: 3, type: 'gauge', gaugeImage: 'Bar' }, { id: 4, type: 'list', rowImage: 'Row' }] }))], ['Up', 'system/Over', 'Down.JPG', 'OffMissing', 'Bar', 'Row']);
});

test('a moving node moves, grows, turns and fades its own window; a node without motion runs none of it', () => {
    const sandbox = runtime();
    // No motion: the window is placed exactly as before and no motion code is reached.
    const still = nodeWindow(sandbox, { type: 'image' });
    assert.equal(still._uiMotion, null);
    still.applyMotionPose = () => { throw new Error('a still node must not be posed'); };
    still.updateMotion = () => { throw new Error('a still node must not update motion'); };
    still.syncVisualState();
    assert.deepEqual([still.x, still.y, still.alpha, still.rotation, still.scale.x, still.pivot.x], [10, 20, 1, 0, 1, 0]);
    sandbox.Window_Base.prototype.update = function() {};
    still.updateShown = () => {};
    still.update();
    // Float and fade: an offset and an alpha on top of where the layout put it.
    const floating = nodeWindow(sandbox, { type: 'box', motion: { floatY: 20, floatPeriod: 60, fadeFrom: 255, fadeTo: 0, fadePeriod: 60 } });
    assert.equal(floating._uiMotion.centered, false);
    floating.updateShown = () => {};
    for (let i = 0; i < 15; i++) floating.update();
    assert.deepEqual([floating.x, floating.y, floating._uiMotion.age], [10, 40, 15]);
    assert.ok(Math.abs(floating.alpha - 0.5) < 1e-9);
    assert.deepEqual([floating.rotation, floating.scale.x, floating.pivot.x], [0, 1, 0], 'nothing turns or grows it');
    // Pulse and spin: about its center, as an Angle turns it; its Angle is added to.
    const turning = nodeWindow(sandbox, { type: 'image', angle: 10, motion: { spin: 90, pulseFrom: 100, pulseTo: 200, pulsePeriod: 60 } });
    turning.updateShown = () => {};
    for (let i = 0; i < 30; i++) turning.update();
    assert.deepEqual([turning.pivot.x, turning.pivot.y], [50, 20]);
    assert.ok(Math.abs(turning.rotation - (10 + 45) * Math.PI / 180) < 1e-9);
    assert.ok(Math.abs(turning.scale.x - 2) < 1e-9 && Math.abs(turning.scale.y - 2) < 1e-9);
    assert.deepEqual([turning.x, turning.y], [60, 40], 'its center stays where its box is');
    // A record fitted to another screen: offsets and sizes go by the fit's factor.
    const fitted = nodeWindow(sandbox, { type: 'image', motion: { floatX: 10, floatPeriod: 60, pulseFrom: 100, pulseTo: 200, pulsePeriod: 60 } });
    fitted._uiFitScale = 0.5; fitted.scale.set(0.5, 0.5); fitted.updateShown = () => {};
    for (let i = 0; i < 15; i++) fitted.update();
    assert.deepEqual([fitted.x, fitted.y], [10 + 25 + 5, 20 + 10]);
    assert.ok(Math.abs(fitted.scale.x - 0.75) < 1e-9);
    // The pressed offset and the interface's transition still apply under the pose.
    const sliding = nodeWindow(sandbox, { type: 'box', motion: { floatX: 8, floatPeriod: 60 } });
    sliding._uiTransitionX = 100; sliding._uiTransitionAlpha = 0.5; sliding._uiMotion.pose.dx = 8; sliding._uiMotion.pose.alpha = 0.5;
    sliding.syncVisualState();
    assert.deepEqual([sliding.x, sliding.alpha], [118, 0.25]);
    // Before the scene has laid the node out, nothing is posed (its place is read back from the window).
    const early = nodeWindow(sandbox, { type: 'box', motion: { appearX: -300 } });
    early._uiLayoutX = undefined; early._uiLayoutY = undefined;
    early.syncVisualState();
    assert.equal(early.x, 10);
});

test('Appear comes to rest, starts over when the node shows again, and runs backward while the interface closes', () => {
    const sandbox = runtime();
    sandbox.Window_Base.prototype.update = function() {};
    const win = nodeWindow(sandbox, { type: 'box', motion: { appearX: -200, appearDuration: 10, appearDelay: 2 } });
    assert.equal(win._uiMotion.pose.dx, -200, 'made at its starting place, before any update');
    win.syncVisualState();
    assert.equal(win.x, -190);
    let posed = 0;
    const pose = sandbox.ReactorUI.Motion.pose;
    sandbox.ReactorUI.Motion.pose = function() { posed++; return pose.apply(this, arguments); };
    for (let i = 0; i < 12; i++) win.update();
    assert.deepEqual([win.x, win._uiMotion.settled, posed], [10, true, 12]);
    for (let i = 0; i < 100; i++) win.update();
    assert.deepEqual([posed, win._uiMotion.age], [12, 12], 'at rest it does no work: the early return');
    // Hidden, then shown: Appear plays again from its start.
    win.visible = false; win.update();
    assert.equal(win._uiStale, true);
    assert.equal(posed, 12, 'a hidden node does nothing');
    win.visible = true; win.update();
    assert.deepEqual([win._uiMotion.age, win._uiMotion.settled], [1, false]);
    assert.equal(win.x, -190);
    for (let i = 0; i < 20; i++) win.update();
    assert.equal(win.x, 10);
    // Closing: the scene tells the node how far it has closed.
    sandbox.ReactorUI.motionLeave(win, 0.5);
    win.update();
    assert.deepEqual([win._uiMotion.settled, win.x], [false, 10 - 25]);
    sandbox.ReactorUI.motionLeave(win, 1);
    win.update();
    assert.equal(win.x, -190);
    sandbox.ReactorUI.motionLeave(win, -1);
    win.update();
    assert.equal(win.x, 10, 'a close that is undone brings it back');
    // Idle motion never rests; a sheet played once does.
    assert.equal(sandbox.ReactorUI.motionState(sandbox.ReactorUI.normalizeNode({ type: 'box', motion: { floatY: 4 } })).lively, true);
    const once = sandbox.ReactorUI.motionState(sandbox.ReactorUI.normalizeNode({ type: 'image', motion: { cols: 4, fps: 10, frameMode: 'once' } }));
    assert.deepEqual([once.lively, once.restAge, once.picture], [false, 24, true]);
    // The scene keeps the moving windows apart, so its closing loop touches no other.
    assert.match(runtimeSource, /if \(window\._uiMotion\) \(this\._motionWindows \|\| \(this\._motionWindows = \[\]\)\)\.push\(window\);/);
});

test('the focused look eases in over eight updates and back out', () => {
    const sandbox = runtime();
    sandbox.Window_Base.prototype.update = function() {};
    const win = nodeWindow(sandbox, { type: 'button', motion: { focusScale: 120, focusY: -8 } });
    win.updateShown = () => {};
    for (let i = 0; i < 5; i++) win.update();
    assert.deepEqual([win._uiMotion.settled, win.scale.x, win.y - win.pivot.y], [true, 1, 20]);
    win._uiFocused = true;
    win.update();
    assert.ok(win.scale.x > 1 && win.scale.x < 1.2);
    for (let i = 0; i < 7; i++) win.update();
    assert.ok(Math.abs(win.scale.x - 1.2) < 1e-9);
    assert.equal(win.y - win.pivot.y, 20 - 8, 'its box moves up eight pixels, growing about its center');
    assert.equal(win._uiMotion.settled, true);
    win._uiFocused = false;
    for (let i = 0; i < 8; i++) win.update();
    assert.ok(Math.abs(win.scale.x - 1) < 1e-9);
});

test('frames and drift change a sprite inside the window: its frame when the frame changes, its origin as it drifts', () => {
    const sandbox = runtime();
    sandbox.Window_Base.prototype.update = function() {};
    const made = [];
    sandbox.Sprite = function(bitmap) { this.bitmap = bitmap; this.scale = { set: (x, y) => { this.sx = x; this.sy = y; } }; this.frames = []; this.setFrame = (...frame) => this.frames.push(frame); made.push(this); };
    sandbox.TilingSprite = function(bitmap) { this.bitmap = bitmap; this.origin = { x: 0, y: 0 }; this.move = (...rect) => { this.rect = rect; }; made.push(this); };
    const sheet = { width: 192, height: 96, isReady: () => true };
    const win = nodeWindow(sandbox, { type: 'image', source: 'picture', file: 'Sheet', fit: 'contain', motion: { cols: 4, rows: 2, fps: 10 } }, { width: 200, height: 100 });
    win.contentsWidth = () => 200; win.contentsHeight = () => 100;
    win.addInnerChild = child => { win.child = child; };
    win._uiBitmap = sheet;
    win.contents = { blt() { throw new Error('a sheet is not painted into the window'); } };
    win.drawImage();
    const sprite = win.child;
    assert.ok(sprite instanceof sandbox.Sprite);
    assert.deepEqual([sprite.x, sprite.y, sprite.sx, sprite.sy], [50, 0, 100 / 48, 100 / 48], 'one frame, fitted inside the box');
    assert.deepEqual(sprite.frames, [[0, 0, 48, 48]]);
    win.updateShown = () => {};
    for (let i = 0; i < 30; i++) win.update();
    assert.deepEqual(sprite.frames, [[0, 0, 48, 48], [48, 0, 48, 48], [96, 0, 48, 48], [144, 0, 48, 48], [0, 48, 48, 48], [48, 48, 48, 48]], 'the frame is set when it changes, not every update');
    // Drift: a repeating sprite the size of the box, scrolled by its origin.
    const sky = nodeWindow(sandbox, { type: 'image', source: 'picture', file: 'Sky', motion: { driftX: 60, driftY: -30 } }, { width: 400, height: 128 });
    sky.contentsWidth = () => 400; sky.contentsHeight = () => 128;
    sky.addInnerChild = child => { sky.child = child; };
    sky._uiBitmap = { width: 128, height: 64, isReady: () => true };
    sky.contents = { blt() { throw new Error('a drifting picture is not painted into the window'); } };
    sky.drawImage();
    assert.ok(sky.child instanceof sandbox.TilingSprite);
    assert.deepEqual(sky.child.rect, [0, 0, 400, 128]);
    sky.updateShown = () => {};
    for (let i = 0; i < 90; i++) sky.update();
    assert.deepEqual([sky.child.origin.x, sky.child.origin.y], [90, -45]);
    assert.equal(made.length, 2, 'one sprite each, made once');
    // An Image node with neither is painted as before.
    const plain = nodeWindow(sandbox, { type: 'image', source: 'picture', file: 'Sheet', motion: { floatY: 4 } });
    plain.contentsWidth = () => 100; plain.contentsHeight = () => 40;
    plain._uiBitmap = sheet;
    let painted = 0;
    plain.contents = { blt() { painted++; } };
    plain.drawImage();
    assert.equal(painted, 1);
});

test('a gauge draws its bar and its back from pictures, cut to the value, and falls back to the drawn bar', () => {
    const sandbox = runtime({ Sprite_Gauge: (() => { const G = function() {}; G.prototype.initialize = function() {}; G.prototype.drawGaugeRect = function() { this.stock = (this.stock || 0) + 1; }; return G; })(),
        Bitmap: { load: url => ({ url, width: 120, height: 12, isReady: () => true, isError: () => url.includes('Missing') }) } });
    const ui = sandbox.ReactorUI;
    const gauge = raw => {
        const sprite = new (ui.gaugeSpriteClass())(ui.normalizeNode(raw));
        sprite.calls = [];
        sprite.bitmap = { blt: (image, ...rest) => sprite.calls.push(['blt', image.url, ...rest]), fillRect: (...rest) => sprite.calls.push(['fill', ...rest]), gradientFillRect: (...rest) => sprite.calls.push(['gradient', ...rest]) };
        sprite.gaugeRate = () => 0.5; sprite.gaugeBackColor = () => 'back'; sprite.gaugeColor1 = () => 'c1'; sprite.gaugeColor2 = () => 'c2';
        return sprite;
    };
    const drawn = gauge({ type: 'gauge' });
    drawn.drawGaugeRect(10, 20, 100, 8);
    assert.deepEqual([drawn.stock, drawn.calls.length], [1, 0], 'no picture: the engine draws the bar, as before');
    const pictured = gauge({ type: 'gauge', gaugeImage: 'Bar', gaugeBackImage: 'system/BarBack' });
    pictured.drawGaugeRect(10, 20, 100, 8);
    assert.deepEqual(pictured.calls, [['blt', 'img/system/BarBack.png', 0, 0, 120, 12, 10, 20, 100, 8], ['blt', 'img/pictures/Bar.png', 0, 0, 60, 12, 10, 20, 50, 8]]);
    const missing = gauge({ type: 'gauge', gaugeImage: 'BarMissing' });
    missing.drawGaugeRect(10, 20, 100, 8);
    assert.deepEqual(missing.calls, [['fill', 10, 20, 100, 8, 'back'], ['gradient', 11, 21, 49, 6, 'c1', 'c2']], 'a missing picture leaves the drawn bar');
});

test('a list draws its rows\' pictures by their state, and a Selected row picture stands in for the highlight', () => {
    const sandbox = runtime({ Bitmap: { load: url => ({ url, width: 96, height: 32, isReady: () => true, isError: () => false }) } });
    const ui = sandbox.ReactorUI;
    const list = Object.create(sandbox.Window_ReactorUIList.prototype);
    list._uiNode = ui.normalizeNode({ type: 'list', fill: 'none', rowImage: 'Row', focusedImage: 'RowOn', disabledImage: 'RowOff', sliceLeft: 8, sliceRight: 8 });
    list._uiRowPictures = true; list._uiEnabled = true; list._uiFocused = true;
    list._uiRows = [{ enabled: true }, { enabled: true }, { enabled: false }];
    list.index = () => 1;
    list.itemRect = index => ({ x: 0, y: index * 40, width: 300, height: 40 });
    const blits = [], fills = [];
    list.contentsBack = { context: null, blt: (image, ...rest) => blits.push([image.url, ...rest]), fillRect: (...rest) => fills.push(rest), set paintOpacity(value) {} };
    for (let index = 0; index < 3; index++) list.drawItemBackground(index);
    assert.deepEqual([...new Set(blits.map(entry => entry[0]))], ['img/pictures/Row.png', 'img/pictures/RowOn.png', 'img/pictures/RowOff.png']);
    assert.deepEqual(blits.filter(entry => entry[0].includes('RowOn')).map(entry => entry.slice(5)), [[0, 40, 8, 40], [8, 40, 284, 40], [292, 40, 8, 40]], 'stretched, its side borders kept');
    assert.deepEqual(fills, [], 'the selected row has its picture, so no highlight is laid over it');
    // Without a Selected row picture the highlight is drawn over the row picture as before.
    list._uiNode = ui.normalizeNode({ type: 'list', fill: 'none', rowImage: 'Row' });
    blits.length = 0;
    list.drawItemBackground(1);
    assert.deepEqual([blits.length, fills.length], [1, 1]);
    // A list with no row pictures never looks for one.
    assert.match(runtimeSource, /const pictured = this\._uiRowPictures \? this\.drawRowPicture\(index\) : "";/);
});

test('"Don\'t bundle unused files" keeps every picture an interface names, whatever its folder or extension', t => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ui-pictures-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    const put = (rel, content = 'x') => { fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true }); fs.writeFileSync(path.join(project, rel), content); };
    put('index.html', '');
    put('js/plugins.js', 'var $plugins = [];');
    put('data/UserInterfaces.json', JSON.stringify([null, { id: 1, name: 'Menu', nodes: [
        { id: 1, type: 'box', fill: 'picture', fillImage: 'Menu Panel' },
        { id: 2, type: 'button', fill: 'picture', fillImage: 'BtnUp', focusedImage: 'BtnOver', pressedImage: 'Sub/BtnDown', disabledImage: 'BtnOff.webp' },
        { id: 3, type: 'list', rowImage: 'RowBack', focusedImage: 'RowOn' },
        { id: 4, type: 'gauge', gaugeImage: 'MeterFill', gaugeBackImage: 'system/MeterBack' },
        { id: 5, type: 'image', source: 'picture', file: 'SparkSheet', motion: { cols: 4, rows: 2 } }
    ] }]));
    for (const name of ['Menu Panel.png', 'BtnUp.png', 'BtnOver.png', 'Sub/BtnDown.png', 'BtnOff.webp', 'RowBack.png', 'RowOn.jpg', 'MeterFill.png', 'SparkSheet.png', 'NeverNamed.png', 'BtnUpper.png']) put('img/pictures/' + name);
    put('img/system/MeterBack.png');
    const analysis = Unused.analyze(project);
    const used = new Map(analysis.files.map(file => [file.path, file.used]));
    for (const name of ['Menu Panel.png', 'BtnUp.png', 'BtnOver.png', 'Sub/BtnDown.png', 'BtnOff.webp', 'RowBack.png', 'RowOn.jpg', 'MeterFill.png', 'SparkSheet.png']) {
        assert.equal(used.get('img/pictures/' + name), true, name);
    }
    assert.equal(used.get('img/system/MeterBack.png'), true);
    assert.deepEqual(analysis.unused.map(file => file.path).sort(), ['img/pictures/BtnUpper.png', 'img/pictures/NeverNamed.png']);
});

test('the editor shows the Picture and Motion cards for the nodes they apply to, and reads them back', () => {
    const source = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    assert.match(source, /if \(DatabaseUserInterfaceEditor\.PICTURE_KEYS\.fillImage\.includes\(node\.type\)\) fills\.push\(\['picture', tt\('Picture'\)\]\);/);
    assert.match(source, /html \+= this\.picturePropertiesMarkup\(node\);/);
    assert.match(source, /html \+= this\.motionPropertiesMarkup\(node\);/);
    assert.match(source, /this\.applyPictureProperties\(node, q, num, panel, changedElement\);\s+this\.applyMotionProperties\(node, q, panel\);/);
    const editor = Object.create(Editor.prototype);
    editor._t = text => text;
    editor.escapeHTML = value => String(value == null ? '' : value);
    const keysOf = html => [...html.matchAll(/class="database-field-value (p-[\w-]+)"/g)].map(match => match[1]);
    // Motion: every node that has a window of its own; frames and drift on an Image node, size and turn where a node can turn, focus on controls.
    const image = keysOf(editor.motionPropertiesMarkup({ type: 'image', source: 'picture' }));
    for (const key of ['p-m-cols', 'p-m-rows', 'p-m-frameCount', 'p-m-fps', 'p-m-frameMode', 'p-m-driftX', 'p-m-floatX', 'p-m-pulseFrom', 'p-m-spin', 'p-m-swayAngle', 'p-m-fadeFrom', 'p-m-appearX', 'p-m-appearScale', 'p-m-appearDelay']) assert.ok(image.includes(key), key);
    assert.ok(!image.includes('p-m-focusScale'));
    const list = keysOf(editor.motionPropertiesMarkup({ type: 'list' }));
    assert.ok(list.includes('p-m-floatX') && list.includes('p-m-fadeTo') && list.includes('p-m-appearOpacity'));
    assert.ok(!list.includes('p-m-spin') && !list.includes('p-m-pulseFrom') && !list.includes('p-m-appearScale') && !list.includes('p-m-cols'));
    assert.ok(keysOf(editor.motionPropertiesMarkup({ type: 'button' })).includes('p-m-focusScale'));
    assert.equal(editor.motionPropertiesMarkup({ type: 'battleWindow' }), '');
    assert.equal(editor.motionPropertiesMarkup({ type: 'victoryText' }), '');
    assert.match(editor.motionPropertiesMarkup({ type: 'image', source: 'face' }), /rr-ui-motion-sheet" hidden/, 'a face is not a sheet of frames');
    // Picture: the fill's picture and how it is drawn; a control's states; a list's rows; a gauge's bar.
    const button = keysOf(editor.picturePropertiesMarkup({ type: 'button', fill: 'picture', fillOpacity: 255 }));
    for (const key of ['p-pictureFolder', 'p-fillImage', 'p-fillPictureOpacity', 'p-fillFit', 'p-sliceLeft', 'p-sliceBottom', 'p-focusedImage', 'p-pressedImage', 'p-disabledImage']) assert.ok(button.includes(key), key);
    const rows = keysOf(editor.picturePropertiesMarkup({ type: 'list', fill: 'window', fillOpacity: 160 }));
    assert.ok(rows.includes('p-rowImage') && rows.includes('p-focusedImage') && rows.includes('p-disabledImage') && !rows.includes('p-pressedImage'));
    assert.deepEqual(keysOf(editor.picturePropertiesMarkup({ type: 'gauge' })), ['p-pictureFolder', 'p-gaugeImage', 'p-gaugeBackImage']);
    assert.equal(editor.picturePropertiesMarkup({ type: 'text' }), '');
    assert.equal(editor.picturePropertiesMarkup({ type: 'image' }), '', 'an Image node already is a picture');
    // Reading the Motion card back stores only what is set, and clears it when everything is back at its default.
    const fields = { 'p-m-floatY': '12', 'p-m-floatX': '0', 'p-m-floatPeriod': '90', 'p-m-spin': '', 'p-m-appearDuration': '20' };
    const q = cls => cls in fields ? { value: fields[cls] } : null;
    const node = { type: 'box' };
    editor.applyMotionProperties(node, q, { querySelector: () => null });
    assert.deepEqual(node.motion, { floatY: 12, floatPeriod: 90 });
    fields['p-m-floatY'] = '0';
    editor.applyMotionProperties(node, q, { querySelector: () => null });
    assert.ok(!('motion' in node));
    // The canvas draws through the shared maths, and Motion plays it at the game's sixty updates a second.
    assert.match(source, /api\.pictureSegments\(image\.width, image\.height, rect\.width, rect\.height, fit, insets, DatabaseUserInterfaceEditor\.nineSliceSegments\)/);
    assert.match(source, /return api\.pose\(m, age, node\._previewFocused \? Math\.min\(1, age \/ 8\) : 0, -1, api\.newPose\(\)\);/);
    assert.match(source, /Math\.floor\(\(performance\.now\(\) - this\._motionPlay\.start\) \* 60 \/ 1000\)/);
});

test('the canvas poses a moving layer as the game does, only while Motion plays', () => {
    const editor = Object.create(Editor.prototype);
    const calls = [];
    editor.ctx = { globalAlpha: 1, translate: (x, y) => calls.push(['translate', x, y]), rotate: angle => calls.push(['rotate', angle]), scale: (x, y) => calls.push(['scale', x, y]) };
    const node = { type: 'image', source: 'picture', motion: { floatY: 20, floatPeriod: 60, spin: 90, fadeFrom: 255, fadeTo: 0, fadePeriod: 60 } };
    const rect = { x: 100, y: 50, width: 64, height: 64 };
    editor._motionPlay = null;
    editor.poseContext(node, rect);
    assert.deepEqual(calls, [], 'not playing: the layer stands where it is edited');
    assert.equal(editor.motionAge(), 0);
    editor._motionPlay = { start: 0 };
    editor.motionAge = () => 15;
    editor.poseContext(node, rect);
    assert.deepEqual(calls, [['translate', 0, 20], ['translate', 132, 82], ['rotate', 22.5 * Math.PI / 180], ['scale', 1, 1], ['translate', -132, -82]]);
    assert.ok(Math.abs(editor.ctx.globalAlpha - 0.5) < 1e-9);
    // The same numbers the game's window gets at that update.
    const sandbox = runtime();
    sandbox.Window_Base.prototype.update = function() {};
    const win = nodeWindow(sandbox, node, { width: 64, height: 64, layout: [100, 50] });
    win.updateShown = () => {};
    for (let i = 0; i < 15; i++) win.update();
    assert.deepEqual([win.x - win.pivot.x, win.y - win.pivot.y], [100, 50 + 20]);
    assert.ok(Math.abs(win.rotation - 22.5 * Math.PI / 180) < 1e-9 && Math.abs(win.alpha - 0.5) < 1e-9);
});

// ---------------------------------------------------------------------------------------------------------
// Carrying: a node's motion and its Angle carry every node placed inside it.

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message || ''} ${actual} ~ ${expected}`);

test('a carry is the sum of a node\'s ancestors, outermost first: moved, grown and turned about each one\'s center, faded by each', () => {
    const carry = Motion.newCarry(), at = {};
    // Nothing carries: a point stays where the layout put it.
    assert.deepEqual(Motion.carryPoint(carry, 30, 40, at), { x: 30, y: 40 });
    // A parent moved by (10, -5): everything inside moves with it.
    Motion.carryInto(Motion.carryStart(carry), 100, 100, 10, -5, 1, 0, 1);
    assert.deepEqual(Motion.carryPoint(carry, 30, 40, at), { x: 40, y: 35 });
    // A parent turned a quarter about its center (100, 100): the point to its right goes below it.
    Motion.carryInto(Motion.carryStart(carry), 100, 100, 0, 0, 1, 90, 1);
    Motion.carryPoint(carry, 150, 100, at); close(at.x, 100); close(at.y, 150);
    assert.deepEqual([carry.turn, carry.scale, carry.alpha], [90, 1, 1]);
    // Grown to double about its center, and half as opaque.
    Motion.carryInto(Motion.carryStart(carry), 100, 100, 0, 0, 2, 0, 0.5);
    assert.deepEqual(Motion.carryPoint(carry, 150, 110, at), { x: 200, y: 120 });
    assert.deepEqual([carry.scale, carry.alpha], [2, 0.5]);
    // Grandparent then parent: the parent's own center is itself carried by the grandparent.
    Motion.carryStart(carry);
    Motion.carryInto(carry, 100, 100, 0, 0, 1, 90, 0.5);      // the grandparent: a quarter turn about (100, 100)
    Motion.carryInto(carry, 150, 100, 20, 0, 2, 0, 0.5);      // the parent, centered to its right: moved 20 along its own x, doubled
    Motion.carryPoint(carry, 160, 100, at);                    // a point 10 right of the parent's center
    // In the parent: 150 + 20 + 2 * 10 = 190 on x. The grandparent turns that about (100, 100): 90 below it.
    close(at.x, 100); close(at.y, 190);
    assert.deepEqual([carry.turn, carry.scale, carry.alpha], [90, 2, 0.25], 'turns add, sizes and opacities multiply');
    // The order matters: the same two the other way round land elsewhere.
    const other = Motion.newCarry();
    Motion.carryInto(other, 150, 100, 20, 0, 2, 0, 0.5);
    Motion.carryInto(other, 100, 100, 0, 0, 1, 90, 0.5);
    Motion.carryPoint(other, 160, 100, at);
    assert.ok(Math.abs(at.x - 100) > 1 || Math.abs(at.y - 190) > 1);
    // Undone: the layout point under a drawn point, and a drag on the screen as a movement in the layout.
    Motion.carryPoint(carry, 37, 81, at);
    const back = Motion.carryBack(carry, at.x, at.y, {});
    close(back.x, 37); close(back.y, 81);
    const delta = Motion.carryDeltaBack(carry, 0, 10, {});     // ten pixels down the screen
    close(delta.x, 5); close(delta.y, 0, 'under a quarter turn and a doubling, that is five along the layout\'s x');
    // A carried node as drawn: the carry, then its own offset, size, turn and opacity about its own center.
    const drawn = Motion.carried(carry, 160, 100, 0, 0, 1.5, 15, 0.5, {});
    close(drawn.x, 100); close(drawn.y, 190);
    assert.deepEqual([drawn.scale, drawn.turn, drawn.alpha], [3, 105, 0.125]);
    const moved = Motion.carried(carry, 160, 100, 5, 0, 1, 0, 1, {});
    close(moved.x, 100); close(moved.y, 200, 'its own offset is in its parent\'s frame: five along x there is ten down the screen');
    // What carries: an Angle, or a motion that moves the node itself (a sheet's frames and a drift happen inside it).
    assert.equal(Motion.carries(0, null), false);
    assert.equal(Motion.carries(15, null), true);
    assert.equal(Motion.carries(0, Motion.normalize({ floatY: 4 }, 'box')), true);
    assert.equal(Motion.carries(0, Motion.normalize({ appearOpacity: 0 }, 'box')), true);
    assert.equal(Motion.carries(0, Motion.normalize({ cols: 4 }, 'image', 'picture')), false);
    assert.equal(Motion.carries(0, Motion.normalize({ driftX: 30 }, 'image', 'picture')), false);
});

/** Windows for a record's nodes, laid out by the game's own resolveRect and linked as a scene links them. */
function linkedWindows(sandbox, nodes) {
    const ui = sandbox.ReactorUI;
    const record = ui.normalizeInterface({ id: 1, coordinateSpace: 'screen', nodes });
    const rects = new Map(), byId = new Map(record.nodes.map(node => [node.id, node]));
    const screen = { x: 0, y: 0, width: 320, height: 180 };
    // As the scene resolves them: a parent that leads back to the node roots it on the screen.
    const resolve = (node, trail = new Set()) => {
        if (rects.has(node.id)) return rects.get(node.id);
        const parent = byId.get(node.parent);
        const inside = parent && parent !== node && !trail.has(node.id) ? resolve(parent, trail.add(node.id)) : screen;
        rects.set(node.id, ui.resolveRect(node, inside, null));
        return rects.get(node.id);
    };
    const windows = record.nodes.map(node => {
        const rect = resolve(node);
        const win = nodeWindow(sandbox, node, { width: rect.width, height: rect.height, layout: [rect.x, rect.y] });
        // As in a scene: the window holds the record's own node.
        win._uiNode = node;
        win.updateShown = () => {};
        return win;
    });
    ui.linkCarried(windows, record.nodes);
    return new Map(windows.map(win => [win._uiNode.id, win]));
}

test('the scene works out once which windows are carried; a window with no moving or angled ancestor takes the old path', () => {
    const sandbox = runtime();
    const windows = linkedWindows(sandbox, [
        { id: 1, type: 'box', x: 10, y: 10, width: 100, height: 60 },                                   // a plain parent
        { id: 2, type: 'button', parent: 1, x: 10, y: 10, width: 40, height: 20 },                      // inside it: not carried
        { id: 3, type: 'box', x: 150, y: 10, width: 100, height: 60, angle: 90 },                       // an angled parent
        { id: 4, type: 'button', parent: 3, x: 10, y: 10, width: 40, height: 20 },                      // carried by 3
        { id: 5, type: 'box', parent: 3, x: 60, y: 30, width: 30, height: 20, motion: { floatX: 6, floatPeriod: 60 } },   // carried by 3, moves itself
        { id: 6, type: 'text', parent: 5, x: 2, y: 2, width: 10, height: 10, text: 'x' },                // carried by 3 and by 5
        { id: 7, type: 'image', x: 10, y: 100, width: 50, height: 50, motion: { cols: 4 } },             // a sheet of frames: carries nothing
        { id: 8, type: 'text', parent: 7, x: 0, y: 0, width: 10, height: 10, text: 'y' },
        { id: 9, type: 'box', parent: 10, x: 0, y: 0, width: 10, height: 10, angle: 20 },                // 9 and 10 name each other
        { id: 10, type: 'box', parent: 9, x: 0, y: 0, width: 10, height: 10, angle: 20 }
    ]);
    const carriers = id => Array.from(windows.get(id)._uiCarry || [], win => win._uiNode.id);
    assert.deepEqual([1, 2, 3, 7, 8].map(id => [!!windows.get(id)._uiCarry, windows.get(id)._uiPosed]), [[false, false], [false, false], [false, false], [false, true], [false, false]]);
    assert.deepEqual([carriers(4), carriers(5), carriers(6)], [[3], [3], [3, 5]], 'outermost first');
    assert.deepEqual([4, 5, 6].map(id => windows.get(id)._uiPosed), [true, true, true]);
    assert.deepEqual(Array.from(windows.get(5)._uiMotion.carried, win => win._uiNode.id), [6], 'a moving node knows what it carries');
    assert.equal(windows.get(7)._uiMotion.carried, null);
    assert.ok(!windows.get(9)._uiCarry && !windows.get(10)._uiCarry, 'parents that name each other carry nothing');
    // The uncarried child of a plain parent is placed by the old code alone.
    const plain = windows.get(2);
    plain.applyMotionPose = () => { throw new Error('not carried: must not be posed'); };
    plain.syncVisualState();
    assert.deepEqual([plain.x, plain.y, plain.rotation, plain.pivot.x], [20, 20, 0, 0]);
    assert.match(runtimeSource, /if \(this\._uiPosed && this\._uiLayoutX !== undefined\) this\.applyMotionPose\(/, 'one flag stands before every posed path');
    assert.match(runtimeSource, /ReactorUI\.linkCarried\(this\._nodeWindows, this\._interface\.nodes\);/);
});

test('an Angle and a motion carry the windows inside: place, size, turn and opacity, with the child\'s own on top', () => {
    const sandbox = runtime();
    sandbox.Window_Base.prototype.update = function() {};
    const windows = linkedWindows(sandbox, [
        { id: 3, type: 'box', x: 150, y: 10, width: 100, height: 60, angle: 90 },                         // center (200, 40)
        { id: 4, type: 'button', parent: 3, x: 10, y: 10, width: 40, height: 20, angle: 10 },             // layout (160, 20), center (180, 30)
        { id: 5, type: 'box', parent: 3, x: 60, y: 30, width: 30, height: 20, motion: { floatX: 6, floatPeriod: 60, pulseFrom: 100, pulseTo: 300, pulsePeriod: 60, fadeFrom: 255, fadeTo: 0, fadePeriod: 60 } },   // center (225, 50)
        { id: 6, type: 'text', parent: 5, x: 2, y: 2, width: 10, height: 10, text: 'x' }                  // layout (212, 42), center (217, 47)
    ]);
    // The button: its center (180, 30) is 20 left of and 10 above the box's; a quarter turn puts it 10 right and 20 above.
    const button = windows.get(4);
    close(button.x, 210); close(button.y, 20);
    assert.deepEqual([button.pivot.x, button.pivot.y], [20, 10], 'it turns about its own center');
    close(button.rotation, (90 + 10) * Math.PI / 180, 'the box\'s Angle and its own');
    assert.deepEqual([button.scale.x, button.alpha], [1, 1]);
    // After 15 updates the inner box has floated 6 along ITS parent's x (down the screen), doubled and half faded.
    for (let i = 0; i < 15; i++) windows.get(5).update();
    const inner = windows.get(5);
    close(inner.x, 190); close(inner.y, 65 + 6);
    close(inner.scale.x, 2); close(inner.alpha, 0.5); close(inner.rotation, Math.PI / 2);
    // The text inside it was placed by that update, without one of its own: 8 left and 3 above the inner box's
    // center in the layout, doubled about that center, then turned with the outer box.
    const text = windows.get(6);
    close(text.x, 190 + 6); close(text.y, 71 - 16);
    close(text.scale.x, 2); close(text.alpha, 0.5); close(text.rotation, Math.PI / 2);
    // The interface's own transition moves and fades a carried window like any other.
    button._uiTransitionX = 100; button._uiTransitionAlpha = 0.5;
    button.syncVisualState();
    close(button.x, 310); close(button.alpha, 0.5);
    // A carried window under a parent that only moves stays on whole pixels.
    const slid = linkedWindows(sandbox, [
        { id: 1, type: 'box', x: 10, y: 10, width: 101, height: 61, motion: { appearX: -200, appearDuration: 10 } },
        { id: 2, type: 'list', parent: 1, x: 7, y: 7, width: 51, height: 31 }
    ]);
    assert.deepEqual([slid.get(2).x, slid.get(2).y], [17 + 25.5 - 200, 17 + 15.5], 'made at the parent\'s starting place');
    for (let i = 0; i < 10; i++) slid.get(1).update();
    assert.deepEqual([slid.get(2).x - slid.get(2).pivot.x, slid.get(2).y - slid.get(2).pivot.y], [17, 17], 'a list is carried like any other node');
    // A fitted record: the carry is worked out on the screen, at the fit's factor.
    const fitted = linkedWindows(sandbox, [
        { id: 1, type: 'box', x: 100, y: 100, width: 100, height: 100, angle: 90 },
        { id: 2, type: 'box', parent: 1, x: 0, y: 0, width: 20, height: 20 }
    ]);
    for (const win of fitted.values()) { win._uiFitScale = 0.5; win.scale.set(0.5, 0.5); win._uiLayoutX *= 0.5; win._uiLayoutY *= 0.5; }
    fitted.get(2).syncVisualState();
    // On the screen the parent's center is (75, 75) and the child's (55, 55): a quarter turn puts it at (95, 55).
    close(fitted.get(2).x, 95); close(fitted.get(2).y, 55); close(fitted.get(2).scale.x, 0.5);
});

test('a click lands on a carried button where it is drawn, and direction keys go by drawn places', () => {
    const sandbox = runtime();
    const windows = linkedWindows(sandbox, [
        { id: 1, type: 'box', x: 100, y: 20, width: 100, height: 100, angle: 90 },       // center (150, 70)
        { id: 2, type: 'button', parent: 1, x: 0, y: 40, width: 20, height: 20 },        // layout (100, 60)-(120, 80); drawn about (150, 30)
        { id: 3, type: 'button', x: 140, y: 150, width: 20, height: 20 },
        { id: 4, type: 'button', x: 60, y: 60, width: 20, height: 20 }
    ]);
    // The game hit-tests through the window's own transform, which PIXI builds from the pivot, place, size and turn set here.
    for (const win of windows.values()) {
        Object.defineProperty(win, 'worldTransform', { get() {
            const r = this.rotation, c = Math.cos(r), s = Math.sin(r), k = this.scale.x, self = this;
            return { applyInverse(point) { const dx = point.x - self.x, dy = point.y - self.y; return { x: (c * dx + s * dy) / k + self.pivot.x, y: (c * dy - s * dx) / k + self.pivot.y }; } };
        } });
    }
    const button = windows.get(2);
    close(button.x, 150); close(button.y, 30);
    assert.equal(button.containsPoint(150, 30), true, 'its drawn center');
    assert.equal(button.containsPoint(158, 22), true);
    assert.equal(button.containsPoint(110, 70), false, 'where the layout alone would have it: nothing is drawn there');
    assert.equal(windows.get(1).containsPoint(110, 70), true);
    // Direction keys: from the button below, Up reaches the carried button (drawn above it), not the one beside its layout place.
    const scene = Object.create(sandbox.Scene_ReactorUI.prototype);
    scene._nodeWindows = [...windows.values()];
    for (const win of scene._nodeWindows) { win.isFocusable = () => win._uiNode.type === 'button'; win.setFocused = () => {}; }
    scene._focusIndex = scene._nodeWindows.indexOf(windows.get(3));
    scene.moveFocus('up');
    assert.equal(scene.focusedWindow()._uiNode.id, 2);
    const at = sandbox.ReactorUI.drawnCenter(windows.get(3), {});
    assert.deepEqual([at.x, at.y], [150, 160], 'an unposed window\'s center is its corner plus half its size');
});

test('the editor\'s canvas carries the layers inside an angled layer: drawing, picking, dragging and resizing', () => {
    const editor = Object.create(Editor.prototype);
    const calls = [];
    editor.ctx = { globalAlpha: 1, transform: (...m) => calls.push(m.map(v => Math.round(v * 1000) / 1000)), translate() {}, rotate() {}, scale() {} };
    editor.current = { nodes: [
        { id: 1, type: 'box', parent: 0, anchor: 'topLeft', x: 100, y: 20, width: 100, height: 100, angle: 90 },
        { id: 2, type: 'button', parent: 1, anchor: 'topLeft', x: 0, y: 40, width: 20, height: 20 },
        { id: 3, type: 'button', parent: 0, anchor: 'topLeft', x: 140, y: 150, width: 20, height: 20 }
    ] };
    editor.node = id => editor.current.nodes.find(node => node.id === id);
    editor.screenSize = () => ({ width: 320, height: 180 });
    editor.measureText = () => null;
    editor.onVictoryPage = () => true;
    editor.scale = 1;
    editor._motionPlay = null;
    const rects = editor.rects();
    const child = editor.node(2);
    assert.equal(editor.carryOf(editor.node(1)), null);
    assert.equal(editor.carryOf(editor.node(3)), null);
    const carry = editor.carryOf(child);
    assert.deepEqual([carry.turn, carry.scale, carry.alpha], [90, 1, 1]);
    // Drawn through the same carry the game places the window by.
    editor.carryContext(child);
    assert.deepEqual(calls, [[0, 1, -1, 0, 220, -80]]);
    const drawn = editor.turnedPoint(child, rects.get(2), { x: 110, y: 70 });
    close(drawn.x, 150); close(drawn.y, 30);
    // Picked where it is drawn, not where the layout alone would have it.
    assert.equal(editor.nodeAt(rects, { x: 150, y: 30 }), child);
    assert.equal(editor.nodeAt(rects, { x: 110, y: 70 }).id, 1, 'that spot is the box alone');
    assert.equal(editor.handleAt(rects.get(2), { x: 160, y: 40 }, child), 'ne', 'under a quarter turn the child\'s top right corner is drawn at the bottom right');
    // A drag follows the pointer: ten pixels down the canvas is ten along the box's own x.
    const dragged = editor.dragDelta(child, 0, 10);
    close(dragged.x, 10); close(dragged.y, 0);
    assert.deepEqual(editor.dragDelta(editor.node(3), 3, 4), { x: 3, y: 4 });
    // A resize by that handle, pulled ten down the canvas, widens the child by ten in its own frame.
    const drag = { handle: 'ne', origin: { x: 0, y: 40, width: 20, height: 20 }, rect: rects.get(2) };
    editor.resizeTurned(child, drag, 0, 10, value => Math.round(value));
    assert.deepEqual([child.x, child.y, child.width, child.height], [0, 40, 30, 20]);
    // While Motion plays, a moving ancestor's pose carries too; at rest only Angles do.
    const mover = { id: 4, type: 'box', parent: 0, anchor: 'topLeft', x: 0, y: 0, width: 50, height: 50, motion: { floatX: 10, floatPeriod: 60 } };
    const rider = { id: 5, type: 'text', parent: 4, anchor: 'topLeft', x: 5, y: 5, width: 10, height: 10 };
    editor.current.nodes.push(mover, rider);
    editor.rects();
    assert.equal(editor.carryOf(rider), null);
    editor._motionPlay = { start: 0 };
    editor.motionAge = () => 15;
    const moving = editor.carryOf(rider);
    assert.deepEqual([moving.tx, moving.ty, moving.turn], [10, 0, 0]);
    // The hints say so.
    const source = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    assert.equal(source.split("tt('Layers inside this one are carried: they move, grow, turn and fade with it.')").length - 1, 2, 'beside Angle and in the Motion card');
});
