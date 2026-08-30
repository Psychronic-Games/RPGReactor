const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
const Elevation = globalThis.RRMapElevation;

test('props are validated and held to the map', () => {
    const map = { id: 1, width: 10, height: 8, note: '<3d>' };
    const id = Elevation.addProp(map, { name: 'Props/console', ext: '.glb', x: 12, y: -3, z: 999, yaw: 400, direction: 5, size: '3', scale: 0, passable: 'true' });
    assert.equal(id, 1);
    const prop = Elevation.propById(map, 1);
    assert.deepEqual(prop, {
        id: 1, name: 'Props/console', ext: '.glb', file: '', texture: '',
        x: 9, y: 0, z: 512, yaw: 40, pitch: 0, roll: 0, direction: 2, size: 3, scale: 1, passable: true,
        animation: '', repeat: false, effect: ''
    });
    assert.equal(Elevation.addProp(map, { name: 'Props/crate', x: 2.37, y: 4.5 }), 2);
    assert.equal(Elevation.updateProp(map, 2, { x: 2.37 }), false, 'same values are not a change');
    assert.equal(Elevation.updateProp(map, 2, { yaw: -190, z: 1.5 }), true);
    assert.equal(Elevation.propById(map, 2).yaw, 170);
    assert.equal(Elevation.removeProp(map, 1), true);
    assert.equal(Elevation.props(map).length, 1);
    assert.equal(Elevation.removeProp(map, 2), true);
    assert.equal('props' in map.reactor3d, false, 'an empty list leaves the sidecar');
});

test('a sidecar holding only props is written, and an empty one is not', () => {
    const writes = [];
    const fakeFs = { existsSync: () => false, unlinkSync: () => {}, writeFileSync: (file, data) => writes.push(data) };
    const map = { id: 2, width: 2, height: 2, note: '<3d>' };
    Elevation.addProp(map, { name: 'Props/crate', x: 1, y: 1 });
    assert.equal(Elevation.save(fakeFs, path, '/project', map), true);
    assert.equal(JSON.parse(writes[0]).props.length, 1);
});

test('the runtime stands each prop in the map as a model-bound event', () => {
    const map = {
        width: 20, height: 20,
        events: [null, { id: 1, x: 1, y: 1, pages: [] }],
        reactor3d: { props: [
            { id: 4, name: 'Props/console', ext: '.glb', x: 4.25, y: 5.5, z: 0.5, yaw: 30, direction: 4, size: 3, scale: 1 },
            { id: 5, name: 'Props/crate', ext: '.glb', x: 1, y: 1, passable: true }
        ] }
    };
    assert.equal(Reactor3D.installProps(map), 2);
    const event = map.events[Reactor3D.PROP_EVENT_BASE + 4];
    assert.ok(event, 'placed above every authored id');
    assert.deepEqual([event.x, event.y], [4, 6], 'the tile it stands on');
    assert.equal(event.pages[0].through, false);
    assert.equal(event.pages[0].directionFix, true);
    assert.equal(event.pages[0].image.direction, 4);
    assert.equal(event.pages[0].list.length, 1);
    assert.equal(event.reactorProp.x, 4.25);
    assert.equal(map.events[Reactor3D.PROP_EVENT_BASE + 5].pages[0].through, true, 'a passable prop is walked through');
    const spec = Reactor3D.eventModelSpec(map, Reactor3D.PROP_EVENT_BASE + 4, 0);
    assert.equal(spec.size, 3);
    assert.ok(Math.abs(spec.yaw - 30 * Math.PI / 180) < 1e-9);
    assert.equal(Reactor3D.installProps(map), 0, 'installed once');
    assert.equal(Reactor3D.characterModelSpec({ event: () => event, eventId: () => event.id, _pageIndex: 0 }) === null, true,
        'no $dataMap in a test: the lookup needs the loaded map, which is what the game has');
});

test('runtime hooks lift props and read their free position after the events are set up', () => {
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /Game_Map\.prototype\.setupEvents = function\(\) \{[\s\S]*?event\._realX = prop\.x;[\s\S]*?event\._reactorLift = prop\.z;[\s\S]*?event\.isMoving = function\(\) \{ return false; \};/,
        'a prop between tiles is not a character mid-step');
    assert.match(runtime, /ground \+ \(character\._reactorLift \|\| 0\)/);
    const managers = read('runtime/reactor_managers.js');
    assert.match(managers, /if \(Reactor3D\.installProps\) Reactor3D\.installProps\(mapData\);/);
    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /Reactor3D\.installPropHooks\(\)/);
    assert.match(sprites, /this\.y -= this\._character\._reactorLift \* \$gameMap\.tileHeight\(\);/);
    assert.match(read('runtime/reactor_main.js'), /runtime revision: 20260829\.43/);
});

test('the editor has a props tab, a manager, and 3D placement with pose rings', () => {
    const palette = read('editor/src/TilesetPaletteViewer.js');
    assert.match(palette, /createLayerTab\('M', TilesetPaletteViewer\.tabIcon\('model3d'\), '3D-M'\)/);
    assert.match(palette, /id="model-props-ui-container"/);
    assert.match(palette, /this\.onModelPropsTabSelected\?\.\(\);/);
    const main = read('editor/src/main.js');
    assert.match(main, /new ModelPropsManager\(this\.projectController\)/);
    assert.match(main, /onModelPropsTabSelected = \(\) => \{/);
    assert.match(main, /onModelPropsTabLeft = \(\) => \{/);
    const editor3d = read('editor/src/MapEditor3D.js');
    for (const method of ['buildProps(', 'refreshProps()', 'propAt(', 'groundPointAt(', 'selectProp(', 'pickPropRing(', 'dragPropRing(', 'dragPropTo(', 'finishPropDrag()']) {
        assert.ok(editor3d.includes('    ' + method), method);
    }
    assert.match(editor3d, /this\.buildProps\(mapData, request\);/);
    assert.match(editor3d, /this\.disposeProps\(\);\s*if \(this\.eventGroup\)/);
    const html = read('editor/index.html');
    assert.match(html, /src\/utils\/PoseRings3D\.js/);
    assert.match(html, /src\/ModelPropsManager\.js/);
    const rings = require(path.join(editorRoot, 'src', 'utils', 'PoseRings3D.js'));
    assert.deepEqual(rings.AXES, ['yaw', 'pitch', 'roll']);
});

test('Play Model Animation offers the actions of the target model', () => {
    const os = require('node:os');
    const PlayModelAnimationEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'PlayModelAnimationEditor.js'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pma-'));
    const modelDir = path.join(root, '3d', 'Props', 'console');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(path.join(modelDir, 'model.json'), JSON.stringify({
        animations: [{ name: 'idle', trigger: 'always' }, { name: 'boot', trigger: 'action' }, { name: 'boot', trigger: 'action' }, { name: 'alarm', trigger: 'action' }]
    }));
    assert.deepEqual(PlayModelAnimationEditor.modelActionNames(root, 'Props/console'), ['boot', 'alarm']);
    assert.deepEqual(PlayModelAnimationEditor.modelActionNames(root, 'Props/missing'), []);

    const map = { reactor3d: { events: { '7': { '0': { name: 'Props/console' }, '1': { name: 'Props/console' } } } } };
    assert.deepEqual(PlayModelAnimationEditor.eventModelNames(map, { id: 7, note: '' }), ['Props/console']);
    assert.deepEqual(PlayModelAnimationEditor.eventModelNames(map, { id: 8, note: '<r3d: model: Props/lamp>' }), ['Props/lamp']);
    assert.deepEqual(PlayModelAnimationEditor.eventModelNames(map, { id: 9, note: '' }), []);

    const source = read('editor/src/event/commands/PlayModelAnimationEditor.js');
    assert.match(source, /<select class="pma-animation"/);
    assert.doesNotMatch(source, /datalist/, 'the free-text list is gone');
    assert.match(source, /RRDatabase3DBindings\.read\(project\.path\)/, 'the player reads the actor binding');
    fs.rmSync(root, { recursive: true, force: true });
});

test('props are chosen in the model picker and can start with an animation or effect', () => {
    const manager = read('editor/src/ModelPropsManager.js');
    assert.match(manager, /openModelPicker\(\) \{/);
    assert.match(manager, /new ModelGraphicPicker\(this\.projectController\)/);
    assert.match(manager, /id="model-props-choose"/);
    assert.match(manager, /id="model-props-animation"/);
    assert.match(manager, /id="model-props-effect"/);
    assert.doesNotMatch(manager, /model-props-list/, 'the inline model list is gone');
    const map = { id: 1, width: 4, height: 4 };
    Elevation.addProp(map, { name: 'Props/console', animation: 'boot', effect: 'alarm', yaw: 30 });
    assert.equal(Elevation.propById(map, 1).animation, 'boot');
    assert.equal(Elevation.propById(map, 1).effect, 'alarm');
    const installed = { width: 4, height: 4, events: [null], reactor3d: { props: [{ id: 1, name: 'Props/console', x: 1, y: 1, animation: 'boot', effect: 'alarm' }] } };
    Reactor3D.installProps(installed);
    assert.equal(installed.events[Reactor3D.PROP_EVENT_BASE + 1].reactorProp.animation, 'boot');
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /if \(prop\.animation\) Reactor3D\.playModelAnimation\(event, prop\.animation, \{ repeat: prop\.repeat \}\);/);
    assert.match(runtime, /if \(prop\.effect\) Reactor3D\.playModelEffect\(event, prop\.effect\);/);
    assert.match(read('runtime/reactor_main.js'), /runtime revision: 20260829\.43/);
});
