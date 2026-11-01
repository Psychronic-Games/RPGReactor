/**
 * A node:test reporter that adds up each test file's seconds and writes them as JSON, slowest first, for
 * `run-tier.cjs --measure`. Only a file's top-level tests count, so a subtest is not counted twice.
 */
import path from 'node:path';

export default async function* fileTimes(source) {
    const seconds = new Map();
    for await (const event of source) {
        if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
        const { file, nesting, name, details } = event.data;
        if (!file || nesting !== 0 || path.basename(file) === name) continue;
        const key = path.basename(file);
        seconds.set(key, (seconds.get(key) || 0) + (details?.duration_ms || 0) / 1000);
    }
    const rows = [...seconds].sort((a, b) => b[1] - a[1]).map(([file, time]) => [file, Math.round(time * 10) / 10]);
    yield JSON.stringify(Object.fromEntries(rows), null, 2) + '\n';
}
