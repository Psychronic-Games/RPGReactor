/**
 * The action result says how each state it was asked for turned out.
 *
 * `isStateAdded` is true both for a state the battler did not have and for one
 * it already had whose turn count was only reset, and it is false alike for a
 * chance roll that failed and for a state the target was immune to. `addState`
 * knows which of these happened; the result now keeps it: `isStateRenewed` /
 * `isStateNewlyAdded` split the first pair, `isStateBlocked` names the case
 * where addState was asked and the battler was left without the state. And
 * `isLanded` is `isHit` minus a hit that `dodged` turned aside, whose effects
 * `apply` skips.
 *
 * The shipped `Game_ActionResult` and `Game_Battler.addState` run here
 * together, not a copy of either.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime/reactor_objects.js'), 'utf8');

/** The shipped Game_ActionResult, from its constructor to the next class banner. */
function resultClassSource() {
    const start = objectsSource.indexOf('function Game_ActionResult() {');
    assert.ok(start >= 0, 'runtime defines Game_ActionResult');
    const end = objectsSource.indexOf('\n//----', start);
    assert.ok(end > start, 'Game_ActionResult ends at a class banner');
    return objectsSource.slice(start, end);
}

function methodSource(klass, name) {
    const head = `${klass}.prototype.${name} = function(`;
    const start = objectsSource.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${klass}.prototype.${name}`);
    const end = objectsSource.indexOf('\n};\n', start);
    return objectsSource.slice(start, end + 4);
}

const DEATH = 1;
const POISON = 4;
const SLEEP = 5;

/**
 * A battler running the shipped addState with a real result. `addable` is what
 * isStateAddable answers; `refuse` is a state addNewState turns away.
 */
function battlerFor({ states = [], addable = () => true, refuse = null } = {}) {
    const emitted = [];
    const context = {
        Game_Battler: function() {},
        ReactorEvents: { emit: (name, payload) => emitted.push({ name, payload }) },
        $dataStates: [null, { id: DEATH }, null, null, { id: POISON }, { id: SLEEP }],
        console,
    };
    vm.runInNewContext(resultClassSource(), context);
    vm.runInNewContext(methodSource('Game_Battler', 'addState'), context);
    const battler = new context.Game_Battler();
    battler._states = states.slice();
    battler._result = new context.Game_ActionResult();
    battler.isStateAddable = addable;
    battler.isStateAffected = id => battler._states.includes(id);
    battler.addNewState = id => { if (id !== refuse) battler._states.push(id); };
    battler.removeState = id => { battler._states = battler._states.filter(s => s !== id); };
    battler.refresh = () => {};
    battler.resetStateCounts = () => {};
    return { battler, result: battler._result, emitted, context };
}

test('a fresh state is added and newly added, not renewed or blocked', () => {
    const { battler, result } = battlerFor();
    battler.addState(POISON);
    assert.equal(result.isStateAdded(POISON), true);
    assert.equal(result.isStateNewlyAdded(POISON), true);
    assert.equal(result.isStateRenewed(POISON), false);
    assert.equal(result.isStateBlocked(POISON), false);
});

test('a state the battler already had is added and renewed, and agrees with stateAdded', () => {
    const { battler, result, emitted } = battlerFor({ states: [POISON] });
    battler.addState(POISON);
    assert.equal(result.isStateAdded(POISON), true, 'isStateAdded is unchanged: true for a renewal');
    assert.equal(result.isStateRenewed(POISON), true);
    assert.equal(result.isStateNewlyAdded(POISON), false);
    assert.equal(emitted[0].payload.renewed, true);
});

test('a state that arrived fresh stays fresh when the same action lands it again', () => {
    const { battler, result } = battlerFor();
    battler.addState(POISON);
    battler.addState(POISON);
    assert.equal(result.isStateNewlyAdded(POISON), true);
    assert.equal(result.isStateRenewed(POISON), false);
});

test('a resisted state is blocked and not added', () => {
    const { battler, result, emitted } = battlerFor({ addable: id => id !== SLEEP });
    battler.addState(SLEEP);
    assert.equal(result.isStateAdded(SLEEP), false);
    assert.equal(result.isStateBlocked(SLEEP), true);
    assert.deepEqual(emitted, [], 'stateAdded still does not fire');
});

test('a state addNewState turns away is blocked', () => {
    const { battler, result } = battlerFor({ refuse: DEATH });
    battler.addState(DEATH);
    assert.equal(result.isStateAdded(DEATH), false);
    assert.equal(result.isStateBlocked(DEATH), true);
});

test('a state the battler keeps is not blocked when a renewal is refused', () => {
    // A fallen battler's refresh asks for death on every call; the dead
    // battler is not addable, and it already has death.
    const { battler, result } = battlerFor({ states: [DEATH], addable: () => false });
    battler.addState(DEATH);
    assert.equal(result.isStateBlocked(DEATH), false);
    assert.equal(result.isStateAdded(DEATH), false);
});

test('an unknown state id is not recorded as blocked', () => {
    const { battler, result } = battlerFor({ addable: () => false });
    battler.addState(99);
    assert.equal(result.isStateBlocked(99), false);
});

test('a state that lands after an earlier blocked attempt is added, no longer blocked', () => {
    let refuse = true;
    const { battler, result } = battlerFor({ addable: () => !refuse });
    battler.addState(SLEEP);
    assert.equal(result.isStateBlocked(SLEEP), true);
    refuse = false;
    battler.addState(SLEEP);
    assert.equal(result.isStateAdded(SLEEP), true);
    assert.equal(result.isStateBlocked(SLEEP), false);
});

test('a state already recorded as added is not then recorded as blocked', () => {
    let refuse = false;
    const { battler, result } = battlerFor({ addable: () => !refuse });
    battler.addState(SLEEP);
    battler.removeState(SLEEP);
    refuse = true;
    battler.addState(SLEEP);
    assert.equal(result.isStateAdded(SLEEP), true);
    assert.equal(result.isStateBlocked(SLEEP), false);
});

test('clear empties both lists', () => {
    const { battler, result } = battlerFor({ states: [POISON], addable: id => id === POISON });
    battler.addState(POISON);
    battler.addState(SLEEP);
    assert.equal(result.isStateRenewed(POISON), true);
    assert.equal(result.isStateBlocked(SLEEP), true);
    result.clear();
    assert.deepEqual([...result.renewedStates], []);
    assert.deepEqual([...result.blockedStates], []);
});

test('a result restored from a save made before the lists existed still works', () => {
    const { battler, result } = battlerFor({ states: [POISON], addable: id => id === POISON });
    delete result.renewedStates;
    delete result.blockedStates;
    assert.equal(result.isStateRenewed(POISON), false, 'queries answer false rather than throw');
    assert.equal(result.isStateBlocked(SLEEP), false);
    battler.addState(POISON);
    battler.addState(SLEEP);
    assert.equal(result.isStateRenewed(POISON), true, 'and the push methods create them');
    assert.equal(result.isStateBlocked(SLEEP), true);
});

test('isLanded is isHit without a dodged hit', () => {
    const { context } = battlerFor();
    const result = new context.Game_ActionResult();
    result.used = true;
    assert.equal(result.isHit(), true);
    assert.equal(result.isLanded(), true);
    result.dodged = true;
    assert.equal(result.isHit(), true, 'isHit is unchanged');
    assert.equal(result.isLanded(), false);
    result.dodged = false;
    result.missed = true;
    assert.equal(result.isLanded(), false);
});
