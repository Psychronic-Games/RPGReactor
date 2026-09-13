/**
 * A plugin can hand an action its targets before BattleManager.startAction.
 *
 * startAction rolls targets with makeTargets() when the action begins. A plugin
 * that decides them earlier -- a reaction tested against the battlers a random
 * scope picked, a copied action replayed onto the targets of the one it copies --
 * used to hold them in its own makeTargets wrapper, which handed them to whichever
 * caller asked first. `Game_Action.setPlannedTargets` gives them to the engine
 * instead, and only startAction takes them.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objectsSource = fs.readFileSync(path.join(repoRoot, 'runtime/reactor_objects.js'), 'utf8');
const managersSource = fs.readFileSync(path.join(repoRoot, 'runtime/reactor_managers.js'), 'utf8');

/** One shipped `<Owner>.<name> = function ... };` verbatim from `source`. */
function methodSource(source, owner, name) {
    const head = `${owner}.${name} = function(`;
    const start = source.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${owner}.${name}`);
    const end = source.indexOf('\n};\n', start);
    assert.ok(end > start, `${owner}.${name} terminates`);
    return source.slice(start, end + 4);
}

const STORE = 'Game_Action._plannedTargets = new WeakMap();';
const PLAN_METHODS = ['setPlannedTargets', 'hasPlannedTargets', 'clearPlannedTargets', 'takePlannedTargets'];

/**
 * The shipped plan methods and the shipped startAction, over stubs that record
 * whether makeTargets was asked and what the log and the event were given.
 */
function load() {
    assert.ok(objectsSource.includes(STORE), 'the runtime keeps plans in a WeakMap off the action');
    const emitted = [];
    const context = {
        Game_Action: function() {},
        BattleManager: {},
        ReactorEvents: { emit: (name, payload) => emitted.push({ name, payload }) },
        console,
    };
    vm.runInNewContext([
        STORE,
        ...PLAN_METHODS.map(name => methodSource(objectsSource, 'Game_Action.prototype', name)),
        methodSource(managersSource, 'BattleManager', 'startAction'),
    ].join('\n'), context);
    const { Game_Action, BattleManager } = context;
    const rolled = [];
    Game_Action.prototype.makeTargets = function() { rolled.push(this); return this._rolls.slice(); };
    Game_Action.prototype.applyGlobal = function() {};
    Game_Action.prototype.item = function() { return { id: 1 }; };

    const actionFor = (rolls = ['rolled']) => {
        const action = new Game_Action();
        action._rolls = rolls;
        return action;
    };
    const start = action => {
        const log = {};
        BattleManager._subject = { currentAction: () => action, cancelMotionRefresh() {}, useItem() {} };
        BattleManager._logWindow = { startAction: (subject, a, targets) => { log.targets = targets; } };
        BattleManager.startAction();
        return { targets: [...BattleManager._targets], logged: [...log.targets] };
    };
    return { actionFor, start, rolled, emitted };
}

test('with nothing planned, startAction rolls targets with makeTargets as before', () => {
    const { actionFor, start, rolled, emitted } = load();
    const action = actionFor(['rolled']);
    const { targets, logged } = start(action);
    assert.equal(rolled.length, 1);
    assert.deepEqual(targets, ['rolled']);
    assert.deepEqual(logged, ['rolled']);
    assert.deepEqual([...emitted[0].payload.targets], ['rolled']);
});

test('planned targets are used instead of rolling, and are taken once', () => {
    const { actionFor, start, rolled, emitted } = load();
    const action = actionFor(['rolled']);
    action.setPlannedTargets(['giant', 'giant']);
    assert.equal(action.hasPlannedTargets(), true);

    const first = start(action);
    assert.equal(rolled.length, 0, 'makeTargets was not asked');
    assert.deepEqual(first.targets, ['giant', 'giant']);
    assert.deepEqual(first.logged, ['giant', 'giant'], 'the log is shown the same targets');
    assert.deepEqual([...emitted[0].payload.targets], ['giant', 'giant'], 'and so is actionStart');
    assert.equal(action.hasPlannedTargets(), false, 'the plan is spent');

    assert.deepEqual(start(action).targets, ['rolled'], 'a second start rolls again');
    assert.equal(rolled.length, 1);
});

test('only startAction takes a plan: calling makeTargets beforehand does not use it up', () => {
    const { actionFor, start } = load();
    const action = actionFor(['rolled']);
    action.setPlannedTargets(['giant']);
    action.makeTargets();
    assert.equal(action.hasPlannedTargets(), true);
    assert.deepEqual(start(action).targets, ['giant']);
    assert.doesNotMatch(methodSource(objectsSource, 'Game_Action.prototype', 'makeTargets'), /planned/i,
        'the shipped makeTargets knows nothing about plans');
});

test('a planned array is copied, so the caller cannot change it after handing it over', () => {
    const { actionFor, start } = load();
    const action = actionFor();
    const handed = ['giant'];
    action.setPlannedTargets(handed);
    handed.push('bystander');
    assert.deepEqual(start(action).targets, ['giant']);
});

test('a planned function is resolved when the action starts, with the action as this', () => {
    const { actionFor, start } = load();
    const action = actionFor();
    let calls = 0;
    let self = null;
    action.setPlannedTargets(function() { calls++; self = this; return ['still standing']; });
    assert.equal(calls, 0, 'nothing is resolved when the plan is made');
    assert.deepEqual(start(action).targets, ['still standing']);
    assert.equal(calls, 1);
    assert.equal(self, action);
});

test('an empty plan falls back to makeTargets', () => {
    for (const plan of [[], () => [], () => null, () => 'not a list']) {
        const { actionFor, start, rolled } = load();
        const action = actionFor(['rolled']);
        action.setPlannedTargets(plan);
        assert.deepEqual(start(action).targets, ['rolled'], `plan ${String(plan)}`);
        assert.equal(rolled.length, 1);
    }
});

test('setPlannedTargets with anything else, or clearPlannedTargets, drops a plan', () => {
    const { actionFor, start } = load();
    const action = actionFor(['rolled']);
    action.setPlannedTargets(['giant']);
    action.setPlannedTargets(null);
    assert.equal(action.hasPlannedTargets(), false);
    action.setPlannedTargets(['giant']);
    action.clearPlannedTargets();
    assert.equal(action.hasPlannedTargets(), false);
    assert.deepEqual(start(action).targets, ['rolled']);
});

test('a plan is not stored on the action, so a copy or a save never carries battlers', () => {
    const { actionFor } = load();
    const action = actionFor();
    action.setPlannedTargets([{ name: 'Iron Giant' }]);
    assert.deepEqual(Object.keys(action), ['_rolls']);
    assert.doesNotMatch(JSON.stringify(action), /Iron Giant/);
});
