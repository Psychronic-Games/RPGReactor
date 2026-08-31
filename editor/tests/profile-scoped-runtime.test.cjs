/**
 * Chromium migrates its user profile forward only, and NW.js derives the
 * profile directory from the manifest's `name`. Every shipped build once
 * shared `rpg-reactor`, so one run of a newer-Chromium build upgraded the
 * profile schema and every older-runtime build after it died on a fatal
 * CHECK during profile init — exit code 0, no window, invisible on any
 * clean test machine. The bundled manifest name is therefore scoped to the
 * runtime (`rpg-reactor-nw0107`), the repo manifest stays `rpg-reactor`,
 * and the build refuses to ship a runtime older than the newest ever
 * shipped.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(editorRoot, relativePath), 'utf8');

test('the bundled manifest name is scoped to the NW.js runtime', () => {
    const worker = read('build-scripts/dist-editor-worker.js');
    assert.match(worker, /rpg-reactor-nw\$\{profileKey\}|`rpg-reactor-nw\$\{/,
        'the staging step rewrites the bundled name per runtime');
    assert.match(worker, /name_for_display/,
        'the user-visible name is asserted alongside the rewrite');
});

test('the repo manifest keeps its identity and display name', () => {
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.name, 'rpg-reactor', 'the repository manifest is not the shipped one');
    assert.equal(pkg.name_for_display, 'RPG Reactor');
});

test('nothing reads the manifest name at runtime', () => {
    const offenders = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules') continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) { walk(full); continue; }
            if (!entry.name.endsWith('.js')) continue;
            const source = fs.readFileSync(full, 'utf8');
            if (/manifest\.name(?!_for_display)/.test(source)) {
                offenders.push(path.relative(editorRoot, full));
            }
        }
    };
    walk(path.join(editorRoot, 'src'));
    assert.deepEqual(offenders, []);
});

test('deployed games scope their profile to the bundled runtime too', () => {
    const worker = read('build-scripts/build-worker.js');
    assert.match(worker, /normalizeStagedPackage\(stagingDir, gameTitle, nwVersion\)/,
        'the deploy passes the resolved runtime into the manifest write');
    assert.match(worker, /\$\{baseName\}-\$\{profileKey\}/,
        'every game name carries the runtime suffix');
    assert.match(worker, /await ensureNwVersion\(\);\s*\n\s*normalizeStagedPackage/,
        'the version is resolved before the manifest is written');
});

test('the build refuses a runtime downgrade below the newest ever shipped', () => {
    const shipped = JSON.parse(read('build-scripts/shipped-runtime.json'));
    assert.match(shipped.nwVersion, /^\d+\.\d+\.\d+$/);
    const worker = read('build-scripts/dist-editor-worker.js');
    assert.match(worker, /shipped-runtime\.json/);
    assert.match(worker, /RPGREACTOR_ALLOW_RUNTIME_DOWNGRADE/);
    // The floor must never fall behind the version the release pipeline pins.
    const checklist = fs.readFileSync(
        path.join(editorRoot, '..', 'docs', 'RELEASE-CHECKLIST.md'), 'utf8');
    assert.ok(checklist.includes(shipped.nwVersion),
        'shipped-runtime.json names the version the checklist pins');
});
