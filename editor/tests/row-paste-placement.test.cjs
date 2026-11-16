// The trait table is written out on six pages and the effect table on two. Paste puts the row
// after the selected one on all six trait tables (at the end with none selected), through one
// shared function; both effect tables have Copy and Paste buttons under them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', 'src', 'database', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const Clipboard = vm.runInNewContext(`${read('DatabaseRowClipboard.js')}\nDatabaseRowClipboard;`, { console });

test('a pasted row goes after the selected row, or at the end', () => {
    const rows = ['a', 'b', 'c'];
    assert.equal(Clipboard.insertPasted(rows, 0, 'x'), 1);
    assert.deepEqual(rows, ['a', 'x', 'b', 'c']);
    assert.equal(Clipboard.insertPasted(rows, null, 'y'), 4);
    assert.deepEqual(rows, ['a', 'x', 'b', 'c', 'y']);
    Clipboard.insertPasted(rows, 4, 'z');
    assert.deepEqual(rows, ['a', 'x', 'b', 'c', 'y', 'z'], 'after the last row');
    Clipboard.insertPasted(rows, 99, 'w');
    assert.equal(rows[rows.length - 1], 'w', 'a selection that is no row is no selection');
    const empty = [];
    Clipboard.insertPasted(empty, undefined, 'only');
    assert.deepEqual(empty, ['only']);
});

const PAGES = [
    ['DatabaseActorEditor', 'currentActor'], ['DatabaseClassEditor', 'currentClass'], ['DatabaseWeaponEditor', 'currentWeapon'],
    ['DatabaseArmorEditor', 'currentArmor'], ['DatabaseEnemyEditor', 'currentEnemy'], ['DatabaseStateEditor', 'currentState']
];

/** A page's own pasteTrait, run on a record with three traits; the clipboard holds trait 9. */
async function paste(className, current, selected, traits = [{ code: 1 }, { code: 2 }, { code: 3 }]) {
    const stub = {
        capturePasteTarget: Clipboard.capturePasteTarget, isPasteTargetCurrent: Clipboard.isPasteTargetCurrent, insertPasted: Clipboard.insertPasted,
        read: async () => ({ row: { code: 9 } }), showError() { throw new Error('no error expected'); }
    };
    const Editor = vm.runInNewContext(`${read(className + '.js')}\n${className};`, { console, window: {}, document: {}, DatabaseRowClipboard: stub });
    const record = { id: 1, ...(traits ? { traits } : null) };
    const page = Object.create(Editor.prototype);
    page[current] = record;
    page.databaseManager = new Proxy({}, { get: (target, name) => (String(name).startsWith('update') ? () => {} : undefined) });
    page.projectManager = null;
    page.parentEditor = { showDatabaseDetail() {} };
    for (const name of Object.getOwnPropertyNames(Editor.prototype)) if (/^refresh\w+Detail$|^saveTraitRecord$/.test(name)) page[name] = () => {};
    await (selected === undefined ? page.pasteTrait(record) : page.pasteTrait(record, selected));
    return plain(record.traits).map(trait => trait.code);
}

for (const [className, current] of PAGES) {
    test(`${className}: Paste goes after the selected trait`, async () => {
        assert.deepEqual(await paste(className, current, 0), [1, 9, 2, 3]);
        assert.deepEqual(await paste(className, current, 2), [1, 2, 3, 9]);
        assert.deepEqual(await paste(className, current, null), [1, 2, 3, 9], 'no row selected: at the end');
    });
}

test('the four pages that pasted at the end hand the selected row to Paste from the button, Ctrl+V and the menu', async () => {
    for (const [className, current] of PAGES.slice(2)) {
        const source = read(className + '.js');
        assert.match(source, /this\.pasteTrait\(entry, this\.getSelectedTraitIndex\(table\)\);/, className + ': the button');
        assert.match(source, /this\.pasteTrait\(entry, idx\);/, className + ': Ctrl+V');
        assert.match(source, /label: 'Paste', action: \(\) => this\.pasteTrait\(\w+, traitIndex\)/, className + ': the menu');
        // A record that has no trait list yet still takes a paste.
        assert.deepEqual(await paste(className, current, undefined, null), [9], className);
    }
});

test('both effect tables have Copy and Paste buttons, wired to the page\'s own copy and paste', () => {
    for (const [file, record] of [['DatabaseSkillEditor.js', 'skill'], ['DatabaseItemEditor.js', 'item']]) {
        const source = read(file);
        const buttons = Array.from(/<div class="effect-action-buttons">([\s\S]*?)<\/div>/.exec(source)[1].matchAll(/class="effect-btn-(\w+) rr-btn-chip"( disabled)?>/g), m => m[1] + (m[2] ? ':off' : ''));
        assert.deepEqual(buttons, ['add', 'edit:off', 'copy:off', 'paste', 'delete:off'], file);

        const className = file.replace('.js', '');
        const Editor = vm.runInNewContext(`${source}\n${className};`, { console, window: {}, document: {} });
        const page = Object.create(Editor.prototype);
        const calls = [], handlers = {}, state = {};
        for (const name of ['addEffect', 'editEffect', 'copyEffect', 'pasteEffect', 'deleteEffect']) page[name] = (...args) => calls.push([name, ...args.slice(1)]);
        const button = name => state[name] || (state[name] = { disabled: false, addEventListener: (type, handler) => { handlers[name] = handler; } });
        const section = { querySelector: selector => button(selector.replace('.effect-btn-', '')) };
        let selected = null;
        const table = { querySelector: () => (selected === null ? null : { dataset: { effectIndex: String(selected) } }) };
        page.setupEffectActionButtons(section, table, { id: 1, effects: [] });
        // Nothing selected: Copy does nothing and is shown off; Paste works.
        page.updateEffectButtonStates(section, table);
        assert.equal(state.copy.disabled, true, record);
        assert.equal(state.paste.disabled, false, record);
        handlers.copy(); handlers.paste();
        assert.deepEqual(calls, [['pasteEffect']]);
        selected = 2;
        page.updateEffectButtonStates(section, table);
        assert.equal(state.copy.disabled, false);
        handlers.copy();
        assert.deepEqual(calls[1], ['copyEffect', 2]);
    }
});
