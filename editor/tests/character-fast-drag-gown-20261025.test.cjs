'use strict';
// Dragging Height on a ball gown: the drag's fast path moves each garment vertex with the skin vertex nearest it.
// A gown's hem stands far out from the legs, past the few cells the search looked in, and every vertex there rode
// on the body's first vertex instead: the hem tore into spikes until the drag was let go (trailer shoot, 2026-10-23).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('./helpers/character-quality-matrix.cjs');
const Wardrobe = require('../src/forge/Character3D/CharacterWardrobe.js');
const Detail = require('../src/forge/Character3D/CharacterDetail.js');
const Props = require('../src/forge/Character3D/CharacterProps.js');

let pack;
test.before(async () => { pack = await Q.Body.loadPack(); });

/** The longest edge of a part after the drag, against the same edge before, over all its edges. */
function worstStretch(index, before, after) {
    let worst = 0;
    for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
        const a = index[t + k] * 3, b = index[t + (k + 1) % 3] * 3;
        const d0 = Math.hypot(before[a] - before[b], before[a + 1] - before[b + 1], before[a + 2] - before[b + 2]);
        const d1 = Math.hypot(after[a] - after[b], after[a + 1] - after[b + 1], after[a + 2] - after[b + 2]);
        // Edges under 5 mm (a bodice's welded seams) say nothing about tearing.
        if (d0 >= 0.005) worst = Math.max(worst, d1 / d0);
    }
    return worst;
}

test('a ball gown dragged much taller keeps its skirt whole: no edge of the skirt stretched four times over', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, scope = { window: {}, THREE, RRHumanBody: Q.Body, RRCharacterDetail: Detail, RRCharacterProps: Props, console };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    const gala = Wardrobe.PRESETS.find(p => p.id === 'generatedGala');
    const start = Q.Model.normalize({ age: 30, gender: 1, height: 0.5, outfit: Wardrobe.dressFor(gala.items, false), hair: { style: 'bald' } });
    const end = Q.Model.normalize(Object.assign({}, start, { height: 1 }));
    const built = Q.Model.build(pack, start, {}, { quality: 'preview', skinSize: 32 });
    const meshes = built.parts.map(p => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p.positions), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(p.normals), 3));
        if (p.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(p.uvs), 2));
        geometry.setIndex(Array.from(p.index));
        return { geometry };
    });
    const b = Object.create(scope.window.Character3DBuilder.prototype);
    Object.assign(b, { pack, recipe: end, _result: built, _view: { meshes, bones: built.bones.map(() => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() })),
        group: { position: { y: 0 }, updateMatrixWorld() {} }, skeleton: { calculateInverses() {} } }, _resumePose() {}, _draw() {} });
    b._fast = b._fastStart(built);
    const shaped = Q.Body.shape(pack, end);
    b._fastApply(shaped, Q.Body.normals(shaped, pack.body.source, pack.body.index, pack.vertexCount), Q.Body.joints(pack, shaped).map(j => j.head));
    // The skirt is the part named for the gown alone (the bodice shares its part with the lining and gloves).
    // Before the fix its hem tore: 326 edges over three times their length, the worst 13.4 times.
    const k = built.parts.findIndex(p => p.name === 'Ball gown');
    assert.ok(k > 0, 'the gown has a skirt part: ' + built.parts.map(p => p.name).join(', '));
    const stretch = worstStretch(built.parts[k].index, built.parts[k].positions, meshes[k].geometry.getAttribute('position').array);
    assert.ok(stretch < 4, `an edge of the skirt stretched ${stretch.toFixed(2)} times`);
    meshes.forEach(m => m.geometry.dispose());
});
