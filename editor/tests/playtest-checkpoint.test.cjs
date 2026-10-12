const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const managers = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
const scenes = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_scenes.js'), 'utf8');
const core = runtimeSource('reactor_core.js');

function loadCheckpointApi({ test = true, allDead = false, mapId = 3, saveOk = true, maxSavefiles = 20, onDisk = [] } = {}) {
    const start = managers.indexOf('DataManager.PLAYTEST_CHECKPOINT_ID = "checkpoint";');
    const end = managers.indexOf('DataManager.savefileExists = function(savefileId) {', start);
    assert.ok(start >= 0 && end > start);
    const saves = onDisk.slice();
    const context = {
        DataManager: { maxSavefiles: () => maxSavefiles, savefileExists: id => saves.includes(id), saveGame: id => { saves.push(id); return saveOk ? Promise.resolve() : Promise.reject(new Error('disk')); } },
        Utils: { isOptionValid: name => name === 'test' && test },
        $gameParty: { isAllDead: () => allDead }, $gameMap: { mapId: () => mapId },
        $gameSystem: { onBeforeSave() { context.beforeSave = (context.beforeSave || 0) + 1; } },
        console: { info() {}, warn() {} }, Promise
    };
    vm.runInNewContext(managers.slice(start, end), context);
    return { DataManager: context.DataManager, saves, context };
}

test('a playtest saves a checkpoint after a battle, only in test mode, only with a living party on a map', async () => {
    let api = loadCheckpointApi();
    assert.equal(await api.DataManager.savePlaytestCheckpoint('after battle'), true);
    assert.deepEqual(api.saves, ['checkpoint'], 'a file of its own name, not a numbered slot');
    assert.equal(api.context.beforeSave, 1, 'the system stamps the save first');
    assert.equal(api.DataManager.hasPlaytestCheckpoint(), true);
    api = loadCheckpointApi({ test: false });
    assert.equal(await api.DataManager.savePlaytestCheckpoint('x'), false, 'a deployed game never writes one');
    assert.equal(api.DataManager.hasPlaytestCheckpoint(), false);
    api = loadCheckpointApi({ allDead: true });
    assert.equal(await api.DataManager.savePlaytestCheckpoint('x'), false, 'not a dead party');
    api = loadCheckpointApi({ mapId: 0 });
    assert.equal(await api.DataManager.savePlaytestCheckpoint('x'), false, 'not before a map exists');
    api = loadCheckpointApi({ saveOk: false });
    assert.equal(await api.DataManager.savePlaytestCheckpoint('x'), false, 'a failed write is reported, not thrown');
    assert.equal(api.DataManager._playtestCheckpointBusy, false, 'and does not wedge the next one');
});

test('the checkpoint hooks are where MZ autosaves, F9 reaches the title scene, and the title art says nothing', () => {
    assert.match(scenes, /Scene_Battle\.prototype\.terminate = function\(\) \{[\s\S]*?if \(!BattleManager\.isBattleTest\(\) && DataManager\.isPlaytestCheckpointEnabled\(\)\) \{\n\s*DataManager\.savePlaytestCheckpoint\("after battle"\);/);
    assert.match(scenes, /Scene_Map\.prototype\.onTransferEnd = function\(\) \{[\s\S]*?DataManager\.savePlaytestCheckpoint\("map " \+ \$gameMap\.mapId\(\)\);/);
    assert.doesNotMatch(scenes, /createPlaytestCheckpointHint|resume playtest checkpoint/, 'nothing about the checkpoint is drawn on the title art');
    assert.match(scenes, /Scene_Title\.prototype\.resumePlaytestCheckpoint = function\(\) \{[\s\S]*?DataManager\.loadGame\(DataManager\.playtestCheckpointId\(\)\)[\s\S]*?\$gameSystem\.onAfterLoad\(\);/);
    assert.match(core, /case 120: \/\/ F9[\s\S]*?resumePlaytestCheckpoint\(\);/);
});

// Reported from Haven: "Cannot read properties of null (reading 'displayName')"
// in the console every time a battle ended. The checkpoint's write is
// asynchronous, and its `.then` ran makeSavefileInfo frames later -- while the
// map that follows the battle was loading and DataManager.loadDataFile was
// holding $dataMap at null. VisuStella SaveCore names the map in its savefile
// info, so it threw inside the promise: the file was written and the save list
// never learned about it.
test('a save reads its list entry while the moment is still true, not after the write lands', async () => {
    const start = managers.indexOf('DataManager.saveGame = function(savefileId) {');
    const end = managers.indexOf('DataManager.loadGame = function(savefileId) {', start);
    assert.ok(start >= 0 && end > start);

    let resolveWrite;
    const seen = [];
    const context = {
        console, Promise,
        StorageManager: { saveObject: () => new Promise(resolve => { resolveWrite = resolve; }) },
        DataManager: {
            _globalInfo: [],
            makeSaveContents: () => ({ party: 1 }),
            makeSavename: id => `file${id}`,
            saveGlobalInfo(info) { seen.push(['saveGlobalInfo', info.length]); },
            // What a plugin that names the map does.
            makeSavefileInfo() {
                seen.push(['makeSavefileInfo', context.$dataMap ? 'map' : 'NULL MAP']);
                return { mapname: context.$dataMap.displayName };
            }
        },
        $dataMap: { displayName: 'Haven' }
    };
    vm.runInNewContext(managers.slice(start, end), context);

    const saving = context.DataManager.saveGame(99);
    assert.deepEqual(seen, [['makeSavefileInfo', 'map']], 'the entry is read before the write is awaited');

    // The battle ends, the next map starts loading, and loadDataFile nulls the global.
    context.$dataMap = null;
    resolveWrite();
    assert.equal(await saving, 0, 'the save still completes over a map load');
    assert.deepEqual(seen[1], ['saveGlobalInfo', 100], 'and the save list is written');
    assert.equal(context.DataManager._globalInfo[99].mapname, 'Haven', 'with the map the save was taken on');
});

// Played: a playtest saves in a slot, walks through a door (the checkpoint is
// written, newer than the save), and Continue then opens the Load screen with
// its cursor past the end of the list -- row 98 of 51 under a plugin save
// screen -- because the checkpoint was the newest entry of the save list.
function loadSaveList({ maxSavefiles = 20 } = {}) {
    const from = (a, b) => { const start = managers.indexOf(a), end = managers.indexOf(b, start); assert.ok(start >= 0 && end > start, a); return managers.slice(start, end); };
    const stored = [];
    const context = {
        DataManager: { PLAYTEST_CHECKPOINT_ID: 'checkpoint', LEGACY_PLAYTEST_CHECKPOINT_ID: 99, maxSavefiles: () => maxSavefiles, savefileExists: () => true },
        StorageManager: { saveObject: (name, value) => stored.push(JSON.parse(JSON.stringify(value))) }, Math
    };
    vm.runInNewContext(from('DataManager.removeInvalidGlobalInfo = function() {', 'DataManager.isGlobalInfoLoaded = function() {')
        + from('DataManager.isAnySavefileExists = function() {', 'DataManager.emptySavefileId = function() {'), context);
    return { DataManager: context.DataManager, stored };
}
const withCheckpoint = saves => { const list = saves.slice(); list[99] = { timestamp: 500 }; return list; };

test('the checkpoint never stays in the save list, so the newest save is one the player made', () => {
    let api = loadSaveList();
    // What saveGame does: the entry is set, then the list is written.
    api.DataManager.saveGlobalInfo(withCheckpoint([null, { timestamp: 10 }, { timestamp: 20 }]));
    assert.equal(api.DataManager.latestSavefileId(), 2, 'Load opens on the newest listed save');
    assert.equal(api.DataManager._globalInfo.length, 3, 'a plugin that walks the list finds no slot 99');
    assert.equal(api.stored[0].length, 3, 'and none is written to the save index');

    api = loadSaveList();
    api.DataManager.saveGlobalInfo(withCheckpoint([]));
    assert.equal(api.DataManager.isAnySavefileExists(), false, 'a checkpoint alone does not light Continue');

    api = loadSaveList();
    api.DataManager._globalInfo = withCheckpoint([null, { timestamp: 10 }]);
    api.DataManager.removeInvalidGlobalInfo();
    assert.equal(api.DataManager._globalInfo.length, 2, 'a save index written before this is cleaned as it loads');

    api = loadSaveList({ maxSavefiles: 120 });
    api.DataManager.saveGlobalInfo(withCheckpoint([null, { timestamp: 10 }]));
    assert.equal(api.DataManager.latestSavefileId(), 99, 'a game whose list reaches slot 99 keeps it');
});

// A plugin with a hundred save slots reached slot 99, which the checkpoint used to write over.
test('the checkpoint is a file of its own name; one left in slot 99 is read once, and never where the list reaches it', () => {
    assert.match(managers, /DataManager\.makeSavename = function\(savefileId\) \{\s*return "file%1"\.format\(savefileId\);/, 'the name gives filecheckpoint');
    assert.match(scenes, /DataManager\.loadGame\(DataManager\.playtestCheckpointId\(\)\)/, 'F9 loads whichever exists');
    // Nothing on disk.
    assert.equal(loadCheckpointApi().DataManager.playtestCheckpointId(), null);
    // Left in slot 99 by a session of the earlier build: resumed from there.
    let api = loadCheckpointApi({ onDisk: [99] });
    assert.equal(api.DataManager.playtestCheckpointId(), 99);
    assert.equal(api.DataManager.hasPlaytestCheckpoint(), true);
    // The next checkpoint is written under the name, and wins from then on.
    return api.DataManager.savePlaytestCheckpoint('transfer').then(() => {
        assert.deepEqual(api.saves, [99, 'checkpoint'], 'slot 99 is not written again');
        assert.equal(api.DataManager.playtestCheckpointId(), 'checkpoint');
        // A game whose list reaches slot 99: that file is the player's save, never the checkpoint.
        api = loadCheckpointApi({ onDisk: [99], maxSavefiles: 120 });
        assert.equal(api.DataManager.playtestCheckpointId(), null);
        api = loadCheckpointApi({ onDisk: [99], test: false });
        assert.equal(api.DataManager.playtestCheckpointId(), null, 'never in a deployed game');
        // The list: the named entry saveGame leaves is dropped; a player's slot 99 stays.
        const list = loadSaveList({ maxSavefiles: 120 });
        const saved = [null, { timestamp: 10 }]; saved[99] = { timestamp: 30 }; saved.checkpoint = { timestamp: 500 };
        list.DataManager.saveGlobalInfo(saved);
        assert.equal('checkpoint' in list.DataManager._globalInfo, false);
        assert.equal(list.DataManager.latestSavefileId(), 99, 'the player\'s own slot 99 is theirs');
    });
});
