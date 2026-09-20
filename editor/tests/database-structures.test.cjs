// Database > Structures: a form over the plan files under 3d/Structures.
// The page reads and writes the same files the palette stamps and the
// build-structure script builds, so what it saves must be what it read.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');

function loadEditor(extra = {}) {
    const context = {
        console, window: {}, document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
        require, setTimeout, clearTimeout, module: { exports: {} },
        rrEscapeHtml: text => String(text), ...extra
    };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    context.RRStructurePlan = context.RRStructurePlan || context.module.exports;
    vm.runInNewContext(read('editor/src/database/DatabaseStructureEditor.js') + '\n;globalThis.DatabaseStructureEditor = DatabaseStructureEditor;', context);
    return context;
}

test('a plan file survives a round trip through the form untouched', () => {
    // Normalizing fills every field the form reads; trimming leaves out what
    // says nothing. A file the owner wrote by hand comes back byte for byte.
    const { DatabaseStructureEditor: E } = loadEditor();
    for (const name of ['Cottage', 'Manor', 'Hamlet']) {
        const original = JSON.parse(read(`template/Demo/3d/Structures/${name}.json`));
        const back = E.trimPlan(E.normalizePlan(JSON.parse(JSON.stringify(original))));
        assert.equal(JSON.stringify(back), JSON.stringify(original), `${name}.json is written back as it was read, keys in the same order`);
    }
});

test('normalizing fills defaults and clamps, and trimming drops what is default', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const plan = E.normalizePlan({ name: '', size: [1, 999], floors: [{ rooms: { a: [1, 1, 3] }, doors: [['a', undefined, 0]] }], stairs: [{ dir: 'up' }] });
    assert.equal(plan.name, 'Plan');
    assert.deepEqual([...plan.size], [E.SIZE_MIN, E.SIZE_MAX]);
    assert.equal(plan.storey, 5);
    assert.deepEqual([...plan.floors[0].rooms.a], [1, 1, 3, 0], 'a short rectangle is completed');
    assert.deepEqual([...plan.floors[0].doors[0]], ['a', 'outside', 1], 'a door leads outside by default and is at least one cell wide');
    assert.equal(plan.stairs[0].dir, 'north', 'an unknown direction becomes north');
    assert.equal(plan.materials.wall, '', 'every material role is present');
    const trimmed = E.trimPlan(plan);
    assert.equal('materials' in trimmed, false, 'no material named: none written');
    assert.equal('spots' in trimmed, false);
    assert.equal('events' in trimmed, false);
    assert.deepEqual({ ...trimmed.roof }, { pitch: 2 }, 'a plan with floors keeps its roof');
    assert.equal('stairs' in trimmed, true, 'the file had a stairs list, so it keeps one');
});

test('a new plan is a cottage the engine can walk through', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const plan = E.newPlan('Test');
    const report = E.report(plan, () => null, Reactor3D);
    assert.ok(report.pieces > 50, 'walls, floors, a door, windows and a roof');
    assert.ok(report.entrance && report.entrance.door, 'a front door');
    assert.deepEqual([...report.reached].sort(), ['hall', 'kitchen'], 'both rooms are reached from the front door');
    assert.deepEqual([...report.missing], []);
    // A room with no door into it is reported, not hidden.
    const sealed = E.normalizePlan(JSON.parse(JSON.stringify(plan)));
    sealed.floors[0].doors = [['hall', 'outside', 3]];
    const again = E.report(sealed, () => null, Reactor3D);
    assert.deepEqual([...again.missing], ['kitchen']);
    // Without a door to outside there is no walk, and the page says so.
    sealed.floors[0].doors = [];
    const shut = E.report(sealed, () => null, Reactor3D);
    assert.equal(shut.entrance, null);
    assert.deepEqual([...shut.reached], []);
});

test('the database manager reads plans as records and writes records back as plans', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-structures-'));
    try {
        const { DatabaseStructureEditor: E } = loadEditor();
        const context = { console, window: {}, document: { addEventListener() {} }, require, setTimeout, clearTimeout, module: { exports: {} }, DatabaseStructureEditor: E, RRJson: { read: (fsx, file) => JSON.parse(fsx.readFileSync(file, 'utf8')) } };
        context.window = context;
        vm.runInNewContext(read('editor/src/DatabaseManager.js') + '\n;globalThis.DatabaseManager = DatabaseManager;', context);
        const manager = new context.DatabaseManager();
        manager.fs = fs; manager.path = path;
        const folder = path.join(root, '3d', 'Structures');
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(path.join(folder, 'Cottage.json'), JSON.stringify(E.trimPlan(E.newPlan('Cottage')), null, 2) + '\n');
        fs.writeFileSync(path.join(folder, 'notes.json'), '{"not": "a plan"}');
        manager.data.structures = await manager.loadStructures(root);
        assert.equal(manager.data.structures[0], null, 'the null slot every category keeps');
        assert.equal(manager.getStructures().length, 1, 'a file that is not a plan is left alone');
        const cottage = manager.getStructures()[0];
        assert.equal(cottage.file, 'Cottage.json');
        assert.equal(cottage.name, 'Cottage');
        // A new record with no file yet, and a pasted record carrying the file it was copied from.
        manager.data.structures.push({ id: 2, name: 'Tower', file: '', plan: E.newPlan('Tower') });
        manager.data.structures.push({ id: 3, name: 'Cottage copy', file: 'Cottage.json', plan: JSON.parse(JSON.stringify(cottage.plan)) });
        assert.equal(await manager.saveStructures(root), true);
        assert.deepEqual(fs.readdirSync(folder).sort(), ['Cottage-copy.json', 'Cottage.json', 'Tower.json', 'notes.json'], 'the new one is named after its plan, the pasted one after its own name since its file was taken');
        assert.equal(manager.data.structures[2].file, 'Tower.json');
        assert.equal(manager.data.structures[3].file, 'Cottage-copy.json');
        // A cleared record takes its file with it.
        cottage.name = '';
        assert.equal(await manager.saveStructures(root), true);
        assert.deepEqual(fs.readdirSync(folder).sort(), ['Cottage-copy.json', 'Tower.json', 'notes.json'], 'the cleared plan\'s file went; the file that is not a plan stays');
        assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'Tower.json'), 'utf8')).name, 'Tower');
        assert.ok(fs.readFileSync(path.join(folder, 'Tower.json'), 'utf8').endsWith('}\n'), 'written the way a person writes one');
        assert.equal(manager.getDirtyKeys().includes('structures'), false, 'saved is clean');
        manager.data.structures[2].plan.storey = 6;
        assert.equal(manager.getDirtyKeys().includes('structures'), true, 'an edit to a plan is unsaved work');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the database wires the page in: category, title key, script, detail cleanup', () => {
    const ui = read('editor/src/DatabaseEditorUI.js');
    assert.match(ui, /\{ name: 'Structures', type: 'structures' \}/);
    assert.match(ui, /case 'structures':\s*\n[\s\S]*?data = this\.databaseManager\.getStructures\(\);/, 'a standard category: the list, search, New and Delete, clipboard and undo are the database\'s own');
    assert.match(ui, /type === 'structures' && this\.structureEditor\)\s*\{\s*this\.structureEditor\.showStructureDetail\(detailEl, entry\);/);
    assert.match(ui, /structures: \{ name: 'New Plan', file: '', plan: /, 'New makes a cottage');
    assert.match(ui, /this\.structureEditor\?\.detach\?\.\(\);/, 'leaving the page releases its preview');
    assert.match(ui, /new DatabaseStructureEditor\(databaseManager/);
    const manager = read('editor/src/DatabaseManager.js');
    assert.match(manager, /loaded\.structures = await this\.loadStructures\(projectPath\);/);
    assert.match(manager, /if \(!await this\.saveStructures\(projectPath\)\) failed\.push\('3d\/Structures'\);/);
    assert.match(manager, /structures: 9999,/);
    assert.match(read('editor/src/I18nManager.js'), /structures: 'menu\.structures'/);
    assert.match(read('editor/index.html'), /<script src="src\/database\/DatabaseStructureEditor\.js"><\/script>/);
    const source = read('editor/src/database/DatabaseStructureEditor.js');
    assert.match(source, /window\.Reactor3D\?\.extensionsLoaded\?\.\(\)/, 'the 3D preview waits for the whole runtime, not the bare core');
    assert.match(source, /palette\.structures\?\.\(true\)/, 'Use on the map refreshes the palette\'s Structure list');
    assert.match(source, /selectLayer\?\.\('P'\)/, 'Use on the map picks the pieces tab by its own key');
    assert.match(source, /document\.getElementById\('database-ok-btn'\)\?\.click\(\);/, 'Use on the map saves and closes as OK does');
});

test('a room and a part may wear their own materials, and the file keeps them', () => {
    const { DatabaseStructureEditor: E, RRStructurePlan: SP } = loadEditor();
    const plan = E.normalizePlan({
        name: 'Own', size: [14, 10], storey: 5,
        materials: { wall: 'Stone', inner: 'Plaster', floor: 'Wood' },
        floors: [{ rooms: { hall: [1, 1, 6, 8], kitchen: [8, 1, 12, 8] }, doors: [['hall', 'outside', 3], ['hall', 'kitchen', 3]], materials: { kitchen: { floor: 'Stone', wall: 'Wood' } } }]
    });
    const pieces = SP.build(plan, 0, 0, 1, 0, null);
    const at = (x, y, kind) => pieces.find(piece => piece.x === x && piece.y === y && piece.z === 0 && piece.kind === kind);
    assert.equal(at(9, 3, 'floor').material, 'Stone', 'the kitchen floor is its own');
    assert.equal(at(2, 3, 'floor').material, 'Wood', 'the hall keeps the building\'s floor');
    assert.equal(at(7, 1, 'wall').material, 'Wood', 'the wall between hall and kitchen is the kitchen\'s (the door is centred lower down)');
    assert.equal(at(0, 5, 'wall').material, 'Stone', 'the outer wall stays the building\'s');
    const back = E.trimPlan(plan);
    assert.equal(JSON.stringify(back.floors[0].materials), JSON.stringify({ kitchen: { floor: 'Stone', wall: 'Wood' } }));
    // A part overrides the plan it places.
    const hamlet = E.normalizePlan({ name: 'H', size: [40, 20], floors: [], parts: [{ name: 'a', plan: 'Own', at: [0, 0], rot: 0, materials: { wall: 'Wood' } }, { name: 'b', plan: 'Own', at: [20, 0], rot: 0 }] });
    const built = SP.build(hamlet, 0, 0, 1, 0, () => plan);
    assert.equal(built.find(piece => piece.x === 0 && piece.y === 5 && piece.kind === 'wall').material, 'Wood', 'part a is timber');
    assert.equal(built.find(piece => piece.x === 20 && piece.y === 5 && piece.kind === 'wall').material, 'Stone', 'part b is the plan\'s stone');
    const trimmed = E.trimPlan(hamlet);
    assert.equal(JSON.stringify(trimmed.parts[0].materials), JSON.stringify({ wall: 'Wood' }));
    assert.equal('materials' in trimmed.parts[1], false);
});

test('a style names a set of materials, and a set that is its own is Custom', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const available = ['Stone', 'Plaster', 'Wood', 'Thatch', 'RoofTile', 'Sand'];
    const stone = E.styleMaterials('Stone and thatch', available);
    assert.equal(stone.roof, 'Thatch');
    assert.equal(E.styleOf(stone, available), 'Stone and thatch');
    assert.equal(E.styleOf({ ...stone, roof: 'RoofTile' }, available), 'Stone and tile');
    assert.equal(E.styleOf({ ...stone, wall: 'Marble' }, available), null, 'its own');
    assert.equal(E.styleMaterials('Stone and thatch', ['Stone']).roof, '', 'a material the project lacks is left plain');
});

test('drawing on the plan: rooms are drawn, moved and resized; doors, windows, stairs and people are placed and picked up again; undo takes it back', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const editor = new E(null, { getCurrentProject: () => null }, null, null);
    editor.renderInspector = () => {}; editor.renderMore = () => {}; editor.renderTools = () => {}; editor.schedulePreview = () => {}; editor.render = () => {}; editor._detail = null;
    editor.parentEditor = { _markDatabaseMutation() { editor._dirty = (editor._dirty || 0) + 1; }, refreshDatabaseListLabel() {} };
    editor.eventTemplates = () => ['villager'];
    const plan = E.normalizePlan({ name: 'D', size: [16, 12], floors: [{ rooms: {}, doors: [] }] });
    editor.current = { entry: { id: 1, name: 'D', file: 'D.json', plan }, plan };
    editor._planGeom = { ox: 0, oy: 0, cell: 10 };
    const floor = plan.floors[0];
    const press = (x, y) => editor.beginPlanGesture({ x, y });
    const drag = (x, y) => editor.updatePlanGesture({ x, y });
    const release = (x, y) => editor.endPlanGesture({ x, y });
    const stroke = (from, to) => { press(...from); drag(...to); release(...to); };
    const click = (x, y) => { press(x, y); release(x, y); };
    assert.deepEqual({ ...editor.cellAt(35, 25) }, { x: 3, y: 2 });
    assert.equal(editor.cellAt(500, 25), null, 'outside the plan');
    // Room tool: a drag on empty ground draws; it stops one cell inside the ring, where the walls go.
    editor.tool = 'room';
    stroke([2, 2], [6, 5]);
    const [first] = Object.keys(floor.rooms);
    assert.deepEqual([...floor.rooms[first]], [2, 2, 6, 5]);
    assert.deepEqual({ ...editor.selection }, { kind: 'room', key: first });
    stroke([9, 2], [40, 40]);
    const second = Object.keys(floor.rooms)[1];
    assert.deepEqual([...floor.rooms[second]], [9, 2, 14, 10]);
    // Whatever the tool, a press on a room moves it, a press on its edge resizes it.
    editor.tool = 'select';
    stroke([4, 3], [4, 4]);
    assert.deepEqual([...floor.rooms[first]], [2, 3, 6, 6], 'moved down one');
    stroke([6, 4], [7, 4]);
    assert.deepEqual([...floor.rooms[first]], [2, 3, 7, 6], 'right edge out by one');
    // Door tool: a click on the wall between the rooms puts a door where the click was; a drag slides it.
    editor.tool = 'door';
    click(8, 5);
    assert.equal(JSON.stringify(floor.doors), JSON.stringify([[first, second, 3, 5]]), 'the door carries where along the wall it sits');
    assert.deepEqual({ ...editor.selection }, { kind: 'door', key: 0 });
    const cellsOf = i => Array.from(editor.doorCellsOf(i), c => c.join(',')).sort();
    assert.deepEqual(cellsOf(0), ['8,4', '8,5', '8,6'], 'three cells centred on the click');
    stroke([8, 5], [8, 3]);
    assert.equal(floor.doors[0][3], 3, 'slid up its wall');
    assert.deepEqual(cellsOf(0), ['8,3', '8,4', '8,5']);
    click(15, 5);
    assert.equal(JSON.stringify(floor.doors[1]), JSON.stringify([second, 'outside', 3, 5]), 'a ring cell beside a room is the front door');
    assert.equal(editor.addDoorAt(0, 0), false, 'a corner touches no room');
    assert.equal(editor.addDoorAt(4, 4), false, 'inside a room is not a wall');
    // Window tool: a click on the ring places one; a drag slides it round the outside; not onto a corner.
    editor.tool = 'window';
    click(0, 4);
    assert.equal(JSON.stringify(floor.windows), JSON.stringify([[0, 4]]));
    assert.deepEqual({ ...editor.selection }, { kind: 'window', key: 0 });
    stroke([0, 4], [0, 7]);
    assert.equal(JSON.stringify(floor.windows), JSON.stringify([[0, 7]]));
    stroke([0, 7], [0, 0]);
    assert.equal(JSON.stringify(floor.windows), JSON.stringify([[0, 7]]), 'a corner is not a wall');
    click(4, 4);
    assert.equal(floor.windows.length, 1, 'inside a room is no window');
    // Stairs tool: a click in a room starts stairs; a drag moves them; a wall cell starts none.
    editor.tool = 'stairs';
    click(10, 8);
    assert.equal(JSON.stringify(plan.stairs), JSON.stringify([{ floor: 0, from: [10, 8], dir: 'north', width: 1 }]));
    stroke([10, 8], [12, 9]);
    assert.equal(JSON.stringify(plan.stairs[0].from), JSON.stringify([12, 9]));
    click(0, 3);
    assert.equal(plan.stairs.length, 1);
    // Person tool: a click puts a spot and someone at it; a drag moves them.
    editor.tool = 'person';
    click(3, 4);
    const [who] = Object.keys(plan.spots);
    assert.ok(who && JSON.stringify(plan.spots[who]) === JSON.stringify([3, 4]));
    assert.equal(JSON.stringify(plan.events), JSON.stringify([{ spot: who, name: '', template: 'villager', direction: 2 }]), 'the first template stands there');
    stroke([3, 4], [5, 5]);
    assert.equal(JSON.stringify(plan.spots[who]), JSON.stringify([5, 5]));
    // A press on any of them selects it, whatever the tool.
    editor.tool = 'room';
    click(12, 9); assert.deepEqual({ ...editor.selection }, { kind: 'stair', key: 0 });
    click(0, 7); assert.deepEqual({ ...editor.selection }, { kind: 'window', key: 0 });
    click(8, 4); assert.deepEqual({ ...editor.selection }, { kind: 'door', key: 0 });
    click(5, 5); assert.deepEqual({ ...editor.selection }, { kind: 'spot', key: who });
    // Remove takes the selection; Undo brings it back, Redo takes it again; a moved room undoes to where it was.
    editor.removeSelection();
    assert.deepEqual(Object.keys(plan.spots), []);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Object.keys(editor.current.plan.spots), [who], 'undo restores the person');
    assert.equal(editor.redo(), true);
    assert.deepEqual(Object.keys(editor.current.plan.spots), []);
    assert.equal(editor.current.plan, plan, 'the record keeps the same plan object through undo');
    const before = JSON.stringify(plan.floors[0].rooms[first]);
    editor.tool = 'select'; stroke([4, 4], [4, 5]);
    assert.notEqual(JSON.stringify(plan.floors[0].rooms[first]), before);
    editor.undo();
    assert.equal(JSON.stringify(plan.floors[0].rooms[first]), before, 'a move undoes to where the room was');
    assert.ok(editor._dirty > 0, 'the database heard about all of it');
});

test('a door anchor and hand-placed windows round-trip through the form', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const original = { name: 'W', size: [14, 10], storey: 5, floors: [{ rooms: { hall: [1, 1, 6, 8] }, doors: [['hall', 'outside', 3, 2]], windows: [[0, 3], [6, 9]] }], roof: { pitch: 2 }, windows: { every: 0, width: 2 } };
    const back = E.trimPlan(E.normalizePlan(JSON.parse(JSON.stringify(original))));
    assert.equal(JSON.stringify(back), JSON.stringify(original));
});

test('a tower of eight floors is stored whole and walked to its top', () => {
    // PIECE_MAX_LEVEL once stopped at 30: a plan past six storeys lost its top
    // rows to the store's clamp, and the walk failed for a plan that was right.
    const { DatabaseStructureEditor: E, RRStructurePlan: SP } = loadEditor();
    const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const floors = [];
    for (let i = 0; i < 8; i++) floors.push({ rooms: { room: [1, 1, 8, 8] }, doors: i === 0 ? [['room', 'outside', 3]] : [] });
    const stairs = [];
    for (let i = 0; i < 7; i++) stairs.push({ floor: i, from: [7, 7], dir: 'north', width: 1 });
    const plan = E.normalizePlan({ name: 'Tower', size: [10, 10], storey: 5, floors, stairs, roof: { pitch: 2 }, windows: { every: 4, width: 1 } });
    const report = E.report(plan, () => null, Reactor3D);
    assert.ok(Reactor3D.PIECE_MAX_LEVEL >= 8 * 5 + 2, 'the level cap clears eight storeys and a roof');
    assert.equal(Math.max(...report.built.map(piece => piece.z)), 42, 'the roof ridge stands at its built height');
    assert.deepEqual([...report.missing], [], 'every floor is reached');
    assert.deepEqual([...report.reached].sort(), ['room', 'room (2)', 'room (3)', 'room (4)', 'room (5)', 'room (6)', 'room (7)', 'room (8)'], 'floors that share a room name are told apart');
    assert.equal(SP.build(plan, 0, 0, 1, 0, null).every(piece => piece.z <= Reactor3D.PIECE_MAX_LEVEL), true);
});

test('shapes on a plan: placed at a size and a turn, drawn, moved, turned with the plan, and kept in the file', () => {
    const { DatabaseStructureEditor: E, RRStructurePlan: SP } = loadEditor();
    const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const original = { name: 'T', size: [16, 16], storey: 5, floors: [{ rooms: { hall: [1, 1, 6, 6] }, doors: [['hall', 'outside', 3]] }], roof: { pitch: 2 }, windows: { every: 6, width: 2 }, shapes: [{ kind: 'cylinder', at: [11, 11], size: [5, 8, 5], material: 'Stone' }, { kind: 'dome', at: [11, 11], z: 8, size: [5, 2.5, 5], angle: 15, material: 'RoofTile' }] };
    const plan = E.normalizePlan(JSON.parse(JSON.stringify(original)));
    assert.equal(JSON.stringify(E.trimPlan(plan)), JSON.stringify(original), 'the file comes back as it was');
    const built = SP.build(plan, 0, 0, 1, 0, null);
    const shapes = built.filter(piece => ['dome', 'cylinder', 'cone'].includes(piece.kind));
    assert.equal(shapes.length, 2);
    assert.deepEqual([...shapes[0].size], [5, 8, 5]);
    assert.equal(shapes[1].angle, 15);
    const turned = SP.transform(plan, 1, 1);
    assert.equal(turned.shapes[1].angle, 105, 'a quarter turn adds ninety degrees');
    assert.deepEqual([...turned.shapes[0].at], [4, 11], 'and moves the shape with the plan');
    const grown = SP.transform(plan, 0, 2);
    assert.deepEqual([...grown.shapes[0].size], [10, 16, 10], 'a scale grows the shape');
    // The page: the Shape tool puts one down, a drag moves it, the inspector's kind and size are its own.
    const editor = new E(null, { getCurrentProject: () => null }, null, null);
    editor.renderInspector = () => {}; editor.renderMore = () => {}; editor.renderTools = () => {}; editor.schedulePreview = () => {}; editor.render = () => {}; editor._detail = null;
    editor.parentEditor = { _markDatabaseMutation() {}, refreshDatabaseListLabel() {} };
    editor.current = { entry: { id: 1, name: 'T', file: 'T.json', plan }, plan };
    editor._planGeom = { ox: 0, oy: 0, cell: 10 };
    editor.tool = 'shape';
    // (3,12) would be inside the hall's front door, which cuts through every wall row down to the ring; place clear of it.
    editor.beginPlanGesture({ x: 14, y: 3 }); editor.endPlanGesture({ x: 14, y: 3 });
    assert.equal(plan.shapes.length, 3);
    assert.equal(JSON.stringify(plan.shapes[2]), JSON.stringify({ kind: 'dome', at: [14, 3], z: 0, size: [5, 2.5, 5], angle: 0, material: 'RoofTile' }), 'a new shape takes after the last one placed');
    assert.deepEqual({ ...editor.selection }, { kind: 'shape', key: 2 });
    editor.tool = 'select';
    assert.deepEqual({ ...editor.hitAt(12, 12) }, { kind: 'shape', key: 1 }, 'the topmost shape under the cell is the one picked');
    editor.beginPlanGesture({ x: 14, y: 3 }); editor.updatePlanGesture({ x: 13, y: 4 }); editor.endPlanGesture({ x: 13, y: 4 });
    assert.deepEqual([...plan.shapes[2].at], [13, 4], 'dragged');
    assert.ok(editor.shapeCells(plan.shapes[0]).length === Reactor3D.pieceFootprint({ kind: 'cylinder', x: 11, y: 11, z: 0, rot: 0, size: [5, 8, 5], angle: 0 }).length, 'the page and the runtime agree on the footprint');
    editor.removeSelection();
    assert.equal(plan.shapes.length, 2);
    editor.undo();
    assert.equal(plan.shapes.length, 3, 'undo brings the shape back');
    const report = E.report(plan, () => null, Reactor3D);
    assert.ok(report.pieces > 100 && (report.triangles === null || report.triangles > 1000), 'the report builds the shapes too (triangles need three.js, absent here)');
});
