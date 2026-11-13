/**
 * Database > 3D Models: an effect the author set to follow the whole model stays there.
 * The Follows list writes a marker (`anchor.wholeModel`) into model.json when "the model's
 * origin" is chosen; without the marker an origin anchor is an old file's, and is moved onto
 * the carved part that contains it, as before.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const ctx = { console, module: { exports: {} }, require, process, setTimeout, performance: { now: () => 0 } };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'three.js'), 'utf8'), ctx);
const THREE = ctx.THREE || ctx.module.exports;
global.THREE = THREE;
const Editor = require('../src/database/Database3DEditor.js');

/** A model with one carved part, a unit box named Turret around the origin. */
function fixture() {
    const e = new Editor({}, { currentProject: {} });
    const object = new THREE.Group();
    const turret = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    turret.name = 'Turret';
    turret.userData.parts = [{ name: 'Turret', pivot: [0, 0, 0] }];
    object.add(turret);
    e._object = object;
    e.customParts = [{ name: 'Turret' }];
    e._modelSpan = () => 1;
    e._anchorNode = name => object.getObjectByName(name);
    return e;
}

test('the marker is written only when the author picks the model\'s origin', () => {
    const offset = [0.1, 0.2, 0];
    assert.deepEqual(Editor.followAnchor('', offset, { part: 'Turret', offset }), { part: '', offset, wholeModel: true }, 'from a part to the origin');
    assert.deepEqual(Editor.followAnchor('Turret', offset, { part: '', offset, wholeModel: true }), { part: 'Turret', offset }, 'a part never carries it');
    assert.deepEqual(Editor.followAnchor('', offset, { part: '', offset }), { part: '', offset }, 'nothing chosen: an old file gains nothing');
    assert.deepEqual(Editor.followAnchor('', offset, { part: '', offset, wholeModel: true }), { part: '', offset, wholeModel: true }, 'chosen before: kept');
    // Moving the dot keeps what the effect follows and chooses nothing.
    assert.deepEqual(Editor.followAnchor('', offset, { part: '', offset, wholeModel: true }, true), { part: '', offset, wholeModel: true });
    assert.deepEqual(Editor.followAnchor('', offset, { part: '', offset }, true), { part: '', offset });
    assert.equal(Editor.followsWholeModel({ part: 'Turret', offset, wholeModel: true }), false);
    assert.equal(Editor.followsWholeModel({ part: '', offset, wholeModel: 1 }), false, 'only the marker as it is written');
});

test('an old file\'s origin anchor inside a carved part moves onto the part, as before', () => {
    const e = fixture();
    const work = { name: 'Lamp', anchor: { part: '', offset: [0, 0, 0] } };
    e._healAnchorBinding(work);
    assert.equal(work.anchor.part, 'Turret');
    assert.equal('wholeModel' in work.anchor, false);
});

test('an anchor the author set to follow the whole model is left where it is', () => {
    const e = fixture();
    const work = { name: 'Lamp', anchor: { part: '', offset: [0, 0, 0], wholeModel: true } };
    e._healAnchorBinding(work);
    assert.deepEqual(work.anchor, { part: '', offset: [0, 0, 0], wholeModel: true });
    // The pass over every effect (after a part is carved) leaves it too, and saves nothing for it.
    e.rawEffects = [work];
    e.saveRules = () => { throw new Error('nothing changed, nothing to save'); };
    e._healAllAnchorBindings();
    assert.equal(work.anchor.part, '');
});
