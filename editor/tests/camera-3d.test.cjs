const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const cameras = require(path.join(repoRoot, 'runtime', 'reactor_3d.js')).Camera;
require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
const Elevation = globalThis.RRMapElevation;
const Camera3DEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'Camera3DEditor.js'));

const context = {
    displayPosition: () => ({ x: 10, y: 20, elevation: 0 }),
    playerPosition: () => ({ x: 3, y: 4, elevation: 1, direction: 6 }),
    playerDirection: () => 6,
    eventPosition: id => (id === 5 ? { x: 7, y: 8, elevation: 2, direction: 2 } : null)
};

test('camera states normalize to a mode plus bounded optional overrides', () => {
    assert.deepEqual(cameras.normalizeState(null), {
        mode: 'fixed', pitch: null, yaw: null, distance: null, fov: null, focus: 'auto', eventId: 0
    });
    const state = cameras.normalizeState({ mode: 'First Person', pitch: '200', yaw: '', fov: 'x', distance: 0.1, focus: 'this event' });
    assert.equal(state.mode, 'firstPerson');
    assert.equal(state.pitch, 89);
    assert.equal(state.yaw, null);
    assert.equal(state.fov, null);
    assert.equal(state.distance, 0.5);
    assert.equal(state.focus, 'event');
    assert.equal(cameras.modeName('top-down'), 'topDown');
    assert.equal(cameras.modeName('nonsense'), 'fixed');
    assert.equal(cameras.isDefaultState({}), true);
    assert.equal(cameras.isDefaultState({ yaw: 10 }), false);
});

test('each mode resolves to the numbers the camera is placed from', () => {
    const fixed = cameras.resolve({}, context);
    assert.equal(fixed.mode, 'fixed');
    assert.equal(fixed.pitch, 55);
    assert.deepEqual([fixed.x, fixed.z], [10, 20]);
    assert.equal(fixed.eye, false);

    const iso = cameras.resolve({ mode: 'isometric' }, context);
    assert.equal(iso.yaw, 45);
    assert.equal(iso.fov, 15);
    assert.ok(iso.distance > fixed.distance, 'a narrow field of view stands further back to keep the tile scale');

    cameras.look.seeded = false;
    const third = cameras.resolve({ mode: 'thirdPerson' }, context);
    assert.equal(third.yaw, 90, 'opens behind a player facing right');
    assert.equal(third.distance, 8);
    assert.equal(third.y, 2, 'looks at the figure, a tile above the ground it stands on');
    assert.deepEqual([third.x, third.z], [3, 4]);

    const first = cameras.resolve({ mode: 'firstPerson', yaw: 10 }, context);
    assert.equal(first.eye, true);
    assert.equal(first.hidePlayer, true);
    assert.equal(first.yaw, 100, 'yaw offsets add to the look');
    assert.equal(first.y, 1 + cameras.EYE_HEIGHT);

    const onEvent = cameras.resolve({ mode: 'topDown', focus: 'event', eventId: 5 }, context);
    assert.deepEqual([onEvent.x, onEvent.z, onEvent.y], [7, 8, 2]);
    const missingEvent = cameras.resolve({ focus: 'event', eventId: 99 }, context);
    assert.deepEqual([missingEvent.x, missingEvent.z], [3, 4], 'a missing event falls back to the player');
});

test('a commanded change eases over its frames and player-relative modes turn smoothly', () => {
    const from = cameras.resolve({}, context);
    const to = cameras.resolve({ mode: 'topDown' }, context);
    const tween = { frames: 10, total: 10, from: Object.assign({}, from) };
    let current = from;
    for (let i = 0; i < 10; i++) current = cameras.step(current, to, tween);
    assert.equal(tween.frames, 0);
    assert.ok(Math.abs(current.pitch - to.pitch) < 1e-6);

    // The look belongs to the mouse: a facing change alone leaves the camera.
    cameras.look.seeded = false;
    const facingRight = cameras.resolve({ mode: 'thirdPerson' }, context);
    const facingDown = cameras.resolve({ mode: 'thirdPerson' }, Object.assign({}, context, {
        playerPosition: () => ({ x: 3, y: 4, elevation: 1, direction: 2 })
    }));
    assert.equal(facingDown.yaw, facingRight.yaw, 'turning the body does not swing the camera');
    cameras.look.yaw = 180;
    const looked = cameras.resolve({ mode: 'thirdPerson' }, context);
    assert.equal(looked.yaw, 180, 'the mouse look is the camera yaw');
    const turned = cameras.step(facingRight, looked, null);
    assert.ok(turned.yaw > 90 && turned.yaw < 180, `eases without the pointer held: ${turned.yaw}`);
    // Looking up never puts the eye under the floor: the pitch is kept as
    // asked (the view pitches up over the shoulder) and the camera slides in.
    cameras.look.yaw = 0;
    cameras.look.pitch = -25;
    const up = cameras.resolve({ mode: 'thirdPerson' }, context);
    assert.equal(up.pitch, -25, 'the look-up pitch is the view pitch');
    assert.ok(up.distance < 8 && up.distance >= 1.5, `slides in: ${up.distance}`);
    cameras.look.pitch = -12;
    const half = cameras.resolve({ mode: 'thirdPerson' }, context);
    assert.ok(half.distance > up.distance && half.distance < 8, `slides in with the look: ${half.distance}`);
    cameras.look.pitch = 30;
    const down = cameras.resolve({ mode: 'thirdPerson' }, context);
    assert.equal(down.distance, 8, 'looking down keeps the full distance');
    cameras.look.pitch = null;
    // Yaw always takes the short way round.
    cameras.look.yaw = 0;
    const a = cameras.resolve({ mode: 'thirdPerson' }, context);
    cameras.look.yaw = 270;
    const b = cameras.resolve({ mode: 'thirdPerson' }, context);
    const short = cameras.step(a, b, null);
    assert.ok(short.yaw < 0 && short.yaw > -90, `0 to 270 goes through negative yaw: ${short.yaw}`);
    // WASD relative to the camera, eight ways.
    cameras.held.clear(); cameras.look.yaw = 0; cameras.held.add('forward');
    assert.deepEqual(cameras.relativeMove(), { horz: 0, vert: 8 });
    cameras.look.yaw = 90; cameras.held.add('right');
    assert.deepEqual(cameras.relativeMove(), { horz: 6, vert: 2 });
    cameras.held.clear();
    assert.equal(cameras.relativeMove(), null);
    cameras.look.seeded = false;
});

test('command arguments parse with the event id supplied by the interpreter', () => {
    const parsed = cameras.normalizeArgs({ mode: 'thirdPerson', focus: 'event', duration: '45', wait: 'true', keep: 'false' }, { eventId: () => 12 });
    assert.equal(parsed.state.eventId, 12);
    assert.equal(parsed.duration, 45);
    assert.equal(parsed.wait, true);
    assert.equal(parsed.keep, false);
});

test('the editor builds the plugin command the runtime reads', () => {
    const command = Camera3DEditor.build({ mode: 'isometric', pitch: '40', yaw: '', distance: 'abc', fov: '20', focus: 'event', eventId: '3', duration: 30, wait: true, keep: false }, 2);
    assert.equal(command.code, 357);
    assert.equal(command.indent, 2);
    assert.deepEqual(command.parameters.slice(0, 3), ['RPGReactor', 'ChangeCamera3D', 'Change 3D Camera']);
    assert.deepEqual(command.parameters[3], {
        mode: 'isometric', pitch: '40', yaw: '', distance: '', fov: '20', focus: 'event', eventId: '3', duration: '30', wait: 'true', keep: 'false'
    });
    const state = cameras.normalizeArgs(command.parameters[3]).state;
    assert.equal(state.mode, 'isometric');
    assert.equal(state.pitch, 40);
    assert.equal(state.yaw, null);
    assert.equal(state.eventId, 3);
});

test('a map default camera is written to the sidecar only when it differs from the stock view', () => {
    const map = { id: 1, width: 2, height: 2, note: '<3d>' };
    assert.equal(Elevation.setCamera(map, { mode: 'fixed' }), false);
    assert.equal(map.reactor3d, undefined);
    assert.equal(Elevation.setCamera(map, { mode: 'Third Person', pitch: '30', yaw: '' }), true);
    assert.deepEqual(map.reactor3d.camera, { mode: 'thirdPerson', pitch: 30 });
    assert.deepEqual(cameras.mapDefault(map), cameras.normalizeState({ mode: 'thirdPerson', pitch: 30 }));
    assert.equal(Elevation.setCamera(map, { mode: 'fixed', pitch: '' }), true);
    assert.equal('camera' in map.reactor3d, false);
});

test('the runtime, editor, and manifest are wired for the camera module', () => {
    const main = read('runtime/reactor_main.js');
    assert.match(main, /runtime revision: 20260830\.36/);
    assert.doesNotMatch(main, /reactor_camera_3d/, 'the camera lives in reactor_3d.js, not a file of its own');

    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /if \(cameras && cameras\.update\(this\)\) return;/);
    assert.match(sprites, /Reactor3D\.Camera\.installHooks\(\);\s*Reactor3D\.Camera\.registerCommands\(\);/, 'hooks install once the game classes exist');
    const module = read('runtime/reactor_3d.js');
    assert.match(module, /PluginManager\.registerCommand\(PLUGIN_NAME, COMMAND/);
    assert.match(module, /Sprite_Character\.prototype\.updateVisibility = function/);
    assert.equal((module.match(/Reactor3D\.characterHiddenByCamera\(character\)/g) || []).length, 2, 'models and billboards hide the party in first person');
    assert.match(module, /Reactor3D\.Camera = api;/);
    assert.equal(cameras.COMMAND, 'ChangeCamera3D');

    const list = read('editor/src/event/EventCommandList.js');
    assert.match(list, /if \(name === 'ChangeCamera3D'\) return this\.camera3DEditor;/);
    const picker = read('editor/src/event/EventCommandPicker.js');
    assert.match(picker, /reactor: 'ChangeCamera3D'/);
    const common = read('editor/src/database/DatabaseCommonEventEditor.js');
    assert.equal((common.match(/getEditor\('camera3D', Camera3DEditor\)/g) || []).length, 2);
    const html = read('editor/index.html');
    assert.match(html, /src\/event\/commands\/Camera3DEditor\.js/);
    for (const id of ['map-3d-camera-select', 'map-3d-camera-pitch', 'map-3d-camera-yaw', 'map-3d-camera-distance', 'map-3d-camera-fov']) {
        assert.equal(html.split(`id="${id}"`).length - 1, 1, id);
    }
    const controller = read('editor/src/ProjectController.js');
    assert.match(controller, /elevation\.setCamera\(target, this\.readMap3DCameraForm\(\)\)/);
});
