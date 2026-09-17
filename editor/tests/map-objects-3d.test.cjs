/**
 * Objects grouped on the map rather than derived from the tileset.
 *
 * A tileset can say what a *tile* is, and that is all it can say. An autotile
 * id is a corner arrangement shared by forty-eight shapes, so three shops built
 * from one wall kind are the same tile as each other, and no classification can
 * tell them apart. Declaring a rectangle of a sheet does not help either: an
 * autotile has no place in a drawing to declare.
 *
 * So "which cells are one building" cannot be answered anywhere but on the map,
 * and this is where the author answers it.
 *
 * The measurements below are from Moletown, map 612 of Star Shift Rebellion —
 * three shop stalls whose flags slid against the walls they were painted on.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const PLANES = 6;
/** An A3 wall autotile kind, and two picture tiles to hang on it. */
const WALL = 4352 + 11 * 48;
const FLAG = 903;
const SIGN = 911;

/** A map with tiles placed as `[x, y, layer, tileId]`. */
function mapWith(width, height, placements) {
    const plane = width * height;
    const data = new Array(plane * PLANES).fill(0);
    for (const [x, y, layer, tileId] of placements) {
        data[layer * plane + y * width + x] = tileId;
    }
    return { width, height, data };
}

const standing = tileId => tileId === WALL || tileId === FLAG || tileId === SIGN;

/** Group a map, optionally with cells painted into objects. */
function group(mapData, { paintedAt = null, isPaintedGround = null } = {}) {
    const claimed = new Set();
    const objects = Reactor3D.Geometry.uprightObjects(mapData, standing, Infinity,
        () => true, null, paintedAt, isPaintedGround, claimed);
    return { objects, claimed };
}

//-----------------------------------------------------------------------------
// Reading the map's own answer

test('a map with nothing painted answers nothing', () => {
    // The readers are consulted on every cell of every 3D map, including the
    // overwhelming majority that will never paint a single object.
    const bare = { width: 4, height: 4 };
    assert.equal(Reactor3D.objectIdAt(bare, 1, 1, 0), 0);
    assert.equal(Reactor3D.objectGroundAt(bare, 1, 1, 0), false);
    assert.equal(Reactor3D.hasPaintedObjects(bare), false);
    assert.equal(Reactor3D.objectIdAt(null, 0, 0, 0), 0, 'and no map at all is not a crash');
});

test('objects are painted per layer', () => {
    // A tree on B standing over a wall on A is not part of the building.
    const mapData = { width: 2, height: 1, reactor3d: { objects: { 0: [7, 0], 3: [0, 4] } } };
    assert.equal(Reactor3D.objectIdAt(mapData, 0, 0, 0), 7);
    assert.equal(Reactor3D.objectIdAt(mapData, 0, 0, 3), 0, 'the same cell, a different layer');
    assert.equal(Reactor3D.objectIdAt(mapData, 1, 0, 3), 4);
    assert.equal(Reactor3D.objectIdAt(mapData, 1, 0, 1), 0, 'a layer with nothing painted');
    assert.equal(Reactor3D.hasPaintedObjects(mapData), true);
});

test('a cell off the map belongs to nothing', () => {
    const mapData = { width: 2, height: 1, reactor3d: { objects: { 0: [7, 7] } } };
    assert.equal(Reactor3D.objectIdAt(mapData, -1, 0, 0), 0);
    assert.equal(Reactor3D.objectIdAt(mapData, 0, 9, 0), 0);
});

test('planes of zeroes do not count as painted', () => {
    // The file is only written once something is actually painted, and a map
    // that has been cleared again must not keep claiming to be grouped.
    const mapData = { width: 2, height: 1, reactor3d: { objects: { 0: [0, 0] } } };
    assert.equal(Reactor3D.hasPaintedObjects(mapData), false);
});

//-----------------------------------------------------------------------------
// Grouping

test('painting takes autotile walls and picture tiles together', () => {
    /*
     * The reported bug, and the reason grouping has to live on the map.
     *
     * Facade runs are autotile-only, so a picture tile can never join the wall
     * it is painted on — it became its own object with its own footing, and art
     * at two depths does not move together as the camera pans. That is a flag
     * sliding sideways against its own shopfront while you walk.
     */
    const mapData = mapWith(3, 3, [
        [0, 0, 0, WALL], [1, 0, 0, WALL], [2, 0, 0, WALL],
        [0, 1, 0, WALL], [1, 1, 0, WALL], [2, 1, 0, WALL],
        [0, 2, 0, WALL], [1, 2, 0, WALL], [2, 2, 0, WALL],
        [1, 1, 3, FLAG]
    ]);
    const { objects } = group(mapData, { paintedAt: () => 1 });
    assert.equal(objects.length, 1, 'one building');

    const cell = objects[0].cells.find(c => c.x === 1 && c.y === 1);
    assert.deepEqual(cell.tileIds, [WALL, FLAG],
        'the wall and the flag hanging on it, in one cell of one object');
    assert.equal(objects[0].maxY, 2, 'so both stand on the building\'s footing');
});

test('two buildings side by side stay two buildings', () => {
    // The whole reason a flood fill is not enough: these touch, and are made
    // of the same tile, and are not the same thing.
    const mapData = mapWith(4, 1, [
        [0, 0, 0, WALL], [1, 0, 0, WALL], [2, 0, 0, WALL], [3, 0, 0, WALL]
    ]);
    const { objects } = group(mapData, { paintedAt: x => (x < 2 ? 1 : 2) });
    assert.equal(objects.length, 2);
    assert.deepEqual(objects.map(o => [o.minX, o.maxX]).sort(), [[0, 1], [2, 3]]);
});

test('a painted group need not be a rectangle, or even touch', () => {
    // It is a statement, not a shape. An author who hacks a building together
    // from bits of others is describing one thing, however it is arranged.
    const mapData = mapWith(5, 1, [
        [0, 0, 0, WALL], [2, 0, 0, WALL], [4, 0, 0, WALL]
    ]);
    const { objects } = group(mapData, { paintedAt: x => (x === 1 || x === 3 ? 0 : 1) });
    assert.equal(objects.length, 1);
    assert.equal(objects[0].cells.length, 3);
});

test('painted cells are taken from the facade pass', () => {
    // Standing them up again as a wall run would draw the same art twice, on
    // two planes — which is worse than either treatment alone.
    const mapData = mapWith(2, 2, [
        [0, 0, 0, WALL], [1, 0, 0, WALL], [0, 1, 0, WALL], [1, 1, 0, WALL]
    ]);
    const { claimed } = group(mapData, { paintedAt: (x, y) => (y === 0 ? 1 : 0) });
    assert.deepEqual([...claimed].sort(), [0, 1], 'the painted row, by cell index');

    const runs = Reactor3D.Geometry.uprightRuns(mapData, standing, Infinity, () => true, claimed);
    assert.ok(runs.every(run => run.y !== 0 && run.faceY !== 0),
        'and no run is built over them');
});

test('an unpainted map groups exactly as it always did', () => {
    // The pass is inert until something is painted, which is the state every
    // existing project is in.
    const mapData = mapWith(3, 2, [
        [0, 0, 0, WALL], [1, 0, 0, WALL], [1, 1, 3, FLAG]
    ]);
    const before = group(mapData).objects;
    const after = group(mapData, { paintedAt: () => 0 }).objects;
    assert.deepEqual(after.map(o => o.cells.length), before.map(o => o.cells.length));
    assert.ok(before.every(o => !o.painted));
});

//-----------------------------------------------------------------------------
// Footprint

test('marking the ground rows lowers the footing', () => {
    /*
     * Standing a drawing up turns its map rows into courses, so a building
     * painted across four rows is four tiles tall and plants itself on its
     * southernmost row. Where some of those rows are the ground it stands on —
     * the pavement in front of a shop, the skirt of an archway — saying so is
     * what puts its feet where its feet are.
     */
    const mapData = mapWith(2, 4, [
        [0, 0, 0, WALL], [1, 0, 0, WALL],
        [0, 1, 0, WALL], [1, 1, 0, WALL],
        [0, 2, 0, WALL], [1, 2, 0, WALL],
        [0, 3, 0, WALL], [1, 3, 0, WALL]
    ]);
    const painted = () => 1;
    assert.equal(group(mapData, { paintedAt: painted }).objects[0].maxY, 3,
        'every row is height, so it stands on the last one');

    const { objects, claimed } = group(mapData,
        { paintedAt: painted, isPaintedGround: (x, y) => y >= 2 });
    assert.equal(objects[0].maxY, 1, 'the standing part now ends two rows sooner');
    assert.equal(objects[0].cells.length, 4);
    assert.equal(claimed.size, 8,
        'and the ground rows are still claimed, so nothing stands them up again');
});

//-----------------------------------------------------------------------------
// The store the editor paints into

const Objects3D = require(path.join(__dirname, '..', 'src', 'utils', 'MapObjects3D.js'));

const blank = (width = 4, height = 3) => ({ id: 1, width, height });

test('a cell is grouped per layer', () => {
    // A tree on B standing over a wall on A is not part of the building.
    const map = blank();
    assert.equal(Objects3D.setAt(map, 1, 1, 0, 5), true);
    assert.equal(Objects3D.at(map, 1, 1, 0), 5);
    assert.equal(Objects3D.at(map, 1, 1, 3), 0, 'the same cell on another layer');
    assert.equal(Objects3D.setAt(map, 1, 1, 0, 5), false, 'and setting it again changes nothing');
});

test('object numbers are held inside the range that can be stored', () => {
    const map = blank();
    Objects3D.setAt(map, 0, 0, 0, 9999);
    assert.equal(Objects3D.at(map, 0, 0, 0), Objects3D.MAX_ID);
    Objects3D.setAt(map, 1, 0, 0, -4);
    assert.equal(Objects3D.at(map, 1, 0, 0), Objects3D.NONE);
});

test('footing can only be marked inside an object', () => {
    // Otherwise the mark is invisible: there is no object for it to be the
    // ground of, and nothing on screen to show it was set.
    const map = blank();
    assert.equal(Objects3D.setGroundAt(map, 2, 2, 0, true), false);
    Objects3D.setAt(map, 2, 2, 0, 3);
    assert.equal(Objects3D.setGroundAt(map, 2, 2, 0, true), true);
    assert.equal(Objects3D.groundAt(map, 2, 2, 0), true);
});

test('ungrouping a cell takes its footing mark with it', () => {
    const map = blank();
    Objects3D.setAt(map, 0, 0, 0, 3);
    Objects3D.setGroundAt(map, 0, 0, 0, true);
    Objects3D.setAt(map, 0, 0, 0, 0);
    assert.equal(Objects3D.groundAt(map, 0, 0, 0), false);
});

test('an emptied map keeps no planes of zeroes', () => {
    // A 2D project must not accumulate sidecars full of nothing, and the save
    // path decides whether to write a file by asking whether anything is set.
    const map = blank();
    Objects3D.setAt(map, 1, 1, 0, 7);
    Objects3D.setAt(map, 1, 1, 0, 0);
    assert.equal(Objects3D.isEmpty(map), true);
    assert.equal(map.reactor3d.objects, undefined, 'the plane is gone, not zeroed');
});

test('the palette is told which numbers are in use, and which is free', () => {
    const map = blank();
    Objects3D.setAt(map, 0, 0, 0, 2);
    Objects3D.setAt(map, 1, 0, 3, 5);
    assert.deepEqual(Objects3D.idsInUse(map), [2, 5], 'across every layer, ascending');
    assert.equal(Objects3D.nextFreeId(map), 1);
    Objects3D.setAt(map, 2, 0, 0, 1);
    assert.equal(Objects3D.nextFreeId(map), 3);
});

test('an object can be asked for all of its cells', () => {
    const map = blank();
    Objects3D.setAt(map, 0, 0, 0, 4);
    Objects3D.setAt(map, 3, 2, 2, 4);
    Objects3D.setAt(map, 1, 1, 0, 9);
    const cells = Objects3D.cellsOf(map, 4);
    assert.equal(cells.length, 2);
    assert.deepEqual(cells.map(c => [c.x, c.y, c.layer]).sort(), [[0, 0, 0], [3, 2, 2]]);
});

test('a snapshot survives the stroke it was taken before', () => {
    // Deep, because the planes are mutated in place — a shallow copy hands
    // back the same arrays the stroke is about to write into.
    const map = blank();
    Objects3D.setAt(map, 0, 0, 0, 6);
    const before = Objects3D.snapshot(map);
    Objects3D.setAt(map, 1, 0, 0, 6);
    Objects3D.setAt(map, 2, 0, 0, 6);
    assert.equal(Objects3D.idsInUse(map).length, 1);

    assert.equal(Objects3D.restore(map, before), true);
    assert.equal(Objects3D.at(map, 0, 0, 0), 6, 'the first cell is still grouped');
    assert.equal(Objects3D.at(map, 1, 0, 0), 0, 'and the rest of the stroke is undone');
});

test('a snapshot from a different size is refused', () => {
    // Map Properties can resize a map between a stroke and its undo, and a
    // sidecar that disagrees with its own map about how big it is is worse
    // than a lost undo.
    const map = blank();
    Objects3D.setAt(map, 0, 0, 0, 1);
    const before = Objects3D.snapshot(map);
    const smaller = blank(2, 2);
    assert.equal(Objects3D.restore(smaller, before), false);
});

//-----------------------------------------------------------------------------
// Wiring

const editorRoot = path.resolve(__dirname, '..');
const readSrc = name => fs.readFileSync(path.join(editorRoot, 'src', name), 'utf8');

test('the tab sits beside Regions, and has a panel of its own', () => {
    const palette = readSrc('TilesetPaletteViewer.js');
    assert.match(palette, /createLayerTab\('O', TilesetPaletteViewer\.tabIcon\('object3d'\)\)/);
    assert.match(palette, /id="object3d-ui-container"/);
    // Each of the three panels hides the other two; a tab that only showed its
    // own would stack them.
    assert.match(palette, /else if \(layerName === 'O'\)/);
    assert.match(palette, /this\.onObject3DTabSelected\?\.\(\)/);
});

test('every tool routes the new tab', () => {
    /*
     * The tile path defaults an unknown tab to layer 0, so a tool that does
     * not know about this one paints tiles from whatever the palette selection
     * happened to be — on the Regions tab that was reported as the eraser
     * silently deleting map tiles under the overlay.
     */
    const editor = readSrc('MapEditor.js');
    const routes = editor.match(/currentLayer === 'O'/g) || [];
    assert.ok(routes.length >= 7,
        `pencil, eraser, rect, rect-erase, circle, circle-erase, fill and both previews (${routes.length})`);
    assert.match(editor, /paintObject3DArea\(minX, maxX, minY, maxY, null\)/, 'the rectangle tool');
    assert.match(editor, /eraseObject3DArea\(minX, maxX, minY, maxY, null\)/, 'and its eraser');
});

test('the eraser takes the grouping, not the tiles under it', () => {
    const editor = readSrc('MapEditor.js');
    assert.match(editor, /if \(currentLayer === 'O'\) \{\s*\n\s*this\.eraseObject3DArea\(x, x, y, y, null\);/);
});

test('grouping gets its own kind of undo entry', () => {
    /*
     * Grouping lives in the map's sidecar, not in `map.data`, so the ordinary
     * undo snapshot — a slice of that one array — cannot see it. It would
     * record a change that never happened and miss the one that did. The
     * height field has the same problem and the same answer.
     */
    const editor = readSrc('MapEditor.js');
    assert.match(editor, /kind: 'object3d', data: state\.before/);
    assert.match(editor, /this\.undoStack\[this\.undoStack\.length - 1\]\?\.kind === 'object3d'/);
    assert.match(editor, /this\.redoStack\[this\.redoStack\.length - 1\]\?\.kind === 'object3d'/);
    // And a stroke on that tab must take the right kind of snapshot.
    assert.match(editor, /currentLayer === 'O'\) \{\s*\n\s*this\.beginObject3DState\(\);/);
    assert.match(editor, /snapshot && snapshot\.kind === 'object3d'/, 'the stale-entry guard knows it');
});

test('a flat map that has been grouped still keeps its sidecar', () => {
    // The file is deleted when nothing is painted, and grouping was not one of
    // the things it counted — so every save threw the grouping away.
    const elevation = fs.readFileSync(
        path.join(editorRoot, 'src', 'utils', 'MapElevation.js'), 'utf8');
    assert.match(elevation, /const grouped = !!\(sidecar3d && sidecar3d\.objects/);
    assert.match(elevation, /if \(isFlat\(mapData\) && !grouped/);
});

test('the editor loads both new files', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(html, /src\/utils\/MapObjects3D\.js/);
    assert.match(html, /src\/Object3DManager\.js/);
});

test('grouping a building takes its walls and its signage in one gesture', () => {
    /*
     * `auto` paints every layer holding a tile, which is the whole point: a
     * flag on a B sheet can never join a wall's facade any other way, and
     * asking an author to paint the same cells once per layer to group one
     * building would be a strange way to spend an afternoon.
     */
    const manager = readSrc('Object3DManager.js');
    assert.match(manager, /if \(this\.targetLayer !== 'auto'\) return \[Number\(this\.targetLayer\)\]/);
    assert.match(manager, /if \(map\.data\[layer \* plane \+ y \* map\.width \+ x\]\) found\.push\(layer\)/);
    assert.match(manager, /return found\.length \? found : \[0\]/, 'and an empty cell still takes paint');
});

test('the tabs are drawn, not typed', () => {
    // An emoji is the host's font, not the editor's: it ignores the theme,
    // sits on its own baseline, and looks like different software on every
    // platform. Both tabs that are not a letter now draw their own mark.
    const palette = readSrc('TilesetPaletteViewer.js');
    assert.match(palette, /static tabIcon\(kind\)/);
    // Coloured, by their own palettes: at this size an outline in the text
    // colour is a smudge beside a letter of the same colour, and reads as a
    // mark on the screen rather than as a picture of anything. Each tab is
    // tied to the overlay it opens — regions from across the wheel as the
    // region palette is, the cube in the warm half the object palette lives in.
    assert.match(palette, /'#e05c4e'/, 'the region swatches are coloured');
    assert.match(palette, /fill="#f2c14e"/, 'and the cube is lit from the top left');
    // Every colour is a whole six-digit hex — a mangled one renders as black
    // and looks like a deliberate choice rather than a typo.
    const icons = palette.slice(palette.indexOf('static tabIcon'),
        palette.indexOf('createLayerTab(layerName'));
    const colours = icons.match(/#[0-9a-zA-Z]*/g) || [];
    assert.ok(colours.length >= 7, 'both icons name their colours');
    for (const colour of colours) {
        assert.match(colour, /^#[0-9a-f]{6}$/, `${colour} is a whole colour`);
    }
    assert.doesNotMatch(palette, /createLayerTab\('[RO]', '[^']*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
        'no emoji left on either tab');
});

test('only one overlay of numbered cells shows at a time', () => {
    // Two sets of coloured squares over the same map, answering different
    // questions, cannot be told apart — reported as region numbers showing
    // through while painting 3D objects.
    const main = readSrc('main.js');
    const handler = name => {
        const start = main.indexOf(`${name} = () => {`);
        assert.notEqual(start, -1, `${name} exists`);
        return main.slice(start, main.indexOf('\n            };', start));
    };
    assert.match(handler('onRegionTabSelected'),
        /getObject3DManager\(\)\?\.setVisible\(false\)/, 'opening Regions hides objects');
    assert.match(handler('onObject3DTabSelected'),
        /getRegionManager\(\)\?\.setVisible\(false\)/, 'and opening Objects hides regions');
});

test('a grouped building is not culled while it is still on screen', () => {
    /*
     * A cut-out is not where its vertices say it is. Its quad is built in the
     * vertex shader: every vertex of one object sits at the same anchor, and
     * the `offset` attribute carries the corners out from it. Three.js measures
     * the bounding sphere from the positions, so it measures the anchors and
     * nothing else.
     *
     * That was survivable while objects were small. Grouping a whole building
     * onto one anchor made it acute — measured below, a six-by-six group has
     * every anchor at a single point while its corners reach almost seven tiles
     * away, so the sphere was a point and the structure vanished the moment
     * that point left the frustum, with its art still filling the screen.
     */
    const TILE = 300;                        // a B-sheet picture tile
    const width = 8, height = 8;
    const data = new Array(width * height * PLANES).fill(0);
    for (let y = 1; y <= 6; y++) {
        for (let x = 1; x <= 6; x++) data[3 * width * height + y * width + x] = TILE;
    }
    const built = Reactor3D.Geometry.build({ width, height, data }, {
        tileSize: 48, elevationAt: () => 0, isUpright: id => id === TILE,
        isAuthored: () => true, isScenery: () => false, isFoliage: () => false,
        isPanel: () => false, isAbove: () => false, paintedAt: () => 1
    });

    const group = built.groups.find(entry => entry.offsets);
    assert.ok(group, 'the building is drawn as a cut-out');

    const axis = start => {
        const values = [];
        for (let i = start; i < group.positions.length; i += 3) values.push(group.positions[i]);
        return Math.max(...values) - Math.min(...values);
    };
    assert.equal(axis(0) + axis(1) + axis(2), 0,
        'every anchor is the same point, so the positions measure nothing');

    let reach = 0;
    for (let i = 0; i < group.offsets.length; i += 2) {
        reach = Math.max(reach, Math.hypot(group.offsets[i], group.offsets[i + 1]));
    }
    assert.ok(reach > 6, `its corners reach ${reach.toFixed(2)} tiles from that point`);

    // Which is why the sphere is grown by the furthest corner, plus the half
    // tile the shader steps everything towards the camera.
    const runtime = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(runtime, /geometry\.boundingSphere\.radius \+= reach \+ 0\.5/);
    assert.match(runtime, /if \(group\.offsets\) \{\s*\n\s*geometry\.computeBoundingSphere\(\)/);
});

test('grouping survives closing the project', () => {
    /*
     * Reported: buildings grouped, saved, reopened — and the numbers were gone.
     *
     * The sidecar was written correctly. Nothing read it back: it was attached
     * to the map only when the *3D view* opened, which was fine while it held
     * nothing but elevation and a camera, since only that view could show
     * those. Grouping is painted on the 2D canvas, so the file has to be in
     * hand whenever the map is.
     *
     * The silent half was worse than the visible one — painting again over an
     * unread sidecar and saving would have written one built from nothing,
     * taking the elevation with it.
     */
    const tilemap = readSrc('TilemapManager.js');
    assert.match(tilemap, /loadMapSidecar\(mapData\)/, 'the map loads its own sidecar');
    assert.match(tilemap, /mapData\.id = mapId;\n\s*\/\/[\s\S]*?this\.loadMapSidecar\(mapData\);/,
        'and does it as part of loading, not when some view opens');
    assert.match(tilemap, /mapData\.reactor3d = sidecar/);
    // A corrupt sidecar must not stop the map opening: the map is the work.
    assert.match(tilemap, /could not be read[\s\S]{0,80}?\n\s*\}\n\s*return false;/);
});

test('a grouped building counts as an unsaved change', () => {
    // `getPersistedMapData` drops the sidecar, because that is what goes into
    // Map###.json and it has to stay ordinary RPG Maker data. Comparing only
    // that said a map with a freshly grouped building was unchanged, so
    // closing the project never asked.
    const tilemap = readSrc('TilemapManager.js');
    assert.match(tilemap, /sidecarState\(\) \{/);
    assert.match(tilemap, /this\.savedSidecarState = this\.sidecarState\(\)/,
        'the saved state remembers it');
    assert.match(tilemap, /if \(this\.sidecarState\(\) !== this\.savedSidecarState\) return true/,
        'and the dirty check asks');
});

test('the pickers are built exactly like the A-G preview', () => {
    /*
     * Reported twice, because it was fixed twice by inventing a second way of
     * doing it: first by deriving the swatch size from `clientWidth`, which is
     * read before the panel has been laid out at its final width and so built
     * the canvas narrow, and then by driving the width from CSS. Both left the
     * two palettes behaving unlike the tileset tabs in the same slot.
     *
     * There is one right answer and the editor already had it. The tileset
     * preview gives its canvas a natural size and `width: 100%; height: auto`,
     * and puts it in a container that scrolls vertically only — so the bar sits
     * at the panel's edge, the canvas fills the panel when there is room for it
     * and shrinks to it when there is not (a narrower web sidebar used to grow a
     * sideways scrollbar for the last few pixels).
     */
    const tileset = readSrc('TilesetPaletteViewer.js');
    assert.match(tileset, /id="tileset-preview-container"[^>]*overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable[^>]*min-height: 0;/);
    assert.match(tileset, /id="tileset-preview-canvas"[^>]*width: 100%; height: auto;/);

    for (const [file, id] of [['RegionManager.js', 'region'], ['Object3DManager.js', 'object3d']]) {
        const source = readSrc(file);
        assert.match(source, new RegExp(`id="${id}-palette-scroll"[^>]*overflow-x: hidden; overflow-y: auto; scrollbar-gutter: stable[^>]*min-height: 0;`),
            `${file} scrolls the way the tileset preview does`);
        assert.match(source, new RegExp(`id="${id}-palette-canvas"[^>]*width: 100%; height: auto;`),
            `${file} fills the panel the way the tileset preview does`);
        // Its natural size only — nothing measured, nothing observed.
        assert.doesNotMatch(source, /getBoundingClientRect\(\)\.width/, `${file} measures nothing`);
        assert.doesNotMatch(source, /ResizeObserver/, `${file} watches nothing`);
        assert.doesNotMatch(source, /canvas\.style\.width/, `${file} sets no explicit width`);
        // And the same client-to-canvas conversion, since CSS may have scaled it.
        assert.match(source, /const scaleX = this\.canvas\.width \/ rect\.width/,
            `${file} converts a click the way the tileset preview does`);
    }
});

test('cut-outs are drawn north to south, the way 2D draws', () => {
    /*
     * A cut-out is drawn with `depthWrite` off — its soft edges have to blend
     * with what is behind them rather than punch a hole in the depth buffer —
     * so within one merged buffer the last thing written is the thing you see.
     * Order is the whole of the occlusion.
     *
     * And the order was whatever the grouping passes happened to produce:
     * painted groups first, then declared rectangles, then the flood fill. So a
     * banner hanging on a wall was drawn over a sign standing in front of it,
     * purely because its object was built first.
     *
     * 2D never has this problem: it draws row by row, so a thing further up the
     * map is always painted before the thing below it.
     */
    const north = 300, south = 301;
    const width = 4, height = 8;
    const data = new Array(width * height * PLANES).fill(0);
    data[3 * width * height + 1 * width + 1] = north;
    data[3 * width * height + 6 * width + 1] = south;

    const built = Reactor3D.Geometry.build({ width, height, data }, {
        tileSize: 48, elevationAt: () => 0,
        isUpright: id => id === north || id === south,
        isAuthored: () => true, isScenery: () => false, isFoliage: () => false,
        isPanel: () => false, isAbove: () => false
    });

    const group = built.groups.find(entry => entry.offsets);
    assert.ok(group, 'both are cut-outs');
    const order = [];
    for (let i = 0; i < group.positions.length; i += 12) order.push(group.positions[i + 2]);
    assert.deepEqual(order, [...order].sort((a, b) => a - b),
        'written north first, so the southern one paints over it');

    // The declaration of intent, so the sort cannot be dropped as redundant.
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(runtime, /objects\.sort\(\(a, b\) => \(a\.maxY - b\.maxY\) \|\| \(a\.minX - b\.minX\)\)/);
    assert.match(runtime, /wallRuns\.sort\(\(a, b\) => \(a\.faceY - b\.faceY\) \|\| \(a\.x - b\.x\)\)/,
        'walls sort the same way, for the same reason');
});

test('an animation is drawn where the thing playing it is', () => {
    /*
     * An animation carries no `z`, so the tilemap's sort leaves it where it was
     * added — last, and therefore in front of everything. In 2D that is the
     * convention and it is fine: the map is flat, and an effect over the top of
     * it reads as an effect.
     *
     * 3D draws the world in two passes, one below the characters and one above
     * them, and an animation floating over both is in front of the entire map
     * however far away the thing playing it is. A banner animating on a wall at
     * the back of a street drew over the sign standing in front of it.
     */
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    /*
     * A hair in front of its host, never level with it. The tilemap breaks a
     * tie in `z` on `y`, and an animation's `y` moves while a pass sprite's is
     * fixed at zero — so an animation given exactly its host's z crosses that
     * comparison mid-playback and flips between in front of the thing it is
     * playing on and behind it, frame by frame. Three animations on a table
     * whose top is flagged `*` flickered against it for this reason.
     */
    assert.match(sprites,
        /if \(authored === null && this\._reactor3d && !this\.isScreenAnimation\(animation\)\) \{[\s\S]*?sprite\.z = hostZ === null \? 3 : hostZ \+ 0\.5;/,
        'an animation played on a target takes that target\'s place in the sort');
    // Unless the event it is played on has said otherwise — see
    // animation-layer-note.test.cjs. The default is what is asserted here.
    assert.match(sprites, /if \(authored !== null\) sprite\.z = authored;/);

    // Which of the two it is was authored, not inferred: MZ's displayType is 2
    // for screen — 0 is each target, 1 the centre of them all — and MV says the
    // same thing with position 3.
    assert.match(sprites, /isScreenAnimation = function\(animation\) \{[\s\S]*?animation\.position === 3[\s\S]*?animation\.displayType === 2/);
    // Only where there is a 3D scene. `_reactor3d` is a Spriteset_Map field,
    // so battle animations keep the convention they have always had.
    assert.match(sprites, /battle animations keep the convention they have always had\./);
    // And the pass that draws things in front of characters sits above that,
    // which is what does the covering.
    assert.match(sprites, /this\._reactor3dAbove\.sprite\.z = 4;/);
});

test('a routed event that never leaves its cell rides the building', () => {
    /*
     * Pinning a walking event to a wall would carry it up the facade as it
     * crossed the cell, so having a move route ruled the facade out flatly.
     *
     * But most routes on scenery do not walk: they turn, wait, toggle a switch
     * or play a step animation, and the event stands exactly where the author
     * put it for the whole game. A cap on top of a building is one of those —
     * reported as a cap that would not track with the building it belongs to,
     * on a custom route that never leaves its cell.
     *
     * So the question is not whether the event has a route but whether it has
     * left home.
     */
    const table = {
        width: 4, height: 4,
        onFacade: Uint8Array.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        z: Float32Array.from([0, 0, 0, 0, 0, 9.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        y: Float32Array.from([0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        lift: Float32Array.from([0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    };
    const previousFacade = Reactor3D._facade;
    const previousMap = global.$dataMap;
    Reactor3D._facade = table;
    global.$dataMap = { width: 4, height: 4 };
    try {
        const event = (realX, realY, moveType, homeX, homeY) => ({
            _realX: realX, _realY: realY, eventId: () => 1, isMoving: () => false,
            page: () => ({ moveType }), event: () => ({ x: homeX, y: homeY })
        });
        // `onArt` rides along: a thing on the facade is standing on a cut-out
        // and has to be placed the way a cut-out is placed — half a cell
        // towards the camera, which is what `pointOf` does with this flag. See
        // event-stays-on-ground.test.cjs.
        const onWall = { height: 2, z: 9.5, lift: 3, onArt: true };

        assert.deepEqual(Reactor3D.standingPlaceFor(event(1, 1, 0, 1, 1)), onWall,
            'no route at all, as before');
        assert.deepEqual(Reactor3D.standingPlaceFor(event(1, 1, 3, 1, 1)), onWall,
            'a custom route it has not walked anywhere on');

        // And one that has walked off drops to the ground, so nothing is
        // carried up a wall it no longer stands against.
        const walked = Reactor3D.standingPlaceFor(event(1, 1, 3, 3, 3));
        assert.equal(walked.lift, 0);
        assert.equal(walked.z, 1.5);
    } finally {
        Reactor3D._facade = previousFacade;
        global.$dataMap = previousMap;
    }
});

test('a picker fills its panel, and its swatches are the project tile', () => {
    /*
     * Reported three times, and the last cause was the wrapper rather than the
     * canvas: the tab reveals the panel with `display: flex`, which is a *row*,
     * so its one child was sized to its content and stopped short of the edge
     * however the canvas inside it was styled. The A-G preview never had this
     * because its container is an ordinary block.
     */
    for (const [file, id] of [['RegionManager.js', 'region'], ['Object3DManager.js', 'object3d']]) {
        const source = readSrc(file);
        assert.match(source, new RegExp(`id="${id}-palette-container" style="display: flex; flex-direction: column; flex: 1; min-width: 0;`),
            `${file} stretches inside the row its tab reveals`);
        // And a swatch is the project's tile, like every tile beside it.
        assert.match(source, /this\.tileSize = this\.projectTileSize\(\);/,
            `${file} draws at the project's tile size`);
        assert.match(source, /metrics \? metrics\.tileSizeOf\(system\) : 48/,
            `${file} reads it the way the tileset preview does`);
    }
});

test('every phrase the route dialog shows is translated', () => {
    /*
     * The dialog is opened from two places now — the Set Movement Route command
     * and a page's own Custom movement — and fifteen of its strings had never
     * been added to the table, so they came out in English in every locale.
     */
    // Both tables: RR_TEXT_TRANSLATIONS is declared in I18nManager and extended
    // by the deep file, and a phrase in either is translated. Checking only the
    // deep one is how fifteen already-translated phrases were reported missing
    // and then added a second time.
    const table = fs.readFileSync(
        path.join(editorRoot, 'src', 'I18nDeepTranslations.js'), 'utf8')
        + fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');
    const dialog = readSrc(path.join('event', 'commands', 'SetMovementRouteEditor.js'));
    const asked = new Set();
    for (const match of dialog.matchAll(/_t\('([^']+)'\)/g)) asked.add(match[1]);
    for (const match of dialog.matchAll(/_btn\('([^']+)'/g)) asked.add(match[1]);
    for (const match of dialog.matchAll(/_checkbox\('([^']+)'/g)) asked.add(match[1]);
    assert.ok(asked.size > 15, 'the dialog translates a good number of strings');

    const missing = [...asked].filter(phrase =>
        !table.includes(JSON.stringify(phrase) + ':') && !table.includes(`'${phrase}':`));
    assert.deepEqual(missing, [], 'none are left in English');
});

test('pushing a version tag publishes the release from the changelog', () => {
    /*
     * A tag is not a release, and the difference is invisible from the outside:
     * the version is on GitHub, the code is on GitHub, and Releases still shows
     * the one before it. That gap was closed by hand, with a personal token, by
     * somebody remembering — so it stayed open whenever nobody did, which is
     * exactly what happened to 0.97.0.
     */
    const workflow = fs.readFileSync(
        path.join(repoRoot, '.github', 'workflows', 'publish-release.yml'), 'utf8');
    assert.match(workflow, /tags:\n\s+- 'v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'/,
        'it runs on a version tag');
    // And by hand, for a tag that predates the workflow or a run worth
    // repeating — deleting and re-pushing a tag would also do it, and is a
    // worse thing to reach for.
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /TAG: v\$\{\{ steps\.version\.outputs\.value \}\}/,
        'both routes name the tag the same way');
    assert.match(workflow, /permissions:\n\s+contents: write/,
        'and may write a release');
    assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/,
        'with the token GitHub hands the run, not one anybody holds');

    // The notes are the changelog section, so the two cannot drift apart.
    assert.match(workflow, /--print-notes > release-notes\.md/);
    assert.match(workflow, /test -s release-notes\.md/, 'and empty notes fail the run');

    // A rerun must not fail on a release that already exists: correcting the
    // changelog and re-pushing the tag corrects the release.
    assert.match(workflow, /gh release view "\$TAG"[\s\S]*?gh release edit "\$TAG"/);
    assert.match(workflow, /gh release create "\$TAG"[\s\S]*?--verify-tag/);

    // And the flag it depends on exists and prints only the notes.
    const script = fs.readFileSync(
        path.join(repoRoot, 'editor', 'build-scripts', 'cut-release.cjs'), 'utf8');
    assert.match(script, /if \(options\.printNotes\) \{\s*\n\s*process\.stdout\.write\(changelogSection\(version\)\);/);
});

test('an animation is sorted into place on the frame it appears', () => {
    /*
     * The tilemap sorts its children inside its own update, and MZ creates
     * animation sprites *after* the spriteset has updated its children — so a
     * sprite added this frame is still wherever `addChild` left it, which is
     * last, and last means in front of everything. It takes its proper place on
     * the following frame.
     *
     * One frame is enough to see. An animation that loops restarts every few
     * frames, so three of them on a table flickered continuously between in
     * front of it and behind it, and no amount of getting the `z` right could
     * settle it: on the frame it appeared the sprite was not being sorted by
     * `z` at all. Measured on Freelancers' map 342 — one frame in eight had an
     * animation drawn over the star-flagged pass before this, and none in forty
     * after it.
     */
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const block = sprites.slice(sprites.indexOf('const authored = this.authoredAnimationZ(targets);'));
    const body = block.slice(0, block.indexOf('this._animationSprites.push(sprite)'));
    assert.match(body, /sprite\.z = hostZ === null \? 3 : hostZ \+ 0\.5;/);
    // Sorted whichever way the layer was decided — the authored one included.
    assert.match(body, /holder\._sortChildren\(\)/, 'and sorted before the frame is drawn');
    // Guarded, because the holder is the battle field in a battle and a plain
    // container has no sorting of its own.
    assert.match(body, /typeof holder\._sortChildren === "function"/);
});

test('the 3D camera looks at the middle of the view, not half a tile past it', () => {
    /*
     * `aimCamera` adds half a tile to whatever it is given, to turn the corner
     * of a character's cell into the middle of it. The display centre is not a
     * cell corner — it is already the exact point at the centre of the view —
     * so handing it over as-is bought a second half tile and everything sat
     * slightly left of where it belonged, by a margin just small enough to
     * doubt.
     */
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const focus = sprites.slice(sprites.indexOf('Spriteset_Map.prototype.reactor3DCameraFocus'));
    const body = focus.slice(0, focus.indexOf('\n};'));
    assert.match(body, /x: \$gameMap\.displayX\(\) \+ wide \/ 2 - 0\.5/);
    assert.match(body, /y: \$gameMap\.displayY\(\) \+ tall \/ 2 - 0\.5/);
    // And it is still the display, not the player: that is what lets Scroll Map
    // and every camera plugin move the 3D view at all. The player is named once
    // more here, as the answer when there is no map to ask.
    assert.match(body, /\$gameMap\.displayX\(\)/);
    // The player is named only in the branch that runs when there is no map to
    // ask — never in the answer itself.
    const fallback = body.slice(0, body.indexOf('const wide'));
    assert.ok(fallback.includes('$gamePlayer'), 'the no-map fallback still has one');
    assert.ok(!body.slice(body.indexOf('const wide')).includes('$gamePlayer'),
        'and the real answer reads the display, not the player');
});
