const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const MapEditor = require(path.join(editorRoot, 'src', 'MapEditor.js'));

function makeMap(width, height, valueAt = () => 0) {
    const layerSize = width * height;
    const data = new Array(layerSize * 6);
    for (let layer = 0; layer < 6; layer++) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                data[layer * layerSize + y * width + x] = valueAt(layer, x, y);
            }
        }
    }
    return { width, height, data, tilesetId: 3 };
}

function makeDataEditor(map = null) {
    return new MapEditor({ container: null, currentMap: map }, { currentLayer: 'A', selectedTiles: [] });
}

test('right-drag map sampling captures all six planes in either direction', () => {
    const map = makeMap(4, 3, (layer, x, y) => layer * 100 + y * 4 + x);
    const editor = makeDataEditor(map);

    const stamp = editor.captureMapStamp(map, { x: 2, y: 2 }, { x: 1, y: 0 });

    assert.equal(stamp.width, 2);
    assert.equal(stamp.height, 3);
    assert.equal(stamp.tilesetId, 3);
    assert.deepEqual(stamp.data.slice(0, 6), [1, 2, 5, 6, 9, 10]);
    assert.deepEqual(stamp.data.slice(30, 36), [501, 502, 505, 506, 509, 510]);
});

test('map stamps copy zeros, shadows, and regions while clipping at map edges', () => {
    const source = makeMap(2, 2, (layer, x, y) => layer * 10 + y * 2 + x);
    source.data[0] = 0;
    source.data[4 * 4] = 15;
    source.data[5 * 4] = 42;
    const editor = makeDataEditor(source);
    const stamp = editor.captureMapStamp(source, { x: 0, y: 0 }, { x: 1, y: 1 });
    const target = makeMap(3, 3, () => 999);

    const result = editor.applyMapStamp(target, stamp, { x: 2, y: 2 });
    const layerSize = target.width * target.height;

    assert.equal(result.changed, true);
    assert.equal(target.data[2 + 2 * target.width], 0, 'transparent source cells clear visual layers');
    assert.equal(target.data[4 * layerSize + 2 + 2 * target.width], 15, 'shadow masks are copied');
    assert.equal(target.data[5 * layerSize + 2 + 2 * target.width], 42, 'region IDs are copied');
    assert.equal(target.data[1 + 2 * target.width], 999, 'cells left of the clipped destination stay unchanged');
    assert.equal(result.visualUpdates.length, 5);
    assert.equal(result.regionUpdates.length, 1);
});

test('one sampled-map stamp is one undoable edit across every layer', () => {
    const map = makeMap(3, 2, () => 0);
    const tileUpdates = [];
    let regionUpdates = 0;
    let renders = 0;
    const tilemapManager = {
        container: null,
        currentMap: map,
        updateTiles: updates => tileUpdates.push(...updates),
        renderMap: () => { renders++; }
    };
    const editor = new MapEditor(tilemapManager, { currentLayer: 'A', selectedTiles: [] });
    editor.regionManager = {
        enabled: true,
        updateRegionCells: updates => { regionUpdates += updates.length; },
        renderRegions: () => { regionUpdates++; }
    };
    editor.notifyUndoStateChange = () => {};
    editor.mapStamp = {
        width: 1,
        height: 1,
        tilesetId: 3,
        data: [10, 20, 30, 40, 15, 99]
    };

    editor.beginEditState();
    editor.paintMapStamp(1, 1);
    editor.commitEditState();

    assert.equal(editor.undoStack.length, 1);
    assert.equal(tileUpdates.length, 5);
    assert.equal(regionUpdates, 1);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(layer => map.data[layer * 6 + 4]), [10, 20, 30, 40, 15, 99]);

    editor.undo();
    assert.deepEqual(map.data, new Array(36).fill(0));
    assert.equal(renders, 1);
});

test('right-drag selects a stamp without touching undo, then left-click places it', () => {
    class FakeDisplayObject {
        constructor() { this.children = []; this.visible = true; this.parent = null; }
        addChild(child) { child.parent = this; this.children.push(child); return child; }
        removeChildren() { const children = this.children; this.children = []; return children; }
        removeChild(child) { this.children = this.children.filter(item => item !== child); }
        destroy() {}
    }
    class FakeGraphics extends FakeDisplayObject {
        clear() { return this; }
        rect() { return this; }
        fill() { return this; }
        stroke() { return this; }
    }
    class FakeContainer extends FakeDisplayObject {
        constructor() { super(); this.handlers = new Map(); }
        on(name, handler) { this.handlers.set(name, handler); }
        off(name, handler) { if (this.handlers.get(name) === handler) this.handlers.delete(name); }
    }
    const previousPixi = global.PIXI;
    global.PIXI = { Graphics: FakeGraphics, Container: FakeContainer };
    try {
        const container = new FakeContainer();
        const map = makeMap(4, 3, (layer, x, y) => layer * 100 + y * 4 + x);
        const updates = [];
        const tilemapManager = {
            container,
            currentMap: map,
            TILE_WIDTH: 48,
            TILE_HEIGHT: 48,
            pauseLazyLoading() {},
            resumeLazyLoading() {},
            updateTiles(changes) { updates.push(...changes); }
        };
        const palette = {
            currentLayer: 'A',
            selectedTiles: [],
            clearSelection() { this.selectedTiles = []; },
            setEnabled() {}
        };
        const editor = new MapEditor(tilemapManager, palette);
        editor.createMapStampPreviewTexture = () => null;
        editor.notifyUndoStateChange = () => {};
        editor.setupMapInteraction();

        const pointer = (button, x, y) => ({
            data: {
                button,
                originalEvent: { shiftKey: false, preventDefault() {} },
                getLocalPosition: () => ({ x: x * 48 + 4, y: y * 48 + 4 })
            },
            stopPropagation() {}
        });
        container.handlers.get('rightdown')(pointer(2, 0, 0));
        container.handlers.get('pointermove')(pointer(2, 1, 1));
        container.handlers.get('pointerup')(pointer(2, 1, 1));

        assert.equal(editor.mapStamp.width, 2);
        assert.equal(editor.mapStamp.height, 2);
        assert.equal(editor.undoStack.length, 0, 'sampling does not create history');

        container.handlers.get('pointerdown')(pointer(0, 2, 1));
        container.handlers.get('pointerup')(pointer(0, 2, 1));
        assert.equal(editor.undoStack.length, 1);
        assert.ok(updates.length > 0);
    } finally {
        global.PIXI = previousPixi;
    }
});
