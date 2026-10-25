'use strict';
// A model's heights keep the open air between its parts (ReactorFight.Action.buildHull, `gapLow` to `gapHigh` per
// cell): a line passes under a tree's crown beside and over its trunk, as Rhea's from North Haven's roof does, and
// is stopped by the trunk and by the crown.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fightWorld } = require('./helpers/fight-world.cjs');

const runtime = path.join(__dirname, '..', '..', 'runtime');
const R = require(path.join(runtime, 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(runtime, 'libs', 'three.js'));
const THREE = global.THREE;
delete global.THREE;

function world() {
    const w = fightWorld({ action: true, mapNote: '<3d>', mapSidecar: { version: 1, mode: '3d', pieces: [] } });
    const facade = Object.create(R);
    Object.assign(facade, { isMap3D: () => true, collisionKeysFor: spec => ({ model: spec.model, pose: spec.model }), _glbCache: {}, _sidecarJson: {} });
    w.Reactor3D = facade;
    w.THREE = THREE;
    return w;
}

/** A tree: a trunk 2 tall and 0.4 wide, and a crown from 3 to 5 high, 2 wide (model units; at size 5 a unit is a tile). */
function tree() {
    const root = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2, 0.4));
    trunk.position.set(0, 1, 0);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    crown.position.set(0, 4, 0);
    root.add(trunk, crown);
    root.userData.glbSize = { x: 2, y: 5, z: 2 };
    return root;
}

test('a tree\'s hull leaves the air between its trunk and its crown open; trunk and crown stop a line', () => {
    const w = world(), A = w.ReactorFight.Action;
    const hull = A.buildHull(w.Reactor3D, tree(), null, { model: 'tree', size: 5 });
    assert.ok(hull && hull.gapLow && hull.gapHigh);
    // The trunk's middle cell: mesh to 2, open air to 3, crown to 5.
    const c = Math.floor((0.05 * hull.sub)) - hull.i0, r = Math.floor((0.05 * hull.sub)) - hull.j0, at = c * hull.rows + r;
    assert.ok(Math.abs(hull.low[at]) < 0.01 && Math.abs(hull.high[at] - 5) < 0.01, 'the cell reaches from the roots to the crown\'s top');
    assert.ok(hull.gapLow[at] >= 2 - 0.2 && hull.gapLow[at] <= 2.2, 'open from the trunk\'s top: ' + hull.gapLow[at]);
    assert.ok(hull.gapHigh[at] <= 3 + 0.01 && hull.gapHigh[at] >= 2.8, 'to the crown\'s bottom: ' + hull.gapHigh[at]);
    // A cell under the crown beside the trunk has crown only: no band below it is open air between two parts.
    const side = (Math.floor(0.8 * hull.sub) - hull.i0) * hull.rows + r;
    assert.ok(Number.isNaN(hull.gapLow[side]));
    // Lines across the tree, through the trunk's cells, at three heights.
    const body = { round: false, hull, only: null, mask: null, ground: 0, top: 5, x: 0, z: 0, cos: 1, sin: 0, halfX: 1, halfZ: 1 };
    const across = height => A.rayBody(body, -4, height, 0.05, 1, 0, 0, 10, false);
    assert.ok(across(1) >= 0, 'the trunk stops a line at its height');
    assert.equal(across(2.5), -1, 'a line under the crown and over the trunk passes');
    assert.ok(across(4) >= 0, 'the crown stops a line at its height');
    // A line that climbs into the crown is stopped where it meets the crown: its side, 3 tiles along, 3.4 high.
    const climb = A.rayBody(body, -4, 2.5, 0.05, 1, 0.3, 0, 10, false);
    assert.ok(Math.abs(climb - 3) < 0.3 && Math.abs(2.5 + 0.3 * climb - 3.4) < 0.1, 'stopped at the crown: ' + climb);
});

test('scenery with no mask stands as its heights when it overhangs open air, else as its box', () => {
    const w = world(), A = w.ReactorFight.Action;
    assert.equal(A.overhangs(A.buildHull(w.Reactor3D, tree(), null, { model: 'tree', size: 5 })), true, 'a tree: open air under its crown');
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    root.userData.glbSize = { x: 1, y: 2, z: 1 };
    assert.equal(A.overhangs(A.buildHull(w.Reactor3D, root, null, { model: 'crate', size: 2 })), false, 'a crate: none');
});

test('a solid model keeps no open band', () => {
    const w = world(), A = w.ReactorFight.Action;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    root.userData.glbSize = { x: 1, y: 2, z: 1 };
    const hull = A.buildHull(w.Reactor3D, root, null, { model: 'crate', size: 2 });
    assert.ok(Array.from(hull.gapLow).every(Number.isNaN));
});
