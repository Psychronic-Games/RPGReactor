'use strict';
// Loaded into every test process by run-tier.cjs: one line per test file as it ends, with its exit code, peak memory and
// CPU seconds. A pass is kept the moment it happens, so a crash loses nothing, and a killed process writes no line.
// It also notes what the process read (test-inputs.cjs): the line carries those paths and one hash over them, so the
// next run can tell whether anything this test depends on has changed.
const fs = require('node:fs'), path = require('node:path');
const file = process.argv[1] || '', out = process.env.RR_TEST_PEAKS;
// Only a file's own process: the parent runner has a test file as its argv too, and exits with the whole run's code.
if (out && process.env.NODE_TEST_CONTEXT && file.endsWith('.test.cjs')) {
    const Inputs = require('./test-inputs.cjs');
    const reads = new Set(), probes = new Set();
    let partial = false;
    const note = (set, target) => { const key = Inputs.keyOf(target); if (key) set.add(key); };
    // Each of these names its path first. The original runs untouched; a path that is no path (a file descriptor) is passed over.
    const wrap = (owner, name, set) => {
        const original = owner && owner[name];
        if (typeof original !== 'function') return;
        const wrapped = function(target) { try { note(set, target); } catch (error) { /* never the test's problem */ } return original.apply(this, arguments); };
        Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(original));
        owner[name] = wrapped;
    };
    for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream', 'readdirSync', 'readdir', 'opendirSync', 'opendir', 'copyFileSync', 'copyFile', 'cpSync', 'cp']) wrap(fs, name, reads);
    for (const name of ['existsSync', 'exists', 'statSync', 'stat', 'lstatSync', 'lstat', 'accessSync', 'access', 'realpathSync']) wrap(fs, name, probes);
    for (const name of ['readFile', 'open', 'readdir', 'opendir', 'copyFile', 'cp']) wrap(fs.promises, name, reads);
    for (const name of ['stat', 'lstat', 'access', 'realpath']) wrap(fs.promises, name, probes);
    // Another process or thread reads what this one cannot see: the record says so, and is not trusted alone.
    const mark = (owner, names) => { for (const name of names) { const original = owner[name]; if (typeof original !== 'function') continue; owner[name] = function() { partial = true; return original.apply(this, arguments); }; Object.defineProperties(owner[name], Object.getOwnPropertyDescriptors(original)); } };
    try { mark(require('node:child_process'), ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']); } catch (error) { partial = true; }
    try {
        const threads = require('node:worker_threads'), Original = threads.Worker;
        threads.Worker = class extends Original { constructor(...args) { partial = true; super(...args); } };
    } catch (error) { partial = true; }
    process.on('exit', code => {
        const use = process.resourceUsage();
        const row = { file: path.basename(file), code: code || process.exitCode || 0, rssMB: Math.round(use.maxRSS / 1024), cpu: Math.round((use.userCPUTime + use.systemCPUTime) / 1e5) / 10 };
        try {
            // Every module loaded, however the loader read it.
            for (const loaded of Object.keys(require.cache)) note(reads, loaded);
            note(reads, file);
            // A path only asked after is a read once it was read.
            for (const key of reads) probes.delete(key);
            const record = { reads: [...reads].sort(), probes: [...probes].sort() };
            row.inputs = { reads: record.reads, probes: record.probes, partial, hash: Inputs.hashOf(record, new Map()) };
        } catch (error) { /* a line without inputs: the graph decides for this file */ }
        fs.appendFileSync(out, JSON.stringify(row) + '\n');
    });
}
