const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ASSETS = {
    tool: {
        name: 'appimagetool-x86_64-324406882.AppImage',
        url: 'https://api.github.com/repos/AppImage/appimagetool/releases/assets/324406882',
        sha256: 'a6d71e2b6cd66f8e8d16c37ad164658985e0cf5fcaa950c90a482890cb9d13e0',
        commit: '8c8c91f762b412a19f4e8d2c4b35afb98f2d7c81',
    },
    runtime: {
        name: 'runtime-x86_64-456065460',
        url: 'https://api.github.com/repos/AppImage/type2-runtime/releases/assets/456065460',
        sha256: '1cc49bcf1e2ccd593c379adb17c9f85a36d619088296504de95b1d06215aebbf',
        commit: '75849dce7cc37e4319b633df1f116ca895c71a12',
    },
};

function supportsHost(platform = process.platform, arch = process.arch) {
    return platform === 'linux' && arch === 'x64';
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function cacheDirectories(appRoot) {
    return [
        path.join(appRoot, '.appimage-tool-cache'),
        path.join(appRoot, '..', '.appimage-tool-cache'),
        path.join(os.homedir(), '.cache', 'rpg-reactor', 'appimage-tools'),
    ];
}

function writableCacheDirectory(directories) {
    for (const directory of directories) {
        try {
            fs.mkdirSync(directory, { recursive: true });
            const probe = path.join(directory, `.write-test-${process.pid}-${Date.now()}`);
            fs.writeFileSync(probe, '');
            fs.rmSync(probe, { force: true });
            return directory;
        } catch {}
    }
    throw new Error('No writable AppImage tool cache is available.');
}

function findVerifiedAsset(asset, directories, onWarning) {
    for (const directory of directories) {
        const candidate = path.join(directory, asset.name);
        if (!fs.existsSync(candidate)) continue;
        if (sha256(candidate) === asset.sha256) return candidate;
        if (onWarning) onWarning(`Discarding unverified AppImage tool asset: ${candidate}`);
        try { fs.rmSync(candidate, { force: true }); } catch {}
    }
    return null;
}

async function acquireTools(options) {
    const acquired = {};
    for (const [key, asset] of Object.entries(ASSETS)) {
        let filePath = findVerifiedAsset(asset, options.cacheDirectories, options.onWarning);
        if (!filePath) {
            const directory = writableCacheDirectory(options.cacheDirectories);
            filePath = path.join(directory, asset.name);
            await options.download(asset.url, filePath, {
                headers: {
                    Accept: 'application/octet-stream',
                    'User-Agent': 'RPG-Reactor',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });
            if (sha256(filePath) !== asset.sha256) {
                fs.rmSync(filePath, { force: true });
                throw new Error(`AppImage ${key} SHA-256 verification failed.`);
            }
        }
        fs.chmodSync(filePath, '755');
        acquired[key] = filePath;
    }

    fs.writeFileSync(path.join(path.dirname(acquired.tool), 'verification.json'), JSON.stringify({
        acquiredAt: new Date().toISOString(),
        assets: ASSETS,
    }, null, 2));
    return acquired;
}

function sanitizeAppId(value) {
    const id = String(value || 'rpg-reactor-app')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    return id || 'rpg-reactor-app';
}

function desktopValue(value, fallback) {
    const clean = String(value || fallback || '').replace(/[\r\n\0]+/g, ' ').trim();
    return clean || fallback || '';
}

function copyDirRecursive(source, destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, entry.name);
        const destinationPath = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(sourcePath, destinationPath);
        } else if (entry.isSymbolicLink()) {
            fs.symlinkSync(fs.readlinkSync(sourcePath), destinationPath);
        } else {
            const stats = fs.statSync(sourcePath);
            fs.copyFileSync(sourcePath, destinationPath);
            fs.chmodSync(destinationPath, stats.mode);
            fs.utimesSync(destinationPath, stats.atime, stats.mtime);
        }
    }
}

function prepareAppDir(options) {
    const appId = sanitizeAppId(options.appId || options.displayName);
    fs.rmSync(options.appDir, { recursive: true, force: true });
    fs.mkdirSync(options.appDir, { recursive: true });
    copyDirRecursive(options.sourceDir, options.appDir);

    fs.writeFileSync(path.join(options.appDir, 'AppRun'), [
        '#!/bin/sh',
        'HERE="${APPDIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"',
        'cd "$HERE" || exit 1',
        `exec "$HERE/${options.executable}" "$@"`,
        '',
    ].join('\n'));
    fs.chmodSync(path.join(options.appDir, 'AppRun'), '755');

    fs.writeFileSync(path.join(options.appDir, `${appId}.desktop`), [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        `Name=${desktopValue(options.displayName, 'RPG Reactor Application')}`,
        `Comment=${desktopValue(options.comment, 'RPG Reactor application')}`,
        `Exec=${appId}`,
        `Icon=${appId}`,
        'Terminal=false',
        `Categories=${desktopValue(options.categories, 'Game;')}`,
        `StartupWMClass=${desktopValue(options.startupWMClass, appId)}`,
        '',
    ].join('\n'));

    if (!options.iconPath || !fs.existsSync(options.iconPath)) {
        throw new Error('AppImage creation requires a PNG application icon.');
    }
    const rootIcon = path.join(options.appDir, `${appId}.png`);
    fs.copyFileSync(options.iconPath, rootIcon);
    fs.symlinkSync(`${appId}.png`, path.join(options.appDir, '.DirIcon'));
    const themeIcon = path.join(options.appDir, 'usr', 'share', 'icons', 'hicolor', '1024x1024', 'apps', `${appId}.png`);
    fs.mkdirSync(path.dirname(themeIcon), { recursive: true });
    fs.copyFileSync(options.iconPath, themeIcon);
    fs.copyFileSync(
        path.join(__dirname, 'appimage-runtime-LICENSE.txt'),
        path.join(options.appDir, 'appimage-runtime-LICENSE.txt'));
    return { appDir: options.appDir, appId };
}

async function createAppImage(options) {
    if (!supportsHost(options.hostPlatform, options.hostArch)) {
        throw new Error('AppImage creation is supported only on Linux x86_64 build hosts.');
    }
    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const appDir = path.join(os.tmpdir(), `rpgreactor-appdir-${nonce}`);
    const temporaryOutput = `${options.outputPath}.${nonce}.part`;
    try {
        prepareAppDir({ ...options, appDir });
        const tools = options.toolPath && options.runtimePath
            ? { tool: options.toolPath, runtime: options.runtimePath }
            : await acquireTools(options);
        const runTool = options.runTool || execFileSync;
        runTool(tools.tool, [
            '--appimage-extract-and-run',
            '--no-appstream',
            '--runtime-file', tools.runtime,
            appDir,
            temporaryOutput,
        ], {
            env: { ...process.env, ARCH: 'x86_64', VERSION: String(options.version || '1.0.0') },
            stdio: options.stdio || 'pipe',
        });
        if (!fs.existsSync(temporaryOutput)) {
            throw new Error('appimagetool completed without producing an AppImage.');
        }
        fs.chmodSync(temporaryOutput, '755');
        fs.rmSync(options.outputPath, { force: true });
        fs.renameSync(temporaryOutput, options.outputPath);
        return { outputPath: options.outputPath, sha256: sha256(options.outputPath) };
    } finally {
        fs.rmSync(appDir, { recursive: true, force: true });
        fs.rmSync(temporaryOutput, { force: true });
    }
}

module.exports = {
    ASSETS,
    acquireTools,
    cacheDirectories,
    createAppImage,
    prepareAppDir,
    sanitizeAppId,
    sha256,
    supportsHost,
};
