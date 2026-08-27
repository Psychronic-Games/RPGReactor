#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { WebDriverClient } = require('./webdriver-client.cjs');

const editorRoot = path.resolve(__dirname, '..', '..');
const repoRoot = path.resolve(editorRoot, '..');
const demoRoot = path.join(repoRoot, 'template', 'Demo');

function option(name) {
    const prefix = `--${name}=`;
    const argument = process.argv.slice(2).find(value => value.startsWith(prefix));
    return argument ? path.resolve(argument.slice(prefix.length)) : null;
}

function version(executable) {
    return execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
}

async function resize(driver, width, height) {
    return driver.executeAsync(`
        const width = arguments[0], height = arguments[1], done = arguments[arguments.length - 1];
        nw.Window.get().resizeTo(width, height);
        let stable = 0, previous = '';
        const poll = () => {
            const current = window.outerWidth + 'x' + window.outerHeight + ':' + window.innerWidth + 'x' + window.innerHeight;
            stable = current === previous ? stable + 1 : 0;
            previous = current;
            if (stable >= 3) done({ outerWidth, outerHeight, innerWidth, innerHeight });
            else setTimeout(poll, 80);
        };
        setTimeout(poll, 80);
    `, [width, height]);
}

async function measure(driver) {
    return driver.execute(`
        const q = selector => document.querySelector(selector);
        const box = selector => {
            const element = q(selector);
            if (!element) return null;
            const rect = element.getBoundingClientRect();
            return { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1),
                right: +rect.right.toFixed(1), bottom: +rect.bottom.toFixed(1) };
        };
        const overlaps = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1
            && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
        const editor = q('.rr-ui-editor');
        const toolbar = q('.rr-ui-toolbar');
        const workspace = q('.rr-ui-workspace');
        const layers = q('.rr-ui-tree-panel');
        const layout = q('.rr-ui-canvas-panel');
        const inspector = q('.rr-ui-props-panel');
        const detail = q('#database-detail');
        const reference = q('.rr-ui-game-reference > summary');
        const editorStyle = getComputedStyle(editor);
        const workspaceStyle = getComputedStyle(workspace);
        const inspectorStyle = getComputedStyle(inspector);
        const expectedWorkspaceHeight = editor.clientHeight - parseFloat(editorStyle.paddingTop) - parseFloat(editorStyle.paddingBottom)
            - toolbar.getBoundingClientRect().height - parseFloat(editorStyle.rowGap || editorStyle.gap);
        const toolbarChildren = [...toolbar.children];
        const panelBoxes = [box('.rr-ui-tree-panel'), box('.rr-ui-canvas-panel'), box('.rr-ui-props-panel')];
        return {
            viewport: { innerWidth, innerHeight, outerWidth, outerHeight },
            detail: box('#database-detail'), editor: box('.rr-ui-editor'), toolbar: box('.rr-ui-toolbar'), workspace: box('.rr-ui-workspace'),
            layers: panelBoxes[0], layout: panelBoxes[1], inspector: panelBoxes[2], reference: box('.rr-ui-game-reference > summary'),
            documentScroll: { clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight,
                clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
            detailScroll: { clientHeight: detail.clientHeight, scrollHeight: detail.scrollHeight, clientWidth: detail.clientWidth, scrollWidth: detail.scrollWidth },
            editorScroll: { clientHeight: editor.clientHeight, scrollHeight: editor.scrollHeight, clientWidth: editor.clientWidth, scrollWidth: editor.scrollWidth },
            workspaceExpectedHeight: +expectedWorkspaceHeight.toFixed(1), fit: workspaceStyle.getPropertyValue('--rr-ui-fit').trim(),
            inspectorPosition: inspectorStyle.position, inspectorVisibility: inspectorStyle.visibility, inspectorDisplay: inspectorStyle.display,
            inspectorOpen: inspector.classList.contains('is-open'), inspectorTitle: q('.rr-ui-inspector-title').textContent.trim(),
            referenceVisible: Boolean(reference && reference.getBoundingClientRect().bottom <= layers.getBoundingClientRect().bottom + 1
                && reference.getBoundingClientRect().top >= layers.getBoundingClientRect().top - 1),
            toolbarContained: toolbarChildren.every(element => {
                const rect = element.getBoundingClientRect(), parent = toolbar.getBoundingClientRect();
                return rect.left >= parent.left - 1 && rect.right <= parent.right + 1 && rect.top >= parent.top - 1 && rect.bottom <= parent.bottom + 1;
            }),
            controlHeights: {
                gameReference: reference ? +reference.getBoundingClientRect().height.toFixed(1) : 0,
                capture: +q('.rr-ui-capture').getBoundingClientRect().height.toFixed(1),
                undo: +q('.rr-ui-undo').getBoundingClientRect().height.toFixed(1),
                redo: +q('.rr-ui-redo').getBoundingClientRect().height.toFixed(1),
                addNode: +q('.rr-ui-add-menu > summary').getBoundingClientRect().height.toFixed(1),
                layerRow: +q('.rr-ui-tree-row').getBoundingClientRect().height.toFixed(1),
                reorderMin: Math.min(...[...q('.rr-ui-tree-buttons').querySelectorAll('button')].map(button => button.getBoundingClientRect().height)),
            },
            reorderOverflow: [...q('.rr-ui-tree-buttons').querySelectorAll('button')].some(button => button.scrollWidth > button.clientWidth + 1),
            overflowElements: [['document', document.documentElement], ['detail', detail], ['editor', editor], ['toolbar', toolbar],
                ['workspace', workspace], ['layers', layers], ['layout', layout], ['inspector', inspector]]
                .filter(([, element]) => element.scrollWidth > element.clientWidth + 2)
                .map(([name, element]) => ({ name, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })),
            overlapsWide: overlaps(panelBoxes[0], panelBoxes[1]) || overlaps(panelBoxes[0], panelBoxes[2]) || overlaps(panelBoxes[1], panelBoxes[2]),
        };
    `);
}

function assertCommon(result, target) {
    const label = `${target.width}x${target.height}`;
    assert.ok(Math.abs(result.documentScroll.scrollHeight - result.documentScroll.clientHeight) <= 2, `${label}: document vertical overflow`);
    assert.ok(Math.abs(result.editorScroll.scrollHeight - result.editorScroll.clientHeight) <= 2, `${label}: editor vertical overflow`);
    assert.ok(result.detailScroll.scrollHeight <= result.detailScroll.clientHeight + 2, `${label}: detail vertical overflow`);
    assert.deepEqual(result.overflowElements, [], `${label}: horizontal overflow ${JSON.stringify({ overflow: result.overflowElements, workspace: result.workspace, inspector: result.inspector, position: result.inspectorPosition, open: result.inspectorOpen })}`);
    assert.equal(result.toolbarContained, true, `${label}: toolbar child escaped`);
    assert.equal(result.fit, 'both', `${label}: workspace fit mode`);
    assert.ok(Math.abs(result.workspace.height - result.workspaceExpectedHeight) <= 2, `${label}: workspace does not fill remaining height`);
    assert.equal(result.referenceVisible, true, `${label}: Game Reference starts below the Layers panel fold`);
    assert.ok(result.controlHeights.gameReference >= 28 && result.controlHeights.capture >= 28
        && result.controlHeights.undo >= 28 && result.controlHeights.redo >= 28, `${label}: undersized control`);
    assert.ok(result.controlHeights.addNode >= 30 && result.controlHeights.layerRow >= 30 && result.controlHeights.reorderMin >= 30,
        `${label}: layer controls are undersized`);
    assert.equal(result.reorderOverflow, false, `${label}: reorder label overflow`);
    assert.ok(result.toolbar.height >= 44 && result.toolbar.height <= (target.width === 1280 ? 70 : 56), `${label}: toolbar height ${result.toolbar.height}`);
}

async function main() {
    const nwRoot = option('nw-root') || (process.env.NWJS_SDK_ROOT ? path.resolve(process.env.NWJS_SDK_ROOT) : path.join(repoRoot, 'nwjs-linux'));
    const nw = path.join(nwRoot, 'nw');
    const chromedriver = path.join(nwRoot, 'chromedriver');
    if (!fs.existsSync(nw) || !fs.existsSync(chromedriver)) throw new Error(`NW.js SDK and matching chromedriver were not found in ${nwRoot}`);
    const nwChromium = version(nw).match(/\d+\.\d+\.\d+\.\d+/)?.[0];
    const driverChromium = version(chromedriver).match(/\d+\.\d+\.\d+\.\d+/)?.[0];
    assert.equal(nwChromium, driverChromium, 'NW.js and ChromeDriver Chromium versions differ');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-nw-ui-layout-'));
    const driver = new WebDriverClient(chromedriver, { env: { ...process.env } });
    try {
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [
            `nwapp=${editorRoot}`, `user-data-dir=${path.join(tempRoot, 'nw-profile')}`, 'no-first-run', 'no-default-browser-check'
        ] } });
        await driver.setScriptTimeout(90000);
        await driver.waitForScript('return Boolean(window.reactor?.projectController && window.reactor?.databaseManager);', [], {
            timeout: 90000, description: 'actual NW.js editor initialization'
        });
        const opened = await driver.executeAsync(`
            const projectPath = arguments[0], done = arguments[arguments.length - 1];
            (async () => {
                const app = window.reactor;
                const project = await app.projectManager.loadProject(projectPath);
                if (!project || !await app.databaseManager.loadAllData(projectPath)) throw new Error('Could not load tracked Demo');
                app.projectController.currentProject = project;
                app.projectController.projectLoaded = true;
                app.projectController.captureProjectSavedState();
                app.openDatabase('userInterfaces');
                const records = app.databaseManager.getUserInterfaces();
                app.databaseEditorUI.showDatabaseDetail(records.find(Boolean), 'userInterfaces');
                requestAnimationFrame(() => requestAnimationFrame(() => done({ name: records.find(Boolean)?.name || '', count: records.filter(Boolean).length })));
            })().catch(error => done({ error: String(error?.stack || error) }));
        `, [demoRoot]);
        assert.equal(opened.error, undefined);
        assert.ok(opened.count >= 1);

        const results = [];
        for (const target of [{ width: 1280, height: 720 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
            await resize(driver, target.width, target.height);
            await new Promise(resolve => setTimeout(resolve, 220));
            const result = await measure(driver);
            assertCommon(result, target);
            if (target.width === 1280) {
                assert.equal(result.inspectorTitle, 'Interface Settings', 'Inspector does not start in Interface Settings');
                assert.equal(result.inspectorPosition, 'absolute', '1280 Inspector is not a drawer');
                assert.equal(result.inspectorOpen, false, '1280 initial settings drawer should not cover the canvas');
                assert.equal(result.inspectorDisplay, 'none', '1280 initial settings drawer is still rendered over the canvas');
                assert.ok(result.layers.y === result.layout.y && result.layers.bottom === result.layout.bottom, '1280 Layers and Layout are not one row');
                const popup = await driver.execute(`
                    document.querySelector('.rr-ui-role-trigger').click();
                    const toolbar = document.querySelector('.rr-ui-toolbar').getBoundingClientRect();
                    const rect = document.querySelector('.rr-ui-role-popup').getBoundingClientRect();
                    return { hidden: document.querySelector('.rr-ui-role-popup').hidden, top: rect.top, bottom: rect.bottom,
                        right: rect.right, toolbarBottom: toolbar.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
                `);
                assert.equal(popup.hidden, false, 'Use As popup did not open');
                assert.ok(popup.top < popup.toolbarBottom && popup.bottom > popup.toolbarBottom
                    && popup.bottom <= popup.viewportHeight && popup.right <= popup.viewportWidth, 'Use As popup is clipped or off-screen');
                await driver.execute("window.reactor.databaseEditorUI.userInterfaceEditor.openReplacementRoles(false);");
                await driver.execute("document.querySelector('.rr-ui-tree-row[data-id]').click();");
                const selected = await measure(driver);
                assert.equal(selected.inspectorOpen, true, 'selecting a layer did not reveal the drawer');
                assert.equal(selected.inspectorDisplay, 'flex', 'selecting a layer did not render the drawer');
                assert.ok(selected.inspector.x >= selected.workspace.x && selected.inspector.right <= selected.workspace.right + 1
                    && selected.inspector.y >= selected.workspace.y && selected.inspector.bottom <= selected.workspace.bottom + 1, '1280 drawer escapes workspace');
                assert.notEqual(selected.inspectorTitle, 'Interface Settings', 'selected layer did not replace Interface Settings');
                await driver.execute("document.querySelector('.rr-ui-interface-settings').click();");
                const settings = await measure(driver);
                assert.equal(settings.inspectorOpen, true, 'Interface Settings did not reveal the drawer');
                assert.equal(settings.inspectorTitle, 'Interface Settings', 'Interface Settings did not deselect the layer');
                await driver.execute("document.querySelector('.rr-ui-inspector-close').click();");
                await new Promise(resolve => setTimeout(resolve, 220));
                const closed = await measure(driver);
                assert.equal(closed.inspectorOpen, false, '1280 drawer did not close');
                assertCommon(closed, target);
                result.closed = { inspectorOpen: closed.inspectorOpen, documentScroll: closed.documentScroll,
                    editorScroll: closed.editorScroll, inspectorVisibility: closed.inspectorVisibility };
            } else {
                assert.notEqual(result.inspectorPosition, 'absolute', `${target.width}: Inspector unexpectedly uses drawer`);
                assert.ok(result.layers.y === result.layout.y && result.layout.y === result.inspector.y, `${target.width}: panels are not one row`);
                assert.equal(result.overlapsWide, false, `${target.width}: panel overlap`);
                assert.ok(result.inspector.x >= result.layout.right - 1, `${target.width}: Inspector is not the third column`);
            }
            results.push({ target, ...result });
        }
        process.stdout.write(JSON.stringify({ chromium: nwChromium, demo: opened, results }, null, 2) + '\n');
    } finally {
        await driver.close();
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
