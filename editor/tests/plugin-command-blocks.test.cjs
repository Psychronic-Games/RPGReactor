const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
const PluginCommandEditor = require(path.join(
    editorRoot, 'src', 'event', 'commands', 'PluginCommandEditor.js'));

function pluginEditor(state = {}) {
    return Object.assign(Object.create(PluginCommandEditor.prototype), {
        classicMode: false,
        classicText: '',
        pluginName: 'ExamplePlugin',
        commandName: 'DoThing',
        commandText: 'Do Thing',
        args: {},
        selectedCommand: null,
        existingArgumentCommands: []
    }, state);
}

function pluginParent(indent = 0) {
    return {
        code: 357,
        indent,
        parameters: ['ExamplePlugin', 'DoThing', 'Do Thing', { mode: '1' }]
    };
}

function continuation(text, indent = 0) {
    return { code: 657, indent, parameters: [text] };
}

function loadBrowserEditor(relativePath, className, extra = {}) {
    const source = fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');
    class EditorStub {}
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null, querySelector: () => null },
        window: {},
        require,
        EventCommandList,
        ...extra
    };
    for (const name of new Set(source.match(/\b[A-Z][A-Za-z0-9]*Editor\b/g) || [])) {
        if (!(name in context)) context[name] = EditorStub;
    }
    return vm.runInNewContext(`${source}\n${className};`, context);
}

test('PluginCommandEditor emits ordered readable MZ argument rows and string values', () => {
    const editor = pluginEditor({
        args: {
            ignored: 'not declared',
            targets: ['user', 'enemy'],
            mode: 1,
            empty: '',
            count: 0
        },
        selectedCommand: {
            name: 'DoThing',
            text: 'Do Thing',
            args: [
                {
                    name: 'mode', text: 'Display Mode', type: 'select',
                    options: ['Window', 'Dim'], values: ['0', '1']
                },
                {
                    name: 'targets', text: 'Targets', type: 'combo[]',
                    options: ['User', 'Enemy'], values: ['user', 'enemy']
                },
                { name: 'empty', text: 'Empty', type: 'string', options: [], values: [] },
                { name: 'count', text: '', type: 'number', options: [], values: [] }
            ]
        }
    });

    const block = editor.buildCommand();
    assert.deepEqual(block.map(command => command.code), [357, 657, 657, 657]);
    assert.deepEqual(block.slice(1).map(command => command.parameters[0]), [
        'Display Mode = Dim',
        'Targets = User, Enemy',
        'count = 0'
    ]);
    assert.deepEqual(block[0].parameters[3], {
        ignored: 'not declared', targets: '["user","enemy"]', mode: '1', empty: '', count: '0'
    });
    assert.equal(Object.values(block[0].parameters[3]).every(value => typeof value === 'string'), true);
});

test('classic commands stay a one-row block and missing metadata preserves valid authored rows', () => {
    const classic = pluginEditor({ classicMode: true, classicText: 'Legacy arg' }).buildCommand();
    assert.deepEqual(classic.map(command => command.code), [356]);
    assert.deepEqual(classic[0].parameters, ['Legacy arg']);

    const existing = [continuation('Authored Label = readable'), continuation('Second = value')];
    const fallbackEditor = pluginEditor({
        modal: { style: {} },
        showLoadingState() {},
        loadAvailablePlugins: async () => {},
        renderContent() {}
    });
    fallbackEditor.show(
        { code: 357, parameters: ['ExamplePlugin', 'DoThing', 'Do Thing', { raw: 4 }] },
        () => {},
        { continuationCommands: [...existing, { code: 657, parameters: [42] }] }
    );
    const fallback = fallbackEditor.buildCommand();
    assert.deepEqual(fallback.map(command => command.code), [357, 657, 657]);
    assert.deepEqual(fallback.slice(1).map(command => command.parameters[0]),
        ['Authored Label = readable', 'Second = value']);
    assert.equal(fallback[0].parameters[3].raw, '4');
});

test('partial metadata regenerates known 657 rows and preserves unknown authored rows', () => {
    const existing = [
        continuation('Known Label = stale'),
        continuation('Unknown Label = preserve exactly')
    ];
    const editor = pluginEditor({
        args: { known: 'new', unknown: 'raw' },
        selectedCommand: {
            name: 'DoThing',
            args: [{ name: 'known', text: 'Known Label', type: 'string' }]
        },
        existingArgumentCommands: existing
    });

    let block = editor.buildCommand();
    assert.deepEqual(block.slice(1).map(command => command.parameters[0]), [
        'Known Label = new',
        'Unknown Label = preserve exactly'
    ]);
    assert.deepEqual(block[0].parameters[3], { known: 'new', unknown: 'raw' });

    editor.args.known = '';
    block = editor.buildCommand();
    assert.deepEqual(block.slice(1).map(command => command.parameters[0]), [
        'Unknown Label = preserve exactly'
    ]);
});

test('shared contiguous helpers replace only trailing continuations and expand either row', () => {
    const boundary = { code: 230, indent: 2, parameters: [30] };
    const orphan = continuation('orphan', 2);
    const list = [
        pluginParent(2),
        continuation('old one', 2),
        continuation('old two', 2),
        boundary,
        orphan
    ];

    assert.deepEqual(EventCommandList.contiguousBlockRange(list, 2, 357, 657), { start: 0, end: 2 });
    const helper = Object.create(EventCommandList.prototype);
    helper.selectedIndices = [2];
    assert.deepEqual(helper.expandSelection({ list }), [0, 1, 2]);

    const replacement = [pluginParent(0), continuation('new', 0)];
    EventCommandList.replaceContiguousBlock(list, 1, replacement, 357, 657);
    assert.deepEqual(list.map(command => command.code), [357, 657, 230, 657]);
    assert.deepEqual(list.slice(0, 2).map(command => command.indent), [2, 2]);
    assert.equal(list[2], boundary, 'replacement stops at the first non-657 row');
    assert.equal(list[3], orphan, 'a later orphan is not consumed');

    const script = [{ code: 355 }, { code: 655 }, { code: 655 }, { code: 230 }];
    helper.selectedIndices = [1];
    assert.deepEqual(helper.expandSelection({ list: script }), [0, 1, 2], '355/655 still uses the same rule');
});

test('safe insertion skips complete plugin-command and script continuation blocks', () => {
    const plugin = [pluginParent(), continuation('one'), continuation('two'), { code: 230 }];
    assert.equal(EventCommandList.safeInsertionIndex(plugin, 1), 3);
    assert.equal(EventCommandList.safeInsertionIndex(plugin, 2), 3);

    const script = [{ code: 355 }, { code: 655 }, { code: 655 }, { code: 230 }];
    assert.equal(EventCommandList.safeInsertionIndex(script, 1), 3);
    assert.equal(EventCommandList.safeInsertionIndex(script, 2), 3);
});

test('map insertion accepts a plugin block and rebases every row', () => {
    const list = Object.create(EventCommandList.prototype);
    list.selectedIndices = [0];
    list.expandedPluginCommands = new Set();
    list.commandPicker = { show: callback => callback({ code: 357 }) };
    list.pluginCommandEditor = {
        show: (_command, callback) => callback([pluginParent(0), continuation('Mode = Dim', 0)])
    };
    list.refreshCommandList = () => {};
    const page = { list: [
        { code: 111, indent: 0, parameters: [] },
        { code: 412, indent: 0, parameters: [] },
        { code: 0, indent: 0, parameters: [] }
    ] };

    list.newCommand(page, 0);
    assert.deepEqual(page.list.slice(1, 3).map(command => command.code), [357, 657]);
    assert.deepEqual(page.list.slice(1, 3).map(command => command.indent), [1, 1]);
});

test('common-event and troop insertion accept plugin blocks and rebase every row', () => {
    const DatabaseCommonEventEditor = loadBrowserEditor(
        'src/database/DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor');
    const common = Object.create(DatabaseCommonEventEditor.prototype);
    common.commandPicker = { show: callback => callback({ code: 357 }) };
    common.selectedCommandIndices = [];
    common._editors = {};
    common._eventCommandListClass = () => EventCommandList;
    common.getEditor = () => ({
        show: (_command, callback) => callback([pluginParent(0), continuation('Mode = Dim', 0)])
    });
    common.persistEvent = () => {};
    const event = { list: [
        { code: 111, indent: 0, parameters: [] },
        { code: 412, indent: 0, parameters: [] },
        { code: 0, indent: 0, parameters: [] }
    ] };
    common.insertNewCommand(event, 1);
    assert.deepEqual(event.list.slice(1, 3).map(command => command.indent), [1, 1]);

    const DatabaseTroopEditor = loadBrowserEditor(
        'src/database/DatabaseTroopEditor.js', 'DatabaseTroopEditor');
    const troop = Object.create(DatabaseTroopEditor.prototype);
    troop.commandPicker = { show: callback => callback({ code: 357 }) };
    troop.selectedCommandIndices = [];
    troop._editors = {};
    troop._eventCommandListClass = () => EventCommandList;
    troop.getCommandEditor = () => ({
        show: (_command, callback) => callback([pluginParent(0), continuation('Mode = Dim', 0)])
    });
    troop.persistTroop = () => {};
    const page = { list: [
        { code: 111, indent: 0, parameters: [] },
        { code: 412, indent: 0, parameters: [] },
        { code: 0, indent: 0, parameters: [] }
    ] };
    troop.insertNewCommand(page, 1);
    assert.deepEqual(page.list.slice(1, 3).map(command => command.indent), [1, 1]);
});

test('map, common-event, and troop insertion cannot split existing continuation blocks', () => {
    const boundary = { code: 230, indent: 0, parameters: [] };
    const end = { code: 0, indent: 0, parameters: [] };

    const map = Object.create(EventCommandList.prototype);
    map.selectedIndices = [0];
    map.expandedPluginCommands = new Set();
    map.commandPicker = { show: callback => callback({ code: 115, indent: 0, parameters: [] }) };
    map.refreshCommandList = () => {};
    const mapPage = { list: [pluginParent(), continuation('one'), continuation('two'), end] };
    map.newCommand(mapPage, 0);
    assert.deepEqual(mapPage.list.map(command => command.code), [357, 657, 657, 115, 0]);

    const DatabaseCommonEventEditor = loadBrowserEditor(
        'src/database/DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor');
    const common = Object.create(DatabaseCommonEventEditor.prototype);
    common.commandPicker = { show: callback => callback({ code: 115, indent: 0, parameters: [] }) };
    common.selectedCommandIndices = [];
    common._eventCommandListClass = () => EventCommandList;
    common.persistEvent = () => {};
    const event = { list: [pluginParent(), continuation('one'), continuation('two'), boundary, end] };
    common.insertNewCommand(event, 1);
    assert.deepEqual(event.list.map(command => command.code), [357, 657, 657, 115, 230, 0]);

    const DatabaseTroopEditor = loadBrowserEditor(
        'src/database/DatabaseTroopEditor.js', 'DatabaseTroopEditor');
    const troop = Object.create(DatabaseTroopEditor.prototype);
    troop.commandPicker = { show: callback => callback({ code: 115, indent: 0, parameters: [] }) };
    troop.selectedCommandIndices = [];
    troop._eventCommandListClass = () => EventCommandList;
    troop.persistTroop = () => {};
    const page = { list: [pluginParent(), continuation('one'), continuation('two'), end] };
    troop.insertNewCommand(page, 2);
    assert.deepEqual(page.list.map(command => command.code), [357, 657, 657, 115, 0]);
});

test('common-event and troop paste cannot split existing continuation blocks', async () => {
    const pastedCommand = { code: 230, indent: 0, parameters: [5] };

    const DatabaseCommonEventEditor = loadBrowserEditor(
        'src/database/DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor');
    const common = Object.create(DatabaseCommonEventEditor.prototype);
    const event = { list: [pluginParent(), continuation('one'), continuation('two'), { code: 0 }] };
    common.currentEvent = event;
    common.selectedCommandIndices = [0];
    common.commandClipboard = [pastedCommand];
    common._eventCommandListClass = () => EventCommandList;
    common.persistEvent = () => {};
    await common.pasteCommands(event, null);
    assert.deepEqual(event.list.map(command => command.code), [357, 657, 657, 230, 0]);

    const DatabaseTroopEditor = loadBrowserEditor(
        'src/database/DatabaseTroopEditor.js', 'DatabaseTroopEditor');
    const troop = Object.create(DatabaseTroopEditor.prototype);
    const page = { list: [pluginParent(), continuation('one'), continuation('two'), { code: 0 }] };
    troop.currentTroop = { pages: [page] };
    troop.currentBattlePageIndex = 0;
    troop.selectedCommandIndices = [1];
    troop.commandClipboard = [pastedCommand];
    troop._eventCommandListClass = () => EventCommandList;
    troop.persistTroop = () => {};
    await troop.pasteCommands(page, null);
    assert.deepEqual(page.list.map(command => command.code), [357, 657, 657, 230, 0]);
});

test('editing replaces exact plugin blocks on map, common events, and troops', () => {
    const boundary = () => ({ code: 230, indent: 2, parameters: [20] });

    const map = Object.create(EventCommandList.prototype);
    map._reactorCommandEditor = () => null;
    map.refreshCommandList = () => { map.refreshed = true; };
    let mapOpened;
    map.pluginCommandEditor = {
        show(command, callback, context) {
            mapOpened = { command, context };
            callback([pluginParent(0), continuation('new only', 0)]);
        }
    };
    const mapBoundary = boundary();
    const mapPage = { list: [pluginParent(2), continuation('old 1', 2), continuation('old 2', 2), mapBoundary] };
    map.editCommand(1, mapPage, 0);
    assert.equal(mapOpened.command.code, 357, 'direct 657 editing routes to its parent');
    assert.equal(mapOpened.context.continuationCommands.length, 2);
    assert.deepEqual(mapPage.list.map(command => command.code), [357, 657, 230]);
    assert.equal(mapPage.list[2], mapBoundary);

    const DatabaseCommonEventEditor = loadBrowserEditor(
        'src/database/DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor');
    const common = Object.create(DatabaseCommonEventEditor.prototype);
    common._eventCommandListClass = () => EventCommandList;
    common.getEditor = () => ({ show: (command, callback) => {
        assert.equal(command.code, 357);
        callback([{ code: 356, indent: 0, parameters: ['Legacy'] }]);
    } });
    common.persistEvent = () => {};
    const commonBoundary = boundary();
    const event = { list: [pluginParent(2), continuation('old 1', 2), continuation('old 2', 2), commonBoundary] };
    common.editCommand(2, event);
    assert.deepEqual(event.list.map(command => command.code), [356, 230],
        'changing to MV removes every stale 657');
    assert.equal(event.list[1], commonBoundary);

    const DatabaseTroopEditor = loadBrowserEditor(
        'src/database/DatabaseTroopEditor.js', 'DatabaseTroopEditor');
    const troop = Object.create(DatabaseTroopEditor.prototype);
    troop._eventCommandListClass = () => EventCommandList;
    troop.getCommandEditor = () => ({ show: (command, callback) => {
        assert.equal(command.code, 357);
        callback([pluginParent(0)]);
    } });
    troop.persistTroop = () => {};
    const troopBoundary = boundary();
    const page = { list: [pluginParent(2), continuation('old 1', 2), continuation('old 2', 2), troopBoundary] };
    troop.editCommandSimple(page.list[1], 1, page);
    assert.deepEqual(page.list.map(command => command.code), [357, 230],
        'arguments disappearing removes every stale 657');
    assert.equal(page.list[1], troopBoundary);
});

test('Reactor-specific 357 editing also sweeps stale argument rows', () => {
    const list = Object.create(EventCommandList.prototype);
    list._reactorCommandEditor = () => ({
        show: (_command, callback) => callback({
            code: 357,
            indent: 0,
            parameters: ['RPGReactor', 'CallUserInterface', 'Call User Interface', { interfaceId: '4' }]
        })
    });
    list.refreshCommandList = () => {};
    const after = { code: 230, indent: 1, parameters: [5] };
    const page = { list: [
        {
            code: 357,
            indent: 1,
            parameters: ['RPGReactor', 'CallUserInterface', 'Call User Interface', { interfaceId: '3' }]
        },
        continuation('Interface = 3', 1),
        after
    ] };

    list.editCommand(1, page, 0);
    assert.deepEqual(page.list.map(command => command.code), [357, 230]);
    assert.equal(page.list[0].indent, 1);
    assert.equal(page.list[1], after);
});
