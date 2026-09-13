/**
 * Repeats as a range.
 *
 * A skill or item stores its fewest hits in `repeats` and, only while the
 * count is a range, its most in `repeatsMax`. These tests evaluate the shipped
 * runtime methods and the shipped editor module verbatim, so the stored shape
 * and the roll that reads it cannot drift apart.
 *
 * They pin the two things that make a range safe to add underneath numRepeats:
 * a fixed count reads exactly as it did before, and a range is rolled once per
 * action - numRepeats is read many times for one action, and every read has to
 * agree.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

/** Pull one shipped `<head> ... };` definition verbatim. */
function definition(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, `runtime defines ${head}`);
    const end = source.indexOf('\n};\n', start);
    assert.ok(end > start, `${head} terminates`);
    return source.slice(start, end + 4);
}

// --- runtime harness ------------------------------------------------------

/**
 * Game_Action's clear, numRepeats and itemRepeats, plus the engine's own
 * Math.randomInt, all verbatim. `rolls` feeds Math.random; `randomCalls`
 * counts how often it was consulted.
 */
function loadRuntime() {
    const objects = read('runtime/reactor_objects.js');
    const core = read('runtime/reactor_core.js');
    const engineMath = Object.create(Math);
    const state = { rolls: [], randomCalls: 0 };
    engineMath.random = () => {
        state.randomCalls++;
        return state.rolls.length ? state.rolls.shift() : 0;
    };
    const context = {
        Math: engineMath,
        Game_Item: function () { this._dataClass = ''; this._itemId = 0; },
        Game_Action: function () {},
        console
    };
    vm.runInNewContext([
        definition(core, 'Math.randomInt = function('),
        definition(objects, 'Game_Action.prototype.clear = function('),
        definition(objects, 'Game_Action.prototype.numRepeats = function('),
        definition(objects, 'Game_Action.prototype.itemRepeats = function(')
    ].join('\n'), context);

    function makeAction({ attack = false, timesAdd = 0 } = {}) {
        const action = new context.Game_Action();
        action.clear();
        action.use = (record, dataClass = 'skill') => {
            action._data = record;
            action._item._dataClass = dataClass;
            action._item._itemId = record.id;
        };
        action.item = () => action._data;
        action.isAttack = () => attack;
        action.subject = () => ({ attackTimesAdd: () => timesAdd });
        return action;
    }
    return { state, makeAction };
}

test('a fixed Repeats count reads exactly as it did before ranges existed, and never rolls', () => {
    const { state, makeAction } = loadRuntime();
    const cases = [
        [{ id: 1, repeats: 3 }, 3],
        [{ id: 1, repeats: 3, repeatsMax: 3 }, 3],
        [{ id: 1, repeats: 3, repeatsMax: 2 }, 3],
        [{ id: 1, repeats: 0 }, 1],
        [{ id: 1, repeats: 250 }, 100],
        [{ id: 1, repeats: 250, repeatsMax: 400 }, 100]
    ];
    for (const [record, expected] of cases) {
        const action = makeAction();
        action.use(record);
        assert.equal(action.numRepeats(), expected, JSON.stringify(record));
    }
    assert.equal(state.randomCalls, 0, 'no fixed count consults Math.random');
});

test('a range is rolled once per action, and every later read agrees', () => {
    const { state, makeAction } = loadRuntime();
    const action = makeAction();
    action.use({ id: 1, repeats: 2, repeatsMax: 4 });
    state.rolls = [0.5];
    assert.equal(action.numRepeats(), 3);
    state.rolls = [0.99, 0.99, 0.99];
    for (let i = 0; i < 5; i++) assert.equal(action.numRepeats(), 3, `read ${i + 2}`);
    assert.equal(state.randomCalls, 1);
});

test('every count in the range is reachable, and nothing outside it', () => {
    const { state, makeAction } = loadRuntime();
    const seen = [];
    for (const roll of [0, 0.34, 0.67, 0.999999]) {
        const action = makeAction();
        action.use({ id: 1, repeats: 2, repeatsMax: 4 });
        state.rolls = [roll];
        seen.push(action.numRepeats());
    }
    assert.deepEqual(seen, [2, 3, 4, 4]);
});

test('a different skill or item on the same action rolls again; clear() does too', () => {
    const { state, makeAction } = loadRuntime();
    const action = makeAction();
    const slash = { id: 1, repeats: 2, repeatsMax: 4 };
    const flurry = { id: 2, repeats: 5, repeatsMax: 6 };

    action.use(slash);
    state.rolls = [0];
    assert.equal(action.numRepeats(), 2);

    action.use(flurry);
    state.rolls = [0.9];
    assert.equal(action.numRepeats(), 6, 'a new skill rolls its own range');

    action.use(slash);
    state.rolls = [0.9];
    assert.equal(action.numRepeats(), 4, 'returning to the first skill rolls again');

    action.use(slash, 'item');
    state.rolls = [0];
    assert.equal(action.numRepeats(), 2, 'an item sharing a skill id is a different item');

    action.clear();
    assert.equal(action._repeatsRoll, null);
    action.use(slash, 'item');
    state.rolls = [0.5];
    assert.equal(action.numRepeats(), 3);
    assert.equal(state.randomCalls, 5);
});

test('Attack Times+ and the 100 cap apply on top of the roll', () => {
    const { state, makeAction } = loadRuntime();
    const attack = makeAction({ attack: true, timesAdd: 2 });
    attack.use({ id: 1, repeats: 1, repeatsMax: 3 });
    state.rolls = [0];
    assert.equal(attack.numRepeats(), 3, 'rolled 1, plus two');

    const capped = makeAction({ attack: true, timesAdd: 5 });
    capped.use({ id: 1, repeats: 90, repeatsMax: 500 });
    state.rolls = [0.999999];
    assert.equal(capped.numRepeats(), 100);
    assert.equal(capped._repeatsRoll.value, 100, 'the maximum itself is capped before rolling');
});

test('the kept roll is plain data, so an action serialised into a save carries it', () => {
    const { state, makeAction } = loadRuntime();
    const action = makeAction();
    action.use({ id: 7, repeats: 2, repeatsMax: 4 });
    state.rolls = [0.5];
    action.numRepeats();
    assert.deepEqual(JSON.parse(JSON.stringify(action._repeatsRoll)), { key: 'skill:7', value: 3 });
});

test('using an item from the menu reads the count once, not once per hit', () => {
    let reads = 0;
    const applied = [];
    const context = {
        Scene_ItemBase: function () {},
        Game_Action: function () {
            this.setItemObject = () => {};
            this.numRepeats = () => { reads++; return 3; };
            this.apply = target => applied.push(target);
            this.applyGlobal = () => {};
        },
        console
    };
    vm.runInNewContext(definition(read('runtime/reactor_scenes.js'), 'Scene_ItemBase.prototype.applyItem = function('), context);
    const scene = Object.create(context.Scene_ItemBase.prototype);
    scene.user = () => ({});
    scene.item = () => ({});
    scene.itemTargetActors = () => ['a', 'b'];
    scene.applyItem();
    assert.equal(reads, 1);
    assert.deepEqual(applied, ['a', 'a', 'a', 'b', 'b', 'b']);
});

// --- editor ---------------------------------------------------------------

function loadActionRepeats() {
    const context = { window: {}, console, rrEscapeHtml: value => String(value) };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/ActionRepeats.js') + '\n;globalThis.__ActionRepeats = ActionRepeats;', context);
    return context.__ActionRepeats;
}

test('ActionRepeats stores repeatsMax only while the count is a range', () => {
    const ActionRepeats = loadActionRepeats();
    const skill = { id: 1, repeats: 2 };

    assert.equal(ActionRepeats.write(skill, 'repeatsMax', '4'), 4);
    assert.equal(skill.repeatsMax, 4);

    assert.equal(ActionRepeats.write(skill, 'repeatsMax', '2'), 2, 'equal to Repeats is a fixed count');
    assert.equal('repeatsMax' in skill, false);

    assert.equal(ActionRepeats.write(skill, 'repeatsMax', '1'), 2, 'below Repeats shows Repeats');
    assert.equal('repeatsMax' in skill, false);

    assert.equal(ActionRepeats.write(skill, 'repeatsMax', '999'), 100);
    assert.equal(skill.repeatsMax, 100);

    assert.equal(ActionRepeats.write(skill, 'repeats', '50'), 50);
    assert.equal(skill.repeatsMax, 100, 'raising Repeats inside the range keeps it');

    assert.equal(ActionRepeats.write(skill, 'repeats', '100'), 100);
    assert.equal('repeatsMax' in skill, false, 'reaching the maximum collapses the range');

    assert.equal(ActionRepeats.write(skill, 'repeats', ''), 1);
    assert.equal(ActionRepeats.write(skill, 'repeats', '0'), 1);

    const legacy = { id: 2, repeats: 3 };
    assert.equal(ActionRepeats.min(legacy), 3);
    assert.equal(ActionRepeats.max(legacy), 3, 'a record authored before ranges shows the same number twice');
});

test('Repeats keeps its cell, Max Repeats gets a row of its own, and a change refreshes both', () => {
    const ActionRepeats = loadActionRepeats();
    const record = { id: 7, repeats: 2, repeatsMax: 5 };
    assert.match(ActionRepeats.minFieldHTML(record, 'data-skill-id'), /^<input type="number" class="database-field-value" value="2" min="1" max="100" data-field="repeats" data-skill-id="7">$/);

    const right = ActionRepeats.maxRowHTML(record, 'data-skill-id', true);
    assert.match(right, /^<div class="db-row-pair">/, 'a pair row, so it takes the same columns as every other field');
    assert.match(right, /<label class="db-pair-right" title="[^"]+">Max Repeats<\/label>/);
    assert.match(right, /value="5" min="1" max="100" data-field="repeatsMax" data-skill-id="7"/);
    assert.doesNotMatch(ActionRepeats.maxRowHTML(record, 'data-item-id'), /db-pair-right/, 'left-hand by default');

    const css = read('editor/css/styles.css');
    assert.match(css, /\.db-form > \.db-row-pair > \.db-pair-right \{\s*grid-column: 3;/, 'right-hand placement in the four-column form');
    const narrow = css.slice(css.indexOf('@container database-detail (max-width: 760px)'));
    assert.match(narrow, /\.db-form > \.db-row-pair > \.db-pair-right \{\s*grid-column: auto;/, 'and released where the form collapses to one column');

    const fields = { repeats: { value: '' }, repeatsMax: { value: '' } };
    const container = {
        querySelector(selector) {
            assert.match(selector, /\[data-item-id="3"\]$/);
            return fields[selector.match(/data-field="(\w+)"/)[1]];
        }
    };
    ActionRepeats.syncFields(container, { id: 3, repeats: 4 }, 'data-item-id');
    assert.deepEqual([fields.repeats.value, fields.repeatsMax.value], ['4', '4']);
});

test('the Skill and Item editors route both ends through ActionRepeats', () => {
    const ActionRepeats = loadActionRepeats();
    const load = (file, className) => vm.runInNewContext(`${read(file)}\n${className};`, {
        window: { I18n: null }, ActionRepeats, alert: () => {},
        console: { log: () => {}, debug: () => {}, warn: () => {}, error: () => {} }
    });

    for (const [file, className, getter, updater, saver] of [
        ['editor/src/database/DatabaseSkillEditor.js', 'DatabaseSkillEditor', 'getSkill', 'updateSkillField', 'updateSkill'],
        ['editor/src/database/DatabaseItemEditor.js', 'DatabaseItemEditor', 'getItem', 'updateItemField', 'updateItem']
    ]) {
        const record = { id: 1, repeats: 2 };
        let saves = 0;
        const editor = Object.create(load(file, className).prototype);
        editor.databaseManager = { [getter]: () => record, [saver]: () => { saves++; } };

        assert.equal(editor[updater](1, 'repeatsMax', '5'), 5, className);
        assert.equal(record.repeatsMax, 5);
        assert.equal(editor[updater](1, 'repeats', '9'), 9);
        assert.equal('repeatsMax' in record, false);
        assert.equal(saves, 2, `${className} saves each edit`);

        const source = read(file);
        const kind = className === 'DatabaseSkillEditor' ? 'skill' : 'item';
        assert.ok(source.includes(`ActionRepeats.minFieldHTML(${kind}, 'data-${kind}-id')`), `${className} renders the shared Repeats box`);
        assert.ok(source.includes(`ActionRepeats.maxRowHTML(${kind}, 'data-${kind}-id'`), `${className} renders the shared Max Repeats row`);
        assert.ok(!source.includes('data-field="repeats"'), `${className} keeps no Repeats input of its own`);
    }

    const index = read('editor/index.html');
    const at = file => index.indexOf(`src/database/${file}`);
    assert.ok(at('ActionRepeats.js') > at('ActionElements.js'), 'loaded beside ActionElements');
    assert.ok(at('ActionRepeats.js') < at('DatabaseSkillEditor.js'), 'and before the Skill editor');
    assert.ok(at('ActionRepeats.js') < at('DatabaseItemEditor.js'), 'and before the Item editor');
});
