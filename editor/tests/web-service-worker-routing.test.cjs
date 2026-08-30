const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(editorRoot, 'src', 'web', 'service-worker.js'), 'utf8');
const hostSource = fs.readFileSync(path.join(editorRoot, 'src', 'web', 'WebHost.js'), 'utf8');

/**
 * Loads the worker with a stub `self`, capturing its listeners and exposing the
 * routing helper so the shipped code is what gets exercised.
 */
function loadWorker(scope) {
    const listeners = new Map();
    const sandbox = {
        self: {
            registration: { scope },
            addEventListener: (type, handler) => listeners.set(type, handler),
            skipWaiting() {}, clients: { claim() {} }
        },
        indexedDB: { open: () => ({}) },
        URL, Response: class {}, Promise, console: { warn() {} },
        fetch: async () => ({ stub: true })
    };
    vm.runInNewContext(`${workerSource}\nglobalThis.__projectRelativePath = projectRelativePath; globalThis.__contentType = contentType;`, sandbox);
    return { relativePath: sandbox.__projectRelativePath, contentType: sandbox.__contentType, listeners };
}

const APP_SCOPE = 'https://example.com/rpgreactor/';
const { relativePath, contentType, listeners } = loadWorker(APP_SCOPE);

test('the virtual project serves every Reactor image format with the correct MIME type', () => {
    assert.equal(contentType('image.jpg'), 'image/jpeg');
    assert.equal(contentType('image.webp'), 'image/webp');
    assert.equal(contentType('image.svg'), 'image/svg+xml');
    assert.equal(contentType('image.gif'), 'image/gif');
});

test('a project asset resolves to its path below the project root', () => {
    assert.equal(relativePath(new URL(`${APP_SCOPE}project/data/Map001.json`)), 'data/Map001.json');
    assert.equal(relativePath(new URL(`${APP_SCOPE}project/img/tilesets/Outside_A1.png`)),
        'img/tilesets/Outside_A1.png');
});

test('an asset in a folder the game names "project" is not truncated', () => {
    // The routing used to take the last "/project/" in the path, so this
    // resolved to "logo.png" and served — or missed — the wrong file.
    assert.equal(relativePath(new URL(`${APP_SCOPE}project/img/pictures/project/logo.png`)),
        'img/pictures/project/logo.png');
    assert.equal(relativePath(new URL(`${APP_SCOPE}project/audio/bgm/project/theme.ogg`)),
        'audio/bgm/project/theme.ogg');
});

test('percent-encoded names are decoded once', () => {
    assert.equal(relativePath(new URL(`${APP_SCOPE}project/img/pictures/Title%20Screen.png`)),
        'img/pictures/Title Screen.png');
});

test('requests outside the project root are left to the network', () => {
    for (const url of [
        `${APP_SCOPE}index.html`,
        `${APP_SCOPE}web/main.js`,
        `${APP_SCOPE}projector/data/Map001.json`,   // shares a prefix but is not the root
        'https://example.com/project/data/Map001.json' // above the worker's scope
    ]) {
        assert.equal(relativePath(new URL(url)), null, url);
    }
});

test('a cross-origin request is never served from local storage', () => {
    assert.equal(relativePath(new URL('https://cdn.example.com/rpgreactor/project/data/Map001.json')), null);
});

test('the worker still serves a project root at the site root', () => {
    const { relativePath: atRoot } = loadWorker('https://example.com/');
    assert.equal(atRoot(new URL('https://example.com/project/data/Map001.json')), 'data/Map001.json');
    assert.equal(atRoot(new URL('https://example.com/data/Map001.json')), null);
});

test('only GET is intercepted', () => {
    const fetchListener = listeners.get('fetch');
    assert.ok(fetchListener, 'the worker registers a fetch listener');
    let responded = false;
    fetchListener({
        request: { url: `${APP_SCOPE}project/data/Map001.json`, method: 'POST' },
        respondWith() { responded = true; }
    });
    assert.equal(responded, false, 'a POST falls through to the network');
});

test('the routed prefix matches the host virtual root', () => {
    assert.match(hostSource, /const PROJECT_ROOT = '\/project'/,
        'the worker and the host agree on the project root name');
    assert.match(hostSource, /register\('service-worker\.js', \{ scope: '\.\/' \}\)/,
        'and the worker is scoped to the app directory it anchors on');
});
