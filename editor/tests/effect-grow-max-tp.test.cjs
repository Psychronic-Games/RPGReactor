const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseEffectEditor.js'), 'utf8');

function slice(startMarker, endAfter) {
    const start = objects.indexOf(startMarker);
    const end = objects.indexOf('\n};\n', objects.indexOf(endAfter, start)) + 4;
    assert.ok(start >= 0 && end > start, `${startMarker} is locatable`);
    return objects.slice(start, end);
}

function runtime(rolls) {
    const context = {
        Game_Action: function() {}, Game_BattlerBase: function() {}, Game_Interpreter: function() {},
        Math: Object.assign(Object.create(Math), { randomInt: max => rolls.shift() % max }), Number,
        $gameVariables: { value: id => 1000 + id }
    };
    vm.runInNewContext(slice('Game_Action.effectGrowValue = function', 'Game_Action.effectGrowValue = function'), context);
    vm.runInNewContext(slice('Game_BattlerBase.prototype.clearParamPlus = function', 'Game_BattlerBase.prototype.clearParamPlus = function'), context);
    vm.runInNewContext(slice('Game_BattlerBase.PARAM_MAX_TP = 8;', 'Game_BattlerBase.PARAM_MAX_TP = 8;').replace('Game_BattlerBase.PARAM_MAX_TP = 8;', '').split('\n};\n')[0] + '\n};\n', context);
    context.Game_BattlerBase.PARAM_MAX_TP = 8;
    vm.runInNewContext(slice('Game_BattlerBase.prototype.addParam = function', 'Game_BattlerBase.prototype.addParam = function'), context);
    vm.runInNewContext(slice('Game_BattlerBase.prototype.maxTp = function', 'Game_BattlerBase.prototype.maxTp = function'), context);
    vm.runInNewContext(slice('Game_Interpreter.prototype.operateValue = function', 'Game_Interpreter.prototype.operateValue = function'), context);
    return context;
}

test('Grow draws a whole number between value1 and value2 when value2 is set (GitHub #15)', () => {
    const { Game_Action } = runtime([0, 5, 3]);
    assert.equal(Game_Action.effectGrowValue({ value1: 4, value2: 0 }), 4, 'RPG Maker-authored: fixed');
    assert.equal(Game_Action.effectGrowValue({ value1: 3, value2: 8 }), 3 + 0, 'ranged');
    assert.equal(Game_Action.effectGrowValue({ value1: 8, value2: 3 }), 3 + 5, 'either order');
});

test('Max TP grows in its own field, never a ninth params entry', () => {
    const { Game_BattlerBase } = runtime([]);
    const battler = new Game_BattlerBase();
    battler.refresh = () => {};
    battler.clearParamPlus();
    battler.addParam(8, 25);
    battler.addParam(2, 3);
    assert.equal(battler._paramPlus.length, 8);
    assert.equal(battler._paramPlus[2], 3);
    assert.equal(battler._maxTpPlus, 25);
    assert.equal(battler.maxTp(), 125);
    const old = new Game_BattlerBase();
    assert.equal(old.maxTp(), 100, 'a save without the field still reads 100');
});

test('Change Parameter gets a Random operand rolled once per command', () => {
    const { Game_Interpreter } = runtime([4]);
    const interpreter = new Game_Interpreter();
    assert.equal(interpreter.operateValue(0, 0, 7), 7);
    assert.equal(interpreter.operateValue(1, 1, 3), -1003, 'variables still resolve');
    assert.equal(interpreter.operateValue(0, 2, 10, 20), 14, 'random between the ends');
    assert.match(objects, /this\.operateValue\(params\[3\], params\[4\], params\[5\], params\[6\]\)/, 'command 317 passes the upper end');
});

function loadEditor() {
    const context = { window: {}, rrEscapeHtml: v => String(v) };
    vm.runInNewContext(`${editorSource}\nglobalThis.DatabaseEffectEditor = DatabaseEffectEditor;`, context);
    return new context.DatabaseEffectEditor({ getSkills: () => [], getCommonEvents: () => [], getStates: () => [] }, null);
}

test('the Special tab offers Max TP to Grow only, with a Random range row; the Buff tab stays at eight', () => {
    const editor = loadEditor();
    editor.setupEffectRadioInputs = () => {};
    editor.setupGrowRangeInputs = () => {};
    const special = { innerHTML: '' };
    editor.createSpecialTab(special, { code: 42, dataId: 8, value1: 5, value2: 0 });
    const grow = /<select[^>]+data-code="42"[^>]*>([\s\S]*?)<\/select>/.exec(special.innerHTML)[1];
    assert.equal((grow.match(/<option/g) || []).length, 9);
    assert.match(grow, /value="8" selected>Max TP/);
    assert.match(special.innerHTML, /effect-grow-range/);
    const buff = { innerHTML: '' };
    editor.createBuffTab(buff, { code: 31, dataId: 0, value1: 2, value2: 0 });
    const buffSel = /<select[^>]+data-code="31"[^>]*>([\s\S]*?)<\/select>/.exec(buff.innerHTML)[1];
    assert.equal((buffSel.match(/<option/g) || []).length, 8, '_buffs has eight slots');
});

test('the Grow summary shows the sign and the range', () => {
    const editor = loadEditor();
    const describe = effect => editor.constructor.getEffectValue(effect, null);
    assert.equal(describe({ code: 42, dataId: 8, value1: 3, value2: 0 }), 'Max TP +3');
    assert.equal(describe({ code: 42, dataId: 2, value1: -5, value2: 0 }), 'Attack -5', 'no more "+-5"');
    assert.equal(describe({ code: 42, dataId: 0, value1: 3, value2: 8 }), 'Max HP +3–8');
});

test('the Change Parameter dialog and command list know Max TP and Random', () => {
    const dialog = fs.readFileSync(path.join(__dirname, '..', 'src', 'event', 'commands', 'ChangeParameterEditor.js'), 'utf8');
    assert.match(dialog, /\{ value: 8, label: 'Max TP' \}/);
    assert.match(dialog, /this\.operandType === 2\n\s+\? \[this\.actorSelect, this\.actorId, this\.paramType, this\.operation, this\.operandType, this\.operand, this\.operandMax\]/, 'the seventh slot only for Random');
    const list = fs.readFileSync(path.join(__dirname, '..', 'src', 'event', 'EventCommandList.js'), 'utf8');
    assert.match(list, /'Agility', 'Luck', 'Max TP'\];\n\s+const pName = tt\(paramNames\[params\[2\]\]/);
    assert.match(list, /params\[4\] === 2/);
});
