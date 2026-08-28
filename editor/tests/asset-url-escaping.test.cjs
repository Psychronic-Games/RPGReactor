const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { fileURLToPath } = require('node:url');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(editorRoot, 'src', 'utils', 'EncryptedAssets.js');
const EncryptedAssets = require(sourcePath);
const AssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));

const pathCases = [
    {
        path: '/tmp/RPG Projects/100% ready #1 ? 雪.png',
        url: 'file:///tmp/RPG%20Projects/100%25%20ready%20%231%20%3F%20%E9%9B%AA.png'
    },
    {
        path: 'C:\\RPG Projects\\100% ready #1 ? 雪.png',
        url: 'file:///C:/RPG%20Projects/100%25%20ready%20%231%20%3F%20%E9%9B%AA.png'
    },
    {
        path: '\\\\server\\RPG Share\\100% ready #1 ? 雪.png',
        url: 'file://server/RPG%20Share/100%25%20ready%20%231%20%3F%20%E9%9B%AA.png'
    }
];

test('desktop asset URLs round-trip filenames containing reserved characters and Unicode', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-asset-url-'));
    try {
        const assetPath = path.join(root, '0000_bank00 sphere sound 18-19#140 (100% 雪).ogg');
        fs.writeFileSync(assetPath, 'asset');

        const url = EncryptedAssets.resolveAssetUrl(assetPath);
        assert.match(url, /^file:\/\/\//);
        assert.ok(!url.includes('#'));
        assert.match(url, /%20/);
        assert.match(url, /%23/);
        assert.match(url, /%25/);
        assert.match(url, /%E9%9B%AA/);
        assert.equal(fileURLToPath(url), assetPath);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('desktop asset URLs use correct POSIX, Windows drive, and UNC forms', () => {
    for (const entry of pathCases) {
        assert.equal(EncryptedAssets.resolveAssetUrl(entry.path), entry.url);
        assert.equal(AssetFiles.toUrl(entry.path), entry.url);
    }
});

test('desktop preview consumers use the shared escaped asset resolver', () => {
    const sources = [
        'src/DatabaseEditorUI.js',
        'src/event/EventCommandList.js',
        'src/event/EventPageEditor.js'
    ].map(relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8'));
    for (const source of sources) assert.match(source, /RRAssetFiles\.toUrl\(/);

    const window = { RPGReactorAssetUrl: filePath => `resolved:${filePath}` };
    vm.runInNewContext(fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'IconPicker.js'), 'utf8'), {
        window, require
    });
    assert.equal(window.RRIconPicker.imageUrl('/project #1?/img/system/IconSet.png'),
        'resolved:/project #1?/img/system/IconSet.png');
});

test('a POSIX double-slash path is not mistaken for a Windows UNC host', {
    skip: process.platform === 'win32'
}, () => {
    const url = new URL(EncryptedAssets.resolveAssetUrl('//posix/double/file.png'));
    assert.equal(url.hostname, '');
    assert.equal(url.pathname, '/posix/double/file.png');
});

test('the browser-safe fallback escapes paths without replacing the web-host resolver', () => {
    const existingResolver = () => 'web-asset';
    const window = { RPGReactorAssetUrl: existingResolver };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), {
        URL,
        module,
        require() { throw new Error('Node modules unavailable'); },
        window
    }, { filename: sourcePath });

    assert.equal(window.RPGReactorAssetUrl, existingResolver);
    for (const entry of pathCases) {
        assert.equal(module.exports.resolveAssetUrl(entry.path), entry.url);
    }
});
