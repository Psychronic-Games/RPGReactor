const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

const editorRoot = path.resolve(__dirname, '..');
const nwCodec = require(path.join(editorRoot, 'build-scripts', 'nw-codec-utils.js'));

function runBuild(workerData) {
    return new Promise((resolve, reject) => {
        const logs = [];
        const worker = new Worker(path.join(editorRoot, 'build-scripts', 'build-worker.js'), { workerData });
        worker.on('message', message => {
            if (message.type === 'log') logs.push(message.message);
            if (message.type === 'done') resolve({ ...message, logs });
        });
        worker.on('error', reject);
        worker.on('exit', code => {
            if (code !== 0) reject(new Error(`build worker exited with code ${code}`));
        });
    });
}

test('desktop deployment reuses an exact archive from the second cache root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-desktop-cache-'));
    try {
        const appRoot = path.join(root, 'editor');
        const projectPath = path.join(root, 'project');
        const outputDir = path.join(root, 'output');
        const firstCache = path.join(appRoot, '.nw-cache');
        const secondCache = path.join(root, '.nw-cache');
        const codecCache = path.join(root, '.nw-codec-cache');
        fs.mkdirSync(firstCache, { recursive: true });
        fs.mkdirSync(secondCache, { recursive: true });
        fs.mkdirSync(codecCache, { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'icon'), { recursive: true });
        fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ name: 'raw-mv', main: 'index.html' }));
        fs.writeFileSync(path.join(projectPath, 'index.html'), '<!doctype html>');
        fs.writeFileSync(path.join(projectPath, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Cache Smoke' }));
        fs.copyFileSync(path.join(editorRoot, 'images', 'icon.png'), path.join(projectPath, 'icon', 'icon.png'));

        const fakeAppImageTool = path.join(root, 'fake-appimagetool');
        const fakeAppImageRuntime = path.join(root, 'fake-runtime-x86_64');
        fs.writeFileSync(fakeAppImageTool, '#!/bin/sh\nfor last; do :; done\nprintf appimage-fixture > "$last"\n');
        fs.writeFileSync(fakeAppImageRuntime, 'runtime fixture');
        fs.chmodSync(fakeAppImageTool, '755');

        const runtimeParent = path.join(root, 'runtime-source');
        const runtimeDir = path.join(runtimeParent, 'nwjs-v9.9.9-linux-x64');
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.writeFileSync(path.join(runtimeDir, 'nw'), '#!/bin/sh\n');
        fs.chmodSync(path.join(runtimeDir, 'nw'), '755');
        execFileSync('tar', ['czf', path.join(secondCache, 'nwjs-v9.9.9-linux-x64.tar.gz'), '-C', runtimeParent, path.basename(runtimeDir)]);

        const codecSource = path.join(root, 'codec-source');
        const codecArchive = path.join(codecCache, '9.9.9-linux-x64.zip');
        fs.mkdirSync(codecSource);
        fs.writeFileSync(path.join(codecSource, 'libffmpeg.so'), 'verified proprietary codec');
        execFileSync('zip', ['-q', codecArchive, 'libffmpeg.so'], { cwd: codecSource });
        fs.writeFileSync(path.join(codecCache, 'release-9.9.9.json'), JSON.stringify({
            tag_name: '9.9.9',
            assets: [{
                name: '9.9.9-linux-x64.zip',
                browser_download_url: 'https://invalid.example/should-not-download',
                digest: `sha256:${nwCodec.sha256(codecArchive)}`,
            }],
        }));

        const result = await runBuild({
            projectPath,
            projectName: 'Cache Smoke',
            platforms: ['linux'],
            outputDir,
            nwVersion: '9.9.9',
            nwVersionPolicy: 'exact',
            editorNwVersion: '0.107.0',
            runtimeSource: 'download',
            includeProprietaryCodecs: true,
            createLinuxAppImage: true,
            appImageToolPath: fakeAppImageTool,
            appImageRuntimePath: fakeAppImageRuntime,
            appRoot,
        });

        assert.equal(result.success, true, result.logs.join('\n'));
        const gameRoot = path.join(outputDir, 'Cache Smoke-linux-x64');
        assert.equal(fs.existsSync(path.join(gameRoot, 'Game')), true);
        assert.equal(fs.existsSync(path.join(gameRoot, 'package.nw', 'index.html')), true);
        assert.equal(fs.readFileSync(path.join(gameRoot, 'lib', 'libffmpeg.so'), 'utf8'), 'verified proprietary codec');
        assert.equal(JSON.parse(fs.readFileSync(path.join(gameRoot, 'rpg-reactor-codec.json'), 'utf8')).nwVersion, '9.9.9');
        assert.equal(fs.readFileSync(path.join(outputDir, 'Cache Smoke-linux-x64.AppImage'), 'utf8'), 'appimage-fixture');
        assert.equal(fs.existsSync(path.join(gameRoot, 'Game')), true, 'the existing Linux folder remains available');
        assert.equal(fs.readdirSync(firstCache).length, 0, 'the first cache remains untouched');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('packaged flat runtime does not recursively copy an output below the editor directory', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-flat-runtime-'));
    try {
        const appRoot = path.join(root, 'packaged-editor');
        const projectPath = path.join(root, 'project');
        const outputDir = path.join(appRoot, 'dist');
        fs.mkdirSync(appRoot, { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
        fs.writeFileSync(path.join(appRoot, 'nw'), '#!/bin/sh\n');
        fs.writeFileSync(path.join(appRoot, 'RPGReactor'), 'branded editor');
        fs.writeFileSync(path.join(appRoot, 'icudtl.dat'), 'runtime data');
        fs.mkdirSync(path.join(appRoot, 'unrelated-user-files'));
        fs.writeFileSync(path.join(appRoot, 'notes.txt'), 'not part of NW.js');
        fs.chmodSync(path.join(appRoot, 'nw'), '755');
        fs.chmodSync(path.join(appRoot, 'RPGReactor'), '755');
        fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ name: 'raw-mv', main: 'index.html' }));
        fs.writeFileSync(path.join(projectPath, 'index.html'), '<!doctype html>');
        fs.writeFileSync(path.join(projectPath, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Flat Smoke' }));

        const result = await runBuild({
            projectPath,
            projectName: 'Flat Smoke',
            platforms: ['linux'],
            outputDir,
            nwVersion: '0.107.0',
            nwVersionPolicy: 'editor',
            editorNwVersion: '0.107.0',
            runtimeSource: 'bundled',
            appRoot,
            editorExecPath: path.join(appRoot, 'RPGReactor'),
        });

        assert.equal(result.success, true, result.logs.join('\n'));
        const gameRoot = path.join(outputDir, 'Flat Smoke-linux-x64');
        assert.equal(fs.existsSync(path.join(gameRoot, 'Game')), true);
        assert.equal(fs.existsSync(path.join(gameRoot, 'icudtl.dat')), true);
        assert.equal(fs.existsSync(path.join(gameRoot, 'dist')), false, 'output directory is excluded from runtime copying');
        assert.equal(fs.existsSync(path.join(gameRoot, 'unrelated-user-files')), false);
        assert.equal(fs.existsSync(path.join(gameRoot, 'notes.txt')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('specific NW.js version overrides a mismatched packaged runtime in Automatic mode', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-exact-runtime-'));
    try {
        const appRoot = path.join(root, 'packaged-editor');
        const projectPath = path.join(root, 'project');
        const outputDir = path.join(root, 'output');
        const cache = path.join(root, '.nw-cache');
        fs.mkdirSync(appRoot, { recursive: true });
        fs.mkdirSync(cache);
        fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
        fs.writeFileSync(path.join(appRoot, 'nw'), '#!/bin/sh\n');
        fs.writeFileSync(path.join(appRoot, 'RPGReactor'), 'editor 0.107.0');
        fs.writeFileSync(path.join(appRoot, 'icudtl.dat'), 'local runtime');
        fs.chmodSync(path.join(appRoot, 'nw'), '755');
        fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ name: 'raw-mv', main: 'index.html' }));
        fs.writeFileSync(path.join(projectPath, 'index.html'), '<!doctype html>');
        fs.writeFileSync(path.join(projectPath, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Exact Smoke' }));

        const runtimeParent = path.join(root, 'runtime-source');
        const runtimeDir = path.join(runtimeParent, 'nwjs-v9.9.9-linux-x64');
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.writeFileSync(path.join(runtimeDir, 'nw'), '#!/bin/sh\n');
        fs.writeFileSync(path.join(runtimeDir, 'exact-runtime.dat'), '9.9.9');
        fs.chmodSync(path.join(runtimeDir, 'nw'), '755');
        execFileSync('tar', ['czf', path.join(cache, 'nwjs-v9.9.9-linux-x64.tar.gz'), '-C', runtimeParent, path.basename(runtimeDir)]);

        const result = await runBuild({
            projectPath,
            projectName: 'Exact Smoke',
            platforms: ['linux'],
            outputDir,
            nwVersion: '9.9.9',
            nwVersionPolicy: 'exact',
            editorNwVersion: '0.107.0',
            runtimeSource: 'bundled',
            appRoot,
            editorExecPath: path.join(appRoot, 'RPGReactor'),
        });

        assert.equal(result.success, true, result.logs.join('\n'));
        const gameRoot = path.join(outputDir, 'Exact Smoke-linux-x64');
        assert.equal(fs.readFileSync(path.join(gameRoot, 'exact-runtime.dat'), 'utf8'), '9.9.9');
        assert.equal(fs.existsSync(path.join(gameRoot, 'icudtl.dat')), false, 'mismatched local runtime is not used');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
