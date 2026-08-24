const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const demoRoot = path.join(repoRoot, 'template', 'Demo');
const mainPath = path.join(demoRoot, 'js', 'reactor_main.js');

/**
 * template/Demo is the one project directory the repository tracks, and
 * dist-editor-worker.js bundles it into the editor. Anything the Demo needs at
 * boot but that is only present on the author's disk ships as a missing file.
 */
function trackedUnder(relativeDirectory) {
    const output = execFileSync('git', ['ls-files', '-z', relativeDirectory], {
        cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
    return new Set(output.split('\0').filter(Boolean));
}

function bootManifest() {
    const source = fs.readFileSync(mainPath, 'utf8');
    const block = source.match(/const scriptUrls = \[([\s\S]*?)\];/);
    assert.ok(block, 'reactor_main.js declares its script list');
    const urls = [...block[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
    assert.ok(urls.length >= 10, `the manifest is populated (${urls.length} entries)`);
    return urls;
}

test('every script the Demo boots is committed, not just present locally', () => {
    // A missing script never fires onScriptLoad, so loadCount never reaches
    // numScripts and onScriptsLoaded is never called: the Demo stops on the
    // loading spinner rather than degrading. A clean clone would ship that.
    const tracked = trackedUnder('template/Demo/js');
    const missing = [];
    for (const url of bootManifest()) {
        const relativePath = `template/Demo/${url}`;
        if (!fs.existsSync(path.join(repoRoot, url.replace(/^/, 'template/Demo/')))) {
            missing.push(`${url} (absent from the working tree)`);
        } else if (!tracked.has(relativePath)) {
            missing.push(`${url} (present locally but untracked — git add it)`);
        }
    }
    assert.deepEqual(missing, [],
        `the bundled Demo cannot boot from a clean checkout:\n${missing.join('\n')}`);
});

test('the boot failure is total, which is why the check has to be mechanical', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    assert.match(source, /onScriptLoad\(\)\s*\{\s*if \(\+\+this\.loadCount === this\.numScripts\)/,
        'the loader waits for every script');
    assert.match(source, /onScriptError\([\s\S]{0,120}printError\("Failed to load"/,
        'and an error only reports, it does not continue');
});

test('the effekseer wasm the loader names is committed too', () => {
    const source = fs.readFileSync(mainPath, 'utf8');
    const wasm = source.match(/const effekseerWasmUrl = "([^"]+)"/);
    assert.ok(wasm, 'the wasm url is declared');
    const tracked = trackedUnder('template/Demo/js');
    assert.ok(tracked.has(`template/Demo/${wasm[1]}`), `${wasm[1]} is tracked`);
});

test('the Demo runtime matches the canonical runtime it was copied from', () => {
    // runtime/ is the source of truth; the templates keep their own copies and
    // have drifted before. Compare the files that exist in both.
    const mismatched = [];
    for (const url of bootManifest()) {
        if (!url.startsWith('js/')) continue;
        const canonical = path.join(repoRoot, 'runtime', url.slice('js/'.length));
        const demo = path.join(demoRoot, url);
        if (!fs.existsSync(canonical) || !fs.existsSync(demo)) continue;
        // The plugin manifest is per-project by design.
        if (path.basename(url) === 'reactor_plugins.js') continue;
        if (!fs.readFileSync(canonical).equals(fs.readFileSync(demo))) mismatched.push(url);
    }
    assert.deepEqual(mismatched, [],
        `these have drifted from runtime/:\n${mismatched.join('\n')}`);
});

test('the Demo declares its engine mode without browser marker probes', () => {
    const index = fs.readFileSync(path.join(demoRoot, 'index.html'), 'utf8');
    assert.match(index, /window\.\$reactorMvCompat = false/,
        'the bundled MZ project must not probe for missing MV marker files on Web');
    assert.ok(index.indexOf('$reactorMvCompat') < index.indexOf('js/reactor_main.js'),
        'the runtime reads the mode while its compatibility layer loads');
});

test('the editor distribution bundles the Demo, which is what makes this ship', () => {
    const worker = fs.readFileSync(
        path.join(repoRoot, 'editor', 'build-scripts', 'dist-editor-worker.js'), 'utf8');
    assert.match(worker, /INCLUDE_REPOSITORY_DIRS = \[path\.join\('template', 'Demo'\)\]/);
});

test('every tracked Demo asset is present on disk', () => {
    // A tracked asset missing locally ships as a hole in the next build.
    // Intentional removals must be staged with git rm so the tracked set
    // and the disk agree; this catches the accidental kind.
    const missing = [];
    for (const relative of trackedUnder(path.join('template', 'Demo'))) {
        if (!fs.existsSync(path.join(repoRoot, relative))) missing.push(relative);
    }
    assert.deepEqual(missing, [], `tracked Demo files missing on disk: ${missing.slice(0, 5).join(', ')}`);
});
