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
const appVersion = JSON.parse(read('package.json')).version;

function webMenuRule(styles) {
    const match = styles.match(/html\.rr-web #html-menu-bar\s*\{([^}]*)\}/);
    assert.ok(match, 'web menu-bar rule is present');
    return match[1];
}

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
    assert.match(worker, /prepareBundledStarter\(stageRoot\)/);
    assert.match(worker, /refreshStarterRuntime\(path\.join\(stageRoot, 'runtime'\)/);
    assert.match(worker, /path\.join\('template', 'Demo'\)/);
    assert.doesNotMatch(worker, /execSync\(/);
    assert.doesNotMatch(`${manager}\n${worker}`, /itch\.io|web-demo|Web Demo/i);
});

test('web distribution uses the bundled Demo, staged runtime, and current artifact checksums', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-web-editor-'));
    const staleArchive = path.join(outputDir, 'stale-from-previous-run.zip');
    fs.writeFileSync(staleArchive, 'stale');
    try {
        const result = await runWebDistribution(outputDir);
        assert.equal(result.success, true);

        const archive = path.join(outputDir, `RPGReactor-v${appVersion}-web.zip`);
        const firstHash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
        const archivedManagers = execFileSync('unzip', ['-p', archive, 'project/js/reactor_managers.js']);
        assert.deepEqual(archivedManagers, fs.readFileSync(path.resolve(editorRoot, '..', 'runtime', 'reactor_managers.js')));
        const archived3D = execFileSync('unzip', ['-p', archive, 'project/js/reactor_3d.js']);
        assert.deepEqual(archived3D, fs.readFileSync(path.resolve(editorRoot, '..', 'runtime', 'reactor_3d.js')));
        const archivedThree = execFileSync(
            'unzip', ['-p', archive, 'project/js/libs/three.js'], { maxBuffer: 4 * 1024 * 1024 });
        assert.deepEqual(archivedThree, fs.readFileSync(path.resolve(editorRoot, '..', 'runtime', 'libs', 'three.js')));
        const plugins = execFileSync('unzip', ['-p', archive, 'project/js/reactor_plugins.js'], { encoding: 'utf8' });
        assert.equal(plugins, fs.readFileSync(path.resolve(
            editorRoot, '..', 'template', 'Demo', 'js', 'reactor_plugins.js'), 'utf8'));
        const metadata = JSON.parse(execFileSync('unzip', ['-p', archive, 'project/project.rpgreactor'], { encoding: 'utf8' }));
        assert.equal(metadata.name, 'Reactor One');
        assert.ok(execFileSync(
            'unzip',
            ['-p', archive, 'project/audio/bgm/Psychronic - Acoustic Circuits.ogg'],
            { maxBuffer: 4 * 1024 * 1024 }
        ).length > 0);
        // Some browser-game storefronts cap uploads at 1000 files. The
        // build never blocks on the count — it reports it and warns past
        // 1000 — while the trim keeps dead library weight out of the zip.
        const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
            .split('\n').filter(line => line && !line.endsWith('/'));
        assert.ok(entries.length > 0, 'archive is not empty');
        const workerSource = read(path.join('build-scripts', 'dist-editor-worker.js'));
        assert.match(workerSource, /outputFiles\.length > 1000/, 'over-1000 warning exists');
        assert.match(workerSource, /warn, never block/i, 'file count warns instead of blocking');
        assert.ok(entries.some(line => line === 'project/img/battlehud/Face_1.png'),
            'faces for defined actors survive the trim');
        assert.ok(!entries.some(line => line === 'project/img/battlehud/Face_286.png'),
            'faces for undefined actors are trimmed');
        const notices = execFileSync('unzip', ['-p', archive, 'THIRD_PARTY_NOTICES.md'], { encoding: 'utf8' });
        assert.match(notices, /stb_vorbis Basis/);
        assert.match(notices, /Vitaly Puzrin and Andrei Tuputcyn/);
        assert.match(notices, /ALTERNATIVE B - Public Domain/);
        const webHtml = execFileSync('unzip', ['-p', archive, 'index.html'], { encoding: 'utf8' });
        const webStyles = execFileSync('unzip', ['-p', archive, 'css/styles.css'], { encoding: 'utf8' });
        assert.match(webHtml, /id="html-menu-bar"/);
        assert.match(webHtml, /id="submenu-file"/);
        assert.doesNotMatch(webHtml, /<script[^>]+three\.js/, 'three.js remains lazy in the Web editor');
        assert.match(webMenuRule(webStyles), /overflow:\s*visible/);
        assert.match(webMenuRule(webStyles), /flex-wrap:\s*wrap/);

        const sums = fs.readFileSync(path.join(outputDir, 'SHA256SUMS.txt'), 'utf8');
        assert.ok(sums.includes(path.basename(archive)));
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
    const menuRule = webMenuRule(styles);
    assert.match(menuRule, /overflow:\s*visible/);
    assert.match(menuRule, /flex-wrap:\s*wrap/);
    assert.doesNotMatch(menuRule, /overflow-[xy]:/);
});
