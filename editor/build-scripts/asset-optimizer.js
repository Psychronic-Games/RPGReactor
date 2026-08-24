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

const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav', '.flac', '.m4a'];

// The shared 0-10 quality scale is Vorbis's (higher is better). LAME's VBR
// -q:a runs the other way, 0 (best) to 9.
function lameQuality(quality) {
    return Math.max(0, Math.min(9, Math.round((10 - quality) * 0.9)));
}

// FFmpeg's native AAC encoder is bitrate-driven; map the tiers onto the
// bitrates those tiers mean for stereo AAC.
function aacBitrate(quality) {
    return `${Math.max(64, Math.min(256, Math.round(64 + quality * 19.2)))}k`;
}

// A WAV's loop lives in the sampler ("smpl") chunk. Mirrors the runtime's
// reader exactly: first loop, LOOPSTART = start, LOOPLENGTH = end - start.
function wavSamplerLoop(buffer) {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' ||
        buffer.toString('ascii', 8, 12) !== 'WAVE') return null;
    let index = 12;
    while (index + 8 <= buffer.length) {
        const chunkId = buffer.toString('ascii', index, index + 4);
        const chunkSize = buffer.readUInt32LE(index + 4);
        const dataIndex = index + 8;
        if (chunkId === 'smpl' && dataIndex + 52 <= buffer.length) {
            const numLoops = buffer.readUInt32LE(dataIndex + 28);
            if (numLoops > 0) {
                const start = buffer.readUInt32LE(dataIndex + 44);
                const end = buffer.readUInt32LE(dataIndex + 48);
                if (end > start) return { start, length: end - start };
            }
        }
        index = dataIndex + chunkSize + (chunkSize % 2);
    }
    return null;
}

// ID3v2 TXXX loop frames hold "LOOPSTART\0<value>" (latin1/utf8 text keeps
// the ASCII digits contiguous); the runtime reads the same convention.
function mp3LoopTags(buffer) {
    const text = buffer.toString('latin1');
    const tags = [];
    for (const name of ['LOOPSTART', 'LOOPLENGTH']) {
        const match = text.match(new RegExp(`${name}\\x00(\\d+)`));
        if (match) tags.push(`${name}=${match[1]}`);
    }
    return tags;
}

// FFmpeg's demuxers surface embedded cover art (an Ogg METADATA_BLOCK_PICTURE
// comment, an ID3 APIC frame, a FLAC PICTURE block) as an attached picture
// stream and delete the tag it came from — so a plain audio re-encode
// silently drops the art. Extract the picture first so each encode path can
// put it back.
async function extractCoverImage(filePath, ffmpegPath, execute) {
    const temp = `${filePath}.${process.pid}.${Date.now()}.cover.bin`;
    try {
        await execute(ffmpegPath, [
            '-y', '-hide_banner', '-loglevel', 'error', '-i', filePath,
            '-map', '0:v:0', '-frames:v', '1', '-c', 'copy', '-f', 'image2', temp,
        ]);
        const bytes = fs.readFileSync(temp);
        if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
            return { bytes, mime: 'image/jpeg' };
        }
        if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) {
            return { bytes, mime: 'image/png' };
        }
        return null;
    } catch (error) {
        return null; // no attached picture — the normal case
    } finally {
        fs.rmSync(temp, { force: true });
    }
}

function imageDimensions(image) {
    const { bytes, mime } = image;
    try {
        if (mime === 'image/png' && bytes.length >= 24) {
            return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
        }
        // JPEG: scan markers for the SOF segment carrying the frame size.
        let offset = 2;
        while (offset + 9 < bytes.length && bytes[offset] === 0xff) {
            const marker = bytes[offset + 1];
            const size = bytes.readUInt16BE(offset + 2);
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
            }
            offset += 2 + size;
        }
    } catch (error) { /* fall through */ }
    return { width: 0, height: 0 };
}

// The base64 FLAC PICTURE block a METADATA_BLOCK_PICTURE comment holds:
// type 3 (front cover), mime, empty description, dimensions, image bytes.
function flacPictureComment(image) {
    const mime = Buffer.from(image.mime, 'ascii');
    const { width, height } = imageDimensions(image);
    const block = Buffer.alloc(4 + 4 + mime.length + 4 + 16 + 4 + image.bytes.length);
    let offset = 0;
    block.writeUInt32BE(3, offset); offset += 4;
    block.writeUInt32BE(mime.length, offset); offset += 4;
    mime.copy(block, offset); offset += mime.length;
    block.writeUInt32BE(0, offset); offset += 4;
    block.writeUInt32BE(width, offset); offset += 4;
    block.writeUInt32BE(height, offset); offset += 4;
    block.writeUInt32BE(24, offset); offset += 4;
    block.writeUInt32BE(0, offset); offset += 4;
    block.writeUInt32BE(image.bytes.length, offset); offset += 4;
    image.bytes.copy(block, offset);
    return block.toString('base64');
}

// Extra FFmpeg inputs that write the picture back into an Ogg output's
// comment header. The comment goes through an ffmetadata file, never argv:
// Windows caps a whole command line at 32K characters and art is bigger.
function writeCoverMetadataFile(image, metaPath) {
    const escaped = flacPictureComment(image).replace(/[\\=;#]/g, ch => `\\${ch}`);
    fs.writeFileSync(metaPath, `;FFMETADATA1\nMETADATA_BLOCK_PICTURE=${escaped}\n`);
    return ['-f', 'ffmetadata', '-i', metaPath, '-map_metadata:g', '1:g'];
}

function verifyCoverComment(buffer, image) {
    if (!image) return true;
    return buffer.toString('latin1').includes('METADATA_BLOCK_PICTURE');
}

function requiredLoopTags(buffer, ext) {
    if (ext === '.wav') {
        const loop = wavSamplerLoop(buffer);
        return loop ? [`LOOPSTART=${loop.start}`, `LOOPLENGTH=${loop.length}`] : [];
    }
    if (ext === '.mp3') return mp3LoopTags(buffer);
    if (ext === '.m4a') return []; // no loop-tag convention for M4A
    return loopComments(buffer); // OGG and FLAC share vorbis comments
}

function verifyLoopTags(buffer, ext, required) {
    if (!required.length) return [];
    const present = new Set(ext === '.mp3' ? mp3LoopTags(buffer) : loopComments(buffer));
    return required.filter(tag => !present.has(tag));
}

// An Ogg file's clock: the last page's granule position over the Vorbis
// sample rate. A remux once shipped pages with a stray 2^32 added to the
// granule, and every player then believed a four-minute song was 24 hours
// long — seeking anywhere landed "past the end" and looped or stopped.
function oggDurationSeconds(buffer) {
    let rate = 0;
    const id = buffer.indexOf('\x01vorbis', 0, 'latin1');
    if (id >= 0 && id + 16 <= buffer.length) rate = buffer.readUInt32LE(id + 12);
    if (!rate) return null;
    for (let i = buffer.length - 27; i >= 0; i--) {
        if (buffer[i] === 0x4f && buffer[i + 1] === 0x67 &&
            buffer[i + 2] === 0x67 && buffer[i + 3] === 0x53) {
            const lo = buffer.readUInt32LE(i + 6);
            const hi = buffer.readUInt32LE(i + 10);
            return (hi * 4294967296 + lo) / rate;
        }
    }
    return null;
}

function verifyOggDuration(original, optimized) {
    const before = oggDurationSeconds(original);
    const after = oggDurationSeconds(optimized);
    if (before == null || after == null) return;
    if (Math.abs(after - before) > Math.max(1, before * 0.02)) {
        throw new Error(`FFmpeg produced a corrupt duration: ${Math.round(before)}s in, ${Math.round(after)}s out.`);
    }
}

function verifyAudioHeader(buffer, ext) {
    if (buffer.length < 12) return false;
    if (ext === '.ogg') return buffer.subarray(0, 4).toString('ascii') === 'OggS';
    if (ext === '.mp3') {
        return buffer.subarray(0, 3).toString('ascii') === 'ID3' ||
            (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    }
    if (ext === '.m4a') return buffer.toString('ascii', 4, 8) === 'ftyp';
    return false;
}

// Re-encode an audio file in place (OGG, MP3, M4A keep their container).
// Embedded cover art rides along: back into the comment header for Ogg,
// as a copied attached-picture stream for MP3 and M4A. Art must never
// break a deploy, so a failed with-art encode retries without it.
async function reencodeAudioFile(filePath, quality, ffmpegPath, execute = runFfmpeg) {
    const ext = path.extname(filePath).toLowerCase();
    const original = fs.readFileSync(filePath);
    const originalStat = fs.statSync(filePath);
    const required = requiredLoopTags(original, ext);
    const codecArgs = ext === '.ogg' ? ['-c:a', 'libvorbis', '-q:a', String(quality)]
        : ext === '.mp3' ? ['-c:a', 'libmp3lame', '-q:a', String(lameQuality(quality))]
        : ['-c:a', 'aac', '-b:a', aacBitrate(quality)];
    const temp = `${filePath}.${process.pid}.${Date.now()}.part${ext}`;
    const metaPath = `${temp}.meta.txt`;
    const cover = await extractCoverImage(filePath, ffmpegPath, execute);
    const attempts = [];
    if (cover && ext === '.ogg') {
        attempts.push(['-i', filePath, ...writeCoverMetadataFile(cover, metaPath),
            '-map_metadata', '0', '-vn', ...codecArgs, temp]);
    } else if (cover) {
        attempts.push(['-i', filePath, '-map_metadata', '0', '-map', '0:a:0',
            '-map', '0:v:0', '-c:v', 'copy', '-disposition:v:0', 'attached_pic', ...codecArgs, temp]);
    }
    attempts.push(['-i', filePath, '-map_metadata', '0', '-vn', ...codecArgs, temp]);
    try {
        let optimized = null;
        for (let i = 0; i < attempts.length; i++) {
            try {
                await execute(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...attempts[i]]);
                const out = fs.readFileSync(temp);
                if (!verifyAudioHeader(out, ext)) {
                    throw new Error(`FFmpeg produced an invalid ${ext.slice(1).toUpperCase()} file.`);
                }
                if (i < attempts.length - 1 && ext === '.ogg' && !verifyCoverComment(out, cover)) {
                    throw new Error('FFmpeg dropped the cover comment.');
                }
                optimized = out;
                break;
            } catch (error) {
                if (i === attempts.length - 1) throw error;
            }
        }
        const missing = verifyLoopTags(optimized, ext, required);
        if (missing.length) throw new Error(`FFmpeg did not preserve loop metadata: ${missing.join(', ')}`);
        if (ext === '.ogg') verifyOggDuration(original, optimized);
        if (optimized.length >= original.length) return { before: original.length, after: original.length, changed: false };
        fs.chmodSync(temp, originalStat.mode);
        fs.utimesSync(temp, originalStat.atime, originalStat.mtime);
        replaceFile(temp, filePath);
        return { before: original.length, after: optimized.length, changed: true };
    } finally {
        fs.rmSync(temp, { force: true });
        fs.rmSync(metaPath, { force: true });
    }
}

// WAV and FLAC compress by becoming OGG Vorbis — the format the runtime
// prefers when several carry one name, resolved from the same extensionless
// data. A WAV's smpl loop is written out as the LOOPSTART/LOOPLENGTH
// comments; FLAC's vorbis comments carry over through -map_metadata.
async function convertAudioToOgg(filePath, quality, ffmpegPath, execute = runFfmpeg) {
    const ext = path.extname(filePath).toLowerCase();
    const oggPath = filePath.slice(0, -ext.length) + '.ogg';
    if (fs.existsSync(oggPath)) {
        // A same-named OGG already shadows this file at runtime; converting
        // would overwrite it.
        return { before: 0, after: 0, changed: false, skipped: 'an OGG with this name already exists' };
    }
    const original = fs.readFileSync(filePath);
    const required = requiredLoopTags(original, ext);
    const loopArgs = ext === '.wav'
        ? required.flatMap(tag => ['-metadata', tag])
        : [];
    const temp = `${oggPath}.${process.pid}.${Date.now()}.part.ogg`;
    const metaPath = `${temp}.meta.txt`;
    const cover = ext === '.flac' ? await extractCoverImage(filePath, ffmpegPath, execute) : null;
    const attempts = [];
    if (cover) {
        attempts.push(['-i', filePath, ...writeCoverMetadataFile(cover, metaPath),
            '-map_metadata', '0', ...loopArgs, '-vn', '-c:a', 'libvorbis', '-q:a', String(quality), temp]);
    }
    attempts.push(['-i', filePath,
        '-map_metadata', '0', ...loopArgs, '-vn', '-c:a', 'libvorbis', '-q:a', String(quality), temp]);
    try {
        let optimized = null;
        for (let i = 0; i < attempts.length; i++) {
            try {
                await execute(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', ...attempts[i]]);
                const out = fs.readFileSync(temp);
                if (!verifyAudioHeader(out, '.ogg')) {
                    throw new Error('FFmpeg produced an invalid OGG file.');
                }
                if (i < attempts.length - 1 && !verifyCoverComment(out, cover)) {
                    throw new Error('FFmpeg dropped the cover comment.');
                }
                optimized = out;
                break;
            } catch (error) {
                if (i === attempts.length - 1) throw error;
            }
        }
        const missing = verifyLoopTags(optimized, '.ogg', required);
        if (missing.length) throw new Error(`FFmpeg did not preserve loop metadata: ${missing.join(', ')}`);
        if (optimized.length >= original.length) return { before: original.length, after: original.length, changed: false };
        fs.renameSync(temp, oggPath);
        fs.rmSync(filePath, { force: true });
        return { before: original.length, after: optimized.length, changed: true, converted: true };
    } finally {
        fs.rmSync(temp, { force: true });
        fs.rmSync(metaPath, { force: true });
    }
}

// One entry point for every supported audio format: OGG, MP3, and M4A
// re-encode in place; WAV and FLAC convert to OGG.
function optimizeAudioFile(filePath, quality, ffmpegPath, execute = runFfmpeg) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.wav' || ext === '.flac') return convertAudioToOgg(filePath, quality, ffmpegPath, execute);
    return reencodeAudioFile(filePath, quality, ffmpegPath, execute);
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

function optimizeOggFile(filePath, quality, ffmpegPath, execute = runFfmpeg) {
    return reencodeAudioFile(filePath, quality, ffmpegPath, execute);
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
    const summary = { png: 0, audio: 0, converted: 0, before: 0, after: 0, warnings: [] };
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
    if (settings.audio ?? settings.ogg) {
        const audioRoot = path.join(stagingRoot, 'audio');
        const audioFiles = collectFiles(audioRoot,
            file => AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase()));
        const presentExtensions = new Set(audioFiles.map(file => path.extname(file).toLowerCase()));
        const quality = Math.max(0, Math.min(10, Number(settings.audioQuality ?? settings.oggQuality) || 5));
        if (audioFiles.length) {
            onStatus('Preparing audio encoder...');
            const ffmpegPath = await acquireFfmpeg(options);
            const encoders = execFileSync(ffmpegPath, ['-hide_banner', '-encoders'], { encoding: 'utf8', windowsHide: true });
            if (!/\blibvorbis\b/.test(encoders)) throw new Error('The verified FFmpeg build does not include the libvorbis encoder.');
            if (presentExtensions.has('.mp3') && !/\blibmp3lame\b/.test(encoders)) {
                throw new Error('The verified FFmpeg build does not include the libmp3lame encoder.');
            }
            if (presentExtensions.has('.m4a') && !/\baac\b/.test(encoders)) {
                throw new Error('The verified FFmpeg build does not include the aac encoder.');
            }
            const concurrency = Math.max(1, Math.min(4,
                typeof os.availableParallelism === 'function' ? os.availableParallelism() - 1 : os.cpus().length - 1));
            const activeWorkers = Math.min(concurrency, audioFiles.length);
            onStatus(`Compressing ${audioFiles.length} audio file${audioFiles.length === 1 ? '' : 's'} with ${activeWorkers} parallel worker${activeWorkers === 1 ? '' : 's'}...`);
            let completed = 0;
            await forEachConcurrent(audioFiles, concurrency, async (filePath, index) => {
                const label = path.extname(filePath).slice(1).toUpperCase();
                onFile(label, filePath, index + 1, audioFiles.length);
                try {
                    const result = await optimizeAudioFile(filePath, quality, ffmpegPath, options.executeFfmpeg);
                    summary.before += result.before;
                    summary.after += result.after;
                    if (result.changed) summary.audio++;
                    if (result.converted) summary.converted++;
                    if (result.skipped) {
                        const warning = `Audio compression skipped ${path.relative(stagingRoot, filePath)}: ${result.skipped}.`;
                        summary.warnings.push(warning);
                        onWarning(warning);
                    }
                } catch (error) {
                    const warning = `Audio compression skipped ${path.relative(stagingRoot, filePath)}: ${error.message}`;
                    summary.warnings.push(warning);
                    onWarning(warning);
                }
                completed++;
                onProgress('Audio', completed, audioFiles.length);
            });
        } else {
            onStatus('No audio files found to compress.');
        }
    }
    return summary;
}

module.exports = {
    AUDIO_EXTENSIONS,
    FFMPEG_RELEASE,
    TRUSTED_FFMPEG,
    cacheDirectories,
    hostAssetNames,
    acquireFfmpeg,
    pngDimensions,
    optimizePngFile,
    loopComments,
    lameQuality,
    aacBitrate,
    wavSamplerLoop,
    mp3LoopTags,
    optimizeOggFile,
    flacPictureComment,
    oggDurationSeconds,
    verifyOggDuration,
    optimizeAudioFile,
    optimizeStagedAssets,
};
