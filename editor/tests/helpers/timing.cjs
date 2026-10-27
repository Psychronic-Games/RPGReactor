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
const assert = require('node:assert/strict');

const sharedRunner = !!process.env.CI;
const SHARED_RUNNER_FACTOR = 4;

/** The main thread's CPU time so far, in microseconds (the whole process's where Node cannot tell one thread). */
function cpuMicros() {
    const used = typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
    return used.user + used.system;
}

/** Asserts `cost < budget`; on a shared CI runner, `cost < budget * SHARED_RUNNER_FACTOR`, reporting a cost over the budget itself. */
function withinBudget(t, cost, budget, message) {
    if (cost < budget) return;
    if (sharedRunner && cost < budget * SHARED_RUNNER_FACTOR) {
        t.diagnostic('over its desktop budget of ' + budget + ' on a shared CI runner (allowed up to ' + budget * SHARED_RUNNER_FACTOR + '): ' + message);
        return;
    }
    assert.fail(message + ' (budget ' + (sharedRunner ? budget * SHARED_RUNNER_FACTOR + ' on a shared CI runner' : budget) + ')');
}

module.exports = { cpuMicros, withinBudget, sharedRunner, SHARED_RUNNER_FACTOR };
