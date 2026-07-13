const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const nwRuntime = require('./nw-runtime-utils');

const REPOSITORY = 'nwjs-ffmpeg-prebuilt/nwjs-ffmpeg-prebuilt';

function cacheDirectories(appRoot) {
    const userBase = process.platform === 'win32'
        ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Caches')
            : (process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'));
    return [...new Set([
        path.resolve(appRoot, '.nw-codec-cache'),
        path.resolve(appRoot, '..', '.nw-codec-cache'),
        path.join(userBase, 'rpg-reactor', 'nwjs-codecs'),
    ])];
}

function assetName(version, platform, arch = 'x64') {
    return `${nwRuntime.normalizeVersion(version)}-${platform}-${arch}.zip`;
}

function binaryName(platform) {
    if (platform === 'win') return 'ffmpeg.dll';
    if (platform === 'osx') return 'libffmpeg.dylib';
    return 'libffmpeg.so';
}

function sha256(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}

function archiveIsValid(archivePath, platform) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-codec-check-'));
    try {
        extractBinary(archivePath, platform, temp);
        return true;
    } catch {
        return false;
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

async function acquireArchive(options) {
    const version = nwRuntime.normalizeVersion(options.version);
    const directories = options.cacheDirectories;
    // Release asset URLs are fully determined by NW.js version and platform,
    // so download directly instead of consulting the rate-limited GitHub API.
    // Integrity rests on the archive's structural validation: exactly one
    // entry with the expected binary name and consistent sizes.
    const name = assetName(version, options.platform, options.arch);
    const url = `https://github.com/${REPOSITORY}/releases/download/${version}/${name}`;
    const asset = { name, browser_download_url: url };
    let archivePath = nwRuntime.findCachedFile(directories, name);
    if (archivePath && !archiveIsValid(archivePath, options.platform)) {
        if (options.onWarning) options.onWarning(`Discarding corrupt cached codec: ${archivePath}`);
        fs.rmSync(archivePath, { force: true });
        archivePath = null;
    }
    if (!archivePath) {
        if (!options.download) throw new Error(`FFmpeg codec ${name} is not cached.`);
        const directory = nwRuntime.writableCacheDirectory(directories);
        archivePath = path.join(directory, name);
        try {
            await options.download(url, archivePath);
        } catch (error) {
            fs.rmSync(archivePath, { force: true });
            throw new Error(`FFmpeg codec for NW.js ${version} (${options.platform}-x64) could not be downloaded: ${error.message}`);
        }
        if (!archiveIsValid(archivePath, options.platform)) {
            fs.rmSync(archivePath, { force: true });
            throw new Error(`Downloaded FFmpeg codec ${name} failed archive validation.`);
        }
    }
    return { archivePath, asset, version, expectedHash: sha256(archivePath) };
}

function extractBinary(archivePath, platform, tempRoot) {
    const expected = binaryName(platform);
    const archive = fs.readFileSync(archivePath);
    let eocd = -1;
    for (let i = archive.length - 22; i >= Math.max(0, archive.length - 65557); i--) {
        if (archive.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Invalid FFmpeg codec ZIP: end record not found.');
    const entryCount = archive.readUInt16LE(eocd + 10);
    const centralOffset = archive.readUInt32LE(eocd + 16);
    if (entryCount !== 1 || archive.readUInt32LE(centralOffset) !== 0x02014b50) {
        throw new Error(`Unexpected FFmpeg codec archive contents: expected one ${expected} file.`);
    }
    const flags = archive.readUInt16LE(centralOffset + 8);
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + nameLength).toString('utf8');
    if (name !== expected || (flags & 1) !== 0 || ![0, 8].includes(method)) {
        throw new Error(`Unexpected FFmpeg codec archive contents: ${name || '(empty)'}.`);
    }
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid FFmpeg codec ZIP local header.');
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    if (data.length !== uncompressedSize) throw new Error('FFmpeg codec ZIP size verification failed.');
    fs.mkdirSync(tempRoot, { recursive: true });
    const binary = path.join(tempRoot, expected);
    fs.writeFileSync(binary, data);
    return binary;
}

function macCodecDestination(runtimeRoot) {
    const app = fs.readdirSync(runtimeRoot).find(name => name.endsWith('.app'));
    if (!app) throw new Error('NW.js macOS app bundle not found for codec installation.');
    const versions = path.join(runtimeRoot, app, 'Contents', 'Frameworks', 'nwjs Framework.framework', 'Versions');
    const current = path.join(versions, 'Current');
    if (fs.existsSync(current)) return path.join(fs.realpathSync(current), 'libffmpeg.dylib');
    const versionDir = fs.readdirSync(versions, { withFileTypes: true }).find(entry => entry.isDirectory());
    if (!versionDir) throw new Error('NW.js macOS framework version directory not found.');
    return path.join(versions, versionDir.name, 'libffmpeg.dylib');
}

function installBinary(binaryPath, runtimeRoot, platform, metadata) {
    const destination = platform === 'win'
        ? path.join(runtimeRoot, 'ffmpeg.dll')
        : platform === 'linux'
            ? path.join(runtimeRoot, 'lib', 'libffmpeg.so')
            : macCodecDestination(runtimeRoot);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const binaryHash = sha256(binaryPath);
    fs.copyFileSync(binaryPath, destination);
    const installedHash = sha256(destination);
    if (installedHash !== binaryHash) throw new Error('Installed FFmpeg codec failed verification.');
    fs.writeFileSync(path.join(runtimeRoot, 'rpg-reactor-codec.json'), JSON.stringify({
        schema: 1,
        source: `https://github.com/${REPOSITORY}`,
        nwVersion: metadata.version,
        platform,
        arch: 'x64',
        asset: metadata.asset.name,
        archiveSha256: metadata.expectedHash,
        binarySha256: installedHash,
        notice: 'Third-party codec binary. No patent license is granted by RPG Reactor.',
    }, null, 2));
    return destination;
}

module.exports = {
    REPOSITORY,
    cacheDirectories,
    assetName,
    binaryName,
    sha256,
    acquireArchive,
    extractBinary,
    installBinary,
    macCodecDestination,
};
