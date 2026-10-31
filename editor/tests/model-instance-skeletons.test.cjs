'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('../../runtime/libs/three.js');
const R = require('../../runtime/reactor_3d.js');
const T = global.THREE;

function character() {
    const root = new T.Group();
    root.userData.animated = true;
    const hip = new T.Bone(), hand = new T.Bone();
    hip.name = 'hip'; hand.name = 'hand'; hand.position.y = 1;
    root.add(hip); hip.add(hand); root.updateMatrixWorld(true);
    const skin = new T.Skeleton([hip, hand]);
    for (let i = 0; i < 3; i++) {
        const mesh = new T.SkinnedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
        mesh.name = ['body', 'shirt', 'hair'][i];
        mesh.bind(skin, new T.Matrix4().makeTranslation(i * .1, 0, 0));
        root.add(mesh);
    }
    // A different skin using the same joints must keep its own inverse binds.
    const other = new T.SkinnedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    other.name = 'other';
    const otherSkin = new T.Skeleton([hip, hand], skin.boneInverses.map(m => m.clone()));
    otherSkin.boneInverses[1].elements[12] = .2;
    other.bind(otherSkin, new T.Matrix4()); root.add(other);
    return root;
}

test('character parts share one cloned skin while characters, distinct skins and bind matrices stay independent', () => {
    const template = character(), a = R.cloneModelTemplate(template), b = R.cloneModelTemplate(template);
    const source = template.getObjectByName('body').skeleton, skin = a.getObjectByName('body').skeleton;
    assert.ok(skin === a.getObjectByName('shirt').skeleton);
    assert.ok(skin === a.getObjectByName('hair').skeleton);
    assert.ok(skin !== a.getObjectByName('other').skeleton);
    assert.ok(skin !== source && skin !== b.getObjectByName('body').skeleton);
    for (let i = 0; i < skin.bones.length; i++) {
        assert.ok(skin.bones[i] !== source.bones[i]);
        assert.ok(skin.boneInverses[i] !== source.boneInverses[i]);
    }
    for (const name of ['body', 'shirt', 'hair', 'other']) {
        assert.ok(a.getObjectByName(name).bindMatrix.equals(template.getObjectByName(name).bindMatrix));
    }
    a.getObjectByName('hand').rotation.z = .7; a.updateMatrixWorld(true);
    skin.update();
    const reference = new T.Skeleton(skin.bones, skin.boneInverses); reference.update();
    assert.ok(skin.boneMatrices.every((v, i) => v === reference.boneMatrices[i]), 'shared skin gives the same palette as a separate skin');
    assert.ok(template.getObjectByName('hand').rotation.z === 0);
    assert.ok(b.getObjectByName('hand').rotation.z === 0);
    skin.computeBoneTexture();
    const otherSkin = b.getObjectByName('body').skeleton;
    otherSkin.computeBoneTexture();
    assert.ok(skin.boneTexture !== otherSkin.boneTexture);
    skin.boneInverses[0].elements[12] += 3;
    assert.equal(source.boneInverses[0].elements[12], 0);
    assert.equal(otherSkin.boneInverses[0].elements[12], 0);
    skin.dispose(); otherSkin.dispose();
});

test('releasing a character disposes each shared skin once and leaves other characters and the template usable', () => {
    const template = character(), a = R.cloneModelTemplate(template), b = R.cloneModelTemplate(template);
    const owned = new Set(), protectedSkins = new Set();
    a.traverse(o => { if (o.skeleton) owned.add(o.skeleton); });
    for (const root of [template, b]) root.traverse(o => { if (o.skeleton) protectedSkins.add(o.skeleton); });
    let disposed = 0;
    for (const skin of owned) skin.dispose = () => disposed++;
    for (const skin of protectedSkins) skin.dispose = () => { throw Error('another character or template was released'); };
    R.releaseModelInstance(a, template);
    assert.equal(disposed, 2);
    b.updateMatrixWorld(true);
    for (const skin of protectedSkins) skin.update();
});
