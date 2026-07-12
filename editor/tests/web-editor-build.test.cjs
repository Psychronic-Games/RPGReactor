const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('Deploy Editor exposes a provider-neutral Web package', () => {
    const manager = read('src/DistEditorManager.js');
    const worker = read('build-scripts/dist-editor-worker.js');

    assert.match(manager, /value="web"/);
    assert.match(manager, />Web<\/div>/);
    assert.match(worker, /packageType === 'web'/);
    assert.match(worker, /RPGReactor-v\$\{appVersion\}-web\.zip/);
    assert.doesNotMatch(`${manager}\n${worker}`, /itch\.io|web-demo|Web Demo/i);
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
