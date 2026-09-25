/**
 * RPG Maker 2000/2003 variable arithmetic in imported games.
 *
 * The importer writes System.json rrLegacyVariableLimit; with it, Control
 * Variables works in whole numbers the way the old engine did (EasyRPG's
 * Game_Variables): division truncates toward zero, a division by zero leaves
 * the variable as it was, a remainder by zero is 0, and results clamp to the
 * limit. Deep 8 draws its HP bar from HP * 29 / max HP while max HP is still 0;
 * MZ's arithmetic made that Infinity and the bar drew no frame.
 *
 * The shipped operateVariable, the override and Game_Variables run verbatim.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');

function slice(head, terminator) {
    const start = objects.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${head}`);
    const end = objects.indexOf(terminator, start);
    assert.ok(end > start, `${head} terminates`);
    return objects.slice(start, end + terminator.length);
}

function load(system) {
    const context = { Math, Number, $dataSystem: Object.assign({ variables: new Array(20).fill('') }, system), $gameMap: { requestRefresh() {} } };
    vm.createContext(context);
    vm.runInContext([
        'function Game_Interpreter() {}',
        slice('function Game_Variables() {', '\n}\n'),
        slice('Game_Variables.prototype.initialize = function', '\n};\n'),
        slice('Game_Variables.prototype.clear = function', '\n};\n'),
        slice('Game_Variables.prototype.value = function', '\n};\n'),
        slice('Game_Variables.prototype.setValue = function', '\n};\n'),
        slice('Game_Variables.prototype.onChange = function', '\n};\n'),
        slice('Game_Interpreter.prototype.operateVariable = function(', '\n};\n'),
        slice('    const _operateVariable = Game_Interpreter.prototype.operateVariable;', '\n    };\n'),
        'var $gameVariables = new Game_Variables(); var interpreter = new Game_Interpreter();',
    ].join('\n'), context);
    const run = (start, op, value) => { context.$gameVariables.setValue(1, start); context.interpreter.operateVariable(1, op, value); return context.$gameVariables.value(1); };
    return run;
}

const SET = 0, ADD = 1, SUB = 2, MUL = 3, DIV = 4, MOD = 5;

test('an imported 2003 game divides and takes remainders by zero the old engine way', () => {
    const run = load({ rrLegacyVariableLimit: 9999999 });
    assert.equal(run(29, DIV, 0), 29, 'the variable keeps its value');
    assert.equal(run(29, MOD, 0), 0);
    assert.equal(run(0, DIV, 0), 0);
});

test('division truncates toward zero and the remainder takes the dividend\'s sign', () => {
    const run = load({ rrLegacyVariableLimit: 9999999 });
    assert.equal(run(-7, DIV, 2), -3, 'MZ floors this to -4');
    assert.equal(run(7, DIV, -2), -3);
    assert.equal(run(7, DIV, 2), 3);
    assert.equal(run(-7, MOD, 3), -1);
    assert.equal(run(29, MUL, 1), 29);
    assert.equal(run(3, SUB, 5), -2);
    assert.equal(run(0, SET, 12), 12);
});

test('results clamp to the engine\'s limit: 9,999,999 on 2003, 999,999 on 2000', () => {
    const run2003 = load({ rrLegacyVariableLimit: 9999999 });
    assert.equal(run2003(9999999, ADD, 1), 9999999);
    assert.equal(run2003(-9999999, SUB, 5), -9999999);
    assert.equal(run2003(5000000, MUL, 5000000), 9999999);
    const run2000 = load({ rrLegacyVariableLimit: 999999 });
    assert.equal(run2000(999999, ADD, 1), 999999);
    assert.equal(run2000(0, SET, 5000000), 999999);
});

test('MV and MZ projects keep MZ arithmetic', () => {
    const run = load({});
    assert.equal(run(29, DIV, 0), Infinity);
    assert.equal(run(-7, DIV, 2), -4);
    assert.equal(run(9999999, ADD, 1), 10000000);
});

test('the importer sets the limit by engine', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'legacy', 'LegacyConvert.js'), 'utf8');
    assert.match(source, /out\.rrLegacyVariableLimit = db\.engine === 'RPG Maker 2000' \? 999999 : 9999999;/);
});
