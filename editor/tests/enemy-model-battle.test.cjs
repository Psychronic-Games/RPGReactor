const assert = require('node:assert/strict');
const test = require('node:test');
const Reactor3D = require('../../runtime/reactor_3d.js');

test('a loaded 3D enemy paints consecutive battle frames without a map character', () => {
    const bitmap = {};
    const state = { enemyId: 4, ready: true, frame: 0, size: 192, bitmap, rules: [], binding: null };
    const sprite = { _enemy: { enemyId: () => 4 }, _reactorBattler: state,
        frame: [64, 0, 64, 48], setFrame(...frame) { this.frame = frame; } };
    const painted = [];
    const context = {
        databaseModelSpec: () => ({ name: 'Psychronic' }),
        ensureLoaded() {}, isLoaded: () => true,
        paintBattlerFrame: (actual, owner) => painted.push([actual, owner]),
        _modelActions: { b4: { name: 'Attack' } }
    };
    Reactor3D.updateEnemyModelSprite.call(context, sprite);
    assert.equal(sprite.bitmap, bitmap);
    assert.deepEqual(state.action, { name: 'Attack', frame: 1 });
    Reactor3D.updateEnemyModelSprite.call(context, sprite);
    assert.equal(state.frame, 2);
    assert.deepEqual(sprite.frame, [0, 0, 192, 192]);
    assert.equal(state.action, null);
    assert.deepEqual(painted, [[state, sprite], [state, sprite]]);
    assert.deepEqual(context._modelActions, {});
    sprite._effectType = 'bossCollapse'; sprite._effectDuration = 75;
    Reactor3D.updateEnemyModelSprite.call(context, sprite);
    assert.deepEqual(sprite.frame, [0, 0, 192, 75]);
    // Drawn by a Battle Room, its own picture is only the turn-order icon's: painted once every ROOM_PICTURE_EVERY updates.
    sprite._effectType = null; sprite._reactorDrawnInRoom = true; painted.length = 0;
    for (let i = 0; i < Reactor3D.ROOM_PICTURE_EVERY * 2; i++) Reactor3D.updateEnemyModelSprite.call(context, sprite);
    assert.equal(painted.length, 2, 'two pictures in ' + Reactor3D.ROOM_PICTURE_EVERY * 2 + ' updates');
    // An actor's is on nothing in a room: painted once (its bitmap exists), then not again.
    const actorState = { actorId: 2, frame: 0 };
    assert.equal(Reactor3D.battlerPictureRests(actorState, { _reactorDrawnInRoom: true }), false);
    actorState.frame = 500; assert.equal(Reactor3D.battlerPictureRests(actorState, { _reactorDrawnInRoom: true }), true);
    assert.equal(Reactor3D.battlerPictureRests(actorState, {}), false, 'out of a room it is painted every update again');
});
