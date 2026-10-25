'use strict';
// Two settings of the whole map, set on the map with the Terrain tools: what lies past its border
// (the Terrain group's Beyond the Border slot) and the material its steep ground turns to (the
// Ground slot's Steep Ground card). Each is a step of the terrain tool's own history; Map Properties
// has neither, and leaves both as they are.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
const plain = value => JSON.parse(JSON.stringify(value));

/** The terrain tool on one map, in a realm of its own; `events` are the announcements it made. */
function terrainOn(map) {
    const events = [];
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, Date, Uint8Array, Float32Array, Reactor3D: R, setTimeout, clearTimeout,
        document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['utils/MapElevation.js', 'utils/MapFoliage.js', 'utils/MapGround.js', 'utils/MapEdges.js', 'TerrainManager.js']) vm.runInNewContext(read('editor/src/' + file), context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    return { terrain, events, edges: context.RRMapEdges, elevation: context.RRMapElevation, TerrainManager: context.TerrainManager };
}
const shapedMap = (extra = {}) => ({ id: 3, width: 12, height: 8, note: '<3d>', data: [], reactor3d: Object.assign({ version: 1, mode: '3d', room: { height: 4, floor: '!Grass-01' },
    terrainWidth: 12, terrain: Array.from({ length: 13 * 9 }, (_, i) => (i % 13) * 0.5) }, extra) });

test('a style picked past the border is one undo step, and the view is told to lay the land alone', () => {
    const map = shapedMap(), { terrain, events, edges } = terrainOn(map);
    assert.equal(terrain.surround(), null);
    assert.equal(terrain.setSurround(edges.patch(terrain.surround(), { style: 'mountains' })), true);
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains' });
    assert.equal(terrain.undoStack.length, 1);
    assert.deepEqual(events.map(e => [e.type, plain(e.detail)]), [['rr-map-edited', { mapId: 3, surround: true }]], 'the land alone: nothing else is built again');
    assert.equal(terrain.setSurround(edges.patch(terrain.surround(), { style: 'mountains' })), false, 'the same style again is no step');
    assert.equal(terrain.undoStack.length, 1);
    terrain.setSurround(edges.patch(terrain.surround(), { edges: { south: 'ocean' } }));
    terrain.setSurround(edges.patch(terrain.surround(), { height: 80 }));
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', edges: { south: 'ocean' }, height: 80 });
    assert.equal(terrain.undoStack.length, 3, 'a side and a number typed are a step each');
    events.length = 0;
    terrain.undo(); terrain.undo(); terrain.undo();
    assert.equal('surround' in map.reactor3d, false, 'back to nothing past the border');
    assert.equal(events.length, 3);
    assert.ok(events.every(e => e.detail.surround === true), 'each undo lays the land again');
    terrain.redo(); terrain.redo(); terrain.redo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', edges: { south: 'ocean' }, height: 80 });
    // Nothing: the map stores no surround at all.
    terrain.setSurround(edges.patch(terrain.surround(), { style: 'none', edges: { south: '' } }));
    assert.equal('surround' in map.reactor3d, false);
    terrain.undo();
    assert.equal(map.reactor3d.surround.style, 'mountains');
    // A 3D map that has no sidecar yet gains one.
    const flat = { id: 4, width: 6, height: 4, note: '<3d>', data: [] }, other = terrainOn(flat);
    assert.equal(other.terrain.setSurround({ style: 'ocean' }), true, 'a 3D map with no sidecar gains one');
    assert.equal(flat.reactor3d.surround.style, 'ocean');
});

test('a map that is not 3D takes neither setting: no sidecar, no step, nothing to save', () => {
    const map = { id: 9, width: 6, height: 4, note: '', data: [] }, { terrain, events, edges } = terrainOn(map);
    assert.equal(terrain.setSurround(edges.patch(terrain.surroundBase(), { style: 'ocean' })), false);
    assert.equal(terrain.setSurround({ style: 'ocean', rough: 0.2 }, 'live'), false);
    assert.equal(terrain.setCliff({ name: 'Moss' }), false);
    assert.equal(terrain.setCliff({ slope: 60 }, 'live'), false);
    assert.equal(terrain.setGroundFloor('!Grass-01'), false);
    assert.equal('reactor3d' in map, false, 'the map gained no 3D sidecar');
    assert.deepEqual([terrain.undoStack.length, events.length, terrain._surroundSnapshot || null, terrain._cliffSnapshot || null], [0, 0, null, null]);
});

test('a slider dragged past the border is one step when it lets go', () => {
    const map = shapedMap({ surround: { style: 'continue' } }), { terrain, events, edges } = terrainOn(map);
    for (const distance of [120, 180, 240]) assert.equal(terrain.setSurround(edges.patch(terrain.surround(), { distance }), 'live'), true);
    assert.equal(terrain.undoStack.length, 0, 'no step while it moves');
    assert.equal(map.reactor3d.surround.distance, 240, 'the map follows the slider');
    assert.equal(events.length, 3);
    assert.equal(terrain.setSurround(terrain.surround(), 'commit'), true);
    assert.equal(terrain.undoStack.length, 1);
    assert.equal(events.length, 3, 'letting go lays nothing again');
    terrain.undo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'continue' }, 'back to before the drag, not to a place on the way');
    terrain.redo();
    assert.equal(map.reactor3d.surround.distance, 240);
    // A drag that ends where it began is no step.
    terrain.setSurround(edges.patch(terrain.surround(), { rough: 0.9 }), 'live');
    terrain.setSurround(edges.patch(terrain.surround(), { rough: 0.5 }), 'live');
    assert.equal(terrain.setSurround(terrain.surround(), 'commit'), false);
    assert.equal(terrain.undoStack.length, 1);
    // Undo while a drag is still held: the drag is the step undone.
    terrain.setSurround(edges.patch(terrain.surround(), { rough: 0.9 }), 'live');
    terrain.undo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'continue', distance: 240 });
    assert.equal(terrain.redoStack.length, 1);
    // Another tool taken up, or another map: nothing is left half done.
    terrain.active = true;
    terrain.setSurround(edges.patch(terrain.surround(), { rough: 0.1 }), 'live');
    terrain.deactivate();
    assert.equal(terrain._surroundSnapshot, null);
    assert.equal(terrain.undoStack.length, 2, 'the drag was kept as a step');
    terrain.setSurround(edges.patch(terrain.surround(), { rough: 0.3 }), 'live');
    terrain.setMap();
    assert.equal(terrain._surroundSnapshot, null);
    assert.equal(terrain.undoStack.length, 0);
});

test('the steep ground is set on the map: material, tint and angle, each a step, stored only when it differs', () => {
    const map = shapedMap(), { terrain, events, elevation } = terrainOn(map);
    assert.equal(terrain.hasSlopes(), true);
    assert.deepEqual(plain(terrain.cliff()), { name: 'Rock', slope: 40, tint: '' });
    assert.equal(terrain.setCliff({ name: 'Moss' }), true);
    assert.equal(map.reactor3d.room.cliff, 'Moss');
    assert.deepEqual(events.map(e => plain(e.detail)), [{ mapId: 3, cliff: true }], 'the floor alone: nothing else is built again');
    assert.equal(terrain.setCliff({ name: 'Moss' }), false, 'the same material again is no step');
    assert.equal(terrain.setCliff({ name: '' }), true, 'none is a choice');
    assert.equal(map.reactor3d.room.cliff, '');
    assert.deepEqual(plain(R.roomFor(map).cliff), '', 'the game reads none');
    // The angle by its slider: one step when it lets go.
    for (const slope of [45, 50, 62]) terrain.setCliff({ slope }, 'live');
    assert.equal(terrain.undoStack.length, 2);
    assert.equal(map.reactor3d.room.cliffSlope, 62);
    assert.equal(terrain.setCliff({}, 'commit'), true);
    assert.equal(terrain.undoStack.length, 3);
    assert.equal(terrain.setCliff({}, 'commit'), false, 'a late commit with nothing gathered is no step');
    // The tint: white is no tint.
    terrain.setCliff({ tint: '#A99F93' }, 'live'); terrain.setCliff({}, 'commit');
    assert.deepEqual(plain(terrain.cliff()), { name: '', slope: 62, tint: '#a99f93' });
    terrain.setCliff({ tint: '#ffffff' });
    assert.equal('cliffTint' in map.reactor3d.room, false);
    assert.equal(terrain.undoStack.length, 5);
    // The angle is held to 10..80 degrees.
    terrain.setCliff({ slope: 200 });
    assert.equal(terrain.cliff().slope, 80);
    // Undo keeps the rest of the room as it is now.
    elevation.setRoom(map, Object.assign({}, elevation.room(map), { sky: 'Sky-01' }));
    for (let i = 0; i < 6; i++) terrain.undo();
    assert.deepEqual(plain(map.reactor3d.room), { height: 4, floor: '!Grass-01', walls: '', ceiling: '', sky: 'Sky-01', skyScrollX: 0, skyScrollY: 0 }, 'Rock at 40 degrees with no tint is not stored');
    assert.equal(terrain.undoStack.length, 0);
    for (let i = 0; i < 6; i++) terrain.redo();
    assert.deepEqual(plain(terrain.cliff()), { name: '', slope: 80, tint: '' });
    assert.ok(events.every(e => e.detail.cliff === true));
    // A flat map has no slopes for it to show on.
    const flat = { id: 4, width: 6, height: 4, data: [], reactor3d: { version: 1, mode: '3d', room: { floor: '!Grass-01' } } };
    assert.equal(terrainOn(flat).terrain.hasSlopes(), false);
});

test('a biome tints the steep ground, and the Ground panel reads the tint from the map', () => {
    const map = shapedMap(), { terrain } = terrainOn(map);
    assert.ok(terrain.applyBiome('desert'));
    assert.equal(terrain.cliff().tint, '#c9a777');
    terrain.setCliff({ slope: 55 });
    assert.ok(terrain.applyBiome('temperate'));
    assert.deepEqual(plain(terrain.cliff()), { name: 'Rock', slope: 55, tint: '' }, 'the biome changes the tint and nothing else of it');
    terrain.undo(); terrain.undo(); terrain.undo();
    assert.deepEqual(plain(terrain.cliff()), { name: 'Rock', slope: 40, tint: '' });
});

test('the Terrain group ends with Beyond the Border, a slot with no brush', () => {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    assert.deepEqual(BuildHotbar.TERRAIN.slice(-3), ['biome', 'sky', 'surround']);
    assert.equal(BuildHotbar.TERRAIN_MODE.surround, 'surround');
    const terrain = { mode: 'raise', active: true, activate() {}, setMode(mode) { this.mode = mode; } };
    const bar = Object.create(BuildHotbar.prototype);
    bar.manager = () => ({ mode: 'select', kind: 'wall' }); bar.terrain = () => terrain; bar.render = () => {};
    global.window.reactor = { mapTool: 'terrain' };
    try {
        bar.pick('surround');
        assert.equal(terrain.mode, 'surround');
        assert.equal(bar.activeSlot(), 'surround');
        assert.equal(bar._lastTerrain, 'surround', 'coming back to Terrain comes back to it');
        assert.equal(bar.label('surround'), 'Beyond the Border');
        assert.match(bar.icon('surround'), /<path d="M2 14h20 [^"]+"/);
    } finally { delete global.window.reactor; }
    // The tool takes the mode and paints nothing with it; the 3D view shows no brush ring.
    const { terrain: real } = terrainOn(shapedMap());
    real.setMode('surround');
    assert.equal(real.mode, 'surround');
    assert.equal(real.beginStroke({ x: 3, y: 3 }), false);
    assert.equal(real.undoStack.length, 0);
    assert.match(read('editor/src/MapEditor3D.js'), /const ringless = \['fill', 'drain', 'look', 'river', 'biome', 'sky', 'surround'\]\.includes\(manager\.mode\);/);
    // One history with every other map tool: a step says what it was.
    const main = read('editor/src/main.js');
    assert.match(main, /label: entry => \(entry\?\.surroundSet \? 'Beyond the Border' : entry\?\.cliffSet \? 'Steep Ground' : entry\?\.roomSet \? 'Room and Sky' : entry\?\.biome \? \(entry\.label \|\| 'Biome'\) : /);
    assert.match(main, /terrain\._settleMapSettings\?\.\(\);/);
});

/** The Build bar's panel body for one map, with the editor's own form helpers. */
function panelFor(map, slot) {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    const { terrain, elevation } = terrainOn(map);
    const previous = { edges: global.RRMapEdges, reactor: global.Reactor3D, popup: global.RRMaterialPopup };
    global.Reactor3D = R;
    global.RRMapEdges = require(path.join(repoRoot, 'editor/src/utils/MapEdges.js'));
    global.RRMaterialPopup = require(path.join(repoRoot, 'editor/src/utils/MaterialPopup.js'));
    try {
        const bar = Object.create(BuildHotbar.prototype);
        bar.currentMap = () => map; bar.moreOpen = () => true; bar.groundFloors = () => ['!Grass-01']; bar._tt = text => text; bar._t = key => key;
        bar.is3D = () => elevation.hasNote(map);
        const section = (title, body, meta) => `<section title="${title}" meta="${meta || ''}">${body}</section>`;
        return slot === 'surround' ? bar.surroundBody(terrain, section) : bar.steepSection(terrain, section, () => '');
    } finally { global.RRMapEdges = previous.edges; global.Reactor3D = previous.reactor; global.RRMaterialPopup = previous.popup; }
}

test('the Beyond the Border panel: six pictures, Automatic until the distance is set, only the numbers in use', () => {
    const numbers = html => [...html.matchAll(/rr-build-snumber" data-key="(\w+)"/g)].map(m => m[1]);
    const disabled = (html, cls) => new RegExp(`class="${cls}"[^>]*disabled`).test(html);
    // Nothing past the border: the sliders are off, a side can still be given a style.
    const none = panelFor(shapedMap(), 'surround');
    assert.match(none, /What is seen past the map's border\. Nobody walks there\./);
    assert.deepEqual([...none.matchAll(/rr-build-sstyle" data-style="(\w+)" aria-pressed="(\w+)"/g)].map(m => m[1] + ':' + m[2]),
        ['none:true', 'continue:false', 'ocean:false', 'mountains:false', 'plateau:false', 'void:false']);
    assert.ok(disabled(none, 'rr-build-sdistance') && disabled(none, 'rr-build-srough'), 'the sliders are disabled');
    assert.match(none, /class="rr-build-chip rr-build-sauto" aria-pressed="true" disabled/);
    assert.deepEqual(numbers(none), []);
    assert.equal((none.match(/class="database-field-value rr-build-sside" data-side="\w+">/g) || []).length, 4, 'the four sides, enabled');
    assert.match(none, /<details class="lit-section rr-build-section rr-build-more" data-more="surround" open>/);
    // Mountains, the distance left alone: Automatic lit, the slider at the full reach.
    const mountains = panelFor(shapedMap({ surround: { style: 'mountains' } }), 'surround');
    assert.match(mountains, /<section title="Style" meta="Mountains">/);
    assert.match(mountains, /<b class="rr-build-sdistance-value" hidden><\/b><button type="button" class="rr-build-chip rr-build-sauto" aria-pressed="true">Automatic<\/button>/);
    assert.match(mountains, /class="rr-build-sdistance" min="24" max="320" step="8" value="160"/);
    assert.deepEqual(numbers(mountains), ['seed', 'height', 'haze']);
    assert.match(mountains, /data-key="height" value="45" min="4" max="160" step="1">/, 'unset shows the default in use, so the arrows step from it');
    assert.match(mountains, /data-key="seed" value="1" min="0"/);
    assert.match(mountains, /data-key="haze" value="1" min="0" max="1" step="0\.1">/);
    assert.doesNotMatch(mountains, /<option value="(void|mountains)"/, 'a side takes any style but the map\'s own and a floating island');
    // A distance set, a side of ocean, a height typed.
    const mixed = panelFor(shapedMap({ surround: { style: 'mountains', distance: 320, rough: 1, height: 60, edges: { south: 'ocean' } } }), 'surround');
    assert.match(mixed, /<b class="rr-build-sdistance-value">320<\/b><button type="button" class="rr-build-chip rr-build-sauto" aria-pressed="false">/);
    assert.match(mixed, /<b class="rr-build-srough-value">100%<\/b>/);
    assert.deepEqual(numbers(mixed), ['seed', 'level', 'height', 'haze']);
    assert.match(mixed, /data-key="level" value="" [^>]*placeholder="Automatic"/);
    assert.match(mixed, /data-key="height" value="60"/);
    assert.match(mixed, /data-side="south"><option value="">Same as the map<\/option><option value="none">Nothing<\/option><option value="continue">Land<\/option><option value="ocean" selected>/);
    // A floating island: no reach, no sides, its drop.
    const island = panelFor(shapedMap({ surround: { style: 'void' } }), 'surround');
    assert.ok(disabled(island, 'rr-build-sdistance') && !disabled(island, 'rr-build-srough'));
    assert.deepEqual(numbers(island), ['seed', 'drop']);
    assert.equal((island.match(/rr-build-sside" data-side="\w+" disabled>/g) || []).length, 4);
    // An ocean alone has no hills.
    assert.ok(disabled(panelFor(shapedMap({ surround: { style: 'ocean' } }), 'surround'), 'rr-build-srough'));
    // A map with no floor has nothing to lay the land from, and says so.
    const bare = shapedMap({ surround: { style: 'continue' } }); delete bare.reactor3d.room;
    assert.match(panelFor(bare, 'surround'), /Nothing shows past the border of a map with no floor\.<\/div><div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-gsetfloor" data-floor="!Grass-01">/);
    assert.doesNotMatch(mountains, /Nothing shows past the border/);
});

test('the Ground panel\'s Steep Ground card: the material, tint and angle of a shaped map, one line on a flat one', () => {
    const shaped = panelFor(shapedMap({ room: { height: 4, floor: '!Grass-01', cliffSlope: 80, cliffTint: '#a99f93' } }), 'steep');
    assert.match(shaped, /^<section title="Steep Ground" meta="Rock">/);
    assert.match(shaped, /class="rr-material-tile rr-build-cmaterial" data-value="Rock" data-blank="None"/);
    assert.match(shaped, /class="rr-build-ctint" value="#a99f93"/);
    assert.match(shaped, /class="rr-build-cslope" min="10" max="80" step="1" value="80" data-no-stepper><b class="rr-build-cslope-value">80°<\/b>/);
    assert.match(shaped, /Ground steeper than this angle turns to this material, on the map and past its border\./);
    const none = panelFor(shapedMap({ room: { height: 4, floor: '!Grass-01', cliff: '' } }), 'steep');
    assert.match(none, /^<section title="Steep Ground" meta="None">/);
    assert.match(none, /rr-build-cmaterial" data-value="" data-blank="None"/);
    const flat = panelFor({ id: 4, width: 6, height: 4, data: [], reactor3d: { version: 1, mode: '3d', room: { floor: '!Grass-01' } } }, 'steep');
    assert.match(flat, /This map's ground is flat: nothing on it is steep\./);
    assert.doesNotMatch(flat, /rr-build-cslope|rr-build-cmaterial|rr-build-ctint/, 'no controls that do nothing');
    const bar = read('editor/src/BuildHotbar.js');
    // The card sits under the panel's Whole map fold, with the map's fill: what is painted with and the brush come first.
    assert.match(bar, /const whole = fold\('ground-map', tt\('Whole map'\), '',[\s\S]{0,400}\(erasing \? '' : this\.steepSection\(terrain, section, urlOf\)\)\);/);
    assert.match(bar, /\+ section\(t\('terrain\.brush'\), brushRows\)\n\s+\+ edit \+ whole;/);
});

test('OK in Map Properties leaves the room, the sky, the steep ground and the land past the border as they are', () => {
    const fields = {};
    const ProjectController = vm.runInNewContext(`${read('editor/src/ProjectController.js')}\nProjectController;`,
        { console, process, require, nw: {}, document: { getElementById: id => fields[id] || null } });
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    const elevation = context.RRMapElevation;
    const map = { id: 7, width: 6, height: 5, note: '<3d>', data: [], events: [], reactor3d: { version: 1, mode: '3d', width: 6, height: 5, elevation: new Array(30).fill(0),
        room: { height: 12, floor: '!Grass-01', walls: '', ceiling: '', sky: 'Sky-01', skyScrollX: 0.1, skyScrollY: 0, cliff: 'Moss', cliffSlope: 55, cliffTint: '#a99f93' },
        surround: { style: 'mountains', distance: 320, rough: 1 } } };
    const pc = Object.create(ProjectController.prototype);
    pc.currentEditingMap = map; pc.isCreatingNewMap = false; pc.mapElevation = () => elevation;
    let written = 0;
    pc.tilemapManager = { currentMap: map, saveMapSidecar: () => { written++; return true; } };
    // The form has no field for either.
    const room = pc.readMap3DForm();
    assert.deepEqual(Object.keys(room).sort(), ['ceiling', 'floor', 'height', 'sky', 'skyScrollX', 'skyScrollY', 'walls']);
    const before = JSON.stringify(map.reactor3d);
    assert.equal(pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, room, true), false, 'nothing changed: nothing to write');
    assert.equal(JSON.stringify(map.reactor3d), before);
    assert.equal(written, 0);
    // The room changed on the map (Build › Terrain › Room and Sky): OK keeps it, and the cliff and the surroundings stay.
    elevation.setRoom(map, Object.assign({}, elevation.room(map), { height: 20, sky: '' }));
    assert.equal(pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, pc.readMap3DForm(), true), false, 'the dialog changes nothing of it');
    assert.deepEqual([map.reactor3d.room.height, map.reactor3d.room.sky], [20, '']);
    assert.deepEqual([map.reactor3d.room.cliff, map.reactor3d.room.cliffSlope, map.reactor3d.room.cliffTint], ['Moss', 55, '#a99f93']);
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', distance: 320, rough: 1 });
    // 3D unticked: both wait in the sidecar for it to be ticked again.
    pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, pc.readMap3DForm(), false);
    assert.deepEqual([map.reactor3d.room.cliff, map.reactor3d.room.cliffSlope, map.reactor3d.room.cliffTint], ['Moss', 55, '#a99f93']);
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', distance: 320, rough: 1 });
    // OK marks the loaded map saved: what the Terrain tools changed since the last save is written with it, though the dialog changed nothing.
    let savedState = JSON.stringify(map.reactor3d);
    pc.tilemapManager.sidecarState = () => JSON.stringify(map.reactor3d);
    Object.defineProperty(pc.tilemapManager, 'savedSidecarState', { get: () => savedState });
    written = 0;
    assert.equal(pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, pc.readMap3DForm(), true), false);
    assert.equal(written, 0, 'nothing unsaved: nothing written');
    map.reactor3d.surround = { style: 'ocean' };
    map.reactor3d.room.cliffSlope = 30;
    assert.equal(pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, pc.readMap3DForm(), true), false, 'the dialog changed nothing of the room');
    assert.equal(written, 1, 'the sidecar is written with the map');
    assert.deepEqual([plain(map.reactor3d.surround), map.reactor3d.room.cliffSlope], [{ style: 'ocean' }, 30]);
    // A map that never said anything about its cliff gains nothing.
    savedState = null; pc.tilemapManager.sidecarState = () => null;
    const quiet = { id: 8, width: 6, height: 5, note: '<3d>', data: [], events: [], reactor3d: { version: 1, mode: '3d', width: 6, height: 5, elevation: new Array(30).fill(0), room: { height: 20, floor: '!Grass-01', skyScrollX: 0.1 } } };
    pc.currentEditingMap = quiet; pc.tilemapManager.currentMap = quiet;
    assert.equal(pc.saveMap3DSettings({ id: 8, width: 6, height: 5 }, pc.readMap3DForm(), true), false);
    assert.deepEqual(Object.keys(quiet.reactor3d.room).filter(key => /cliff/.test(key)), []);
    assert.equal('surround' in quiet.reactor3d, false);
    // Neither is in the dialog, and nothing of the old form is left behind.
    const html = read('editor/index.html');
    assert.doesNotMatch(html, /map-3d-cliff|map-surround-section|mapProps\.groupSteep|mapProps\.steepHint/);
    assert.doesNotMatch(html, /mapProps\.groupRoom|id="map-3d-height-input"|id="map-3d-sky-select"/);
    assert.match(html, /data-i18n="mapProps\.groupCamera">Camera<\/div>/);
    const controller = read('editor/src/ProjectController.js');
    assert.doesNotMatch(controller, /RRMapEdges|previewMapCliff|cancelMapCliffPreview|bindMapPropertiesPeek|mapPropertiesScene|fillMaterialSelect/);
    assert.doesNotMatch(read('editor/css/styles.css'), /is-peek|rr-surround-|map-props-steep/);
    assert.doesNotMatch(read('editor/src/I18nManager.js'), /mapProps\.(cliffMaterial|cliffSlope|cliffTint|groupSteep|steepHint)/);
});

test('an Advanced number shows the value in use, and its arrows step from it', () => {
    const map = shapedMap({ surround: { style: 'mountains', height: 44 } }), { terrain, edges } = terrainOn(map);
    const field = key => edges.NUMBERS.find(entry => entry.key === key);
    const shown = key => edges.shown(edges.read(map), field(key));
    // An arrow's click: the field's value and one step, taken as the panel takes a change.
    const stepUp = key => terrain.setSurround(edges.patch(terrain.surroundBase(), { [key]: Number(shown(key)) + field(key).step }), 'live');
    assert.equal(shown('height'), 44);
    stepUp('height');
    assert.equal(shown('height'), 45);
    assert.equal('height' in map.reactor3d.surround, false, 'the default is shown and not stored');
    stepUp('height');
    assert.equal(shown('height'), 46, '44 stepped up twice');
    assert.equal(shown('seed'), 1, 'unset shows the default');
    stepUp('seed');
    assert.equal(shown('seed'), 2, 'the seed stepped up from unset');
    assert.equal(shown('haze'), 1);
    assert.equal(shown('level'), '', 'a sea level left Automatic has no number');
    // The arrows held are one step when they stop.
    assert.equal(terrain.undoStack.length, 0);
    assert.equal(terrain.setSurround(terrain.surround(), 'commit'), true);
    assert.equal(terrain.undoStack.length, 1);
    terrain.undo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', height: 44 });
});

test('a style picked after Nothing comes back as far and as hilly as the map was', () => {
    const map = shapedMap({ surround: { style: 'mountains', distance: 320, rough: 1, seed: 7, height: 80 } }), { terrain, edges } = terrainOn(map);
    const pick = change => terrain.setSurround(edges.patch(terrain.surroundBase(), change));
    pick({ style: 'none' });
    assert.equal(terrain.surround(), null, 'nothing past the border stores nothing');
    pick({ style: 'continue' });
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'continue', distance: 320, rough: 1, seed: 7, height: 80 });
    terrain.undo(); terrain.undo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', distance: 320, rough: 1, seed: 7, height: 80 });
    // A side given a style after Nothing takes them too.
    pick({ style: 'none' });
    pick({ edges: { south: 'ocean' } });
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'none', edges: { south: 'ocean' }, distance: 320, rough: 1, seed: 7, height: 80 });
    // Another map: nothing is carried over.
    pick({ style: 'none', edges: { south: '' } });
    assert.ok(terrain.surroundBase());
    terrain.setMap();
    assert.equal(terrain.surroundBase(), null);
    // Steps undone back to nothing are not remembered: an undo leaves the map as if they were never made.
    const fresh = shapedMap(), other = terrainOn(fresh);
    other.terrain.setSurround(other.edges.patch(null, { style: 'ocean' }));
    other.terrain.setSurround(other.edges.patch(other.terrain.surround(), { distance: 240 }));
    other.terrain.undo(); other.terrain.undo();
    assert.equal(other.terrain.surroundBase(), null);
});

test('a change made whole while another is still gathering is a step of its own, in the order made', () => {
    const map = shapedMap({ surround: { style: 'continue' } }), { terrain, edges, TerrainManager } = terrainOn(map);
    // Arrow keys on Hills not yet kept, then a tile.
    terrain.setSurround(edges.patch(terrain.surround(), { rough: 0.9 }), 'live');
    terrain.setSurround(edges.patch(terrain.surround(), { style: 'ocean' }));
    assert.equal(terrain.undoStack.length, 2);
    terrain.undo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'continue', rough: 0.9 });
    terrain.undo();
    assert.deepEqual(plain(map.reactor3d.surround), { style: 'continue' });
    // A color still settling, then a material.
    terrain.setCliff({ tint: '#112233' }, 'live');
    terrain.setCliff({ name: 'Moss' });
    assert.equal(terrain.undoStack.length, 2);
    terrain.undo();
    assert.deepEqual(plain(terrain.cliff()), { name: 'Rock', slope: 40, tint: '#112233' });
    terrain.undo();
    // A color still settling, then a biome: the color is the earlier step, and undoing both leaves no tint.
    terrain.setCliff({ tint: '#112233' }, 'live');
    assert.ok(terrain.applyBiome('desert'));
    assert.equal(terrain.setCliff({}, 'commit'), false, 'the color\'s late timer finds nothing gathered');
    const kinds = () => Array.from(terrain.undoStack, entry => (entry.cliffSet ? 'cliff' : entry.biome ? (entry.label || 'Biome') : entry.groundSet ? 'ground' : '?'));
    assert.deepEqual(kinds(), ['cliff', 'Biome']);
    terrain.undo();
    assert.equal(terrain.cliff().tint, '#112233');
    assert.equal(terrain.redoStack[0].biome, true, 'the step is a biome both ways');
    terrain.undo();
    assert.equal(terrain.cliff().tint, '');
    // A ground type's color still settling, then a biome.
    assert.ok(terrain.addGroundType(TerrainManager.GROUND_PRESETS[1]) >= 0);
    terrain.editGroundType({ tint: '#445566' }, 'live');
    assert.ok(terrain.applyBiome('snow'));
    assert.deepEqual(kinds(), ['ground', 'ground', 'Biome']);
    // A floor given to a map without one: the same order, and the step keeps its name through undo and redo.
    const bare = shapedMap(); delete bare.reactor3d.room;
    const other = terrainOn(bare).terrain;
    other.setCliff({ slope: 55 }, 'live');
    assert.ok(other.setGroundFloor('!Grass-01'));
    assert.deepEqual(Array.from(other.undoStack, entry => (entry.cliffSet ? 'cliff' : entry.label)), ['cliff', 'Ground']);
    other.undo();
    assert.equal(other.redoStack[0].label, 'Ground');
    assert.equal(other.hasGroundFloor(), false);
    assert.equal(other.cliff().slope, 55, 'the angle set before the floor stays');
    other.redo();
    assert.equal(other.undoStack[1].label, 'Ground');
});

test('Beyond the Border on a map that is not 3D: every control is off and no floor is offered', () => {
    const html = panelFor({ id: 9, width: 6, height: 4, note: '', data: [] }, 'surround');
    assert.equal((html.match(/class="rr-build-chip rr-build-sstyle"[^>]* disabled>/g) || []).length, 6, 'the six tiles');
    assert.match(html, /class="rr-build-chip rr-build-sauto" aria-pressed="true" disabled>/);
    assert.match(html, /class="rr-build-sdistance"[^>]* disabled /);
    assert.match(html, /class="rr-build-srough"[^>]* disabled /);
    assert.equal((html.match(/rr-build-sside" data-side="\w+" disabled>/g) || []).length, 4);
    assert.doesNotMatch(html, /rr-build-gsetfloor|Nothing shows past the border|rr-build-sshow/);
    // The Ground panel offers no floor there either.
    assert.match(read('editor/src/BuildHotbar.js'), /const floors = terrain\.hasGroundFloor\(\) \|\| !this\.is3D\(\) \? \[\] : this\.groundFloors\(\);/);
});

test('weak graphics: Automatic rests where this computer shows, and a distance past it says so', () => {
    const line = html => html.match(/<div class="rr-build-note rr-build-wrap rr-build-sreach" data-shown="(\d+)"( hidden)?>([^<]*)<\/div>/);
    const slider = html => html.match(/class="rr-build-sdistance" min="24" max="320" step="8" value="(\d+)"/)[1];
    // Full graphics: the whole slider shows.
    const full = panelFor(shapedMap({ surround: { style: 'mountains', distance: 320 } }), 'surround');
    assert.deepEqual([line(full)[1], line(full)[2]], ['320', ' hidden']);
    R.gpuTierOverride = 'weak';
    try {
        const far = panelFor(shapedMap({ surround: { style: 'mountains', distance: 320 } }), 'surround');
        assert.equal(slider(far), '320', 'the stored distance stays');
        assert.deepEqual([line(far)[1], line(far)[2], line(far)[3]], ['96', undefined, 'This computer shows 96 tiles. Stronger graphics show the rest.']);
        const near = panelFor(shapedMap({ surround: { style: 'mountains', distance: 96 } }), 'surround');
        assert.equal(line(near)[2], ' hidden', 'a distance this computer shows whole needs no line');
        const auto = panelFor(shapedMap({ surround: { style: 'mountains' } }), 'surround');
        assert.equal(slider(auto), '96', 'Automatic rests at what Automatic shows here');
        assert.equal(line(auto)[2], ' hidden');
        const edges = require(path.join(repoRoot, 'editor/src/utils/MapEdges.js'));
        const previous = global.Reactor3D; global.Reactor3D = R;
        try { assert.deepEqual(edges.reach(), { min: 24, max: 320, auto: 96, shown: 96 }); } finally { global.Reactor3D = previous; }
    } finally { delete R.gpuTierOverride; }
    // What the runtime lays agrees with what the panel says.
    const map = shapedMap();
    const weak = R.surroundGeometry(map, R.normalizeSurround({ style: 'mountains', distance: 320 }), { weak: true });
    const strong = R.surroundGeometry(map, R.normalizeSurround({ style: 'mountains', distance: 320 }), { weak: false });
    assert.deepEqual([weak.info.distance, strong.info.distance], [96, 320]);
});

test('the Surroundings tick off: Beyond the Border says the land is hidden and offers to show it', () => {
    assert.doesNotMatch(panelFor(shapedMap({ surround: { style: 'mountains' } }), 'surround'), /rr-build-shidden|rr-build-sshow/);
    R.SURROUND_VISIBLE = false;
    try {
        const html = panelFor(shapedMap({ surround: { style: 'mountains' } }), 'surround');
        assert.match(html, /<div class="rr-build-note rr-build-wrap rr-build-shidden">The land past the border is hidden in this view\.<\/div><div class="rr-build-actions"><button type="button" class="rr-btn-secondary rr-build-sshow">Show Surroundings<\/button><\/div>/);
    } finally { R.SURROUND_VISIBLE = true; }
    const bar = read('editor/src/BuildHotbar.js');
    assert.match(bar, /panel\.querySelector\('\.rr-build-sshow'\)\?\.addEventListener\('click', \(\) => edges\.setVisible\(true\)\);/);
    assert.match(bar, /document\.addEventListener\('rr-surround-view', this\._onSurroundView\);/);
    assert.match(bar, /document\.removeEventListener\('rr-surround-view', this\._onSurroundView\);/);
});

test('Steep Ground with no material: the tint and the angle are off', () => {
    const none = panelFor(shapedMap({ room: { height: 4, floor: '!Grass-01', cliff: '' } }), 'steep');
    assert.match(none, /<div class="rr-build-range is-off"><span>Tint<\/span><input type="color" class="rr-build-ctint" value="#ffffff" disabled><\/div>/);
    assert.match(none, /<label class="rr-build-range is-off"><span>Starts At<\/span><input type="range" class="rr-build-cslope" min="10" max="80" step="1" value="40" disabled data-no-stepper>/);
    const rock = panelFor(shapedMap(), 'steep');
    assert.doesNotMatch(rock, /is-off|disabled/);
    // The editor's own swatch takes the same switch.
    const popup = require(path.join(repoRoot, 'editor/src/utils/ColorPopup.js'));
    assert.match(popup.swatch('rr-build-ctint', '#a99f93', true), /style="background:#a99f93;" disabled>/);
    assert.doesNotMatch(popup.swatch('rr-build-ctint', '#a99f93'), /disabled/);
});

/** An element that keeps its listeners, for the panel's bindings. */
function fakeElement(extra = {}) {
    const listeners = {};
    return Object.assign({ dataset: {}, value: '', hidden: false, textContent: '', attributes: {},
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        setAttribute(name, value) { this.attributes[name] = value; },
        focus() { this.focused = true; },
        fire(type, init) { for (const fn of listeners[type] || []) fn(Object.assign({ target: this, currentTarget: this, preventDefault() { this.prevented = true; } }, init)); } }, extra);
}

test('a slider is one step a drag and one a run of arrow keys', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    const bar = Object.create(BuildHotbar.prototype), el = fakeElement();
    const lives = []; let keeps = 0;
    bar.gestureRange(el, value => lives.push(value), () => { keeps++; });
    // A drag: kept when the pointer lets go.
    el.fire('pointerdown');
    for (const value of ['0.6', '0.7']) { el.value = value; el.fire('input'); }
    el.fire('change');
    assert.deepEqual([lives, keeps], [[0.6, 0.7], 1]);
    // Three arrow keys, each with its own change: kept once, a moment after the last.
    for (const value of ['0.65', '0.6', '0.55']) { el.fire('keydown'); el.value = value; el.fire('input'); el.fire('change'); t.mock.timers.tick(100); }
    assert.equal(keeps, 1, 'nothing is kept while the keys keep coming');
    // A key held: the wait before it repeats (660 ms on a stock X11 desktop) is not the end of the run.
    el.fire('keydown'); el.value = '0.5'; el.fire('input'); el.fire('change'); t.mock.timers.tick(660);
    assert.equal(keeps, 1);
    assert.ok(BuildHotbar.GATHER_MS > 660 && BuildHotbar.GATHER_MS > 400 + 60, 'longer than a held key\'s and a held arrow\'s first repeat');
    t.mock.timers.tick(BuildHotbar.GATHER_MS);
    assert.equal(keeps, 2);
    // Keys, then the focus leaves: kept at once, and not again by the timer.
    el.fire('keydown'); el.value = '0.5'; el.fire('input'); el.fire('change');
    el.fire('blur');
    assert.equal(keeps, 3);
    t.mock.timers.tick(2000);
    el.fire('blur');
    assert.equal(keeps, 3);
    // A drag after keys is kept on release again.
    el.fire('pointerdown'); el.value = '0.9'; el.fire('input'); el.fire('change');
    assert.equal(keeps, 4);
    bar.gestureRange(null, () => {}, () => {});
});

test('Beyond the Border\'s controls: a number\'s arrows held are one step and do not redraw the panel', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    const map = shapedMap({ surround: { style: 'mountains', seed: 10 } }), { terrain } = terrainOn(map);
    const previous = { edges: global.RRMapEdges, reactor: global.Reactor3D };
    global.Reactor3D = R;
    global.RRMapEdges = require(path.join(repoRoot, 'editor/src/utils/MapEdges.js'));
    try {
        const seed = fakeElement({ dataset: { key: 'seed' }, value: '10' }), height = fakeElement({ dataset: { key: 'height' }, value: '45' });
        const tile = fakeElement({ dataset: { style: 'plateau' } }), south = fakeElement({ dataset: { side: 'south' }, value: 'ocean' });
        const distance = fakeElement({ value: '160' }), hills = fakeElement({ value: '0.5' }), auto = fakeElement(), reach = fakeElement({ dataset: { shown: '96' }, hidden: true });
        const one = { '.rr-build-sstyle': tile, '.rr-build-sauto': auto, '.rr-build-sdistance': distance, '.rr-build-srough': hills,
            '.rr-build-sdistance-value': fakeElement(), '.rr-build-srough-value': fakeElement(), '.rr-build-sreach': reach, '.rr-build-sside[data-side="south"]': south };
        const many = { '.rr-build-sstyle': [tile], '.rr-build-sside': [south], '.rr-build-snumber': [seed, height] };
        const bar = Object.create(BuildHotbar.prototype);
        let draws = 0;
        bar.panel = { querySelector: selector => one[selector] || null, querySelectorAll: selector => many[selector] || [] };
        bar.currentMap = () => map; bar.renderTerrainPanel = () => { draws++; };
        bar.bindSurroundBody(terrain);
        // The seed's up arrow held: one change at the press, the wait before it repeats (RRNumberSteppers: 400 ms and one interval), then one every 60 ms.
        seed.value = '11'; seed.fire('change'); t.mock.timers.tick(460);
        assert.equal(terrain.undoStack.length, 0, 'the press is not kept before the repeats start');
        for (let i = 0; i < 20; i++) { seed.value = String(Number(seed.value) + 1); seed.fire('change'); t.mock.timers.tick(60); }
        assert.equal(map.reactor3d.surround.seed, 31, 'the land follows every tick');
        assert.deepEqual([terrain.undoStack.length, draws], [0, 0], 'no step and no redraw while it is held');
        assert.equal(Number(seed.value), 31);
        t.mock.timers.tick(BuildHotbar.GATHER_MS);
        assert.equal(terrain.undoStack.length, 1, 'one step when it stops');
        // A number typed, then a tile clicked: the field's change comes on its blur, and the click still lands.
        seed.value = '777'; seed.fire('change'); seed.fire('blur');
        assert.deepEqual([terrain.undoStack.length, draws, map.reactor3d.surround.seed], [2, 0, 777]);
        tile.fire('click');
        assert.deepEqual([terrain.undoStack.length, draws, map.reactor3d.surround.style], [3, 1, 'plateau']);
        // The field shows what was kept: held to its range, the default when cleared.
        height.value = '500'; height.fire('change');
        assert.equal(height.value, 160);
        seed.value = ''; seed.fire('change');
        assert.equal(seed.value, 1);
        assert.equal('seed' in map.reactor3d.surround, false);
        assert.equal(terrain.undoStack.length, 4, 'the height was kept as its own step when the seed changed');
        t.mock.timers.tick(BuildHotbar.GATHER_MS);
        assert.equal(terrain.undoStack.length, 5);
        // Arrow keys on Distance, then a side before they are kept: two steps, and the side's list keeps the focus.
        distance.fire('keydown'); distance.value = '200'; distance.fire('input'); distance.fire('change');
        assert.equal(reach.hidden, false, 'past what this computer shows');
        assert.equal(one['.rr-build-sdistance-value'].textContent, 200);
        south.fire('change');
        t.mock.timers.tick(0);
        assert.deepEqual([terrain.undoStack.length, draws, south.focused], [7, 2, true]);
        assert.deepEqual(plain(map.reactor3d.surround), { style: 'plateau', edges: { south: 'ocean' }, distance: 200, height: 160 });
        t.mock.timers.tick(2000);
        assert.equal(terrain.undoStack.length, 7, 'the keys\' late timer keeps nothing twice');
        // Ctrl+Z in a number field: the map's, with an arrow's change still gathering (it is the step undone); the field's own while text is being typed.
        seed.value = '5'; seed.fire('change');
        const ctrlZ = { key: 'z', ctrlKey: true }, ctrlY = { key: 'y', ctrlKey: true };
        seed.fire('keydown', ctrlZ);
        assert.deepEqual([terrain.undoStack.length, terrain.redoStack.length, draws, 'seed' in map.reactor3d.surround], [7, 1, 3, false]);
        seed.fire('keydown', ctrlY);
        assert.deepEqual([terrain.undoStack.length, map.reactor3d.surround.seed, draws], [8, 5, 4]);
        seed.fire('input', { isTrusted: true, inputType: 'insertText' });
        seed.fire('keydown', ctrlZ);
        assert.deepEqual([terrain.undoStack.length, draws], [8, 4], 'typed text is the field\'s to undo');
        seed.value = '6'; seed.fire('change'); seed.fire('blur');
        seed.fire('keydown', { key: 'a', ctrlKey: true });
        assert.equal(terrain.undoStack.length, 9, 'another key is not an undo');
        seed.fire('keydown', ctrlZ);
        assert.equal(map.reactor3d.surround.seed, 5);
        for (let i = 0; i < 8; i++) terrain.undo();
        assert.deepEqual(plain(map.reactor3d.surround), { style: 'mountains', seed: 10 });
    } finally { global.RRMapEdges = previous.edges; global.Reactor3D = previous.reactor; }
});

test('the Terrain panel\'s status line: the Steep Ground card follows an undo, and Beyond the Border shows none', () => {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    const bar = Object.create(BuildHotbar.prototype), line = { textContent: '', hidden: true };
    let flatShown = true, slopes = false, draws = 0, slot = 'ground', is3D = true;
    bar.visible = true; bar.group = () => 'terrain'; bar.activeSlot = () => slot; bar.is3D = () => is3D;
    bar.panel = { querySelector: selector => (selector === '.rr-build-tstatus' ? line : selector === '.rr-build-steep-flat' && flatShown ? {} : null) };
    bar.terrain = () => ({ hasSlopes: () => slopes });
    bar.renderTerrainPanel = () => { draws++; };
    bar.refreshTerrainStatus('The ground is flat.');
    assert.deepEqual([draws, line.textContent, line.hidden], [0, 'The ground is flat.', false]);
    // A hill raised by a redo: the card has controls to show.
    slopes = true;
    bar.refreshTerrainStatus('The ground has been shaped.');
    assert.equal(draws, 1);
    // The hill undone while the card shows its controls.
    flatShown = false; slopes = false;
    bar.refreshTerrainStatus('The ground is flat.');
    assert.equal(draws, 2);
    slopes = true;
    bar.refreshTerrainStatus('The ground has been shaped.');
    assert.equal(draws, 2, 'nothing to redraw when the card is as the ground is');
    // Beyond the Border: the ground's line is not its business; that the map is not 3D is.
    slot = 'surround';
    bar.refreshTerrainStatus('The ground has been shaped. 6 water sheet(s)');
    assert.deepEqual([line.textContent, line.hidden], ['', true]);
    is3D = false;
    bar.refreshTerrainStatus('This map is not a 3D map.');
    assert.deepEqual([line.textContent, line.hidden], ['This map is not a 3D map.', false]);
    assert.match(read('editor/src/BuildHotbar.js'), /const status = this\.terrainStatus\(terrain\.statusText \? terrain\.statusText\(\) : ''\);/);
});

test('the steep ground follows its slider once a frame, reading no material off disk for an angle or a tint', async () => {
    const MapEditor3D = require(path.join(repoRoot, 'editor/src/MapEditor3D.js'));
    const map = shapedMap(), { elevation } = terrainOn(map);
    const previous = { elevation: global.RRMapElevation, frame: global.requestAnimationFrame };
    const frames = [];
    global.RRMapElevation = elevation;
    global.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
    try {
        const puts = [], loads = [];
        let renders = 0, shown = map;
        const scene = { _roomCliff: { name: 'Rock', slope: 40, tint: '' },
            setRoomCliff(cliff, load) { puts.push([cliff.name, cliff.slope, cliff.tint, cliff.name ? load(cliff.name) : null]); this._roomCliff = { name: cliff.name, slope: cliff.slope, tint: cliff.tint }; return true; } };
        const editor = Object.create(MapEditor3D.prototype);
        editor.mapScene = scene; editor.currentMap = () => shown; editor.requestRender = () => { renders++; };
        editor.materialImages = { Rock: 'rock image' };
        editor.loadMaterials = async () => { loads.push(elevation.roomCliff(elevation.room(map)).name); editor.materialImages.Moss = 'moss image'; return { Moss: 'moss image' }; };
        const frame = () => { for (const fn of frames.splice(0)) fn(); };
        const set = patch => elevation.setRoom(map, Object.assign({}, elevation.room(map), patch));
        // Five moves of the slider inside one frame.
        for (const cliffSlope of [45, 50, 55, 60, 62]) { set({ cliffSlope }); assert.equal(editor.updateCliffInPlace(), true); }
        assert.deepEqual([puts.length, frames.length, renders], [0, 1, 0], 'nothing is done in the slider\'s own handler');
        frame();
        assert.deepEqual(puts, [['Rock', 62, '', 'rock image']], 'once, with the newest angle');
        assert.deepEqual([loads.length, renders], [0, 1]);
        // A tint: the same.
        set({ cliffTint: '#a99f93' }); editor.updateCliffInPlace(); frame();
        assert.deepEqual([puts[1], loads.length], [['Rock', 62, '#a99f93', 'rock image'], 0]);
        // Another material is read off disk first.
        set({ cliff: 'Moss' }); editor.updateCliffInPlace(); frame();
        assert.equal(puts.length, 2, 'not before its image is in');
        await Promise.resolve(); await Promise.resolve();
        assert.deepEqual([puts[2], loads], [['Moss', 62, '#a99f93', 'moss image'], ['Moss']]);
        // Its angle after that, and no material at all, read nothing.
        set({ cliffSlope: 30 }); editor.updateCliffInPlace(); frame();
        set({ cliff: '' }); editor.updateCliffInPlace(); frame();
        assert.deepEqual([puts[3], puts[4], loads.length], [['Moss', 30, '#a99f93', 'moss image'], ['', 30, '#a99f93', null], 1]);
        // Another map came up before the frame: its scene shows its own.
        set({ cliffSlope: 70 }); editor.updateCliffInPlace();
        editor.mapScene = { setRoomCliff() { throw new Error('the new scene is not touched'); } };
        frame();
        assert.equal(puts.length, 5);
        // A scene with no such floor, or no map: the view builds again as before.
        editor.mapScene = {}; assert.equal(editor.updateCliffInPlace(), false);
        editor.mapScene = scene; shown = null; assert.equal(editor.updateCliffInPlace(), false);
    } finally { global.RRMapElevation = previous.elevation; global.requestAnimationFrame = previous.frame; }
});

test('a map that is not 3D takes the maps past its sides, in a sidecar that says nothing of a 3D view', () => {
    const map = { id: 9, width: 6, height: 4, note: '', data: [] }, { terrain, edges } = terrainOn(map);
    assert.equal(terrain.setSurround(edges.patch(terrain.surroundBase(), { neighbors: { east: { map: 4, shift: 2 } } })), true);
    assert.deepEqual(JSON.parse(JSON.stringify(map.reactor3d)), { version: 1, surround: { style: 'none', neighbors: { east: { map: 4, shift: 2 } } } });
    assert.equal(terrain.undoStack.length, 1, 'one step');
    // The land past the border is still refused, with the neighbor kept.
    assert.equal(terrain.setSurround(edges.patch(terrain.surround(), { style: 'ocean' })), false);
    assert.equal(map.reactor3d.surround.style, 'none');
    terrain.undo();
    assert.equal(map.reactor3d.surround || null, null, 'undo takes the neighbor back');
});
