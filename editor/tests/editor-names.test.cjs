const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const names = require(path.join(editorRoot, 'src', 'utils', 'EditorNames.js'));

const quietConsole = Object.create(console);
quietConsole.error = () => {};

function loadDatabaseManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseManager;`, {
        console: quietConsole,
        process,
        require,
        nw: {},
        RREditorNames: names
    });
}

function tempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-editor-names-'));
    fs.mkdirSync(path.join(root, 'data'));
    return root;
}

test('editor names normalize supported sections without losing future data', () => {
    assert.equal(names.FILENAME, 'Database.names.json');
    assert.deepEqual(Array.from(names.SECTIONS), [
        'actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'states'
    ]);

    const normalized = names.normalize({
        version: 99,
        skills: { 1: '  Opening attack  ', 2: '   ', 3: 42, '-1': 'invalid' },
        actors: ['invalid section'],
        futureSection: { 7: 'Keep me' },
        futureSetting: true
    });
    assert.deepEqual(normalized.skills, { 1: 'Opening attack' });
    assert.deepEqual(normalized.actors, {});
    assert.deepEqual(normalized.futureSection, { 7: 'Keep me' });
    assert.equal(normalized.futureSetting, true);
    assert.equal(normalized.version, names.VERSION);
});

test('editor names set, clear, and prune entries', () => {
    let store = names.create();
    store = names.set(store, 'actors', 1, '  Protagonist  ');
    store = names.set(store, 'actors', 2, 'Temporary');
    store = names.set(store, 'actors', 3, 'Past maximum');
    assert.equal(names.get(store, 'actors', 1), 'Protagonist');
    assert.equal(names.isEmpty(store), false);

    names.set(store, 'actors', 2, '   ');
    names.prune(store, 'actors', 1);
    assert.deepEqual(store.actors, { 1: 'Protagonist' });

    names.prune(store, 'actors', [null, null]);
    assert.equal(names.get(store, 'actors', 1), '');
    assert.equal(names.isEmpty(store), true);
});

test('DatabaseManager keeps missing editor names dormant and tracks saved state', async () => {
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    const root = tempProject();
    try {
        assert.equal(await manager.loadAllData(root), true);
        assert.equal(await manager.saveEditorNames(root), true);
        assert.equal(fs.existsSync(path.join(root, 'data', names.FILENAME)), false);

        names.set(manager.data.editorNames, 'skills', 4, 'Boss finisher');
        assert.deepEqual(Array.from(manager.getDirtyKeys()), ['editorNames']);
        assert.equal(await manager.saveAllData(root), true);
        assert.deepEqual(Array.from(manager.getDirtyKeys()), []);
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data', names.FILENAME))).skills['4'],
            'Boss finisher');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('DatabaseManager preserves unknown keys and keeps an existing empty sidecar', async () => {
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    const root = tempProject();
    const filePath = path.join(root, 'data', names.FILENAME);
    try {
        fs.writeFileSync(filePath, JSON.stringify({
            version: 2,
            skills: { 3: '  Reserved  ' },
            futureSection: { 9: 'Future label' }
        }));
        manager.data.editorNames = await manager.loadEditorNames(root);
        assert.equal(names.get(manager.data.editorNames, 'skills', 3), 'Reserved');

        names.set(manager.data.editorNames, 'skills', 3, '');
        assert.equal(await manager.saveEditorNames(root), true);
        const written = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        assert.deepEqual(written.skills, {});
        assert.deepEqual(written.futureSection, { 9: 'Future label' });
        assert.equal(fs.existsSync(filePath), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('DatabaseManager refuses to overwrite malformed editor names', async () => {
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    const root = tempProject();
    const filePath = path.join(root, 'data', names.FILENAME);
    try {
        fs.writeFileSync(filePath, '{ broken editor names');
        assert.equal(await manager.loadAllData(root), true, 'editor names cannot block the database');
        assert.equal(names.isEmpty(manager.data.editorNames), true);
        names.set(manager.data.editorNames, 'items', 1, 'Potion stock');
        assert.equal(await manager.saveAllData(root), false);
        assert.equal(fs.readFileSync(filePath, 'utf8'), '{ broken editor names');

        fs.unlinkSync(filePath);
        assert.equal(await manager.saveAllData(root), true, 'deleting the damaged file permits recovery');
        names.set(manager.data.editorNames, 'items', 1, 'Potion shelf');
        assert.equal(await manager.saveAllData(root), true, 'a recovered sidecar stays writable');
        assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).items['1'], 'Potion shelf');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('an unreadable editor-name sidecar blocks normal database writes', async () => {
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    const root = tempProject();
    const actorsPath = path.join(root, 'data', 'Actors.json');
    const namesPath = path.join(root, 'data', names.FILENAME);
    try {
        fs.writeFileSync(actorsPath, JSON.stringify([null, { id: 1, name: 'Before' }]));
        fs.writeFileSync(namesPath, '{ damaged');
        assert.equal(await manager.loadAllData(root), true);
        manager.data.actors[1].name = 'After';
        assert.equal(await manager.saveAllData(root), false);
        assert.equal(JSON.parse(fs.readFileSync(actorsPath, 'utf8'))[1].name, 'Before');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('editor names are not written when a normal database save fails', async () => {
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    const root = tempProject();
    const namesPath = path.join(root, 'data', names.FILENAME);
    try {
        manager.data.editorNames = names.create();
        names.set(manager.data.editorNames, 'skills', 1, 'Unsaved label');
        manager.saveJSON = async () => false;
        assert.equal(await manager.saveAllData(root), false);
        assert.equal(fs.existsSync(namesPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('DatabaseManager prunes labels when entries are deleted or truncated', () => {
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    manager.data.actors = [null, { id: 1 }, { id: 2 }, { id: 3 }];
    manager.data.editorNames = names.create();
    names.set(manager.data.editorNames, 'actors', 1, 'One');
    names.set(manager.data.editorNames, 'actors', 2, 'Two');
    names.set(manager.data.editorNames, 'actors', 3, 'Three');

    manager.deleteEntry('actors', 2);
    assert.equal(names.get(manager.data.editorNames, 'actors', 2), '');
    assert.equal(manager.changeMaximum('actors', 1, { id: 0, name: '' }), true);
    assert.equal(names.get(manager.data.editorNames, 'actors', 3), '');
    assert.equal(names.get(manager.data.editorNames, 'actors', 1), 'One');
});

test('the editor names module loads before DatabaseManager', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.ok(html.indexOf('src/utils/EditorNames.js') < html.indexOf('src/DatabaseManager.js'));
});
