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

test('the page lists, writes, reads and names plan files in the project folder', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-structures-'));
    try {
        const editor = new E(null, { getCurrentProject: () => ({ path: root }) }, null, null);
        assert.equal(editor.list().length, 0, 'no folder yet: no plans');
        const plan = E.newPlan('Cottage');
        const file = editor.fileNameFor('My Cottage');
        assert.equal(file, 'My-Cottage.json');
        assert.equal(editor.write(file, plan), true);
        assert.equal(fs.existsSync(path.join(root, '3d', 'Structures', file)), true, 'the folder is made');
        const text = fs.readFileSync(path.join(root, '3d', 'Structures', file), 'utf8');
        assert.ok(text.endsWith('}\n') && text.includes('\n  "name"'), 'two-space indent and a trailing newline, like a hand-written file');
        assert.equal(editor.list().length, 1);
        assert.equal(editor.list()[0].name, 'Cottage');
        assert.equal(editor.fileNameFor('My Cottage'), 'My-Cottage-2.json', 'a second file of the same name is numbered');
        const back = editor.read(file);
        assert.equal(JSON.stringify(E.trimPlan(back)), JSON.stringify(E.trimPlan(plan)));
        fs.writeFileSync(path.join(root, '3d', 'Structures', 'broken.json'), '{not json');
        const listed = editor.list(true);
        assert.equal(listed.length, 2);
        assert.ok(listed.find(entry => entry.file === 'broken.json').error, 'a file that is not a plan is listed with its error, not hidden');
        assert.equal(editor.resolve('My-Cottage'), listed.find(entry => entry.file === file).plan, 'a part names a plan by file or name');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the database wires the page in: category, title key, script, detail cleanup', () => {
    const ui = read('editor/src/DatabaseEditorUI.js');
    assert.match(ui, /\{ name: 'Structures', type: 'structures' \}/);
    assert.match(ui, /case 'structures': \{/);
    assert.match(ui, /this\.structureEditor\?\.detach\?\.\(\);/, 'leaving the page releases its preview');
    assert.match(ui, /new DatabaseStructureEditor\(databaseManager/);
    assert.match(read('editor/src/I18nManager.js'), /structures: 'menu\.structures'/);
    assert.match(read('editor/index.html'), /<script src="src\/database\/DatabaseStructureEditor\.js"><\/script>/);
    const source = read('editor/src/database/DatabaseStructureEditor.js');
    assert.match(source, /window\.Reactor3D\?\.extensionsLoaded\?\.\(\)/, 'the 3D preview waits for the whole runtime, not the bare core');
    assert.match(source, /palette\.structures\(true\)/, 'a save refreshes the palette\'s Structure list');
    assert.match(source, /selectLayer\?\.\('P'\)/, 'Use on the map picks the pieces tab by its own key');
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

test('drawing on the plan: a drag makes a room, a drag moves or resizes it, a click puts a door through a wall', () => {
    const { DatabaseStructureEditor: E } = loadEditor();
    const editor = new E(null, { getCurrentProject: () => null }, null, null);
    editor.renderForm = () => {}; editor.schedulePreview = () => {}; editor._detail = null;
    const plan = E.normalizePlan({ name: 'D', size: [16, 12], floors: [{ rooms: {}, doors: [] }] });
    editor.current = { file: 'D.json', plan, dirty: false };
    editor._planGeom = { ox: 0, oy: 0, cell: 10 };
    assert.deepEqual({ ...editor.cellAt(35, 25) }, { x: 3, y: 2 });
    assert.equal(editor.cellAt(500, 25), null, 'outside the plan');
    const floor = plan.floors[0];
    // Draw: press on empty ground, drag, release.
    editor.beginPlanGesture({ x: 2, y: 2 }); editor.updatePlanGesture({ x: 6, y: 5 }); editor.endPlanGesture({ x: 6, y: 5 });
    const [first] = Object.keys(floor.rooms);
    assert.ok(first, 'a room was made');
    assert.deepEqual([...floor.rooms[first]], [2, 2, 6, 5]);
    assert.equal(editor.selectedRoom, first, 'and selected');
    assert.equal(editor.current.dirty, true);
    // A drag that reaches the plan's edge stops one cell short: that cell is the wall.
    editor.beginPlanGesture({ x: 9, y: 2 }); editor.updatePlanGesture({ x: 40, y: 40 }); editor.endPlanGesture({ x: 40, y: 40 });
    const second = Object.keys(floor.rooms)[1];
    assert.deepEqual([...floor.rooms[second]], [9, 2, 14, 10]);
    // Move: press inside, drag.
    editor.beginPlanGesture({ x: 4, y: 3 }); editor.updatePlanGesture({ x: 4, y: 4 }); editor.endPlanGesture({ x: 4, y: 4 });
    assert.deepEqual([...floor.rooms[first]], [2, 3, 6, 6], 'moved down one');
    // Resize: press on the right edge, drag.
    editor.beginPlanGesture({ x: 6, y: 4 }); editor.updatePlanGesture({ x: 7, y: 4 }); editor.endPlanGesture({ x: 7, y: 4 });
    assert.deepEqual([...floor.rooms[first]], [2, 3, 7, 6], 'right edge out by one');
    // Click the wall between the two rooms: a door. Click again: gone.
    assert.equal(editor.toggleDoorAt(8, 4), true);
    assert.deepEqual(floor.doors.map(door => [...door]), [[first, second, 3]]);
    assert.equal(editor.toggleDoorAt(8, 5), true, 'the same wall from another cell');
    assert.deepEqual(floor.doors, []);
    // Click the outer wall beside a room that touches it: the front door.
    assert.equal(editor.toggleDoorAt(15, 5), true);
    assert.deepEqual(floor.doors.map(door => [...door]), [[second, 'outside', 3]]);
    assert.equal(editor.toggleDoorAt(0, 4), false, 'a ring cell two walls from a room is no door');
    assert.equal(editor.toggleDoorAt(0, 0), false, 'a corner touches no room');
    assert.equal(editor.toggleDoorAt(4, 4), false, 'inside a room is not a wall');
    // A click with no drag on a room selects it; Delete removes it with its doors.
    editor.selectedRoom = null;
    editor.beginPlanGesture({ x: 10, y: 5 }); editor.endPlanGesture({ x: 10, y: 5 });
    assert.equal(editor.selectedRoom, second);
    editor.removeRoom();
    assert.deepEqual(Object.keys(floor.rooms), [first]);
    assert.deepEqual(floor.doors, [], 'its front door went with it');
    editor.removeRoom(first);
    assert.deepEqual(Object.keys(floor.rooms), []);
});
