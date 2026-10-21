'use strict';
// The followers' trail, part by part (runtime/reactor_objects_followers.js):
// each rule that keeps a formation right at a ledge, where the leader turns
// back, behind a long wall, round an event and after a battle on the map has
// a test here that fails without that one rule.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { followerWorld, event, page } = require('./helpers/follower-world.cjs');

const party = size => Array.from({ length: size }, (_, i) => i + 1);
const visible = w => Array.from(w.$gamePlayer.followers()._data).filter(f => f.isVisible());
const heightOf = c => (Number.isFinite(c._reactorAlt) ? c._reactorAlt : c._reactorGround || 0);
const inPlace = f => f.x === f._rrTx && f.y === f._rrTy;
const tiles = list => Array.from(list, f => f.x + ',' + f.y).join(' ');
const still = (id, x, y) => event(id, x, y, { pages: [page({ priorityType: 1 })] });

/** Runs until every follower that is seen stands still in the place it was given (or `limit` frames); `each` is called every frame. */
function settle(w, limit = 900, each = null) {
    const p = w.$gamePlayer;
    return w.run(limit, () => { if (each) each(); return !p.isMoving() && visible(w).every(f => !f.isMoving() && !f.isMoveRouteForcing() && inPlace(f)); });
}

/** A plateau `high` tiles up over x 2..9, y 3..15 with the party on it, four tiles on its way east along y = 9. */
function plateau(high, size, formation, options = {}, extra = []) {
    const pieces = [];
    for (let x = 2; x <= 9; x++) for (let y = 3; y <= 15; y++) for (let z = 0; z < high; z++) pieces.push({ id: pieces.length + 1, kind: 'block', x, y, z, rot: 0, material: '' });
    for (const [x, y, z] of extra) pieces.push({ id: pieces.length + 1, kind: 'block', x, y, z, rot: 0, material: '' });
    const w = followerWorld({ flat: false, width: 30, height: 20, start: [4, 9], party: party(size), system: { maxBattleMembers: Math.max(4, size) }, sidecar: { pieces } });
    w.$gamePlayer.followers().setFormation(formation, options);
    w.run(5);
    w.walk(6, 4);
    settle(w);
    return w;
}

/** The leader walks off the plateau's east edge and on to x = `to`; `each` is called every frame until the party rests below. */
function dropOff(w, to, each = null) {
    const p = w.$gamePlayer;
    w.hold(6);
    w.run(900, () => { if (each) each(); return p.x >= to && !p.isMoving(); });
    w.hold(0);
    return settle(w, 1500, each);
}

//-----------------------------------------------------------------------------
// A ledge the leader drops off.

test('down a ledge one tile and two tiles high: nobody goes back up it, nobody steps while it falls, and the trail keeps the ground under the leader', () => {
    for (const [high, size, formation] of [[1, 7, 'wedge'], [1, 7, 'rank'], [2, 7, 'wedge'], [2, 7, 'rank'], [2, 4, 'column']]) {
        const w = plateau(high, size, formation);
        const p = w.$gamePlayer, F = p.followers(), label = `${formation} of ${size}, a ledge ${high} high`;
        const down = new Set(), last = new Map();
        let backUp = 0, airSteps = 0;
        const took = dropOff(w, 16, () => {
            for (const f of visible(w)) {
                const air = w.ReactorPhysics.isAirborne(f), key = f.x + ',' + f.y;
                if (f.x >= 10 && heightOf(f) < 0.2 && !air) down.add(f);
                else if (down.has(f) && !air && (f.x <= 9 || heightOf(f) > 0.6)) { backUp++; down.delete(f); }
                if (air && last.has(f) && last.get(f) !== key) airSteps++;
                last.set(f, key);
            }
        });
        assert.ok(took < 1500, `${label}: the party came to rest below`);
        assert.equal(backUp, 0, `${label}: nobody that had come down went back up after the one ahead of it in the line`);
        assert.equal(airSteps, 0, `${label}: nobody took a step while it fell`);
        assert.ok(visible(w).every(f => f.x >= 10 && heightOf(f) < 0.2), `${label}: everybody is below`);
        // The way the leader took, below the ledge: at the height of the ground there, not of the leader in the air over it.
        const trail = F._rrTrail, inAir = [];
        for (let back = 0; back < trail.n; back++) {
            const at = (trail.head - back + trail.cap * 2) % trail.cap;
            if (trail.x[at] >= 10 && trail.h[at] > 0.3) inAir.push(trail.x[at] + ',' + trail.y[at] + '@' + trail.h[at].toFixed(1));
        }
        assert.deepEqual(inAir, [], `${label}: the trail below the ledge lies on the ground`);
    }
});

test('places that move back up a ledge are not walked to up its face, and the followers held up below do not stand in each other', () => {
    for (const high of [1, 2]) {
        const w = plateau(high, 7, 'file', { spacing: 1, straggle: 1 });
        const p = w.$gamePlayer, F = p.followers(), label = `a ledge ${high} high`;
        dropOff(w, 15);
        // The last to step off is still in the air when the file stands.
        w.run(60);
        const below = visible(w).filter(f => f.x >= 10 && heightOf(f) < 0.2);
        assert.ok(below.length >= 5, `${label}: the file is below (${tiles(visible(w))})`);
        // A wider spacing: the places lie further back along the way the leader took, most of them on top again.
        F.setFormation('file', { spacing: 3 });
        let up = 0;
        w.run(600, () => { for (const f of below) if (f.x <= 9 || heightOf(f) > 0.6) up++; return false; });
        assert.ok(visible(w).some(f => f._rrTx <= 9), `${label}: places are on top`);
        assert.equal(up, 0, `${label}: nobody went back up the face of the ledge`);
        assert.equal(new Set(below.map(f => f.x + ',' + f.y)).size, below.length, `${label}: each of them on a tile of its own (${tiles(below)})`);
        // The leader walks on: the places come down to them and the file takes its spacing.
        w.walk(6, 12);
        assert.ok(settle(w, 1500) < 1500, `${label}: at rest again`);
        assert.deepEqual(visible(w).map(f => f.x), [1, 2, 3, 4, 5, 6].map(n => p.x - n * 3), `${label}: three tiles apart`);
    }
});

test('a follower left on top behind a wall walks to the edge the leader dropped off, on its own level, and comes down after it', () => {
    // A wall on the plateau along y = 7, x 5..9: from north of it the way to the edge at (9, 9) goes round its west end.
    const wall = [];
    for (let x = 5; x <= 9; x++) for (let z = 2; z < 5; z++) wall.push([x, 7, z]);
    const w = plateau(2, 4, 'wedge', {}, wall);
    const p = w.$gamePlayer, F = p.followers(), first = F._data[0];
    dropOff(w, 16);
    assert.ok(visible(w).every(f => heightOf(f) < 0.2), 'the party is below');
    first.locate(8, 5);
    first._reactorGround = 2;
    if (Number.isFinite(first._reactorAlt)) first._reactorAlt = 2;
    w.run(3);
    assert.ok(heightOf(first) > 1.9 && first.y < 7, 'one follower is on top again, north of the wall');
    let inWall = 0;
    const took = w.run(900, () => { if (first.y === 7 && first.x >= 5 && first.x <= 9) inWall++; return !first.isMoving() && !first.isMoveRouteForcing() && inPlace(first) && heightOf(first) < 0.2; });
    assert.ok(took < 900, `it came down to its place (it stands at ${first.x},${first.y} at ${heightOf(first).toFixed(1)})`);
    assert.equal(inWall, 0, 'round the wall, not through it');
});

test('a follower back where a walk of its own once began is not kept waiting by that walk: in its place, the walk was forgotten', () => {
    const w = plateau(2, 4, 'wedge');
    const p = w.$gamePlayer, F = p.followers(), first = F._data[0];
    dropOff(w, 16);
    w.run(60);
    assert.ok(visible(w).every(f => heightOf(f) < 0.2 && inPlace(f)), 'the party is below, each in its place');
    // On top again beside the edge, in the row of its place below: the row it came down from.
    const row = first._rrTy === 9 ? 8 : first._rrTy;
    first.locate(8, row);
    first._reactorGround = 2;
    if (Number.isFinite(first._reactorAlt)) first._reactorAlt = 2;
    const took = w.run(600, () => !first.isMoving() && !first.isMoveRouteForcing() && inPlace(first) && heightOf(first) < 0.2);
    assert.ok(took < 300, `it came down again without the wait a walk that gets nowhere earns (${took} frames; it stands at ${first.x},${first.y})`);
});

//-----------------------------------------------------------------------------
// A long way round, an event in a place, the leader turning back.

test('a follower parted from the party walks round by a way of its own of at most so many steps, and stands where the way is longer', () => {
    // A wall along y = 13, `half` tiles to each side of the leader's column; a follower is put behind it.
    const most = 24;
    for (const [half, walks] of [[10, true], [12, false]]) {
        const w = followerWorld({ width: 60, height: 30, start: [10, 12], walls: [[20 - half, 13, 20 + half, 13]] });
        const p = w.$gamePlayer, F = p.followers(), label = `a wall of ${half * 2 + 1}`;
        assert.equal(w.Game_Followers.WALK_MOST, most);
        F.setFormation('wedge');
        w.walk(6, 10);
        settle(w);
        const follower = F._data[2];
        follower.locate(20, 15);
        let north = 0, far = 0;
        w.run(900, () => { if (follower.y < 13) north++; far = Math.max(far, Math.abs(follower.x - 20) + Math.abs(follower.y - 15)); return false; });
        if (walks) {
            // Round the nearer end: 2 * (half + 1) + 3 steps or so, within the bound.
            assert.ok(inPlace(follower) && follower.y < 13, `${label}: it walked round and stands in its place (${follower.x},${follower.y})`);
        } else {
            assert.equal(north, 0, `${label}: it did not take the long way round`);
            assert.ok(far <= 3, `${label}: it stands where it was parted from the party (${far} tiles off at the most)`);
            // The leader walks on, away from the wall: left far enough behind, the follower is brought to the party.
            w.walk(8, 10); w.walk(4, 12);
            settle(w, 1500);
            assert.ok(Math.abs(follower.x - p.x) + Math.abs(follower.y - p.y) <= 4, `${label}: with the party again (${follower.x},${follower.y}; the leader ${p.x},${p.y})`);
        }
    }
});

test('a place under an event is nobody\'s place: the formation stands round it at once', () => {
    // The event stands where a place of the formation falls when the leader stops at (20, 12).
    for (const [formation, spot] of [['wedge', [19, 11]], ['rank', [19, 13]], ['column', [20, 13]]]) {
        const w = followerWorld({ width: 60, height: 30, start: [10, 12], events: [still(1, spot[0], spot[1])] });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation);
        let given = 0;
        const each = () => { for (const f of visible(w)) if (f._rrTx === spot[0] && f._rrTy === spot[1]) given++; };
        for (let n = 0; n < 10; n++) { const x = p.x; w.hold(6); w.run(200, () => { each(); return p.x !== x; }); w.run(200, () => { each(); return !p.isMoving(); }); }
        w.hold(0);
        const took = settle(w, 600, each);
        assert.equal(given, 0, `${formation}: the event's tile was never handed out`);
        assert.ok(took < 30, `${formation}: at rest at once (${took} frames)`);
        assert.equal(new Set(w.places()).size, 3);
    }
});

test('where the leader turns back, a follower takes the short way at the crossing, not out to the turning point and back', () => {
    // One follower that lets the leader get ahead: the leader walks back past it, and its place is behind the leader again.
    for (const [formation, options, back, steps] of [['rank', { straggle: 100 }, 3, 1], ['file', { spacing: 2, straggle: 60 }, 2, 2]]) {
        const w = followerWorld({ width: 70, height: 40, start: [20, 20], party: party(2) });
        const p = w.$gamePlayer, F = p.followers(), follower = F._data[0];
        F.setFormation(formation, options);
        w.walk(6, 14);
        w.rest();
        let taken = 0, last = follower.x + ',' + follower.y, east = follower.x;
        const each = () => { const k = follower.x + ',' + follower.y; if (k !== last) { taken++; last = k; } east = Math.max(east, follower.x); };
        const turn = p.x, stood = follower.x;
        for (let n = 0; n < back; n++) { const x = p.x; w.hold(4); w.run(200, () => { each(); return p.x !== x; }); w.run(200, () => { each(); return !p.isMoving(); }); }
        if (formation === 'file') for (let n = 0; n < 2; n++) { const x = p.x; w.hold(6); w.run(200, () => { each(); return p.x !== x; }); w.run(200, () => { each(); return !p.isMoving(); }); }
        w.hold(0);
        w.run(600, () => { each(); return false; });
        const label = `${formation} ${JSON.stringify(options)}`;
        assert.equal(taken, steps, `${label}: ${steps} step(s) to its place (it took ${taken})`);
        assert.ok(east < turn, `${label}: it did not walk out to where the leader turned (x ${turn}; it went as far as ${east} from ${stood})`);
        assert.ok(inPlace(follower));
    }
});

test('a follower is looked for on the trail nearest the tile named, where the trail crosses itself', () => {
    const w = followerWorld({ width: 60, height: 30, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers(), follower = F._data[2];
    F.setFormation('wedge');
    // East to x = 24 and back to x = 19: the tiles 19 to 23 of row 12 are on the trail twice.
    w.walk(6, 14); w.walk(4, 5);
    settle(w);
    const trail = F._rrTrail, tileAt = back => { const at = (trail.head - back + trail.cap * 2) % trail.cap; return trail.x[at] + ',' + trail.y[at]; };
    assert.deepEqual([tileAt(0), tileAt(2), tileAt(5), tileAt(8), tileAt(10)], ['19,12', '21,12', '24,12', '21,12', '19,12']);
    follower.locate(21, 12);
    assert.equal(F.rrFindOnTrail(trail, follower), 2, 'nearest the leader where no tile is named');
    assert.equal(F.rrFindOnTrail(trail, follower, 1), 2);
    assert.equal(F.rrFindOnTrail(trail, follower, 7), 8, 'the crossing nearest the tile named');
    assert.equal(F.rrFindOnTrail(trail, follower, 9), 8);
    assert.equal(follower._rrOn, trail.seq - 8, 'and it knows its place on the trail from it');
    follower.locate(30, 20);
    assert.equal(F.rrFindOnTrail(trail, follower, 7), -1, 'off the trail');
});

//-----------------------------------------------------------------------------
// Trades, a new formation, a battle on the map.

test('the two of a trade do not trade again for a moment, however the leader steps meanwhile', () => {
    const w = followerWorld({ party: party(5), system: { maxBattleMembers: 5 }, width: 40, height: 30, start: [5, 10] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    w.walk(6, 8);
    settle(w);
    const [a, b] = Array.from(F._data);
    F.rrTrade(a, b);
    // One step of the leader's later (the count of trades between two of its steps begins anew)...
    w.walk(6, 1);
    assert.ok(w.Graphics.frameCount - a._rrTradedAt < w.Game_Followers.TRADE_AGAIN, 'a moment after the trade');
    assert.equal(F.rrMayTrade(a, b), false, 'not yet: that would be the trade undone on the walk');
    assert.equal(F.rrMayTrade(b, a), false);
    w.run(w.Game_Followers.TRADE_AGAIN);
    assert.equal(F.rrMayTrade(a, b), true, 'once the moment has passed');
});

test('Change Follower Formation is walked into at once, also while a follower is out of the line and the leader stands', () => {
    const w = followerWorld({ width: 60, height: 30, start: [10, 12] });
    const p = w.$gamePlayer, F = p.followers();
    w.walk(6, 8); w.rest();
    F.order(1, 'stay');
    w.run(30);
    assert.deepEqual(w.places(), ['17,12', '16,12', '15,12'], 'the file stands while the leader stands');
    F.setFormation('rank');
    w.rest();
    const walking = Array.from(F._data).slice(1);
    assert.deepEqual(walking.map(f => f.x + ',' + f.y).sort(), ['17,11', '17,13'], 'the two that follow form the rank, either side of the one that stays');
    assert.deepEqual([F._data[0].x, F._data[0].y], [17, 12]);
});

test('a battle on the map: the formation asks nothing of the followers, and afterwards its trail begins where the party stands', () => {
    const w = followerWorld({ width: 60, height: 30, start: [10, 12], events: [event(1, 34, 12, { note: '<unit: enemy 1>' })] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('wedge');
    w.walk(6, 12);
    settle(w);
    assert.ok(F._rrTrail.n >= 13, 'the way walked so far is kept');
    let decided = 0;
    const decide = w.Game_Followers.prototype.rrDecide;
    w.Game_Followers.prototype.rrDecide = function() { decided++; return decide.apply(this, arguments); };
    w.$gameFight.start({ mode: 'tactical', troopId: 0, canEscape: true, canLose: true });
    w.run(30);
    F._data[0].locate(19, 8); F._data[1].locate(20, 16); F._data[2].locate(13, 15);
    w.run(100);
    assert.equal(decided, 0, 'no follower was asked for a step of the formation during the battle');
    w.$gameFight.end(w.ReactorFight.WIN);
    w.run(600, () => !w.$gameFight.isActive() && !F._rrRegroup);
    assert.equal(!!F._rrRegroup, false, 'the walk back is over');
    w.run(5);
    const stand = tiles(F._data);
    assert.ok(Array.from(F._data).every(f => Math.abs(f.x - p.x) <= 2 && Math.abs(f.y - p.y) <= 2), `the walk back brought them to the leader (${stand})`);
    // The way walked before the battle is not walked again: they stand as the walk back left them until the leader walks on.
    w.run(200);
    assert.equal(tiles(F._data), stand, 'nobody walks a second time');
    assert.ok(F._rrTrail && F._rrTrail.n <= 5, 'the trail was made anew from where they stand');
    w.walk(6, 6);
    settle(w);
    assert.deepEqual(w.places().slice().sort(), [[p.x - 1, p.y - 1], [p.x - 1, p.y + 1], [p.x - 2, p.y]].map(t => t.join(',')).sort(), 'the wedge again once the leader walks');
});

test('every follower carries the same fields in the same order, whatever each has done: one shape for the functions all characters share', () => {
    const w = followerWorld({ width: 60, height: 30, start: [10, 12], party: party(7), system: { maxBattleMembers: 7 }, walls: [[24, 5, 24, 11], [24, 13, 24, 20]] });
    const p = w.$gamePlayer, F = p.followers();
    const fields = () => Array.from(F._data, f => Object.keys(f).join(' '));
    const born = fields();
    assert.equal(new Set(born).size, 1, 'alike when they are made');
    // One made later (a battle on the map makes followers for a party that has grown) has them from the start.
    const late = Object.keys(new w.Game_Follower(3)).filter(key => key.startsWith('_rr')).join(' ');
    assert.equal(late, born[0].split(' ').filter(key => key.startsWith('_rr')).join(' '), 'a follower has every field from the moment it is made');
    // A wedge through a doorway and back (walks of their own, trades, places in the file), then orders, Hide and a route.
    F.setFormation('wedge');
    w.walk(6, 10); w.rest(900, 60);
    w.walk(6, 8); w.rest(900, 60);
    w.walk(4, 5); w.rest(900, 60);
    F.order(1, 'stay');
    F.order(2, 'goto', { x: p.x + 2, y: p.y + 4 });
    F.order(3, 'hide');
    F.route(4, { repeat: false, skippable: true, wait: false, list: [{ code: 1, parameters: [] }, { code: 4, parameters: [] }, { code: 0, parameters: [] }] });
    w.rest(900, 60);
    F.order('all', 'follow');
    F.order(3, 'show');
    F.setFormation('scattered');
    w.walk(6, 6); w.rest(900, 60);
    const now = fields();
    assert.equal(new Set(now).size, 1, 'alike after all of it');
    const own = list => list.split(' ').filter(key => key.startsWith('_rr') || key === '_reactorWalk').join(' ');
    assert.equal(own(now[0]), own(born[0]), 'and none of the followers\' own fields was added on the way');
    // A follower from a save made before a field existed gets it with the rest, at the next transfer.
    delete F._data[0]._rrSolid;
    delete F._data[0]._rrOrder;
    F.synchronize(p.x, p.y, 2);
    assert.deepEqual(Object.keys(F._data[0]).slice().sort(), Object.keys(F._data[1]).slice().sort());
});
