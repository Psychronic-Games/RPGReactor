/**
 * Dialog and database previews draw only when something changes. A still
 * model used to be drawn ten or sixty times a second behind the dialogs
 * (and a paused action sequence in full every frame), which kept an
 * integrated GPU busy for a picture that never changed. Each preview now
 * draws while it is live (orbiting, easing, playing, animating) and
 * otherwise once per change: an input, a resize, a theme switch, a texture
 * decoding after the first draw, or the view finishing a load on its own.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, 'src', ...parts), 'utf8');
const ModelPreview3D = require(path.join(repoRoot, 'src', 'utils', 'ModelPreview3D.js'));
const vm = require('node:vm');

function withGlobals(t, values) {
    const previous = {};
    for (const [key, value] of Object.entries(values)) {
        previous[key] = Object.getOwnPropertyDescriptor(global, key);
        Object.defineProperty(global, key, { value, configurable: true, writable: true });
    }
    t.after(() => {
        for (const [key, descriptor] of Object.entries(previous)) {
            if (descriptor) Object.defineProperty(global, key, descriptor);
            else delete global[key];
        }
    });
}

function previewFixture(t) {
    let theme = 'dark';
    const frames = [];
    const observers = [];
    const renders = [];
    const texture = { isTexture: true, version: 0 };
    const node = { isMesh: true, userData: {}, material: { map: texture } };
    const template = {
        userData: { glbSize: { x: 1, y: 1, z: 1 }, glbTextures: [texture] },
        traverse(fn) { fn(node); }
    };
    const vector = () => ({ set() {}, setScalar() {} });
    class Group {
        constructor() { this.children = []; this.position = vector(); this.scale = vector(); }
        add(child) { this.children.push(child); }
        traverse(fn) { fn(this); for (const child of this.children) child.traverse(fn); }
    }
    let setSize = 0;
    withGlobals(t, {
        document: { documentElement: { getAttribute: () => theme } },
        getComputedStyle: () => ({ getPropertyValue: () => '#101010' }),
        window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
        cancelAnimationFrame: () => {},
        ResizeObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.gone = true; } },
        THREE: {
            Scene: class { add() {} },
            Group,
            Color: class { copy() { return this; } },
            WebGLRenderer: class { setPixelRatio() {} getPixelRatio() { return 1; } setSize() { setSize++; } dispose() {} }
        },
        Reactor3D: {
            SHADER_LIGHTS: 4,
            createCamera: () => ({ updateProjectionMatrix() {} }),
            aimCamera() {},
            renderScene: () => renders.push(1),
            cloneModelTemplate: () => ({ scale: vector(), position: vector(), traverse(fn) { fn(node); } })
        }
    });
    const canvas = {
        width: 0, height: 0, style: {},
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect: () => ({ width: 200, height: 100 })
    };
    const preview = new ModelPreview3D(canvas);
    preview.replaceTemplate(template);
    let now = 1000;
    const step = (ms = 16) => { now += ms; const fn = frames.shift(); fn(now); };
    return { preview, canvas, texture, renders, observers, step, setTheme: value => { theme = value; }, setSizeCalls: () => setSize };
}

test('a still model preview is drawn once, then only when something changes', t => {
    const f = previewFixture(t);
    f.step();
    assert.equal(f.renders.length, 1, 'the first frame draws');
    assert.equal(f.setSizeCalls(), 1, 'the first frame sizes the drawing buffer');
    for (let i = 0; i < 30; i++) f.step();
    assert.equal(f.renders.length, 1, 'half a second of a still model draws nothing more (it used to repaint at 10 Hz)');

    f.texture.version++;
    f.step();
    assert.equal(f.renders.length, 2, 'a texture decoding after the first draw is shown');
    f.step();
    assert.equal(f.renders.length, 2);

    f.setTheme('light');
    f.step();
    assert.equal(f.renders.length, 3, 'a theme switch repaints the backdrop');

    f.canvas.getBoundingClientRect = () => ({ width: 300, height: 100 });
    f.step();
    assert.equal(f.renders.length, 3, 'the canvas is not measured every frame');
    f.observers[0].fn();
    f.step();
    assert.equal(f.setSizeCalls(), 2, 'a reported resize measures and resizes');
    assert.equal(f.renders.length, 4, 'and draws the new size');

    f.preview.wheel({ preventDefault() {}, deltaY: 100 });
    const before = f.renders.length;
    for (let i = 0; i < 5; i++) f.step();
    assert.equal(f.renders.length, before + 5, 'zooming eases at the full frame rate');
    for (let i = 0; i < 120; i++) f.step();
    const settled = f.renders.length;
    for (let i = 0; i < 30; i++) f.step();
    assert.equal(f.renders.length, settled, 'and the preview goes quiet once the camera arrives');

    f.preview.dispose();
    assert.equal(f.observers[0].gone, true, 'disposing stops watching the canvas size');
});

test('a paused action sequence paints on change, and on what the room view finishes loading', () => {
    const DatabaseActionSequenceEditor = vm.runInNewContext(read('database', 'DatabaseActionSequenceEditor.js') + '\nDatabaseActionSequenceEditor',
        { performance: { now: () => 5000 }, ModelPreview3D, window: {}, console });
    const editor = Object.create(DatabaseActionSequenceEditor.prototype);
    const texture = { isTexture: true, version: 1 };
    const record = { object: null };
    const view = { models: new Map([['user', record]]), billboards: new Map(), effectPlays: new Map() };
    editor.previewDirty = false;
    editor.preview = null;
    assert.equal(editor.previewNeedsPaint(5000), true, 'no view yet: the loading message paints once');
    assert.equal(editor.previewNeedsPaint(5016), false, 'and then rests');
    editor.preview = view;
    assert.equal(editor.previewNeedsPaint(5032), true, 'the room view arriving paints');
    assert.equal(editor.previewNeedsPaint(5048), true, 'its first shape is recorded with a paint');
    assert.equal(editor.previewNeedsPaint(5064), false, 'a still, paused room does not paint');
    record.object = { traverse(fn) { fn({ material: { map: texture } }); }, userData: {} };
    assert.equal(editor.previewNeedsPaint(5080), true, 'a model finishing its load paints');
    assert.equal(editor.previewNeedsPaint(5096), false);
    texture.version++;
    assert.equal(editor.previewNeedsPaint(5112), true, 'its texture decoding paints');
    assert.equal(editor.previewNeedsPaint(5128), false);
    view.effectPlays.set('fx', { pending: true });
    assert.equal(editor.previewNeedsPaint(5144), true, 'an effect starting to load paints');
    view.effectPlays.get('fx').pending = false;
    assert.equal(editor.previewNeedsPaint(5160), true, 'and so does it finishing');
    assert.equal(editor.previewNeedsPaint(5176), false);
    editor.invalidatePreview();
    assert.equal(editor.previewNeedsPaint(5200), true, 'an input asks for frames');
    editor.previewDirty = false;
    assert.equal(editor.previewNeedsPaint(5900), true, 'for a second, while the edit settles');
    assert.equal(editor.previewNeedsPaint(6100), false);
    record.media = new Map([['screen', {}]]);
    assert.equal(editor.previewNeedsPaint(6116), true, 'a movie surface plays in real time and keeps the room live');
    assert.equal(editor.previewNeedsPaint(6132), true);
});

test('the preview loops are wired to their invalidation, not a timer', () => {
    const sequence = read('database', 'DatabaseActionSequenceEditor.js');
    assert.match(sequence, /if\(this\.playing\|\|this\.previewNeedsPaint\(now\)\)\{this\.previewDirty=false;this\.paint\(\);\}/,
        'a paused sequence paints only when asked');
    assert.match(sequence, /dispose\(\)\{this\.stopPreviewInput\(\);/, 'its document listeners go with the editor');
    assert.match(read('database', 'ActionSequencePreview.js'), /new ResizeObserver\(\(\)=>\{this\.resize\(\);this\.editor\.invalidatePreview\?\.\(\);\}\)/,
        'a resize clears the canvas, so it asks for a paint');

    const page = read('event', 'EventPageEditor.js');
    const pageTick = page.slice(page.indexOf('const tick = () => {', page.indexOf('_renderModelPreview')));
    assert.match(pageTick, /^const tick = \(\) => \{[\s\S]*?if \(sizeDirty \|\| !unwatchSize\) \{[\s\S]*?getBoundingClientRect\(\)/,
        'the event page model is measured on a resize only');
    assert.match(pageTick, /if \(dirty\) \{[\s\S]*?dirty = ModelPreview3D\.render\(renderer, scene, camera\);\s*\}/,
        'and drawn only when its picture changed, or while the draw left the model out');
    for (const [name, source] of [['EventPageEditor', page], ['ModelGraphicPicker', read('event', 'ModelGraphicPicker.js')], ['Database3DEditor', read('database', 'Database3DEditor.js')]]) {
        assert.doesNotMatch(source, /Reactor3D\.renderScene\(/, `${name} draws its still preview through ModelPreview3D.render, which knows when a mesh sat the draw out`);
    }

    const picker = read('event', 'ModelGraphicPicker.js');
    assert.match(picker, /for \(const type of ModelGraphicPicker\.PREVIEW_INPUT_EVENTS\) \{\s*modal\.addEventListener\(type, \(\) => \{ this\._lastInputAt = performance\.now\(\); \}, true\);/,
        'any input in the model picker keeps its preview live for a moment');
    assert.match(picker, /if \(sizeDirty \|\| !this\._unwatchPreviewSize\) \{/);

    const db3d = read('database', 'Database3DEditor.js');
    assert.match(db3d, /for \(const type of Database3DEditor\.PREVIEW_INPUT_EVENTS\) document\.addEventListener\(type, this\._previewInputListener, true\);/);
    assert.match(db3d, /for \(const type of Database3DEditor\.PREVIEW_INPUT_EVENTS\) document\.removeEventListener\(type, this\._previewInputListener, true\);/);
    assert.match(db3d, /_refreshPartVisuals\(\) \{\s*if \(!this\._scene \|\| typeof THREE === 'undefined'\) return;\s*this\._previewDirty = true;/,
        'a hover that changes a part outline asks for a frame');
    assert.match(db3d, /if \(sizeDirty \|\| !this\._unwatchPreviewSize\) \{/, 'the Database 3D canvas is measured on a resize only');

    const battle = read('battle', 'BattlePresentationEditor.js');
    assert.match(battle, /const scale=canvas\.width\/\(sizeObserver\?cssWidth:Math\.max\(1,canvas\.clientWidth\)\);/,
        'the troop preview reads its CSS width on a resize, not every frame');
    assert.match(battle, /if\(!stageSize\|\|!stageObserver\)stageSize=\{width:Math\.max\(1,stage\.clientWidth\),height:Math\.max\(1,stage\.clientHeight\)\};/,
        'the room setup dialog measures its stage on a resize, not every frame');

    const animation = read('database', 'DatabaseAnimationEditor.js');
    assert.match(animation, /if \(renderFrameCount === 1\) \{\s*const err = gl\.getError\(\);/,
        'playback asks the GPU for errors on the first frame only');
    assert.doesNotMatch(animation, /const err = gl\.getError\(\);\s*if \(err !== gl\.NO_ERROR && renderFrameCount === 1\)/);
});

// The draw path leaves out a mesh whose shaders are still compiling or whose
// pictures are still uploading and shows it a frame later. A preview that
// draws once per change has no later frame: the event page's 3D model box
// stayed empty. A draw that held something back asks for another.
function warmupDraws(renders) {
    const warmup = { lastHidden: 0, holding: 0 };
    return { warmup, renderScene: () => { renders.push(warmup.holding); warmup.lastHidden = warmup.holding; } };
}

test('a still preview keeps drawing while the draw holds its model back', t => {
    const f = previewFixture(t);
    const draws = warmupDraws(f.renders);
    global.Reactor3D.renderScene = draws.renderScene;
    global.Reactor3D.ShaderWarmup = draws.warmup;
    draws.warmup.holding = 1;
    f.step();
    assert.deepEqual(f.renders, [1], 'the first draw leaves the model out (its shaders are compiling)');
    f.step();
    f.step();
    assert.deepEqual(f.renders, [1, 1, 1], 'so the preview draws again each frame');
    draws.warmup.holding = 0;
    f.step();
    assert.deepEqual(f.renders, [1, 1, 1, 0], 'until a draw shows everything');
    for (let i = 0; i < 30; i++) f.step();
    assert.equal(f.renders.length, 4, 'and then rests');
    f.preview.dispose();
});

test('the event page shows its 3D model once the shaders are ready', async t => {
    const os = require('node:os');
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-event-model-'));
    t.after(() => fs.rmSync(project, { recursive: true, force: true }));
    fs.mkdirSync(path.join(project, '3d', 'Actors', 'Guard', 'source'), { recursive: true });
    fs.writeFileSync(path.join(project, '3d', 'Actors', 'Guard', 'source', 'Guard.glb'), 'glb');

    const frames = [], renders = [];
    const draws = warmupDraws(renders);
    const vector = () => ({ set() {}, setScalar() {}, sub() {} });
    const node = { isMesh: true, userData: {}, material: {} };
    class Group {
        constructor() { this.children = []; this.position = vector(); this.scale = vector(); }
        add(child) { this.children.push(child); }
        traverse(fn) { fn(this); for (const child of this.children) child.traverse(fn); }
    }
    withGlobals(t, {
        document: { documentElement: { getAttribute: () => 'dark' } },
        getComputedStyle: () => ({ getPropertyValue: () => '#101010' }),
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
        cancelAnimationFrame: () => {},
        ResizeObserver: class { observe() {} disconnect() {} },
        ModelPreview3D,
        THREE: {
            Scene: class { add() {} },
            Group,
            Color: class { copy() { return this; } },
            Vector3: class {},
            Box3: class { constructor() { this.min = { y: 0 }; this.max = { y: 1 }; } setFromObject() { return this; } getCenter(v) { return v; } },
            WebGLRenderer: class { setPixelRatio() {} getPixelRatio() { return 1; } setSize() {} dispose() {} }
        },
        Reactor3D: {
            SHADER_LIGHTS: 4,
            extensionsLoaded: () => true,
            readModelAsync: async () => ({ userData: { glbSize: { x: 1, y: 1, z: 1 } }, traverse(fn) { fn(node); } }),
            cloneModelTemplate: () => ({ scale: vector(), position: vector(), traverse(fn) { fn(node); } }),
            applyEventModelPose() {},
            createCamera: () => ({ updateProjectionMatrix() {} }),
            aimCamera() {},
            renderScene: draws.renderScene,
            ShaderWarmup: draws.warmup
        }
    });
    withGlobals(t, { window: { devicePixelRatio: 1, THREE: global.THREE, Reactor3D: global.Reactor3D } });
    const EventPageEditor = require(path.join(repoRoot, 'src', 'event', 'EventPageEditor.js'));
    const page = Object.create(EventPageEditor.prototype);
    page.projectController = { getCurrentProject: () => ({ path: project }) };
    const canvas = { width: 0, height: 0, isConnected: true, getBoundingClientRect: () => ({ width: 380, height: 100 }) };
    const step = () => frames.shift()(0);

    draws.warmup.holding = 1;
    const built = page._renderModelPreview(canvas, { name: 'Actors/Guard', file: 'Guard', ext: '.glb' }, { image: { direction: 2 } });
    step();
    await built;
    assert.ok(page._modelPreviewRenderer, 'the preview is built');
    step();
    assert.deepEqual(renders, [1], 'the first draw leaves the model out while its shaders compile');
    step();
    assert.deepEqual(renders, [1, 1], 'so the box is drawn again');
    draws.warmup.holding = 0;
    step();
    assert.deepEqual(renders, [1, 1, 0], 'and shows the model as soon as it may be drawn');
    for (let i = 0; i < 20; i++) step();
    assert.equal(renders.length, 3, 'a still model is not drawn again after that');
    page._disposeModelPreview();
});
