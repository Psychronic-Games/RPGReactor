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

test('desktop workers require trusted codec hashes even for interactive builds', () => {
    for (const file of ['build-worker.js', 'dist-editor-worker.js']) {
        const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', file), 'utf8');
        assert.match(source, /releaseBuild: true,[\s\S]*?hashManifest: getReleaseHashManifest\(true\)/,
            `${file} fails closed for unpinned native libraries`);
    }
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
        const extracted = codec.extractBinary(acquired.archivePath, 'linux', path.join(root, 'extract'), acquired.expectedHash);
        const destination = codec.installBinary(extracted, runtime, 'linux', acquired);
        assert.equal(fs.readFileSync(destination, 'utf8'), 'codec binary');
        const installedMetadata = JSON.parse(fs.readFileSync(path.join(runtime, 'rpg-reactor-codec.json'), 'utf8'));
        assert.equal(installedMetadata.nwVersion, '0.113.0');
        assert.equal(installedMetadata.notice, codec.NOTICE_NAME);
        assert.equal(installedMetadata.license, codec.LICENSE_NAME);
        assert.equal(fs.existsSync(path.join(runtime, codec.LICENSE_NAME)), true);
        const notice = fs.readFileSync(path.join(runtime, codec.NOTICE_NAME), 'utf8');
        assert.match(notice, /H\.264\/AAC support/);
        assert.match(notice, /Archive SHA-256/);
        assert.match(notice, /does not grant patent\s+rights/);

        await codec.acquireArchive({
            ...options,
            download: async () => { throw new Error('cached archive should be used'); },
        });
        assert.equal(downloads, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('trusted codec bytes are rechecked atomically when extracted', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-race-'));
    try {
        const source = path.join(root, 'source');
        const archive = path.join(root, 'codec.zip');
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'libffmpeg.so'), 'trusted codec');
        execFileSync('zip', ['-q', archive, 'libffmpeg.so'], { cwd: source });
        const expectedHash = codec.sha256(archive);
        fs.writeFileSync(archive, 'replaced after verification');
        assert.throws(
            () => codec.extractBinary(archive, 'linux', path.join(root, 'extract'), expectedHash),
            /changed after verification/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('pinned codec provenance is immutable and included in notices', () => {
    const record = codec.provenance('0.107.0');
    assert.equal(record.buildCommit, '44c5d44e78c457149c8bee98aeca9a7bb1d5659c');
    assert.equal(record.ffmpegCommit, 'e18f48eba6b367ac68b9c477ae6cbe224e36b031');
    const notice = codec.codecNotice({
        version: '0.107.0', asset: { name: 'fixture.zip' }, expectedHash: 'a'.repeat(64),
        hashTrusted: true, provenance: record,
    });
    assert.match(notice, /GNU Lesser General Public License v2\.1 or later/);
    assert.match(notice, new RegExp(record.buildCommit));
    assert.match(notice, new RegExp(record.ffmpegCommit));
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
