/**
 * Switching to a map whose tileset leaves a sheet slot empty must empty that
 * slot in the palette. The texture cache is keyed by slot (A1..E), and the
 * loader skips empty names, so a slot the new tileset does not fill kept
 * showing the previous tileset's sheet — stale layers in the palette after
 * creating a map with a different tileset.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const viewerSource = fs.readFileSync(path.join(editorRoot, 'src', 'TilesetPaletteViewer.js'), 'utf8');
const sheetsSource = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'TilesetSheets.js'), 'utf8');

const TILESETS = JSON.stringify([
    null,
    // Tileset 1 fills A2, A5, B, C and the Reactor-added F and G slots.
    { tilesetNames: ['', 'Outside_A2', '', '', 'Outside_A5', 'Outside_B', 'Outside_C', '', '',
        'Outside_F', 'Outside_G'] },
    // Tileset 2 is MZ-authored: nine entries, only B filled. Its loop never
    // even reaches the F/G indices, so only the up-front cache reset can
    // displace an old F/G sheet.
    { tilesetNames: ['', '', '', '', '', 'Inside_B', '', '', ''] }
]);

function makeViewer() {
    const pendingImages = [];
    const info = { innerHTML: '', style: {} };
    const elements = { 'selection-info': info };
    const sandbox = {
        console,
        window: {},
        document: {
            getElementById: id => elements[id] || null,
            querySelectorAll: () => [],
            querySelector: () => null,
            createElement: () => ({ style: {}, getContext: () => null })
        },
        Image: class FakeImage {
            set src(value) { this._src = value; pendingImages.push(this); }
            get src() { return this._src; }
        }
    };
    const TilesetPaletteViewer = vm.runInNewContext(
        `${sheetsSource}\n${viewerSource}\nTilesetPaletteViewer;`, sandbox);

    const viewer = Object.create(TilesetPaletteViewer.prototype);
    viewer.projectPath = '/project';
    viewer.fs = {
        existsSync: () => true,
        readFileSync: () => TILESETS
    };
    viewer.path = { join: (...parts) => parts.join('/') };
    viewer.refreshTileMetrics = () => false;
    viewer.tilesetTextures = {};
    viewer.currentLayer = 'B';
    viewer.selectedTiles = [];
    viewer.mapEditor = { hideTilePreview: () => { viewer.__previewHidden = (viewer.__previewHidden || 0) + 1; } };
    viewer.renderCurrentLayer = () => { viewer.__rendered = (viewer.__rendered || 0) + 1; };
    viewer.__info = info;
    viewer.__pendingImages = pendingImages;
    return viewer;
}

const tick = () => new Promise(resolve => setImmediate(resolve));

async function drainImages(viewer) {
    // Resolve loads one at a time: the loader awaits each image before
    // creating the next.
    for (let i = 0; i < 20; i++) {
        await tick();
        const img = viewer.__pendingImages.shift();
        if (img && img.onload) img.onload();
    }
    await tick();
}

test('a slot the new tileset leaves empty no longer shows the old tileset\'s sheet', async () => {
    const viewer = makeViewer();

    const first = viewer.loadTilesetForMap({ tilesetId: 1 });
    await drainImages(viewer);
    await first;
    assert.deepEqual(Object.keys(viewer.tilesetTextures).sort(), ['A2', 'A5', 'B', 'C', 'F', 'G'],
        'tileset 1 fills its six slots, F and G included');
    viewer.selectedTiles = [{ x: 1, y: 1, layer: 'C' }];

    const second = viewer.loadTilesetForMap({ tilesetId: 2 });
    await drainImages(viewer);
    await second;
    assert.deepEqual(Object.keys(viewer.tilesetTextures), ['B'],
        'only the new tileset\'s own sheet remains; A2/A5/C and the F/G slots are empty again');
    assert.match(viewer.tilesetTextures.B.src, /Inside_B/,
        'the surviving slot holds the NEW tileset\'s sheet');
    assert.equal(viewer.selectedTiles.length, 0,
        'a selection made on the old tileset\'s sheets is dropped');
    assert.match(viewer.__info.innerHTML, /No tiles selected/);
});

test('reloading the same tileset keeps the selection', async () => {
    const viewer = makeViewer();
    const first = viewer.loadTilesetForMap({ tilesetId: 1 });
    await drainImages(viewer);
    await first;
    const selection = [{ x: 2, y: 0, layer: 'B' }];
    viewer.selectedTiles = selection;

    const again = viewer.loadTilesetForMap({ tilesetId: 1 });
    await drainImages(viewer);
    await again;
    assert.deepEqual(viewer.selectedTiles, selection,
        'switching between maps sharing a tileset does not clear the pick');
});

test('a superseded slow load cannot repaint the palette with the old tileset', async () => {
    const viewer = makeViewer();

    // Start loading tileset 1 but leave its images unresolved...
    const slow = viewer.loadTilesetForMap({ tilesetId: 1 });
    await tick();
    const slowImages = viewer.__pendingImages.splice(0);

    // ...switch to tileset 2 and let it finish first.
    const fast = viewer.loadTilesetForMap({ tilesetId: 2 });
    await drainImages(viewer);
    await fast;

    // Now the old load's images arrive late.
    for (const img of slowImages) {
        if (img.onload) img.onload();
        await tick();
    }
    await drainImages(viewer);
    await slow;

    assert.deepEqual(Object.keys(viewer.tilesetTextures), ['B'],
        'late arrivals from the superseded load are discarded');
    assert.match(viewer.tilesetTextures.B.src, /Inside_B/);
    assert.equal(viewer.__rendered, 1,
        'only the current load repaints; the stale one returns silently');
});
