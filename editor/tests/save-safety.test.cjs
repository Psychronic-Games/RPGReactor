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
    // A project that never authored a user interface gains no file for it.
    const expected = Array.from(manager.dataFiles, (entry) => entry[1]).filter((name) => name !== 'UserInterfaces.json');
    assert.deepEqual(attempted, expected);
    assert.equal(attempted.includes('MapInfos.json'), false);

    attempted.length = 0;
    manager.data.userInterfaces = [null, { id: 1, name: 'Menu', nodes: [] }];
    await manager.saveAllData('/project');
    assert.deepEqual(attempted, Array.from(manager.dataFiles, (entry) => entry[1]));
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

test('map allocation and insertion preserve IDs, sibling hierarchy, and local ordering', () => {
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
    const rootPlacement = controller.getMapInsertPlacement(1);
    assert.deepEqual({ ...rootPlacement }, { parentId: 0, order: 0.5 });
    controller.currentProject.maps[5] = { id: 5, parentId: rootPlacement.parentId, order: rootPlacement.order };
    controller.recalculateMapOrder(0);
    assert.deepEqual(
        controller.currentProject.maps.filter(map => map && map.parentId === 0).sort((a, b) => a.order - b.order).map(map => map.id),
        [1, 5, 2]
    );

    const childPlacement = controller.getMapInsertPlacement(3);
    assert.deepEqual({ ...childPlacement }, { parentId: 1, order: 0.5 });
    controller.currentProject.maps[6] = { id: 6, parentId: childPlacement.parentId, order: childPlacement.order };
    controller.recalculateMapOrder(1);
    assert.deepEqual(
        controller.currentProject.maps.filter(map => map && map.parentId === 1).sort((a, b) => a.order - b.order).map(map => map.id),
        [3, 6, 4]
    );

    const fallbackPlacement = controller.getMapInsertPlacement(null);
    assert.deepEqual({ ...fallbackPlacement }, { parentId: 0, order: 3 });

    let modalArgs = null;
    controller.openMapPropertiesModal = (...args) => { modalArgs = args; };
    controller.tilemapManager = { currentMap: { id: 3 } };
    controller.createNewMap();
    assert.equal(modalArgs[1], true);
    assert.equal(modalArgs[2], 3, 'toolbar New Map defaults to the highlighted map');
    controller.createNewMap(2);
    assert.equal(modalArgs[2], 2, 'context-menu New Map preserves its explicit target');

    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
    assert.match(source, /mapCtx\.newMap'\), action: \(\) => this\.createNewMap\(mapId\)/);
    assert.match(source, /const placement = this\.getMapInsertPlacement\(this\.newMapPlacementAnchorId\)/);
    assert.match(source, /parentId: placement\.parentId/);
    assert.match(source, /this\.recalculateMapOrder\(placement\.parentId\)/);
});

test('a new map that cannot be written leaves no entry in the map tree', async () => {
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        document: { getElementById: () => ({ value: '10', checked: false }) },
        alert: () => {}
    });

    function makeController() {
        const controller = Object.create(ProjectController.prototype);
        controller.currentProject = {
            path: '/tmp/does-not-matter',
            maps: [
                null,
                { id: 1, name: 'Town', parentId: 0, order: 0 },
                { id: 2, name: 'Field', parentId: 0, order: 1 },
                { id: 3, name: 'Cave', parentId: 0, order: 2 }
            ]
        };
        controller.currentEditingMap = { id: 4, data: [1], events: [] };
        controller.isCreatingNewMap = true;
        controller.newMapPlacementAnchorId = 1;
        controller.getEncounterListFromForm = () => [];
        controller.renderMapsList = () => {};
        controller.uiManager = { updateStatus: () => {} };
        controller.projectManager = { saveMapInfos: () => true };
        controller.writeMapDataFile = () => true;
        return controller;
    }

    const beforeInsert = JSON.stringify(makeController().currentProject.maps);
    // The map file itself fails to write.
        const mapFileFails = makeController();
        mapFileFails.writeMapDataFile = () => false;
        assert.equal(await mapFileFails.saveMapProperties(), false);
        assert.equal(JSON.stringify(mapFileFails.currentProject.maps), beforeInsert,
            'a failed map write leaves the map list exactly as it was');

        // The map file writes, but MapInfos does not.
        const mapInfosFails = makeController();
        mapInfosFails.projectManager = { saveMapInfos: () => false };
        assert.equal(await mapInfosFails.saveMapProperties(), false);
        assert.equal(JSON.stringify(mapInfosFails.currentProject.maps), beforeInsert,
            'a failed MapInfos write rolls back the inserted entry and sibling order');

        // The success path still inserts after the anchor and renumbers siblings.
        const succeeds = makeController();
        await succeeds.saveMapProperties();
        assert.equal(succeeds.currentProject.maps[4].id, 4, 'a successful save keeps the new map');
        assert.deepEqual(
            succeeds.currentProject.maps.filter(Boolean).sort((a, b) => a.order - b.order).map(map => map.id),
        [1, 4, 2, 3],
        'the new map lands directly after its anchor'
    );
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

test('browser Save awaits the host flush before reporting success', async () => {
    let releaseFlush;
    const flushGate = new Promise(resolve => { releaseFlush = resolve; });
    const statuses = [];
    const window = {
        addEventListener() {},
        RPGReactorHost: { mode: 'web', flush: () => flushGate }
    };
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        window,
        alert: () => {}
    });
    const controller = new ProjectController(
        { saveProject: async () => true },
        { data: {}, savedState: {}, saveAllData: async () => true },
        { updateStatus: status => statuses.push(status) }
    );
    controller.projectLoaded = true;
    controller.currentProject = { path: '/project', name: 'Web', maps: [] };
    controller.tilemapManager = null;
    controller.updateWindowTitle = () => {};
    let captured = 0;
    controller.captureProjectSavedState = () => { captured++; };

    let settled = false;
    const save = controller.saveAll().then(result => { settled = true; return result; });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(captured, 0);
    assert.equal(statuses.includes('All files saved'), false);

    releaseFlush();
    assert.equal(await save, true);
    assert.equal(captured, 1);
    assert.equal(statuses.at(-1), 'All files saved');
});

test('browser Save reports flush errors and restores dirty-state baselines', async () => {
    const statuses = [];
    const alerts = [];
    const window = {
        addEventListener() {},
        RPGReactorHost: {
            mode: 'web',
            flush: async () => { throw new Error('QuotaExceededError'); }
        }
    };
    const databaseManager = {
        data: {},
        savedState: { actors: 'old database' },
        isDirty() { return this.savedState.actors !== 'new database'; },
        saveAllData: async function() {
            this.savedState = { actors: 'new database' };
            return true;
        }
    };
    const ProjectController = loadBrowserClass('ProjectController.js', 'ProjectController', {
        window,
        alert: message => alerts.push(message)
    });
    const controller = new ProjectController(
        { saveProject: async project => { project.modified = 'new'; return true; } },
        databaseManager,
        { updateStatus: status => statuses.push(status) }
    );
    controller.projectLoaded = true;
    controller.currentProject = { path: '/project', name: 'Web', maps: [] };
    const projectBaseline = controller.serializeProjectState();
    controller.savedProjectState = projectBaseline;
    controller.savedMapInfosState = JSON.stringify(controller.currentProject.maps);
    controller.tilemapManager = {
        currentMap: { id: 1 },
        savedMapState: 'old map',
        savedSidecarState: 'old sidecar',
        saveMap() {
            this.savedMapState = 'new map';
            this.savedSidecarState = 'new sidecar';
            return true;
        },
        isMapDirty() { return this.savedMapState !== 'new map'; }
    };
    let captured = 0;
    controller.captureProjectSavedState = () => { captured++; };

    assert.equal(await controller.saveAll(), false);
    assert.equal(controller.savedProjectState, projectBaseline);
    assert.equal(controller.savedMapInfosState, JSON.stringify(controller.currentProject.maps));
    assert.equal(databaseManager.savedState.actors, 'old database');
    assert.equal(Object.keys(databaseManager.savedState).length, 1);
    assert.equal(controller.tilemapManager.savedMapState, 'old map');
    assert.equal(controller.tilemapManager.savedSidecarState, 'old sidecar');
    assert.equal(captured, 0);
    assert.equal(statuses.at(-1), 'Error saving to browser storage');
    assert.equal(statuses.includes('All files saved'), false);
    assert.equal(alerts.length, 1);
    assert.equal(controller.hasUnsavedChanges(), true, 'the failed Save remains visibly dirty');
});

test('malformed Reactor 3D sidecars are not overwritten by normal saves', async () => {
    const RRMapElevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
    const RRTileset3DClass = require(path.join(editorRoot, 'src', 'utils', 'Tileset3DClass.js'));
    const TilemapManager = loadBrowserClass('TilemapManager.js', 'TilemapManager', { RRMapElevation });
    const DatabaseManager = loadBrowserClass('DatabaseManager.js', 'DatabaseManager', { RRTileset3DClass });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-malformed-r3d-save-'));
    const dataPath = path.join(root, 'data');
    fs.mkdirSync(dataPath);
    const mapSidecar = path.join(dataPath, 'Map001.r3d.json');
    const tilesetSidecar = path.join(dataPath, 'Tilesets.r3d.json');
    fs.writeFileSync(mapSidecar, '{ broken map sidecar');
    fs.writeFileSync(tilesetSidecar, '{ broken tileset sidecar');

    try {
        const tilemap = new TilemapManager(null, root, {});
        tilemap.currentMap = {
            id: 1, width: 1, height: 1, data: new Array(6).fill(0), events: [null]
        };
        tilemap.captureSavedMapState();
        tilemap.currentMap.data[0] = 1;
        assert.equal(tilemap.loadMapSidecar(tilemap.currentMap), false);
        assert.equal(tilemap.saveMap(), false);
        assert.equal(fs.readFileSync(mapSidecar, 'utf8'), '{ broken map sidecar');
        assert.equal(tilemap.isMapDirty(), true, 'a refused sidecar save remains dirty');

        const database = new DatabaseManager();
        database.data.tileset3d = await database.loadTileset3D(root);
        assert.ok(database.tileset3DLoadError);
        assert.equal(await database.saveTileset3D(root), false);
        assert.equal(fs.readFileSync(tilesetSidecar, 'utf8'), '{ broken tileset sidecar');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
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
