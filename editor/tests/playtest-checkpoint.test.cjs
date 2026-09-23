const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const managers = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_managers.js'), 'utf8');
const scenes = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_scenes.js'), 'utf8');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

function loadCheckpointApi({ test = true, allDead = false, mapId = 3, saveOk = true } = {}) {
    const start = managers.indexOf('DataManager.PLAYTEST_CHECKPOINT_ID = 99;');
    const end = managers.indexOf('DataManager.savefileExists = function(savefileId) {', start);
    assert.ok(start >= 0 && end > start);
    const saves = [];
    const context = {
        DataManager: { savefileExists: id => saves.includes(id), saveGame: id => { saves.push(id); return saveOk ? Promise.resolve() : Promise.reject(new Error('disk')); } },
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
    assert.deepEqual(api.saves, [99]);
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
    assert.match(scenes, /Scene_Title\.prototype\.resumePlaytestCheckpoint = function\(\) \{[\s\S]*?DataManager\.loadGame\(DataManager\.PLAYTEST_CHECKPOINT_ID\)[\s\S]*?\$gameSystem\.onAfterLoad\(\);/);
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
