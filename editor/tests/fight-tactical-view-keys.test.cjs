'use strict';
// A Tactical battle's view keys (runtime/reactor_controls.js, reactor_fight_tactical.js): W A S D move where the
// view looks, Q and E turn it. The keys are the battle's only while it runs, and a key the game already uses for
// something else keeps doing that.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const runtime = path.resolve(__dirname, '..', '..', 'runtime');
const STOCK = { 9: 'tab', 13: 'ok', 16: 'shift', 17: 'control', 18: 'control', 27: 'escape', 32: 'ok', 33: 'pageup', 34: 'pagedown',
    37: 'left', 38: 'up', 39: 'right', 40: 'down', 45: 'escape', 81: 'pageup', 87: 'pagedown', 88: 'escape', 90: 'ok' };

function controls(keys, own = {}) {
    const c = { console: { warn() {}, info() {} }, $dataSystem: { reactorControls: own },
        Input: { keyMapper: Object.assign({}, keys), gamepadMapper: { 0: 'ok', 1: 'cancel' }, _currentState: {} } };
    c.window = c; c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(runtime, 'reactor_controls.js'), 'utf8'), c, { filename: 'reactor_controls.js' });
    return c;
}

test('in a Tactical battle W A S D move the view and Q and E turn it; after it every key is what it was', () => {
    const c = controls(STOCK);
    c.ReactorControls.setTactical(true);
    const keys = c.Input.keyMapper;
    assert.deepEqual([keys[87], keys[65], keys[83], keys[68]], ['panUp', 'panLeft', 'panDown', 'panRight']);
    assert.deepEqual([keys[81], keys[69]], ['viewLeft', 'viewRight'], 'Q turns left, E turns right');
    assert.deepEqual([keys[33], keys[34]], ['viewLeft', 'viewRight'], 'the page keys still turn it');
    assert.deepEqual([keys[37], keys[38], keys[39], keys[40]], ['left', 'up', 'right', 'down'], 'the arrows still move the cursor');
    c.ReactorControls.setTactical(false);
    assert.deepEqual(Object.assign({}, c.Input.keyMapper), STOCK);
});

test('a game that walks with W A S D keeps them in a Tactical battle, and a key the project gave a page turn keeps turning the view', () => {
    const walking = Object.assign({}, STOCK, { 87: 'up', 65: 'left', 83: 'down', 68: 'right' });
    const c = controls(walking);
    c.ReactorControls.setTactical(true);
    assert.deepEqual([c.Input.keyMapper[87], c.Input.keyMapper[65], c.Input.keyMapper[83], c.Input.keyMapper[68]], ['up', 'left', 'down', 'right']);
    assert.equal(c.Input.keyMapper[69], 'viewRight');
    const paged = controls(Object.assign({}, STOCK, { 65: 'pageup' }));
    paged.ReactorControls.setTactical(true);
    assert.equal(paged.Input.keyMapper[65], 'viewLeft');
    assert.equal(paged.Input.keyMapper[87], 'panUp');
});

test('a project\'s own tactical keys are used as they are', () => {
    const c = controls(STOCK, { tacticalKeys: { 73: 'panUp', 81: 'viewLeft' } });
    c.ReactorControls.setTactical(true);
    assert.equal(c.Input.keyMapper[73], 'panUp');
    assert.equal(c.Input.keyMapper[87], 'pagedown', 'W is not taken');
});

function battle() {
    const w = fightWorld({ tactical: true, events: [event(1, 8, 4, { note: '<unit: enemy 1>' })] });
    w.ConfigManager.save = () => {};
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    const held = new Set();
    w.Input.isPressed = name => held.has(name);
    // The battle's own bindings are in force, as in the game: its actions are read by their names.
    w.ReactorControls.isTactical = () => true;
    return { w, fight: w.$gameFight, held, F: w.ReactorFight };
}

test('a held view key moves where the view looks each frame and leaves the cursor where it is', () => {
    const { fight, held, F } = battle();
    const tac = fight.tac(), In = F.Input, step = F.View.SLIDE;
    const cursor = [tac.cursor.x, tac.cursor.y];
    const from = { x: tac.focus.x, y: tac.focus.y };
    held.add('panRight');
    In.update(fight); In.update(fight);
    assert.ok(Math.abs(tac.focus.x - (from.x + 2 * step)) < 1e-9, `right: ${tac.focus.x}`);
    assert.equal(tac.focus.y, from.y);
    held.clear(); held.add('panDown');
    In.update(fight);
    assert.ok(Math.abs(tac.focus.y - (from.y + step)) < 1e-9, `down: ${tac.focus.y}`);
    held.clear(); held.add('panUp'); held.add('panLeft');
    const before = { x: tac.focus.x, y: tac.focus.y };
    In.update(fight);
    const moved = Math.hypot(tac.focus.x - before.x, tac.focus.y - before.y);
    assert.ok(Math.abs(moved - step) < 1e-9, 'two keys together move it no faster');
    assert.ok(tac.focus.x < before.x && tac.focus.y < before.y, 'up and left');
    assert.deepEqual([tac.cursor.x, tac.cursor.y], cursor, 'the cursor did not move');
    held.clear();
    const rest = { x: tac.focus.x, y: tac.focus.y };
    In.update(fight);
    assert.deepEqual({ x: tac.focus.x, y: tac.focus.y }, rest, 'nothing held, nothing moves');
});

test('the view stops at the map\'s edge', () => {
    const { w, fight, held, F } = battle();
    const tac = fight.tac();
    held.add('panLeft'); held.add('panUp');
    for (let i = 0; i < 400; i++) F.Input.update(fight);
    assert.deepEqual([tac.focus.x, tac.focus.y], [0, 0]);
    held.clear(); held.add('panRight'); held.add('panDown');
    for (let i = 0; i < 2000; i++) F.Input.update(fight);
    assert.deepEqual([tac.focus.x, tac.focus.y], [w.$gameMap.width() - 1, w.$gameMap.height() - 1]);
});

test('with the view turned, W still moves it up the screen', () => {
    const { fight, F } = battle();
    const tac = fight.tac(), View = F.View;
    const at = yaw => {
        tac.focus.x = 5; tac.focus.y = 5;
        return (right, ahead) => { View.slide(fight, right, ahead, 1, yaw); return [Math.round(tac.focus.x - 5), Math.round(tac.focus.y - 5)]; };
    };
    assert.deepEqual(at(0)(0, 1), [0, -1], 'unturned, up is north');
    // A quarter turned, the camera looks east: up the screen is east and right is south.
    assert.deepEqual(at(90)(0, 1), [1, 0]);
    assert.deepEqual(at(90)(1, 0), [0, 1]);
    assert.deepEqual(at(180)(0, 1), [0, 1]);
});
