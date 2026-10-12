'use strict';
// The party's followers come to rest (runtime/reactor_objects_followers.js).
// Wherever the leader stops, nobody stands on the leader, nobody on anybody,
// everybody stands in the place it was given, and no two followers trade
// places back and forth: where the leader turns back on its own way, on a
// walk at random through walls and pillars, off a ledge the leader drops
// from, and in the hills of North Haven.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { followerWorld } = require('./helpers/follower-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const party = size => Array.from({ length: size }, (_, i) => i + 1);
const visible = w => Array.from(w.$gamePlayer.followers()._data).filter(f => f.isVisible());
const heightOf = c => (Number.isFinite(c._reactorAlt) ? c._reactorAlt : c._reactorGround || 0);
const inPlace = f => f.x === f._rrTx && f.y === f._rrTy;
// Every formation that moves the followers: the stock file moves them by the stock code.
const ACTIVE = [['wedge', {}], ['rank', {}], ['column', {}], ['scattered', {}], ['loose', {}], ['file', { spacing: 2 }]];

/** Runs until every follower that is seen stands still in the place it was given. Returns the frames it took (`limit` when it never did). */
function settle(w, limit = 900) {
    const p = w.$gamePlayer;
    return w.run(limit, () => !p.isMoving() && visible(w).every(f => !f.isMoving() && !f.isMoveRouteForcing() && inPlace(f)));
}

/** Whether the search a follower makes for a way of its own finds one it would take to its place: false where the land parts them. */
function reaches(w, f) {
    const C = w.Game_Character;
    C._walkSearch = null;
    const search = f.reactorBeginSearch(f._rrTx, f._rrTy, w.Reactor3D.isMap3D(w.$dataMap) ? f._rrTh : undefined, C.WALK_NODES_NEAR);
    while (!f.reactorRunSearch(search, C.WALK_NODES, 0)) { /* to its end */ }
    return search.path.reached && search.path.length <= w.Game_Followers.WALK_MOST;
}

/** What is wrong with the party at rest, as sentences: nothing, when all is well. */
function faults(w, label) {
    const p = w.$gamePlayer, out = [], seen = new Map();
    visible(w).forEach((f, i) => {
        const tile = f.x + ',' + f.y + '@' + Math.round(heightOf(f));
        if (f.pos(p.x, p.y) && Math.abs(heightOf(f) - heightOf(p)) < 1.2) out.push(`${label}: follower ${i + 1} stands on the leader at ${tile}`);
        if (seen.has(tile)) out.push(`${label}: followers ${seen.get(tile)} and ${i + 1} share ${tile}`);
        seen.set(tile, i + 1);
        if (!inPlace(f) && reaches(w, f)) out.push(`${label}: follower ${i + 1} at ${f.x},${f.y} is not in its place ${f._rrTx},${f._rrTy}`);
    });
    return out;
}

/** Counts the trades of a world from now on. */
function countTrades(w) {
    const proto = w.Game_Followers.prototype, trade = proto.rrTrade, count = { made: 0 };
    proto.rrTrade = function() { count.made++; return trade.apply(this, arguments); };
    return count;
}

test('the leader turns back on its own way: nobody is given the leader\'s tile or a tile somebody has', () => {
    // In the open, and in a corridor one tile wide along y = 10.
    for (const corridor of [false, true]) {
        for (const size of [2, 4, 7, 12]) {
            for (const [formation, options] of ACTIVE) {
                const w = followerWorld({ party: party(size), system: { maxBattleMembers: Math.max(4, size) }, width: 60, height: 30, start: [4, 10],
                    walls: corridor ? [[0, 0, 59, 9], [0, 11, 59, 29]] : [] });
                const p = w.$gamePlayer, F = p.followers();
                F.setFormation(formation, options);
                w.walk(6, 16 + size * (options.spacing || 1));
                settle(w);
                // One step back, two more, then on again the way it first went: at each stop the party is judged.
                for (const [d, steps] of [[4, 1], [4, 2], [6, 2], [4, 5]]) {
                    w.walk(d, steps);
                    const took = settle(w), label = `${formation} of ${size}${corridor ? ' in a corridor' : ''}, ${steps} ${d === 4 ? 'back' : 'on'}`;
                    assert.ok(took < 900, `${label}: the party came to rest`);
                    assert.deepEqual(faults(w, label), []);
                    assert.equal(F.rrIsActive(), true);
                }
            }
        }
    }
});

test('a walk at random through walls, pillars, a doorway and a corridor: the party always comes to rest, and trades end', () => {
    // Pillars, a room with a doorway in its west wall at (30, 14), and a corridor one tile wide along y = 21.
    const walls = [[12, 8, 12, 9], [20, 14, 21, 14], [26, 6, 27, 7], [30, 10, 38, 10], [30, 18, 38, 18], [38, 10, 38, 18], [30, 10, 30, 13], [30, 15, 30, 18],
        [6, 20, 24, 20], [6, 22, 24, 22]];
    for (const [size, formation, first] of [[7, 'wedge', 3], [7, 'rank', 5], [12, 'column', 7], [7, 'scattered', 11], [12, 'wedge', 13]]) {
        const w = followerWorld({ party: party(size), system: { maxBattleMembers: size }, width: 44, height: 30, start: [3, 14], walls });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation);
        let seed = first;
        const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const trades = countTrades(w);
        w.walk(6, size + 3);
        settle(w);
        let rests = 0;
        for (let leg = 0; leg < 70; leg++) {
            w.hold([2, 4, 6, 8][Math.floor(random() * 4)], random() < 0.25);
            w.run(16 * (1 + Math.floor(random() * 8)));
            w.hold(0);
            if (random() >= 0.3) continue;
            const before = trades.made, took = settle(w), label = `${formation} of ${size}, leg ${leg} (leader ${p.x},${p.y})`;
            rests++;
            // A scattered follower takes another spot now and then while the leader stands: it is on its way there.
            if (formation !== 'scattered') assert.ok(took < 900, `${label}: the party came to rest`);
            if (took < 900) assert.deepEqual(faults(w, label), []);
            // The same two trade once while the leader stands.
            assert.ok(trades.made - before <= (size - 1) * (size - 2) / 2, `${label}: ${trades.made - before} trades while the leader stood`);
        }
        assert.ok(rests > 10);
    }
});

test('two followers trade once while the leader stands, never for one tile, and the way to a place goes with it', () => {
    const w = followerWorld({ party: party(5), system: { maxBattleMembers: 5 }, width: 40, height: 30, start: [5, 10] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    w.walk(6, 8);
    settle(w);
    const [a, b, c] = Array.from(F._data);
    assert.equal(F.rrMayTrade(a, b), true, 'two that hold two places may trade');
    const goals = [a._rrTx, a._rrTy, b._rrTx, b._rrTy];
    a._rrByTrail = true;
    F.rrTrade(a, b);
    assert.deepEqual([b._rrTx, b._rrTy, a._rrTx, a._rrTy], goals, 'the places are exchanged at once');
    assert.deepEqual([a._rrByTrail, b._rrByTrail], [false, true], 'a place come to by the trail is come to so by whoever has it');
    assert.equal(F.rrMayTrade(a, b), false, 'not again while the leader stands');
    assert.equal(F.rrMayTrade(b, a), false);
    assert.equal(F.rrMayTrade(a, c), true, 'each of them may with another');
    w.run(w.Game_Followers.TRADE_AGAIN + 1);
    assert.equal(F.rrMayTrade(a, b), false, 'however long it stands');
    settle(w);
    assert.deepEqual(faults(w, 'after the trade'), []);
    // The leader walks on: the two may trade again, once the trade is not a moment old.
    w.walk(6, 1);
    w.run(w.Game_Followers.TRADE_AGAIN + 1);
    assert.equal(F.rrMayTrade(a, b), true);
    // Two given one tile have nothing to trade.
    const tile = [b._rrTx, b._rrTy];
    [b._rrTx, b._rrTy] = [a._rrTx, a._rrTy];
    assert.equal(F.rrMayTrade(a, b), false);
    [b._rrTx, b._rrTy] = tile;
    // A file keeps its order.
    F.setFormation('loose');
    w.walk(6, 6);
    settle(w);
    assert.equal(F.rrMayTrade(a, b), false);
});

test('a follower passes the members that stand only on the walk it was held up on', () => {
    const w = followerWorld({ party: party(4), width: 40, height: 30, start: [5, 10] });
    const p = w.$gamePlayer, F = p.followers();
    F.setFormation('rank');
    w.walk(6, 8);
    settle(w);
    const [a, b] = Array.from(F._data);
    a._rrSolid = true;
    assert.equal(a.isCollidedWithCharacters(b.x, b.y), true, 'as a body it does not walk onto a member');
    a._rrPassing = true;
    assert.equal(a.isCollidedWithCharacters(b.x, b.y), true, 'nor with the pass of a walk that is over');
    a._moveRouteForcing = true;
    assert.equal(a.isCollidedWithCharacters(b.x, b.y), false, 'on that walk it passes one that stands');
    assert.equal(a.isCollidedWithCharacters(p.x, p.y), true, 'but not the leader while it stands');
    a._moveRouteForcing = false;
    a._rrSolid = false;
    // Its next step of its own ends the pass.
    w.walk(6, 2);
    settle(w);
    assert.equal(!!a._rrPassing, false);
    assert.deepEqual(faults(w, 'at rest'), []);
});

//-----------------------------------------------------------------------------
// A 3D map: a ledge the leader drops off, and North Haven's hills.

test('the leader drops off a ledge: the way it took is not forgotten, and everybody comes down after it', () => {
    // A plateau two tiles up over x 2..9, y 3..15; the leader walks off its east edge and on.
    const pieces = [];
    for (let x = 2; x <= 9; x++) for (let y = 3; y <= 15; y++) for (let z = 0; z < 2; z++) pieces.push({ id: pieces.length + 1, kind: 'block', x, y, z, rot: 0, material: '' });
    for (const [size, formation] of [[4, 'wedge'], [7, 'wedge'], [7, 'rank'], [4, 'column']]) {
        const w = followerWorld({ flat: false, width: 30, height: 20, start: [4, 9], party: party(size), system: { maxBattleMembers: Math.max(4, size) }, sidecar: { pieces } });
        const p = w.$gamePlayer, F = p.followers();
        F.setFormation(formation);
        w.run(5);
        assert.ok(Math.abs(heightOf(p) - 2) < 0.1, 'the party starts on the plateau');
        w.walk(6, 4);
        settle(w);
        assert.ok(visible(w).every(f => heightOf(f) > 1.9), `${formation} of ${size}: everybody on the plateau`);
        // Off the edge: the key is held until the leader stands on the ground beyond.
        let reset = 0, trail = F._rrTrail;
        w.hold(6);
        w.run(900, () => { if (F._rrTrail !== trail) { reset++; trail = F._rrTrail; } return p.x >= 16 && !p.isMoving(); });
        w.hold(0);
        assert.ok(heightOf(p) < 0.2 && p.x >= 16, `${formation} of ${size}: the leader came down (${p.x},${p.y} at ${heightOf(p).toFixed(1)})`);
        assert.equal(reset, 0, `${formation} of ${size}: the trail was kept through the drop`);
        const label = `${formation} of ${size} below the ledge`;
        assert.ok(settle(w, 1500) < 1500, `${label}: the party came to rest`);
        assert.ok(visible(w).every(f => heightOf(f) < 0.2 && f.x >= 10), `${label}: everybody came down (${visible(w).map(f => f.x + ',' + f.y + '@' + heightOf(f).toFixed(1))})`);
        assert.deepEqual(faults(w, label), []);
    }
});

const baseline = path.join(repo, 'scratchpad', 'ux-pass', 'baseline', 'demo-data');
const demo = fs.existsSync(path.join(baseline, 'Map005.r3d.json')) ? baseline : path.join(repo, 'template', 'Demo', 'data');

test('North Haven\'s hills: along a ridge and back, past ledges on both sides, the party comes to rest and trades end', t => {
    if (!fs.existsSync(path.join(demo, 'Map005.r3d.json'))) return t.skip('the Demo is not in this checkout');
    for (const formation of ['wedge', 'rank', 'column']) {
        // Exercise the default formation spacing, independent of the Demo author's party preferences.
        const w = followerWorld({ data: demo, mapId: 5, start: [101, 11], party: party(7), system: { reactorBattle: { partySize: 7 }, maxBattleMembers: 7, reactorParty: { formation: 'file', spacing: 1, straggle: 0 } }, prepare: map => {
            map.reactor3d.pieces = map.reactor3d.pieces.filter(piece => piece.kind !== 'rock');
            map.events = [null];
        } });
        const p = w.$gamePlayer, F = p.followers();
        if (!w.Reactor3D.isMap3D(w.$dataMap)) return t.skip('North Haven is not a 3D map in this data');
        F.setFormation(formation);
        const trades = countTrades(w);
        // The Demo walks by its camera, which a test has not: the leader walks by a route of plain steps, each
        // asked of the map as a key step is; one that cannot be taken is passed over.
        const go = (d, steps) => {
            const list = [];
            for (let n = 0; n < steps; n++) list.push({ code: d / 2, parameters: [] });
            list.push({ code: 0, parameters: [] });
            p.forceMoveRoute({ list, repeat: false, skippable: true, wait: false });
            w.run(600, () => !p.isMoveRouteForcing() && !p.isMoving());
        };
        let rests = 0;
        const rest = label => {
            const before = trades.made, took = settle(w);
            rests++;
            // One the hills part from its place stands where it can: it is not at fault, and it does not keep the others busy.
            const cut = visible(w).filter(f => !inPlace(f) && !reaches(w, f)).length;
            assert.ok(took < 900 || cut > 0, `${formation}, ${label} (leader ${p.x},${p.y}): the party came to rest`);
            assert.deepEqual(faults(w, `${formation}, ${label} (leader ${p.x},${p.y})`), []);
            assert.ok(trades.made - before <= 15, `${formation}, ${label}: ${trades.made - before} trades while the leader stood`);
        };
        // Up the valley, onto the ridge and along it, a spur to the north, and all the way back.
        go(6, 7); rest('up the valley');
        go(2, 3); rest('down the slope');
        go(8, 5); rest('onto the ridge');
        go(6, 4); rest('along the ridge');
        go(4, 2); rest('two back');
        go(8, 2); rest('up the spur');
        go(2, 2); rest('down the spur');
        go(6, 12); rest('far along the ridge');
        go(4, 6); rest('back along it');
        go(6, 3); rest('and on again');
        assert.equal(rests, 10);
    }
});
