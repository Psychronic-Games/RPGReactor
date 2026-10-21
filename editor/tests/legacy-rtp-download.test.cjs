'use strict';
// RPG Maker 2000/2003 RTPs without installing them: LZMA and NSIS read in
// JavaScript, the official 2003 zip unwrapped, which RTP a game names, and an
// official RTP answering to Don Miguel's names for the length of an import.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const legacy = path.join(__dirname, '..', 'src', 'legacy');
const Lzma = require(path.join(legacy, 'Lzma.js'));
const Nsis = require(path.join(legacy, 'NsisArchive.js'));
const RM = require(path.join(legacy, 'RtpManager.js'));
const NAMES = require(path.join(legacy, 'RtpNames.js'));

// Python's lzma module, FORMAT_ALONE with the 8-byte size removed, as NSIS stores a block.
const SAMPLE = Buffer.concat([Buffer.from('RPG Reactor RTP '.repeat(40)), Buffer.from(Array.from({ length: 256 }, (_, i) => i)), Buffer.from('The quick brown fox jumps over the lazy dog. '.repeat(12))]);
const SAMPLE_LZMA = Buffer.from('XQAAAQAAKRQE7hmp6/CPdEd45EhGOSsBsRyxurkgUCeXBWikyyszS4timHNaoExs/xXs5EkBh8YqJUMaw2hOlyY/HHKAQmXJH+/3RYhPh/6b4qWbSCsUXzkqDGxfK4po8cwq0goozn3fX/pDwc3HgRC1+IOe4z0Rw7L9eQPK0eNGN6REBONphAfFxfUxq2U8nL+RurR/MAhd6UQmrXulEEKwA4Xej+HzSB4FWXXGtdfOgH/qbkgrR8sS+hZn/g14nlg3MewJJIx4JLF/huptaMfANJyxiJUw3YVnM+SBoOGc4PtX69v0Xu1YCHSEbqS6nQUF2+ybGfcp9EK/JBXQXSyal7oy5qRZwWgZM7QMwBxDWy+CYbtuBCbBjhxHauqqHKSD8IcnwidRjfzgQz+FwOU//vQgAA==', 'base64');

test('LZMA decodes another encoder\'s stream, to its end marker or a known size', () => {
    const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');
    assert.equal(sha(Lzma.decode(SAMPLE_LZMA)), sha(SAMPLE));
    assert.equal(Buffer.from(Lzma.decode(SAMPLE_LZMA, 100)).toString(), SAMPLE.subarray(0, 100).toString());
    assert.throws(() => Lzma.decode(Buffer.from([0xff, 0, 0, 1, 0, 0])), /bad properties/);
});

/**
 * A minimal NSIS 2 installer: a stub, the first header, a stored script
 * header (SetOutPath $INSTDIR\Backdrop, File, SetOutPath $PLUGINSDIR, File)
 * and a data block with one stored and one LZMA file.
 */
function installer() {
    const strings = [];
    const str = (bytes) => { const at = strings.reduce((n, s) => n + s.length, 0); strings.push(Buffer.concat([Buffer.from(bytes), Buffer.from([0])])); return at; };
    const VAR = (index) => [253, (index & 0x7f) | 0x80, (index >> 7) | 0x80];
    const sOut = str([...VAR(31), ...Buffer.from('\\Backdrop')]);
    const sBridge = str(Buffer.from('Bridge.png'));
    const sDesert = str(Buffer.from('Desert.png'));
    const sPlug = str(VAR(26));
    const sDll = str(Buffer.from('System.dll'));
    const stored = Buffer.from('a stored file');
    const data = Buffer.concat([
        u32(stored.length), stored,
        u32(0x80000000 | SAMPLE_LZMA.length), SAMPLE_LZMA,
        u32(3), Buffer.from('dll')
    ]);
    const entry = (which, ...parms) => Buffer.concat([u32(which), ...Array.from({ length: 6 }, (_, i) => u32(parms[i] || 0))]);
    const entries = Buffer.concat([
        entry(11, sOut, 1), entry(20, 0, sBridge, 0), entry(20, 0, sDesert, 4 + stored.length),
        entry(11, sPlug, 1), entry(20, 0, sDll, 8 + stored.length + SAMPLE_LZMA.length)
    ]);
    const blocksAt = 4, entriesAt = 4 + 8 * 8;
    const stringsAt = entriesAt + entries.length;
    const head = Buffer.alloc(entriesAt);
    head.writeUInt32LE(entriesAt, blocksAt + 2 * 8); head.writeUInt32LE(5, blocksAt + 2 * 8 + 4);
    head.writeUInt32LE(stringsAt, blocksAt + 3 * 8);
    const header = Buffer.concat([head, entries, ...strings]);
    const first = Buffer.concat([u32(0), u32(0xDEADBEEF), Buffer.from('NullsoftInst'), u32(header.length), u32(0)]);
    return Buffer.concat([Buffer.alloc(512, 0x4d), first, u32(header.length), header, data]);
}
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

test('an NSIS installer gives its files by install path, decoded, and keeps its own plugins out', () => {
    const archive = Nsis.open(installer());
    assert.deepEqual(archive.files.map(f => f.path), ['Backdrop/Bridge.png', 'Backdrop/Desert.png']);
    assert.equal(Buffer.from(archive.files[0].read()).toString(), 'a stored file');
    assert.ok(Buffer.from(archive.files[1].read()).equals(SAMPLE));
    assert.throws(() => Nsis.open(Buffer.alloc(2048)), /not an NSIS installer/);
});

test('the installer inside RPG Maker\'s 2003 zip is read, and an installer that is no RTP is refused', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-unpack-'));
    try {
        const exe = installer();
        const deflated = zlib.deflateRawSync(exe);
        const name = Buffer.from('rpg2003_rtp_installer.exe');
        const local = Buffer.concat([u32(0x04034b50), Buffer.from([20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(deflated.length), u32(exe.length), Buffer.from([name.length, 0, 0, 0]), name, deflated]);
        const central = Buffer.concat([u32(0x02014b50), Buffer.from([20, 0, 20, 0, 0, 0, 8, 0, 0, 0, 0, 0]), u32(0), u32(deflated.length), u32(exe.length), Buffer.from([name.length, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), u32(0), name]);
        const end = Buffer.concat([u32(0x06054b50), Buffer.from([0, 0, 0, 0, 1, 0, 1, 0]), u32(central.length), u32(local.length), Buffer.from([0, 0])]);
        const zip = Buffer.concat([local, central, end]);
        assert.ok(RM.installerFromZip(zip).equals(exe));
        assert.deepEqual(RM.archiveFiles(zip).map(f => f.path), ['Backdrop/Bridge.png', 'Backdrop/Desert.png'], 'the installer inside the zip is read');
        const folder = path.join(root, 'rtp', '2003');
        assert.throws(() => RM.unpack(zip, folder), /no RTP inside/, 'an installer without CharSet and ChipSet is not an RTP');
        assert.ok(!fs.existsSync(folder) && !fs.existsSync(folder + '.part'), 'nothing written');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a downloaded RTP is kept where the user\'s RTPs go, EasyRPG\'s folder on Linux', () => {
    assert.equal(RM.downloadFolder('RPG Maker 2000', { HOME: '/home/u' }, 'linux'), path.join('/home/u', '.local', 'share', 'rtp', '2000'));
    assert.equal(RM.downloadFolder('RPG Maker 2003', { HOME: '/home/u', XDG_DATA_HOME: '/data' }, 'linux'), path.join('/data', 'rtp', '2003'));
    assert.equal(RM.downloadFolder('RPG Maker 2003', { APPDATA: 'C:/Users/u/AppData/Roaming' }, 'win32'), path.join('C:/Users/u/AppData/Roaming', 'RPG Reactor', 'RTP', '2003'));
    assert.match(RM.SOURCES[2000].url, /^https:\/\/assets\.rpgmakerweb\.com\/rpg2000_rtp_installer\.exe$/);
});

test('the names a game uses tell which RTP it was made with', () => {
    const db = { system: { system_name: 'System', title_name: 'Title1', cursor_se: { name: 'Cursor1' }, title_music: { name: '(OFF)' } }, chipsets: [null, { chipset_name: 'Basis' }], actors: [null, { character_name: 'Chara1', face_name: 'Face1' }], enemies: [], animations: [], terrains: [] };
    const refs = RM.referencedNames(db, null, (folder, name) => folder === 'Title');
    assert.deepEqual(refs, { ChipSet: ['Basis'], CharSet: ['Chara1'], FaceSet: ['Face1'], System: ['System'], Sound: ['Cursor1'] }, 'shipped files and (OFF) do not count');
    const dm = RM.classify('RPG Maker 2000', refs);
    assert.equal(dm.variant, 'donMiguelAddon');
    assert.deepEqual(dm.addon, ['FaceSet/Face1']);
    assert.equal(RM.classify('RPG Maker 2000', { ChipSet: ['Basis'], CharSet: ['Chara1'] }).variant, 'donMiguel');
    assert.equal(RM.classify('RPG Maker 2000', { ChipSet: ['World'], CharSet: ['Actor1'] }).variant, 'official');
    assert.equal(RM.classify('RPG Maker 2003', { ChipSet: ['基本'] }).variant, 'unknown');
    for (const [folder, map] of Object.entries(NAMES[2000].donMiguel.renamed)) {
        for (const target of Object.values(map)) assert.ok(NAMES[2000].official[folder].includes(target), `${folder}/${target} is an official file`);
    }
});

test('an official RTP answers to Don Miguel\'s names in a temporary view, removed afterwards', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-view-'));
    try {
        const rtp = path.join(root, 'rtp');
        for (const name of NAMES[2000].official.ChipSet) { fs.mkdirSync(path.join(rtp, 'ChipSet'), { recursive: true }); fs.writeFileSync(path.join(rtp, 'ChipSet', name + '.png'), name); }
        fs.mkdirSync(path.join(rtp, 'CharSet')); fs.writeFileSync(path.join(rtp, 'CharSet', 'Actor1.png'), 'Actor1');
        assert.ok(RM.isOfficial(rtp, 'RPG Maker 2000'));
        const view = RM.translatedView(rtp, 'RPG Maker 2000');
        assert.notEqual(view.folder, rtp);
        assert.equal(fs.readFileSync(path.join(view.folder, 'ChipSet', 'Basis.png'), 'utf8'), 'World');
        assert.equal(fs.readFileSync(path.join(view.folder, 'CharSet', 'Chara1.png'), 'utf8'), 'Actor1');
        assert.ok(!fs.existsSync(path.join(rtp, 'ChipSet', 'Basis.png')), 'the RTP itself is left as it was');
        view.cleanup();
        assert.ok(!fs.existsSync(view.folder));
        const other = path.join(root, 'other');
        fs.mkdirSync(path.join(other, 'ChipSet'), { recursive: true });
        assert.equal(RM.translatedView(other, 'RPG Maker 2000').folder, other, 'a non-official RTP is used as it is');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
