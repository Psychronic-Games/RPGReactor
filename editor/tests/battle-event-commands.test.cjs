const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const commandsRoot = path.join(editorRoot, 'src', 'event', 'commands');
const RREnemySlotOptions = require(path.join(commandsRoot, 'EnemySlotOptions.js'));
// DatabaseEffectEditor is a browser script with no module.exports and a bare
// rrEscapeHtml global, so it loads the way the other database editors are tested.
function loadEffectEditor() {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseEffectEditor.js'), 'utf8');
    return vm.runInNewContext(`${source}
DatabaseEffectEditor;`, {
        console: { log() {}, warn() {}, error() {} },
        window: {},
        document: { getElementById: () => null },
        rrEscapeHtml: value => String(value == null ? '' : value)
    });
}
const DatabaseEffectEditor = loadEffectEditor();

// Every command a troop page can address an enemy with, and the dialog it must
// open. Before this table existed in DatabaseTroopEditor only Force Action was
// wired: the rest inserted a default command with no dialog at all, and opened
// a raw JSON textarea of their parameters when double-clicked.
const BATTLE_COMMANDS = {
    331: 'changeEnemyHP',
    332: 'changeEnemyMP',
    333: 'changeEnemyState',
    334: 'enemyRecoverAll',
    335: 'enemyAppear',
    336: 'enemyTransform',
    337: 'showBattleAnimation',
    339: 'forceAction',
    342: 'changeEnemyTP'
};

// Enough of an element for a dialog to build itself: the selectors these
// dialogs run are all "give me the one child I just created", so one stand-in
// per selector is indistinguishable from the real lookup.
class FakeElement {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.listeners = {};
        this.style = {};
        this.textContent = '';
        this.innerHTML = '';
        this.selected = false;
        this._found = new Map();
    }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    querySelector(selector) {
        if (!this._found.has(selector)) this._found.set(selector, new FakeElement('div'));
        return this._found.get(selector);
    }
}

function withFakeDom(run) {
    const previousDocument = global.document;
    const previousWindow = global.window;
    const previousSlots = global.RREnemySlotOptions;
    const previousPicker = global.AnimationPickerModal;
    global.document = { createElement: tag => new FakeElement(tag), body: { appendChild() {} } };
    global.window = {};
    global.RREnemySlotOptions = RREnemySlotOptions;
    global.AnimationPickerModal = { label: (list, id) => `#${id}`, open() {} };
    try {
        return run();
    } finally {
        global.document = previousDocument;
        global.window = previousWindow;
        global.RREnemySlotOptions = previousSlots;
        global.AnimationPickerModal = previousPicker;
    }
}

const DATABASE = {
    getEnemies: () => [{ id: 1, name: 'Goblin' }, { id: 4, name: 'Treant' }],
    getStates: () => [],
    getSkills: () => [],
    getAnimations: () => [],
    data: { states: [null], actors: [null], skills: [null], enemies: [null] }
};
const TROOP = { members: [{ enemyId: 1 }, { enemyId: 4 }] };

function loadTroopEditor() {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    class EditorStub {}
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null },
        window: {},
        RREnemySlotOptions
    };
    for (const name of [
        'CommonEventEditor', 'ControlVariablesEditor', 'ShowPictureEditor',
        'MovePictureEditor', 'ErasePictureEditor', 'ForceActionEditor',
        'ChangeEnemyHPEditor', 'ChangeEnemyMPEditor', 'ChangeEnemyTPEditor',
        'ChangeEnemyStateEditor', 'EnemyRecoverAllEditor', 'EnemyAppearEditor',
        'EnemyTransformEditor', 'ShowBattleAnimationEditor',
        'ConditionalBranchEditor', 'LoopEditor', 'AudioCommandEditor',
        'ChangeVehicleBGMEditor', 'PluginCommandEditor'
    ]) context[name] = EditorStub;
    return vm.runInNewContext(`${source}\nDatabaseTroopEditor;`, context);
}

function makeTroopEditor(DatabaseTroopEditor, code) {
    const opened = [];
    const editor = Object.create(DatabaseTroopEditor.prototype);
    editor.databaseManager = DATABASE;
    editor.currentTroop = TROOP;
    editor.commandPicker = { show: callback => callback({ code }) };
    editor.selectedCommandIndices = [];
    editor.persistTroop = () => {};
    editor._eventCommandListClass = () => ({
        safeInsertionIndex: (list, index) => index,
        insertionIndent: () => 0,
        rebaseInsertIndent: () => {},
        commandBlock: value => Array.isArray(value) ? value : value ? [value] : [],
        contiguousBlockRange: () => null,
        generatedCommand: () => null,
        pictureEditorFor: () => null
    });
    editor.getCommandEditor = name => ({
        show(command, callback, context) {
            opened.push({ name, command, context });
            callback({ code, indent: 0, parameters: [0] });
        }
    });
    return { editor, opened };
}

test('every battle command opens its own dialog on insert, never the raw JSON box', () => {
    const DatabaseTroopEditor = loadTroopEditor();
    for (const [code, name] of Object.entries(BATTLE_COMMANDS)) {
        const { editor, opened } = makeTroopEditor(DatabaseTroopEditor, Number(code));
        const page = { list: [{ code: 0, indent: 0, parameters: [] }] };
        editor.insertNewCommand(page, 0);
        assert.equal(opened.length, 1, `code ${code} opened no dialog`);
        assert.equal(opened[0].name, name);
        assert.equal(opened[0].command, null, `code ${code} must start from defaults`);
        assert.equal(opened[0].context.troop, TROOP, `code ${code} must carry the page's troop`);
        assert.equal(page.list[0].code, Number(code));
    }
});

test('every battle command reopens its own dialog on edit, carrying the command', () => {
    const DatabaseTroopEditor = loadTroopEditor();
    for (const [code, name] of Object.entries(BATTLE_COMMANDS)) {
        const { editor, opened } = makeTroopEditor(DatabaseTroopEditor, Number(code));
        const command = { code: Number(code), indent: 2, parameters: [1] };
        const page = { list: [command, { code: 0, indent: 0, parameters: [] }] };
        editor.editCommandSimple(command, 0, page);
        assert.equal(opened.length, 1, `code ${code} fell through to the raw JSON box`);
        assert.equal(opened[0].name, name);
        assert.equal(opened[0].command, command);
        assert.equal(opened[0].context.troop, TROOP);
        assert.equal(page.list[0].indent, 2, 'the replacement keeps its nesting');
    }
});

test('troop command rows read the operation and the battler out of the right parameters', () => {
    const DatabaseTroopEditor = loadTroopEditor();
    const editor = Object.create(DatabaseTroopEditor.prototype);
    editor.databaseManager = {
        ...DATABASE,
        getState: id => (id === 3 ? { id: 3, name: 'Poison' } : null),
        getEnemy: id => DATABASE.getEnemies().find(entry => entry.id === id) || null,
        getSkill: id => (id === 7 ? { id: 7, name: 'Fireball' } : null),
        getActor: id => (id === 2 ? { id: 2, name: 'Harold' } : null),
        getAnimation: id => (id === 5 ? { id: 5, name: 'Burst' } : null)
    };
    editor.currentTroop = TROOP;
    editor._eventCommandListClass = () => ({ generatedCommand: () => null });
    const describe = (code, parameters) => editor.getCommandDisplay({ code, parameters }).description;

    // p[1] is the operation, p[2] the operand type. Reading the sign out of
    // p[2] printed a decrease as a gain and every variable operand as a loss.
    assert.equal(describe(331, [0, 1, 0, 250]), '#1 Goblin: -250');
    assert.equal(describe(332, [1, 0, 1, 12]), '#2 Treant: +Variable #12');
    assert.equal(describe(342, [0, 0, 0, 30]), '#1 Goblin: +30');
    assert.equal(describe(333, [1, 0, 3]), '#2 Treant: + Poison');
    assert.equal(describe(334, [-1]), 'Entire Troop');
    assert.equal(describe(337, [1, 5, false]), '#2 Treant: Burst');
    assert.equal(describe(337, [0, 5, true]), 'Entire Troop: Burst');
    // p[0] is the battler type, not an enemy index -- this printed "Enemy #1"
    // for every Force Action ever authored.
    assert.equal(describe(339, [0, 1, 7, -1]), '#2 Treant: Fireball');
    assert.equal(describe(339, [1, 2, 7, -1]), 'Harold: Fireball');
});

test('an enemy slot is named from the troop, and numbered when there is nothing to name', () => {
    assert.equal(RREnemySlotOptions.label(0, { troop: TROOP }, DATABASE), '#1 Goblin');
    assert.equal(RREnemySlotOptions.label(1, { troop: TROOP }, DATABASE), '#2 Treant');
    assert.equal(RREnemySlotOptions.label(2, { troop: TROOP }, DATABASE), '#3', 'empty slot');
    assert.equal(RREnemySlotOptions.label(0, {}, DATABASE), '#1', 'a map event has no troop');
    assert.equal(RREnemySlotOptions.label(0, { troop: TROOP }, null), '#1', 'no database');

    // A caller that knows about editor names supplies its own resolution.
    const context = { troop: TROOP, enemyName: enemy => `Cave ${enemy.name}` };
    assert.equal(RREnemySlotOptions.label(0, context, DATABASE), '#1 Cave Goblin');

    // A troop larger than the eight slots still lists every member.
    const big = { members: Array.from({ length: 10 }, () => ({ enemyId: 1 })) };
    assert.equal(RREnemySlotOptions.list({ troop: big }, DATABASE).length, 10);
    assert.equal(RREnemySlotOptions.list({}, DATABASE).length, 8);
});

test('every battle dialog names its enemy slots when the troop is passed through', () => {
    const cases = [
        ['ChangeEnemyHPEditor', 'createEnemyIndexSelector'],
        ['ChangeEnemyMPEditor', 'createEnemyIndexSelector'],
        ['ChangeEnemyTPEditor', 'createEnemyIndexSelector'],
        ['ChangeEnemyStateEditor', 'createEnemyIndexSelector'],
        ['EnemyRecoverAllEditor', 'createEnemyIndexSelector'],
        ['EnemyAppearEditor', 'createEnemyIndexSelector'],
        ['EnemyTransformEditor', 'createEnemyIndexSelector'],
        ['ShowBattleAnimationEditor', 'createEnemyIndexSelector'],
        ['ForceActionEditor', 'createBattlerSelector']
    ];
    withFakeDom(() => {
        for (const [file, method] of cases) {
            const EditorClass = require(path.join(commandsRoot, `${file}.js`));
            const editor = new EditorClass(DATABASE, {});

            // Opened from a map event: nothing to name the slots with.
            editor.show(null, () => {}, {});
            let labels = editor[method]().children[1].children.map(option => option.textContent);
            assert.ok(labels.includes('#1'), `${file} lost its numbered slots`);
            assert.ok(!labels.some(label => label.includes('Goblin')), `${file} invented a troop`);

            // Opened from a troop page: the same slots, named.
            editor.show(null, () => {}, { troop: TROOP });
            labels = editor[method]().children[1].children.map(option => option.textContent);
            assert.ok(labels.includes('#1 Goblin'), `${file} did not name slot 1: ${labels.join(', ')}`);
            assert.ok(labels.includes('#2 Treant'), `${file} did not name slot 2: ${labels.join(', ')}`);
            assert.ok(labels.includes('#3'), `${file} lost its empty slots`);
        }
    });
});

test('Add State offers a duration override only for a state that has turns to override', () => {
    // dataId 0 is Normal Attack: not a state at all, but whatever attack states
    // the attacker carries, each with its own Min/Max Turns. The dialog offered
    // a range for it anyway, over two boxes reading "1 - 1".
    assert.equal(DatabaseEffectEditor.durationLock(0, null), 'attackStates');
    assert.equal(DatabaseEffectEditor.durationLock(4, { autoRemovalTiming: 0 }), 'never');
    assert.equal(DatabaseEffectEditor.durationLock(4, { autoRemovalTiming: 1 }), '');
    assert.equal(DatabaseEffectEditor.durationLock(4, null), '');
});

test('the Add State duration row is locked for Normal Attack and open for a normal state', () => {
    {
        const states = [null, null, null, null,
            { id: 4, name: 'Poison', minTurns: 3, maxTurns: 5, autoRemovalTiming: 1 },
            { id: 5, name: 'Doom', minTurns: 1, maxTurns: 1, autoRemovalTiming: 0 }];
        const editor = Object.create(DatabaseEffectEditor.prototype);
        editor.databaseManager = { getState: id => states[id] || null };

        const attack = editor._durationRowHTML({ code: 21, dataId: 0, value1: 1, value2: 4, value3: 6 });
        assert.match(attack, /class="effect-duration-override"[^>]*disabled/);
        assert.doesNotMatch(attack, /class="effect-duration-override"[^>]*checked/);
        assert.match(attack, /Each attack state keeps its own turns/);
        // No state to read turns from, so the boxes stay empty rather than
        // offering a "1 - 1" that stands for nothing.
        assert.match(attack, /class="effect-duration-min[^"]*"[^>]*value=""/);
        assert.match(attack, /class="effect-duration-max[^"]*"[^>]*value=""/);

        const poison = editor._durationRowHTML({ code: 21, dataId: 4, value1: 1, value2: 4, value3: 6 });
        assert.doesNotMatch(poison, /class="effect-duration-override"[^>]*disabled/);
        assert.match(poison, /class="effect-duration-override"[^>]*checked/);
        assert.match(poison, /class="effect-duration-min[^"]*"[^>]*value="4"/);
        assert.match(poison, /class="effect-duration-max[^"]*"[^>]*value="6"/);

        const doom = editor._durationRowHTML({ code: 21, dataId: 5, value1: 1, value2: 4 });
        assert.match(doom, /class="effect-duration-override"[^>]*disabled/);
        assert.match(doom, /Not removed automatically/);
    }
});

test('saving an Add State effect on Normal Attack writes no duration', () => {
    const editor = Object.create(DatabaseEffectEditor.prototype);
    const row = {
        querySelector: selector => ({
            '.effect-duration-override': { checked: true, disabled: true },
            '.effect-duration-min': { value: '4' },
            '.effect-duration-max': { value: '6' }
        })[selector] || null
    };
    const container = { querySelector: selector => (selector === '.effect-duration' ? row : null) };
    const effect = { code: 21, dataId: 0, value1: 1, value2: 4, value3: 6 };
    editor._readDuration(container, effect);
    assert.equal(effect.value2, 0);
    assert.equal('value3' in effect, false);
});
