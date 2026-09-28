/**
 * The Build bar's Models group: placing, picking up and removing 3D models
 * from the bar, with the prop panel in the bar's side panel, and Build's
 * Select handing a placed model to it.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function load() {
    const context = { console, Promise, setTimeout, clearTimeout, JSON, Math, Number, String, Array, Object, RegExp, Map, Set };
    context.window = context;
    context.document = { addEventListener() {}, removeEventListener() {} };
    context.ModelPropsPreview2D = class { constructor() {} };
    vm.createContext(context);
    vm.runInContext(read('editor/src/ModelPropsManager.js') + '\nwindow.ModelPropsManager = ModelPropsManager;', context);
    vm.runInContext(read('editor/src/BuildHotbar.js') + '\nwindow.BuildHotbar = BuildHotbar;', context);
    const placed = [{ id: 1, name: 'Map-Objects/Tree-02' }, { id: 2, name: 'Vehicles/Bike' }, { id: 3, name: 'Map-Objects/Tree-02' }];
    const props = new context.ModelPropsManager(null);
    props.props = () => placed;
    props.prop = id => placed.find(p => p.id === id) || null;
    props.activate = function() { this.active = true; context.reactor.mapTool = 'models'; };
    props.select = function(id) { this.selectedId = id; };
    props.render = props._syncPanel = () => {};
    props.mapEditor3D = () => null;
    const piece = { mode: 'select', kind: 'wall', level: 0, activate() { context.reactor.mapTool = 'pieces'; }, setMode(m) { this.mode = m; } };
    context.reactor = { mapTool: 'pieces', modelPropsManager: props, pieceBuilderManager: piece };
    const bar = new context.BuildHotbar(null);
    bar.render = () => {};
    return { context, props, bar };
}

test('the Models group offers Select, the hammer, the Library, then the models in hand and on the map', () => {
    const { context, props, bar } = load();
    context.reactor.mapTool = 'models';
    assert.equal(bar.group(), 'models');
    assert.deepEqual([...bar.slots()], ['mselect', 'mremove', 'library', 'model0', 'model1'], 'each model once');
    props.chooseModel({ name: 'Actors/Fleagus', ext: 'glb' });
    assert.equal(props.libraryModels()[0].name, 'Actors/Fleagus', 'the model just chosen comes first');
    assert.equal(bar.activeSlot(), 'model0');
    assert.equal(bar.label('model1'), 'Tree-02');
});

test('Select picks up without placing; the hammer takes away; a model slot places', () => {
    const { props, bar } = load();
    bar.pick('model1');
    assert.equal(props.active, true, 'a models slot hands the map to the models tool');
    assert.equal(props.model.name, 'Vehicles/Bike');
    assert.equal(props.placing(), true);
    bar.pick('mselect');
    assert.equal(props.placing(), false, 'in Select a click on the ground places nothing');
    assert.equal(bar.activeSlot(), 'mselect');
    bar.pick('mremove');
    assert.equal(props.tool, 'erase');
    assert.equal(bar.activeSlot(), 'mremove');
});

test('Build\'s Select turns to Models with the model under the pointer', () => {
    const { context, props, bar } = load();
    assert.equal(bar.group(), 'build');
    bar.selectModel(2);
    assert.equal(context.reactor.mapTool, 'models');
    assert.equal(props.tool, 'select');
    assert.equal(props.selectedId, 2);
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /const propHit = held \? null : this\.propAt\(event\.clientX, event\.clientY, true\);/, 'the pick checks models first, by their triangles');
    assert.match(view, /if \(hitId && manager\.tool === 'erase'\) \{\s*manager\.remove\(hitId\);/, 'the hammer removes in 3D');
    assert.match(view, /if \(point && manager\.placing\(\)\) \{/, 'the ground takes a model only while one is in hand');
    assert.match(read('editor/src/ModelPropsManager.js'), /if \(hit && this\.tool === 'erase'\) \{ this\.remove\(hit\.id\); return; \}/, 'and on the flat map');
});

test('placing does not select what was placed; leaving Build lets its selection go; a size handle keeps the far face', () => {
    const { props } = load();
    const added = [];
    props.elevation = () => ({ addProp: (map, prop) => { added.push(prop); return 7; } });
    props.currentMap = {};
    props.pushUndo = () => {};
    props._changed = () => {};
    props.model = { name: 'Map-Objects/Tree-02' };
    assert.equal(props.place(3, 4), 7);
    assert.equal(props.selectedId, null, 'the fields in hand stay the next placement\'s');
    const pieces = read('editor/src/PieceBuilderManager.js');
    assert.match(pieces, /deactivate\(\) \{[\s\S]{0,300}this\.clearSelection\(\);/, 'another tool taking the map clears the pieces\' selection');
    assert.match(pieces, /this\.gizmoMode = 'all';/, 'every handle at once');
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /const half = \(size\[i\] - was\) \/ 2;/, 'the middle moves half the growth toward the grabbed face');
    const gizmo = require(path.join(root, 'editor', 'src', 'utils', 'ShapeGizmo3D.js'));
    assert.equal(typeof gizmo.grab, 'function');
    assert.match(read('editor/src/utils/ShapeGizmo3D.js'), /if \(mode === 'all'\) \{[\s\S]{0,300}'size'[\s\S]{0,120}'move'[\s\S]{0,120}'turn'/, 'cubes, then arrows, then rings');
});

test('the Build bar opens in Select', () => {
    const bar = read('editor/src/BuildHotbar.js');
    assert.match(bar, /const opening = !this\.visible;[\s\S]{0,300}if \(opening && manager\.mode !== 'select'\) manager\.setMode\('select'\);/);
    assert.match(read('editor/src/PieceBuilderManager.js'), /this\.mode = 'select';\n\s*this\.structure = '';/, 'and a fresh manager starts there');
});
