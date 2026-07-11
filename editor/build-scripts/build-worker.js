/**
 * Build worker — runs in a worker_threads Worker.
 * Does NOT use nw-builder (ESM import hangs in NW.js worker threads).
 * Instead, builds manually: copy NW.js runtime + game files + rename.
 */
const { workerData, parentPort, threadId } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');
const iconHelpers = require('./icon-helpers');
const nwRuntime = require('./nw-runtime-utils');
const nwCodec = require('./nw-codec-utils');
const assetOptimizer = require('./asset-optimizer');
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
    projectPath,
    projectName,
    platforms,
    outputDir,
    nwVersion: requestedNwVersion,
    nwVersionPolicy = 'exact',
    editorNwVersion = requestedNwVersion,
    runtimeSource,   // 'bundled' or 'download'
    appRoot,         // editor app root for cache directory
    editorExecPath,
    includeProprietaryCodecs = false,
    runtimeLocales = null,
    assetOptimization = { png: false, ogg: false, oggQuality: 5 },
    createLinuxAppImage = false,
    appImageToolPath,
    appImageRuntimePath,
} = workerData;
let nwVersion = requestedNwVersion;
let nwVersionResolved = false;

// Bundled NW.js directories (ship with RPG Reactor, include proprietary codecs)
const bundledDirs = {
    linux: [path.join(appRoot, 'nwjs-linux'), path.join(appRoot, '..', 'nwjs-linux')].find(candidate => fs.existsSync(candidate)),
    win:   [path.join(appRoot, 'nwjs-win'), path.join(appRoot, '..', 'nwjs-win')].find(candidate => fs.existsSync(candidate)),
    osx:   [path.join(appRoot, 'nwjs-mac'), path.join(appRoot, '..', 'nwjs-mac')].find(candidate => fs.existsSync(candidate)),
};

const cacheCandidates = nwRuntime.cacheDirectories(appRoot);
const codecCacheCandidates = nwCodec.cacheDirectories(appRoot);

function bundledRuntimeVersion(platform, bundledDir, packagedDir) {
    if (packagedDir) return nwRuntime.normalizeVersion(editorNwVersion);
    if (!bundledDir) return null;
    try {
        const marker = JSON.parse(fs.readFileSync(path.join(bundledDir, '.rpg-reactor-nw-runtime.json'), 'utf8'));
        if (marker.platform === platform && marker.arch === 'x64') return nwRuntime.normalizeVersion(marker.version);
    } catch {}
    const hostPlatform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'osx' : 'linux';
    return platform === hostPlatform ? nwRuntime.normalizeVersion(editorNwVersion) : null;
}

// ── Exclusions for staging ──────────────────────────────────────────
const EXCLUDED = new Set([
    'Backup',
    'BACKUP',
    'backup',
    'Screenshots',
    'save',
    'project.rpgreactor',
    'game.rmmzproject',
    'Game.rpgproject',
    'game.rpgproject',
    path.join('js', 'REACTOR_CORE_DUMP_MIDDEV'),
    path.join('js', 'RMMZ_Corescript'),
    path.join('data', 'nul'),
]);

function copyDirFiltered(src, dest, relBase) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const relPath = path.join(relBase, entry.name);
        if (EXCLUDED.has(relPath)) {
            logDim(`  [skip] ${relPath}`);
            continue;
        }
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirFiltered(srcPath, destPath, relPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

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

function validateProjectRuntime(root) {
    const required = [
        'reactor_main.js', 'reactor_core.js', 'reactor_managers.js',
        'reactor_objects.js', 'reactor_scenes.js', 'reactor_sprites.js',
        'reactor_windows.js', 'reactor_mv_compat.js', 'reactor_plugins.js',
        path.join('libs', 'pixi.js'), path.join('libs', 'pixi_compat.js'),
        path.join('libs', 'pako.min.js'), path.join('libs', 'localforage.min.js'),
        path.join('libs', 'effekseer.min.js'), path.join('libs', 'effekseer.wasm'),
        path.join('libs', 'vorbisdecoder.js'),
    ];
    const jsRoot = path.join(root, 'js');
    const metadataPath = path.join(root, 'project.rpgreactor');
    let metadataRequiresReactor = false;
    if (fs.existsSync(metadataPath)) {
        try {
            metadataRequiresReactor = JSON.parse(fs.readFileSync(metadataPath, 'utf8')).imported !== true;
        } catch {
            metadataRequiresReactor = true;
        }
    }
    const reactorProject = metadataRequiresReactor
        || required.some(file => file !== 'reactor_main.js' && fs.existsSync(path.join(jsRoot, file)));
    if (!reactorProject) return false;
    const missing = required.filter(file => !fs.existsSync(path.join(jsRoot, file)));
    if (missing.length) throw new Error(`Project runtime is incomplete: ${missing.join(', ')}`);
    return true;
}

function slugifyPackageName(value) {
    const slug = String(value || 'game')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'game';
}

function normalizeStagedPackage(stagingDir, gameTitle) {
    const stagedPackagePath = path.join(stagingDir, 'package.json');
    if (!fs.existsSync(stagedPackagePath)) return;

    const stagedPackage = JSON.parse(fs.readFileSync(stagedPackagePath, 'utf8'));
    const titleSlug = slugifyPackageName(gameTitle);
    const currentName = slugifyPackageName(stagedPackage.name);
    stagedPackage.name = currentName === 'rmmz-game'
        ? `rpg-reactor-${titleSlug}`
        : currentName;

    fs.writeFileSync(stagedPackagePath, JSON.stringify(stagedPackage, null, 2));
}

// ── Download helper ─────────────────────────────────────────────────
const DOWNLOAD_IDLE_TIMEOUT_MS = 180000;
const DOWNLOAD_MAX_ATTEMPTS = 3;

function downloadFile(url, destPath, progressBase, progressSpan, reportProgress = true, requestOptions = {}) {
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
                        if (reportProgress && total > 0) {
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
            const req = https.get(target, {
            headers: { 'User-Agent': 'RPG-Reactor', Accept: 'application/vnd.github+json, application/json' },
        }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirect = new URL(res.headers.location, target).toString();
                res.resume();
                request(redirect);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${target}`));
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

async function installProprietaryCodec(platform, runtimeRoot, runtimeVersion, progressBase, progressSpan) {
    logInfo(`Installing third-party FFmpeg codec for NW.js ${runtimeVersion} (${platform}-x64)...`);
    const acquired = await nwCodec.acquireArchive({
        version: runtimeVersion,
        platform,
        arch: 'x64',
        cacheDirectories: codecCacheCandidates,
        fetchRelease: fetchJson,
        download: (url, destination) => downloadFile(url, destination, progressBase, progressSpan),
        onWarning: logWarn,
    });
    const temp = path.join(os.tmpdir(), `rpgreactor-codec-${process.pid}-${threadId}-${Date.now()}`);
    try {
        const binary = nwCodec.extractBinary(acquired.archivePath, platform, temp);
        const destination = nwCodec.installBinary(binary, runtimeRoot, platform, acquired);
        logGood(`Proprietary codec installed: ${destination}`);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

// ── Main build ──────────────────────────────────────────────────────
(async () => {
    logBlue('========================================');
    logBlue('RPG Reactor — Game Build');
    logBlue('========================================');
    progress(0, 'Starting build...');

    // Read game package.json
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        throw new Error('No package.json found in project directory.');
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Read System.json for game title (used for output folder name)
    let gameTitle = 'Game';
    const systemPath = path.join(projectPath, 'data', 'System.json');
    if (fs.existsSync(systemPath)) {
        try {
            const system = JSON.parse(fs.readFileSync(systemPath, 'utf8'));
            if (system.gameTitle) {
                gameTitle = system.gameTitle;
            }
        } catch (e) {
            logWarn(`Could not read System.json gameTitle, using "${gameTitle}"`);
        }
    }
    const safeFolderName = gameTitle.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim() || 'Game';

    logInfo(`Game title: ${gameTitle}`);
    logInfo(`Project: ${projectPath}`);
    logInfo(`Platform(s): ${platforms.join(', ')}`);
    logInfo(`Output: ${outputDir}`);
    logInfo(`NW.js version policy: ${nwVersionPolicy}${nwVersionPolicy === 'exact' ? ` (${requestedNwVersion})` : ''}`);
    logInfo(`Runtime source: ${runtimeSource}`);
    logInfo(`Third-party proprietary codec: ${includeProprietaryCodecs ? 'enabled' : 'disabled'}`);
    logInfo(`NW.js runtime locales: ${runtimeLocales ? runtimeLocales.join(', ') : 'all'}`);
    logInfo(`Asset optimization: PNG ${assetOptimization.png ? 'enabled' : 'disabled'}, OGG ${assetOptimization.ogg ? `quality ${assetOptimization.oggQuality}` : 'disabled'}`);
    logInfo(`Linux AppImage: ${createLinuxAppImage ? 'enabled' : 'disabled'}`);
    logInfo('');

    if (createLinuxAppImage && (!platforms.includes('linux') || !appImage.supportsHost())) {
        throw new Error('Linux AppImage requires Linux output on a Linux x86_64 build host.');
    }

    // ── Progress math ────────────────────────────────────────────────
    // Steps: staging (10%) + per-platform (remaining 90% split evenly)
    const platformShare = 90 / platforms.length;

    // ── Stage project files ─────────────────────────────────────────
    const stagingNonce = `${process.pid}-${threadId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stagingDir = path.join(os.tmpdir(), `rpgreactor-build-${stagingNonce}`);
    try {
    logInfo('Staging game files...');
    progress(2, 'Staging game files...');
    validateProjectRuntime(projectPath);
    copyDirFiltered(projectPath, stagingDir, '');
    normalizeStagedPackage(stagingDir, gameTitle);
    if (assetOptimization.png || assetOptimization.ogg) {
        logInfo('Optimizing staged assets...');
        progress(6, 'Optimizing staged assets...');
        const summary = await assetOptimizer.optimizeStagedAssets(stagingDir, assetOptimization, {
            appRoot,
            fetchRelease: fetchJson,
            download: (url, destination, detail) => downloadFile(url, destination, 6, 2, detail.reportProgress),
            onWarning: logWarn,
            onStatus: logInfo,
            onFile: (type, filePath, index, total) => {
                const relativePath = path.relative(stagingDir, filePath);
                logDim(`  [${type} ${index}/${total}] ${relativePath}`);
                progress(8, `${type} ${index}/${total}: ${path.basename(filePath)}`);
            },
            onProgress: (type, completed, total) => {
                if (!total) return;
                const percent = Math.round((completed / total) * 100);
                progress(8 + Math.round((completed / total) * 2), `${type} optimization ${percent}%`);
            },
        });
        const saved = Math.max(0, summary.before - summary.after);
        logGood(`Asset optimization complete: ${summary.png} PNG, ${summary.ogg} OGG updated; ${(saved / 1024 / 1024).toFixed(2)} MiB saved.`);
    }
    logGood('Staging complete.');
    progress(10, 'Staging complete');
    logInfo('');

    // Ensure output exists. NW.js caches are created lazily for desktop misses.
    fs.mkdirSync(outputDir, { recursive: true });

        for (let i = 0; i < platforms.length; i++) {
            const platform = platforms[i];
            const nwPlatform = platform === 'mac' ? 'osx' : platform;
            const label = platform === 'mac' ? 'macOS' : platform === 'win' ? 'Windows' : platform === 'web' ? 'Web (HTML5)' : 'Linux';

            // Progress offsets for this platform
            const pBase = 10 + i * platformShare;
            const pRuntime = pBase;                          // 0-60% of platform share
            const pCopy = pBase + platformShare * 0.6;       // 60-85% of platform share
            const pRename = pBase + platformShare * 0.85;    // 85-100% of platform share

            logBlue(`--- Building for ${label} ---`);
            logInfo('');
            progress(Math.round(pBase), `Building for ${label}...`);

            // Web builds use a different output folder name
            const platformOutDir = platform === 'web'
                ? path.join(outputDir, `${safeFolderName}-web`)
                : path.join(outputDir, `${safeFolderName}-${nwPlatform}-x64`);

            // Clean previous output
            if (fs.existsSync(platformOutDir)) {
                fs.rmSync(platformOutDir, { recursive: true, force: true });
            }

            if (platform === 'web') {
                // ── Web deployment — no NW.js runtime needed ─────────
                logInfo('Web deployment — no NW.js runtime needed');
                logInfo('Copying game files...');
                progress(Math.round(pCopy), 'Copying game files...');
                copyDirRecursive(stagingDir, platformOutDir);
                logGood('Game files copied.');
                progress(Math.round(pRename), 'Finalizing...');
            } else {
                // ── Get NW.js runtime ───────────────────────────────
                const bundledDir = bundledDirs[nwPlatform];
                const packagedDir = nwRuntime.packagedFlatRuntime(editorExecPath, nwPlatform);
                const localRuntimeVersion = bundledRuntimeVersion(nwPlatform, bundledDir, bundledDir ? null : packagedDir);
                const hasBundledRuntime = (bundledDir && fs.existsSync(bundledDir)) || packagedDir;
                const requiresSelectedVersion = nwVersionPolicy === 'exact' || nwVersionPolicy === 'editor';
                if (requiresSelectedVersion) await ensureNwVersion();
                const localVersionMatches = !requiresSelectedVersion ||
                    (localRuntimeVersion && localRuntimeVersion === nwVersion);
                const canUseBundled = hasBundledRuntime && localVersionMatches &&
                    (!includeProprietaryCodecs || localRuntimeVersion);
                if (runtimeSource === 'bundled' && canUseBundled) {
                    // Copy the local NW.js runtime before applying optional codec overlays.
                    const sourceDir = bundledDir || packagedDir;
                    logInfo(`Copying bundled NW.js runtime (${sourceDir})...`);
                    progress(Math.round(pRuntime + platformShare * 0.1), 'Copying NW.js runtime...');
                    if (bundledDir) copyDirRecursive(bundledDir, platformOutDir);
                    else nwRuntime.copyPackagedFlatRuntime(packagedDir, platformOutDir);
                    if (localRuntimeVersion) {
                        nwRuntime.writeRuntimeMarker(platformOutDir, {
                            version: localRuntimeVersion, edition: 'normal', platform: nwPlatform, arch: 'x64',
                        });
                    }
                    logGood('NW.js runtime copied.');
                    progress(Math.round(pCopy), 'NW.js runtime copied');
                    if (includeProprietaryCodecs) {
                        await installProprietaryCodec(nwPlatform, platformOutDir, localRuntimeVersion,
                            Math.round(pCopy), 0);
                    }
                } else {
                    if (runtimeSource === 'bundled') {
                        logWarn(hasBundledRuntime
                            ? `Bundled NW.js does not match the selected version for ${label}; using the exact official runtime/cache.`
                            : `Bundled NW.js not found for ${label} — falling back to download`);
                    }
                    // Download NW.js for the target platform
                    await ensureNwVersion();
                    const archiveName = nwRuntime.archiveName(nwVersion, nwPlatform, 'normal');
                    let archivePath = nwRuntime.findCachedFile(cacheCandidates, archiveName);

                    if (!archivePath) {
                        const downloadCacheDir = nwRuntime.writableCacheDirectory(cacheCandidates);
                        archivePath = path.join(downloadCacheDir, archiveName);
                        const url = `https://dl.nwjs.io/v${nwVersion}/${archiveName}`;
                        logInfo(`Downloading NW.js for ${label}...`);
                        logDim(`  ${url}`);
                        // Download gets pRuntime → pCopy range for progress
                        await downloadFile(url, archivePath, Math.round(pRuntime), Math.round(platformShare * 0.5));
                        logGood('Download complete.');
                    } else {
                        logInfo(`Using cached NW.js: ${archivePath}`);
                    }

                    // Extract
                    logInfo('Extracting NW.js...');
                    progress(Math.round(pRuntime + platformShare * 0.5), 'Extracting NW.js...');
                    const extractDir = path.join(os.tmpdir(), `rpgreactor-nw-extract-${process.pid}-${threadId}-${Date.now()}`);
                    fs.mkdirSync(extractDir, { recursive: true });

                    try {
                        nwRuntime.extractArchive(archivePath, extractDir);

                        // The archive extracts to a subdirectory like nwjs-v0.92.0-linux-x64/
                        const extracted = fs.readdirSync(extractDir);
                        const innerDir = extracted.length === 1
                            ? path.join(extractDir, extracted[0])
                            : extractDir;

                        copyDirRecursive(innerDir, platformOutDir);
                        nwRuntime.writeRuntimeMarker(platformOutDir, {
                            version: nwVersion, edition: 'normal', platform: nwPlatform, arch: 'x64',
                        });
                        logGood('Extraction complete.');
                        progress(Math.round(pCopy), 'Extraction complete');
                    } finally {
                        fs.rmSync(extractDir, { recursive: true, force: true });
                    }
                    if (includeProprietaryCodecs) {
                        await installProprietaryCodec(nwPlatform, platformOutDir, nwVersion,
                            Math.round(pCopy), 0);
                    }
                }

                if (runtimeLocales) {
                    const localeResult = nwRuntime.pruneDesktopLocales(
                        platformOutDir, nwPlatform, runtimeLocales, logWarn);
                    if (localeResult.filtered) {
                        logGood(`Runtime locales filtered (${localeResult.removed} files/directories removed).`);
                    }
                }

                // ── Copy game files to package.nw ───────────────────
                let appDest;
                if (nwPlatform === 'osx') {
                    // macOS: app.nw inside the .app bundle
                    const appBundle = fs.readdirSync(platformOutDir).find(f => f.endsWith('.app'));
                    appDest = path.join(platformOutDir, appBundle || 'nwjs.app', 'Contents', 'Resources', 'app.nw');
                } else {
                    appDest = path.join(platformOutDir, 'package.nw');
                }

                logInfo('Copying game files...');
                progress(Math.round(pCopy), 'Copying game files...');
                copyDirRecursive(stagingDir, appDest);
                logGood('Game files copied.');
                progress(Math.round(pRename), 'Finalizing...');

                // ── Rename executable ───────────────────────────────
                logInfo('Renaming executable...');
                if (nwPlatform === 'linux') {
                    const oldExe = path.join(platformOutDir, 'nw');
                    const newExe = path.join(platformOutDir, 'Game');
                    if (fs.existsSync(oldExe)) {
                        fs.renameSync(oldExe, newExe);
                        fs.chmodSync(newExe, '755');
                        logInfo('  Executable: Game');
                    }

                    // Create simple launcher script
                    const launcherPath = path.join(platformOutDir, 'Game.sh');
                    fs.writeFileSync(launcherPath, [
                        '#!/bin/bash',
                        'cd "$(dirname "${BASH_SOURCE[0]}")"',
                        './Game',
                        '',
                    ].join('\n'));
                    fs.chmodSync(launcherPath, '755');
                    logInfo('  Launcher: Game.sh');
                } else if (nwPlatform === 'win') {
                    const oldExe = path.join(platformOutDir, 'nw.exe');
                    const newExe = path.join(platformOutDir, 'Game.exe');
                    if (fs.existsSync(oldExe)) {
                        fs.renameSync(oldExe, newExe);
                        logInfo('  Executable: Game.exe');
                    }
                } else if (nwPlatform === 'osx') {
                    const oldApp = path.join(platformOutDir, 'nwjs.app');
                    const newApp = path.join(platformOutDir, 'Game.app');
                    if (fs.existsSync(oldApp)) {
                        fs.renameSync(oldApp, newApp);
                        logInfo('  App bundle: Game.app');
                    }
                }

                // ── Replace icon ────────────────────────────────
                const iconPngPath = path.join(stagingDir, 'icon', 'icon.png');
                if (fs.existsSync(iconPngPath)) {
                    const iconPng = fs.readFileSync(iconPngPath);

                    if (nwPlatform === 'osx') {
                        const appBundle = path.join(platformOutDir, 'Game.app');
                        if (fs.existsSync(appBundle)) {
                            iconHelpers.replaceAppIcon(appBundle, iconPng, logInfo);
                        }
                    } else if (nwPlatform === 'win') {
                        const exePath = path.join(platformOutDir, 'Game.exe');
                        if (fs.existsSync(exePath)) {
                            const icoPath = path.join(stagingDir, 'icon', 'icon.ico');
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
                    logDim('  No icon/icon.png found — using default NW.js icon');
                }

                if (nwPlatform === 'linux' && createLinuxAppImage) {
                    const fallbackIcon = path.join(appRoot, 'images', 'icon.png');
                    const appImageIcon = fs.existsSync(iconPngPath) ? iconPngPath : fallbackIcon;
                    const outputPath = path.join(outputDir, `${safeFolderName}-linux-x64.AppImage`);
                    logInfo('Creating Linux AppImage...');
                    progress(Math.round(pRename), 'Creating Linux AppImage...');
                    const result = await appImage.createAppImage({
                        sourceDir: platformOutDir,
                        outputPath,
                        executable: 'Game',
                        displayName: gameTitle,
                        appId: `rpg-reactor-${pkg.name || gameTitle}`,
                        iconPath: appImageIcon,
                        version: pkg.version || '1.0.0',
                        comment: pkg.description || `${gameTitle} game`,
                        categories: 'Game;',
                        startupWMClass: slugifyPackageName(pkg.name || gameTitle),
                        cacheDirectories: appImage.cacheDirectories(appRoot),
                        download: (url, destination, detail) => downloadFile(
                            url,
                            destination,
                            Math.round(pRename),
                            Math.max(1, Math.round(platformShare * 0.1)),
                            true,
                            detail),
                        onWarning: logWarn,
                        toolPath: appImageToolPath,
                        runtimePath: appImageRuntimePath,
                    });
                    logGood(`Created: ${path.basename(result.outputPath)}`);
                    logDim(`  SHA-256: ${result.sha256}`);
                }
            }

            const pEnd = pBase + platformShare;
            progress(Math.round(pEnd), `${label} build complete`);
            logGood(`Build for ${label} complete!`);
            logInfo(`  ${platformOutDir}`);
            logInfo('');
        }

        progress(100, 'Build complete!');
        logBlue('========================================');
        logGood('All builds completed successfully!');
        logBlue('========================================');

    } finally {
        // Clean up staging
        logDim('Cleaning up staging...');
        try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch {}
        logDim('Done.');
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
