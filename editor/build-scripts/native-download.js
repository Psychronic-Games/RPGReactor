const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

let curlAvailable;

function isAvailable(options = {}) {
    if (options.force !== undefined) return Boolean(options.force);
    if (curlAvailable !== undefined) return curlAvailable;
    const probe = (options.spawnSyncProcess || spawnSync)(
        process.platform === 'win32' ? 'curl.exe' : 'curl',
        ['--version'],
        { stdio: 'ignore', windowsHide: true });
    curlAvailable = !probe.error && probe.status === 0;
    return curlAvailable;
}

function removePartial(filePath) {
    try { fs.rmSync(filePath, { force: true }); } catch {}
}

function downloadAttempt(options, attempt) {
    return new Promise((resolve, reject) => {
        const partPath = `${options.destPath}.${process.pid}.${Date.now()}.${attempt}.part`;
        removePartial(partPath);
        const args = [
            '--location',
            '--fail',
            '--silent',
            '--show-error',
            '--connect-timeout', '30',
            '--speed-limit', '1',
            '--speed-time', String(Math.ceil(options.idleTimeoutMs / 1000)),
        ];
        for (const [name, value] of Object.entries(options.headers || {})) {
            args.push('--header', `${name}: ${value}`);
        }
        args.push('--output', partPath, options.url);

        let downloaded = 0;
        let stderr = '';
        let settled = false;
        options.onTelemetry({ downloaded: 0, total: 0, state: attempt === 1 ? 'starting' : 'retrying', attempt });

        const spawnProcess = options.spawnProcess || spawn;
        const child = spawnProcess(process.platform === 'win32' ? 'curl.exe' : 'curl', args, {
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true,
        });
        if (child.stderr) {
            child.stderr.on('data', chunk => {
                stderr = `${stderr}${chunk}`.slice(-8192);
            });
        }

        const report = () => {
            try { downloaded = fs.statSync(partPath).size; } catch { downloaded = 0; }
            options.onTelemetry({ downloaded, total: 0, state: 'downloading', attempt });
        };
        const timer = setInterval(report, 100);

        const finish = (error) => {
            if (settled) return;
            settled = true;
            clearInterval(timer);
            report();
            if (error) {
                removePartial(partPath);
                reject(error);
                return;
            }
            try {
                fs.rmSync(options.destPath, { force: true });
                fs.renameSync(partPath, options.destPath);
                options.onTelemetry({ downloaded, total: downloaded, state: 'complete', attempt });
                resolve();
            } catch (renameError) {
                removePartial(partPath);
                reject(renameError);
            }
        };

        child.on('error', finish);
        child.on('close', (code, signal) => {
            if (code === 0) finish();
            else finish(new Error(
                stderr.trim() || `curl exited with ${code === null ? `signal ${signal}` : `code ${code}`}`));
        });
    });
}

async function download(options) {
    const maxAttempts = options.maxAttempts || 3;
    const settings = {
        ...options,
        idleTimeoutMs: options.idleTimeoutMs || 180000,
        onTelemetry: options.onTelemetry || (() => {}),
    };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await downloadAttempt(settings, attempt);
            return;
        } catch (error) {
            if (attempt >= maxAttempts) {
                settings.onTelemetry({ downloaded: 0, total: 0, state: 'failed', attempt });
                throw error;
            }
            settings.onTelemetry({ downloaded: 0, total: 0, state: 'retrying', attempt: attempt + 1 });
            if (settings.onRetry) settings.onRetry(error, attempt + 1, maxAttempts);
            const retryDelay = settings.retryDelayMs === undefined ? attempt * 1000 : settings.retryDelayMs;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }
}

module.exports = { download, isAvailable };
