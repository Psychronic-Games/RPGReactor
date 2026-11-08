'use strict';
// The Engine, run for real: its own process, real sockets, real files.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const engineFile = path.resolve(__dirname, '../build-scripts/online-server/engine.cjs');
const secret = 'a'.repeat(64);
const sleep = ms => new Promise(done => setTimeout(done, ms));
const tokenFor = (slot, nonce) => crypto.createHmac('sha256', secret).update(slot + '.' + nonce).digest('hex').slice(0, 24);
const freePort = () => new Promise(done => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => done(port)); }); });

async function start(t, settings = {}, extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-engine-')), port = await freePort();
    fs.writeFileSync(path.join(dir, 'engine.json'), JSON.stringify({ secret, port, settings, folder: dir, ...extra }));
    fs.writeFileSync(path.join(dir, 'alive.bin'), Buffer.alloc(4 * 16));
    const child = spawn(process.execPath, [engineFile, dir], { stdio: 'inherit' });
    t.after(() => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
    for (let i = 0; i < 100; i++) {
        const up = await new Promise(done => { const c = net.connect(port, '127.0.0.1', () => { c.destroy(); done(true); }); c.on('error', () => done(false)); });
        if (up) break;
        await sleep(20);
    }
    return { dir, port, child };
}

async function join({ port }, slot, { token, nonce = 'n' + slot } = {}) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/`), inbox = [], places = [];
    socket.binaryType = 'arraybuffer';
    socket.onmessage = event => { if (typeof event.data === 'string') inbox.push(JSON.parse(event.data)); else places.push(event.data); };
    await new Promise(done => { socket.onopen = done; });
    socket.send(JSON.stringify({ slot, nonce, token: token ?? tokenFor(slot, nonce) }));
    const player = { socket, inbox, places, slot,
        place(x, y, { map = 1, flags = 2, clock = 1000 } = {}) {
            const data = new DataView(new ArrayBuffer(12));
            data.setUint8(0, 1); data.setUint8(1, flags); data.setUint16(2, map, true); data.setUint16(4, x * 32, true); data.setUint16(6, y * 32, true); data.setUint32(8, clock, true);
            socket.send(data.buffer);
        },
        set(changes) { socket.send(JSON.stringify({ t: 'set', changes })); },
        async seen(test, ms = 1500) { for (let t = 0; t < ms; t += 20) { const last = places.at(-1), found = last && decode(last).find(test); if (found) return found; await sleep(20); } return null; },
        async heard(test, ms = 1500) { for (let t = 0; t < ms; t += 20) { const found = inbox.find(test); if (found) return found; await sleep(20); } return null; } };
    return player;
}

function decode(buffer) {
    const view = new DataView(buffer), out = [];
    for (let i = 0; i < view.getUint16(1, true); i++) {
        const at = 5 + i * 11;
        out.push({ slot: view.getUint16(at, true), x: view.getUint16(at + 2, true) / 32, y: view.getUint16(at + 4, true) / 32, flags: view.getUint8(at + 6), clock: view.getUint32(at + 7, true) });
    }
    return out;
}

const ask = (port, route, body) => new Promise((done, fail) => {
    const request = http.request({ port, host: '127.0.0.1', path: route, method: body ? 'POST' : 'GET', headers: { 'x-reactor-secret': secret } }, response => {
        let text = ''; response.on('data', chunk => { text += chunk; }); response.on('end', () => done({ status: response.statusCode, text }));
    });
    request.on('error', fail);
    request.end(body);
});

test('a wrong token gets nothing; a right one is welcomed with the world', async t => {
    const engine = await start(t, { world: { switches: '1' } });
    const stranger = await join(engine, 0, { token: 'wrong' });
    assert.ok(await stranger.heard(m => m.t === 'refused'));
    const player = await join(engine, 1);
    assert.ok((await player.heard(m => m.t === 'ready')).world);
    player.socket.close();
});

test('players see each other on one map, nearby only, and never themselves', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0), b = await join(engine, 1), far = await join(engine, 2), elsewhere = await join(engine, 3);
    a.place(10, 10); b.place(11, 10, { clock: 777 }); far.place(180, 180); elsewhere.place(10, 10, { map: 2 });
    const seen = await a.seen(p => p.slot === 1);
    assert.equal(seen.x, 11);
    assert.equal(seen.clock, 777, 'the sender\'s clock comes through');
    const list = decode(a.places.at(-1)).map(p => p.slot);
    assert.deepEqual(list, [1]);
    for (const p of [a, b, far, elsewhere]) p.socket.close();
});

test('an impossible move is refused, passed to nobody, and its player is put back', async t => {
    const engine = await start(t, { engine: { movement: 'speed' } });
    const a = await join(engine, 0), b = await join(engine, 1);
    a.place(10, 10); b.place(11, 10);
    assert.ok(await b.seen(p => p.slot === 0));
    a.place(190, 190);
    const fix = await a.heard(m => m.t === 'fix');
    assert.equal(fix.x / 32, 10);
    await sleep(150);
    assert.equal(decode(b.places.at(-1))[0].x, 10);
    await sleep(120);
    a.place(11, 10);
    assert.equal((await b.seen(p => p.slot === 0 && p.x === 11)).y, 10, 'a normal step still works');
    a.socket.close(); b.socket.close();
});

test('many small jumps cannot add up to what one large jump could not', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0), b = await join(engine, 1);
    a.place(10, 10); b.place(11, 10);
    assert.ok(await b.seen(p => p.slot === 0));
    for (let i = 1; i <= 40; i++) { a.place(10 + i * 3, 10); await sleep(16); }
    assert.ok(await a.heard(m => m.t === 'fix'), 'a player sent back');
    await sleep(100);
    a.socket.close();
    b.socket.close();
});

test('an honest runner is never refused, and a same-map teleport the game made is allowed', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0), b = await join(engine, 1);
    a.place(10, 10); b.place(100, 45);
    await sleep(60);
    for (let i = 1; i <= 60; i++) { a.place(10 + i * 0.5, 10); await sleep(66); }    // 7.5 tiles a second
    a.place(101, 45, { flags: 2 | 64 });
    assert.equal((await b.seen(p => p.slot === 0 && p.x === 101)).y, 45);
    assert.equal(a.inbox.filter(m => m.t === 'fix').length, 0);
    a.socket.close();
    b.socket.close();
});

test('changing map takes a player out of the old map\'s file, and so does leaving', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0), watcher = await join(engine, 1);
    a.place(10, 10); watcher.place(10, 10);
    await sleep(350);
    const oldMap = path.join(engine.dir, 'p2m1.bin'), newMap = path.join(engine.dir, 'p2m2.bin');
    assert.equal(fs.readFileSync(oldMap).readUInt16LE(0), 320);
    a.place(5, 5, { map: 2, flags: 2 | 64 });
    await sleep(350);
    assert.equal(fs.readFileSync(oldMap).readUInt16LE(0), 0);
    watcher.place(5, 5, { map: 2, flags: 2 | 64 });
    await sleep(350);
    assert.equal(fs.readFileSync(newMap).readUInt16LE(0), 160);
    a.socket.close();
    await sleep(150);
    assert.equal(fs.readFileSync(newMap).readUInt16LE(0), 0);
    watcher.socket.close();
});

test('a snapshot says which map it describes', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0);
    a.place(10, 10, { map: 7 });
    for (let i = 0; i < 50 && !a.places.length; i++) await sleep(20);
    assert.equal(new DataView(a.places.at(-1)).getUint16(3, true), 7);
    a.socket.close();
});

test('a change PHP wrote while the Engine was busy is kept, not overwritten', async t => {
    const engine = await start(t, { world: { switches: '1,2' } });
    const a = await join(engine, 0);
    await a.heard(m => m.t === 'ready');
    fs.writeFileSync(path.join(engine.dir, 'world.json'), JSON.stringify({ s: { 2: true } }));
    const count = Buffer.alloc(4); count.writeUInt32LE(5, 0);
    fs.writeFileSync(path.join(engine.dir, 'worldseq.bin'), count);
    const news = await a.heard(m => m.t === 'world', 2500);
    assert.equal(news.count, 5);
    assert.equal(news.world.s[2], true);
    a.set([{ kind: 's', id: '1', value: true }]);
    await sleep(500);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(engine.dir, 'world.json'), 'utf8')).s, { 1: true, 2: true });
    a.socket.close();
});

test('a flood of shared changes is cut off at a limit', async t => {
    const engine = await start(t, { world: { variables: '5' } });
    const a = await join(engine, 0);
    await a.heard(m => m.t === 'ready');
    for (let i = 0; i < 200; i++) a.set([{ kind: 'v', id: '5', delta: 1, value: 1 }]);
    await sleep(300);
    assert.ok(a.inbox.filter(m => m.t === 'w').at(-1).changes[0].value <= 60);
    a.socket.close();
});

test('a battle host\'s relays reach every guest: the byte budget counts what the host sends, not each copy', async t => {
    const engine = await start(t);
    const players = [];
    for (let slot = 0; slot <= 12; slot++) players.push(await join(engine, slot));
    for (const player of players) assert.ok(await player.heard(m => m.t === 'ready'));
    const [host, ...guests] = players, to = guests.map(guest => guest.slot);
    // 25 messages of about 8 KB to 12 guests: 200 KB sent, 2.4 MB of copies. Counted per copy, the guests last in `to`
    // lost all but the first two each second.
    for (let i = 0; i < 25; i++) host.socket.send(JSON.stringify({ t: 'bf', to, m: { t: 'apos', i, pad: 'x'.repeat(8000) } }));
    const last = guests.at(-1);
    for (let waited = 0; waited < 3000 && last.inbox.filter(m => m.t === 'bf').length < 25; waited += 20) await sleep(20);
    for (const guest of guests) assert.equal(guest.inbox.filter(m => m.t === 'bf').length, 25, `slot ${guest.slot} heard every message`);
    for (const player of players) player.socket.close();
});

test('a rebuild can ask it to stop, and nobody else can', async t => {
    const engine = await start(t, {}, { stamp: 'build-1' });
    assert.equal(JSON.parse((await ask(engine.port, '/health')).text).stamp, 'build-1');
    const exited = new Promise(done => engine.child.on('exit', done));
    await ask(engine.port, '/stop', '{}');
    assert.equal(await exited, 0);
});

test('nobody reaching it means no proxy here, and it says so as it leaves', async t => {
    const engine = await start(t, {}, { idleMs: 200 });
    await new Promise(done => engine.child.on('exit', done));
    assert.ok(fs.existsSync(path.join(engine.dir, 'engine.unreached')));
});

test('a transfer between maps is allowed, but cannot be claimed over and over', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0), b = await join(engine, 1);
    a.place(10, 10); b.place(100, 100, { map: 2 });
    await sleep(60);
    a.place(100, 101, { map: 2, flags: 2 | 64 });
    assert.ok(await b.seen(p => p.slot === 0));
    a.place(10, 10, { map: 2, flags: 2 | 64 });
    assert.ok(await a.heard(m => m.t === 'fix'), 'a second jump at once is refused');
    a.socket.close(); b.socket.close();
});

test('with a baked grid, walls are enforced; a rider or jumper is left alone', async t => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-grid-'));
    t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    fs.mkdirSync(path.join(folder, 'grids'));
    const width = 16, height = 16, bits = Buffer.alloc(32, 0xff), header = Buffer.alloc(4);
    header.writeUInt16LE(width, 0); header.writeUInt16LE(height, 2);
    const at = 5 * 16 + 6; bits[at >> 3] &= ~(1 << (at & 7));      // tile 6,5 is solid
    fs.writeFileSync(path.join(folder, 'grids/m1.bin'), Buffer.concat([header, bits]));
    const engine = await start(t, { engine: { movement: 'walls' } }, { folder });
    const a = await join(engine, 0);
    a.place(5, 5); await sleep(40);
    a.place(6, 5);
    assert.ok(await a.heard(m => m.t === 'fix'), 'into a wall');
    a.inbox.length = 0;
    await sleep(520);
    a.place(6, 5, { flags: 2 | 128 });
    assert.equal(await a.heard(m => m.t === 'fix', 250), null, 'flying or riding over it');
    a.socket.close();
});

test('changes reach everyone at once, and two players adding both count', async t => {
    const engine = await start(t, { world: { switches: '1', variables: '5' } });
    const a = await join(engine, 0), b = await join(engine, 1);
    await a.heard(m => m.t === 'ready');
    a.set([{ kind: 's', id: '1', value: true }, { kind: 's', id: '2', value: true }]);
    const heard = await b.heard(m => m.t === 'w');
    assert.deepEqual(heard.changes, [{ kind: 's', id: '1', value: true }], 'only what the project shares');
    for (let i = 0; i < 20; i++) { a.set([{ kind: 'v', id: '5', delta: 1, value: 1 }]); b.set([{ kind: 'v', id: '5', delta: 1, value: 1 }]); }
    await sleep(200);
    const last = b.inbox.filter(m => m.t === 'w').at(-1);
    assert.equal(last.changes[0].value, 40, 'none lost');
    await sleep(1200);
    assert.equal(JSON.parse(fs.readFileSync(path.join(engine.dir, 'world.json'), 'utf8')).v[5], 40, 'and it lands on disk for PHP');
    a.socket.close(); b.socket.close();
});

test('polling players and Engine players share one world', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 0);
    a.place(10, 10);
    await sleep(350);
    const file = path.join(engine.dir, 'p2m1.bin');
    const written = fs.readFileSync(file);
    assert.equal(written.readUInt16LE(0), 320, 'an Engine player is in the file polling reads');
    const record = Buffer.alloc(12);
    record.writeUInt16LE(11 * 32, 0); record.writeUInt16LE(10 * 32, 2); record.writeUInt16LE(2, 4);
    record.writeUInt16LE(Math.floor(Date.now() / 1000) & 0xffff, 6); record.writeUInt32LE(55, 8);
    const handle = fs.openSync(file, 'r+');
    fs.writeSync(handle, record, 0, 12, 3 * 12);
    fs.closeSync(handle);
    assert.equal((await a.seen(p => p.slot === 3)).clock, 55, 'and a polling player reaches the socket');
    a.socket.close();
});

test('the owner\'s removal reaches a connected player, and chat news arrives by itself', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 2);
    await a.heard(m => m.t === 'ready');
    const count = Buffer.alloc(4); count.writeUInt32LE(9, 0);
    fs.writeFileSync(path.join(engine.dir, 'chatseq.bin'), count);
    assert.equal((await a.heard(m => m.t === 'chat', 2500)).count, 9);
    const alive = fs.openSync(path.join(engine.dir, 'alive.bin'), 'r+'), removed = Buffer.alloc(4, 0xff);
    fs.writeSync(alive, removed, 0, 4, 2 * 4);
    fs.closeSync(alive);
    assert.match((await a.heard(m => m.t === 'removed', 2500)).message, /removed/);
});

test('keeps a player alive for PHP, and only PHP can ask it things', async t => {
    const engine = await start(t, {});
    const a = await join(engine, 1);
    await a.heard(m => m.t === 'ready');
    await sleep(1200);
    assert.ok(fs.readFileSync(path.join(engine.dir, 'alive.bin')).readUInt32LE(4) > 1000000, 'alive.bin stays fresh');
    assert.equal(JSON.parse((await ask(engine.port, '/health')).text).players, 1);
    const denied = await new Promise(done => http.get({ port: engine.port, host: '127.0.0.1', path: '/health' }, response => { response.resume(); done(response.statusCode); }));
    assert.equal(denied, 403);
    a.socket.close();
});

test('leaves by itself when the world empties, saving as it goes', async t => {
    const engine = await start(t, { world: { switches: '1' } }, { idleMs: 200 });
    const a = await join(engine, 0);
    await a.heard(m => m.t === 'ready');
    a.set([{ kind: 's', id: '1', value: true }]);
    await sleep(50);
    a.socket.close();
    const code = await new Promise(done => { engine.child.on('exit', done); setTimeout(() => done('still running'), 7000); });
    assert.equal(code, 0);
    assert.equal(JSON.parse(fs.readFileSync(path.join(engine.dir, 'world.json'), 'utf8')).s[1], true);
});
