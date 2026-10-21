'use strict';
/**
 * Buff Rate (trait 15): the chance a buff on one parameter is accepted.
 *
 * The runtime half runs the shipped methods - buffRate, isBuffAccepted, the
 * gate installer, and the stock buff methods it wraps - in a vm, under
 * stand-ins for the four plugin wrappers it has to sit outside of: Enhanced
 * TP's itemEffectAddBuff (TP whenever the result is already a success),
 * SkillsStatesCore's and BattleVoices' addBuff (a callback and a voice after
 * the stock call), and Boost Action's addBuff (rewrites the turns).
 */
const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');
const objects = runtimeSource('reactor_objects.js');

/** One `X = function(...) {...};` block out of the runtime, by its opening line. */
function block(marker) {
    const start = objects.indexOf(marker);
    assert.notEqual(start, -1, `runtime is missing: ${marker}`);
    return objects.slice(start, objects.indexOf('\n};\n', start) + 4);
}

/** One single-line statement out of the runtime. */
function line(marker) {
    const start = objects.indexOf(marker);
    assert.notEqual(start, -1, `runtime is missing: ${marker}`);
    return objects.slice(start, objects.indexOf('\n', start) + 1);
}

const BLOCKS = [
    'Game_BattlerBase.prototype.traitsPi = function',
    'Game_BattlerBase.prototype.debuffRate = function',
    'Game_BattlerBase.prototype.buffRate = function',
    'Game_BattlerBase.prototype.isBuffAccepted = function',
    'Game_BattlerBase.prototype.clearBuffs = function',
    'Game_BattlerBase.prototype.eraseBuff = function',
    'Game_BattlerBase.prototype.buffPotencyList = function',
    'Game_BattlerBase.prototype.setPendingBuffPotency = function',
    'Game_BattlerBase.prototype.shiftBuffPotency = function',
    'Game_BattlerBase.prototype.buffLength = function',
    'Game_BattlerBase.prototype.buff = function',
    'Game_BattlerBase.prototype.isBuffAffected = function',
    'Game_BattlerBase.prototype.isDebuffAffected = function',
    'Game_BattlerBase.prototype.isBuffOrDebuffAffected = function',
    'Game_BattlerBase.prototype.isMaxBuffAffected = function',
    'Game_BattlerBase.prototype.isMaxDebuffAffected = function',
    'Game_BattlerBase.prototype.increaseBuff = function',
    'Game_BattlerBase.prototype.decreaseBuff = function',
    'Game_BattlerBase.prototype.overwriteBuffTurns = function',
    'Game_BattlerBase.prototype.isBuffExpired = function',
    'Game_BattlerBase.prototype.updateBuffTurns = function',
    'Game_Battler.prototype.addBuff = function',
    'Game_Battler.prototype.addDebuff = function',
    'Game_Battler.prototype.removeBuff = function',
    'Game_Battler.prototype.removeBuffsAuto = function',
    'Game_Battler.installBuffRateGate = function',
    'Game_Action.effectBuffRate = function',
    'Game_Action.prototype.itemEffectAddBuff = function',
    'Game_Action.prototype.itemEffectAddDebuff = function',
    'Game_Action.prototype.itemEffectRemoveBuff = function',
    'Game_Action.prototype.makeSuccess = function'
];

/**
 * The shipped methods in a fresh realm. `rolls` is the queue Math.random
 * answers from; `draws` counts how many it was asked for.
 */
function runtime({ rolls = [] } = {}) {
    const random = { queue: rolls.slice(), draws: 0 };
    const fakeMath = Object.create(Math);
    fakeMath.random = () => {
        random.draws++;
        assert.ok(random.queue.length > 0, 'Math.random was drawn more often than the test allows');
        return random.queue.shift();
    };
    const context = { Math: fakeMath, Number, Array, console };
    vm.createContext(context);
    vm.runInContext(`
        function Game_BattlerBase() {}
        function Game_Battler() {}
        Game_Battler.prototype = Object.create(Game_BattlerBase.prototype);
        Game_Battler.prototype.constructor = Game_Battler;
        function Game_Action() {}
    `, context);
    const source = [
        line('Game_BattlerBase.TRAIT_DEBUFF_RATE = '),
        line('Game_BattlerBase.TRAIT_BUFF_RATE = '),
        line('Game_BattlerBase.BUFF_RATE_PER_STACK = '),
        line('Game_Battler._buffRatePass = '),
        ...BLOCKS.map(block)
    ].join('\n');
    vm.runInContext(source, context);
    return { ...context, random, Game_BattlerBase: context.Game_BattlerBase, Game_Battler: context.Game_Battler, Game_Action: context.Game_Action };
}

/** A living battler whose traits are `traits`, with a result that records what happened. */
function battler(rt, traits = []) {
    const b = new rt.Game_Battler();
    b.clearBuffs();
    b._traits = traits;
    b.traitsWithId = (code, id) => b._traits.filter(t => t.code === code && t.dataId === id);
    b.isAlive = () => true;
    b.luk = 0;
    b._result = { success: false, addedBuffs: [], addedDebuffs: [], removedBuffs: [],
        pushAddedBuff(id) { this.addedBuffs.push(id); },
        pushAddedDebuff(id) { this.addedDebuffs.push(id); },
        pushRemovedBuff(id) { this.removedBuffs.push(id); } };
    b.result = () => b._result;
    b.refresh = () => {};
    return b;
}

function action(rt, subject) {
    const a = new rt.Game_Action();
    a.subject = () => subject || { luk: 0 };
    a.lukEffectRate = () => 1;
    return a;
}

/** A vm-realm value as a host one, so deepEqual compares shape and not realm. */
const plain = value => JSON.parse(JSON.stringify(value));
const addBuff = (dataId, turns = 5, value2 = 0) => ({ code: 31, dataId, value1: turns, value2 });
const block0 = paramId => ({ code: 15, dataId: paramId, value: 0 });

/**
 * The installed plugins' wrappers, in their load order, as plain stand-ins:
 * each records that it ran. `log.etpTp` is Enhanced TP's TP grant.
 */
function installPlugins(rt) {
    const log = { sscOnAddBuff: 0, voice: 0, etpTp: 0, boostTurns: [] };
    const sscAddBuff = rt.Game_Battler.prototype.addBuff;
    rt.Game_Battler.prototype.addBuff = function(paramId, turns) {
        sscAddBuff.call(this, paramId, turns);
        if (this.isBuffAffected(paramId)) log.sscOnAddBuff++;
    };
    const etp = rt.Game_Action.prototype.itemEffectAddBuff;
    rt.Game_Action.prototype.itemEffectAddBuff = function(target, effect) {
        etp.call(this, target, effect);
        if (!target.result().success) return;
        log.etpTp++;
    };
    const voices = rt.Game_Battler.prototype.addBuff;
    rt.Game_Battler.prototype.addBuff = function(paramId, turns) {
        voices.call(this, paramId, turns);
        log.voice++;
    };
    const boost = rt.Game_Battler.prototype.addBuff;
    rt.Game_Battler.prototype.addBuff = function(paramId, turns) {
        if (rt.boostRate) turns = Math.round(rt.boostRate * turns);
        log.boostTurns.push(turns);
        boost.call(this, paramId, turns);
    };
    return log;
}

/** Plugins loaded, then boot: the gate is installed last, outside them all. */
function booted(options) {
    const rt = runtime(options);
    const log = installPlugins(rt);
    assert.equal(rt.Game_Battler.installBuffRateGate(), true);
    return { rt, log };
}

test('trait code 15 is Buff Rate, and RPG Maker leaves it unused', () => {
    const rt = runtime();
    assert.equal(rt.Game_BattlerBase.TRAIT_BUFF_RATE, 15);
    assert.equal(rt.Game_BattlerBase.TRAIT_DEBUFF_RATE, 12);
    for (const [name, code] of objects.matchAll(/Game_BattlerBase\.(TRAIT_\w+) = (\d+);/g)) {
        if (name !== 'TRAIT_BUFF_RATE') assert.notEqual(Number(code), 15, `${name} already uses 15`);
    }
});

test('buffRate multiplies its traits, defaults to 1, and reads one parameter only', () => {
    const rt = runtime();
    assert.equal(battler(rt).buffRate(2), 1, 'no trait accepts every buff');
    const half = { code: 15, dataId: 2, value: 0.5 };
    assert.equal(battler(rt, [half]).buffRate(2), 0.5);
    assert.equal(battler(rt, [half, { ...half }]).buffRate(2), 0.25, 'two 50% traits leave 25%');
    const atk = battler(rt, [block0(2)]);
    assert.equal(atk.buffRate(2), 0);
    for (const other of [0, 1, 3, 4, 5, 6, 7]) assert.equal(atk.buffRate(other), 1, `param ${other} is untouched`);
    assert.equal(battler(rt, [{ code: 12, dataId: 2, value: 0 }]).buffRate(2), 1, 'a Debuff Rate trait is not a Buff Rate');
    assert.equal(battler(rt, [block0(2)]).debuffRate(2), 1, 'and a Buff Rate trait is not a Debuff Rate');
});

test('acceptance is clamped to 0-100%, and a sure answer draws no random number', () => {
    const rt = runtime();
    for (const value of [1, 1.5, 3]) assert.equal(battler(rt, [{ code: 15, dataId: 3, value }]).isBuffAccepted(3), true);
    for (const value of [0, -0.5]) assert.equal(battler(rt, [{ code: 15, dataId: 3, value }]).isBuffAccepted(3), false);
    assert.equal(battler(rt).isBuffAccepted(3), true);
    assert.equal(rt.random.draws, 0);
});

test('an intermediate chance is one roll against the clamped rate', () => {
    const rt = runtime({ rolls: [0.49, 0.5, 0.0, 0.2499, 0.25] });
    const half = battler(rt, [{ code: 15, dataId: 4, value: 0.5 }]);
    assert.equal(half.isBuffAccepted(4), true, '0.49 < 50%');
    assert.equal(half.isBuffAccepted(4), false, '0.50 is not below 50%');
    assert.equal(half.isBuffAccepted(4), true);
    const quarter = battler(rt, [{ code: 15, dataId: 4, value: 0.5 }, { code: 15, dataId: 4, value: 0.5 }]);
    assert.equal(quarter.isBuffAccepted(4), true);
    assert.equal(quarter.isBuffAccepted(4), false);
    assert.equal(rt.random.draws, 5, 'exactly one draw per question');
});

test('with no Buff Rate trait the gate changes nothing and draws nothing', () => {
    const { rt, log } = booted();
    const target = battler(rt);
    const act = action(rt);
    act.itemEffectAddBuff(target, addBuff(2, 5, 0.4));
    target.addBuff(3, 4);
    assert.deepEqual([target.buff(2), target._buffTurns[2], target.buff(3), target._buffTurns[3]], [1, 5, 1, 4]);
    assert.deepEqual(plain(target.buffPotencyList(2)), [0.4], 'Reactor buff strength still applies');
    assert.deepEqual(target._result.addedBuffs, [2, 3]);
    assert.equal(target._result.success, true);
    assert.deepEqual([log.sscOnAddBuff, log.voice, log.etpTp], [2, 2, 1]);
    assert.equal(rt.random.draws, 0);
});

test('a blocked Add Buff effect changes nothing and enters no plugin wrapper', () => {
    const { rt, log } = booted();
    const target = battler(rt, [block0(2)]);
    action(rt).itemEffectAddBuff(target, addBuff(2, 5, 0.4));
    assert.equal(target.buff(2), 0);
    assert.equal(target._buffTurns[2], 0);
    assert.equal(target.buffPotencyList(2).length, 0);
    assert.deepEqual(target._result.addedBuffs, []);
    assert.equal(target._result.success, false, 'a blocked buff is not a success');
    assert.deepEqual([log.sscOnAddBuff, log.voice, log.etpTp, log.boostTurns.length], [0, 0, 0, 0]);
    assert.equal(rt.Game_Battler._buffRatePass, null);
});

test('Enhanced TP grants nothing for a blocked buff even when an earlier effect already succeeded', () => {
    const { rt, log } = booted();
    const target = battler(rt, [block0(2)]);
    target._result.success = true; // an earlier effect on the same action landed
    action(rt).itemEffectAddBuff(target, addBuff(2));
    assert.equal(log.etpTp, 0, 'the stock success check alone would have paid out here');
    assert.equal(target._result.success, true, 'the earlier success is kept');
});

test('an accepted Add Buff effect rolls once, and its addBuff does not roll again', () => {
    const { rt, log } = booted({ rolls: [0.1] });
    const target = battler(rt, [{ code: 15, dataId: 2, value: 0.5 }]);
    action(rt).itemEffectAddBuff(target, addBuff(2, 5, 0.4));
    assert.equal(rt.random.draws, 1);
    assert.equal(target.buff(2), 1);
    assert.deepEqual(plain(target.buffPotencyList(2)), [0.4]);
    assert.deepEqual([log.sscOnAddBuff, log.voice, log.etpTp], [1, 1, 1]);
    assert.equal(rt.Game_Battler._buffRatePass, null, 'the pass was spent');
});

test('a rejected intermediate roll on an Add Buff effect is also a clean miss', () => {
    const { rt, log } = booted({ rolls: [0.9] });
    const target = battler(rt, [{ code: 15, dataId: 2, value: 0.5 }]);
    action(rt).itemEffectAddBuff(target, addBuff(2));
    assert.equal(rt.random.draws, 1);
    assert.deepEqual([target.buff(2), log.sscOnAddBuff, log.voice, log.etpTp], [0, 0, 0, 0]);
});

test('a direct addBuff (event, script, plugin) rolls for itself and stops before every wrapper', () => {
    const { rt, log } = booted({ rolls: [0.9, 0.1] });
    const target = battler(rt, [{ code: 15, dataId: 6, value: 0.5 }]);
    target.addBuff(6, 3);
    assert.deepEqual([target.buff(6), log.sscOnAddBuff, log.voice, log.boostTurns.length], [0, 0, 0, 0], 'rejected');
    target.addBuff(6, 3);
    assert.deepEqual([target.buff(6), target._buffTurns[6], log.sscOnAddBuff, log.voice], [1, 3, 1, 1], 'accepted');
    assert.equal(rt.random.draws, 2);
});

test('arguments and return values pass through, so Boost Action still rewrites the turns', () => {
    const { rt, log } = booted();
    rt.boostRate = 2;
    const target = battler(rt);
    action(rt).itemEffectAddBuff(target, addBuff(2, 3));
    assert.deepEqual(log.boostTurns, [6]);
    assert.equal(target._buffTurns[2], 6, 'boosted duration');
    rt.boostRate = 0;
    const returns = runtime();
    returns.Game_Battler.prototype.addBuff = function(paramId, turns) { return `added ${paramId}/${turns}`; };
    returns.Game_Action.prototype.itemEffectAddBuff = function() { return 'effect'; };
    returns.Game_Battler.installBuffRateGate();
    const b = battler(returns);
    assert.equal(b.addBuff(1, 4), 'added 1/4');
    assert.equal(action(returns).itemEffectAddBuff(b, addBuff(1)), 'effect');
});

test('a blocked refresh leaves a capped buff\'s stacks and turns where they were', () => {
    const { rt, log } = booted();
    const target = battler(rt);
    target.addBuff(2, 2);
    target.addBuff(2, 2);
    assert.equal(target.isMaxBuffAffected(2), true);
    target._traits = [block0(2)];
    target.addBuff(2, 8);
    action(rt).itemEffectAddBuff(target, addBuff(2, 8));
    assert.deepEqual([target.buff(2), target._buffTurns[2]], [2, 2], 'no refresh to 8 turns');
    assert.equal(log.sscOnAddBuff, 2, 'only the two accepted applications called back');
    target._traits = [];
    target.addBuff(2, 8);
    assert.deepEqual([target.buff(2), target._buffTurns[2]], [2, 8], 'with the block gone a refresh works again');
});

test('existing buffs stay and expire normally under a 0% Buff Rate', () => {
    const { rt } = booted();
    const target = battler(rt);
    target.addBuff(0, 2);
    target._traits = [block0(0)];
    target.updateBuffTurns();
    target.removeBuffsAuto();
    assert.equal(target.buff(0), 1, 'still there after one turn');
    target.updateBuffTurns();
    target.removeBuffsAuto();
    assert.equal(target.buff(0), 0, 'gone when its turns run out');
    assert.deepEqual(target._result.removedBuffs, [0]);
});

test('blocking addBuff leaves a debuff level alone; debuffs and Remove Buff still work', () => {
    const { rt } = booted({ rolls: [0.5] });
    const target = battler(rt, [block0(3)]);
    action(rt).itemEffectAddDebuff(target, { code: 32, dataId: 3, value1: 4, value2: 0 });
    assert.equal(target.buff(3), -1, 'the debuff landed (one stock roll against Debuff Rate)');
    target.addBuff(3, 4);
    action(rt).itemEffectAddBuff(target, addBuff(3));
    assert.equal(target.buff(3), -1, 'a blocked buff cannot cancel the debuff');
    action(rt).itemEffectRemoveBuff(target, { code: 33, dataId: 3 });
    assert.equal(target.buff(3), -1, 'Remove Buff only removes buffs, as before');
    target.removeBuff(3);
    assert.equal(target.buff(3), 0, 'removeBuff clears the level whatever the trait');
});

test('a blocking state or equipment works while it is on, and stops when it comes off', () => {
    const { rt } = booted();
    const target = battler(rt);
    const buffBlock = [0, 1, 2, 3, 4, 5, 6, 7].map(block0);
    target._traits = buffBlock; // the state is added
    for (let id = 0; id < 8; id++) target.addBuff(id, 3);
    assert.deepEqual(plain(target._buffs), [0, 0, 0, 0, 0, 0, 0, 0], 'eight traits block all eight parameters');
    target._traits = []; // the state is removed
    for (let id = 0; id < 8; id++) target.addBuff(id, 3);
    assert.deepEqual(plain(target._buffs), [1, 1, 1, 1, 1, 1, 1, 1]);
    target.clearBuffs();
    target._traits = buffBlock.slice(0, 7); // one parameter left out
    for (let id = 0; id < 8; id++) target.addBuff(id, 3);
    assert.deepEqual(plain(target._buffs), [0, 0, 0, 0, 0, 0, 0, 1]);
});

test('the pass covers one addBuff of the effect\'s own target and parameter, and nothing else', () => {
    const rt = runtime({ rolls: [0.1, 0.9, 0.9] });
    const ally = battler(rt, [{ code: 15, dataId: 2, value: 0.5 }]);
    const other = battler(rt, [{ code: 15, dataId: 2, value: 0.5 }]);
    // A plugin whose addBuff also buffs a second battler, and the same one twice.
    const stock = rt.Game_Battler.prototype.addBuff;
    let nested = false;
    rt.Game_Battler.prototype.addBuff = function(paramId, turns) {
        stock.call(this, paramId, turns);
        if (!nested && this === ally) {
            nested = true;
            other.addBuff(paramId, turns);
            ally.addBuff(paramId, turns);
        }
    };
    rt.Game_Battler.installBuffRateGate();
    action(rt).itemEffectAddBuff(ally, addBuff(2));
    assert.equal(rt.random.draws, 3, 'the effect rolled once; each nested call rolled for itself');
    assert.deepEqual([ally.buff(2), other.buff(2)], [1, 0], 'the nested calls rolled 0.9 and were refused');
});

test('a nested Add Buff effect gets its own pass and leaves the outer one as it found it', () => {
    const rt = runtime();
    const outerTarget = battler(rt);
    const innerTarget = battler(rt);
    const stock = rt.Game_Action.prototype.itemEffectAddBuff;
    const seen = [];
    rt.Game_Action.prototype.itemEffectAddBuff = function(target, effect) {
        if (target === outerTarget) {
            seen.push(rt.Game_Battler._buffRatePass && rt.Game_Battler._buffRatePass.battler === outerTarget);
            stock.call(this, innerTarget, addBuff(5)); // reacts before buffing its own target
            seen.push(rt.Game_Battler._buffRatePass && rt.Game_Battler._buffRatePass.battler === outerTarget);
        }
        return stock.call(this, target, effect);
    };
    rt.Game_Battler.installBuffRateGate();
    action(rt).itemEffectAddBuff(outerTarget, addBuff(2));
    assert.deepEqual(seen, [true, true], 'the outer pass was still there after the inner effect');
    assert.deepEqual([outerTarget.buff(2), innerTarget.buff(5)], [1, 1]);
    assert.equal(rt.Game_Battler._buffRatePass, null);
});

test('an exception inside the chain cannot leave a pass behind', () => {
    const rt = runtime({ rolls: [0.9] });
    rt.Game_Action.prototype.itemEffectAddBuff = function() { throw new Error('plugin failed'); };
    rt.Game_Battler.installBuffRateGate();
    const target = battler(rt, [{ code: 15, dataId: 2, value: 0.5 }]);
    target._traits = [];
    assert.throws(() => action(rt).itemEffectAddBuff(target, addBuff(2)), /plugin failed/);
    assert.equal(rt.Game_Battler._buffRatePass, null);
    target._traits = [{ code: 15, dataId: 2, value: 0.5 }];
    target.addBuff(2, 3);
    assert.equal(rt.random.draws, 1, 'the next direct addBuff rolled: no stale pass let it through');
    assert.equal(target.buff(2), 0);
});

test('installing twice wraps once', () => {
    const { rt, log } = booted({ rolls: [0.1] });
    assert.equal(rt.Game_Battler.installBuffRateGate(), false);
    assert.equal(rt.Game_Battler.installBuffRateGate(), false);
    const target = battler(rt, [{ code: 15, dataId: 2, value: 0.5 }]);
    action(rt).itemEffectAddBuff(target, addBuff(2));
    assert.equal(rt.random.draws, 1, 'one roll, not one per install');
    assert.equal(log.etpTp, 1);
});

test('every boot path installs the gate once the plugins have loaded', () => {
    assert.match(read('runtime/reactor_scenes.js'),
        /Scene_Boot\.prototype\.start = function\(\) \{\n    Scene_Base\.prototype\.start\.call\(this\);\n[\s\S]{0,300}?Game_Battler\.installBuffRateGate\(\);/);
    // The boots that replace Scene_Boot.start rather than calling it: the
    // start-at-position playtest, the interface preview (which can use an
    // item on the party) and UI capture (which can open Scene_Battle).
    const guarded = /Scene_Base\.prototype\.start\.call\(this\);\n(?:\s*\/\/.*\n)*\s*if \(typeof Game_Battler === "function"\) Game_Battler\.installBuffRateGate\(\);/g;
    for (const [file, paths] of [['runtime/reactor_fight_flow.js', 1], ['runtime/reactor_ui.js', 2]]) {
        const source = read(file);
        assert.equal((source.match(/Scene_Base\.prototype\.start\.call\(this\);/g) || []).length, paths, `${file}: its bypassing boots`);
        assert.equal((source.match(guarded) || []).length, paths, `${file}: every bypassing boot installs the gate`);
    }
});

// ---------------------------------------------------------------- editor

const srcDir = path.join(repoRoot, 'editor', 'src');
const editorSource = (...parts) => fs.readFileSync(path.join(srcDir, ...parts), 'utf8');
globalThis.window = globalThis;
globalThis.rrEscapeHtml = require(path.join(srcDir, 'utils', 'HtmlEscape.js'));
require(path.join(srcDir, 'utils', 'ParamNames.js'));
require(path.join(srcDir, 'database', 'TraitHelp.js'));
const TraitEditor = new Function(`${editorSource('database', 'DatabaseTraitEditor.js')}\nreturn DatabaseTraitEditor;`)();
const CommonUI = new Function(`${editorSource('database', 'DatabaseCommonUI.js')}\nreturn DatabaseCommonUI;`)();
const RowClipboard = new Function(`${editorSource('database', 'DatabaseRowClipboard.js')}\nreturn DatabaseRowClipboard;`)();

function ratesTab(trait) {
    const editor = Object.create(TraitEditor.prototype);
    editor.databaseManager = { getSystem: () => ({ elements: ['', 'Physical'] }), getStates: () => [] };
    const container = { innerHTML: '', querySelectorAll: () => [] };
    editor.createRatesTab(container, trait);
    return container.innerHTML;
}

const buffRow = html => {
    const rows = html.split('<div class="trait-option rr-trait-row"').slice(1);
    return rows.find(row => /value="15"/.test(row));
};

test('the Rates tab has a Buff Rate row right after Debuff Rate, with a parameter picker and a percent', () => {
    const html = ratesTab({ code: 11, dataId: 1, value: 1 });
    const codes = [...html.matchAll(/name="trait-type" value="(\d+)"/g)].map(m => Number(m[1]));
    assert.deepEqual(codes, [11, 12, 15, 13, 14]);
    const row = buffRow(html);
    assert.match(row, /<span class="rr-trait-label">Buff Rate<\/span>/);
    const select = row.match(/<select class="buff-select database-field-value" data-code="15">([\s\S]*?)<\/select>/);
    assert.ok(select, 'a parameter dropdown');
    assert.deepEqual([...select[1].matchAll(/<option value="(\d+)"/g)].map(m => Number(m[1])), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.match(row, /<input type="number" class="rate-value database-field-value" data-code="15" value="100"/, 'a new row starts at 100%');
    assert.match(row, /<span class="rr-trait-unit">%<\/span>/);
});

test('an existing Buff Rate trait opens on its own parameter and percent', () => {
    const row = buffRow(ratesTab({ code: 15, dataId: 2, value: 0 }));
    assert.match(row, /type="radio" name="trait-type" value="15" checked/);
    assert.match(row, /<option value="2" selected>/);
    assert.match(row, /data-code="15" value="0"/);
    assert.match(buffRow(ratesTab({ code: 15, dataId: 6, value: 0.5 })), /data-code="15" value="50"/);
});

test('OK stores { code: 15, dataId: parameter, value: acceptance }', () => {
    const editor = Object.create(TraitEditor.prototype);
    const row = (code, select, number) => ({
        querySelector(selector) {
            if (selector.startsWith('input[type="radio"]')) return { value: String(code) };
            if (selector.startsWith('select')) return { value: String(select) };
            if (selector.startsWith('input[type="number"]')) return { value: String(number) };
            return null;
        }
    });
    assert.deepEqual(editor.readRow(row(15, 2, 0)), { code: 15, dataId: 2, value: 0 });
    assert.deepEqual(editor.readRow(row(15, 7, 50)), { code: 15, dataId: 7, value: 0.5 });
    assert.deepEqual(editor.readRow(row(15, 0, 150)), { code: 15, dataId: 0, value: 1.5 });
});

test('the trait list words Buff Rate as it does Debuff Rate', () => {
    const ui = Object.create(CommonUI.prototype);
    assert.equal(ui.getTraitName(15), 'Buff Rate');
    assert.equal(ui.getTraitValue({ code: 15, dataId: 2, value: 0 }), 'Attack Buff 0%');
    assert.equal(ui.getTraitValue({ code: 15, dataId: 7, value: 0.5 }), 'Luck Buff 50%');
    assert.equal(ui.getTraitValue({ code: 12, dataId: 2, value: 0 }), 'Attack Debuff 0%');
});

test('the row\'s hover help says acceptance, not strength, and that all eight take eight traits', () => {
    const help = globalThis.TraitHelp.rows()[15];
    assert.match(help, /accepted/);
    assert.match(help, /never changes how strong/);
    assert.match(help, /eight traits/);
    assert.deepEqual(globalThis.TraitHelp.rowMethods(15), ['buffRate', 'isBuffAccepted']);
    assert.match(buffRow(ratesTab({ code: 15, dataId: 0, value: 1 })), /data-rr-help="The chance a buff/);
});

test('a Buff Rate row copies and pastes verbatim, within a project and across projects', () => {
    const manager = path => ({ projectPath: path, getSystem: () => ({}), data: {} });
    const row = { code: 15, dataId: 4, value: 0 };
    const payload = RowClipboard.createPayload('trait', row, manager('A'));
    assert.equal(payload.reference, null, 'a parameter id is the same in every project');
    for (const target of ['A', 'B']) {
        assert.deepEqual(RowClipboard.resolvePayload('trait', payload, manager(target)), { row });
    }
});

test('an eight-parameter Buff Block state survives save and reload', () => {
    const state = { id: 9, name: 'Buff Block', traits: [0, 1, 2, 3, 4, 5, 6, 7].map(block0) };
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('Buff Rate and its help are translated in every locale', () => {
    const files = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'];
    const context = { window: {}, console };
    context.globalThis = context;
    vm.runInNewContext(files.map(file => editorSource(file)).join('\n') + '\n;globalThis.__T = RR_TEXT_TRANSLATIONS;', context);
    const locales = ['ar', 'de', 'el', 'es', 'fr', 'id', 'it', 'ja', 'ko', 'pl', 'pt', 'ru', 'th', 'tr', 'vi', 'zh-Hans', 'zh-Hant'];
    const help = globalThis.TraitHelp.rows()[15];
    for (const locale of locales) {
        const table = context.__T[locale];
        assert.ok(table, `${locale} catalog`);
        for (const phrase of ['Buff Rate', help]) {
            assert.ok(typeof table[phrase] === 'string' && table[phrase] && table[phrase] !== phrase,
                `${locale} lacks "${phrase.slice(0, 30)}"`);
        }
        // The trait list's "Attack Buff 0%" (German keeps "Buff").
        assert.ok(typeof table.Buff === 'string' && table.Buff, `${locale} lacks "Buff"`);
    }
});
