'use strict';
// A map's own passability, cell by cell ($dataMap.rrPassage = { "x,y": 1 | 2 }: 1 open, 2 blocked), which a placed
// 2D structure writes (docs/DESIGN-2D-STRUCTURES.md). The game reads it before the tiles, in Game_Map.isPassable
// (runtime/reactor_objects_map.js), so the wrappers of checkPassage (the legacy rule, a room's bare floor, solid
// image layers, a plugin's) never answer for a marked cell; boats, ships and landing keep to the tiles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { fightWorld, event } = require('./helpers/fight-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const editorRoot = path.join(__dirname, '..');
const DIRS = [2, 4, 6, 8];

/** A walkable 20x15 floor with one wall tile at 6,2 (its tileset marks it impassable), the image layers file loaded as the game loads it. */
function world() {
    const ctx = fightWorld({ events: [event(1, 8, 8)] });
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_image_layers.js'), 'utf8'), ctx, { filename: 'reactor_image_layers.js' });
    ctx.$dataTilesets[1].flags[1537] = 0x0f;
    ctx.$dataMap.data[2 * 20 + 6] = 1537;
    return ctx;
}
const passable = (ctx, x, y) => DIRS.map(d => ctx.$gameMap.isPassable(x, y, d));

test('a cell marked open is open in every direction, over a wall tile; one marked blocked is shut in every direction', () => {
    const ctx = world();
    assert.deepEqual(passable(ctx, 6, 2), [false, false, false, false], 'the wall tile, unmarked');
    assert.deepEqual(passable(ctx, 3, 2), [true, true, true, true], 'the floor, unmarked');
    ctx.$dataMap.rrPassage = { '6,2': 1, '3,2': 2 };
    assert.deepEqual(passable(ctx, 6, 2), [true, true, true, true]);
    assert.deepEqual(passable(ctx, 3, 2), [false, false, false, false]);
    assert.equal(ctx.$gameMap.rrPassageAt(6, 2), 1);
    assert.equal(ctx.$gameMap.rrPassageAt(3, 2), 2);
    assert.equal(ctx.$gameMap.rrPassageAt(4, 2), 0, 'a cell left out follows its tiles');
    ctx.$dataMap.rrPassage = { '4,2': 3, '5,2': 'x', '6,2': '1' };
    assert.deepEqual([ctx.$gameMap.rrPassageAt(4, 2), ctx.$gameMap.rrPassageAt(5, 2), ctx.$gameMap.rrPassageAt(6, 2)], [0, 0, 1], 'only 1 and 2 mean anything');
});

test('the player, an event and a follower obey the marks: none walks into a blocked cell, none is held by a wall marked open', () => {
    const ctx = world();
    const player = ctx.$gamePlayer, ev = ctx.$gameMap.event(1), follower = player.followers().follower(0);
    ctx.$dataMap.rrPassage = { '3,2': 2, '6,2': 1, '9,8': 2, '8,9': 1 };
    assert.equal(player.canPass(2, 2, 6), false, 'into a blocked cell');
    assert.equal(player.canPass(5, 2, 6), true, 'onto a wall tile marked open');
    assert.equal(player.canPass(6, 2, 6), true, 'and off it');
    player.locate(3, 2);
    assert.deepEqual(DIRS.map(d => player.canPass(3, 2, d)), [false, false, false, false], 'a blocked cell is left in no direction');
    assert.equal(ev.canPass(8, 8, 6), false, 'an event, into a blocked cell');
    assert.equal(ev.canPass(8, 8, 2), true);
    // A follower in the line walks the leader's steps through everything; one walking on its own (an order) asks the map.
    follower.setThrough(false);
    assert.equal(follower.canPass(2, 2, 6), false, 'a follower, into a blocked cell');
    assert.equal(follower.canPass(5, 2, 6), true);
    follower.setThrough(true);
    // The player walks it: a step toward a blocked cell does not happen.
    player.locate(2, 2);
    player.moveStraight(6);
    assert.deepEqual([player.x, player.y], [2, 2]);
    player.locate(5, 2);
    player.moveStraight(6);
    assert.deepEqual([player.x, player.y], [6, 2]);
});

test('a mark wins over every wrapper of checkPassage, whatever order they load in; boats, ships and landing keep to the tiles', () => {
    const ctx = world();
    ctx.$dataMap.rrPassage = { '3,2': 2, '6,2': 1 };
    // A wrapper that answers yes everywhere without the tiles (a room's bare floor does on its maps), and one that answers no.
    const base = ctx.Game_Map.prototype.checkPassage;
    ctx.Game_Map.prototype.checkPassage = function() { return true; };
    assert.deepEqual(passable(ctx, 3, 2), [false, false, false, false]);
    ctx.Game_Map.prototype.checkPassage = function() { return false; };
    assert.deepEqual(passable(ctx, 6, 2), [true, true, true, true]);
    ctx.Game_Map.prototype.checkPassage = base;
    // RPG Maker 2000/2003's passage rule, which answers without the base for walking.
    ctx.$dataSystem.rrLegacyPassage = true;
    assert.deepEqual([passable(ctx, 3, 2), passable(ctx, 6, 2)], [[false, false, false, false], [true, true, true, true]]);
    ctx.$dataSystem.rrLegacyPassage = false;
    // Vehicles ask the tiles as before: the floor marked blocked is still floor to a boat's question, the wall still a wall to landing.
    assert.equal(ctx.$gameMap.isBoatPassable(3, 2), base.call(ctx.$gameMap, 3, 2, 0x0200));
    assert.equal(ctx.$gameMap.isAirshipLandOk(6, 2), false);
    // The rule sits in isPassable itself, not in a wrapper of checkPassage.
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_objects_map.js'), 'utf8');
    assert.match(source, /Game_Map\.prototype\.isPassable = function\(x, y, d\) \{\s*const marked = this\.rrPassageAt\(x, y\);\s*if \(marked\) return marked === 1;/);
});

test('the marks are read from the map being played: a transfer to another map leaves them behind', () => {
    const ctx = world();
    ctx.$dataMap.rrPassage = { '3,2': 2 };
    assert.equal(ctx.$gameMap.isPassable(3, 2, 6), false);
    ctx.$dataMap = Object.assign({}, ctx.$dataMap);
    delete ctx.$dataMap.rrPassage;
    assert.equal(ctx.$gameMap.isPassable(3, 2, 6), true);
    ctx.$dataMap.rrPassage = { '3,2': 1, '4,2': 2 };
    assert.deepEqual([ctx.$gameMap.isPassable(3, 2, 6), ctx.$gameMap.isPassable(4, 2, 6)], [true, false], 'and a map placed on again reads its own at once');
});

/** A method of a class in an editor file, as a plain function, with the names it reads handed in. */
function method(file, head, names) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');
    const start = source.indexOf(head);
    assert.ok(start >= 0, head);
    let depth = 0, end = -1;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    const text = source.slice(start, end).trim().replace(/^static\s+/, '');
    // eslint-disable-next-line no-new-func
    return new Function(...names, `return function ${text}`);
}

test('the 3D view\'s Passage reads a marked cell before the tiles and the image layers, and redraws when the marks change', () => {
    const TilemapManager = { tilePassage: method('TilemapManager.js', '\n    static tilePassage(', [])() };
    const passageTiles = method('MapEditor3D.js', '\n    passageTiles(mapData) {', ['TilemapManager', 'Reactor3D', 'window'])(
        TilemapManager, { roomFor: () => null, isMap3D: () => true }, { reactor: { mapImageLayersManager: { solidTest: () => (x, y) => x === 5 && y === 0 } } });
    const flags = []; flags[1] = 0; flags[2] = 0x0f;
    const view = { projectController: { tilemapManager: { currentTileset: { flags } } } };
    const W = 8, H = 1, data = new Array(W * H * 6).fill(0);
    for (let x = 0; x < W; x++) data[x] = 1;
    data[2] = 2;
    const map = { tilesetId: 1, width: W, height: H, data };
    const before = passageTiles.call(view, map);
    assert.deepEqual([0, 1, 2, 5].map(x => before.read(x, 0)), [0, 0, 0x0f, 0x0f], 'unmarked: the tiles and the solid picture');
    map.rrPassage = { '2,0': 1, '5,0': 1, '1,0': 2 };
    const after = passageTiles.call(view, map);
    assert.deepEqual([0, 1, 2, 5].map(x => after.read(x, 0)), [0, 0x0f, 0, 0]);
    assert.notEqual(after.signature, before.signature, 'a change of marks is a change of what the view shows');
});
