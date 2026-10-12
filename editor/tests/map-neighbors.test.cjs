'use strict';
// The maps past a map's border (`surround.neighbors` in the 3D sidecar): a step off the map on a
// side that names a map goes on into that map. The data rules are reactor_3d_surround.js's, the
// crossing Game_Player's (reactor_objects_map.js), the form and the way back RRMapEdges'.
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

test('neighbors are read back as written, and only sides that name a map are kept', () => {
    assert.deepEqual(R.normalizeNeighbors(null), {});
    assert.deepEqual(R.normalizeNeighbors({ north: { map: 7, shift: 4 }, east: { map: 0 }, south: 3, west: { map: 'x' }, up: { map: 2 } }),
        { north: { map: 7, shift: 4 }, south: { map: 3 } });
    assert.deepEqual(R.normalizeNeighbors({ north: { map: 7.4, shift: 0 } }), { north: { map: 7 } }, 'no shift is not said');
    const map = { width: 10, height: 8, reactor3d: { surround: { style: 'ocean', neighbors: { west: { map: 2, shift: -3 } } } } };
    assert.deepEqual(R.neighborsOf(map), { west: { map: 2, shift: -3 } });
    assert.deepEqual(R.surroundOf(map).neighbors, { west: { map: 2, shift: -3 } });
    assert.deepEqual(R.neighborsOf({ width: 4, height: 4 }), {});
});

test('a border with a neighbor and no land is kept, and lays nothing', () => {
    const only = R.normalizeSurround({ style: 'none', neighbors: { north: { map: 2 } } });
    assert.ok(only, 'a neighbor alone is something past the border');
    assert.equal(only.style, 'none');
    assert.equal(R.normalizeSurround({ style: 'none', neighbors: { north: { map: 0 } } }), null);
    const map = { width: 12, height: 9, note: '', reactor3d: { surround: { style: 'none', neighbors: { north: { map: 2 } } } } };
    const built = R.surroundGeometry(map, R.surroundOf(map), { floorY: 0 });
    assert.equal(built.ground.index.length, 0);
});

test('a step leaves by the side it faces, only from the border, at the tile the shift gives', () => {
    const map = { width: 10, height: 8, reactor3d: { surround: { style: 'continue', neighbors: { north: { map: 2, shift: 3 }, east: { map: 5 } } } } };
    assert.equal(R.neighborExit(map, 4, 1, 8), null, 'not at the border');
    assert.equal(R.neighborExit(map, 4, 0, 2), null, 'facing into the map');
    assert.equal(R.neighborExit(map, 0, 3, 4), null, 'no map past the west');
    assert.deepEqual(R.neighborExit(map, 4, 0, 8), { mapId: 2, side: 'north', along: 1, d: 8, inset: 0 });
    assert.deepEqual(R.neighborExit(map, 9, 6, 6), { mapId: 5, side: 'east', along: 6, d: 6, inset: 0 });
    // A vehicle's nose meets the border while its middle is still tiles away.
    assert.equal(R.neighborExit(map, 7, 3, 6), null);
    assert.deepEqual(R.neighborExit(map, 7, 3, 6, 2), { mapId: 5, side: 'east', along: 3, d: 6, inset: 2 });
});

test('the arrival is on the facing border, held to its length, at the nearest tile that can be stood on', () => {
    assert.deepEqual(R.neighborArrival({ side: 'north', along: 4 }, 20, 15), { x: 4, y: 14 });
    assert.deepEqual(R.neighborArrival({ side: 'south', along: 4 }, 20, 15), { x: 4, y: 0 });
    assert.deepEqual(R.neighborArrival({ side: 'west', along: 6 }, 20, 15), { x: 19, y: 6 });
    assert.deepEqual(R.neighborArrival({ side: 'east', along: 6 }, 20, 15), { x: 0, y: 6 });
    assert.deepEqual(R.neighborArrival({ side: 'north', along: 40 }, 20, 15), { x: 19, y: 14 }, 'past the neighbor\'s end');
    assert.deepEqual(R.neighborArrival({ side: 'north', along: -3 }, 20, 15), { x: 0, y: 14 });
    assert.deepEqual(R.neighborArrival({ side: 'east', along: 6, inset: 2 }, 20, 15), { x: 2, y: 6 }, 'a vehicle arrives whole');
    assert.deepEqual(R.neighborArrival({ side: 'north', along: 4, inset: 2 }, 20, 15), { x: 4, y: 12 });
    const blocked = new Set(['4,14', '5,14', '3,14']);
    assert.deepEqual(R.neighborArrival({ side: 'north', along: 4 }, 20, 15, (x, y) => !blocked.has(x + ',' + y)), { x: 2, y: 14 });
    assert.deepEqual(R.neighborArrival({ side: 'north', along: 4 }, 20, 15, () => false), { x: 4, y: 14 }, 'nowhere to stand: the plain tile');
});

function world(neighbors, options = {}) {
    const ctx = followerWorld(Object.assign({ width: 12, height: 10, start: [5, 0], party: [1],
        prepare(map, c) {
            map.reactor3d = Object.assign(map.reactor3d || {}, { surround: { style: 'none', neighbors } });
            c.$dataMapInfos = [null, { id: 1, name: 'Here' }, { id: 2, name: 'North' }, { id: 3, name: 'East' }];
        } }, options));
    return ctx;
}

test('walking off a side with a neighbor reserves the transfer; any other side is a border as before', () => {
    const ctx = world({ north: { map: 2, shift: 2 } });
    const p = ctx.$gamePlayer;
    ctx.hold(4); ctx.run(1);
    assert.equal(p.isTransferring(), false, 'west of here is no map');
    ctx.hold(0); ctx.run(60);
    ctx.hold(8); ctx.run(1);
    assert.equal(p.isTransferring(), true);
    assert.equal(p.newMapId(), 2);
    assert.equal(p.fadeType(), 0);
    assert.equal(p.direction(), 8);
    assert.equal(p._borderArrival.side, 'north');
    assert.equal(p._borderArrival.along, p.x - 2);
    // Still held on the frames the screen fades: one transfer, not one a frame.
    const reserved = p._borderArrival;
    ctx.run(3);
    assert.equal(p._borderArrival, reserved);
});

test('the player arrives on the neighbor\'s facing border, beside a wall when the tile itself is one', () => {
    const ctx = world({ north: { map: 2, shift: 2 } });
    const p = ctx.$gamePlayer;
    ctx.hold(8); ctx.run(1); ctx.hold(0);
    const along = p._borderArrival.along;
    // The neighbor: another size, a wall where the border is met.
    const W = 20, H = 16, tiles = new Array(W * H * 6).fill(0);
    for (let i = 0; i < W * H; i++) tiles[i] = 1536;
    tiles[(3 * H + (H - 1)) * W + along] = 1;
    ctx.$dataMap = Object.assign(plain(ctx.$dataMap), { width: W, height: H, data: tiles, reactor3d: undefined });
    p.performTransfer();
    assert.equal(ctx.$gameMap.mapId(), 2);
    assert.equal(p.y, H - 1);
    assert.equal(Math.abs(p.x - along), 1, 'one tile along the border from the wall');
    assert.equal(p.direction(), 8);
    assert.equal(p._borderArrival, null);
    assert.equal(p.isTransferring(), false);
});

test('an event\'s transfer reserved after the border was met goes where the event says', () => {
    const ctx = world({ north: { map: 2 } });
    const p = ctx.$gamePlayer;
    ctx.hold(8); ctx.run(1); ctx.hold(0);
    p.reserveTransfer(3, 7, 4, 2, 0);
    assert.equal(p._borderArrival, null);
    ctx.$dataMap = Object.assign(plain(ctx.$dataMap), { reactor3d: undefined });
    p.performTransfer();
    assert.equal(p.x, 7); assert.equal(p.y, 4);
});

test('a forced route, a map that is not in the project and a border with no neighbor do not leave', () => {
    const ctx = world({ north: { map: 9 }, east: { map: 3 } });
    const p = ctx.$gamePlayer;
    ctx.hold(8); ctx.run(1); ctx.hold(0);
    assert.equal(p.isTransferring(), false, 'map 9 is not in the project');
    p.locate(11, 4);
    p.forceMoveRoute({ list: [{ code: 3 }, { code: 0 }], repeat: false, skippable: true, wait: false });
    ctx.run(30);
    assert.equal(p.isTransferring(), false, 'an event walking the player into the border stops there');
    ctx.hold(6); ctx.run(1);
    assert.equal(p.isTransferring(), true);
    assert.equal(p.newMapId(), 3);
});

test('a click crosses the border only from the border tile the player already stands on', () => {
    const ctx = world({ north: { map: 2 } }, { start: [5, 3] });
    const p = ctx.$gamePlayer;
    // Walked by a click to the border tile: the walk ends there.
    ctx.$gameTemp.setDestination(5, 0);
    ctx.run(240, () => p.y === 0 && !p.isMoving());
    ctx.run(4);
    assert.equal(p.y, 0);
    assert.equal(p.isTransferring(), false);
    assert.equal(p.direction(), 8);
    // The same tile clicked again, facing out.
    ctx.$gameTemp.setDestination(5, 0);
    ctx.run(1);
    assert.equal(p.isTransferring(), true);
    assert.equal(p.newMapId(), 2);
});

//-----------------------------------------------------------------------------
// The editor: the form's rules and the way back

function edges() {
    const context = { console, Reactor3D: R, document: { readyState: 'complete', getElementById: () => null }, module: { exports: {} } };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/utils/MapEdges.js'), 'utf8'), context);
    return context.RRMapEdges;
}

test('the panel reads each side\'s neighbor and stores what a change says', () => {
    const E = edges();
    const map = { id: 1, width: 10, height: 8, reactor3d: { surround: { style: 'continue', neighbors: { north: { map: 2, shift: 3 } } } } };
    const view = E.read(map);
    assert.deepEqual(plain(view.neighbors), { north: { map: 2, shift: 3 }, east: null, south: null, west: null });
    let stored = E.patch(map.reactor3d.surround, { neighbors: { east: { map: 5 } } });
    assert.deepEqual(plain(stored.neighbors), { north: { map: 2, shift: 3 }, east: { map: 5 } });
    stored = E.patch(stored, { neighbors: { north: null } });
    assert.deepEqual(plain(stored.neighbors), { east: { map: 5 } });
    stored = E.patch(stored, { style: 'none' });
    assert.deepEqual(plain(stored), { style: 'none', neighbors: { east: { map: 5 } } }, 'the neighbor stays when the land goes');
    assert.equal(E.patch(stored, { neighbors: { east: null } }), null, 'nothing is left past the border');
    assert.deepEqual(plain(E.patch(null, { neighbors: { south: { map: 4, shift: '2' } } })), { style: 'none', neighbors: { south: { map: 4, shift: 2 } } });
});

test('a save writes the way back into a neighbor that has none, and leaves one that has', () => {
    const E = edges();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-neighbors-'));
    try {
        fs.mkdirSync(path.join(dir, 'data'));
        const file = name => path.join(dir, 'data', name);
        for (const id of ['002', '003', '004']) fs.writeFileSync(file(`Map${id}.json`), '{}');
        // Map 2 has a sidecar with its own work in it; map 3 already leads somewhere to the west; map 4 has no sidecar; map 5 is no map.
        fs.writeFileSync(file('Map002.r3d.json'), JSON.stringify({ version: 1, lights: [{ x: 1, y: 2 }], surround: { style: 'ocean', distance: 80 } }));
        fs.writeFileSync(file('Map003.r3d.json'), JSON.stringify({ version: 1, surround: { style: 'none', neighbors: { west: { map: 9 } } } }));
        const map = { id: 1, width: 10, height: 8, reactor3d: { surround: { style: 'continue',
            neighbors: { north: { map: 2, shift: 3 }, east: { map: 3 }, south: { map: 4 }, west: { map: 5 } } } } };
        const linked = E.linkBack(fs, path, dir, map);
        assert.deepEqual(Array.from(linked), [2, 4]);
        const two = JSON.parse(fs.readFileSync(file('Map002.r3d.json'), 'utf8'));
        assert.deepEqual(two.surround, { style: 'ocean', distance: 80, neighbors: { south: { map: 1, shift: -3 } } });
        assert.deepEqual(two.lights, [{ x: 1, y: 2 }], 'the rest of the neighbor\'s sidecar is untouched');
        assert.deepEqual(JSON.parse(fs.readFileSync(file('Map003.r3d.json'), 'utf8')).surround.neighbors, { west: { map: 9 } });
        assert.deepEqual(JSON.parse(fs.readFileSync(file('Map004.r3d.json'), 'utf8')).surround, { style: 'none', neighbors: { north: { map: 1 } } });
        assert.equal(fs.existsSync(file('Map005.r3d.json')), false);
        // Saved again: nothing more to write.
        assert.deepEqual(Array.from(E.linkBack(fs, path, dir, map)), []);
        // An unreadable neighbor is left as it is.
        fs.writeFileSync(file('Map004.r3d.json'), '{ not json');
        assert.deepEqual(Array.from(E.linkBack(fs, path, dir, map)), []);
        assert.equal(fs.readFileSync(file('Map004.r3d.json'), 'utf8'), '{ not json');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the panel offers the maps past each side, and the words are in every language', () => {
    const hotbar = fs.readFileSync(path.join(root, 'editor/src/BuildHotbar.js'), 'utf8');
    assert.match(hotbar, /rr-build-nmap/);
    assert.match(hotbar, /data-more="neighbors"[^\n]*tt\('Neighboring Maps'\)/, 'a folded section, open once a side has a map');
    // A neighbor's place along its border is set under its own map, not among the Advanced numbers.
    assert.match(hotbar, /rr-build-nmap[^\n]*shiftOf\(side\)/);
    assert.doesNotMatch(hotbar, /\$\{numbers\}\$\{shifts\}/);
    assert.ok(hotbar.includes("tt('Shift slides a neighbor along its border: down on East and West, right on North and South.')"));
    const context = { globalThis: null };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'editor/src/I18nDeepTranslations.js'), 'utf8'), context);
    const locales = Object.keys(context.RR_DEEP_TEXT_TRANSLATIONS);
    assert.equal(locales.length, 17);
    for (const locale of locales) {
        for (const phrase of ['Neighboring Maps', 'Walk past the border on a side to enter the map chosen there.', 'Shift (tiles)', 'Shift slides a neighbor along its border: down on East and West, right on North and South.']) {
            assert.ok(context.RR_DEEP_TEXT_TRANSLATIONS[locale][phrase], `${locale}: ${phrase}`);
        }
    }
});

test('a 2D map takes a neighbor: the panel\'s map and shift controls are live there, and it stays a 2D map', () => {
    const hotbar = fs.readFileSync(path.join(root, 'editor/src/BuildHotbar.js'), 'utf8');
    // The land past the border needs a 3D map; the map past a side does not.
    assert.match(hotbar, /<select class="database-field-value rr-build-nmap" data-side="\$\{side\}">/);
    assert.match(hotbar, /class="database-field-value rr-build-nshift" data-side="\$\{side\}" value="\$\{view\.neighbors\[side\]\.shift\}" min="-9999" max="9999" step="1"><\/label>/);
    const terrain = fs.readFileSync(path.join(root, 'editor/src/TerrainManager.js'), 'utf8');
    const from = terrain.indexOf('    setSurround(next, phase = \'commit\') {'), body = terrain.slice(from, terrain.indexOf('\n    }\n', from));
    assert.match(body, /if \(!elevation\.hasNote\(map\) && next && next\.style && next\.style !== 'none'\) return false;/, 'a 2D map is refused only the land past the border');
    assert.doesNotMatch(body, /if \(!map \|\| !elevation \|\| !elevation\.hasNote\(map\)\) return false/);
    assert.match(terrain, /this\.elevation\(\)\.hasNote\(map\) \? this\.elevation\(\)\.ensure\(map\) : \(map\.reactor3d = \{ version: 1 \}\)/, 'and its sidecar says nothing of a 3D view');
    // The game: a step off a border asks only for the map's neighbors, whatever the map is drawn as.
    const exit = R.neighborExit({ width: 12, height: 8, note: '', reactor3d: { version: 1, surround: { style: 'none', neighbors: { east: { map: 91, shift: 2 } } } } }, 11, 3, 6);
    assert.deepEqual({ ...exit }, { mapId: 91, side: 'east', along: 1, d: 6, inset: 0 });
    assert.deepEqual({ ...R.neighborArrival(exit, 12, 8, () => true) }, { x: 0, y: 1 });
});
