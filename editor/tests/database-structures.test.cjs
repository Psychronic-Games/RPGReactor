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
    assert.match(source, /ttp\('Floor \{n\} of \{count\}', \{ n: this\.floor \+ 1, count: plan\.floors\.length \}\)/, 'the floor label gets its numbers, not raw placeholders');
    assert.match(source, /selectLayer\?\.\('P'\)/, 'Use on the map picks the pieces tab by its own key');
});
