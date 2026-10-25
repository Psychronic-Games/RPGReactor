'use strict';
// A battle room draws 2D battlers as pictures standing in it: a battler's frame is copied and sent to the
// graphics card only when it is another picture, and the battler's own flat sprite, which draws nothing
// there, keeps the empty texture instead of building a new one every update.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function room() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    const View = require('../../runtime/reactor_battle_room.js');
    const copies = [];
    const previous = global.document;
    global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage: (...args) => copies.push(args) }) }) };
    const view = new View({}, {}, {}, {});
    view.scene = { add() {} };
    view.camera = { quaternion: new THREE.Quaternion() };
    view.ensureShadow = () => {};
    view.place = () => {};
    return { view, copies, restore: () => { global.document = previous; } };
}

/** A bitmap as the runtime has it: a texture whose update() every draw on it calls. */
const bitmap = () => ({ _baseTexture: { updates: 0, update() { this.updates++; } } });

test('a battler\'s picture is copied and sent only when its frame, its canvas or its bitmap\'s pixels change', () => {
    const { view, copies, restore } = room();
    try {
        const canvas = {}, sheet = bitmap(), frame = { x: 0, y: 0, width: 64, height: 64 };
        const sent = () => view.billboards.get('actor:0').texture.version;
        view.billboard('actor:0', canvas, frame, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 1);
        const first = sent();
        for (let i = 0; i < 5; i++) view.billboard('actor:0', canvas, { ...frame }, { x: 1 + i, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 1, 'the same frame of the same picture, moved: nothing copied');
        assert.equal(sent(), first, 'nothing sent');
        view.billboard('actor:0', canvas, { x: 64, y: 0, width: 64, height: 64 }, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 2, 'the next cell of the motion');
        assert.ok(sent() > first);
        sheet._baseTexture.update();
        view.billboard('actor:0', canvas, { x: 64, y: 0, width: 64, height: 64 }, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 3, 'drawn on since: copied again');
        assert.equal(sheet._baseTexture.updates, 1, 'and the bitmap\'s own update still runs');
        view.billboard('actor:0', canvas, { x: 64, y: 0, width: 64, height: 64 }, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 3);
        sheet._baseTexture = { update() {} };
        view.billboard('actor:0', canvas, { x: 64, y: 0, width: 64, height: 64 }, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 4, 'a new texture under the bitmap: copied');
        view.billboard('actor:0', {}, { x: 64, y: 0, width: 64, height: 64 }, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 5, 'another canvas: copied');
        view.billboard('actor:0', {}, { x: 64, y: 0, width: 32, height: 64 }, { x: 1, y: 1 }, 1.3, sheet);
        assert.equal(copies.length, 6, 'another size: copied');
        // A picture with no bitmap to ask is copied every time, as it always was.
        view.billboard('extra:x', canvas, frame, { x: 0, y: 0 }, 1);
        view.billboard('extra:x', canvas, frame, { x: 0, y: 0 }, 1);
        assert.equal(copies.length, 8);
    } finally { restore(); }
});

test('the room\'s callers name the bitmap each picture belongs to', () => {
    const read = file => fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', file), 'utf8');
    const presentation = read('reactor_battle_presentation.js'), events = read('reactor_battle_events.js');
    assert.match(presentation, /room\.billboard\(key,main\.bitmap\.canvas,main\._frame,\{[^\n]+\},tall,main\.bitmap\);/);
    assert.match(presentation, /room\.billboard\('extra:projectile',[^\n]+,projectile\.graphic\.bitmap\);/);
    assert.match(presentation, /room\.billboard\('extra:weapon',[^\n]+,weapon\.graphic\.bitmap\);/);
    assert.match(events, /room\.billboard\('event:'\+id,sprite\.bitmap\.canvas,sprite\._frame,p,[^\n]+,sprite\.bitmap\);/);
    // Every battler and room event the room draws keeps the empty texture through the helper.
    assert.match(presentation, /\n\s+P\.drawnInRoom\(main\);\n/);
    assert.match(events, /if\(sprite\.texture\)P\.drawnInRoom\(sprite\);/);
    assert.doesNotMatch(presentation.slice(presentation.indexOf('P.updateRoom=function')) + events, /texture=PIXI\.Texture\.EMPTY/, 'no swap to the empty texture every update');
});

test('a sprite drawn by the room keeps the empty texture: no texture is made per update, and its pivot follows its frame as before', () => {
    const EMPTY = { empty: true };
    const context = { PIXI: { Texture: { EMPTY } }, console, ReactorBattleData: require('../../runtime/reactor_battle_data.js'), DataManager: { isDatabaseLoaded: () => true } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../runtime/reactor_battle_presentation.js'), 'utf8'), context);
    const P = context.ReactorBattlePresentation;
    let refreshes = 0;
    const own = { __rrSpriteOwned: true, destroyed: false, destroy() { this.destroyed = true; } };
    const sprite = { texture: own, pivot: { x: 0, y: 0 }, _bitmap: { baseTexture: { width: 576, height: 384 } }, _frame: { x: 64, y: 0, width: 64, height: 64 },
        _refresh() { refreshes++; this.texture = { made: true }; } };
    P.drawnInRoom(sprite);
    assert.equal(sprite.texture, EMPTY);
    assert.equal(own.destroyed, true, 'the texture it had made is let go');
    for (let i = 0; i < 10; i++) { sprite._frame.x = 64 * (i % 9); sprite._refresh(); P.drawnInRoom(sprite); }
    assert.equal(refreshes, 0, 'its frame changes build nothing');
    assert.equal(sprite.texture, EMPTY);
    // A frame off the picture's edge is pivoted as Sprite._refresh pivots it.
    sprite._frame.x = -10; sprite._frame.y = 400; sprite._refresh();
    assert.deepEqual([sprite.pivot.x, sprite.pivot.y], [-10, 16]);
    sprite._frame.x = 32; sprite._frame.y = 0; sprite._refresh();
    assert.deepEqual([sprite.pivot.x, sprite.pivot.y], [0, 0]);
    // Something that sets a texture on it again is undone on the next update.
    sprite.texture = { other: true };
    P.drawnInRoom(sprite);
    assert.equal(sprite.texture, EMPTY);
});
