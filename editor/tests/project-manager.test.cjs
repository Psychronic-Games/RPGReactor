const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(repoRoot, '..');

function loadBrowserClass(filePath, className, globals = {}) {
    const source = fs.readFileSync(filePath, 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console,
        process,
        require,
        nw: {},
        ...globals
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
        ['../runtime/reactor_main.js', /RPG Reactor runtime version:\s*([\d.]+)/],
    ];

    for (const [relativePath, pattern] of sources) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.equal(source.match(pattern)?.[1], version, `${relativePath} uses the package version`);
    }
});

// Mirrors the required list in build-scripts/build-worker.js validateProjectRuntime.
const DEPLOYABLE_RUNTIME_FILES = [
    'reactor_main.js', 'reactor_core.js', 'reactor_managers.js',
    'reactor_objects.js', 'reactor_scenes.js', 'reactor_sprites.js', 'reactor_picture_extensions.js',
    'reactor_video_surfaces.js',
    'reactor_windows.js', 'reactor_mv_compat.js', 'reactor_plugins.js',
    path.join('libs', 'pixi.js'), path.join('libs', 'pixi_compat.js'),
    path.join('libs', 'pako.min.js'), path.join('libs', 'lz-string.js'), path.join('libs', 'localforage.min.js'),
    path.join('libs', 'effekseer.min.js'), path.join('libs', 'effekseer.wasm'),
    path.join('libs', 'vorbisdecoder.js'),
];

test('the bundled Demo carries the canonical runtime byte for byte', () => {
    // The Demo ships as the starter project and is opened in place, and
    // installRuntime is a manual menu action — nothing refreshes its js/ for the
    // user. When runtime/ moves ahead, the shipped Demo runs the older engine.
    const runtimeRoot = path.join(workspaceRoot, 'runtime');
    const demoJs = path.join(workspaceRoot, 'template', 'Demo', 'js');
    const drifted = [];
    const missing = [];

    const walk = (relativeDir) => {
        const sourceDir = path.join(runtimeRoot, relativeDir);
        for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
            const relativePath = path.join(relativeDir, entry.name);
            if (entry.isDirectory()) {
                walk(relativePath);
                continue;
            }
            // Each project owns its own plugin list; everything else is engine.
            if (relativePath === 'reactor_plugins.js') continue;
            const target = path.join(demoJs, relativePath);
            if (!fs.existsSync(target)) {
                missing.push(relativePath);
            } else if (!fs.readFileSync(path.join(runtimeRoot, relativePath)).equals(fs.readFileSync(target))) {
                drifted.push(relativePath);
            }
        }
    };
    walk('');

    assert.deepEqual(missing, [], `copy these runtime files into template/Demo/js:\n${missing.join('\n')}`);
    assert.deepEqual(drifted, [], `these Demo copies are behind runtime/:\n${drifted.join('\n')}`);
});

test('the bundled Demo satisfies the deployment runtime requirements', () => {
    // validateProjectRuntime throws on any missing entry, so a gap here means
    // Deploy Game fails on the flagship project that ships with every release.
    const demoRoot = path.join(workspaceRoot, 'template', 'Demo');
    assert.match(fs.readFileSync(path.join(demoRoot, 'index.html'), 'utf8'), /js\/reactor_main\.js/,
        'the Demo boots the Reactor runtime, so deployment validates its runtime files');

    const missing = DEPLOYABLE_RUNTIME_FILES.filter(
        file => !fs.existsSync(path.join(demoRoot, 'js', file)));
    assert.deepEqual(missing, [], `Deploy Game would reject the bundled Demo: missing ${missing.join(', ')}`);

    // reactor_main.js is the loader manifest; anything it lists must be present.
    const manifest = fs.readFileSync(path.join(demoRoot, 'js', 'reactor_main.js'), 'utf8');
    const listed = Array.from(manifest.matchAll(/"js\/([^"]+\.js)"/g), match => match[1]);
    assert.ok(listed.includes('reactor_picture_extensions.js'), 'the loader manifest lists the picture extensions');
    assert.ok(listed.includes('reactor_video_surfaces.js'), 'the loader manifest lists video surfaces');
    assert.ok(listed.includes('libs/lz-string.js'), 'the loader manifest lists LZString');
    const unloadable = listed.filter(file => !fs.existsSync(path.join(demoRoot, 'js', file)));
    assert.deepEqual(unloadable, [], `the Demo loader would 404 on: ${unloadable.join(', ')}`);
});

test('runtime corescript files are present', () => {
    const runtimeRoot = path.join(workspaceRoot, 'runtime');
    const runtimeFiles = [
        'reactor_core.js',
        'reactor_main.js',
        'reactor_managers.js',
        'reactor_objects.js',
        'reactor_picture_extensions.js',
        'reactor_video_surfaces.js',
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

test('opening a Reactor project refreshes its versioned runtime but preserves plugins', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-open-runtime-test-'));
    const runtimePath = path.join(tempRoot, 'runtime');
    const projectPath = path.join(tempRoot, 'Project');
    fs.mkdirSync(runtimePath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'index.html'), '<script src="js/reactor_main.js"></script>');
    fs.writeFileSync(path.join(projectPath, 'project.rpgreactor'), JSON.stringify({
        name: 'Existing',
        version: '0.98.0',
        engine: 'RPG Reactor',
        engineVersion: '0.98.0',
        imported: true,
        importedFrom: 'RPG Maker MZ'
    }));
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_main.js'),
        '// RPG Reactor runtime version: 0.98.0\n');
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_mv_compat.js'), 'stale filterArea translator');
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'var $plugins = [{ name: "KeepMe" }];');
    fs.writeFileSync(path.join(runtimePath, 'reactor_main.js'),
        '// RPG Reactor runtime version: 0.98.2\n');
    fs.writeFileSync(path.join(runtimePath, 'reactor_mv_compat.js'), 'current filterArea translator');
    fs.writeFileSync(path.join(runtimePath, 'reactor_plugins.js'), 'var $plugins = [];');

    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.98.2';
        const projectData = readJson(path.join(projectPath, 'project.rpgreactor'));

        const result = await manager.refreshReactorRuntime(projectPath, projectData);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), {
            ok: true,
            updated: true,
            fromVersion: '0.98.0',
            toVersion: '0.98.2'
        });
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_mv_compat.js'), 'utf8'),
            'current filterArea translator');
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'utf8'),
            'var $plugins = [{ name: "KeepMe" }];');
        assert.deepEqual(readJson(path.join(projectPath, 'project.rpgreactor')), {
            name: 'Existing',
            version: '0.98.2',
            engine: 'RPG Reactor',
            engineVersion: '0.98.2',
            imported: true,
            importedFrom: 'RPG Maker MZ',
            modified: projectData.modified
        });
        assert.equal((await manager.refreshReactorRuntime(projectPath, projectData)).updated, false,
            'a current project is not rewritten every time it opens');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('opening a same-version Reactor project refreshes an older runtime revision once', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-runtime-revision-test-'));
    const runtimePath = path.join(tempRoot, 'runtime');
    const projectPath = path.join(tempRoot, 'Project');
    fs.mkdirSync(runtimePath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'index.html'), '<script src="js/reactor_main.js"></script>');
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_main.js'),
        '// RPG Reactor runtime version: 0.98.4\n// RPG Reactor runtime revision: old\n');
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'var $plugins = [{ name: "KeepMe" }];');
    fs.writeFileSync(path.join(runtimePath, 'reactor_main.js'),
        '// RPG Reactor runtime version: 0.98.4\n// RPG Reactor runtime revision: current\n');
    fs.writeFileSync(path.join(runtimePath, 'reactor_plugins.js'), 'var $plugins = [];');

    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.98.4';
        const projectData = {
            name: 'Existing', version: '0.98.4', engine: 'RPG Reactor', engineVersion: '0.98.4'
        };
        assert.equal((await manager.refreshReactorRuntime(projectPath, projectData)).updated, true);
        assert.match(fs.readFileSync(path.join(projectPath, 'js', 'reactor_main.js'), 'utf8'),
            /runtime revision: current/);
        assert.equal(fs.readFileSync(path.join(projectPath, 'js', 'reactor_plugins.js'), 'utf8'),
            'var $plugins = [{ name: "KeepMe" }];');
        assert.equal((await manager.refreshReactorRuntime(projectPath, projectData)).updated, false);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('a failed runtime refresh leaves the revision marker stale so the next open retries', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-runtime-retry-test-'));
    const runtimePath = path.join(tempRoot, 'runtime');
    const projectPath = path.join(tempRoot, 'Project');
    fs.mkdirSync(runtimePath, { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'index.html'), '<script src="js/reactor_main.js"></script>');
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_main.js'),
        '// RPG Reactor runtime version: 0.98.4\n// RPG Reactor runtime revision: old\n');
    fs.writeFileSync(path.join(runtimePath, 'reactor_main.js'),
        '// RPG Reactor runtime version: 0.98.4\n// RPG Reactor runtime revision: current\n');
    fs.writeFileSync(path.join(runtimePath, 'reactor_sprites.js'), '// current sprites\n');

    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.98.4';
        const copyFileSync = manager.fs.copyFileSync.bind(manager.fs);
        manager.fs = {
            ...manager.fs,
            copyFileSync(source, target) {
                if (path.basename(source) === 'reactor_sprites.js') throw new Error('injected copy failure');
                copyFileSync(source, target);
            }
        };
        const projectData = {
            name: 'Existing', version: '0.98.4', engine: 'RPG Reactor', engineVersion: '0.98.4'
        };
        assert.equal((await manager.refreshReactorRuntime(projectPath, projectData)).ok, false);
        assert.match(fs.readFileSync(path.join(projectPath, 'js', 'reactor_main.js'), 'utf8'),
            /runtime revision: old/);

        manager.fs = fs;
        assert.equal((await manager.refreshReactorRuntime(projectPath, projectData)).updated, true);
        assert.match(fs.readFileSync(path.join(projectPath, 'js', 'reactor_main.js'), 'utf8'),
            /runtime revision: current/);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('project population refreshes the runtime before loading game data', () => {
    const controller = fs.readFileSync(path.join(repoRoot, 'src', 'ProjectController.js'), 'utf8');
    const start = controller.indexOf('async populateProjectUI()');
    const body = controller.slice(start, controller.indexOf('\n    async ', start + 20));
    assert.ok(body.indexOf('refreshReactorRuntime') >= 0);
    assert.ok(body.indexOf('refreshReactorRuntime') < body.indexOf('databaseManager.loadAllData'));
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
    const packagePath = path.join(projectPath, 'package.json');
    fs.writeFileSync(packagePath, '{ invalid package');

    try {
        const manager = new ProjectManager();
        manager.getRuntimePath = () => runtimePath;
        manager.getEngineVersion = () => '0.94.5';

        const invalidResult = await manager.installReactorRuntime(projectPath, 'Imported Game');
        assert.equal(invalidResult.ok, false);
        assert.match(invalidResult.error, /package\.json/);
        assert.equal(fs.existsSync(path.join(projectPath, 'js', 'rmmz_core.js')), true,
            'invalid package metadata is rejected before runtime conversion');
        assert.equal(fs.existsSync(path.join(projectPath, 'rpgmaker-runtime-backup.zip')), false);

        fs.writeFileSync(packagePath, JSON.stringify({
            name: '',
            main: '',
            'js-flags': '--expose-gc',
            window: { title: '', toolbar: false, width: 816, height: 624 }
        }));
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
        const repairedPackage = readJson(packagePath);
        assert.equal(repairedPackage.main, 'index.html');
        assert.equal(repairedPackage['js-flags'], '--expose-gc');
        assert.equal(repairedPackage.window.toolbar, false);
        assert.equal(repairedPackage.window.width, 816);
        assert.deepEqual(Array.from(result.package.repaired), ['name', 'main']);

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
        const starShiftMain = fs.readFileSync(path.join(workspaceRoot, 'template', 'Star Shift Rebellion', 'js', 'reactor_main.js'), 'utf8');
        assert.ok(starShiftMain.indexOf('js/libs/lz-string.js') < starShiftMain.indexOf('js/reactor_mv_compat.js'),
            'the converted MV template loads its legacy save decoder before compatibility');
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
    const quietConsole = { ...console, error: () => {} };
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager', { console: quietConsole });
    const packageJson = readJson(path.join(repoRoot, 'package.json'));
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-rmmz-test-'));
    const projectPath = path.join(tempRoot, '吞食天地 #2（测试）');

    fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'game.rmmzproject'), 'RPGMZ 1.0.0');
    const mapInfosPath = path.join(projectPath, 'data', 'MapInfos.json');
    fs.writeFileSync(mapInfosPath, '\uFEFF' + JSON.stringify([null, { id: 1, name: '皇宫' }]));

    const previousCwd = process.cwd();
    process.chdir(repoRoot);
    try {
        const manager = new ProjectManager();
        const nativeFs = manager.fs;
        let mapInfoReads = 0;
        manager.fs = Object.create(nativeFs);
        manager.fs.readFileSync = (filePath, ...args) => {
            if (filePath === mapInfosPath && mapInfoReads++ === 0) return '[null,{';
            return nativeFs.readFileSync(filePath, ...args);
        };
        const projectData = await manager.loadProject(projectPath);

        assert.equal(projectData.name, '吞食天地 #2（测试）');
        assert.equal(projectData.version, packageJson.version);
        assert.equal(projectData.engineVersion, packageJson.version);
        assert.equal(projectData.imported, true);
        assert.equal(projectData.importedFrom, 'RPG Maker MZ');
        assert.equal(projectData.maps.length, 2);
        assert.equal(projectData.maps[0], null);
        assert.equal(projectData.maps[1].name, '皇宫');
        assert.equal(mapInfoReads, 2, 'a transient partial MapInfos read is retried');

        nativeFs.writeFileSync(path.join(projectPath, 'project.rpgreactor'),
            '\uFEFF' + JSON.stringify({ name: '元数据项目', imported: true }));
        const metadataProject = await manager.loadProject(projectPath);
        assert.equal(metadataProject.name, '元数据项目', 'BOM-prefixed Reactor metadata loads');

        nativeFs.writeFileSync(mapInfosPath, '[null,{');
        assert.equal(await manager.loadProject(projectPath), null);
        assert.equal(manager.lastLoadError.filePath, mapInfosPath);
        assert.match(manager.lastLoadError.message, /MapInfos\.json/);
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('ProjectManager can create a blank project beside the Demo template', async () => {
    const ProjectManager = loadBrowserClass(path.join(repoRoot, 'src', 'ProjectManager.js'), 'ProjectManager');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-test-'));
    const targetPath = path.join(tempRoot, 'Blank RPG');
    const previousCwd = process.cwd();
    process.chdir(repoRoot);
    try {
        const manager = new ProjectManager();
        assert.ok(manager.getTemplateProjectPath(), 'the Demo template is available, so blank is a real choice');
        assert.equal(await manager.createNewProject(targetPath, 'Blank RPG', { blank: true }), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'index.html')), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'js', 'libs', 'pixi.js')), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'data', 'Map001.json')), true);
        assert.equal(fs.existsSync(path.join(targetPath, 'data', 'Map002.json')), false, 'no Demo maps were copied');
        const mapInfos = readJson(path.join(targetPath, 'data', 'MapInfos.json')).filter(Boolean);
        assert.equal(mapInfos.length, 1, 'a blank project starts with one map');
        const system = readJson(path.join(targetPath, 'data', 'System.json'));
        assert.equal(system.gameTitle, 'Blank RPG');
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
