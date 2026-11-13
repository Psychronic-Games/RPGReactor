// Two small gaps on the System 1 and Tilesets pages (owner's decisions, 2026-11-12):
// a vehicle's typed start position is kept when its block is missing from System.json, and
// a sheet name stored with ".png" is not given a second one.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', 'src', 'database', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

test('a vehicle\'s Map, X or Y typed while its block is missing is kept', () => {
    const Editor = vm.runInNewContext(`${read('DatabaseSystem1Editor.js')}\nDatabaseSystem1Editor;`, { console, window: {} });
    const system = { startMapId: 1, startX: 2, startY: 3, ship: { characterName: 'Vehicle', characterIndex: 1, startMapId: 4, startX: 5, startY: 6 } };
    assert.equal(Editor.setStartField(system, 'boat.startMapId', '7'), true);
    assert.deepEqual(plain(system.boat), { characterName: '', characterIndex: 0, startMapId: 7 }, 'the block Browse would make, with the number typed');
    assert.equal(Editor.setStartField(system, 'boat.startX', '12'), true);
    assert.equal(system.boat.startX, 12);
    // A block that is there keeps everything else it has; the player's own row is as before.
    Editor.setStartField(system, 'ship.startY', '9');
    assert.deepEqual(plain(system.ship), { characterName: 'Vehicle', characterIndex: 1, startMapId: 4, startX: 5, startY: 9 });
    Editor.setStartField(system, 'startX', '21');
    assert.equal(system.startX, 21);
    Editor.setStartField(system, 'startY', '');
    assert.equal(system.startY, 0, 'a cleared field is 0, as before');
    // Nothing else can be written through the row.
    assert.equal(Editor.setStartField(system, 'tank.startX', '1'), false);
    assert.equal(Editor.setStartField(system, 'boat.characterName', '1'), false);
    assert.equal('tank' in system, false);
});

test('a sheet name that already ends in .png is looked up as it is', () => {
    const asked = [];
    class Image { set src(value) { this._src = value; } get complete() { return true; } }
    const Editor = vm.runInNewContext(`${read('DatabaseTilesetEditor.js')}\nDatabaseTilesetEditor;`, { console, window: {}, document: {}, Image });
    const editor = Object.create(Editor.prototype);
    editor.fs = { existsSync: file => { asked.push(path.basename(file)); return true; } };
    editor.path = path;
    editor.getProjectPath = () => '/project';
    editor.assetUrl = file => 'file://' + file;
    editor.refreshTile3DPreview = () => {};
    editor.currentTileset = { tilesetNames: ['Outside_A1', 'World_B.png', ''] };
    assert.ok(editor.sheetImageFor(0));
    assert.ok(editor.sheetImageFor(1));
    assert.equal(editor.sheetImageFor(2), null);
    assert.deepEqual(asked, ['Outside_A1.png', 'World_B.png']);
});
