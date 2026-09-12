const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const PIXI = require('pixi.js');

const root = path.resolve(__dirname, '../..');
const compat = fs.readFileSync(path.join(root, 'runtime/libs/pixi_compat.js'), 'utf8');
const sandbox = { PIXI, console: { log() {}, warn() {}, error() {} }, window: { location: { search: '' } } };
vm.runInNewContext(compat, sandbox);

// Use real Pixi containers and sprites, with the runtime's actual pointer state machine.
const touch = { x: 10, y: 10, triggered: false, released: false, hovered: false };
function Sprite() {}
Sprite.prototype = Object.create(PIXI.Sprite.prototype);
Sprite.prototype.update = function() {};
const context = vm.createContext({
    Sprite, Point: PIXI.Point, Rectangle: PIXI.Rectangle,
    TouchInput: {
        get x() { return touch.x; }, get y() { return touch.y; },
        isTriggered: () => touch.triggered, isReleased: () => touch.released,
        isHovered: () => touch.hovered
    }
});
const sprites = fs.readFileSync(path.join(root, 'runtime/reactor_sprites.js'), 'utf8');
vm.runInContext(sprites.slice(0, sprites.indexOf('// Sprite_Character')), context);
function button() {
    const sprite = new PIXI.Sprite(new PIXI.Texture({ source: new PIXI.TextureSource({ width: 48, height: 48 }) }));
    Object.setPrototypeOf(sprite, context.Sprite_Button.prototype);
    sprite._pressed = false; sprite._hovered = false;
    sprite.checkBitmap = () => {};
    sprite.updateFrame = () => {};
    sprite.updateOpacity = () => {};
    Object.assign(touch, { x: 10, y: 10, triggered: false, released: false, hovered: false });
    return sprite;
}
function frame(sprite, triggered, released) {
    Object.assign(touch, { triggered, released });
    sprite.update();
}

test('worldVisible follows live ancestor visibility without depending on a render pass', () => {
    const parent = new PIXI.Container(), child = new PIXI.Container(), leaf = button();
    parent.addChild(child); child.addChild(leaf);
    assert.equal(leaf.worldVisible, true);
    parent.visible = false; assert.equal(leaf.worldVisible, false);
    parent.visible = true; child.visible = false; assert.equal(leaf.worldVisible, false);
    child.visible = true; leaf.visible = false; assert.equal(leaf.worldVisible, false);
    leaf.visible = true; parent.alpha = 0; parent.renderable = false;
    assert.equal(leaf.worldVisible, true, 'legacy visibility is independent of alpha and renderability');
    parent.visible = false; child.removeChild(leaf);
    assert.equal(leaf.worldVisible, true, 'detached sprites use their own visibility');
});

test('visible buttons press once and dispatch once on release', () => {
    const sprite = button(); let pressed = 0, clicked = 0;
    sprite.onPress = () => pressed++;
    sprite.setClickHandler(() => clicked++);
    frame(sprite, true, false);
    assert.equal(sprite.isPressed(), true);
    assert.equal(pressed, 1);
    frame(sprite, false, true);
    assert.equal(clicked, 1);
    assert.equal(sprite.isPressed(), false);
});

test('a fast click received entirely between frames dispatches only once', () => {
    const sprite = button(); let clicked = 0;
    sprite.setClickHandler(() => clicked++);
    frame(sprite, true, true);
    assert.equal(clicked, 1);
});

test('hidden ancestors and dragging outside cancel a button press', () => {
    const parent = new PIXI.Container(), sprite = button(); let clicked = 0;
    parent.addChild(sprite); sprite.setClickHandler(() => clicked++);
    parent.visible = false;
    frame(sprite, true, false); frame(sprite, false, true);
    assert.equal(clicked, 0);
    parent.visible = true;
    frame(sprite, true, false); parent.visible = false; frame(sprite, false, true);
    assert.equal(clicked, 0);
    parent.visible = true;
    frame(sprite, true, false); touch.x = 100; frame(sprite, false, true);
    assert.equal(clicked, 0);
});

test('compatibility installation preserves an existing worldVisible getter', () => {
    const getter = Object.getOwnPropertyDescriptor(PIXI.Container.prototype, 'worldVisible')?.get;
    assert.equal(typeof getter, 'function');
    vm.runInNewContext(compat, sandbox);
    assert.equal(Object.getOwnPropertyDescriptor(PIXI.Container.prototype, 'worldVisible').get, getter);
});
