#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-navigation-'));
const project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));

(async () => {
    try {
        fs.cpSync(path.join(root, 'template/Demo'), project, { recursive: true, dereference: true });
        fs.rmSync(path.join(project, '.rpgreactor.lock'), { force: true });
        // Two flat maps sharing a tileset exercise map changes without depending on 3D assets.
        const map = JSON.parse(fs.readFileSync(path.join(project, 'data/Map001.json'), 'utf8'));
        map.width=map.height=25;map.data=new Array(25*25*6).fill(0);
        map.note = ''; map.events = [null]; delete map.reactor3d;
        for (const id of ['001', '002']) {
            fs.writeFileSync(path.join(project, `data/Map${id}.json`), JSON.stringify(map));
            fs.rmSync(path.join(project, `data/Map${id}.r3d.json`), { force: true });
        }
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            args: [`nwapp=${path.join(root, 'editor')}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        await driver.setScriptTimeout(120000);
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const opened = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            window.__keyErrors=[];addEventListener('error',e=>__keyErrors.push(String(e.error||e.message)));
            addEventListener('unhandledrejection',e=>__keyErrors.push(String(e.reason)));
            const pc=reactor.projectController,loaded=await pc.projectManager.loadProject(arguments[0]);
            if(!loaded||!pc.acquireProjectLock(loaded.path))throw new Error('Could not open disposable project');
            pc.currentProject=loaded;pc.lastLoadedProjectPath=null;pc.rememberMap3DView(1,false);pc.rememberMap3DView(2,false);
            await pc.uiManager.showEditorUI();await pc.populateProjectUI();
            await pc.loadMap(1,{skipDirtyCheck:true});
            reactor.databaseEditorUI.setCurrentProject(loaded);return true;
        })().then(done,e=>done({error:String(e.stack)}));`, [project]);
        assert.equal(opened, true, JSON.stringify(opened));
        const setup = fs.readFileSync(path.join(__dirname, 'navigation-regressions-setup.js'), 'utf8');
        const result = await driver.executeAsync(setup);
        fs.writeFileSync('/tmp/rr-navigation-result.json', JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
        assert.equal(result.error, undefined, result.error);
        assert.deepEqual(result.errors, []);
        fs.writeFileSync('/tmp/rr-navigation-after.png', Buffer.from(await driver.sessionRequest('GET', '/screenshot'), 'base64'));
        if (!process.argv.includes('--probe')) assert.deepEqual(result.failures, []);
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
