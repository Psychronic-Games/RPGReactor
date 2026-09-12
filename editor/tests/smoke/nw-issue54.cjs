#!/usr/bin/env node
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
const evidence = option('evidence') || '/tmp/rr-issue54';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-issue54-'));
const project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(sdkRoot, 'chromedriver'));

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
            args: [`nwapp=${appRoot}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        if (option('size')) {
            const [width, height] = option('size').split('x').map(Number);
            await driver.sessionRequest('POST', '/window/rect', { width, height });
        }
        await driver.setScriptTimeout(120000);
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const opened = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            window.__interactionErrors=[];addEventListener('error',e=>__interactionErrors.push(String(e.error||e.message)));
            addEventListener('unhandledrejection',e=>__interactionErrors.push(String(e.reason)));
            const pc=reactor.projectController,loaded=await pc.projectManager.loadProject(arguments[0]);
            if(!loaded||!pc.acquireProjectLock(loaded.path))throw new Error('Could not open disposable project');
            pc.currentProject=loaded;pc.lastLoadedProjectPath=null;pc.rememberMap3DView(1,false);pc.rememberMap3DView(2,false);
            await pc.uiManager.showEditorUI();await pc.populateProjectUI();
            await pc.loadMap(1,{skipDirtyCheck:true});
            reactor.databaseEditorUI.setCurrentProject(loaded);return true;
        })().then(done,e=>done({error:String(e.stack)}));`, [project]);
        assert.equal(opened, true, JSON.stringify(opened));
        const setup = fs.readFileSync(path.join(__dirname, 'issue54-setup.js'), 'utf8');
        const result = await driver.executeAsync(setup, [{ theme: option('theme') || 'dark', language: option('language') || 'en' }]);
        if (!process.argv.includes('--probe')) {
            for (const count of [4, 40]) {
                await driver.executeAsync(`const done=arguments[arguments.length-1],host=document.createElement('div');
                    host.id='physical-dropdown';host.style.cssText='position:fixed;top:24px;left:24px;z-index:99999;width:250px;';
                    host.innerHTML='<select>'+Array.from({length:arguments[0]},(_,i)=>'<option value="'+i+'"'+(i===1?' disabled':'')+'>'+i+'</option>').join('')+'</select>';
                    document.body.appendChild(host);setTimeout(()=>{host.querySelector('.rr-shim-trigger').click();setTimeout(()=>done(true),50);},50);`, [count]);
                const down = async value => driver.sessionRequest('POST', '/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [
                    { type: 'keyDown', value }, { type: 'keyUp', value }
                ] }] });
                await down('\uE015');
                await down('\uE015');
                const open = await driver.execute('return !!document.querySelector(".rr-shim-popup");');
                result.checks.push(count + '-option dropdown survives real arrow keys');
                if (!open) result.failures.push({ name: count + '-option dropdown closes on real arrows' });
                await down('\uE007');
                const selected = await driver.execute('const host=document.getElementById("physical-dropdown"),value=host.querySelector("select").value;host.remove();return value;');
                result.checks.push(count + '-option dropdown commits the keyboard choice');
                if (selected !== '3') result.failures.push({ name: count + '-option physical keyboard selection', selected });
            }
        }
        fs.writeFileSync(evidence + '-result.json', JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result, null, 2));
        assert.equal(result.error, undefined, result.error);
        assert.deepEqual(result.errors, []);
        await driver.execute('reactor.databaseEditorUI.openDatabase("actors");reactor.databaseEditorUI._activeDatabaseList.selectIds([1],1);reactor.databaseEditorUI.actorEditor.traitEditor.showTraitEditorModal(reactor.databaseManager.data.actors[1]);');
        fs.writeFileSync(evidence + '-after.png', Buffer.from(await driver.sessionRequest('GET', '/screenshot'), 'base64'));
        if (!process.argv.includes('--probe')) assert.deepEqual(result.failures, []);
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
