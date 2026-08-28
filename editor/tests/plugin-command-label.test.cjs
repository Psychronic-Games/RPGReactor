const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const editorPath = path.join(editorRoot, 'src', 'event', 'commands', 'PluginCommandEditor.js');
const editorSource = fs.readFileSync(editorPath, 'utf8');
const listSource = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');

/** Enough of a DOM for show() to build its modal without a browser. */
function stubNode() {
    const node = {
        style: {}, dataset: {}, classList: { add() {}, remove() {} },
        children: [], value: '', textContent: '', innerHTML: '',
        appendChild(child) { node.children.push(child); return child; },
        append(...kids) { node.children.push(...kids); },
        addEventListener() {}, removeEventListener() {},
        querySelector: () => stubNode(), querySelectorAll: () => [],
        remove() {}, focus() {}, setAttribute() {}, getAttribute: () => null
    };
    return node;
}

function loadEditor() {
    const document = {
        createElement: () => stubNode(),
        getElementById: () => null,
        body: stubNode(),
        addEventListener() {}
    };
    return vm.runInNewContext(`${editorSource}\nPluginCommandEditor;`, {
        console: { log() {}, warn() {}, error() {} },
        process, require, window: {}, document,
        RRPluginAnnotations: require(path.join(editorRoot, 'src', 'utils', 'PluginAnnotations.js'))
    });
}

const PluginCommandEditor = loadEditor();

function editorWith(state) {
    const instance = Object.create(PluginCommandEditor.prototype);
    instance.classicMode = false;
    instance.pluginName = '';
    instance.commandName = '';
    instance.commandText = '';
    instance.selectedCommand = null;
    instance.args = {};
    instance.existingArgumentCommands = [];
    return Object.assign(instance, state);
}

test('reopening a plugin command does not blank its display label', () => {
    // params[2] is the label RPG Maker shows in the event list. It used to be
    // written as a hard-coded '' with the loaded value never read, so opening an
    // authored command and pressing OK erased it in the saved project.
    const instance = editorWith({});
    instance.show(
        { code: 357, parameters: ['PSYCHRONIC_PTBS', 'PTBS_StartBattle', 'Start PTBS Battle', { id: 1 }] },
        () => {}
    );
    assert.equal(instance.commandText, 'Start PTBS Battle');

    const [rebuilt] = instance.buildCommand();
    assert.equal(rebuilt.parameters[2], 'Start PTBS Battle');
    assert.deepEqual({ ...rebuilt.parameters[3] }, { id: '1' });
});

test('the label comes from the plugin annotation when a command is picked', () => {
    // @text is already parsed into command.text for the dropdown, which is the
    // same string the engine stores.
    const instance = editorWith({
        pluginName: 'PSYCHRONIC_PTBS',
        commandName: 'setWinConditions',
        commandText: 'Start PTBS Battle', // stale: belongs to the previously loaded command
        selectedCommand: { name: 'setWinConditions', text: 'Set Win Conditions', args: [] }
    });
    assert.equal(instance.displayLabel(), 'Set Win Conditions');
});

test('a command whose plugin source is missing keeps the label it arrived with', () => {
    const instance = editorWith({
        pluginName: 'SomeMissingPlugin',
        commandName: 'doThing',
        commandText: 'Do The Thing',
        selectedCommand: null
    });
    assert.equal(instance.displayLabel(), 'Do The Thing');
});

test('a stale label is not carried onto a different command', () => {
    const instance = editorWith({
        commandName: 'newCommand',
        commandText: 'Old Label',
        selectedCommand: { name: 'previousCommand', text: 'Previous Label', args: [] }
    });
    // selectedCommand does not match commandName, so the annotation is not used;
    // the change handler clears commandText, and this is the belt-and-braces path.
    assert.equal(instance.displayLabel(), 'Old Label');
    assert.match(editorSource, /this\.commandText = \(this\.selectedCommand && this\.selectedCommand\.text\) \|\| '';/,
        'picking a command refreshes the label');
    assert.match(editorSource, /this\.commandName = '';\s*\n\s*this\.commandText = '';/,
        'and switching plugin clears it');
});

test('an MV-style classic command is unaffected', () => {
    const instance = editorWith({});
    instance.show({ code: 356, parameters: ['SomeText arg1 arg2'] }, () => {});
    assert.equal(instance.classicMode, true);
    const [rebuilt] = instance.buildCommand();
    assert.equal(rebuilt.code, 356);
    // Array.from: the editor runs in a vm realm, so its arrays are not
    // reference-comparable with this one.
    assert.deepEqual(Array.from(rebuilt.parameters), ['SomeText arg1 arg2']);
});

test('the placeholder that claimed the slot was unused is gone', () => {
    assert.doesNotMatch(editorSource, /params\[2\] is unused in MZ/);
    assert.match(editorSource, /this\.displayLabel\(\)/);
});

test('the command list shows the label rather than the internal command name', () => {
    const at = listSource.indexOf('case 357: {');
    assert.ok(at >= 0);
    const block = listSource.slice(at, at + 700);
    assert.match(block, /params\[2\]/);
    assert.match(block, /label \|\| params\[1\]/, 'with the internal name kept as a fallback');
    assert.match(block, /code === 357/, 'and 356 left alone, since MV has no such slot');
});
