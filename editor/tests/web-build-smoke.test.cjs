const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Worker } = require('node:worker_threads');

const editorRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(editorRoot, '..');

function loadProjectManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nProjectManager;`, { console, process, require, nw: {} });
}

function runWebBuild(projectPath, outputDir, projectName) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(editorRoot, 'build-scripts', 'build-worker.js'), {
            workerData: {
                projectPath,
                projectName,
                platforms: ['web'],
                outputDir,
                nwVersion: '0.92.0',
                runtimeSource: 'bundled',
                appRoot: editorRoot
            }
        });
        worker.on('message', (message) => {
            if (message.type === 'done') resolve(message);
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`build worker exited with code ${code}`));
        });
    });
}

test('web deployment packages a generated project without development saves or backups', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-web-build-'));
    const projectPath = path.join(tempRoot, 'Web Smoke');
    const outputDir = path.join(tempRoot, 'output');
    fs.cpSync(path.join(workspaceRoot, 'runtime'), path.join(tempRoot, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify({ version: '0.94.3' }));

    const previousCwd = process.cwd();
    try {
        process.chdir(tempRoot);
        assert.equal(await new (loadProjectManager())().createNewProject(projectPath, 'Web Smoke'), true);
        fs.mkdirSync(path.join(projectPath, 'save'));
        fs.writeFileSync(path.join(projectPath, 'save', 'file1.rmmzsave'), 'development save');
        fs.mkdirSync(path.join(projectPath, 'BACKUP'));
        fs.writeFileSync(path.join(projectPath, 'BACKUP', 'Map001.json'), '{}');
        fs.writeFileSync(path.join(projectPath, 'Game.rpgproject'), 'RPGMV 1.6.2');
        fs.mkdirSync(path.join(projectPath, 'img', 'save'));
        fs.writeFileSync(path.join(projectPath, 'img', 'save', 'keep.txt'), 'legitimate nested asset');

        const result = await runWebBuild(projectPath, outputDir, 'Web Smoke');

        assert.equal(result.success, true);
        const webRoot = path.join(outputDir, 'Web Smoke-web');
        const required = [
            'index.html',
            'data/System.json',
            'data/Map001.json',
            'js/reactor_main.js',
            'js/reactor_mv_compat.js',
            'js/libs/effekseer.wasm'
        ];
        for (const relativePath of required) {
            assert.equal(fs.existsSync(path.join(webRoot, relativePath)), true, `${relativePath} is packaged`);
        }
        assert.equal(fs.existsSync(path.join(webRoot, 'save')), false);
        assert.equal(fs.existsSync(path.join(webRoot, 'BACKUP')), false);
        assert.equal(fs.existsSync(path.join(webRoot, 'project.rpgreactor')), false);
        assert.equal(fs.existsSync(path.join(webRoot, 'game.rmmzproject')), false);
        assert.equal(fs.existsSync(path.join(webRoot, 'Game.rpgproject')), false);
        assert.equal(fs.existsSync(path.join(webRoot, 'img', 'save', 'keep.txt')), true);
    } finally {
        process.chdir(previousCwd);
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('web deployment still accepts an imported raw MV project', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-mv-web-build-'));
    const projectPath = path.join(tempRoot, 'Raw MV');
    const outputDir = path.join(tempRoot, 'output');
    fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'Game.rpgproject'), 'RPGMV 1.6.2');
    fs.writeFileSync(path.join(projectPath, 'project.rpgreactor'), JSON.stringify({
        name: 'Raw MV',
        engine: 'RPG Reactor',
        imported: true,
        importedFrom: 'RPG Maker MV'
    }));
    fs.writeFileSync(path.join(projectPath, 'index.html'), '<script src="js/rpg_core.js"></script>');
    fs.writeFileSync(path.join(projectPath, 'js', 'rpg_core.js'), '// MV runtime');
    fs.writeFileSync(path.join(projectPath, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Raw MV' }));
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
        name: 'raw-mv',
        version: '1.0.0',
        main: 'index.html',
        window: { title: 'Raw MV' }
    }));

    try {
        const result = await runWebBuild(projectPath, outputDir, 'Raw MV');
        assert.equal(result.success, true);
        const webRoot = path.join(outputDir, 'Raw MV-web');
        assert.equal(fs.existsSync(path.join(webRoot, 'js', 'rpg_core.js')), true);
        assert.equal(fs.existsSync(path.join(webRoot, 'Game.rpgproject')), false);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('web deployment rejects a damaged Reactor runtime with no entrypoint', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-broken-web-build-'));
    const projectPath = path.join(tempRoot, 'Broken Reactor');
    const outputDir = path.join(tempRoot, 'output');
    fs.mkdirSync(path.join(projectPath, 'data'), { recursive: true });
    fs.mkdirSync(path.join(projectPath, 'js'), { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'project.rpgreactor'), '{}');
    fs.writeFileSync(path.join(projectPath, 'js', 'reactor_core.js'), '// incomplete Reactor runtime');
    fs.writeFileSync(path.join(projectPath, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Broken Reactor' }));
    fs.writeFileSync(path.join(projectPath, 'package.json'), JSON.stringify({
        name: 'broken-reactor',
        main: 'index.html',
        window: { title: 'Broken Reactor' }
    }));

    try {
        const result = await runWebBuild(projectPath, outputDir, 'Broken Reactor');
        assert.equal(result.success, false);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
