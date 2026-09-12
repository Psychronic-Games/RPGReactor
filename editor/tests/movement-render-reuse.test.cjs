'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../../runtime/reactor_3d.js');
require('../../runtime/libs/three.js');
const T = global.THREE;

test('looping effects reuse their shader with independent uniforms and release scene resources', () => {
    const E = R.EffekseerScene, scene = new T.Scene(), other = new T.Scene();
    const make = owner => {
        const quad = E.quadFor({ width: 4, height: 4 }, owner);
        const play = { scene: owner, quad, track: {}, done: false };
        owner.add(quad.mesh); E._live.push(play); return play;
    };
    const a = make(scene), b = make(scene), elsewhere = make(other);
    let materials = 0, geometries = 0, textures = 0;
    for (const p of [a, b]) {
        p.quad.material.addEventListener('dispose', () => materials++);
        p.quad.mesh.geometry.addEventListener('dispose', () => geometries++);
        p.quad.texture.addEventListener('dispose', () => textures++);
    }
    const material = a.quad.material;
    a.quad.material.uniforms.flip.value = 1;
    a.quad.material.uniforms.rectSize.value.set(.2, .3);
    E.stop(a);
    assert.equal(textures, 1);
    assert.equal(materials, 0);
    assert.equal(a.quad.texture, null);
    assert.equal(material.uniforms.map.value, null);
    const next = make(scene);
    assert.equal(next.quad.material, material, 'the compiled material survives the gap between loops');
    assert.notEqual(next.quad.material, b.quad.material);
    assert.equal(material.uniforms.flip.value, 0);
    assert.deepEqual(material.uniforms.rectSize.value.toArray(), [1, 1]);
    assert.equal(material.uniforms.map.value, next.quad.texture);
    assert.notEqual(next.quad.texture, b.quad.texture);
    E.stopScene(scene);
    assert.equal(materials, 2);
    assert.equal(geometries, 2);
    assert.equal(E._quadPools.has(scene), false);
    assert.equal(E._live.includes(elsewhere), true);
    E.stopScene(other);
});

test('idle effect quads are bounded and unowned effects dispose immediately', () => {
    const E = R.EffekseerScene, scene = new T.Scene();
    let disposed = 0;
    const plays = Array.from({ length: 12 }, () => {
        const quad = E.quadFor({}, scene);
        quad.material.addEventListener('dispose', () => disposed++);
        return { scene, quad };
    });
    plays.forEach(p => E.stop(p));
    assert.equal(E._quadPools.get(scene).length, 4);
    assert.equal(disposed, 8);
    E.stopScene(scene);
    assert.equal(disposed, 12);
    const quad = E.quadFor({});
    quad.material.addEventListener('dispose', () => disposed++);
    E.stop({ quad });
    assert.equal(disposed, 13);
});

function floors() {
    const C = R.CoveredFloor, scene = new T.Scene(), group = new T.Group();
    scene.add(group);
    const image = { tagName: 'IMG', complete: true, naturalWidth: 2, naturalHeight: 2, src: 'floor.png' };
    // The alpha scan is separately tested below; the geometry tests start with its proof.
    C._images.set(image, { src: image.src, width: 2, height: 2, opaque: true });
    const bitmap = { image };
    function surface(kind, y, order, side) {
        const geometry = new T.PlaneGeometry(50, 50);
        geometry.rotateX(-Math.PI / 2); geometry.translate(25, y, 25);
        const material = new T.MeshBasicMaterial({ map: new T.Texture(image), transparent: true, alphaTest: .01, side, depthWrite: true });
        const mesh = new T.Mesh(geometry, material); mesh.renderOrder = order; group.add(mesh);
        C.register(scene, mesh, bitmap, kind); return mesh;
    }
    const floor = surface('floor', -.012, -2, T.FrontSide);
    const cover = surface('cover', -.01, -1, T.DoubleSide);
    const camera = new T.PerspectiveCamera(45, 16 / 9, .1, 1000);
    camera.position.set(25, 4, 25);
    scene.updateMatrixWorld();
    const renderer = { clippingPlanes: [], render() { return floor.visible; } };
    const draw = () => C.draw(renderer, scene, camera);
    return { C, scene, group, image, bitmap, floor, cover, camera, renderer, draw, surface };
}

test('an opaque covering floor skips the lower draw and always restores visibility', () => {
    const f = floors();
    assert.equal(f.draw(), false);
    assert.equal(f.floor.visible, true);
    f.renderer.render = () => { assert.equal(f.floor.visible, false); throw Error('lost context'); };
    assert.throws(f.draw, /lost context/);
    assert.equal(f.floor.visible, true);
});

test('floor visibility respects edges, near clipping, transforms and custom projections', () => {
    const f = floors();
    for (const xyz of [[25, 4, 51], [0, 4, 25], [25, .06, 25], [25, -.02, 25]]) {
        f.camera.position.set(...xyz); assert.equal(f.draw(), true, String(xyz));
    }
    f.camera.position.set(25, 4, 25);
    f.camera.projectionMatrix.elements[8] = .1;
    assert.equal(f.draw(), true);
    f.camera.updateProjectionMatrix();
    f.group.position.x = 1; f.scene.updateMatrixWorld();
    assert.equal(f.draw(), true);
    f.group.position.x = 0; f.scene.updateMatrixWorld();
    assert.equal(f.draw(), false);
    f.cover.geometry.attributes.position.array[0] = 1;
    assert.equal(f.draw(), true);
});

test('faded, edited, animated, hidden and replaced covers retain the original floor', () => {
    const cases = [
        f => f.cover.material.opacity = .5,
        f => f.cover.material.depthWrite = false,
        f => f.cover.material.wireframe = true,
        f => f.cover.material.vertexColors = true,
        f => f.cover.geometry.morphAttributes.position = [f.cover.geometry.attributes.position.clone()],
        f => f.floor.castShadow = true,
        f => f.cover.visible = false,
        f => f.bitmap._animatedImage = true,
        f => f.cover.material.map.needsUpdate = true,
        f => f.image.src = 'replacement.png',
        f => f.cover.material.map = new T.Texture(f.image),
        f => f.cover.material.onBeforeCompile = () => {},
        f => f.cover.onBeforeRender = () => {},
        f => f.cover.layers.set(2),
        f => f.renderer.clippingPlanes.push(new T.Plane()),
        f => f.renderer.xr = { isPresenting: true },
        f => f.camera.projectionMatrix.elements[14] *= 2,
        f => f.scene.overrideMaterial = new T.MeshBasicMaterial()
    ];
    for (const change of cases) { const f = floors(); change(f); assert.equal(f.draw(), true, String(change)); }
    const f = floors(); f.C._surfaces.get(f.cover).opaque = false;
    assert.equal(f.draw(), true, 'one translucent source pixel prevents culling');
});

test('a translucent or unknown intervening draw prevents floor reuse', () => {
    const f = floors();
    const wall = f.surface('walls', 2, -2, T.FrontSide); f.scene.updateMatrixWorld();
    assert.equal(f.draw(), false, 'a proven opaque room piece may intervene');
    wall.material.opacity = .9;
    assert.equal(f.draw(), true);
    wall.material.opacity = 1;
    f.C._surfaces.delete(wall);
    assert.equal(f.draw(), true, 'unregistered plugin geometry keeps the original drawing');
    f.group.remove(wall);
    const sprite = new T.Sprite(new T.SpriteMaterial({ transparent: true, opacity: .5 }));
    sprite.renderOrder = -2; f.scene.add(sprite);
    assert.equal(f.draw(), true, 'intervening sprites also keep the original drawing');
});

test('alpha proof scans every source pixel and rejects unavailable or live sources', () => {
    const C = R.CoveredFloor, saved = global.document;
    const image = { tagName: 'IMG', complete: true, naturalWidth: 2, naturalHeight: 2, src: 'a.png' };
    let pixels = new Uint8Array(16).fill(255), reads = 0;
    global.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { reads++; return { data: pixels }; } }) }) };
    try {
        assert.equal(C.opaque(image), true);
        assert.equal(C.opaque(image), true); assert.equal(reads, 1);
        image.src = 'b.png'; pixels[15] = 254;
        assert.equal(C.opaque(image), false);
        assert.equal(C.opaque({ tagName: 'CANVAS' }), false);
        assert.equal(C.opaque({ ...image, complete: false }), false);
        global.document.createElement = () => { throw Error('tainted'); };
        assert.equal(C.opaque({ ...image, src: 'c.png' }), false);
    } finally { if (saved === undefined) delete global.document; else global.document = saved; }
});

test('a completing image warms after decoding, while disposed scenes stay released', async () => {
    const jobs = [];
    const f = floors(); f.image.complete = false;
    f.image.decode = () => new Promise(resolve => jobs.push(resolve));
    f.C.register(f.scene, f.cover, f.bitmap, 'cover');
    const record = f.C._surfaces.get(f.cover);
    assert.equal(record.opaque, false);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(record.opaque, false, 'an event-loop turn does not imply decoded pixels');
    f.image.complete = true; jobs.shift()(); await Promise.resolve();
    assert.equal(record.opaque, true);
    f.image.complete = false;
    f.C.register(f.scene, f.cover, f.bitmap, 'cover');
    const discarded = f.C._surfaces.get(f.cover);
    f.C._scenes.delete(f.scene); f.image.complete = true; jobs.shift()(); await Promise.resolve();
    assert.equal(discarded.opaque, false, 'late callbacks cannot revive a cleared map');
    f.image.complete = false; f.image.decode = () => Promise.reject(Error('decode failed'));
    f.C.register(f.scene, f.cover, f.bitmap, 'cover'); await Promise.resolve();
    assert.equal(f.C._surfaces.get(f.cover).opaque, false);
});
