'use strict';
// How the tests time the code they hold to a budget.
//
// A cost is the main thread's CPU time: the suite runs many files at once, and the time spent
// waiting for a core is not the code's.
//
// A budget is set on the desktop the game is made on. A shared CI runner (process.env.CI) has
// slower cores, each shared with another thread: the same code costs two to three times the CPU
// time there. So on CI a budget is asserted at SHARED_RUNNER_FACTOR times its size, and a cost
// between the two is reported. A cost ten times its budget still fails everywhere.
//
// A whole run on the desktop is crowded too: with a test file on every core, the same code costs up to
// twice the CPU time it costs alone (the creature preview: 277 ms alone, 572 ms in a run of 14 files at
// once, 2026-11-12; the cores share their caches and their memory). The runner says how many files it
// runs at once (RR_TEST_WORKERS), and with more than two a budget is asserted at CROWDED_RUN_FACTOR
// times its size, the cost reported the same way. A file run alone is held to the budget itself.
const assert = require('node:assert/strict');

const SHARED_RUNNER_FACTOR = 4, CROWDED_RUN_FACTOR = 2;
const sharedRunner = !!process.env.CI;
const crowdedRun = !sharedRunner && Number(process.env.RR_TEST_WORKERS) > 2;
const factor = sharedRunner ? SHARED_RUNNER_FACTOR : crowdedRun ? CROWDED_RUN_FACTOR : 1;
const where = sharedRunner ? 'a shared CI runner' : 'a run of many files at once';

/** The main thread's CPU time so far, in microseconds (the whole process's where Node cannot tell one thread). */
function cpuMicros() {
    const used = typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
    return used.user + used.system;
}

/** Asserts `cost < budget`; on a shared CI runner or in a crowded run, `cost < budget * factor`, reporting a cost over the budget itself. */
function withinBudget(t, cost, budget, message) {
    if (cost < budget) return;
    if (factor > 1 && cost < budget * factor) {
        t.diagnostic('over its desktop budget of ' + budget + ' on ' + where + ' (allowed up to ' + budget * factor + '): ' + message);
        return;
    }
    assert.fail(message + ' (budget ' + (factor > 1 ? budget * factor + ' on ' + where : budget) + ')');
}

module.exports = { cpuMicros, withinBudget, sharedRunner, SHARED_RUNNER_FACTOR };
