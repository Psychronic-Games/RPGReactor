const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const quietConsole = Object.create(console);
quietConsole.error = () => {};

function loadBrowserClass(fileName, className, globals = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', fileName), 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: quietConsole,
        process,
        require,
        nw: {},
        ...globals
    });
}

test('DatabaseManager saveAllData excludes controller-owned MapInfos.json', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-database-save-'));
    const dataPath = path.join(tempRoot, 'data');
    const mapInfosPath = path.join(dataPath, 'MapInfos.json');
    fs.mkdirSync(dataPath);
    fs.writeFileSync(mapInfosPath, '[null,{"id":1,"name":"Controller copy"}]', 'utf8');
    manager.data.mapInfos = [null, { id: 1, name: 'Stale database copy' }];

    try {
        assert.equal(await manager.saveAllData(tempRoot), true);
        assert.equal(
            fs.readFileSync(mapInfosPath, 'utf8'),
            '[null,{"id":1,"name":"Controller copy"}]'
        );
        assert.equal(manager.dataFiles.some(([, fileName]) => fileName === 'MapInfos.json'), false);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('DatabaseManager saveAllData propagates a file failure after attempting all files', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const attempted = [];
    manager.saveJSON = async (_projectPath, fileName) => {
        attempted.push(fileName);
        return fileName !== 'Items.json';
    };

    assert.equal(await manager.saveAllData('/project'), false);
    assert.deepEqual(attempted, Array.from(manager.dataFiles, (entry) => entry[1]));
    assert.equal(attempted.includes('MapInfos.json'), false);
});

test('DatabaseManager rejects malformed JSON without replacing the loaded database', async () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-malformed-database-'));
    const dataPath = path.join(tempRoot, 'data');
    fs.mkdirSync(dataPath);
    for (const [key, fileName] of manager.dataFiles) {
        const data = key === 'system' ? {} : [null];
        fs.writeFileSync(path.join(dataPath, fileName), JSON.stringify(data));
    }
    fs.writeFileSync(path.join(dataPath, 'MapInfos.json'), '[null]');
    fs.writeFileSync(path.join(dataPath, 'Items.json'), '[null,{');
    const previousItems = manager.data.items;

    try {
        assert.equal(await manager.loadAllData(tempRoot), false);
        assert.equal(manager.data.items, previousItems, 'partial loads are not committed');
        assert.equal(fs.readFileSync(path.join(dataPath, 'Items.json'), 'utf8'), '[null,{');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('TilemapManager snapshots persisted map data and only clears dirty state after a successful save', () => {
    const TilemapManager = loadBrowserClass('TilemapManager.js', 'TilemapManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-map-save-'));
    const dataPath = path.join(tempRoot, 'data');
    fs.mkdirSync(dataPath);
    const manager = new TilemapManager(null, tempRoot, {});
    manager.currentMap = {
        id: 1,
        name: 'Editor-only name',
        width: 2,
        height: 1,
        data: new Array(12).fill(0),
        events: [null]
    };

    try {
        manager.captureSavedMapState();
        assert.equal(manager.isMapDirty(), false);

        manager.currentMap.data[0] = 7;
        assert.equal(manager.isMapDirty(), true);
        assert.equal(manager.saveMap(), true);
        assert.equal(manager.isMapDirty(), false);

        const saved = JSON.parse(fs.readFileSync(path.join(dataPath, 'Map001.json'), 'utf8'));
        assert.equal(saved.data[0], 7);
        assert.equal('id' in saved, false);
        assert.equal('name' in saved, false);

        manager.currentMap.data[1] = 9;
        manager.fs = {
            writeFileSync() {
                throw new Error('disk full');
            }
        };
        assert.equal(manager.saveMap(), false);
        assert.equal(manager.isMapDirty(), true, 'failed saves preserve the previous snapshot');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('ProjectController saveAll stops immediately when map or database persistence fails', async () => {
    const alerts = [];
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        alert: (message) => alerts.push(message)
    });
    const calls = [];
    const databaseManager = {
        isDirty: () => true,
        saveAllData: async () => {
            calls.push('database');
            return false;
        }
    };
    const projectManager = {
        saveProject: async () => {
            calls.push('project');
            return true;
        }
    };
    const uiManager = {
        updateStatus: (status) => calls.push(`status:${status}`)
    };
    const controller = new ProjectController(projectManager, databaseManager, uiManager);
    controller.projectLoaded = true;
    controller.currentProject = { path: '/project', name: 'Safety Test', maps: [] };
    controller.tilemapManager = {
        currentMap: { id: 1 },
        saveMap: () => false
    };

    assert.equal(await controller.saveAll(), false);
    assert.equal(calls.includes('database'), false, 'database is not saved after map failure');
    assert.equal(calls.includes('project'), false, 'project is not saved after map failure');

    calls.length = 0;
    controller.tilemapManager.saveMap = () => {
        calls.push('map');
        return true;
    };
    assert.equal(await controller.saveAll(), false);
    assert.deepEqual(calls.filter((call) => !call.startsWith('status:')), ['map', 'database']);
    assert.equal(alerts.length, 2);
});

test('ProjectController checks dirty state before deleting the loaded map', async () => {
    const responses = [true, false, false];
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        alert: () => {},
        confirm: () => responses.shift()
    });
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-delete-map-'));
    const dataPath = path.join(tempRoot, 'data');
    fs.mkdirSync(dataPath);
    const mapPath = path.join(dataPath, 'Map001.json');
    fs.writeFileSync(mapPath, '{}');

    const controller = new ProjectController(
        { saveMapInfos: () => true },
        { data: {}, isDirty: () => false },
        { updateStatus: () => {} }
    );
    controller.currentProject = {
        path: tempRoot,
        name: 'Delete Safety',
        maps: [null, { id: 1, name: 'Dirty Map' }, { id: 2, name: 'Safe Map' }]
    };
    controller.tilemapManager = {
        currentMap: { id: 1 },
        isMapDirty: () => true,
        saveMap: () => true
    };

    try {
        await controller.deleteMap(1);
        assert.equal(fs.existsSync(mapPath), true, 'canceling the dirty prompt keeps the map file');
        assert.equal(controller.currentProject.maps[1].name, 'Dirty Map');
        assert.deepEqual(responses, []);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('closing a project drops the old tilemap manager before a same-project reopen', async () => {
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', { nw: undefined });
    let destroyed = false;
    const controller = new ProjectController(
        {},
        { data: {}, isDirty: () => false },
        { showWelcomeScreen: () => {}, updateStatus: () => {} }
    );
    controller.projectLoaded = true;
    controller.currentProject = { path: '/project', maps: [] };
    controller.lastLoadedProjectPath = '/project';
    controller.tilemapManager = {
        isMapDirty: () => false,
        destroy: () => { destroyed = true; }
    };

    await controller.closeProject();
    assert.equal(destroyed, true);
    assert.equal(controller.tilemapManager, null);
    assert.equal(controller.lastLoadedProjectPath, null);
});

test('a failed database load leaves the controller in a safe no-project state', async () => {
    const alerts = [];
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        alert: (message) => alerts.push(message),
        nw: undefined
    });
    let destroyed = false;
    const controller = new ProjectController(
        {},
        { data: {}, loadAllData: async () => false, isDirty: () => false },
        {
            showWelcomeScreen: async () => {},
            updateStatus: () => {}
        }
    );
    controller.currentProject = { path: '/invalid', name: 'Invalid', maps: [] };
    controller.projectLoaded = true;
    controller.lastLoadedProjectPath = '/previous';
    controller.tilemapManager = { destroy: () => { destroyed = true; } };

    await controller.populateProjectUI();
    assert.equal(destroyed, true);
    assert.equal(controller.projectLoaded, false);
    assert.equal(controller.currentProject, null);
    assert.equal(controller.tilemapManager, null);
    assert.equal(alerts.length, 1);
});

test('map deletion reports metadata persistence failures instead of success', async () => {
    const alerts = [];
    const statuses = [];
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        alert: (message) => alerts.push(message),
        confirm: () => true
    });
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-delete-failure-'));
    const dataPath = path.join(tempRoot, 'data');
    fs.mkdirSync(dataPath);
    fs.writeFileSync(path.join(dataPath, 'Map001.json'), '{}');
    fs.writeFileSync(path.join(dataPath, 'Map002.json'), '{}');

    const controller = new ProjectController(
        { saveMapInfos: () => false },
        { data: { system: { startMapId: 2 } }, isDirty: () => false },
        { updateStatus: (status) => statuses.push(status) }
    );
    controller.currentProject = {
        path: tempRoot,
        maps: [null, { id: 1, name: 'Delete Me' }, { id: 2, name: 'Keep Me' }]
    };
    controller.tilemapManager = { currentMap: { id: 2 }, isMapDirty: () => false };

    try {
        await controller.deleteMap(1);
        assert.equal(statuses.some((status) => status.startsWith('Deleted map:')), false);
        assert.equal(alerts.includes('Failed to delete map. Check console for details.'), true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
