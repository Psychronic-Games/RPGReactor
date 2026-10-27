'use strict';
// RPG Maker 2000/2003 "Timer at N seconds or less" page conditions (Sunset over Imdahl's rat hunt): the import
// dropped them, so the "too slow" page ran the moment its switch came on and the timer "ran out" as it started.
// Also: a gamepad stick held on either side of its line no longer counts one flick as two or three presses.
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const K = require('../src/legacy/LegacyConvert.js');

const slice = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return src.slice(a, b); };

test('the import keeps a page\'s timer condition', () => {
    const notes = {};
    const page = K.eventPage({ condition: { flags: 0x21, switch_a_id: 38, timer_sec: 1 }, trigger: 3 }, notes);
    assert.equal(page.conditions.switch1Valid, true);
    assert.equal(page.conditions.rrTimerSec, 1);
    assert.deepEqual(notes, {});
    assert.equal(K.eventPage({ condition: { flags: 0x01, switch_a_id: 2 } }, {}).conditions.rrTimerSec, undefined);
    const second = {};
    assert.equal(K.eventPage({ condition: { flags: 0x60, timer_sec: 5, timer2_sec: 3 } }, second).conditions.rrTimerSec, 3, '2003\'s second timer runs on the one timer');
    assert.deepEqual(second, { timerCondition: 1 });
});

function world() {
    const objects = runtimeSource('reactor_objects.js'), map = runtimeSource('reactor_objects_map.js');
    let refreshes = 0;
    const box = { BattleManager: { abort() {} }, $gameSwitches: { value: id => id === 38 }, $gameVariables: { value: () => 0 }, $gameSelfSwitches: { value: () => false }, $gameParty: { hasItem: () => false, members: () => [] }, $dataItems: [], $gameActors: { actor: () => null } };
    vm.runInNewContext('function Game_Map() {} function Game_Event() {}' + slice(objects, 'function Game_Timer()', '//-----------------------------------------------------------------------------\n// Game_Message')
        + slice(map, '/** Whether a page of this map waits on the timer', '\nGame_Event.prototype.meetsConditions = function(page) {')
        + slice(map, '\nGame_Event.prototype.meetsConditions = function(page) {', '\n};\n') + '\n};', box);
    const page = { conditions: { switch1Valid: true, switch1Id: 38, rrTimerSec: 1 } };
    box.$dataMap = { events: [null, { pages: [page] }] };
    box.$gameMap = Object.assign(new box.Game_Map(), { requestRefresh() { refreshes++; } });
    box.$gameTimer = new box.Game_Timer();
    const ev = Object.create(box.Game_Event.prototype);
    return { box, page, ev, refreshes: () => refreshes };
}

test('a timer page waits for the count to reach its seconds, and the count down refreshes the map', () => {
    const { box, page, ev, refreshes } = world();
    box.$gameTimer.start(70 * 60);
    assert.equal(ev.meetsConditions(page), false, 'seventy seconds left: not yet');
    const before = refreshes();
    let met = -1;
    for (let f = 1; f <= 70 * 60; f++) { box.$gameTimer.update(true); if (met < 0 && ev.meetsConditions(page)) met = f; }
    assert.equal(met, 69 * 60 - 59, 'met when the whole seconds left come to one, as EasyRPG floors them');
    assert.equal(refreshes() - before, 70, 'a refresh each whole second, not each frame');
    // A map with no timer page pays nothing.
    box.$dataMap = { events: [null, { pages: [{ conditions: {} }] }] };
    const quiet = refreshes();
    box.$gameTimer.start(5 * 60);
    for (let f = 0; f < 300; f++) box.$gameTimer.update(true);
    assert.equal(refreshes(), quiet);
});

test('a stick flick wobbling about half way counts once', () => {
    const io = runtimeSource('reactor_core_io.js');
    const box = {};
    vm.runInNewContext('const Input = {}; this.Input = Input;' + slice(io, 'Input._updateGamepadState = function(gamepad) {', '\nInput._updateDirection = function'), box);
    const Input = box.Input;
    Input._gamepadStates = [];
    const pad = y => ({ index: 0, buttons: [], axes: [0, y] });
    let presses = 0, was = false;
    for (const y of [0, 0.3, 0.6, 0.45, 0.55, 0.42, 0.52, 0.35, 0.2, 0, -0.1, 0]) {
        Input._updateGamepadState(pad(y));
        const down = !!Input._gamepadStates[0][13];
        if (down && !was) presses++;
        was = down;
    }
    assert.equal(presses, 1);
    assert.equal(Input._gamepadStates[0].length, 16, 'no extra entries for button rebinding to see');
    Input._updateGamepadState(pad(-0.7));
    assert.equal(Input._gamepadStates[0][12], true);
    assert.equal(Input._gamepadStates[0][13], false);
});
