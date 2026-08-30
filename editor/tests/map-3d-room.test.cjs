const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
const Elevation = globalThis.RRMapElevation;

test('the room is written to the sidecar only when it says something', () => {
    const map = { id: 7, width: 3, height: 2, note: '' };
    assert.equal(Elevation.setRoom(map, { height: 4 }), false);
    assert.equal(map.reactor3d, undefined);

    assert.equal(Elevation.setRoom(map, { height: 6 }), true);
    assert.deepEqual(map.reactor3d.room, { height: 6, floor: '', walls: '', ceiling: '' });
    assert.equal(map.reactor3d.mode, '3d');

    assert.equal(Elevation.setRoom(map, { height: 6, walls: ' Wall ' }), true);
    assert.equal(map.reactor3d.room.walls, 'Wall');
    assert.deepEqual(Elevation.room(map), { height: 6, floor: '', walls: 'Wall', ceiling: '' });

    // Back to defaults drops the room, so an untouched map does not keep a file.
    assert.equal(Elevation.setRoom(map, { height: 4 }), true);
    assert.equal('room' in map.reactor3d, false);
});

test('room heights are whole tiles inside the allowed range', () => {
    assert.equal(Elevation.clampRoomHeight('abc'), Elevation.ROOM_DEFAULT_HEIGHT);
    assert.equal(Elevation.clampRoomHeight(0), Elevation.ROOM_MIN_HEIGHT);
    assert.equal(Elevation.clampRoomHeight(999), Elevation.ROOM_MAX_HEIGHT);
    assert.equal(Elevation.clampRoomHeight(3.6), 4);
});

test('the 3D switch writes the note and lifts a downgraded sidecar', () => {
    const map = { id: 1, width: 2, height: 2, note: 'keep me', reactor3d: { version: 1, mode: '2d' } };
    assert.equal(Elevation.setMode3D(map, true), true);
    assert.match(map.note, /<3d>/);
    assert.match(map.note, /^keep me/);
    assert.equal(map.reactor3d.mode, '3d');
    assert.equal(Elevation.setMode3D(map, true), false);
    assert.equal(Elevation.setMode3D(map, false), true);
    assert.equal(map.note, 'keep me');
});

test('a sidecar holding only a room survives a save', () => {
    const writes = [];
    const fakeFs = {
        existsSync: () => false,
        unlinkSync: () => { throw new Error('should not delete'); },
        writeFileSync: (file, data) => writes.push({ file, data })
    };
    const map = { id: 2, width: 2, height: 2, note: '<3d>' };
    Elevation.setRoom(map, { height: 4, floor: 'Floor' });
    assert.equal(Elevation.save(fakeFs, path, '/project', map), true);
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0].data).room.floor, 'Floor');
});

test('the runtime builds the room from the sidecar with inward-facing walls', () => {
    const runtime = read('runtime/reactor_3d.js');
    assert.match(runtime, /Reactor3D\.roomFor = function\(mapData\)/);
    assert.match(runtime, /Reactor3D\.roomImageNames = function\(mapData\)/);
    assert.match(runtime, /this\.addRoom\(Reactor3D\.roomFor\(mapData\), loadParallax, tileSize, mapData\.width, mapData\.height\)/);
    assert.match(runtime, /side: THREE\.FrontSide/);
    assert.match(runtime, /texture\.wrapS = THREE\.RepeatWrapping/);
    // A late load must not lay a piece into a scene that was rebuilt since.
    assert.match(runtime, /this\._build = \(this\._build \|\| 0\) \+ 1;/);
    assert.match(runtime, /if \(this\._scene && this\._build === build\) \{\s*this\.addRoomPiece/);
    assert.equal(runtime.includes('Reactor3D.ROOM_MAX_HEIGHT = 512'), true);
    assert.equal(Elevation.ROOM_MAX_HEIGHT, 512);
});

test('the editor loads the room images and edits the switch in Map Properties', () => {
    const editor3d = read('editor/src/MapEditor3D.js');
    assert.match(editor3d, /Reactor3D\.roomImageNames\(mapData\)/);

    const controller = read('editor/src/ProjectController.js');
    assert.match(controller, /populateMap3DForm\(mapData\)/);
    assert.match(controller, /this\.noteWithout3D\(noteText\)/);
    assert.match(controller, /\/<3d>\/i\.test\(noteText\)/);
    assert.match(controller, /this\.saveMap3DSettings\(mapData, room, wants3D\)/g);
    assert.equal((controller.match(/this\.saveMap3DSettings\(mapData, room, wants3D\)/g) || []).length, 2);
    assert.match(controller, /this\.tilemapManager\?\.loadMapSidecar\?\.\(map\)/);
    // The room never reaches Map###.json.
    assert.doesNotMatch(controller, /mapData\.reactor3d\s*=/);

    const html = read('editor/index.html');
    for (const key of ['mapProps.threeD', 'mapProps.map3D', 'mapProps.roomHeight', 'mapProps.parallaxFloor',
        'mapProps.parallaxWalls', 'mapProps.parallaxCeiling', 'mapProps.roomHint', 'mapProps.choose']) {
        assert.equal(html.includes(`data-i18n="${key}"`), true, key);
    }
});

test('the map audio choice goes through the audio picker', () => {
    const controller = read('editor/src/ProjectController.js');
    assert.match(controller, /openMapAudioPicker\(type\)/);
    assert.match(controller, /bgm: this\.mapAudioChoice\(audio\.bgm, 100\)/);
    assert.match(controller, /bgs: this\.mapAudioChoice\(audio\.bgs, 80\)/);
    assert.doesNotMatch(controller, /playMapAudioPreview|map-bgm-select|populateAudioDropdown/);
});
