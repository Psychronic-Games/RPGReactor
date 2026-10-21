'use strict';
// A selection on a map kept as a structure (Build › Select › Save as structure, save-structure.cjs)
// and stamped again elsewhere: what it takes, where it puts it, and that it stands the same.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');
const SC = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructureCapture.js'));
const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
// Values made inside the vm context are another realm's: compare them as data.
const same = (actual, expected, message) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);

function context() {
    const ctx = {
        console, require, Buffer, setTimeout, clearTimeout, module: { exports: {} },
        window: {}, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, querySelectorAll: () => [] },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } },
        rrEscapeHtml: text => String(text)
    };
    ctx.window = ctx;
    ctx.Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), ctx);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), ctx);
    ctx.RRStructurePlan = ctx.RRStructurePlan || ctx.module.exports;
    vm.runInNewContext(read('editor/src/utils/StructureCapture.js'), ctx);
    vm.runInNewContext(read('editor/src/database/DatabaseStructureEditor.js') + '\n;globalThis.DatabaseStructureEditor = DatabaseStructureEditor;', ctx);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\n;globalThis.PieceBuilderManager = PieceBuilderManager;', ctx);
    return ctx;
}

/** A 40 × 40 map with a small house at (10, 12) (walls, a door, a framed window, a rock, a shape), a lamp light, a model, a fountain and a villager. */
function village(E) {
    const map = { id: 3, width: 40, height: 40, events: [null], reactor3d: { version: 1, mode: '3d' } };
    const pieces = [];
    let id = 1;
    const put = (p) => pieces.push(Object.assign({ id: id++, z: 0, rot: 0, material: 'Stone' }, p));
    for (let x = 10; x <= 14; x++) put({ kind: 'floor', x, y: 12, material: 'Wood' });
    for (let x = 10; x <= 14; x++) put({ kind: 'wall', x, y: 13, z: 1 });
    put({ kind: 'wall', x: 10, y: 14, z: 1 });
    put({ kind: 'doorway', x: 12, y: 14, z: 1, rot: 2 });
    put({ kind: 'door', x: 12, y: 14, z: 1, rot: 2, material: 'Wood', style: 'plank', opens: 'auto', sound: { open: { name: 'door-open-01', volume: 90, pitch: 100 } } });
    put({ kind: 'window', x: 14, y: 14, z: 1, rot: 0, frame: { style: 'cottage', shutters: '#3f5f3a', flowerBox: true } });
    put({ kind: 'rock', x: 15, y: 15, size: [2, 2, 2], angle: 30, rough: 0.5 });
    put({ kind: 'cylinder', x: 10, y: 15, z: 0, size: [1, 3, 1], angle: 0 });
    // A loose wall far off: not part of the house.
    put({ kind: 'wall', x: 30, y: 30, z: 1 });
    E.restorePieces(map, pieces);
    map.reactor3d.lights = [
        { id: 'light1', type: 'point', x: 12.5, y: 15.5, height: 2.5, radius: 5, color: '#ffcc88', intensity: 1, tag: '' },
        { id: 'light2', type: 'sun', x: 20, y: 20, height: 150, radius: 150, color: '#ffffff', intensity: 1 }
    ];
    E.addProp(map, { name: 'Map-Objects/Tree-01', x: 13, y: 15, size: 6, direction: 2 });
    E.addProp(map, { name: 'Map-Objects/Tree-01', x: 35, y: 35, size: 6 });
    map.reactor3d.water = [{ x0: 11, y0: 15, x1: 12, y1: 15, level: 0.4, material: 'Water', mask: '10' }];
    map.events.push({ id: 1, name: 'Villager', note: '', x: 13, y: 12, pages: [{ image: { direction: 4, characterName: 'Actor1', characterIndex: 0 }, list: [{ code: 0, indent: 0, parameters: [] }] }] });
    return map;
}

test('select whole building: a stamped group whole, else every loose piece touching the one clicked', () => {
    const ctx = context(), E = ctx.RRMapElevation;
    const map = village(E);
    const list = E.pieces(map);
    const house = SC.connected(list, list.find(p => p.kind === 'door').id);
    assert.equal(house.length, list.length - 1, 'the house, its rock and shape (touching it), not the wall across the map');
    assert.ok(!house.includes(list.find(p => p.x === 30).id));
    // A grouped building: its group, however far its parts stand apart.
    const grouped = list.map(p => Object.assign({}, p, { group: p.x === 30 || p.kind === 'floor' ? 7 : 0 }));
    assert.equal(SC.connected(grouped, grouped.find(p => p.x === 30).id).length, 6, 'the floor and the far wall share group 7');
    // A wide shape bridges the cells it covers: an eave 6 long joins pieces it overhangs.
    const eave = [{ id: 1, kind: 'wall', x: 0, y: 0 }, { id: 2, kind: 'box', x: 2, y: 0, size: [6, 0.25, 1], angle: 0 }, { id: 3, kind: 'wall', x: 5, y: 0 }, { id: 4, kind: 'wall', x: 9, y: 0 }];
    same(SC.connected(eave, 1), [1, 2, 3]);
    // A turned slab covers its turned footprint (14 long east-west, under 3 deep), not a square.
    same(SC.boxOf([{ kind: 'box', x: 23, y: 44, size: [14, 0.25, 2.83], angle: 0, offset: [-0.5, -0.27] }]), { x0: 16, y0: 42, x1: 29, y1: 45 });
});

test('a capture keeps every kind and what stands in its box, in the plot\'s own cells', () => {
    const ctx = context(), E = ctx.RRMapElevation;
    const map = village(E);
    const ids = E.pieces(map).filter(p => p.x < 30).map(p => p.id);
    const result = SC.capture(map, ids, { E, name: 'Little House', description: 'A test', events: true });
    const { plan, box, counts } = result;
    same({ ...box }, { x0: 10, y0: 12, x1: 16, y1: 16 }, 'the rock (2 across, turned 30°, at 15) reaches 16 both ways');
    same([...plan.size], [7, 5]);
    same([...new Set(plan.pieces.map(p => p.kind))].sort(), ['cylinder', 'door', 'doorway', 'floor', 'rock', 'wall', 'window']);
    assert.ok(plan.pieces.every(p => p.id === undefined && p.group === undefined), 'no ids or groups');
    const door = plan.pieces.find(p => p.kind === 'door');
    same([door.x, door.y, door.z, door.rot, door.style, door.sound.open.name], [2, 2, 1, 2, 'plank', 'door-open-01'], 'the door keeps its settings and sound');
    same(plan.pieces.find(p => p.kind === 'window').frame, { style: 'cottage', shutters: '#3f5f3a', flowerBox: true });
    same(plan.lights, [{ type: 'point', x: 2.5, y: 3.5, height: 2.5, radius: 5, color: '#ffcc88', intensity: 1 }], 'the lamp, not the sun; no id or tag');
    assert.equal(plan.props.length, 1, 'the tree in the garden, not the one across the map');
    same([plan.props[0].x, plan.props[0].y, plan.props[0].id, plan.props[0].structure], [3, 3, undefined, undefined]);
    same(plan.water.map(w => [w.x0, w.y0, w.x1, w.y1, w.level, w.mask]), [[1, 3, 2, 3, 0.4, '10']], 'the fountain, its level above a flat pad');
    assert.equal(counts.events, 1);
    same(plan.spots, { villager: [3, 0] });
    same(plan.events, [{ spot: 'villager', name: 'Villager', template: 'Little-House.villager', direction: 4 }]);
    assert.equal(result.templates[0].event.pages[0].image.characterName, 'Actor1');
    assert.equal(plan.height, 2, 'a storey of walls standing on level 1 reaches into the second floor');
    assert.equal(plan.description, 'A test');
    // Without events: no people, no templates.
    const quiet = SC.capture(map, ids, { E, name: 'Little House' });
    assert.equal(quiet.plan.events, undefined);
    assert.equal(quiet.templates.length, 0);
});

test('saved and stamped elsewhere, it stands the same; turned, its models and water turn with it', () => {
    const ctx = context(), E = ctx.RRMapElevation;
    const map = village(E);
    const ids = E.pieces(map).filter(p => p.x < 30).map(p => p.id);
    const { plan } = SC.capture(map, ids, { E, name: 'Little House' });
    // Through the Database's normalize and trim, as the file is written.
    const DSE = ctx.DatabaseStructureEditor;
    const saved = JSON.parse(JSON.stringify(DSE.trimPlan(DSE.normalizePlan(JSON.parse(JSON.stringify(plan))))));
    assert.ok(saved.props && saved.water && saved.lights && saved.pieces, 'the file keeps models, water, lights and pieces');
    // Stamp it on an empty map at (3, 4), as the Build bar's Blueprint does.
    const other = { id: 4, width: 30, height: 30, events: [null], reactor3d: { version: 1, mode: '3d' } };
    const manager = new ctx.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: other }) });
    manager.resolvePlan = () => null;
    assert.equal(manager._lay(other, saved, { group: 1, plan: 'Little-House.json', x: 3, y: 4, rot: 0, scale: 1 }), true);
    const norm = (p, dx, dy) => { const c = Object.assign({}, p, { x: p.x - dx, y: p.y - dy }); delete c.id; delete c.group; return JSON.stringify(Object.keys(c).sort().reduce((o, k) => (o[k] = c[k], o), {})); };
    const before = E.pieces(map).filter(p => ids.includes(p.id)).map(p => norm(p, 10, 12)).sort();
    const after = E.pieces(other).map(p => norm(p, 3, 4)).sort();
    same([...after], [...before], 'every piece in the same place relative to the corner');
    same(other.reactor3d.lights.map(l => [l.x, l.y, l.height, l.tag]), [[5.5, 7.5, 2.5, 'structure:1']]);
    same(E.props(other).map(p => [p.x, p.y, p.structure]), [[6, 7, 1]]);
    same(E.water(other).map(w => [w.x0, w.y0, w.x1, w.y1, w.level, w.mask, w.structure]), [[4, 7, 5, 7, 0.4, '10', 1]]);
    // Taken off with its building: the model and the water go too.
    assert.equal(SP.removeGroupEffects(other, 1), true);
    assert.equal(E.props(other).length + E.water(other).length + (other.reactor3d.lights || []).length, 0);
    // A quarter turn: the model's cell turns about the plot and its facing with it; the water's box and mask turn.
    const turned = SP.transform(saved, 1, 1);
    same([...turned.size], [5, 7]);
    const tree = turned.props[0];
    same([tree.x, tree.y, tree.direction], [5 - 1 - 3, 3, 4], 'cell (3, 3) of a 7 × 5 plot is (1, 3) turned; facing down becomes facing left');
    same([turned.water[0].x0, turned.water[0].y0, turned.water[0].x1, turned.water[0].y1, turned.water[0].mask], [1, 1, 1, 2, '10'], 'the two-cell pool (wet west cell) turns to stand north-south, wet at the north');
    // Twice as big: the pool's cells each four.
    const grown = SP.transform(saved, 0, 2);
    same([grown.water[0].x0, grown.water[0].x1, grown.water[0].y0, grown.water[0].y1, grown.water[0].mask, grown.water[0].level], [2, 5, 6, 7, '11001100', 0.8]);
});

test('Save as structure: the file, the Database record, overwrite only when asked, and the selection made one building', () => {
    const ctx = context(), E = ctx.RRMapElevation;
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-save-structure-'));
    const map = village(E);
    const db = { data: { structures: [null] }, _structureFiles: new Set(), savedState: {} };
    const manager = new ctx.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }), getCurrentProject: () => ({ path: project }), databaseManager: db });
    manager.setMode('select');
    manager.selectAt({ x: 12, y: 14, z: 1, height: 1.5, door: E.pieces(map).find(p => p.kind === 'door').id });
    assert.ok(manager.selectConnectedAt(null) > 5, 'the house is selected whole');
    const first = manager.saveSelectionAsStructure({ name: 'Little House', description: 'Two rooms', events: true });
    assert.equal(first.file, 'Little-House.json');
    const file = path.join(project, '3d', 'Structures', 'Little-House.json');
    const written = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(written.name, 'Little House');
    assert.equal(written.description, 'Two rooms');
    assert.ok(fs.existsSync(path.join(project, '3d', 'Structures', 'events', 'Little-House.villager.json')), 'its villager as a template');
    assert.equal(db.data.structures[1].file, 'Little-House.json', 'on Database › Structures');
    assert.ok(db._structureFiles.has('Little-House.json'), 'a later Database save keeps the file');
    assert.ok(manager.structures().some(entry => entry.file === 'Little-House.json'), 'in the Blueprint slot');
    // The same name again: refused unless overwriting, which keeps the one record.
    assert.equal(manager.saveSelectionAsStructure({ name: 'little house' }), null, 'a clash is refused');
    assert.ok(manager.structureNamed('Little House'));
    const again = manager.saveSelectionAsStructure({ name: 'Little House', overwrite: true, replace: true, events: true });
    assert.equal(again.file, 'Little-House.json');
    assert.equal(db.data.structures.filter(Boolean).length, 1);
    // Made one building: a stamp of it where it stood, its villager now the building's (moved, not copied).
    const record = E.structures(map).find(entry => entry.plan === 'Little-House.json');
    assert.ok(record && record.x === 10 && record.y === 12, 'a building record at the corner');
    assert.equal(E.pieces(map).filter(p => p.group === record.group).length, E.pieces(map).length - 1, 'every house piece is the building\'s');
    const villagers = map.events.filter(e => e && e.name === 'Villager');
    assert.equal(villagers.length, 1, 'one villager, not two');
    assert.match(villagers[0].note, /<structure:\d+><spot:villager>/);
    assert.equal(E.props(map).filter(p => p.structure === record.group).length, 1, 'the garden tree is the building\'s');
    // One undo puts the loose pieces, the plain villager and the plain tree back.
    manager.undo();
    assert.equal(E.structures(map).length, 0);
    assert.equal(map.events.filter(e => e && e.name === 'Villager')[0].note, '');
    assert.equal(E.props(map).filter(p => p.structure).length, 0);
});

test('save-structure.cjs: writes a box of a map, refuses a name taken unless --force, --check writes nothing', () => {
    const ctx = context(), E = ctx.RRMapElevation;
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-save-structure-cli-'));
    fs.mkdirSync(path.join(project, 'data'));
    const map = village(E);
    const sidecar = map.reactor3d; delete map.reactor3d;
    fs.writeFileSync(path.join(project, 'data', 'Map003.json'), JSON.stringify(map));
    fs.writeFileSync(path.join(project, 'data', 'Map003.r3d.json'), JSON.stringify(sidecar));
    const script = path.join(repoRoot, 'editor', 'build-scripts', 'save-structure.cjs');
    const run = (...args) => execFileSync(process.execPath, [script, project, '3', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    run('10', '12', '15', '15', 'Box House', '--check');
    assert.equal(fs.existsSync(path.join(project, '3d', 'Structures', 'Box-House.json')), false, '--check writes nothing');
    assert.match(run('10', '12', '15', '15', 'Box House', '--events'), /wrote 3d\/Structures\/Box-House\.json and 1 event template/);
    const plan = JSON.parse(fs.readFileSync(path.join(project, '3d', 'Structures', 'Box-House.json'), 'utf8'));
    assert.equal(plan.pieces.length, 16, 'the pieces whose cells lie in the box');
    assert.throws(() => run('10', '12', '15', '15', 'Box House'), /exists/);
    assert.match(run('10', '12', '15', '15', 'Box House', '--force'), /wrote/);
});

test('the Build bar offers it: Save as structure on a selection, Select whole building on a piece, a double-click and the menu', () => {
    const bar = read('editor/src/BuildHotbar.js'), m3d = read('editor/src/MapEditor3D.js');
    assert.match(bar, /rr-build-save-structure/);
    assert.match(bar, /openSaveStructureDialog\(\) \{/);
    assert.match(bar, /rr-build-select-whole/);
    assert.match(m3d, /this\.pieceManager\(\)\.mode === 'select'\) \{\s*const pick = this\.pieceTargetAt\(event\.clientX, event\.clientY, \{ erase: true \}\);\s*if \(pick\) \{ event\.preventDefault\(\); this\.pieceManager\(\)\.selectConnectedAt\(pick\); \}/);
    assert.match(m3d, /tx\('Save as structure…'\)/);
    assert.match(read('editor/index.html'), /src\/utils\/StructureCapture\.js/);
});
