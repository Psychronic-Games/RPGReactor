/**
 * The 2D map is drawn when it changes, not on every animation frame.
 *
 * PIXI's Application renders its whole stage each frame for as long as it
 * runs; on an integrated GPU that kept the laptop busy redrawing a still map,
 * even behind the Database window. MapRenderScheduler (TilemapManager.js)
 * gates that render. These tests pin what must still draw a frame — a missed
 * one leaves the map showing something that is no longer true — and what no
 * longer does, together with the rest of the 2D view's per-frame trimming:
 * tile layers out of PIXI's hit test, wheel steps and resizes once a frame,
 * a clip instead of a canvas reallocation mid-gesture, GL limits asked once,
 * the event hover outline rebuilt only on a new tile, and the flat prop
 * preview idling while its props and lights are still.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const src = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');

function loadTilemap(context = {}) {
    return vm.runInNewContext(`${src('TilemapManager.js')}\n({ TilemapManager, MapRenderScheduler })`, {
        console: { log() {}, warn() {}, error() {} },
        queueMicrotask,
        ...context
    });
}

/** A stage whose render groups behave like PIXI v8's: queues grow on change and a render consumes them. */
function fakeApp() {
    const group = () => ({ structureDidChange: false, childrenRenderablesToUpdate: { index: 0 },
        childrenToUpdate: { 1: { index: 0 } }, renderGroupChildren: [], isCachedAsTexture: false, textureNeedsUpdate: false });
    const root = group();
    const listeners = [];
    const app = {
        stage: { renderGroup: root },
        renders: 0,
        ticker: {
            started: true,
            add(fn, context, priority) { listeners.push({ fn, context, priority }); },
            remove(fn, context) {
                const at = listeners.findIndex(l => l.fn === fn && l.context === context);
                if (at >= 0) listeners.splice(at, 1);
            },
            tick() { for (const l of [...listeners]) l.fn.call(l.context); },
            listeners
        },
        renderer: {
            render() {},
            resize(width, height) { app.screen = { width, height }; }
        },
        screen: { width: 100, height: 100 },
        start() { app.ticker.started = true; },
        render() {
            app.renders++;
            // A render consumes every queue it processes.
            const consume = g => {
                g.structureDidChange = false;
                g.childrenRenderablesToUpdate.index = 0;
                for (const d in g.childrenToUpdate) g.childrenToUpdate[d].index = 0;
                g.renderGroupChildren.forEach(consume);
            };
            consume(root);
        }
    };
    app.ticker.add(app.render, app, -25);
    return { app, root, group };
}

function scheduled(options = {}) {
    const { MapRenderScheduler } = loadTilemap();
    const { app, root, group } = fakeApp();
    let now = 0;
    const scheduler = new MapRenderScheduler(app, { now: () => now, ...options }).install();
    return { MapRenderScheduler, app, root, group, scheduler, advance: ms => { now += ms; }, frame: () => app.ticker.tick() };
}

test('the ticker draws the map only when something changed', () => {
    const { app, root, frame, advance } = scheduled();
    assert.equal(app.ticker.listeners.some(l => l.fn === app.render), false, "PIXI's every-frame render is off the ticker");

    frame();
    assert.equal(app.renders, 1, 'the first frame draws');
    for (let i = 0; i < 30; i++) { advance(16); frame(); }
    assert.equal(app.renders, 1, 'a still map is not redrawn');

    root.childrenToUpdate[1].index++;
    frame();
    assert.equal(app.renders, 2, 'a moved or shown display object draws a frame');

    root.childrenRenderablesToUpdate.index++;
    frame();
    assert.equal(app.renders, 3, 'a re-textured or redrawn sprite draws a frame');

    root.structureDidChange = true;
    frame();
    assert.equal(app.renders, 4, 'an added or removed child draws a frame');

    app.requestRender();
    frame();
    assert.equal(app.renders, 5, 'an explicit request draws a frame');
    frame();
    assert.equal(app.renders, 5);
});

test('changes inside nested render groups count, and work a render leaves queued does not loop', () => {
    const { app, root, group, frame } = scheduled();
    const layer = group();
    root.renderGroupChildren.push(layer);
    frame();
    const drawn = app.renders;
    layer.childrenToUpdate[1].index++;
    frame();
    assert.equal(app.renders, drawn + 1, 'a cached layer being edited draws');

    // A cached layer PIXI did not redraw keeps its queue; that is the
    // baseline, not a change, so it must not draw every frame forever.
    app.render = (render => () => { render(); layer.childrenToUpdate[1].index = 3; })(app.render);
    app.requestRender();
    frame();
    const settled = app.renders;
    frame(); frame();
    assert.equal(app.renders, settled);
});

test('pixels changed under an unchanged sprite still reach the screen', () => {
    const { MapRenderScheduler, app, frame } = scheduled();
    frame();
    const drawn = app.renders;
    MapRenderScheduler.textureUpdates++;
    frame();
    assert.equal(app.renders, drawn + 1, 'a canvas or video source update draws');

    app.renderer.render({ container: {}, target: {} });
    frame();
    assert.equal(app.renders, drawn + 2, 'rendering into a texture draws');

    let counted = 0;
    const PIXI = { TextureSource: class { update() { counted++; } } };
    MapRenderScheduler.watchTextureSources(PIXI);
    MapRenderScheduler.watchTextureSources(PIXI);
    const before = MapRenderScheduler.textureUpdates;
    new PIXI.TextureSource().update();
    assert.equal(counted, 1, 'the original update still runs, once');
    assert.equal(MapRenderScheduler.textureUpdates, before + 1);
});

test('animations keep drawing while registered, and a slow floor catches anything unannounced', () => {
    const { app, frame, advance } = scheduled();
    frame();
    const drawn = app.renders;
    app.setAnimating('fx', true);
    frame(); frame(); frame();
    assert.equal(app.renders, drawn + 3);
    app.setAnimating('fx', false);
    frame();
    frame();
    assert.equal(app.renders, drawn + 4, 'one last frame when it stops, then quiet');
    advance(999); frame();
    assert.equal(app.renders, drawn + 4);
    advance(1); frame();
    assert.equal(app.renders, drawn + 5, 'the one-second floor');
});

test('nothing is drawn under the Database window, and the first frame after it is', () => {
    let covered = false;
    const { app, root, frame, advance } = scheduled({ isCovered: () => covered });
    frame();
    const drawn = app.renders;
    covered = true;
    root.childrenToUpdate[1].index++;
    app.requestRender();
    for (let i = 0; i < 10; i++) { advance(500); frame(); }
    assert.equal(app.renders, drawn, 'covered: no frames at all, not even the floor');
    covered = false;
    frame();
    assert.equal(app.renders, drawn + 1);
});

test('a resized canvas is redrawn before the frame is shown, but not while the 3D view owns it', async () => {
    const { app, frame } = scheduled();
    frame();
    const drawn = app.renders;
    app.renderer.resize(50, 40);
    app.renderer.resize(60, 40);
    await Promise.resolve();
    assert.equal(app.renders, drawn + 1, 'one redraw after the caller finishes, however many resizes');

    app.ticker.started = false;
    app.renderer.resize(70, 40);
    await Promise.resolve();
    assert.equal(app.renders, drawn + 1, 'the stopped 2D ticker means three.js has the canvas');
    app.start();
    frame();
    assert.equal(app.renders, drawn + 2, 'coming back from 3D draws');
});

test('input over the map, keys and a restored context ask for a frame', () => {
    const { MapRenderScheduler } = loadTilemap();
    const { app } = fakeApp();
    const target = () => {
        const handlers = {};
        return { handlers, addEventListener(type, fn) { handlers[type] = fn; }, removeEventListener(type) { delete handlers[type]; } };
    };
    const element = target();
    app.canvas = target();
    const scheduler = new MapRenderScheduler(app, { now: () => 0 }).install({ inputElement: element });
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'wheel']) {
        scheduler.dirty = false;
        element.handlers[type]();
        assert.equal(scheduler.dirty, true, type);
    }
    scheduler.dirty = false;
    app.canvas.handlers.webglcontextrestored();
    assert.equal(scheduler.dirty, true);
    scheduler.destroy();
    assert.deepEqual(Object.keys(element.handlers), []);
});

test('the project controller installs the scheduler and resizes the renderer once a frame', () => {
    const source = src('ProjectController.js');
    assert.match(source, /new MapRenderScheduler\(this\.app, \{[\s\S]*?isCovered: \(\) => !!databaseViewer\(\)\?\.classList\?\.contains\('active'\)[\s\S]*?\}\)\.install\(\{ inputElement: container \}\)/);
    assert.match(source, /if \(resizeFrame !== null\) return;\s*resizeFrame = requestAnimationFrame\(/);
});

function tilemapFixture(context = {}) {
    const { TilemapManager } = loadTilemap(context);
    const manager = Object.create(TilemapManager.prototype);
    manager.currentMap = { width: 25, height: 25 };
    manager.TILE_SIZE = manager.TILE_WIDTH = manager.TILE_HEIGHT = 48;
    manager.container = { x: 0, y: 0, scale: { x: 1, y: 1, set(x, y) { this.x = x; this.y = y; } } };
    const resizes = [];
    manager.app = { screen: { width: 800, height: 600 }, canvas: { style: {} }, renderer: {
        resize(width, height) { resizes.push([width, height]); manager.app.screen = { width, height }; }
    } };
    manager.usesVirtualViewport = () => false;
    return { TilemapManager, manager, resizes };
}

test('tile layers are out of the hit test; one surface the size of the map stands in for them', () => {
    class Container {
        constructor() { this.children = []; this.interactiveChildren = true; }
        addChild(child) { child.parent = this; this.children.push(child); return child; }
        on() {}
    }
    const { manager } = tilemapFixture({ PIXI: { Container, Graphics: Container } });
    manager.app.stage = new Container();
    manager.container = null;
    manager.layers = {};
    manager.drawGrid = manager.drawPassage = manager.setupPanning = manager.setLayerDimming = () => {};
    manager.createTilemapContainer();
    for (const name of ['checkerboard', 'parallax', 'ground', 'lower1', 'lower2', 'lower3', 'upper0', 'upper1',
        'upper2', 'upper3', 'a1ground', 'a1lower1', 'a1lower2', 'a1lower3', 'shadow']) {
        assert.equal(manager.layers[name].interactiveChildren, false, name);
    }
    const surface = manager.container.children[0];
    assert.equal(surface, manager._hitSurface, 'under everything, so inputs above it are found first');
    assert.equal(surface.hitArea.contains(0, 0), true);
    assert.equal(surface.hitArea.contains(25 * 48 - 1, 25 * 48 - 1), true);
    assert.equal(surface.hitArea.contains(25 * 48, 10), false, 'beyond the map is not the map');
    assert.equal(surface.hitArea.contains(-1, 10), false);
    manager.currentMap = { width: 40, height: 30 };
    assert.equal(surface.hitArea.contains(39 * 48, 29 * 48), true, 'follows the map it is showing');
});

test('wheel notches in one frame are applied together, each still one zoom step', () => {
    const frames = [];
    const panel = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), handlers: {},
        querySelectorAll: () => [], addEventListener(type, fn) { this.handlers[type] = fn; }, removeEventListener() {} };
    const window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
    const { manager } = tilemapFixture({
        document: { getElementById: () => panel },
        window,
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
        setTimeout: () => 0, clearTimeout() {}
    });
    manager.container.on = () => {};
    manager.initCustomScrollbars = () => {};
    let zoomChanges = 0, crops = 0;
    manager.onZoomChange = () => { zoomChanges++; };
    manager.updateScrollbars = () => {};
    manager.pauseLazyLoading = manager.resumeLazyLoading = () => {};
    const crop = manager.applyViewportCrop;
    manager.applyViewportCrop = function(...args) { crops++; return crop.apply(this, args); };
    manager.setupPanning();

    const wheel = deltaY => panel.handlers.wheel({ deltaY, clientX: 400, clientY: 300, preventDefault() {} });
    wheel(-100); wheel(-100); wheel(-100);
    assert.equal(frames.length, 1, 'one frame requested for the burst');
    assert.equal(crops, 0);
    frames.shift()();
    assert.equal(zoomChanges, 1, 'applied once');
    let expected = 1;
    for (let i = 0; i < 3; i++) expected = manager._quantizeScale(Math.min(5, expected * 1.1));
    assert.equal(manager.container.scale.x, expected, 'the same scale three separate notches reached');
});

test('mid-gesture the canvas is clipped, not reallocated; the gesture end puts the exact size back', () => {
    const panel = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const { manager, resizes } = tilemapFixture({ document: { getElementById: () => panel }, setTimeout: () => 0, clearTimeout() {} });
    manager.currentMap = { width: 10, height: 10 };
    manager.applyViewportCrop();
    assert.deepEqual(resizes, [[480, 480]], 'outside a gesture the canvas is the map');

    manager.beginViewportGesture();
    manager.setViewportTransform(0, 0, 1.2);
    manager.setViewportTransform(0, 0, 1.1);
    manager.setViewportTransform(0, 0, 1.25);
    assert.deepEqual(resizes, [[480, 480], [800, 600]], 'grown once, to the panel');
    assert.equal(manager.app.canvas.style.clipPath, `inset(0px ${800 - 600}px 0px 0px)`);
    manager.endViewportGesture();
    assert.deepEqual(resizes.at(-1), [600, 600]);
    assert.equal(manager.app.canvas.style.clipPath, '', 'no clip outside a gesture');
});

test('the panel size is measured once per layout change, not per call', () => {
    let reads = 0, observed = null;
    const panel = { getBoundingClientRect: () => { reads++; return { width: 800, height: 600 }; } };
    class ResizeObserver {
        constructor(fn) { this.fn = fn; }
        observe(element) { observed = this; this.element = element; }
        disconnect() {}
    }
    const { manager } = tilemapFixture({ document: { getElementById: () => panel }, ResizeObserver });
    manager.panBounds(); manager.panBounds(); manager.applyViewportCrop();
    assert.equal(reads, 1);
    observed.fn();
    manager.panBounds();
    assert.equal(reads, 2, 'a reported resize measures again');
});

test('layer caches are sized from the map, and the GPU limits are asked once per context', () => {
    const { TilemapManager, manager } = tilemapFixture();
    let asks = 0;
    const gl = { MAX_TEXTURE_SIZE: 1, MAX_RENDERBUFFER_SIZE: 2, MAX_VIEWPORT_DIMS: 3,
        getParameter(key) { asks++; return key === 3 ? [8192, 8192] : 8192; } };
    manager.app.renderer.gl = gl;
    manager.layerCacheOptions = { resolution: 1 };
    const layer = { children: [{}], getLocalBounds() { throw new Error('the layer is never walked'); } };
    manager.currentMap = { width: 40, height: 40 };
    assert.equal(manager.isLayerCacheSafe(layer), true, '1920px fits a 2048 texture');
    assert.equal(manager.isLayerCacheSafe(layer), true);
    assert.equal(asks, 3, 'three parameters, once');
    manager.currentMap = { width: 100, height: 100 };
    assert.equal(manager.isLayerCacheSafe(layer), false, 'past the byte budget');
    assert.equal(manager.isLayerCacheSafe({ children: [] }), false, 'an empty layer has nothing to cache');
    // A lost context answers null; that is not remembered once it is back.
    let lost = true;
    const flaky = { getParameter: () => lost ? null : 4096 };
    assert.equal(Number.isFinite(TilemapManager.maxRenderTargetSide(flaky)), false);
    lost = false;
    assert.equal(TilemapManager.maxRenderTargetSide(flaky), 4096);
});

test('water frames ask for a draw only when the map has water', () => {
    const { manager } = tilemapFixture();
    let requests = 0;
    manager.app.requestRender = () => { requests++; };
    manager.currentTileset = {};
    manager.a1TilePositions = [];
    manager.updateA1Tiles();
    assert.equal(requests, 0);
    manager.a1TilePositions = [{ x: 0, y: 0, tileId: 2048, pixiLayer: {} }];
    manager.updateA1TileTextures = () => {};
    manager.updateA1Tiles();
    assert.equal(requests, 1);
});

test('the event hover outline is rebuilt only when the pointer reaches a new tile', () => {
    const EventManager = vm.runInNewContext(`${src('EventManager.js')}\nEventManager;`, { console });
    const manager = Object.create(EventManager.prototype);
    manager.eventMode = true;
    manager.currentMap = { width: 10, height: 10, events: [] };
    manager.tilemapManager = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: {} };
    let clears = 0;
    manager.hoverHighlight = { visible: false, clear() { clears++; }, rect() {}, stroke() {} };
    const at = (x, y) => ({ data: { getLocalPosition: () => ({ x, y }) } });
    manager.updateHoverHighlight(at(10, 10));
    manager.updateHoverHighlight(at(20, 30));
    manager.updateHoverHighlight(at(47, 47));
    assert.equal(clears, 1, 'three moves within one tile draw it once');
    manager.updateHoverHighlight(at(50, 10));
    assert.equal(clears, 2);
    manager.hideHoverHighlight();
    manager.updateHoverHighlight(at(50, 10));
    assert.equal(clears, 3, 'shown again after hiding');
});

test('the flat prop preview idles while its props and the lights on them are still', () => {
    const keys = ['document', 'MapEditor3D', 'RREventPreviewModels', 'Reactor3D', 'THREE', 'FlatLightField2D', 'ModelPropShadows2D'];
    const saved = keys.map(key => global[key]);
    try {
        global.FlatLightField2D = require('../src/utils/FlatLightField2D.js');
        global.ModelPropShadows2D = require('../src/utils/ModelPropShadows2D.js');
        const Preview = require('../src/utils/ModelPropsPreview2D.js');
        global.document = { hidden: false };
        let poses = 0;
        global.MapEditor3D = class { animateModels() { poses++; } };
        global.THREE = { Vector3: class { project() { return this; } } };
        global.RREventPreviewModels = { texturesDecoded: () => true, revision: 0 };
        global.Reactor3D = {};
        const parent = {};
        const transform = { a: 1, d: 1, tx: 0, ty: 0 };
        let mapLights = [{ id: 'lamp', x: 1, y: 1, radius: 3, intensity: 1 }];
        const lightingManager = { revision: 0, resolvedLights: () => mapLights, ambient: () => ({ ambient: 0.5 }) };
        const manager = { currentMap: {}, tilemapManager: { container: parent }, projectController: { lightingManager },
            container: { toGlobal: p => p, worldTransform: transform }, mapEditor3D: () => null };
        const preview = new Preview(manager);
        preview.revision = 0;
        let requests = 0;
        preview.app = { stage: { children: [parent] }, renderer: { resolution: 1 }, screen: { width: 100, height: 100 },
            requestRender: () => { requests++; } };
        let paints = 0;
        preview.paint = entry => { paints++; entry.dirty = false; };
        preview.shadows.update = () => {};
        preview.entries.set(1, { sprite: { x: 0, y: 0, position: { x: 0, y: 0 } }, prop: { id: 1, x: 0, y: 0 },
            object: {}, camera: {}, radius: 1, tw: 48, density: 1.25, decoded: true, dirty: true, effects: [] });

        let now = 1000;
        const tick = () => { preview.tick(now); now += 17; };
        tick();
        assert.equal(paints, 1, 'a new prop paints');
        tick(); tick(); tick();
        const idle = poses;
        tick(); tick(); tick();
        assert.equal(poses, idle, 'still props under still lights skip the frame');

        transform.a = 2;
        tick();
        assert.equal(poses, idle + 1, 'zooming wakes it');
        tick(); tick();
        assert.equal(poses, idle + 1);

        mapLights = [{ ...mapLights[0], intensity: 0.5 }];
        tick();
        assert.equal(poses, idle + 2, 'a light edited in the Lighting tool wakes it');

        lightingManager.revision++;
        tick();
        assert.equal(poses, idle + 3, 'so does any Lighting tool change');

        mapLights = [{ ...mapLights[0], animated: true }];
        tick(); tick(); tick();
        assert.equal(poses, idle + 6, 'a flickering light keeps it live');

        preview.entries.clear();
        mapLights = [];
        tick();
        assert.equal(poses, idle + 6, 'no props, nothing to do');
    } finally {
        keys.forEach((key, i) => { if (saved[i] === undefined) delete global[key]; else global[key] = saved[i]; });
    }
});

test('new pixels in a prop or its shadow ask the map to draw', () => {
    const preview = src('utils/ModelPropsPreview2D.js');
    assert.match(preview, /entry\.draws = \(entry\.draws \|\| 0\) \+ 1;\s*[\s\S]{0,200}this\.app\?\.requestRender\?\.\(\);/);
    const shadows = src('utils/ModelPropShadows2D.js');
    assert.match(shadows, /viewport\.renderInto\(state\.target, state\.scene, state\.camera\);[\s\S]{0,200}this\.preview\.app\?\.requestRender\?\.\(\);/);
});
