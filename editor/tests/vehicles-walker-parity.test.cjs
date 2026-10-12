'use strict';
// A vehicle drives where a walker walks, if it fits (SPEC-v2 4.7): its way is tested with the walker's height
// function at the rim of its leading circle, the drawn solids, the water and the bushes, not with the walker's
// own step rule (Reactor3D.terrainBlocks, ReactorPhysics.edges). This asks the Demo's North Haven (Map005), tile
// by tile, where the two differ, and pins the counts: a rule added to the walker's side, or to the vehicle's,
// shows up here the day it lands. Each difference left standing is a named exception.
//   (a) every step a ground-floor walker is refused, that is no drop: is the leading circle stopped too?
//   (b) every pair of tiles a walker walks both ways, with walked ground behind for the body: does it arrive?
// The counts are the map's as it was pinned (its fingerprint is kept beside them); on another map the shares are
// asserted and the new counts printed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { driveWorld, demoData, hasDemo, DEG } = require('./helpers/vehicles-drive-world.cjs');

const STEP = 0.75, AXLE = 3.5 * 0.35;
const DIRS = [[1, 0, 90, 6], [-1, 0, 270, 4], [0, 1, 180, 2], [0, -1, 0, 8]];

/** What these counts were taken on: the two files of the map. */
function fingerprint() {
    const hash = crypto.createHash('sha1');
    for (const name of ['Map005.json', 'Map005.r3d.json']) hash.update(fs.readFileSync(path.join(demoData, name)));
    return hash.digest('hex').slice(0, 12);
}

const PINNED = {
    map: '8ae4082bcd17',
    refused: { steps: 30171, drops: 12689, stopped: 17455, passed: {
        'a ridge on the border of two tiles a step apart or less': 26,
        'off the side of a stair, a step down or less': 1 } },
    walked: { pairs: 60900, roomy: 41804, arrived: 38183, differ: {
        'the foot of ground too steep to walk, a tile on': 826,
        'its rear circle would come over ground it did not roll onto': 14,
        'a rail, a post or a leaf on the way that the walker\'s rule does not see': 199,
        'its circle is wider than a walker: something a step high beside the way': 568,
        'water deeper than its wade (a walker swims it)': 2014 } }
};

let world = null;
function northHaven() {
    if (!world) world = driveWorld({ data: demoData, mapId: 5, at: [28, 3], yaw: 180, board: false });
    return world;
}

/**
 * The vehicle laid along a line of tiles with its leading circle's middle on tile (x, y)'s: the ground under its
 * front axle (`from`), its rear axle and its middle. `resting`: as the ride holds a vehicle that rests there (a
 * wheel over a drop hangs); without it its leading wheel stands on its own ground whatever is behind it, which
 * is what a question about the leading circle alone wants.
 */
function lay(w, state, x, y, dx, dy, degrees, from, resting) {
    const R = w.Reactor3D, map = w.$dataMap;
    state.yaw = degrees * DEG; state.air = 0; state.gf = from; state.resting = !!resting;
    state.gr = R.groundHeightAt(map, x + 0.5 - dx * 2 * AXLE, y + 0.5 - dy * 2 * AXLE, from);
    state.gm = R.groundHeightAt(map, x + 0.5 - dx * AXLE, y + 0.5 - dy * AXLE, (state.gf + state.gr) / 2);
    return rest(w, state);
}

/** Its height over the three reads it holds. */
const RESTS = { alt: 0, front: 0, rear: 0 };
function rest(w, state) {
    if (!state.resting) { state.alt = (state.gf + state.gr) / 2; return state; }
    w.Drive.resting(state.gf, state.gm, state.gr, RESTS);
    state.alt = RESTS.alt; state.gf = RESTS.front; state.gr = RESTS.rear;
    return state;
}

/** The leading circle's middle driven from one tile's middle to the next, in thirds of a tile: what stopped it, or "". */
function lead(w, state, x, y, dx, dy, type) {
    const D = w.Drive;
    let mx = x + 0.5 - dx * AXLE, mz = y + 0.5 - dy * AXLE;
    for (let i = 0; i < 3; i++) {
        const met = D.probe(state, mx, mz, 1 / 3, type);
        if (met) return met;
        mx += dx / 3; mz += dy / 3;
        state.gf = D.probe.lead; state.gr = D.probe.trail; state.gm = D.probe.mid;
        rest(w, state);
    }
    return '';
}

test('every step a ground-floor walker is refused, that is no drop, stops the vehicle too, but a listed few', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(), R = w.Reactor3D, map = w.$dataMap, type = w.type();
    const state = { yaw: 0, alt: 0, gf: 0, gr: 0, gm: 0, air: 0 };
    const got = { steps: 0, drops: 0, stopped: 0, passed: {} }, why = {}, shown = [];
    for (let y = 1; y < map.height - 1; y++) {
        for (let x = 1; x < map.width - 1; x++) {
            const from = R.groundHeightAt(map, x + 0.5, y + 0.5, 0);
            for (const [dx, dy, degrees] of DIRS) {
                const x2 = x + dx, y2 = y + dy;
                if (!R.terrainBlocks(map, x, y, x2, y2, from)) continue;
                got.steps++;
                const to = R.groundHeightAt(map, x2 + 0.5, y2 + 0.5, from);
                // A drop is the vehicle's to ride off (4.6): no refusal it has to share.
                if (to < from - STEP) { got.drops++; continue; }
                const met = lead(w, lay(w, state, x, y, dx, dy, degrees, from), x, y, dx, dy, type);
                if (met) { got.stopped++; why[met] = (why[met] || 0) + 1; continue; }
                // What let it through, by name.
                const edge = R.groundHeightAt(map, x + 0.5 + dx / 2, y + 0.5 + dy / 2, from);
                const name = R.stairPieceAt(map, x, y) || R.stairPieceAt(map, x2, y2) ? 'off the side of a stair, a step down or less'
                    : Math.abs(to - from) <= STEP ? 'a ridge on the border of two tiles a step apart or less' : 'other';
                got.passed[name] = (got.passed[name] || 0) + 1;
                if (shown.length < 8) shown.push(name + ': (' + x + ', ' + y + ') to (' + x2 + ', ' + y2 + '), ' + from.toFixed(2) + ' to ' + to.toFixed(2) + ', the border at ' + edge.toFixed(2));
            }
        }
    }
    const through = Object.values(got.passed).reduce((a, b) => a + b, 0);
    t.diagnostic('a walker is refused ' + got.steps + ' steps; ' + got.drops + ' are drops a vehicle rides off; of the other ' + (got.steps - got.drops) + ' the leading circle is stopped on '
        + got.stopped + ' ' + JSON.stringify(why) + ' and goes on ' + through + ' ' + JSON.stringify(got.passed));
    for (const line of shown) t.diagnostic('  ' + line);
    assert.ok(got.steps > 1000, 'the map refuses walkers somewhere');
    assert.equal(got.passed.other || 0, 0, 'every step it takes that a walker may not is a named exception');
    assert.ok(through <= (got.steps - got.drops) * 0.005, 'it passes ' + through + ' of ' + (got.steps - got.drops) + ': a listed few');
    if (fingerprint() === PINNED.map) assert.deepEqual(got, PINNED.refused, 'the counts moved: a rule changed on the walker\'s side or the vehicle\'s');
    else t.diagnostic('the map is not the one the counts were pinned on (' + fingerprint() + '): pin ' + JSON.stringify(got));
});

test('every pair of tiles a walker walks both ways, the vehicle drives where its body has room, but for named exceptions', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(), R = w.Reactor3D, P = w.ReactorPhysics, map = w.$dataMap, type = w.type(), D = w.Drive;
    const state = { yaw: 0, alt: 0, gf: 0, gr: 0, gm: 0, air: 0 };
    const walks = (x, y, d, height) => { const way = P.edge(map, x, y, d, height); return way && way.kind === 'walk' ? way.to : null; };
    const NAMES = {
        solid: 'a rail, a post or a leaf on the way that the walker\'s rule does not see',
        steep: 'the foot of ground too steep to walk, a tile on',
        rise: 'its circle is wider than a walker: something a step high beside the way',
        tail: 'its rear circle would come over ground it did not roll onto',
        bush: 'a big bush', water: 'water deeper than its wade (a walker swims it)', border: 'the map\'s border', tiles: 'tiles the flags close'
    };
    const got = { pairs: 0, roomy: 0, arrived: 0, differ: {} }, shown = {};
    let events = 0;
    for (let y = 3; y < map.height - 3; y++) {
        for (let x = 3; x < map.width - 3; x++) {
            const from = R.groundHeightAt(map, x + 0.5, y + 0.5, 0);
            for (const [dx, dy, degrees, d] of DIRS) {
                if (dx < 0 || dy < 0) continue;            // each pair once, east and south
                const x2 = x + dx, y2 = y + dy, to = walks(x, y, d, from);
                if (to === null || walks(x2, y2, 10 - d, to) === null) continue;
                got.pairs++;
                // Room for the body: the two tiles behind are walked both ways in the same line, and nothing built
                // stands between its circles, at the height of any of the three.
                const b1 = walks(x, y, 10 - d, from), b2 = b1 === null ? null : walks(x - dx, y - dy, 10 - d, b1);
                if (b2 === null || walks(x - dx, y - dy, d, b1) === null || walks(x - 2 * dx, y - 2 * dy, d, b2) === null) continue;
                lay(w, state, x, y, dx, dy, degrees, from, true);
                const rear = R.groundHeightAt(map, x + 0.5 - dx * 2 * AXLE, y + 0.5 - dy * 2 * AXLE, from), rx = x + 0.5 - dx * 2 * AXLE, rz = y + 0.5 - dy * 2 * AXLE;
                if (Math.abs(rear - from) > 2 * STEP) continue;
                if ([from, rear, state.alt].some(base => D.solidAhead(map, rx, rz, dx, dy, 2 * AXLE, base + 0.6, base + 2.4))) continue;
                got.roomy++;
                const met = lead(w, state, x, y, dx, dy, type);
                if (!met) { got.arrived++; continue; }
                // An event's body is no part of the map: the walker's edge rule does not ask it either.
                if (met === 'event') { events++; got.roomy--; continue; }
                const stair = R.stairPieceAt(map, x, y) || R.stairPieceAt(map, x2, y2) || R.stairPieceAt(map, x2 + dx, y2 + dy);
                const name = stair && (met === 'steep' || met === 'rise') ? 'a stair steeper than its step a tile' : NAMES[met] || met;
                got.differ[name] = (got.differ[name] || 0) + 1;
                if (!shown[name]) shown[name] = [];
                if (shown[name].length < 3) shown[name].push('(' + x + ', ' + y + ') to (' + x2 + ', ' + y2 + ')');
            }
        }
    }
    const differ = got.roomy - got.arrived;
    t.diagnostic('a walker walks ' + got.pairs + ' pairs of tiles both ways; on ' + got.roomy + ' the vehicle\'s body has walked ground behind it; it arrives on ' + got.arrived
        + ' and is stopped on ' + differ + ' (' + events + ' more held an event\'s body)');
    for (const name of Object.keys(got.differ)) t.diagnostic('  ' + got.differ[name] + ': ' + name + ', as at ' + shown[name].join(', '));
    assert.ok(got.roomy > 10000, 'the map has streets: ' + got.roomy);
    assert.ok(got.arrived >= got.roomy * 0.9, 'it arrives on ' + got.arrived + ' of ' + got.roomy);
    for (const name of Object.keys(got.differ)) assert.ok(Object.values(NAMES).includes(name) || name === 'a stair steeper than its step a tile', 'a difference with no name: ' + name);
    if (fingerprint() === PINNED.map) assert.deepEqual(got, PINNED.walked, 'the counts moved: a rule changed on the walker\'s side or the vehicle\'s');
    else t.diagnostic('the map is not the one the counts were pinned on (' + fingerprint() + '): pin ' + JSON.stringify(got));
});
