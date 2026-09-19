const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseEffectEditor.js'), 'utf8');

/** One `X = function(...) {...};` block out of the runtime, by its opening line. */
function block(marker) {
    const start = objects.indexOf(marker);
    assert.notEqual(start, -1, `runtime is missing: ${marker}`);
    return objects.slice(start, objects.indexOf('\n};\n', start) + 4);
}

function runtime() {
    const context = { Game_Action: function() {}, Game_BattlerBase: function() {}, Math, Number, Array };
    const source = [
        'Game_BattlerBase.BUFF_RATE_PER_STACK = 0.25;',
        block('Game_Action.effectBuffRate = function'),
        block('Game_BattlerBase.prototype.buffPotencyList = function'),
        block('Game_BattlerBase.prototype.setPendingBuffPotency = function'),
        block('Game_BattlerBase.prototype.shiftBuffPotency = function'),
        block('Game_BattlerBase.buffRateFromStacks = function'),
        block('Game_BattlerBase.prototype.increaseBuff = function'),
        block('Game_BattlerBase.prototype.decreaseBuff = function'),
        block('Game_BattlerBase.prototype.paramBuffRate = function')
    ].join('\n');
    vm.runInNewContext(source, context);
    return context;
}

/** A battler with empty stacks, and the caps SkillsStatesCore-free Reactor uses. */
function battler(context, maxBuff = 2, maxDebuff = 2) {
    const b = new context.Game_BattlerBase();
    b._buffs = [0, 0, 0, 0, 0, 0, 0, 0];
    b._buffPotency = [[], [], [], [], [], [], [], []];
    b.isMaxBuffAffected = id => b._buffs[id] === maxBuff;
    b.isMaxDebuffAffected = id => b._buffs[id] === -maxDebuff;
    return b;
}

test('an Add Buff or Add Debuff effect can name the strength of each stack it adds', () => {
    const { Game_Action } = runtime();
    assert.equal(Game_Action.effectBuffRate({ code: 31, value2: 0 }), null, 'RPG Maker-authored effects keep the standard rate');
    assert.equal(Game_Action.effectBuffRate({ code: 31 }), null, 'so does an effect with no value2 at all');
    assert.equal(Game_Action.effectBuffRate({ code: 31, value2: 0.4 }), 0.4);
    assert.equal(Game_Action.effectBuffRate({ code: 32, value2: 0.4 }), 0.4, 'Add Debuff stores the same magnitude');
    assert.equal(Game_Action.effectBuffRate({ code: 32, value2: -0.4 }), 0.4, 'a signed value is read as its magnitude');
});

test('stacks add up, each contributing its own strength', () => {
    const { Game_BattlerBase } = runtime();
    const rate = (level, list) => Game_BattlerBase.buffRateFromStacks(level, list, 0.25);
    assert.equal(rate(0, []), 1, 'no stacks, no change');
    assert.equal(rate(2, [null, null]), 1.5, 'two standard stacks are the stock 25% each');
    assert.equal(rate(3, [0.4, null, 0.4]), 2.05, '40 + 25 + 40');
    assert.equal(rate(-3, [0.3, 0.3, 0.3]), 0.1, 'debuff stacks subtract');
    assert.equal(rate(-2, [null, null]), 0.5, 'and standard debuff stacks match stock');
});

test('a rate can never go below zero, however many debuff stacks pile up', () => {
    const { Game_BattlerBase } = runtime();
    assert.equal(Game_BattlerBase.buffRateFromStacks(-3, [0.5, 0.5, 0.5], 0.25), 0);
    assert.equal(Game_BattlerBase.buffRateFromStacks(-5, null, 0.25), 0, 'the fallback clamps too');
});

test('a strength list out of step with the stack count is ignored, not trusted', () => {
    const { Game_BattlerBase } = runtime();
    const rate = (level, list) => Game_BattlerBase.buffRateFromStacks(level, list, 0.25);
    assert.equal(rate(2, null), 1.5, 'a save written before strengths existed');
    assert.equal(rate(2, undefined), 1.5);
    assert.equal(rate(3, [0.4]), 1.75, 'a plugin that moved _buffs itself');
    assert.equal(rate(1, [0.4, 0.4]), 1.25, 'too many entries is just as wrong');
});

test('a stack gained takes the pending strength; a stack lost gives up the most recent', () => {
    const context = runtime();
    const b = battler(context, 5, 3);

    b.setPendingBuffPotency(0.4);
    b.increaseBuff(2);
    b.setPendingBuffPotency(null);
    b.increaseBuff(2);
    b.setPendingBuffPotency(0.4);
    b.increaseBuff(2);
    b.setPendingBuffPotency(null);
    assert.deepEqual(Array.from(b._buffPotency[2]), [0.4, null, 0.4]);
    assert.equal(b.paramBuffRate(2), 2.05);

    b.decreaseBuff(2);
    assert.deepEqual(Array.from(b._buffPotency[2]), [0.4, null], 'the newest stack is the one that leaves');
    assert.equal(b.paramBuffRate(2), 1.65);
});

test('the strengths empty out as the count crosses zero, so a stack is never both', () => {
    const context = runtime();
    const b = battler(context, 5, 3);
    b.setPendingBuffPotency(0.5);
    b.increaseBuff(4);
    assert.deepEqual([b._buffs[4], Array.from(b._buffPotency[4])], [1, [0.5]]);
    b.setPendingBuffPotency(0.1);
    b.decreaseBuff(4);
    assert.deepEqual([b._buffs[4], Array.from(b._buffPotency[4])], [0, []], 'the buff is spent, not turned into a debuff');
    b.decreaseBuff(4);
    assert.deepEqual([b._buffs[4], Array.from(b._buffPotency[4])], [-1, [0.1]], 'and only then does a debuff stack start');
    assert.equal(b.paramBuffRate(4), 0.9);
});

test('a stack refused at the cap records no strength', () => {
    const context = runtime();
    const b = battler(context, 2, 2);
    for (const rate of [0.4, 0.4, 0.4]) {
        b.setPendingBuffPotency(rate);
        b.increaseBuff(2);
    }
    assert.equal(b._buffs[2], 2, 'the cap holds');
    assert.deepEqual(Array.from(b._buffPotency[2]), [0.4, 0.4], 'and the third strength was never taken');
});

test('a battler loaded from a save without strengths still answers', () => {
    const context = runtime();
    const b = new context.Game_BattlerBase();
    b._buffs = [0, 0, 2, 0, 0, 0, 0, 0];
    assert.equal(b.paramBuffRate(2), 1.5, 'the stock rate for two stacks');
    assert.deepEqual(Array.from(b.buffPotencyList(2)), [], 'and the list is built on demand');
});

function loadEditor() {
    const context = {
        window: {},
        rrEscapeHtml: v => String(v),
        rrParamNames: () => ['MaxHP', 'MaxMP', 'ATK', 'DEF', 'MAT', 'MDF', 'AGI', 'LUK']
    };
    vm.runInNewContext(`${editorSource}\nglobalThis.DatabaseEffectEditor = DatabaseEffectEditor;`, context);
    const editor = new context.DatabaseEffectEditor({}, null);
    editor.setupEffectRadioInputs = () => {};
    editor.setupBuffStrengthInputs = () => {};
    return editor;
}

test('the Buff tab renders one Strength row beside the two Add rows', () => {
    const editor = loadEditor();
    const container = { innerHTML: '' };

    editor.createBuffTab(container, { code: 31, dataId: 2, value1: 5, value2: 0 });
    assert.equal((container.innerHTML.match(/class="effect-option/g) || []).length, 4, 'four effect rows');
    assert.equal((container.innerHTML.match(/class="effect-buff-strength /g) || []).length, 1, 'one strength row for both');
    let row = /<div class="effect-buff-strength[\s\S]*?<\/div>/.exec(container.innerHTML)[0];
    assert.doesNotMatch(row, /override"[^>]*checked/, 'unticked by default');
    assert.match(row, /value="25"/, 'and showing the standard rate');
    assert.match(row, /effect-buff-strength-value[^>]*disabled/, 'greyed until it is ticked');

    editor.createBuffTab(container, { code: 32, dataId: 2, value1: 5, value2: 0.4 });
    row = /<div class="effect-buff-strength[\s\S]*?<\/div>/.exec(container.innerHTML)[0];
    assert.match(row, /override"[^>]*checked/, 'Add Debuff uses the same row');
    assert.match(row, /value="40"/, 'as a percent');
    assert.doesNotMatch(row, /effect-buff-strength-value[^>]*disabled/);

    editor.createBuffTab(container, { code: 33, dataId: 2, value1: 0, value2: 0 });
    row = /<div class="effect-buff-strength[\s\S]*?<\/div>/.exec(container.innerHTML)[0];
    assert.match(row, /override"[^>]*disabled/, 'Remove Buff has no strength to set');
});

test('the Strength row round-trips through value2, and 0 stays out of reach', () => {
    const editor = loadEditor();
    const fields = { override: { checked: true, disabled: false }, value: { value: '40' } };
    const container = { querySelector: sel => sel === '.effect-buff-strength' ? {
        querySelector: q => q.includes('override') ? fields.override : fields.value
    } : null };

    const effect = { code: 31, dataId: 2, value1: 5, value2: 0 };
    editor._readBuffStrength(container, effect);
    assert.equal(effect.value2, 0.4);

    fields.value.value = '0';
    editor._readBuffStrength(container, effect);
    assert.equal(effect.value2, 0.01, '0 already means "standard", so the box floors at 1%');

    fields.override.checked = false;
    editor._readBuffStrength(container, effect);
    assert.equal(effect.value2, 0, 'unticked: back to the RPG Maker shape');

    fields.override.checked = true;
    fields.value.value = '40';
    effect.code = 33;
    editor._readBuffStrength(container, effect);
    assert.equal(effect.value2, 0, 'Remove Buff never carries a strength');
});

test('the effect summary names the strength only when one is set', () => {
    const editor = loadEditor();
    const value = effect => editor.constructor.getEffectValue(effect, null);
    assert.equal(value({ code: 31, dataId: 2, value1: 5, value2: 0 }), 'ATK (5 turns)');
    assert.equal(value({ code: 31, dataId: 2, value1: 5, value2: 0.4 }), 'ATK (5 turns, 40%)');
    assert.equal(value({ code: 32, dataId: 3, value1: 3, value2: 0.15 }), 'DEF (3 turns, 15%)');
    assert.equal(value({ code: 33, dataId: 2, value1: 0, value2: 0 }), 'ATK', 'Remove Buff is unchanged');
});

test('the editor reports the same standard rate the runtime applies', () => {
    const { Game_BattlerBase } = runtime();
    const editor = loadEditor();
    assert.equal(
        editor.constructor.STANDARD_BUFF_PERCENT / 100,
        Game_BattlerBase.BUFF_RATE_PER_STACK,
        'the greyed box must not lie about what an unticked row does'
    );
});
