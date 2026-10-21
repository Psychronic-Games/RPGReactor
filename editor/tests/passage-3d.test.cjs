// Passage in the 3D map view: the marks say what the game's own rules say, follow edits by neighborhood, and cost nothing while off.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const Labels = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapEdgeLabels.js'));
const { Field, marks, FLAGS } = Labels;

let nextId = 1;
const piece = (kind, x, y, z, more) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: '' }, more || {});
const column = (x, y, levels) => Array.from({ length: levels }, (unused, z) => piece('block', x, y, z));
const mapOf = (pieces, more) => ({ width: 14, height: 14, note: '<3d>', reactor3d: Object.assign({ version: 1, mode: '3d', pieces }, more || {}) });
/** The game's physics in its own realm, with no game running: as the editor has it. */
function physicsOf() {
    const context = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: R };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    return context.ReactorPhysics;
}
const DIRS = [8, 6, 2, 4];
// The world rules ask the physics whether the game swims (`Reactor3D.swimRule`): they find it as they do in the editor, where both share a realm.
const P0 = physicsOf();
global.ReactorPhysics = P0;

/**
 * A made-up village corner. A wall along y 3 with a doorway at 4,3; a stair at 9,6 up to a block at 9,7; steps two
 * and three high at 11,2 and 12,2; a wall at 2,9 with a ladder on its south face and a floor at its top over 3,9 and
 * 4,9; a pond three deep at 8..11, 10..12; a tower five high at 12,13; a fence at 6,9.
 */
function village(more) {
    const pieces = [];
    for (let x = 2; x <= 6; x++) pieces.push(x === 4 ? piece('doorway', x, 3, 0) : piece('wall', x, 3, 0));
    pieces.push(piece('stair', 9, 6, 0), ...column(9, 7, 1));
    pieces.push(...column(11, 2, 2), ...column(12, 2, 3));
    pieces.push(piece('wall', 2, 9, 0));
    for (let z = 0; z < 5; z++) pieces.push(piece('ladder', 2, 10, z, { rot: 2 }));
    pieces.push(piece('floor', 3, 9, 5), piece('floor', 4, 9, 5));
    pieces.push(...column(12, 13, 5), piece('fence', 6, 9, 0));
    return mapOf(pieces, Object.assign({ water: [{ x0: 8, y0: 10, x1: 11, y1: 12, level: 3, material: 'Water' }] }, more || {}));
}
const fieldOf = (map, P, options) => new Field(map, P, Object.assign({ world: R }, options || {}));
/** Every place the field holds: `{ x, y, top, flags, chunk, p }`. */
function placesOf(field) {
    const out = [];
    for (const chunk of field.chunks) {
        if (!chunk) continue;
        for (let p = 0; p < chunk.n; p++) out.push({ x: chunk.x0 + chunk.cell[p] % chunk.cw, y: chunk.y0 + Math.floor(chunk.cell[p] / chunk.cw), top: chunk.top[p], flags: chunk.flags[p], chunk, p });
    }
    return out;
}
const marksOf = field => field.chunks.flatMap((chunk, index) => marks(field, index, { list: true }).list);
const near = (a, b) => Math.abs(a - b) < 1e-4;

test('each side of every place a character gets to is marked as the game\'s own edge rule answers it', () => {
    const P = P0, map = village();
    const field = fieldOf(map, P).finish();
    const rules = field.rules;
    const drawn = marksOf(field);
    let sides = 0, marked = 0;
    for (const place of placesOf(field)) {
        const shown = (place.flags & FLAGS.REACHED) && (place.flags & (FLAGS.STAND | FLAGS.WALKED));
        // A swimmer is judged from where it floats, as the game holds it.
        const from = place.flags & FLAGS.SWIM ? 3 - rules.swimDepth : place.top;
        for (const d of DIRS) {
            const game = P.edge(map, place.x, place.y, d, from, rules), held = field.sideAt(place.x, place.y, place.top, d);
            assert.equal(held.kind, game.kind, `${place.x},${place.y} at ${place.top} toward ${d}`);
            // The game's catch-all "edge" is told apart by what stands behind it; every other reason is the game's own word.
            if (game.kind === 'blocked' && game.reason === 'edge') assert.ok(['edge', 'steep', 'stair', 'water', 'bush'].includes(held.reason), `why, at ${place.x},${place.y} toward ${d}: ${held.reason}`);
            else if (game.kind === 'blocked') assert.equal(held.reason, game.reason, `why, at ${place.x},${place.y} toward ${d}`);
            const mark = drawn.find(entry => entry.x === place.x && entry.y === place.y && entry.d === d && near(entry.height, place.top));
            // A walk is no mark; anything else on a place somebody gets to is drawn, and nothing is drawn where nobody does.
            if (shown && game.kind !== 'walk') { assert.equal(mark && mark.kind, game.kind, `the mark at ${place.x},${place.y} toward ${d}`); marked++; }
            else assert.equal(mark, undefined, `no mark at ${place.x},${place.y} at ${place.top} toward ${d}`);
            sides++;
        }
    }
    assert.equal(drawn.filter(entry => entry.kind !== 'none').length, marked, 'every mark drawn was accounted for');
    assert.ok(sides > 700 && marked > 60, `${sides} sides, ${marked} marks`);

    const side = (x, y, top, d) => { const held = field.sideAt(x, y, top, d); return held.kind === 'blocked' ? 'blocked:' + held.reason : held.kind; };
    // The house: the door lets a walker in, the wall beside it stops one.
    assert.equal(side(4, 4, 0, 8), 'walk', 'through the doorway');
    assert.equal(side(3, 4, 0, 8), 'blocked:high', 'into the wall');
    assert.equal(side(4, 3, 0, 8), 'walk', 'and out the far side');
    // The stair goes up along its run and is shut at its sides.
    assert.equal(side(9, 5, 0, 2), 'walk', 'onto the stair');
    assert.equal(side(9, 6, 0.5, 2), 'walk', 'up it');
    assert.equal(side(9, 6, 0.5, 6), 'blocked:stair', 'not off its side');
    assert.equal(side(8, 6, 0, 6), 'blocked:stair', 'nor onto it from beside it');
    assert.equal(Labels.text({ kind: 'blocked', reason: 'stair' }), 'Blocked: The side of a stair');
    // Steps: a hop within a jump, a mantle above it, a drop back down.
    assert.equal(side(10, 2, 0, 6), 'hop');
    assert.equal(side(12, 3, 0, 8), 'mantle');
    assert.equal(side(11, 2, 2, 4), 'drop');
    // The ladder, and the floor it leads to over the room.
    assert.equal(side(2, 10, 0, 8), 'ladder');
    assert.equal(side(2, 9, 5, 2), 'ladder', 'back down from the top');
    assert.equal(field.reachedAt(4, 9, 5.1), true, 'the upper floor is reached: the ladder, the wall\'s top, the floor');
    assert.equal(side(4, 9, 5.1, 6), 'drop', 'and its open end is a drop');
    assert.equal(field.reachedAt(4, 9, 0), true, 'the ground under it too');
    // Nobody gets to the tower's top: nothing is drawn there, and the ground beside it shows a stop.
    assert.equal(field.reachedAt(12, 13, 5), false);
    assert.equal(drawn.some(entry => entry.x === 12 && entry.y === 13), false, 'a tower wears no marks');
    assert.equal(side(12, 12, 0, 2), 'blocked:high');
    // A fence is nowhere to stand: an X on its tile.
    assert.deepEqual(drawn.filter(entry => entry.x === 6 && entry.y === 9).map(entry => entry.kind), ['none']);
    assert.ok(field.cell(6, 9)[0].top > 0.5, 'the rail is up off the ground');
    assert.equal(drawn.find(entry => entry.x === 6 && entry.y === 9).height, 0, 'and its X lies on the ground under it, not along the rail');
    // The pond is swum (the project swims): reached, with no X on it.
    assert.equal(field.reachedAt(9, 11, 0), true);
    assert.equal(drawn.some(entry => entry.kind === 'none' && entry.x === 9 && entry.y === 11), false);
});

test('what a place is, as the game has it: no headroom, plants, a swimmer\'s float, a second way on, a fall onto a tile nobody stops on', () => {
    const P = P0, why = place => Labels.WHY[place.why];
    // A slab two tiles over the ground: walked under (the game's walk asks no headroom), nowhere to stop.
    const low = fieldOf(mapOf([piece('floor', 3, 3, 2)]), P).finish();
    const under = low.cell(3, 3)[0];
    assert.deepEqual([under.top, why(under), !!(under.flags & FLAGS.STAND), under.reached], [0, 'headroom', false, true]);
    assert.equal(Labels.noStandText(why(under)), 'Nobody can stand here: No room to stand');
    // A deck over open ground: under it on foot, onto it by the hands. The deck is reached by that second way alone.
    const deck = fieldOf(mapOf([piece('floor', 6, 8, 3), piece('floor', 6, 9, 3)]), P).finish();
    assert.deepEqual(Array.from(deck.cell(5, 8)[0].sides.find(entry => entry.d === 6).options, option => option.kind), ['walk', 'mantle']);
    assert.equal(deck.reachedAt(6, 8, 3.1), true, 'every way on is followed, not only the first');
    // A swimmer is judged from where it floats (0.8 over this bed): a bank five tiles over the bed is within its reach, as it is in the game.
    const pond = mapOf(column(12, 11, 5), { water: [{ x0: 8, y0: 10, x1: 11, y1: 12, level: 3, material: 'Water' }] });
    const swum = fieldOf(pond, P).finish();
    assert.ok(swum.cell(11, 11)[0].flags & FLAGS.SWIM);
    assert.equal(P.edge(pond, 11, 11, 6, 3 - swum.rules.swimDepth, swum.rules).kind, 'mantle');
    assert.equal(P.edge(pond, 11, 11, 6, 0, swum.rules).kind, 'blocked', '(from the bed it would be out of reach)');
    assert.equal(swum.sideAt(11, 11, 0, 6).kind, 'mantle');
    // A big bush: nobody walks into it, so the sides toward it say plants; a fall from the crate beside it lands in
    // it all the same, which makes it no place to draw sides on: it wears the X.
    const grown = mapOf(column(5, 4, 2), { foliage: { bushes: [{ x: 5.5, y: 5.5, size: 1.4, tall: 0.9, seed: 7 }] } });
    assert.deepEqual(R.bushCells(R.foliageOf(grown).bushes[0]), [[5, 5]]);
    const bush = fieldOf(grown, P).finish();
    assert.deepEqual([bush.sideAt(4, 5, 0, 6).kind, bush.sideAt(4, 5, 0, 6).reason], ['blocked', 'bush']);
    assert.equal(Labels.text(bush.cell(4, 5)[0].sides.find(entry => entry.d === 6).option), 'Blocked: Plants in the way');
    assert.equal(bush.sideAt(5, 4, 2, 2).kind, 'drop', 'the game lets a body fall into it');
    const inBush = bush.cell(5, 5)[0];
    assert.deepEqual([why(inBush), !!(inBush.flags & FLAGS.STAND), inBush.reached], ['bush', false, false]);
    const chunk = bush.chunkOf(5, 5), at = chunk.start[5 * chunk.cw + 5];
    assert.equal(chunk.flags[at] & (FLAGS.REACHED | FLAGS.WALKED), FLAGS.REACHED, 'fallen into, never walked into');
    assert.deepEqual(marksOf(bush).filter(entry => entry.x === 5 && entry.y === 5).map(entry => entry.kind), ['none']);
    assert.equal(Labels.noStandText(why(inBush)), 'Nobody can stand here: Plants in the way');
    // A rise too steep at the border of two cells about level with each other is said as steep, not as a bare Blocked.
    const ridge = mapOf([], { terrain: new Array(15 * 15).fill(0), terrainWidth: 14 });
    for (let y = 0; y <= 14; y++) ridge.reactor3d.terrain[y * 15 + 7] = 2.4;
    const crest = fieldOf(ridge, P).finish();
    const shut = [];
    for (let x = 4; x <= 9; x++) for (const d of [4, 6]) { const held = crest.sideAt(x, 5, crest.cell(x, 5)[0].top, d); if (held && held.kind === 'blocked') shut.push(held.reason); }
    assert.ok(shut.length > 0 && shut.every(reason => reason === 'steep'), `a ridge: ${shut.join()}`);
});

test('deep water with swimming off, the tileset\'s flags and a body in the way are part of the same picture', () => {
    const P = P0;
    // Swimming off: the pond is nobody's, marked on the water, and its shore is a stop.
    const dry = fieldOf(village(), P, { rules: { swim: false }, settings: Object.assign({}, P.readSettings(), { swim: false }) }).finish();
    const pond = marksOf(dry).filter(entry => entry.x >= 8 && entry.x <= 11 && entry.y >= 10 && entry.y <= 12);
    assert.equal(pond.length, 12, 'an X on each tile of the pond');
    assert.ok(pond.every(entry => entry.kind === 'none' && near(entry.height, 3)), 'drawn on the water, not under it');
    assert.equal(dry.sideAt(9, 9, 0, 2).kind, 'blocked', 'the bank is a stop');
    assert.equal(Labels.WHY[dry.cell(9, 11)[0].why], 'water');
    // The same over a bed too steep to stand on: it is the water that keeps everybody out, and the label says so.
    const sunk = mapOf([], { terrain: new Array(15 * 15).fill(0), terrainWidth: 14, water: [{ x0: 8, y0: 10, x1: 11, y1: 12, level: 3, material: 'Water' }] });
    for (let x = 0; x <= 14; x++) { sunk.reactor3d.terrain[11 * 15 + x] = -1; sunk.reactor3d.terrain[12 * 15 + x] = -4; }
    const deep = fieldOf(sunk, P, { rules: { swim: false }, settings: Object.assign({}, P.readSettings(), { swim: false }) }).finish();
    assert.equal(P.levelsAt(sunk, 9, 11)[0].stand, false, 'a bed nobody could stand on were it dry');
    assert.equal(Labels.noStandText(Labels.WHY[deep.cell(9, 11)[0].why]), 'Nobody can stand here: Deep water');
    assert.equal(Labels.noStandText(Labels.WHY[deep.cell(5, 11)[0].why]), 'Nobody can stand here: Too steep', 'the same slope, dry, says steep');
    assert.equal(Labels.noStandText('water'), 'Nobody can stand here: Deep water');
    assert.equal(Labels.noStandText('steep'), 'Nobody can stand here: Too steep');
    assert.equal(Labels.noStandText(''), 'Nobody can stand here');

    // The tileset: a tile that shuts its east side, and a tile nothing walks on.
    const bits = { '5,6': 4, '7,6': 15 };
    const tiled = fieldOf(village(), P, { tile: (x, y) => bits[x + ',' + y] || 0 }).finish();
    assert.deepEqual([tiled.sideAt(5, 6, 0, 6).kind, tiled.sideAt(5, 6, 0, 6).reason], ['blocked', 'tile'], 'out of the tile');
    assert.deepEqual([tiled.sideAt(6, 6, 0, 4).kind, tiled.sideAt(6, 6, 0, 4).reason], ['blocked', 'tile'], 'and into it from the cell beside');
    assert.equal(tiled.sideAt(5, 6, 0, 8).kind, 'walk', 'its other sides are open');
    assert.equal(tiled.reachedAt(7, 6, 0), false);
    assert.deepEqual(marksOf(tiled).filter(entry => entry.x === 7 && entry.y === 6).map(entry => entry.kind), ['none'], 'the shut tile wears the X');
    assert.equal(Labels.text(tiled.cell(6, 6)[0].sides.find(s => s.d === 6).option), 'Blocked: Tile passage');
    // A tile painted shut afterwards: its cell is read again, not remembered.
    assert.equal(tiled.reachedAt(5, 8, 0), true);
    bits['5,8'] = 15;
    tiled.dirty(5, 8, 5, 8);
    assert.equal(tiled.finish().reachedAt(5, 8, 0), false);
    assert.equal(tiled.sideAt(4, 8, 0, 6).reason, 'tile');

    // A placed model: the tiles it covers are nobody's, and the tiles round it are stopped at it.
    const held = fieldOf(village(), P).finish();
    held.counts.chunks = 0;
    assert.equal(held.setBodies([{ x: 6, y: 6, base: 0, top: 3 }, { x: 7, y: 6, base: 0, top: 3 }]), 2);
    held.finish();
    assert.deepEqual([held.sideAt(5, 6, 0, 6).kind, held.sideAt(5, 6, 0, 6).reason], ['blocked', 'body']);
    assert.deepEqual(marksOf(held).filter(entry => entry.y === 6 && (entry.x === 6 || entry.x === 7)).map(entry => entry.kind), ['none', 'none']);
    assert.equal(Labels.text(held.cell(5, 6)[0].sides.find(s => s.d === 6).option), 'Blocked: Something stands there');
    assert.equal(held.setBodies([{ x: 6, y: 6, base: 0, top: 3 }, { x: 7, y: 6, base: 0, top: 3 }]), 0, 'the same bodies again change nothing');
    // A model up in the air is over nobody's head on the ground.
    const high = fieldOf(village(), P).finish();
    high.setBodies([{ x: 6, y: 6, base: 6, top: 9 }]);
    assert.equal(high.finish().sideAt(5, 6, 0, 6).kind, 'walk');
});

test('a change in one cell works out its neighborhood again, and what it reaches follows', () => {
    const P = P0, map = village();
    const field = fieldOf(map, P, { size: 4 }).finish();
    assert.equal(field.chunks.length, 16, 'four chunks a side');
    assert.equal(field.counts.cells, 196);
    const fresh = () => fieldOf(map, P, { size: 4 }).finish();
    const same = (a, b) => {
        const pa = placesOf(a), pb = placesOf(b);
        assert.equal(pa.length, pb.length);
        pa.forEach((place, i) => {
            assert.deepEqual([place.x, place.y, place.top, place.flags], [pb[i].x, pb[i].y, pb[i].top, pb[i].flags], `place ${place.x},${place.y}`);
            for (const d of DIRS) assert.deepEqual(a.sideAt(place.x, place.y, place.top, d), b.sideAt(place.x, place.y, place.top, d));
        });
    };
    // A crate set down at 9,1: its own chunk only (cells 8..10, 0..2 lie in one).
    field.counts.chunks = field.counts.cells = 0; field.changed.clear();
    map.reactor3d.pieces = map.reactor3d.pieces.concat(column(9, 1, 3));
    field.dirty(9, 1, 9, 1);
    assert.equal(field.pending(), 1);
    field.finish();
    assert.deepEqual([field.counts.chunks, field.counts.cells], [1, 16], 'one chunk of sixteen cells, not the map');
    assert.equal(field.sideAt(8, 1, 0, 6).kind, 'mantle', 'the crate is there');
    same(field, fresh());
    // A cell on a chunk's corner is read by the three chunks beside it as well.
    field.counts.chunks = 0;
    field.dirty(4, 4, 4, 4);
    assert.equal(field.pending(), 4);
    field.finish();
    // The ladder taken away: only the chunks round it are worked out, and the floor it led to, in another chunk, is no longer reached.
    field.counts.chunks = field.counts.floods = 0; field.changed.clear();
    assert.equal(field.reachedAt(4, 9, 5.1), true);
    map.reactor3d.pieces = map.reactor3d.pieces.filter(entry => entry.kind !== 'ladder');
    field.dirty(2, 10, 2, 10);
    field.finish();
    assert.ok(field.counts.chunks <= 2, `${field.counts.chunks} chunks worked out`);
    assert.equal(field.reachedAt(4, 9, 5.1), false, 'the upper floor has no way up');
    assert.equal(field.reachedAt(4, 9, 0), true);
    assert.ok(field.changed.has(Math.floor(9 / 4) * 4 + 1), 'the chunk that holds the floor is drawn again');
    assert.equal(field.counts.floods, 1, 'what is reached was found afresh once');
    same(field, fresh());
    assert.equal(marksOf(field).some(entry => entry.x === 4 && entry.y === 9 && near(entry.height, 5.1)), false, 'and its marks are gone');
});

test('the work is done in slices of time, what the view sees first, and none of it before it is asked for', () => {
    const P = P0, map = village();
    const whole = fieldOf(map, P, { size: 4 }).finish();
    const field = fieldOf(map, P, { size: 4 });
    assert.deepEqual([field.counts.chunks, field.pending(), field.chunks.every(chunk => chunk === null)], [0, 16, true], 'nothing is worked out by making it');
    // A clock that is always past its time: each slice still gets somewhere, and the picture is the same in the end.
    let time = 0, slices = 0;
    const clock = () => (time += 10);
    const focus = { x: 13, z: 13, visible: (x0, y0) => x0 >= 8 && y0 >= 8 };
    const first = [];
    while (field.pending()) {
        const before = field.counts.chunks;
        field.work(4, focus, clock);
        slices++;
        if (field.counts.chunks > before) first.push(field.chunks.findIndex((chunk, index) => chunk && !first.includes(index)));
        assert.ok(slices < 200, 'the work ends');
    }
    assert.ok(slices > 16, `a chunk takes more than one slice when time is short (${slices} slices)`);
    assert.equal(first[0], 15, 'the chunk under the view\'s middle first');
    assert.deepEqual(first.slice(0, 4).sort((a, b) => a - b), [10, 11, 14, 15], 'then the rest of what it sees');
    for (const place of placesOf(whole)) for (const d of DIRS) assert.deepEqual(field.sideAt(place.x, place.y, place.top, d), whole.sideAt(place.x, place.y, place.top, d));
    // Chunks drawn as one (two by two) are worked out one after another, so the block they make is whole early.
    const grouped = fieldOf(map, P, { size: 4 }), taken = [];
    const near = { x: 1, z: 1, group: 2 };
    for (let i = 0; i < 8; i++) { const index = grouped.next(near); grouped.queue.delete(index); taken.push(index); }
    assert.deepEqual(taken.slice(0, 4).sort((a, b) => a - b), [0, 1, 4, 5], 'the four chunks of the nearest block');
    assert.deepEqual(taken.slice(4).sort((a, b) => a - b), [2, 3, 6, 7], 'then the next block along');
});

test('a mark lies on its own place, just inside the side it speaks of, dark under color', () => {
    const P = P0;
    // A three-high crate east of 4,4: one mantle mark on 4,4 and three drops round the crate's top.
    const map = mapOf(column(5, 4, 3));
    const field = fieldOf(map, P).finish();
    const built = marks(field, 0, { list: true, colors: Labels.COLORS });
    assert.equal(built.positions.length, built.vertices * 3);
    assert.equal(built.colors.length, built.vertices * 4);
    assert.ok(built.indices.length % 3 === 0 && built.indices.every(i => i < built.vertices));
    const at = i => [built.positions[i * 3], built.positions[i * 3 + 1], built.positions[i * 3 + 2]];
    const color = i => Array.from(built.colors.slice(i * 4, i * 4 + 4));
    const dark = i => color(i)[3] < 255;
    // The dark shapes are all drawn before the colored ones.
    const order = Array.from(built.indices, dark);
    assert.equal(order.lastIndexOf(true) < order.indexOf(false), true);
    // Ground marks stand a little over the ground inside their cell; the crate's are on its top.
    const ground = [], top = [];
    for (let i = 0; i < built.vertices; i++) (at(i)[1] < 1 ? ground : top).push(at(i));
    assert.ok(ground.length > 0 && ground.every(v => near(v[1], 0.04)));
    assert.ok(top.length > 0 && top.every(v => near(v[1], 3.04)));
    // (The map's own border is a stop too: a bar along it.)
    assert.equal(built.list.filter(entry => entry.kind === 'blocked').length, 4 * 14, 'the border of a 14 by 14 map');
    assert.ok(top.every(v => v[0] > 4.95 && v[0] < 6.05 && v[2] > 3.95 && v[2] < 5.05), 'on the crate');
    // The four cells round the crate each face it with one mark; from the west it is a mantle, by the east side of 4,4.
    const west = built.list.filter(entry => entry.x === 4 && entry.y === 4);
    assert.deepEqual(west.map(entry => [entry.d, entry.kind]), [[6, 'mantle']]);
    const mine = ground.filter(v => v[0] > 3.95 && v[0] < 5.05 && v[2] > 3.95 && v[2] < 5.05);
    assert.ok(mine.length > 0 && mine.every(v => v[0] > 4.6), 'by the side it speaks of');
    // Colors arrive as the renderer works in them (linear), and each kind has its own.
    const linear = hex => [1, 3, 5].map(at => { const c = parseInt(hex.slice(at, at + 2), 16) / 255; return Math.round((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 255); });
    const seen = new Set();
    for (let i = 0; i < built.vertices; i++) { const v = at(i); if (!dark(i) && v[0] > 3.9 && v[0] < 7.1 && v[2] > 2.9 && v[2] < 6.1) seen.add(color(i).slice(0, 3).join()); }
    assert.deepEqual([...seen].sort(), [linear(Labels.COLORS.mantle).join(), linear(Labels.COLORS.drop).join()].sort());
    assert.equal(new Set(Object.values(Labels.COLORS)).size, 6);
    // Several chunks go into one set of lists (the view draws four chunks as one mesh): the same marks, no more.
    const split = fieldOf(village(), P, { size: 4 }).finish();
    const one = [0, 1, 4, 5].map(index => marks(split, index, { list: true })), four = marks(split, [0, 1, 4, 5], { list: true });
    assert.equal(four.vertices, one.reduce((sum, part) => sum + part.vertices, 0));
    assert.equal(four.indices.length, one.reduce((sum, part) => sum + part.indices.length, 0));
    assert.deepEqual(four.list, one.flatMap(part => part.list));
    assert.equal(marks(split, [99], {}).vertices, 0, 'a chunk that is not there adds nothing');
    // Under the open sky nothing is listed for the faint pass; under a roof nobody gets onto, the marks of the place under it are.
    assert.equal(built.covered.length, 0);
    const roofed = fieldOf(mapOf([piece('floor', 6, 8, 6), ...column(7, 8, 1)]), P).finish();
    assert.equal(roofed.reachedAt(6, 8, 6.1), false);
    const under = marks(roofed, 0, { list: true });
    assert.ok(under.covered.length > 0 && under.covered.length < under.indices.length);
    for (const i of under.covered) {
        const v = [under.positions[i * 3], under.positions[i * 3 + 1], under.positions[i * 3 + 2]];
        assert.ok(v[0] > 5.9 && v[0] < 7.1 && v[2] > 7.9 && v[2] < 9.1 && v[1] < 1, 'only the marks of the cell under the floor');
    }
    assert.deepEqual(under.list.filter(entry => entry.x === 6 && entry.y === 8 && entry.height < 1).map(entry => [entry.d, entry.kind]), [[6, 'hop']], 'the ground under the floor: a hop onto the block beside it');
    // Two floors under one roof: through the roof the upper one is read, and the room under it is not laid over it.
    const storeys = fieldOf(mapOf([piece('floor', 6, 8, 3), piece('floor', 6, 8, 8), ...column(7, 8, 1)]), P).finish();
    assert.deepEqual([storeys.reachedAt(6, 8, 0), storeys.reachedAt(6, 8, 3.1), storeys.reachedAt(6, 8, 8.1)], [true, true, false]);
    const both = marks(storeys, 0, { list: true });
    assert.ok(both.list.some(entry => entry.x === 6 && entry.y === 8 && entry.height < 1) && both.list.some(entry => entry.x === 6 && entry.y === 8 && near(entry.height, 3.1)), 'both floors wear their marks');
    const through = new Set(Array.from(both.covered, i => Math.round(both.positions[i * 3 + 1])));
    assert.deepEqual([...through], [3], 'only the upper floor shows through');
    // A floor somebody gets onto under the open sky hides the room under it, as a roof does not.
    const open = marks(fieldOf(mapOf([piece('floor', 6, 8, 3), ...column(7, 8, 1)]), P).finish(), 0, {});
    assert.equal(open.covered.length, 0);
    const body = fieldOf(mapOf([]), P);
    body.setBodies([{ x: 3, y: 3, base: 0, top: 3 }]);
    assert.ok(marks(body.finish(), 0, {}).covered.length > 0, 'the X under a model shows through it');
    // A slope carries its marks up with it: a stair's side bars rise along the run.
    const stair = fieldOf(mapOf([piece('stair', 6, 6, 0), ...column(6, 7, 1)]), P).finish();
    const run = marks(stair, 0, { list: true });
    const heights = [];
    for (let i = 0; i < run.vertices; i++) { const v = [run.positions[i * 3], run.positions[i * 3 + 1], run.positions[i * 3 + 2]]; if (v[0] > 6.8 && v[0] < 7 && v[2] > 5.9 && v[2] < 7.1 && v[1] < 1.035) heights.push(v[1]); }
    assert.ok(Math.max(...heights) - Math.min(...heights) > 0.8, 'the bars on a stair follow it');
});

test('a map the physics does not walk is read by its tiles, as the flat view reads it', () => {
    const source = read('editor/src/TilemapManager.js');
    const start = source.indexOf('\n    static tilePassage(');
    let depth = 0, end = -1;
    for (let i = source.indexOf('{', start); i < source.length; i++) { if (source[i] === '{') depth++; else if (source[i] === '}' && --depth === 0) { end = i + 1; break; } }
    // eslint-disable-next-line no-new-func
    const tilePassage = new Function(`return function ${source.slice(start + 12, end)}`)();
    const W = 6, H = 5, data = new Array(W * H * 6).fill(0), flags = [];
    flags[10] = 0; flags[11] = 0x0f; flags[12] = 0x04; flags[13] = 0x10;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = 10;
    data[2 * W + 2] = 11;                    // nothing walks here
    data[1 * W + 4] = 12;                    // its east side is shut
    data[(2 * H + 3) * W + 1] = 13;          // a star tile over open ground changes nothing
    const map = { width: W, height: H, data, note: '' };
    const read2d = (x, y) => tilePassage(data, W, H, flags, x, y, false).blocked;
    const field = new Field(map, P0, { world: R, tile: read2d }).finish();
    assert.equal(field.physics, null, 'no physics on a map that is not 3D');
    const drawn = marksOf(field);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const here = read2d(x, y), mine = drawn.filter(entry => entry.x === x && entry.y === y);
        if (here === 0x0f) { assert.deepEqual(mine.map(entry => entry.kind), ['none'], `X at ${x},${y}`); continue; }
        for (const [d, dx, dy, bit, back] of [[2, 0, 1, 1, 8], [4, -1, 0, 2, 4], [6, 1, 0, 4, 2], [8, 0, -1, 8, 1]]) {
            const inside = x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H;
            const shut = !inside || !!(here & bit) || !!(read2d(x + dx, y + dy) & back);
            assert.equal(mine.some(entry => entry.d === d && entry.kind === 'blocked'), shut, `${x},${y} toward ${d}`);
        }
    }
    assert.equal(field.sideAt(4, 1, 0, 6).reason, 'tile');
    assert.equal(field.sideAt(0, 0, 0, 4).reason, 'offmap');
    // The 3D view hands the field that same reader.
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /passageTiles\(mapData\) \{[\s\S]*?read: \(x, y\) => \(imageSolid && imageSolid\(x, y\) \? 0x0f\s*: TilemapManager\.tilePassage\(mapData\.data, mapData\.width, mapData\.height, flags, x, y, roomFloor\)\.blocked\)/);
    // A picture at the characters' depth shuts its solid tiles in both views: the same test the flat marks ask.
    assert.match(view, /passageTiles\(mapData\) \{[\s\S]*?const imageSolid = \(typeof window !== 'undefined' && window\.reactor\?\.mapImageLayersManager\?\.solidTest\?\.\(mapData\)\) \|\| null;/);
    assert.match(read('editor/src/TilemapManager.js'), /const imageSolid = \(typeof window !== "undefined" && window\.reactor\?\.mapImageLayersManager\?\.solidTest\(map\)\) \|\| null;/);
});

test('one switch: nothing is built, loaded or listened to while Passage is off, and the flat view is left as it was', () => {
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /setPassageVisible\(on\) \{\s*this\.passageVisible = !!on;\s*this\.drawPassage\(\);\s*\}/);
    assert.match(view, /refreshPassage\(\) \{\s*this\.requestRender\(\);\s*if \(this\.passageVisible\) this\.drawPassage\(\);\s*\}/);
    assert.match(view, /drawPassage\(\) \{\s*globalThis\.RRMapEdgeLabels\?\.passage\.sync\(this\);\s*\}/, 'the view hands over to the passage picture and holds none of its own');
    assert.match(view, /if \(globalThis\.RRMapEdgeLabels\?\.on\) globalThis\.RRMapEdgeLabels\.hover\(this, event\.clientX, event\.clientY, tile\);/, 'one test of a flag on a pointer move while off');
    // Off: no state on the editor, no flag, nothing asked of the map.
    let asked = 0;
    const editor = { passageVisible: false, enabled: true, mapScene: {}, currentMap() { asked++; return null; }, requestRender() {} };
    assert.equal(Labels.passage.sync(editor), false);
    assert.equal(Labels.on, false);
    assert.equal(editor._passage3d, undefined);
    assert.equal(asked, 0);
    assert.equal(Labels.hover(editor, 0, 0, { x: 1, y: 1 }), undefined);
    // On, with the 3D view off: the same nothing (the flat view draws its own marks).
    assert.equal(Labels.passage.sync({ passageVisible: true, enabled: false, currentMap() { asked++; return null; } }), false);
    assert.equal(asked, 0);
    const module = read('editor/src/utils/MapEdgeLabels.js');
    assert.doesNotMatch(module, /passageLayer|tilemapManager\.(drawPassage|refreshPassage|setPassageVisible)/, 'the flat view\'s marks are not this file\'s to touch');
    assert.doesNotMatch(module, /addEventListener\('DOMContentLoaded'|setInterval\(/, 'nothing starts by itself');
    assert.match(module, /stop\(editor\) \{[\s\S]*?document\.removeEventListener\('rr-map-edited', state\.onEdit\)/, 'the edit listener goes with the picture');
    // The flat view keeps its own switch and its own reading.
    const main = read('editor/src/main.js');
    assert.match(main, /this\.projectController\?\.tilemapManager\?\.setPassageVisible\?\.\(event\.currentTarget\.checked\);\s*this\.mapEditor3D\?\.setPassageVisible\?\.\(event\.currentTarget\.checked\);/);
    const flat = read('editor/src/TilemapManager.js');
    assert.match(flat, /drawPassage\(\) \{[\s\S]*?if \(!this\.currentMap \|\| !this\.passageVisible\) return;/);
    assert.match(flat, /blocked === 0x0f|blocked & 1/, 'the flat marks: an X, and an edge by direction');
    assert.doesNotMatch(flat, /RRMapEdgeLabels/);
});

test('the Edges tick is gone, the legend and the words are in every language, and the colors are one set', () => {
    const html = read('editor/index.html');
    assert.doesNotMatch(html, /map-edges-view|workspace\.edges|toolbar\.title\.edges/, 'no Edges tick');
    assert.match(html, /<label class="map-info-item map-passage" title="[^"]*3D view[^"]*" data-i18n-title="toolbar\.title\.showPassage">/, 'the Passage tick says what each view shows');
    assert.match(html, /<script src="src\/utils\/MapEdgeLabels\.js"><\/script>/);
    const css = read('editor/css/styles.css');
    const block = css.slice(css.indexOf('/* Passage in the 3D map view'), css.indexOf('/* End of Passage in the 3D map view. */'));
    assert.ok(block.length > 500);
    for (const kind of Labels.KINDS) assert.match(block, new RegExp(`--rr-passage-${kind}: ${Labels.COLORS[kind]};`), `${kind} is the same color on the map and in the legend`);
    for (const rule of block.split('\n').filter(line => /^\S.*\{/.test(line))) assert.match(rule, /^\.rr-passage/, 'every rule is the passage picture\'s own: ' + rule.slice(0, 40));
    assert.doesNotMatch(block.replace(/--rr-passage-(walk|hop|mantle|ladder|drop|blocked): #[0-9a-f]{6};/g, ''), /#[0-9a-f]{3,6}\b|rgba?\(/i, 'the legend and the labels wear the theme\'s colors');
    const module = read('editor/src/utils/MapEdgeLabels.js');
    assert.match(module, /sessionStorage\?\.setItem\(LEGEND_KEY, '0'\)/, 'a closed legend stays closed for the session');
    assert.match(module, /root\.addEventListener\?\.\('rr-language-changed', state\.onLanguage\)/, 'and is written again when the language changes');
    // Every word it writes is in all 17 locales.
    const context = { console, window: {}, document: { addEventListener() {}, querySelectorAll: () => [], documentElement: { setAttribute() {} } }, localStorage: { getItem: () => null, setItem() {} }, navigator: { language: 'en' } };
    context.window = context; context.globalThis = context; vm.createContext(context);
    for (const file of ['I18nManager.js', 'I18nDeepTranslations.js']) vm.runInContext(read('editor/src/' + file) + '\n;globalThis.__T = typeof RR_TEXT_TRANSLATIONS !== "undefined" ? RR_TEXT_TRANSLATIONS : globalThis.__T; globalThis.__S = typeof RR_I18N_STRINGS !== "undefined" ? RR_I18N_STRINGS : null;', context);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const words = [...new Set([...Object.values(Labels.WORDS), ...Object.values(Labels.REASONS), Labels.NO_STAND, 'Close'])];
    assert.equal(words.length, 20);
    for (const reason of Labels.WHY.slice(1)) assert.ok(words.includes(Labels.REASONS[reason]), `${reason} has words`);
    for (const locale of locales) {
        for (const word of words) assert.ok((context.RR_DEEP_TEXT_TRANSLATIONS[locale] || {})[word] || ((context.__T || {})[locale] || {})[word], `${locale}: ${word}`);
        for (const key of ['workspace.passage', 'toolbar.title.showPassage']) assert.ok(context.__S[locale][key], `${locale}: ${key}`);
        assert.match(context.__S[locale]['toolbar.title.showPassage'], /3D.*3D|ثلاثي الأبعاد.*ثلاثي الأبعاد/, `${locale}: the tooltip speaks of the 3D view`);
        assert.notEqual(context.__S[locale]['toolbar.title.showPassage'], context.__S.en['toolbar.title.showPassage'], `${locale}: in its own language`);
    }
    assert.match(context.__S.en['toolbar.title.showPassage'], /^Show where a character can go\. Flat map: .* 3D view: /);
    assert.equal(html.includes(`title="${context.__S.en['toolbar.title.showPassage']}"`), true, 'the page and the English string agree');
});

test('the map\'s own physics are what the field is read with', () => {
    // The module beside the physics in one realm, as in the editor: the settings are the physics' own reading.
    const context = { console, Math, JSON, Number, Object, Array, WeakMap, Map, Reactor3D: R };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    vm.runInContext(read('editor/src/utils/MapEdgeLabels.js'), context);
    const L = context.RRMapEdgeLabels, P = context.ReactorPhysics;
    global.ReactorPhysics = P;
    try {
    const system = { reactorPhysics: { swimDepth: 1.5, swim: false, jumpHeight: 2 }, reactorControls: {} };
    context.reactor = { databaseManager: { getSystem: () => system } };
    const map = village({ physics: { swimDepth: 4 } });
    const settings = L.settings(map);
    assert.deepEqual([settings.swim, settings.swimDepth, settings.jumpHeight, settings.gravity], [false, 4, 2, 1], 'the project\'s, with the map\'s own over them');
    assert.equal('$dataSystem' in context, false, 'the stand-ins are gone again');
    assert.equal('$dataMap' in context, false);
    // Read through them, the terrain's own rule keeps a walker out of deep water (the physics alone would let it swim).
    const field = new L.Field(map, P, { world: R, rules: L.rules(map), settings }).finish();
    assert.equal(field.rules.swim, false);
    assert.equal(field.rules.hop, 2.75, 'a jump of two tiles and a step');
    assert.equal(field.sideAt(9, 9, 0, 2).kind, 'blocked');
    assert.equal(P.settings().swim, true, 'and the physics is left reading as it did');
    system.reactorPhysics.swim = true;
    const wet = new L.Field(map, P, { world: R, rules: L.rules(map), settings: L.settings(map) }).finish();
    assert.equal(wet.sideAt(9, 9, 0, 2).kind, 'walk', 'a project that swims walks in');
    } finally { global.ReactorPhysics = P0; }
});

test('an edit is found by comparing the map with what it was: only the chunks round it are worked out again', () => {
    const P = P0, passage = Labels.passage;
    const had = global.Reactor3D;
    global.Reactor3D = R;
    try {
        // A 48 by 48 map (nine chunks): flat ground with a terrain grid, a crate, a pond.
        const map = { width: 48, height: 48, note: '<3d>', data: new Array(48 * 48 * 6).fill(0),
            reactor3d: { version: 1, mode: '3d', pieces: column(40, 40, 1), terrain: new Array(49 * 49).fill(0), terrainWidth: 48, water: [] } };
        const field = new Field(map, P, { world: R }).finish();
        const state = { map, field, tiles: null, snapshot: passage.snapshot(map, null), stats: null };
        const queued = () => Array.from(field.queue).sort((a, b) => a - b);
        const settle = () => { field.finish(); field.changed.clear(); field.counts.chunks = 0; };
        const fresh = () => new Field(map, P, { world: R }).finish();
        const agree = () => { const other = fresh(); for (const place of placesOf(other)) for (const d of DIRS) assert.deepEqual(field.sideAt(place.x, place.y, place.top, d), other.sideAt(place.x, place.y, place.top, d), `${place.x},${place.y}`); };
        settle();
        assert.equal(passage.reconcile({}, state), false, 'nothing changed, nothing queued');
        assert.equal(field.pending(), 0);
        // The editor writes the pieces as a new list of new objects: only the one that is new is seen.
        map.reactor3d.pieces = map.reactor3d.pieces.map(entry => Object.assign({}, entry)).concat([piece('wall', 5, 5, 0)]);
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [0], 'a wall at 5,5: the first chunk');
        field.finish();
        assert.equal(field.sideAt(4, 5, 0, 6).kind, 'blocked');
        agree(); settle();
        // Taken away again.
        map.reactor3d.pieces = map.reactor3d.pieces.filter(entry => entry.kind !== 'wall').map(entry => Object.assign({}, entry));
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [0]);
        field.finish();
        assert.equal(field.sideAt(4, 5, 0, 6).kind, 'walk');
        settle();
        // The ground raised in place under 24,24 (its four corners): a step too high to walk, in the middle chunk only.
        for (const [cx, cy] of [[24, 24], [25, 24], [24, 25], [25, 25]]) map.reactor3d.terrain[cy * 49 + cx] = 2;
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [4], 'cells 22..26 lie in the middle chunk');
        field.finish();
        assert.notEqual(field.sideAt(22, 24, 0, 6).kind, 'walk', 'the mound is no walk');
        agree(); settle();
        // A pond poured over 31..36, 2..4: the chunks its box and the cells beside it lie in.
        map.reactor3d.water = [{ x0: 31, y0: 2, x1: 36, y1: 4, level: 3, material: 'Water' }];
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [1, 2], 'cells 30..37: the second and third chunks of the top row');
        field.finish();
        agree(); settle();
        // A tile painted: its cell.
        map.data[(0 * 48 + 20) * 48 + 44] = 77;
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [5]);
        settle();
        assert.equal(passage.reconcile({}, state), false, 'and nothing again');
    } finally { global.Reactor3D = had; }
});

test('finding an edit: the snapshot is kept up in place, and plants, a tileset, a cell\'s height, a rock, a shape on moved ground and a water\'s shore are each followed', () => {
    const P = P0, passage = Labels.passage, had = global.Reactor3D, forget = P.forgetEdges;
    global.Reactor3D = R;
    let forgotten = 0;
    P.forgetEdges = function(map) { forgotten++; return forget.call(this, map); };
    try {
        const map = { width: 48, height: 48, note: '<3d>', data: new Array(48 * 48 * 6).fill(0),
            reactor3d: { version: 1, mode: '3d', pieces: column(40, 40, 1), terrain: new Array(49 * 49).fill(0), terrainWidth: 48, elevation: new Array(48 * 48).fill(0),
                water: [{ x0: 31, y0: 2, x1: 36, y1: 4, level: 3, material: 'Water', mask: '1'.repeat(18) }] } };
        const field = new Field(map, P, { world: R }).finish();
        const state = { map, field, tiles: null, snapshot: passage.snapshot(map, null), stats: null };
        const queued = () => Array.from(field.queue).sort((a, b) => a - b);
        const settle = () => { field.finish(); field.changed.clear(); };
        const all = [0, 1, 2, 3, 4, 5, 6, 7, 8];
        settle();
        // The copies are the snapshot's own, written over where the map moved: nothing is copied whole for an edit.
        const kept = state.snapshot, copies = [kept.terrain, kept.elevation, kept.data];
        assert.ok(kept.terrain instanceof Float32Array && kept.data instanceof Uint16Array && kept.terrain !== map.reactor3d.terrain);
        map.reactor3d.terrain[24 * 49 + 24] = 1.5;
        assert.equal(passage.reconcile({}, state), true);
        assert.equal(forgotten, 1, 'the physics is told to read the map again');
        assert.ok(state.snapshot === kept && kept.terrain === copies[0] && kept.elevation === copies[1] && kept.data === copies[2], 'the same snapshot, the same copies');
        assert.equal(kept.terrain[24 * 49 + 24], 1.5);
        settle();
        assert.equal(passage.reconcile({}, state), false, 'the same edit is not found twice');
        assert.equal(forgotten, 1);
        // A cell's own height (the elevation grid): its chunk.
        map.reactor3d.elevation[10 * 48 + 40] = 2;
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [2], 'cells 39..41, 9..11');
        settle();
        // A stroke of plants says where it was (they are changed in place); one that does not is everywhere.
        state.foliage = [{ x0: 20, y0: 36, x1: 21, y1: 37 }];
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), [7], 'cells 17..24, 33..40');
        assert.equal(state.foliage, null);
        settle();
        state.foliage = [null];
        assert.equal(passage.reconcile({}, state), true);
        assert.deepEqual(queued(), all);
        settle();
        // The tileset's flags changed in the Database: every cell is read again, with the new reader.
        const flagged = { passageTiles: () => ({ signature: 'flags-2', read: (x, y) => (x === 3 && y === 3 ? 15 : 0) }) };
        assert.equal(passage.reconcile(flagged, state), true);
        assert.deepEqual(queued(), all);
        settle();
        assert.equal(field.reachedAt(3, 3, 0), false, 'the shut tile is nobody\'s now');
        assert.equal(passage.reconcile(flagged, state), false);
        // A rock is one mass with the rocks beside it: two cells past its own are worked out again.
        map.reactor3d.pieces = map.reactor3d.pieces.concat([piece('rock', 30, 30, 0)]);
        assert.equal(passage.reconcile(flagged, state), true);
        assert.deepEqual(queued(), [4, 5, 7, 8], 'cells 27..33 each way, across four chunks');
        settle();
        // A long shape standing on ground that moved is worked out again from end to end.
        map.reactor3d.pieces = map.reactor3d.pieces.concat([piece('box', 30, 40, 0, { size: [9, 1, 1] })]);
        passage.reconcile(flagged, state);
        settle();
        map.reactor3d.terrain[40 * 49 + 30] = 0.5;
        assert.equal(passage.reconcile(flagged, state), true);
        assert.deepEqual(queued(), [7, 8], 'the corner\'s own cells lie in one chunk; the shape reaches into the next');
        settle();
        // The water: how a sheet looks moves nothing; one cell of its shore painted out is that cell, not the sheet's box.
        map.reactor3d.water = [Object.assign({}, map.reactor3d.water[0], { tint: '#3060a0', gloss: 0.4 })];
        assert.equal(passage.reconcile(flagged, state), false, 'a new color is no new water');
        const mask = map.reactor3d.water[0].mask.split('');
        mask[1 * 6 + 2] = '0';
        map.reactor3d.water = [Object.assign({}, map.reactor3d.water[0], { mask: mask.join('') })];
        assert.equal(passage.reconcile(flagged, state), true);
        assert.deepEqual(queued(), [2], 'cell 33,3 and those beside it: the third chunk, not the second with it');
        settle();
        // Raised a level, the sheet's whole box.
        map.reactor3d.water = [Object.assign({}, map.reactor3d.water[0], { level: 4 })];
        assert.equal(passage.reconcile(flagged, state), true);
        assert.deepEqual(queued(), [1, 2]);
        settle();
        assert.equal(passage.reconcile(flagged, state), false);
    } finally { global.Reactor3D = had; P.forgetEdges = forget; }
});

test('the pointer names what it is on: the place met, the floor under a roof, the cell of a wall, and why nobody stands there', () => {
    const P = P0, passage = Labels.passage, had = global.Reactor3D;
    global.Reactor3D = R;
    try {
        // The view's class says how level the face met lies (1 a floor's top, 0 a wall's face).
        class View { static faceUp(object) { return object ? object.up : 0; } }
        const unit = (x, y, z) => { const n = Math.hypot(x, y, z); return { x: x / n, y: y / n, z: z / n }; };
        // The pointer's ray from an eye to the point it met, and what the view's own pick named there.
        const pointing = (state, eye, at, up, tile) => {
            const ray = { origin: { x: eye[0], y: eye[1], z: eye[2] }, direction: unit(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]) };
            const hit = { point: { x: at[0], y: at[1], z: at[2] }, distance: Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]), object: { up }, triangle: 0 };
            return passage.pick(Object.assign(new View(), { raycastMapMeshes: () => hit, _raycaster: { ray } }), state, tile || null);
        };
        // Looking down at `pitch` degrees from the south on a point.
        const from = (at, pitch) => { const a = pitch * Math.PI / 180; return [at[0], at[1] + 12 * Math.sin(a), at[2] + 12 * Math.cos(a)]; };
        const said = found => (found.nobody ? Labels.noStandText(found.why) : found.place.sides.map(side => Labels.label(side)).join(' | '));
        const named = found => [found.x, found.y, Math.round(found.place.top * 10) / 10, found.nobody];
        const map = village(), state = { field: fieldOf(map, P).finish(), map };

        // On the ground, and on the upper floor over the room at 4,9: the place met, each time.
        let found = pointing(state, from([1.5, 0, 1.5], 40), [1.5, 0, 1.5], 1);
        assert.deepEqual([named(found), said(found)], [[1, 1, 0, false], 'Walk | Walk | Walk | Walk']);
        found = pointing(state, from([4.5, 5.1, 9.5], 40), [4.5, 5.1, 9.5], 1);
        assert.deepEqual(named(found), [4, 9, 5.1, false], 'the floor upstairs, not the room under it');
        assert.equal(Labels.text(found.place.sides.find(side => side.d === 6).option), 'Drop -5.1');
        // On the face of the wall beside the door (3,3), two tiles up, from a low camera whose ray runs on into the
        // yard behind: the wall's own cell, which is nobody's because the wall is in the way. Never the yard.
        found = pointing(state, [3.5, 3, 12.5], [3.5, 2, 4], 0);
        assert.deepEqual([named(found), said(found)], [[3, 3, 5, true], 'Nobody can stand here: Something in the way']);
        // On that wall's top: somewhere a body could stand that nothing leads to.
        found = pointing(state, from([3.5, 5, 3.5], 60), [3.5, 5, 3.5], 1);
        assert.deepEqual([named(found), said(found)], [[3, 3, 5, true], 'Nobody can stand here: No way to get here']);
        // The tower at 12,13: its top the same, and its side from a steep view (nothing behind it is named).
        found = pointing(state, from([12.5, 5, 13.5], 70), [12.5, 5, 13.5], 1);
        assert.deepEqual([named(found), said(found)], [[12, 13, 5, true], 'Nobody can stand here: No way to get here']);
        found = pointing(state, from([12.5, 2.5, 14], 70), [12.5, 2.5, 14], 0);
        assert.deepEqual([named(found), said(found)], [[12, 13, 5, true], 'Nobody can stand here: Something in the way']);
        // A fence, on its rail and at its foot: no room to stand.
        const rail = state.field.cell(6, 9)[0].top;
        found = pointing(state, from([6.5, rail, 9.5], 50), [6.5, rail, 9.5], 1);
        assert.deepEqual([found.x, found.y, said(found)], [6, 9, 'Nobody can stand here: No room to stand']);
        found = pointing(state, from([6.5, 0.05, 9.9], 50), [6.5, 0.05, 9.9], 1);
        assert.deepEqual([found.x, found.y, said(found)], [6, 9, 'Nobody can stand here: No room to stand']);
        // The wall the ladder leans on (2,9), pointed at half way up: its top is somewhere people get to, and is named.
        found = pointing(state, from([2.5, 2.5, 10], 30), [2.5, 2.5, 10], 0);
        assert.deepEqual(named(found).slice(0, 2).concat(found.nobody), [2, found.y, false]);
        assert.ok(found.place.reached);

        // Water: the view's own pick is the tile where the ray comes down through the surface (`level`); the marks
        // lie there, and that place is named though the ray met the bed two tiles on.
        found = pointing(state, [9.5, 9, 17.5], [9.5, 0, 8.5], 1, { x: 9, y: 11, lift: 3, level: 3 });
        assert.deepEqual([found.x, found.y, found.place.top, found.place.draw, found.nobody], [9, 11, 0, 3, false]);
        // A deck just over the water of the same cell: come down into the water beside it, the pointer is on the water.
        const jetty = village();
        jetty.reactor3d.pieces.push(piece('floor', 10, 11, 3));
        const moored = { field: fieldOf(jetty, P).finish(), map: jetty };
        assert.deepEqual(moored.field.cell(10, 11).map(place => [Math.round(place.top * 10) / 10, place.draw, place.reached]), [[0, 3, true], [3.1, 3.1, true]]);
        found = pointing(moored, [10.5, 9, 17.5], [10.5, 0, 8.5], 1, { x: 10, y: 11, lift: 3, level: 3 });
        assert.deepEqual([found.x, found.y, found.place.top], [10, 11, 0]);
        found = pointing(moored, from([10.5, 3.1, 11.5], 60), [10.5, 3.1, 11.5], 1);
        assert.equal(Math.round(found.place.top * 10) / 10, 3.1, 'and on the deck, the deck');
        // Met under the water with no such pick, the bed's own cell is the place (its marks lie on the water over it).
        found = pointing(state, from([9.5, 0, 11.5], 80), [9.5, 0, 11.5], 1);
        assert.deepEqual([found.x, found.y, found.place.draw], [9, 11, 3]);

        // Between two floors of one cell (the room at 4,9 and the floor over it), on the wall's face: the floor under
        // the point met, though the one overhead is nearer.
        found = pointing(state, [4.5, 5, 14], [4.5, 3.5, 9.99], 0);
        assert.deepEqual(named(found), [4, 9, 0, false]);

        // A roofed hall: floors a storey up that nobody gets onto, over the ground of cells 5..8 by 2..8.
        const roof = [];
        for (let y = 2; y <= 8; y++) for (let x = 5; x <= 8; x++) roof.push(piece('floor', x, y, 5));
        const house = mapOf(roof), room = { field: fieldOf(house, P).finish(), map: house };
        assert.equal(room.field.reachedAt(6, 7, 5.1), false);
        const over = [6.5, 5.1, 7.5];
        // Seen from steeply above, the floor shows through the roof: the pointer is on the mark it sees, a cell north.
        found = pointing(room, from(over, 75), over, 1);
        assert.deepEqual(named(found), [6, 6, 0, false], 'where the ray comes down to the floor');
        // From a slant no floor shows through, though the ray would come down to one five cells on: the floor under that piece of roof.
        found = pointing(room, from(over, 50), over, 1);
        assert.deepEqual(named(found), [6, 7, 0, false]);
        assert.deepEqual(named(passage.through(room, { origin: { x: 6.5, y: 5.1, z: 7.5 }, direction: unit(0, -Math.sin(50 * Math.PI / 180), -Math.cos(50 * Math.PI / 180)) }, 0)), [6, 3, 0, false], '(it is the slant that is refused, not the walk that fails)');
        // A wall's face is never looked through, however steep the view.
        found = pointing(room, from(over, 75), over, 0);
        assert.deepEqual(named(found), [6, 7, 0, false]);
        // Where the roof ends the ray is out in the open: the ground it would come down to out there is not named,
        // whether it leaves high over that ground or skims out just over it.
        found = pointing(room, from([6.5, 5.1, 2.3], 75), [6.5, 5.1, 2.3], 1);
        assert.deepEqual(named(found), [6, 2, 0, false]);
        found = pointing(room, from([6.5, 5.1, 3.267], 75), [6.5, 5.1, 3.267], 1);
        assert.deepEqual(named(found), [6, 3, 0, false]);
        // Past a yard between two roofs the ray is under another roof: the floor it comes down to there is not named either.
        const yard = mapOf(roof.filter(entry => entry.y !== 5).concat([0, 1].flatMap(y => [5, 6, 7, 8].map(x => piece('floor', x, y, 5)))));
        const pair = { field: fieldOf(yard, P).finish(), map: yard };
        found = pointing(pair, from([6.5, 5.1, 6.1], 55), [6.5, 5.1, 6.1], 1);
        assert.deepEqual(named(found), [6, 6, 0, false]);
        // A wall inside stops the look: the room beyond it is not named.
        const walled = mapOf(roof.concat(column(6, 6, 5).map(entry => Object.assign(entry, { id: 900 + entry.z }))));
        const parted = { field: fieldOf(walled, P).finish(), map: walled };
        // (A ray that would come down to the floor a cell past the wall: over 6,7 at 70 degrees, down at 6,5.)
        const before = [6.5, 5.1, 7.2], slant = unit(0, -Math.sin(70 * Math.PI / 180), -Math.cos(70 * Math.PI / 180));
        assert.deepEqual(named(passage.through(room, { origin: { x: 6.5, y: 5.1, z: 7.2 }, direction: slant }, 0)), [6, 5, 0, false], 'with no wall it is the floor beyond');
        found = pointing(parted, from(before, 70), before, 1);
        assert.deepEqual(named(found), [6, 7, 0, false]);
        assert.equal(passage.through(parted, { origin: { x: 6.5, y: 5.1, z: 7.2 }, direction: slant }, 0), null);
        // A tall roof, eleven tiles over its floor, seen from a slant: the words stay at the pointer and speak of the
        // roof (somewhere to stand that nothing leads to), not of a room far under it. Its wall's face, more than a
        // storey up, is something in the way; within a storey of the ground it is the tile at its foot.
        const tall = [];
        for (let y = 5; y <= 8; y++) for (let x = 5; x <= 8; x++) tall.push(piece('floor', x, y, 11));
        const hall = mapOf(tall.concat(column(9, 7, 11))), high = { field: fieldOf(hall, P).finish(), map: hall };
        found = pointing(high, from([6.5, 11.1, 7.5], 50), [6.5, 11.1, 7.5], 1);
        assert.deepEqual([named(found), said(found)], [[6, 7, 11.1, true], 'Nobody can stand here: No way to get here']);
        found = pointing(high, [14, 9, 7.5], [10.05, 8, 7.5], 0);
        assert.deepEqual([found.x, found.y, said(found)], [10, 7, 'Nobody can stand here: Something in the way']);
        found = pointing(high, [14, 4, 7.5], [10.05, 2.5, 7.5], 0);
        assert.deepEqual([named(found), Labels.text(found.place.sides.find(side => side.d === 4).option)], [[10, 7, 0, false], 'Blocked: Too high']);
        assert.equal(passage.through(room, { origin: { x: 6.5, y: 1, z: 7.5 }, direction: unit(0, 1, -1) }, 0), null, 'a ray going up comes down on nothing');

        // With nothing met at all the view's own tile is the answer; with no tile, nothing.
        found = passage.pick({ raycastMapMeshes: () => null, _raycaster: null }, state, { x: 1, y: 1, lift: 0 });
        assert.deepEqual(named(found), [1, 1, 0, false]);
        assert.equal(passage.pick({ raycastMapMeshes: () => null, _raycaster: null }, state, null), null);
        // The cell under the pointer is read once while the pointer stays on it and the field holds the same.
        const places = passage.cellOf(state, 4, 4);
        assert.equal(passage.cellOf(state, 4, 4), places);
        state.field.dirty(4, 4, 4, 4);
        assert.notEqual(passage.cellOf(state, 4, 4), places, 'and again once the field changed');
    } finally { global.Reactor3D = had; }
});

/**
 * A page, a renderer's classes and a 3D view, as far as the passage picture asks them: enough to drive
 * the picture for real and count what it holds. `leave()` puts every global back.
 */
function standIn(map, more) {
    const o = more || {};
    const counts = { observers: 0, materials: 0, made: 0, disposed: 0, renders: 0 };
    const size = o.size || [900, 700];
    let page = null;
    class Node {
        constructor(tag) {
            this.tag = tag; this.children = []; this.parentNode = null; this.attributes = {}; this.handlers = {}; this.hidden = false; this.className = ''; this.textContent = '';
            this.style = { setProperty(name, value) { this[name] = value; } };
            const names = new Set();
            this.classList = { names, toggle(name, on) { if (on) names.add(name); else names.delete(name); } };
        }
        appendChild(child) { if (child.parentNode) child.remove(); this.children.push(child); child.parentNode = this; return child; }
        append(...kids) { for (const kid of kids) this.appendChild(kid); }
        remove() { const from = this.parentNode; if (!from) return; from.children.splice(from.children.indexOf(this), 1); this.parentNode = null; for (const watcher of (from.watchers || []).slice()) watcher(); }
        get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node === page; }
        setAttribute(name, value) { this.attributes[name] = String(value); }
        addEventListener(type, handler) { (this.handlers[type] || (this.handlers[type] = [])).push(handler); }
        removeEventListener(type, handler) { const list = this.handlers[type] || [], at = list.indexOf(handler); if (at >= 0) list.splice(at, 1); }
        send(type) { for (const handler of (this.handlers[type] || []).slice()) handler({ stopPropagation() {} }); }
        listening() { return Object.keys(this.handlers).filter(type => this.handlers[type].length).sort(); }
        all(name, out = []) { for (const child of this.children) { if (String(child.className).split(' ').includes(name)) out.push(child); child.all(name, out); } return out; }
        querySelector(selector) { return this.all(selector.replace(/^\./, ''))[0] || null; }
        get said() { return this.children.length ? this.children.map(child => child.said).join(' ') : this.textContent; }
        // The legend lies where the stylesheet puts it; a label is as wide as what it says.
        get box() { return this.className === 'rr-passage-legend' ? (o.rtl ? [size[0] - 204, 10, 180, 160] : [10, 10, 180, 160]) : null; }
        get offsetWidth() { return this.hidden ? 0 : this.box ? this.box[2] : 14 + 7 * Math.max(...(this.children.length ? this.children.map(child => child.said.length) : [this.textContent.length])); }
        get offsetHeight() { return this.hidden ? 0 : this.box ? this.box[3] : 20 * Math.max(1, this.children.length); }
        get offsetLeft() { return this.box ? this.box[0] : 0; }
        get offsetTop() { return this.box ? this.box[1] : 0; }
        get clientWidth() { return size[0]; }
        get clientHeight() { return size[1]; }
        focus() { doc.activeElement = this; }
    }
    page = new Node('body');
    const container = page.appendChild(new Node('div')), surface = container.appendChild(new Node('div')), tick = new Node('input');
    const doc = { handlers: {}, activeElement: null, createElement: tag => new Node(tag), createElementNS: (space, tag) => new Node(tag),
        addEventListener(type, handler) { (this.handlers[type] || (this.handlers[type] = [])).push(handler); },
        removeEventListener(type, handler) { const list = this.handlers[type] || [], at = list.indexOf(handler); if (at >= 0) list.splice(at, 1); },
        send(type, detail) { for (const handler of (this.handlers[type] || []).slice()) handler({ detail }); },
        getElementById: id => (id === 'map-passage' ? tick : null), querySelector: selector => (selector === '.map-passage span' ? { textContent: 'Passage' } : null) };
    const win = {};
    const frames = new Map();
    let ids = 0;
    const camera = { layers: { on: new Set(), enable(n) { this.on.add(n); }, disable(n) { this.on.delete(n); } }, updateMatrixWorld() {}, projectionMatrix: {}, matrixWorldInverse: {},
        matrixWorld: { elements: new Float32Array(16) }, scale: 120, corner: [0, 0] };
    const THREE = {
        DoubleSide: 2, GreaterDepth: 6,
        Group: class { constructor() { this.children = []; this.userData = {}; this.visible = true; this.parent = null; } add(child) { this.children.push(child); child.parent = this; } remove(child) { const at = this.children.indexOf(child); if (at >= 0) this.children.splice(at, 1); child.parent = null; } },
        MeshBasicMaterial: class { constructor(options) { Object.assign(this, options); } dispose() { counts.materials++; } },
        BufferGeometry: class { constructor() { counts.made++; this.attributes = {}; this.index = null; } setAttribute(name, attribute) { this.attributes[name] = attribute; } setIndex(attribute) { this.index = attribute; } computeBoundingSphere() { this.boundingSphere = { clone() { return this; } }; } dispose() { counts.disposed++; } },
        BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } onUpload(release) { this.release = release; } },
        Mesh: class { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.userData = {}; this.layers = { set(n) { this.n = n; } }; } },
        Frustum: class { setFromProjectionMatrix() { return this; } intersectsBox() { return true; } },
        Matrix4: class { multiplyMatrices() { return this; } },
        Box3: class { constructor() { this.min = { set() {} }; this.max = { set() {} }; } },
        // Straight down on the map, north up: a tile is `scale` pixels, the view's corner at the tile `corner`.
        Vector3: class { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } project(eye) { const sx = (this.x - eye.corner[0]) * eye.scale, sy = (this.z - eye.corner[1]) * eye.scale; this.x = sx / size[0] * 2 - 1; this.y = 1 - sy / size[1] * 2; this.z = 0; return this; } }
    };
    const scene = new THREE.Group();
    class View {
        static faceUp(object) { return object ? object.up : 0; }
        snapshotBox() { return { marksShown: !!(this.passageGroup && this.passageGroup.visible), by: this }; }
    }
    const editor = Object.assign(new View(), { passageVisible: true, enabled: true, renderer: {}, camera, inputSurface: surface, view: { target: { x: 7, z: 7 } }, mapScene: { scene: () => scene },
        currentMap: () => map, requestRender() { counts.renders++; }, hit: null, tile: null, raycastMapMeshes() { return this.hit; }, _raycaster: { ray: null }, tileAt() { return this.tile; } });
    const system = { reactorPhysics: {}, reactorControls: {} };
    const database = { getSystem: () => system, mutationGeneration: 0 };
    const store = {};
    const set = { document: doc, THREE, Reactor3D: o.world || R, reactor: { databaseManager: database },
        requestAnimationFrame: work => { frames.set(++ids, work); return ids; }, cancelAnimationFrame: id => { frames.delete(id); },
        MutationObserver: class { constructor(work) { this.work = work; } observe(node) { counts.observers++; this.node = node; this.run = () => this.work(); (node.watchers || (node.watchers = [])).push(this.run); } disconnect() { if (!this.node) return; counts.observers--; this.node.watchers.splice(this.node.watchers.indexOf(this.run), 1); this.node = null; } },
        getComputedStyle: () => ({ getPropertyValue: () => '', direction: o.rtl ? 'rtl' : 'ltr' }),
        sessionStorage: { getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); } },
        addEventListener: (type, handler) => { (win[type] || (win[type] = [])).push(handler); },
        removeEventListener: (type, handler) => { const list = win[type] || [], at = list.indexOf(handler); if (at >= 0) list.splice(at, 1); },
        TilemapManager: { modelPlacements: () => (o.placements ? o.placements() : []) },
        MapEditor3D: { previewPageIndex: (mapData, event) => (o.previews && event.id in o.previews ? o.previews[event.id] : null) },
        RREventPreviewModels: { templateFor: (project, spec) => Promise.resolve(o.templates ? o.templates[spec.name] : null) } };
    const before = {};
    for (const name of Object.keys(set)) { before[name] = Object.getOwnPropertyDescriptor(globalThis, name); Object.defineProperty(globalThis, name, { value: set[name], configurable: true, writable: true }); }
    return {
        editor, surface, container, doc, win, tick, scene, camera, counts, frames, system, database, store, size,
        /** One turn of the page's frames: every one waiting now. */
        turn() { const now = Array.from(frames); frames.clear(); for (const [, work] of now) work(); },
        /** Frames until the picture has nothing left to work out. */
        settle() { for (let i = 0; i < 2000 && editor._passage3d && editor._passage3d.raf; i++) this.turn(); return editor._passage3d; },
        /** The pointer on a tile of the ground, seen straight down. */
        point(x, y, height = 0) { editor.hit = { point: { x: x + 0.5, y: height, z: y + 0.5 }, distance: 30, object: { up: 1 }, triangle: 0 }; editor._raycaster.ray = { origin: { x: x + 0.5, y: height + 30, z: y + 0.5 }, direction: { x: 0, y: -1, z: 0 } }; editor.tile = { x, y, lift: 0 }; Labels.hover(editor, 100, 100, editor.tile); },
        leave() {
            try { editor.passageVisible = false; Labels.passage.sync(editor); } finally {
                for (const name of Object.keys(set)) { if (before[name]) Object.defineProperty(globalThis, name, before[name]); else delete globalThis[name]; }
            }
        }
    };
}
/** Where a label was put: `[x, y, width, height]` in the view, or null while it is not shown. */
const boxOf = node => {
    if (node.hidden || node.style.visibility !== 'visible') return null;
    const at = /translate\((-?\d+)px, (-?\d+)px\)/.exec(node.style.transform || '');
    return at ? [Number(at[1]), Number(at[2]), node.offsetWidth, node.offsetHeight] : null;
};
const apart = (a, b) => a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1];
const moment = ms => new Promise(resolve => setTimeout(resolve, ms));

test('the picture comes up whole and goes whole: what it listens to, draws with and puts on the page is counted, and none of it is left', () => {
    const world = standIn(village());
    const { editor, surface, doc, win, scene, camera, counts } = world;
    try {
        assert.equal(Labels.passage.sync(editor), true);
        const state = editor._passage3d;
        assert.equal(Labels.on, true);
        // While it is up: one edit listener, one language listener, the pointer on the view's surface, one watch on the surface's place in the page.
        assert.deepEqual([doc.handlers['rr-map-edited'].length, win['rr-language-changed'].length, counts.observers], [1, 1, 1]);
        assert.deepEqual(surface.listening(), ['pointercancel', 'pointerdown', 'pointerenter', 'pointerleave', 'pointerup']);
        assert.equal(world.frames.size, 1, 'one frame asked for');
        assert.ok(camera.layers.on.has(Labels.passage.LAYER));
        assert.deepEqual(surface.children.map(child => child.className), ['rr-passage-layer']);
        world.settle();
        assert.equal(state.field.pending(), 0);
        assert.equal(world.frames.size, 0, 'no frame runs once the map is worked out');
        assert.ok(state.meshes.size > 0 && scene.children.length === 1 && scene.children[0].children.length >= state.meshes.size);
        assert.ok(scene.children[0].children.every(mesh => mesh.layers.n === Labels.passage.LAYER), 'on the layer only the view\'s camera has');
        assert.equal(surface.all('rr-passage-legend-row').length, 7);
        assert.equal(surface.all('rr-passage-legend-title')[0].textContent, 'Passage');
        // Called again with nothing changed, it adds nothing.
        Labels.passage.sync(editor);
        world.settle();
        assert.deepEqual([doc.handlers['rr-map-edited'].length, win['rr-language-changed'].length, counts.observers, surface.children.length, scene.children.length], [1, 1, 1, 1, 1]);
        assert.deepEqual(surface.listening().length, 5);
        // A saved structure's thumbnail (the view draws itself) is taken without the marks, and they are back after it.
        const picture = editor.snapshotBox({});
        assert.deepEqual([picture.marksShown, picture.by === editor, scene.children[0].visible], [false, true, true]);
        // Labels up, so their frame loop is running too.
        world.point(1, 1);
        assert.ok(state.labels.some(label => !label.hidden) && world.frames.size === 1);
        const made = counts.made;
        assert.ok(made >= state.meshes.size);
        // Off: everything goes.
        editor.passageVisible = false;
        assert.equal(Labels.passage.sync(editor), false);
        assert.equal(Labels.on, false);
        assert.equal(editor._passage3d, null);
        assert.deepEqual([doc.handlers['rr-map-edited'].length, win['rr-language-changed'].length, counts.observers], [0, 0, 0], 'the listeners and the watch');
        assert.deepEqual(surface.listening(), [], 'the surface\'s handlers');
        assert.equal(world.frames.size, 0, 'the frames, the labels\' among them');
        assert.deepEqual([surface.children.length, scene.children.length, editor.passageGroup], [0, 0, null], 'the page and the scene');
        assert.deepEqual([counts.disposed, counts.materials], [made, 2], 'every mesh\'s lists and both materials');
        assert.equal(camera.layers.on.has(Labels.passage.LAYER), false, 'the camera\'s layer');
        assert.equal(Object.prototype.hasOwnProperty.call(editor, 'snapshotBox'), false, 'the view\'s own thumbnail method');
        assert.equal(editor.snapshotBox({}).by, editor);
        // The 3D view switched off takes its surface out of the page: the picture goes with it, unasked.
        editor.passageVisible = true;
        Labels.passage.sync(editor);
        world.settle();
        editor.enabled = false;
        surface.remove();
        assert.equal(editor._passage3d, null);
        assert.equal(counts.observers, 0);
    } finally { world.leave(); }
});

test('the words keep inside the view and off one another: a label a side, or one label of four rows where the place is small or under the legend', () => {
    const world = standIn(village());
    const { editor, surface, camera, size } = world;
    try {
        Labels.passage.sync(editor);
        const state = world.settle();
        const labels = () => state.labels.map(boxOf).filter(Boolean), list = () => boxOf(state.list);
        const inside = box => box[0] >= 4 && box[1] >= 4 && box[0] + box[2] <= size[0] - 16 && box[1] + box[3] <= size[1] - 16;
        const legend = [10, 10, 180, 160];
        // A tile large on the screen, in the open: four labels, each opening away from the tile, none over another.
        camera.scale = 120; camera.corner = [1, 1];
        world.point(4, 5);
        let boxes = labels();
        assert.equal(boxes.length, 4);
        assert.equal(list(), null);
        assert.deepEqual(state.labels.map(label => label.textContent), ['Walk', 'Walk', 'Walk', 'Walk']);
        const middle = [(4.5 - 1) * 120, (5.5 - 1) * 120];
        assert.ok(boxes[0][1] + boxes[0][3] <= middle[1] && boxes[2][1] >= middle[1], 'north over the tile, south under it');
        assert.ok(boxes[1][0] >= middle[0] && boxes[3][0] + boxes[3][2] <= middle[0], 'east and west beside it');
        for (let i = 0; i < 4; i++) { assert.ok(inside(boxes[i])); for (let j = 0; j < i; j++) assert.ok(apart(boxes[i], boxes[j]), `labels ${i} and ${j}`); }
        // The same tile at the view's right and bottom edges: every label is still whole inside the view.
        camera.corner = [4.5 - (size[0] - 20) / 120, 5.5 - (size[1] - 20) / 120];
        world.point(4, 5);
        boxes = labels().concat(list() ? [list()] : []);
        assert.ok(boxes.length >= 1 && boxes.every(inside), JSON.stringify(boxes));
        for (let i = 0; i < boxes.length; i++) for (let j = 0; j < i; j++) assert.ok(apart(boxes[i], boxes[j]));
        // A tile small on the screen: one label of four rows, each led by an arrow the way its side lies, beside the tile.
        camera.scale = 14; camera.corner = [-20, -20];
        world.point(4, 5);
        assert.equal(labels().length, 0, 'not four labels stacked on one spot');
        const one = list();
        assert.ok(one && inside(one) && apart(one, legend));
        assert.deepEqual(state.rows.map(entry => entry.way.textContent + ' ' + entry.text.textContent), ['↑ Walk', '→ Walk', '↓ Walk', '← Walk']);
        // A tile under the legend: the words are put clear of it.
        camera.scale = 60; camera.corner = [0, 0];
        world.point(1, 1);
        boxes = labels().concat(list() ? [list()] : []);
        assert.ok(boxes.length >= 1 && boxes.every(box => inside(box) && apart(box, legend)), JSON.stringify(boxes));
        // The one label of a tile nobody stands on (the fence), under the legend as well.
        camera.scale = 20; camera.corner = [5, 8.4];
        world.point(6, 9, state.field.cell(6, 9)[0].top);
        assert.deepEqual(state.labels.filter(label => !label.hidden).map(label => label.textContent), ['Nobody can stand here: No room to stand']);
        boxes = labels();
        assert.ok(boxes.length === 1 && inside(boxes[0]) && apart(boxes[0], legend), JSON.stringify(boxes));
        // The pointer on the legend is on no tile: the last tile's words go, and their frame loop with them.
        surface.all('rr-passage-legend')[0].send('pointerenter');
        assert.ok(state.labels.every(label => label.hidden) && state.list.hidden);
        assert.equal(world.frames.size, 0);
        // The same tile asked again writes nothing anew; while labels show, one frame at a time keeps them on their tile.
        camera.scale = 120; camera.corner = [1, 1];
        world.point(4, 5);
        const written = state.hoverWorld, tick = state.tick;
        world.point(4, 5);
        assert.equal(state.hoverWorld, written);
        const was = boxOf(state.labels[0]);
        camera.matrixWorld.elements[12] = 5; camera.corner = [1.5, 1];
        world.turn();
        assert.equal(world.frames.size, 1);
        assert.equal(state.tick, tick, 'the same one function every frame');
        assert.equal(boxOf(state.labels[0])[0], was[0] - 60, 'the view moved half a tile: so did the label');
        // The legend is closed with its button: gone for the session, and the keyboard is back on the Passage tick.
        surface.all('rr-passage-legend-close')[0].send('click');
        assert.equal(surface.all('rr-passage-legend').length, 0);
        assert.equal(world.store['rr.passageLegend'], '0');
        assert.equal(world.doc.activeElement, world.tick);
        editor.passageVisible = false; Labels.passage.sync(editor);
        editor.passageVisible = true; Labels.passage.sync(editor);
        assert.equal(surface.all('rr-passage-legend').length, 0, 'still closed after the tick went off and on');
    } finally { world.leave(); }
});

test('where the line starts at the right the legend keeps clear of the view\'s scroll bar', () => {
    const world = standIn(village(), { rtl: true });
    try {
        Labels.passage.sync(world.editor);
        assert.ok(world.surface.children[0].classList.names.has('rr-passage-rtl'));
        const css = read('editor/css/styles.css');
        assert.match(css, /\.rr-passage-rtl \.rr-passage-legend \{ inset-inline-start: 24px; \}/);
        assert.match(css, /\.rr-passage-label \{[^}]*z-index: 2; \}/);
    } finally { world.leave(); }
    const plain = standIn(village());
    try { Labels.passage.sync(plain.editor); assert.equal(plain.surface.children[0].classList.names.has('rr-passage-rtl'), false); } finally { plain.leave(); }
});

test('bodies: a sized event by its first page, events walked through or under left out, a unit\'s model asked as a unit\'s, and one model moved changes its own tiles alone', async () => {
    const calls = [];
    const world3d = Object.create(R);
    // The game's body rule, standing in: a model covers its own tile, a unit's also the one its barrel is over.
    world3d.blockedTilesFor = (template, sidecar, spec, direction, x, y, unit) => { calls.push({ name: spec.name, x, y, unit: !!unit }); return unit ? [{ x, y }, { x, y: y - 1 }] : [{ x, y }]; };
    const page = (priorityType, through) => ({ priorityType, through: !!through, image: { direction: 2 } });
    const map = mapOf([], { eventSize: { 5: [3, 2], 6: [2, 2], 4: [1, 1] }, eventSizeAnchor: 'center' });
    map.events = [null,
        { id: 4, x: 1, y: 1, pages: [page(1)] },                                        // a size of one tile is no body of its own
        { id: 5, x: 4, y: 10, pages: [page(1), page(1, true)] },                        // sized, no Preview page chosen
        { id: 6, x: 9, y: 10, pages: [page(1, true)] },                                 // sized, walked through
        { id: 7, x: 10, y: 3, rrUnit: { enemy: 1 }, pages: [page(1)] },                 // a unit standing as a model
        { id: 8, x: 12, y: 3, note: '', pages: [page(1, true)] },                       // a model walked through
        { id: 9, x: 12, y: 6, note: '', pages: [page(0)] }];                            // a model under the characters
    const crate = { spec: { name: 'crate' }, direction: 2, x: 6, y: 6, z: 0, prop: {} };
    const placements = () => [crate].concat([7, 8, 9].map(id => { const event = map.events.find(entry => entry && entry.id === id); return { spec: { name: 'model' + id }, direction: 2, x: event.x, y: event.y, z: 0, event }; }));
    const template = { userData: { reactorSidecar: {} } };
    const world = standIn(map, { world: world3d, placements, previews: { 7: 0, 8: 0, 9: 0 }, templates: { crate: template, model7: template, model8: template, model9: template } });
    const { editor } = world;
    try {
        Labels.passage.sync(editor);
        await moment(0);
        const state = world.settle(), field = state.field;
        const taken = () => Array.from(field.bodies.keys(), key => [key % 65536, Math.floor(key / 65536)].join()).sort();
        assert.deepEqual(taken(), ['3,10', '3,11', '4,10', '4,11', '5,10', '5,11', '6,6', '10,3', '10,2'].sort(),
            'the sized event\'s three by two round its tile, the crate, the unit and the tile under its barrel');
        assert.deepEqual(calls.map(call => [call.name, call.unit]).sort(), [['crate', false], ['model7', true]], 'the unit is asked as a unit; the events walked through or under are not asked');
        assert.equal(field.sideAt(2, 10, 0, 6).reason, 'body');
        // Preview Event choosing the page it is walked through on takes the sized event out of the way.
        globalThis.MapEditor3D.previewPageIndex = (mapData, event) => ({ 5: 1, 7: 0, 8: 0, 9: 0 }[event.id] ?? null);
        Labels.passage.sync(editor);
        await moment(0);
        world.settle();
        assert.equal(taken().includes('4,10'), false);
        globalThis.MapEditor3D.previewPageIndex = (mapData, event) => ({ 7: 0, 8: 0, 9: 0 }[event.id] ?? null);
        Labels.passage.sync(editor);
        await moment(0);
        world.settle();
        assert.equal(taken().length, 9);
        // The crate carried two tiles in the view and let go: nothing tells the picture but the pointer coming up.
        calls.length = 0;
        field.counts.chunks = 0;
        const changed = [], setBodies = field.setBodies;
        field.setBodies = function(tiles) { const n = setBodies.call(this, tiles); changed.push(n); return n; };
        crate.x = 8;
        assert.equal(field.bodies.has(6 * 65536 + 6), true, 'not followed while it is carried');
        world.surface.send('pointerup');
        world.turn();
        await moment(0);
        world.settle();
        assert.deepEqual(taken().filter(tile => tile.endsWith(',6')), ['8,6'], 'its marks are where it is now');
        assert.deepEqual(changed, [2], 'one step: the tile it left and the tile it took, no other model\'s');
        assert.deepEqual(calls.map(call => call.name), ['crate'], 'only the model that moved is asked again');
        assert.equal(field.counts.chunks, 1, 'one chunk worked out again, not every chunk a model stands in');
        assert.equal(field.sideAt(7, 6, 0, 6).reason, 'body');
        assert.equal(field.sideAt(5, 6, 0, 6).kind, 'walk');
        // A pointer let go with nothing moved asks nothing.
        calls.length = 0; changed.length = 0;
        world.surface.send('pointerup');
        world.turn();
        await moment(0);
        assert.deepEqual([calls.length, changed.length], [0, 0]);
    } finally { world.leave(); }
});

test('the rules the map is judged by are followed: a change in the Database is seen when the pointer is back on the map, and with the next edit', () => {
    const world = standIn(village());
    const { editor, system, database } = world;
    try {
        Labels.passage.sync(editor);
        let state = world.settle();
        assert.equal(state.field.rules.hop, 2, 'a jump of a tile and a quarter and a step');
        assert.equal(state.field.sideAt(10, 2, 0, 6).kind, 'hop');
        const first = state.field;
        // Database, Controls, Physics: a lower jump, no mantling.
        system.reactorPhysics = { jumpHeight: 0.25, mantle: false };
        database.mutationGeneration++;
        world.point(1, 1);
        state = world.settle();
        assert.notEqual(state.field, first, 'the pointer moving over the map again found the new rules');
        assert.equal(state.field.rules.hop, 1);
        assert.equal(state.field.sideAt(10, 2, 0, 6).kind, 'blocked', 'two tiles up is out of a jump\'s reach now');
        assert.equal(state.field.sideAt(12, 3, 0, 8).kind, 'blocked', 'and nobody mantles');
        // A change that counted nowhere is still found as the pointer comes onto the map.
        const second = state.field;
        system.reactorPhysics = {};
        world.surface.send('pointerenter');
        state = world.settle();
        assert.notEqual(state.field, second);
        assert.equal(state.field.rules.hop, 2);
        // And an edit announced on the map looks at the rules too (the map's own physics, set in Map Properties).
        const third = state.field;
        editor.currentMap().reactor3d.physics = { jumpHeight: 3 };
        world.doc.send('rr-map-edited', {});
        state = world.settle();
        assert.notEqual(state.field, third);
        assert.equal(state.field.rules.hop, 3.75);
        // With nothing changed, none of the three makes anything anew.
        const kept = state.field;
        world.point(2, 2); world.surface.send('pointerenter'); world.doc.send('rr-map-edited', {});
        assert.equal(world.settle().field, kept);
    } finally { world.leave(); }
});

test('a stroke of edits: each one\'s chunks are worked out as it comes, what they reach is found once when the stroke rests, never in the slice that ran out of time', () => {
    const world = standIn(village());
    const { editor, doc } = world;
    // The picture's own clock, held here so that a slow machine is no stroke's rest.
    const clock = Labels.passage.now;
    let time = 1000;
    Labels.passage.now = () => time;
    try {
        Labels.passage.sync(editor);
        const state = world.settle(), field = state.field, map = editor.currentMap();
        const floods = field.counts.floods;
        // Three edits, each forty milliseconds after the last, as a brush drags.
        for (let i = 0; i < 3; i++) {
            time += 40;
            map.reactor3d.pieces = map.reactor3d.pieces.concat(column(1 + i, 12, 3));
            doc.send('rr-map-edited', { pieces: true });
            world.turn(); world.turn();
            assert.equal(field.sideAt(1 + i, 11, 0, 2).kind, 'mantle', 'the new crate is in the picture at once');
            assert.equal(field.counts.floods, floods, 'what is reached is not found afresh while the stroke goes on');
            assert.ok(field.pending() > 0 && state.raf, 'and the work is not forgotten');
        }
        time += Labels.passage.SETTLE_MS - 1;
        world.turn(); world.turn();
        assert.equal(field.counts.floods, floods, 'nor a moment short of its rest');
        time += 2;
        world.settle();
        assert.equal(field.counts.floods, floods + 1, 'once, when it rested');
        assert.equal(field.pending(), 0);
        assert.equal(world.frames.size, 0);
        // The field itself: the slice that finishes the last chunk with its time gone leaves the flood to the next.
        const alone = fieldOf(village(), P0, { size: 4 }).finish();
        const before = alone.counts.floods;
        alone.dirty(9, 1, 9, 1);
        let spent = 0;
        const late = () => (spent += 10);
        while (alone.left()) alone.work(4, null, late);
        assert.equal(alone.counts.floods, before, 'not in the slice that ran out of time');
        assert.equal(alone.pending(), 1, 'but it is still to do');
        alone.work(4, null, late);
        assert.deepEqual([alone.counts.floods, alone.pending()], [before + 1, 0]);
        // With time in hand it follows the last chunk in the same slice; held, it waits however long.
        alone.dirty(9, 1, 9, 1);
        alone.work(Infinity);
        assert.deepEqual([alone.counts.floods, alone.pending()], [before + 2, 0]);
        alone.dirty(9, 1, 9, 1);
        alone.hold = true;
        alone.work(Infinity); alone.work(Infinity);
        assert.deepEqual([alone.counts.floods, alone.pending()], [before + 2, 1]);
        alone.finish();
        assert.deepEqual([alone.counts.floods, alone.pending(), alone.hold], [before + 3, 0, false]);
    } finally { Labels.passage.now = clock; world.leave(); }
});
