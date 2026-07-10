const fs = require('fs');
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

function extractArchive(archivePath, destination) {
    fs.mkdirSync(destination, { recursive: true });
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

function writeRuntimeMarker(runtimeRoot, metadata) {
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
    packagedFlatRuntime,
    copyPackagedFlatRuntime,
    archiveName,
    extractArchive,
    writeRuntimeMarker,
    pruneDesktopLocales,
    loadVersionManifest,
    resolveVersion,
};
