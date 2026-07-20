const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const PlaytestManager = require(path.join(editorRoot, 'src', 'PlaytestManager.js'));

test('playtest profiles are isolated from deployed games on every desktop platform', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-playtest-profile-'));
    const firstProject = path.join(root, 'First Game');
    const secondProject = path.join(root, 'Second Game');
    fs.mkdirSync(firstProject);
    fs.mkdirSync(secondProject);
    try {
        const manager = new PlaytestManager();
        for (const platform of ['win32', 'darwin', 'linux']) {
            const options = { platform, baseDir: path.join(root, platform), nwVersion: '0.113.0' };
            const first = manager.resolvePlaytestUserDataDir(path, fs, firstProject, options);
            const repeated = manager.resolvePlaytestUserDataDir(path, fs, firstProject, options);
            const second = manager.resolvePlaytestUserDataDir(path, fs, secondProject, options);
            assert.equal(first, repeated, `${platform} keeps a stable profile for the same project`);
            assert.notEqual(first, second, `${platform} separates different projects`);
            assert.equal(fs.existsSync(first), true);
            assert.match(first, /RPGReactor[\\/]PlaytestProfile[\\/]nwjs-0\.113\.0[\\/][a-f0-9]{16}$/);
        }

        const windowsTest = manager.resolvePlaytestUserDataDir(path, fs, firstProject, {
            platform: 'win32',
            baseDir: path.join(root, 'win32-mode'),
            nwVersion: '0.107.0',
            optionToken: 'test'
        });
        assert.match(windowsTest, /[a-f0-9]{16}&test$/);
        assert.equal(fs.existsSync(windowsTest), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('playtest launches pass the source project to universal profile isolation', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'PlaytestManager.js'), 'utf8');
    assert.match(source, /optionToken: process\.platform === 'win32' \? mode : null/);
    assert.match(source, /platform === 'darwin'[\s\S]*?XDG_CONFIG_HOME/,
        'Linux and macOS receive explicit Reactor-owned profile roots');
    assert.match(source, /rpg-reactor-playtest-profile/,
        'profile isolation has a writable temporary fallback');
    assert.match(source, /if \(this\.playtestProcess === child\) this\.playtestProcess = null/g,
        'stale child callbacks must not clear a newer playtest process');
    assert.match(source, /ensureProjectPackageMetadata\(projectPath\)/,
        'desktop playtest validates package metadata before spawning NW.js');
    const mainSource = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(mainSource, /new PlaytestManager\(this\.projectManager\)/,
        'the application supplies the package validator to playtest and battle test');

    const expectedError = 'Cannot use /project/package.json: invalid JSON';
    const manager = new PlaytestManager({
        ensureProjectPackageMetadata: () => ({ ok: false, error: expectedError })
    });
    manager.resolveNwExecutable = () => { throw new Error('spawn path must not be reached'); };
    const originalError = console.error;
    try {
        console.error = () => {};
        assert.equal(manager.launchPlaytestWindow('/project'), false);
    } finally {
        console.error = originalError;
    }
    assert.equal(manager.lastLaunchError, expectedError);
});
