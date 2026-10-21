'use strict';
// A click on a large handle grabs it, wherever along its line it lands (the handles once
// tested sampled points only, so a click between two of them fell through to the ground).
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

global.self = global; global.window = global;
require(path.join(__dirname, '..', '..', 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
require(path.join(__dirname, '..', 'src', 'utils', 'AxisArrows3D.js'));
require(path.join(__dirname, '..', 'src', 'utils', 'PoseRings3D.js'));
const rect = { left: 0, top: 0, width: 1000, height: 1000 };
const screen = (camera, point) => { const v = point.clone().project(camera); return [(v.x + 1) / 2 * rect.width, (1 - v.y) / 2 * rect.height]; };

test('an arrow drawn long on screen is grabbed between its old sample points', () => {
    const arrows = global.RRAxisArrows3D.create(THREE, 4);
    arrows.root.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 7); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    // Halfway between the samples at 3/10 and 4/10 of the shaft's reach (1.2 × length).
    const [x, y] = screen(camera, new THREE.Vector3(4 * 1.2 * 0.35, 0, 0));
    const [ax] = screen(camera, new THREE.Vector3(4 * 1.2 * 0.3, 0, 0)), [bx] = screen(camera, new THREE.Vector3(4 * 1.2 * 0.4, 0, 0));
    assert.ok((bx - ax) / 2 > 10, 'the gap is wider than the reach, as on a zoomed-in shape');
    const got = global.RRAxisArrows3D.pick(THREE, arrows, camera, rect, x, y + 4);
    assert.equal(got && got.axis, 'x');
    assert.equal(global.RRAxisArrows3D.pick(THREE, arrows, camera, rect, x, y + 40), null, 'well off the shaft is not a grab');
});

test('a ring drawn large on screen is grabbed between its old sample points', () => {
    const rings = global.RRPoseRings3D.create(THREE, 2);
    rings.root.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 6, 0.001); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    const half = Math.PI * 2 / 144;   // halfway between two of the 72 samples
    const [x, y] = screen(camera, new THREE.Vector3(2 * Math.cos(half), 0, 2 * Math.sin(half)));
    const got = global.RRPoseRings3D.pick(THREE, rings, camera, rect, x, y, { yaw: 0, pitch: 0, roll: 0 });
    assert.equal(got && got.axis, 'yaw');
});
