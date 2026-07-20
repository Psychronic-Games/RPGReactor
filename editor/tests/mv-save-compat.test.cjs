const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const fixture = 'N4IgzgnmAuCmC2IBcoACBjZBGAvgGhAAcBDAJ2gmTUyQCYccgAA=';
const expectedJson = '{"system":{"@c":1},"party":{"@c":2}}';

function loadLzString() {
    const source = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'libs', 'lz-string.js'), 'utf8');
    const context = {};
    vm.runInNewContext(source, context);
    return context.LZString;
}

function extractFunction(source, name, nextName) {
    const start = source.indexOf(`    function ${name}()`);
    const end = source.indexOf(`\n    function ${nextName}()`, start);
    assert.ok(start >= 0 && end > start, `${name} source exists`);
    return source.slice(start, end);
}

function loadAsyncStorage(mvGameSemantics) {
    const managersSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_managers.js'), 'utf8');
    const storageStart = managersSource.indexOf('function StorageManager()');
    const storageEnd = managersSource.indexOf('//-----------------------------------------------------------------------------\n// FontManager', storageStart);
    const compatSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const storageCompat = extractFunction(compatSource, 'installStorageManagerCompatibility', 'installInterpreterCompatibility');
    const context = {
        console,
        require,
        LZString: loadLzString(),
        JsonEx: { stringify: JSON.stringify, parse: JSON.parse },
        Utils: { isNwjs: () => false },
        pako: {
            deflate(json) { return `pako:${json}`; },
            inflate(zip) {
                if (!String(zip).startsWith('pako:')) throw new Error('not pako');
                return String(zip).slice(5);
            }
        },
        localforage: {},
        $dataSystem: { advanced: { gameId: 1 } },
    };
    vm.runInNewContext(managersSource.slice(storageStart, storageEnd), context);
    const install = vm.runInNewContext(`(function() {
        const global = globalThis;
        const mvGameSemantics = ${mvGameSemantics};
        ${storageCompat}
        return installStorageManagerCompatibility;
    })()`, context);
    install();
    return context;
}

test('MV synchronous StorageManager load returns decompressed JSON for YEP SaveCore', () => {
    const compatSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const storageSource = extractFunction(compatSource, 'installStorageManagerCompatibility', 'installInterpreterCompatibility');
    const jsonExSource = extractFunction(compatSource, 'installJsonExCompatibility', 'ensureArrayClone');
    const writes = [];
    const reads = [];
    const directories = [];
    const StorageManager = {
        fileDirectoryPath: () => '/virtual/save/',
        filePath: saveName => `/virtual/save/${saveName}.rmmzsave`,
        isLocalMode: () => true,
        localFilePath(savefileId) { return `${this.localFileDirectoryPath()}save-slot-${savefileId}.rpgsave`; },
        fsReadFile: filePath => { reads.push(filePath); return fixture; },
        fsWriteFile: (filePath, data) => writes.push([filePath, data]),
        fsMkdir: directory => directories.push(directory),
        forageKey: saveName => saveName
    };
    const DataManager = { makeSavename: savefileId => `file${savefileId}` };
    const JsonEx = { parse: JSON.parse, stringify: JSON.stringify, maxDepth: 100 };
    const context = {
        console,
        require,
        StorageManager,
        DataManager,
        JsonEx,
        LZString: loadLzString(),
        pako: {
            inflate() { throw new Error('not a pako save'); },
            deflate() { throw new Error('MV sync saves should use LZString'); }
        }
    };

    const install = vm.runInNewContext(`(function() {
        const global = globalThis;
        const mvGameSemantics = true;
        ${jsonExSource}
        ${storageSource}
        return function() {
            installJsonExCompatibility();
            installStorageManagerCompatibility();
        };
    })()`, context);
    install();

    const loadedJson = StorageManager.load(1);
    assert.equal(loadedJson, expectedJson);
    assert.deepEqual(reads, ['/virtual/save/save-slot-1.rpgsave']);
    assert.equal(StorageManager.localFileDirectoryPath(), '/virtual/save/');
    const contents = JsonEx.parse(loadedJson);
    assert.deepEqual(JSON.parse(JSON.stringify(contents)), { system: {}, party: {} });

    assert.equal(StorageManager.save(1, expectedJson), true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], '/virtual/save/save-slot-1.rpgsave');
    assert.deepEqual(directories, ['/virtual/save']);
    assert.equal(context.LZString.decompressFromBase64(writes[0][1]), expectedJson);
});

test('MV synchronous web storage honors the MV webStorageKey contract', () => {
    const compatSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const storageSource = extractFunction(compatSource, 'installStorageManagerCompatibility', 'installInterpreterCompatibility');
    const localStorage = {
        values: new Map([['RPG Test File1', fixture]]),
        getItem(key) { return this.values.get(key) || null; },
        setItem(key, value) { this.values.set(key, value); }
    };
    const StorageManager = {
        fileDirectoryPath: () => '/virtual/save/',
        filePath: saveName => `/virtual/save/${saveName}.rmmzsave`,
        isLocalMode: () => false,
        webStorageKey: savefileId => `RPG Test File${savefileId}`,
        forageKey: saveName => `wrong-${saveName}`
    };
    const context = {
        console,
        require,
        localStorage,
        StorageManager,
        LZString: loadLzString(),
        pako: { inflate() { throw new Error('not pako'); }, deflate: value => value }
    };
    const install = vm.runInNewContext(`(function() {
        const global = globalThis;
        const mvGameSemantics = true;
        ${storageSource}
        return installStorageManagerCompatibility;
    })()`, context);
    install();

    assert.equal(StorageManager.load(1), expectedJson);
    StorageManager.save(2, expectedJson);
    assert.equal(context.LZString.decompressFromBase64(localStorage.getItem('RPG Test File2')), expectedJson);
});

test('legacy zip fallback decodes LZString after native pako rejection', async () => {
    const compatSource = fs.readFileSync(path.join(workspaceRoot, 'runtime', 'reactor_mv_compat.js'), 'utf8');
    const storageSource = extractFunction(compatSource, 'installStorageManagerCompatibility', 'installInterpreterCompatibility');
    const StorageManager = {
        fileDirectoryPath: () => '/virtual/save/',
        filePath: saveName => `/virtual/save/${saveName}.rmmzsave`,
        isLocalMode: () => false,
        zipToJson: () => Promise.reject(new Error('not pako'))
    };
    const context = {
        console,
        require,
        StorageManager,
        LZString: loadLzString(),
        pako: { inflate() { throw new Error('not pako'); }, deflate: value => value }
    };
    const install = vm.runInNewContext(`(function() {
        const global = globalThis;
        const mvGameSemantics = true;
        ${storageSource}
        return installStorageManagerCompatibility;
    })()`, context);
    install();

    assert.equal(await StorageManager.zipToJson(fixture), expectedJson);
});

test('MV async saveObject writes stock LZString and round-trips through loadObject', async () => {
    const context = loadAsyncStorage(true);
    const saved = [];
    context.StorageManager.saveZip = async (saveName, payload) => saved.push([saveName, payload]);

    const object = { system: { title: 'MV Game' }, values: [1, 2, 3] };
    await context.StorageManager.saveObject('file1', object);

    assert.equal(saved.length, 1);
    assert.equal(saved[0][0], 'file1');
    assert.equal(context.LZString.decompressFromBase64(saved[0][1]), JSON.stringify(object));
    assert.doesNotMatch(saved[0][1], /^pako:/);

    context.StorageManager.loadZip = async () => saved[0][1];
    assert.deepEqual(
        JSON.parse(JSON.stringify(await context.StorageManager.loadObject('file1'))),
        object
    );
});

test('MZ async saveObject keeps the pako payload format', async () => {
    const context = loadAsyncStorage(false);
    let payload = null;
    context.StorageManager.saveZip = async (_saveName, zip) => { payload = zip; };

    const object = { system: { title: 'MZ Game' } };
    await context.StorageManager.saveObject('file2', object);

    assert.equal(payload, `pako:${JSON.stringify(object)}`);
    context.StorageManager.loadZip = async () => payload;
    assert.deepEqual(
        JSON.parse(JSON.stringify(await context.StorageManager.loadObject('file2'))),
        object
    );
});
