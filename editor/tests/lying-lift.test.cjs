'use strict';
// A body laid down by turning it about its feet (a sleeper, Face Ceiling / Face Ground) rests on the floor instead of
// half under it (runtime/reactor_3d_models.js, Reactor3D.LyingLift).
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const THREE = global.THREE;
const L = Reactor3D.LyingLift;

function body() {
    const g = new THREE.BoxGeometry(0.4, 1.8, 0.3);
    g.translate(0, 0.9, 0);
    const root = new THREE.Group();
    root.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
    return root;
}

test('a body on its back rests its lowest point just above the floor', () => {
    const object = body(), holder = { poseHeld: true };
    object.position.set(3, 1, 4);
    object.rotateX(-Math.PI / 2);
    L.apply(holder, object, 1);
    object.updateMatrixWorld(true);
    assert.ok(Math.abs(L.lowest(object) - (1 + L.CLEAR)) < 1e-6);
    assert.ok(Math.abs(holder.lyingLift.lift - (0.15 + L.CLEAR)) < 1e-6, 'half its depth, which lay under the floor');
});

test('a held body is measured once; placed again it takes the same lift without a measure', () => {
    const object = body(), holder = { poseHeld: true };
    object.rotateX(-Math.PI / 2);
    L.apply(holder, object, 0);
    const lowest = L.lowest;
    let measured = 0;
    L.lowest = function() { measured++; return lowest.apply(this, arguments); };
    try {
        object.position.y = 0;
        L.apply(holder, object, 0);
        assert.equal(measured, 0);
        assert.ok(Math.abs(object.position.y - holder.lyingLift.lift) < 1e-9);
        L.apply(holder, object, 0.5);
        assert.equal(measured, 1, 'a new floor is measured again');
    } finally { L.lowest = lowest; }
});

test('placement lifts any body laid down that a fall does not already lift', () => {
    const source = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.match(source, /if \(posePitch && !character\._reactorKnockedOut\) Reactor3D\.LyingLift\.apply\(holder, object, ground \+ \(character\._reactorLift \|\| 0\) \+ air\);/);
});
