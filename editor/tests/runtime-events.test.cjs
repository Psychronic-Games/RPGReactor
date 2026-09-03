/**
 * Runtime events (`ReactorEvents`).
 *
 * The feed exists so an observer plugin can subscribe to a fact ("HP moved",
 * "someone fell") instead of wrapping the method where it happens. That is
 * only worth anything if the list of facts is trustworthy, so these tests hold
 * three things to one list: the `ReactorEvents.emit(...)` calls in the shipped
 * runtime, the `### \`event\`` headings in `docs/RUNTIME-EVENTS.md`, and the
 * per-event emit counts pinned here. Add an event and forget the doc, or
 * document one that nothing emits, and this fails.
 *
 * The bus itself is evaluated from the shipped source, not reimplemented, and
 * exercised for the guarantees the doc makes: order, isolation from a throwing
 * listener, snapshot dispatch, and a free no-listener path.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeDir = path.join(repoRoot, 'runtime');
const read = file => fs.readFileSync(file, 'utf8');

const coreSource = read(path.join(runtimeDir, 'reactor_core.js'));
const managersSource = read(path.join(runtimeDir, 'reactor_managers.js'));
const objectsSource = read(path.join(runtimeDir, 'reactor_objects.js'));
const docSource = read(path.join(repoRoot, 'docs', 'RUNTIME-EVENTS.md'));

/**
 * Every event the runtime emits, with how many emit points each has. Two
 * for `tpChanged` is deliberate: `gainTp` and `gainSilentTp` are separate
 * methods and the doc distinguishes them by the `silent` field. Two for
 * `actionEnd` is deliberate too: `reactor_mv_compat.js` replaces
 * `BattleManager.endAction` outright for MV-authored games, so that
 * replacement has to emit the event the stock body would have.
 */
const EXPECTED_EMITS = {
    battleStart: 1,
    battleEnd: 1,
    turnStart: 1,
    turnEnd: 1,
    actionStart: 1,
    actionEnd: 2,
    actionApplied: 1,
    hpChanged: 1,
    mpChanged: 1,
    tpChanged: 2,
    battlerDied: 1,
    battlerRevived: 1,
    stateAdded: 1,
    stateRemoved: 1,
};

// --- runtime harness ------------------------------------------------------

/** The shipped `ReactorEvents` block, verbatim, through its `$reactorEvents` alias. */
function busSource() {
    const start = coreSource.indexOf('function ReactorEvents()');
    assert.ok(start >= 0, 'runtime defines ReactorEvents');
    const alias = 'window.$reactorEvents = ReactorEvents;';
    const end = coreSource.indexOf(alias, start);
    assert.ok(end > start, 'runtime exposes $reactorEvents');
    return coreSource.slice(start, end + alias.length);
}

/** A fresh bus in a fresh context, with console.error captured. */
function loadBus() {
    const errors = [];
    const context = {
        window: {},
        globalThis: undefined,
        console: { error: (...args) => errors.push(args), warn() {}, info() {}, log() {} },
    };
    context.globalThis = context;
    vm.runInNewContext(busSource() + '\n;globalThis.__ReactorEvents = ReactorEvents;', context);
    return { bus: context.__ReactorEvents, window: context.window, errors };
}

/** Pull one shipped `<Owner>.<name> = function ... };` verbatim from `source`. */
function methodSource(source, owner, name) {
    const head = `${owner}.${name} = function(`;
    const start = source.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${owner}.${name}`);
    const end = source.indexOf('\n};\n', start);
    assert.ok(end > start, `${owner}.${name} terminates`);
    return source.slice(start, end + 4);
}

/** Every `ReactorEvents.emit("<name>"` across the shipped runtime, counted. */
function emittedEvents() {
    const counts = {};
    for (const file of fs.readdirSync(runtimeDir)) {
        if (!/^reactor_.*\.js$/.test(file)) continue;
        const source = read(path.join(runtimeDir, file));
        for (const match of source.matchAll(/ReactorEvents\.emit\("([A-Za-z]+)"/g)) {
            counts[match[1]] = (counts[match[1]] || 0) + 1;
        }
    }
    return counts;
}

/** Every `### \`event\`` heading under the doc's `## Events` section. */
function documentedEvents() {
    const start = docSource.indexOf('\n## Events');
    assert.ok(start >= 0, 'docs/RUNTIME-EVENTS.md has an Events section');
    const next = docSource.indexOf('\n## ', start + 1);
    const section = docSource.slice(start, next > 0 ? next : undefined);
    return [...section.matchAll(/^### `([A-Za-z]+)`/gm)].map(m => m[1]);
}

// --- the bus ----------------------------------------------------------------

test('on delivers the payload by reference, in subscription order, and the returned function unsubscribes', () => {
    const { bus } = loadBus();
    const seen = [];
    const payload = { battler: 'x', delta: -6 };
    const offA = bus.on('hpChanged', p => seen.push(['a', p]));
    bus.on('hpChanged', p => seen.push(['b', p]));
    bus.emit('hpChanged', payload);
    assert.deepEqual(seen.map(s => s[0]), ['a', 'b']);
    assert.equal(seen[0][1], payload, 'the same object reaches the listener, not a copy');
    offA();
    bus.emit('hpChanged', payload);
    assert.deepEqual(seen.map(s => s[0]), ['a', 'b', 'b']);
    assert.equal(bus.listenerCount('hpChanged'), 1);
});

test('on rejects a non-function listener rather than storing something emit cannot call', () => {
    const { bus } = loadBus();
    // The bus lives in a vm context, so its TypeError is another realm's
    // constructor; match by name and message rather than instanceof.
    const notAFunction = { name: 'TypeError', message: /listener must be a function/ };
    assert.throws(() => bus.on('hpChanged', null), notAFunction);
    assert.throws(() => bus.on('hpChanged', 'not a function'), notAFunction);
    assert.equal(bus.listenerCount('hpChanged'), 0);
});

test('off removes exactly one subscription and tolerates a listener that was never subscribed', () => {
    const { bus } = loadBus();
    const a = () => {};
    const b = () => {};
    bus.on('battleEnd', a);
    bus.on('battleEnd', b);
    bus.off('battleEnd', () => {});
    assert.equal(bus.listenerCount('battleEnd'), 2, 'unknown listener is a no-op');
    bus.off('battleEnd', a);
    assert.equal(bus.listenerCount('battleEnd'), 1);
    bus.off('battleEnd', b);
    assert.equal(bus.listenerCount('battleEnd'), 0);
    bus.off('neverSubscribed', a);
});

test('once delivers exactly one payload and is gone before its listener runs', () => {
    const { bus } = loadBus();
    const seen = [];
    bus.once('turnStart', p => {
        seen.push(p);
        assert.equal(bus.listenerCount('turnStart'), 0, 'already unsubscribed when the listener runs');
    });
    bus.emit('turnStart', { turn: 1 });
    bus.emit('turnStart', { turn: 2 });
    assert.deepEqual(seen, [{ turn: 1 }]);
});

test('a listener that throws is reported and skipped; the ones after it still run and emit does not throw', () => {
    const { bus, errors } = loadBus();
    const seen = [];
    bus.on('battlerDied', () => seen.push('first'));
    bus.on('battlerDied', () => { throw new Error('a statistics plugin has a bug'); });
    bus.on('battlerDied', () => seen.push('third'));
    assert.doesNotThrow(() => bus.emit('battlerDied', { battler: 'x' }));
    assert.deepEqual(seen, ['first', 'third']);
    assert.equal(errors.length, 1);
    assert.match(String(errors[0][0]), /battlerDied/);
    assert.match(String(errors[0][1] && errors[0][1].message), /statistics plugin/);
});

test('subscribing or unsubscribing mid-dispatch takes effect for the next emit, not the one in flight', () => {
    const { bus } = loadBus();
    const seen = [];
    let offB;
    bus.on('actionApplied', () => {
        seen.push('a');
        bus.on('actionApplied', () => seen.push('late'));
        offB();
    });
    offB = bus.on('actionApplied', () => seen.push('b'));
    bus.emit('actionApplied', {});
    assert.deepEqual(seen, ['a', 'b'], 'in-flight emit still reaches b and does not reach the late subscriber');
    seen.length = 0;
    bus.emit('actionApplied', {});
    assert.deepEqual(seen, ['a', 'late'], 'next emit reflects both changes');
});

test('emitting with no listener is a silent no-op', () => {
    const { bus, errors } = loadBus();
    assert.doesNotThrow(() => bus.emit('hpChanged', { delta: 1 }));
    assert.doesNotThrow(() => bus.emit('somethingNobodyKnows', undefined));
    assert.equal(errors.length, 0);
});

test('clear drops one event or everything', () => {
    const { bus } = loadBus();
    bus.on('a', () => {});
    bus.on('b', () => {});
    bus.clear('a');
    assert.equal(bus.listenerCount('a'), 0);
    assert.equal(bus.listenerCount('b'), 1);
    bus.clear();
    assert.equal(bus.listenerCount('b'), 0);
});

test('the bus is a static class and is exposed on window as $reactorEvents', () => {
    const { bus, window } = loadBus();
    assert.throws(() => new bus(), /static class/);
    assert.equal(window.$reactorEvents, bus);
});

// --- the emit points --------------------------------------------------------

test('the runtime emits exactly the documented events, each from the pinned number of places', () => {
    const emitted = emittedEvents();
    const documented = documentedEvents();
    assert.deepEqual(
        Object.keys(emitted).sort(), Object.keys(EXPECTED_EMITS).sort(),
        'every runtime emit is pinned here and nothing pinned has gone missing');
    assert.deepEqual(
        documented.slice().sort(), Object.keys(EXPECTED_EMITS).sort(),
        'docs/RUNTIME-EVENTS.md documents every emitted event and nothing else');
    assert.deepEqual(emitted, EXPECTED_EMITS, 'per-event emit counts');
    assert.equal(new Set(documented).size, documented.length, 'no event is documented twice');
});

test('hpChanged reads HP before the change and reports after the clamp', () => {
    const src = methodSource(objectsSource, 'Game_Battler.prototype', 'gainHp');
    const before = src.indexOf('const before = this.hp');
    const setHp = src.indexOf('this.setHp(');
    const emit = src.indexOf('ReactorEvents.emit("hpChanged"');
    assert.ok(before >= 0 && setHp > before && emit > setHp,
        'before is captured, then setHp runs, then the event is emitted');
    assert.match(src, /after: this\.hp/, 'after is read back from the battler, not computed from delta');
});

test('tpChanged distinguishes its two emitters by the silent field', () => {
    const loud = methodSource(objectsSource, 'Game_Battler.prototype', 'gainTp');
    const quiet = methodSource(objectsSource, 'Game_Battler.prototype', 'gainSilentTp');
    assert.match(loud, /ReactorEvents\.emit\("tpChanged", \{[^}]*silent: false/);
    assert.match(quiet, /ReactorEvents\.emit\("tpChanged", \{[^}]*silent: true/);
});

test('stateAdded reports renewed from the same check that decides whether to add', () => {
    const src = methodSource(objectsSource, 'Game_Battler.prototype', 'addState');
    const renewed = src.indexOf('const renewed = this.isStateAffected(stateId)');
    const branch = src.indexOf('if (!renewed)');
    const addNew = src.indexOf('this.addNewState(stateId)');
    const emit = src.indexOf('ReactorEvents.emit("stateAdded"');
    assert.ok(renewed >= 0 && branch > renewed && addNew > branch && emit > addNew,
        'renewed is computed once, gates addNewState, and is what the event reports');
    assert.match(src, /\{ battler: this, stateId, renewed \}/);
});

test('actionEnd is emitted before the engine may release the subject', () => {
    const src = methodSource(managersSource, 'BattleManager', 'endAction');
    const emit = src.indexOf('ReactorEvents.emit("actionEnd"');
    const release = src.indexOf('this._subject = null');
    assert.ok(emit >= 0 && release > emit);
});

test('the MV-semantics replacement of endAction emits actionEnd itself, first, so the runtime never mutes its own feed', () => {
    const mvCompat = read(path.join(runtimeDir, 'reactor_mv_compat.js'));
    const head = 'BattleManager.endAction = function() {';
    const start = mvCompat.indexOf(head);
    assert.ok(start >= 0, 'reactor_mv_compat.js replaces BattleManager.endAction for MV-authored games');
    const body = mvCompat.slice(start, mvCompat.indexOf('};', start));
    const emit = body.indexOf('ReactorEvents.emit("actionEnd", { subject: this._subject })');
    const log = body.indexOf('this._logWindow.endAction(this._subject)');
    assert.ok(emit >= 0, 'the replacement emits actionEnd');
    assert.ok(log > emit, 'and does so before anything else in the body, matching the stock ordering');
});

test('actionStart hands listeners a copy of the target list, not the one the engine drains', () => {
    const src = methodSource(managersSource, 'BattleManager', 'startAction');
    assert.match(src, /targets: targets\.slice\(\)/);
});

test('battleEnd reports the escape flag the engine itself uses for onBattleEscape', () => {
    const src = methodSource(managersSource, 'BattleManager', 'endBattle');
    assert.match(src, /escaped: !!this\._escaped/);
    assert.ok(src.indexOf('$gameSystem.onBattleEscape()') < src.indexOf('ReactorEvents.emit("battleEnd"'),
        'emitted after the engine has acted on the same flag');
});

test('battlerDied is the last thing die does, after states and buffs are cleared', () => {
    const src = methodSource(objectsSource, 'Game_BattlerBase.prototype', 'die');
    const clear = src.indexOf('this.clearBuffs()');
    const emit = src.indexOf('ReactorEvents.emit("battlerDied"');
    assert.ok(clear >= 0 && emit > clear);
});

// --- the bundled copies -----------------------------------------------------

test('the bundled Demo carries the same runtime as runtime/ for every file that emits', () => {
    for (const file of ['reactor_core.js', 'reactor_managers.js', 'reactor_objects.js']) {
        const canonical = read(path.join(runtimeDir, file));
        const bundled = read(path.join(repoRoot, 'template', 'Demo', 'js', file));
        assert.equal(bundled, canonical,
            `template/Demo/js/${file} matches runtime/ — run editor/build-scripts/sync-runtime.cjs`);
    }
});
