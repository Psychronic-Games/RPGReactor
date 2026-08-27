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

class WebDriverClient {
    constructor(driverPath, options = {}) {
        this.driverPath = driverPath;
        this.host = options.host || '127.0.0.1';
        this.port = options.port || null;
        this.env = options.env || process.env;
        this.driverArgs = options.driverArgs || [];
        this.process = null;
        this.sessionId = null;
        this.output = '';
        this.spawnError = null;
    }

    async start() {
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
            request.setTimeout(30000, () => request.destroy(new Error('WebDriver request timed out')));
            if (payload) request.write(payload);
            request.end();
        });
    }

    async createSession(alwaysMatch) {
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
    }
}

module.exports = { WebDriverClient, getFreePort, poll };
