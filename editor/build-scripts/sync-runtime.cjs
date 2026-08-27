#!/usr/bin/env node
/**
 * Copy the canonical runtime into every bundled project.
 *
 * `runtime/` is the source of truth and each project under `template/` keeps
 * its own copy in `js/`, because that is what a real project looks like — the
 * editor copies the runtime into new projects and refreshes Reactor projects
 * when their engine version changes. Bundled and local corpus copies can still
 * drift between refreshes, and a fix tested against a stale copy is not tested
 * at all.
 *
 *   node editor/build-scripts/sync-runtime.cjs            # copy what differs
 *   node editor/build-scripts/sync-runtime.cjs --check    # report, change nothing
 *
 * `--check` exits non-zero when anything has drifted, so it can gate a release.
 *
 * `reactor_plugins.js` is skipped: it is a project's own plugin list, and the
 * copy in `runtime/` is the empty one a new project starts with.
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, 'runtime');
const templateRoot = path.join(repoRoot, 'template');

/** Files a project owns rather than inherits. */
const PER_PROJECT = new Set(['reactor_plugins.js']);

const checkOnly = process.argv.includes('--check');

/** Every file under `dir`, relative to it. */
function filesUnder(dir, prefix = '') {
    const found = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? path.join(prefix, entry.name) : entry.name;
        if (entry.isDirectory()) found.push(...filesUnder(path.join(dir, entry.name), rel));
        else found.push(rel);
    }
    return found;
}

if (!fs.existsSync(templateRoot)) {
    console.log('No template/ directory; nothing to sync.');
    process.exit(0);
}

const runtimeFiles = filesUnder(runtimeRoot);
const projects = fs.readdirSync(templateRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => fs.existsSync(path.join(templateRoot, name, 'js')));

let drifted = 0;
let copied = 0;

for (const project of projects) {
    const target = path.join(templateRoot, project, 'js');
    const stale = [];
    for (const rel of runtimeFiles) {
        if (PER_PROJECT.has(path.basename(rel))) continue;
        const source = path.join(runtimeRoot, rel);
        const destination = path.join(target, rel);
        // Only files the project already has: a project that never shipped a
        // file does not gain one here, because adding to someone's js/ is a
        // different decision from keeping it current.
        if (!fs.existsSync(destination)) continue;
        if (fs.readFileSync(source).equals(fs.readFileSync(destination))) continue;
        stale.push(rel);
        if (!checkOnly) fs.copyFileSync(source, destination);
    }
    if (!stale.length) continue;
    drifted += stale.length;
    if (!checkOnly) copied += stale.length;
    console.log(`${project}:`);
    for (const rel of stale) console.log(`  ${checkOnly ? 'stale' : 'updated'}  ${rel}`);
}

if (!drifted) {
    console.log(`All ${projects.length} bundled project(s) match runtime/.`);
    process.exit(0);
}
if (checkOnly) {
    console.error(`\n${drifted} file(s) have drifted from runtime/. `
        + 'Run without --check to update them.');
    process.exit(1);
}
console.log(`\nUpdated ${copied} file(s) across ${projects.length} project(s).`);
