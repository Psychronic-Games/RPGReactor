#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-pr55-native-'));
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));

(async () => {
    try {
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            args: [`nwapp=${path.join(root, 'editor')}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const result = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            const checks=[],check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);};
            const errors=[];addEventListener('error',e=>errors.push(String(e.error||e.message)));
            addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
            I18n.setLanguage('en',{persist:false});
            const dm=reactor.databaseManager, db=reactor.databaseEditorUI;
            db.setCurrentProject({path:arguments[0],name:'Disposable forecast fixture'});
            const skill=(id,name,cost=0)=>({id,name,occasion:1,mpCost:cost,tpCost:0});
            const action=(id,rating)=>({skillId:id,rating,conditionType:0,conditionParam1:0,conditionParam2:0});
            dm.data.skills=[null,skill(1,'Free'),skill(2,'Costly',10),skill(3,'Never')];
            const enemy={id:1,name:'Forecast fixture',params:[100,100,10,10,10,10,10,10],actions:[action(1,4),action(2,5),action(3,1)],traits:[],dropItems:[],battlerName:'',battlerHue:0,note:'',exp:0,gold:0};
            dm.data.enemies=[null,enemy,{...structuredClone(enemy),id:2,name:'Second enemy'}];
            dm.data.system={switches:[],variables:[]};
            const authored=()=>JSON.stringify({actions:dm.data.enemies.map(e=>e?.actions),skills:dm.data.skills});
            const baseline=authored();
            let plugins=[];dm.getPluginManifest=()=>plugins;
            const wait=()=>new Promise(r=>setTimeout(r,40));
            const show=async()=>{db.openDatabase('enemies');db._activeDatabaseList.selectIds([1],1);await wait();return document.querySelector('.enemy-forecast');};
            let panel=await show();check('forecast is installed in the real enemy editor',!!panel);
            panel.open=true;await wait();
            check('classic rule states the strict rating window',panel.querySelector('.enemy-forecast-rule').textContent.includes('within 2'));
            check('classic pool contains two eligible actions',panel.querySelectorAll('.enemy-forecast-pool-list li').length===2);
            const mp=panel.querySelector('[data-forecast="mp"]');mp.value=0;mp.dispatchEvent(new Event('change',{bubbles:true}));
            check('MP what-if updates the live pool',panel.querySelectorAll('.enemy-forecast-pool-list li').length===1&&panel.querySelector('.enemy-forecast-pool').textContent.includes('Free'));
            check('what-if controls preserve authored actions and skills',authored()===baseline);
            plugins=[{name:'VisuMZ_3_BattleAI',status:true,parameters:{'General:struct':JSON.stringify({'EnemyStyleAI:str':'random','EnemyRatingVariance:num':'0'})}}];
            db.cleanupDatabaseDetail();panel=await show();
            check('random mode ignores rating and displays both affordable actions',panel.querySelectorAll('.enemy-forecast-pool-list li').length===2);
            check('non-rating modes have no rating ceiling',!panel.querySelector('.enemy-forecast-ceiling'));
            check('random mode does not label low ratings unreachable',!panel.querySelector('.enemy-forecast-dead'));
            plugins[0].parameters['General:struct']=JSON.stringify({'EnemyStyleAI:str':'gambit','EnemyRatingVariance:num':'0'});
            db.cleanupDatabaseDetail();panel=await show();
            check('gambit selects the first affordable action',panel.querySelectorAll('.enemy-forecast-pool-list li').length===1&&panel.querySelector('.enemy-forecast-pool').textContent.includes('Free'));
            check('gambit explains priority rather than rating',panel.querySelector('.enemy-forecast-dead').textContent.includes('first valid action wins'));
            for(let i=0;i<6;i++)db._activeDatabaseList.selectIds([i%2+1],i%2+1);
            await wait();
            check('rapid revisits leave one live forecast',document.querySelectorAll('.enemy-forecast').length===1);
            document.getElementById('database-cancel-btn').click();await wait();
            check('Cancel retires the forecast',!document.querySelector('.enemy-forecast'));
            check('forecast and navigation preserve actions and skills',authored()===baseline);
            return {checks,errors};
        })().then(done,e=>done({error:String(e.stack)}));`, [temp]);
        console.log(JSON.stringify(result, null, 2));
        assert.equal(result.error, undefined, result.error);
        assert.deepEqual(result.errors, []);
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
