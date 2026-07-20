const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const appImage = require(path.join(editorRoot, 'build-scripts', 'appimage-utils.js'));

test('AppImage staging preserves payloads and writes portable metadata', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-appdir-'));
    try {
        const sourceDir = path.join(root, 'source with spaces');
        const appDir = path.join(root, 'AppDir');
        fs.mkdirSync(sourceDir, { recursive: true });
        fs.writeFileSync(path.join(sourceDir, 'Game'), '#!/bin/sh\n');
        fs.chmodSync(path.join(sourceDir, 'Game'), '755');
        fs.writeFileSync(path.join(sourceDir, 'library.so.1'), 'library');
        fs.symlinkSync('library.so.1', path.join(sourceDir, 'library.so'));

        appImage.prepareAppDir({
            sourceDir,
            appDir,
            executable: 'Game',
            displayName: 'Example\nGame',
            appId: 'Example Game',
            iconPath: path.join(editorRoot, 'images', 'icon.png'),
            comment: 'Portable game',
            categories: 'Game;',
            startupWMClass: 'example-game',
        });

        assert.equal(fs.statSync(path.join(appDir, 'AppRun')).mode & 0o111, 0o111);
        assert.equal(fs.statSync(path.join(appDir, 'Game')).mode & 0o111, 0o111);
        assert.equal(fs.readlinkSync(path.join(appDir, 'library.so')), 'library.so.1');
        assert.equal(fs.readlinkSync(path.join(appDir, '.DirIcon')), 'example-game.png');
        assert.equal(fs.existsSync(path.join(appDir, 'usr', 'share', 'icons', 'hicolor', '1024x1024', 'apps', 'example-game.png')), true);
        assert.equal(fs.existsSync(path.join(appDir, 'appimage-runtime-LICENSE.txt')), true);
        const desktop = fs.readFileSync(path.join(appDir, 'example-game.desktop'), 'utf8');
        assert.match(desktop, /^Name=Example Game$/m);
        assert.match(desktop, /^Exec=example-game$/m);
        assert.match(desktop, /^StartupWMClass=example-game$/m);
        assert.doesNotMatch(desktop, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        const appRun = fs.readFileSync(path.join(appDir, 'AppRun'), 'utf8');
        assert.match(appRun, /exec "\$HERE\/Game" "\$@"/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('AppImage creation invokes tooling without a shell and replaces output atomically', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-appimage-create-'));
    try {
        const sourceDir = path.join(root, 'source');
        const outputPath = path.join(root, 'Example-linux-x64.AppImage');
        fs.mkdirSync(sourceDir);
        fs.writeFileSync(path.join(sourceDir, 'Game'), '#!/bin/sh\n');
        fs.chmodSync(path.join(sourceDir, 'Game'), '755');
        let invocation = null;

        const result = await appImage.createAppImage({
            sourceDir,
            outputPath,
            executable: 'Game',
            displayName: 'Example',
            appId: 'example',
            iconPath: path.join(editorRoot, 'images', 'icon.png'),
            version: '1.2.3',
            toolPath: '/fake/appimagetool',
            runtimePath: '/fake/runtime-x86_64',
            runTool(tool, args, options) {
                invocation = { tool, args, options };
                assert.equal(fs.existsSync(path.join(args.at(-2), 'AppRun')), true);
                fs.writeFileSync(args.at(-1), 'appimage fixture');
            },
        });

        assert.equal(invocation.tool, '/fake/appimagetool');
        assert.deepEqual(invocation.args.slice(0, 4), [
            '--appimage-extract-and-run', '--no-appstream', '--runtime-file', '/fake/runtime-x86_64',
        ]);
        assert.equal(invocation.options.env.ARCH, 'x86_64');
        assert.equal(invocation.options.env.VERSION, '1.2.3');
        assert.equal(fs.readFileSync(outputPath, 'utf8'), 'appimage fixture');
        assert.equal(result.sha256, appImage.sha256(outputPath));
        assert.equal(fs.statSync(outputPath).mode & 0o111, 0o111);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('AppImage tooling rejects unsupported hosts and unverified downloads', async () => {
    const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'appimage-utils.js'), 'utf8');
    assert.match(source, /verification\.json/);

    await assert.rejects(() => appImage.createAppImage({
        hostPlatform: 'win32',
        hostArch: 'x64',
    }), /only on Linux x86_64/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-appimage-cache-'));
    try {
        await assert.rejects(() => appImage.acquireTools({
            cacheDirectories: [root],
            async download(_url, destination) {
                fs.writeFileSync(destination, 'unverified');
            },
        }), /SHA-256 verification failed/);
        assert.equal(fs.existsSync(path.join(root, appImage.ASSETS.tool.name)), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('both deployment dialogs pass optional Linux AppImage settings to workers', () => {
    const buildSource = fs.readFileSync(path.join(editorRoot, 'src', 'BuildManager.js'), 'utf8');
    const distSource = fs.readFileSync(path.join(editorRoot, 'src', 'DistEditorManager.js'), 'utf8');
    const gameWorker = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'build-worker.js'), 'utf8');
    const distWorker = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'dist-editor-worker.js'), 'utf8');

    for (const source of [buildSource, distSource]) {
        assert.match(source, /Also create Linux AppImage/);
        assert.match(source, /createLinuxAppImage/);
        assert.match(source, /process\.platform === 'linux' && process\.arch === 'x64'/);
        assert.match(source, /(?:option|appImageOption)\.style\.display = .*linuxSelected \? 'flex' : 'none'/,
            'the AppImage sub-option is hidden until Linux is selected');
    }
    assert.ok(
        buildSource.indexOf('id="build-platform-linux"') < buildSource.indexOf('id="build-appimage-option"') &&
        buildSource.indexOf('id="build-appimage-option"') < buildSource.indexOf('id="build-platform-web"'),
        'Deploy Game nests AppImage directly below Linux');
    assert.ok(
        distSource.indexOf('id="dist-platform-linux"') < distSource.indexOf('id="dist-appimage-option"') &&
        distSource.indexOf('id="dist-appimage-option"') < distSource.indexOf('id="dist-platform-win"'),
        'Deploy Editor nests AppImage directly below Linux');
    assert.match(gameWorker, /safeFolderName}-linux-x64\.AppImage/);
    assert.match(distWorker, /RPGReactor-v\$\{appVersion\}-linux-x64\.AppImage/);
    assert.match(distWorker, /createdArtifacts\.add\(result\.outputPath\)/);
    assert.match(distWorker, /const files = \[\.\.\.createdArtifacts\]/);
    assert.match(distWorker, /crypto\.createHash\('sha256'\)/);
});
