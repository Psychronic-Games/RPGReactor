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

test('the Objects group: the Library, Light, Screen, Select and Remove; no slot per model (a row that would run out of room)', () => {
    const { context, props, bar } = load();
    context.reactor.mapTool = 'models';
    assert.equal(bar.group(), 'models');
    assert.deepEqual([...bar.slots()], ['library', 'light', 'screen', 'mselect', 'mremove'], 'the Library at the far left; Lighting and Media Surfaces beside it (owner, 2026-11-22)');
    props.chooseModel({ name: 'Actors/Fleagus', ext: 'glb' });
    assert.equal(bar.activeSlot(), 'library', 'a model in hand came from the Library');
    assert.equal(bar.label('library'), 'build.library');
    assert.doesNotMatch(read('editor/src/BuildHotbar.js'), /modelThumb|rr-build-slot-thumb/, 'no pictures of models in the bar');
});

test('Select picks up without placing; the hammer takes away; the Library opens the picker', () => {
    const { props, bar } = load();
    let picker = 0;
    props.openModelPicker = () => { picker++; };
    bar.pick('library');
    assert.equal(picker, 1);
    assert.equal(props.active, true, 'an Objects slot hands the map to the models tool');
    props.chooseModel({ name: 'Vehicles/Bike' });
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
    assert.match(view, /const propHit = held \|\| water \? null : this\.propAt\(event\.clientX, event\.clientY, true\);/, 'the pick checks models by their triangles (water nearest under the pointer is left for the release, which turns to Terrain)');
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

test('Lighting is an Objects slot too: it opens its panel with the Objects group up, and closing it comes back there', () => {
    const { context, bar } = load();
    let lit = 0;
    context.reactor.lightingManager = { setActive(on) { if (on) { lit++; context.reactor.mapTool = 'lighting'; } } };
    bar.pick('light');
    assert.equal(lit, 1);
    assert.equal(bar.group(), 'models');
    assert.equal(bar.activeSlot(), 'light');
    bar.pick('light');
    assert.equal(lit, 1, 'picked again while it holds the map, it is not opened twice');
    bar.visible = true;
    bar.undock();
    assert.equal(context.reactor.mapTool, 'models', 'its panel closed: the Objects group in Select');
    assert.equal(bar.activeSlot(), 'mselect');
    assert.match(read('editor/src/main.js'), /owner === 'lighting' \|\| owner === 'media'\)\) \{ this\.buildHotbar\.undock\(\); return; \}/);
});

test('Media Surfaces is an Objects slot: it opens its panel, and the bar shows the Objects group with Screen in hand', () => {
    const { context, bar } = load();
    let opened = 0;
    context.reactor.mediaSurfaceManager = { open() { opened++; context.reactor.mapTool = 'media'; return true; } };
    bar.pick('screen');
    assert.equal(opened, 1, 'the Screen slot opens the Media Surfaces panel');
    assert.equal(bar.group(), 'models');
    assert.equal(bar.activeSlot(), 'screen');
    bar.pick('screen');
    assert.equal(opened, 1, 'picked again while it holds the map, it is not opened twice');
});

test('the Tools menu opens Terrain, Foliage, Models, Media Surfaces and Lighting in the bar', () => {
    const { context, bar } = load();
    const fs = require('node:fs'), path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    for (const action of ['terrain-tool', 'foliage-tool', 'models-tool', 'media-surfaces', 'lighting-tool']) assert.match(html, new RegExp(`class="html-menu-option" data-action="${action}"`), action);
    const ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'UIManager.js'), 'utf8');
    assert.match(ui, /buildHotbar\?\.openTool\('screen'\)/);
    assert.match(ui, /buildHotbar\?\.openTool\('light'\)/);
    assert.match(ui, /buildHotbar\?\.openTool\(action\.replace\('-tool', ''\)\)/);
    let shown = 0;
    bar.root = {}; bar.show = () => { shown++; bar.visible = true; };
    bar.hide = () => { bar.visible = false; };
    context.reactor.mediaSurfaceManager = { open() { context.reactor.mapTool = 'media'; return true; } };
    assert.equal(bar.openTool('screen'), true);
    assert.equal(shown, 1, 'the bar comes up first');
    assert.equal(bar.activeSlot(), 'screen');
    bar.openTool('screen');
    assert.equal(bar.visible, false, 'the same entry again puts the bar away');
    bar.openTool('models');
    assert.equal(bar.group(), 'models');
    assert.equal(bar.activeSlot(), 'mselect');
});
