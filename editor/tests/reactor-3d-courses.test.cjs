/**
 * A course of standing art shares one footing along the row.
 *
 * Standing art is painted in pieces. Moletown's gateway is five separate
 * one-column placements of the same object at shifted origins, flanked by
 * posts reaching three rows further down. With each piece stood on its own
 * bottom row, one painted surface was built on three planes at three depths:
 * the sign lined up with neither post, and slid against them as the view
 * panned, because surfaces at different depths do not move together.
 *
 * The rule has to be narrow. Joining everything that touches fixed the gateway
 * and broke the city — standing art abuts standing art all the way down a
 * street, so the region walked south to the map's edge and stood every wall in
 * Moletown thirty-eight tiles up, putting the towers off the top of the screen.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const PLANES = 6;
const TILESET = 11;
const SHEET = 5;               // sheet B: tile ids 0-255, laid out 8 per half
// Tile 0 is the first cell of sheet B and `isPictureTile` rejects it, so
// fixtures start a row down.
const cellId = (col, row) => (row * 8) + (col % 8);

function mapWith(width, height, painted) {
    const data = new Array(width * height * PLANES).fill(0);
    for (const [x, y, tileId] of painted) data[y * width + x] = tileId;
    return { width, height, data, events: [null] };
}

/** Declare one object covering `w x h` of the sheet from `tile`. */
function classify(objects, classes) {
    Reactor3D.setClassification({
        version: 1,
        tilesets: { [TILESET]: classes },
        objects: { [TILESET]: objects }
    });
}

function build(map) {
    return Reactor3D.Geometry.build(map, {
        tileSize: 48,
        elevationAt: () => 0,
        isUpright: Reactor3D.uprightPredicate(TILESET),
        isAuthored: tileId => Reactor3D.isClassified(TILESET, tileId),
        declaredAt: tileId => Reactor3D.objectAt(TILESET, tileId),
        sheetSize: () => ({ width: 768, height: 768 })
    });
}

const planeAt = (built, x, y) => {
    const at = y * built.width + x;
    return built.facade.onFacade[at] ? built.facade.z[at] : null;
};

test.beforeEach(() => Reactor3D.setClassification(Reactor3D.createClassification()));
test.after(() => Reactor3D.setClassification(Reactor3D.createClassification()));

test('a panel hung between two posts stands on the posts, not on itself', () => {
    // Posts in columns 0 and 4 run to row 3; the panel between them stops at
    // row 1. Standing the panel on row 1 puts it two tiles low and two tiles
    // nearer the camera than the posts holding it up.
    const tall = cellId(0, 1);
    classify(
        [{ tile: tall, w: 1, h: 4, roles: 'SSSS' }],
        { [Reactor3D.classKey(tall)]: Reactor3D.CLASS_UPRIGHT }
    );
    const painted = [];
    for (const x of [0, 4]) for (let y = 0; y <= 3; y++) painted.push([x, y, tall]);
    for (const x of [1, 2, 3]) for (let y = 0; y <= 1; y++) painted.push([x, y, tall]);

    const built = build(mapWith(6, 6, painted));
    const posts = planeAt(built, 0, 0);
    assert.ok(posts, 'the posts stand');
    for (const x of [1, 2, 3]) {
        assert.equal(planeAt(built, x, 0), posts,
            `the panel at column ${x} hangs on the same plane as the posts`);
    }
});

test('a course cannot walk south, however long the street is', () => {
    // Three structures stacked north to south, each starting where the last
    // ended. Joined by anything that merely touches, the top one is stood on
    // the bottom one's base and hoisted off the screen.
    const tall = cellId(0, 1);
    classify(
        [{ tile: tall, w: 1, h: 4, roles: 'SSSS' }],
        { [Reactor3D.classKey(tall)]: Reactor3D.CLASS_UPRIGHT }
    );
    const painted = [];
    for (let y = 0; y <= 11; y++) painted.push([0, y, tall]);

    const built = build(mapWith(3, 12, painted));
    const top = planeAt(built, 0, 0);
    const bottom = planeAt(built, 0, 11);
    assert.ok(top !== null && bottom !== null);
    assert.notEqual(top, bottom,
        'a twelve-row column of art is not one twelve-tile wall');
    assert.ok(top <= 4, `the top structure stands on its own base, not on row ${top - 1}`);
});

test('a structure is never taller than the art it is made of', () => {
    // The bound has to come from the data, not a guess. Requiring pieces to
    // begin on the same row was too strict — posts start lower than the band
    // they carry, which is the whole point of a post — and joining anything
    // that touches was far too loose. A declared object knows how tall its own
    // picture is, and nothing assembled from it was ever drawn taller.
    const tall = cellId(0, 1);
    classify(
        [{ tile: tall, w: 1, h: 4, roles: 'SSSS' }],
        { [Reactor3D.classKey(tall)]: Reactor3D.CLASS_UPRIGHT }
    );
    const painted = [];
    for (let y = 0; y <= 11; y++) painted.push([0, y, tall]);

    const built = build(mapWith(3, 12, painted));
    const planes = new Set();
    for (let y = 0; y <= 11; y++) {
        const at = planeAt(built, 0, y);
        if (at !== null) planes.add(at);
    }
    assert.ok(planes.size > 1,
        'a twelve-row column of four-row art is not one twelve-tile wall');
    for (const plane of planes) {
        assert.ok(plane <= 12, `a plane at ${plane} is past the map`);
    }
});

test('the build reports where every cell of standing art ended up', () => {
    // Anything drawn over the scene — a sign event, the animation playing on
    // it — has to be able to follow its art onto the wall.
    const tall = cellId(0, 1);
    classify(
        [{ tile: tall, w: 1, h: 2, roles: 'SS' }],
        { [Reactor3D.classKey(tall)]: Reactor3D.CLASS_UPRIGHT }
    );
    const built = build(mapWith(3, 3, [[1, 0, tall], [1, 1, tall]]));
    assert.ok(built.facade, 'the map is handed back with the geometry');
    assert.equal(built.facade.onFacade.length, 9);
    assert.ok(planeAt(built, 1, 0) !== null);
    assert.equal(planeAt(built, 0, 0), null, 'and cells with no standing art say so');
});

test('the footing and the lift are kept apart, because up is not world up', () => {
    // A cut-out's courses are stacked along the billboard's own up axis, which
    // leans back with the camera. Recording one combined world height put
    // every sprite at a world position while the art it belongs to was drawn
    // along the leaning axis — a gap that grows with height and swings as the
    // camera moves, which is a sign creeping against the pole it hangs from as
    // you walk up the map.
    const tall = cellId(0, 1);
    // Every row of the object, not just its first: a tile nobody classified is
    // not upright, so the placement would stop at its top row.
    const classes = {};
    for (let row = 0; row < 4; row++) {
        classes[Reactor3D.classKey(tall + row * 8)] = Reactor3D.CLASS_UPRIGHT;
    }
    classify([{ tile: tall, w: 1, h: 4, roles: 'SSSS' }], classes);
    // Successive rows of the object's own art, which is what makes these four
    // cells one placement rather than four separate ones.
    const painted = [];
    for (let y = 0; y <= 3; y++) painted.push([1, y, tall + y * 8]);
    const built = build(mapWith(3, 5, painted));

    assert.ok(built.facade.lift, 'the lift is recorded separately');
    const at = y => y * built.width + 1;
    // Every course shares the wall's footing...
    const footing = built.facade.y[at(3)];
    for (let y = 0; y <= 3; y++) {
        assert.equal(built.facade.y[at(y)], footing, `row ${y} shares the footing`);
    }
    // ...and differs only in how far up it sits.
    const lifts = [0, 1, 2, 3].map(y => built.facade.lift[at(y)]);
    assert.equal(lifts[3], 0, 'the bottom course sits on the footing');
    for (let y = 2; y >= 0; y--) {
        assert.ok(lifts[y] > lifts[y + 1], `row ${y} sits above row ${y + 1}`);
    }
});

test('one helper resolves a standing place into a world point', () => {
    // Sprites, their scale and the lights all have to travel the same way to
    // reach the wall, or they arrive at different places.
    const fs = require('node:fs');
    const three = source3D();
    const at = three.indexOf('Reactor3D.pointOf = function');
    assert.ok(at > -1, 'there is one place that does it');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /const up = this\.billboardUp\(camera\);/);
    assert.match(body, /stand\.height \+ up\.y \* lift/);
    assert.match(body, /stand\.z \+ up\.z \* lift/);

    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.equal((sprites.match(/Reactor3D\.pointOf\(/g) || []).length, 2,
        'the sprite and its scale both go through it');
});
