const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, 'runtime');

const Reactor3D = require(path.join(runtimeRoot, 'reactor_3d.js'));
const mainSource = fs.readFileSync(path.join(runtimeRoot, 'reactor_main.js'), 'utf8');
const managersSource = fs.readFileSync(path.join(runtimeRoot, 'reactor_managers.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(runtimeRoot, 'reactor_3d.js'), 'utf8');

test('a map is 2D unless it says otherwise', () => {
    // The whole backwards-compatibility story rests on this default.
    assert.equal(Reactor3D.mapMode(null), Reactor3D.MODE_2D);
    assert.equal(Reactor3D.mapMode({}), Reactor3D.MODE_2D);
    assert.equal(Reactor3D.mapMode({ width: 20, height: 15, data: [], events: [] }),
        Reactor3D.MODE_2D);
    assert.equal(Reactor3D.isMap3D({ meta: {} }), false);
});

test('the map note opts a map in, and survives a round trip through RPG Maker', () => {
    // <3d> lives in the map's own note field, which RPG Maker preserves, so a
    // 3D map opened and re-saved by the original editor keeps its declaration.
    assert.equal(Reactor3D.mapMode({ meta: { '3d': true } }), Reactor3D.MODE_3D);
    assert.equal(Reactor3D.isMap3D({ meta: { '3d': true } }), true);
});

test('the sidecar overrides the note', () => {
    // The sidecar is the authored source; the note is a declaration that can
    // be left behind after 3D is switched back off.
    assert.equal(Reactor3D.mapMode({ meta: { '3d': true }, reactor3d: { mode: '2d' } }),
        Reactor3D.MODE_2D);
    assert.equal(Reactor3D.mapMode({ reactor3d: { mode: '3d' } }), Reactor3D.MODE_3D);
    // An unrecognised mode is not a licence to guess.
    assert.equal(Reactor3D.mapMode({ reactor3d: { mode: 'isometric' } }), Reactor3D.MODE_2D);
});

test('elevation reads flat wherever data is absent', () => {
    // A 3D map with no elevation painted is a flat plane, not an error: that is
    // the state every existing 2D map is in the moment it is switched over.
    const bare = { width: 4, height: 4 };
    assert.equal(Reactor3D.elevationAt(bare, 0, 0), 0);
    assert.equal(Reactor3D.elevationAt(bare, 3, 3), 0);
    assert.equal(Reactor3D.elevationAt(null, 0, 0), 0);
    assert.equal(Reactor3D.elevationAt({ width: 2, height: 2, reactor3d: {} }, 1, 1), 0);
});

test('elevation is indexed row-major like the tile planes', () => {
    // Same layout as $dataMap.data, so the two can be walked together.
    const map = { width: 3, height: 2, reactor3d: { elevation: [0, 1, 2, 3, 4, 5] } };
    assert.equal(Reactor3D.elevationAt(map, 0, 0), 0);
    assert.equal(Reactor3D.elevationAt(map, 2, 0), 2);
    assert.equal(Reactor3D.elevationAt(map, 0, 1), 3);
    assert.equal(Reactor3D.elevationAt(map, 2, 1), 5);
});

test('out-of-range and malformed elevation cannot throw', () => {
    const map = { width: 2, height: 2, reactor3d: { elevation: [0, 'x', null, undefined] } };
    assert.equal(Reactor3D.elevationAt(map, -1, 0), 0);
    assert.equal(Reactor3D.elevationAt(map, 0, -1), 0);
    assert.equal(Reactor3D.elevationAt(map, 5, 5), 0);
    assert.equal(Reactor3D.elevationAt(map, 1, 0), 0, 'a non-number reads as flat');
    assert.equal(Reactor3D.elevationAt(map, 0, 1), 0);
    assert.equal(Reactor3D.elevationAt({ width: 2, height: 2, reactor3d: { elevation: 'nope' } }, 0, 0), 0);
});

test('a fresh sidecar covers the whole grid', () => {
    const sidecar = Reactor3D.createSidecar(20, 15);
    assert.equal(sidecar.elevation.length, 20 * 15);
    assert.ok(sidecar.elevation.every(value => value === 0));
    assert.equal(sidecar.mode, Reactor3D.MODE_3D);
    assert.equal(sidecar.version, 1);
    assert.ok(sidecar.camera && Number.isFinite(sidecar.camera.pitch));
});

test('three.js is not in the boot manifest', () => {
    // It is ~2 MB. A project with no 3D maps must never download or parse it,
    // so it loads on demand rather than at startup.
    // Match the URL, not the word: the manifest comment explains why three.js
    // is absent, and would otherwise trip this.
    assert.doesNotMatch(mainSource, /"js\/libs\/three\.js"/,
        'three.js must not be a startup script');
    assert.match(mainSource, /"js\/reactor_3d\.js"/,
        'but the small namespace module is, so map mode can be read at boot');
    assert.match(moduleSource, /Reactor3D\.ensureLoaded = function/);
});

test('the namespace module loads before the managers that use it', () => {
    // DataManager.loadMapSidecar reads Reactor3D.SIDECAR_SUFFIX.
    const three = mainSource.indexOf('"js/reactor_3d.js"');
    const managers = mainSource.indexOf('"js/reactor_managers.js"');
    assert.ok(three >= 0 && managers > three);
});

test('only a 3D map asks for a sidecar', () => {
    // Otherwise every map load in every 2D project pays for a 404.
    const at = managersSource.indexOf('DataManager.loadMapSidecar = function');
    assert.ok(at >= 0);
    const body = managersSource.slice(at, managersSource.indexOf('\n};', at));
    assert.match(body, /if \(!mapData \|\| !mapData\.meta \|\| !mapData\.meta\["3d"\]\) return;/);
    assert.match(body, /typeof Reactor3D === "undefined"/,
        'and it degrades if the namespace is somehow absent');
});

test('a 3D map with no painted sidecar issues no doomed request', () => {
    // A <3d> map whose elevation was never painted has no sidecar file, and
    // the request for it logs a network error the page cannot suppress —
    // console noise on every entry to that map. Under NW.js the disk answers
    // first and the request is skipped entirely.
    const at = managersSource.indexOf('DataManager.loadMapSidecar = function');
    const body = managersSource.slice(at, managersSource.indexOf('\n};', at));
    assert.match(body, /Utils\.isNwjs\(\)/);
    assert.match(body, /fs\.existsSync\(path\.join\(base, url\)\)/);
    const check = body.indexOf('existsSync');
    const send = body.indexOf('xhr.send');
    assert.ok(check >= 0 && check < send, 'the disk check precedes the request');
});

test('a missing or broken sidecar does not block the map', () => {
    const at = managersSource.indexOf('DataManager.loadMapSidecar = function');
    const body = managersSource.slice(at, managersSource.indexOf('\n};', at));
    // A 404 clears the gate rather than stalling isMapLoaded forever.
    assert.match(body, /xhr\.onerror = \(\) => \{\s*\n\s*this\._mapSidecarPending = false;/);
    assert.match(body, /if \(xhr\.status < 400\)/);
    assert.match(body, /catch \(e\) \{[\s\S]*console\.error/, 'bad JSON is reported, not thrown');
});

test('the scene waits for the sidecar before choosing a renderer', () => {
    assert.match(managersSource,
        /return !!\$dataMap && !this\._mapSidecarPending;/);
    // And a new map load clears the gate up front, so a previous map's pending
    // flag cannot leak into this one.
    const at = managersSource.indexOf('DataManager.loadMapData = function');
    const body = managersSource.slice(at, managersSource.indexOf('\n};', at));
    assert.match(body, /this\._mapSidecarPending = false;/);
});

test('the 3D canvas sits under the game canvas and takes no input', () => {
    // PIXI keeps drawing every window, picture and plugin sprite on top; the
    // pattern matches the Effekseer overlay the runtime already ships.
    // The canvas path; on a shared context there is no second canvas at all.
    const at = moduleSource.indexOf('Reactor3D.Viewport.prototype._initializeCanvas');
    const body = moduleSource.slice(at, moduleSource.indexOf('\n};', at));
    assert.match(body, /style\.zIndex = 0;/);
    assert.match(body, /style\.pointerEvents = "none";/);

    // Placement is re-applied on every resize, not just at construction, so the
    // two canvases cannot drift apart when the window scales.
    const resizeAt = moduleSource.indexOf('Reactor3D.Viewport.prototype.resize');
    const resize = moduleSource.slice(resizeAt, moduleSource.indexOf('\n};', resizeAt));
    assert.match(resize, /Graphics\._centerElement/,
        'reusing the engine centring so the canvases cannot drift apart');
    assert.match(resize, /Graphics\.width/);
});

test('the vendored three.js is a classic script exposing window.THREE', () => {
    // The runtime injects plain <script> tags; three ships ESM and CJS only.
    const lib = path.join(runtimeRoot, 'libs', 'three.js');
    assert.ok(fs.existsSync(lib), 'the vendored build is committed');
    const head = fs.readFileSync(lib, 'utf8').slice(0, 1200);
    assert.match(head, /GENERATED FILE/);
    assert.match(head, /vendor-three\.js/, 'and says how to regenerate it');
    const tail = fs.readFileSync(lib, 'utf8').slice(-400);
    assert.match(tail, /root\.THREE = module\.exports;/);
});

test('the vendored build actually loads and exposes what the renderer needs', () => {
    const sandbox = { window: {} };
    sandbox.globalThis = sandbox;
    const vm = require('node:vm');
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'libs', 'three.js'), 'utf8'), sandbox);
    const THREE = sandbox.THREE;
    assert.ok(THREE, 'window.THREE is defined');
    for (const name of ['Scene', 'WebGLRenderer', 'PerspectiveCamera', 'InstancedMesh',
                        'BoxGeometry', 'MeshBasicMaterial', 'Texture', 'Sprite']) {
        assert.equal(typeof THREE[name], 'function', `THREE.${name} is present`);
    }
});

test('every runtime module is in the boot manifest', () => {
    // reactor_3d_geometry.js was committed, synced to the Demo, and covered by
    // tests while never being loaded by a running game: the existing guards
    // check that manifest entries are committed and that the Demo matches
    // runtime/, but nothing checked the reverse direction.
    const manifest = new Set(
        (mainSource.match(/"js\/[^"]+\.js"/g) || [])
            .map(entry => entry.replace(/^"js\/|"$/g, ''))
    );
    const unwired = fs.readdirSync(runtimeRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
        // reactor_main.js is the entry point itself: index.html loads it, and
        // it is what declares the manifest.
        .filter(entry => entry.name !== 'reactor_main.js')
        .map(entry => entry.name)
        .filter(name => !manifest.has(name));

    assert.deepEqual(unwired, [],
        `these runtime modules are never loaded by the game:\n${unwired.join('\n')}`);
});

test('the geometry section depends on neither THREE nor the DOM', () => {
    // That independence is what lets the tile-addressing arithmetic be verified
    // in Node rather than by looking at a viewport. It lives in the same file as
    // the viewport now — runtime code is organised as a few large modules, not
    // one per function — so the boundary is held by this test rather than by a
    // file split.
    const at = moduleSource.indexOf('Reactor3D.Geometry = {};');
    assert.ok(at >= 0, 'the geometry section is present');
    // Bounded by the next section banner: the sections after it legitimately
    // use THREE, and slicing to end-of-file would sweep them in.
    const nextSection = moduleSource.indexOf('\n//----', at);
    assert.ok(nextSection > at, 'the geometry section is followed by another');
    const raw = moduleSource.slice(at, nextSection);
    // Comments explain the boundary, so they name the very things the code must
    // not touch; strip them before looking.
    const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(code, /\bTHREE\b/, 'no three.js');
    assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|\bcanvas\b/i, 'no DOM');
    // And it must keep returning plain typed arrays rather than THREE objects.
    assert.match(code, /Float32Array\.from/);
});

test('the 3D subsystem stays one runtime module', () => {
    // Projects carry their own copy of every runtime file, so a file per feature
    // turns each project's js/ into a directory nobody can scan. Stock MZ ships
    // eight; the convention here is a few large modules organised by concern.
    const roots = fs.readdirSync(runtimeRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
        .map(entry => entry.name);
    const threeD = roots.filter(name => name.startsWith('reactor_3d'));
    assert.deepEqual(threeD, ['reactor_3d.js'],
        'scene, camera and billboards belong in reactor_3d.js, not new files');
    assert.ok(roots.length <= 12, `runtime js/ root has grown to ${roots.length} files`);
});

//-----------------------------------------------------------------------------
// Scene integration
//
// The switch is the part that must not disturb 2D projects, so these check the
// shape of the integration rather than what it renders.

const spritesSource = fs.readFileSync(path.join(runtimeRoot, 'reactor_sprites.js'), 'utf8');
const scenesSource = fs.readFileSync(path.join(runtimeRoot, 'reactor_scenes.js'), 'utf8');

test('the tilemap survives 3D mode; only its ground layers are hidden', () => {
    // Characters, the shadow, the destination marker and every plugin-authored
    // sprite parent to the Tilemap, and it is the effects container. Replacing
    // it would take all of that with it.
    const at = spritesSource.indexOf('Spriteset_Map.prototype.createReactor3D');
    assert.ok(at >= 0);
    const body = spritesSource.slice(at, spritesSource.indexOf('\n};', at));
    assert.match(body, /_lowerLayer\.visible = false/);
    assert.match(body, /_upperLayer\.visible = false/);
    // createTilemap must still build one unconditionally.
    const create = spritesSource.slice(
        spritesSource.indexOf('Spriteset_Map.prototype.createTilemap'),
        spritesSource.indexOf('Spriteset_Map.prototype.createReactor3D'));
    assert.match(create, /const tilemap = new Tilemap\(\);/);
    assert.doesNotMatch(create, /if \(.*Reactor3D.*\)\s*\{[\s\S]*new Tilemap/,
        'the tilemap is not built conditionally');
});

test('a 2D map takes none of the 3D path', () => {
    const at = spritesSource.indexOf('Spriteset_Map.prototype.createReactor3D');
    const body = spritesSource.slice(at, spritesSource.indexOf('\n};', at));
    assert.match(body, /if \(typeof Reactor3D === "undefined"\) return;/);
    assert.match(body, /if \(!Reactor3D\.shouldRender3D\(\$dataMap\)\) \{/,
        'the gate is still the first thing after the module check');
    assert.match(body, /this\._reactor3d = null;/, 'and leaves no state behind');

    // It returns before anything is acquired: a 2D map must not create a
    // viewport, a scene or a camera. The gate may explain itself on the way
    // out — see `renderBlocker` — but it must still leave.
    const gate = body.indexOf('shouldRender3D');
    assert.ok(gate < body.indexOf('acquireViewport'), 'and before the viewport');
    assert.ok(gate < body.indexOf('new Reactor3D.MapScene'), 'and before the scene');
});

test('the camera is aimed before the sprites that project through it', () => {
    // Otherwise characters read last frame's camera and trail the ground while
    // scrolling.
    const update = spritesSource.slice(
        spritesSource.indexOf('Spriteset_Map.prototype.update = function'),
        spritesSource.indexOf('Spriteset_Map.prototype.updateTileset'));
    const aim = update.indexOf('this.updateReactor3DCamera();');
    const tilemap = update.indexOf('this.updateTilemap();');
    const base = update.indexOf('Spriteset_Base.prototype.update.call(this);');
    const render = update.indexOf('this.updateReactor3D();');
    assert.ok(aim >= 0 && aim < tilemap, 'aimed before the tilemap receives the camera');
    assert.ok(aim < base, 'and before character sprites project through it');
    assert.ok(render > base, 'the 3D world renders after child updates');
});

test('runtime 3D advances A1 UVs from the tilemap animation clock', () => {
    const at = spritesSource.indexOf('Spriteset_Map.prototype.updateReactor3D = function');
    const body = spritesSource.slice(at, spritesSource.indexOf('\n};', at));
    const animate = body.indexOf('state.scene.setAnimationFrame(frame);');
    const render = body.indexOf('state.viewport.renderPass');
    assert.match(body, /this\._tilemap\.animationFrame/);
    assert.ok(animate >= 0 && animate < render,
        'animated UVs move before either runtime render pass is captured');
});

test('the combined 3D preview draws starred colour after ordinary colour', () => {
    assert.match(moduleSource,
        /mesh\.renderOrder = \(group\.above \? 10 : 0\) \+ \(group\.layer \|\| 0\);/,
        'transparent sheet centroids cannot invert tilemap passes or authored map layers');
    assert.doesNotMatch(moduleSource, /_supportMeshes/,
        'starred alpha is not duplicated into a runtime-only lower colour pass');
});

test('character sprites fall back to the stock position in 2D', () => {
    const at = spritesSource.indexOf('Sprite_Character.prototype.updateReactor3DPosition');
    assert.ok(at >= 0);
    const body = spritesSource.slice(at, spritesSource.indexOf('\n};', at));
    assert.match(body, /if \(typeof Reactor3D === "undefined"\) return false;/);
    assert.match(body, /if \(!camera \|\| !Reactor3D\.shouldRender3D\(\$dataMap\)\) return false;/);
    // And the stock path runs whenever that returns false.
    const position = spritesSource.slice(
        spritesSource.indexOf('Sprite_Character.prototype.updatePosition = function'),
        at);
    assert.match(position, /if \(this\.updateReactor3DPosition\(\)\) return;/);
    assert.match(position, /this\.x = this\._character\.screenX\(\);/);
});

test('the map waits for three.js before building its spriteset', () => {
    assert.match(scenesSource, /Reactor3D\.beginPrepare\(\$dataMap\)/);
    assert.match(scenesSource, /if \(typeof Reactor3D !== "undefined" && !Reactor3D\.isPrepared\(\)\) return false;/);
});

test('a 3D map releases its GPU allocations on the way out', () => {
    // Geometry, materials and textures are not reclaimed by the collector, so
    // leaving them behind leaks a map's worth on every transfer.
    const at = spritesSource.indexOf('Spriteset_Map.prototype.destroy = function');
    const body = spritesSource.slice(at, spritesSource.indexOf('\n};', at));
    assert.match(body, /this\._reactor3d\.scene\.destroy\(\)/);
    assert.match(body, /this\._reactor3d = null;/);

    const clear = moduleSource.slice(
        moduleSource.indexOf('Reactor3D.MapScene.prototype.clear'),
        moduleSource.indexOf('Reactor3D.MapScene.prototype.destroy'));
    assert.match(clear, /geometry\.dispose\(\)/);
    assert.match(clear, /material\.dispose\(\)/);
    assert.match(clear, /texture\.dispose\(\)/);
});

test('tile textures stay crisp when enlarged and preserve alpha when reduced', () => {
    const at = moduleSource.indexOf('Reactor3D.MapScene.prototype.textureFor');
    const body = moduleSource.slice(at, moduleSource.indexOf('\n};', at));
    assert.match(body, /magFilter = THREE\.NearestFilter/);
    assert.match(body, /minFilter = THREE\.LinearFilter/);
    assert.match(body, /generateMipmaps = false/);
});

test('the sheet size comes from the bitmap, not an assumed 768', () => {
    // A project can ship a sheet of any size; assuming one stretches its UVs.
    const at = moduleSource.indexOf('Reactor3D.MapScene.prototype.build');
    const body = moduleSource.slice(at, moduleSource.indexOf('\n};', at));
    assert.match(body, /\(bitmap && bitmap\.width\) \|\| 768/);
    assert.match(body, /\(bitmap && bitmap\.height\) \|\| 768/);
});
