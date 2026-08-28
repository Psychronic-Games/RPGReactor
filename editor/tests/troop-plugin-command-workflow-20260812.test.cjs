const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadTroopEditor() {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    class EditorStub {}
    class PluginCommandEditorStub {}
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null },
        window: {},
        PluginCommandEditor: PluginCommandEditorStub,
    };
    for (const name of [
        'CommonEventEditor', 'ControlVariablesEditor', 'ShowPictureEditor',
        'MovePictureEditor', 'ErasePictureEditor', 'ForceActionEditor',
        'ConditionalBranchEditor', 'LoopEditor'
    ]) context[name] = EditorStub;
    const DatabaseTroopEditor = vm.runInNewContext(`${source}\nDatabaseTroopEditor;`, context);
    return { DatabaseTroopEditor, PluginCommandEditorStub };
}

function makeEditor(DatabaseTroopEditor, PluginCommandEditorStub, pickedCode) {
    const calls = [];
    const editor = Object.create(DatabaseTroopEditor.prototype);
    editor.commandPicker = { show: callback => callback({ code: pickedCode }) };
    editor.selectedCommandIndices = [];
    editor._eventCommandListClass = () => ({
        safeInsertionIndex: (list, index) => index,
        insertionIndent: () => 2,
        rebaseInsertIndent: (commands, indent) => commands.forEach(command => { command.indent = indent; }),
        commandBlock: value => Array.isArray(value) ? value : value ? [value] : [],
        contiguousBlockRange(list, index, parentCode, continuationCode) {
            let start = index;
            while (start > 0 && list[start].code === continuationCode) start--;
            if (list[start].code !== parentCode) return null;
            let end = start;
            while (list[end + 1]?.code === continuationCode) end++;
            return { start, end };
        },
        replaceContiguousBlock(list, index, replacement, parentCode, continuationCode) {
            const range = this.contiguousBlockRange(list, index, parentCode, continuationCode);
            const commands = this.commandBlock(replacement);
            this.rebaseInsertIndent(commands, list[range.start].indent || 0);
            list.splice(range.start, range.end - range.start + 1, ...commands);
        },
        generatedCommand: () => null,
        pictureEditorFor: () => null,
    });
    editor.getCommandEditor = (name, EditorClass) => {
        calls.push({ name, EditorClass });
        return {
            show(command, callback) {
                calls.push({ command });
                callback({ code: pickedCode, indent: 0, parameters: [`edited-${pickedCode}`] });
            }
        };
    };
    editor.persistTroop = () => { editor.persisted = (editor.persisted || 0) + 1; };
    return { editor, calls, PluginCommandEditorStub };
}

test('Troop insertion opens PluginCommandEditor for event command codes 356 and 357', () => {
    const { DatabaseTroopEditor, PluginCommandEditorStub } = loadTroopEditor();

    for (const code of [356, 357]) {
        const { editor, calls } = makeEditor(DatabaseTroopEditor, PluginCommandEditorStub, code);
        const page = { list: [{ code: 0, indent: 0, parameters: [] }] };

        editor.insertNewCommand(page, 0);

        assert.equal(calls[0].name, 'pluginCommand');
        assert.equal(calls[0].EditorClass, PluginCommandEditorStub);
        assert.equal(calls[1].command, null);
        assert.equal(page.list[0].code, code);
        assert.equal(page.list[0].indent, 2);
        assert.equal(editor.persisted, 1);
    }
});

test('Troop editing replaces codes 356 and 357 through PluginCommandEditor', () => {
    const { DatabaseTroopEditor, PluginCommandEditorStub } = loadTroopEditor();

    for (const code of [356, 357]) {
        const { editor, calls } = makeEditor(DatabaseTroopEditor, PluginCommandEditorStub, code);
        const original = { code, indent: 3, parameters: ['before'] };
        const page = { list: [original, { code: 0, indent: 0, parameters: [] }] };

        editor.editCommandSimple(original, 0, page);

        assert.equal(calls[0].name, 'pluginCommand');
        assert.equal(calls[0].EditorClass, PluginCommandEditorStub);
        assert.equal(calls[1].command, original);
        assert.equal(page.list[0].code, code);
        assert.equal(page.list[0].indent, 3, 'replacement keeps its battle-event nesting');
        assert.deepEqual(Array.from(page.list[0].parameters), [`edited-${code}`]);
        assert.equal(editor.persisted, 1);
    }
});
