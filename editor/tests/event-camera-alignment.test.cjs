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
