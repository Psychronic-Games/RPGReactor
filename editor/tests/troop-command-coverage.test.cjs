const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));

/**
 * Every command the picker offers. Both hosts read this same list, so it is the
 * only honest denominator for "does a troop page have a dialog for this".
 */
function offeredCodes() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandPicker.js'), 'utf8');
    return [...new Set([...source.matchAll(/code:\s*(\d+)/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
}

// Commands a battle page cannot meaningfully target: both address a character on
// the map. They are offered by the picker and still fall through to the raw
// parameter editor, which is a picker question rather than a dialog one.
const MAP_ONLY = new Set([205, 213]);

function loadTroopEditor() {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    class EditorStub {}
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null },
        window: {},
        EventCommandList
    };
    for (const name of [
        'CommonEventEditor', 'ControlVariablesEditor', 'ShowPictureEditor',
        'MovePictureEditor', 'ErasePictureEditor', 'ForceActionEditor',
        'ConditionalBranchEditor', 'LoopEditor', 'AudioCommandEditor',
        'ChangeVehicleBGMEditor', 'PluginCommandEditor', 'MessageCommandEditor',
        'VideoSurfaceEditor'
    ]) context[name] = EditorStub;
    const DatabaseTroopEditor = vm.runInNewContext(`${source}\nDatabaseTroopEditor;`, context);
    // The class closes over the context's own document, so the recording one has
    // to be installed there rather than on Node's global.
    return { DatabaseTroopEditor, context };
}

/**
 * A troop editor whose every route out is recorded. `raw` goes true if the
 * command reached the raw-parameters JSON textarea, which is the failure this
 * whole test exists to catch.
 */
function makeEditor(DatabaseTroopEditor, code) {
    const opened = [];
    const editor = Object.create(DatabaseTroopEditor.prototype);
    const dialog = name => ({
        show(...args) {
            opened.push({ name, args: args.length });
            const callback = args.find(a => typeof a === 'function');
            if (callback) callback(null); // cancel: the dialog opened, nothing else matters
        }
    });
    editor.databaseManager = { getEnemies: () => [], getStates: () => [] };
    editor.currentTroop = { members: [] };
    editor.currentBattlePageIndex = 0;
    editor.commandPicker = { show: callback => callback({ code }) };
    editor.selectedCommandIndices = [];
    editor.persistTroop = () => {};
    editor.renderCommandList = () => {};
    editor.getCommandEditor = name => dialog(name);
    editor.commandDialogs = () => new Proxy({
        selectedIndices: [],
        editCommand: (...args) => opened.push({ name: 'delegated editCommand', args: args.length })
    }, {
        get: (target, prop) => prop in target ? target[prop] : dialog(String(prop))
    });
    // The raw JSON fallback is the only route that builds a textarea.
    let raw = false;
    editor.escapeHTML = value => String(value);
    editor.createButton = () => ({ addEventListener() {} });
    editor.getCommandDisplay = () => ({ name: 'x', color: '', description: '' });
    const doc = {
        createElement: tag => {
            if (tag === 'textarea') raw = true;
            return {
                style: {}, classList: { add() {} }, dataset: {},
                appendChild() {}, addEventListener() {}, querySelector: () => ({ addEventListener() {} }),
                set innerHTML(_v) {}, get innerHTML() { return ''; }
            };
        },
        getElementById: () => null,
        body: { appendChild() {}, removeChild() {} }
    };
    return { editor, opened, doc, wasRaw: () => raw };
}

function withDocument(context, doc, run) {
    const previous = context.document;
    context.document = doc;
    try { return run(); } finally { context.document = previous; }
}

test('every command a troop page offers reaches a dialog, not the raw parameter box', () => {
    const { DatabaseTroopEditor, context } = loadTroopEditor();
    const missing = { insert: [], edit: [] };

    for (const code of offeredCodes()) {
        if (MAP_ONLY.has(code)) continue;

        const ins = makeEditor(DatabaseTroopEditor, code);
        withDocument(context, ins.doc, () => ins.editor.insertNewCommand({ list: [{ code: 0, indent: 0, parameters: [] }] }, 0));
        if (!ins.opened.length && !EventCommandList.isNoParamCommand(code)) missing.insert.push(code);

        const edt = makeEditor(DatabaseTroopEditor, code);
        const command = { code, indent: 0, parameters: [] };
        withDocument(context, edt.doc, () => edt.editor.editCommandSimple(command, 0, { list: [command, { code: 0, indent: 0, parameters: [] }] }));
        if (edt.wasRaw()) missing.edit.push(code);
    }

    assert.deepEqual(missing.insert, [], 'commands that open no dialog when inserted into a battle page');
    assert.deepEqual(missing.edit, [], 'commands that open the raw parameter box when double-clicked');
});

test('the two hosts dispatch the shared table, so neither can gain a command the other lacks', () => {
    // 72 dialogs plus the commands with nothing to configure. If a code is added
    // to SIMPLE_COMMAND_EDITORS it works in both hosts at once; that is the
    // property this table exists for.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    const rows = [...source.matchAll(/^    (\d{3}): \['(\w+)'/gm)].map(m => Number(m[1]));
    assert.equal(rows.length, 72);
    assert.equal(new Set(rows).size, 72, 'no code appears twice');

    for (const code of rows) {
        const entry = EventCommandList.simpleCommandEditor(code);
        assert.ok(entry && entry.editor, `code ${code} resolves to an editor`);
    }
    assert.equal(EventCommandList.simpleCommandEditor(101), null, 'Show Text is a run, not a single command');
    assert.equal(EventCommandList.simpleCommandEditor(999), null);

    // Both hosts must read the table rather than keep a private list beside it.
    const troop = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    assert.match(troop, /simpleCommandEditor\(code\)/);
    assert.match(source, /EventCommandList\.simpleCommandEditor\(code\)/);
});

test('the actor commands a battle page authors open their own dialogs', () => {
    // The five in the report, by name: Change HP, Change MP, Change TP,
    // Change State, Recover All. Each inserted a command with default (or, for
    // Change TP, empty) parameters and then showed a JSON textarea.
    const expected = {
        311: 'changeHPEditor', 312: 'changeMPEditor', 326: 'changeTPEditor',
        313: 'changeStateEditor', 314: 'recoverAllEditor'
    };
    for (const [code, editor] of Object.entries(expected)) {
        assert.equal(EventCommandList.simpleCommandEditor(Number(code)).editor, editor);
    }

    const { DatabaseTroopEditor, context } = loadTroopEditor();
    for (const code of Object.keys(expected).map(Number)) {
        const { editor, opened, doc, wasRaw } = makeEditor(DatabaseTroopEditor, code);
        const command = { code, indent: 3, parameters: [] };
        withDocument(context, doc, () => editor.editCommandSimple(command, 0, { list: [command, { code: 0, indent: 0, parameters: [] }] }));
        assert.equal(wasRaw(), false, `code ${code} still opens the raw parameter box`);
        assert.equal(opened[0].name, expected[code]);
    }
});
