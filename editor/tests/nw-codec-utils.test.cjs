const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const codec = require(path.join(editorRoot, 'build-scripts', 'nw-codec-utils.js'));

test('codec assets resolve to pinned direct release URLs without the GitHub API', () => {
    assert.equal(codec.assetName('v0.113.0', 'win'), '0.113.0-win-x64.zip');
    const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'nw-codec-utils.js'), 'utf8');
    assert.doesNotMatch(source, /api\.github\.com/,
        'codec acquisition must not depend on the rate-limited GitHub API');
    assert.doesNotMatch(source, /execFileSync\(['"]unzip/,
        'codec extraction must work on stock Windows without external unzip');
});

test('codec archives are validated, cached, extracted, and installed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-'));
    let downloads = 0;
    const requested = [];
    try {
        const cache = path.join(root, 'cache');
        const source = path.join(root, 'source');
        const prepared = path.join(root, 'prepared.zip');
        const runtime = path.join(root, 'runtime');
        fs.mkdirSync(source);
        fs.mkdirSync(runtime);
        fs.writeFileSync(path.join(source, 'libffmpeg.so'), 'codec binary');
        execFileSync('zip', ['-q', prepared, 'libffmpeg.so'], { cwd: source });

        const options = {
            version: '0.113.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            download: async (url, destination) => { downloads++; requested.push(url); fs.copyFileSync(prepared, destination); },
            releaseBuild: false,
        };
        const acquired = await codec.acquireArchive(options);
        assert.deepEqual(requested, [
            'https://github.com/nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt/releases/download/0.113.0/0.113.0-linux-x64.zip',
        ]);
        assert.equal(acquired.expectedHash, codec.sha256(prepared));
        const extracted = codec.extractBinary(acquired.archivePath, 'linux', path.join(root, 'extract'));
        const destination = codec.installBinary(extracted, runtime, 'linux', acquired);
        assert.equal(fs.readFileSync(destination, 'utf8'), 'codec binary');
        const installedMetadata = JSON.parse(fs.readFileSync(path.join(runtime, 'rpg-reactor-codec.json'), 'utf8'));
        assert.equal(installedMetadata.nwVersion, '0.113.0');
        assert.equal(Object.hasOwn(installedMetadata, 'notice'), false);

        await codec.acquireArchive({
            ...options,
            download: async () => { throw new Error('cached archive should be used'); },
        });
        assert.equal(downloads, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('corrupt cached and downloaded codec archives are rejected', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-corrupt-'));
    try {
        const cache = path.join(root, 'cache');
        const source = path.join(root, 'source');
        const prepared = path.join(root, 'prepared.zip');
        fs.mkdirSync(cache, { recursive: true });
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'libffmpeg.so'), 'codec binary');
        execFileSync('zip', ['-q', prepared, 'libffmpeg.so'], { cwd: source });

        // A corrupt cached archive is discarded and re-downloaded.
        const warnings = [];
        fs.writeFileSync(path.join(cache, '0.113.0-linux-x64.zip'), 'truncated garbage');
        const acquired = await codec.acquireArchive({
            version: '0.113.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            download: async (_url, destination) => fs.copyFileSync(prepared, destination),
            onWarning: message => warnings.push(message),
            releaseBuild: false,
        });
        assert.equal(acquired.expectedHash, codec.sha256(prepared));
        assert.ok(warnings.some(message => /Discarding corrupt cached codec/.test(message)));

        // A corrupt download fails the build instead of being installed.
        fs.rmSync(path.join(cache, '0.113.0-linux-x64.zip'), { force: true });
        await assert.rejects(codec.acquireArchive({
            version: '0.113.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            download: async (_url, destination) => fs.writeFileSync(destination, 'not a zip'),
            releaseBuild: false,
        }), /failed archive validation/);
        assert.equal(fs.existsSync(path.join(cache, '0.113.0-linux-x64.zip')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('release codec acquisition requires and verifies a pinned hash for caches and downloads', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-trusted-'));
    try {
        const cache = path.join(root, 'cache');
        const source = path.join(root, 'source');
        const prepared = path.join(root, 'prepared.zip');
        fs.mkdirSync(cache);
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'libffmpeg.so'), 'trusted codec');
        execFileSync('zip', ['-q', prepared, 'libffmpeg.so'], { cwd: source });
        const name = codec.assetName('0.113.0', 'linux');
        const manifest = { schema: 1, nwjs: {}, codecs: { [name]: codec.sha256(prepared) } };

        fs.writeFileSync(path.join(cache, name), 'untrusted cached bytes');
        const warnings = [];
        const acquired = await codec.acquireArchive({
            version: '0.113.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            hashManifest: manifest,
            download: async (_url, destination) => fs.copyFileSync(prepared, destination),
            onWarning: warning => warnings.push(warning),
        });
        assert.equal(acquired.hashTrusted, true);
        assert.equal(acquired.expectedHash, manifest.codecs[name]);
        assert.ok(warnings.some(warning => /unverified cached archive/.test(warning)));

        await assert.rejects(codec.acquireArchive({
            version: '0.114.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            hashManifest: manifest,
            download: async () => {},
        }), /no trusted SHA-256/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('codec extraction rejects archives with unexpected members', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-bad-'));
    try {
        fs.writeFileSync(path.join(root, 'libffmpeg.so'), 'codec');
        fs.writeFileSync(path.join(root, 'extra.txt'), 'unexpected');
        const archive = path.join(root, 'bad.zip');
        execFileSync('zip', ['-q', archive, 'libffmpeg.so', 'extra.txt'], { cwd: root });
        assert.throws(() => codec.extractBinary(archive, 'linux', path.join(root, 'extract')), /Unexpected FFmpeg codec archive contents/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('macOS codec destination resolves inside the active NW.js framework', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-mac-'));
    try {
        const versions = path.join(root, 'nwjs.app', 'Contents', 'Frameworks', 'nwjs Framework.framework', 'Versions');
        fs.mkdirSync(path.join(versions, '150.0.0'), { recursive: true });
        fs.symlinkSync('150.0.0', path.join(versions, 'Current'));
        assert.equal(
            codec.macCodecDestination(root),
            path.join(versions, '150.0.0', 'libffmpeg.dylib'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
