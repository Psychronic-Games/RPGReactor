'use strict';
// MV's Sprite is a plain function: a plugin subclass may call it as its super constructor,
// `ULDS.Sprite = function (bitmap) { Sprite.call(this, bitmap); }` (Savior & Religion's ULDS
// layers). Under PIXI 8 MZGlobalUpgrade replaces Sprite with a wrapper that builds a real v8
// instance; called without `new`, it built a new one and left the caller's object bare, so the
// first addChild crashed on its missing event emitter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'libs', 'pixi_compat.js'), 'utf8');

function upgraded() {
    const start = source.indexOf('    window.MZGlobalUpgrade = function() {');
    const end = source.indexOf('\n    };\n', start);
    assert.ok(start >= 0 && end > start, 'MZGlobalUpgrade is locatable');
    // The v8 base: a class that can only be built with `new`, owning its transform and emitter.
    class PixiSprite {
        constructor() { this.position = { x: 0, y: 0 }; this._events = {}; }
        addChild(child) { child._events.added = true; return child; }
    }
    const window = {};
    window.window = window;
    const PIXI = { TextureSource: function() {}, Sprite: PixiSprite };
    // The engine's Sprite, the MV way: initialize does the PIXI super call (here, the copy PIXISuper makes).
    window.Sprite = function Sprite() { this.initialize.apply(this, arguments); };
    window.Sprite.prototype = Object.create(PixiSprite.prototype);
    window.Sprite.prototype.constructor = window.Sprite;
    window.Sprite.prototype.initialize = function(bitmap) {
        Object.assign(this, new PixiSprite());
        this.bitmap = bitmap;
    };
    const context = { window, PIXI, console: { log() {}, warn() {}, error() {} }, compatLog() {}, isWindowLayerClass: () => false };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end + 7) + '\nwindow.MZGlobalUpgrade();', context);
    return window;
}

test('a plugin subclass calling Sprite as its super constructor is initialized itself', () => {
    const window = upgraded();
    const Sprite = window.Sprite;
    function UldsSprite(bitmap) { Sprite.call(this, bitmap); }
    UldsSprite.prototype = Object.create(Sprite.prototype);
    UldsSprite.prototype.constructor = UldsSprite;

    const layer = new UldsSprite('cover');
    assert.equal(layer.bitmap, 'cover', 'the subclass got its own initialize');
    assert.ok(layer.position && layer._events, 'and the v8 transform and emitter');
    layer.position.x = 12;
    assert.doesNotThrow(() => new Sprite().addChild(layer));
});

test('new Sprite() still builds through the wrapper', () => {
    const window = upgraded();
    const sprite = new window.Sprite('title');
    assert.equal(sprite.bitmap, 'title');
    assert.equal(sprite.__pixiInitialized, true);
    assert.ok(sprite instanceof window.Sprite);
});
