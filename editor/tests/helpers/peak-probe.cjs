'use strict';
// Loaded into every test process by run-tier.cjs: one line per test file as it ends, with its exit code, peak memory and
// CPU seconds. A pass is kept the moment it happens, so a crash loses nothing, and a killed process writes no line.
const fs = require('node:fs'), path = require('node:path');
const file = process.argv[1] || '', out = process.env.RR_TEST_PEAKS;
// Only a file's own process: the parent runner has a test file as its argv too, and exits with the whole run's code.
if (out && process.env.NODE_TEST_CONTEXT && file.endsWith('.test.cjs')) process.on('exit', code => {
    const use = process.resourceUsage();
    fs.appendFileSync(out, JSON.stringify({ file: path.basename(file), code: code || process.exitCode || 0, rssMB: Math.round(use.maxRSS / 1024), cpu: Math.round((use.userCPUTime + use.systemCPUTime) / 1e5) / 10 }) + '\n');
});
