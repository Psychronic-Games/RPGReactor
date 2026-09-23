/**
 * A state that addNewState turns away is not reported as added.
 *
 * `Game_Battler.addState` checks that a state is addable, calls `addNewState`,
 * and then recorded the state on the action result and emitted `stateAdded`
 * unconditionally. `addNewState` is where plugins refuse a state that was
 * addable a moment earlier: VisuMZ_3_LifeStateEffects' auto-life and death
 * transform, and VisuMZ_3_AutoSkillTriggers' death trigger, all return from it
 * without adding death. The result then listed a death that did not happen, and
 * the battle log -- which queues a collapse for every death state it finds on a
 * result -- collapsed an enemy that auto-life had just put back on its feet.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime/reactor_objects.js'), 'utf8');

/** One shipped `Game_Battler.prototype.<name> = function ... };` verbatim. */
function methodSource(klass, name) {
    const head = `${klass}.prototype.${name} = function(`;
    const start = objectsSource.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${klass}.prototype.${name}`);
    const end = objectsSource.indexOf('\n};\n', start);
    return objectsSource.slice(start, end + 4);
}

/**
 * A battler running the shipped addState over stubbed collaborators that record
 * what addState did. `refuse` makes addNewState turn the given state away, the
 * way an auto-life does.
 */
function battlerFor({ states = [], refuse = null } = {}) {
    const emitted = [];
    const context = {
        Game_Battler: function() {},
        ReactorEvents: { emit: (name, payload) => emitted.push({ name, payload }) },
        console,
    };
    vm.runInNewContext(methodSource('Game_Battler', 'addState'), context);
    const battler = new context.Game_Battler();
    battler._states = states.slice();
    battler.calls = { addNewState: [], refresh: 0, resetStateCounts: [] };
    battler.pushed = [];
    battler.blocked = [];
    battler._result = {
        pushAddedState: id => battler.pushed.push(id),
        isStateAdded: id => battler.pushed.includes(id),
        pushRenewedState: () => {},
        pushBlockedState: id => battler.blocked.push(id),
    };
    battler.isStateAddable = () => true;
    battler.isStateAffected = id => battler._states.includes(id);
    battler.addNewState = id => {
        battler.calls.addNewState.push(id);
        if (id !== refuse) battler._states.push(id);
    };
    battler.refresh = () => { battler.calls.refresh++; };
    battler.resetStateCounts = id => battler.calls.resetStateCounts.push(id);
    return { battler, emitted };
}

const DEATH = 1;
const POISON = 4;

test('a state that lands is added, counted, recorded and reported, as before', () => {
    const { battler, emitted } = battlerFor();
    battler.addState(POISON);
    assert.deepEqual(battler._states, [POISON]);
    assert.equal(battler.calls.refresh, 1);
    assert.deepEqual(battler.calls.resetStateCounts, [POISON]);
    assert.deepEqual(battler.pushed, [POISON]);
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].name, 'stateAdded');
    assert.equal(emitted[0].payload.stateId, POISON);
    assert.equal(emitted[0].payload.renewed, false);
});

test('renewing a state the battler already has still resets, records and reports it', () => {
    const { battler, emitted } = battlerFor({ states: [POISON] });
    battler.addState(POISON);
    assert.deepEqual(battler.calls.addNewState, [], 'a renewal does not add the state again');
    assert.deepEqual(battler.calls.resetStateCounts, [POISON]);
    assert.deepEqual(battler.pushed, [POISON]);
    assert.equal(emitted[0].payload.renewed, true);
});

test('a state addNewState refuses is neither recorded on the result nor reported', () => {
    const { battler, emitted } = battlerFor({ refuse: DEATH });
    battler.addState(DEATH);
    assert.deepEqual(battler.calls.addNewState, [DEATH], 'the plugin was asked');
    assert.deepEqual(battler._states, [], 'and turned it away');
    assert.deepEqual(battler.pushed, [], 'so the result does not list a death that did not happen');
    assert.deepEqual(emitted, [], 'and stateAdded does not report one');
    assert.deepEqual(battler.calls.resetStateCounts, [], 'no turn count is kept for a state that is not there');
    assert.deepEqual(battler.blocked, [DEATH], 'the result records it as blocked instead');
});

test('refresh still runs after a refusal, so whatever the plugin changed is settled', () => {
    const { battler } = battlerFor({ refuse: DEATH });
    battler.addState(DEATH);
    assert.equal(battler.calls.refresh, 1);
});

test('a refusal is decided per call: the same state lands normally once nothing refuses it', () => {
    const { battler, emitted } = battlerFor({ refuse: DEATH });
    battler.addState(DEATH);
    battler.addNewState = id => { battler.calls.addNewState.push(id); battler._states.push(id); };
    battler.addState(DEATH);
    assert.deepEqual(battler._states, [DEATH]);
    assert.deepEqual(battler.pushed, [DEATH]);
    assert.equal(emitted.length, 1);
});
