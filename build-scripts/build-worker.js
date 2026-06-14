/**
 * Build worker — runs in a worker_threads Worker.
 * Does NOT use nw-builder (ESM import hangs in NW.js worker threads).
 * Instead, builds manually: copy NW.js runtime + game files + rename.
 */
const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');
const iconHelpers = require('./icon-helpers');

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

// ── Config from main thread ─────────────────────────────────────────
const {
    projectPath,
    projectName,
    platforms,
    outputDir,
    nwVersion,       // e.g. "0.92.0"
    runtimeSource,   // 'bundled' or 'download'
    appRoot,         // editor app root for cache directory
} = workerData;

// Bundled NW.js directories (ship with RPG Reactor, include proprietary codecs)
const bundledDirs = {
    linux: path.join(appRoot, 'nwjs-linux'),
    win:   path.join(appRoot, 'nwjs-win'),
    osx:   path.join(appRoot, 'nwjs-mac'),
};

const cacheDir = path.join(appRoot, '.nw-cache');

// ── Exclusions for staging ──────────────────────────────────────────
const EXCLUDED = new Set([
    'Backup',
    'Screenshots',
    'project.rpgreactor',
    'game.rmmzproject',
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
        if (EXCLUDED.has(relPath) || EXCLUDED.has(entry.name)) {
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

// ── Download helper (follows one redirect) ──────────────────────────
function downloadFile(url, destPath, progressBase, progressSpan) {
    return new Promise((resolve, reject) => {
        const doGet = (u) => {
            https.get(u, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    doGet(res.headers.location);
                    res.resume();
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${u}`));
                    res.resume();
                    return;
                }
                const total = parseInt(res.headers['content-length'], 10) || 0;
                let downloaded = 0;
                let lastPct = -1;
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
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
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', reject);
            }).on('error', reject);
        };
        doGet(url);
    });
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
    logInfo(`NW.js version: ${nwVersion}`);
    logInfo(`Runtime source: ${runtimeSource}`);
    logInfo('');

    // ── Progress math ────────────────────────────────────────────────
    // Steps: staging (10%) + per-platform (remaining 90% split evenly)
    const platformShare = 90 / platforms.length;

    // ── Stage project files ─────────────────────────────────────────
    const stagingDir = path.join(os.tmpdir(), `rpgreactor-build-${Date.now()}`);
    logInfo('Staging game files...');
    progress(2, 'Staging game files...');
    copyDirFiltered(projectPath, stagingDir, '');
    logGood('Staging complete.');
    progress(10, 'Staging complete');
    logInfo('');

    // Ensure output + cache dirs exist
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    try {
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
                if (runtimeSource === 'bundled' && bundledDir && fs.existsSync(bundledDir)) {
                    // Copy the bundled NW.js runtime (includes proprietary codecs)
                    logInfo(`Copying bundled NW.js runtime (${bundledDir})...`);
                    progress(Math.round(pRuntime + platformShare * 0.1), 'Copying NW.js runtime...');
                    copyDirRecursive(bundledDir, platformOutDir);
                    logGood('NW.js runtime copied.');
                    progress(Math.round(pCopy), 'NW.js runtime copied');
                } else {
                    if (runtimeSource === 'bundled') {
                        logWarn(`Bundled NW.js not found for ${label} — falling back to download`);
                    }
                    // Download NW.js for the target platform
                    const ext = nwPlatform === 'linux' ? 'tar.gz' : 'zip';
                    const archiveName = `nwjs-v${nwVersion}-${nwPlatform}-x64.${ext}`;
                    const archivePath = path.join(cacheDir, archiveName);

                    if (!fs.existsSync(archivePath)) {
                        const url = `https://dl.nwjs.io/v${nwVersion}/${archiveName}`;
                        logInfo(`Downloading NW.js for ${label}...`);
                        logDim(`  ${url}`);
                        // Download gets pRuntime → pCopy range for progress
                        await downloadFile(url, archivePath, Math.round(pRuntime), Math.round(platformShare * 0.5));
                        logGood('Download complete.');
                    } else {
                        logInfo(`Using cached NW.js: ${archiveName}`);
                    }

                    // Extract
                    logInfo('Extracting NW.js...');
                    progress(Math.round(pRuntime + platformShare * 0.5), 'Extracting NW.js...');
                    const extractDir = path.join(cacheDir, `_extract_${Date.now()}`);
                    fs.mkdirSync(extractDir, { recursive: true });

                    try {
                        if (ext === 'tar.gz') {
                            execSync(`tar xzf "${archivePath}" -C "${extractDir}"`, { stdio: 'pipe' });
                        } else {
                            execSync(`unzip -q -o "${archivePath}" -d "${extractDir}"`, { stdio: 'pipe' });
                        }

                        // The archive extracts to a subdirectory like nwjs-v0.92.0-linux-x64/
                        const extracted = fs.readdirSync(extractDir);
                        const innerDir = extracted.length === 1
                            ? path.join(extractDir, extracted[0])
                            : extractDir;

                        copyDirRecursive(innerDir, platformOutDir);
                        logGood('Extraction complete.');
                        progress(Math.round(pCopy), 'Extraction complete');
                    } finally {
                        fs.rmSync(extractDir, { recursive: true, force: true });
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
