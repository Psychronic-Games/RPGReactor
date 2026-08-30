/**
 * Every bundled project runs the current runtime.
 *
 * `runtime/` is the source of truth and each project under `template/` keeps
 * its own copy in `js/` — which is what a real project looks like, since the
 * editor copies the runtime in at creation and never touches it again. They
 * drift silently, and a runtime fix verified against a stale copy has not been
 * verified.
 *
 * Only the Demo is tracked in git, so on a clean checkout this covers the Demo
 * alone. Locally it covers whatever other test beds are present, which is
 * exactly where a fix gets tried by hand and where it went stale before.
 * Nothing here names a particular project, so a checkout with only the tracked
 * one passes for the same reason a full working copy does.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, 'runtime');
const templateRoot = path.join(repoRoot, 'template');

// A project's own plugin list; the copy in runtime/ is the empty one a new
// project starts with.
const PER_PROJECT = new Set(['reactor_plugins.js']);

function filesUnder(dir, prefix = '') {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? path.join(prefix, entry.name) : entry.name;
        if (entry.isDirectory()) found.push(...filesUnder(path.join(dir, entry.name), rel));
        else found.push(rel);
    }
    return found;
}

function bundledProjects() {
    if (!fs.existsSync(templateRoot)) return [];
    return fs.readdirSync(templateRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => fs.existsSync(path.join(templateRoot, name, 'js')));
}

test('every bundled project carries the current runtime', () => {
    const projects = bundledProjects();
    assert.ok(projects.length > 0, 'at least the Demo is bundled');

    const drifted = [];
    for (const project of projects) {
        for (const rel of filesUnder(runtimeRoot)) {
            if (PER_PROJECT.has(path.basename(rel))) continue;
            const source = path.join(runtimeRoot, rel);
            const copy = path.join(templateRoot, project, 'js', rel);
            if (!fs.existsSync(copy)
                || !fs.readFileSync(source).equals(fs.readFileSync(copy))) {
                drifted.push(`${project}/js/${rel}`);
            }
        }
    }

    assert.deepEqual(drifted, [],
        'these have drifted from runtime/ — run '
        + '`node editor/build-scripts/sync-runtime.cjs`:\n' + drifted.join('\n'));
});

test('the sync script exists and can report without changing anything', () => {
    // The failure above names a command; the command has to be there, and it
    // has to have a way of answering the same question the test asks.
    const script = path.join(repoRoot, 'editor', 'build-scripts', 'sync-runtime.cjs');
    assert.ok(fs.existsSync(script), 'sync-runtime.cjs is present');
    const source = fs.readFileSync(script, 'utf8');
    assert.match(source, /--check/, 'it offers a read-only mode');
    assert.match(source, /reactor_plugins\.js/, 'and leaves per-project files alone');
});
