'use strict';
// A save holding a sprite a plugin keeps on a game object (Hendrix Action Engine's target-lock marker on $gamePlayer)
// or a lookup table made with Object.create(null): written without them, the live game untouched. Both stopped the
// save ("Cannot read properties of undefined (reading 'name')"), and so the playtest checkpoint on every transfer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_core_io.js'), 'utf8');

function loadJsonEx() {
    const start = source.indexOf('function JsonEx() {');
    const decode = source.indexOf('JsonEx._decode = function(value) {');
    const end = source.indexOf('\n};', decode) + 3;
    assert.ok(start >= 0 && decode > start, 'JsonEx is in reactor_core_io.js');
    class Container { constructor() { this.children = []; this.parent = null; this._events = Object.create(null); } }
    class Sprite extends Container { constructor() { super(); this.texture = new Texture(); } }
    class Texture { constructor() { this._events = Object.create(null); } }
    class TextureSource {}
    class Bitmap { constructor() { this._canvas = {}; } }
    class Game_Player { constructor() { this._x = 3; } }
    const context = { PIXI: { Container, Texture, TextureSource }, Bitmap, Game_Player, Sprite, window: {} };
    vm.runInNewContext(source.slice(start, end) + '\nthis.JsonEx = JsonEx;', context);
    context.window.Game_Player = Game_Player;
    return context;
}

test('a sprite kept on a game object is left out of the save and stays on the live object', () => {
    const { JsonEx, Game_Player, Sprite } = loadJsonEx();
    const player = new Game_Player();
    const marker = new Sprite();
    marker.parent = new Sprite();
    marker.parent.children.push(marker);
    player.lockInSprite = player.lockInSprite2 = marker;
    player.markers = [marker, 4];
    const json = JsonEx.stringify({ player });
    const saved = JSON.parse(json);
    assert.equal(saved.player['@'], 'Game_Player');
    assert.equal(saved.player._x, 3);
    assert.equal('lockInSprite' in saved.player, false, 'left out');
    assert.deepEqual(saved.player.markers, [null, 4], 'a sprite in a list leaves its place empty');
    assert.equal(player.lockInSprite, marker, 'the live marker is kept');
    assert.equal('@' in marker, false, 'and not written into');
});

test('a lookup table made with Object.create(null) is saved as a plain object', () => {
    const { JsonEx } = loadJsonEx();
    const table = Object.create(null);
    table.a = 1;
    const back = JsonEx.parse(JsonEx.stringify({ table }));
    assert.equal(back.table.a, 1);
});

test('a save with no live objects is written as before', () => {
    const { JsonEx, Game_Player } = loadJsonEx();
    const json = JsonEx.stringify({ player: new Game_Player(), list: [1, 2] });
    assert.equal(json, '{"player":{"_x":3,"@":"Game_Player"},"list":[1,2]}');
});
