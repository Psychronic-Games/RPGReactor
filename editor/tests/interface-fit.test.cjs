'use strict';
// A User Interfaces record carries the screen size it was designed for; on another screen the game lays it out
// in its own units and shows it at one scale, so nothing leaves the screen and nothing is stretched.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const Fit = require('../src/utils/InterfaceFit.js');
const SIZES = [[640, 480], [816, 624], [1024, 576], [1280, 720], [1366, 768], [1920, 1080], [2560, 1080]];
const A = Fit.ANCHORS;
const node = (id, x, y, width, height, extra = {}) => Object.assign({ id, parent: 0, type: 'box', anchor: 'topLeft', x, y, width, height }, extra);
const rectOf = (nodes, n, frame) => {
    const parent = n.parent ? nodes.find(other => other.id === n.parent) : null;
    const within = parent ? rectOf(nodes, parent, frame) : { x: 0, y: 0, width: frame.width, height: frame.height };
    const [ax, ay] = A[n.anchor] || [0, 0];
    return { x: within.x + within.width * ax - n.width * ax + n.x, y: within.y + within.height * ay - n.height * ay + n.y, width: n.width, height: n.height };
};

/** runtime/reactor_ui.js in a sandbox whose screen is width x height. */
function runtime(width, height) {
    class Base { initialize() {} }
    const stub = () => { const C = function() {}; C.prototype = Object.create(Base.prototype); return C; };
    const sandbox = {
        console, location: { search: '' }, nw: { App: { argv: [] } }, process: { platform: 'linux' }, require: () => ({ existsSync: () => false }),
        Rectangle: class { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } },
        Point: class { constructor(x, y) { this.x = x; this.y = y; } },
        Utils: { isNwjs: () => true }, Window_Base: stub(), Window_Selectable: stub(), Scene_MenuBase: stub(), Scene_Boot: stub(), Scene_Map: stub(),
        Scene_Title: stub(), Scene_Menu: stub(), Scene_Status: stub(), Scene_GameEnd: stub(), Scene_Options: stub(), Scene_Save: stub(), Scene_Load: stub(),
        DataManager: { isTitleSkip: () => false }, ConfigManager: { save() {} },
        PluginManager: { registerCommand() {} }, SceneManager: { _stack: [], push() {}, goto() {}, prepareNextScene() {} },
        $dataSystem: { variables: [], terms: { commands: [] }, menuCommands: [] },
        XMLHttpRequest: class { open() {} send() {} overrideMimeType() {} }
    };
    if (width) sandbox.Graphics = { width, height, boxWidth: width, boxHeight: height };
    sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('runtime/reactor_ui.js'), sandbox);
    return sandbox;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('the editor and the game fit a record with the same function, text for text', () => {
    const between = text => text.slice(text.indexOf('// <interface-fit>'), text.indexOf('// </interface-fit>'));
    const game = between(read('runtime/reactor_ui.js')), editor = between(read('editor/src/utils/InterfaceFit.js'));
    assert.ok(game.length > 2000, 'the game has the block');
    assert.strictEqual(editor, game);
    assert.match(read('editor/index.html'), /<script src="src\/utils\/InterfaceFit\.js"><\/script>/);
});

test('one factor, the smaller of the two ratios, and the screen in the record\'s own units', () => {
    const nodes = [node(1, 0, 0, 1920, 1080)];
    assert.strictEqual(Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 'scene', A), null, 'the design size changes nothing');
    assert.strictEqual(Fit.fitInterfaceNodes(nodes, null, { width: 1280, height: 720 }, 'scene', A), null, 'no design size, no fitting');
    const hd = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 1280, height: 720 }, 'scene', A);
    assert.deepStrictEqual([+hd.scale.toFixed(4), hd.width, hd.height], [0.6667, 1920, 1080]);
    const old = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 816, height: 624 }, 'scene', A);
    assert.deepStrictEqual([+old.scale.toFixed(4), old.width, old.height], [0.425, 1920, 1468], 'a 4:3 screen is the frame, taller');
    const wide = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, 'scene', A);
    assert.deepStrictEqual([wide.scale, wide.width, wide.height], [1, 2560, 1080], 'an ultrawide screen is the frame, wider');
    const up = Fit.fitInterfaceNodes(nodes, { width: 1280, height: 720 }, { width: 1920, height: 1080 }, 'scene', A);
    assert.deepStrictEqual([up.scale, up.width, up.height], [1.5, 1280, 720], 'a larger screen shows it larger');
});

test('a scene keeps its design frame whole in the middle of the screen; what covers the frame covers the screen', () => {
    const nodes = [
        node(1, 0, 0, 1920, 1080, { type: 'image' }),            // background
        node(2, 344, 304, 1240, 0, { type: 'text' }),            // title, height measured in play
        node(3, 840, 640, 240, 132), node(4, 12, 12, 216, 36, { parent: 3, type: 'button' }),
        node(5, 0, 0, 1920, 52),                                 // a bar across the top of the frame
        node(6, -200, -100, 400, 200, { anchor: 'center' })      // a node on its own anchor
    ];
    const fit = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 816, height: 624 }, 'scene', A);
    const frame = { width: fit.width, height: fit.height }, top = (1468 - 1080) / 2;
    const at = id => rectOf(fit.nodes, fit.nodes.find(n => n.id === id), frame);
    assert.deepStrictEqual(at(1), { x: 0, y: 0, width: 1920, height: 1468 }, 'the background covers the whole screen');
    assert.deepStrictEqual(at(2), { x: 344, y: 304 + top, width: 1240, height: 0 });
    assert.deepStrictEqual(at(3), { x: 840, y: 640 + top, width: 240, height: 132 }, 'no size changes');
    assert.deepStrictEqual(at(4), { x: 852, y: 652 + top, width: 216, height: 36 }, 'a child stays where it was in its parent');
    assert.deepStrictEqual(at(5), { x: 0, y: top, width: 1920, height: 52 }, 'a bar across the frame stays in the frame');
    assert.deepStrictEqual(at(6), { x: 560, y: 340 + top, width: 400, height: 200 }, 'whatever its anchor');
    assert.strictEqual(fit.nodes.find(n => n.id === 6).anchor, 'center', 'anchors are kept');
    // Wider than designed: the frame stands in the middle, the background covers the sides.
    const wide = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, 'scene', A);
    const wideAt = id => rectOf(wide.nodes, wide.nodes.find(n => n.id === id), { width: wide.width, height: wide.height });
    assert.deepStrictEqual(wideAt(1), { x: 0, y: 0, width: 2560, height: 1080 });
    assert.deepStrictEqual(wideAt(3), { x: 840 + 320, y: 640, width: 240, height: 132 });
});

test('a HUD keeps each node at the edge or the middle it stood at; a bar across the screen stays across it', () => {
    const nodes = [
        node(1, 365, 900, 1190, 170, { type: 'list' }),                 // bottom middle
        node(2, 10, 64, 1905, 102, { type: 'battleWindow' }),           // across the top
        node(3, 16, 16, 300, 80),                                        // top left
        node(4, 1604, 984, 300, 80),                                     // bottom right
        node(5, -19, -383, 192, 245, { type: 'battleWindow', followActor: true }),
        node(6, 945, 360, 30, 19, { type: 'battleCursor' }),
        node(7, 12, 12, 1881, 40, { parent: 2, type: 'text' })           // across its parent
    ];
    for (const mode of ['battle', 'overlay', 'tactical', 'action', 'firstPerson']) {
        const fit = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 816, height: 624 }, mode, A);
        const frame = { width: fit.width, height: fit.height };
        const at = id => rectOf(fit.nodes, fit.nodes.find(n => n.id === id), frame);
        assert.deepStrictEqual(at(1), { x: 365, y: 1468 - 180, width: 1190, height: 170 }, mode + ': the party panel keeps to the bottom');
        assert.deepStrictEqual(at(2), { x: 10, y: 64, width: 1905, height: 102 }, 'the help stays at the top, across');
        assert.deepStrictEqual(at(3), { x: 16, y: 16, width: 300, height: 80 });
        assert.deepStrictEqual(at(4), { x: 1604, y: 1468 - 96, width: 300, height: 80 });
        assert.deepStrictEqual(fit.nodes.find(n => n.id === 5), nodes[4], 'an offset from the acting actor is left alone');
        assert.deepStrictEqual(fit.nodes.find(n => n.id === 6), nodes[5], 'and the target cursor');
    }
    const wide = Fit.fitInterfaceNodes(nodes, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, 'battle', A);
    const at = id => rectOf(wide.nodes, wide.nodes.find(n => n.id === id), { width: wide.width, height: wide.height });
    assert.deepStrictEqual(at(1), { x: 365 + 320, y: 900, width: 1190, height: 170 }, 'the middle stays the middle');
    assert.deepStrictEqual(at(2), { x: 10, y: 64, width: 2545, height: 102 }, 'the bar reaches across the wider screen');
    assert.deepStrictEqual(at(7), { x: 22, y: 76, width: 2521, height: 40 }, 'and so does what reached across the bar');
    assert.deepStrictEqual(at(4), { x: 2560 - 316, y: 984, width: 300, height: 80 });
});

test('the Demo\'s own records stay on the screen at every size, and at the size they were designed for nothing moves', () => {
    const records = JSON.parse(read('template/Demo/data/UserInterfaces.json')).filter(record => record && record.nodes && record.nodes.length);
    // Title, Main Menu and Battle were laid out for 1920x1080; the stock screens for 1280x720.
    const designOf = record => record.nodes.some(n => !n.parent && (n.x || 0) + (n.width || 0) > 1280) ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
    assert.ok(records.length >= 8);
    for (const record of records) {
        const design = designOf(record);
        assert.strictEqual(Fit.fit(Object.assign({}, record, { design }), design), null, record.name + ' at its design size');
        for (const [width, height] of SIZES) {
            const fit = Fit.fit(Object.assign({}, record, { design }), { width, height });
            if (!fit) continue;
            const frame = { width: fit.width, height: fit.height };
            for (const n of fit.nodes) {
                if (n.parent || n.followActor || n.type === 'battleCursor' || !(n.width > 0 && n.height > 0)) continue;
                const rect = rectOf(fit.nodes, n, frame);
                assert.ok(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= frame.width + 1 && rect.y + rect.height <= frame.height + 1,
                    `${width}x${height}: ${record.name} › ${n.name} leaves the screen ${JSON.stringify(rect)} of ${frame.width}x${frame.height}`);
                // Shown at fit.scale it is inside the real screen.
                assert.ok((rect.x + rect.width) * fit.scale <= width + 1 && (rect.y + rect.height) * fit.scale <= height + 1);
            }
        }
    }
});

test('the game: a record with no design size is laid out as before; with one it is fitted and shown at one scale', () => {
    const records = JSON.parse(read('template/Demo/data/UserInterfaces.json'));
    const game = runtime(1920, 1080);
    for (const record of records.filter(r => r && r.nodes && r.nodes.length)) {
        const asIs = plain(game.ReactorUI.normalizeInterface(record));
        const stamped = plain(game.ReactorUI.normalizeInterface(Object.assign({}, record, { design: { width: 1920, height: 1080 } })));
        assert.strictEqual(asIs.fit, null);
        assert.deepStrictEqual(stamped.nodes, asIs.nodes, record.name + ': identical at its design size');
        assert.strictEqual(stamped.fit, null);
    }
    const small = runtime(1280, 720);
    const title = plain(small.ReactorUI.normalizeInterface(Object.assign({}, records[1], { design: { width: 1920, height: 1080 } })));
    assert.deepStrictEqual([+title.fit.scale.toFixed(4), title.fit.width, title.fit.height], [0.6667, 1920, 1080]);
    assert.deepStrictEqual(title.design, { width: 1920, height: 1080 });
    const unstamped = plain(small.ReactorUI.normalizeInterface(records[1]));
    assert.strictEqual(unstamped.fit, null, 'a record that names no design size is never fitted');
    assert.strictEqual(unstamped.design, null);
    // A window's place is on the screen, its size its own; it is shown at the fit's scale.
    const rect = plain(small.ReactorUI.windowRect({ x: 840, y: 640, width: 240, height: 132 }, { _windowLayer: { x: 0, y: 0 } }, title.fit));
    assert.deepStrictEqual(rect, { x: 560, y: 427, width: 240, height: 132 });
    assert.deepStrictEqual(plain(small.ReactorUI.windowRect({ x: 840, y: 640, width: 240, height: 132 }, { _windowLayer: { x: 0, y: 0 } })), { x: 840, y: 640, width: 240, height: 132 });
    assert.strictEqual(small.ReactorUI.shownScale({ _uiFitScale: 0.5 }), 0.5);
    assert.strictEqual(small.ReactorUI.shownScale({}), 1);
    // Outside a game (the editor's tests, a tool) nothing is fitted unless a screen is named.
    const tool = runtime(0, 0);
    assert.strictEqual(tool.ReactorUI.normalizeInterface(Object.assign({}, records[1], { design: { width: 1920, height: 1080 } })).fit, null);
    const source = read('runtime/reactor_ui.js');
    assert.match(source, /const window = new \(built\(WindowClass\)\)\(ReactorUI\.windowRect\(rect, this, fit\), this, node\);\s+if \(fit && window\.scale\) \{ window\.scale\.set\(fit\.scale, fit\.scale\); window\._uiFitScale = fit\.scale; \}/);
    assert.match(source, /const rect = this\.windowRect\(entry\.rect, scene, fit\);\s+state\.scale = fit \? fit\.scale : 1;\s+if \(fit && win\.scale\) win\.scale\.set\(fit\.scale, fit\.scale\);/);
});

test('Refit writes the fitted layout into the record: every length times the factor, the design size re-stamped', () => {
    const record = { id: 3, name: 'Fixture', mode: 'scene', design: { width: 1920, height: 1080 }, nodes: [
        node(1, 0, 0, 1920, 1080, { type: 'image' }),
        node(2, 840, 640, 240, 132, { fontSize: 30, rowHeight: 36, borderWidth: 2 }),
        node(3, 12, 12, 216, 36, { parent: 2, type: 'button' }),
        node(4, 100, 100, 600, 300, { type: 'list', rowHeight: 48, actorElements: { name: { x: 10, y: 10, width: 200, height: 30, fontSize: 24 } } })
    ] };
    const fitted = Fit.refit(record, { width: 1280, height: 720 }, 26);
    assert.deepStrictEqual(fitted.design, { width: 1280, height: 720 });
    assert.deepStrictEqual(fitted.nodes.map(n => [n.x, n.y, n.width, n.height]), [[0, 0, 1280, 720], [560, 427, 160, 88], [8, 8, 144, 24], [67, 67, 400, 200]]);
    assert.deepStrictEqual([fitted.nodes[1].fontSize, fitted.nodes[1].borderWidth], [20, 1]);
    assert.strictEqual(fitted.nodes[2].fontSize, 17, 'a node on the project\'s font gets the size it was shown at');
    assert.deepStrictEqual([fitted.nodes[3].rowHeight, fitted.nodes[3].actorElements.name], [32, { x: 7, y: 7, width: 133, height: 20, fontSize: 16 }]);
    assert.strictEqual(Fit.fit(fitted, { width: 1280, height: 720 }), null, 'refitted, it is shown as authored');
    assert.strictEqual(record.nodes[1].x, 840, 'the record handed in is not changed');
    assert.strictEqual(Fit.refit(fitted, { width: 1280, height: 720 }, 26), fitted, 'nothing to do, the same record');
    assert.deepStrictEqual(Fit.refit({ id: 1, nodes: [] }, { width: 816, height: 624 }).design, { width: 816, height: 624 }, 'a record with no design size is stamped');
});

// ---- The editor: design size, Preview at, Refit ----
function editorAt(width, height) {
    globalThis.RRInterfaceFit = Fit;
    const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');
    const manager = {
        data: { system: { advanced: { screenWidth: width, screenHeight: height, fontSize: 26 } } },
        getSystem() { return this.data.system; }, getUserInterfaces() { return []; }, getCommonEvents() { return []; }, mutationGeneration: 0
    };
    const editor = new Editor(manager);
    editor._t = value => value;
    for (const name of ['renderTree', 'renderProperties', 'refreshFirstFocus', 'scheduleRender']) editor[name] = () => {};
    return editor;
}

test('the editor stamps a record with the screen it was made for and never restamps one', () => {
    const editor = editorAt(800, 600);
    const fresh = editor.normalizeInterface({ id: 1, name: 'New', mode: 'scene', coordinateSpace: 'screen', nodes: [] });
    assert.deepEqual(plain(fresh.design), { width: 800, height: 600 }, 'an unstamped record was made at the project size');
    const kept = editor.normalizeInterface({ id: 2, name: 'Old', mode: 'scene', coordinateSpace: 'screen', design: { width: 1920, height: 1080 }, nodes: [] });
    assert.deepEqual(plain(kept.design), { width: 1920, height: 1080 });
    const broken = editor.normalizeInterface({ id: 3, name: 'Bad', mode: 'scene', coordinateSpace: 'screen', design: { width: 'x', height: -4 }, nodes: [] });
    assert.deepEqual(plain(broken.design), { width: 800, height: 600 });
    editor.current = kept;
    assert.deepEqual(plain(editor.designSize()), { width: 1920, height: 1080 }, 'the canvas shows the record at its design size');
    assert.deepEqual(plain(editor.screenSize()), { width: 1920, height: 1080 });
    assert.deepEqual(plain(editor.projectScreenSize()), { width: 800, height: 600 });
});

test('Preview at draws the layout the game shows and leaves the record alone', () => {
    const editor = editorAt(1920, 1080);
    const nodes = [node(1, 1600, 900, 300, 160, { type: 'box' }), node(2, 20, 20, 200, 60, { type: 'box' })];
    editor.current = editor.normalizeInterface({ id: 1, name: 'HUD', mode: 'battle', coordinateSpace: 'screen', design: { width: 1920, height: 1080 }, nodes });
    const before = JSON.stringify(editor.current);
    assert.equal(editor.previewFit(), null, 'no preview until a screen is picked');
    editor.previewAt = { width: 1920, height: 1080 };
    assert.equal(editor.previewFit(), null, 'the design size is not a preview');
    editor.previewAt = { width: 1024, height: 768 };
    const fit = Fit.fit(editor.current, editor.previewAt);
    assert.deepEqual(plain(editor.screenSize()), { width: fit.width, height: fit.height }, 'the canvas is the fitted frame');
    let drawn = null, frame = null;
    editor.renderLayout = function() { drawn = plain(this.current.nodes); frame = plain(this.screenSize()); };
    editor.render();
    assert.deepEqual(drawn.map(n => [n.id, n.anchor, n.x, n.y]), plain(fit.nodes).map(n => [n.id, n.anchor, n.x, n.y]), 'the fitted nodes are what is drawn');
    assert.deepEqual(frame, { width: fit.width, height: fit.height }, 'not fitted twice while drawing');
    assert.equal(JSON.stringify(editor.current), before, 'the record is as it was');
    editor.renderLayout = () => { throw new Error('draw failed'); };
    assert.throws(() => editor.render());
    assert.equal(JSON.stringify(editor.current), before, 'and stays so when a draw fails');
    const source = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    assert.match(source, /if \(event\.button !== 0\) return;\s*if \(this\.previewFit\(\)\) return;/, 'a preview is not dragged');
});

test('Refit rewrites the record for the project screen as one undo step', () => {
    const editor = editorAt(1280, 720);
    const nodes = [node(1, 1560, 840, 300, 180, { type: 'button', fontSize: 30, rowHeight: 48 }), node(2, 60, 60, 600, 90, { type: 'text', fontSize: 0 })];
    editor.current = editor.normalizeInterface({ id: 1, name: 'Title', mode: 'scene', coordinateSpace: 'screen', design: { width: 1920, height: 1080 }, nodes });
    const before = JSON.stringify({ nodes: editor.current.nodes, design: editor.current.design });
    editor.undoStack = []; editor.redoStack = [];
    editor.refitToProject();
    assert.equal(editor.undoStack.length, 1, 'one step');
    assert.deepEqual(plain(editor.current.design), { width: 1280, height: 720 });
    const one = editor.current.nodes.find(n => n.id === 1);
    assert.deepEqual([one.width, one.height, one.fontSize, one.rowHeight], [200, 120, 20, 32]);
    assert.equal(Fit.fit(editor.current, { width: 1280, height: 720 }), null, 'the game no longer fits it');
    editor.refitToProject();
    assert.equal(editor.undoStack.length, 1, 'nothing to do the second time');
    editor.undo();
    assert.equal(JSON.stringify({ nodes: editor.current.nodes, design: editor.current.design }), before, 'undo brings the numbers and the design size back');
    editor.redo();
    assert.deepEqual(plain(editor.current.design), { width: 1280, height: 720 });
});

test('the smallest fitted text is measured against a floor that follows the screen', () => {
    assert.deepEqual([480, 600, 720, 1080].map(Fit.readableFloor), [12, 13, 14, 14]);
    assert.equal(Fit.smallestText([{ type: 'text', fontSize: 0 }, { type: 'button', fontSize: 40 }, { type: 'box', fontSize: 4 }], 26, 0.5), 13);
    assert.equal(Fit.smallestText([{ type: 'box' }], 26, 0.5), 0);
});

test('every new editor string is in all seventeen locales', () => {
    const sandbox = { globalThis: null }; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read('editor/src/I18nDeepTranslations.js'), sandbox);
    const keys = ['Preview at', 'Design size', 'Project screen', 'The layout as the game shows it on that screen. The saved numbers stay as they are.',
        'Designed for {design}. The game fits it to {screen}.', 'Refit to this size', "Rewrites this interface's numbers for the project screen. Undo takes it back.",
        'Preview of {screen}: layers cannot be moved here.', 'Smallest text {size} px', 'Hard to read at this size.', 'Designed for',
        'The screen these numbers are written for. The game fits the interface to any other screen.', 'Screen'];
    const source = read('editor/src/database/DatabaseUserInterfaceEditor.js');
    for (const key of keys) assert.ok(source.includes(key.replace(/'/g, "'")), `the editor uses "${key}"`);
    for (const locale of ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr']) {
        for (const key of keys) {
            const text = sandbox.RR_DEEP_TEXT_TRANSLATIONS[locale][key];
            assert.ok(typeof text === 'string' && text.length, `${locale}: ${key}`);
            for (const token of key.match(/\{\w+\}/g) || []) assert.ok(text.includes(token), `${locale} keeps ${token}`);
        }
    }
});

test('text that would be too small is shown at a readable size when the layers still fit', () => {
    const design = { width: 1920, height: 1080 }, small = { width: 640, height: 480 };
    // A title: one block of commands low in the middle. A third of the size would put 26 px text at 9 px.
    const title = [node(1, 760, 700, 400, 240, { type: 'button' })];
    const shown = Fit.fitInterfaceNodes(title, design, small, 'scene', A, 26);
    assert.ok(Math.abs(shown.scale - 12 / 26) < 1e-9, 'shown at the readable size');
    assert.deepEqual([shown.width, shown.height], [Math.round(640 / shown.scale), Math.round(480 / shown.scale)]);
    const at = rectOf(shown.nodes, shown.nodes[0], shown);
    assert.ok(at.x >= 0 && at.y >= 0 && at.x + at.width <= shown.width && at.y + at.height <= shown.height, 'and still on the screen');
    assert.equal(Math.round(at.x + at.width / 2), Math.round(shown.width / 2), 'still in the middle');
    // A menu that fills the screen has no room for larger text: one factor for the whole layout, as before.
    const menu = [node(1, 20, 20, 400, 1040, { type: 'list' }), node(2, 440, 20, 1460, 1040, { type: 'list' })];
    const whole = Fit.fitInterfaceNodes(menu, design, small, 'scene', A, 26);
    assert.equal(whole.scale, 640 / 1920);
    assert.deepEqual(plain(whole), plain(Fit.fitInterfaceNodes(menu, design, small, 'scene', A)), 'the same as with no font size given');
    // A HUD pinned to two corners keeps both corners and gains size while the two stay apart.
    const hud = [node(1, 20, 880, 500, 180, { type: 'battleWindow' }), node(2, 1400, 880, 500, 180, { type: 'battleWindow' })];
    const corners = Fit.fitInterfaceNodes(hud, design, small, 'battle', A, 26);
    assert.ok(corners.scale > 640 / 1920 && corners.scale <= 12 / 26 + 1e-9);
    const [left, right] = corners.nodes.map(n => rectOf(corners.nodes, n, corners));
    assert.ok(left.x + left.width <= right.x && right.x + right.width <= corners.width && left.y + left.height <= corners.height);
    // Text already readable is left alone, and so is a larger screen.
    assert.equal(Fit.fitInterfaceNodes(title, design, { width: 1280, height: 720 }, 'scene', A, 26).scale, 1280 / 1920);
    assert.equal(Fit.fitInterfaceNodes(title, { width: 1280, height: 720 }, design, 'scene', A, 26).scale, 1.5);
});

test('the stock name entry is shown whole on a screen too small for its two windows', () => {
    const scenes = fs.readdirSync(path.join(root, 'runtime')).filter(name => /^reactor_scenes.*\.js$/.test(name)).map(name => read('runtime/' + name)).join('\n');
    const from = scenes.indexOf('Scene_Name.prototype.fitNameWindows = function() {');
    const body = scenes.slice(from, scenes.indexOf('\n};', from) + 3);
    assert.match(scenes, /this\.createInputWindow\(\);\s*this\.fitNameWindows\(\);/);
    const fitAt = (boxWidth, boxHeight) => {
        const Scene_Name = { prototype: {} };
        new Function('Scene_Name', 'Graphics', body)(Scene_Name, { boxWidth, boxHeight });
        const win = (x, y, width, height) => ({ x, y, width, height, scale: { x: 1, y: 1, set(a, b) { this.x = a; this.y = b; } } });
        const scene = { _editWindow: win(20, -58, 600, 168), _inputWindow: win(20, 118, 600, 420) };
        Scene_Name.prototype.fitNameWindows.call(scene);
        return scene;
    };
    const small = fitAt(640, 480), s = small._editWindow.scale.x;
    assert.ok(Math.abs(s - 480 / 596) < 1e-9);
    assert.ok(small._editWindow.y >= 0 && small._inputWindow.y + 420 * s <= 480 + 1 && small._editWindow.x >= 0 && small._editWindow.x + 600 * s <= 640);
    assert.equal(small._inputWindow.x, small._editWindow.x);
    const roomy = fitAt(1280, 720);
    assert.deepEqual([roomy._editWindow.scale.x, roomy._editWindow.y, roomy._inputWindow.y], [1, -58, 118], 'untouched where it fits');
});

test('undoing a Stock Layout takes back the name it gave and keeps a typed one', () => {
    const editor = editorAt(1280, 720);
    editor.updatePresentationFields = () => {};
    editor.stockLayoutKinds = () => [['title', 'Title'], ['menu', 'Main Menu']];
    editor.replacementSystem = () => null;
    editor.current = { id: 4, name: 'Title', mode: 'scene', nodes: [], firstFocus: 0 };
    editor.restoreRecordState({ bound: [], name: '' });
    assert.equal(editor.current.name, '', 'the layout name goes with the layout');
    editor.restoreRecordState({ bound: [], name: 'Title' });
    assert.equal(editor.current.name, 'Title', 'and comes back on redo');
    editor.current.name = 'My Title Screen';
    editor.restoreRecordState({ bound: [], name: '' });
    assert.equal(editor.current.name, 'My Title Screen', 'a typed name stays');
    assert.equal(editor.recordState.call(Object.assign(editor, { current: Object.assign(editor.current, { name: 'X' }) })).name, 'X');
});
