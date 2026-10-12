'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const cameras = require(path.join(repoRoot, 'runtime', 'reactor_3d.js')).Camera;

test('the map scene gives the mouse back when it stops, without calling the menu', () => {
    const canvas = {};
    let exits = 0;
    let stopped = 0;
    function Scene_Map() {}
    Scene_Map.prototype.stop = function() { stopped++; };
    const saved = { Scene_Map: globalThis.Scene_Map, Graphics: globalThis.Graphics, document: globalThis.document, SceneManager: globalThis.SceneManager };
    globalThis.Scene_Map = Scene_Map;
    globalThis.Graphics = { _canvas: canvas };
    globalThis.document = { pointerLockElement: canvas, exitPointerLock() { exits++; this.pointerLockElement = null; } };
    try {
        cameras.installHooks();
        cameras.held.add('forward');
        cameras.look.suppressMenuUntil = 0;
        new Scene_Map().stop();
        assert.equal(stopped, 1, 'the scene still stops');
        assert.equal(exits, 1, 'the pointer lock is released');
        assert.equal(cameras.held.size, 0, 'held look keys are let go');
        assert.ok(cameras.look.suppressMenuUntil > Date.now(), 'the release does not read as Escape');

        new Scene_Map().stop();
        assert.equal(exits, 1, 'nothing to release when the mouse is free');

        // A transfer stops this map for the next one: the look keeps the mouse.
        globalThis.document.pointerLockElement = canvas;
        globalThis.SceneManager = { _nextScene: new Scene_Map() };
        new Scene_Map().stop();
        assert.equal(exits, 1, 'kept through a transfer');
        globalThis.SceneManager = { _nextScene: {} };
        new Scene_Map().stop();
        assert.equal(exits, 2, 'released for a menu or a battle');
    } finally {
        Object.assign(globalThis, saved);
    }
});

test('a view that does not turn with the mouse gives the pointer back (a Tactical battle taking the camera from third person)', () => {
    const canvas = {};
    let exits = 0;
    const saved = { Graphics: globalThis.Graphics, document: globalThis.document, $gameMap: globalThis.$gameMap, $dataMap: globalThis.$dataMap, SceneManager: globalThis.SceneManager };
    globalThis.Graphics = { _canvas: canvas, width: 816, height: 624 };
    globalThis.document = { pointerLockElement: canvas, exitPointerLock() { exits++; this.pointerLockElement = null; } };
    globalThis.$dataMap = { width: 20, height: 20, reactor3d: { mode: '3d' } };
    globalThis.$gameMap = { _reactorCamera3d: cameras.normalizeState({ mode: 'thirdPerson' }), _reactorCamera3dTween: null };
    const spriteset = { _reactor3d: { camera: null, cameraCurrent: null } };
    try {
        // (No camera object: the frame's first lines are what is under test, and it stops there.)
        cameras.look.locked = true;
        cameras.look.suppressMenuUntil = 0;
        spriteset._reactor3d.camera = null;
        const run = () => { spriteset._reactor3d.camera = {}; try { cameras.update(spriteset); } catch (error) { /* past the lines under test */ } };
        run();
        assert.equal(exits, 0, 'third person keeps the mouse');
        assert.equal(cameras.look.locked, true);
        globalThis.$gameMap._reactorCamera3d = cameras.normalizeState({ mode: 'isometric' });
        run();
        assert.equal(exits, 1, 'the view no longer turns with the mouse: the pointer is given back');
        assert.equal(cameras.look.locked, false);
        assert.ok(cameras.look.suppressMenuUntil > Date.now(), 'and that release is not read as Escape');
        run();
        assert.equal(exits, 1, 'once');
    } finally {
        cameras.look.locked = false;
        Object.assign(globalThis, saved);
    }
});
