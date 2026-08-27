/**
 * Capture from game: the runtime boots into a stock scene with the
 * project's plugins, writes what is on screen, and exits; the editor shows
 * it as a locked reference layer under the nodes.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_ui.js'), 'utf8');
const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
const playtest = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'PlaytestManager.js'), 'utf8');

function loadReactorUI() {
    // Only the ReactorUI object: the file's scene classes need the corescript.
    const start = runtime.indexOf('    const ReactorUI = {};');
    const end = runtime.indexOf('    function Window_ReactorUINode()');
    class Window_Base { constructor(props) { Object.assign(this, { children: [], x: 0, y: 0, width: 0, height: 0, padding: 12, opacity: 255, backOpacity: 192, contentsOpacity: 255, openness: 255, visible: true, active: false }, props); } }
    class Container { constructor(props) { Object.assign(this, { children: [], x: 0, y: 0 }, props); } }
    class Sprite_Gauge {}
    const context = { console, Window_Base, Container, Sprite_Gauge, Buffer, Utils: { isNwjs: () => false }, location: { search: '' } };
    context.window = context;
    vm.runInNewContext(runtime.slice(start, end) + '\n; this.ReactorUI = ReactorUI;', context);
    return { ReactorUI: context.ReactorUI, Window_Base, Container, Sprite_Gauge };
}

test('the launch line names the scene and the folder, and unknown scenes are refused', () => {
    const { ReactorUI } = loadReactorUI();
    const dir = '/home/me/.cache/rpg-reactor/interface-captures/abc/menu';
    const tokens = `test&rrcapture=menu&rrcapturedir=${encodeURIComponent(dir)}`.split('&');
    assert.deepEqual(JSON.parse(JSON.stringify(ReactorUI.captureRequest(tokens))), { scene: 'menu', dir, sceneClass: 'Scene_Menu' });
    assert.equal(ReactorUI.captureRequest(['test', 'rrcapture=nope']), null);
    assert.equal(ReactorUI.captureRequest(['test', 'rrui=3']), null, 'a preview is not a capture');
    assert.equal(ReactorUI.captureRequest(['test&rrcapture=battle']), null, 'tokens arrive split on &');
    assert.deepEqual(Object.keys(ReactorUI.CAPTURE_SCENES).sort(),
        ['battle', 'equip', 'gameEnd', 'item', 'load', 'menu', 'options', 'save', 'shop', 'skill', 'status', 'title']);
});

test('every window in the scene tree is collected with its screen rect', () => {
    const { ReactorUI, Window_Base, Container } = loadReactorUI();
    const layer = new Container({ x: 8, y: 16 });
    const command = new Window_Base({ x: 3, y: 309, width: 250, height: 400, _cursorRect: { x: 4, y: 4, width: 200, height: 36 }, active: true });
    const gold = new Window_Base({ x: 1028, y: 638, width: 240, height: 70, openness: 128 });
    layer.children.push(command, gold);
    const scene = new Container({ children: [new Container({ x: 0, y: 0 }), layer] });
    const found = ReactorUI.collectWindows(scene);
    assert.deepEqual(JSON.parse(JSON.stringify(found.map(w => [w.className, w.x, w.y, w.width, w.height, w.openness, w.active]))),
        [['Window_Base', 11, 325, 250, 400, 255, true], ['Window_Base', 1036, 654, 240, 70, 128, false]]);
    assert.deepEqual(JSON.parse(JSON.stringify(found[0].cursorRect)), { x: 4, y: 4, width: 200, height: 36 });
    assert.equal(found[0].window, command, 'the live window rides along for the contents bitmap');
});

test('the runtime waits for the scene to settle, writes, and exits; the editor never asks a web build', () => {
    assert.match(runtime, /const request = ReactorUI\.captureRequest\(\);\s*if \(request && !DataManager\.isBattleTest\(\) && !DataManager\.isEventTest\(\)\) \{/);
    assert.match(runtime, /if \(\(settled && capture\.frames >= 20\) \|\| capture\.frames >= 180\) \{\s*this\.performCapture\(\);\s*SceneManager\.exit\(\);/);
    assert.match(runtime, /SceneManager\.updateMain = function\(\) \{[\s\S]*?if \(ReactorUI\._capture\) ReactorUI\.updateCapture\(\);/);
    assert.match(runtime, /"capture\.json"/);
    assert.match(runtime, /plugins,\s*windows: entries/);
    assert.match(playtest, /captureMode\(sceneKey, dir\) \{\s*return `test&rrcapture=\$\{encodeURIComponent\(sceneKey\)\}&rrcapturedir=\$\{encodeURIComponent\(dir\)\}`;/);
    assert.match(editor, /RREditorCache\.dir\('InterfaceCaptures', project\.path/);
    assert.match(editor, /ctx\.drawImage\(reference\.image, 0, 0, screen\.width, screen\.height\);/, 'the capture draws under the nodes at the screen size');
    assert.ok(editor.indexOf('ctx.drawImage(reference.image') < editor.indexOf("case 'box': this.drawSurface(node, rect); break;"), 'reference first, nodes over it');
    // The reference is a working aid for the open record, never state: no
    // record opens on another record's capture, and Capture never saves the
    // project behind the database's Cancel.
    assert.ok(!/localStorage\.setItem\('rrui\.lastCapture/.test(editor), 'no capture is restored across records or reopens');
    assert.ok(!/loadLastCapture/.test(editor));
    assert.match(editor, /this\.detach\(\);\s*this\.current = this\.normalizeInterface\(entry\);/, 'a fresh view drops the previous one');
    assert.match(editor, /this\.reference = null;\s*this\.showReference = true;/);
    assert.match(editor, /clearReference\(\) \{\s*this\.reference = null;/);
    assert.match(editor, /rr-ui-capture-clear/);
    assert.ok(!/saveProject/.test(editor), 'Capture does not save the project');
    assert.match(editor, /hasUnsavedChanges/, 'a capture of an unsaved project says so');
    // Keys inside the editor never reach the record list's Delete / Ctrl+Z.
    assert.match(editor, /wrapper\.addEventListener\('keydown', event => this\.onKey\(event\)\);/);
    assert.match(editor, /const handled = \(\) => \{ event\.preventDefault\(\); event\.stopPropagation\(\); \};/);
    const dbUi = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(dbUi, /event\.target !== detailEl && detailEl\.contains\(event\.target\)\) return;/, 'the record list ignores keys from the detail pane');
    // Add Box takes the captured window's rect; addNode hands the node back.
    assert.match(editor, /this\.select\(node\.id\);\s*return node;\s*\}/);
    assert.match(editor, /box\.fillOpacity = clamp\(entry\.backOpacity\)/);
    assert.match(runtime, /Window_ReactorUINode\.prototype\.convertEscapeCharacters = function\(text\) \{\s*const bound = ReactorUI\.resolveActorTokens[\s\S]*?ReactorUI\.convertPartyCodes\(bound\)/, 'actor and party codes resolve where text is drawn, not only where it is compared');
    assert.match(editor, /addPictureFromCapture\(index\) \{/, 'a captured window can become a picture for what no primitive log sees');
});

test('the editor cache folder is per machine, per project, never inside the project', () => {
    const cache = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'utils', 'EditorCache.js'), 'utf8');
    const context = {};
    vm.runInNewContext(cache, Object.assign(context, { require, process, window: context }));
    const RREditorCache = context.RREditorCache;
    assert.equal(RREditorCache.rootFor({ platform: 'linux', env: { XDG_CACHE_HOME: '/tmp/x' } }, path.posix, { homedir: () => '/home/a' }, 'InterfaceCaptures'), '/tmp/x/rpg-reactor/interface-captures');
    assert.equal(RREditorCache.rootFor({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' } }, path.win32, { homedir: () => 'C:\\Users\\a' }, 'InterfaceCaptures'), 'C:\\Users\\a\\AppData\\Local\\RPGReactor\\InterfaceCaptures');
    const a = RREditorCache.projectKey('/p/one');
    assert.match(a, /^[0-9a-f]{16}$/);
    assert.notEqual(a, RREditorCache.projectKey('/p/two'));
    const dir = RREditorCache.dir('InterfaceCaptures', '/p/one', 'menu');
    assert.ok(dir.endsWith(path.join(a, 'menu')));
    assert.ok(!dir.startsWith('/p/one'));
});

test('capture: text primitives merge into escape-coded runs, aligned and semantic draws stand alone', () => {
    const { ReactorUI } = loadReactorUI();
    // No ColorManager in this sandbox: colours pass through as given.
    const ctx = { mainFontSize: 26, lineHeight: 36 };
    const draws = [
        { kind: 'text', text: 'Lv', x: 0, y: 36, width: 48, height: 36, align: 'left', fontSize: 26, color: 16, outline: true, opacity: 255, measured: 30 },
        { kind: 'text', text: '12', x: 72, y: 36, width: 48, height: 36, align: 'right', fontSize: 26, color: 0, outline: true, opacity: 255, measured: 20 },
        { kind: 'blt', url: 'img/system/IconSet.png', sx: 64, sy: 32, sw: 32, sh: 32, x: 2, y: 2, width: 32, height: 32, sourceWidth: 512, sourceHeight: 640, opacity: 255 },
        { kind: 'text', text: 'Potion', x: 36, y: 0, width: 100, height: 36, align: 'left', fontSize: 26, color: 0, outline: true, opacity: 255, measured: 70 },
        { kind: 'text', text: ' x3', x: 106, y: 0, width: 40, height: 36, align: 'left', fontSize: 26, color: 4, outline: true, opacity: 255, measured: 30 },
        { kind: 'text', text: 'Far', x: 400, y: 0, width: 40, height: 36, align: 'left', fontSize: 26, color: 0, outline: true, opacity: 255, measured: 30 },
        { kind: 'text', text: 'Fleagus Gustafario', x: 0, y: 400, width: 146, height: 36, align: 'left', fontSize: 26, color: 0, outline: true, opacity: 255, measured: 210 },
        { kind: 'textEx', text: '\\C[6]Hello \\N[1]', x: 10, y: 72, width: 200, fontSize: 26, opacity: 255 },
        { kind: 'text', text: '\\GOLD', x: 0, y: 108, width: 150, height: 36, align: 'right', fontSize: 26, color: 0, outline: true, opacity: 255, codes: true },
        { kind: 'text', text: 'Title', x: 20, y: 200, width: 600, height: 48, align: 'center', fontSize: 72, color: 0, outline: true, opacity: 255, measured: 200 },
        { kind: 'blt', url: 'img/faces/Actor1.png', sx: 144, sy: 0, sw: 144, sh: 142, x: 1, y: 1, width: 144, height: 142, sourceWidth: 576, sourceHeight: 288, opacity: 255 },
        { kind: 'gradient', x: 0, y: 300, width: 100, height: 12, color: 'rgba(32, 32, 64, 0.5)', color2: '#ff0000', vertical: false, opacity: 255 }
    ];
    const elements = ReactorUI.elementsFromDraws(draws, ctx);
    const texts = elements.filter(e => e.kind === 'text');
    const byText = text => texts.find(e => e.text === text);
    assert.ok(byText('\\C[16]Lv'), 'a coloured single run keeps its colour code');
    assert.deepEqual([byText('12').align, byText('12').width, byText('12').x], ['right', 48, 72], 'aligned draws stand alone with their width');
    assert.ok(byText('\\I[18]Potion\\C[4] x3'), 'icon + text + colour change fold into one run');
    assert.equal(byText('\\I[18]Potion\\C[4] x3').x, 0);
    assert.ok(byText('Far'), 'a gap wider than the icon spacing starts a new run');
    assert.deepEqual([byText('Fleagus Gustafario').width, byText('Fleagus Gustafario').fitText, byText('Far').fitText], [146, true, undefined], 'a lone run the game squeezed keeps its width and fits its text');
    assert.ok(byText('\\C[6]Hello \\N[1]'), 'drawTextEx keeps its codes');
    assert.equal(byText('\\GOLD').align, 'right');
    assert.deepEqual([byText('Title').fontSize, byText('Title').y], [72, 200 + Math.round((48 - 82) / 2)], 'a big title re-expresses its y for a text node line box');
    const face = elements.find(e => e.kind === 'image');
    assert.deepEqual([face.source, face.file, face.index, face.width, face.height], ['face', 'Actor1', 1, 144, 142]);
    const box = elements.find(e => e.kind === 'box');
    assert.deepEqual([box.color, box.color2, box.gradient, box.fillOpacity], ['#202040', '#ff0000', true, 128]);
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(ReactorUI.imageSourceFromUrl('img/titles1/Book.png')), { source: 'title1', file: 'Book', folder: 'titles1' });
    assert.deepEqual(plain(ReactorUI.imageSourceFromUrl('/abs/path/img/pictures/Sky%20Blue.png_')), { source: 'picture', file: 'Sky Blue', folder: 'pictures' });
    assert.equal(ReactorUI.imageSourceFromUrl('img/battlebacks1/Cliff.png'), null);
    assert.equal(ReactorUI.imageFromFrame({ url: 'img/system/ButtonSet.png', sx: 96, sy: 0, sw: 48, sh: 48, sourceWidth: 528, sourceHeight: 96, x: 0, y: 0, width: 48, height: 48 }), null, 'a sub-frame of a system sheet has no node');
    assert.deepEqual(plain(ReactorUI.cssToHex('#abc')), { hex: '#aabbcc', alpha: 255 });
});

test('capture omits enemy and non-party gauges instead of rebinding them to party slot one', () => {
    const { ReactorUI, Sprite_Gauge } = loadReactorUI();
    const partyActor = {};
    const enemy = {};
    ReactorUI.partySlot = actor => actor === partyActor ? 2 : -1;
    const gauge = battler => Object.assign(new Sprite_Gauge(), {
        visible: true, _statusType: 'hp', _battler: battler,
        bitmapWidth: () => 128, textHeight: () => 24
    });
    assert.deepEqual(JSON.parse(JSON.stringify(ReactorUI.spriteElements(gauge(partyActor), 10, 20, {}))), [
        { kind: 'gauge', gauge: 'hp', index: 2, x: 10, y: 20, width: 128, height: 24 }
    ]);
    assert.equal(JSON.stringify(ReactorUI.spriteElements(gauge(enemy), 10, 20, {})), '[]');
    assert.equal(JSON.stringify(ReactorUI.spriteElements(gauge(null), 10, 20, {})), '[]');
});

test('capture: the editor turns windows and their elements into a Box per window with children, buttons wired by symbol', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const data = {
        elements: [{ kind: 'image', source: 'title1', file: 'Book', index: 0, x: 0, y: 0, width: 816, height: 624, opacity: 255 }],
        windows: [
            { className: 'Window_MenuCommand', x: 576, y: 0, width: 240, height: 300, opacity: 255, backOpacity: 192, visible: true, elements: [
                { kind: 'button', text: 'Item', symbol: 'item', x: 16, y: 16, width: 208, height: 36, align: 'left', enabled: true },
                { kind: 'button', text: 'Save', symbol: 'save', x: 16, y: 52, width: 208, height: 36, align: 'left', enabled: false },
                { kind: 'button', text: 'Formation', symbol: 'formation', x: 16, y: 88, width: 208, height: 36, align: 'left', enabled: true }
            ] },
            { className: 'Window_Gold', x: 576, y: 552, width: 240, height: 72, opacity: 0, backOpacity: 192, visible: true, elements: [
                { kind: 'text', text: '\\GOLD', x: 12, y: 12, width: 150, height: 0, align: 'right', fontSize: 0, textColor: 0, outline: true, opacity: 255 },
                { kind: 'gauge', gauge: 'hp', index: 1, x: 12, y: 40, width: 128, height: 24 }
            ] },
            { className: 'Window_Hidden', x: 0, y: 0, width: 100, height: 100, opacity: 255, visible: false, elements: [] }
        ]
    };
    const nodes = Editor.nodesFromCapture(data, { nextId: 5 });
    assert.deepEqual(nodes.map(n => n.type), ['image', 'box', 'button', 'button', 'button', 'box', 'text', 'gauge'], 'sprites first, then a box per visible window with its children');
    assert.deepEqual(nodes.map(n => n.id), [5, 6, 7, 8, 9, 10, 11, 12]);
    const [art, menu, item, save, formation, gold, goldText, gauge] = nodes;
    assert.deepEqual([art.source, art.file, art.parent], ['title1', 'Book', 0]);
    assert.deepEqual([menu.name, menu.x, menu.y, menu.width, menu.height, menu.fill, menu.fillOpacity], ['Window_MenuCommand', 576, 0, 240, 300, 'window', 192]);
    assert.deepEqual([item.parent, item.x, item.y, item.fill, item.action.type, item.action.scene, item.enabled.type], [6, 16, 16, 'none', 'scene', 'item', 'always']);
    assert.deepEqual([save.action.scene, save.enabled.type], ['save', 'never']);
    assert.equal(formation.action.type, 'none');
    assert.deepEqual([gold.fill, gold.opacity], ['none', 255], 'a transparent window becomes an unfilled box, not a faded one');
    assert.deepEqual([goldText.parent, goldText.text, goldText.align, goldText.width, goldText.height], [10, '\\GOLD', 'right', 150, 0]);
    assert.deepEqual([gauge.parent, gauge.gauge, gauge.index, gauge.width, gauge.height], [10, 'hp', 1, 128, 24]);
    const one = Editor.nodesFromCapture(data, { which: [1], includeScene: false, nextId: 1 });
    assert.deepEqual(one.map(n => n.type), ['box', 'text', 'gauge']);
    assert.equal(Editor.actionForSymbol('continue').scene, 'load');
    assert.equal(Editor.actionForSymbol('cancel').type, 'close');
});

test('capture-to-node conversion keeps physical window coordinates and parent-local contents at an 8px UI margin', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const nodes = Editor.nodesFromCapture({
        width: 1280, height: 720,
        windows: [{ className: 'Window_Test', x: 8, y: 8, width: 240, height: 72, visible: true, elements: [
            { kind: 'text', text: 'Inside', x: 12, y: 12, width: 100, height: 0 }
        ] }]
    });
    assert.deepEqual([nodes[0].x, nodes[0].y, nodes[1].parent, nodes[1].x, nodes[1].y], [8, 8, nodes[0].id, 12, 12]);
});

test('capture imports are explicit, append to the front, and allocate above sparse IDs', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const instance = new Editor({ data: { system: {} } });
    instance.current = { nodes: [{ id: 1 }, { id: 3 }, { id: 8 }] };
    assert.equal(instance.nextCaptureNodeId(), 9, 'a hole cannot collide with the rest of a multi-node import');
    assert.doesNotMatch(editor, /loadCapture\(scene[^\n]*&& !this\.current\.nodes\.length/);
    assert.doesNotMatch(editor, /this\.addAllFromCapture\(\);\s*\}\s*return;\s*\}/, 'capture completion never auto-imports a blank record');
    assert.match(editor, /Use as Starting Layout/);
    assert.match(editor, /Add All to Front/);
    assert.match(editor, /Add to Front/);
    assert.match(editor, /nodes added to front/);
});

test('captured layer ordering supports a future unified list and documents the legacy fallback', () => {
    const Editor = require(path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseUserInterfaceEditor.js'));
    const legacy = Editor.captureItems({ elements: [{ kind: 'image' }], windows: [{ className: 'Window_A' }] });
    assert.deepEqual(legacy, [{ kind: 'element', index: 0 }, { kind: 'window', index: 0 }]);
    const unified = Editor.captureItems({ elements: [{}], windows: [{}], layers: [{ kind: 'window', index: 0 }, { kind: 'element', index: 0 }] });
    assert.deepEqual(unified, [{ kind: 'window', index: 0 }, { kind: 'element', index: 0 }]);
    const converted = Editor.nodesFromCapture({
        elements: [{ kind: 'image', source: 'picture', file: 'Top', x: 0, y: 0, width: 10, height: 10 }],
        windows: [{ className: 'Window_Back', x: 0, y: 0, width: 20, height: 20, elements: [] }],
        layers: [{ kind: 'window', index: 0 }, { kind: 'element', index: 0 }]
    });
    assert.deepEqual(converted.map(node => node.type), ['box', 'image']);
    assert.match(editor, /Captured layers/);
    assert.match(editor, /Back.*Front/);
    assert.match(editor, /rr-ui-reference-layer/);
});
