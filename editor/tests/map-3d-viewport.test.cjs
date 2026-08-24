const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
const mainSource = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
const mapEditorSource = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor.js'), 'utf8');

const quietConsole = Object.create(console);
quietConsole.error = () => {};
quietConsole.warn = () => {};

function viewport(controller = {}, overrides = {}) {
    const MapEditor3D = vm.runInNewContext(`${source}\nMapEditor3D;`, {
        console: quietConsole,
        window: {},
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
        Reactor3D,
        require,
        setTimeout,
        clearTimeout,
        ...overrides
    });
    return new MapEditor3D(controller);
}

function webViewport({ fail = '' } = {}) {
    const browserWindow = {};
    const requested = [];
    let failedUrlPart = fail;
    const host = {
        mode: 'web',
        projectRoot: '/project',
        fs: {},
        path: { join: (...parts) => parts.join('/').replace(/\/+/g, '/') },
        assetUrl(filePath) {
            requested.push(filePath);
            return `https://example.test${filePath}`;
        }
    };
    browserWindow.RPGReactorWebHost = host;
    const document = {
        addEventListener() {},
        removeEventListener() {},
        querySelectorAll: () => [],
        createElement() { return { dataset: {}, remove() {} }; },
        head: {
            appendChild(element) {
                Promise.resolve().then(() => {
                    if (failedUrlPart && element.src.includes(failedUrlPart)) {
                        element.onerror();
                    } else {
                        if (element.src.endsWith('/three.js')) browserWindow.THREE = {};
                        if (element.src.endsWith('/reactor_3d.js')) browserWindow.Reactor3D = {};
                        element.onload();
                    }
                });
            }
        }
    };
    const MapEditor3D = vm.runInNewContext(`${source}\nMapEditor3D;`, {
        console: quietConsole,
        window: browserWindow,
        document,
        Reactor3D,
        require,
        setTimeout,
        clearTimeout
    });
    let desktopLookup = false;
    const view = new MapEditor3D({
        projectManager: {
            getRuntimePath() {
                desktopLookup = true;
                return null;
            }
        }
    });
    return {
        view,
        requested,
        desktopLookup: () => desktopLookup,
        setFailure(value) { failedUrlPart = value; }
    };
}

//-----------------------------------------------------------------------------
// Wiring

test('the 3D toggle sits beside the A1 toggle on the map info bar', () => {
    assert.match(indexHtml, /id="map-3d-view" type="checkbox"/);
    assert.ok(indexHtml.indexOf('map-autotile-animation') < indexHtml.indexOf('map-3d-view'),
        'and after it, so A1 keeps its place');
    // Unchecked in the markup: 3D is opt-in, and an editor that never opens it
    // never parses two megabytes of three.js.
    const checkbox = indexHtml.match(/<input id="map-3d-view"[^>]*>/)[0];
    assert.equal(/\bchecked\b/.test(checkbox), false);
});

test('the viewport module ships and is loaded by the editor', () => {
    assert.match(indexHtml, /<script src="src\/MapEditor3D\.js"><\/script>/);
    assert.ok(fs.existsSync(path.join(editorRoot, 'src', 'MapEditor3D.js')));
});

test('the toggle reports what actually happened, not what was asked', () => {
    // three.js or the runtime directory can be missing in a partial install; a
    // ticked box over a 2D canvas would be a lie.
    assert.match(mainSource, /active = await this\.mapEditor3D\.setEnabled/);
    assert.match(mainSource, /if \(checkbox\) checkbox\.checked = active;/);
});

test('3D preference activation is durable-false until setup succeeds', () => {
    const start = mainSource.indexOf('async applyMap3DViewPreference(enabled)');
    const body = mainSource.slice(start, mainSource.indexOf('\n    }', start) + 6);
    const failClosed = body.indexOf('this.optionsManager.setMap3DView(false);');
    const activate = body.indexOf('await this.mapEditor3D.setEnabled(requested);');
    const commit = body.indexOf('if (active) this.optionsManager.setMap3DView(true);');
    assert.ok(failClosed >= 0 && failClosed < activate);
    assert.ok(commit > activate);
    assert.match(body, /catch \(error\)/, 'activation exceptions are contained');
    assert.doesNotMatch(mainSource, /settings\.map3DView = false/,
        'failure recovery always reaches durable storage');
});

test('project close tears down the 3D renderer before destroying the map', () => {
    assert.match(controllerSource,
        /closeProject\(\)[\s\S]*await this\.disableMap3DView\(\)[\s\S]*this\.tilemapManager\.destroy\(\)/);
});

test('the view follows the map instead of freezing on one', () => {
    assert.match(controllerSource, /refreshMap3DView\(\)/);
    assert.match(mapEditorSource, /notifyMapEdited\(\)/);
    assert.match(mapEditorSource, /rr-map-edited/);
    assert.match(source, /addEventListener\('rr-map-edited'/);
});

test('rebuilds are debounced', () => {
    // A rebuild remakes every buffer, and a fill or a large stamp announces
    // several strokes in quick succession.
    assert.match(source, /this\._rebuildTimer = setTimeout/);
});

test('3D A1 animation is time-based rather than monitor-frame-based', () => {
    const view = viewport();
    const frames = [];
    view.mapScene = { setAnimationFrame(frame) { frames.push(frame); } };

    view.animateAutotiles(1000);
    view.animateAutotiles(1499);
    view.animateAutotiles(1500);
    view.animateAutotiles(2500);

    assert.deepEqual(frames, [0, 0, 1, 3]);
    assert.match(source, /timestamp - this\._animationStartedAt\) \/ 500/,
        'the cadence is independent of 60Hz, 120Hz, or 144Hz requestAnimationFrame');
});

//-----------------------------------------------------------------------------
// Libraries

test('the runtime module is read from disk, not copied into the editor', () => {
    // A viewport with its own copy of the geometry would drift from the runtime
    // the first time either changed, and seeing what the game will draw is the
    // entire point of the view.
    assert.match(source, /getRuntimePath/);
    assert.match(source, /'libs', 'three\.js'/);
    assert.match(source, /'reactor_3d\.js'/);
    assert.equal(fs.existsSync(path.join(repoRoot, 'runtime', 'libs', 'three.js')), true);
});

test('a missing runtime directory reports rather than throws', async () => {
    const view = viewport({ projectManager: { getRuntimePath: () => null } });
    assert.equal(await view.ensureLibraries(), false);
    assert.match(view.lastError, /runtime directory/);
    assert.equal(await view.setEnabled(true), false, 'and the view stays off');
});

test('WebHost loads 3D viewport dependencies lazily from the bundled project', async () => {
    const web = webViewport();
    assert.deepEqual(web.requested, [], 'construction does not load three.js');

    assert.equal(await web.view.ensureLibraries(), true);
    assert.deepEqual(web.requested, [
        '/project/js/libs/three.js',
        '/project/js/reactor_3d.js'
    ]);
    assert.equal(web.desktopLookup(), false, 'the browser does not ask for a desktop runtime path');

    assert.equal(await web.view.ensureLibraries(), true);
    assert.equal(web.requested.length, 2, 'a second request reuses the loaded globals');
});

test('a missing Web 3D dependency reports its project path and can be retried', async () => {
    const web = webViewport({ fail: 'reactor_3d.js' });
    assert.equal(await web.view.ensureLibraries(), false);
    assert.match(web.view.lastError, /Could not load \/project\/js\/reactor_3d\.js/);
    assert.equal(web.view._librariesPromise, null, 'a transient load failure does not stay cached');
    web.setFailure('');
    assert.equal(await web.view.ensureLibraries(), true, 'the next activation can retry');
});

test('concurrent 3D enables share one renderer activation', async () => {
    const view = viewport();
    let releaseLibraries;
    view.ensureLibraries = () => new Promise(resolve => { releaseLibraries = resolve; });
    let canvases = 0;
    let rebuilds = 0;
    let loops = 0;
    view.createCanvas = () => { canvases++; return true; };
    view.rebuild = async () => { rebuilds++; return true; };
    view.render = () => {};
    view.startLoop = () => { loops++; };
    view.listenForEdits = () => {};
    view.showPixi = () => {};

    const first = view.setEnabled(true);
    const second = view.setEnabled(true);
    releaseLibraries(true);

    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(canvases, 1);
    assert.equal(rebuilds, 1);
    assert.equal(loops, 1);
});

test('disabling while 3D libraries load cancels activation', async () => {
    const view = viewport();
    let releaseLibraries;
    view.ensureLibraries = () => new Promise(resolve => { releaseLibraries = resolve; });
    let canvases = 0;
    view.createCanvas = () => { canvases++; return true; };
    view.showPixi = () => {};

    const enabling = view.setEnabled(true);
    assert.equal(await view.setEnabled(false), false);
    releaseLibraries(true);

    assert.equal(await enabling, false);
    assert.equal(canvases, 0);
    assert.equal(view.enabled, false);
});

test('a renderer setup exception fails closed instead of rejecting activation', async () => {
    const view = viewport();
    view.ensureLibraries = async () => true;
    view.createCanvas = () => { throw new Error('WebGL context refused'); };
    view.showPixi = () => {};
    let reported = '';
    view.onFailure = message => { reported = message; };

    assert.equal(await view.setEnabled(true), false);
    assert.equal(view.enabled, false);
    assert.match(view.lastError, /WebGL context refused/);
    assert.match(reported, /WebGL context refused/);
});

test('an initial render failure rolls activation back before it can succeed', async () => {
    const view = viewport();
    view.ensureLibraries = async () => true;
    view.createCanvas = () => true;
    view.rebuild = async () => true;
    view.render = () => { throw new Error('shader link failed'); };
    view.showPixi = () => {};
    let loops = 0;
    view.startLoop = () => { loops++; };

    assert.equal(await view.setEnabled(true), false);
    assert.equal(view.enabled, false);
    assert.equal(loops, 0);
    assert.match(view.lastError, /shader link failed/);
});

test('3D shares PIXI WebGL2 instead of creating a second GPU context', () => {
    const appended = [];
    const inputSurface = {
        style: {},
        addEventListener() {},
        removeEventListener() {}
    };
    const canvas = {
        style: { cssText: 'width: 320px; height: 240px;' },
        addEventListener() {},
        removeEventListener() {}
    };
    const context = { isContextLost: () => false };
    let stopped = 0;
    let resets = 0;
    let rendererOptions = null;
    const controller = {
        app: {
            canvas,
            renderer: {
                gl: context,
                context: { webGLVersion: 2 },
                screen: { width: 320, height: 240 },
                resetState() { resets++; }
            },
            ticker: { started: true },
            stop() { stopped++; }
        }
    };
    const view = viewport(controller, {
        document: {
            addEventListener() {},
            removeEventListener() {},
            querySelectorAll: () => [],
            createElement() { return inputSurface; },
            getElementById() { return null; }
        },
        THREE: {
            WebGLRenderer: class {
                constructor(options) { rendererOptions = options; }
                setPixelRatio() {}
                setSize() {}
            },
            SRGBColorSpace: null
        },
        Reactor3D: { createCamera: () => ({ updateProjectionMatrix() {} }) }
    });
    view.container = () => ({
        appendChild(element) { appended.push(element); },
        getBoundingClientRect: () => ({ width: 800, height: 600 })
    });
    view.createHint = () => {};
    view.attachInput = () => {};

    assert.equal(view.createCanvas(), true);
    assert.equal(view.canvas, canvas);
    assert.equal(view.inputSurface, inputSurface);
    assert.equal(rendererOptions.canvas, canvas);
    assert.equal(rendererOptions.context, context);
    assert.equal(rendererOptions.antialias, false, 'the existing PIXI context attributes cannot be changed');
    assert.equal(canvas.style.width, '100%');
    assert.equal(canvas.style.height, '100%');
    assert.equal(view._pixiSize.width, 320);
    assert.equal(view._pixiSize.height, 240);
    assert.equal(stopped, 1);
    assert.equal(resets, 1);
    assert.deepEqual(appended, [inputSurface]);
});

test('3D refuses PIXI WebGL1 without requesting another context', () => {
    let threeRenderers = 0;
    const canvas = {
        style: {},
        getContext() { assert.fail('3D must not request another WebGL context'); }
    };
    const view = viewport({
        app: {
            canvas,
            renderer: { gl: {}, context: { webGLVersion: 1 } }
        }
    }, {
        document: {
            addEventListener() {},
            removeEventListener() {},
            querySelectorAll: () => []
        },
        THREE: { WebGLRenderer: class { constructor() { threeRenderers++; } } }
    });
    view.container = () => ({});

    assert.throws(() => view.createCanvas(), /WebGL 2 is unavailable/);
    assert.equal(threeRenderers, 0);
});

test('teardown disposes Three without forcing loss of the editor context', () => {
    const view = viewport();
    let disposed = 0;
    let lost = 0;
    view.renderer = {
        dispose() { disposed++; },
        forceContextLoss() { lost++; }
    };
    view.showPixi = () => {};

    view.teardown();
    assert.equal(disposed, 1);
    assert.equal(lost, 0);
    assert.equal(view.renderer, null);
});

test('teardown returns a shared context to PIXI without losing it', () => {
    const view = viewport();
    let disposed = 0;
    let lost = 0;
    let resets = 0;
    let resized = 0;
    let restoredSize = null;
    let started = 0;
    let rendered = 0;
    const canvas = {
        style: { cssText: 'position: absolute; width: 100%; height: 100%;' },
        addEventListener() {},
        removeEventListener() {}
    };
    view.projectController.app = {
        canvas,
        start() { started++; },
        render() { rendered++; }
    };
    view.canvas = canvas;
    view.renderer = {
        dispose() { disposed++; },
        forceContextLoss() { lost++; }
    };
    view._sharedPixiRenderer = {
        resetState() { resets++; },
        resize(width, height) { resized++; restoredSize = { width, height }; }
    };
    view._pixiWasRunning = true;
    view._pixiCanvasStyle = 'width: 320px; height: 240px; image-rendering: pixelated;';
    view._pixiSize = { width: 320, height: 240 };
    view.showPixi = () => {};

    view.teardown();
    assert.equal(disposed, 1);
    assert.equal(lost, 0);
    assert.equal(resets, 1);
    assert.equal(resized, 1);
    assert.deepEqual(restoredSize, { width: 320, height: 240 });
    assert.equal(canvas.style.cssText, 'width: 320px; height: 240px; image-rendering: pixelated;');
    assert.equal(started, 1);
    assert.equal(rendered, 1);
    assert.equal(view.renderer, null);
    assert.equal(view._sharedPixiRenderer, null);
});

test('repeated 3D toggles dispose every Three renderer without losing WebGL', async () => {
    const view = viewport();
    view.ensureLibraries = async () => true;
    view.rebuild = async () => true;
    view.render = () => {};
    view.startLoop = () => {};
    view.listenForEdits = () => {};
    view.showPixi = () => {};
    let disposed = 0;
    let lost = 0;
    view.createCanvas = () => {
        view._sharedPixiRenderer = { resetState() {} };
        view.renderer = {
            dispose() { disposed++; },
            forceContextLoss() { lost++; }
        };
        return true;
    };

    for (let index = 0; index < 20; index++) {
        assert.equal(await view.setEnabled(true), true);
        assert.equal(await view.setEnabled(false), false);
    }

    assert.equal(disposed, 20);
    assert.equal(lost, 0);
});

test('a render exception stops the frame loop and fails back to 2D', () => {
    const frames = [];
    const view = viewport({}, {
        requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
        cancelAnimationFrame() {}
    });
    view.enabled = true;
    view._desiredEnabled = true;
    view.stepFly = () => {};
    view.render = () => { throw new Error('shader failed'); };
    view.showPixi = () => {};
    let reported = '';
    view.onFailure = message => { reported = message; };

    view.startLoop();
    assert.equal(frames.length, 1);
    frames[0](1000);

    assert.equal(frames.length, 1, 'the failing frame does not schedule another');
    assert.equal(view.enabled, false);
    assert.match(reported, /shader failed/);
});

//-----------------------------------------------------------------------------
// Camera

test('the whole map is framed when the view opens', () => {
    const view = viewport();
    view.frameMap({ width: 101, height: 51, data: [], events: [] });
    assert.deepEqual(
        { x: view.view.target.x, z: view.view.target.z },
        { x: 50.5, z: 25.5 },
        'centred on the map');
    assert.ok(view.view.distance > 51, 'far enough back to see its longest side');
});

test('a small map is not framed from inside itself', () => {
    const view = viewport();
    view.frameMap({ width: 3, height: 3, data: [], events: [] });
    assert.ok(view.view.distance >= 12);
});

test('3D preview refuses unsafe allocations before building geometry', () => {
    const view = viewport();
    assert.equal(view.previewBudgetError({
        width: 200,
        height: 200,
        data: new Array(200 * 200 * 6).fill(0)
    }), '', 'the validated 200x200 production-map size remains available');
    assert.match(view.previewBudgetError({ width: 201, height: 200, data: [] }), /40,000-cell limit/);
    assert.match(view.previewBudgetError({
        width: 200,
        height: 200,
        data: new Array(200 * 200 * 4).fill(2048)
    }), /too much tile geometry/);
});

test('the camera cannot be orbited under the ground or straight down', () => {
    const view = viewport();
    view.camera = null;   // applyCamera is a no-op without one

    view.orbit(0, 1000);
    assert.equal(view.view.pitch, 5, 'stops above the horizon');
    view.orbit(0, -1000);
    // Well short of overhead: standing art has nothing to show a camera looking
    // straight down at it, which is why an HD-2D game does not offer the angle.
    assert.equal(view.view.pitch, 72, 'stops short of looking down on standing art');
});

test('zoom is clamped at both ends', () => {
    const view = viewport();
    view.camera = null;

    for (let i = 0; i < 200; i++) view.zoom(-1);
    assert.equal(view.view.distance, 3);
    for (let i = 0; i < 400; i++) view.zoom(1);
    assert.equal(view.view.distance, 400);
});

//-----------------------------------------------------------------------------
// Events

test('every event trigger gets its own colour', () => {
    const view = viewport();
    const colors = [0, 1, 2, 3, 4].map(trigger => view.eventColor({ pages: [{ trigger }] }));
    assert.equal(new Set(colors).size, 5, 'a parallel process reads differently from a door');
    assert.equal(view.eventColor({}), view.eventColor({ pages: [{ trigger: 0 }] }),
        'and an event with no pages falls back rather than throwing');
});

//-----------------------------------------------------------------------------
// Handing the canvas back

test('turning 3D off returns the shared canvas to PIXI', () => {
    // TilemapManager owns the only GPU canvas. Three may borrow its context,
    // but must reset PIXI and must never destroy or hide the shared surface.
    assert.match(source, /sharedPixiRenderer\.resetState/);
    assert.match(source, /visible \|\| this\._sharedPixiRenderer \? 'block' : 'none'/);
    assert.equal(/app\.canvas\.(remove|destroy)/.test(source), false);
    assert.match(source, /\.custom-scrollbar/, 'and the scrollbars go with it');
});

test('the editor hands the runtime its classification', () => {
    // The runtime fetches this by XHR relative to the running game. There is no
    // running game here, and without it every wall is guessed, capped for being
    // too tall, and then laid flat on the floor as ground texture.
    assert.match(source, /Reactor3D\.setClassification/);
    assert.match(source, /CLASSIFICATION_FILE/);
    assert.match(source, /this\.loadClassification\(\)/);
});

test('the editor initializes the map scene with both authored passes visible', () => {
    assert.match(source, /this\.mapScene\.setPass\('all'\)/);
});

test('the editor composites starred geometry after events with fresh depth', () => {
    assert.match(source, /setPass\('below'\)/);
    assert.match(source, /this\.renderer\.clearDepth\(\)/);
    assert.match(source, /setPass\('above'\)/);
    assert.match(source, /this\.eventGroup\.visible = false/);
    assert.match(source, /this\.grid\.visible = false/);
    assert.match(source, /this\.hoverCell\.visible = false/);
});

test('a click selects an event but a drag does not', () => {
    assert.match(source, /travel > 4/);
    assert.match(source, /addEventListener\('dblclick'/);
    assert.match(mainSource, /onEventActivated[\s\S]{0,120}editEvent/);
});

test('picking tests the event meshes only', () => {
    // Ground and facades are one merged mesh per sheet, so a hit against them
    // identifies a sheet rather than a tile and is no use for picking. Name
    // labels are excluded too: they are overlays, and letting one be selected
    // also fought with the screen-space rescale that keeps them legible.
    assert.match(source, /intersectObjects\(this\.pickables, false\)/);
    assert.match(source, /this\.pickables\.push\(mesh\)/);
    assert.equal(/this\.pickables\.push\(label\)/.test(source), false);
});

test('name labels hold their size on screen as you zoom', () => {
    // A fixed world size meant a label swelled to fill the view up close and
    // vanished from a distance.
    const view = viewport();
    view.labels = [{ visible: true, scale: { setScalar(value) { this.value = value; } } }];

    view.view.distance = view.LABEL_REFERENCE;
    view.updateLabelVisibility();
    assert.equal(view.labels[0].scale.value, 1);

    view.view.distance = view.LABEL_REFERENCE * 2;
    view.updateLabelVisibility();
    assert.equal(view.labels[0].scale.value, 2, 'twice as far, twice as large in world units');

    view.view.distance = view.LABEL_DISTANCE + 1;
    view.updateLabelVisibility();
    assert.equal(view.labels[0].visible, false, 'and hidden once they would collide');
});

test('the default camera is not overhead', () => {
    const view = viewport();
    assert.ok(view.view.pitch < 45,
        'from overhead a standing facade is edge-on and 3D looks exactly like 2D');
});

test('an event with a character graphic gets its sprite, one without gets a cube', () => {
    // The 2D editor draws a bare coloured square for a graphic-less event, so
    // the 3D view does the same rather than showing nothing.
    const view = viewport();
    assert.equal(view.eventSprite({ pages: [{ image: { characterName: '' } }] }, {}), null);
    assert.equal(view.eventSprite({}, {}), null);
    assert.match(source, /isBigCharacter/, 'a $ sheet is one 3x4 block, not a 4x2 grid of them');
    assert.match(source, /sheet\.width \/ 12/, 'a normal sheet is 3 frames across 4 columns');
    assert.match(source, /sheet\.height \/ 8/, '4 directions down 2 rows');
});

test('right-clicking a mesh reaches the same menu the 2D map uses', () => {
    assert.match(source, /onEventContextMenu/);
    assert.match(mainSource, /onEventContextMenu[\s\S]{0,160}showContextMenu/);
});

test('selection follows whoever made it, in either direction', () => {
    // EventManager.selectEvent is the one funnel for the map, the events panel
    // and the editor, so the 3D view follows that rather than each of them.
    const eventManagerSource = fs.readFileSync(
        path.join(editorRoot, 'src', 'EventManager.js'), 'utf8');
    assert.match(eventManagerSource, /rr-event-selected/);
    assert.match(eventManagerSource, /this\.notifyEventSelected\(event\)/);
    assert.match(source, /addEventListener\('rr-event-selected'/);
    assert.match(mainSource, /onEventSelected[\s\S]{0,320}selectEventById/);
});

test('a sprite is brightened when selected, never dimmed when not', () => {
    // Fading the unselected ones would make every other event harder to read.
    assert.match(source, /mesh\.material\.color\.setHex\(on \? 0xfff2a0 : 0xffffff\)/);
});

test('the viewport says how to steer it', () => {
    // Orbit, pan and re-frame are not guessable from looking at a canvas, and
    // a viewport nobody can steer is a viewport nobody uses.
    assert.match(source, /createHint\(container\)/);
    assert.match(source, /map-3d-hint/);
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    assert.match(css, /\.map-3d-hint\b/);
    assert.match(css, /pointer-events: none/, 'the hint never intercepts a drag');
    assert.match(css, /\.map-3d-hint\.is-fading/, 'and it leaves on its own');
});

test('double-clicking empty space re-frames rather than doing nothing', () => {
    // Getting lost in an orbit camera is easy; without this there is no way home.
    assert.match(source, /if \(!cube\) \{[\s\S]{0,320}this\.frameMap\(mapData\)/);
});

test('asset caches are dropped when the project changes', () => {
    // They are keyed by file name, which is unique only within one project: a
    // second project with a same-named tileset would draw the first one's art.
    assert.match(source, /_cachedProjectPath/);
    assert.match(source, /this\.sheetImages = \{\};[\s\S]{0,80}this\.characterImages = \{\};/);
});

test('the canvas follows the container, not only the window', () => {
    // The sidebar divider resizes the canvas and fires no window resize event.
    assert.match(source, /new ResizeObserver/);
    assert.match(source, /this\._resizeObserver\.disconnect\(\)/, 'and is disconnected on teardown');
});

test('painting runs through the 2D map editor, not a second implementation', () => {
    // A parallel painting path would drift from the first and have to be fixed
    // twice; the 3D view only works out which tile the cursor is over.
    assert.match(source, /editor\.paintTile\(tile\.x, tile\.y\)/);
    assert.match(source, /editor\.beginEditState\(\)/);
    assert.match(source, /editor\.resetDrawingState\(true\)/);
});

test('a drag paints only when the palette has a selection', () => {
    // The same contract as the 2D canvas: with tiles selected a drag paints,
    // without them it orbits. Ctrl forces orbit either way.
    const view = viewport();
    view.projectController = { getTilemapManager: () => ({ currentMap: { width: 4, height: 4 } }) };

    const editor = { tilesetPaletteViewer: { selectedTiles: [] } };
    view.mapEditor = () => editor;
    assert.equal(view.canPaint(), false);

    editor.tilesetPaletteViewer.selectedTiles = [{ tileId: 5 }];
    assert.equal(view.canPaint(), true);

    editor.tilesetPaletteViewer.selectedTiles = [];
    editor.shadowPenMode = true;
    assert.equal(view.canPaint(), true, 'the shadow pen paints with no tile selected');
});

test('a raycast hit becomes a tile coordinate', () => {
    // The ground is one merged mesh per sheet, so a hit cannot name a tile —
    // but the world position can, since the map is one unit per tile.
    assert.match(source, /Math\.floor\(point\.x\)/);
    assert.match(source, /Math\.floor\(point\.z\)/);
    // In pixels, and a pixel is whatever size this project's tiles are: MZ
    // offers 48, 32, 24 and 16, and a hardcoded 48 put every quadrant offset
    // half a tile out on anything but the default.
    assert.match(source, /localX: \(point\.x - x\) \* this\.tilePixels\(\)/,
        'quadrant tools get pixel offsets in the project\'s tile size');
});

test('the scene has a sky and fog scaled to the map', () => {
    // Without them the map is a slab in a void and its edge is a hard line
    // against nothing.
    assert.match(source, /scene\.background = colour/);
    assert.match(source, /new THREE\.Fog\(colour/);
    assert.match(source, /--color-bg-base/, 'deep is pure black, which fog cannot fade into');
});
