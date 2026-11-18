const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const { loadRuntimeTilemap, makeTilemap } = require('./helpers/runtime-tilemap.cjs');

function fixture(chunks) {
    const context = loadRuntimeTilemap();
    context.Tilemap.ChunkPaint.enabled = chunks;
    const map = { width: 80, height: 60, data: new Array(80 * 60 * 6).fill(0) };
    const tilemap = makeTilemap(context, map);
    const camera = context.$gameMap = {
        _displayX: 20.25, _displayY: 15.25,
        displayX() { return this._displayX; }, displayY() { return this._displayY; },
        tileWidth: () => 48, tileHeight: () => 48
    };
    const character = {
        _realX: 26, _realY: 21, _jumpCount: 0, _reactorAir: 0,
        screenX() { return Math.floor((this._realX - camera._displayX) * 48 + 24); },
        screenY() { return Math.floor((this._realY - camera._displayY) * 48 + 48); }
    };
    const sprite = { _character: character, visible: true };
    const spriteset = { _tilemap: tilemap, _characterSprites: [sprite] };
    const core = runtimeSource('reactor_core.js');
    const start = core.indexOf('Graphics.FramePacing = {');
    const end = core.indexOf('/** The screen refreshes ticked so far:', start);
    vm.runInContext(core.slice(start, end), context);
    const pacing = context.Graphics.FramePacing;
    pacing.spriteset = () => spriteset;
    pacing._chars = [character]; pacing._prevCount = 1;
    pacing._prev.set([character._realX, character._realY, 0, 0]);
    pacing._display.set([camera._displayX, camera._displayY]);
    return { context, tilemap, camera, character, sprite, pacing };
}

test('stationary events stay on their map tiles during interpolated camera motion in all four directions', () => {
    for (const chunks of [true, false]) for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]]) {
        const { tilemap, camera, character, sprite, pacing } = fixture(chunks);
        camera[axis === 'x' ? '_displayX' : '_displayY'] += sign * 0.125;
        Object.assign(tilemap.origin, { x: camera._displayX * 48, y: camera._displayY * 48 });
        tilemap._prepareV8Frame();
        // Keep a plugin's authored pixel offsets while moving the camera.
        sprite.x = character.screenX() + 2; sprite.y = character.screenY() - 3;
        const live = [camera._displayX, camera._displayY, sprite.x, sprite.y, tilemap.origin.x, tilemap.origin.y];
        for (const alpha of [0, 0.25, 0.5, 0.75, 1, 0.5]) {
            pacing.alpha = () => alpha;
            pacing.draw();
            const chunks = tilemap._rrChunks;
            const ox = chunks ? tilemap._lowerLayer.x + chunks.lowerRoot.x : tilemap._lowerLayer.x - tilemap._lastStartX * 48;
            const oy = chunks ? tilemap._lowerLayer.y + chunks.lowerRoot.y : tilemap._lowerLayer.y - tilemap._lastStartY * 48;
            assert.equal(sprite.x - (character._realX * 48 + 24 + ox), 2, `${axis} ${sign}, alpha ${alpha}: horizontal registration`);
            assert.equal(sprite.y - (character._realY * 48 + 48 + oy), -3, `${axis} ${sign}, alpha ${alpha}: vertical registration`);
            pacing.restore();
            assert.deepEqual([camera._displayX, camera._displayY, sprite.x, sprite.y, tilemap.origin.x, tilemap.origin.y], live, 'rendering restores game-owned camera, origin and sprite coordinates');
        }
        tilemap.destroy({ children: true });
    }
});

// The stock order of a map scene: its children (the spriteset: sprites and the tilemap's origin) and then the game.
// The sprites are placed before the game moves, an update behind it. Star Shift Rebellion's Moletown, 2026-11-17:
// every standing event trailed its tile by an update's scroll (3 pixels walking, 6 to 7 dashing).
test('sprites placed before the game moved stay on their tiles between updates and at the update\'s own moment', () => {
    for (const chunks of [true, false]) for (const [axis, sign] of [['x', 1], ['x', -1], ['y', 1], ['y', -1]]) {
        const { context, tilemap, camera, character, sprite, pacing } = fixture(chunks);
        const spriteset = pacing.spriteset();
        context.Graphics.frameCount = 100;
        pacing._active = true; pacing._capturedAt = 100;
        // The spriteset's update: the origin and the sprite from the camera as the last update left it.
        Object.assign(tilemap.origin, { x: camera._displayX * 48, y: camera._displayY * 48 });
        tilemap._prepareV8Frame();
        sprite.x = character.screenX() + 2; sprite.y = character.screenY() - 3;
        context.Graphics.frameCount = 101;
        pacing.posed(spriteset);
        // Then the game: the camera moves an eighth of a tile.
        camera[axis === 'x' ? '_displayX' : '_displayY'] += sign * 0.125;
        const live = [camera._displayX, camera._displayY, sprite.x, sprite.y, tilemap.origin.x, tilemap.origin.y];
        for (const alpha of [0, 0.25, 0.5, 0.75, 1, 0.5]) {
            pacing.alpha = () => alpha;
            pacing.draw();
            const state = tilemap._rrChunks;
            const ox = state ? tilemap._lowerLayer.x + state.lowerRoot.x : tilemap._lowerLayer.x - tilemap._lastStartX * 48;
            const oy = state ? tilemap._lowerLayer.y + state.lowerRoot.y : tilemap._lowerLayer.y - tilemap._lastStartY * 48;
            assert.equal(sprite.x - (character._realX * 48 + 24 + ox), 2, `${axis} ${sign}, alpha ${alpha}: horizontal registration`);
            assert.equal(sprite.y - (character._realY * 48 + 48 + oy), -3, `${axis} ${sign}, alpha ${alpha}: vertical registration`);
            if (alpha === 1) assert.equal(axis === 'x' ? tilemap.origin.x : tilemap.origin.y, (axis === 'x' ? camera._displayX : camera._displayY) * 48, 'at the update\'s moment the picture is the game\'s, not an update behind');
            pacing.restore();
            assert.deepEqual([camera._displayX, camera._displayY, sprite.x, sprite.y, tilemap.origin.x, tilemap.origin.y], live, 'rendering restores game-owned camera, origin and sprite coordinates');
        }
        tilemap.destroy({ children: true });
    }
});

test('a character\'s place on the screen survives a scroll held to whole pixels by a division', () => {
    // YEP_CoreEngine's displayX: floor(displayX * 48) / 48. (30 - 1355 / 48) * 48 + 24 is 108.99999999999994.
    const map = runtimeSource('reactor_objects_map.js');
    assert.match(map, /return Math\.floor\(this\.scrolledX\(\) \* tw \+ tw \/ 2 \+ 1e-6\);/);
    assert.match(map, /this\.scrolledY\(\) \* th \+ th - this\.shiftY\(\) - this\.jumpHeight\(\) \+ 1e-6/);
    let off = 0;
    for (let x = 0; x < 100; x++) for (let k = 0; k < 3000; k++) if (Math.floor((x - k / 48) * 48 + 24 + 1e-6) !== x * 48 - k + 24) off++;
    assert.equal(off, 0);
});
