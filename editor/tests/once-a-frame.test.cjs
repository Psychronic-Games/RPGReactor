'use strict';
// Runtime 20261110.9: on a 3D map a character sprite's update and the off-screen culling are a picture's work,
// done in the last update of a frame only (a machine below 60 a second runs several updates a frame).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');

/** `catchUpSkips` as the runtime has it, run against stand-ins for what it reads. */
function load(env) {
    const from = source.indexOf('Sprite_Character.prototype.catchUpSkips = function() {');
    const to = source.indexOf('\n};', from) + 3;
    assert.ok(from > 0 && to > from);
    const Sprite_Character = function() {};
    new Function('Sprite_Character', 'Graphics', 'Reactor3D', '$dataMap', source.slice(from, to))(Sprite_Character, env.Graphics, env.Reactor3D, env.$dataMap);
    return Sprite_Character;
}

test('on a 3D map a character sprite with nothing hanging on it sits out the updates before a frame\'s last', () => {
    let asked = 0;
    const env = { Graphics: { frameCount: 10 }, Reactor3D: { shouldRender3D: () => { asked++; return true; } }, $dataMap: {} };
    const S = load(env);
    const sprite = new S();
    sprite.children = [];
    assert.equal(sprite.catchUpSkips(), false, 'not one that has never been updated');
    sprite._rrUpdatedAt = 9;
    assert.equal(sprite.catchUpSkips(), true);
    // Something hangs on it that counts updates: a plugin's label, an MV animation.
    sprite.children = [{}];
    assert.equal(sprite.catchUpSkips(), false);
    sprite.children = []; sprite._animationSprites = [{}];
    assert.equal(sprite.catchUpSkips(), false);
    sprite._animationSprites = [];
    // The map is asked once an update, not once a sprite.
    const other = new S(); other._rrUpdatedAt = 9; other.children = [];
    asked = 0; env.Graphics.frameCount = 11;
    assert.equal(sprite.catchUpSkips(), true); assert.equal(other.catchUpSkips(), true);
    assert.equal(asked, 1);
});

test('a flat map\'s sprites are updated in every update, as RPG Maker\'s are', () => {
    const env = { Graphics: { frameCount: 3 }, Reactor3D: { shouldRender3D: () => false }, $dataMap: {} };
    const S = load(env), sprite = new S();
    sprite._rrUpdatedAt = 2; sprite.children = [];
    assert.equal(sprite.catchUpSkips(), false);
});

test('the skip is asked only in an update that is not the frame\'s last, and each real update is noted', () => {
    assert.match(source, /if \(Sprite_Character\.ONCE_A_FRAME && typeof SceneManager !== "undefined" && SceneManager\._finalUpdateOfFrame === false && this\.catchUpSkips\(\)\) return;/);
    assert.match(source, /this\._rrUpdatedAt = typeof Graphics !== "undefined" \? Graphics\.frameCount : 0;\n        const passed = this\._rrThrottlePassed;\n        this\._rrThrottlePassed = true;\n        const result = inner\.apply\(this, arguments\);/);
    assert.match(source, /Sprite_Character\.ONCE_A_FRAME = true;/);
});

test('which sprites are parked off screen is asked in the frame\'s last update on a 3D map, in every update elsewhere', () => {
    assert.match(source, /if \(!Spriteset_Map\.CULL_ONCE_A_FRAME \|\| !this\._reactor3d \|\| typeof SceneManager === "undefined" \|\| SceneManager\._finalUpdateOfFrame !== false\) this\.updateOffscreenCulling\(\);/);
    assert.match(source, /Spriteset_Map\.CULL_ONCE_A_FRAME = true;/);
    assert.equal(source.split('this.updateOffscreenCulling();').length, 2, 'asked from one place');
});
