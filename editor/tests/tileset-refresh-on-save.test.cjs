const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const controllerSource = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
const tilemapSource = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
const tilesetEditorSource = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');

function controller({ mapTilesetId = 3, tilesets = {} } = {}) {
    const ProjectController = vm.runInNewContext(`${controllerSource}\nProjectController;`, {
        console, process, require, nw: {}, window: {},
        document: { getElementById: () => null, addEventListener: () => {} }
    });
    const calls = { refreshed: [], palette: [] };
    const instance = Object.create(ProjectController.prototype);
    instance.databaseManager = { data: { tilesets } };
    instance.tilemapManager = {
        currentMap: { id: 596, tilesetId: mapTilesetId },
        refreshTilesetImages: async tileset => { calls.refreshed.push(tileset); return true; }
    };
    instance.tilesetPaletteViewer = {
        loadTilesetForMap: async mapData => { calls.palette.push(mapData); }
    };
    instance.__calls = calls;
    return instance;
}

/** A TilemapManager with just enough state for the refresh logic. */
function tilemap({ names = [], mapData = null, width = 4, height = 4 } = {}) {
    const TilemapManager = vm.runInNewContext(`${tilemapSource}\nTilemapManager;`, {
        console, process, require, nw: {}, window: {},
        document: { createElement: () => ({ getContext: () => null }) },
        PIXI: { Assets: { load: async () => ({ source: { style: {} } }) } }
    });
    const instance = Object.create(TilemapManager.prototype);
    instance.TILE_ID_A5 = 1536;
    instance.TILE_ID_A1 = 2048;
    instance.TILE_ID_A2 = 2816;
    instance.TILE_ID_A3 = 4352;
    instance.TILE_ID_A4 = 5888;
    instance.TILE_ID_MAX = 8192;
    instance.currentTileset = { tilesetNames: names.slice() };
    instance.currentMap = mapData ? { width, height, data: mapData } : null;
    instance.tilesetTextures = {};
    instance.textureCache = {};
    instance.a1AnimationCache = {};
    return instance;
}

test('saving the tileset in use rebinds both surfaces', async () => {
    const withF = { id: 3, tilesetNames: ['a1', '', '', '', '', 'b', '', '', '', 'my_f_sheet'] };
    const c = controller({ mapTilesetId: 3, tilesets: { 3: withF } });

    assert.equal(await c.refreshTilesetSurfaces(3), true);
    assert.deepEqual(c.__calls.refreshed, [withF]);
    assert.equal(c.__calls.refreshed[0].tilesetNames[9], 'my_f_sheet');
    assert.equal(c.__calls.palette.length, 1);
});

test('saving a different tileset leaves the open map alone', async () => {
    const c = controller({ mapTilesetId: 3, tilesets: { 3: { id: 3, tilesetNames: [] } } });
    assert.equal(await c.refreshTilesetSurfaces(7), false);
    assert.equal(c.__calls.refreshed.length, 0);
    assert.equal(c.__calls.palette.length, 0);
});

test('string and number tileset ids compare equal', async () => {
    // The dropdown stores ids as strings; a mismatch would silently skip the
    // refresh and bring back the restart-to-see-it behaviour.
    const ts = { id: 3, tilesetNames: [] };
    const c = controller({ mapTilesetId: 3, tilesets: { 3: ts } });
    assert.equal(await c.refreshTilesetSurfaces('3'), true);
});

test('refreshing without an open map is a no-op', async () => {
    const c = controller();
    c.tilemapManager.currentMap = null;
    assert.equal(await c.refreshTilesetSurfaces(3), false);
});

test('tile ids map to the sheet slot the engine draws them from', () => {
    const tm = tilemap();
    assert.equal(tm.setNumberForTileId(0), -1, 'empty');
    assert.equal(tm.setNumberForTileId(5), 5, 'B');
    assert.equal(tm.setNumberForTileId(800), 8, 'E');
    assert.equal(tm.setNumberForTileId(1029), 9, 'F');
    assert.equal(tm.setNumberForTileId(1300), 10, 'G');
    assert.equal(tm.setNumberForTileId(1600), 4, 'A5');
    assert.equal(tm.setNumberForTileId(2100), 0, 'A1');
    assert.equal(tm.setNumberForTileId(3000), 1, 'A2');
    assert.equal(tm.setNumberForTileId(4400), 2, 'A3');
    assert.equal(tm.setNumberForTileId(6000), 3, 'A4');
});

test('assigning a sheet to an empty slot does not repaint the map', async () => {
    // The common case. Nothing on the map can be drawn from a slot that was
    // empty until now, so a repaint would be pure cost — and repainting a large
    // map on every tileset save is what froze the editor before.
    const mapData = new Array(4 * 4 * 6).fill(0);
    mapData[0] = 2100; // one A1 tile
    const tm = tilemap({ names: ['a1', '', '', '', '', '', '', '', ''], mapData });
    let repainted = false;
    tm.renderMap = () => { repainted = true; };
    tm.path = { join: (...p) => p.join('/') };
    tm.assetUrl = p => p;
    tm.projectPath = '/p';

    const changed = await tm.refreshTilesetImages({
        tilesetNames: ['a1', '', '', '', '', '', '', '', '', 'new_f']
    });

    assert.equal(changed, true, 'the slot was rebound');
    assert.equal(repainted, false, 'but nothing on the map uses it yet');
    assert.ok(tm.tilesetTextures[9], 'and the new sheet is loaded');
});

test('replacing a sheet the map uses does repaint', async () => {
    const mapData = new Array(4 * 4 * 6).fill(0);
    mapData[0] = 1029; // an F tile
    const tm = tilemap({ names: ['', '', '', '', '', '', '', '', '', 'old_f'], mapData });
    let repainted = false;
    tm.renderMap = () => { repainted = true; };
    tm.path = { join: (...p) => p.join('/') };
    tm.assetUrl = p => p;
    tm.projectPath = '/p';

    await tm.refreshTilesetImages({
        tilesetNames: ['', '', '', '', '', '', '', '', '', 'new_f']
    });
    assert.equal(repainted, true);
});

test('an unchanged tileset does no work at all', async () => {
    const names = ['a1', '', '', '', '', 'b', '', '', ''];
    const tm = tilemap({ names, mapData: new Array(4 * 4 * 6).fill(0) });
    let repainted = false;
    tm.renderMap = () => { repainted = true; };
    assert.equal(await tm.refreshTilesetImages({ tilesetNames: names.slice() }), false);
    assert.equal(repainted, false);
});

test('only the replaced slot loses its cached tile textures', async () => {
    const tm = tilemap({
        names: ['', '', '', '', '', 'b', '', '', '', 'old_f'],
        mapData: new Array(4 * 4 * 6).fill(0)
    });
    tm.renderMap = () => {};
    tm.path = { join: (...p) => p.join('/') };
    tm.assetUrl = p => p;
    tm.projectPath = '/p';
    tm.textureCache = {
        '5_0_0': { destroy() {} },      // B, untouched
        '9_48_0': { destroy() {} },     // F, replaced
        'auto_0_0_0': { destroy() {} }  // A1, untouched
    };

    await tm.refreshTilesetImages({
        tilesetNames: ['', '', '', '', '', 'b', '', '', '', 'new_f']
    });

    assert.deepEqual(Object.keys(tm.textureCache).sort(), ['5_0_0', 'auto_0_0_0'],
        'the B and A1 cuts survive; only F is dropped');
});

test('clearing a slot drops its texture', async () => {
    const tm = tilemap({
        names: ['', '', '', '', '', '', '', '', '', 'old_f'],
        mapData: new Array(4 * 4 * 6).fill(0)
    });
    tm.renderMap = () => {};
    tm.path = { join: (...p) => p.join('/') };
    tm.assetUrl = p => p;
    tm.projectPath = '/p';
    tm.tilesetTextures = { 9: { source: { style: {} } } };

    await tm.refreshTilesetImages({ tilesetNames: ['', '', '', '', '', '', '', '', '', ''] });
    assert.equal(tm.tilesetTextures[9], undefined);
});

test('the save announces itself and the listener coalesces bursts', () => {
    assert.match(tilesetEditorSource, /new CustomEvent\('rr-tileset-saved'/);
    assert.match(controllerSource, /addEventListener\('rr-tileset-saved', this\._tilesetSavedHandler\)/);
    assert.match(controllerSource, /if \(this\._tilesetSavedHandler \|\| typeof document === 'undefined'\) return;/,
        'installed once, not per modal open');
    assert.match(controllerSource, /clearTimeout\(this\._tilesetSavedTimer\)/,
        'a burst of flag edits collapses into one refresh');
});

test('assigning a sheet announces it, without waiting for the Save button', () => {
    // Reported as: adding tiles to E, F or G in the database does not make them
    // selectable in those tabs until Save beside the name is pressed — and a
    // tile placed from such a sheet vanishes, because the sheet it addresses
    // was never loaded. Assigning only refreshed the database editor's own
    // thumbnails; the map canvas and the palette captured the tileset when the
    // map opened and heard nothing.
    const assign = tilesetEditorSource.slice(
        tilesetEditorSource.indexOf('assignTilesetToLayer(layerIndex'));
    const body = assign.slice(0, assign.indexOf('\n    switchTab('));
    assert.match(body, /RRTilesetSheets\.setNameAt\(/, 'it still assigns the name');
    assert.match(body, /this\.notifyTilesetSaved\(\)/,
        'and announces it so the map and palette reload the sheet');
    // Announce only: writing Tilesets.json stays with the Database modal's own
    // OK, or Cancel could no longer put things back.
    assert.doesNotMatch(body, /this\.saveTilesetsFile\(\)/);
});

test('clearing a sheet announces it too', () => {
    // The same call assigns and clears — an empty name is how a slot is
    // emptied — so both go through one notification.
    const assign = tilesetEditorSource.slice(
        tilesetEditorSource.indexOf('assignTilesetToLayer(layerIndex'));
    const body = assign.slice(0, assign.indexOf('\n    switchTab('));
    const notifies = body.match(/this\.notifyTilesetSaved\(\)/g) || [];
    assert.equal(notifies.length, 1, 'announced once, on every path through it');
});

test('a passability or star edit announces itself', () => {
    // Reported as: change passability in the Database and the map editor keeps
    // the old setting until the project is closed and reopened. The map canvas
    // holds the tileset object it captured when the map opened, and the flag
    // edit only repainted the Database's own canvas. ProjectController's
    // listener was already written expecting this — its comment says "on every
    // flag edit as well as on an image assignment" — it was simply never sent.
    const edit = tilesetEditorSource.slice(
        tilesetEditorSource.indexOf('if (currentFlag !== oldFlag) {'));
    const body = edit.slice(0, edit.indexOf('\n    }'));
    assert.match(body, /this\.currentTileset\.flags\[tileIndex\] = currentFlag/);
    assert.match(body, /this\.notifyTilesetSaved\(\)/,
        'so the map canvas re-reads the flags');
});

test('the refresh puts the new flags on the map canvas, not just the sheets', () => {
    // Announcing is only half of it: what arrives has to replace the tileset
    // the tilemap is reading flags out of.
    assert.match(tilemapSource, /async refreshTilesetImages\(tileset\)/);
    assert.match(tilemapSource, /this\.currentTileset = next;/);
});

test('a 3D classification change tells the 3D view', () => {
    // The 3D view rebuilds from the classification, which is edited in the
    // Database rather than on the map — so nothing announced it and the view
    // kept the shapes it was built with until the map was next painted.
    assert.match(tilesetEditorSource, /new CustomEvent\('rr-tileset-3d-saved'/);
    const scene = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(scene, /addEventListener\('rr-tileset-3d-saved'/);
    assert.match(scene, /removeEventListener\('rr-tileset-3d-saved'/,
        'and lets go of it, or a second project would rebuild the first one too');
});

test('a map last edited in 3D comes up in 3D, and only that map', () => {
    // 3D is a view preference remembered per map, and the viewport is torn
    // down when a project closes — so a project reopened on a 3D map has to
    // ask for the viewport back rather than assume it survived, and a map
    // left in 2D must not inherit the previous map's view.
    assert.match(controllerSource, /reconcileMap3DView\(wanted\)/,
        'the controller asks for the view the map remembers');
    assert.match(controllerSource, /map3DViewRemembered\(this\.tilemapManager\?\.currentMap\?\.id\)/);
    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /reconcileMap3DView = \(wanted\) => \{/);
    assert.match(main, /this\.applyMap3DViewPreference\(wanted === true\);/,
        'and turns it on or off to match what that map remembers');
});
