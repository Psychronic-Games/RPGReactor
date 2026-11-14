'use strict';
// The maps over and under a map (`surround.levels` in the 3D sidecar): a player whose height passes the middle of
// the gap between two maps goes on in the other one, at the same place and height. The data rules are
// reactor_3d_surround.js's, the crossing Game_Player's (reactor_objects_map.js), the form and the way back RRMapEdges'.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { followerWorld } = require('./helpers/follower-world.cjs');

const root = path.resolve(__dirname, '..', '..');
const R = require(path.join(root, 'runtime/reactor_3d.js'));
const plain = value => JSON.parse(JSON.stringify(value));

test('levels are kept apart from the four sides: checked, held to their ranges, and said only by a map that has one', () => {
    assert.deepEqual(plain(R.normalizeLevels({ below: { map: 4, gap: 12, x: 3, y: -2 }, above: 7, north: { map: 9 }, up: { map: 2 } })),
        { above: { map: 7, gap: 0 }, below: { map: 4, gap: 12, x: 3, y: -2 } });
    assert.deepEqual(plain(R.normalizeLevels({ below: { map: 0 }, above: { map: 2, gap: 1000, x: 0.4 } })), { above: { map: 2, gap: R.LEVEL_GAP.max } });
    assert.deepEqual(R.normalizeLevels(null), {});
    const only = R.normalizeSurround({ levels: { below: { map: 4 } } });
    assert.equal(only.style, 'none'); assert.deepEqual(plain(only.levels), { below: { map: 4, gap: 0 } });
    assert.deepEqual(only.neighbors, {}, 'a level is not a neighbor: nothing is built beside the map for it');
    assert.equal('levels' in R.normalizeSurround({ style: 'ocean' }), false, 'a map without one stores what it did');
    assert.deepEqual(R.neighborsOf({ reactor3d: { surround: { neighbors: { above: { map: 2 } }, levels: { above: { map: 2 } } } } }), {}, 'and the sides know nothing of it');
    const map = { reactor3d: { surround: { levels: { below: { map: 4 } } } } };
    assert.equal(R.levelsOf(map), R.levelsOf(map), 'read once for the same settings');
    map.reactor3d.surround.levels.below.gap = 20;
    assert.equal(R.levelsOf(map).below.gap, 20, 'and again when they change');
    assert.equal(R.levelsOf({}), R.NO_LEVELS);
});

test('the map changes halfway down the gap, and the same tile and height are named in the other map\'s own measure', t => {
    // The distance is the lower map's height, the floor between (1) and the gap: a map 8 tall with 3 over its floor
    // lies 12 down, this map (5 tall) with 5 over its floor has the next one's ground 11 up.
    const map = { width: 40, height: 40, reactor3d: { room: { height: 5 }, surround: { levels: { below: { map: 4, gap: 3, x: 3, y: -2 }, above: { map: 6, gap: 5 } } } } };
    assert.equal(R.levelTop(map), 5); assert.equal(R.levelTop({}), R.LEVEL_TOP);
    assert.equal(R.levelRise(map, 'above', map.reactor3d.surround.levels.above), 11);
    assert.equal(R.levelExit(map, 10, 10, -99), null, 'the map under is not read yet: its height is not known, nobody leaves');
    R.Neighbors.records.set(4, { mapId: 4, state: 'ready', map: { width: 40, height: 40, reactor3d: { room: { height: 8 } } }, used: 1 });
    t.after(() => R.Neighbors.records.delete(4));
    assert.equal(R.levelRise(map, 'below', R.levelsOf(map).below), 12);
    assert.ok(R.levelRise(map, 'below', { map: 4, gap: 0 }, { reactor3d: { room: { height: 1 } } }) >= R.LEVEL_LEAST, 'never nearer than the least');
    assert.equal(R.levelExit(map, 10, 10, 0), null);
    assert.equal(R.levelExit(map, 10, 10, -5.9), null, 'in a pit not yet halfway down');
    assert.deepEqual(R.levelExit(map, 10.3, 9.6, -6.1), { side: 'below', mapId: 4, x: 7, y: 12, rise: 12 });
    assert.equal(R.levelExit(map, 10, 10, 5.4), null);
    assert.deepEqual(R.levelExit(map, 10, 10, 5.6), { side: 'above', mapId: 6, x: 10, y: 10, rise: -11 });
    assert.equal(R.levelExit(map, 10, 10, NaN), null);
    assert.equal(R.levelExit({ width: 4, height: 4 }, 1, 1, -99), null, 'a map with nothing under it has a floor');
    // Across the gap and back is the same place: no tile is lost either way.
    const down = R.levelExit(map, 10, 10, -6.1), lower = { reactor3d: { room: { height: 8 }, surround: { levels: { above: { map: 1, gap: 3, x: -3, y: 2 } } } } };
    assert.equal(R.levelExit(lower, down.x, down.y, -6.1 + down.rise), null, 'arrived just under halfway: it does not go straight back');
    assert.deepEqual(R.levelExit(lower, down.x, down.y, 6.2), { side: 'above', mapId: 1, x: 10, y: 10, rise: -12 });
});

function world(levels, options = {}) {
    return followerWorld(Object.assign({ width: 12, height: 10, start: [5, 4], party: [1],
        prepare(map, c) {
            map.reactor3d = Object.assign(map.reactor3d || {}, { surround: { style: 'none', levels } });
            c.$dataMapInfos = [null, { id: 1, name: 'Trail' }, { id: 2, name: 'Reactor Room' }, { id: 3, name: 'Loft' }];
        } }, options));
}

test('a player past the middle of the gap is sent on, falling as it was, and arrives at the same height', () => {
    const ctx = world({ below: { map: 2, gap: 1, x: 2, y: 1 } });
    const p = ctx.$gamePlayer;
    // The map under is 8 tall: with the floor between and 1 over it, its floor is 10 down.
    ctx.Reactor3D.Neighbors.records.set(2, { mapId: 2, state: 'ready', map: { width: 4, height: 3, reactor3d: { room: { height: 8 } } }, used: 1 });
    p._reactorAlt = -3; p._reactorVz = -0.2;
    assert.equal(p.leaveByLevel(), false, 'not yet halfway');
    p._reactorAlt = -5.5; p._reactorVz = -0.4; p._reactorPeak = 0;
    assert.equal(p.leaveByLevel(), true);
    assert.equal(p.isTransferring(), true); assert.equal(p.newMapId(), 2); assert.equal(p.fadeType(), 0);
    assert.deepEqual(plain(p._levelArrival), { side: 'below', alt: 4.5, vz: -0.4, peak: 10, rise: 10, realX: 5, realY: 4, whole: false }, 'no world stands built under it: with a fade');
    assert.equal(p.leaveByLevel(), false, 'one transfer, not one a frame');
    // The map under: smaller than where the player stood allows, so the tile is held to it.
    const W = 4, H = 3, tiles = new Array(W * H * 6).fill(0);
    for (let i = 0; i < W * H; i++) tiles[i] = 1536;
    ctx.$dataMap = Object.assign(plain(ctx.$dataMap), { width: W, height: H, data: tiles, reactor3d: undefined });
    p.performTransfer();
    assert.equal(ctx.$gameMap.mapId(), 2);
    assert.deepEqual([p.x, p.y], [3, 2], 'tile (5 - 2, 4 - 1), held to the map');
    assert.equal(p._reactorAlt, 4.5, 'under the ceiling, to fall the rest of the way');
    assert.equal(p._reactorVz, -0.4); assert.equal(p._reactorPeak, 10, 'the fall is counted from where it began');
    assert.equal(p._levelArrival, null); assert.equal(p.isTransferring(), false);
});

test('an event\'s transfer, a forced route, a battle on the map or a map with no such map keeps the player here', () => {
    let ctx = world({ above: { map: 3, gap: 0 } }), p = ctx.$gamePlayer;
    const rise = ctx.Reactor3D.levelRise(ctx.$dataMap, 'above', { map: 3, gap: 0 });
    p._reactorAlt = rise / 2 + 0.5;
    assert.equal(p.leaveByLevel(), true); assert.equal(p.newMapId(), 3); assert.equal(p._levelArrival.alt, 0.5 - rise / 2);
    p.reserveTransfer(2, 1, 1, 2, 0);
    assert.equal(p._levelArrival, null, 'a transfer reserved after is a transfer like any other');
    ctx = world({ above: { map: 9, gap: 0 } }); p = ctx.$gamePlayer; p._reactorAlt = 50;
    assert.equal(p.leaveByLevel(), false, 'map 9 is not in the project');
    ctx = world({ above: { map: 3, gap: 0 } }); p = ctx.$gamePlayer; p._reactorAlt = 50;
    p.isMoveRouteForcing = () => true;
    assert.equal(p.leaveByLevel(), false);
    ctx = world({}); p = ctx.$gamePlayer; p._reactorAlt = -50;
    assert.equal(p.leaveByLevel(), false);
    const source = fs.readFileSync(path.join(root, 'runtime/reactor_objects_map.js'), 'utf8');
    assert.match(source, /if \(sceneActive\) this\.leaveByLevel\(\);/, 'asked each update the player is played');
});

function edges() {
    const context = { console, Reactor3D: R, document: { readyState: 'complete', getElementById: () => null }, module: { exports: {} } };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapEdges.js'), 'utf8'), context);
    return context.RRMapEdges;
}

test('the panel reads the map over and under and stores what a change says', () => {
    const E = edges();
    const map = { id: 1, width: 10, height: 8, reactor3d: { surround: { style: 'continue', neighbors: { north: { map: 2 } }, levels: { below: { map: 4, gap: 12, x: 3 } } } } };
    const view = E.read(map);
    assert.deepEqual(plain(view.levels), { above: null, below: { map: 4, x: 3, y: 0, gap: 12, openings: [] } });
    assert.deepEqual(plain(view.neighbors.north), { map: 2, shift: 0 }, 'the sides are read as before');
    let stored = E.patch(map.reactor3d.surround, { levels: { above: { map: 6 } } });
    assert.deepEqual(plain(stored.levels), { above: { map: 6, gap: 0 }, below: { map: 4, gap: 12, x: 3 } });
    stored = E.patch(stored, { levels: { below: { map: 4, gap: 20, x: 0, y: 5 } } });
    assert.deepEqual(plain(stored.levels.below), { map: 4, gap: 20, y: 5 });
    stored = E.patch(stored, { levels: { above: null }, style: 'none', neighbors: { north: null } });
    assert.deepEqual(plain(stored), { style: 'none', levels: { below: { map: 4, gap: 20, y: 5 } } }, 'the level stays when the land and the sides go');
    assert.equal(E.patch(stored, { levels: { below: null } }), null);
    assert.deepEqual(plain(E.LEVELS), ['above', 'below']); assert.deepEqual(plain(E.SIDES), ['north', 'east', 'south', 'west']);
});

test('a save writes the way back into the map over or under, the same distance apart and the same tiles matched', () => {
    const E = edges();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-levels-'));
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        const file = name => path.join(dir, 'data', name);
        for (const id of ['002', '003']) fs.writeFileSync(file(`Map${id}.json`), '{}');
        fs.writeFileSync(file('Map002.r3d.json'), JSON.stringify({ version: 1, lights: [{ x: 1, y: 2 }], surround: { style: 'ocean', neighbors: { west: { map: 7 } } } }));
        fs.writeFileSync(file('Map003.r3d.json'), JSON.stringify({ version: 1, surround: { style: 'none', levels: { below: { map: 9, gap: 5 } } } }));
        const map = { id: 1, reactor3d: { surround: { style: 'none', levels: { below: { map: 2, gap: 12, x: 3, y: -2 }, above: { map: 3, gap: 6 } } } } };
        const linked = E.linkBack(fs, path, dir, map);
        assert.deepEqual(plain(linked), [2], 'map 3 already has a map under it and is left alone');
        const two = JSON.parse(fs.readFileSync(file('Map002.r3d.json'), 'utf8'));
        assert.deepEqual(two.surround.levels, { above: { map: 1, gap: 12, x: -3, y: 2 } });
        assert.deepEqual(two.surround.neighbors, { west: { map: 7 } }); assert.deepEqual(two.lights, [{ x: 1, y: 2 }]); assert.equal(two.surround.style, 'ocean');
        assert.deepEqual(JSON.parse(fs.readFileSync(file('Map003.r3d.json'), 'utf8')).surround.levels, { below: { map: 9, gap: 5 } });
        assert.deepEqual(plain(E.linkBack(fs, path, dir, map)), [], 'written once');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Beyond the Border has an Above and Below section beside Neighboring Maps', () => {
    const bar = fs.readFileSync(path.join(root, 'editor/src/BuildHotbar.js'), 'utf8');
    assert.match(bar, /data-more="levels"[^\n]*tt\('Above and Below'\)/);
    assert.match(bar, /class="database-field-value rr-build-lmap" data-side="\$\{side\}"/);
    for (const label of ['Space between (tiles)', 'Across (tiles)', 'Down (tiles)']) assert.ok(bar.includes(`'${label}'`), label);
    assert.match(bar, /commit\(\{ levels: \{ \[side\]: el\.value \? Object\.assign\(\{ x: 0, y: 0 \}, was, \{ map: Number\(el\.value\) \}\) : null \} \}\);/);
    const terrain = fs.readFileSync(path.join(root, 'editor/src/TerrainManager.js'), 'utf8');
    assert.match(terrain, /const \{ style, edges, neighbors, levels, \.\.\.numbers \}/, 'a level taken away is not kept with the numbers the land comes back with');
});

test('an opening is a place with no ground of the upper map\'s own: what is stood on there is the map under', () => {
    assert.deepEqual(plain(R.normalizeLevels({ below: { map: 4, openings: [{ x: 7, y: 7, w: 2 }, { x: 1.4, y: 2, w: 900, h: 0 }, null, 'no'] } }).below.openings),
        [{ x: 7, y: 7, w: 2, h: 1 }, { x: 1, y: 2, w: 64, h: 1 }]);
    assert.equal(R.normalizeLevels({ below: { map: 4, openings: new Array(20).fill({ x: 0, y: 0 }) } }).below.openings.length, R.LEVEL_OPENINGS);
    assert.equal('openings' in R.normalizeLevels({ below: { map: 4, openings: [] } }).below, false);
    // The map under: flat, with a block two tiles high where the stair's top would be.
    const lower = { width: 10, height: 10, data: [], reactor3d: { room: { height: 7 }, elevation: { height: new Array(100).fill(0) } } };
    const upper = { width: 20, height: 20, data: [], reactor3d: { surround: { levels: { below: { map: 44, gap: 0, x: 5, y: 5, openings: [{ x: 7, y: 7, w: 2, h: 1 }] } } } } };
    assert.equal(R.levelOpening(upper, 'below', 7.9, 7.2).map, 44); assert.equal(R.levelOpening(upper, 'below', 8.5, 7.5).map, 44);
    assert.equal(R.levelOpening(upper, 'below', 9, 7), null); assert.equal(R.levelOpening(upper, 'above', 7, 7), null);
    assert.equal(R.groundHeightAt(upper, 7.5, 7.5), 0, 'ground of its own until the map under is read');
    R.Neighbors.records.set(44, { mapId: 44, state: 'ready', map: lower, used: 1 });
    try {
        assert.equal(R.groundHeightAt(upper, 7.5, 7.5), -8, 'then the floor of the map under, eight tiles down');
        assert.equal(R.groundHeightAt(upper, 9.5, 7.5), 0, 'beside the opening the ground is this map\'s');
        assert.equal(R.viewGroundAt(upper, 7.5, 7.5, 0), 0, 'the view does not dive down the opening');
        const stairs = R.groundHeightAt;
        // What the map under sends up through the opening is stood on: its surface, in this map's measure.
        R.groundHeightAt = function(map, x, z, near) { return map === lower ? (x >= 2 && x < 3 ? 7.5 : 0) : stairs.call(this, map, x, z, near); };
        try { assert.equal(R.groundThroughLevel(upper, 7.5, 7.5, 0), -0.5, 'the top of a stair half a tile under this map\'s ground'); assert.equal(R.groundThroughLevel(upper, 8.5, 7.5, 0), -8); }
        finally { R.groundHeightAt = stairs; }
        const outside = { width: 20, height: 20, data: [], reactor3d: { surround: { levels: { below: { map: 44, gap: 0, x: 15, y: 15, openings: [{ x: 1, y: 1 }] } } } } };
        assert.equal(R.groundHeightAt(outside, 1.5, 1.5), 0, 'an opening past the edge of the map under opens onto nothing: the ground stays');
    } finally { R.Neighbors.records.delete(44); }
});

test('a save keeps the other map\'s entry in step: the distance, the place and the openings, in its own tiles', () => {
    const context = { console, Reactor3D: R, document: { readyState: 'complete', getElementById: () => null }, module: { exports: {} } };
    context.globalThis = context; vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapEdges.js'), 'utf8'), context);
    const E = context.RRMapEdges, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-levels-'));
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        const file = name => path.join(dir, 'data', name);
        fs.writeFileSync(file('Map002.json'), '{}');
        const map = { id: 1, reactor3d: { surround: { style: 'none', levels: { below: { map: 2, gap: 8, x: 5, y: 5, openings: [{ x: 7, y: 7, w: 2, h: 1 }] } } } } };
        assert.deepEqual(plain(E.linkBack(fs, path, dir, map)), [2]);
        assert.deepEqual(JSON.parse(fs.readFileSync(file('Map002.r3d.json'), 'utf8')).surround.levels.above, { map: 1, gap: 8, x: -5, y: -5, openings: [{ x: 2, y: 2, w: 2, h: 1 }] });
        assert.deepEqual(plain(E.linkBack(fs, path, dir, map)), [], 'nothing to write when it is in step');
        map.reactor3d.surround.levels.below.openings.push({ x: 10, y: 9, w: 1, h: 3 }); map.reactor3d.surround.levels.below.gap = 6;
        assert.deepEqual(plain(E.linkBack(fs, path, dir, map)), [2], 'a new opening and a new distance are written through');
        const above = JSON.parse(fs.readFileSync(file('Map002.r3d.json'), 'utf8')).surround.levels.above;
        assert.equal(above.gap, 6); assert.deepEqual(above.openings[1], { x: 5, y: 4, w: 1, h: 3 });
        // The panel carries the openings through a change of another field.
        const stored = E.patch(map.reactor3d.surround, { levels: { below: Object.assign({}, E.read(map).levels.below, { gap: 10 }) } });
        assert.equal(stored.levels.below.openings.length, 2); assert.equal(stored.levels.below.gap, 10);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an opening is cut out of the upper map\'s ground and the lower map\'s ceiling, and of nothing else', () => {
    const L = R.Levels, cut = L.cutUniforms();
    const flat = (w, h, more) => Object.assign({ width: w, height: h, data: [], reactor3d: {} }, more);
    // Played from above: this map's ground at 0, the room under it 5 tall with 7 over its ceiling: its floor 12 down.
    const lower = flat(10, 10, { reactor3d: { room: { height: 5, ceiling: 'Ceiling', floor: 'Floor' } } }), upper = flat(20, 20);
    const below = { map: 2, gap: 6, x: 5, y: 5, openings: [{ x: 7, y: 7, w: 2, h: 1 }, { x: 9, y: 9, w: 1, h: 1 }] };
    cut.rrLvlCount.value = 0; L.cutFor(cut, upper, 'below', below, lower);
    assert.equal(cut.rrLvlCount.value, 2);
    assert.deepEqual(Array.from(cut.rrLvlBox.value.slice(0, 8)), [7, 7, 9, 8, 9, 9, 10, 10]);
    const band = Array.from(cut.rrLvlBand.value.slice(0, 4)).map(v => Math.round(v * 100) / 100);
    assert.deepEqual(band, [-L.GROUND_UNDER, L.GROUND_OVER, -7.06, -6.94], 'a hand round this map\'s ground, and round the ceiling 7 tiles down');
    // Played from below: the same opening in the lower map's tiles, the upper map's ground 12 up, this map's ceiling 5 up.
    const above = { map: 1, gap: 6, x: -5, y: -5, openings: [{ x: 2, y: 2, w: 2, h: 1 }] };
    cut.rrLvlCount.value = 0; L.cutFor(cut, lower, 'above', above, upper);
    assert.deepEqual(Array.from(cut.rrLvlBox.value.slice(0, 4)), [2, 2, 4, 3]);
    assert.deepEqual(Array.from(cut.rrLvlBand.value.slice(0, 4)).map(v => Math.round(v * 100) / 100), [12 - L.GROUND_UNDER, 12 + L.GROUND_OVER, 4.94, 5.06]);
    // A lower map with no ceiling has none to cut: a band that holds nothing.
    cut.rrLvlCount.value = 0; L.cutFor(cut, upper, 'below', below, flat(10, 10, { reactor3d: { room: { height: 5, floor: 'Floor' } } }));
    assert.ok(cut.rrLvlBand.value[2] > cut.rrLvlBand.value[3]);
    // No more boxes than the shader asks about.
    cut.rrLvlCount.value = 0; L.cutFor(cut, upper, 'below', Object.assign({}, below, { openings: new Array(7).fill({ x: 7, y: 7, w: 1, h: 1 }) }), lower);
    assert.equal(cut.rrLvlCount.value, L.CUTS);
    // An opening that does not lie over the other map is not cut (from above or from below).
    cut.rrLvlCount.value = 0; L.cutFor(cut, upper, 'below', Object.assign({}, below, { openings: [{ x: 1, y: 1, w: 1, h: 1 }, { x: 14, y: 14, w: 2, h: 1 }, { x: 7, y: 7, w: 1, h: 1 }] }), lower);
    assert.equal(cut.rrLvlCount.value, 1);
    cut.rrLvlCount.value = 0; L.cutFor(cut, lower, 'above', Object.assign({}, above, { openings: [{ x: 60, y: 2, w: 1, h: 1 }] }), upper);
    assert.equal(cut.rrLvlCount.value, 0);
    assert.deepEqual(L.offsetOf('below', below, 12), { x: 5, y: -12, z: 5 }); assert.deepEqual(L.offsetOf('above', above, 12), { x: -5, y: 12, z: -5 });
    // Every lit material asks: what faces up in the ground band, what faces down in the ceiling band, inside a box.
    const shader = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: 'varying vec3 vRRWorldPos;\nvoid main() {\n#include <map_fragment>\n}' };
    R.injectLevelCut({}, shader);
    assert.equal(shader.uniforms.rrLvlCount, cut.rrLvlCount, 'one set of values for all of them');
    assert.match(shader.fragmentShader, /uniform vec4 rrLvlBox\[4\];\nuniform vec4 rrLvlBand\[4\];\nuniform int rrLvlCount;/);
    assert.match(shader.fragmentShader, /vRRWorldPos\.y > rrLd\.x && vRRWorldPos\.y < rrLd\.y && !\(abs\(vRRWorldNormal\.y\) < 0\.5\)\) discard;/);
    assert.match(shader.fragmentShader, /vRRWorldPos\.y > rrLd\.z && vRRWorldPos\.y < rrLd\.w && !\(abs\(vRRWorldNormal\.y\) < 0\.5\)\) discard;/);
    assert.match(shader.vertexShader, /vRRWorldNormal = /);
    const once = shader.fragmentShader; R.injectLevelCut({}, shader); assert.equal(shader.fragmentShader, once, 'injected once');
    cut.rrLvlCount.value = 0;
    // A map with no level, or the levels switched off, cuts nothing and stands nothing.
    L.update(null); assert.equal(cut.rrLvlCount.value, 0); assert.equal(L.bodies, null);
});

test('a walker steps into an opening whatever the drop, and a level\'s sky shows only up through its openings', () => {
    const physics = fs.readFileSync(path.join(root, 'runtime/reactor_physics.js'), 'utf8');
    assert.match(physics, /if \(R\.levelOpening && this\.DIRS\[d\] && R\.levelOpening\(\$dataMap, "below", x \+ this\.DIRS\[d\]\[0\], y \+ this\.DIRS\[d\]\[1\]\)\) return true;/);
    const surround = fs.readFileSync(path.join(root, 'runtime/reactor_3d_surround.js'), 'utf8');
    assert.match(surround, /L\.sky\(body, live\.camera \? live\.camera\.position : null\);/, 'seen to each frame');
    // The map under shows no sky; the map over shows its own, windowed, stood round the eye.
    const L = R.Levels, cut = L.cutUniforms(), sky = side => ({ side, offset: { x: 5, z: 7 }, rise: side === 'above' ? 12 : -12,
        scene: { _sky: { visible: true, material: { userData: {} }, position: { set(x, y, z) { this.at = [x, y, z]; } }, updateMatrix() {} } } });
    const under = sky('below'), over = sky('above');
    cut.rrLvlCount.value = 1;
    L.sky(under, { x: 10, y: 3, z: 10 }); L.sky(over, { x: 10, y: 3, z: 10 });
    assert.equal(under.scene._sky.visible, false);
    assert.equal(over.scene._sky.visible, true); assert.equal(over.scene._sky.material.userData.rrSkyWindow.value, 1);
    assert.deepEqual(over.scene._sky.position.at, [5, -9, 3], 'round the eye, in its own world\'s measure');
    cut.rrLvlCount.value = 0; L.sky(over, { x: 10, y: 3, z: 10 });
    assert.equal(over.scene._sky.visible, false, 'no opening: no sky');
    const main = fs.readFileSync(path.join(root, 'runtime/reactor_3d.js'), 'utf8');
    assert.match(main, /float rrSt = \(rrLvlBand\[rrSi\]\.y - cameraPosition\.y\) \/ rrSkyDir\.y;/, 'where the line from the eye meets the upper map\'s ground');
    assert.match(main, /if \(!rrSkyOpen\) discard;/);
    const sprites = fs.readFileSync(path.join(root, 'runtime/reactor_sprites.js'), 'utf8');
    assert.match(sprites, /if \(Reactor3D\.Levels\) Reactor3D\.Levels\.update\(state\);/);
});

test('a level whose world stands built is passed into without a break: no fade, everyone where they were', () => {
    const ctx = world({ below: { map: 2, gap: 1, x: 2, y: 1, openings: [{ x: 5, y: 4, w: 1, h: 1 }] } }, { party: [1, 2] });
    const E = ctx.Reactor3D, N = E.Neighbors, L = E.Levels, p = ctx.$gamePlayer;
    const lower = { width: 8, height: 8, reactor3d: { room: { height: 8 } } };
    N.records.set(2, { mapId: 2, state: 'ready', map: lower, text: ['{}', ''], used: 1 });
    const main = { _scene: {} };
    N.live = { scene: main }; L.main = main;
    assert.equal(N.ready('below'), false, 'nothing stands under it yet');
    L.bodies = { below: { mapId: 2, side: 'below', stage: 1, offset: { x: 2, z: 1 }, rise: -10, scene: {}, group: {} } };
    assert.equal(N.ready('below'), false, 'still being laid');
    L.bodies.below.stage = 0;
    assert.equal(N.ready('below'), true);
    const follower = p._followers._data[0];
    follower._reactorAlt = -1; follower._rrTh = 0;
    const before = [follower._realX, follower._realY];
    p._realX = 5.25; p._reactorAlt = -5.5; p._reactorVz = -0.4;
    assert.equal(p.leaveByLevel(), true);
    assert.equal(p.fadeType(), 2, 'no fade');
    assert.equal(p._levelArrival.whole, true);
    assert.deepEqual(plain(N.crossing), { from: 1, to: 2, side: 'below', level: true, offset: { x: 2, y: -10, z: 1 } });
    // The map entered: the leader keeps its place to the fraction of a tile, the followers theirs, 10 tiles higher in its measure.
    ctx.$dataMap = Object.assign(plain(ctx.$dataMap), { width: 8, height: 8, data: new Array(8 * 8 * 6).fill(0), reactor3d: undefined });
    p.performTransfer();
    assert.equal(ctx.$gameMap.mapId(), 2);
    assert.deepEqual([p.x, p.y, p._realX, p._realY], [3, 3, 3.25, 3]);
    assert.equal(p._reactorAlt, 4.5);
    assert.deepEqual([follower._realX, follower._realY], [before[0] - 2, before[1] - 1], 'not gathered onto the leader');
    assert.equal(follower._reactorAlt, 9); assert.equal(follower._rrTh, 10);
    N.crossing = null; N.live = null; L.bodies = null; L.main = null; N.records.delete(2);
    // The world left stands on over the one entered: carried models move by the height too.
    const moved = { position: { x: 1, y: 2, z: 3 }, updateMatrixWorld() {} }, added = [];
    N.carryParty({ _modelInstances: new Map([['p', { object: moved }]]) }, { modelsGroup: () => ({ add: o => added.push(o) }) }, null, null, null, { x: -2, y: 10, z: -1 });
    assert.deepEqual(plain(moved.position), { x: -1, y: 12, z: 2 }); assert.equal(added.length, 1);
    const source = fs.readFileSync(path.join(root, 'runtime/reactor_3d_surround.js'), 'utf8');
    assert.match(source, /if \(cross\.level\) return R\.Levels\.adopt\(mapId, cross, old\);/);
    assert.match(source, /L\.bodies = \{ \[back\]: \{ mapId: cross\.from/, 'the map left stands on the other side of the one entered');
});

test('the map views outline each opening and show the other map through it (RRMapLevelView)', () => {
    const context = { console, Reactor3D: R, module: { exports: {} } };
    context.globalThis = context; vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapLevelView.js'), 'utf8'), context);
    const V = context.RRMapLevelView;
    const map = { width: 20, height: 20, data: [], reactor3d: { room: { height: 5 }, surround: { levels: {
        below: { map: 2, x: 5, y: 5, openings: [{ x: 7, y: 7, w: 2, h: 1 }] }, above: { map: 3 } } } } };
    // Only a level with openings is shown: the other has nothing to be seen through.
    assert.deepEqual(Object.keys(V.open(map)), ['below']);
    assert.equal(V.keyOf({ map: 2, x: 5, y: 5 }, 's1', 12), '2:5:5:12|s1');
    assert.notEqual(V.keyOf({ map: 2, x: 5, y: 5 }, 's1', 12), V.keyOf({ map: 2, x: 5, y: 5 }, 's2', 12), 'built again when its files are written');
    assert.notEqual(V.keyOf({ map: 2, x: 5, y: 5 }, 's1', 12), V.keyOf({ map: 2, x: 5, y: 5 }, 's1', 13), 'and when the maps come to lie another distance apart');
    // An opening's mark: its outline here, the same where it comes out, and the four corners between (12 lines).
    const lines = V.lines({ x: 7, y: 7, w: 2, h: 1 }, 0.5, -12);
    assert.equal(lines.length, 12 * 6);
    assert.deepEqual(plain(lines.slice(0, 6)), [7, 0.5, 7, 9, 0.5, 7]);
    assert.deepEqual(plain(lines.slice(-6)), [7, 0.5, 8, 7, -11.5, 8]);
    assert.equal(V.groundIn(map, { x: 7, y: 7, w: 2, h: 1 }), 0);
    // The map over this one is shown only near its openings, from just under this map's top.
    assert.equal(V.cropAt(map, { map: 3, gap: 0 }), 4.95);
    assert.equal(V.cropAt(map, { map: 3, gap: 6 }), 10);
    assert.equal(V.label('below', { map: 2 }, [null, { id: 2, name: 'Cellar' }]), '▼ 002: Cellar');
    assert.equal(V.label('above', { map: 3 }, null), '▲ 003');
    // With no 3D runtime loaded (a 2D session) the openings are read off the map as stored.
    const bare = { console, module: { exports: {} } }; bare.globalThis = bare; vm.createContext(bare);
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapLevelView.js'), 'utf8'), bare);
    assert.deepEqual(plain(bare.RRMapLevelView.open2D(map)), { below: { map: 2, openings: [{ x: 7, y: 7, w: 2, h: 1 }] } });
    const index = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8'), view = fs.readFileSync(path.join(root, 'editor/src/MapEditor3D.js'), 'utf8'), flat = fs.readFileSync(path.join(root, 'editor/src/TilemapManager.js'), 'utf8');
    assert.match(index, /src\/utils\/MapLevelView\.js/);
    assert.match(view, /RRMapLevelView\?\.sync\(this\)/); assert.match(view, /RRMapLevelView\?\.hold\(this\)/); assert.match(view, /RRMapLevelView\?\.pass\(this, false\)/);
    assert.match(flat, /RRMapLevelView\?\.sync2D\(this\)/); assert.match(flat, /RRMapLevelView\?\.detach\(this\)/);
    // In the game the level's world takes the pass its map's takes: drawn over a cleared depth it showed through the ceiling.
    assert.match(fs.readFileSync(path.join(root, 'runtime/reactor_3d.js'), 'utf8'), /levels\.main === this && levels\.bodies && !this\._settingPass/);
});

test('the panel places the two maps by where the first opening comes out, held inside the other map', () => {
    const E = edges(), size = { width: 50, height: 50 };
    // What the owner had: the other map's corner under tile 24, 23 and an opening at 97, 53 comes out at 73, 30, past a map of 50.
    const level = { map: 1, gap: 0, x: 24, y: 23, openings: [{ x: 97, y: 53, w: 3, h: 3 }] };
    assert.deepEqual(plain(E.landing(level)), { x: 73, y: 30 });
    assert.equal(E.landing({ map: 1, openings: [] }), null);
    const set = E.withLanding(level, { x: 24, y: 23 }, size);
    assert.deepEqual([set.x, set.y], [73, 30]); assert.deepEqual(plain(E.landing(set)), { x: 24, y: 23 });
    assert.deepEqual(plain(E.landing(E.withLanding(level, { x: 99, y: -4 }, size))), { x: 47, y: 0 }, 'the whole opening (3 wide) inside a map of 50');
    assert.deepEqual(plain(E.landing(E.withLanding(level, { x: 99, y: -4 }, null))), { x: 99, y: -4 }, 'a map that cannot be read holds nothing');
    // Moving the first opening keeps where it comes out; another opening moves alone.
    const moved = E.withOpening(set, 0, 'x', 90, size);
    assert.equal(moved.openings[0].x, 90); assert.deepEqual(plain(E.landing(moved)), { x: 24, y: 23 }); assert.equal(moved.x, 66);
    const two = Object.assign({}, set, { openings: set.openings.concat([{ x: 80, y: 40, w: 1, h: 1 }]) });
    const other = E.withOpening(two, 1, 'y', 44, size);
    assert.deepEqual([other.x, other.y, other.openings[1].y], [73, 30, 44]);
    // The first opening added comes out in the middle of the other map; a second changes nothing of the placing.
    const fresh = E.withNewOpening({ map: 1, gap: 0, x: 0, y: 0, openings: [] }, { x: 97, y: 53 }, size);
    assert.deepEqual(plain(E.landing(fresh)), { x: 25, y: 25 });
    const again = E.withNewOpening(fresh, { x: 10, y: 10 }, size);
    assert.deepEqual([again.x, again.y, again.openings.length], [fresh.x, fresh.y, 2]);
    const bar = fs.readFileSync(path.join(root, 'editor/src/BuildHotbar.js'), 'utf8');
    assert.match(bar, /rr-build-lland/); assert.match(bar, /if \(body\) body\.scrollTop = top;/, 'the panel stays scrolled where it was');
});

test('the maps are measured apart from the ground at the first opening, not from the upper map\'s height 0', () => {
    // An upper map whose ground stands 21 tiles up where the opening is, over a room 25 tall.
    const heights = new Array(400).fill(0);
    for (const [x, y] of [[7, 7], [8, 7]]) heights[y * 20 + x] = 21;
    const upper = { width: 20, height: 20, data: [], reactor3d: { elevation: heights } };
    const lower = { width: 10, height: 10, data: [], reactor3d: { room: { height: 25 } } };
    const below = { map: 2, gap: 0, x: 5, y: 5, openings: [{ x: 7, y: 7, w: 2, h: 1 }] }, above = { map: 1, gap: 0, x: -5, y: -5, openings: [{ x: 2, y: 2, w: 2, h: 1 }] };
    assert.equal(R.ownGroundAt(upper, 7.5, 7.5), 21);
    assert.equal(R.levelBase(upper, 'below', below), 21); assert.equal(R.levelBase(upper, 'above', above), 21, 'the same tiles, asked from below');
    // The room's floor lies 5 under the upper map's height 0: its ceiling at 20, a tile of floor, the opening's ground at 21.
    assert.equal(R.levelRise(upper, 'below', below, lower), 5); assert.equal(R.levelRise(lower, 'above', above, upper), 5);
    assert.equal(R.levelMiddle(upper, 'below', below, lower), 8, 'halfway between the ground at 21 and the floor at -5');
    assert.equal(R.levelMiddle(lower, 'above', above, upper), 13, 'the same height, in the lower map\'s measure');
    // A level with no opening is measured from height 0, as before.
    assert.equal(R.levelRise(upper, 'below', { map: 2, gap: 0 }, lower), 26);
});

test('a ladder about to be laid previews as one wide ladder, not one a column', () => {
    // No map to find the columns' neighbors in: the levels of the run are told of each other.
    const run = [-1, 0, 1].flatMap(t => [0, 1].map(z => ({ kind: 'ladder', x: t, y: 0, z, rot: 0 })));
    const joined = R.joinLadders(run);
    assert.deepEqual(plain(joined.map(p => p.ladderJoin)), [{ hi: true }, { hi: true }, { hi: true, lo: true }, { hi: true, lo: true }, { lo: true }, { lo: true }]);
    assert.equal(R.joinLadders([{ kind: 'ladder', x: 0, y: 0, z: 0, rot: 0 }])[0].ladderJoin, undefined, 'a ladder one column wide keeps both rails');
    // Turned a quarter, its columns run the other way; a level above or below is not beside it.
    const turned = R.joinLadders([0, 1].map(t => ({ kind: 'ladder', x: 0, y: t, z: 0, rot: 1 })));
    assert.equal(turned.filter(p => p.ladderJoin).length, 2);
    assert.equal(R.joinLadders([0, 1].map(t => ({ kind: 'ladder', x: t, y: 0, z: 0, rot: 1 }))).filter(p => p.ladderJoin).length, 0, 'in a line along the climb they are not one ladder');
});

test('a preview is drawn as the pieces will be laid: joined to the run and to the map, each on the ground of its own cell', () => {
    const flat = pieces => ({ width: 20, height: 20, data: [], reactor3d: { pieces } });
    // A ladder 3 wide, counted from the cell it is laid at: one ladder.
    const run = [-1, 0, 1].map(t => ({ kind: 'ladder', x: t, y: 0, z: 0, rot: 0 }));
    assert.deepEqual(plain(R.previewPieces(run, flat([]), { x: 5, y: 5, z: 0 }).map(p => p.ladderJoin)), [{ hi: true }, { hi: true, lo: true }, { lo: true }]);
    // One column beside a ladder that already stands on the map joins it; one level higher does not.
    const stands = flat([{ id: 1, kind: 'ladder', x: 6, y: 5, z: 0, rot: 0 }]);
    assert.deepEqual(plain(R.previewPieces([{ kind: 'ladder', x: 0, y: 0, z: 0, rot: 0 }], stands, { x: 5, y: 5, z: 0 })[0].ladderJoin), { hi: true });
    assert.equal(R.previewPieces([{ kind: 'ladder', x: 0, y: 0, z: 0, rot: 0 }], stands, { x: 5, y: 5, z: 1 })[0].ladderJoin, undefined);
    assert.equal(R.previewPieces([{ kind: 'ladder', x: 0, y: 0, z: 0, rot: 0 }], stands, { x: 9, y: 9, z: 0 })[0].ladderJoin, undefined);
    // A fence beside a fence on the map joins it, as the laid one does (the same rule: fenceJoins).
    const fenced = flat([{ id: 1, kind: 'fence', x: 6, y: 5, z: 0, rot: 0 }]);
    const fence = R.previewPieces([{ kind: 'fence', x: 0, y: 0, z: 0, rot: 1 }], fenced, { x: 5, y: 5, z: 0 })[0];
    assert.deepEqual(plain(fence.fenceJoin), [[1, 0]]); assert.equal(fence.rot, 0);
    assert.equal(R.previewPieces([{ kind: 'fence', x: 0, y: 0, z: 0, rot: 1 }], fenced, { x: 12, y: 5, z: 0 })[0].fenceJoin, undefined, 'alone it stands as it is turned');
    // A stair laid two levels up over a block: its support stops on the block's top, in the preview's own measure.
    const blocked = flat([{ id: 1, kind: 'block', x: 5, y: 5, z: 0, rot: 0 }]);
    const stair = R.previewPieces([{ kind: 'stair', x: 0, y: 0, z: 0, rot: 0 }], blocked, { x: 5, y: 5, z: 2 })[0];
    assert.equal(stair.supportTop, R.pieceTop(R.normalizePiece(blocked.reactor3d.pieces[0], blocked), 0.5, 0.5) - 2);
    // Each piece stands on its own cell's ground: a brush over a step in the ground is drawn stepped.
    const heights = new Array(400).fill(0); heights[5 * 20 + 6] = 2;
    const stepped = { width: 20, height: 20, data: [], reactor3d: { elevation: heights } };
    const brush = R.previewPieces([{ kind: 'floor', x: 0, y: 0, z: 0, rot: 0 }, { kind: 'floor', x: 1, y: 0, z: 0, rot: 0 }], stepped, { x: 5, y: 5, z: 0 });
    assert.equal(brush[0].previewBase, undefined); assert.equal(brush[1].previewBase, R.pieceBaseAt(stepped, 6, 5) - R.pieceBaseAt(stepped, 5, 5));
    assert.ok(brush[1].previewBase > 0);
    // With no map (a blueprint's preview) the run still joins itself.
    assert.deepEqual(plain(R.previewPieces(run, null, { x: 0, y: 0, z: 0 }).map(p => p.ladderJoin)), [{ hi: true }, { hi: true, lo: true }, { lo: true }]);
    const view = fs.readFileSync(path.join(root, 'editor/src/MapEditor3D.js'), 'utf8');
    assert.match(view, /Reactor3D\.previewPieces\(manager\.kind === 'stair'/); assert.match(view, /':meets:' \+ JSON\.stringify/, 'made again when what it meets changes');
    assert.match(fs.readFileSync(path.join(root, 'editor/src/PieceBuilderManager.js'), 'utf8'), /Reactor3D\.previewPieces\(pieces, null, \{ x: 0, y: 0, z: 0 \}\)/);
    assert.match(fs.readFileSync(path.join(root, 'runtime/reactor_3d_world.js'), 'utf8'), /: \(piece\.previewBase \|\| 0\);/);
});
