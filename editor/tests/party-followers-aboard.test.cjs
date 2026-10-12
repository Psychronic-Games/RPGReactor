'use strict';
// The followers while the party rides a vehicle that carries nobody but its
// rider (runtime/reactor_objects_followers.js, `Game_Followers.prototype.rrAboard`):
// they fade where they stand and are unseen, take no step and are no body
// until the party is on foot again, when they stand on the leader's tile. One
// under an order keeps its place, and Hide and Show are what they were.
const assert = require('node:assert/strict');
const test = require('node:test');
const { followerWorld } = require('./helpers/follower-world.cjs');

const party = size => Array.from({ length: size }, (_, i) => i + 1);
const tiles = list => Array.from(list, f => f.x + ',' + f.y).join(' ');
const FRAMES = 16;

/** A party of four that has walked eight tiles east, so the three followers stand in a file behind the leader. */
function walked(formation = null) {
    const w = followerWorld({ width: 60, height: 30, start: [10, 12], party: party(4) });
    const p = w.$gamePlayer, F = p.followers();
    if (formation) F.setFormation(formation);
    w.walk(6, 8); w.rest();
    return { w, p, F, line: Array.from(F._data) };
}

test('going aboard: each follower fades where it stands over 16 frames, then is unseen, no body, and takes no step', () => {
    for (const formation of [null, 'loose', 'wedge']) {
        const { w, p, F, line } = walked(formation), label = formation || 'stock file';
        assert.equal(Game_Followers_frames(w), FRAMES);
        const at = tiles(line);
        F.rrAboard(true);
        assert.equal(F._rrAboard, true);
        let last = 256;
        for (let frame = 1; frame < FRAMES; frame++) {
            w.run(1);
            for (const follower of line) {
                assert.equal(follower.isVisible(), true, `${label}: seen during the fade (frame ${frame})`);
                assert.ok(follower.opacity() < last, `${label}: fainter each frame`);
            }
            last = line[0].opacity();
        }
        w.run(1);
        for (const follower of line) {
            assert.equal(follower.isVisible(), false, `${label}: unseen from frame 16`);
            assert.equal(follower.isTransparent(), true, `${label}: and no model is drawn`);
        }
        assert.equal(tiles(line), at, `${label}: it faded where it stood`);
        assert.equal(F.rrMemberAt(line[0].x, line[0].y, null), false, `${label}: nobody stands there for the others`);
        assert.equal(F.rrFollowerAt(line[0].x, line[0].y, null), null);
        // The leader goes on: nobody comes after it.
        w.walk(6, 6); w.rest();
        assert.equal(tiles(line), at, `${label}: no step during the ride`);
        assert.equal(line.every(f => !f.isVisible()), true);
    }
});

test('back on foot: the followers stand on the leader\'s tile, fade in over 16 frames and follow again', () => {
    for (const formation of [null, 'loose']) {
        const { w, p, F, line } = walked(formation), label = formation || 'stock file';
        F.rrAboard(true);
        w.run(FRAMES);
        w.walk(6, 12); w.rest();
        p._reactorGround = 3;
        F.rrAboard(false);
        assert.equal(F._rrAboard, false);
        for (const follower of line) {
            assert.deepEqual([follower.x, follower.y, follower._realX, follower._realY], [p.x, p.y, p.x, p.y], `${label}: on the leader's tile`);
            assert.equal(follower._reactorGround, 3, `${label}: at its height`);
            assert.equal(follower.direction(), p.direction());
            assert.equal(follower.isVisible(), true);
            assert.equal(follower.opacity(), 0, `${label}: it does not flash at full strength first`);
        }
        let last = -1;
        for (let frame = 1; frame <= FRAMES; frame++) {
            w.run(1);
            assert.ok(line[0].opacity() > last, `${label}: clearer each frame`);
            last = line[0].opacity();
        }
        assert.equal(last, p.opacity());
        p._reactorGround = 0;
        for (const follower of line) follower._reactorGround = 0;
        w.walk(6, 5); w.rest();
        assert.equal(new Set(line.map(f => f.x + ',' + f.y)).size, 3, `${label}: each on a tile of its own again (${tiles(line)})`);
        assert.ok(line.every(f => f.x < p.x && Math.abs(f.x - p.x) <= 4 && Math.abs(f.y - p.y) <= 2), `${label}: behind the leader (${tiles(line)})`);
    }
});

test('at once: no fade either way, no order is ended, and the followers are placed without the party gathering', () => {
    const { w, p, F, line } = walked();
    F.order(1, 'stay');
    const held = line[0], at = [held.x, held.y];
    F.rrAboard(true, true);
    assert.equal(held.isVisible(), true, 'the one that stays is seen');
    assert.equal(line[1].isVisible(), false, 'the others are unseen in the frame of the call');
    assert.equal(line[2].isVisible(), false);
    w.walk(6, 9); w.rest();
    F.rrAboard(false, true);
    assert.equal(held.rrIsHeld(), true, 'its order stands');
    assert.deepEqual([held.x, held.y], at, 'and it was not brought back');
    for (const follower of line.slice(1)) {
        assert.deepEqual([follower.x, follower.y], [p.x, p.y]);
        assert.equal(follower.isVisible(), true);
        assert.equal(follower._rrAppear, 0, 'no fade');
    }
    w.run(1);
    assert.equal(line[1].opacity(), p.opacity());
});

test('a follower under an order is where it was, seen and solid, during the ride and after it; Hide and Show are what they were', () => {
    const { w, p, F, line } = walked();
    F.order(1, 'stay');
    F.order(3, 'hide');
    const held = line[0], hidden = line[2], at = [held.x, held.y];
    const shown = line.map(f => !!f._rrHidden);
    F.rrAboard(true);
    w.run(FRAMES + 4);
    assert.equal(held.isVisible(), true);
    assert.equal(F.rrHeldAt(at[0], at[1], null), true, 'a body for the leader');
    assert.equal(hidden.isVisible(), false);
    w.walk(6, 5); w.rest();
    assert.deepEqual([held.x, held.y], at);
    F.rrAboard(false);
    w.run(FRAMES);
    assert.equal(held.rrIsHeld(), true);
    assert.deepEqual([held.x, held.y], at, 'not brought back');
    assert.equal(held.isVisible(), true);
    assert.deepEqual(line.map(f => !!f._rrHidden), shown, 'what was hidden is hidden, what was shown is shown');
    assert.equal(hidden.isVisible(), false);
    assert.equal(line[1].isVisible(), true);
    F.order(3, 'show');
    assert.equal(hidden.isVisible(), true, 'and Show shows it as it always did');
});

test('a follower released from its order during the ride goes aboard with the others and comes back with them', () => {
    const { w, p, F, line } = walked();
    F.order(1, 'stay');
    const held = line[0];
    F.rrAboard(true);
    w.run(FRAMES);
    assert.equal(held.isVisible(), true);
    F.order(1, 'follow');
    w.rest(900);
    assert.equal(held.rrIsHeld(), false);
    w.run(FRAMES + 1);
    assert.equal(held.isVisible(), false, 'it fades like the rest once it is in the line again');
    w.walk(6, 4); w.rest();
    F.rrAboard(false, true);
    assert.deepEqual(line.map(f => [f.x, f.y]), line.map(() => [p.x, p.y]));
    assert.equal(line.every(f => f.isVisible()), true);
});

test('the leader\'s jump takes no follower that is aboard, and a save made aboard loads with them unseen', () => {
    const { w, p, F, line } = walked();
    F.rrAboard(true);
    w.run(FRAMES);
    const at = tiles(line);
    p.jump(3, 0);
    w.run(60, () => !p.isJumping());
    assert.equal(tiles(line), at, 'they did not jump after the leader');
    w.saveAndLoad();
    const loaded = w.$gamePlayer.followers();
    assert.equal(loaded._rrAboard, true);
    assert.equal(Array.from(loaded._data).every(f => !f.isVisible()), true, 'unseen after the load');
    w.run(5);
    assert.equal(tiles(loaded._data), at);
    loaded.rrAboard(false, true);
    assert.equal(Array.from(loaded._data).every(f => f.isVisible() && f.x === w.$gamePlayer.x && f.y === w.$gamePlayer.y), true);
});

test('called twice either way it does nothing new, and a game that never rides is the game it was', () => {
    const { w, p, F, line } = walked();
    const before = tiles(line);
    F.rrAboard(false, true);
    assert.equal(tiles(line), before, 'back on foot when nobody was aboard moves nobody');
    F.rrAboard(true);
    w.run(6);
    const faint = line[0].opacity();
    F.rrAboard(true);
    assert.equal(line[0]._rrLeave, FRAMES - 6, 'the fade is not begun again');
    assert.equal(line[0].opacity(), faint);
    const plain = walked();
    plain.w.walk(2, 4); plain.w.rest();
    assert.equal(plain.line.every(f => f.isVisible() && f.opacity() === plain.p.opacity() && !f._rrAboard && !f._rrLeave), true);
});

function Game_Followers_frames(w) {
    return w.Game_Followers.APPEAR_FRAMES;
}
