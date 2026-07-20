const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
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

test('release archives require pinned hashes and cached bytes are verified', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-trusted-'));
    try {
        const first = path.join(root, 'first');
        const second = path.join(root, 'second');
        fs.mkdirSync(first);
        fs.mkdirSync(second);
        const name = 'nwjs-v0.113.0-linux-x64.tar.gz';
        fs.writeFileSync(path.join(first, name), 'wrong');
        fs.writeFileSync(path.join(second, name), 'trusted runtime archive');
        const expected = nwRuntime.sha256(path.join(second, name));
        const warnings = [];

        assert.equal(
            nwRuntime.findVerifiedCachedFile([first, second], name, expected, warning => warnings.push(warning)),
            path.join(second, name)
        );
        assert.equal(fs.existsSync(path.join(first, name)), false);
        assert.ok(warnings.some(warning => /unverified cached archive/.test(warning)));
        assert.throws(
            () => nwRuntime.trustedArchiveHash({ nwjs: {}, codecs: {} }, 'nwjs', name),
            /no trusted SHA-256/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('runtime executable architecture is detected before writing x64 markers', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-arch-'));
    try {
        const x64 = Buffer.alloc(64);
        x64.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
        x64.writeUInt16LE(62, 18);
        fs.writeFileSync(path.join(root, 'nw'), x64);
        assert.equal(nwRuntime.detectRuntimeArchitecture(root, 'linux'), 'x64');
        nwRuntime.writeRuntimeMarker(root, {
            version: '0.113.0', edition: 'normal', platform: 'linux', arch: 'x64'
        });

        const arm64 = Buffer.from(x64);
        arm64.writeUInt16LE(183, 18);
        fs.writeFileSync(path.join(root, 'nw'), arm64);
        assert.equal(nwRuntime.detectRuntimeArchitecture(root, 'linux'), 'arm64');
        assert.throws(() => nwRuntime.writeRuntimeMarker(root, {
            version: '0.113.0', edition: 'normal', platform: 'linux', arch: 'x64'
        }), /expected x64, detected arm64/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('system archive extraction rejects entries outside the destination', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-containment-'));
    try {
        const source = path.join(root, 'source');
        const archive = path.join(root, 'unsafe.zip');
        fs.mkdirSync(source);
        fs.writeFileSync(path.join(root, 'escape.txt'), 'escape');
        execFileSync('zip', ['-q', archive, '../escape.txt'], { cwd: source });
        assert.match(nwRuntime.listArchiveEntries(archive)[0], /^\.\.\//);
        assert.throws(() => nwRuntime.extractArchive(archive, path.join(root, 'output')), /unsafe path/);
        assert.equal(fs.existsSync(path.join(root, 'output', 'escape.txt')), false);
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
    const nativeDownloadSource = fs.readFileSync(path.join(editorRoot, 'build-scripts', 'native-download.js'), 'utf8');

    for (const source of [buildSource, distSource]) {
        assert.match(source, /<option value="stable" selected>\$\{tt\('Latest stable'\)\}<\/option>/);
        assert.match(source, /<option value="editor">\$\{tt\('Same as editor'\)\}<\/option>/);
        assert.match(source, /<option value="exact">\$\{tt\('Specific version'\)\}<\/option>/);
        assert.match(source, /nwVersionPolicy/);
        assert.match(source, /includeProprietaryCodecs/);
        assert.match(source, /Include third-party H\.264\/AAC codec/);
        assert.match(source, /type="text" placeholder="\$\{tt\('Search versions\.\.\.'\)\}"/,
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
    for (const source of [workerSource, distWorkerSource]) {
        assert.match(source, /const DOWNLOAD_IDLE_TIMEOUT_MS = 180000/,
            'large NW.js archives tolerate up to three minutes of socket inactivity');
        assert.match(source, /const DOWNLOAD_MAX_ATTEMPTS = 3/,
            'transient archive download failures receive bounded retries');
        assert.match(source, /Download interrupted[\s\S]*?Retrying/);
        assert.match(source, /if \(partPath\)[\s\S]*?fs\.rmSync\(partPath/,
            'failed archive attempts remove partial cache files');
        assert.match(source, /type: 'download-progress'/,
            'workers report live byte progress independently of Content-Length');
        assert.match(source, /now - lastReportAt >= 100/,
            'download telemetry is throttled before crossing the worker boundary');
        assert.match(source, /nativeDownload\.isAvailable\(\)/,
            'build workers prefer the host download transport when available');
    }
    for (const source of [buildSource, distSource]) {
        assert.match(source, /updateDownloadProgress\(message\)/);
        assert.match(source, /msg\.type === 'download-progress'/);
        assert.match(source, /is-indeterminate/,
            'unknown-length downloads use an indeterminate inline progress bar');
        assert.match(source, /mib\(message\.downloaded\)\}\s\$\{tt\('downloaded'\)\}/,
            'unknown-length downloads still display transferred bytes');
    }
    assert.match(themeSource, /\.rr-download-progress-track[\s\S]*?\.rr-download-progress-fill\.is-indeterminate/);
    assert.match(themeSource, /@keyframes rr-download-indeterminate/);
    assert.match(nativeDownloadSource, /spawnProcess\(process\.platform === 'win32' \? 'curl\.exe' : 'curl'/,
        'native downloads use argument arrays rather than a shell command');
    assert.match(nativeDownloadSource, /'--speed-limit', '1'[\s\S]*?'--speed-time'/,
        'native downloads detect stalled transfers');
    assert.match(nativeDownloadSource, /setInterval\(report, 100\)/,
        'native byte progress remains visible while curl runs');
    assert.match(distWorkerSource, /nwRuntime\.extractArchive\(cachedPath, extractDir\)/);
    assert.match(distWorkerSource, /nwRuntime\.packagedFlatRuntime\(editorExecPath, platform\)/,
        'editor deployment reuses packaged flat Windows and Linux runtimes');
    assert.match(distWorkerSource, /const markerMatches = bundledMarker[\s\S]*?bundledMarker\.version === nwVersion/);
    assert.match(distWorkerSource, /const unmarkedHostMatches = !bundledMarker && platform === hostPlatform[\s\S]*?nwVersion === nwRuntime\.normalizeVersion\(editorNwVersion\)/,
        'unmarked editor bundles are reused only for their host platform and editor version');
    assert.match(distWorkerSource, /RPGReactor-v\$\{appVersion\}-\$\{archLabel\}\.zip`[\s\S]*?plat !== 'win'/,
        'Linux editor packages use ZIP while preserving Unix symlinks');
});
