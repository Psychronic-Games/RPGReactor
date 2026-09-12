#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tileset-key-'));
const project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));

(async () => {
    try {
        fs.cpSync(path.join(root, 'template/Demo'), project, { recursive: true, dereference: true });
        fs.rmSync(path.join(project, '.rpgreactor.lock'), { force: true });
        // Two flat maps sharing a tileset exercise map changes without depending on 3D assets.
        const map = JSON.parse(fs.readFileSync(path.join(project, 'data/Map001.json'), 'utf8'));
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
        if (process.argv.includes('--before')) {
            const old = execFileSync('git', ['show', 'HEAD:editor/src/database/DatabaseTilesetEditor.js'], { cwd: root, encoding: 'utf8' });
            await driver.execute(`const Old=new Function(arguments[0]+';return DatabaseTilesetEditor;')();
                for(const key of Object.getOwnPropertyNames(Old.prototype)) if(key!=='constructor') DatabaseTilesetEditor.prototype[key]=Old.prototype[key];`, [old]);
        }
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
        const result = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            const db=reactor.databaseEditorUI,dm=reactor.databaseManager,checks=[];
            const check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name);};
            const show=()=>{db.openDatabase('tilesets');db.showDatabaseDetail(dm.data.tilesets.find(t=>t&&t.id>0),'tilesets');};
            const editor=()=>db.tilesetEditor.tilesetEditor;
            const press=mode=>document.querySelector('.compact-flag-btn[data-mode="'+mode+'"]').click();
            const reset=()=>editor().currentEditMode===null&&editor().passageBrush===null
                &&document.getElementById('flag-mode-key').getBoundingClientRect().width===0
                &&[...document.querySelectorAll('.compact-flag-btn')].every(b=>b.getAttribute('aria-pressed')==='false');
            show();const before=JSON.stringify(dm.data.tilesets);
            for(const mode of ['passability','4dir','ladder','bush','counter','damage','terrain','tile3d']){
                press(mode);check(mode+' opens',editor().currentEditMode===mode&&document.getElementById('flag-mode-key').getBoundingClientRect().width>0);
                const key=document.getElementById('flag-mode-key'),box=key.getBoundingClientRect(),viewport=key.parentElement.getBoundingClientRect();
                check(mode+' key is fully visible',box.left>=viewport.left&&box.right<=viewport.right);
                press(mode);check(mode+' toggles off',reset());
                press(mode);document.querySelector('.flag-key-close').click();check(mode+' Close deselects',reset());
            }
            press('passability');document.querySelector('[data-passage-brush="x"]').click();
            check('brush selected',editor().passageBrush==='x');
            document.getElementById('database-close-btn').click();show();check('close/reopen resets',reset());
            press('tile3d');db.openDatabase('actors');show();check('section change resets',reset());
            press('ladder');const another=dm.data.tilesets.find(t=>t&&t.id!==editor().currentTileset.id);
            if(another){db.showDatabaseDetail(another,'tilesets');check('tileset change resets',reset());}
            press('passability');await reactor.projectController.loadMap(2,{skipDirtyCheck:true});
            check('map change resets with database open',reset());
            check('authored flags unchanged',JSON.stringify(dm.data.tilesets)===before);
            press('passability');return {checks,errors:__keyErrors};
        })().then(done,e=>done({error:String(e.stack)}));`);
        assert.ok(!result.error, JSON.stringify(result));
        assert.deepEqual(result.errors, []);
        fs.writeFileSync('/tmp/rr-tileset-key.png', Buffer.from(await driver.sessionRequest('GET', '/screenshot'), 'base64'));
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
