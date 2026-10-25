'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const T = require('../node_modules/three');
const Creature = require('../src/forge/Character3D/CreatureBody.js');
const scope = { window: {}, THREE: T, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);

test('creature rebuilds and compatible size edits keep the ground fixed while fitting the contact shadow', () => {
    const builder = Object.create(scope.window.Character3DBuilder.prototype);
    const scene = new T.Scene(), group = new T.Group();
    const floor = new T.Mesh(new T.PlaneGeometry(200, 200)), blob = new T.Object3D();
    floor.rotation.x = -Math.PI / 2; blob.position.y = .002;
    scene.add(floor, blob, group);
    const view = builder._view = { scene, group, floor, blob, key: new T.DirectionalLight(), meshes: [], bones: [] };
    builder._clearModel = () => {
        for (const mesh of view.meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
        group.clear(); group.position.set(0, 0, 0); view.meshes = []; view.action = null;
    };
    builder._material = () => new T.MeshStandardMaterial();
    for (const name of ['_restHeights', '_faceFrame', '_frame', '_aim', '_syncPose', '_syncHeldPreview', '_swapTextures', '_resumePose', '_draw']) builder[name] = () => {};
    floor.updateMatrixWorld(true);
    const ground = floor.matrixWorld.elements.slice(), geometry = floor.geometry;
    const check = () => {
        scene.updateMatrixWorld(true);
        assert.deepEqual(floor.matrixWorld.elements, ground, 'body dimensions cannot move or resize the ground');
        assert.equal(floor.geometry, geometry); assert.equal(floor.parent, scene);
        const box = new T.Box3().setFromObject(group), center = box.getCenter(new T.Vector3());
        assert.ok(Math.abs(blob.position.x - center.x) < 1e-6);
        assert.ok(Math.abs(blob.position.z - center.z) < 1e-6, 'shadow follows an offset footprint in either update path');
        assert.ok(Math.abs(blob.scale.x - Math.max(.25, (box.max.x - box.min.x) * .55)) < 1e-6);
        assert.ok(Math.abs(blob.scale.y - Math.max(.25, (box.max.z - box.min.z) * .75 + .08)) < 1e-6);
        assert.equal(blob.position.y, .002);
    };
    for (const recipe of [
        Creature.withVariant(Creature.kindRecipe('worm'), 'wormType', 'goauld'),
        Creature.kindRecipe('horse'), Creature.kindRecipe('beetle')
    ]) {
        const result = Creature.build(recipe, { quality: 'preview', static: true, hairBudget: 0 });
        builder._show(result); check();
        const meshes = view.meshes.slice(), shadow = blob.scale.clone();
        const factor = 2.5, offset = .35;
        const larger = { ...result, height: result.height * factor,
            bones: result.bones.map(b => ({ ...b, head: b.head.map((v, k) => v * factor + (k === 2 ? offset : 0)), tail: b.tail.map((v, k) => v * factor + (k === 2 ? offset : 0)) })),
            parts: result.parts.map(p => ({ ...p, positions: Float32Array.from(p.positions, (v, k) => v * factor + (k % 3 === 2 ? offset : 0)) })) };
        builder._show(larger); check();
        assert.ok(view.meshes.every((m, i) => m === meshes[i]), 'exercises the actual in-place geometry update');
        assert.ok(blob.scale.x > shadow.x || blob.scale.y > shadow.y, 'contact shadow grows with the animal');
    }
    builder._clearModel(); floor.geometry.dispose(); floor.material.dispose();
});
