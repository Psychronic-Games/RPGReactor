'use strict';
// Steam for games made with RPG Reactor: runtime/reactor_steam.js against a stand-in steamworks.js, the System 2 card's
// wiring, a desktop build carrying steamworks.js for the one system, and the playtest's environment. (RPG Reactor's
// own Steam app is steam-workshop.test.cjs.)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');

/** reactor_steam.js in a sandbox: the game's switches, a stand-in Steam, and what it was asked. */
function load({ test: playtest = false, steamRunning = true, restart = false } = {}) {
    const calls = { activate: [], clear: [], restartChecks: 0, quit: 0, required: [] };
    const unlocked = new Set();
    const client = {
        achievement: {
            activate(name) { calls.activate.push(name); unlocked.add(name); return true; },
            isActivated(name) { return unlocked.has(name); },
            clear(name) { calls.clear.push(name); unlocked.delete(name); return true; }
        },
        stats: { getInt: () => 7, setInt: () => true, store: () => true }
    };
    const steamworks = {
        init(appId) { if (!steamRunning) throw new Error('Steam is not running'); calls.appId = appId; return client; },
        restartAppIfNecessary() { calls.restartChecks++; return restart; }
    };
    class Game_Switches { constructor() { this._data = []; } value(id) { return !!this._data[id]; } setValue(id, value) { this._data[id] = value; } }
    const commands = {};
    const context = {
        console: { log() {}, warn() {} },
        window: {},
        process: { env: { RR_STEAMWORKS: '/editor/node_modules/steamworks.js' } },
        require: name => { calls.required.push(name); return steamworks; },
        nw: { App: { quit() { calls.quit++; } } },
        Utils: { isNwjs: () => true, isOptionValid: name => playtest && name === 'test' },
        Game_Switches,
        DataManager: { extractSaveContents() {} },
        PluginManager: { registerCommand(plugin, name, fn) { commands[plugin + '.' + name] = fn; } },
        XMLHttpRequest: class { open() {} overrideMimeType() {} send() {} }
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_steam.js'), 'utf8'), context);
    context.$gameSwitches = new Game_Switches();
    return { steam: context.ReactorSteam, context, calls, commands };
}

const CONFIG = { enabled: true, appId: 480 };

test('a game\'s own Steam: off without settings, on with an App ID; the event command unlocks by API name', () => {
    const { steam, calls, commands } = load();
    assert.equal(steam.start(null), false);
    assert.equal(steam.reason, 'off');
    assert.equal(steam.start(steam.settings({ enabled: true, appId: 0 })), false, 'no App ID: off');
    assert.equal(steam.start(steam.settings(CONFIG)), true);
    assert.equal(calls.appId, 480, 'the game\'s App ID, never RPG Reactor\'s');
    assert.deepEqual([...calls.required], ['steamworks.js'], 'a built game loads its own copy');
    commands['RPGReactor.SteamAchievement']({ api: 'FIRST_WIN' });
    commands['RPGReactor.SteamAchievement']({ api: 'FIRST_WIN' });
    assert.deepEqual([...calls.activate], ['FIRST_WIN'], 'already unlocked: Steam is asked nothing more');
    commands['RPGReactor.SteamAchievement']({ api: 'FIRST_WIN', action: 'clear' });
    assert.deepEqual([...calls.clear], ['FIRST_WIN']);
    commands['RPGReactor.SteamAchievement']({ api: 'bad name!' });
    assert.equal(calls.activate.length, 1, 'a name Steam would refuse is not sent');
    assert.equal(steam.stat('WINS'), 7);
});

test('a playtest stays off Steam unless the project asks; then it loads the editor\'s steamworks.js', () => {
    let run = load({ test: true });
    assert.equal(run.steam.start(run.steam.settings(CONFIG)), false);
    assert.equal(run.steam.reason, 'playtest');
    assert.equal(run.steam.unlock('FIRST_WIN'), false, 'only noted in the console');
    run = load({ test: true });
    assert.equal(run.steam.start(run.steam.settings({ ...CONFIG, playtest: true, requireSteam: true })), true);
    assert.deepEqual([...run.calls.required], ['/editor/node_modules/steamworks.js']);
    assert.equal(run.calls.restartChecks, 0, 'a playtest is never handed to Steam');
});

test('without Steam running the game plays on; "Start through Steam" hands a copy started outside it to Steam', () => {
    let run = load({ steamRunning: false });
    assert.equal(run.steam.start(run.steam.settings(CONFIG)), false);
    assert.equal(run.steam.reason, 'not connected');
    assert.equal(run.steam.unlock('FIRST_WIN'), false);
    run = load({ restart: true });
    assert.equal(run.steam.start(run.steam.settings({ ...CONFIG, requireSteam: true })), false);
    assert.equal(run.calls.quit, 1);
});

test('the runtime boots reactor_steam.js, and every build checks for it', () => {
    assert.match(fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_main.js'), 'utf8'), /"js\/reactor_steam\.js",/);
    for (const file of ['build-scripts/build-worker.js', 'build-scripts/build.js', 'build-scripts/dist-editor-worker.js']) assert.ok(read(file).includes("'reactor_steam.js'"), file);
});

test('the game\'s Steam settings: a card on System 2 in their own file (no Database page of their own), cleared from a new project, and the event command', () => {
    assert.match(read('src/DatabaseManager.js'), /\['steam', 'ReactorSteam\.json'\]/);
    assert.doesNotMatch(read('src/DatabaseEditorUI.js'), /type: 'steam'/, 'no sidebar row: the sidebar must fit at 1080p');
    assert.match(read('src/database/DatabaseSystem2Editor.js'), /steam\.createSection\(\)/);
    assert.match(read('src/ProjectManager.js'), /'ReactorSteam\.json'/);
    assert.match(read('src/event/EventCommandPicker.js'), /\{ name: 'Steam Achievement', code: 357, reactor: 'SteamAchievement' \}/);
    const html = read('index.html');
    for (const file of ['src/database/DatabaseSteamEditor.js', 'src/event/commands/SteamCommandEditor.js']) assert.ok(html.includes(`<script src="${file}"></script>`), file);
    global.window = {};
    const Editor = require('../src/database/DatabaseSteamEditor.js');
    assert.deepEqual(new Editor({}).settings({ enabled: true, appId: '480', achievements: [{}] }), { enabled: true, appId: 480, playtest: false, requireSteam: false }, 'only the four settings are kept');
    const Command = require('../src/event/commands/SteamCommandEditor.js');
    const built = Command.build('SteamAchievement', { api: 'FIRST_WIN', action: 'unlock' }, 1);
    assert.deepEqual(built.parameters.slice(0, 2), ['RPGReactor', 'SteamAchievement']);
    assert.equal(built.parameters[2], 'Steam Achievement: Unlock: FIRST_WIN');
    delete global.window;
});

test('a desktop build of a game that uses Steam carries steamworks.js for that one system', t => {
    const source = read('build-scripts/build-worker.js');
    const fn = source.slice(source.indexOf('function steamworksForGame('), source.indexOf('function validateProjectRuntime('));
    const copyDir = source.slice(source.indexOf('function copyDirRecursive('), source.indexOf('function validateProjectRuntime('));
    const sandbox = { fs, path, __dirname: path.join(editorRoot, 'build-scripts') };
    vm.createContext(sandbox);
    vm.runInContext(copyDir.includes('function steamworksForGame(') ? copyDir : copyDir + fn, sandbox);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-game-steam-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const game = path.join(temp, 'game'), out = path.join(temp, 'package.nw');
    fs.mkdirSync(path.join(game, 'data'), { recursive: true });
    assert.equal(sandbox.steamworksForGame(game, out, 'linux'), null, 'no Steam settings: nothing added');
    fs.writeFileSync(path.join(game, 'data', 'ReactorSteam.json'), JSON.stringify({ enabled: true, appId: 480 }));
    assert.deepEqual({ ...sandbox.steamworksForGame(game, out, 'win') }, { appId: 480 });
    assert.deepEqual(fs.readdirSync(path.join(out, 'node_modules', 'steamworks.js', 'dist')), ['win64'], 'only the system being built');
    assert.ok(fs.existsSync(path.join(out, 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll')));
    assert.ok(!fs.existsSync(path.join(out, 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.lib')));
});

test('a playtest does not pass for RPG Reactor on Steam, and is told where the editor\'s steamworks.js is', () => {
    const PlaytestManager = require('../src/PlaytestManager.js');
    const env = PlaytestManager.playtestEnv({ PATH: '/bin', SteamAppId: '4817110', SteamGameId: '4817110' }, path, fs, editorRoot);
    assert.equal(env.SteamAppId, undefined);
    assert.equal(env.SteamGameId, undefined);
    assert.equal(env.PATH, '/bin');
    assert.equal(env.RR_STEAMWORKS, path.join(editorRoot, 'node_modules', 'steamworks.js'));
});
