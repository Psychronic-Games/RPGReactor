'use strict';
// A neighboring map shown past the border and entered without a break (Reactor3D.Neighbors,
// runtime/reactor_3d_surround.js): where it lies, when it is read, how its world stands in the
// scene and is taken over, and how the party arrives (reactor_objects_map.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { followerWorld } = require('./helpers/follower-world.cjs');

const root = path.resolve(__dirname, '..', '..');
const R = require(path.join(root, 'runtime/reactor_3d.js'));
const plain = value => JSON.parse(JSON.stringify(value));

test('where a neighbor lies, and how far a place is from each side', () => {
    const N = R.Neighbors, map = { width: 120, height: 80 };
    assert.deepEqual(N.offsetOf(map, 'north', { map: 2 }, 100, 60), { x: 0, z: -60 });
    assert.deepEqual(N.offsetOf(map, 'south', { map: 2, shift: 5 }, 100, 60), { x: 5, z: 80 });
    assert.deepEqual(N.offsetOf(map, 'west', { map: 2, shift: -3 }, 100, 60), { x: -100, z: -3 });
    assert.deepEqual(N.offsetOf(map, 'east', { map: 2 }, 100, 60), { x: 120, z: 0 });
    assert.deepEqual(['north', 'south', 'west', 'east'].map(side => N.sideDistance(map, 10, 30, side)), [30, 49, 10, 109]);
});

function flatMap(W = 40, H = 30, surround = { style: 'continue' }) {
    return { width: W, height: H, note: '', reactor3d: { terrain: new Array((W + 1) * (H + 1)).fill(2), terrainWidth: W, surround } };
}

test('a side a neighbor\'s world stands on has no land, and no corner turns toward it', () => {
    const map = flatMap();
    const whole = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0 });
    const cut = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, none: { east: true } });
    const east = g => { let n = 0; for (let i = 0; i < g.ground.positions.length; i += 3) if (g.ground.positions[i] > map.width + 0.5) n++; return n; };
    assert.ok(east(whole) > 100);
    assert.equal(east(cut), 0, 'nothing past the east border, the corners included');
    assert.ok(cut.ground.index.length > 0 && cut.ground.index.length < whole.ground.index.length);
    // Every side: nothing at all.
    const none = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, none: { north: true, east: true, south: true, west: true } });
    assert.equal(none.ground.index.length, 0);
});

test('a neighbor shorter than the side leaves this map its land along the rest of it', () => {
    const N = R.Neighbors;
    assert.equal(N.covered(200, 0, 200), true);
    assert.equal(N.covered(120, -40, 200), true, 'a longer neighbor covers it all');
    assert.deepEqual(N.covered(200, 0, 120), { from: 0, to: 120 });
    assert.deepEqual(N.covered(200, 30, 120), { from: 30, to: 150 });
    assert.equal(N.covered(200, 200, 120), null, 'beside none of it');
    const map = flatMap();
    const W = map.width, H = map.height;
    const part = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, none: { east: { from: 0, to: 18 } } });
    const p = part.ground.positions;
    let above = 0, below = 0, north = 0;
    for (let i = 0; i < p.length; i += 3) {
        if (p[i] <= W + 0.5) continue;
        if (p[i + 2] < 0) north++; else if (p[i + 2] < 18 - 1e-6) above++; else if (p[i + 2] <= H) below++;
    }
    assert.equal(above, 0, 'none where the neighbor stands');
    assert.equal(north, 0, 'and no corner turned toward it');
    assert.ok(below > 30, 'land past the rest of the side');
    // It is whole ground out to the rim there, the southeast corner included: triangles, not loose points.
    const inPart = v => p[v * 3] > W + 0.5 && p[v * 3 + 2] >= 18 - 1e-6;
    let faces = 0, far = 0;
    for (let t = 0; t < part.ground.index.length; t += 3) {
        const [a, b, c] = [part.ground.index[t], part.ground.index[t + 1], part.ground.index[t + 2]];
        if (inPart(a) && inPart(b) && inPart(c)) { faces++; far = Math.max(far, p[a * 3] - W, p[b * 3] - W, p[c * 3] - W); }
    }
    assert.ok(faces > 30 && far > part.info.distance * 0.9, faces + ' faces out to ' + far);
    const cut = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, none: { east: true } });
    assert.ok(part.ground.index.length > cut.ground.index.length);
    // A neighbor in the middle of the side: land above it and below it, both corners kept.
    const mid = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, none: { east: { from: 10, to: 20 } } });
    const q = mid.ground.positions;
    let inside = 0, corner = 0;
    for (let i = 0; i < q.length; i += 3) {
        if (q[i] <= W + 0.5) continue;
        if (q[i + 2] > 10 + 1e-6 && q[i + 2] < 20 - 1e-6) inside++;
        if (q[i + 2] < 0) corner++;
    }
    assert.deepEqual([inside, corner > 0], [0, true]);
});

test('two maps side by side have the same hills where their lands meet: the hills are the world\'s', () => {
    const map = flatMap(40, 30, { style: 'continue', rough: 1 });
    const heightAt = (origin, x, z) => {
        const g = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, origin });
        const p = g.ground.positions;
        for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - x) < 1e-6 && Math.abs(p[i + 2] - z) < 1e-6) return p[i + 1];
        return null;
    };
    // The same place of the world, seen from a map 8 tiles further east of it (far rings keep every eighth ray).
    const here = heightAt({ x: 0, z: 0 }, 16, -16), there = heightAt({ x: -8, z: 0 }, 24, -16);
    assert.ok(here !== null && there !== null);
    assert.ok(Math.abs(here - there) < 1e-4, `${here} and ${there}`);
    assert.ok(Math.abs(here - heightAt({ x: 500, z: 0 }, 16, -16)) > 0.05, 'another place of the world, other hills');
});

test('a neighbor\'s world stands in the scene under one group at its place, and comes out as it went in', () => {
    const w = followerWorld({ flat: false, party: [1] });
    const N = w.Reactor3D.Neighbors, T = w.THREE;
    const sceneOf = names => { const s = { _scene: new T.Scene(), _sky: new T.Object3D() }; for (const name of names) { const o = new T.Object3D(); o.name = name; s._scene.add(o); } s._scene.add(s._sky); return s; };
    const main = sceneOf(['floor']), body = sceneOf(['below', 'pieces']);
    // (A scene that was a map's own: the viewport held its place in the world still.)
    body._scene.matrixWorldAutoUpdate = false;
    const record = N.attach(main, 'east', body, 9, { x: 120, z: 0 });
    assert.equal(record.mapId, 9);
    assert.equal(record.group.parent, main._scene);
    assert.equal(body._scene.parent, record.group, 'the scene itself, so what it lays later stands there too');
    assert.deepEqual([record.group.position.x, record.group.position.z], [120, 0]);
    assert.equal(body._sky.visible, false, 'one sky: the map\'s own');
    // Laid after it was stood there (plants as the eye nears, models as they load): in its place.
    const late = new T.Object3D(); late.position.set(3, 0, 4); body._scene.add(late);
    main._scene.updateMatrixWorld(true);
    assert.deepEqual([late.matrixWorld.elements[12], late.matrixWorld.elements[14]], [123, 4]);
    assert.equal(N.detach(main, 'east'), record);
    assert.equal(body._scene.parent, null);
    assert.deepEqual(Array.from(body._scene.children, o => o.name), ['below', 'pieces', '', '']);
    assert.equal(record.group.parent, null);
    assert.equal(main._neighborBodies.east, undefined);
});

test('the party\'s models go with it into the map entered; everybody else stays', () => {
    const w = followerWorld({ flat: false, party: [1] });
    const N = w.Reactor3D.Neighbors, T = w.THREE;
    const group = new T.Group();
    const holder = () => ({ object: new T.Object3D() });
    const from = { _modelInstances: new Map([['p', holder()], ['f0', holder()], ['f1', holder()], ['e12', holder()], ['e10003', holder()]]) };
    const to = { _modelInstances: new Map([['e10003', holder()]]), modelsGroup: () => group };
    const leader = from._modelInstances.get('p');
    // The leader rides event 12, which is event 31 on the map entered.
    const bike = from._modelInstances.get('e12');
    // The event the leader rides on the map entered: the carried model is that event's from here on.
    const entered = { id: 31 }, left = { id: 12 };
    bike.character = left;
    const eventOf = w.$gameMap.event;
    w.$gameMap.event = id => (id === 31 ? entered : null);
    N.carryParty(from, to, 'e12', 'e31');
    w.$gameMap.event = eventOf;
    assert.equal(bike.character, entered, 'its model follows the event of the map entered (its wheels turn by that event\'s road)');
    assert.deepEqual(Array.from(from._modelInstances.keys()), ['e10003']);
    assert.deepEqual(Array.from(to._modelInstances.keys()).sort(), ['e10003', 'e31', 'f0', 'f1', 'p']);
    assert.equal(to._modelInstances.get('e31'), bike, 'what it rides, as it is');
    assert.equal(to._modelInstances.get('p'), leader, 'the same model, as it is');
    assert.equal(leader.object.parent, group);
});

function crossingWorld() {
    const w = followerWorld({ width: 12, height: 10, start: [5, 0], party: [1, 2, 3],
        prepare(map, c) {
            map.reactor3d = Object.assign(map.reactor3d || {}, { surround: { style: 'none', neighbors: { north: { map: 2, shift: 2 } } } });
            c.$dataMapInfos = [null, { id: 1, name: 'Here' }, { id: 2, name: 'North' }];
        } });
    const N = w.Reactor3D.Neighbors;
    // The map past the north border stands built, 20 by 16, and is read.
    N.records.clear();
    N.records.set(2, { mapId: 2, state: 'ready', text: ['{}', null], map: { width: 20, height: 16 }, copy: { id: 'the copy' }, used: 1 });
    N.live = { scene: { _scene: {}, _neighborBodies: { north: { mapId: 2, stage: 0, offset: { x: 2, z: -16 } } } } };
    N.crossing = null;
    return w;
}

test('a border whose neighbor stands built is walked over with no fade; one that is not ready fades as any transfer does', () => {
    const w = crossingWorld(), N = w.Reactor3D.Neighbors, p = w.$gamePlayer;
    w.hold(8); w.run(1); w.hold(0);
    assert.equal(p.isTransferring(), true);
    assert.equal(p.fadeType(), 2);
    assert.deepEqual(plain(N.crossing), { from: 1, to: 2, side: 'north', offset: { x: 2, z: -16 } });
    assert.equal(N.take(2).id, 'the copy', 'the game is handed the map read as the player came near');
    assert.equal(N.take(3), null);
    // An event's transfer reserved on top of it is a transfer like any other.
    p.reserveTransfer(1, 3, 3, 2, 0);
    assert.equal(N.crossing, null);
    assert.equal(N.take(2), null, 'only a crossing is handed a map this way');

    const late = crossingWorld(), Nl = late.Reactor3D.Neighbors;
    Nl.live.scene._neighborBodies = {};
    late.hold(8); late.run(1); late.hold(0);
    assert.equal(late.$gamePlayer.isTransferring(), true);
    assert.equal(late.$gamePlayer.fadeType(), 0);
    assert.equal(Nl.crossing, null);
    Nl.enabled = false;
});

test('the party arrives where it was, in the entered map\'s tiles: the leader walks on from the border, nobody is gathered', () => {
    const w = crossingWorld(), N = w.Reactor3D.Neighbors, p = w.$gamePlayer;
    // The followers stand behind the leader, as they walked.
    const followers = p.followers()._data;
    followers[0].setPosition(5, 1); followers[1].setPosition(5, 2);
    w.hold(8); w.run(1); w.hold(0);
    const W = 20, H = 16, tiles = new Array(W * H * 6).fill(0);
    for (let i = 0; i < W * H; i++) tiles[i] = 1536;
    w.$dataMap = Object.assign(plain(w.$dataMap), { width: W, height: H, data: tiles, reactor3d: undefined });
    p.performTransfer();
    assert.equal(w.$gameMap.mapId(), 2);
    assert.deepEqual([p.x, p.y], [3, 15], 'the tile straight over the border (this map\'s x 5 is the neighbor\'s 3)');
    assert.deepEqual([p._realX, p._realY], [3, 16], 'drawn where it stood, so the step over the border is one walk');
    assert.deepEqual(plain(followers.map(f => [f.x, f.y])), [[3, 17], [3, 18], [3, 16]], 'the followers are where they were (the last on the leader\'s old tile), not gathered onto the leader');
    assert.equal(p.isTransferring(), false);
    // It walks in: one step later it stands on the border tile.
    w.run(40, () => !p.isMoving());
    assert.deepEqual([p._realX, p._realY], [3, 15]);
});

//-----------------------------------------------------------------------------
// The worlds that stand around the map played (Neighbors.update)

/**
 * A world of maps joined by their borders, with the game on one of them. `links` is `{ id: { side: id } }`;
 * every map is `size` tiles square. Worlds are stood by the real attach, from scenes with nothing in them.
 */
function streamWorld(links, here, size = 400) {
    const w = followerWorld({ flat: false, party: [1] });
    const N = w.Reactor3D.Neighbors, T = w.THREE;
    const mapOf = id => ({ id, width: size, height: size, reactor3d: { surround: { style: 'continue',
        neighbors: Object.fromEntries(Object.entries(links[id] || {}).map(([side, map]) => [side, { map, shift: 0 }])) } } });
    const sceneOf = id => ({ id, _scene: new T.Scene(), _groundFrame: { shift: new T.Vector3(), place: new T.Vector3() }, destroyed: false, destroy() { this.destroyed = true; } });
    const maps = {}, built = [], scenes = {};
    for (const id of Object.keys(links)) maps[id] = mapOf(Number(id));
    w.$dataMapInfos = [null];
    for (const id of Object.keys(links)) w.$dataMapInfos[id] = { id: Number(id), name: 'Map ' + id };
    N.records.clear();
    N.request = id => N.records.get(id) || (N.records.set(id, { mapId: id, state: 'ready', map: maps[id], copy: {}, used: 0 }), N.records.get(id));
    N.addBody = (main, mapData, side, entry, record, bitmaps, host, parent) => {
        const offset = N.offsetOf(mapData, side, entry, record.map.width, record.map.height);
        const body = N.attach(main, side, scenes[record.mapId] = sceneOf(record.mapId), record.mapId, offset, record, parent ? parent.at : null);
        body.settle = 0; body.masks = -1;
        built.push(record.mapId);
        return body;
    };
    N.relay = () => {};
    N.dark = () => false;
    N.crossing = null;
    N.enabled = true;
    const play = id => { w.$dataMap = maps[id]; w.$gameMap.mapId = () => Number(id); };
    play(here);
    const live = { scene: sceneOf(here) };
    w.Graphics = w.Graphics || {};
    let frame = 0;
    const run = (frames, state = live) => { for (let i = 0; i < frames; i++) { w.Graphics.frameCount = ++frame; N.update(state, []); } };
    /** Every world standing, as `{ id: [x, z] }` from the map played. */
    const standing = scene => {
        const out = {};
        const walk = from => { for (const body of Object.values(from._neighborBodies || {})) { out[body.mapId] = [body.at.x, body.at.z]; walk(body.scene); } };
        walk(scene);
        return out;
    };
    return { w, N, live, built, scenes, maps, run, standing, play, sceneOf };
}
const LINE = { 1: { east: 2 }, 2: { west: 1, east: 3 }, 3: { west: 2, east: 4 }, 4: { west: 3, east: 5 }, 5: { west: 4, east: 6 }, 6: { west: 5 } };

test('the maps past the borders stand from the start, however far the party is from a border, and the maps past those too', () => {
    const s = streamWorld(LINE, 3);
    // 300 tiles from the west border, 99 from the east: no border is near.
    s.w.$gamePlayer._realX = 300; s.w.$gamePlayer._realY = 200;
    s.run(1);
    assert.deepEqual(s.built, [4], 'one world at a time, the nearest first');
    s.run(1);
    assert.deepEqual(s.built, [4], 'and frames apart (a part built is a long frame)');
    s.run(4 * s.N.PACE);
    assert.deepEqual(s.built, [4, 2, 5, 1], 'the neighbors, then theirs');
    assert.deepEqual(s.standing(s.live.scene), { 2: [-400, 0], 4: [400, 0], 1: [-800, 0], 5: [800, 0] });
    assert.equal(s.live.scene._neighborBodies.east.scene._neighborBodies.east.mapId, 5, 'a neighbor\'s neighbor stands in the neighbor\'s scene');
    s.run(60);
    assert.deepEqual(s.built, [4, 2, 5, 1], 'nothing further out, and nothing built twice');
    assert.equal(s.scenes[5]._groundFrame.shift.x, 800, 'its ground is painted where it stands from the map played');
    // The party walks to the middle and to the west border: nothing comes or goes.
    for (const x of [200, 60, 5]) { s.w.$gamePlayer._realX = x; s.run(12); }
    assert.deepEqual(Object.keys(s.standing(s.live.scene)).sort(), ['1', '2', '4', '5']);
    // Within 48 tiles of the east border the map one further out past it is built too: what will stand after the
    // crossing stands before it.
    s.w.$gamePlayer._realX = 360;
    s.run(12);
    assert.deepEqual(Object.keys(s.standing(s.live.scene)).sort(), ['1', '2', '4', '5', '6']);
    assert.deepEqual(s.standing(s.live.scene)[6], [1200, 0]);
    // It is kept until the party is well away from that border again, then let go.
    s.w.$gamePlayer._realX = 340;
    s.run(12);
    assert.equal(s.scenes[6].destroyed, false);
    s.w.$gamePlayer._realX = 200;
    s.run(12);
    assert.equal(s.scenes[6].destroyed, true);
    assert.deepEqual(Object.keys(s.standing(s.live.scene)).sort(), ['1', '2', '4', '5']);
});

test('a map two ways lead to is built once, beside the nearer way', () => {
    // 1 with 2 to its north and 3 to its east; 4 lies east of 2 and north of 3.
    const s = streamWorld({ 1: { north: 2, east: 3 }, 2: { south: 1, east: 4 }, 3: { west: 1, north: 4 }, 4: { west: 2, south: 3 } }, 1);
    s.w.$gamePlayer._realX = 200; s.w.$gamePlayer._realY = 200;
    s.run(20);
    assert.deepEqual(s.built.slice().sort(), [2, 3, 4]);
    assert.deepEqual(s.standing(s.live.scene)[4], [400, -400]);
});

test('while the screen fades in from a transfer the worlds are built several a frame', () => {
    const s = streamWorld(LINE, 3);
    s.N.dark = () => true;
    s.run(2);
    assert.deepEqual(s.built.slice().sort(), [1, 2, 4, 5], 'the neighbors on the first frame, theirs on the next');
});

test('over a border nothing is built and nothing is taken down: what stands after it stood before it', () => {
    const s = streamWorld(LINE, 3), N = s.N;
    s.w.$gamePlayer._realX = 390; s.w.$gamePlayer._realY = 200;
    s.run(40);
    assert.deepEqual(s.built, [4, 2, 5, 1, 6], 'near the east border the map three out past it stands too');
    const old = s.live.scene, ahead = s.scenes[4], far = s.scenes[5], behind = s.scenes[2], last = s.scenes[1];
    // The step over the east border.
    N.live = s.live;
    N.crossing = { from: 3, to: 4, side: 'east', offset: { x: 400, z: 0 } };
    const adopted = N.adopt(4);
    assert.equal(adopted, ahead, 'the world that stood past the border is the map\'s own');
    assert.deepEqual(s.standing(adopted), { 5: [400, 0], 6: [800, 0], 3: [-400, 0], 2: [-800, 0], 1: [-1200, 0] }, 'everything stands where it stood, counted from the map entered');
    assert.equal(far._groundFrame.shift.x, 400);
    assert.equal(behind._groundFrame.shift.x, -800);
    assert.equal([old, far, behind, last].some(scene => scene.destroyed), false, 'nothing is taken down in the crossing');
    N.crossing = null;
    s.play(4);
    s.w.$gamePlayer._realX = 0;
    const live = { scene: adopted };
    s.run(20, live);
    assert.deepEqual(s.built, [4, 2, 5, 1, 6], 'nothing was built for the crossing');
    assert.equal(last.destroyed, false, 'still beside the border come over, the map three behind stands');
    // Ridden on into the map: the one now three behind is let go, and nothing else changes.
    s.w.$gamePlayer._realX = 200;
    s.run(20, live);
    assert.equal(last.destroyed, true);
    assert.equal(behind.destroyed, false);
    assert.deepEqual(s.standing(adopted), { 5: [400, 0], 3: [-400, 0], 2: [-800, 0], 6: [800, 0] });
});

test('a world the map stops naming goes, with what stood beside it', () => {
    const s = streamWorld(LINE, 3);
    s.w.$gamePlayer._realX = 200; s.w.$gamePlayer._realY = 200;
    s.run(30);
    delete s.maps[3].reactor3d.surround.neighbors.east;
    s.run(3);
    assert.deepEqual(Object.keys(s.standing(s.live.scene)).sort(), ['1', '2']);
    assert.equal(s.scenes[4].destroyed && s.scenes[5].destroyed, true);
});

//-----------------------------------------------------------------------------
// Where the far lands of two neighboring maps meet

test('two neighbors of different styles, seeds and roughness have one land along the line out from their shared corners', () => {
    // West: rolling land. East: mountains 60 tiles high, with other hills. Each names the other.
    const west = flatMap(120, 120, { style: 'continue', rough: 0.3, seed: 9, neighbors: { east: { map: 2 } } });
    const east = flatMap(120, 120, { style: 'mountains', rough: 1, seed: 11, height: 60, neighbors: { west: { map: 1 } } });
    const landOf = (map, origin) => {
        const g = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0, origin, none: null });
        const p = g.ground.positions, at = new Map();
        for (let i = 0; i < p.length; i += 3) at.set(Math.round((p[i] + origin.x) * 100) + ':' + Math.round((p[i + 2] + origin.z) * 100), p[i + 1]);
        return at;
    };
    const a = landOf(west, { x: 0, z: 0 }), b = landOf(east, { x: 120, z: 0 });
    // The line north from the corner both share (world x 120, z 0) and the line south from the other (120, 120).
    let compared = 0, worst = 0, tallest = 0;
    for (const [key, height] of a) {
        const [x, z] = key.split(':').map(Number);
        if (x !== 12000 || (z > 0 && z < 12000) || !b.has(key)) continue;
        compared++;
        worst = Math.max(worst, Math.abs(height - b.get(key)));
    }
    assert.ok(compared >= 12, `${compared} places on the two lines`);
    assert.ok(worst < 1e-3, `the two lands differ by ${worst} where they meet`);
    // Away from the corner the mountains are the map's own, as high as it asked.
    for (const [key, height] of b) { const [x, z] = key.split(':').map(Number); if (x >= 12000 + 4000 && x <= 12000 + 8000 && z < 0) tallest = Math.max(tallest, height); }
    assert.ok(tallest > 30, `mountains stand in the middle of the side (${tallest})`);
    // A map that names no neighbor is laid as it always was.
    const alone = flatMap(120, 120, { style: 'mountains', rough: 1, seed: 11, height: 60 });
    const named = R.surroundGeometry(east, R.surroundOf(east), { floorY: 0 }).ground.positions;
    const plainLand = R.surroundGeometry(alone, R.surroundOf(alone), { floorY: 0 }).ground.positions;
    let same = 0, changed = 0;
    for (let i = 0; i < plainLand.length; i += 3) {
        // East of the middle of the north and south sides nothing is near a named side.
        if (plainLand[i] > 60 && plainLand[i] < 120 && (plainLand[i + 2] < 0 || plainLand[i + 2] > 120)) { if (Math.abs(plainLand[i + 1] - named[i + 1]) < 1e-6) same++; else changed++; }
    }
    assert.ok(same > 50 && changed === 0, `far from the neighbor the land is unchanged (${same} same, ${changed} changed)`);
});
