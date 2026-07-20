const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { Worker } = require('node:worker_threads');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

function runWebDistribution(outputDir) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(editorRoot, 'build-scripts', 'dist-editor-worker.js'), {
            workerData: {
                appRoot: editorRoot,
                platforms: [],
                packageType: 'web',
                edition: 'normal',
                nwVersion: '0.113.0',
                outputDir,
            }
        });
        worker.on('message', message => {
            if (message.type === 'done') resolve(message);
        });
        worker.on('error', reject);
        worker.on('exit', code => {
            if (code !== 0) reject(new Error(`distribution worker exited with code ${code}`));
        });
    });
}

test('Deploy Editor exposes a provider-neutral Web package', () => {
    const manager = read('src/DistEditorManager.js');
    const worker = read('build-scripts/dist-editor-worker.js');

    assert.match(manager, /value="web"/);
    assert.match(manager, />\$\{tt\('Web'\)\}<\/div>/);
    assert.match(worker, /packageType === 'web'/);
    assert.match(worker, /RPGReactor-v\$\{appVersion\}-web\.zip/);
    assert.match(worker, /generateCleanStarter\(stageRoot\)/);
    assert.match(worker, /refreshStarterRuntime\(path\.join\(stageRoot, 'runtime'\)/);
    assert.doesNotMatch(worker, /templateCandidates|copyDirRecursive\(templateSrc/);
    assert.doesNotMatch(worker, /execSync\(/);
    assert.doesNotMatch(`${manager}\n${worker}`, /itch\.io|web-demo|Web Demo/i);
});

test('web distribution uses the generated staged runtime and checksums only current artifacts', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-web-editor-'));
    const staleArchive = path.join(outputDir, 'stale-from-previous-run.zip');
    fs.writeFileSync(staleArchive, 'stale');
    try {
        const result = await runWebDistribution(outputDir);
        assert.equal(result.success, true);

        const archive = path.join(outputDir, 'RPGReactor-v0.95.0-web.zip');
        const firstHash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
        const archivedManagers = execFileSync('unzip', ['-p', archive, 'project/js/reactor_managers.js']);
        assert.deepEqual(archivedManagers, fs.readFileSync(path.resolve(editorRoot, '..', 'runtime', 'reactor_managers.js')));
        const plugins = execFileSync('unzip', ['-p', archive, 'project/js/reactor_plugins.js'], { encoding: 'utf8' });
        assert.equal(plugins, 'var $plugins = [];\n');
        const metadata = JSON.parse(execFileSync('unzip', ['-p', archive, 'project/project.rpgreactor'], { encoding: 'utf8' }));
        assert.equal(metadata.starter, 'generated-clean');
        assert.match(execFileSync('unzip', ['-p', archive, 'THIRD_PARTY_NOTICES.md'], { encoding: 'utf8' }), /stb_vorbis Basis/);
        assert.match(execFileSync('unzip', ['-p', archive, 'THIRD_PARTY_LICENSES/pako-MIT.txt'], { encoding: 'utf8' }), /Vitaly Puzrin/);

        const sums = fs.readFileSync(path.join(outputDir, 'SHA256SUMS.txt'), 'utf8');
        assert.match(sums, /RPGReactor-v0\.95\.0-web\.zip/);
        assert.doesNotMatch(sums, /stale-from-previous-run/);
        assert.equal(fs.existsSync(staleArchive), true, 'unrelated old output is not deleted or checksummed');

        assert.equal((await runWebDistribution(outputDir)).success, true);
        const secondHash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
        assert.equal(secondHash, firstHash, 'web archive is reproducible from tracked staged inputs');
    } finally {
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
});

test('Web package and browser host use a root-scoped saved-file overlay', () => {
    const worker = read('build-scripts/dist-editor-worker.js');
    const host = read('src/web/WebHost.js');
    const bootstrap = read('src/web/WebBootstrap.js');
    const serviceWorker = read('src/web/service-worker.js');

    assert.match(worker, /path\.join\(webRoot, 'service-worker\.js'\)/);
    assert.match(worker, /patchWebProject\(path\.join\(webRoot, 'project'\)\)/);
    assert.match(worker, /CharacterGenerator\/procgen\/outfit_engine\.js/);
    assert.match(worker, /CharacterGenerator\/procgen\/hair_engine\.js/);
    assert.match(worker, /characterStyleScripts/);
    assert.match(host, /mode: 'web'/);
    assert.match(host, /register\('service-worker\.js', \{ scope: '\.\/' \}\)/);
    assert.match(host, /openPlaytest/);
    assert.match(host, /resetProject/);
    assert.match(host, /installFileUrlBridge\(this\)/);
    assert.match(host, /new Proxy\(NativeAudio/);
    assert.match(host, /async saveFile\(/);
    assert.match(host, /async saveFiles\(/);
    assert.match(host, /showSaveFilePicker/);
    assert.match(host, /showDirectoryPicker/);
    assert.match(host, /rr-web-sw-reload/);
    assert.match(serviceWorker, /\/project\//);
    assert.match(serviceWorker, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
    assert.equal(host.match(/const DB_NAME = '([^']+)'/)[1], serviceWorker.match(/const DB_NAME = '([^']+)'/)[1]);

    assert.doesNotThrow(() => new Function(host));
    assert.doesNotThrow(() => new Function(bootstrap));
    assert.doesNotThrow(() => new Function(serviceWorker));
});

test('Web editor applies responsive layout without changing desktop sizing', () => {
    const host = read('src/web/WebHost.js');
    const styles = read('css/styles.css');

    assert.match(host, /document\.documentElement\.classList\.add\('rr-web'\)/);
    assert.match(host, /banner\.className = 'rr-web-save-banner'/);
    assert.match(styles, /html\.rr-web #sidebar/);
    assert.match(styles, /@media \(max-width: 900px\)/);
    assert.match(styles, /@media \(max-width: 600px\)/);
    assert.match(styles, /@media \(max-height: 650px\)/);
    assert.doesNotMatch(styles, /(?<!rr-web )#editor-ui\s*\{\s*flex-direction:\s*column/);
});
