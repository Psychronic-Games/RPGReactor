// Real iframe bridge and editor save roundtrip on a disposable project/profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');

const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-project-tools-smoke-'));
const project = path.join(temp, 'project');
const sdk = process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux');
const driver = new WebDriverClient(path.join(sdk, 'chromedriver'));

(async () => {
    try {
        for (const directory of ['data', 'tools', 'img']) fs.mkdirSync(path.join(project, directory), { recursive: true });
        for (const [name, data] of Object.entries({
            'project.rpgreactor': { name: 'Project Tools smoke', engine: 'RPG Reactor', version: '0.98.5' },
            'data/MapInfos.json': [],
            'data/Enemies.json': [null, { id: 1, name: 'Original', note: '' }],
            'data/System.json': { versionId: 1, gameTitle: 'Project Tools smoke' }
        })) fs.writeFileSync(path.join(project, name), JSON.stringify(data));
        fs.writeFileSync(path.join(project, 'img/real.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
        fs.writeFileSync(path.join(project, 'private.txt'), 'must not be served');
        fs.symlinkSync(path.join(project, 'private.txt'), path.join(project, 'img/linked.png'));
        fs.writeFileSync(path.join(project, 'tools/Probe.html'), `<!doctype html><p>Project Tools smoke</p><script>
            addEventListener('message', event => {
                const message = event.data;
                if (message.type === 'reactor:init') {
                    let parentBlocked = false;
                    try { parent.document; } catch { parentBlocked = true; }
                    parent.postMessage({ type: 'smoke:result', sandbox: { parentBlocked, node: typeof require } }, '*');
                    message.data['Enemies.json'][1].name = 'Tool edit';
                    parent.postMessage({ type: 'reactor:save', file: 'Enemies.json', data: message.data['Enemies.json'] }, '*');
                    for (const path of ['real.png', 'linked.png']) parent.postMessage({ type: 'reactor:image', path }, '*');
                } else if (message.type === 'reactor:saved' || message.type === 'reactor:image') {
                    parent.postMessage({ type: 'smoke:result', result: message }, '*');
                }
            });
            parent.postMessage({ type: 'reactor:ready' }, '*');
        </script>`);

        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [
            `nwapp=${path.join(root, 'editor')}`, `user-data-dir=${path.join(temp, 'profile')}`, 'no-first-run'
        ] } });
        await driver.setScriptTimeout(60000);
        await driver.waitForScript('return !!window.reactor?.forgeManager;', [], { timeout: 90000 });
        const opened = await driver.executeAsync(String.raw`
            const done = arguments[arguments.length - 1];
            (async () => {
                const pc = reactor.projectController;
                const project = await pc.projectManager.loadProject(arguments[0]);
                if (!project || !pc.acquireProjectLock(project.path)) throw new Error('Could not open fixture');
                if (!await reactor.databaseManager.loadAllData(project.path)) throw new Error('Could not load database');
                pc.currentProject = project; pc.projectLoaded = true; pc.tilemapManager = null;
                pc.captureProjectSavedState();
                reactor.databaseEditorUI.setCurrentProject(project);
                reactor.databaseManager.data.enemies[1].note = 'Working note';
                window.__toolResults = [];
                addEventListener('message', event => {
                    if (event.source === reactor.forgeManager.projectTools?.frame?.contentWindow
                        && event.data?.type === 'smoke:result') __toolResults.push(event.data);
                });
                window.confirm = () => true;
                // Project Tools asks through RRDialog (9b959cee), not window.confirm.
                RRDialog.confirm = async () => true;
                reactor.forgeManager.openTool('project-tools');
                const tool = reactor.forgeManager.projectTools;
                tool._confirmAndOpen(tool._discoverTools()[0]);
                return true;
            })().then(done, error => done({ error: String(error.stack) }));
        `, [project]);
        assert.equal(opened, true);
        await driver.waitForScript('return window.__toolResults?.length === 4;', [], { timeout: 30000 });
        const results = await driver.execute('return window.__toolResults;');
        assert.deepEqual(results.find(item => item.sandbox).sandbox, { parentBlocked: true, node: 'undefined' });
        assert.equal(results.find(item => item.result?.type === 'reactor:saved').result.ok, true);
        assert.equal(results.find(item => item.result?.request === 'real.png').result.ok, true);
        assert.equal(results.find(item => item.result?.request === 'linked.png').result.ok, false);

        const saved = await driver.executeAsync(String.raw`
            const done = arguments[arguments.length - 1];
            (async () => {
                reactor.forgeManager.close();
                reactor.databaseEditorUI.openDatabase('enemies');
                document.querySelector('#database-list [data-entry-id="1"]').click();
                const field = document.querySelector('[data-field="name"][data-enemy-id="1"]');
                if (field?.value !== 'Tool edit') throw new Error('Database did not display the tool edit');
                document.getElementById('database-cancel-btn').click();
                return await reactor.projectController.saveProject();
            })().then(done, error => done({ error: String(error.stack) }));
        `);
        assert.equal(saved, true);
        const enemy = JSON.parse(fs.readFileSync(path.join(project, 'data/Enemies.json')))[1];
        assert.equal(enemy.name, 'Tool edit');
        assert.equal(enemy.note, 'Working note');
        console.log('NW.js Project Tools smoke passed: sandbox, images, database display/Cancel and normal Save.');
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
