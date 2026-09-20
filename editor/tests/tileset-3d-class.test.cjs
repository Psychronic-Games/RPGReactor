const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const C = require(path.join(editorRoot, 'src', 'utils', 'Tileset3DClass.js'));
const runtimeSource = source3D();

test('the class values match the runtime that consumes them', () => {
    // The editor cannot load the runtime module, so the two hold the same
    // numbers by assertion rather than by sharing a definition.
    for (const [name, value] of [['AUTO', C.AUTO], ['GROUND', C.GROUND], ['UPRIGHT', C.UPRIGHT]]) {
        assert.match(runtimeSource, new RegExp(`Reactor3D\\.CLASS_${name} = ${value};`),
            `CLASS_${name} is ${value} in the runtime`);
    }
    assert.match(runtimeSource, new RegExp(`CLASSIFICATION_FILE = "${C.FILENAME}"`));
});

test('an unclassified tile falls through to the heuristic', () => {
    const data = C.create();
    assert.equal(C.classOf(data, 224, 2816), C.AUTO);
    assert.ok(C.isEmpty(data), 'and a fresh file classifies nothing');
});

test('classes round-trip through JSON', () => {
    let data = C.create();
    data = C.setClass(data, 224, 2816, C.UPRIGHT);
    data = C.setClass(data, 224, 1029, C.GROUND);
    const reloaded = C.normalize(JSON.parse(JSON.stringify(data)));
    assert.equal(C.classOf(reloaded, 224, 2816), C.UPRIGHT);
    assert.equal(C.classOf(reloaded, 224, 1029), C.GROUND);
    assert.equal(C.classOf(reloaded, 224, 999), C.AUTO);
});

test('clearing a tile leaves no husk behind', () => {
    // AUTO is the absence of an entry, so a cleared file must equal a fresh one
    // rather than carrying empty objects that grow with every edit.
    let data = C.setClass(C.create(), 224, 2816, C.UPRIGHT);
    data = C.setClass(data, 224, 2816, C.AUTO);
    assert.deepEqual(data, C.create());
    assert.ok(C.isEmpty(data));
});

test('a malformed file degrades instead of throwing', () => {
    for (const bad of [null, 'nope', 42, {}, { tilesets: 'no' }, { tilesets: { 1: 'no' } }]) {
        const data = C.normalize(bad);
        assert.ok(C.isEmpty(data), `${JSON.stringify(bad)} normalises to empty`);
    }
    // Unknown class values are dropped rather than stored.
    const data = C.normalize({ version: 1, tilesets: { 5: { 100: 7, 101: C.GROUND } } });
    assert.equal(C.classOf(data, 5, 100), C.AUTO);
    assert.equal(C.classOf(data, 5, 101), C.GROUND);
});

test('clicking cycles every class and back to automatic', () => {
    assert.equal(C.cycle(C.AUTO), C.GROUND);
    assert.equal(C.cycle(C.GROUND), C.UPRIGHT);
    assert.equal(C.cycle(C.UPRIGHT), C.SCENERY);
    assert.equal(C.cycle(C.SCENERY), C.FOLIAGE);
    // Panel joins the end of the ring rather than the middle, so the classes
    // that were already there keep the order authors have learned.
    assert.equal(C.cycle(C.FOLIAGE), C.PANEL);
    assert.equal(C.cycle(C.PANEL), C.AUTO);
});

test('an autotile answers for its own lone variant, a B-E tile is pointed at one', () => {
    // Shape 46 is the autotile with no neighbours, which is what the sheet
    // draws for one isolated cell of that terrain — a single tree, a single
    // peak. A B-E sheet has no such rule, so the stand-in is recorded.
    assert.equal(C.standInOf(null, '1', 2816), 2816 + C.LONE_SHAPE);
    assert.equal(C.standInOf(null, '1', 2816 + 12), 2816 + C.LONE_SHAPE,
        'every shape of a kind resolves to the same lone variant');

    assert.equal(C.standInOf(null, '1', 44), 44, 'unpointed B-E stands its own art up');
    const data = C.setStandIn(C.create(), 1, 44, [28, 2, 2]);
    assert.deepEqual(C.standInOf(data, '1', 44), { tileId: 28, w: 2, h: 2 });

    // A lone variant drawn over a block is stored with its span, because
    // taking only its first tile drew a quarter of each tree.
    const roundTripped = C.normalize(data);
    assert.deepEqual(C.standInOf(roundTripped, '1', 44), { tileId: 28, w: 2, h: 2 });

    assert.equal(C.standInOf(C.setStandIn(data, 1, 44, 0), '1', 44), 44,
        'clearing it falls back to the tile itself');
});

test('classified counts are per tileset', () => {
    let data = C.setClass(C.create(), 224, 1, C.GROUND);
    data = C.setClass(data, 224, 2, C.UPRIGHT);
    data = C.setClass(data, 225, 3, C.GROUND);
    assert.equal(C.countClassified(data, 224), 2);
    assert.equal(C.countClassified(data, 225), 1);
    assert.equal(C.countClassified(data, 999), 0);
});

test('the util is loaded by the editor', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(html, /src\/utils\/Tileset3DClass\.js/);
});

test('a declared object groups exactly, where adjacency welds', () => {
    // The reason declarations exist. An ice mountain drawn in sheet columns 0-1
    // and a rock mountain in columns 2-3, painted side by side on the map, look
    // identical to an adjacency test: each pair of neighbouring cells is one
    // step apart on the map and one step apart on the sheet.
    let data = C.create();
    data = C.defineObject(data, 1, 8, 2, 1);     // ice: row 1, columns 0-1
    data = C.defineObject(data, 1, 10, 2, 1);    // rock: row 1, columns 2-3

    assert.equal(C.objectAt(data, 1, 9).object.tile, 8, 'the ice half belongs to the ice');
    assert.equal(C.objectAt(data, 1, 10).object.tile, 10, 'and the rock half to the rock');
    assert.equal(C.objectAt(data, 1, 12), null, 'a tile outside both belongs to neither');
});

test('a role says how a tile behaves inside its object', () => {
    // Separate from the class on purpose: the class says what an unattached
    // tile is, the role says what a tile does within the object it is part of.
    // A launch pad stays on the floor while its towers stand.
    let data = C.defineObject(C.create(), 1, 8, 2, 2, 'SSFF');
    assert.equal(C.roleOf(data, 1, 8), C.STAND);
    assert.equal(C.roleOf(data, 1, 16), C.FLAT, 'the bottom row lies flat');
    assert.equal(C.roleOf(data, 1, 300), C.STAND, 'an unattached tile stands by default');

    C.cycleRole(data, 1, 16);
    assert.equal(C.roleOf(data, 1, 16), C.STAND, 'and the role can be flipped back');
});

test('declaring over a tile takes it from whatever claimed it', () => {
    // A tile in two objects at once has no answer, so the newer declaration
    // wins outright rather than leaving both.
    let data = C.defineObject(C.create(), 1, 8, 4, 1);
    data = C.defineObject(data, 1, 10, 2, 1);
    assert.equal(C.objectList(data, 1).length, 1, 'the overlapped declaration is gone');
    assert.equal(C.objectAt(data, 1, 10).object.w, 2);
    assert.equal(C.objectAt(data, 1, 8), null, 'and its other tiles are unattached again');
});

test('an autotile is never part of a declared object', () => {
    // Its id encodes a corner arrangement rather than a position in a drawing,
    // so a rectangle of the sheet means nothing for it.
    const data = C.defineObject(C.create(), 1, 8, 2, 2);
    assert.equal(C.objectAt(data, 1, 2816), null);
    assert.equal(C.roleOf(data, 1, 2816), C.STAND);
});

test('a hand-edited objects list degrades instead of throwing', () => {
    const cleaned = C.normalize({
        version: 1, tilesets: { 1: { 8: C.UPRIGHT } },
        objects: { 1: [
            { tile: 8, w: 2, h: 2, roles: 'SF' },      // short: padded
            { tile: 2816, w: 1, h: 1 },                // an autotile: dropped
            { tile: -1, w: 2, h: 2 },                  // not a place: dropped
            'nonsense'
        ] }
    });
    assert.equal(cleaned.objects['1'].length, 1);
    assert.equal(cleaned.objects['1'][0].roles, 'SFSS', 'padded to the rectangle');
});

test('an object anchored at the corner of a sheet is kept', () => {
    // Tile 0 is two things at once: the top-left cell of the B sheet, and the
    // engine's "no tile". It is refused as a *lookup*, because an empty map
    // cell reads as 0 — but as an object's corner it is a real place, and
    // dropping it meant a prop drawn there could not be declared at all.
    const kept = C.normalize({
        version: 1, tilesets: {},
        objects: { 1: [{ tile: 0, w: 3, h: 2 }] }
    });
    assert.equal(kept.objects['1'].length, 1);
    assert.ok(C.objectAt(kept, 1, 1), 'and its other cells find it');
    assert.equal(C.objectAt(kept, 1, 0), null, 'while tile 0 itself still does not');
});
