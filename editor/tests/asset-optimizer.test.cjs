const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const optimizer = require(path.join(editorRoot, 'build-scripts', 'asset-optimizer.js'));
const DeploymentAssetPreferences = require(path.join(editorRoot, 'src', 'DeploymentAssetPreferences.js'));

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
    };
}

test('asset optimization preferences are optional, bounded, and persistent', () => {
    const storage = memoryStorage();
    assert.deepEqual(DeploymentAssetPreferences.load(storage), {
        png: false, pngLevel: 3, ogg: false, oggQuality: 5,
    });
    DeploymentAssetPreferences.save({ png: true, ogg: true, oggQuality: 99 }, storage);
    assert.deepEqual(DeploymentAssetPreferences.load(storage), {
        png: true, pngLevel: 3, ogg: true, oggQuality: 10,
    });
});

test('Oxipng preserves PNG dimensions and never increases staged file size', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-oxipng-'));
    const source = path.join(editorRoot, 'images', 'icon.png');
    const target = path.join(root, 'icon.png');
    try {
        fs.copyFileSync(source, target);
        const original = fs.readFileSync(target);
        const dimensions = optimizer.pngDimensions(original);
        const result = await optimizer.optimizePngFile(target, 3);
        assert.deepEqual(optimizer.pngDimensions(fs.readFileSync(target)), dimensions);
        assert.ok(result.after <= result.before);
        assert.deepEqual(fs.readFileSync(source), original, 'source project asset remains untouched');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Oxipng bypasses browser thread detection inside NW.js workers', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'asset-optimizer.js'), 'utf8');
    assert.match(source, /codec\/pkg\/squoosh_oxipng\.js/);
    assert.doesNotMatch(source, /@jsquash\/oxipng\/optimise\.js/);
});

test('OGG optimization passes explicit quality and preserves loop comments', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-ogg-opt-'));
    const target = path.join(root, 'Theme.ogg');
    let args = null;
    try {
        fs.writeFileSync(target, Buffer.from(`OggS${'x'.repeat(500)}LOOPSTART=1200\0LOOPLENGTH=48000`));
        const result = await optimizer.optimizeOggFile(target, 5, '/mock/ffmpeg', async (_executable, nextArgs) => {
            if (nextArgs.includes('libvorbis')) {
                args = nextArgs;
                const output = nextArgs.at(-1);
                fs.writeFileSync(output, Buffer.from(`OggS${'y'.repeat(50)}LOOPSTART=1200\0LOOPLENGTH=48000`));
            }
        });
        assert.equal(result.changed, true);
        assert.deepEqual(optimizer.loopComments(fs.readFileSync(target)), ['LOOPSTART=1200', 'LOOPLENGTH=48000']);
        assert.deepEqual(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 4), ['-c:a', 'libvorbis', '-q:a', '5']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('FFmpeg acquisition rejects release metadata that differs from pinned hashes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-ffmpeg-cache-'));
    const binaryName = 'ffmpeg-linux-x64.gz';
    const licenseName = 'linux-x64.LICENSE';
    try {
        assert.equal(optimizer.TRUSTED_FFMPEG['linux-x64'].archiveSha256,
            'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa');
        await assert.rejects(optimizer.acquireFfmpeg({
            appRoot: root,
            platform: 'linux',
            arch: 'x64',
            cacheDirectories: [root],
            fetchRelease: async () => ({ assets: [
                { name: binaryName, digest: `sha256:${'0'.repeat(64)}`, browser_download_url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/${binaryName}` },
                { name: licenseName, digest: `sha256:${'0'.repeat(64)}`, browser_download_url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/${licenseName}` },
            ] }),
            download: async () => { throw new Error('untrusted assets must not download'); },
        }), /Verified FFmpeg asset/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Deploy Game exposes persisted optional optimization settings', () => {
    const indexSource = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const managerSource = fs.readFileSync(path.join(editorRoot, 'src', 'BuildManager.js'), 'utf8');
    const workerSource = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'build-worker.js'), 'utf8');
    assert.match(indexSource, /DeploymentAssetPreferences\.js[\s\S]*?BuildManager\.js/);
    assert.match(managerSource, /Losslessly optimize PNG files \(Oxipng\)/);
    assert.match(managerSource, /Re-encode OGG audio \(lossy\)/);
    assert.doesNotMatch(managerSource, /downloads and caches a verified FFmpeg encoder/);
    assert.match(managerSource, /assetOptimization,/);
    assert.match(workerSource, /assetOptimizer\.optimizeStagedAssets\(stagingDir, assetOptimization/);
    assert.match(workerSource, /\[\$\{type\} \$\{index\}\/\$\{total\}\][\s\S]*?path\.basename\(filePath\)/,
        'the build log and progress status identify each file being optimized');
});
