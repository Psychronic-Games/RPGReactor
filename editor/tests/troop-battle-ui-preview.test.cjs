const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const PlaytestManager = require(path.join(editorRoot, 'src', 'PlaytestManager.js'));

// ---------------------------------------------------------------- helpers

// Objects built inside the vm context have that realm's prototypes, which
// strict deepEqual rejects; compare the data instead.
const plain = value => JSON.parse(JSON.stringify(value));

function loadClass(relative, className, extraContext = {}) {
    const source = fs.readFileSync(path.join(editorRoot, ...relative), 'utf8');
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) },
        window: {},
        localStorage: { getItem: () => null, setItem() {} },
        ...extraContext
    };
    context.window = context;
    return vm.runInNewContext(`${source}\n${className};`, context);
}

function manifest(entries) {
    return entries.map(([name, status, parameters]) => ({ name, status, description: '', parameters: parameters || {} }));
}

const BATTLE_CORE_SIDEVIEW_UI = {
    'BattleLayout:struct': JSON.stringify({ 'Style:str': 'sideview_ui', 'CommandWidth:num': '192', 'XPActorCommandLines:num': '4' })
};
const PARTY_SYSTEM_THREE = { 'General:struct': JSON.stringify({ 'MaxBattleMembers:num': '3' }) };
const OTB_TOP = { 'TurnOrder:struct': JSON.stringify({ 'DisplayPosition:str': 'top', 'SpriteThin:num': '72', 'SpriteLength:num': '72', 'UiSubjectText:str': '★' }) };

function troopEditor(DatabaseTroopEditor, actors = []) {
    const editor = Object.create(DatabaseTroopEditor.prototype);
    editor.screenWidth = 1280;
    editor.screenHeight = 800;
    editor.boxWidth = 1272;
    editor.boxHeight = 792;
    editor.databaseManager = {
        getActor: id => actors.find(a => a && a.id === id) || null,
        getClass: () => ({ params: [[0, 100, 120], [0, 20, 25]] }),
        getEnemies: () => [],
        getSystem: () => null
    };
    return editor;
}

// ---------------------------------------------------------------- detection

test('battle preview detects the VisuStella stack this project actually runs', () => {
    const DatabaseTroopEditor = loadClass(['src', 'database', 'DatabaseTroopEditor.js'], 'DatabaseTroopEditor');
    const actors = [{ id: 1, name: 'A', classId: 1 }, { id: 4, name: 'B', classId: 1 }, { id: 7, name: 'C', classId: 1 }, { id: 8, name: 'D', classId: 1 }];
    const editor = troopEditor(DatabaseTroopEditor, actors);
    const system = {
        optSideView: true, optDisplayTp: true, battleSystem: 0,
        testBattlers: [{ actorId: 1, level: 5 }, { actorId: 4, level: 1 }, { actorId: 0, level: 30 }, { actorId: 0, level: 30 }],
        partyMembers: [1, 8, 7, 6]
    };
    const setup = editor.detectBattleUISetup(system, manifest([
        ['VisuMZ_0_CoreEngine', true, { 'UI:struct': JSON.stringify({ 'RepositionActors:eval': 'true' }) }],
        ['VisuMZ_1_BattleCore', true, BATTLE_CORE_SIDEVIEW_UI],
        ['VisuMZ_2_BattleSystemOTB', true, OTB_TOP],
        ['VisuMZ_2_PartySystem', true, PARTY_SYSTEM_THREE],
        ['VisuMZ_3_SideviewBattleUI', false, {}]
    ]));

    assert.equal(setup.sideView, true);
    assert.equal(setup.turnSystem, 'otb');
    assert.equal(setup.turnOrder.position, 'top');
    assert.equal(setup.turnOrder.subjectText, '★');
    // sideview_ui with the plugin disabled is what BattleCore itself resolves to "default".
    assert.equal(setup.layoutStyle, 'default');
    assert.equal(setup.maxBattleMembers, 3);
    assert.equal(setup.repositionActors, true);
    // The test party wins over the starting party, and (None) slots are dropped.
    assert.deepEqual(setup.party.map(p => p.actor.id), [1, 4]);
    assert.deepEqual(setup.party.map(p => p.level), [5, 1]);
    assert.equal(setup.party[0].mhp, 120, 'MHP is read off the class curve at the slot level, clamped to the table');
    assert.equal(setup.boxX, 4);
    assert.equal(setup.boxY, 4);
});

test('battle preview falls back to the stock MZ battle for a project with no manifest or no VisuStella', () => {
    const DatabaseTroopEditor = loadClass(['src', 'database', 'DatabaseTroopEditor.js'], 'DatabaseTroopEditor');
    const actors = [{ id: 1, name: 'A', classId: 1 }, { id: 2, name: 'B', classId: 1 }];
    const editor = troopEditor(DatabaseTroopEditor, actors);
    const system = { optSideView: false, battleSystem: 1, testBattlers: [], partyMembers: [1, 2, 3] };

    const noManifest = editor.detectBattleUISetup(system, null);
    assert.equal(noManifest.hasManifest, false);
    assert.equal(noManifest.turnSystem, 'tpb');
    assert.equal(noManifest.layoutStyle, 'vanilla');
    assert.equal(noManifest.maxBattleMembers, 4);
    assert.equal(noManifest.sideView, false);
    // Starting party, minus the actor that does not exist.
    assert.deepEqual(noManifest.party.map(p => p.actor.id), [1, 2]);

    const vanilla = editor.detectBattleUISetup({ ...system, battleSystem: 0 }, manifest([
        ['SomeOtherPlugin', true, {}],
        ['VisuMZ_2_BattleSystemCTB', false, {}]
    ]));
    assert.equal(vanilla.turnSystem, 'turn');
    assert.equal(vanilla.layoutStyle, 'vanilla');

    const ctb = editor.detectBattleUISetup(system, manifest([
        ['VisuMZ_1_BattleCore', true, { 'BattleLayout:struct': JSON.stringify({ 'Style:str': 'xp', 'CommandWidth:num': '240' }) }],
        ['VisuMZ_2_BattleSystemCTB', true, {}]
    ]));
    assert.equal(ctb.turnSystem, 'ctb');
    assert.equal(ctb.turnOrder, null);
    assert.equal(ctb.layoutStyle, 'xp');
    assert.equal(ctb.commandWidth, 240);
});

test('battle preview reads the manifest the runtime loads, in either form', () => {
    const DatabaseTroopEditor = loadClass(['src', 'database', 'DatabaseTroopEditor.js'], 'DatabaseTroopEditor');
    const pretty = 'var $plugins = [\n    {\n        "name": "VisuMZ_1_BattleCore",\n        "status": true,\n        "parameters": {}\n    }\n];\n';
    const oneLine = 'var $plugins =\n[{"name":"X","status":false,"description":"","parameters":{}}];';
    assert.equal(DatabaseTroopEditor.parsePluginManifest(pretty)[0].name, 'VisuMZ_1_BattleCore');
    assert.equal(DatabaseTroopEditor.parsePluginManifest(oneLine)[0].status, false);
    assert.equal(DatabaseTroopEditor.parsePluginManifest('not a manifest'), null);
    assert.equal(DatabaseTroopEditor.enabledPlugin(DatabaseTroopEditor.parsePluginManifest(oneLine), 'X'), null,
        'a disabled plugin counts as absent');
    assert.deepEqual(plain(DatabaseTroopEditor.structParam({ parameters: { 'A:struct': '{bad' } }, 'A:struct')), {});
});

test('command names lose their text codes before they are drawn', () => {
    const DatabaseTroopEditor = loadClass(['src', 'database', 'DatabaseTroopEditor.js'], 'DatabaseTroopEditor');
    assert.equal(DatabaseTroopEditor.stripTextCodes('\\I[79]Magick'), 'Magick');
    assert.equal(DatabaseTroopEditor.stripTextCodes('\\C[2]Special\\C[0]'), 'Special');
    assert.equal(DatabaseTroopEditor.stripTextCodes('A\\\\B'), 'A\\B');
    assert.equal(DatabaseTroopEditor.stripTextCodes(undefined), '');
});

test('the actor home position follows the runtime for each stack', () => {
    const DatabaseTroopEditor = loadClass(['src', 'database', 'DatabaseTroopEditor.js'], 'DatabaseTroopEditor');
    const editor = troopEditor(DatabaseTroopEditor);
    const base = { screenWidth: 1280, screenHeight: 800, boxWidth: 1272, boxHeight: 792, maxBattleMembers: 3 };
    // Sprite_Actor.setActorHome in runtime/reactor_sprites.js.
    assert.deepEqual(plain(editor.actorHomePosition(1, { ...base, battleCore: false, coreEngine: false })), { x: 632, y: 328 });
    // BattleCore's default HomePosJS / CoreEngine's RepositionActors.
    const home = plain(editor.actorHomePosition(0, { ...base, battleCore: true }));
    assert.deepEqual(home, { x: 828, y: 452 });
    assert.deepEqual(plain(editor.actorHomePosition(0, { ...base, coreEngine: true, repositionActors: true })), home);
});

test('battle window rectangles match the runtime and BattleCore for each style', () => {
    const DatabaseTroopEditor = loadClass(['src', 'database', 'DatabaseTroopEditor.js'], 'DatabaseTroopEditor');
    const editor = troopEditor(DatabaseTroopEditor);
    const party = [{ actor: {} }, { actor: {} }];
    const base = {
        screenWidth: 1280, screenHeight: 800, boxWidth: 1272, boxHeight: 792, boxX: 4, boxY: 4,
        commandWidth: 192, xpCommandLines: 4, maxBattleMembers: 3, party
    };
    const rects = setup => plain(editor.battleWindowRects({ ...base, ...setup }));

    // BattleCore default at 1280x800: statusWindowRectDefaultStyle and
    // partyCommandWindowRectDefaultStyle, offset by the 4px window layer.
    // (In the running game the status window's top edge is at y=596; the
    // command frame's painted edge sits 4px inside its rect, at x=1088.)
    const def = rects({ battleCore: true, layoutStyle: 'default' });
    assert.deepEqual([def.status.x, def.status.y, def.status.width, def.status.height], [4, 596, 1080, 210]);
    assert.equal(def.status.frame, false);
    assert.deepEqual([def.command.x, def.command.y, def.command.width, def.command.height], [1084, 596, 192, 200]);

    // Stock engine: Scene_Battle.statusWindowRect keeps its extra "- 4".
    const stock = rects({ battleCore: false, layoutStyle: 'vanilla' });
    assert.equal(stock.status.y, 592);
    assert.equal(stock.command.y, 596);

    // List: one 44px row per battle slot, frame shown, no extra height.
    const list = rects({ battleCore: true, layoutStyle: 'list' });
    assert.deepEqual([list.status.y, list.status.height, list.status.frame, list.status.padding], [796 - 156, 156, true, 12]);
    assert.equal(list.command.height, 156);

    // XP: full-width status; the first actor's command is dimmed, above its cell.
    const xp = rects({ battleCore: true, layoutStyle: 'xp' });
    assert.deepEqual([xp.status.x, xp.status.width, xp.status.y], [4, 1272, 596]);
    assert.equal(xp.command.dim, true);
    assert.deepEqual([xp.command.width, xp.command.height, xp.command.y], [424, 200, 396]);
    assert.equal(xp.command.x, 4 + Math.round((636 - 424) / 2));

    // Border: help across the very top, status across the very bottom, commands on the right.
    const border = rects({ battleCore: true, layoutStyle: 'border' });
    assert.deepEqual([border.help.x, border.help.y, border.help.width, border.help.height], [0, 0, 1280, 96]);
    assert.deepEqual([border.status.x, border.status.y, border.status.width, border.status.height], [0, 600, 1280, 200]);
    assert.deepEqual([border.command.x, border.command.y, border.command.width, border.command.height], [1280 - 426, 96, 426, 504]);
});

// ---------------------------------------------------------------- battle test launch

test('battle test launches as a playtest too, on every host', () => {
    assert.equal(PlaytestManager.BATTLE_TEST_MODE, 'test&btest');
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'PlaytestManager.js'), 'utf8');
    const body = source.slice(source.indexOf('battleTest(projectPath) {'), source.indexOf('launchPlaytestWindow(projectPath, mode) {'));
    assert.doesNotMatch(body, /'btest'/, 'no bare btest launch remains');
    assert.match(body, /openPlaytest\(mode\)/);
    assert.match(body, /launchPlaytestWindow\(projectPath, mode\)/);

    // The Windows profile name carries the whole mode, ampersand included,
    // because that is what the runtime splits nw.App.argv[0] on.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-battle-test-'));
    try {
        const manager = new PlaytestManager();
        const dir = manager.resolvePlaytestUserDataDir(path, fs, root, {
            platform: 'win32', baseDir: path.join(root, 'profiles'), nwVersion: '0.107.0',
            optionToken: PlaytestManager.BATTLE_TEST_MODE
        });
        assert.match(dir, /[a-f0-9]{16}&test&btest$/);
        assert.match(manager.resolvePlaytestUserDataDir(path, fs, root, {
            platform: 'win32', baseDir: path.join(root, 'profiles'), nwVersion: '0.107.0', optionToken: '&&te st&'
        }), /[a-f0-9]{16}&test$/, 'stray separators and unsafe characters are dropped');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function battleTestModal(overrides = {}) {
    const alerts = [];
    const BattleTestConfigModal = loadClass(['src', 'database', 'BattleTestConfigModal.js'], 'BattleTestConfigModal', {
        alert: message => alerts.push(message),
        require: name => {
            if (name === 'path') return path;
            if (name === 'fs') return overrides.fs;
            throw new Error(`unexpected require ${name}`);
        }
    });
    const actors = [{ id: 1, name: 'Hero', initialLevel: 1, equips: [0, 0, 0, 0, 0] }];
    const system = { testBattlers: overrides.testBattlers || [], testTroopId: 0, battleback1Name: 'Sys1', battleback2Name: 'Sys2' };
    const data = {
        actors, classes: [], skills: [], items: [], weapons: [], armors: [], enemies: [], troops: [],
        states: [], animations: [], tilesets: [], commonEvents: [], system
    };
    if ('mapInfos' in overrides) data.mapInfos = overrides.mapInfos;
    const dm = { data, getSystem: () => system, getActors: () => actors, getActor: id => actors.find(a => a.id === id) || null };
    const launched = [];
    const modal = new BattleTestConfigModal(dm, { path: overrides.projectPath || '/proj' }, 7, 'Pick1', 'Pick2',
        { battleTest: p => launched.push(p) });
    modal.close = () => {};
    return { modal, alerts, launched, system };
}

test('battle test writes every Test_ file even when MapInfos was never handed to the database manager', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-battle-test-data-'));
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'MapInfos.json'), '[null,{"id":1,"name":"Start"}]');
    try {
        const { modal, alerts, launched, system } = battleTestModal({
            fs, projectPath: root, testBattlers: [{ actorId: 1, level: 3, equips: [] }]
        });
        await modal.launch();
        assert.deepEqual(alerts, []);
        assert.deepEqual(launched, [root]);
        const written = fs.readdirSync(path.join(root, 'data')).filter(f => f.startsWith('Test_')).sort();
        assert.equal(written.length, 14, `all fourteen Test_ files: ${written.join(', ')}`);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data', 'Test_MapInfos.json'), 'utf8')),
            [null, { id: 1, name: 'Start' }], 'MapInfos falls back to the project file on disk');
        const testSystem = JSON.parse(fs.readFileSync(path.join(root, 'data', 'Test_System.json'), 'utf8'));
        assert.equal(testSystem.testTroopId, 7);
        assert.equal(testSystem.battleback1Name, 'Pick1', 'the dialog battleback goes to the Test_ copy');
        assert.equal(system.battleback1Name, 'Sys1', 'and not to the game default');
        assert.equal(system.testTroopId, 7);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('battle test with no MapInfos anywhere still writes an empty list', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-battle-test-nomap-'));
    fs.mkdirSync(path.join(root, 'data'));
    try {
        const { modal, alerts, launched } = battleTestModal({
            fs, projectPath: root, mapInfos: undefined, testBattlers: [{ actorId: 1, level: 1, equips: [] }]
        });
        await modal.launch();
        assert.deepEqual(alerts, []);
        assert.equal(launched.length, 1);
        assert.equal(fs.readFileSync(path.join(root, 'data', 'Test_MapInfos.json'), 'utf8'), '[]');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('battle test refuses an empty party instead of booting Scene_Battle on nobody', async () => {
    const writes = [];
    const fakeFs = { writeFileSync: (p, d) => writes.push(p), existsSync: () => false };
    const { modal, alerts, launched } = battleTestModal({
        fs: fakeFs, testBattlers: [{ actorId: 0, level: 30, equips: [] }, { actorId: 99, level: 1, equips: [] }]
    });
    await modal.launch();
    assert.equal(alerts.length, 1);
    assert.match(alerts[0], /at least one party member/);
    assert.deepEqual(launched, []);
    assert.deepEqual(writes, [], 'nothing is written when the launch is refused');
});

test('opening the battle test dialog persists the troop first', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    const body = source.slice(source.indexOf('openBattleTestConfig() {'), source.indexOf('persistTroop() {'));
    assert.match(body, /this\.persistTroop\(\);[\s\S]*new BattleTestConfigModal\(/);
});
