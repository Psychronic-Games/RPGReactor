const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('each map remembers whether it is edited in 3D, per project, off by default', () => {
    const source = read('src/ProjectController.js');
    const store = {};
    const sandbox = {
        localStorage: {
            getItem: key => (key in store ? store[key] : null),
            setItem: (key, value) => { store[key] = String(value); }
        },
        window: {}, document: { getElementById: () => null }, console
    };
    vm.createContext(sandbox);
    vm.runInContext(source + '\n;this.ProjectController = ProjectController;', sandbox);
    const controller = Object.create(sandbox.ProjectController.prototype);
    controller.currentProject = { path: '/proj/a' };

    assert.equal(controller.map3DViewRemembered(1), false);
    controller.rememberMap3DView(1, true);
    assert.equal(controller.map3DViewRemembered(1), true);
    assert.equal(controller.map3DViewRemembered(2), false);
    controller.currentProject = { path: '/proj/b' };
    assert.equal(controller.map3DViewRemembered(1), false, 'another project has its own memory');
    controller.currentProject = { path: '/proj/a' };
    controller.rememberMap3DView(1, false);
    assert.equal(controller.map3DViewRemembered(1), false);
    assert.equal(controller.map3DViewRemembered(undefined), false);
});

test('a 3D-authored map opens in 3D by default, and an explicit "off" sticks', () => {
    const source = read('src/ProjectController.js');
    const store = {};
    const sidecars = {
        '/proj/a/data/Map001.r3d.json': JSON.stringify({ mode: '3d' }),
        '/proj/a/data/Map002.r3d.json': JSON.stringify({ mode: 'flat' })
    };
    const sandbox = {
        localStorage: {
            getItem: key => (key in store ? store[key] : null),
            setItem: (key, value) => { store[key] = String(value); }
        },
        require: name => {
            if (name === 'fs') {
                return {
                    existsSync: file => file in sidecars,
                    readFileSync: file => sidecars[file]
                };
            }
            if (name === 'path') return { join: (...parts) => parts.join('/') };
            throw new Error('unexpected require: ' + name);
        },
        window: {}, document: { getElementById: () => null }, console
    };
    vm.createContext(sandbox);
    vm.runInContext(source + '\n;this.ProjectController = ProjectController;', sandbox);
    const controller = Object.create(sandbox.ProjectController.prototype);
    controller.currentProject = { path: '/proj/a' };

    assert.equal(controller.map3DViewRemembered(1), true, 'a mode:3d sidecar defaults the map to 3D');
    assert.equal(controller.map3DViewRemembered(2), false, 'a flat sidecar does not');
    assert.equal(controller.map3DViewRemembered(3), false, 'no sidecar, no 3D');
    controller.rememberMap3DView(1, false);
    assert.equal(controller.map3DViewRemembered(1), false, 'turning 3D off beats the authored default');
    controller.rememberMap3DView(1, true);
    assert.equal(controller.map3DViewRemembered(1), true);
});

test('loading a map reconciles the view with that map\'s memory, and the checkbox records the choice', () => {
    const controller = read('src/ProjectController.js');
    const refresh = controller.slice(controller.indexOf('    refreshMap3DView() {'), controller.indexOf('    map3DViewMemoryKey() {'));
    assert.match(refresh, /const wanted = this\.map3DViewRemembered\(this\.tilemapManager\?\.currentMap\?\.id\);/);
    assert.match(refresh, /if \(wanted !== enabled && typeof this\.reconcileMap3DView === 'function'\) \{\s*this\.reconcileMap3DView\(wanted\);/);

    const main = read('src/main.js');
    assert.match(main, /const active = await this\.applyMap3DViewPreference\(event\.currentTarget\.checked\);\s*[^]*?this\.projectController\.rememberMap3DView\(/);
    assert.match(main, /reconcileMap3DView = \(wanted\) => \{\s*if \(wanted && this\._map3DCrashGuard\) return;\s*this\.applyMap3DViewPreference\(wanted === true\);/);
    assert.match(main, /if \(map3DCheckbox\) map3DCheckbox\.checked = false;/);
    assert.doesNotMatch(main, /map3DCheckbox\.checked = this\.optionsManager\.getMap3DView\(\)/);
});

test('choosing an event preview rebuilds the 3D view so models appear at once', () => {
    const events = read('src/EventManager.js');
    const setter = events.slice(events.indexOf('    setEventPreview(event, pageIndex) {'), events.indexOf('    renderEventPreviews() {'));
    assert.match(setter, /if \(!event \|\| !Number\.isInteger\(event\.id\) \|\| !this\.currentMap\) return false;/);
    assert.match(setter, /this\.renderEventPreviews\(\);\s*[^]*?this\.projectController\?\.refreshMap3DView\?\.\(\);/);
});
