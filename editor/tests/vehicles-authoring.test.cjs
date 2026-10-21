'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const editor = path.resolve(__dirname, '..');
const RRJson = require('../src/utils/JsonFiles.js');
const bindings = require('../src/database/Database3DBindings.js');
const source = fs.readFileSync(path.join(editor, 'src/DatabaseManager.js'), 'utf8');
const DatabaseManager = vm.runInNewContext(source + '\nDatabaseManager;', {
    RRJson, RRDatabase3DBindings: bindings, process, require, nw: {},
    console: { log() {}, warn() {}, error() {} }
});
function project(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-vehicle-authoring-'));
    fs.mkdirSync(path.join(dir, 'data'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const manager = new DatabaseManager(); manager.fs = fs; manager.path = path;
    return { dir, manager, file: path.join(dir, 'data/ReactorVehicles.json') };
}
test('stock vehicles lead the unified list without renumbering or creating Reactor types', () => {
    const VehicleEditor = require('../src/database/DatabaseVehicleEditor.js');
    const custom = {id: 1, name: 'Existing Motorcycle'};
    const manager = {getVehicles: () => [custom]};
    const rows = VehicleEditor.listEntries(manager);
    assert.deepEqual(rows.slice(0, 3).map(row => row.name), ['Boat', 'Ship', 'Airship']);
    assert.deepEqual(rows.slice(0, 3).map(row => row.stockVehicle), ['boat', 'ship', 'airship']);
    assert.equal(rows[3], custom);
    assert.equal(custom.id, 1);
});
test('a project without vehicles stays optional; authored class and equipment survive saving and reopening', async t => {
    const {dir, manager, file} = project(t);
    assert.equal(await manager.loadAllData(dir), true);
    assert.equal(await manager.saveAllData(dir), true);
    assert.equal(fs.existsSync(file), false);
    manager.data.vehicles.push({ id: 1, name: 'Bike', kind: 'motorcycle', model: { name: 'Vehicles/Bike', size: 3 }, classId: 2, initialLevel: 4, equips: [7, 9] });
    assert.ok(manager.getDirtyKeys().includes('vehicles'));
    assert.equal(await manager.saveAllData(dir), true);
    assert.equal(await manager.loadAllData(dir), true);
    assert.deepEqual(JSON.parse(JSON.stringify(manager.getVehicle(1))), JSON.parse(fs.readFileSync(file))[1]);
    assert.deepEqual([...manager.getDirtyKeys()], []);
});
test('malformed vehicle data refuses a load and preserves the current project in memory', async t => {
    const {dir, manager, file} = project(t);
    assert.equal(await manager.loadAllData(dir), true);
    manager.data.vehicles.push({ id: 1, name: 'Unsaved vehicle' });
    const before = JSON.stringify(manager.data);
    fs.writeFileSync(file, '{"unexpected":"shape"}');
    assert.equal(await manager.loadAllData(dir), false);
    assert.equal(JSON.stringify(manager.data), before);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"unexpected":"shape"}');
});
test('Database Cancel restores vehicle loadouts and class equipment traits together', async t => {
    const {dir, manager} = project(t);
    assert.equal(await manager.loadAllData(dir), true);
    manager.data.vehicles = [null, {id: 1, name: 'Bike', classId: 1, equips: [2]}];
    manager.data.classes = [null, {id: 1, name: 'Bike class', traits: [{code:51,dataId:1,value:1}]}];
    const UI = vm.runInNewContext(fs.readFileSync(path.join(editor, 'src/DatabaseEditorUI.js'), 'utf8') + '\nDatabaseEditorUI;', { console, RRDatabase3DBindings: bindings });
    const ui = {databaseManager: manager, currentProject: null, _dataSnapshot: JSON.stringify(manager.data)};
    manager.data.vehicles[1].equips[0] = 3;
    manager.data.classes[1].traits.push({code:55,dataId:1,value:1});
    UI.prototype.revertDatabaseSnapshot.call(ui);
    assert.deepEqual([...manager.data.vehicles[1].equips], [2]);
    assert.deepEqual(JSON.parse(JSON.stringify(manager.data.classes[1].traits)), [{code:51,dataId:1,value:1}]);
});
test('a vehicle-only model survives web distribution asset pruning', t => {
    const {dir, file} = project(t);
    fs.writeFileSync(path.join(dir, 'data/Actors.json'), '[null]');
    fs.writeFileSync(file, JSON.stringify([null, {id:1, model:{name:'Vehicles/Bike'}}]));
    for (const name of ['Bike', 'Unused']) {
        const target = path.join(dir, '3d/Vehicles', name, 'source');
        fs.mkdirSync(target, {recursive:true}); fs.writeFileSync(path.join(target, 'model.glb'), 'fixture');
    }
    const worker = fs.readFileSync(path.join(editor, 'build-scripts/dist-editor-worker.js'), 'utf8');
    const code = worker.slice(worker.indexOf('function trimWebProject('), worker.indexOf('function refreshStarterRuntime('));
    const trim = vm.runInNewContext(code + '\ntrimWebProject;', {fs, path, walkWebFiles: () => [{type:'file'}]});
    trim(dir, () => {});
    assert.equal(fs.existsSync(path.join(dir, '3d/Vehicles/Bike/source/model.glb')), true);
    assert.equal(fs.existsSync(path.join(dir, '3d/Vehicles/Unused')), false);
});
