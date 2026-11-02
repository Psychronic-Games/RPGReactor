'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function fixture() {
    let now = 0, id = 0;
    const frames = new Map(), scope = { window: {}, performance: { now: () => now },
        requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    const b = Object.create(scope.window.Character3DBuilder.prototype);
    const position = { array: new Float32Array(9) }, normal = { array: new Float32Array(9).fill(1) };
    const geometry = { index: { array: Uint32Array.of(0, 1, 2) }, getAttribute: name => name === 'position' ? position : name === 'normal' ? normal : undefined };
    b._view = { meshes: [{ geometry }] }; b._result = { parts: [{ name: 'Body', positions: new Float32Array(9) }] }; b._render = () => b._stepPreviewTween(now);
    return { b, position, normal, geometry, frames, step(time) { now = time; const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(time); } };
}
test('worker samples interpolate in the view and finish on the exact result without mutating export data', () => {
    const f = fixture(), before = f.b._previewSnapshot();
    f.position.array.fill(2); f.normal.array.fill(0.5);
    const resultPositions = Float32Array.from(f.position.array);
    f.b._result = { parts: [{ name: 'Body', positions: resultPositions }] };
    f.b._tweenPreview(before);
    assert.equal(f.position.array[0], 0);
    f.step(70);
    assert.equal(f.position.array[0], 1);
    assert.equal(f.normal.array[0], 0.75);
    assert.ok(resultPositions.every(v => v === 2), 'the saved model stays exact');
    f.step(140);
    assert.ok(f.position.array.every(v => v === 2));
    assert.ok(f.normal.array.every(v => v === 0.5));
    assert.equal(f.b._previewTween, null);
    assert.equal(f.frames.size, 0);
});
test('a new sample starts from the displayed intermediate shape and cancellation releases frames', () => {
    const f = fixture(), before = f.b._previewSnapshot(); f.position.array.fill(2); f.b._tweenPreview(before); f.step(70);
    const midway = f.b._previewSnapshot(); f.position.array.fill(4); f.b._tweenPreview(midway);
    assert.equal(f.position.array[0], 1, 'retargeting never jumps back to an older sample');
    f.b._stopPreviewTween();
    assert.ok(f.position.array.every(v => v === 4));
    assert.equal(f.frames.size, 0);
    const incompatible = f.b._previewSnapshot(); f.geometry.index.array = Uint32Array.of(0, 2, 1); f.position.array.fill(6); f.b._tweenPreview(incompatible);
    assert.equal(f.b._previewTween, null, 'different topology cannot interpolate unrelated vertices');
    assert.equal(f.position.array[0], 6);
});

test('matching completed builds reuse the existing meshes, skeleton and GPU attributes', () => {
    const THREE = require('./helpers/three.cjs'), scope = { window: {}, THREE };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8'), scope);
    const b = Object.create(scope.window.Character3DBuilder.prototype);
    b._view = { group: new THREE.Group(), scene: new THREE.Scene(), meshes: [], bones: [], textures: new Map(), key: { castShadow: false }, blob: new THREE.Object3D() };
    Object.assign(b, { _material: () => new THREE.MeshBasicMaterial(), _restHeights() {}, _faceFrame() {}, _frame() {}, _aim() {}, _syncPose() {}, _syncHeldPreview() {}, _draw() {} });
    const build = x => ({ plan: 'human', height: 1.7, textures: {}, bones: [{ name: 'Hips', parent: -1, head: [0, 0, 0] }], parts: [{ name: 'Body', kind: 'skin',
        positions: Float32Array.of(x, 0, 0, x + 1, 0, 0, x, 1, 0), normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1), index: Uint32Array.of(0, 1, 2),
        joints: new Uint8Array(12), weights: Float32Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0) }] });
    b._show(build(0));
    const mesh = b._view.meshes[0], skeleton = b._view.skeleton, attribute = mesh.geometry.getAttribute('position');
    b._show(build(0.1));
    assert.ok(b._view.meshes[0] === mesh && b._view.skeleton === skeleton && mesh.geometry.getAttribute('position') === attribute, 'matching builds must preserve their rendering objects');
    assert.ok(Math.abs(attribute.array[0] - 0.1) < 0.000001, 'the reused buffer receives the new shape');
    b._clearModel();
});
