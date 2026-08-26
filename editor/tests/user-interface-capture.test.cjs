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
    const context = { console, Window_Base, Container, Buffer, Utils: { isNwjs: () => false }, location: { search: '' } };
    context.window = context;
    vm.runInNewContext(runtime.slice(start, end) + '\n; this.ReactorUI = ReactorUI;', context);
    return { ReactorUI: context.ReactorUI, Window_Base, Container };
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
    assert.match(editor, /localStorage\.setItem\('rrui\.lastCapture\.'/, 'the last capture comes back when the tab reopens');
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
