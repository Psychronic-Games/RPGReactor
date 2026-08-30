const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor.js'), 'utf8');

/** MapEditor without its dependencies, for the pure shape/lookup helpers. */
function editorWith(map) {
    const stub = Object.create(null);
    const names = ['isWallAutotile', 'isSameKindTile', 'calculateWallAutotileShape',
        'palettePositionForTile', 'selectPickedAutotile', 'exactAutotileId'];
    for (const name of names) {
        const start = source.indexOf(`\n    ${name}(`);
        assert.ok(start > 0, `${name} exists`);
        let depth = 0, end = -1;
        for (let i = source.indexOf('{', start); i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
        }
        // eslint-disable-next-line no-new-func
        stub[name] = new Function(`return function ${source.slice(start + 5, end)}`)();
    }
    stub.tilemapManager = { currentMap: map };
    return stub;
}

const mapOf = (width, height, tiles) => ({
    width, height,
    data: (() => {
        const plane = width * height;
        const data = new Array(plane * 6).fill(0);
        tiles.forEach((id, i) => { data[i] = id; });
        return data;
    })()
});

test('a wall autotile is capped at the map edge, a floor is not', () => {
    // Checked against the authored maps in the bundled projects: of 8,455 wall
    // autotiles on a map edge, 91.3% store the capped shape and 2.4% the
    // connected one, while 82.9% of the 83,674 floor autotiles on an edge store
    // shape 0 — the fully connected interior. Treating walls like floors ate
    // the end cap, so a wall painted against the edge lost its finished edge.
    const wall = 4352;          // A3, all walls
    const floor = 2816;         // A2, ground
    const editor = editorWith(mapOf(2, 1, [wall, 0]));

    assert.equal(editor.isSameKindTile(wall, -1, 0), false, 'off-map is not wall');
    assert.equal(editor.isSameKindTile(floor, -1, 0), true, 'off-map continues ground');
});

test('the A4 roof rows count as floor and the wall rows as wall', () => {
    // A4 alternates: eight roof kinds, then eight wall kinds, and so on.
    const editor = editorWith(mapOf(1, 1, [0]));
    assert.equal(editor.isWallAutotile(4352), true, 'A3 is walls throughout');
    assert.equal(editor.isWallAutotile(5888), false, 'A4 kind 0 is a roof');
    assert.equal(editor.isWallAutotile(5888 + 8 * 48), true, 'A4 kind 8 is a wall');
    assert.equal(editor.isWallAutotile(5888 + 16 * 48), false, 'kind 16 is a roof again');
    assert.equal(editor.isWallAutotile(2816), false, 'A2 is ground');
});

test('a wall against the left edge keeps its left cap', () => {
    // The reported bug: the same wall away from the edge drew its end, and
    // against the edge it did not.
    const wall = 4352;
    const editor = editorWith(mapOf(3, 1, [wall, wall, 0]));

    const atEdge = editor.calculateWallAutotileShape(wall, 0, 0);
    // Bit 0 is "no neighbour to the left", which is the cap.
    assert.equal(atEdge.shape & 1, 1, 'the edge tile is capped on its left');

    const inside = editor.calculateWallAutotileShape(wall, 1, 0);
    assert.equal(inside.shape & 1, 0, 'and joins the wall to its left when there is one');
});

test('a picked autotile resolves to its palette cell', () => {
    // Picking one tile selects the kind, so painting re-shapes it.
    const editor = editorWith(mapOf(1, 1, [0]));
    assert.deepEqual(editor.palettePositionForTile(2048), { x: 0, y: 0, layer: 'A1' });
    assert.deepEqual(editor.palettePositionForTile(2816 + 9 * 48), { x: 1, y: 1, layer: 'A2' });
    assert.deepEqual(editor.palettePositionForTile(4352 + 3 * 48), { x: 3, y: 0, layer: 'A3' });
    assert.deepEqual(editor.palettePositionForTile(5888 + 8 * 48), { x: 0, y: 1, layer: 'A4' });
    assert.equal(editor.palettePositionForTile(300), null, 'a B-sheet tile is not an autotile');
});

test('a single-tile pick selects rather than stamps', () => {
    // Right-clicking one cell is the eyedropper, as it is in RPG Maker: it
    // points the palette at the autotile's kind. Sampling an *area* is the
    // other gesture and is covered in `map-stamp-autotiles`.
    assert.match(source, /start\.x === current\.x && start\.y === current\.y/);
    assert.match(source, /this\.selectPickedAutotile\(start\.x, start\.y\)/);
    assert.match(source, /this\.activateMapStamp\(this\.captureMapStamp\(/);
});

test('a picked piece is remembered for Shift-painting, as RPG Maker copies the corner', () => {
    // User report: right-click the bottom-right exterior wall, Shift+click the
    // cell beside it. RPG Maker stamps that corner piece; Reactor stamped the
    // kind's plain centre. Ordinary painting still re-shapes from the kind.
    const corner = 4352 + 3 * 48 + 20;   // A3 wall kind 3, one of its shaped pieces
    const editor = editorWith(mapOf(2, 1, [corner, 0]));
    const palette = { selectedTiles: [], currentLayer: 'B', rendered: 0, renderCurrentLayer() { this.rendered++; } };
    editor.tilesetPaletteViewer = palette;
    editor.clearMapStamp = () => {};
    editor.setTool = () => {};
    assert.equal(editor.selectPickedAutotile(0, 0), true);
    assert.deepEqual(palette.selectedTiles, [{ x: 3, y: 0, layer: 'A3', tileId: corner }], 'the kind for the palette, the piece for Shift');
    assert.equal(palette.currentLayer, 'A');
    assert.equal(editor.exactAutotileId(palette.selectedTiles[0], 4352 + 3 * 48), corner, 'Shift stamps the piece');
    assert.equal(editor.exactAutotileId({ x: 3, y: 0, layer: 'A3' }, 4352 + 3 * 48), 4352 + 3 * 48, 'a palette-clicked kind stamps its base shape');
    assert.equal(editor.exactAutotileId(palette.selectedTiles[0], 4352 + 4 * 48), 4352 + 4 * 48, 'a piece of another kind does not leak');
    assert.equal(editor.selectPickedAutotile(1, 0), false, 'an empty cell is no pick');
    assert.match(source, /if \(preserveAutotileShape\) \{\s*\/\/ A picked piece is stamped as it was, corner and all\.\s*data\[targetLayerIndex\] = this\.exactAutotileId\(paletteTile, baseTileId\);/, 'the pencil stamps it');
    assert.match(source, /data\[targetLayerIndex\] = preserveSelectedAutotileShapes \? this\.exactAutotileId\(tile, baseTileId\) : baseTileId;/, 'so does the rectangle');
    assert.match(source, /\? this\.exactAutotileId\(tile, baseTileId\)\s*: this\.calculateAutotileShape\(baseTileId, px, py, hoverPattern, placeLayer\)\.tileId;/, 'and the preview shows it');
});
