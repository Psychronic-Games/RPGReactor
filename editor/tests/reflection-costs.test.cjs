/**
 * What the reflections cost per frame: a water mirror draws only the part of
 * its picture the water on screen can read, at the same pixels as the whole
 * picture, and the reflection capture's face for an update waits for a
 * refresh with no update.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;

const M = Reactor3D.Mirrors, F = Reactor3D.Reflections, sight = Reactor3D.WaterSight;

/** A water sheet of `w` x `d` tiles at (x, z), level y, as addWater makes one: in a group, watched. */
function sheet(x, z, w, d, y, look = 0.15) {
    const geometry = new THREE.PlaneGeometry(w, d, w, d);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(x + w / 2, y, z + d / 2);
    const material = new THREE.MeshBasicMaterial();
    material.userData.rrWaterLook = new THREE.Vector4(1, look, 0, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.water = { level: y };
    const group = new THREE.Group();
    group.add(mesh);
    group.updateMatrixWorld(true);
    sight.watch(mesh);
    return mesh;
}

/** A camera above (x, z) looking down at 40 degrees toward +z, 16:9. */
function eye(x, z) {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 400);
    camera.position.set(x, 8, z - 8);
    camera.lookAt(x, 0, z + 2);
    camera.updateMatrixWorld(true);
    return camera;
}

const plane = (object, y = 0) => ({ object, normal: new THREE.Vector3(0, 1, 0), point: new THREE.Vector3(0, y, 0), d: y });

function clean() {
    if (sight.sheets) sight.sheets.clear();
    M.WATER_AREA = true;
}

test('a water plane draws only where water at its level can be on screen, widened by the ripple', () => {
    clean();
    const pond = sheet(-2, 4, 4, 4, 0);
    const camera = eye(0, 0);
    const area = M.waterArea(plane(pond), camera);
    assert.ok(area.x1 > area.x0 && area.y1 > area.y0, 'something in view');
    assert.ok((area.x1 - area.x0) * (area.y1 - area.y0) < 4 * 0.6, 'well short of the whole view: ' + JSON.stringify(area));
    // Every water fragment's lookup lands inside: each corner of the sheet, moved by the most a ripple can move it.
    const reach = 2 * (0.035 + 0.1 * 0.15);
    const p = new THREE.Vector3();
    for (const [cx, cz] of [[-2, 4], [2, 4], [-2, 8], [2, 8], [0, 6]]) {
        p.set(cx, 0, cz).project(camera);
        assert.ok(p.x - reach >= area.x0 - 1e-6 && p.x + reach <= area.x1 + 1e-6, 'x of ' + cx + ',' + cz);
        assert.ok(p.y - reach >= area.y0 - 1e-6 && p.y + reach <= area.y1 + 1e-6, 'y of ' + cx + ',' + cz);
    }
    clean();
});

test('another sheet at the level reads the slot too; one at another level, or out of view, does not', () => {
    clean();
    const pond = sheet(-2, 4, 4, 4, 0);
    const camera = eye(0, 0);
    const alone = M.waterArea(plane(pond), camera);
    sheet(4, 14, 3, 3, 0);
    const both = M.waterArea(plane(pond), camera);
    assert.ok(both.x1 > alone.x1 + 0.01 || both.y1 > alone.y1 + 0.01, 'a second pool at the level widens the area: ' + JSON.stringify([alone, both]));
    clean();
    const pond2 = sheet(-2, 4, 4, 4, 0);
    sheet(4, 14, 3, 3, 6);
    sheet(-2, -40, 4, 4, 0);
    assert.deepEqual(M.waterArea(plane(pond2), camera), alone, 'a higher lake and one behind the eye are left out');
    // A hidden sheet is not drawn, so reads nothing.
    clean();
    const hidden = sheet(-2, 4, 4, 4, 0);
    hidden.parent.visible = false;
    const empty = M.waterArea(plane(hidden), camera);
    assert.ok(!(empty.x1 > empty.x0), 'no water in view: an empty area');
    clean();
});

test('the whole picture when it is not water, the switch is off, or the eye stands over the water it sees', () => {
    clean();
    const pond = sheet(-2, 4, 4, 4, 0);
    const camera = eye(0, 0);
    const model = new THREE.Mesh();
    assert.equal(M.waterArea(plane(model), camera), null, 'a mirror model keeps its whole picture');
    M.WATER_AREA = false;
    assert.equal(M.waterArea(plane(pond), camera), null);
    M.WATER_AREA = true;
    // A lake all round the eye: the area reaches every edge, and as whole pixels that is the whole picture.
    clean();
    const lake = sheet(-60, -60, 120, 120, 0);
    const all = M.waterArea(plane(lake), camera);
    assert.equal(M.pixelArea(all, 1440, 810), null);
    clean();
});

test('the narrowed eye puts every point on the pixel the whole picture had it on, and culls what lies outside', () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 300);
    camera.position.set(3, 5, -4);
    camera.lookAt(0, 0, 10);
    camera.updateMatrixWorld(true);
    const width = 1440, height = 810;
    const area = M.pixelArea({ x0: -0.8, y0: -0.9, x1: 0.1, y1: -0.2 }, width, height);
    assert.ok(area && area.w > 0 && area.w < width && area.h < height);
    const target = new THREE.WebGLRenderTarget(width, height);
    const whole = camera.projectionMatrix.clone();
    M.narrow(camera, target, area, width, height);
    assert.equal(target.scissorTest, true);
    assert.deepEqual([target.viewport.x, target.viewport.y, target.viewport.z, target.viewport.w], [area.x, area.y, area.w, area.h]);
    const toPixel = (projection, point, inArea) => {
        const v = point.clone().applyMatrix4(camera.matrixWorldInverse).applyMatrix4(projection);
        return inArea ? [area.x + (v.x + 1) / 2 * area.w, area.y + (v.y + 1) / 2 * area.h, v.z] : [(v.x + 1) / 2 * width, (v.y + 1) / 2 * height, v.z];
    };
    for (const point of [new THREE.Vector3(0, 0, 10), new THREE.Vector3(-4, 1, 6), new THREE.Vector3(2, -1, 20)]) {
        const a = toPixel(whole, point, false), b = toPixel(camera.projectionMatrix, point, true);
        assert.ok(Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6, 'same pixel: ' + a + ' / ' + b);
        assert.ok(Math.abs(a[2] - b[2]) < 1e-9, 'same depth');
    }
    // Culling sees only the area: a point in the whole view but outside it is outside the narrowed frustum.
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const outside = new THREE.Vector3(0.9, 0.9, 0.5).unproject(Object.assign(camera.clone(), { projectionMatrix: whole, projectionMatrixInverse: whole.clone().invert() }));
    assert.equal(frustum.containsPoint(outside), false);
    M.widen(camera, target, width, height);
    assert.ok(camera.projectionMatrix.equals(whole));
    assert.equal(target.scissorTest, false);
    assert.deepEqual([target.viewport.z, target.viewport.w], [width, height]);
    // What a lookup may read: half a texel inside the drawn pixels.
    assert.ok(Math.abs(area.uv.x - (area.x + 0.5) / width) < 1e-12 && Math.abs(area.uv.w - (area.y + area.h - 0.5) / height) < 1e-12);
});

test('a lookup outside the drawn part keeps the capture: the shader tests the slot\'s area', () => {
    const glsl = Reactor3D.mirrorLookup('rrEnv', () => 'true', '', '1.0');
    assert.match(glsl, /all\(greaterThan\(rrMU, rrMirrorArea0\.xy\)\) && all\(lessThan\(rrMU, rrMirrorArea0\.zw\)\)/);
    assert.match(Reactor3D.mirrorUniformDeclarations(), /uniform vec4 rrMirrorArea0;/);
    const u = M.uniforms();
    u.rrMirrorArea1.value.set(0.2, 0.2, 0.4, 0.4);
    M.clear();
    assert.deepEqual(u.rrMirrorArea1.value.toArray(), [0, 0, 1, 1], 'a cleared slot reads its whole picture');
    M._live = [{ slot: 0, plane: plane(new THREE.Mesh()), texture: M.dummy(), matrix: new THREE.Matrix4(), uv: new THREE.Vector4(0.1, 0.2, 0.3, 0.4) }];
    M.active = true; M._applied = null;
    M.apply(true);
    assert.deepEqual(u.rrMirrorArea0.value.toArray().map(v => +v.toFixed(6)), [0.1, 0.2, 0.3, 0.4]);
    M.reset();
});

test('an update\'s capture face waits for a refresh with no update, or is drawn with the next update', () => {
    const faces = [];
    const kept = { update: F.update, enabled: F.enabled, wanted: F.wanted };
    F.reset();
    F.wanted = true;
    F.enabled = () => true;
    F.update = function() { faces.push('face'); };
    const renderer = { resetState() {} }, camera = new THREE.PerspectiveCamera(), scene = new THREE.Scene();
    const mapScene = { reflectionProbe: () => ({ position: new THREE.Vector3() }), mirrorCandidates: () => [] };
    const update = () => Reactor3D.prepareReflections(renderer, mapScene, scene, camera, 1);
    try {
        // Not yet whole: every update draws its face at once.
        update();
        assert.equal(faces.length, 1);
        F._ready = true;
        F._shownFrame = 1e9;
        // Whole: the update leaves its face, a refresh with no update takes it, and only once.
        update();
        assert.equal(faces.length, 1, 'left for a spare refresh');
        F.takeOwed(renderer, mapScene, scene);
        assert.equal(faces.length, 2);
        F.takeOwed(renderer, mapScene, scene);
        assert.equal(faces.length, 2, 'nothing owed twice');
        // No spare refresh came: the next update draws the owed face, and leaves its own.
        update();
        update();
        assert.equal(faces.length, 3, 'never more than one face an update, never fewer over two');
        assert.ok(F._owed);
        // Another map's scene asks nothing of it.
        F.takeOwed(renderer, { reflectionProbe: mapScene.reflectionProbe }, scene);
        assert.equal(faces.length, 3);
        // Off: each update draws its own.
        F.SPARE_REFRESH = false;
        update(); update();
        assert.equal(faces.length, 5);
        assert.equal(F._owed, null);
        F.SPARE_REFRESH = true;
        // Nothing shiny shown: nothing owed.
        F._shownFrame = -1;
        update(); update();
        assert.equal(F._owed, null);
        F.reset();
        assert.equal(F._owed, null, 'a new map owes nothing');
    } finally {
        Object.assign(F, kept);
        F.SPARE_REFRESH = true;
        F.reset();
    }
});

test('the viewport hands a refresh with no update the owed face, once, and the editor halves the capture while its view moves', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = core.indexOf('Reactor3D.Viewport.prototype.renderPass = function');
    const body = core.slice(at, core.indexOf('\n};', at));
    assert.match(body, /this\._matrixFrame = frame;\n\s*if \(typeof Graphics !== "undefined"\) this\._spareRefresh = Graphics\.refreshCount;/, 'the update\'s own refresh is not a spare one');
    assert.match(body, /\} else if \(Reactor3D\.Reflections && typeof Graphics !== "undefined" && this\._spareRefresh !== Graphics\.refreshCount\) \{\n[^\n]*\n\s*this\._spareRefresh = Graphics\.refreshCount;\n\s*Reactor3D\.Reflections\.takeOwed\(this\._renderer, mapScene, scene\);/);
    const coreJs = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    assert.match(coreJs, /this\._fpsCounter\.startTick\(\);\n[^\n]*\n\s*this\.refreshCount\+\+;/);
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor, /static PROBE_HALF_WHILE_MOVING = true;/);
    assert.match(editor, /const moving = this\._drawActive && MapEditor3D\.PROBE_HALF_WHILE_MOVING;\n\s*if \(moving\) this\._probeTurn = !this\._probeTurn;[\s\S]{0,1200}?if \(!reflections\.idle\(\) && \(!moving \|\| this\._probeTurn\)\)/);
});
