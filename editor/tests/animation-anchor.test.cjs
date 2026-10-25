'use strict';
// Where a battle animation plays on its target (runtime/reactor_sprites.js, Sprite_Animation.targetSpritePosition):
// on the middle of the target, or on its feet when the animation says Align Bottom; a model on a 3D map, whose
// sprite stands in unseen, says where its middle is drawn (Sprite_Character.reactorAnimationMiddle). In a Battle
// Room (runtime/reactor_battle_room.js, playAnimation) the same rule anchors the effect on the model or picture.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtime = path.join(__dirname, '..', '..', 'runtime');
const sprites = fs.readFileSync(path.join(runtime, 'reactor_sprites.js'), 'utf8');
/** A prototype assignment of the file, as text: from `name = function` to the line that closes it. */
function slice(source, name) {
    const start = source.indexOf(name + ' = function');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n};\n', start) + 4);
}

function context() {
    const ctx = {
        Point: class { constructor(x = 0, y = 0) { this.x = x; this.y = y; } },
        PIXI: { TextureSource: function() {} },
        Sprite_Animation: function() {}, Sprite_Character: function() {},
        Number
    };
    vm.createContext(ctx);
    vm.runInContext(slice(sprites, 'Sprite_Animation.prototype.targetSpritePosition'), ctx);
    vm.runInContext(slice(sprites, 'Sprite_Character.prototype.reactorAnimationMiddle'), ctx);
    return ctx;
}
/** A sprite standing at (x, y) on the screen (its origin, its feet), `height` tall, scaled by `scale`. */
const sprite = (x, y, height, scale = 1, visible = true) => ({
    x, y, height, visible, scale: { x: scale, y: scale },
    worldTransform: { apply: point => ({ x: x + point.x * scale, y: y + point.y * scale }) },
    parent: { worldTransform: { apply: point => ({ x: point.x, y: point.y }) } }
});
const at = (ctx, animation, target) => {
    const a = Object.create(ctx.Sprite_Animation.prototype);
    a._animation = animation;
    const p = a.targetSpritePosition(target);
    return [p.x, p.y];
};

test('an animation plays on the middle of its target, or on its feet with Align Bottom', () => {
    const ctx = context();
    assert.deepEqual(at(ctx, { alignBottom: false }, sprite(200, 400, 288)), [200, 256]);
    assert.deepEqual(at(ctx, {}, sprite(200, 400, 288)), [200, 256], 'Align Bottom unset is off');
    assert.deepEqual(at(ctx, { alignBottom: true }, sprite(200, 400, 288)), [200, 400]);
    assert.deepEqual(at(ctx, {}, sprite(200, 400, 100, 2)), [200, 300], 'its own height, scaled as it is drawn');
    // A sprite that is not drawn has its place from its parent, the middle still its own.
    assert.deepEqual(at(ctx, {}, sprite(50, 80, 48, 1, false)), [50, 56]);
});

test('a model on a 3D map: its middle, as its model is drawn', () => {
    const ctx = context();
    const character = { _realX: 4, _realY: 6, _reactorLift: 0 };
    ctx.$dataMap = {};
    ctx.Reactor3D = {
        shouldRender3D: () => true, characterGround: () => 1, characterHeightTiles: () => 3,
        viewport: () => ({ camera: () => ({}) }),
        // Screen x from the map's x, screen y from the height: 100 px a tile up from 500.
        projectToScreen: (camera, x, h, z, out) => Object.assign(out, { x: x * 10, y: 500 - h * 100 })
    };
    const stand = Object.assign(Object.create(ctx.Sprite_Character.prototype), sprite(0, 0, 48, 1, false), { _character: character });
    assert.deepEqual(at(ctx, {}, stand), [45, 250], 'ground 1 plus half of 3 tiles: 2.5 tiles up');
    assert.deepEqual(at(ctx, { alignBottom: true }, stand), [0, 0], 'Align Bottom: the sprite\'s own feet');
    // A sprite that is the picture itself (drawn) is its own middle.
    const drawn = Object.assign(Object.create(ctx.Sprite_Character.prototype), sprite(30, 60, 48), { _character: character });
    assert.deepEqual(at(ctx, {}, drawn), [30, 36]);
});

test('a Battle Room anchors its effect on the middle of the model or picture, or its feet with Align Bottom', () => {
    const source = fs.readFileSync(path.join(runtime, 'reactor_battle_room.js'), 'utf8');
    const start = source.indexOf('        playAnimation(key,animationId,transform={}) {');
    const body = source.slice(start, source.indexOf('\n        }\n', start) + 10);
    const queued = [];
    const Room = new Function(`return class { ${body} }`)();
    const room = Object.assign(new Room(), {
        assets: { animation: id => ({ 1: { alignBottom: false }, 2: { alignBottom: true } })[id] },
        models: new Map([['model', { object: { userData: { glbSize: { x: 1, y: 1.8, z: 0.5 } } } }]]),
        billboards: new Map([['picture', { billboard: true, object: { userData: {} } }]]),
        effectPlays: new Map(),
        queueEffect(id, owner, effect) { queued.push(effect.anchor.offset[1]); this.effectPlays.set(id, {}); return true; }
    });
    for (const [key, id] of [['model', 1], ['model', 2], ['picture', 1], ['picture', 2]]) room.playAnimation(key, id);
    assert.deepEqual(queued, [0.9, 0, 0, -0.5], 'a model stands on its origin; a picture is centred on its own');
});
