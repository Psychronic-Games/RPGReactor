const test = require('node:test');
const assert = require('node:assert/strict');
require('../../runtime/libs/three.js');
const THREE = global.THREE;
const R = require('../../runtime/reactor_3d.js');
const Editor = require('../src/database/Database3DEditor.js');
const Rigger = require('../src/database/ModelRigger.js');

test('landmarks validate finite offsets and follow their bone, pose and instance scale', () => {
    const points = R.readModelLandmarks({ landmarks: {
        eyes: { part: 'Head', offset: [0, 0.1, 0.2] }, mouth: { part: 'Head', offset: [0, 0, 0.2] },
        upperLip: { offset: [NaN, 0, 0] }, lowerLip: { offset: ['0', 0, 0] }
    } });
    assert.deepEqual(Object.keys(points), ['eyes', 'mouth']);
    const object = new THREE.Group(), head = new THREE.Bone(); head.name = 'Head'; head.position.y = 0.8;
    object.add(head); object.userData.glbSize = { x: 1, y: 1, z: 1 };
    R.bindModelLandmarks(object, points);
    object.position.set(10, 3, 20); object.scale.set(2, 4, 3);
    R.modelLandmarkWorld(object, 'eyes').toArray().forEach((v, i) => assert.ok(Math.abs(v - [10, 6.6, 20.6][i]) < 1e-9));
    head.position.y = 1;
    assert.ok(Math.abs(R.modelLandmarkWorld(object, 'mouth').y - 7) < 1e-9);
    assert.equal(R.modelLandmarkWorld(object, 'upperLip'), null);
    R.bindModelLandmarks(object, { eyes: { part: 'Deleted', offset: [0, 0, 0] } });
    assert.equal(R.modelLandmarkWorld(object, 'eyes'), null, 'a missing bone does not put eyes at the feet');
});

test('first-person eyes scale with tall/short models, lift and movement before model sync', t => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 2, z: 0.5 };
    const character = { _realX: 4, _realY: 6 };
    const holder = { object, cameraBaseX: 3, cameraBaseZ: 5, cameraBaseY: 1 };
    t.mock.method(R, 'modelHolderFor', () => holder);
    R.bindModelLandmarks(object, {});
    object.position.set(3.5, 1, 5.5); object.scale.setScalar(2);
    // The model gives the height and how far out its eyes stand (0.45 here); over the ground the eye stands that
    // far and a little ahead of the cell's middle along the look.
    R.Camera.look.yaw = 0;
    R.Camera.playerEyes(character, 2).toArray().forEach((v, i) => assert.ok(Math.abs(v - [4.5, 5.68, 6.5 - 0.45 - R.Camera.EYE.lead][i]) < 1e-9, 'axis ' + i));
    object.scale.setScalar(0.25);
    assert.equal(R.Camera.playerEyes(character, 2).y, 2.46);
    R.bindModelLandmarks(object, { eyes: { part: '', offset: [0.1, 1.2, 0.3] } });
    const eye = R.Camera.playerEyes(character, 2).clone();
    assert.equal(eye.y, 2.3);
    const resolved = R.Camera.resolve({ mode: 'firstPerson' }, { playerPosition: () => ({ x: 4, y: 6, elevation: 2, eyes: eye }) });
    const camera = new THREE.PerspectiveCamera(); R.Camera.place(camera, resolved, 1);
    assert.deepEqual(camera.position.toArray(), eye.toArray());
});

test('first person keeps party models and follower billboards visible while respecting sprite transparency', t => {
    const player = {}, follower = {};
    t.mock.method(R.Camera, 'currentState', () => ({ mode: 'firstPerson' }));
    const oldPlayer = global.$gamePlayer, oldMap = global.$gameMap;
    global.$gamePlayer = player; global.$gameMap = { _reactorCamera3d: { mode: 'firstPerson' } };
    t.after(() => { global.$gamePlayer = oldPlayer; global.$gameMap = oldMap; });
    assert.equal(R.characterHiddenByCamera(player), true);
    assert.equal(R.characterHiddenByCamera(player, true), false);
    assert.equal(R.characterHiddenByCamera(follower), false);
    assert.equal(R.characterHiddenByCamera(follower, true), false);
    global.$gameMap._reactorCamera3d.mode = 'thirdPerson';
    assert.equal(R.characterHiddenByCamera(player), false);
});

test('in first person a follower inside the eye\'s room is out of sight, and back once it has stepped clear', t => {
    const oldPlayer = global.$gamePlayer, oldMap = global.$gameMap, oldFollower = global.Game_Follower;
    global.Game_Follower = class Game_Follower { constructor(x, y) { this._realX = x; this._realY = y; } };
    const player = { _realX: 10, _realY: 10 }, near = new global.Game_Follower(10, 11), far = new global.Game_Follower(10, 12);
    const event = { _realX: 10, _realY: 10.5 };
    let mode = 'firstPerson';
    t.mock.method(R.Camera, 'currentState', () => ({ mode }));
    global.$gamePlayer = player; global.$gameMap = { _reactorCamera3d: { mode: 'firstPerson' } };
    t.after(() => { global.$gamePlayer = oldPlayer; global.$gameMap = oldMap; global.Game_Follower = oldFollower; });
    assert.deepEqual([R.EYE_ROOM, R.EYE_ROOM_CLEAR], [1.2, 1.7]);
    for (const model of [true, false]) {
        assert.equal(R.characterHiddenByCamera(near, model), true, 'a step behind the eye');
        assert.equal(R.characterHiddenByCamera(far, model), false, 'two steps off is seen');
        assert.equal(R.characterHiddenByCamera(event, model), false, 'an event is never hidden: it is who the player talks to');
    }
    // Hidden, it stays so until it is past the wider ring; seen, it stays so until it is inside the room.
    near._realY = 11.5;
    assert.equal(R.characterHiddenByCamera(near, true), true, 'at the edge it does not flicker');
    far._realY = 11.5;
    assert.equal(R.characterHiddenByCamera(far, true), false);
    near._realY = 11.8;
    assert.equal(R.characterHiddenByCamera(near, true), false, 'clear of the room');
    near._realY = 11.5;
    assert.equal(R.characterHiddenByCamera(near, true), false);
    // From behind the player nothing is hidden for the eye's sake.
    near._realY = 11; mode = 'thirdPerson'; global.$gameMap._reactorCamera3d.mode = 'thirdPerson';
    assert.equal(R.characterHiddenByCamera(near, true), false);
});

test('face points save and reopen without changing an imported/custom rig or carved parts', t => {
    const previous = [global.Reactor3D, global.ModelRigger];
    global.Reactor3D = R; global.ModelRigger = Rigger;
    t.after(() => { [global.Reactor3D, global.ModelRigger] = previous; });
    const e = new Editor({}, {}), object = new THREE.Group(), head = new THREE.Bone();
    head.name = 'Head'; head.position.y = 1; object.add(head); object.scale.setScalar(2);
    e._object = object; e._template = { userData: { glbSize: { x: 1, y: 2, z: 1 } } };
    e.partNames = ['Head']; e._rigFaceMode = true;
    e._rigMarkers = Rigger.defaultFaceMarkers(e._template.userData.glbSize);
    e._faceBindings = Object.fromEntries(Rigger.FACE_MARKERS.map(p => [p.key, 'Head']));
    const saved = { rig: { weightsFile: 'model.rig.bin', bones: [{ name: 'Head' }] }, parts: [{ name: 'Ear' }], custom: 42 };
    e._readSidecarForUpdate = () => JSON.stringify(saved);
    let written;
    e._writeFileAtomic = (fs, file, text) => { written = JSON.parse(text); };
    e.rulesPath = () => '/unused/model.json'; e._modelRecordStatus = () => {}; e._t = x => x;
    e.saveFacePoints();
    assert.deepEqual(written.rig, saved.rig); assert.deepEqual(written.parts, saved.parts); assert.equal(written.custom, 42);
    assert.equal(written.landmarks.eyes.part, 'Head');
    const before = structuredClone(e._rigMarkers);
    e.landmarks = written.landmarks; e.customParts = saved.parts;
    e._detail = { querySelector: () => ({}) }; e.deselectPart = e._stopEffectPreview = e._rebuildInstance = e._buildRigVisuals = e.renderRigBar = e.renderEditCard = () => {};
    assert.equal(e.enterRigMode(true), true, 'face points work on carved models too');
    for (const key of Object.keys(before)) e._rigMarkers[key].forEach((v, i) => assert.ok(Math.abs(v - before[key][i]) < 1e-9));
});

test('face axis dragging converts world travel into scaled, rotated model coordinates and rejects retired holds', () => {
    const e = new Editor({}, {}), object = new THREE.Group();
    object.scale.set(2, 3, 4); object.rotation.y = Math.PI / 2; object.position.set(5, 6, 7);
    e._object = object; e._rigFaceMode = true; e._facePoint = 'eyes';
    e._rigMarkers = { eyes: [0.1, 1.5, 0.2], mouth: [0, 1, 0.2] };
    let syncs = 0;
    e._syncFacePointVisuals = () => syncs++; e._syncFacePointControls = () => syncs++;
    const start = object.localToWorld(new THREE.Vector3().fromArray(e._rigMarkers.eyes));
    const hold = { object, key: 'eyes', start, grab: { axis: 'x', travel: () => 0.04 } };
    e._dragFacePointArrow(hold, 0, 0);
    const after = object.localToWorld(new THREE.Vector3().fromArray(e._rigMarkers.eyes));
    assert.ok(Math.abs(after.x - start.x - 0.04) < 1e-9);
    assert.ok(Math.abs(after.y - start.y) < 1e-9);
    assert.ok(Math.abs(after.z - start.z) < 1e-9);
    assert.equal(syncs, 2);
    const saved = structuredClone(e._rigMarkers);
    e._facePoint = 'mouth'; e._dragFacePointArrow(hold, 0, 0);
    e._facePoint = 'eyes'; e._object = new THREE.Group(); e._dragFacePointArrow(hold, 0, 0);
    assert.deepEqual(e._rigMarkers, saved);
    assert.equal(syncs, 2);
});
