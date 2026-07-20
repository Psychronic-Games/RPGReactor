const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadBrowserClass(relativePath, className, globals = {}) {
    const source = fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: { log() {}, warn() {}, error() {} },
        alert() {},
        ...globals
    });
}

function loadClipboard(storage = new Map()) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ReactorClipboard.js'), 'utf8');
    const sandbox = {
        console: { warn() {} },
        require,
        localStorage: {
            getItem(key) { return storage.get(key) || null; },
            setItem(key, value) { storage.set(key, String(value)); }
        }
    };
    return vm.runInNewContext(`${source}\nReactorClipboard;`, sandbox);
}

function createTransport() {
    return {
        envelope: null,
        async write(type, payload) {
            this.envelope = JSON.parse(JSON.stringify({ type, payload }));
            return true;
        },
        async read(expectedType) {
            if (!this.envelope || (expectedType && this.envelope.type !== expectedType)) return null;
            return JSON.parse(JSON.stringify(this.envelope));
        },
        async readDetailed(expectedType) {
            return {
                available: !!this.envelope,
                envelope: await this.read(expectedType)
            };
        }
    };
}

function createDatabase({
    projectPath = null,
    elements = [''],
    skillTypes = [''],
    weaponTypes = [''],
    armorTypes = [''],
    equipTypes = [''],
    states = [null],
    skills = [null],
    commonEvents = [null]
} = {}) {
    const system = { elements, skillTypes, weaponTypes, armorTypes, equipTypes };
    return {
        projectPath,
        dataGeneration: 0,
        data: { system, states, skills, commonEvents },
        getSystem: () => system,
        getStates: () => states.filter(Boolean),
        getSkills: () => skills.filter(Boolean),
        getCommonEvents: () => commonEvents.filter(Boolean)
    };
}

test('ReactorClipboard exchanges typed payloads between isolated profiles', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-clipboard-test-'));
    const clipboardPath = path.join(tempRoot, 'clipboard.json');
    const sourceClipboard = loadClipboard(new Map());
    const targetClipboard = loadClipboard(new Map());
    sourceClipboard.getClipboardFilePath = () => clipboardPath;
    targetClipboard.getClipboardFilePath = () => clipboardPath;

    try {
        await sourceClipboard.write('map', { mapId: 4, mapData: { width: 20, height: 15 } });
        const received = await targetClipboard.read('map');
        assert.equal(received.payload.mapId, 4);
        assert.equal(received.payload.mapData.width, 20);
        assert.equal(await targetClipboard.read('databaseEntry'), null, 'typed payloads reject incompatible paste targets');
        const incompatible = await targetClipboard.readDetailed('databaseEntry');
        assert.equal(incompatible.available, true, 'an incompatible external payload remains authoritative');
        assert.equal(incompatible.envelope, null);
        fs.writeFileSync(clipboardPath, 'plain text', 'utf8');
        const plainText = await targetClipboard.readDetailed();
        assert.equal(plainText.available, true, 'plain external text must not resurrect an older typed payload');
        assert.equal(plainText.envelope, null);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('database records cross instances while preserving the destination ID', async () => {
    const transport = createTransport();
    const alerts = [];
    const DatabaseEditorUI = loadBrowserClass('src/DatabaseEditorUI.js', 'DatabaseEditorUI', {
        ReactorClipboard: transport,
        alert: message => alerts.push(message)
    });
    const source = Object.create(DatabaseEditorUI.prototype);
    source.currentProject = { name: 'Source Game', path: '/source' };
    source.listClipboard = null;
    source.updateStatus = () => {};
    source._t = key => key;
    source.copyListEntry({ id: 3, name: 'Transferred Hero', nickname: 'Cross-window' }, 'actors');

    assert.equal(transport.envelope.type, 'databaseEntry');
    assert.equal(transport.envelope.payload.databaseType, 'actors');
    assert.equal(transport.envelope.payload.entry.id, undefined, 'source IDs do not cross project boundaries');

    const target = Object.create(DatabaseEditorUI.prototype);
    const targetEntry = { id: 7, name: 'Old Hero' };
    target.currentProject = { name: 'Target Game', path: '/target' };
    target.listClipboard = { type: 'actors', entry: { name: 'Stale local copy' } };
    target.databaseManager = { data: { actors: [null, null, null, null, null, null, null, targetEntry] } };
    target._snapshotForUndo = () => {};
    target.updateStatus = () => {};
    target._t = key => key;
    target.showDatabaseDetail = () => {};
    const visibleEntries = [targetEntry];
    await target.pasteListEntry(targetEntry, visibleEntries, 'actors', () => {}, { value: '' }, {});

    assert.equal(target.databaseManager.data.actors[7].id, 7);
    assert.equal(target.databaseManager.data.actors[7].name, 'Transferred Hero');
    assert.equal(target.databaseManager.data.actors[7].nickname, 'Cross-window');

    await transport.write('databaseEntry', { databaseType: 'skills', entry: { name: 'Wrong category' } });
    await target.pasteListEntry(target.databaseManager.data.actors[7], visibleEntries, 'actors', () => {}, { value: '' }, {});
    assert.equal(target.databaseManager.data.actors[7].name, 'Transferred Hero', 'a stale local actor cannot mask a newer incompatible clipboard item');
    assert.deepEqual(alerts, ['db.noCompatibleClipboard']);

    await transport.write('databaseEntry', { databaseType: 'tilesets', entry: { name: 'Transferred Tileset', flags: [0, 1] } });
    const tilesetClipboard = await target.readDatabaseEntryClipboard('tilesets');
    assert.equal(tilesetClipboard.entry.name, 'Transferred Tileset');
});

test('database record batches overwrite consecutive target slots with independent data', async () => {
    const transport = createTransport();
    const DatabaseEditorUI = loadBrowserClass('src/DatabaseEditorUI.js', 'DatabaseEditorUI', {
        ReactorClipboard: transport
    });
    const source = Object.create(DatabaseEditorUI.prototype);
    source.currentProject = { name: 'Source Game', path: '/source' };
    source.updateStatus = () => {};
    source._t = key => key;
    source.copyListEntries([
        { id: 2, name: 'Hero A', traits: [{ code: 11, dataId: 1, value: 1 }] },
        { id: 5, name: 'Hero B', traits: [] },
        { id: 9, name: 'Hero C', traits: [] }
    ], 'actors');

    assert.equal(transport.envelope.payload.version, 2);
    assert.deepEqual(transport.envelope.payload.entries.map(entry => entry.name), ['Hero A', 'Hero B', 'Hero C']);
    assert.equal(transport.envelope.payload.entries.some(entry => 'id' in entry), false);

    const actors = Array.from({ length: 12 }, (_, id) => id === 0 ? null : { id, name: `Actor ${id}` });
    const target = Object.create(DatabaseEditorUI.prototype);
    target.currentProject = { name: 'Target Game', path: '/target' };
    target._listGeneration = 3;
    target.databaseManager = { dataGeneration: 1, data: { actors } };
    target._snapshotForUndo = () => {};
    target.updateStatus = () => {};
    target._t = key => key;
    target.showDatabaseDetail = () => {};
    const visibleEntries = actors.filter(Boolean);

    const pasted = await target.pasteListEntries(actors[7], visibleEntries, 'actors', () => {}, { value: '' }, {});
    assert.deepEqual(pasted.map(entry => entry.id), [7, 8, 9]);
    assert.deepEqual(actors.slice(7, 10).map(entry => entry.name), ['Hero A', 'Hero B', 'Hero C']);
    assert.notEqual(actors[7].traits, transport.envelope.payload.entries[0].traits);
    actors[7].traits[0].value = 0.5;
    assert.equal(transport.envelope.payload.entries[0].traits[0].value, 1);

    source.copyListEntries([
        { id: 1, name: 'Outside', flags: [0, 1] },
        { id: 2, name: 'Inside', flags: [2, 3] }
    ], 'tilesets');
    const tilesetClipboard = await target.readDatabaseEntryClipboard('tilesets');
    assert.deepEqual(tilesetClipboard.entries.map(entry => entry.name), ['Outside', 'Inside']);
    assert.notEqual(tilesetClipboard.entries[0].flags, transport.envelope.payload.entries[0].flags);
});

test('trait rows remap every project-defined reference by unique target name', async () => {
    const transport = createTransport();
    const DatabaseRowClipboard = loadBrowserClass('src/database/DatabaseRowClipboard.js', 'DatabaseRowClipboard', {
        ReactorClipboard: transport
    });
    const source = createDatabase({
        elements: ['', 'Fire'],
        skillTypes: ['', 'Magic'],
        weaponTypes: ['', 'Sword'],
        armorTypes: ['', 'Shield'],
        equipTypes: ['', 'Weapon'],
        states: [null, { id: 1, name: 'Poison' }],
        skills: [null, { id: 1, name: 'Guard' }]
    });
    const target = createDatabase({
        elements: ['', 'Ice', 'Fire'],
        skillTypes: ['', 'Special', 'Magic'],
        weaponTypes: ['', 'Axe', 'Sword'],
        armorTypes: ['', 'Body', 'Shield'],
        equipTypes: ['', 'Head', 'Weapon'],
        states: [null, { id: 1, name: 'Sleep' }, { id: 2, name: 'Poison' }],
        skills: [null, { id: 1, name: 'Heal' }, { id: 2, name: 'Guard' }]
    });
    const cases = [
        [11, 2], [13, 2], [14, 2], [31, 2], [32, 2],
        [35, 2], [41, 2], [42, 2], [43, 2], [44, 2],
        [51, 2], [52, 2], [53, 2], [54, 2]
    ];

    for (const [code, expectedId] of cases) {
        DatabaseRowClipboard.write('trait', { code, dataId: 1, value: 0.75 }, source);
        const result = await DatabaseRowClipboard.read('trait', target);
        assert.equal(result.error, undefined, `trait code ${code} should resolve`);
        assert.equal(result.row.dataId, expectedId, `trait code ${code} should use the target ID`);
        assert.equal(result.row.value, 0.75);
    }
});

test('effect rows remap database references while preserving sentinels and scalar IDs', async () => {
    const transport = createTransport();
    const DatabaseRowClipboard = loadBrowserClass('src/database/DatabaseRowClipboard.js', 'DatabaseRowClipboard', {
        ReactorClipboard: transport
    });
    const source = createDatabase({
        states: [null, { id: 1, name: 'Poison' }],
        skills: [null, { id: 1, name: 'Guard' }],
        commonEvents: [null, { id: 1, name: 'Door Open' }]
    });
    const target = createDatabase({
        states: [null, { id: 1, name: 'Sleep' }, { id: 2, name: 'Poison' }],
        skills: [null, { id: 1, name: 'Heal' }, { id: 2, name: 'Guard' }],
        commonEvents: [null, { id: 1, name: 'Door Close' }, { id: 2, name: 'Door Open' }]
    });

    for (const code of [21, 22, 43, 44]) {
        DatabaseRowClipboard.write('effect', { code, dataId: 1, value1: 0.5, value2: 0 }, source);
        const result = await DatabaseRowClipboard.read('effect', target);
        assert.equal(result.row.dataId, 2, `effect code ${code} should use the target ID`);
    }

    DatabaseRowClipboard.write('effect', { code: 21, dataId: 0, value1: 1, value2: 0 }, source);
    assert.equal((await DatabaseRowClipboard.read('effect', target)).row.dataId, 0, 'normal attack state remains a sentinel');
    DatabaseRowClipboard.write('effect', { code: 11, dataId: 6, value1: 0, value2: 0 }, source);
    assert.equal((await DatabaseRowClipboard.read('effect', target)).row.dataId, 6, 'parameter IDs remain scalar values');
});

test('portable rows preserve same-project IDs and remap after a project switch', async () => {
    const transport = createTransport();
    const DatabaseRowClipboard = loadBrowserClass('src/database/DatabaseRowClipboard.js', 'DatabaseRowClipboard', {
        ReactorClipboard: transport
    });
    const source = createDatabase({
        projectPath: '/source',
        states: [null, { id: 1, name: 'Poison' }, { id: 2, name: 'Poison' }]
    });
    const localPayload = DatabaseRowClipboard.write('trait', { code: 13, dataId: 1, value: 0.5 }, source);

    const localResult = await DatabaseRowClipboard.read('trait', source, localPayload);
    assert.equal(localResult.row.dataId, 1);

    const remapped = await DatabaseRowClipboard.read('trait', createDatabase({
        projectPath: '/target',
        states: [null, { id: 1, name: 'Sleep' }, { id: 2, name: 'Poison' }]
    }), localPayload);
    assert.equal(remapped.row.dataId, 2, 'reusing the same editor for another project must not retain the source ID');

    const missing = await DatabaseRowClipboard.read('trait', createDatabase({ projectPath: '/missing' }));
    assert.equal(missing.error, 'unresolved');

    const duplicates = createDatabase({
        projectPath: '/duplicates',
        states: [null, { id: 1, name: 'Poison' }, { id: 2, name: 'Poison' }]
    });
    const ambiguous = await DatabaseRowClipboard.read('trait', duplicates);
    assert.equal(ambiguous.error, 'unresolved');
});

test('portable row fallback is shared across editors and delayed targets are invalidated', async () => {
    const transport = createTransport();
    const DatabaseRowClipboard = loadBrowserClass('src/database/DatabaseRowClipboard.js', 'DatabaseRowClipboard', {
        ReactorClipboard: transport
    });
    const database = createDatabase({ projectPath: '/game', states: [null, { id: 1, name: 'Poison' }] });
    const payload = DatabaseRowClipboard.write('trait', { code: 13, dataId: 1, value: 0.5 }, database);
    transport.envelope = null;

    const fallback = await DatabaseRowClipboard.read('trait', database, null);
    assert.equal(fallback.row.dataId, 1, 'another editor can consume the shared in-window payload');

    await transport.write('databaseEffect', { version: 1, kind: 'effect', row: { code: 11, dataId: 0 } });
    const incompatible = await DatabaseRowClipboard.read('trait', database, payload);
    assert.equal(incompatible.error, 'incompatible', 'a newer incompatible external payload wins over local fallback');

    const parentEditor = { _detailGeneration: 4 };
    const project = {};
    const projectManager = { getCurrentProject: () => project };
    const rows = [{ code: 13, dataId: 1, value: 0.5 }];
    const target = DatabaseRowClipboard.capturePasteTarget(parentEditor, projectManager, database, rows, 0);
    assert.equal(DatabaseRowClipboard.isPasteTargetCurrent(target, parentEditor, projectManager, database, rows), true);
    parentEditor._detailGeneration++;
    assert.equal(DatabaseRowClipboard.isPasteTargetCurrent(target, parentEditor, projectManager, database, rows), false);
    parentEditor._detailGeneration--;
    database.dataGeneration++;
    assert.equal(DatabaseRowClipboard.isPasteTargetCurrent(target, parentEditor, projectManager, database, rows), false);
});

test('event commands, pages, and movement routes prefer the shared clipboard', async () => {
    const transport = createTransport();
    const windowStub = { I18n: { tText: text => text } };

    const CommonEventEditor = loadBrowserClass('src/database/DatabaseCommonEventEditor.js', 'DatabaseCommonEventEditor', {
        ReactorClipboard: transport,
        window: windowStub
    });
    const commonEditor = Object.create(CommonEventEditor.prototype);
    commonEditor.selectedCommandIndices = [0];
    commonEditor.expandToBlocks = () => [0];
    commonEditor.copyCommands({ list: [{ code: 101, indent: 0, parameters: ['', 0, 0, 2, 'Narrator'] }] });
    assert.equal(transport.envelope.type, 'eventCommands');

    const EventCommandList = loadBrowserClass('src/event/EventCommandList.js', 'EventCommandList', {
        ReactorClipboard: transport,
        window: windowStub
    });
    const commandList = Object.create(EventCommandList.prototype);
    commandList.clipboard = [{ code: 108, indent: 0, parameters: ['Stale local command'] }];
    commandList.selectedIndices = [];
    commandList._rebaseInsertIndent = () => {};
    commandList.refreshCommandList = () => {};
    const page = { list: [{ code: 0, indent: 0, parameters: [] }] };
    await commandList.pasteCommands(page, 0);
    assert.equal(page.list[0].code, 101, 'map events consume command blocks copied from common events');

    await transport.write('eventPage', { page: { conditions: {}, list: [{ code: 0, indent: 0, parameters: [] }] } });
    const EventEditor = loadBrowserClass('src/event/EventEditor.js', 'EventEditor', {
        ReactorClipboard: transport,
        document: { querySelector() { return null; } }
    });
    const eventEditor = Object.create(EventEditor.prototype);
    eventEditor.clipboard = { stale: true };
    eventEditor.currentEvent = { pages: [] };
    eventEditor.currentPageIndex = 0;
    await eventEditor.pasteEventPage();
    assert.equal(eventEditor.currentEvent.pages[0].stale, undefined);
    assert.equal(eventEditor.currentEvent.pages[0].list[0].code, 0);

    await transport.write('movementRouteCommands', { commands: [{ code: 3, parameters: [] }] });
    const MovementRouteEditor = loadBrowserClass('src/event/commands/SetMovementRouteEditor.js', 'SetMovementRouteEditor', {
        ReactorClipboard: transport
    });
    const routeEditor = Object.create(MovementRouteEditor.prototype);
    routeEditor.clipboard = [{ code: 1, parameters: [] }];
    routeEditor.moveRoute = { list: [{ code: 0, parameters: [] }] };
    routeEditor.selectedIndices = new Set();
    routeEditor.lastClickedIndex = -1;
    routeEditor.refreshCommandList = () => {};
    await routeEditor.pasteClipboard();
    assert.equal(routeEditor.moveRoute.list[0].code, 3);

    await transport.write('troopEventPage', { page: { conditions: { turnEnding: true }, span: 1, list: [{ code: 0, indent: 0, parameters: [] }] } });
    const TroopEditor = loadBrowserClass('src/database/DatabaseTroopEditor.js', 'DatabaseTroopEditor', {
        ReactorClipboard: transport
    });
    const troopEditor = Object.create(TroopEditor.prototype);
    troopEditor.battlePageClipboard = { stale: true };
    troopEditor.currentTroop = { pages: [{ conditions: {}, span: 0, list: [{ code: 0, indent: 0, parameters: [] }] }] };
    troopEditor.currentBattlePageIndex = 0;
    troopEditor.selectedCommandIndices = [];
    troopEditor.persistTroop = () => {};
    troopEditor.renderBattlePageTabs = () => {};
    troopEditor.renderBattlePageContent = () => {};
    await troopEditor.pasteBattlePage();
    assert.equal(troopEditor.currentTroop.pages[1].conditions.turnEnding, true);

    await transport.write('event', { event: { id: 2, name: 'Source Event', x: 1, y: 1, pages: [] } });
    const EventManager = loadBrowserClass('src/EventManager.js', 'EventManager', {
        ReactorClipboard: transport,
        window: windowStub
    });
    const eventManager = Object.create(EventManager.prototype);
    eventManager.clipboard = { name: 'Stale Event', cut: false };
    eventManager.currentMap = { events: [] };
    eventManager.getEventAt = () => null;
    eventManager.saveState = () => {};
    eventManager.getNextEventId = () => 8;
    eventManager.renderEvents = () => {};
    await eventManager.pasteEvent(12, 9);
    assert.equal(eventManager.currentMap.events[8].name, 'EV008');
    assert.equal(eventManager.currentMap.events[8].x, 12);
    assert.equal(eventManager.currentMap.events[8].pages.length, 0);
});
