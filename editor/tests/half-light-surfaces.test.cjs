'use strict';
// The light worked out at a quarter size is filtered up from the samples on
// each pixel's own surface, lit from where the camera stands, and leaves the
// pass's other materials as it found them; beams and the twins' programs
// stay what the full-size path draws.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_lighting.js'));
const HL = Reactor3D.HalfLight, HH = Reactor3D.HalfHaze;

const lit = options => Reactor3D.litMaterial(new THREE.MeshBasicMaterial(options));
const withVolume = fn => {
    const saved = Reactor3D.LightVolume.supported;
    Reactor3D.LightVolume.supported = () => true;
    try { return fn(); } finally { Reactor3D.LightVolume.supported = saved; }
};

test('a twin keeps its original\'s version: a refresh through either recompiles both', () => {
    const material = lit({});
    const twin = HL.twin(material);
    const before = material.version;
    twin.needsUpdate = true;
    assert.equal(material.version, before + 1, 'the original recompiles');
    assert.equal(twin.version, material.version);
    assert.equal(Object.prototype.hasOwnProperty.call(twin, 'version') && Object.getOwnPropertyDescriptor(twin, 'version').get !== undefined, true, 'read through, never its own number');
    material.needsUpdate = true;
    assert.equal(twin.version, material.version, 'and follows it');
});

test('shadows switching on mid-pass refresh the originals behind the twins in the scene', () => {
    const scene = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(), lit({}));
    scene.add(floor);
    const original = floor.material;
    const before = original.version;
    floor.material = HL.twin(original);
    Reactor3D.Shadows.refreshMaterials(scene);
    floor.material = original;
    assert.equal(original.version, before + 1, 'the original takes the shadow variant');
});

test('a material the pass had hidden stays hidden through the split', () => withVolume(() => {
    const scene = new THREE.Scene();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(), lit({}));
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    const shown = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
    overlay.material.visible = false;
    scene.add(floor, overlay, shown);
    const target = { depthTexture: new THREE.DepthTexture(4, 4), width: 4, height: 4, samples: 0 };
    const split = HL.begin({}, scene, target);
    assert.ok(split);
    assert.equal(split.forward.has(overlay.material), false, 'not taken');
    assert.equal(shown.visible, false, 'a shown one waits for the second draw');
    HL.restore(split);
    assert.equal(overlay.material.visible, false, 'still hidden');
    assert.equal(shown.visible, true);
}));

test('a beam stays in the pass at full size; cones and balls of haze go to the small target', () => {
    const scene = new THREE.Scene(), group = new THREE.Group();
    scene.add(group); scene.userData.rrLightBodies = group;
    const cone = new THREE.Mesh(new THREE.BufferGeometry(), Reactor3D.lightBodyMaterial());
    const beam = new THREE.Mesh(new THREE.BufferGeometry(), Reactor3D.beamBodyMaterial());
    group.add(cone, beam);
    const list = HH.take(scene, { depthTexture: new THREE.DepthTexture(4, 4) }, new THREE.PerspectiveCamera());
    assert.deepEqual(list, [cone]);
    assert.equal(beam.visible, true);
    HH.restore(list);
});

test('the small light is filtered up from the samples on the pixel\'s own surface, edges lit at full size', () => {
    const source = HL.upsampleProgram({}).material.fragmentShader;
    assert.match(source, /texelFetch\(rrLightDepth, px, 0\)/, 'reads the pass\'s depth');
    assert.match(source, /dist - \(d \+ vec4\(dot\(slope, o0\)/, 'each sample against the pixel\'s surface carried to it');
    assert.match(source, /rrLightAtTexel\(rrLightWorld\(px, size\), px, size\)/, 'no sample on it: the light at the pixel');
    assert.match(source, /hi - lo < lo \* rrPlainSpread/, 'agreeing samples skip the depth');
    assert.match(source, /rrToSrgb\(clamp\(rrToLinear\(s\.rgb\) \* l, 0\.0, 1\.0\)\)/, 'lit as the lit program does');
    HL.exactEdges = false;
    try { assert.doesNotMatch(HL.upsampleProgram({}).material.fragmentShader, /rrLightAtTexel\(rrLightWorld/, 'the fallback can be left out'); }
    finally { HL.exactEdges = true; }
    assert.match(HL.combineQuad().material.fragmentShader, /texture2D\(light,/, 'matchSurfaces off: filtered plainly');
});

test('the full-screen light faces surfaces toward the real eye, not the world\'s origin', () => withVolume(() => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), lit({})));
    const target = { depthTexture: new THREE.DepthTexture(8, 8), width: 8, height: 8, samples: 0, texture: new THREE.Texture() };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(37.5, 4.4, 18.75);
    camera.updateMatrixWorld();
    const seen = [];
    const renderer = {
        autoClear: true,
        properties: { get: () => ({}) },
        setRenderTarget() {},
        getRenderTarget() { return null; },
        render(s, c) { seen.push(c.position.clone()); },
        info: { programs: [] }
    };
    const split = HL.begin(renderer, scene, target);
    try { HL.finish(renderer, scene, target, camera, split); } catch (error) { /* the scene draw needs a real renderer */ }
    finally { HL.restore(split); }
    assert.ok(seen.length >= 1);
    assert.deepEqual(seen[0].toArray(), camera.position.toArray(), 'the light pass stands where the camera does');
}));
