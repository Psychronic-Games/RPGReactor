const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const nwRuntime = require(path.join(editorRoot, 'build-scripts', 'nw-runtime-utils.js'));
const NwVersionPicker = require(path.join(editorRoot, 'src', 'NwVersionPicker.js'));

test('NW.js versions and archive names are validated', () => {
    assert.equal(nwRuntime.normalizeVersion('v0.113.0'), '0.113.0');
    assert.equal(nwRuntime.archiveName('0.113.0', 'linux'), 'nwjs-v0.113.0-linux-x64.tar.gz');
    assert.equal(nwRuntime.archiveName('0.113.0', 'win', 'sdk'), 'nwjs-sdk-v0.113.0-win-x64.zip');
    assert.throws(() => nwRuntime.normalizeVersion('../../bad'), /Invalid NW\.js version/);
    const source = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'nw-runtime-utils.js'), 'utf8');
    assert.match(source, /process\.platform === 'win32'[\s\S]*?execFileSync\('tar\.exe'/,
        'stock Windows extracts official NW.js ZIPs without a third-party unzip command');
});

test('every NW.js cache root is searched before downloading', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-cache-'));
    try {
        const first = path.join(root, 'editor-cache');
        const second = path.join(root, 'repo-cache');
        fs.mkdirSync(first);
        fs.mkdirSync(second);
        const archive = 'nwjs-v0.113.0-win-x64.zip';
        fs.writeFileSync(path.join(second, archive), 'cached');

        assert.equal(nwRuntime.findCachedFile([first, second], archive), path.join(second, archive));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('latest stable resolves from the cached official manifest without network access', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-manifest-'));
    let fetches = 0;
    try {
        fs.writeFileSync(path.join(root, 'versions.json'), JSON.stringify({ stable: 'v0.113.0' }));
        const version = await nwRuntime.resolveVersion({
            policy: 'stable',
            editorVersion: '0.107.0',
            cacheDirectories: [root],
            fetchManifest: async () => { fetches++; return { stable: 'v9.9.9' }; },
        });
        assert.equal(version, '0.113.0');
        assert.equal(fetches, 0);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('an invalid manifest does not shadow a valid later cache root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-manifests-'));
    try {
        const first = path.join(root, 'first');
        const second = path.join(root, 'second');
        fs.mkdirSync(first);
        fs.mkdirSync(second);
        fs.writeFileSync(path.join(first, 'versions.json'), JSON.stringify({ stable: 'not-a-version' }));
        fs.writeFileSync(path.join(second, 'versions.json'), JSON.stringify({ stable: 'v0.112.0' }));

        const version = await nwRuntime.resolveVersion({
            policy: 'stable',
            editorVersion: '0.107.0',
            cacheDirectories: [first, second],
            fetchManifest: async () => { throw new Error('network should not be used'); },
        });
        assert.equal(version, '0.112.0');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('available NW.js releases refresh into the shared manifest cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-release-list-'));
    try {
        const manifest = await nwRuntime.loadVersionManifest({
            cacheDirectories: [root],
            fetchManifest: async () => ({
                stable: 'v0.113.0',
                versions: [
                    { version: 'v0.113.0', date: '2026/07/02' },
                    { version: 'v0.112.0', date: '2026/05/24' },
                ],
            }),
        });
        assert.equal(manifest.versions[1].version, 'v0.112.0');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'versions.json'), 'utf8')), manifest);

        const picker = Object.create(NwVersionPicker.prototype);
        picker.versions = manifest.versions.map(release => ({
            version: nwRuntime.normalizeVersion(release.version),
            date: release.date,
        }));
        assert.equal(picker.hasVersion('v0.112.0'), true);
        assert.equal(picker.hasVersion('0.999.0'), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('deployment dialogs expose stable, editor, and exact NW.js versions', () => {
    const buildSource = fs.readFileSync(path.join(editorRoot, 'src', 'BuildManager.js'), 'utf8');
    const distSource = fs.readFileSync(path.join(editorRoot, 'src', 'DistEditorManager.js'), 'utf8');
    const pickerSource = fs.readFileSync(path.join(editorRoot, 'src', 'NwVersionPicker.js'), 'utf8');
    const themeSource = fs.readFileSync(path.join(editorRoot, 'css', 'theme.css'), 'utf8');
    const workerSource = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'build-worker.js'), 'utf8');

    for (const source of [buildSource, distSource]) {
        assert.match(source, /<option value="stable" selected>Latest stable<\/option>/);
        assert.match(source, /<option value="editor">Same as editor<\/option>/);
        assert.match(source, /<option value="exact">Specific version<\/option>/);
        assert.match(source, /nwVersionPolicy/);
        assert.match(source, /includeProprietaryCodecs/);
        assert.match(source, /Include third-party H\.264\/AAC codec/);
        assert.match(source, /type="text" placeholder="Search versions\.\.\."/,
            'the picker avoids Chromium search-field controls that bypass Reactor themes');
        assert.match(source, /class="nw-version-menu" role="listbox" hidden/);
        assert.doesNotMatch(source, /<datalist|\slist="(?:build|dist)-nw-version-list"/,
            'specific version uses the themed picker instead of Chromium datalist UI');
        assert.match(source, /versionPicker\.hasVersion\(exactNwVersion\)/,
            'specific versions must come from the official searchable release list');
        assert.match(source, /min-width: 16px; min-height: 16px; max-width: 16px; max-height: 16px; flex: 0 0 16px/,
            'codec checkbox dimensions remain square inside flex layouts');
        assert.doesNotMatch(source, /No patent license is granted|Exact-version nwjs-ffmpeg-prebuilt overlay|Downloads the exact NW\.js-version binary/,
            'codec option does not include an explanatory blurb');
    }
    assert.match(distSource, /overflow-y: auto; padding-right: 12px; scrollbar-gutter: stable/,
        'Deploy Editor options leave space beside the scrollbar');
    assert.equal((distSource.match(/ZIP archive for (?:Linux|Windows|macOS) 64-bit/g) || []).length, 3,
        'all Deploy Editor platform descriptions use uppercase ZIP consistently');
    assert.doesNotMatch(distSource, />zip archive for/);
    assert.match(pickerSource, /const rows = matches\.map\(/,
        'every matching release remains available by scrolling');
    assert.doesNotMatch(pickerSource, /matches\.slice|const limit = needle/,
        'the release picker does not truncate the scrollable result list');
    assert.match(pickerSource, /ArrowDown[\s\S]*?ArrowUp[\s\S]*?Enter/,
        'the custom release picker supports keyboard navigation');
    assert.match(themeSource, /\.nw-version-menu \{[\s\S]*?overflow-y: auto[\s\S]*?background: var\(--color-bg-surface\)/,
        'the release menu is scrollable and uses Reactor theme tokens');
    assert.match(distSource, /codec\.disabled = type === 'minimal'/);
    assert.match(workerSource, /nwRuntime\.findCachedFile\(cacheCandidates, archiveName\)/);
    assert.match(workerSource, /packagedFlatRuntime/);
    assert.match(workerSource, /nwRuntime\.extractArchive\(archivePath, extractDir\)/);
    assert.match(workerSource, /\$\{destPath\}\.\$\{process\.pid\}\.\$\{threadId\}\.\$\{Date\.now\(\)\}\.part/);
    assert.doesNotMatch(workerSource, /const cacheDir = nwRuntime\.writableCacheDirectory/,
        'web builds must not require a writable NW.js cache during worker startup');

    const distWorkerSource = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'dist-editor-worker.js'), 'utf8');
    assert.match(distWorkerSource, /nwRuntime\.extractArchive\(cachedPath, extractDir\)/);
    assert.match(distWorkerSource, /nwRuntime\.packagedFlatRuntime\(editorExecPath, platform\)/,
        'editor deployment reuses packaged flat Windows and Linux runtimes');
    assert.match(distWorkerSource, /const markerMatches = bundledMarker[\s\S]*?bundledMarker\.version === nwVersion/);
    assert.match(distWorkerSource, /const unmarkedHostMatches = !bundledMarker && platform === hostPlatform[\s\S]*?nwVersion === nwRuntime\.normalizeVersion\(editorNwVersion\)/,
        'unmarked editor bundles are reused only for their host platform and editor version');
    assert.match(distWorkerSource, /RPGReactor-v\$\{appVersion\}-\$\{archLabel\}\.zip`[\s\S]*?plat !== 'win'/,
        'Linux editor packages use ZIP while preserving Unix symlinks');
});
