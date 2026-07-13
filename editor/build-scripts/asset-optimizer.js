const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const FFMPEG_REPOSITORY = 'eugeneware/ffmpeg-static';
const FFMPEG_RELEASE = 'b6.1.1';
const TRUSTED_FFMPEG = Object.freeze({
    'linux-x64': {
        archiveSha256: 'bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa',
        binarySha256: 'e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99',
        licenseSha256: '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
    },
    'win32-x64': {
        archiveSha256: '8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77',
        binarySha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
        licenseSha256: '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903',
    },
    'darwin-x64': {
        archiveSha256: '929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106',
        binarySha256: 'ebdddc936f61e14049a2d4b549a412b8a40deeff6540e58a9f2a2da9e6b18894',
        licenseSha256: '2e1d16c72fd74e12063776371da757322f8b77589386532f4fd8634bde7de1af',
    },
});
let oxipng;

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function cacheDirectories(appRoot) {
    const userBase = process.platform === 'win32'
        ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Caches')
            : (process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'));
    return [...new Set([
        path.resolve(appRoot, '.asset-tool-cache'),
        path.resolve(appRoot, '..', '.asset-tool-cache'),
        path.join(userBase, 'rpg-reactor', 'asset-tools'),
    ])];
}

function writableCacheDirectory(directories) {
    for (const directory of directories) {
        try {
            fs.mkdirSync(directory, { recursive: true });
            fs.accessSync(directory, fs.constants.W_OK);
            return directory;
        } catch {}
    }
    throw new Error('No writable asset optimizer cache directory is available.');
}

function hostAssetNames(platform = process.platform, arch = process.arch) {
    const releasePlatform = platform === 'win32' ? 'win32' : platform;
    const trusted = TRUSTED_FFMPEG[`${releasePlatform}-${arch}`];
    if (!trusted) throw new Error(`Audio optimization is not available for ${platform}-${arch}.`);
    return {
        binary: `ffmpeg-${releasePlatform}-${arch}.gz`,
        license: `${releasePlatform}-${arch}.LICENSE`,
        executable: platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
        trusted,
    };
}

function verifiedCachedFfmpeg(directories, names) {
    for (const directory of directories) {
        const executable = path.join(directory, FFMPEG_RELEASE, names.executable);
        const manifestPath = path.join(directory, FFMPEG_RELEASE, 'manifest.json');
        const licensePath = path.join(directory, FFMPEG_RELEASE, 'FFMPEG-LICENSE.txt');
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (manifest.schema === 1 && manifest.repository === FFMPEG_REPOSITORY &&
                manifest.release === FFMPEG_RELEASE && manifest.asset === names.binary &&
                manifest.archiveSha256 === names.trusted.archiveSha256 &&
                manifest.binarySha256 === names.trusted.binarySha256 &&
                manifest.licenseAsset === names.license &&
                manifest.licenseSha256 === names.trusted.licenseSha256 &&
                sha256(fs.readFileSync(executable)) === names.trusted.binarySha256 &&
                sha256(fs.readFileSync(licensePath)) === names.trusted.licenseSha256) {
                return executable;
            }
        } catch {}
    }
    return null;
}

async function acquireFfmpeg(options) {
    if (options.ffmpegPath) return options.ffmpegPath;
    const names = hostAssetNames(options.platform, options.arch);
    const directories = options.cacheDirectories || cacheDirectories(options.appRoot);
    const cached = verifiedCachedFfmpeg(directories, names);
    if (cached) return cached;
    if (!options.download) {
        throw new Error('FFmpeg is not cached and no download provider is available.');
    }

    // Release and asset names are pinned, so the download URLs are fully
    // determined and every artifact is verified against TRUSTED_FFMPEG after
    // download. Skipping the GitHub API avoids its unauthenticated rate limit.
    const releasePrefix = `https://github.com/${FFMPEG_REPOSITORY}/releases/download/${FFMPEG_RELEASE}/`;
    const binaryUrl = `${releasePrefix}${names.binary}`;
    const licenseUrl = `${releasePrefix}${names.license}`;

    const root = path.join(writableCacheDirectory(directories), FFMPEG_RELEASE);
    fs.mkdirSync(root, { recursive: true });
    const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const archive = path.join(root, `${names.binary}.${nonce}.part`);
    const licenseTemp = path.join(root, `${names.license}.${nonce}.part`);
    try {
        await options.download(binaryUrl, archive, { reportProgress: true });
        const compressed = fs.readFileSync(archive);
        if (sha256(compressed) !== names.trusted.archiveSha256) {
            throw new Error('FFmpeg archive SHA-256 verification failed.');
        }
        await options.download(licenseUrl, licenseTemp, { reportProgress: false });
        const license = fs.readFileSync(licenseTemp);
        if (sha256(license) !== names.trusted.licenseSha256) {
            throw new Error('FFmpeg license SHA-256 verification failed.');
        }
        const executableTemp = path.join(root, `${names.executable}.${nonce}.part`);
        const binary = zlib.gunzipSync(compressed);
        if (sha256(binary) !== names.trusted.binarySha256) {
            throw new Error('FFmpeg executable SHA-256 verification failed.');
        }
        fs.writeFileSync(executableTemp, binary, { mode: 0o755 });
        fs.chmodSync(executableTemp, 0o755);
        fs.rmSync(path.join(root, names.executable), { force: true });
        fs.renameSync(executableTemp, path.join(root, names.executable));
        fs.rmSync(path.join(root, 'FFMPEG-LICENSE.txt'), { force: true });
        fs.renameSync(licenseTemp, path.join(root, 'FFMPEG-LICENSE.txt'));
        fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
            schema: 1,
            repository: FFMPEG_REPOSITORY,
            release: FFMPEG_RELEASE,
            asset: names.binary,
            archiveSha256: sha256(compressed),
            binarySha256: sha256(binary),
            licenseAsset: names.license,
            licenseSha256: sha256(license),
        }, null, 2));
        return path.join(root, names.executable);
    } finally {
        fs.rmSync(archive, { force: true });
        fs.rmSync(licenseTemp, { force: true });
    }
}

function collectFiles(root, predicate, files = []) {
    if (!fs.existsSync(root)) return files;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const filePath = path.join(root, entry.name);
        if (entry.isDirectory()) collectFiles(filePath, predicate, files);
        else if (entry.isFile() && predicate(filePath)) files.push(filePath);
    }
    return files;
}

function pngDimensions(buffer) {
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new Error('Invalid PNG signature.');
    }
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

function replaceFile(temp, destination) {
    const backup = `${destination}.${process.pid}.${Date.now()}.backup`;
    fs.renameSync(destination, backup);
    try {
        fs.renameSync(temp, destination);
        fs.rmSync(backup, { force: true });
    } catch (error) {
        fs.rmSync(destination, { force: true });
        fs.renameSync(backup, destination);
        throw error;
    }
}

async function loadOxipng() {
    if (oxipng) return oxipng;
    // The package's browser wrapper mistakes NW.js worker_threads for Web
    // Workers and attempts an unsupported threaded-WASM initialization.
    // Initialize the single-thread codec directly instead.
    const modulePath = require.resolve('@jsquash/oxipng/codec/pkg/squoosh_oxipng.js');
    const wasmPath = require.resolve('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm');
    const module = await import(pathToFileURL(modulePath).href);
    await module.default(fs.readFileSync(wasmPath));
    oxipng = async (data, options) => module.optimise(
        new Uint8Array(data), options.level, options.interlace, options.optimiseAlpha).buffer;
    return oxipng;
}

async function optimizePngFile(filePath, level = 3) {
    const original = fs.readFileSync(filePath);
    const originalStat = fs.statSync(filePath);
    const dimensions = pngDimensions(original);
    const optimize = await loadOxipng();
    const input = original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength);
    const optimized = Buffer.from(await optimize(input, {
        level: Math.max(1, Math.min(6, Number(level) || 3)),
        interlace: false,
        optimiseAlpha: false,
    }));
    if (pngDimensions(optimized).join('x') !== dimensions.join('x')) {
        throw new Error('Oxipng changed PNG dimensions.');
    }
    if (optimized.length >= original.length) return { before: original.length, after: original.length, changed: false };
    const temp = `${filePath}.${process.pid}.${Date.now()}.part`;
    try {
        fs.writeFileSync(temp, optimized);
        fs.chmodSync(temp, originalStat.mode);
        fs.utimesSync(temp, originalStat.atime, originalStat.mtime);
        replaceFile(temp, filePath);
    } finally {
        fs.rmSync(temp, { force: true });
    }
    return { before: original.length, after: optimized.length, changed: true };
}

function loopComments(buffer) {
    const comments = buffer.toString('latin1').match(/(?:LOOPSTART|LOOPLENGTH)=\d+/gi) || [];
    return [...new Set(comments.map(comment => comment.toUpperCase()))];
}

function runFfmpeg(executable, args) {
    return new Promise((resolve, reject) => {
        execFile(executable, args, {
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
            timeout: 10 * 60 * 1000,
            killSignal: 'SIGKILL',
        }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error((stderr || error.message).trim()));
                return;
            }
            resolve(stdout);
        });
    });
}

async function optimizeOggFile(filePath, quality, ffmpegPath, execute = runFfmpeg) {
    const original = fs.readFileSync(filePath);
    const originalStat = fs.statSync(filePath);
    const requiredComments = loopComments(original);
    const temp = `${filePath}.${process.pid}.${Date.now()}.part.ogg`;
    try {
        await execute(ffmpegPath, [
            '-y', '-hide_banner', '-loglevel', 'error', '-i', filePath,
            '-map_metadata', '0', '-vn', '-c:a', 'libvorbis', '-q:a', String(quality), temp,
        ]);
        const optimized = fs.readFileSync(temp);
        if (optimized.length < 4 || optimized.subarray(0, 4).toString('ascii') !== 'OggS') {
            throw new Error('FFmpeg produced an invalid OGG file.');
        }
        const optimizedComments = new Set(loopComments(optimized));
        const missing = requiredComments.filter(comment => !optimizedComments.has(comment));
        if (missing.length) throw new Error(`FFmpeg did not preserve loop metadata: ${missing.join(', ')}`);
        if (optimized.length >= original.length) return { before: original.length, after: original.length, changed: false };
        fs.chmodSync(temp, originalStat.mode);
        fs.utimesSync(temp, originalStat.atime, originalStat.mtime);
        replaceFile(temp, filePath);
        return { before: original.length, after: optimized.length, changed: true };
    } finally {
        fs.rmSync(temp, { force: true });
    }
}

async function forEachConcurrent(items, limit, callback) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            await callback(items[index], index);
        }
    });
    await Promise.all(workers);
}

async function optimizeStagedAssets(stagingRoot, settings, options) {
    const summary = { png: 0, ogg: 0, before: 0, after: 0, warnings: [] };
    const onWarning = options.onWarning || (() => {});
    const onStatus = options.onStatus || (() => {});
    const onFile = options.onFile || (() => {});
    const onProgress = options.onProgress || (() => {});
    if (settings.png) {
        const pngFiles = collectFiles(stagingRoot, file => path.extname(file).toLowerCase() === '.png');
        onStatus(`Optimizing ${pngFiles.length} PNG file${pngFiles.length === 1 ? '' : 's'}...`);
        for (let index = 0; index < pngFiles.length; index++) {
            const filePath = pngFiles[index];
            onFile('PNG', filePath, index + 1, pngFiles.length);
            try {
                const result = await optimizePngFile(filePath, settings.pngLevel);
                summary.before += result.before;
                summary.after += result.after;
                if (result.changed) summary.png++;
            } catch (error) {
                const warning = `PNG optimization skipped ${path.relative(stagingRoot, filePath)}: ${error.message}`;
                summary.warnings.push(warning);
                onWarning(warning);
            }
            onProgress('PNG', index + 1, pngFiles.length);
        }
    }
    if (settings.ogg) {
        onStatus('Preparing OGG encoder...');
        const ffmpegPath = await acquireFfmpeg(options);
        const encoders = execFileSync(ffmpegPath, ['-hide_banner', '-encoders'], { encoding: 'utf8', windowsHide: true });
        if (!/\blibvorbis\b/.test(encoders)) throw new Error('The verified FFmpeg build does not include the libvorbis encoder.');
        const audioRoot = path.join(stagingRoot, 'audio');
        const oggFiles = collectFiles(audioRoot, file => path.extname(file).toLowerCase() === '.ogg');
        const quality = Math.max(0, Math.min(10, Number(settings.oggQuality) || 5));
        const concurrency = Math.max(1, Math.min(4,
            typeof os.availableParallelism === 'function' ? os.availableParallelism() - 1 : os.cpus().length - 1));
        const activeWorkers = Math.min(concurrency, oggFiles.length);
        onStatus(oggFiles.length
            ? `Re-encoding ${oggFiles.length} OGG file${oggFiles.length === 1 ? '' : 's'} with ${activeWorkers} parallel worker${activeWorkers === 1 ? '' : 's'}...`
            : 'No OGG files found to optimize.');
        let completed = 0;
        await forEachConcurrent(oggFiles, concurrency, async (filePath, index) => {
            onFile('OGG', filePath, index + 1, oggFiles.length);
            try {
                const result = await optimizeOggFile(filePath, quality, ffmpegPath, options.executeFfmpeg);
                summary.before += result.before;
                summary.after += result.after;
                if (result.changed) summary.ogg++;
            } catch (error) {
                const warning = `OGG optimization skipped ${path.relative(stagingRoot, filePath)}: ${error.message}`;
                summary.warnings.push(warning);
                onWarning(warning);
            }
            completed++;
            onProgress('OGG', completed, oggFiles.length);
        });
    }
    return summary;
}

module.exports = {
    FFMPEG_RELEASE,
    TRUSTED_FFMPEG,
    cacheDirectories,
    hostAssetNames,
    acquireFfmpeg,
    pngDimensions,
    optimizePngFile,
    loopComments,
    optimizeOggFile,
    optimizeStagedAssets,
};
