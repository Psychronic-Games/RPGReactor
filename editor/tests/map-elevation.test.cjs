/**
 * The height field, and the brush that paints it.
 *
 * Massing is the one thing a 2D map cannot imply — impassable says a cell is
 * built up, never how high — so it is painted rather than guessed. It lives in
 * `Map###.r3d.json`, never in `Map###.json`, which is the whole reason a 3D map
 * stays an ordinary RPG Maker map.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const elevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const quietConsole = Object.create(console);
quietConsole.log = quietConsole.warn = quietConsole.error = () => {};

function loadBrowserClass(relativePath, className, globals = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', relativePath), 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: quietConsole, process, require, nw: {},
        RRMapElevation: elevation,
        document: { addEventListener() {}, removeEventListener() {} },
        ...globals
    });
}

const mapOf = (width, height, id = 3) =>
    ({ id, width, height, data: new Array(width * height * 6).fill(0) });

//-----------------------------------------------------------------------------
// The model

test('an unpainted map reads as flat rather than as missing', () => {
    const map = mapOf(4, 3);
    assert.equal(elevation.at(map, 2, 1), 0);
    assert.equal(map.reactor3d, undefined, 'and gains nothing by being asked');
});

test('the editor and the runtime read the same array', () => {
    // Two implementations of "how high is this cell" would drift, and the
    // symptom would be a 3D view that disagrees with the brush that made it.
    const map = mapOf(4, 3);
    elevation.setAt(map, 2, 1, 4);
    assert.equal(Reactor3D.elevationAt(map, 2, 1), 4);
    assert.equal(Reactor3D.elevationAt(map, 0, 0), 0);
});

test('heights are clamped rather than trusted', () => {
    const map = mapOf(3, 3);
    elevation.setAt(map, 0, 0, 9999);
    assert.equal(elevation.at(map, 0, 0), elevation.MAX);
    elevation.setAt(map, 0, 0, -12);
    assert.equal(elevation.at(map, 0, 0), elevation.MIN);
    elevation.setAt(map, 0, 0, 2.6);
    assert.equal(elevation.at(map, 0, 0), 3, 'and rounded to whole tiles');
});

test('a cell outside the map is not writable', () => {
    const map = mapOf(3, 3);
    assert.equal(elevation.setAt(map, -1, 0, 5), false);
    assert.equal(elevation.setAt(map, 3, 0, 5), false);
    assert.equal(elevation.snapshot(map).every(value => value === 0), true);
});

test('a resized map keeps the heights of the cells it still has', () => {
    const map = mapOf(4, 4);
    elevation.setAt(map, 1, 1, 3);
    elevation.setAt(map, 3, 3, 5);

    map.width = 3;
    map.height = 3;
    elevation.ensure(map);

    assert.equal(elevation.snapshot(map).length, 9);
    assert.equal(elevation.at(map, 1, 1), 3, 'a cell that survived kept its height');
});

test('a snapshot from another size is refused rather than written', () => {
    // Map Properties can resize between a stroke and its undo, and restoring
    // the old array would leave a sidecar that disagrees with its own map.
    const map = mapOf(3, 3);
    elevation.setAt(map, 0, 0, 2);
    const snapshot = elevation.snapshot(map);

    map.width = 4;
    elevation.ensure(map);
    assert.equal(elevation.restore(map, snapshot), false);
    assert.equal(elevation.snapshot(map).length, 12, 'and leaves the sidecar consistent');
});

//-----------------------------------------------------------------------------
// Persistence

test('the sidecar is written beside the map, never into it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-elevation-'));
    fs.mkdirSync(path.join(root, 'data'));
    try {
        const map = mapOf(3, 3, 12);
        elevation.setAt(map, 1, 1, 2);
        assert.equal(elevation.save(fs, path, root, map), true);

        const file = path.join(root, 'data', 'Map012.r3d.json');
        assert.equal(fs.existsSync(file), true);
        const written = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(written.elevation[4], 2);
        assert.equal(written.mode, '3d');

        // And the runtime reads what the editor wrote.
        const reloaded = mapOf(3, 3, 12);
        reloaded.reactor3d = written;
        assert.equal(Reactor3D.elevationAt(reloaded, 1, 1), 2);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('flattening a map takes its sidecar away again', () => {
    // A 2D project must not accumulate files full of zeroes, and a stale one
    // would go on claiming the map is 3D.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-elevation-'));
    fs.mkdirSync(path.join(root, 'data'));
    try {
        const map = mapOf(3, 3, 5);
        elevation.setAt(map, 0, 0, 1);
        elevation.save(fs, path, root, map);
        const file = path.join(root, 'data', 'Map005.r3d.json');
        assert.equal(fs.existsSync(file), true);

        elevation.setAt(map, 0, 0, 0);
        elevation.save(fs, path, root, map);
        assert.equal(fs.existsSync(file), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a sidecar that only holds event models is kept', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-elevation-'));
    fs.mkdirSync(path.join(root, 'data'));
    try {
        const map = mapOf(3, 3, 8);
        Reactor3D.setEventModelSpec(map, 22, 0, { name: 'Oth97_CNO_Consul', size: 20, yaw: -90 });
        assert.equal(elevation.save(fs, path, root, map), true);
        const file = path.join(root, 'data', 'Map008.r3d.json');
        assert.equal(fs.existsSync(file), true);
        const written = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.equal(written.events['22']['0'].name, 'Oth97_CNO_Consul');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the map file never carries the sidecar', () => {
    // This is the compatibility promise: Map###.json stays data RPG Maker, the
    // engine and every plugin can read. The sidecar is attached to the loaded
    // map so the 3D view can see it, which is exactly how it could leak.
    const TilemapManager = loadBrowserClass('TilemapManager.js', 'TilemapManager');
    const manager = Object.create(TilemapManager.prototype);
    manager.currentMap = Object.assign(mapOf(2, 2, 9), {
        name: 'Town', reactor3d: { version: 1, mode: '3d', elevation: [1, 0, 0, 0] }
    });

    const persisted = manager.getPersistedMapData();
    assert.equal('reactor3d' in persisted, false, 'the sidecar is stripped');
    assert.equal('id' in persisted, false);
    assert.equal('name' in persisted, false);
    assert.equal(persisted.data.length, 2 * 2 * 6, 'and the tiles are untouched');
});

//-----------------------------------------------------------------------------
// The brush

function editorWithMap(width, height) {
    const MapEditor = loadBrowserClass('MapEditor.js', 'MapEditor');
    const editor = Object.create(MapEditor.prototype);
    editor.tilemapManager = { currentMap: mapOf(width, height) };
    editor.undoStack = [];
    editor.redoStack = [];
    editor.maxUndoSteps = 50;
    editor.heightMode = true;
    editor.heightLevel = 1;
    editor.heightAction = 'set';
    editor.heightBrush = 1;
    editor.activeElevationState = null;
    editor.onElevationChanged = null;
    editor.notifyUndoStateChange = () => {};
    editor.notifyMapEdited = () => {};
    return editor;
}

test('tile entries still validate the way they always did', () => {
    const editor = editorWithMap(4, 4);
    const tiles = new Array(4 * 4 * 6).fill(0);
    assert.equal(editor.isUndoSnapshotValid(tiles), true);
    assert.equal(editor.isUndoSnapshotValid(new Array(10).fill(0)), false);
});

test('the note is the switch and the sidecar is the data', () => {
    // The runtime only fetches Map###.r3d.json for a map whose note carries
    // <3d>, which is what keeps a 2D project from requesting a file per map
    // that is not there. A map with a painted height field and no note
    // therefore renders flat in game, and the sidecar's own `mode` is never
    // read because nothing asked for the file.
    const runtime = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
    assert.match(runtime, /if \(!mapData \|\| !mapData\.meta \|\| !mapData\.meta\["3d"\]\) return;/,
        'the note still gates the fetch');

    const map = { note: 'a note' };
    assert.equal(elevation.hasNote(map), false);
    assert.equal(elevation.addNote(map), true);
    assert.match(map.note, /<3d>/);
    assert.equal(elevation.addNote(map), false, 'and is not added twice');

    assert.equal(elevation.removeNote(map), true);
    assert.equal(elevation.hasNote(map), false);
    assert.equal(map.note, 'a note', 'the rest of the note survives');
});

test('an existing note is added to rather than replaced', () => {
    const map = { note: '<parallax>\nsomething else' };
    elevation.addNote(map);
    assert.match(map.note, /<parallax>/);
    assert.match(map.note, /something else/);
    assert.match(map.note, /<3d>/);
});

test('the meta the runtime reads is kept in step', () => {
    // DataManager populates `meta` from the note when it loads; inside the
    // editor the map is already loaded, so both have to move together or the
    // 3D view and the note disagree until the next launch.
    const map = { note: '', meta: {} };
    elevation.addNote(map);
    assert.equal(map.meta['3d'], true);
    elevation.removeNote(map);
    assert.equal('3d' in map.meta, false);
});

test('a 3D map that renders flat says why', () => {
    // Every gate between "the note says <3d>" and "the scene is built" could
    // fail quietly and leave an ordinary 2D map on screen, which looks exactly
    // like the feature not existing. There is nothing to debug from that.
    const map3D = { meta: { '3d': true } };
    const map2D = { meta: {} };

    assert.equal(typeof Reactor3D.renderBlocker(map2D), 'string',
        'a 2D map has a reason too, for whoever asks');
    assert.match(Reactor3D.renderBlocker(map2D), /not marked 3D/);

    // Outside a browser there is no WebGL to find, which is the honest answer.
    const blocker = Reactor3D.renderBlocker(map3D);
    assert.equal(typeof blocker, 'string');
    assert.ok(blocker.length > 20, 'and it says something usable');

    // Only a map that asked for 3D gets a warning; an ordinary map must stay
    // silent or every project prints noise on every map.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /if \(blocker && Reactor3D\.isMap3D\(\$dataMap\)\)/);
});

test('the scene waits for three.js before it builds the spriteset', () => {
    // The spriteset decides which renderer it is building the moment it is
    // created, so starting the fetch and calling onMapLoaded in the same tick
    // drew a 3D map in 2D every time — with three.js sitting right there in
    // js/libs, which makes the symptom look impossible.
    const scenes = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_scenes.js'), 'utf8');
    const at = scenes.indexOf('Scene_Map.prototype.isReady = function');
    const body = scenes.slice(at, scenes.indexOf('\n};', at));

    const prepare = body.indexOf('Reactor3D.beginPrepare($dataMap)');
    const wait = body.indexOf('if (!Reactor3D.isPrepared()) return false;');
    const build = body.indexOf('this.onMapLoaded();');
    assert.ok(prepare >= 0 && wait >= 0 && build >= 0);
    assert.ok(prepare < wait, 'the fetch starts first');
    assert.ok(wait < build, 'and the spriteset is not built until it has landed');

    // Started once: calling beginPrepare every frame of the wait would set
    // _prepared back to false as fast as the load cleared it.
    assert.match(body, /if \(!this\._reactor3dPrepareStarted\)/);
});

test('a rebuild does not throw away where the author is looking', () => {
    // A rebuild runs on every edit. Re-framing the map each time reset the
    // orbit target and the zoom, which reads as the camera being broken rather
    // than as a deliberate reset — and it got much worse once rebuilds started
    // happening during a drag rather than after it.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    const at = source.indexOf('    async rebuild() {');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /if \(framing !== this\._framedMap\)/,
        'framing is per map, not per rebuild');
    assert.match(body, /\$\{mapData\.id\}:\$\{mapData\.width\}x\$\{mapData\.height\}/,
        'and a resize counts as a different map, since the old framing will not fit');

    // Double-clicking empty space is still the way home, and is now the only
    // thing that moves the camera on the author's behalf.
    assert.match(source, /Nothing under the cursor: put the whole map back in view/);
});

test('a rebuild does not overwrite unsaved elevation', () => {
    // attachSidecar re-reads Map###.r3d.json. Called from rebuild — which runs
    // on every edit — it would replace heights painted since the last save with
    // whatever is still on disk, so the brush would undo itself a few strokes
    // in.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    const at = source.indexOf('    attachSidecar(mapData) {');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /if \(mapData\.reactor3d\) return;/,
        'the file is read only when the map has nothing in hand');
    assert.ok(body.indexOf('if (mapData.reactor3d) return;') < body.indexOf('readFileSync'),
        'and the guard comes before the read');
});

//-----------------------------------------------------------------------------
// A view that fails must not take the map with it

test('a failed 3D scene falls back to 2D instead of retrying forever', () => {
    // createReactor3D runs inside createTilemap, inside onMapLoaded, which the
    // scene calls from isReady — and isReady only marks the map loaded after
    // that returns. A throw therefore left the scene reloading the map every
    // frame: a white screen, and a fresh WebGL context each time until the
    // browser started evicting live ones.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const at = sprites.indexOf('Spriteset_Map.prototype.createReactor3D = function');
    const body = sprites.slice(at, sprites.indexOf('\n};', at));

    assert.match(body, /try \{/, 'building the scene is contained');
    assert.match(body, /this\._reactor3dFailed = true;/, 'and not retried after it fails');
    assert.match(body, /this\._tilemap\.lowerLayerVisible = true;/,
        'the 2D ground is put back rather than left hidden');
});

test('the viewport is not leaked when it cannot be built', () => {
    // The constructor takes a WebGL context before anything else, so a throw
    // after that left the context alive and unreferenced.
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = source.indexOf('Reactor3D.acquireViewport = function');
    const body = source.slice(at, source.indexOf('\n};', at));
    assert.match(body, /if \(this\._viewportFailed\) return null;/, 'one attempt only');
    assert.match(body, /built\.destroy\(\)/, 'and a half-built one is disposed');

    const init = source.slice(source.indexOf('Reactor3D.Viewport.prototype.initialize'));
    assert.match(init.slice(0, init.indexOf('\n};')), /this\._renderer\.dispose\(\)/,
        'the context is given back if the rest of the constructor dies');
});

test('the 3D scene waits for the tileset sheets it draws with', () => {
    // createTilemap starts the sheet loads and built the scene in the same
    // breath, so the textures were read from empty bitmaps and the map came up
    // blank. The 2D tilemap has no such problem: it redraws as sheets arrive.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Spriteset_Map\.prototype\.isReactor3DTilesetReady = function/);
    assert.match(sprites, /this\._reactor3dPending = true;/);

    // Retried from update, not waited for up front: a sheet that never arrives
    // must leave a 2D map rather than a hung game.
    const update = sprites.slice(sprites.indexOf('Spriteset_Map.prototype.updateReactor3D = function'));
    assert.match(update.slice(0, 400), /if \(this\._reactor3dPending && !this\._reactor3dFailed\)/);
});

test('asking whether 3D is supported does not cost a WebGL context each time', () => {
    // The probe takes a real context to find out, and shouldRender3D calls it —
    // which every character sprite calls on every frame. A map with a hundred
    // events took a hundred contexts per frame and gave none back, so the
    // browser evicted live ones and took PIXI's renderer down with them.
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const at = source.indexOf('Reactor3D.isSupported = function');
    const body = source.slice(at, source.indexOf('\n};', at));

    assert.match(body, /this\._supported !== null/, 'the answer is remembered');
    assert.match(body, /WEBGL_lose_context/, 'and the probe context is handed back');

    // Driven for real: one probe however many times it is asked.
    const probed = { count: 0 };
    const sandbox = {
        document: {
            createElement() {
                probed.count++;
                return { getContext: () => ({ getExtension: () => ({ loseContext() {} }) }) };
            }
        },
        module: { exports: {} },
        console
    };
    sandbox.window = sandbox;
    vm.runInNewContext(source, sandbox);
    const Fresh = sandbox.module.exports;
    for (let i = 0; i < 200; i++) Fresh.isSupported();
    assert.equal(probed.count, 1, `probed ${probed.count} times instead of once`);
    assert.equal(Fresh.isSupported(), true);
});

test('the corescript WebGL probe is answered once as well', () => {
    // MV compat exposes this as Graphics.hasWebGL(), which MV plugins call
    // freely and some call every frame — the same leak by another route.
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const at = core.indexOf('Utils.canUseWebGL = function');
    const body = core.slice(at, core.indexOf('\n};', at));
    assert.match(body, /Utils\._canUseWebGL !== undefined/, 'remembered');
    assert.match(body, /WEBGL_lose_context/, 'and the probe context handed back');

    // And the shim that MV plugins reach it through still routes here.
    const compat = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    assert.match(compat, /Graphics\.hasWebGL = function\(\) \{[\s\S]{0,200}Utils\.canUseWebGL/);
});

test('the 3D ground is drawn into the PIXI scene, not behind it', () => {
    // Stacked canvases put the ground outside the scene, and everything a game
    // draws *over* the map assumes it is in there: a MULTIPLY fog had nothing
    // to multiply against and composited as a flat wash — fog read heavier in
    // 3D than in 2D — and the screen tone, a filter on the spriteset, never
    // reached the ground at all. It is a sprite in the scene now, where the
    // tilemap's ground used to be.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');

    assert.match(sprites, /Spriteset_Map\.prototype\.createReactor3DSprite = function/);
    assert.match(sprites, /viewport\.detachFromPage\(\);/,
        'the three canvas stops presenting itself');
    assert.match(sprites, /holder\.addChildAt\(sprite/,
        'and becomes a child of the spriteset, under the tone filter');
    // Inside the tilemap, at the layer it stands in for — not merely beneath
    // it. Parked outside, anything a plugin adds *inside* the tilemap draws
    // over the 3D ground, and parallax plugins do exactly that: MultiParallax
    // adds a TilingSprite per layer to the tilemap, which hid the whole world
    // while the star-flagged pass, sorted to `z` 4, came through untouched.
    // The symptom is oddly specific and reads as a Reactor bug with no cause:
    // tiles marked `*` appear in 3D and tiles marked `X` or `O` do not.
    assert.match(sprites, /this\._reactor3dBelow = make\(this\._tilemap, 0\);/,
        'the ground goes where the tilemap ground was');
    assert.match(sprites, /this\._reactor3dBelow\.sprite\.z = 0;/,
        'sorted to the lower layer, since the tilemap re-sorts by z every frame');
    // Sorting rather than suppressing: a layer the author put behind the map
    // stays behind it, so a starfield still shows around the world instead of
    // being turned off with it.
    assert.doesNotMatch(sprites, /suppressReactor3DParallaxLayers/,
        'a backdrop is sorted behind, never hidden');

    // The render has to reach PIXI every frame or the sprite shows frame one
    // forever, and each pass must be uploaded before the next overwrites the
    // canvas it came off.
    const update = sprites.slice(sprites.indexOf('Spriteset_Map.prototype.updateReactor3D = function'));
    const body = update.slice(0, update.indexOf('\n};'));
    // Model maps render "world"/"overlay", legacy maps "below"/"above"; the
    // draw-then-upload ordering is the invariant either way.
    const belowDraw = body.indexOf('modelsInWorld ? "world" : (split ? "below" : "all")');
    const belowUp = body.indexOf('updateReactor3DTexture(this._reactor3dBelow');
    const aboveDraw = body.indexOf('renderPass(state.scene, modelsInWorld ? "overlay" : "above")');
    const aboveUp = body.indexOf('updateReactor3DTexture(this._reactor3dAbove');
    assert.ok(belowDraw >= 0 && belowUp > belowDraw, 'the ground is drawn then taken');
    assert.ok(aboveDraw > belowUp, 'and only then is the canvas reused');
    assert.ok(aboveUp > aboveDraw);

    // And it is taken down with the map rather than left in the scene.
    assert.match(sprites, /Spriteset_Map\.prototype\.destroyReactor3DSprite = function/);
});

test('a parallax does not cover the 3D ground', () => {
    // The parallax is drawn on the game canvas, so it sits *over* the 3D
    // ground — a sky covering the whole world. 3D maps do not draw one yet.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /if \(this\._parallax\) this\._parallax\.visible = false;/);
    assert.match(sprites, /if \(this\._parallax\) this\._parallax\.visible = true;/,
        'and it comes back if the 3D build fails');
});

test('the game canvas has an alpha channel to become transparent with', () => {
    // PIXI decides whether the drawing buffer has an alpha channel *once*, at
    // init, from `background.alpha < 1` — and never again. Left at the default
    // the context is created with `alpha: false` and the canvas is opaque at
    // the compositor level whatever the clear colour says afterwards. A 3D map
    // draws underneath it, so the ground rendered perfectly and was composited
    // away: meshes, textures, camera and canvas all correct, and a black screen.
    const pixi = fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'pixi.js'), 'utf8');
    assert.match(pixi, /const alpha = this\._renderer\.background\.alpha < 1;/,
        'this is the line the workaround exists for');

    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const at = core.indexOf('Graphics._createPixiApp = async function');
    const body = core.slice(at, core.indexOf('\n};', at));

    assert.match(body, /backgroundAlpha: 0/, 'the channel is requested at init');
    assert.match(body, /app\.renderer\.background\.alpha = 1;/,
        'and the opaque default restored, so a 2D map is unchanged');
    // v5-v7 take it from `transparent`, decided at the same moment.
    assert.match(body, /transparent: true/);
    assert.match(body, /app\.renderer\.backgroundAlpha = 1;/);

    // Ordering matters: asking after init would be too late.
    assert.ok(body.indexOf('backgroundAlpha: 0') < body.indexOf('background.alpha = 1'));
});

test('a 3D map no longer depends on anything being transparent', () => {
    // Three opaque layers used to stand between the 3D canvas and the eye —
    // the game canvas without an alpha channel, the parallax, and
    // `_blackScreen` — and each one alone was enough to hide it. Drawing into
    // the scene instead removes the whole question: the sprite is above the
    // black screen and below everything that composites against the map.
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const at = sprites.indexOf('Spriteset_Map.prototype.createReactor3D = function');
    const body = sprites.slice(at, sprites.indexOf('\n};', at));

    assert.doesNotMatch(body, /setGameCanvasTransparent\(true\)/,
        'the canvas does not need to be see-through any more');
    assert.doesNotMatch(body, /_blackScreen\.visible = false/,
        'and the black screen can stay where it is');
    // The parallax still goes: it would be drawn over the ground sprite.
    assert.match(body, /this\._parallax\.visible = false;/);
});

test('the 3D canvas follows the game canvas when the window changes', () => {
    // It is a sibling of the game canvas rather than one of Graphics' own
    // elements, so every rescale missed it: going fullscreen scaled the game
    // canvas up and left the 3D one at its old size, drawing the world as a
    // small rectangle in the middle of a black screen.
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const at = core.indexOf('Graphics._updateAllElements = function');
    const body = core.slice(at, core.indexOf('\n};', at));
    assert.match(body, /this\._updateReactor3DCanvas\(\);/,
        'the 3D canvas is updated with the rest');

    // Every path that rescales goes through _updateAllElements, including
    // entering and leaving fullscreen.
    assert.ok((core.match(/this\._updateAllElements\(\);/g) || []).length >= 4);
    assert.match(core, /Graphics\._updateReactor3DCanvas = function/);

    // And it resizes to the same logical resolution the game canvas uses, so
    // the two stay in step rather than one being scaled independently.
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    const resizeAt = three.indexOf('Reactor3D.Viewport.prototype.resize = function');
    const resize = three.slice(resizeAt, three.indexOf('\n};', resizeAt));
    assert.match(resize, /Graphics\.width/);
    assert.match(resize, /Graphics\._centerElement\(this\._canvas\)/);
});
