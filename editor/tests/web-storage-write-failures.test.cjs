const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const hostSource = fs.readFileSync(path.join(editorRoot, 'src', 'web', 'WebHost.js'), 'utf8');

/**
 * Runs the real createFileSystem() against a stub IndexedDB whose writes can be
 * made to fail, which is what a browser does when the storage quota is hit.
 */
function makeFileSystem({ failPaths = new Set() } = {}) {
    const stored = new Map();
    const db = {
        transaction: () => ({
            objectStore: () => ({
                put(record) {
                    const request = {};
                    queueMicrotask(() => {
                        if (failPaths.has(record.path)) {
                            request.error = new Error('QuotaExceededError');
                            request.onerror && request.onerror();
                        } else {
                            stored.set(record.path, record.data);
                            request.onsuccess && request.onsuccess();
                        }
                    });
                    return request;
                },
                delete(key) {
                    const request = {};
                    queueMicrotask(() => {
                        if (failPaths.has(key)) {
                            request.error = new Error('QuotaExceededError');
                            request.onerror && request.onerror();
                        } else {
                            stored.delete(key);
                            request.onsuccess && request.onsuccess();
                        }
                    });
                    return request;
                }
            })
        })
    };

    const sandbox = {
        window: {}, document: { documentElement: { classList: { add() {} } } },
        indexedDB: {}, navigator: {}, console: { log() {}, warn() {}, error() {} },
        Blob: class { constructor(parts) { this.size = String(parts[0] || '').length; } },
        TextDecoder: class { decode(value) { return String(value); } },
        URL, queueMicrotask, Promise, Date, Error, Map, Set
    };
    sandbox.globalThis = sandbox;
    // createFileSystem lives inside the file's IIFE, so the export has to be
    // injected before the closing brace rather than appended after it.
    const instrumented = hostSource.replace(
        /\}\)\(\);\s*$/,
        'globalThis.__createFileSystem = createFileSystem;\n})();'
    );
    assert.notEqual(instrumented, hostSource, 'WebHost.js is still a single IIFE');
    vm.runInNewContext(instrumented, sandbox);
    return { fs: sandbox.__createFileSystem({ files: [], mutable: {} }, db), stored };
}

test('a successful write is persisted and flush resolves', async () => {
    const { fs: vfs, stored } = makeFileSystem();
    vfs.writeFileSync('/project/data/Map001.json', '{"ok":true}');

    await vfs.flush();
    assert.equal(stored.get('data/Map001.json'), '{"ok":true}');
    assert.equal(vfs.hasPendingWriteFailures(), false);
});

test('a failed write makes flush report, instead of silently reverting on reload', async () => {
    const { fs: vfs, stored } = makeFileSystem({ failPaths: new Set(['data/Map001.json']) });
    vfs.writeFileSync('/project/data/Map001.json', '{"lost":true}');

    // The in-memory copy looks saved, which is exactly why the failure has to
    // reach the caller: nothing on disk changed.
    assert.equal(vfs.readFileSync('/project/data/Map001.json', 'utf8'), '{"lost":true}');
    assert.equal(stored.has('data/Map001.json'), false);

    await assert.rejects(() => vfs.flush(), error => {
        assert.match(error.message, /browser storage/i);
        assert.equal(error.failures.length, 1);
        assert.equal(error.failures[0].path, 'data/Map001.json');
        return true;
    });
});

test('one failure does not discard the writes that succeeded', async () => {
    const { fs: vfs, stored } = makeFileSystem({ failPaths: new Set(['data/Map002.json']) });
    vfs.writeFileSync('/project/data/Map001.json', 'first');
    vfs.writeFileSync('/project/data/Map002.json', 'second');
    vfs.writeFileSync('/project/data/Map003.json', 'third');

    await assert.rejects(() => vfs.flush());
    assert.equal(stored.get('data/Map001.json'), 'first');
    assert.equal(stored.get('data/Map003.json'), 'third');
    assert.equal(stored.has('data/Map002.json'), false);
});

test('failures are reported once, not repeated on every later flush', async () => {
    const { fs: vfs } = makeFileSystem({ failPaths: new Set(['data/Map001.json']) });
    vfs.writeFileSync('/project/data/Map001.json', 'x');

    await assert.rejects(() => vfs.flush());
    await vfs.flush();
    assert.equal(vfs.hasPendingWriteFailures(), false, 'the queue is drained after reporting');
});

test('a failed delete is reported too', async () => {
    const { fs: vfs } = makeFileSystem({ failPaths: new Set(['data/Map009.json']) });
    vfs.writeFileSync('/project/data/Map009.json', 'x');
    // The write fails as well; drain that report first.
    await assert.rejects(() => vfs.flush());

    vfs.unlinkSync('/project/data/Map009.json');
    await assert.rejects(() => vfs.flush(), error => error.failures[0].path === 'data/Map009.json');
});

test('the shared atomic writer uses complete browser records and flush reports their storage failures',async()=>{
    const atomic=require('../src/utils/FsAtomic.js');
    const {fs:vfs,stored}=makeFileSystem();
    atomic(vfs,'/project/3d/Characters/Web/source/Web.glb',new Uint8Array([103,108,84,70]));await vfs.flush();
    assert.equal(stored.get('3d/Characters/Web/source/Web.glb').byteLength,4);
    const bad=makeFileSystem({failPaths:new Set(['data/Map001.json'])});atomic(bad.fs,'/project/data/Map001.json','{}');
    await assert.rejects(bad.fs.flush(),/browser storage/);
});
