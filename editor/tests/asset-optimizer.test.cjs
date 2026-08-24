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
        png: false, pngLevel: 3, audio: false, audioQuality: 5,
    });
    DeploymentAssetPreferences.save({ png: true, audio: true, audioQuality: 99 }, storage);
    assert.deepEqual(DeploymentAssetPreferences.load(storage), {
        png: true, pngLevel: 3, audio: true, audioQuality: 10,
    });
    // A preference saved before multi-format audio keeps its quality choice.
    storage.setItem(DeploymentAssetPreferences.STORAGE_KEY,
        JSON.stringify({ png: false, ogg: true, oggQuality: 7 }));
    assert.deepEqual(DeploymentAssetPreferences.load(storage), {
        png: false, pngLevel: 3, audio: true, audioQuality: 7,
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

test('OGG optimization carries embedded cover art through the re-encode', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-ogg-art-'));
    const target = path.join(root, 'Theme.ogg');
    let encodeArgs = null;
    try {
        fs.writeFileSync(target, Buffer.from(`OggS${'x'.repeat(500)}`));
        // A tiny valid PNG header: the extraction sniff accepts it as art.
        const png = Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            Buffer.from([0, 0, 0, 13]), Buffer.from('IHDR'),
            Buffer.from([0, 0, 1, 104, 0, 0, 1, 104, 8, 6, 0, 0, 0]),
        ]);
        const result = await optimizer.optimizeAudioFile(target, 5, '/mock/ffmpeg', async (_executable, nextArgs) => {
            const output = nextArgs.at(-1);
            if (nextArgs.includes('image2')) {
                fs.writeFileSync(output, png);
                return;
            }
            encodeArgs = nextArgs;
            fs.writeFileSync(output, Buffer.from(`OggS${'y'.repeat(20)}METADATA_BLOCK_PICTURE=stub`));
        });
        assert.equal(result.changed, true);
        const metaIndex = encodeArgs.indexOf('ffmetadata');
        assert.ok(metaIndex > 0, 'the encode reads an ffmetadata input, never argv');
        const metaFile = encodeArgs[metaIndex + 2];
        assert.ok(!fs.existsSync(metaFile), 'the metadata temp file is cleaned up');
        assert.match(fs.readFileSync(target, 'latin1'), /METADATA_BLOCK_PICTURE/);
        // The comment holds a FLAC PICTURE block with the real dimensions.
        const block = optimizer.flacPictureComment({ bytes: png, mime: 'image/png' });
        const decoded = Buffer.from(block, 'base64');
        assert.equal(decoded.readUInt32BE(0), 3, 'front cover type');
        const widthOffset = 4 + 4 + 'image/png'.length + 4;
        assert.equal(decoded.readUInt32BE(widthOffset), 360, 'width parsed from the image');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('FFmpeg acquisition downloads pinned release URLs directly and rejects tampered archives', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-ffmpeg-cache-'));
    const requested = [];
    try {
        assert.equal(optimizer.TRUSTED_FFMPEG['linux-x64'].archiveSha256,
            'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa');
        await assert.rejects(optimizer.acquireFfmpeg({
            appRoot: root,
            platform: 'linux',
            arch: 'x64',
            cacheDirectories: [root],
            download: async (url, destination) => {
                requested.push(url);
                fs.writeFileSync(destination, 'not the pinned ffmpeg archive');
            },
        }), /SHA-256 verification failed/);
        assert.deepEqual(requested,
            ['https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz'],
            'assets download from the pinned release URL without touching the GitHub API');
        assert.equal(fs.existsSync(path.join(root, 'b6.1.1', 'ffmpeg')), false,
            'no executable is installed when verification fails');
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
    assert.match(managerSource, /Compress audio \(lossy\)/);
    // Lossy audio compression never starts pre-checked from a saved preference.
    assert.match(managerSource, /audio\.checked = false;/);
    assert.doesNotMatch(managerSource, /downloads and caches a verified FFmpeg encoder/);
    assert.match(managerSource, /assetOptimization,/);
    assert.match(workerSource, /assetOptimizer\.optimizeStagedAssets\(stagingDir, assetOptimization/);
    assert.match(workerSource, /\[\$\{type\} \$\{index\}\/\$\{total\}\][\s\S]*?path\.basename\(filePath\)/,
        'the build log and progress status identify each file being optimized');
});

test('every audio format compresses with its own encoder settings', async () => {
    assert.equal(optimizer.lameQuality(10), 0);
    assert.equal(optimizer.lameQuality(5), 5);
    assert.equal(optimizer.lameQuality(3), 6);
    assert.equal(optimizer.aacBitrate(10), '256k');
    assert.equal(optimizer.aacBitrate(5), '160k');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-audio-opt-'));
    try {
        // MP3 re-encodes in place with LAME VBR and keeps its TXXX loop tags.
        const mp3 = path.join(root, 'Battle.mp3');
        fs.writeFileSync(mp3, Buffer.concat([
            Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 8, 0]),
            Buffer.from('TXXX\0\0\0\x0e\0\0\0LOOPSTART\x0012345'),
            Buffer.from('TXXX\0\0\0\x0f\0\0\0LOOPLENGTH\x0067890'),
            Buffer.alloc(600, 0xaa),
        ]));
        let mp3Args = null;
        const mp3Result = await optimizer.optimizeAudioFile(mp3, 5, '/mock/ffmpeg', async (_bin, args) => {
            mp3Args = args;
            fs.writeFileSync(args.at(-1), Buffer.concat([
                Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 8, 0]),
                Buffer.from('TXXX\0\0\0\x0e\0\0\0LOOPSTART\x0012345'),
                Buffer.from('TXXX\0\0\0\x0f\0\0\0LOOPLENGTH\x0067890'),
                Buffer.alloc(50, 0xaa),
            ]));
        });
        assert.equal(mp3Result.changed, true);
        assert.deepEqual(mp3Args.slice(mp3Args.indexOf('-c:a'), mp3Args.indexOf('-c:a') + 4),
            ['-c:a', 'libmp3lame', '-q:a', '5']);

        // WAV converts to OGG carrying its smpl loop as vorbis comments.
        const wav = path.join(root, 'Theme.wav');
        const smpl = Buffer.alloc(8 + 60);
        smpl.write('smpl', 0, 'ascii');
        smpl.writeUInt32LE(60, 4);
        smpl.writeUInt32LE(1, 8 + 28);        // one loop
        smpl.writeUInt32LE(4400, 8 + 44);     // start
        smpl.writeUInt32LE(92400, 8 + 48);    // end
        const wavHeader = Buffer.alloc(12);
        wavHeader.write('RIFF', 0, 'ascii');
        wavHeader.writeUInt32LE(4 + smpl.length + 800, 4);
        wavHeader.write('WAVE', 8, 'ascii');
        fs.writeFileSync(wav, Buffer.concat([wavHeader, smpl, Buffer.alloc(800, 0x11)]));
        assert.deepEqual(optimizer.wavSamplerLoop(fs.readFileSync(wav)), { start: 4400, length: 88000 });
        let wavArgs = null;
        const wavResult = await optimizer.optimizeAudioFile(wav, 7, '/mock/ffmpeg', async (_bin, args) => {
            wavArgs = args;
            fs.writeFileSync(args.at(-1), Buffer.from(`OggS${'z'.repeat(40)}LOOPSTART=4400\0LOOPLENGTH=88000`));
        });
        assert.equal(wavResult.changed, true);
        assert.equal(wavResult.converted, true);
        assert.equal(fs.existsSync(wav), false, 'the WAV is replaced by its OGG');
        assert.equal(fs.existsSync(path.join(root, 'Theme.ogg')), true);
        assert.ok(wavArgs.includes('LOOPSTART=4400') && wavArgs.includes('LOOPLENGTH=88000'),
            'the smpl loop is passed to the encoder as metadata');
        assert.deepEqual(wavArgs.slice(wavArgs.indexOf('-c:a'), wavArgs.indexOf('-c:a') + 4),
            ['-c:a', 'libvorbis', '-q:a', '7']);

        // A FLAC whose name an OGG already owns is left alone.
        const flac = path.join(root, 'Theme.flac');
        fs.writeFileSync(flac, Buffer.alloc(100, 0x22));
        const flacResult = await optimizer.optimizeAudioFile(flac, 5, '/mock/ffmpeg', async () => {
            throw new Error('should not encode');
        });
        assert.equal(flacResult.changed, false);
        assert.ok(flacResult.skipped);
        assert.equal(fs.existsSync(flac), true);

        // M4A re-encodes AAC by bitrate.
        const m4a = path.join(root, 'Jingle.m4a');
        fs.writeFileSync(m4a, Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypM4A '), Buffer.alloc(500, 0x33)]));
        let m4aArgs = null;
        const m4aResult = await optimizer.optimizeAudioFile(m4a, 3, '/mock/ffmpeg', async (_bin, args) => {
            m4aArgs = args;
            fs.writeFileSync(args.at(-1), Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypM4A '), Buffer.alloc(40, 0x33)]));
        });
        assert.equal(m4aResult.changed, true);
        assert.deepEqual(m4aArgs.slice(m4aArgs.indexOf('-c:a'), m4aArgs.indexOf('-c:a') + 4),
            ['-c:a', 'aac', '-b:a', '122k']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('OGG optimization rejects a corrupt duration clock', () => {
    // A remux once shipped pages with a stray 2^32 added to the granule
    // position; players then read a four-minute song as 24 hours and every
    // seek landed "past the end". The verifier compares the Ogg clock of
    // input and output and refuses the result.
    const makeOgg = (granuleLo, granuleHi) => {
        const buffer = Buffer.alloc(120);
        buffer.write('OggS', 0, 'ascii');
        buffer.write('\x01vorbis', 30, 'latin1');
        buffer.writeUInt32LE(48000, 30 + 12);
        buffer.write('OggS', 80, 'ascii');
        buffer.writeUInt32LE(granuleLo, 86);
        buffer.writeUInt32LE(granuleHi, 90);
        return buffer;
    };
    const original = makeOgg(48000 * 240, 0);           // four minutes
    const same = makeOgg(48000 * 239, 0);               // re-encode drift, fine
    const corrupt = makeOgg(48000 * 240, 1);            // +2^32 samples
    assert.equal(Math.round(optimizer.oggDurationSeconds(original)), 240);
    optimizer.verifyOggDuration(original, same);
    assert.throws(() => optimizer.verifyOggDuration(original, corrupt), /corrupt duration/);
});
