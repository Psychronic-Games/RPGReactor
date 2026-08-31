/**
 * On the web host, binary project files are not synchronously readable until
 * fetched once — and the Effekseer loader reads an effect plus its textures
 * synchronously mid-decode. The contract: the host can warm a directory into
 * the sync cache, the loader throws a retryable `rrWebWarming` miss while
 * that runs, and the preview layer retries quietly when the warm-up lands.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const srcRoot = path.resolve(__dirname, '..', 'src');
const animationEditorSource = fs.readFileSync(
    path.join(srcRoot, 'database', 'DatabaseAnimationEditor.js'), 'utf8');

function loadEffectLoader(fakeFs) {
    const start = animationEditorSource.indexOf('function RR_loadEffekseerEffectFromFile');
    const end = animationEditorSource.indexOf('\n}\n', start) + 3;
    assert.ok(start >= 0 && end > start, 'the loader function can be extracted');
    const context = {
        require: name => {
            if (name === 'fs') return fakeFs;
            if (name === 'path') return path;
            throw new Error('unexpected require: ' + name);
        },
        console,
        setTimeout: () => 0,
        clearTimeout: () => {}
    };
    vm.runInNewContext(
        animationEditorSource.slice(start, end) + ';globalThis.__loader = RR_loadEffekseerEffectFromFile;',
        context);
    return context.__loader;
}

test('a web sync miss throws a retryable warming error and warms the folder once', async () => {
    let warmups = 0;
    const loader = loadEffectLoader({
        readFileSync() { throw new Error('Web project file is not preloaded for synchronous access'); },
        preloadForSync: async dir => { warmups++; return dir; }
    });
    const boom = id => assert.throws(
        () => loader({}, `/project/effects/Core${id}.efkefc`, 1.0, null, null),
        error => error.rrWebWarming === true && typeof error.rrWarming.then === 'function');
    boom(1);
    boom(2);
    await Promise.resolve();
    assert.equal(warmups, 1, 'every miss shares one warm-up');
});

test('without a warming host the original error surfaces', () => {
    const loader = loadEffectLoader({
        readFileSync() { throw new Error('ENOENT: no such file'); }
    });
    assert.throws(() => loader({}, '/project/effects/Core.efkefc', 1.0, null, null),
        error => !error.rrWebWarming && /ENOENT/.test(error.message));
});

test('the host warms directories and the preview layer retries on the warming signal', () => {
    const webHost = fs.readFileSync(path.join(srcRoot, 'web', 'WebHost.js'), 'utf8');
    assert.match(webHost, /async preloadForSync\(dirPath\)/);
    const previewLayer = fs.readFileSync(path.join(srcRoot, 'utils', 'AnimationPreviewLayer.js'), 'utf8');
    assert.match(previewLayer, /error\.rrWebWarming/);
    assert.match(previewLayer, /error\.rrWarming\.then/);
});
