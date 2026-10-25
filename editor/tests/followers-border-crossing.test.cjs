'use strict';
// A party crossing into a neighboring map with no break (Reactor3D.Neighbors): the followers, the
// trail they walk and the places they head for move into the entered map's tiles with the leader,
// and those still past the border walk onto the map. Crossing north left every follower standing
// past the far edge for good (sweep 13, 2026-10-16).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { followerWorld } = require('./helpers/follower-world.cjs');

const visible = w => Array.from(w.$gamePlayer.followers()._data).filter(f => f.isVisible());

test('crossing north: the line keeps its shape in the new map and walks onto it', () => {
    const w = followerWorld({ width: 20, height: 15, start: [10, 12] });
    const p = w.$gamePlayer, followers = p.followers();
    w.walk(8, 8);
    w.rest();
    const before = visible(w).map(f => [f.x - p.x, f.y - p.y]);
    assert.ok(before.some(([, dy]) => dy > 0), 'the line stands behind the leader, to the south');
    // Over the border: what was row 4 is the entered map's bottom row; the line is past its far edge.
    const shift = 14 - p.y;
    p._y += shift; p._realY += shift;
    followers.rrShift(0, shift);
    assert.deepEqual(visible(w).map(f => [f.x - p.x, f.y - p.y]), before, 'nobody moved against the leader');
    assert.ok(visible(w).some(f => !w.$gameMap.isValid(f.x, f.y)), 'some stand past the edge');
    const trail = followers._rrTrail;
    if (trail) assert.ok(trail.y[trail.head] === p.y, 'the trail\'s newest tile is the leader\'s, in the new map\'s tiles');
    w.walk(8, 5);
    w.rest(900);
    for (const f of visible(w)) assert.ok(w.$gameMap.isValid(f.x, f.y), `follower at ${f.x},${f.y} is on the map`);
});

test('past the edge a follower steps only toward the map; on it, the map decides', () => {
    const w = followerWorld({ width: 20, height: 15, start: [10, 7] });
    const f = w.$gamePlayer.followers()._data[0];
    assert.equal(f.canPass(10, 17, 8), true, 'north, toward the map');
    assert.equal(f.canPass(10, 17, 2), false, 'south, further off');
    assert.equal(f.canPass(10, -2, 2), true);
    assert.equal(f.canPass(-1, 5, 4), false);
    assert.equal(f.canPass(10, 14, 2), false, 'on the map, off its edge is still closed');
});

test('the leader\'s border arrival moves the followers through rrShift', () => {
    const map = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_objects_map.js'), 'utf8');
    assert.match(map, /Game_Player\.prototype\.arriveByBorder = function[\s\S]{0,600}this\._followers\.rrShift\(-ox, -oy\);/);
});
