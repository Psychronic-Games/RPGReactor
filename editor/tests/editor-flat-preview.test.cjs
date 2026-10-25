const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.FlatLightField2D = require('../src/utils/FlatLightField2D.js');
global.ModelPropShadows2D = require('../src/utils/ModelPropShadows2D.js');
const Preview = require('../src/utils/ModelPropsPreview2D.js');

test('missing or lost WebGL skips model painting and bounds expansion, then permits recovery', () => {
    const preview = new Preview({});
    // A previous viewport must not bypass the context check after a GPU crash.
    const viewport = {};
    preview.viewport = viewport;
    for (const renderer of [undefined, {}, { gl: {}, context: {} },
        { gl: { isContextLost: () => true }, context: { webGLVersion: 2 } }]) {
        preview.app = { renderer };
        assert.equal(preview.ensureViewport(), null);
        assert.doesNotThrow(() => preview.paint({}));
    }
    for (const renderer of [undefined, {}, { gl: { isContextLost: () => true } }]) {
        preview.app = { renderer };
        assert.doesNotThrow(() => preview.expand({}));
    }
    preview.app = { renderer: { gl: { isContextLost: () => false }, context: { webGLVersion: 2 } } };
    assert.equal(preview.ensureViewport() === viewport, true);
});

test('selection and movement retain the live sprite; replacement and removal dispose it', () => {
    global.ModelPropsManager = { specOf: p => ({ name: p.name, size: p.size }) };
    const preview = new Preview({});
    preview.bind = () => {};
    let builds = 0, disposals = 0;
    preview.load = e => { builds++; e.sprite = { marker: builds }; };
    preview.dispose = () => { disposals++; };
    const prop = { id: 1, name: 'arm', size: 3, animations: ['extend'], repeat: true };
    const sprite = preview.spriteFor(prop, 48);
    assert.equal(preview.spriteFor({ ...prop, x: 12, z: 3 }, 48), sprite);
    assert.equal(builds, 1);
    assert.notEqual(preview.spriteFor({ ...prop, name: 'bike' }, 48), sprite);
    assert.equal(disposals, 1);
    preview.sync([]);
    assert.equal(preview.entries.size, 0);
    assert.equal(disposals, 2);
    delete global.ModelPropsManager;
});

test('a model finishing loading after its map closes cannot build a stale instance', async () => {
    global.ModelPropsManager = { specOf: p => p };
    global.Reactor3D = { normalizeModelSpec: p => p };
    let finish;
    global.RREventPreviewModels = {
        templateFor: () => new Promise(resolve => { finish = resolve; }),
        instance: () => { throw new Error('stale instance was built'); }
    };
    const preview = new Preview({ project: () => ({ path: '/demo' }), mapEditor3D: () => null });
    const entry = { prop: { id: 1, name: 'arm' } };
    preview.entries.set(1, entry);
    const pending = preview.load(entry);
    preview.clear();
    finish({ userData: {} });
    await pending;
    assert.equal(entry.object, undefined);
    assert.equal(preview.entries.size, 0);
    delete global.ModelPropsManager; delete global.Reactor3D; delete global.RREventPreviewModels;
});

test('closing the lighting tool preserves the preview overlay and animation loop', () => {
    const context = { document: { removeEventListener() {} }, window: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../src/LightingManager.js'), 'utf8') + '\nthis.Manager = LightingManager;', context);
    const manager = new context.Manager({});
    let cleared = 0;
    const overlay = { markers: { clear() { cleared++; } } };
    manager._overlay = overlay; manager._raf = 42;
    for (const name of ['_unbindPointer', '_unbind3DPointer', '_destroyPanel', '_clear3D']) manager[name] = () => {};
    manager._deactivate();
    assert.equal(manager._overlay, overlay);
    assert.equal(manager._raf, 42);
    assert.equal(cleared, 1);
});

test('lights on a stationary model keep flickering without repainting its texture', () => {
    const keys = ['document', 'MapEditor3D', 'RREventPreviewModels', 'Reactor3D', 'THREE'];
    const saved = keys.map(key => global[key]);
    try {
        global.document = { hidden: false };
        global.MapEditor3D = class { animateModels() {} };
        global.THREE = { Vector3: class { constructor() { this.x = this.y = 0; } project() { return this; } } };
        global.RREventPreviewModels = { texturesDecoded: () => true };
        const frames = [];
        global.Reactor3D = {
            effectLight: () => ({ radius: 3, intensity: 1, yaw: 0 }),
            animateLight: (_spec, frame) => { frames.push(frame); return { radius: 3, intensity: frame / 100 }; },
            effectAnchorWorld: (_object, _effect, point) => point
        };
        const parent = {};
        const manager = { currentMap: {}, tilemapManager: { container: parent },
            container: { toGlobal: p => p, worldTransform: { a: 1 } }, mapEditor3D: () => null };
        const preview = new Preview(manager);
        preview.app = { stage: { children: [parent] }, renderer: { resolution: 1 }, screen: { width: 100, height: 100 } };
        let paints = 0; preview.paint = () => { paints++; };
        preview.entries.set(1, { sprite: { x: 0, y: 0, position: { x: 0, y: 0 } },
            prop: { id: 1 }, object: {}, camera: {}, radius: 1, tw: 48, density: 1.25, decoded: true, effects: [{ name: 'lamp', light: {} }] });
        preview.tick(1000); const first = preview.lights[0].intensity;
        preview.tick(2000);
        assert.deepEqual(frames, [60, 120]);
        assert.notEqual(preview.lights[0].intensity, first);
        assert.equal(paints, 0);
    } finally {
        keys.forEach((key, i) => { if (saved[i] === undefined) delete global[key]; else global[key] = saved[i]; });
    }
});

test('carried lights reuse a layer behind their emitter and follow prop reordering', () => {
    class Container {
        constructor() { this.children = []; }
        getChildIndex(child) { return this.children.indexOf(child); }
        removeChild(child) { this.children.splice(this.getChildIndex(child), 1); child.parent = null; }
        addChildAt(child, index) { child.parent?.removeChild(child); this.children.splice(index, 0, child); child.parent = this; }
        setChildIndex(child, index) { this.removeChild(child); this.addChildAt(child, index); }
    }
    const context = { PIXI: { Container } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../src/LightingManager.js'), 'utf8') + '\nthis.Manager = LightingManager;', context);
    const manager = new context.Manager({});
    const parent = new Container(), back = {}, emitter = {}, front = {};
    [back, emitter, front].forEach((sprite, i) => parent.addChildAt(sprite, i));
    const props = { _sprites: new Map([[1, emitter]]) }, state = { glow: {} };
    const group = manager._glowParent({ sourcePropId: 1 }, state, props);
    assert.deepEqual(parent.children, [back, group, emitter, front]);
    assert.equal(manager._glowParent({ sourcePropId: 1 }, state, props), group);
    assert.equal(manager._glowParent({}, state, props), state.glow, 'unattached lights keep their normal layer');
    parent.removeChild(group); parent.setChildIndex(emitter, 0);
    assert.equal(manager._glowParent({ sourcePropId: 1 }, state, props), group);
    assert.deepEqual(parent.children, [group, emitter, back, front]);
    assert.equal(manager._propGlowGroups.size, 1);
});

test('shadow caches ignore flicker intensity and radius jitter, redraw for a moved caster, and release disabled lights', () => {
    const Shadows = require('../src/utils/ModelPropShadows2D.js');
    const prop = { id: 1, x: 2, y: 2, z: 0 };
    const preview = { manager: { currentMap: { width: 50, height: 50 } }, entries: new Map([[1, { prop, object: { uuid: 'model' }, radius: 2 }]]) };
    const shadows = new Shadows(preview);
    let paints = 0, releases = 0;
    shadows.paint = state => { paints++; state.sprite = {}; };
    shadows.release = () => { releases++; };
    const light = { id: 'lamp', shadow: true, type: 'point', x: 3, y: 3, height: 4, radius: 10, priorityRadius: 10, intensity: 1 };
    shadows.update([light], 100); shadows.update([{ ...light, intensity: 0.5, radius: 9.8 }], 200);
    assert.equal(paints, 1);
    prop.x++;
    shadows.update([light], 300); assert.equal(paints, 2);
    shadows.update([{ ...light, shadow: false }], 400);
    assert.equal(shadows.states.size, 0); assert.equal(releases, 1);
});

test('video readiness uses decoded dimensions, not the element layout width', () => {
    const models = require('../src/utils/EventPreviewModels.js');
    const image = { width: 0, videoWidth: 640, readyState: 2 };
    const model = { userData: { glbTextures: [{ image }] } };
    assert.equal(models.texturesDecoded(model), true);
    image.readyState = 1;
    assert.equal(models.texturesDecoded(model), false);
});

test('light gradients interpolate and cache their dithered texture', () => {
    let uploads = 0, pixels;
    const context = { Reactor3D: {}, PIXI: { Texture: { from() { uploads++; return { source: {} }; } } },
        document: { createElement: () => ({ getContext: () => ({
            createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: image => { pixels = image.data; }
        }) }) } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../src/LightingManager.js'), 'utf8') + '\nthis.Manager = LightingManager;', context);
    const manager = new context.Manager({});
    const texture = manager._lightTexture('round');
    assert.equal(texture.source.scaleMode, 'linear');
    assert.equal(manager._lightTexture('round'), texture); assert.equal(uploads, 1);
    assert.equal(pixels[3], 0, 'outside the light stays transparent');
    const levels = new Set();
    for (let x = 512; x < 1024; x++) levels.add(pixels[(512 * 1024 + x) * 4 + 3]);
    assert.ok(levels.size > 180, 'smooth falloff spans the available alpha levels');
});

test('downward spots make height-dependent circles independent of yaw, and upward spots miss the floor', () => {
    const Field = global.FlatLightField2D, map = { width: 100, height: 100 };
    const light = { type: 'spot', shadowSource: { x: 50, y: 4, z: 50 }, radius: 80, angle: 60, pitch: -90, yaw: 0 };
    const a = Field.bounds(light, map), b = Field.bounds({ ...light, yaw: 147 }, map);
    assert.ok(Math.abs(a.width - 8 * Math.tan(Math.PI / 6)) < 1e-8);
    assert.ok(Math.abs(a.width - a.height) < 1e-8);
    for (const key of Object.keys(a)) assert.ok(Math.abs(a[key] - b[key]) < 1e-8);
    const tall = Field.bounds({ ...light, shadowSource: { x: 50, y: 8, z: 50 } }, map);
    assert.ok(Math.abs(tall.width - a.width * 2) < 1e-8);
    assert.equal(Field.bounds({ ...light, pitch: 40 }, map), null);
    assert.equal(Field.bounds({ ...light, radius: 3 }, map), null);
});

test('the bounded footprint contains every ground point reached by pitched cones and beams', () => {
    const Field = global.FlatLightField2D, map = { width: 40, height: 40 };
    for (const type of ['point', 'spot', 'beam']) for (const pitch of [-90, -70, -45, -10, 10, 60]) for (const yaw of [0, 63, 180]) for (const height of [0.25, 4]) {
        const light = { type, shadowSource: { x: 20, y: height, z: 20 }, radius: 18, angle: 70, width: 2, pitch, yaw };
        const b = Field.bounds(light, map), aim = Field.aim(light);
        for (let x = 0.25; x < 40; x += 0.5) for (let z = 0.25; z < 40; z += 0.5) {
            const d = [x - 20, -height, z - 20], dist = Math.hypot(...d), dot = d[0] * aim.x + d[1] * aim.y + d[2] * aim.z;
            const lit = dist < 18 && (type === 'point' || (type === 'spot' ? dot / dist > Math.cos(35 * Math.PI / 180)
                : dot >= 0 && dot <= 18 && Math.hypot(d[0] - aim.x * dot, d[1] - aim.y * dot, d[2] - aim.z * dot) < 1));
            if (lit) assert.ok(b && x >= b.x - 1e-8 && x <= b.x + b.width + 1e-8 && z >= b.y - 1e-8 && z <= b.y + b.height + 1e-8,
                `${type}, pitch ${pitch}, yaw ${yaw} clipped ${x},${z}`);
        }
    }
});

test('shadow culling keeps projected intersections and skips objects above the source or outside its footprint', () => {
    const shadows = new global.ModelPropShadows2D({});
    const source = { x: 0, y: 10, z: 0 }, bounds = { x: 2, y: 2, width: 2, height: 2 };
    const entry = { prop: { x: 1, y: 1, z: 0 }, casterBox: { min: { x: 0, y: 4, z: 0 }, max: { x: 1, y: 5, z: 1 } } };
    assert.equal(shadows.intersects(entry, source, bounds), true);
    entry.prop.x = 20; assert.equal(shadows.intersects(entry, source, bounds), false);
    entry.prop.x = 1; entry.prop.z = 10; assert.equal(shadows.intersects(entry, source, bounds), false);
    entry.prop.z = 5; assert.equal(shadows.intersects(entry, source, bounds), true, 'crossing the source plane is kept conservatively');
});

test('replacing a shadow mask unbinds its source before destruction', () => {
    const source = { _gpuData: { 7: {} } }, empty = {};
    const uniforms = { uHasShadow: 1 };
    const sprite = { shader: { resources: { uShadow: source, lightUniforms: { uniforms } } } };
    const saved = global.PIXI;
    global.PIXI = { Texture: { EMPTY: { source: empty } } };
    try {
        const shadows = new global.ModelPropShadows2D({
            app: { renderer: { uid: 7 } }, manager: { projectController: { lightingManager: { _glowSprites: [sprite] } } }
        });
        let destroyed = false;
        shadows.release({ texture: { source, destroy() {
            assert.equal(sprite.shader.resources.uShadow, empty);
            assert.equal(uniforms.uHasShadow, 0);
            assert.equal(source._gpuData[7], undefined);
            destroyed = true;
        } } });
        assert.ok(destroyed);
    } finally { if (saved === undefined) delete global.PIXI; else global.PIXI = saved; }
});

test('flat model materials keep their own lighting when another preview changes shared uniforms', t => {
    const previous = global.Reactor3D;
    global.Reactor3D = { SHADER_LIGHTS: 32 };
    t.after(() => { if (previous === undefined) delete global.Reactor3D; else global.Reactor3D = previous; });
    const sharedCount = { value: 12 }, sharedAmbient = { value: [0.2, 0.1, 0.3] };
    const material = { __reactorLit: true, customProgramCacheKey: () => 'model',
        onBeforeCompile(shader) { shader.uniforms = { rrLightCount: sharedCount, rrAmbient: sharedAmbient }; } };
    const preview = new Preview({});
    preview.isolateLighting({ traverse: fn => fn({ material }) });
    const shader = {}; material.onBeforeCompile(shader);
    sharedCount.value = 0; sharedAmbient.value.fill(0);
    assert.equal(shader.uniforms.rrLightCount.value, 0);
    assert.deepEqual(Array.from(shader.uniforms.rrAmbient.value), [1, 1, 1]);
    assert.notEqual(shader.uniforms.rrAmbient, sharedAmbient);
});


test('flat surfaces use world-height lights even when their floor footprint is empty', t => {
    const previous = global.Reactor3D;
    const R = require('../../runtime/reactor_3d.js');
    global.Reactor3D = R;
    t.after(() => { if (previous === undefined) delete global.Reactor3D; else global.Reactor3D = previous; });
    const preview = new Preview({});
    const entry = { prop: { x: 20, y: 30, z: 4 }, radius: 8,
        lighting: preview.isolateLighting({ traverse() {} }) };
    const light = { type: 'spot', x: 21, y: 31, height: 10, radius: 5,
        colour: 0xff0080, intensity: 2, yaw: 70, pitch: -35, angle: 60 };
    assert.equal(FlatLightField2D.bounds(light, { width: 100, height: 100 }), null);
    const shared = R.lightUniforms(), before = Array.from(shared.rrLightPos.value);
    preview.syncLighting(entry, [light], { intensity: 0.2, colour: 0xffffff });
    assert.equal(entry.lighting.rrLightCount.value, 1);
    assert.deepEqual(Array.from(entry.lighting.rrLightPos.value.slice(0, 4)), [1, 6, 1.5, 5]);
    assert.ok(entry.lighting.rrLightAim.value[0] < 0, 'editor yaw is converted to runtime yaw');
    assert.deepEqual(Array.from(shared.rrLightPos.value), before, 'packing never mutates another viewport');
    entry.dirty = false;
    preview.syncLighting(entry, [light], { intensity: 0.2, colour: 0xffffff });
    assert.equal(entry.dirty, false, 'unchanged light fields reuse their texture');
    preview.syncLighting(entry, [{ ...light, intensity: 0.5 }], { intensity: 0.2, colour: 0xffffff });
    assert.equal(entry.dirty, true, 'flicker repaints a static model');
    entry.prop.x = 100;
    preview.syncLighting(entry, [light], { intensity: 0.2, colour: 0xffffff });
    assert.equal(entry.lighting.rrLightCount.value, 0, 'moving beyond reach removes illumination');
    entry.prop.x = 20;
    preview.syncLighting(entry, [{ ...light, shadowSource: { x: 20.5, y: 6, z: 30.5 } }], { intensity: 1 });
    assert.deepEqual(Array.from(entry.lighting.rrLightPos.value.slice(0, 3)), [0, 2, 0], 'carried lights use their world anchor rather than projected screen coordinates');
});

test('a vehicle on the 2D map is posed at its heading along its model\'s front, as the 3D view poses it', async () => {
    global.ModelPropsManager = { specOf: p => ({ name: p.name }) };
    const posed = [];
    global.Reactor3D = { normalizeModelSpec: p => p, Vehicles: { pose: (holder, character, object) => posed.push([character._rrVehicle, character._rrYaw, object.id]) } };
    // The build stops after posing: what follows needs three.js.
    global.RREventPreviewModels = { templateFor: async () => ({ userData: {} }), instance: () => ({ id: 'bike' }) };
    global.THREE = { Scene: class { constructor() { throw new Error('built'); } } };
    const preview = new Preview({ project: () => ({ path: '/demo' }), mapEditor3D: () => null });
    preview.isolateLighting = () => null;
    for (const prop of [{ id: -5, name: 'bike', vehicle: { type: 11, yaw: 90 } }, { id: -6, name: 'crate' }]) {
        const entry = { prop };
        preview.entries.set(prop.id, entry);
        await preview.load(entry);
    }
    assert.deepEqual(posed, [[11, Math.PI / 2, 'bike']], 'only the vehicle is posed, at its yaw');
    const key = id => preview.entries.get(id)?.key;
    preview.load = () => {};
    preview.entries.clear();
    preview.spriteFor({ id: 1, name: 'bike', vehicle: { type: 11, yaw: 90 } }, 48); const east = key(1);
    preview.spriteFor({ id: 1, name: 'bike', vehicle: { type: 11, yaw: 180 } }, 48);
    assert.notEqual(key(1), east, 'turning the vehicle draws it again');
    delete global.ModelPropsManager; delete global.Reactor3D; delete global.RREventPreviewModels; delete global.THREE;
});

test('a prop painted while a part sat out the draw is painted again until nothing sits out', () => {
    const hadReactor = 'Reactor3D' in global, previous = global.Reactor3D;
    const warmup = { lastHidden: 0 };
    global.Reactor3D = { ShaderWarmup: warmup };
    try {
        const preview = new Preview({ container: { worldTransform: { a: 1 } } });
        preview.app = { renderer: { resolution: 1, gl: { MAX_TEXTURE_SIZE: 1, getParameter: () => 4096 } } };
        let hidden = 1;
        // The draw holds out the mesh whose picture is still going up, as ShaderWarmup.hide does.
        preview.ensureViewport = () => ({ renderInto: () => { warmup.lastHidden = hidden; } });
        preview.expand = () => {};
        const entry = { radius: 1, tw: 48, size: 120, target: {}, sprite: {}, dirty: true };
        warmup.lastHidden = 3; // left over from another view's draw
        preview.paint(entry);
        assert.equal(entry.dirty, true, 'the picture is owed again while its texture is not on the GPU');
        hidden = 0;
        preview.paint(entry);
        assert.equal(entry.dirty, false, 'a draw with nothing held out settles');
        assert.equal(entry.draws, 2);
        // A stale count from another renderer does not keep a settled prop repainting.
        warmup.lastHidden = 5;
        preview.ensureViewport = () => ({ renderInto: () => {} });
        preview.paint(entry);
        assert.equal(entry.dirty, false);
    } finally {
        if (hadReactor) global.Reactor3D = previous; else delete global.Reactor3D;
    }
});
