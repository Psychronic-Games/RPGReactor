const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const nativeDownload = require('../build-scripts/native-download');

function fakeCurl(behaviors) {
    let invocation = 0;
    return (_command, args) => {
        const child = new EventEmitter();
        child.stderr = new EventEmitter();
        const outputIndex = args.indexOf('--output');
        const outputPath = args[outputIndex + 1];
        const behavior = behaviors[Math.min(invocation++, behaviors.length - 1)];
        setTimeout(() => {
            if (behavior.error) {
                child.stderr.emit('data', Buffer.from(behavior.error));
                child.emit('close', 7, null);
                return;
            }
            fs.writeFileSync(outputPath, behavior.content);
            child.emit('close', 0, null);
        }, behavior.delay || 5);
        return child;
    };
}

test('native curl transport writes atomically and reports transferred bytes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-native-download-'));
    try {
        const destination = path.join(root, 'archive.zip');
        const telemetry = [];
        await nativeDownload.download({
            url: 'https://example.invalid/archive.zip',
            destPath: destination,
            spawnProcess: fakeCurl([{ content: Buffer.alloc(2048, 7), delay: 120 }]),
            onTelemetry: update => telemetry.push(update),
            retryDelayMs: 0,
        });
        assert.equal(fs.statSync(destination).size, 2048);
        assert.equal(telemetry[0].state, 'starting');
        assert.equal(telemetry.some(update => update.state === 'downloading' && update.downloaded === 2048), true);
        assert.deepEqual(telemetry.at(-1), {
            downloaded: 2048, total: 2048, state: 'complete', attempt: 1,
        });
        assert.equal(fs.readdirSync(root).some(file => file.endsWith('.part')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('native curl transport retries failures and removes partial files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-native-retry-'));
    try {
        const destination = path.join(root, 'archive.tar.gz');
        const retries = [];
        await nativeDownload.download({
            url: 'https://example.invalid/archive.tar.gz',
            destPath: destination,
            spawnProcess: fakeCurl([
                { error: 'temporary network failure' },
                { content: Buffer.from('verified archive') },
            ]),
            maxAttempts: 3,
            retryDelayMs: 0,
            onRetry: (error, attempt, maxAttempts) => retries.push({ error: error.message, attempt, maxAttempts }),
        });
        assert.equal(fs.readFileSync(destination, 'utf8'), 'verified archive');
        assert.deepEqual(retries, [{ error: 'temporary network failure', attempt: 2, maxAttempts: 3 }]);
        assert.equal(fs.readdirSync(root).some(file => file.endsWith('.part')), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('native curl availability can be host-gated without spawning a process', () => {
    assert.equal(nativeDownload.isAvailable({ force: true }), true);
    assert.equal(nativeDownload.isAvailable({ force: false }), false);
});
