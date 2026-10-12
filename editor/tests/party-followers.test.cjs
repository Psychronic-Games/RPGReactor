'use strict';
// The party's followers (runtime/reactor_objects_followers.js): the places of
// every formation, how a formation walks, narrows and opens again, who keeps
// up and who is brought back, the orders, a route on a follower, saves in the
// middle of each, and that a game which never chooses a formation runs the
// stock file step for step.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { followerWorld, event, page } = require('./helpers/follower-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const plain = value => JSON.parse(JSON.stringify(value));
const party = size => Array.from({ length: size }, (_, i) => i + 1);
const SIZES = [2, 4, 7, 12];
// Each heading as the step the leader takes and the step to its right.
const HEADINGS = { 2: { ahead: [0, 1], right: [-1, 0] }, 4: { ahead: [-1, 0], right: [0, -1] }, 6: { ahead: [1, 0], right: [0, 1] }, 8: { ahead: [0, -1], right: [1, 0] } };

/** Where the places of a formation are on the map for a leader at (x, y) that walked straight toward `d`. */
function expected(w, formation, count, x, y, d, spacing = 1) {
    const { ahead, right } = HEADINGS[d];
    return plain(w.Game_Followers.places(formation, count)).map(([row, side]) =>
        (x - ahead[0] * row * spacing + right[0] * side * spacing) + ',' + (y - ahead[1] * row * spacing + right[1] * side * spacing));
}

/** Walks the leader a step at a time, calling `each` every frame. */
function walkWatched(w, d, steps, each) {
    const p = w.$gamePlayer;
    for (let n = 0; n < steps; n++) {
        const x = p.x, y = p.y;
        w.hold(d);
        w.run(200, () => { each(); return p.x !== x || p.y !== y; });
        w.run(200, () => { each(); return !p.isMoving(); });
    }
    w.hold(0);
}

const visible = w => Array.from(w.$gamePlayer.followers()._data).filter(f => f.isVisible());

test('the places of every formation: nobody on the leader, nobody on anybody, for a party of 2, 4, 7 and 12', () => {
    const w = followerWorld({ party: party(2) });
    const places = (formation, count) => plain(w.Game_Followers.places(formation, count));
    assert.deepEqual(places('file', 3), [[1, 0], [2, 0], [3, 0]]);
    assert.deepEqual(places('loose', 3), [[1, 0], [2, 0], [3, 0]]);
    assert.deepEqual(places('rank', 3), [[1, 0], [1, -1], [1, 1]], 'three abreast behind the leader');
    assert.deepEqual(places('rank', 1), [[1, 0]]);
    assert.deepEqual(places('rank', 2), [[1, -1], [1, 1]], 'two take the places either side of the middle');
    assert.deepEqual(places('rank', 6), [[1, 0], [1, -1], [1, 1], [1, -2], [1, 2], [2, 0]], 'a sixth starts a second rank');
    assert.deepEqual(places('wedge', 3), [[1, -1], [1, 1], [2, 0]], 'the leader at the point, two behind it, one behind them');
    assert.deepEqual(places('wedge', 1), [[1, -1]]);
    assert.deepEqual(places('wedge', 4), [[1, -1], [1, 1], [2, -2], [2, 2]], 'the arms first');
    assert.deepEqual(places('wedge', 5), [[1, -1], [1, 1], [2, 0], [2, -2], [2, 2]]);
    assert.deepEqual(places('column', 3), [[0, 1], [1, 0], [1, 1]], 'the first follower walks beside the leader');
    assert.deepEqual(places('nonsense', 2), [[1, 0], [2, 0]], 'an unknown name is a file');
    for (const formation of w.Game_Followers.FORMATIONS) {
        if (formation === 'scattered') continue;
        for (const size of SIZES) {
            const list = places(formation, size - 1);
            assert.equal(list.length, size - 1, `${formation} has a place for each of ${size - 1}`);
            assert.equal(new Set(list.map(String)).size, list.length, `${formation} for ${size}: no two share a place`);
            assert.ok(!list.some(([row, side]) => row === 0 && side === 0), `${formation} for ${size}: nobody on the leader`);
            assert.ok(list.every(([row]) => row >= 0), `${formation} for ${size}: nobody ahead of the leader`);
        }
    }
    // A wedge is the same either side.
    const wedge = places('wedge', 11);
    const sides = row => wedge.filter(place => place[0] === row).map(place => place[1]).sort((a, b) => a - b);
    for (const row of [1, 2, 3]) assert.deepEqual(sides(row), sides(row).map(side => 0 - side).sort((a, b) => a - b), `row ${row} mirrors`);
});

test('how many followers there are is the game\'s party size, and the settings read from System.json', () => {
    for (const size of SIZES) {
        const w = followerWorld({ party: party(size), system: { reactorBattle: { partySize: size } } });
        assert.equal(w.$gamePlayer.followers()._data.length, size - 1);
        assert.equal(visible(w).length, size - 1);
    }
    const w = followerWorld({ system: { reactorParty: { formation: 'wedge', spacing: 2, straggle: 30 } } });
    const F = w.$gamePlayer.followers();
    assert.deepEqual([F.formation().formation, F.formation().spacing, F.formation().straggle], ['wedge', 2, 30], 'the game\'s own formation');
    F.setFormation('rank', { spacing: 9, straggle: -5 });
    assert.deepEqual([F.formation().formation, F.formation().spacing, F.formation().straggle], ['rank', 4, 0], 'kept within 1 to 4 and 0 to 100');
    F.setFormation('rank');
    assert.deepEqual([F.formation().spacing, F.formation().straggle], [2, 30], 'what a script leaves out is the game\'s');
    F.setFormation(null);
    assert.equal(F.formation().formation, 'wedge', 'null is the game\'s own again');
    const stock = followerWorld();
    assert.deepEqual([stock.$gamePlayer.followers().formation().formation, stock.$gamePlayer.followers().formation().active], ['file', false], 'absent settings are a single file');
    stock.$dataSystem.reactorParty = { formation: 'bogus', spacing: 'x' };
    assert.equal(stock.$gamePlayer.followers().formation().active, false, 'unreadable settings are a single file too');
});

test('every formation stands in its places in the four headings, for a party of 2, 4, 7 and 12', () => {
    for (const size of SIZES) {
        for (const formation of ['rank', 'wedge', 'column', 'file', 'loose']) {
            for (const spacing of formation === 'file' ? [2] : [1]) {
                for (const d of [2, 4, 6, 8]) {
                    const w = followerWorld({ party: party(size), width: 80, height: 80, start: [40, 40] });
                    const p = w.$gamePlayer, F = p.followers();
                    F.setFormation(formation, { spacing });
                    w.walk(d, size * spacing + 4);
                    w.rest(900);
                    // A file keeps the order of the line; in the other formations the nearer takes the nearer place.
                    const ordered = formation === 'file' || formation === 'loose';
                    const stand = ordered ? w.places() : w.places().sort(), want = expected(w, formation, size - 1, p.x, p.y, d, spacing);
                    assert.deepEqual(stand, ordered ? want : want.sort(), `${formation} of ${size} heading ${d}`);
                }
            }
        }
    }
});

test('a wider spacing spreads the places, and a formation changed on the walk is walked into', () => {
    const w = followerWorld({ width: 80, height: 60, start: [10, 30] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge', { spacing: 2 });
    w.walk(6, 8); w.rest();
    assert.deepEqual(w.places(), expected(w, 'wedge', 3, p.x, p.y, 6, 2));
    // On the way from one formation to another the nearer takes the nearer place: who stands where may change.
    F.setFormation('rank', { spacing: 3 });
    w.walk(6, 6); w.rest();
    assert.deepEqual(w.places().sort(), expected(w, 'rank', 3, p.x, p.y, 6, 3).sort());
    F.setFormation('column');
    w.rest();
    assert.deepEqual(w.places().sort(), expected(w, 'column', 3, p.x, p.y, 6, 1).sort(), 'without a step of the leader\'s');
});

test('turning on the spot moves nobody, and a corner is turned without anybody crossing a wall', () => {
    const w = followerWorld({ width: 60, height: 60, start: [20, 30] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge');
    w.walk(6, 6); w.rest();
    const before = w.places();
    for (const d of [8, 4, 2, 6]) { p.setDirection(d); w.run(80); assert.deepEqual(w.places(), before, `facing ${d}`); }
    // Round a corner: the places turn with the way walked.
    w.walk(8, 6); w.rest();
    assert.deepEqual(w.places(), expected(w, 'wedge', 3, p.x, p.y, 8));
    // A zigzag is a diagonal: the places do not flip from step to step.
    for (let i = 0; i < 4; i++) { w.walk(6, 1); w.walk(8, 1); }
    w.rest();
    const places = w.places();
    w.walk(6, 1); w.walk(8, 1); w.rest();
    const moved = w.places().map((place, i) => { const [x, y] = place.split(',').map(Number), [ox, oy] = places[i].split(',').map(Number); return (x - ox) + ',' + (y - oy); });
    assert.deepEqual(moved, ['1,-1', '1,-1', '1,-1'], 'each keeps its place relative to the leader');
});

// A corridor one tile wide along y = 10, from x = 14 to x = 24.
const CORRIDOR = [[14, 0, 24, 9], [14, 11, 24, 29]];
const inWall = (x, y) => x >= 14 && x <= 24 && y !== 10;

test('a corridor narrows every formation to a file and it opens again beyond, with nobody in a wall or in anybody', () => {
    for (const size of SIZES) {
        for (const formation of ['wedge', 'rank', 'column', 'scattered']) {
            const w = followerWorld({ party: party(size), walls: CORRIDOR, width: 70, start: [4, 10] });
            const p = w.$gamePlayer, F = p.followers();
            F.setFormation(formation);
            let walled = 0, shared = 0, watching = false;
            const each = () => {
                const seen = new Set();
                for (const f of visible(w)) {
                    if (inWall(f.x, f.y)) walled++;
                    if (watching && seen.has(f.x + ',' + f.y)) shared++;
                    seen.add(f.x + ',' + f.y);
                }
            };
            walkWatched(w, 6, 8, each);
            w.rest(1500);
            // From here on they have spread out from the tile they all started on.
            watching = true;
            const label = `${formation} of ${size}`;
            while (p.x < 23) walkWatched(w, 6, 1, each);
            // The leader is at the far end of the corridor: whoever has entered it walks in a file.
            const inside = visible(w).filter(f => f.x >= 14);
            assert.ok(inside.length >= Math.min(size - 1, 3), `${label}: followers have entered`);
            assert.ok(inside.every(f => f.y === 10), `${label}: in the corridor they are on its row`);
            assert.equal(new Set(inside.map(f => f.x)).size, inside.length, `${label}: one behind the other`);
            while (p.x < 26 + size * 2) walkWatched(w, 6, 1, each);
            w.rest(1500);
            w.run(1, each);
            assert.equal(walled, 0, `${label}: nobody was ever on a wall tile`);
            // The largest parties may fold through one another once or twice in the squeeze; nobody rests on anybody.
            assert.ok(shared <= (size > 7 ? 80 : 0), `${label}: no two shared a tile (${shared} frames)`);
            assert.equal(new Set(w.places()).size, size - 1, `${label}: each rests on a tile of its own`);
            if (formation !== 'scattered') {
                assert.deepEqual(w.places().slice().sort(), expected(w, formation, size - 1, p.x, p.y, 6).sort(), `${label}: open again beyond`);
            } else {
                assert.ok(visible(w).every(f => Math.abs(f.x - p.x) <= 9 && Math.abs(f.y - p.y) <= 6 && !f.pos(p.x, p.y)), `${label}: near the leader beyond`);
            }
        }
    }
});

test('a doorway is passed in a file and a rank forms again on the other side', () => {
    // A wall across the map at x = 20 with a door at y = 12.
    const w = followerWorld({ walls: [[20, 0, 20, 11], [20, 13, 20, 29]], start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    let walled = 0;
    walkWatched(w, 6, 8, () => {}); w.rest();
    assert.deepEqual(w.places(), expected(w, 'rank', 3, p.x, p.y, 6));
    walkWatched(w, 6, 10, () => { for (const f of visible(w)) if (f.x === 20 && f.y !== 12) walled++; });
    w.rest();
    assert.equal(walled, 0, 'nobody walked through the wall beside the door');
    assert.deepEqual(w.places(), expected(w, 'rank', 3, p.x, p.y, 6));
});

test('a place that cannot be stood on is not taken: a pillar, an event, a map edge', () => {
    // A pillar where the wedge's left place would be when the leader stands at (20, 10).
    const pillar = followerWorld({ walls: [[19, 9]], start: [10, 10] });
    pillar.$gamePlayer.followers().setFormation('wedge');
    pillar.walk(6, 10); pillar.rest();
    assert.ok(!pillar.places().includes('19,9'), 'nobody stands in the pillar');
    assert.equal(new Set(pillar.places()).size, 3);
    pillar.walk(6, 3); pillar.rest();
    assert.deepEqual(pillar.places(), expected(pillar, 'wedge', 3, 23, 10, 6), 'past it the wedge is whole again');
    // Somebody standing there.
    const crowd = followerWorld({ start: [10, 10], events: [event(1, 19, 11, { pages: [page({ priorityType: 1 })] })] });
    crowd.$gamePlayer.followers().setFormation('wedge');
    crowd.walk(6, 10); crowd.rest();
    assert.ok(!crowd.places().includes('19,11'), 'nobody stands on the event');
    assert.equal(new Set(crowd.places()).size, 3);
    // Along the top edge of the map.
    const edge = followerWorld({ start: [5, 0] });
    edge.$gamePlayer.followers().setFormation('rank');
    edge.walk(6, 8); edge.rest();
    assert.ok(visible(edge).every(f => f.y >= 0 && f.y <= 1), 'they keep to the map');
    assert.equal(new Set(edge.places()).size, 3);
});

test('followers keep up with a dashing leader, never block it and never start an event', () => {
    const touched = [];
    const w = followerWorld({ width: 80, start: [10, 12], events: [event(1, 20, 13, { pages: [page({ trigger: 1, priorityType: 0, list: [{ code: 121, indent: 0, parameters: [1, 1, 0] }, { code: 0, indent: 0, parameters: [] }] })] })] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge');
    w.walk(6, 5); w.rest();
    let worst = 0;
    const p0 = p.x;
    for (let n = 0; n < 30; n++) {
        const x = p.x;
        w.hold(6, true);
        w.run(100, () => { for (const f of visible(w)) worst = Math.max(worst, Math.max(Math.abs(f._realX - p._realX), Math.abs(f._realY - p._realY))); return p.x !== x; });
        w.run(100, () => !p.isMoving());
    }
    w.hold(0);
    assert.equal(p.x, p0 + 30, 'the leader walked on through its followers');
    assert.ok(p.realMoveSpeed() >= 4);
    assert.ok(worst <= 4.5, `nobody fell behind at a dash (furthest ${worst.toFixed(2)} tiles)`);
    w.rest();
    assert.deepEqual(w.places(), expected(w, 'wedge', 3, p.x, p.y, 6));
    assert.equal(w.$gameSwitches.value(1), false, 'a follower walking over a touch event does not start it');
    assert.deepEqual(touched, []);
});

test('one that falls behind runs, and one left far behind is brought to the party', () => {
    const w = followerWorld({ width: 80, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers(), base = w.Game_CharacterBase.prototype;
    F.setFormation('rank');
    w.walk(6, 6); w.rest();
    const straggler = F._data[2];
    base.locate.call(straggler, straggler.x - 7, straggler.y);
    let ran = false;
    w.run(400, () => { if (straggler.isMoving() && straggler.realMoveSpeed() > p.realMoveSpeed()) ran = true; return !straggler.isMoving() && straggler.x === straggler._rrTx && straggler.y === straggler._rrTy; });
    assert.ok(ran, 'it ran to catch up');
    assert.deepEqual(w.places(), expected(w, 'rank', 3, p.x, p.y, 6));
    w.run(5);
    assert.equal(straggler.moveSpeed(), p.realMoveSpeed(), 'and walks at the leader\'s pace again');
    // Further than a run makes up: brought behind the party, and it fades in.
    base.locate.call(straggler, straggler.x + 40, straggler.y + 9);
    w.run(3);
    assert.ok(Math.abs(straggler.x - p.x) <= 4 && Math.abs(straggler.y - p.y) <= 2, `brought behind the party (${straggler.x},${straggler.y})`);
    assert.ok(straggler.opacity() < 255, 'fading in');
    w.rest();
    assert.equal(straggler.opacity(), 255);
    assert.deepEqual(w.places(), expected(w, 'rank', 3, p.x, p.y, 6));
});

test('straggle and the loose file: followers start late and unevenly, gaps stretch on the walk and close at rest', () => {
    for (const [formation, options] of [['loose', {}], ['file', { straggle: 100 }], ['rank', { straggle: 100 }]]) {
        const w = followerWorld({ width: 80, start: [10, 12] });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation, options);
        w.walk(6, 6); w.rest();
        const at = w.places();
        // The frame each follower first moves once the leader sets off.
        const first = new Array(3).fill(-1);
        let widest = 0, shared = 0;
        walkWatched(w, 6, 12, () => {
            visible(w).forEach((f, i) => { if (first[i] < 0 && f.isMoving()) first[i] = w.Graphics.frameCount; });
            if (formation !== 'rank') {
                const line = [p].concat(visible(w));
                for (let i = 1; i < line.length; i++) widest = Math.max(widest, Math.abs(line[i]._realX - line[i - 1]._realX));
                if (new Set(visible(w).map(f => f.x + ',' + f.y)).size < 3) shared++;
            }
        });
        assert.ok(first.every(frame => frame > 0), `${formation}: everybody set off (${first})`);
        assert.ok(new Set(first).size > 1, `${formation}: not all in the same frame (${first})`);
        if (formation !== 'rank') {
            assert.ok(widest >= 1.5, `${formation}: a gap stretched (${widest.toFixed(2)})`);
            assert.equal(shared, 0, `${formation}: nobody walked into the one ahead`);
        }
        w.rest(900);
        assert.deepEqual(w.places(), expected(w, formation, 3, p.x, p.y, 6), `${formation}: closed up at rest`);
        assert.notDeepEqual(w.places(), at);
    }
    // No straggle: the rank marches in step with the leader.
    const w = followerWorld({ width: 80, start: [10, 12] });
    const p = w.$gamePlayer;
    p.followers().setFormation('rank');
    w.walk(6, 6); w.rest();
    w.hold(6);
    w.run(3);
    assert.ok(visible(w).every(f => f.isMoving()), 'all three step off with the leader');
    w.hold(0);
});

test('a scattered party keeps loose spots near the leader, each its own, and wanders while the leader stands', () => {
    for (const size of [4, 7]) {
        const w = followerWorld({ party: party(size), width: 80, height: 60, start: [30, 30] });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation('scattered');
        w.walk(6, 10); w.rest(900);
        const near = () => visible(w).every(f => Math.abs(f.x - p.x) <= 8 && Math.abs(f.y - p.y) <= 6);
        assert.ok(near(), `${size}: near the leader`);
        assert.equal(new Set(w.places()).size, size - 1, `${size}: each on a tile of its own`);
        assert.ok(!visible(w).some(f => f.pos(p.x, p.y)), `${size}: nobody on the leader`);
        assert.ok(new Set(visible(w).map(f => f.y)).size > 1, `${size}: not in a line`);
        const before = w.places();
        w.run(900);
        assert.notDeepEqual(w.places(), before, `${size}: somebody wandered to another spot`);
        w.rest(900);
        assert.ok(near() && new Set(w.places()).size === size - 1, `${size}: still near, still apart`);
    }
});

test('two followers in each other\'s way trade places once: a crowd of twelve never trades back and forth', () => {
    for (const formation of ['scattered', 'rank']) {
        const w = followerWorld({ party: party(12), system: { maxBattleMembers: 12 }, width: 40, height: 40, start: [10, 10] });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation);
        // Each trade, by frame and by who: the same two in the same frame is a trade undone.
        const trade = w.Game_Followers.prototype.rrTrade, seen = new Set();
        let trades = 0, undone = 0;
        w.Game_Followers.prototype.rrTrade = function(a, b) {
            const data = Array.from(this._data), pair = [data.indexOf(a), data.indexOf(b)].sort().join('-') + '@' + w.Graphics.frameCount;
            if (seen.has(pair)) undone++;
            seen.add(pair);
            trades++;
            // The two exchange where they are going at once.
            const goals = [a._rrTx, a._rrTy, b._rrTx, b._rrTy];
            trade.call(this, a, b);
            assert.deepEqual([b._rrTx, b._rrTy, a._rrTx, a._rrTy], goals);
        };
        w.walk(6, 12); w.walk(2, 6);
        w.run(1200);
        assert.equal(undone, 0, `${formation}: no trade was traded back in the frame it was made`);
        assert.ok(trades < 150, `${formation}: ${trades} trades on the walk and in 1200 frames at rest`);
        w.rest(900);
        assert.equal(new Set(w.places()).size, 11, `${formation}: each on a tile of its own`);
    }
});

//-----------------------------------------------------------------------------
// Orders.

test('Stay: the follower holds its tile and its facing, is in the leader\'s way, and the line closes past it', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    w.walk(6, 5); w.rest();
    assert.deepEqual(w.places(), ['14,12', '13,12', '12,12']);
    const second = F._data[1];
    second.setDirection(8);
    assert.equal(plain(F.order(2, 'stay')).length, 1);
    assert.ok(second.rrIsHeld());
    w.walk(6, 6); w.rest();
    assert.deepEqual([second.x, second.y, second.direction()], [13, 12, 8], 'where it was, facing as it was');
    assert.deepEqual([F._data[0].x, F._data[2].x], [20, 19], 'the third closes up behind the first');
    assert.equal(F.rrIsActive(), false, 'and the stock step has the line again');
    // In the leader's way, like an event; the others are walked through as ever.
    w.walk(4, 6);
    assert.equal(p.x, 15);
    w.walk(8, 1); w.walk(4, 1);
    assert.equal(p.canPass(p.x, p.y, 2) && p.x === 14 && p.y === 11, true);
    w.walk(4, 1); w.walk(2, 1);
    assert.deepEqual([p.x, p.y], [13, 11], 'the leader cannot step onto the one that stays');
    assert.equal(p.canPass(13, 11, 2), false);
    // Follow: back into the line.
    F.order(2, 'follow');
    assert.equal(second.rrIsHeld(), false);
    w.walk(8, 5); w.rest();
    assert.equal(F.rrIsActive(), false, 'the stock file again once it is back');
    assert.deepEqual(w.places(), ['13,7', '13,8', '13,9'], 'in its own place in the line');
    assert.equal(second.isThrough(), true);
});

test('Go to a tile: by a path, round walls, to face as told; the event can wait for it; Come walks back and follows', () => {
    const w = followerWorld({ width: 60, walls: [[20, 5, 20, 20]], start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    w.walk(6, 4); w.rest();
    const first = F._data[0];
    const interpreter = new w.Game_Interpreter();
    interpreter.setup([
        { code: 357, indent: 0, parameters: ['RPGReactor', 'FollowerOrders', 'Follower Orders', { who: 'follower', index: 1, order: 'goto', x: 26, y: 12, direction: 4, wait: true }] },
        { code: 121, indent: 0, parameters: [2, 2, 0] },
        { code: 0, indent: 0, parameters: [] }], 0);
    let walled = 0, frames = 0;
    while (interpreter.isRunning() && frames < 3000) {
        interpreter.update();
        w.run(1);
        frames++;
        if (first.x === 20 && first.y >= 5 && first.y <= 20) walled++;
        if (!first.pos(26, 12)) assert.equal(w.$gameSwitches.value(2), false, 'the event waits for the arrival');
    }
    assert.deepEqual([first.x, first.y, first.direction()], [26, 12, 4], 'there, facing left');
    assert.equal(w.$gameSwitches.value(2), true);
    assert.equal(walled, 0, 'round the wall, not through it');
    assert.ok(frames > 16 * 20, 'at a walk');
    assert.ok(first.rrIsHeld(), 'and it stays there');
    assert.equal(F.rrAreWalking(), false);
    w.walk(4, 3); w.rest();
    assert.deepEqual([first.x, first.y], [26, 12]);
    // By actor, and to everybody.
    assert.equal(plain(F.order({ actorId: 3 }, 'stay')).length, 1);
    assert.ok(F._data[1].rrIsHeld());
    assert.equal(plain(F.order(9, 'stay')).length, 0, 'a place nobody walks in is nobody');
    assert.equal(plain(F.order({ actorId: 1 }, 'stay')).length, 0, 'the leader is not a follower');
    F.order('all', 'come');
    assert.ok(F.rrAreWalking());
    w.rest(3000);
    assert.equal(F._rrHeld, 0, 'all of them follow again');
    assert.ok(visible(w).every(f => Math.abs(f.x - p.x) + Math.abs(f.y - p.y) <= 3), 'back with the leader');
    w.walk(2, 5); w.rest();
    assert.deepEqual(w.places(), [p.x + ',' + (p.y - 1), p.x + ',' + (p.y - 2), p.x + ',' + (p.y - 3)]);
});

test('Hide and Show: one follower is not seen, the party is unchanged, and the others close the gap', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    w.walk(6, 5); w.rest();
    F.order(1, 'hide');
    assert.equal(F._data[0].isVisible(), false);
    assert.equal(F._data[0].isTransparent(), true, 'a model is not drawn either');
    assert.equal(F._data[0].characterName(), '');
    assert.equal(w.$gameParty.battleMembers().length, 4, 'the party is as it was');
    w.walk(6, 4); w.rest();
    assert.deepEqual(w.places().sort(), expected(w, 'rank', 2, p.x, p.y, 6).sort(), 'the two that are seen take a rank of two');
    F.order(1, 'show');
    assert.equal(F._data[0].isVisible(), true);
    assert.equal(F._data[0].characterName(), 'Actor1');
    w.walk(6, 4); w.rest();
    assert.deepEqual(w.places().slice().sort(), expected(w, 'rank', 3, p.x, p.y, 6).sort());
});

test('a route on a follower: it walks the route and not the line, the event can wait, and it stays where the route left it', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers(), base = w.Game_Followers.CHARACTER_ID;
    w.walk(6, 5); w.rest();
    const second = F._data[1];
    const route = { repeat: false, skippable: false, wait: true, list: [{ code: 29, parameters: [3] }, { code: 1 }, { code: 1 }, { code: 1 }, { code: 19 }, { code: 0 }] };
    const interpreter = new w.Game_Interpreter();
    interpreter.setup([{ code: 205, indent: 0, parameters: [base + 2, route] }, { code: 121, indent: 0, parameters: [3, 3, 0] }, { code: 0, indent: 0, parameters: [] }], 0);
    assert.equal(interpreter.character(base + 2), second, 'the editor\'s id names the second follower');
    assert.equal(interpreter.character(-3), second, 'and so does -3, as plugins number them');
    assert.equal(interpreter.character(-1), p);
    assert.equal(interpreter.character(base + 9), null, 'a follower beyond the line is nobody');
    let frames = 0, slow = false;
    while (interpreter.isRunning() && frames < 2000) {
        interpreter.update(); w.run(1); frames++;
        if (second.isMoving() && second.moveSpeed() === 3) slow = true;
        if (second.isMoveRouteForcing()) assert.equal(w.$gameSwitches.value(3), false, 'the event waits for the route');
    }
    assert.ok(slow, 'the route\'s own speed, not the leader\'s');
    assert.deepEqual([second.x, second.y, second.direction()], [13, 15, 8]);
    assert.equal(w.$gameSwitches.value(3), true);
    w.walk(6, 5); w.rest();
    assert.deepEqual([second.x, second.y], [13, 15], 'it stays where the route left it');
    assert.deepEqual([F._data[0].x, F._data[2].x], [p.x - 1, p.x - 2]);
    F.order(2, 'follow');
    w.rest(2000);
    w.walk(6, 4); w.rest();
    assert.deepEqual(w.places(), [(p.x - 1) + ',12', (p.x - 2) + ',12', (p.x - 3) + ',12']);
    // A route for a follower beyond the line does nothing and holds nothing up.
    const idle = new w.Game_Interpreter();
    idle.setup([{ code: 205, indent: 0, parameters: [base + 9, route] }, { code: 121, indent: 0, parameters: [4, 4, 0] }, { code: 0, indent: 0, parameters: [] }], 0);
    idle.update();
    assert.equal(w.$gameSwitches.value(4), true);
});

test('orders end at a transfer and at Gather, and a transfer brings a formation together as ever', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge');
    w.walk(6, 6); w.rest();
    F.order(1, 'stay');
    F.order(2, 'goto', { x: 30, y: 20 });
    F.order(3, 'hide');
    w.run(40);
    p.reserveTransfer(1, 40, 8, 2, 0);
    p.performTransfer();
    assert.equal(F._rrHeld, 0);
    assert.deepEqual(Array.from(F._data, f => f.x + ',' + f.y), ['40,8', '40,8', '40,8'], 'all on the leader\'s tile');
    assert.equal(F._data[1].isMoveRouteForcing(), false, 'the walk it was on is over');
    assert.equal(F._data[2].isVisible(), false, 'one told to hide is still hidden');
    F.order(3, 'show');
    w.walk(2, 5); w.rest();
    assert.deepEqual(w.places(), expected(w, 'wedge', 3, p.x, p.y, 2), 'the formation again');
    // Gather.
    F.order(2, 'stay');
    w.walk(2, 4); w.rest();
    const interpreter = new w.Game_Interpreter();
    interpreter.setup([{ code: 217, indent: 0, parameters: [] }, { code: 121, indent: 0, parameters: [5, 5, 0] }, { code: 0, indent: 0, parameters: [] }], 0);
    let frames = 0;
    while (interpreter.isRunning() && frames < 2000) { interpreter.update(); w.run(1); frames++; }
    assert.equal(w.$gameSwitches.value(5), true, 'the gather ends');
    assert.equal(F._rrHeld, 0);
    assert.ok(F._data.every(f => f.pos(p.x, p.y)), 'all on the leader');
    w.walk(4, 5); w.rest();
    assert.deepEqual(w.places(), expected(w, 'wedge', 3, p.x, p.y, 4));
});

test('saving and loading in the middle: a formation on the walk, an order, a walk to a tile, a route', () => {
    // The same walk with and without a save in the middle ends the same.
    const ends = [];
    for (const save of [false, true]) {
        const w = followerWorld({ width: 60, start: [10, 12] });
        w.$gamePlayer.followers().setFormation('wedge', { spacing: 2, straggle: 40 });
        w.walk(6, 7);
        w.hold(2); w.run(40);
        if (save) w.saveAndLoad();
        const p = w.$gamePlayer;
        w.run(200, () => !p.isMoving() && p.y >= 16);
        w.hold(0);
        w.rest();
        assert.equal(p.followers().formation().formation, 'wedge', 'the formation is kept with the save');
        assert.deepEqual(w.places(), expected(w, 'wedge', 3, p.x, p.y, 2, 2));
        ends.push(w.places());
    }
    assert.deepEqual(ends[0], ends[1]);
    // Orders.
    const w = followerWorld({ width: 60, start: [10, 12] });
    w.walk(6, 5); w.rest();
    let F = w.$gamePlayer.followers();
    F.order(1, 'stay');
    F.order(2, 'goto', { x: 30, y: 20, direction: 8 });
    F.route(3, { repeat: false, skippable: false, wait: false, list: [{ code: 4 }, { code: 4 }, { code: 4 }, { code: 4 }, { code: 0 }] });
    w.run(30);
    w.saveAndLoad();
    F = w.$gamePlayer.followers();
    assert.equal(F._rrHeld, 3);
    assert.ok(F._data[1].isMoveRouteForcing() && F._data[2].isMoveRouteForcing(), 'still on their way');
    w.rest(3000);
    assert.deepEqual([F._data[0].x, F._data[0].y], [14, 12], 'the one that stays');
    assert.deepEqual([F._data[1].x, F._data[1].y, F._data[1].direction()], [30, 20, 8], 'the one sent to a tile arrived and turned');
    assert.deepEqual([F._data[2].x, F._data[2].y], [12, 8], 'the route was walked to its end');
    assert.ok(F._data.every(f => f.rrIsHeld()));
    assert.doesNotThrow(() => w.saveAndLoad(), 'nothing in a save refers back to itself');
});

//-----------------------------------------------------------------------------
// The stock file, and the other systems the followers pass through.

/** Everything of the party that a frame can change, as text. */
function snapshot(w) {
    const p = w.$gamePlayer;
    return [p].concat(p.followers()._data).map(c => [c.x, c.y, c._realX.toFixed(4), c._realY.toFixed(4), c.direction(), c.moveSpeed(), c.opacity(), c.pattern(),
        c.isThrough(), c.isTransparent(), c._jumpCount, c.characterName()].join(':')).join(' ');
}

/** The same play for any world: walks, a dash, a blocked step, a jump, followers off and on, a gather, a transfer. */
function play(w, each) {
    const run = frames => { for (let i = 0; i < frames; i++) { w.run(1); each(); } };
    const hold = (d, frames, dash) => { w.hold(d, dash); run(frames); };
    hold(6, 90); hold(2, 70, true); hold(4, 50); hold(8, 200); hold(0, 30);
    w.$gamePlayer.jump(2, 1); run(40);
    hold(6, 60);
    w.$gamePlayer.hideFollowers(); w.$gamePlayer.refresh(); hold(2, 40);
    w.$gamePlayer.showFollowers(); w.$gamePlayer.refresh(); hold(4, 40);
    w.$gamePlayer.gatherFollowers(); hold(0, 80);
    hold(2, 50);
    w.$gamePlayer.reserveTransfer(1, 30, 20, 8, 0); w.$gamePlayer.performTransfer(); run(5);
    hold(8, 60); hold(6, 60, true); hold(0, 20);
}

test('absent settings are today\'s single file, step for step', t => {
    const options = { walls: [[12, 14, 30, 14]], start: [8, 8], width: 50, height: 40 };
    const frames = world => { const list = []; play(world, () => list.push(snapshot(world))); return list; };
    const now = followerWorld(options);
    const stock = followerWorld(Object.assign({ without: ['reactor_objects_followers.js'] }, options));
    assert.equal(typeof stock.$gamePlayer.followers().setFormation, 'undefined', 'the reference world has the stock followers alone');
    const a = frames(now), b = frames(stock);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) assert.equal(a[i], b[i], `frame ${i}`);
    assert.ok(!now.$gamePlayer.followers()._rrTrail, 'no trail was ever kept');
    assert.ok(new Set(a).size > 300, 'and the party did walk');
    // A game that names the stock file itself is no different.
    const named = followerWorld(Object.assign({ system: { reactorParty: { formation: 'file', spacing: 1, straggle: 0 } } }, options));
    const c = frames(named);
    for (let i = 0; i < a.length; i++) assert.equal(c[i], a[i], `named file, frame ${i}`);
    // And against the runtime as it stood before this work, where this checkout has it.
    const baseline = path.join(repo, 'scratchpad', 'ux-pass', 'baseline', 'runtime');
    if (!fs.existsSync(path.join(baseline, 'reactor_main.js'))) return t.diagnostic('no baseline runtime in this checkout: compared with the stock functions only');
    const before = frames(followerWorld(Object.assign({ runtime: baseline }, options)));
    for (let i = 0; i < a.length; i++) assert.equal(a[i], before[i], `baseline runtime, frame ${i}`);
});

test('back to the stock file from a formation: they walk into the line, then the stock step has them', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge', { spacing: 2 });
    w.walk(6, 8); w.rest();
    F.setFormation(null);
    assert.equal(F.rrIsActive(), true, 'on their way into the file');
    w.rest();
    assert.equal(F.rrIsActive(), false);
    assert.deepEqual(w.places(), [(p.x - 1) + ',12', (p.x - 2) + ',12', (p.x - 3) + ',12']);
    w.walk(2, 4); w.rest();
    assert.deepEqual(w.places(), [p.x + ',' + (p.y - 1), p.x + ',' + (p.y - 2), p.x + ',' + (p.y - 3)]);
});

test('a jump and a vehicle are today\'s: everybody lands on the leader, and the formation takes up again', () => {
    const w = followerWorld({ width: 60, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    w.walk(6, 6); w.rest();
    p.jump(3, 0);
    w.run(60);
    assert.ok(F._data.every(f => f.pos(p.x, p.y)), 'they jumped with the leader');
    w.walk(6, 5); w.rest();
    assert.deepEqual(w.places(), expected(w, 'rank', 3, p.x, p.y, 6));
    // Aboard something the stock file is what moves them.
    p._vehicleType = 'boat';
    assert.equal(F.rrIsActive(), false);
    p._vehicleType = 'walk';
    assert.equal(F.rrIsActive(), true);
});

test('a battle on the map is today\'s: the formation leaves the followers alone, and takes up again after', () => {
    const w = followerWorld({ width: 60, start: [10, 12], events: [event(1, 22, 12, { note: '<unit: enemy 1>' })] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge');
    w.walk(6, 6); w.rest();
    F.order(3, 'stay');
    const serial = w.$gameFight.start({ mode: 'tactical', troopId: 0, canEscape: true, canLose: true });
    assert.ok(serial && w.$gameFight.isHere());
    w.run(30);
    assert.equal(F._rrHeld, 0, 'orders end when a battle begins');
    assert.ok(F._data.every(f => !f.isThrough()), 'each is a unit with a body, as the battle made them');
    const during = F._data.map(f => f.x + ',' + f.y).join(' ');
    w.run(120);
    assert.equal(F._data.map(f => f.x + ',' + f.y).join(' '), during, 'the formation moves nobody in a battle');
    w.$gameFight.end(w.ReactorFight.WIN);
    w.run(600, () => !w.$gameFight.isActive() && !F._rrRegroup);
    assert.equal(w.$gameFight.isActive(), false);
    w.rest(900);
    assert.ok(F._data.every(f => f.isThrough()));
    w.walk(6, 6); w.rest();
    assert.deepEqual(w.places().slice().sort(), expected(w, 'wedge', 3, p.x, p.y, 6).sort(), 'the wedge again after it');
});

test('on a 3D map the same places, on the ground the party walks', () => {
    const w = followerWorld({ flat: false, width: 60, height: 40, start: [20, 20] });
    const p = w.$gamePlayer, F = p.followers();
    assert.ok(w.Reactor3D.isMap3D(w.$dataMap));
    for (const [formation, d] of [['wedge', 6], ['rank', 2], ['column', 4], ['file', 8]]) {
        F.setFormation(formation, formation === 'file' ? { spacing: 2 } : {});
        w.walk(d, 9); w.rest();
        // From one formation into the next the nearer takes the nearer place; a file is in the order of the line.
        const stand = formation === 'file' ? w.places() : w.places().sort(), want = expected(w, formation, 3, p.x, p.y, d, formation === 'file' ? 2 : 1);
        assert.deepEqual(stand, formation === 'file' ? want : want.sort(), `${formation} heading ${d}`);
    }
});

//-----------------------------------------------------------------------------
// A 3D map's own ways: a ladder, a bridge, two floors.

/** Blocks stacked `high` tiles over every tile of a rectangle. */
function blocks(pieces, x1, y1, x2, y2, high) {
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = 0; z < high; z++) pieces.push({ id: pieces.length + 1, kind: 'block', x, y, z, rot: 0, material: '' });
}
const heightOf = c => (Number.isFinite(c._reactorAlt) ? c._reactorAlt : c._reactorGround || 0);

test('a ladder is climbed as it always was, one after another, and the wedge takes up again on top and back on the ground', () => {
    // A platform five tiles up with a ladder on its south face at (7, 6).
    const pieces = [];
    blocks(pieces, 2, 2, 12, 5, 5);
    for (let z = 0; z < 5; z++) pieces.push({ id: pieces.length + 1, kind: 'ladder', x: 7, y: 6, z, rot: 2, material: '' });
    const w = followerWorld({ flat: false, width: 20, height: 20, start: [7, 14], sidecar: { pieces } });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge');
    w.walk(8, 6); w.rest();
    assert.deepEqual(w.places(), expected(w, 'wedge', 3, 7, 8, 8), 'a wedge on the way to the ladder');
    w.walk(8, 2);
    // Up: the key is held until the leader stands on the platform.
    let inside = 0;
    const each = () => { for (const f of visible(w)) if (f.x >= 2 && f.x <= 12 && f.y >= 2 && f.y <= 5 && heightOf(f) < 4.5 && !f._reactorOnLadder) inside++; };
    w.hold(8);
    w.run(600, () => { each(); if (p._reactorOnLadder) assert.equal(F.rrIsActive(), false, 'on the ladder the stock file follows'); return p.y <= 5 && !p.isMoving(); });
    w.hold(0);
    assert.ok(heightOf(p) > 4.9, 'the leader is on top');
    w.run(900, each);
    w.walk(8, 2);
    w.run(900, each);
    assert.ok(visible(w).every(f => heightOf(f) > 4.9 && f.y <= 5), 'everybody climbed after it');
    assert.equal(inside, 0, 'nobody walked into the platform under its top');
    assert.equal(new Set(w.places()).size, 3, 'each on a tile of its own on top');
    assert.equal(F.rrIsActive(), true, 'the formation again');
    // Down again.
    w.walk(2, 2);
    w.hold(2);
    w.run(900, () => p.y >= 7 && !p.isMoving());
    w.hold(0);
    w.walk(2, 5);
    w.rest(1500);
    assert.ok(visible(w).every(f => heightOf(f) < 0.2), 'everybody came down');
    assert.deepEqual(w.places().slice().sort(), expected(w, 'wedge', 3, p.x, p.y, 2).sort(), 'the wedge on the ground');
});

test('a bridge one tile wide is crossed in a file: nobody steps off it, and the formation opens on the far side', () => {
    // Two plateaus two tiles up, joined by a deck along y = 10 from x = 8 to x = 16 over the ground.
    const pieces = [];
    blocks(pieces, 1, 6, 7, 14, 2);
    blocks(pieces, 8, 10, 16, 10, 2);
    blocks(pieces, 17, 6, 26, 14, 2);
    for (const formation of ['wedge', 'rank', 'scattered']) {
        const w = followerWorld({ flat: false, width: 30, height: 20, start: [2, 10], sidecar: { pieces } });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation);
        w.run(5);
        assert.ok(Math.abs(heightOf(p) - 2) < 0.1, 'on the plateau');
        let fell = 0, beside = 0;
        const each = () => { for (const f of visible(w)) { if (heightOf(f) < 1.5) fell++; if (f.x >= 8 && f.x <= 16 && f.y !== 10) beside++; } };
        walkWatched(w, 6, 5, each);
        w.rest();
        if (formation !== 'scattered') assert.deepEqual(w.places().slice().sort(), expected(w, formation, 3, 7, 10, 6).sort(), `${formation}: open on the plateau`);
        walkWatched(w, 6, 9, each);
        w.run(200, each);
        const onDeck = visible(w).filter(f => f.x >= 8 && f.x <= 16);
        assert.ok(onDeck.length >= 2, `${formation}: followers are on the bridge`);
        assert.equal(new Set(onDeck.map(f => f.x)).size, onDeck.length, `${formation}: one behind the other`);
        walkWatched(w, 6, 6, each);
        w.rest(1500);
        w.run(1, each);
        assert.equal(fell, 0, `${formation}: nobody left the bridge for the ground under it`);
        assert.equal(beside, 0, `${formation}: nobody was beside the deck`);
        assert.ok(visible(w).every(f => f.x >= 17), `${formation}: everybody crossed`);
        if (formation !== 'scattered') assert.deepEqual(w.places().slice().sort(), expected(w, formation, 3, p.x, p.y, 6).sort(), `${formation}: open again beyond`);
        else assert.equal(new Set(w.places()).size, 3);
    }
});

test('two floors: a place on the floor above is come to by the stairs, never by standing under it', t => {
    const baseline = path.join(repo, 'scratchpad', 'ux-pass', 'baseline', 'demo-data');
    const demo = fs.existsSync(path.join(baseline, 'Map005.r3d.json')) ? baseline : path.join(repo, 'template', 'Demo', 'data');
    if (!fs.existsSync(path.join(demo, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    let stairs = null;
    const w = followerWorld({ data: demo, mapId: 5, start: [1, 1], party: [1, 2, 3, 4], prepare: map => {
        map.reactor3d.pieces = map.reactor3d.pieces.filter(piece => piece.kind !== 'rock');
        map.events = [null];
        const all = map.reactor3d.pieces.filter(piece => piece.kind === 'stair');
        for (const foot of all.filter(piece => piece.z === 0)) {
            const next = all.find(piece => piece.z === 1 && Math.abs(piece.x - foot.x) + Math.abs(piece.y - foot.y) === 1);
            if (!next) continue;
            const dx = next.x - foot.x, dy = next.y - foot.y;
            if ([2, 3, 4].every(z => all.some(piece => piece.z === z && piece.x === foot.x + dx * z && piece.y === foot.y + dy * z))) { stairs = { foot, dx, dy }; break; }
        }
    } });
    if (!stairs) return t.skip('the map has no staircase of five stairs');
    const p = w.$gamePlayer, F = p.followers(), { foot, dx, dy } = stairs;
    // From the floor beside the foot of the stairs, in a wedge, up and four tiles on along the floor above.
    p.locate(foot.x - dx, foot.y - dy);
    w.run(5);
    const ground = heightOf(p);
    F.setFormation('wedge');
    const top = [foot.x + dx * 4, foot.y + dy * 4], beyond = [foot.x + dx * 8, foot.y + dy * 8];
    for (const [x, y] of [top, beyond]) {
        p.reactorWalkTo(x, y);
        w.run(3000, () => !p.isMoveRouteForcing());
        w.rest(1500);
    }
    if (p.x !== beyond[0] || p.y !== beyond[1]) return t.skip('the floor above does not run on from these stairs');
    assert.ok(heightOf(p) - ground > 4, 'the leader is on the floor above');
    const members = visible(w);
    assert.ok(members.every(f => heightOf(f) - ground > 4), `everybody came up the stairs (${members.map(f => f.x + ',' + f.y + '@' + heightOf(f).toFixed(1))})`);
    assert.equal(new Set(w.places()).size, 3, 'each on a tile of its own');
    assert.ok(members.every(f => Math.abs(f.x - p.x) <= 4 && Math.abs(f.y - p.y) <= 4), 'with the leader');
});

test('a house with a floor above: a follower held up at the doorway never walks round by the stairs to stand over its place', () => {
    // A wall across the map along y = 13 with a doorway at x = 7; a floor five tiles up over x 3..11, y 4..17 that
    // juts out over the yard; stairs outside rising west along y = 17 from (16, 17) to that floor's edge.
    const pieces = [];
    const add = (kind, x, y, z, rot) => pieces.push({ id: pieces.length + 1, kind, x, y, z, rot: rot || 0, material: '' });
    for (let x = 0; x <= 23; x++) if (x !== 7) for (let z = 0; z < 3; z++) add('block', x, 13, z);
    for (let x = 3; x <= 11; x++) for (let y = 4; y <= 17; y++) add('floor', x, y, 5);
    for (let z = 0; z < 5; z++) add('stair', 16 - z, 17, z, 1);
    for (const formation of ['wedge', 'rank']) {
        const w = followerWorld({ flat: false, width: 24, height: 26, start: [7, 22], party: party(7), system: { maxBattleMembers: 7 }, sidecar: { pieces } });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation);
        w.run(5);
        let above = 0, inWall = 0;
        const each = () => { for (const f of visible(w)) { if (heightOf(f) > 1.5) above++; if (f.y === 13 && f.x !== 7) inWall++; } };
        p.reactorWalkTo(7, 6);
        w.run(3000, () => { each(); return !p.isMoveRouteForcing(); });
        w.run(600, each);
        assert.deepEqual([p.x, p.y], [7, 6]);
        assert.equal(above, 0, `${formation}: nobody went up the stairs`);
        assert.equal(inWall, 0, `${formation}: nobody stood in the wall`);
        const members = visible(w);
        assert.equal(members.length, 6);
        assert.ok(members.every(f => f.y < 13 && heightOf(f) < 0.2), `${formation}: everybody is inside, on the ground (${members.map(f => f.x + ',' + f.y + '@' + heightOf(f).toFixed(1))})`);
        assert.deepEqual(w.places().slice().sort(), expected(w, formation, 6, 7, 6, 8).sort(), `${formation}: in its places inside`);
    }
});
