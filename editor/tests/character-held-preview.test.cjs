'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const T = require('../node_modules/three');
const Q = require('./helpers/character-quality-matrix.cjs');
const Poses = require('../src/forge/Character3D/CharacterPoses.js'), Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');
function builder(extra = {}) {
    const box = { window: { RRCharacterPoses: Poses }, THREE: T, console, require, ...extra };
    vm.runInNewContext(source + '\nthis.Builder = Character3DBuilder;', box);
    return box.Builder;
}

test('marked sword and gun pivots stay in the right palm through poses and body rebuilds', async () => {
    const Builder = builder(), pack = await Q.Body.loadPack();
    const shapes = [
        { axis: [1, 0, 0], up: [0, 1, 0], base: [-0.1, 0, 0], length: 1, grip: 0.1, gripRadius: 0.015, marks: { handle: 0.2 } },
        { axis: [0, 0, 1], up: [0, 1, 0], handle: { at: [0, -0.08, 0.1], radius: 0.018 } }
    ];
    for (const recipe of [{ gender: 1 }, { gender: 0, height: -0.6, shapes: { armLength: -2.5, handSize: 3 } }, { gender: 1, height: 1.8, muscle: 2.5 }]) {
        const body = Q.Body.build(pack, recipe), frame = Poses.handFrames(body.bones).Right;
        const id = body.bones.findIndex(b => b.name === 'RightHand');
        for (const shape of shapes) {
            const hand = new T.Bone(), object = new T.Group(); hand.add(object);
            const target = Builder.fitHeldPreview(object, shape, frame, T);
            const pivot = new T.Vector3().fromArray(shape.handle ? shape.handle.at : [-0.1 + 0.2 * 0.65, 0, 0]);
            assert.ok(pivot.clone().applyQuaternion(object.quaternion).add(object.position).distanceTo(target) < 1e-8, 'authored grip fits the palm');
            const direction = new T.Vector3().fromArray(shape.axis).applyQuaternion(object.quaternion);
            assert.ok(direction.dot(new T.Vector3().fromArray(shape.handle ? frame.along : frame.thumbward)) > 0.9999, 'weapon axis follows the hand frame');
            for (const pose of ['walk', 'swordThrust', 'pistol', 'bow']) {
                const clip = Poses.clip(body.bones, pose, body.parts[0]);
                for (const u of [0, 0.5, 1]) {
                    const ps = Cloth.pose(body.bones, clip, clip.times.at(-1) * u);
                    hand.position.fromArray(ps.P[id]); hand.quaternion.fromArray(ps.R[id]); hand.updateMatrixWorld(true);
                    const actual = object.localToWorld(pivot.clone()), expected = hand.localToWorld(target.clone());
                    assert.ok(actual.distanceTo(expected) < 1e-7, pose + ': marker remains attached');
                }
            }
        }
    }
});

test('a weapon finishing after the selection is cleared is disposed and never attached', async () => {
    let finish, opened;
    const pending = new Promise(resolve => { finish = resolve; });
    const R = { readModelAsync: () => { opened = true; return pending; } };
    const Builder = builder({ window: { Reactor3D: R }, Reactor3D: R, require: name => name === 'fs' ? { promises: { readFile: async () => Buffer.alloc(4) } } : require(name) });
    const b = Object.create(Builder.prototype);
    b._view = { heldRequest: 0 }; b.root = {}; b._heldName = 'Sword';
    b.recipe = { plan: 'human' }; b._project = () => ({ path: '/isolated-project' });
    b._heldModels = () => [{ name: 'Sword', file: 'Sword', ext: '.glb', sidecar: {} }];
    b._draw = () => {}; b._attachHeldPreview = () => assert.fail('stale weapon attached');
    const load = b._syncHeldPreview();
    while (!opened) await new Promise(resolve => setImmediate(resolve));
    b._heldName = ''; await b._syncHeldPreview();
    const object = new T.Group(), geometry = new T.BoxGeometry(), material = new T.MeshStandardMaterial();
    let disposed = 0;
    geometry.addEventListener('dispose', () => disposed++); material.addEventListener('dispose', () => disposed++);
    object.add(new T.Mesh(geometry, material)); finish(object); await load;
    assert.equal(disposed, 2); assert.equal(b._view.held, null); assert.equal(object.parent, null);
});
