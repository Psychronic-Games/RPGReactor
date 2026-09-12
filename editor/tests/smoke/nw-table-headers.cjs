#!/usr/bin/env node
/**
 * Screenshots of Database tables in dark and light themes, so column-header
 * styling can be judged by eye. Writes <evidence>-<theme>-<section>.png and
 * checks that header cells use the panel surface with no accent strip.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const sdkOption = process.argv.find(argument => argument.startsWith('--nw-root='));
const sdkRoot = path.resolve(sdkOption?.slice('--nw-root='.length) || process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux'));
const option = name => process.argv.find(argument => argument.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const appRoot = path.resolve(option('app-root') || path.join(root, 'editor'));
const evidence = option('evidence') || '/tmp/rr-table-headers';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-table-headers-'));
const project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(sdkRoot, 'chromedriver'));

(async () => {
    try {
        fs.cpSync(path.join(root, 'template/Demo'), project, { recursive: true, dereference: true });
        fs.rmSync(path.join(project, '.rpgreactor.lock'), { force: true });
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            args: [`nwapp=${appRoot}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        const [width, height] = (option('size') || '1600x900').split('x').map(Number);
        await driver.sessionRequest('POST', '/window/rect', { width, height });
        await driver.setScriptTimeout(120000);
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const opened = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error||e.message)));
            const pc=reactor.projectController,loaded=await pc.projectManager.loadProject(arguments[0]);
            if(!loaded||!pc.acquireProjectLock(loaded.path))throw new Error('Could not open disposable project');
            pc.currentProject=loaded;pc.lastLoadedProjectPath=null;pc.rememberMap3DView(1,false);
            await pc.uiManager.showEditorUI();await pc.populateProjectUI();
            await pc.loadMap(1,{skipDirtyCheck:true});
            reactor.databaseEditorUI.setCurrentProject(loaded);return true;
        })().then(done,e=>done({error:String(e.stack)}));`, [project]);
        assert.equal(opened, true, JSON.stringify(opened));
        const pause = ms => driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),arguments[0]);', [ms]);
        const themes = (option('themes') || 'dark,light,ocean-light').split(',');
        const sections = (option('sections') || 'actors,classes,skills,items').split(',');
        const results = [];
        for (const theme of themes) {
            await driver.execute('reactor.optionsManager.applyTheme(arguments[0]);', [theme]);
            for (const section of sections) {
                await driver.execute(`reactor.databaseEditorUI.openDatabase(arguments[0]);const list=reactor.databaseEditorUI._activeDatabaseList;if(list)list.selectIds([1],1);
                    reactor.databaseEditorUI.showDatabaseDetail(reactor.databaseManager.data[arguments[0]][1],arguments[0]);`, [section]);
                await pause(400);
                const info = await driver.execute(`
                    const heads=[...document.querySelectorAll('#database-viewer .traits-table th')].filter(th=>th.getClientRects().length&&!th.classList.contains('trait-indicator-heading')&&th.textContent.trim());
                    const first=heads[0];const cell=document.querySelector('#database-viewer .traits-table td');
                    const cs=first?getComputedStyle(first):null,ds=cell?getComputedStyle(cell):null;
                    return {theme:arguments[0],section:arguments[1],headers:heads.length,text:first?.textContent,
                        headerBackground:cs?.backgroundColor,cellBackground:ds?.backgroundColor,headerShadow:cs?.boxShadow,transform:cs?.textTransform,weight:cs?.fontWeight};`, [theme, section]);
                results.push(info);
                fs.writeFileSync(`${evidence}-${theme}-${section}.png`, Buffer.from(await driver.sessionRequest('GET', '/screenshot'), 'base64'));
                console.log(JSON.stringify(info));
                if (info.headers) {
                    assert.notEqual(info.headerBackground, info.cellBackground, `${theme}/${section}: header must differ from cells`);
                    assert.doesNotMatch(info.headerShadow || '', /inset/, `${theme}/${section}: header carries no strip`);
                    assert.equal(info.transform, 'uppercase');
                }
            }
            await driver.execute(`document.querySelector('#database-cancel-btn').click();`);
        }
        await driver.execute('reactor.optionsManager.applyTheme("dark");');
        const errors = await driver.execute('return __errors;');
        fs.writeFileSync(`${evidence}-result.json`, JSON.stringify({ results, errors }, null, 2));
        assert.deepEqual(errors, []);
        assert.ok(results.some(r => r.headers > 0), 'at least one table was measured');
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
