'use strict';
// Build › Online Server and runtime/reactor_online.js: the server shares information; each client draws the others.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { followerWorld } = require('./helpers/follower-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');
const deploy = require('../build-scripts/online-deploy.cjs');

const appRoot = path.resolve(__dirname, '..');
const scratch = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-online-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };

/** A game with reactor_online.js loaded and fetch answered by `answer(url)`. */
function onlineWorld(answer, config = { enabled: true, url: 'reactor-online/api.php' }, utilsTest = false, character = null) {
    const world = followerWorld({});
    world.$dataReactorOnline = config;
    world.$dataReactorCharacters = character;
    const calls = [];
    world.fetch = async url => {
        // The world lane and sleepers are their own conversations; each test speaks to its own part.
        if (/a=(world|sleepers)/.test(String(url))) return { ok: false };
        calls.push(String(url));
        return answer(String(url));
    };
    world.addEventListener = () => {};
    world.crypto = globalThis.crypto;
    world.setTimeout = setTimeout;
    world.calls = calls;
    world.localStorage = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = value; } };
    vm.runInContext(`
        for (const name of ["Scene_Map", "Scene_Title", "Scene_Load", "Scene_MenuBase", "Scene_Base", "Spriteset_Map", "Sprite_Character", "Window_Selectable", "Window_Command"]) {
            if (typeof globalThis[name] === "undefined") globalThis[name] = ({ [name]: function() {} })[name];
        }
        Scene_Map.prototype.start = Scene_Map.prototype.start || function() {};
        Scene_Title.prototype.commandNewGame = function() { DataManager.setupNewGame(); SceneManager.goto(Scene_Map); };
        Scene_Load.prototype.onLoadSuccess = function() {};
        Spriteset_Map.prototype.update = Spriteset_Map.prototype.update || function() {};
        Utils.isOptionValid = name => name === "test" && ${utilsTest};
        PluginManager = typeof PluginManager === "undefined" ? { registerCommand() {} } : PluginManager;
    `, world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_character_creator.js'), 'utf8') + '\nglobalThis.ReactorCharacters = ReactorCharacters; globalThis.Scene_CharacterChoice = Scene_CharacterChoice; globalThis.Scene_CharacterCreator = Scene_CharacterCreator;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online.js'), 'utf8') + '\nglobalThis.ReactorOnline = ReactorOnline; globalThis.Game_RemotePlayer = Game_RemotePlayer;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online_ui.js'), 'utf8') + '\nglobalThis.ReactorOnlineChat = ReactorOnlineChat; globalThis.ReactorWorldState = ReactorWorldState; globalThis.Scene_OnlineAccount = Scene_OnlineAccount;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online_voice.js'), 'utf8') + '\nglobalThis.ReactorOnlineVoice = ReactorOnlineVoice;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online_party.js'), 'utf8') + '\nglobalThis.ReactorOnlineParty = ReactorOnlineParty;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online_battle.js'), 'utf8') + '\nglobalThis.ReactorOnlineBattle = ReactorOnlineBattle;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online_classic.js'), 'utf8') + '\nglobalThis.ReactorOnlineClassic = ReactorOnlineClassic;', world);
    vm.runInContext(fs.readFileSync(path.join(runtimeRoot, 'reactor_online_action.js'), 'utf8') + '\nglobalThis.ReactorOnlineAction = ReactorOnlineAction;', world);
    return world;
}

/** The server's answer to a sync: the time, the world's message count, then one 12-byte record per slot. */
function records(now, players, chat = 0) {
    const size = 10 + 12 * (Math.max(...players.map(p => p.slot), 0) + 1), view = new DataView(new ArrayBuffer(size));
    view.setUint16(0, now, true);
    view.setUint32(2, chat, true);
    for (const p of players) {
        const at = 10 + p.slot * 12;
        view.setUint16(at, p.x * 32, true); view.setUint16(at + 2, p.y * 32, true);
        view.setUint16(at + 4, (p.direction || 2) | (p.moving ? 16 : 0), true); view.setUint16(at + 6, p.stamp ?? now, true);
        view.setUint32(at + 8, p.sent ?? 1000, true);
    }
    return view.buffer;
}

test('a single-player game asks nothing and draws nothing', () => {
    for (const config of [null, { enabled: false, address: 'https://a.org' }]) {
        const world = onlineWorld(() => { throw new Error('asked'); }, config);
        world.ReactorOnline.gameStarted = true;
        world.ReactorOnline.start();
        assert.equal(world.ReactorOnline.state, 'off');
        assert.equal(world.calls.length, 0);
    }
});

test('a playtest stays offline unless the project asks it to connect', () => {
    assert.equal(onlineWorld(() => ({}), { enabled: true }, true).ReactorOnline.config(), null);
    assert.ok(onlineWorld(() => ({}), { enabled: true, playtest: true }, true).ReactorOnline.config());
});

test('the address comes from the project; a build\'s own stamp wins', () => {
    assert.equal(onlineWorld(() => ({}), { enabled: true, address: 'https://a.org/' }).ReactorOnline.url(), 'https://a.org/reactor-online/api.php');
    assert.equal(onlineWorld(() => ({}), { enabled: true }).ReactorOnline.url(), 'reactor-online/api.php');
    assert.equal(onlineWorld(() => ({}), { enabled: true, address: 'https://a.org', url: 'https://b.org/x.php' }).ReactorOnline.url(), 'https://b.org/x.php');
});

test('a title or intro map stays offline until a game is started or loaded', () => {
    const world = onlineWorld(() => { throw new Error('asked'); });
    world.ReactorOnline.start();
    assert.equal(world.ReactorOnline.state, 'off');
});

test('other players on the map become characters; this player, empty and stale slots do not', () => {
    const { ReactorOnline: online } = onlineWorld(() => ({}));
    online.slot = 1;
    online.read(records(1000, [
        { slot: 0, x: 4, y: 6 }, { slot: 1, x: 9, y: 9 }, { slot: 3, x: 2, y: 2, stamp: 900 }, { slot: 5, x: 7, y: 7 }]));
    assert.deepEqual([...online.peers.keys()].sort(), [0, 5]);
    online.read(records(1000, [{ slot: 5, x: 7, y: 7 }]));
    assert.deepEqual([...online.peers.keys()], [5], 'someone who left goes');
});

test('the server clock wrapping past 65535 does not lose anyone', () => {
    const { ReactorOnline: online } = onlineWorld(() => ({}));
    online.slot = 9;
    online.read(records(2, [{ slot: 0, x: 1, y: 1, stamp: 65534 }]));
    assert.equal(online.peers.size, 1);
});

/** Plays a runner's reports through a watcher frame by frame; returns each frame's movement. */
function watch(online, Game_RemotePlayer, { speed = 7.5, seconds = 6, stall = () => 0 }) {
    const peer = new Game_RemotePlayer(0), moves = [];
    let lastX = null, x = 10;
    const reports = [];
    for (let sent = 0; sent <= seconds * 1000; sent += 200) reports.push({ sent: sent + 5000, x: 10 + speed * sent / 1000, arrives: sent + 5000 + 30 + stall(sent) });
    let next = 0;
    for (let now = 5000; now < 5000 + seconds * 1000 + 800; now += 1000 / 60) {
        while (next < reports.length && reports[next].arrives <= now) {
            const r = reports[next++];
            peer.addSample({ sent: r.sent, arrived: r.arrives, x: r.x, y: 5, direction: 6, moving: true, dashing: true });
        }
        peer.advance(now);
        if (peer._samples.length) { x = peer._realX; if (lastX !== null) moves.push(Math.abs(x - lastX)); lastX = x; }
    }
    return { moves, end: x };
}

test('a runner stays smooth for a watcher, and a stalled report is not a teleport (the owner\'s report)', () => {
    const { ReactorOnline: online, Game_RemotePlayer } = onlineWorld(() => ({}));
    const steady = watch(online, Game_RemotePlayer, {});
    assert.ok(Math.max(...steady.moves) < 0.4, `steady running jumps ${Math.max(...steady.moves)}`);
    // Every three seconds, a report and those behind it are held a second, as a web server starting a process does.
    const stalled = watch(online, Game_RemotePlayer, { stall: sent => (sent % 3000 < 1000 ? 1000 - sent % 3000 : 0) });
    const jump = Math.max(...stalled.moves);
    assert.ok(jump < 0.25, `a one-second stall at running speed jumped ${jump} tiles`);
    assert.ok(stalled.end > 50, 'the runner still arrives');
});

test('a real transfer is shown at once; the same report read twice is not news', () => {
    const { Game_RemotePlayer } = onlineWorld(() => ({}));
    const peer = new Game_RemotePlayer(0), sample = (sent, x) => ({ sent, arrived: sent + 30, x, y: 5, direction: 6, moving: true, dashing: false });
    peer.addSample(sample(1000, 10)); peer.addSample(sample(1000, 10));
    assert.equal(peer._samples.length, 1);
    peer.addSample(sample(1200, 11));
    assert.equal(peer._samples.length, 2);
    peer.addSample(sample(1400, 90));
    assert.equal(peer._samples.length, 1, 'eighty tiles in a fifth of a second is a transfer');
    peer.advance(5000);
    assert.equal(peer._realX, 90);
});

test('a report that stalls does not hold up the next, and a late answer changes nothing', async () => {
    let hold, answered = 0;
    const world = onlineWorld(url => {
        if (url.includes('a=join')) return { ok: true, text: async () => JSON.stringify({ slot: 4, nonce: 'n', token: 't' }) };
        if (++answered === 1) return new Promise(done => { hold = done; });
        return { ok: true, arrayBuffer: async () => records(10, [{ slot: 0, x: 5, y: 5, sent: 2000 }]) };
    });
    const online = world.ReactorOnline;
    online.config().updatesPerSecond = 200;
    online.gameStarted = true;
    online.start();
    for (let i = 0; i < 200 && !online.peers.size; i++) await new Promise(done => setTimeout(done, 5));
    assert.equal(online.peers.size, 1, 'the second report went out while the first was stuck');
    hold({ ok: true, arrayBuffer: async () => records(10, []) });
    await new Promise(done => setTimeout(done, 20));
    assert.equal(online.peers.size, 1, 'the stale answer did not remove them');
    online.stop();
});

test('a rejected player signs in again; a lost connection keeps trying', async () => {
    let joined = 0, syncs = 0;
    const world = onlineWorld(url => {
        if (url.includes('a=join')) { joined++; return { ok: true, text: async () => JSON.stringify({ slot: 4, nonce: 'n', token: 't' }) }; }
        syncs++;
        if (syncs === 1) return { ok: false, status: 401, text: async () => 'Unknown player.' };
        return { ok: true, arrayBuffer: async () => records(10, []) };
    });
    const online = world.ReactorOnline;
    online.gameStarted = true;
    online.start();
    assert.equal(online.state, 'connecting');
    for (let i = 0; i < 400 && joined < 2; i++) await new Promise(done => setTimeout(done, 5));
    online.stop();
    assert.equal(joined, 2, 'a refused token is dropped and the player joins again');
    assert.ok(world.calls[1].includes('a=sync') && world.calls[1].includes('s=4'));
});

test('the online game begins when a game does, new or loaded', () => {
    const world = onlineWorld(() => ({}));
    assert.equal(world.ReactorOnline.gameStarted, false);
    world.DataManager.setupNewGame = () => {};
    world.Scene_Title.prototype.commandNewGame.call({});
    assert.equal(world.ReactorOnline.gameStarted, true);
});

test('a character is sent in pieces no larger than any host allows, and the answer names it', async () => {
    const pieces = [];
    const world = onlineWorld(url => {
        if (url.includes('a=join')) return { ok: true, text: async () => JSON.stringify({ slot: 4, nonce: 'n', token: 't' }) };
        if (url.includes('a=upload')) return { ok: true, json: async () => ({ hash: 'abc' }) };
        return { ok: true, arrayBuffer: async () => records(1, []) };
    });
    const realFetch = world.fetch;
    world.fetch = async (url, options) => { if (options?.body && String(url).includes('a=upload')) pieces.push({ url: String(url), size: options.body.byteLength, type: options.headers?.['Content-Type'] }); return realFetch(url, options); };
    const percents = [];
    const hash = await world.ReactorOnline.uploadCharacter(new ArrayBuffer(2.5 * 1024 * 1024), percent => percents.push(percent));
    assert.equal(hash, 'abc');
    assert.equal(pieces.length, 3);
    assert.ok(pieces.every(piece => piece.size <= 1024 * 1024));
    assert.equal(pieces[0].type, 'text/plain', 'a desktop build needs no permission check first');
    assert.ok(pieces[2].url.includes('i=2') && pieces[2].url.includes('n=3'));
    assert.deepEqual(percents, [33, 67, 100]);
});

test('another player shows their actor until their own model arrives, then that model', async () => {
    const world = onlineWorld(() => ({}));
    const { ReactorCharacters: characters, ReactorOnline: online, Game_RemotePlayer } = world;
    const peer = new Game_RemotePlayer(3), spec = { name: 'Characters/Character-aa' };
    characters.fetch = async () => new ArrayBuffer(4);
    characters.install = async () => spec;
    online.fetchLook(peer, 'aa');
    assert.equal(peer.modelSpec, null);
    await online._lookQueue;
    assert.equal(peer.modelSpec, spec);
    assert.equal(world.Reactor3D.characterModelSpec(peer).name, spec.name);
    assert.equal(world.Reactor3D.modelInstanceKey(peer), 'r3:' + spec.name, 'a new look is a new model instance');
});

test('the Demo\'s server is the demo server, and a project made from it is the author\'s own', () => {
    const demo = JSON.parse(fs.readFileSync(path.join(appRoot, '../template/Demo/data/ReactorOnline.json'), 'utf8'));
    // Online or single player is the owner's switch on the Demo, changed as the work needs: either is right.
    assert.equal(typeof demo.enabled, 'boolean');
    assert.equal(demo.address, 'https://demo.rpgreactor.org');
    assert.equal(typeof demo.playtest, 'boolean');
    assert.equal(demo.accounts.mode, 'optional');
    assert.match(fs.readFileSync(path.join(appRoot, 'src/ProjectManager.js'), 'utf8'), /\['ReactorOnline\.json', 'ReactorCharacters\.json'\][\s\S]{0,160}unlinkSync/);
});

test('the option pages flow across the window instead of running down one column', () => {
    const css = fs.readFileSync(path.join(appRoot, 'css/styles.css'), 'utf8');
    assert.match(css, /\.rr-flow-page \{ column-width: \d+px/);
    for (const file of ['DatabaseOnlineEditor.js', 'DatabaseCharacterCreationEditor.js']) {
        const source = fs.readFileSync(path.join(appRoot, 'src/database', file), 'utf8');
        assert.match(source, /DatabaseFlowForm\.page\(/, file);
        assert.equal(/max-width/.test(source), false, `${file} leaves the window's width to the page`);
    }
    assert.ok(fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8').indexOf('DatabaseFlowForm.js') < fs.readFileSync(path.join(appRoot, 'index.html'), 'utf8').indexOf('DatabaseOnlineEditor.js'));
});

test('a project\'s online settings are its own file, and looking at the page writes nothing', () => {
    const source = fs.readFileSync(path.join(appRoot, 'src/database/DatabaseOnlineEditor.js'), 'utf8');
    const Editor = vm.runInNewContext(source + '\nDatabaseOnlineEditor;', { window: {} });
    const settings = new Editor({}).settings(null);
    assert.equal(settings.enabled, false);
    assert.equal(settings.accounts.mode, 'none');
    assert.equal(settings.chat.enabled, true);
    settings.accounts.mode = 'required';
    assert.equal(Editor.ACCOUNTS.mode, 'none', 'the defaults are not shared between projects');
    assert.equal(/innerHTML[^;]*settings\.address/.test(source), false, 'typed text is never written into markup');
    const manager = fs.readFileSync(path.join(appRoot, 'src/DatabaseManager.js'), 'utf8');
    assert.match(manager, /\['online', 'ReactorOnline\.json'\]/);
    assert.match(manager, /key === 'online' \|\| key === 'characterCreation'\) && !this\.data\[key\]\) continue/, 'an unused project gains no file');
    for (const file of ['runtime/reactor_online.js', 'runtime/reactor_online_ui.js', 'runtime/reactor_character_creator.js']) {
        assert.equal(/\$dataSystem\.reactor(Online|Character)/.test(fs.readFileSync(path.join(appRoot, '..', file), 'utf8')), false, file);
    }
});

test('a project that wants accounts asks before the game opens, and never on a title or intro map', () => {
    const world = onlineWorld(() => ({}), { enabled: true, accounts: { mode: 'required' } });
    const online = world.ReactorOnline;
    world.SceneManager.goto(world.Scene_Map);
    assert.equal(world.SceneManager.pushed.at(-1), 'goto:Scene_Map', 'an intro map');
    online.gameStarted = true;
    world.SceneManager.goto(world.Scene_Map);
    assert.equal(world.SceneManager.pushed.at(-1), 'goto:Scene_OnlineAccount');
    online.useAccount({ name: 'Ada', session: 's' });
    world.SceneManager.goto(world.Scene_Map);
    assert.equal(world.SceneManager.pushed.at(-1), 'goto:Scene_Map');
    const open = onlineWorld(() => ({}));
    open.ReactorOnline.gameStarted = true;
    open.SceneManager.goto(open.Scene_Map);
    assert.equal(open.SceneManager.pushed.at(-1), 'goto:Scene_Map', 'no accounts, no question');
});

test('an account brings its character, and skips creating one', () => {
    const world = onlineWorld(() => ({}), { enabled: true, accounts: { mode: 'required' } }, false, { mode: 'build' });
    const { ReactorOnline: online, ReactorCharacters: characters } = world;
    characters.pending = true;
    online.useAccount({ name: 'Ada', session: 's', character: { actorId: 2, id: 'abc', name: 'Ada' } });
    assert.equal(characters.pending, false);
    assert.equal(characters.current().id, 'abc');
    assert.equal(world.$gameActors.actor(2).name(), 'Ada');
    const fresh = onlineWorld(() => ({}), { enabled: true }, false, { mode: 'build' });
    fresh.ReactorCharacters.pending = true;
    fresh.ReactorOnline.useAccount({ name: 'New', session: 's', character: null });
    assert.equal(fresh.ReactorCharacters.pending, true, 'a new account still makes one');
});

test('passwords travel in the body of a request, never its address', async () => {
    const calls = [];
    const world = onlineWorld(() => ({ ok: true, text: async () => '{}' }));
    const real = world.fetch;
    world.fetch = async (url, options) => { calls.push({ url: String(url), body: options?.body }); return real(url, options); };
    await world.ReactorOnline.post('login', { username: 'Ada', password: 'hunter22' });
    assert.equal(calls[0].url.includes('hunter22'), false);
    assert.ok(calls[0].body.includes('hunter22'));
});

test('chat asks only when a sync says there is news, and skips blocked players', async () => {
    let asked = 0;
    const world = onlineWorld(url => {
        if (url.includes('a=chat')) { asked++; return { ok: true, json: async () => ({ messages: [{ id: 3, name: 'Rude', text: 'hi', slot: 0 }, { id: 4, name: 'Ada', text: 'hello', slot: 1 }], gone: [] }) }; }
        return {};
    });
    const chat = world.ReactorOnlineChat, shown = [];
    world.$gameMap.mapId = () => 1;
    chat.add = message => shown.push(message.name);
    chat.blocked().add('Rude');
    chat.onCount(0);
    assert.equal(asked, 0);
    chat.onCount(4);
    await new Promise(done => setTimeout(done, 5));
    assert.equal(asked, 1);
    assert.deepEqual(shown, ['Ada']);
    assert.equal(chat.after, 4);
    chat.onCount(4);
    assert.equal(asked, 1, 'no news, no request');
});

test('a project can turn chat off, and the page is plain text only', () => {
    const off = onlineWorld(() => ({}), { enabled: true, chat: { enabled: false } }).ReactorOnlineChat;
    assert.equal(off.settings(), null);
    assert.ok(onlineWorld(() => ({})).ReactorOnlineChat.settings(), 'on unless turned off');
    const ui = fs.readFileSync(path.join(runtimeRoot, 'reactor_online_ui.js'), 'utf8');
    assert.equal(/innerHTML/.test(ui), false, 'what players type is never markup');
});

test('the owner\'s password stays on the server: never in a project or anything shipped', t => {
    const folder = scratch(t);
    const first = deploy.writeOnlineServer(folder, { appRoot, project: 'g', title: 'g', runtime: '' });
    assert.match(first.adminKey, /^[0-9a-f]{24}$/);
    const config = () => fs.readFileSync(path.join(folder, 'reactor-online/config.php'), 'utf8');
    assert.ok(config().includes(first.adminKey));
    const again = deploy.writeOnlineServer(folder, { appRoot, project: 'g', title: 'g', runtime: '' });
    assert.equal(again.adminKey, '', 'printed once');
    assert.ok(config().includes(first.adminKey), 'and kept');
    assert.ok(fs.existsSync(path.join(folder, 'reactor-online/admin.php')));
});

test('the server guards its doors', () => {
    const api = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8');
    const common = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8');
    const admin = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/admin.php'), 'utf8');
    assert.match(api, /password_hash\(\$password, PASSWORD_DEFAULT\)/);
    assert.match(api, /password_verify/);
    assert.equal(/\$_GET\['(password|session)'\]/.test(api), false, 'secrets are never read from an address');
    assert.equal(/\$account\b.*respond\(\$account\)/.test(api), false, 'an account is only ever sent through its public view');
    assert.match(common, /function accountView/);
    assert.equal(/'password'/.test(common.slice(common.indexOf('function accountView'), common.indexOf('/** Repeated failures'))), false);
    const say = api.slice(api.indexOf("if ($action === 'say')"), api.indexOf("if ($action === 'chat')"));
    for (const rule of ['player($secret)', "['who'] === 'accounts'", 'isBanned', 'filterChat', "['cooldown']"]) assert.ok(say.includes(rule), rule);
    assert.match(admin, /hash_equals\(\$csrf/);
    assert.match(admin, /'samesite' => 'Strict'/);
    assert.match(admin, /Content-Security-Policy/);
    assert.equal(/echo\s+\$_/.test(admin), false);
});

test('an address becomes the API URL; a browser game on the same site needs none', () => {
    assert.equal(deploy.apiUrl(''), 'reactor-online/api.php');
    assert.equal(deploy.apiUrl('https://demo.rpgreactor.org/'), 'https://demo.rpgreactor.org/reactor-online/api.php');
    assert.equal(deploy.apiUrl('demo.rpgreactor.org'), 'https://demo.rpgreactor.org/reactor-online/api.php');
    assert.equal(deploy.apiUrl('http://192.168.1.5:8080/game'), 'http://192.168.1.5:8080/game/reactor-online/api.php');
});

test('deploying keeps everything else in the folder, and a rebuild keeps the secret and players', t => {
    const folder = scratch(t);
    fs.writeFileSync(path.join(folder, 'someone-elses-page.html'), 'mine');
    const first = deploy.writeOnlineServer(folder, { appRoot, project: 'game', title: "Dad's Game", runtime: '1' });
    const config = path.join(folder, 'reactor-online', 'config.php');
    const secret = /'secret' => '([0-9a-f]{64})'/.exec(fs.readFileSync(config, 'utf8'))[1];
    assert.equal(first.newSecret, true);
    assert.ok(fs.readFileSync(config, 'utf8').includes("'title' => 'Dad\\'s Game'"), 'a quote cannot end the PHP string');
    const data = path.join(folder, 'reactor-online', 'data-abc'); fs.mkdirSync(data); fs.writeFileSync(path.join(data, 'names.json'), '{}');
    const second = deploy.writeOnlineServer(folder, { appRoot, project: 'game', title: 'New', runtime: '2' });
    assert.equal(second.newSecret, false);
    assert.ok(fs.readFileSync(config, 'utf8').includes(secret));
    assert.ok(fs.readFileSync(config, 'utf8').includes("'runtime' => '2'"));
    assert.equal(fs.readFileSync(path.join(folder, 'someone-elses-page.html'), 'utf8'), 'mine');
    assert.ok(fs.existsSync(path.join(data, 'names.json')));
    assert.deepEqual(fs.readdirSync(path.join(folder, 'reactor-online')).filter(name => name.endsWith('.tmp')), []);
});

test('the room for players\' characters is the project\'s to set, with no limit unless it asks for one', t => {
    const folder = scratch(t);
    deploy.writeOnlineServer(folder, { appRoot, project: 'g', title: 'g', runtime: '', settings: { storage: { characterMB: 40, totalGB: 5 } } });
    const config = fs.readFileSync(path.join(folder, 'reactor-online/config.php'), 'utf8');
    const written = JSON.parse(/'settings' => '([^\n]*)',\n/.exec(config)[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
    assert.deepEqual(written.storage, { characterMB: 40, totalGB: 5 });
    const api = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8');
    const common = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8');
    assert.match(common, /\$settings\['storage'\] = array_merge\(\['characterMB' => 0, 'totalGB' => 0\]/, 'none set: no limit');
    assert.doesNotMatch(api, /maxStorageBytes|maxModelBytes|2147483648|33554432/, 'no fixed caps left in the server');
    assert.match(api, /\$characterMb > 0 \? \(int\)\(\$characterMb \* 1048576\) : PHP_INT_MAX/);
    assert.match(api, /if \(\$roomGb > 0\) \{/);
    assert.doesNotMatch(api, /gzencode\(\(string\)file_get_contents/, 'a character is squeezed a piece at a time');
    const editor = fs.readFileSync(path.join(appRoot, 'src/database/DatabaseOnlineEditor.js'), 'utf8');
    assert.match(editor, /static STORAGE = Object\.freeze\(\{ characterMB: 0, totalGB: 0 \}\)/);
    assert.match(editor, /form\.number\('online-character-mb'/);
    assert.match(editor, /form\.number\('online-storage-gb'/);
});

test('two servers never share a secret', t => {
    const a = scratch(t), b = scratch(t);
    for (const folder of [a, b]) deploy.writeOnlineServer(folder, { appRoot, project: 'g', title: 'g', runtime: '' });
    assert.notEqual(fs.readFileSync(path.join(a, 'reactor-online/config.php'), 'utf8'), fs.readFileSync(path.join(b, 'reactor-online/config.php'), 'utf8'));
});

test('the deployed server carries the project\'s player limit', t => {
    const folder = scratch(t);
    deploy.writeOnlineServer(folder, { appRoot, project: 'g', title: 'g', runtime: '', maxPlayers: 12 });
    assert.ok(fs.readFileSync(path.join(folder, 'reactor-online/config.php'), 'utf8').includes("'maxPlayers' => 12"));
    assert.match(fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8'), /\$config\['maxPlayers'\]/);
});

test('a staged game keeps the project\'s online settings and learns its server', t => {
    const stage = scratch(t);
    fs.mkdirSync(path.join(stage, 'data'));
    fs.writeFileSync(path.join(stage, 'data/ReactorOnline.json'), JSON.stringify({ enabled: true, party: 'party' }));
    deploy.stampOnlineClient(stage, 'https://a.org');
    assert.equal(JSON.parse(fs.readFileSync(path.join(stage, 'data/ReactorOnline.json'), 'utf8')).party, 'party');
});

test('a staged game learns its server in its own file; the core data is left alone', t => {
    const stage = scratch(t);
    fs.mkdirSync(path.join(stage, 'data'));
    fs.writeFileSync(path.join(stage, 'data/System.json'), '{"gameTitle":"x"}');
    assert.equal(deploy.stampOnlineClient(stage, 'https://a.org').url, 'https://a.org/reactor-online/api.php');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(stage, 'data/ReactorOnline.json'), 'utf8')), { enabled: true, url: 'https://a.org/reactor-online/api.php', engine: { enabled: true, rate: 15, movement: 'speed', maxSpeed: 16 } });
    assert.equal(fs.readFileSync(path.join(stage, 'data/System.json'), 'utf8'), '{"gameTitle":"x"}');
});

test('the server refuses to run without a real secret, and checks a token on every write', () => {
    const php = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8') + fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8');
    assert.match(php, /strlen\(\(string\)\(\$config\['secret'\] \?\? ''\)\) < 32\) fail\(503/);
    assert.match(php, /hash_equals\(tokenFor/);
    const guarded = php.slice(php.indexOf("if ($action === 'sync')"), php.indexOf("if ($action === 'join')"));
    assert.ok(guarded.indexOf('player($secret)') < guarded.indexOf('fopen'), 'the token is checked before the file is opened');
});

test('an Online Server build never clears its folder, and packs a copy instead of it', () => {
    const worker = fs.readFileSync(path.join(appRoot, 'build-scripts/build-worker.js'), 'utf8');
    assert.match(worker, /if \(platform !== 'online' && fs\.existsSync\(platformOutDir\)\) \{\s*fs\.rmSync\(platformOutDir/);
    assert.match(worker, /const browserDir = packOnline \? path\.join\(stagingDir, '\.\.'/);
    assert.match(worker, /webPack\.packGame\(browserDir\)/);
    assert.equal(worker.includes('webPack.packGame(platformOutDir)'), false);
});

test('a player who signed off lies where they stopped, and nothing moves them', () => {
    const { ReactorOnline: online, Game_RemotePlayer } = onlineWorld(() => ({}));
    const sleeper = new Game_RemotePlayer('zabc');
    sleeper.setAsleep({ name: 'Ada', actor: 2, x: 7, y: 9, d: 4 });
    sleeper.advance(5000);
    assert.equal(sleeper.playerName, 'Ada (asleep)');
    assert.deepEqual([sleeper._realX, sleeper._realY, sleeper._direction], [7, 9, 4]);
    online.sleepers.set('zabc', sleeper);
    assert.equal(online.everyone().length, 1);
    assert.equal(online.peers.size, 0, 'a sleeper is not counted as here');
});

test('a game saves itself on the beat, but never mid-event or to a guest', () => {
    const world = onlineWorld(() => ({}), { enabled: true, accounts: { mode: 'optional', autosave: 10 } });
    const online = world.ReactorOnline;
    world.navigator = {};
    let saves = 0, notes = 0;
    online.saveProgress = async () => { saves++; return true; };
    online.noteWhereIAm = () => { notes++; };
    world.SceneManager._scene = new world.Scene_Map();
    online.keepUp();
    assert.equal(notes, 0, 'a guest keeps nothing on the server');
    online.account = { session: 's' };
    online.keepUp();
    assert.equal(notes, 1);
    online._nextSave = 0.001; online._nextNote = 0.001;
    world.$gameMap.isEventRunning = () => true;
    online.keepUp();
    assert.equal(saves, 0, 'not while an event is running');
    world.$gameMap.isEventRunning = () => false;
    online.keepUp();
    assert.equal(saves, 1);
});

test('a note goes up in a cutscene or a battle; a save only between moves', () => {
    const world = onlineWorld(() => ({}), { enabled: true, accounts: { mode: 'optional', autosave: 10 } });
    const online = world.ReactorOnline;
    world.navigator = {};
    let saves = 0, notes = 0;
    online.saveProgress = async () => { saves++; return true; };
    online.noteWhereIAm = () => { notes++; };
    online.account = { session: 's' };
    world.SceneManager._scene = new world.Scene_Map();
    world.$gameMap.isEventRunning = () => true;
    online._nextSave = 0.001;
    online.keepUp();
    assert.equal(notes, 1, 'where a player stands is noted whatever is running');
    assert.equal(saves, 0);
    // A battle's start waits on the event that called it: its turns are still a safe place to save.
    const fight = world.$gameFight = { isHere: () => true, isBusy: () => false, _act: null, _ending: null };
    online.keepUp();
    assert.equal(saves, 1, 'between moves of a battle');
    online._nextSave = 0.001;
    fight._act = {};
    online.keepUp();
    assert.equal(saves, 1, 'not in the middle of an action');
});

test('the first save comes soon after entering, however long the beat', () => {
    const world = onlineWorld(() => ({}), { enabled: true, accounts: { mode: 'optional', autosave: 300 } });
    const online = world.ReactorOnline;
    online.saveProgress = async () => true;
    online.noteWhereIAm = () => {};
    online.account = { session: 's' };
    world.SceneManager._scene = new world.Scene_Map();
    const before = world.performance.now();
    online.keepUp();
    assert.ok(online._nextSave - before <= online.FIRST_SAVE_MS + 50);
});

test('someone who left before their first save wakes where they stopped, in a new game', async () => {
    const world = onlineWorld(() => { throw new Error('nothing to fetch'); }, { enabled: true, accounts: { mode: 'optional' } });
    const calls = [];
    world.$gamePlayer.reserveTransfer = (...args) => calls.push(args);
    await world.ReactorOnline.wake({ session: 's', progress: { saved: false, wake: { map: 5, x: 11, y: 12, d: 6 } } });
    assert.deepEqual(Array.from(calls[0]), [5, 11, 12, 6, 0]);
    const common = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8');
    assert.match(common, /if \(!\$saved && !is_array\(\$wake\)\) return null;/);
});

test('a player tells others what they ride and fight once, when it changes', async () => {
    const asked = [];
    const world = onlineWorld(url => { asked.push(url); return { ok: true, json: async () => ({ ok: true }) }; }, { enabled: true, accounts: { mode: 'optional' } });
    const online = world.ReactorOnline;
    online.slot = 2; online.nonce = 'n'; online.token = 't';
    let posts = 0;
    online.post = async () => { posts++; return {}; };
    online.shareState();
    await new Promise(done => setTimeout(done, 5));
    online.shareState();
    await new Promise(done => setTimeout(done, 5));
    assert.equal(posts, 1);
    world.$gameParty.inBattle = () => true;
    online.shareState();
    await new Promise(done => setTimeout(done, 5));
    assert.equal(posts, 2);
    assert.equal(online.fightState(), 'classic');
});

test('another player in battle says so, and a ridden model is only a plain name from the project', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const peer = new world.Game_RemotePlayer(1);
    peer.setState(null, 'tactical');
    assert.equal(peer.fight, 'tactical');
    peer.setState(null, '');
    assert.equal(peer.fight, '');
    const common = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8');
    assert.match(common, /function cleanRide/);
    assert.match(common, /strpos\(\$name, '\.\.'\) !== false/);
});

test('a real-time battle keeps the voice key for itself, and leaves the microphone open', () => {
    const world = onlineWorld(() => ({}), { enabled: true, voice: { enabled: true, mode: 'push', key: 'V' } });
    const voice = world.ReactorOnlineVoice;
    world.Input.keyMapper = { 86: 'guard' };
    assert.equal(voice.keyTaken(), false, 'outside a battle the key is the voice key');
    world.$gameFight = { isAction: () => true };
    assert.equal(voice.keyTaken(), true);
    let asked = 0;
    voice.turnOn = () => { asked++; };
    world.ReactorOnline.slot = 1;
    voice.onKey({ key: 'v', ctrlKey: false, altKey: false, metaKey: false, repeat: false }, true);
    assert.equal(asked, 0, 'guarding is not asking for the microphone');
});

test('voice says what its key does and who can hear', () => {
    const world = onlineWorld(() => ({}), { enabled: true, voice: { enabled: true, mode: 'push', key: 'V' } });
    const voice = world.ReactorOnlineVoice;
    assert.equal(voice.hintText(), 'V: turn on voice');
    voice.on = true;
    assert.equal(voice.hintText(), 'Hold V to speak, nobody nearby has voice on');
    voice.links.set(3, { pc: { connectionState: 'connected' } });
    voice.transmitting = true;
    assert.equal(voice.hintText(), 'Speaking, 1 can hear you');
    voice.links.clear();
    voice.on = false;
});

test('a party command is a chat line, and an invitation asks on screen once', async () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const party = world.ReactorOnlineParty, sent = [];
    world.ReactorOnline.post = async (action, body) => { sent.push([action, body.do, body.name]); return {}; };
    assert.equal(party.command('/invite Ada Lovelace'), true);
    assert.equal(party.command('/leave'), true);
    assert.equal(party.command('hello there'), false, 'ordinary talk is not a command');
    await new Promise(done => setTimeout(done, 5));
    assert.deepEqual(JSON.parse(JSON.stringify(sent.slice(0, 2))), [['party', 'invite', 'Ada Lovelace'], ['party', 'leave', null]]);
    world.ReactorOnlineBattle.canAsk = () => true;
    let asked = 0;
    world.$gameMessage.setChoices = () => { asked++; };
    world.$gameMessage.setChoiceCallback = () => {};
    world.$gameMessage.add = () => {};
    party.onInvite('Bea');
    party.onInvite('Bea');
    assert.equal(asked, 1);
    party.onInvite('');
    party.onInvite('Bea');
    assert.equal(asked, 2, 'a new invitation asks again');
});

test('on a mirror its own side is the ally, whatever the host calls it', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const battle = world.ReactorOnlineBattle;
    battle.side = 'ally';
    assert.deepEqual(['ally', 'enemy', 'side3'].map(team => battle.localTeam(team)), ['ally', 'enemy', 'side3']);
    battle.side = 'enemy';
    assert.deepEqual(['ally', 'enemy', 'side3'].map(team => battle.localTeam(team)), ['enemy', 'ally', 'side3']);
    battle.side = 'side3';
    assert.deepEqual(['ally', 'enemy', 'side3', 'side4', 'neutral'].map(team => battle.localTeam(team)), ['enemy', 'sideHost', 'ally', 'side4', 'neutral']);
});

test('a guest in a battle hears only what is meant for it, and a host only believes orders from the unit\'s own player', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const battle = world.ReactorOnlineBattle, online = world.ReactorOnline;
    online.slot = 4;
    battle.reset();
    battle.role = 'guest';
    battle.hostSlot = 0;
    battle.receive({ t: 'turn', u: 1, to: 9 }, 0);
    battle.receive({ t: 'turn', u: 2, to: 4 }, 0);
    battle.receive({ t: 'walk', u: 3 }, 0);
    // Only the battle's host is believed: the log and the relay carry anyone's lines.
    battle.receive({ t: 'sync', rows: [[1, 0, 0, 0, [1]]] }, 7);
    battle.receive({ t: 'end', result: 2 }, 7);
    assert.deepEqual(Array.from(battle.inbox, message => message.u), [2, 3]);
    battle.reset();
    battle.role = 'host';
    const fight = { _act: { unitId: 7, deadline: Infinity }, unit: () => ({ remoteSlot: 3 }), character: () => ({}), actOnPlan() { this.acted = true; }, startWalk() {} };
    battle.plans.set(7, { from: 2, kind: 'skill', id: 1 });
    battle.awaitOrders(fight);
    assert.ok(!fight.acted, 'someone else\'s orders do nothing');
    battle.plans.set(7, { from: 3, kind: 'skill', id: 1, cx: 1, cy: 2, steps: [] });
    battle.awaitOrders(fight);
    assert.ok(fight.acted);
    battle.reset();
});

test('the server keeps battles and parties beside players, and refuses a bad battle id', () => {
    const api = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8');
    const common = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8');
    for (const action of ['party', 'news', 'bOpen', 'bBeat', 'bClose', 'bSay', 'bRead']) assert.match(api, new RegExp(`\\$action === '${action}'`));
    assert.match(common, /\/\^\[a-f0-9\]\{16\}\$\//, 'a battle id can name no other file');
    assert.match(api, /'from' => \$slot, 'm' => \$message/, 'who said it is the server\'s word, not the sender\'s');
});

test('a game loads the party and battle files, and every kind of build ships them', () => {
    const main = fs.readFileSync(path.join(runtimeRoot, 'reactor_main.js'), 'utf8');
    assert.ok(main.indexOf('reactor_online_voice.js') < main.indexOf('reactor_online_party.js') && main.indexOf('reactor_online_party.js') < main.indexOf('reactor_online_battle.js'));
    for (const script of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        assert.match(fs.readFileSync(path.join(appRoot, 'build-scripts', script), 'utf8'), /'reactor_online_battle\.js'/);
    }
});

test('whoever is not on your side wears the enemy color, on the turn strip and the unit rings alike', () => {
    const hud = fs.readFileSync(path.join(runtimeRoot, 'reactor_ui_fight.js'), 'utf8');
    const line = /H\.teamColor = (\(node, team\) => \(.*?\))\s*$/m.exec(hud)[1];
    const color = eval(line), node = { allyColor: 'blue', enemyColor: 'red', neutralColor: 'grey' };
    assert.deepEqual(['ally', 'enemy', 'side2', 'sideHost', 'neutral'].map(team => color(node, team)), ['blue', 'red', 'red', 'red', 'grey']);
    const tactical = fs.readFileSync(path.join(runtimeRoot, 'reactor_fight_tactical.js'), 'utf8');
    assert.match(tactical, /uteam\[i\] = unit\.team === "ally" \? 0 : F\.isFoeTeam\(unit\.team\) \? 1 : 2;/);
});

test('the next host is the lowest slot still in the battle, and someone watching never is', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const battle = world.ReactorOnlineBattle;
    world.ReactorOnline.slot = 5;
    battle.reset();
    battle.side = 'ally';
    battle.hostSlot = 1;
    battle.slots = new Set([1, 3, 8]);
    assert.equal(battle.successor(), 3);
    battle.slots = new Set([1, 8]);
    assert.equal(battle.successor(), 5);
    battle.side = 'watch';
    assert.equal(battle.successor(), 8);
    battle.slots = new Set([1]);
    assert.equal(battle.successor(), Infinity, 'nobody but watchers left: the battle ends');
    assert.equal(battle.localTeam('enemy'), 'enemy', 'a watcher sees it as the host does');
    battle.reset();
});

test('only values the project lists go between party members', () => {
    const world = onlineWorld(() => ({}), { enabled: true, world: { partySwitches: '13, 20-21', partyVariables: '16' } });
    const party = world.ReactorOnlineParty;
    assert.equal(party.shares('s', 21), true);
    assert.equal(party.shares('s', 14), false);
    assert.equal(party.shares('v', 16), true);
    party.party = null;
    party.noteValue('s', 13, true);
    assert.equal(party.changes.size, 0, 'nobody to tell');
    party.party = { members: [] };
    party.noteValue('s', 13, true);
    party.noteValue('s', 14, true);
    assert.deepEqual([...party.changes.keys()], ['s:13']);
    clearTimeout(party._valuesSoon);
    party.changes.clear();
});

test('a Classic mirror takes the host\'s word: a challenger wins what the host loses', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const classic = world.ReactorOnlineClassic, seen = [];
    world.BattleManager = { processVictory() { seen.push('won'); }, processDefeat() { seen.push('lost'); }, endBattle(result) { seen.push('left' + result); } };
    classic.side = 'ally';
    classic.finish(0); classic.finish(2); classic.finish(1);
    classic.side = 'enemy';
    classic.finish(0); classic.finish(2);
    assert.deepEqual(seen, ['won', 'lost', 'left1', 'lost', 'won']);
});

test('with more than two sides, everyone but your own is against you', () => {
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_fight.js'), 'utf8');
    const line = /F\.isSide = (\(team, oppose\) => .*);$/m.exec(source)[1], isSide = eval(line);
    assert.equal(isSide('enemy', 'enemy'), true);
    assert.equal(isSide('ally', 'enemy'), false);
    assert.deepEqual(['ally', 'enemy', 'side3', 'neutral'].map(team => isSide(team, '!ally')), [false, true, true, false]);
});

test('in real time a message takes the Engine\'s line, and the log too for anyone without one', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const { ReactorOnlineAction: action, ReactorOnlineBattle: battle } = world, socket = vm.runInContext('ReactorOnlineSocket', world), sent = [];
    battle.reset();
    assert.equal(action.fast({ t: 'apos' }), false, 'no line: the log carries it');
    socket.socket = { send: text => sent.push(JSON.parse(text)) };
    battle.role = 'guest';
    battle.hostSlot = 2;
    assert.equal(action.fast({ t: 'ahit' }), true);
    assert.deepEqual(Array.from(sent[0].to), [2]);
    battle.role = 'host';
    battle.guests.set(5, { slow: false });
    assert.equal(action.fast({ t: 'apos' }), true);
    battle.guests.set(6, { slow: true });
    assert.equal(action.fast({ t: 'apos' }), false, 'a guest on polling still hears it');
    assert.deepEqual(Array.from(sent[2].to), [5, 6]);
    socket.socket = null;
    battle.reset();
});

test('a guest\'s own shot lands by their report, and only the host rolls it', () => {
    const world = onlineWorld(() => ({}), { enabled: true });
    const { ReactorOnlineAction: action, ReactorOnlineBattle: battle } = world;
    const sent = [], result = { used: true, hpDamage: 9, mpDamage: 0 };
    battle.reset();
    battle.send = message => sent.push(message);
    const target = { id: 3 }, subject = { id: 4, party: true };
    const fight = { _mirror: true, unit: () => subject, battler: () => ({ result: () => result, clearResult() {}, hp: 1, mp: 0, tp: 0, states: () => [] }) };
    let rolled = 0;
    const roll = () => { rolled++; };
    action.landHits(fight, roll, { subjectId: 4, kind: 'skill', itemId: 1 }, {}, [target], 1, 1, 1);
    assert.equal(rolled, 0, 'a guest rolls nothing');
    assert.equal(sent[0].t, 'ahit');
    fight._mirror = false;
    battle.role = 'host';
    battle.guests.set(5, {});
    subject.remoteSlot = 5;
    action.landHits(fight, roll, { subjectId: 4 }, {}, [target], 1, 1, 1);
    assert.equal(rolled, 0, 'the picture of their shot on the host lands on nothing');
    action.fromGuest = true;
    action.landHits(fight, roll, { subjectId: 4 }, {}, [target], 1, 1, 1);
    action.fromGuest = false;
    assert.equal(rolled, 1);
    assert.equal(sent[1].t, 'ares');
    delete battle.send;
    battle.reset();
});

test('the Engine only carries a real-time battle\'s messages, and limits them', () => {
    const engine = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/engine.cjs'), 'utf8');
    assert.match(engine, /message\?\.t === 'bf'.*withinRelayLimit\(player\)/);
    assert.match(engine, /from: player\.slot/, 'who sent it is the Engine\'s word');
});

test('a project can keep progress on each device instead', () => {
    const world = onlineWorld(() => ({}), { enabled: true, accounts: { mode: 'optional', persist: false } });
    world.ReactorOnline.account = { session: 's' };
    assert.equal(world.ReactorOnline.keepsProgress(), false);
});

test('waking restores the whole game and goes to where the player stopped', async () => {
    const saved = 'stand-in';
    const world = onlineWorld(() => ({ ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer }), { enabled: true, accounts: { mode: 'optional' } });
    const { ReactorOnline: online, ReactorCharacters: characters } = world;
    const calls = [];
    world.pako = { inflate: () => '{"x":1}' };
    world.JsonEx = { parse: () => saved };
    world.DataManager.createGameObjects = () => calls.push('objects');
    world.DataManager.extractSaveContents = contents => calls.push(contents);
    world.DataManager.correctDataErrors = () => calls.push('corrected');
    world.$gamePlayer.reserveTransfer = (...args) => calls.push(args);
    characters.pending = true;
    await online.wake({ session: 's', progress: { wake: { map: 5, x: 11, y: 12, d: 6 } } });
    assert.deepEqual(calls[1], saved);
    assert.deepEqual(Array.from(calls[3]), [5, 11, 12, 6, 0]);
    assert.equal(characters.pending, false, 'no new character on waking');
});

test('the server gives one account one body, and a sleeper keeps nothing private', () => {
    const api = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8');
    assert.match(api, /touchAlive\(\$dir, \(int\)\$other, REPLACED\)/);
    // Refused where every request names its player (once: sync no longer reads the stamp a second time).
    assert.match(fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/common.php'), 'utf8'), /You signed in somewhere else/);
    assert.match(api, /unset\(\$entry\['slot'\], \$entry\['account'\]\)/);
    const save = api.slice(api.indexOf("if ($action === 'save')"), api.indexOf("if ($action === 'load')"));
    assert.ok(save.indexOf('sessionAccount') < save.indexOf('file_put_contents'), 'a save names its player first');
});

function worldGame(world = { switches: '1-3, 7', variables: '20' }) {
    const game = onlineWorld(() => ({}), { enabled: true, world });
    game.$dataSystem.switches = new Array(100).fill('');
    game.$dataSystem.variables = new Array(100).fill('');
    const state = game.ReactorWorldState;
    state.fetch = async () => {};
    state.start();
    return { game, state };
}

test('only what the project lists is shared; everything else stays personal', () => {
    const { game, state } = worldGame();
    assert.deepEqual([...state.switches].sort((a, b) => a - b), [1, 2, 3, 7]);
    game.$gameSwitches.setValue(2, true);
    game.$gameSwitches.setValue(9, true);
    game.$gameVariables.setValue(20, 5);
    game.$gameVariables.setValue(21, 5);
    assert.deepEqual([...state.pending.keys()], ['s:2', 'v:20']);
    assert.equal(game.$gameSwitches.value(9), true, 'a personal switch still works');
});

test('a busy event sends one value, not hundreds', () => {
    const { game, state } = worldGame();
    for (let i = 0; i < 500; i++) game.$gameVariables.setValue(20, i);
    assert.equal(state.pending.size, 1);
    assert.equal(state.pending.get('v:20').value, 499);
});

test('another player\'s change arrives through the ordinary call, so events respond, and is not sent back', () => {
    const { game, state } = worldGame();
    const refreshed = [];
    game.$gameMap.requestRefresh = () => refreshed.push(1);
    state.apply({ s: { 2: true }, v: { 20: 7 }, e: { '5,3,A': true } });
    assert.equal(game.$gameSwitches.value(2), true);
    assert.equal(game.$gameVariables.value(20), 7);
    assert.equal(game.$gameSelfSwitches.value([5, 3, 'A']), true);
    assert.ok(refreshed.length >= 2, 'event pages are checked as usual');
    assert.equal(state.pending.size, 0);
});

test('a change still on its way is not overwritten by older news', () => {
    const { game, state } = worldGame();
    game.$gameSwitches.setValue(2, true);
    state.apply({ s: { 2: false } });
    assert.equal(game.$gameSwitches.value(2), true);
});

test('an event marked <world> shares its self switches; others stay personal', () => {
    const { game, state } = worldGame();
    game.$gameMap.mapId = () => 5;
    game.$dataMap.events[3] = { meta: { world: true } };
    game.$dataMap.events[4] = { meta: {} };
    game.$gameSelfSwitches.setValue([5, 3, 'A'], true);
    game.$gameSelfSwitches.setValue([5, 4, 'A'], true);
    assert.deepEqual([...state.pending.keys()], ['e:5,3,A']);
});

test('a single-player game\'s switches are untouched', () => {
    const game = onlineWorld(() => ({}), null);
    game.$dataSystem.switches = new Array(100).fill('');
    game.$gameSwitches.setValue(2, true);
    assert.equal(game.$gameSwitches.value(2), true);
    assert.equal(game.ReactorWorldState.pending.size, 0);
});

test('the server shares only what the project listed', () => {
    const api = fs.readFileSync(path.join(appRoot, 'build-scripts/online-server/api.php'), 'utf8');
    const set = api.slice(api.indexOf("if ($action === 'set')"), api.indexOf("// ---- Chat ----"));
    assert.ok(set.indexOf('player($secret)') < set.indexOf('flock'), 'a change names its player first');
    assert.match(set, /isset\(\$switches\[\(int\)\$id\]\)/);
    assert.match(set, /isset\(\$variables\[\(int\)\$id\]\)/);
});


test('walls reach the server as the same rule the game walks by', () => {
    const { passabilityGrid } = require('../build-scripts/online-deploy.cjs');
    const flags = []; flags[0] = 16; flags[1] = 0; flags[2] = 15; flags[3] = 16; flags[4] = 8;
    // Two columns, two rows, six layers: floor, wall, a star over a wall, and one that blocks a single side.
    const map = { width: 2, height: 2, data: [1, 2, 2, 4, 0, 0, 0, 0, 0, 0, 3, 0, ...new Array(12).fill(0)] };
    map.data = map.data.concat(new Array(24 - map.data.length).fill(0));
    const grid = passabilityGrid(map, flags);
    assert.equal(grid.readUInt16LE(0), 2);
    const walkable = (x, y) => !!(grid[4 + ((y * 2 + x) >> 3)] & (1 << ((y * 2 + x) & 7)));
    assert.equal(walkable(0, 0), true, 'floor');
    assert.equal(walkable(1, 0), false, 'wall');
    assert.equal(walkable(0, 1), false, 'a star tile does not lift the wall under it');
    assert.equal(walkable(1, 1), true, 'blocked on one side is still somewhere to stand');
});

test('voice: who is heard, how loud, and through which servers', () => {
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_online_voice.js'), 'utf8');
    const context = vm.createContext({ Scene_Map: class { update() {} }, performance });
    const Voice = vm.runInContext(source + '\nReactorOnlineVoice;', context);
    assert.equal(Voice.volumeAt(1, 20), 1, 'full volume up close');
    assert.equal(Voice.volumeAt(20, 20), 0, 'nothing at the edge of hearing');
    assert.ok(Voice.volumeAt(11, 20) > 0.4 && Voice.volumeAt(11, 20) < 0.6);
    assert.deepEqual([...Voice.chooseLinks([{ slot: 2, distance: 15 }, { slot: 1, distance: 3 }, { slot: 3, distance: 21 }], 20, new Map())], [1, 2]);
    assert.deepEqual([...Voice.chooseLinks([{ slot: 3, distance: 21 }], 20, new Map([[3, {}]]))], [3], 'a link lasts a little past hearing, so walking the edge does not redial');
    const crowd = Array.from({ length: 20 }, (_, slot) => ({ slot, distance: 20 - slot }));
    assert.equal(Voice.chooseLinks(crowd, 30, new Map()).length, 8, 'an upload can only carry so many');
    assert.equal(JSON.stringify(Voice.iceServers('stun:a.org:3478\n\nturn:b.org:3478 sam secret\n')), JSON.stringify([{ urls: 'stun:a.org:3478' }, { urls: 'turn:b.org:3478', username: 'sam', credential: 'secret' }]));
    assert.equal(Voice.shapeFor(300), 'ou');
    assert.equal(Voice.shapeFor(1200), 'aa');
    assert.equal(Voice.shapeFor(4000), 'ih');
});

test('voice costs a single-player game nothing, and is off until a project turns it on', () => {
    const Editor = vm.runInNewContext(fs.readFileSync(path.join(appRoot, 'src/database/DatabaseOnlineEditor.js'), 'utf8') + '\nDatabaseOnlineEditor;', { window: {} });
    assert.equal(Editor.VOICE.enabled, false);
    assert.equal(new Editor({}).settings(null).voice.mode, 'push');
});

test('a player\'s model released by a map change is installed again, so nobody turns invisible', async () => {
    const world = onlineWorld(() => ({}));
    const { ReactorCharacters: characters, ReactorOnline: online, Reactor3D: R } = world;
    const spec = { name: 'Characters/Character-one', ext: '.glb', file: 'Character-one' };
    let installs = 0;
    R._glbCache = {};
    R.modelCacheKey = () => 'one';
    characters.fetch = async () => new ArrayBuffer(8);
    characters.install = async id => { installs++; R._glbCache.one = {}; characters.models.set(id, spec); return spec; };
    const look = async () => { const peer = { modelId: '', modelSpec: null }; online.fetchLook(peer, 'one'); await online._lookQueue; return peer; };
    assert.equal((await look()).modelSpec, spec);
    assert.equal((await look()).modelSpec, spec);
    assert.equal(installs, 1, 'held: nothing to do');
    delete R._glbCache.one;     // what ModelUse.release does on a transfer
    assert.equal(characters.isInstalled('one'), false);
    assert.equal((await look()).modelSpec, spec);
    assert.equal(installs, 2, 'released: installed again');
});

test('a built model let go of while someone is drawing it comes back from its package, once', async () => {
    const world = onlineWorld(() => ({}));
    const { ReactorCharacters: characters } = world;
    let fetched = 0, installed = 0;
    characters.fetch = async () => { fetched++; return new ArrayBuffer(8); };
    characters.install = async () => { installed++; return { name: 'model' }; };
    const [first, second] = await Promise.all([characters.reinstall('one'), characters.reinstall('one')]);
    assert.equal(first.name, 'model');
    assert.equal(second, first);
    assert.deepEqual([fetched, installed], [1, 1], 'two asking at once share one download');
    characters.fetch = async () => null;
    assert.equal(await characters.reinstall('gone'), null, 'a package nobody has draws nothing rather than failing');
    const source = fs.readFileSync(path.join(appRoot, '../runtime/reactor_character_creator.js'), 'utf8');
    assert.match(source, /const id = ReactorCharacters\.modelIds\.get\(name\);/);
});

test('a name tag over a sprite with no picture yet does not stop the game (a model-bound player on a flat map)', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'runtime', 'reactor_online.js'), 'utf8');
    const from = source.indexOf('Spriteset_Map.prototype.reactorOnlineNamePoint = function(entry) {'), to = source.indexOf('\n};', from);
    assert.ok(from > 0 && to > from);
    const Spriteset_Map = function() {};
    new Function('Spriteset_Map', '$dataMap', source.slice(from, to + 3))(Spriteset_Map, {});
    const point = sprite => Spriteset_Map.prototype.reactorOnlineNamePoint.call({}, { peer: {}, sprite });
    const height = function() { return this.bitmap.height / 8; };
    assert.deepEqual(point({ x: 100, y: 200, bitmap: null, patternHeight: height }), { x: 100, y: 150 }, 'a tile\'s height until the picture is there');
    assert.deepEqual(point({ x: 100, y: 200, bitmap: { height: 512 }, patternHeight: height }), { x: 100, y: 134 });
    assert.deepEqual(point({ x: 100, y: 200, bitmap: null, _tileId: 5, patternHeight: () => 48 }), { x: 100, y: 150 }, 'a tile event has its height without a picture');
});

test('the owner\'s page shows the server, each account\'s character and last visit, and the characters stored; only an unused one can be deleted', () => {
    const admin = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'build-scripts', 'online-server', 'admin.php'), 'utf8');
    for (const section of ["$card('players', t('Playing now')", "$card('accounts', t('Accounts')", "$card('characters', t('Characters')", "$card('chat', t('Chat')", "$card('bans', t('Banned addresses')", "$card('settings', t('Settings')"]) assert.ok(admin.includes(section), section);
    for (const label of ["'New accounts'", "'Players at once'", "'Chat'", "'Voice'", "'Live engine'", "'Largest character'"]) assert.ok(admin.includes(label), label);
    // Every action is behind the form's token, and a package is deleted only when nobody uses it (asked again as it is done).
    assert.match(admin, /if \(!hash_equals\(\$csrf, \(string\)\(\$_POST\['csrf'\] \?\? ''\)\)\) fail\(403/);
    assert.match(admin, /\$used = modelsInUse\(\$dir\);[\s\S]{0,400}if \(isset\(\$used\[\$hash\]\) \|\| !preg_match\('\/\^\[a-f0-9\]\{64\}\$\/', \$hash\)\) continue;/);
    assert.ok(admin.includes("$used[$hash][] = t('{name} (guest, here now)'"), 'a guest who is playing keeps theirs');
    assert.match(admin, /if \(\$do === 'clear-character'\) \{ \$account\['character'\] = null;/);
    // What cannot be undone asks first, and the page allows no script: the question is the page's own (<details>).
    for (const action of ['ban-player', 'ban-account', 'clear-character', 'delete-account', 'delete-model', 'delete-unused-models']) assert.ok(admin.includes("$ask('" + action + "'"), action + ' asks first');
    // One script runs, the page's own (the live chat), named by a mark made new for each page; nothing from outside, and it talks only to this site.
    assert.match(admin, /\$scriptMark = bin2hex\(random_bytes\(12\)\);\s*header\("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-\$scriptMark'; connect-src 'self'; form-action 'self'; base-uri 'none'"\);/);
    assert.equal((admin.match(/<script/g) || []).length, 1);
    assert.ok(!/<script[^>]*src=|innerHTML|insertAdjacentHTML|document\.write|eval\(/.test(admin), 'what players wrote is put on the page as text, never as markup');
    // What a player typed is never written into the page as it came: names go through e() or into a question that does.
    assert.ok(!/'<b>' \. \$name \. '|'<td>' \. \$account\[|\. \$message\['text'\] \. '/.test(admin));
    // In the editor's colours: the theme the deploy wrote, plain colours only, and the editor's default (gold on black) without one.
    assert.match(admin, /function themeCss\(array \$config\): string \{/);
    assert.ok(admin.includes("if (preg_match('/^(#[0-9a-f]{3,8}|rgba?") && admin.includes("$css .= $variable . ':' . $value . ';';"), 'only a plain colour is written into the style');
    assert.match(admin, /:root\{--bg:#1a1a1a;--panel:#111111;--head:#000000;[^}]*--accent:#d4af37;--accent-ink:#000000;/);
});

test('the admin page takes the editor theme its author works in: the deploy reads the colours from the editor\'s own sheet', () => {
    const path = require('node:path'), fs = require('node:fs'), os = require('node:os');
    const theme = require('../build-scripts/online-theme.cjs'), appRoot = path.join(__dirname, '..');
    const gold = theme.themeColors(appRoot, '');
    assert.deepEqual([gold.name, gold.accent, gold.base, gold.panel, gold.deep, gold.accentOn], ['', '#d4af37', '#1a1a1a', '#111111', '#000000', '#000000']);
    assert.equal(Object.keys(gold).length, Object.keys(theme.TOKENS).length + 1, 'every colour the page paints with is found');
    const ocean = theme.themeColors(appRoot, 'ocean-dark');
    assert.equal(ocean.name, 'ocean-dark'); assert.notEqual(ocean.accent, gold.accent); assert.notEqual(ocean.base, gold.base);
    for (const value of Object.values(ocean)) assert.match(value, /^(|[a-z-]+|#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/);
    assert.deepEqual(theme.themeColors(appRoot, 'no-such-theme'), gold, 'an unknown theme is the default');
    assert.deepEqual(theme.themeColors(appRoot, '"] { x'), gold, 'and a name that is not one is never put into the search');
    assert.equal(theme.themeColors(path.join(os.tmpdir(), 'rr-no-editor-here'), ''), null);
    // A value that is not a plain colour never leaves (it would be written into a page's style).
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-theme-'));
    try {
        fs.mkdirSync(path.join(root, 'css'));
        fs.writeFileSync(path.join(root, 'css', 'theme.css'), ':root {\n    --color-accent: url(x) red;\n    --color-text: expression(1);\n    --color-bg-base: var(--color-bg-deep);\n    --color-bg-deep: #010203; /* note */\n}\n');
        const odd = theme.themeColors(root, '');
        assert.equal(odd.accent, undefined); assert.equal(odd.text, undefined);
        assert.equal(odd.deep, '#010203'); assert.equal(odd.base, '#010203', 'a token that names another is followed');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
    // The editor hands its theme to the build, and the build to the server's config.
    assert.match(fs.readFileSync(path.join(appRoot, 'src', 'BuildManager.js'), 'utf8'), /theme: document\.documentElement\.getAttribute\('data-theme'\) \|\| '',/);
    assert.match(fs.readFileSync(path.join(appRoot, 'build-scripts', 'build-worker.js'), 'utf8'), /theme: online\.theme \|\| '',/);
    assert.match(fs.readFileSync(path.join(appRoot, 'build-scripts', 'online-deploy.cjs'), 'utf8'), /'theme' => \$\{phpString\(JSON\.stringify\(require\('\.\/online-theme\.cjs'\)\.themeColors\(appRoot, theme\) \|\| \{\}\)\)\}/);
});

test('the owner\'s page has tabs and addresses without ".php", and writes to everyone or to one player who is here', () => {
    const fs = require('node:fs'), path = require('node:path'), folder = path.join(__dirname, '..', 'build-scripts');
    const admin = fs.readFileSync(path.join(folder, 'online-server', 'admin.php'), 'utf8'), api = fs.readFileSync(path.join(folder, 'online-server', 'api.php'), 'utf8');
    const deploy = fs.readFileSync(path.join(folder, 'online-deploy.cjs'), 'utf8'), ui = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_online_ui.js'), 'utf8');
    // One section at a time, the one in the address; an unknown one is the overview; a button comes back to its own tab.
    assert.match(admin, /\$tab = isset\(\$tabs\[\(string\)\(\$_GET\['tab'\] \?\? ''\)\]\) \? \(string\)\$_GET\['tab'\] : 'overview';/);
    assert.match(admin, /\$post = '<form class="inline" method="post" action="' \. e\(\$link\(\$tab\)\) \. '">';/);
    for (const id of ['overview', 'accounts', 'characters', 'chat', 'bans', 'settings']) assert.ok(admin.includes("if ($tab === '" + id + "')"), id);
    // Addresses without the file's name where the server rewrites, the file's name everywhere else.
    assert.match(deploy, /RewriteRule \^admin\/\?\$ admin\.php \[L,QSA,E=RR_CLEAN_URLS:1\]\\nRewriteRule \^admin\/\(\[a-z\]\+\)\/\?\$ admin\.php\?tab=\$1 \[L,QSA,E=RR_CLEAN_URLS:1\]/);
    assert.match(admin, /if \(!\$clean\) return 'admin\.php' \. \(\$tab !== 'overview' \? '\?tab=' \. rawurlencode\(\$tab\) : ''\);/);
    assert.match(admin, /\$clean = \$requested !== '' && strpos\(\$requested, 'admin\.php'\) === false;/);
    // A word from the owner: behind the form's token like every action, marked by the server alone, and one player's
    // is kept with that visit's mark and handed only to the visit that holds it.
    assert.match(admin, /\$message = \['t' => time\(\), 'name' => 'Server', 'slot' => -1, 'text' => \$text, 'world' => true, 'admin' => true\];/);
    assert.match(admin, /postChat\(\$dir, 'u' \. \$target, \['world' => false, 'private' => true, 'to' => [\s\S]{0,80}'nonce' => \$mark\] \+ \$message, 50\);/);
    assert.match(admin, /if \(!\$known \|\| \$mark === '' \|\| \$seen >= REPLACED \|\| \$seen < time\(\) - ALIVE_SECONDS\) \$flash = t\('That player is no longer here: nothing was sent\.'\);/);
    assert.match(api, /hash_equals\(tokenFor\(\$mine, \(string\)\(\$_GET\['g'\] \?\? ''\), \$secret\), \(string\)\(\$_GET\['t'\] \?\? ''\)\)\) \{\s*foreach \(readChat\(\$dir, 'u' \. \$mine\) as \$message\) \{\s*if \(!hash_equals\(\(string\)\(\$message\['nonce'\] \?\? ''\), \$pass\)\) continue;\s*unset\(\$message\['nonce'\]\);/);
    // A player cannot mark a line as the owner's: what a player says is built from these fields and no others.
    assert.match(api, /\$message = \['t' => time\(\), 'name' => \(string\)\(\$known\['name'\] \?\? ''\), 'slot' => \$slot, 'text' => filterChat\(/);
    // The game asks with its own pass, shows the owner's lines as the Server's, and never hides them behind a block.
    assert.match(ui, /a: "chat",after: this\.after, m: \$gameMap\.mapId\(\), p: ReactorOnlineParty\.party\?\.id \|\| "", s: ReactorOnline\.slot, g: ReactorOnline\.nonce, t: ReactorOnline\.token/);
    assert.match(ui, /message\.admin \? \(message\.private \? "\[Server, to you\] " : "\[Server\] "\)/);
    assert.match(ui, /if \(!message\.admin && this\.blocked\(\)\.has\(message\.name\)\) continue;/);
});

test('the owner\'s chat is live: lines arrive by themselves, sending keeps the page, and a reload sends nothing twice', () => {
    const admin = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'build-scripts', 'online-server', 'admin.php'), 'utf8');
    // After any action the page is asked for afresh (a reload of the answer to a form sent the same message again), and what
    // the action had to say waits for that page in a note of this visit's own.
    assert.match(admin, /if \(!empty\(\$_POST\['ajax'\]\)\) respond\(\['ok' => true, 'note' => \$flash\]\);[\s\S]{0,700}header\('Location: ' \. \$again, true, 303\);\s*exit;/);
    assert.match(admin, /\$noteFile = \$dir \. '\/admin-note-' \. substr\(hash\('sha256', \(string\)\$_COOKIE\['reactor_admin'\]\), 0, 24\) \. '\.txt';/);
    assert.match(admin, /if \(is_file\(\$noteFile\)\) \{ \$flash = \(string\)@file_get_contents\(\$noteFile\); @unlink\(\$noteFile\); \}/);
    // What is new is asked for every two seconds, only by one who is signed in (the feed sits after that check), and
    // never carries the mark a private line is kept with.
    const gate = admin.indexOf('if (!isAdmin($secret)) {'), feed = admin.indexOf("if (isset($_GET['feed'])) {");
    assert.ok(gate > 0 && feed > gate);
    assert.match(admin, /\$lineOf = function \(array \$message\): array \{\s*return \['id' =>[^;]*'text' => \(string\)\(\$message\['text'\] \?\? ''\)\];/);
    assert.ok(!/'nonce' => \(string\)\(\$message/.test(admin));
    assert.match(admin, /setInterval\(\(\) => \{ if \(!document\.hidden\) ask\(\); \}, 2000\);/);
    assert.match(admin, /make\("span", "said", message\.text\)/, 'a line\'s words are text');
    assert.match(admin, /send\(\{ do: "say", to: to\.value, text: words \}\)/);
});

test('the owner writes to any account, read at once or when its player next arrives, and picks who from a list that narrows as a name is typed', () => {
    const fs = require('node:fs'), path = require('node:path'), folder = path.join(__dirname, '..', 'build-scripts', 'online-server');
    const admin = fs.readFileSync(path.join(folder, 'admin.php'), 'utf8'), api = fs.readFileSync(path.join(folder, 'api.php'), 'utf8');
    const game = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_online.js'), 'utf8');
    // Everyone, every account (playing or not), and the guests who are here.
    assert.match(admin, /\$people\[\] = \['id' => 'a' \. basename\(\$file, '\.json'\), 'name' => \$name, 'note' => isset\(\$nowPlaying\[\$name\]\) \? t\('playing now'\) : t\('not playing'\), 'away' => !isset\(\$nowPlaying\[\$name\]\)\];/);
    assert.match(admin, /if \(\$one\['account'\] === ''\) \$people\[\] = \['id' => 's' \. \(int\)\$slot, 'name' => \$one\['name'\], 'note' => t\('guest, playing now'\), 'away' => false\];/);
    assert.match(admin, /respond\(\['messages' => \$fresh, 'gone' => [^;]*'people' => \$people\]\);/);
    // To an account: kept as owed, and said which of the two it will be.
    assert.match(admin, /\$toAccount = preg_match\('\/\^a\(\[a-f0-9\]\{64\}\)\$\/', \$to, \$found\) \? readAccount\(\$dir, \$found\[1\]\) : null;/);
    assert.match(admin, /postChat\(\$dir, 'a' \. substr\(\$found\[1\], 0, 24\), \['world' => false, 'private' => true, 'to' => \$name, 'pending' => true\] \+ \$message, 50\);/);
    assert.match(admin, /they will read it when they next play\./);
    // The server hands an owed line over once, to the visit signed in as that account and holding its own pass, whatever
    // the game says it has read; afterwards it is an ordinary line of that account's.
    assert.match(api, /\$signedIn = \(string\)\(readNames\(\$dir\)\[\$mine\]\['account'\] \?\? ''\);\s*if \(\$signedIn !== '' && hash_equals\(slotNonce\(\$dir, \$mine\), \$pass\)\) \{/);
    assert.match(api, /if \(\$waiting\) \{ \$owed\[\] = \$message; \$inbox\[\$index\]\['pending'\] = false; \$handed = true; \}\s*else \$messages\[\] = \$message;/);
    assert.match(api, /\$fresh = array_merge\(\$owed, \$fresh\);/);
    assert.match(api, /unset\(\$message\['pending'\]\);/);
    // The game asks once on arriving, since nothing else would fetch a line that waited.
    assert.match(game, /ReactorOnlineChat\.start\(answer\.chat\);[\s\S]{0,400}setTimeout\(\(\) => \{ try \{ if \(ReactorOnline\.token && ReactorOnlineChat\.settings\(\)\) ReactorOnlineChat\.fetch\(\); \}/);
    // The box: typed into, the list narrowing; the plain list stays in the form and holds the choice.
    assert.match(admin, /\.filter\(one => !asked \|\| one\.name\.toLowerCase\(\)\.indexOf\(asked\) >= 0\)/);
    assert.match(admin, /to\.before\(pick\); pick\.append\(who, list\); to\.hidden = true;/);
    assert.match(admin, /row\.append\(make\("b", "", one\.name\), make\("span", "", one\.note\)\);/, 'a name is put on the page as text');
});

test('the owner\'s page speaks the editor\'s languages: every string it shows is in every language, with the same parts to fill in', () => {
    const fs = require('node:fs'), path = require('node:path'), folder = path.join(__dirname, '..', 'build-scripts', 'online-server');
    const admin = fs.readFileSync(path.join(folder, 'admin.php'), 'utf8');
    // The strings the page shows are the ones it asks t() for; the English is the key.
    const keys = [];
    for (const found of admin.matchAll(/\bt\('((?:\\'|[^'])*)'/g)) { const key = found[1].replace(/\\'/g, "'"); if (!keys.includes(key)) keys.push(key); }
    assert.ok(keys.length >= 120, keys.length + ' strings');
    // The editor's own languages, by the same ids, each under the name it calls itself.
    const editor = fs.readFileSync(path.join(__dirname, '..', 'src', 'I18nManager.js'), 'utf8');
    const ids = Array.from(editor.slice(0, editor.indexOf('function normalizeI18nLanguage')).matchAll(/\{ id: '([A-Za-z-]+)', name: '[^']*', nativeName: '([^']*)'/g), found => [found[1], found[2]]);
    assert.equal(ids.length, 18);
    for (const [id, native] of ids) assert.ok(admin.includes("'" + id + "' => '" + native + "'"), id + ' is offered as ' + native);
    const parts = text => (text.match(/\{[a-z]+\}/g) || []).sort().join(' ');
    for (const [id] of ids) {
        if (id === 'en') { assert.equal(fs.existsSync(path.join(folder, 'lang-en.json')), false); continue; }
        const words = JSON.parse(fs.readFileSync(path.join(folder, 'lang-' + id + '.json'), 'utf8'));
        assert.deepEqual(Object.keys(words).filter(key => !keys.includes(key)), [], id + ' has nothing the page does not show');
        for (const key of keys) {
            assert.ok(typeof words[key] === 'string' && words[key].trim() !== '', id + ' lacks: ' + key);
            assert.equal(parts(words[key]), parts(key), id + ' fills in other parts: ' + key);
            assert.ok(!/[<>]/.test(words[key]), id + ' has markup in: ' + key);
        }
    }
    // Chosen by the reader and kept; else the browser's own; Arabic reads right to left; a deploy carries the files.
    assert.match(admin, /setcookie\('reactor_admin_lang', \$language, \['expires' => time\(\) \+ 31536000, 'path' => '\/', 'samesite' => 'Lax'\]\);/);
    assert.match(admin, /foreach \(explode\(',', \(string\)\(\$_SERVER\['HTTP_ACCEPT_LANGUAGE'\] \?\? ''\)\) as \$offered\)/);
    assert.match(admin, /dir="', \(\$language === 'ar' \? 'rtl' : 'ltr'\), '">/);
    assert.match(admin, /@json_decode\(\(string\)@file_get_contents\(__DIR__ \. '\/lang-' \. \$language \. '\.json'\), true\)/);
    assert.match(fs.readFileSync(path.join(folder, '..', 'online-deploy.cjs'), 'utf8'), /if \(\/\^lang-\[A-Za-z-\]\+\\\.json\$\/\.test\(name\)\) swap\(name,/);
    // A word of the reader's language reaches the page escaped like any other.
    assert.ok(!/'<[a-z]+[^']*>' \. t\(/.test(admin), 'a translated string is never joined to markup unescaped');
});
