/**
 * Reflections: a model's surface and a water sheet's look, read, saved and
 * drawn: the world captured into a cube beside the camera, mirrored by
 * shiny materials only, and never read by a renderer that did not draw it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;

test('a model\'s surface is read, clamped, and saved only while it reflects', () => {
    assert.equal(Reactor3D.readModelSurface({}), null, 'no surface: the file\'s own metal stands');
    assert.deepEqual({ ...Reactor3D.readModelSurface({ surface: { reflect: 3, gloss: -1, metal: 0.5, tint: '#FFCC55' } }) },
        { reflect: 1, gloss: 0, metal: 0.5, tint: '#FFCC55', texture: 0 });
    assert.equal(Reactor3D.readModelSurface({ surface: { reflect: 1, texture: 0.85 } }).texture, 0.85, 'how much paint stays under the shine');
    assert.ok('surface' in Reactor3D.readModelTransform({}), 'the transform carries it to every placement');
    const Database3DEditor = require(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'));
    const chrome = { reflect: 1, gloss: 0.95, metal: 1, tint: '#ffffff' };
    const saved = JSON.parse(Database3DEditor.mergeSidecar('{"rig":{"template":"humanoid"}}', [], [], {}, [], undefined, undefined, chrome));
    assert.deepEqual(saved.surface, chrome);
    assert.deepEqual(saved.rig, { template: 'humanoid' }, 'the rest of the file is kept');
    const cleared = JSON.parse(Database3DEditor.mergeSidecar(JSON.stringify(saved), [], [], {}, [], undefined, undefined, { reflect: 0 }));
    assert.equal('surface' in cleared, false, 'a surface that reflects nothing is dropped');
    const kept = JSON.parse(Database3DEditor.mergeSidecar(JSON.stringify(saved), [], [], {}, []));
    assert.deepEqual(kept.surface, chrome, 'a save that does not touch the surface keeps it');
});

test('a shiny material carries the reflection; a plain one compiles as before; a cloned one keeps working', () => {
    const plain = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    const shiny = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    Reactor3D.setMaterialShine(shiny, { reflect: 1, gloss: 0.9, metal: 1, tint: '#ffcc55' });
    assert.ok(Reactor3D.shineOf(shiny) && !Reactor3D.shineOf(plain));
    assert.match(shiny.customProgramCacheKey(), /\|shine/);
    assert.doesNotMatch(plain.customProgramCacheKey(), /\|shine/);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    Reactor3D.injectShine(shiny, shader);
    assert.match(shader.fragmentShader, /textureLod\(rrEnvMap, rrR, rrShine\.y \* rrEnvMaxLod\)/, 'rougher reads a blurrier level');
    assert.ok(shader.uniforms.rrShine.value.isVector4);
    const clone = shiny.clone();
    clone.userData = JSON.parse(JSON.stringify(shiny.userData));
    assert.ok(Reactor3D.shineOf(clone).vector.isVector4, 'userData copied through JSON is made whole again');
    assert.match(shader.fragmentShader, /rrN = dot\(rrN, rrV\) < 0\.0 \? -rrN : rrN/, 'an inward normal is turned to the eye, not read as grazing');
    assert.match(shader.fragmentShader, /rrShine\.w/, 'the texture it keeps is a uniform');
    // Off and on again: the material must compile afresh, or three reuses the cached
    // shiny program with the plain compile's uniforms and drops every draw.
    let disposed = 0;
    shiny.addEventListener('dispose', () => disposed++);
    Reactor3D.setMaterialShine(shiny, null);
    assert.equal(Reactor3D.shineOf(shiny), null);
    Reactor3D.setMaterialShine(shiny, { reflect: 1, gloss: 0.9, metal: 1, tint: '#ffffff', texture: 0.5 });
    assert.equal(disposed, 2, 'each toggle releases the cached programs');
    Reactor3D.setMaterialShine(shiny, { reflect: 0.5, gloss: 0.9, metal: 1, tint: '#ffffff', texture: 0.5 });
    assert.equal(disposed, 2, 'a change while shining only moves the uniforms');
    assert.equal(Reactor3D.shineOf(shiny).vector.w, 0.5);
});

test('a renderer that did not draw the capture reflects the studio gradient instead', () => {
    const R = Reactor3D.Reflections;
    R.reset();
    const map = {}, preview = {};
    R._target = { texture: 'cube' };
    R._ready = true; R._renderer = map;
    R.bind(map);
    assert.equal(R.uniforms().rrEnvMap.value, 'cube');
    assert.equal(R.uniforms().rrEnvFlip.value, 1);
    R._capturing = true;
    R.bind(map);
    assert.notEqual(R.uniforms().rrEnvMap.value, 'cube', 'while a face is drawn, what shines in it reads the studio, never the cube being written');
    R._capturing = false;
    R.bind(preview);
    assert.notEqual(R.uniforms().rrEnvMap.value, 'cube', 'a preview gets the fallback');
    assert.equal(R.uniforms().rrEnvFlip.value, -1);
    R._target = null; R.reset();
});

test('a water sheet\'s look survives both the runtime\'s and the editor\'s reading of it', () => {
    const sheet = { x0: 0, y0: 0, x1: 3, y1: 3, level: 1, material: 'Water', reflect: 1, gloss: 0.92, tint: '#D8DDE3' };
    const runtime = Reactor3D.normalizeWater(sheet, { width: 10, height: 10 });
    assert.deepEqual([runtime.reflect, runtime.gloss, runtime.tint], [1, 0.92, '#d8dde3']);
    const E = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));
    const map = { width: 10, height: 10, reactor3d: { version: 1, water: [{ x0: 0, y0: 0, x1: 3, y1: 3, level: 1, material: 'Water' }] } };
    assert.ok(E.styleWaterRegion(map, E.water(map)[0], { reflect: 1, gloss: 0.92, tint: '#d8dde3' }));
    assert.deepEqual([E.water(map)[0].reflect, E.water(map)[0].tint], [1, '#d8dde3']);
    assert.ok(E.styleWaterRegion(map, E.water(map)[0], { reflect: 0 }));
    assert.equal('reflect' in E.water(map)[0], false, 'Plain clears the look');
    const material = Reactor3D.waterMaterial(null, runtime);
    assert.equal(material.userData.rrWaterLook.x, 1);
    assert.ok(Math.abs(material.userData.rrWaterLook.y - 0.08) < 1e-6, 'roughness is one less gloss');
});

test('the capture is taken after the shadow maps, in the game and in the editor', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(core, /renderShadows\(this\._renderer, null\);\s*Reactor3D\.prepareReflections\(this\._renderer, mapScene, scene, this\._camera\);/, 'the capture and the mirrors after the shadow maps');
    assert.match(core, /Reactor3D\.prepareReflections = function[\s\S]{0,900}renderer\.resetState\(\);/, 'three forgets the texture units PIXI unbound before the capture and the mirrors draw');
    assert.match(core, /const probe = mapScene\.reflectionProbe \? mapScene\.reflectionProbe\(camera\) : null;\n\s*if \(probe\) Reactor3D\.Reflections\.update\(renderer, scene, probe\.position, probe\.hidden, probe\.toward, probe\.radius, probe\.reach\);/);
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor, /Reactor3D\.Reflections\.update\(this\.renderer, scene, this\.camera\.position, this\.mapScene\.reflectionHidden\?\.\(\)\)/);
});

test('nothing reflects until its model says so; the capture leaves out the shadow sentinel and the characters', () => {
    const models = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.doesNotMatch(models, /setMaterialShine\(mat, mat\.userData\.glbShine\)/, 'a file\'s metal is a starting point, not on by itself');
    const material = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    material.userData.glbShine = { reflect: 0.7, gloss: 0.6, metal: 1, tint: '#ffffff' };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    Reactor3D.applyModelSurface(mesh, null);
    assert.equal(Reactor3D.shineOf(material), null);
    // The capture: the sentinel and the listed objects are hidden for the face and shown again after.
    const R = Reactor3D.Reflections;
    const sentinel = { visible: true }, hero = { visible: true };
    const seen = [];
    const saved = Reactor3D.Shadows._sentinel;
    Reactor3D.Shadows._sentinel = sentinel;
    R.reset(); R.wanted = true;
    const weak = Reactor3D.isWeakGpu; Reactor3D.isWeakGpu = () => false;
    R._target = { texture: {} };
    R._camera = { position: { set() {} }, updateMatrixWorld() {}, children: [0, 1, 2, 3, 4, 5] };
    const faces = [];
    const renderer = { getRenderTarget: () => null, setRenderTarget(target, face) { if (target) faces.push(face); }, autoClear: false, render: () => seen.push([sentinel.visible, hero.visible, R._capturing]) };
    try {
        R.update(renderer, {}, { x: 0, y: 0, z: 0 }, [hero]);
        assert.deepEqual(seen, [[false, false, true]], 'both left out of the face, drawn as a capture');
        assert.deepEqual([sentinel.visible, hero.visible, R._capturing], [true, true, false], 'and back afterwards');
        // Round the cube once, then the face toward the camera (at -z) every other frame.
        for (let i = 0; i < 9; i++) R.update(renderer, {}, { x: 0, y: 0, z: 0 }, [], { x: 0.2, y: 0.5, z: -4 });
    } finally {
        Reactor3D.Shadows._sentinel = saved; Reactor3D.isWeakGpu = weak; R._target = null; R._camera = null; R.reset();
    }
    assert.deepEqual(faces, [0, 1, 2, 3, 4, 5, 0, 5, 1, 5], 'the mirror face (-z, toward the camera) comes round every other frame once the cube is whole');
});

test('near a mirror-bright model the capture stands inside it, with it hidden and the party in view', () => {
    const shiny = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    Reactor3D.setMaterialShine(shiny, { reflect: 1, gloss: 0.95, metal: 1, tint: '#ffffff', texture: 0 });
    const tank = new THREE.Group(); tank.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), shiny)); tank.position.set(10, 1, 10);
    const hero = new THREE.Group(); hero.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), Reactor3D.litMaterial(new THREE.MeshBasicMaterial()))); hero.position.set(10, 1, 13);
    const scene = new THREE.Scene(); scene.add(tank, hero); scene.updateMatrixWorld(true);
    const fake = { _modelInstances: new Map([[1, { object: tank }], [2, { object: hero }]]), reflectionHidden: Reactor3D.MapScene.prototype.reflectionHidden, reflectionHolders: Reactor3D.MapScene.prototype.reflectionHolders, reflectionSubject: Reactor3D.MapScene.prototype.reflectionSubject };
    const near = Reactor3D.MapScene.prototype.reflectionProbe.call(fake, { position: new THREE.Vector3(10, 4, 18) });
    assert.deepEqual([near.position.x, near.position.z], [10, 10], 'from the model\'s middle');
    assert.deepEqual(near.hidden, [tank], 'only the model itself is left out: the hero is in the mirror');
    assert.ok(near.toward, 'and the face toward the camera is kept fresh');
    fake._probeChoice = null;
    const far = Reactor3D.MapScene.prototype.reflectionProbe.call(fake, { position: new THREE.Vector3(80, 4, 80) });
    assert.equal(far.position.x, 80, 'out of reach, from the camera');
    assert.equal(far.hidden.length, 2, 'with the characters left out, as before');
});

test('a mirror finish finds its flat panels, reflects the camera in the one facing it, and clips at the glass', () => {
    // Two facing mirror slabs, the player between: the house of mirrors picks both.
    const shiny = Reactor3D.litMaterial(new THREE.MeshBasicMaterial());
    Reactor3D.setMaterialShine(shiny, Reactor3D.PIECE_FINISHES.mirror);
    const slab = z => { const m = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 1), shiny); m.position.set(0, 2, z); return m; };
    const room = new THREE.Group(); room.add(slab(0.5), slab(8.5)); room.updateMatrixWorld(true);
    assert.ok(Reactor3D.isMirrorFinish(room));
    const panels = Reactor3D.mirrorPanels(room);
    assert.ok(panels.some(p => p.normal.z > 0.99 && Math.abs(p.d - 1) < 0.01), 'the near slab\'s face toward the room');
    assert.ok(panels.some(p => p.normal.z < -0.99 && Math.abs(p.d + 8) < 0.01), 'the far slab\'s face toward the room');
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200); camera.position.set(0, 1.6, 6.5); camera.lookAt(0, 1.6, 0); camera.updateMatrixWorld(true);
    const out = new THREE.PerspectiveCamera(), matrix = new THREE.Matrix4();
    assert.ok(Reactor3D.Mirrors.reflect(camera, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), out, matrix));
    assert.ok(Math.abs(out.position.z - (2 - 6.5)) < 1e-6, 'the reflected eye stands as far behind the glass as the eye before it');
    assert.equal(Reactor3D.Mirrors.reflect(camera, new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), out, matrix), false, 'no picture from behind a mirror');
    // A frame: the renderer draws each mirror once (depth 2 with the other inside), and the main draw then reads them.
    const draws = [];
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render: (s, cam) => draws.push(cam.position.z), getDrawingBufferSize: v => v.set(640, 360) };
    const M = Reactor3D.Mirrors, weak = Reactor3D.isWeakGpu; Reactor3D.isWeakGpu = () => false;
    try {
        M.update(renderer, new THREE.Scene(), camera, [room], null, [new THREE.Vector3(0, 0.1, 4), new THREE.Vector3(0, 1, 4), new THREE.Vector3(0, 1.8, 4)]);
        assert.equal(M.active, true);
        assert.equal(M._live.length, 2, 'the mirror before the eye and the one it reflects');
        assert.ok(draws.length >= 2 && draws.length <= 2 * (Reactor3D.MIRROR_DEPTH + 1), 'bounded by the depth');
        assert.equal(M.uniforms().rrMirrorOn0.value, 1);
    } finally { Reactor3D.isWeakGpu = weak; M.clear(); M.active = false; M._live = null; M._applied = null; }
});

test('a built piece keeps its finish and wears it in its own shiny draw; water can be a mirror', () => {
    assert.equal(Reactor3D.normalizePiece({ kind: 'block', x: 1, y: 1, z: 0, material: '', finish: 'mirror' }).finish, 'mirror');
    assert.equal('finish' in Reactor3D.normalizePiece({ kind: 'block', x: 1, y: 1, finish: 'velvet' }), false, 'only known finishes');
    const E = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));
    assert.equal(E.normalizePiece({ kind: 'block', x: 1, y: 1, finish: 'gold' }, null).finish, 'gold', 'the editor keeps it too');
    const world = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_world.js'), 'utf8');
    assert.match(world, /const look = shine \? piece\.material \+ "\\u0001" \+ shine : piece\.material;/, 'a surface is its own chunk draw');
    const own = Reactor3D.normalizePiece({ kind: 'block', x: 1, y: 1, finish: 'mirror', surface: { reflect: 0.7, gloss: 0.5, metal: 0.2, tint: '#FFCC55', texture: 0.4 } });
    assert.deepEqual({ ...own.surface }, { reflect: 0.7, gloss: 0.5, metal: 0.2, tint: '#FFCC55', texture: 0.4 }, 'the sliders\' surface is kept');
    assert.equal(Reactor3D.pieceSurface(own), own.surface, 'and wins over the finish');
    assert.equal(Reactor3D.pieceSurface({ finish: 'gold' }).tint, '#ffcc55');
    assert.match(world, /Reactor3D\.mirrorLookup\("rrEnvC", slot => "rrMirrorPlane" \+ slot \+ "\.y > 0\.9 && abs\(vRRWorldPos\.y - rrMirrorPlane" \+ slot \+ "\.w\) < 0\.4"/, 'water reads the mirror picture on its level');
    const lookup = Reactor3D.mirrorLookup('x', slot => 'on' + slot, '', '1.0');
    for (let slot = 0; slot < Reactor3D.MIRROR_SLOTS; slot++) assert.match(lookup, new RegExp('rrMirrorMap' + slot), 'every slot is read');
});

test('a capture sees no underwater wash, the ground at the feet is never cut, and the sky follows the capture', () => {
    const volume = Reactor3D.waterVolumeUniforms();
    volume.rrWaterCount.value = 2;
    let during = null;
    Reactor3D.withSkyAt(null, null, () => { during = volume.rrWaterCount.value; });
    assert.equal(during, 0, 'a mirror eye under its lake drew murky water');
    assert.equal(volume.rrWaterCount.value, 2, 'and the wash comes back after');
    volume.rrWaterCount.value = 0;
    const lighting = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
    assert.match(lighting, /if \(abs\(rrFaceN\.y\) >= 0\.55 && vRRWorldPos\.y <= rrF\.y \+ 0\.5\) continue;/, 'ground about the character is never in the way');
});

test('the battle room reflects through the map\'s own frame step, its props and lead actor included', () => {
    const main = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const battle = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_battle_room.js'), 'utf8');
    assert.match(main, /Reactor3D\.prepareReflections\(this\._renderer, mapScene, scene, this\._camera\);/, 'the map viewport');
    assert.match(battle, /R\.prepareReflections\?\.\(this\.renderer,this\.world,this\.scene,this\.camera\);\s*this\.renderer\.render\(this\.scene,this\.camera\);/, 'the battle room, right before its draw');
    assert.match(battle, /this\.world\.guestModels = \(\) => this\.models\.values\(\);/);
    const scene = Object.create(Reactor3D.MapScene.prototype);
    const tank = { object: { position: { distanceTo: () => 3 } } }, lead = { object: { position: {} } };
    scene._modelInstances = new Map();
    scene.guestModels = () => [tank, lead].values();
    scene.guestSubject = () => lead;
    assert.deepEqual(scene.reflectionHolders(), [tank, lead]);
    assert.equal(scene.reflectionSubject(), lead);
    const lighting = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
    assert.match(lighting, /if \(this\._renderer && this\._renderer !== renderer\) \{ this\._ready = false;/, 'a new renderer starts its capture over');
});
