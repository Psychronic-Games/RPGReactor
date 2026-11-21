'use strict';
// A character sprite parked off screen (culled into the spriteset's holder) that a plugin removes from the map —
// Hendrix Action Engine on a defeated event: off the tilemap, out of _characterSprites, its character cleared — is
// let go, not updated on with no character ("Cannot read properties of null (reading 'screenX')" every frame).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_sprites.js'), 'utf8');

/** The shipped culling pass, run against small stand-ins. */
function cullingPass() {
    const at = source.indexOf('Spriteset_Map.prototype.updateOffscreenCulling = function() {');
    assert.ok(at >= 0, 'the culling pass exists');
    const end = source.indexOf('\n};', at);
    const body = source.slice(source.indexOf('{', at) + 1, end);
    // eslint-disable-next-line no-new-func
    return new Function('PIXI', '$gameMap', '$gamePlayer', 'Graphics', 'Reactor3D', 'Sprite_Character', 'Window_Base', 'window', body);
}

class Container {
    constructor() { this.children = []; this.parent = null; }
    addChild(child) { if (child.parent) child.parent.removeChild(child); this.children.push(child); child.parent = this; return child; }
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) { this.children.splice(i, 1); child.parent = null; } return child; }
}
class Sprite_Character extends Container {
    constructor(character) { super(); this._character = character; this.z = 3; this.width = 48; this.height = 48; this.updates = 0; }
    update() { this.updates++; this._character.screenX(); }
}
class Window_Base extends Container {}

const character = (x, y) => ({ screenX: () => x, screenY: () => y });

test('a parked sprite a plugin removes from the map is let go, not updated with no character', () => {
    const pass = cullingPass();
    const tilemap = new Container();
    const near = new Sprite_Character(character(100, 100)), far = new Sprite_Character(character(5000, 100));
    tilemap.addChild(near); tilemap.addChild(far);
    const spriteset = { _characterSprites: [near, far], _tilemap: tilemap, children: [] };
    const run = () => pass.call(spriteset, { Container }, { reactorCameraZoom: () => 1 }, {}, { width: 816, height: 624 }, {}, Sprite_Character, Window_Base, {});

    run();
    assert.equal(far._rrCulled, true, 'the far sprite is parked');
    assert.equal(far.parent, spriteset._rrCullHolder);
    const parkedUpdates = far.updates;
    assert.ok(parkedUpdates >= 1, 'a parked sprite still updates');

    // What the plugin does on RPG Maker to remove an event's sprite.
    spriteset._tilemap.removeChild(far);
    spriteset._characterSprites.splice(spriteset._characterSprites.indexOf(far), 1);
    far._character = null;

    assert.doesNotThrow(run, 'no update reaches the removed sprite');
    assert.equal(far.updates, parkedUpdates);
    assert.equal(far.parent, null, 'out of the holder');
    assert.equal(far._rrCulled, false);
    assert.equal(spriteset._rrCullHolder.children.length, 0);
    assert.equal(near.parent, tilemap, 'the sprite on screen is untouched');
});

test('a parked sprite taken out of the list with its character kept is let go too', () => {
    const pass = cullingPass();
    const tilemap = new Container();
    const far = new Sprite_Character(character(5000, 100));
    tilemap.addChild(far);
    const spriteset = { _characterSprites: [far], _tilemap: tilemap, children: [] };
    const run = () => pass.call(spriteset, { Container }, { reactorCameraZoom: () => 1 }, {}, { width: 816, height: 624 }, {}, Sprite_Character, Window_Base, {});
    run();
    assert.equal(far.parent, spriteset._rrCullHolder);
    spriteset._characterSprites.length = 0;
    run();
    assert.equal(far.parent, null);
    // And a parked sprite still on the list stays parked and keeps updating.
    const kept = new Sprite_Character(character(-5000, 100));
    tilemap.addChild(kept); spriteset._characterSprites.push(kept);
    run(); run();
    assert.equal(kept.parent, spriteset._rrCullHolder);
    assert.equal(kept.updates, 2);
});
