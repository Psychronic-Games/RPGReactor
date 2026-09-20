// A light's glow ball is whole, the editor's light cull follows its camera,
// and a placed light can take any single-light preset's look from the Type
// dropdown — including the Sun.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

function loadThree() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return global.THREE;
}

test('the glow sphere does not fade along the cone axis, and a sun keeps a ball-sized glow', () => {
    const THREE = loadThree();
    const Reactor3D = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const cone = Reactor3D.lightBodyMaterial();
    assert.equal(cone.uniforms.alongFade.value, 1, 'a cone fades from apex to rim');
    assert.match(cone.fragmentShader, /float along = 1\.0 - vAlong \* alongFade;/);
    // The light textures draw on a canvas; the bodies only need a texture object.
    const round = Reactor3D.roundLightTexture;
    Reactor3D.roundLightTexture = () => new THREE.Texture();
    const scene = Object.create(Reactor3D.MapScene.prototype);
    scene._scene = new THREE.Scene();
    const bodies = scene.lightBodies();
    const light = { x: 5, y: 40, z: 5, radius: 150, spot: false, beam: false, width: 0.08, r: 1, g: 0.9, b: 0.8, angle: 0, ax: 0, ay: -1, az: 0, hit: null, intensity: 2 };
    bodies.place(0, light);
    const glow = bodies.glows[0];
    assert.equal(glow.material.uniforms.alongFade.value, 0, 'a sphere is whole: no half circles');
    assert.equal(glow.scale.x, Reactor3D.LIGHT_HAZE_MAX, 'a map-wide reach does not become a map-wide ball');
    bodies.place(1, Object.assign({}, light, { radius: 4 }));
    assert.ok(Math.abs(bodies.glows[1].scale.x - 1.8) < 1e-9, 'a lamp keeps its haze');
    Reactor3D.roundLightTexture = round;
});

test('the editor cull frustum follows the camera from frame to frame', () => {
    const THREE = loadThree();
    const Reactor3D = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 500);
    camera.position.set(0, 10, 0);
    camera.lookAt(0, 10, -50);
    Reactor3D.cullCamera = camera;
    Reactor3D.cullFrame = 1;
    assert.equal(Reactor3D.sphereInView(0, 10, -30, 2), true, 'ahead: in view');
    assert.equal(Reactor3D.sphereInView(0, 10, 30, 2), false, 'behind: culled');
    camera.lookAt(0, 10, 50);
    camera.updateMatrixWorld();
    assert.equal(Reactor3D.sphereInView(0, 10, 30, 2), false, 'the same frame keeps its frustum');
    Reactor3D.cullFrame = 2;
    assert.equal(Reactor3D.sphereInView(0, 10, 30, 2), true, 'the next drawn frame sees where the camera looks now');
    assert.equal(Reactor3D.sphereInView(0, 10, -30, 2), false);
    Reactor3D.cullCamera = null;
    assert.match(read('editor/src/MapEditor3D.js'), /Reactor3D\.cullFrame = \(Reactor3D\.cullFrame \|\| 0\) \+ 1;/, 'the editor stamps every drawn frame');
});

test('a preset gives an existing light its look and nothing else; the Sun is one of them', () => {
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapLights.js'), context);
    const L = context.RRMapLights;
    const sun = L.PRESETS.find(preset => preset.key === 'sun');
    assert.ok(sun && sun.template.type === 'point' && sun.template.height >= 30 && sun.template.radius >= 100 && sun.template.shadow === true);
    const look = L.presetLook('sun');
    assert.deepEqual({ ...look }, { flicker: 0, pulse: null, type: 'point', color: '#fff3d2', radius: 150, intensity: 2, shadow: true });
    for (const key of ['x', 'y', 'height', 'id', 'key', 'tag', 'attach']) assert.equal(key in look, false, key + ' stays the light\'s own');
    assert.equal(L.PRESETS.length % 4, 0, 'the tray fills its rows of four (no chip sits alone on a row)');
    assert.equal(L.PRESETS.find(preset => preset.key === 'point'), undefined, 'no plain Point chip: a Lamp is the everyday point light');
    assert.equal(L.presetLook('candle').flicker, 0.6);
    assert.equal(L.presetLook('lamp').flicker, 0, 'a lamp made from a candle stops flickering');
    assert.equal(L.presetLook('alarm').pulse.period, 150);
    assert.equal(L.presetLook('torch').type, 'spot');
    assert.equal(L.presetLook('streetlamp'), null, 'a compound preset is several lights, not a look');
    assert.equal(L.presetLook('nope'), null);
    // Applied through the store, the light keeps where it stands.
    const map = { width: 10, height: 10, reactor3d: { version: 1 } };
    const light = L.add(map, Object.assign(L.presetTemplate('lamp'), { x: 3, y: 4, height: 2.5, id: 'porch' }));
    const after = L.update(map, light.id, L.presetLook('sun'));
    assert.equal(after.id, 'porch');
    assert.equal(after.x, 3); assert.equal(after.y, 4); assert.equal(after.height, 2.5);
    assert.equal(after.radius, 150); assert.equal(after.shadow, true);
    // The panel's Type dropdown offers the shapes and every single-light preset.
    const panel = read('editor/src/LightingManager.js');
    assert.match(panel, /group\(this\._k\('lit\.types'\), \[\['point'/, 'shapes first');
    assert.match(panel, /filter\(preset => preset\.template && !preset\.template\.compound && !shapes\.includes\(preset\.key\)\)/, 'compound presets stay in the tray, and the shapes are not listed twice');
    assert.match(panel, /RRMapLights\.presetLook\(value\.slice\(7\)\)/);
    assert.match(panel, /case 'sun': return line\(/, 'the tray chip has a sun face');
    // Every locale names the preset and the two groups.
    const i18n = read('editor/src/I18nManager.js');
    for (const key of ['lit.preset.sun', 'lit.types', 'lit.presets']) {
        assert.equal((i18n.match(new RegExp('"' + key.replace('.', '\\.') + '": "', 'g')) || []).length, 18, key + ' in 18 locales');
    }
});
