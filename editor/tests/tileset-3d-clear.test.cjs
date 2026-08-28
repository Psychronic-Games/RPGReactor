/**
 * Forgetting what was said about a tile.
 *
 * Every other setting here could be changed and none could be removed: Auto
 * reset a tile's class and left its stand-in, its roof pairing and its object
 * membership behind. There was no way back short of editing the sidecar by
 * hand, which is not a thing an author should ever have to do.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const classes = require(path.join(__dirname, '..', 'src', 'utils', 'Tileset3DClass.js'));

const TILESET = 3;
const PROP = 40;          // a B-sheet tile
const WALL = 4352;        // an A4 wall

test('clearing forgets the class', () => {
    const store = classes.create();
    classes.setClass(store, TILESET, PROP, classes.UPRIGHT);
    assert.equal(classes.clearTile(store, TILESET, PROP), true);
    assert.equal(classes.classOf(store, TILESET, PROP), classes.AUTO);
});

test('clearing forgets the stand-in', () => {
    const store = classes.create();
    classes.setStandIn(store, TILESET, PROP, [41, 2, 2]);
    assert.equal(classes.clearTile(store, TILESET, PROP), true);
    const after = classes.standInOf(store, TILESET, PROP);
    assert.equal(typeof after === 'object' ? after.tileId : after, PROP,
        'back to standing in for itself');
});

test('clearing forgets the roof it was paired with', () => {
    const store = classes.create();
    classes.setTopFace(store, TILESET, WALL, PROP);
    assert.equal(classes.clearTile(store, TILESET, WALL), true);
    assert.equal(classes.materialOf(store, TILESET, WALL), null);
});

test('clearing forgets the object it belonged to', () => {
    const store = classes.create();
    classes.defineObject(store, TILESET, PROP, 2, 2);
    assert.equal(classes.clearTile(store, TILESET, PROP), true);
    assert.equal(classes.objectAt(store, TILESET, PROP), null);
});

test('an autotile can be cleared too', () => {
    // Objects are refused on autotiles, but a class is not — so a class put on
    // one has to come off again.
    const store = classes.create();
    classes.setClass(store, TILESET, 2816, classes.FOLIAGE);
    assert.equal(classes.clearTile(store, TILESET, 2816), true);
    assert.equal(classes.classOf(store, TILESET, 2816), classes.AUTO);
});

test('clearing an untouched tile says so rather than claiming a change', () => {
    // The accessors answer with derived facts as well as authored ones — an A4
    // wall is paired with the roof its sheet layout implies, a tile with no
    // stand-in stands in for itself — so asking them reported untouched tiles
    // as carrying information they did not have.
    const store = classes.create();
    assert.equal(classes.clearTile(store, TILESET, PROP), false, 'a plain prop');
    assert.equal(classes.clearTile(store, TILESET, 2816), false, 'an autotile');
    assert.equal(classes.clearTile(store, TILESET, WALL), false,
        'a wall whose roof is implied by A4, not authored');
});

test('clearing one tile leaves its neighbours alone', () => {
    const store = classes.create();
    classes.setClass(store, TILESET, PROP, classes.UPRIGHT);
    classes.setClass(store, TILESET, PROP + 1, classes.SCENERY);
    classes.clearTile(store, TILESET, PROP);
    assert.equal(classes.classOf(store, TILESET, PROP + 1), classes.SCENERY);
});

test('clearing one tileset leaves the others alone', () => {
    const store = classes.create();
    classes.setClass(store, TILESET, PROP, classes.UPRIGHT);
    classes.setClass(store, TILESET + 1, PROP, classes.UPRIGHT);
    classes.clearTile(store, TILESET, PROP);
    assert.equal(classes.classOf(store, TILESET + 1, PROP), classes.UPRIGHT);
});

test('Clear is the only destructive tool', () => {
    // Remove undeclared an object and kept the classes; Clear forgot
    // everything. The two overlapped almost entirely outside one narrow case —
    // fixing a grouping without redoing the classifications — which did not
    // earn a second destructive button.
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.doesNotMatch(source, /'erase'/);
    assert.doesNotMatch(source, /\['erase',/);
});

test('the editor offers Clear as its own tool', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    assert.match(source, /\['clear', tt\('Clear'\),/);
    assert.match(source, /if \(tool === 'clear'\)/);
    // And it runs before objects are refused on autotiles, or an autotile's
    // class could be set and never removed.
    assert.ok(source.indexOf("if (tool === 'clear')")
        < source.indexOf("if ((tool === 'object' || tool === 'role') && autotile)"));
});

//-----------------------------------------------------------------------------
// Extending an object

test('the sheet edge is checked by bounds, not by a tile id of zero', () => {
    // `tileAtCell` answers 0 both for the top-left tile of a sheet and for a
    // cell past its edge. Treating that 0 as failure meant an object anchored
    // at the sheet's very first tile could never be extended — and the caller
    // reported it as the two halves being on different sheets, which they
    // were not.
    assert.equal(classes.tileAtCell(5, 0, 0), 0, 'the first tile of sheet B really is 0');
    assert.equal(classes.tileAtCell(5, 0, 99), 0, 'and so is a cell off the sheet');
    assert.equal(classes.isObjectOrigin(0), true, 'so 0 has to be allowed as an origin');

    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const at = source.indexOf('mergeTile3DObject(existingTile');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.doesNotMatch(body, /if \(!tile\) return null;/);
    assert.match(body, /if \(left < 0 \|\| top < 0 \|\| right > 16 \|\| bottom > 16\)/);
});

test('each way a merge can fail says which one it was', () => {
    // All three refusals used to be a bare null, and the caller blamed the
    // sheet for every one of them.
    const fs = require('node:fs');
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const at = source.indexOf('mergeTile3DObject(existingTile');
    const body = source.slice(at, source.indexOf('\n    }', at));
    assert.match(body, /no longer there/, 'the object went away');
    assert.match(body, /different sheet/, 'the pieces really are on different sheets');
    assert.match(body, /past the edge of the sheet/, 'the rectangle does not fit');
});
