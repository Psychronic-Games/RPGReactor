const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const MapEditor = require(path.join(editorRoot, 'src', 'MapEditor.js'));

function makeMap(width = 3, height = 1) {
    return { width, height, data: new Array(width * height * 6).fill(0), tilesetId: 1 };
}

function makeEditor(map, layer = 'A1') {
    const updates = [];
    const tilemapManager = {
        container: null,
        currentMap: map,
        TILE_WIDTH: 48,
        TILE_HEIGHT: 48,
        isA2DecorationKind: () => false,
        updateTiles: changes => updates.push(...changes),
        renderMap() {},
    };
    const palette = {
        currentLayer: 'A',
        selectedTiles: [{ x: 0, y: 0, layer }],
        tilesetTextures: {},
    };
    return { editor: new MapEditor(tilemapManager, palette), tilemapManager, palette, updates };
}

test('Shift painting stores the exact autotile shape without changing its neighbor', () => {
    const map = makeMap(2);
    const baseTileId = 2048;
    map.data[0] = baseTileId + 7;
    const { editor, updates } = makeEditor(map);
    editor.preserveAutotileShape = true;
    editor.calculateAutotileShape = () => {
        throw new Error('Shift painting must not calculate connected shapes');
    };

    editor.paintTile(1, 0);

    assert.equal(map.data[0], baseTileId + 7);
    assert.equal(map.data[1], baseTileId);
    assert.ok(updates.some(update => update.x === 1 && update.y === 0 && update.layer === 0));
});

test('ordinary painting still reconnects the placed autotile and its neighbor', () => {
    const map = makeMap(2);
    const baseTileId = 2048;
    map.data[0] = baseTileId + 7;
    const { editor } = makeEditor(map);
    let calculations = 0;
    editor.calculateAutotileShape = base => {
        calculations++;
        return { tileId: base + 31, shape: 31 };
    };

    editor.paintTile(1, 0);

    assert.equal(map.data[0], baseTileId + 31);
    assert.equal(map.data[1], baseTileId + 31);
    assert.ok(calculations >= 2);
});

test('Shift exact-shape painting applies to A1-A4 but not A5 or regular tiles', () => {
    const map = makeMap();
    const { editor, palette } = makeEditor(map);
    const event = { data: { button: 0, originalEvent: { shiftKey: true } } };

    for (const tool of ['pencil', 'rectangle', 'circle']) {
        editor.currentTool = tool;
        for (const layer of ['A1', 'A2', 'A3', 'A4']) {
            palette.selectedTiles = [{ x: 0, y: 0, layer }];
            assert.equal(editor.claimsShiftAutotilePaint(event), true, `${tool}:${layer}`);
        }
    }
    for (const layer of ['A5', 'B']) {
        palette.selectedTiles = [{ x: 0, y: 0, layer }];
        assert.equal(editor.claimsShiftAutotilePaint(event), false, layer);
    }
});

test('Shift rectangle placement preserves every exact shape and creates one undo step', () => {
    const map = makeMap(5, 4);
    const baseTileId = 2048;
    map.data[4] = baseTileId + 7;
    const { editor } = makeEditor(map);
    editor.currentTool = 'rectangle';
    editor.preserveAutotileShape = true;
    editor.calculateAutotileShape = () => {
        throw new Error('Shift rectangle must not calculate connected shapes');
    };

    editor.beginEditState();
    editor.paintRectangle({ x: 1, y: 1 }, { x: 2, y: 2 });
    editor.commitEditState();

    assert.deepEqual([6, 7, 11, 12].map(index => map.data[index]), new Array(4).fill(baseTileId));
    assert.equal(map.data[4], baseTileId + 7);
    assert.equal(editor.undoStack.length, 1);
    editor.undo();
    assert.equal(map.data[4], baseTileId + 7);
    assert.deepEqual([6, 7, 11, 12].map(index => map.data[index]), [0, 0, 0, 0]);
});

test('Shift circle placement preserves exact shapes inside the circular footprint', () => {
    const map = makeMap(5, 5);
    const baseTileId = 2048;
    map.data[0] = baseTileId + 9;
    const { editor } = makeEditor(map);
    editor.currentTool = 'circle';
    editor.preserveAutotileShape = true;
    editor.calculateAutotileShape = () => {
        throw new Error('Shift circle must not calculate connected shapes');
    };

    editor.paintCircle({ x: 2, y: 2 }, { x: 3, y: 2 });

    assert.deepEqual([7, 11, 12, 13, 17].map(index => map.data[index]), new Array(5).fill(baseTileId));
    assert.equal(map.data[0], baseTileId + 9);
    assert.equal(map.data[6], 0, 'cells outside the radius remain unchanged');
});

test('Shift-drag exact painting is one undo step and claims the gesture from panning', () => {
    class FakeDisplayObject {
        constructor() { this.children = []; this.parent = null; this.visible = true; }
        addChild(child) { child.parent = this; this.children.push(child); return child; }
        removeChild(child) { this.children = this.children.filter(item => item !== child); }
        removeChildren() { const children = this.children; this.children = []; return children; }
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
        const map = makeMap();
        const container = new FakeContainer();
        const updates = [];
        const tilemapManager = {
            container,
            currentMap: map,
            TILE_WIDTH: 48,
            TILE_HEIGHT: 48,
            isA2DecorationKind: () => false,
            pauseLazyLoading() {},
            resumeLazyLoading() {},
            updateTiles: changes => updates.push(...changes),
            renderMap() {},
        };
        const palette = {
            currentLayer: 'A',
            selectedTiles: [{ x: 0, y: 0, layer: 'A1' }],
            tilesetTextures: {},
        };
        const editor = new MapEditor(tilemapManager, palette);
        editor.notifyUndoStateChange = () => {};
        editor.setupMapInteraction();

        const pointer = (x, shiftKey = true) => ({
            data: {
                button: 0,
                originalEvent: { shiftKey },
                getLocalPosition: () => ({ x: x * 48 + 4, y: 4 }),
            },
            stopPropagation() {},
        });

        assert.equal(tilemapManager.shouldBypassShiftPanning(pointer(0)), true);
        container.handlers.get('pointerdown')(pointer(0));
        container.handlers.get('pointermove')(pointer(1));
        container.handlers.get('pointerup')(pointer(1));

        assert.deepEqual(map.data.slice(0, 3), [2048, 2048, 0]);
        assert.equal(editor.undoStack.length, 1);
        assert.equal(editor.preserveAutotileShape, false);
        assert.ok(updates.length >= 2);

        editor.undo();
        assert.deepEqual(map.data, new Array(18).fill(0));
        editor.destroy();
        assert.equal(tilemapManager.shouldBypassShiftPanning, null);
    } finally {
        global.PIXI = previousPixi;
    }
});

test('TilemapManager defers Shift panning only when the autotile painter claims it', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    assert.match(source, /this\.shouldBypassShiftPanning\?\.\(event\)/);
    assert.match(source, /event\.data\.button === 1 \|\| \(shiftPressed && !shiftClaimedByPainter\)/);
});
