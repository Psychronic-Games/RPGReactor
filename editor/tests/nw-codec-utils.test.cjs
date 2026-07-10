const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const codec = require(path.join(editorRoot, 'build-scripts', 'nw-codec-utils.js'));

test('codec assets require an exact NW.js version, platform, and SHA-256 digest', () => {
    const release = {
        tag_name: '0.113.0',
        assets: [{
            name: '0.113.0-win-x64.zip',
            browser_download_url: 'https://example.invalid/codec.zip',
            digest: `sha256:${'a'.repeat(64)}`,
        }],
    };
    assert.equal(codec.assetName('v0.113.0', 'win'), '0.113.0-win-x64.zip');
    assert.equal(codec.selectAsset(release, '0.113.0', 'win').name, '0.113.0-win-x64.zip');
    assert.throws(() => codec.selectAsset(release, '0.112.0', 'win'), /No exact FFmpeg codec release/);
    assert.throws(() => codec.selectAsset(release, '0.113.0', 'linux'), /does not provide linux-x64/);
    const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'nw-codec-utils.js'), 'utf8');
    assert.doesNotMatch(source, /execFileSync\(['"]unzip/,
        'codec extraction must work on stock Windows without external unzip');
});

test('codec archives are verified, cached, extracted, and installed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-'));
    let downloads = 0;
    let fetches = 0;
    try {
        const cache = path.join(root, 'cache');
        const source = path.join(root, 'source');
        const prepared = path.join(root, 'prepared.zip');
        const runtime = path.join(root, 'runtime');
        fs.mkdirSync(source);
        fs.mkdirSync(runtime);
        fs.writeFileSync(path.join(source, 'libffmpeg.so'), 'codec binary');
        execFileSync('zip', ['-q', prepared, 'libffmpeg.so'], { cwd: source });
        const release = {
            tag_name: '0.113.0',
            assets: [{
                name: '0.113.0-linux-x64.zip',
                browser_download_url: 'https://example.invalid/codec.zip',
                digest: `sha256:${codec.sha256(prepared)}`,
            }],
        };

        const options = {
            version: '0.113.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            fetchRelease: async () => { fetches++; return release; },
            download: async (_url, destination) => { downloads++; fs.copyFileSync(prepared, destination); },
        };
        const acquired = await codec.acquireArchive(options);
        const extracted = codec.extractBinary(acquired.archivePath, 'linux', path.join(root, 'extract'));
        const destination = codec.installBinary(extracted, runtime, 'linux', acquired);
        assert.equal(fs.readFileSync(destination, 'utf8'), 'codec binary');
        assert.equal(JSON.parse(fs.readFileSync(path.join(runtime, 'rpg-reactor-codec.json'), 'utf8')).nwVersion, '0.113.0');

        await codec.acquireArchive({
            ...options,
            fetchRelease: async () => { throw new Error('cached release should be used'); },
            download: async () => { throw new Error('cached archive should be used'); },
        });
        assert.equal(fetches, 1);
        assert.equal(downloads, 1);
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

test('stale codec release metadata refreshes when the target asset is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-refresh-'));
    let fetches = 0;
    try {
        const cache = path.join(root, 'cache');
        const source = path.join(root, 'source');
        const prepared = path.join(root, 'prepared.zip');
        fs.mkdirSync(cache);
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(source, 'libffmpeg.so'), 'refreshed codec');
        execFileSync('zip', ['-q', prepared, 'libffmpeg.so'], { cwd: source });
        const releasePath = path.join(cache, 'release-0.113.0.json');
        fs.writeFileSync(releasePath, JSON.stringify({ tag_name: '0.113.0', assets: [] }));
        const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
        fs.utimesSync(releasePath, old, old);
        const refreshed = {
            tag_name: '0.113.0',
            assets: [{
                name: '0.113.0-linux-x64.zip',
                browser_download_url: 'https://example.invalid/codec.zip',
                digest: `sha256:${codec.sha256(prepared)}`,
            }],
        };

        const acquired = await codec.acquireArchive({
            version: '0.113.0', platform: 'linux', arch: 'x64', cacheDirectories: [cache],
            fetchRelease: async () => { fetches++; return refreshed; },
            download: async (_url, destination) => fs.copyFileSync(prepared, destination),
        });
        assert.equal(fetches, 1);
        assert.equal(acquired.asset.name, '0.113.0-linux-x64.zip');
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
