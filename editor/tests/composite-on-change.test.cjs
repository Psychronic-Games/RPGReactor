'use strict';
// A refresh with no game update draws the composite only when something on
// it changed: at 180 Hz two refreshes of three ran no update and drew the
// last picture again. What changes between updates still draws: new pixels
// in a texture source, render work the stage queued, a draw into a texture,
// a new stage, a resize, a redraw asked for; and a tick handler that does not
// say how many updates it ran draws every refresh.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const core = runtimeSource('reactor_core.js'), managers = runtimeSource('reactor_managers.js');
const between = (source, from, to) => {
    const start = source.indexOf(from), end = source.indexOf(to, start);
    assert.ok(start >= 0 && end > start, 'found ' + from);
    return source.slice(start, end);
};

function game() {
    // A stage whose render group queues work as PIXI 8's does; a composite consumes it.
    const group = { structureDidChange: false, childrenRenderablesToUpdate: { index: 0 }, childrenToUpdate: { 1: { index: 0 } }, renderGroupChildren: [] };
    const stage = { renderGroup: group };
    const calls = { composites: 0, hooks: 0, effects: 0 };
    class TextureSource { update() { return 'updated'; } }
    const app = {
        stage, renderer: {},
        render() { calls.composites++; group.structureDidChange = false; group.childrenRenderablesToUpdate.index = 0; group.childrenToUpdate[1].index = 0; }
    };
    const PIXI = { TextureSource, __reactorPendingTextureUploads: () => 0, __reactorFlushTextureUploads() {} };
    const Graphics = { _app: app, _fpsCounter: { startTick() {}, endTick() {} }, _canRender() { return !!this._app.stage; }, _lastWatchdogSweep: Infinity };
    const context = {
        Graphics, PIXI, performance: { now: () => 0 }, console,
        ReactorProfiler: { _active: false },
        window: { PIXI, Sprite_Animation: { renderActive() { calls.effects++; } } }
    };
    vm.runInNewContext(between(core, 'Graphics._reactorBeforeRender = ', '\n//-----------------------------------------------------------------------------\n/**\n * The in-game frame profiler'), context);
    Graphics._reactorBeforeRender.add(() => { calls.hooks++; });
    Graphics._watchTextureSources();
    let updates = 1;
    Graphics._tickHandler = () => updates;
    const refresh = n => { updates = n; Graphics._onTick(1); };
    return { Graphics, PIXI, stage, group, calls, refresh, TextureSource, setHandler(fn) { Graphics._tickHandler = fn; } };
}

test('a refresh that ran no update and changed nothing draws nothing, the effects overlay with it', () => {
    const g = game();
    g.refresh(1);
    assert.equal(g.calls.composites, 1, 'an update draws');
    g.refresh(0); g.refresh(0);
    assert.equal(g.calls.composites, 1, 'the two refreshes after it, at 180 Hz, do not');
    assert.equal(g.calls.effects, 1, 'nor does the Effekseer overlay over it');
    assert.equal(g.calls.hooks, 1, 'nor the work that belongs to a drawn frame');
    g.refresh(2);
    assert.equal(g.calls.composites, 2, 'a catch-up of two updates draws once');
    g.Graphics.skipUnchangedFrames = false;
    g.refresh(0);
    assert.equal(g.calls.composites, 3, 'the kill switch draws every refresh');
});

test('what changes between updates still draws', () => {
    const g = game();
    g.refresh(1);
    // A video frame or an uploaded canvas: new pixels in a source no sprite noticed.
    new g.TextureSource().update();
    g.refresh(0);
    assert.equal(g.calls.composites, 2, 'a texture source took new pixels');
    g.refresh(0);
    assert.equal(g.calls.composites, 2, 'and only once');
    // A plugin moving a sprite from its own frame callback: PIXI queues the change on the render group.
    g.group.childrenToUpdate[1].index++;
    g.refresh(0);
    assert.equal(g.calls.composites, 3, 'the stage queued work');
    g.group.childrenRenderablesToUpdate.index++;
    g.refresh(0);
    assert.equal(g.calls.composites, 4, 'a sprite showed another texture');
    g.Graphics.requestRedraw();
    g.refresh(0);
    assert.equal(g.calls.composites, 5, 'asked for');
    g.Graphics._app.stage = { renderGroup: { structureDidChange: false, childrenRenderablesToUpdate: { index: 0 }, childrenToUpdate: {}, renderGroupChildren: [] } };
    g.refresh(0);
    assert.equal(g.calls.composites, 6, 'another stage');
    g.refresh(0);
    assert.equal(g.calls.composites, 6);
    // A tick handler that does not say how many updates it ran (a plugin's own loop) draws every refresh.
    g.setHandler(() => undefined);
    g.Graphics._onTick(1); g.Graphics._onTick(1);
    assert.equal(g.calls.composites, 8);
});

test('the update loop says how many updates a refresh ran; resizes, new stages and draws into textures ask for a redraw', () => {
    const SceneManager = { _smoothDeltaTime: 1, _elapsedTime: 0, trueSpeed: true, MAX_UPDATES: 4, ran: 0,
        updateMain() { this.ran++; }, catchException() {} };
    vm.runInNewContext(between(managers, 'SceneManager.update = function', 'SceneManager.terminate = function'), { SceneManager, Math });
    assert.equal(SceneManager.update(1), 1, 'a 60 Hz refresh: one');
    SceneManager._smoothDeltaTime = 1 / 3; SceneManager._elapsedTime = 0;
    const counts = [];
    for (let i = 0; i < 6; i++) counts.push(SceneManager.update(1 / 3));
    assert.equal(counts.reduce((a, b) => a + b, 0), 2, 'a 180 Hz screen: one refresh in three');
    assert.ok(counts.includes(0));
    SceneManager.updateMain = () => { throw new Error('stopped'); };
    assert.equal(SceneManager.update(1), undefined, 'a loop stopped on an error draws as before');
    assert.match(core, /Graphics\.setStage = function\(stage\) \{[\s\S]{0,120}this\._redrawWanted = true;/);
    assert.match(core, /this\._app\.renderer\.resize\(width, height\);\n\s+this\._redrawWanted = true;/);
    assert.match(core, /\/\/ A resized canvas is a cleared one\.\n\s+this\._redrawWanted = true;/);
    assert.match(core, /renderer\.render = function\(\) \{\n\s+if \(!Graphics\._compositing\) Graphics\._redrawWanted = true;/);
    assert.match(core, /addEventListener\("webglcontextrestored", \(\) => this\.requestRedraw\(\)\)/);
});
