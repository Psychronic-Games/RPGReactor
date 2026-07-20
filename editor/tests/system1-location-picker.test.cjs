const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const system1Path = path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js');

function loadEditor() {
    const source = fs.readFileSync(system1Path, 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseSystem1Editor;`, {
        console,
        window: {}
    });
}

test('System 1 applies player and vehicle start-location triplets together', () => {
    const DatabaseSystem1Editor = loadEditor();
    const editor = Object.create(DatabaseSystem1Editor.prototype);
    const system = {
        startMapId: 1,
        startX: 2,
        startY: 3,
        boat: { characterName: 'Vehicles', characterIndex: 0, startMapId: 0, startX: 0, startY: 0 }
    };

    assert.equal(editor.applyStartLocation(system, 'player', { mapId: 8, x: 11, y: 14 }), true);
    assert.deepEqual(
        [system.startMapId, system.startX, system.startY],
        [8, 11, 14]
    );

    assert.equal(editor.applyStartLocation(system, 'boat', { mapId: 9, x: 4, y: 7 }), true);
    assert.deepEqual(
        [system.boat.startMapId, system.boat.startX, system.boat.startY],
        [9, 4, 7]
    );
    assert.equal(system.boat.characterName, 'Vehicles');
    assert.equal(editor.applyStartLocation(system, 'invalid', { mapId: 2, x: 0, y: 0 }), false);
});

test('System 1 visual location browsing commits only through picker confirmation', () => {
    const DatabaseSystem1Editor = loadEditor();
    const editor = Object.create(DatabaseSystem1Editor.prototype);
    let pickerOptions = null;
    editor.locationPicker = {
        showMapPicker(options) {
            pickerOptions = options;
        }
    };

    const fields = { mapId: {}, x: {}, y: {} };
    const row = {
        dataset: { posOwner: 'ship' },
        querySelector(selector) {
            return fields[selector.match(/"(.+)"/)[1]];
        }
    };
    const container = { querySelectorAll: () => [row] };
    const system = {
        ship: { characterName: 'Ship', characterIndex: 1, startMapId: 3, startX: 5, startY: 6 }
    };

    editor.showStartLocationPicker(system, 'ship', container);
    assert.deepEqual(
        [system.ship.startMapId, system.ship.startX, system.ship.startY],
        [3, 5, 6],
        'opening or cancelling the picker must not mutate System data'
    );

    pickerOptions.onConfirm({ mapId: 12, x: 20, y: 21 });
    assert.deepEqual(
        [system.ship.startMapId, system.ship.startX, system.ship.startY],
        [12, 20, 21]
    );
    assert.deepEqual(
        [fields.mapId.value, fields.x.value, fields.y.value],
        [12, 20, 21]
    );
});

test('Transfer Player keeps picker edits local and System 1 uses shared title browsing', () => {
    const transferSource = fs.readFileSync(
        path.join(editorRoot, 'src', 'event', 'commands', 'TransferPlayerEditor.js'),
        'utf8'
    );
    const systemSource = fs.readFileSync(system1Path, 'utf8');
    const dbUiSource = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const mainSource = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');

    assert.match(transferSource, /const selection = \{/);
    assert.match(transferSource, /const confirmedLocation = \{ \.\.\.selection \}/);
    assert.match(transferSource, /if \(options\.onConfirm\)/);
    assert.match(transferSource, /cancelBtn\.addEventListener\('click', closePicker\)/);
    assert.match(transferSource, /const expandedMapIds = new Set/);
    assert.match(transferSource, /const generation = \+\+mapLoadGeneration/);
    assert.match(transferSource, /if \(generation !== mapLoadGeneration\) return false/);
    assert.match(systemSource, /new TransferPlayerEditor\(databaseManager, projectManager\)/);
    assert.equal((systemSource.match(/class="system-pos-picker-btn/g) || []).length, 1);
    assert.match(systemSource, /\['boat', 'ship', 'airship'\]\.includes\(ownerKey\)/);
    assert.match(systemSource, /ownerKey === 'player'/);
    assert.match(systemSource, /RRPickerIndex\.createBrowser\(\{/);
    assert.match(systemSource, /files: files\.map\(file => file\.name\)/);
    assert.match(dbUiSource, /get tilemapManager\(\)/);
    assert.equal((mainSource.match(/getTilemapManager: \(\) => this\.projectController\.getTilemapManager\(\)/g) || []).length, 2);
});
