#!/usr/bin/env node
'use strict';

const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function getFreePort(host = '127.0.0.1') {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, host, resolve);
    });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

async function poll(check, options = {}) {
    const timeout = options.timeout || 30000;
    const interval = options.interval || 100;
    const description = options.description || 'condition';
    const deadline = Date.now() + timeout;
    let lastError = null;

    while (Date.now() < deadline) {
        try {
            const value = await check();
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await delay(interval);
    }

    const error = new Error(`Timed out after ${timeout}ms waiting for ${description}`);
    if (lastError) error.cause = lastError;
    throw error;
}

/**
 * On Linux, the desktop session's display a harness would open on, or '' when it would open
 * on another (a headless display, CI's xvfb). NW.js follows WAYLAND_DISPLAY when it is set.
 */
function desktopDisplay(env, platform = process.platform) {
    if (platform !== 'linux' || env.RR_HARNESS_ON_DESKTOP === '1') return '';
    if (env.WAYLAND_DISPLAY) return `WAYLAND_DISPLAY=${env.WAYLAND_DISPLAY}`;
    if (/^:0(\.\d+)?$/.test(env.DISPLAY || '')) return `DISPLAY=${env.DISPLAY}`;
    return '';
}

class WebDriverClient {
    constructor(driverPath, options = {}) {
        this.driverPath = driverPath;
        this.host = options.host || '127.0.0.1';
        this.port = options.port || null;
        // The sound mixer remembers a mute per program name, and NW.js says
        // "Chromium": a harness muted there muted every Chromium browser on
        // the desktop afterwards. Harness windows go by a name of their own.
        this.env = Object.assign({ PULSE_PROP_OVERRIDE: "application.name='RPG Reactor harness'" }, options.env || process.env);
        this.driverArgs = options.driverArgs || [];
        this.process = null;
        this.sessionId = null;
        this.output = '';
        this.spawnError = null;
    }

    async start() {
        const onDesktop = desktopDisplay(this.env);
        if (onDesktop) {
            throw new Error(`Refusing to open a harness window on the desktop (${onDesktop}). Start a headless display with editor/tests/perf/headless-display.sh and run with: env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 DISPLAY=<its display> XAUTHORITY= ... Set RR_HARNESS_ON_DESKTOP=1 to open it on the desktop on purpose.`);
        }
        if (!this.port) this.port = await getFreePort(this.host);
        this.process = spawn(this.driverPath, [`--port=${this.port}`, ...this.driverArgs], {
            env: this.env,
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
        });
        const remember = chunk => {
            this.output = (this.output + chunk.toString()).slice(-32000);
        };
        this.process.stdout.on('data', remember);
        this.process.stderr.on('data', remember);
        this.process.once('error', error => { this.spawnError = error; });

        await poll(async () => {
            if (this.spawnError) throw this.spawnError;
            if (this.process.exitCode !== null) {
                throw new Error(`WebDriver exited with code ${this.process.exitCode}\n${this.output}`);
            }
            const status = await this.request('GET', '/status');
            return status?.ready !== false;
        }, { timeout: 15000, description: 'WebDriver status endpoint' });
        return this;
    }

    request(method, endpoint, body) {
        return new Promise((resolve, reject) => {
            const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
            const request = http.request({
                hostname: this.host,
                port: this.port,
                path: endpoint,
                method,
                headers: payload ? {
                    'content-type': 'application/json; charset=utf-8',
                    'content-length': payload.length,
                } : {},
            }, response => {
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    let parsed = null;
                    try { parsed = text ? JSON.parse(text) : {}; } catch (error) {
                        reject(new Error(`Invalid WebDriver response (${response.statusCode}): ${text}`));
                        return;
                    }
                    const value = parsed.value === undefined ? parsed : parsed.value;
                    if (response.statusCode < 200 || response.statusCode >= 300 || value?.error) {
                        const message = value?.message || text || `HTTP ${response.statusCode}`;
                        const error = new Error(`WebDriver ${method} ${endpoint} failed: ${message}`);
                        error.response = parsed;
                        reject(error);
                        return;
                    }
                    resolve(value);
                });
            });
            request.once('error', reject);
            // RR_WEBDRIVER_REQUEST_MS: a longer limit for one request (a profile that samples for a minute).
            request.setTimeout(Number(process.env.RR_WEBDRIVER_REQUEST_MS) || 30000, () => request.destroy(new Error('WebDriver request timed out')));
            if (payload) request.write(payload);
            request.end();
        });
    }

    /**
     * Every NW.js session gets Chromium's software-renderer flag. A CI runner
     * has no GPU, and this Chromium refuses a WebGL context there unless the
     * flag is given, so any smoke that draws a map died on the runner while
     * passing on every desktop. With a GPU the flag changes nothing.
     * `RR_NW_ARGS` adds more, space separated, for emulating such a runner
     * (`--disable-gpu`) or trying a flag without editing a smoke. Sessions
     * are silent (`--mute-audio`) unless `RR_NW_AUDIO=1`: playback still
     * runs, nothing reaches the speakers.
     *
     * Video is decoded in software (`--disable-accelerated-video-decode`). On
     * the headless KWin display (perf/headless-display.sh) with the NVIDIA
     * card, the GPU process cannot import a hardware-decoded frame
     * (`gbm_bo_import` returns null, "CreateSharedImage: could not create
     * backing") and restarts as soon as a map plays a video: every WebGL
     * context is lost, the editor's views go black, and after a few restarts
     * Chromium blocks WebGL for the page ("Web page caused context loss and
     * was blocked"). A real desktop imports those frames; harnesses don't need them.
     */
    async createSession(alwaysMatch) {
        const options = alwaysMatch && alwaysMatch['goog:chromeOptions'];
        if (options && Array.isArray(options.args)) {
            const extra = ['--enable-unsafe-swiftshader', '--disable-accelerated-video-decode', ...(process.env.RR_NW_AUDIO === '1' ? [] : ['--mute-audio']), ...String(process.env.RR_NW_ARGS || '').split(/\s+/).filter(Boolean)];
            for (const flag of extra) if (!options.args.includes(flag)) options.args.push(flag);
            // The session's own profile folder: close() finds the browser's processes by it.
            const profile = options.args.find(arg => /^-*user-data-dir=/.test(arg));
            this.profileDir = profile ? profile.replace(/^-*user-data-dir=/, '') : null;
        }
        const result = await this.request('POST', '/session', {
            capabilities: { alwaysMatch, firstMatch: [{}] },
        });
        this.sessionId = result.sessionId;
        if (!this.sessionId) throw new Error(`WebDriver did not return a session ID: ${JSON.stringify(result)}`);
        return result.capabilities || {};
    }

    sessionRequest(method, endpoint, body) {
        if (!this.sessionId) throw new Error('No WebDriver session is active');
        return this.request(method, `/session/${encodeURIComponent(this.sessionId)}${endpoint}`, body);
    }

    navigate(url) {
        return this.sessionRequest('POST', '/url', { url });
    }

    execute(script, args = []) {
        return this.sessionRequest('POST', '/execute/sync', { script, args });
    }

    executeAsync(script, args = []) {
        return this.sessionRequest('POST', '/execute/async', { script, args });
    }

    setScriptTimeout(milliseconds) {
        return this.sessionRequest('POST', '/timeouts', { script: milliseconds });
    }

    async waitForScript(script, args = [], options = {}) {
        return poll(() => this.execute(script, args), options);
    }

    async close() {
        if (this.sessionId) {
            try { await this.request('DELETE', `/session/${encodeURIComponent(this.sessionId)}`); } catch {}
            this.sessionId = null;
        }
        if (!this.process || !this.process.pid || this.process.exitCode !== null) return;
        try {
            if (process.platform === 'win32') this.process.kill('SIGTERM');
            else process.kill(-this.process.pid, 'SIGTERM');
        } catch {}
        try {
            await poll(() => this.process.exitCode !== null, {
                timeout: 3000,
                interval: 50,
                description: 'WebDriver process exit',
            });
        } catch {
            try {
                if (process.platform === 'win32') this.process.kill('SIGKILL');
                else process.kill(-this.process.pid, 'SIGKILL');
            } catch {}
        }
        this.killProfileProcesses();
    }

    /**
     * NW.js leaves chromedriver's process group, so a session whose page hung (DELETE timed out)
     * left the editor and its GPU process running after the driver was gone: two gigabytes each
     * with SwiftShader, until the machine ran short. Every process still carrying this session's own
     * profile folder on its command line is ended. Linux only; read from /proc, never through a shell.
     */
    killProfileProcesses() {
        if (process.platform !== 'linux' || !this.profileDir) return;
        const fs = require('node:fs');
        const mark = 'user-data-dir=' + this.profileDir;
        let ids = [];
        try { ids = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name)).map(Number); } catch { return; }
        for (const pid of ids) {
            if (pid === process.pid) continue;
            let command = '';
            try { command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' '); } catch { continue; }
            if (!(command.includes(mark + ' ') || command.endsWith(mark + ' ') || command.trimEnd().endsWith(mark))) continue;
            try { process.kill(pid, 'SIGKILL'); } catch {}
        }
    }
}

/**
 * Prints a failed smoke's error with the page's state and browser console,
 * and on GitHub Actions repeats it as an error annotation: annotations are
 * readable through the public API without signing in, step logs are not.
 */
async function reportSmokeFailure(title, error, driver, probeScript) {
    const lines = [String(error && (error.stack || error))];
    if (error && error.cause) lines.push(`cause: ${error.cause.stack || error.cause}`);
    if (driver && driver.sessionId) {
        if (probeScript) {
            try { lines.push(`page: ${JSON.stringify(await driver.execute(probeScript))}`); }
            catch (probeError) { lines.push(`page probe failed: ${probeError.message}`); }
        }
        try {
            const entries = await driver.sessionRequest('POST', '/se/log', { type: 'browser' });
            for (const entry of (Array.isArray(entries) ? entries : []).slice(-25)) {
                lines.push(`console ${entry.level}: ${String(entry.message).slice(0, 400)}`);
            }
        } catch {}
    }
    const text = lines.join('\n');
    console.error(text);
    if (process.env.GITHUB_ACTIONS) {
        const escape = value => value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
        console.log(`::error title=${escape(title).replace(/[:,]/g, ' ')}::${escape(text.slice(0, 6000))}`);
    }
}

module.exports = { WebDriverClient, getFreePort, poll, reportSmokeFailure, desktopDisplay };
