/**
 * The map views draw on demand. The 3D view draws when something changes
 * (an edit, the camera, a model that finished loading) and keeps the full
 * rate only while something on screen really moves; the Lighting tool's
 * frame loop resolves no lights and draws nothing on a still map, and counts
 * each change in `revision` for its readers.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
const lightingSource = fs.readFileSync(path.join(editorRoot, 'src', 'LightingManager.js'), 'utf8');
const MapLights = require(path.join(editorRoot, 'src', 'utils', 'MapLights.js'));

function mapEditorClass(context = {}) {
    return vm.runInNewContext(`${mapSource}\nMapEditor3D;`, {
        console, window: {}, performance: { now: () => 0 },
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
        require, setTimeout, clearTimeout, ...context
    });
}

function stillView(MapEditor3D) {
    const view = Object.create(MapEditor3D.prototype);
    view.flying = () => false;
    view.camera = { position: { x: 0, y: 1, z: 2 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } };
    view.hoverCell = { visible: true, position: { x: 3, y: 0, z: 4 } };
    return view;
}

//-----------------------------------------------------------------------------
// 3D view

test('a still 3D view draws once a second; anything active draws every frame', () => {
    const MapEditor3D = mapEditorClass();
    const should = MapEditor3D.shouldRender;
    assert.equal(MapEditor3D.IDLE_INTERVAL_MS, 1000);
    assert.equal(should({ now: 1000, active: false, lastRenderAt: 0 }), true, 'the first frame always draws');
    assert.equal(should({ now: 1100, active: false, lastRenderAt: 1000 }), false, 'still: a tenth of a second later, nothing');
    assert.equal(should({ now: 1999, active: false, lastRenderAt: 1000 }), false, 'still: nothing within the second');
    assert.equal(should({ now: 2000, active: false, lastRenderAt: 1000 }), true, 'still: the once-a-second safety net');
    assert.equal(should({ now: 1001, active: true, lastRenderAt: 1000 }), true, 'active: every frame');
    assert.equal(should({ now: 1100, active: false, lastRenderAt: 1000, idleInterval: 100 }), true, 'water keeps the old idle cadence');
});

test('the camera and hover are compared as numbers, and a request keeps the view drawing only for the tail', () => {
    const MapEditor3D = mapEditorClass();
    assert.doesNotMatch(mapSource, /toFixed\(4\)\}\|\$\{camera\.position/, 'no per-frame string key');
    const view = stillView(MapEditor3D);
    const tail = MapEditor3D.ACTIVE_TAIL_MS;
    assert.equal(view.previewActive(5000), true, 'a first look is a change');
    assert.equal(view.previewActive(5000 + tail - 1), true, 'the tail after a change');
    assert.equal(view.previewActive(5000 + tail + 1), false, 'a still camera goes idle after the tail');
    view.camera.position.x += 1e-7;
    assert.equal(view.previewActive(7000), false, 'float noise finer than a pixel is not a move');
    view.camera.quaternion.y = 0.2;
    assert.equal(view.previewActive(7100), true, 'turning the camera is activity');
    assert.equal(view.previewActive(8000), false);
    view.hoverCell.position.x = 4;
    assert.equal(view.previewActive(8100), true, 'the hover cell moving is activity');
    assert.equal(view.previewActive(9000), false);
    view.hoverCell.visible = false;
    assert.equal(view.previewActive(9100), true, 'the hover cell hiding is activity');
    assert.equal(view.previewActive(10000), false);
    view._lastActiveAt = 10000;
    assert.equal(view.previewActive(10100), true, 'a request (which notes the time) draws');
    view.flying = () => true;
    assert.equal(view.previewActive(20000), true, 'a flight is activity');
});

test('requestRender marks the view active, and every input handler still does', () => {
    const MapEditor3D = mapEditorClass({ performance: { now: () => 4321 } });
    const view = stillView(MapEditor3D);
    view.requestRender();
    assert.equal(view._lastActiveAt, 4321);
    for (const name of ['_onPointerDown', '_onPointerMove', '_onPointerUp', '_onWheel', '_onFlyDown']) {
        assert.match(mapSource, new RegExp(`this\\.${name} = event => \\{\\s*this\\._lastActiveAt = performance\\.now\\(\\);`), `${name} marks activity`);
    }
    // Input anywhere in the window counts, a bare pointer move only with a button held.
    assert.match(mapSource, /this\._onAnyInput = event => \{\s*if \(event\.type === 'pointermove' && !event\.buttons\) return;\s*this\.requestRender\(\);\s*\};/);
    assert.match(mapSource, /for \(const type of MapEditor3D\.INPUT_EVENTS\) window\.addEventListener\(type, this\._onAnyInput, \{ capture: true, passive: true \}\);/);
    assert.match(mapSource, /for \(const type of MapEditor3D\.INPUT_EVENTS\) window\.removeEventListener\(type, this\._onAnyInput, \{ capture: true \}\);/);
    for (const type of ['pointerdown', 'pointerup', 'keydown', 'wheel', 'input', 'change']) {
        assert.ok(MapEditor3D.INPUT_EVENTS.includes(type), `${type} counts`);
    }
    // Everything that lands on its own time asks for a frame: a rebuild,
    // models and footprints loading, a picture effect, a resize, selection.
    assert.match(mapSource, /events: this\.eventGroup \? this\.eventGroup\.children\.length : 0\s*\};\s*this\.requestRender\(\);\s*return true;/);
    assert.match(mapSource, /this\.placeProp\(object, prop, mapData\);\s*group\.add\(object\);\s*this\.requestRender\(\);/);
    assert.match(mapSource, /object\.userData\.modelPreview = true;\s*group\.add\(object\);\s*this\.requestRender\(\);/);
    assert.match(mapSource, /image\.onload = \(\) => \{ texture\.image = image; texture\.needsUpdate = true; this\.requestRender\(\); \};/);
    assert.match(mapSource, /this\.camera\.updateProjectionMatrix\(\);\s*this\.requestRender\(\);/);
    assert.match(mapSource, /select\(mesh\) \{\s*this\.requestRender\(\);/);
    assert.match(mapSource, /refreshPassage\(\) \{\s*this\.requestRender\(\);/);
});

test('only what moves by itself keeps the full rate', () => {
    const MapEditor3D = mapEditorClass();
    const view = stillView(MapEditor3D);
    const attached = { parent: {} };
    view.effectPlays = [
        { object: attached, layer: { active: true } },
        { object: attached, plane: { userData: {} } },
        { object: attached, light: true, effect: { light: {} } }
    ];
    assert.equal(view.effectsAnimate(), false, 'an MV overlay, a picture and a steady light are still');
    view.effectPlays.push({ object: attached, light: true, effect: { light: { flicker: 0.4 } } });
    assert.equal(view.effectsAnimate(), true, 'a flickering carried light moves');
    view.effectPlays = [{ object: attached, plane: { userData: { video: { paused: false, ended: false } } } }];
    assert.equal(view.effectsAnimate(), true, 'a playing video plane moves');
    view.effectPlays = [{ object: { parent: null }, quad: {}, layer: { active: true } }];
    assert.equal(view.effectsAnimate(), false, 'an effect whose model left the scene does not');
    view.effectPlays = [{ object: attached, quad: {}, layer: { active: true } }];
    assert.equal(view.effectsAnimate(), true, 'an Effekseer quad moves');

    view.animatedModels = [{ object: attached, rules: [{ trigger: 'action', name: 'Wave' }], action: null }];
    assert.equal(view.modelsAnimate(), false, 'a model waiting for an action stands still');
    view.animatedModels[0].action = { name: 'Wave', frame: 0 };
    assert.equal(view.modelsAnimate(), true, 'an action playing moves');
    view.animatedModels = [{ object: attached, rules: [{ trigger: 'idle' }] }];
    assert.equal(view.modelsAnimate(), true, 'idle rules move');
    // Out of the picture it moves nothing in it: asked of the camera's frustum where there is one.
    const asked = [];
    view.viewFrustum = () => ({ });
    view.modelInView = (object, frustum) => { asked.push(object); return false; };
    assert.equal(view.modelsAnimate(), false, 'a model the camera cannot see does not keep the view drawing');
    assert.deepEqual(asked, [attached]);
    view.modelInView = () => true;
    assert.equal(view.modelsAnimate(), true);
    delete view.viewFrustum; delete view.modelInView;
    assert.match(mapSource, /sphere\.radius = span \* 1\.5 \+ 1;/);

    view.effectPlays = [];
    view.animatedModels = [];
    view.mapScene = { _waterMeshes: [] };
    assert.equal(view.idleInterval(), MapEditor3D.IDLE_INTERVAL_MS);
    view.mapScene._waterMeshes.push({});
    assert.equal(view.idleInterval(), 100, 'waves at the old idle cadence, not the full rate');
    // A drifting sky draws a still view every other frame, and no longer counts as the view being active.
    view.mapScene._sky = { userData: { sky: { driftX: 0.0001, driftY: 0 } } };
    assert.equal(view.idleInterval(), MapEditor3D.SKY_INTERVAL_MS);
    assert.ok(MapEditor3D.SKY_INTERVAL_MS > 17 && MapEditor3D.SKY_INTERVAL_MS < 34);
    assert.doesNotMatch(mapSource, /if \(sky && \(sky\.driftX \|\| sky\.driftY\)\) return true;/);
    view.mapScene._sky.userData.sky.driftX = 0;
    assert.equal(view.idleInterval(), 100);
});

test('A1 water and stepping characters draw on the frames they change, not between', () => {
    const window = { reactor: { optionsManager: { getAnimateAutotiles: () => true } } };
    const MapEditor3D = mapEditorClass({ window });
    const view = stillView(MapEditor3D);
    view.mapScene = { _animated: [{}], _frame: 2 };
    view._animationStartedAt = 0;
    assert.equal(view.stepAnimations(1100), false, 'frame 2 is already shown');
    assert.equal(view.stepAnimations(1500), true, 'frame 3 is new');
    window.reactor.optionsManager.getAnimateAutotiles = () => false;
    assert.equal(view.stepAnimations(2600), false, 'the A1 box unticked stops it');
    view.mapScene = { _animated: [], _frame: 0 };

    let drawn = 0;
    const context = { clearRect() {}, drawImage() { drawn++; } };
    view.animatedEvents = [{ count: 0, wait: 18, pattern: 1, canvas: { width: 1, height: 1, getContext: () => context },
        baseX: 0, baseY: 0, frameWidth: 1, frameHeight: 1, texture: {} }];
    view._lastPreviewTick = 0;
    let stepped = 0;
    for (let frame = 1; frame <= 40; frame++) if (view.stepAnimations(frame * 1000 / 60)) stepped++;
    assert.equal(stepped, 2, 'two steps in 40 frames at a wait of 18');
    assert.equal(drawn, 2);
    // The draw at the same moment counts nothing again.
    const count = view.animatedEvents[0].count;
    view.animateModels = () => {};
    view.animateEventPreviews(40 * 1000 / 60);
    assert.equal(view.animatedEvents[0].count, count);
});

test('the loop draws a still view once, on request, and when the Database window lifts', () => {
    const frames = [];
    let covered = false;
    const MapEditor3D = mapEditorClass({
        performance: { now: () => clock },
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
        cancelAnimationFrame() {},
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [],
            getElementById: id => id === 'database-viewer' ? { classList: { contains: () => covered } } : null }
    });
    let clock = 0;
    const view = stillView(MapEditor3D);
    view.enabled = true;
    view.frame = null;
    view.keepCanvasFilling = () => false;
    view.stepFly = () => {};
    let draws = 0;
    view.render = () => { draws++; };
    const run = now => { clock = now; frames.shift()(now); };
    view.startLoop();
    run(16);
    assert.equal(draws, 1, 'the first frame draws');
    for (let now = 32; now <= 16 + MapEditor3D.ACTIVE_TAIL_MS; now += 16) run(now);
    const afterTail = draws;
    for (let now = 600; now < 1000; now += 16) run(now);
    assert.equal(draws, afterTail, 'nothing more while still');
    clock = 1000;
    view.requestRender();
    run(1008);
    assert.equal(draws, afterTail + 1, 'a request draws the next frame');
    const beforeCover = draws;
    covered = true;
    for (let now = 3000; now < 6000; now += 16) run(now);
    assert.equal(draws, beforeCover, 'nothing at all under the Database window');
    covered = false;
    run(6016);
    assert.equal(draws, beforeCover + 1, 'the lifted cover draws at once');
});

test('a 3D stroke no longer redraws the hidden 2D map', () => {
    const MapEditor3D = mapEditorClass({ window: { reactor: {} } });
    const view = stillView(MapEditor3D);
    let reset = null, rendered = 0;
    view.mapEditor = () => ({ resetDrawingState(save) { reset = save; } });
    view.projectController = { tilemapManager: { renderMap() { rendered++; } } };
    view.endPaint();
    assert.equal(reset, true, 'the stroke still commits and announces the edit');
    assert.equal(rendered, 0, 'turning 3D off redraws the 2D map instead');
    assert.match(mapSource, /setTimeout\(\(\) => \{\s*const tilemap = [\s\S]*?tilemap\?\.renderMap\?\.\(\{ preserveScroll: true \}\);/, 'the teardown redraw is still there');
});

//-----------------------------------------------------------------------------
// Lighting tool

function lightingHarness({ lights = [], active = false } = {}) {
    const frames = [];
    const listeners = {};
    const document = {
        hidden: false,
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter(f => f !== fn); }
    };
    const context = { document, window: {}, Reactor3D: {}, RRMapLights: MapLights, console,
        requestAnimationFrame(fn) { frames.push(fn); return frames.length; }, cancelAnimationFrame() {} };
    const Manager = vm.runInNewContext(`${lightingSource}\nLightingManager;`, context);
    const container = { children: [] };
    const requests = { flat: 0, view3d: 0 };
    const app = { requestRender() { requests.flat++; } };
    const map = { id: 1, width: 20, height: 20, events: [], reactor3d: { version: 1, lights } };
    const mapEditor3D = { isEnabled: () => false, requestRender() { requests.view3d++; } };
    const props = { container: {}, _sprites: new Map(), preview2D: { lights: [], shadows: { states: new Map() } } };
    const manager = new Manager({ tilemapManager: { container, app, currentMap: map }, mapEditor3D, modelPropsManager: props });
    manager.active = active;
    manager._boundMap = map;
    const root = { visible: true, parent: container };
    container.children.push(root);
    manager._overlay = { root, markers: { clear() {} } };
    let draws = 0;
    const draw = manager._draw.bind(manager);
    manager._draw = frame => { draws++; };
    manager._drawForReal = draw;
    const tick = () => frames.shift()();
    return { manager, map, props, container, requests, listeners, tick, draws: () => draws };
}

test('a still map resolves no lights and draws nothing frame by frame', () => {
    const h = lightingHarness({ lights: [MapLights.normalize({ type: 'point', x: 2, y: 2 }, 'light1')] });
    let resolved = 0;
    const resolve = h.manager.resolvedLights.bind(h.manager);
    h.manager.resolvedLights = frame => { resolved++; return resolve(frame); };
    h.manager._startTicking();
    h.tick();
    assert.equal(h.draws(), 1, 'the map load draws once');
    for (let i = 0; i < 120; i++) h.tick();
    assert.equal(h.draws(), 1, 'two seconds of a still map draw nothing more');
    assert.equal(resolved, 1, 'and resolve the lights once, for the animated check');
    assert.doesNotMatch(lightingSource, /this\._frame % 6 === 1/, 'no periodic refresh');
});

test('animated lights draw every frame; the answer is cached per revision', () => {
    const h = lightingHarness({ lights: [MapLights.normalize({ type: 'point', x: 2, y: 2, flicker: 0.5 }, 'light1')] });
    let resolved = 0;
    const resolve = h.manager.resolvedLights.bind(h.manager);
    h.manager.resolvedLights = frame => { resolved++; return resolve(frame); };
    h.manager._startTicking();
    for (let i = 0; i < 10; i++) h.tick();
    assert.equal(h.draws(), 10);
    assert.equal(resolved, 1, 'the animated check resolved once for ten frames');
    assert.equal(h.manager.wants3DFrames(), true, 'the 3D view keeps drawing for a flicker');
    MapLights.update(h.map, 'light1', { flicker: 0 });
    h.manager.render();
    assert.equal(h.manager.hasAnimatedLights(), false, 'an edit counts as a change and is looked at again');
    assert.equal(h.manager.wants3DFrames(), false);
});

test('an open panel alone no longer keeps the 3D view drawing', () => {
    const h = lightingHarness({ lights: [MapLights.normalize({ type: 'point', x: 2, y: 2 }, 'light1')], active: true });
    assert.equal(h.manager.wants3DFrames(), false);
});

test('every edit counts toward revision and asks both views for a frame', () => {
    const h = lightingHarness();
    h.manager._draw = h.manager._drawForReal;
    const before = h.manager.revision;
    h.manager.render();
    assert.equal(h.manager.revision, before + 1);
    assert.ok(h.requests.view3d >= 1, 'the 3D view is asked');
    h.manager.feed3D = () => {};
    h.manager._sync3D();
    assert.ok(h.requests.view3d >= 2, 'feeding the compositor asks for a 3D frame');
    // _changed, undo/redo, the ambient and live slider edits all route through render().
    assert.match(lightingSource, /_changed\(\) \{\s*this\.render\(\);/);
    assert.match(lightingSource, /_setAmbient\(values\) \{[\s\S]*?this\.render\(\);\s*this\._sync3D\(\);/);
    assert.match(lightingSource, /_liveUpdate\(patch\) \{[\s\S]*?this\.render\(\);\s*this\._sync3D\(\);/);
    assert.match(lightingSource, /_timeTravel\(from, to\) \{[\s\S]*?this\._changed\(\);/);
});

test('what other tools change under the overlay is noticed without resolving a light', () => {
    const h = lightingHarness({ lights: [MapLights.normalize({ type: 'point', x: 2, y: 2 }, 'light1')] });
    h.manager._startTicking();
    h.tick();
    h.tick();
    const base = h.draws();
    let revision = h.manager.revision;

    // The props layer redrew and took a carried glow off it.
    const group = { parent: {}, destroyed: false };
    h.manager._propGlowGroups.set('$floor', group);
    h.tick();
    assert.equal(h.draws(), base + 1, 'a glow group joining counts');
    group.parent = null;
    h.tick();
    assert.equal(h.draws(), base + 2, 'a glow group detached is drawn back');
    h.tick();
    assert.equal(h.draws(), base + 2, 'and then it is still');
    assert.equal(h.manager.revision, revision, 'none of that changes the lights');

    // A prop shadow repainted.
    h.props.preview2D.shadows.states.set('light1', { at: 1234 });
    h.tick();
    assert.equal(h.draws(), base + 3);

    // Something drawn over the overlay.
    h.container.children.push({});
    h.tick();
    assert.equal(h.draws(), base + 4, 'the overlay goes back on top');

    // The light list replaced from outside (another tool's undo).
    h.map.reactor3d.lights = h.map.reactor3d.lights.slice();
    h.tick();
    assert.equal(h.draws(), base + 5);
    assert.equal(h.manager.revision, revision + 1, 'a new light list is a change to the lights');
    revision = h.manager.revision;

    // An event moved by another tool: announced, and drawn.
    h.listeners['rr-events-changed'].forEach(fn => fn());
    assert.equal(h.manager.revision, revision + 1);
    h.tick();
    assert.equal(h.draws(), base + 6);

    h.manager._stopTicking();
    assert.equal((h.listeners['rr-events-changed'] || []).length, 0, 'stopping lets go of the listeners');
});

test('a map switch counts as a change', () => {
    const h = lightingHarness();
    for (const method of ['armPlacement', '_unbindPointer', '_end3DDrag', '_destroyOverlay', '_syncDiskNotice', '_syncPanel', '_buildOverlay', '_cancelChipDrag']) h.manager[method] = () => {};
    h.manager._startTicking();
    h.tick();
    const revision = h.manager.revision;
    h.manager._boundMap = { id: 99 };
    h.tick();
    assert.equal(h.manager.revision, revision + 1);
});
