const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

/**
 * Three lists render event commands - the map event editor, troop battle pages
 * and common events - and each builds its own rows. They have drifted before:
 * 655 Script continuations were drawn in some and not others, and 657 plugin
 * arguments in none. These tests hold all three to the same answer about which
 * rows exist, which is the part that can be checked without a DOM.
 */
function loadEditor(file, className, extraGlobals = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', file), 'utf8');
    class Stub {}
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null },
        window: {},
        EventCommandList,
        ...extraGlobals
    };
    for (const name of [
        'CommonEventEditor', 'ControlVariablesEditor', 'ShowPictureEditor',
        'MovePictureEditor', 'ErasePictureEditor', 'ForceActionEditor',
        'ConditionalBranchEditor', 'LoopEditor', 'AudioCommandEditor',
        'ChangeVehicleBGMEditor', 'PluginCommandEditor', 'MessageCommandEditor',
        'MediaSurfaceEditor'
    ]) context[name] = Stub;
    return vm.runInNewContext(`${source}\n${className};`, context);
}

// 357 Plugin Command             0
//   657 argument                 1
//   657 argument                 2
// 108 Comment                    3
//   408 comment line             4
// 357 Plugin Command             5
//   657 argument                 6
const list = [
    { code: 357, indent: 0, parameters: ['P', 'cmd', 'First', { a: '1' }] },
    { code: 657, indent: 0, parameters: ['A = 1'] },
    { code: 657, indent: 0, parameters: ['B = 2'] },
    { code: 108, indent: 0, parameters: ['<Forced BGM>'] },
    { code: 408, indent: 0, parameters: [' Name: Battle8'] },
    { code: 357, indent: 0, parameters: ['P', 'cmd2', 'Second', { b: '2' }] },
    { code: 657, indent: 0, parameters: ['C = 3'] }
];

test('an argument row is attributed to the plugin command directly above it', () => {
    assert.equal(EventCommandList.pluginArgsOwnerIndex(list, 1), 0);
    assert.equal(EventCommandList.pluginArgsOwnerIndex(list, 2), 0);
    assert.equal(EventCommandList.pluginArgsOwnerIndex(list, 6), 5,
        'the second command owns its own row, not the first command\'s');

    // Everything that is not an argument row owns nothing and belongs to nothing.
    for (const index of [0, 3, 4, 5]) {
        assert.equal(EventCommandList.pluginArgsOwnerIndex(list, index), -1);
    }
    assert.equal(EventCommandList.pluginArgsOwnerIndex(list, 99), -1, 'past the end');
});

test('comment continuations are never hidden by the plugin-argument rule', () => {
    // 408 is a continuation too, and folding it away would hide the body of
    // every multi-line notetag block in the project.
    assert.equal(EventCommandList.pluginArgsOwnerIndex(list, 4), -1);
    assert.equal(EventCommandList.pluginArgsRowCount(list, 3), 0);
});

test('every command list starts with nothing expanded, and tracks it as a set', () => {
    const DatabaseTroopEditor = loadEditor('DatabaseTroopEditor.js', 'DatabaseTroopEditor');
    const DatabaseCommonEventEditor = loadEditor(
        'DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor');

    for (const Editor of [DatabaseTroopEditor, DatabaseCommonEventEditor]) {
        const editor = new Editor({}, {}, {}, null);
        const expanded = editor.expandedPluginCommands;
        // Duck-typed: the class is built in its own vm realm, so its Set is not
        // this realm's Set and `instanceof` would fail on a correct editor.
        assert.equal(typeof expanded?.has, 'function', `${Editor.name} tracks expansion`);
        assert.equal(typeof expanded?.add, 'function', `${Editor.name} can record an expansion`);
        assert.equal(expanded.size, 0, `${Editor.name} starts collapsed`);
    }
});

test('all three lists agree on which continuation rows they drop', () => {
    // A source check, not a render: these rows are built with innerHTML, which
    // the DOM stub used elsewhere in this suite does not implement. It catches
    // the drift that actually happened - one list gaining a rule the others did
    // not - rather than proving the rendered output.
    const sources = {
        'EventCommandList.js': fs.readFileSync(
            path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8'),
        'DatabaseTroopEditor.js': fs.readFileSync(
            path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8'),
        'DatabaseCommonEventEditor.js': fs.readFileSync(
            path.join(editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'), 'utf8')
    };

    for (const [name, source] of Object.entries(sources)) {
        assert.match(source, /code === 657/, `${name} gates plugin argument rows`);
        assert.match(source, /pluginArgs(OwnerIndex|Expanded)/,
            `${name} uses the shared owner lookup rather than its own scan`);
    }
});
