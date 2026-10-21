'use strict';
// An RTP from whatever the author has: a RAR (Don Miguel's RTPE.exe is a
// self-extracting RAR 2.0), a zip, an installer, or a folder with one of them
// or the RTP somewhere inside; the RTP on hand that best fits a game; and a
// copy that answers to both the official and Don Miguel's names.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const legacy = path.join(__dirname, '..', 'src', 'legacy');
const Rar = require(path.join(legacy, 'Rar2.js'));
const RM = require(path.join(legacy, 'RtpManager.js'));
const I = require(path.join(legacy, 'LegacyImporter.js'));

/** Bits, most significant first, as RAR reads them. */
function BitWriter() { this.bytes = []; this.acc = 0; this.n = 0; }
BitWriter.prototype.put = function(value, bits) { for (let i = bits - 1; i >= 0; i--) { this.acc = (this.acc << 1) | ((value >>> i) & 1); if (++this.n === 8) { this.bytes.push(this.acc); this.acc = 0; this.n = 0; } } };
BitWriter.prototype.done = function() { if (this.n) this.put(0, 8 - this.n); return Buffer.from(this.bytes.concat([0, 0, 0, 0])); };

/**
 * RAR 2.0 data for `bytes` as literals: a table giving all 256 bytes an 8-bit
 * code (so each byte's code is the byte), sent once, then the bytes.
 */
function rar20(bytes, withTables) {
    const w = new BitWriter();
    if (withTables) {
        w.put(0, 2);                                   // not audio, fresh table
        for (let i = 0; i < 19; i++) w.put(i === 8 || i === 18 ? 1 : 0, 4);   // bit-length code: 8 -> '0', 18 -> '1'
        for (let i = 0; i < 256; i++) w.put(0, 1);   // 256 literal lengths of 8
        w.put(1, 1); w.put(118 - 11, 7);               // 118 zero lengths: distances and repeats unused
    }
    for (const b of bytes) w.put(b, 8);
    return w.done();
}

function header(type, flags, body) {
    const head = Buffer.alloc(7);
    head.writeUInt16LE(0, 0); head[2] = type; head.writeUInt16LE(flags, 3); head.writeUInt16LE(7 + body.length, 5);
    return Buffer.concat([head, body]);
}
function fileEntry(name, data, packed, method, solid) {
    const body = Buffer.alloc(25);
    body.writeUInt32LE(packed.length, 0); body.writeUInt32LE(data.length, 4); body[8] = 2;
    body.writeUInt32LE(Rar.crc32(data), 9); body.writeUInt32LE(0, 13); body[17] = 20; body[18] = method;
    body.writeUInt16LE(name.length, 19); body.writeUInt32LE(0x20, 21);
    return Buffer.concat([header(0x74, 0x8000 | (solid ? 0x10 : 0), Buffer.concat([body, Buffer.from(name)])), packed]);
}
function rarArchive(files) {
    const parts = [Buffer.from('MZ self-extractor stub'), Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00]), header(0x73, 0, Buffer.alloc(6))];
    files.forEach(([name, text, method], i) => {
        const data = Buffer.from(text);
        parts.push(fileEntry(name, data, method === 0x30 ? data : rar20(data, i === 0), method, i > 0 && method !== 0x30));
    });
    parts.push(header(0x7B, 0, Buffer.alloc(0)));
    return Buffer.concat(parts);
}

test('a RAR 2.0 archive, after a self-extractor\'s stub, unpacks file by file, solid, with each checksum held', () => {
    const buf = rarArchive([['Data/RTP/CharSet/Chara1.png', 'chara one', 0x35], ['Data/RTP/ChipSet/Basis.png', 'basis, solid after the first', 0x35], ['Data/RM2000.fon', 'font', 0x30]]);
    const files = Rar.readAll(buf);
    assert.deepEqual(files.map(f => [f.path, Buffer.from(f.bytes).toString()]), [['Data/RTP/CharSet/Chara1.png', 'chara one'], ['Data/RTP/ChipSet/Basis.png', 'basis, solid after the first'], ['Data/RM2000.fon', 'font']]);
    const broken = Buffer.from(buf); broken[broken.indexOf('chara') - 1] ^= 0;   // untouched copy still reads
    assert.equal(Rar.readAll(broken).length, 3);
    const corrupt = rarArchive([['Data/RTP/CharSet/A.png', 'abc', 0x35]]);
    corrupt.writeUInt32LE(0, corrupt.indexOf('Data/RTP/CharSet/A.png') - 25 + 9);   // wrong CRC
    assert.throws(() => Rar.readAll(corrupt), /checksum/);
});

test('RAR 3 and RAR 5 are refused with a way forward, not misread', () => {
    const rar3 = rarArchive([['x.png', 'x', 0x35]]);
    rar3[rar3.indexOf('x.png') - 25 + 17] = 29;
    assert.throws(() => Rar.readAll(rar3), /RAR 2\.9.*choose the folder/);
    assert.throws(() => Rar.open(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00, 0, 0])), /RAR 5/);
});

test('an RTP is found inside an archive\'s folders, and its fonts come along', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-arch-'));
    try {
        const env = { HOME: root, XDG_DATA_HOME: path.join(root, 'data') };
        const saved = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME };
        Object.assign(process.env, env);
        try {
            const buf = rarArchive([['Data/RTP/CharSet/Chara1.png', 'c', 0x35], ['Data/RTP/ChipSet/Basis.png', 'b', 0x35], ['Data/RTP/ChipSet/Inner.png', 'i', 0x35], ['Data/RTP/ChipSet/Outline.png', 'o', 0x35], ['Data/RTP/Readme.txt', 'r', 0x35], ['Data/RM2000.fon', 'f', 0x30], ['Presetup/Gins.ini', 'g', 0x30]]);
            const result = RM.unpack(buf);
            assert.equal(result.folder, path.join(root, 'data', 'rtp', '2000-donmiguel'), 'Don Miguel\'s RTP beside the official one');
            assert.deepEqual(fs.readdirSync(result.folder).sort(), ['CharSet', 'ChipSet', 'RM2000.fon', 'rpg-reactor-rtp.json']);
            // a zip with the RTP at its top, and a zip around an installer
            const zip = (entries) => {
                const locals = [], centrals = []; let offset = 0;
                for (const [name, text] of entries) {
                    const data = zlib.deflateRawSync(Buffer.from(text)), n = Buffer.from(name);
                    const local = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(data.length), u32(text.length), u16(n.length), u16(0), n, data]);
                    centrals.push(Buffer.concat([Buffer.from([0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(data.length), u32(text.length), u16(n.length), Buffer.alloc(12), u32(offset), n]));
                    locals.push(local); offset += local.length;
                }
                const central = Buffer.concat(centrals);
                return Buffer.concat([...locals, central, Buffer.from([0x50, 0x4b, 5, 6, 0, 0, 0, 0]), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
            };
            const plain = RM.unpack(zip([['My RTP/CharSet/Actor1.png', 'a'], ['My RTP/ChipSet/World.png', 'w'], ['My RTP/ChipSet/Exterior.png', 'e'], ['My RTP/ChipSet/Interior.png', 'i'], ['My RTP/ChipSet/Dungeon.png', 'd'], ['My RTP/ChipSet/Ship.png', 's']]));
            assert.equal(plain.folder, path.join(root, 'data', 'rtp', '2000'), 'the official names go where a download goes');
            assert.throws(() => RM.unpack(zip([['readme.txt', 'nothing here']])), /no RTP inside/);
        } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }

test('a folder leads to its RTP: itself, one inside (not a game\'s), or an installer in it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-pick-'));
    const saved = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = path.join(root, 'data');
    try {
        const mk = (...parts) => fs.mkdirSync(path.join(root, ...parts), { recursive: true });
        mk('RPG Maker 2000', 'Projects', 'Game', 'CharSet'); mk('RPG Maker 2000', 'Projects', 'Game', 'ChipSet');
        fs.writeFileSync(path.join(root, 'RPG Maker 2000', 'Projects', 'Game', 'RPG_RT.ldb'), '');
        mk('RPG Maker 2000', 'RTP', 'CharSet'); mk('RPG Maker 2000', 'RTP', 'ChipSet');
        assert.equal(await RM.rtpFrom(path.join(root, 'RPG Maker 2000')), path.join(root, 'RPG Maker 2000', 'RTP'), 'the RTP, not a game beside it');
        assert.equal(await RM.rtpFrom(path.join(root, 'RPG Maker 2000', 'RTP')), path.join(root, 'RPG Maker 2000', 'RTP'));
        mk('Downloads');
        fs.writeFileSync(path.join(root, 'Downloads', 'notes.txt'), 'x');
        fs.writeFileSync(path.join(root, 'Downloads', 'RTPE.exe'), rarArchive([['Data/RTP/CharSet/Chara1.png', 'c', 0x35], ['Data/RTP/ChipSet/Basis.png', 'b', 0x35]]));
        const unpacked = await RM.rtpFrom(path.join(root, 'Downloads'));
        assert.ok(fs.existsSync(path.join(unpacked, 'CharSet', 'Chara1.png')), 'an installer in the folder is unpacked');
        mk('Empty');
        await assert.rejects(RM.rtpFrom(path.join(root, 'Empty')), /no CharSet and ChipSet folders/);
    } finally {
        if (saved === undefined) delete process.env.XDG_DATA_HOME; else process.env.XDG_DATA_HOME = saved;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('of the RTPs on hand, a game gets the one answering to most of its names, and either RTP answers to both', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-rank-'));
    const saved = { HOME: process.env.HOME, XDG_DATA_HOME: process.env.XDG_DATA_HOME, RPG2K_RTP_PATH: process.env.RPG2K_RTP_PATH, RPG2K3_RTP_PATH: process.env.RPG2K3_RTP_PATH };
    Object.assign(process.env, { HOME: path.join(root, 'home'), XDG_DATA_HOME: path.join(root, 'data') });
    delete process.env.RPG2K_RTP_PATH; delete process.env.RPG2K3_RTP_PATH;
    try {
        const put = (dir, folder, names) => { fs.mkdirSync(path.join(dir, folder), { recursive: true }); for (const n of names) fs.writeFileSync(path.join(dir, folder, n + '.png'), n); };
        const official = path.join(root, 'data', 'rtp', '2000'), dm = official + '-donmiguel';
        put(official, 'ChipSet', ['World', 'Exterior', 'Interior', 'Dungeon', 'Ship']); put(official, 'CharSet', ['Actor1']);
        put(dm, 'ChipSet', ['Basis', 'Outline', 'Inner', 'Dungeon', 'Ship', 'ChipSet1']); put(dm, 'CharSet', ['Chara1', 'Chubby2']);
        const game = { ChipSet: ['Basis', 'ChipSet1'], CharSet: ['Chubby2'] };
        assert.equal(RM.coverage(official, 'RPG Maker 2000', game), 1, 'Basis is World');
        assert.equal(RM.coverage(dm, 'RPG Maker 2000', game), 3);
        assert.equal(I.findRtp('RPG Maker 2000', { referenced: game }), dm);
        assert.equal(I.findRtp('RPG Maker 2000', { referenced: { ChipSet: ['World'], CharSet: ['Actor1'] } }), official, 'a tie keeps the first found');
        const view = RM.translatedView(dm, 'RPG Maker 2000');
        assert.equal(fs.readFileSync(path.join(view.folder, 'ChipSet', 'World.png'), 'utf8'), 'Basis', 'Don Miguel\'s RTP under the official names');
        assert.equal(fs.readFileSync(path.join(view.folder, 'CharSet', 'Actor1.png'), 'utf8'), 'Chara1');
        view.cleanup();
    } finally {
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        fs.rmSync(root, { recursive: true, force: true });
    }
});

const RTPE = path.join(__dirname, '..', '..', 'scratchpad', 'RTPE.exe');
test('Don Miguel\'s own RTPE.exe unpacks whole: 524 files, fonts included', { skip: !fs.existsSync(RTPE) && 'RTPE.exe is not in the scratchpad' }, () => {
    const files = Rar.readAll(fs.readFileSync(RTPE));
    assert.equal(files.length, 524);
    assert.ok(files.some(f => f.path === 'Data/RM2000.fon'));
    assert.ok(files.some(f => f.path === 'Data/RTP/ChipSet/ChipSet3.png'), 'the Addon\'s chipsets');
});
