// Renaming a model's variant: every use of that variant in the project is renamed with it,
// in the files and in the copies the editor holds. A use is an object with the model's
// `name` and the `variant` it wears, wherever it is kept.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const Panel = require('../src/database/ModelVariantsPanel.js');
const R = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js'));
const clone = value => JSON.parse(JSON.stringify(value));
const use = (variant, name = 'Vehicles/Tank') => ({ name, ext: '.glb', file: 'Tank', size: 2, ...(variant ? { variant } : null) });

// Each place the game reads a use from, in the shape its file has.
const mapSidecar = () => ({ events: { 3: { 0: use('Red'), 1: use('Blue') }, 4: { 0: use('Red', 'Vehicles/Car') } }, props: [Object.assign({ id: 1, x: 2, y: 3 }, use('Red')), Object.assign({ id: 2, x: 5, y: 5 }, use())] });
const bindings = () => ({ version: 1, actors: { 1: { character: use('Red'), battler: use('Blue') } }, weapons: { 2: use('Red') } });
const presentation = () => ({ version: 1, enemies: { 4: { graphic: { type: 'model', model: use('Red') } } } });
const sequences = () => [null, { id: 1, name: 'Shot', steps: [{ type: 'projectile', iconSource: 'model', model: use('Red') }] }];
const vehicles = () => [null, { id: 1, name: 'Tank', model: use('Red') }];
const plan = () => ({ name: 'Depot', size: [4, 4], props: [Object.assign({ x: 1, y: 1 }, use('Red'))] });

test('a use is renamed only for this model and this variant', () => {
    const data = mapSidecar();
    assert.equal(Panel.renameUses(data, 'Vehicles/Tank', 'Red', 'Crimson'), 2);
    assert.equal(data.events[3][0].variant, 'Crimson');
    assert.equal(data.events[3][1].variant, 'Blue', 'another variant of the model');
    assert.equal(data.events[4][0].variant, 'Red', 'another model\'s variant of the same name');
    assert.equal(data.props[0].variant, 'Crimson');
    assert.equal('variant' in data.props[1], false, 'a use of the model\'s own look gains nothing');
    assert.equal(Panel.renameUses(data, 'Vehicles/Tank', 'Red', 'Crimson'), 0);
});

test('the game reads the renamed uses under the new name', () => {
    const map = { reactor3d: mapSidecar() };
    Panel.renameUses(map.reactor3d, 'Vehicles/Tank', 'Red', 'Crimson');
    assert.equal(R.eventModelSpec(map, 3, 0).variant, 'Crimson');
    assert.equal(R.mapProps(map)[0].variant, 'Crimson');
});

test('every file that keeps uses is renamed, and files without one are not written', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-variant-rename-'));
    try {
        const data = path.join(root, 'data'), structures = path.join(root, '3d', 'Structures');
        fs.mkdirSync(data); fs.mkdirSync(structures, { recursive: true });
        const files = {
            [path.join(data, 'Map001.r3d.json')]: mapSidecar(),
            [path.join(data, 'Map002.r3d.json')]: { props: [Object.assign({ id: 1 }, use('Blue'))] },
            [path.join(data, 'Map003.r3d.json')]: { elevation: [0, 0, 1] },
            [path.join(data, 'Database.r3d.json')]: bindings(),
            [path.join(data, 'BattlePresentation.json')]: presentation(),
            [path.join(data, 'ActionSequences.json')]: sequences(),
            [path.join(data, 'ReactorVehicles.json')]: vehicles(),
            [path.join(structures, 'Depot.json')]: plan()
        };
        for (const [file, value] of Object.entries(files)) fs.writeFileSync(file, JSON.stringify(value));
        const written = [];
        const changed = Panel.renameUsesInFiles(root, 'Vehicles/Tank', 'Red', 'Crimson', fs, path, (file, text) => { written.push(path.basename(file)); fs.writeFileSync(file, text); });
        assert.deepEqual(written.sort(), ['ActionSequences.json', 'BattlePresentation.json', 'Database.r3d.json', 'Depot.json', 'Map001.r3d.json', 'ReactorVehicles.json']);
        assert.equal(changed.length, 6);
        const now = file => JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [file, before] of Object.entries(files)) {
            const expected = clone(before);
            Panel.renameUses(expected, 'Vehicles/Tank', 'Red', 'Crimson');
            assert.deepEqual(now(file), expected, path.basename(file) + ' holds the same data, renamed');
            assert.equal(JSON.stringify(now(file)).includes('"variant":"Red"'), path.basename(file) === 'Map001.r3d.json', 'only the other model\'s Red is left');
        }
        // A file that will not read is left as it is, and the rest are still done.
        fs.writeFileSync(path.join(data, 'Map004.r3d.json'), '{ "variant" broken');
        fs.writeFileSync(path.join(data, 'Map005.r3d.json'), JSON.stringify({ props: [use('Crimson')] }));
        const warn = console.warn; console.warn = () => {};
        try { assert.deepEqual(Panel.renameUsesInFiles(root, 'Vehicles/Tank', 'Crimson', 'Red', fs, path, (file, text) => fs.writeFileSync(file, text)).map(file => path.basename(file)).includes('Map005.r3d.json'), true); }
        finally { console.warn = warn; }
        assert.equal(fs.readFileSync(path.join(data, 'Map004.r3d.json'), 'utf8'), '{ "variant" broken');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the copies the editor holds follow, and what was saved still reads as saved', () => {
    const data = { modelBindings: bindings(), battlePresentation: presentation(), actionSequences: sequences(), vehicles: vehicles(), structures: [null, { id: 1, name: 'Depot', file: 'Depot.json', plan: plan() }] };
    const saved = {};
    const manager = {
        data, captured: [],
        // Vehicles has an unsaved edit of the author's; the rest are as saved.
        getDirtyKeys: () => ['vehicles'],
        captureSavedState(key) { this.captured.push(key); saved[key] = JSON.stringify(data[key]); }
    };
    const ui = { _dataSnapshot: JSON.stringify(data) };
    const map = { reactor3d: mapSidecar() };
    const tilemap = { currentMap: map, sidecarState() { return JSON.stringify(this.currentMap.reactor3d); } };
    tilemap.savedSidecarState = tilemap.sidecarState();
    const props = { model: use('Red') };
    Panel.renameUsesInMemory('Vehicles/Tank', 'Red', 'Crimson', { databaseManager: manager, databaseUI: ui, tilemapManager: tilemap, modelPropsManager: props });

    assert.equal(data.modelBindings.actors[1].character.variant, 'Crimson');
    assert.equal(data.battlePresentation.enemies[4].graphic.model.variant, 'Crimson');
    assert.equal(data.actionSequences[1].steps[0].model.variant, 'Crimson');
    assert.equal(data.vehicles[1].model.variant, 'Crimson');
    assert.equal(data.structures[1].plan.props[0].variant, 'Crimson');
    assert.deepEqual(manager.captured.sort(), ['actionSequences', 'battlePresentation', 'modelBindings', 'structures'], 'the part with unsaved edits stays unsaved');
    assert.equal(ui._dataSnapshot, JSON.stringify(data), 'Cancel does not bring the old name back');
    assert.equal(map.reactor3d.props[0].variant, 'Crimson');
    assert.equal(tilemap.sidecarState(), tilemap.savedSidecarState, 'a map with nothing unsaved has nothing unsaved');
    assert.equal(props.model.variant, 'Crimson');

    // A map with unsaved 3D edits keeps them unsaved.
    const edited = { currentMap: { reactor3d: mapSidecar() }, sidecarState() { return JSON.stringify(this.currentMap.reactor3d); }, savedSidecarState: '{}' };
    Panel.renameUsesInMemory('Vehicles/Tank', 'Red', 'Crimson', { tilemapManager: edited });
    assert.equal(edited.savedSidecarState, '{}');
    assert.equal(edited.currentMap.reactor3d.props[0].variant, 'Crimson');
    // Nothing open: nothing to do, and no error.
    Panel.renameUsesInMemory('Vehicles/Tank', 'Red', 'Crimson', {});
});

test('an Undo of a rename is seen as that rename, the other way', () => {
    const list = (...names) => names.map(name => ({ name }));
    assert.deepEqual(Panel.renamedBetween(list('Red', 'Blue'), list('Crimson', 'Blue')), { from: 'Red', to: 'Crimson' });
    assert.deepEqual(Panel.renamedBetween(list('Crimson', 'Blue'), list('Red', 'Blue')), { from: 'Crimson', to: 'Red' });
    assert.equal(Panel.renamedBetween(list('Red', 'Blue'), list('Red', 'Blue')), null, 'another kind of edit');
    assert.equal(Panel.renamedBetween(list('Red', 'Blue'), list('Red')), null, 'a variant deleted');
    assert.equal(Panel.renamedBetween(list('Red', 'Blue'), list('Blue', 'Red')), null, 'two names changed places');
    assert.equal(Panel.renamedBetween(list('Red', 'Blue'), list('Rose', 'Sky')), null, 'two renamed at once');
});
