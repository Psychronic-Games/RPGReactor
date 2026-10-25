'use strict';
// A Battle Room's effects advance once a frame (runtime/reactor_battle_room.js, updateEffects). In the game the room
// shares the map viewport's Effekseer context, which the game's frame already advances (Reactor3D.GpuEffects.update,
// from SceneManager.updateEffekseer): advanced by the room as well, every Action Sequence animation ran at twice its
// speed and was over before most of it was seen. The editor's own preview context is advanced by the room alone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtime = path.join(__dirname, '..', '..', 'runtime');
const effects = fs.readFileSync(path.join(runtime, 'reactor_3d_effects.js'), 'utf8');

function gpuEffects() {
    // The real advancedByGame, on a stand-in with the game's list of shared contexts.
    const start = effects.indexOf('    advancedByGame(entry) {');
    const method = effects.slice(start, effects.indexOf('\n    },\n', start) + 7);
    return vm.runInNewContext(`({ _runtime: new Map(), ${method} restoreDefault() {}, update() { for (const e of this._runtime.values()) e.context.update(); } })`);
}

function room(G, shared) {
    const scope = { Reactor3D: { GpuEffects: G, effectAnchorWorld: () => null }, effekseer: {}, document: {} };
    vm.runInNewContext(fs.readFileSync(path.join(runtime, 'reactor_battle_room.js'), 'utf8'), scope);
    const view = Object.create(scope.ReactorBattleRoomView.prototype);
    let advanced = 0;
    const entry = { renderer: {}, disposed: false, context: { _makeContextCurrent() {}, update() { advanced++; } } };
    if (shared) G._runtime.set(entry.renderer, entry);
    Object.assign(view, { assets: { animation: () => ({}), effectUrl: () => '' }, models: new Map(), effectPlays: new Map(), effectContext: entry, releaseContext() {} });
    return { view, advanced: () => advanced };
}

test('a room advances its effects once a frame: not again when the game advances the context it shares', () => {
    const G = gpuEffects();
    const shared = room(G, true);
    // One game frame: the game's own pass, then the room's.
    G.update();
    shared.view.updateEffects();
    assert.equal(shared.advanced(), 1, 'the shared context: the game\'s pass only');
    const own = room(gpuEffects(), false);
    own.view.updateEffects();
    assert.equal(own.advanced(), 1, 'the editor\'s own context: the room\'s pass');
});
