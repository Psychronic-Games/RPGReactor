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
    const itemsPath = path.join(dataPath, 'Items.json');
    fs.writeFileSync(itemsPath, '\uFEFF[null,{"id":1,"name":"药草"}]');
    const previousItems = manager.data.items;

    try {
        const nativeFs = manager.fs;
        let itemReads = 0;
        manager.fs = Object.create(nativeFs);
        manager.fs.readFileSync = (filePath, ...args) => {
            if (filePath === itemsPath && itemReads++ === 0) return '[null,{';
            return nativeFs.readFileSync(filePath, ...args);
        };
        assert.equal(await manager.loadAllData(tempRoot), true);
        assert.equal(manager.data.items[1].name, '药草');
        assert.equal(itemReads, 2, 'a transient partial database read is retried');

        manager.fs = nativeFs;
        fs.writeFileSync(itemsPath, '[null,{');
        const loadedItems = manager.data.items;
        assert.equal(await manager.loadAllData(tempRoot), false);
        assert.equal(manager.data.items, loadedItems, 'partial loads are not committed');
        assert.notEqual(manager.data.items, previousItems);
        assert.equal(fs.readFileSync(itemsPath, 'utf8'), '[null,{');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('DatabaseManager enforces RPG Maker database maximums without growing oversized imports', () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    const template = { id: 0, name: '', values: [] };

    assert.equal(manager.getMaximumEntries('actors'), 9999);
    assert.equal(manager.getMaximumEntries('animations'), 1000);
    assert.equal(manager.getMaximumEntries('tilesets'), 1000);
    assert.equal(manager.getMaximumEntries('elements'), 512);

    manager.data.actors = [null];
    assert.equal(manager.changeMaximum('actors', 3, template), true);
    assert.equal(manager.data.actors.length, 4);
    assert.notEqual(manager.data.actors[1], manager.data.actors[2]);
    assert.equal(manager.changeMaximum('actors', 10000, template), false);
    assert.equal(manager.changeMaximum('actors', 99999, template), false);
    assert.equal(manager.changeMaximum('actors', 2.5, template), false);
    assert.equal(manager.data.actors.length, 4);

    manager.data.animations = [null];
    assert.equal(manager.changeMaximum('animations', 1001, template), false);
    manager.data.tilesets = [null];
    assert.equal(manager.changeMaximum('tilesets', 9999, template), false);

    manager.data.actors = new Array(10002);
    assert.equal(manager.changeMaximum('actors', 10000, template), true, 'oversized imports can be reduced');
    assert.equal(manager.data.actors.length, 10001);
    assert.equal(manager.changeMaximum('actors', 10001, template), false, 'oversized imports cannot regrow');
});

test('DatabaseManager addEntry stops at the database maximum', () => {
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager');
    const manager = new DatabaseManager();
    manager.data.animations = new Array(1001);

    assert.equal(manager.addEntry('animations', { name: 'Too many' }), null);
    assert.equal(manager.data.animations.length, 1001);
});

test('map allocation supports IDs above 1000, reuses holes, and bounds live map count', () => {
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController');
    const controller = Object.create(ProjectController.prototype);
    controller.currentProject = { maps: [null] };
    for (let id = 1; id <= 1000; id++) controller.currentProject.maps[id] = { id };

    assert.equal(controller.getNextAvailableMapId(), 1001);
    controller.currentProject.maps[500] = null;
    assert.equal(controller.getNextMapId(), 500);

    controller.currentProject.maps = [null];
    for (let id = 1; id <= 2000; id++) controller.currentProject.maps[id] = { id };
    assert.equal(controller.getNextAvailableMapId(), 0);

    const runtime = fs.readFileSync(path.resolve(editorRoot, '..', 'runtime', 'reactor_managers.js'), 'utf8');
    assert.match(runtime, /"Map%1\.json"\.format\(mapId\.padZero\(3\)\)/);
    assert.equal(String(1000).padStart(3, '0'), '1000');

    controller.currentProject.maps = [
        null,
        { id: 1, name: 'Folder', parentId: 0, order: 0 },
        { id: 2, name: 'Other root', parentId: 0, order: 1 },
        { id: 3, name: 'Child A', parentId: 1, order: 0 },
        { id: 4, name: 'Child B', parentId: 1, order: 1 }
    ];
    const rootPlacement = controller.getMapPastePlacement(1);
    assert.deepEqual({ ...rootPlacement }, { parentId: 0, order: 0.5 });
    controller.currentProject.maps[5] = { id: 5, parentId: rootPlacement.parentId, order: rootPlacement.order };
    controller.recalculateMapOrder(0);
    assert.deepEqual(
        controller.currentProject.maps.filter(map => map && map.parentId === 0).sort((a, b) => a.order - b.order).map(map => map.id),
        [1, 5, 2]
    );

    const childPlacement = controller.getMapPastePlacement(3);
    assert.deepEqual({ ...childPlacement }, { parentId: 1, order: 0.5 });
    controller.currentProject.maps[6] = { id: 6, parentId: childPlacement.parentId, order: childPlacement.order };
    controller.recalculateMapOrder(1);
    assert.deepEqual(
        controller.currentProject.maps.filter(map => map && map.parentId === 1).sort((a, b) => a.order - b.order).map(map => map.id),
        [3, 6, 4]
    );

    const fallbackPlacement = controller.getMapPastePlacement(null);
    assert.deepEqual({ ...fallbackPlacement }, { parentId: 0, order: 3 });
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
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        alert: () => {},
        confirm: () => true
    });
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-delete-map-'));
    const dataPath = path.join(tempRoot, 'data');
    fs.mkdirSync(dataPath);
    const mapPath = path.join(dataPath, 'Map001.json');
    fs.writeFileSync(mapPath, '{}');

    const controller = new ProjectController(
        { saveMapInfos: () => true },
        { data: {}, isDirty: () => false },
        { updateStatus: () => {}, promptUnsavedChanges: async () => 'cancel' }
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
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('discard closes projects and applications without saving', async () => {
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', { nw: undefined });
    let destroyed = false;
    let saves = 0;
    const controller = new ProjectController(
        {},
        { data: {}, isDirty: () => true },
        {
            showWelcomeScreen: () => {},
            updateStatus: () => {},
            promptUnsavedChanges: async () => 'discard'
        }
    );
    controller.projectLoaded = true;
    controller.currentProject = { path: '/project', maps: [] };
    controller.lastLoadedProjectPath = '/project';
    controller.tilemapManager = {
        isMapDirty: () => false,
        destroy: () => { destroyed = true; }
    };
    controller.saveAll = async () => { saves++; return true; };

    await controller.closeProject();
    assert.equal(saves, 0, 'discard does not save the project');
    assert.equal(destroyed, true);
    assert.equal(controller.tilemapManager, null);
    assert.equal(controller.lastLoadedProjectPath, null);
    assert.equal(controller.currentProject, null);
    assert.equal(controller.hasUnsavedChanges(), false,
        'discarded database state cannot prompt again after the project closes');

    let forcedCloses = 0;
    const AppProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        nw: { Window: { get: () => ({ close: force => { if (force) forcedCloses++; } }) } }
    });
    const appController = new AppProjectController(
        {},
        { data: {}, isDirty: () => true },
        { promptUnsavedChanges: async () => 'discard' }
    );
    appController.currentProject = { path: '/project', maps: [] };
    appController.projectLoaded = true;
    appController.saveAll = async () => { saves++; return true; };
    assert.equal(await appController.requestApplicationClose(), true);
    assert.equal(saves, 0, 'discard does not save during application close');
    assert.equal(forcedCloses, 1);
    assert.equal(appController.allowApplicationClose, true);
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
