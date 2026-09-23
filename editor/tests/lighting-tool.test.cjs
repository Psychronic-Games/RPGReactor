/**
 * The Lighting tool: the sidecar light store, and the visual editor built on
 * it. The store is exercised for real; the manager and its wiring are pinned
 * where they must agree with the runtime's compositors.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const MapLights = require(path.join(editorRoot, 'src', 'utils', 'MapLights.js'));

test('lights normalize, bound and round-trip through the sidecar', () => {
    const map = { width: 20, height: 15 };
    const lamp = MapLights.add(map, { type: 'point', x: 3.5, y: 4.5, radius: 5, color: '#FF8800' });
    assert.equal(lamp.id, 'light1');
    assert.equal(lamp.color, '#ff8800', 'colour normalizes to lowercase hex');
    const torch = MapLights.add(map, { type: 'spot', x: 1, y: 1, yaw: 999999, intensity: 99 });
    assert.equal(torch.id, 'light2');
    assert.equal(torch.radius, MapLights.DEFAULT_CONE_LENGTH, 'a spot defaults to the cone reach');
    assert.equal(torch.intensity, 4, 'intensity clamps to the runtime bound');

    assert.equal(MapLights.list(map).length, 2);
    assert.equal(MapLights.get(map, 'light1').x, 3.5);
    MapLights.update(map, 'light1', { radius: 7, tag: 'street' });
    assert.equal(MapLights.get(map, 'light1').radius, 7);
    assert.equal(MapLights.get(map, 'light1').tag, 'street');

    const copy = MapLights.duplicate(map, 'light1');
    assert.equal(copy.id, 'light3', 'a duplicate gets a fresh id');
    assert.equal(copy.x, 4.5, 'and steps aside');
    assert.equal(copy.tag, 'street');

    assert.equal(MapLights.remove(map, 'light2'), true);
    assert.equal(MapLights.get(map, 'light2'), null);
});

test('a lights-only sidecar never stamps a 3D mode', () => {
    // The 3D checkbox is the only thing that flips a map's mode; a lamp on a
    // 2D map must leave it a 2D map.
    const map = { width: 10, height: 10 };
    MapLights.add(map, { x: 1, y: 1 });
    MapLights.setAmbient(map, { ambient: 0.3, ambientColour: '#9db4ff' });
    assert.equal('mode' in map.reactor3d, false);
    assert.deepEqual(MapLights.ambient(map),
        { ambient: 0.3, ambientColour: '#9db4ff', enabled: undefined });
});

test('removing the last light removes the array, and snapshots restore', () => {
    const map = { width: 10, height: 10 };
    const light = MapLights.add(map, { x: 2, y: 2, radius: 4 });
    const lit = MapLights.snapshot(map);
    MapLights.remove(map, light.id);
    assert.equal('lights' in map.reactor3d, false,
        'an empty array would keep the sidecar file alive for nothing');
    const empty = MapLights.snapshot(map);
    assert.equal(MapLights.restore(map, lit), true);
    assert.equal(MapLights.list(map).length, 1);
    MapLights.restore(map, empty);
    assert.equal(MapLights.list(map).length, 0);
});

test('the editor store bounds match the runtime reader bounds', () => {
    // One schema, two normalizers - they must agree or the editor can write
    // what the game re-clamps.
    const Reactor3D = require(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'));
    const wild = {
        id: 'x', type: 'spot', x: 99999, y: -99999, height: 9999, yaw: 500,
        radius: 9999, angle: 999, intensity: 99, flicker: 5,
        pulse: { min: -1, max: 99, period: 0 }
    };
    const editorSide = MapLights.normalize(wild, 'x');
    const runtimeSide = Reactor3D.readMapLights({ reactor3d: { lights: [wild] } })[0];
    for (const key of ['x', 'y', 'height', 'radius', 'angle', 'intensity', 'flicker']) {
        assert.equal(editorSide[key], runtimeSide[key], key + ' clamps identically');
    }
    assert.deepEqual(editorSide.pulse, runtimeSide.pulse, 'pulse clamps identically');
});

test('the lighting manager composites the way the runtime does', () => {
    const manager = read('src/LightingManager.js');
    // Ambient is one multiply sprite; lights are additive falloff sprites
    // sharing the 3D pass's own pictures - never punched holes.
    assert.match(manager, /blendMode = 'multiply'/);
    assert.match(manager, /blendMode = 'add'/);
    assert.match(manager, /texture.source.scaleMode = 'linear'/);
    assert.match(manager, /kind === 'beam'/, 'a beam has its own smooth bar picture');
    assert.doesNotMatch(manager, /destination-out/);
    // The 3D preview feeds the real compositor, with the schema yaw flipped
    // into the scene convention exactly as the runtime flips it.
    assert.match(manager, /yaw: -light\.yaw/);
    assert.match(manager, /scene\.syncLights\?\.\(focus\)/);
    // The 3D view composites the light group as its own additive pass, the
    // way the game does. setPass hides that group in every other pass, so
    // without this pass the lights were fully computed and never drawn —
    // the "Lighting · 10 but a bright, lightless room" the tool shipped
    // with, caught only by looking at the rendered pixels.
    assert.match(manager, /feed3D\(\) \{/);
    assert.match(manager, /wants3DFrames\(\) \{/);
    const editor3d = read('src/MapEditor3D.js');
    assert.match(editor3d, /renderLightsPass\(scene\) \{/);
    assert.match(editor3d, /setPass\('lights'\)/);
    assert.match(editor3d, /lightingManager\?\.feed3D\?\.\(\)/);
    assert.match(editor3d, /wants3DFrames\?\.\(\)/);
    const passCalls = editor3d.match(/this\.renderLightsPass\(scene\);/g) || [];
    assert.equal(passCalls.length, 2, 'the world branch and the split-pass chain both draw lights');
    // Deterministic animation, identical constants to the runtime.
    assert.match(manager, /Math\.sin\(frame \* 0\.31 \+ seed\) \* Math\.sin\(frame \* 0\.127 \+ seed \* 1\.7\)/);
    // Undo is whole-state snapshots through the store.
    assert.match(manager, /RRMapLights\.snapshot\(map\)/);
    assert.match(manager, /RRMapLights\.restore\(map, from\.pop\(\)\)/);
});

test('the tool is wired: toolbar button, scripts, dispatcher, instance', () => {
    const html = read('index.html');
    assert.match(html, /data-action="lighting-tool"[^>]*data-i18n-title="toolbar\.title\.lighting"/);
    assert.match(html, /icon-lighting\.svg/);
    const lights = html.indexOf('src/utils/MapLights.js');
    const manager = html.indexOf('src/LightingManager.js');
    const main = html.indexOf('src/main.js');
    assert.ok(lights >= 0 && lights < manager, 'the store loads before the manager');
    assert.ok(manager < main || main < 0, 'and the manager before main');

    assert.match(read('src/UIManager.js'), /case 'lighting-tool':/);
    assert.match(read('src/main.js'), /new LightingManager\(this\.projectController\)/);
    assert.ok(fs.existsSync(path.join(editorRoot, 'images', 'icon-lighting.svg')));
});

test('the panel docks in the workspace and player lights stay off tile 0,0', () => {
    // Verified over CDP in a live editor (2026-08-31): appended to the body
    // the absolutely-positioned panel resolved against the viewport and sat
    // on the map checkboxes; and a player-attached light has no carrier in
    // the editor, so it must not preview at the map origin.
    const manager = read('src/LightingManager.js');
    assert.match(manager, /\(workspace \|\| document\.body\)\.appendChild\(panel\);/);
    assert.match(manager, /infoBar\.getBoundingClientRect\(\)\.bottom - workspaceTop/);
    assert.match(manager, /if \(!light\.attach\.event\) continue;/);
});

test('the 3D view places and drags lights too', () => {
    // A 3D-authored map opens in the 3D view by default, so a tool that only
    // listened on the 2D container placed nothing there — verified broken and
    // then fixed with a real CDP click on map-3d-input (2026-08-31). Capture
    // phase, consuming only the tool's own clicks: orbiting and prop picking
    // keep working underneath.
    const manager = read('src/LightingManager.js');
    assert.match(manager, /_bind3DPointer\(\) \{/);
    assert.match(manager, /m3d\.inputSurface \|\| m3d\.canvas/);
    assert.match(manager, /m3d\.groundPointAt\(event\.clientX, event\.clientY\)/);
    assert.match(manager, /addEventListener\('pointerdown', this\._on3DDown, true\)/);
    assert.match(manager, /Not ours: the orbit and the props keep the click/);
    assert.match(manager, /stopImmediatePropagation/);
    // And the binding follows the 3D canvas through toggles and rebuilds.
    assert.match(manager, /this\._surface3D\(\) !== this\._bound3D/);
});

test('a light is clickable across its whole glow, at any zoom, with feedback', () => {
    // "Nothing happens when I click on the light": the hit-test accepted only
    // a pinpoint at the centre while the eye aims at the glow, the 2D grip
    // shrank with the zoom, and 3D selection changed nothing visible. Fixed
    // and CDP-verified: a real click on neon-mag's glow selected it, a drag
    // moved it 16.5 → 20.03, and the ground ring appeared.
    const manager = read('src/LightingManager.js');
    assert.match(manager, /Math\.max\(grip, Math\.min\(light\.radius, 7\)\)/);
    assert.match(manager, /distance \/ reach/);
    assert.match(manager, /16 \/ \(tw \* this\._viewScale\(\)\)/);
    assert.match(manager, /_viewScale\(\) \{/);
    assert.match(manager, /\(selected \? 9 : 7\) \/ zoom/);
    assert.match(manager, /_update3DRing\(scene\)/);
    assert.match(manager, /new THREE\.RingGeometry\(0\.42, 0\.55, 40\)/);
    // And the inverse trap: a light that draws nowhere (player-attached has
    // no carrier in the editor) must not be clickable anywhere — a CDP click
    // on "empty" ground was silently selecting the invisible torch.
    assert.match(manager, /if \(!light\.attach\.event\) return null;/);
});

test('the tray drags whole lights onto the map, presets and compounds alike', () => {
    // The interaction the tool is built around now: glowing preset chips
    // dragged out of the tray, the ghost riding the cursor, templates that
    // carry flicker/pulse/colour, and a compound that drops a whole fixture
    // under one fresh group tag. CDP-verified: the Neon chip dragged onto
    // the 3D map placed #ff2d95 (2026-08-31).
    const manager = read('src/LightingManager.js');
    assert.match(manager, /_presets\(\) \{/);
    assert.match(manager, /_chipDown\(event, preset\)/);
    assert.match(manager, /_tileFromClient\(clientX, clientY\)/);
    assert.match(manager, /_presetIcon\(preset\)/);
    // House icon language: ink underlay, gradient in the preset's colour.
    assert.match(manager, /_presetSvg\(preset\.key, 'url\(#' \+ id \+ '\)', colour\)/);
    assert.match(manager, /const INK = '#01030a';/);
    assert.match(manager, /_shade\(colour, 0\.6\)/);
    assert.match(manager, /Array\.isArray\(template\.compound\)/);
    assert.match(manager, /RRMapLights\.createCompound\(map, template\.compound/);
    // Placement waits for a preset choice and is narrated — and a
    // click that routes nowhere says why, in both views, with a build stamp
    // so a stale session identifies itself.
    assert.doesNotMatch(manager, /if \(!this\.lights\(\)\.length\) this\.armPlacement\('point'\);/, 'opening the tool waits for an explicit preset choice');
    assert.match(manager, /lit\.placing/);
    assert.match(manager, /_moveGhost\(at\)/);
    assert.match(manager, /static BUILD = /);
    const flashes = manager.match(/_flashStatus\(this\._k\('lit\.pickFirst'\)\)/g) || [];
    assert.equal(flashes.length, 2, 'the hint fires from the 2D and the 3D click paths');
});

test('a stale session is told the disk has newer lights, and can load them', () => {
    // "No lights on the map at all": a session opened before a map's lights
    // were authored shows zero on a map whose file holds ten, and its next
    // save clobbers them. The panel reads the sidecar straight off the disk,
    // says when the file is ahead of the session, and loads it on one click.
    const manager = read('src/LightingManager.js');
    assert.match(manager, /_diskLights\(\) \{/);
    assert.match(manager, /'Map' \+ String\(map\.id\)\.padStart\(3, '0'\) \+ '\.r3d\.json'/);
    assert.match(manager, /disk\.lights\.length <= this\.lights\(\)\.length/);
    assert.match(manager, /sidecar\.lights = fresh\.lights;/);
    assert.match(manager, /this\._syncDiskNotice\(\);/);
});

test('every panel string is a lit.* key present in the locale tables', () => {
    const manager = read('src/LightingManager.js');
    const used = new Set([...manager.matchAll(/'(lit\.[A-Za-z.]+[A-Za-z])'/g)].map(match => match[1]));
    assert.ok(used.size >= 25, 'the panel is fully keyed (' + used.size + ' keys)');
    const i18n = read('src/I18nManager.js');
    for (const key of used) {
        assert.ok(i18n.includes(JSON.stringify(key)), key + ' exists in the tables');
    }
    assert.ok(i18n.includes('"toolbar.title.lighting"'), 'the toolbar title is keyed too');
});

test('placement rejects the lighting panel and space outside the map', () => {
    const vm = require('node:vm');
    let hit;
    const canvas = { contains: target => target === canvas };
    const panel = { contains: target => target === panel };
    const context = { document: { elementFromPoint: () => hit }, window: {} };
    const Manager = vm.runInNewContext(read('src/LightingManager.js') + '\nLightingManager;', context);
    const manager = Object.create(Manager.prototype);
    manager._panel = panel;
    manager.map = () => ({ width: 20, height: 20 });
    let casts = 0, point = { x: 4, y: 5 };
    manager.mapEditor3D = () => ({ isEnabled: () => true, canvas,
        groundPointAt: () => { casts++; return point; } });
    hit = panel;
    assert.equal(manager._tileFromClient(500, 100), null);
    assert.equal(casts, 0, 'the hidden ground behind UI is never raycast');
    hit = {};
    assert.equal(manager._tileFromClient(500, 100), null);
    hit = canvas;
    assert.deepEqual(manager._tileFromClient(500, 100), point);
    point = { x: -1, y: 5 };
    assert.equal(manager._tileFromClient(500, 100), null);
});

test('ambient refresh updates the filled rail and readout from the current map, including Day and black', () => {
    const vm = require('node:vm');
    const Manager = vm.runInNewContext(read('src/LightingManager.js') + '\nLightingManager;', {});
    const manager = Object.create(Manager.prototype);
    let ambient = { ambient: .37, ambientColour: '#c0d0e0' }, fill;
    const level = { value: '', __rrPaint() { fill = this.value; } };
    const readout = {}, colour = { setValue(value) { this.value = value; } };
    manager._ambientControls = { level, readout, colour };
    manager.ambient = () => ambient;
    for (const value of [.37, 1, 0]) {
        ambient = { ...ambient, ambient: value };
        manager._syncAmbientControls();
        assert.equal(level.value, String(value * 100));
        assert.equal(fill, level.value);
        assert.equal(readout.textContent, level.value + '%');
        assert.equal(colour.value, ambient.ambientColour);
    }
});

test('changing maps refreshes lighting state even while the 3D view owns rendering', () => {
    const vm = require('node:vm');
    let tick;
    const context = { document: { hidden: false }, Reactor3D: {},
        requestAnimationFrame(fn) { tick = fn; return 1; } };
    const Manager = vm.runInNewContext(read('src/LightingManager.js') + '\nLightingManager;', context);
    const manager = Object.create(Manager.prototype);
    const currentMap = { id: 2 }, container = {}, surface = {};
    Object.assign(manager, { active: true, _boundMap: { id: 1 }, selectedId: 'old', drag: {},
        _undo: [1], _redo: [1], _bound3D: surface, projectController: { tilemapManager: { container } } });
    manager.map = () => currentMap;
    manager.mapEditor3D = () => ({ isEnabled: () => true });
    manager._surface3D = () => surface;
    let refreshed = 0, rebound = 0;
    manager._syncPanel = () => { refreshed++; };
    manager._bindPointer = () => { rebound++; };
    manager._buildOverlay = () => { manager._overlay = { root: { parent: container } }; };
    for (const method of ['armPlacement', '_unbindPointer', '_end3DDrag', '_destroyOverlay', '_syncDiskNotice']) manager[method] = () => {};
    manager._startTicking();tick();
    assert.equal(manager._boundMap, currentMap);
    assert.equal(refreshed, 1);
    assert.equal(rebound, 1);
    assert.equal(manager.selectedId, null);
    assert.equal(manager._undo.length + manager._redo.length, 0);
    assert.equal(manager._overlay.root.visible, false, '3D still owns rendering');
});

test('compound fixtures keep mixed component types and offsets through movement, duplication and save', () => {
    const map = { width: 30, height: 30 };
    const first = MapLights.createCompound(map, [
        { type: 'point', height: 2, color: '#a583ff' },
        { type: 'spot', x: 2, y: 1, height: 3, pitch: -60 },
        { type: 'beam', x: -1, height: 1, yaw: 30 }
    ], 5, 6, 'Reactor lamp');
    const unrelated = MapLights.add(map, { type: 'point', x: 20, y: 20 });
    assert.equal(MapLights.fixtures(map).length, 2);
    const parts = MapLights.members(map, first.id);
    assert.deepEqual(parts.map(p => p.type), ['point', 'spot', 'beam']);
    MapLights.moveFixture(map, parts[1].id, { x: 10, y: 12, height: 0 });
    const moved = MapLights.members(map, first.id);
    assert.deepEqual(moved.map(p => [p.x, p.y, p.height]), [[8, 11, 1], [10, 12, 2], [7, 11, 0]], 'shared movement stops at floor without flattening offsets');
    assert.equal(MapLights.get(map, unrelated.id).x, 20);
    const duplicate = MapLights.duplicateFixture(map, parts[1].id);
    assert.notEqual(duplicate.compoundId, first.compoundId);
    assert.equal(duplicate.compoundName, 'Reactor lamp 2');
    assert.equal(MapLights.members(map, duplicate.id).length, 3);
    assert.equal(MapLights.fixtures(map).length, 3);
    const reloaded = JSON.parse(JSON.stringify(map));
    assert.equal(MapLights.members(reloaded, first.id).length, 3);
    assert.equal(MapLights.get(reloaded, first.id).compoundName, 'Reactor lamp');
    const Reactor3D = require(path.join(editorRoot, '..', 'runtime', 'reactor_3d.js'));
    const runtimeLights = Reactor3D.readMapLights(reloaded);
    assert.equal(runtimeLights.length, 7, 'every component is a native light in game');
    const saved = MapLights.snapshot(map);
    MapLights.removeFixture(map, first.id);
    assert.equal(MapLights.fixtures(map).length, 2);
    assert.equal(MapLights.members(map, duplicate.id).length, 3, 'deleting a fixture leaves its duplicate');
    MapLights.restore(map, saved);
    assert.equal(MapLights.members(map, first.id).length, 3, 'undo restores complete fixture');
});

test('editing or renaming one component preserves fixture identity and leaves siblings unchanged', () => {
    const map = {};
    const first = MapLights.createCompound(map, [{ type: 'point' }, { type: 'spot' }], 1, 2, 'Fixture');
    const second = MapLights.members(map, first.id)[1];
    MapLights.update(map, second.id, { x: 4, intensity: .3, pulse: { min: .2, max: 1, period: 90 } });
    MapLights.rename(map, second.id, 'cone');
    assert.equal(MapLights.get(map, first.id).x, 1);
    assert.equal(MapLights.get(map, 'cone').compoundId, first.compoundId);
    assert.equal(MapLights.members(map, 'cone').length, 2);
    assert.equal(MapLights.get(map, 'cone').pulse.period, 90);
});

test('the 2D aim handle and cone lines point where the glow, the flat game sprite and the 3D cone go', () => {
    // A Discord report: the spot cone showed on the other side of its guideline. Every
    // renderer aims at (sin -yaw, cos -yaw); the guide and its drag now do the same.
    const vm = require('node:vm');
    const FlatLightField2D = require(path.join(editorRoot, 'src', 'utils', 'FlatLightField2D.js'));
    const Manager = vm.runInNewContext(read('src/LightingManager.js') + '\nLightingManager;', { document: {}, window: {} });
    const manager = Object.create(Manager.prototype);
    for (const yaw of [0, 90, -90, 37, 180]) {
        const light = { type: 'spot', x: 10, y: 10, height: 3, pitch: -60, yaw, radius: 6, angle: 45 };
        const aim = FlatLightField2D.aim(light);
        const handle = manager._aimPoint(light, { x: 10, y: 10 });
        assert.ok(Math.abs((handle.x - 10) - aim.x / Math.hypot(aim.x, aim.z) * 6) < 1e-9, `yaw ${yaw}: handle x follows the glow`);
        assert.ok(Math.abs((handle.y - 10) - aim.z / Math.hypot(aim.x, aim.z) * 6) < 1e-9, `yaw ${yaw}: handle y follows the glow`);
        // The game's flat sprite: anchor at the source, texture up, rotation π − scene yaw, scene yaw = −data yaw.
        const rotation = Math.PI - ((-yaw) * Math.PI) / 180;
        assert.ok(Math.abs(Math.sin(rotation) * 6 - (handle.x - 10)) < 1e-9 && Math.abs(-Math.cos(rotation) * 6 - (handle.y - 10)) < 1e-9, `yaw ${yaw}: the game's sprite agrees`);
    }
    const source = read('src/LightingManager.js');
    assert.match(source, /yaw: Math\.round\(-Math\.atan2\(dx, dy\) \* 180 \/ Math\.PI\)/, 'the aim drag is the inverse of the handle');
    assert.match(source, /const yaw = -\(light\.yaw \* Math\.PI\) \/ 180;\s*\n\s*const dir = side =>/, 'the cone lines turn with the handle');
});
