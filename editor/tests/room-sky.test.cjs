// A 3D map's sky: the room's own image, else a backdrop parallax (one not
// pinned to the ground), wrapped around the camera and drifting by scroll
// speeds; the editor's sidecar carries it, and a Map Properties save that
// touches the parallax redraws the 3D view without a restart.
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
const runtime = source3D();

function loadSky() {
    const slice = (from, to) => runtime.slice(runtime.indexOf(from), runtime.indexOf(to));
    const body = slice('Reactor3D.parallaxIsGround = function', '/**\n * Every parallax that is ground on this map')
        + slice('Reactor3D.clampRoomHeight = function', '/**\n * Build the room around');
    const Reactor3D = { ROOM_MIN_HEIGHT: 1, ROOM_MAX_HEIGHT: 512, ROOM_DEFAULT_HEIGHT: 4 };
    vm.runInNewContext(body, { Reactor3D });
    return Reactor3D;
}

test('the sky is the room\'s, else the backdrop parallax, never a ground parallax', () => {
    const R = loadSky();
    const map = (room, parallaxName, extra = {}) => ({ width: 10, height: 10, parallaxName, parallaxSx: 3, parallaxSy: -1, reactor3d: room ? { room } : undefined, ...extra });
    assert.deepEqual({ ...R.skyFor(map({ floor: '!Grass', sky: 'Sky-02', skyScrollX: 2, skyScrollY: 0 }, 'Sky-01')) }, { name: 'Sky-02', scrollX: 2, scrollY: 0 });
    assert.deepEqual({ ...R.skyFor(map({ floor: '!Grass' }, 'Sky-01')) }, { name: 'Sky-01', scrollX: 3, scrollY: -1 }, 'a backdrop parallax stands in');
    assert.equal(R.skyFor(map({ floor: '!Grass' }, '!Grass-01')), null, 'a pinned parallax is ground, not sky');
    assert.equal(R.skyFor(map(null, '')), null);
    // The loader learns the sky's name with the room's; a room with only a sky is still a room.
    assert.deepEqual([...R.roomImageNames(map({ sky: 'Sky-02' }, ''))], ['Sky-02']);
    assert.deepEqual([...R.roomImageNames(map({ floor: '!Grass' }, 'Sky-01'))], ['!Grass', 'Sky-01']);
    assert.equal(R.roomFor(map({ sky: 'Sky-02', skyScrollX: 99 }, '')).skyScrollX, 32, 'scroll clamps');
});

test('the editor sidecar carries the sky and drops an all-default room', () => {
    const source = read('editor/src/utils/MapElevation.js');
    const context = {}; context.window = context;
    vm.runInNewContext(source, context);
    const api = context.RRMapElevation;
    assert.ok(api && typeof api.setRoom === 'function', 'MapElevation exposes setRoom');
    const map = { width: 4, height: 4, reactor3d: { version: 1 } };
    assert.equal(api.setRoom(map, { height: 4, sky: 'Sky-01', skyScrollX: '2.6', skyScrollY: -40 }), true);
    assert.deepEqual({ ...map.reactor3d.room }, { height: 4, floor: '', walls: '', ceiling: '', sky: 'Sky-01', skyScrollX: 2.6, skyScrollY: -32 }, 'a fraction of a pixel a frame is kept, to a thousandth');
    assert.equal(api.setRoom(map, { height: 4, sky: 'Sky-01', skyScrollX: 0.12345 }), true);
    assert.equal(map.reactor3d.room.skyScrollX, 0.123);
    assert.equal(loadSky().roomFor({ reactor3d: { room: { sky: 'Sky-01', skyScrollX: '0.25' } } }).skyScrollX, 0.25, 'the game reads the same fraction');
    assert.equal(api.setRoom(map, { height: 4 }), true);
    assert.equal(map.reactor3d.room, undefined, 'all defaults: the room leaves the sidecar');
});

test('the dome follows the camera, drifts, and both frame loops tick it; a parallax save redraws the 3D view', () => {
    assert.match(runtime, /Reactor3D\.MapScene\.prototype\.addSky = function\(sky, load, tileSize\)/);
    assert.match(runtime, /this\.addSky\(Reactor3D\.skyFor\(mapData\), loadParallax, tileSize\);/);
    assert.match(runtime, /new THREE\.SphereGeometry\(radius, 48, 24\)/);
    assert.match(runtime, /map: texture, side: THREE\.BackSide, depthWrite: false, depthTest: false, fog: false/);
    assert.match(runtime, /mesh\.position\.copy\(camera\.position\);[\s\S]{0,600}if \(mesh\.matrixAutoUpdate === false\) mesh\.updateMatrix\(\);/, 'the frozen sky still follows the camera');
    // Behaviourally: a frozen sky mesh's world matrix follows the camera.
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    const Reactor3D = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const sky = new global.THREE.Mesh(new global.THREE.BufferGeometry(), new global.THREE.MeshBasicMaterial({ map: new global.THREE.Texture() }));
    new global.THREE.Scene().add(sky);
    sky.updateMatrix(); sky.matrixAutoUpdate = false;
    sky.userData.sky = { driftX: 0, driftY: 0, frame: null };
    scene._sky = sky;
    const camera = new global.THREE.PerspectiveCamera(); camera.position.set(120, 80, -200);
    scene.updateSky(camera, 1);
    const at = new global.THREE.Vector3().setFromMatrixPosition(sky.matrix);
    assert.ok(at.distanceTo(camera.position) < 1e-9, 'the matrix, not just the position, is at the camera');
    assert.match(read('runtime/reactor_sprites.js'), /state\.scene\.updateSky\(state\.viewport\.camera \? state\.viewport\.camera\(\) : null, Graphics\.frameCount\)/);
    assert.match(read('editor/src/MapEditor3D.js'), /this\.mapScene\.updateSky\?\.\(this\.camera, now \/ \(1000 \/ 60\)\);/);
    const controller = read('editor/src/ProjectController.js');
    assert.match(controller, /if \(roomChanged \|\| was3D !== wants3D \|\| parallaxChanged\) this\.refreshMap3DView\(\);/);
    assert.match(controller, /sky: value\('map-3d-sky-select'\),\s*skyScrollX: parseFloat\(value\('map-3d-sky-sx-input'\)\) \|\| 0/);
    const html = read('editor/index.html');
    assert.match(html, /id="map-3d-sky-sx-input" min="-32" max="32" step="0\.05"/, 'the field steps by a twentieth of a pixel');
    for (const id of ['map-3d-sky-select', 'map-3d-sky-browse-btn', 'map-3d-sky-sx-input', 'map-3d-sky-sy-input']) assert.ok(html.includes(`id="${id}"`), id);
    const manager = read('editor/src/I18nManager.js');
    for (const key of ['mapProps.parallaxSky', 'mapProps.skyScrollX', 'mapProps.skyScrollY', 'mapProps.pickSky']) assert.equal((manager.match(new RegExp(`'${key.replace('.', '\\.')}': `, 'g')) || []).length, 18, key);
});

test('the scrollbar corner stacks above the 3D view like the bars do', () => {
    const styles = read('editor/css/styles.css');
    const corner = styles.match(/\.custom-scrollbar-corner \{([^}]*)\}/);
    assert.ok(corner, 'corner rule');
    assert.match(corner[1], /z-index: 1000;/);
    const bars = styles.match(/\.custom-scrollbar \{([^}]*)\}/);
    assert.match(bars[1], /z-index: 1000;/);
});
