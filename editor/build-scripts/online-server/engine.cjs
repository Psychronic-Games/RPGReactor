#!/usr/bin/env node
'use strict';
// RPG Reactor online server, Engine mode: the real-time half. No dependencies, so a deploy
// is only a folder. api.php starts this as the site's own user when a player arrives, and it
// leaves by itself when the world has been empty for a while. Accounts, chat, saves and
// characters stay with PHP; this carries movement and the world lane, with the server's word
// on both. Players on polling share the same world: the two meet in the map record files.
//   node engine.cjs <data folder>
const crypto = require('node:crypto'), fs = require('node:fs'), http = require('node:http'), path = require('node:path');

const dir = path.resolve(process.argv[2] || '.');
const config = JSON.parse(fs.readFileSync(path.join(dir, 'engine.json'), 'utf8'));
const { secret, settings = {} } = config;
const engine = settings.engine || {};
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const RELAY_BYTES = 16384, MAX_RELAYS_PER_SECOND = 120;
// What one player's relays may send in a second, counted once per message whatever the number of recipients: a
// host's real-time battle is tens of kilobytes a second (apos ten times a second), and 120 relays of 16 KB to 32
// slots (about 60 MB a second) would back up everyone. At most 32 copies of this budget leave the server a second.
const RELAY_BYTES_PER_SECOND = 262144;
const RECORD = 12, REMOVED = 0xffffffff, REPLACED = 0xfffffffe;
const NEIGHBOURS = 64, SNAPSHOT_HZ = Math.max(5, Math.min(30, Number(engine.rate) || 15));
const IDLE_MS = Number(config.idleMs) || 600000;
const UNREACHED_MS = Math.min(IDLE_MS, 120000);         // no game ever got through: this host has no proxy
const SILENT_MS = 60000, MAX_QUEUE = 1048576, MAX_SETS_PER_SECOND = 30;
const MOVEMENT = engine.movement || 'speed';            // off, speed or walls
const MAX_TILES_PER_SECOND = Number(engine.maxSpeed) || 16;
const MOVE_BUDGET_TILES = MAX_TILES_PER_SECOND * 2 + 4; // how far a stalled connection can be behind
const TRANSFER_GAP_MS = 1000;
const FLAG_TRANSFER = 64, FLAG_FREE = 128;              // just arrived; jumping, riding, or moved by an event

const players = new Map();      // slot -> { socket, map, x, y, flags, clock, heard, ... }
const others = new Map();       // polling players, as the map files have them: map -> Map(slot -> record)
let lastPlayer = Date.now(), everReached = false;

// ---- WebSocket: RFC 6455, binary and text, no compression ----

function frame(payload, opcode) {
    const n = payload.length, head = n < 126 ? 2 : n < 65536 ? 4 : 10, out = Buffer.allocUnsafe(head + n);
    out[0] = 0x80 | opcode;
    if (n < 126) out[1] = n;
    else if (n < 65536) { out[1] = 126; out.writeUInt16BE(n, 2); }
    else { out[1] = 127; out.writeBigUInt64BE(BigInt(n), 2); }
    payload.copy(out, head);
    return out;
}

function reader(socket, onMessage) {
    let held = Buffer.alloc(0);
    return chunk => {
        const b = held.length ? Buffer.concat([held, chunk]) : chunk;
        let at = 0;
        for (;;) {
            if (b.length - at < 2) break;
            const opcode = b[at] & 15, masked = b[at + 1] & 0x80;
            let n = b[at + 1] & 0x7f, p = at + 2;
            if (n === 126) { if (b.length - at < 4) break; n = b.readUInt16BE(p); p += 2; }
            else if (n === 127) { if (b.length - at < 10) break; n = Number(b.readBigUInt64BE(p)); p += 8; }
            if (n > 65536) { socket.destroy(); return; }    // nothing a game sends is this large
            const key = masked ? p : -1;
            if (masked) p += 4;
            if (b.length - p < n) break;
            const payload = Buffer.from(b.subarray(p, p + n));
            if (masked) for (let i = 0; i < n; i++) payload[i] ^= b[key + (i & 3)];
            at = p + n;
            if (opcode === 8) { socket.end(frame(payload.subarray(0, 2), 8)); return; }
            if (opcode === 9) socket.write(frame(payload, 10));
            else if (opcode === 1 || opcode === 2) onMessage(payload, opcode);
        }
        held = at < b.length ? Buffer.from(b.subarray(at)) : Buffer.alloc(0);
    };
}

const sendText = (socket, value) => { if (!socket.destroyed) socket.write(frame(Buffer.from(JSON.stringify(value)), 1)); };

// ---- The world lane: this process is its only writer while it runs ----

function readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { return fallback; }
}

const world = Object.assign({ s: {}, v: {}, e: {} }, readJson(path.join(dir, 'world.json'), {}));
let worldCount = 0, worldDirty = false;
try { worldCount = fs.readFileSync(path.join(dir, 'worldseq.bin')).readUInt32LE(0); } catch (error) { worldCount = 0; }

function idList(text) {
    const ids = new Set();
    for (const part of String(text || '').split(/[\s,]+/)) {
        const range = /^(\d+)-(\d+)$/.exec(part);
        if (range) for (let id = +range[1]; id <= Math.min(+range[2], +range[1] + 5000); id++) ids.add(id);
        else if (/^\d+$/.test(part)) ids.add(+part);
    }
    return ids;
}

const sharedSwitches = idList(settings.world?.switches), sharedVariables = idList(settings.world?.variables);
// The events the project shares ("map,event"), listed at deploy; a server deployed before the list takes any.
const sharedEvents = Array.isArray(settings.world?.events) ? new Set(settings.world.events.map(String)) : null;

/** One change to the world, in the order it arrived. Returns what every game should now hold. */
function applyChange(change) {
    // Anything a game sends reaches here: an entry that is no object is passed over, never read (it ended this process).
    if (!change || typeof change !== 'object') return null;
    const kind = String(change.kind || ''), id = String(change.id || '');
    if (kind === 's' && sharedSwitches.has(+id)) return (world.s[+id] = !!change.value, { kind, id, value: world.s[+id] });
    if (kind === 'v' && sharedVariables.has(+id)) {
        // "Add 1" stays "add 1": two players adding at once both count.
        if (typeof change.delta === 'number' && Number.isFinite(change.delta)) {
            const base = typeof world.v[+id] === 'number' ? world.v[+id] : 0;
            world.v[+id] = base + change.delta;
        } else {
            const value = change.value;
            if (!(typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length <= 256))) return null;
            world.v[+id] = value;
        }
        return { kind, id, value: world.v[+id] };
    }
    if (kind === 'e' && /^\d{1,4},\d{1,6},[A-Da-d]$/.test(id) && (!sharedEvents || sharedEvents.has(id.slice(0, id.lastIndexOf(',')))) && (id in world.e || Object.keys(world.e).length < 5000)) return (world.e[id] = !!change.value, { kind, id, value: world.e[id] });
    return null;
}

/** PHP writes the world itself if this process was too busy to answer it. Its change counts too. */
function adoptWorldFile() {
    if (worldDirty) return;
    let count = 0;
    try { count = fs.readFileSync(path.join(dir, 'worldseq.bin')).readUInt32LE(0); } catch (error) { return; }
    if (count === worldCount) return;
    worldCount = count;
    Object.assign(world, { s: {}, v: {}, e: {} }, readJson(path.join(dir, 'world.json'), {}));
    for (const player of players.values()) sendText(player.socket, { t: 'world', world, count });
}

function applyChanges(changes) {
    const done = (Array.isArray(changes) ? changes.slice(0, 64) : []).map(applyChange).filter(Boolean);
    if (!done.length) return worldCount;
    worldCount++;
    worldDirty = true;
    for (const player of players.values()) sendText(player.socket, { t: 'w', changes: done, count: worldCount });
    return worldCount;
}

function atomicWrite(name, contents) {
    const file = path.join(dir, name), temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, file);
}

function flushWorld() {
    if (!worldDirty) return;
    worldDirty = false;
    atomicWrite('world.json', JSON.stringify(world));
    const count = Buffer.alloc(4);
    count.writeUInt32LE(worldCount, 0);
    atomicWrite('worldseq.bin', count);
}

// ---- Movement: the server's word ----

function loadGrid(map) {
    if (grids.has(map)) return grids.get(map);
    let grid = null;
    try {
        const data = fs.readFileSync(path.join(config.folder, 'grids', 'm' + map + '.bin'));
        grid = { width: data.readUInt16LE(0), height: data.readUInt16LE(2), bits: data.subarray(4) };
    } catch (error) { grid = null; }
    grids.set(map, grid);
    return grid;
}
const grids = new Map();

function solidAt(map, x, y) {
    const grid = loadGrid(map);
    if (!grid) return false;
    const tx = Math.round(x / 32), ty = Math.round(y / 32);
    if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
    const at = ty * grid.width + tx;
    return !(grid.bits[at >> 3] & (1 << (at & 7)));
}

/**
 * Whether a reported place could be real. A refused one is not passed on, and its player is
 * put back. This catches a changed speed or a walk through walls. It can't catch a game
 * claiming a transfer an event never made: only the player's own game runs the events.
 */
function allowed(player, map, x, y, flags, now) {
    if (MOVEMENT === 'off' || !player.seen) return true;
    if (map !== player.map || flags & FLAG_TRANSFER) {
        if (now - (player.transferAt || 0) < TRANSFER_GAP_MS) return false;
        player.transferAt = now;
        player.budget = MOVE_BUDGET_TILES;
        return true;
    }
    // A budget, not a limit per report: many small reports can't add up to more than one large one.
    const budget = Math.min(MOVE_BUDGET_TILES, (player.budget ?? MOVE_BUDGET_TILES) + MAX_TILES_PER_SECOND * (now - player.heard) / 1000);
    const distance = Math.hypot(x - player.x, y - player.y) / 32;
    if (distance > budget) return false;
    if (MOVEMENT === 'walls' && !(flags & FLAG_FREE) && solidAt(map, x, y)) return false;
    player.budget = budget - distance;
    return true;
}

function onPlace(player, data) {
    const now = Date.now(), flags = data[1], map = data.readUInt16LE(2), x = data.readUInt16LE(4), y = data.readUInt16LE(6), clock = data.readUInt32LE(8);
    if (!allowed(player, map, x, y, flags, now)) {
        if (now - (player.fixedAt || 0) > 500) { player.fixedAt = now; sendText(player.socket, { t: 'fix', map: player.map, x: player.x, y: player.y }); }
        return;
    }
    if (player.seen && map !== player.map) clearRecord(player.map, player.slot);
    Object.assign(player, { seen: true, map, x, y, flags, clock, heard: now });
}

// ---- Snapshots: only those nearby, encoded once ----

function snapshot() {
    const cells = new Map();
    const add = (map, slot, x, y, flags, clock) => {
        const key = map * 1048576 + (x >> 9) * 1024 + (y >> 9);     // 512 units is 16 tiles
        let cell = cells.get(key);
        if (!cell) cells.set(key, cell = { buffer: Buffer.allocUnsafe(11 * 32), n: 0 });
        if (cell.n * 11 === cell.buffer.length) { const big = Buffer.allocUnsafe(cell.buffer.length * 2); cell.buffer.copy(big); cell.buffer = big; }
        const at = cell.n++ * 11, b = cell.buffer;
        b.writeUInt16LE(slot, at); b.writeUInt16LE(x, at + 2); b.writeUInt16LE(y, at + 4); b[at + 6] = flags; b.writeUInt32LE(clock >>> 0, at + 7);
    };
    for (const [slot, p] of players) if (p.seen) add(p.map, slot, p.x, p.y, p.flags, p.clock);
    for (const [map, records] of others) for (const [slot, r] of records) if (!players.has(slot)) add(map, slot, r.x, r.y, r.flags, r.clock);
    const out = Buffer.allocUnsafe(5 + NEIGHBOURS * 11);
    out[0] = 2;
    for (const [slot, p] of players) {
        if (p.socket.writableLength > MAX_QUEUE) { p.socket.destroy(); continue; }
        if (!p.seen || p.socket.writableLength > 65536) continue;    // a slow connection skips a beat, it doesn't queue
        let at = 5, n = 0;
        const cx = p.x >> 9, cy = p.y >> 9;
        scan: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const cell = cells.get(p.map * 1048576 + (cx + dx) * 1024 + (cy + dy));
            if (!cell) continue;
            for (let i = 0; i < cell.n; i++) {
                if (cell.buffer.readUInt16LE(i * 11) === slot) continue;
                cell.buffer.copy(out, at, i * 11, (i + 1) * 11);
                at += 11;
                if (++n >= NEIGHBOURS) break scan;
            }
        }
        out.writeUInt16LE(n, 1);
        out.writeUInt16LE(p.map, 3);
        p.socket.write(frame(out.subarray(0, at), 2));
    }
}

// ---- Meeting the polling players, and PHP, in the shared files ----

/** Takes a player out of a map's file, so nobody polling sees a ghost for the seconds it takes to go stale. */
function clearRecord(map, slot) {
    let handle;
    try { handle = fs.openSync(path.join(dir, `p2m${map}.bin`), 'r+'); } catch (error) { return; }
    fs.writeSync(handle, Buffer.alloc(RECORD), 0, RECORD, slot * RECORD);
    fs.closeSync(handle);
}

function exchangeFiles() {
    const nowSeconds = Math.floor(Date.now() / 1000), maps = new Set();
    for (const p of players.values()) if (p.seen) maps.add(p.map);
    const record = Buffer.allocUnsafe(RECORD);
    for (const map of maps) {
        const file = path.join(dir, `p2m${map}.bin`);
        let handle;
        try { handle = fs.openSync(file, fs.existsSync(file) ? 'r+' : 'w+'); } catch (error) { continue; }
        for (const [slot, p] of players) {
            if (!p.seen || p.map !== map) continue;
            record.writeUInt16LE(p.x, 0); record.writeUInt16LE(p.y, 2); record.writeUInt16LE(p.flags & 63, 4);
            record.writeUInt16LE(nowSeconds & 0xffff, 6); record.writeUInt32LE(p.clock >>> 0, 8);
            fs.writeSync(handle, record, 0, RECORD, slot * RECORD);
        }
        const size = fs.fstatSync(handle).size, data = Buffer.allocUnsafe(size);
        fs.readSync(handle, data, 0, size, 0);
        fs.closeSync(handle);
        const records = new Map();
        for (let slot = 0; (slot + 1) * RECORD <= size; slot++) {
            if (players.has(slot)) continue;
            const at = slot * RECORD, stamp = data.readUInt16LE(at + 6), flags = data.readUInt16LE(at + 4);
            if (!(flags & 15) || ((nowSeconds - stamp) & 0xffff) > 5) continue;
            records.set(slot, { x: data.readUInt16LE(at), y: data.readUInt16LE(at + 2), flags, clock: data.readUInt32LE(at + 8) });
        }
        others.set(map, records);
    }
    for (const map of others.keys()) if (!maps.has(map)) others.delete(map);
}

function exchangeStatus() {
    let chat = 0, handle = null;
    try { chat = fs.readFileSync(path.join(dir, 'chatseq.bin')).readUInt32LE(0); } catch (error) { chat = 0; }
    try { handle = fs.openSync(path.join(dir, 'alive.bin'), 'r+'); } catch (error) { handle = null; }
    adoptWorldFile();
    const now = Date.now(), state = Buffer.alloc(4), stamp = Buffer.allocUnsafe(4);
    stamp.writeUInt32LE(Math.floor(now / 1000), 0);
    for (const [slot, p] of players) {
        if (now - p.lastMessage > SILENT_MS) { p.socket.destroy(); continue; }
        if (handle !== null) {
            state.fill(0);
            fs.readSync(handle, state, 0, 4, slot * 4);
            const value = state.readUInt32LE(0);
            if (value === REMOVED || value === REPLACED) {
                sendText(p.socket, { t: 'removed', message: value === REMOVED ? 'You have been removed from this world.' : 'You signed in somewhere else.' });
                p.socket.end();
                continue;
            }
            fs.writeSync(handle, stamp, 0, 4, slot * 4);
        }
        if (p.chat !== chat) { p.chat = chat; sendText(p.socket, { t: 'chat', count: chat }); }
    }
    if (handle !== null) fs.closeSync(handle);
}

// ---- Players arriving ----

function tokenFor(slot, nonce) {
    return crypto.createHmac('sha256', secret).update(slot + '.' + nonce).digest('hex').slice(0, 24);
}

function withinSetLimit(player) {
    const second = Math.floor(Date.now() / 1000);
    if (player.setSecond !== second) { player.setSecond = second; player.sets = 0; }
    return ++player.sets <= MAX_SETS_PER_SECOND;
}

/** A real-time battle's messages, straight to the players in it. The game that hosts the battle decides what is true; this only carries. */
function relay(player, message) {
    const out = { t: 'bf', from: player.slot, m: message.m };
    const size = JSON.stringify(out).length;
    const second = Math.floor(Date.now() / 1000);
    if (player.relayBytesSecond !== second) { player.relayBytesSecond = second; player.relayBytes = 0; }
    // The budget counts what the sender sends, once per message: counted per recipient, a host of a large battle
    // (apos ten times a second to every guest) ran out each second and the guests last in `to` lost the rest of it.
    // What one message can cost the server is held by the 32 recipients at most and the relay count.
    if (player.relayBytes + size > RELAY_BYTES_PER_SECOND) return;
    player.relayBytes += size;
    for (const slot of new Set(message.to.slice(0, 32))) {
        const other = players.get(slot);
        if (!other || other === player) continue;
        // A recipient already backed up misses this one, rather than being cut off for someone else's traffic.
        if (other.socket.writableLength > MAX_QUEUE / 2) continue;
        sendText(other.socket, out);
    }
}

function withinRelayLimit(player) {
    const second = Math.floor(Date.now() / 1000);
    if (player.relaySecond !== second) { player.relaySecond = second; player.relays = 0; }
    return ++player.relays <= MAX_RELAYS_PER_SECOND;
}

/** The nonce the API kept for the slot's current visit (nonce.bin, 8 bytes a slot), or '' when none was kept. */
function slotNonce(slot) {
    let handle = null;
    try {
        handle = fs.openSync(path.join(dir, 'nonce.bin'), 'r');
        const bytes = Buffer.alloc(8);
        const read = fs.readSync(handle, bytes, 0, 8, slot * 8);
        return read === 8 && bytes.some(byte => byte !== 0) ? bytes.toString('hex') : '';
    } catch (error) {
        return '';
    } finally {
        if (handle !== null) fs.closeSync(handle);
    }
}

function welcome(socket) {
    let player = null;
    const timer = setTimeout(() => socket.destroy(), 5000);
    const read = reader(socket, (payload, opcode) => {
        if (!player) {
            let hello = null;
            try { hello = opcode === 1 ? JSON.parse(payload.toString()) : null; } catch (error) { hello = null; }
            const slot = Number(hello?.slot), token = Buffer.from(String(hello?.token || '')), right = Number.isInteger(slot) && slot >= 0 ? Buffer.from(tokenFor(slot, String(hello?.nonce || ''))) : Buffer.alloc(0);
            if (!right.length || token.length !== right.length || !crypto.timingSafeEqual(token, right)) { sendText(socket, { t: 'refused' }); socket.end(); return; }
            // A token from an earlier visit to this slot (the slot given to someone else since) is refused, as the API refuses it.
            const current = slotNonce(slot);
            if (current && current !== String(hello?.nonce || '').toLowerCase()) { sendText(socket, { t: 'refused' }); socket.end(); return; }
            clearTimeout(timer);
            players.get(slot)?.socket.destroy();
            player = { socket, slot, map: 0, x: 0, y: 0, flags: 0, clock: 0, heard: Date.now(), lastMessage: Date.now(), seen: false };
            players.set(slot, player);
            lastPlayer = Date.now();
            everReached = true;
            sendText(socket, { t: 'ready', world, count: worldCount });
            return;
        }
        player.lastMessage = Date.now();
        if (opcode === 2 && payload.length >= 12 && payload[0] === 1) onPlace(player, payload);
        else if (opcode === 1) {
            let message = null;
            try { message = JSON.parse(payload.toString()); } catch (error) { message = null; }
            // One player's malformed message must not end the Engine for everyone.
            try {
                if (message?.t === 'set' && withinSetLimit(player)) applyChanges(message.changes);
                else if (message?.t === 'bf' && Array.isArray(message.to) && payload.length <= RELAY_BYTES && withinRelayLimit(player)) relay(player, message);
            } catch (error) { console.error('message refused:', error && error.message); }
        }
    });
    socket.on('data', read);
    const leave = () => {
        clearTimeout(timer);
        if (!player || players.get(player.slot) !== player) return;
        players.delete(player.slot);
        lastPlayer = Date.now();
        if (player.seen) clearRecord(player.map, player.slot);
    };
    socket.on('close', leave);
    socket.on('error', leave);
}

function upgrade(request, socket) {
    const key = request.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    socket.setNoDelay(true);
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    welcome(socket);
}

/** For PHP on this machine: health, shared changes from players on polling, and stopping for a rebuild. */
function local(request, response) {
    if (request.headers['x-reactor-secret'] !== secret) { response.writeHead(403); response.end(); return; }
    if (request.url === '/set') {
        let body = '';
        request.on('data', chunk => { body += chunk; if (body.length > 65536) request.destroy(); });
        request.on('end', () => {
            let changes = [];
            let count = worldCount;
            try { changes = JSON.parse(body).changes; count = applyChanges(changes); } catch (error) { count = worldCount; }
            response.end(JSON.stringify({ count }));
        });
        return;
    }
    if (request.url === '/stop') { response.end('{}', stop); return; }
    response.end(JSON.stringify({ ok: true, players: players.size, pid: process.pid, stamp: config.stamp || '' }));
}

const inside = http.createServer(local);
inside.on('upgrade', upgrade);
inside.on('error', error => { console.error(error.message); process.exit(error.code === 'EADDRINUSE' ? 0 : 1); });
inside.listen(config.port, '127.0.0.1');

setInterval(snapshot, 1000 / SNAPSHOT_HZ);
setInterval(exchangeFiles, 200);
setInterval(exchangeStatus, 1000);
setInterval(flushWorld, 250);
setInterval(() => {
    if (players.size || Date.now() - lastPlayer <= (everReached ? IDLE_MS : UNREACHED_MS)) return;
    // Nobody could reach it: PHP won't start it again until this site's server changes.
    if (!everReached) { try { fs.writeFileSync(path.join(dir, 'engine.unreached'), ''); } catch (error) { console.error(error.message); } }
    stop();
}, 5000);

function stop() {
    try { flushWorld(); } catch (error) { console.error(error.message); }
    process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
