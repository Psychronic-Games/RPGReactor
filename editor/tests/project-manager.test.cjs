const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');

function loadBrowserClass(filePath, className) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console,
        process,
        require,
        nw: {}
    });
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('package-lock version matches package version', () => {
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const packageLock = readJson(path.join(repoRoot, 'package-lock.json'));

    assert.equal(packageLock.version, packageJson.version);
    assert.equal(packageLock.packages[''].version, packageJson.version);
});

test('runtime corescript files are present', () => {
    const runtimeRoot = path.join(workspaceRoot, 'runtime');
    const runtimeFiles = [
        'reactor_core.js',
        'reactor_main.js',
        'reactor_managers.js',
        'reactor_objects.js',
        'reactor_plugins.js',
        'reactor_scenes.js',
        'reactor_sprites.js',
        'reactor_windows.js',
        path.join('libs', 'pixi.js'),
        path.join('libs', 'pixi_compat.js')
    ];

    for (const runtimeFile of runtimeFiles) {
        assert.equal(fs.existsSync(path.join(runtimeRoot, runtimeFile)), true, `${runtimeFile} exists`);
    }
});

test('ProjectManager creates projects from the Demo template with current engine metadata', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-test-'));
    const targetPath = path.join(tempRoot, 'My Test RPG');

    const previousCwd = process.cwd();
    process.chdir(repoRoot);
    try {
        const manager = new ProjectManager();
        const created = await manager.createNewProject(targetPath, 'My Test RPG');

        assert.equal(created, true);
        assert.equal(fs.existsSync(path.join(targetPath, 'index.html')), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'data', 'System.json')), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'Barebones')), false);
        assert.equal(fs.existsSync(path.join(targetPath, 'Complex')), false);
        assert.equal(fs.existsSync(path.join(targetPath, 'Demo')), false);
        assert.equal(fs.existsSync(path.join(targetPath, 'template')), false);
        assert.equal(fs.existsSync(path.join(targetPath, 'js', 'reactor_plugins.js')), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'js', 'libs', 'pixi.js')), true);

        const projectData = readJson(path.join(targetPath, 'project.rpgreactor'));
        assert.equal(projectData.name, 'My Test RPG');
        assert.equal(projectData.version, packageJson.version);
        assert.equal(projectData.engineVersion, packageJson.version);
        assert.equal(projectData.imported, undefined);

        const gamePackage = readJson(path.join(targetPath, 'package.json'));
        assert.equal(gamePackage.name, 'my-test-rpg');
        assert.equal(gamePackage.version, packageJson.version);
        assert.equal(gamePackage.window.title, 'My Test RPG');

        const systemData = readJson(path.join(targetPath, 'data', 'System.json'));
        assert.equal(systemData.gameTitle, 'My Test RPG');
        assert.equal(systemData.startMapId, 1);
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('ProjectManager falls back to generated starter projects when Demo template is missing', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-fallback-test-'));
    const targetPath = path.join(tempRoot, 'Fallback RPG');

    fs.cpSync(path.join(workspaceRoot, 'runtime'), path.join(tempRoot, 'runtime'), { recursive: true });
    fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(tempRoot, 'package.json'));

    const previousCwd = process.cwd();
    process.chdir(tempRoot);
    try {
        const manager = new ProjectManager();
        const created = await manager.createNewProject(targetPath, 'Fallback RPG');

        assert.equal(created, true);
        assert.equal(fs.existsSync(path.join(targetPath, 'js', 'reactor_plugins.js')), true);

        const projectData = readJson(path.join(targetPath, 'project.rpgreactor'));
        assert.equal(projectData.name, 'Fallback RPG');
        assert.equal(projectData.version, packageJson.version);
        assert.equal(projectData.engineVersion, packageJson.version);

        const systemData = readJson(path.join(targetPath, 'data', 'System.json'));
        assert.equal(systemData.gameTitle, 'Fallback RPG');
        assert.equal(systemData.startMapId, 1);
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('ProjectManager imports RPG Maker projects with current engine metadata', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-rmmz-test-'));
    const projectPath = path.join(tempRoot, 'ImportedGame');

    fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'game.rmmzproject'), 'RPGMZ 1.0.0');
    fs.writeFileSync(path.join(projectPath, 'data', 'MapInfos.json'), JSON.stringify([null]));

    const previousCwd = process.cwd();
    process.chdir(repoRoot);
    try {
        const manager = new ProjectManager();
        const projectData = await manager.loadProject(projectPath);

        assert.equal(projectData.name, 'ImportedGame');
        assert.equal(projectData.version, packageJson.version);
        assert.equal(projectData.engineVersion, packageJson.version);
        assert.equal(projectData.imported, true);
        assert.equal(projectData.importedFrom, 'RPG Maker MZ');
        assert.equal(projectData.maps.length, 1);
        assert.equal(projectData.maps[0], null);
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
