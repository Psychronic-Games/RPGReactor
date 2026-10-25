const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const limitsSource = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'DataLimits.js'), 'utf8');
const objectsSource = runtimeSource('reactor_objects.js');

// The editor previews an actor's stats and EXP curve; the game computes them
// again from the same data. Two implementations, two files — if one is edited
// and the other is not, the editor quietly lies about what the game will do.
const editor = vm.runInNewContext(
    `${limitsSource}\n({ paramAt: rrClassParamAtLevel, expFor: rrExpForLevel });`
);

/** Lifts a Game_Actor method out of the runtime and rebinds it as a plain function. */
function runtimeMethod(name, argumentNames, replacements = []) {
    const at = objectsSource.indexOf(`Game_Actor.prototype.${name} = function(`);
    assert.ok(at >= 0, `${name} is present in the runtime`);
    const end = objectsSource.indexOf('\n};', at);
    assert.ok(end > at, `${name} body is delimited`);
    let body = objectsSource.slice(objectsSource.indexOf('{', at) + 1, end);
    for (const [from, to] of replacements) body = body.split(from).join(to);
    return new Function(...argumentNames, body);
}

const runtimeParamAt = runtimeMethod('classParamAtLevel', ['classData', 'paramId', 'level']);
// expForLevel reads its class through `this`; drop that lookup and take the
// class as an argument so the formula itself is what gets compared.
const runtimeExpFor = runtimeMethod('expForLevel', ['level', 'c'],
    [['const c = this.currentClass();', '']]);

const CURVES = [
    Array.from({ length: 100 }, (_, level) => 10 + level * 5),          // stock linear
    Array.from({ length: 100 }, (_, level) => Math.round(10 * 1.05 ** level)),
    [null, 1, 1],                                                        // truncated table
    [null, 400],                                                         // a single authored level
    [null],                                                              // header only
    [],                                                                  // empty
    Array.from({ length: 100 }, () => 0),                                // all zeroes
    [null, 5, 5, 5, 5, 5]                                                // flat, so slope is 0
];

const LEVELS = [1, 2, 3, 50, 98, 99, 100, 101, 150, 500, 998, 999, 1000, 5000, 9999, 10000, 20000, 0, -5];

test('the editor and the runtime agree on every class parameter lookup', () => {
    const mismatches = [];
    for (const [index, values] of CURVES.entries()) {
        for (const level of LEVELS) {
            const fromEditor = editor.paramAt(values, level);
            const fromRuntime = runtimeParamAt({ params: [values] }, 0, level);
            if (!Object.is(fromEditor, fromRuntime)) {
                mismatches.push(`curve ${index} level ${level}: editor ${fromEditor} vs runtime ${fromRuntime}`);
            }
        }
    }
    assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

test('the editor and the runtime agree on the EXP curve', () => {
    const mismatches = [];
    const paramSets = [[30, 20, 30, 30], [50, 0, 10, 40], [100, 100, 100, 100], [30, 20, 30, 1]];
    for (const expParams of paramSets) {
        for (const level of [1, 2, 10, 99, 100, 500, 999, 5000, 9999]) {
            const fromEditor = editor.expFor(expParams, level);
            const fromRuntime = runtimeExpFor(level, { expParams });
            if (!Object.is(fromEditor, fromRuntime)) {
                mismatches.push(`${JSON.stringify(expParams)} level ${level}: editor ${fromEditor} vs runtime ${fromRuntime}`);
            }
        }
    }
    assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

test('levels past the authored table extrapolate rather than reading undefined', () => {
    // Reactor raises the level ceiling to 9999 while authored params tables stay
    // 100 entries long, so the stock `params[paramId][level]` lookup would hand
    // both sides undefined. Both extrapolate from the last two authored levels.
    const linear = Array.from({ length: 100 }, (_, level) => 10 + level * 5);
    assert.equal(editor.paramAt(linear, 99), 505, 'the last authored level is exact');
    assert.equal(editor.paramAt(linear, 150), 760, 'and level 150 continues the slope');
    assert.equal(editor.paramAt(linear, 150), runtimeParamAt({ params: [linear] }, 0, 150));
    assert.ok(Number.isFinite(editor.paramAt(linear, 999)));
});

test('a degenerate table yields a number, never NaN', () => {
    for (const values of [[], [null], [null, 7], undefined, null]) {
        for (const level of [1, 99, 999]) {
            const result = editor.paramAt(values, level);
            assert.ok(Number.isFinite(result), `${JSON.stringify(values)} at ${level} gave ${result}`);
        }
    }
});

test('the level ceiling is shared rather than restated', () => {
    const limits = vm.runInNewContext(`${limitsSource}\nRR_LIMITS;`);
    assert.equal(limits.ACTOR_LEVEL, 9999);
    assert.match(objectsSource, /Math\.min\(9999, Math\.floor\(Number\(level\) \|\| 1\)\)/,
        'the runtime clamps to the same ceiling');
});
