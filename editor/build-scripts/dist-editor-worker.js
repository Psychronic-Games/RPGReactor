/**
 * Editor Distribution Worker — runs in a worker_threads Worker.
 * Packages the RPG Reactor editor for distribution.
 * Follows the same pattern as build-worker.js (game builds).
 */
const { workerData, parentPort, threadId } = require('worker_threads');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');
const iconHelpers = require('./icon-helpers');
const nwRuntime = require('./nw-runtime-utils');
const nwCodec = require('./nw-codec-utils');
const appImage = require('./appimage-utils');
const nativeDownload = require('./native-download');

// ── Logging ──────────────────────────────────────────────────────────
function log(msg, color)  { parentPort.postMessage({ type: 'log', message: msg, color: color || '#cccccc' }); }
function logInfo(msg)     { log(msg, '#cccccc'); }
function logGood(msg)     { log(msg, '#00ff00'); }
function logWarn(msg)     { log(msg, '#ffaa00'); }
function logError(msg)    { log(msg, '#ff6b6b'); }
function logDim(msg)      { log(msg, '#999');    }
function logBlue(msg)     { log(msg, '#007acc'); }

function progress(percent, status) {
    parentPort.postMessage({ type: 'progress', percent, status });
}

function reportDownloadProgress(destPath, downloaded, total, state, attempt) {
    parentPort.postMessage({
        type: 'download-progress',
        id: destPath,
        label: path.basename(destPath),
        downloaded,
        total,
        state,
        attempt,
        maxAttempts: DOWNLOAD_MAX_ATTEMPTS,
    });
}

// ── Config from main thread ─────────────────────────────────────────
const {
    appRoot,         // editor install directory
    platforms,       // ['linux', 'win', 'osx']
    packageType,     // 'platform', 'universal', or 'minimal'
    edition,         // 'normal' or 'sdk'
    nwVersion: requestedNwVersion,
    nwVersionPolicy = 'exact',
    editorNwVersion = requestedNwVersion,
    editorExecPath,
    outputDir,       // where to write archives
    stageOnly = false,
    includeTemplate = true,
    includeProprietaryCodecs = false,
    createLinuxAppImage = false,
    appImageToolPath,
    appImageRuntimePath,
} = workerData;
let nwVersion = requestedNwVersion;
let nwVersionResolved = false;

const cacheCandidates = nwRuntime.cacheDirectories(appRoot);
const codecCacheCandidates = nwCodec.cacheDirectories(appRoot);

// ── Editor version from package.json ────────────────────────────────
const editorPkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const appVersion = editorPkg.version || '0.0.0';

// ── Files/dirs to include (whitelist) ───────────────────────────────
const INCLUDE_DIRS = ['src', 'css', 'images', 'libs', 'build-scripts'];
const INCLUDE_FILES = [
    'index.html', 'package.json', 'package-lock.json',
    'CHANGELOG.md', 'README.md', 'LICENSE',
];

// ── File copying helpers ────────────────────────────────────────────
function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(s, d);
        } else if (entry.isSymbolicLink()) {
            fs.symlinkSync(fs.readlinkSync(s), d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

function dependencyPath(packageName) {
    const candidates = [
        path.join(appRoot, 'node_modules', packageName),
        path.join(appRoot, '..', 'node_modules', packageName),
    ];
    return candidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json'))) || null;
}

// ── Download helper ─────────────────────────────────────────────────
const DOWNLOAD_IDLE_TIMEOUT_MS = 180000;
const DOWNLOAD_MAX_ATTEMPTS = 3;

function downloadFile(url, destPath, progressBase, progressSpan, requestOptions = {}) {
    if (nativeDownload.isAvailable()) {
        logDim('  Using native curl download transport.');
        return nativeDownload.download({
            url,
            destPath,
            headers: requestOptions.headers,
            idleTimeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS,
            maxAttempts: DOWNLOAD_MAX_ATTEMPTS,
            onTelemetry: update => reportDownloadProgress(
                destPath, update.downloaded, update.total, update.state, update.attempt),
            onRetry: (error, attempt, maxAttempts) => {
                logWarn(`  Download interrupted (${error.message}). Retrying ${attempt}/${maxAttempts}...`);
                progress(progressBase, `Download retry ${attempt}/${maxAttempts}...`);
            },
        });
    }
    return new Promise((resolve, reject) => {
        const attemptDownload = (attempt) => {
            let settled = false;
            let partPath = null;
            let file = null;
            let downloaded = 0;
            let total = 0;
            let lastReportAt = 0;
            reportDownloadProgress(destPath, 0, 0, attempt === 1 ? 'starting' : 'retrying', attempt);

            const fail = (error) => {
                if (settled) return;
                settled = true;
                if (file) file.destroy();
                if (partPath) {
                    try { fs.rmSync(partPath, { force: true }); } catch {}
                }
                if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
                    reportDownloadProgress(destPath, downloaded, total, 'retrying', attempt + 1);
                    logWarn(`  Download interrupted (${error.message}). Retrying ${attempt + 1}/${DOWNLOAD_MAX_ATTEMPTS}...`);
                    progress(progressBase, `Download retry ${attempt + 1}/${DOWNLOAD_MAX_ATTEMPTS}...`);
                    setTimeout(() => attemptDownload(attempt + 1), attempt * 1000);
                } else {
                    reportDownloadProgress(destPath, downloaded, total, 'failed', attempt);
                    reject(error);
                }
            };

            const doGet = (target, redirects = 0) => {
                if (redirects > 10) {
                    fail(new Error(`Too many redirects downloading ${url}`));
                    return;
                }
                const req = https.get(target, requestOptions, (res) => {
                    if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                        const location = res.headers.location;
                        res.resume();
                        if (!location) {
                            fail(new Error(`Redirect without a location downloading ${target}`));
                            return;
                        }
                        doGet(new URL(location, target).toString(), redirects + 1);
                        return;
                    }
                    if (res.statusCode !== 200) {
                        res.resume();
                        fail(new Error(`HTTP ${res.statusCode} for ${target}`));
                        return;
                    }
                    total = parseInt(res.headers['content-length'], 10) || 0;
                    let lastPct = -1;
                    res.on('data', (chunk) => {
                        downloaded += chunk.length;
                        const now = Date.now();
                        if (now - lastReportAt >= 100 || (total > 0 && downloaded >= total)) {
                            reportDownloadProgress(destPath, downloaded, total, 'downloading', attempt);
                            lastReportAt = now;
                        }
                        if (total > 0) {
                            const pct = Math.floor((downloaded / total) * 100);
                            if (pct !== lastPct && pct % 5 === 0) {
                                logDim(`  ${pct}% (${(downloaded / 1048576).toFixed(1)} MB)`);
                                progress(
                                    Math.round(progressBase + (pct / 100) * progressSpan),
                                    `Downloading... ${pct}%`
                                );
                                lastPct = pct;
                            }
                        }
                    });
                    partPath = `${destPath}.${process.pid}.${threadId}.${Date.now()}.part`;
                    file = fs.createWriteStream(partPath);
                    res.on('error', fail);
                    res.pipe(file);
                    file.on('finish', () => file.close(() => {
                        if (settled) return;
                        try {
                            fs.renameSync(partPath, destPath);
                            settled = true;
                            reportDownloadProgress(destPath, downloaded, total || downloaded, 'complete', attempt);
                            resolve();
                        } catch (error) {
                            fail(error);
                        }
                    }));
                    file.on('error', fail);
                });
                req.on('error', fail);
                req.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
                    req.destroy(new Error(`Download stalled for ${DOWNLOAD_IDLE_TIMEOUT_MS / 1000} seconds: ${target}`));
                });
            };
            doGet(url);
        };
        attemptDownload(1);
    });
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const request = (target) => {
            const headers = { 'User-Agent': 'RPG-Reactor', Accept: 'application/vnd.github+json, application/json' };
            const isGithubApi = new URL(target).hostname === 'api.github.com';
            const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
            if (isGithubApi && githubToken) headers.Authorization = `Bearer ${githubToken}`;
            const req = https.get(target, { headers }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirect = new URL(res.headers.location, target).toString();
                res.resume();
                request(redirect);
                return;
            }
            if (res.statusCode !== 200) {
                const rateLimited = isGithubApi && !githubToken && (res.statusCode === 403 || res.statusCode === 429);
                reject(new Error(`HTTP ${res.statusCode} for ${target}${rateLimited
                    ? ' (unauthenticated GitHub API rate limit — set GITHUB_TOKEN to raise it)' : ''}`));
                res.resume();
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
            });
            }).on('error', reject);
            req.setTimeout(30000, () => req.destroy(new Error(`Timed out requesting ${target}`)));
        };
        request(url);
    });
}

async function ensureNwVersion() {
    if (nwVersionResolved) return nwVersion;
    nwVersion = await nwRuntime.resolveVersion({
        policy: nwVersionPolicy,
        exactVersion: requestedNwVersion,
        editorVersion: editorNwVersion,
        cacheDirectories: cacheCandidates,
        fetchManifest: fetchJson,
        onWarning: logWarn,
    });
    nwVersionResolved = true;
    logInfo(`Resolved NW.js version: ${nwVersion}`);
    return nwVersion;
}

async function installProprietaryCodec(platform, runtimeRoot, pBase, pSpan) {
    await ensureNwVersion();
    logInfo(`  Installing third-party FFmpeg codec for NW.js ${nwVersion} (${platform}-x64)...`);
    const acquired = await nwCodec.acquireArchive({
        version: nwVersion,
        platform,
        arch: 'x64',
        cacheDirectories: codecCacheCandidates,
        download: (url, destination) => downloadFile(url, destination, pBase, pSpan),
        onWarning: logWarn,
    });
    const temp = path.join(os.tmpdir(), `rpgreactor-codec-${process.pid}-${threadId}-${Date.now()}`);
    try {
        const binary = nwCodec.extractBinary(acquired.archivePath, platform, temp);
        const destination = nwCodec.installBinary(binary, runtimeRoot, platform, acquired);
        logGood(`  Proprietary codec installed: ${destination}`);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

// ── NW.js runtime helpers ───────────────────────────────────────────
const BUNDLED_DIRS = {
    linux: [path.join(appRoot, 'nwjs-linux'), path.join(appRoot, '..', 'nwjs-linux')].find(candidate => fs.existsSync(candidate)),
    win:   [path.join(appRoot, 'nwjs-win'), path.join(appRoot, '..', 'nwjs-win')].find(candidate => fs.existsSync(candidate)),
    osx:   [path.join(appRoot, 'nwjs-mac'), path.join(appRoot, '..', 'nwjs-mac')].find(candidate => fs.existsSync(candidate)),
};

const DIR_NAMES = { linux: 'nwjs-linux', win: 'nwjs-win', osx: 'nwjs-mac' };

function nwjsArchiveName(platform) {
    return nwRuntime.archiveName(nwVersion, platform, edition);
}

function nwjsInnerDir(platform) {
    const prefix = edition === 'sdk' ? 'nwjs-sdk' : 'nwjs';
    return `${prefix}-v${nwVersion}-${platform === 'win' ? 'win' : platform}-x64`;
}

async function acquireRuntime(platform, targetDir, pBase, pSpan, flat) {
    const dirName = DIR_NAMES[platform];
    const nestedBundledDir = BUNDLED_DIRS[platform];
    const flatBundledDir = nestedBundledDir ? null : nwRuntime.packagedFlatRuntime(editorExecPath, platform);
    const bundledDir = nestedBundledDir || flatBundledDir;
    const destDir = flat ? targetDir : path.join(targetDir, dirName);
    await ensureNwVersion();

    // Unmarked legacy bundles are the runtime used to launch this editor.
    // Reuse them only when version and edition match the explicit request.
    const bundledIsSdk = bundledDir && (
        fs.existsSync(path.join(bundledDir, 'nwjc')) ||
        fs.existsSync(path.join(bundledDir, 'nwjc.exe')) ||
        fs.existsSync(path.join(bundledDir, 'chromedriver')) ||
        fs.existsSync(path.join(bundledDir, 'chromedriver.exe'))
    );
    let bundledMarker = null;
    if (bundledDir) {
        try {
            bundledMarker = JSON.parse(fs.readFileSync(path.join(bundledDir, '.rpg-reactor-nw-runtime.json'), 'utf8'));
            bundledMarker.version = nwRuntime.normalizeVersion(bundledMarker.version);
        } catch { bundledMarker = null; }
    }
    const hostPlatform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'osx' : 'linux';
    const markerMatches = bundledMarker &&
        bundledMarker.version === nwVersion &&
        bundledMarker.platform === platform && bundledMarker.arch === 'x64' &&
        bundledMarker.edition === edition;
    const unmarkedHostMatches = !bundledMarker && platform === hostPlatform &&
        nwVersion === nwRuntime.normalizeVersion(editorNwVersion) &&
        bundledIsSdk === (edition === 'sdk');
    const bundledMatches = bundledDir && fs.existsSync(bundledDir) &&
        (markerMatches || unmarkedHostMatches);

    // Tier 1: matching bundled local runtime
    if (bundledMatches) {
        logInfo(`  Using bundled runtime: ${dirName}/`);
        if (flatBundledDir) nwRuntime.copyPackagedFlatRuntime(flatBundledDir, destDir);
        else copyDirRecursive(bundledDir, destDir);
        nwRuntime.writeRuntimeMarker(destDir, { version: nwVersion, edition, platform, arch: 'x64' });
        return destDir;
    }
    if (bundledDir && fs.existsSync(bundledDir)) {
        logDim(`  Ignoring bundled ${dirName}/ because its editor version or edition does not match.`);
    }

    // Tier 2: cached archive
    const archiveName = nwjsArchiveName(platform);
    let cachedPath = nwRuntime.findCachedFile(cacheCandidates, archiveName);

    if (!cachedPath) {
        const downloadCacheDir = nwRuntime.writableCacheDirectory(cacheCandidates);
        cachedPath = path.join(downloadCacheDir, archiveName);
        // Tier 3: download
        const url = `https://dl.nwjs.io/v${nwVersion}/${archiveName}`;
        logInfo(`  Downloading NW.js for ${platform}...`);
        logDim(`  ${url}`);
        await downloadFile(url, cachedPath, pBase, pSpan * 0.7);
        logGood('  Download complete.');
    } else {
        logInfo(`  Using cached runtime: ${cachedPath}`);
    }

    // Extract
    logInfo('  Extracting...');
    const extractDir = path.join(os.tmpdir(), `rpgreactor-nw-extract-${process.pid}-${threadId}-${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        nwRuntime.extractArchive(cachedPath, extractDir);

        // The archive has an inner directory — move it with the canonical name
        const innerDir = path.join(extractDir, nwjsInnerDir(platform));
        const source = fs.existsSync(innerDir) ? innerDir
            : path.join(extractDir, fs.readdirSync(extractDir)[0]);
        copyDirRecursive(source, destDir);
        nwRuntime.writeRuntimeMarker(destDir, { version: nwVersion, edition, platform, arch: 'x64' });
        logGood(`  Installed runtime: ${flat ? '(flat)' : dirName + '/'}`);
    } finally {
        fs.rmSync(extractDir, { recursive: true, force: true });
    }
    return destDir;
}

// ── Archive creation ────────────────────────────────────────────────
function createArchive(archiveName, sourceDir, innerDirName, preserveSymlinks) {
    const outPath = path.join(outputDir, archiveName);
    logInfo(`Creating archive: ${archiveName}`);

    if (archiveName.endsWith('.tar.gz')) {
        execSync(`tar czf "${outPath}" -C "${sourceDir}" "${innerDirName}"`, { stdio: 'pipe' });
    } else {
        const flags = preserveSymlinks ? '-qry' : '-qr';
        execSync(`cd "${sourceDir}" && zip ${flags} "${outPath}" "${innerDirName}"`, { stdio: 'pipe' });
    }

    const stats = fs.statSync(outPath);
    const sizeMB = (stats.size / 1048576).toFixed(1);
    logGood(`Created: ${archiveName} (${sizeMB} MB)`);
}

function createNwPackage(sourceDir, destPath) {
    if (fs.existsSync(destPath)) fs.rmSync(destPath, { force: true });
    execSync(`cd "${sourceDir}" && zip -qr "${destPath}" .`, { stdio: 'pipe' });
}

function appendPackageToExecutable(exePath, packagePath) {
    fs.appendFileSync(exePath, fs.readFileSync(packagePath));
}

function prepareMacAppBundleForEditor(appBundle, appSourceDir) {
    const contentsDir = path.join(appBundle, 'Contents');
    const resourcesDir = path.join(contentsDir, 'Resources');
    const appNwPath = path.join(resourcesDir, 'app.nw');
    const plistPath = path.join(contentsDir, 'Info.plist');

    // macOS NW.js expects the app payload in Contents/Resources/app.nw.
    if (fs.existsSync(appNwPath)) fs.rmSync(appNwPath, { recursive: true, force: true });
    copyDirRecursive(appSourceDir, appNwPath);

    if (fs.existsSync(plistPath)) {
        let plist = fs.readFileSync(plistPath, 'utf8');
        plist = plist.replace(/<key>CFBundleName<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleName</key>\n\t<string>RPG Reactor</string>');
        plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>RPG Reactor</string>');
        fs.writeFileSync(plistPath, plist);
    }
}

function copyMacRuntimeResourcesForPlaytest(src, dest, relBase) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const relPath = path.join(relBase, entry.name);
        if (relPath === 'app.nw' || relPath === 'playtest-runtime') {
            continue;
        }

        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyMacRuntimeResourcesForPlaytest(s, d, relPath);
        } else if (entry.isSymbolicLink()) {
            fs.symlinkSync(fs.readlinkSync(s), d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

function installMacPlaytestRuntime(appBundle) {
    const contentsDir = path.join(appBundle, 'Contents');
    const macOsDir = path.join(contentsDir, 'MacOS');
    const resourcesDir = path.join(contentsDir, 'Resources');
    const playtestRoot = path.join(resourcesDir, 'playtest-runtime');
    const playtestApp = path.join(playtestRoot, 'nwjs.app');
    const playtestContents = path.join(playtestApp, 'Contents');
    const playtestMacOs = path.join(playtestContents, 'MacOS');
    const playtestResources = path.join(playtestContents, 'Resources');

    fs.rmSync(playtestRoot, { recursive: true, force: true });
    fs.mkdirSync(playtestMacOs, { recursive: true });

    for (const file of ['Info.plist', 'PkgInfo']) {
        const src = path.join(contentsDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(playtestContents, file));
        }
    }

    const outerExecutable = path.join(macOsDir, 'nwjs');
    const playtestExecutable = path.join(playtestMacOs, 'nwjs');
    fs.copyFileSync(outerExecutable, playtestExecutable);
    fs.chmodSync(playtestExecutable, '755');

    fs.symlinkSync('../../../../Frameworks', path.join(playtestContents, 'Frameworks'), 'dir');
    copyMacRuntimeResourcesForPlaytest(resourcesDir, playtestResources, '');

    const plistPath = path.join(playtestContents, 'Info.plist');
    if (fs.existsSync(plistPath)) {
        let plist = fs.readFileSync(plistPath, 'utf8');
        plist = plist.replace(/<key>CFBundleName<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleName</key>\n\t<string>RPG Reactor Playtest</string>');
        plist = plist.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]+<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>RPG Reactor Playtest</string>');
        fs.writeFileSync(plistPath, plist);
    }
}

function pruneMacRuntimeSidecars(appDir) {
    for (const entry of fs.readdirSync(appDir)) {
        if (entry !== 'nwjs.app' && entry !== 'rpg-reactor-codec.json' && entry !== '.rpg-reactor-nw-runtime.json') {
            fs.rmSync(path.join(appDir, entry), { recursive: true, force: true });
        }
    }
}

function writeWindowsFramelessPackageConfig(stageRoot) {
    const packagePath = path.join(stageRoot, 'package.json');
    if (!fs.existsSync(packagePath)) return null;

    const original = fs.readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    pkg.main = 'index.html?rrFrameless=1';
    if (typeof pkg['chromium-args'] === 'string') {
        pkg['chromium-args'] = pkg['chromium-args']
            .split(/\s+/)
            .filter(arg => arg && !arg.startsWith('--enable-logging'))
            .join(' ');
    }
    pkg.window = pkg.window || {};
    pkg.window.frame = false;
    pkg.window.toolbar = false;
    pkg.window.position = 'center';
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
    return original;
}

// ── Bootstrap launchers for minimal packages ────────────────────────
function writeBootstrapLaunchers(dest) {
    logInfo('Writing bootstrap launchers (download-on-demand)...');
    const prefix = edition === 'sdk' ? 'nwjs-sdk' : 'nwjs';

    // Linux
    const linuxLauncher = `#!/bin/bash
# RPG Reactor Launcher — downloads NW.js runtime on first run
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

NW_VERSION="${nwVersion}"
NW_ARCHIVE="${prefix}-v\${NW_VERSION}-linux-x64.tar.gz"
NW_URL="https://dl.nwjs.io/v\${NW_VERSION}/\${NW_ARCHIVE}"
NW_DIR="nwjs-linux"

if [ ! -f "$NW_DIR/nw" ]; then
    echo "First run — downloading NW.js runtime v\${NW_VERSION}..."
    echo "This only happens once."
    echo ""
    if command -v curl >/dev/null 2>&1; then
        curl -L --progress-bar -o "$NW_ARCHIVE" "$NW_URL"
    elif command -v wget >/dev/null 2>&1; then
        wget --show-progress -q -O "$NW_ARCHIVE" "$NW_URL"
    else
        echo "ERROR: curl or wget required. Install one and try again."
        exit 1
    fi
    echo "Extracting..."
    tar -xzf "$NW_ARCHIVE"
    INNER_DIR="$(tar -tzf "$NW_ARCHIVE" | head -1 | cut -d/ -f1)"
    [ "$INNER_DIR" != "$NW_DIR" ] && [ -d "$INNER_DIR" ] && mv "$INNER_DIR" "$NW_DIR"
    rm -f "$NW_ARCHIVE"
    echo "Runtime installed successfully."
    echo ""
fi

# Desktop integration
if [ ! -f "$HOME/.local/share/applications/rpg-reactor.desktop" ] || [ ! -f "$HOME/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png" ]; then
    mkdir -p "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/1024x1024/apps"
    cp "$SCRIPT_DIR/images/icon.png" "$HOME/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png"
    printf '[Desktop Entry]\\nVersion=1.0\\nType=Application\\nName=RPG Reactor\\nComment=Open-source RPG game engine\\nExec="%s/RPGReactor.sh"\\nIcon=%s/.local/share/icons/hicolor/1024x1024/apps/rpg-reactor.png\\nTerminal=false\\nCategories=Development;Game;\\nStartupWMClass=rpg-reactor\\n' "$SCRIPT_DIR" "$HOME" > "$HOME/.local/share/applications/rpg-reactor.desktop"
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

export WINDOW_ICON="$SCRIPT_DIR/images/icon.png"
export BAMF_DESKTOP_FILE_HINT="$HOME/.local/share/applications/rpg-reactor.desktop"
./nwjs-linux/nw . --icon="$SCRIPT_DIR/images/icon.png" --class=rpg-reactor
`;
    fs.writeFileSync(path.join(dest, 'RPGReactor.sh'), linuxLauncher);
    fs.chmodSync(path.join(dest, 'RPGReactor.sh'), '755');

    // Windows
    const winLauncher = `@echo off\r
REM RPG Reactor Launcher — downloads NW.js runtime on first run\r
cd /d "%~dp0"\r
set NW_VERSION=${nwVersion}\r
set NW_ARCHIVE=${prefix}-v%NW_VERSION%-win-x64.zip\r
set NW_URL=https://dl.nwjs.io/v%NW_VERSION%/%NW_ARCHIVE%\r
set NW_DIR=nwjs-win\r
if not exist "%NW_DIR%\\nw.exe" (\r
    echo First run — downloading NW.js runtime v%NW_VERSION%...\r
    echo This only happens once.\r
    echo.\r
    echo Downloading...\r
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NW_URL%' -OutFile '%NW_ARCHIVE%'"\r
    if not exist "%NW_ARCHIVE%" (\r
        echo ERROR: Download failed.\r
        pause\r
        exit /b 1\r
    )\r
    echo Extracting...\r
    powershell -Command "Expand-Archive -Path '%NW_ARCHIVE%' -DestinationPath '.' -Force"\r
    for /d %%D in (${prefix}-v%NW_VERSION%-win-x64) do (\r
        if not "%%D"=="%NW_DIR%" ren "%%D" "%NW_DIR%"\r
    )\r
    del /q "%NW_ARCHIVE%"\r
    echo Runtime installed successfully.\r
    echo.\r
)\r
"%NW_DIR%\\nw.exe" .\r
`;
    fs.writeFileSync(path.join(dest, 'RPGReactor.bat'), winLauncher);

    // macOS
    const macLauncher = `#!/bin/bash
# RPG Reactor Launcher for macOS — downloads NW.js runtime on first run
SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

NW_VERSION="${nwVersion}"
NW_ARCHIVE="${prefix}-v\${NW_VERSION}-osx-x64.zip"
NW_URL="https://dl.nwjs.io/v\${NW_VERSION}/\${NW_ARCHIVE}"
NW_DIR="nwjs-mac"

if [ ! -d "$NW_DIR/nwjs.app" ]; then
    echo "First run — downloading NW.js runtime v\${NW_VERSION}..."
    echo "This only happens once."
    echo ""
    curl -L --progress-bar -o "$NW_ARCHIVE" "$NW_URL"
    if [ ! -f "$NW_ARCHIVE" ]; then
        echo "ERROR: Download failed."
        exit 1
    fi
    echo "Extracting..."
    unzip -q "$NW_ARCHIVE"
    INNER_DIR="$(unzip -l "$NW_ARCHIVE" | awk '/\\/$/ {print $NF; exit}' | cut -d/ -f1)"
    [ "$INNER_DIR" != "$NW_DIR" ] && [ -d "$INNER_DIR" ] && mv "$INNER_DIR" "$NW_DIR"
    rm -f "$NW_ARCHIVE"
    echo "Runtime installed successfully."
    echo ""
fi

./nwjs-mac/nwjs.app/Contents/MacOS/nwjs .
`;
    fs.writeFileSync(path.join(dest, 'RPGReactor.command'), macLauncher);
    fs.chmodSync(path.join(dest, 'RPGReactor.command'), '755');

    logGood('Bootstrap launchers written.');
}

// ── SHA256 checksums ────────────────────────────────────────────────
function generateChecksums() {
    logInfo('Generating checksums...');
    const files = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.tar.gz') || f.endsWith('.zip') || f.endsWith('.AppImage'))
        .sort();
    if (files.length === 0) return;

    const lines = [];
    for (const file of files) {
        const hash = crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(outputDir, file))).digest('hex');
        lines.push(`${hash}  ${file}`);
    }
    fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
    logGood('SHA256SUMS.txt written.');
}

function copyWebProject(source, destination, relativePath = '') {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const relative = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const normalized = relative.replace(/\\/g, '/');
        if (normalized === '.rpgreactor.lock' || normalized === 'data/nul' ||
            normalized === 'save' || normalized.startsWith('save/') ||
            normalized === 'js/BACKUP' || normalized.startsWith('js/BACKUP/') ||
            normalized === 'Backup' || normalized.startsWith('Backup/')) {
            continue;
        }
        const sourcePath = path.join(source, entry.name);
        const destinationPath = path.join(destination, entry.name);
        if (entry.isDirectory()) copyWebProject(sourcePath, destinationPath, normalized);
        else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(sourcePath), destinationPath);
        else fs.copyFileSync(sourcePath, destinationPath);
    }
}

function patchWebProject(projectRoot) {
    const pluginPath = path.join(projectRoot, 'js', 'plugins', 'PSYCHRONIC_MegaSkillTreesMZ.js');
    if (!fs.existsSync(pluginPath)) return;
    const source = fs.readFileSync(pluginPath, 'utf8');
    const marker = '    function loadSkillTreesData() {\n';
    if (!source.includes(marker)) {
        throw new Error('Could not apply the browser fallback for PSYCHRONIC_MegaSkillTreesMZ.');
    }
    fs.writeFileSync(pluginPath, source.replace(marker, [
        marker.trimEnd(),
        "        if (typeof require !== 'function') {",
        '            skillTreesData = [];',
        '            return;',
        '        }',
    ].join('\n') + '\n'));
}

function walkWebFiles(root) {
    const files = [];
    const visit = (directory, relative = '') => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                files.push({ path: entryRelative, type: 'directory', size: 0 });
                visit(fullPath, entryRelative);
            } else {
                files.push({ path: entryRelative, type: 'file', size: fs.statSync(fullPath).size });
            }
        }
    };
    visit(root);
    return files;
}

function buildWeb(stageRoot, stagingDir) {
    const templateRoot = path.join(stageRoot, 'template', 'Demo');
    if (!fs.existsSync(path.join(templateRoot, 'project.rpgreactor'))) {
        throw new Error('Web build requires template/Demo (Reactor One), but it was not found.');
    }
    const projectMetadata = JSON.parse(fs.readFileSync(path.join(templateRoot, 'project.rpgreactor'), 'utf8'));
    const systemData = JSON.parse(fs.readFileSync(path.join(templateRoot, 'data', 'System.json'), 'utf8'));
    if (projectMetadata.name !== 'Reactor One' || systemData.gameTitle !== 'Reactor One') {
        throw new Error('Web build template must be the Reactor One project.');
    }

    const webRoot = path.join(stagingDir, 'pkg-web');
    fs.mkdirSync(webRoot, { recursive: true });
    copyDirRecursive(path.join(stageRoot, 'css'), path.join(webRoot, 'css'));
    copyDirRecursive(path.join(stageRoot, 'images'), path.join(webRoot, 'images'));
    copyDirRecursive(path.join(stageRoot, 'libs'), path.join(webRoot, 'libs'));
    fs.copyFileSync(path.join(stageRoot, 'runtime', 'libs', 'pixi.js'), path.join(webRoot, 'libs', 'pixi.js'));
    copyWebProject(templateRoot, path.join(webRoot, 'project'));
    patchWebProject(path.join(webRoot, 'project'));

    const sourceHtml = fs.readFileSync(path.join(stageRoot, 'index.html'), 'utf8');
    const scriptPattern = /<script\s+src="(src\/[^"]+)"\s*><\/script>/g;
    const sourceScripts = [...sourceHtml.matchAll(scriptPattern)].map(match => match[1]);
    const characterGeneratorEntry = 'src/forge/CharacterGenerator/CharacterGenerator.js';
    const characterGeneratorIndex = sourceScripts.indexOf(characterGeneratorEntry);
    if (characterGeneratorIndex < 0) throw new Error('Character Generator entry point is missing from index.html.');
    const characterStyleRoot = path.join(stageRoot, 'src', 'forge', 'CharacterGenerator', 'styles');
    const characterStyleScripts = walkWebFiles(characterStyleRoot)
        .filter(entry => entry.type === 'file' && entry.path.endsWith('.js'))
        .map(entry => `src/forge/CharacterGenerator/styles/${entry.path}`)
        .sort();
    sourceScripts.splice(characterGeneratorIndex, 0,
        'src/forge/CharacterGenerator/procgen/outfit_engine.js',
        'src/forge/CharacterGenerator/procgen/hair_engine.js',
        ...characterStyleScripts);
    const bundleScripts = sourceScripts.filter(source => source !== 'src/main.js' && !source.startsWith('src/web/'));
    const bundle = bundleScripts.map(source => {
        const contents = fs.readFileSync(path.join(stageRoot, source), 'utf8');
        return `${contents}\n//# sourceURL=${source}\n`;
    }).join('\n');
    fs.mkdirSync(path.join(webRoot, 'web'), { recursive: true });
    fs.writeFileSync(path.join(webRoot, 'web', 'editor.bundle.js'), bundle);
    fs.copyFileSync(path.join(stageRoot, 'src', 'main.js'), path.join(webRoot, 'web', 'main.js'));
    for (const file of ['WebHost.js', 'WebBootstrap.js']) {
        fs.copyFileSync(path.join(stageRoot, 'src', 'web', file), path.join(webRoot, 'web', file));
    }
    fs.copyFileSync(path.join(stageRoot, 'src', 'web', 'service-worker.js'), path.join(webRoot, 'service-worker.js'));

    let webHtml = sourceHtml.replace(scriptPattern, '');
    webHtml = webHtml.replace('</head>', [
        '    <script src="libs/pixi.js"></script>',
        '    <script src="libs/gif.js"></script>',
        '</head>',
    ].join('\n'));
    webHtml = webHtml.replace('<!-- Main orchestrator -->', [
        '<!-- Browser host and ordered editor bundle -->',
        '<script src="web/WebHost.js"></script>',
        '<script src="web/editor.bundle.js"></script>',
        '<script src="web/WebBootstrap.js"></script>',
    ].join('\n    '));
    fs.writeFileSync(path.join(webRoot, 'index.html'), webHtml);

    const projectRoot = path.join(webRoot, 'project');
    const projectFiles = walkWebFiles(projectRoot);
    const mutable = {};
    for (const entry of projectFiles) {
        if (entry.type !== 'file') continue;
        if (/^(?:data\/.*\.json|project\.rpgreactor|package\.json|js\/(?:reactor_plugins|plugins)\.js)$/.test(entry.path)) {
            mutable[entry.path] = fs.readFileSync(path.join(projectRoot, entry.path), 'utf8');
        }
    }
    fs.writeFileSync(path.join(webRoot, 'web', 'project-manifest.json'), JSON.stringify({
        editorVersion: appVersion,
        projectName: 'Reactor One',
        files: projectFiles,
        mutable,
    }));

    const outputFiles = walkWebFiles(webRoot).filter(entry => entry.type === 'file');
    const archiveName = `RPGReactor-v${appVersion}-web.zip`;
    const outputPath = path.join(outputDir, archiveName);
    logInfo(`Creating web archive: ${archiveName}`);
    createNwPackage(webRoot, outputPath);
    logGood(`Created: ${archiveName} (${(fs.statSync(outputPath).size / 1048576).toFixed(1)} MB, ${outputFiles.length} files)`);
}

// ── Main build ──────────────────────────────────────────────────────
(async () => {
    logBlue('========================================');
    logBlue('RPG Reactor — Editor Distribution');
    logBlue('========================================');
    progress(0, 'Starting...');

    logInfo(`Version: ${appVersion}`);
    logInfo(`Package type: ${packageType}`);
    logInfo(`Edition: ${edition}`);
    logInfo(`NW.js version policy: ${nwVersionPolicy}${nwVersionPolicy === 'exact' ? ` (${requestedNwVersion})` : ''}`);
    logInfo(`Third-party proprietary codec: ${includeProprietaryCodecs ? 'enabled' : 'disabled'}`);
    logInfo(`Linux AppImage: ${createLinuxAppImage ? 'enabled' : 'disabled'}`);
    logInfo(`Platform(s): ${platforms.join(', ')}`);
    logInfo(`Output: ${outputDir}`);
    logInfo('');

    fs.mkdirSync(outputDir, { recursive: true });

    // ── Stage editor files ──────────────────────────────────────────
    const stagingNonce = `${process.pid}-${threadId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stagingDir = path.join(os.tmpdir(), `rpgreactor-editor-dist-${stagingNonce}`);
    const stageRoot = path.join(stagingDir, 'RPGReactor');
    logInfo('Staging editor files...');
    progress(2, 'Staging editor files...');

    // Copy whitelisted top-level directories
    for (const dir of INCLUDE_DIRS) {
        const src = path.join(appRoot, dir);
        if (fs.existsSync(src)) {
            copyDirRecursive(src, path.join(stageRoot, dir));
        }
    }

    // Copy whitelisted top-level files
    for (const file of INCLUDE_FILES) {
        const candidates = [path.join(appRoot, file), path.join(appRoot, '..', file)];
        const src = candidates.find(candidate => fs.existsSync(candidate));
        if (src) {
            fs.copyFileSync(src, path.join(stageRoot, file));
        }
    }

    // Forge GIF support is a runtime feature, but full node_modules trees are
    // intentionally excluded from editor distributions. Stage only the small
    // encoder/decoder dependency closure needed by import and export.
    const gifJsPath = dependencyPath('gif.js');
    const gifuctPath = dependencyPath('gifuct-js');
    const schemaParserPath = dependencyPath('js-binary-schema-parser');
    const oxipngPath = dependencyPath(path.join('@jsquash', 'oxipng'));
    const wasmFeatureDetectPath = dependencyPath('wasm-feature-detect');
    if (!gifJsPath || !gifuctPath || !schemaParserPath || !oxipngPath || !wasmFeatureDetectPath) {
        throw new Error('Editor runtime dependencies are missing. Run npm ci before packaging the editor.');
    }
    fs.mkdirSync(path.join(stageRoot, 'libs'), { recursive: true });
    fs.copyFileSync(path.join(gifJsPath, 'dist', 'gif.js'), path.join(stageRoot, 'libs', 'gif.js'));
    fs.copyFileSync(path.join(gifJsPath, 'dist', 'gif.worker.js'), path.join(stageRoot, 'libs', 'gif.worker.js'));
    copyDirRecursive(gifJsPath, path.join(stageRoot, 'node_modules', 'gif.js'));
    copyDirRecursive(gifuctPath, path.join(stageRoot, 'node_modules', 'gifuct-js'));
    copyDirRecursive(schemaParserPath, path.join(stageRoot, 'node_modules', 'js-binary-schema-parser'));
    copyDirRecursive(oxipngPath, path.join(stageRoot, 'node_modules', '@jsquash', 'oxipng'));
    copyDirRecursive(wasmFeatureDetectPath, path.join(stageRoot, 'node_modules', 'wasm-feature-detect'));

    // Copy runtime corescript used for newly created projects.
    const runtimeCandidates = [
        path.join(appRoot, 'runtime'),
        path.join(appRoot, '..', 'runtime'),
    ];
    const runtimeSrc = runtimeCandidates.find(candidate => fs.existsSync(path.join(candidate, 'reactor_main.js')));
    if (runtimeSrc) {
        const requiredRuntimeFiles = [
            'reactor_main.js', 'reactor_core.js', 'reactor_managers.js',
            'reactor_objects.js', 'reactor_scenes.js', 'reactor_sprites.js',
            'reactor_windows.js', 'reactor_mv_compat.js', 'reactor_plugins.js',
            path.join('libs', 'pixi.js'), path.join('libs', 'pixi_compat.js'),
            path.join('libs', 'pako.min.js'), path.join('libs', 'localforage.min.js'),
            path.join('libs', 'effekseer.min.js'), path.join('libs', 'effekseer.wasm'),
            path.join('libs', 'vorbisdecoder.js'),
        ];
        const missing = requiredRuntimeFiles.filter(file => !fs.existsSync(path.join(runtimeSrc, file)));
        if (missing.length) throw new Error(`Runtime is incomplete: ${missing.join(', ')}`);
        copyDirRecursive(runtimeSrc, path.join(stageRoot, 'runtime'));
    } else {
        throw new Error('runtime/ not found; editor packages must include the project runtime');
    }

    // Copy the optional default project template used by new project creation.
    if (includeTemplate) {
        const templateCandidates = [
            path.join(appRoot, 'template', 'Demo'),
            path.join(appRoot, '..', 'template', 'Demo'),
        ];
        const templateSrc = templateCandidates.find(candidate => fs.existsSync(path.join(candidate, 'project.rpgreactor')));
        if (templateSrc) {
            copyDirRecursive(templateSrc, path.join(stageRoot, 'template', 'Demo'));
        } else {
            logWarn('  template/Demo not found — generated starter projects will be used instead');
        }
    }

    // Count staged files
    let fileCount = 0;
    function countFiles(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) countFiles(path.join(dir, e.name));
            else fileCount++;
        }
    }
    countFiles(stageRoot);
    logGood(`Staged ${fileCount} files.`);
    progress(10, 'Staging complete');
    logInfo('');

    if (stageOnly) {
        parentPort.postMessage({ type: 'staged', stageRoot });
        return;
    }

    // ── Build packages ──────────────────────────────────────────────
    try {
        if (packageType === 'minimal' && includeProprietaryCodecs) {
            throw new Error('Third-party codec bundling is not available for minimal editor packages.');
        }
        if (createLinuxAppImage &&
            (packageType !== 'platform' || !platforms.includes('linux') || !appImage.supportsHost())) {
            throw new Error('Linux AppImage requires a platform-specific Linux build on a Linux x86_64 host.');
        }
        if (packageType === 'web') {
            logBlue('--- Building browser editor ---');
            progress(30, 'Bundling browser editor...');
            buildWeb(stageRoot, stagingDir);
            progress(90, 'Web build complete');
            logInfo('');
        } else if (packageType === 'platform') {
            const share = 80 / platforms.length;
            for (let i = 0; i < platforms.length; i++) {
                const plat = platforms[i];
                const pBase = 10 + i * share;
                const platLabel = plat === 'win' ? 'Windows' : plat === 'osx' ? 'macOS' : 'Linux';
                logBlue(`--- Building platform package: ${platLabel} ---`);
                progress(Math.round(pBase), `Building ${platLabel}...`);

                const pkgDir = path.join(stagingDir, `pkg-${plat}`);
                const appDir = path.join(pkgDir, 'RPGReactor');

                // Copy NW.js runtime flat to the platform package.
                logInfo('Acquiring NW.js runtime...');
                const runtimeDir = await acquireRuntime(plat, appDir, pBase, share * 0.6, true);
                if (includeProprietaryCodecs) {
                    await installProprietaryCodec(plat, runtimeDir, pBase + share * 0.6, 0);
                }
                if (plat === 'osx') {
                    pruneMacRuntimeSidecars(appDir);
                }

                // Package editor files for platform-specific launch handling.
                logInfo('Copying editor files...');
                progress(Math.round(pBase + share * 0.6), 'Copying editor files...');

                const executablePackage = path.join(pkgDir, 'editor-package.nw');
                if (plat === 'osx') {
                    // macOS app payload is copied into the branded .app bundle
                    // during finalization below.
                } else if (plat === 'win' || plat === 'linux') {
                    // Keep nw.exe/nw clean for playtest. The editor payload is
                    // appended to the branded executable instead of placed in
                    // package.nw, because package.nw contaminates sibling NW
                    // launches and makes playtest reload the editor.
                    const originalPackageJson = plat === 'win' ? writeWindowsFramelessPackageConfig(stageRoot) : null;
                    try {
                        createNwPackage(stageRoot, executablePackage);
                    } finally {
                        if (originalPackageJson !== null) {
                            fs.writeFileSync(path.join(stageRoot, 'package.json'), originalPackageJson);
                        }
                    }
                } else {
                    copyDirRecursive(stageRoot, path.join(appDir, 'package.nw'));
                }

                // Rename executable
                logInfo('Renaming executable...');
                progress(Math.round(pBase + share * 0.85), 'Finalizing...');

                if (plat === 'linux') {
                    const oldExe = path.join(appDir, 'nw');
                    const newExe = path.join(appDir, 'RPGReactor');
                    if (fs.existsSync(oldExe)) {
                        fs.copyFileSync(oldExe, newExe);
                        appendPackageToExecutable(newExe, executablePackage);
                        fs.chmodSync(newExe, '755');
                        logInfo('  Executable: RPGReactor');
                        logInfo('  Playtest runtime: nw');
                    }
                    // Simple launcher script
                    fs.writeFileSync(path.join(appDir, 'RPGReactor.sh'), [
                        '#!/bin/bash',
                        'cd "$(dirname "${BASH_SOURCE[0]}")"',
                        './RPGReactor',
                        '',
                    ].join('\n'));
                    fs.chmodSync(path.join(appDir, 'RPGReactor.sh'), '755');
                    logInfo('  Launcher: RPGReactor.sh');
                } else if (plat === 'win') {
                    const oldExe = path.join(appDir, 'nw.exe');
                    const newExe = path.join(appDir, 'RPG Reactor.exe');
                    if (fs.existsSync(oldExe)) {
                        fs.copyFileSync(oldExe, newExe);
                        appendPackageToExecutable(newExe, executablePackage);
                        logInfo('  Executable: RPG Reactor.exe');
                        logInfo('  Playtest runtime: nw.exe');
                    }
                } else if (plat === 'osx') {
                    const oldApp = path.join(appDir, 'nwjs.app');
                    const newApp = path.join(appDir, 'RPG Reactor.app');
                    if (fs.existsSync(oldApp)) {
                        prepareMacAppBundleForEditor(oldApp, stageRoot);
                        installMacPlaytestRuntime(oldApp);
                        fs.renameSync(oldApp, newApp);
                        logInfo('  App bundle: RPG Reactor.app');
                        logInfo('  Playtest runtime: RPG Reactor.app/Contents/Resources/playtest-runtime/nwjs.app');
                    }
                }

                // ── Replace icon ────────────────────────────────
                const editorIconPng = path.join(stageRoot, 'images', 'icon.png');
                if (fs.existsSync(editorIconPng)) {
                    const iconPng = fs.readFileSync(editorIconPng);

                    if (plat === 'osx') {
                        const appBundle = path.join(appDir, 'RPG Reactor.app');
                        if (fs.existsSync(appBundle)) {
                            iconHelpers.replaceAppIcon(appBundle, iconPng, logInfo);
                        }
                    } else if (plat === 'win') {
                        const exePath = path.join(appDir, 'RPG Reactor.exe');
                        if (fs.existsSync(exePath)) {
                            const icoPath = path.join(stageRoot, 'images', 'icon.ico');
                            let icoBuf;
                            if (fs.existsSync(icoPath)) {
                                icoBuf = fs.readFileSync(icoPath);
                                logInfo('  [icon] Using existing icon.ico');
                            } else {
                                icoBuf = iconHelpers.createIcoFromPng(iconPng);
                                logInfo('  [icon] Generated icon.ico from icon.png');
                            }
                            iconHelpers.embedExeIcon(exePath, icoBuf, logInfo);
                        }
                    }
                } else {
                    logDim('  No images/icon.png found — using default NW.js icon');
                }

                // Archive
                const archLabel = plat === 'win' ? 'win-x64' : plat === 'osx' ? 'osx-x64' : 'linux-x64';
                createArchive(`RPGReactor-v${appVersion}-${archLabel}.zip`, pkgDir, 'RPGReactor', plat !== 'win');

                if (plat === 'linux' && createLinuxAppImage) {
                    const outputPath = path.join(outputDir, `RPGReactor-v${appVersion}-linux-x64.AppImage`);
                    logInfo('Creating Linux AppImage...');
                    progress(Math.round(pBase + share * 0.9), 'Creating Linux AppImage...');
                    const result = await appImage.createAppImage({
                        sourceDir: appDir,
                        outputPath,
                        executable: 'RPGReactor',
                        displayName: 'RPG Reactor',
                        appId: 'rpg-reactor',
                        iconPath: editorIconPng,
                        version: appVersion,
                        comment: 'Open-source RPG game engine',
                        categories: 'Development;Game;',
                        startupWMClass: 'rpg-reactor',
                        cacheDirectories: appImage.cacheDirectories(appRoot),
                        download: (url, destination, detail) => downloadFile(
                            url,
                            destination,
                            Math.round(pBase + share * 0.9),
                            Math.max(1, Math.round(share * 0.1)),
                            detail),
                        onWarning: logWarn,
                        toolPath: appImageToolPath,
                        runtimePath: appImageRuntimePath,
                    });
                    logGood(`Created: ${path.basename(result.outputPath)}`);
                    logDim(`  SHA-256: ${result.sha256}`);
                }

                // Clean up per-platform dir
                fs.rmSync(pkgDir, { recursive: true, force: true });

                progress(Math.round(pBase + share), `${platLabel} complete`);
                logInfo('');
            }

        } else if (packageType === 'universal') {
            logBlue('--- Building universal package ---');
            const pkgDir = path.join(stagingDir, 'pkg-universal');
            const appDir = path.join(pkgDir, 'RPGReactor');
            copyDirRecursive(stageRoot, appDir);

            const platList = ['linux', 'win', 'osx'];
            for (let i = 0; i < platList.length; i++) {
                progress(Math.round(10 + (i / platList.length) * 70), `Acquiring ${platList[i]} runtime...`);
                const runtimeDir = await acquireRuntime(platList[i], appDir, 10 + i * 23, 23, false);
                if (includeProprietaryCodecs) {
                    await installProprietaryCodec(platList[i], runtimeDir, 10 + i * 23 + 16, 0);
                }
            }

            // Write clean distribution launchers
            logInfo('Writing distribution launchers...');

            fs.writeFileSync(path.join(appDir, 'RPGReactor.sh'), [
                '#!/bin/bash',
                'cd "$(dirname "${BASH_SOURCE[0]}")"',
                './nwjs-linux/nw .',
                '',
            ].join('\n'));
            fs.chmodSync(path.join(appDir, 'RPGReactor.sh'), '755');
            logInfo('  RPGReactor.sh');

            fs.writeFileSync(path.join(appDir, 'RPGReactor.bat'),
                '@echo off\r\ncd /d "%~dp0"\r\nnwjs-win\\nw.exe .\r\n');
            logInfo('  RPGReactor.bat');

            fs.writeFileSync(path.join(appDir, 'RPGReactor.command'), [
                '#!/bin/bash',
                'cd "$(dirname "${BASH_SOURCE[0]}")"',
                './nwjs-mac/nwjs.app/Contents/MacOS/nwjs .',
                '',
            ].join('\n'));
            fs.chmodSync(path.join(appDir, 'RPGReactor.command'), '755');
            logInfo('  RPGReactor.command');

            createArchive(`RPGReactor-v${appVersion}-universal.zip`, pkgDir, 'RPGReactor');
            fs.rmSync(pkgDir, { recursive: true, force: true });
            logInfo('');

        } else if (packageType === 'minimal') {
            logBlue('--- Building minimal package ---');
            const pkgDir = path.join(stagingDir, 'pkg-minimal');
            copyDirRecursive(stageRoot, path.join(pkgDir, 'RPGReactor'));

            // Replace launchers with bootstrap versions
            await ensureNwVersion();
            writeBootstrapLaunchers(path.join(pkgDir, 'RPGReactor'));

            createArchive(`RPGReactor-v${appVersion}-minimal.zip`, pkgDir, 'RPGReactor');
            fs.rmSync(pkgDir, { recursive: true, force: true });
            logInfo('');
        }

        // ── Checksums ───────────────────────────────────────────────
        progress(92, 'Generating checksums...');
        generateChecksums();

        progress(100, 'Build complete!');
        logBlue('========================================');
        logGood('Editor distribution build complete!');
        logBlue('========================================');
        logInfo(`Output: ${outputDir}`);

    } finally {
        logDim('Cleaning up staging...');
        try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
    }

})().then(() => {
    parentPort.postMessage({ type: 'done', success: true });
}).catch((err) => {
    logError('');
    logError('========================================');
    logError('Build failed!');
    logError('========================================');
    logError(String(err.message || err));
    if (err.stack) logError(err.stack);
    parentPort.postMessage({ type: 'done', success: false });
});
