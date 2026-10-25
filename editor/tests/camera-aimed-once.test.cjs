'use strict';
// The map's 3D camera is aimed once per update (runtime/reactor_sprites.js). Every aim steps a Change Camera
// transition and the player-relative turn ease by one frame, so a second aim ran them at double speed, and at
// single speed on catch-up updates that skip the world draw.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sprites = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_sprites.js'), 'utf8');
const body = name => {
    const at = sprites.indexOf(`Spriteset_Map.prototype.${name} = function`);
    assert.ok(at >= 0, name);
    return sprites.slice(at, sprites.indexOf('\n};', at));
};
const calls = text => (text.match(/this\.updateReactor3DCamera\(\)/g) || []).length;

test('one map update aims the 3D camera once', () => {
    assert.equal(calls(body('update')), 1, 'aimed at the top of the update');
    assert.equal(calls(body('updateReactor3D')), 0, 'the world draw uses that aim');
});
