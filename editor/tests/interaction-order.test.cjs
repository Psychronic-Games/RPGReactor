const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function load(file, name, globals = {}) {
    const source = fs.readFileSync(path.join(process.env.RR_INTERACTION_SOURCE_ROOT || path.join(__dirname, '../src'), file), 'utf8');
    return vm.runInNewContext(source + '\n' + name, { console, ...globals });
}

for (const kind of ['Actor', 'Class']) {
    test(`${kind}: deferred field setup cannot attach after its form is retired`, () => {
        const timers = [];
        const Editor = load(`database/Database${kind}Editor.js`, `Database${kind}Editor`, { setTimeout: fn => timers.push(fn) });
        const editor = Object.create(Editor.prototype);
        let attached = 0, queries = 0;
        const form = {
            isConnected: true,
            querySelectorAll() { queries++; return [{ addEventListener() { attached++; } }]; },
            querySelector() { return null; }
        };
        editor.attachEventListeners(form, { id: 1 });
        form.isConnected = false;
        timers.splice(0).forEach(fn => fn());
        assert.equal(queries, 0, 'retired forms cannot query the replacement view');
        assert.equal(attached, 0);
        const live = { ...form, isConnected: true };
        editor.attachEventListeners(live, { id: 2 });
        timers.splice(0).forEach(fn => fn());
        assert.ok(attached > 0, 'the current form still receives its field handlers');
    });
}

function commandFixture() {
    let keydown;
    const modal = { style: { display: 'flex' } };
    const document = {
        addEventListener(name, fn) { if (name === 'keydown') keydown = fn; },
        getElementById(id) { return id === 'event-editor-modal' ? modal : null; }
    };
    const Commands = load('event/EventCommandList.js', 'EventCommandList', { document });
    const list = Object.create(Commands.prototype);
    const root = { isConnected: true, contains: target => target.inCommands === true };
    const actions = [];
    Object.assign(list, {
        _commandListRoot: root, currentPage: { list: [{ code: 118 }, { code: 230 }, { code: 0 }] },
        currentPageIndex: 0, selectedIndices: [0],
        deleteCommands() { actions.push('delete'); },
        cutCommands() { actions.push('cut'); },
        copyCommands() { actions.push('copy'); },
        pasteCommands() { actions.push('paste'); },
        updateSelectionStyles() { actions.push('selection'); }
    });
    list.setupKeyboardShortcuts();
    const press = (key, options = {}) => {
        const event = { key, target: { tagName: 'DIV', inCommands: true },
            preventDefault() { this.defaultPrevented = true; }, ...options };
        keydown(event);
        return event;
    };
    return { list, root, actions, press, modal };
}

for (const [label, target] of [
    ['page settings', { tagName: 'BUTTON' }],
    ['another dialog', { tagName: 'DIV' }],
    ['a text field', { tagName: 'INPUT', inCommands: true }],
    ['a dropdown', { tagName: 'SELECT', inCommands: true }],
    ['editable content', { tagName: 'DIV', inCommands: true, isContentEditable: true }]
]) {
    test(`event commands: shortcuts in ${label} cannot change the command list`, () => {
        const { press, actions, list } = commandFixture();
        for (const key of ['Delete', 'a', 'c', 'x', 'v']) {
            press(key, { target, ctrlKey: key !== 'Delete' });
        }
        assert.deepEqual(actions, []);
        assert.deepEqual(list.selectedIndices, [0]);
    });
}

test('event commands: a consumed key, detached list or closed editor cannot reactivate shortcuts', () => {
    const { root, modal, press, actions } = commandFixture();
    press('Delete', { defaultPrevented: true });
    root.isConnected = false;
    press('Delete');
    root.isConnected = true;
    modal.style.display = 'none';
    press('Delete');
    assert.deepEqual(actions, []);
});

test('event commands: focused list shortcuts work and Select All updates visible selection', () => {
    const { press, actions, list } = commandFixture();
    for (const key of ['Delete', 'c', 'x', 'v', 'a']) {
        assert.equal(press(key, { ctrlKey: key !== 'Delete' }).defaultPrevented, true);
    }
    assert.deepEqual(actions, ['delete', 'copy', 'cut', 'paste', 'selection']);
    assert.deepEqual(Array.from(list.selectedIndices), [0, 1]);
});

test('database navigation retires a modal through its disposer and invalidates queued actions', () => {
    const UI = load('DatabaseEditorUI.js', 'DatabaseEditorUI', {
        document: { getElementById: () => null }, window: {}
    });
    const ui = Object.create(UI.prototype);
    Object.assign(ui, {
        _detailGeneration: 0, currentProject: { path: '/one' }, databaseManager: { dataGeneration: 1 },
        closeDatabaseActionMenu() {}
    });
    const modal = { isConnected: true, remove() { this.isConnected = false; } };
    let listeners = 1;
    const current = ui.registerDetailModal(modal, () => { listeners--; modal.remove(); });
    assert.equal(current(), true);
    ui.cleanupDatabaseDetail();
    assert.equal(current(), false);
    assert.equal(listeners, 0);
    assert.equal(modal.inert, true);
    ui.cleanupDatabaseDetail();
    assert.equal(listeners, 0, 'repeated cleanup does not dispose twice');
});
