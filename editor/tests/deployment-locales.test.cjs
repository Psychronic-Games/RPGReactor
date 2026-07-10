const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const nwRuntime = require(path.join(editorRoot, 'build-scripts', 'nw-runtime-utils.js'));
const DeploymentLocalePreferences = require(path.join(editorRoot, 'src', 'DeploymentLocalePreferences.js'));

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
    };
}

function write(filePath, contents = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}

test('deployment locale preferences are opt-in, persistent, and always include English', () => {
    const storage = memoryStorage();
    assert.deepEqual(DeploymentLocalePreferences.load(storage), {
        mode: 'all', locales: ['en-US'],
    });
    assert.equal(DeploymentLocalePreferences.save({
        mode: 'selected', locales: ['es', 'not-a-runtime-locale'],
    }, storage), true);
    assert.deepEqual(DeploymentLocalePreferences.load(storage), {
        mode: 'selected', locales: ['en-US', 'es'],
    });
});

test('Windows and Linux locale pruning keeps selected families and grammatical variants', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-locales-'));
    try {
        for (const name of [
            'en-US.pak', 'en-US.pak.info', 'en-US_FEMININE.pak',
            'es.pak', 'es.pak.info', 'es_MASCULINE.pak',
            'fr.pak', 'fr_NEUTER.pak',
        ]) write(path.join(root, 'locales', name), name);
        write(path.join(root, 'locales', 'README.txt'), 'keep unrelated files');

        const result = nwRuntime.pruneDesktopLocales(root, 'linux', ['es']);
        assert.equal(result.filtered, true);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'en-US.pak')), true);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'en-US_FEMININE.pak')), true);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'es.pak.info')), true);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'es_MASCULINE.pak')), true);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'fr.pak')), false);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'fr_NEUTER.pak')), false);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'README.txt')), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('macOS locale pruning handles app and framework locale layouts without nested resources', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-mac-locales-'));
    const app = path.join(root, 'nwjs.app');
    const outer = path.join(app, 'Contents', 'Resources');
    const framework = path.join(app, 'Contents', 'Frameworks', 'nwjs Framework.framework', 'Versions', '1', 'Resources');
    try {
        for (const locale of ['en', 'es', 'fr']) {
            write(path.join(outer, `${locale}.lproj`, 'InfoPlist.strings'), locale);
            write(path.join(framework, `${locale}.lproj`, 'locale.pak'), locale);
        }
        write(path.join(framework, 'en_FEMININE.lproj', 'locale.pak'), 'en variant');
        write(path.join(framework, 'es_MASCULINE.lproj', 'locale.pak'), 'es variant');
        write(path.join(outer, 'io.nwjs.nwjs.manifest', 'Contents', 'Resources', 'en.lproj', 'Localizable.strings'), 'keep');

        const result = nwRuntime.pruneDesktopLocales(root, 'osx', ['es']);
        assert.equal(result.filtered, true);
        assert.equal(fs.existsSync(path.join(outer, 'en.lproj')), true);
        assert.equal(fs.existsSync(path.join(outer, 'es.lproj')), true);
        assert.equal(fs.existsSync(path.join(outer, 'fr.lproj')), false);
        assert.equal(fs.existsSync(path.join(framework, 'en_FEMININE.lproj')), true);
        assert.equal(fs.existsSync(path.join(framework, 'es_MASCULINE.lproj')), true);
        assert.equal(fs.existsSync(path.join(framework, 'fr.lproj')), false);
        assert.equal(fs.existsSync(path.join(outer, 'io.nwjs.nwjs.manifest', 'Contents', 'Resources', 'en.lproj')), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('locale pruning fails open when the required fallback layout is absent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-locale-fallback-'));
    let warning = '';
    try {
        write(path.join(root, 'locales', 'es.pak'), 'es');
        write(path.join(root, 'locales', 'fr.pak'), 'fr');
        const result = nwRuntime.pruneDesktopLocales(root, 'win', ['es'], message => { warning = message; });
        assert.equal(result.filtered, false);
        assert.match(warning, /keeping all locales/);
        assert.equal(fs.existsSync(path.join(root, 'locales', 'fr.pak')), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Deploy Game exposes persisted locale selection and passes it to the worker', () => {
    const indexSource = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    const managerSource = fs.readFileSync(path.join(editorRoot, 'src', 'BuildManager.js'), 'utf8');
    const workerSource = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'build-worker.js'), 'utf8');
    assert.match(indexSource, /DeploymentLocalePreferences\.js[\s\S]*?BuildManager\.js/);
    assert.match(managerSource, /Include selected locales only/);
    assert.match(managerSource, /DeploymentLocalePreferences\.load\(\)/);
    assert.match(managerSource, /runtimeLocales,/);
    assert.match(workerSource, /nwRuntime\.pruneDesktopLocales\(\s*platformOutDir, nwPlatform, runtimeLocales, logWarn\)/);
});
