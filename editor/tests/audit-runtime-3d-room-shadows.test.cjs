'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

// A battle room on its own renderer (the canvas-copy path) used to be refused
// the shadow rows for the map's idle time after the map's last draw, compile
// its lit programs unshadowed, then dispose and compile them all again.
test('a battle room claims the map\'s shadow rows at once when the map scene has stopped', () => {
    class Scene_Map {}
    class Scene_Battle {}
    const mapRenderer = { id: 'map' }, roomRenderer = { id: 'room' };
    const saved = { SceneManager: globalThis.SceneManager, Scene_Map: globalThis.Scene_Map, viewport: Reactor3D._viewport,
        owner: Reactor3D.Shadows._renderer, at: Reactor3D.Shadows.lastRenderAt };
    try {
        globalThis.Scene_Map = Scene_Map;
        Reactor3D._viewport = { renderer: () => mapRenderer };
        Reactor3D.Shadows._renderer = mapRenderer;
        Reactor3D.Shadows.lastRenderAt = performance.now();   // the map drew a moment ago

        globalThis.SceneManager = { _scene: new Scene_Battle() };
        assert.equal(Reactor3D.claimShadows(roomRenderer), true, 'the battle has the stage: the map draws no rows');

        globalThis.SceneManager = { _scene: new Scene_Map() };
        assert.equal(Reactor3D.claimShadows(roomRenderer), false, 'the map still draws them: the room waits its turn');

        globalThis.SceneManager = { _scene: new Scene_Battle() };
        Reactor3D.Shadows._renderer = { id: 'editor preview' };
        assert.equal(Reactor3D.claimShadows(roomRenderer), false, 'another owner than the map keeps the idle rule');

        delete globalThis.SceneManager;
        Reactor3D.Shadows._renderer = mapRenderer;
        assert.equal(Reactor3D.claimShadows(roomRenderer), false, 'no game (the editor): the idle rule decides');
        Reactor3D.Shadows.lastRenderAt = performance.now() - Reactor3D.SHADOW_CLAIM_IDLE_MS - 50;
        assert.equal(Reactor3D.claimShadows(roomRenderer), true);
    } finally {
        if (saved.SceneManager === undefined) delete globalThis.SceneManager; else globalThis.SceneManager = saved.SceneManager;
        if (saved.Scene_Map === undefined) delete globalThis.Scene_Map; else globalThis.Scene_Map = saved.Scene_Map;
        Reactor3D._viewport = saved.viewport;
        Reactor3D.Shadows._renderer = saved.owner;
        Reactor3D.Shadows.lastRenderAt = saved.at;
    }
});
