const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const commandsRoot = path.join(editorRoot, 'src', 'event', 'commands');
const RREnemySlotOptions = require(path.join(commandsRoot, 'EnemySlotOptions.js'));
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
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
    331: 'changeEnemyHPEditor',
    332: 'changeEnemyMPEditor',
    333: 'changeEnemyStateEditor',
    334: 'enemyRecoverAllEditor',
    335: 'enemyAppearEditor',
    336: 'enemyTransformEditor',
    337: 'showBattleAnimationEditor',
    339: 'forceActionEditor',
    342: 'changeEnemyTPEditor'
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
        'MessageCommandEditor', 'MovePictureEditor', 'ConditionalBranchEditor',
        'LoopEditor', 'AudioCommandEditor', 'PluginCommandEditor', 'MediaSurfaceEditor'
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
    // The real statics for the shared table, stubs for the list surgery.
    editor._eventCommandListClass = () => ({
        simpleCommandEditor: EventCommandList.simpleCommandEditor.bind(EventCommandList),
        isNoParamCommand: EventCommandList.isNoParamCommand.bind(EventCommandList),
        safeInsertionIndex: (list, index) => index,
        insertionIndent: () => 0,
        rebaseInsertIndent: () => {},
        commandBlock: value => Array.isArray(value) ? value : value ? [value] : [],
        contiguousBlockRange: () => null,
        generatedCommand: () => null,
        pictureEditorFor: () => null
    });
    const dialog = name => ({
        show(command, callback, context) {
            opened.push({ name, command, context });
            callback({ code, indent: 0, parameters: [0] });
        }
    });
    editor.getCommandEditor = name => dialog(name);
    // The battle dialogs now live on the shared EventCommandList instance,
    // named by SIMPLE_COMMAND_EDITORS rather than by a list held here.
    editor.commandDialogs = () => new Proxy({}, { get: (_t, prop) => dialog(String(prop)) });
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
    // Every other summary comes from EventCommandList now; this is the one part
    // a troop page renders itself, because it is the one part only it can know.
    const describe = (code, parameters) => editor.enemySlotDescription({ code, parameters });

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

    // Anything else is the shared formatter's to describe, not this host's.
    assert.equal(describe(311, [0, 0, 0, 100, false]), null);
    assert.equal(describe(326, []), null);
    const troopSource = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    assert.match(troopSource, /getCommandInfo\(cmd, page, index\)/);
    // The row colours stay this host's own: a battle page bands them more
    // finely than the map list, and the rows look as they always have.
    assert.match(troopSource, /code === 108 \|\| code === 109 \|\| code === 408/);
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

//-----------------------------------------------------------------------------
// Start Battle on Map in the event list: its branch rows, its place in the picker, no raw arguments.

const FightCommandEditor = require(path.join(commandsRoot, 'FightCommandEditor.js'));
const start = (args, indent = 0) => FightCommandEditor.build('StartMapBattle', args, indent);
const row = (code, indent = 0, parameters = []) => ({ code, indent, parameters });
const text = (line, indent) => row(230, indent, [line]);
const shape = list => list.map(command => `${command.code}@${command.indent || 0}${command.code === 230 ? ':' + command.parameters[0] : ''}`);

test('a Start Battle on Map header owns If Win, If Escape and If Lose, as Battle Processing does', () => {
    const header = start({ wait: true });
    assert.equal(EventCommandList.isMapBattleStart(header), true);
    assert.equal(EventCommandList.isMapBattleStart(FightCommandEditor.build('SpawnUnit', {})), false);
    assert.equal(EventCommandList.isMapBattleStart(row(357, 0, ['OtherPlugin', 'StartMapBattle', '', {}])), false);
    assert.deepEqual(EventCommandList.branchShape(header), EventCommandList.BRANCH_STRUCTURES[301]);
    assert.deepEqual(EventCommandList.branchShape(row(301)), EventCommandList.BRANCH_STRUCTURES[301]);
    assert.equal(EventCommandList.branchShape(row(230)), null);
    // The structure: the header, its argument rows if it has any, the branches, the end row.
    const list = [text(1, 0), header, row(601), text(2, 1), row(0, 1), row(602), row(0, 1), row(604), text(3, 0), row(0)];
    assert.deepEqual(EventCommandList.structureRange(list, 1), { start: 1, end: 7 });
    const rows = [header, row(657, 0, ['mode = tactical']), row(601), row(0, 1), row(604), row(0)];
    assert.deepEqual(EventCommandList.structureRange(rows, 0), { start: 0, end: 4 }, 'argument rows sit between the command and its branches');
    assert.deepEqual(EventCommandList.structureRange([start({ wait: false }), text(1, 0), row(0)], 0), { start: 0, end: 0 }, 'a command that does not wait stands alone');
    // Selecting the header, or one of its rows, takes the whole structure: copy, cut, delete and drag move it as one.
    const select = (commands, selected) => EventCommandList.prototype.expandSelection.call({ selectedIndices: selected, findParentCommandIndex: () => -1 }, { list: commands });
    assert.deepEqual(select(list, [1]), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(select(list, [5]), [1, 2, 3, 4, 5, 6, 7], 'If Escape selects the battle it belongs to');
    assert.deepEqual(select(rows, [1]), [0, 1, 2, 3, 4]);
    // A new command asked for right after the header goes into If Win, not between the command and its first row.
    assert.equal(EventCommandList.safeInsertionIndex(list, 2), 3);
    assert.equal(EventCommandList.safeInsertionIndex(rows, 2), 3);
    assert.equal(EventCommandList.insertionIndent(list, EventCommandList.safeInsertionIndex(list, 2)), 1);
    const alone = [start({ wait: false }), row(0)];
    assert.equal(EventCommandList.insertionIndent(alone, EventCommandList.safeInsertionIndex(alone, 1)), 0, 'nothing is indented under a command that does not wait');
});

test('editing Start Battle on Map writes and removes its branch rows; a branch that holds commands never turns into commands that always run', () => {
    const waiting = { mode: 'tactical', wait: true, canEscape: true, canLose: true };
    const block = (args, indent = 0) => FightCommandEditor.block('StartMapBattle', args, indent);
    // Wait ticked on a command that had no rows: they are written under it.
    let list = [text(1, 0), start({ wait: false }), text(9, 0), row(0)];
    EventCommandList.replaceBattleStart(list, 1, block(waiting));
    assert.deepEqual(shape(list), ['230@0:1', '357@0', '601@0', '0@1', '602@0', '0@1', '603@0', '0@1', '604@0', '230@0:9', '0@0']);
    // Edited again with every branch kept: each body stays under its own row.
    const full = () => [start(waiting, 1), row(601, 1), text('won', 2), row(0, 2), row(602, 1), text('fled', 2), row(0, 2), row(603, 1), text('lost', 2), row(353, 2), row(0, 2), row(604, 1), text('after', 1), row(0)];
    list = full();
    let result = EventCommandList.replaceBattleStart(list, 0, block(Object.assign({}, waiting, { mode: 'action' })));
    assert.deepEqual(shape(list), shape(full()));
    assert.equal(list[0].parameters[3].mode, 'action');
    assert.deepEqual(result.kept, []);
    // What an edit would take: the branches the new block lacks that hold commands, with how many.
    const noLoss = block(Object.assign({}, waiting, { canLose: false }), 1), noWait = block(Object.assign({}, waiting, { wait: false }), 1);
    assert.deepEqual(EventCommandList.lostBattleBranches(full(), 0, block(waiting, 1)), []);
    assert.deepEqual(EventCommandList.lostBattleBranches(full(), 0, noLoss), [{ code: 603, count: 2 }]);
    assert.deepEqual(EventCommandList.lostBattleBranches(full(), 0, noWait), [{ code: 601, count: 1 }, { code: 602, count: 1 }, { code: 603, count: 2 }]);
    assert.deepEqual(EventCommandList.lostBattleBranches([start(waiting), row(601), row(0, 1), row(602), row(0, 1), row(603), row(0, 1), row(604), row(0)], 0, block({ wait: false })), [], 'empty branches go without a question');
    assert.deepEqual(EventCommandList.lostBattleBranches([row(230), row(601), text('x', 1), row(0, 1), row(604), row(0)], 0, noWait), [], 'only a battle start');
    const names = { 601: 'If Win', 602: 'If Escape', 603: 'If Lose' };
    const words = (text, params) => text.replace(/\{(\w+)\}/g, (m, key) => params[key]);
    assert.equal(EventCommandList.lostBranchWords([{ code: 603, count: 2 }], code => names[code], words), 'The commands under If Lose will be deleted.');
    assert.equal(EventCommandList.lostBranchWords(EventCommandList.lostBattleBranches(full(), 0, noWait), code => names[code], words), 'The commands under If Win, If Escape, If Lose will be deleted.');
    // Without a yes, a branch that holds commands stays, with them: Game Over stays under If Lose and runs after a loss only.
    list = full();
    result = EventCommandList.replaceBattleStart(list, 0, noLoss);
    assert.deepEqual(shape(list), shape(full()));
    assert.deepEqual([result.kept, list[0].parameters[3].canLose], [[603], false]);
    list = full();
    result = EventCommandList.replaceBattleStart(list, 0, noWait);
    assert.deepEqual(shape(list), shape(full()), 'Wait unticked: nothing under a row starts running after every result');
    assert.deepEqual([result.kept, list[0].parameters[3].wait], [[601, 602, 603], false]);
    // An empty branch goes; the ones that hold commands stay in their order, under one end row.
    list = [start(waiting), row(601), row(0, 1), row(602), text('fled', 1), row(0, 1), row(603), row(0, 1), row(604), row(0)];
    EventCommandList.replaceBattleStart(list, 0, block({ wait: false }));
    assert.deepEqual(shape(list), ['357@0', '602@0', '230@1:fled', '0@1', '604@0', '0@0']);
    // With the yes (`drop`), the branch goes with its commands, as a Conditional Branch's Else does.
    list = full();
    result = EventCommandList.replaceBattleStart(list, 0, noLoss, { drop: true });
    assert.deepEqual(shape(list), ['357@1', '601@1', '230@2:won', '0@2', '602@1', '230@2:fled', '0@2', '604@1', '230@1:after', '0@0']);
    assert.deepEqual(result.kept, []);
    list = full();
    EventCommandList.replaceBattleStart(list, 0, noWait, { drop: true });
    assert.deepEqual(shape(list), ['357@1', '230@1:after', '0@0']);
    // Two rows of one kind (a list made by hand) are one branch: nothing under either is lost.
    list = [start(waiting), row(601), text('a', 1), row(0, 1), row(601), text('b', 1), row(0, 1), row(604), row(0)];
    EventCommandList.replaceBattleStart(list, 0, block({ wait: true }));
    assert.deepEqual(shape(list), ['357@0', '601@0', '230@1:a', '230@1:b', '0@1', '604@0', '0@0']);
    // Argument rows a hand-written command carries are replaced with the command.
    list = [start(waiting), row(657, 0, ['mode = tactical']), row(601), row(0, 1), row(604), row(0)];
    EventCommandList.replaceBattleStart(list, 0, block({ wait: true }));
    assert.deepEqual(shape(list), ['357@0', '601@0', '0@1', '604@0', '0@0']);
    // A nested structure inside a branch rides along untouched.
    list = [start(waiting), row(601), row(111, 1, [0, 1, 0]), text('in', 2), row(0, 2), row(412, 1), row(0, 1), row(604), row(0)];
    EventCommandList.replaceBattleStart(list, 0, block({ wait: true, canEscape: true }));
    assert.deepEqual(shape(list), ['357@0', '601@0', '111@1', '230@2:in', '0@2', '412@1', '0@1', '602@0', '0@1', '604@0', '0@0']);
    assert.equal(EventCommandList.replaceBattleStart([row(230), row(0)], 0, block(waiting)), null, 'only a battle start');
});

test('Battle Processing brings If Win, If Escape and If Lose when it can be escaped or lost, and keeps their commands through an edit', async () => {
    const BattleProcessingEditor = require(path.join(commandsRoot, 'BattleProcessingEditor.js'));
    const bp = (canEscape, canLose, indent = 0) => ({ code: 301, indent, parameters: [0, 6, canEscape, canLose] });
    // OK hands the command and its rows: none for a battle that must be won.
    assert.deepEqual(shape(BattleProcessingEditor.block(bp(false, false))), ['301@0']);
    assert.deepEqual(shape(BattleProcessingEditor.block(bp(true, true))), ['301@0', '601@0', '0@1', '602@0', '0@1', '603@0', '0@1', '604@0']);
    assert.deepEqual(shape(BattleProcessingEditor.block(bp(false, true, 2))), ['301@2', '601@2', '0@3', '603@2', '0@3', '604@2']);
    assert.deepEqual(shape(BattleProcessingEditor.block(bp(true, false))), ['301@0', '601@0', '0@1', '602@0', '0@1', '604@0']);
    // An edit keeps what is under each row and writes the rows the new settings bring.
    const full = () => [bp(true, true), row(601), text('won', 1), row(0, 1), row(602), text('fled', 1), row(0, 1), row(603), text('lost', 1), row(0, 1), row(604), text('after', 0), row(0)];
    let list = full();
    EventCommandList.replaceBattleStart(list, 0, BattleProcessingEditor.block(Object.assign(bp(true, true), { parameters: [0, 3, true, true] })));
    assert.deepEqual(shape(list), shape(full()));
    assert.equal(list[0].parameters[1], 3);
    list = [bp(false, false), text('after', 0), row(0)];
    EventCommandList.replaceBattleStart(list, 0, BattleProcessingEditor.block(bp(false, true)));
    assert.deepEqual(shape(list), ['301@0', '601@0', '0@1', '603@0', '0@1', '604@0', '230@0:after', '0@0']);
    // Unticking Can Escape would take the commands under If Escape: the author is asked first.
    assert.deepEqual(EventCommandList.lostBattleBranches(full(), 0, BattleProcessingEditor.block(bp(false, true))), [{ code: 602, count: 1 }]);
    list = full();
    EventCommandList.replaceBattleStart(list, 0, BattleProcessingEditor.block(bp(false, true)), { drop: true });
    assert.deepEqual(shape(list), ['301@0', '601@0', '230@1:won', '0@1', '603@0', '230@1:lost', '0@1', '604@0', '230@0:after', '0@0']);
    // The dialog stores nothing and stays open while the author says no.
    const stored = [];
    let closed = 0;
    const dialog = { buildCommand: () => bp(false, true), close: () => closed++, callback: command => stored.push(command), hooks: { beforeStore: async () => false } };
    await BattleProcessingEditor.prototype.save.call(dialog);
    assert.deepEqual([stored.length, closed], [0, 0]);
    dialog.hooks.beforeStore = async () => true;
    await BattleProcessingEditor.prototype.save.call(dialog);
    assert.deepEqual([stored.length, closed], [1, 1]);
    // Inserting and editing in an event list go through the block, not the one-command table.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    assert.match(source, /if \(code === 301\) \{\s+this\.battleProcessingEditor\.show\(null, \(edited\) => \{[\s\S]{0,200}BattleProcessingEditor\.block\(edited\)/);
    assert.match(source, /EventCommandList\.replaceBattleStart\(page\.list, index, BattleProcessingEditor\.block\(edited\), \{ drop: true \}\)/);
});

test('Reactor commands with a dialog of their own show no raw-argument triangle, and the picker lists Start Battle on Map with the battles', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    assert.match(source, /const ownDialog = command\.code === 357 && params\[0\] === 'RPGReactor' && !!this\._reactorCommandEditor\(params\[1\]\);/);
    assert.match(source, /const hasArgs = !ownDialog && \(pluginArgRows > 0 \|\| Object\.keys\(args\)\.length > 0\);/);
    const owner = { fightCommandEditor: {} };
    for (const name of FightCommandEditor.NAMES) assert.ok(EventCommandList.prototype._reactorCommandEditor.call(owner, name), `${name} has its own dialog`);
    assert.equal(EventCommandList.prototype._reactorCommandEditor.call(owner, 'SomePluginCommand'), null, 'a plugin command keeps its triangle');
    // A new command, and an edited one, reach the list as a block.
    assert.match(source, /const commands = EventCommandList\.commandBlock\(built\);\s+if \(commands\.length > 0\) \{\s+this\._rebaseInsertIndent\(commands, baseIndent\);\s+page\.list\.splice\(insertIndex, 0, \.\.\.commands\);/);
    assert.match(source, /if \(battleStart\) \{\s+EventCommandList\.replaceBattleStart\(page\.list, index, editedCommand, \{ drop \}\);/);
    // The picker: directly under Battle Processing on Battle & System, and first under Reactor › Battles on the Map.
    const EventCommandPicker = require(path.join(editorRoot, 'src', 'event', 'EventCommandPicker.js'));
    const data = new EventCommandPicker().commandData;
    const section = (tab, title) => data[tab].columns.flatMap(column => column.sections).find(entry => entry.title === title).commands;
    const scene = section('tab3', 'Scene Control');
    assert.equal(data.tab3.name, 'Battle & System');
    assert.deepEqual(scene.slice(0, 2).map(command => command.name), ['Battle Processing', 'Start Battle on Map']);
    assert.deepEqual(scene[1], { name: 'Start Battle on Map', code: 357, reactor: 'StartMapBattle' });
    assert.deepEqual(section('tab4', 'Battles on the Map').map(command => command.reactor),
        ['StartMapBattle', 'SpawnUnit', 'ChangeUnitSide', 'RemoveUnit', 'EndMapBattle', 'ChangeBattleGoal', 'ChangeBattleMode', 'SetTerrainCost']);
    assert.deepEqual(section('tab4', 'Battles on the Map').map(command => command.name), section('tab4', 'Battles on the Map').map(command => FightCommandEditor.LABELS[command.reactor]));
});

test('the position picker opens on the chosen tile, can keep to one map and reports a cancel', () => {
    const TransferPlayerEditor = require(path.join(commandsRoot, 'TransferPlayerEditor.js'));
    // The chosen tile in the middle of the view; never scrolled past the map's edge.
    assert.deepEqual(TransferPlayerEditor.scrollFor({ x: 80, y: 57 }, 48, 1, 1000, 700), { left: 80.5 * 48 - 500, top: 57.5 * 48 - 350 });
    assert.deepEqual(TransferPlayerEditor.scrollFor({ x: 80, y: 57 }, 48, 0.5, 1000, 700), { left: 80.5 * 24 - 500, top: 57.5 * 24 - 350 });
    assert.deepEqual(TransferPlayerEditor.scrollFor({ x: 2, y: 1 }, 48, 1, 1000, 700), { left: 0, top: 0 });
    assert.deepEqual(TransferPlayerEditor.scrollFor({ x: 10, y: 10 }, 32, 2, 0, 0), { left: 672, top: 672 }, 'the project\'s own tile size');
    // Enter is OK on the picture; a button and the search box use it themselves.
    const press = tagName => TransferPlayerEditor.confirmsOn({ key: 'Enter', target: { tagName } });
    assert.deepEqual(['CANVAS', 'DIV', 'BUTTON', 'INPUT'].map(press), [true, true, false, false]);
    assert.equal(TransferPlayerEditor.confirmsOn({ key: 'Escape', target: { tagName: 'DIV' } }), false);
    const source = fs.readFileSync(path.join(commandsRoot, 'TransferPlayerEditor.js'), 'utf8');
    assert.match(source, /const to = TransferPlayerEditor\.scrollFor\(selection, this\.tilePixels\(\), zoomLevel, previewContainer\.clientWidth, previewContainer\.clientHeight\);\s+previewContainer\.scrollLeft = to\.left;\s+previewContainer\.scrollTop = to\.top;/);
    assert.match(source, /updateZoom\(\);\s+scrollToSelection\(\);/, 'after the map is drawn');
    assert.match(source, /if \(!options\.thisMapOnly\) content\.appendChild\(mapTreeSection\);/);
    assert.match(source, /if \(!confirmed && options\.onCancel\) options\.onCancel\(\);/);
    assert.match(source, /RRKeyboardNavigation\.modal\(picker, \{ onEscape: \(\) => closePicker\(\) \}\)/, 'Escape is Cancel');
    assert.match(source, /await this\.drawTopDown3D\(renderedCanvas, mapId\);/, 'a 3D map is drawn from above');
});

test('a 3D map is drawn from above out of its own data, whichever map and view the editor shows', async () => {
    const TransferPlayerEditor = require(path.join(commandsRoot, 'TransferPlayerEditor.js'));
    // A 6 x 4 map: a slope along its left edge, a pond, a house (floor, wall, roof), a fence, a fountain, a rock, a tree.
    const width = 6, height = 4, stride = width + 1;
    const terrain = new Array(stride * (height + 1)).fill(0);
    for (let y = 0; y <= height; y++) terrain[y * stride] = 3;
    const mapData = { id: 7, width, height, note: '<3d>', data: new Array(width * height * 6).fill(0), reactor3d: {
        version: 1, mode: '3d', width, height, terrain, terrainWidth: width, room: { floor: '!Grass-01', cliffSlope: 60, cliffTint: '#a99f93' },
        water: [{ x0: 4, y0: 2, x1: 5, y1: 3, level: -1, material: 'Water', mask: '1101', colour: '#3355aa' }],
        pieces: [
            { id: 1, kind: 'ramp', x: 2, y: 1, z: 5, rot: 0, material: 'RoofTile' },
            { id: 2, kind: 'floor', x: 2, y: 1, z: 0, rot: 0, material: 'Wood' },
            { id: 3, kind: 'wall', x: 2, y: 1, z: 0, rot: 0, material: 'Stone' },
            { id: 4, kind: 'fence', x: 3, y: 0, z: 0, rot: 1, material: 'Wood' },
            { id: 5, kind: 'glass', x: 3, y: 1, z: 0, rot: 0, material: 'Glass' },
            { id: 6, kind: 'tube', x: 4, y: 0, z: 0, rot: 0, material: 'Stone', size: [2, 1.5, 2], angle: 0, thick: 0.2 },
            { id: 7, kind: 'rock', x: 1, y: 3, z: 0, rot: 0, material: 'Rock', size: [2, 1, 1], angle: 30, offset: [0.25, -0.5], tint: '#c2ae92', cap: 'ground' },
            { id: 8, kind: 'box', x: 5, y: 1, z: 0, rot: 0, material: 'LampGlow', size: [0.4, 0.2, 0.4], angle: 45 }
        ],
        props: [{ id: 1, name: 'Map-Objects/Tree-01', ext: '.glb', file: 'Tree-01', x: 0, y: 3, z: 0, size: 12 }]
    } };
    mapData.data[1 * width + 5] = 2816;
    const plan = TransferPlayerEditor.topDownPlan(mapData);
    assert.deepEqual([plan.width, plan.height, plan.floor], [6, 4, '!Grass-01']);
    assert.equal(plan.bare[1 * width + 5], 0, 'a cell with a tile keeps its tile');
    assert.equal(Array.from(plan.bare).filter(Boolean).length, 23);
    // The slope faces away from the light on its right-hand side: darker, and steep enough to be rock.
    assert.ok(plan.shade[0] < 0.6 && plan.shade[1] === 1, `shade ${plan.shade[0]}`);
    assert.deepEqual([plan.cliff.material, plan.cliff.tint, Array.from(plan.cliff.cells.slice(0, 2))], ['Rock', '#a99f93', [1, 0]]);
    // The pond's cells, by its mask, in its own color.
    assert.deepEqual([plan.water[2 * width + 4], plan.water[2 * width + 5], plan.water[3 * width + 4], plan.water[3 * width + 5], plan.waters], [1, 1, 0, 1, [{ colour: '#3355aa' }]]);
    // The pieces, what stands lower first: the roof is drawn after the wall and the floor it covers; glass is left out.
    const brief = plan.marks.map(mark => [mark.form, mark.material, mark.x, mark.y, mark.w, mark.d]);
    assert.deepEqual(brief.map(([form, material]) => form + ':' + material), ['box:LampGlow', 'cell:Wood', 'cell:Wood', 'round:Rock', 'round:', 'ring:Stone', 'cell:Stone', 'cell:RoofTile']);
    assert.deepEqual(brief[7], ['cell', 'RoofTile', 2, 1, 1, 1]);
    assert.deepEqual(brief[2].map(value => (typeof value === 'number' ? Math.round(value * 100) / 100 : value)), ['cell', 'Wood', 3.42, 0, 0.16, 1], 'a fence turned a quarter runs down its cell');
    assert.deepEqual([brief[3], plan.marks[3].angle, plan.marks[3].tint, plan.marks[3].scale], [['round', 'Rock', 1.75, 3, 2, 1], 30, '#c2ae92', 5], 'a shape stands round its middle, nudged by its offset');
    assert.deepEqual([brief[4], plan.marks[4].scale], [['round', '', 1.75, 3, 1.6, 0.8], 0], "a rock capped with ground wears the room's floor on top");
    assert.deepEqual([plan.marks[5].form, plan.marks[5].thick, plan.marks[5].x, plan.marks[5].y], ['ring', 0.2, 4.5, 0.5]);
    assert.deepEqual(plan.props, [{ x: 0.5, y: 3.5, r: 1.5 }]);
    // Rocks that touch are one mass: every cap is drawn after every rock, the taller neighbor's too.
    const hill = JSON.parse(JSON.stringify(mapData));
    hill.reactor3d.pieces = [
        { id: 1, kind: 'rock', x: 1, y: 1, z: 0, rot: 0, material: 'Rock', size: [2, 1, 2], angle: 0, cap: 'ground' },
        { id: 2, kind: 'rock', x: 2, y: 1, z: 0, rot: 0, material: 'Rock', size: [2, 4, 2], angle: 0, cap: 'Moss' },
        { id: 3, kind: 'floor', x: 2, y: 1, z: 6, rot: 0, material: 'Wood' }];
    assert.deepEqual(TransferPlayerEditor.topDownPlan(hill).marks.map(mark => [mark.material, mark.x, mark.w]), [['Rock', 1.5, 2], ['Rock', 2.5, 2], ['', 1.5, 1.6], ['Moss', 2.5, 1.6], ['Wood', 2, 1]]);
    // A map that is not 3D, or has no sidecar, has no plan.
    assert.equal(TransferPlayerEditor.topDownPlan({ width: 6, height: 4, note: '', reactor3d: mapData.reactor3d }), null);
    assert.equal(TransferPlayerEditor.topDownPlan({ width: 6, height: 4, note: '<3d>' }), null);
    assert.equal(TransferPlayerEditor.topDownPlan(null), null);

    // The painter: ground on bare cells only, the pond, then every piece in the plan's order, then the model.
    const drawn = [];
    const state = { fillStyle: '', globalAlpha: 1, strokeStyle: '', lineWidth: 1 };
    let moved = [0, 0];
    const ctx = Object.assign(state, {
        save() {}, restore() { moved = [0, 0]; }, beginPath() {}, rotate() {}, translate(x, y) { moved = [x, y]; },
        fillRect(x, y, w, h) { drawn.push(['rect', state.fillStyle, x + moved[0], y + moved[1], w, h, state.globalAlpha]); },
        ellipse(x, y, rx, ry) { drawn.push(['ellipse', state.fillStyle, x + moved[0], y + moved[1], rx, ry]); },
        fill() { drawn.push(['fill', state.fillStyle]); }, stroke() { drawn.push(['stroke', state.strokeStyle, state.lineWidth]); }
    });
    TransferPlayerEditor.paintTopDown(ctx, plan, 10, (material, tint, scale) => `${material || 'floor'}/${tint}/${scale}`);
    const ground = drawn.filter(op => op[0] === 'rect' && op[1] === 'floor//0');
    assert.deepEqual(ground.slice(0, 2), [['rect', 'floor//0', 0, 0, 60, 10, 1], ['rect', 'floor//0', 0, 10, 50, 10, 1]], 'a row of bare cells is one rectangle, and stops at the tile');
    assert.deepEqual(drawn.find(op => op[1] === 'Rock/#a99f93/5'), ['rect', 'Rock/#a99f93/5', 0, 0, 10, 10, 1], 'the cliff, in the room\'s tint');
    assert.ok(drawn.some(op => op[0] === 'rect' && op[1] === '#000000' && op[2] === 0 && op[6] > 0.3), 'the slope is shaded');
    assert.deepEqual(drawn.filter(op => op[1] === '#3355aa').map(op => op.slice(2, 6)), [[40, 20, 20, 10], [50, 30, 10, 10]]);
    const pieces = drawn.filter(op => /^(Wood|Stone|RoofTile|LampGlow)\//.test(String(op[1])) && op[0] !== 'fill');
    assert.deepEqual(pieces.map(op => op[0] + ':' + op[1]), ['rect:LampGlow//1', 'rect:Wood//1', 'rect:Wood//1', 'ellipse:Stone//1', 'stroke:Stone//1', 'rect:Stone//1', 'rect:RoofTile//1']);
    assert.deepEqual(pieces[6], ['rect', 'RoofTile//1', 20, 10, 10, 10, 1], 'the roof is the last thing drawn on its cell');
    assert.deepEqual(drawn.slice(-3), [['ellipse', 'rgba(38, 66, 40, 0.8)', 5, 35, 15, 15], ['fill', 'rgba(38, 66, 40, 0.8)'], ['stroke', 'rgba(255, 255, 255, 0.5)', 1]], 'a model is a round mark');
    // A large map's picture fits a canvas; a small one is drawn at the preview's own size.
    assert.equal(TransferPlayerEditor.planTile({ width: 200, height: 200 }, 48), 20);
    assert.equal(TransferPlayerEditor.planTile({ width: 40, height: 30 }, 48), 48);
    assert.equal(TransferPlayerEditor.planTile({ width: 999, height: 10 }, 48), 6);
    // The open map is read as it stands in the editor, any other from its files with its sidecar.
    const files = { '/p/data/Map007.json': JSON.stringify({ width: 6, height: 4, note: '<3d>', data: [] }) };
    const tilemap = { currentMapId: 5, currentMap: { id: 5, note: '<3d>', edited: true }, projectPath: '/p', path: { join: (...parts) => parts.join('/') },
        fs: { existsSync: file => file in files, readFileSync: file => files[file] }, loadMapSidecar(map) { map.reactor3d = mapData.reactor3d; return true; } };
    const editor = Object.assign(Object.create(TransferPlayerEditor.prototype), { projectController: { tilemapManager: tilemap } });
    const previous = globalThis.RRJson;
    globalThis.RRJson = { parse: JSON.parse };
    try {
        assert.equal(editor._mapForPlan(5), tilemap.currentMap, 'unsaved edits and all');
        const other = editor._mapForPlan(7);
        assert.deepEqual([other.id, other.width, other.reactor3d === mapData.reactor3d], [7, 6, true]);
        assert.equal(editor._mapForPlan(9), null);
        // With no map to read, or one that is not 3D, the preview is left as it was.
        assert.equal(await editor.drawTopDown3D({}, 9), false);
        tilemap.loadMapSidecar = () => false;
        assert.equal(await editor.drawTopDown3D({}, 7), false);
    } finally { if (previous === undefined) delete globalThis.RRJson; else globalThis.RRJson = previous; }
});
