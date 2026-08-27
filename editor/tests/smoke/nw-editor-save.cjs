#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { WebDriverClient, poll } = require('./webdriver-client.cjs');

const editorRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(editorRoot, '..');

function option(name) {
    const prefix = `--${name}=`;
    const argument = process.argv.slice(2).find(value => value.startsWith(prefix));
    return argument ? path.resolve(argument.slice(prefix.length)) : null;
}

function version(executable) {
    return execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
}

async function main() {
    const nwRoot = option('nw-root') || (process.env.NWJS_SDK_ROOT ? path.resolve(process.env.NWJS_SDK_ROOT) : path.join(repoRoot, 'nwjs-linux'));
    const nw = path.join(nwRoot, 'nw');
    const chromedriver = path.join(nwRoot, 'chromedriver');
    if (!fs.existsSync(nw) || !fs.existsSync(chromedriver)) {
        throw new Error(`NW.js SDK and matching chromedriver were not found in ${nwRoot}`);
    }
    const nwVersion = version(nw);
    const driverVersion = version(chromedriver);
    const nwChromium = nwVersion.match(/\d+\.\d+\.\d+\.\d+/)?.[0];
    const driverChromium = driverVersion.match(/\d+\.\d+\.\d+\.\d+/)?.[0];
    assert.ok(nwChromium && driverChromium && nwChromium === driverChromium,
        `NW.js and chromedriver must use the same Chromium (${nwVersion}; ${driverVersion})`);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-smoke-'));
    const projectRoot = path.join(tempRoot, 'project');
    const dataRoot = path.join(projectRoot, 'data');
    const metadataPath = path.join(projectRoot, 'project.rpgreactor');
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(metadataPath, JSON.stringify({
        name: 'NW WebDriver Smoke',
        engine: 'RPG Reactor',
        version: '0.98.4',
    }, null, 2));
    fs.writeFileSync(path.join(dataRoot, 'MapInfos.json'), '[]');

    let driver = null;
    try {
        driver = new WebDriverClient(chromedriver, { env: { ...process.env } });
        await driver.start();
        await driver.createSession({
            browserName: 'chrome',
            'goog:chromeOptions': {
                args: [
                    `nwapp=${editorRoot}`,
                    `user-data-dir=${path.join(tempRoot, 'nw-profile')}`,
                    'no-first-run',
                    'no-default-browser-check',
                ],
            },
        });
        await driver.setScriptTimeout(60000);
        await driver.waitForScript('return Boolean(window.reactor?.projectController && window.reactor?.databaseManager);', [], {
            timeout: 90000,
            description: 'actual NW.js editor initialization',
        });

        const token = `nw-smoke-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const result = await driver.executeAsync(`
            const projectPath = arguments[0];
            const token = arguments[1];
            const done = arguments[arguments.length - 1];
            (async () => {
                const app = window.reactor;
                const controller = app.projectController;
                const project = await app.projectManager.loadProject(projectPath);
                if (!project) throw new Error('ProjectManager did not load the temporary project');
                if (!await app.databaseManager.loadAllData(projectPath)) {
                    throw new Error('DatabaseManager did not load the temporary project');
                }
                controller.currentProject = project;
                controller.projectLoaded = true;
                controller.tilemapManager = null;
                controller.captureProjectSavedState();
                project.webdriverSaveToken = token;
                const saved = await controller.saveProject();
                done({ saved, token: project.webdriverSaveToken, mapRenderingUsed: Boolean(controller.tilemapManager) });
            })().catch(error => done({ error: String(error?.stack || error) }));
        `, [projectRoot, token]);
        assert.equal(result.error, undefined);
        assert.equal(result.saved, true);
        assert.equal(result.token, token);
        assert.equal(result.mapRenderingUsed, false, 'the smoke must not initialize map rendering');

        const savedProject = await poll(() => {
            try {
                const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                return parsed.webdriverSaveToken === token ? parsed : null;
            } catch { return null; }
        }, { timeout: 15000, description: 'saved project token on disk' });
        assert.equal(savedProject.webdriverSaveToken, token);
        assert.ok(savedProject.modified, 'ProjectManager wrote its save timestamp');

        process.stdout.write(`NW.js editor save smoke passed with Chromium ${nwChromium}: ${token}\n`);
    } finally {
        if (driver) await driver.close();
        if (!process.argv.includes('--keep-temp')) fs.rmSync(tempRoot, { recursive: true, force: true });
        else process.stdout.write(`Preserved smoke output: ${tempRoot}\n`);
    }
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
