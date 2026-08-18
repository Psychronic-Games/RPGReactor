const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const editorRoot = path.resolve(__dirname, '..');
const EncryptedAssets = require(path.join(editorRoot, 'src', 'utils', 'EncryptedAssets.js'));
const AssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));

// A real, valid 1x1 PNG: key recovery depends on the constant PNG header.
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
const KEY_HEX = 'd41d8cd98f00b204e9800998ecf8427e';
const RPGMV_HEADER = Buffer.from([
    0x52, 0x50, 0x47, 0x4d, 0x56, 0x00, 0x00, 0x00,
    0x00, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00
]);

function encrypt(plain, keyHex) {
    const key = Buffer.from(keyHex, 'hex');
    const body = Buffer.from(plain);
    for (let i = 0; i < 16 && i < body.length; i++) body[i] ^= key[i];
    return Buffer.concat([RPGMV_HEADER, body]);
}

function makeProject({ withKey }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-encrypted-'));
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.mkdirSync(path.join(root, 'img', 'tilesets'), { recursive: true });
    fs.mkdirSync(path.join(root, 'img', 'system'), { recursive: true });
    fs.mkdirSync(path.join(root, 'audio', 'se'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({
        gameTitle: 'Encrypted Fixture',
        hasEncryptedImages: true,
        hasEncryptedAudio: true,
        ...(withKey ? { encryptionKey: KEY_HEX } : {})
    }));
    fs.writeFileSync(path.join(root, 'img', 'tilesets', 'Tavern B4.png_'), encrypt(TINY_PNG, KEY_HEX));
    fs.writeFileSync(path.join(root, 'img', 'system', 'Window.rpgmvp'), encrypt(TINY_PNG, KEY_HEX));
    fs.writeFileSync(path.join(root, 'audio', 'se', 'Bell3.ogg_'), encrypt(Buffer.from('OggS-not-really'), KEY_HEX));
    fs.writeFileSync(path.join(root, 'img', 'tilesets', 'Plain.png'), TINY_PNG);
    return root;
}

function dataUrlBytes(url) {
    assert.match(url, /^data:[a-z/4]+;base64,/);
    return Buffer.from(url.split(',')[1], 'base64');
}

test('encrypted assets resolve to decrypted data URLs', () => {
    const root = makeProject({ withKey: true });
    try {
        const plainPath = path.join(root, 'img', 'tilesets', 'Plain.png');
        assert.equal(EncryptedAssets.resolveAssetUrl(plainPath), 'file://' + plainPath.replace(/\\/g, '/'));

        const mzUrl = EncryptedAssets.resolveAssetUrl(path.join(root, 'img', 'tilesets', 'Tavern B4.png'));
        assert.deepEqual(dataUrlBytes(mzUrl), TINY_PNG);
        assert.match(mzUrl, /^data:image\/png;base64,/);

        const mvUrl = EncryptedAssets.resolveAssetUrl(path.join(root, 'img', 'system', 'Window.png'));
        assert.deepEqual(dataUrlBytes(mvUrl), TINY_PNG);

        const audioUrl = EncryptedAssets.resolveAssetUrl(path.join(root, 'audio', 'se', 'Bell3.ogg'));
        assert.match(audioUrl, /^data:audio\/ogg;base64,/);
        assert.deepEqual(dataUrlBytes(audioUrl), Buffer.from('OggS-not-really'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('resolution falls back to a case-insensitive match', () => {
    const root = makeProject({ withKey: true });
    try {
        const wrongCase = path.join(root, 'img', 'tilesets', 'tavern b4.png');
        assert.deepEqual(dataUrlBytes(EncryptedAssets.resolveAssetUrl(wrongCase)), TINY_PNG);
        assert.ok(EncryptedAssets.assetExists(wrongCase));
        assert.ok(EncryptedAssets.assetExists(path.join(root, 'img', 'tilesets', 'Tavern B4.png')));
        assert.ok(!EncryptedAssets.assetExists(path.join(root, 'img', 'tilesets', 'Absent.png')));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a missing encryptionKey is recovered from the constant PNG header', () => {
    const root = makeProject({ withKey: false });
    try {
        const url = EncryptedAssets.resolveAssetUrl(path.join(root, 'img', 'tilesets', 'Tavern B4.png'));
        assert.deepEqual(dataUrlBytes(url), TINY_PNG);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('asset listings present encrypted files under their plain extension', () => {
    const root = makeProject({ withKey: true });
    try {
        const records = AssetFiles.list(path.join(root, 'img', 'tilesets'), ['.png']);
        assert.deepEqual(records.map(record => record.name).sort(), ['Plain', 'Tavern B4']);
        const encrypted = records.find(record => record.name === 'Tavern B4');
        assert.equal(encrypted.extension, '.png');
        assert.equal(encrypted.relativePath, 'Tavern B4.png');
        assert.equal(encrypted.absolutePath, path.join(root, 'img', 'tilesets', 'Tavern B4.png'));

        const found = AssetFiles.find(path.join(root, 'img', 'tilesets'), 'Tavern B4', ['.png']);
        assert.ok(found, 'find resolves an encrypted-only asset');
        assert.equal(found.relativePath, 'Tavern B4.png');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the decrypting resolver is installed before every asset consumer', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const helper = html.indexOf('src/utils/EncryptedAssets.js');
    assert.ok(helper >= 0);
    assert.ok(helper < html.indexOf('src/utils/AssetFiles.js'));
    assert.ok(helper < html.indexOf('src/TilemapManager.js'));
    assert.ok(helper < html.indexOf('src/EventManager.js'));
});

test('the runtime corrects asset filename case against the disk', () => {
    const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const at = coreSource.indexOf('Utils.correctFileCase = function(url) {');
    assert.ok(at >= 0, 'correctFileCase is present in the runtime');
    const end = coreSource.indexOf('\n};', at);
    let body = coreSource.slice(coreSource.indexOf('{', at) + 1, end);
    body = body.split('this.isNwjs()').join('true');
    body = body.split('path.dirname(process.mainModule.filename)').join('__base');
    const correctFileCase = new Function('url', '__base', 'require', body);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-case-'));
    try {
        fs.mkdirSync(path.join(root, 'audio', 'se'), { recursive: true });
        fs.writeFileSync(path.join(root, 'audio', 'se', 'Bell3.ogg_'), 'x');
        assert.equal(correctFileCase('audio/se/bell3.ogg_', root, require), 'audio/se/Bell3.ogg_');
        assert.equal(correctFileCase('audio/se/Bell3.ogg_', root, require), null, 'exact match needs no correction');
        assert.equal(correctFileCase('audio/se/missing.ogg_', root, require), null);
        assert.equal(correctFileCase('../outside/file.ogg', root, require), null, 'traversal is refused');
        assert.equal(correctFileCase('https://example.com/a.ogg', root, require), null, 'absolute URLs are refused');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('bitmap and audio error paths retry with corrected casing once', () => {
    const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    for (const owner of ['Bitmap', 'WebAudio']) {
        const at = coreSource.indexOf(`${owner}.prototype._onError = function() {`);
        assert.ok(at >= 0, `${owner}._onError exists`);
        const body = coreSource.slice(at, coreSource.indexOf('\n};', at));
        assert.match(body, /_triedCaseCorrection/, `${owner} retry is single-shot`);
        assert.match(body, /correctFileCase/, `${owner} consults the corrected casing`);
        assert.match(body, /_startLoading\(\)/, `${owner} restarts the load`);
    }
});

test('casing resolves before the request so plugin error handlers cannot preempt it', () => {
    // CGMZ_Fallback replaces Bitmap._onError without calling the original,
    // so a mere case mismatch became its fallback image forever. Every
    // request point must consult the on-disk casing up front instead.
    const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const decrypting = coreSource.slice(
        coreSource.indexOf('Bitmap.prototype._startDecrypting'),
        coreSource.indexOf('Bitmap.prototype._onXhrLoad'));
    assert.match(decrypting, /resolveFileCase\(this\._url, "_"\)/,
        'the encrypted bitmap request pre-resolves its casing');
    const plainLoad = coreSource.slice(
        coreSource.indexOf('Bitmap.prototype._startLoading'),
        coreSource.indexOf('Bitmap.prototype._startDecrypting'));
    assert.match(plainLoad, /resolveFileCase\(this\._url, ""\)/,
        'the plain bitmap request pre-resolves its casing');
    const audioLoad = coreSource.slice(
        coreSource.indexOf('WebAudio.prototype._startLoading'),
        coreSource.indexOf('WebAudio.prototype._shouldUseDecoder'));
    assert.match(audioLoad, /resolveFileCase\(\s*this\._url, Utils\.hasEncryptedAudio\(\) \? "_" : ""\)/,
        'the audio request pre-resolves its casing');

    // resolveFileCase strips the encrypted suffix from the corrected result.
    const at = coreSource.indexOf('Utils.resolveFileCase = function(url, suffix) {');
    assert.ok(at >= 0, 'resolveFileCase is present in the runtime');
    const body = coreSource.slice(coreSource.indexOf('{', at) + 1, coreSource.indexOf('\n};', at));
    const resolveFileCase = new Function('url', 'suffix', `
        const self = { correctFileCase: (u) =>
            u === 'img/characters/npc_a.png_' ? 'img/characters/NPC_a.png_'
            : u === 'img/faces/npc_b.png' ? 'img/faces/NPC_b.png'
            : null };
        return (function(url, suffix) { const corrected = self.correctFileCase(url + suffix); ${
            body.slice(body.indexOf('if (!corrected)'))} })(url, suffix);
    `);
    assert.equal(resolveFileCase('img/characters/npc_a.png', '_'), 'img/characters/NPC_a.png',
        'the "_" suffix is stripped after correction');
    assert.equal(resolveFileCase('img/faces/npc_b.png', ''), 'img/faces/NPC_b.png');
    assert.equal(resolveFileCase('img/faces/exact.png', ''), 'img/faces/exact.png',
        'an already-correct URL passes through unchanged');
});
