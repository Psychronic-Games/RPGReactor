'use strict';
// Sprite.bitmap = null must stop a sprite drawing its previous bitmap under Pixi v8.
// An actor sprite whose battler leaves battleMembers() mid-battle is cleared this way;
// before the fix it kept rendering that actor's last frame.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const native = require('pixi.js');

const runtime = path.resolve(__dirname, '../../runtime');
const read = file => fs.readFileSync(path.join(runtime, file), 'utf8');

function loadSprite() {
    const context = {
        PIXI: { ...native }, TypeError, Error, Reflect, Float32Array, Uint8Array, ArrayBuffer,
        console: { log() {}, warn() {}, error() {} }, location: { search: '' }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(read('libs/pixi_compat.js'), context);
    const core = read('reactor_core.js');
    const rectangleStart = core.indexOf('function Rectangle()');
    vm.runInContext(core.slice(rectangleStart, core.indexOf('//----', rectangleStart)), context);
    const display = read('reactor_core_display.js');
    vm.runInContext(display.slice(0, display.indexOf('Sprite.prototype._createColorFilter')) + '\nthis.Sprite = Sprite;', context);
    return context;
}

function fakeBitmap(P) {
    const baseTexture = P.BaseTexture.fromBuffer(new Uint8Array(64 * 64 * 4), 64, 64);
    return { baseTexture, width: 64, height: 64, addLoadListener(callback) { callback(this); } };
}

test('clearing a sprite bitmap leaves it on an empty texture of its own', () => {
    const context = loadSprite();
    const bitmap = fakeBitmap(context.PIXI);
    const sprite = new context.Sprite(bitmap);
    assert.equal(sprite.texture.source, bitmap.baseTexture.source);
    assert.equal(sprite.texture.uvs.x1, 1);
    const drawn = sprite.texture;

    sprite.bitmap = null;

    assert.notEqual(sprite.texture.source, bitmap.baseTexture.source, 'no longer samples the old bitmap');
    assert.equal(sprite.texture.uvs.x1, 0, 'UVs cover nothing');
    assert.deepEqual([sprite.texture.frame.width, sprite.texture.frame.height], [0, 0]);
    assert.equal(sprite.texture.__rrSpriteOwned, true);
    assert.equal(drawn.destroyed, true, 'the replaced sprite-owned texture is released');
    assert.equal(bitmap.baseTexture.source.destroyed, false, 'the bitmap source itself is untouched');
});

test('a cleared sprite shows its bitmap again when one is assigned', () => {
    const context = loadSprite();
    const bitmap = fakeBitmap(context.PIXI);
    const sprite = new context.Sprite(bitmap);
    sprite.bitmap = null;
    sprite.bitmap = bitmap;
    assert.equal(sprite.texture.source, bitmap.baseTexture.source);
    assert.deepEqual([sprite.texture.frame.width, sprite.texture.frame.height], [64, 64]);
});

test('a new sprite without a bitmap keeps its constructor texture', () => {
    const context = loadSprite();
    const realCreate = context.PIXICreateTexture;
    let created = 0;
    context.PIXICreateTexture = (...args) => { created++; return realCreate(...args); };
    const sprite = new context.Sprite();
    assert.equal(created, 1, 'initialize() does not build a second empty texture');
    assert.equal(sprite.texture.__rrSpriteOwned, true);
    assert.deepEqual([sprite.texture.frame.width, sprite.texture.frame.height], [0, 0]);
});
