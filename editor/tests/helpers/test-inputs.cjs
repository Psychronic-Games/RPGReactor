'use strict';
/**
 * What a test file actually read, and whether any of it has changed since.
 *
 * test-graph.cjs guesses a test's inputs from the names in its source, and follows those names through every file
 * that mentions another: a comment in the Character Builder naming `reactor_3d_speech.js` tied every Forge sweep to
 * the whole runtime, so one runtime line reran 782 of 958 files (48 of the suite's 57 CPU-minutes, measured
 * 2026-11-10). This records instead: peak-probe.cjs, loaded first into every test process, notes each file the
 * process reads or requires, each folder it lists and each path it asks the existence of. A test that passed is owed
 * again only when one of those has changed. Folders and project data are inputs like any other here, so the tests
 * the graph could never skip ("open") can be skipped too.
 *
 * A process that starts another (a child process, a worker thread) reads things this cannot see: its record is
 * marked `partial`, and run-tier.cjs falls back to the graph for it.
 */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..', '..', '..');
const LARGE = 2 * 1024 * 1024;

/** A path as a record keeps it: from the repository's root, or null for anything outside it or not worth keeping. */
function keyOf(file) {
    if (file && typeof file === 'object' && typeof file.href === 'string') { try { file = require('node:url').fileURLToPath(file); } catch (error) { return null; } }
    if (Buffer.isBuffer(file)) file = file.toString();
    if (typeof file !== 'string' || !file) return null;
    const relative = path.relative(repo, path.resolve(file));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    // Git's own files and installed packages: neither changes with the project's code (a new package changes package-lock.json).
    if (/(^|[\\/])(\.git|node_modules)([\\/]|$)/.test(relative)) return null;
    return relative.split(path.sep).join('/');
}

/** What stands at `key` now, as a short string: a file's content (its size and time when large), a folder's names, or nothing. */
function stateOf(key, cache) {
    if (cache && cache.has(key)) return cache.get(key);
    const full = path.join(repo, key);
    let state = '-';
    try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) state = 'D' + crypto.createHash('sha1').update(fs.readdirSync(full).sort().join('\n')).digest('hex');
        else state = stat.size > LARGE ? 'L' + stat.size + ':' + Math.round(stat.mtimeMs) : 'F' + crypto.createHash('sha1').update(fs.readFileSync(full)).digest('hex');
    } catch (error) { state = '-'; }
    if (cache) cache.set(key, state);
    return state;
}

/** Whether `key` exists, and as what: all a test that only asked "is it there?" depends on. */
function presenceOf(key, cache) {
    const state = stateOf(key, cache);
    return state === '-' ? '-' : state[0] === 'D' ? 'D' : 'F';
}

/** One hash over everything a record names, as it stands now. `record` is { reads, probes }. */
function hashOf(record, cache) {
    const hash = crypto.createHash('sha1').update(process.version);
    for (const key of record.reads) hash.update(key).update(stateOf(key, cache));
    for (const key of record.probes) hash.update(key).update(presenceOf(key, cache));
    return hash.digest('hex');
}

module.exports = { repo, keyOf, stateOf, presenceOf, hashOf };
