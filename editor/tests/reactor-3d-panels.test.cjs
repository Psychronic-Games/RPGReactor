/**
 * Panels: things with a front.
 *
 * A gate, a door or a signpost is drawn as a front elevation and belongs to a
 * direction. Turned into a camera-facing cut-out it swings to follow the
 * viewer, so a gate you were walking through turns to face you. A fixed plane
 * was tried before and abandoned because it vanishes edge-on — it vanishes
 * because it has no thickness.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const Geometry = Reactor3D.Geometry;

const PLANES = 6;
const A2 = 2816;
const GATE = 40;          // an ordinary B-sheet prop

function mapWith(width, height, layers) {
    const plane = width * height;
    const data = new Array(plane * PLANES).fill(0);
    for (const [z, cells] of Object.entries(layers)) {
        cells.forEach((tileId, index) => { data[Number(z) * plane + index] = tileId; });
    }
    return { width, height, data };
}

function quads(result) {
    const all = [];
    for (const group of result.groups) {
        for (let q = 0; q < group.positions.length / 3; q += 4) {
            all.push([0, 1, 2, 3].map(i => {
                const b = (q + i) * 3;
                return {
                    x: group.positions[b], y: group.positions[b + 1], z: group.positions[b + 2],
                    billboard: group.billboard
                };
            }));
        }
    }
    return all;
}

const spread = (corners, axis) => {
    const values = corners.map(c => c[axis]);
    return Math.max(...values) - Math.min(...values);
};

//-----------------------------------------------------------------------------
// Facing

test('a gap in a wall faces out of the wall, not at the camera', () => {
    // A gate set into an east-west run has solid ground either side, so it
    // faces south; in a north-south run it faces east. Nothing is authored.
    const eastWest = Geometry.panelFacing((dx, dy) => dy === 0 && Math.abs(dx) === 1);
    assert.equal(eastWest, 'south');

    const northSouth = Geometry.panelFacing((dx, dy) => dx === 0 && Math.abs(dy) === 1);
    assert.equal(northSouth, 'east');
});

test('a panel with something solid on one side turns its back to it', () => {
    assert.equal(Geometry.panelFacing((dx, dy) => dx === 1 && dy === 0), 'west');
    assert.equal(Geometry.panelFacing((dx, dy) => dx === -1 && dy === 0), 'east');
    assert.equal(Geometry.panelFacing((dx, dy) => dx === 0 && dy === -1), 'south');
    assert.equal(Geometry.panelFacing((dx, dy) => dx === 0 && dy === 1), 'north');
});

test('a panel in the open faces the way its art is drawn', () => {
    // RPG Maker prop art is a front elevation seen from the south, so with
    // nothing to go on that is the honest default.
    assert.equal(Geometry.panelFacing(() => false), 'south');
    assert.equal(Geometry.panelFacing(() => true), 'south', 'boxed in, still south');
});

//-----------------------------------------------------------------------------
// Geometry

test('a panel is a thin box, not a plane and not a billboard', () => {
    const cells = new Array(9).fill(A2);
    cells[4] = GATE;
    const result = Geometry.build(mapWith(3, 3, { 0: cells }), {
        isUpright: tileId => tileId === GATE,
        isPanel: tileId => tileId === GATE,
        isAuthored: () => true
    });

    const panel = quads(result).filter(corners => spread(corners, 'y') > 0);
    // Front, back and two edges.
    assert.equal(panel.length, 4);
    assert.ok(panel.every(corners => !corners[0].billboard),
        'nothing here turns to face the camera');

    // It has depth: the front and back sit either side of the cell centre.
    const zs = panel.flatMap(corners => corners.map(c => c.z));
    const depth = Math.max(...zs) - Math.min(...zs);
    // Positions come back as float32, so compare at that precision.
    assert.ok(Math.abs(depth - Geometry.PANEL_THICKNESS) < 1e-5,
        `a tenth of a tile deep, got ${depth}`);

    // And it stands in the middle of its cell rather than on the cell edge.
    assert.ok(Math.abs((Math.max(...zs) + Math.min(...zs)) / 2 - 1.5) < 1e-5);
});

test('the edges are cut from the art, so a painted gate has painted sides', () => {
    const cells = new Array(9).fill(A2);
    cells[4] = GATE;
    const result = Geometry.build(mapWith(3, 3, { 0: cells }), {
        isUpright: tileId => tileId === GATE,
        isPanel: tileId => tileId === GATE,
        isAuthored: () => true
    });

    // The two edge quads are the narrow ones; their UVs span a few pixels of
    // the tile rather than the whole of it.
    const group = result.groups.find(g => !g.billboard && g.uvs.length);
    const widths = [];
    for (let q = 0; q < group.uvs.length / 2; q += 4) {
        const us = [0, 1, 2, 3].map(i => group.uvs[(q + i) * 2]);
        widths.push(Math.max(...us) - Math.min(...us));
    }
    widths.sort((a, b) => a - b);
    assert.equal(widths.length, 4);
    assert.ok(widths[0] > 0, 'an edge samples something');
    assert.ok(widths[0] < widths[3] / 4, 'and it is a narrow strip of the tile');
});

test('a panel stacks upward the way a prop is drawn', () => {
    // Two cells one above the other in the map are the lower and upper halves
    // of one picture, so the northern cell stands on top of the southern one.
    const cells = new Array(25).fill(A2);
    cells[7] = GATE;    // (2,1) — the top of the gate
    cells[12] = GATE;   // (2,2) — its base
    const result = Geometry.build(mapWith(5, 5, { 0: cells }), {
        isUpright: tileId => tileId === GATE,
        isPanel: tileId => tileId === GATE,
        isAuthored: () => true
    });

    const panel = quads(result).filter(corners => spread(corners, 'y') > 0);
    assert.equal(panel.length, 8, 'two courses of four faces');

    const ys = panel.flatMap(corners => corners.map(c => c.y));
    assert.equal(Math.min(...ys), 0, 'standing on the ground');
    assert.equal(Math.max(...ys), 2, 'two tiles tall');

    // Both courses stand on the base cell, not one per cell: the run is one
    // object, drawn where its foot is.
    const zs = panel.flatMap(corners => corners.map(c => c.z));
    assert.ok(Math.abs((Math.max(...zs) + Math.min(...zs)) / 2 - 2.5) < 1e-5,
        'centred on the southern cell of the run');
});

test('a panel is never also a cut-out', () => {
    // It is classified upright as well, since it is not ground; being in both
    // paths at once would draw it twice.
    const cells = new Array(9).fill(A2);
    cells[4] = GATE;
    const result = Geometry.build(mapWith(3, 3, { 0: cells }), {
        isUpright: tileId => tileId === GATE,
        isPanel: tileId => tileId === GATE,
        isAuthored: () => true
    });
    assert.equal(result.groups.some(group => group.billboard), false);
});

test('classifying nothing as a panel changes nothing', () => {
    const cells = new Array(9).fill(A2);
    cells[4] = GATE;
    const mapData = mapWith(3, 3, { 0: cells });
    const base = { isUpright: tileId => tileId === GATE, isAuthored: () => true };

    const before = Geometry.build(mapData, base);
    const after = Geometry.build(mapData, Object.assign({}, base, { isPanel: () => false }));
    assert.equal(after.quads, before.quads);
    assert.equal(
        after.groups.some(group => group.billboard),
        before.groups.some(group => group.billboard),
        'an unclassified prop is still a cut-out');
});

test('the class is carried by the classification file', () => {
    const classes = require(path.join(repoRoot, 'editor', 'src', 'utils', 'Tileset3DClass.js'));
    assert.equal(classes.PANEL, Reactor3D.CLASS_PANEL,
        'the editor and the runtime agree on the value');

    let store = classes.create();
    store = classes.setClass(store, 1, GATE, classes.PANEL);
    assert.equal(classes.classOf(store, 1, GATE), classes.PANEL);
    assert.equal(classes.classOf(classes.normalize(JSON.parse(JSON.stringify(store))), 1, GATE),
        classes.PANEL, 'and it survives a round trip');

    // The cycle reaches it, or it could never be set by clicking.
    let seen = classes.AUTO, found = false;
    for (let i = 0; i < 8; i++) {
        seen = classes.cycle(seen);
        if (seen === classes.PANEL) found = true;
    }
    assert.ok(found, 'clicking a tile eventually offers Panel');
});

test('Clear takes back the selection it was showing', () => {
    // The selection is set from the object *before* the tool runs, so clearing
    // left a box the exact size of the object that had just been deleted —
    // indistinguishable from it still being there, which is why the tool
    // looked like it did nothing at all.
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const at = source.indexOf("        if (tool === 'clear') {");
    const body = source.slice(at, source.indexOf('\n        }', at));
    assert.match(body, /this\._selected3dObject = null;/);
    assert.match(body, /this\.selected3dRect = \{ x: x0, y: y0/,
        'the selection shrinks to what was dragged');
    assert.match(body, /`\$\{tt\('Cleared'\)\} \$\{cleared\} \$\{clearedTiles\}`/, 'and it says so');
    assert.match(body, /this\.saveTileset3DFile\(\);/, 'and the change is written');
});

test('a prop split across the sheet seam can be declared as one object', () => {
    // A B-G sheet is sixteen columns shown as two eight-column halves stacked,
    // so a tower or smoke stack crossing column eight appears as two pieces on
    // different rows of the palette and cannot be dragged out in one go. It is
    // still one rectangle on the sheet, so both pieces are merged there.
    const classes = require(path.join(repoRoot, 'editor', 'src', 'utils', 'Tileset3DClass.js'));

    // Columns 6-7 and 8-9 of sheet B, same rows: contiguous on the sheet,
    // opposite ends of the palette.
    const left = classes.tileAtCell(5, 6, 0);
    const right = classes.tileAtCell(5, 8, 0);
    assert.ok(left > 0 && right > 0);
    assert.equal(classes.sheetCell(left).col, 6);
    assert.equal(classes.sheetCell(right).col, 8, 'the far side of the seam');

    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(source, /mergeTile3DObject\(existingTile, addedTile, addedW, addedH\)/);
    assert.match(source, /if \(origin\.setNumber !== added\.setNumber\) \{\n\s*return \{ error: tt\('That is on a different sheet/,
        'two different sheets can never be one object, and it says so');
    assert.match(source, /extend: !!\(event\.shiftKey \|\| event\.ctrlKey \|\| event\.metaKey\)/,
        'shift, ctrl, and cmd all extend — which key a hand reaches for varies');
    assert.match(source, /Shift-drag another part to add it to this one\./,
        'and the author is told the shortcut exists');
});

test('star-flagged tiles are drawn over the characters, as in 2D', () => {
    // In 2D the tilemap's upper layer is what lets a character walk behind a
    // tree or through a doorway. In 3D the ground is one picture behind every
    // sprite, so nothing could ever be in front of anyone and a character
    // walked over the front of everything.
    const A2 = 2816;
    const TREE = 60;
    const cells = new Array(9).fill(A2);
    cells[4] = TREE;
    const mapData = mapWith(3, 3, { 0: cells });

    const built = Geometry.build(mapData, {
        isUpright: id => id === TREE,
        isAuthored: () => true,
        isAbove: id => id === TREE
    });
    const above = built.groups.filter(g => g.above);
    assert.equal(above.length, 1, 'the tree is in the upper pass');
    assert.ok(built.groups.some(g => !g.above), 'and the ground is not');

    // Without the flag everything is one pass, which is what every existing
    // project gets.
    const flat = Geometry.build(mapData, {
        isUpright: id => id === TREE,
        isAuthored: () => true
    });
    assert.equal(flat.groups.every(g => !g.above), true);
    assert.equal(flat.quads, built.quads, 'the same geometry either way');
});

test('the flag is read the way the 2D tilemap reads it', () => {
    const flags = [];
    flags[7] = 0x10;            // star
    flags[8] = 0x0f;            // impassable, not star
    const above = Reactor3D.abovePredicate(flags);
    assert.equal(above(7), true);
    assert.equal(above(8), false);
    assert.equal(above(9), false, 'an unflagged tile is not above');
    assert.equal(Reactor3D.abovePredicate(null), null, 'no flags, no second pass');
});

test('an object can be anchored at the very corner of a sheet', () => {
    // The top-left cell of the B sheet is tile 0, which is also the engine's
    // "no tile". Refusing it as an *origin* meant a large prop drawn into the
    // corner of a sheet could not be declared at all — and the attempt did
    // nothing without saying why.
    const classes = require(path.join(repoRoot, 'editor', 'src', 'utils', 'Tileset3DClass.js'));

    assert.equal(classes.isObjectOrigin(0), true, 'a corner is a place');
    assert.equal(classes.isPictureTile(0), false, 'but an empty map cell is not a tile');
    assert.equal(classes.isObjectOrigin(-1), false);
    assert.equal(classes.isObjectOrigin(2048), false, 'autotiles are not sheet positions');

    let store = classes.defineObject(classes.create(), 1, 0, 3, 3);
    assert.equal(classes.objectList(store, 1).length, 1, 'it is declared');
    assert.ok(classes.objectAt(store, 1, 1), 'and found from its other cells');
    assert.ok(classes.objectAt(store, 1, 8));
    assert.equal(classes.objectAt(store, 1, 0), null,
        'never from tile 0 itself, or every blank map cell would belong to it');

    // And it survives being written and read back.
    const reread = classes.normalize(JSON.parse(JSON.stringify(store)));
    assert.ok(classes.objectAt(reread, 1, 9));
});

test('overlap is judged as rectangles, not as the ids they cover', () => {
    // Comparing covered tile ids could not tell a real tile 0 from the 0 that
    // means "off the edge of the sheet", so declaring near a corner could
    // silently delete an unrelated object.
    const classes = require(path.join(repoRoot, 'editor', 'src', 'utils', 'Tileset3DClass.js'));
    let store = classes.create();
    store = classes.defineObject(store, 1, 0, 2, 2);          // the corner
    store = classes.defineObject(store, 1, classes.tileAtCell(5, 4, 4), 2, 2);
    assert.equal(classes.objectList(store, 1).length, 2, 'two objects, no overlap');

    // Redeclaring over the corner replaces only the corner one.
    store = classes.defineObject(store, 1, 0, 3, 3);
    assert.equal(classes.objectList(store, 1).length, 2);
    assert.equal(classes.objectList(store, 1).find(o => o.tile === 0).w, 3);
});

test('everything standing shares one idea of where the ground is', () => {
    // Props, characters and the sprites drawn against them all stand in the
    // *middle* of their cell, which is where the cell is. RPG Maker draws a
    // sprite's feet on the cell's bottom edge — `screenY` is
    // `scrolledY * tileHeight + tileHeight` — and taking that as a world
    // position put everything half a tile south of the square it occupies:
    // invisible head-on, and it swings into view as the camera comes round,
    // until a column standing in the middle of a pool sits on the pool's lip.
    // What matters is that they all agree, or a character walking up to a
    // column would not meet it.
    const fs = require('node:fs');
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    // The footing of the whole connected region, not this object's own
    // southern row: pieces of one mural whose bottoms are ragged used to stand
    // at different depths, and nothing could line up with anything.
    assert.match(three, /Number\.isFinite\(object\.compositePlaneZ\)/,
        'overlapping declared pictures can share the source composition plane');
    assert.match(three,
        /Number\.isFinite\(object\.planeZ\) \? object\.planeZ : footing \+ 0\.5;/,
        'props otherwise use the common footing or their declared flat-row hinge');
    assert.match(three, /z: character\._realY \+ 0\.5/, 'characters');
    const objectsSource = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(objectsSource, /ground, this\._realY \+ 0\.5\)/,
        'and the position every plugin is told');
    assert.match(three, /const level = footing - cell\.y;/, 'and rows are heights above it');

    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Reactor3D\.pointOf\(camera, gx \+ 0\.5, stand\)/, 'sprites');
    assert.match(sprites, /standScaleAt\(camera, at\.x, at\.y, at\.z, wide, tall\)/,
        'and the scale is measured where the sprite actually stands');

    const objects = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
    assert.match(objects, /this\._realX \+ 0\.5, ground, this\._realY \+ 0\.5\)/,
        'and what plugins are told matches what is drawn');
});

test('a tile belonging to no object still answers for itself', () => {
    // The lookup only redirects where an object claims the tile; everything
    // else keeps the flag it carries.
    const STARRED = 100, PLAIN = 101;
    const map = mapWith(2, 2, { 0: [STARRED, PLAIN, 0, 0] });
    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => id === STARRED || id === PLAIN,
        isAuthored: () => true,
        isAbove: id => id === STARRED,
        declaredAt: () => null
    });
    const passes = built.groups.filter(g => g.positions.length).map(g => !!g.above);
    assert.ok(passes.includes(true), 'the starred one draws above');
    assert.ok(passes.includes(false), 'and the plain one below');
});

test('a mixed-pass declared picture draws every tile exactly once', () => {
    const PLAIN = 28, STARRED = 29;
    const object = { tile: PLAIN, w: 2, h: 1, roles: 'SS' };
    const map = mapWith(2, 1, { 2: [PLAIN, STARRED] });
    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: () => true,
        isAuthored: () => true,
        isAbove: id => id === STARRED,
        declaredAt: id => id === PLAIN
            ? { object, dc: 0, dr: 0, role: 'S' }
            : { object, dc: 1, dr: 0, role: 'S' }
    });
    const billboards = built.groups.filter(group => group.billboard);
    assert.equal(billboards.some(group => group.above), true,
        'the starred piece still draws over characters');
    assert.equal(billboards.some(group => !group.above), true,
        'the ordinary piece remains below characters');
    assert.equal(billboards.reduce((total, group) => total + group.positions.length / 12, 0), 2);
});

test('a cell holding two standing tiles draws both', () => {
    // Reported as a column vanishing when a plate of food was set on it. A cell
    // has four tile planes and more than one can be standing art — in 2D they
    // are simply drawn one over the other. The 3D builder asked for *the*
    // upright tile of a cell, got the topmost, and threw the rest away: the
    // plate was drawn and the column it sat on was not.
    const COLUMN = 24, PLATE = 294;
    const map = mapWith(3, 3, {
        2: [0, 0, 0, 0, COLUMN, 0, 0, 0, 0],
        3: [0, 0, 0, 0, PLATE, 0, 0, 0, 0]
    });
    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => id === COLUMN || id === PLATE,
        isAuthored: () => true,
        isAbove: () => false
    });

    const drawn = new Set();
    for (const group of built.groups) {
        if (!group.billboard) continue;
        for (let i = 0; i < group.uvs.length; i += 2) drawn.add(group.setNumber);
    }
    assert.equal(drawn.size, 2, 'both sheets are drawn, so both tiles are');

    const quads = built.groups
        .filter(group => group.billboard)
        .reduce((total, group) => total + group.positions.length / 12, 0);
    assert.equal(quads, 2, 'one cut-out each, standing on the same cell');
});

test('the lowest layer is listed first, so they layer as 2D does', () => {
    // Drawing order follows the tile planes, lowest first, which is how the 2D
    // tilemap stacks them.
    const map = mapWith(1, 1, { 1: [10], 3: [20] });
    const tiles = Geometry.uprightTilesAt(map, 0, 0, id => id === 10 || id === 20);
    assert.deepEqual(tiles, [10, 20]);
    assert.equal(Geometry.uprightTileAt(map, 0, 0, id => id === 10 || id === 20), 20,
        'while the single-tile question still answers with the topmost');
    assert.deepEqual(Geometry.uprightTilesAt(map, 5, 5, () => true), [],
        'and a cell off the map holds nothing');

    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => id === 10 || id === 20,
        isAuthored: () => true
    });
    assert.deepEqual(built.groups.filter(group => group.billboard).map(group => group.layer), [1, 3],
        'the 3D meshes retain those original map planes');
});


test('a cell can belong to more than one declared object', () => {
    // A plate set down on a column shares both of the column's cells. Asking
    // the cell's topmost tile which object it belongs to read the plate as the
    // whole story, so the column's capital and shaft joined the plate's 1x1
    // instances instead of each other — two objects, two anchors, and a cut-out
    // turns about its own anchor, so the column came apart and its halves swung
    // independently as the camera moved.
    //
    // Each tile answers for itself. Making the plates ride the column instead
    // was tried and is the wrong reading: a tile sharing a standing object's
    // footprint is usually something on the *floor* beside it, and hoisting it
    // up a course moved it somewhere the author never put it.
    const CAP = 24, SHAFT = 32, PLATE = 294;
    const column = { tile: CAP, w: 1, h: 2, roles: 'SS' };
    const plate = { tile: PLATE, w: 1, h: 1, roles: 'S' };
    const declaredAt = id => {
        if (id === CAP) return { object: column, dc: 0, dr: 0, role: 'S' };
        if (id === SHAFT) return { object: column, dc: 0, dr: 1, role: 'S' };
        if (id === PLATE) return { object: plate, dc: 0, dr: 0, role: 'S' };
        return null;
    };
    const map = mapWith(3, 4, {
        2: [0, 0, 0, 0, CAP, 0, 0, SHAFT, 0, 0, 0, 0],
        3: [0, 0, 0, 0, PLATE, 0, 0, PLATE, 0, 0, 0, 0]
    });
    const objects = Geometry.uprightObjects(
        map, id => id === CAP || id === SHAFT || id === PLATE,
        Infinity, () => true, declaredAt);

    const columns = objects.filter(object =>
        object.cells.some(cell => cell.tileId === CAP));
    assert.equal(columns.length, 1, 'the column is one object');
    assert.equal(columns[0].cells.length, 2, 'holding both of its cells');

    const plates = objects.filter(object =>
        object.cells.every(cell => cell.tileId === PLATE));
    assert.equal(plates.length, 2, 'and each plate stays on the floor as its own');
});

test('declared objects keep one authored footprint across layers and missing pieces', () => {
    const NW = 28, NE = 29, SW = 36, SE = 37;
    const mountain = { tile: NW, w: 2, h: 2, roles: 'SSSS' };
    const declaredAt = id => {
        if (id === NW) return { object: mountain, dc: 0, dr: 0, role: 'S' };
        if (id === NE) return { object: mountain, dc: 1, dr: 0, role: 'S' };
        if (id === SW) return { object: mountain, dc: 0, dr: 1, role: 'S' };
        if (id === SE) return { object: mountain, dc: 1, dr: 1, role: 'S' };
        return null;
    };
    const complete = mapWith(4, 4, {
        2: [0, 0, 0, 0, 0, NW, NE, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        3: [0, 0, 0, 0, 0, 0, 0, 0, 0, SW, SE, 0, 0, 0, 0, 0]
    });
    const grouped = Geometry.uprightObjects(
        complete, id => [NW, NE, SW, SE].includes(id), Infinity, () => true, declaredAt);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].cells.length, 4, 'pieces on layers 3 and 4 stay one object');

    const partial = mapWith(4, 4, {
        2: [0, 0, 0, 0, 0, NW, NE, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
    const [fragment] = Geometry.uprightObjects(
        partial, id => id === NW || id === NE, Infinity, () => true, declaredAt);
    assert.deepEqual([fragment.minX, fragment.maxX, fragment.minY, fragment.maxY], [1, 2, 1, 2],
        'a partial stamp keeps the complete declaration as its pivot and footing');
});

test('a declared flat footing shares an edge with the standing art above it', () => {
    const TOP_LEFT = 28, TOP_RIGHT = 29;
    const structure = { tile: TOP_LEFT, w: 2, h: 2, roles: 'SSFF' };
    const declaredAt = id => {
        if (id === TOP_LEFT) return { object: structure, dc: 0, dr: 0, role: 'S' };
        if (id === TOP_RIGHT) return { object: structure, dc: 1, dr: 0, role: 'S' };
        return null;
    };
    const map = mapWith(4, 4, {
        2: [0, 0, 0, 0, 0, TOP_LEFT, TOP_RIGHT, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
    const [object] = Geometry.uprightObjects(
        map, id => id === TOP_LEFT || id === TOP_RIGHT,
        Infinity, () => true, declaredAt);
    assert.equal(object.maxY, 1, 'the standing row still defines the picture height');
    assert.equal(object.planeZ, 2, 'its plane meets the north edge of the flat row');

    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => id === TOP_LEFT || id === TOP_RIGHT,
        isAuthored: () => true,
        declaredAt
    });
    const anchors = built.groups.find(group => group.billboard).positions;
    assert.equal(new Set([anchors[2], anchors[14]]).size, 1);
    assert.equal(anchors[2], 2, 'both standing pieces use the shared hinge depth');
});

test('an overlapping lower-layer picture shares the upper picture plane', () => {
    const UNDER = [28, 29, 36, 37];
    const OVER = [200, 201];
    const inset = { tile: UNDER[0], w: 2, h: 2, roles: 'SSSS' };
    const structure = { tile: OVER[0], w: 2, h: 2, roles: 'SSFF' };
    const declaredAt = id => {
        const under = UNDER.indexOf(id);
        if (under >= 0) {
            return { object: inset, dc: under % 2, dr: Math.floor(under / 2), role: 'S' };
        }
        const over = OVER.indexOf(id);
        if (over >= 0) return { object: structure, dc: over, dr: 0, role: 'S' };
        return null;
    };
    const map = mapWith(4, 4, {
        2: [0, 0, 0, 0, 0, 28, 29, 0, 0, 36, 37, 0, 0, 0, 0, 0],
        3: [0, 0, 0, 0, 0, 200, 201, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => UNDER.includes(id) || OVER.includes(id),
        isAuthored: () => true,
        declaredAt
    });
    const under = built.groups.find(group => group.billboard && group.layer === 2);
    const over = built.groups.find(group => group.billboard && group.layer === 3);

    assert.equal(under.positions[2], 2,
        'the layer-2 inset does not stand half a tile in front of its layer-3 frame');
    assert.equal(over.positions[2], 2, 'both pictures use the upper composition hinge');
    const underYs = Array.from(under.offsets).filter((_, index) => index % 2 === 1);
    assert.deepEqual([Math.min(...underYs), Math.max(...underYs)], [0, 1],
        'the inset standing row uses the covering picture course instead of sitting one row high');
    const flatUnder = built.groups.filter(group => !group.billboard && group.layer === 2)
        .reduce((total, group) => total + group.positions.length / 12, 0);
    assert.equal(flatUnder, 2,
        'the inset row aligned with the covering footing lies flat instead of being clipped vertically');
});

test('a matched lower picture completes a cell hidden by its covering frame', () => {
    const LOWER = [28, 29, 36, 37];
    const UPPER = [200, 201];
    const inset = { tile: 28, w: 2, h: 2, roles: 'SSSS' };
    const frame = { tile: 200, w: 2, h: 2, roles: 'SSFF' };
    const declaredAt = id => {
        const lower = LOWER.indexOf(id);
        if (lower >= 0) {
            return { object: inset, dc: lower % 2, dr: Math.floor(lower / 2), role: 'S' };
        }
        const upper = UPPER.indexOf(id);
        if (upper >= 0) return { object: frame, dc: upper, dr: 0, role: 'S' };
        return null;
    };
    const map = mapWith(4, 4, {
        2: [0, 0, 0, 0, 0, 28, 29, 0, 0, 0, 37, 0, 0, 0, 0, 0],
        3: [0, 0, 0, 0, 0, 200, 201, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    });
    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => LOWER.includes(id) || UPPER.includes(id),
        isAuthored: () => true,
        declaredAt
    });
    const synthetic = built.groups.find(group => !group.billboard
        && Math.abs(group.layer - 2.01) < 1e-6);
    assert.ok(synthetic,
        'the absent south-west inset cell clears its same-layer occupant but stays below layer 3');
    assert.equal(synthetic.positions.length / 12, 1);
});

test('a column and what rests on it are built at their own anchors', () => {
    // The visible consequence: an object gets one anchor for all its cells, so
    // its pieces turn together. Two objects sharing a cell keep their own.
    const CAP = 24, SHAFT = 32, PLATE = 294;
    const column = { tile: CAP, w: 1, h: 2, roles: 'SS' };
    const plate = { tile: PLATE, w: 1, h: 1, roles: 'S' };
    const map = mapWith(3, 4, {
        2: [0, 0, 0, 0, CAP, 0, 0, SHAFT, 0, 0, 0, 0],
        3: [0, 0, 0, 0, PLATE, 0, 0, PLATE, 0, 0, 0, 0]
    });
    const built = Geometry.build(map, {
        elevationAt: () => 0,
        isUpright: id => id === CAP || id === SHAFT || id === PLATE,
        isAuthored: () => true,
        isAbove: id => id === CAP,
        declaredAt: id => {
            if (id === CAP) return { object: column, dc: 0, dr: 0, role: 'S' };
            if (id === SHAFT) return { object: column, dc: 0, dr: 1, role: 'S' };
            if (id === PLATE) return { object: plate, dc: 0, dr: 0, role: 'S' };
            return null;
        }
    });

    const anchors = [];
    for (const group of built.groups) {
        if (!group.billboard) continue;
        const positions = group.positions;
        for (let quad = 0; quad < positions.length / 3; quad += 4) {
            const ys = [0, 1, 2, 3].map(i => group.offsets[(quad + i) * 2 + 1]);
            anchors.push({
                z: positions[quad * 3 + 2],
                low: Math.min(...ys),
                above: !!group.above
            });
        }
    }
    const columnQuads = anchors.filter(quad => quad.low === 1 || quad.above);
    assert.ok(columnQuads.length >= 1, 'the capital stands a level up');
    // Both of the column's pieces share one anchor depth, which is what makes
    // them turn as one object rather than two.
    const columnZ = new Set(anchors.filter(a => a.above).map(a => a.z));
    assert.equal(columnZ.size, 1, 'the column has a single anchor depth');
});

test('an event says in its own note how it should stand', () => {
    // An event whose graphic is a tile inherits that tile's 3D class before any
    // geometry is built. One drawn from a character sheet has no tile to
    // inherit from, so it says so itself — which is what lets an animated piece
    // of a city stand with the painted buildings beside it instead of turning
    // to follow the viewer.
    assert.deepEqual(Reactor3D.eventShapeFromNote('<3d panel>'),
        { shape: 'panel', facing: 'south' }, 'a panel with no direction faces the default view');
    assert.deepEqual(Reactor3D.eventShapeFromNote('<3d panel east>'),
        { shape: 'panel', facing: 'east' });
    assert.deepEqual(Reactor3D.eventShapeFromNote('<3D Upright>'),
        { shape: 'upright', facing: 'south' }, 'case does not matter');
    assert.equal(Reactor3D.eventShapeFromNote('<3d flat>').shape, 'flat');

    // Saying nothing is not the same as asking for a billboard: the caller has
    // to be able to tell "no opinion" from an explicit choice.
    assert.equal(Reactor3D.eventShapeFromNote('a note about something else'), null);
    assert.equal(Reactor3D.eventShapeFromNote('<3d>'), null, 'the map tag is not an event tag');
    assert.equal(Reactor3D.eventShapeFromNote(''), null);
    assert.equal(Reactor3D.eventShapeFromNote(undefined), null);
});

test('a facing turns a plane to point that way', () => {
    assert.equal(Reactor3D.facingRotation('south'), 0, 'the default view');
    assert.equal(Reactor3D.facingRotation('north'), Math.PI);
    assert.equal(Reactor3D.facingRotation('east'), Math.PI / 2);
    assert.equal(Reactor3D.facingRotation('west'), -Math.PI / 2);
    assert.equal(Reactor3D.facingRotation('nonsense'), 0, 'and anything unreadable faces front');
});

test('the editor stands a tagged event still, and follows a note being edited', () => {
    const fs = require('node:fs');
    const view = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(view, /Reactor3D\.eventShapeFromNote\(event\.note\)/,
        'the tag is read when the event meshes are built');
    assert.match(view, /addEventListener\('rr-events-changed'/,
        'and the view rebuilds when events change');
    assert.match(view, /removeEventListener\('rr-events-changed'/,
        'letting go of it, or a second project rebuilds the first');

    const events = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'EventManager.js'), 'utf8');
    assert.match(events, /new CustomEvent\('rr-events-changed'\)/,
        'which nothing announced before, so a note edit never reached the 3D canvas');
});
