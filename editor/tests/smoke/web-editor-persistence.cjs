#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Worker } = require('node:worker_threads');
const { WebDriverClient, getFreePort } = require('./webdriver-client.cjs');

const editorRoot = path.resolve(__dirname, '..', '..');
const appVersion = JSON.parse(fs.readFileSync(path.join(editorRoot, 'package.json'), 'utf8')).version;

function option(name) {
    const prefix = `--${name}=`;
    const argument = process.argv.slice(2).find(value => value.startsWith(prefix));
    return argument ? argument.slice(prefix.length) : null;
}

function executable(candidates) {
    for (const candidate of candidates.filter(Boolean)) {
        if (path.isAbsolute(candidate) && fs.existsSync(candidate)) return candidate;
        for (const directory of (process.env.PATH || '').split(path.delimiter)) {
            const resolved = path.join(directory, candidate);
            if (fs.existsSync(resolved)) return resolved;
        }
    }
    return null;
}

function buildWeb(outputDir) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(editorRoot, 'build-scripts', 'dist-editor-worker.js'), {
            workerData: {
                appRoot: editorRoot,
                platforms: [],
                packageType: 'web',
                edition: 'normal',
                nwVersion: '0.107.0',
                outputDir,
            },
        });
        let result = null;
        worker.on('message', message => {
            if (message.type === 'log' && process.env.SMOKE_VERBOSE) process.stdout.write(`${message.message}\n`);
            if (message.type === 'done') result = message;
        });
        worker.once('error', reject);
        worker.once('exit', code => {
            if (code !== 0) reject(new Error(`Web distribution worker exited with code ${code}`));
            else if (!result?.success) reject(new Error('Web distribution build failed'));
            else resolve();
        });
    });
}

function startStaticServer(root) {
    const mimeTypes = {
        '.css': 'text/css',
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.wasm': 'application/wasm',
    };
    const rootPrefix = `${path.resolve(root)}${path.sep}`;
    const server = http.createServer((request, response) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); } catch {
            response.writeHead(400).end();
            return;
        }
        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const filePath = path.resolve(root, relative);
        if (!filePath.startsWith(rootPrefix) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, {
            'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'cache-control': 'no-store',
            'service-worker-allowed': '/',
        });
        fs.createReadStream(filePath).pipe(response);
    });
    return server;
}

async function main() {
    const chrome = executable([
        option('chrome'), process.env.CHROME_BIN, '/usr/bin/chromium', '/usr/bin/google-chrome',
        'chromium', 'google-chrome',
    ]);
    const chromedriver = executable([
        option('driver'), process.env.CHROMEDRIVER_BIN, '/usr/bin/chromedriver', 'chromedriver',
    ]);
    if (!chrome || !chromedriver) throw new Error('Chromium and chromedriver are required (use --chrome= and --driver=)');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-web-smoke-'));
    const outputDir = path.join(tempRoot, 'dist');
    const webRoot = path.join(tempRoot, 'web');
    let server = null;
    let driver = null;
    try {
        fs.mkdirSync(outputDir);
        fs.mkdirSync(webRoot);
        await buildWeb(outputDir);
        execFileSync('unzip', ['-q', path.join(outputDir, `RPGReactor-v${appVersion}-web.zip`), '-d', webRoot]);

        const port = await getFreePort();
        server = startStaticServer(webRoot);
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, '127.0.0.1', resolve);
        });

        driver = new WebDriverClient(chromedriver);
        await driver.start();
        await driver.createSession({
            browserName: 'chrome',
            'goog:chromeOptions': {
                binary: chrome,
                args: [
                    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
                    '--enable-unsafe-swiftshader', `--user-data-dir=${path.join(tempRoot, 'chrome-profile')}`,
                ],
            },
        });
        await driver.setScriptTimeout(60000);
        const url = `http://127.0.0.1:${port}/`;
        await driver.navigate(url);
        await driver.waitForScript(
            'return Boolean(window.reactor?.projectController?.projectLoaded && window.RPGReactorHost?.db);',
            [], { timeout: 90000, description: 'Web editor project load' });

        const token = `web-smoke-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        await driver.execute(`
            const token = arguments[0];
            const controller = window.reactor.projectController;
            const host = window.RPGReactorHost;
            const originalFlush = host.flush.bind(host);
            let release;
            const gate = new Promise(resolve => { release = resolve; });
            window.__rrWebSmoke = { flushReached: false, settled: false, result: null, error: null, release };
            host.flush = async () => {
                await originalFlush();
                window.__rrWebSmoke.flushReached = true;
                await gate;
            };
            controller.currentProject.webdriverPersistenceToken = token;
            controller.saveProject().then(result => {
                window.__rrWebSmoke.result = result;
                window.__rrWebSmoke.settled = true;
            }, error => {
                window.__rrWebSmoke.error = String(error?.stack || error);
                window.__rrWebSmoke.settled = true;
            });
            return token;
        `, [token]);
        await driver.waitForScript('return window.__rrWebSmoke?.flushReached;', [], {
            timeout: 60000,
            description: 'ProjectController save reaching the host flush gate',
        });
        assert.equal(await driver.execute('return window.__rrWebSmoke.settled;'), false,
            'saveProject must remain pending until host.flush resolves');
        await driver.execute('window.__rrWebSmoke.release();');
        await driver.waitForScript('return window.__rrWebSmoke?.settled;', [], {
            timeout: 30000,
            description: 'ProjectController save completion',
        });
        const saveResult = await driver.execute('return window.__rrWebSmoke;');
        assert.equal(saveResult.error, null);
        assert.equal(saveResult.result, true);

        const storedToken = await driver.executeAsync(`
            const done = arguments[arguments.length - 1];
            const request = window.RPGReactorHost.db.transaction('files', 'readonly')
                .objectStore('files').get('project.rpgreactor');
            request.onsuccess = () => {
                try { done(JSON.parse(request.result.data).webdriverPersistenceToken); }
                catch (error) { done({ error: String(error) }); }
            };
            request.onerror = () => done({ error: String(request.error) });
        `);
        assert.equal(storedToken, token, 'IndexedDB contains the saved project token');

        await driver.navigate(url);
        await driver.waitForScript(
            'return window.reactor?.projectController?.currentProject?.webdriverPersistenceToken || false;',
            [], { timeout: 90000, description: 'saved token after Web editor reload' });
        assert.equal(await driver.execute(
            'return window.reactor.projectController.currentProject.webdriverPersistenceToken;'), token);

        process.stdout.write(`Web editor persistence smoke passed: ${token}\n`);
    } finally {
        if (driver) await driver.close();
        if (server) await new Promise(resolve => server.close(resolve));
        if (!process.argv.includes('--keep-temp')) fs.rmSync(tempRoot, { recursive: true, force: true });
        else process.stdout.write(`Preserved smoke output: ${tempRoot}\n`);
    }
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
