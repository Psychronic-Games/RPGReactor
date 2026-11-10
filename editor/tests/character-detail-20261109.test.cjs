'use strict';
// Characters in North Haven (runtime 20261109.2): the parts of a built character take detail levels, and a
// trimmed Quality level leaves out the soft hair pass even where the part is a group holding an unnamed mesh.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const T = global.THREE;

const part = (indices, skinned) => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('rrLayer', new T.Float32BufferAttribute(new Float32Array(3), 1));
    g.setIndex(new T.BufferAttribute(new Uint32Array(indices), 1));
    const m = new T.MeshBasicMaterial(); m.__reactorModel = true;
    if (!skinned) return new T.Mesh(g, m);
    g.setAttribute('skinIndex', new T.BufferAttribute(new Uint16Array(12), 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(new Float32Array(12), 4));
    return new T.SkinnedMesh(g, m);
};

test('a built character\'s parts of 10,000 triangles and up take levels, their part rows kept', () => {
    const D = R.GeometryDetail;
    // An outfit of 15,000 triangles (a layered part, with its rows) and an actor of 15,600.
    assert.equal(D.eligible(part(45000, true)), true);
    assert.equal(D.eligible(part(46890, false)), true);
    // Small trims stay whole.
    assert.equal(D.eligible(part(15000, true)), false);
    assert.equal(D.eligible(part(15000, false)), false);
    assert.equal(D.detailAttribute('rrLayer', true), true);
    assert.equal(D.detailAttribute('rrHairDir', true), false);
});

test('the simplifier weighs the part rows, so no edge collapses from one part into another', () => {
    const source = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /filter\(\(\[k\]\) => \/\^\(uv\\d\*\|color\|skinWeight\|rrLayer\)\$\/\.test\(k\)\)/);
});

test('trimmed, a body leaves out its soft hair pass, found by the group it stands in', () => {
    const body = new T.Group(), soft = new T.Group(), hair = new T.Group();
    soft.name = 'Hair_soft'; hair.name = 'Hair';
    const softMesh = new T.SkinnedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    const hairMesh = new T.SkinnedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    const named = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()); named.name = 'Facial_hair_soft';
    soft.add(softMesh); hair.add(hairMesh); body.add(soft, hair, named);
    const holder = {};
    R.FarParts.apply(holder, body, false, true);
    assert.equal(softMesh.layers.mask & 1, 0, 'the unnamed mesh in Hair_soft leaves the view');
    assert.equal(named.layers.mask & 1, 0, 'a mesh named soft leaves it as before');
    assert.equal(hairMesh.layers.mask & 1, 1, 'the cut-out hair stays');
    R.FarParts.apply(holder, body, false, false);
    assert.equal(softMesh.layers.mask & 1, 1, 'and comes back when the level stops trimming');
});
