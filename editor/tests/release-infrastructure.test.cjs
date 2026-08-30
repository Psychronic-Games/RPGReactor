const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const config = require('../build-scripts/release-config.cjs');
const nativeRelease = require('../build-scripts/native-release.cjs');
const cli = require('../build-scripts/release-editor.cjs');
const publication = require('../build-scripts/publish-release.cjs');
const readRepo = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('release CLI config pins trusted NW.js and bundled Demo staging', () => {
    for (const target of Object.keys(config.TARGETS)) {
        const workerData = config.createWorkerData({
            editorRoot,
            target,
            mode: 'candidate',
            outputDir: '/tmp/rpg-release-test',
            env: {},
        });
        assert.equal(workerData.nwVersion, '0.107.0');
        assert.equal(workerData.nwVersionPolicy, 'exact');
        assert.equal(workerData.releaseBuild, true);
        assert.equal(workerData.allowBundledRuntime, false);
        assert.equal(workerData.includeProprietaryCodecs, target !== 'web');
        assert.equal(workerData.nativeSigning.mode, 'unsigned');
        assert.match(workerData.releaseHashManifestPath, /release-hashes\.json$/);
    }
    const worker = readRepo('editor/build-scripts/dist-editor-worker.js');
    assert.match(worker, /prepareBundledStarter\(stageRoot\)/);
    assert.match(worker, /path\.join\('template', 'Demo'\)/);
    assert.match(worker, /releaseBuild = false/);
    assert.match(worker, /if \(releaseBuild\) \{\s*const reseditPath = dependencyPath\('resedit'\);\s*if \(!reseditPath\)[\s\S]*?await nativeRelease\.updateWindowsMetadata/s);
    const interactiveManager = readRepo('editor/src/DistEditorManager.js');
    assert.match(interactiveManager, /releaseBuild: false/);
});

test('publish signing gates require native credentials and candidate mode is explicitly unsigned', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-release-cert-'));
    const certificate = path.join(temp, 'signing.pfx');
    fs.writeFileSync(certificate, 'fixture');
    try {
        assert.throws(() => config.requiredEnvironment('windows', 'publish', {}), /WINDOWS_CERTIFICATE_PATH/);
        assert.doesNotThrow(() => config.requiredEnvironment('windows', 'candidate', {}));
        assert.doesNotThrow(() => config.requiredEnvironment('windows', 'publish', {
            WINDOWS_CERTIFICATE_PATH: certificate,
            WINDOWS_CERTIFICATE_PASSWORD: 'secret',
        }));
        assert.throws(() => config.requiredEnvironment('macos', 'publish', {
            MACOS_SIGNING_IDENTITY: 'Developer ID Application: Example',
        }), /MACOS_NOTARY_PROFILE/);
        assert.doesNotThrow(() => config.requiredEnvironment('macos', 'publish', {
            MACOS_SIGNING_IDENTITY: 'Developer ID Application: Example',
            MACOS_NOTARY_PROFILE: 'fixture-profile',
        }));
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test('publish CLI rejects tracked or untracked source changes', () => {
    assert.throws(() => cli.assertPublishSourceClean('publish', '?? local-file'), /clean checkout/);
    assert.doesNotThrow(() => cli.assertPublishSourceClean('publish', ''));
    assert.doesNotThrow(() => cli.assertPublishSourceClean('candidate', ' M editor/source.js'));
});

test('native metadata uses app-owned bundle and Windows product identities', () => {
    const plist = nativeRelease.upsertPlistString(
        '<?xml version="1.0"?><plist><dict><key>CFBundleIdentifier</key><string>io.nwjs.nwjs</string></dict></plist>',
        'CFBundleIdentifier',
        nativeRelease.MACOS_BUNDLE_ID
    );
    assert.match(plist, /games\.psychronic\.rpgreactor/);
    assert.doesNotMatch(plist, /io\.nwjs\.nwjs/);
    const helper = readRepo('editor/build-scripts/native-release.cjs');
    assert.match(helper, /CompanyName: 'Psychronic Games'/);
    assert.match(helper, /ProductName: 'RPG Reactor'/);
    assert.match(helper, /setFileVersion\(version/);
    assert.match(helper, /signtool|WINDOWS_SIGNTOOL/);
    assert.match(helper, /notarytool/);
    assert.match(helper, /stapler.*staple/s);
});

test('release workflows map four artifacts to explicit itch channels without rebuilding', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(config.TARGETS).map(([target, value]) => [target, value.channel])), {
        linux: 'linux-x64',
        windows: 'windows-x64',
        macos: 'macos-x64',
        web: 'web',
    });
    const candidate = readRepo('.github/workflows/release-candidate.yml');
    const releaseWorkflow = readRepo('.github/workflows/release.yml');
    assert.match(candidate, /runs-on: windows-latest/);
    assert.match(candidate, /runs-on: macos-15-intel/);
    assert.match(candidate, /publishable=true|inputs\.publishable/);
    assert.match(releaseWorkflow, /gh run download/);
    assert.match(releaseWorkflow, /publish-release\.cjs/);
    assert.match(releaseWorkflow, /BUTLER_VERSION=15\.29\.0/);
    assert.match(releaseWorkflow, /BUTLER_SHA256=0568594aadf8bd437b6ca6d5eabc298d414a2ed7275068c5ee82485754db21c2/);
    assert.doesNotMatch(releaseWorkflow, /butler\/linux-amd64\/LATEST/);
    assert.doesNotMatch(releaseWorkflow, /release-editor\.cjs|dist-editor-worker/);
});

test('publication verifier accepts only complete hash-matching publish candidates', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-candidates-'));
    try {
        for (const target of Object.keys(config.TARGETS)) {
            const directory = path.join(root, target);
            fs.mkdirSync(directory);
            const archiveName = `RPGReactor-v0.95.0-${target}.zip`;
            const archivePath = path.join(directory, archiveName);
            fs.writeFileSync(archivePath, target);
            fs.writeFileSync(path.join(directory, config.manifestFileName(target)), JSON.stringify({
                schema: 1,
                version: '0.95.0',
                mode: 'publish',
                target,
                itchChannel: config.TARGETS[target].channel,
                signed: ['windows', 'macos'].includes(target),
                nwjsVersion: config.NW_VERSION,
                releaseBuild: true,
                starter: 'bundled-demo',
                sourceCommit: 'abc123',
                sourceDirty: false,
                artifacts: [{ name: archiveName, size: target.length, sha256: config.sha256(archivePath) }],
            }));
        }
        assert.equal(publication.verifyCandidateSet(root, '0.95.0', 'abc123').length, 4);
        fs.appendFileSync(path.join(root, 'web', 'RPGReactor-v0.95.0-web.zip'), 'tampered');
        assert.throws(() => publication.verifyCandidateSet(root, '0.95.0', 'abc123'), /hash or size mismatch/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('artifact publication updates the release made from the tag without replacing its notes', () => {
    const calls = [];
    const execute = (command, args, options) => calls.push({ command, args, options });
    const files = ['/tmp/linux.zip', '/tmp/artifact-manifest-linux.json'];

    publication.publishGitHubRelease('v0.98.0', 'RPG Reactor 0.98.0', files, execute);

    assert.deepEqual(calls.map(call => call.args), [
        ['release', 'view', 'v0.98.0'],
        ['release', 'edit', 'v0.98.0', '--title', 'RPG Reactor 0.98.0'],
        ['release', 'upload', 'v0.98.0', ...files, '--clobber'],
    ]);
    assert.ok(calls.every(call => call.command === 'gh'));
    assert.doesNotMatch(calls.flatMap(call => call.args).join(' '), /--generate-notes/,
        'the changelog notes published by the tag workflow are preserved');
});

test('artifact publication can recover when the tag has no release yet', () => {
    const calls = [];
    const execute = (command, args, options) => {
        calls.push({ command, args, options });
        if (args[1] === 'view') throw new Error('release not found');
    };

    publication.publishGitHubRelease(
        'v0.98.0', 'RPG Reactor 0.98.0', ['/tmp/web.zip'], execute);

    assert.deepEqual(calls.map(call => call.args), [
        ['release', 'view', 'v0.98.0'],
        [
            'release', 'create', 'v0.98.0', '--verify-tag',
            '--title', 'RPG Reactor 0.98.0', '--generate-notes', '/tmp/web.zip'
        ],
    ]);
});

test('the single third-party notices document includes codec, pako, and stb terms', () => {
    const notices = readRepo('THIRD_PARTY_NOTICES.md');
    assert.match(notices, /nwjs-ffmpeg-prebuilt/);
    assert.match(notices, /does not itself\s+grant patent rights/);
    assert.match(notices, /https:\/\/github\.com\/nodeca\/pako/);
    assert.match(notices, /https:\/\/github\.com\/nothings\/stb\/blob\/master\/stb_vorbis\.c/);
    assert.match(notices, /Vitaly Puzrin and Andrei Tuputcyn/);
    assert.match(notices, /ALTERNATIVE B - Public Domain/);
    const worker = readRepo('editor/build-scripts/dist-editor-worker.js');
    assert.match(worker, /INCLUDE_REPOSITORY_DIRS = \[path\.join\('template', 'Demo'\)\]/);
    assert.match(worker, /THIRD_PARTY_NOTICES\.md/);
    assert.match(worker, /path\.join\(appDir, 'THIRD_PARTY_NOTICES\.md'\)/);
    assert.match(worker, /path\.join\(appDir, 'LICENSE'\)/);
});

test('tests do not depend on ignored private project fixtures', () => {
    for (const file of ['efk-format.test.cjs', 'efk-model.test.cjs']) {
        const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
        assert.doesNotMatch(source, /template[\\/]Demo|corpusPresent|corpusSkip/, file);
    }
    // template/Demo is the one project the repository tracks (.gitignore
    // re-includes it), so reaching it is fine and is how the bundled Demo gets
    // checked. Reaching `template` without naming Demo would enumerate the
    // private projects, which are absent in CI.
    // One exception, and the distinction it turns on: this rule is about a test
    // *depending* on a fixture CI does not have. `runtime-template-sync` walks
    // whatever projects are present and asserts nothing about which those are,
    // so on a clean checkout it checks the tracked Demo alone and locally it
    // also covers the private test beds — which is exactly where a runtime fix
    // gets tried by hand, and where it silently went stale before.
    const ENUMERATES_SAFELY = new Set([
        'runtime-template-sync.test.cjs',
        'mz3d-hidden-tilemap-sprites.test.cjs'
    ]);
    for (const entry of fs.readdirSync(__dirname).filter(name => name.endsWith('.cjs'))) {
        if (entry === path.basename(__filename)) continue;
        if (ENUMERATES_SAFELY.has(entry)) continue;
        const source = fs.readFileSync(path.join(__dirname, entry), 'utf8');
        assert.doesNotMatch(
            source,
            /path\.(?:join|resolve)\(\s*repoRoot\s*,\s*['"](?:template(?!['"]\s*,\s*['"]Demo['"])|INSPIRATION|save)['"]/,
            `${entry} references an ignored repository fixture`
        );
    }

    // The exception is only safe while it stays absence-tolerant, so that is
    // checked rather than trusted.
    for (const entry of ENUMERATES_SAFELY) {
        const source = fs.readFileSync(path.join(__dirname, entry), 'utf8');
        assert.match(source, /existsSync/, `${entry} tolerates a missing fixture`);
        assert.doesNotMatch(source, /Star Shift|Complex|Barebones/,
            `${entry} must not name a private project`);
    }
    const ci = readRepo('.github/workflows/ci.yml');
    assert.match(ci, /npm ci --ignore-scripts/);
    assert.match(ci, /npm audit/);
    assert.match(ci, /git status --porcelain/);
});
