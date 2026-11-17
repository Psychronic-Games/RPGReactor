// `.opus` is a sixth audio extension: Ogg Opus under the name opusenc and
// FFmpeg give it. These tests hold every list that names the formats the game
// plays to the same set, and check the paths a .opus file takes: the runtime's
// lookup, the editor's listing and encrypted preview, build encryption, and the
// build's audio compression, which must leave it alone.
const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const AssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));
const EncryptedAssets = require(path.join(editorRoot, 'src', 'utils', 'EncryptedAssets.js'));
const ResourceManager = require(path.join(editorRoot, 'src', 'ResourceManager.js'));
const SequencePreview = require(path.join(editorRoot, 'src', 'utils', 'SequencePreview.js'));
const AudioCommandEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'AudioCommandEditor.js'));
const assetEncryption = require(path.join(editorRoot, 'build-scripts', 'asset-encryption.js'));
const assetOptimizer = require(path.join(editorRoot, 'build-scripts', 'asset-optimizer.js'));
const makeVehicle = require(path.join(editorRoot, 'build-scripts', 'make-vehicle.cjs'));

const KEY_HEX = 'd41d8cd98f00b204e9800998ecf8427e';
const PLAYABLE = ['.flac', '.m4a', '.mp3', '.ogg', '.opus', '.wav'];

function runtimeUtils(overrides = {}) {
    const source = runtimeSource('reactor_core.js');
    const start = source.indexOf('function Utils()');
    const end = source.indexOf('function Graphics()');
    assert.ok(start >= 0 && end > start);
    const context = { console, navigator: { userAgent: '' }, URL, ...overrides };
    vm.runInNewContext(source.slice(start, end), context);
    return context.Utils;
}

/** The string items of the first array literal after `anchor` in `source`. */
function arrayAfter(source, anchor) {
    const at = source.indexOf(anchor);
    assert.ok(at >= 0, `found ${anchor}`);
    const open = source.indexOf('[', at);
    const close = source.indexOf(']', open);
    return [...source.slice(open, close).matchAll(/'([^']+)'/g)].map(match => match[1]);
}

const sorted = list => Array.from(list).sort();

function tempDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('every list of the formats the game plays names .opus, and the runtime tries it last', () => {
    const runtime = Array.from(runtimeUtils().AUDIO_EXTENSIONS);
    assert.deepEqual(sorted(runtime), PLAYABLE);
    assert.equal(runtime[runtime.length - 1], '.opus', 'an existing X.ogg or X.m4a still wins over X.opus');
    assert.deepEqual(Array.from(AssetFiles.AUDIO_EXTENSIONS), runtime, 'the editor resolves in the runtime order');
    assert.deepEqual(Array.from(SequencePreview.AUDIO_EXTENSIONS), runtime);
    const resourceFallback = ResourceManager.folderDefinitions().find(folder => folder.path === 'audio/bgm').extensions;
    assert.deepEqual(Array.from(resourceFallback), runtime);
    assert.deepEqual(arrayAfter(read('src/event/commands/PluginCommandEditor.js'), 'RRAssetFiles.AUDIO_EXTENSIONS ||'), runtime);
    assert.deepEqual(sorted(assetEncryption.AUDIO_EXTENSIONS), PLAYABLE, 'a build encrypts every sound the game asks for as <file>_');
    assert.deepEqual(sorted(arrayAfter(read('src/utils/VehicleCheck.js'), 'const AUDIO_EXTS')), PLAYABLE);
    assert.deepEqual(sorted(arrayAfter(read('build-scripts/make-vehicle.cjs'), 'const AUDIO_EXTS')), PLAYABLE);
});

test('the build compresses no .opus file: it ships as it is', async () => {
    assert.equal(assetOptimizer.AUDIO_EXTENSIONS.includes('.opus'), false,
        'listed, .opus would fall through codecArgs to the AAC encoder');
    const root = tempDir('rr-opus-optimize-');
    try {
        const file = path.join(root, 'audio', 'bgm', 'Choir.opus');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const bytes = Buffer.from('OggS opus stand-in');
        fs.writeFileSync(file, bytes);
        const statuses = [];
        const summary = await assetOptimizer.optimizeStagedAssets(root, { audio: true, audioQuality: 5 }, {
            onStatus: status => statuses.push(status),
            executeFfmpeg: () => assert.fail('FFmpeg must not run for a .opus file')
        });
        assert.ok(statuses.includes('No audio files found to compress.'), statuses.join(' | '));
        assert.equal(summary.audio, 0);
        assert.deepEqual(fs.readFileSync(file), bytes);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the runtime finds a track stored as .opus, plain or encrypted', () => {
    const root = tempDir('rr-opus-runtime-');
    try {
        const bgm = path.join(root, 'audio', 'bgm');
        fs.mkdirSync(bgm, { recursive: true });
        fs.writeFileSync(path.join(bgm, 'Choir.opus'), 'x');
        fs.writeFileSync(path.join(bgm, 'Both.ogg'), 'x');
        fs.writeFileSync(path.join(bgm, 'Both.opus'), 'x');
        fs.writeFileSync(path.join(bgm, 'Secret.opus_'), 'x');
        const utils = runtimeUtils({ require, process: { mainModule: { filename: path.join(root, 'index.html') } } });
        assert.equal(utils.resolveAudioExtension('audio/bgm/Choir.ogg', ''), 'audio/bgm/Choir.opus');
        assert.equal(utils.resolveAudioExtension('audio/bgm/Both.ogg', ''), 'audio/bgm/Both.ogg');
        assert.equal(utils.resolveAudioExtension('audio/bgm/Secret.ogg', '_'), 'audio/bgm/Secret.opus');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the editor lists .opus tracks, plain and encrypted, and previews the encrypted one as Ogg', () => {
    const root = tempDir('rr-opus-editor-');
    try {
        fs.mkdirSync(path.join(root, 'data'), { recursive: true });
        fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({
            gameTitle: 'Opus Fixture', hasEncryptedAudio: true, encryptionKey: KEY_HEX
        }));
        const bgm = path.join(root, 'audio', 'bgm');
        fs.mkdirSync(bgm, { recursive: true });
        fs.writeFileSync(path.join(bgm, 'Choir.opus'), 'OggS plain');
        const sealed = Buffer.from('OggS sealed');
        fs.writeFileSync(path.join(bgm, 'Secret.opus_'),
            Buffer.from(EncryptedAssets.encryptAssetBytes(sealed, Buffer.from(KEY_HEX, 'hex'))));

        assert.deepEqual(AssetFiles.listUnique(bgm, AssetFiles.AUDIO_EXTENSIONS).map(record => record.name),
            ['Choir', 'Secret']);
        const url = EncryptedAssets.resolveAssetUrl(path.join(bgm, 'Secret.opus'));
        assert.match(url, /^data:audio\/ogg;base64,/);
        assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), sealed);

        const folder = ResourceManager.folderDefinitions(AssetFiles.AUDIO_EXTENSIONS).find(item => item.path === 'audio/bgm');
        const records = ResourceManager.listRecords(fs, path, AssetFiles, root, folder);
        const secret = records.find(record => record.relativePath === 'Secret.opus');
        assert.ok(secret, records.map(record => record.relativePath).join(', '));
        assert.equal(secret.encrypted, true);
        assert.equal(secret.physicalRelativePath, 'Secret.opus_');
        assert.equal(records.find(record => record.relativePath === 'Choir.opus').encrypted, false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a build encrypts .opus as .opus_, and the bytes come back', () => {
    const root = tempDir('rr-opus-encrypt-');
    try {
        fs.mkdirSync(path.join(root, 'data'), { recursive: true });
        fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Opus Fixture' }));
        const file = path.join(root, 'audio', 'bgm', 'Choir.opus');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const bytes = Buffer.from('OggS opus stand-in');
        fs.writeFileSync(file, bytes);
        const result = assetEncryption.encryptStagedAssets(root, { audio: true, keyText: KEY_HEX });
        assert.equal(result.audio, 1);
        assert.equal(fs.existsSync(file), false, 'the plain file is gone');
        assert.deepEqual(Buffer.from(assetEncryption.decryptBuffer(fs.readFileSync(file + '_'), result.key)), bytes);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('web builds serve .opus as Ogg audio', () => {
    const worker = read('src/web/service-worker.js');
    const start = worker.indexOf('function contentType(pathname)');
    const end = worker.indexOf('\n}\n', start) + 3;
    const context = {};
    vm.runInNewContext(worker.slice(start, end) + '\nglobalThis.contentType = contentType;', context);
    assert.equal(context.contentType('/audio/bgm/Choir.opus'), 'audio/ogg');
    assert.match(read('src/web/pack-reader.js'), /\bopus: 'audio\/ogg'/);
});

test('names typed or picked with an extension lose .opus and .flac like the others', () => {
    const editor = new AudioCommandEditor({}, { currentProject: { path: os.tmpdir() } });
    assert.equal(editor.stripAudioExtension('Boss/Choir.opus'), 'Boss/Choir');
    assert.equal(editor.stripAudioExtension('Field.flac'), 'Field');
});

test('a vehicle stock sound stored as .opus is found', () => {
    const folder = tempDir('rr-opus-vehicle-');
    try {
        fs.writeFileSync(path.join(folder, 'Engine.opus'), 'x');
        const found = makeVehicle.stockSound(folder, 'Engine');
        assert.equal(found && found.ext, '.opus');
    } finally {
        fs.rmSync(folder, { recursive: true, force: true });
    }
});
