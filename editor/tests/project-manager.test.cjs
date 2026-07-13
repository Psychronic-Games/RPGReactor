const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

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

test('application version matches package metadata in every startup surface', () => {
    const version = readJson(path.join(repoRoot, 'package.json')).version;
    const sources = [
        ['src/I18nManager.js', /const RR_APP_VERSION = '([^']+)'/],
        ['index.html', /RPG Reactor v([\d.]+)/],
        ['src/web/WebHost.js', /version: '([^']+)'/],
    ];

    for (const [relativePath, pattern] of sources) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.equal(source.match(pattern)?.[1], version, `${relativePath} uses the package version`);
    }
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

test('ProjectManager refreshes template runtime files while preserving its plugin configuration', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-template-runtime-test-'));
    const templatePath = path.join(tempRoot, 'template');
    const runtimePath = path.join(tempRoot, 'runtime');
    const targetPath = path.join(tempRoot, 'Target');
    fs.mkdirSync(path.join(templatePath, 'js'), { recursive: true });
    fs.mkdirSync(path.join(templatePath, 'data'), { recursive: true });
    fs.mkdirSync(runtimePath, { recursive: true });
    fs.writeFileSync(path.join(templatePath, 'project.rpgreactor'), JSON.stringify({ name: 'Old' }));
    fs.writeFileSync(path.join(templatePath, 'package.json'), JSON.stringify({ name: 'old', window: {} }));
    fs.writeFileSync(path.join(templatePath, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Old' }));
    fs.writeFileSync(path.join(templatePath, 'js', 'reactor_core.js'), 'stale runtime');
    fs.writeFileSync(path.join(templatePath, 'js', 'reactor_plugins.js'), 'var $plugins = [{ name: "DemoPlugin" }];');
    fs.writeFileSync(path.join(runtimePath, 'reactor_main.js'), 'current main');
    fs.writeFileSync(path.join(runtimePath, 'reactor_core.js'), 'current runtime');
    fs.writeFileSync(path.join(runtimePath, 'reactor_plugins.js'), 'var $plugins = [];');

    try {
        const manager = new ProjectManager();
        manager.getTemplateProjectPath = () => templatePath;
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.94.3';
        assert.equal(await manager.createNewProject(targetPath, 'Synced Template'), true);
        assert.equal(fs.readFileSync(path.join(targetPath, 'js', 'reactor_core.js'), 'utf8'), 'current runtime');
        assert.equal(
            fs.readFileSync(path.join(targetPath, 'js', 'reactor_plugins.js'), 'utf8'),
            'var $plugins = [{ name: "DemoPlugin" }];'
        );
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('ProjectManager avoids rmmz-game for new project package identity', () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const manager = new ProjectManager();

    assert.equal(manager.getProjectPackageName('RMMZ Game'), 'rpg-reactor-game');
    assert.equal(manager.getStarterPackage('RMMZ Game', '1.2.3').name, 'rpg-reactor-game');
    assert.equal(manager.getStarterPackage('Original Game', '1.2.3').name, 'original-game');
});

test('ProjectManager installs the Reactor runtime and quarantines the old corescript into a zip', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-install-runtime-test-'));
    const runtimePath = path.join(tempRoot, 'runtime');
    const projectPath = path.join(tempRoot, 'ImportedGame');
    fs.mkdirSync(path.join(runtimePath, 'libs'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js', 'libs'), { recursive: true });
    fs.writeFileSync(path.join(runtimePath, 'reactor_main.js'), 'reactor main');
    fs.writeFileSync(path.join(runtimePath, 'reactor_core.js'), 'reactor core');
    fs.writeFileSync(path.join(runtimePath, 'reactor_plugins.js'), 'var $plugins = [];');
    fs.writeFileSync(path.join(runtimePath, 'libs', 'pixi.js'), 'reactor pixi');
    fs.writeFileSync(path.join(projectPath, 'game.rmmzproject'), 'RPGMZ 1.0.0');
    const mzIndex = '<html><body><script type="text/javascript" src="js/main.js"></script></body></html>';
    fs.writeFileSync(path.join(projectPath, 'index.html'), mzIndex);
    fs.writeFileSync(path.join(projectPath, 'js', 'main.js'), 'mz bootstrap');
    fs.writeFileSync(path.join(projectPath, 'js', 'rmmz_core.js'), 'mz core');
    fs.writeFileSync(path.join(projectPath, 'js', 'libs', 'pixi.js'), 'mz pixi');
    fs.writeFileSync(path.join(projectPath, 'js', 'libs', 'pako.min.js'), 'mz pako');
    const mzPlugins = 'var $plugins = [{ "name": "VisuMZ_0_CoreEngine", "status": true }];';
    fs.writeFileSync(path.join(projectPath, 'js', 'plugins.js'), mzPlugins);

    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.94.5';

        const result = await manager.installReactorRuntime(projectPath, 'Imported Game');
        assert.equal(result.ok, true);
        assert.equal(result.archivedTo, 'rpgmaker-runtime-backup.zip');
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_main.js'), 'utf8'), 'reactor main');
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'libs', 'pixi.js'), 'utf8'), 'reactor pixi');
        assert.equal(fs.existsSync(path.join(projectPath, 'js', 'main.js')), false, 'MZ bootstrap leaves js/');
        assert.equal(fs.existsSync(path.join(projectPath, 'js', 'rmmz_core.js')), false, 'MZ corescript leaves js/');
        assert.equal(fs.existsSync(path.join(projectPath, 'js', 'libs', 'pako.min.js')), false, 'MZ libs leave js/libs');
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'utf8'), mzPlugins,
            'the Reactor plugin manifest is seeded from the imported plugins.js');
        const installedIndex = fs.readFileSync(path.join(projectPath, 'index.html'), 'utf8');
        assert.match(installedIndex, /js\/reactor_main\.js/);
        assert.match(installedIndex, /window\.\$reactorMvCompat = false/,
            'MZ imports ship with the MV compatibility layer disabled');
        assert.equal(readJson(path.join(projectPath, 'package.json')).name, 'imported-game');

        const zipPath = path.join(projectPath, 'rpgmaker-runtime-backup.zip');
        execFileSync('unzip', ['-t', zipPath], { stdio: 'pipe' });
        const listing = execFileSync('unzip', ['-l', zipPath], { encoding: 'utf8' });
        for (const archived of ['js/main.js', 'js/rmmz_core.js', 'js/libs/pixi.js', 'js/libs/pako.min.js', 'index.html']) {
            assert.match(listing, new RegExp(archived.replace(/[./]/g, '\\$&')), `${archived} is archived`);
        }
        assert.doesNotMatch(listing, /plugins\.js/, 'plugin files stay in the project');
        const extractDir = path.join(tempRoot, 'extract');
        execFileSync('unzip', ['-q', zipPath, '-d', extractDir]);
        assert.equal(fs.readFileSync(path.join(extractDir, 'index.html'), 'utf8'), mzIndex);
        assert.equal(fs.readFileSync(path.join(extractDir, 'js', 'libs', 'pixi.js'), 'utf8'), 'mz pixi');

        // Re-installing updates engine files without re-archiving the Reactor
        // runtime, and preserves a customized manifest unless a rebuild is requested.
        fs.writeFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'var $plugins = [/* custom */];');
        const reinstall = await manager.installReactorRuntime(projectPath, 'Imported Game');
        assert.equal(reinstall.ok, true);
        assert.equal(reinstall.archivedTo, null);
        assert.equal(fs.existsSync(path.join(projectPath, 'rpgmaker-runtime-backup-2.zip')), false);
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'utf8'),
            'var $plugins = [/* custom */];');
        assert.equal((await manager.installReactorRuntime(projectPath, 'Imported Game', { regenerateManifest: true })).ok, true);
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'utf8'), mzPlugins);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('MV imports get the MV compatibility flag and the runtime gates on it', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-mv-flag-test-'));
    const runtimePath = path.join(tempRoot, 'runtime');
    const projectPath = path.join(tempRoot, 'MvGame');
    fs.mkdirSync(runtimePath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js'), { recursive: true });
    fs.writeFileSync(path.join(runtimePath, 'reactor_main.js'), 'reactor main');
    fs.writeFileSync(path.join(runtimePath, 'reactor_plugins.js'), 'var $plugins = [];');
    fs.writeFileSync(path.join(projectPath, 'Game.rpgproject'), 'RPGMV 1.6.1');
    fs.writeFileSync(path.join(projectPath, 'index.html'),
        '<html><body><script type="text/javascript" src="js/rpg_core.js"></script></body></html>');
    fs.writeFileSync(path.join(projectPath, 'js', 'rpg_core.js'), 'mv core');

    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.94.5';
        assert.equal((await manager.installReactorRuntime(projectPath, 'MV Game')).ok, true);
        assert.match(fs.readFileSync(path.join(projectPath, 'index.html'), 'utf8'),
            /window\.\$reactorMvCompat = true/,
            'MV imports ship with the MV compatibility layer enabled');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    const compatSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    assert.match(compatSource, /\$reactorMvCompat/, 'runtime reads the explicit flag');
    assert.match(compatSource, /MV game semantics dormant/, 'MV semantics stay dormant for MZ-format games');
    assert.match(compatSource, /if \(mvGameSemantics\) \{[\s\S]*?installWindowMetricsCompatibility\(\)/,
        'MV window metrics only install for MV games');
    assert.match(compatSource, /installMVApiGapFills\(\)/, 'MV plugin API support installs unconditionally');
    const starShiftIndex = path.join(workspaceRoot, 'template', 'Star Shift Rebellion', 'index.html');
    if (fs.existsSync(starShiftIndex)) {
        assert.match(fs.readFileSync(starShiftIndex, 'utf8'), /window\.\$reactorMvCompat = true/,
            'the MV template opts in explicitly so deploys keep the mode');
    }
});

test('deploy staging keys Reactor validation off index.html and guides recovery', () => {
    for (const relativePath of ['build-scripts/build.js', 'build-scripts/build-worker.js']) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.match(source, /reactor_main\\\.js/, `${relativePath} detects the runtime from index.html`);
        assert.match(source, /Install Reactor Runtime/, `${relativePath} error names the recovery action`);
        assert.match(source, /rpgmaker-runtime-backup\(-\\d\+\)\?\\\.zip/, `${relativePath} excludes the runtime backup zip from staging`);
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
