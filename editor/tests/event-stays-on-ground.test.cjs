/**
 * An event can refuse to join the object painted over its cell.
 *
 * Painting a group on the map takes everything standing on those cells and
 * makes it one object, which is exactly right for the things that *are* the
 * building: an animated sign, a lit window, a swinging shop door. They ride the
 * building's plane and so hold still against it as the camera comes round,
 * which is the whole reason grouping exists.
 *
 * It is wrong for anything merely passing through. A character walking behind a
 * shop crosses its cells, and the moment they stop walking they are pinned to
 * the shopfront and carried up it — because "is this part of the building?" and
 * "is this standing on the building's square?" are the same question to
 * everything except the author.
 *
 *   <3d ground>       stand on the ground, never on the object at this cell
 *   <no 3d object>    the same thing said the other way round
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

// `pointOf` asks which way is up for a billboard, and that answer is built from
// THREE.Vector3 — which needs a renderer these tests do not stand up. The axis
// itself is not what is under test here, so it is pinned to world up.
Reactor3D.billboardUp = () => ({ x: 0, y: 1, z: 0 });

test('the tag is read, in either spelling, and nothing else is', () => {
    for (const note of [
        '<3d ground>', '<no 3d object>', '<3D GROUND>', '<  3d   ground  >',
        'up front <3d ground> and after', '<3d>\n<3d ground>'
    ]) {
        assert.equal(Reactor3D.eventStaysOnGround(note), true, note);
    }
    for (const note of [
        '', '<3d>', '<3d lights>', '<3d flat>', '<3d upright>',
        '<3d panel east>', 'ground', '<3d grounded>', null, undefined, 42
    ]) {
        assert.equal(Reactor3D.eventStaysOnGround(note), false, String(note));
    }
});

test('it does not collide with the shape tags an event may also carry', () => {
    // Shape says what an event *is*; this says where it stands. An event may
    // reasonably state both.
    const note = '<3d panel east>\n<3d ground>';
    assert.equal(Reactor3D.eventStaysOnGround(note), true);
    assert.deepEqual(Reactor3D.eventShapeFromNote(note), { shape: 'panel', facing: 'east' });
});

test('a tagged event is not baked into the map as a prop either', () => {
    /*
     * The tag means one thing — "I am not part of what is built here" — and it
     * would be a poor sort of exemption that applied to the building beside it
     * and not to the building it was about to become.
     */
    const upright = 2816;
    const mapData = {
        width: 3, height: 1,
        data: new Array(3 * 6).fill(0),
        events: [
            null,
            { id: 1, x: 0, y: 0, note: '', pages: [{ image: { tileId: upright } }] },
            { id: 2, x: 1, y: 0, note: '<3d ground>', pages: [{ image: { tileId: upright } }] }
        ]
    };

    const tiles = Reactor3D.eventTiles(mapData);
    assert.deepEqual(tiles.map(t => t.id), [1, 2], 'both are seen');
    assert.equal(tiles.find(t => t.id === 2).note, '<3d ground>',
        'and the note travels with them, which is the only place it is asked');

    // Classified and upright, so both would otherwise be written into the map.
    Reactor3D.setClassification({
        version: 1,
        tilesets: { 1: { [upright]: Reactor3D.CLASS_UPRIGHT } }
    });
    try {
        Reactor3D.mapWithEventTiles(mapData, 1);
        assert.equal(Reactor3D.isEventProp(1), true, 'the untagged one stands');
        assert.equal(Reactor3D.isEventProp(2), false, 'and the tagged one does not');
    } finally {
        Reactor3D.setClassification(null);
    }
});

test('the running game asks before putting an event on a wall', () => {
    const runtime = source3D();
    const place = runtime.slice(runtime.indexOf('Reactor3D.standingPlaceFor = function'));
    const body = place.slice(0, place.indexOf('\n};'));
    assert.match(body, /if \(data && this\.eventStaysOnGround\(data\.note\)\) return ground;/);
    // Before the facade is consulted, or it would have been pinned already.
    assert.ok(body.indexOf('eventStaysOnGround') < body.indexOf('this.facadeAt(x, y)'));
    // And the existing exclusions are untouched: a character that is moving,
    // or one whose route has taken it off its own square, still drops.
    assert.match(body, /if \(character\.isMoving && character\.isMoving\(\)\) return ground;/);
    assert.match(body, /if \(!data \|\| x !== data\.x \|\| y !== data\.y\) return ground;/);
});

test('the editor preview agrees with the game', () => {
    // An event drawn one way in the preview and another in play is worse than
    // either, because it is the preview that is trusted while authoring.
    const editor = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor, /const loose = Reactor3D\.eventStaysOnGround\?\.\(event\.note\)/);
    assert.match(editor, /const onFacade = sprite && !asked && !loose/,
        'it keeps its billboard');
    assert.match(editor, /const facade = \(mesh\.userData\.asked \|\| mesh\.userData\.loose\)\s*\n?\s*\? null/,
        'and it stands on the ground');
});

test('a sprite standing on the art is placed where the art is', () => {
    /*
     * The shader steps every cut-out half a cell towards the camera, because a
     * thing standing on a cell fills it front to back and the eye reads its
     * near edge as where it stands. A sprite placed without that step is half a
     * cell further away than the picture it belongs to — and under a pitched
     * camera "further away" reads as "higher up the screen". A sign on a
     * shopfront floated half a tile above its own board.
     */
    // A camera looking north and down, which is the map camera's usual
    // attitude. The third column of its world matrix is the axis pointing back
    // towards it, which is what the shader reads and what this reads.
    const camera = { matrixWorld: { elements: [
        1, 0, 0, 0,
        0, 0.7, 0.7, 0,
        0, -0.7, 0.7, 0,
        0, 0, 0, 1
    ] } };
    const step = Reactor3D.footward(camera);
    assert.ok(step, 'there is a step');
    assert.equal(step.y, 0, 'and it is along the ground, so it does not lift anything');
    assert.ok(Math.abs(Math.hypot(step.x, step.z) - 0.5) < 1e-6, 'half a cell');
    assert.ok(step.z > 0, 'towards the camera, which is south of what it looks at');

    // A ground character is not standing on art and does not move.
    const ground = { height: 2, z: 7.5, lift: 0 };
    const flat = Reactor3D.pointOf(camera, 4.5, ground);
    assert.equal(flat.x, 4.5);
    assert.equal(flat.z, 7.5);
    assert.equal(flat.y, 2);

    // One on a facade takes the same step its picture took.
    const onArt = { height: 2, z: 7.5, lift: 0, onArt: true };
    const lifted = Reactor3D.pointOf(camera, 4.5, onArt);
    assert.ok(Math.abs(lifted.z - (7.5 + step.z)) < 1e-6, 'nearer by the step');
    assert.equal(lifted.y, 2, 'and no higher, because the step is horizontal');
});

test('the facade answer says it is standing on art', () => {
    const runtime = source3D();
    const place = runtime.slice(runtime.indexOf('Reactor3D.standingPlaceFor = function'));
    const body = place.slice(0, place.indexOf('\n};'));
    assert.match(body, /lift: facade\.lift, onArt: true/);
    // And the ground answer does not, so nothing that was on the ground moves.
    assert.match(body, /const ground = \{ height: [^}]*lift: 0 \};/);
    assert.doesNotMatch(body.slice(0, body.indexOf('const facade =')), /onArt/);
});

test('a camera that answers nothing useful costs the step, not the frame', () => {
    assert.equal(Reactor3D.footward(null), null);
    // A camera looking straight down has no horizontal direction to step along.
    // Straight down: no horizontal direction to step along, and none needed.
    const overhead = { matrixWorld: { elements: [
        1, 0, 0, 0,
        0, 0, 1, 0,
        0, -1, 0, 0,
        0, 0, 0, 1
    ] } };
    assert.equal(Reactor3D.footward({}), null, 'and a camera with no matrix at all');
    assert.equal(Reactor3D.footward(overhead), null);
    const stand = { height: 1, z: 3, lift: 0, onArt: true };
    assert.deepEqual(Reactor3D.pointOf(overhead, 2, stand), { x: 2, y: 1, z: 3 });
});
