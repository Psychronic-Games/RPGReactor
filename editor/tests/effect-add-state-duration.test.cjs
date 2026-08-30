const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const objects = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_objects.js'), 'utf8');
const editorSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseEffectEditor.js'), 'utf8');

function runtimeHelpers(rolls) {
    const start = objects.indexOf('Game_Action.effectStateTurns = function');
    const end = objects.indexOf('\n};\n', objects.indexOf('Game_Action.prototype.applyEffectStateTurns', start)) + 4;
    const context = { Game_Action: function() {}, Math: Object.assign(Object.create(Math), { randomInt: max => rolls.shift() % max }), Number };
    vm.runInNewContext(objects.slice(start, end), context);
    const setStart = objects.indexOf('Game_BattlerBase.prototype.setStateTurns = function');
    const setEnd = objects.indexOf('\n};\n', setStart) + 4;
    context.Game_BattlerBase = function() {};
    vm.runInNewContext(objects.slice(setStart, setEnd), context);
    return context;
}

test('an Add State effect can override the state duration, fixed or as a range (GitHub #16)', () => {
    const { Game_Action } = runtimeHelpers([0, 5, 2]);
    assert.equal(Game_Action.effectStateTurns({ code: 21, value2: 0 }), 0, 'RPG Maker-authored effects keep the state default');
    assert.equal(Game_Action.effectStateTurns({ code: 21, value2: 3 }), 3, 'a fixed override');
    assert.equal(Game_Action.effectStateTurns({ code: 21, value2: 3, value3: 6 }), 3 + 5 % 4, 'a range rolls min..max');
    assert.equal(Game_Action.effectStateTurns({ code: 21, value2: 3, value3: 1 }), 3, 'an upper end below the lower is the lower');
});

test('setStateTurns only touches a state the battler has, and the action applies it after addState', () => {
    const { Game_Action, Game_BattlerBase } = runtimeHelpers([0]);
    const battler = Object.assign(new Game_BattlerBase(), { _stateTurns: { 4: 2 }, isStateAffected: id => id === 4 });
    battler.setStateTurns(4, 7);
    battler.setStateTurns(9, 7);
    assert.deepEqual(Object.assign({}, battler._stateTurns), { 4: 7 });
    const action = new Game_Action();
    action.applyEffectStateTurns(battler, 4, { code: 21, value2: 0 });
    assert.equal(battler._stateTurns[4], 7, 'no override, no change');
    action.applyEffectStateTurns(battler, 4, { code: 21, value2: 1 });
    assert.equal(battler._stateTurns[4], 1);
    assert.match(objects, /target\.addState\(effect\.dataId\);\n\s+this\.applyEffectStateTurns\(target, effect\.dataId, effect\);/, 'normal states');
    assert.match(objects, /target\.addState\(stateId\);\n\s+this\.applyEffectStateTurns\(target, stateId, effect\);/, 'attack states too');
});

function loadEditor(states) {
    const context = { window: {}, rrEscapeHtml: v => String(v) };
    vm.runInNewContext(`${editorSource}\nglobalThis.DatabaseEffectEditor = DatabaseEffectEditor;`, context);
    return new context.DatabaseEffectEditor({
        getStates: () => states,
        getState: id => states.find(s => s && s.id === id) || null
    }, null);
}

test('the State tab renders the duration row beside the Add State row, not inside it', () => {
    const states = [null, { id: 1, name: 'Poison', minTurns: 3, maxTurns: 5, autoRemovalTiming: 2 }, { id: 2, name: 'Knockout', minTurns: 1, maxTurns: 1, autoRemovalTiming: 0 }];
    const editor = loadEditor(states);
    editor.setupEffectRadioInputs = () => {};
    editor.setupDurationInputs = () => {};
    const container = { innerHTML: '' };
    editor.createStateTab(container, { code: 21, dataId: 1, value1: 1, value2: 0 });
    const html = container.innerHTML;
    assert.equal((html.match(/class="effect-option/g) || []).length, 2, 'two effect rows');
    const row = /<div class="effect-duration[\s\S]*?<\/div>/.exec(html)[0];
    assert.match(row, /value="3"[\s\S]*value="5"/, 'unticked, the boxes show the state\'s own turns');
    assert.match(row, /effect-duration-min[^>]*disabled/, 'and are greyed');
    editor.createStateTab(container, { code: 21, dataId: 1, value1: 1, value2: 2, value3: 6 });
    assert.match(container.innerHTML, /effect-duration-override"[^>]*checked/);
    assert.match(container.innerHTML, /value="2"[\s\S]*value="6"/);
    editor.createStateTab(container, { code: 21, dataId: 2, value1: 1, value2: 0 });
    assert.match(container.innerHTML, /effect-duration-override"[^>]*disabled/, 'a state that never auto-removes cannot be overridden');
    assert.match(container.innerHTML, /Not removed automatically/);
});

test('the summary names the override, and value3 is written only for a range', () => {
    const editor = loadEditor([null, { id: 1, name: 'Poison', minTurns: 3, maxTurns: 5, autoRemovalTiming: 2 }]);
    const tt = t => t;
    const summary = editor.constructor.durationSummary;
    assert.equal(summary({ code: 21, value2: 0 }, tt), '');
    assert.equal(summary({ code: 21, value2: 3 }, tt), ', 3 turns');
    assert.equal(summary({ code: 21, value2: 3, value3: 6 }, tt), ', 3–6 turns');
    assert.equal(summary({ code: 22, value2: 3 }, tt), '', 'Remove State has no duration');
    const fields = { override: { checked: true, disabled: false }, min: { value: '4' }, max: { value: '4' } };
    const container = { querySelector: sel => sel === '.effect-duration' ? {
        querySelector: q => q.includes('override') ? fields.override : q.includes('min') ? fields.min : fields.max
    } : null };
    const effect = { code: 21, dataId: 1, value1: 1, value2: 0, value3: 9 };
    editor._readDuration(container, effect);
    assert.equal(effect.value2, 4);
    assert.equal('value3' in effect, false, 'equal ends: no value3 key');
    fields.max.value = '8';
    editor._readDuration(container, effect);
    assert.deepEqual([effect.value2, effect.value3], [4, 8]);
    fields.override.checked = false;
    editor._readDuration(container, effect);
    assert.deepEqual([effect.value2, 'value3' in effect], [0, false], 'unticked: back to the RPG Maker shape');
});
