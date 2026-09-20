// In third person the look pitches the player's head joint, not the body.
// The head is found through the rig's joint test (a rig mapped onto a file's
// joints marks plain Groups), the rig's Head part wins, and a tip joint such
// as head_end never does; the pitch turns about the model's side axis and is
// taken back off before the next frame's lean when no clip rewrote the joint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_3d.js'), 'utf8');

function loadHelpers() {
    const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
    const body = slice('/** A node that hinges like a bone', 'Reactor3D.applyModelRig = function') + slice('Reactor3D.findHeadJoint = function', '/**\n * In third person the player looks');
    const Reactor3D = {};
    new Function('Reactor3D', body)(Reactor3D);
    return Reactor3D;
}
const node = (name, opts = {}) => ({ name, isBone: !!opts.bone, userData: { __reactorClipBone: !!opts.clip, parts: opts.part ? [{ name: opts.part }] : undefined }, children: opts.children || [],
    traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); } });

test('the head joint is found through isRigJoint, the rig part first, tips never', () => {
    const R = loadHelpers();
    const root = node('root', { children: [
        node('Spine', { clip: true, part: 'Spine', children: [
            node('neck', { clip: true, part: 'Neck', children: [
                node('head_end', { clip: true }),
                node('Head', { clip: true, part: 'Head', children: [node('headfront', { clip: true })] })
            ] })
        ] })
    ] });
    assert.equal(R.findHeadJoint(root).name, 'Head');
    // A plain Group named Head that the rig did not claim is not a joint.
    const unrigged = node('root', { children: [node('Head', {})] });
    assert.equal(R.findHeadJoint(unrigged), null);
    // A skinned file: bones by name, the tip skipped.
    const skinned = node('root', { children: [node('mixamorig:HeadTop_End', { bone: true }), node('mixamorig:Head', { bone: true })] });
    assert.equal(R.findHeadJoint(skinned).name, 'mixamorig:Head');
});

test('the lean pitches the head about the model side axis and unwinds an untouched joint', () => {
    assert.match(source, /object\.userData\.__reactorHead = this\.findHeadJoint\(object\);/);
    assert.match(source, /if \(memo\.applied && head\.quaternion\.equals\(memo\.result\)\) head\.quaternion\.copy\(memo\.base\);/);
    assert.match(source, /scratch\.axis\.set\(1, 0, 0\)\.applyQuaternion\(scratch\.model\)\.applyQuaternion\(scratch\.parent\)\.normalize\(\);/);
    assert.match(source, /head\.quaternion\.premultiply\(scratch\.turn\.setFromAxisAngle\(scratch\.axis, lean\)\);/);
    // The body fallback survives for a model with no head joint at all.
    assert.match(source, /if \(!head\) \{\s*object\.rotation\.x \+= lean;\s*return;\s*\}/);
});
