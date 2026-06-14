// Performance Profiler - Track function call frequency and timing
// Helps identify per-frame bottlenecks

class PerformanceProfiler {
    constructor() {
        this.callCounts = {}; // { functionName: count }
        this.callTimes = {}; // { functionName: totalTimeMs }
        this.lastReset = performance.now();
        this.reportInterval = 5000; // Report every 5 seconds (reduced spam)
        this.isEnabled = true;
        this.reportTimer = null;

        // Frame timing
        this.frameTimes = [];
        this.maxFrameHistory = 60; // Track last 60 frames

        // Auto-reporting disabled by default to reduce spam
        // Call window.perfProfiler.startReporting() to enable
        // this.startReporting();
    }

    // Track a frame render time
    recordFrame(deltaMs) {
        this.frameTimes.push(deltaMs);
        if (this.frameTimes.length > this.maxFrameHistory) {
            this.frameTimes.shift();
        }
    }

    // Get frame statistics
    getFrameStats() {
        if (this.frameTimes.length === 0) {
            return { avg: 0, min: 0, max: 0, fps: 0 };
        }

        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        const min = Math.min(...this.frameTimes);
        const max = Math.max(...this.frameTimes);
        const fps = 1000 / avg;

        return { avg, min, max, fps };
    }

    // Wrap a function to track its calls and execution time
    wrap(obj, methodName, groupName = null) {
        if (!this.isEnabled) return;

        const profiler = this;
        const originalMethod = obj[methodName];

        if (typeof originalMethod !== 'function') {
            console.warn(`PerformanceProfiler: ${methodName} is not a function`);
            return;
        }

        const fullName = groupName ? `${groupName}.${methodName}` : methodName;

        obj[methodName] = function(...args) {
            const startTime = performance.now();

            // Track call count
            profiler.callCounts[fullName] = (profiler.callCounts[fullName] || 0) + 1;

            // Execute original function
            const result = originalMethod.apply(this, args);

            // Track execution time
            const elapsed = performance.now() - startTime;
            profiler.callTimes[fullName] = (profiler.callTimes[fullName] || 0) + elapsed;

            return result;
        };
    }

    // Wrap a class method (for use with 'this')
    wrapMethod(instance, methodName, className = null) {
        this.wrap(instance, methodName, className || instance.constructor.name);
    }

    // Start automatic reporting
    startReporting() {
        this.reportTimer = setInterval(() => {
            this.report();
        }, this.reportInterval);
    }

    // Stop automatic reporting
    stopReporting() {
        if (this.reportTimer) {
            clearInterval(this.reportTimer);
            this.reportTimer = null;
        }
    }

    // Generate and log performance report
    report() {
        const now = performance.now();
        const elapsed = (now - this.lastReset) / 1000; // seconds

        // Group by prefix (class name)
        const groups = {};

        for (const [name, count] of Object.entries(this.callCounts)) {
            const callsPerSecond = count / elapsed;
            const avgTimeMs = this.callTimes[name] / count;
            const totalTimeMs = this.callTimes[name];

            // Extract group name
            const parts = name.split('.');
            const groupName = parts.length > 1 ? parts[0] : 'Global';
            const methodName = parts.length > 1 ? parts.slice(1).join('.') : name;

            if (!groups[groupName]) {
                groups[groupName] = [];
            }

            groups[groupName].push({
                method: methodName,
                callsPerSec: callsPerSecond,
                totalCalls: count,
                avgTimeMs: avgTimeMs,
                totalTimeMs: totalTimeMs
            });
        }

        // Log grouped results
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 PERFORMANCE PROFILE (${elapsed.toFixed(1)}s window)`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Show frame statistics
        const frameStats = this.getFrameStats();
        if (frameStats.avg > 0) {
            const fpsIndicator = frameStats.fps >= 55 ? '✓' : frameStats.fps >= 30 ? '⚠️' : '🔥';
            console.log(`\n${fpsIndicator} Frame Stats: ${frameStats.fps.toFixed(1)} FPS (avg ${frameStats.avg.toFixed(2)}ms, min ${frameStats.min.toFixed(2)}ms, max ${frameStats.max.toFixed(2)}ms)`);
        }

        // Sort groups by total time spent
        const sortedGroups = Object.entries(groups).sort((a, b) => {
            const totalA = a[1].reduce((sum, m) => sum + m.totalTimeMs, 0);
            const totalB = b[1].reduce((sum, m) => sum + m.totalTimeMs, 0);
            return totalB - totalA;
        });

        for (const [groupName, methods] of sortedGroups) {
            const groupTotalCalls = methods.reduce((sum, m) => sum + m.totalCalls, 0);
            const groupTotalTime = methods.reduce((sum, m) => sum + m.totalTimeMs, 0);

            console.log(`\n🔹 ${groupName} (${groupTotalCalls} calls, ${groupTotalTime.toFixed(1)}ms total)`);

            // Sort methods by calls per second (hottest first)
            const sortedMethods = methods.sort((a, b) => b.callsPerSec - a.callsPerSec);

            for (const method of sortedMethods) {
                const callRate = method.callsPerSec >= 10 ? '🔥' : method.callsPerSec >= 1 ? '⚠️' : '✓';
                console.log(
                    `  ${callRate} ${method.method.padEnd(30)} ` +
                    `${method.callsPerSec.toFixed(1).padStart(6)}/s  ` +
                    `${method.totalCalls.toString().padStart(5)} calls  ` +
                    `${method.avgTimeMs.toFixed(2).padStart(6)}ms avg  ` +
                    `${method.totalTimeMs.toFixed(1).padStart(8)}ms total`
                );
            }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Reset counters
        this.reset();
    }

    // Reset all counters
    reset() {
        this.callCounts = {};
        this.callTimes = {};
        this.lastReset = performance.now();
    }

    // Enable/disable profiling
    enable() {
        this.isEnabled = true;
        if (!this.reportTimer) {
            this.startReporting();
        }
    }

    disable() {
        this.isEnabled = false;
        this.stopReporting();
    }
}
