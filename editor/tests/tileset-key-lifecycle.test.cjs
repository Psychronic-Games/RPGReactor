const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

function fixture() {
    const button = mode => ({ dataset: { mode }, style: {}, attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(k, fn) { this[k] = fn; } });
    const buttons = ['passability', '4dir', 'ladder', 'bush', 'counter', 'damage', 'terrain', 'tile3d'].map(button);
    const close = button('close');
    const key = { style: {}, innerHTML: '', querySelectorAll: () => [], querySelector: () => close };
    const detail = { innerHTML: '' };
    const document = {
        getElementById: id => ({ 'flag-mode-key': key, 'database-detail': detail })[id],
        querySelectorAll: s => s === '.compact-flag-btn' ? buttons : [], removeEventListener() {}
    };
    const context = { document, window: {}, console };
    const Tileset = vm.runInNewContext(source('database/DatabaseTilesetEditor.js') + '\nDatabaseTilesetEditor', context);
    const Database = vm.runInNewContext(source('DatabaseEditorUI.js') + '\nDatabaseEditorUI', context);
    const editor = new Tileset(null, null, null, null);
    editor.refreshOverlays = () => {};
    editor.refreshTile3DPreview = () => {};
    editor.setupCompactEventListeners();
    editor.refreshFlagKey();
    return { editor, buttons, key, close, Tileset, Database };
}

test('every flag button toggles its key and selection off and on; Close also deselects', () => {
    const { editor, buttons, key, close } = fixture();
    for (const button of buttons) {
        button.click();
        assert.equal(editor.currentEditMode, button.dataset.mode);
        assert.equal(button.attrs['aria-pressed'], 'true');
        assert.equal(key.style.display, '');
        assert.match(key.innerHTML, /flag-key-close/);
        button.click();
        assert.equal(editor.currentEditMode, null);
        assert.equal(key.style.display, 'none');
        assert.equal(key.innerHTML, '');
        assert.ok(buttons.every(b => b.attrs['aria-pressed'] === 'false'));
        button.click();
        close.click();
        assert.equal(editor.currentEditMode, null);
        assert.equal(key.style.display, 'none');
    }
});

test('mode changes abandon pending paint gestures and reset leaves authored flags intact', () => {
    const { editor, buttons } = fixture();
    editor.currentTileset = { flags: [0, 15, 16, 32, 4096] };
    const before = JSON.stringify(editor.currentTileset);
    buttons[0].click();
    editor.passageBrush = 'x';
    editor._passageBrushDrag = { imageIndex: 5 };
    buttons[1].click();
    assert.equal(editor.passageBrush, null);
    assert.equal(editor._passageBrushDrag, null);
    buttons[7].click();
    editor._tile3dDrag = { imageIndex: 5 };
    editor.selected3dRect = { x: 1 };
    editor.tile3dTool = 'object';
    editor.resetFlagEditing();
    assert.equal(editor._tile3dDrag, null);
    assert.equal(editor.selected3dRect, null);
    assert.equal(editor.tile3dTool, 'select');
    assert.equal(JSON.stringify(editor.currentTileset), before);
});

test('database detail cleanup and close reset the nested compact editor before reopening', () => {
    const { editor, buttons, key, Tileset, Database } = fixture();
    const wrapper = new Tileset(null, null, null, null);
    wrapper.tilesetEditor = editor;
    const db = Object.create(Database.prototype);
    db.tilesetEditor = wrapper;
    db.closeDatabaseActionMenu = () => {};
    db.setDatabaseSaveInFlight = () => {};
    for (const leave of ['cleanupDatabaseDetail', 'closeDatabaseViewer']) {
        buttons[0].click();
        editor.passageBrush = 'star';
        db[leave]();
        assert.equal(editor.currentEditMode, null);
        assert.equal(editor.passageBrush, null);
        editor.refreshFlagKey();
        assert.equal(key.style.display, 'none');
    }
});
