'use strict';
// Particle effects (reactor_screen_fx.js) per frame: each texture is looked
// up once a frame however many particles use it, and the colour, size and
// fade each particle draws with follow its age as before.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const file = path.resolve(__dirname, '..', '..', 'runtime', 'reactor_screen_fx.js');

function load() {
    const stub = () => {
        const Class = function() {};
        Class.prototype = { clear() {}, update() {}, updatePosition() {}, updateOther() {}, show() {}, terminate() {}, onMapLoaded() {}, performTransfer() {}, updatePictures() {}, updateParallax() {} };
        return Class;
    };
    class Sprite {
        constructor() { this.anchor = { x: 0, y: 0 }; this.scale = { x: 1, y: 1 }; this.children = []; this.parent = null; this.visible = true; }
        addChild(child) { if (child.parent) child.parent.removeChild(child); this.children.push(child); child.parent = this; return child; }
        removeChild(child) { const at = this.children.indexOf(child); if (at >= 0) this.children.splice(at, 1); child.parent = null; return child; }
    }
    const loads = [];
    const bitmaps = new Map();
    const ImageManager = {
        loadPicture(name) {
            loads.push(name);
            if (!bitmaps.has(name)) bitmaps.set(name, { name });
            return bitmaps.get(name);
        }
    };
    const context = {
        console, Sprite, ImageManager, PIXI: {}, SceneManager: { _scene: null }, $gameMap: null, $dataSystem: {},
        Game_Screen: stub(), Sprite_Picture: stub(), Spriteset_Map: stub(), Spriteset_Base: stub(), Spriteset_Battle: stub(),
        Game_Picture: stub(), Scene_Map: stub(), Game_Map: stub(), Game_Player: stub(), Game_Interpreter: stub(), Window_Base: stub(), Bitmap: stub()
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    context.$gameScreen = new context.Game_Screen();
    context.Game_Screen.prototype.clear.call(context.$gameScreen);
    // A battle spriteset: every particle layer shares one holder.
    const spriteset = Object.assign(new Sprite(), {});
    Object.setPrototypeOf(spriteset, Object.assign(Object.create(Sprite.prototype), context.Spriteset_Base.prototype));
    const update = () => context.Spriteset_Base.prototype._rrUpdateParticles.call(spriteset);
    return { context, screen: context.$gameScreen, spriteset, update, loads, bitmaps };
}

test('each particle texture is loaded once a frame, and every particle shares its bitmap', () => {
    const { screen, spriteset, update, loads, bitmaps } = load();
    for (const [name, texture] of [['smoke', 'Smoke'], ['spark', 'Spark']]) {
        screen.rrPfxCreate(name, 'burst');
        screen.rrPfxSet(name, 'texture', texture);
        screen.rrPfxSet(name, 'amount', 40);
        screen.rrPfxSet(name, 'timeout', 60, 0);
        screen.rrPfxBurst(name, 100, 100);
    }
    update();
    assert.equal(spriteset._rrParticles.length, 80);
    assert.deepEqual(loads, ['Smoke', 'Spark'], 'one lookup per texture, not per particle');
    const sprites = spriteset._rrParticleSprites;
    assert.ok(sprites.slice(0, 40).every(sprite => sprite.bitmap === bitmaps.get('Smoke')));
    assert.ok(sprites.slice(40, 80).every(sprite => sprite.bitmap === bitmaps.get('Spark')));
    loads.length = 0;
    update();
    assert.deepEqual(loads, ['Smoke', 'Spark'], 'looked up again the next frame');
});

test('a particle tints, grows and fades with its age', () => {
    const { screen, spriteset, update } = load();
    screen.rrPfxCreate('glow', 'burst');
    screen.rrPfxSet('glow', 'texture', 'Glow');
    screen.rrPfxSet('glow', 'amount', 1);
    screen.rrPfxSet('glow', 'timeout', 10, 0);
    screen.rrPfxSet('glow', 'color0', 20, 40, 300);
    screen.rrPfxSet('glow', 'color1', 100, 200, -60);
    screen.rrPfxSet('glow', 'growth', 0, 2);
    screen.rrPfxBurst('glow', 0, 0);
    const seen = [];
    for (let frame = 0; frame < 12; frame++) {
        update();
        const sprite = spriteset._rrParticleSprites[0];
        seen.push([sprite.visible, sprite.tint, sprite.scale.x, sprite.opacity]);
    }
    const tintAt = t => {
        const channel = (from, to) => Math.round(Math.max(0, Math.min(255, Math.round(from + (to - from) * t))));
        return (channel(20, 100) << 16) | (channel(40, 200) << 8) | channel(300, -60);
    };
    // Age 1 on the first update, gone after age 10.
    for (let age = 1; age <= 10; age++) {
        const t = age / 10;
        assert.deepEqual(seen[age - 1], [true, tintAt(t), 2 * t, Math.round(255 * (1 - age / 10))], 'age ' + age);
    }
    assert.equal(seen[10][0], false, 'an expired particle is hidden');
});

test('with no effect started and no text written the per-frame updates do nothing, and the last particles are still hidden', () => {
    const { context, screen, spriteset, update } = load();
    update();
    assert.equal(spriteset._rrParticleSprites.length, 0);
    context.Spriteset_Base.prototype._rrUpdateTexts.call(spriteset);
    assert.equal(spriteset._rrTextContainer, undefined, 'no text container until a text is written');
    screen.rrPfxCreate('puff', 'burst');
    screen.rrPfxSet('puff', 'texture', 'Puff');
    screen.rrPfxSet('puff', 'amount', 3);
    screen.rrPfxSet('puff', 'timeout', 2, 0);
    screen.rrPfxBurst('puff', 10, 10);
    update();
    assert.equal(spriteset._rrParticles.length, 3);
    for (let frame = 0; frame < 6; frame++) update();
    assert.equal(spriteset._rrParticles.length, 0);
    assert.ok(spriteset._rrParticleSprites.every(sprite => !sprite.visible), 'hidden on the frame after the last one died');
    assert.equal(spriteset._rrParticlesShown, false, 'and idle after that');
});
