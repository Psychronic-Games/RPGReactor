// The 3D map view's pointer-to-tile path: the tile the pointer names is the one seen under it, at every
// zoom, and the outline is drawn on the surface the pointer met.
//
// The picks run for real: three.js, the mesh tree, the runtime's own height rules and MapEditor3D's
// methods on a view stood up with a camera aimed the way the editor aims it.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
global.Reactor3D = global.Reactor3D || R;
const Bvh = require(path.join(repoRoot, 'editor/src/utils/MeshBvh.js'));
const MapEditor3D = require(path.join(repoRoot, 'editor/src/MapEditor3D.js'));

const VIEW = { left: 420, top: 129, width: 1179, height: 870 };

/** A map of flat ground, with pieces and corner heights when given. */
function mapOf(width, height, pieces, terrainAt) {
    return mapUnder(width, height, pieces, terrainAt);
}
function mapUnder(width, height, pieces, terrainAt) {
    const sidecar = { version: 1, mode: '3d', elevation: new Array(width * height).fill(0) };
    if (pieces && pieces.length) sidecar.pieces = pieces;
    if (terrainAt) {
        sidecar.terrain = [];
        for (let z = 0; z <= height; z++) for (let x = 0; x <= width; x++) sidecar.terrain.push(terrainAt(x, z));
        sidecar.terrainWidth = width;
    }
    return { width, height, reactor3d: sidecar };
}

/** The map's ground as the scene lays it: one mesh, a vertex at every tile corner, lifted by the terrain. */
function groundMesh(map) {
    const position = [], index = [], stride = map.width + 1;
    for (let z = 0; z <= map.height; z++) for (let x = 0; x <= map.width; x++) position.push(x, R.terrainHeightAt(map, x, z), z);
    for (let z = 0; z < map.height; z++) for (let x = 0; x < map.width; x++) {
        const a = z * stride + x, b = a + 1, c = a + stride, d = c + 1;
        index.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position), 3));
    geometry.setIndex(index);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.userData.roomPiece = 'floor';
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** A box of the world (x0..x1, y0..y1, z0..z1) carrying the marks a laid mesh of that sort carries. */
function boxMesh(x0, y0, z0, x1, y1, z1, userData) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    Object.assign(mesh.userData, userData);
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** The sky as the scene lays it: a dome of the runtime's radius, seen from inside, standing around the camera. */
function skyMesh(camera) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(R.SKY_RADIUS, 48, 24), new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
    mesh.userData.roomPiece = 'sky';
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** A view on a map, its camera aimed as the editor aims it. */
function viewOf(map, meshes, aim) {
    const view = Object.create(MapEditor3D.prototype);
    view.camera = R.createCamera({ fov: 40 });
    view.camera.aspect = VIEW.width / VIEW.height;
    view.camera.updateProjectionMatrix();
    R.aimCamera(view.camera, aim.target, { yaw: aim.yaw || 0, pitch: aim.pitch === undefined ? 34 : aim.pitch, distance: aim.distance });
    view.canvas = { getBoundingClientRect: () => VIEW };
    view.mapScene = { _meshes: meshes.slice(), _doorGroup: null };
    view.currentMap = () => map;
    return view;
}

/** Where a world point is on the screen of a view. */
function screenOf(view, x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(view.camera);
    return [VIEW.left + (v.x + 1) / 2 * VIEW.width, VIEW.top + (1 - v.y) / 2 * VIEW.height];
}

/** The outline of a tile as `updateHoverCell` draws it, as four screen points. */
function outlineOf(view, tile) {
    view.hoverCell = new THREE.Line(new THREE.BufferGeometry().setAttribute('position',
        new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0]), 3)), new THREE.LineBasicMaterial());
    view.updateHoverCell(tile);
    assert.equal(view.hoverCell.visible, true);
    view.hoverCell.updateMatrixWorld(true);
    const position = view.hoverCell.geometry.attributes.position, corners = [];
    for (let i = 0; i < 4; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(view.hoverCell.matrixWorld);
        corners.push(screenOf(view, v.x, v.y, v.z));
    }
    return corners;
}

/** How far the pointer is from the middle of an outline, in the outline's own size on the screen. */
function gapOf(corners, px, py) {
    const cx = corners.reduce((sum, c) => sum + c[0], 0) / 4, cy = corners.reduce((sum, c) => sum + c[1], 0) / 4;
    const size = Math.max(Math.hypot(corners[2][0] - corners[0][0], corners[2][1] - corners[0][1]),
        Math.hypot(corners[3][0] - corners[1][0], corners[3][1] - corners[1][1])) / Math.SQRT2;
    return Math.hypot(cx - px, cy - py) / size;
}

test('ground farther from the eye than the sky dome is the ground, at the opening zoom of a 200x200 map', () => {
    const map = mapOf(200, 200);
    // The view a 200x200 map opens on: the middle of the map from 180 tiles away.
    const view = viewOf(map, [], { target: { x: 100, y: 0, z: 100 }, distance: 180 });
    view.mapScene._meshes = [groundMesh(map), skyMesh(view.camera)];
    let far = 0;
    for (const [tx, ty] of [[100, 100], [100, 40], [40, 60], [160, 20], [20, 150], [185, 110], [100, 5]]) {
        const [px, py] = screenOf(view, tx + 0.5, 0, ty + 0.5);
        if (px < VIEW.left || px > VIEW.left + VIEW.width || py < VIEW.top || py > VIEW.top + VIEW.height) continue;
        if (view.camera.position.distanceTo(new THREE.Vector3(tx + 0.5, 0, ty + 0.5)) > R.SKY_RADIUS) far++;
        const tile = view.tileAt(px, py);
        assert.ok(tile, `a tile under the pointer at ${tx},${ty}`);
        assert.deepEqual([tile.x, tile.y], [tx, ty], `the tile seen under the pointer (${tx},${ty})`);
        assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.5, `the outline is under the pointer at ${tx},${ty}`);
    }
    assert.ok(far >= 4, 'the check reaches past the dome');
    // The pivot of an orbit and the anchor of a zoom are read through the same pick.
    view._raycaster.setFromCamera(new THREE.Vector2(0, 0.3), view.camera);
    const hit = view.raycastMapMeshes();
    assert.equal(hit.object.userData.roomPiece, 'floor');
    assert.ok(hit.distance > R.SKY_RADIUS);
});

test('the sky alone is no tile', () => {
    const map = mapOf(60, 60);
    const view = viewOf(map, [], { target: { x: 30, y: 0, z: 20 }, distance: 30, pitch: 5 });
    view.mapScene._meshes = [groundMesh(map), skyMesh(view.camera)];
    assert.equal(view.tileAt(VIEW.left + VIEW.width / 2, VIEW.top + 20), null, 'over the horizon');
    assert.ok(view.tileAt(VIEW.left + VIEW.width / 2, VIEW.top + VIEW.height - 20), 'and the ground below it is still picked');
});

test('the pick list is one array kept between picks, without the sky, with the door leaves', () => {
    const map = mapOf(20, 20);
    const view = viewOf(map, [], { target: { x: 10, y: 0, z: 10 }, distance: 20 });
    const ground = groundMesh(map), sky = skyMesh(view.camera), leaf = boxMesh(4, 0, 4, 5, 2, 4.1, { rrDoor: true });
    view.mapScene._meshes = [ground, null, sky];
    view.mapScene._doorGroup = { children: [leaf] };
    view.tileAt(VIEW.left + 600, VIEW.top + 500);
    const list = view._pickMeshes;
    assert.deepEqual(list, [ground, leaf]);
    view.tileAt(VIEW.left + 500, VIEW.top + 400);
    assert.equal(view._pickMeshes, list, 'no new list per pointer move');
    assert.deepEqual(list, [ground, leaf]);
});

/** A four-cornered sheet of the world, as two triangles facing the way its corners turn, carrying a laid mesh's marks. */
function sheetMesh(corners, userData) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(corners.flat()), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    Object.assign(mesh.userData, userData);
    mesh.updateMatrixWorld(true);
    return mesh;
}

/** How high the house's roof stands over a world z: six up at its south eave (z 18), a tile higher every tile north. */
const roofAt = wz => 6 + (18 - wz);

/**
 * A house: a floor of slabs on 10..15 x 10..15, a wall along its south side, and a roof pitched at 45 degrees
 * over 9..16 x 9..17, as the plans lay one: a ramp a level higher on every row.
 */
function house() {
    const pieces = [];
    for (let y = 10; y <= 15; y++) for (let x = 10; x <= 15; x++) pieces.push({ kind: 'floor', x, y, z: 0, material: 'Wood' });
    for (let x = 10; x <= 15; x++) pieces.push({ kind: 'wall', x, y: 16, z: 0, material: 'Stone' });
    for (let y = 9; y <= 17; y++) for (let x = 9; x <= 16; x++) pieces.push({ kind: 'ramp', x, y, z: 6 + (17 - y), rot: 2, material: 'RoofTile' });
    const map = mapOf(40, 40, pieces);
    const top = R.PIECE_FLOOR_THICKNESS;
    assert.equal(R.groundHeightAt(map, 12.5, 12.5), top, 'the roof is not stood on: the floor under it is');
    assert.ok(Math.abs(R.pieceTop(pieces.find(p => p.kind === 'ramp' && p.y === 12), 0.5, 0.25) - roofAt(12.25)) < 1e-9, 'the roof\'s pieces lie where its mesh does');
    const roof = sheetMesh([[9, roofAt(18), 18], [17, roofAt(18), 18], [17, roofAt(9), 9], [9, roofAt(9), 9]], { pieces: true, pieceMaterial: 'RoofTile' });
    assert.ok(Math.abs(MapEditor3D.faceUp(roof, 0) - Math.SQRT1_2) < 1e-6, 'pitched at 45 degrees');
    const meshes = [groundMesh(map),
        boxMesh(10, 0, 10, 16, top, 16, { pieces: true, pieceMaterial: 'Wood' }),
        roof,
        boxMesh(10, 0, 16, 16, R.PIECE_STOREY, 17, { pieces: true, pieceMaterial: 'Stone' })];
    return { map, meshes, top };
}

test('a roof is looked through: the floor tile seen at the pointer is named, and outlined under the pointer', () => {
    const { map, meshes, top } = house();
    let through = 0;
    for (const aim of [{ distance: 60 }, { distance: 25 }, { distance: 25, yaw: 45 }, { distance: 25, pitch: 62 }, { distance: 40, yaw: 200, pitch: 50 }]) {
        const view = viewOf(map, meshes, Object.assign({ target: { x: 13, y: 0, z: 13 } }, aim));
        for (const [tx, ty] of [[11, 11], [13, 12], [14, 11]]) {
            const [px, py] = screenOf(view, tx + 0.5, top, ty + 0.5);
            view._raycaster = new THREE.Raycaster();
            view._raycaster.setFromCamera(new THREE.Vector2(((px - VIEW.left) / VIEW.width) * 2 - 1, -((py - VIEW.top) / VIEW.height) * 2 + 1), view.camera);
            // The roof, or the wall under it, is what the ray meets first (from a low corner the floor shows under the eave).
            if (view.raycastMapMeshes().object.userData.pieceMaterial !== 'Wood') through++;
            const tile = view.tileAt(px, py);
            assert.deepEqual([tile.x, tile.y], [tx, ty], `the floor tile under the pointer (${JSON.stringify(aim)})`);
            assert.ok(Math.abs(tile.lift - top) < 1e-3, 'met at the floor slab\'s top');
            assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.5, 'outlined under the pointer');
            // An event placed there stands where the pointer is.
            const stand = R.groundHeightAt(map, tile.x + 0.5, tile.y + 0.5);
            const [ex, ey] = screenOf(view, tile.x + 0.5, stand, tile.y + 0.5);
            assert.ok(Math.hypot(ex - px, ey - py) < 1, 'an event placed on it stands under the pointer');
        }
    }
    assert.ok(through >= 10, `most of these picks were through the roof (${through} of 15)`);
});

test('a roof seen too flat to show the floor under it names the tile beneath the point, marked at the pointer', () => {
    const { map, meshes } = house();
    // From the south, over the roof and nearly level: past the roof's far edge the ray is in the open, high up.
    const view = viewOf(map, meshes, { target: { x: 12, y: 13, z: 10 }, distance: 30, pitch: 8 });
    const [px, py] = screenOf(view, 12.5, roofAt(10.5), 10.5);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [12, 10], 'the tile under the roof where the pointer is, not one far behind the house');
    assert.ok(Math.abs(tile.lift - roofAt(10.5)) < 0.05, 'marked on the roof');
    assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.75, 'under the pointer');
});

test('a wall in the way is looked through to what stands behind it', () => {
    const { map, meshes, top } = house();
    // From the south, low: the wall on row 16 hides the floor's southern rows.
    const view = viewOf(map, meshes, { target: { x: 13, y: 0, z: 13 }, distance: 30, pitch: 20 });
    const [px, py] = screenOf(view, 12.5, top, 15.5);
    view._raycaster = new THREE.Raycaster();
    view._raycaster.setFromCamera(new THREE.Vector2(((px - VIEW.left) / VIEW.width) * 2 - 1, -((py - VIEW.top) / VIEW.height) * 2 + 1), view.camera);
    assert.equal(view.raycastMapMeshes().object.userData.pieceMaterial, 'Stone', 'the wall is what the ray meets first');
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [12, 15]);
    assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.5);
});

test('on a slope the outline lies on the ground under the pointer', () => {
    const map = mapOf(60, 60, null, (x, z) => Math.max(0, 30 - z) * 0.6 + Math.sin(x / 3) * 0.8);
    const meshes = [groundMesh(map)];
    for (const aim of [{ distance: 70 }, { distance: 20 }, { distance: 20, yaw: 90, pitch: 50 }]) {
        const view = viewOf(map, meshes, Object.assign({ target: { x: 30, y: R.terrainHeightAt(map, 30.5, 22.5), z: 22 } }, aim));
        for (const [fx, fy] of [[0.3, 0.3], [0.5, 0.45], [0.7, 0.62], [0.42, 0.8]]) {
            const px = VIEW.left + VIEW.width * fx, py = VIEW.top + VIEW.height * fy;
            const tile = view.tileAt(px, py);
            assert.ok(tile, 'the slope is picked');
            assert.ok(Math.abs(tile.lift) < 0.05, 'the ground itself: nothing to lift the outline by');
            assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.75, `under the pointer on the slope (${JSON.stringify(aim)} ${fx},${fy})`);
        }
    }
});

test('the outline is drawn on the surface that was picked', () => {
    const map = mapOf(12, 12, null, (x, z) => x * 0.25);
    const view = viewOf(map, [groundMesh(map)], { target: { x: 6, y: 0, z: 6 }, distance: 20 });
    const heights = tile => {
        outlineOf(view, tile);
        const position = view.hoverCell.geometry.attributes.position;
        return [0, 1, 2, 3].map(i => Math.round(position.getY(i) * 1000) / 1000);
    };
    assert.deepEqual(heights({ x: 4, y: 5 }), [1, 1.25, 1.25, 1], 'a tile given without a pick lies on its ground, corner by corner');
    assert.deepEqual(heights({ x: 4, y: 5, lift: 0.4 }), [1.4, 1.65, 1.65, 1.4], 'a pick 0.4 over its ground is drawn 0.4 up, still following the slope');
    view.updateHoverCell(null);
    assert.equal(view.hoverCell.visible, false);
});

test('the side of something stood on, with no floor behind it, is its own cell, marked at the pointer', () => {
    // A terrace two blocks high on 20..25 x 20..25, seen from the south: its face has only itself behind it.
    const pieces = [];
    for (let y = 20; y <= 25; y++) for (let x = 20; x <= 25; x++) for (const z of [0, 1]) pieces.push({ kind: 'block', x, y, z, material: 'Stone' });
    const map = mapOf(40, 40, pieces);
    assert.equal(R.groundHeightAt(map, 22.5, 25.5), 2, 'the terrace is stood on at its top');
    const meshes = [groundMesh(map), boxMesh(20, 0, 20, 26, 2, 26, { pieces: true, pieceMaterial: 'Stone' })];
    const view = viewOf(map, meshes, { target: { x: 22, y: 0, z: 25 }, distance: 20, pitch: 20 });
    const [px, py] = screenOf(view, 22.5, 1, 26);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [22, 25], 'the cell behind the face');
    assert.ok(Math.abs(tile.lift - 1) < 0.01, 'at the height the pointer met the face');
    assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.75);
    // Its top is picked as its top.
    const [qx, qy] = screenOf(view, 23.5, 2, 23.5);
    const top = view.tileAt(qx, qy);
    assert.deepEqual([top.x, top.y, Math.round(top.lift * 100) / 100], [23, 23, 2]);
});

test('a room\'s wall or ceiling is no tile; its floor is', () => {
    const map = mapOf(20, 20);
    // The north wall of a room ten high, facing into the room.
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
    wall.position.set(10, 5, 0);
    wall.userData.roomPiece = 'walls';
    wall.updateMatrixWorld(true);
    const view = viewOf(map, [groundMesh(map), wall], { target: { x: 10, y: 0, z: 8 }, distance: 18, pitch: 15 });
    const [px, py] = screenOf(view, 10.5, 6, 0);
    assert.equal(view.tileAt(px, py), null, 'the wall');
    const [fx, fy] = screenOf(view, 10.5, 0, 4.5);
    assert.deepEqual([view.tileAt(fx, fy).x, view.tileAt(fx, fy).y], [10, 4], 'the floor');
});

test('tile art that stands up still names the cell it stands on, outlined on the ground', () => {
    const map = mapOf(20, 20);
    // A stood-up tile: a quad two high over the middle of row 8, with no piece mark on it.
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    art.position.set(6.5, 1, 8.5);
    art.updateMatrixWorld(true);
    const view = viewOf(map, [groundMesh(map), art], { target: { x: 6, y: 0, z: 8 }, distance: 14 });
    const [px, py] = screenOf(view, 6.5, 1.5, 8.5);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y, tile.lift], [6, 8, 0]);
});

test('the quadrant tools still get the point inside the tile', () => {
    const map = mapOf(20, 20);
    const view = viewOf(map, [groundMesh(map)], { target: { x: 10, y: 0, z: 10 }, distance: 14 });
    const [px, py] = screenOf(view, 7.25, 0, 9.75);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [7, 9]);
    assert.ok(Math.abs(tile.localX - 12) < 0.5 && Math.abs(tile.localY - 36) < 0.5, `a quarter in, three quarters down (got ${tile.localX}, ${tile.localY})`);
});

test('a tile pick leaves the pointer\'s ray as it was, for what reads it next', () => {
    const { map, meshes, top } = house();
    const view = viewOf(map, meshes, { target: { x: 13, y: 0, z: 13 }, distance: 25 });
    const [px, py] = screenOf(view, 12.5, top, 12.5);
    view.tileAt(px, py);
    const ray = view._raycaster.ray, origin = ray.origin.clone(), direction = ray.direction.clone();
    view._raycaster.setFromCamera(new THREE.Vector2(((px - VIEW.left) / VIEW.width) * 2 - 1, -((py - VIEW.top) / VIEW.height) * 2 + 1), view.camera);
    assert.ok(origin.distanceTo(view._raycaster.ray.origin) < 1e-9 && direction.distanceTo(view._raycaster.ray.direction) < 1e-9);
});

test('standCrossing: a step is the step, a wall is passed through, the ground ends the ray', () => {
    const fall = Math.tan(30 * Math.PI / 180);
    const down = new THREE.Vector3(0, -fall, -1).normalize();
    const from = (x, y, z) => new THREE.Vector3(x, y, z);
    const cell = c => [Math.floor(c.x), Math.floor(c.z)];
    // Every case is walked under a roof ten up along the ray's column: the walk is for the floor under cover.
    const roof = [];
    for (let y = 0; y < 20; y++) roof.push({ kind: 'floor', x: 5, y, z: 10, material: 'RoofTile' });
    const mapOf = (w, h, pieces) => mapUnder(w, h, (pieces || []).concat(roof));
    // A path slab on row 10: the ray comes down onto it from the south.
    const path = mapOf(20, 20, [{ kind: 'floor', x: 5, y: 10, z: 0, material: 'Cobble' }]);
    let c = MapEditor3D.standCrossing(path, from(5.5, 2, 13.9), down, 0);
    assert.deepEqual(cell(c), [5, 10], 'the slab, met from above');
    assert.ok(Math.abs(c.y - R.PIECE_FLOOR_THICKNESS) < 1e-3, 'at its top');
    // The same slab met at its edge, under its top: a riser a step high is the step, at the point the ray is at.
    c = MapEditor3D.standCrossing(path, from(5.5, 0.05 + fall * 2, 13), down, 0);
    assert.deepEqual(cell(c), [5, 10], 'the slab, met at its riser');
    assert.ok(Math.abs(c.y - 0.05) < 1e-3, 'a point of the ray, so the outline drawn through it is under the pointer');
    // A wall a storey high on row 10: the ray enters its side and comes down on the ground behind.
    const walled = mapOf(20, 20, [{ kind: 'wall', x: 5, y: 10, z: 0, material: 'Stone' }]);
    assert.ok(R.PIECE_STOREY > 2);
    c = MapEditor3D.standCrossing(walled, from(5.5, 1.5 + fall * 2, 13), down, 0);
    assert.deepEqual(cell(c), [5, 8], 'the ground past the wall');
    assert.ok(Math.abs(c.y) < 1e-3);
    // The surface walked is where an event placed there stands, by the game's own height rule: a wall's cell
    // is the wall's top, so a ray that comes down over the wall onto it has found where the event would be.
    assert.equal(MapEditor3D.standAt(walled, 5.5, 10.5), R.groundHeightAt(walled, 5.5, 10.5));
    assert.equal(MapEditor3D.standAt(walled, 5.5, 10.5), R.PIECE_STOREY, 'the wall\'s cell is its top');
    assert.equal(MapEditor3D.standAt(walled, 5.5, 9.5), 0);
    c = MapEditor3D.standCrossing(walled, from(5.5, R.PIECE_STOREY + fall * 2.5, 13), down, 0);
    assert.deepEqual(cell(c), [5, 10], 'the wall, come down onto from above');
    assert.ok(Math.abs(c.y - R.PIECE_STOREY) < 1e-3, 'at its top');
    // Into the side of something low (a fence, a tile high) and on into the ground inside its cell: nothing
    // is met, and the cell behind it is not taken for a step on the way down.
    const fenced = mapOf(20, 20, [{ kind: 'fence', x: 5, y: 10, z: 0, material: 'Wood' }]);
    assert.equal(R.groundHeightAt(fenced, 5.5, 10.5), 1);
    assert.equal(MapEditor3D.standCrossing(fenced, from(5.5, fall * 2.5, 13), down, 0), null, 'the ray is under the ground when it leaves the fence\'s cell');
    // A wall with a floor behind it, the ray leaving the wall just under that floor's top: the floor.
    const room = mapOf(20, 20, [{ kind: 'wall', x: 5, y: 10, z: 0, material: 'Stone' }, { kind: 'floor', x: 5, y: 9, z: 0, material: 'Wood' }]);
    c = MapEditor3D.standCrossing(room, from(5.5, 0.04 + fall * 3, 13), down, 0);
    assert.deepEqual(cell(c), [5, 9], 'the floor cell behind the foot of the wall');
    // Solid all the way (blocks three deep): the ray goes under the ground inside it and meets nothing.
    const solid = mapOf(20, 20, [8, 9, 10].flatMap(y => [0, 1, 2].map(z => ({ kind: 'block', x: 5, y, z, material: 'Stone' }))));
    assert.equal(MapEditor3D.standAt(solid, 5.5, 9.5), 3, 'blocks are stood on');
    assert.equal(MapEditor3D.standCrossing(solid, from(5.5, 1 + fall * 2, 13), down, 0), null);
    // Straight down, and out over the map's edge.
    c = MapEditor3D.standCrossing(path, from(5.5, 9, 10.5), new THREE.Vector3(0, -1, 0), 0);
    assert.deepEqual([c.x, c.z, Math.round(c.y * 100) / 100], [5.5, 10.5, R.PIECE_FLOOR_THICKNESS]);
    c = MapEditor3D.standCrossing(walled, from(5.5, 9, 10.5), new THREE.Vector3(0, -1, 0), 0);
    assert.deepEqual([c.x, c.z, c.y], [5.5, 10.5, R.PIECE_STOREY], 'straight down onto a wall: its top');
    assert.equal(MapEditor3D.standCrossing(path, from(5.5, 8, 3), new THREE.Vector3(0, -0.05, -1).normalize(), 0), null, 'off the map before it comes down');
    // Out from under the roof, still high over the ground: what it would come down on is somewhere else on the map.
    const eave = mapUnder(20, 20, [10, 11, 12, 13].map(y => ({ kind: 'floor', x: 5, y, z: 10, material: 'RoofTile' })));
    assert.equal(MapEditor3D.standCrossing(eave, from(5.5, 9, 13.9), down, 0), null, 'the ray leaves the roof\'s cover seven up');
    assert.equal(MapEditor3D.coveredAt(eave, 5.5, 9, 12.5), true);
    assert.equal(MapEditor3D.coveredAt(eave, 5.5, 9, 9.5), false);
    assert.equal(MapEditor3D.coveredAt(eave, 5.5, 11, 12.5), false, 'over the roof is not under it');
    // The crossing is looked for only past `from`.
    c = MapEditor3D.standCrossing(mapOf(20, 20), from(5.5, 4, 18), down, 0);
    const reach = Math.hypot(c.x - 5.5, c.y - 4, c.z - 18);
    assert.equal(MapEditor3D.standCrossing(mapOf(20, 20), from(5.5, 4, 18), down, reach + 3), null);
});

test('a roof with nothing to stand on behind it is the cell under the point met, marked at the pointer', () => {
    // A slab five up at the map's north edge, seen from the south at a flat angle: the ray leaves the map past it.
    const map = mapOf(30, 30);
    const meshes = [groundMesh(map), boxMesh(10, 5, 0, 20, 5.3, 3, { pieces: true, pieceMaterial: 'RoofTile' })];
    const view = viewOf(map, meshes, { target: { x: 15, y: 5, z: 1 }, distance: 20, pitch: 4 });
    const [px, py] = screenOf(view, 15.5, 5.15, 3);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [15, 2]);
    assert.ok(Math.abs(tile.lift - 5.15) < 0.02);
    assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.75, 'the outline is where the pointer is');
});

test('the ground showing in a cell that holds a fence is still that cell', () => {
    const map = mapOf(20, 20, [{ kind: 'fence', x: 8, y: 8, z: 0, material: 'Wood' }]);
    assert.ok(R.groundHeightAt(map, 8.5, 8.5) > 0.5, 'the height rules read the cell as the fence\'s top');
    const view = viewOf(map, [groundMesh(map)], { target: { x: 8, y: 0, z: 8 }, distance: 14 });
    const [px, py] = screenOf(view, 8.3, 0, 8.7);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y, Math.round(tile.lift * 100) / 100], [8, 8, 0]);
});

test('a pointer move over a 200x200 map stays cheap: the walk under a roof is bounded', () => {
    // A roof along the whole diagonal of the map at a flat angle is the longest walk there is.
    const pieces = [];
    for (let i = 0; i < 200; i++) for (const y of [199 - i, 198 - i, 200 - i]) if (y >= 0 && y < 200) pieces.push({ kind: 'floor', x: i, y, z: 35, material: 'RoofTile' });
    const map = mapOf(200, 200, pieces);
    let reads = 0;
    const real = R.groundHeightAt;
    R.groundHeightAt = function() { reads++; return real.apply(this, arguments); };
    try {
        const crossing = MapEditor3D.standCrossing(map, new THREE.Vector3(0.5, 30, 199.5), new THREE.Vector3(1, -0.2, -1).normalize(), 0);
        assert.ok(crossing, 'the far ground is met');
        assert.ok(Math.hypot(crossing.x - 0.5, crossing.z - 199.5) > 200, 'two hundred tiles on');
        assert.ok(reads < 4 * 400 + 40, `the surface is read a few times per cell crossed (${reads} reads)`);
    } finally { R.groundHeightAt = real; }
});

/** The ray of a view through a screen point, and the first laid thing it meets. */
function firstHit(view, px, py) {
    view._raycaster = new THREE.Raycaster();
    view._raycaster.setFromCamera(new THREE.Vector2(((px - VIEW.left) / VIEW.width) * 2 - 1, -((py - VIEW.top) / VIEW.height) * 2 + 1), view.camera);
    return view.raycastMapMeshes();
}

test('a deck, a bridge and an upper floor seen directly are their own cells, whatever the angle of the view', () => {
    const top = R.PIECE_FLOOR_THICKNESS, storey = R.PIECE_STOREY;
    // A bridge deck three over flat ground, three wide and twelve long, open to the sky.
    const deck = [];
    for (let y = 14; y <= 16; y++) for (let x = 10; x <= 21; x++) deck.push({ kind: 'floor', x, y, z: 3, material: 'Wood' });
    const bridge = mapOf(40, 40, deck);
    assert.equal(R.groundHeightAt(bridge, 15.5, 15.5), 0, 'from the ground up the deck\'s cell is the ground under it');
    const bridgeMeshes = [groundMesh(bridge), boxMesh(10, 3, 14, 22, 3 + top, 17, { pieces: true, pieceMaterial: 'Wood' })];
    for (const pitch of [20, 34, 50, 62, 80]) for (const yaw of [0, 70, 200]) {
        const view = viewOf(bridge, bridgeMeshes, { target: { x: 16, y: 3, z: 15 }, distance: 24, pitch, yaw });
        for (const [tx, ty] of [[12, 14], [15, 15], [18, 16]]) {
            const [px, py] = screenOf(view, tx + 0.5, 3 + top, ty + 0.5);
            assert.equal(firstHit(view, px, py).object.userData.pieceMaterial, 'Wood', 'the deck is what the pointer is on');
            const tile = view.tileAt(px, py);
            assert.deepEqual([tile.x, tile.y], [tx, ty], `the deck's cell under the pointer (pitch ${pitch}, yaw ${yaw})`);
            assert.ok(Math.abs(tile.lift - (3 + top)) < 1e-3, 'met at the deck\'s top');
            assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.5, 'outlined on the deck, under the pointer');
        }
    }
    // A house of two floors with no roof on it yet: the upper floor is pointed at.
    const floors = [];
    for (let y = 10; y <= 21; y++) for (let x = 10; x <= 21; x++) for (const z of [0, storey]) floors.push({ kind: 'floor', x, y, z, material: 'Wood' });
    const twoFloors = mapOf(40, 40, floors);
    const floorMeshes = [groundMesh(twoFloors), boxMesh(10, 0, 10, 22, top, 22, { pieces: true, pieceMaterial: 'Wood' }), boxMesh(10, storey, 10, 22, storey + top, 22, { pieces: true, pieceMaterial: 'Wood' })];
    for (const pitch of [34, 50, 62]) {
        const view = viewOf(twoFloors, floorMeshes, { target: { x: 16, y: storey, z: 16 }, distance: 30, pitch });
        for (const [tx, ty] of [[12, 12], [16, 14], [16, 18], [19, 20]]) {
            const [px, py] = screenOf(view, tx + 0.5, storey + top, ty + 0.5);
            const tile = view.tileAt(px, py);
            assert.deepEqual([tile.x, tile.y, Math.round(tile.lift * 100) / 100], [tx, ty, storey + top], `the upper floor's cell under the pointer (pitch ${pitch})`);
        }
    }
});

test('a level roof is a top somebody can be stood on and names its own cell; a pitched one is looked through', () => {
    const top = R.PIECE_FLOOR_THICKNESS;
    const pieces = [];
    for (let y = 10; y <= 15; y++) for (let x = 10; x <= 15; x++) { pieces.push({ kind: 'floor', x, y, z: 0, material: 'Wood' }); pieces.push({ kind: 'floor', x, y, z: 6, material: 'RoofTile' }); }
    const map = mapOf(40, 40, pieces);
    const meshes = [groundMesh(map), boxMesh(10, 0, 10, 16, top, 16, { pieces: true, pieceMaterial: 'Wood' }), boxMesh(10, 6, 10, 16, 6 + top, 16, { pieces: true, pieceMaterial: 'RoofTile' })];
    const view = viewOf(map, meshes, { target: { x: 13, y: 6, z: 13 }, distance: 25 });
    const [px, py] = screenOf(view, 12.5, 6 + top, 13.5);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y, Math.round(tile.lift * 100) / 100], [12, 13, 6 + top]);
    // Looking up at the same slab from under it is not coming down onto a top: nothing to stand on is seen there.
    assert.ok(Math.abs(MapEditor3D.faceUp(meshes[2], 0)) <= 1);
    const flat = new THREE.Vector3(0, 1, 0), pitched = sheetMesh([[0, 0, 1], [1, 0, 1], [1, 1, 0], [0, 1, 0]], {});
    assert.ok(Math.abs(MapEditor3D.faceUp(pitched, 1) - Math.SQRT1_2) < 1e-6 && MapEditor3D.faceUp(pitched, 0) < MapEditor3D.LEVEL_TOP, 'a 45 degree pitch is no level top');
    assert.equal(MapEditor3D.faceUp(sheetMesh([[0, 2, 1], [1, 2, 1], [1, 2, 0], [0, 2, 0]], {}), 0), flat.y);
    assert.equal(MapEditor3D.faceUp(pitched, undefined), 0, 'a hit that names no triangle is no top');
});

test('the top of a wall under the eaves, come down onto through the roof, is where an event placed there stands', () => {
    const { map, meshes } = house();
    // From the south and steeply: over the wall, through the roof, down onto the wall's top.
    const view = viewOf(map, meshes, { target: { x: 13, y: 0, z: 13 }, distance: 25, pitch: 62 });
    const [px, py] = screenOf(view, 13.5, R.PIECE_STOREY, 16.4);
    assert.equal(firstHit(view, px, py).object.userData.pieceMaterial, 'RoofTile');
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [13, 16]);
    assert.ok(Math.abs(tile.lift - R.PIECE_STOREY) < 0.01, 'at the wall\'s top');
    assert.equal(R.groundHeightAt(map, 13.5, 16.5), R.PIECE_STOREY, 'which is where the event is drawn');
});

test('a tile named through a roof is outlined where an event placed on it stands, in a wall\'s cell too', () => {
    const { map, meshes } = house();
    let through = 0, walls = 0;
    // From every side, over a grid of the view: whatever the roof hides, the pick is either the roof
    // at the pointer (no floor in sight) or a surface the event will be drawn on.
    for (const aim of [{ yaw: 0, pitch: 34 }, { yaw: 0, pitch: 62 }, { yaw: 180, pitch: 52 }, { yaw: 180, pitch: 70 }, { yaw: 90, pitch: 40 }, { yaw: 250, pitch: 58 }]) {
        const view = viewOf(map, meshes, Object.assign({ target: { x: 13, y: 3, z: 13 }, distance: 26 }, aim));
        for (let fy = 0.2; fy <= 0.8; fy += 0.03) for (let fx = 0.3; fx <= 0.7; fx += 0.03) {
            const px = VIEW.left + VIEW.width * fx, py = VIEW.top + VIEW.height * fy;
            const hit = firstHit(view, px, py);
            if (!hit || hit.object.userData.pieceMaterial !== 'RoofTile') continue;
            const tile = view.tileAt(px, py);
            assert.ok(tile);
            const middleX = tile.x + 0.5, middleZ = tile.y + 0.5;
            const shown = MapEditor3D.groundAt(map, middleX, middleZ) + tile.lift, stands = R.groundHeightAt(map, middleX, middleZ);
            const onRoof = Math.abs(shown - hit.point.y) < 0.02;
            if (!onRoof) through++;
            if (tile.y === 16 && tile.x >= 10 && tile.x <= 15) walls++;
            // Within a step: a riser met just under its top is that step.
            assert.ok(onRoof || Math.abs(shown - stands) <= MapEditor3D.STAND_REACH + 1e-6,
                `tile ${tile.x},${tile.y} is outlined at ${shown.toFixed(2)}; an event placed there stands at ${stands.toFixed(2)} (${JSON.stringify(aim)})`);
        }
    }
    assert.ok(through > 100, `the sweep looked through the roof (${through} picks)`);
    assert.ok(walls > 0, 'and reached the wall\'s cells');
});

test('the side of a raised cell is that cell, marked at the pointer', () => {
    // A block of cells raised three (tile elevation), drawn by sheets that carry no piece marks.
    const map = mapOf(50, 50);
    for (let y = 20; y <= 25; y++) for (let x = 30; x <= 35; x++) map.reactor3d.elevation[y * 50 + x] = 3;
    const ground = groundMesh(map);
    delete ground.userData.roomPiece;
    const meshes = [ground, boxMesh(30, 0, 20, 36, 3, 26, {})];
    const view = viewOf(map, meshes, { target: { x: 32, y: 1, z: 25 }, distance: 16, pitch: 30 });
    for (const up of [0.3, 1.5, 2.3, 2.7]) {
        const [px, py] = screenOf(view, 32.5, up, 26);
        const tile = view.tileAt(px, py);
        assert.deepEqual([tile.x, tile.y], [32, 25], `the raised cell whose side it is (${up} up the face)`);
        assert.ok(Math.abs(tile.lift - (up - 3)) < 0.02, 'at the height the pointer met the face');
        assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.75, `the outline is where the pointer is (${up} up the face)`);
    }
    // Its top and the ground at its foot are themselves, on their own ground.
    const [tx, ty] = screenOf(view, 32.5, 3, 22.5);
    assert.deepEqual([view.tileAt(tx, ty).x, view.tileAt(tx, ty).y, view.tileAt(tx, ty).lift], [32, 22, 0]);
    const [gx, gy] = screenOf(view, 32.5, 0, 27.5);
    assert.deepEqual([view.tileAt(gx, gy).x, view.tileAt(gx, gy).y, view.tileAt(gx, gy).lift], [32, 27, 0]);
});

test('water is its surface: the tile the sheet lies over where the pointer is on it', () => {
    // A lake in a bowl twelve deep, its surface one under the land around it.
    const bowl = (x, z) => -12 * Math.max(0, 1 - Math.hypot(x - 30, z - 30) / 14);
    const map = mapOf(60, 60, null, bowl);
    map.reactor3d.water = [{ x0: 14, y0: 14, x1: 46, y1: 46, level: -1 }];
    assert.equal(R.waterSurfaceAt(map, 30.5, 24.5), -1);
    const meshes = [groundMesh(map)];
    for (const aim of [{ distance: 70 }, { distance: 30 }, { distance: 30, yaw: 120, pitch: 20 }]) {
        const view = viewOf(map, meshes, Object.assign({ target: { x: 30, y: -1, z: 28 } }, aim));
        for (const [tx, ty] of [[30, 24], [26, 31], [34, 33]]) {
            const [px, py] = screenOf(view, tx + 0.5, -1, ty + 0.5);
            const bed = firstHit(view, px, py);
            assert.ok(Math.hypot(bed.point.x - tx - 0.5, bed.point.z - ty - 0.5) > 1.5, 'the bed under the pointer is tiles away from the place on the water');
            const tile = view.tileAt(px, py);
            assert.deepEqual([tile.x, tile.y], [tx, ty], `the tile under the water's surface at the pointer (${JSON.stringify(aim)})`);
            assert.equal(tile.level, -1, 'the surface\'s height');
            assert.ok(gapOf(outlineOf(view, tile), px, py) < 0.5, 'outlined under the pointer');
            const corners = view.hoverCell.geometry.attributes.position;
            assert.deepEqual([0, 1, 2, 3].map(i => corners.getY(i)), [-1, -1, -1, -1], 'the outline lies flat on the water, not along the bed under it');
        }
        // Dry land beside the lake, inside the sheet's box, is the land.
        const [lx, ly] = screenOf(view, 16.5, bowl(16.5, 16.5), 16.5);
        const land = view.tileAt(lx, ly);
        assert.deepEqual([land.x, land.y, land.level], [16, 16, undefined]);
        assert.ok(Math.abs(land.lift) < 0.05);
    }
    // A jetty over the water is the jetty.
    const jetty = [];
    for (let x = 26; x <= 34; x++) jetty.push({ kind: 'floor', x, y: 30, z: 12, material: 'Wood' });
    const decked = mapOf(60, 60, jetty, bowl);
    decked.reactor3d.water = map.reactor3d.water;
    const view = viewOf(decked, [groundMesh(decked), boxMesh(26, 0, 30, 35, 0.1, 31, { pieces: true, pieceMaterial: 'Wood' })], { target: { x: 30, y: 0, z: 30 }, distance: 30 });
    const [jx, jy] = screenOf(view, 30.5, 0.1, 30.5);
    const on = view.tileAt(jx, jy);
    assert.deepEqual([on.x, on.y], [30, 30]);
    assert.ok(Math.abs(MapEditor3D.groundAt(decked, 30.5, 30.5) + on.lift - 0.1) < 0.02, 'over the water, not on it');
});

/** A view that can be turned and zoomed: the camera aimed from its `view`, the sky standing around the eye as the scene keeps it. */
function cameraView(map, view) {
    const ed = Object.create(MapEditor3D.prototype);
    ed.camera = R.createCamera({ fov: 40 });
    ed.camera.aspect = VIEW.width / VIEW.height;
    ed.camera.updateProjectionMatrix();
    ed.view = JSON.parse(JSON.stringify(view));
    ed.requestRender = ed.faceCamera = ed.updateLabelVisibility = ed.updateZoomReadout = () => {};
    ed.canvas = { getBoundingClientRect: () => VIEW };
    ed.currentMap = () => map;
    ed.applyCamera();
    const dome = skyMesh(ed.camera);
    ed.mapScene = { _meshes: [groundMesh(map), dome], _doorGroup: null };
    const apply = ed.applyCamera.bind(ed);
    ed.applyCamera = () => { apply(); dome.position.copy(ed.camera.position); dome.updateMatrixWorld(true); };
    return ed;
}

test('a press with the middle of the view on the sky or past the border leaves the eye where it is', () => {
    const map = mapOf(200, 200);
    // The map as it opens, a press, the eye turned toward the horizon (Alt+drag down), the next press.
    const ed = cameraView(map, { target: { x: 100, y: 0, z: 100 }, distance: 180, yaw: 0, pitch: 34 });
    ed.seatPivot();
    for (let i = 0; i < 8; i++) ed.look(0, 10);
    assert.ok(ed.view.pitch < 12, 'looking nearly level');
    ed._raycaster.setFromCamera(new THREE.Vector2(0, 0), ed.camera);
    assert.equal(ed.raycastMapMeshes(), null, 'the middle of the view meets nothing laid');
    const eye = ed.camera.position.clone();
    assert.equal(ed.seatPivot(), true);
    assert.ok(ed.camera.position.distanceTo(eye) < 1e-6, `the eye stays (it moved ${ed.camera.position.distanceTo(eye).toFixed(2)} tiles)`);
    assert.ok(ed.view.distance <= MapEditor3D.OPEN_REACH + 1e-6, 'the point turned about is in reach');
    // Whatever the view: at the sky, low over the border, from a height over the border.
    for (const view of [{ target: { x: 100, y: 40, z: 60 }, distance: 40, yaw: 0, pitch: -20 }, { target: { x: 100, y: 6, z: -120 }, distance: 140, yaw: 0, pitch: 1.5 },
        { target: { x: 100, y: 2, z: -30 }, distance: 60, yaw: 0, pitch: 3 }, { target: { x: 100, y: 0, z: -60 }, distance: 120, yaw: 40, pitch: 12 }]) {
        const other = cameraView(map, view), from = other.camera.position.clone();
        other.seatPivot();
        assert.ok(other.camera.position.distanceTo(from) < 1e-6, `the eye stays (${JSON.stringify(view)})`);
        assert.ok(other.view.distance <= MapEditor3D.OPEN_REACH + 1e-6);
    }
    assert.equal(MapEditor3D.OPEN_REACH, R.SKY_RADIUS);
});

test('a wheel notch with the pointer past the border moves the eye no farther than one toward the sky did', () => {
    const map = mapOf(200, 200);
    for (const view of [{ target: { x: 100, y: 0, z: 100 }, distance: 180, yaw: 0, pitch: 10 }, { target: { x: 100, y: 0, z: 100 }, distance: 290, yaw: 0, pitch: 34 }]) {
        for (const fy of [0.3, 0.2, 0.12, 0.08, 0.02]) {
            const ed = cameraView(map, view), eye = ed.camera.position.clone();
            const px = VIEW.left + VIEW.width / 2, py = VIEW.top + VIEW.height * fy;
            const anchor = ed.zoomAnchor(px, py);
            assert.ok(anchor, 'there is always a point to zoom about');
            if (!firstHit(ed, px, py)) assert.ok(eye.distanceTo(anchor) <= MapEditor3D.OPEN_REACH + 1e-6, `the anchor is in reach (${eye.distanceTo(anchor).toFixed(0)} tiles off)`);
            ed.zoom(-120, px, py);
            const moved = ed.camera.position.distanceTo(eye);
            // A notch closes a tenth of the way to the anchor.
            if (!firstHit(cameraView(map, view), px, py)) assert.ok(moved <= MapEditor3D.OPEN_REACH * (1 - 1 / 1.1) + 1e-6, `one notch moved the eye ${moved.toFixed(1)} tiles (pointer at ${fy} of the view)`);
        }
    }
});

/** A view in Event mode with its outline built as the editor builds it. */
function eventView(map, meshes, aim) {
    const view = viewOf(map, meshes, aim);
    const scene = new THREE.Scene();
    view.mapScene.scene = () => scene;
    view.eventManager = () => ({ eventMode: true });
    view.buildHoverCell();
    return view;
}

test('in Event mode the outline shows where an event will stand when that is not the surface outlined', () => {
    const top = R.PIECE_FLOOR_THICKNESS;
    const deck = [];
    for (let y = 14; y <= 16; y++) for (let x = 10; x <= 21; x++) deck.push({ kind: 'floor', x, y, z: 3, material: 'Wood' });
    deck.push({ kind: 'fence', x: 5, y: 5, z: 0, material: 'Wood' });
    const map = mapOf(40, 40, deck);
    const meshes = [groundMesh(map), boxMesh(10, 3, 14, 22, 3 + top, 17, { pieces: true, pieceMaterial: 'Wood' })];
    const view = eventView(map, meshes, { target: { x: 16, y: 3, z: 15 }, distance: 24 });
    const feet = view.hoverFeet;
    assert.ok(feet && feet.parent === view.hoverCell, 'it hangs on the outline: hidden and taken away with it');
    const points = () => { const at = feet.geometry.attributes.position, out = []; for (let i = 0; i < at.count; i++) out.push([at.getX(i), Math.round(at.getY(i) * 100) / 100, at.getZ(i)]); return out; };
    // On the deck: an event placed there stands on the ground under it.
    const [px, py] = screenOf(view, 15.5, 3 + top, 15.5);
    const tile = view.tileAt(px, py);
    view.updateHoverCell(tile);
    assert.equal(feet.visible, true);
    const drawn = points();
    assert.deepEqual(drawn.slice(0, 8).map(p => p[1]), new Array(8).fill(0), 'the tile\'s square at the height the event stands');
    assert.deepEqual(drawn.slice(0, 8).map(p => [p[0], p[2]]), [[0, 0], [1, 0], [1, 0], [1, 1], [1, 1], [0, 1], [0, 1], [0, 0]], 'the whole tile');
    assert.deepEqual(drawn.slice(8), [[0.5, 3 + top, 0.5], [0.5, 0, 0.5]], 'joined to the outline by a line down its middle');
    assert.deepEqual([view.hoverCell.position.x, view.hoverCell.position.z], [15, 15]);
    // On the ground, where the event stands on what is outlined: nothing more than the outline.
    const [gx, gy] = screenOf(view, 15.5, 0, 22.5);
    view.updateHoverCell(view.tileAt(gx, gy));
    assert.equal(view.hoverCell.visible, true);
    assert.equal(feet.visible, false);
    // The ground showing in a fence's cell: the event would stand on the fence.
    view.updateHoverCell({ x: 5, y: 5, lift: 0 });
    assert.equal(feet.visible, true);
    assert.deepEqual(points().slice(8), [[0.5, 0, 0.5], [0.5, 1, 0.5]]);
    // Off the map, and with another tool in hand.
    view.updateHoverCell(null);
    assert.equal(feet.visible, false);
    view.eventManager = () => ({ eventMode: false });
    view.updateHoverCell(tile);
    assert.equal(feet.visible, false, 'only where a click places an event');
    // A tile given without a pick is outlined on its ground, and the same holds for it.
    view.eventManager = () => ({ eventMode: true });
    view.updateHoverCell({ x: 15, y: 15 });
    assert.equal(feet.visible, false, 'under the deck the event stands on the ground outlined');
    view.updateHoverCell({ x: 5, y: 5 });
    assert.equal(feet.visible, true);
    // On water the line runs from the surface, where the outline lies, down to the bed the event stands on.
    const bowl = (x, z) => -12 * Math.max(0, 1 - Math.hypot(x - 30, z - 30) / 14);
    const lakeMap = mapOf(60, 60, null, bowl);
    lakeMap.reactor3d.water = [{ x0: 14, y0: 14, x1: 46, y1: 46, level: -1 }];
    const lake = eventView(lakeMap, [groundMesh(lakeMap)], { target: { x: 30, y: -1, z: 28 }, distance: 30 });
    const [wx, wy] = screenOf(lake, 30.2, -1, 24.8);
    const wet = lake.tileAt(wx, wy);
    assert.deepEqual([wet.x, wet.y, wet.level], [30, 24, -1]);
    lake.updateHoverCell(wet);
    assert.equal(lake.hoverFeet.visible, true);
    const line = lake.hoverFeet.geometry.attributes.position, bed = R.groundHeightAt(lakeMap, 30.5, 24.5);
    assert.ok(bed < -6, 'deep here');
    assert.deepEqual([line.getY(8), Math.round(line.getY(9) * 1000)], [-1, Math.round(bed * 1000)]);
    // A brush of several tiles outlines them all: where one of them stands says nothing of the rest.
    view.mapEditor = () => ({ mapStamp: { width: 2, height: 2 } });
    view.updateHoverCell({ x: 5, y: 5 });
    assert.deepEqual([view.hoverCell.scale.x, view.hoverCell.scale.z, feet.visible], [2, 2, false]);
    view.mapEditor = () => null;
    // Built again with the scene: the old one is let go, not left on the new outline.
    const old = feet;
    view.buildHoverCell();
    assert.notEqual(view.hoverFeet, old);
    assert.equal(view.hoverFeet.parent, view.hoverCell);
});

test('a wall of the room standing inside the map is no tile either', () => {
    const map = mapOf(30, 30);
    // A room that ends at row 8 of a larger map: its north wall, ten high, facing south.
    const wall = sheetMesh([[0, 0, 8], [30, 0, 8], [30, 10, 8], [0, 10, 8]], { roomPiece: 'walls' });
    const view = viewOf(map, [groundMesh(map), wall], { target: { x: 15, y: 0, z: 16 }, distance: 20, pitch: 15 });
    const [px, py] = screenOf(view, 15.5, 6, 8);
    assert.equal(firstHit(view, px, py).object, wall);
    assert.equal(view.tileAt(px, py), null);
});

test('the point inside the tile is the picked one, for a tile named through a roof too', () => {
    const { map, meshes, top } = house();
    const view = viewOf(map, meshes, { target: { x: 13, y: 0, z: 13 }, distance: 25 });
    view.tilePixels = () => 48;
    const [px, py] = screenOf(view, 12.25, top, 11.75);
    assert.notEqual(firstHit(view, px, py).object.userData.pieceMaterial, 'Wood', 'the floor is behind the house\'s roof or wall');
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [12, 11]);
    assert.ok(Math.abs(tile.localX - 12) < 0.5 && Math.abs(tile.localY - 36) < 0.5, `a quarter in, three quarters down (got ${tile.localX}, ${tile.localY})`);
});

test('a ray that is no ray ends the walk at once', () => {
    const map = mapOf(200, 200);
    const started = process.hrtime.bigint();
    assert.equal(MapEditor3D.standCrossing(map, new THREE.Vector3(NaN, 5, 5), new THREE.Vector3(0.6, -0.5, 0.6).normalize(), 0), null);
    assert.equal(MapEditor3D.standCrossing(map, new THREE.Vector3(5, 5, 5), new THREE.Vector3(NaN, NaN, NaN), 0), null);
    assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 100, 'within the cells a map can hold');
});

test('something whose top stands over the height read for its cell is still the cell under the pointer', () => {
    // A rock a tile high by the height rules, drawn a little higher and rounded, under a roof.
    const pieces = [{ kind: 'block', x: 10, y: 10, z: 0, material: 'Rock' }];
    for (let y = 4; y <= 14; y++) pieces.push({ kind: 'floor', x: 10, y, z: 8, material: 'RoofTile' });
    const map = mapOf(30, 30, pieces);
    assert.equal(R.groundHeightAt(map, 10.5, 10.5), 1);
    // Its drawn top: 1.1 up at the south edge of its cell, 1.4 at the north.
    const rock = sheetMesh([[10, 1.1, 11], [11, 1.1, 11], [11, 1.4, 10], [10, 1.4, 10]], { pieces: true, pieceMaterial: 'Rock' });
    assert.ok(MapEditor3D.faceUp(rock, 0) > MapEditor3D.LEVEL_TOP, 'nearly level');
    const steep = sheetMesh([[10, 0.8, 11], [11, 0.8, 11], [11, 1.4, 10], [10, 1.4, 10]], { pieces: true, pieceMaterial: 'Rock' });
    assert.ok(MapEditor3D.faceUp(steep, 0) < MapEditor3D.LEVEL_TOP, 'too steep to be a level top');
    const view = viewOf(map, [groundMesh(map), steep], { target: { x: 10, y: 1, z: 10 }, distance: 14, pitch: 12 });
    const [px, py] = screenOf(view, 10.5, 1.34, 10.1);
    assert.equal(firstHit(view, px, py).object, steep);
    const tile = view.tileAt(px, py);
    assert.deepEqual([tile.x, tile.y], [10, 10], 'the rock, not the ground the ray comes down on behind it');
    assert.ok(Math.abs(tile.lift - 1.34) < 0.02);
});
