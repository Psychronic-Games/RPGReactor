/**
 * Editor Distribution Worker — runs in a worker_threads Worker.
 * Packages the RPG Reactor editor for distribution (itch.io, GitHub Releases).
 * Follows the same pattern as build-worker.js (game builds).
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
    appRoot,         // editor install directory
    platforms,       // ['linux', 'win', 'osx']
    packageType,     // 'platform', 'universal', or 'minimal'
    edition,         // 'normal' or 'sdk'
    nwVersion,       // e.g. '0.92.0'
    outputDir,       // where to write archives
} = workerData;

const cacheDir = path.join(appRoot, '.nw-cache');

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
                const partPath = destPath + '.part';
                const file = fs.createWriteStream(partPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close(() => {
                        fs.renameSync(partPath, destPath);
                        resolve();
                    });
                });
                file.on('error', reject);
            }).on('error', reject);
        };
        doGet(url);
    });
}

// ── NW.js runtime helpers ───────────────────────────────────────────
const BUNDLED_DIRS = {
    linux: path.join(appRoot, 'nwjs-linux'),
    win:   path.join(appRoot, 'nwjs-win'),
    osx:   path.join(appRoot, 'nwjs-mac'),
};

const DIR_NAMES = { linux: 'nwjs-linux', win: 'nwjs-win', osx: 'nwjs-mac' };

function nwjsArchiveName(platform) {
    const prefix = edition === 'sdk' ? 'nwjs-sdk' : 'nwjs';
    const ext = platform === 'linux' ? 'tar.gz' : 'zip';
    return `${prefix}-v${nwVersion}-${platform === 'win' ? 'win' : platform}-x64.${ext}`;
}

function nwjsInnerDir(platform) {
    const prefix = edition === 'sdk' ? 'nwjs-sdk' : 'nwjs';
    return `${prefix}-v${nwVersion}-${platform === 'win' ? 'win' : platform}-x64`;
}

async function acquireRuntime(platform, targetDir, pBase, pSpan, flat) {
    const dirName = DIR_NAMES[platform];
    const bundledDir = BUNDLED_DIRS[platform];
    const destDir = flat ? targetDir : path.join(targetDir, dirName);

    // Tier 1: bundled local
    if (fs.existsSync(bundledDir)) {
        logInfo(`  Using bundled runtime: ${dirName}/`);
        copyDirRecursive(bundledDir, destDir);
        return;
    }

    // Tier 2: cached archive
    const archiveName = nwjsArchiveName(platform);
    const cachedPath = path.join(cacheDir, archiveName);

    if (!fs.existsSync(cachedPath)) {
        // Tier 3: download
        const url = `https://dl.nwjs.io/v${nwVersion}/${archiveName}`;
        logInfo(`  Downloading NW.js for ${platform}...`);
        logDim(`  ${url}`);
        fs.mkdirSync(cacheDir, { recursive: true });
        await downloadFile(url, cachedPath, pBase, pSpan * 0.7);
        logGood('  Download complete.');
    } else {
        logInfo(`  Using cached runtime: ${archiveName}`);
    }

    // Extract
    logInfo('  Extracting...');
    const extractDir = path.join(cacheDir, `_extract_${Date.now()}`);
    fs.mkdirSync(extractDir, { recursive: true });

    try {
        if (archiveName.endsWith('.tar.gz')) {
            execSync(`tar xzf "${cachedPath}" -C "${extractDir}"`, { stdio: 'pipe' });
        } else {
            execSync(`unzip -q -o "${cachedPath}" -d "${extractDir}"`, { stdio: 'pipe' });
        }

        // The archive has an inner directory — move it with the canonical name
        const innerDir = path.join(extractDir, nwjsInnerDir(platform));
        const source = fs.existsSync(innerDir) ? innerDir
            : path.join(extractDir, fs.readdirSync(extractDir)[0]);
        copyDirRecursive(source, destDir);
        logGood(`  Installed runtime: ${flat ? '(flat)' : dirName + '/'}`);
    } finally {
        fs.rmSync(extractDir, { recursive: true, force: true });
    }
}

// ── Archive creation ────────────────────────────────────────────────
function createArchive(archiveName, sourceDir, innerDirName) {
    const outPath = path.join(outputDir, archiveName);
    logInfo(`Creating archive: ${archiveName}`);

    if (archiveName.endsWith('.tar.gz')) {
        execSync(`tar czf "${outPath}" -C "${sourceDir}" "${innerDirName}"`, { stdio: 'pipe' });
    } else {
        execSync(`cd "${sourceDir}" && zip -qr "${outPath}" "${innerDirName}"`, { stdio: 'pipe' });
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

function writeWindowsFramelessPackageConfig(stageRoot) {
    const packagePath = path.join(stageRoot, 'package.json');
    if (!fs.existsSync(packagePath)) return null;

    const original = fs.readFileSync(packagePath, 'utf8');
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    pkg.main = 'index.html?rrFrameless=1';
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
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.tar.gz') || f.endsWith('.zip'));
    if (files.length === 0) return;

    const lines = [];
    for (const file of files) {
        const result = execSync(`sha256sum "${path.join(outputDir, file)}"`, { encoding: 'utf8' });
        // sha256sum outputs: <hash>  <path> — we want just filename
        const hash = result.split(/\s+/)[0];
        lines.push(`${hash}  ${file}`);
    }
    fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
    logGood('SHA256SUMS.txt written.');
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
    logInfo(`NW.js: v${nwVersion}`);
    logInfo(`Platform(s): ${platforms.join(', ')}`);
    logInfo(`Output: ${outputDir}`);
    logInfo('');

    fs.mkdirSync(outputDir, { recursive: true });

    // ── Stage editor files ──────────────────────────────────────────
    const stagingDir = path.join(os.tmpdir(), `rpgreactor-editor-dist-${Date.now()}`);
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

    // Copy runtime corescript used for newly created projects.
    const runtimeCandidates = [
        path.join(appRoot, 'runtime'),
        path.join(appRoot, '..', 'runtime'),
    ];
    const runtimeSrc = runtimeCandidates.find(candidate => fs.existsSync(path.join(candidate, 'reactor_main.js')));
    if (runtimeSrc) {
        copyDirRecursive(runtimeSrc, path.join(stageRoot, 'runtime'));
    } else {
        logWarn('  runtime/ not found — new project creation will be unavailable in this package');
    }

    // Copy the default project template used by new project creation.
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

    // Cherry-pick PixiJS for editor fallback loading.
    const pixiSrc = path.join(appRoot, '..', 'runtime', 'libs', 'pixi.js');
    if (fs.existsSync(pixiSrc)) {
        const pixiDest = path.join(stageRoot, 'runtime', 'libs');
        fs.mkdirSync(pixiDest, { recursive: true });
        fs.copyFileSync(pixiSrc, path.join(pixiDest, 'pixi.js'));
        logDim('  Cherry-picked runtime/libs/pixi.js');
    } else {
        logWarn('  runtime/libs/pixi.js not found — skipping');
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

    // ── Build packages ──────────────────────────────────────────────
    try {
        if (packageType === 'platform') {
            const share = 80 / platforms.length;
            for (let i = 0; i < platforms.length; i++) {
                const plat = platforms[i];
                const pBase = 10 + i * share;
                const platLabel = plat === 'win' ? 'Windows' : plat === 'osx' ? 'macOS' : 'Linux';
                logBlue(`--- Building platform package: ${platLabel} ---`);
                progress(Math.round(pBase), `Building ${platLabel}...`);

                const pkgDir = path.join(stagingDir, `pkg-${plat}`);
                const appDir = path.join(pkgDir, 'RPGReactor');

                // Copy NW.js runtime flat to app directory
                logInfo('Acquiring NW.js runtime...');
                await acquireRuntime(plat, appDir, pBase, share * 0.6, true);

                if (plat === 'osx') {
                    const cleanApp = path.join(appDir, 'nwjs.app');
                    const playtestRuntime = path.join(appDir, 'nwjs-mac', 'nwjs.app');
                    if (fs.existsSync(cleanApp)) {
                        logInfo('Keeping clean macOS playtest runtime...');
                        copyDirRecursive(cleanApp, playtestRuntime);
                        logInfo('  Playtest runtime: nwjs-mac/nwjs.app');
                    }
                }

                // Copy editor files into package.nw (or app.nw for macOS)
                logInfo('Copying editor files...');
                progress(Math.round(pBase + share * 0.6), 'Copying editor files...');

                const executablePackage = path.join(pkgDir, 'editor-package.nw');
                if (plat === 'osx') {
                    // macOS: editor files go inside .app bundle
                    const appBundle = fs.readdirSync(appDir).find(f => f.endsWith('.app'));
                    const appNwDir = path.join(appDir, appBundle || 'nwjs.app', 'Contents', 'Resources', 'app.nw');
                    copyDirRecursive(stageRoot, appNwDir);
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
                        fs.renameSync(oldApp, newApp);
                        logInfo('  App bundle: RPG Reactor.app');
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
                const ext = plat === 'linux' ? 'tar.gz' : 'zip';
                createArchive(`RPGReactor-v${appVersion}-${archLabel}.${ext}`, pkgDir, 'RPGReactor');

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
                await acquireRuntime(platList[i], appDir, 10 + i * 23, 23, false);
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
