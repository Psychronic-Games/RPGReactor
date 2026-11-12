'use strict';
// The lamps' cores in one draw (runtime/reactor_3d.js, Reactor3D.LightCores): each core's own values, in three's
// order, from one mesh; each core draws itself whenever that could change the picture.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;
const C = Reactor3D.LightCores;

// The round picture is drawn on a canvas in the game.
Reactor3D._roundLight = Reactor3D._roundLight || new THREE.Texture();

const renderer = {
    sortObjects: true,
    properties: { get: () => ({ currentProgram: { program: {}, isReady: () => true } }) },
    getContext: () => ({ LINK_STATUS: 1, getProgramParameter: () => true })
};
const light = (x, y, z, rgb, intensity) => ({ x, y, z, r: rgb[0], g: rgb[1], b: rgb[2], intensity, radius: 4, spot: false, beam: false, width: 0.1 });

function room(lights) {
    const mapScene = Object.create(Reactor3D.MapScene.prototype);
    mapScene._scene = new THREE.Scene();
    const bodies = mapScene.lightBodies();
    lights.forEach((l, i) => bodies.place(i, l));
    bodies.trim(lights.length);
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 500);
    camera.position.set(3, 6, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    mapScene._scene.updateMatrixWorld();
    return { mapScene, scene: mapScene._scene, bodies, camera, record: bodies.coresMesh };
}
/** One pass's draw as three makes it: the mesh is drawn if its material is shown. */
function draw(r) {
    const record = C.take(renderer, r.scene, r.camera);
    r.scene.updateMatrixWorld();
    const mesh = r.record && r.record.mesh;
    if (mesh && mesh.visible && mesh.material.visible) mesh.onBeforeRender(renderer, r.scene, r.camera);
    const state = record ? { cores: record.taken.slice(), count: record.geometry.instanceCount, hidden: record.bodies.cores.filter(core => !core.visible).length } : null;
    if (record) C.restore(renderer, record);
    return state;
}
const LIGHTS = [light(0, 1, 0, [1, 0.5, 0.25], 0.8), light(4, 1, -6, [0.2, 0.4, 1], 1.5), light(-5, 2, 3, [0.3, 1, 0.3], 0.5)];

test.beforeEach(() => { C.enabled = true; });

test('the shader is three\'s sprite shader with a core\'s values read by instance', () => {
    const shaders = C.shaders();
    assert.ok(shaders, 'made from this three\'s sprite shader');
    assert.equal(C.enabled, true);
    const sprite = THREE.ShaderLib.sprite;
    assert.ok(!shaders.vertex.includes('modelViewMatrix[ 3 ]') && shaders.vertex.includes('vec4 mvPosition = rrCoreEye[ rrCoreAt ];'));
    assert.ok(shaders.vertex.includes('vec2 scale = vec2( length( rrCoreX[ rrCoreAt ] ), length( rrCoreY[ rrCoreAt ] ) );'));
    assert.ok(shaders.fragment.includes('vec4 diffuseColor = vRrCoreTint;') && !shaders.fragment.includes('vec4( diffuse, opacity )'));
    // Nothing else of the sprite's shader is touched: taking the three replaced lines back gives three's own text.
    const back = shaders.vertex.slice(shaders.vertex.indexOf(sprite.vertexShader.slice(0, 20)))
        .replace('int rrCoreAt = int( rrCore );\n\tvRrCoreTint = rrCoreTint[ rrCoreAt ];\n\tvec4 mvPosition = rrCoreEye[ rrCoreAt ];', 'vec4 mvPosition = modelViewMatrix[ 3 ];')
        .replace('length( rrCoreX[ rrCoreAt ] ), length( rrCoreY[ rrCoreAt ] )', 'length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz )');
    assert.equal(back, sprite.vertexShader);
});

test('the cores are drawn by one mesh, each with its own place, size, colour and strength, farthest first', () => {
    const r = room(LIGHTS), record = r.record;
    assert.ok(record, 'two cores or more: the mesh stands ready');
    assert.equal(record.mesh.parent, r.bodies.group);
    assert.equal(record.mesh.renderOrder, 13);
    assert.equal(record.mesh.visible, true);
    assert.equal(record.material.visible, false, 'drawing nothing outside the pass\'s own draw');
    const core = r.bodies.cores[0], m = record.material, s = core.material;
    for (const key of ['blending', 'transparent', 'depthWrite', 'depthTest', 'fog', 'toneMapped', 'side', 'alphaTest', 'premultipliedAlpha', 'map', 'sizeAttenuation']) assert.equal(m[key], s[key], key + ' as a core\'s');

    // Its program first: a draw of no cores, which draw themselves.
    let state = draw(r);
    assert.deepEqual(state, { cores: [], count: 0, hidden: 0 });
    assert.equal(record.primed, true);

    state = draw(r);
    assert.equal(state.count, 3);
    assert.equal(state.hidden, 3, 'the cores sit out of the draw the mesh makes for them');
    assert.ok(r.bodies.cores.every(c => c.visible), 'and are shown again after it');
    assert.equal(record.material.visible, false);

    // three's order for see-through things: farthest first (its own depth for a sprite).
    const screen = new THREE.Matrix4().multiplyMatrices(r.camera.projectionMatrix, r.camera.matrixWorldInverse);
    const depth = c => new THREE.Vector3().setFromMatrixPosition(c.matrixWorld).applyMatrix4(screen).z;
    const order = r.bodies.cores.slice().sort((a, b) => depth(b) - depth(a) || a.id - b.id);
    assert.notDeepEqual(order, r.bodies.cores, 'the lights here are not placed in depth order');
    const u = record.material.uniforms, f = Math.fround;
    order.forEach((c, i) => {
        const e = new THREE.Matrix4().multiplyMatrices(r.camera.matrixWorldInverse, c.matrixWorld).elements, w = c.matrixWorld.elements;
        assert.deepEqual(Array.from(u.rrCoreEye.value.slice(i * 4, i * 4 + 4)), [f(e[12]), f(e[13]), f(e[14]), f(e[15])], 'the column three sends as modelViewMatrix[3]');
        assert.deepEqual(Array.from(u.rrCoreX.value.slice(i * 3, i * 3 + 3)), [f(w[0]), f(w[1]), f(w[2])]);
        assert.deepEqual(Array.from(u.rrCoreY.value.slice(i * 3, i * 3 + 3)), [f(w[4]), f(w[5]), f(w[6])]);
        assert.deepEqual(Array.from(u.rrCoreTint.value.slice(i * 4, i * 4 + 4)), [f(c.material.color.r), f(c.material.color.g), f(c.material.color.b), f(c.material.opacity)]);
    });
    assert.equal(record.material.uniformsNeedUpdate, true);
});

test('anything else at the cores\' render order, or a core changed, and each core draws itself', () => {
    const r = room(LIGHTS);
    draw(r);
    assert.equal(draw(r).count, 3);
    // A map's tiles over the characters, fourth layer: three sorts that mesh among the cores by distance.
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true }));
    tiles.renderOrder = 13;
    r.scene.add(tiles);
    const refused = C.refused;
    assert.equal(draw(r), null);
    assert.equal(C.refused, refused + 1);
    assert.ok(r.bodies.cores.every(c => c.visible));
    tiles.visible = false;
    assert.equal(draw(r).count, 3, 'hidden, it sorts among nothing');
    r.scene.remove(tiles);

    // A neighbouring map's cores are another group's: its own bodies, same order.
    const other = new THREE.Sprite(r.bodies.cores[0].material.clone());
    other.renderOrder = 13; other.userData.rrLightCore = true;
    const far = new THREE.Group();
    far.add(other); r.scene.add(far);
    assert.equal(draw(r), null);
    r.scene.remove(far);

    r.bodies.cores[1].material.rotation = 0.3;
    assert.equal(draw(r), null, 'a core that is not as it was made');
    r.bodies.cores[1].material.rotation = 0;
    r.bodies.cores[2].center.set(0.5, 0);
    assert.equal(draw(r), null);
    r.bodies.cores[2].center.set(0.5, 0.5);
    assert.equal(draw(r).count, 3);

    // Another pass of the same scene with the bodies hidden (the lights' pass) takes nothing.
    r.bodies.group.visible = false;
    assert.equal(draw(r), null);
    r.bodies.group.visible = true;
    assert.equal(C.take({ sortObjects: false }, r.scene, r.camera), null, 'unsorted draws keep the scene\'s order');
});

test('one core, the switch, and a map let go', () => {
    const r = room(LIGHTS);
    draw(r); draw(r);
    r.bodies.trim(1);
    assert.equal(r.record.mesh.visible, false, 'one core is one draw already');
    assert.equal(draw(r), null);
    LIGHTS.forEach((l, i) => r.bodies.place(i, l));
    r.bodies.trim(3);
    assert.equal(draw(r).count, 3);
    C.enabled = false;
    assert.equal(draw(r), null);
    r.bodies.trim(3);
    assert.equal(r.record.mesh.visible, false);
    C.enabled = true;
    r.bodies.trim(3);
    assert.equal(draw(r).count, 3);
    let disposed = 0;
    r.record.geometry.addEventListener('dispose', () => disposed++);
    r.record.material.addEventListener('dispose', () => disposed++);
    r.bodies.dispose();
    assert.equal(disposed, 2);
    assert.equal(r.record.mesh.parent, null);
    assert.equal(r.bodies.coresMesh, null);
});

test('a program that does not link leaves the cores to their own draws', () => {
    const r = room(LIGHTS);
    const broken = Object.assign({}, renderer, { getContext: () => ({ LINK_STATUS: 1, getProgramParameter: () => false }) });
    const warn = console.warn;
    console.warn = () => {};
    try {
        const record = C.take(broken, r.scene, r.camera);
        record.mesh.onBeforeRender(broken, r.scene, r.camera);
        C.restore(broken, record);
        assert.equal(record.primed, false);
        assert.equal(C.enabled, false);
        assert.equal(C.take(broken, r.scene, r.camera), null);
        assert.ok(r.bodies.cores.every(c => c.visible));
    } finally { console.warn = warn; C.enabled = true; }
});
