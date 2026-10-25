// Deploy Game: a game ships the normal NW.js build (never the editor's SDK), its macOS bundle carries
// its own name and identifier, and images and audio can be encrypted in RPG Maker MZ's format.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const nwRuntime = require(path.join(editorRoot, 'build-scripts', 'nw-runtime-utils.js'));
const gameIdentity = require(path.join(editorRoot, 'build-scripts', 'game-identity.js'));
const encryption = require(path.join(editorRoot, 'build-scripts', 'asset-encryption.js'));

function writeX64Elf(filePath) {
    const elf = Buffer.alloc(64);
    elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
    elf.writeUInt16LE(62, 18);
    fs.writeFileSync(filePath, elf);
    fs.chmodSync(filePath, '755');
}

function writeX64MachO(filePath) {
    const macho = Buffer.alloc(64);
    macho.writeUInt32LE(0xfeedfacf, 0);
    macho.writeUInt32LE(0x01000007, 4);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, macho);
    fs.chmodSync(filePath, '755');
}

function runBuild(workerData) {
    return new Promise((resolve, reject) => {
        const logs = [];
        const worker = new Worker(path.join(editorRoot, 'build-scripts', 'build-worker.js'), { workerData });
        worker.on('message', message => {
            if (message.type === 'log') logs.push(message.message);
            if (message.type === 'done') resolve({ ...message, logs });
        });
        worker.on('error', reject);
        worker.on('exit', code => { if (code !== 0) reject(new Error(`build worker exited with code ${code}`)); });
    });
}

function makeProject(root, title, pkgName = 'rmmz-game') {
    const projectPath = path.join(root, 'project');
    fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({ name: pkgName, main: 'index.html', version: '1.2.0' }));
    fs.writeFileSync(path.join(projectPath, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(projectPath, 'data', 'System.json'), JSON.stringify({ gameTitle: title, hasEncryptedImages: false, hasEncryptedAudio: false, encryptionKey: '' }));
    return projectPath;
}

const NW_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>nwjs</string>
	<key>CFBundleExecutable</key>
	<string>nwjs</string>
	<key>CFBundleIdentifier</key>
	<string>io.nwjs.nwjs</string>
	<key>CFBundleName</key>
	<string>nwjs</string>
	<key>CFBundleShortVersionString</key>
	<string>144.0.7559.59</string>
</dict>
</plist>
`;

test('an SDK runtime is known by its marker or by the tools only the SDK carries', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forge-deploy-sdk-'));
    try {
        assert.equal(nwRuntime.isSdkRuntime(root), false);
        fs.writeFileSync(path.join(root, 'nwjc'), '');
        assert.equal(nwRuntime.isSdkRuntime(root), true);
        fs.writeFileSync(path.join(root, '.rpg-reactor-nw-runtime.json'), JSON.stringify({ edition: 'normal' }));
        assert.equal(nwRuntime.isSdkRuntime(root), false, 'the marker decides when there is one');
        fs.writeFileSync(path.join(root, '.rpg-reactor-nw-runtime.json'), JSON.stringify({ edition: 'sdk' }));
        assert.equal(nwRuntime.isSdkRuntime(root), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Automatic skips a bundled SDK runtime and ships the normal build from the cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forge-deploy-sdkskip-'));
    try {
        const appRoot = path.join(root, 'editor');
        const bundled = path.join(appRoot, 'nwjs-linux');
        fs.mkdirSync(bundled, { recursive: true });
        writeX64Elf(path.join(bundled, 'nw'));
        for (const sdkOnly of ['nwjc', 'chromedriver']) fs.writeFileSync(path.join(bundled, sdkOnly), 'sdk');
        fs.writeFileSync(path.join(bundled, '.rpg-reactor-nw-runtime.json'), JSON.stringify({ version: '9.9.9', edition: 'sdk', platform: 'linux', arch: 'x64' }));
        const cache = path.join(appRoot, '.nw-cache');
        const runtimeParent = path.join(root, 'runtime-source');
        const runtimeDir = path.join(runtimeParent, 'nwjs-v9.9.9-linux-x64');
        fs.mkdirSync(runtimeDir, { recursive: true });
        fs.mkdirSync(cache, { recursive: true });
        writeX64Elf(path.join(runtimeDir, 'nw'));
        fs.writeFileSync(path.join(runtimeDir, 'normal-build.dat'), 'normal');
        execFileSync('tar', ['czf', path.join(cache, 'nwjs-v9.9.9-linux-x64.tar.gz'), '-C', runtimeParent, path.basename(runtimeDir)]);
        const projectPath = makeProject(root, 'Sdk Smoke');
        const outputDir = path.join(root, 'output');
        const result = await runBuild({
            projectPath, projectName: 'Sdk Smoke', platforms: ['linux'], outputDir,
            nwVersion: '9.9.9', nwVersionPolicy: 'editor', editorNwVersion: '9.9.9',
            runtimeSource: 'bundled', includeProprietaryCodecs: false, appRoot, releaseBuild: false,
        });
        assert.equal(result.success, true, result.logs.join('\n'));
        const gameRoot = path.join(outputDir, 'Sdk Smoke-linux-x64');
        assert.equal(fs.existsSync(path.join(gameRoot, 'normal-build.dat')), true, 'the normal archive is what ships');
        assert.equal(fs.existsSync(path.join(gameRoot, 'nwjc')), false);
        assert.equal(fs.existsSync(path.join(gameRoot, 'chromedriver')), false);
        assert.equal(JSON.parse(fs.readFileSync(path.join(gameRoot, '.rpg-reactor-nw-runtime.json'), 'utf8')).edition, 'normal');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('a game id comes from its package name when it has its own, else from its title', () => {
    assert.equal(gameIdentity.macBundleId('rmmz-game', 'Star Shift: Rebellion'), 'games.rpgreactor.star-shift-rebellion');
    assert.equal(gameIdentity.macBundleId('rpg-reactor-game', 'Reactor One'), 'games.rpgreactor.reactor-one');
    assert.equal(gameIdentity.macBundleId('my-quest', 'Anything'), 'games.rpgreactor.my-quest');
    assert.equal(gameIdentity.macBundleId('', 'Ünïcode Tale'), 'games.rpgreactor.unicode-tale');
    assert.match(gameIdentity.macBundleId('', '???'), /^games\.rpgreactor\.[a-z0-9-]+$/);
    assert.equal(gameIdentity.bundleVersion('1.2'), '1.2.0');
    assert.equal(gameIdentity.bundleVersion('2.0.1-beta'), '2.0.1');
    assert.equal(gameIdentity.bundleVersion(''), '1.0.0');
});

test('the macOS bundle is named after the game, with its own identifier', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forge-deploy-mac-'));
    try {
        const appRoot = path.join(root, 'editor');
        const cache = path.join(appRoot, '.nw-cache');
        fs.mkdirSync(cache, { recursive: true });
        const source = path.join(root, 'mac-source');
        const inner = path.join(source, 'nwjs-v9.9.9-osx-x64');
        const contents = path.join(inner, 'nwjs.app', 'Contents');
        writeX64MachO(path.join(contents, 'MacOS', 'nwjs'));
        fs.writeFileSync(path.join(contents, 'Info.plist'), NW_PLIST);
        fs.mkdirSync(path.join(contents, 'Resources', 'en.lproj'), { recursive: true });
        fs.writeFileSync(path.join(contents, 'Resources', 'en.lproj', 'InfoPlist.strings'),
            '"Chromium Shortcut" = "Chromium Shortcut";\nCFBundleGetInfoString = "nwjs 144.0.7559.59, Copyright 2026 The Chromium Authors.";\n');
        fs.mkdirSync(path.join(contents, 'Resources', 'ja.lproj'), { recursive: true });
        fs.writeFileSync(path.join(contents, 'Resources', 'ja.lproj', 'InfoPlist.strings'),
            Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('CFBundleGetInfoString = "nwjs";\n', 'utf16le')]));
        execFileSync('zip', ['-qr', path.join(cache, 'nwjs-v9.9.9-osx-x64.zip'), path.basename(inner)], { cwd: source });
        const projectPath = makeProject(root, 'Reactor One', 'rpg-reactor-game');
        const outputDir = path.join(root, 'output');
        const result = await runBuild({
            projectPath, projectName: 'Reactor One', platforms: ['mac'], outputDir,
            nwVersion: '9.9.9', nwVersionPolicy: 'exact', editorNwVersion: '9.9.9',
            runtimeSource: 'download', includeProprietaryCodecs: false, appRoot, releaseBuild: false,
        });
        assert.equal(result.success, true, result.logs.join('\n'));
        const app = path.join(outputDir, 'Reactor One-osx-x64', 'Game.app', 'Contents');
        const plist = fs.readFileSync(path.join(app, 'Info.plist'), 'utf8');
        const value = key => (new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist) || [])[1];
        assert.equal(value('CFBundleName'), 'Reactor One');
        assert.equal(value('CFBundleDisplayName'), 'Reactor One');
        assert.equal(value('CFBundleIdentifier'), 'games.rpgreactor.reactor-one');
        assert.equal(value('CFBundleShortVersionString'), '1.2.0');
        assert.equal(value('CFBundleExecutable'), 'nwjs', 'the executable inside keeps its file name');
        assert.doesNotMatch(plist, /io\.nwjs\.nwjs/);
        assert.match(fs.readFileSync(path.join(app, 'Resources', 'en.lproj', 'InfoPlist.strings'), 'utf8'), /CFBundleGetInfoString = "Reactor One";/);
        const ja = fs.readFileSync(path.join(app, 'Resources', 'ja.lproj', 'InfoPlist.strings'));
        assert.deepEqual([...ja.subarray(0, 2)], [0xff, 0xfe], 'a UTF-16 strings file stays UTF-16');
        assert.match(ja.subarray(2).toString('utf16le'), /CFBundleGetInfoString = "Reactor One";/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

function runtimeDecrypt(keyHex, bytes) {
    // The game's own decryption, as it runs.
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const start = core.indexOf('Utils.decryptArrayBuffer = function');
    const end = core.indexOf('};', start) + 2;
    const context = { Utils: { _encryptionKey: keyHex } };
    vm.createContext(context);
    vm.runInContext(core.slice(start, end), context);
    const buffer = new Uint8Array(bytes).buffer;
    return Buffer.from(context.Utils.decryptArrayBuffer(buffer));
}

test('encryption writes MZ\'s format: header, first 16 bytes keyed, .png_ / .ogg_, flags and key in System.json', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forge-deploy-enc-'));
    try {
        const projectPath = makeProject(root, 'Locked Box');
        const png = fs.readFileSync(path.join(editorRoot, 'images', 'icon.png'));
        const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(60, 7)]);
        fs.mkdirSync(path.join(projectPath, 'img', 'system'), { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'audio', 'se'), { recursive: true });
        fs.mkdirSync(path.join(projectPath, 'img', 'materials'), { recursive: true });
        fs.writeFileSync(path.join(projectPath, 'img', 'system', 'Window.png'), png);
        fs.writeFileSync(path.join(projectPath, 'img', 'materials', 'grass.json'), '{}');
        fs.writeFileSync(path.join(projectPath, 'audio', 'se', 'Cursor1.ogg'), ogg);
        const outputDir = path.join(root, 'output');
        const result = await runBuild({
            projectPath, projectName: 'Locked Box', platforms: ['web'], outputDir,
            nwVersion: '9.9.9', nwVersionPolicy: 'exact', editorNwVersion: '9.9.9', runtimeSource: 'download',
            assetEncryption: { images: true, audio: true, keyText: 'open sesame' }, appRoot: path.join(root, 'editor'), releaseBuild: false,
        });
        assert.equal(result.success, true, result.logs.join('\n'));
        const game = path.join(outputDir, 'Locked Box-web');
        const key = encryption.normalizeKey('open sesame');
        const system = JSON.parse(fs.readFileSync(path.join(game, 'data', 'System.json'), 'utf8'));
        assert.deepEqual([system.hasEncryptedImages, system.hasEncryptedAudio, system.encryptionKey], [true, true, key]);
        assert.equal(fs.existsSync(path.join(game, 'img', 'system', 'Window.png')), false);
        const window = fs.readFileSync(path.join(game, 'img', 'system', 'Window.png_'));
        assert.equal(window.subarray(0, 16).toString('hex'), '5250474d560000000003010000000000');
        assert.deepEqual(runtimeDecrypt(key, window), png, 'the game decrypts it to the original');
        assert.deepEqual(runtimeDecrypt(key, fs.readFileSync(path.join(game, 'audio', 'se', 'Cursor1.ogg_'))), ogg);
        assert.equal(fs.existsSync(path.join(game, 'img', 'materials', 'grass.json')), true, 'data beside the pictures stays as it is');
        const project = JSON.parse(fs.readFileSync(path.join(projectPath, 'data', 'System.json'), 'utf8'));
        assert.equal(project.hasEncryptedImages, false, 'the project itself is not changed');
        assert.ok(fs.existsSync(path.join(projectPath, 'img', 'system', 'Window.png')));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the key: typed text as MD5, a project\'s own key, kept for files already encrypted', () => {
    assert.equal(encryption.normalizeKey('d41d8cd98f00b204e9800998ecf8427e'.toUpperCase()), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.equal(encryption.normalizeKey(''), 'd41d8cd98f00b204e9800998ecf8427e');
    const own = '0123456789abcdef0123456789abcdef';
    assert.equal(encryption.resolveKey({ keyText: 'x', system: { encryptionKey: own } }), encryption.normalizeKey('x'));
    assert.equal(encryption.resolveKey({ keyText: '', system: { encryptionKey: own } }), own);
    assert.equal(encryption.resolveKey({ keyText: 'x', system: { encryptionKey: own, hasEncryptedImages: true } }), own,
        'a project shipping encrypted files keeps their key');
    assert.equal(encryption.resolveKey({ keyText: '', system: {}, gameTitle: 'A' }), encryption.resolveKey({ keyText: '', system: {}, gameTitle: 'A' }));
    assert.notEqual(encryption.resolveKey({ keyText: '', system: {}, gameTitle: 'A' }), encryption.resolveKey({ keyText: '', system: {}, gameTitle: 'B' }));
    const sample = Buffer.from('0123456789abcdefXYZ');
    assert.deepEqual(encryption.decryptBuffer(encryption.encryptBuffer(sample, own), own), sample);
});

test('the deploy dialog offers encryption and hands it to the build', () => {
    const manager = fs.readFileSync(path.join(editorRoot, 'src', 'BuildManager.js'), 'utf8');
    for (const id of ['build-encrypt-images', 'build-encrypt-audio', 'build-encryption-key']) assert.ok(manager.includes(`id="${id}"`), id);
    assert.match(manager, /assetEncryption,\n\s*createLinuxAppImage,/);
    const prefs = require(path.join(editorRoot, 'src', 'DeploymentAssetPreferences.js'));
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    prefs.saveEncryption({ images: true, audio: false, keyText: 'secret' }, storage);
    assert.deepEqual({ ...prefs.loadEncryption(storage) }, { images: true, audio: false, keyText: '' }, 'the key is never remembered across projects');
});
