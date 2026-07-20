const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/;

function normalizeVersion(value) {
    const version = String(value || '').trim().replace(/^v/i, '');
    if (!VERSION_PATTERN.test(version)) {
        throw new Error(`Invalid NW.js version "${value}". Use a version such as 0.113.0.`);
    }
    return version;
}

function cacheDirectories(appRoot) {
    const userBase = process.platform === 'win32'
        ? (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
        : process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Caches')
            : (process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'));
    return [...new Set([
        path.resolve(appRoot, '.nw-cache'),
        path.resolve(appRoot, '..', '.nw-cache'),
        path.join(userBase, 'rpg-reactor', 'nwjs'),
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
    throw new Error('No writable NW.js cache directory is available.');
}

function findCachedFile(directories, fileName) {
    for (const directory of directories) {
        const candidate = path.join(directory, fileName);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadReleaseHashManifest(manifestPath) {
    if (!manifestPath || !fs.existsSync(manifestPath)) {
        throw new Error(`Release hash manifest not found: ${manifestPath || '(not configured)'}. ` +
            'Release builds require a trusted SHA-256 manifest for every downloaded runtime and codec archive.');
    }
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
        throw new Error(`Release hash manifest is invalid (${manifestPath}): ${error.message}`);
    }
    if (manifest.schema !== 1 || typeof manifest.nwjs !== 'object' || typeof manifest.codecs !== 'object') {
        throw new Error(`Release hash manifest is invalid (${manifestPath}): expected schema 1 with nwjs and codecs maps.`);
    }
    for (const category of ['nwjs', 'codecs']) {
        for (const [name, hash] of Object.entries(manifest[category])) {
            if (!/^[a-f0-9]{64}$/i.test(hash)) {
                throw new Error(`Release hash manifest has an invalid SHA-256 for ${category}.${name}.`);
            }
        }
    }
    return manifest;
}

function trustedArchiveHash(manifest, category, fileName) {
    const hash = manifest && manifest[category] && manifest[category][fileName];
    if (!hash) {
        throw new Error(`Release hash manifest has no trusted SHA-256 for ${category} archive ${fileName}. ` +
            'Pin this exact release artifact before building a public release.');
    }
    return hash.toLowerCase();
}

function findVerifiedCachedFile(directories, fileName, expectedHash, onWarning) {
    for (const directory of directories) {
        const candidate = path.join(directory, fileName);
        if (!fs.existsSync(candidate)) continue;
        if (sha256(candidate) === expectedHash) return candidate;
        if (onWarning) onWarning(`Discarding unverified cached archive: ${candidate}`);
        try { fs.rmSync(candidate, { force: true }); } catch {}
    }
    return null;
}

function verifyArchiveHash(filePath, expectedHash, label) {
    const actual = sha256(filePath);
    if (actual !== expectedHash) {
        throw new Error(`${label || path.basename(filePath)} SHA-256 verification failed: expected ${expectedHash}, got ${actual}.`);
    }
    return actual;
}

function packagedFlatRuntime(execPath, platform) {
    if (!execPath) return null;
    const directory = path.dirname(execPath);
    if (platform === 'win' && fs.existsSync(path.join(directory, 'nw.exe')) &&
        fs.existsSync(path.join(directory, 'RPG Reactor.exe'))) return directory;
    if (platform === 'linux' && fs.existsSync(path.join(directory, 'nw')) &&
        fs.existsSync(path.join(directory, 'RPGReactor'))) return directory;
    return null;
}

function copyDirectory(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) copyDirectory(from, to);
        else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
        else fs.copyFileSync(from, to);
    }
}

function copyPackagedFlatRuntime(sourceRoot, destination) {
    const runtimeDirectories = new Set(['lib', 'locales', 'swiftshader', 'WidevineCdm']);
    const runtimeFiles = new Set([
        'nw', 'nw.exe', 'chrome_crashpad_handler', 'chrome-sandbox',
        'credits.html', 'icudtl.dat', 'minidump_stackwalk',
        'notification_helper.exe', 'resources.pak', 'snapshot_blob.bin',
        'v8_context_snapshot.bin', 'vk_swiftshader_icd.json',
        'nwjc', 'nwjc.exe', 'chromedriver', 'chromedriver.exe',
        '.rpg-reactor-nw-runtime.json',
    ]);
    const runtimeExtensions = new Set(['.bin', '.dat', '.dll', '.pak', '.so']);
    const relativeDestination = path.relative(sourceRoot, destination);
    const outputTop = relativeDestination && !relativeDestination.startsWith('..') && !path.isAbsolute(relativeDestination)
        ? relativeDestination.split(path.sep)[0] : null;
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
        if (entry.name === outputTop) continue;
        const from = path.join(sourceRoot, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            if (runtimeDirectories.has(entry.name)) copyDirectory(from, to);
        } else if (entry.isSymbolicLink()) {
            if (runtimeFiles.has(entry.name) || runtimeExtensions.has(path.extname(entry.name))) {
                fs.symlinkSync(fs.readlinkSync(from), to);
            }
        } else if (runtimeFiles.has(entry.name) || runtimeExtensions.has(path.extname(entry.name))) {
            fs.copyFileSync(from, to);
        }
    }
}

function archiveName(version, platform, edition = 'normal') {
    const normalized = normalizeVersion(version);
    const prefix = edition === 'sdk' ? 'nwjs-sdk' : 'nwjs';
    const ext = platform === 'linux' ? 'tar.gz' : 'zip';
    return `${prefix}-v${normalized}-${platform}-x64.${ext}`;
}

function assertArchiveContained(entries, archivePath) {
    for (const rawEntry of entries) {
        const entry = String(rawEntry || '').replace(/\\/g, '/');
        if (!entry) continue;
        const parts = entry.split('/');
        if (entry.startsWith('/') || /^[A-Za-z]:/.test(entry) || parts.includes('..') || entry.includes('\0')) {
            throw new Error(`Archive ${path.basename(archivePath)} contains an unsafe path: ${rawEntry}`);
        }
    }
}

function listArchiveEntries(archivePath) {
    let output;
    if (archivePath.endsWith('.tar.gz')) {
        output = execFileSync('tar', ['tzf', archivePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } else if (process.platform === 'win32') {
        output = execFileSync('tar.exe', ['-tf', archivePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } else {
        output = execFileSync('unzip', ['-Z1', archivePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    }
    return output.split(/\r?\n/).filter(Boolean);
}

function extractArchive(archivePath, destination) {
    fs.mkdirSync(destination, { recursive: true });
    assertArchiveContained(listArchiveEntries(archivePath), archivePath);
    if (archivePath.endsWith('.tar.gz')) {
        execFileSync('tar', ['xzf', archivePath, '-C', destination], { stdio: 'pipe' });
    } else if (process.platform === 'win32') {
        // Modern Windows ships bsdtar as tar.exe; unlike `unzip`, it is
        // available on stock systems and handles NW.js ZIP archives.
        execFileSync('tar.exe', ['-xf', archivePath, '-C', destination], { stdio: 'pipe' });
    } else {
        execFileSync('unzip', ['-q', '-o', archivePath, '-d', destination], { stdio: 'pipe' });
    }
}

function executablePath(runtimeRoot, platform) {
    if (platform === 'linux') return path.join(runtimeRoot, 'nw');
    if (platform === 'win') return path.join(runtimeRoot, 'nw.exe');
    if (platform === 'osx') {
        const app = fs.existsSync(runtimeRoot)
            ? fs.readdirSync(runtimeRoot).find(entry => entry.endsWith('.app'))
            : null;
        return app ? path.join(runtimeRoot, app, 'Contents', 'MacOS', 'nwjs') : null;
    }
    return null;
}

function detectExecutableArchitecture(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const size = Math.min(fs.statSync(filePath).size, 1024 * 1024);
    const data = Buffer.alloc(size);
    const fd = fs.openSync(filePath, 'r');
    try {
        fs.readSync(fd, data, 0, size, 0);
    } finally {
        fs.closeSync(fd);
    }
    if (data.length < 20) return null;

    // ELF
    if (data[0] === 0x7f && data.subarray(1, 4).toString('ascii') === 'ELF') {
        const littleEndian = data[5] === 1;
        const machine = littleEndian ? data.readUInt16LE(18) : data.readUInt16BE(18);
        if (machine === 62) return 'x64';
        if (machine === 183) return 'arm64';
        if (machine === 3) return 'x86';
        return `elf-${machine}`;
    }

    // PE/COFF
    if (data.subarray(0, 2).toString('ascii') === 'MZ' && data.length >= 64) {
        const peOffset = data.readUInt32LE(0x3c);
        if (peOffset + 6 <= data.length && data.readUInt32LE(peOffset) === 0x00004550) {
            const machine = data.readUInt16LE(peOffset + 4);
            if (machine === 0x8664) return 'x64';
            if (machine === 0xaa64) return 'arm64';
            if (machine === 0x014c) return 'x86';
            return `pe-${machine.toString(16)}`;
        }
    }

    // Thin and fat Mach-O. A universal binary is acceptable only when it
    // actually contains an x86_64 slice.
    const magic = data.readUInt32BE(0);
    const cpuName = cpu => cpu === 0x01000007 ? 'x64' : cpu === 0x0100000c ? 'arm64' : null;
    if (magic === 0xfeedfacf || magic === 0xcffaedfe) {
        const cpu = magic === 0xfeedfacf ? data.readUInt32BE(4) : data.readUInt32LE(4);
        return cpuName(cpu) || `macho-${cpu.toString(16)}`;
    }
    if ([0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(magic)) {
        const littleEndian = magic === 0xbebafeca || magic === 0xbfbafeca;
        const entrySize = magic === 0xcafebabf || magic === 0xbfbafeca ? 32 : 20;
        const read32 = offset => littleEndian ? data.readUInt32LE(offset) : data.readUInt32BE(offset);
        const count = read32(4);
        const architectures = [];
        for (let i = 0; i < count && 8 + i * entrySize + 4 <= data.length; i++) {
            const name = cpuName(read32(8 + i * entrySize));
            if (name) architectures.push(name);
        }
        if (architectures.includes('x64') && architectures.includes('arm64')) return 'universal';
        return architectures[0] || null;
    }
    return null;
}

function detectRuntimeArchitecture(runtimeRoot, platform) {
    return detectExecutableArchitecture(executablePath(runtimeRoot, platform));
}

function assertRuntimeArchitecture(runtimeRoot, platform, expected = 'x64') {
    const actual = detectRuntimeArchitecture(runtimeRoot, platform);
    if (actual !== expected && !(expected === 'x64' && actual === 'universal')) {
        throw new Error(`NW.js runtime architecture mismatch for ${platform}: expected ${expected}, detected ${actual || 'unknown'}.`);
    }
    return actual;
}

function writeRuntimeMarker(runtimeRoot, metadata) {
    assertRuntimeArchitecture(runtimeRoot, metadata.platform, metadata.arch || 'x64');
    fs.writeFileSync(path.join(runtimeRoot, '.rpg-reactor-nw-runtime.json'), JSON.stringify({
        schema: 1,
        version: normalizeVersion(metadata.version),
        edition: metadata.edition || 'normal',
        platform: metadata.platform,
        arch: metadata.arch || 'x64',
    }, null, 2));
}

function localeFamily(fileName, extension) {
    const escaped = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = fileName.match(new RegExp(`^(.+?)(?:_(?:FEMININE|MASCULINE|NEUTER))?${escaped}$`));
    return match ? match[1] : null;
}

function pruneDesktopLocales(runtimeRoot, platform, selectedLocales, onWarning) {
    if (!Array.isArray(selectedLocales)) return { removed: 0, filtered: false };
    const selected = new Set(selectedLocales.filter(locale => /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,4})?$/.test(locale)));
    selected.add('en-US');
    let removed = 0;

    if (platform === 'win' || platform === 'linux') {
        const localeDir = path.join(runtimeRoot, 'locales');
        if (!fs.existsSync(path.join(localeDir, 'en-US.pak'))) {
            if (onWarning) onWarning(`NW.js ${platform} locale layout is missing en-US.pak; keeping all locales.`);
            return { removed: 0, filtered: false };
        }
        for (const entry of fs.readdirSync(localeDir)) {
            const family = localeFamily(entry, '.pak') || localeFamily(entry, '.pak.info');
            if (family && !selected.has(family)) {
                fs.rmSync(path.join(localeDir, entry), { force: true });
                removed++;
            }
        }
        return { removed, filtered: true };
    }

    if (platform !== 'osx') return { removed: 0, filtered: false };
    const appBundle = runtimeRoot.endsWith('.app')
        ? runtimeRoot
        : path.join(runtimeRoot, fs.readdirSync(runtimeRoot).find(entry => entry.endsWith('.app')) || '');
    const outerResources = path.join(appBundle, 'Contents', 'Resources');
    const frameworksDir = path.join(appBundle, 'Contents', 'Frameworks');
    const frameworkResources = [];
    const seenResources = new Set();
    if (fs.existsSync(frameworksDir)) {
        for (const framework of fs.readdirSync(frameworksDir).filter(entry => entry.endsWith('.framework'))) {
            const versionsDir = path.join(frameworksDir, framework, 'Versions');
            if (!fs.existsSync(versionsDir)) continue;
            for (const version of fs.readdirSync(versionsDir)) {
                const resources = path.join(versionsDir, version, 'Resources');
                if (!fs.existsSync(resources)) continue;
                const realResources = fs.realpathSync(resources);
                if (!seenResources.has(realResources)) {
                    seenResources.add(realResources);
                    frameworkResources.push(resources);
                }
            }
        }
    }
    if (!fs.existsSync(path.join(outerResources, 'en.lproj', 'InfoPlist.strings')) ||
        !frameworkResources.some(resources => fs.existsSync(path.join(resources, 'en.lproj', 'locale.pak')))) {
        if (onWarning) onWarning('NW.js macOS locale layout is missing the English fallback; keeping all locales.');
        return { removed: 0, filtered: false };
    }

    const selectedMac = new Set([...selected].map(locale => locale === 'en-US' ? 'en' : locale.replace(/-/g, '_')));
    for (const entry of fs.readdirSync(outerResources)) {
        const family = localeFamily(entry, '.lproj');
        const localizedInfo = path.join(outerResources, entry, 'InfoPlist.strings');
        if (family && fs.existsSync(localizedInfo) && !selectedMac.has(family)) {
            fs.rmSync(path.join(outerResources, entry), { recursive: true, force: true });
            removed++;
        }
    }
    for (const resources of frameworkResources) {
        for (const entry of fs.readdirSync(resources)) {
            const family = localeFamily(entry, '.lproj');
            const localePack = path.join(resources, entry, 'locale.pak');
            if (family && fs.existsSync(localePack) && !selectedMac.has(family)) {
                fs.rmSync(path.join(resources, entry), { recursive: true, force: true });
                removed++;
            }
        }
    }
    return { removed, filtered: true };
}

function readManifest(directories) {
    const manifests = [];
    for (const directory of directories) {
        const manifestPath = path.join(directory, 'versions.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            normalizeVersion(data.stable);
            manifests.push({
                path: manifestPath,
                data,
                mtimeMs: fs.statSync(manifestPath).mtimeMs,
            });
        } catch {}
    }
    return manifests.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null;
}

function writeManifest(directories, manifest) {
    normalizeVersion(manifest && manifest.stable);
    const cacheDir = writableCacheDirectory(directories);
    const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
    const tempPath = path.join(cacheDir, `versions.json.${nonce}.tmp`);
    fs.writeFileSync(tempPath, JSON.stringify(manifest, null, 2));
    fs.renameSync(tempPath, path.join(cacheDir, 'versions.json'));
}

async function loadVersionManifest(options) {
    const cached = readManifest(options.cacheDirectories);
    const cachedAge = cached ? Date.now() - cached.mtimeMs : Infinity;
    if (cached && cachedAge < 24 * 60 * 60 * 1000) return cached.data;
    if (options.fetchManifest) {
        try {
            const manifest = await options.fetchManifest('https://nwjs.io/versions.json');
            writeManifest(options.cacheDirectories, manifest);
            return manifest;
        } catch (error) {
            if (options.onWarning) options.onWarning(`Could not refresh NW.js versions: ${error.message}`);
        }
    }
    if (cached) return cached.data;
    throw new Error('NW.js version manifest is unavailable. Connect to the internet or use Same as editor.');
}

async function resolveVersion(options) {
    const policy = options.policy || 'editor';
    if (policy === 'exact') return normalizeVersion(options.exactVersion);
    if (policy === 'editor') return normalizeVersion(options.editorVersion);
    if (policy !== 'stable') throw new Error(`Unknown NW.js version policy: ${policy}`);

    try {
        const manifest = await loadVersionManifest(options);
        return normalizeVersion(manifest.stable);
    } catch (error) {
        if (options.onWarning) options.onWarning(`${error.message} Using the editor NW.js version.`);
        return normalizeVersion(options.editorVersion);
    }
}

module.exports = {
    normalizeVersion,
    cacheDirectories,
    writableCacheDirectory,
    findCachedFile,
    sha256,
    loadReleaseHashManifest,
    trustedArchiveHash,
    findVerifiedCachedFile,
    verifyArchiveHash,
    packagedFlatRuntime,
    copyPackagedFlatRuntime,
    archiveName,
    assertArchiveContained,
    listArchiveEntries,
    extractArchive,
    detectExecutableArchitecture,
    detectRuntimeArchitecture,
    assertRuntimeArchitecture,
    writeRuntimeMarker,
    pruneDesktopLocales,
    loadVersionManifest,
    resolveVersion,
};
